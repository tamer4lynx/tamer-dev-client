import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTamer } from '@tamer4lynx/tamer-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Monorepo workspace aliases. Keep in sync with lynx.config.mjs. `npm run build` uses --config lynx.config.mjs; plain `rspeedy dev` loads this file first if present. */
const monorepoAliases: Record<string, string> = {}
const candidates: [string, string][] = [
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

function readOfficialAppMetadata(): unknown {
  if (process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON) {
    try {
      return JSON.parse(process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON)
    } catch (error) {
      console.warn('Ignoring invalid TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON:', error)
    }
  }
  if (process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_FILE) {
    const filePath = path.resolve(process.env.TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_FILE)
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch (error) {
        console.warn('Ignoring invalid TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA_FILE:', error)
      }
    }
  }
  return null
}

const officialAppMetadata = readOfficialAppMetadata()

export default {
  source: {
    entry: { 'dev-client': './src/index.tsx' },
    define: {
      __TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA__: JSON.stringify(officialAppMetadata),
    },
  },
  resolve: {
    alias: monorepoAliases,
  },
  plugins: [pluginTamer(), pluginReactLynx()],
}
