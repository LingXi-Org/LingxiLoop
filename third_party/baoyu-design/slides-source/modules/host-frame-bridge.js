// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostFrameBridge(runtime2) {
  var react_z, SAVE_NOW_COMMAND, OPEN_FIND_COMMAND, EXPORT_FORMAT_PATTERN, validExportTimeout, MAX_HOST_EXPORT_FORMATS, HOST_DESTINATION_PATTERN, MAX_HOST_DESTINATIONS, HOST_REQUEST_ID_PATTERN, HOST_COMMAND_PATTERN, MAX_HOST_COMMANDS, MAX_HOST_FOOT_INSET, HOST_BACKGROUND_HEX_PATTERN, DEFAULT_HOST_ORIGINS, allowedHostOrigins, hostFrameBridge, hostFootState, hostFootInsets, CHAT_TOGGLE_COMMAND, HAND_OFF_CODE_COMMAND, MAX_HOST_ACTIONS, hostChatClaims, hostFootInset, hostFootInsetListeners, hostFootUpdateQueued;
  function normalizeHostBackgroundColor(color) {
    let value = color.trim(), value2 = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)$/.exec(value), text = "(\\d*\\.?\\d+(?:e[-+]?\\d+)?%?)", value3 = value2 === null ? new RegExp("^color\\(\\s*srgb\\s+(\\d*\\.?\\d+(?:e[-+]?\\d+)?%?)\\s+(\\d*\\.?\\d+(?:e[-+]?\\d+)?%?)\\s+(\\d*\\.?\\d+(?:e[-+]?\\d+)?%?)(?:\\s*\\/\\s*(\\d*\\.?\\d+(?:e[-+]?\\d+)?%?))?\\s*\\)$").exec(value) : null, value4 = value2 ?? value3;
    if (value4 === null)
      return null;
    let callback = (input) => input.endsWith("%") ? Number.parseFloat(input) / 100 : Number.parseFloat(input), value5 = value4[4];
    if (value5 !== void 0 && callback(value5) < 1)
      return null;
    let value6 = [value4[1], value4[2], value4[3]].map((input) => value2 !== null ? Number.parseInt(input, 10) : Math.round(callback(input) * 255));
    return value6.some((input) => !(input >= 0 && input <= 255)) ? null : "#" + value6.map((input) => input.toString(16).padStart(2, "0")).join("");
  }
  function readHostBackgroundColor(element) {
    try {
      return normalizeHostBackgroundColor(getComputedStyle(element).backgroundColor);
    } catch {
      return null;
    }
  }
  function hostSaveStatus(status) {
    switch (status) {
      case "loading":
        return null;
      case "cached":
        return "reconnecting";
      case "ready":
      case "saved":
        return "saved";
      case "dirty":
      case "saving":
        return "saving";
      case "readonly":
        return "readonly";
      case "error":
        return "unsaved";
    }
  }
  function hostOrigins(ownWindow) {
    let value = ownWindow.__FRAME_PREAMBLE?.origins;
    return Array.isArray(value) ? value.filter((input) => typeof input == "string") : DEFAULT_HOST_ORIGINS;
  }
  function isAllowedHostOrigin(origin, allowedOrigins) {
    for (let value of allowedOrigins)
      if (value.endsWith(":*"))
        try {
          let value2 = new URL(origin);
          if (`${value2.protocol}//${value2.hostname}:*` === value)
            return !0;
        } catch {
        }
      else if (origin === value)
        return !0;
    return !1;
  }
  function normalizeHostExportFormats(formats) {
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of formats) {
      if (typeof value.format != "string" || !EXPORT_FORMAT_PATTERN.test(value.format) || values.has(value.format))
        continue;
      values.add(value.format);
      let value2 = value.handoff === !0, state = {
        format: value.format,
        ...value.disabled === !0 && {
          disabled: !0
        },
        ...!value2 && value.interactive === !0 && {
          interactive: !0
        },
        ...!value2 && value.bundle === !0 && {
          bundle: !0
        },
        ...value2 && {
          handoff: value2
        }
      }, value3 = !value2 && Array.isArray(value.variants) ? normalizeHostDestinations(value.variants) : [];
      if (value3.length > 0 && (state.variants = value3), items.push(state), items.length === MAX_HOST_EXPORT_FORMATS)
        break;
    }
    return items;
  }
  function normalizeHostDestinations(destinations) {
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of destinations)
      if (!(typeof value?.id != "string" || !HOST_DESTINATION_PATTERN.test(value.id) || values.has(value.id)) && (values.add(value.id), items.push(value.disabled === !0 ? {
        id: value.id,
        disabled: !0
      } : {
        id: value.id
      }), items.length === MAX_HOST_DESTINATIONS))
        break;
    return items;
  }
  function normalizeHostCommands(commands) {
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of commands)
      if (!(typeof value.id != "string" || !HOST_COMMAND_PATTERN.test(value.id) || values.has(value.id)) && (values.add(value.id), items.push(value.disabled === !0 ? {
        id: value.id,
        disabled: !0
      } : {
        id: value.id
      }), items.length === MAX_HOST_COMMANDS))
        break;
    return items;
  }
  function normalizeHostTips(tips) {
    return Array.isArray(tips) && tips.length <= 8 && tips.every((input) => typeof input == "string") ? tips : [];
  }
  function createHostFrameBridge(options) {
    let parentWindow = options.parentWindow, value = null, flag = !1, values = /* @__PURE__ */ new Set(), words = null, rowsOff = !1, noChrome = !1, flag2 = !1, chatHolds = 0, value2 = null, handOffCode = !1, actions = [], actionHandler = null, value3 = null, value4 = null, value5 = null, value6 = null, index4 = 0, value7 = null, value8, value9 = null, value10 = null, value11 = null, values2 = /* @__PURE__ */ new Set(), callback = () => flag && value7?.saved !== void 0, callback2 = () => flag && values.has("readonly") && value7?.saved === "readonly", callback3 = () => flag && values.has("claude_tips"), offersChatToggle = () => flag && values.has("chat_toggle"), mayOfferChatToggle = () => parentWindow !== null && !rowsOff && !noChrome, callback4 = () => callback() && value9 !== null && value7?.actions?.some((input) => input.id === SAVE_NOW_COMMAND) === !0, callback5 = () => String(flag) + String(callback()) + String(callback4()) + String(callback2()) + String(callback3()) + String(offersChatToggle()) + String(mayOfferChatToggle()) + JSON.stringify(words && [...words]), value12 = callback5(), callback6 = () => {
      let value13 = callback5();
      if (value13 !== value12) {
        value12 = value13;
        for (let value14 of values2)
          try {
            value14();
          } catch {
          }
      }
    }, callback7 = () => {
      if (value3 === null && value4 === null && value5 === null && value6 === null && index4 === 0)
        return null;
      let state = {
        v: 1
      };
      value3 !== null && (state.saved = value3.saved, state.actions = value3.saveNow ? [
        {
          id: SAVE_NOW_COMMAND
        }
      ] : []), index4 > 0 && (state.leaveLosesWork = !0);
      let value13 = value4?.filter((input) => input.handoff !== !0) ?? [], value14 = value4?.filter((input) => input.handoff === !0).map(({ handoff, ...props }) => props) ?? [];
      return value13.length > 0 && (state.exports = value13), value14.length > 0 && (state.handoffs = value14), value5 !== null && (state.destinations = value5), value6?.footInset !== void 0 && (state.footInset = value6.footInset), value6?.ground !== void 0 && (state.ground = value6.ground), value6?.footCenter !== void 0 && (state.footCenter = value6.footCenter), value6?.footSlotX !== void 0 && value6.footSlotY !== void 0 && (state.footSlotX = value6.footSlotX, state.footSlotY = value6.footSlotY, value6.footSlotW !== void 0 && (state.footSlotW = value6.footSlotW)), value6?.ownChat === !0 && (state.ownChat = !0), state;
    }, callback8 = () => {
      let value13 = callback7(), value14 = value13 ?? {
        v: 1
      }, extra = [
        ...flag2 ? [{ id: OPEN_FIND_COMMAND }] : [],
        ...handOffCode ? [{ id: HAND_OFF_CODE_COMMAND }] : [],
        ...chatHolds > 0 ? [{ id: CHAT_TOGGLE_COMMAND }] : [],
        ...actions
      ], value15 = extra.length > 0 ? {
        ...value14,
        actions: [...value14.actions ?? [], ...extra]
      } : value13, value16 = JSON.stringify(value15);
      value16 !== value8 && (value7 = value15, value8 = value16, value !== null && callback10(value15, value), callback6());
    }, callback9 = (input, options2) => {
      let value13 = [
        ...value7?.exports ?? [],
        ...value7?.handoffs ?? []
      ].find((input2) => input2.format === input && input2.disabled !== !0);
      return value13 === void 0 ? !1 : options2 === void 0 || value13.variants?.some((input2) => input2.id === options2 && input2.disabled !== !0) === !0;
    }, callback10 = (input, options2) => {
      try {
        parentWindow?.postMessage({
          __frame_chrome_report: !0,
          snapshot: input
        }, options2);
      } catch {
      }
    }, callback11 = (dataset) => {
      if (parentWindow === null || dataset.source !== parentWindow || !isAllowedHostOrigin(dataset.origin, options.origins))
        return;
      let data = dataset.data;
      if (data?.__frame_chrome_none === !0) {
        value = dataset.origin, noChrome = !0, value7 !== null && callback10(value7, dataset.origin), callback6();
        return;
      }
      let value13 = data?.__frame_chrome_poke === !0, value14 = data?.__frame_chrome_cmd === !0;
      if (!(!value13 && !value14)) {
        if (value = dataset.origin, data?.rows !== !1 && (flag = !0), value13 && (values = new Set(normalizeHostTips(data?.words)), words = data?.rows === !1 ? /* @__PURE__ */ new Set() : values, rowsOff = data?.rows === !1, noChrome = !1), value13 && value7 !== null && callback10(value7, dataset.origin), callback6(), value14 && data?.cmd === "action" && data.id === OPEN_FIND_COMMAND && value7?.actions?.some((input) => input.id === OPEN_FIND_COMMAND))
          try {
            value2?.();
          } catch (value15) {
            typeof reportError == "function" ? reportError(value15) : console.error(value15);
          }
        if (value14 && data?.cmd === "action" && data.id === SAVE_NOW_COMMAND && value7?.actions?.some((input) => input.id === SAVE_NOW_COMMAND))
          try {
            value9?.();
          } catch (value15) {
            typeof reportError == "function" ? reportError(value15) : console.error(value15);
          }
        if (value14 && data?.cmd === "action" && typeof data.id == "string" && actions.some((input) => input.id === data.id))
          try {
            actionHandler?.(data.id, typeof data.peer == "string" && data.peer.length <= 64 ? data.peer : void 0);
          } catch (value15) {
            typeof reportError == "function" ? reportError(value15) : console.error(value15);
          }
        if (value14 && data?.cmd === "action" && typeof data.id == "string") {
          let value15 = value7?.destinations?.find((input) => input.id === data.id);
          if (value15 !== void 0 && value15.disabled !== !0)
            try {
              value10?.(data.id);
            } catch (value16) {
              typeof reportError == "function" ? reportError(value16) : console.error(value16);
            }
        }
        if (value14 && data?.cmd === "export") {
          let { format: value15, request: value16, interactive: value17, variant: value18, bundle: value19, windowMs: value20, sender: value21 } = data;
          if (typeof value15 == "string" && EXPORT_FORMAT_PATTERN.test(value15) && (value18 === void 0 || typeof value18 == "string" && HOST_DESTINATION_PATTERN.test(value18)) && callback9(value15, value18) && typeof value16 == "string" && HOST_REQUEST_ID_PATTERN.test(value16))
            try {
              value11?.(value15, value16, value17 === !0, value18, value17 === !0 && value19 === !0, validExportTimeout(value20), value17 !== !0 && (value21 === "viewer" || value21 === "claude") ? value21 : void 0);
            } catch (value22) {
              typeof reportError == "function" ? reportError(value22) : console.error(value22);
            }
        }
      }
    };
    if (parentWindow !== null) {
      options.ownWindow.addEventListener("message", callback11);
      for (let value13 of options.origins)
        if (!value13.endsWith(":*"))
          try {
            parentWindow.postMessage({
              __frame_chrome_hello: !0
            }, value13);
          } catch {
          }
    }
    return {
      report(input, options2 = !1) {
        parentWindow !== null && (value3 = input === null ? null : {
          saved: input,
          saveNow: options2
        }, callback8());
      },
      setSaveNowHandler(input) {
        value9 = input, callback6();
      },
      setDestinations(input) {
        if (parentWindow === null)
          return;
        let value13 = input === null ? [] : normalizeHostCommands(input);
        value5 = value13.length === 0 ? null : value13, callback8();
      },
      setDestinationHandler(input) {
        value10 = input;
      },
      setFoot(input) {
        if (parentWindow === null)
          return;
        let state = {};
        input !== null && typeof input.inset == "number" && Number.isFinite(input.inset) && (state.footInset = Math.min(Math.max(0, Math.round(input.inset)), MAX_HOST_FOOT_INSET));
        let value13 = typeof input?.ground == "string" ? input.ground.toLowerCase() : null;
        value13 !== null && HOST_BACKGROUND_HEX_PATTERN.test(value13) && (state.ground = value13), input !== null && typeof input.center == "number" && Number.isFinite(input.center) && (state.footCenter = Math.min(Math.max(0, Math.round(input.center)), MAX_HOST_FOOT_INSET));
        let slot = input?.slot;
        slot && Number.isFinite(slot.x) && Number.isFinite(slot.y) && (state.footSlotX = Math.min(Math.max(0, Math.round(slot.x)), MAX_HOST_FOOT_INSET), state.footSlotY = Math.min(Math.max(0, Math.round(slot.y)), MAX_HOST_FOOT_INSET), typeof slot.width == "number" && Number.isFinite(slot.width) && (state.footSlotW = Math.min(Math.max(0, Math.round(slot.width)), MAX_HOST_FOOT_INSET))), input?.ownChat === !0 && (state.ownChat = !0), value6 = Object.keys(state).length === 0 ? null : state, callback8();
      },
      setExports(input) {
        if (parentWindow === null)
          return;
        let value13 = input === null ? [] : normalizeHostExportFormats(input);
        value4 = value13.length === 0 ? null : value13, callback8();
      },
      setExportHandler(input) {
        value11 = input;
      },
      setFind(input, options2) {
        value2 = options2, !(parentWindow === null || flag2 === input) && (flag2 = input, callback8());
      },
      holdChatToggle() {
        if (parentWindow === null)
          return () => {
          };
        let released = !1;
        return chatHolds += 1, value6?.footSlotX !== void 0 && callback8(), () => {
          released || (released = !0, chatHolds -= 1, callback8());
        };
      },
      setHandOffCode(input) {
        parentWindow === null || handOffCode === input || (handOffCode = input, callback8());
      },
      setActions(input, handler) {
        actionHandler = handler;
        let reserved = [
          SAVE_NOW_COMMAND,
          OPEN_FIND_COMMAND,
          HAND_OFF_CODE_COMMAND,
          CHAT_TOGGLE_COMMAND
        ], next = [...new Set(input)].filter((id) => HOST_COMMAND_PATTERN.test(id) && !reserved.includes(id)).slice(0, MAX_HOST_ACTIONS).map((id) => ({ id }));
        parentWindow === null || JSON.stringify(next) === JSON.stringify(actions) || (actions = next, callback8());
      },
      hostWords: () => words,
      declineExport(input, options2 = !1) {
        if (!(parentWindow === null || value === null || !HOST_REQUEST_ID_PATTERN.test(input)))
          try {
            parentWindow.postMessage({
              __frame_chrome_decline: !0,
              request: input,
              ...options2 && {
                cancelled: options2
              }
            }, value);
          } catch {
          }
      },
      holdLeaveLosesWork() {
        if (parentWindow === null)
          return () => {
          };
        let flag3 = !1;
        return index4 += 1, callback8(), () => {
          flag3 || (flag3 = !0, index4 -= 1, callback8());
        };
      },
      witnessed: () => flag,
      hostDrawsSave: callback,
      hostDrawsReadOnly: callback2,
      hostDrawsAgentTips: callback3,
      hostOffersChatToggle: offersChatToggle,
      hostMayOfferChatToggle: mayOfferChatToggle,
      hostTakesRetry: callback4,
      subscribeHostDrawsSave(input) {
        return values2.add(input), () => {
          values2.delete(input);
        };
      },
      dispose() {
        parentWindow !== null && options.ownWindow.removeEventListener("message", callback11), values2.clear();
      }
    };
  }
  function isAllowedHostMessageOrigin(origin) {
    return isAllowedHostOrigin(origin, allowedHostOrigins);
  }
  function postToHost(message, ownWindow = window, origins = allowedHostOrigins, includeUserActivation = !1) {
    if (ownWindow.parent === ownWindow)
      return;
    let value = ownWindow.location.ancestorOrigins?.[0];
    for (let value2 of value !== void 0 && isAllowedHostOrigin(value, origins) ? [value] : origins)
      if (!value2.endsWith(":*"))
        try {
          if (includeUserActivation) {
            let activation = {
              targetOrigin: value2,
              includeUserActivation: !0
            };
            ownWindow.parent.postMessage(message, activation);
          } else
            ownWindow.parent.postMessage(message, value2);
        } catch {
        }
  }
  function getHostFrameBridge() {
    if (hostFrameBridge === null) {
      let value = typeof window == "object" && window.parent !== window;
      hostFrameBridge = createHostFrameBridge({
        ownWindow: window,
        parentWindow: value ? window.parent : null,
        origins: allowedHostOrigins
      });
    }
    return hostFrameBridge;
  }
  function reportToHost(state, reason) {
    getHostFrameBridge().report(state, reason);
  }
  function holdHostLeaveWarning() {
    try {
      if (hostFrameBridge === null && typeof window != "object")
        return () => {
        };
      let value = getHostFrameBridge().holdLeaveLosesWork();
      return () => {
        try {
          value();
        } catch {
        }
      };
    } catch {
      return () => {
      };
    }
  }
  function useHostDestinations(destinations, onPress) {
    let ref = react_z.useRef({
      rows: destinations,
      onPress
    });
    ref.current = {
      rows: destinations,
      onPress
    };
    let value = JSON.stringify(destinations);
    react_z.useEffect(() => {
      getHostFrameBridge().setDestinations(ref.current.rows);
    }, [value]), react_z.useEffect(() => (getHostFrameBridge().setDestinationHandler((input) => ref.current.onPress(input)), () => {
      getHostFrameBridge().setDestinationHandler(null), getHostFrameBridge().setDestinations(null);
    }), []);
  }
  function setHostFootInset(inset) {
    if (inset !== hostFootInset) {
      hostFootInset = inset;
      for (let listener of hostFootInsetListeners)
        listener(inset);
    }
  }
  function subscribeHostFootInset(listener) {
    return hostFootInsetListeners.add(listener), listener(hostFootInset), () => {
      hostFootInsetListeners.delete(listener);
    };
  }
  function setHostFootState(state) {
    hostFootState = state, refreshHostFoot();
  }
  function updateHostFoot() {
    let value = [...hostFootInsets.values()].filter((input) => Number.isFinite(input));
    if (typeof hostFootState?.inset == "number" && Number.isFinite(hostFootState.inset) && value.push(hostFootState.inset), setHostFootInset(value.length > 0 ? Math.max(...value) : 0), value.length === 0 && hostFootState === null && hostChatClaims === 0) {
      getHostFrameBridge().setFoot(null);
      return;
    }
    getHostFrameBridge().setFoot({
      ...value.length > 0 && {
        inset: Math.max(...value)
      },
      ground: hostFootState?.ground ?? null,
      ...typeof hostFootState?.center == "number" && {
        center: hostFootState.center
      },
      ...hostFootState?.slot && {
        slot: hostFootState.slot
      },
      ...hostChatClaims > 0 && {
        ownChat: !0
      }
    });
  }
  function queueHostFootUpdate() {
    hostFootUpdateQueued || (hostFootUpdateQueued = !0, queueMicrotask(() => {
      hostFootUpdateQueued = !1, updateHostFoot();
    }));
  }
  function refreshHostFoot() {
    hostChatClaims > 0 || hostFootUpdateQueued ? queueHostFootUpdate() : updateHostFoot();
  }
  function claimHostChatToggle() {
    let released = !1;
    return hostChatClaims += 1, queueHostFootUpdate(), () => {
      released || (released = !0, hostChatClaims -= 1, queueHostFootUpdate());
    };
  }
  function setHostFootSlotInset(key, inset) {
    inset === null ? hostFootInsets.delete(key) : hostFootInsets.set(key, inset), refreshHostFoot();
  }
  function setHostExports(formats) {
    getHostFrameBridge().setExports(formats);
  }
  function setHostExportHandler(handler) {
    getHostFrameBridge().setExportHandler(handler);
  }
  function declineHostExport(requestId, reason) {
    getHostFrameBridge().declineExport(requestId, reason);
  }
  function useHostSaveState(status, message) {
    let ref = react_z.useRef(!1), value = status === "loading" && ref.current;
    status !== "loading" && (ref.current = status === "error");
    let value2 = status === null ? null : value ? "saving" : hostSaveStatus(status), value3 = message !== void 0 && (status === "error" || status === "dirty"), ref2 = react_z.useRef(message);
    ref2.current = message, react_z.useEffect(() => {
      reportToHost(value2, value3);
    }, [value2, value3]), react_z.useEffect(() => (getHostFrameBridge().setSaveNowHandler(() => ref2.current?.()), () => {
      getHostFrameBridge().setSaveNowHandler(null), reportToHost(null);
    }), []);
  }
  function useHostFindCommand(enabled, onOpen) {
    let ref = react_z.useRef(onOpen);
    ref.current = onOpen, react_z.useEffect(() => (getHostFrameBridge().setFind(enabled, () => ref.current()), () => getHostFrameBridge().setFind(!1, null)), [enabled]);
  }
  function hostDrawsSave() {
    return getHostFrameBridge().hostDrawsSave();
  }
  function hostDrawsReadOnly() {
    return getHostFrameBridge().hostDrawsReadOnly();
  }
  function useHostDrawsAgentTips() {
    return react_z.useSyncExternalStore(subscribeHostSaveChrome, () => getHostFrameBridge().hostDrawsAgentTips(), () => !1);
  }
  function setHostActions(ids, handler) {
    getHostFrameBridge().setActions(ids ?? [], handler);
  }
  function hostWords() {
    return getHostFrameBridge().hostWords();
  }
  function useHostOffersChatToggle() {
    return react_z.useSyncExternalStore(subscribeHostSaveChrome, () => getHostFrameBridge().hostOffersChatToggle(), () => !1);
  }
  function useHostMayOfferChatToggle(besideChat) {
    return react_z.useSyncExternalStore(subscribeHostSaveChrome, () => getHostFrameBridge().hostMayOfferChatToggle() && !(besideChat && getHostFrameBridge().hostWords()?.has("chat_beside") === !0), () => !1);
  }
  function useHoldHostChatToggle() {
    react_z.useEffect(() => getHostFrameBridge().holdChatToggle(), []);
  }
  function useClaimHostChatToggle(claim) {
    react_z.useEffect(() => claim ? claimHostChatToggle() : void 0, [claim]);
  }
  function hostChromeWitnessed() {
    return getHostFrameBridge().witnessed();
  }
  function hostTakesRetry() {
    return getHostFrameBridge().hostTakesRetry();
  }
  function subscribeHostSaveChrome(listener) {
    return getHostFrameBridge().subscribeHostDrawsSave(listener);
  }
  return bindRuntimeValue(runtime2, "react_z", () => react_z, (value) => {
    react_z = value;
  }), bindRuntimeValue(runtime2, "SAVE_NOW_COMMAND", () => SAVE_NOW_COMMAND, (value) => {
    SAVE_NOW_COMMAND = value;
  }), bindRuntimeValue(runtime2, "OPEN_FIND_COMMAND", () => OPEN_FIND_COMMAND, (value) => {
    OPEN_FIND_COMMAND = value;
  }), bindRuntimeValue(runtime2, "EXPORT_FORMAT_PATTERN", () => EXPORT_FORMAT_PATTERN, (value) => {
    EXPORT_FORMAT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "validExportTimeout", () => validExportTimeout, (value) => {
    validExportTimeout = value;
  }), bindRuntimeValue(runtime2, "MAX_HOST_EXPORT_FORMATS", () => MAX_HOST_EXPORT_FORMATS, (value) => {
    MAX_HOST_EXPORT_FORMATS = value;
  }), bindRuntimeValue(runtime2, "HOST_DESTINATION_PATTERN", () => HOST_DESTINATION_PATTERN, (value) => {
    HOST_DESTINATION_PATTERN = value;
  }), bindRuntimeValue(runtime2, "MAX_HOST_DESTINATIONS", () => MAX_HOST_DESTINATIONS, (value) => {
    MAX_HOST_DESTINATIONS = value;
  }), bindRuntimeValue(runtime2, "HOST_REQUEST_ID_PATTERN", () => HOST_REQUEST_ID_PATTERN, (value) => {
    HOST_REQUEST_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "HOST_COMMAND_PATTERN", () => HOST_COMMAND_PATTERN, (value) => {
    HOST_COMMAND_PATTERN = value;
  }), bindRuntimeValue(runtime2, "MAX_HOST_COMMANDS", () => MAX_HOST_COMMANDS, (value) => {
    MAX_HOST_COMMANDS = value;
  }), bindRuntimeValue(runtime2, "MAX_HOST_FOOT_INSET", () => MAX_HOST_FOOT_INSET, (value) => {
    MAX_HOST_FOOT_INSET = value;
  }), bindRuntimeValue(runtime2, "HOST_BACKGROUND_HEX_PATTERN", () => HOST_BACKGROUND_HEX_PATTERN, (value) => {
    HOST_BACKGROUND_HEX_PATTERN = value;
  }), bindRuntimeValue(runtime2, "normalizeHostBackgroundColor", () => normalizeHostBackgroundColor), bindRuntimeValue(runtime2, "readHostBackgroundColor", () => readHostBackgroundColor), bindRuntimeValue(runtime2, "hostSaveStatus", () => hostSaveStatus), bindRuntimeValue(runtime2, "DEFAULT_HOST_ORIGINS", () => DEFAULT_HOST_ORIGINS, (value) => {
    DEFAULT_HOST_ORIGINS = value;
  }), bindRuntimeValue(runtime2, "hostOrigins", () => hostOrigins), bindRuntimeValue(runtime2, "isAllowedHostOrigin", () => isAllowedHostOrigin), bindRuntimeValue(runtime2, "normalizeHostExportFormats", () => normalizeHostExportFormats), bindRuntimeValue(runtime2, "normalizeHostDestinations", () => normalizeHostDestinations), bindRuntimeValue(runtime2, "normalizeHostCommands", () => normalizeHostCommands), bindRuntimeValue(runtime2, "normalizeHostTips", () => normalizeHostTips), bindRuntimeValue(runtime2, "createHostFrameBridge", () => createHostFrameBridge), bindRuntimeValue(runtime2, "allowedHostOrigins", () => allowedHostOrigins, (value) => {
    allowedHostOrigins = value;
  }), bindRuntimeValue(runtime2, "isAllowedHostMessageOrigin", () => isAllowedHostMessageOrigin), bindRuntimeValue(runtime2, "postToHost", () => postToHost), bindRuntimeValue(runtime2, "hostFrameBridge", () => hostFrameBridge, (value) => {
    hostFrameBridge = value;
  }), bindRuntimeValue(runtime2, "getHostFrameBridge", () => getHostFrameBridge), bindRuntimeValue(runtime2, "reportToHost", () => reportToHost), bindRuntimeValue(runtime2, "holdHostLeaveWarning", () => holdHostLeaveWarning), bindRuntimeValue(runtime2, "useHostDestinations", () => useHostDestinations), bindRuntimeValue(runtime2, "hostFootState", () => hostFootState, (value) => {
    hostFootState = value;
  }), bindRuntimeValue(runtime2, "hostFootInsets", () => hostFootInsets, (value) => {
    hostFootInsets = value;
  }), bindRuntimeValue(runtime2, "setHostFootState", () => setHostFootState), bindRuntimeValue(runtime2, "updateHostFoot", () => updateHostFoot), bindRuntimeValue(runtime2, "setHostExports", () => setHostExports), bindRuntimeValue(runtime2, "setHostExportHandler", () => setHostExportHandler), bindRuntimeValue(runtime2, "declineHostExport", () => declineHostExport), bindRuntimeValue(runtime2, "useHostSaveState", () => useHostSaveState), bindRuntimeValue(runtime2, "useHostFindCommand", () => useHostFindCommand), bindRuntimeValue(runtime2, "hostDrawsSave", () => hostDrawsSave), bindRuntimeValue(runtime2, "hostDrawsReadOnly", () => hostDrawsReadOnly), bindRuntimeValue(runtime2, "useHostDrawsAgentTips", () => useHostDrawsAgentTips), bindRuntimeValue(runtime2, "hostTakesRetry", () => hostTakesRetry), bindRuntimeValue(runtime2, "subscribeHostSaveChrome", () => subscribeHostSaveChrome), bindRuntimeValue(runtime2, "CHAT_TOGGLE_COMMAND", () => CHAT_TOGGLE_COMMAND, (value) => {
    CHAT_TOGGLE_COMMAND = value;
  }), bindRuntimeValue(runtime2, "HAND_OFF_CODE_COMMAND", () => HAND_OFF_CODE_COMMAND, (value) => {
    HAND_OFF_CODE_COMMAND = value;
  }), bindRuntimeValue(runtime2, "MAX_HOST_ACTIONS", () => MAX_HOST_ACTIONS, (value) => {
    MAX_HOST_ACTIONS = value;
  }), bindRuntimeValue(runtime2, "setHostFootInset", () => setHostFootInset), bindRuntimeValue(runtime2, "subscribeHostFootInset", () => subscribeHostFootInset), bindRuntimeValue(runtime2, "setHostFootSlotInset", () => setHostFootSlotInset), bindRuntimeValue(runtime2, "claimHostChatToggle", () => claimHostChatToggle), bindRuntimeValue(runtime2, "setHostActions", () => setHostActions), bindRuntimeValue(runtime2, "hostWords", () => hostWords), bindRuntimeValue(runtime2, "hostChromeWitnessed", () => hostChromeWitnessed), bindRuntimeValue(runtime2, "useHostOffersChatToggle", () => useHostOffersChatToggle), bindRuntimeValue(runtime2, "useHostMayOfferChatToggle", () => useHostMayOfferChatToggle), bindRuntimeValue(runtime2, "useHoldHostChatToggle", () => useHoldHostChatToggle), bindRuntimeValue(runtime2, "useClaimHostChatToggle", () => useClaimHostChatToggle), () => {
    react_z = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SAVE_NOW_COMMAND = "save_now", OPEN_FIND_COMMAND = "open_find", CHAT_TOGGLE_COMMAND = "chat_toggle", HAND_OFF_CODE_COMMAND = "hand_off_code", EXPORT_FORMAT_PATTERN = /^[a-z0-9]{1,8}$/, validExportTimeout = (value) => typeof value == "number" && Number.isSafeInteger(value) && value > 5e3 && value <= 9e5 ? value : void 0, MAX_HOST_EXPORT_FORMATS = 8, HOST_DESTINATION_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/, MAX_HOST_DESTINATIONS = 8, HOST_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/, HOST_COMMAND_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/, MAX_HOST_COMMANDS = 8, MAX_HOST_FOOT_INSET = 9999, MAX_HOST_ACTIONS = 8, HOST_BACKGROUND_HEX_PATTERN = /^#[0-9a-f]{6}$/, DEFAULT_HOST_ORIGINS = [], allowedHostOrigins = (() => {
      try {
        return typeof window == "object" ? hostOrigins(window) : DEFAULT_HOST_ORIGINS;
      } catch {
        return DEFAULT_HOST_ORIGINS;
      }
    })(), hostFrameBridge = null, hostFootState = null, hostFootInsets = /* @__PURE__ */ new Map(), hostChatClaims = 0, hostFootInset = 0, hostFootInsetListeners = /* @__PURE__ */ new Set(), hostFootUpdateQueued = !1;
  };
}
export {
  installHostFrameBridge
};
