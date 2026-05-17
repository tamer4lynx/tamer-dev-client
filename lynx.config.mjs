import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { tamerRouterPlugin } from '@tamer4lynx/tamer-router/plugin'
import { pluginTamer } from '@tamer4lynx/tamer-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Load monorepo root .env so OFFICIAL_APP_SOURCE etc are available without explicit shell export. */
for (const candidate of [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '.env')]) {
  if (!fs.existsSync(candidate)) continue
  for (const line of fs.readFileSync(candidate, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    if (process.env[m[1]] === undefined) {
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  }
}

function readOfficialAppMetadata() {
  if (process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON) {
    try {
      return JSON.parse(process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON)
    } catch (error) {
      console.warn('Ignoring invalid TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON:', error?.message ?? error)
    }
  }
  if (process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_FILE) {
    const filePath = path.resolve(process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_FILE)
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch (error) {
        console.warn('Ignoring invalid TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_FILE:', error?.message ?? error)
      }
    }
  }
  return null
}

const officialAppMetadata = readOfficialAppMetadata()

const tamerRouter = tamerRouterPlugin({
  root: './src/pages',
  output: 'src/generated-routes.tsx',
  layoutFilename: '_layout.tsx',
})

/** When building inside the monorepo, point at workspace sources if present. Published installs have no ../ siblings, so aliases stay empty and npm resolution is used. */
const monorepoAliases = {}
const candidates = [
  ['@tamer4lynx/tamer-router', '../tamer-router/src/index.ts'],
  ['@tamer4lynx/tamer-system-ui', '../tamer-system-ui/src/index.ts'],
  ['@tamer4lynx/tamer-app-shell', '../tamer-app-shell/src/index.tsx'],
  ['@tamer4lynx/tamer-screen', '../tamer-screen/src/index.tsx'],
  ['@tamer4lynx/tamer-icons', '../tamer-icons/src/index.tsx'],
  ['@tamer4lynx/tamer-insets', '../tamer-insets/src/index.ts'],
]
for (const [pkg, rel] of candidates) {
  const p = path.resolve(__dirname, rel)
  if (fs.existsSync(p)) monorepoAliases[pkg] = p
}

export default {
  source: {
    entry: {
      'dev-client': './src/index.tsx',
      /** Minimal shell for native debug dialog / overlay (no router, no dev launcher chrome). */
      'tamer-debug': './src/tamer-debug-panel.tsx',
    },
    define: {
      __TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA__: JSON.stringify(officialAppMetadata),
    },
  },
  resolve: {
    alias: monorepoAliases,
  },
  plugins: [pluginTamer({ tamerRouter }), pluginReactLynx()],
}
