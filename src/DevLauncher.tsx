import { useCallback, useEffect, useState } from '@lynx-js/react'

type RequiredModule = { packageName: string; moduleClassName: string }

declare const NativeModules: {
  JiggleModule?: { vibrate: (duration: number) => void }
  DevClientModule: {
    call?: (method: string, params: { data?: Record<string, unknown> }, callback?: (res: unknown) => void) => void
    scanQR: () => void
    setDevServerUrl: (url: string) => void
    getDevServerUrl: (callback: (url: string) => void) => void
    getRecentUrls: (callback: (urls: string[]) => void) => void
    getDiscoveredServers: (callback: (servers: { url: string; name: string }[]) => void) => void
    startDiscovery: () => void
    stopDiscovery: () => void
    clearDevServerUrl: () => void
    reloadWithProjectBundle: () => void
    checkServerCompatibility?: (url: string, callback: (compatible: boolean, requiredModules: unknown) => void) => void
  }
}

function devCall(method: string, data?: Record<string, unknown>, callback?: (res?: unknown, res2?: unknown) => void) {
  const mod = NativeModules.DevClientModule
  if (!mod) return
  if (typeof mod.call === 'function') {
    mod.call(method, { data: data ?? {} }, callback ?? (() => {}))
  } else if (method === 'setDevServerUrl' && data?.url) {
    mod.setDevServerUrl?.(String(data.url))
  } else if (method === 'scanQR') {
    mod.scanQR?.()
  } else if (method === 'reloadWithProjectBundle') {
    mod.reloadWithProjectBundle?.()
  } else if (method === 'startDiscovery') {
    mod.startDiscovery?.()
  } else if (method === 'stopDiscovery') {
    mod.stopDiscovery?.()
  } else if (method === 'getDevServerUrl' && callback) {
    mod.getDevServerUrl?.(callback)
  } else if (method === 'getRecentUrls' && callback) {
    mod.getRecentUrls?.(callback)
  } else if (method === 'getDiscoveredServers' && callback) {
    mod.getDiscoveredServers?.(callback)
  } else if (method === 'checkServerCompatibility' && data?.url && callback) {
    mod.checkServerCompatibility?.(String(data.url), callback)
  }
}

function toRequiredModules(raw: unknown): RequiredModule[] {
  if (!raw || typeof raw !== 'object') return []
  const arr = Array.isArray(raw) ? raw : 'length' in (raw as object) ? Array.from(raw as ArrayLike<unknown>) : []
  return arr
    .map((x) => {
      if (!x || typeof x !== 'object') return null
      const o = x as Record<string, unknown>
      const pkg = o.packageName != null ? String(o.packageName) : ''
      const cls = o.moduleClassName != null ? String(o.moduleClassName) : ''
      return pkg || cls ? { packageName: pkg, moduleClassName: cls } : null
    })
    .filter((x): x is RequiredModule => x != null)
}

type DiscoveredServer = { url: string; name: string }

