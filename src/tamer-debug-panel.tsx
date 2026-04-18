import { root } from '@lynx-js/react'
import { CustomDebugPanel } from './components/CustomDebugPanel.js'
import { devCall } from './devcall.js'
import { FALLBACK_THEME } from './devLauncherTheme.js'

function TamerDebugPanelApp() {
  return (
    <view style={{ width: '100%', height: '100%' }}>
      <CustomDebugPanel
        visible={true}
        onClose={() => {
          'background only'
          devCall('dismissTamerDebugPanel')
        }}
        theme={FALLBACK_THEME}
      />
    </view>
  )
}

root.render(<TamerDebugPanelApp />)
