export type RequiredModule = { packageName: string; moduleClassName: string }

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

export function devCall(method: string, data?: Record<string, unknown>, callback?: (res?: unknown, res2?: unknown) => void) {
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
