import { useCallback } from '@lynx-js/react'
import CombinedServerList from '../components/CombinedServerList'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

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

  const onConnect = useCallback(() => {
    'background only'
    console.error('[DevLauncher] Connect tapped url=', url)
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
          <view
            className="DevLauncher__btn DevLauncher__btn--primary"
            style={{ backgroundColor: colors.primary, borderColor: colors.surfaceContainer }}
            bindtap={onConnect}
          >
            <text className="DevLauncher__btnText" style={{ color: colors.surface }}>Connect</text>
          </view>
          <text className="DevLauncher__or" style={{ color: colors.onSurface }}>Or</text>
          <view
            className="DevLauncher__btn"
            style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceContainer }}
            bindtap={onScanQR}
          >
            <text className="DevLauncher__btnText" style={{ color: colors.onSurface }}>Scan QR code</text>
          </view>
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
