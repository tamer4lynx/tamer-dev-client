import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { useTamerNavigate } from '@tamer4lynx/tamer-router'
import ServerListRow from '../components/ServerListRow'
import { useDevLauncher, resolveTheme } from '../DevLauncherContext'

const DELETE_REVEAL_RPX = 168

function touchPageX(e: {
  detail?: { x?: number }
  touches?: unknown
}): number {
  const raw = e.touches
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw) && raw.length > 0) {
      const t = raw[0] as { pageX?: number; clientX?: number }
      if (typeof t.pageX === 'number') return t.pageX
      if (typeof t.clientX === 'number') return t.clientX
    }
    const o = raw as { length?: number; 0?: { pageX?: number; clientX?: number } }
    if (typeof o.length === 'number' && o.length > 0 && o[0]) {
      const t = o[0]
      if (typeof t.pageX === 'number') return t.pageX
      if (typeof t.clientX === 'number') return t.clientX
    }
  }
  if (e.detail && typeof e.detail.x === 'number') return e.detail.x
  return 0
}

function RecentSwipeRow(props: {
  title: string
  subtitle?: string
  iconUrl?: string
  dotClass: string
  surfaceColor: string
  borderColor: string
  titleColor: string
  subtitleColor: string
  onConnect: () => void
  onRemove: () => void
}) {
  const {
    title,
    subtitle,
    iconUrl,
    dotClass,
    surfaceColor,
    borderColor,
    titleColor,
    subtitleColor,
    onConnect,
    onRemove,
  } = props
  const [offsetRpx, setOffsetRpx] = useState(0)
  const offsetRef = useRef(0)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    'background only'
    offsetRef.current = offsetRpx
  }, [offsetRpx])

  const snapEnd = useCallback(() => {
    'background only'
    dragging.current = false
    setOffsetRpx((o) => {
      const next = o < -DELETE_REVEAL_RPX / 2 ? -DELETE_REVEAL_RPX : 0
      offsetRef.current = next
      return next
    })
  }, [])

  const onTouchStart = useCallback((e: { detail?: { x?: number }; touches?: unknown }) => {
    'background only'
    dragging.current = true
    startX.current = touchPageX(e)
    startOffset.current = offsetRef.current
  }, [])

  const onTouchMove = useCallback(
    (e: { detail?: { x?: number }; touches?: unknown }) => {
      'background only'
      if (!dragging.current) return
      const x = touchPageX(e)
      const dx = x - startX.current
      let next = startOffset.current + dx
      if (next > 0) next = 0
      if (next < -DELETE_REVEAL_RPX) next = -DELETE_REVEAL_RPX
      offsetRef.current = next
      setOffsetRpx(next)
    },
    []
  )

  const onForegroundTap = useCallback(() => {
    'background only'
    if (offsetRef.current < -24) {
      offsetRef.current = 0
      setOffsetRpx(0)
      return
    }
    onConnect()
  }, [onConnect])

  const onDeleteTap = useCallback(() => {
    'background only'
    offsetRef.current = 0
    setOffsetRpx(0)
    onRemove()
  }, [onRemove])

  return (
    <view className="DevLauncher__swipeTrack" style={{ borderColor }}>
      <view className="DevLauncher__swipeDelete" style={{ width: `${DELETE_REVEAL_RPX}rpx` }} catchtap={onDeleteTap}>
        <text className="DevLauncher__swipeDeleteText">Delete</text>
      </view>
      <view
        className="DevLauncher__recentItem DevLauncher__swipeForeground"
        style={{
          backgroundColor: surfaceColor,
          borderColor: surfaceColor,
          transform: `translateX(${offsetRpx}rpx)`,
        }}
        bindtouchstart={onTouchStart}
        bindtouchmove={onTouchMove}
        bindtouchend={snapEnd}
        bindtouchcancel={snapEnd}
        bindtap={onForegroundTap}
      >
        <ServerListRow
          dotClass={dotClass}
          iconUrl={iconUrl}
          title={title}
          subtitle={subtitle}
          surfaceColor={surfaceColor}
          borderColor={surfaceColor}
          titleColor={titleColor}
          subtitleColor={subtitleColor}
          itemClassName="DevLauncher__serverRowEmbed"
          disableTap
          onPress={() => {}}
        />
      </view>
    </view>
  )
}

export default function RecentPage() {
  const {
    recentEntries,
    recentReachability,
    recentRowIconSrc,
    openProject,
    setUrl,
    parseUrl,
    theme,
    removeRecentItem,
  } = useDevLauncher()
  const { replace } = useTamerNavigate()
  const colors = resolveTheme(theme)

  const handleSelect = useCallback(
    (rawUrl: string) => {
      'background only'
      const parsed = parseUrl(rawUrl)
      setUrl(parsed)
      replace('/')
      openProject(rawUrl)
    },
    [parseUrl, setUrl, replace, openProject]
  )

  if (recentEntries.length === 0) {
    return (
      <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
        <view className="DevLauncher__section">
          <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Recently opened</text>
          <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>No recent servers. Connect from the Connect tab.</text>
        </view>
      </view>
    )
  }

  const subtitleColor = colors.onSurfaceVariant ?? '#888888'

  return (
    <view className="DevLauncher DevLauncher--page" style={{ backgroundColor: colors.surface }}>
      <view className="DevLauncher__section">
        <text className="DevLauncher__sectionTitle" style={{ color: colors.onSurface }}>Recently opened</text>
        <text className="DevLauncher__hint" style={{ color: colors.onSurface }}>Swipe left on a row to delete.</text>
        <view className="DevLauncher__recentList">
          {recentEntries.map((e) => {
            const st = recentReachability[e.url] ?? 'checking'
            const dotClass =
              st === 'matched'
                ? 'DevLauncher__statusDot DevLauncher__statusDot--online'
                : st === 'offline'
                  ? 'DevLauncher__statusDot DevLauncher__statusDot--offline'
                  : st === 'mismatch'
                    ? 'DevLauncher__statusDot DevLauncher__statusDot--mismatch'
                    : st === 'stale'
                      ? 'DevLauncher__statusDot DevLauncher__statusDot--stale'
                      : 'DevLauncher__statusDot DevLauncher__statusDot--checking'
            const title = e.label?.trim() ? e.label : e.url
            const subtitle = e.label?.trim() ? e.url : undefined
            return (
              <RecentSwipeRow
                key={e.url}
                title={title}
                subtitle={subtitle}
                iconUrl={recentRowIconSrc[e.url] ?? e.iconUrl}
                dotClass={dotClass}
                surfaceColor={colors.surfaceContainer ?? '#1e1e1e'}
                borderColor={colors.surfaceContainer ?? '#1e1e1e'}
                titleColor={colors.onSurface ?? '#fff'}
                subtitleColor={subtitleColor}
                onConnect={() => handleSelect(e.url)}
                onRemove={() => removeRecentItem(e.url)}
              />
            )
          })}
        </view>
      </view>
    </view>
  )
}
