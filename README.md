# tamer-dev-client

Native dev client module for Tamer4Lynx — QR scan, discovery, URL persistence, reload bridge, embedded dev launcher UI.

## Installation

```bash
npm install @tamer4lynx/tamer-dev-client
```

Add to your app's dependencies and run `t4l link`. Used by **tamer-dev-app** for the dev launcher experience.

## Usage

The dev client provides:

- **Discovery** — Find dev servers on the local network
- **Connect** — Enter URL or scan QR code to connect
- **Recent** — List of recently used dev server URLs
- **Reload** — Reload the Lynx bundle
- **Compatibility check** — Validates native modules between app and project

When building the dev app (`t4l build-dev-app`), the dev client UI is embedded and the Lynx bundle is loaded from the connected dev server.

## Dependencies

Requires: `tamer-app-shell`, `tamer-insets`, `tamer-system-ui`, `tamer-plugin`, `tamer-router`, `react-router`, `@lynx-js/react`.

## Platform

Uses **lynx.ext.json**. Run `t4l link` after adding to your app.
