const apiBase = "/plugins/signalk-ajrm-marine-voyage-viewer";
const elements = {
  map: document.querySelector("#map"),
  toggleVoyages: document.querySelector("#toggleVoyages"),
  toggleCharts: document.querySelector("#toggleCharts"),
  refreshVoyages: document.querySelector("#refreshVoyages"),
  toggleSummary: document.querySelector("#toggleSummary"),
  voyageDrawer: document.querySelector("#voyageDrawer"),
  chartDrawer: document.querySelector("#chartDrawer"),
  chartStatus: document.querySelector("#chartStatus"),
  fileTabs: [...document.querySelectorAll(".file-tab")],
  baseMapChoices: [...document.querySelectorAll('input[name="baseMap"]')],
  autoCharts: document.querySelector("#checkAutoCharts"),
  openSeaMap: document.querySelector("#checkOpenSeaMap"),
  voyageList: document.querySelector("#voyageList"),
  statusLine: document.querySelector("#statusLine"),
  selectedDetails: document.querySelector("#selectedDetails"),
  plotSelected: document.querySelector("#plotSelected"),
  reviewSelected: document.querySelector("#reviewSelected"),
  centrePlot: document.querySelector("#centrePlot"),
  toggleDrTrack: document.querySelector("#toggleDrTrack"),
  toggleDrFixes: document.querySelector("#toggleDrFixes"),
  plotProgress: document.querySelector("#plotProgress"),
  progressText: document.querySelector("#progressText"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  summaryPanel: document.querySelector("#summaryPanel"),
  summaryTitle: document.querySelector("#summaryTitle"),
  summarySubtitle: document.querySelector("#summarySubtitle"),
  summaryGrid: document.querySelector("#summaryGrid"),
  reviewPanel: document.querySelector("#reviewPanel"),
  downloadGpx: document.querySelector("#downloadGpx"),
  downloadSelected: document.querySelector("#downloadSelected"),
  comment: document.querySelector("#comment"),
  toast: document.querySelector("#toast"),
};

let map;
let trackLayer;
let drTrackLayer;
let drPlotFixLayer;
let markerLayer;
let baseLayers = {};
let currentBaseLayer;
let autoChartGroup;
let autoChartLayer;
let autoChartFallbackLayer;
let autoChartId;
let autoChartList = [];
let chartResourcesLoaded = false;
let chartResourcesLoading = null;
let seamarkLayer;
const chartLayerZIndex = 450;
const seamarkLayerZIndex = 650;
let progressTimer = null;
let activeKind = "voyages";
let currentFiles = [];
let selectedFile = null;
let plottedBounds = null;
let currentAnalysis = null;
let drTrackVisible = false;
let drFixesVisible = false;

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.style.background = isError ? "#7f1d1d" : "#0f172a";
  elements.toast.classList.add("visible");
  setTimeout(() => elements.toast.classList.remove("visible"), 3500);
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || response.statusText || "Request failed");
  }
  return data;
}

function initMap() {
  map = L.map(elements.map, { zoomControl: true }).setView([56.21, -5.56], 11);
  const naturalEarth = makeNaturalEarthLayer();
  const empty = L.tileLayer("");
  const openStreetMap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors",
  });
  const openTopoMap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 17,
    maxZoom: 22,
    attribution: "Map data © OpenStreetMap contributors | Style © OpenTopoMap",
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxNativeZoom: 17, maxZoom: 22, attribution: "© Esri © OpenStreetMap Contributors" },
  );
  seamarkLayer = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 22,
    zIndex: seamarkLayerZIndex,
    attribution: "© OpenSeaMap contributors",
  });
  baseLayers = {
    Empty: empty,
    "NaturalEarth (offline)": naturalEarth,
    OpenStreetMap: openStreetMap,
    OpenTopoMap: openTopoMap,
    Satellite: satellite,
  };
  autoChartGroup = L.layerGroup();
  setBaseMap(localStorage.getItem("ajrmMarineVoyageViewerBaseMap") || "NaturalEarth (offline)");
  setOverlay(
    autoChartGroup,
    localStorage.getItem("ajrmMarineVoyageViewerAutoCharts") === "true",
    "ajrmMarineVoyageViewerAutoCharts",
  );
  setOverlay(
    seamarkLayer,
    localStorage.getItem("ajrmMarineVoyageViewerOpenSeaMap") !== "false",
    "ajrmMarineVoyageViewerOpenSeaMap",
  );
  trackLayer = L.layerGroup().addTo(map);
  drTrackLayer = L.layerGroup().addTo(map);
  drPlotFixLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on("moveend zoomend", updateAutoChart);
  loadChartResources();
}

function makeNaturalEarthLayer() {
  if (window.protomapsL && window.protomapsL.leafletLayer) {
    const options = {
      url: "./ne_10m_land.pmtiles",
      flavor: "light",
      theme: "light",
      lang: "en",
      maxDataZoom: 5,
    };
    if (
      window.protomapsL.light &&
      window.protomapsL.paintRules &&
      window.protomapsL.labelRules
    ) {
      const theme = {
        ...window.protomapsL.light,
        water: "rgba(0,0,0,0)",
      };
      options.paintRules = window.protomapsL.paintRules(theme);
      options.labelRules = window.protomapsL.labelRules(theme);
    }
    return window.protomapsL.leafletLayer(options);
  }
  return L.tileLayer("", { attribution: "NaturalEarth unavailable" });
}

function setBaseMap(name) {
  if (!map || !baseLayers[name]) return;
  if (currentBaseLayer) map.removeLayer(currentBaseLayer);
  currentBaseLayer = baseLayers[name];
  currentBaseLayer.addTo(map);
  localStorage.setItem("ajrmMarineVoyageViewerBaseMap", name);
  for (const choice of elements.baseMapChoices) {
    choice.checked = choice.value === name;
  }
  keepChartLayersOnTop();
}

