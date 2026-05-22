import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { Button } from '@tamer4lynx/tamer-app-shell'
import type {
  MetricsTimingInfo,
  NodesRef,
  Performance,
  TimingInfo,
  TimingListener,
} from '@lynx-js/types'
import { devCall } from '../devcall.js'
import {
  resolveTheme,
  type DevLauncherTheme,
} from '../devLauncherTheme.js'
import { fetchIconAsDataUrl, getStoredIconDataUrl, rememberIconCacheKey } from '../recentIconCache.js'
import type { TimeValuePoint } from '../perfLineGraph.js'

type GlobalEventEmitter = {
  addListener?: (name: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (name: string, handler: (...args: unknown[]) => void) => void
}

declare const lynx: {
  performance?: Performance
  getJSModule?: (name: string) => GlobalEventEmitter | undefined
}

type PerfSample = { t: number; frametimeMs: number; cpuPct: number; avgFps?: number }

const FRAMETIME_BLACK = '#000000'
const FRAMETIME_ORANGE = '#f9ab00'
const FRAMETIME_RED = '#ea4335'

const PERF_MAX_POINTS = 120

type DebugInfo = {
  url?: string
  iconUrl?: string
  label?: string
  tamerAppKey?: string
}

type AppInfo = {
  bundleId: string
  nativeAppVersion: string
  lynxSdkVersion: string
}

function extractStr(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  return v != null && String(v) !== '' ? String(v) : '—'
}

function formatMetricsOneLine(m: MetricsTimingInfo | undefined): string {
  if (!m || typeof m !== 'object') return '—'
  const parts: string[] = []
  const add = (label: string, x: unknown) => {
    if (typeof x === 'number' && Number.isFinite(x)) {
      parts.push(`${label} ${x < 200 ? x.toFixed(0) : Math.round(x)}`)
    }
  }
  add('fcp', m.fcp)
  add('tti', m.tti)
  add('fmp', m.actual_fmp)
  return parts.length ? parts.join(' · ') : '—'
}

const SPARKLINE_COLS = 72
const GRID_LEVELS = 3
const GRID_BAND_PCT = 100 / GRID_LEVELS
const GRID_GAP_PX = 2

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function PerfContributionGrid({
  points,
  barColor,
  fixedMax,
}: {
  points: TimeValuePoint[]
  barColor: string
  fixedMax?: number
}) {
  const gridRef = useRef<NodesRef | null>(null)
  const [gridLayout, setGridLayout] = useState<{ width: number; height: number } | null>(null)
  const series = points.length > SPARKLINE_COLS
    ? points.slice(points.length - SPARKLINE_COLS)
    : points
  let vMax = 1
  for (const p of series) {
    if (p.v > vMax) vMax = p.v
  }
  const yMax = fixedMax != null
    ? Math.max(fixedMax, 1)
    : vMax + Math.max(vMax * 0.08, 1)

  useEffect(() => {
    'background only'
    const measure = () => {
      const ref = gridRef.current
      if (!ref) return
      ref
        .invoke({
          method: 'boundingClientRect',
          success: (res) => {
            if (!res || typeof res !== 'object') return
            const width = typeof (res as { width?: unknown }).width === 'number'
              ? (res as { width: number }).width
              : 0
            const height = typeof (res as { height?: unknown }).height === 'number'
              ? (res as { height: number }).height
              : 0
            if (width > 0 && height > 0) {
              setGridLayout((prev) => (
                prev != null && prev.width === width && prev.height === height
                  ? prev
                  : { width, height }
              ))
            }
          },
        })
        .exec()
    }

    measure()
    const immediate = setTimeout(measure, 0)
    const delayed = setTimeout(measure, 80)
    return () => {
      clearTimeout(immediate)
      clearTimeout(delayed)
    }
  }, [points.length])

  if (series.length === 0) {
    return (
      <view
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <text style={{ fontSize: '20rpx', color: '#888' }}>No samples</text>
      </view>
    )
  }

  const layoutWidth = gridLayout?.width ?? 0
  const layoutHeight = gridLayout?.height ?? 0
  const maxCellSizePx = layoutHeight > 0
    ? Math.max(1, (layoutHeight - GRID_GAP_PX * (GRID_LEVELS - 1)) / GRID_LEVELS)
    : 0
  const visibleCols = layoutWidth > 0 && maxCellSizePx > 0
    ? Math.max(1, Math.ceil((layoutWidth + GRID_GAP_PX) / (maxCellSizePx + GRID_GAP_PX)))
    : 1
  const cellSizePx = layoutWidth > 0
    ? Math.max(1, (layoutWidth - GRID_GAP_PX * Math.max(visibleCols - 1, 0)) / visibleCols)
    : maxCellSizePx || 1

  const recentPoints = series.length > visibleCols
    ? series.slice(series.length - visibleCols)
    : series
  const pointSlots: Array<number | null> = Array.from({ length: visibleCols }, (_, index) => {
    const point = recentPoints[index - (visibleCols - recentPoints.length)]
    if (!point) return null
    return Math.min(100, Math.max(0, (point.v / yMax) * 100))
  })

  return (
    <view
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        padding: '6rpx',
      }}
    >
      <view
        ref={gridRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {pointSlots.map((p, i) => {
          const bottomOpacity = p == null ? 0 : clamp01(p / GRID_BAND_PCT)
          const middleOpacity = p == null ? 0 : clamp01((p - GRID_BAND_PCT) / GRID_BAND_PCT)
          const topOpacity = p == null ? 0 : clamp01((p - GRID_BAND_PCT * 2) / GRID_BAND_PCT)
          const cellOpacities = [topOpacity, middleOpacity, bottomOpacity]

          return (
            <view
              key={`grid-col-${i}`}
              style={{
                width: `${cellSizePx}px`,
                display: 'flex',
                flexDirection: 'column',
                marginLeft: i === 0 ? '0px' : `${GRID_GAP_PX}px`,
              }}
            >
              {cellOpacities.map((opacity, cellIndex) => (
                <view
                  key={`grid-cell-${i}-${cellIndex}`}
                  style={{
                    width: `${cellSizePx}px`,
                    height: `${cellSizePx}px`,
                    marginTop: cellIndex === 0 ? '0px' : `${GRID_GAP_PX}px`,
                    borderRadius: '2px',
                    backgroundColor: barColor,
                    opacity: opacity > 0 ? opacity : 0.05,
                  }}
                />
              ))}
            </view>
          )
        })}
      </view>
    </view>
  )
}

