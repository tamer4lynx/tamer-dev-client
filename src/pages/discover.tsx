import { useCallback } from '@lynx-js/react'
import { useTamerNavigate } from 'tamer-router'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

export default function DiscoverPage() {
  const { discoveredServers, openProject, setUrl, parseUrl, theme } = useDevLauncher()
  const { replace } = useTamerNavigate()
  const colors = resolveTheme(theme)

  const handleSelect = useCallback(
    (rawUrl: string) => {
      'background only'
      const parsed = parseUrl(rawUrl)
      setUrl(parsed)
      replace('/')
      openProject(rawUrl)
    },
    [parseUrl, setUrl, replace, openProject]
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

  return (
    <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
      <view className="DevLauncher__section">
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Local development servers</text>
        <view className="DevLauncher__recentList">
          {discoveredServers.map((s) => (
            <view key={s.url} className="DevLauncher__recentItem DevLauncher__recentItem--discovered" style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.primary }} bindtap={() => handleSelect(s.url)}>
              <text className="DevLauncher__recentText DevLauncher__recentText--name" style={{ color: colors.onSurface }}>{s.name}</text>
              <text className="DevLauncher__recentText DevLauncher__recentText--url" style={{ color: colors.onSurface }}>{s.url}</text>
            </view>
          ))}
        </view>
      </view>
    </view>
  )
}
