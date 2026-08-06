export const MAP_CORE_CONTRACT = "ajrm-marine-map-shell-v1";
export const MAP_CORE_VERSION = "0.6.4";
export const AUTO_CHARTS_NAME = "Auto Charts";
export const OPEN_SEA_MAP_NAME = "OpenSeaMap";
export const CHART_FOLDER_API_BASE = "/plugins/signalk-charts-provider-simple";

export const MAP_ACTION_ICONS = Object.freeze({
	status: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v3H4V4Zm0 6h16v3H4v-3Zm0 6h16v3H4v-3Z"/></svg>',
	follow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.7 3.3-7.2 17.1-2.8-7.1-7.1-2.8 17.1-7.2ZM11.9 11l1.6 4 3.1-7.6L9 10.5l2.9.5Z"/></svg>',
	plot: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg>',
	list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h3v3H4V5Zm5 0h11v3H9V5ZM4 10.5h3v3H4v-3Zm5 0h11v3H9v-3ZM4 16h3v3H4v-3Zm5 0h11v3H9v-3Z"/></svg>',
	refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 6.3A8 8 0 1 0 20 12h-3a5 5 0 1 1-1.5-3.5L12 12h8V4l-2.3 2.3Z"/></svg>',
	summary: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5V3Zm3 4v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z"/></svg>',
	edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 9.6-9.6 4 4L8 20H4v-4Zm11-11 2-2 4 4-2 2-4-4Z"/></svg>',
	settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19.4 13 .1-1-.1-1 2.1-1.6-2-3.4-2.6 1a8 8 0 0 0-1.7-1L15 3h-4l-.4 2.9a8 8 0 0 0-1.7 1l-2.6-1-2 3.4L6.4 11l-.1 1 .1 1-2.1 1.6 2 3.4 2.6-1a8 8 0 0 0 1.7 1L11 21h4l.4-2.9a8 8 0 0 0 1.7-1l2.6 1 2-3.4-2.3-1.7ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
});

const ZOOM_TOLERANCE = 0.1;

function finiteNumber(value, fallback) {
	const number = Number(value ?? fallback);
	return Number.isFinite(number) ? number : fallback;
}

function boundsSource(chart) {
	return chart?.bounds ?? chart?.boundingBox ?? chart?.extent ?? chart?.bbox ?? null;
}

function rawBounds(source) {
	if (Array.isArray(source)) return source.flat(2).slice(0, 4).map(Number);
	if (typeof source === "string") return source.split(/[\s,]+/).slice(0, 4).map(Number);
	if (source && typeof source === "object") {
		return [
			source.west ?? source.minLon ?? source.minLongitude,
			source.south ?? source.minLat ?? source.minLatitude,
			source.east ?? source.maxLon ?? source.maxLongitude,
			source.north ?? source.maxLat ?? source.maxLatitude,
		].map(Number);
	}
	return [];
}

function validBounds(bounds) {
	return bounds.length === 4 && bounds.every(Number.isFinite) &&
		bounds[0] >= -180 && bounds[2] <= 180 && bounds[1] >= -90 && bounds[3] <= 90 &&
		bounds[0] < bounds[2] && bounds[1] < bounds[3];
}

export function chartBoundsCandidates(chart) {
	const [a, b, c, d] = rawBounds(boundsSource(chart));
	const candidates = [
		[Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)],
		[Math.min(b, d), Math.min(a, c), Math.max(b, d), Math.max(a, c)],
	].filter(validBounds);
	return candidates.filter((candidate, index) =>
		candidates.findIndex((other) => other.join(",") === candidate.join(",")) === index);
}

export function chartZoom(chart) {
	return chart?.__ajrmMapZoom ?? chart?.__autoChartZoom ?? {
		min: finiteNumber(chart?.minzoom ?? chart?.minZoom, 0),
		max: finiteNumber(chart?.maxzoom ?? chart?.maxZoom, 24),
	};
}

export function normalizeChartResources(resources) {
	return Object.entries(resources || {}).map(([id, chart]) => {
		const normalized = { ...chart, __ajrmMapChartId: id, __autoChartId: id };
		Object.defineProperties(normalized, {
			__ajrmMapBounds: { value: chartBoundsCandidates(chart) },
			__ajrmMapZoom: { value: chartZoom(chart) },
		});
		return normalized;
	});
}

export function chartBounds(chart, lat, lon) {
	const candidates = chart?.__ajrmMapBounds ?? chart?.__autoChartBoundsCandidates ??
		chartBoundsCandidates(chart);
	return candidates.find((bounds) =>
		lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]) ??
		candidates[0] ?? null;
}

