import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTamer } from '@tamer4lynx/tamer-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const monorepoAliases: Record<string, string> = {}
const candidates: [string, string][] = [
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
    alias: monorepoAliases,
  },
  plugins: [pluginTamer(), pluginReactLynx()],
}
