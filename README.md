# AJRM Marine Voyage Viewer (retired)

This package was retired in version 0.8.0. Voyage listing, chart review,
summary analysis, notes, route history, DR overlays, GPX export, and BITE review
are built into AJRM Marine Capture 0.9.0 or later.

## Migration

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-capture.git#v0.9.0 --omit=dev --no-package-lock
npm uninstall signalk-ajrm-marine-voyage-viewer
sudo systemctl restart signalk
```

Open **AJRM Marine Capture → Review voyages**.

## License

AGPL-3.0-or-later.
