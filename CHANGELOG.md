# Changelog

## 0.5.29

- Plot bundled own-vessel DR operational track data as the main voyage track
  when it is available, preventing simulator target position streams from
  being mistaken for the voyage path.
- Clear old plotted layers as soon as a different recording is selected or
  analysed, and ignore stale analysis responses from an earlier selection.
- Invalidate plot/review caches so existing voyage bundles are re-analysed
  with the corrected track source.

## 0.5.28

- Add skipper-facing Voyage Review highlights for duration, distance, track
  points, speed, depth, traffic, GPS Integrity, DR fixes, and recovered
  recordings.
- Add a plain-English review conclusion above the detailed findings, keeping
  traffic alerts as voyage history rather than caution status.
- Invalidate review caches so existing voyages are re-reviewed with the new
  highlight and conclusion fields.

## 0.5.27

- Treat recorded traffic advisories and collision alerts as normal
  informational voyage history, not as amber voyage-data cautions.
- Invalidate `0.5.26` review caches so voyages previously marked amber only
  because they contained collision alerts are re-reviewed correctly.

## 0.5.26

- Include the primary red/amber finding in the Voyage Review headline, so
  status lights explain why a voyage is amber or red without hunting through
  the findings list.
- Invalidate older review caches so existing voyages are re-reviewed with the
  clearer headline.

## 0.5.25

- Restyle the Voyage/Clip/Log selector as folder-style tabs, separate from the
  normal action buttons below it.

## 0.5.24

- Ignore BITE reports that do not overlap the reviewed voyage window, so a
  normal soak or sailing voyage is not labelled as a BITE run merely because
  old test reports were bundled.
- Remove BITE/software wording from normal voyage-review headlines when no
  in-window BITE result is present.

## 0.5.23

- Score Voyage Review BITE results from the latest run-all report only, so
  older failed BITE reports retained in the voyage bundle do not turn a later
  passing run red.
- Deduplicate individual BITE reports that also appear inside the run-all
  report, and invalidate stale review caches when the review engine changes.

## 0.5.22

- Download selected voyage/log files through an authenticated browser `fetch`
  and blob handoff instead of direct navigation to the protected plugin route,
  preventing Signal K security from showing a username/password prompt.

## 0.5.21

- Publish Voyage Viewer status into Signal K at `plugins.ajrmMarineVoyageViewer`, including voyage/log/clip directories and Review capability metadata for Console BITE checks.
- Return the same suite-facing status shape from the HTTP status route.

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
