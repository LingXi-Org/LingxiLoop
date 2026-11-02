// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiAnnouncements(runtime2) {
  var reactLC, jsxW20, liveAnnouncementListeners, ANNOUNCEMENT_SETTLE_MS, ANNOUNCEMENT_CLEAR_MS, MAX_ANNOUNCEMENT_LENGTH, initializeUiAnnouncements;
  function announceLiveMessage(input, options = {}) {
    for (let value of liveAnnouncementListeners)
      value(input, options);
  }
  function subscribeLiveAnnouncements(input) {
    return liveAnnouncementListeners.add(input), () => {
      liveAnnouncementListeners.delete(input);
    };
  }
  function LiveAnnouncer({ settleMs = ANNOUNCEMENT_SETTLE_MS, clearMs = ANNOUNCEMENT_CLEAR_MS }) {
    let [value, value2] = reactLC.useState("");
    return reactLC.useEffect(() => {
      let value3, flag = !1, value4, value5 = subscribeLiveAnnouncements((input, options) => {
        if (value3 !== void 0) {
          if (options.ifIdle && !flag)
            return;
          clearTimeout(value3);
        }
        flag = options.ifIdle === !0, value4 !== void 0 && clearTimeout(value4), value4 = void 0, value2(""), value3 = setTimeout(() => {
          value3 = void 0;
          let value6 = typeof input == "function" ? input() : input;
          if (value6 == null || value6 === "")
            return;
          let value7 = value6.length > MAX_ANNOUNCEMENT_LENGTH ? value6.slice(0, MAX_ANNOUNCEMENT_LENGTH - 1).replace(/[\uD800-\uDBFF]$/, "") + "…" : value6;
          value2(value7), value4 = setTimeout(() => {
            value4 = void 0, value2("");
          }, clearMs);
        }, settleMs);
      });
      return () => {
        value5(), value3 !== void 0 && clearTimeout(value3), value4 !== void 0 && clearTimeout(value4);
      };
    }, [settleMs, clearMs]), jsxW20.jsx("span", {
      className: "sr-only",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-kit": "live-announcer",
      children: value
    });
  }
  return bindRuntimeValue(runtime2, "announceLiveMessage", () => announceLiveMessage), bindRuntimeValue(runtime2, "subscribeLiveAnnouncements", () => subscribeLiveAnnouncements), bindRuntimeValue(runtime2, "LiveAnnouncer", () => LiveAnnouncer), bindRuntimeValue(runtime2, "reactLC", () => reactLC, (value) => {
    reactLC = value;
  }), bindRuntimeValue(runtime2, "jsxW20", () => jsxW20, (value) => {
    jsxW20 = value;
  }), bindRuntimeValue(runtime2, "liveAnnouncementListeners", () => liveAnnouncementListeners, (value) => {
    liveAnnouncementListeners = value;
  }), bindRuntimeValue(runtime2, "ANNOUNCEMENT_SETTLE_MS", () => ANNOUNCEMENT_SETTLE_MS, (value) => {
    ANNOUNCEMENT_SETTLE_MS = value;
  }), bindRuntimeValue(runtime2, "ANNOUNCEMENT_CLEAR_MS", () => ANNOUNCEMENT_CLEAR_MS, (value) => {
    ANNOUNCEMENT_CLEAR_MS = value;
  }), bindRuntimeValue(runtime2, "MAX_ANNOUNCEMENT_LENGTH", () => MAX_ANNOUNCEMENT_LENGTH, (value) => {
    MAX_ANNOUNCEMENT_LENGTH = value;
  }), bindRuntimeValue(runtime2, "initializeUiAnnouncements", () => initializeUiAnnouncements, (value) => {
    initializeUiAnnouncements = value;
  }), () => {
    ANNOUNCEMENT_SETTLE_MS = 350, ANNOUNCEMENT_CLEAR_MS = 5e3, MAX_ANNOUNCEMENT_LENGTH = 120, initializeUiAnnouncements = (0, runtime2.initializeOnce)(() => {
      reactLC = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxW20 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), liveAnnouncementListeners = /* @__PURE__ */ new Set();
    });
  };
}
export {
  installUiAnnouncements
};
