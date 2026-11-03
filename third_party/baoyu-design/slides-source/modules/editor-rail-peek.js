// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorRailPeek(runtime2) {
  var ReactRailPeek, RAIL_PEEK_CLOSE_DELAY_MS, RAIL_PEEK_ATTRIBUTE, RAIL_PEEK_SELECTOR, RAIL_PEEK_HOVER_SELECTOR;
  function useRailPeek(enabled, onClose) {
    let [open4, setOpen] = ReactRailPeek.useState(!1), closeTimerRef = ReactRailPeek.useRef(void 0), heldRef = ReactRailPeek.useRef(!1), releaseHoldRef = ReactRailPeek.useRef(() => {
    }), draggingRef = ReactRailPeek.useRef(!1), onCloseRef = ReactRailPeek.useRef(onClose);
    onCloseRef.current = onClose;
    let cancelClose = ReactRailPeek.useCallback(() => {
      window.clearTimeout(closeTimerRef.current), closeTimerRef.current = void 0;
    }, []), close = ReactRailPeek.useCallback(() => {
      cancelClose(), setOpen(!1);
    }, [cancelClose]), closeWhenIdle = ReactRailPeek.useCallback(() => {
      if (draggingRef.current || document.querySelector("[data-mc-menu]") !== null) {
        closeTimerRef.current = window.setTimeout(closeWhenIdle, RAIL_PEEK_CLOSE_DELAY_MS);
        return;
      }
      closeTimerRef.current = void 0, document.querySelector(RAIL_PEEK_HOVER_SELECTOR) === null && (onCloseRef.current?.(), setOpen(!1));
    }, []), scheduleClose = ReactRailPeek.useCallback(() => {
      cancelClose(), closeTimerRef.current = window.setTimeout(closeWhenIdle, RAIL_PEEK_CLOSE_DELAY_MS);
    }, [cancelClose, closeWhenIdle]), openRef = ReactRailPeek.useRef(!1);
    openRef.current = open4, ReactRailPeek.useEffect(() => {
      enabled || (openRef.current && onCloseRef.current?.(), close());
    }, [enabled, close]), ReactRailPeek.useEffect(() => () => {
      cancelClose(), releaseHoldRef.current();
    }, [cancelClose]);
    let holdUntilLeave = ReactRailPeek.useCallback(() => {
      heldRef.current = !0, releaseHoldRef.current();
      let callback = (event) => {
        event.target instanceof Element && event.target.closest("[data-slides-rail-show]") !== null || (heldRef.current = !1, releaseHoldRef.current());
      };
      window.addEventListener("pointermove", callback, !0), releaseHoldRef.current = () => window.removeEventListener("pointermove", callback, !0);
    }, []);
    ReactRailPeek.useEffect(() => {
      if (!open4)
        return;
      let onKeyDown = (event) => {
        event.key !== "Escape" || event.defaultPrevented || event.isComposing || document.querySelector("[data-mc-menu]") !== null || (onCloseRef.current?.(), holdUntilLeave(), close());
      }, onPointerOut = (event) => {
        event.pointerType === "mouse" && event.relatedTarget === null && scheduleClose();
      }, onPointerMove = (event) => {
        event.pointerType !== "mouse" || event.buttons !== 0 || (draggingRef.current = !1, closeTimerRef.current === void 0 && (!(event.target instanceof Element) || event.target.closest(RAIL_PEEK_SELECTOR + ", [data-mc-menu]") === null) && scheduleClose());
      }, onDragStart = () => {
        draggingRef.current = !0;
      }, onDragEnd = () => {
        draggingRef.current = !1, cancelClose();
      };
      return window.addEventListener("keydown", onKeyDown), window.addEventListener("pointerout", onPointerOut, !0), window.addEventListener("pointermove", onPointerMove, !0), window.addEventListener("dragstart", onDragStart, !0), window.addEventListener("dragend", onDragEnd, !0), () => {
        window.removeEventListener("keydown", onKeyDown), window.removeEventListener("pointerout", onPointerOut, !0), window.removeEventListener("pointermove", onPointerMove, !0), window.removeEventListener("dragstart", onDragStart, !0), window.removeEventListener("dragend", onDragEnd, !0), draggingRef.current;
      };
    }, [open4, close, scheduleClose, cancelClose, holdUntilLeave]);
    let leftThePeek = (event) => !(event.relatedTarget instanceof Element && event.relatedTarget.closest(RAIL_PEEK_SELECTOR) !== null);
    return {
      peeking: open4 && enabled,
      trigger: {
        onPointerEnter: (event) => {
          event.pointerType !== "mouse" || !enabled || (cancelClose(), heldRef.current || setOpen(!0));
        },
        onPointerLeave: (event) => {
          event.pointerType === "mouse" && (heldRef.current = !1, open4 && leftThePeek(event) && scheduleClose());
        }
      },
      panel: {
        onPointerEnter: (event) => {
          event.pointerType === "mouse" && cancelClose();
        },
        onPointerLeave: (event) => {
          event.pointerType === "mouse" && open4 && leftThePeek(event) && scheduleClose();
        }
      },
      close,
      holdUntilLeave
    };
  }
  return bindRuntimeValue(runtime2, "ReactRailPeek", () => ReactRailPeek, (value) => {
    ReactRailPeek = value;
  }), bindRuntimeValue(runtime2, "RAIL_PEEK_CLOSE_DELAY_MS", () => RAIL_PEEK_CLOSE_DELAY_MS, (value) => {
    RAIL_PEEK_CLOSE_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "RAIL_PEEK_ATTRIBUTE", () => RAIL_PEEK_ATTRIBUTE, (value) => {
    RAIL_PEEK_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "RAIL_PEEK_SELECTOR", () => RAIL_PEEK_SELECTOR, (value) => {
    RAIL_PEEK_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "RAIL_PEEK_HOVER_SELECTOR", () => RAIL_PEEK_HOVER_SELECTOR, (value) => {
    RAIL_PEEK_HOVER_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "useRailPeek", () => useRailPeek), () => {
    ReactRailPeek = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), RAIL_PEEK_CLOSE_DELAY_MS = 180, RAIL_PEEK_ATTRIBUTE = "data-slides-peek", RAIL_PEEK_SELECTOR = "[" + RAIL_PEEK_ATTRIBUTE + "], .tb-card:has([" + RAIL_PEEK_ATTRIBUTE + "])", RAIL_PEEK_HOVER_SELECTOR = "[" + RAIL_PEEK_ATTRIBUTE + "]:hover, .tb-card:has([" + RAIL_PEEK_ATTRIBUTE + "]):hover";
  };
}
export {
  installEditorRailPeek
};
