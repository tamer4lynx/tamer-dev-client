import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = dirname(scriptDir)

function findRspeedyBin() {
  const candidates = []
  let dir = packageRoot
  const { root } = parse(packageRoot)
  while (dir !== root) {
    candidates.push(join(dir, 'node_modules', '@lynx-js', 'rspeedy', 'bin', 'rspeedy.js'))
    dir = dirname(dir)
  }
  candidates.push(
    join(packageRoot, '..', 'example', 'node_modules', '@lynx-js', 'rspeedy', 'bin', 'rspeedy.js')
  )
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin
  }
  throw new Error(
    '@lynx-js/rspeedy not found; run npm install in the monorepo root, or ensure packages/example has devDependencies installed.'
  )
}

const bin = findRspeedyBin()
const { status } = spawnSync(process.execPath, [bin, 'build', '--config', 'lynx.config.mjs'], {
  stdio: 'inherit',
  cwd: packageRoot,
})
process.exit(status ?? 1)
