import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  _private,
} from "../plugin/index.js";

const execFile = promisify(childProcess.execFile);

test("track distance uses nautical miles", () => {
  const nm = _private.trackDistanceNm([
    { lat: 56.0, lon: -5.0, ts: "2026-06-22T00:00:00.000Z" },
    { lat: 56.00833, lon: -5.0, ts: "2026-06-22T00:10:00.000Z" },
  ]);
  assert.ok(nm > 0.49 && nm < 0.51);
});

test("chooses the context with most position samples as own vessel", () => {
  const counts = new Map([
    ["vessels.target", 4],
    ["vessels.self", 10],
  ]);
  assert.equal(_private.chooseOwnContext(counts), "vessels.self");
});

test("hourly markers use nearest track point", () => {
  const markers = _private.hourlyMarkers([
    { lat: 56.0, lon: -5.0, ts: "2026-06-22T12:30:00.000Z" },
    { lat: 56.1, lon: -5.1, ts: "2026-06-22T13:02:00.000Z" },
    { lat: 56.2, lon: -5.2, ts: "2026-06-22T14:01:00.000Z" },
  ]);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].label, "13:00");
  assert.equal(markers[0].lat, 56.1);
});

test("generates GPX 1.1 track with escaped metadata", () => {
  const gpx = _private.generateGpx({
    id: "voyage-&-test",
    fileName: "voyage-test.zip",
    comment: "Craobh < Oban",
    summary: {
      startedAt: "2026-06-22T12:00:00.000Z",
      stoppedAt: "2026-06-22T13:00:00.000Z",
      distanceNm: 6.25,
    },
    track: [
      { lat: 56.123456789, lon: -5.123456789, ts: "2026-06-22T12:00:00.000Z" },
      { lat: 56.223456789, lon: -5.223456789, ts: "2026-06-22T13:00:00.000Z" },
    ],
  });
  assert.match(gpx, /<gpx version="1.1"/);
  assert.match(gpx, /<name>voyage-&amp;-test<\/name>/);
  assert.match(gpx, /Craobh &lt; Oban/);
  assert.match(gpx, /<trkpt lat="56.1234568" lon="-5.1234568"><time>2026-06-22T12:00:00.000Z<\/time><\/trkpt>/);
});

test("GPX filename prefers voyage comment", () => {
  assert.equal(
    _private.defaultGpxFileName({ comment: "Craobh to Oban & back" }, "voyage-20260622.zip"),
    "Craobh-to-Oban-back.gpx",
  );
  assert.equal(
    _private.defaultGpxFileName({ comment: "" }, "voyage-20260622.zip"),
    "voyage-20260622.gpx",
  );
  assert.equal(
    _private.defaultGpxFileName({ comment: "" }, "capture-20260622T120000Z.jsonl.gz"),
    "capture-20260622T120000Z.gpx",
  );
});

test("voyage list includes comment from bundle index", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-list-"));
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-bundle-"));
  await fs.writeFile(
    path.join(bundleDir, "index.json"),
    JSON.stringify({
      comment: "Evening engine test",
      startedAt: "2026-06-22T19:57:47.000Z",
      stoppedAt: "2026-06-22T20:09:00.000Z",
    }),
  );
  const zipPath = path.join(dir, "voyage-20260622T195747Z.zip");
  await execFile("zip", ["-q", "-j", zipPath, path.join(bundleDir, "index.json")]);

  const voyages = await _private.listVoyages(dir);
  assert.equal(voyages.length, 1);
  assert.equal(voyages[0].fileName, "voyage-20260622T195747Z.zip");
  assert.equal(voyages[0].comment, "Evening engine test");
  assert.equal(voyages[0].startedAt, "2026-06-22T19:57:47.000Z");
  assert.equal(voyages[0].stoppedAt, "2026-06-22T20:09:00.000Z");
});

test("analyses reference-mode voyage bundles from AJRM Marine Logger files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-reference-"));
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-reference-bundle-"));
  const logFile = path.join(dir, "capture-2026-06-22T120000Z.jsonl");
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(logFile, records.map((record) => JSON.stringify(record)).join("\n"));
  await fs.writeFile(
    path.join(bundleDir, "index.json"),
    JSON.stringify({
      id: "voyage-20260622T120000Z",
      comment: "Reference voyage",
      startedAt: "2026-06-22T12:00:00.000Z",
      stoppedAt: "2026-06-22T12:10:00.000Z",
      captureFiles: [],
      captureReferences: [
        {
          fileName: path.basename(logFile),
          sourcePath: logFile,
          from: "2026-06-22T12:00:00.000Z",
          to: "2026-06-22T12:10:00.000Z",
        },
      ],
    }),
  );
  const zipPath = path.join(dir, "voyage-20260622T120000Z.zip");
  await execFile("zip", ["-q", "-j", zipPath, path.join(bundleDir, "index.json")]);

  const analysis = await _private.analyseVoyage(zipPath, {
    maxTrackPoints: 100,
    options: { logDirectory: dir },
  });
  assert.equal(analysis.sourceKind, "voyages");
  assert.equal(analysis.summary.trackPoints, 2);
  assert.ok(analysis.summary.distanceNm > 0.49 && analysis.summary.distanceNm < 0.51);
});