function setOverlay(layer, enabled, storageKey) {
  if (!map || !layer) return;
  if (enabled) layer.addTo(map);
  else map.removeLayer(layer);
  localStorage.setItem(storageKey, String(enabled));
  if (layer === autoChartGroup) elements.autoCharts.checked = enabled;
  if (layer === seamarkLayer) elements.openSeaMap.checked = enabled;
  updateAutoChart();
  keepChartLayersOnTop();
}

async function setAutoChartsEnabled(enabled) {
  setOverlay(autoChartGroup, enabled, "ajrmMarineVoyageViewerAutoCharts");
  if (enabled && !chartResourcesLoaded) {
    elements.chartStatus.textContent = "Loading Signal K chart resources…";
    await loadChartResources({ force: true });
    updateAutoChart();
  }
}

function chartUrl(chart) {
  return chart?.tilemapUrl || chart?.url || chart?.tileUrl || chart?.href || "";
}

function chartZoom(chart) {
  const min = Number(chart?.minzoom ?? chart?.minZoom ?? 0);
  const max = Number(chart?.maxzoom ?? chart?.maxZoom ?? 24);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 24,
  };
}

function chartBoundsCandidates(chart) {
  const source =
    chart?.bounds ||
    chart?.boundingBox ||
    chart?.extent ||
    chart?.bbox ||
    chart?.properties?.bounds ||
    chart?.properties?.bbox ||
    chart?.metadata?.bounds;
  const candidates = [];
  if (Array.isArray(source) && source.some(Array.isArray)) {
    const points = source
      .filter(Array.isArray)
      .map((point) => point.slice(0, 2).map(Number))
      .filter((point) => point.length === 2 && point.every(Number.isFinite));
    if (points.length >= 2) {
      const xs = points.map((point) => point[0]);
      const ys = points.map((point) => point[1]);
      candidates.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      candidates.push([Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]);
    }
  } else {
    let bounds = null;
    if (Array.isArray(source)) {
      bounds = source.slice(0, 4).map(Number);
    } else if (typeof source === "string") {
      bounds = source.split(/[\\s,]+/).map(Number).filter(Number.isFinite).slice(0, 4);
    } else if (source && typeof source === "object") {
      if (source.sw && source.ne) {
        bounds = [
          source.sw.lng ?? source.sw.lon ?? source.sw[1],
          source.sw.lat ?? source.sw[0],
          source.ne.lng ?? source.ne.lon ?? source.ne[1],
          source.ne.lat ?? source.ne[0],
        ].map(Number);
      } else {
        bounds = [
          source.minLon ?? source.west ?? source.left ?? source.minx ?? source.xmin,
          source.minLat ?? source.south ?? source.bottom ?? source.miny ?? source.ymin,
          source.maxLon ?? source.east ?? source.right ?? source.maxx ?? source.xmax,
          source.maxLat ?? source.north ?? source.top ?? source.maxy ?? source.ymax,
        ].map(Number);
      }
    }
    if (bounds?.length >= 4) {
      const [a, b, c, d] = bounds;
      candidates.push([Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]);
      candidates.push([Math.min(b, d), Math.min(a, c), Math.max(b, d), Math.max(a, c)]);
    }
  }
  return candidates.filter(
    (bounds) =>
      bounds.every(Number.isFinite) &&
      bounds[0] >= -180 &&
      bounds[2] <= 180 &&
      bounds[1] >= -90 &&
      bounds[3] <= 90 &&
      bounds[0] < bounds[2] &&
      bounds[1] < bounds[3],
  );
}

function chartBounds(chart, lat, lon) {
  const candidates = chartBoundsCandidates(chart);
  return (
    candidates.find(
      (bounds) => lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3],
    ) ||
    candidates[0] ||
    null
  );
}

function chartContains(chart, lat, lon) {
  const bounds = chartBounds(chart, lat, lon);
  return Boolean(bounds && lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]);
}

function chartArea(chart, lat, lon) {
  const bounds = chartBounds(chart, lat, lon);
  return bounds ? Math.abs((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])) : Number.MAX_VALUE;
}

function makeAutoChartLayer(chart) {
  const url = chartUrl(chart);
  if (!url) return null;
  const zoom = chartZoom(chart);
  return L.tileLayer(url, {
    minNativeZoom: zoom.min,
    maxNativeZoom: zoom.max,
    minZoom: zoom.min,
    maxZoom: 22,
    zIndex: chartLayerZIndex,
    attribution: "",
    errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
  });
}

function makeAutoChartFallbackLayer() {
  return L.tileLayer("", { attribution: "" });
}

function chooseAutoChart() {
  if (!map) return null;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const containing = autoChartList.filter((chart) => chartContains(chart, center.lat, center.lng));
  const matches = containing.filter((chart) => {
    const range = chartZoom(chart);
    return zoom >= range.min - 0.1 && zoom <= map.getMaxZoom() + 0.1;
  });
  return (
    matches.sort((a, b) => {
      const zoomA = chartZoom(a);
      const zoomB = chartZoom(b);
      return (
        zoomB.min - zoomA.min ||
        chartArea(a, center.lat, center.lng) - chartArea(b, center.lat, center.lng) ||
        zoomB.max - zoomA.max
      );
    })[0] || null
  );
}

