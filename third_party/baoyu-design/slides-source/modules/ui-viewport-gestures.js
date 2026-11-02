// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiViewportGestures(runtime2) {
  var POINTER_STALE_TIMEOUT_MS, SAFARI_GESTURE_WHEEL_SUPPRESSION_MS, SAFARI_GESTURE_EVENTS, TOUCH_COUNT_EVENTS, activeViewportGestures, activeTouchCount, isReroutingViewportEvent, updateTouchCount, viewportGestureElementAtPoint, rerouteViewportWheelEvent, rerouteSafariGestureEvent, registerViewportGestureHandlers;
  function zoomViewportAt(viewport, localX, localY, zoomFactor, limits) {
    let value = Math.min(limits?.maxScale ?? 40, Math.max(limits?.minScale ?? 0.05, viewport.scale * zoomFactor));
    if (value === viewport.scale)
      return viewport;
    let value2 = viewport.x + localX / viewport.scale, value3 = viewport.y + localY / viewport.scale;
    return {
      x: value2 - localX / value,
      y: value3 - localY / value,
      scale: value
    };
  }
  function panViewport(viewport, deltaX, deltaY) {
    return deltaX === 0 && deltaY === 0 ? viewport : {
      x: viewport.x - deltaX / viewport.scale,
      y: viewport.y - deltaY / viewport.scale,
      scale: viewport.scale
    };
  }
  function wheelZoomFactor(deltaY) {
    return Math.min(1.25, Math.max(0.8, Math.exp(-deltaY * 0.01)));
  }
  function createWheelGestureDecision(idleMs = 200) {
    let value, value2 = -1 / 0;
    return {
      decide(input, options, context, value3) {
        if (options)
          return value = void 0, value2 = input, "zoom";
        if (input - value2 > idleMs && (value = void 0), value2 = input, value === void 0) {
          if (!context)
            return "consume";
          value = value3() ? "native" : "pan";
        }
        return value;
      }
    };
  }
  function attachViewportGestures(options) {
    let element = options.element, touchAction = element.style.touchAction;
    element.style.touchAction = "none";
    let callback = () => {
      element.scrollLeft !== 0 && (element.scrollLeft = 0), element.scrollTop !== 0 && (element.scrollTop = 0);
    };
    callback(), element.addEventListener("scroll", callback, {
      passive: !0
    });
    let entries = /* @__PURE__ */ new Map(), callback2 = (input) => {
      let value7 = input ?? null, value8 = element;
      for (; value7 && value7 !== value8; ) {
        let tagName = value7.tagName;
        if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA" || value7.isContentEditable === !0)
          return !0;
        if (tagName !== void 0) {
          let value9;
          try {
            value9 = window.getComputedStyle(value7);
          } catch {
            value9 = void 0;
          }
          if (value9) {
            let value10 = (value9.overflowY === "auto" || value9.overflowY === "scroll") && (value7.scrollHeight ?? 0) > (value7.clientHeight ?? 0), value11 = (value9.overflowX === "auto" || value9.overflowX === "scroll") && (value7.scrollWidth ?? 0) > (value7.clientWidth ?? 0);
            if (value10 || value11)
              return !0;
          }
        }
        value7 = value7.parentElement ?? null;
      }
      return !1;
    }, callback3 = (input) => {
      let changedTouches = input.changedTouches;
      for (let index22 = 0; index22 < (changedTouches?.length ?? 0); index22++) {
        let value7 = changedTouches[index22];
        value7 && entries.set(value7.identifier, !callback2(value7.target));
      }
    }, callback4 = (event) => {
      if (!event.cancelable)
        return;
      let changedTouches = event.changedTouches, value7 = changedTouches?.length ?? 0;
      if (value7 !== 0) {
        for (let index22 = 0; index22 < value7; index22++) {
          let value8 = changedTouches[index22];
          if (!value8 || entries.get(value8.identifier) !== !0)
            return;
        }
        event.preventDefault();
      }
    }, callback5 = (input) => {
      let changedTouches = input.changedTouches;
      for (let index22 = 0; index22 < (changedTouches?.length ?? 0); index22++) {
        let value7 = changedTouches[index22];
        value7 && entries.delete(value7.identifier);
      }
    }, value = createWheelGestureDecision(), entries2 = /* @__PURE__ */ new Map(), value2, entries3 = /* @__PURE__ */ new Map(), value3, value4, callback6 = () => {
      if (value3 !== void 0)
        return;
      let style = element.style;
      style && (value3 = style.userSelect ?? "", value4 = style.webkitUserSelect ?? "", style.webkitUserSelect = "none", style.userSelect = "none");
    }, callback7 = () => {
      if (value3 === void 0)
        return;
      let style = element.style;
      style && (style.userSelect = value3, style.webkitUserSelect = value4 ?? ""), value3 = void 0, value4 = void 0;
    }, flag = !1, index4 = 0, count = 1, entries4 = /* @__PURE__ */ new Map(), callback8 = (input) => {
      for (let [value7, value8] of entries4)
        input - value8 > POINTER_STALE_TIMEOUT_MS && entries4.delete(value7);
    }, callback9 = () => {
      let index22 = 0;
      for (let value7 of entries2.values())
        value7.type === "touch" && (index22 += 1);
      return index22 >= 2;
    }, callback10 = (input) => {
      let index22 = 0, index32 = 0;
      for (let value7 of entries2.values())
        value7.type === "touch" && (index22 += 1, input - value7.lastSeen <= POINTER_STALE_TIMEOUT_MS && (index32 += 1));
      return index22 >= 2 && index32 >= 1;
    }, value5, count2 = 1, flag2 = !1, callback11 = (input, options2) => {
      let bounds = element.getBoundingClientRect();
      return {
        sx: input - bounds.left,
        sy: options2 - bounds.top
      };
    }, callback12 = (event) => {
      let value7 = event.ctrlKey || event.metaKey;
      if (flag && event.timeStamp - index4 <= SAFARI_GESTURE_WHEEL_SUPPRESSION_MS) {
        event.preventDefault();
        return;
      }
      let value8 = value.decide(event.timeStamp, value7, event.deltaX !== 0 || event.deltaY !== 0, () => options.allowNativeScroll?.(event) ?? !1);
      if (value8 === "native" || (event.preventDefault(), value8 === "consume"))
        return;
      let value9 = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1, value10 = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1;
      if (value8 === "zoom") {
        let { sx: value11, sy: value12 } = callback11(event.clientX, event.clientY);
        options.setView(zoomViewportAt(options.getView(), value11, value12, wheelZoomFactor(event.deltaY * value9), options.limits));
      } else
        options.setView(panViewport(options.getView(), -event.deltaX * value10, -event.deltaY * value9));
    }, callback13 = () => {
      flag2 && entries2.size === 0 && (flag2 = !1, callback7(), options.onGestureEnd?.());
    }, callback14 = (event) => {
      if (options.shouldPan)
        return options.shouldPan(event);
      let target = event.target;
      for (; target; ) {
        let tagName = target.tagName;
        if (tagName === "BUTTON" || tagName === "A" || tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA" || target.getAttribute?.("role") === "slider" || target.hasAttribute?.("data-no-pan"))
          return !1;
        target = target.parentElement;
      }
      return !0;
    }, callback15 = (input) => {
      if (value2 = void 0, entries2.size === 1) {
        let value7 = entries2.values().next().value?.type, flag3 = !1;
        for (let [value8, value9] of entries3)
          if (value9.type === value7 && (entries3.delete(value8), !(input - value9.lastSeen > POINTER_STALE_TIMEOUT_MS))) {
            entries2.set(value8, value9), value5 = void 0, flag3 = !0;
            break;
          }
        flag3 || (value5 = [...entries2.keys()][0]);
      }
      callback13();
    }, callback16 = (input) => {
      entries3.delete(input.pointerId), entries4.delete(input.pointerId);
      let value7 = entries2.delete(input.pointerId);
      value7 && value5 === input.pointerId && (value5 = void 0);
      let flag3 = !1;
      if (input.isPrimary && input.button === 0) {
        for (let [value8, value9] of entries2)
          value9.type === input.pointerType && (entries2.delete(value8), flag3 = !0);
        for (let [value8, value9] of entries3)
          value9.type === input.pointerType && entries3.delete(value8);
        input.pointerType === "touch" && entries4.clear(), value5 !== void 0 && !entries2.has(value5) && (value5 = void 0);
      }
      (value7 || flag3) && callback15(input.timeStamp);
    }, callback17 = (input) => {
      for (let value7 = input; value7 && value7 !== element; value7 = value7.parentElement ?? null)
        if (value7.tagName === "INPUT" || value7.tagName === "TEXTAREA" || value7.tagName === "SELECT" || value7.isContentEditable === !0)
          return !0;
      return !1;
    }, callback18 = (event) => {
      if (!(event.button !== 0 && event.button !== 1 && !(event.button === 2 && options.panSecondaryButton)) && !(event.button === 1 && callback17(event.target))) {
        if (entries2.size > 0) {
          let values = /* @__PURE__ */ new Set();
          for (let value8 of entries2.values())
            values.add(value8.type);
          for (let value8 of values) {
            let flag3 = !0;
            for (let value9 of entries2.values())
              if (value9.type === value8 && event.timeStamp - value9.lastSeen <= POINTER_STALE_TIMEOUT_MS) {
                flag3 = !1;
                break;
              }
            if (flag3) {
              for (let value9 of entries3.values())
                if (value9.type === value8 && event.timeStamp - value9.lastSeen <= POINTER_STALE_TIMEOUT_MS) {
                  flag3 = !1;
                  break;
                }
            }
            if (flag3 && value8 !== event.pointerType) {
              for (let [value9, value10] of entries2)
                value10.type === value8 && (entries2.delete(value9), value5 === value9 && (value5 = void 0));
              for (let [value9, value10] of entries3)
                value10.type === value8 && entries3.delete(value9);
            }
          }
          callback9() || (value2 = void 0), callback13();
          let value7 = entries2.values().next().value?.type;
          if (value7 !== void 0 && value7 !== event.pointerType)
            return;
        }
        if (entries2.size === 0) {
          if (!callback14(event)) {
            event.pointerType === "touch" && options.shouldPan && entries4.set(event.pointerId, event.timeStamp);
            return;
          }
          value5 = event.pointerId, count2 = event.button === 1 ? 4 : event.button === 2 ? 2 : 1, event.button === 1 && event.preventDefault(), callback6();
        } else {
          if (event.pointerType !== "touch")
            return;
          if (!callback14(event)) {
            options.shouldPan && entries4.set(event.pointerId, event.timeStamp);
            return;
          }
          if (entries2.size >= 2) {
            entries3.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
              type: event.pointerType,
              lastSeen: event.timeStamp
            });
            return;
          }
          value5 = void 0;
        }
        entries2.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          type: event.pointerType,
          lastSeen: event.timeStamp
        }), flag2 = !0;
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
        }
      }
    }, callback19 = (input) => {
      entries4.has(input.pointerId) && entries4.set(input.pointerId, input.timeStamp);
      let entry = entries3.get(input.pointerId);
      if (entry) {
        entries3.set(input.pointerId, {
          x: input.clientX,
          y: input.clientY,
          type: entry.type,
          lastSeen: input.timeStamp
        });
        return;
      }
      let entry2 = entries2.get(input.pointerId);
      if (entry2) {
        if (input.pointerType !== "touch" && !(input.buttons & count2)) {
          callback20(input);
          return;
        }
        if (entries2.size === 2) {
          let value7 = [...entries2.entries()].find(([input2]) => input2 !== input.pointerId);
          if (value7) {
            let [, value8] = value7, value9 = Math.hypot(input.clientX - value8.x, input.clientY - value8.y), state = {
              x: (entry2.x + value8.x) / 2,
              y: (entry2.y + value8.y) / 2
            }, state2 = {
              x: (input.clientX + value8.x) / 2,
              y: (input.clientY + value8.y) / 2
            };
            (!value2 || value2.dist <= 0) && (value2 = {
              dist: Math.hypot(entry2.x - value8.x, entry2.y - value8.y),
              scale: options.getView().scale
            });
            let value10 = panViewport(options.getView(), state2.x - state.x, state2.y - state.y);
            if (value2.dist > 0 && value9 > 0) {
              let value11 = value2.scale * (value9 / value2.dist);
              if (value11 !== value10.scale) {
                let { sx: value12, sy: value13 } = callback11(state2.x, state2.y);
                value10 = zoomViewportAt(value10, value12, value13, value11 / value10.scale, options.limits);
              }
            }
            options.setView(value10);
          }
        } else
          input.pointerId === value5 && options.setView(panViewport(options.getView(), input.clientX - entry2.x, input.clientY - entry2.y));
        entries2.set(input.pointerId, {
          x: input.clientX,
          y: input.clientY,
          type: entry2.type,
          lastSeen: input.timeStamp
        });
      }
    }, callback20 = (input) => {
      entries4.delete(input.pointerId), entries3.delete(input.pointerId), entries2.has(input.pointerId) && (entries2.delete(input.pointerId), input.pointerId === value5 && (value5 = void 0), callback15(input.timeStamp));
    }, callback21 = (event) => {
      event.preventDefault(), flag = !0, index4 = typeof event.timeStamp == "number" ? event.timeStamp : 0, count = options.getView().scale, value.decide(typeof event.timeStamp == "number" ? event.timeStamp : 0, !0, !0, () => !1);
    }, callback22 = (event) => {
      if (event.preventDefault(), !flag || !event.scale)
        return;
      if (index4 = typeof event.timeStamp == "number" ? event.timeStamp : 0, callback8(index4), callback10(index4) || entries4.size > 0) {
        count = options.getView().scale / event.scale;
        return;
      }
      let value7 = options.getView(), value8 = count * event.scale;
      if (value8 === value7.scale)
        return;
      let { sx: value9, sy: value10 } = callback11(event.clientX ?? 0, event.clientY ?? 0);
      options.setView(zoomViewportAt(value7, value9, value10, value8 / value7.scale, options.limits));
    }, callback23 = (event) => {
      event.preventDefault(), flag = !1;
    }, callback24 = (event) => {
      (value5 !== void 0 || entries2.size > 0) && event.preventDefault();
    }, callback25 = (event) => {
      event.button === 1 && value5 !== void 0 && count2 === 4 && event.preventDefault();
    };
    element.addEventListener("dragstart", callback24), element.addEventListener("mousedown", callback25), element.addEventListener("touchstart", callback3, {
      passive: !0
    }), element.addEventListener("touchmove", callback4, {
      passive: !1
    }), element.addEventListener("touchend", callback5, {
      passive: !0
    }), element.addEventListener("touchcancel", callback5, {
      passive: !0
    }), element.addEventListener("wheel", callback12, {
      passive: !1
    }), window.addEventListener("pointerdown", callback16, !0), element.addEventListener("pointerdown", callback18), element.addEventListener("gesturestart", callback21, {
      passive: !1
    }), element.addEventListener("gesturechange", callback22, {
      passive: !1
    }), element.addEventListener("gestureend", callback23, {
      passive: !1
    }), window.addEventListener("pointermove", callback19), window.addEventListener("pointerup", callback20), window.addEventListener("pointercancel", callback20);
    let value6 = registerViewportGestureHandlers(element, {
      gesturestart: callback21,
      gesturechange: callback22,
      gestureend: callback23
    });
    return {
      release(input) {
        let entry = entries2.get(input);
        if (entry === void 0 || entries2.size !== 1 || entries3.size > 0)
          return !1;
        entries2.delete(input), input === value5 && (value5 = void 0);
        try {
          element.releasePointerCapture(input);
        } catch {
        }
        return callback15(entry.lastSeen), !0;
      },
      destroy() {
        value6(), element.removeEventListener("scroll", callback), element.removeEventListener("dragstart", callback24), element.removeEventListener("mousedown", callback25), element.removeEventListener("touchstart", callback3), element.removeEventListener("touchmove", callback4), element.removeEventListener("touchend", callback5), element.removeEventListener("touchcancel", callback5), element.removeEventListener("wheel", callback12), window.removeEventListener("pointerdown", callback16, !0), element.removeEventListener("pointerdown", callback18), element.removeEventListener("gesturestart", callback21), element.removeEventListener("gesturechange", callback22), element.removeEventListener("gestureend", callback23), window.removeEventListener("pointermove", callback19), window.removeEventListener("pointerup", callback20), window.removeEventListener("pointercancel", callback20), entries4.clear(), entries3.clear(), entries.clear(), callback7(), element.style.touchAction = touchAction;
      }
    };
  }
  return bindRuntimeValue(runtime2, "zoomViewportAt", () => zoomViewportAt), bindRuntimeValue(runtime2, "panViewport", () => panViewport), bindRuntimeValue(runtime2, "wheelZoomFactor", () => wheelZoomFactor), bindRuntimeValue(runtime2, "createWheelGestureDecision", () => createWheelGestureDecision), bindRuntimeValue(runtime2, "POINTER_STALE_TIMEOUT_MS", () => POINTER_STALE_TIMEOUT_MS, (value) => {
    POINTER_STALE_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "SAFARI_GESTURE_WHEEL_SUPPRESSION_MS", () => SAFARI_GESTURE_WHEEL_SUPPRESSION_MS, (value) => {
    SAFARI_GESTURE_WHEEL_SUPPRESSION_MS = value;
  }), bindRuntimeValue(runtime2, "SAFARI_GESTURE_EVENTS", () => SAFARI_GESTURE_EVENTS, (value) => {
    SAFARI_GESTURE_EVENTS = value;
  }), bindRuntimeValue(runtime2, "TOUCH_COUNT_EVENTS", () => TOUCH_COUNT_EVENTS, (value) => {
    TOUCH_COUNT_EVENTS = value;
  }), bindRuntimeValue(runtime2, "activeViewportGestures", () => activeViewportGestures, (value) => {
    activeViewportGestures = value;
  }), bindRuntimeValue(runtime2, "activeTouchCount", () => activeTouchCount, (value) => {
    activeTouchCount = value;
  }), bindRuntimeValue(runtime2, "isReroutingViewportEvent", () => isReroutingViewportEvent, (value) => {
    isReroutingViewportEvent = value;
  }), bindRuntimeValue(runtime2, "updateTouchCount", () => updateTouchCount, (value) => {
    updateTouchCount = value;
  }), bindRuntimeValue(runtime2, "viewportGestureElementAtPoint", () => viewportGestureElementAtPoint, (value) => {
    viewportGestureElementAtPoint = value;
  }), bindRuntimeValue(runtime2, "rerouteViewportWheelEvent", () => rerouteViewportWheelEvent, (value) => {
    rerouteViewportWheelEvent = value;
  }), bindRuntimeValue(runtime2, "rerouteSafariGestureEvent", () => rerouteSafariGestureEvent, (value) => {
    rerouteSafariGestureEvent = value;
  }), bindRuntimeValue(runtime2, "registerViewportGestureHandlers", () => registerViewportGestureHandlers, (value) => {
    registerViewportGestureHandlers = value;
  }), bindRuntimeValue(runtime2, "attachViewportGestures", () => attachViewportGestures), () => {
    POINTER_STALE_TIMEOUT_MS = 1e4, SAFARI_GESTURE_WHEEL_SUPPRESSION_MS = 1e3, SAFARI_GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"], TOUCH_COUNT_EVENTS = ["touchstart", "touchend", "touchcancel"], activeViewportGestures = /* @__PURE__ */ new Map(), activeTouchCount = 0, isReroutingViewportEvent = !1, updateTouchCount = (event) => {
      activeTouchCount = event.touches?.length ?? 0;
    }, viewportGestureElementAtPoint = (clientX, clientY) => {
      let value;
      if (clientX === void 0 || clientY === void 0)
        return value;
      for (let value2 of activeViewportGestures.keys()) {
        if (value2.closest("[inert]") || value2.checkVisibility?.() === !1)
          continue;
        let bounds = value2.getBoundingClientRect();
        clientX >= bounds.left && clientX < bounds.right && clientY >= bounds.top && clientY < bounds.bottom && (value = value2);
      }
      return value;
    }, rerouteViewportWheelEvent = (event) => {
      if (!event.ctrlKey || !event.cancelable || event.defaultPrevented || isReroutingViewportEvent)
        return;
      let value = viewportGestureElementAtPoint(event.clientX, event.clientY);
      if (!value)
        return;
      event.preventDefault();
      let value2 = new WheelEvent("wheel", {
        bubbles: !0,
        cancelable: !0,
        clientX: event.clientX,
        clientY: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      });
      isReroutingViewportEvent = !0;
      try {
        value.dispatchEvent(value2);
      } finally {
        isReroutingViewportEvent = !1;
      }
    }, rerouteSafariGestureEvent = (event) => {
      if (event.defaultPrevented || activeTouchCount > 0)
        return;
      let value = event, value2 = viewportGestureElementAtPoint(value.clientX, value.clientY);
      value2 && (event.preventDefault(), activeViewportGestures.get(value2)?.[event.type](value));
    }, registerViewportGestureHandlers = (element, handlers) => {
      activeViewportGestures.set(element, handlers), window.addEventListener("wheel", rerouteViewportWheelEvent, {
        passive: !1
      });
      for (let value of SAFARI_GESTURE_EVENTS)
        window.addEventListener(value, rerouteSafariGestureEvent, {
          passive: !1
        });
      for (let value of TOUCH_COUNT_EVENTS)
        window.addEventListener(value, updateTouchCount, {
          capture: !0,
          passive: !0
        });
      return () => {
        if (activeViewportGestures.get(element) === handlers && activeViewportGestures.delete(element), !(activeViewportGestures.size > 0)) {
          window.removeEventListener("wheel", rerouteViewportWheelEvent);
          for (let value of SAFARI_GESTURE_EVENTS)
            window.removeEventListener(value, rerouteSafariGestureEvent);
          for (let value of TOUCH_COUNT_EVENTS)
            window.removeEventListener(value, updateTouchCount, !0);
        }
      };
    };
  };
}
export {
  installUiViewportGestures
};
