import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from '@lynx-js/react'
import { readBootstrapThemeColors, useThemeColors } from '@tamer4lynx/tamer-system-ui'
import { devCall, toRequiredModules, type RequiredModule } from './devcall'
import {
  devServerProbeBase,
  persistedDevServerUrl,
  probeDevServerReachability,
  probeRecentMetaMatch,
  validateDevServerUrl,
} from './devServerUrl'
import {
  fetchIconAsDataUrl,
  getStoredIconDataUrl,
  rememberIconCacheKey,
  removeIconCacheKey,
} from './recentIconCache'
import {
  type DevLauncherTheme,
} from './devLauncherTheme.js'
import { serverIdentityKey } from './serverIdentity'
export * from './devLauncherTheme.js'

declare const NativeModules: {
  DevClientModule?: {
    getRecentEntries?: (cb: (rows: unknown) => void) => void
  }
  JiggleModule?: { vibrate?: (n: number) => void }
}

export type DiscoveredServer = {
  url: string
  name: string
  compatible?: boolean
  iconUrl?: string
  tamerAppKey?: string
}

export type RecentEntry = { url: string; tamerAppKey?: string; label?: string; iconUrl?: string }

function pickPreferredRecentEntry(current: RecentEntry, next: RecentEntry): RecentEntry {
  return {
    url: current.url,
    tamerAppKey: current.tamerAppKey ?? next.tamerAppKey,
    label: current.label ?? next.label,
    iconUrl: current.iconUrl ?? next.iconUrl,
  }
}

function urlPort(url: string): number {
  const m = /^https?:\/\/[^/:]+:(\d{1,5})/.exec(url)
  return m ? parseInt(m[1], 10) : (url.startsWith('https') ? 443 : 80)
}

function discoveredServerKey(server: DiscoveredServer): string {
  const key = server.tamerAppKey?.trim()
  if (key) return `key:${key}`
  const name = server.name.trim()
  if (name) return `name:${name}`
  return `url:${devServerProbeBase(server.url)}`
}

function pickPreferredDiscoveredServer(current: DiscoveredServer, next: DiscoveredServer): DiscoveredServer {
  // Prefer higher port — when a session can't bind its preferred port it increments,
  // so the higher port is the newer (live) session.
  const url = urlPort(next.url) > urlPort(current.url) ? next.url : current.url
  return {
    url,
    name: current.name.trim() || next.name.trim(),
    compatible: current.compatible === false || next.compatible === false ? false : true,
    iconUrl: current.iconUrl ?? next.iconUrl,
    tamerAppKey: current.tamerAppKey ?? next.tamerAppKey,
  }
}

function dedupeRecentEntries(entries: RecentEntry[]): RecentEntry[] {
  const byKey = new Map<string, RecentEntry>()
  const orderedKeys: string[] = []
  for (const entry of entries) {
    const key = serverIdentityKey(entry)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      orderedKeys.push(key)
      continue
    }
    byKey.set(key, pickPreferredRecentEntry(existing, entry))
  }
  return orderedKeys.map((key) => byKey.get(key)!)
}

function normalizeDiscoveredServers(raw: unknown): DiscoveredServer[] {
  if (!Array.isArray(raw)) return []
  const byKey = new Map<string, DiscoveredServer>()
  const orderedKeys: string[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = o.url != null ? String(o.url) : ''
    if (!url) continue
    const next: DiscoveredServer = {
      url,
      name: o.name != null ? String(o.name) : '',
      compatible: typeof o.compatible === 'boolean' ? o.compatible : true,
      iconUrl: o.iconUrl != null ? String(o.iconUrl) : undefined,
      tamerAppKey: o.tamerAppKey != null ? String(o.tamerAppKey) : undefined,
    }
    const key = discoveredServerKey(next)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, next)
      orderedKeys.push(key)
      continue
    }
    byKey.set(key, pickPreferredDiscoveredServer(existing, next))
  }
  return orderedKeys.map((key) => byKey.get(key)!)
}

