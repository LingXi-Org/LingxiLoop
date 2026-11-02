// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiScrollPager(runtime2) {
  var SCROLL_PAGER_SCROLLER_PART, SCROLL_PAGER_CONTROL_PART, parsePixels, reactScrollPagerControl, jsxScrollPagerControl, PAGER_HOLD_MS, PAGER_CHAIN_MS, NO_PAGER_EDGES, initializeUiScrollPagerControl, reactScrollPager, jsxScrollPager, PAGER_FADE_INSET, PAGER_FADE_WIDTH, PAGER_SCROLLER_CLASS, PAGER_CONTENT_CLASS, PAGER_EDGES, noopPagerSubscribe, pagerNever, pagerContains, pagerScrollPadding, ScrollPagerFrame, initializeUiScrollPager;
  function scrollExtent(element, rtl) {
    let extent = element.scrollWidth - element.clientWidth, position = rtl ? -element.scrollLeft : element.scrollLeft;
    return [Math.min(Math.max(position, 0), extent), extent];
  }
  function renderedScale(element) {
    let scale = element.getBoundingClientRect().width / element.offsetWidth;
    return scale > 0 && scale < 1 / 0 ? scale : 1;
  }
  function asElement(target) {
    if (!(0, runtime2.isDomNode)(target) || target.nodeType !== 1)
      return null;
    let element = target;
    return (0, runtime2.isHtmlElement)(element) || (0, runtime2.isSvgElement)(element) ? element : null;
  }
  function ScrollPagerControl({ toward, more, seen, label, size: size4, top, onPage, onWheel, onHeld }) {
    let atStart = toward === "start", fallbackLabel = (0, runtime2.useTranslation)(atStart ? "scrollBack" : "scrollForward", atStart ? "Scroll back" : "Scroll forward"), ref = reactScrollPagerControl.useRef(null), timer = reactScrollPagerControl.useRef(void 0), announce = reactScrollPagerControl.useCallback(() => {
      let element = ref.current;
      onHeld(toward, element?.ownerDocument.activeElement === element ? "focus" : timer.current !== void 0 && "press");
    }, [onHeld, toward]), press = () => {
      clearTimeout(timer.current), timer.current = setTimeout(() => {
        timer.current = void 0, announce();
      }, PAGER_HOLD_MS), announce();
    };
    reactScrollPagerControl.useEffect(() => {
      let element = ref.current;
      return element?.addEventListener("wheel", onWheel, { passive: !1 }), () => {
        element?.removeEventListener("wheel", onWheel);
      };
    }, [onWheel]);
    let release = (0, runtime2.useEventCallback)(() => {
      clearTimeout(timer.current), timer.current = void 0, onHeld(toward, !1);
    });
    return reactScrollPagerControl.useEffect(() => release, [release]), jsxScrollPagerControl.jsx(runtime2.Button, {
      ref,
      iconOnly: !0,
      variant: "ghost",
      size: size4,
      icon: atStart ? "CaretLeft" : "CaretRight",
      "aria-label": label ?? fallbackLabel,
      tooltip: !1,
      tabIndex: -1,
      "aria-disabled": !more || void 0,
      "aria-hidden": !seen || void 0,
      "data-cds-part": SCROLL_PAGER_CONTROL_PART,
      "data-toward": toward,
      style: { top },
      className: (0, runtime2.cn)("absolute top-1/2 -translate-y-1/2 transition-opacity duration-base ease-out aria-disabled:opacity-disabled aria-hidden:opacity-0", "after:absolute after:inset-[min(0px,calc((var(--cds-h-control)-1.5rem)/2))]", atStart ? "start-0" : "end-0"),
      onMouseDown: (event) => {
        event.preventDefault();
      },
      onClick: () => {
        more && (press(), onPage(toward));
      },
      onFocus: announce,
      onBlur: () => {
        onHeld(toward, timer.current !== void 0 && "press");
      }
    });
  }
  function useScrollPagerState(scrollerRef, headedRef, jumpedRef, active, sparing) {
    let [more, setMore] = reactScrollPagerControl.useState(NO_PAGER_EDGES), [spared, setSpared] = reactScrollPagerControl.useState(sparing), [middle, setMiddle] = reactScrollPagerControl.useState(), [rtl, setRtl] = reactScrollPagerControl.useState(!1), [held, setHeld] = reactScrollPagerControl.useState(NO_PAGER_EDGES), onHeld = reactScrollPagerControl.useCallback((edge, value) => {
      setHeld((current) => current[edge] === value ? current : { ...current, [edge]: value });
    }, []);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      const scroller = scrollerRef.current, view = scroller?.ownerDocument.defaultView;
      if (!active || !scroller || !view)
        return;
      let padStart = 0, isRtl = !1, update2 = () => {
        let [position, extent] = scrollExtent(scroller, isRtl);
        Math.abs(position - (headedRef.current?.to ?? position)) < 1 && (headedRef.current = void 0);
        let start = position > padStart + 1, end = extent - position > padStart + 1;
        setMore((current) => current.start === start && current.end === end ? current : { start, end });
      }, forget = () => {
        headedRef.current = void 0;
      }, releaseHeld = () => {
        setHeld(NO_PAGER_EDGES);
      }, measure = () => {
        let style = view.getComputedStyle(scroller);
        padStart = parsePixels(style.paddingInlineStart), isRtl = style.direction === "rtl", setRtl(isRtl), update2();
        let content = scroller.firstElementChild, firstRect = (content?.firstElementChild ?? content)?.getBoundingClientRect(), widthOf = (element) => element && !element.matches('[aria-disabled="true"], :disabled') ? element.getBoundingClientRect().width : 0, edgeWidth = Math.min(widthOf(content?.firstElementChild), widthOf(content?.lastElementChild)) / renderedScale(scroller), excess = scrollExtent(scroller, isRtl)[1] - Math.min(parsePixels(style.minWidth), edgeWidth + padStart - 24);
        if (setSpared((current) => sparing && (current ? excess <= 0.5 : excess <= -1)), firstRect !== void 0 && firstRect.height > 0) {
          let top = scroller.getBoundingClientRect().top;
          setMiddle((firstRect.top + firstRect.height / 2 - top) / renderedScale(scroller) - parsePixels(style.paddingTop));
        }
      }, ObserverConstructor = (0, runtime2.getResizeObserverConstructor)(scroller), resizeObserver = ObserverConstructor === void 0 ? null : (0, runtime2.createSafeResizeObserver)(ObserverConstructor, measure), observeAll = () => {
        resizeObserver?.disconnect(), resizeObserver?.observe(scroller);
        for (let child of Array.from(scroller.children))
          resizeObserver?.observe(child);
      };
      measure(), observeAll(), jumpedRef.current = update2;
      let childObserver = (0, runtime2.createSafeMutationObserver)(view.MutationObserver, observeAll);
      childObserver.observe(scroller, { childList: !0 });
      let directionObserver = (0, runtime2.createSafeMutationObserver)(view.MutationObserver, measure);
      directionObserver.observe(scroller.ownerDocument.documentElement, {
        attributeFilter: ["dir"]
      }), scroller.addEventListener("scroll", update2, { passive: !0 }), scroller.addEventListener("focusin", releaseHeld);
      let forgetEvents = ["wheel", "keydown", "pointerdown"];
      for (let type of forgetEvents)
        scroller.addEventListener(type, forget, { passive: !0 });
      return () => {
        jumpedRef.current = void 0, scroller.removeEventListener("scroll", update2), scroller.removeEventListener("focusin", releaseHeld);
        for (let type of forgetEvents)
          scroller.removeEventListener(type, forget);
        resizeObserver?.disconnect(), childObserver.disconnect(), directionObserver.disconnect();
      };
    }, [headedRef, jumpedRef, scrollerRef, sparing, active]);
    let onPage = reactScrollPagerControl.useCallback((edge) => {
      let scroller = scrollerRef.current, view = scroller?.ownerDocument.defaultView;
      if (!scroller || !view)
        return;
      let style = view.getComputedStyle(scroller), isRtl = style.direction === "rtl", padding = parsePixels(style.scrollPaddingLeft), [position, extent] = scrollExtent(scroller, isRtl), step = Math.max(scroller.clientWidth - 2 * padding, padding), now = Date.now(), headed = headedRef.current, to = (headed && now - headed.at < PAGER_CHAIN_MS ? headed.to : position) + (edge === "end" ? step : -step);
      (edge === "end" ? extent - to < padding : to < padding) && (to = edge === "end" ? extent : 0), headedRef.current = { to, at: now }, scroller.scrollTo({
        left: isRtl ? -to : to,
        behavior: (0, runtime2.isReducedMotion)() ? "auto" : "smooth"
      }), jumpedRef.current?.();
    }, [headedRef, jumpedRef, scrollerRef]), onWheel = reactScrollPagerControl.useCallback((event) => {
      let delta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      delta === 0 || !event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY) || (event.preventDefault(), headedRef.current = void 0, scrollerRef.current?.scrollBy({
        left: event.deltaMode === 1 ? delta * 16 : delta
      }));
    }, [headedRef, scrollerRef]), paging = active && !spared, edges = (pick) => paging ? {
      start: more.start || pick(held.start),
      end: more.end || pick(held.end)
    } : NO_PAGER_EDGES;
    return {
      hidden: paging ? more : NO_PAGER_EDGES,
      drawn: edges(Boolean),
      seen: edges((value) => value === "focus"),
      spared,
      middle,
      rtl,
      onPage,
      onWheel,
      onHeld
    };
  }
  function pagerFadeMask(start, end) {
    let [startInset, startWidth] = start ? [PAGER_FADE_INSET, PAGER_FADE_WIDTH] : ["0px", "0px"], [endInset, endWidth] = end ? [PAGER_FADE_INSET, PAGER_FADE_WIDTH] : ["0px", "0px"];
    return `linear-gradient(to right, transparent ${startInset}, #000 calc(${startInset} + ${startWidth}), #000 calc(100% - ${endInset} - ${endWidth}), transparent calc(100% - ${endInset}))`;
  }
  function useScrollPager() {
    let scrollerRef = reactScrollPager.useRef(null), lastPosition = reactScrollPager.useRef(void 0), headedRef = reactScrollPager.useRef(void 0), shownRef = reactScrollPager.useRef(void 0), jumpedRef = reactScrollPager.useRef(void 0);
    return {
      scrollerRef,
      reveal: reactScrollPager.useCallback((element, onlyIfUnmoved = !1) => {
        let scroller = scrollerRef.current, view = scroller?.ownerDocument.defaultView;
        if (!scroller || !view)
          return;
        let style = view.getComputedStyle(scroller);
        if (style.display === "contents")
          return;
        let isRtl = style.direction === "rtl", [position, extent] = scrollExtent(scroller, isRtl);
        if (onlyIfUnmoved && Math.abs(position - Math.min(lastPosition.current ?? -2, extent)) >= 2)
          return;
        let padding = pagerScrollPadding(style), scale = renderedScale(scroller), scrollerRect = scroller.getBoundingClientRect(), elementRect = element.getBoundingClientRect(), left = (elementRect.left - scrollerRect.left) / scale, right = (scrollerRect.right - elementRect.right) / scale, [before, after] = isRtl ? [right, left] : [left, right], delta = before < padding || before + after < 2 * padding ? before - padding : Math.max(padding - after, 0);
        if (delta !== 0) {
          let target = delta > 0 ? Math.ceil(position + delta) : Math.floor(position + delta), clamped = Math.min(Math.max(target, 0), extent);
          Math.abs(clamped - position) >= 0.5 && (scroller.scrollTo({
            left: isRtl ? -clamped : clamped,
            behavior: "auto"
          }), headedRef.current = void 0);
        }
        jumpedRef.current?.(), [lastPosition.current] = scrollExtent(scroller, isRtl), shownRef.current = element;
      }, []),
      headedRef,
      shownRef,
      jumpedRef
    };
  }
  return bindRuntimeValue(runtime2, "scrollExtent", () => scrollExtent), bindRuntimeValue(runtime2, "renderedScale", () => renderedScale), bindRuntimeValue(runtime2, "SCROLL_PAGER_SCROLLER_PART", () => SCROLL_PAGER_SCROLLER_PART, (value) => {
    SCROLL_PAGER_SCROLLER_PART = value;
  }), bindRuntimeValue(runtime2, "SCROLL_PAGER_CONTROL_PART", () => SCROLL_PAGER_CONTROL_PART, (value) => {
    SCROLL_PAGER_CONTROL_PART = value;
  }), bindRuntimeValue(runtime2, "parsePixels", () => parsePixels, (value) => {
    parsePixels = value;
  }), bindRuntimeValue(runtime2, "ScrollPagerControl", () => ScrollPagerControl), bindRuntimeValue(runtime2, "useScrollPagerState", () => useScrollPagerState), bindRuntimeValue(runtime2, "reactScrollPagerControl", () => reactScrollPagerControl, (value) => {
    reactScrollPagerControl = value;
  }), bindRuntimeValue(runtime2, "jsxScrollPagerControl", () => jsxScrollPagerControl, (value) => {
    jsxScrollPagerControl = value;
  }), bindRuntimeValue(runtime2, "PAGER_HOLD_MS", () => PAGER_HOLD_MS, (value) => {
    PAGER_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "PAGER_CHAIN_MS", () => PAGER_CHAIN_MS, (value) => {
    PAGER_CHAIN_MS = value;
  }), bindRuntimeValue(runtime2, "NO_PAGER_EDGES", () => NO_PAGER_EDGES, (value) => {
    NO_PAGER_EDGES = value;
  }), bindRuntimeValue(runtime2, "initializeUiScrollPagerControl", () => initializeUiScrollPagerControl, (value) => {
    initializeUiScrollPagerControl = value;
  }), bindRuntimeValue(runtime2, "pagerFadeMask", () => pagerFadeMask), bindRuntimeValue(runtime2, "useScrollPager", () => useScrollPager), bindRuntimeValue(runtime2, "reactScrollPager", () => reactScrollPager, (value) => {
    reactScrollPager = value;
  }), bindRuntimeValue(runtime2, "jsxScrollPager", () => jsxScrollPager, (value) => {
    jsxScrollPager = value;
  }), bindRuntimeValue(runtime2, "PAGER_FADE_INSET", () => PAGER_FADE_INSET, (value) => {
    PAGER_FADE_INSET = value;
  }), bindRuntimeValue(runtime2, "PAGER_FADE_WIDTH", () => PAGER_FADE_WIDTH, (value) => {
    PAGER_FADE_WIDTH = value;
  }), bindRuntimeValue(runtime2, "PAGER_SCROLLER_CLASS", () => PAGER_SCROLLER_CLASS, (value) => {
    PAGER_SCROLLER_CLASS = value;
  }), bindRuntimeValue(runtime2, "PAGER_CONTENT_CLASS", () => PAGER_CONTENT_CLASS, (value) => {
    PAGER_CONTENT_CLASS = value;
  }), bindRuntimeValue(runtime2, "PAGER_EDGES", () => PAGER_EDGES, (value) => {
    PAGER_EDGES = value;
  }), bindRuntimeValue(runtime2, "noopPagerSubscribe", () => noopPagerSubscribe, (value) => {
    noopPagerSubscribe = value;
  }), bindRuntimeValue(runtime2, "pagerNever", () => pagerNever, (value) => {
    pagerNever = value;
  }), bindRuntimeValue(runtime2, "pagerContains", () => pagerContains, (value) => {
    pagerContains = value;
  }), bindRuntimeValue(runtime2, "pagerScrollPadding", () => pagerScrollPadding, (value) => {
    pagerScrollPadding = value;
  }), bindRuntimeValue(runtime2, "ScrollPagerFrame", () => ScrollPagerFrame, (value) => {
    ScrollPagerFrame = value;
  }), bindRuntimeValue(runtime2, "initializeUiScrollPager", () => initializeUiScrollPager, (value) => {
    initializeUiScrollPager = value;
  }), () => {
    SCROLL_PAGER_SCROLLER_PART = "scroll-pager-scroller", SCROLL_PAGER_CONTROL_PART = "scroll-pager-control", parsePixels = (value) => Number.parseFloat(value) || 0, PAGER_HOLD_MS = 1e3, PAGER_CHAIN_MS = 600, initializeUiScrollPagerControl = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeSplitButtonNoop)(), (0, runtime2.initializeUiDisclosure9)(), reactScrollPagerControl = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxScrollPagerControl = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), NO_PAGER_EDGES = { start: !1, end: !1 };
    }), PAGER_FADE_INSET = "calc(0.5rem + var(--cds-h-control))", PAGER_FADE_WIDTH = "1.25rem", PAGER_SCROLLER_CLASS = "-m-2 flex min-w-[calc(0.5rem+var(--cds-h-control)+1.25rem)] py-2 ps-2 after:w-2 after:shrink-0 after:content-[''] overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-fade-x outline-none", PAGER_CONTENT_CLASS = "w-max min-w-[calc(100%-0.5rem)] max-w-none flex-none shrink-0 grow-0 basis-auto", noopPagerSubscribe = () => () => {
    }, pagerNever = () => !1, pagerContains = (element, target) => (0, runtime2.isDomNode)(target) && element.contains(target), pagerScrollPadding = (style) => Math.max(parsePixels(style.scrollPaddingLeft), parsePixels(style.paddingInlineStart)), initializeUiScrollPager = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeSplitButtonNoop)(), (0, runtime2.initializeIconAccessibility)(), initializeUiScrollPagerControl(), reactScrollPager = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxScrollPager = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PAGER_EDGES = ["start", "end"], ScrollPagerFrame = reactScrollPager.forwardRef(({ pager: { scrollerRef, reveal, headedRef, shownRef, jumpedRef }, active, overflows = !0, sparing = !1, size: size4, scrollBackLabel, scrollForwardLabel, scrollerProps, className, children, ...rest }, ref) => {
        let hoverless = reactScrollPager.useSyncExternalStore(active ? runtime2.subscribeDeviceMediaQueries : noopPagerSubscribe, active ? runtime2.useCoarseOrHoverlessPointer : pagerNever, pagerNever), pages = active && overflows && !hoverless, { hidden, drawn, seen, spared, middle, rtl, onPage, onWheel, onHeld } = useScrollPagerState(scrollerRef, headedRef, jumpedRef, pages, sparing), masked = pages && !spared;
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          shownRef.current?.isConnected && reveal(shownRef.current, !0), scrollerRef.current?.getAttribute("style") === "" && scrollerRef.current.removeAttribute("style");
        }, [masked, reveal, scrollerRef, shownRef]);
        let pressing = reactScrollPager.useRef(!1), notePress = (event) => {
          let view = event.currentTarget.ownerDocument.defaultView;
          if (!active || !view)
            return;
          let endEvents = event.type === "mousedown" ? ["mouseup", "keydown", "dragend"] : ["pointerup", "pointercancel", "keydown", "dragend"];
          pressing.current = !0;
          let end = () => {
            pressing.current = !1, endEvents.forEach((type) => view.removeEventListener(type, end, !0));
          };
          endEvents.forEach((type) => view.addEventListener(type, end, !0));
        }, mask = pagerFadeMask(rtl ? seen.end : seen.start, rtl ? seen.start : seen.end), labels = {
          start: scrollBackLabel,
          end: scrollForwardLabel
        };
        return jsxScrollPager.jsxs("div", {
          ref,
          ...rest,
          ...(0, runtime2.getControlSizeAttributes)(size4),
          "data-paged": active ? "" : void 0,
          className: (0, runtime2.cn)(active ? "relative flow-root min-w-0" : "contents", className),
          children: [
            jsxScrollPager.jsx("div", {
              ref: scrollerRef,
              "data-cds-part": SCROLL_PAGER_SCROLLER_PART,
              className: active ? PAGER_SCROLLER_CLASS : "contents",
              tabIndex: active ? -1 : void 0,
              ...scrollerProps,
              style: masked ? {
                maskImage: mask,
                WebkitMaskImage: mask,
                scrollPaddingInline: `calc(${PAGER_FADE_INSET} + ${PAGER_FADE_WIDTH})`
              } : void 0,
              onPointerDown: notePress,
              onMouseDown: notePress,
              onClick: (event) => {
                let scroller = event.currentTarget, view = scroller.ownerDocument.defaultView;
                if (!active || !view || !pagerContains(scroller, event.target))
                  return;
                let room = (scroller.clientWidth - 2 * pagerScrollPadding(view.getComputedStyle(scroller))) * renderedScale(scroller), item = null;
                for (let element = asElement(event.target); element !== null && element !== scroller; element = element.parentElement) {
                  let { width } = element.getBoundingClientRect();
                  if (width > room)
                    break;
                  width > 0 && (item = element);
                }
                item !== null && reveal(item);
              },
              onFocus: (event) => {
                active && !pressing.current && event.target !== event.currentTarget && pagerContains(event.currentTarget, event.target) && reveal(event.target);
              },
              children
            }),
            PAGER_EDGES.map((edge) => drawn[edge] ? jsxScrollPager.jsx(ScrollPagerControl, {
              toward: edge,
              more: hidden[edge],
              seen: seen[edge],
              label: labels[edge],
              size: size4,
              top: middle,
              onPage,
              onWheel,
              onHeld
            }, edge) : null)
          ]
        });
      }), ScrollPagerFrame.displayName = "ScrollPagerFrame";
    });
  };
}
export {
  installUiScrollPager
};
