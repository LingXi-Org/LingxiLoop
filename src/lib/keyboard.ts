type KeyboardEventLike = {
  key?: string
  keyCode?: number
  nativeEvent?: {
    isComposing?: boolean
    keyCode?: number
  }
}

export function isImeComposing(event: KeyboardEventLike): boolean {
  return Boolean(
    event.nativeEvent?.isComposing
      || event.nativeEvent?.keyCode === 229
      || event.keyCode === 229
      || event.key === 'Process',
  )
}
