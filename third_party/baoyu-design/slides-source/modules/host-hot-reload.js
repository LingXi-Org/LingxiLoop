// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostHotReload(runtime2) {
  var noop4, isAppCodePath, hotReloadBridges, isEmbeddedArtifact, hotReloadBridge, HOT_EVENT_LIMIT;
  function isHotFirstOpen(hot) {
    try {
      return hot != null && hot.from === null;
    } catch {
      return !1;
    }
  }
  function whenPageLoaded(run) {
    (typeof document < "u" ? document : void 0)?.readyState === "complete" || typeof globalThis.addEventListener != "function" ? run() : globalThis.addEventListener("load", run, {
      once: !0
    });
  }
  function hotFirstOpenFor(doc) {
    return doc?.querySelector("#root > [data-placeholder]") ? "show" : "hold";
  }
  function resolveHostHotApi() {
    try {
      let value = globalThis.slidesHost?.hot;
      return (typeof value == "object" || typeof value == "function") && value !== null ? value : null;
    } catch {
      return null;
    }
  }
  function createInactiveHotReloadBridge() {
    return {
      active: !1,
      queued: [],
      restarted: !1,
      carried: void 0,
      events: [],
      owed: () => {
      },
      takeOwed: () => {
      },
      attach() {
      },
      release() {
      },
      detach() {
      },
      armReady() {
      }
    };
  }
  function currentHotReloadBridge(hot) {
    let value = hot === void 0 ? resolveHostHotApi() : hot;
    if (value === null)
      return;
    let entry = hotReloadBridges.get(value);
    if (entry !== void 0 && entry.live())
      return entry;
  }
  function createHotReloadBridge(options = {}) {
    let value = options.hot !== void 0 ? options.hot : resolveHostHotApi();
    if (options.embedded === !0 || value === null || typeof value.accept != "function")
      return createInactiveHotReloadBridge();
    let entry = hotReloadBridges.get(value);
    if (entry !== void 0 && entry.live())
      return entry;
    let value2 = options.isCode ?? isAppCodePath, value3 = options.now ?? (() => Date.now()), callback = (input, options2) => options.timers !== void 0 ? options.timers.setTimeout(input, options2) : setTimeout(input, options2), callback2 = (input) => {
      options.timers !== void 0 ? options.timers.clearTimeout?.(input) : clearTimeout(input);
    }, items = [], items2 = [], items3 = [], state = {}, value4, value5, flag = !1, flag2 = !1, flag3 = !1, flag4 = !1, attached = !1, value6;
    function value7(input) {
      if (items2.push(input), items2.length > HOT_EVENT_LIMIT && items2.shift(), state.onEvent === void 0) {
        items3.push(input), items3.length > HOT_EVENT_LIMIT && items3.shift();
        return;
      }
      try {
        state.onEvent(input);
      } catch {
      }
    }
    let callback3 = (input) => ({
      version: input.ver,
      ...input.seq !== void 0 ? {
        seq: input.seq
      } : {}
    });
    function value8() {
      let value11 = value6;
      value11 !== void 0 && (state.reveal !== void 0 ? Promise.resolve(state.reveal).then(() => value11(!1), () => value11(!1)) : (flag3 || flag4) && value11(!1));
    }
    function value9(input, options2, context, value11, extra) {
      value4 = {
        reason: context,
        from: value4?.from ?? value11,
        to: extra,
        at: value3()
      };
      let value12 = context === "required" ? "required is " + String(input.required) : options.noFiles === !0 ? "this page keeps nothing in files, so every version is new page code" : "a changed path is the page’s own code";
      if (value7({
        ...options2,
        decision: "defer",
        why: value12 + "; the editor is still booting, so the restart waits until it has attached"
      }), value7({
        type: "deferred",
        from: value11.version,
        to: extra.version,
        reason: context
      }), typeof input.defer == "function") {
        try {
          input.defer();
        } catch {
        }
        return;
      }
      return "deferred";
    }
    value.accept((input) => {
      if (flag4) {
        if (typeof input.restart == "function") {
          try {
            input.restart();
          } catch {
          }
          return;
        }
        return "restart";
      }
      if (flag3)
        return;
      let value11 = callback3(input.from), value12 = callback3(input.to), value13 = input.required !== "none" ? "required" : options.noFiles === !0 || input.changed !== null && input.changed.some((input2) => value2(input2.path)) ? "code" : void 0, state3 = {
        type: "update",
        from: value11.version,
        to: value12.version,
        ...value11.seq !== void 0 ? {
          fromSeq: value11.seq
        } : {},
        ...value12.seq !== void 0 ? {
          toSeq: value12.seq
        } : {},
        required: String(input.required),
        shape: typeof input.adopt == "function" ? "calls" : "string",
        changed: input.changed === null ? null : input.changed.map((source) => ({
          path: source.path,
          kind: String(source.kind),
          klass: value2(source.path) ? "code" : "content"
        })),
        busy: !1,
        early: !0
      };
      if (value13 !== void 0)
        return value9(input, state3, value13, value11, value12);
      if (typeof input.adopt == "function")
        try {
          input.adopt();
        } catch {
          return value9(input, state3, "required", value11, value12);
        }
      return items.push({
        from: value11,
        to: value12,
        changed: input.changed,
        at: value3()
      }), value7({
        ...state3,
        decision: "adopt",
        why: "content only; the editor is still booting, so the rows wait for it"
      }), "applied";
    });
    let flag5 = !1;
    function value10() {
      if (!(flag5 || typeof value?.ready != "function")) {
        flag5 = !0;
        try {
          value.ready((input) => {
            if (options.firstOpen === "show" && isHotFirstOpen(value))
              return;
            if (value5 = input, flag = !0, state.restore !== void 0 && !flag2) {
              flag2 = !0;
              try {
                state.restore(input);
              } catch {
              }
            }
            let value11 = value3();
            return new Promise((input2) => {
              let callback4 = (input3) => {
                if (value6 === callback4) {
                  value6 = void 0, input3 || callback2(value12);
                  try {
                    options.onReveal?.();
                  } catch {
                  }
                  value7({
                    type: "reveal",
                    heldMs: value3() - value11,
                    timedOut: input3,
                    carried: input != null
                  }), input2();
                }
              }, value12 = callback(() => callback4(!0), options.revealHoldMs ?? 4500);
              value6 = callback4, value8();
            });
          });
        } catch {
        }
      }
    }
    if ((options.ready === "now" || options.ready === "handoff" && !isHotFirstOpen(value)) && value10(), typeof value.snapshot == "function")
      try {
        value.snapshot((input) => flag4 ? null : state.snapshot !== void 0 ? state.snapshot(input) : value5 ?? null);
      } catch {
      }
    let state2 = {
      active: !0,
      queued: items,
      get restarted() {
        return flag;
      },
      get carried() {
        return value5;
      },
      events: items2,
      owed: () => value4,
      takeOwed() {
        let value11 = value4;
        return value4 = void 0, value11;
      },
      attach(input) {
        if (attached = !0, !flag4 && options.ready !== "handoff" && value10(), input.snapshot !== void 0 && (state.snapshot = input.snapshot), input.restore !== void 0 && (state.restore = input.restore), input.reveal !== void 0 && (state.reveal = input.reveal), input.onBeforeRestart !== void 0 && (state.onBeforeRestart = input.onBeforeRestart), input.onEvent !== void 0) {
          state.onEvent = input.onEvent;
          for (let value11 of items3.splice(0))
            try {
              input.onEvent(value11);
            } catch {
            }
        }
        if (flag && !flag2 && state.restore !== void 0) {
          flag2 = !0;
          try {
            state.restore(value5);
          } catch {
          }
        }
        value8();
      },
      release() {
        flag3 = !0, value8();
      },
      detach() {
        if (flag4)
          return;
        flag3 = !0, flag4 = !0, value8();
        let value11 = value4;
        if (value4 = void 0, value11 !== void 0) {
          try {
            state.onBeforeRestart?.("deferred-update");
          } catch {
          }
          try {
            value.restart?.({
              note: "deferred-update"
            });
          } catch {
          }
        }
      },
      armReady() {
        !flag4 && options.ready !== "handoff" && value10();
      },
      live: () => !flag3 && !flag4
    };
    hotReloadBridges.set(value, state2);
    let attachWithinMs = options.attachWithinMs;
    return attachWithinMs !== void 0 && (options.whenLoaded ?? whenPageLoaded)(() => void callback(() => {
      attached || state2.detach();
    }, attachWithinMs)), state2;
  }
  return bindRuntimeValue(runtime2, "noop", () => noop4, (value) => {
    noop4 = value;
  }), bindRuntimeValue(runtime2, "HOT_EVENT_LIMIT", () => HOT_EVENT_LIMIT, (value) => {
    HOT_EVENT_LIMIT = value;
  }), bindRuntimeValue(runtime2, "isHotFirstOpen", () => isHotFirstOpen), bindRuntimeValue(runtime2, "whenPageLoaded", () => whenPageLoaded), bindRuntimeValue(runtime2, "hotFirstOpenFor", () => hotFirstOpenFor), bindRuntimeValue(runtime2, "isAppCodePath", () => isAppCodePath, (value) => {
    isAppCodePath = value;
  }), bindRuntimeValue(runtime2, "hotReloadBridges", () => hotReloadBridges, (value) => {
    hotReloadBridges = value;
  }), bindRuntimeValue(runtime2, "resolveHostHotApi", () => resolveHostHotApi), bindRuntimeValue(runtime2, "createInactiveHotReloadBridge", () => createInactiveHotReloadBridge), bindRuntimeValue(runtime2, "currentHotReloadBridge", () => currentHotReloadBridge), bindRuntimeValue(runtime2, "createHotReloadBridge", () => createHotReloadBridge), bindRuntimeValue(runtime2, "isEmbeddedArtifact", () => isEmbeddedArtifact, (value) => {
    isEmbeddedArtifact = value;
  }), bindRuntimeValue(runtime2, "hotReloadBridge", () => hotReloadBridge, (value) => {
    hotReloadBridge = value;
  }), () => {
    noop4 = () => {
    }, HOT_EVENT_LIMIT = 50, isAppCodePath = (path) => path === "index.html" || path === "SKILL.md" || path.startsWith("artifact-type/"), hotReloadBridges = /* @__PURE__ */ new WeakMap(), isEmbeddedArtifact = typeof window < "u" && window.__appifactEmbed !== void 0, hotReloadBridge = createHotReloadBridge({
      embedded: isEmbeddedArtifact,
      firstOpen: hotFirstOpenFor(typeof document < "u" ? document : void 0),
      revealHoldMs: 4e3
    });
  };
}
export {
  installHostHotReload
};