function parseRecentEntries(raw: unknown): RecentEntry[] {
  if (!Array.isArray(raw)) return []
  const out: RecentEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = o.url != null ? String(o.url) : ''
    if (!url) continue
    out.push({
      url,
      tamerAppKey: o.tamerAppKey != null ? String(o.tamerAppKey) : undefined,
      label: o.label != null ? String(o.label) : undefined,
      iconUrl: o.iconUrl != null ? String(o.iconUrl) : undefined,
    })
  }
  return dedupeRecentEntries(out)
}

export type RecentReachability = 'checking' | 'matched' | 'mismatch' | 'stale' | 'offline'

interface DevLauncherContextValue {
  url: string
  setUrl: (u: string) => void
  navigateToConnectRef: React.MutableRefObject<(() => void) | null>
  theme: DevLauncherTheme | null
  setTheme: (t: DevLauncherTheme | null) => void
  recentUrls: string[]
  recentEntries: RecentEntry[]
  recentReachability: Record<string, RecentReachability>
  recentRowIconSrc: Record<string, string>
  discoveredServers: DiscoveredServer[]
  incompatibleModalVisible: boolean
  setIncompatibleModalVisible: (v: boolean) => void
  incompatibleModules: RequiredModule[]
  connectError: string
  clearConnectError: () => void
  refreshRecent: () => void
  removeRecentItem: (url: string) => void
  connectToUrl: (parsed: string) => void
  openProject: (rawUrl: string) => void
  showIncompatibleModalForUrl: (parsed: string) => void
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

export { validateDevServerUrl }

function toRecentArray(r: unknown): string[] {
  if (Array.isArray(r)) return r.filter((x): x is string => typeof x === 'string')
  if (r && typeof r === 'object' && 'length' in r) {
    const arr = r as { length: number; [i: number]: unknown }
    return Array.from({ length: arr.length }, (_, i) => String(arr[i] ?? ''))
  }
  return []
}

export function DevLauncherProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useThemeColors()
  const bootstrapTheme = readBootstrapThemeColors()
  const [url, setUrlState] = useState('')
  const navigateToConnectRef = useRef<(() => void) | null>(null)
  const [themeOverride, setTheme] = useState<DevLauncherTheme | null>(null)
  const theme = themeOverride ?? systemTheme ?? bootstrapTheme
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])
  const recentUrls = recentEntries.map((e) => e.url)
  const recentEntriesRef = useRef(recentEntries)
  recentEntriesRef.current = recentEntries
  const recentListKey = useMemo(
    () => recentEntries.map((e) => `${e.url}|${e.iconUrl ?? ''}`).join(';'),
    [recentEntries]
  )
  const [recentReachability, setRecentReachability] = useState<Record<string, RecentReachability>>({})
  const [recentRowIconSrc, setRecentRowIconSrc] = useState<Record<string, string>>({})
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([])
  const [incompatibleModalVisible, setIncompatibleModalVisible] = useState(false)
  const [incompatibleModules, setIncompatibleModules] = useState<RequiredModule[]>([])
  const [connectError, setConnectError] = useState('')

  const setUrl = useCallback((u: string) => {
    'background only'
    setUrlState(u)
    setConnectError('')
  }, [])

  const clearConnectError = useCallback(() => {
    'background only'
    setConnectError('')
  }, [])

  const loadRecentFromNative = useCallback(() => {
    'background only'
    const mod = NativeModules?.DevClientModule
    if (mod && typeof mod.getRecentEntries === 'function') {
      mod.getRecentEntries((rows) => {
        setRecentEntries(parseRecentEntries(rows))
      })
    } else {
      devCall('getRecentUrls', undefined, (recent) => {
        setRecentEntries(toRecentArray(recent).map((url) => ({ url })))
      })
    }
  }, [])

  useEffect(() => {
    'background only'
    devCall('getDevServerUrl', undefined, (saved) => {
      if (saved) setUrlState(String(saved))
    })
    loadRecentFromNative()
  }, [loadRecentFromNative])

  const refreshRecent = useCallback(() => {
    'background only'
    loadRecentFromNative()
  }, [loadRecentFromNative])

  const removeRecentItem = useCallback(
    (url: string) => {
      'background only'
      const entry = recentEntriesRef.current.find((e) => e.url === url)
      if (entry?.iconUrl) removeIconCacheKey(entry.iconUrl)
      devCall('removeRecentUrl', { url })
      setRecentReachability((prev) => {
        const next = { ...prev }
        delete next[url]
        return next
      })
      setRecentRowIconSrc((prev) => {
        const next = { ...prev }
        delete next[url]
        return next
      })
      refreshRecent()
    },
    [refreshRecent]
  )

  const parseUrl = useCallback((input: string): string => persistedDevServerUrl(input), [])

  const connectToUrl = useCallback(
    (parsed: string) => {
      'background only'
      console.error('[DevLauncher] connectToUrl parsed=', parsed)
      if (!(typeof NativeModules !== 'undefined' && NativeModules?.DevClientModule != null)) {
        devCall('setDevServerUrl', { url: parsed })
        refreshRecent()
        NativeModules?.JiggleModule?.vibrate?.(50)
        devCall('reloadWithProjectBundle')
        return
      }
      devCall('checkServerCompatibility', { url: parsed }, (compatible: unknown, rawModules: unknown) => {
        console.error('[DevLauncher] compatibility result=', compatible, 'rawModules=', rawModules)
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

  const showIncompatibleModalForUrl = useCallback((parsed: string) => {
    'background only'
    if (!(typeof NativeModules !== 'undefined' && NativeModules?.DevClientModule != null)) return
    devCall('checkServerCompatibility', { url: parsed }, (compatible: unknown, rawModules: unknown) => {
      const ok = compatible === true
      const modules = toRequiredModules(rawModules)
      if (!ok && modules.length > 0) {
        setIncompatibleModules(modules)
        setIncompatibleModalVisible(true)
      }
    })
  }, [])

  const openProject = useCallback(
    (rawUrl: string) => {
      'background only'
      void (async () => {
        console.error('[DevLauncher] openProject rawUrl=', rawUrl)
        const validated = validateDevServerUrl(rawUrl)
        if (!validated.ok) {
          console.error('[DevLauncher] openProject validation failed error=', validated.error)
          setConnectError(validated.error)
          return
        }
        setConnectError('')
        const reach = await probeDevServerReachability(devServerProbeBase(validated.parsed))
        console.error('[DevLauncher] openProject reachability=', reach.kind, 'parsed=', validated.parsed)
        if (reach.kind === 'unreachable') {
          setConnectError('Server unreachable')
          return
        }
        if (reach.kind === 'reachable_bundle') {
          devCall('openProjectDirect', { url: reach.bundleUrl })
          return
        }
        if (reach.kind === 'reachable_no_meta') {
          setConnectError('Server is reachable, but it is not serving Tamer meta.json')
          return
        }
        connectToUrl(validated.parsed)
      })()
    },
    [connectToUrl]
  )

  const onSelectRecent = useCallback((recentUrl: string) => {
    'background only'
    setUrlState(recentUrl)
  }, [])

  const onScanQR = useCallback(() => {
    'background only'
    devCall('scanQR')
  }, [])

  const probeAllRecents = useCallback((entries: typeof recentEntries, initial: boolean) => {
    'background only'
    if (entries.length === 0) {
      setRecentReachability({})
      return () => {}
    }
    if (initial) {
      setRecentReachability(
        Object.fromEntries(entries.map((e) => [e.url, 'checking' as RecentReachability]))
      )
    }
    let cancelled = false
    void (async () => {
      const results = await Promise.all(
        entries.map(async (e) => {
          const v = validateDevServerUrl(e.url)
          if (!v.ok) return [e.url, 'offline' as RecentReachability] as const
          const st = await probeRecentMetaMatch(devServerProbeBase(e.url), e.tamerAppKey)
          return [e.url, st as RecentReachability] as const
        })
      )
      if (cancelled) return
      setRecentReachability(Object.fromEntries(results))
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    'background only'
    const cancel = probeAllRecents(recentEntries, true)
    const id = setInterval(() => {
      probeAllRecents(recentEntriesRef.current, false)
    }, 5000)
    return () => {
      cancel()
      clearInterval(id)
    }
  }, [recentListKey, probeAllRecents])

  useEffect(() => {
    'background only'
    if (recentEntries.length === 0) {
      setRecentRowIconSrc({})
      return
    }
    const rowUrls = new Set(recentEntries.map((e) => e.url))
    setRecentRowIconSrc((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!rowUrls.has(k)) delete next[k]
      }
      return next
    })
    let cancelled = false
    void (async () => {
      await Promise.all(
        recentEntries.map(async (e) => {
          if (!e.iconUrl || cancelled) return
          let src = getStoredIconDataUrl(e.iconUrl)
          if (!src) {
            const fetched = await fetchIconAsDataUrl(e.iconUrl)
            if (fetched) {
              rememberIconCacheKey(e.iconUrl, fetched)
              src = fetched
            }
          }
          if (cancelled || !src) return
          setRecentRowIconSrc((prev) => (prev[e.url] === src ? prev : { ...prev, [e.url]: src }))
        })
      )
    })()
    return () => {
      cancelled = true
    }
  }, [recentListKey])

  useEffect(() => {
    'background only'
    if (!(typeof NativeModules !== 'undefined' && NativeModules?.DevClientModule)) return

    const nativeBridge = lynx?.getJSModule?.('GlobalEventEmitter')

    const scanHandler = (...args: unknown[]) => {
      const event = args[0] as { payload?: string } | undefined
      try {
        const { url: scannedUrl } = JSON.parse(event?.payload ?? '{}')
        const raw = scannedUrl ?? ''
        if (!raw) return
        openProject(raw)
      } catch {}
    }

    const discoveryHandler = (...args: unknown[]) => {
      const event = args[0] as { payload?: string } | undefined
      try {
        const { servers } = JSON.parse(event?.payload ?? '{}')
        setDiscoveredServers(normalizeDiscoveredServers(servers))
      } catch {}
    }

    const discoveredArrayFromNative = (raw: unknown): unknown[] => {
      if (Array.isArray(raw)) return raw
      if (raw && typeof raw === 'object' && 'length' in raw) {
        const arr = raw as { length: number; [i: number]: unknown }
        return Array.from({ length: arr.length }, (_, i) => arr[i])
      }
      return []
    }

    const pollDiscovered = () => {
      devCall('getDiscoveredServers', undefined, (raw) => {
        setDiscoveredServers(normalizeDiscoveredServers(discoveredArrayFromNative(raw)))
      })
    }

    if (nativeBridge?.addListener) {
      nativeBridge.addListener('devclient:scanResult', scanHandler)
      nativeBridge.addListener('devclient:discoveredServers', discoveryHandler)
    }

    devCall('startDiscovery')
    pollDiscovered()
    const pollId = setInterval(pollDiscovered, 2000)

    return () => {
      clearInterval(pollId)
      if (nativeBridge?.removeListener) {
        nativeBridge.removeListener?.('devclient:scanResult', scanHandler)
        nativeBridge.removeListener?.('devclient:discoveredServers', discoveryHandler)
      }
      devCall('stopDiscovery')
    }
  }, [openProject, loadRecentFromNative])

  const value: DevLauncherContextValue = {
    url,
    setUrl,
    navigateToConnectRef,
    theme,
    setTheme,
    recentUrls,
    recentEntries,
    recentReachability,
    recentRowIconSrc,
    discoveredServers,
    incompatibleModalVisible,
    setIncompatibleModalVisible,
    incompatibleModules,
    connectError,
    clearConnectError,
    refreshRecent,
    removeRecentItem,
    connectToUrl,
    openProject,
    showIncompatibleModalForUrl,
    onSelectRecent,
    onScanQR,
    parseUrl,
  }

  return (
    <DevLauncherContext.Provider value={value}>
      {children}
    </DevLauncherContext.Provider>
  )
}
