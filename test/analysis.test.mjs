import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  _private,
} from "../plugin/index.js";

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
  await writeZip(zipPath, bundleDir, ["index.json"]);

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
  await writeZip(zipPath, bundleDir, ["index.json"]);

  const analysis = await _private.analyseVoyage(zipPath, {
    maxTrackPoints: 100,
    options: { logDirectory: dir },
  });
  assert.equal(analysis.sourceKind, "voyages");
  assert.equal(analysis.summary.trackPoints, 2);
  assert.ok(analysis.summary.distanceNm > 0.49 && analysis.summary.distanceNm < 0.51);
});

test("summarises GPS Integrity events from captured Signal K state", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-gps-integrity-"));
  const logFile = path.join(dir, "capture-2026-06-22T120000Z.jsonl");
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    gpsIntegrityRecord("2026-06-22T12:00:00.000Z", {
      trust: "normal",
      acceptedGps: true,
      counters: { evaluations: 1, acceptedFixes: 1, rejectedFixes: 0, positionJumps: 0, lostFixes: 0, degradedSignals: 0, drDiscrepancies: 0 },
    }),
    captureRecord("2026-06-22T12:01:00.000Z", 56.001, -5.0, 2),
    gpsIntegrityRecord("2026-06-22T12:01:00.000Z", {
      trust: "lost",
      acceptedGps: false,
      reasons: ["GPS source reports no fix."],
      gps: { fixValid: false, explicitGpsUnavailable: true, positionAgeSeconds: null },
      counters: { evaluations: 2, acceptedFixes: 1, rejectedFixes: 0, positionJumps: 0, lostFixes: 1, degradedSignals: 0, drDiscrepancies: 0 },
      operationalDeadReckoning: { position: { latitude: 56.001, longitude: -5 }, source: "heading-stw-current", uncertaintyRadiusMeters: 40, ageSeconds: 60 },
    }),
    gpsIntegrityRecord("2026-06-22T12:03:00.000Z", {
      trust: "normal",
      acceptedGps: true,
      gps: { fixValid: true, positionAgeSeconds: 0 },
      counters: { evaluations: 3, acceptedFixes: 2, rejectedFixes: 0, positionJumps: 0, lostFixes: 1, degradedSignals: 0, drDiscrepancies: 0 },
      operationalDeadReckoning: { position: { latitude: 56.003, longitude: -5 }, source: "gps-locked", uncertaintyRadiusMeters: 10, ageSeconds: 0 },
    }),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
    gpsIntegrityRecord("2026-06-22T12:10:00.000Z", {
      trust: "suspect",
      acceptedGps: false,
      reasons: ["Position jump implies 486.4 kn over ground."],
      counters: { evaluations: 4, acceptedFixes: 2, rejectedFixes: 1, positionJumps: 1, lostFixes: 1, degradedSignals: 0, drDiscrepancies: 1 },
      diagnostics: {
        contract: "ajrm-marine-gps-integrity-diagnostics",
        decision: { positionJumpRejected: true, drDiscrepancyActive: true },
        thresholds: { gpsLostSeconds: 15, warningDrDiscrepancyMeters: 50, alarmDrDiscrepancyMeters: 150 },
      },
      operationalDeadReckoning: { position: { latitude: 56.008, longitude: -5 }, source: "gps-locked", uncertaintyRadiusMeters: 75, ageSeconds: 0 },
      integrityDeadReckoning: { position: { latitude: 56.007, longitude: -5 }, source: "heading-stw-current", uncertaintyRadiusMeters: 95, ageSeconds: 300 },
    }),
  ];
  await fs.writeFile(logFile, records.map((record) => JSON.stringify(record)).join("\n"));

  const analysis = await _private.analyseRecording(logFile, { maxTrackPoints: 100 });

  assert.equal(analysis.gpsIntegrity.samples, 4);
  assert.equal(analysis.summary.gpsIntegrity.available, true);
  assert.equal(analysis.summary.gpsIntegrity.lostFixes, 1);
  assert.equal(analysis.summary.gpsIntegrity.lostPeriods, 1);
  assert.equal(analysis.summary.gpsIntegrity.totalLostSeconds, 120);
  assert.equal(analysis.summary.gpsIntegrity.positionJumps, 1);
  assert.equal(analysis.summary.gpsIntegrity.rejectedFixes, 1);
  assert.equal(analysis.summary.gpsIntegrity.drDiscrepancies, 1);
  assert.equal(analysis.summary.gpsIntegrity.maxOperationalUncertaintyMeters, 75);
  assert.ok(analysis.gpsIntegrity.events.some((event) => event.type === "gps-lost"));
  assert.ok(analysis.gpsIntegrity.events.some((event) => event.type === "gps-recovered"));
  assert.ok(analysis.gpsIntegrity.events.some((event) => event.type === "position-jump"));
});

