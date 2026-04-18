import type { ViewProps } from '@lynx-js/types'

declare module '@lynx-js/react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      input: ViewProps & {
        placeholder?: string
        value?: string
        type?: 'text' | 'number' | 'digit' | 'password' | 'tel' | 'email'
        'ios-auto-correct'?: boolean
        'ios-spell-check'?: boolean
        maxlength?: number
        readonly?: boolean
        disabled?: boolean
        'confirm-type'?: 'search' | 'send' | 'go' | 'done' | 'next'
        bindinput?: (e: { detail: { value: string; selectionStart: number; selectionEnd: number; isComposing?: boolean } }) => void
        bindfocus?: (e: { detail: { value: string } }) => void
        bindblur?: (e: { detail: { value: string } }) => void
        bindconfirm?: (e: { detail: { value: string } }) => void
        bindselection?: (e: { detail: { selectionStart: number; selectionEnd: number } }) => void
      }
    }
  }
}
