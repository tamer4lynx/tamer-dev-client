# tamer-dev-client

Native dev client module for Tamer4Lynx — QR scan, discovery, URL persistence, reload bridge, embedded dev launcher UI.

## Installation

```bash
npm install @tamer4lynx/tamer-dev-client
```

Add to your app's dependencies and run `t4l link`. Used by **tamer-dev-app** for the dev launcher experience.

The npm tarball includes **`dist/dev-client.lynx.bundle`** (built in **`prepublishOnly`**). Installs do not run Rspeedy. To work on this package from a git clone, run **`npm run build`** once so `dist/` exists.

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

iOS template `ios/templates/LynxInitProcessor.swift` ships with **empty** `GENERATED IMPORTS` / `GENERATED AUTOLINK` sections; `t4l link ios` fills them from discovered native packages. Do not commit a hand-written list of `globalConfig.register(...)` into that template — regenerate via link when dependencies change.

## Troubleshooting

### Build fails with "Invariant failed: Should have main thread asset"

This error occurs when building dev-client from source with mismatched `@lynx-js/*` package versions. The dev-client's build toolchain (`@lynx-js/react-rsbuild-plugin`, `@lynx-js/rspeedy`) must align with your project's `@lynx-js/react` version.

**Fix:**
1. Ensure `@lynx-js/react`, `@lynx-js/react-rsbuild-plugin`, and `@lynx-js/rspeedy` use compatible versions (same minor version recommended).
2. Delete `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
3. If using a monorepo, ensure workspace hoisting doesn't create duplicate versions of `@lynx-js/*` packages.

The published npm package includes a prebuilt `dist/dev-client.lynx.bundle`, so `npm install` from the registry should not trigger this error.