function updateAutoChart() {
  if (!map || !autoChartGroup || !map.hasLayer(autoChartGroup)) return;
  if (!chartResourcesLoaded) {
    elements.chartStatus.textContent = chartResourcesLoading
      ? "Loading Signal K chart resources…"
      : "Chart resources have not loaded yet.";
    return;
  }
  const chart = chooseAutoChart();
  if (!chart) {
    elements.chartStatus.textContent = autoChartList.length
      ? "No chart covers the current map centre."
      : "No Signal K chart resources found.";
    if (autoChartId === "__fallback") return;
    autoChartGroup.clearLayers();
    autoChartLayer = null;
    autoChartId = "__fallback";
    autoChartFallbackLayer = makeAutoChartFallbackLayer();
    autoChartGroup.addLayer(autoChartFallbackLayer);
    keepChartLayersOnTop();
    return;
  }
  elements.chartStatus.textContent = chart.name || chart.description || chart.__autoChartId || "Auto chart selected";
  if (autoChartId === chart.__autoChartId && autoChartLayer && autoChartGroup.hasLayer(autoChartLayer)) {
    keepChartLayersOnTop();
    return;
  }
  autoChartGroup.clearLayers();
  autoChartLayer = makeAutoChartLayer(chart);
  autoChartId = chart.__autoChartId;
  if (autoChartLayer) autoChartGroup.addLayer(autoChartLayer);
  keepChartLayersOnTop();
}

async function loadChartResources({ force = false } = {}) {
  if (chartResourcesLoading) return chartResourcesLoading;
  if (chartResourcesLoaded && !force) return autoChartList;
  chartResourcesLoading = (async () => {
    try {
      let charts = null;
      try {
        charts = await requestJson("/signalk/v1/api/resources/charts");
      } catch (_error) {
        const data = await requestJson(`${apiBase}/charts`);
        charts = data.charts || {};
      }
      autoChartList = Object.entries(charts || {}).map(([id, chart]) => ({
        ...(chart || {}),
        __autoChartId: id,
      }));
      chartResourcesLoaded = true;
      elements.chartStatus.textContent = `${autoChartList.length} chart resource${autoChartList.length === 1 ? "" : "s"} found`;
      updateAutoChart();
    } catch (error) {
      autoChartList = [];
      chartResourcesLoaded = false;
      elements.chartStatus.textContent = `Chart resources not available: ${error.message}`;
    } finally {
      chartResourcesLoading = null;
    }
    return autoChartList;
  })();
  return chartResourcesLoading;
}

function keepChartLayersOnTop() {
  autoChartGroup?.eachLayer((layer) => layer.setZIndex?.(chartLayerZIndex));
  if (seamarkLayer && map?.hasLayer(seamarkLayer)) {
    seamarkLayer.setZIndex?.(seamarkLayerZIndex);
    seamarkLayer.bringToFront?.();
  }
  trackLayer?.eachLayer((layer) => layer.bringToFront?.());
  drTrackLayer?.eachLayer((layer) => layer.bringToFront?.());
  drPlotFixLayer?.eachLayer((layer) => layer.bringToFront?.());
  markerLayer?.eachLayer((layer) => layer.bringToFront?.());
}

async function loadFiles(kind = activeKind) {
  activeKind = kind;
  selectedFile = null;
  currentFiles = [];
  updateFileTabs();
  updateSelection();
  showSelectedPlaceholder();
  elements.statusLine.textContent = `Loading ${labelForKind(kind, "plural").toLowerCase()}…`;
  elements.voyageList.innerHTML = "";
  try {
    const data = await requestJson(`${apiBase}/files/${kind}`);
    currentFiles = data.files || [];
    renderFiles(currentFiles);
  } catch (error) {
    elements.statusLine.textContent = error.message;
    showToast(error.message, true);
  }
}