export function chartContains(chart, lat, lon) {
	const bounds = chartBounds(chart, lat, lon);
	return !!bounds && lon >= bounds[0] && lon <= bounds[2] &&
		lat >= bounds[1] && lat <= bounds[3];
}

function chartArea(chart, lat, lon) {
	const bounds = chartBounds(chart, lat, lon);
	return bounds ? Math.abs((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])) : Infinity;
}

export function chartCandidates(charts, { lat, lng, zoom, maxZoom = 22 }) {
	return charts
		.filter((chart) => chartContains(chart, lat, lng))
		.filter((chart) => {
			const range = chartZoom(chart);
			return zoom >= range.min - ZOOM_TOLERANCE && zoom <= maxZoom + ZOOM_TOLERANCE;
		})
		.sort((left, right) => {
			const leftZoom = chartZoom(left);
			const rightZoom = chartZoom(right);
			const leftNative = leftZoom.max >= zoom;
			const rightNative = rightZoom.max >= zoom;
			if (leftNative !== rightNative) return leftNative ? -1 : 1;
			const zoomOrder = leftNative
				? leftZoom.max - rightZoom.max
				: rightZoom.max - leftZoom.max;
			return zoomOrder || chartArea(left, lat, lng) - chartArea(right, lat, lng) ||
				rightZoom.min - leftZoom.min;
		});
}

export function chooseChart(charts, map, position = map.getCenter()) {
	return chartCandidates(charts, {
		lat: position.lat,
		lng: position.lng,
		zoom: map.getZoom(),
		maxZoom: map.getMaxZoom(),
	})[0] ?? null;
}

export function chartId(chart) {
	return chart?.__ajrmMapChartId ?? chart?.__autoChartId ?? chart?.identifier ?? chart?.id ?? null;
}

export function createChartCycleState() {
	let manualChartId = null;

	const candidatesFor = (charts, map, position = map.getCenter()) => chartCandidates(charts, {
		lat: position.lat,
		lng: position.lng,
		zoom: map.getZoom(),
		maxZoom: map.getMaxZoom(),
	});

	return {
		choose(charts, map, position) {
			const candidates = candidatesFor(charts, map, position);
			if (manualChartId) {
				const manual = candidates.find((chart) => chartId(chart) === manualChartId);
				if (manual) return manual;
				manualChartId = null;
			}
			return candidates[0] ?? null;
		},
		cycle(charts, map, position) {
			const candidates = candidatesFor(charts, map, position);
			if (candidates.length < 2) {
				manualChartId = null;
				return candidates[0] ?? null;
			}
			if (!manualChartId) {
				manualChartId = chartId(candidates[1]);
				return candidates[1];
			}
			const currentIndex = candidates.findIndex((chart) => chartId(chart) === manualChartId);
			if (currentIndex < 0 || currentIndex === candidates.length - 1) {
				manualChartId = null;
				return candidates[0];
			}
			manualChartId = chartId(candidates[currentIndex + 1]);
			return candidates[currentIndex + 1];
		},
		reset() {
			manualChartId = null;
		},
		get manualChartId() {
			return manualChartId;
		},
		getCandidates: candidatesFor,
	};
}

export function createChartCycleControl({
	L,
	map,
	getCharts,
	onChange = () => {},
	position = "topleft",
}) {
	const state = createChartCycleState();
	let button;
	const syncButton = () => {
		if (!button) return;
		const candidates = state.getCandidates(getCharts(), map);
		button.disabled = candidates.length < 2;
		button.title = candidates.length < 2
			? "No overlapping charts to cycle"
			: state.manualChartId
				? `Cycle overlapping charts (${candidates.findIndex((chart) => chartId(chart) === state.manualChartId) + 1} of ${candidates.length})`
				: `Cycle overlapping charts (Auto, ${candidates.length} available)`;
		button.setAttribute("aria-label", button.title);
	};
	const definition = L.Control.extend({
		options: { position },
		onAdd() {
			const container = L.DomUtil.create("div", "leaflet-bar ajrm-map-cycle");
			button = L.DomUtil.create("button", "ajrm-map-button", container);
			button.type = "button";
			button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L8 5l4 4V6a6 6 0 1 1-5.65 4H4.26A8 8 0 1 0 17.65 6.35Z"/></svg>';
			L.DomEvent.disableClickPropagation(container);
			L.DomEvent.on(button, "click", (event) => {
				L.DomEvent.stop(event);
				if (button.disabled) return;
				state.cycle(getCharts(), map);
				syncButton();
				onChange();
			});
			map.on("moveend zoomend", syncButton);
			syncButton();
			return container;
		},
	});
	const control = new definition();
	return {
		control,
		addTo(target = map) {
			control.addTo(target);
			return this;
		},
		choose(charts = getCharts(), targetMap = map, positionValue) {
			const selected = state.choose(charts, targetMap, positionValue);
			syncButton();
			return selected;
		},
		cycle(charts = getCharts(), targetMap = map, positionValue) {
			const selected = state.cycle(charts, targetMap, positionValue);
			syncButton();
			return selected;
		},
		reset() {
			state.reset();
			syncButton();
		},
		update: syncButton,
		get manualChartId() {
			return state.manualChartId;
		},
	};
}

