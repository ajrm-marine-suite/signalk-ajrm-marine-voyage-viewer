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

test("map page uses the shared selector and overlap-cycle controls", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /ajrm-map-core\.css\?v=0\.6\.2/);
  assert.match(html, /type="module" src="\.\/app\.js\?v=0\.6\.11"/);
  assert.match(app, /MapCore\.createChartSelectorControl/);
  assert.match(app, /MapCore\.createChartCycleControl/);
});
