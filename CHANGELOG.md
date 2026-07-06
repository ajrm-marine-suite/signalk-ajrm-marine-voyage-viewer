# Changelog

## 0.5.20

- Use the global AJRM Marine Capture API registry as a fallback when preparing
  voyage downloads, so plugin start order does not silently produce lightweight
  reference-mode ZIPs.
- Fail clearly when a complete portable voyage bundle cannot be prepared,
  instead of downloading an incomplete reference-mode bundle.
- Prefix Voyage Viewer voyage download filenames to make Capture, Logger, and
  Viewer downloads distinguishable during comparison testing.

## 0.5.19

- When AJRM Marine Capture is installed, use Capture's canonical portable
  voyage download builder for voyage ZIP downloads so raw capture logs and BITE
  reports are not missed.
- Keep a local ZIP fallback for standalone Voyage Viewer installs.

## 0.5.12

- Replace external `zip`/`unzip` command usage with a pure JavaScript ZIP
  reader/writer for Voyage Viewer tests and voyage-bundle analysis, so the
  Signal K plugin CI passes on Windows runners and clean installs do not depend
  on OS ZIP utilities.

## 0.5.11

- Add Signal K AppStore relationship metadata for the voyage debug mini-suite:
  Capture and Logger.
- Add the reusable Signal K plugin CI workflow.

## 0.5.10

- Display archived GPS-return DR plot fixes as GPS fixes in DR Fixes popups.

## 0.5.9

- Render archived DR plot-fix symbols and time labels as separate Leaflet
  markers so the square/circle/triangle symbol centre stays anchored to the
  recorded coordinate.

## 0.5.8

- Display archived observed fixes from DR Plotter as dot-in-circle symbols with
  their notes in DR Fixes popups.

## 0.5.7

- Read bundled `tracks/dr-plot-fixes.json` files from AJRM Marine Capture
  voyages and add a **DR Fixes** chart overlay with navigator symbols and
  popups.

## 0.5.6

- Add Signal K AppStore navigation category metadata.

## 0.5.5

- Default recording folders to AJRM Marine Logger paths while retaining legacy-directory compatibility on upgraded Pis.

## 0.5.4

- Rename disposable plot-cache sidecars to AJRM Marine naming while still accepting existing legacy cache files.

## 0.5.3

- Double the main plotted voyage track line thickness for easier viewing.

## 0.5.2

- Prevent selected-recording action labels from breaking awkwardly inside
  buttons on narrow screens.

## 0.5.1

- Clarify the Console overview description and README: Voyage Viewer plots and
  exports recorded tracks; replay is done with AJRM Marine Logger and Display.

## 0.5.0

- Initial public beta release as AJRM Marine Voyage Viewer.