export function mapActionState(action) {
	return {
		visible: action.isVisible?.() !== false,
		disabled: action.isDisabled?.() === true,
		pressed: action.isPressed?.() === true,
	};
}

export function createActionToolbarControl({
	L,
	map,
	actions,
	position = "topleft",
}) {
	const buttons = [];
	const update = () => {
		actions.forEach((action, index) => {
			const button = buttons[index];
			if (!button) return;
			const state = mapActionState(action);
			button.hidden = !state.visible;
			button.disabled = state.disabled;
			button.setAttribute("aria-pressed", String(state.pressed));
		});
	};
	const definition = L.Control.extend({
		options: { position },
		onAdd() {
			const container = L.DomUtil.create("div", "leaflet-bar ajrm-map-actions");
			actions.forEach((action) => {
				const button = L.DomUtil.create("button", "ajrm-map-button", container);
				button.type = "button";
				button.title = action.title;
				button.setAttribute("aria-label", action.title);
				button.innerHTML = action.icon;
				buttons.push(button);
				L.DomEvent.on(button, "click", (event) => {
					L.DomEvent.stop(event);
					if (button.disabled) return;
					action.activate();
					queueMicrotask(update);
				});
			});
			L.DomEvent.disableClickPropagation(container);
			update();
			return container;
		},
	});
	const control = new definition();
	return {
		control,
		addTo(target = map) {
			control.addTo(target);
			return this;
		},
		update,
	};
}

export function chartUrl(chart) {
	return chart?.tilemapUrl || chart?.url || chart?.tileUrl || chart?.href || "";
}

export function makeRasterChartLayer({ L, chart, maxZoom = 22, pane = "tilePane" }) {
	const url = chartUrl(chart);
	if (!url) return null;
	const range = chartZoom(chart);
	return L.tileLayer(url, {
		minZoom: range.min,
		maxNativeZoom: range.max,
		maxZoom,
		pane,
		attribution: chart.attribution || chart.description || chart.name || "",
	});
}

export function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function normalizeFolderResponse(payload) {
	const states = payload?.folderStates ?? {};
	return (Array.isArray(payload?.folders) ? payload.folders : [])
		.filter((path) => path && path !== "/")
		.map((path) => ({
			path,
			name: path.split("/").filter(Boolean).at(-1) || path,
			depth: Math.max(0, path.split("/").filter(Boolean).length - 1),
			enabled: states[path]?.enabled !== false,
			effectiveEnabled: states[path]?.effectiveEnabled !== false,
		}))
		.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export function createFolderClient(fetchFn = (...args) => globalThis.fetch(...args)) {
	return {
		async list() {
			const response = await fetchFn(`${CHART_FOLDER_API_BASE}/local-charts`, {
				credentials: "same-origin",
			});
			if (response.status === 404) return { supported: false, folders: [] };
			if (!response.ok) throw new Error(`Could not load chart folders (HTTP ${response.status})`);
			return { supported: true, folders: normalizeFolderResponse(await response.json()) };
		},
		async setEnabled(path, enabled) {
			const response = await fetchFn(`${CHART_FOLDER_API_BASE}/folders/toggle`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({ folderPath: path, enabled }),
			});
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					throw new Error("Sign in as a Signal K administrator to change chart folders.");
				}
				throw new Error(`Could not change chart folder (HTTP ${response.status})`);
			}
			return response.json().catch(() => ({}));
		},
	};
}

function renderOption({ name, type, checked }) {
	return `<label class="ajrm-map-option"><input type="${type}" value="${escapeHtml(name)}"${checked ? " checked" : ""}><span>${escapeHtml(name)}</span></label>`;
}

function renderFolders(folders) {
	return folders.map((folder) => `<label class="ajrm-map-folder${folder.enabled && !folder.effectiveEnabled ? " inherited-disabled" : ""}" style="--folder-depth:${folder.depth}" title="${escapeHtml(folder.path)}"><input type="checkbox" data-chart-folder value="${escapeHtml(folder.path)}"${folder.enabled ? " checked" : ""}><span>${escapeHtml(folder.name)}</span></label>`).join("");
}

