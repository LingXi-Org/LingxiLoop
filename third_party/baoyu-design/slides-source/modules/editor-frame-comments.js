// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorFrameComments(runtime2) {
  var ReactFrameComments, FrameCommentsJsx, FRAME_COMMENTS_MESSAGE_KEY, FRAME_COMMENTS_REQUEST_KEY, EMPTY_FRAME_COMMENTS_STATE, MAX_FRAME_COMMENT_COUNT, frameCommentsState, frameCommentsOrigin, frameCommentsListeners, clampFrameCommentCount, toggleFrameComments, FRAME_COMMENT_FOCUS_RETURN_MS, COMMENT_ICON2, COMMENT_FILLED_ICON, CommentButtonOnScreenContext;
  function parseFrameCommentsMessage(data) {
    if (typeof data != "object" || data === null)
      return null;
    let record = data;
    return record[FRAME_COMMENTS_MESSAGE_KEY] !== !0 ? null : {
      offered: record.offered === !0,
      available: record.available === !0,
      on: record.on === !0,
      listOpen: record.listOpen === !0,
      count: clampFrameCommentCount(record.count)
    };
  }
  function setFrameCommentsState(state, origin) {
    if (frameCommentsOrigin = origin, JSON.stringify(state) !== JSON.stringify(frameCommentsState)) {
      frameCommentsState = state;
      for (let listener of frameCommentsListeners)
        listener();
    }
  }
  function listenForFrameComments(ownWindow) {
    let onMessage = (event) => {
      if (event.source !== ownWindow.parent || !(0, runtime2.isAllowedHostMessageOrigin)(event.origin))
        return;
      let state = parseFrameCommentsMessage(event.data);
      state !== null && setFrameCommentsState(state, event.origin);
    };
    return ownWindow.addEventListener("message", onMessage), () => ownWindow.removeEventListener("message", onMessage);
  }
  function requestFrameCommentsShown(show) {
    frameCommentsOrigin !== null && (0, runtime2.postToHost)({
      [FRAME_COMMENTS_REQUEST_KEY]: !0,
      show
    }, window, [frameCommentsOrigin], !0);
  }
  function subscribeFrameComments(listener) {
    return frameCommentsListeners.add(listener), () => frameCommentsListeners.delete(listener);
  }
  function useFrameCommentsOffered() {
    return ReactFrameComments.useSyncExternalStore(subscribeFrameComments, () => frameCommentsState.offered && frameCommentsState.available, () => !1);
  }
  function useFrameComments() {
    return {
      ...ReactFrameComments.useSyncExternalStore(subscribeFrameComments, () => frameCommentsState, () => EMPTY_FRAME_COMMENTS_STATE),
      toggle: toggleFrameComments,
      show: requestFrameCommentsShown
    };
  }
  function useFrameCommentsFootReport(active) {
    ReactFrameComments.useEffect(() => {
      if (!active || frameCommentsOrigin === null)
        return;
      let origins = [frameCommentsOrigin], unsubscribe = (0, runtime2.subscribeHostFootInset)((footPx) => (0, runtime2.postToHost)({
        [FRAME_COMMENTS_REQUEST_KEY]: !0,
        drawn: !0,
        footPx: Math.round(footPx)
      }, window, origins));
      return () => {
        unsubscribe(), (0, runtime2.postToHost)({
          [FRAME_COMMENTS_REQUEST_KEY]: !0,
          drawn: !1
        }, window, origins);
      };
    }, [active]);
  }
  function useCommentButtonShown() {
    let offered = useFrameCommentsOffered(), smallTouch = (0, runtime2.useSmallCoarsePointer)(), quiet = ReactFrameComments.useContext(runtime2.ToolbarQuietContext);
    return offered && !smallTouch && !quiet;
  }
  function useFocusReturnTip(open4) {
    let [returned, setReturned] = ReactFrameComments.useState(!1), cancelPending = ReactFrameComments.useRef(() => {
    });
    return ReactFrameComments.useEffect(() => {
      if (!open4)
        return;
      cancelPending.current();
      let pressed3 = !1, focusedAt = -1 / 0, ownWindow = window, onPointerDown = () => void (pressed3 = !0), onFocus = () => void (focusedAt = performance.now());
      return document.addEventListener("pointerdown", onPointerDown, !0), ownWindow.addEventListener("focus", onFocus, {
        capture: !0
      }), () => {
        if (document.removeEventListener("pointerdown", onPointerDown, !0), ownWindow.removeEventListener("focus", onFocus, {
          capture: !0
        }), pressed3)
          return;
        let check = () => {
          let active = document.activeElement;
          document.hasFocus() && (active === null || active === document.body) && setReturned(!0);
        };
        performance.now() - focusedAt <= FRAME_COMMENT_FOCUS_RETURN_MS && check(), cancelPending.current = () => ownWindow.removeEventListener("focus", check, {
          capture: !0
        }), ownWindow.addEventListener("focus", check, {
          capture: !0,
          once: !0
        }), setTimeout(cancelPending.current, FRAME_COMMENT_FOCUS_RETURN_MS);
      };
    }, [open4]), [returned, () => setReturned(!1)];
  }
  function deferCommentFootPress(target, run) {
    return target.closest("[data-tb-foot]:has([data-comment-button])") === null ? !1 : (target.closest("[data-comment-pass]") === null && runAfterFootClick(target.ownerDocument, run), !0);
  }
  function runAfterFootClick(ownDocument, run) {
    let controller = new AbortController(), options = {
      once: !0,
      signal: controller.signal
    };
    ownDocument.addEventListener("click", () => {
      controller.abort(), run();
    }, options), ownDocument.addEventListener("pointercancel", () => controller.abort(), {
      ...options,
      capture: !0
    }), ownDocument.addEventListener("pointerdown", () => controller.abort(), {
      ...options,
      capture: !0
    }), ownDocument.addEventListener("keydown", () => controller.abort(), {
      ...options,
      capture: !0
    });
  }
  function FrameCommentButton({ onScreen = !0, icons, disabled: disabled2 = !1, disabledTip, buttonRef }) {
    let shown = useCommentButtonShown(), { on, listOpen, count, toggle } = useFrameComments(), reportFoot = ReactFrameComments.useContext(CommentButtonOnScreenContext);
    useFrameCommentsFootReport(onScreen && reportFoot && shown);
    let open4 = on || listOpen, ownRef = ReactFrameComments.useRef(null), ref = buttonRef ?? ownRef, [returned, clearReturned] = useFocusReturnTip(open4);
    ReactFrameComments.useEffect(() => {
      returned && ref.current?.focus({
        focusVisible: !0
      });
    }, [returned, ref]);
    let onClick = (event) => {
      (0, runtime2.isKeyboardOrPrimaryActivation)(event) && !open4 && ref.current?.blur(), toggle();
    };
    return shown ? FrameCommentsJsx.jsx(runtime2.ToolbarButton, {
      ref,
      iconOnly: !0,
      icon: open4 ? icons?.open ?? COMMENT_FILLED_ICON : icons?.rest ?? COMMENT_ICON2,
      label: "评论",
      tipSide: "top",
      tipShut: returned,
      pressed: open4,
      count,
      onClick,
      disabled: disabled2,
      disabledTip,
      onBlur: clearReturned,
      onPointerEnter: clearReturned,
      "data-comment-button": "",
      "data-comment-pass": "",
      "data-uncommentable": ""
    }) : null;
  }
  function ToolbarCommentTools({ lastTool, onScreen = !0 }) {
    return FrameCommentsJsx.jsxs(FrameCommentsJsx.Fragment, {
      children: [
        FrameCommentsJsx.jsx(FrameCommentButton, {
          onScreen
        }),
        lastTool
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ReactFrameComments", () => ReactFrameComments, (value) => {
    ReactFrameComments = value;
  }), bindRuntimeValue(runtime2, "FrameCommentsJsx", () => FrameCommentsJsx, (value) => {
    FrameCommentsJsx = value;
  }), bindRuntimeValue(runtime2, "FRAME_COMMENTS_MESSAGE_KEY", () => FRAME_COMMENTS_MESSAGE_KEY, (value) => {
    FRAME_COMMENTS_MESSAGE_KEY = value;
  }), bindRuntimeValue(runtime2, "FRAME_COMMENTS_REQUEST_KEY", () => FRAME_COMMENTS_REQUEST_KEY, (value) => {
    FRAME_COMMENTS_REQUEST_KEY = value;
  }), bindRuntimeValue(runtime2, "EMPTY_FRAME_COMMENTS_STATE", () => EMPTY_FRAME_COMMENTS_STATE, (value) => {
    EMPTY_FRAME_COMMENTS_STATE = value;
  }), bindRuntimeValue(runtime2, "MAX_FRAME_COMMENT_COUNT", () => MAX_FRAME_COMMENT_COUNT, (value) => {
    MAX_FRAME_COMMENT_COUNT = value;
  }), bindRuntimeValue(runtime2, "frameCommentsState", () => frameCommentsState, (value) => {
    frameCommentsState = value;
  }), bindRuntimeValue(runtime2, "frameCommentsOrigin", () => frameCommentsOrigin, (value) => {
    frameCommentsOrigin = value;
  }), bindRuntimeValue(runtime2, "frameCommentsListeners", () => frameCommentsListeners, (value) => {
    frameCommentsListeners = value;
  }), bindRuntimeValue(runtime2, "clampFrameCommentCount", () => clampFrameCommentCount, (value) => {
    clampFrameCommentCount = value;
  }), bindRuntimeValue(runtime2, "parseFrameCommentsMessage", () => parseFrameCommentsMessage), bindRuntimeValue(runtime2, "setFrameCommentsState", () => setFrameCommentsState), bindRuntimeValue(runtime2, "listenForFrameComments", () => listenForFrameComments), bindRuntimeValue(runtime2, "requestFrameCommentsShown", () => requestFrameCommentsShown), bindRuntimeValue(runtime2, "subscribeFrameComments", () => subscribeFrameComments), bindRuntimeValue(runtime2, "toggleFrameComments", () => toggleFrameComments, (value) => {
    toggleFrameComments = value;
  }), bindRuntimeValue(runtime2, "useFrameCommentsOffered", () => useFrameCommentsOffered), bindRuntimeValue(runtime2, "useFrameComments", () => useFrameComments), bindRuntimeValue(runtime2, "useFrameCommentsFootReport", () => useFrameCommentsFootReport), bindRuntimeValue(runtime2, "FRAME_COMMENT_FOCUS_RETURN_MS", () => FRAME_COMMENT_FOCUS_RETURN_MS, (value) => {
    FRAME_COMMENT_FOCUS_RETURN_MS = value;
  }), bindRuntimeValue(runtime2, "useCommentButtonShown", () => useCommentButtonShown), bindRuntimeValue(runtime2, "useFocusReturnTip", () => useFocusReturnTip), bindRuntimeValue(runtime2, "COMMENT_ICON", () => COMMENT_ICON2, (value) => {
    COMMENT_ICON2 = value;
  }), bindRuntimeValue(runtime2, "COMMENT_FILLED_ICON", () => COMMENT_FILLED_ICON, (value) => {
    COMMENT_FILLED_ICON = value;
  }), bindRuntimeValue(runtime2, "deferCommentFootPress", () => deferCommentFootPress), bindRuntimeValue(runtime2, "runAfterFootClick", () => runAfterFootClick), bindRuntimeValue(runtime2, "CommentButtonOnScreenContext", () => CommentButtonOnScreenContext, (value) => {
    CommentButtonOnScreenContext = value;
  }), bindRuntimeValue(runtime2, "FrameCommentButton", () => FrameCommentButton), bindRuntimeValue(runtime2, "ToolbarCommentTools", () => ToolbarCommentTools), () => {
    ReactFrameComments = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), FRAME_COMMENTS_MESSAGE_KEY = "__frame_comments", FRAME_COMMENTS_REQUEST_KEY = "__frame_comments_request", EMPTY_FRAME_COMMENTS_STATE = {
      offered: !1,
      available: !1,
      on: !1,
      listOpen: !1,
      count: 0
    }, MAX_FRAME_COMMENT_COUNT = 9999, frameCommentsState = EMPTY_FRAME_COMMENTS_STATE, frameCommentsOrigin = null, frameCommentsListeners = /* @__PURE__ */ new Set(), clampFrameCommentCount = (value) => typeof value == "number" && Number.isFinite(value) ? Math.min(MAX_FRAME_COMMENT_COUNT, Math.max(0, Math.round(value))) : 0, typeof window < "u" && window.parent !== window && listenForFrameComments(window), toggleFrameComments = () => requestFrameCommentsShown(!(frameCommentsState.on || frameCommentsState.listOpen)), FrameCommentsJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FRAME_COMMENT_FOCUS_RETURN_MS = 500, COMMENT_ICON2 = "Comment", COMMENT_FILLED_ICON = "CommentFilled", CommentButtonOnScreenContext = ReactFrameComments.createContext(!0);
  };
}
export {
  installEditorFrameComments
};
