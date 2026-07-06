"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { Readable } = require("node:stream");
const zlib = require("node:zlib");
const AdmZip = require("adm-zip");
const packageInfo = require("../package.json");

const MPS_TO_KNOTS = 1.9438444924406046;
const METERS_TO_NM = 1 / 1852;
const DEFAULT_LOG_ROOT = "~/AJRMMarineLogs";
const DEFAULT_VOYAGE_DIRECTORY = `${DEFAULT_LOG_ROOT}/voyages`;
const DEFAULT_LOG_DIRECTORY = `${DEFAULT_LOG_ROOT}/captures`;
const DEFAULT_CLIP_DIRECTORY = `${DEFAULT_LOG_ROOT}/clips`;
const LEGACY_LOG_ROOT = ["~/Capture", "PlusLogs"].join("");
const LEGACY_VOYAGE_DIRECTORY = `${LEGACY_LOG_ROOT}/voyages`;
const LEGACY_LOG_DIRECTORY = `${LEGACY_LOG_ROOT}/captures`;
const LEGACY_CLIP_DIRECTORY = `${LEGACY_LOG_ROOT}/clips`;
const MAX_TRACK_POINTS = 6000;
const PLOT_CACHE_SCHEMA = "ajrm-marine.plot-cache.v1";
const LEGACY_PLOT_CACHE_SCHEMA = ["watch", "keeper.plot-cache.v1"].join("");
const AJRM_MARINE_GPS_INTEGRITY_STATE_PATH = "plugins.ajrmMarineGpsIntegrity.navigationIntegrity";
const DR_TRACK_RELATIVE_PATH = "tracks/dr-track.jsonl";
const DR_PLOT_FIXES_RELATIVE_PATH = "tracks/dr-plot-fixes.json";

