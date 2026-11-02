// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesUnloadFlush(runtime2) {
  function installUnloadSaveFlush(document2, options = {}) {
    let window2 = options.win ?? globalThis;
    if (typeof window2?.addEventListener != "function")
      return () => {
      };
    let now = options.now ?? (() => Date.now()), storage = options.storage !== void 0 ? options.storage : (() => {
      try {
        return sessionStorage;
      } catch {
        return null;
      }
    })(), callback = (input) => {
      try {
        input === null ? storage?.removeItem("slides-files/last-unload-flush") : storage?.setItem("slides-files/last-unload-flush", JSON.stringify({
          ...input,
          at: now()
        }));
      } catch {
      }
    }, callback2 = (input) => {
      try {
        options.report?.(input);
      } catch {
      }
    };
    function value(input) {
      let value3 = document2.dirty(), value4 = now(), value5 = document2.flushForUnload(input);
      if (!value3 && value5.paths.length === 0 && !value5.index)
        return callback(null), void callback2({
          why: input,
          ...value5,
          result: "nothing-to-save"
        });
      let state = {
        why: input,
        ...value5,
        result: "attempted",
        ...value5.owed ? {
          note: "a publish was already in flight; these ride the next one if the page lives that long"
        } : {}
      };
      callback(state), callback2(state), document2.settle().then(() => {
        let status = document2.saveState().status, value6 = !document2.dirty() && status !== "error", state2 = {
          why: input,
          ...value5,
          result: value6 ? "landed" : "failed",
          ms: now() - value4,
          ...value6 ? {} : {
            note: document2.saveState().message ?? status
          }
        };
        callback(value6 ? null : state2), callback2(state2);
      }, () => {
      });
    }
    let callback3 = () => value("pagehide"), callback4 = () => {
      window2.document?.visibilityState === "hidden" && value("visibility hidden");
    }, callback5 = (event) => {
      document2.dirty() && (value("beforeunload"), event.preventDefault(), event.returnValue = "");
    }, value2 = typeof window2.document?.addEventListener == "function" ? window2.document : window2;
    return window2.addEventListener("pagehide", callback3), value2.addEventListener("visibilitychange", callback4), window2.addEventListener("beforeunload", callback5), () => {
      window2.removeEventListener("pagehide", callback3), value2.removeEventListener("visibilitychange", callback4), window2.removeEventListener("beforeunload", callback5);
    };
  }
  function readLastUnloadFlushReport(storage) {
    let resolvedStorage = storage !== void 0 ? storage : (() => {
      try {
        return sessionStorage;
      } catch {
        return null;
      }
    })();
    try {
      let value = resolvedStorage?.getItem("slides-files/last-unload-flush") ?? null;
      return value === null ? void 0 : (resolvedStorage?.removeItem("slides-files/last-unload-flush"), JSON.parse(value));
    } catch {
      return;
    }
  }
  return bindRuntimeValue(runtime2, "installUnloadSaveFlush", () => installUnloadSaveFlush), bindRuntimeValue(runtime2, "readLastUnloadFlushReport", () => readLastUnloadFlushReport), () => {
  };
}
export {
  installFilesUnloadFlush
};
