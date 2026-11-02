// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsEditProtection(runtime2) {
  var MAX_ACTIVE_SLIDE_PROTECTION_MS, ACTIVE_SLIDE_IDLE_RELEASE_MS, protectedSlideId, activeEditingSlideId, recentlyEditingSlideId, recentSlideBusyPredicate, activeSlideProtectionTimers;
  function activeSlideProtectionRemaining(state) {
    return state.current === void 0 || !(state.caret || state.gesture) || state.last === null || state.last.id !== state.current ? 0 : Math.max(0, MAX_ACTIVE_SLIDE_PROTECTION_MS - (state.now - state.last.at));
  }
  function protectedSlideDocumentPath() {
    return protectedSlideId === null ? null : runtime2.SLIDE_STORE_COLLECTION + "/" + protectedSlideId;
  }
  function setRecentSlideBusyPredicate(input) {
    recentSlideBusyPredicate = input;
  }
  function activeEditingDocumentPath() {
    let value = activeEditingSlideId !== null ? activeEditingSlideId : recentSlideBusyPredicate?.() === !0 ? recentlyEditingSlideId : null;
    return value === null ? null : runtime2.SLIDE_STORE_COLLECTION + "/" + value;
  }
  function setProtectedSlideId(input) {
    let value = protectedSlideDocumentPath();
    return protectedSlideId = input, value !== protectedSlideDocumentPath() ? value : null;
  }
  function createActiveSlideProtection(input, options = activeSlideProtectionTimers) {
    let state = {
      current: void 0,
      caret: !1,
      gesture: !1,
      last: null,
      now: 0
    };
    activeEditingSlideId = null, recentlyEditingSlideId = null;
    let value, value2, callback = () => {
      options.clearTimeout(value), value = void 0, state.now = options.now();
      let value3 = activeSlideProtectionRemaining(state), value4 = activeEditingDocumentPath();
      recentlyEditingSlideId = state.current ?? null, activeEditingSlideId = state.current !== void 0 && (state.gesture || recentSlideBusyPredicate?.() === !0) ? state.current : null;
      let value5 = setProtectedSlideId(value3 > 0 && state.current !== void 0 ? state.current : null);
      value5 !== null && input(value5), value4 !== null && value4 !== activeEditingDocumentPath() && value4 !== value5 && input(value4), value3 > 0 && (value = options.setTimeout(callback, value3));
    };
    return {
      stage(input2, options2) {
        input2 === state.current && options2 === state.caret || (state.current = input2, state.caret = options2, callback());
      },
      input(input2, options2) {
        state.last = {
          id: input2,
          at: options.now()
        }, options2 !== void 0 && (state.gesture = options2, options.clearTimeout(value2), value2 = options2 ? options.setTimeout(() => {
          state.gesture = !1, callback();
        }, ACTIVE_SLIDE_IDLE_RELEASE_MS) : void 0), callback();
      },
      poke: callback,
      dispose() {
        options.clearTimeout(value), options.clearTimeout(value2);
        let value3 = activeEditingDocumentPath();
        activeEditingSlideId = null, recentlyEditingSlideId = null;
        let value4 = setProtectedSlideId(null);
        value4 !== null && input(value4), value3 !== null && value3 !== value4 && input(value3);
      }
    };
  }
  return bindRuntimeValue(runtime2, "MAX_ACTIVE_SLIDE_PROTECTION_MS", () => MAX_ACTIVE_SLIDE_PROTECTION_MS, (value) => {
    MAX_ACTIVE_SLIDE_PROTECTION_MS = value;
  }), bindRuntimeValue(runtime2, "ACTIVE_SLIDE_IDLE_RELEASE_MS", () => ACTIVE_SLIDE_IDLE_RELEASE_MS, (value) => {
    ACTIVE_SLIDE_IDLE_RELEASE_MS = value;
  }), bindRuntimeValue(runtime2, "activeSlideProtectionRemaining", () => activeSlideProtectionRemaining), bindRuntimeValue(runtime2, "protectedSlideId", () => protectedSlideId, (value) => {
    protectedSlideId = value;
  }), bindRuntimeValue(runtime2, "protectedSlideDocumentPath", () => protectedSlideDocumentPath), bindRuntimeValue(runtime2, "activeEditingSlideId", () => activeEditingSlideId, (value) => {
    activeEditingSlideId = value;
  }), bindRuntimeValue(runtime2, "recentlyEditingSlideId", () => recentlyEditingSlideId, (value) => {
    recentlyEditingSlideId = value;
  }), bindRuntimeValue(runtime2, "recentSlideBusyPredicate", () => recentSlideBusyPredicate, (value) => {
    recentSlideBusyPredicate = value;
  }), bindRuntimeValue(runtime2, "setRecentSlideBusyPredicate", () => setRecentSlideBusyPredicate), bindRuntimeValue(runtime2, "activeEditingDocumentPath", () => activeEditingDocumentPath), bindRuntimeValue(runtime2, "setProtectedSlideId", () => setProtectedSlideId), bindRuntimeValue(runtime2, "activeSlideProtectionTimers", () => activeSlideProtectionTimers, (value) => {
    activeSlideProtectionTimers = value;
  }), bindRuntimeValue(runtime2, "createActiveSlideProtection", () => createActiveSlideProtection), () => {
    (0, runtime2.initializeUiAnnouncements)(), MAX_ACTIVE_SLIDE_PROTECTION_MS = 3e4, ACTIVE_SLIDE_IDLE_RELEASE_MS = 4e3, protectedSlideId = null, activeEditingSlideId = null, recentlyEditingSlideId = null, activeSlideProtectionTimers = {
      now: () => Date.now(),
      setTimeout: (input, options) => window.setTimeout(input, options),
      clearTimeout: (input) => window.clearTimeout(input)
    };
  };
}
export {
  installDocumentsEditProtection
};
