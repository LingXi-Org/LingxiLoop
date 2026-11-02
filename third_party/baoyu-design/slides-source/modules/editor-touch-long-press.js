// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorTouchLongPress(runtime2) {
  var TOUCH_LONG_PRESS_MS;
  function snapshotPointerEvent(event) {
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey
    };
  }
  function canStartTouchLongPress(event) {
    if (event.pointerType !== "touch" || event.button !== 0)
      return !1;
    let target = event.target;
    if (target && typeof target.closest == "function") {
      if (target.closest("[data-resize-handle]") !== null)
        return !1;
      let ancestor = target.closest("button, a, input, select, textarea");
      if (ancestor !== null && !ancestor.hasAttribute("data-drag-surface"))
        return !1;
    }
    return !0;
  }
  function canEditAfterTouchLongPress(context) {
    return context.pointerType === "touch" && context.editTarget && !context.onHandle && !context.textEdit;
  }
  function reduceTouchLongPress(state, event, movementThreshold) {
    switch (event.kind) {
      case "move":
        return state.popped ? {
          press: state,
          outcome: "none"
        } : Math.abs(event.clientX - state.press.clientX) + Math.abs(event.clientY - state.press.clientY) < movementThreshold ? {
          press: state,
          outcome: "none"
        } : {
          press: null,
          outcome: state.selected === !0 ? "drag" : "pan"
        };
      case "hold":
        return state.popped ? {
          press: state,
          outcome: "none"
        } : {
          press: {
            ...state,
            popped: !0
          },
          outcome: "pop"
        };
      case "up":
        return {
          press: null,
          outcome: state.popped ? "none" : "tap"
        };
      case "cancel":
        return {
          press: null,
          outcome: "cancel"
        };
    }
  }
  return bindRuntimeValue(runtime2, "snapshotPointerEvent", () => snapshotPointerEvent), bindRuntimeValue(runtime2, "TOUCH_LONG_PRESS_MS", () => TOUCH_LONG_PRESS_MS, (value) => {
    TOUCH_LONG_PRESS_MS = value;
  }), bindRuntimeValue(runtime2, "canStartTouchLongPress", () => canStartTouchLongPress), bindRuntimeValue(runtime2, "canEditAfterTouchLongPress", () => canEditAfterTouchLongPress), bindRuntimeValue(runtime2, "reduceTouchLongPress", () => reduceTouchLongPress), () => {
    TOUCH_LONG_PRESS_MS = 450;
  };
}
export {
  installEditorTouchLongPress
};
