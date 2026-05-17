export type ReachabilityResult =
  | { kind: 'reachable_tamer' }
  | { kind: 'reachable_no_meta' }
  | { kind: 'reachable_bundle'; bundleUrl: string }
  | { kind: 'unreachable' }

const META_TIMEOUT_MS = 5000
const STATUS_TIMEOUT_MS = 4000
const PROBE_HEADER = 'x-tamer-probe'

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

export type ValidateUrlResult =
  | { ok: true; parsed: string }
  | { ok: false; error: string }

/**
 * `http(s)://` + host (bracketed IPv6, IPv4, or hostname) + optional `:port` + optional path
 * (e.g. `/`, `/example`, `/example/main.lynx.bundle`). No `URL` API — works the same on Lynx PrimJS.
 */
const DEV_SERVER_HTTP_URL_RE =
  /^https?:\/\/(\[[0-9a-fA-F:.]+\]|[^/?:#\s@]+)(?::(\d{1,5}))?(\/[^\s?#]*)?$/i

export function validateDevServerUrl(input: string): ValidateUrlResult {
  const parsed = normalizeDevServerBase(input)
  if (!parsed.trim()) return { ok: false, error: 'Enter a server URL' }
  const m = DEV_SERVER_HTTP_URL_RE.exec(parsed)
  if (!m) return { ok: false, error: 'Invalid URL' }
  const host = m[1]
  if (!host || host.length === 0) return { ok: false, error: 'Missing host' }
  const portStr = m[2]
  if (portStr !== undefined && portStr !== '') {
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

function statusUrlForBase(base: string): string {
  return `${base.replace(/\/+$/, '')}/status`
}

const BUNDLE_FILENAME = 'main.lynx.bundle'

function bundleUrlForBase(base: string): string {
  return `${base.replace(/\/+$/, '')}/${BUNDLE_FILENAME}`
}

export async function probeDevServerReachability(baseUrl: string): Promise<ReachabilityResult> {
  const meta = metaUrlForBase(baseUrl)
  const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS)
  try {
    const res = await fetch(meta, {
      method: 'GET',
      signal,
      headers: { [PROBE_HEADER]: 'launcher-meta' },
    })
    if (res.ok) {
      return { kind: 'reachable_tamer' }
    }
    if (res.status === 404) {
      const statusResult = await probeStatusOnly(baseUrl)
      if (statusResult.kind !== 'unreachable') return statusResult
      return probeBundleOnly(baseUrl)
    }
    return { kind: 'unreachable' }
  } catch {
    return probeBundleOnly(baseUrl)
  } finally {
    cancel()
  }
}

async function probeStatusOnly(baseUrl: string): Promise<ReachabilityResult> {
  const status = statusUrlForBase(baseUrl)
  const { signal, cancel } = withTimeoutMs(STATUS_TIMEOUT_MS)
  try {
    const res = await fetch(status, {
      method: 'GET',
      signal,
      headers: { [PROBE_HEADER]: 'launcher-status' },
    })
    if (res.ok) {
      const text = await res.text()
      if (text.includes('packager-status:running')) return { kind: 'reachable_no_meta' }
    }
    return { kind: 'unreachable' }
  } catch {
    return { kind: 'unreachable' }
  } finally {
    cancel()
  }
}

async function probeBundleOnly(baseUrl: string): Promise<ReachabilityResult> {
  const bundleUrl = bundleUrlForBase(baseUrl)
  const { signal, cancel } = withTimeoutMs(STATUS_TIMEOUT_MS)
  try {
    const res = await fetch(bundleUrl, { method: 'HEAD', signal })
    if (res.ok) return { kind: 'reachable_bundle', bundleUrl }
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
    const res = await fetch(meta, {
      method: 'GET',
      signal,
      headers: { [PROBE_HEADER]: 'recent-meta' },
    })
    if (!res.ok) return res.status === 404 ? 'stale' : 'offline'
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
