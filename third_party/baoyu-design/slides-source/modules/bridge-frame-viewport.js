// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBridgeFrameViewport(runtime2) {
  var FrameViewportReactDom, ReactFrameViewport, MAX_FRAME_BOTTOM_INSET, FRAME_BOTTOM_INSET_SHRINK_DELAY_MS, frameBottomInset, frameBottomInsetSubscribers, updateFrameBottomInset, KEYBOARD_INPUT_TYPE_PATTERN;
  function revealFocusedDialogField() {
    let active = document.activeElement;
    if (active?.closest('[data-cds="Dialog"]') == null)
      return;
    let field = active instanceof HTMLInputElement ? KEYBOARD_INPUT_TYPE_PATTERN.test(active.type ?? "") : active.tagName === "TEXTAREA", readOnly = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.readOnly === !0;
    (active instanceof HTMLElement && active.isContentEditable || field && !readOnly) && active.scrollIntoView({
      block: "nearest"
    });
  }
  function applyKeyboardInset() {
    if (typeof document > "u")
      return;
    let root = document.documentElement;
    root.toggleAttribute("data-mc-keyboard", frameBottomInset > 0), frameBottomInset > 0 ? root.style.setProperty("--mc-keyboard-inset", String(frameBottomInset) + "px") : root.style.removeProperty("--mc-keyboard-inset"), frameBottomInset > 0 && revealFocusedDialogField();
  }
  function revealFieldOnViewportShrink(win) {
    let height2 = win.innerHeight;
    win.addEventListener("resize", () => {
      let shrank = win.innerHeight < height2;
      height2 = win.innerHeight, shrank && revealFocusedDialogField();
    });
  }
  function readFrameFootInset(doc = document) {
    let probe = doc.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;height:var(--mc-foot-inset,0px)", doc.body.append(probe);
    let height2 = parseFloat(doc.defaultView?.getComputedStyle(probe).height ?? "") || 0;
    return probe.remove(), Math.round(height2);
  }
  function useFootInsetCollisionPadding(open4, padding = 5) {
    let [footInset, setFootInset] = ReactFrameViewport.useState(0);
    return ReactFrameViewport.useLayoutEffect(() => {
      open4 && setFootInset(readFrameFootInset());
    }, [open4]), ReactFrameViewport.useMemo(() => ({
      top: padding,
      right: padding,
      bottom: padding + footInset,
      left: padding
    }), [padding, footInset]);
  }
  function initializeFrameFootInset() {
  }
  function parseFrameViewportMessage(event, parent, originAllowed) {
    if (parent === null || event.source !== parent || !originAllowed(event.origin))
      return null;
    let data = event.data;
    if (typeof data != "object" || data === null || data.__frame_viewport !== !0)
      return null;
    let bottomInset = data.bottomInset;
    return typeof bottomInset == "number" && Number.isFinite(bottomInset) ? Math.min(MAX_FRAME_BOTTOM_INSET, Math.max(0, Math.round(bottomInset))) : 0;
  }
  function createBottomInsetSmoother(onChange, schedule = setTimeout, cancel = (input) => clearTimeout(input)) {
    let current = 0, pending = null, target = 0;
    return Object.assign((input) => {
      pending !== null && input === target || (pending !== null && cancel(pending), pending = null, input > current ? onChange(current = input) : input < current && (pending = schedule(() => (pending = null, onChange(current = input)), FRAME_BOTTOM_INSET_SHRINK_DELAY_MS)), target = input);
    }, {
      forget() {
        pending !== null && cancel(pending), pending = null;
      }
    });
  }
  function subscribeFrameBottomInset(listener) {
    return frameBottomInsetSubscribers.add(listener), () => frameBottomInsetSubscribers.delete(listener);
  }
  function useFrameBottomInset() {
    return ReactFrameViewport.useSyncExternalStore(subscribeFrameBottomInset, () => frameBottomInset, () => 0);
  }
  return bindRuntimeValue(runtime2, "FrameViewportReactDom", () => FrameViewportReactDom, (value) => {
    FrameViewportReactDom = value;
  }), bindRuntimeValue(runtime2, "ReactFrameViewport", () => ReactFrameViewport, (value) => {
    ReactFrameViewport = value;
  }), bindRuntimeValue(runtime2, "MAX_FRAME_BOTTOM_INSET", () => MAX_FRAME_BOTTOM_INSET, (value) => {
    MAX_FRAME_BOTTOM_INSET = value;
  }), bindRuntimeValue(runtime2, "parseFrameViewportMessage", () => parseFrameViewportMessage), bindRuntimeValue(runtime2, "FRAME_BOTTOM_INSET_SHRINK_DELAY_MS", () => FRAME_BOTTOM_INSET_SHRINK_DELAY_MS, (value) => {
    FRAME_BOTTOM_INSET_SHRINK_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "createBottomInsetSmoother", () => createBottomInsetSmoother), bindRuntimeValue(runtime2, "frameBottomInset", () => frameBottomInset, (value) => {
    frameBottomInset = value;
  }), bindRuntimeValue(runtime2, "frameBottomInsetSubscribers", () => frameBottomInsetSubscribers, (value) => {
    frameBottomInsetSubscribers = value;
  }), bindRuntimeValue(runtime2, "updateFrameBottomInset", () => updateFrameBottomInset, (value) => {
    updateFrameBottomInset = value;
  }), bindRuntimeValue(runtime2, "subscribeFrameBottomInset", () => subscribeFrameBottomInset), bindRuntimeValue(runtime2, "useFrameBottomInset", () => useFrameBottomInset), bindRuntimeValue(runtime2, "KEYBOARD_INPUT_TYPE_PATTERN", () => KEYBOARD_INPUT_TYPE_PATTERN, (value) => {
    KEYBOARD_INPUT_TYPE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "revealFocusedDialogField", () => revealFocusedDialogField), bindRuntimeValue(runtime2, "applyKeyboardInset", () => applyKeyboardInset), bindRuntimeValue(runtime2, "revealFieldOnViewportShrink", () => revealFieldOnViewportShrink), bindRuntimeValue(runtime2, "readFrameFootInset", () => readFrameFootInset), bindRuntimeValue(runtime2, "useFootInsetCollisionPadding", () => useFootInsetCollisionPadding), bindRuntimeValue(runtime2, "initializeFrameFootInset", () => initializeFrameFootInset), () => {
    (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeImageDownsampling)(), FrameViewportReactDom = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), ReactFrameViewport = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), MAX_FRAME_BOTTOM_INSET = 9999, FRAME_BOTTOM_INSET_SHRINK_DELAY_MS = 400, frameBottomInset = 0, frameBottomInsetSubscribers = /* @__PURE__ */ new Set(), KEYBOARD_INPUT_TYPE_PATTERN = /^(text|search|url|tel|email|password|number)$/, updateFrameBottomInset = createBottomInsetSmoother((input) => {
      frameBottomInset = input, applyKeyboardInset();
      for (let value of frameBottomInsetSubscribers)
        value();
    }), typeof window < "u" && window.parent !== window && window.addEventListener("message", (dataset) => {
      if (dataset.source !== window.parent || !(0, runtime2.isAllowedHostMessageOrigin)(dataset.origin))
        return;
      let value = parseFrameViewportMessage(dataset, window.parent, runtime2.isAllowedHostMessageOrigin);
      value !== null && updateFrameBottomInset(value);
    }), typeof window < "u" && revealFieldOnViewportShrink(window);
  };
}
export {
  installBridgeFrameViewport
};
