// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyFocus(runtime2) {
  var reactForUiPropertyFocus, OPEN_OVERLAY_SELECTOR, MENU_POPOVER_OPEN_SELECTORS, UNDO_STEPS_ATTRIBUTE, UNDO_STEPS_HELD_ATTRIBUTE, heldUndoPointerIds, pendingPopupFocusReturn, TEXT_EDITABLE_SELECTOR, popupPointerEvent, ToolbarTooltipSideContext, popupFocusReturnTimer, initializeUiPropertyFocus, nextHeldUndoId = -1, DOCUMENT_FOCUS_POLL_MS = 250, subscribeNothing = () => () => {
  };
  function anyMenuOrPopoverOpen(page = document) {
    for (let value of page.querySelectorAll(MENU_POPOVER_OPEN_SELECTORS))
      if (value.hasAttribute("data-open"))
        return !0;
    return !1;
  }
  function hasOpenOverlay(input = document) {
    for (let value of input.querySelectorAll(OPEN_OVERLAY_SELECTOR))
      if (!isOverlayClosed(value))
        return !0;
    return !1;
  }
  function markHeldUndoPointer(input) {
    if (input.button !== 0)
      return;
    let currentTarget = input.currentTarget, ownerDocument2 = currentTarget.ownerDocument, pointerId = input.pointerId, value = heldUndoPointerIds.get(currentTarget) ?? /* @__PURE__ */ new Set();
    heldUndoPointerIds.set(currentTarget, value), value.add(pointerId), currentTarget.setAttribute(UNDO_STEPS_HELD_ATTRIBUTE, "");
    let callback = (input2) => {
      input2.pointerId === pointerId && (value.delete(pointerId), value.size === 0 && currentTarget.removeAttribute(UNDO_STEPS_HELD_ATTRIBUTE), ownerDocument2.removeEventListener("pointerup", callback, !0), ownerDocument2.removeEventListener("pointercancel", callback, !0));
    };
    ownerDocument2.addEventListener("pointerup", callback, !0), ownerDocument2.addEventListener("pointercancel", callback, !0);
  }
  function holdUndoSteps(element) {
    let ancestor = element.closest("[" + UNDO_STEPS_ATTRIBUTE + "]");
    if (ancestor === null)
      return () => {
      };
    let value = heldUndoPointerIds.get(ancestor) ?? /* @__PURE__ */ new Set();
    heldUndoPointerIds.set(ancestor, value);
    let value2 = nextHeldUndoId--;
    return value.add(value2), ancestor.setAttribute(UNDO_STEPS_HELD_ATTRIBUTE, ""), () => {
      value.delete(value2), value.size === 0 && ancestor.removeAttribute(UNDO_STEPS_HELD_ATTRIBUTE);
    };
  }
  function subscribeDocumentFocus(listener) {
    let timer, callback = () => {
      listener(), clearTimeout(timer), timer = setTimeout(listener);
    }, interval = setInterval(listener, DOCUMENT_FOCUS_POLL_MS);
    return window.addEventListener("focus", callback), window.addEventListener("blur", callback), () => {
      clearInterval(interval), clearTimeout(timer), window.removeEventListener("focus", callback), window.removeEventListener("blur", callback);
    };
  }
  function useDocumentHasFocus(enabled = !0) {
    return reactForUiPropertyFocus.useSyncExternalStore(enabled ? subscribeDocumentFocus : subscribeNothing, () => !enabled || document.hasFocus(), () => !0);
  }
  function overlaysBlockUndo(input = document) {
    for (let value of input.querySelectorAll(OPEN_OVERLAY_SELECTOR))
      if (value.hasAttribute(UNDO_STEPS_HELD_ATTRIBUTE) || !(value.hasAttribute("data-mc-scrim") || isOverlayClosed(value)) && !value.hasAttribute(UNDO_STEPS_ATTRIBUTE))
        return !0;
    return !1;
  }
  function isOverlayClosed(input) {
    return (input.closest("[data-open], [data-closed]") ?? input).hasAttribute("data-closed");
  }
  function choosePopoverSide(anchor, expectedHeight, preferredSide = "bottom", minimumHeight = expectedHeight) {
    if (!anchor)
      return {
        side: preferredSide,
        maxHeight: void 0
      };
    let bounds = anchor.getBoundingClientRect(), value = (anchor.ownerDocument.defaultView?.innerHeight ?? bounds.bottom) - (0, runtime2.readFrameFootInset)(anchor.ownerDocument) - bounds.bottom - 16, value2 = bounds.top - 16, [value3, value4] = preferredSide === "top" ? [value2, value] : [value, value2], value5 = value3 >= Math.min(expectedHeight, minimumHeight) || value3 >= value4 ? preferredSide : preferredSide === "top" ? "bottom" : "top", value6 = value5 === "bottom" ? value : value2;
    return {
      side: value5,
      maxHeight: value6 < expectedHeight ? Math.max(value6, 120) : void 0
    };
  }
  return bindRuntimeValue(runtime2, "anyMenuOrPopoverOpen", () => anyMenuOrPopoverOpen), bindRuntimeValue(runtime2, "hasOpenOverlay", () => hasOpenOverlay), bindRuntimeValue(runtime2, "markHeldUndoPointer", () => markHeldUndoPointer), bindRuntimeValue(runtime2, "holdUndoSteps", () => holdUndoSteps), bindRuntimeValue(runtime2, "subscribeDocumentFocus", () => subscribeDocumentFocus), bindRuntimeValue(runtime2, "useDocumentHasFocus", () => useDocumentHasFocus), bindRuntimeValue(runtime2, "overlaysBlockUndo", () => overlaysBlockUndo), bindRuntimeValue(runtime2, "isOverlayClosed", () => isOverlayClosed), bindRuntimeValue(runtime2, "choosePopoverSide", () => choosePopoverSide), bindRuntimeValue(runtime2, "reactForUiPropertyFocus", () => reactForUiPropertyFocus, (value) => {
    reactForUiPropertyFocus = value;
  }), bindRuntimeValue(runtime2, "OPEN_OVERLAY_SELECTOR", () => OPEN_OVERLAY_SELECTOR, (value) => {
    OPEN_OVERLAY_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "MENU_POPOVER_OPEN_SELECTORS", () => MENU_POPOVER_OPEN_SELECTORS, (value) => {
    MENU_POPOVER_OPEN_SELECTORS = value;
  }), bindRuntimeValue(runtime2, "UNDO_STEPS_ATTRIBUTE", () => UNDO_STEPS_ATTRIBUTE, (value) => {
    UNDO_STEPS_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "UNDO_STEPS_HELD_ATTRIBUTE", () => UNDO_STEPS_HELD_ATTRIBUTE, (value) => {
    UNDO_STEPS_HELD_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "heldUndoPointerIds", () => heldUndoPointerIds, (value) => {
    heldUndoPointerIds = value;
  }), bindRuntimeValue(runtime2, "pendingPopupFocusReturn", () => pendingPopupFocusReturn, (value) => {
    pendingPopupFocusReturn = value;
  }), bindRuntimeValue(runtime2, "TEXT_EDITABLE_SELECTOR", () => TEXT_EDITABLE_SELECTOR, (value) => {
    TEXT_EDITABLE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "popupPointerEvent", () => popupPointerEvent, (value) => {
    popupPointerEvent = value;
  }), bindRuntimeValue(runtime2, "ToolbarTooltipSideContext", () => ToolbarTooltipSideContext, (value) => {
    ToolbarTooltipSideContext = value;
  }), bindRuntimeValue(runtime2, "popupFocusReturnTimer", () => popupFocusReturnTimer, (value) => {
    popupFocusReturnTimer = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyFocus", () => initializeUiPropertyFocus, (value) => {
    initializeUiPropertyFocus = value;
  }), () => {
    UNDO_STEPS_ATTRIBUTE = "data-mc-undo-steps", UNDO_STEPS_HELD_ATTRIBUTE = "data-mc-undo-steps-held", TEXT_EDITABLE_SELECTOR = 'input, select, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]', popupPointerEvent = (event) => {
      event.key === "Enter" && event.target instanceof HTMLInputElement && event.preventDefault();
    }, popupFocusReturnTimer = 320, initializeUiPropertyFocus = (0, runtime2.initializeOnce)(() => {
      reactForUiPropertyFocus = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), OPEN_OVERLAY_SELECTOR = [
        "[data-mc-popover]",
        "[data-mc-menu]",
        "[data-mc-scrim]",
        '[data-cds="Menu"]',
        '[data-cds="Popover"]',
        '[data-cds="Dialog"]',
        '[role="alertdialog"]:not([aria-modal="false"])',
        '[role="dialog"][aria-modal="true"]'
      ].join(", "), MENU_POPOVER_OPEN_SELECTORS = [
        '[data-cds="Menu"]',
        '[data-cds="ContextMenu"]',
        '[data-cds="DropdownButton"]',
        '[data-cds="SplitDropdownButton"]',
        '[data-cds="ModelSelector"]'
      ].join(", "), heldUndoPointerIds = /* @__PURE__ */ new WeakMap(), pendingPopupFocusReturn = {
        [UNDO_STEPS_ATTRIBUTE]: "",
        onPointerDownCapture: markHeldUndoPointer
      }, ToolbarTooltipSideContext = reactForUiPropertyFocus.createContext(void 0);
    });
  };
}
export {
  installUiPropertyFocus
};