function renderFiles(files) {
  elements.statusLine.textContent = `${files.length} ${labelForKind(activeKind, files.length === 1 ? "singular" : "plural").toLowerCase()} found`;
  if (files.length === 0) {
    elements.voyageList.innerHTML = `<p class="empty">No ${labelForKind(activeKind, "plural").toLowerCase()} found in the configured directory.</p>`;
    return;
  }
  elements.voyageList.replaceChildren(
    ...files.map((file) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "file-row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.innerHTML = `
        <strong>${escapeHtml(file.fileName)}</strong>
        ${file.comment ? `<span class="file-comment">${escapeHtml(file.comment)}</span>` : ""}
        <span>${escapeHtml(fileMeta(file))}</span>
      `;
      row.addEventListener("click", () => selectFile(file));
      return row;
    }),
  );
}

function selectFile(file) {
  selectedFile = file;
  for (const row of elements.voyageList.querySelectorAll(".file-row")) {
    const selected = row.querySelector("strong")?.textContent === file.fileName;
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", String(selected));
  }
  updateSelection();
  showSelectedPlaceholder();
}

function updateSelection() {
  const hasSelection = Boolean(selectedFile);
  elements.plotSelected.disabled = !hasSelection;
  elements.reviewSelected.disabled = !hasSelection;
  elements.centrePlot.disabled = !plottedBounds;
  setLinkEnabled(elements.downloadGpx, hasSelection);
  setLinkEnabled(elements.downloadSelected, hasSelection);
  if (!hasSelection) {
    elements.selectedDetails.textContent = `Select one of the ${labelForKind(activeKind, "plural").toLowerCase()} below.`;
    elements.downloadGpx.href = "#";
    elements.downloadSelected.href = "#";
    return;
  }
  elements.selectedDetails.textContent = selectedFile.comment
    ? `${selectedFile.fileName} · ${selectedFile.comment} · ${fileMeta(selectedFile)}`
    : `${selectedFile.fileName} · ${fileMeta(selectedFile)}`;
  elements.downloadSelected.href = "#";
  elements.downloadSelected.download = selectedFile.fileName;
  elements.downloadGpx.href = gpxUrl(activeKind, selectedFile.fileName);
  elements.downloadGpx.download = gpxFileName(selectedFile.fileName);
}

function showSelectedPlaceholder() {
  plottedBounds = null;
  currentAnalysis = null;
  drTrackVisible = false;
  drFixesVisible = false;
  elements.centrePlot.disabled = true;
  elements.toggleDrTrack.disabled = true;
  elements.toggleDrTrack.setAttribute("aria-pressed", "false");
  elements.toggleDrFixes.disabled = true;
  elements.toggleDrFixes.setAttribute("aria-pressed", "false");
  elements.summaryTitle.textContent = selectedFile?.fileName || "Voyage summary";
  elements.summarySubtitle.textContent = selectedFile
    ? "Press Plot to draw the track, or Review for the voyage summary."
    : "";
  elements.summaryGrid.replaceChildren();
  renderReview(null);
  elements.comment.textContent = "";
}

async function analyseSelectedFile() {
  if (!selectedFile) return;
  await analyseFile(activeKind, selectedFile.fileName, { plot: true });
}

async function reviewSelectedFile() {
  if (!selectedFile) return;
  await analyseFile(activeKind, selectedFile.fileName, { plot: false });
}

async function analyseFile(kind, fileName, { plot = true } = {}) {
  startPlotProgress(fileName);
  showToast(plot ? `Analysing ${fileName}…` : `Reviewing ${fileName}…`);
  elements.statusLine.textContent = plot ? `Analysing ${fileName}…` : `Reviewing ${fileName}…`;
  try {
    const data = await requestJson(
      `${apiBase}/files/${encodeURIComponent(kind)}/${encodeURIComponent(fileName)}/analyse`,
      { method: "POST" },
    );
    setPlotProgress(90, plot ? "Rendering track and summary…" : "Rendering review…");
    if (plot) {
      renderAnalysis(data.analysis, { showSummary: false });
      finishPlotProgress("Voyage plotted.");
      showToast("Voyage plotted.");
    } else {
      currentAnalysis = data.analysis;
      renderSummary(data.analysis);
      finishPlotProgress("Voyage reviewed.");
      showToast("Voyage reviewed.");
    }
  } catch (error) {
    failPlotProgress(error.message);
    showToast(error.message, true);
    elements.statusLine.textContent = error.message;
  }
}

function startPlotProgress(fileName) {
  clearInterval(progressTimer);
  elements.plotProgress.classList.remove("hidden");
  setPlotProgress(0, `Opening ${fileName}…`);
  let elapsed = 0;
  let phase = "opening";
  const scanSeconds = estimatedScanSeconds(selectedFile);
  progressTimer = setInterval(() => {
    elapsed += 0.5;
    if (phase === "opening" && elapsed >= 1) {
      phase = "scanning";
      elapsed = 0;
      setPlotProgress(0, `Scanning ${estimatedDurationLabel(selectedFile)} of Signal K data…`);
      return;
    }
    if (phase === "scanning") {
      const ratio = Math.min(0.98, elapsed / scanSeconds);
      const percent = 4 + ratio * 78;
      setPlotProgress(percent, `Scanning Signal K data… ${Math.round(percent)}%`);
      return;
    }
    setPlotProgress(Math.min(8, elapsed * 8), `Opening ${fileName}…`);
  }, 500);
}

function estimatedScanSeconds(file) {
  const started = Date.parse(file?.startedAt || "");
  const stopped = Date.parse(file?.stoppedAt || "");
  const hours = Number.isFinite(started) && Number.isFinite(stopped)
    ? Math.max(0.1, (stopped - started) / 3600000)
    : 1;
  return Math.max(8, Math.min(90, 6 + hours * 5));
}

function estimatedDurationLabel(file) {
  const started = Date.parse(file?.startedAt || "");
  const stopped = Date.parse(file?.stoppedAt || "");
  if (!Number.isFinite(started) || !Number.isFinite(stopped)) return "the voyage";
  return formatDuration((stopped - started) / 1000);
}

function setPlotProgress(percent, message) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  elements.progressBar.style.width = `${value}%`;
  elements.progressPercent.textContent = `${value}%`;
  elements.progressText.textContent = message;
}

function finishPlotProgress(message) {
  clearInterval(progressTimer);
  progressTimer = null;
  setPlotProgress(100, message);
  setTimeout(() => {
    elements.plotProgress.classList.add("hidden");
  }, 1200);
}

function failPlotProgress(message) {
  clearInterval(progressTimer);
  progressTimer = null;
  setPlotProgress(100, message || "Plot failed.");
  elements.plotProgress.classList.add("failed");
  setTimeout(() => {
    elements.plotProgress.classList.add("hidden");
    elements.plotProgress.classList.remove("failed");
  }, 4500);
}

function startExportProgress(fileName) {
  clearInterval(progressTimer);
  elements.plotProgress.classList.remove("hidden", "failed");
  setPlotProgress(8, `Preparing GPX export for ${fileName}…`);
  const stages = [
    [24, "Opening recording…"],
    [42, "Reading track points…"],
    [62, "Building GPX file…"],
    [78, "Preparing download…"],
    [90, "Handing GPX to browser…"],
  ];
  let index = 0;
  progressTimer = setInterval(() => {
    if (index < stages.length) {
      setPlotProgress(stages[index][0], stages[index][1]);
      index += 1;
    }
  }, 650);
}

function startDownloadProgress(fileName) {
  clearInterval(progressTimer);
  elements.plotProgress.classList.remove("hidden", "failed");
  setPlotProgress(8, `Preparing download for ${fileName}…`);
  const stages = [
    [28, "Requesting voyage bundle…"],
    [52, "Collating files…"],
    [76, "Receiving download…"],
    [90, "Handing file to browser…"],
  ];
  let index = 0;
  progressTimer = setInterval(() => {
    if (index < stages.length) {
      setPlotProgress(stages[index][0], stages[index][1]);
      index += 1;
    }
  }, 700);
}

async function exportSelectedGpx(event) {
  event.preventDefault();
  if (!selectedFile || elements.downloadGpx.classList.contains("disabled")) return;
  const fileName = selectedFile.fileName;
  startExportProgress(fileName);
  showDownloadFeedback(elements.downloadGpx, "Preparing…");
  try {
    const response = await fetch(gpxUrl(activeKind, fileName), { headers: { Accept: "application/gpx+xml" } });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || response.statusText || "GPX export failed");
    }
    setPlotProgress(94, "Saving GPX download…");
    const blob = await response.blob();
    downloadBlob(blob, elements.downloadGpx.download || gpxFileName(fileName));
    finishPlotProgress("GPX download ready.");
    showToast("GPX download ready.");
  } catch (error) {
    failPlotProgress(error.message);
    showToast(error.message, true);
  }
}

async function downloadSelectedFile(event) {
  event.preventDefault();
  if (!selectedFile || elements.downloadSelected.classList.contains("disabled")) return;
  const fileName = selectedFile.fileName;
  startDownloadProgress(fileName);
  showDownloadFeedback(elements.downloadSelected, "Preparing…");
  try {
    const response = await fetch(downloadUrl(activeKind, fileName), {
      headers: { Accept: "application/zip,application/gzip,application/octet-stream,*/*" },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || response.statusText || "Download failed");
    }
    const blob = await response.blob();
    const downloadName = fileNameFromContentDisposition(response.headers.get("Content-Disposition"))
      || elements.downloadSelected.download
      || fileName;
    downloadBlob(blob, downloadName);
    finishPlotProgress("Download ready.");
    showToast("Download ready.");
  } catch (error) {
    failPlotProgress(error.message);
    showToast(error.message, true);
  }
}

function fileNameFromContentDisposition(header) {
  const value = String(header || "");
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utf8Match[1].trim().replace(/^"|"$/g, "");
    }
  }
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : "";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "voyage.gpx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function renderAnalysis(analysis, { showSummary = true } = {}) {
  currentAnalysis = analysis;
  const track = analysis.track || [];
  trackLayer.clearLayers();
  drTrackLayer.clearLayers();
  drPlotFixLayer.clearLayers();
  markerLayer.clearLayers();
  plottedBounds = null;
  if (track.length > 1) {
    const line = L.polyline(
      track.map((point) => [point.lat, point.lon]),
      { color: "#f97316", weight: 8, opacity: 0.92 },
    ).addTo(trackLayer);
    plottedBounds = line.getBounds();
    centrePlot();
    addEndMarker(track[0], "Start", "#22c55e");
    addEndMarker(track[track.length - 1], "Finish", "#ef4444");
  }
  drTrackVisible = Boolean(hasDrTracks(analysis.drTracks));
  elements.toggleDrTrack.disabled = !drTrackVisible;
  elements.toggleDrTrack.setAttribute("aria-pressed", String(drTrackVisible));
  renderDrTracks();
  drFixesVisible = Boolean(hasDrPlotFixes(analysis.drPlotFixes));
  elements.toggleDrFixes.disabled = !drFixesVisible;
  elements.toggleDrFixes.setAttribute("aria-pressed", String(drFixesVisible));
  renderDrPlotFixes();
  elements.centrePlot.disabled = !plottedBounds;
  for (const marker of analysis.hourlyMarkers || []) {
    L.marker([marker.lat, marker.lon], {
      icon: L.divIcon({
        className: "hour-marker",
        html: `<span>${escapeHtml(marker.label)}</span>`,
        iconSize: [54, 28],
        iconAnchor: [27, 14],
      }),
    }).addTo(markerLayer);
  }
  keepChartLayersOnTop();
  if (showSummary) {
    renderSummary(analysis);
  } else {
    elements.summaryTitle.textContent = analysis.fileName || analysis.id || "Voyage";
    elements.summarySubtitle.textContent = "Track plotted. Press Review for voyage summary and findings.";
    elements.summaryGrid.replaceChildren();
    renderReview(null);
  }
}

function hasDrTracks(drTracks) {
  return Boolean(
    drTracks &&
      ((drTracks.operational || []).length > 1 ||
        (drTracks.integrity || []).length > 1 ||
        (drTracks.recoveryJumps || []).length > 0),
  );
}

function hasDrPlotFixes(drPlotFixes) {
  return (drPlotFixes?.plotFixes || []).length > 0;
}

function renderDrTracks() {
  drTrackLayer.clearLayers();
  const drTracks = currentAnalysis?.drTracks;
  if (!drTrackVisible || !hasDrTracks(drTracks)) return;
  addTrackLine(drTracks.gps, { color: "#16a34a", weight: 3, opacity: 0.52 });
  addTrackLine(drTracks.operational, {
    color: "#0f172a",
    weight: 4,
    opacity: 0.72,
    dashArray: "2 8",
  });
  addTrackLine(drTracks.integrity, {
    color: "#f97316",
    weight: 3,
    opacity: 0.72,
    dashArray: "8 6",
  });
  for (const jump of drTracks.recoveryJumps || []) {
    if (!jump.from || !jump.to) continue;
    L.polyline(
      [[jump.from.lat, jump.from.lon], [jump.to.lat, jump.to.lon]],
      { color: "#dc2626", weight: 5, opacity: 0.85, dashArray: "10 5" },
    )
      .bindTooltip(`DR recovery jump ${Math.round(jump.meters || 0)} m`, { permanent: false })
      .addTo(drTrackLayer);
  }
  keepChartLayersOnTop();
}

function renderDrPlotFixes() {
  drPlotFixLayer.clearLayers();
  const fixes = currentAnalysis?.drPlotFixes?.plotFixes || [];
  if (!drFixesVisible || !fixes.length) return;
  for (const fix of fixes) {
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) continue;
    const latlng = [fix.lat, fix.lon];
    const marker = L.marker(latlng, {
      icon: L.divIcon({
        className: `plot-fix-symbol-marker ${plotFixMarkerClass(fix)}`,
        html: `<span class="plot-fix-symbol"></span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -18],
      }),
    });
    marker.bindPopup(plotFixPopupHtml(fix), { maxWidth: 320 });
    marker.addTo(drPlotFixLayer);
    L.marker(latlng, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "plot-fix-label-marker",
        html: `<span class="plot-fix-time">${escapeHtml(formatTime(fix.timestamp))}</span>`,
        iconSize: [74, 24],
        iconAnchor: [37, 38],
      }),
    }).addTo(drPlotFixLayer);
  }
  keepChartLayersOnTop();
}

