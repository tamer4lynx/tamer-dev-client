import { useEffect } from '@lynx-js/react'
import { Outlet, useLocation } from 'react-router'
import { Screen, SafeArea, AppBar, Content, TabBar, AppShellProvider } from 'tamer-app-shell'
import { useSystemUI, useThemeColors } from 'tamer-system-ui'
import { useTamerNavigate } from 'tamer-router'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

const TABS = [
  { icon: 'link', label: 'Connect', path: '/' },
  { icon: 'history', label: 'Recent', path: '/recent' },
  { icon: 'wifi_find', label: 'Discover', path: '/discover' },
] as const

export default function Layout() {
  const location = useLocation()
  const isTabRoute = TABS.some((t) => t.path === location.pathname)
  const { replace } = useTamerNavigate()
  const { setStatusBar, setNavigationBar } = useSystemUI()
  const osTheme = useThemeColors()
  const colors = resolveTheme(osTheme)
  const {
    incompatibleModalVisible,
    setIncompatibleModalVisible,
    incompatibleModules,
    setTheme,
    navigateToConnectRef,
  } = useDevLauncher()

  useEffect(() => {
    navigateToConnectRef.current = () => replace('/')
    return () => {
      navigateToConnectRef.current = null
    }
  }, [replace, navigateToConnectRef])

  useEffect(() => {
    setStatusBar({ color: colors.surface, style: 'auto' })
    setNavigationBar({ color: colors.surfaceContainer ?? '#000000', style: 'auto' })
  }, [colors.surface, colors.surfaceContainer, setStatusBar, setNavigationBar])

  useEffect(() => {
    setTheme(osTheme ?? null)
  }, [osTheme, setTheme])

  const barStyle = { backgroundColor: colors.surfaceContainer ?? '#1e1e1e', borderBottomColor: colors.surfaceContainer ?? '#333333' }
  const contentStyle = { backgroundColor: colors.surface }

  return (
    <Screen>
      <SafeArea edges={['top', 'left', 'right', 'bottom']}>
        {incompatibleModalVisible && (
          <view className="DevLauncher__modalOverlay" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} bindtap={() => setIncompatibleModalVisible(false)}>
            <view className="DevLauncher__modal" style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceContainer }} catchtap={() => {}}>
              <text className="DevLauncher__modalTitle" style={{ color: colors.onSurface }}>Incompatible server</text>
              <text className="DevLauncher__modalText" style={{ color: colors.onSurface }}>This app is missing native modules required by the project:</text>
              <view className="DevLauncher__modalList">
                {incompatibleModules.map((m) => (
                  <text key={m.moduleClassName} className="DevLauncher__modalItem" style={{ color: colors.onSurface }}>
                    {m.packageName || m.moduleClassName}
                  </text>
                ))}
              </view>
              <view className="DevLauncher__btn DevLauncher__btn--primary" style={{ backgroundColor: colors.primary, borderColor: colors.surfaceContainer }} bindtap={() => setIncompatibleModalVisible(false)}>
                <text className="DevLauncher__btnText" style={{ color: colors.onSurface }}>OK</text>
              </view>
            </view>
          </view>
        )}
        <AppShellProvider showAppBar showTabBar={isTabRoute}>
          <AppBar title="Tamer4Lynx" style={barStyle} foregroundColor={colors.onSurface} />
          <Content style={contentStyle}>
            <Outlet />
          </Content>
          {isTabRoute ? <TabBar tabs={[...TABS]} style={{ backgroundColor: colors.surfaceContainer ?? '#000000', borderTopColor: colors.surfaceContainer ?? '#333333' }} iconColor={{ active: colors.onSurface ?? '#ffffff', inactive: '#888888' }} /> : null}
        </AppShellProvider>
      </SafeArea>
    </Screen>
  )
}
