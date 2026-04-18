import { useEffect, useState } from '@lynx-js/react'
import { devCall } from '../devcall'
import { DEV_CLIENT_PACKAGE_VERSION } from '../packageVersion'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

export default function AboutPage() {
  const { theme } = useDevLauncher()
  const colors = resolveTheme(theme)
  const [bundleId, setBundleId] = useState('—')
  const [nativeVersion, setNativeVersion] = useState('—')
  const [lynxSdkVersion, setLynxSdkVersion] = useState('—')

  const cardBorder = colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'

  useEffect(() => {
    'background only'
    devCall('getAppInfo', {}, (info) => {
      if (info != null && typeof info === 'object' && !Array.isArray(info)) {
        const o = info as Record<string, unknown>
        const b = o.bundleId != null && String(o.bundleId) !== '' ? String(o.bundleId) : '—'
        const v = o.nativeAppVersion != null && String(o.nativeAppVersion) !== '' ? String(o.nativeAppVersion) : '—'
        const l =
          o.lynxSdkVersion != null && String(o.lynxSdkVersion) !== '' ? String(o.lynxSdkVersion) : '—'
        setBundleId(b)
        setNativeVersion(v)
        setLynxSdkVersion(l)
      }
    })
  }, [])

  return (
    <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
      <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface, marginBottom: '16px' }}>
        About
      </text>

      <view
        className="DevLauncher__card"
        style={{ backgroundColor: colors.surfaceContainer, borderColor: cardBorder }}
      >
        <text className="DevLauncher__cardTitle" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
          Package
        </text>
        <view className="DevLauncher__cardBlock">
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Dev client (npm)</text>
          <text className="DevLauncher__aboutValue" style={{ color: colors.onSurface }}>
            Version {DEV_CLIENT_PACKAGE_VERSION}
          </text>
        </view>
      </view>

      <view
        className="DevLauncher__card"
        style={{ backgroundColor: colors.surfaceContainer, borderColor: cardBorder }}
      >
        <text className="DevLauncher__cardTitle" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
          Native app
        </text>
        <view className="DevLauncher__cardBlock">
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Identifier</text>
          <text className="DevLauncher__aboutValue" style={{ color: colors.onSurface }}>{bundleId}</text>
        </view>
        <view className="DevLauncher__cardBlock">
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Version</text>
          <text className="DevLauncher__aboutValue" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
            {nativeVersion}
          </text>
        </view>
      </view>

      <view
        className="DevLauncher__card"
        style={{ backgroundColor: colors.surfaceContainer, borderColor: cardBorder }}
      >
        <text className="DevLauncher__cardTitle" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
          Lynx
        </text>
        <view className="DevLauncher__cardBlock">
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>SDK</text>
          <text className="DevLauncher__aboutValue" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
            {lynxSdkVersion}
          </text>
        </view>
      </view>
    </view>
  )
}
