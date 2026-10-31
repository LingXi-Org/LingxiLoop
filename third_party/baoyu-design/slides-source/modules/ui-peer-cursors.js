// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPeerCursors(runtime2) {
  var jsxGY, PEER_CURSOR_IDLE_TIMEOUT_MS, PEER_CURSOR_STALE_MS, PEER_CURSOR_GLIDE_MS, PEER_CURSOR_COLORS, PEER_COLOR_PATTERN, PEER_COLOR_INDEXES, MAX_PEER_CHAT_LENGTH, MAX_PEER_CHAT_DISPLAY_LENGTH, PEER_CHAT_HOLD_MS, PEER_CHAT_FADE_MS, PEER_CHAT_EXIT_MS, PEER_CHAT_CSS_TIMINGS, PeerCursorTag, peerProfileCache;
  function peerColorFromId(id) {
    let index4 = 0;
    for (let index22 = 0; index22 < id.length; index22++)
      index4 = index4 * 31 + id.charCodeAt(index22) >>> 0;
    return PEER_CURSOR_COLORS[index4 % PEER_CURSOR_COLORS.length] ?? "#788c5d";
  }
  function peerColorIndex(color, peerId) {
    return (typeof color == "string" && PEER_COLOR_PATTERN.test(color) ? PEER_COLOR_INDEXES.get(color.toLowerCase()) : void 0) ?? PEER_COLOR_INDEXES.get(peerColorFromId(peerId)) ?? 1;
  }
  function peerColorCssVariable(index4) {
    return runtime2.designTokens.editor.collaborator[index4]?.cssVar ?? runtime2.designTokens.editor.collaborator[1].cssVar;
  }
  function prefersReducedCursorMotion() {
    return typeof matchMedia == "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function usePeerMessageFade(message) {
    let ref = runtime2.reactx4.useRef(null), ref2 = runtime2.reactx4.useRef(null), current = ref.current, value = current != null && typeof getComputedStyle == "function" && parseFloat(getComputedStyle(current).opacity) < 0.2;
    return runtime2.reactx4.useLayoutEffect(() => {
      let current2 = ref.current;
      if (!current2)
        return;
      let state = {
        w: current2.offsetWidth,
        h: current2.offsetHeight,
        shape: message
      }, current3 = ref2.current;
      if (ref2.current = state, !current3 || current3.shape === message || !state.w || !state.h || typeof current2.animate != "function")
        return;
      for (let value4 of current2.getAnimations?.() ?? [])
        value4.animationName || value4.cancel();
      if (value || prefersReducedCursorMotion()) {
        current2.animate([
          {
            opacity: 0
          },
          {
            opacity: 1
          }
        ], {
          duration: 160,
          easing: "ease-out"
        });
        return;
      }
      let value2 = Math.min(2, Math.max(0.5, Math.sqrt(current3.w / state.w * (current3.h / state.h)))), value3 = message === "line";
      current2.animate([
        {
          transform: "scale(" + value2 + ")",
          transformOrigin: "0 0"
        },
        {
          transform: "scale(1)",
          transformOrigin: "0 0"
        }
      ], {
        duration: value3 ? 200 : 160,
        easing: value3 ? "cubic-bezier(.2,.9,.3,1.15)" : "ease-in"
      });
    }), ref;
  }
  function sanitizePeerChatMessage(message) {
    let value = Array.from(message.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, " ").replace(/[^\P{Cf}\u200C\u200D]+/gu, "")).slice(0, MAX_PEER_CHAT_DISPLAY_LENGTH).join("");
    return /^[\s\u200C\u200D\p{Variation_Selector}]*$/u.test(value) ? "" : value;
  }
  function createCursorPresence(options = {}) {
    let value = options.now ?? (() => Date.now()), value2 = options.minDelta ?? 2e-3, value3 = options.idleNullMs ?? PEER_CURSOR_IDLE_TIMEOUT_MS, value4 = !(0, runtime2.hasHostRoomApi)(), value5, value6, value7, value8, value9, flag = !1, text = "";
    async function value10(input) {
      if (value4)
        return;
      let value13 = await (0, runtime2.cachedHostRoom)();
      if (typeof value13?.presence != "function") {
        value4 = !0;
        return;
      }
      try {
        await value13.presence.call(value13, input);
      } catch (value14) {
        let value15 = typeof value14 == "object" && value14 !== null ? value14.code : "";
        value15 !== "upstream_error" && value15 !== "invalid_argument" && (value4 = !0);
      }
    }
    function value11() {
      value9 !== void 0 && clearTimeout(value9), value9 = void 0, value8 = void 0, value5 = void 0, flag && (flag = !1, value10({
        cursor: null
      }));
    }
    function value12(input, options2, context) {
      let value13 = value();
      value5 = {
        s: input,
        x: options2,
        y: context,
        at: value13
      }, value6 = {
        s: input,
        x: options2,
        y: context
      }, flag = !0;
      let callback2 = (input2) => Math.round(input2 * 1e4) / 1e4;
      value10({
        cursor: {
          s: input.slice(0, MAX_PEER_CHAT_LENGTH),
          x: callback2(options2),
          y: callback2(context),
          t: value13,
          ...text === "" ? {} : {
            m: text
          }
        }
      }), value9 !== void 0 && clearTimeout(value9), value9 = setTimeout(value11, value3);
    }
    let callback = () => state.clear();
    typeof addEventListener == "function" && addEventListener("pagehide", callback);
    let state = {
      move(input, options2, context) {
        if (value4 || !Number.isFinite(options2) || !Number.isFinite(context) || value5 && value5.s === input && Math.abs(value5.x - options2) < value2 && Math.abs(value5.y - context) < value2)
          return;
        let value13 = value();
        if (value5 && value5.s === input && value13 - value5.at < PEER_CURSOR_GLIDE_MS) {
          value8 = {
            s: input,
            x: options2,
            y: context
          }, value7 ??= setTimeout(() => {
            value7 = void 0;
            let value14 = value8;
            value8 = void 0, value14 && value12(value14.s, value14.x, value14.y);
          }, PEER_CURSOR_GLIDE_MS);
          return;
        }
        value8 = void 0, value12(input, options2, context);
      },
      say(input) {
        let value13 = sanitizePeerChatMessage(input);
        if (value4 || value13 === text || !value6)
          return !1;
        text = value13;
        let value14 = value8 ?? value6;
        return value8 = void 0, value12(value14.s, value14.x, value14.y), !0;
      },
      live: () => !value4 && value6 !== void 0,
      clear() {
        value11();
      },
      setWho(input, options2) {
        let value13 = Array.from(input).slice(0, 40).join(""), value14 = PEER_COLOR_PATTERN.test(options2) ? options2 : "";
        value13 === "" && value14 === "" || value10({
          who: {
            n: value13,
            c: value14
          }
        });
      },
      dispose() {
        value11(), value4 = !0, value7 !== void 0 && clearTimeout(value7), typeof removeEventListener == "function" && removeEventListener("pagehide", callback);
      }
    };
    return state;
  }
  function visiblePeerCursors(peers, surface, now, profiles = peerProfileCache) {
    let items = [];
    for (let value of peers) {
      if (value.sameTab)
        continue;
      let cursor = value.presence.cursor;
      if (typeof cursor != "object" || cursor === null)
        continue;
      let value2 = cursor;
      if (value2.s !== surface)
        continue;
      let t = value2.t, value3 = typeof t == "number" && Number.isFinite(t) ? Math.min(t, now) : value.updatedAt, value4 = now - value3;
      if (value4 >= PEER_CURSOR_IDLE_TIMEOUT_MS)
        continue;
      let { x: value5, y: value6 } = value2;
      if (typeof value5 != "number" || typeof value6 != "number" || !Number.isFinite(value5) || !Number.isFinite(value6))
        continue;
      let who = value.presence.who, value7 = typeof who == "object" && who !== null ? who : {}, value8 = (value.by !== null && profiles.get(value.by) || (typeof value7.n == "string" ? value7.n : "")).slice(0, 40), value9 = peerColorIndex(value7.c, value.peer), value10 = value.updatedAt > 0 ? now - value.updatedAt : value4, value11 = typeof value2.m == "string" && value10 < PEER_CHAT_HOLD_MS + PEER_CHAT_FADE_MS ? sanitizePeerChatMessage(value2.m).trim() : "";
      items.push({
        peer: value.peer,
        x: value5,
        y: value6,
        name: value8,
        collaborator: value9,
        idleMs: Math.max(0, value4),
        message: value11
      });
    }
    return items;
  }
  function usePeerProfiles(peers) {
    let value = [
      ...new Set(peers.flatMap((input) => input.by !== null && !input.sameTab ? [input.by] : []))
    ].sort().join(`
`), [value2, value3] = runtime2.reactx4.useState(peerProfileCache);
    return runtime2.reactx4.useEffect(() => {
      if (value === "")
        return;
      let flag = !0;
      return (0, runtime2.userProfiles)(value.split(`
`)).then((input) => {
        flag && value3(input);
      }), () => {
        flag = !1;
      };
    }, [value]), value2;
  }
  function usePeerCursors(surface, now = Date.now) {
    let value = runtime2.reactx4.useSyncExternalStore(runtime2.roomPeerStore.subscribe, runtime2.roomPeerStore.getSnapshot, runtime2.roomPeerStore.getSnapshot), value2 = usePeerProfiles(value), [, value3] = runtime2.reactx4.useState(0);
    return runtime2.reactx4.useEffect(() => {
      let value4 = setInterval(() => value3((input) => input + 1), 5e3);
      return () => clearInterval(value4);
    }, []), visiblePeerCursors(value, surface, now(), value2);
  }
  function PeerCursors({ surface, toLocal, glyphScale, className, now, working }) {
    let value = usePeerCursors(surface, now), value2 = glyphScale !== void 0 && Number.isFinite(glyphScale) && glyphScale > 0 ? glyphScale : 1;
    return jsxGY.jsx("div", {
      "aria-hidden": "true",
      className: "mc-peer-cursors " + (className ?? ""),
      children: value.map((input) => {
        let value3 = toLocal(input.x, input.y);
        if (value3 === null)
          return null;
        let value4 = input.idleMs >= PEER_CURSOR_STALE_MS, value5 = peerColorCssVariable(input.collaborator);
        return jsxGY.jsxs("div", {
          className: "mc-peer-cursor",
          "data-idle": value4 ? "true" : void 0,
          style: {
            transform: "translate(" + value3.left + "px," + value3.top + "px)" + (value2 === 1 ? "" : " scale(" + value2 + ")"),
            transformOrigin: "0 0"
          },
          children: [
            jsxGY.jsx(runtime2.PeerCursorArrow, {
              color: value5
            }),
            jsxGY.jsx(PeerCursorTag, {
              name: input.name,
              color: value5,
              message: input.message,
              dim: value4,
              working: working?.has(input.peer) === !0
            })
          ]
        }, input.peer);
      })
    });
  }
  return bindRuntimeValue(runtime2, "jsxGY", () => jsxGY, (value) => {
    jsxGY = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_IDLE_TIMEOUT_MS", () => PEER_CURSOR_IDLE_TIMEOUT_MS, (value) => {
    PEER_CURSOR_IDLE_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_STALE_MS", () => PEER_CURSOR_STALE_MS, (value) => {
    PEER_CURSOR_STALE_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_GLIDE_MS", () => PEER_CURSOR_GLIDE_MS, (value) => {
    PEER_CURSOR_GLIDE_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_COLORS", () => PEER_CURSOR_COLORS, (value) => {
    PEER_CURSOR_COLORS = value;
  }), bindRuntimeValue(runtime2, "peerColorFromId", () => peerColorFromId), bindRuntimeValue(runtime2, "PEER_COLOR_PATTERN", () => PEER_COLOR_PATTERN, (value) => {
    PEER_COLOR_PATTERN = value;
  }), bindRuntimeValue(runtime2, "PEER_COLOR_INDEXES", () => PEER_COLOR_INDEXES, (value) => {
    PEER_COLOR_INDEXES = value;
  }), bindRuntimeValue(runtime2, "peerColorIndex", () => peerColorIndex), bindRuntimeValue(runtime2, "peerColorCssVariable", () => peerColorCssVariable), bindRuntimeValue(runtime2, "MAX_PEER_CHAT_LENGTH", () => MAX_PEER_CHAT_LENGTH, (value) => {
    MAX_PEER_CHAT_LENGTH = value;
  }), bindRuntimeValue(runtime2, "MAX_PEER_CHAT_DISPLAY_LENGTH", () => MAX_PEER_CHAT_DISPLAY_LENGTH, (value) => {
    MAX_PEER_CHAT_DISPLAY_LENGTH = value;
  }), bindRuntimeValue(runtime2, "PEER_CHAT_HOLD_MS", () => PEER_CHAT_HOLD_MS, (value) => {
    PEER_CHAT_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CHAT_FADE_MS", () => PEER_CHAT_FADE_MS, (value) => {
    PEER_CHAT_FADE_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CHAT_EXIT_MS", () => PEER_CHAT_EXIT_MS, (value) => {
    PEER_CHAT_EXIT_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CHAT_CSS_TIMINGS", () => PEER_CHAT_CSS_TIMINGS, (value) => {
    PEER_CHAT_CSS_TIMINGS = value;
  }), bindRuntimeValue(runtime2, "prefersReducedCursorMotion", () => prefersReducedCursorMotion), bindRuntimeValue(runtime2, "usePeerMessageFade", () => usePeerMessageFade), bindRuntimeValue(runtime2, "PeerCursorTag", () => PeerCursorTag, (value) => {
    PeerCursorTag = value;
  }), bindRuntimeValue(runtime2, "sanitizePeerChatMessage", () => sanitizePeerChatMessage), bindRuntimeValue(runtime2, "createCursorPresence", () => createCursorPresence), bindRuntimeValue(runtime2, "peerProfileCache", () => peerProfileCache, (value) => {
    peerProfileCache = value;
  }), bindRuntimeValue(runtime2, "visiblePeerCursors", () => visiblePeerCursors), bindRuntimeValue(runtime2, "usePeerProfiles", () => usePeerProfiles), bindRuntimeValue(runtime2, "usePeerCursors", () => usePeerCursors), bindRuntimeValue(runtime2, "PeerCursors", () => PeerCursors), () => {
    (0, runtime2.initializeUiPropertyFocus)(), jsxGY = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PEER_CURSOR_IDLE_TIMEOUT_MS = 9e5, PEER_CURSOR_STALE_MS = 6e4, PEER_CURSOR_GLIDE_MS = 33, PEER_CURSOR_COLORS = [
      "#62744c",
      "#b04e72",
      "#5b7596",
      "#a3651f",
      "#7a6ba8",
      "#3f7a75"
    ], PEER_COLOR_PATTERN = /^#[0-9a-f]{6}$/i, PEER_COLOR_INDEXES = /* @__PURE__ */ new Map([
      ["#7a6ba8", 1],
      ["#b04e72", 2],
      ["#3f7a75", 3],
      ["#62744c", 4],
      ["#a3651f", 5],
      ["#5b7596", 6],
      ["#c7c9d1", 6]
    ]), MAX_PEER_CHAT_LENGTH = 128, MAX_PEER_CHAT_DISPLAY_LENGTH = 50, PEER_CHAT_HOLD_MS = 5e3, PEER_CHAT_FADE_MS = 600, PEER_CHAT_EXIT_MS = 150, PEER_CHAT_CSS_TIMINGS = {
      "--mc-chat-hold": PEER_CHAT_HOLD_MS + "ms",
      "--mc-chat-fade": PEER_CHAT_FADE_MS + "ms",
      "--mc-chat-exit": PEER_CHAT_EXIT_MS + "ms"
    }, PeerCursorTag = runtime2.reactx4.memo(function({ name, color, message, dim, working }) {
      let ref = runtime2.reactx4.useRef({
        m: "",
        n: 0
      });
      message !== ref.current.m && (ref.current = {
        m: message,
        n: message === "" ? ref.current.n : ref.current.n + 1
      });
      let [value, value2] = runtime2.reactx4.useState(0), value3 = message !== "" && value !== ref.current.n ? "line" : "name", value4 = usePeerMessageFade(value3);
      return dim && value3 === "name" && !working ? null : jsxGY.jsxs("span", {
        ref: value4,
        className: "mc-peer-tag " + (value3 === "name" ? "mc-peer-cursor-label" : "mc-cursor-chat"),
        "data-mode": value3,
        "data-working": working && value3 === "name" ? "true" : void 0,
        "data-beat": value3 === "line" ? ref.current.n % 2 : void 0,
        style: {
          background: color,
          ...PEER_CHAT_CSS_TIMINGS
        },
        onAnimationEnd: (event) => {
          event.target === event.currentTarget && event.animationName === "mc-cursor-chat-fade-" + ref.current.n % 2 && value2(ref.current.n);
        },
        children: [
          value3 === "name" ? jsxGY.jsx("span", {
            className: "mc-peer-tag-name",
            children: (name || "Someone").slice(0, 16)
          }, "name") : jsxGY.jsx("span", {
            className: "mc-peer-tag-line",
            children: message
          }, "line"),
          working && value3 === "name" ? jsxGY.jsxs("span", {
            className: "mc-peer-tag-dots",
            children: [
              jsxGY.jsx("i", {}),
              jsxGY.jsx("i", {}),
              jsxGY.jsx("i", {})
            ]
          }) : null
        ]
      });
    }), peerProfileCache = /* @__PURE__ */ new Map();
  };
}
export {
  installUiPeerCursors
};
