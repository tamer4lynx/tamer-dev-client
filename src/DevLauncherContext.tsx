import { createContext, useCallback, useContext, useEffect, useRef, useState } from '@lynx-js/react'
import { devCall, toRequiredModules, type RequiredModule } from './devcall'

declare const NativeModules: { DevClientModule?: { checkServerCompatibility?: unknown }; JiggleModule?: { vibrate?: (n: number) => void } }

export type DiscoveredServer = { url: string; name: string }

export interface DevLauncherTheme {
  primary?: string
  primaryDark?: string
  background?: string
  surface?: string
  surfaceContainer?: string
  onSurface?: string
  onSurfaceVariant?: string
  isDark?: boolean
}

export const FALLBACK_THEME: DevLauncherTheme = {
  surface: '#121212',
  surfaceContainer: '#1e1e1e',
  primary: '#000000',
  primaryDark: '#000000',
  background: '#121212',
  onSurface: '#ffffff',
  onSurfaceVariant: '#b0b0b0',
  isDark: true,
}

export function resolveTheme(theme: DevLauncherTheme | null | undefined): DevLauncherTheme {
  if (theme == null) return FALLBACK_THEME
  return {
    surface: theme.surface ?? FALLBACK_THEME.surface,
    surfaceContainer: theme.surfaceContainer ?? FALLBACK_THEME.surfaceContainer,
    primary: theme.primary ?? FALLBACK_THEME.primary,
    primaryDark: theme.primaryDark ?? FALLBACK_THEME.primaryDark,
    background: theme.background ?? FALLBACK_THEME.background,
    onSurface: theme.onSurface ?? FALLBACK_THEME.onSurface,
    onSurfaceVariant: theme.onSurfaceVariant ?? FALLBACK_THEME.onSurfaceVariant,
    isDark: theme.isDark ?? FALLBACK_THEME.isDark,
  }
}

interface DevLauncherContextValue {
  url: string
  setUrl: (u: string) => void
  navigateToConnectRef: React.MutableRefObject<(() => void) | null>
  theme: DevLauncherTheme | null
  setTheme: (t: DevLauncherTheme | null) => void
  recentUrls: string[]
  discoveredServers: DiscoveredServer[]
  incompatibleModalVisible: boolean
  setIncompatibleModalVisible: (v: boolean) => void
  incompatibleModules: RequiredModule[]
  refreshRecent: () => void
  connectToUrl: (parsed: string) => void
  openProject: (rawUrl: string) => void
  onSelectRecent: (u: string) => void
  onScanQR: () => void
  parseUrl: (input: string) => string
}

const DevLauncherContext = createContext<DevLauncherContextValue | null>(null)

export function useDevLauncher() {
  const ctx = useContext(DevLauncherContext)
  if (!ctx) throw new Error('useDevLauncher must be used within DevLauncherProvider')
  return ctx
}

function toRecentArray(r: unknown): string[] {
  if (Array.isArray(r)) return r.filter((x): x is string => typeof x === 'string')
  if (r && typeof r === 'object' && 'length' in r) {
    const arr = r as { length: number; [i: number]: unknown }
    return Array.from({ length: arr.length }, (_, i) => String(arr[i] ?? ''))
  }
  return []
}

