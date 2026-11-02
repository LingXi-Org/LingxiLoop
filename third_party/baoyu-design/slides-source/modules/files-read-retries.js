// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesReadRetries(runtime2) {
  var FILE_FETCH_RETRY_DELAYS_MS;
  function isRetryableFileReadAccessError(input) {
    let value = input?.status;
    return value === 401 || value === 403 || value === 404;
  }
  async function listWritableFiles(port) {
    if (port.mayWrite === !0 && typeof port.listUnlessNarrowed == "function")
      return await port.listUnlessNarrowed();
    let listing = await port.list();
    if (port.mayWrite === !0 && (0, runtime2.fileListingIsNarrowed)(listing, port))
      throw {
        code: "http",
        status: 403,
        narrowed: !0,
        message: "_files.json: marked as narrowed"
      };
    return listing;
  }
  async function retryFileRead(operation, timers, onRetry, retryDelays = FILE_FETCH_RETRY_DELAYS_MS) {
    let clock = timers ?? {
      setTimeout: (input, options) => setTimeout(input, options)
    };
    for (let index4 = 0; ; index4++)
      try {
        return await operation();
      } catch (value) {
        if (index4 >= retryDelays.length || !isRetryableFileReadAccessError(value))
          throw value;
        onRetry?.(index4 + 1, value), await new Promise((input) => void clock.setTimeout(input, retryDelays[index4]));
      }
  }
  bindRuntimeValue(runtime2, "FILE_FETCH_RETRY_DELAYS_MS", () => FILE_FETCH_RETRY_DELAYS_MS, (value) => {
    FILE_FETCH_RETRY_DELAYS_MS = value;
  }), bindRuntimeValue(runtime2, "isRetryableFileReadAccessError", () => isRetryableFileReadAccessError), bindRuntimeValue(runtime2, "listWritableFiles", () => listWritableFiles), bindRuntimeValue(runtime2, "retryFileRead", () => retryFileRead);
  var hotLeaveStates;
  function hotLeaveState(hot) {
    let signal = hot.signal, abortSignal = signal === hot.signal && typeof signal?.addEventListener == "function" ? signal : void 0, state = hotLeaveStates.get(abortSignal ?? hot);
    if (state !== void 0)
      return state;
    state = {
      left: !1,
      joined: /* @__PURE__ */ new Set()
    }, hotLeaveStates.set(abortSignal ?? hot, state);
    let joinedState = state;
    return abortSignal?.aborted === !0 ? state.left = !0 : abortSignal?.addEventListener("abort", () => leaveHotPage(joinedState), {
      once: !0
    }), state;
  }
  function leaveHotPage(state) {
    if (!state.left) {
      state.left = !0;
      for (let callback of [...state.joined])
        if (state.joined.has(callback))
          try {
            callback();
          } catch {
          }
      state.joined.clear();
    }
  }
  function onHotPageLeaving(callback, hot = (0, runtime2.getHotCapability)()) {
    if (hot === null)
      return () => {
      };
    let state = hotLeaveState(hot);
    if (state.left) {
      try {
        callback();
      } catch {
      }
      return () => {
      };
    }
    return state.joined.add(callback), () => void state.joined.delete(callback);
  }
  return bindRuntimeValue(runtime2, "onHotPageLeaving", () => onHotPageLeaving), () => {
    FILE_FETCH_RETRY_DELAYS_MS = [50, 100, 200, 400, 800], hotLeaveStates = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installFilesReadRetries
};
