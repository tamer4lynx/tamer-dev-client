import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { Card } from '@tamer4lynx/tamer-app-shell'
import ServerListRow from './ServerListRow'

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

export default function RecentSwipeRow(props: {
  title: string
  subtitle?: string
  iconUrl?: string
  dotClass: string
  surfaceColor: string
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
    <view className="DevLauncher__swipeTrack">
      <view className="DevLauncher__swipeDelete" style={{ width: `${DELETE_REVEAL_RPX}rpx` }} catchtap={onDeleteTap}>
        <text className="DevLauncher__swipeDeleteText">Delete</text>
      </view>
      <view
        className="DevLauncher__swipeRowSurface"
        style={{
          transform: `translateX(${offsetRpx}rpx)`,
        }}
        bindtouchstart={onTouchStart}
        bindtouchmove={onTouchMove}
        bindtouchend={snapEnd}
        bindtouchcancel={snapEnd}
        bindtap={onForegroundTap}
      >
        <Card
          variant="elevated"
          colors={{ container: surfaceColor }}
          style={{
            width: '100%',
            minWidth: 0,
            padding: '14px 16px',
            boxSizing: 'border-box',
          }}
        >
          <ServerListRow
            embedded
            dotClass={dotClass}
            iconUrl={iconUrl}
            title={title}
            subtitle={subtitle}
            surfaceColor={surfaceColor}
            borderColor={surfaceColor}
            titleColor={titleColor}
            subtitleColor={subtitleColor}
            disableTap
            onPress={() => {}}
          />
        </Card>
      </view>
    </view>
  )
}
