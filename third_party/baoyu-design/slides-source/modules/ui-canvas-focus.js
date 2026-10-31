// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiCanvasFocus(runtime2) {
  var reactdH, canvasFocusResolver;
  function setCanvasFocusResolver(resolve) {
    return canvasFocusResolver = resolve, () => {
      canvasFocusResolver === resolve && (canvasFocusResolver = null);
    };
  }
  function useCanvasFocusResolver(resolve) {
    let ref = reactdH.useRef(resolve);
    ref.current = resolve, reactdH.useEffect(() => setCanvasFocusResolver(() => ref.current()), []);
  }
  function usePopupFocusRestoration(open4, isOpenNow) {
    let ref = reactdH.useRef({
      open: open4,
      isOpenNow
    });
    ref.current = {
      open: open4,
      isOpenNow
    };
    let ref2 = reactdH.useRef(!1);
    reactdH.useEffect(() => (ref2.current = !0, () => {
      ref2.current = !1;
    }), []), reactdH.useEffect(() => {
      if (open4)
        return () => {
          canvasFocusResolver !== null && requestAnimationFrame(() => {
            let { open: current, isOpenNow: current2 } = ref.current;
            (current2 ? current2() : ref2.current && current) || focusCanvasWhenDocumentIsIdle();
          });
        };
    }, [open4]);
  }
  function focusCanvasWhenDocumentIsIdle() {
    if (canvasFocusResolver === null || !document.hasFocus())
      return !1;
    let activeElement2 = document.activeElement;
    if (!(activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement))
      return !1;
    let value = canvasFocusResolver();
    return value === null || !value.isConnected || value.closest('[inert], [aria-hidden="true"]') !== null ? !1 : (value.focus({
      preventScroll: !0
    }), document.activeElement === value);
  }
  function isInspectorFocusTarget(target) {
    let value = target;
    return value != null && typeof value.closest == "function" && value.closest('[data-property-row],[data-tweaks-surface],[role="separator"]') != null;
  }
  return bindRuntimeValue(runtime2, "reactdH", () => reactdH, (value) => {
    reactdH = value;
  }), bindRuntimeValue(runtime2, "canvasFocusResolver", () => canvasFocusResolver, (value) => {
    canvasFocusResolver = value;
  }), bindRuntimeValue(runtime2, "setCanvasFocusResolver", () => setCanvasFocusResolver), bindRuntimeValue(runtime2, "useCanvasFocusResolver", () => useCanvasFocusResolver), bindRuntimeValue(runtime2, "usePopupFocusRestoration", () => usePopupFocusRestoration), bindRuntimeValue(runtime2, "focusCanvasWhenDocumentIsIdle", () => focusCanvasWhenDocumentIsIdle), bindRuntimeValue(runtime2, "isInspectorFocusTarget", () => isInspectorFocusTarget), () => {
    (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiPropertyFocus)(), reactdH = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), canvasFocusResolver = null;
  };
}
export {
  installUiCanvasFocus
};
