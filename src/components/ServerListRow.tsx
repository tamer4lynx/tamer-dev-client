import { useCallback } from '@lynx-js/react'

export type ServerListRowProps = {
  dotClass: string
  iconUrl?: string
  title: string
  subtitle?: string
  surfaceColor: string
  borderColor: string
  titleColor: string
  subtitleColor: string
  itemClassName?: string
  /** When true, no bindtap — parent handles press (e.g. swipe row). */
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
    borderColor,
    titleColor,
    subtitleColor,
    itemClassName = 'DevLauncher__recentItem',
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

  if (disableTap) {
    return (
      <view className={itemClassName} style={{ backgroundColor: surfaceColor, borderColor }}>
        {rowChildren}
      </view>
    )
  }

  return (
    <view
      className={itemClassName}
      style={{ backgroundColor: surfaceColor, borderColor }}
      bindtap={handleTap}
    >
      {rowChildren}
    </view>
  )
}
