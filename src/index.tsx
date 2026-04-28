import { root } from '@lynx-js/react'
import { FileRouter } from '@tamer4lynx/tamer-router'
import { Route, Routes } from 'react-router'
import { DevLauncherProvider } from './DevLauncherContext'
import './DevLauncher.css'

import About from './pages/about.js'
import Layout from './pages/_layout.js'
import Connect from './pages/index.js'

root.render(
  <DevLauncherProvider>
    <FileRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Connect />} />
          <Route path="about" element={<About />} />
        </Route>
      </Routes>
    </FileRouter>
  </DevLauncherProvider>,
)
