import { useCallback, useMemo } from '@lynx-js/react'
import { useTamerNavigate } from '@tamer4lynx/tamer-router'
import ServerListRow from './ServerListRow'
import RecentSwipeRow from './RecentSwipeRow'
import lynxIconMono from '../assets/lynx-icon-mono.png?inline'

function isBundleUrl(url: string): boolean {
  return url.includes('.lynx.bundle')
}
import type {
  DevLauncherTheme,
  DiscoveredServer,
  RecentEntry,
  RecentReachability,
} from '../DevLauncherContext'
import { resolveTheme } from '../DevLauncherContext'
import { serverIdentityKey } from '../serverIdentity'

type Props = {
  theme: DevLauncherTheme | null
  parseUrl: (raw: string) => string
  discoveredServers: DiscoveredServer[]
  recentEntries: RecentEntry[]
  recentReachability: Record<string, RecentReachability>
  recentRowIconSrc: Record<string, string | undefined>
  openProject: (rawUrl: string) => void
  setUrl: (u: string) => void
  showIncompatibleModalForUrl: (parsed: string) => void
  removeRecentItem: (url: string) => void
}

export default function CombinedServerList(props: Props) {
  const {
    theme,
    parseUrl,
    discoveredServers,
    recentEntries,
    recentReachability,
    recentRowIconSrc,
    openProject,
    setUrl,
    showIncompatibleModalForUrl,
    removeRecentItem,
  } = props
  const { replace } = useTamerNavigate()
  const colors = resolveTheme(theme)

  const discoveredUrls = useMemo(
    () =>
      new Set(
        discoveredServers.map((s) =>
          serverIdentityKey({ url: parseUrl(s.url), tamerAppKey: s.tamerAppKey })
        ),
      ),
    [discoveredServers, parseUrl],
  )

  const recentNotInDiscovered = useMemo(
    () =>
      recentEntries.filter(
        (e) =>
          !discoveredUrls.has(
            serverIdentityKey({ url: parseUrl(e.url), tamerAppKey: e.tamerAppKey }),
          ),
      ),
    [recentEntries, discoveredUrls, parseUrl],
  )

  const handleDiscoverSelect = useCallback(
    (rawUrl: string, isCompatible: boolean) => {
      'background only'
      const parsed = parseUrl(rawUrl)
      if (!isCompatible) {
        showIncompatibleModalForUrl(parsed)
        return
      }
      setUrl(parsed)
      replace('/')
      openProject(rawUrl)
    },
    [parseUrl, setUrl, replace, openProject, showIncompatibleModalForUrl],
  )

  const handleRecentSelect = useCallback(
    (rawUrl: string) => {
      'background only'
      const parsed = parseUrl(rawUrl)
      setUrl(parsed)
      replace('/')
      openProject(rawUrl)
    },
    [parseUrl, setUrl, replace, openProject],
  )

  const subtitleColor = colors.onSurfaceVariant ?? '#888888'

  return (
    <view className="DevLauncher__combinedList">
      <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface, marginBottom: '8px' }}>
        Discovered
      </text>
      {discoveredServers.length === 0 ? (
        <text className="DevLauncher__hint" style={{ color: colors.onSurface, marginBottom: '16px' }}>
          Scanning for servers on your network…
        </text>
      ) : (
        <view className="DevLauncher__recentList" style={{ marginBottom: '16px' }}>
          {discoveredServers.map((s) => {
            const compatible = s.compatible !== false
            const dotClass = compatible
              ? 'DevLauncher__statusDot DevLauncher__statusDot--online'
              : 'DevLauncher__statusDot DevLauncher__statusDot--offline'
            return (
              <ServerListRow
                key={s.url}
                dotClass={dotClass}
                iconUrl={isBundleUrl(s.url) ? lynxIconMono : s.iconUrl}
                title={s.name || s.url}
                subtitle={s.url}
                surfaceColor={colors.surfaceContainer ?? '#1e1e1e'}
                borderColor={colors.surfaceContainer ?? '#1e1e1e'}
                titleColor={colors.onSurface ?? '#fff'}
                subtitleColor={subtitleColor}
                onPress={() => handleDiscoverSelect(s.url, compatible)}
              />
            )
          })}
        </view>
      )}

      <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface, marginBottom: '8px' }}>
        Recent
      </text>
      {recentNotInDiscovered.length === 0 ? (
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>
          No recent servers yet. Connect above or open a discovered server.
        </text>
      ) : (
        <>
          <text className="DevLauncher__hint" style={{ color: colors.onSurface, marginBottom: '8px' }}>
            Swipe left on a row to delete.
          </text>
          <view className="DevLauncher__recentList">
            {recentNotInDiscovered.map((e) => {
              const st = recentReachability[e.url] ?? 'checking'
              const dotClass =
                st === 'matched'
                  ? 'DevLauncher__statusDot DevLauncher__statusDot--online'
                  : st === 'offline'
                    ? 'DevLauncher__statusDot DevLauncher__statusDot--offline'
                    : st === 'mismatch'
                      ? 'DevLauncher__statusDot DevLauncher__statusDot--mismatch'
                      : st === 'stale'
                        ? 'DevLauncher__statusDot DevLauncher__statusDot--stale'
                        : 'DevLauncher__statusDot DevLauncher__statusDot--checking'
              const title = e.label?.trim() ? e.label : e.url
              const subtitle = e.label?.trim() ? e.url : undefined
              return (
                <RecentSwipeRow
                  key={e.url}
                  title={title}
                  subtitle={subtitle}
                  iconUrl={isBundleUrl(e.url) ? lynxIconMono : (recentRowIconSrc[e.url] ?? e.iconUrl)}
                  dotClass={dotClass}
                  surfaceColor={colors.surfaceContainer ?? '#1e1e1e'}
                  titleColor={colors.onSurface ?? '#fff'}
                  subtitleColor={subtitleColor}
                  onConnect={() => handleRecentSelect(e.url)}
                  onRemove={() => removeRecentItem(e.url)}
                />
              )
            })}
          </view>
        </>
      )}
    </view>
  )
}
