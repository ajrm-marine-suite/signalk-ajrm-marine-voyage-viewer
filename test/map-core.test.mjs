import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("published map core matches the pinned internal release", async () => {
  const [publishedModule, pinnedModule, publishedCss, pinnedCss] = await Promise.all([
    readFile(new URL("../public/ajrm-map-core.mjs", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/@ajrm-marine/map-core/src/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/ajrm-map-core.css", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/@ajrm-marine/map-core/styles/map-core.css", import.meta.url), "utf8"),
  ]);
  assert.equal(publishedModule, pinnedModule);
  assert.equal(publishedCss, pinnedCss);
});

test("map page uses the standard left-side controls with zoom first", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /ajrm-map-core\.css\?v=0\.6\.4/);
  assert.match(html, /type="module" src="\.\/app\.js\?v=0\.6\.14"/);
  assert.match(html, /<header class="topbar" hidden>/);
  assert.match(html, /id="toggleVoyages"[^>]+aria-pressed="false"/);
  assert.match(html, /id="voyageDrawer" class="drawer drawer-left"/);
  assert.doesNotMatch(html, /id="voyageDrawer" class="[^"]*\bopen\b/);
  assert.match(css, /\.drawer-left\s*\{[^}]*left:\s*52px/s);
  assert.match(css, /\.voyage-list\s*\{[^}]*flex:\s*1 1 0/s);
  assert.match(css, /\.voyage-list\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.voyage-list\s*\{[^}]*touch-action:\s*pan-y/s);
  assert.match(app, /L\.map\(elements\.map, \{ zoomControl: true \}\)/);
  assert.match(app, /MapCore\.createChartSelectorControl/);
  assert.match(app, /MapCore\.createChartCycleControl/);
  assert.match(app, /MapCore\.createActionToolbarControl/);
  assert.doesNotMatch(app, /position:\s*["']topright["']/);
});