function FrametimeBandedGrid({
  points,
  baseColor,
}: {
  points: TimeValuePoint[]
  baseColor: string
}) {
  const gridRef = useRef<NodesRef | null>(null)
  const [gridLayout, setGridLayout] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    'background only'
    const measure = () => {
      const ref = gridRef.current
      if (!ref) return
      ref
        .invoke({
          method: 'boundingClientRect',
          success: (res) => {
            if (!res || typeof res !== 'object') return
            const width = typeof (res as { width?: unknown }).width === 'number'
              ? (res as { width: number }).width
              : 0
            const height = typeof (res as { height?: unknown }).height === 'number'
              ? (res as { height: number }).height
              : 0
            if (width > 0 && height > 0) {
              setGridLayout((prev) => (
                prev != null && prev.width === width && prev.height === height
                  ? prev
                  : { width, height }
              ))
            }
          },
        })
        .exec()
    }

    measure()
    const immediate = setTimeout(measure, 0)
    const delayed = setTimeout(measure, 80)
    return () => {
      clearTimeout(immediate)
      clearTimeout(delayed)
    }
  }, [points.length])

  if (points.length === 0) {
    return (
      <view
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <text style={{ fontSize: '20rpx', color: '#888' }}>No samples</text>
      </view>
    )
  }

  const layoutWidth = gridLayout?.width ?? 0
  const layoutHeight = gridLayout?.height ?? 0
  const maxCellSizePx = layoutHeight > 0
    ? Math.max(1, (layoutHeight - GRID_GAP_PX * (GRID_LEVELS - 1)) / GRID_LEVELS)
    : 0
  const visibleCols = layoutWidth > 0 && maxCellSizePx > 0
    ? Math.max(1, Math.ceil((layoutWidth + GRID_GAP_PX) / (maxCellSizePx + GRID_GAP_PX)))
    : 1
  const cellSizePx = layoutWidth > 0
    ? Math.max(1, (layoutWidth - GRID_GAP_PX * Math.max(visibleCols - 1, 0)) / visibleCols)
    : maxCellSizePx || 1

  const recentPoints = points.length > visibleCols
    ? points.slice(points.length - visibleCols)
    : points
  const pointSlots: Array<number | null> = Array.from({ length: visibleCols }, (_, index) => {
    const point = recentPoints[index - (visibleCols - recentPoints.length)]
    if (!point) return null
    return Number.isFinite(point.v) ? Math.max(0, point.v) : 0
  })

  return (
    <view
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        padding: '6rpx',
      }}
    >
      <view
        ref={gridRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {pointSlots.map((ms, i) => {
          // Each band uses 3 cells as a fill-up meter (bottom→mid→top).
          // Each cell covers 1/3 of the band range.
          // cells[0]=top, cells[1]=mid, cells[2]=bottom (flexDirection:'column' renders top-down).
          const MIN_OP = 0.05
          type Cell = { color: string; opacity: number }
          let cells: [Cell, Cell, Cell]

          const fillCells = (color: string, bandVal: number, bandWidth: number): [Cell, Cell, Cell] => {
            const t = bandWidth / 3
            const opBottom = clamp01(bandVal / t)
            const opMid    = clamp01((bandVal - t) / t)
            const opTop    = clamp01((bandVal - 2 * t) / t)
            return [
              { color, opacity: opTop    > 0 ? opTop    : MIN_OP },
              { color, opacity: opMid    > 0 ? opMid    : MIN_OP },
              { color, opacity: opBottom > 0 ? opBottom : MIN_OP },
            ]
          }

          if (ms == null) {
            cells = [
              { color: baseColor, opacity: MIN_OP },
              { color: baseColor, opacity: MIN_OP },
              { color: baseColor, opacity: MIN_OP },
            ]
          } else if (ms >= 3000) {
            cells = [
              { color: FRAMETIME_BLACK, opacity: 1 },
              { color: FRAMETIME_BLACK, opacity: 1 },
              { color: FRAMETIME_BLACK, opacity: 1 },
            ]
          } else if (ms >= 900) {
            cells = fillCells(FRAMETIME_BLACK, ms - 900, 2100)
          } else if (ms >= 300) {
            cells = fillCells(FRAMETIME_RED, ms - 300, 600)
          } else if (ms >= 100) {
            cells = fillCells(FRAMETIME_ORANGE, ms - 100, 200)
          } else {
            cells = fillCells(baseColor, ms, 100)
          }

          return (
            <view
              key={`fgrid-col-${i}`}
              style={{
                width: `${cellSizePx}px`,
                display: 'flex',
                flexDirection: 'column',
                marginLeft: i === 0 ? '0px' : `${GRID_GAP_PX}px`,
              }}
            >
              {cells.map((cell, cellIndex) => (
                <view
                  key={`fgrid-cell-${i}-${cellIndex}`}
                  style={{
                    width: `${cellSizePx}px`,
                    height: `${cellSizePx}px`,
                    marginTop: cellIndex === 0 ? '0px' : `${GRID_GAP_PX}px`,
                    borderRadius: '2px',
                    backgroundColor: cell.color,
                    opacity: cell.opacity,
                  }}
                />
              ))}
            </view>
          )
        })}
      </view>
    </view>
  )
}

