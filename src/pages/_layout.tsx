import { useCallback, useEffect } from '@lynx-js/react'
import { Button } from '@tamer4lynx/tamer-app-shell'
import { Tab, TabScreen, useTamerNavigate } from '@tamer4lynx/tamer-router'
import { useSystemUI, useThemeColors } from '@tamer4lynx/tamer-system-ui'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'
import { setLauncherSystemTheme } from '../launcherThemeState'

export default function Layout() {
  const { replace } = useTamerNavigate()
  const { setStatusBar, setNavigationBar } = useSystemUI()
  const osTheme = useThemeColors()
  const colors = resolveTheme(osTheme)
  const {
    incompatibleModalVisible,
    setIncompatibleModalVisible,
    incompatibleModules,
    navigateToConnectRef,
  } = useDevLauncher()

  useEffect(() => {
    'background only'
    navigateToConnectRef.current = () => replace('/')
    return () => {
      navigateToConnectRef.current = null
    }
  }, [replace, navigateToConnectRef])

  useEffect(() => {
    'background only'
    setStatusBar({ color: colors.surface, style: colors.isDark ? 'light' : 'dark' })
    setNavigationBar({ color: colors.surfaceContainer ?? '#000000', style: colors.isDark ? 'light' : 'dark' })
  }, [colors.surface, colors.surfaceContainer, colors.isDark, setStatusBar, setNavigationBar])

  useEffect(() => {
    'background only'
    setLauncherSystemTheme(osTheme ?? null)
  }, [osTheme])

  const onDismissIncompatibleModal = useCallback(() => {
    'background only'
    setIncompatibleModalVisible(false)
  }, [setIncompatibleModalVisible])

  return (
    <>
      {incompatibleModalVisible && (
        <view
          className="DevLauncher__modalOverlay"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          bindtap={() => {
            'background only'
            setIncompatibleModalVisible(false)
          }}
        >
          <view
            className="DevLauncher__modal"
            style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceContainer }}
            catchtap={() => {
              'background only'
            }}
          >
            <text className="DevLauncher__modalTitle" style={{ color: colors.onSurface }}>Incompatible server</text>
            <text className="DevLauncher__modalText" style={{ color: colors.onSurface }}>This app is missing native modules required by the project:</text>
            <view className="DevLauncher__modalList">
              {incompatibleModules.map((m) => (
                <text key={m.moduleClassName} className="DevLauncher__modalItem" style={{ color: colors.onSurface }}>
                  {m.packageName || m.moduleClassName}
                </text>
              ))}
            </view>
            <Button
              label="OK"
              variant="filled"
              onTap={onDismissIncompatibleModal}
              style={{ width: '100%' }}
              colors={{ container: colors.primary }}
            />
          </view>
        </view>
      )}
      <Tab pathPrefix="/">
        <TabScreen name="index" options={{ title: 'Connect', icon: 'link', label: 'Connect' }} />
        <TabScreen name="about" options={{ title: 'About', icon: 'info', label: 'About' }} />
      </Tab>
    </>
  )
}