test("analyses bundled DR track overlay samples", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-dr-track-"));
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-dr-track-bundle-"));
  const logFile = path.join(dir, "capture-2026-06-22T120000Z.jsonl");
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(logFile, records.map((record) => JSON.stringify(record)).join("\n"));
  await fs.mkdir(path.join(bundleDir, "tracks"), { recursive: true });
  await fs.writeFile(
    path.join(bundleDir, "tracks", "dr-track.jsonl"),
    [
      {
        ts: "2026-06-22T12:00:00.000Z",
        trust: "normal",
        acceptedGps: true,
        gps: { lat: 56.0, lon: -5.0 },
        operational: { lat: 56.0, lon: -5.0, source: "gps-locked" },
      },
      {
        ts: "2026-06-22T12:05:00.000Z",
        trust: "lost",
        acceptedGps: false,
        operational: { lat: 56.004, lon: -5.0, source: "heading-stw-current" },
      },
      {
        ts: "2026-06-22T12:10:00.000Z",
        trust: "normal",
        acceptedGps: true,
        gps: { lat: 56.00833, lon: -5.0 },
        operational: { lat: 56.00833, lon: -5.0, source: "gps-locked" },
        integrity: { lat: 56.007, lon: -5.0, source: "cog-sog" },
      },
    ].map((record) => JSON.stringify(record)).join("\n"),
  );
  await fs.writeFile(
    path.join(bundleDir, "index.json"),
    JSON.stringify({
      id: "voyage-20260622T120000Z",
      startedAt: "2026-06-22T12:00:00.000Z",
      stoppedAt: "2026-06-22T12:10:00.000Z",
      captureFiles: [],
      captureReferences: [{ fileName: path.basename(logFile), sourcePath: logFile }],
      drTrack: { fileName: "tracks/dr-track.jsonl" },
    }),
  );
  const zipPath = path.join(dir, "voyage-20260622T120000Z.zip");
  await execFile("zip", ["-q", "-r", zipPath, "index.json", "tracks"], { cwd: bundleDir });

  const analysis = await _private.analyseVoyage(zipPath, {
    maxTrackPoints: 100,
    options: { logDirectory: dir },
  });
  assert.equal(analysis.drTracks.source, "bundle");
  assert.equal(analysis.drTracks.operational.length, 3);
  assert.equal(analysis.drTracks.gps.length, 2);
  assert.equal(analysis.drTracks.integrity.length, 1);
  assert.equal(analysis.drTracks.recoveryJumps.length, 1);
  assert.ok(analysis.drTracks.recoveryJumps[0].meters > 400);
});

