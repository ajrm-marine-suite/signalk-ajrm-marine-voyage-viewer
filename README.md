# AJRM Marine Voyage Viewer

Signal K webapp for plotting and reviewing AJRM Marine Capture voyage bundles.

## Install

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-voyage-viewer.git#v0.7.0 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Enable **AJRM Marine Voyage Viewer** in Signal K. Capture supplies the voyage
list, canonical data, notes, routes, and diagnostic evidence.

Version `0.7.0` makes the current self-contained Capture bundle the only
supported input. It removes the hidden raw-log, Clips, embedded-segment and
external-Logger fallbacks, replaces the generic file-kind HTTP routes with a
voyage-only API, documents that API with OpenAPI, and validates recomputed
voyages against Capture's current replay-result, timing, checkpoint and output
contracts.

Version `0.6.20` adds visible hover/focus help to every map control icon,
including zoom, chart selection, chart cycling and voyage actions.

Version `0.6.19` shows the selected chart in a temporary top-centre status
label when cycling overlapping charts, matching Display and DR Plotter.

Version `0.6.18` keeps chart folders reachable in short browser windows by
measuring the selector's remaining viewport height and enabling contained
mouse/touch scrolling through Map Core `0.6.8`.

Version `0.6.17` makes the Voyage selector reliably touch-scrollable on
Safari/iPadOS by using a dedicated fixed-basis flex scroll region whose voyage
rows cannot shrink.

Version `0.6.16` cycles overlapping charts with Display's selected keyboard
shortcut (`C` by default), using the shared browser setting from Map Core
`0.6.7`.

Version `0.6.15` matches Display's map toolbar button size, shared icons and
uniform spacing through Map Core `0.6.5`.

Version `0.6.14` keeps the Voyage selector header and actions fixed while its
voyage list scrolls independently, including on touch screens.

Version `0.6.13` starts with the Voyage selector closed. Its toolbar button
opens it beside, rather than over, the left map controls. Application action
buttons use the vertical Map Core `0.6.4` stack.

Version `0.6.12` replaces the upper-right action group with Display-style icon
controls in the left Leaflet stack. The `+ / −` zoom buttons remain first,
followed by chart controls, Voyages, Refresh and Voyage Summary.

Version `0.6.11` adopts the shared AJRM Marine map controls: Display-style
basemap and overlay selection, nested Charts Provider Simple folder toggles,
and a chart-cycle button for overlapping charts.

The app lists voyages only. Any selected voyage can be plotted on a Leaflet
chart, reviewed, exported as GPX 1.1, or downloaded.

Current Capture bundles declare one canonical physical-input stream using the
`ajrm-marine-canonical-input-v1` contract at `input/yden-input.jsonl`. Voyage
Viewer reads that declared stream directly. Recomputed children instead
declare a complete `ajrm-marine-recomputed-output-v1` stream. Bundles that do
not contain one of those current contracts should be converted once rather
than making the runtime carry historical storage formats.

Current Capture deliberately separates evidence by purpose. Voyage Viewer
reads physical navigation and instrument data from the declared canonical
input stream, and reads suite-derived Traffic and GPS Integrity evidence from
the compact start/stop snapshots and any observation-evidence snapshots. GPS
Integrity process counters are differenced between snapshots so the summary
describes the voyage rather than the lifetime of the running plugin.

Current builds preserve the navigation evidence carried by Capture's compact
`tracks/dr-track.jsonl`: integrity assurance,
explicit comparison availability, GPS-dependence, leeway/current origin, input
sources, and the accepted Navigation Reference clock source. Voyage Viewer
renders those provider decisions without selecting sensor sources or
recalculating navigation policy. An integrity track is not drawn when GPS
Integrity explicitly records `comparisonAvailable: false`.

For recomputed child voyages, the file list, analysis summary, and Voyage
Review expose the parent voyage, resolved replay-source lineage, cumulative
prepared coverage, and live-input isolation result. Incomplete coverage or
detected live-sensor contamination is shown as a red software finding rather
than being reviewed as an ordinary clean voyage.

Current builds also verify Capture's durable recomputation-completion
checkpoint, replay coverage, explicit timing validity, and the contract,
completion state and byte size of the embedded recomputed output. Packaging/completion verification
is reported separately from live-input isolation, so a complete bundle still
preserves any historical contamination finding rather than conflating the two.

Large voyage ZIPs are analysed as streams on the Signal K server. Embedded
`.jsonl.gz` segments are read and decompressed line by line instead of loading
whole ZIP entries into memory, and the progress bar reports measured bytes and
analysis phases. Voyage downloads use the browser's native download path so
the bundle streams directly to disk instead of being assembled as a browser
memory blob.

