import { devServerProbeBase } from './devServerUrl'

export type ServerIdentity = {
  url: string
  tamerAppKey?: string
}

export function serverIdentityKey(server: ServerIdentity): string {
  const key = server.tamerAppKey?.trim()
  if (key) return `key:${key}`
  return `url:${devServerProbeBase(server.url)}`
}

