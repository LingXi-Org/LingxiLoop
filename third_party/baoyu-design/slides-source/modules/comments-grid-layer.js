// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsGridLayer(runtime2) {
  var ReactGridComments, GridCommentsJsx, GRID_COMMENT_TAP_TIMEOUT_MS, GRID_COMMENT_POINTER_THRESHOLD_PX, GRID_COMMENT_TOUCH_THRESHOLD_PX, GRID_COMMENT_AREA_MIN_SIZE_PX, GRID_COMMENT_UNIT_RECT, clampGridCommentFraction, gridCommentPinsEqual;
  function SlideGridCommentLayer({ ctl, on: on2, threads, composing, moveRef, onRef, reportedRef, slides, typeStyles, containerRef, currentId, keepsMode, topInset = 0, showSlide, settling, reveal, onRevealed }) {
    let value = ctl !== null && on2, memo4 = ReactGridComments.useMemo(() => {
      let entries = new Map(slides.map((input, options) => [
        input.id,
        {
          slide: input,
          n: options + 1
        }
      ])), entries2 = new Map(slides.map((input) => [
        (0, runtime2.hashScopedSlideId)(input.id),
        input
      ])), entries3 = new Map(slides.map((input, options) => [
        input.id,
        (0, runtime2.formatCommentTargetLabel)((0, runtime2.formatFrameCommentLabel)(options + 1, input, {
          kind: "slide"
        }, typeStyles))
      ]));
      return {
        byId: entries,
        byHash: entries2,
        names: entries3
      };
    }, [slides, typeStyles]), ref = ReactGridComments.useRef({
      slides,
      deck: memo4,
      typeStyles,
      currentId,
      topInset,
      showSlide,
      settling,
      live: value,
      reveal,
      onRevealed
    });
    ref.current = {
      slides,
      deck: memo4,
      typeStyles,
      currentId,
      topInset,
      showSlide,
      settling,
      live: value,
      reveal,
      onRevealed
    };
    let [value2, value3] = ReactGridComments.useState(null), callback = (input) => value3((input2) => (0, runtime2.parseCommentCell)(input2, input) ? input2 : input), [value4, value5] = ReactGridComments.useState(null), callback2 = (input) => value5((input2) => (0, runtime2.parseCommentCell)(input2, input) ? input2 : input), [value6, value7] = ReactGridComments.useState(null), callback3 = (input) => value7((input2) => (0, runtime2.parseCommentCell)(input2, input) ? input2 : input), [value8, value9] = ReactGridComments.useState([]), ref2 = ReactGridComments.useRef(value8);
    ref2.current = value8;
    let ref3 = ReactGridComments.useRef(null), ref4 = ReactGridComments.useRef(null), ref5 = ReactGridComments.useRef(""), ref6 = ReactGridComments.useRef(null), ref7 = ReactGridComments.useRef(null), memo22 = ReactGridComments.useMemo(() => threads.flatMap((input) => {
      let value26 = (0, runtime2.parseSlideCommentAnchor)(input.anchor);
      if (!value26)
        return [];
      let value27 = memo4.byHash.get(value26.slideHash) ?? null, value28 = value27 !== null && value26.kind !== "slide" && value26.frameHash !== null && (0, runtime2.resolvePromotedCommentFrame)(value26, value27) === null;
      return [
        {
          id: input.id,
          active: input.active,
          a: value26,
          slide: value28 ? null : value27
        }
      ];
    }), [threads, memo4]), ref8 = ReactGridComments.useRef(memo22);
    ref8.current = memo22;
    let ref9 = ReactGridComments.useRef(/* @__PURE__ */ new Map()), ref10 = ReactGridComments.useRef(/* @__PURE__ */ new Map());
    ReactGridComments.useEffect(() => {
      ref9.current.clear(), ref10.current.clear(), ref5.current = "";
    }, [slides, memo22]);
    let callback4 = (input) => {
      let entry = ref9.current.get(input);
      if (entry?.isConnected)
        return entry;
      let value26 = containerRef.current?.querySelector('[data-grid-tile="' + CSS.escape(input) + '"] [data-grid-surface]') ?? null;
      return value26 ? ref9.current.set(input, value26) : ref9.current.delete(input), value26;
    }, callback5 = (input, options, context) => {
      let value26 = context !== void 0 ? ref10.current.get(context) : void 0;
      if (value26 === null || value26?.isConnected)
        return value26;
      let value27 = callback4(options.id);
      if (!value27)
        return null;
      let value28 = (0, runtime2.resolveCommentAnchorElement)(input, options, value27, value27);
      return context !== void 0 && ref10.current.set(context, value28), value28;
    }, callback6 = (input, options) => {
      for (let value26 of ref.current.slides) {
        let value27 = callback4(value26.id), value28 = value27?.getBoundingClientRect();
        if (value27 && value28 && input >= value28.left && input <= value28.right && options >= value28.top && options <= value28.bottom)
          return {
            slide: value26,
            surface: value27
          };
      }
      return null;
    }, callback7 = (input, options) => {
      let current = containerRef.current;
      if (!current)
        return null;
      for (let value26 of document.elementsFromPoint(input, options)) {
        if (value26.closest("[data-slides-comments]"))
          continue;
        if (!current.contains(value26))
          return null;
        let ancestor = value26.closest("[data-grid-surface]"), value27 = value26.closest("[data-grid-tile]")?.getAttribute("data-grid-tile") ?? null;
        if (value27 === null)
          return null;
        if (ancestor)
          return ref.current.deck.byId.has(value27) ? (0, runtime2.hitTestFrameCommentAnchor)(value27, ancestor, value26, input, options) ?? (0, runtime2.hitTestSlideCommentAnchor)(value27, ancestor, input, options) : null;
      }
      return null;
    };
    ReactGridComments.useEffect(() => {
      if (!ctl || !on2)
        return;
      let index4 = 0, text = "", flag = !0, callback24 = () => {
        if (index4 = requestAnimationFrame(callback24), !(onRef?.current ?? ref.current.live))
          return;
        let current = containerRef.current;
        if (!current)
          return;
        let bounds = current.getBoundingClientRect(), state = {};
        for (let { id: value36, a: value37, slide: value38 } of ref8.current) {
          let value39 = value38 ? callback5(value37, value38, value36) : null, value40 = value39 ? (0, runtime2.commentAnchorPoint)(value39, value37) : null;
          if (!value40)
            continue;
          let { x: value41, y: value42 } = value40;
          value41 < bounds.left ? value41 -= window.innerWidth : value41 > bounds.right && (value41 += window.innerWidth), value42 < bounds.top + ref.current.topInset ? value42 -= window.innerHeight : value42 > bounds.bottom && (value42 += window.innerHeight), state[value36] = {
            x: Math.round(value41 + window.scrollX),
            y: Math.round(value42 + window.scrollY)
          };
        }
        let value26 = JSON.stringify(state);
        value26 !== ref5.current && (ref5.current = value26, reportedRef && (reportedRef.current = value26 !== "{}"), ctl.placed(state)), callback8();
        let value27 = (ref15.current ? ref7.current : null) ?? ref13.current?.id ?? null, value28 = value27 !== null ? callback4(value27) : null;
        callback2(value28 ? (0, runtime2.getCommentElementRect)(value28, bounds) : null);
        let value29 = ctl.areas ? ref8.current.find((input) => input.active) : void 0, value30 = value29 && value29.slide && value29.a.kind === "area" ? callback5(value29.a, value29.slide, value29.id) : null;
        callback3(value29 && value29.a.kind === "area" && value30 ? (0, runtime2.commentAnchorAreaRect)(value30, value29.a, bounds) : null);
        let current2 = ref3.current;
        if (current2 && !value11.drawing()) {
          let value36 = callback7(current2.x, current2.y);
          callback(value36 ? (0, runtime2.getCommentElementRect)(value36.el, bounds) : null);
        }
        let slides2 = ref.current.slides, value31 = slides2[0] ? callback4(slides2[0].id)?.getBoundingClientRect() : void 0, value32 = slides2.length > 1 ? callback4(slides2[slides2.length - 1].id)?.getBoundingClientRect() : void 0, value33 = [
          value31?.left,
          value31?.top,
          value31?.width,
          value32?.left,
          value32?.top,
          bounds.width,
          bounds.height
        ].join(",");
        value33 !== text ? flag = !0 : flag && (flag = !1, ref23.current(bounds)), text = value33;
        let current3 = ref18.current, value34 = current3 !== null ? ref2.current.find((input) => input.id === current3) : void 0, value35 = value34 ? callback20(value34.id, bounds) : null;
        value34 && value35 && (value35.parked !== value34.parked || !(0, runtime2.parseCommentCell)(value35.rect, value34.rect)) && value9((input) => input.map((input2) => input2.id === value34.id ? {
          id: input2.id,
          ...value35
        } : input2)), value34 && value35 && !value35.parked && value19(value34.id), ref27.current !== null && !ref.current.settling() && (ref27.current === ref18.current && ref.current.showSlide(ref27.current), ref27.current = null);
        let current4 = ref28.current;
        current4 !== null && (Date.now() > current4.until || ref26.current(current4.id)) && (ref28.current = null), ref25.current && ref2.current.length > 0 && !ref.current.settling() && (ref25.current = !1, callback19() && callback18());
      };
      return callback24(), () => {
        cancelAnimationFrame(index4), ref5.current = "", ref3.current = null, callback(null), callback2(null), callback3(null), value9([]), (onRef?.current ?? ref.current.live) && (reportedRef && (reportedRef.current = !1), ctl.placed({}));
      };
    }, [ctl, on2]);
    let ref11 = ReactGridComments.useRef(null), callback8 = () => {
      let value26 = ref.current.reveal ?? null;
      if (value26 === null || value26 === ref11.current) {
        value26 === null && (ref11.current = null);
        return;
      }
      let value27 = ref.current.deck.byHash.get(value26.slideHash) ?? null, value28 = value27 ? callback4(value27.id) : null;
      if (!(value27 && !value28)) {
        if (value27 && value28) {
          let value29 = callback5(value26, value27), bounds = value28.getBoundingClientRect();
          if (!ref.current.showSlide(value27.id, (value29 ? (0, runtime2.commentAnchorPoint)(value29, value26) : null) ?? {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2
          }))
            return;
        }
        ref11.current = value26, ref.current.onRevealed?.();
      }
    };
    ReactGridComments.useEffect(() => {
      if (!ctl || !value || typeof ctl.exitMode != "function")
        return;
      let callback24 = (event) => {
        if (event.button !== 0)
          return;
        let value26 = event.target instanceof Element ? event.target : null;
        !value26 || (0, runtime2.deferCommentFootPress)(value26, () => ctl.exitMode?.()) || containerRef.current?.contains(value26) || keepsMode?.(value26) || ctl.exitMode?.();
      };
      return document.addEventListener("pointerdown", callback24, !0), () => document.removeEventListener("pointerdown", callback24, !0);
    }, [ctl, value, keepsMode]);
    let callback9 = (input, options) => {
      let value26 = callback7(input, options), value27 = value26 ? ref.current.deck.byId.get(value26.anchor.slideId) : void 0;
      return value26 && value27 ? (0, runtime2.createCommentAnchorDescription)(value26, value27.n, value27.slide, ref.current.typeStyles) : null;
    }, ref12 = ReactGridComments.useRef((0, runtime2.createCommentOperationToken)()), value10 = (0, runtime2.useCommentMoveKeyHighlight)(composing, "canvas"), { drawn } = value10, ref13 = ReactGridComments.useRef(drawn);
    ref13.current = drawn;
    let callback10 = (input, options) => {
      if (ref12.current.cancel(), !ctl)
        return;
      let value26 = callback9(input, options);
      value26 && ctl.compose(value26.anchor, {
        x: input + window.scrollX,
        y: options + window.scrollY
      }, {
        label: value26.label,
        ...value26.detail ? {
          detail: value26.detail
        } : {}
      }).then((input2) => {
        input2.opened && value10.clear();
      }, () => {
      });
    }, ref14 = ReactGridComments.useRef(callback10);
    ref14.current = callback10;
    let callback11 = () => ref7.current !== null ? callback4(ref7.current)?.getBoundingClientRect() ?? null : null, value11 = (0, runtime2.useCommentAreaDrag)({
      toLocal: (input, options) => {
        let value26 = callback11();
        return value26 ? {
          x: (input - value26.left) / (value26.width || 1),
          y: (options - value26.top) / (value26.height || 1)
        } : null;
      },
      toClient: (input) => {
        let value26 = callback11();
        return value26 ? {
          x: value26.left + input.x * value26.width,
          y: value26.top + input.y * value26.height
        } : null;
      },
      stage: () => containerRef.current,
      slopPx: GRID_COMMENT_TOUCH_THRESHOLD_PX,
      onClick: (input) => ref14.current(input.clientX, input.clientY),
      onNothing: () => {
        ref7.current = null, value10.restore();
      },
      onLive: () => {
        value10.show(null);
        let value26 = ref7.current !== null ? callback4(ref7.current) : null, value27 = containerRef.current?.getBoundingClientRect();
        value26 && value27 && callback2((0, runtime2.getCommentElementRect)(value26, value27));
      },
      onArea: ({ c0, c1, at, resizing }) => {
        let current = ref7.current;
        ref7.current = null;
        let [value26] = (0, runtime2.rankCommentAreaHosts)({
          x: Math.min(c0.x, c1.x),
          y: Math.min(c0.y, c1.y),
          w: Math.abs(c1.x - c0.x),
          h: Math.abs(c1.y - c0.y)
        }, [
          {
            board: GRID_COMMENT_UNIT_RECT,
            frame: GRID_COMMENT_UNIT_RECT
          }
        ]);
        if (!value26 || current === null)
          return value10.restore();
        let value27 = resizing ? c1 : c0, state = {
          ...value26.inter,
          id: current,
          ox: clampGridCommentFraction(value27.x),
          oy: clampGridCommentFraction(value27.y)
        };
        value10.show(state), ref16.current(state, {
          x: at.x + window.scrollX,
          y: at.y + window.scrollY
        }, (0, runtime2.nearestCommentBoxCorner)(value26.inter, resizing ? c0 : c1), ref12.current.begin());
      }
    }), ref15 = ReactGridComments.useRef(!1);
    ref15.current = value11.marquee !== null, ReactGridComments.useEffect(() => {
      value11.cancel(), value10.clear(), ref12.current.cancel(), ref7.current = null;
    }, [ctl, value]), ReactGridComments.useEffect(() => {
      threads.some((input) => input.active) && value10.show(null);
    }, [threads]);
    let callback12 = (input, options, context) => {
      let entry = ref.current.deck.byId.get(input), value26 = callback4(input);
      return !entry || !value26 ? null : (0, runtime2.describeSlideCommentArea)(options, context, (0, runtime2.collectSlideCommentAreaTargets)(entry.slide, value26, value26, "[data-slides-comments]").els, entry.n, entry.slide, ref.current.typeStyles);
    }, callback13 = (input, options, context, value26) => {
      let value27 = ctl;
      if (!value27 || !value)
        return;
      let callback24 = () => {
        value26.live && value10.restore();
      }, value28 = callback12(input.id, input, context);
      if (!value28 || !ref.current.live || !value26.live)
        return callback24();
      value27.compose(value28.anchor, options, {
        label: value28.label,
        ...value28.detail ? {
          detail: value28.detail
        } : {},
        area: !0
      }).then((input2) => {
        if (!input2.opened)
          return callback24();
        value26.live && value10.hold(input, "canvas");
      }, callback24);
    }, ref16 = ReactGridComments.useRef(callback13);
    ref16.current = callback13;
    let callback14 = async (input, options) => {
      if (!ctl || !ref.current.live)
        return null;
      let value26 = ref8.current.find((input2) => input2.id === input);
      if (!value26)
        return null;
      let state = {
        x: options.x - window.scrollX,
        y: options.y - window.scrollY
      }, value27 = callback7(state.x, state.y), value28 = value27 ? callback6(state.x, state.y) : null;
      if (!value27 || !value28 || value28.slide.id !== value27.anchor.slideId)
        return null;
      let value29 = ref.current.deck.byId.get(value28.slide.id)?.n ?? 0, value30;
      if (value26.a.kind === "area") {
        let value35 = value26.slide ? callback4(value26.slide.id)?.getBoundingClientRect() : null, value36 = value26.slide ? callback5(value26.a, value26.slide, input) : null, value37 = value36 && value35 ? (0, runtime2.commentAnchorAreaRect)(value36, value26.a, value35) : null, bounds = value28.surface.getBoundingClientRect();
        if (!value37 || !value35)
          return null;
        let state2 = {
          x: value37.left / (value35.width || 1),
          y: value37.top / (value35.height || 1),
          w: value37.width / (value35.width || 1),
          h: value37.height / (value35.height || 1)
        }, value38 = (0, runtime2.commentBoxCornerPoint)(state2, value26.a.box.corner), state3 = {
          x: (state.x - bounds.left) / (bounds.width || 1),
          y: (state.y - bounds.top) / (bounds.height || 1)
        }, value39 = state2.w / ((value26.a.box.x1 - value26.a.box.x0) * 1e3), value40 = state2.h / ((value26.a.box.y1 - value26.a.box.y0) * 1e3), value41 = Math.round((state3.x - value38.x) / value39) * value39, value42 = Math.round((state3.y - value38.y) / value40) * value40, [value43] = (0, runtime2.rankCommentAreaHosts)({
          x: state2.x + value41,
          y: state2.y + value42,
          w: state2.w,
          h: state2.h
        }, [
          {
            board: GRID_COMMENT_UNIT_RECT,
            frame: GRID_COMMENT_UNIT_RECT
          }
        ]);
        value30 = value43 ? callback12(value28.slide.id, value43.inter, value26.a.box.corner) : null;
      } else
        value30 = (0, runtime2.createCommentAnchorDescription)(value27, value29, value28.slide, ref.current.typeStyles);
      if (!value30 || !ref.current.live)
        return null;
      let value31 = (0, runtime2.parseSlideCommentAnchor)(value30.anchor), value32 = value31 ? callback5(value31, value28.slide) : null, value33 = value31 && value32 ? (0, runtime2.commentAnchorPoint)(value32, value31) : null, value34 = value33 ? {
        x: Math.round(value33.x + window.scrollX),
        y: Math.round(value33.y + window.scrollY)
      } : options;
      return {
        anchor: value30.anchor,
        at: value34,
        label: value30.label,
        ...value30.detail ? {
          detail: value30.detail
        } : {},
        ...value30.area ? {
          area: !0
        } : {}
      };
    }, ref17 = ReactGridComments.useRef(callback14);
    ref17.current = callback14, ReactGridComments.useEffect(() => {
      if (!moveRef || !value)
        return;
      let callback24 = (input, options) => ref17.current(input, options);
      return moveRef.current = callback24, () => {
        moveRef.current === callback24 && (moveRef.current = null);
      };
    }, [moveRef, value]);
    let [value12, value13] = ReactGridComments.useState(null), ref18 = ReactGridComments.useRef(null);
    ref18.current = value12;
    let ref19 = ReactGridComments.useRef(null), [value14, value15] = ReactGridComments.useState(!0), ref20 = ReactGridComments.useRef(!0), ref21 = ReactGridComments.useRef(null), callback15 = (input) => {
      ref20.current !== input && (ref20.current = input, input && (ref21.current = null), value15(input));
    }, [value16, value17] = ReactGridComments.useState(!1), [value18, value19] = ReactGridComments.useState(null), ref22 = ReactGridComments.useRef(!1), callback16 = (input) => input === null ? null : ref6.current?.querySelector('[data-slides-comment-target][data-key="' + CSS.escape(input) + '"]') ?? null, callback17 = (input) => {
      input && (ref22.current = !0, input.focus({
        preventScroll: !0
      }), ref22.current = !1);
    }, callback18 = () => {
      let current = ref2.current, value26 = current.find((input) => input.id === ref.current.currentId && !input.parked) ?? current.find((input) => !input.parked) ?? current.find((input) => input.id === ref.current.currentId) ?? current[0];
      callback17(callback16(value26?.id ?? null)), value17(typeof window.matchMedia == "function" && window.matchMedia("(hover: none)").matches);
    }, callback19 = () => {
      let activeElement2 = document.activeElement;
      return document.hasFocus() && (activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement || activeElement2 === containerRef.current || ref6.current?.contains(activeElement2) === !0);
    }, callback20 = (input, options) => {
      let value26 = callback4(input)?.getBoundingClientRect();
      if (!value26)
        return null;
      let state = {
        left: value26.left - options.left,
        top: value26.top - options.top,
        width: value26.width,
        height: value26.height
      }, value27 = (0, runtime2.collectCommentableNodeElements)(state, options.width, options.height, ref.current.topInset);
      return value27 ? {
        rect: value27,
        parked: !1
      } : {
        rect: {
          left: Math.min(Math.max(state.left, 0), options.width - 1),
          top: Math.min(Math.max(state.top, ref.current.topInset), options.height - 1),
          width: 1,
          height: 1
        },
        parked: !0
      };
    }, callback21 = (input) => {
      let value26 = ref.current.slides.flatMap((input2) => {
        let value27 = callback20(input2.id, input);
        return value27 ? [
          {
            id: input2.id,
            ...value27
          }
        ] : [];
      });
      gridCommentPinsEqual(ref2.current, value26) || value9(value26);
    }, ref23 = ReactGridComments.useRef(callback21);
    ref23.current = callback21, ReactGridComments.useEffect(() => {
      let value26 = containerRef.current?.getBoundingClientRect();
      value && value26 && callback21(value26);
    }, [value, slides, topInset]);
    let ref24 = ReactGridComments.useRef(!1), ref25 = ReactGridComments.useRef(!1);
    ReactGridComments.useEffect(() => {
      ref25.current = value && !ref24.current && (0, runtime2.elapsedSinceCommentComposition)() >= GRID_COMMENT_TAP_TIMEOUT_MS && callback19(), ref24.current = value;
    }, [value]), ReactGridComments.useLayoutEffect(() => () => {
      ref6.current?.contains(document.activeElement) && containerRef.current?.focus({
        preventScroll: !0
      });
    }, []), ReactGridComments.useEffect(() => {
      if (!value)
        return;
      let callback24 = (input) => {
        let current = ref21.current;
        current === null ? ref21.current = {
          x: input.clientX,
          y: input.clientY
        } : Math.abs(input.clientX - current.x) + Math.abs(input.clientY - current.y) > GRID_COMMENT_POINTER_THRESHOLD_PX && callback15(!1);
      }, callback25 = (input) => {
        (0, runtime2.isCommentKeyboardTarget)(input) || (callback15(!1), ref19.current = null);
      }, value26, callback26 = () => {
        let activeElement2 = document.activeElement;
        ref19.current === null || !document.hasFocus() || !(activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement) || callback17(callback16(ref19.current) ?? ref6.current?.querySelector("[data-slides-comment-target]") ?? null);
      }, callback27 = () => {
        clearTimeout(value26), value26 = setTimeout(callback26, 0);
      };
      return document.addEventListener("pointermove", callback24, {
        capture: !0,
        passive: !0
      }), document.addEventListener("pointerdown", callback25, !0), window.addEventListener("focus", callback27), () => {
        clearTimeout(value26), document.removeEventListener("pointermove", callback24, !0), document.removeEventListener("pointerdown", callback25, !0), window.removeEventListener("focus", callback27);
      };
    }, [value]), ReactGridComments.useEffect(() => {
      let value26 = ref18.current ?? ref19.current;
      value26 === null || value8.some((input) => input.id === value26) || (callback19() ? callback18() : value13(null));
    }, [value8]);
    let callback22 = (input) => {
      if (ref.current.settling())
        return !1;
      let entry = ref.current.deck.byId.get(input), value26 = callback4(input)?.getBoundingClientRect(), value27 = containerRef.current?.getBoundingClientRect();
      if (!ctl || !entry || !value26 || !value27)
        return !1;
      let value28 = (0, runtime2.collectCommentableNodeElements)({
        left: value26.left - value27.left,
        top: value26.top - value27.top,
        width: value26.width,
        height: value26.height
      }, value27.width, value27.height, ref.current.topInset);
      if (!value28)
        return !1;
      ref12.current.cancel();
      let value29 = (0, runtime2.defaultCommentPoint)({
        left: value27.left + value28.left,
        top: value27.top + value28.top,
        width: value28.width,
        height: value28.height
      }), value30 = (0, runtime2.encodeSlideCommentAnchor)({
        kind: "slide",
        slideId: input,
        fx: clampGridCommentFraction((value29.x - value26.left) / (value26.width || 1)),
        fy: clampGridCommentFraction((value29.y - value26.top) / (value26.height || 1))
      });
      return value30 === null || ctl.compose(value30, {
        x: value29.x + window.scrollX,
        y: value29.y + window.scrollY
      }, (0, runtime2.describeFrameCommentAnchor)(entry.n, entry.slide, {
        kind: "slide"
      }, ref.current.typeStyles)).then((input2) => {
        input2.opened && value10.clear();
      }, () => {
      }), !0;
    }, ref26 = ReactGridComments.useRef(callback22);
    ref26.current = callback22;
    let ref27 = ReactGridComments.useRef(null), ref28 = ReactGridComments.useRef(null), callback23 = (input, options, context) => {
      if (!ctl?.areas || input.button !== 0 || input.pointerType !== "mouse")
        return !1;
      let value26 = context ? ref13.current?.id ?? null : callback6(input.clientX, input.clientY)?.slide.id ?? null;
      return value26 === null ? !1 : (ref7.current = value26, callback(null), value11.start(input, options, context) ? !0 : (ref7.current = null, !1));
    }, ref29 = ReactGridComments.useRef(callback23);
    ref29.current = callback23, ReactGridComments.useEffect(() => {
      let current = ref6.current;
      if (!current)
        return;
      let values = /* @__PURE__ */ new Set(), callback24 = (event) => {
        if (event.button !== 0)
          return;
        if (event.pointerType === "mouse" && event.stopPropagation(), (0, runtime2.isCommentKeyboardTarget)(event)) {
          ref4.current = null;
          return;
        }
        if (event.pointerType === "touch" && values.add(event.pointerId), values.size > 1 || ref.current.settling()) {
          ref4.current = null;
          return;
        }
        let value26 = event.target instanceof Element && event.target.closest("[data-area-handle]") ? ref13.current : null, value27 = value26 ? {
          x: value26.ox <= value26.x + value26.w / 2 ? value26.x + value26.w : value26.x,
          y: value26.oy <= value26.y + value26.h / 2 ? value26.y + value26.h : value26.y
        } : void 0;
        ref29.current(event, current, value27) || (ref4.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          touch: event.pointerType === "touch"
        });
      }, callback25 = (input) => {
        values.delete(input.pointerId);
        let current2 = ref4.current;
        !current2 || current2.id !== input.pointerId || (ref4.current = null, !(Math.hypot(input.clientX - current2.x, input.clientY - current2.y) > (current2.touch ? GRID_COMMENT_AREA_MIN_SIZE_PX : GRID_COMMENT_TOUCH_THRESHOLD_PX)) && ref14.current(input.clientX, input.clientY));
      }, callback26 = (input) => {
        values.delete(input.pointerId), ref4.current?.id === input.pointerId && (ref4.current = null);
      };
      return current.addEventListener("pointerdown", callback24), window.addEventListener("pointerup", callback25, !0), window.addEventListener("pointercancel", callback26, !0), () => {
        current.removeEventListener("pointerdown", callback24), window.removeEventListener("pointerup", callback25, !0), window.removeEventListener("pointercancel", callback26, !0);
      };
    }, [value]);
    let value20 = ReactGridComments.useId(), value21 = ReactGridComments.useId(), value22 = ReactGridComments.useId();
    if (!value)
      return null;
    let { marquee } = value11, value23 = (() => {
      if (value6 && !marquee)
        return value6;
      if (!value4)
        return null;
      let callback24 = (input) => value4.left + input * value4.width, callback25 = (input) => value4.top + input * value4.height;
      if (marquee) {
        let value26 = callback24(marquee.pin.x), value27 = callback25(marquee.pin.y), { x1: value28, y1: value29 } = marquee;
        return {
          left: Math.min(value26, value28),
          top: Math.min(value27, value29),
          width: Math.abs(value28 - value26),
          height: Math.abs(value29 - value27),
          ox: marquee.resizing ? value28 : value26,
          oy: marquee.resizing ? value29 : value27
        };
      }
      return drawn ? {
        left: callback24(drawn.x),
        top: callback25(drawn.y),
        width: drawn.w * value4.width,
        height: drawn.h * value4.height,
        ox: callback24(drawn.ox),
        oy: callback25(drawn.oy)
      } : null;
    })(), value24 = value12 === null || value16 ? void 0 : value8.find((input) => input.id === value12), value25 = value24 && value14 && !value24.parked ? (0, runtime2.defaultCommentPoint)(value24.rect) : null;
    return GridCommentsJsx.jsxs("div", {
      ref: ref6,
      "data-slides-comments": "",
      className: "absolute inset-0 z-[45] touch-none",
      style: {
        cursor: runtime2.COMMENT_MODE_CURSOR
      },
      onPointerMove: (input) => {
        if (ref3.current = {
          x: input.clientX,
          y: input.clientY
        }, value11.drawing())
          return;
        let current = containerRef.current, value26 = callback7(input.clientX, input.clientY);
        callback(value26 && current ? (0, runtime2.getCommentElementRect)(value26.el, current.getBoundingClientRect()) : null);
      },
      onPointerLeave: () => {
        ref3.current = null, callback(null);
      },
      children: [
        value23 ? GridCommentsJsx.jsx(runtime2.CommentAreaSelectionOutline, {
          rect: value23,
          origin: value23.ox != null && value23.oy != null ? {
            x: value23.ox,
            y: value23.oy
          } : null,
          handle: !!drawn && !marquee && !value6,
          kind: marquee ? "marquee" : value6 ? "thread" : "drawn"
        }) : null,
        value2 && !marquee ? GridCommentsJsx.jsx(runtime2.CommentTargetHighlight, {
          rect: value2
        }) : null,
        value8.map((input, options) => {
          let value26 = input.parked && value12 === input.id && value18 === input.id;
          return GridCommentsJsx.jsx("div", {
            "data-slides-comment-target": "slide",
            "data-key": input.id,
            "data-parked": input.parked ? "" : void 0,
            role: "button",
            tabIndex: 0,
            "aria-label": memo4.names.get(input.id),
            "aria-describedby": value26 ? value22 : options < value8.length - 1 ? value20 : value21,
            "aria-disabled": value26 ? !0 : void 0,
            className: "pointer-events-none absolute focus-visible:outline-hidden",
            style: input.rect,
            onKeyDown: (event) => {
              let current = ref20.current;
              callback15(!0), value17(!1), !(event.target !== event.currentTarget || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) && (event.key !== "Enter" && event.key !== " " || (event.preventDefault(), current && !event.repeat && callback22(input.id)));
            },
            onClick: (event) => {
              event.target === event.currentTarget && (event.currentTarget.focus({
                preventScroll: !0
              }), callback22(input.id) || (ref28.current = {
                id: input.id,
                until: Date.now() + 1e3
              }));
            },
            onFocus: () => {
              let value27 = !ref22.current && ref19.current !== input.id;
              ref19.current = input.id, callback15(!0), value13(input.id), containerRef.current && (containerRef.current.scrollTop = containerRef.current.scrollLeft = 0), value27 && (value17(!1), value19(null), settling() ? ref27.current = input.id : showSlide(input.id));
            },
            onBlur: (input2) => {
              input2.relatedTarget !== null && ref19.current === input.id && (ref19.current = null), value13((input3) => input3 === input.id ? null : input3);
            }
          }, input.id);
        }),
        GridCommentsJsx.jsx("span", {
          id: value20,
          hidden: !0,
          children: (0, runtime2.commentKeyboardInstructions)("canvas-slide", !0)
        }),
        GridCommentsJsx.jsx("span", {
          id: value21,
          hidden: !0,
          children: (0, runtime2.commentKeyboardInstructions)("canvas-slide")
        }),
        GridCommentsJsx.jsx("span", {
          id: value22,
          hidden: !0,
          children: runtime2.SCROLLED_OUT_COMMENT_TARGET_MESSAGE
        }),
        value24 && !marquee ? GridCommentsJsx.jsx(runtime2.CommentKeyHighlight, {
          rect: value24.rect
        }) : null,
        value25 && !marquee ? GridCommentsJsx.jsx(runtime2.CommentKeyPin, {
          at: value25
        }) : null
      ]
    });
  }
  function GridCommentPinsLayer({ ctl, on: on2, threads, pins, slides, containerRef, topInset = 0, clipRef }) {
    let pinsWanted = ctl !== null && !on2 && threads.length > 0 && pins !== void 0, pinsWantedRef = ReactGridComments.useRef(pinsWanted);
    pinsWantedRef.current = pinsWanted;
    let entries = ReactGridComments.useMemo(() => {
      let byHash = new Map(slides.map((slide) => [
        (0, runtime2.hashScopedSlideId)(slide.id),
        slide
      ]));
      return threads.flatMap((thread) => {
        let anchor = (0, runtime2.parseSlideCommentAnchor)(thread.anchor), slide = anchor ? byHash.get(anchor.slideHash) : void 0;
        return anchor && slide ? [
          {
            id: thread.id,
            a: anchor,
            slide
          }
        ] : [];
      });
    }, [threads, slides]), pinsGone = ReactGridComments.useRef(!1), clipRetries = ReactGridComments.useRef(0), placePins = () => {
      let current = containerRef.current;
      if (pinsGone.current || !current || !pins)
        return;
      if (clipRef && !clipRef.current) {
        clipRetries.current++ < 3 && requestAnimationFrame(() => placePinsRef.current());
        return;
      }
      clipRetries.current = 0;
      let bounds = current.getBoundingClientRect(), clip = clipRef?.current?.getBoundingClientRect(), occluders = (0, runtime2.collectCommentPinOccluders)(), surfaces = /* @__PURE__ */ new Map(), state = {};
      for (let { id, a: anchor, slide } of entries) {
        surfaces.has(slide.id) || surfaces.set(slide.id, current.querySelector('[data-grid-tile="' + CSS.escape(slide.id) + '"] [data-grid-surface]'));
        let surface = surfaces.get(slide.id), element = surface ? (0, runtime2.resolveCommentAnchorElement)(anchor, slide, surface, surface) : null, point = element ? (0, runtime2.commentAnchorPoint)(element, anchor) : null;
        if (!point)
          continue;
        let { x, y } = point;
        clip && (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) || (x < bounds.left ? x -= window.innerWidth : x > bounds.right && (x += window.innerWidth), y < bounds.top + topInset ? y -= window.innerHeight : y > bounds.bottom && (y += window.innerHeight), !(0, runtime2.commentPinOccluded)(x, y, occluders) && (state[id] = {
          x: Math.round(x + window.scrollX),
          y: Math.round(y + window.scrollY)
        }));
      }
      pins.set("grid", state);
    }, placePinsRef = ReactGridComments.useRef(placePins);
    return placePinsRef.current = placePins, ReactGridComments.useLayoutEffect(() => {
      if (pinsWanted)
        return pinsGone.current = !1, () => {
          pinsGone.current = !0, pinsWantedRef.current && pins?.set("grid", null);
        };
    }, [pinsWanted, pins]), ReactGridComments.useLayoutEffect(() => {
      pinsWanted && placePins();
    }), ReactGridComments.useEffect(() => {
      if (!pinsWanted)
        return;
      let frame = 0, schedule = () => {
        frame === 0 && (frame = requestAnimationFrame(() => (frame = 0, placePinsRef.current())));
      }, stopShifts = (0, runtime2.observeCommentLayoutShifts)(containerRef.current, schedule), stopBody = (0, runtime2.observeBodyChildren)(schedule);
      return () => {
        cancelAnimationFrame(frame), stopShifts(), stopBody();
      };
    }, [pinsWanted, containerRef]), null;
  }
  return bindRuntimeValue(runtime2, "ReactGridComments", () => ReactGridComments, (value) => {
    ReactGridComments = value;
  }), bindRuntimeValue(runtime2, "GridCommentsJsx", () => GridCommentsJsx, (value) => {
    GridCommentsJsx = value;
  }), bindRuntimeValue(runtime2, "GRID_COMMENT_TAP_TIMEOUT_MS", () => GRID_COMMENT_TAP_TIMEOUT_MS, (value) => {
    GRID_COMMENT_TAP_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "GRID_COMMENT_POINTER_THRESHOLD_PX", () => GRID_COMMENT_POINTER_THRESHOLD_PX, (value) => {
    GRID_COMMENT_POINTER_THRESHOLD_PX = value;
  }), bindRuntimeValue(runtime2, "GRID_COMMENT_TOUCH_THRESHOLD_PX", () => GRID_COMMENT_TOUCH_THRESHOLD_PX, (value) => {
    GRID_COMMENT_TOUCH_THRESHOLD_PX = value;
  }), bindRuntimeValue(runtime2, "GRID_COMMENT_AREA_MIN_SIZE_PX", () => GRID_COMMENT_AREA_MIN_SIZE_PX, (value) => {
    GRID_COMMENT_AREA_MIN_SIZE_PX = value;
  }), bindRuntimeValue(runtime2, "GRID_COMMENT_UNIT_RECT", () => GRID_COMMENT_UNIT_RECT, (value) => {
    GRID_COMMENT_UNIT_RECT = value;
  }), bindRuntimeValue(runtime2, "clampGridCommentFraction", () => clampGridCommentFraction, (value) => {
    clampGridCommentFraction = value;
  }), bindRuntimeValue(runtime2, "gridCommentPinsEqual", () => gridCommentPinsEqual, (value) => {
    gridCommentPinsEqual = value;
  }), bindRuntimeValue(runtime2, "SlideGridCommentLayer", () => SlideGridCommentLayer), bindRuntimeValue(runtime2, "GridCommentPinsLayer", () => GridCommentPinsLayer), () => {
    ReactGridComments = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), GridCommentsJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), GRID_COMMENT_TAP_TIMEOUT_MS = 1500, GRID_COMMENT_POINTER_THRESHOLD_PX = 4, GRID_COMMENT_TOUCH_THRESHOLD_PX = 5, GRID_COMMENT_AREA_MIN_SIZE_PX = 16, GRID_COMMENT_UNIT_RECT = {
      x: 0,
      y: 0,
      w: 1,
      h: 1
    }, clampGridCommentFraction = (fraction) => Math.min(1, Math.max(0, fraction)), gridCommentPinsEqual = (left, right) => left === right || left.length === right.length && left.every((input, options) => input.id === right[options].id && input.parked === right[options].parked && (0, runtime2.parseCommentCell)(input.rect, right[options].rect));
  };
}
export {
  installCommentsGridLayer
};
