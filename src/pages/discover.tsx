import { useCallback } from '@lynx-js/react'
import { useTamerNavigate } from '@tamer4lynx/tamer-router'
import ServerListRow from '../components/ServerListRow'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

export default function DiscoverPage() {
  const { discoveredServers, openProject, setUrl, parseUrl, theme, showIncompatibleModalForUrl } = useDevLauncher()
  const { replace } = useTamerNavigate()
  const colors = resolveTheme(theme)

  const handleSelect = useCallback(
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
    [parseUrl, setUrl, replace, openProject, showIncompatibleModalForUrl]
  )

  if (discoveredServers.length === 0) {
    return (
      <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
        <view className="DevLauncher__section">
          <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Local development servers</text>
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Scanning for servers on your network...</text>
        </view>
      </view>
    )
  }

  const subtitleColor = colors.onSurfaceVariant ?? '#888888'

  return (
    <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
      <view className="DevLauncher__section">
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Local development servers</text>
        <view className="DevLauncher__recentList">
          {discoveredServers.map((s) => {
            const compatible = s.compatible !== false
            const dotClass = compatible
              ? 'DevLauncher__statusDot DevLauncher__statusDot--online'
              : 'DevLauncher__statusDot DevLauncher__statusDot--offline'
            return (
              <ServerListRow
                key={s.url}
                dotClass={dotClass}
                iconUrl={s.iconUrl}
                title={s.name || s.url}
                subtitle={s.url}
                surfaceColor={colors.surfaceContainer ?? '#1e1e1e'}
                borderColor={colors.primary ?? '#007aff'}
                titleColor={colors.onSurface ?? '#fff'}
                subtitleColor={subtitleColor}
                itemClassName="DevLauncher__recentItem DevLauncher__recentItem--discovered"
                onPress={() => handleSelect(s.url, compatible)}
              />
            )
          })}
        </view>
      </view>
    </view>
  )
}
