# Changelog

## 0.6.9

- Show every recorded skipper note as a chronological Voyage notes list; notes
  with Snapshot position evidence are numbered on the chart and can be selected
  to centre the map.
- Plot captured route selections and show the latest route name and reversal
  state in the voyage summary.
- Prefer Capture's explicit own-vessel context when selecting a track, report
  unreadable snapshot evidence, and treat absent optional depth as neutral.
- Remove the retired DR Plotter fix overlay and correct the packaged app icon.

## 0.6.8

- Read Traffic target state and GPS Integrity state from current Capture
  start/stop and observation snapshots, while continuing to use canonical
  physical input for the vessel track and instrument summaries.
- Calculate GPS Integrity counters as voyage-local increments rather than
  displaying the plugins' process-lifetime totals.
- Treat unavailable optional independent DR comparison and absent manual DR
  plot fixes as informational, not voyage-data cautions.
- Recognise stale Traffic positions being withheld as expected safe behaviour;
  retain an amber finding only when a recorded announcement actually used an
  observation explicitly marked too old.

## 0.6.7

- Review report-only/BITE voyage bundles even when their canonical input has no
  own-vessel positions, showing the bundled software results and an explicit
  no-track voyage finding instead of aborting the review.

## 0.6.6

- Analyse current Capture bundles from their explicitly declared
  `ajrm-marine-canonical-input-v1` stream at `input/yden-input.jsonl`.
- Remove the retired Clips and individual Logger-file lists and configuration;
  Voyage Viewer now presents only completed voyage bundles.
- Retain old embedded capture segments and exact external Logger references as
  internal voyage-bundle compatibility paths.

## 0.6.5

- Calculate pilot helm bias only from TP32 position samples captured while the
  autopilot explicitly reports `auto`, `heading`, `wind`, or `route`; count and
  disclose excluded standby/unknown samples instead of treating the TP32's
  placeholder positions as physical rudder movement.
- Analyse a completed, explicitly contracted `recomputed/output.jsonl` when a
  replay bundle intentionally has no `capture/*` files or external Logger
  references.

## 0.6.4

- Summarise captured rudder-angle bias and typical absolute helm angle, and
  average/minimum/maximum sea-water temperature, in the voyage summary.
- Invalidate cached voyage analyses so existing recordings gain the new
  summaries when the data paths were captured.

## 0.6.3

- Recommend AJRM Marine Capture directly now that Capture owns recording and
  replay.

## 0.6.2

- Stream embedded voyage capture segments with lazy ZIP entry reads and
  line-by-line gzip decompression, avoiding whole-segment memory buffering.
- Download voyage bundles through the browser's native streaming path instead
  of constructing a second full bundle blob in browser memory.
- Replace estimated plot/review timing with measured server-side analysis
  progress, including scan passes, segment counts, and processed bytes.
- Verify durable recomputed-replay completion checkpoints, coverage,
  result-segment manifests, and embedded segment byte sizes independently from
  live-input isolation.
- Review captured Traffic target-position projection evidence, including AIS
  measurement age, announcement lead, projection duration, stale targets, and
  withheld calculations.
- Invalidate older analysis caches so existing bundles receive the expanded
  completion and Traffic review.

## 0.6.1

- Preserve integrity assurance/comparison availability, GPS-dependence,
  current/leeway origin, input-source provenance, and Navigation Reference
  provenance from compact DR tracks and copied DR Plotter fixes.
- Do not draw an integrity comparison when GPS Integrity explicitly records
  `comparisonAvailable: false`; expose the unavailable/reduced reason in voyage
  analysis instead.
- Preserve missing numeric evidence as `null` rather than displaying it as zero.
- Update `adm-zip` to the fixed `0.6.x` line.
- Show recomputed child lineage, prepared replay coverage, and live-input
  isolation in the voyage list, summary, highlights, and review; incomplete or
  contaminated replay results are explicit red software findings.

## 0.5.30

- Read Traffic review CPA and vessel-size data from explicit notification
  context fields instead of parsing alert message wording.

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
