import { useEffect, useState } from '@lynx-js/react'
import '@tamer4lynx/tamer-icons'
import { openURL } from '@tamer4lynx/tamer-linking'
import { devCall } from '../devcall'
import { DEV_CLIENT_PACKAGE_VERSION } from '../packageVersion'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

const TAMER_DEV_APP_BUNDLE_ID = 'com.nanofuxion.tamerdevapp'
declare const __OFFICIAL_APP_SOURCE__: string
const OFFICIAL_APP_SOURCE: string = typeof __OFFICIAL_APP_SOURCE__ !== 'undefined' ? __OFFICIAL_APP_SOURCE__ : ''
const CREDIT_LINKS: Array<{ id: string; icon: string; set: 'fab' | 'fa'; label: string; url: string }> = [
  {
    id: 'github',
    icon: 'github',
    set: 'fab',
    label: 'tamer4lynx/tamer4lynx',
    url: 'https://github.com/tamer4lynx/tamer4lynx',
  },
  {
    id: 'discord',
    icon: 'discord',
    set: 'fab',
    label: '@nanofuxion',
    url: 'https://discord.com/users/235301625659392001',
  },
  {
    id: 'email',
    icon: 'envelope',
    set: 'fa',
    label: 'ramnadroj@gmail.com',
    url: 'mailto:ramnadroj@gmail.com',
  },
]

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
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>
            {bundleId === TAMER_DEV_APP_BUNDLE_ID
              ? `Tamer Dev App${OFFICIAL_APP_SOURCE ? ` (${OFFICIAL_APP_SOURCE})` : ''}`
              : 'Dev client (npm)'}
          </text>
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

      {bundleId === TAMER_DEV_APP_BUNDLE_ID ? (
        <view
          className="DevLauncher__card"
          style={{ backgroundColor: colors.surfaceContainer, borderColor: cardBorder }}
        >
          <text className="DevLauncher__cardTitle" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
            Created by Nanofuxion
          </text>
          <view style={{ display: 'flex', flexDirection: 'column' }}>
            {CREDIT_LINKS.map((link) => (
              <view
                key={link.id}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                }}
                bindtap={() => {
                  openURL(link.url)
                }}
              >
                <icon
                  icon={link.icon}
                  set={link.set}
                  size={20}
                  iconColor={colors.onSurface}
                  style={{ width: '24px', height: '24px', marginRight: '12px', flexShrink: 0 }}
                />
                <text
                  className="DevLauncher__aboutValue"
                  style={{ color: colors.onSurface, fontSize: '14px', flexGrow: 1, flexShrink: 1 }}
                >
                  {link.label}
                </text>
              </view>
            ))}
          </view>
        </view>
      ) : null}
    </view>
  )
}
