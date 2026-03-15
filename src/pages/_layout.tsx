import { useEffect } from '@lynx-js/react'
import { useLocation } from 'react-router'
import { Tabs } from 'tamer-router'
import { useTamerNavigate } from 'tamer-router'
import { useSystemUI, useThemeColors } from 'tamer-system-ui'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Connect',
  '/recent': 'Recent',
  '/discover': 'Discover',
}

function titleForPath(pathname: string): string {
  const p = pathname || '/'
  return ROUTE_TITLES[p] ?? ROUTE_TITLES['/']
}

export default function Layout() {
  const location = useLocation()
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
  const tabBarStyle = { backgroundColor: colors.surfaceContainer ?? '#000000', borderTopColor: colors.surfaceContainer ?? '#333333' }

  return (
    <>
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
      <Tabs
        titleForPath={titleForPath}
        screenOptions={{
          headerStyle: barStyle,
          tabBarStyle,
          contentStyle,
          iconColor: { active: colors.onSurface ?? '#ffffff', inactive: '#888888' },
        }}
      >
        <Tabs.Screen name="index" path="/" options={{ title: 'Connect', icon: 'link', label: 'Connect' }} />
        <Tabs.Screen name="recent" path="/recent" options={{ title: 'Recent', icon: 'history', label: 'Recent' }} />
        <Tabs.Screen name="discover" path="/discover" options={{ title: 'Discover', icon: 'wifi_find', label: 'Discover' }} />
      </Tabs>
    </>
  )
}
