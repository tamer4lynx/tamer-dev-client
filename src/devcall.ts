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
    call?: (method: string, params: { data?: Record<string, unknown> }, callback?: (res: unknown) => void) => void
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
    checkServerCompatibility?: (url: string, callback: (compatible: boolean, requiredModules: unknown) => void) => void
  }
}

export function devCall(method: string, data?: Record<string, unknown>, callback?: (res?: unknown, res2?: unknown) => void) {
  const mod = NativeModules.DevClientModule
  if (!mod) return
  const cb =
    method === 'checkServerCompatibility' && callback != null
      ? wrapCheckServerCompatibilityCallback(callback)
      : callback
  if (typeof mod.call === 'function') {
    mod.call(method, { data: data ?? {} }, cb ?? (() => {}))
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
