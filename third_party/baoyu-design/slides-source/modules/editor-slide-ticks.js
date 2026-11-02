// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideTicks(runtime2) {
  var ReactSlideTicks, SlideTicksJsx, SLIDE_TICK_BASE_REM, SLIDE_TICK_HOVER_GROWTH_REM, SLIDE_TICK_HOVER_SPREAD, SLIDE_TICKS_REACH_PX, SLIDE_TICKS_GUTTER;
  function SlideTicks({ slides, assets, currentId, onSelect, onEnterSlide, stage, insetTop, insetBottom, coverId = null, commentCounts, covered = !1 }) {
    let stripRef = ReactSlideTicks.useRef(null), listRef = ReactSlideTicks.useRef(null), placement = useSlideTicksPlacement(stripRef, stage, insetTop, insetBottom), areaRef = ReactSlideTicks.useRef(null), reachable = useSlideTicksReach(areaRef, listRef), [pointer2, setPointer] = ReactSlideTicks.useState(null), [focused, setFocused] = ReactSlideTicks.useState(!1);
    useSlideTicksFocusFollow(listRef, currentId);
    let currentIndex = slides.findIndex((slide) => slide.id === currentId), onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || slides.length === 0)
        return;
      if (event.key === "Enter" && onEnterSlide !== void 0) {
        event.preventDefault(), onEnterSlide();
        return;
      }
      let from = Math.max(0, currentIndex), target = event.key === "ArrowUp" ? from - 1 : event.key === "ArrowDown" ? from + 1 : event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : null;
      if (target === null)
        return;
      event.preventDefault();
      let slide = slides[Math.max(0, Math.min(slides.length - 1, target))];
      slide === void 0 || slide.id === currentId || onSelect(slide.id);
    }, trackPointer = (clientY) => {
      let rect = listRef.current?.firstElementChild?.getBoundingClientRect();
      !rect || rect.height === 0 || setPointer((clientY - rect.top) / rect.height - 0.5);
    }, hoverWeight = (index4) => pointer2 === null ? 0 : Math.exp(-(((pointer2 - index4) / SLIDE_TICK_HOVER_SPREAD) ** 2));
    return SlideTicksJsx.jsx("div", {
      ref: stripRef,
      "data-slides-ticks": "",
      inert: covered && !focused,
      className: "pointer-events-none absolute inset-y-0 left-0 z-10 w-12",
      onFocus: () => setFocused(!0),
      onBlur: (event) => {
        event.relatedTarget === null && !document.hasFocus() || setFocused(event.currentTarget.contains(event.relatedTarget));
      },
      children: placement !== null ? SlideTicksJsx.jsx("div", {
        ref: areaRef,
        className: "absolute inset-x-0 flex flex-col justify-center",
        style: {
          top: placement.top,
          bottom: placement.bottom
        },
        children: SlideTicksJsx.jsx("div", {
          ref: listRef,
          role: "listbox",
          "aria-label": "演示文稿",
          "aria-orientation": "vertical",
          "data-reachable": reachable ? "" : void 0,
          className: "ml-1 flex max-h-full min-h-0 w-fit flex-col self-start px-1.5 py-1.5 opacity-0 transition-opacity duration-snap ease-out motion-reduce:transition-none has-[:focus-visible]:opacity-100! data-reachable:pointer-events-auto touch:pointer-events-auto touch:opacity-100!",
          onKeyDown,
          onPointerMove: (event) => trackPointer(event.clientY),
          onPointerLeave: () => setPointer(null),
          children: slides.map((slide, index4) => SlideTicksJsx.jsxs(runtime2.PreviewCard.Root, {
            delay: 0,
            closeDelay: 0,
            hoverable: !1,
            handover: "glide",
            lazy: !0,
            disabled: covered,
            children: [
              SlideTicksJsx.jsx(runtime2.PreviewCard.Trigger, {
                render: SlideTicksJsx.jsx("div", {
                  role: "option",
                  "aria-selected": index4 === currentIndex,
                  "aria-label": (0, runtime2.formatSlideThumbnailLabel)(slide, index4, slide.id === coverId, commentCounts?.get(slide.id)),
                  tabIndex: index4 === Math.max(0, currentIndex) ? 0 : -1,
                  className: "group flex min-h-0 w-8 shrink basis-3 pointer-coarse:basis-10 cursor-interactive items-center justify-start outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-app-accent",
                  onClick: () => onSelect(slide.id),
                  children: SlideTicksJsx.jsx("span", {
                    className: "rounded-full bg-surface-popover p-px",
                    children: SlideTicksJsx.jsx("span", {
                      "aria-hidden": "true",
                      className: (0, runtime2.joinClassNames)("block rounded-full transition-[width,background-color,border-color] duration-snap ease-out motion-reduce:transition-none", index4 === currentIndex ? "h-0.5 bg-fill-accent" : "h-0 border-t-2 border-strong group-hover:border-stronger"),
                      style: {
                        width: String((index4 === currentIndex ? 2 : 1) * SLIDE_TICK_BASE_REM + SLIDE_TICK_HOVER_GROWTH_REM * hoverWeight(index4)) + "rem"
                      }
                    })
                  })
                })
              }),
              SlideTicksJsx.jsx(runtime2.PreviewCard.Popup, {
                side: "right",
                align: "center",
                sideOffset: 10,
                padding: "none",
                className: "shadow-popover dark:shadow-sm [--preview-card-min-w:0px]",
                children: SlideTicksJsx.jsx("div", {
                  "data-current": index4 === currentIndex ? "" : void 0,
                  className: "w-fit overflow-hidden rounded-[inherit] border border-strong dark:border-gray-150 dark:bg-gray-150 data-current:bg-fill-accent data-current:outline-2 data-current:-outline-offset-1 data-current:outline-fill-accent",
                  children: SlideTicksJsx.jsx(runtime2.SlideCanvas, {
                    slide,
                    assets,
                    width: runtime2.RAIL_COLUMN_THUMB_WIDTH,
                    animate: !1,
                    structure: !1
                  })
                })
              })
            ]
          }, slide.id))
        })
      }) : null
    });
  }
  function useSlideTicksPlacement(strip, stage, insetTop, insetBottom) {
    let [placement, setPlacement] = ReactSlideTicks.useState(null);
    return ReactSlideTicks.useLayoutEffect(() => {
      let observedStage = null, measure = () => {
        let stageElement = stage.current;
        stageElement !== null && stageElement !== observedStage && (observer?.observe(stageElement), observedStage = stageElement);
        let stripRect = strip.current?.getBoundingClientRect(), stageRect = stageElement?.getBoundingClientRect();
        if (!stripRect || !stageRect)
          return setPlacement(null);
        setPlacement({
          top: Math.max(0, stageRect.top - stripRect.top + insetTop),
          bottom: Math.max(0, stripRect.bottom - stageRect.bottom + insetBottom)
        });
      }, observer = typeof ResizeObserver == "function" ? new ResizeObserver(measure) : null;
      return strip.current && observer?.observe(strip.current), measure(), () => observer?.disconnect();
    }, [strip, stage, insetTop, insetBottom]), placement;
  }
  function useSlideTicksFocusFollow(list, currentId) {
    ReactSlideTicks.useLayoutEffect(() => {
      list.current?.contains(document.activeElement) === !0 && list.current.querySelector('[aria-selected="true"]')?.focus({
        preventScroll: !0
      });
    }, [list, currentId]);
  }
  function useSlideTicksReach(area, list) {
    let [reachable, setReachable] = ReactSlideTicks.useState(!1);
    return ReactSlideTicks.useEffect(() => {
      let show = (opacity) => {
        list.current && (list.current.style.opacity = String(opacity)), setReachable(opacity === 1);
      }, onMove = (event) => {
        let rect = area.current?.getBoundingClientRect(), inside = rect !== void 0 && event.clientX >= rect.left && event.clientY >= rect.top && event.clientY < rect.bottom;
        show(inside && rect !== void 0 ? Math.max(0, Math.min(1, 1 - (event.clientX - rect.right) / SLIDE_TICKS_REACH_PX)) : 0);
      }, onLeave = () => show(0);
      return document.addEventListener("pointermove", onMove, {
        passive: !0
      }), document.documentElement.addEventListener("pointerleave", onLeave), () => {
        document.removeEventListener("pointermove", onMove), document.documentElement.removeEventListener("pointerleave", onLeave);
      };
    }, [area, list]), reachable;
  }
  return bindRuntimeValue(runtime2, "ReactSlideTicks", () => ReactSlideTicks, (value) => {
    ReactSlideTicks = value;
  }), bindRuntimeValue(runtime2, "SlideTicksJsx", () => SlideTicksJsx, (value) => {
    SlideTicksJsx = value;
  }), bindRuntimeValue(runtime2, "SLIDE_TICK_BASE_REM", () => SLIDE_TICK_BASE_REM, (value) => {
    SLIDE_TICK_BASE_REM = value;
  }), bindRuntimeValue(runtime2, "SLIDE_TICK_HOVER_GROWTH_REM", () => SLIDE_TICK_HOVER_GROWTH_REM, (value) => {
    SLIDE_TICK_HOVER_GROWTH_REM = value;
  }), bindRuntimeValue(runtime2, "SLIDE_TICK_HOVER_SPREAD", () => SLIDE_TICK_HOVER_SPREAD, (value) => {
    SLIDE_TICK_HOVER_SPREAD = value;
  }), bindRuntimeValue(runtime2, "SLIDE_TICKS_REACH_PX", () => SLIDE_TICKS_REACH_PX, (value) => {
    SLIDE_TICKS_REACH_PX = value;
  }), bindRuntimeValue(runtime2, "SLIDE_TICKS_GUTTER", () => SLIDE_TICKS_GUTTER, (value) => {
    SLIDE_TICKS_GUTTER = value;
  }), bindRuntimeValue(runtime2, "SlideTicks", () => SlideTicks), bindRuntimeValue(runtime2, "useSlideTicksPlacement", () => useSlideTicksPlacement), bindRuntimeValue(runtime2, "useSlideTicksFocusFollow", () => useSlideTicksFocusFollow), bindRuntimeValue(runtime2, "useSlideTicksReach", () => useSlideTicksReach), () => {
    (0, runtime2.initializePreviewCard)(), ReactSlideTicks = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideRenderer)(), SlideTicksJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SLIDE_TICK_BASE_REM = 0.375, SLIDE_TICK_HOVER_GROWTH_REM = 1.125, SLIDE_TICK_HOVER_SPREAD = 0.6666666666666666, SLIDE_TICKS_REACH_PX = 62, SLIDE_TICKS_GUTTER = 48;
  };
}
export {
  installEditorSlideTicks
};