export function DevLauncher() {
  const [url, setUrl] = useState('')
  const [recentUrls, setRecentUrls] = useState<string[]>([])
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([])
  const [incompatibleModalVisible, setIncompatibleModalVisible] = useState(false)
  const [incompatibleModules, setIncompatibleModules] = useState<RequiredModule[]>([])

  const toRecentArray = useCallback((r: unknown): string[] => {
    if (Array.isArray(r)) return r.filter((x): x is string => typeof x === 'string')
    if (r && typeof r === 'object' && 'length' in r) {
      const arr = r as { length: number; [i: number]: unknown }
      return Array.from({ length: arr.length }, (_, i) => String(arr[i] ?? ''))
    }
    return []
  }, [])

  useEffect(() => {
    'background only'
    devCall('getDevServerUrl', undefined, (saved) => {
      if (saved) setUrl(String(saved))
    })
    devCall('getRecentUrls', undefined, (recent) => {
      setRecentUrls(toRecentArray(recent))
    })
  }, [toRecentArray])

  useEffect(() => {
    'background only'
    if (!NativeModules.DevClientModule) return
    const nativeBridge = lynx.getJSModule('GlobalEventEmitter')
    const scanHandler = (event: any) => {
      try {
        const { url: scannedUrl } = JSON.parse(event?.payload ?? '{}')
        setUrl(scannedUrl ?? '')
        devCall('getRecentUrls', undefined, (recent) => setRecentUrls(toRecentArray(recent)))
      } catch {}
    }
    const discoveryHandler = (event: any) => {
      try {
        const { servers } = JSON.parse(event?.payload ?? '{}')
        setDiscoveredServers(Array.isArray(servers) ? servers : [])
      } catch {}
    }
    nativeBridge.addListener('devclient:scanResult', scanHandler as any)
    nativeBridge.addListener('devclient:discoveredServers', discoveryHandler as any)
    devCall('startDiscovery')
    return () => {
      nativeBridge.removeListener('devclient:scanResult', scanHandler as any)
      nativeBridge.removeListener('devclient:discoveredServers', discoveryHandler as any)
      devCall('stopDiscovery')
    }
  }, [toRecentArray])

  const refreshRecent = useCallback(() => {
    'background only'
    devCall('getRecentUrls', undefined, (recent) => setRecentUrls(toRecentArray(recent)))
  }, [toRecentArray])

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
      if (!NativeModules.DevClientModule?.checkServerCompatibility) {
        devCall('setDevServerUrl', { url: parsed })
        refreshRecent()
        NativeModules.JiggleModule?.vibrate?.(50)
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
        NativeModules.JiggleModule?.vibrate?.(50)
        devCall('reloadWithProjectBundle')
      })
    },
    [refreshRecent]
  )

  const onConnect = useCallback(() => {
    'background only'
    const parsed = parseUrl(url)
    if (!parsed) return
    connectToUrl(parsed)
  }, [url, parseUrl, connectToUrl])

  const onSelectRecent = useCallback((recentUrl: string) => {
    'background only'
    setUrl(recentUrl)
  }, [])

  const onScanQR = useCallback(() => {
    'background only'
    devCall('scanQR')
  }, [])

  const onSelectDiscovered = useCallback(
    (server: DiscoveredServer) => {
      'background only'
      setUrl(server.url)
      connectToUrl(server.url)
    },
    [connectToUrl]
  )

  return (
    <view className="DevLauncher">
      {incompatibleModalVisible && (
        <view className="DevLauncher__modalOverlay" bindtap={() => setIncompatibleModalVisible(false)}>
          <view className="DevLauncher__modal" catchtap={() => {}}>
            <text className="DevLauncher__modalTitle">Incompatible server</text>
            <text className="DevLauncher__modalText">This app is missing native modules required by the project:</text>
            <view className="DevLauncher__modalList">
              {incompatibleModules.map((m) => (
                <text key={m.moduleClassName} className="DevLauncher__modalItem">
                  {m.packageName || m.moduleClassName}
                </text>
              ))}
            </view>
            <view className="DevLauncher__btn DevLauncher__btn--primary" bindtap={() => setIncompatibleModalVisible(false)}>
              <text className="DevLauncher__btnText">OK</text>
            </view>
          </view>
        </view>
      )}
      <view className="DevLauncher__header">
        <text className="DevLauncher__title">Tamer4Lynx</text>
        <text className="DevLauncher__subtitle">Dev App</text>
      </view>

      {discoveredServers.length > 0 && (
        <view className="DevLauncher__section">
          <text className="DevLauncher__sectionTitle">Local development servers</text>
          <view className="DevLauncher__recentList">
            {discoveredServers.map((s) => (
              <view key={s.url} className="DevLauncher__recentItem DevLauncher__recentItem--discovered" bindtap={() => onSelectDiscovered(s)}>
                <text className="DevLauncher__recentText DevLauncher__recentText--name">{s.name}</text>
                <text className="DevLauncher__recentText DevLauncher__recentText--url">{s.url}</text>
              </view>
            ))}
          </view>
        </view>
      )}

      {recentUrls.length > 0 && (
        <view className="DevLauncher__section">
          <text className="DevLauncher__sectionTitle">Recently opened</text>
          <view className="DevLauncher__recentList">
            {recentUrls.map((u) => (
              <view key={u} className="DevLauncher__recentItem" bindtap={() => onSelectRecent(u)}>
                <text className="DevLauncher__recentText">{u}</text>
              </view>
            ))}
          </view>
        </view>
      )}

      <view className="DevLauncher__section">
        <text className="DevLauncher__sectionTitle">Connect to dev server</text>
        <text className="DevLauncher__hint">Start with: npx t4l start</text>
        <input
          className="DevLauncher__input"
          value={url}
          {...({ bindinput: (e: { detail?: { value?: string }; value?: string }) => setUrl(e?.detail?.value ?? e?.value ?? '') } as any)}
          placeholder="http://192.168.1.100:3000/example"
        />
        <view className="DevLauncher__buttons">
          <view className="DevLauncher__btn DevLauncher__btn--primary" bindtap={onConnect}>
            <text className="DevLauncher__btnText">Connect</text>
          </view>
          <view className="DevLauncher__btn" bindtap={onScanQR}>
            <text className="DevLauncher__btnText">Scan QR code</text>
          </view>
        </view>
      </view>
    </view>
  )
}
