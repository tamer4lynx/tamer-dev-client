const STORAGE_KEY = 'tamer_devclient_recent_icons'
const MAX_ENTRIES = 16
const MAX_BYTES_PER_ICON = 120_000

type CacheMap = Record<string, string>

function safeParse(json: string | null): CacheMap {
  if (!json) return {}
  try {
    const o = JSON.parse(json) as unknown
    if (!o || typeof o !== 'object') return {}
    return o as CacheMap
  } catch {
    return {}
  }
}

function persist(map: CacheMap) {
  try {
    const g = globalThis as { localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } }
    if (g.localStorage?.setItem) {
      g.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    }
  } catch {
    /* ignore */
  }
}

export function loadIconCacheFromStorage(): CacheMap {
  try {
    const g = globalThis as { localStorage?: { getItem: (k: string) => string | null } }
    return safeParse(g.localStorage?.getItem?.(STORAGE_KEY) ?? null)
  } catch {
    return {}
  }
}

function trimCache(map: CacheMap): CacheMap {
  const entries = Object.entries(map)
  if (entries.length <= MAX_ENTRIES) return map
  const next: CacheMap = {}
  for (const [k, v] of entries.slice(-MAX_ENTRIES)) {
    next[k] = v
  }
  return next
}

export function rememberIconCacheKey(remoteUrl: string, dataUrl: string) {
  const map = trimCache({ ...loadIconCacheFromStorage(), [remoteUrl]: dataUrl })
  persist(map)
}

export function getStoredIconDataUrl(remoteUrl: string): string | undefined {
  const v = loadIconCacheFromStorage()[remoteUrl]
  return typeof v === 'string' && v.startsWith('data:') ? v : undefined
}

function arrayBufferToBase64(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  const b64 = typeof (globalThis as { btoa?: (s: string) => string }).btoa === 'function'
    ? (globalThis as { btoa: (s: string) => string }).btoa(binary)
    : null
  return b64
}

export async function fetchIconAsDataUrl(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) return null
  try {
    const res = await fetch(remoteUrl, { method: 'GET' })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES_PER_ICON) return null
    const b64 = arrayBufferToBase64(buf)
    if (!b64) return null
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
    const mime = ct.startsWith('image/') ? ct : 'image/png'
    return `data:${mime};base64,${b64}`
  } catch {
    return null
  }
}

export function removeIconCacheKey(remoteUrl: string) {
  const map = loadIconCacheFromStorage()
  if (!(remoteUrl in map)) return
  delete map[remoteUrl]
  persist(map)
}
