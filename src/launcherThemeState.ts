import type { DevLauncherTheme } from './devLauncherTheme'

type ThemeListener = (theme: DevLauncherTheme | null) => void

let systemTheme: DevLauncherTheme | null = null
const listeners = new Set<ThemeListener>()

function emit() {
  for (const listener of listeners) {
    listener(systemTheme)
  }
}

export function subscribeLauncherThemeState(listener: ThemeListener) {
  listeners.add(listener)
  listener(systemTheme)
  return () => {
    listeners.delete(listener)
  }
}

export function setLauncherSystemTheme(theme: DevLauncherTheme | null) {
  systemTheme = theme
  emit()
}

export function getEffectiveLauncherTheme(): DevLauncherTheme | null {
  return systemTheme
}
