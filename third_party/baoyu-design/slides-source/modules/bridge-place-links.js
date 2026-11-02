// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBridgePlaceLinks(runtime2) {
  var PLACE_LINK_MESSAGES_ENABLED, PLACE_LINK_INITIAL_POST_DELAY_MS, PLACE_LINK_RETRY_DELAYS_MS, PLACE_LINK_FRAGMENT_PATTERN, RESERVED_PLACE_LINK_FRAGMENTS, getPlaceLinkSessionStorage, PLACE_LINK_STORAGE_FIELDS, setPlaceLinkTimeout, clearPlaceLinkTimeout, placeLinkMessagesEnabled, getPlaceLinkLocalStorage, lastPlaceStorageKey, COPY_PAGE_LINK_TIMEOUT_MS, COPY_PAGE_LINK_ERROR_QUIET_MS, COPY_PAGE_LINK_FAILURES, isCopySlideLinkShortcut, COPY_SLIDE_LINK_SHORTCUT;
  function readLastPlace(storage, memoryScope) {
    try {
      let value = storage?.getItem(lastPlaceStorageKey(memoryScope));
      return isValidPlaceFragment(value) ? value : null;
    } catch {
      return null;
    }
  }
  function requestCopyPageLink(fragment, win = window, post = runtime2.postToHost) {
    if (!isValidPlaceFragment(fragment))
      return Promise.resolve("invalid_fragment");
    if (win.parent === win)
      return Promise.resolve("no_answer");
    let id = "place-" + Math.random().toString(36).slice(2, 10);
    return new Promise((resolve) => {
      let finish = (result) => {
        win.removeEventListener("message", onMessage), clearPlaceLinkTimeout(timer), resolve(result);
      }, onMessage = (event) => {
        if (event.source !== win.parent || !(0, runtime2.isAllowedHostMessageOrigin)(event.origin))
          return;
        let data = event.data;
        data === null || typeof data != "object" || data.type !== "copy_page_link_result" || data.id !== id || (data.ok === !0 && (0, runtime2.setInternalClipboard)(void 0), finish(data.ok === !0 ? null : COPY_PAGE_LINK_FAILURES.find((reason) => reason === data.reason) ?? "unavailable"));
      }, timer = setPlaceLinkTimeout(() => finish("no_answer"), COPY_PAGE_LINK_TIMEOUT_MS);
      win.addEventListener("message", onMessage), win.document.hasFocus() || win.focus(), post({
        type: "copy_page_link",
        id,
        fragment
      }, win, void 0, !0);
    });
  }
  function listenForCopySlideLinkShortcut(onCopy, win = window) {
    let onKeyDown = (event) => {
      isCopySlideLinkShortcut(event) && (event.preventDefault(), event.repeat || onCopy());
    };
    return win.addEventListener("keydown", onKeyDown, !0), () => win.removeEventListener("keydown", onKeyDown, !0);
  }
  function createPlaceLinkCopier(onError, copy = requestCopyPageLink) {
    let busy = !1, lastMessage = null, quietTimer = null;
    return (fragment) => {
      if (busy)
        return;
      busy = !0;
      let done = (failure) => {
        if (busy = !1, failure === null || failure === "rate_limited")
          return;
        let message = "Couldn’t copy the link. " + (failure === "no_answer" ? "Refresh the page, then try again." : "Try again in a moment.");
        message !== lastMessage && (lastMessage = message, quietTimer !== null && clearPlaceLinkTimeout(quietTimer), quietTimer = setPlaceLinkTimeout(() => void (lastMessage = null), COPY_PAGE_LINK_ERROR_QUIET_MS), onError(message));
      };
      copy(fragment).then(done, () => done("no_answer"));
    };
  }
  function isValidPlaceFragment(fragment) {
    return typeof fragment == "string" && PLACE_LINK_FRAGMENT_PATTERN.test(fragment) && !fragment.startsWith("comment-") && !RESERVED_PLACE_LINK_FRAGMENTS.has(fragment);
  }
  function placeLinkStorageKey(memoryScope = "") {
    let path = typeof location > "u" ? "/" : location.pathname;
    return "place-link/" + (0, runtime2.artifactStashKey)(path).slice((0, runtime2.artifactStashKey)("").length) + (memoryScope ? "/" + memoryScope : "");
  }
  function readPlaceLinkFields(memoryScope, storage) {
    try {
      return (storage?.getItem(placeLinkStorageKey(memoryScope)) ?? "").split("|");
    } catch {
      return [];
    }
  }
  function writePlaceLinkField(field, value, memoryScope, storage = getPlaceLinkSessionStorage()) {
    let stored = readPlaceLinkFields(memoryScope, storage), linkChanged = field === "link" && stored[0] !== value;
    try {
      storage?.setItem(placeLinkStorageKey(memoryScope), PLACE_LINK_STORAGE_FIELDS.map((input, options) => input === field ? value : linkChanged && input === "goto" ? "" : stored[options] ?? "").join("|"));
    } catch {
    }
  }
  function resolvePagePlaceLink(memoryScope, hash = typeof location > "u" ? "" : location.hash, storage = getPlaceLinkSessionStorage(), localStore = getPlaceLinkLocalStorage()) {
    let raw = hash.startsWith("#") ? hash.slice(1) : hash, fragment = isValidPlaceFragment(raw) ? raw : null, [value, value2, value3, value4] = readPlaceLinkFields(memoryScope, storage);
    if (fragment !== null && fragment === value4)
      return { place: fragment, why: "here" };
    if (fragment !== null && ![value, value2, value3].includes(fragment))
      return { place: fragment, why: "new" };
    let last = localStore === null ? null : readLastPlace(storage, memoryScope) ?? readLastPlace(localStore, memoryScope);
    return last !== null ? { place: last, why: "last" } : fragment === null ? null : { place: fragment, why: "known" };
  }
  function createPlaceLinkReporter(input = {}) {
    let value = input.post ?? runtime2.postToHost, tabMove = !1, value2 = input.enabled ?? placeLinkMessagesEnabled, callback = () => input.store === void 0 ? getPlaceLinkSessionStorage() : input.store, value3 = null, value4 = null, items = [], callback2 = () => {
      value4 !== null && clearPlaceLinkTimeout(value4), value4 = null;
    }, callback3 = (input2) => {
      let value5 = value3 === null;
      value3 = input2, writePlaceLinkField("sent", input2, input.scope, callback()), value({
        type: "current_anchor",
        fragment: input2,
        ...tabMove ? { nav: "tab" } : {}
      }), value5 && (items = PLACE_LINK_RETRY_DELAYS_MS.map((input3) => setPlaceLinkTimeout(() => value3 !== null && value({
        type: "current_anchor",
        fragment: value3
      }), input3)));
    };
    return {
      report(input2, tab = !1) {
        !value2 || !isValidPlaceFragment(input2) || (writePlaceLinkField("at", input2, input.scope, callback()), callback2(), tabMove ||= tab, value4 = setPlaceLinkTimeout(() => {
          value4 = null, input2 !== value3 && callback3(input2), tabMove = !1;
        }, PLACE_LINK_INITIAL_POST_DELAY_MS));
      },
      answer(input2) {
        !value2 || !isValidPlaceFragment(input2) || (writePlaceLinkField("at", input2, input.scope, callback()), callback2(), tabMove = !1, callback3(input2));
      },
      stop() {
        callback2(), items.forEach(clearPlaceLinkTimeout);
      }
    };
  }
  function parseGotoAnchorMessage(event, parent, originAllowed) {
    if (parent === null || event.source !== parent || !originAllowed(event.origin))
      return null;
    let data = event.data;
    return data !== null && typeof data == "object" && data.type === "goto_anchor" && isValidPlaceFragment(data.fragment) ? data.fragment : null;
  }
  function subscribeGotoAnchorMessages(onGoto, hostWindow = window) {
    if (hostWindow.parent === hostWindow)
      return () => {
      };
    let listener = (dataset) => {
      if (dataset.source !== hostWindow.parent || !(0, runtime2.isAllowedHostMessageOrigin)(dataset.origin))
        return;
      let value = parseGotoAnchorMessage(dataset, hostWindow.parent, runtime2.isAllowedHostMessageOrigin);
      value !== null && onGoto(value);
    };
    return hostWindow.addEventListener("message", listener), () => hostWindow.removeEventListener("message", listener);
  }
  return bindRuntimeValue(runtime2, "PLACE_LINK_MESSAGES_ENABLED", () => PLACE_LINK_MESSAGES_ENABLED, (value) => {
    PLACE_LINK_MESSAGES_ENABLED = value;
  }), bindRuntimeValue(runtime2, "PLACE_LINK_INITIAL_POST_DELAY_MS", () => PLACE_LINK_INITIAL_POST_DELAY_MS, (value) => {
    PLACE_LINK_INITIAL_POST_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "PLACE_LINK_RETRY_DELAYS_MS", () => PLACE_LINK_RETRY_DELAYS_MS, (value) => {
    PLACE_LINK_RETRY_DELAYS_MS = value;
  }), bindRuntimeValue(runtime2, "PLACE_LINK_FRAGMENT_PATTERN", () => PLACE_LINK_FRAGMENT_PATTERN, (value) => {
    PLACE_LINK_FRAGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "RESERVED_PLACE_LINK_FRAGMENTS", () => RESERVED_PLACE_LINK_FRAGMENTS, (value) => {
    RESERVED_PLACE_LINK_FRAGMENTS = value;
  }), bindRuntimeValue(runtime2, "isValidPlaceFragment", () => isValidPlaceFragment), bindRuntimeValue(runtime2, "getPlaceLinkSessionStorage", () => getPlaceLinkSessionStorage, (value) => {
    getPlaceLinkSessionStorage = value;
  }), bindRuntimeValue(runtime2, "PLACE_LINK_STORAGE_FIELDS", () => PLACE_LINK_STORAGE_FIELDS, (value) => {
    PLACE_LINK_STORAGE_FIELDS = value;
  }), bindRuntimeValue(runtime2, "placeLinkStorageKey", () => placeLinkStorageKey), bindRuntimeValue(runtime2, "readPlaceLinkFields", () => readPlaceLinkFields), bindRuntimeValue(runtime2, "writePlaceLinkField", () => writePlaceLinkField), bindRuntimeValue(runtime2, "resolvePagePlaceLink", () => resolvePagePlaceLink), bindRuntimeValue(runtime2, "setPlaceLinkTimeout", () => setPlaceLinkTimeout, (value) => {
    setPlaceLinkTimeout = value;
  }), bindRuntimeValue(runtime2, "clearPlaceLinkTimeout", () => clearPlaceLinkTimeout, (value) => {
    clearPlaceLinkTimeout = value;
  }), bindRuntimeValue(runtime2, "placeLinkMessagesEnabled", () => placeLinkMessagesEnabled, (value) => {
    placeLinkMessagesEnabled = value;
  }), bindRuntimeValue(runtime2, "createPlaceLinkReporter", () => createPlaceLinkReporter), bindRuntimeValue(runtime2, "parseGotoAnchorMessage", () => parseGotoAnchorMessage), bindRuntimeValue(runtime2, "subscribeGotoAnchorMessages", () => subscribeGotoAnchorMessages), bindRuntimeValue(runtime2, "getPlaceLinkLocalStorage", () => getPlaceLinkLocalStorage, (value) => {
    getPlaceLinkLocalStorage = value;
  }), bindRuntimeValue(runtime2, "lastPlaceStorageKey", () => lastPlaceStorageKey, (value) => {
    lastPlaceStorageKey = value;
  }), bindRuntimeValue(runtime2, "COPY_PAGE_LINK_TIMEOUT_MS", () => COPY_PAGE_LINK_TIMEOUT_MS, (value) => {
    COPY_PAGE_LINK_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "COPY_PAGE_LINK_ERROR_QUIET_MS", () => COPY_PAGE_LINK_ERROR_QUIET_MS, (value) => {
    COPY_PAGE_LINK_ERROR_QUIET_MS = value;
  }), bindRuntimeValue(runtime2, "COPY_PAGE_LINK_FAILURES", () => COPY_PAGE_LINK_FAILURES, (value) => {
    COPY_PAGE_LINK_FAILURES = value;
  }), bindRuntimeValue(runtime2, "isCopySlideLinkShortcut", () => isCopySlideLinkShortcut, (value) => {
    isCopySlideLinkShortcut = value;
  }), bindRuntimeValue(runtime2, "COPY_SLIDE_LINK_SHORTCUT", () => COPY_SLIDE_LINK_SHORTCUT, (value) => {
    COPY_SLIDE_LINK_SHORTCUT = value;
  }), bindRuntimeValue(runtime2, "readLastPlace", () => readLastPlace), bindRuntimeValue(runtime2, "requestCopyPageLink", () => requestCopyPageLink), bindRuntimeValue(runtime2, "listenForCopySlideLinkShortcut", () => listenForCopySlideLinkShortcut), bindRuntimeValue(runtime2, "createPlaceLinkCopier", () => createPlaceLinkCopier), () => {
    PLACE_LINK_MESSAGES_ENABLED = !0, PLACE_LINK_INITIAL_POST_DELAY_MS = 250, PLACE_LINK_RETRY_DELAYS_MS = [1500, 6e3], PLACE_LINK_FRAGMENT_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/, RESERVED_PLACE_LINK_FRAGMENTS = /* @__PURE__ */ new Set([
      "sidebar",
      "settings",
      "customize",
      "upgrade",
      "downloads"
    ]), getPlaceLinkSessionStorage = () => {
      try {
        return sessionStorage;
      } catch {
        return null;
      }
    }, getPlaceLinkLocalStorage = () => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    }, PLACE_LINK_STORAGE_FIELDS = ["link", "goto", "sent", "at"], lastPlaceStorageKey = (memoryScope) => placeLinkStorageKey(memoryScope).replace("place-link/", "place-last/"), COPY_PAGE_LINK_TIMEOUT_MS = 2e3, COPY_PAGE_LINK_ERROR_QUIET_MS = 6e3, COPY_PAGE_LINK_FAILURES = [
      "no_gesture",
      "invalid_fragment",
      "unavailable",
      "rate_limited",
      "clipboard_denied"
    ], isCopySlideLinkShortcut = (event) => event.altKey && !event.shiftKey && (event.metaKey ? event.code === "KeyL" : event.ctrlKey && event.key.toLowerCase() === "l"), COPY_SLIDE_LINK_SHORTCUT = "alt+cmd+l", setPlaceLinkTimeout = (input, options) => setTimeout(input, options), clearPlaceLinkTimeout = (input) => clearTimeout(input), placeLinkMessagesEnabled = PLACE_LINK_MESSAGES_ENABLED;
  };
}
export {
  installBridgePlaceLinks
};