function PerfRow({
  label,
  valueText,
  labelColor,
  valueColor,
  series,
  barColor,
  fixedMax,
  unavailable,
  variant,
}: {
  label: string
  valueText: string
  labelColor: string
  valueColor: string
  series: TimeValuePoint[]
  barColor: string
  fixedMax?: number
  unavailable?: boolean
  variant?: 'default' | 'frametime'
}) {
  return (
    <view style={{ width: '100%', marginBottom: '16rpx' }}>
      <view
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4rpx',
        }}
      >
        <text style={{ fontSize: '22rpx', color: labelColor }}>{label}</text>
        <text style={{ fontSize: '22rpx', color: valueColor, fontFamily: 'monospace' }}>
          {valueText}
        </text>
      </view>
      <view
        style={{
          width: '100%',
          height: '90rpx',
          backgroundColor: 'rgba(0,0,0,0.22)',
          borderRadius: '8rpx',
          overflow: 'hidden',
        }}
      >
        {unavailable ? (
          <view
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <text style={{ fontSize: '20rpx', color: '#888' }}>Not available on this platform</text>
          </view>
        ) : variant === 'frametime' ? (
          <FrametimeBandedGrid points={series} baseColor={barColor} />
        ) : (
          <PerfContributionGrid points={series} barColor={barColor} fixedMax={fixedMax} />
        )}
      </view>
    </view>
  )
}

