// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiAgentCursor(runtime2) {
  var reactIV0, jsxFc, clampCursorProgress, cursorMotionEase, cursorBendEnvelope, cursorMotionEndTime, jsxsG, CLAUDE_WORKING_LABEL, CLAUDE_WORKING_LABEL_WIDTH, CLAUDE_WORKING_LABEL_HEIGHT, CLAUDE_WORKING_MARGIN, CLAUDE_CURSOR_IDLE_MS, CLAUDE_CURSOR_GLIDE_MS, CLAUDE_CURSOR_ARROW_SIZE, CLAUDE_CURSOR_LABEL_OFFSET, reactc3, jsxcq, CLAUDE_LABEL_OUT_MS, CLAUDE_LABEL_IN_MS, jsxWz;
  function PeerCursorArrow({ color }) {
    return jsxFc.jsx("svg", {
      "aria-hidden": "true",
      width: "16",
      height: "16",
      viewBox: "0 0 16 16",
      className: "mc-peer-cursor-arrow",
      children: jsxFc.jsx("path", {
        d: "M1.64838 2.00811C1.39707 1.20393 2.19198 0.468453 2.97425 0.781363L13.5673 5.01857C14.4224 5.36064 14.3996 6.57901 13.5322 6.88879L9.87018 8.19667C9.33014 8.38954 8.89887 8.80494 8.6859 9.33737L7.06512 13.3893C6.71565 14.263 5.46282 14.2143 5.18216 13.3162L1.64838 2.00811Z",
        fill: color,
        stroke: "#fff",
        strokeWidth: "1.2",
        strokeLinejoin: "round"
      })
    });
  }
  function seededCursorRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = value + 1831565813 >>> 0;
      let value2 = Math.imul(value ^ value >>> 15, value | 1);
      return value2 ^= value2 + Math.imul(value2 ^ value2 >>> 7, value2 | 61), ((value2 ^ value2 >>> 14) >>> 0) / 4294967296;
    };
  }
  function cursorPositionAt(initial2, motions, now) {
    let { x, y } = initial2;
    for (let value of motions) {
      let value2 = (now - value.t0) / value.T;
      if (value2 <= 0)
        continue;
      let value3 = cursorMotionEase(value2);
      x += value.dx * value3, y += value.dy * value3;
      let value4 = Math.hypot(value.dx, value.dy);
      if (value4 > 0 && value.bend !== 0 && value2 < 1) {
        let value5 = value.bend * cursorBendEnvelope(value2) / value4;
        x += -value.dy * value5, y += value.dx * value5;
      }
    }
    return {
      x,
      y
    };
  }
  function createCursorMotion(random, from, to2, startTime, bend) {
    let value = to2.x - from.x, value2 = to2.y - from.y, value3 = Math.hypot(value, value2), value4 = random() < 0.75 ? 0.05 + 0.08 * random() : -(0.05 + 0.06 * random()), value5 = (random() - 0.5) * 0.1, state = {
      t0: startTime,
      T: 0.9 + 0.25 * random() + Math.min(0.2, value3 / 600),
      dx: value * (1 + value4) - value2 * value5,
      dy: value2 * (1 + value4) + value * value5,
      bend: bend * (0.1 + 0.1 * random()) * value3
    };
    return [
      state,
      {
        t0: startTime + (0.7 + 0.08 * random()) * state.T,
        T: 0.5 + 0.2 * random(),
        dx: value - state.dx,
        dy: value2 - state.dy,
        bend: 0
      }
    ];
  }
  function createCursorIntroPath(random, { rx: limits, ry: ry2 }) {
    let value = random() < 0.65 ? 1 : -1, state = {
      x: (random() - 0.5) * 0.3 * limits,
      y: (random() - 0.3) * 0.4 * ry2
    }, value2 = random() < 0.7 ? value : -value, value3 = value2 === value ? 0 : 0.2, state2 = {
      x: value * (0.72 + 0.2 * random()) * limits,
      y: (0.65 - value3 + 0.3 * random()) * ry2
    };
    if (random() < 0.6)
      return {
        from: state2,
        strokes: createCursorMotion(random, state2, state, 0, value2),
        rest: state
      };
    let state3 = {
      x: state.x + value * (0.1 + 0.3 * random()) * limits,
      y: state.y - (0.4 + 0.4 * random()) * ry2
    }, state4 = {
      t0: 0,
      T: 0.85 + 0.2 * random(),
      dx: state3.x - state2.x,
      dy: state3.y - state2.y,
      bend: value2 * 0.12 * Math.hypot(state3.x - state2.x, state3.y - state2.y)
    };
    return {
      from: state2,
      strokes: [
        state4,
        ...createCursorMotion(random, state3, state, (0.5 + 0.1 * random()) * state4.T, -value2)
      ],
      rest: state
    };
  }
  function createCursorIdleMotion(random, from, { rx: limits, ry: startTime }, value) {
    let callback = (input, options) => Math.min(options, Math.max(-options, input)), value2 = from, value3 = -1;
    for (let index4 = 0; index4 < 8 && value3 < 30; index4++) {
      let value4 = random() * 2 * Math.PI, value5 = 30 + 50 * random(), state = {
        x: callback(from.x + value5 * Math.cos(value4), 0.62 * limits),
        y: callback(from.y + 0.6 * value5 * Math.sin(value4), 0.5 * startTime)
      }, value6 = Math.hypot(state.x - from.x, state.y - from.y);
      value6 > value3 && (value3 = value6, value2 = state);
    }
    return {
      strokes: createCursorMotion(random, from, value2, value, random() < 0.5 ? 1 : -1),
      rest: value2
    };
  }
  function animateAgentWorkingCursor(surface, arrow5, label, reducedMotion) {
    let value = reducedMotion || typeof requestAnimationFrame != "function", clientWidth = surface.clientWidth, clientHeight = surface.clientHeight, callback = () => ({
      rx: Math.max(0, (clientWidth - CLAUDE_WORKING_LABEL_WIDTH - 2 * CLAUDE_WORKING_MARGIN) / 2),
      ry: Math.max(0, (clientHeight - CLAUDE_WORKING_LABEL_HEIGHT - 2 * CLAUDE_WORKING_MARGIN) / 2)
    }), value2 = seededCursorRandom(Math.random() * 4294967296), value3 = createCursorIntroPath(value2, callback()), from = value3.from, strokes = value3.strokes, NaN2 = Number.NaN, index4 = 0, index22 = 0, index32 = 0, count = 0.18, value4 = -1, index42 = 0, value5, callback2 = (input) => {
      let value7 = value4 < 0 ? 0 : Math.min(0.05, Math.max(0, (input - value4) / 1e3));
      value4 = input, count += value7;
      let { rx: value8, ry: value9 } = callback(), value10 = value ? value3.rest : cursorPositionAt(from, strokes, count), value11 = CLAUDE_WORKING_MARGIN + value8 + Math.min(value8, Math.max(-value8, value10.x)), value12 = CLAUDE_WORKING_MARGIN + value9 + Math.min(value9, Math.max(-value9, value10.y));
      (value || Number.isNaN(NaN2)) && (NaN2 = value11, index4 = value12);
      for (let value14 = value7; value14 > 0; value14 -= 8e-3) {
        let value15 = Math.min(8e-3, value14);
        index22 += (CLAUDE_CURSOR_IDLE_MS * (value11 - NaN2) - CLAUDE_CURSOR_GLIDE_MS * index22) * value15, index32 += (CLAUDE_CURSOR_IDLE_MS * (value12 - index4) - CLAUDE_CURSOR_GLIDE_MS * index32) * value15, NaN2 += index22 * value15, index4 += index32 * value15;
      }
      let value13 = !value && (count < cursorMotionEndTime(strokes) || Math.abs(value11 - NaN2) + Math.abs(value12 - index4) > 0.05 || Math.abs(index22) + Math.abs(index32) > 1);
      return value13 || (NaN2 = value11, index4 = value12, index22 = index32 = 0), arrow5.style.transform = "translate(" + value11.toFixed(2) + "px," + value12.toFixed(2) + "px)", label.style.transform = "translate(" + NaN2.toFixed(2) + "px," + index4.toFixed(2) + "px)", value13;
    }, callback3 = (input) => {
      index42 = callback2(input) ? requestAnimationFrame(callback3) : 0, index42 === 0 && callback5();
    }, callback4 = () => {
      value4 = -1, index42 = requestAnimationFrame(callback3);
    }, callback5 = () => {
      value5 = setTimeout(() => {
        from = cursorPositionAt(from, strokes, count), strokes = createCursorIdleMotion(value2, from, callback(), count).strokes, callback4();
      }, (CLAUDE_CURSOR_ARROW_SIZE + CLAUDE_CURSOR_LABEL_OFFSET * value2()) * 1e3);
    }, value6 = typeof ResizeObserver == "function" ? new ResizeObserver(() => {
      clientWidth = surface.clientWidth, clientHeight = surface.clientHeight, index42 === 0 && (NaN2 = Number.NaN, callback2(value4));
    }) : null;
    return value6?.observe(surface), callback2(typeof performance == "object" ? performance.now() : 0), value || callback4(), () => {
      index42 !== 0 && cancelAnimationFrame(index42), clearTimeout(value5), value6?.disconnect();
    };
  }
  function AgentWorkingCursor({ working, tint, idle, action, busy }) {
    let ref = reactIV0.useRef(null), ref2 = reactIV0.useRef(null), ref3 = reactIV0.useRef(null);
    reactIV0.useLayoutEffect(() => {
      let current = ref.current, current2 = ref2.current, current3 = ref3.current;
      if (!working || !current || !current2 || !current3)
        return;
      let value2 = typeof matchMedia == "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null, value3 = animateAgentWorkingCursor(current, current2, current3, value2?.matches === !0), callback = () => {
        value3(), value3 = animateAgentWorkingCursor(current, current2, current3, value2?.matches === !0);
      };
      return value2?.addEventListener?.("change", callback), () => {
        value2?.removeEventListener?.("change", callback), value3();
      };
    }, [working]);
    let value = "var(--cds-" + tint + "-500)";
    return jsxsG.jsxs("div", {
      "data-kit": "claude-working-empty-state",
      "data-working": working ? "true" : void 0,
      className: "mc-claude-empty flex flex-col items-center gap-3",
      children: [
        jsxsG.jsxs("div", {
          className: "relative",
          "aria-busy": busy ? !0 : void 0,
          children: [
            jsxsG.jsx("div", {
              className: "mc-claude-empty-idle flex flex-col items-center gap-3",
              "aria-hidden": working ? !0 : void 0,
              children: idle
            }),
            jsxsG.jsxs("div", {
              ref,
              className: "mc-claude-empty-working",
              "aria-hidden": "true",
              children: [
                jsxsG.jsx("div", {
                  ref: ref3,
                  className: "mc-peer-cursor",
                  children: jsxsG.jsx("span", {
                    className: "mc-peer-tag mc-cursor-chat",
                    style: {
                      background: value
                    },
                    children: CLAUDE_WORKING_LABEL
                  })
                }),
                jsxsG.jsx("div", {
                  ref: ref2,
                  className: "mc-peer-cursor",
                  children: jsxsG.jsx(PeerCursorArrow, {
                    color: value
                  })
                })
              ]
            })
          ]
        }),
        action,
        working ? jsxsG.jsx("span", {
          className: "sr-only",
          children: CLAUDE_WORKING_LABEL
        }) : null
      ]
    });
  }
  function AnimatedAgentLabel({ text, outMs, inMs, shimmer }) {
    let [value, value2] = reactc3.useState({
      a: text,
      b: "",
      front: "a"
    }), ref = reactc3.useRef(null), [value3, value4] = reactc3.useState(null), [value5, value6] = reactc3.useState(0);
    reactc3.useEffect(() => {
      value2((input) => (input.front === "a" ? input.a : input.b) === text ? input : input.front === "a" ? {
        ...input,
        b: text,
        front: "b"
      } : {
        ...input,
        a: text,
        front: "a"
      });
    }, [text]), reactc3.useEffect(() => {
      let flag = !0;
      return (typeof document < "u" ? document.fonts?.ready : void 0)?.then(() => {
        flag && value6((input) => input + 1);
      }), () => {
        flag = !1;
      };
    }, []), reactc3.useLayoutEffect(() => {
      if (!ref.current)
        return;
      let value9 = ref.current.offsetWidth + 1;
      value4((input) => input !== null && input.width === value9 ? input : {
        width: value9,
        narrows: input !== null && value9 < input.width
      });
    }, [value, value5]);
    let value7 = value3?.narrows === !0 ? {
      transitionDuration: inMs + "ms",
      transitionDelay: outMs + "ms"
    } : {
      transitionDuration: outMs + "ms",
      transitionDelay: "0ms"
    }, callback = (input) => input ? {
      transitionDuration: inMs + "ms",
      transitionDelay: outMs + "ms"
    } : {
      transitionDuration: outMs + "ms",
      transitionDelay: "0ms"
    }, value8 = value.front === "a" ? value.a : value.b;
    return jsxcq.jsxs("span", {
      className: "mc-tip-fade",
      style: {
        width: value3 === null ? void 0 : value3.width,
        ...value7
      },
      children: [
        jsxcq.jsx("span", {
          ref,
          className: "mc-tip-sizer",
          "aria-hidden": "true",
          children: value8
        }),
        ["a", "b"].map((input) => jsxcq.jsx("span", {
          className: shimmer ? "mc-tip-line mc-tip-shimmer" : "mc-tip-line",
          "data-front": value.front === input ? "true" : void 0,
          style: callback(value.front === input),
          children: value[input]
        }, input))
      ]
    });
  }
  function AgentCursorLabel({ tint, label }) {
    let value = "var(--cds-" + tint + "-500)";
    return label.kind === "name" ? jsxcq.jsx("span", {
      "aria-hidden": "true",
      className: "mc-peer-tag mc-peer-cursor-label mc-claude-tag-name",
      style: {
        background: value
      },
      children: label.text
    }) : jsxcq.jsx("span", {
      "aria-hidden": "true",
      className: "mc-peer-tag mc-cursor-chat",
      style: {
        background: value
      },
      children: jsxcq.jsx(AnimatedAgentLabel, {
        text: label.text,
        outMs: label.outMs ?? CLAUDE_LABEL_OUT_MS,
        inMs: label.inMs ?? CLAUDE_LABEL_IN_MS,
        shimmer: label.shimmer === !0
      })
    });
  }
  function AgentCursor({ tint, label, at, align: align2 = "arrow", glideMs = 0, glyphScale, hidden = !1, arrowRef }) {
    let value = glyphScale !== void 0 && Number.isFinite(glyphScale) && glyphScale > 0 ? glyphScale : 1, value2 = at !== void 0 && glideMs > 0, value3 = value === 1 ? "" : " scale(" + String(value) + ")", value4 = at !== void 0 ? {
      transform: "translate(" + String(at.left) + "px," + String(at.top) + "px)" + value3,
      transformOrigin: "0 0",
      ...value2 ? {
        "--mc-claude-glide": String(glideMs) + "ms"
      } : {}
    } : value === 1 ? void 0 : {
      transform: value3.trim(),
      transformOrigin: "0 0"
    };
    return jsxWz.jsx("div", {
      "aria-hidden": "true",
      className: "mc-claude-cursor",
      "data-flow": at === void 0 ? "" : void 0,
      "data-align": at !== void 0 && align2 === "centre" ? "centre" : void 0,
      "data-glide": value2 ? "" : void 0,
      "data-hidden": hidden ? "" : void 0,
      style: value4,
      children: jsxWz.jsxs("div", {
        className: "mc-claude-cursor-unit",
        children: [
          jsxWz.jsx("div", {
            ref: arrowRef,
            className: "mc-claude-cursor-arrow",
            children: jsxWz.jsx(PeerCursorArrow, {
              color: "var(--cds-" + tint + "-500)"
            })
          }),
          jsxWz.jsx(AgentCursorLabel, {
            tint,
            label
          })
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "reactIV0", () => reactIV0, (value) => {
    reactIV0 = value;
  }), bindRuntimeValue(runtime2, "jsxFc", () => jsxFc, (value) => {
    jsxFc = value;
  }), bindRuntimeValue(runtime2, "PeerCursorArrow", () => PeerCursorArrow), bindRuntimeValue(runtime2, "seededCursorRandom", () => seededCursorRandom), bindRuntimeValue(runtime2, "clampCursorProgress", () => clampCursorProgress, (value) => {
    clampCursorProgress = value;
  }), bindRuntimeValue(runtime2, "cursorMotionEase", () => cursorMotionEase, (value) => {
    cursorMotionEase = value;
  }), bindRuntimeValue(runtime2, "cursorBendEnvelope", () => cursorBendEnvelope, (value) => {
    cursorBendEnvelope = value;
  }), bindRuntimeValue(runtime2, "cursorPositionAt", () => cursorPositionAt), bindRuntimeValue(runtime2, "cursorMotionEndTime", () => cursorMotionEndTime, (value) => {
    cursorMotionEndTime = value;
  }), bindRuntimeValue(runtime2, "createCursorMotion", () => createCursorMotion), bindRuntimeValue(runtime2, "createCursorIntroPath", () => createCursorIntroPath), bindRuntimeValue(runtime2, "createCursorIdleMotion", () => createCursorIdleMotion), bindRuntimeValue(runtime2, "jsxsG", () => jsxsG, (value) => {
    jsxsG = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_WORKING_LABEL", () => CLAUDE_WORKING_LABEL, (value) => {
    CLAUDE_WORKING_LABEL = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_WORKING_LABEL_WIDTH", () => CLAUDE_WORKING_LABEL_WIDTH, (value) => {
    CLAUDE_WORKING_LABEL_WIDTH = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_WORKING_LABEL_HEIGHT", () => CLAUDE_WORKING_LABEL_HEIGHT, (value) => {
    CLAUDE_WORKING_LABEL_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_WORKING_MARGIN", () => CLAUDE_WORKING_MARGIN, (value) => {
    CLAUDE_WORKING_MARGIN = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_CURSOR_IDLE_MS", () => CLAUDE_CURSOR_IDLE_MS, (value) => {
    CLAUDE_CURSOR_IDLE_MS = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_CURSOR_GLIDE_MS", () => CLAUDE_CURSOR_GLIDE_MS, (value) => {
    CLAUDE_CURSOR_GLIDE_MS = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_CURSOR_ARROW_SIZE", () => CLAUDE_CURSOR_ARROW_SIZE, (value) => {
    CLAUDE_CURSOR_ARROW_SIZE = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_CURSOR_LABEL_OFFSET", () => CLAUDE_CURSOR_LABEL_OFFSET, (value) => {
    CLAUDE_CURSOR_LABEL_OFFSET = value;
  }), bindRuntimeValue(runtime2, "animateAgentWorkingCursor", () => animateAgentWorkingCursor), bindRuntimeValue(runtime2, "AgentWorkingCursor", () => AgentWorkingCursor), bindRuntimeValue(runtime2, "reactc3", () => reactc3, (value) => {
    reactc3 = value;
  }), bindRuntimeValue(runtime2, "jsxcq", () => jsxcq, (value) => {
    jsxcq = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_LABEL_OUT_MS", () => CLAUDE_LABEL_OUT_MS, (value) => {
    CLAUDE_LABEL_OUT_MS = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_LABEL_IN_MS", () => CLAUDE_LABEL_IN_MS, (value) => {
    CLAUDE_LABEL_IN_MS = value;
  }), bindRuntimeValue(runtime2, "AnimatedAgentLabel", () => AnimatedAgentLabel), bindRuntimeValue(runtime2, "AgentCursorLabel", () => AgentCursorLabel), bindRuntimeValue(runtime2, "jsxWz", () => jsxWz, (value) => {
    jsxWz = value;
  }), bindRuntimeValue(runtime2, "AgentCursor", () => AgentCursor), () => {
    reactIV0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxFc = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), clampCursorProgress = (progress) => progress < 0 ? 0 : progress > 1 ? 1 : progress, cursorMotionEase = (progress) => {
      let value = Math.pow(clampCursorProgress(progress), 0.86);
      return value * value * value * (10 + value * (6 * value - 15));
    }, cursorBendEnvelope = (progress) => {
      let value = clampCursorProgress(progress) * (1 - clampCursorProgress(progress));
      return 16 * value * value;
    }, cursorMotionEndTime = (motions) => motions.reduce((input, options) => Math.max(input, options.t0 + options.T), 0), jsxsG = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CLAUDE_WORKING_LABEL = "The agent is working…", CLAUDE_WORKING_LABEL_WIDTH = 176, CLAUDE_WORKING_LABEL_HEIGHT = 56, CLAUDE_WORKING_MARGIN = 8, CLAUDE_CURSOR_IDLE_MS = 1600, CLAUDE_CURSOR_GLIDE_MS = 76, CLAUDE_CURSOR_ARROW_SIZE = 12, CLAUDE_CURSOR_LABEL_OFFSET = 14, reactc3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxcq = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CLAUDE_LABEL_OUT_MS = 80, CLAUDE_LABEL_IN_MS = 120, jsxWz = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiAgentCursor
};