When captured Traffic target projections are available, Voyage Review
summarises AIS observation age, forward-projection duration, configured
announcement lead, stale targets, and positions deliberately withheld from
CPA/TCPA calculation.

Version `0.5.3` doubles the main plotted voyage track line thickness for easier
viewing.

Voyage notes are shown as a chronological list below the summary. Notes with
captured Snapshot position evidence are numbered on the chart; selecting the
note centres the chart on that position. The voyage-level comment remains a
separate summary field. Captured route selections are plotted as blue dashed
lines and the latest route state is named in the summary.

Version `0.5.13` summarises captured AJRM Marine GPS Integrity state in the
voyage Summary. This helps review a day's sailing without live diagnostics:
final GPS trust, outage count and duration, rejected fixes, position jumps,
weak-signal events, GPS/DR mismatches, and maximum DR uncertainty are extracted
from the normal Signal K capture data.

Version `0.1.17` adds a **DR Track** overlay for voyage bundles that contain
`tracks/dr-track.jsonl`. The overlay can show the recorded GPS comparison,
operational dead-reckoning track, independent DR where relevant, and highlighted
GPS recovery jumps.

Version `0.1.16` refreshes Auto Charts using Signal K chart resources directly
and uses voyage duration to show steadier progress while
long captures are scanned.

Select a voyage, then use Plot, Review, Export GPX, or Download.

## GPX export

Each selected voyage can be exported as GPX. The GPX contains the plotted
own-vessel track with timestamped track points so other charting/navigation
tools can display the route. When a voyage has a comment, the GPX download
filename is based on that comment.

## Chart controls

Voyage Viewer uses the same local Leaflet/Protomaps/Natural Earth chart assets
as AJRM Marine Harbour Editor and includes basemap choices for Empty, NaturalEarth,
OpenStreetMap, OpenTopoMap, and Satellite. It can overlay OpenSeaMap seamarks
and Auto Charts from Signal K chart resources. Chart resource discovery is
proxied through the Voyage Viewer plugin so it does not depend on another
webapp opening the chart resource API first.

## Plot progress

Voyage analysis runs on the Signal K server. The webapp shows a staged
horizontal progress bar driven by actual server-side byte and phase progress
while it opens the voyage, scans the declared bundle data, finds the
track, computes the summary, and renders the chart overlay or GPX download.

## Plot cache

Voyage Viewer writes disposable sidecar files beside the selected voyage:

- `<source>.ajrm-marine-plot.json`: cached app analysis for fast re-plotting
- `<source>.gpx`: cached GPX export

The source voyage remains authoritative. A sidecar is used only when its
source file size and modification time still match. If the source changes, the
cache is ignored and rebuilt.

After plotting, the map automatically centres and zooms to show the whole
voyage. The **Centre plot** button repeats that fit after you pan or zoom
elsewhere.

## Summary fields

- Start and stop time
- Duration
- Distance over ground
- Average speed
- Average recorded SOG
- Maximum SOG
- Maximum apparent and true wind speed when captured
- Minimum depth below transducer when captured
- Pilot helm median (signed port/starboard bias), median absolute angle, and
  sample count from periods when the autopilot explicitly reports `auto`,
  `heading`, `wind`, or `route`. Standby and unknown-state TP32 positions are
  excluded and counted because the pilot may publish placeholder values then.
  This is a helm-position proxy and observational trim evidence, not a
  calibrated physical rudder measurement or diagnosis: manoeuvres, sea state,
  steering system bias, and points of sail can all affect it.
- Average, minimum, and maximum sea-water temperature when captured
- Track point count and snapshot count
- Chronological voyage notes, including recorded chart positions when present
- Captured route name, reversal state, and route-selection history
- GPS Integrity summary when captured: final trust state, evaluations, GPS
  outages, rejected fixes, position jumps, weak-signal events, GPS/DR mismatch
  count, maximum DR uncertainty, integrity assurance/comparison availability,
  GPS-dependence, current/leeway origin, and Navigation Reference provenance

An unavailable independent DR comparison is disclosed as provenance but does
not by itself make a voyage amber. Likewise, a stale Traffic position that was
safely withheld is healthy behaviour; an announcement explicitly recorded as
using an over-age observation remains a caution.

## Notes

The app reuses AJRM Marine Harbour Editor's local Leaflet, Protomaps, and Natural Earth
assets. Voyage analysis happens on the Signal K server so older browser devices
do not need to unzip large voyage bundles.


## Public Beta

Plots and exports voyage tracks. For replay, load the voyage in AJRM Marine
Capture and view it in Display.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
## License and commercial use

This software is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). You may use, study, share, and modify it under that licence. If you modify it and make it available to users over a network, the corresponding source code must also be made available under the AGPL.

Commercial licensing is available by arrangement for organisations that want different terms.
