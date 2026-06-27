# AJRM Marine Voyage Viewer

Signal K webapp for plotting AJRM Marine Capture voyage bundles, Signal K
Logger clips, and AJRM Marine Logger logs.

The app lists AJRM Marine Capture voyage bundles plus AJRM Marine Logger clips and
logs. Any selected voyage, clip, or log can be plotted on a Leaflet chart,
exported as GPX 1.1, downloaded, and summarised.

Version `0.5.1` clarifies the app role: Voyage Viewer plots and exports
recorded tracks. To replay a voyage, load the recording in AJRM Marine Logger
and view the replay in AJRM Marine Display.

Version `0.1.17` adds a **DR Track** overlay for voyage bundles that contain
`tracks/dr-track.jsonl`. The overlay can show the recorded GPS comparison,
operational dead-reckoning track, independent DR where relevant, and highlighted
GPS recovery jumps.

Version `0.1.16` refreshes Auto Charts using the same direct Signal K resource
fallback as DR Plotter and uses voyage duration to show steadier progress while
long captures are scanned.

Version `0.1.15` plots AJRM Marine Capture reference-mode voyage bundles by
reading the referenced AJRM Marine Logger files on the server when they are not
copied into the zip.

The recording browser uses the same tab model as AJRM Marine Logger:

- `Voyages`: zipped AJRM Marine Capture voyage bundles
- `Clips`: extracted `.jsonl` / `.jsonl.gz` clips
- `Logs`: captured `.jsonl` / `.jsonl.gz` logger files

Select one row, then use the shared Plot, Export GPX, or Download buttons.

## GPX export

Each selected recording can be exported as GPX. The GPX contains the plotted
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

Recording analysis runs on the Signal K server. The webapp shows a staged
horizontal progress bar while it opens the voyage, clip, or log, scans the
capture data, finds the track, computes the summary, and renders the chart
overlay or GPX download.

## Plot cache

Voyage Viewer writes disposable sidecar files beside the selected source
recording:

- `<source>.watchkeeper-plot.json`: cached app analysis for fast re-plotting
- `<source>.gpx`: cached GPX export

The source recording remains authoritative. A sidecar is used only when its
source file size and modification time still match. If the source changes, the
cache is ignored and rebuilt.

After plotting, the map automatically centres and zooms to show the whole
recording. The **Centre plot** button repeats that fit after you pan or zoom
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
- Track point count and snapshot count

## Notes

The app reuses AJRM Marine Harbour Editor's local Leaflet, Protomaps, and Natural Earth
assets. Voyage analysis happens on the Signal K server so older browser devices
do not need to unzip large voyage bundles.


## Public Beta

Plots and exports voyage tracks. For replay, load the voyage in AJRM Marine
Logger and view it in Display.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
