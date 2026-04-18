import { useCallback, useMemo } from '@lynx-js/react'
import { Button } from '@tamer4lynx/tamer-app-shell'
import CombinedServerList from '../components/CombinedServerList'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'
import { validateDevServerUrl } from '../devServerUrl'

export default function ConnectPage() {
  const {
    url,
    setUrl,
    openProject,
    openProjectDirectly,
    onScanQR,
    theme,
    connectError,
    discoveredServers,
    recentEntries,
    recentReachability,
    recentRowIconSrc,
    parseUrl,
    showIncompatibleModalForUrl,
    removeRecentItem,
  } = useDevLauncher()
  const colors = resolveTheme(theme)
  const canConnect = useMemo(() => validateDevServerUrl(url).ok, [url])

  const onConnect = useCallback(() => {
    'background only'
    if (!validateDevServerUrl(url).ok) return
    openProject(url)
  }, [url, openProject])

  return (
    <view
      className="DevLauncher DevLauncher--page"
      style={{
        backgroundColor: colors.surface,
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <view className="DevLauncher__section" style={{ flexShrink: 0 }}>
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Connect to dev server</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Start a local development server with: npx t4l start</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Then, enter the dev server URL when it appears here.</text>
        <input
          className="DevLauncher__input"
          style={{
            backgroundColor: colors.surfaceContainer,
            color: colors.onSurface,
            boxSizing: 'border-box',
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'hidden',
          }}
          value={url}
          placeholder="http://localhost:3000/example"
          type="text"
          ios-auto-correct={false}
          ios-spell-check={false}
          bindinput={(e) => {
            'background only'
            setUrl(e.detail.value)
          }}
        />
        {connectError ? (
          <text className="DevLauncher__hint" style={{ color: '#ef4444', marginBottom: '12px' }}>{connectError}</text>
        ) : null}
        <view className="DevLauncher__buttons">
          <Button
            label="Connect"
            variant="filled"
            disabled={!canConnect}
            onTap={onConnect}
            style={{ width: '100%' }}
            colors={{ container: colors.primary }}
          />
          <text className="DevLauncher__or" style={{ color: colors.onSurface }}>Or</text>
          <Button
            label="Scan QR code"
            variant="elevated"
            onTap={onScanQR}
            style={{ width: '100%' }}
            colors={{ container: colors.surfaceContainer, label: colors.onSurface }}
          />
        </view>
      </view>
      <scroll-view
        scroll-y
        className="DevLauncher__scrollList"
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          paddingLeft: '6px',
          paddingRight: '6px',
          paddingBottom: '16px',
          boxSizing: 'border-box',
        }}
      >
        <CombinedServerList
          theme={theme}
          parseUrl={parseUrl}
          discoveredServers={discoveredServers}
          recentEntries={recentEntries}
          recentReachability={recentReachability}
          recentRowIconSrc={recentRowIconSrc}
          openProject={openProject}
          openProjectDirectly={openProjectDirectly}
          setUrl={setUrl}
          showIncompatibleModalForUrl={showIncompatibleModalForUrl}
          removeRecentItem={removeRecentItem}
        />
      </scroll-view>
    </view>
  )
}
