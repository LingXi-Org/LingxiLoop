// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { GLIDE_HIDE_DURATION, GLIDE_MAX_OFFSET, DEFAULT_PREVIEW_CARD_DELAY, PREVIEW_CARD_SELECTOR, FIND_OMITTED_ATTRIBUTE, bindRuntimeValue } from "../module-helpers.js";
function installUiPreviewCard(runtime2) {
  var PreviewCardReact, PreviewCardJsx, PreviewCard, initializePreviewCard, TABBABLE_SELECTOR, PREVIEW_CARD_MESSAGES, previewCardInsidePopupContext, previewCardContext, previewCardPopupClasses, previewCardPaddingClasses, activePreviewCard = void 0;
  const base = () => runtime2.basePreviewCard;
  function finishAnimations(animations) {
    for (let animation of animations)
      try {
        animation.finish();
      } catch {
      }
  }
  function captureGlideSource(element) {
    if (!element.isConnected || !(0, runtime2.supportsElementAnimations)(element) || (0, runtime2.isReducedMotion)())
      return null;
    let animations = element.getAnimations(), box = element.getBoundingClientRect();
    finishAnimations(animations);
    try {
      return {
        box,
        hidden: element.animate({ visibility: ["hidden", "hidden"] }, { duration: GLIDE_HIDE_DURATION, fill: "forwards" })
      };
    } catch {
      return { box, hidden: null };
    }
  }
  function glideFrom(element, from) {
    if (!element.isConnected || !(0, runtime2.supportsElementAnimations)(element) || (0, runtime2.isReducedMotion)())
      return [];
    let box = element.getBoundingClientRect(), offset4 = from.top - box.top, heightDelta = box.height - from.height;
    if (Math.abs(from.left - box.left) > 2 || Math.abs(from.width - box.width) > 2 || Math.abs(offset4) > GLIDE_MAX_OFFSET || Math.abs(offset4) < 0.5 && Math.abs(heightDelta) < 0.5)
      return [];
    let style = getComputedStyle(element), duration = (0, runtime2.readCssDuration)(style, "--cds-dur-snap"), easing = style.getPropertyValue("--cds-ease-out").trim() || "linear";
    if (duration === 0)
      return [];
    let animations = [];
    try {
      animations.push(element.animate({ transform: [`translateY(${offset4}px)`, "translateY(0px)"] }, { duration, easing })), Math.abs(heightDelta) >= 0.5 && animations.push(element.animate({
        height: [`${from.height}px`, `${box.height}px`],
        marginBottom: [`${heightDelta}px`, "0px"],
        overflow: ["hidden", "hidden"]
      }, { duration, easing }));
    } catch {
    }
    return animations;
  }
  function isPointerEnteringFromOutside(event) {
    let current = event.currentTarget;
    return current.contains(event.target) && !current.contains(event.relatedTarget);
  }
  function removeDescribedBy(element, id) {
    let ids = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((value) => value.length > 0 && value !== id);
    ids.length > 0 ? element.setAttribute("aria-describedby", ids.join(" ")) : element.removeAttribute("aria-describedby");
  }
  function isExposedToTab(element) {
    return element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true";
  }
  function isEnabledAndVisible(element) {
    return element.matches(":disabled") ? !1 : typeof element.checkVisibility != "function" || element.checkVisibility({ visibilityProperty: !0 });
  }
  function isTabStop(element) {
    return (0, runtime2.isHtmlElement)(element) && isExposedToTab(element) && isEnabledAndVisible(element);
  }
  function hasExplicitTabIndex(element) {
    if (element.getAttribute("aria-hidden") === "true")
      return !1;
    if (element.tabIndex >= 0)
      return !0;
    let value = element.getAttribute("tabindex");
    return value !== null && Number.isInteger(Number.parseInt(value, 10));
  }
  function isFocusTarget(element) {
    return (0, runtime2.isHtmlElement)(element) && hasExplicitTabIndex(element) && isEnabledAndVisible(element);
  }
  function tabStopsWithin(container) {
    return Array.from(container.querySelectorAll(TABBABLE_SELECTOR)).filter(isTabStop);
  }
  function scanTabStops(element) {
    let candidates = Array.from(element.querySelectorAll(TABBABLE_SELECTOR)).filter((node) => (0, runtime2.isHtmlElement)(node));
    if (candidates.length === 0)
      return {
        candidates,
        selfIsTabStop: !1,
        stops: [],
        outsideCouldChangeThem: !1
      };
    let selfIsTabStop = isTabStop(element), stops = selfIsTabStop ? [] : candidates.filter(isTabStop);
    return {
      candidates,
      selfIsTabStop,
      stops,
      outsideCouldChangeThem: isExposedToTab(element) || candidates.some((node) => isExposedToTab(node) && !stops.includes(node))
    };
  }
  function ownTabStops(element) {
    return isTabStop(element) ? [element] : tabStopsWithin(element);
  }
  function firstFocusTarget(element) {
    return Array.from(element.querySelectorAll(TABBABLE_SELECTOR)).find(isFocusTarget);
  }
  function triggerFocusTargets(element) {
    let stops = ownTabStops(element);
    if (stops.length > 0)
      return stops;
    if (isFocusTarget(element))
      return [element];
    let first = firstFocusTarget(element);
    return first === void 0 ? [] : [first];
  }
  function describedTabStops(element) {
    let scan = scanTabStops(element);
    if (scan.candidates.length === 0 || scan.selfIsTabStop || scan.stops.length > 0)
      return {
        stops: scan.stops,
        outsideCouldChangeThem: scan.outsideCouldChangeThem
      };
    if (isFocusTarget(element))
      return { stops: [], outsideCouldChangeThem: !0 };
    let index4 = scan.candidates.findIndex(isFocusTarget), before = index4 < 0 ? scan.candidates : scan.candidates.slice(0, index4), first = scan.candidates[index4];
    return {
      stops: first === void 0 ? [] : [first],
      outsideCouldChangeThem: scan.outsideCouldChangeThem || hasExplicitTabIndex(element) || before.some(hasExplicitTabIndex)
    };
  }
  function nextTabStopAfter(trigger, popup) {
    let stops = Array.from(trigger.ownerDocument.querySelectorAll(TABBABLE_SELECTOR)).filter((node) => isTabStop(node) && !trigger.contains(node) && !(popup !== null && popup.contains(node)));
    for (let node of stops)
      if (trigger.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
        return node;
    return null;
  }
  function PreviewCardRoot3({ delay, closeDelay, hoverable = !0, disabled: disabled2 = !1, lazy = !1, handover = "instant", onOpenChange, description, interactive = !1, interactiveHint, children }) {
    let [hoverOpen, setHoverOpen] = PreviewCardReact.useState(!1), insidePopup = PreviewCardReact.useContext(previewCardInsidePopupContext), [focused, setFocused] = PreviewCardReact.useState(!1), [popupFocused, setPopupFocused] = PreviewCardReact.useState(!1), popupFocusedRef = PreviewCardReact.useRef(!1), interactiveRef = PreviewCardReact.useRef(interactive);
    PreviewCardReact.useEffect(() => {
      interactiveRef.current = interactive, popupFocusedRef.current = popupFocused;
    }, [interactive, popupFocused]);
    let popupNodeRef = PreviewCardReact.useRef(null), triggerNodeRef = PreviewCardReact.useRef(null), resolvedOpenRef = PreviewCardReact.useRef(!1), isEngaged = PreviewCardReact.useCallback(() => {
      let popup = popupNodeRef.current;
      return interactiveRef.current && popupFocusedRef.current && popup !== null && popup.contains(popup.ownerDocument.activeElement);
    }, []), [lazyHandle] = PreviewCardReact.useState(() => lazy ? base().createHandle() : null), [armed, setArmed] = PreviewCardReact.useState(!1), mounted = armed || lazyHandle === null, arm = PreviewCardReact.useCallback(() => setArmed(!0), []), hoverTimer = (0, runtime2.useCancelableTimeout)(), openFromHover = (0, runtime2.useEventCallback)(() => {
      mounted || disabled2 || !insidePopup && activePreviewCard !== void 0 && activePreviewCard.isEngaged() || (arm(), setHoverOpen(!0));
    }), dismiss = (0, runtime2.useEventCallback)(() => {
      setHoverOpen(!1), setFocused(!1), setPopupFocused(!1);
    }), glideRef = PreviewCardReact.useRef({
      from: null,
      view: void 0,
      frame: 0,
      running: [],
      hidden: null
    }), stopGlide = PreviewCardReact.useCallback(() => {
      let glide = glideRef.current;
      glide.from !== null && (glide.view?.cancelAnimationFrame(glide.frame), glide.from = null), glide.running.length > 0 && (finishAnimations(glide.running), glide.running = []);
    }, []);
    PreviewCardReact.useLayoutEffect(() => stopGlide, [stopGlide]);
    let startGlide = PreviewCardReact.useCallback((from) => {
      let glide = glideRef.current;
      glide.view = (0, runtime2.getElementWindow)(triggerNodeRef.current ?? void 0), glide.view !== void 0 && (glide.from = from, glide.frame = glide.view.requestAnimationFrame(() => {
        let popup = popupNodeRef.current;
        glide.from = null, popup !== null && (glide.running = glideFrom(popup, from));
      }));
    }, []), handOver = PreviewCardReact.useCallback((doc) => {
      let glide = glideRef.current, popup = popupNodeRef.current, from = glide.from, source = popup !== null && popup.ownerDocument === doc ? captureGlideSource(popup) : null;
      return stopGlide(), source === null ? null : (glide.hidden = source.hidden, from ?? source.box);
    }, [stopGlide]), onTriggerPointerEnter = (0, runtime2.useEventCallback)((event) => {
      if (!(event.type === "pointerover" && !isPointerEnteringFromOutside(event)) && !(disabled2 || event.pointerType === "touch")) {
        if (!insidePopup && activePreviewCard !== void 0 && activePreviewCard.dismiss !== dismiss) {
          if (activePreviewCard.isEngaged())
            return;
          hoverTimer.cancel(), lazyHandle && arm(), setHoverOpen(!0);
          return;
        }
        mounted || hoverTimer.start(delay ?? DEFAULT_PREVIEW_CARD_DELAY, openFromHover);
      }
    }), open4 = !disabled2 && (hoverOpen || focused || popupFocused), passThrough = !hoverable && !focused && !popupFocused;
    PreviewCardReact.useEffect(() => {
      resolvedOpenRef.current = open4;
    }, [open4]);
    let reportOpenChange = (0, runtime2.useOptionalEventCallback)(onOpenChange), reportedOpenRef = PreviewCardReact.useRef(open4);
    PreviewCardReact.useEffect(() => {
      reportedOpenRef.current !== open4 && (reportedOpenRef.current = open4, reportOpenChange?.(open4));
    }, [open4, reportOpenChange]);
    let [lastDisabled, setLastDisabled] = PreviewCardReact.useState(disabled2);
    disabled2 !== lastDisabled && (setLastDisabled(disabled2), disabled2 && (setHoverOpen(!1), setFocused(!1), setPopupFocused(!1))), PreviewCardReact.useLayoutEffect(() => {
      if (disabled2 && (hoverTimer.cancel(), interactive && popupFocusedRef.current)) {
        let doc = (popupNodeRef.current ?? triggerNodeRef.current)?.ownerDocument, activeElement2 = doc?.activeElement ?? null, focusWasInCard = doc !== void 0 && (activeElement2 === null || activeElement2 === doc.body || popupNodeRef.current !== null && popupNodeRef.current.contains(activeElement2)), trigger = triggerNodeRef.current;
        focusWasInCard && trigger !== null && triggerFocusTargets(trigger)[0]?.focus();
      }
    }, [disabled2, hoverTimer, interactive]);
    let glides = handover === "glide", session = PreviewCardReact.useMemo(() => ({
      dismiss,
      isEngaged,
      handOver: glides ? handOver : void 0
    }), [dismiss, isEngaged, glides, handOver]);
    PreviewCardReact.useLayoutEffect(() => {
      if (!open4 || insidePopup) {
        stopGlide();
        return;
      }
      if (glideRef.current.hidden?.cancel(), glideRef.current.hidden = null, activePreviewCard !== session) {
        if (activePreviewCard !== void 0 && activePreviewCard.dismiss !== session.dismiss && activePreviewCard.isEngaged()) {
          session.dismiss();
          return;
        }
        let from = glides ? activePreviewCard?.handOver?.(triggerNodeRef.current?.ownerDocument) ?? null : null;
        activePreviewCard?.dismiss(), activePreviewCard = session, from !== null && startGlide(from);
      }
      return () => {
        activePreviewCard === session && (activePreviewCard = void 0);
      };
    }, [open4, insidePopup, session, glides, startGlide, stopGlide]);
    let handleOpenChange = PreviewCardReact.useCallback((nextOpen, details) => {
      if (details?.reason !== "trigger-focus" && !(disabled2 && nextOpen) && !(nextOpen && !insidePopup && activePreviewCard !== void 0 && activePreviewCard.dismiss !== dismiss && activePreviewCard.isEngaged())) {
        if (!nextOpen && interactive && details?.reason === "escape-key") {
          let popup = popupNodeRef.current, trigger = triggerNodeRef.current, activeElement2 = popup?.ownerDocument.activeElement ?? null;
          if (popup !== null && trigger !== null && popup.contains(activeElement2)) {
            let target = triggerFocusTargets(trigger)[0];
            if (target !== void 0) {
              let focusedElement = (0, runtime2.asElement)(activeElement2);
              focusedElement !== null && (0, runtime2.blurWithSafeRelatedTarget)(focusedElement), target.focus();
            }
          }
        }
        setHoverOpen(nextOpen), !nextOpen && details?.reason !== "trigger-hover" && (setFocused(!1), setPopupFocused(!1));
      }
    }, [disabled2, dismiss, interactive, insidePopup]), contextValue = PreviewCardReact.useMemo(() => ({
      setFocused,
      setPopupFocused,
      disabled: disabled2,
      delay,
      closeDelay,
      hoverable,
      passThrough,
      description,
      lazyHandle,
      onTriggerPointerEnter,
      cancelHoverBootstrap: hoverTimer.cancel,
      arm,
      interactive,
      interactiveHint,
      popupNodeRef,
      triggerNodeRef,
      resolvedOpenRef
    }), [
      disabled2,
      delay,
      closeDelay,
      hoverable,
      passThrough,
      description,
      lazyHandle,
      onTriggerPointerEnter,
      hoverTimer.cancel,
      arm,
      interactive,
      interactiveHint
    ]), BaseRoot = base().Root;
    if (lazyHandle) {
      let outside = [], popups = [];
      for (let child of PreviewCardReact.Children.toArray(children))
        (PreviewCardReact.isValidElement(child) && child.type === PreviewCard.Popup ? popups : outside).push(child);
      return PreviewCardJsx.jsxs(previewCardContext.Provider, {
        value: contextValue,
        children: [
          outside,
          mounted && PreviewCardJsx.jsx(BaseRoot, {
            handle: lazyHandle,
            open: open4,
            onOpenChange: handleOpenChange,
            children: popups
          })
        ]
      });
    }
    return PreviewCardJsx.jsx(previewCardContext.Provider, {
      value: contextValue,
      children: PreviewCardJsx.jsx(BaseRoot, {
        open: open4,
        onOpenChange: handleOpenChange,
        children
      })
    });
  }
  function PreviewCardTrigger3({ render }) {
    let { setFocused, setPopupFocused, disabled: disabled2, delay, closeDelay, description, lazyHandle, onTriggerPointerEnter, cancelHoverBootstrap, arm, interactive, interactiveHint, popupNodeRef, triggerNodeRef, resolvedOpenRef } = PreviewCardReact.useContext(previewCardContext), descriptionId = PreviewCardReact.useId(), hintId = PreviewCardReact.useId(), setTriggerNode = PreviewCardReact.useCallback((node) => {
      triggerNodeRef.current = node;
    }, [triggerNodeRef]), defaultHint = (0, runtime2.useTranslation)("interactiveCardDefaultHint", PREVIEW_CARD_MESSAGES.interactiveCardDefaultHint), hintValues = PreviewCardReact.useMemo(() => ({ hint: interactiveHint ?? defaultHint }), [interactiveHint, defaultHint]), hintText = (0, runtime2.useTranslation)("interactiveCardHint", PREVIEW_CARD_MESSAGES.interactiveCardHint, hintValues), describedById = interactive ? hintId : description ? descriptionId : void 0, renderElement = describedById && PreviewCardReact.isValidElement(render) ? PreviewCardReact.cloneElement(render, {
      "aria-describedby": [
        render.props["aria-describedby"],
        describedById
      ].filter(Boolean).join(" ")
    }) : render, describedRef = PreviewCardReact.useRef({ id: void 0, nodes: [] }), watchRef = PreviewCardReact.useRef({ node: null, observer: null, stale: !0 }), syncDescribedBy = PreviewCardReact.useCallback(() => {
      let trigger2 = triggerNodeRef.current, scan = describedById === void 0 || trigger2 === null ? void 0 : describedTabStops(trigger2), allStops = scan?.stops ?? [], stops = allStops.length > 3 ? allStops.slice(0, 1) : allStops, previous = describedRef.current;
      if (previous.id !== void 0)
        for (let node of previous.nodes)
          (previous.id !== describedById || !stops.includes(node)) && removeDescribedBy(node, previous.id);
      if (describedById !== void 0)
        for (let node of stops) {
          let ids = new Set((node.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
          ids.has(describedById) || (ids.add(describedById), node.setAttribute("aria-describedby", [...ids].join(" ")));
        }
      describedRef.current = { id: describedById, nodes: stops }, watchRef.current.observer?.takeRecords(), watchRef.current.stale = scan !== void 0 && (scan.outsideCouldChangeThem || allStops.length > 3);
    }, [describedById, triggerNodeRef]);
    PreviewCardReact.useLayoutEffect(() => {
      let watch = watchRef.current, trigger2 = describedById === void 0 ? null : triggerNodeRef.current;
      if (watch.node !== trigger2) {
        watch.observer?.disconnect(), watch.observer = null, watch.node = trigger2, watch.stale = !0;
        let Observer = trigger2 === null ? void 0 : (0, runtime2.getElementWindow)(trigger2)?.MutationObserver;
        trigger2 !== null && typeof Observer == "function" && (watch.observer = new Observer(() => {
          watch.stale = !0;
        }), watch.observer.observe(trigger2, {
          subtree: !0,
          childList: !0,
          attributes: !0
        }));
      }
      let changed = watch.observer === null ? trigger2 !== null : watch.observer.takeRecords().length > 0;
      (watch.stale || changed || describedRef.current.id !== describedById || describedRef.current.nodes.some((node) => node.matches(":disabled"))) && syncDescribedBy();
    }, [syncDescribedBy, describedById, triggerNodeRef, render]), PreviewCardReact.useLayoutEffect(() => () => {
      watchRef.current.observer?.disconnect(), watchRef.current = { node: null, observer: null, stale: !0 };
      let { id, nodes } = describedRef.current;
      if (id !== void 0) {
        for (let node of nodes)
          removeDescribedBy(node, id);
        describedRef.current = { id: void 0, nodes: [] };
      }
    }, []);
    let trigger = PreviewCardJsx.jsx(base().Trigger, {
      handle: lazyHandle ?? void 0,
      ref: setTriggerNode,
      delay,
      closeDelay,
      onPointerEnter: onTriggerPointerEnter,
      onPointerOver: onTriggerPointerEnter,
      onPointerLeave: lazyHandle ? cancelHoverBootstrap : void 0,
      onFocus: (event) => {
        syncDescribedBy(), !disabled2 && event.target.matches(":focus-visible") && !(0, runtime2.isInputTriggeredBlur)(event.nativeEvent) && (setFocused(!0), lazyHandle && (cancelHoverBootstrap(), arm()));
      },
      onKeyDown: (event) => {
        if (!interactive || disabled2 || event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.metaKey || event.defaultPrevented || event.nativeEvent.isComposing)
          return;
        let popup = popupNodeRef.current;
        if (popup === null || !resolvedOpenRef.current)
          return;
        let triggerNode = triggerNodeRef.current, stops = triggerNode === null ? [] : ownTabStops(triggerNode);
        if (stops.length === 0 || event.target !== stops.at(-1))
          return;
        let [first] = tabStopsWithin(popup);
        first !== void 0 && (event.preventDefault(), first.focus());
      },
      onBlur: (event) => {
        setFocused(!1);
        let card = event.relatedTarget?.closest(PREVIEW_CARD_SELECTOR) ?? null;
        !disabled2 && card !== null && card === popupNodeRef.current && setPopupFocused(!0);
      },
      render: renderElement
    });
    if (describedById === void 0)
      return trigger;
    let announced = interactive && !disabled2 ? hintText : "";
    return PreviewCardJsx.jsxs(PreviewCardJsx.Fragment, {
      children: [
        trigger,
        PreviewCardJsx.jsx("span", {
          id: describedById,
          [FIND_OMITTED_ATTRIBUTE]: "",
          className: "sr-only select-none",
          children: interactive ? announced : description
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "PreviewCard", () => PreviewCard, (value) => {
    PreviewCard = value;
  }), bindRuntimeValue(runtime2, "PreviewCardReact", () => PreviewCardReact, (value) => {
    PreviewCardReact = value;
  }), bindRuntimeValue(runtime2, "PreviewCardJsx", () => PreviewCardJsx, (value) => {
    PreviewCardJsx = value;
  }), bindRuntimeValue(runtime2, "initializePreviewCard", () => initializePreviewCard, (value) => {
    initializePreviewCard = value;
  }), () => {
    initializePreviewCard = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeCancelableTimeout)(), PreviewCardReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)()), PreviewCardJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)()), TABBABLE_SELECTOR = [
        "a[href]",
        "button",
        "input",
        "select",
        "textarea",
        "audio[controls]",
        "video[controls]",
        "[contenteditable]:not([contenteditable='false'])",
        "[tabindex]"
      ].join(", "), PREVIEW_CARD_MESSAGES = {
        interactiveCardHint: "{hint} — press Tab until focus enters the card, Escape to return.",
        interactiveCardDefaultHint: "A preview card is available"
      }, previewCardInsidePopupContext = PreviewCardReact.createContext(!1), previewCardContext = PreviewCardReact.createContext({
        setFocused: () => {
        },
        setPopupFocused: () => {
        },
        disabled: !1,
        hoverable: !0,
        passThrough: !1,
        lazyHandle: null,
        onTriggerPointerEnter: () => {
        },
        cancelHoverBootstrap: () => {
        },
        arm: () => {
        },
        interactive: !1,
        interactiveHint: void 0,
        popupNodeRef: { current: null },
        triggerNodeRef: { current: null },
        resolvedOpenRef: { current: !1 }
      }), PreviewCardRoot3.displayName = "PreviewCard.Root", PreviewCardTrigger3.displayName = "PreviewCard.Trigger", previewCardPopupClasses = `draggable-none flex flex-col gap-1 min-w-[var(--preview-card-min-w,200px)] max-w-[var(--preview-card-max-w,360px)] ${(0, runtime2.getSurfaceClasses)("popover")} cds-reset text-body font-normal text-primary outline-none focus-visible:outline-hidden`, previewCardPaddingClasses = {
        none: "p-0",
        xs: "p-xs",
        sm: "p-sm",
        md: "p-md",
        lg: "p-lg"
      };
      let PreviewCardPopup3 = PreviewCardReact.forwardRef(({ side: side2 = "bottom", align: align2 = "start", sideOffset = 6, alignOffset, collisionPadding, container, padding = "lg", className, children, onContextMenu, onFocus, onBlur, onKeyDown, onKeyDownCapture, role, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...rest }, ref) => {
        let { setPopupFocused, description, passThrough, interactive, popupNodeRef, triggerNodeRef } = PreviewCardReact.useContext(previewCardContext), portalContainer = (0, runtime2.usePortalContainer)(), layer = (0, runtime2.useDefaultOverlayLayer)("popover"), mergedRef = (0, runtime2.useMergedRefs)(ref, popupNodeRef), handleKeyDownCapture = PreviewCardReact.useCallback((event) => {
          if (onKeyDownCapture?.(event), !interactive || event.key !== "Tab" || event.ctrlKey || event.metaKey || event.defaultPrevented || event.nativeEvent.isComposing)
            return;
          let popup = event.currentTarget, stops = tabStopsWithin(popup);
          if (stops.length === 0)
            return;
          let activeElement2 = popup.ownerDocument.activeElement;
          if (!event.shiftKey && activeElement2 === stops[stops.length - 1]) {
            let trigger = triggerNodeRef.current, next = trigger === null ? null : nextTabStopAfter(trigger, popup);
            next !== null && (event.preventDefault(), next.focus());
          } else if (event.shiftKey && activeElement2 === stops[0]) {
            let trigger = triggerNodeRef.current, targets = trigger === null ? [] : triggerFocusTargets(trigger), last = targets[targets.length - 1];
            last !== void 0 && (event.preventDefault(), last.focus());
          }
        }, [onKeyDownCapture, interactive, triggerNodeRef]), handleContextMenu = PreviewCardReact.useCallback((event) => {
          event.stopPropagation(), onContextMenu?.(event);
        }, [onContextMenu]), handleFocus = PreviewCardReact.useCallback((event) => {
          setPopupFocused(!0), onFocus?.(event);
        }, [setPopupFocused, onFocus]), handleBlur = PreviewCardReact.useCallback((event) => {
          event.currentTarget.contains(event.relatedTarget) || setPopupFocused(!1), onBlur?.(event);
        }, [setPopupFocused, onBlur]), BasePart = base();
        return PreviewCardJsx.jsx(BasePart.Portal, {
          container: container ?? portalContainer,
          children: PreviewCardJsx.jsx(runtime2.PortalRoot, {
            surface: runtime2.elevationSurfaceNames.popover,
            children: PreviewCardJsx.jsx(runtime2.CollisionPaddingProvider, {
              override: collisionPadding,
              container: container ?? portalContainer,
              children: (padding2) => PreviewCardJsx.jsx(runtime2.layerBaseContext.Provider, {
                value: layer.base,
                children: PreviewCardJsx.jsx(BasePart.Positioner, {
                  style: layer.style,
                  className: passThrough ? "pointer-events-none" : void 0,
                  side: side2,
                  align: align2,
                  sideOffset,
                  alignOffset,
                  collisionPadding: padding2,
                  positionMethod: "fixed",
                  children: PreviewCardJsx.jsx(BasePart.Popup, {
                    "data-cds": "PreviewCard",
                    ref: mergedRef,
                    ...rest,
                    role: interactive ? "group" : role,
                    onKeyDown,
                    onKeyDownCapture: interactive ? handleKeyDownCapture : onKeyDownCapture,
                    "aria-label": ariaLabel,
                    "aria-labelledby": ariaLabelledBy,
                    onFocus: handleFocus,
                    onBlur: handleBlur,
                    onContextMenu: handleContextMenu,
                    className: (0, runtime2.cn)(previewCardPopupClasses, previewCardPaddingClasses[padding], className),
                    children: PreviewCardJsx.jsx(previewCardInsidePopupContext.Provider, {
                      value: !0,
                      children: children ?? description
                    })
                  })
                })
              })
            })
          })
        });
      });
      PreviewCardPopup3.displayName = "PreviewCard.Popup", PreviewCard = {
        Root: PreviewCardRoot3,
        Trigger: PreviewCardTrigger3,
        Popup: PreviewCardPopup3
      };
    });
  };
}
export {
  installUiPreviewCard
};