export function CustomDebugPanel({
  visible,
  onClose,
  fallbackUrl,
  theme,
}: {
  visible: boolean
  onClose: () => void
  fallbackUrl?: string
  theme: DevLauncherTheme | null
}) {
  const [appInfo, setAppInfo] = useState<AppInfo>({ bundleId: '—', nativeAppVersion: '—', lynxSdkVersion: '—' })
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({})
  const [iconSrc, setIconSrc] = useState('')
  const [frametimeSeries, setFrametimeSeries] = useState<TimeValuePoint[]>([])
  const [cpuSeries, setCpuSeries] = useState<TimeValuePoint[]>([])
  const [lastAvgFps, setLastAvgFps] = useState<number | null>(null)
  const [metricsSummary, setMetricsSummary] = useState('—')

  const palette = resolveTheme(theme)
  const rawPrimary = palette.primary ?? '#7ecbff'
  const lineStroke =
    rawPrimary.toLowerCase() === '#000000' || rawPrimary.toLowerCase() === '#000' ? '#7ecbff' : rawPrimary
  const cpuColor = '#8ab4f8'

  useEffect(() => {
    'background only'
    if (!visible) return
    devCall('getAppInfo', {}, (info) => {
      if (info != null && typeof info === 'object' && !Array.isArray(info)) {
        const o = info as Record<string, unknown>
        setAppInfo({
          bundleId: extractStr(o, 'bundleId'),
          nativeAppVersion: extractStr(o, 'nativeAppVersion'),
          lynxSdkVersion: extractStr(o, 'lynxSdkVersion'),
        })
      }
    })
    devCall('getCurrentProjectDebugInfo', {}, (info) => {
      if (info != null && typeof info === 'object' && !Array.isArray(info)) {
        setDebugInfo(info as DebugInfo)
      }
    })
  }, [visible])

  useEffect(() => {
    'background only'
    if (!visible) return
    const remoteUrl = debugInfo.iconUrl
    if (!remoteUrl) {
      setIconSrc('')
      return
    }
    let cancelled = false
    void (async () => {
      let src = getStoredIconDataUrl(remoteUrl)
      if (!src) {
        const fetched = await fetchIconAsDataUrl(remoteUrl)
        if (fetched) {
          rememberIconCacheKey(remoteUrl, fetched)
          src = fetched
        }
      }
      if (!cancelled) setIconSrc(src ?? '')
    })()
    return () => {
      cancelled = true
    }
  }, [debugInfo.iconUrl, visible])

  useEffect(() => {
    'background only'
    if (!visible) return

    const perf = lynx.performance
    if (!perf || typeof perf.addTimingListener !== 'function') return

    const timingListener: TimingListener = {
      onSetup: (info: TimingInfo) => {
        setMetricsSummary(formatMetricsOneLine(info.metrics))
      },
      onUpdate: (info: TimingInfo) => {
        setMetricsSummary(formatMetricsOneLine(info.metrics))
      },
    }
    perf.addTimingListener(timingListener)
    return () => {
      try {
        perf.removeTimingListener(timingListener)
      } catch {
        // ignore
      }
    }
  }, [visible])

  useEffect(() => {
    'background only'
    if (!visible) {
      setFrametimeSeries([])
      setCpuSeries([])
      setLastAvgFps(null)
      return
    }

    const pushBounded = (arr: TimeValuePoint[], p: TimeValuePoint): TimeValuePoint[] => {
      const next = arr.length >= PERF_MAX_POINTS ? arr.slice(arr.length - PERF_MAX_POINTS + 1) : arr.slice()
      next.push(p)
      return next
    }

    const seedFrom = (rows: PerfSample[]) => {
      const ft: TimeValuePoint[] = []
      const cp: TimeValuePoint[] = []
      let latestFps: number | null = null
      for (const s of rows) {
        ft.push({ t: s.t, v: Number.isFinite(s.frametimeMs) ? s.frametimeMs : 0 })
        cp.push({ t: s.t, v: Number.isFinite(s.cpuPct) && s.cpuPct >= 0 ? s.cpuPct : 0 })
        if (typeof s.avgFps === 'number' && s.avgFps > 0) latestFps = s.avgFps
      }
      setFrametimeSeries(ft)
      setCpuSeries(cp)
      if (latestFps != null) setLastAvgFps(latestFps)
    }

    const normalizeSamples = (raw: unknown): PerfSample[] => {
      if (!raw) return []
      const arr = Array.isArray(raw)
        ? raw
        : typeof raw === 'object' && 'length' in (raw as object)
          ? Array.from(raw as ArrayLike<unknown>)
          : []
      const out: PerfSample[] = []
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        const o = item as Record<string, unknown>
        const t = typeof o.t === 'number' ? o.t : NaN
        const frametimeMs = typeof o.frametimeMs === 'number' ? o.frametimeMs : NaN
        const cpuPct = typeof o.cpuPct === 'number' ? o.cpuPct : NaN
        const avgFps = typeof o.avgFps === 'number' ? o.avgFps : undefined
        if (!Number.isFinite(t)) continue
        out.push({ t, frametimeMs, cpuPct, avgFps })
      }
      return out
    }

    devCall('getPerfHistory', {}, (raw) => {
      seedFrom(normalizeSamples(raw))
    })

    const emitter = lynx.getJSModule?.('GlobalEventEmitter')
    const handler = (...args: unknown[]) => {
      const evt = args[0]
      if (!evt || typeof evt !== 'object') return
      const o = evt as Record<string, unknown>
      const t = typeof o.t === 'number' ? o.t : Date.now()
      const frametimeMs = typeof o.frametimeMs === 'number' ? o.frametimeMs : 0
      const cpuPct = typeof o.cpuPct === 'number' ? o.cpuPct : 0
      const avgFps = typeof o.avgFps === 'number' && o.avgFps > 0 ? o.avgFps : null
      setFrametimeSeries((prev) => pushBounded(prev, { t, v: Math.max(0, frametimeMs) }))
      setCpuSeries((prev) => pushBounded(prev, { t, v: Math.max(0, cpuPct) }))
      if (avgFps != null) setLastAvgFps(avgFps)
    }
    emitter?.addListener?.('devclient:perfSample', handler)

    return () => {
      emitter?.removeListener?.('devclient:perfSample', handler)
    }
  }, [visible])

  const reload = useCallback(() => {
    'background only'
    devCall('dismissTamerDebugPanel')
    setTimeout(() => {
      devCall('reloadWithProjectBundle')
    }, 50)
  }, [])

  if (!visible) return null

  const outerStyle = {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const panelStyle = {
    width: '88%',
    backgroundColor: palette.surfaceContainer ?? '#1e1e1e',
    borderRadius: '16rpx',
    padding: '32rpx',
    display: 'flex',
    flexDirection: 'column' as const,
  }

  const scrollStyle = {
    width: '100%',
    maxHeight: '520rpx',
  }

  const lastFrametime =
    frametimeSeries.length > 0 ? frametimeSeries[frametimeSeries.length - 1].v : null
  const lastCpu = cpuSeries.length > 0 ? cpuSeries[cpuSeries.length - 1].v : null
  const frametimeText = lastFrametime != null
    ? `${lastFrametime < 100 ? lastFrametime.toFixed(1) : Math.round(lastFrametime)} ms${lastAvgFps != null ? ` · ${lastAvgFps} fps` : ''}`
    : '—'

  return (
    <view
      style={outerStyle}
      catchtap={onClose}
    >
      <view
        catchtap={() => {}}
        style={panelStyle}
      >
        {iconSrc ? (
          <view
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20rpx',
            }}
          >
            <image
              src={iconSrc}
              mode="aspectFill"
              style={{
                width: '96rpx',
                height: '96rpx',
                borderRadius: '24rpx',
              }}
            />
          </view>
        ) : null}
        <text
          style={{
            fontSize: '36rpx',
            fontWeight: '700',
            color: palette.onSurface ?? '#fff',
            marginBottom: '12rpx',
            textAlign: 'left',
          }}
        >
          Tamer debug
        </text>
        {debugInfo.label ? (
          <text
            style={{
              fontSize: '24rpx',
              color: palette.onSurfaceVariant ?? '#aaa',
              marginBottom: '20rpx',
              textAlign: 'left',
            }}
          >
            {debugInfo.label}
          </text>
        ) : null}

        <view style={{ width: '100%' }}>
          <text
            style={{
              fontSize: '24rpx',
              color: palette.onSurfaceVariant ?? '#aaa',
              marginBottom: '12rpx',
            }}
          >
            Dev server
          </text>
          <text
            style={{
              fontSize: '26rpx',
              color: palette.onSurface ?? '#fff',
              marginBottom: '20rpx',
            }}
          >
            {debugInfo.url || fallbackUrl || '—'}
          </text>

          <text
            style={{
              fontSize: '24rpx',
              color: palette.onSurfaceVariant ?? '#aaa',
              marginBottom: '8rpx',
            }}
          >
            Native / SDK
          </text>
          <text
            style={{
              fontSize: '24rpx',
              color: palette.onSurface ?? '#eee',
              marginBottom: '20rpx',
            }}
          >
            {`bundle: ${appInfo.bundleId} · lynx: ${appInfo.lynxSdkVersion} · app: ${appInfo.nativeAppVersion}`}
          </text>

          <text
            style={{
              fontSize: '24rpx',
              color: palette.onSurfaceVariant ?? '#aaa',
              marginBottom: '8rpx',
            }}
          >
            Performance
          </text>
          <text
            style={{
              fontSize: '22rpx',
              color: palette.onSurface ?? '#ccc',
              marginBottom: '12rpx',
            }}
          >
            {`Metrics: ${metricsSummary}`}
          </text>

          <PerfRow
            label="Frametime"
            valueText={frametimeText}
            labelColor={palette.onSurfaceVariant ?? '#aaa'}
            valueColor={palette.onSurface ?? '#eee'}
            series={frametimeSeries}
            barColor={lineStroke}
            variant="frametime"
          />
          <PerfRow
            label="CPU"
            valueText={lastCpu != null ? `${Math.round(lastCpu)}%` : '—'}
            labelColor={palette.onSurfaceVariant ?? '#aaa'}
            valueColor={palette.onSurface ?? '#eee'}
            series={cpuSeries}
            barColor={cpuColor}
            fixedMax={100}
          />
        </view>

        <view
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16rpx',
            marginTop: '24rpx',
          }}
        >
          <Button
            label="Reload project bundle"
            variant="filled"
            onTap={reload}
            style={{ width: '100%' }}
            colors={{ container: palette.primary ?? '#6200ee', label: '#fff' }}
          />
          <Button
            label="Close"
            variant="text"
            onTap={onClose}
            style={{ width: '100%' }}
            colors={{ label: palette.onSurfaceVariant ?? '#888' }}
          />
        </view>
      </view>
    </view>
  )
}
