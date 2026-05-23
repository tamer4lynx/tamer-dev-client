import { useEffect, useState } from '@lynx-js/react'
import '@tamer4lynx/tamer-icons'
import { openURL } from '@tamer4lynx/tamer-linking'
import { devCall } from '../devcall'
import { DEV_CLIENT_PACKAGE_VERSION } from '../packageVersion'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

type OfficialAppLink = {
  id?: string
  icon?: string
  set?: 'fab' | 'fa'
  label?: string
  url?: string
}

type OfficialAppMetadata = {
  displayName?: string
  packageLabel?: string
  source?: string
  androidPackageId?: string
  iosBundleId?: string
  creditTitle?: string
  links?: OfficialAppLink[]
}

declare const __TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA__: OfficialAppMetadata | null | undefined

const OFFICIAL_APP_METADATA: OfficialAppMetadata | null =
  typeof __TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA__ !== 'undefined'
    ? __TAMER_DEV_CLIENT_OFFICIAL_APP_METADATA__ ?? null
    : null

function isOfficialBundleId(bundleId: string): boolean {
  if (!OFFICIAL_APP_METADATA || bundleId === '—') return false
  return [OFFICIAL_APP_METADATA.androidPackageId, OFFICIAL_APP_METADATA.iosBundleId]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .includes(bundleId)
}

function getOfficialPackageLabel(): string {
  const name =
    OFFICIAL_APP_METADATA?.packageLabel ??
    OFFICIAL_APP_METADATA?.displayName ??
    'Tamer Dev App'
  const source = OFFICIAL_APP_METADATA?.source
  return source ? `${name} (${source})` : name
}

function getOfficialLinks(): Array<Required<Pick<OfficialAppLink, 'icon' | 'label' | 'url'>> & { id: string; set: 'fab' | 'fa' }> {
  const links = Array.isArray(OFFICIAL_APP_METADATA?.links) ? OFFICIAL_APP_METADATA.links : []
  return links
    .filter(
      (link): link is OfficialAppLink & { icon: string; label: string; url: string } =>
        typeof link.icon === 'string' &&
        link.icon.length > 0 &&
        typeof link.label === 'string' &&
        link.label.length > 0 &&
        typeof link.url === 'string' &&
        link.url.length > 0,
    )
    .map((link, index) => ({
      id: link.id ?? `${link.icon}-${index}`,
      icon: link.icon,
      set: link.set === 'fab' ? 'fab' : 'fa',
      label: link.label,
      url: link.url,
    }))
}

export default function AboutPage() {
  const { theme } = useDevLauncher()
  const colors = resolveTheme(theme)
  const [bundleId, setBundleId] = useState('—')
  const [nativeVersion, setNativeVersion] = useState('—')
  const [lynxSdkVersion, setLynxSdkVersion] = useState('—')

  const cardBorder = colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const isOfficialApp = isOfficialBundleId(bundleId)
  const officialLinks = isOfficialApp ? getOfficialLinks() : []

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
            {isOfficialApp ? 'Tamer App' : 'Dev client (npm)'}
          </text>
          <text className="DevLauncher__aboutValue" style={{ color: colors.onSurface }}>
            {/* nativeVersion reflects the app release version (tamer-dev-app).
                tamer-dev-app and tamer-dev-client versions are kept in sync —
                always bump both together when releasing. */}
            Version {nativeVersion !== '—' ? nativeVersion : DEV_CLIENT_PACKAGE_VERSION}
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

      {officialLinks.length > 0 ? (
        <view
          className="DevLauncher__card"
          style={{ backgroundColor: colors.surfaceContainer, borderColor: cardBorder }}
        >
          <text className="DevLauncher__cardTitle" style={{ color: colors.onSurfaceVariant ?? '#888888' }}>
            {OFFICIAL_APP_METADATA?.creditTitle ?? 'Official app'}
          </text>
          <view style={{ display: 'flex', flexDirection: 'column' }}>
            {officialLinks.map((link) => (
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
