// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiKitFieldUndo(runtime2) {
  var isKitField, kitFieldUndoStates, kitFieldUndoWindows, kitFieldUndoStateFor, pendingKitFieldRestore, kitFieldRestoreTimer, initializeKitFieldUndo;
  function markKitField(element) {
    element?.setAttribute("data-kit-field", ""), element !== null && trackKitFieldUndo(element);
  }
  function hashFieldValue(value) {
    let hash = 2166136261;
    for (let index4 = 0; index4 < value.length; index4++)
      hash = Math.imul(hash ^ value.charCodeAt(index4), 16777619);
    return hash;
  }
  function captureFieldSelection(element) {
    let { selectionStart: start = null, selectionEnd: end = null, selectionDirection: way = null } = element ?? {};
    return {
      to: element ?? null,
      start,
      end,
      way: way === "forward" || way === "backward" || way === "none" ? way : null
    };
  }
  function restoreFieldSelection({ to, start, end, way }) {
    start !== null && to !== null && "setSelectionRange" in to && to.setSelectionRange(start, end, way ?? void 0);
  }
  function onKitFieldBeforeInput(event) {
    let state = kitFieldUndoStateFor(event);
    if (state === void 0)
      return;
    let { el: element } = state;
    element.value !== state.now && (state.now = element.value, state.marks = [hashFieldValue(state.now)], state.at = 0);
    let activeElement2 = element.ownerDocument.activeElement;
    state.before = {
      trusted: event.isTrusted,
      place: activeElement2 === pendingKitFieldRestore?.at ? pendingKitFieldRestore.place : captureFieldSelection(activeElement2)
    };
  }
  function onKitFieldInput(event) {
    let state = kitFieldUndoStateFor(event);
    if (state?.before?.trusted !== event.isTrusted)
      return;
    let { el: element } = state, { place } = state.before;
    state.before = null;
    let { inputType, isComposing } = event, undo = inputType === "historyUndo", hash = hashFieldValue(element.value);
    if (isComposing || !undo && inputType !== "historyRedo") {
      state.marks.length = state.at + 1, state.at = state.marks.push(hash) - 1, state.now = element.value;
      return;
    }
    let found = undo ? state.at === 0 ? -1 : state.marks.lastIndexOf(hash, state.at - 1) : state.marks.indexOf(hash, state.at + 1);
    if (found !== -1) {
      state.at = found, state.now = element.value;
      return;
    }
    if (event.stopImmediatePropagation(), element.value = state.now, place.to === element)
      return restoreFieldSelection(place);
    element.ownerDocument.activeElement === element && (pendingKitFieldRestore = {
      at: element,
      place
    }, clearTimeout(kitFieldRestoreTimer), kitFieldRestoreTimer = setTimeout(() => {
      if (pendingKitFieldRestore = null, element.ownerDocument.activeElement !== element)
        return;
      let target = place.to;
      target !== null && "focus" in target && target.focus({
        preventScroll: !0
      }), restoreFieldSelection(place);
    }));
  }
  function trackKitFieldUndo(element) {
    if (kitFieldUndoStates.has(element))
      return;
    kitFieldUndoStates.set(element, {
      el: element,
      marks: [hashFieldValue(element.value)],
      at: 0,
      now: element.value,
      before: null
    });
    let view = element.ownerDocument.defaultView;
    view === null || kitFieldUndoWindows.has(view) || (kitFieldUndoWindows.add(view), view.addEventListener("beforeinput", onKitFieldBeforeInput, !0), view.addEventListener("input", onKitFieldInput, !0));
  }
  function reselectKitField(element) {
    element.blur(), element.focus({
      preventScroll: !0
    }), element.select(), queueMicrotask(() => {
      element.ownerDocument.activeElement === element && element.select();
    });
  }
  return bindRuntimeValue(runtime2, "markKitField", () => markKitField), bindRuntimeValue(runtime2, "hashFieldValue", () => hashFieldValue), bindRuntimeValue(runtime2, "captureFieldSelection", () => captureFieldSelection), bindRuntimeValue(runtime2, "restoreFieldSelection", () => restoreFieldSelection), bindRuntimeValue(runtime2, "onKitFieldBeforeInput", () => onKitFieldBeforeInput), bindRuntimeValue(runtime2, "onKitFieldInput", () => onKitFieldInput), bindRuntimeValue(runtime2, "trackKitFieldUndo", () => trackKitFieldUndo), bindRuntimeValue(runtime2, "reselectKitField", () => reselectKitField), bindRuntimeValue(runtime2, "isKitField", () => isKitField, (value) => {
    isKitField = value;
  }), bindRuntimeValue(runtime2, "kitFieldUndoStates", () => kitFieldUndoStates, (value) => {
    kitFieldUndoStates = value;
  }), bindRuntimeValue(runtime2, "kitFieldUndoWindows", () => kitFieldUndoWindows, (value) => {
    kitFieldUndoWindows = value;
  }), bindRuntimeValue(runtime2, "kitFieldUndoStateFor", () => kitFieldUndoStateFor, (value) => {
    kitFieldUndoStateFor = value;
  }), bindRuntimeValue(runtime2, "pendingKitFieldRestore", () => pendingKitFieldRestore, (value) => {
    pendingKitFieldRestore = value;
  }), bindRuntimeValue(runtime2, "kitFieldRestoreTimer", () => kitFieldRestoreTimer, (value) => {
    kitFieldRestoreTimer = value;
  }), bindRuntimeValue(runtime2, "initializeKitFieldUndo", () => initializeKitFieldUndo, (value) => {
    initializeKitFieldUndo = value;
  }), () => {
    isKitField = (element) => element?.hasAttribute?.("data-kit-field") === !0, kitFieldUndoStateFor = (event) => event.target === null ? void 0 : kitFieldUndoStates.get(event.target), pendingKitFieldRestore = null, initializeKitFieldUndo = (0, runtime2.initializeOnce)(() => {
      kitFieldUndoStates = /* @__PURE__ */ new WeakMap(), kitFieldUndoWindows = /* @__PURE__ */ new WeakSet();
    });
  };
}
export {
  installUiKitFieldUndo
};
