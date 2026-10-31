// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationFullscreen(runtime2) {
  var FULLSCREEN_REQUEST_TIMEOUT_MS, cancelStaleFullscreenListener, fullscreenRequestSequence, fullscreenRequestsInFlight;
  function exitStaleFullscreenRequest(document2, element) {
    cancelStaleFullscreenListener?.();
    let { change: eventNames } = getFullscreenEventNames(document2), callback = () => {
      clearTimeout(value), document2.removeEventListener(eventNames, callback2), cancelStaleFullscreenListener === callback && (cancelStaleFullscreenListener = null);
    }, callback2 = () => {
      getFullscreenElement(document2) === element && (callback(), exitFullscreen(document2));
    };
    document2.addEventListener(eventNames, callback2);
    let value = setTimeout(callback, FULLSCREEN_REQUEST_TIMEOUT_MS * 20);
    cancelStaleFullscreenListener = callback;
  }
  function isPromiseLike(value) {
    return typeof value == "object" && value !== null && typeof value.then == "function";
  }
  function getFullscreenDocument(documentOverride) {
    if (documentOverride !== void 0)
      return documentOverride;
    if (!(typeof document > "u"))
      return document;
  }
  function supportsStandardFullscreen(document2) {
    return document2.fullscreenEnabled === !0 && typeof document2.documentElement?.requestFullscreen == "function";
  }
  function supportsWebkitFullscreen(document2) {
    return document2.webkitFullscreenEnabled === !0 && typeof document2.documentElement?.webkitRequestFullscreen == "function";
  }
  function fullscreenAvailable(document2) {
    let resolvedDocument = getFullscreenDocument(document2);
    return resolvedDocument !== void 0 && (supportsStandardFullscreen(resolvedDocument) || supportsWebkitFullscreen(resolvedDocument));
  }
  function getFullscreenElement(document2) {
    let resolvedDocument = getFullscreenDocument(document2);
    return resolvedDocument === void 0 ? null : resolvedDocument.fullscreenElement ?? resolvedDocument.webkitFullscreenElement ?? null;
  }
  function isFullscreenOrEntering(document2) {
    return fullscreenRequestsInFlight > 0 || getFullscreenElement(document2) !== null;
  }
  function getFullscreenEventNames(document2) {
    return "onfullscreenchange" in document2 ? {
      change: "fullscreenchange",
      error: "fullscreenerror"
    } : {
      change: "webkitfullscreenchange",
      error: "webkitfullscreenerror"
    };
  }
  function observeFullscreenRequest(document2, element, timeoutMs) {
    let cleanup = () => {
    };
    return {
      outcome: new Promise((input) => {
        let { change: value, error: value2 } = getFullscreenEventNames(document2), value3, flag = !1;
        cleanup = () => {
          flag = !0, clearTimeout(value3), document2.removeEventListener(value, callback2), document2.removeEventListener(value2, callback3);
        };
        let callback = (input2) => {
          flag || (cleanup(), input(input2));
        }, callback2 = () => {
          getFullscreenElement(document2) === element && callback({
            kind: "entered"
          });
        }, callback3 = () => callback({
          kind: "denied"
        });
        document2.addEventListener(value, callback2), document2.addEventListener(value2, callback3), getFullscreenElement(document2) === element && queueMicrotask(callback2), value3 = setTimeout(() => {
          if (getFullscreenElement(document2) === element) {
            callback({
              kind: "entered"
            });
            return;
          }
          callback({
            kind: "denied"
          }), timeoutMs === fullscreenRequestSequence && exitStaleFullscreenRequest(document2, element);
        }, FULLSCREEN_REQUEST_TIMEOUT_MS);
      }),
      cancel: cleanup
    };
  }
  function requestFullscreen(element) {
    let ownerDocument2 = getFullscreenDocument(element.ownerDocument);
    if (ownerDocument2 === void 0 || !fullscreenAvailable(ownerDocument2))
      return Promise.resolve({
        kind: "unavailable"
      });
    if (getFullscreenElement(ownerDocument2) === element)
      return Promise.resolve({
        kind: "entered"
      });
    let requestId = ++fullscreenRequestSequence;
    cancelStaleFullscreenListener?.(), fullscreenRequestsInFlight += 1;
    let observer = (input) => (input.then(() => {
      fullscreenRequestsInFlight -= 1;
    }), input), value = element;
    try {
      if (supportsStandardFullscreen(ownerDocument2)) {
        let value2 = value.requestFullscreen({
          navigationUI: "hide"
        }), value3 = observeFullscreenRequest(ownerDocument2, element, requestId);
        if (!isPromiseLike(value2))
          return observer(value3.outcome);
        let value4 = Promise.resolve(value2).then(() => ({
          kind: "entered"
        }), () => ({
          kind: "denied"
        }));
        return value4.then(value3.cancel), observer(Promise.race([value4, value3.outcome]));
      }
      return value.webkitRequestFullscreen(), observer(observeFullscreenRequest(ownerDocument2, element, requestId).outcome);
    } catch {
      return fullscreenRequestsInFlight -= 1, Promise.resolve({
        kind: "denied"
      });
    }
  }
  function exitFullscreen(document2) {
    let resolvedDocument = getFullscreenDocument(document2);
    if (resolvedDocument === void 0 || getFullscreenElement(resolvedDocument) === null)
      return Promise.resolve();
    try {
      if (resolvedDocument.fullscreenElement && typeof resolvedDocument.exitFullscreen == "function")
        return Promise.resolve(resolvedDocument.exitFullscreen()).catch(() => {
        });
      resolvedDocument.webkitExitFullscreen?.();
    } catch {
    }
    return Promise.resolve();
  }
  function subscribeFullscreenChange(listener, document2) {
    let resolvedDocument = getFullscreenDocument(document2);
    if (resolvedDocument === void 0)
      return () => {
      };
    let { change } = getFullscreenEventNames(resolvedDocument), callback = () => listener(getFullscreenElement(resolvedDocument));
    return resolvedDocument.addEventListener(change, callback), () => resolvedDocument.removeEventListener(change, callback);
  }
  return bindRuntimeValue(runtime2, "FULLSCREEN_REQUEST_TIMEOUT_MS", () => FULLSCREEN_REQUEST_TIMEOUT_MS, (value) => {
    FULLSCREEN_REQUEST_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "cancelStaleFullscreenListener", () => cancelStaleFullscreenListener, (value) => {
    cancelStaleFullscreenListener = value;
  }), bindRuntimeValue(runtime2, "fullscreenRequestSequence", () => fullscreenRequestSequence, (value) => {
    fullscreenRequestSequence = value;
  }), bindRuntimeValue(runtime2, "fullscreenRequestsInFlight", () => fullscreenRequestsInFlight, (value) => {
    fullscreenRequestsInFlight = value;
  }), bindRuntimeValue(runtime2, "exitStaleFullscreenRequest", () => exitStaleFullscreenRequest), bindRuntimeValue(runtime2, "isPromiseLike", () => isPromiseLike), bindRuntimeValue(runtime2, "getFullscreenDocument", () => getFullscreenDocument), bindRuntimeValue(runtime2, "supportsStandardFullscreen", () => supportsStandardFullscreen), bindRuntimeValue(runtime2, "supportsWebkitFullscreen", () => supportsWebkitFullscreen), bindRuntimeValue(runtime2, "fullscreenAvailable", () => fullscreenAvailable), bindRuntimeValue(runtime2, "getFullscreenElement", () => getFullscreenElement), bindRuntimeValue(runtime2, "isFullscreenOrEntering", () => isFullscreenOrEntering), bindRuntimeValue(runtime2, "getFullscreenEventNames", () => getFullscreenEventNames), bindRuntimeValue(runtime2, "observeFullscreenRequest", () => observeFullscreenRequest), bindRuntimeValue(runtime2, "requestFullscreen", () => requestFullscreen), bindRuntimeValue(runtime2, "exitFullscreen", () => exitFullscreen), bindRuntimeValue(runtime2, "subscribeFullscreenChange", () => subscribeFullscreenChange), () => {
    FULLSCREEN_REQUEST_TIMEOUT_MS = 3e3, cancelStaleFullscreenListener = null, fullscreenRequestSequence = 0, fullscreenRequestsInFlight = 0;
  };
}
export {
  installPresentationFullscreen
};
