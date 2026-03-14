import { useCallback } from '@lynx-js/react'
import { useTamerNavigate } from 'tamer-router'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

export default function RecentPage() {
  const { recentUrls, openProject, setUrl, parseUrl, theme } = useDevLauncher()
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

  if (recentUrls.length === 0) {
    return (
      <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
        <view className="DevLauncher__section">
          <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Recently opened</text>
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>No recent servers. Connect from the Connect tab.</text>
        </view>
      </view>
    )
  }

  return (
    <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
      <view className="DevLauncher__section">
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Recently opened</text>
        <view className="DevLauncher__recentList">
          {recentUrls.map((u) => (
            <view key={u} className="DevLauncher__recentItem" style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceContainer }} bindtap={() => handleSelect(u)}>
              <text className="DevLauncher__recentText" style={{ color: colors.onSurface }}>{u}</text>
            </view>
          ))}
        </view>
      </view>
    </view>
  )
}
