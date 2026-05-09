import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { Button } from '@tamer4lynx/tamer-app-shell'
import CombinedServerList from '../components/CombinedServerList'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

const DEV_SERVER_URL_INPUT_ID = 'dev-server-url'
const isIOS = SystemInfo.platform === 'iOS'

const updateInputById = (id: string, value: string) => {
  lynx.createSelectorQuery()
    .select(`#${id}`)
    .invoke({
      method: 'setValue',
      params: {
        value,
      },
      success: function () {},
      fail: function () {},
    })
    .exec()
}

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
  const inputValueRef = useRef('')
  const inputBackgroundColor = colors.isDark ? colors.surfaceContainer ?? '#1e1e1e' : colors.surfaceContainer
  const inputThemeKey = `${inputBackgroundColor}:${colors.onSurface}`
  const [pageContentReady, setPageContentReady] = useState(!isIOS)

  const onConnect = useCallback(() => {
    'background only'
    console.error('[DevLauncher] Connect tapped url=', url)
    openProject(url)
  }, [url, openProject])

  useEffect(() => {
    'background only'
    if (!pageContentReady) return
    inputValueRef.current = url
    updateInputById(DEV_SERVER_URL_INPUT_ID, url)
  }, [url, inputThemeKey, pageContentReady])

  useEffect(() => {
    'background only'
    if (!isIOS) return
    setPageContentReady(false)
    const timeoutId = setTimeout(() => {
      setPageContentReady(true)
    }, 10)
    return () => {
      clearTimeout(timeoutId)
    }
  }, [inputThemeKey])

  return (
    <view
      className="DevLauncher DevLauncher--page"
      style={{
        backgroundColor: colors.surface,
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: '0px',
        minHeight: '0px',
        width: '100%',
      }}
    >
      {pageContentReady ? (
        <>
      <view className="DevLauncher__section" style={{ flexShrink: 0 }}>
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Connect to dev server</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Start a local development server with: npx t4l start</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Then, enter the dev server URL when it appears here.</text>
        <input
          id={DEV_SERVER_URL_INPUT_ID}
          className="DevLauncher__input"
          style={{
            backgroundColor: inputBackgroundColor,
            color: colors.onSurface,
            boxSizing: 'border-box',
            minWidth: '0px',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
          placeholder="http://localhost:3000/example"
          type="text"
          ios-auto-correct={false}
          ios-spell-check={false}
          bindinput={(e) => {
            'background only'
            const nextUrl = e.detail.value
            inputValueRef.current = nextUrl
            setUrl(nextUrl)
          }}
        />
        {connectError ? (
          <text className="DevLauncher__hint" style={{ color: '#ef4444', marginBottom: '12px' }}>{connectError}</text>
        ) : null}
        <view className="DevLauncher__buttons">
          <Button
            label="Connect"
            variant="filled"
            onTap={onConnect}
            style={{ width: '100%' }}
            colors={{ container: colors.primary, label: colors.surface }}
          />
          <text className="DevLauncher__or" style={{ color: colors.onSurface }}>Or</text>
          <Button
            label="Scan QR code"
            variant="filled"
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
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: '0px',
          minHeight: '0px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <view
          style={{
            width: '100%',
            minWidth: '0px',
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
        </view>
      </scroll-view>
        </>
      ) : null}
    </view>
  )
}
