// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToasts(runtime2) {
  var jsxid0, jsxr__, reactk_, toastQueue, pinnedToast, nextToastId, toastSubscribers, pinnedToastSubscribers;
  function notifyToastSubscribers() {
    for (let value of toastSubscribers)
      value(toastQueue);
  }
  function setPinnedToast(toast) {
    if (toast !== pinnedToast) {
      pinnedToast = toast;
      for (let value of pinnedToastSubscribers)
        value(pinnedToast);
    }
  }
  function showToast(text, durationMs = 6e3) {
    let value = nextToastId++;
    return toastQueue = [
      ...toastQueue,
      {
        id: value,
        text,
        durationMs
      }
    ], notifyToastSubscribers(), value;
  }
  function showActionToast(text, action, onClose) {
    let value = nextToastId++;
    return toastQueue = [
      ...toastQueue,
      {
        id: value,
        text,
        durationMs: 0,
        action,
        ...onClose ? {
          onClose
        } : {}
      }
    ], notifyToastSubscribers(), value;
  }
  function closeToast(toastId) {
    toastQueue.some((input) => input.id === toastId) && (toastQueue = toastQueue.filter((input) => input.id !== toastId), notifyToastSubscribers());
  }
  function subscribeToasts(listener) {
    return toastSubscribers.add(listener), listener(toastQueue), () => {
      toastSubscribers.delete(listener);
    };
  }
  function useToastBridge() {
    let { add, close, setPinned } = (0, runtime2.useToastNotifications)(), ref = reactk_.useRef(/* @__PURE__ */ new Map());
    return reactk_.useEffect(() => {
      let callback = (input) => setPinned(input);
      return pinnedToastSubscribers.add(callback), pinnedToast !== null && callback(pinnedToast), () => {
        pinnedToastSubscribers.delete(callback);
      };
    }, [setPinned]), reactk_.useEffect(() => {
      let current = ref.current;
      return subscribeToasts((input) => {
        let values = new Set(input.map((input2) => input2.id));
        for (let value of input) {
          if (current.has(value.id))
            continue;
          let value2 = add({
            title: value.text,
            action: value.action,
            timeout: Math.max(0, value.durationMs),
            dedupe: !1,
            onClose: () => {
              current.delete(value.id), closeToast(value.id), value.onClose?.();
            }
          });
          current.set(value.id, value2);
        }
        for (let [value, value2] of [...current])
          values.has(value) || (current.delete(value), close(value2));
      });
    }, [add, close]), null;
  }
  return bindRuntimeValue(runtime2, "jsxid0", () => jsxid0, (value) => {
    jsxid0 = value;
  }), bindRuntimeValue(runtime2, "jsxr__", () => jsxr__, (value) => {
    jsxr__ = value;
  }), bindRuntimeValue(runtime2, "reactk_", () => reactk_, (value) => {
    reactk_ = value;
  }), bindRuntimeValue(runtime2, "toastQueue", () => toastQueue, (value) => {
    toastQueue = value;
  }), bindRuntimeValue(runtime2, "pinnedToast", () => pinnedToast, (value) => {
    pinnedToast = value;
  }), bindRuntimeValue(runtime2, "nextToastId", () => nextToastId, (value) => {
    nextToastId = value;
  }), bindRuntimeValue(runtime2, "toastSubscribers", () => toastSubscribers, (value) => {
    toastSubscribers = value;
  }), bindRuntimeValue(runtime2, "pinnedToastSubscribers", () => pinnedToastSubscribers, (value) => {
    pinnedToastSubscribers = value;
  }), bindRuntimeValue(runtime2, "notifyToastSubscribers", () => notifyToastSubscribers), bindRuntimeValue(runtime2, "setPinnedToast", () => setPinnedToast), bindRuntimeValue(runtime2, "showToast", () => showToast), bindRuntimeValue(runtime2, "showActionToast", () => showActionToast), bindRuntimeValue(runtime2, "closeToast", () => closeToast), bindRuntimeValue(runtime2, "subscribeToasts", () => subscribeToasts), bindRuntimeValue(runtime2, "useToastBridge", () => useToastBridge), () => {
    (0, runtime2.initializeImageDownsampling)(), (0, runtime2.initializeUiPropertyIcons)(), jsxid0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), jsxr__ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeUiInputs210)(), reactk_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), toastQueue = [], pinnedToast = null, nextToastId = 1, toastSubscribers = /* @__PURE__ */ new Set(), pinnedToastSubscribers = /* @__PURE__ */ new Set();
  };
}
export {
  installUiToasts
};
