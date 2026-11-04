// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorScaleMode(runtime2) {
  var ScaleFieldReact, ScaleFieldJsx, SCALE_FIELD_CLASS, ScaleModeReact, ScaleModeJsx, SCALE_REFUSAL_MESSAGES, stableSlideJson, handleGripName;
  function ScaleField({
    factor,
    width,
    min: min2,
    max: max2,
    words,
    onPreview,
    onCommit,
    onCancel
  }) {
    let bottomChrome = (0, runtime2.useBottomToolbarChrome)(), inputRef = ScaleFieldReact.useRef(null), hintId = ScaleFieldReact.useId();
    ScaleFieldReact.useEffect(() => {
      let [tries, frame] = [0, 0], doc = inputRef.current?.ownerDocument, previous = doc?.activeElement, focusField = () => {
        let input = inputRef.current;
        input === null || input.ownerDocument.activeElement === input || tries++ > 10 || (input.focus(), frame = requestAnimationFrame(focusField));
      };
      return focusField(), () => {
        cancelAnimationFrame(frame), previous instanceof HTMLElement && doc?.hasFocus() === !0 && previous !== doc.body && previous.isConnected && (doc.activeElement === doc.body || doc.activeElement === inputRef.current) && previous.focus({
          preventScroll: !0
        });
      };
    }, []);
    let [draft, setDraft] = ScaleFieldReact.useState(null), typed = draft !== null && draft.at === factor ? draft.text : null, parsed = typed === null ? factor : (0, runtime2.parseScaleInput)(typed, width), invalid2 = parsed === null || parsed !== (0, runtime2.clampScaleFactor)(parsed, min2, max2);
    return ScaleFieldReact.useEffect(() => {
      typed === null && inputRef.current?.ownerDocument.activeElement === inputRef.current && inputRef.current?.select();
    }, [typed, factor]), ScaleFieldJsx.jsxs("span", {
      className: "flex items-center gap-1",
      "data-scale-mode": "",
      onBlur: (event) => {
        event.relatedTarget !== null && !event.currentTarget.contains(event.relatedTarget) && onCommit();
      },
      onKeyDownCapture: (event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229)
          return;
        let leavesStrip = event.shiftKey ? event.target === inputRef.current : event.target instanceof Element && event.target.closest('[data-testid="scale-cancel"]') !== null;
        (event.key === "F6" || event.key === "Tab" && leavesStrip) && onCommit();
      },
      onKeyDown: (event) => {
        event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || (event.preventDefault(), event.stopPropagation(), onCancel());
      },
      children: [
        ScaleFieldJsx.jsx("span", {
          "aria-hidden": "true",
          className: (0, runtime2.joinClassNames)("inline-flex items-center justify-center text-muted", bottomChrome ? "h-8 w-8" : "h-6 w-6"),
          children: ScaleFieldJsx.jsx(runtime2.KitIcon, {
            name: "Expand",
            size: bottomChrome ? 20 : void 0
          })
        }),
        ScaleFieldJsx.jsx("input", {
          ref: inputRef,
          "data-testid": "scale-field",
          "data-scale-untyped": typed === null ? "" : void 0,
          "aria-label": words.field,
          "aria-describedby": hintId,
          inputMode: "decimal",
          value: typed ?? (0, runtime2.formatScalePercent)(factor),
          "aria-invalid": invalid2 || void 0,
          title: invalid2 ? words.invalid : void 0,
          onFocus: (event) => event.target.select(),
          onPointerDown: (event) => event.stopPropagation(),
          onChange: (event) => {
            let next = (0, runtime2.parseScaleInput)(event.target.value, width), from = typed === null ? factor : draft.from, at = next !== null && next === (0, runtime2.clampScaleFactor)(next, min2, max2) ? next : from;
            setDraft({
              text: event.target.value,
              at,
              from
            }), onPreview(at);
          },
          onKeyDown: (event) => {
            if (event.stopPropagation(), !(event.nativeEvent.isComposing || event.keyCode === 229)) {
              if ((0, runtime2.linkShortcutKind)(event) !== void 0)
                event.preventDefault();
              else if (event.key === "Escape")
                event.preventDefault(), onCancel();
              else if (event.key === "Enter")
                event.preventDefault(), invalid2 ? (0, runtime2.announceLiveMessage)(words.invalid) : onCommit();
              else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                let step = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 0.1 : 0.01), next = (0, runtime2.clampScaleFactor)(Math.round(((invalid2 ? factor : parsed) + step) * 1e3) / 1e3, min2, max2);
                setDraft(null), onPreview(next), (0, runtime2.announceLiveMessage)((0, runtime2.formatScalePercent)(next));
              }
            }
          },
          className: SCALE_FIELD_CLASS
        }),
        ScaleFieldJsx.jsx("span", {
          id: hintId,
          className: "sr-only",
          children: invalid2 ? words.invalid : words.hint
        }),
        ScaleFieldJsx.jsx(runtime2.ToolbarStripButton, {
          icon: "Check",
          "data-testid": "scale-done",
          "aria-label": words.done,
          title: invalid2 ? words.invalid : words.done,
          disabled: invalid2,
          onClick: onCommit
        }),
        ScaleFieldJsx.jsx(runtime2.ToolbarStripButton, {
          icon: "X",
          "data-testid": "scale-cancel",
          "aria-label": words.cancel,
          title: words.cancel,
          onClick: onCancel
        })
      ]
    });
  }
  function useScaleMode(options) {
    let optionsRef = ScaleModeReact.useRef(options);
    optionsRef.current = options;
    let [session, setSessionState] = ScaleModeReact.useState(null), sessionRef = ScaleModeReact.useRef(null), setSession = (next) => {
      sessionRef.current = next, optionsRef.current.setLive(next !== null && next.open), setSessionState(next);
    }, stopDragRef = ScaleModeReact.useRef(null), settleTimerRef = ScaleModeReact.useRef(void 0), ownSlidesRef = ScaleModeReact.useRef(/* @__PURE__ */ new WeakSet()), slideIsOurs = (current) => {
      let slide2 = optionsRef.current.slide();
      return ownSlidesRef.current.has(slide2) || current.wrote !== null && stableSlideJson(slide2) === stableSlideJson(current.wrote);
    }, end = ScaleModeReact.useCallback((keep, clash = !1) => {
      let current = sessionRef.current;
      if (current === null)
        return;
      let { onLiveChange, onGestureEnd, focusSelection } = optionsRef.current;
      stopDragRef.current?.(), clearTimeout(settleTimerRef.current);
      let focusWasInStrip = document.hasFocus() && document.activeElement?.closest("[data-scale-mode]") != null;
      setSession(null);
      let revert = !keep && current.wrote !== null && slideIsOurs(current);
      if (revert && onLiveChange(current.before), (revert || current.open) && onGestureEnd(current.base), focusWasInStrip && focusSelection(), clash)
        return (0, runtime2.announceLiveMessage)((0, runtime2.formatMessage)({
          defaultMessage: "缩放已结束：其他人修改了此页",
          id: "+ivXlmdMvr"
        }));
      (keep ? current.wrote === null || current.k === 1 && current.shift.x === 0 && current.shift.y === 0 : current.wrote !== null && !revert) || (0, runtime2.announceLiveMessage)(keep ? (0, runtime2.formatMessage)({
        defaultMessage: "已缩放到 {percent}",
        id: "W3z3yVKoVS"
      }, {
        percent: (0, runtime2.formatScalePercent)(current.k)
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "已取消缩放",
        id: "t4t+qNd0Ad"
      }));
    }, []), settleLater = ScaleModeReact.useCallback(() => {
      clearTimeout(settleTimerRef.current), !(sessionRef.current === null || !sessionRef.current.open) && (settleTimerRef.current = setTimeout(() => {
        let current = sessionRef.current;
        if (current === null || stopDragRef.current !== null || !slideIsOurs(current))
          return settleLater();
        setSession({
          ...current,
          base: current.wrote ?? current.base,
          open: !1
        }), optionsRef.current.onGestureEnd(current.base);
      }, runtime2.MAX_ACTIVE_SLIDE_PROTECTION_MS));
    }, []), startSession = ScaleModeReact.useCallback(() => {
      let { slide: currentSlide, selection, rect } = optionsRef.current, slide2 = currentSlide(), units = (0, runtime2.scaleUnitsForSelection)(slide2, selection());
      if (units.length === 0)
        return SCALE_REFUSAL_MESSAGES.nothing;
      let context = {
        theme: (0, runtime2.getRenderingTheme)(),
        rect: (0, runtime2.frozenRectLookup)(slide2, units, rect)
      }, box = (0, runtime2.unitsBoundingRect)(units, context);
      if (box === void 0)
        return SCALE_REFUSAL_MESSAGES.later;
      if (!(box.w > 0) || !(box.h > 0))
        return SCALE_REFUSAL_MESSAGES.flat;
      let rotation = units.length === 1 ? (0, runtime2.nodeTransform)((0, runtime2.selectedNode)(slide2, units[0]))?.rotate ?? 0 : 0;
      return ownSlidesRef.current.add(slide2), {
        before: slide2,
        units,
        selKey: (0, runtime2.selectionsKey)(selection()),
        ctx: context,
        box,
        limits: (0, runtime2.scaleLimits)(slide2, units, context),
        grips: (0, runtime2.scaleGripMode)(slide2, units),
        deg: rotation,
        k: 1,
        shift: {
          x: 0,
          y: 0
        },
        wrote: null,
        base: slide2,
        open: !1
      };
    }, []), liveSession = ScaleModeReact.useCallback(() => {
      let current = sessionRef.current;
      if (current === null || (current.wrote === null ? optionsRef.current.slide() === current.before : slideIsOurs(current)))
        return current;
      if (current.wrote !== null)
        return end(!0, !0), null;
      let next = startSession();
      return typeof next == "string" ? end(!1) : setSession(next), sessionRef.current;
    }, [startSession, end]), apply = ScaleModeReact.useCallback((factor, shift4) => {
      let current = liveSession();
      if (current === null)
        return;
      let scaled = (0, runtime2.scaleUnits)(current.before, current.units, factor, current.box, current.ctx, shift4);
      scaled === current.before && current.wrote === null || (ownSlidesRef.current.add(scaled), setSession({
        ...current,
        k: factor,
        shift: shift4,
        wrote: scaled,
        open: !0
      }), optionsRef.current.onLiveChange(scaled), optionsRef.current.remeasure(), settleLater());
    }, [liveSession, settleLater]), arm = ScaleModeReact.useCallback(() => {
      if (sessionRef.current !== null || optionsRef.current.off)
        return;
      let next = startSession();
      if (typeof next == "string")
        return next;
      setSession(next);
    }, [startSession]), startDrag = ScaleModeReact.useCallback((grip, event) => {
      let current = liveSession();
      if (event.stopPropagation(), current === null || stopDragRef.current !== null || !(0, runtime2.startCanvasDrag)(event))
        return;
      optionsRef.current.focusCanvas();
      let gripName = handleGripName(grip), zoom = optionsRef.current.camera(), start = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        k: current.k,
        shift: current.shift
      }, onMove = (move) => {
        if (move.pointerId !== start.id)
          return;
        if (move.buttons === 0)
          return stopDragRef.current?.();
        let ratio = (0, runtime2.gripScaleFactor)({
          w: current.box.w * start.k,
          h: current.box.h * start.k
        }, gripName, (move.clientX - start.x) / zoom, (move.clientY - start.y) / zoom, current.deg), factor = (0, runtime2.clampScaleFactor)(Math.round(start.k * ratio * 1e3) / 1e3, current.limits.min, current.limits.max), shift4 = (0, runtime2.scaleAnchorShift)(current.box, (0, runtime2.scaleGripAnchor)(gripName), start.k, factor, current.deg);
        apply(factor, {
          x: start.shift.x + shift4.x,
          y: start.shift.y + shift4.y
        });
      }, onUp = (up) => {
        up.pointerId === start.id && stopDragRef.current?.();
      };
      stopDragRef.current = () => {
        stopDragRef.current = null, (0, runtime2.clearGestureCursor)(), window.removeEventListener("pointermove", onMove), window.removeEventListener("pointerup", onUp), window.removeEventListener("pointercancel", onUp);
      }, window.addEventListener("pointermove", onMove), window.addEventListener("pointerup", onUp), window.addEventListener("pointercancel", onUp), event.pointerType !== "touch" && (0, runtime2.setGestureCursor)((0, runtime2.rotatedResizeCursor)(grip, current.deg * Math.PI / 180));
    }, [apply, liveSession]), active = session !== null, selectionKey = (0, runtime2.selectionsKey)(options.selection()), slideId = options.slide().id;
    ScaleModeReact.useEffect(() => {
      let current = sessionRef.current;
      current !== null && (current.selKey !== selectionKey || current.before.id !== slideId) && end(!0);
    }, [selectionKey, slideId, end]), ScaleModeReact.useEffect(() => {
      options.off && end(!1);
    }, [options.off, end]);
    let slide = options.slide();
    ScaleModeReact.useEffect(() => void liveSession(), [slide, liveSession]);
    let onKey = ScaleModeReact.useCallback((event) => {
      if (sessionRef.current === null || typeof event.key != "string" || event.isComposing || event.keyCode === 229)
        return !1;
      let inStrip = event.target instanceof Element && event.target.closest("[data-scale-mode]") !== null;
      inStrip && settleLater();
      let unwritten = sessionRef.current.wrote === null, typingInField = inStrip && unwritten && event.target instanceof Element && event.target.matches("input:not([data-scale-untyped])"), undo = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z" && !typingInField, linkKey = (0, runtime2.linkShortcutKind)(event) === "mod" || (0, runtime2.linkShortcutKind)(event) === "plain" && !inStrip, backOut = event.key === "Tab" && event.shiftKey && event.target instanceof Element && event.target.matches("[data-scale-mode] input");
      return !linkKey && !undo && !backOut && event.key !== "Escape" && (inStrip || event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") ? !1 : ((linkKey || undo || backOut || event.key === "Escape" || event.key === "Enter") && (event.preventDefault(), event.stopPropagation()), linkKey || end(!undo && event.key !== "Escape"), undo && unwritten);
    }, [end, settleLater]);
    ScaleModeReact.useEffect(() => {
      if (!active)
        return;
      let onPointerDown = (event) => {
        let target = event.target;
        if (target instanceof Element && (target.closest("[data-slides-strip]") !== null || target.closest('[data-cds="SelectionRing"] [data-resize-handle]:not([data-rotate-handle])') !== null))
          return settleLater();
        end(!0);
      }, onBlur = () => end(!0), onVisibilityChange = () => {
        document.visibilityState === "hidden" && end(!0);
      };
      return window.addEventListener("pointerdown", onPointerDown, !0), window.addEventListener("blur", onBlur), document.addEventListener("visibilitychange", onVisibilityChange), () => {
        window.removeEventListener("pointerdown", onPointerDown, !0), window.removeEventListener("blur", onBlur), document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }, [active, end, settleLater]), ScaleModeReact.useEffect(() => () => end(!0), [end]);
    let enterKey = (0, runtime2.literalMessage)((0, runtime2.isApplePlatform)() ? "Return" : "Enter"), strip = () => session === null ? null : ScaleModeJsx.jsx(ScaleField, {
      factor: session.k,
      width: session.box.w,
      min: session.limits.min,
      max: session.limits.max,
      words: {
        field: (0, runtime2.formatMessage)({
          defaultMessage: "尺寸",
          id: "QxuuAs8fYb"
        }),
        hint: (0, runtime2.formatMessage)({
          defaultMessage: "{grips, select, yes {输入百分比或拖动手柄。按 {key} 保留，Esc 取消。} other {输入百分比。按 {key} 保留，Esc 取消。}}",
          id: "n7APDK9Ggt"
        }, {
          grips: session.grips === "none" ? "no" : "yes",
          key: enterKey
        }),
        invalid: (0, runtime2.formatMessage)({
          defaultMessage: "输入 {min} 到 {max} 之间的尺寸：百分比、倍数（如 1.5x）或宽度（如 320px）",
          id: "f1V8QQ5DVK"
        }, {
          min: (0, runtime2.formatScalePercent)(session.limits.min),
          max: (0, runtime2.formatScalePercent)(session.limits.max)
        }),
        done: (0, runtime2.formatMessage)({
          defaultMessage: "完成（{key}）",
          id: "SF8Z8ukU/G"
        }, {
          key: enterKey
        }),
        cancel: (0, runtime2.formatMessage)({
          defaultMessage: "取消（Esc）",
          id: "1K3qXuKJBm"
        })
      },
      onPreview: (factor) => {
        let shift4 = (0, runtime2.scaleAnchorShift)(session.box, {
          x: 0,
          y: 0
        }, session.k, factor, session.deg);
        apply(factor, {
          x: session.shift.x + shift4.x,
          y: session.shift.y + shift4.y
        });
      },
      onCommit: () => end(!0),
      onCancel: () => end(!1)
    }), stripName = (0, runtime2.formatMessage)({
      defaultMessage: "缩放",
      id: "3vINwOvKuR"
    });
    return {
      grips: session?.grips ?? null,
      arm,
      onKey,
      startDrag,
      strip,
      stripName
    };
  }
  return bindRuntimeValue(runtime2, "ScaleField", () => ScaleField), bindRuntimeValue(runtime2, "SCALE_REFUSAL_MESSAGES", () => SCALE_REFUSAL_MESSAGES), bindRuntimeValue(runtime2, "useScaleMode", () => useScaleMode), () => {
    ScaleFieldReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ScaleFieldJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SCALE_FIELD_CLASS = "h-control w-20 rounded bg-fill-field px-2 text-body text-primary tabular-nums shadow-field-ring outline-none focus-visible:outline-hidden focus-visible:shadow-focus aria-[invalid]:shadow-[0_0_0_2px_var(--cds-color-border-danger,#d9534f)] forced-colors:aria-[invalid]:outline-2 forced-colors:aria-[invalid]:outline-dashed pointer-coarse:h-10", ScaleModeReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ScaleModeJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SCALE_REFUSAL_MESSAGES = {
      nothing: (0, runtime2.formatMessage)({
        defaultMessage: "幻灯片自身的版式和背景无法缩放，请选择幻灯片上的对象。",
        id: "ReWqoyQuRx"
      }),
      later: (0, runtime2.formatMessage)({
        defaultMessage: "无法测量所选内容，请重试。",
        id: "/o6y/1eo4B"
      }),
      flat: (0, runtime2.formatMessage)({
        defaultMessage: "没有宽度或高度的对象无法缩放。",
        id: "pOCdMCVPRv"
      })
    }, stableSlideJson = (slide) => JSON.stringify(slide, (_key, value) => typeof value == "number" ? Math.round(value * 100) / 100 : typeof value == "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1)) : value), handleGripName = (grip) => (grip.y === "top" ? "n" : grip.y === "bottom" ? "s" : "") + (grip.x === "left" ? "w" : grip.x === "right" ? "e" : "");
  };
}
export {
  installEditorScaleMode
};
