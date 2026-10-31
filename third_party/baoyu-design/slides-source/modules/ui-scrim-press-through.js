// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { POPUP_LAYER_SELECTOR, bindRuntimeValue } from "../module-helpers.js";
function installUiScrimPressThrough(runtime2) {
  var pressDragSlop, POINTER_BUTTON_MASKS, pressThroughTarget, initializeScrimPressThrough;
  function findPressThroughTarget(point) {
    let elements = document.elementsFromPoint?.(point.clientX, point.clientY) ?? [];
    if (elements.filter((element) => element.hasAttribute("data-mc-scrim")).length > 1)
      return null;
    let target = elements.find((element) => element.closest(POPUP_LAYER_SELECTOR) === null);
    return target !== void 0 && target.tagName !== "IFRAME" && target.closest("[data-mc-chrome], [data-mc-strip]") === null && target.closest("[data-mc-press-through]") !== null ? target : null;
  }
  function replayPressOn(target, event) {
    let activeElement2 = document.activeElement;
    if (!target.dispatchEvent(new PointerEvent("pointerdown", event)) || activeElement2 !== document.activeElement || activeElement2?.closest(POPUP_LAYER_SELECTOR) != null)
      return;
    let focusTarget = target.closest('[tabindex], a[href], button, input, select, textarea, [contenteditable="true"]');
    focusTarget !== activeElement2 && ((activeElement2 instanceof HTMLElement || activeElement2 instanceof SVGElement) && activeElement2.blur(), focusTarget?.focus({
      preventScroll: !0
    }));
  }
  function pressThroughNow(event, close) {
    let target = pressThroughTarget(event);
    close(), target !== null && replayPressOn(target, event);
  }
  function pressThroughOnDrag(event, close) {
    let types = ["pointermove", "pointerup", "pointercancel", "pointerdown"], stop = () => {
      types.forEach((type) => window.removeEventListener(type, onPointer, !0)), window.removeEventListener("blur", stop);
    }, onPointer = (input) => {
      if (input.pointerId !== event.pointerId)
        return;
      if (input.type !== "pointermove" || !(input.buttons & (POINTER_BUTTON_MASKS[event.button] ?? 0)))
        return stop();
      if (Math.hypot(input.clientX - event.clientX, input.clientY - event.clientY) <= pressDragSlop(event.button))
        return;
      stop();
      let target = pressThroughTarget(event);
      target !== null && (close(), replayPressOn(target, event), target.dispatchEvent(new PointerEvent("pointermove", input)));
    };
    return types.forEach((type) => window.addEventListener(type, onPointer, !0)), window.addEventListener("blur", stop), stop;
  }
  function wheelThroughPopup(event, popup, close) {
    let canScroll = (element) => element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY);
    if (!event.ctrlKey) {
      for (let element = event.target instanceof Element ? event.target : null; element !== null && popup.contains(element); element = element.parentElement)
        if (canScroll(element))
          return;
    }
    let target = findPressThroughTarget(event);
    target !== null && (event.preventDefault(), close(), target.dispatchEvent(new WheelEvent("wheel", event)));
  }
  return bindRuntimeValue(runtime2, "findPressThroughTarget", () => findPressThroughTarget), bindRuntimeValue(runtime2, "replayPressOn", () => replayPressOn), bindRuntimeValue(runtime2, "pressThroughNow", () => pressThroughNow), bindRuntimeValue(runtime2, "pressThroughOnDrag", () => pressThroughOnDrag), bindRuntimeValue(runtime2, "wheelThroughPopup", () => wheelThroughPopup), bindRuntimeValue(runtime2, "pressDragSlop", () => pressDragSlop, (value) => {
    pressDragSlop = value;
  }), bindRuntimeValue(runtime2, "POINTER_BUTTON_MASKS", () => POINTER_BUTTON_MASKS, (value) => {
    POINTER_BUTTON_MASKS = value;
  }), bindRuntimeValue(runtime2, "pressThroughTarget", () => pressThroughTarget, (value) => {
    pressThroughTarget = value;
  }), bindRuntimeValue(runtime2, "initializeScrimPressThrough", () => initializeScrimPressThrough, (value) => {
    initializeScrimPressThrough = value;
  }), () => {
    pressDragSlop = (button) => button === 0 ? 8 : 3, pressThroughTarget = (event) => event.pointerType !== "touch" && POINTER_BUTTON_MASKS[event.button] !== void 0 ? findPressThroughTarget(event) : null, initializeScrimPressThrough = (0, runtime2.initializeOnce)(() => {
      POINTER_BUTTON_MASKS = [1, 4, 2];
    });
  };
}
export {
  installUiScrimPressThrough
};