test("builds English voyage review with separate software and voyage-data lights", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-review-"));
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "voyage-viewer-review-bundle-"));
  const logFile = path.join(dir, "capture-2026-06-22T120000Z.jsonl");
  const records = [
    captureRecord("2026-06-22T12:00:00.000Z", 56.0, -5.0, 2),
    gpsIntegrityRecord("2026-06-22T12:00:00.000Z", {
      trust: "normal",
      acceptedGps: true,
      counters: { evaluations: 1, acceptedFixes: 1, rejectedFixes: 0, positionJumps: 0, lostFixes: 0, degradedSignals: 0, drDiscrepancies: 0 },
    }),
    trafficProjectionRecord("2026-06-22T12:02:00.000Z", [
      trafficEvent({
        eventId: "traffic-advisory-111-1",
        label: "Traffic advisory",
        title: "HARBOUR TUG",
        mmsi: "235900001",
        message: "Traffic advisory. Medium vessel HARBOUR TUG at 10 o'clock. CPA will be ahead. 150 meters in 7 minutes.",
        facts: ["medium", "10 o'clock"],
      }),
      trafficEvent({
        eventId: "traffic-collision-222-1",
        label: "Collision alarm",
        title: "FAST FERRY ONE",
        mmsi: "235900002",
        message: "Collision alarm. Large vessel FAST FERRY ONE at 12 o'clock. Risk of collision. CPA 80 meters in 2 minutes.",
        facts: ["large", "12 o'clock"],
        priority: "danger",
      }),
    ]),
    trafficProjectionRecord("2026-06-22T12:03:00.000Z", [
      trafficEvent({
        eventId: "traffic-collision-222-1",
        label: "Collision alarm",
        title: "FAST FERRY ONE",
        mmsi: "235900002",
        message: "Collision alarm. Large vessel FAST FERRY ONE at 12 o'clock. Risk of collision. CPA 80 meters in 2 minutes.",
        facts: ["large", "12 o'clock"],
        priority: "danger",
      }),
    ]),
    captureRecord("2026-06-22T12:10:00.000Z", 56.00833, -5.0, 3),
  ];
  await fs.writeFile(logFile, records.map((record) => JSON.stringify(record)).join("\n"));
  await fs.mkdir(path.join(bundleDir, "system", "bite-reports"), { recursive: true });
  await fs.writeFile(
    path.join(bundleDir, "system", "bite-reports", "run-all.json"),
    JSON.stringify({
      reports: [
        {
          scenario: "traffic-audio-chain",
          title: "Traffic audio chain",
          result: "fail",
          summary: "Traffic audio chain failed.",
          assertions: [
            { id: "traffic-alert", pass: true },
            { id: "audio-accepted", pass: false },
          ],
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(bundleDir, "index.json"),
    JSON.stringify({
      id: "voyage-20260622T120000Z",
      comment: "Review test",
      startedAt: "2026-06-22T12:00:00.000Z",
      stoppedAt: "2026-06-22T12:10:00.000Z",
      captureFiles: [],
      captureReferences: [{ fileName: path.basename(logFile), sourcePath: logFile }],
    }),
  );
  const zipPath = path.join(dir, "voyage-20260622T120000Z.zip");
  await writeZip(zipPath, bundleDir, ["index.json", "system/bite-reports/run-all.json"]);

  const analysis = await _private.analyseVoyage(zipPath, {
    maxTrackPoints: 100,
    options: { logDirectory: dir },
  });

  assert.equal(analysis.review.softwareStatus, "red");
  assert.equal(analysis.review.voyageStatus, "amber");
  assert.equal(analysis.review.bite.failed, 1);
  assert.equal(analysis.traffic.vesselsEncountered, 2);
  assert.equal(analysis.traffic.bySize.medium, 1);
  assert.equal(analysis.traffic.bySize.large, 1);
  assert.equal(analysis.traffic.advisories, 1);
  assert.equal(analysis.traffic.collisionAlerts, 1);
  assert.equal(analysis.traffic.closestCpaMeters, 80);
  assert.match(analysis.review.headline, /Software RED, voyage data AMBER/);
  assert.ok(analysis.review.paragraphs.some((paragraph) => paragraph.includes("Review test")));
  assert.ok(analysis.review.paragraphs.some((paragraph) => paragraph.includes("deliberately inject")));
  assert.ok(analysis.review.paragraphs.some((paragraph) => paragraph.includes("2 vessels encountered")));
  assert.ok(analysis.review.findings.some((finding) => finding.category === "software" && finding.level === "red"));
  assert.ok(analysis.review.findings.some((finding) => finding.category === "voyage"));
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
  await writeZip(zipPath, bundleDir, ["index.json", "tracks/dr-track.jsonl"]);

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
  await writeZip(zipPath, bundleDir, ["index.json", "tracks/dr-plot-fixes.json"]);

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
  assert.match(html, /id="reviewSelected"/);
  assert.match(html, /id="reviewPanel"/);
  assert.match(app, /function renderDrPlotFixes/);
  assert.match(app, /function renderReview/);
  assert.match(app, /reviewLight\("Software"/);
  assert.match(app, /reviewLight\("Voyage data"/);
  assert.match(app, /className: `plot-fix-symbol-marker/);
  assert.match(app, /className: "plot-fix-label-marker"/);
  assert.match(app, /iconSize: \[28, 28\]/);
  assert.match(app, /iconAnchor: \[14, 14\]/);
  assert.match(app, /if \(fix\.plotType === "gps-return"\) return "GPS fix"/);
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

function gpsIntegrityRecord(timestamp, state) {
  return {
    capturedAt: timestamp,
    delta: {
      context: "vessels.self",
      updates: [
        {
          timestamp,
          values: [
            {
              path: "plugins.ajrmMarineGpsIntegrity.navigationIntegrity",
              value: {
                timestamp,
                gps: { fixValid: true, positionAgeSeconds: 0, ...(state.gps || {}) },
                reasons: [],
                ...state,
              },
            },
          ],
        },
      ],
    },
  };
}

function trafficProjectionRecord(timestamp, active) {
  return {
    capturedAt: timestamp,
    delta: {
      context: "vessels.self",
      updates: [
        {
          timestamp,
          values: [
            {
              path: "plugins.ajrmMarineNotifications",
              value: {
                contract: "notifications-plus-projection",
                serverTime: timestamp,
                active,
                recentActivity: [],
              },
            },
          ],
        },
      ],
    },
  };
}

function trafficEvent({ eventId, label, title, mmsi, message, facts = [], priority = "warning" }) {
  return {
    provider: "ajrm-marine-traffic",
    eventId,
    timestamp: "2026-06-22T12:02:00.000Z",
    priority: { level: priority, score: priority === "danger" ? 800 : 500 },
    presentation: {
      title,
      label,
      message,
      audioMessage: message,
      category: "cpa",
      facts,
    },
    context: {
      mmsi,
      targetContext: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
    },
  };
}

async function writeZip(zipPath, rootDir, relativePaths) {
  const zip = new AdmZip();
  for (const relativePath of relativePaths) {
    const zipPathName = relativePath.split(path.sep).join("/");
    const data = await fs.readFile(path.join(rootDir, relativePath));
    zip.addFile(zipPathName, data);
  }
  zip.writeZip(zipPath);
}
