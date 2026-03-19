export type ReachabilityResult =
  | { kind: 'reachable_tamer' }
  | { kind: 'reachable_no_meta' }
  | { kind: 'unreachable' }

const META_TIMEOUT_MS = 5000
const ROOT_PROBE_TIMEOUT_MS = 4000

function withTimeoutMs(ms: number): { signal: AbortSignal; cancel: () => void } {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), ms)
  return { signal: c.signal, cancel: () => clearTimeout(id) }
}

export function normalizeDevServerBase(input: string): string {
  let s = input.trim().replace(/^\uFEFF/, '')
  if (s.startsWith('tamer://')) s = 'http://' + s.replace('tamer://', '')
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  s = s.replace(/\/main\.lynx\.bundle\/?$/i, '').replace(/\/+$/, '') || s
  return s
}

function looksLikeHttpOrHttpsUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s.trim())
}

function isHttpOrHttpsProtocol(protocol: string | undefined | null): boolean {
  if (protocol == null) return false
  const p = String(protocol).trim().toLowerCase().replace(/:+$/, '')
  return p === 'http' || p === 'https'
}

export type ValidateUrlResult =
  | { ok: true; parsed: string }
  | { ok: false; error: string }

export function validateDevServerUrl(input: string): ValidateUrlResult {
  const parsed = normalizeDevServerBase(input)
  if (!parsed.trim()) return { ok: false, error: 'Enter a server URL' }
  let u: URL
  try {
    u = new URL(parsed)
  } catch {
    return { ok: false, error: 'Invalid URL' }
  }
  if (!isHttpOrHttpsProtocol(u.protocol) && !looksLikeHttpOrHttpsUrl(parsed)) {
    return { ok: false, error: 'Only http and https URLs are supported' }
  }
  if ((!u.hostname || u.hostname.length === 0) && !looksLikeHttpOrHttpsUrl(parsed)) {
    return { ok: false, error: 'Missing host' }
  }
  const portStr = u.port != null && u.port !== '' ? String(u.port).trim() : ''
  if (portStr !== '') {
    const p = Number(portStr)
    if (!Number.isFinite(p) || p !== Math.trunc(p) || p < 1 || p > 65535) {
      return { ok: false, error: 'Invalid port' }
    }
  }
  return { ok: true, parsed }
}

function metaUrlForBase(base: string): string {
  return `${base.replace(/\/+$/, '')}/meta.json`
}

export async function probeDevServerReachability(baseUrl: string): Promise<ReachabilityResult> {
  const meta = metaUrlForBase(baseUrl)
  const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS)
  try {
    const res = await fetch(meta, { method: 'GET', signal })
    if (res.ok) {
      return { kind: 'reachable_tamer' }
    }
    if (res.status === 404) {
      return probeRootOnly(baseUrl)
    }
    return { kind: 'unreachable' }
  } catch {
    return { kind: 'unreachable' }
  } finally {
    cancel()
  }
}

async function probeRootOnly(baseUrl: string): Promise<ReachabilityResult> {
  const root = baseUrl.replace(/\/+$/, '') + '/'
  const { signal, cancel } = withTimeoutMs(ROOT_PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(root, { method: 'GET', signal })
    if (res.status >= 200 && res.status < 600) return { kind: 'reachable_no_meta' }
    return { kind: 'unreachable' }
  } catch {
    return { kind: 'unreachable' }
  } finally {
    cancel()
  }
}

export async function probeRecentServerStatus(baseUrl: string): Promise<'online' | 'offline'> {
  const r = await probeDevServerReachability(baseUrl)
  if (r.kind === 'unreachable') return 'offline'
  return 'online'
}

export type RecentMetaMatchStatus = 'matched' | 'mismatch' | 'stale' | 'offline'

/** Green path: Tamer dev meta + tamerAppKey matches saved key when we have one. */
export async function probeRecentMetaMatch(
  baseUrl: string,
  expectedTamerAppKey?: string
): Promise<RecentMetaMatchStatus> {
  const meta = metaUrlForBase(baseUrl)
  const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS)
  try {
    const res = await fetch(meta, { method: 'GET', signal })
    if (!res.ok) return 'offline'
    let json: Record<string, unknown>
    try {
      json = JSON.parse(await res.text()) as Record<string, unknown>
    } catch {
      return 'stale'
    }
    const dev = json.developer as Record<string, unknown> | undefined
    const tool = dev?.tool
    const packager = json.packagerStatus
    const isTamer = tool === 'tamer4lynx' || packager === 'running'
    if (!isTamer) return 'stale'
    const liveKey =
      typeof json.tamerAppKey === 'string' && json.tamerAppKey.trim() ? json.tamerAppKey.trim() : undefined
    const expected = expectedTamerAppKey?.trim()
    if (expected) {
      if (liveKey && liveKey !== expected) return 'mismatch'
      if (!liveKey) return 'stale'
    }
    return 'matched'
  } catch {
    return 'offline'
  } finally {
    cancel()
  }
}
