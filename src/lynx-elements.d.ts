import type { ViewProps } from '@lynx-js/types'

declare module '@lynx-js/react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'tamer-input': ViewProps & {
        id?: string
        placeholder?: string
        value?: string
        multiline?: boolean
        maxlength?: number
        maxlines?: number
        'max-height'?: number
        readonly?: boolean
        type?: string
        'confirm-type'?: string
        'ios-auto-correct'?: boolean
        bindinput?: (e: { detail?: { value?: string }; value?: string }) => void
        bindfocus?: () => void
        bindblur?: () => void
        bindconfirm?: (e: { detail?: { value?: string }; value?: string }) => void
        bindselection?: (e: { detail?: { selectionStart?: number; selectionEnd?: number } }) => void
        [key: string]: unknown
      }
    }
  }
}
