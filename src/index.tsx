import { root } from '@lynx-js/react'
import { FileRouter } from '@tamer4lynx/tamer-router'
import { DevLauncherProvider } from './DevLauncherContext'
import './DevLauncher.css'

import routes from '@tamer4lynx/tamer-router/generated-routes'

root.render(
  <DevLauncherProvider>
    <FileRouter routes={routes} />
  </DevLauncherProvider>
)
