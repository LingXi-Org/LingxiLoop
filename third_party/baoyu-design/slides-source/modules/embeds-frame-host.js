// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEmbedsFrameHost(runtime2) {
  var EmbedFrameHost, scheduleEmbedAnimationFrame, clampEmbedNumber, initializeEmbedFrameHost;
  function normalizeEmbedProps(props) {
    let result = {};
    if (typeof props != "object" || props === null)
      return result;
    for (let value of Object.keys(props).slice(0, 16)) {
      let value2 = props[value];
      typeof value2 == "number" && Number.isFinite(value2) && (result[value.slice(0, 40)] = value2);
    }
    return result;
  }
  function embedsDisabled(config) {
    return typeof window > "u" ? !1 : window["__embedsDisabled:" + config.disabledEvent] === !0;
  }
  function subscribeEmbedsDisabled(config, listener) {
    return window.addEventListener(config.disabledEvent, listener), () => window.removeEventListener(config.disabledEvent, listener);
  }
  function installEmbedRuntimeGuard(config) {
    if (typeof window > "u" || typeof document > "u")
      return;
    let value = window, value2 = document, count = 1500, count2 = 250, count3 = 1048576, count4 = 4, count5 = 4e3, count6 = 400;
    if (!/^[A-Za-z][\w-]*$/.test(config.markerAttr))
      throw Error("embed focus guard: invalid markerAttr " + config.markerAttr);
    let value3 = value, value4 = "__embedFocusGuard:" + config.disabledEvent, value5 = "__embedsDisabled:" + config.disabledEvent, value6 = "__embedLegitFrame:" + config.disabledEvent, value7 = "__embedSamplerBoost:" + config.disabledEvent;
    if (value3[value4] === !0)
      return;
    value3[value4] = !0;
    let callback = (input) => ({
      endPriorSession: input.markPresent && input.markStaleOrDeparted
    }), callback2 = (input) => {
      let state4 = {
        markRecipient: !1,
        spendRecipient: !1
      };
      return input.hasFocusAfterBlur ? input.alreadyDisabled ? {
        verdict: "ignore",
        ...state4
      } : input.framesPresent ? input.recipient === "other-frame" ? {
        verdict: input.otherFrameLegit ? "ignore" : "kill",
        ...state4
      } : input.recipient === "stale" ? {
        verdict: input.selfEvictionSinceDispatch ? "ignore" : "kill",
        ...state4
      } : input.recipientLegit ? {
        verdict: "ignore",
        ...state4
      } : input.pressFresh && (input.msSinceGesture <= count || input.active) ? {
        verdict: "ignore",
        markRecipient: !0,
        spendRecipient: !0
      } : {
        verdict: "pend",
        ...state4
      } : {
        verdict: "ignore",
        ...state4
      } : {
        verdict: "ignore",
        ...state4
      };
    }, callback3 = (input) => {
      let state4 = {
        markRecipient: !1,
        spendRecipient: !1
      };
      return input.alreadyDisabled ? {
        verdict: "ignore",
        ...state4
      } : input.framesPresent ? input.focusIn === "host" ? {
        verdict: "ignore",
        ...state4
      } : input.focusIn === "other-frame" ? {
        verdict: input.otherFrameLegit ? "ignore" : "kill",
        ...state4
      } : input.recipientLegit ? {
        verdict: "ignore",
        ...state4
      } : input.pressFresh && (input.msSinceGesture <= count || input.active) ? {
        verdict: "ignore",
        markRecipient: !0,
        spendRecipient: !0
      } : {
        verdict: "pend",
        ...state4
      } : {
        verdict: "ignore",
        ...state4
      };
    }, value8 = null, index4 = 0, value9 = null, callback4 = (input) => input !== null && (value9 === input || value8 === input && Date.now() - index4 <= count), index22 = 0, callback5 = () => value3[value6] ?? null, callback6 = (input) => {
      index22 += 1, value3[value6] = {
        el: input,
        seq: index22,
        grantAt: Date.now()
      };
    }, value10 = null, flag = !1, flag2 = !1, index32 = 0, flag3 = !0, flag4 = !1, flag5 = !0;
    value.addEventListener("focus", (input) => {
      if (input.isTrusted) {
        if (flag4) {
          flag4 = !1;
          let activeElement2 = value2.activeElement;
          activeElement2 !== null && activeElement2.tagName !== "IFRAME" && (activeElement2 instanceof value.HTMLElement && activeElement2 !== value2.body ? activeElement2.focus() : callback13());
          return;
        }
        flag3 = !0;
      }
    });
    let callback7 = () => {
      if (!flag)
        return;
      flag = !1;
      let value15 = value3["__embedSpendTokens:" + config.disabledEvent];
      if (typeof value15 == "function")
        try {
          value15();
        } catch {
          callback19();
        }
      let value16 = callback5();
      callback({
        markPresent: value16 !== null,
        markStaleOrDeparted: value16 !== null
      }).endPriorSession && callback22();
    };
    value.addEventListener("pointerdown", (event) => {
      if (!event.isTrusted)
        return;
      index32 = Date.now();
      let target = event.target;
      target === null || target.tagName === "IFRAME" && target.hasAttribute(config.markerAttr) || (flag = !0, flag2 = !1, callback26());
    }, !0), value.addEventListener("pointerover", (event) => {
      if (!event.isTrusted)
        return;
      let target = event.target;
      target === null || target.tagName !== "IFRAME" || target.hasAttribute(config.markerAttr) || (value8 = target, index4 = Date.now(), callback26());
    }, !0), value.addEventListener("pointerout", (event) => {
      if (!event.isTrusted)
        return;
      let target = event.target;
      target !== null && target === value8 && (value8 = null);
    }, !0), value.addEventListener("focusin", (event) => {
      if (!event.isTrusted)
        return;
      if (event.target instanceof HTMLElement && event.target.tagName !== "IFRAME" && event.target !== value11) {
        value10 = event.target, index32 = Date.now(), event.isTrusted && (flag3 = !0), callback7();
        let value15 = callback5();
        callback({
          markPresent: value15 !== null,
          markStaleOrDeparted: value15 !== null && value2.activeElement !== value15.el
        }).endPriorSession && callback22();
        return;
      }
      let target = event.target;
      target instanceof value.HTMLIFrameElement && target.hasAttribute(config.markerAttr) && callback8(target);
    }), value.addEventListener("focus", (input) => {
      if (!input.isTrusted)
        return;
      let activeElement2 = value2.activeElement;
      activeElement2 !== null && activeElement2 instanceof value.HTMLIFrameElement && activeElement2.hasAttribute(config.markerAttr) && callback8(activeElement2);
    });
    let state = {
      el: null,
      seq: 0,
      hard: !1,
      installAt: 0,
      installMoveSeq: 0,
      evidenceless: !1,
      counted: !1
    }, items = [], callback8 = (input) => {
      if (value3[value5] === !0)
        return;
      if (value12.has(input)) {
        callback9(input, !1);
        return;
      }
      let value15 = callback5();
      value15 !== null && value15.el === input || callback9(input, value15 !== null);
    }, state2 = {
      el: null,
      at: 0
    }, callback9 = (input, options) => {
      if (state2.el === input && Date.now() - state2.at < 64) {
        callback14(input);
        return;
      }
      if (value12.has(input)) {
        try {
          input.inert = !0;
        } catch {
        }
        input instanceof value.HTMLElement && value2.activeElement === input && input.blur(), callback13(!0), setTimeout(() => {
          value2.activeElement === input ? callback14(input) : !flag3 && !callback18() && callback13();
        }, 0);
        return;
      }
      if (state.el === input) {
        state.hard = state.hard || options, state.evidenceless ? (callback14(input), callback26(), callback17(input), value12.has(input) && (state.el = null)) : Date.now() - state.installAt > count6 && callback14(input);
        return;
      }
      if (state.el !== null) {
        {
          let value15 = callback20(state.el);
          value15.touchEntry === !0 || value15.active === !0 || value15.msSince <= count || value15.pressMsSince <= count || callback17(state.el), value15.consume();
        }
        {
          let { el: value15, counted: value16 } = state;
          if (state.el = null, value15 !== null && callback16(value15, value16)) {
            callback19();
            return;
          }
        }
      }
      state.el = input, state.seq += 1, state.installAt = Date.now(), state.installMoveSeq = index42, state.evidenceless = !1, state.counted = !1, state.hard = options;
      let seq = state.seq;
      {
        let value15 = callback20(input);
        !(value15.active === !0 || value15.msSince <= count || value15.touchEntry === !0 || value15.pressMsSince <= count) && input instanceof value.HTMLElement && value2.activeElement === input && (input.blur(), callback13(!0), state.evidenceless = !0);
      }
      callback26();
      let flag6 = !1, callback27 = () => {
        if (state.el === input && state.seq === seq) {
          if (!input.isConnected) {
            state.el = null;
            return;
          }
          {
            let activeElement2 = value2.activeElement, value15 = activeElement2 === null || activeElement2.tagName !== "IFRAME";
            (activeElement2 === input || activeElement2 === value11 || !flag3 && !callback18() && value15) && callback13();
          }
          if (!flag6 && (flag6 = !0, callback16(input, state.counted))) {
            callback19();
            return;
          }
          setTimeout(callback27, count6);
        }
      };
      if (setTimeout(callback27, count6), callback11(input, !1, seq), state.el !== input || state.seq !== seq)
        return;
      let flag7 = !1;
      if (config.pressFlush !== void 0)
        try {
          flag7 = config.pressFlush(input, seq % count3) === !0;
        } catch {
          callback19();
          return;
        }
      flag7 || (state2.el = input, state2.at = Date.now(), callback11(input, !0, seq));
    }, callback10 = () => {
      let value15 = Date.now();
      for (; items.length > 0 && value15 - items[0] > count5; )
        items.shift();
      return items.push(value15), items.length > count4;
    }, callback11 = (input, options, context, value15) => {
      let el2 = state.el;
      if (el2 === null || el2 !== input || context !== void 0 && context !== state.seq)
        return;
      if (value3[value5] === !0) {
        state.el = null;
        return;
      }
      if (!el2.isConnected) {
        state.el = null;
        return;
      }
      let value16 = callback20(el2);
      if (value16.pressMsSince <= count && (value16.msSince <= count || value16.active === !0) && !value12.has(el2)) {
        state.el = null, items.length = 0, cache2.delete(el2), callback6(el2), value16.consume(), value2.activeElement !== el2 && el2 instanceof value.HTMLElement && el2.focus();
        return;
      }
      if (!options)
        return;
      let { hard: value17, counted: value18 } = state;
      {
        let activeElement2 = value2.activeElement, value19 = activeElement2 === null || activeElement2.tagName !== "IFRAME";
        if (activeElement2 !== el2 && value19) {
          let value20 = index42 > state.installMoveSeq, value21 = index32 >= state.installAt;
          if (value2.hasFocus() && !callback18() && !value21 && !value20) {
            state.el = null, callback19();
            return;
          }
        }
      }
      if (state.el = null, value16.touchEntry === !0 && callback5() === null && !value17) {
        value16.consumeTouchEntry?.();
        let callback27 = () => {
          if (callback15(el2), value10 !== null && value10.isConnected) {
            let activeElement2 = value2.activeElement;
            value10.focus(), value2.activeElement !== activeElement2 && (index42 += 1);
          }
        };
        value15 === !0 ? callback27() : setTimeout(callback27, 0), setTimeout(() => {
          let activeElement2 = value2.activeElement;
          callback18() || (activeElement2 === el2 || !flag3 && (activeElement2 === null || activeElement2.tagName !== "IFRAME")) && callback13();
        }, 0);
        return;
      }
      if (value16.consume(), callback15(el2), value10 !== null && value10.isConnected) {
        let activeElement2 = value2.activeElement;
        value10.focus(), value2.activeElement !== activeElement2 && (index42 += 1);
      }
      if (setTimeout(() => {
        let activeElement2 = value2.activeElement;
        callback18() || (activeElement2 === el2 || !flag3 && (activeElement2 === null || activeElement2.tagName !== "IFRAME")) && callback13();
      }, 0), value15 === !0) {
        value16.touchEntry !== !0 && value16.pressMsSince > count && callback17(el2), callback16(el2, value18) && callback19();
        return;
      }
      callback19();
    };
    value3["__embedPendingKick:" + config.disabledEvent] = (input) => {
      callback11(input, !1);
    }, value3["__embedPendingFrame:" + config.disabledEvent] = () => state.el, value3["__embedPendingEcho:" + config.disabledEvent] = (input, options) => {
      state.el === input && state.seq % count3 === options && callback11(input, !0, state.seq, !0);
    };
    let callback12 = () => value2.querySelector("iframe[" + config.markerAttr + "]") !== null, state3 = {
      active: !1,
      msSince: 1 / 0,
      pressMsSince: 1 / 0,
      touchEntry: !1,
      consumeTouchEntry: () => {
      },
      consume: () => {
      }
    }, value11 = null, index42 = 0, callback13 = (input) => {
      (value11 === null || !value11.isConnected) && (value11 = value2.createElement("div"), value11.tabIndex = -1, value11.setAttribute("aria-hidden", "true"), value11.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;padding:0;border:0;opacity:0", (value2.body ?? value2.documentElement).appendChild(value11));
      let activeElement2 = value2.activeElement;
      try {
        value11.focus({
          preventScroll: !0
        });
      } catch {
        value11.focus();
      }
      if (value2.activeElement !== activeElement2 && (index42 += 1), input === !0) {
        setTimeout(() => {
          if (value2.activeElement === value11 && value11 !== null) {
            try {
              value11.focus({
                preventScroll: !0
              });
            } catch {
              value11.focus();
            }
            value2.activeElement === value11 && (flag3 = !0);
          }
        }, 0);
        return;
      }
      value2.activeElement === value11 && (flag3 = !0);
    }, callback14 = (input) => {
      if (value2.activeElement !== input) {
        !flag3 && !callback18() && callback13();
        return;
      }
      input instanceof value.HTMLElement && input.blur(), callback13();
    }, callback15 = (input) => {
      let activeElement2 = value2.activeElement;
      if (activeElement2 === input) {
        callback14(input);
        return;
      }
      (activeElement2 === null || activeElement2 === value2.body || activeElement2 === value2.documentElement) && callback13();
    }, cache2 = /* @__PURE__ */ new WeakMap(), value12 = /* @__PURE__ */ new WeakSet(), value13 = /* @__PURE__ */ new WeakSet(), callback16 = (input, options) => options ? !1 : (state.el === input && (state.counted = !0), value13.has(input) ? callback10() : (value13.add(input), !1)), callback17 = (input) => {
      let value15 = (cache2.get(input) ?? 0) + 1;
      if (cache2.set(input, value15), value15 >= 3) {
        value12.add(input);
        try {
          let value16 = input;
          value16.inert = !0, value16.style.pointerEvents = "none", value16.removeAttribute("src"), value16.srcdoc = "";
        } catch {
        }
      }
    }, callback18 = () => {
      let value15 = callback5();
      return value15 !== null && value15.el === value2.activeElement;
    }, callback19 = () => {
      if (value3[value5] === !0)
        return;
      value3[value5] = !0;
      let activeElement2 = value2.activeElement;
      activeElement2 !== null && activeElement2 instanceof value.HTMLElement && activeElement2.tagName === "IFRAME" ? (activeElement2.blur(), value2.activeElement === activeElement2 && callback13()) : flag3 || callback13(), value.dispatchEvent(new Event(config.disabledEvent)), setTimeout(() => {
        if (value10 !== null && value10.isConnected) {
          let activeElement3 = value2.activeElement;
          value10.focus(), value2.activeElement !== activeElement3 && (index42 += 1);
        }
        let activeElement22 = value2.activeElement;
        (!flag3 || activeElement22 !== null && (activeElement22.tagName === "IFRAME" || activeElement22 === value11)) && callback13();
      }, 0);
    }, callback20 = (input) => {
      if (config.attribution === void 0)
        return state3;
      try {
        let value15 = config.attribution(input);
        return {
          active: value15.active,
          msSince: value15.msSince,
          pressMsSince: value15.pressMsSince,
          touchEntry: value15.touchEntry === !0,
          consumeTouchEntry: () => {
            try {
              value15.consumeTouchEntry?.();
            } catch {
              callback19();
            }
          },
          consume: () => {
            try {
              value15.consume();
            } catch {
              callback19();
            }
          }
        };
      } catch {
        return callback19(), state3;
      }
    }, callback21 = (input) => input !== null && input.tagName === "IFRAME" ? input.hasAttribute(config.markerAttr) ? "marked" : "other-frame" : "host", callback22 = () => {
      let value15 = callback5();
      value15 !== null && (value3[value6] = null, callback20(value15.el).consume());
    }, callback23 = () => {
      let activeElement2 = value2.activeElement;
      if (value9 !== null && activeElement2 !== value9 && (value9 = null), flag) {
        let value22 = callback21(activeElement2);
        value22 === "host" ? callback7() : value22 === "marked" && !flag2 ? flag = !1 : value22 === "marked" && flag2 && callback7();
      }
      let value15 = callback5(), value16 = callback({
        markPresent: value15 !== null,
        markStaleOrDeparted: value15 !== null && activeElement2 !== value15.el
      }), endPriorSession = value16.endPriorSession;
      value16.endPriorSession && callback22();
      let value17 = callback5(), value18 = callback21(activeElement2), value19 = value18 === "marked" && activeElement2 !== null ? callback20(activeElement2) : state3, value20 = value18 === "other-frame" && callback4(activeElement2), value21 = callback3({
        alreadyDisabled: value3[value5] === !0,
        framesPresent: callback12(),
        focusIn: value18,
        otherFrameLegit: value20,
        recipientLegit: value18 === "marked" && value17 !== null && value17.el === activeElement2,
        msSinceGesture: value19.msSince,
        pressFresh: value19.pressMsSince <= count,
        active: value19.active
      });
      if (value20 && activeElement2 !== null && (value9 = activeElement2), value21.verdict === "kill") {
        callback19();
        return;
      }
      if (value21.verdict === "pend") {
        activeElement2 !== null && callback9(activeElement2, endPriorSession || callback5() !== null);
        return;
      }
      if (value21.markRecipient && activeElement2 !== null) {
        let value22 = activeElement2;
        setTimeout(() => {
          if (value3[value5] === !0 || value12.has(value22))
            return;
          let value23 = callback20(value22);
          value23.pressMsSince <= count && value2.activeElement === value22 && (callback6(value22), value23.consume());
        }, 0);
      }
    };
    value.addEventListener(config.disabledEvent + ":ledger-multi", () => {
      let value15 = callback5();
      if (value15 !== null && Date.now() - (value15.grantAt ?? 0) <= 1e3 && (callback20(value15.el).consume(), value3[value6] = null, value2.activeElement === value15.el && value15.el instanceof value.HTMLElement || !flag3))
        if (value15.el instanceof value.HTMLElement && value15.el.blur(), value10 !== null && value10.isConnected) {
          let activeElement2 = value2.activeElement;
          value10.focus(), value2.activeElement !== activeElement2 && (index42 += 1);
        } else
          callback13();
    }), value.addEventListener("blur", (input) => {
      if (!input.isTrusted)
        return;
      {
        let activeElement2 = value2.activeElement;
        activeElement2 !== null && activeElement2.tagName === "IFRAME" && activeElement2.hasAttribute(config.markerAttr) && value12.has(activeElement2) && callback14(activeElement2);
      }
      flag5 = flag3, flag3 = !1;
      let value15 = index22, value16 = index42, value17 = index32;
      flag2 = !0, setTimeout(() => {
        callback7();
        let value18 = value2.hasFocus();
        value18 || (flag3 = flag5, flag4 = !0);
        let value19 = callback5(), value20 = callback({
          markPresent: value19 !== null,
          markStaleOrDeparted: value19 !== null && value18 && value19.seq <= value15
        }), endPriorSession = value20.endPriorSession;
        value20.endPriorSession && callback22();
        let activeElement2 = value2.activeElement, value21 = callback5(), value22 = callback21(activeElement2), value23 = value22 === "host" ? "stale" : value22, value24 = value23 === "marked" && activeElement2 !== null ? callback20(activeElement2) : state3;
        value9 !== null && activeElement2 !== value9 && (value9 = null);
        let value25 = value23 === "other-frame" && callback4(activeElement2), value26 = callback2({
          hasFocusAfterBlur: value18,
          alreadyDisabled: value3[value5] === !0,
          framesPresent: callback12(),
          recipient: value23,
          otherFrameLegit: value25,
          recipientLegit: value23 === "marked" && value21 !== null && value21.el === activeElement2,
          msSinceGesture: value24.msSince,
          pressFresh: value24.pressMsSince <= count,
          active: value24.active,
          selfEvictionSinceDispatch: index42 > value16 || flag3 && (index32 > value17 || state.el !== null && !state.el.isConnected)
        });
        if (value25 && activeElement2 !== null && (value9 = activeElement2), value26.verdict === "kill") {
          callback19();
          return;
        }
        if (value26.verdict === "pend") {
          activeElement2 !== null && callback9(activeElement2, endPriorSession || callback5() !== null);
          return;
        }
        if (value26.markRecipient && activeElement2 !== null) {
          let value27 = activeElement2;
          setTimeout(() => {
            if (value3[value5] === !0 || value12.has(value27))
              return;
            let value28 = callback20(value27);
            value28.pressMsSince <= count && value2.activeElement === value27 && (callback6(value27), value28.consume());
          }, 0);
        }
      }, 0);
    }), value.addEventListener("focus", (input) => {
      input.isTrusted && (flag2 = !0, callback7(), setTimeout(callback23, 0));
    });
    let callback24 = () => {
      let value15 = new Uint32Array(1);
      crypto.getRandomValues(value15);
      let value16 = value15[0] / 4294967296, value17 = -Math.log(1 - value16) * count2;
      return value17 < 1 && (value17 = 1), value17 > 1400 && (value17 = 1400), typeof value3[value7] == "number" && Date.now() < value3[value7] && (value17 = Math.min(value17, 5)), value17;
    }, value14 = null, callback25 = () => {
      let value15 = value14;
      value14 = setTimeout(() => {
        try {
          callback23();
        } finally {
          callback25();
        }
      }, callback24()), value15 !== null && clearTimeout(value15);
    };
    callback25();
    let callback26 = () => {
      value3[value7] = Date.now() + 2e3, callback25();
    };
    value3["__embedSiblingEntry:" + config.disabledEvent] = (input) => {
      let value15 = callback5();
      value15 !== null && value15.el !== input && callback26();
    }, value3["__embedDepartureBoost:" + config.disabledEvent] = () => {
      callback26();
    };
  }
  function createEmbedFrame(options) {
    let value = (options.doc ?? document).createElement("iframe");
    value.setAttribute("sandbox", runtime2.embedSandboxPermissions), value.setAttribute(options.markerAttr, ""), options.interactive === void 0 && value.setAttribute("inert", ""), value.tabIndex = -1, value.referrerPolicy = "no-referrer", value.title = options.title, value.style.width = "100%", value.style.height = "100%", value.style.border = "0", value.style.display = "block", options.interactive === void 0 && (value.style.pointerEvents = "none"), value.style.background = "transparent";
    let flag = !1;
    function value2() {
      flag || (flag = !0, options.onNavigated());
    }
    let callback = (input, options2) => (0, runtime2.buildEmbedSrcdoc)(input, {
      allowScripts: options.allowScripts,
      interactive: options.interactive !== void 0,
      ...options2 !== void 0 ? {
        saved: options2
      } : {},
      ...options.onSave ? {
        keepsSaves: !0
      } : {}
    }), callback2 = (input) => (0, runtime2.inspectEmbedMarkup)(input) !== null || (0, runtime2.containsShadowRootMarkup)(input), html = options.html, value3 = callback(html), flag2 = !1;
    options.interactive !== void 0 && callback2(value3) && (html = (0, runtime2.sanitizeEmbedMarkup)(options.html), value3 = callback(html), flag2 = callback2(value3), flag2 && (value3 = callback(""))), !flag2 && options.state !== void 0 && (value3 = callback(html, options.state));
    let index4 = 0, value4 = null, flag3 = !1;
    value.addEventListener("load", () => {
      if (flag)
        return;
      if (value.srcdoc !== value3) {
        value2();
        return;
      }
      if (flag3)
        return;
      let contentWindow = value.contentWindow, readyWindow = value5.readyWindow;
      if (contentWindow !== null && (index4 > 0 ? contentWindow !== value4 : readyWindow !== null && contentWindow !== readyWindow) && options.onRelocated) {
        flag3 = !0, options.onRelocated();
        return;
      }
      index4 += 1, index4 === 1 ? value4 = contentWindow : value2();
    }), value.srcdoc = value3;
    let value5 = new EmbedFrameHost({
      frame: value,
      renderTimeoutMs: options.renderTimeoutMs,
      onNavigating: value2,
      input: options.interactive,
      ...options.onSave ? {
        onSave: options.onSave
      } : {}
    });
    return {
      iframe: value,
      host: value5,
      refused: flag2,
      dispose: () => {
        value5.dispose(), value.remove();
      }
    };
  }
  return bindRuntimeValue(runtime2, "EmbedFrameHost", () => EmbedFrameHost, (value) => {
    EmbedFrameHost = value;
  }), bindRuntimeValue(runtime2, "normalizeEmbedProps", () => normalizeEmbedProps), bindRuntimeValue(runtime2, "scheduleEmbedAnimationFrame", () => scheduleEmbedAnimationFrame, (value) => {
    scheduleEmbedAnimationFrame = value;
  }), bindRuntimeValue(runtime2, "clampEmbedNumber", () => clampEmbedNumber, (value) => {
    clampEmbedNumber = value;
  }), bindRuntimeValue(runtime2, "embedsDisabled", () => embedsDisabled), bindRuntimeValue(runtime2, "subscribeEmbedsDisabled", () => subscribeEmbedsDisabled), bindRuntimeValue(runtime2, "installEmbedRuntimeGuard", () => installEmbedRuntimeGuard), bindRuntimeValue(runtime2, "createEmbedFrame", () => createEmbedFrame), bindRuntimeValue(runtime2, "initializeEmbedFrameHost", () => initializeEmbedFrameHost, (value) => {
    initializeEmbedFrameHost = value;
  }), () => {
    EmbedFrameHost = class {
      frame;
      hostWindow;
      renderTimeoutMs;
      onMessage;
      pending = /* @__PURE__ */ new Map();
      seq = 0;
      _ready = !1;
      _version = null;
      disposed = !1;
      navigated = !1;
      onNavigating;
      input;
      onSave;
      waitingState = null;
      sent = 0;
      readyFrom = null;
      get readyWindow() {
        return this.readyFrom;
      }
      port = null;
      portFrom = null;
      wheel = null;
      lastUpdate = null;
      constructor(input) {
        this.frame = input.frame, this.hostWindow = input.hostWindow ?? window, this.onNavigating = input.onNavigating, this.input = input.input, this.onSave = input.onSave, this.renderTimeoutMs = input.renderTimeoutMs ?? 1500, this.onMessage = (input2) => this.receive(input2), this.hostWindow.addEventListener("message", this.onMessage);
      }
      get ready() {
        return this._ready;
      }
      closePort() {
        this.port !== null && (this.port.onmessage = null, this.port.close(), this.port = null);
      }
      receiveInput(input) {
        if (this.disposed || this.navigated || this.input === void 0 || typeof input != "object" || input === null)
          return;
        let value = input;
        if (value.kind === "press")
          this.input.onPress(value.cancelled === !0);
        else if (value.kind === "key" && (value.key === "Delete" || value.key === "Escape"))
          this.input.onKey(value.key);
        else if (value.kind === "wheel") {
          let value2 = value.pinch === !0;
          this.wheel !== null && this.wheel.pinch !== value2 && this.flushWheel();
          let value3 = this.wheel === null, value4 = this.wheel ?? {
            dx: 0,
            dy: 0,
            pinch: value2,
            x: 0,
            y: 0
          }, value5 = value2 ? 120 : 400;
          this.wheel = {
            dx: clampEmbedNumber(value4.dx + clampEmbedNumber(value.dx, -value5, value5), -value5, value5),
            dy: clampEmbedNumber(value4.dy + clampEmbedNumber(value.dy, -value5, value5), -value5, value5),
            pinch: value2,
            x: clampEmbedNumber(value.x, 0, this.frame.clientWidth ?? 8192),
            y: clampEmbedNumber(value.y, 0, this.frame.clientHeight ?? 8192)
          }, value3 && scheduleEmbedAnimationFrame(() => this.flushWheel());
        }
      }
      flushWheel() {
        let wheel2 = this.wheel;
        this.wheel = null, wheel2 !== null && !this.disposed && !this.navigated && this.input?.onWheel(wheel2);
      }
      dispose() {
        this.disposed = !0, this.closePort(), this.hostWindow.removeEventListener("message", this.onMessage);
        for (let [, value] of this.pending)
          clearTimeout(value.timer), value.resolve(null);
        this.pending.clear();
      }
      post(input) {
        let contentWindow = this.frame.contentWindow;
        if (!(contentWindow === null || this.disposed || this.navigated))
          try {
            contentWindow.postMessage(input, "*");
          } catch {
          }
      }
      update(input) {
        this.lastUpdate = {
          t: input.t,
          playing: input.playing === !0,
          selected: input.selected === !0,
          props: normalizeEmbedProps(input.props)
        }, this.post({
          type: "appifact-embed:update",
          ...this.lastUpdate
        });
      }
      state(input) {
        (this._ready || this.waitingState === null) && (this.sent += 1), this._ready ? this.post({
          type: "appifact-embed:state",
          state: input
        }) : this.waitingState = input;
      }
      setSelected(input) {
        this.post({
          type: "appifact-embed:selected",
          selected: input === !0
        });
      }
      gesture(source) {
        this.post({
          type: "appifact-embed:gesture",
          gesture: {
            kind: source.kind,
            x: Number.isFinite(source.x) ? source.x : 0,
            y: Number.isFinite(source.y) ? source.y : 0,
            id: Number.isFinite(source.id) ? source.id : 0
          }
        });
      }
      render(input, options, context, value) {
        let value2 = Math.max(1, Math.min(8192, Math.floor(context))), value3 = Math.max(1, Math.min(8192, Math.floor(value))), value4 = this.seq++;
        return new Promise((input2) => {
          let value5 = setTimeout(() => {
            this.pending.delete(value4), input2(null);
          }, this.renderTimeoutMs);
          this.pending.set(value4, {
            resolve: input2,
            width: value2,
            height: value3,
            timer: value5
          }), this.post({
            type: "appifact-embed:render",
            seq: value4,
            t: input,
            props: normalizeEmbedProps(options),
            width: value2,
            height: value3
          });
        });
      }
      receive(dataset) {
        let contentWindow = this.frame.contentWindow;
        if (contentWindow === null || dataset.source !== contentWindow || dataset.origin !== "null" || this.navigated)
          return;
        let data = dataset.data;
        if (!(typeof data != "object" || data === null)) {
          if (data.type === "appifact-embed:navigating") {
            this.navigated = !0, this._ready = !1, this.closePort();
            for (let [, value] of this.pending)
              clearTimeout(value.timer), value.resolve(null);
            this.pending.clear(), this.onNavigating?.();
            return;
          }
          if (data.type === "appifact-embed:save") {
            if (this.readyFrom !== null && dataset.source !== this.readyFrom || data.applied !== this.sent)
              return;
            this.onSave !== void 0 && typeof data.state == "string" && data.state.length <= 16384 && this.onSave(data.state);
            return;
          }
          if (data.type === "appifact-embed:port") {
            let value = dataset.ports?.[0], value2 = this.port === null ? !this._ready : dataset.source !== this.portFrom;
            if (this.input === void 0 || value === void 0 || !value2)
              return;
            this.closePort(), this.port = value, this.portFrom = dataset.source, value.onmessage = (input) => this.receiveInput(input.data);
            return;
          }
          if (data.type === "appifact-embed:ready") {
            data.version === 1 && (this._ready = !0, this._version = data.version, this.readyFrom === null && (this.readyFrom = dataset.source), this.lastUpdate !== null && this.post({
              type: "appifact-embed:update",
              ...this.lastUpdate
            }), this.waitingState !== null && this.post({
              type: "appifact-embed:state",
              state: this.waitingState
            }), this.waitingState = null);
            return;
          }
          if (data.type === "appifact-embed:frame") {
            let value = typeof data.seq == "number" ? data.seq : -1, entry = this.pending.get(value);
            if (entry === void 0)
              return;
            let value2 = typeof data.width == "number" ? data.width : 0, value3 = typeof data.height == "number" ? data.height : 0, pixels = data.pixels;
            if (value2 !== entry.width || value3 !== entry.height || !(pixels instanceof ArrayBuffer) || pixels.byteLength !== value2 * value3 * 4) {
              this.pending.delete(value), clearTimeout(entry.timer), entry.resolve(null);
              return;
            }
            this.pending.delete(value), clearTimeout(entry.timer), entry.resolve({
              width: value2,
              height: value3,
              pixels: new Uint8ClampedArray(pixels)
            });
            return;
          }
          if (data.type === "appifact-embed:frame-error") {
            let value = typeof data.seq == "number" ? data.seq : -1, entry = this.pending.get(value);
            if (entry === void 0)
              return;
            this.pending.delete(value), clearTimeout(entry.timer), entry.resolve(null);
            return;
          }
        }
      }
    }, scheduleEmbedAnimationFrame = (input) => void (typeof requestAnimationFrame == "function" ? requestAnimationFrame(input) : setTimeout(input, 16)), clampEmbedNumber = (input, options, context) => typeof input == "number" && Number.isFinite(input) ? Math.max(options, Math.min(context, input)) : 0, initializeEmbedFrameHost = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmbedSanitizer)(), (0, runtime2.initializeEmbedDocument)();
    });
  };
}
export {
  installEmbedsFrameHost
};
