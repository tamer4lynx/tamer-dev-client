import { root } from '@lynx-js/react'
import { FileRouter } from '@tamer4lynx/tamer-router'
import { DevLauncherProvider } from './DevLauncherContext'
import './DevLauncher.css'

import RootNavigator, { tamerLinking } from './generated-routes'

root.render(
  <DevLauncherProvider>
    <FileRouter routes={RootNavigator} linking={tamerLinking} />
  </DevLauncherProvider>
)
