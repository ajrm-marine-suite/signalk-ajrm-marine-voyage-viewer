"use strict";

const packageInfo = require("../package.json");

module.exports = function retiredVoyageViewer(app) {
  return {
    id: "signalk-ajrm-marine-voyage-viewer",
    name: "AJRM Marine Voyage Viewer (retired)",
    description: "Retired in v0.8.0. Voyage review is built into AJRM Marine Capture.",
    schema: { type: "object", properties: {} },
    start() {
      const message =
        `Voyage Viewer v${packageInfo.version} is retired; install AJRM Marine Capture v0.9.0 or later`;
      app.setPluginError?.(message);
      app.setPluginStatus?.(message);
    },
    stop() {},
  };
};