export function DevLauncherProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState('')
  const navigateToConnectRef = useRef<(() => void) | null>(null)
  const [theme, setTheme] = useState<DevLauncherTheme | null>(null)
  const [recentUrls, setRecentUrls] = useState<string[]>([])
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([])
  const [incompatibleModalVisible, setIncompatibleModalVisible] = useState(false)
  const [incompatibleModules, setIncompatibleModules] = useState<RequiredModule[]>([])

  useEffect(() => {
    'background only'
    devCall('getDevServerUrl', undefined, (saved) => {
      if (saved) setUrl(String(saved))
    })
    devCall('getRecentUrls', undefined, (recent) => {
      setRecentUrls(toRecentArray(recent))
    })
  }, [])

  const refreshRecent = useCallback(() => {
    'background only'
    devCall('getRecentUrls', undefined, (recent) => setRecentUrls(toRecentArray(recent)))
  }, [])

  const parseUrl = useCallback((input: string): string => {
    let s = input.trim()
    if (s.startsWith('tamer://')) s = 'http://' + s.replace('tamer://', '')
    if (!s.startsWith('http://') && !s.startsWith('https://')) s = 'http://' + s
    s = s.replace(/\/main\.lynx\.bundle\/?$/i, '').replace(/\/+$/, '') || s
    return s
  }, [])

  const connectToUrl = useCallback(
    (parsed: string) => {
      'background only'
      if (!(typeof NativeModules !== 'undefined' && NativeModules?.DevClientModule?.checkServerCompatibility)) {
        devCall('setDevServerUrl', { url: parsed })
        refreshRecent()
        NativeModules?.JiggleModule?.vibrate?.(50)
        devCall('reloadWithProjectBundle')
        return
      }
      devCall('checkServerCompatibility', { url: parsed }, (compatible: unknown, rawModules: unknown) => {
        const ok = compatible === true
        const modules = toRequiredModules(rawModules)
        if (!ok && modules.length > 0) {
          setIncompatibleModules(modules)
          setIncompatibleModalVisible(true)
          return
        }
        devCall('setDevServerUrl', { url: parsed })
        refreshRecent()
        NativeModules?.JiggleModule?.vibrate?.(50)
        devCall('reloadWithProjectBundle')
      })
    },
    [refreshRecent]
  )

  const openProject = useCallback(
    (rawUrl: string) => {
      'background only'
      const parsed = parseUrl(rawUrl)
      if (!parsed) return
      connectToUrl(parsed)
    },
    [parseUrl, connectToUrl]
  )

  const onSelectRecent = useCallback((recentUrl: string) => {
    'background only'
    setUrl(recentUrl)
  }, [])

  const onScanQR = useCallback(() => {
    'background only'
    devCall('scanQR')
  }, [])

  useEffect(() => {
    'background only'
    if (!(typeof NativeModules !== 'undefined' && NativeModules?.DevClientModule)) return
    const nativeBridge = lynx?.getJSModule?.('GlobalEventEmitter')
    if (!nativeBridge?.addListener) return
    const scanHandler = (...args: unknown[]) => {
      const event = args[0] as { payload?: string } | undefined
      try {
        const { url: scannedUrl } = JSON.parse(event?.payload ?? '{}')
        const raw = scannedUrl ?? ''
        if (!raw) return
        const parsed = parseUrl(raw)
        setUrl(parsed)
        navigateToConnectRef.current?.()
        openProject(raw)
        devCall('getRecentUrls', undefined, (recent) => setRecentUrls(toRecentArray(recent)))
      } catch {}
    }
    const discoveryHandler = (...args: unknown[]) => {
      const event = args[0] as { payload?: string } | undefined
      try {
        const { servers } = JSON.parse(event?.payload ?? '{}')
        setDiscoveredServers(Array.isArray(servers) ? servers : [])
      } catch {}
    }
    nativeBridge.addListener('devclient:scanResult', scanHandler)
    nativeBridge.addListener('devclient:discoveredServers', discoveryHandler)
    devCall('startDiscovery')
    return () => {
      nativeBridge.removeListener?.('devclient:scanResult', scanHandler)
      nativeBridge.removeListener?.('devclient:discoveredServers', discoveryHandler)
      devCall('stopDiscovery')
    }
  }, [openProject, parseUrl])

  const value: DevLauncherContextValue = {
    url,
    setUrl,
    navigateToConnectRef,
    theme,
    setTheme,
    recentUrls,
    discoveredServers,
    incompatibleModalVisible,
    setIncompatibleModalVisible,
    incompatibleModules,
    refreshRecent,
    connectToUrl,
    openProject,
    onSelectRecent,
    onScanQR,
    parseUrl,
  }

  return <DevLauncherContext.Provider value={value}>{children}</DevLauncherContext.Provider>
}
