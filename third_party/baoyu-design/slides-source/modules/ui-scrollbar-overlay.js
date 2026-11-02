// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiScrollbarOverlay(runtime2) {
  var reactw8, reactU3, jsxRK0, HIDDEN_NATIVE_SCROLLBAR_CLASS, SCROLLBAR_WIDTH, SCROLLBAR_INSET, MIN_SCROLLBAR_THUMB_SIZE, SCROLLBAR_IDLE_HIDE_MS, SCROLLBAR_THUMB_CLASS;
  function scrollbarMetrics(target, now) {
    let { scrollHeight, clientHeight, scrollTop } = target, value = scrollHeight > clientHeight + 1, value2 = clientHeight, value3 = value ? Math.max(MIN_SCROLLBAR_THUMB_SIZE, Math.round(clientHeight / scrollHeight * value2)) : 0, value4 = value2 - value3, value5 = value ? Math.round(scrollTop / (scrollHeight - clientHeight) * value4) : 0, value6 = SCROLLBAR_INSET, index4 = 0;
    if (now) {
      let offsetParent = target.offsetParent;
      value6 = (offsetParent ? offsetParent.clientWidth : target.offsetWidth) - (target.offsetLeft + target.offsetWidth) + SCROLLBAR_INSET, index4 = target.offsetTop;
    } else {
      let value7 = getComputedStyle(target);
      value6 = SCROLLBAR_INSET - (parseFloat(value7.paddingRight) || 0), value5 -= clientHeight - (parseFloat(value7.paddingBottom) || 0);
    }
    return {
      top: value5,
      height: value3,
      right: value6,
      overflows: value,
      trackTop: index4
    };
  }
  function ScrollbarOverlay({ target, className }) {
    let ref = reactU3.useRef(null), ref2 = reactU3.useRef(null), [value, value2] = reactU3.useState(null), [value3, value4] = reactU3.useState(!1), [value5, value6] = reactU3.useState(!1), ref3 = reactU3.useRef(!1), ref4 = reactU3.useRef(null), ref5 = reactU3.useRef(null), callback = reactU3.useCallback(() => {
      ref5.current && clearTimeout(ref5.current), ref5.current = setTimeout(() => {
        ref5.current = null, !ref3.current && !ref4.current && value4(!1);
      }, SCROLLBAR_IDLE_HIDE_MS);
    }, []);
    reactU3.useEffect(() => {
      let value10 = target !== void 0, value11 = value10 ? target.current : ref.current?.parentElement ?? null;
      if (!value11)
        return;
      let index4 = 0, callback8 = () => {
        index4 || (index4 = requestAnimationFrame(() => {
          index4 = 0;
          let value14 = scrollbarMetrics(value11, value10);
          value2((input) => input && input.top === value14.top && input.height === value14.height && input.right === value14.right && input.overflows === value14.overflows && input.trackTop === value14.trackTop ? input : value14);
        }));
      }, callback9 = () => {
        callback8(), value4(!0), callback();
      }, callback10 = (event) => {
        let target2 = event.target, value14 = target2?.closest?.("[data-kit=overlay-scrollbar]") ?? null, value15 = (value14 && value14 !== ref.current ? null : target2?.closest?.("[data-overlay-scroller]") ?? null) === value11;
        ref3.current = value15, value15 ? (callback8(), value4(!0)) : ref4.current || value4(!1);
      }, callback11 = () => {
        ref3.current = !1, ref4.current || callback();
      };
      value11.setAttribute("data-overlay-scroller", ""), value11.addEventListener("scroll", callback9, {
        passive: !0
      }), value11.addEventListener("pointerover", callback10), value11.addEventListener("pointerleave", callback11);
      let value12 = typeof ResizeObserver == "function" ? new ResizeObserver(callback8) : null;
      value12?.observe(value11);
      let value13 = typeof MutationObserver == "function" ? new MutationObserver(callback8) : null;
      return value13?.observe(value11, {
        childList: !0,
        subtree: !0,
        characterData: !0
      }), value11.addEventListener("input", callback8), callback8(), () => {
        value11.removeAttribute("data-overlay-scroller"), value11.removeEventListener("scroll", callback9), value11.removeEventListener("pointerover", callback10), value11.removeEventListener("pointerleave", callback11), value11.removeEventListener("input", callback8), value12?.disconnect(), value13?.disconnect(), index4 && cancelAnimationFrame(index4), ref5.current && clearTimeout(ref5.current);
      };
    }, [target, callback]);
    let callback2 = () => target !== void 0 ? target.current : ref.current?.parentElement ?? null, callback3 = (event) => {
      if (event.button !== 0)
        return;
      let value10 = callback2();
      if (value10) {
        event.preventDefault(), event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
        }
        ref4.current = {
          startY: event.clientY,
          startTop: value10.scrollTop,
          pointerId: event.pointerId
        }, value6(!0), value4(!0);
      }
    }, callback4 = (input) => {
      let current = ref4.current, value10 = callback2();
      if (!current || !value10 || input.pointerId !== current.pointerId)
        return;
      let { scrollHeight: value11, clientHeight: value12 } = value10, value13 = value?.height ?? MIN_SCROLLBAR_THUMB_SIZE, value14 = value12 - value13;
      value14 <= 0 || (value10.scrollTop = current.startTop + (input.clientY - current.startY) * (value11 - value12) / value14);
    }, callback5 = (input) => {
      let current = ref4.current;
      !current || input.pointerId !== current.pointerId || (ref4.current = null, value6(!1), input.currentTarget.hasPointerCapture(input.pointerId) && input.currentTarget.releasePointerCapture(input.pointerId), ref3.current || callback());
    }, callback6 = () => {
      ref3.current = !0, value4(!0);
    }, callback7 = () => {
      ref3.current = !1, ref4.current || callback();
    }, value7 = value3 && value?.overflows === !0, value8 = target !== void 0, value9 = value ? jsxRK0.jsx("div", {
      ref: ref2,
      "data-kit": "overlay-scrollbar-thumb",
      "data-dragging": value5 ? "" : void 0,
      className: (0, runtime2.joinClassNames)("absolute cursor-default select-none", SCROLLBAR_THUMB_CLASS, !value7 && "pointer-events-none"),
      style: {
        width: SCROLLBAR_WIDTH,
        right: value.right,
        top: (value8 ? value.trackTop : 0) + value.top,
        height: value.height,
        opacity: value7 ? 1 : 0
      },
      onPointerEnter: callback6,
      onPointerLeave: callback7,
      onPointerDown: callback3,
      onPointerMove: callback4,
      onPointerUp: callback5,
      onPointerCancel: callback5
    }) : null;
    return jsxRK0.jsx("div", {
      ref,
      "aria-hidden": "true",
      "data-kit": "overlay-scrollbar",
      className: (0, runtime2.joinClassNames)(value8 ? "contents" : "sticky bottom-0 z-10 h-0 w-full shrink-0 overflow-visible", className),
      children: value9
    });
  }
  return bindRuntimeValue(runtime2, "reactw8", () => reactw8, (value) => {
    reactw8 = value;
  }), bindRuntimeValue(runtime2, "reactU3", () => reactU3, (value) => {
    reactU3 = value;
  }), bindRuntimeValue(runtime2, "jsxRK0", () => jsxRK0, (value) => {
    jsxRK0 = value;
  }), bindRuntimeValue(runtime2, "HIDDEN_NATIVE_SCROLLBAR_CLASS", () => HIDDEN_NATIVE_SCROLLBAR_CLASS, (value) => {
    HIDDEN_NATIVE_SCROLLBAR_CLASS = value;
  }), bindRuntimeValue(runtime2, "SCROLLBAR_WIDTH", () => SCROLLBAR_WIDTH, (value) => {
    SCROLLBAR_WIDTH = value;
  }), bindRuntimeValue(runtime2, "SCROLLBAR_INSET", () => SCROLLBAR_INSET, (value) => {
    SCROLLBAR_INSET = value;
  }), bindRuntimeValue(runtime2, "MIN_SCROLLBAR_THUMB_SIZE", () => MIN_SCROLLBAR_THUMB_SIZE, (value) => {
    MIN_SCROLLBAR_THUMB_SIZE = value;
  }), bindRuntimeValue(runtime2, "SCROLLBAR_IDLE_HIDE_MS", () => SCROLLBAR_IDLE_HIDE_MS, (value) => {
    SCROLLBAR_IDLE_HIDE_MS = value;
  }), bindRuntimeValue(runtime2, "SCROLLBAR_THUMB_CLASS", () => SCROLLBAR_THUMB_CLASS, (value) => {
    SCROLLBAR_THUMB_CLASS = value;
  }), bindRuntimeValue(runtime2, "scrollbarMetrics", () => scrollbarMetrics), bindRuntimeValue(runtime2, "ScrollbarOverlay", () => ScrollbarOverlay), () => {
    (0, runtime2.initializeSlideRenderer)(), reactw8 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeFontCatalog)(), (0, runtime2.initializeUiPropertyPopover2)(), reactU3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxRK0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), HIDDEN_NATIVE_SCROLLBAR_CLASS = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden", SCROLLBAR_WIDTH = 6, SCROLLBAR_INSET = 2, MIN_SCROLLBAR_THUMB_SIZE = 24, SCROLLBAR_IDLE_HIDE_MS = 800, SCROLLBAR_THUMB_CLASS = "rounded-full bg-alpha-3 hover:bg-alpha-4 data-[dragging]:bg-alpha-4 transition-opacity duration-150 motion-reduce:transition-none touch-none";
  };
}
export {
  installUiScrollbarOverlay
};
