import { useCallback, useEffect, useState } from '@lynx-js/react'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'
import { getThemeColorsAsync } from '@tamer4lynx/tamer-system-ui'

declare const NativeModules: Record<string, unknown> | undefined

export default function ConnectPage() {
  const { url, setUrl, openProject, onScanQR, theme, connectError } = useDevLauncher()
  const colors = resolveTheme(theme)
  const [debugRaw, setDebugRaw] = useState('...')

  useEffect(() => {
    'background only'
    const hasModule = typeof NativeModules !== 'undefined' && NativeModules != null
    const keys = hasModule ? Object.keys(NativeModules as object).join(', ') : 'NativeModules undefined'
    getThemeColorsAsync().then((c) => {
      setDebugRaw(`modules:[${keys}] raw:${JSON.stringify(c)}`)
    }).catch((e: unknown) => {
      setDebugRaw(`modules:[${keys}] err:${String(e)}`)
    })
  }, [])

  const onConnect = useCallback(() => {
    'background only'
    openProject(url)
  }, [url, openProject])

  return (
    <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
      <view className="DevLauncher__section">
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Connect to dev server</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Start a local development server with: npx t4l start</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Then, enter the dev server URL when it appears here.</text>
        <input
          className="DevLauncher__input"
          style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
          value={url}
          placeholder="http://localhost:3000/example"
          bindinput={(e) => setUrl(e.detail.value)}
        />
        {connectError ? (
          <text className="DevLauncher__hint" style={{ color: '#ef4444', marginBottom: '12px' }}>{connectError}</text>
        ) : null}
        <view className="DevLauncher__buttons">
          <view className="DevLauncher__btn DevLauncher__btn--primary" style={{ backgroundColor: colors.primary, borderColor: colors.surfaceContainer }} bindtap={onConnect}>
            <text className="DevLauncher__btnText" style={{ color: colors.surface }}>Connect</text>
          </view>
          <text className="DevLauncher__or" style={{ color: colors.onSurface }}>Or</text>
          <view className="DevLauncher__btn" style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceContainer }} bindtap={onScanQR}>
            <text className="DevLauncher__btnText" style={{ color: colors.onSurface }}>Scan QR code</text>
          </view>
        </view>
        {/* <text style={{ fontSize: '20rpx', color: colors.onSurface, marginTop: '24rpx' }}>
          {theme == null ? 'theme: null (fallback)' : 'theme: live'}
        </text>
        <text style={{ fontSize: '18rpx', color: colors.onSurface }}>{debugRaw}</text>
        <view style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8rpx', marginTop: '8rpx', alignItems: 'flex-start' }}>
          {(['surface', 'surfaceContainer', 'primary', 'primaryDark', 'background', 'onSurface'] as const).map((key) => (
            <view key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4rpx' }}>
              <view style={{ width: '48rpx', height: '48rpx', borderRadius: '8rpx', backgroundColor: colors[key], borderWidth: '1rpx', borderColor: colors.onSurface }} />
              <text style={{ fontSize: '18rpx', color: colors.onSurface }}>{key}</text>
              <text style={{ fontSize: '16rpx', color: colors.onSurface }}>{colors[key]}</text>
            </view>
          ))}
        </view> */}
      </view>
    </view>
  )
}
