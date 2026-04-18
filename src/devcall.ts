export type RequiredModule = { packageName: string; moduleClassName: string }

function wrapCheckServerCompatibilityCallback(
  callback: (compatible?: unknown, rawModules?: unknown) => void
): (a?: unknown, b?: unknown) => void {
  return (a?: unknown, b?: unknown) => {
    let compatible: unknown = a
    let rawModules: unknown = b
    if (Array.isArray(a) && a.length >= 2 && b === undefined) {
      compatible = a[0]
      rawModules = a[1]
    }
    callback(compatible, rawModules)
  }
}

declare const NativeModules: {
  JiggleModule?: { vibrate: (duration: number) => void }
  DevClientModule: {
    scanQR: () => void
    setDevServerUrl: (url: string) => void
    getDevServerUrl: (callback: (url: string) => void) => void
    getRecentUrls: (callback: (urls: string[]) => void) => void
    getRecentEntries?: (callback: (rows: unknown) => void) => void
    removeRecentUrl?: (url: string) => void
    getDiscoveredServers: (
      callback: (servers: { url: string; name: string; compatible?: boolean; iconUrl?: string; tamerAppKey?: string }[]) => void
    ) => void
    startDiscovery: () => void
    stopDiscovery: () => void
    clearDevServerUrl: () => void
    reloadWithProjectBundle: () => void
    openProjectDirect?: (url: string) => void
    getProjectDeepLink?: (callback: (deepLink: string) => void) => void
    checkServerCompatibility?: (url: string, callback: (compatible: boolean, requiredModules: unknown) => void) => void
    getAppInfo?: (callback: (info: Record<string, string>) => void) => void
    getCurrentProjectDebugInfo?: (callback: (info: Record<string, string>) => void) => void
    dismissTamerDebugPanel?: () => void
    getPerfHistory?: (callback: (samples: unknown) => void) => void
  }
}

export function devCall(method: string, data?: Record<string, unknown>, callback?: (res?: unknown, res2?: unknown) => void) {
  console.error('[devCall] enter method=', method, 'hasNativeModules=', typeof NativeModules !== 'undefined', 'hasMod=', !!NativeModules?.DevClientModule)
  const mod = NativeModules.DevClientModule
  if (!mod) {
    console.error('[devCall] DevClientModule missing; method=', method)
    return
  }
  if (method === 'getAppInfo') {
    console.error('[devCall] getAppInfo branch; fn type=', typeof mod.getAppInfo, 'keys=', Object.keys(mod).join(','))
  }
  const cb =
    method === 'checkServerCompatibility' && callback != null
      ? wrapCheckServerCompatibilityCallback(callback)
      : callback

  if (method === 'setDevServerUrl' && data?.url) {
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
  } else if (method === 'getRecentEntries' && callback) {
    mod.getRecentEntries?.(callback)
  } else if (method === 'removeRecentUrl' && data?.url) {
    mod.removeRecentUrl?.(String(data.url))
  } else if (method === 'getDiscoveredServers' && callback) {
    mod.getDiscoveredServers?.(callback)
  } else if (method === 'checkServerCompatibility' && data?.url && cb) {
    if (typeof mod.checkServerCompatibility === 'function') {
      mod.checkServerCompatibility(String(data.url), cb as (c: boolean, m: unknown) => void)
    } else {
      cb(true, [])
    }
  } else if (method === 'getAppInfo' && callback) {
    mod.getAppInfo?.((info: Record<string, string>) => {
      callback(info)
    })
  } else if (method === 'getCurrentProjectDebugInfo' && callback) {
    mod.getCurrentProjectDebugInfo?.((info: Record<string, string>) => {
      callback(info)
    })
  } else if (method === 'openProjectDirect' && data?.url) {
    mod.openProjectDirect?.(String(data.url))
  } else if (method === 'getProjectDeepLink' && callback) {
    mod.getProjectDeepLink?.(callback)
  } else if (method === 'dismissTamerDebugPanel') {
    mod.dismissTamerDebugPanel?.()
  } else if (method === 'getPerfHistory' && callback) {
    if (typeof mod.getPerfHistory === 'function') {
      mod.getPerfHistory(callback)
    } else {
      callback([])
    }
  } else {
    console.warn(`[tamer-dev-client] Unsupported DevClientModule method: ${method}`)
  }
}

export function toRequiredModules(raw: unknown): RequiredModule[] {
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
