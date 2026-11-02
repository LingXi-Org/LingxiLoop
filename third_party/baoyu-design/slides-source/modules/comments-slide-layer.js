// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsSlideLayer(runtime2) {
  var SlideCommentLayerJsx, COMMENT_AREA_TAP_TIMEOUT_MS, COMMENT_POINTER_MOVE_THRESHOLD_PX, COMMENT_TOUCH_MOVE_THRESHOLD_PX, COMMENT_AREA_MIN_SIZE_PX, SLIDE_COMMENT_UNIT_RECT, clampSlideCommentFraction, slideCommentTargetsEqual, slideCommentTargetsSameElement;
  function useSlideCommentController(options) {
    let [value, value2] = runtime2.ReactSlideComments.useState(null), ref = runtime2.ReactSlideComments.useRef(null), [noController, setNoController] = runtime2.ReactSlideComments.useState(!1), [value3, value4] = runtime2.ReactSlideComments.useState(!1), [value5, value6] = runtime2.ReactSlideComments.useState([]), [value7, value8] = runtime2.ReactSlideComments.useState(!1), ref2 = runtime2.ReactSlideComments.useRef(value5);
    ref2.current = value5;
    let ref3 = runtime2.ReactSlideComments.useRef(options);
    ref3.current = options;
    let ref4 = runtime2.ReactSlideComments.useRef(null), onRef = runtime2.ReactSlideComments.useRef(value3);
    onRef.current = value3;
    let threadCount = runtime2.ReactSlideComments.useRef(0), reportedRef = runtime2.ReactSlideComments.useRef(!1), pinsWanted = !value3 && value5.length > 0, pinsWantedRef = runtime2.ReactSlideComments.useRef(pinsWanted);
    pinsWantedRef.current = pinsWanted;
    let pins = runtime2.ReactSlideComments.useMemo(() => (0, runtime2.createCommentPinReporter)((positions) => {
      reportedRef.current = Object.keys(positions).length > 0, ref.current?.placed(positions);
    }, () => pinsWantedRef.current), []);
    runtime2.ReactSlideComments.useEffect(() => {
      pinsWanted || pins.reset();
    }, [pinsWanted, pins]), runtime2.ReactSlideComments.useEffect(() => {
      let flag = !1;
      return (0, runtime2.getCustomCommentAnchors)({
        mode: (input) => {
          value4(input), input ? threadCount.current === 0 && reportedRef.current && (reportedRef.current = !1, ref.current?.placed({})) : (value6([]), threadCount.current = 0), ref3.current.onMode(input);
        },
        threads: (input) => {
          threadCount.current = input.length, pins.forget(), value6(input);
        },
        composing: value8,
        move: (input, options2) => ref4.current?.(input, options2) ?? Promise.resolve(null),
        hotkey: !0,
        pinsOutsideMode: !0,
        reveal: (input) => {
          let value9 = ref2.current.find((input2) => input2.id === input), value10 = value9 ? (0, runtime2.parseSlideCommentAnchor)(value9.anchor) : null;
          value10 && ref3.current.onReveal(value10);
        }
      }).then((input) => {
        if (flag) {
          input?.release();
          return;
        }
        ref.current = input, value2(input), setNoController(input === null), (0, runtime2.setCommentAnchorController)(input);
      }), () => {
        flag = !0, ref.current?.release(), ref.current = null, (0, runtime2.setCommentAnchorController)(null);
      };
    }, []);
    let hostMode = (0, runtime2.useDocumentCommentMode)() && noController;
    return {
      ctl: value,
      on: value3 || hostMode,
      threads: value5,
      composing: value7,
      moveRef: ref4,
      pins,
      onRef,
      reportedRef
    };
  }
  function SlideCommentLayer({ ctl, on: on2, threads, composing, moveRef, pins, onRef, reportedRef, slide, slides, typeStyles, containerRef, hidden, keepsMode, topInset = 0, remeasureRef, pinsQuiet = !1 }) {
    let ref = runtime2.ReactSlideComments.useRef(topInset);
    ref.current = topInset;
    let [value, value2] = runtime2.ReactSlideComments.useState(null), callback = (input) => value2((input2) => (0, runtime2.parseCommentCell)(input2, input) ? input2 : input), [value3, value4] = runtime2.ReactSlideComments.useState(null), callback2 = (input) => value4((input2) => (0, runtime2.parseCommentCell)(input2, input) ? input2 : input), [value5, value6] = runtime2.ReactSlideComments.useState(null), callback3 = (input) => value6((input2) => input2 === input || input2 && input && input2.w === input.w && input2.h === input.h ? input2 : input), [value7, value8] = runtime2.ReactSlideComments.useState(null), callback4 = (input) => value8((input2) => (0, runtime2.parseCommentCell)(input2, input) ? input2 : input), ref2 = runtime2.ReactSlideComments.useRef(null), ref3 = runtime2.ReactSlideComments.useRef(null), ref4 = runtime2.ReactSlideComments.useRef(!1), ref5 = runtime2.ReactSlideComments.useRef(null), ref6 = runtime2.ReactSlideComments.useRef(""), ref7 = runtime2.ReactSlideComments.useRef({
      slide,
      slides,
      typeStyles,
      hidden: hidden === !0,
      on: on2
    });
    ref7.current = {
      slide,
      slides,
      typeStyles,
      hidden: hidden === !0,
      on: on2
    };
    let ref8 = runtime2.ReactSlideComments.useRef(null), ref9 = runtime2.ReactSlideComments.useRef(null), [value9, value10] = runtime2.ReactSlideComments.useState([]), callback5 = (input) => value10((input2) => slideCommentTargetsSameElement(input2, input) ? input2 : input), ref10 = runtime2.ReactSlideComments.useRef(value9);
    ref10.current = value9;
    let [value11, value12] = runtime2.ReactSlideComments.useState(null), ref11 = runtime2.ReactSlideComments.useRef(null);
    ref11.current = value11;
    let ref12 = runtime2.ReactSlideComments.useRef(null), [value13, value14] = runtime2.ReactSlideComments.useState(!0), ref13 = runtime2.ReactSlideComments.useRef(!0), ref14 = runtime2.ReactSlideComments.useRef(null), callback6 = (input) => {
      ref13.current !== input && (ref13.current = input, input && (ref14.current = null), value14(input));
    }, [value15, value16] = runtime2.ReactSlideComments.useState(!1), ref15 = runtime2.ReactSlideComments.useRef(!1), callback7 = (input) => {
      if (!input)
        return;
      let value27 = typeof window.matchMedia == "function" && window.matchMedia("(hover: none)").matches;
      ref15.current = !0, input.focus({
        preventScroll: !0
      }), ref15.current = !1, value16(value27);
    }, value17 = runtime2.ReactSlideComments.useId(), value18 = runtime2.ReactSlideComments.useId(), callback8 = () => {
      let activeElement2 = document.activeElement;
      return document.hasFocus() && (activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement || ref8.current?.contains(activeElement2) === !0 || activeElement2.matches('[data-slide-surface][tabindex="-1"]') && containerRef.current?.contains(activeElement2) === !0);
    }, memo4 = runtime2.ReactSlideComments.useMemo(() => threads.map((input) => ({
      id: input.id,
      active: input.active,
      a: (0, runtime2.parseSlideCommentAnchor)(input.anchor)
    })).filter((input) => input.a !== null), [threads]), callback9 = (input, options) => {
      let current = containerRef.current;
      if (!current)
        return null;
      for (let value27 of document.elementsFromPoint(input, options)) {
        if (value27.closest("[data-slides-comments]"))
          continue;
        if (!current.contains(value27) || value27.closest("[data-uncommentable]"))
          return null;
        let value28 = (0, runtime2.hitTestFrameCommentAnchor)(ref7.current.slide.id, current, value27, input, options);
        if (value28)
          return value28;
        let ancestor = value27.closest("[data-slide-surface]");
        return ancestor ? (0, runtime2.hitTestSlideCommentAnchor)(ref7.current.slide.id, ancestor, input, options) : null;
      }
      return null;
    }, callback10 = () => containerRef.current?.querySelector("[data-slide-surface]") ?? null, callback11 = (input, options) => {
      let value27 = callback10()?.getBoundingClientRect();
      return value27 ? {
        x: (input - value27.left) / (value27.width || 1),
        y: (options - value27.top) / (value27.height || 1)
      } : null;
    }, callback12 = (input) => {
      let value27 = callback10()?.getBoundingClientRect();
      return value27 ? {
        x: value27.left + input.x * value27.width,
        y: value27.top + input.y * value27.height
      } : null;
    }, callback13 = (source) => {
      let { slide: current, slides: current2, hidden: current3 } = ref7.current, current4 = containerRef.current;
      return current3 || !current4 || (0, runtime2.hashScopedSlideId)(current.id) !== source.slideHash ? null : source.kind === "slide" || source.kind === "area" && source.frameHash === null ? current4.querySelector("[data-slide-surface]") : (0, runtime2.resolveCommentAnchorElement)(source, (0, runtime2.resolveCommentSlide)(source, current2), current4, null);
    }, callback14 = (input) => {
      let value27 = callback13(input);
      return value27 ? (0, runtime2.commentAnchorPoint)(value27, input) : null;
    }, callback15 = (input) => {
      let current = containerRef.current, value27 = callback13(input);
      return current && value27 ? (0, runtime2.commentAnchorAreaRect)(value27, input, current.getBoundingClientRect()) : null;
    }, ref16 = runtime2.ReactSlideComments.useRef(memo4);
    ref16.current = memo4, runtime2.ReactSlideComments.useEffect(() => {
      ref6.current = "";
    }, [memo4]), runtime2.ReactSlideComments.useEffect(() => {
      if (!ctl || !on2)
        return;
      let index4 = 0, callback30 = () => {
        if (index4 = requestAnimationFrame(callback30), !(onRef?.current ?? ref7.current.on))
          return;
        let current = containerRef.current;
        if (!current)
          return;
        let bounds = current.getBoundingClientRect(), state = {};
        for (let { id: value31, a: value32 } of ref16.current) {
          let value33 = callback14(value32);
          if (!value33)
            continue;
          let { x: value34, y: value35 } = value33;
          value34 < bounds.left ? value34 -= window.innerWidth : value34 > bounds.right && (value34 += window.innerWidth), value35 < bounds.top + ref.current ? value35 -= window.innerHeight : value35 > bounds.bottom && (value35 += window.innerHeight), state[value31] = {
            x: Math.round(value34 + window.scrollX),
            y: Math.round(value35 + window.scrollY)
          };
        }
        let value27 = JSON.stringify(state);
        value27 !== ref6.current && (ref6.current = value27, reportedRef && (reportedRef.current = value27 !== "{}"), ctl.placed(state));
        let value28 = callback10(), value29 = value28 ? (0, runtime2.getCommentElementRect)(value28, bounds) : null;
        callback2(value29), callback3({
          w: bounds.width,
          h: bounds.height
        });
        let value30 = ctl.areas ? ref16.current.find((input) => input.active) : void 0;
        callback4(value30 && value30.a.kind === "area" ? callback15(value30.a) : null);
        let current2 = ref2.current;
        if (current2 && !ref7.current.hidden && !value20.drawing()) {
          let value31 = callback9(current2.x, current2.y);
          callback(value31 ? (0, runtime2.getCommentElementRect)(value31.el, bounds) : null);
        }
        if (!(0, runtime2.parseCommentCell)(value29, ref3.current))
          ref4.current = !0;
        else if (ref4.current)
          ref4.current = !1, ref20.current();
        else {
          let current3 = ref11.current, value31 = current3 !== null && current3 !== "slide" ? ref10.current.find((input) => input.key === current3.key) : void 0, value32 = value31 ? ref23.current(value31.ref) : null;
          if (value31 && value32) {
            let bounds2 = value32.getBoundingClientRect(), value33 = (0, runtime2.collectCommentableNodeElements)({
              left: bounds2.left - bounds.left,
              top: bounds2.top - bounds.top,
              width: bounds2.width,
              height: bounds2.height
            }, bounds.width, bounds.height, ref.current);
            (0, runtime2.parseCommentCell)(value33, value31.rect) || ref20.current();
          }
        }
        ref3.current = value29;
      };
      return callback30(), () => {
        cancelAnimationFrame(index4), ref6.current = "", ref2.current = null, ref3.current = null, ref4.current = !1, callback(null), callback2(null), callback3(null), callback4(null), callback5([]), (onRef?.current ?? ref7.current.on) && (reportedRef && (reportedRef.current = !1), ctl.placed({}));
      };
    }, [ctl, on2]);
    let pinsWanted = !on2 && memo4.length > 0 && ctl !== null && pins !== void 0, pinsWantedRef = runtime2.ReactSlideComments.useRef(pinsWanted);
    pinsWantedRef.current = pinsWanted;
    let pinsQuietRef = runtime2.ReactSlideComments.useRef(pinsQuiet);
    pinsQuietRef.current = pinsQuiet;
    let pinsGone = runtime2.ReactSlideComments.useRef(!1), placePins = () => {
      let current = containerRef.current;
      if (pinsGone.current || !current || !pins)
        return;
      let bounds = current.getBoundingClientRect(), occluders = (0, runtime2.collectCommentPinOccluders)(), state = {};
      for (let { id, a: anchor } of pinsQuietRef.current ? [] : ref16.current) {
        let point = callback14(anchor);
        if (!point)
          continue;
        let { x, y } = point;
        x < bounds.left ? x -= window.innerWidth : x > bounds.right && (x += window.innerWidth), y < bounds.top + ref.current ? y -= window.innerHeight : y > bounds.bottom && (y += window.innerHeight), !(0, runtime2.commentPinOccluded)(x, y, occluders) && (state[id] = {
          x: Math.round(x + window.scrollX),
          y: Math.round(y + window.scrollY)
        });
      }
      pins.set("slide", state);
    }, placePinsRef = runtime2.ReactSlideComments.useRef(placePins);
    placePinsRef.current = placePins, runtime2.ReactSlideComments.useLayoutEffect(() => {
      if (pinsWanted)
        return pinsGone.current = !1, () => {
          pinsGone.current = !0, pinsWantedRef.current && pins?.set("slide", null);
        };
    }, [pinsWanted, pins]), runtime2.ReactSlideComments.useLayoutEffect(() => {
      pinsWanted && placePins();
    }), runtime2.ReactSlideComments.useEffect(() => {
      if (!pinsWanted)
        return;
      let frame = 0, schedule = () => {
        frame === 0 && (frame = requestAnimationFrame(() => (frame = 0, placePinsRef.current())));
      };
      remeasureRef && (remeasureRef.current = schedule);
      let current = containerRef.current, observer = typeof ResizeObserver > "u" ? null : new ResizeObserver(schedule);
      current && observer?.observe(current);
      let stopShifts = (0, runtime2.observeCommentLayoutShifts)(current, schedule), stopBody = (0, runtime2.observeBodyChildren)(schedule);
      return () => {
        cancelAnimationFrame(frame), remeasureRef?.current === schedule && (remeasureRef.current = null), observer?.disconnect(), stopShifts(), stopBody();
      };
    }, [pinsWanted, containerRef, remeasureRef]), runtime2.ReactSlideComments.useEffect(() => {
      if (!ctl || !on2 || typeof ctl.exitMode != "function")
        return;
      let callback30 = (event) => {
        if (event.button !== 0)
          return;
        let value27 = event.target instanceof Element ? event.target : null;
        !value27 || (0, runtime2.deferCommentFootPress)(value27, () => ctl.exitMode?.()) || containerRef.current?.contains(value27) === !0 && value27.closest("[data-tb-foot]") === null || keepsMode?.(value27) || ctl.exitMode?.();
      };
      return document.addEventListener("pointerdown", callback30, !0), () => document.removeEventListener("pointerdown", callback30, !0);
    }, [ctl, on2, keepsMode]);
    let ref17 = runtime2.ReactSlideComments.useRef((0, runtime2.createCommentOperationToken)()), value19 = (0, runtime2.useCommentMoveKeyHighlight)(composing, slide.id), { drawn } = value19, ref18 = runtime2.ReactSlideComments.useRef(drawn);
    ref18.current = drawn;
    let value20 = (0, runtime2.useCommentAreaDrag)({
      toLocal: callback11,
      toClient: callback12,
      stage: () => containerRef.current,
      slopPx: COMMENT_TOUCH_MOVE_THRESHOLD_PX,
      onClick: (input) => ref19.current(input.clientX, input.clientY),
      onNothing: () => value19.restore(),
      onLive: () => value19.show(null),
      onArea: ({ c0, c1, at, resizing }) => {
        let [value27] = (0, runtime2.rankCommentAreaHosts)({
          x: Math.min(c0.x, c1.x),
          y: Math.min(c0.y, c1.y),
          w: Math.abs(c1.x - c0.x),
          h: Math.abs(c1.y - c0.y)
        }, [
          {
            board: SLIDE_COMMENT_UNIT_RECT,
            frame: SLIDE_COMMENT_UNIT_RECT
          }
        ]);
        if (!value27)
          return value19.restore();
        let value28 = resizing ? c1 : c0, state = {
          ...value27.inter,
          ox: clampSlideCommentFraction(value28.x),
          oy: clampSlideCommentFraction(value28.y)
        };
        value19.show(state), ref24.current(state, {
          x: at.x + window.scrollX,
          y: at.y + window.scrollY
        }, (0, runtime2.nearestCommentBoxCorner)(value27.inter, resizing ? c0 : c1), ref17.current.begin());
      }
    }), callback16 = () => ref7.current.slides.findIndex((input) => input.id === ref7.current.slide.id) + 1, callback17 = (input, options) => {
      let value27 = callback9(input, options);
      return value27 ? (0, runtime2.createCommentAnchorDescription)(value27, callback16(), ref7.current.slide, ref7.current.typeStyles) : null;
    }, callback18 = (input, options) => {
      if (ref17.current.cancel(), !ctl)
        return;
      let value27 = callback17(input, options);
      value27 && ctl.compose(value27.anchor, {
        x: input + window.scrollX,
        y: options + window.scrollY
      }, {
        label: value27.label,
        ...value27.detail ? {
          detail: value27.detail
        } : {}
      }).then((input2) => {
        input2.opened && value19.clear();
      }, () => {
      });
    }, ref19 = runtime2.ReactSlideComments.useRef(callback18);
    ref19.current = callback18, runtime2.ReactSlideComments.useEffect(() => {
      value20.cancel(), value19.clear(), ref17.current.cancel();
    }, [ctl, on2, hidden]), runtime2.ReactSlideComments.useEffect(() => {
      value20.cancel(), ref17.current.cancel();
    }, [slide.id]), runtime2.ReactSlideComments.useEffect(() => {
      threads.some((input) => input.active) && value19.show(null);
    }, [threads]);
    let callback19 = () => {
      let current = containerRef.current, value27 = callback10();
      return current && value27 ? (0, runtime2.collectSlideCommentAreaTargets)(ref7.current.slide, current, value27, "[data-uncommentable], [data-slides-comments]") : null;
    }, callback20 = () => {
      let current = containerRef.current, slide2 = ref7.current.slide, value27 = ref7.current.hidden ? null : callback19();
      if (!current || !value27)
        return callback5([]);
      let bounds = current.getBoundingClientRect(), items = [];
      for (let value28 of value27.els) {
        let value29 = (0, runtime2.frameById)(slide2, value28.ref.frameId);
        if (value29 && (0, runtime2.nodeAtPath)(value29.node, value28.ref.path)?.kind === "spacer")
          continue;
        let client = value28.client, value30 = (0, runtime2.collectCommentableNodeElements)({
          left: client.left - bounds.left,
          top: client.top - bounds.top,
          width: client.width,
          height: client.height
        }, bounds.width, bounds.height, ref.current);
        value30 && items.push({
          key: value28.ref.frameId + ":" + value28.ref.path.join("."),
          ref: value28.ref,
          rect: value30
        });
      }
      callback5(items);
    }, ref20 = runtime2.ReactSlideComments.useRef(callback20);
    ref20.current = callback20, runtime2.ReactSlideComments.useEffect(() => {
      !ctl || !on2 || hidden || callback20();
    }, [ctl, on2, hidden, slide, value5, topInset]);
    let ref21 = runtime2.ReactSlideComments.useRef(on2);
    runtime2.ReactSlideComments.useEffect(() => {
      if (ctl === null)
        return;
      let value27 = on2 && !ref21.current;
      ref21.current = on2, !(!value27 || hidden || (0, runtime2.elapsedSinceCommentComposition)() < COMMENT_AREA_TAP_TIMEOUT_MS) && callback8() && callback7(ref9.current);
    }, [on2, ctl, hidden]);
    let ref22 = runtime2.ReactSlideComments.useRef(!1);
    runtime2.ReactSlideComments.useEffect(() => {
      let value27 = ctl !== null && on2 && !hidden, value28 = ref22.current && !value27 && !on2;
      if (ref22.current = value27, value27)
        return;
      let value29 = (ref11.current ?? ref12.current) !== null;
      if (value12(null), !value28 || !value29 || !document.hasFocus())
        return;
      let activeElement2 = document.activeElement;
      (activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement) && containerRef.current?.querySelector('[data-slide-surface][tabindex="0"]')?.focus({
        preventScroll: !0
      });
    }, [ctl, on2, hidden]), runtime2.ReactSlideComments.useEffect(() => {
      if (!ctl || !on2 || hidden)
        return;
      let callback30 = (input) => {
        let current = ref14.current;
        current === null ? ref14.current = {
          x: input.clientX,
          y: input.clientY
        } : Math.abs(input.clientX - current.x) + Math.abs(input.clientY - current.y) > COMMENT_POINTER_MOVE_THRESHOLD_PX && callback6(!1);
      }, callback31 = (input) => {
        (0, runtime2.isCommentKeyboardTarget)(input) || callback6(!1);
      };
      return document.addEventListener("pointermove", callback30, {
        capture: !0,
        passive: !0
      }), document.addEventListener("pointerdown", callback31, !0), () => {
        document.removeEventListener("pointermove", callback30, !0), document.removeEventListener("pointerdown", callback31, !0);
      };
    }, [ctl, on2, hidden]), runtime2.ReactSlideComments.useEffect(() => {
      if (!ctl || !on2 || hidden) {
        ref12.current = null;
        return;
      }
      let value27, callback30 = () => {
        let current = ref12.current, activeElement2 = document.activeElement;
        current === null || !document.hasFocus() || !(activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement) || ((current === "slide" ? null : ref8.current?.querySelector('[data-slides-comment-target][data-key="' + CSS.escape(current.key) + '"]')) ?? ref9.current)?.focus({
          preventScroll: !0
        });
      }, callback31 = () => {
        clearTimeout(value27), value27 = setTimeout(callback30, 0);
      }, callback32 = (input) => {
        (0, runtime2.isCommentKeyboardTarget)(input) || (ref12.current = null);
      };
      return window.addEventListener("focus", callback31), document.addEventListener("pointerdown", callback32, !0), () => {
        clearTimeout(value27), window.removeEventListener("focus", callback31), document.removeEventListener("pointerdown", callback32, !0);
      };
    }, [ctl, on2, hidden]), runtime2.ReactSlideComments.useEffect(() => {
      let value27 = ref11.current ?? ref12.current;
      value27 === null || value27 === "slide" || value9.some((input) => input.key === value27.key) || (callback8() ? ref9.current?.focus({
        preventScroll: !0
      }) : value12(null));
    }, [value9]);
    let callback21 = (input) => {
      let value27 = containerRef.current?.querySelector('[data-frame-id="' + CSS.escape(input.frameId) + '"]') ?? null;
      return !value27 || input.path.length === 0 ? value27 : value27.querySelector('[data-node-path="' + input.path.join(".") + '"]');
    }, ref23 = runtime2.ReactSlideComments.useRef(callback21);
    ref23.current = callback21;
    let callback22 = (input) => {
      let current = containerRef.current;
      if (!current)
        return null;
      let bounds = input.getBoundingClientRect(), bounds2 = current.getBoundingClientRect(), value27 = (0, runtime2.collectCommentableNodeElements)({
        left: bounds.left - bounds2.left,
        top: bounds.top - bounds2.top,
        width: bounds.width,
        height: bounds.height
      }, bounds2.width, bounds2.height, ref.current);
      if (!value27)
        return null;
      let value28 = (0, runtime2.defaultCommentPoint)({
        left: bounds2.left + value27.left,
        top: bounds2.top + value27.top,
        width: value27.width,
        height: value27.height
      });
      return {
        x: value28.x,
        y: value28.y,
        fx: (0, runtime2.normalizeCommentPoint)(value28.x, bounds.left, bounds.width),
        fy: (0, runtime2.normalizeCommentPoint)(value28.y, bounds.top, bounds.height)
      };
    }, callback23 = (input) => {
      if (ref17.current.cancel(), !ctl || input === null)
        return;
      let { slide: current, typeStyles: current2 } = ref7.current, value27, value28;
      if (input === "slide")
        value27 = callback10(), value28 = {
          kind: "slide",
          slideId: current.id
        };
      else {
        let value31 = value9.find((input2) => input2.key === input.key)?.ref;
        if (value27 = value31 ? callback21(value31) : null, !value31)
          return;
        value28 = {
          kind: "frame",
          slideId: current.id,
          frameId: value31.frameId,
          path: value31.path
        }, (0, runtime2.encodeSlideCommentAnchor)({
          ...value28,
          fx: 0,
          fy: 0
        }) === null && (value28 = {
          ...value28,
          path: []
        }, value27 = callback21(value28));
      }
      let value29 = value27 ? callback22(value27) : null;
      if (!value29)
        return;
      let value30 = (0, runtime2.encodeSlideCommentAnchor)({
        ...value28,
        fx: value29.fx,
        fy: value29.fy
      });
      value30 !== null && ctl.compose(value30, {
        x: value29.x + window.scrollX,
        y: value29.y + window.scrollY
      }, (0, runtime2.describeFrameCommentAnchor)(callback16(), current, value28, current2)).then((input2) => {
        input2.opened && value19.clear();
      }, () => {
      });
    }, callback24 = (event, options) => {
      let current = ref13.current;
      callback6(!0), value16(!1), !(event.target !== event.currentTarget || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) && (event.key !== "Enter" && event.key !== " " || (event.preventDefault(), current && !event.repeat && callback23(options)));
    }, callback25 = (input, options, context, value27) => {
      let value28 = ctl;
      if (!value28 || !on2)
        return;
      let callback30 = () => {
        value27.live && value19.restore();
      }, value29 = callback26(input, context);
      if (!value29 || !ref7.current.on || !value27.live)
        return callback30();
      let id = ref7.current.slide.id;
      value28.compose(value29.anchor, options, {
        label: value29.label,
        ...value29.detail ? {
          detail: value29.detail
        } : {},
        area: !0
      }).then((input2) => {
        if (!input2.opened)
          return callback30();
        value27.live && value19.hold(input, id);
      }, callback30);
    }, callback26 = (input, options) => {
      let value27 = callback19();
      return value27 ? (0, runtime2.describeSlideCommentArea)(input, options, value27.els, callback16(), ref7.current.slide, ref7.current.typeStyles) : null;
    }, ref24 = runtime2.ReactSlideComments.useRef(callback25);
    ref24.current = callback25;
    let callback27 = async (input, options) => {
      if (!ctl || !on2 || ref7.current.hidden)
        return null;
      let value27 = threads.find((input2) => input2.id === input), value28 = value27 ? (0, runtime2.parseSlideCommentAnchor)(value27.anchor) : null;
      if (!value28)
        return null;
      let state = {
        x: options.x - window.scrollX,
        y: options.y - window.scrollY
      };
      if (!callback9(state.x, state.y))
        return null;
      let value29;
      if (value28.kind === "area") {
        let current = containerRef.current, value33 = callback15(value28), value34 = callback10()?.getBoundingClientRect(), value35 = callback11(state.x, state.y);
        if (!current || !value33 || !value34 || !value35)
          return null;
        let bounds = current.getBoundingClientRect(), state2 = {
          x: (bounds.left + value33.left - value34.left) / (value34.width || 1),
          y: (bounds.top + value33.top - value34.top) / (value34.height || 1),
          w: value33.width / (value34.width || 1),
          h: value33.height / (value34.height || 1)
        }, value36 = (0, runtime2.commentBoxCornerPoint)(state2, value28.box.corner), value37 = state2.w / ((value28.box.x1 - value28.box.x0) * 1e3), value38 = state2.h / ((value28.box.y1 - value28.box.y0) * 1e3), value39 = Math.round((value35.x - value36.x) / value37) * value37, value40 = Math.round((value35.y - value36.y) / value38) * value38, [value41] = (0, runtime2.rankCommentAreaHosts)({
          x: state2.x + value39,
          y: state2.y + value40,
          w: state2.w,
          h: state2.h
        }, [
          {
            board: SLIDE_COMMENT_UNIT_RECT,
            frame: SLIDE_COMMENT_UNIT_RECT
          }
        ]);
        value29 = value41 ? callback26(value41.inter, value28.box.corner) : null;
      } else
        value29 = callback17(state.x, state.y);
      if (!value29 || !ref7.current.on)
        return null;
      let value30 = (0, runtime2.parseSlideCommentAnchor)(value29.anchor), value31 = value30 ? callback14(value30) : null, value32 = value31 ? {
        x: Math.round(value31.x + window.scrollX),
        y: Math.round(value31.y + window.scrollY)
      } : options;
      return {
        anchor: value29.anchor,
        at: value32,
        label: value29.label,
        ...value29.detail ? {
          detail: value29.detail
        } : {},
        ...value29.area ? {
          area: !0
        } : {}
      };
    }, ref25 = runtime2.ReactSlideComments.useRef(callback27);
    ref25.current = callback27, runtime2.ReactSlideComments.useEffect(() => {
      if (!moveRef)
        return;
      let callback30 = (input, options) => ref25.current(input, options);
      return moveRef.current = callback30, () => {
        moveRef.current === callback30 && (moveRef.current = null);
      };
    }, [moveRef]);
    let callback28 = (input, options, context) => !ctl?.areas || input.button !== 0 || input.pointerType !== "mouse" ? !1 : (callback(null), value20.start(input, options, context)), ref26 = runtime2.ReactSlideComments.useRef(callback28);
    if (ref26.current = callback28, runtime2.ReactSlideComments.useEffect(() => {
      let current = ref8.current;
      if (!current)
        return;
      let callback30 = (event) => {
        if (event.button !== 0)
          return;
        if (event.pointerType !== "touch" && event.stopPropagation(), (0, runtime2.isCommentKeyboardTarget)(event)) {
          ref5.current = null;
          return;
        }
        let value27 = event.target instanceof Element && event.target.closest("[data-area-handle]") ? ref18.current : null, value28 = value27 ? {
          x: value27.ox <= value27.x + value27.w / 2 ? value27.x + value27.w : value27.x,
          y: value27.oy <= value27.y + value27.h / 2 ? value27.y + value27.h : value27.y
        } : void 0;
        ref26.current(event, current, value28) || (ref5.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          touch: event.pointerType === "touch"
        });
      }, callback31 = (input) => {
        let current2 = ref5.current;
        !current2 || current2.id !== input.pointerId || (ref5.current = null, !(Math.hypot(input.clientX - current2.x, input.clientY - current2.y) > (current2.touch ? COMMENT_AREA_MIN_SIZE_PX : COMMENT_TOUCH_MOVE_THRESHOLD_PX)) && ref19.current(input.clientX, input.clientY));
      }, callback32 = (input) => {
        ref5.current?.id === input.pointerId && (ref5.current = null);
      };
      return current.addEventListener("pointerdown", callback30), window.addEventListener("pointerup", callback31, !0), window.addEventListener("pointercancel", callback32, !0), () => {
        current.removeEventListener("pointerdown", callback30), window.removeEventListener("pointerup", callback31, !0), window.removeEventListener("pointercancel", callback32, !0);
      };
    }, [ctl, on2, hidden]), !ctl || !on2 || hidden)
      return null;
    let { marquee } = value20, value21 = (() => {
      if (!value3)
        return null;
      let callback30 = (input) => value3.left + input * value3.width, callback31 = (input) => value3.top + input * value3.height;
      if (marquee) {
        let value27 = callback30(marquee.pin.x), value28 = callback31(marquee.pin.y), { x1: value29, y1: value30 } = marquee;
        return {
          left: Math.min(value27, value29),
          top: Math.min(value28, value30),
          width: Math.abs(value29 - value27),
          height: Math.abs(value30 - value28),
          ox: marquee.resizing ? value29 : value27,
          oy: marquee.resizing ? value30 : value28
        };
      }
      return value7 || (drawn ? {
        left: callback30(drawn.x),
        top: callback31(drawn.y),
        width: drawn.w * value3.width,
        height: drawn.h * value3.height,
        ox: callback30(drawn.ox),
        oy: callback31(drawn.oy)
      } : null);
    })(), value22 = callback16(), value23 = value5 ? {
      left: 0,
      top: 0,
      width: value5.w,
      height: value5.h
    } : null, value24 = value3 && value5 ? (0, runtime2.collectCommentableNodeElements)(value3, value5.w, value5.h, topInset) : null, value25 = value11 === null || value15 ? null : value11 === "slide" ? value24 ?? value23 : value9.find((input) => input.key === value11.key)?.rect ?? null, value26 = value25 && value13 && !(value11 === "slide" && !value24) ? (0, runtime2.defaultCommentPoint)(value25) : null, callback29 = (input) => ({
      role: "button",
      tabIndex: 0,
      className: "pointer-events-none absolute focus-visible:outline-hidden",
      onKeyDown: (input2) => callback24(input2, input),
      onClick: (event) => {
        event.target === event.currentTarget && (event.currentTarget.focus({
          preventScroll: !0
        }), callback23(input));
      },
      onFocus: () => {
        ref12.current = input, callback6(!0), ref15.current || value16(!1), callback20(), value12(input);
      },
      onBlur: (input2) => {
        input2.relatedTarget !== null && slideCommentTargetsEqual(ref12.current, input) && (ref12.current = null), value12((input3) => slideCommentTargetsEqual(input3, input) ? null : input3);
      }
    });
    return SlideCommentLayerJsx.jsxs("div", {
      ref: ref8,
      "data-slides-comments": "",
      className: "absolute inset-0 z-[5] touch-none",
      style: {
        cursor: runtime2.COMMENT_MODE_CURSOR
      },
      onPointerMove: (input) => {
        if (ref2.current = {
          x: input.clientX,
          y: input.clientY
        }, value20.drawing())
          return;
        let current = containerRef.current, value27 = callback9(input.clientX, input.clientY);
        callback(value27 && current ? (0, runtime2.getCommentElementRect)(value27.el, current.getBoundingClientRect()) : null);
      },
      onPointerLeave: () => {
        ref2.current = null, callback(null);
      },
      children: [
        value21 ? SlideCommentLayerJsx.jsx(runtime2.CommentAreaSelectionOutline, {
          rect: value21,
          origin: value21.ox != null && value21.oy != null ? {
            x: value21.ox,
            y: value21.oy
          } : null,
          handle: !!drawn && !marquee && !value7,
          kind: marquee ? "marquee" : value7 ? "thread" : "drawn"
        }) : null,
        value && !marquee ? SlideCommentLayerJsx.jsx(runtime2.CommentTargetHighlight, {
          rect: value
        }) : null,
        SlideCommentLayerJsx.jsx("div", {
          ref: ref9,
          "data-slides-comment-target": "slide",
          "aria-label": (0, runtime2.formatCommentTargetLabel)((0, runtime2.formatFrameCommentLabel)(value22, slide, {
            kind: "slide"
          }, typeStyles)),
          "aria-describedby": value17,
          "aria-disabled": value3 && !value24 ? !0 : void 0,
          style: value24 ?? {
            left: 0,
            top: 0,
            width: "100%",
            height: "100%"
          },
          ...callback29("slide")
        }),
        value9.map((input) => SlideCommentLayerJsx.jsx("div", {
          "data-slides-comment-target": "element",
          "data-key": input.key,
          "aria-label": (0, runtime2.formatCommentTargetLabel)((0, runtime2.formatFrameCommentLabel)(value22, slide, {
            kind: "frame",
            frameId: input.ref.frameId,
            path: input.ref.path
          }, typeStyles)),
          "aria-describedby": value18,
          style: input.rect,
          ...callback29({
            key: input.key
          })
        }, input.key)),
        SlideCommentLayerJsx.jsx("span", {
          id: value17,
          hidden: !0,
          children: value3 && !value24 ? runtime2.SCROLLED_OUT_COMMENT_TARGET_MESSAGE : (0, runtime2.commentKeyboardInstructions)("slide", value9.length > 0)
        }),
        SlideCommentLayerJsx.jsx("span", {
          id: value18,
          hidden: !0,
          children: (0, runtime2.commentKeyboardInstructions)("element")
        }),
        value25 && !marquee ? SlideCommentLayerJsx.jsx(runtime2.CommentKeyHighlight, {
          rect: value25
        }) : null,
        value26 && !marquee ? SlideCommentLayerJsx.jsx(runtime2.CommentKeyPin, {
          at: value26
        }) : null
      ]
    });
  }
  return bindRuntimeValue(runtime2, "SlideCommentLayerJsx", () => SlideCommentLayerJsx, (value) => {
    SlideCommentLayerJsx = value;
  }), bindRuntimeValue(runtime2, "useSlideCommentController", () => useSlideCommentController), bindRuntimeValue(runtime2, "COMMENT_AREA_TAP_TIMEOUT_MS", () => COMMENT_AREA_TAP_TIMEOUT_MS, (value) => {
    COMMENT_AREA_TAP_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "COMMENT_POINTER_MOVE_THRESHOLD_PX", () => COMMENT_POINTER_MOVE_THRESHOLD_PX, (value) => {
    COMMENT_POINTER_MOVE_THRESHOLD_PX = value;
  }), bindRuntimeValue(runtime2, "COMMENT_TOUCH_MOVE_THRESHOLD_PX", () => COMMENT_TOUCH_MOVE_THRESHOLD_PX, (value) => {
    COMMENT_TOUCH_MOVE_THRESHOLD_PX = value;
  }), bindRuntimeValue(runtime2, "COMMENT_AREA_MIN_SIZE_PX", () => COMMENT_AREA_MIN_SIZE_PX, (value) => {
    COMMENT_AREA_MIN_SIZE_PX = value;
  }), bindRuntimeValue(runtime2, "SLIDE_COMMENT_UNIT_RECT", () => SLIDE_COMMENT_UNIT_RECT, (value) => {
    SLIDE_COMMENT_UNIT_RECT = value;
  }), bindRuntimeValue(runtime2, "clampSlideCommentFraction", () => clampSlideCommentFraction, (value) => {
    clampSlideCommentFraction = value;
  }), bindRuntimeValue(runtime2, "slideCommentTargetsEqual", () => slideCommentTargetsEqual, (value) => {
    slideCommentTargetsEqual = value;
  }), bindRuntimeValue(runtime2, "slideCommentTargetsSameElement", () => slideCommentTargetsSameElement, (value) => {
    slideCommentTargetsSameElement = value;
  }), bindRuntimeValue(runtime2, "SlideCommentLayer", () => SlideCommentLayer), () => {
    SlideCommentLayerJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), COMMENT_AREA_TAP_TIMEOUT_MS = 1500, COMMENT_POINTER_MOVE_THRESHOLD_PX = 4, COMMENT_TOUCH_MOVE_THRESHOLD_PX = 5, COMMENT_AREA_MIN_SIZE_PX = 16, SLIDE_COMMENT_UNIT_RECT = {
      x: 0,
      y: 0,
      w: 1,
      h: 1
    }, clampSlideCommentFraction = (fraction) => Math.min(1, Math.max(0, fraction)), slideCommentTargetsEqual = (left, right) => left === right || left !== null && right !== null && left !== "slide" && right !== "slide" && left.key === right.key, slideCommentTargetsSameElement = (left, right) => left === right || left.length === right.length && left.every((input, options) => input.key === right[options].key && (0, runtime2.parseCommentCell)(input.rect, right[options].rect));
  };
}
export {
  installCommentsSlideLayer
};
