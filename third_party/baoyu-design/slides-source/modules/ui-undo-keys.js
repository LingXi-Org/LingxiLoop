// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiUndoKeys(runtime2) {
  var reactX20;
  function undoRedoKeyCommand(event) {
    if (event.altKey || !(event.metaKey || event.ctrlKey))
      return;
    let value = event.key.toLowerCase();
    if (value === "z")
      return event.shiftKey ? "redo" : "undo";
    if (value === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey)
      return "redo";
  }
  function isUndoEditingTarget(target) {
    return typeof HTMLElement > "u" || !(target instanceof HTMLElement) ? !1 : target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
  }
  function createUndoKeyHandler(history) {
    return (event) => {
      if (event.defaultPrevented)
        return;
      let value = undoRedoKeyCommand(event);
      value && (isUndoEditingTarget(event.target) || typeof document < "u" && (0, runtime2.overlaysBlockUndo)() || (event.preventDefault(), value === "redo" ? history.redo() : history.undo()));
    };
  }
  function useUndoKeys(history, enabled = !0) {
    reactX20.useEffect(() => {
      if (!history || !enabled)
        return;
      let value = createUndoKeyHandler(history);
      return window.addEventListener("keydown", value), () => window.removeEventListener("keydown", value);
    }, [history, enabled]);
  }
  return bindRuntimeValue(runtime2, "reactX20", () => reactX20, (value) => {
    reactX20 = value;
  }), bindRuntimeValue(runtime2, "undoRedoKeyCommand", () => undoRedoKeyCommand), bindRuntimeValue(runtime2, "isUndoEditingTarget", () => isUndoEditingTarget), bindRuntimeValue(runtime2, "createUndoKeyHandler", () => createUndoKeyHandler), bindRuntimeValue(runtime2, "useUndoKeys", () => useUndoKeys), () => {
    (0, runtime2.initializeUiPropertyFocus)(), reactX20 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installUiUndoKeys
};
