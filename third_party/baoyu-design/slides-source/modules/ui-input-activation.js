// Keyboard and pointer activation shared by image/table/shape insertion.
export function installUiInputActivation(runtime) { runtime.isKeyboardOrPrimaryActivation = event => event.detail === 0 || event.buttons === 1 || event.nativeEvent?.mozInputSource === 0; return () => {}; }