test("analyses bundled DR plot fixes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-dr-fixes-"));
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-dr-fixes-bundle-"));
  const logFile = path.join(dir, "capture-2026-06-22T120000Z.jsonl");
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(logFile, records.map((record) => JSON.stringify(record)).join("\n"));
  await fs.mkdir(path.join(bundleDir, "tracks"), { recursive: true });
  await fs.writeFile(
    path.join(bundleDir, "tracks", "dr-plot-fixes.json"),
    JSON.stringify({
      schemaVersion: 1,
      plotFixes: [
        {
          id: "fix-one",
          timestamp: "2026-06-22T12:05:00.000Z",
          automatic: true,
          plotType: "gps-lost",
          position: { latitude: 56.004, longitude: -5.001 },
          trust: "lost",
          drSource: "heading-stw-current",
          uncertaintyRadiusMeters: 42,
          stwMps: 1.5,
          headingTrueDegrees: 90,
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(bundleDir, "index.json"),
    JSON.stringify({
      id: "voyage-20260622T120000Z",
      startedAt: "2026-06-22T12:00:00.000Z",
      stoppedAt: "2026-06-22T12:10:00.000Z",
      captureFiles: [],
      captureReferences: [{ fileName: path.basename(logFile), sourcePath: logFile }],
      drPlotFixes: { fileName: "tracks/dr-plot-fixes.json" },
    }),
  );
  const zipPath = path.join(dir, "voyage-20260622T120000Z.zip");
  await execFile("zip", ["-q", "-r", zipPath, "index.json", "tracks"], { cwd: bundleDir });

  const analysis = await _private.analyseVoyage(zipPath, {
    maxTrackPoints: 100,
    options: { logDirectory: dir },
  });
  assert.equal(analysis.drPlotFixes.source, "bundle");
  assert.equal(analysis.drPlotFixes.plotFixes.length, 1);
  assert.equal(analysis.drPlotFixes.plotFixes[0].id, "fix-one");
  assert.equal(analysis.drPlotFixes.plotFixes[0].lat, 56.004);
  assert.equal(analysis.drPlotFixes.plotFixes[0].plotType, "gps-lost");
});

test("analyses raw AJRM Marine Logger jsonl recordings", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-"));
  const file = path.join(dir, "capture-20260622T120000Z.jsonl");
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(file, records.map((record) => JSON.stringify(record)).join("\n"));
  const analysis = await _private.analyseRecording(file, { kind: "logs", maxTrackPoints: 100 });
  assert.equal(analysis.sourceKind, "logs");
  assert.equal(analysis.fileName, "capture-20260622T120000Z.jsonl");
  assert.equal(analysis.summary.trackPoints, 2);
  assert.ok(analysis.summary.distanceNm > 0.49 && analysis.summary.distanceNm < 0.51);
  assert.match(analysis.gpxUrl, /\/files\/logs\/capture-20260622T120000Z\.jsonl\/track\.gpx$/);
});

test("caches plot analysis beside the source recording", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-cache-"));
  const fileName = "capture-20260622T120000Z.jsonl";
  const file = path.join(dir, fileName);
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(file, records.map((record) => JSON.stringify(record)).join("\n"));
  const options = {
    voyageDirectory: dir,
    logDirectory: dir,
    clipDirectory: dir,
  };
  const first = await _private.analyseFileSource("logs", fileName, options, 100);
  assert.equal(first.cache, undefined);
  const cachePath = _private.plotCachePath(file);
  const stat = await fs.stat(cachePath);
  assert.ok(stat.size > 0);
  const second = await _private.analyseFileSource("logs", fileName, options, 100);
  assert.equal(second.cache.hit, true);
  assert.equal(second.summary.trackPoints, 2);
});

test("accepts legacy plot cache sidecars", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-cache-legacy-"));
  const fileName = "capture-20260622T120000Z.jsonl";
  const file = path.join(dir, fileName);
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(file, records.map((record) => JSON.stringify(record)).join("\n"));
  const options = {
    voyageDirectory: dir,
    logDirectory: dir,
    clipDirectory: dir,
  };
  const first = await _private.analyseFileSource("logs", fileName, options, 100);
  const cachePath = _private.plotCachePath(file);
  const legacyPath = _private.legacyPlotCachePath(file);
  const cache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  cache.schema = ["watch", "keeper.plot-cache.v1"].join("");
  await fs.rm(cachePath);
  await fs.writeFile(legacyPath, `${JSON.stringify(cache)}\n`);
  const second = await _private.analyseFileSource("logs", fileName, options, 100);
  assert.equal(first.summary.trackPoints, 2);
  assert.equal(second.cache.hit, true);
  assert.equal(second.summary.trackPoints, 2);
});

test("web app exposes DR plot-fix overlay controls", async () => {
  const html = await fs.readFile(path.join(process.cwd(), "public", "index.html"), "utf8");
  const app = await fs.readFile(path.join(process.cwd(), "public", "app.js"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "public", "styles.css"), "utf8");

  assert.match(html, /id="toggleDrFixes"/);
  assert.match(app, /function renderDrPlotFixes/);
  assert.match(app, /className: `plot-fix-symbol-marker/);
  assert.match(app, /className: "plot-fix-label-marker"/);
  assert.match(app, /iconSize: \[28, 28\]/);
  assert.match(app, /iconAnchor: \[14, 14\]/);
  assert.match(css, /\.plot-fix-symbol-marker\.estimated-position \.plot-fix-symbol/);
});

function captureRecord(timestamp, latitude, longitude, sogKnots) {
  return {
    capturedAt: timestamp,
    delta: {
      context: "vessels.self",
      updates: [
        {
          timestamp,
          values: [
            {
              path: "navigation.position",
              value: { latitude, longitude },
            },
            {
              path: "navigation.speedOverGround",
              value: sogKnots / 1.9438444924406046,
            },
          ],
        },
      ],
    },
  };
}
