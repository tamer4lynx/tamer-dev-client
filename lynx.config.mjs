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
      __OFFICIAL_APP_SOURCE__: JSON.stringify(process.env.OFFICIAL_APP_SOURCE ?? ''),
    },
  },
  resolve: {
    alias: monorepoAliases,
  },
  plugins: [pluginTamer({ tamerRouter }), pluginReactLynx()],
}
