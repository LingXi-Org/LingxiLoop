// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideRailMarquee(runtime2) {
  var ReactSlideRailMarquee, MARQUEE_DRAG_THRESHOLD;
  function useSlideRailMarquee(options) {
    let [swept, setSwept] = ReactSlideRailMarquee.useState(null), band = ReactSlideRailMarquee.useRef(null), swallowClick = ReactSlideRailMarquee.useRef(!1), finish = ReactSlideRailMarquee.useRef(null), latest = ReactSlideRailMarquee.useRef(options);
    latest.current = options;
    let { scroller, enabled, column } = options;
    return ReactSlideRailMarquee.useEffect(() => {
      let strip = scroller.current;
      if (!enabled || strip === null)
        return;
      let clamp3 = (value, low, high) => Math.min(Math.max(value, low), high), onPointerDown = (down) => {
        finish.current === null && (swallowClick.current = !1);
        let bare = down.target instanceof Element && down.target.closest('[role="option"]') === null;
        if (finish.current !== null || !(0, runtime2.canStartGridRectSelection)({
          pointerType: down.pointerType,
          button: down.button,
          bare
        }))
          return;
        let { pointerId, clientX: startX, clientY: startY } = down, additive = down.shiftKey || down.metaKey || down.ctrlKey || down.altKey, before = latest.current.sel?.selected ?? [], hadFocus = strip.contains(document.activeElement), toStrip = (x, y) => {
          let box = strip.getBoundingClientRect();
          return {
            x: clamp3(x, box.left, box.right) - box.left + strip.scrollLeft,
            y: clamp3(y, box.top, box.bottom) - box.top + strip.scrollTop
          };
        }, origin = toStrip(startX, startY), pointerX = startX, pointerY = startY, sweeping = !1, covered = [], shown = null, update2 = () => {
          let box = strip.getBoundingClientRect(), point = toStrip(pointerX, pointerY), from = column ? origin.y : origin.x, to = column ? point.y : point.x, spans = Array.from(strip.querySelectorAll('[role="option"][data-slide-id]'), (option) => {
            let rect = option.getBoundingClientRect(), start = column ? rect.top - box.top + strip.scrollTop : rect.left - box.left + strip.scrollLeft;
            return {
              id: option.dataset.slideId ?? "",
              start,
              end: start + (column ? rect.height : rect.width)
            };
          });
          covered = (0, runtime2.slidesInSweep)(spans, from, to);
          let frame = strip.parentElement?.getBoundingClientRect();
          if (band.current !== null && frame !== void 0) {
            let [edgeStart, edgeEnd, scrolled] = column ? [box.top, box.bottom, strip.scrollTop] : [box.left, box.right, strip.scrollLeft], low = clamp3(Math.min(from, to) - scrolled + edgeStart, edgeStart, edgeEnd), high = clamp3(Math.max(from, to) - scrolled + edgeStart, edgeStart, edgeEnd), px = (value) => String(value) + "px", placement = column ? {
              left: px(box.left - frame.left),
              width: px(box.width),
              top: px(low - frame.top),
              height: px(high - low)
            } : {
              top: px(box.top - frame.top),
              height: px(box.height),
              left: px(low - frame.left),
              width: px(high - low)
            };
            Object.assign(band.current.style, {
              display: "block",
              ...placement
            });
          }
          let stage = latest.current.currentId, next = covered.length === 0 && !additive ? stage !== null ? [stage] : [] : (0, runtime2.mergeSweptSelection)(before, covered, additive);
          next.join(" ") !== shown && (shown = next.join(" "), setSwept(next));
        }, end = (how) => {
          if (window.removeEventListener("pointermove", onMove), window.removeEventListener("pointerup", onUp, !0), window.removeEventListener("pointercancel", onUp, !0), window.removeEventListener("blur", onBlur), window.removeEventListener("keydown", onKey, !0), window.removeEventListener("contextmenu", onContextMenu, !0), strip.removeEventListener("scroll", onScroll), finish.current = null, band.current !== null && (band.current.style.display = "none"), strip.hasPointerCapture(pointerId) && strip.releasePointerCapture(pointerId), !sweeping || (setSwept(null), how === "restore" && hadFocus && latest.current.stageThumb.current?.focus({
            preventScroll: !0
          }), how !== "settle"))
            return;
          let { slides, sel, onTaken } = latest.current, exists = (id) => slides.some((slide) => slide.id === id), taken = covered.filter(exists);
          if (taken.length === 0)
            return void (additive ? void 0 : sel?.collapse());
          let forward = column ? toStrip(pointerX, pointerY).y >= origin.y : toStrip(pointerX, pointerY).x >= origin.x, primary = forward ? taken[taken.length - 1] : taken[0];
          primary !== void 0 && (onTaken(primary), sel?.take((0, runtime2.mergeSweptSelection)(before, taken, additive).filter(exists), (forward ? taken[0] : taken[taken.length - 1]) ?? primary, primary), Array.from(strip.querySelectorAll('[role="option"][data-slide-id]')).find((option) => option.dataset.slideId === primary)?.focus({
            preventScroll: !0
          }));
        }, onMove = (move) => {
          if (move.pointerId === pointerId) {
            if (!(move.buttons & 1))
              return end("settle");
            if (!sweeping) {
              if (Math.hypot(move.clientX - startX, move.clientY - startY) < MARQUEE_DRAG_THRESHOLD)
                return;
              sweeping = !0, swallowClick.current = !0;
              try {
                strip.setPointerCapture(pointerId);
              } catch {
              }
              window.addEventListener("keydown", onKey, !0);
            }
            pointerX = move.clientX, pointerY = move.clientY, update2();
          }
        }, onUp = (up) => void (up.pointerId === pointerId && end("settle")), onBlur = () => void (!document.hasFocus() && end("settle")), onScroll = () => void (sweeping && update2()), onKey = (key) => {
          key.key === "Shift" || key.key === "Meta" || key.key === "Control" || key.key === "Alt" || (key.preventDefault(), key.stopPropagation(), key.key === "Escape" && end("restore"));
        }, onContextMenu = (menu) => {
          sweeping && (menu.preventDefault(), menu.stopPropagation()), end("settle");
        };
        finish.current = end, window.addEventListener("pointermove", onMove), window.addEventListener("pointerup", onUp, !0), window.addEventListener("pointercancel", onUp, !0), window.addEventListener("blur", onBlur), window.addEventListener("contextmenu", onContextMenu, !0), strip.addEventListener("scroll", onScroll, {
          passive: !0
        });
      };
      return strip.addEventListener("pointerdown", onPointerDown), () => {
        strip.removeEventListener("pointerdown", onPointerDown), finish.current === null ? swallowClick.current = !1 : finish.current("drop");
      };
    }, [scroller, enabled, column]), {
      swept,
      band,
      ownsClick: () => {
        let owned = swallowClick.current;
        return swallowClick.current = !1, owned;
      }
    };
  }
  return bindRuntimeValue(runtime2, "useSlideRailMarquee", () => useSlideRailMarquee), () => {
    ReactSlideRailMarquee = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), MARQUEE_DRAG_THRESHOLD = 5;
  };
}
export {
  installEditorSlideRailMarquee
};