function plotFixMarkerClass(fix) {
  const classes = [fix.plotType || (fix.automatic ? "timed" : "manual")];
  if (fix.plotType === "observed-fix") {
    classes.push("observed-fix");
  } else {
    classes.push(fix.trust === "lost" || fix.plotType === "gps-lost" ? "estimated-position" : "electronic-fix");
  }
  return classes.join(" ");
}

function plotFixPopupHtml(fix) {
  return `
    <div class="plot-popup">
      <h3>${escapeHtml(plotFixTitle(fix))} ${escapeHtml(formatTime(fix.timestamp))}</h3>
      <dl>
        ${popupRow("Position", formatPosition(fix))}
        ${fix.note ? popupRow("Note", fix.note) : ""}
        ${popupRow("GPS status", fix.trust ? fix.trust.toUpperCase() : "n/a")}
        ${popupRow("DR source", fix.drSource || "n/a")}
        ${popupRow("Uncertainty", formatMeters(fix.uncertaintyRadiusMeters))}
        ${popupRow("Last trusted GPS", formatAge(fix.lastTrustedFixAgeSeconds))}
        ${popupRow("DR distance since GPS", formatDistance(fix.distanceFromLastTrustedFixMeters))}
        ${popupRow("STW / heading", `${formatKnotsFromMps(fix.stwMps)} / ${formatDegrees(fix.headingTrueDegrees)}`)}
        ${popupRow("SOG / COG", `${formatKnotsFromMps(fix.sogMps)} / ${formatDegrees(fix.cogTrueDegrees)}`)}
        ${popupRow("Tide set / drift", `${formatDegrees(fix.currentSetTrueDegrees)} / ${formatKnotsFromMps(fix.currentDriftMps)}`)}
      </dl>
    </div>
  `;
}

