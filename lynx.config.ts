import { fileURLToPath } from 'url'
import path from 'path'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTamer } from '@tamer4lynx/tamer-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  source: {
    entry: { 'dev-client': './src/index.tsx' },
    alias: {
      '@tamer4lynx/tamer-app-shell': path.resolve(__dirname, '../tamer-app-shell/src/index.tsx'),
      '@tamer4lynx/tamer-screen': path.resolve(__dirname, '../tamer-screen/src/index.tsx'),
      '@tamer4lynx/tamer-icons': path.resolve(__dirname, '../tamer-icons/src/index.tsx'),
      '@tamer4lynx/tamer-insets': path.resolve(__dirname, '../tamer-insets/src/index.ts'),
    },
  },
  plugins: [pluginTamer(), pluginReactLynx()],
}
