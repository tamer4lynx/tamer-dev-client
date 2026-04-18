export type TimeValuePoint = { t: number; v: number }

export function trimPointsWindow(
  points: TimeValuePoint[],
  opts: { maxPoints: number; windowMs: number; now?: number },
): TimeValuePoint[] {
  const now = opts.now ?? Date.now()
  const start = now - opts.windowMs
  let out = points.filter((p) => p.t >= start)
  if (out.length > opts.maxPoints) {
    out = out.slice(out.length - opts.maxPoints)
  }
  return out
}

export function downsampleSeries(points: TimeValuePoint[], maxCols: number): TimeValuePoint[] {
  if (points.length === 0) return []
  if (points.length <= maxCols) return points
  const n = points.length
  const out: TimeValuePoint[] = []
  for (let i = 0; i < maxCols; i++) {
    const idx = Math.round((i / Math.max(maxCols - 1, 1)) * (n - 1))
    out.push(points[idx])
  }
  return out
}
