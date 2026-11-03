// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToastF6Visit(runtime2) {
  var reactToastF6Visit, TOAST_F6_VISIT_ATTRIBUTE, initializeToastF6Visit;
  function useToastF6Visit() {
    reactToastF6Visit.useEffect(() => {
      let visited = null, mark = (toast) => {
        visited?.removeAttribute(TOAST_F6_VISIT_ATTRIBUTE), toast?.setAttribute(TOAST_F6_VISIT_ATTRIBUTE, ""), visited = toast;
      }, toastOf = (target) => target instanceof Element ? target.closest('[data-cds="Toast"]') : null, onFocusIn = (event) => {
        let target = event.target instanceof Element ? event.target : null, toast = toastOf(target);
        toast === null ? mark(null) : target?.matches('[role="region"]') && mark(toastOf(event.relatedTarget) === toast ? null : toast);
      }, onFocusOut = (event) => {
        event.relatedTarget === null && event.target instanceof Element && event.target.ownerDocument.activeElement !== event.target && mark(null);
      };
      return document.addEventListener("focusin", onFocusIn), document.addEventListener("focusout", onFocusOut), () => {
        mark(null), document.removeEventListener("focusin", onFocusIn), document.removeEventListener("focusout", onFocusOut);
      };
    }, []);
  }
  return bindRuntimeValue(runtime2, "useToastF6Visit", () => useToastF6Visit), bindRuntimeValue(runtime2, "reactToastF6Visit", () => reactToastF6Visit, (value) => {
    reactToastF6Visit = value;
  }), bindRuntimeValue(runtime2, "TOAST_F6_VISIT_ATTRIBUTE", () => TOAST_F6_VISIT_ATTRIBUTE, (value) => {
    TOAST_F6_VISIT_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "initializeToastF6Visit", () => initializeToastF6Visit, (value) => {
    initializeToastF6Visit = value;
  }), () => {
    TOAST_F6_VISIT_ATTRIBUTE = "data-kit-f6-visit", initializeToastF6Visit = (0, runtime2.initializeOnce)(() => {
      reactToastF6Visit = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    });
  };
}
export {
  installUiToastF6Visit
};