export function createChartSelectorControl({
	L,
	map,
	baseMaps,
	getBaseMap,
	setBaseMap,
	overlays = [],
	folderClient = createFolderClient(),
	onFoldersChanged = () => {},
	position = "topleft",
}) {
	let panel;
	let renderPanel = () => {};
	const definition = L.Control.extend({
		options: { position },
		onAdd() {
			const container = L.DomUtil.create("div", "leaflet-bar ajrm-map-selector");
			const button = L.DomUtil.create("button", "ajrm-map-button", container);
			button.type = "button";
			button.title = "Charts";
			button.setAttribute("aria-label", "Charts");
			button.setAttribute("aria-expanded", "false");
			button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-6-3-6 3 6 3 6-3Zm6 4-6-3-6 3-6-3v4l6 3 6-3 6 3V9Zm0 5-6-3-6 3-6-3v4l6 3 6-3 6 3v-4Z"/></svg>';
			panel = L.DomUtil.create("div", "ajrm-map-panel", container);
			panel.hidden = true;
			renderPanel = () => {
				const base = Object.keys(baseMaps).map((name) => renderOption({ name, type: "radio", checked: getBaseMap() === name })).join("");
				const normal = overlays.filter((item) => item.name !== AUTO_CHARTS_NAME);
				const automatic = overlays.find((item) => item.name === AUTO_CHARTS_NAME);
				panel.innerHTML = `<div class="ajrm-map-title">Basemap</div>${base}<div class="ajrm-map-title">Overlays</div>${normal.map((item) => renderOption({ name: item.name, type: "checkbox", checked: item.isEnabled() })).join("")}${automatic ? renderOption({ name: automatic.name, type: "checkbox", checked: automatic.isEnabled() }) : ""}${automatic ? '<details data-folders hidden><summary>Chart folders</summary><div data-folder-list>Loading chart folders…</div></details>' : ""}`;
			};
			const refreshFolders = async () => {
				const details = panel.querySelector("[data-folders]");
				if (!details) return;
				try {
					const result = await folderClient.list();
					details.hidden = !result.supported || result.folders.length === 0;
					const list = details.querySelector("[data-folder-list]");
					if (list) list.innerHTML = renderFolders(result.folders);
				} catch (error) {
					details.hidden = false;
					details.querySelector("[data-folder-list]").textContent = error.message;
				}
			};
			renderPanel();
			L.DomEvent.disableClickPropagation(container);
			L.DomEvent.disableScrollPropagation(container);
			L.DomEvent.on(button, "click", (event) => {
				L.DomEvent.stop(event);
				panel.hidden = !panel.hidden;
				button.setAttribute("aria-expanded", String(!panel.hidden));
				if (!panel.hidden) {
					renderPanel();
					void refreshFolders();
				}
			});
			panel.addEventListener("change", async (event) => {
				const input = event.target;
				if (!(input instanceof HTMLInputElement)) return;
				if (input.dataset.chartFolder !== undefined) {
					input.disabled = true;
					try {
						await folderClient.setEnabled(input.value, input.checked);
						await onFoldersChanged();
						await refreshFolders();
					} catch (error) {
						input.checked = !input.checked;
						input.disabled = false;
						globalThis.alert?.(error.message);
					}
					return;
				}
				if (input.type === "radio") setBaseMap(input.value);
				else overlays.find((item) => item.name === input.value)?.setEnabled(input.checked);
				renderPanel();
			});
			map.on("click", () => {
				panel.hidden = true;
				button.setAttribute("aria-expanded", "false");
			});
			return container;
		},
	});
	const control = new definition();
	return { control, addTo: (target = map) => control.addTo(target), update: () => panel && renderPanel() };
}

export function normalizeCoordinateFormat(value, fallback = "dms") {
	return ["dms", "degrees-minutes", "decimal"].includes(value) ? value : fallback;
}

export function formatCoordinate(value, axis, format = "dms") {
	if (!Number.isFinite(value)) return "—";
	const hemisphere = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
	const absolute = Math.abs(value);
	if (format === "decimal") return `${absolute.toFixed(6)}°${hemisphere}`;
	const degrees = Math.floor(absolute);
	const minutesValue = (absolute - degrees) * 60;
	if (format === "degrees-minutes") return `${degrees}° ${minutesValue.toFixed(3)}′ ${hemisphere}`;
	const minutes = Math.floor(minutesValue);
	const seconds = (minutesValue - minutes) * 60;
	return `${degrees}° ${minutes}′ ${seconds.toFixed(1)}″ ${hemisphere}`;
}