function plotFixTitle(fix) {
  if (fix.trust === "lost" || fix.plotType === "gps-lost") return "Estimated position";
  if (fix.plotType === "gps-return") return "GPS fix";
  if (fix.plotType === "observed-fix") return "Observed fix";
  if (fix.plotType === "timed" || fix.automatic) return "Timed plot fix";
  return "Manual plot fix";
}

function addTrackLine(points, options) {
  const valid = (points || []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (valid.length < 2) return null;
  return L.polyline(valid.map((point) => [point.lat, point.lon]), options).addTo(drTrackLayer);
}

function centrePlot() {
  if (!map || !plottedBounds?.isValid?.()) return;
  const leftPadding = elements.voyageDrawer.classList.contains("open") ? 380 : 28;
  const bottomPadding = elements.summaryPanel.classList.contains("open")
    ? Math.min(260, Math.round(elements.summaryPanel.getBoundingClientRect().height) + 24)
    : 28;
  map.fitBounds(plottedBounds, {
    paddingTopLeft: [leftPadding, 96],
    paddingBottomRight: [28, bottomPadding],
    maxZoom: 17,
  });
  setTimeout(updateAutoChart, 0);
  keepChartLayersOnTop();
}

function addEndMarker(point, label, color) {
  L.circleMarker([point.lat, point.lon], {
    radius: 7,
    color: "#fff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  }).bindTooltip(label, { permanent: false }).addTo(markerLayer);
}

function renderSummary(analysis) {
  const summary = analysis.summary || {};
  elements.summaryTitle.textContent = analysis.fileName || analysis.id || "Voyage";
  elements.summarySubtitle.textContent = `${formatDateTime(summary.startedAt)} → ${formatDateTime(summary.stoppedAt)}`;
  elements.downloadGpx.href = analysis.gpxUrl || gpxUrl(analysis.sourceKind || activeKind, analysis.fileName);
  elements.downloadGpx.download = gpxFileNameFromAnalysis(analysis);
  setLinkEnabled(elements.downloadGpx, true);
  elements.comment.textContent = "";
  const rows = [
    ["Duration", formatDuration(summary.durationSeconds)],
    ["Distance", formatNumber(summary.distanceNm, 1, " NM")],
    ["Avg", formatNumber(summary.averageSpeedKnots, 1, " kn")],
    ["Avg SOG", formatNumber(summary.averageRecordedSogKnots, 1, " kn")],
    ["Max SOG", formatNumber(summary.maxSogKnots, 1, " kn")],
    ["Max AWS", formatNumber(summary.maxApparentWindKnots, 1, " kn")],
    ["Max TWS", formatNumber(summary.maxTrueWindKnots, 1, " kn")],
    ["Min depth", formatNumber(summary.minDepthMeters, 1, " m")],
    ["Points", `${summary.trackPoints || 0} (${analysis.track?.length || 0} plotted)`],
    ["DR track", drTrackSummary(analysis.drTracks)],
    ["DR fixes", drPlotFixSummary(analysis.drPlotFixes)],
    ["GPS integrity", gpsIntegritySummary(analysis.gpsIntegrity || summary.gpsIntegrity)],
    ["GPS outages", gpsOutageSummary(analysis.gpsIntegrity || summary.gpsIntegrity)],
    ["GPS rejected", gpsRejectedSummary(analysis.gpsIntegrity || summary.gpsIntegrity)],
    ["GPS/DR mismatch", gpsDrMismatchSummary(analysis.gpsIntegrity || summary.gpsIntegrity)],
    ["Traffic", trafficSummary(analysis.traffic || summary.traffic)],
    ["Snapshots", String(summary.snapshotCount || 0)],
    ["Start", summary.startReason || "—"],
    ["Stop", summary.stopReason || "—"],
  ];
  if (analysis.comment) {
    rows.push(["Comment", `“${analysis.comment}”`]);
  }
  elements.summaryGrid.replaceChildren(
    ...rows.map(([label, value]) => {
      const item = document.createElement("div");
      item.className = "summary-item";
      item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
      return item;
    }),
  );
  renderReview(analysis.review);
}

function renderReview(review) {
  const panel = elements.reviewPanel;
  if (!panel) return;
  if (!review) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  panel.hidden = false;
  const statusRow = document.createElement("div");
  statusRow.className = "review-status-row";
  if (review.softwareStatus) statusRow.append(reviewLight("Software", review.softwareStatus));
  statusRow.append(reviewLight("Voyage data", review.voyageStatus || review.status || "amber"));

  const headline = document.createElement("p");
  headline.className = "review-headline";
  headline.textContent = review.headline || "Voyage review complete.";

  const paragraphs = document.createElement("div");
  paragraphs.className = "review-copy";
  for (const text of review.paragraphs || []) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    paragraphs.append(paragraph);
  }

  const list = document.createElement("div");
  list.className = "review-findings";
  for (const finding of review.findings || []) {
    const item = document.createElement("article");
    item.className = `review-finding ${reviewLevelClass(finding.level)}`;
    item.innerHTML = `
      <strong>${escapeHtml(finding.title || "Finding")}</strong>
      <span>${escapeHtml(finding.category === "software" ? "Software" : "Voyage data")}</span>
      <p>${escapeHtml(finding.detail || "")}</p>
    `;
    list.append(item);
  }

  panel.replaceChildren(statusRow, headline, paragraphs, list);
}

function reviewLight(label, level) {
  const item = document.createElement("div");
  item.className = `review-light ${reviewLevelClass(level)}`;
  item.innerHTML = `<span aria-hidden="true"></span><strong>${escapeHtml(label)}</strong><em>${escapeHtml(String(level || "unknown").toUpperCase())}</em>`;
  return item;
}

function reviewLevelClass(level) {
  if (level === "green" || level === "red" || level === "amber") return level;
  return "amber";
}

function gpsIntegritySummary(gpsIntegrity) {
  const summary = gpsIntegrity?.summary || gpsIntegrity || {};
  if (!summary.available) return "—";
  const trust = summary.finalTrust ? titleCase(summary.finalTrust) : "Unknown";
  const evaluations = Number.isFinite(summary.evaluations) ? `${summary.evaluations} evals` : `${summary.samples || 0} samples`;
  const lastReason = summary.finalTrust && summary.finalTrust !== "normal" && summary.lastReason
    ? ` · ${summary.lastReason}`
    : "";
  return `${trust} · ${evaluations}${lastReason}`;
}

function trafficSummary(traffic) {
  const summary = traffic || {};
  if (!summary.available) return "—";
  const sizes = [];
  if (summary.bySize?.small) sizes.push(`${summary.bySize.small} S`);
  if (summary.bySize?.medium) sizes.push(`${summary.bySize.medium} M`);
  if (summary.bySize?.large) sizes.push(`${summary.bySize.large} L`);
  if (summary.bySize?.unknown) sizes.push(`${summary.bySize.unknown} ?`);
  return `${summary.vesselsEncountered || 0} vessels${sizes.length ? ` (${sizes.join(", ")})` : ""} · ${summary.advisories || 0} adv · ${summary.collisionAlerts || 0} coll`;
}

function gpsOutageSummary(gpsIntegrity) {
  const summary = gpsIntegrity?.summary || gpsIntegrity || {};
  if (!summary.available) return "—";
  const count = Number.isFinite(summary.lostFixes) ? summary.lostFixes : summary.lostPeriods || 0;
  if (!count) return "None";
  return `${count} · ${formatDuration(summary.totalLostSeconds || 0)} total · ${formatDuration(summary.longestLostSeconds || 0)} longest`;
}

function gpsRejectedSummary(gpsIntegrity) {
  const summary = gpsIntegrity?.summary || gpsIntegrity || {};
  if (!summary.available) return "—";
  const rejected = summary.rejectedFixes || 0;
  const jumps = summary.positionJumps || 0;
  if (!rejected && !jumps) return "None";
  return `${rejected} rejected · ${jumps} jump${jumps === 1 ? "" : "s"}`;
}

function gpsDrMismatchSummary(gpsIntegrity) {
  const summary = gpsIntegrity?.summary || gpsIntegrity || {};
  if (!summary.available) return "—";
  const mismatches = summary.drDiscrepancies || 0;
  const uncertainty = Number.isFinite(summary.maxOperationalUncertaintyMeters)
    ? ` · max DR ${Math.round(summary.maxOperationalUncertaintyMeters)} m`
    : "";
  return mismatches ? `${mismatches}${uncertainty}` : `None${uncertainty}`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function drTrackSummary(drTracks) {
  if (!hasDrTracks(drTracks)) return "—";
  const source = drTracks.source === "bundle" ? "bundle" : "capture";
  const operational = drTracks.original?.operational || (drTracks.operational || []).length;
  const jumps = (drTracks.recoveryJumps || []).length;
  return jumps ? `${operational} points · ${jumps} jump${jumps === 1 ? "" : "s"} · ${source}` : `${operational} points · ${source}`;
}

function drPlotFixSummary(drPlotFixes) {
  const count = (drPlotFixes?.plotFixes || []).length;
  if (!count) return "—";
  const source = drPlotFixes.source === "bundle" ? "bundle" : "capture";
  return `${count} fix${count === 1 ? "" : "es"} · ${source}`;
}

function gpxUrl(kind, fileName) {
  return `${apiBase}/files/${encodeURIComponent(kind)}/${encodeURIComponent(fileName)}/track.gpx`;
}

function downloadUrl(kind, fileName) {
  return `${apiBase}/files/${encodeURIComponent(kind)}/${encodeURIComponent(fileName)}/download`;
}

function gpxFileName(fileName) {
  return `${String(fileName || "voyage").replace(/\\.(zip|jsonl|jsonl\\.gz)$/i, "")}.gpx`;
}

function gpxFileNameFromAnalysis(analysis) {
  const commentName = safeFileStem(analysis.comment || "");
  return `${commentName || String(analysis.id || analysis.fileName || "voyage").replace(/\\.(zip|jsonl|jsonl\\.gz)$/i, "")}.gpx`;
}

function safeFileStem(value) {
  return String(value || "")
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatPosition(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "n/a";
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? "E" : "W"}`;
}

function formatMeters(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} m` : "n/a";
}

function formatDistance(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters)) return "n/a";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1852).toFixed(meters < 3704 ? 1 : 0)} miles`;
}

function formatAge(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "n/a";
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

function formatKnotsFromMps(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 1.9438444924406046).toFixed(1)} kn` : "n/a";
}

