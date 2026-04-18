let installed = false

export type NetworkDebugEntry = {
  url: string
  method: string
  ms: number
  ok?: boolean
}

const entries: NetworkDebugEntry[] = []
const MAX = 40

export function ensureNetworkDebugInstalled(): void {
  if (installed) return
  installed = true
  if (typeof fetch !== 'function') return
  try {
    const g = globalThis as { fetch: typeof fetch }
    const orig = g.fetch.bind(globalThis)
    const wrapped = async function tamerFetchDebug(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const method =
        init?.method ??
        (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
      let urlStr = ''
      if (typeof input === 'string') urlStr = input
      else if (typeof URL !== 'undefined' && input instanceof URL) urlStr = input.href
      else if (typeof Request !== 'undefined' && input instanceof Request) urlStr = input.url
      const t0 = Date.now()
      try {
        const res = await orig(input, init)
        const row: NetworkDebugEntry = {
          url: urlStr.slice(0, 240),
          method: String(method),
          t: Date.now() - t0,
          ok: res.ok,
        }
        entries.unshift(row)
        if (entries.length > MAX) entries.length = MAX
        return res
      } catch (e) {
        entries.unshift({
          url: urlStr.slice(0, 240),
          method: String(method),
          t: Date.now() - t0,
          ok: false,
        })
        if (entries.length > MAX) entries.length = MAX
        throw e
      }
    }
    g.fetch = wrapped
  } catch (e) {
    console.error('[networkDebug] ensureNetworkDebugInstalled failed:', e)
  }
}

export function getNetworkDebugEntries(): NetworkDebugEntry[] {
  return [...entries]
}