module.exports = function ajrmMarineVoyageViewer(app) {
  const plugin = {};
  let options = normalizeOptions({});

  plugin.id = "signalk-ajrm-marine-voyage-viewer";
  plugin.name = "AJRM Marine Voyage Viewer";
  plugin.description =
    "Maps recorded AJRM Marine Capture voyage tracks and summary statistics.";

  plugin.schema = {
    type: "object",
    properties: {
      voyageDirectory: {
        type: "string",
        title: "Voyage bundle directory",
        default: DEFAULT_VOYAGE_DIRECTORY,
      },
      logDirectory: {
        type: "string",
        title: "AJRM Marine Logger logs directory",
        default: DEFAULT_LOG_DIRECTORY,
      },
      clipDirectory: {
        type: "string",
        title: "AJRM Marine Logger clips directory",
        default: DEFAULT_CLIP_DIRECTORY,
      },
      maxTrackPoints: {
        type: "integer",
        title: "Maximum plotted track points",
        default: MAX_TRACK_POINTS,
        minimum: 500,
        maximum: 50000,
      },
    },
  };

  plugin.start = (pluginOptions = {}) => {
    options = normalizeOptions(pluginOptions);
    app.setPluginStatus(`Started v${packageInfo.version}`);
  };

  plugin.stop = () => {};

  plugin.registerWithRouter = function registerWithRouter(router) {
    router.get("/status", (_req, res) => {
      res.json({
        ok: true,
        version: packageInfo.version,
        voyageDirectory: options.voyageDirectory,
        logDirectory: options.logDirectory,
        clipDirectory: options.clipDirectory,
      });
    });

    router.get("/voyages", async (_req, res) => {
      try {
        res.json({ ok: true, voyages: await listVoyages(options.voyageDirectory) });
      } catch (error) {
        app.error(`[${plugin.id}] list voyages failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/files/:kind", async (req, res) => {
      try {
        const kind = safeFileKind(req.params.kind);
        res.json({ ok: true, kind, files: await listFilesForKind(kind, options) });
      } catch (error) {
        app.error(`[${plugin.id}] list files failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/files/:kind/:file/download", async (req, res) => {
      try {
        const kind = safeFileKind(req.params.kind);
        const file = safeFileNameForKind(kind, req.params.file);
        const filePath = path.join(directoryForKind(kind, options), file);
        await assertReadableFile(filePath);
        res.download(filePath, file);
      } catch (error) {
        app.error(`[${plugin.id}] download failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/charts", async (_req, res) => {
      try {
        if (!app.resourcesApi?.listResources) {
          throw new Error("Signal K resources API is not available.");
        }
        const charts = await app.resourcesApi.listResources("charts", {});
        res.json({ ok: true, charts: charts || {} });
      } catch (error) {
        app.error(`[${plugin.id}] chart resource list failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.post("/voyages/:file/analyse", async (req, res) => {
      try {
        const file = safeVoyageFile(req.params.file);
        const analysis = await analyseFileSource("voyages", file, options, options.maxTrackPoints);
        res.json({ ok: true, analysis });
      } catch (error) {
        app.error(`[${plugin.id}] analyse failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.post("/files/:kind/:file/analyse", async (req, res) => {
      try {
        const kind = safeFileKind(req.params.kind);
        const file = safeFileNameForKind(kind, req.params.file);
        const analysis = await analyseFileSource(kind, file, options, options.maxTrackPoints);
        res.json({ ok: true, analysis });
      } catch (error) {
        app.error(`[${plugin.id}] analyse file failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/voyages/:file/track.gpx", async (req, res) => {
      try {
        const file = safeVoyageFile(req.params.file);
        await sendGpxForSource(res, "voyages", file, options);
      } catch (error) {
        app.error(`[${plugin.id}] GPX export failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/files/:kind/:file/track.gpx", async (req, res) => {
      try {
        const kind = safeFileKind(req.params.kind);
        const file = safeFileNameForKind(kind, req.params.file);
        await sendGpxForSource(res, kind, file, options);
      } catch (error) {
        app.error(`[${plugin.id}] file GPX export failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });
  };

  return plugin;
};

function normalizeOptions(value = {}) {
  return {
    voyageDirectory: String(value.voyageDirectory || defaultDirectory(DEFAULT_VOYAGE_DIRECTORY, LEGACY_VOYAGE_DIRECTORY)),
    logDirectory: String(value.logDirectory || defaultDirectory(DEFAULT_LOG_DIRECTORY, LEGACY_LOG_DIRECTORY)),
    clipDirectory: String(value.clipDirectory || defaultDirectory(DEFAULT_CLIP_DIRECTORY, LEGACY_CLIP_DIRECTORY)),
    maxTrackPoints: clampInteger(value.maxTrackPoints, 500, 50000, MAX_TRACK_POINTS),
  };
}

function defaultDirectory(preferredDirectory, legacyDirectory) {
  const preferred = expandHome(preferredDirectory);
  const legacy = expandHome(legacyDirectory);
  return !fs.existsSync(preferred) && fs.existsSync(legacy) ? legacyDirectory : preferredDirectory;
}

function directoryForKind(kind, currentOptions) {
  if (kind === "voyages") return expandHome(currentOptions.voyageDirectory);
  if (kind === "clips") return expandHome(currentOptions.clipDirectory);
  if (kind === "logs") return expandHome(currentOptions.logDirectory);
  throw new Error(`Unsupported file kind: ${kind}`);
}

async function listFilesForKind(kind, currentOptions) {
  if (kind === "voyages") return listVoyages(currentOptions.voyageDirectory);
  return listRecordings(directoryForKind(kind, currentOptions));
}

async function listVoyages(voyageDirectory) {
  const dir = expandHome(voyageDirectory);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const voyages = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".zip")) continue;
    const voyagePath = path.join(dir, entry.name);
    const stat = await fs.promises.stat(voyagePath);
    const index = await readVoyageIndexSummary(voyagePath);
    voyages.push({
      fileName: entry.name,
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      comment: index.comment,
      startedAt: index.startedAt,
      stoppedAt: index.stoppedAt,
    });
  }
  voyages.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  return voyages;
}

async function readVoyageIndexSummary(voyagePath) {
  try {
    const index = await readZipJson(voyagePath, "index.json");
    return {
      comment: typeof index.comment === "string" ? index.comment : "",
      startedAt: typeof index.startedAt === "string" ? index.startedAt : null,
      stoppedAt: typeof index.stoppedAt === "string" ? index.stoppedAt : null,
    };
  } catch {
    return { comment: "", startedAt: null, stoppedAt: null };
  }
}

async function listRecordings(directory) {
  const dir = expandHome(directory);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const recordings = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.jsonl(\.gz)?$/i.test(entry.name)) continue;
    const stat = await fs.promises.stat(path.join(dir, entry.name));
    recordings.push({
      fileName: entry.name,
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      startedAt: recordingStartedAtFromFileName(entry.name),
      compressed: entry.name.endsWith(".gz"),
    });
  }
  recordings.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  return recordings;
}

function sourcePathForKind(kind, file, currentOptions) {
  return path.join(directoryForKind(kind, currentOptions), file);
}

async function analyseFileSource(kind, file, currentOptions, maxTrackPoints, { useCache = true } = {}) {
  const sourcePath = sourcePathForKind(kind, file, currentOptions);
  const source = await sourceFingerprint(sourcePath);
  if (useCache && isPlotCacheable(maxTrackPoints)) {
    const cached = await readFreshPlotCache(sourcePath, source, kind, file, maxTrackPoints);
    if (cached) return cached;
  }
  const analysis = kind === "voyages"
    ? await analyseVoyage(sourcePath, { maxTrackPoints, options: currentOptions })
    : await analyseRecording(sourcePath, { kind, maxTrackPoints });
  if (useCache && isPlotCacheable(maxTrackPoints)) {
    await writePlotCache(sourcePath, source, kind, file, maxTrackPoints, analysis);
  }
  return analysis;
}

function isPlotCacheable(maxTrackPoints) {
  const value = Number(maxTrackPoints);
  return Number.isFinite(value) && value > 0 && value <= 50000;
}

async function sourceFingerprint(sourcePath) {
  const stat = await fs.promises.stat(sourcePath);
  if (!stat.isFile()) throw new Error("Recording path is not a file.");
  return {
    fileName: path.basename(sourcePath),
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function plotCachePath(sourcePath) {
  return `${sourcePath}.ajrm-marine-plot.json`;
}

function legacyPlotCachePath(sourcePath) {
  return `${sourcePath}.${["watch", "keeper-plot"].join("")}.json`;
}

function gpxCachePath(sourcePath) {
  return `${sourcePath}.gpx`;
}

async function readFreshPlotCache(sourcePath, source, kind, file, maxTrackPoints) {
  for (const cachePath of [plotCachePath(sourcePath), legacyPlotCachePath(sourcePath)]) {
    const cache = await readPlotCacheFile(cachePath);
    if (!cache) continue;
    if (cache.schema !== PLOT_CACHE_SCHEMA && cache.schema !== LEGACY_PLOT_CACHE_SCHEMA) continue;
    if (cache.source?.kind !== kind || cache.source?.fileName !== file) continue;
    if (cache.source?.bytes !== source.bytes || cache.source?.mtimeMs !== source.mtimeMs) continue;
    if (Number(cache.options?.maxTrackPoints) !== Number(maxTrackPoints)) continue;
    if (!cache.analysis || typeof cache.analysis !== "object") continue;
    if (!cache.analysis.review) continue;
    return {
      ...cache.analysis,
      cache: {
        hit: true,
        generatedAt: cache.generatedAt || null,
      },
    };
  }
  return null;
}

async function readPlotCacheFile(cachePath) {
  try {
    return JSON.parse(await fs.promises.readFile(cachePath, "utf8"));
  } catch {
    return null;
  }
}

async function writePlotCache(sourcePath, source, kind, file, maxTrackPoints, analysis) {
  const cache = {
    schema: PLOT_CACHE_SCHEMA,
    generatedAt: new Date().toISOString(),
    viewerVersion: packageInfo.version,
    source: {
      kind,
      fileName: file,
      bytes: source.bytes,
      mtimeMs: source.mtimeMs,
      modifiedAt: source.modifiedAt,
    },
    options: {
      maxTrackPoints: Number(maxTrackPoints),
    },
    analysis,
  };
  await writeJsonAtomic(plotCachePath(sourcePath), cache);
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(value)}\n`);
  await fs.promises.rename(tempPath, filePath);
}

async function sendGpxForSource(res, kind, file, currentOptions) {
  const sourcePath = sourcePathForKind(kind, file, currentOptions);
  const source = await sourceFingerprint(sourcePath);
  const gpxPath = gpxCachePath(sourcePath);
  const cachedGpx = await freshSidecarPath(gpxPath, source);
  if (cachedGpx) {
    res.setHeader("Content-Type", "application/gpx+xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${headerSafeFileName(`${recordingFileStem(file)}.gpx`)}"`);
    fs.createReadStream(cachedGpx).pipe(res);
    return;
  }
  const analysis = await analyseFileSource(
    kind,
    file,
    currentOptions,
    Number.MAX_SAFE_INTEGER,
    { useCache: false },
  );
  const gpx = generateGpx(analysis);
  await fs.promises.writeFile(gpxPath, gpx);
  res.setHeader("Content-Type", "application/gpx+xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${headerSafeFileName(defaultGpxFileName(analysis, file))}"`);
  res.send(gpx);
}

async function freshSidecarPath(sidecarPath, source) {
  const stat = await fs.promises.stat(sidecarPath).catch(() => null);
  if (!stat?.isFile()) return null;
  return stat.mtimeMs >= source.mtimeMs && stat.size > 0 ? sidecarPath : null;
}

async function analyseVoyage(voyagePath, { maxTrackPoints = MAX_TRACK_POINTS, options: currentOptions = {} } = {}) {
  await assertReadableFile(voyagePath);
  const index = await readZipJson(voyagePath, "index.json");
  const captureFiles = Array.isArray(index.captureFiles) ? index.captureFiles : [];
  const captureReferences = Array.isArray(index.captureReferences) ? index.captureReferences : [];
  const captureSources = await resolveVoyageCaptureSources(
    voyagePath,
    captureFiles,
    captureReferences,
    currentOptions,
  );
  if (captureSources.length === 0) throw new Error(voyageCaptureSourceError(captureReferences));

  const firstPass = await scanCaptureSources(captureSources, null);
  const ownContext = chooseOwnContext(firstPass.positionCounts);
  if (!ownContext) {
    throw new Error("No own-vessel navigation.position samples found.");
  }
  const voyageWindow = {
    startMs: Date.parse(index.startedAt || ""),
    endMs: Date.parse(index.stoppedAt || ""),
  };
  const secondPass = await scanCaptureSources(captureSources, ownContext, voyageWindow);
  const track = sortTrack(secondPass.track);
  const drTracks = (await readVoyageDrTracks(voyagePath, index, maxTrackPoints)) ||
    buildDrTracks(secondPass.drTrackSamples, maxTrackPoints, "capture");
  const drPlotFixes = await readVoyageDrPlotFixes(voyagePath, index);
  const gpsIntegrity = buildGpsIntegrityAnalysis(secondPass.gpsIntegritySamples);
  const traffic = buildTrafficAnalysis(secondPass.trafficNotificationSamples);
  const markers = hourlyMarkers(track);
  const summary = buildSummary(index, track, secondPass, firstPass, ownContext, gpsIntegrity, traffic);
  const biteReports = readVoyageBiteReports(voyagePath);
  const review = buildVoyageReview({
    index,
    track,
    summary,
    gpsIntegrity,
    traffic,
    drTracks,
    drPlotFixes,
    biteReports,
  });

  return {
    id: index.id || path.basename(voyagePath, ".zip"),
    fileName: path.basename(voyagePath),
    sourceKind: "voyages",
    comment: index.comment || "",
    gpxUrl: `/plugins/signalk-ajrm-marine-voyage-viewer/files/voyages/${encodeURIComponent(path.basename(voyagePath))}/track.gpx`,
    ownContext,
    summary,
    review,
    traffic,
    hourlyMarkers: markers,
    track: thinTrack(track, maxTrackPoints),
    drTracks,
    drPlotFixes,
    gpsIntegrity,
    originalTrackPoints: track.length,
  };
}

async function analyseRecording(recordingPath, { kind = "logs", maxTrackPoints = MAX_TRACK_POINTS } = {}) {
  await assertReadableFile(recordingPath);
  const firstPass = await scanRecordingLines(recordingPath, null);
  const ownContext = chooseOwnContext(firstPass.positionCounts);
  if (!ownContext) {
    throw new Error("No own-vessel navigation.position samples found.");
  }
  const ownPass = await scanRecordingLines(recordingPath, ownContext);
  const track = sortTrack(ownPass.track);
  const drTracks = buildDrTracks(ownPass.drTrackSamples, maxTrackPoints, "capture");
  const gpsIntegrity = buildGpsIntegrityAnalysis(ownPass.gpsIntegritySamples);
  const traffic = buildTrafficAnalysis(ownPass.trafficNotificationSamples);
  const index = {
    id: path.basename(recordingPath).replace(/\.jsonl(\.gz)?$/i, ""),
    startedAt: track[0]?.ts || firstPass.sampleStart || recordingStartedAtFromFileName(path.basename(recordingPath)),
    stoppedAt: track[track.length - 1]?.ts || firstPass.sampleEnd || null,
    startReason: kind === "clips" ? "Clip" : "Log",
    stopReason: "",
    snapshotCount: 0,
  };
  const summary = buildSummary(index, track, ownPass, firstPass, ownContext, gpsIntegrity, traffic);
  const review = buildVoyageReview({
    index,
    track,
    summary,
    gpsIntegrity,
    traffic,
    drTracks,
    drPlotFixes: null,
    biteReports: [],
  });
  const fileName = path.basename(recordingPath);
  return {
    id: index.id,
    fileName,
    sourceKind: kind,
    comment: "",
    gpxUrl: `/plugins/signalk-ajrm-marine-voyage-viewer/files/${encodeURIComponent(kind)}/${encodeURIComponent(fileName)}/track.gpx`,
    ownContext,
    summary,
    review,
    traffic,
    hourlyMarkers: hourlyMarkers(track),
    track: thinTrack(track, maxTrackPoints),
    drTracks,
    gpsIntegrity,
    originalTrackPoints: track.length,
  };
}

async function resolveVoyageCaptureSources(voyagePath, captureFiles, captureReferences, currentOptions) {
  if (captureFiles.length) {
    return captureFiles.map((captureFile) => ({
      kind: "zip",
      voyagePath,
      innerPath: captureFile.startsWith("capture/") ? captureFile : `capture/${captureFile}`,
    }));
  }
  const sources = [];
  for (const reference of captureReferences) {
    const sourcePath = await resolveCaptureReferencePath(reference, currentOptions);
    if (sourcePath) sources.push({ kind: "file", path: sourcePath });
  }
  return sources;
}

async function readVoyageDrTracks(voyagePath, index, maxTrackPoints) {
  const fileName = String(index?.drTrack?.fileName || DR_TRACK_RELATIVE_PATH);
  try {
    const text = await readZipEntryText(voyagePath, fileName);
    const samples = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => normalizeDrTrackSample(JSON.parse(line)))
      .filter(Boolean);
    return buildDrTracks(samples, maxTrackPoints, "bundle");
  } catch {
    return null;
  }
}

async function readVoyageDrPlotFixes(voyagePath, index) {
  const fileName = String(index?.drPlotFixes?.fileName || DR_PLOT_FIXES_RELATIVE_PATH);
  try {
    const text = await readZipEntryText(voyagePath, fileName);
    const parsed = JSON.parse(text);
    return {
      source: "bundle",
      fileName,
      plotFixes: normalizeDrPlotFixes(parsed?.plotFixes || parsed?.fixes || []),
    };
  } catch {
    return null;
  }
}

async function resolveCaptureReferencePath(reference, currentOptions) {
  const candidates = [
    reference?.sourcePath,
    reference?.compressedSourcePath,
  ].filter(Boolean);
  const fileName = path.basename(String(reference?.fileName || ""));
  if (fileName) {
    candidates.push(path.join(currentOptions.logDirectory || DEFAULT_LOG_DIRECTORY, fileName));
    if (!fileName.endsWith(".gz")) {
      candidates.push(path.join(currentOptions.logDirectory || DEFAULT_LOG_DIRECTORY, `${fileName}.gz`));
    }
  }
  for (const candidate of candidates) {
    const expanded = expandHome(candidate);
    const stat = await fs.promises.stat(expanded).catch(() => null);
    if (stat?.isFile()) return expanded;
  }
  return null;
}

function voyageCaptureSourceError(captureReferences) {
  if (captureReferences.length) {
    return "Voyage bundle references AJRM Marine Logger files, but none were found on this server.";
  }
  return "Voyage bundle has no capture files or AJRM Marine Logger references.";
}

async function scanCaptureSources(captureSources, ownContext, window = null) {
  const result = {
    positionCounts: new Map(),
    track: [],
    drTrackSamples: [],
    gpsIntegritySamples: [],
    trafficNotificationSamples: [],
    speedSamples: [],
    maxSogKnots: null,
    maxApparentWindKnots: null,
    maxTrueWindKnots: null,
    minDepthMeters: null,
    sampleStart: null,
    sampleEnd: null,
  };
  for (const source of captureSources) {
    await readCaptureSourceLines(source, (record) => {
      scanRecord(record, ownContext, result, window);
    });
  }
  return result;
}

async function readCaptureSourceLines(source, onRecord) {
  if (source.kind === "zip") {
    await readCaptureLines(source.voyagePath, source.innerPath, onRecord);
    return;
  }
  await readRecordingLines(source.path, onRecord);
}

async function scanRecordingLines(recordingPath, ownContext, window = null) {
  const result = emptyScanResult();
  await readRecordingLines(recordingPath, (record) => {
    scanRecord(record, ownContext, result, window);
  });
  return result;
}

function emptyScanResult() {
  return {
    positionCounts: new Map(),
    track: [],
    drTrackSamples: [],
    gpsIntegritySamples: [],
    trafficNotificationSamples: [],
    speedSamples: [],
    maxSogKnots: null,
    maxApparentWindKnots: null,
    maxTrueWindKnots: null,
    minDepthMeters: null,
    sampleStart: null,
    sampleEnd: null,
  };
}

function scanRecord(record, ownContext, result, window) {
  const delta = record?.delta || {};
  const context = String(delta.context || "");
  for (const update of delta.updates || []) {
    const timestamp = update.timestamp || record.capturedAt;
    for (const item of update.values || []) {
      const value = item.value;
      const valuePath = String(item.path || "");
      if (valuePath === AJRM_MARINE_GPS_INTEGRITY_STATE_PATH) {
        if (!isInsideWindow(timestamp, window)) continue;
        const sample = normalizeDrTrackSample(value, timestamp);
        if (sample) result.drTrackSamples.push(sample);
        const integritySample = normalizeGpsIntegritySample(value, timestamp);
        if (integritySample) result.gpsIntegritySamples.push(integritySample);
      } else if (isTrafficNotificationPath(valuePath)) {
        if (!isInsideWindow(timestamp, window)) continue;
        const samples = normalizeTrafficNotificationSamples(value, timestamp, valuePath);
        result.trafficNotificationSamples.push(...samples);
      } else if (valuePath === "navigation.position" && isPosition(value)) {
        result.positionCounts.set(context, (result.positionCounts.get(context) || 0) + 1);
        touchSampleTimes(result, timestamp);
        if (!ownContext || context !== ownContext) continue;
        if (!isInsideWindow(timestamp, window)) continue;
        result.track.push({
          ts: timestamp,
          lat: Number(value.latitude),
          lon: Number(value.longitude),
          sogKnots: null,
        });
      } else if (ownContext && context === ownContext && valuePath === "navigation.speedOverGround") {
        if (!isInsideWindow(timestamp, window)) continue;
        const knots = metersPerSecondToKnots(value);
        if (Number.isFinite(knots)) {
          result.speedSamples.push({ ts: timestamp, knots });
          result.maxSogKnots = maxNumber(result.maxSogKnots, knots);
        }
      } else if (isWindSpeedPath(valuePath)) {
        if (!isInsideWindow(timestamp, window)) continue;
        const knots = metersPerSecondToKnots(value);
        if (!Number.isFinite(knots)) continue;
        if (valuePath.includes("speedApparent")) {
          result.maxApparentWindKnots = maxNumber(result.maxApparentWindKnots, knots);
        } else if (valuePath.includes("speedTrue")) {
          result.maxTrueWindKnots = maxNumber(result.maxTrueWindKnots, knots);
        }
      } else if (ownContext && context === ownContext && valuePath === "environment.depth.belowTransducer") {
        if (!isInsideWindow(timestamp, window)) continue;
        const meters = Number(value);
        if (Number.isFinite(meters)) {
          result.minDepthMeters =
            result.minDepthMeters == null ? meters : Math.min(result.minDepthMeters, meters);
        }
      }
    }
  }
}

function normalizeDrTrackSample(value, fallbackTimestamp = null) {
  const state = unwrapValue(value);
  if (!state || typeof state !== "object") return null;
  const ts = state.ts || state.timestamp || fallbackTimestamp;
  const gps = normalizeDrPoint(state.gps || state.gps?.position);
  const operational = normalizeDrPoint(
    state.operational ||
      state.operationalDeadReckoning ||
      state.deadReckoning,
  );
  const integrity = normalizeDrPoint(state.integrity || state.integrityDeadReckoning);
  if (!ts || (!gps && !operational && !integrity)) return null;
  return {
    ts,
    trust: state.trust || null,
    acceptedGps: state.acceptedGps === true,
    gps,
    operational,
    integrity,
    reasons: Array.isArray(state.reasons) ? state.reasons.slice(0, 5) : [],
  };
}

function normalizeGpsIntegritySample(value, fallbackTimestamp = null) {
  const state = unwrapValue(value);
  if (!state || typeof state !== "object") return null;
  const ts = state.ts || state.timestamp || fallbackTimestamp;
  if (!ts) return null;
  const diagnostics = state.diagnostics && typeof state.diagnostics === "object" ? state.diagnostics : {};
  const operational = state.operationalDeadReckoning || state.deadReckoning || {};
  const integrity = state.integrityDeadReckoning || {};
  return {
    ts,
    trust: stringOrNull(state.trust) || "unknown",
    notificationState: stringOrNull(state.notificationState),
    acceptedGps: state.acceptedGps === true,
    reasons: Array.isArray(state.reasons) ? state.reasons.map(String).slice(0, 8) : [],
    counters: normalizeGpsIntegrityCounters(state.counters),
    gps: {
      fixValid: state.gps?.fixValid === true,
      explicitGpsUnavailable: state.gps?.explicitGpsUnavailable === true,
      positionTimestamp: stringOrNull(state.gps?.positionTimestamp),
      lastReceivedPositionTimestamp: stringOrNull(state.gps?.lastReceivedPositionTimestamp),
      positionAgeSeconds: numberOrNull(state.gps?.positionAgeSeconds),
      hdop: numberOrNull(state.gps?.hdop),
      satellites: numberOrNull(state.gps?.satellites),
    },
    current: {
      available: state.current?.available === true,
      source: stringOrNull(state.current?.source),
      ageSeconds: numberOrNull(state.current?.ageSeconds),
      driftKnots: numberOrNull(state.current?.driftKnots),
      setTrueDegrees: numberOrNull(state.current?.setTrueDegrees),
    },
    deadReckoning: {
      operationalSource: stringOrNull(operational.source) || stringOrNull(diagnostics.deadReckoning?.operationalSource),
      operationalAgeSeconds: numberOrNull(operational.ageSeconds ?? diagnostics.deadReckoning?.operationalAgeSeconds),
      operationalUncertaintyRadiusMeters: numberOrNull(
        operational.uncertaintyRadiusMeters ?? diagnostics.deadReckoning?.operationalUncertaintyRadiusMeters,
      ),
      integritySource: stringOrNull(integrity.source) || stringOrNull(diagnostics.deadReckoning?.integritySource),
      integrityAgeSeconds: numberOrNull(integrity.ageSeconds ?? diagnostics.deadReckoning?.integrityAgeSeconds),
      integrityUncertaintyRadiusMeters: numberOrNull(
        integrity.uncertaintyRadiusMeters ?? diagnostics.deadReckoning?.integrityUncertaintyRadiusMeters,
      ),
    },
    diagnostics: {
      contract: stringOrNull(diagnostics.contract),
      decision: diagnostics.decision && typeof diagnostics.decision === "object"
        ? {
            positionJumpRejected: diagnostics.decision.positionJumpRejected === true,
            degradedSignalActive: diagnostics.decision.degradedSignalActive === true,
            drDiscrepancyActive: diagnostics.decision.drDiscrepancyActive === true,
          }
        : null,
      thresholds: diagnostics.thresholds && typeof diagnostics.thresholds === "object"
        ? {
            gpsLostSeconds: numberOrNull(diagnostics.thresholds.gpsLostSeconds),
            maxHdop: numberOrNull(diagnostics.thresholds.maxHdop),
            minSatellites: numberOrNull(diagnostics.thresholds.minSatellites),
            warningDrDiscrepancyMeters: numberOrNull(diagnostics.thresholds.warningDrDiscrepancyMeters),
            alarmDrDiscrepancyMeters: numberOrNull(diagnostics.thresholds.alarmDrDiscrepancyMeters),
          }
        : null,
    },
  };
}

function normalizeGpsIntegrityCounters(value = {}) {
  return {
    evaluations: countOrNull(value.evaluations),
    acceptedFixes: countOrNull(value.acceptedFixes),
    rejectedFixes: countOrNull(value.rejectedFixes),
    positionJumps: countOrNull(value.positionJumps),
    lostFixes: countOrNull(value.lostFixes),
    degradedSignals: countOrNull(value.degradedSignals),
    drDiscrepancies: countOrNull(value.drDiscrepancies),
  };
}

function isTrafficNotificationPath(valuePath) {
  return valuePath === "plugins.ajrmMarineNotifications" ||
    valuePath.startsWith("notifications.") ||
    valuePath.includes(".notifications.");
}

function normalizeTrafficNotificationSamples(value, fallbackTimestamp = null, valuePath = "") {
  const unwrapped = unwrapValue(value);
  const records = [];
  if (!unwrapped || typeof unwrapped !== "object") return records;
  if (unwrapped.contract === "notifications-plus-projection") {
    for (const item of [...(unwrapped.active || []), ...(unwrapped.recentActivity || [])]) {
      const record = normalizeTrafficNotificationItem(item, fallbackTimestamp, valuePath);
      if (record) records.push(record);
    }
    return records;
  }
  const record = normalizeTrafficNotificationItem(unwrapped, fallbackTimestamp, valuePath);
  if (record) records.push(record);
  return records;
}

function normalizeTrafficNotificationItem(item, fallbackTimestamp, valuePath) {
  if (!item || typeof item !== "object") return null;
  const presentation = item.presentation && typeof item.presentation === "object" ? item.presentation : {};
  const context = item.context && typeof item.context === "object" ? item.context : {};
  const message = stringOrNull(presentation.message) ||
    stringOrNull(presentation.audioMessage) ||
    stringOrNull(item.message);
  const label = stringOrNull(presentation.label) || stringOrNull(item.label);
  const provider = stringOrNull(item.provider);
  const category = stringOrNull(presentation.category) || stringOrNull(item.category);
  if (provider && provider !== "ajrm-marine-traffic") return null;
  if (!isTrafficAlertText(label, message, category, valuePath)) return null;
  const eventId = stringOrNull(item.eventId) ||
    `${fallbackTimestamp || ""}:${label || ""}:${message || ""}`.slice(0, 240);
  const severity = trafficSeverity(label, message, item.priority?.level);
  if (!severity) return null;
  const size = trafficVesselSize(presentation.facts, message);
  const cpaMeters = extractCpaMeters(message);
  return {
    ts: stringOrNull(item.timestamp) || fallbackTimestamp,
    eventId,
    severity,
    label: label || (severity === "collision" ? "Collision alarm" : "Traffic advisory"),
    message: message || "",
    title: stringOrNull(presentation.title),
    mmsi: stringOrNull(context.mmsi) || extractMmsi(context.targetContext) || extractMmsi(valuePath),
    targetContext: stringOrNull(context.targetContext),
    size,
    cpaMeters,
  };
}

function isTrafficAlertText(label, message, category, valuePath) {
  const text = `${label || ""} ${message || ""}`.toLowerCase();
  if (category === "cpa") return true;
  if (text.includes("traffic advisory") || text.includes("collision alarm")) return true;
  return valuePath.includes("notifications") && text.includes("cpa");
}

function trafficSeverity(label, message, priorityLevel) {
  const text = `${label || ""} ${message || ""} ${priorityLevel || ""}`.toLowerCase();
  if (text.includes("collision alarm") || text.includes("alarm") || text.includes("danger")) return "collision";
  if (text.includes("traffic advisory") || text.includes("advisory") || text.includes("warn")) return "advisory";
  return null;
}

function trafficVesselSize(facts, message) {
  const factText = Array.isArray(facts) ? facts.join(" ") : "";
  const text = `${factText} ${message || ""}`.toLowerCase();
  if (text.includes("large vessel") || /\blarge\b/.test(text)) return "large";
  if (text.includes("medium vessel") || /\bmedium\b/.test(text)) return "medium";
  if (text.includes("small craft") || text.includes("small vessel") || /\bsmall\b/.test(text)) return "small";
  return "unknown";
}

function extractMmsi(value) {
  const text = String(value || "");
  const match = text.match(/mmsi[:/.-]?(\d{6,10})/i) || text.match(/\b(\d{9})\b/);
  return match ? match[1] : null;
}

function extractCpaMeters(message) {
  const text = String(message || "");
  const meters = text.match(/CPA\s+([0-9]+(?:\.[0-9]+)?)\s+meters?/i);
  if (meters) return Number(meters[1]);
  const miles = text.match(/CPA\s+([0-9]+(?:\.[0-9]+)?)\s+miles?/i);
  if (miles) return Number(miles[1]) * 1852;
  return null;
}

function countOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function normalizeDrPoint(value) {
  const source = value?.position || value;
  if (!source) return null;
  const lat = Number(source.lat ?? source.latitude);
  const lon = Number(source.lon ?? source.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    source: value?.source || null,
    ageSeconds: numberOrNull(value?.ageSeconds),
    uncertaintyRadiusMeters: numberOrNull(value?.uncertaintyRadiusMeters),
  };
}

function normalizeDrPlotFixes(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeDrPlotFix)
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function normalizeDrPlotFix(value) {
  const source = value?.position || {};
  const lat = Number(source.lat ?? source.latitude);
  const lon = Number(source.lon ?? source.longitude);
  const timestampMs = Date.parse(value?.timestamp);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timestampMs)) return null;
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 80) : `plot-${new Date(timestampMs).toISOString()}`,
    timestamp: new Date(timestampMs).toISOString(),
    lat,
    lon,
    automatic: value.automatic === true,
    plotType: ["manual", "timed", "gps-lost", "gps-return", "observed-fix"].includes(value.plotType) ? value.plotType : null,
    note: stringOrNull(value.note),
    trust: stringOrNull(value.trust),
    drSource: stringOrNull(value.drSource),
    uncertaintyRadiusMeters: numberOrNull(value.uncertaintyRadiusMeters),
    lastTrustedFixAgeSeconds: numberOrNull(value.lastTrustedFixAgeSeconds),
    distanceFromLastTrustedFixMeters: numberOrNull(value.distanceFromLastTrustedFixMeters),
    stwMps: numberOrNull(value.stwMps),
    headingTrueDegrees: numberOrNull(value.headingTrueDegrees),
    sogMps: numberOrNull(value.sogMps),
    cogTrueDegrees: numberOrNull(value.cogTrueDegrees),
    currentDriftMps: numberOrNull(value.currentDriftMps),
    currentSetTrueDegrees: numberOrNull(value.currentSetTrueDegrees),
  };
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildDrTracks(samples, maxTrackPoints, source) {
  const sorted = (Array.isArray(samples) ? samples : [])
    .filter((sample) => sample?.ts)
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
  if (!sorted.length) return null;
  const gps = [];
  const operational = [];
  const integrity = [];
  const recoveryJumps = [];
  let previousOperational = null;
  let previousTrust = null;
  for (const sample of sorted) {
    if (sample.gps) gps.push(drTrackPoint(sample, sample.gps));
    if (sample.operational) {
      const point = drTrackPoint(sample, sample.operational);
      operational.push(point);
      if (
        previousOperational &&
        previousTrust === "lost" &&
        sample.trust !== "lost" &&
        haversineMeters(previousOperational, point) >= 10
      ) {
        recoveryJumps.push({
          from: previousOperational,
          to: point,
          ts: sample.ts,
          meters: haversineMeters(previousOperational, point),
        });
      }
      previousOperational = point;
    }
    if (sample.integrity && sample.gps && sample.trust !== "lost") {
      integrity.push(drTrackPoint(sample, sample.integrity));
    }
    previousTrust = sample.trust;
  }
  if (gps.length < 2 && operational.length < 2 && integrity.length < 2) return null;
  return {
    source,
    samples: sorted.length,
    gps: thinTrack(gps, maxTrackPoints),
    operational: thinTrack(operational, maxTrackPoints),
    integrity: thinTrack(integrity, maxTrackPoints),
    recoveryJumps,
    original: {
      gps: gps.length,
      operational: operational.length,
      integrity: integrity.length,
    },
  };
}

function drTrackPoint(sample, point) {
  return {
    ts: sample.ts,
    lat: point.lat,
    lon: point.lon,
    trust: sample.trust || null,
    source: point.source || null,
    uncertaintyRadiusMeters: numberOrNull(point.uncertaintyRadiusMeters),
  };
}

function chooseOwnContext(positionCounts) {
  let selected = null;
  let selectedCount = 0;
  for (const [context, count] of positionCounts.entries()) {
    if (count > selectedCount) {
      selected = context;
      selectedCount = count;
    }
  }
  return selected;
}

function buildGpsIntegrityAnalysis(samples) {
  const sorted = (Array.isArray(samples) ? samples : [])
    .filter((sample) => sample?.ts)
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
  if (!sorted.length) {
    return {
      samples: 0,
      events: [],
      summary: {
        available: false,
      },
    };
  }

  const events = [];
  const finalCounters = sorted[sorted.length - 1].counters || {};
  let previous = null;
  let lostStart = null;
  let lostPeriods = 0;
  let totalLostSeconds = 0;
  let longestLostSeconds = 0;
  let maxPositionAgeSeconds = null;
  let maxOperationalUncertaintyMeters = null;
  let maxIntegrityUncertaintyMeters = null;

  for (const sample of sorted) {
    maxPositionAgeSeconds = maxNumber(maxPositionAgeSeconds, sample.gps?.positionAgeSeconds);
    maxOperationalUncertaintyMeters = maxNumber(
      maxOperationalUncertaintyMeters,
      sample.deadReckoning?.operationalUncertaintyRadiusMeters,
    );
    maxIntegrityUncertaintyMeters = maxNumber(
      maxIntegrityUncertaintyMeters,
      sample.deadReckoning?.integrityUncertaintyRadiusMeters,
    );

    const lost = isGpsLostIntegritySample(sample);
    if (lost && !lostStart) {
      lostStart = sample.ts;
      lostPeriods += 1;
      events.push(gpsIntegrityEvent(sample, "gps-lost", "GPS lost or invalid"));
    } else if (!lost && lostStart) {
      const seconds = secondsBetween(lostStart, sample.ts);
      totalLostSeconds += seconds;
      longestLostSeconds = Math.max(longestLostSeconds, seconds);
      events.push(gpsIntegrityEvent(sample, "gps-recovered", "GPS recovered"));
      lostStart = null;
    }

    const counterEvents = gpsIntegrityCounterEvents(previous, sample);
    events.push(...counterEvents);
    if (previous && sample.trust !== previous.trust) {
      events.push(gpsIntegrityEvent(sample, "trust-change", `Trust changed to ${sample.trust}`));
    }
    previous = sample;
  }

  if (lostStart) {
    const seconds = secondsBetween(lostStart, sorted[sorted.length - 1].ts);
    totalLostSeconds += seconds;
    longestLostSeconds = Math.max(longestLostSeconds, seconds);
  }

  return {
    samples: sorted.length,
    firstAt: sorted[0].ts,
    lastAt: sorted[sorted.length - 1].ts,
    finalTrust: sorted[sorted.length - 1].trust,
    finalNotificationState: sorted[sorted.length - 1].notificationState,
    finalCounters,
    events: events.slice(-250),
    summary: {
      available: true,
      samples: sorted.length,
      finalTrust: sorted[sorted.length - 1].trust,
      evaluations: finalCounters.evaluations ?? null,
      acceptedFixes: finalCounters.acceptedFixes ?? null,
      rejectedFixes: finalCounters.rejectedFixes ?? null,
      positionJumps: finalCounters.positionJumps ?? null,
      lostFixes: finalCounters.lostFixes ?? null,
      degradedSignals: finalCounters.degradedSignals ?? null,
      drDiscrepancies: finalCounters.drDiscrepancies ?? null,
      lostPeriods,
      totalLostSeconds,
      longestLostSeconds,
      maxPositionAgeSeconds,
      maxOperationalUncertaintyMeters,
      maxIntegrityUncertaintyMeters,
      lastReason: sorted[sorted.length - 1].reasons?.[0] || "",
    },
  };
}

function isGpsLostIntegritySample(sample) {
  return sample?.trust === "lost" || sample?.gps?.fixValid === false;
}

function gpsIntegrityCounterEvents(previous, sample) {
  const previousCounters = previous?.counters || {};
  const currentCounters = sample.counters || {};
  const definitions = [
    ["lostFixes", "gps-outage", "GPS outage counted"],
    ["positionJumps", "position-jump", "GPS position jump rejected"],
    ["degradedSignals", "weak-signal", "Weak GPS signal counted"],
    ["drDiscrepancies", "dr-mismatch", "GPS/DR mismatch counted"],
    ["rejectedFixes", "rejected-fix", "GPS fix rejected"],
  ];
  return definitions
    .filter(([key]) => Number.isFinite(currentCounters[key]) && currentCounters[key] > (previousCounters[key] || 0))
    .map(([, type, label]) => gpsIntegrityEvent(sample, type, label));
}

function gpsIntegrityEvent(sample, type, label) {
  return {
    ts: sample.ts,
    type,
    label,
    trust: sample.trust,
    acceptedGps: sample.acceptedGps,
    reason: sample.reasons?.[0] || "",
    reasons: sample.reasons || [],
    counters: sample.counters || {},
    gps: sample.gps || {},
    deadReckoning: sample.deadReckoning || {},
  };
}

function secondsBetween(start, end) {
  const startMs = Date.parse(start || "");
  const endMs = Date.parse(end || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function sortTrack(track) {
  const sorted = track
    .filter((point) => isFinitePosition(point))
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
  const speeds = new Map();
  for (const point of sorted) {
    speeds.set(point.ts, point.sogKnots);
  }
  return sorted;
}

function buildTrafficAnalysis(samples = []) {
  const eventsById = new Map();
  for (const sample of samples) {
    if (!sample?.eventId) continue;
    if (!eventsById.has(sample.eventId)) {
      eventsById.set(sample.eventId, sample);
      continue;
    }
    const existing = eventsById.get(sample.eventId);
    if (!existing.message && sample.message) eventsById.set(sample.eventId, sample);
  }
  const events = [...eventsById.values()]
    .filter((event) => event.severity === "advisory" || event.severity === "collision")
    .sort((left, right) => Date.parse(left.ts || "") - Date.parse(right.ts || ""));
  const vessels = new Map();
  let closestCpaMeters = null;
  let closestEvent = null;
  for (const event of events) {
    const key = event.mmsi || event.title || event.targetContext || event.eventId;
    const existing = vessels.get(key) || {
      key,
      name: event.title || "",
      mmsi: event.mmsi || "",
      size: event.size || "unknown",
      advisories: 0,
      collisions: 0,
    };
    if (!existing.name && event.title) existing.name = event.title;
    if (existing.size === "unknown" && event.size) existing.size = event.size;
    if (event.severity === "collision") existing.collisions += 1;
    if (event.severity === "advisory") existing.advisories += 1;
    vessels.set(key, existing);
    if (Number.isFinite(event.cpaMeters) && (closestCpaMeters == null || event.cpaMeters < closestCpaMeters)) {
      closestCpaMeters = event.cpaMeters;
      closestEvent = event;
    }
  }
  const vesselList = [...vessels.values()];
  const bySize = {
    small: vesselList.filter((vessel) => vessel.size === "small").length,
    medium: vesselList.filter((vessel) => vessel.size === "medium").length,
    large: vesselList.filter((vessel) => vessel.size === "large").length,
    unknown: vesselList.filter((vessel) => vessel.size === "unknown").length,
  };
  const advisories = events.filter((event) => event.severity === "advisory").length;
  const collisions = events.filter((event) => event.severity === "collision").length;
  return {
    available: events.length > 0,
    events: events.length,
    advisories,
    collisionAlerts: collisions,
    vesselsEncountered: vesselList.length,
    bySize,
    closestCpaMeters,
    closestCpaEvent: closestEvent
      ? {
          ts: closestEvent.ts,
          title: closestEvent.title,
          mmsi: closestEvent.mmsi,
          severity: closestEvent.severity,
          cpaMeters: closestEvent.cpaMeters,
        }
      : null,
    vessels: vesselList.slice(0, 50),
  };
}

function buildSummary(index, track, ownPass, firstPass, ownContext, gpsIntegrity = null, traffic = null) {
  const startedAt = index.startedAt || track[0]?.ts || firstPass.sampleStart || null;
  const stoppedAt =
    index.stoppedAt || track[track.length - 1]?.ts || firstPass.sampleEnd || null;
  const durationSeconds =
    startedAt && stoppedAt ? Math.max(0, (Date.parse(stoppedAt) - Date.parse(startedAt)) / 1000) : 0;
  const distanceNm = trackDistanceNm(track);
  const averageSpeedKnots =
    durationSeconds > 0 ? distanceNm / (durationSeconds / 3600) : average(ownPass.speedSamples.map((s) => s.knots));

  return {
    startedAt,
    stoppedAt,
    durationSeconds,
    distanceNm,
    averageSpeedKnots,
    averageRecordedSogKnots: average(ownPass.speedSamples.map((s) => s.knots)),
    maxSogKnots: ownPass.maxSogKnots,
    maxApparentWindKnots: ownPass.maxApparentWindKnots,
    maxTrueWindKnots: ownPass.maxTrueWindKnots,
    minDepthMeters: ownPass.minDepthMeters,
    trackPoints: track.length,
    plottedTrackPoints: track.length,
    ownContext,
    captureStartedAt: index.ajrmMarineLogger?.start?.recording?.from || null,
    captureStoppedAt: index.ajrmMarineLogger?.stop?.recording?.to || null,
    startReason: index.startReason || "",
    stopReason: index.stopReason || "",
    snapshotCount: Number(index.snapshotCount) || 0,
    gpsIntegrity: gpsIntegrity?.summary || { available: false },
    traffic: traffic || { available: false },
  };
}

function readVoyageBiteReports(voyagePath) {
  try {
    const zip = new AdmZip(voyagePath);
    const reports = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (!/^system\/bite-reports\/.+\.json$/i.test(entry.entryName)) continue;
      const parsed = JSON.parse(entry.getData().toString("utf8"));
      if (Array.isArray(parsed.reports)) {
        for (const report of parsed.reports) reports.push(normalizeBiteReport(report, entry.entryName));
      } else {
        reports.push(normalizeBiteReport(parsed, entry.entryName));
      }
    }
    return reports.filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeBiteReport(report, source) {
  if (!report || typeof report !== "object") return null;
  const assertions = Array.isArray(report.assertions) ? report.assertions : [];
  const failedAssertions = assertions
    .filter((assertion) => assertion && assertion.pass === false)
    .map((assertion) => String(assertion.id || assertion.message || "failed assertion"));
  return {
    source,
    runId: stringOrNull(report.runId),
    scenario: stringOrNull(report.scenario) || stringOrNull(report.id) || "unknown",
    title: stringOrNull(report.title) || stringOrNull(report.name) || stringOrNull(report.scenario) || "BITE test",
    result: stringOrNull(report.result) || (report.ok === true ? "pass" : report.ok === false ? "fail" : "unknown"),
    summary: stringOrNull(report.summary),
    failedAssertions,
  };
}

function buildVoyageReview({
  index,
  track,
  summary,
  gpsIntegrity,
  traffic,
  drTracks,
  drPlotFixes,
  biteReports = [],
}) {
  const findings = [];
  const paragraphs = [];
  const bite = summarizeBiteReports(biteReports);
  const gps = gpsIntegrity?.summary || {};
  const distance = Number.isFinite(summary.distanceNm) ? `${summary.distanceNm.toFixed(1)} NM` : "unknown distance";
  const duration = formatSecondsForReview(summary.durationSeconds);
  const comment = index.comment ? ` "${index.comment}"` : "";

  paragraphs.push(
    `Voyage${comment} covered ${distance} over ${duration}. The track contains ${summary.trackPoints || 0} own-vessel GPS positions, with an average speed of ${formatReviewNumber(summary.averageSpeedKnots, 1, " knots")}.`,
  );

  if (summary.minDepthMeters != null) {
    paragraphs.push(`Minimum recorded depth was ${formatReviewNumber(summary.minDepthMeters, 1, " meters")}. Maximum recorded SOG was ${formatReviewNumber(summary.maxSogKnots, 1, " knots")}.`);
  } else {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "No depth samples found",
      detail: "The voyage bundle did not include usable depth samples for this review.",
    });
  }

  if (traffic?.available) {
    const sizeParts = [];
    if (traffic.bySize?.small) sizeParts.push(`${traffic.bySize.small} small`);
    if (traffic.bySize?.medium) sizeParts.push(`${traffic.bySize.medium} medium`);
    if (traffic.bySize?.large) sizeParts.push(`${traffic.bySize.large} large`);
    if (traffic.bySize?.unknown) sizeParts.push(`${traffic.bySize.unknown} unknown size`);
    const closest = Number.isFinite(traffic.closestCpaMeters)
      ? ` Closest reported CPA was ${formatReviewDistance(traffic.closestCpaMeters)}${traffic.closestCpaEvent?.title ? ` for ${traffic.closestCpaEvent.title}` : ""}.`
      : "";
    paragraphs.push(
      `Traffic review found ${traffic.vesselsEncountered} vessel${traffic.vesselsEncountered === 1 ? "" : "s"} encountered${sizeParts.length ? ` (${sizeParts.join(", ")})` : ""}, ${traffic.advisories} traffic advisories, and ${traffic.collisionAlerts} collision alerts.${closest}`,
    );
    findings.push({
      category: "voyage",
      level: traffic.collisionAlerts ? "amber" : "green",
      title: traffic.collisionAlerts ? "Collision alerts recorded" : "Traffic alerts reviewed",
      detail: traffic.collisionAlerts
        ? `${traffic.collisionAlerts} collision alert${traffic.collisionAlerts === 1 ? "" : "s"} and ${traffic.advisories} advisor${traffic.advisories === 1 ? "y" : "ies"} were recorded for ${traffic.vesselsEncountered} vessel${traffic.vesselsEncountered === 1 ? "" : "s"}.`
        : `${traffic.advisories} traffic advisor${traffic.advisories === 1 ? "y" : "ies"} were recorded and no collision alerts were found.`,
    });
  } else {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "No traffic alert history",
      detail: "No AJRM Marine Traffic advisory or collision notifications were found in the recording.",
    });
  }

  if (bite.available) {
    paragraphs.push(
      "This bundle includes AJRM Marine Console BITE output. BITE scenarios deliberately inject test targets, GPS faults, and alert-chain failures so Voyage Viewer can confirm the suite detects and reports them; treat BITE failures as test evidence unless the report says the software chain itself failed to react correctly.",
    );
    if (bite.failed > 0) {
      const failedNames = bite.failedTests
        .map((test) => test.title || test.scenario)
        .filter(Boolean)
        .slice(0, 5)
        .join("; ");
      findings.push({
        category: "software",
        level: "red",
        title: "Built-in test failure",
        detail: `${bite.failed} of ${bite.total} BITE checks failed${failedNames ? `: ${failedNames}` : ""}. Do not rely on the suite until these safety-chain tests are understood.`,
      });
    } else {
      findings.push({
        category: "software",
        level: "green",
        title: "Built-in tests passed",
        detail: `${bite.passed} BITE checks were bundled and all passed.`,
      });
    }
  } else {
    findings.push({
      category: "software",
      level: "amber",
      title: "No BITE report bundled",
      detail: "This voyage can still be reviewed, but there is no built-in-test evidence for the software chain in this bundle.",
    });
  }

  if (gps.available) {
    paragraphs.push(
      `GPS Integrity recorded ${gps.evaluations || gps.samples || 0} evaluations. Final trust was ${reviewTrustName(gps.finalTrust)}.`,
    );
    addGpsReviewFindings(findings, gps);
  } else {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "No GPS Integrity data",
      detail: "The voyage bundle did not include GPS Integrity state samples, so GPS outages, jumps, and GPS/DR disagreements could not be assessed.",
    });
  }

  addDrReviewFindings(findings, drTracks, drPlotFixes);
  if (!summary.trackPoints) {
    findings.push({
      category: "voyage",
      level: "red",
      title: "No own-vessel track",
      detail: "No usable own-vessel GPS positions were found in the recording.",
    });
  }

  const softwareStatus = highestReviewLevel(findings.filter((finding) => finding.category === "software"));
  const voyageStatus = highestReviewLevel(findings.filter((finding) => finding.category !== "software"));
  const status = highestReviewLevel([{ level: softwareStatus }, { level: voyageStatus }]);
  const headline = reviewHeadline({ softwareStatus, voyageStatus, status });
  return {
    generatedAt: new Date().toISOString(),
    status,
    softwareStatus,
    voyageStatus,
    headline,
    paragraphs,
    findings,
    bite,
  };
}

function summarizeBiteReports(reports) {
  const usefulReports = reports.filter((report) => report.scenario !== "run-all");
  const source = usefulReports.length ? usefulReports : reports;
  const failedTests = source.filter((report) => reviewBiteFailed(report));
  const passed = source.filter((report) => reviewBitePassed(report)).length;
  return {
    available: source.length > 0,
    total: source.length,
    passed,
    failed: failedTests.length,
    failedTests: failedTests.slice(0, 12).map((report) => ({
      scenario: report.scenario,
      title: report.title,
      summary: report.summary,
      failedAssertions: report.failedAssertions,
    })),
  };
}

function reviewBiteFailed(report) {
  return report.result === "fail" || report.result === "failed" || report.result === "red" || report.failedAssertions.length > 0;
}

function reviewBitePassed(report) {
  return report.result === "pass" || report.result === "passed" || report.ok === true;
}

function addGpsReviewFindings(findings, gps) {
  if (gps.lostFixes || gps.lostPeriods) {
    findings.push({
      category: "voyage",
      level: gps.longestLostSeconds > 60 || gps.totalLostSeconds > 120 ? "red" : "amber",
      title: "GPS outage detected",
      detail: `${gps.lostFixes || gps.lostPeriods} GPS outage${(gps.lostFixes || gps.lostPeriods) === 1 ? "" : "s"} were detected, totalling ${formatSecondsForReview(gps.totalLostSeconds || 0)}. Longest outage was ${formatSecondsForReview(gps.longestLostSeconds || 0)}.`,
    });
  }
  if (gps.positionJumps) {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "GPS position jumps rejected",
      detail: `${gps.positionJumps} position jump${gps.positionJumps === 1 ? "" : "s"} were detected by GPS Integrity.`,
    });
  }
  if (gps.rejectedFixes) {
    findings.push({
      category: "voyage",
      level: gps.rejectedFixes > 3 ? "red" : "amber",
      title: "GPS fixes rejected",
      detail: `${gps.rejectedFixes} GPS fix${gps.rejectedFixes === 1 ? "" : "es"} were rejected before reaching the trusted navigation state.`,
    });
  }
  if (gps.drDiscrepancies) {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "GPS and dead reckoning disagreed",
      detail: `${gps.drDiscrepancies} GPS/DR mismatch event${gps.drDiscrepancies === 1 ? "" : "s"} were recorded. Maximum operational DR uncertainty was ${formatReviewNumber(gps.maxOperationalUncertaintyMeters, 0, " meters")}.`,
    });
  }
  if (gps.degradedSignals) {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "Weak GPS signal detected",
      detail: `${gps.degradedSignals} weak-signal event${gps.degradedSignals === 1 ? "" : "s"} were recorded.`,
    });
  }
  if (!gps.lostFixes && !gps.positionJumps && !gps.rejectedFixes && !gps.drDiscrepancies && !gps.degradedSignals) {
    findings.push({
      category: "voyage",
      level: "green",
      title: "GPS Integrity healthy",
      detail: "No GPS outages, rejected fixes, position jumps, weak-signal events, or GPS/DR mismatches were recorded.",
    });
  }
}

function addDrReviewFindings(findings, drTracks, drPlotFixes) {
  const jumps = drTracks?.recoveryJumps || [];
  const fixCount = (drPlotFixes?.plotFixes || []).length;
  if (jumps.length) {
    const maxJump = jumps.reduce((max, jump) => Math.max(max, Number(jump.meters) || 0), 0);
    findings.push({
      category: "voyage",
      level: maxJump > 500 ? "red" : "amber",
      title: "DR recovery jump",
      detail: `${jumps.length} GPS recovery jump${jumps.length === 1 ? "" : "s"} were recorded. Largest jump was ${formatReviewNumber(maxJump, 0, " meters")}.`,
    });
  }
  if (fixCount) {
    findings.push({
      category: "voyage",
      level: "green",
      title: "DR plot fixes available",
      detail: `${fixCount} DR/GPS plot fix${fixCount === 1 ? "" : "es"} were bundled for chart review.`,
    });
  } else {
    findings.push({
      category: "voyage",
      level: "amber",
      title: "No DR plot fixes bundled",
      detail: "The review found no recorded DR plot fixes. Older voyages, or voyages without DR Plotter running, may not include them.",
    });
  }
}

function highestReviewLevel(findings) {
  if (findings.some((finding) => finding.level === "red")) return "red";
  if (findings.some((finding) => finding.level === "amber")) return "amber";
  return "green";
}

function reviewHeadline({ softwareStatus, voyageStatus, status }) {
  if (status === "red") {
    return `Software ${softwareStatus.toUpperCase()}, voyage data ${voyageStatus.toUpperCase()}: investigate red items before relying on this setup.`;
  }
  if (status === "amber") {
    return `Software ${softwareStatus.toUpperCase()}, voyage data ${voyageStatus.toUpperCase()}: usable review with cautions.`;
  }
  return "Software GREEN, voyage data GREEN: reviewed checks look healthy.";
}

function reviewTrustName(value) {
  return value ? String(value).replace(/[-_]+/g, " ") : "unknown";
}

function formatReviewNumber(value, digits, suffix) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "not recorded";
  return `${number.toFixed(digits)}${suffix}`;
}

function formatReviewDistance(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return "not recorded";
  if (value < 1000) return `${Math.round(value)} meters`;
  return `${(value / 1852).toFixed(value < 3704 ? 1 : 0)} miles`;
}

function formatSecondsForReview(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return secs ? `${minutes} min ${secs} s` : `${minutes} min`;
  return `${secs} s`;
}

function isInsideWindow(timestamp, window) {
  if (!window) return true;
  const ts = Date.parse(timestamp || "");
  if (!Number.isFinite(ts)) return true;
  if (Number.isFinite(window.startMs) && ts < window.startMs) return false;
  if (Number.isFinite(window.endMs) && ts > window.endMs) return false;
  return true;
}

function hourlyMarkers(track) {
  if (track.length < 2) return [];
  const startMs = Date.parse(track[0].ts);
  const endMs = Date.parse(track[track.length - 1].ts);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
  let nextHour = Math.ceil(startMs / 3600000) * 3600000;
  const markers = [];
  while (nextHour <= endMs) {
    const point = nearestTrackPoint(track, nextHour);
    if (point) {
      markers.push({
        ts: new Date(nextHour).toISOString(),
        label: new Date(nextHour).toISOString().slice(11, 16),
        lat: point.lat,
        lon: point.lon,
      });
    }
    nextHour += 3600000;
  }
  return markers;
}

function nearestTrackPoint(track, targetMs) {
  let best = null;
  let bestDiff = Infinity;
  for (const point of track) {
    const diff = Math.abs(Date.parse(point.ts) - targetMs);
    if (diff < bestDiff) {
      best = point;
      bestDiff = diff;
    }
  }
  return best;
}

function thinTrack(track, maxTrackPoints) {
  if (track.length <= maxTrackPoints) return track;
  const result = [];
  const step = (track.length - 1) / (maxTrackPoints - 1);
  for (let i = 0; i < maxTrackPoints; i += 1) {
    result.push(track[Math.round(i * step)]);
  }
  return result;
}

function trackDistanceNm(track) {
  let meters = 0;
  for (let i = 1; i < track.length; i += 1) {
    meters += haversineMeters(track[i - 1], track[i]);
  }
  return meters * METERS_TO_NM;
}

function generateGpx(analysis) {
  const summary = analysis.summary || {};
  const track = Array.isArray(analysis.track) ? analysis.track : [];
  const name = analysis.id || recordingFileStem(analysis.fileName || "voyage");
  const description = [
    analysis.comment,
    summary.startedAt && summary.stoppedAt
      ? `Started ${summary.startedAt}; stopped ${summary.stoppedAt}`
      : "",
    Number.isFinite(summary.distanceNm)
      ? `Distance ${summary.distanceNm.toFixed(2)} NM`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const points = track
    .filter(isFinitePosition)
    .map(
      (point) =>
        `      <trkpt lat="${formatCoordinate(point.lat)}" lon="${formatCoordinate(point.lon)}"><time>${escapeXml(point.ts)}</time></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AJRM Marine Voyage Viewer ${escapeXml(packageInfo.version)}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    ${description ? `<desc>${escapeXml(description)}</desc>` : ""}
    ${summary.startedAt ? `<time>${escapeXml(summary.startedAt)}</time>` : ""}
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    ${description ? `<desc>${escapeXml(description)}</desc>` : ""}
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

function formatCoordinate(value) {
  return Number(value).toFixed(7);
}

function haversineMeters(left, right) {
  const radius = 6371000;
  const lat1 = degreesToRadians(left.lat);
  const lat2 = degreesToRadians(right.lat);
  const dLat = degreesToRadians(right.lat - left.lat);
  const dLon = degreesToRadians(right.lon - left.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function readZipJson(zipPath, innerPath) {
  const text = await readZipEntryText(zipPath, innerPath);
  return JSON.parse(text);
}

async function readCaptureLines(zipPath, innerPath, onRecord) {
  const buffer = readZipEntryBuffer(zipPath, innerPath);
  const input = Readable.from(buffer);
  const stream = innerPath.endsWith(".gz") ? input.pipe(zlib.createGunzip()) : input;
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    onRecord(JSON.parse(line));
  }
}

async function readRecordingLines(recordingPath, onRecord) {
  const input = fs.createReadStream(recordingPath);
  const stream = recordingPath.endsWith(".gz") ? input.pipe(zlib.createGunzip()) : input;
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    onRecord(JSON.parse(line));
  }
}

async function sendGpx(res, analysis, fallbackFile) {
  const gpx = generateGpx(analysis);
  const gpxName = defaultGpxFileName(analysis, fallbackFile);
  res.setHeader("Content-Type", "application/gpx+xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${headerSafeFileName(gpxName)}"`);
  res.send(gpx);
}

function readZipEntryText(zipPath, innerPath) {
  return readZipEntryBuffer(zipPath, innerPath).toString("utf8");
}

function readZipEntryBuffer(zipPath, innerPath) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(innerPath);
  if (!entry || entry.isDirectory) {
    throw new Error(`zip entry not found: ${innerPath}`);
  }
  return entry.getData();
}

async function assertReadableFile(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error("Voyage path is not a file.");
}

function safeVoyageFile(value) {
  const file = path.basename(String(value || ""));
  if (!file || file !== value || !file.endsWith(".zip")) {
    throw new Error("Invalid voyage file.");
  }
  return file;
}

function safeFileKind(value) {
  const kind = String(value || "").toLowerCase();
  if (kind === "voyages" || kind === "clips" || kind === "logs") return kind;
  throw new Error("Invalid file kind.");
}

function safeFileNameForKind(kind, value) {
  if (kind === "voyages") return safeVoyageFile(value);
  const file = path.basename(String(value || ""));
  if (!file || file !== value || !/\.jsonl(\.gz)?$/i.test(file)) {
    throw new Error("Invalid recording file.");
  }
  return file;
}

function recordingStartedAtFromFileName(fileName) {
  const match = String(fileName || "").match(/(\d{8})T?(\d{6})Z?/);
  if (!match) return null;
  const [, date, time] = match;
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isPosition(value) {
  return (
    value &&
    Number.isFinite(Number(value.latitude)) &&
    Number.isFinite(Number(value.longitude))
  );
}

function isFinitePosition(point) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) && point.ts;
}

function isWindSpeedPath(valuePath) {
  return (
    valuePath === "environment.wind.speedApparent" ||
    valuePath === "environment.wind.speedTrue"
  );
}

function metersPerSecondToKnots(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number * MPS_TO_KNOTS : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unwrapValue(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
    return value.value;
  }
  return value;
}

function maxNumber(current, next) {
  if (!Number.isFinite(next)) return current;
  return current == null ? next : Math.max(current, next);
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function touchSampleTimes(result, timestamp) {
  if (!timestamp) return;
  if (!result.sampleStart || timestamp < result.sampleStart) result.sampleStart = timestamp;
  if (!result.sampleEnd || timestamp > result.sampleEnd) result.sampleEnd = timestamp;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function headerSafeFileName(value) {
  return String(value || "voyage.gpx").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function defaultGpxFileName(analysis, fallbackFile = "voyage.zip") {
  const comment = safeFileStem(analysis?.comment || "");
  const fallback = safeFileStem(recordingFileStem(fallbackFile || "voyage"));
  return `${comment || fallback || "voyage"}.gpx`;
}

function recordingFileStem(value) {
  return path.basename(String(value || "voyage")).replace(/\.(zip|jsonl|jsonl\.gz)$/i, "");
}

function safeFileStem(value) {
  return String(value || "")
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

module.exports._private = {
  analyseFileSource,
  analyseRecording,
  analyseVoyage,
  chooseOwnContext,
  defaultGpxFileName,
  generateGpx,
  buildGpsIntegrityAnalysis,
  haversineMeters,
  hourlyMarkers,
  listVoyages,
  legacyPlotCachePath,
  normalizeDrPlotFixes,
  plotCachePath,
  thinTrack,
  trackDistanceNm,
};