function formatDegrees(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} deg` : "n/a";
}

function popupRow(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${total % 60}s`;
}

function formatNumber(value, digits, suffix) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(digits)}${suffix}`;
}

function formatBytes(bytes) {
  const number = Number(bytes);
  if (!Number.isFinite(number)) return "—";
  if (number > 1024 * 1024 * 1024) return `${(number / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (number > 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)} MB`;
  return `${(number / 1024).toFixed(1)} KB`;
}

function fileMeta(file) {
  const date = file.startedAt || file.modifiedAt;
  const parts = [formatDateTime(date), formatBytes(file.bytes)];
  if (file.stoppedAt) parts.push(`to ${formatDateTime(file.stoppedAt)}`);
  if (file.compressed) parts.push("compressed");
  return parts.filter((part) => part && part !== "—").join(" · ") || "—";
}

function labelForKind(kind, form = "plural") {
  const labels = {
    clips: ["Clip", "Clips"],
    logs: ["Log", "Logs"],
    voyages: ["Voyage", "Voyages"],
  };
  return (labels[kind] || labels.voyages)[form === "singular" ? 0 : 1];
}

function updateFileTabs() {
  for (const tab of elements.fileTabs) {
    const selected = tab.dataset.kind === activeKind;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  }
}

function setLinkEnabled(link, enabled) {
  link.classList.toggle("disabled", !enabled);
  link.setAttribute("aria-disabled", String(!enabled));
  if (!enabled) link.href = "#";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function refreshMapLayout() {
  map.invalidateSize({ pan: false });
  updateAutoChart();
}

function showDownloadFeedback(link, temporaryText = "Downloading…") {
  if (!link) return;
  if (link.classList.contains("disabled") || link.getAttribute("aria-disabled") === "true") return;
  const originalText = link.dataset.originalText || link.textContent;
  link.dataset.originalText = originalText;
  link.classList.add("downloading");
  link.textContent = temporaryText;
  showToast("Preparing download…");
  setTimeout(() => {
    link.classList.remove("downloading");
    link.textContent = originalText;
  }, 1400);
}

function syncPanelButtons() {
  elements.toggleVoyages.setAttribute("aria-pressed", String(elements.voyageDrawer.classList.contains("open")));
  elements.toggleCharts.setAttribute("aria-pressed", String(elements.chartDrawer.classList.contains("open")));
  elements.toggleSummary.setAttribute("aria-pressed", String(elements.summaryPanel.classList.contains("open")));
}

function togglePanel(panel) {
  const open = !panel.classList.contains("open");
  panel.classList.toggle("open", open);
  syncPanelButtons();
  setTimeout(refreshMapLayout, 180);
}

elements.toggleVoyages.addEventListener("click", () => togglePanel(elements.voyageDrawer));
elements.toggleCharts.addEventListener("click", () => togglePanel(elements.chartDrawer));
elements.refreshVoyages.addEventListener("click", () => loadFiles(activeKind));
elements.plotSelected.addEventListener("click", analyseSelectedFile);
elements.reviewSelected.addEventListener("click", reviewSelectedFile);
elements.centrePlot.addEventListener("click", centrePlot);
elements.toggleDrTrack.addEventListener("click", () => {
  if (!hasDrTracks(currentAnalysis?.drTracks)) return;
  drTrackVisible = !drTrackVisible;
  elements.toggleDrTrack.setAttribute("aria-pressed", String(drTrackVisible));
  renderDrTracks();
});
elements.toggleDrFixes.addEventListener("click", () => {
  if (!hasDrPlotFixes(currentAnalysis?.drPlotFixes)) return;
  drFixesVisible = !drFixesVisible;
  elements.toggleDrFixes.setAttribute("aria-pressed", String(drFixesVisible));
  renderDrPlotFixes();
});
for (const tab of elements.fileTabs) {
  tab.addEventListener("click", () => loadFiles(tab.dataset.kind || "voyages"));
}
elements.toggleSummary.addEventListener("click", () => {
  const open = !elements.summaryPanel.classList.contains("open");
  elements.summaryPanel.classList.toggle("open", open);
  syncPanelButtons();
  setTimeout(refreshMapLayout, 180);
});
for (const choice of elements.baseMapChoices) {
  choice.addEventListener("change", () => {
    if (choice.checked) setBaseMap(choice.value);
  });
}
elements.autoCharts.addEventListener("change", () =>
  setAutoChartsEnabled(elements.autoCharts.checked).catch((error) => showToast(error.message, true)),
);
elements.openSeaMap.addEventListener("change", () =>
  setOverlay(seamarkLayer, elements.openSeaMap.checked, "ajrmMarineVoyageViewerOpenSeaMap"),
);
elements.downloadGpx.addEventListener("click", (event) => {
  exportSelectedGpx(event);
});
elements.downloadSelected.addEventListener("click", (event) => {
  downloadSelectedFile(event);
});

initMap();
syncPanelButtons();
updateFileTabs();
showSelectedPlaceholder();
loadFiles();
