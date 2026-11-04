// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPeerCursors(runtime2) {
  var PEER_COLORS, RESERVED_PEER_COLORS, LEGACY_PEER_COLORS, rotatePeerColors, peerNameCache, knownPeerColor, peerWho, peerColorClaims, peerClaimPrecedes, sortPeerColorClaims, jsxGY, PEER_CURSOR_IDLE_TIMEOUT_MS, PEER_CURSOR_STALE_MS, PEER_CURSOR_GLIDE_MS, PEER_CURSOR_FOCUS_LOOK_MS, PEER_COLOR_PATTERN, MAX_PEER_CHAT_LENGTH, MAX_PEER_CHAT_DISPLAY_LENGTH, PEER_CHAT_HOLD_MS, PEER_CHAT_FADE_MS, PEER_CHAT_EXIT_MS, PEER_CHAT_CSS_TIMINGS, PeerCursorTag, peerProfileCache, INTERACTIVE_TARGET_SELECTOR;
  function normalizePeerName(name) {
    if (typeof name != "string")
      return "";
    let maxLength = runtime2.MAX_PEER_NAME_LENGTH, key = name.slice(0, maxLength * 4), value = peerNameCache.get(key);
    if (value === void 0) {
      let characters = Array.from(Array.from(key.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, " ")).filter((input) => !(0, runtime2.isDroppedPeerNameCharacter)(input)).join("").trim());
      value = characters.length > maxLength ? characters.slice(0, maxLength - 1).join("").trimEnd() + "…" : characters.join(""), runtime2.EMPTY_PRESENCE_LABEL_PATTERN.test(value) && (value = ""), peerNameCache.size >= 200 && peerNameCache.clear(), peerNameCache.set(key, value);
    }
    return value;
  }
  function peerColorFromId(id) {
    let index4 = 0;
    for (let index22 = 0; index22 < id.length; index22++)
      index4 = index4 * 31 + id.charCodeAt(index22) >>> 0;
    return rotatePeerColors(PEER_COLORS[index4 % PEER_COLORS.length] ?? "", RESERVED_PEER_COLORS)[0] ?? "#785ee8";
  }
  function peerColor(color, id) {
    return knownPeerColor(color) ?? peerColorFromId(id);
  }
  function peerInkColor(background) {
    let [red = 0, green = 0, blue = 0] = [1, 3, 5].map((input) => {
      let value = parseInt(background.slice(input, input + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 1.05 / (0.2126 * red + 0.7152 * green + 0.0722 * blue + 0.05) < 3 ? "#0b0b0b" : "#ffffff";
  }
  function leastUsedPeerColor(color, taken, reserved = RESERVED_PEER_COLORS) {
    if (!reserved.includes(color) && !taken.includes(color))
      return color;
    let colors = rotatePeerColors(color, reserved), countOf = (input) => taken.filter((input2) => input2 === input).length;
    return colors.reduce((input, input2) => countOf(input2) < countOf(input) ? input2 : input);
  }
  function peerColorClaim(peer) {
    let { c, t } = peerWho(peer), value = knownPeerColor(c);
    return value !== void 0 && typeof t == "number" && Number.isFinite(t) ? {
      key: peer.by ?? peer.peer,
      peer: peer.peer,
      own: peer.isMe,
      c: value,
      t
    } : void 0;
  }
  function takenPeerColors(peers) {
    let legacy = peers.flatMap( (input) => {
      let { c, t } = peerWho(input);
      return !input.isMe && input.agent !== !0 && t === void 0 &&typeof c == "string" && Object.hasOwn(LEGACY_PEER_COLORS, c.toLowerCase()) ? [LEGACY_PEER_COLORS[c.toLowerCase()] ?? ""] : [];
    });
    return [
      ...peerColorClaims(peers).filter((input) => !input.own).map((input) => input.c),
      ...legacy
    ];
  }
  function createPeerColorPicker(options, onChange = () => {
  }) {
    let { publish, peers, kept, now } = options, reserved = options.neverGiven ?? RESERVED_PEER_COLORS, allowed = (input) => input === void 0 || reserved.includes(input.c) ? void 0 : input, keptColor = knownPeerColor(kept.read()), worn = leastUsedPeerColor(keptColor !== void 0 && !reserved.includes(keptColor) ? keptColor : peerColor(options.usual, options.name), [], reserved), claimedAt = null, [retries, lastRetryAt] = [0, -1 / 0], cancelSettle, awayState, [lastTickAt, wokeAt] = [now(), -1 / 0], checkWake = () => {
      let value = now(), woke = value - lastTickAt > 1e4;
      return woke && (wokeAt = value), lastTickAt = value, woke;
    }, publishedKey, wear =(color, at) => {
      let changed = color !== worn;
      [worn, claimedAt] = [color, at], at !== null && kept.write(worn), publishedKey !== (publishedKey = worn + String(claimedAt)) && publish({
        n : options.name,
        c: worn,
        t: claimedAt
      }), changed && onChange();
    }, release = () => {
      awayState?.cancel(), awayState = void 0, wear(worn, null);
    }, earliestPerKey = (input) => input.filter((input2) => !input.some((input3) => input3.key === input2.key && input3.own === input2.own && peerClaimPrecedes(input3, input3.peer, input2, input2.peer))), liveClaims = (input) => earliestPerKey(peerColorClaims(input).filter((input2) => allowed(input2) !== void 0)), contested = (input, color, claim) => {
      let self2 = input.find((input2) => input2.sameTab);
      return liveClaims(input).some((input2) => !input2.own && input2.c === color && peerClaimPrecedes(input2, input2.key, claim, self2?.by ?? self2?.peer ?? ""));
    }, yieldColor = (input, color, claim) => {
      let self2 = input.find((input2) => input2.sameTab), mine = {
        key: self2?.by ?? self2?.peer ?? "",
        peer: self2?.peer ?? "",
        own: !0,
        c: color,
        t: claim.t
      }, ordered = sortPeerColorClaims([
        ...liveClaims(input).filter((input2) => !input2.own),
        mine
      ]), losers = ordered.filter((input2) => input2 === mine || ordered.some((input3) => input3 !== input2 && input3.c === input2.c && peerClaimPrecedes(input3, input3.key, input2, input2.key))), used = /* @__PURE__ */ new Set([color, ...takenPeerColors(input)]);
      for (let value of losers) {
        let next = rotatePeerColors(value.c, reserved).find((input2) => !used.has(input2));
        if (next === void 0 || value === mine)
          return next;
        used.add(next);
      }
    }, ownClaim = (input) => liveClaims(input).find((input2) => input2.own), settle = () => {
      cancelSettle = void 0;
      let value = peers(), claim = ownClaim(value);
      claim === void 0 ? wear(leastUsedPeerColor(worn, takenPeerColors(value), reserved), now()) : wear((contested(value, claim.c, claim) ? yieldColor(value, claim.c, claim) : void 0) ?? claim.c, claim.t);
  }, heard = () => {
      if (awayState !== void 0)
        return;
      let value = peers(), claim = ownClaim(value);
      if(claimedAt === null) {
        claim !== void 0 && claim.c !== worn && wear(claim.c, null);
    return;
      }
      let current = {
        t: claimedAt
      };
      if (claim !== void 0 && peerClaimPrecedes(claim, claim.peer, current, value.find((input) => input.sameTab)?.peer ?? "") && !(contested(value, claim.c, claim) && yieldColor(value, claim.c, claim) !== void 0)) {
        (claim.c !== worn || claim.t !== claimedAt) && wear(claim.c, claim.t);
        return;
      }
      now() - lastRetryAt > 6e4 && (retries = 0);
      let next = contested(value, worn, current) && retries < rotatePeerColors(worn, reserved).length ? yieldColor(value, worn, current) : void 0;
      next !== void 0 && ([retries, lastRetryAt] =[retries +1, now()], wear(next, claimedAt));
    }, stopTicking = options.every(() => {
      checkWake() && awayState !== void 0 && release(), heard();
    }, 2e3), selfClaim = () => ((input) => input === void 0 ? void 0 : peerColorClaim(input))(peers().find((input) => input.sameTab)), allowedSelfClaim = () => allowed(selfClaim());
    if (allowedSelfClaim() === void 0) {
      publishedKey = worn + String(null);
      let value = selfClaim() !== void 0 || (keptColor === void 0 ? reserved.length > 0 : reserved.includes(keptColor));
      publish(value ? {
        n: options.name,
        c: worn,
        t: null
      } : {
        n: options.name,
        c: worn
      });
    }
    return {
      worn: () => worn,
      heard,
      here() {
        let value = awayState;
        awayState = void 0, value?.cancel();
        let expired = value !== void 0 && now() - value.at >= 8e3;
        if (expired && wear(worn, null), value !== void 0 && !expired)
          return heard();
        if (cancelSettle !== void 0 || claimedAt !== null)
          return;
        let claim = expired ? void 0 : allowedSelfClaim();
        if (claim !== void 0)
          return wear(claim.c, claim.t);
        retries = 0, wear(worn, null), cancelSettle = options.after(settle, 1500);
      },
      away() {
        if (cancelSettle?.(), cancelSettle = void 0, !(claimedAt === null || awayState !== void 0)) {
          if (checkWake(), now() - wokeAt < 6e4)
            return wear(worn, null);
          awayState = {
            at: now(),
            cancel: options.after(release, 8e3)
          };
        }
      },
      dispose() {
        awayState !== void 0 && release(), cancelSettle?.(), stopTicking(), cancelSettle = void 0;
      }
    };
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
  function watchCursorLeave(onLeave, staysWithoutMouse) {
    if (typeof document == "undefined")
      return () => {
      };
    let root = document.documentElement, onPointerLeave = (event) => void (event.pointerType === "mouse" && !(staysWithoutMouse && document.hasFocus()) && onLeave()), onVisibilityChange = () => void (document.hidden && onLeave());
    return root.addEventListener("pointerleave", onPointerLeave), document.addEventListener("visibilitychange", onVisibilityChange), () => {
      root.removeEventListener("pointerleave", onPointerLeave), document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }
  function createCursorPresence(options = {}) {
    let now = options.now ?? (() => Date.now()), minDelta = options.minDelta ?? 2e-3, idleNullMs = options.idleNullMs ?? PEER_CURSOR_IDLE_TIMEOUT_MS, off = !(0, runtime2.hasHostRoomApi)(), disposed = !1, stopWho = () => {
    }, published, latest, glideTimer, pending, idleTimer, shown = !1, text = "", pointer2 = "off", focusTimer, hadFocus = !1;
    async function send(input) {
      if (off)
        return;
      let room = await (0, runtime2.cachedHostRoom)();
      if (typeof room?.presence != "function") {
        off = !0;
        return;
      }
      try {
        await room.presence.call(room, input);
      } catch (error) {
        let code = typeof error == "object" && error !== null ? error.code : "";
        code !== "upstream_error" && code !== "invalid_argument" && (off = !0);
      }
    }
    function lookForFocus() {
      if (focusTimer = void 0, off)
        return;
      let lost = hadFocus && !document.hasFocus();
      if (hadFocus = document.hasFocus(), lost)
        return leave();
      focusTimer = setTimeout(lookForFocus, options.focusLookMs ?? PEER_CURSOR_FOCUS_LOOK_MS);
    }
    function withdraw() {
      idleTimer !== void 0 && clearTimeout(idleTimer), idleTimer = void 0, clearTimeout(focusTimer), focusTimer = void 0, hadFocus = !1, pending = void 0, published = void 0, shown && (shown = !1, send({
        cursor: null
      }));
    }
    function publish(surface, x, y) {
      let at = now();
      published = {
        s: surface,
        x,
        y,
        at
      }, latest = {
        s: surface,
        x,
        y
      }, shown = !0;
      let round2 = (input) => Math.round(input * 1e4) / 1e4;
      send({
        cursor: {
          s: surface.slice(0, MAX_PEER_CHAT_LENGTH),
          x: round2(x),
          y: round2(y),
          t: at,
          ...text === "" ? {} : {
            m: text
          }
        }
      }), idleTimer !== void 0 && clearTimeout(idleTimer), idleTimer = setTimeout(() => leave(!0), idleNullMs), focusTimer === void 0 && typeof document != "undefined" && lookForFocus();
    }
    function leave(force = !1) {
      pointer2 = "gone", (force || text === "") && withdraw();
    }
    let onPageHide = () => {
      text = "", leave(!0);
    };
    typeof addEventListener == "function" && addEventListener("pagehide", onPageHide);
    let stopWatching = watchCursorLeave(leave, options.staysWithoutMouse === !0);
    return {
      move(surface, x, y, unlessGone = !1) {
        if (off || unlessGone && pointer2 === "gone" || !Number.isFinite(x) || !Number.isFinite(y) || typeof document != "undefined" && document.hidden || (pointer2 = "on", published && published.s === surface && Math.abs(published.x - x) < minDelta && Math.abs(published.y - y) < minDelta))
          return;
        let at = now();
        if (published && published.s === surface && at - published.at < PEER_CURSOR_GLIDE_MS) {
          pending = {
            s: surface,
            x,
            y
          }, glideTimer ??= setTimeout(() => {
            glideTimer = void 0;
            let value = pending;
            pending = void 0, value && publish(value.s, value.x, value.y);
          }, PEER_CURSOR_GLIDE_MS);
          return;
        }
        pending = void 0, publish(surface, x, y);
      },
      say(message) {
        let value = sanitizePeerChatMessage(message);
        if (off || value === text || !latest)
          return !1;
        if (
        text = value, pointer2 !== "on" && text === "")
          return withdraw(), !0;
        let value2 = pending ?? latest;
        return pending = void 0, publish(value2.s, value2.x, value2.y), !0;
      },
      live: () => !off && latest !== void 0,
      shown: () => shown ? latest : void 0,
      clear() {
        pointer2 === "on" && (pointer2 = "off"), text = "", withdraw();
      },
      setWho(name, color) {
        let value = normalizePeerName(name), value2 = PEER_COLOR_PATTERN.test(color) ? color : "";
        value === "" && value2 === "" || disposed || (stopWho(), stopWho = (0, runtime2.startPeopleColor)(value, value2));
      },
      dispose() {
        withdraw(), off = disposed = !0, glideTimer !== void 0 && clearTimeout(glideTimer), typeof removeEventListener == "function" && removeEventListener("pagehide", onPageHide), stopWatching(), stopWho();
      }
    };
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
      let who = value.presence.who, value7 = typeof who == "object" && who !== null ? who : {}, value8 = normalizePeerName( (value.by !== null ? profiles.get(value.by) : void 0) ?? value7.n), value9 = peerColor(value7.c, value.by ?? value.peer), value10 = value.updatedAt > 0 ? now - value.updatedAt : value4, value11 = typeof value2.m == "string" && value10 < PEER_CHAT_HOLD_MS + PEER_CHAT_FADE_MS ? sanitizePeerChatMessage(value2.m).trim() : "";
      items.push({
        peer: value.peer,
        x: value5,
        y: value6,
        name: value8,
        color: value9,
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
  function PeerCursors({ surface, toLocal, glyphScale, className, now }) {
    let value = usePeerCursors(surface, now), value2 = glyphScale !== void 0 && Number.isFinite(glyphScale) && glyphScale > 0 ? glyphScale : 1;
    return jsxGY.jsx("div", {
      "aria-hidden": "true",
      className: "mc-peer-cursors " + (className ?? ""),
      children: value.map((input) => {
        let value3 = toLocal(input.x, input.y);
        if (value3 === null)
          return null;
        let value4 = input.idleMs >= PEER_CURSOR_STALE_MS;
        return jsxGY.jsxs("div", {
          className: "mc-peer-cursor",
          "data-idle": value4 ? "true" : void 0,
          style: {
            transform: "translate(" + value3.left + "px," + value3.top + "px)" + (value2 === 1 ? "" : " scale(" + value2 + ")"),
            transformOrigin: "0 0"
          },
          children: [
            jsxGY.jsx(runtime2.PeerCursorArrow, {
              color: input.color
            }),
            jsxGY.jsx(PeerCursorTag, {
              name: input.name,
              color: input.color,
              message: input.message,
              dim: value4
            })
          ]
        }, input.peer);
      })
    });
  }
  return bindRuntimeValue(runtime2, "PEER_COLORS", () => PEER_COLORS, (value) => {
    PEER_COLORS = value;
  }), bindRuntimeValue(runtime2, "RESERVED_PEER_COLORS", () => RESERVED_PEER_COLORS, (value) => {
    RESERVED_PEER_COLORS = value;
  }), bindRuntimeValue(runtime2, "LEGACY_PEER_COLORS", () => LEGACY_PEER_COLORS, (value) => {
    LEGACY_PEER_COLORS = value;
  }), bindRuntimeValue(runtime2, "rotatePeerColors", () => rotatePeerColors, (value) => {
    rotatePeerColors = value;
  }), bindRuntimeValue(runtime2, "peerNameCache", () => peerNameCache, (value) => {
    peerNameCache = value;
  }), bindRuntimeValue(runtime2, "normalizePeerName", () => normalizePeerName), bindRuntimeValue(runtime2, "peerColorFromId", () => peerColorFromId), bindRuntimeValue(runtime2, "knownPeerColor", () => knownPeerColor, (value) => {
    knownPeerColor = value;
  }), bindRuntimeValue(runtime2, "peerColor", () => peerColor), bindRuntimeValue(runtime2, "peerInkColor", () => peerInkColor), bindRuntimeValue(runtime2, "leastUsedPeerColor", () => leastUsedPeerColor), bindRuntimeValue(runtime2, "peerWho", () => peerWho, (value) => {
    peerWho = value;
  }), bindRuntimeValue(runtime2, "peerColorClaim", () => peerColorClaim), bindRuntimeValue(runtime2, "peerColorClaims", () => peerColorClaims, (value) => {
    peerColorClaims = value;
  }), bindRuntimeValue(runtime2, "takenPeerColors", () => takenPeerColors), bindRuntimeValue(runtime2, "peerClaimPrecedes", () => peerClaimPrecedes, (value) => {
    peerClaimPrecedes = value;
  }), bindRuntimeValue(runtime2, "sortPeerColorClaims", () => sortPeerColorClaims, (value) => {
    sortPeerColorClaims = value;
  }), bindRuntimeValue(runtime2, "createPeerColorPicker", () => createPeerColorPicker), bindRuntimeValue(runtime2, "jsxGY", () => jsxGY, (value) => {
    jsxGY = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_IDLE_TIMEOUT_MS", () => PEER_CURSOR_IDLE_TIMEOUT_MS, (value) => {
    PEER_CURSOR_IDLE_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_STALE_MS", () => PEER_CURSOR_STALE_MS, (value) => {
    PEER_CURSOR_STALE_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_GLIDE_MS", () => PEER_CURSOR_GLIDE_MS, (value) => {
    PEER_CURSOR_GLIDE_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_CURSOR_FOCUS_LOOK_MS", () => PEER_CURSOR_FOCUS_LOOK_MS, (value) => {
    PEER_CURSOR_FOCUS_LOOK_MS = value;
  }), bindRuntimeValue(runtime2, "PEER_COLOR_PATTERN", () => PEER_COLOR_PATTERN, (value) => {
    PEER_COLOR_PATTERN = value;
  }), bindRuntimeValue(runtime2, "MAX_PEER_CHAT_LENGTH", () => MAX_PEER_CHAT_LENGTH, (value) => {
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
  }), bindRuntimeValue(runtime2, "sanitizePeerChatMessage", () => sanitizePeerChatMessage), bindRuntimeValue(runtime2, "watchCursorLeave", () => watchCursorLeave), bindRuntimeValue(runtime2, "createCursorPresence", () => createCursorPresence), bindRuntimeValue(runtime2, "peerProfileCache", () => peerProfileCache, (value) => {
    peerProfileCache = value;
  }), bindRuntimeValue(runtime2, "visiblePeerCursors", () => visiblePeerCursors), bindRuntimeValue(runtime2, "usePeerProfiles", () => usePeerProfiles), bindRuntimeValue(runtime2, "usePeerCursors", () => usePeerCursors), bindRuntimeValue(runtime2, "PeerCursors", () => PeerCursors), bindRuntimeValue(runtime2, "INTERACTIVE_TARGET_SELECTOR", () => INTERACTIVE_TARGET_SELECTOR, (value) => {
    INTERACTIVE_TARGET_SELECTOR = value;
  }), () => {
    (0, runtime2.initializeUiPropertyFocus)(), PEER_COLORS = [
      "#785ee8",
      "#dc3c3d",
      "#019c7f",
      "#fbb315",
      "#ce447d",
      "#10a122",
      "#257de0",
      "#d25f25"
    ], RESERVED_PEER_COLORS = ["#d25f25"], LEGACY_PEER_COLORS = {
      "#7a6ba8": "#785ee8",
      "#b04e72": "#ce447d",
      "#3f7a75": "#019c7f",
      "#62744c": "#10a122",
      "#a3651f": "#fbb315",
      "#5b7596": "#257de0"
    }, rotatePeerColors = (input, excluded) => {
      let start = Math.max (0, PEER_COLORS.indexOf(input));
      return PEER_COLORS.map((_color, index4) => PEER_COLORS[(start + index4) % PEER_COLORS.length] ?? input).filter((input2) => !excluded.includes(input2));
    }, peerNameCache = /* @__PURE__ */ new Map(), knownPeerColor = (input) => {
      let value = typeof input == "string" ? input.toLowerCase() : "";
      return PEER_COLORS.includes(value) ? value : Object.hasOwn(LEGACY_PEER_COLORS, value) ? LEGACY_PEER_COLORS[value] : void 0;
    }, peerWho = (input) => {
      let who = input.presence.who;
      return typeof who == "object" && who !== null ? who : {};
    }, peerColorClaims = (input) => input.flatMap((input2) => input2.sameTab || input2.agent === !0 ? [] : peerColorClaim(input2) ?? []), peerClaimPrecedes = (a, aKey, b, bKey) => a.t < b.t || a.t === b.t && aKey < bKey, sortPeerColorClaims = (input) => {
      let items = [
    ];
      for (let value of input) {
        let index4 = items.findIndex((input2) => peerClaimPrecedes(value, value.key, input2, input2.key));
        items.splice(index4 < 0 ? items.length : index4, 0, value);
      }
      return items;
    }, jsxGY = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PEER_CURSOR_IDLE_TIMEOUT_MS = 9e5, PEER_CURSOR_STALE_MS = 6e4, PEER_CURSOR_GLIDE_MS = 33, PEER_CURSOR_FOCUS_LOOK_MS = 500, PEER_COLOR_PATTERN = /^#[0-9a-f]{6}$/i, MAX_PEER_CHAT_LENGTH = 128, MAX_PEER_CHAT_DISPLAY_LENGTH = 50, PEER_CHAT_HOLD_MS = 5e3, PEER_CHAT_FADE_MS = 600, PEER_CHAT_EXIT_MS = 150, PEER_CHAT_CSS_TIMINGS = {
      "--mc-chat-hold": PEER_CHAT_HOLD_MS + "ms",
      "--mc-chat-fade": PEER_CHAT_FADE_MS + "ms",
      "--mc-chat-exit": PEER_CHAT_EXIT_MS + "ms"
    }, PeerCursorTag = runtime2.reactx4.memo(function({ name, color, message, dim }) {
      let ref = runtime2.reactx4.useRef({
        m: "",
        n: 0
      });
      message !== ref.current.m && (ref.current = {
        m: message,
        n: message === "" ? ref.current.n : ref.current.n + 1
      });
      let [value, value2] = runtime2.reactx4.useState(0), value3 = message !== "" && value !== ref.current.n ? "line" : "name", value4 = usePeerMessageFade(value3);
      return dim && value3 === "name" ? null : jsxGY.jsx("span", {
        ref: value4,
        className: "mc-peer-tag " + (value3 === "name" ? "mc-peer-cursor-label" : "mc-cursor-chat"),
        "data-mode": value3,
        "data-beat": value3 === "line" ? ref.current.n % 2 : void 0,
        style: {
          background: color,
          color: peerInkColor(color),
          ...PEER_CHAT_CSS_TIMINGS
        },
        onAnimationEnd: (event) => {
          event.target === event.currentTarget && event.animationName === "mc-cursor-chat-fade-" + ref.current.n % 2 && value2(ref.current.n);
        },
        children:
          value3 === "name" ? jsxGY.jsx("span", {
            className: "mc-peer-tag-name",
          dir: "auto",
            children:name || (0, runtime2.formatMessage)({
            defaultMessage: "其他人",
            id: "o1QUYZ/lqo"
          })
          }, "name") : jsxGY.jsx("span", {
            className: "mc-peer-tag-line",
            children: message
          }, "line")
      });
    }), peerProfileCache = /* @__PURE__ */ new Map(), INTERACTIVE_TARGET_SELECTOR = "button,a[href],summary," + [
      "button",
      "link",
      "checkbox",
      "radio",
      "switch",
      "tab",
      "option",
      "menuitem",
      "menuitemradio",
      "menuitemcheckbox"
    ].map((input) => '[role="' + input + '"]').join();
  };
}
export {
  installUiPeerCursors
};
