import { root } from '@lynx-js/react'
import { FileRouter } from 'tamer-router'
import { DevLauncherProvider } from './DevLauncherContext'
import './DevLauncher.css'

import routes from 'tamer-router/generated-routes'

root.render(
  <DevLauncherProvider>
    <FileRouter routes={routes} />
  </DevLauncherProvider>
)
