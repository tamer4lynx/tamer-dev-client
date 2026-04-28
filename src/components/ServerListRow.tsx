import { useCallback } from '@lynx-js/react'
import { Card } from '@tamer4lynx/tamer-app-shell'

export type ServerListRowProps = {
  dotClass: string
  iconUrl?: string
  title: string
  subtitle?: string
  surfaceColor: string
  /** Unused; kept for call-site compatibility. */
  borderColor?: string
  titleColor: string
  subtitleColor: string
  /** When true, render only row content (parent supplies surface, e.g. Card in swipe row). */
  embedded?: boolean
  /** When true, no tap — parent handles press (e.g. swipe row). */
  disableTap?: boolean
  onPress: () => void
}

export default function ServerListRow(props: ServerListRowProps) {
  const {
    dotClass,
    iconUrl,
    title,
    subtitle,
    surfaceColor,
    titleColor,
    subtitleColor,
    embedded = false,
    disableTap = false,
    onPress,
  } = props

  const handleTap = useCallback(() => {
    'background only'
    onPress()
  }, [onPress])

  const rowChildren = (
    <view className="DevLauncher__serverRowInner">
      <view className={dotClass} />
      {iconUrl ? (
        <image className="DevLauncher__rowIcon" src={iconUrl} mode="aspectFill" />
      ) : (
        <view className="DevLauncher__rowIcon DevLauncher__rowIcon--placeholder" />
      )}
      <view className="DevLauncher__recentItemMain">
        <text className="DevLauncher__recentText DevLauncher__recentText--name" style={{ color: titleColor }}>
          {title}
        </text>
        {subtitle ? (
          <text className="DevLauncher__recentText DevLauncher__recentText--url" style={{ color: subtitleColor }}>
            {subtitle}
          </text>
        ) : null}
      </view>
    </view>
  )

  if (embedded) {
    return rowChildren
  }

  return (
    <Card
      variant="elevated"
      colors={{ container: surfaceColor }}
      onTap={disableTap ? undefined : handleTap}
      style={{
        width: '100%',
        minWidth: '0px',
        padding: '14px 16px',
        boxSizing: 'border-box',
      }}
    >
      {rowChildren}
    </Card>
  )
}
