# AJRM Marine Voyage Viewer

Signal K webapp for plotting and reviewing AJRM Marine Capture voyage bundles.

The app now lists voyages only. Any selected voyage can be plotted on a Leaflet
chart, reviewed, exported as GPX 1.1, or downloaded. Individual Logger files
and the retired Clips workflow are no longer exposed in the user interface.

Current Capture bundles declare one canonical physical-input stream using the
`ajrm-marine-canonical-input-v1` contract at `input/yden-input.jsonl`. Voyage
Viewer reads that declared stream directly. Legacy embedded capture segments
and exact external Logger references remain an internal compatibility path for
older voyage bundles, without restoring separate Logs or Clips lists.

Current builds preserve the navigation evidence carried by Capture's compact
`tracks/dr-track.jsonl` and copied DR Plotter fixes: integrity assurance,
explicit comparison availability, GPS-dependence, leeway/current origin, input
sources, and the accepted Navigation Reference clock source. Voyage Viewer
renders those provider decisions without selecting sensor sources or
recalculating navigation policy. An integrity track is not drawn when GPS
Integrity explicitly records `comparisonAvailable: false`; legacy records that
do not contain the field remain reviewable.

For recomputed child voyages, the file list, analysis summary, and Voyage
Review expose the parent voyage, resolved replay-source lineage, cumulative
prepared coverage, and live-input isolation result. Incomplete coverage or
detected live-sensor contamination is shown as a red software finding rather
than being reviewed as an ordinary clean voyage.

Current builds also verify Capture's durable recomputation-completion
checkpoint, replay coverage, result-segment manifest, and the presence and
byte size of every embedded result segment. Packaging/completion verification
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

Version `0.5.7` adds a **DR Fixes** overlay for voyage bundles that contain
`tracks/dr-plot-fixes.json`. The overlay shows archived timed, manual, and
GPS-lost navigator plot fixes with the same square/triangle symbols and popup
details used by AJRM Marine DR Plotter.

Version `0.5.13` summarises captured AJRM Marine GPS Integrity state in the
voyage Summary. This helps review a day's sailing without live diagnostics:
final GPS trust, outage count and duration, rejected fixes, position jumps,
weak-signal events, GPS/DR mismatches, and maximum DR uncertainty are extracted
from the normal Signal K capture data.

Version `0.1.17` adds a **DR Track** overlay for voyage bundles that contain
`tracks/dr-track.jsonl`. The overlay can show the recorded GPS comparison,
operational dead-reckoning track, independent DR where relevant, and highlighted
GPS recovery jumps.

Version `0.1.16` refreshes Auto Charts using the same direct Signal K resource
fallback as DR Plotter and uses voyage duration to show steadier progress while
long captures are scanned.

Version `0.1.15` added support for old reference-mode voyage bundles by reading
their referenced AJRM Marine Logger files when those files still exist on the
server.

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
while it opens the voyage, scans the canonical or legacy capture data, finds the
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
- GPS Integrity summary when captured: final trust state, evaluations, GPS
  outages, rejected fixes, position jumps, weak-signal events, GPS/DR mismatch
  count, maximum DR uncertainty, integrity assurance/comparison availability,
  GPS-dependence, current/leeway origin, and Navigation Reference provenance

DR Fix popups show the same explicit evidence copied from DR Plotter. Missing
numeric evidence is displayed as unavailable, while a real zero remains zero.

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
