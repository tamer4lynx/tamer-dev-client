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

type MergedEntry = {
  key: string
  url: string
  title: string
  subtitle: string | undefined
  iconUrl: string | undefined
  compatible: boolean
  dotClass: string
  saved: boolean
}

function dotClassForReachability(st: RecentReachability | undefined): string {
  switch (st) {
    case 'matched':
      return 'DevLauncher__statusDot DevLauncher__statusDot--online'
    case 'offline':
      return 'DevLauncher__statusDot DevLauncher__statusDot--offline'
    case 'mismatch':
      return 'DevLauncher__statusDot DevLauncher__statusDot--mismatch'
    case 'stale':
      return 'DevLauncher__statusDot DevLauncher__statusDot--stale'
    default:
      return 'DevLauncher__statusDot DevLauncher__statusDot--checking'
  }
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

  const recentByKey = useMemo(() => {
    const m = new Map<string, RecentEntry>()
    for (const e of recentEntries) {
      m.set(serverIdentityKey({ url: parseUrl(e.url), tamerAppKey: e.tamerAppKey }), e)
    }
    return m
  }, [recentEntries, parseUrl])

  const merged: MergedEntry[] = useMemo(() => {
    const out: MergedEntry[] = []
    const seen = new Set<string>()

    // 1. Discovered first (live) — merge with saved metadata if URL already saved
    for (const s of discoveredServers) {
      const parsed = parseUrl(s.url)
      const key = serverIdentityKey({ url: parsed, tamerAppKey: s.tamerAppKey })
      if (seen.has(key)) continue
      seen.add(key)
      const saved = recentByKey.get(key)
      const compatible = s.compatible !== false
      const dotClass = compatible
        ? 'DevLauncher__statusDot DevLauncher__statusDot--online'
        : 'DevLauncher__statusDot DevLauncher__statusDot--offline'
      out.push({
        key,
        url: s.url,
        title: saved?.label?.trim() ? saved.label : (s.name || s.url),
        subtitle: saved?.label?.trim() ? s.url : undefined,
        iconUrl: isBundleUrl(s.url) ? lynxIconMono : (recentRowIconSrc[s.url] ?? saved?.iconUrl ?? s.iconUrl),
        compatible,
        dotClass,
        saved: !!saved,
      })
    }

    // 2. Saved-only (not currently discovered)
    for (const e of recentEntries) {
      const parsed = parseUrl(e.url)
      const key = serverIdentityKey({ url: parsed, tamerAppKey: e.tamerAppKey })
      if (seen.has(key)) continue
      seen.add(key)
      const st = recentReachability[e.url]
      out.push({
        key,
        url: e.url,
        title: e.label?.trim() ? e.label : e.url,
        subtitle: e.label?.trim() ? e.url : undefined,
        iconUrl: isBundleUrl(e.url) ? lynxIconMono : (recentRowIconSrc[e.url] ?? e.iconUrl),
        compatible: st !== 'mismatch',
        dotClass: dotClassForReachability(st),
        saved: true,
      })
    }

    return out
  }, [discoveredServers, recentEntries, recentByKey, recentReachability, recentRowIconSrc, parseUrl])

  const handleSelect = useCallback(
    (rawUrl: string, compatible: boolean) => {
      'background only'
      const parsed = parseUrl(rawUrl)
      if (!compatible) {
        showIncompatibleModalForUrl(parsed)
        return
      }
      setUrl(parsed)
      replace('/')
      openProject(rawUrl)
    },
    [parseUrl, setUrl, replace, openProject, showIncompatibleModalForUrl],
  )

  const subtitleColor = colors.onSurfaceVariant ?? '#888888'

  return (
    <view className="DevLauncher__combinedList">
      <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface, marginBottom: '8px' }}>
        Servers
      </text>
      {merged.length === 0 ? (
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>
          Scanning for servers on your network… Saved servers also appear here.
        </text>
      ) : (
        <>
          <text className="DevLauncher__hint" style={{ color: colors.onSurface, marginBottom: '8px' }}>
            Swipe left on a saved row to delete.
          </text>
          <view className="DevLauncher__recentList">
            {merged.map((m) =>
              m.saved ? (
                <RecentSwipeRow
                  key={m.key}
                  title={m.title}
                  subtitle={m.subtitle}
                  iconUrl={m.iconUrl}
                  dotClass={m.dotClass}
                  surfaceColor={colors.surfaceContainer ?? '#1e1e1e'}
                  titleColor={colors.onSurface ?? '#fff'}
                  subtitleColor={subtitleColor}
                  onConnect={() => handleSelect(m.url, m.compatible)}
                  onRemove={() => removeRecentItem(m.url)}
                />
              ) : (
                <ServerListRow
                  key={m.key}
                  dotClass={m.dotClass}
                  iconUrl={m.iconUrl}
                  title={m.title}
                  subtitle={m.subtitle ?? m.url}
                  surfaceColor={colors.surfaceContainer ?? '#1e1e1e'}
                  borderColor={colors.surfaceContainer ?? '#1e1e1e'}
                  titleColor={colors.onSurface ?? '#fff'}
                  subtitleColor={subtitleColor}
                  onPress={() => handleSelect(m.url, m.compatible)}
                />
              ),
            )}
          </view>
        </>
      )}
    </view>
  )
}
