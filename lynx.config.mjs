import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTamer } from '@tamer4lynx/tamer-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    entry: { 'dev-client': './src/index.tsx' },
  },
  resolve: {
    alias: monorepoAliases,
  },
  plugins: [pluginTamer(), pluginReactLynx()],
}
