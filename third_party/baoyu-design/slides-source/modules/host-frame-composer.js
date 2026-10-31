// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostFrameComposer(runtime2) {
  var ReactFrameComposer, FrameComposerReactDom, FRAME_COMPOSER_COMMAND, composerState, composerOrigin, composerFirstHeardAt, footInset, composerListeners;
  const COMPOSER_INSET_PROPERTY = "--mc-composer-inset", clampInset = (value) => typeof value == "number" && Number.isFinite(value) ? Math.min(9999, Math.max(0, Math.round(value))) : null;
  function parseFrameComposerMessage(event, parent, originAllowed) {
    if (parent === null || event.source !== parent || !originAllowed(event.origin))
      return;
    let data = event.data;
    if (typeof data != "object" || data === null || data.__frame_viewport !== !0)
      return;
    let composer = data.composer, insets = data.safeAreaInsets;
    if (typeof composer != "object" || composer === null)
      return null;
    let { available, visible, unread } = composer;
    if (typeof available != "boolean" || typeof visible != "boolean" || typeof unread != "boolean")
      return null;
    let sides2 = typeof insets == "object" && insets !== null ? insets : void 0, [top, right, bottom, left] = [
      clampInset(sides2?.top),
      clampInset(sides2?.right),
      clampInset(sides2?.bottom),
      clampInset(sides2?.left)
    ];
    return {
      available,
      visible,
      unread,
      safeAreaInsets: top !== null && right !== null && bottom !== null && left !== null ? { top, right, bottom, left } : { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }
  function applyComposerInset() {
    if (typeof document > "u")
      return;
    let inset = Math.max(0, (composerState?.safeAreaInsets.bottom ?? 0) - Math.round(footInset));
    inset === 0 ? document.documentElement.style.removeProperty(COMPOSER_INSET_PROPERTY) : document.documentElement.style.setProperty(COMPOSER_INSET_PROPERTY, String(inset) + "px");
  }
  function setFrameComposerState(state, origin, now = performance.now()) {
    if (composerOrigin = state === null ? null : origin, state !== null && (composerFirstHeardAt ??= now), JSON.stringify(state) !== JSON.stringify(composerState)) {
      composerState = state, applyComposerInset();
      for (let listener of composerListeners)
        listener();
    }
  }
  function listenForFrameComposer(win) {
    let onMessage = (event) => {
      if (event.source !== win.parent || !(0, runtime2.isAllowedHostMessageOrigin)(event.origin))
        return;
      let state = parseFrameComposerMessage(event, win.parent, runtime2.isAllowedHostMessageOrigin);
      state !== void 0 && setFrameComposerState(state, event.origin);
    };
    return win.addEventListener("message", onMessage), () => win.removeEventListener("message", onMessage);
  }
  function showFrameComposer(show, win = window) {
    composerOrigin !== null && (0, runtime2.postToHost)({ [FRAME_COMPOSER_COMMAND]: !0, show }, win, [composerOrigin]);
  }
  function subscribeFrameComposer(listener) {
    return composerListeners.add(listener), () => {
      composerListeners.delete(listener);
    };
  }
  function useFrameChatReleaseAt() {
    return ReactFrameComposer.useSyncExternalStore(subscribeFrameComposer, () => composerState !== null && !composerState.available && composerFirstHeardAt !== null ? composerFirstHeardAt + 1e3 : null, () => null);
  }
  function useComposerFocusReturn({ button, onReturn, on }) {
    ReactFrameComposer.useEffect(() => {
      if (!on)
        return;
      let [closedAt, focusedAt] = [-1 / 0, -1 / 0], pointerBusy = !1, pointerTimer, wasVisible = composerState?.visible === !0, tryReturn = () => {
        if (!(Math.abs(closedAt - focusedAt) <= 500))
          return;
        closedAt = focusedAt = -1 / 0;
        let active = document.activeElement;
        if (button.current === null || !(active === null || active === document.body || active === button.current))
          return;
        onReturn(!0);
        let focusOptions = { focusVisible: !0 };
        button.current?.focus(focusOptions), (button.current === null || document.activeElement !== button.current) && onReturn(!1);
      }, onComposerChange = () => {
        let visible = composerState?.visible === !0;
        wasVisible && !visible && (closedAt = performance.now(), tryReturn()), wasVisible = visible;
      }, isPageTarget = (event) => event.target === window || event.target === document, onFocus = (event) => {
        !isPageTarget(event) || pointerBusy || (focusedAt = performance.now(), tryReturn());
      }, onPointer = () => {
        clearTimeout(pointerTimer), pointerBusy = !0, pointerTimer = setTimeout(() => pointerBusy = !1, 100);
      }, listeners = [
        ["focus", onFocus],
        ["pointerdown", onPointer],
        ["pointerup", onPointer]
      ], unsubscribe = subscribeFrameComposer(onComposerChange);
      for (let [type, listener] of listeners)
        window.addEventListener(type, listener, !0);
      return () => {
        unsubscribe(), clearTimeout(pointerTimer);
        for (let [type, listener] of listeners)
          window.removeEventListener(type, listener, !0);
      };
    }, [button, onReturn, on]);
  }
  function useFrameChat() {
    let heard = ReactFrameComposer.useSyncExternalStore(subscribeFrameComposer, () => composerState !== null, () => !1), shown = ReactFrameComposer.useSyncExternalStore(subscribeFrameComposer, () => composerState?.available === !0, () => !1), pressed3 = ReactFrameComposer.useSyncExternalStore(subscribeFrameComposer, () => composerState?.visible === !0, () => !1), unread = ReactFrameComposer.useSyncExternalStore(subscribeFrameComposer, () => composerState?.unread === !0 && !composerState.visible, () => !1), ref = ReactFrameComposer.useRef(null), [tipShut, setTipShut] = ReactFrameComposer.useState(!1);
    useComposerFocusReturn({
      button: ref,
      onReturn: ReactFrameComposer.useCallback((returned) => FrameComposerReactDom.flushSync(() => setTipShut(returned)), []),
      on: heard
    });
    let visibleAtPress = ReactFrameComposer.useRef(null), wantShown = ReactFrameComposer.useRef(!1), escapeArmed = ReactFrameComposer.useRef(!1);
    ReactFrameComposer.useEffect(() => {
      escapeArmed.current = !1;
    }, [pressed3]), ReactFrameComposer.useEffect(() => {
      if (!heard)
        return;
      let onPointerUp = (event) => {
        (!(event.target instanceof Node) || ref.current?.contains(event.target) !== !0) && (visibleAtPress.current = null);
      };
      return window.addEventListener("pointerup", onPointerUp, !0), () => window.removeEventListener("pointerup", onPointerUp, !0);
    }, [heard]);
    let handlers = ReactFrameComposer.useMemo(() => ({
      onPointerDown() {
        visibleAtPress.current = composerState?.visible === !0;
      },
      onPointerCancel() {
        visibleAtPress.current = null;
      },
      onMouseDown(event) {
        if (event.detail > 1 && event.button === 0) {
          let focusOptions = {
            preventScroll: !0,
            focusVisible: !1
          };
          ref.current?.focus(focusOptions);
        }
      },
      onClick(event) {
        let atPress = event.detail === 0 ? null : visibleAtPress.current;
        if (visibleAtPress.current = null, wantShown.current = event.detail > 1 ? !wantShown.current : !(atPress ?? composerState?.visible === !0), event.detail > 1) {
          let focusOptions = {
            preventScroll: !0,
            focusVisible: !1
          };
          ref.current?.focus(focusOptions);
        }
        showFrameComposer(wantShown.current);
      },
      onKeyDown(event) {
        event.key !== "Escape" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || composerState?.visible !== !0 || (escapeArmed.current = !escapeArmed.current, escapeArmed.current && (event.preventDefault(), showFrameComposer(!1)));
      },
      onBlur() {
        setTipShut(!1), escapeArmed.current = !1;
      },
      onPointerEnter: () => setTipShut(!1)
    }), []);
    return { heard, shown, pressed: pressed3, unread, tipShut, ref, handlers };
  }
  return bindRuntimeValue(runtime2, "FRAME_COMPOSER_COMMAND", () => FRAME_COMPOSER_COMMAND, (value) => {
    FRAME_COMPOSER_COMMAND = value;
  }), bindRuntimeValue(runtime2, "parseFrameComposerMessage", () => parseFrameComposerMessage), bindRuntimeValue(runtime2, "setFrameComposerState", () => setFrameComposerState), bindRuntimeValue(runtime2, "listenForFrameComposer", () => listenForFrameComposer), bindRuntimeValue(runtime2, "showFrameComposer", () => showFrameComposer), bindRuntimeValue(runtime2, "subscribeFrameComposer", () => subscribeFrameComposer), bindRuntimeValue(runtime2, "useFrameChatReleaseAt", () => useFrameChatReleaseAt), bindRuntimeValue(runtime2, "useFrameChat", () => useFrameChat), () => {
    ReactFrameComposer = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), FrameComposerReactDom = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), FRAME_COMPOSER_COMMAND = "__frame_composer", composerState = null, composerOrigin = null, composerFirstHeardAt = null, footInset = 0, composerListeners = /* @__PURE__ */ new Set(), typeof window < "u" && window.parent !== window && listenForFrameComposer(window), (0, runtime2.subscribeHostFootInset)((inset) => {
      footInset = inset, applyComposerInset();
    });
  };
}
export {
  installHostFrameComposer
};
