// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiDisclosure(runtime2) {
  var staysSecondaryTextClasses = "text-[color:var(--cds-text-stays-secondary,var(--cds-text-muted))]", PRESERVE_INPUT_FOCUS_PROPS, initializeUiDisclosure, react_k, initializeUiDisclosure2, reactForUiDisclosure, DISCLOSURE_PANEL_CLASS, isHeightTransitionAnimation, observeDisclosureHeightAnimation, useDisclosureAnimationRef, useDisclosureBodyRef, initializeUiDisclosure3, reactForUiDisclosure2, jsxForUiDisclosure, CollapsibleRoot3, COLLAPSIBLE_TRIGGER_CLASS, COLLAPSIBLE_ICON_CLASS, CollapsibleTrigger3, COLLAPSIBLE_PANEL_CLASS, CollapsiblePanel3, Collapsible, initializeUiDisclosure4, reactcK, jsxEq, spinnerSizeAliases, spinnerSizeMetrics, initializeUiDisclosure5, reactForUiDisclosure3, CompactableContext, COMPACTABLE_ATTRIBUTE, initializeUiDisclosure6, reacttq0, initializeUiDisclosure7, reactf6, reactDomForTooltipBatch, jsxh3, loadedTooltipImplementation, tooltipImplementationPromise, tooltipImplementationListeners, tooltipBatchTimer, tooltipBatchCallbacks, tooltipPreloadEvents, tooltipPreloadStarted, pendingTooltipProps, TOUCH_TOOLTIP_HOLD_MS, deferredTooltipImplementationContext, initializeUiDisclosure8, reacttJ, jsxForUiDisclosure2, stopEvent2, BUTTON_ON_ACCENT_TEXT_CLASS, BUTTON_END_ICON_OFFSET_CLASS, buttonVariants, BUTTON_ON_CONTENT_FILL_CLASS, buttonPaintVariants, buttonGroupContext, BUTTON_SEGMENT_RADIUS_CLASSES, BUTTON_OUTSET_CLASSES, BUTTON_OUTSET_STYLES, BUTTON_PANELS_OUTSET_STYLES, BUTTON_PANELS_END_ICON_OFFSET_CLASS = "me-[calc((var(--cds-h-control)-1em-6px)/2-min(var(--cds-pad-md),var(--cds-button-pad-max,var(--cds-pad-md))))]", PRESS_SQUISH_MIN_SCALE = 0.8, BUTTON_PRESS_INSET_RATIO = 0.03125, BUTTON_PRESS_INSET_MIN = 0.5, BUTTON_PRESS_INSET_MAX = 1.5, BUSY_BUTTON_SELECTOR = '[data-cds="Button"][aria-busy="true"][aria-disabled="true"]', busyButtonGuardDocuments, initializeBusyButtonGuard, buttonIconSizeContext, Button3, initializeUiDisclosure9, reactz6, jsxW7, skeletonElementTags, pendingShimmerElements, shimmerStartTimes, skeletonNotShownSnapshot, skeletonShownSnapshot, SKELETON_BREATHE_ANIMATION, SKELETON_SWEEP_ANIMATION, SKELETON_ANIMATION_DURATION_MS, DEFAULT_SKELETON_MOTION, SKELETON_MINIMUM_HOLD_MS, SKELETON_DURATION_LIMIT_MS, SKELETON_SYNC_TOLERANCE_MS, skeletonAnimationStartTimes, skeletonIconRowWidths, skeletonTextRowWidths, skeletonLineWidths, SkeletonPrimitive, initializeUiDisclosure10, reactForUiDisclosure4, jsxForUiDisclosure3, Surface, initializeUiDisclosure11, TEXT_INPUT_SURFACE_CLASS, TEXT_INPUT_HOVER_CLASS, TEXT_INPUT_CLASS, TEXT_INPUT_REQUIRED_CLASS, fieldFocusClasses, fieldFocusWithinClasses, TEXT_INPUT_PLACEHOLDER_CLASS, TEXT_INPUT_INVALID_CLASS, initializeUiDisclosure12;
  function preventRepeatedClickSelection(event) {
    event.detail <= 1 || event.button !== 0 || event.target.closest?.("input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])") || event.preventDefault();
  }
  function withRepeatedClickSelectionPrevention(onMouseDown) {
    return onMouseDown ? (input) => {
      onMouseDown(input), preventRepeatedClickSelection(input);
    } : preventRepeatedClickSelection;
  }
  function useHiddenUntilFoundRef() {
    let ref = react_k.useRef(null);
    return react_k.useCallback((input) => {
      !input || input === ref.current?.node || (ref.current?.detach(), ref.current = {
        node: input,
        detach: attachBeforeMatchStyleRecovery(input)
      });
    }, []);
  }
  function attachBeforeMatchStyleRecovery(element) {
    let value, value2, callback = () => {
      value2?.disconnect(), value2 = void 0, value?.(), value = void 0;
    }, callback2 = (event) => {
      event.target !== element || value || (value = overrideInlineStyles(element, {
        height: "auto",
        "transition-property": "none"
      }), value2 = new (element.ownerDocument.defaultView?.MutationObserver ?? MutationObserver)(() => {
        element.hasAttribute("data-open") && callback();
      }), value2.observe(element, {
        attributes: !0,
        attributeFilter: ["data-open"]
      }));
    };
    return element.addEventListener("beforematch", callback2), () => {
      element.removeEventListener("beforematch", callback2), callback();
    };
  }
  function overrideInlineStyles(element, styles) {
    let previousStyles = Object.keys(styles).map((input) => [
      input,
      element.style.getPropertyValue(input),
      element.style.getPropertyPriority(input)
    ]);
    for (let [value, value2] of Object.entries(styles))
      element.style.setProperty(value, value2);
    return () => {
      for (let [value, value2, value3] of previousStyles)
        value2 ? element.style.setProperty(value, value2, value3) : element.style.removeProperty(value);
    };
  }
  function Spinner({ size: size4 = "sm", delay = 0, inheritColor = !1, label, className }) {
    let [value, value2] = reactcK.useState(delay <= 0), [value3, value4] = reactcK.useState(delay);
    delay !== value3 && (value4(delay), delay > 0 && value && value2(!1));
    let value5 = delay <= 0 || value;
    reactcK.useEffect(() => {
      if (delay <= 0)
        return;
      let value14 = window.setTimeout(() => value2(!0), delay);
      return () => window.clearTimeout(value14);
    }, [delay]);
    let value6 = spinnerSizeMetrics[spinnerSizeAliases[size4] ?? size4], value7 = inheritColor ? "currentColor" : "var(--cds-text-muted)", value8 = inheritColor ? "color-mix(in srgb, currentColor 25%, transparent)" : "var(--cds-border)", value9 = (0, runtime2.pixelsToScaledRem)(value6.box), value10 = (0, runtime2.pixelsToScaledRem)(value6.stroke), value11 = `calc(100% - ${value10})`, value12 = `radial-gradient(farthest-side, transparent ${value11}, #000 calc(${value11} + 0.5px))`, value13 = value5 ? jsxEq.jsxs("span", {
      "data-cds": "Spinner",
      className: (0, runtime2.cn)("relative inline-block shrink-0 align-middle", className),
      style: {
        width: value9,
        height: value9
      },
      "aria-hidden": !0,
      children: [
        jsxEq.jsx("span", {
          className: "absolute inset-0 rounded-full",
          style: {
            border: `${value10} solid ${value8}`
          }
        }),
        jsxEq.jsx("span", {
          className: "absolute inset-0 rounded-full animate-[spin_1s_linear_infinite] motion-reduce:animate-none",
          style: {
            background: `conic-gradient(transparent 40%, ${value7})`,
            WebkitMask: value12,
            mask: value12
          }
        })
      ]
    }) : null;
    return label ? jsxEq.jsxs("span", {
      role: "status",
      className: "leading-[0]",
      children: [
        value13,
        jsxEq.jsx(DelayedScreenReaderLabel, {
          show: value5,
          children: label
        })
      ]
    }) : value13;
  }
  function DelayedScreenReaderLabel({ show, children }) {
    let [value, value2] = reactcK.useState(!1);
    return reactcK.useEffect(() => {
      let value3 = window.setTimeout(() => value2(!0), 100);
      return () => window.clearTimeout(value3);
    }, []), show && value ? jsxEq.jsx("span", {
      className: "sr-only",
      children
    }) : null;
  }
  function useCompactable() {
    return reactForUiDisclosure3.useContext(CompactableContext);
  }
  function useCompactableControlDebug(input, options) {
    reacttq0.useEffect(() => {
    }, [input, options]);
  }
  function scheduleTooltipUpdate(input) {
    tooltipBatchCallbacks.add(input), tooltipBatchTimer ??= setTimeout(() => {
      tooltipBatchTimer = null;
      let items = [...tooltipBatchCallbacks];
      tooltipBatchCallbacks.clear(), items.length !== 0 && reactDomForTooltipBatch.flushSync(() => {
        for (let value of items)
          value();
      });
    }, 0);
  }
  function cancelTooltipUpdate(input) {
    tooltipBatchCallbacks.delete(input);
  }
  function loadTooltipImplementation() {
    return tooltipImplementationPromise ??= Promise.resolve().then(() => ((0, runtime2.initializeTooltip)(), runtime2.tooltipExports)).then((input) => {
      if (input?.Tooltip === void 0)
        throw Error("cds: the tooltip code didn't load (the import resolved with no module); tooltips stay off until the page reloads");
      loadedTooltipImplementation = input;
      for (let value of tooltipImplementationListeners)
        value();
      return input;
    }, (input) => {
      throw tooltipImplementationPromise = null, input;
    }), tooltipImplementationPromise;
  }
  function preloadTooltipsOnInteraction() {
    if (!(tooltipPreloadStarted || loadedTooltipImplementation !== null) && !(typeof document > "u")) {
      tooltipPreloadStarted = !0;
      for (let value of tooltipPreloadEvents)
        document.addEventListener(value, requestTooltipPreload, {
          capture: !0,
          passive: !0,
          once: !0
        });
    }
  }
  function requestTooltipPreload() {
    loadTooltipImplementation().catch(() => {
    });
  }
  function adoptTooltipTrigger(input, options) {
    input.node = options, options !== null && (input.adopted = !0, input.handBack && (input.handBack = !1, queueMicrotask(() => restoreDeferredTooltipFocus(input, options))));
  }
  function restoreDeferredTooltipFocus(input, element) {
    if (!element.isConnected || !input.focus)
      return;
    let activeElement2 = element.ownerDocument.activeElement;
    activeElement2 !== null && activeElement2 !== element.ownerDocument.body || element.focus({
      preventScroll: !0
    });
  }
  function cancelTooltipTouchHold(input) {
    input.tapHold !== null && (clearTimeout(input.tapHold), input.tapHold = null);
  }
  function releaseTooltipTouchHold(input, options, context) {
    if (cancelTooltipTouchHold(input), input.down && options.type === "pointerup" && (options.pointerType === "touch" || options.pointerType === "pen")) {
      input.tapHold = setTimeout(() => {
        input.tapHold = null, input.down = !1, context();
      }, TOUCH_TOOLTIP_HOLD_MS);
      return;
    }
    input.down = !1, context();
  }
  function resolveTooltipImplementation(input) {
    return loadedTooltipImplementation !== null ? loadedTooltipImplementation : input === null ? null : input.ambientImpl();
  }
  function hasNonVisibleFocus(element) {
    if (element.ownerDocument.activeElement !== element)
      return !1;
    try {
      return !element.matches(":focus-visible");
    } catch {
      return !1;
    }
  }
  function useDeferredTooltipImplementation(input) {
    let value = reactf6.useContext(runtime2.tooltipImplementationContext), value2 = reactf6.useContext(deferredTooltipImplementationContext), [value3, value4] = reactf6.useState(() => {
      let value7 = value ?? (value2 !== null && value2.isDeferred() ? null : resolveTooltipImplementation(value2));
      return value7 === null ? null : {
        impl: value7,
        track: void 0
      };
    }), value5 = value3 === null ? null : value3.impl, [value6] = reactf6.useState(value5 === null), ref = reactf6.useRef({
      hover: !1,
      focus: !1,
      down: !1,
      node: null,
      adopted: !1,
      handBack: !1,
      tapHold: null
    }), ref2 = reactf6.useRef(!1), callback = reactf6.useCallback(() => {
      if (ref.current.adopted || value2 !== null && value2.isDeferred())
        return;
      let { hover: current, focus: current2, down: current3, node: current4 } = ref.current;
      if (current3)
        return;
      let current5 = ref2.current;
      ref2.current = !1;
      let value7 = current2 && input && current4 !== null && hasNonVisibleFocus(current4);
      if (current2 && !value7)
        return;
      let value8 = resolveTooltipImplementation(value2);
      if (value8 !== null && (!current || current5)) {
        let current6 = ref.current;
        current6.handBack = value7, value4((input2) => input2 ?? {
          impl: value8,
          track: input ? (input3) => adoptTooltipTrigger(current6, input3) : void 0
        });
      }
    }, [value2, input]), callback2 = reactf6.useCallback(() => {
      resolveTooltipImplementation(value2) !== null && scheduleTooltipUpdate(callback);
    }, [value2, callback]), callback3 = reactf6.useCallback(() => {
      ref2.current = resolveTooltipImplementation(value2) !== null, callback2();
    }, [callback2, value2]), ref3 = reactf6.useRef(null), callback4 = reactf6.useCallback(() => {
      let current = ref3.current;
      current !== null && (ref3.current = null, current.doc.removeEventListener("pointerup", current.release, !0), current.doc.removeEventListener("pointercancel", current.release, !0));
    }, []), callback5 = reactf6.useCallback((input2, options) => {
      if (ref3.current !== null)
        return;
      let callback7 = (input3) => {
        let pointerId = input3.pointerId;
        options !== void 0 && pointerId !== void 0 && pointerId !== options || (callback4(), releaseTooltipTouchHold(ref.current, input3, callback2));
      };
      ref3.current = {
        doc: input2,
        release: callback7
      }, input2.addEventListener("pointerup", callback7, {
        capture: !0
      }), input2.addEventListener("pointercancel", callback7, {
        capture: !0
      });
    }, [callback2, callback4]);
    reactf6.useEffect(() => {
      if (!value6)
        return;
      preloadTooltipsOnInteraction();
      let current = ref.current, callback7 = () => {
        cancelTooltipUpdate(callback), current.tapHold !== null && (cancelTooltipTouchHold(current), current.down = !1), callback4();
      }, items = [], value7 = value2 !== null && value2.isDeferred();
      return value7 && items.push(value2.subscribe(callback3)), loadedTooltipImplementation === null && (tooltipImplementationListeners.add(callback2), items.push(() => tooltipImplementationListeners.delete(callback2))), !value7 && resolveTooltipImplementation(value2) !== null && (value2 !== null && (ref2.current = !0), callback2()), () => {
        for (let value8 of items)
          value8();
        callback7();
      };
    }, [callback2, callback3, value2, callback4, callback, value6]);
    let callback6 = reactf6.useCallback(() => {
      loadTooltipImplementation().catch(() => {
      });
    }, []);
    return {
      impl: value5,
      wasCold: value6,
      interceptors: reactf6.useCallback((input2) => {
        let callback7 = (input3, options) => (input4) => {
          input3(input4), options?.(input4);
        };
        return {
          onPointerEnter: callback7(() => {
            ref.current.hover = !0, callback6();
          }, input2.onPointerEnter),
          onPointerLeave: callback7(() => {
            ref.current.hover = !1, callback2();
          }, input2.onPointerLeave),
          onPointerDown: callback7((input3) => {
            input3.isPrimary !== !1 && input3.button === 0 && (cancelTooltipTouchHold(ref.current), ref.current.down = !0, callback5(input3.currentTarget.ownerDocument, input3.pointerId));
          }, input2.onPointerDown),
          onPointerUp: callback7((input3) => {
            input3.isPrimary !== !1 && releaseTooltipTouchHold(ref.current, input3, callback2);
          }, input2.onPointerUp),
          onPointerCancel: callback7((input3) => {
            input3.isPrimary !== !1 && releaseTooltipTouchHold(ref.current, input3, callback2);
          }, input2.onPointerCancel),
          onClick: callback7((input3) => {
            ref.current.tapHold !== null && releaseTooltipTouchHold(ref.current, input3, callback2);
          }, input2.onClick),
          onFocus: callback7((input3) => {
            ref.current.focus = !0, ref.current.node = (0, runtime2.asElement)(input3.currentTarget), callback6();
          }, input2.onFocus),
          onBlur: callback7(() => {
            ref.current.focus = !1, callback2();
          }, input2.onBlur)
        };
      }, [callback2, callback5, callback6]),
      trackTrigger: value3?.track
    };
  }
  function disableElementAutofocus(input) {
    return reactf6.isValidElement(input) ? reactf6.cloneElement(input, {
      autoFocus: !1
    }) : input;
  }
  function DeferredTooltip(input) {
    let { impl: value, wasCold: value2, interceptors: value3, trackTrigger: value4 } = useDeferredTooltipImplementation(!0), value5 = input.autoFocus === !1;
    if (value !== null)
      return value2 || value5 ? jsxh3.jsx(value.Tooltip, {
        ...input,
        triggerRef: value4,
        children: disableElementAutofocus(input.children)
      }) : jsxh3.jsx(value.Tooltip, {
        ...input
      });
    let { children: value6 } = input;
    if (!reactf6.isValidElement(value6))
      return jsxh3.jsx(jsxh3.Fragment, {
        children: value6
      });
    let value7 = value6;
    return reactf6.cloneElement(value7, {
      ...value3(value7.props),
      ...pendingTooltipProps
    });
  }
  function DeferredDisabledReasonTooltip(input) {
    let { impl: value, wasCold: value2, interceptors: value3 } = useDeferredTooltipImplementation(!1), value4 = reactf6.useId();
    if (value !== null)
      return value2 ? jsxh3.jsx(value.DisabledReasonTooltip, {
        ...input,
        children: disableElementAutofocus(input.children)
      }) : jsxh3.jsx(value.DisabledReasonTooltip, {
        ...input
      });
    let { reason: value5, wrapperClassName: value6, children: value7 } = input;
    return jsxh3.jsxs("span", {
      ...(0, runtime2.getDisabledReasonWrapperProps)(value5, value4, value6),
      title: typeof value5 == "string" ? value5 : void 0,
      ...value3({}),
      ...pendingTooltipProps,
      children: [
        value7,
        jsxh3.jsx(runtime2.DisabledReasonAnnouncement, {
          id: value4,
          reason: value5
        })
      ]
    });
  }
  function getPressSquishScale(width, height2, inset) {
    return width <= 0 || height2 <= 0 ? null : {
      sx: Math.max(PRESS_SQUISH_MIN_SCALE, 1 - 2 * inset / width),
      sy: Math.max(PRESS_SQUISH_MIN_SCALE, 1 - 2 * inset / height2)
    };
  }
  function setPressSquishScale(element, inset, scaleXVariable, scaleYVariable) {
    let scale = getPressSquishScale(element.offsetWidth, element.offsetHeight, inset);
    scale !== null && (element.style.setProperty(scaleXVariable, String(scale.sx)), element.style.setProperty(scaleYVariable, String(scale.sy)));
  }
  function getButtonPressInset(height2) {
    return Math.min(BUTTON_PRESS_INSET_MAX, Math.max(BUTTON_PRESS_INSET_MIN, height2 * BUTTON_PRESS_INSET_RATIO));
  }
  function hasInlineStyle(element) {
    return element !== null && "style" in element;
  }
  function guardBusyButtonMouseDown(doc, event) {
    let activeElement2 = doc.activeElement;
    if (event.button === 1 || !hasInlineStyle(activeElement2) || !activeElement2.matches(BUSY_BUTTON_SELECTOR) || typeof doc.elementFromPoint != "function")
      return;
    let { style } = activeElement2;
    if (style.getPropertyPriority("pointer-events") === "important")
      return;
    let hadStyleAttribute = activeElement2.hasAttribute("style"), previousPointerEvents = style.getPropertyValue("pointer-events"), hit;
    try {
      style.setProperty("pointer-events", "auto"), hit = doc.elementFromPoint(event.clientX, event.clientY);
    } finally {
      previousPointerEvents === "" ? style.removeProperty("pointer-events") : style.setProperty("pointer-events", previousPointerEvents), !hadStyleAttribute && activeElement2.getAttribute("style") === "" && activeElement2.removeAttribute("style");
    }
    hit !== null && activeElement2.contains(hit) && event.preventDefault();
  }
  function installBusyButtonGuard(doc) {
    busyButtonGuardDocuments.has(doc) || (busyButtonGuardDocuments.add(doc), doc.addEventListener("mousedown", (event) => guardBusyButtonMouseDown(doc, event), !0));
  }
  function renderButtonIndicator(content, indicator, className) {
    return jsxForUiDisclosure2.jsxs("span", {
      className: className === void 0 ? "grid" : `grid ${className}`,
      children: [
        jsxForUiDisclosure2.jsx("span", {
          className: "col-start-1 row-start-1 [--btn-dot-r:calc(0.1875rem*var(--cds-rem-scale,1))] [--btn-dot-x:calc(100%_-_var(--btn-dot-r)_+_1px)] [&:dir(rtl)]:[--btn-dot-x:calc(var(--btn-dot-r)_-_1px)] not-forced-colors:has-[~[data-cds-part=indicator]>[data-cds=Pulse]]:[mask-image:radial-gradient(circle_at_var(--btn-dot-x)_calc(var(--btn-dot-r)_-_1px),transparent_calc(var(--btn-dot-r)_+_2px),black_calc(var(--btn-dot-r)_+_2.5px))]",
          children: content
        }),
        jsxForUiDisclosure2.jsx("span", {
          "aria-hidden": !0,
          "data-cds-part": "indicator",
          className: "relative col-start-1 row-start-1 -me-px -mt-px self-start justify-self-end has-[>[data-cds=Pulse]]:[--cds-page-bg:transparent]",
          children: indicator
        })
      ]
    });
  }
  function isButtonActivationKey(input) {
    return input.key === "Enter" || input.key === " ";
  }
  function isUnmodifiedButtonActivation(input) {
    return isButtonActivationKey(input) && !input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey;
  }
  function useButtonGroup() {
    return reacttJ.useContext(buttonGroupContext);
  }
  function getButtonIconSize(input) {
    return input === "xs" || input === "xxs" ? "auto-sm" : input === "lg" ? "md" : "auto";
  }
  function useButtonIconSize(input) {
    let value = useButtonGroup(), value2 = reacttJ.useContext(buttonIconSizeContext);
    return (0, runtime2.useIconSize)(input !== void 0 ? getButtonIconSize(input) : value2 ?? (value?.size !== void 0 ? getButtonIconSize(value.size) : "auto"));
  }
  function getButtonIconVerticalPadding(input) {
    return `calc((var(--cds-h-control) - ${(0, runtime2.pixelsToScaledRem)(runtime2.iconSizeMetrics[input].px)}) / 2)`;
  }
  function isShimmerAnimation(input) {
    return input.animationName === "cds-shimmer";
  }
  function synchronizeDocumentShimmers(input) {
    let value, items = [];
    for (let value3 of input.getAnimations()) {
      if (!isShimmerAnimation(value3))
        continue;
      let { startTime: value4 } = value3;
      typeof value4 == "number" && (value === void 0 || value4 < value) && (value = value4);
      let value5 = value3.effect?.target;
      value5 != null && pendingShimmerElements.has(value5) && value3.playState === "running" && items.push(value3);
    }
    let value2 = value ?? shimmerStartTimes.get(input) ?? 0;
    for (let value3 of items)
      value3.startTime = value2;
    shimmerStartTimes.set(input, value2);
  }
  function flushShimmerSynchronization() {
    try {
      let values = /* @__PURE__ */ new Set();
      for (let value of pendingShimmerElements)
        values.add(value.ownerDocument);
      for (let value of values)
        synchronizeDocumentShimmers(value);
    } finally {
      pendingShimmerElements.clear();
    }
  }
  function scheduleShimmerSynchronization(element) {
    element === null || typeof element.ownerDocument.getAnimations != "function" || (pendingShimmerElements.size === 0 && queueMicrotask(flushShimmerSynchronization), pendingShimmerElements.add(element));
  }
  function createSkeletonShownStore() {
    let snapshot = skeletonNotShownSnapshot, listeners = /* @__PURE__ */ new Set(), setSnapshot = (input) => {
      if (snapshot !== input) {
        snapshot = input;
        for (let value of listeners)
          (0, runtime2.invokeAndReportError)(value);
      }
    };
    return {
      getSnapshot: () => snapshot,
      subscribe: (input) => (listeners.add(input), () => {
        listeners.delete(input);
      }),
      markShown: () => setSnapshot(skeletonShownSnapshot),
      reset: () => setSnapshot(skeletonNotShownSnapshot)
    };
  }
  function markSkeletonShownAfterCallback(input, options) {
    try {
      input?.();
    } finally {
      options.markShown();
    }
  }
  function clearSkeletonElapsedStyle(input) {
    input.style.removeProperty("--cds-skel-elapsed");
  }
  function setSkeletonMotion(input, options) {
    input.dataset.motion = options;
  }
  function ensurePositionedSkeletonHost(input) {
    let position = getComputedStyle(input).position;
    return position === "static" || position === "" ? (input.style.position = "relative", !0) : !1;
  }
  function synchronizeSkeletonAnimation(element, options = SKELETON_BREATHE_ANIMATION, context = 0) {
    if (typeof element.getAnimations != "function")
      return;
    let value = element.getAnimations().find((input) => input.animationName === options);
    if (value === void 0 || typeof value.startTime != "number")
      return;
    let value2 = value.effect?.getComputedTiming();
    if (value2?.duration !== SKELETON_ANIMATION_DURATION_MS || value2.iterations !== 1 / 0)
      return;
    let value3 = value.startTime + (value2.delay ?? 0), value4 = value3 - context, ownerDocument2 = element.ownerDocument, entry = skeletonAnimationStartTimes.get(ownerDocument2);
    if (entry === void 0) {
      skeletonAnimationStartTimes.set(ownerDocument2, value4);
      return;
    }
    let value5 = ((value4 - entry) % SKELETON_ANIMATION_DURATION_MS + SKELETON_ANIMATION_DURATION_MS) % SKELETON_ANIMATION_DURATION_MS;
    if (value5 < SKELETON_SYNC_TOLERANCE_MS || value5 > 1999)
      return;
    let value6 = typeof value.currentTime == "number" ? value.startTime + value.currentTime : value3, value7 = Math.ceil((Math.max(value6, value3) - (entry + context)) / SKELETON_ANIMATION_DURATION_MS);
    value.startTime = entry + context + value7 * SKELETON_ANIMATION_DURATION_MS - (value2.delay ?? 0);
  }
  function SkeletonGroup({ children, hold = "delayed", label, className, decorative = !1, onShown, onHidden, as: as2, motion = DEFAULT_SKELETON_MOTION }) {
    let value = reactz6.useContext(runtime2.skeletonActiveContext), value2 = reactz6.useContext(runtime2.skeletonElementContext), [value3] = reactz6.useState(as2 ?? value2), value4 = skeletonElementTags[value3], value5 = value3 === "span", value6 = reactz6.useContext(runtime2.skeletonGroupContext), value7 = reactz6.useContext(runtime2.skeletonShownStoreContext), [value8] = reactz6.useState(() => {
      let value18 = createSkeletonShownStore();
      return (value ? value7?.getSnapshot().shown === !0 : hold !== "delayed") && value18.markShown(), value18;
    }), [value9] = reactz6.useState(value6), [value10, value11] = reactz6.useState(!1), ref = reactz6.useRef(!1), value12 = value && !value10, callback = reactz6.useCallback((input) => {
      input !== null && input.parentElement !== null && input.parentElement.closest('[data-cds="SkeletonGroup"]') === null && (ref.current = !0, value8.reset(), value11(!0));
    }, [value8]), value13 = (0, runtime2.useTranslation)("loading", "Loading"), [value14] = reactz6.useState(hold), value15 = value14 === "delayed", value16 = label ?? value13, ref2 = reactz6.useRef(null), callback2 = reactz6.useCallback((input) => {
      ref2.current = input;
    }, []), ref3 = reactz6.useRef(!1), ref4 = reactz6.useRef({
      onShown,
      onHidden,
      labelText: value16
    });
    reactz6.useEffect(() => {
      if (ref4.current = {
        onShown,
        onHidden,
        labelText: value16
      }, ref3.current && ref2.current !== null) {
        let element = ref2.current.querySelector("[data-skeleton-label]");
        element !== null && element.textContent !== value16 && (element.textContent = value16);
      }
    }, [onShown, onHidden, value16, decorative]), reactz6.useLayoutEffect(() => {
      !value12 && !value15 && !ref3.current && (ref3.current = !0, markSkeletonShownAfterCallback(ref4.current.onShown, value8));
    }, [value12, value15, value8]), reactz6.useLayoutEffect(() => {
      if (!value12 || ref.current || value7 === null)
        return;
      let callback4 = () => {
        value7.getSnapshot().shown ? ref3.current ? value8.markShown() : (ref3.current = !0, markSkeletonShownAfterCallback(ref4.current.onShown, value8)) : value8.reset();
      };
      return callback4(), value7.subscribe(callback4);
    }, [value12, value7, value8]), reactz6.useEffect(() => () => {
      ref3.current && (ref4.current.onHidden?.(), ref3.current = !1), value8.reset();
    }, [value8]), reactz6.useLayoutEffect(() => {
      let current = ref2.current;
      if (current === null || value12 || !value15 || value9 === null)
        return;
      let value18 = performance.now() - value9;
      if (!(!Number.isFinite(value18) || value18 <= 0))
        return current.style.setProperty("--cds-skel-elapsed", `${value18}ms`), () => clearSkeletonElapsedStyle(current);
    }, [value12, value15, value9]);
    let ref5 = reactz6.useRef(null), callback3 = reactz6.useCallback((input) => {
      ref5.current = input;
    }, []);
    reactz6.useEffect(() => {
      let current = ref5.current, current2 = ref2.current;
      if (motion !== "sweep" || value12 || current === null || current2 === null)
        return;
      let value18 = ensurePositionedSkeletonHost(current2), callback4 = () => {
        let items = [], value20 = current2.querySelectorAll('[data-cds="Skeleton"]');
        setSkeletonMotion(current2, value20.length === 0 ? "lockstep" : "sweep");
        for (let value21 of value20) {
          let index4 = 0, index22 = 0, value22 = value21;
          for (; value22 !== null && value22 !== current2; )
            index4 += value22.offsetLeft, index22 += value22.offsetTop, value22 = value22.offsetParent, value22 !== null && value22 !== current2 && (index4 += value22.clientLeft - value22.scrollLeft, index22 += value22.clientTop - value22.scrollTop);
          value22 === current2 && items.push(`M${index4},${index22}h${value21.offsetWidth}v${value21.offsetHeight}h${-value21.offsetWidth}Z`);
        }
        current.style.clipPath = items.length ? `path("${items.join(" ")}")` : "", current.style.visibility = items.length ? "visible" : "hidden";
      };
      callback4();
      let value19 = (0, runtime2.createSafeResizeObserver)((0, runtime2.getResizeObserverConstructor)(current2) ?? ResizeObserver, callback4);
      return value19.observe(current2), () => {
        value19.disconnect(), value18 && current2.style.removeProperty("position");
      };
    }, [motion, value12]), reactz6.useEffect(() => {
      let current = ref2.current;
      if (motion !== "wave" || value12 || current === null)
        return;
      let callback4 = () => {
        let value19 = current.querySelectorAll('[data-cds="Skeleton"]'), value20 = Math.floor(SKELETON_ANIMATION_DURATION_MS / SKELETON_MINIMUM_HOLD_MS), index4 = 0;
        for (let value21 of value19)
          value21.style.getPropertyValue("--cds-skel-i") !== "" && (index4 += 1);
        for (let value21 of value19)
          value21.style.getPropertyValue("--cds-skel-i") === "" && (value21.style.setProperty("--cds-skel-i", String(index4 % value20)), index4 += 1);
        setSkeletonMotion(current, value19.length === 0 ? "lockstep" : "wave");
      };
      callback4();
      let value18 = (0, runtime2.createSafeMutationObserver)(MutationObserver, callback4);
      return value18.observe(current, {
        childList: !0,
        subtree: !0
      }), () => value18.disconnect();
    }, [motion, value12]);
    let value17 = value5 ? (0, runtime2.cn)("block", className) : className;
    return value12 ? jsxW7.jsx(value4, {
      ref: callback,
      "data-cds": "SkeletonGroup",
      className: value17,
      children: jsxW7.jsx(runtime2.skeletonElementContext.Provider, {
        value: value3,
        children: jsxW7.jsx(runtime2.skeletonShownStoreContext.Provider, {
          value: value8,
          children
        })
      })
    }) : jsxW7.jsxs(value4, {
      ref: callback2,
      "data-cds": "SkeletonGroup",
      "data-motion": motion,
      "data-hold": value15 ? "delayed" : "none",
      "data-hold-reason": value15 ? void 0 : value14.none,
      "data-shown": value15 ? void 0 : "",
      role: decorative ? void 0 : "status",
      "aria-hidden": decorative ? !0 : void 0,
      className: value17,
      onAnimationEnd: (event) => {
        event.animationName === "cds-placeholder-reveal" && event.target === event.currentTarget && (event.currentTarget.style.setProperty("--cds-skel-settled", `${SKELETON_DURATION_LIMIT_MS}ms`), event.currentTarget.setAttribute("data-settled", ""));
      },
      onAnimationStart: (event) => {
        if (event.animationName === "cds-placeholder-reveal" && event.target === event.currentTarget) {
          event.currentTarget.setAttribute("data-shown", "");
          let element = event.currentTarget.querySelector("[data-skeleton-label]");
          element !== null && element.textContent === "" && (element.textContent = ref4.current.labelText), ref3.current || (ref3.current = !0, markSkeletonShownAfterCallback(ref4.current.onShown, value8));
        } else if (event.animationName === SKELETON_BREATHE_ANIMATION && event.target === event.currentTarget || event.animationName === SKELETON_SWEEP_ANIMATION && typeof event.target?.getAnimations == "function")
          synchronizeSkeletonAnimation(event.target, event.animationName);
        else if (event.animationName === SKELETON_BREATHE_ANIMATION && motion === "wave" && typeof event.target?.getAnimations == "function") {
          let target = event.target;
          synchronizeSkeletonAnimation(target, SKELETON_BREATHE_ANIMATION, (Number.parseInt(target.style.getPropertyValue("--cds-skel-i"), 10) || 0) * SKELETON_MINIMUM_HOLD_MS);
        }
      },
      children: [
        decorative ? null : jsxW7.jsx("span", {
          className: "sr-only",
          "data-skeleton-label": !0,
          children: value15 ? "" : value16
        }),
        motion === "sweep" ? jsxW7.jsx(value4, {
          "aria-hidden": !0,
          ref: callback3,
          className: "cds-skel-sweep-clip",
          style: {
            visibility: "hidden"
          },
          children: jsxW7.jsx(value4, {
            className: "cds-skel-sweep-band"
          })
        }) : null,
        jsxW7.jsx(runtime2.skeletonActiveContext.Provider, {
          value: !0,
          children: jsxW7.jsx(runtime2.skeletonElementContext.Provider, {
            value: value3,
            children: jsxW7.jsx(runtime2.skeletonShownStoreContext.Provider, {
              value: value8,
              children: jsxW7.jsx(value4, {
                "aria-hidden": !0,
                className: "contents",
                children
              })
            })
          })
        })
      ]
    });
  }
  function Skeleton({ width, height: height2, className, decorative = !1, as: as2 }) {
    let value = reactz6.useContext(runtime2.skeletonActiveContext), value2 = reactz6.useContext(runtime2.skeletonElementContext), value3 = skeletonElementTags[as2 ?? value2], value4 = value3 === "span" ? "block" : void 0, value5 = (0, runtime2.useTranslation)("loading", "Loading");
    return value ? jsxW7.jsx(value3, {
      "data-cds": "Skeleton",
      className: (0, runtime2.cn)(value4, "h-[1em] max-w-full rounded bg-[var(--cds-skeleton-base)]", className),
      style: {
        width,
        height: height2
      }
    }) : jsxW7.jsx(value3, {
      ref: scheduleShimmerSynchronization,
      "data-cds": "Skeleton",
      role: decorative ? void 0 : "status",
      "aria-hidden": decorative ? !0 : void 0,
      className: (0, runtime2.cn)(value4, "relative h-[1em] max-w-full overflow-hidden rounded bg-[var(--cds-skeleton-base)] after:absolute after:inset-0 after:animate-[cds-shimmer_2s_linear_infinite] after:bg-[linear-gradient(90deg,transparent,var(--cds-skeleton-sheen),transparent)] motion-reduce:after:hidden", className),
      style: {
        width,
        height: height2
      },
      children: decorative ? null : jsxW7.jsx("span", {
        className: "sr-only",
        children: value5
      })
    });
  }
  function SkeletonRows({ rows = 3, icon = !0 }) {
    let value = skeletonElementTags[reactz6.useContext(runtime2.skeletonElementContext)], value2 = value === "span" ? "block" : void 0, value3 = icon ? skeletonIconRowWidths : skeletonTextRowWidths, value4 = (typeof rows == "number" ? [rows] : rows).filter((input) => input > 0), value5 = value4.length > 0 ? value4 : [3], items = [], index4 = 0;
    for (let [value6, value7] of value5.entries()) {
      value6 > 0 && items.push(jsxW7.jsx(value, {
        "aria-hidden": !0,
        "data-slot": "menu-skeleton-separator",
        className: (0, runtime2.cn)(value2, "compact:mx-2 comfortable:mx-2.5 my-1 h-px bg-border")
      }, `separator-${value6}`));
      for (let value8 = index4 + value7; index4 < value8; index4++)
        items.push(jsxW7.jsxs(value, {
          "aria-hidden": index4 > 0 ? !0 : void 0,
          className: "flex h-control items-center gap-xs compact:px-2 comfortable:px-2.5",
          children: [
            icon && jsxW7.jsx(SkeletonPrimitive, {
              width: 20,
              height: 20
            }),
            jsxW7.jsx("span", {
              "aria-hidden": icon ? !0 : void 0,
              className: "contents",
              children: jsxW7.jsx(SkeletonPrimitive, {
                width: value3[index4 % value3.length],
                height: 16
              })
            })
          ]
        }, index4));
    }
    return jsxW7.jsx(value, {
      className: value2,
      children: items
    });
  }
  function SkeletonChip({ width = 120, shape = "pill" }) {
    return jsxW7.jsx(SkeletonPrimitive, {
      className: shape === "pill" ? "h-control shrink-0 rounded-full" : "h-control shrink-0 rounded",
      width
    });
  }
  function SkeletonLines({ lines = 8, className }) {
    let value = skeletonElementTags[reactz6.useContext(runtime2.skeletonElementContext)];
    return jsxW7.jsx(value, {
      className: (0, runtime2.cn)("flex flex-col gap-sm", className),
      children: Array.from({
        length: lines
      }, (input, options) => jsxW7.jsx("span", {
        "aria-hidden": options > 0 ? !0 : void 0,
        className: "contents",
        children: jsxW7.jsx(SkeletonPrimitive, {
          width: skeletonLineWidths[options % skeletonLineWidths.length],
          height: 14
        })
      }, options))
    });
  }
  function SkeletonBlock({ height: height2, className }) {
    return jsxW7.jsx(SkeletonPrimitive, {
      className,
      width: "100%",
      height: height2
    });
  }
  function useSurfaceStyle(input) {
    let value = (0, runtime2.useResolvedColorMode)();
    return {
      ...(0, runtime2.getSurfaceBackgroundStyle)(input),
      "--cds-focus-shadow": runtime2.focusShadowByMode[value],
      "--cds-focus-shadow-danger": runtime2.dangerFocusShadowByMode[value]
    };
  }
  return bindRuntimeValue(runtime2, "preventRepeatedClickSelection", () => preventRepeatedClickSelection), bindRuntimeValue(runtime2, "withRepeatedClickSelectionPrevention", () => withRepeatedClickSelectionPrevention), bindRuntimeValue(runtime2, "PRESERVE_INPUT_FOCUS_PROPS", () => PRESERVE_INPUT_FOCUS_PROPS, (value) => {
    PRESERVE_INPUT_FOCUS_PROPS = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure", () => initializeUiDisclosure, (value) => {
    initializeUiDisclosure = value;
  }), bindRuntimeValue(runtime2, "useHiddenUntilFoundRef", () => useHiddenUntilFoundRef), bindRuntimeValue(runtime2, "attachBeforeMatchStyleRecovery", () => attachBeforeMatchStyleRecovery), bindRuntimeValue(runtime2, "overrideInlineStyles", () => overrideInlineStyles), bindRuntimeValue(runtime2, "react_k", () => react_k, (value) => {
    react_k = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure2", () => initializeUiDisclosure2, (value) => {
    initializeUiDisclosure2 = value;
  }), bindRuntimeValue(runtime2, "reactForUiDisclosure", () => reactForUiDisclosure, (value) => {
    reactForUiDisclosure = value;
  }), bindRuntimeValue(runtime2, "DISCLOSURE_PANEL_CLASS", () => DISCLOSURE_PANEL_CLASS, (value) => {
    DISCLOSURE_PANEL_CLASS = value;
  }), bindRuntimeValue(runtime2, "isHeightTransitionAnimation", () => isHeightTransitionAnimation, (value) => {
    isHeightTransitionAnimation = value;
  }), bindRuntimeValue(runtime2, "observeDisclosureHeightAnimation", () => observeDisclosureHeightAnimation, (value) => {
    observeDisclosureHeightAnimation = value;
  }), bindRuntimeValue(runtime2, "useDisclosureAnimationRef", () => useDisclosureAnimationRef, (value) => {
    useDisclosureAnimationRef = value;
  }), bindRuntimeValue(runtime2, "useDisclosureBodyRef", () => useDisclosureBodyRef, (value) => {
    useDisclosureBodyRef = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure3", () => initializeUiDisclosure3, (value) => {
    initializeUiDisclosure3 = value;
  }), bindRuntimeValue(runtime2, "reactForUiDisclosure2", () => reactForUiDisclosure2, (value) => {
    reactForUiDisclosure2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiDisclosure", () => jsxForUiDisclosure, (value) => {
    jsxForUiDisclosure = value;
  }), bindRuntimeValue(runtime2, "CollapsibleRoot", () => CollapsibleRoot3, (value) => {
    CollapsibleRoot3 = value;
  }), bindRuntimeValue(runtime2, "COLLAPSIBLE_TRIGGER_CLASS", () => COLLAPSIBLE_TRIGGER_CLASS, (value) => {
    COLLAPSIBLE_TRIGGER_CLASS = value;
  }), bindRuntimeValue(runtime2, "COLLAPSIBLE_ICON_CLASS", () => COLLAPSIBLE_ICON_CLASS, (value) => {
    COLLAPSIBLE_ICON_CLASS = value;
  }), bindRuntimeValue(runtime2, "CollapsibleTrigger", () => CollapsibleTrigger3, (value) => {
    CollapsibleTrigger3 = value;
  }), bindRuntimeValue(runtime2, "COLLAPSIBLE_PANEL_CLASS", () => COLLAPSIBLE_PANEL_CLASS, (value) => {
    COLLAPSIBLE_PANEL_CLASS = value;
  }), bindRuntimeValue(runtime2, "CollapsiblePanel", () => CollapsiblePanel3, (value) => {
    CollapsiblePanel3 = value;
  }), bindRuntimeValue(runtime2, "Collapsible", () => Collapsible, (value) => {
    Collapsible = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure4", () => initializeUiDisclosure4, (value) => {
    initializeUiDisclosure4 = value;
  }), bindRuntimeValue(runtime2, "Spinner", () => Spinner), bindRuntimeValue(runtime2, "DelayedScreenReaderLabel", () => DelayedScreenReaderLabel), bindRuntimeValue(runtime2, "reactcK", () => reactcK, (value) => {
    reactcK = value;
  }), bindRuntimeValue(runtime2, "jsxEq", () => jsxEq, (value) => {
    jsxEq = value;
  }), bindRuntimeValue(runtime2, "spinnerSizeAliases", () => spinnerSizeAliases, (value) => {
    spinnerSizeAliases = value;
  }), bindRuntimeValue(runtime2, "spinnerSizeMetrics", () => spinnerSizeMetrics, (value) => {
    spinnerSizeMetrics = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure5", () => initializeUiDisclosure5, (value) => {
    initializeUiDisclosure5 = value;
  }), bindRuntimeValue(runtime2, "useCompactable", () => useCompactable), bindRuntimeValue(runtime2, "reactForUiDisclosure3", () => reactForUiDisclosure3, (value) => {
    reactForUiDisclosure3 = value;
  }), bindRuntimeValue(runtime2, "CompactableContext", () => CompactableContext, (value) => {
    CompactableContext = value;
  }), bindRuntimeValue(runtime2, "COMPACTABLE_ATTRIBUTE", () => COMPACTABLE_ATTRIBUTE, (value) => {
    COMPACTABLE_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure6", () => initializeUiDisclosure6, (value) => {
    initializeUiDisclosure6 = value;
  }), bindRuntimeValue(runtime2, "useCompactableControlDebug", () => useCompactableControlDebug), bindRuntimeValue(runtime2, "reacttq0", () => reacttq0, (value) => {
    reacttq0 = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure7", () => initializeUiDisclosure7, (value) => {
    initializeUiDisclosure7 = value;
  }), bindRuntimeValue(runtime2, "scheduleTooltipUpdate", () => scheduleTooltipUpdate), bindRuntimeValue(runtime2, "cancelTooltipUpdate", () => cancelTooltipUpdate), bindRuntimeValue(runtime2, "loadTooltipImplementation", () => loadTooltipImplementation), bindRuntimeValue(runtime2, "preloadTooltipsOnInteraction", () => preloadTooltipsOnInteraction), bindRuntimeValue(runtime2, "requestTooltipPreload", () => requestTooltipPreload), bindRuntimeValue(runtime2, "adoptTooltipTrigger", () => adoptTooltipTrigger), bindRuntimeValue(runtime2, "restoreDeferredTooltipFocus", () => restoreDeferredTooltipFocus), bindRuntimeValue(runtime2, "cancelTooltipTouchHold", () => cancelTooltipTouchHold), bindRuntimeValue(runtime2, "releaseTooltipTouchHold", () => releaseTooltipTouchHold), bindRuntimeValue(runtime2, "resolveTooltipImplementation", () => resolveTooltipImplementation), bindRuntimeValue(runtime2, "hasNonVisibleFocus", () => hasNonVisibleFocus), bindRuntimeValue(runtime2, "useDeferredTooltipImplementation", () => useDeferredTooltipImplementation), bindRuntimeValue(runtime2, "disableElementAutofocus", () => disableElementAutofocus), bindRuntimeValue(runtime2, "DeferredTooltip", () => DeferredTooltip), bindRuntimeValue(runtime2, "DeferredDisabledReasonTooltip", () => DeferredDisabledReasonTooltip), bindRuntimeValue(runtime2, "reactf6", () => reactf6, (value) => {
    reactf6 = value;
  }), bindRuntimeValue(runtime2, "jsxh3", () => jsxh3, (value) => {
    jsxh3 = value;
  }), bindRuntimeValue(runtime2, "loadedTooltipImplementation", () => loadedTooltipImplementation, (value) => {
    loadedTooltipImplementation = value;
  }), bindRuntimeValue(runtime2, "tooltipImplementationPromise", () => tooltipImplementationPromise, (value) => {
    tooltipImplementationPromise = value;
  }), bindRuntimeValue(runtime2, "tooltipImplementationListeners", () => tooltipImplementationListeners, (value) => {
    tooltipImplementationListeners = value;
  }), bindRuntimeValue(runtime2, "tooltipBatchTimer", () => tooltipBatchTimer, (value) => {
    tooltipBatchTimer = value;
  }), bindRuntimeValue(runtime2, "tooltipBatchCallbacks", () => tooltipBatchCallbacks, (value) => {
    tooltipBatchCallbacks = value;
  }), bindRuntimeValue(runtime2, "tooltipPreloadEvents", () => tooltipPreloadEvents, (value) => {
    tooltipPreloadEvents = value;
  }), bindRuntimeValue(runtime2, "tooltipPreloadStarted", () => tooltipPreloadStarted, (value) => {
    tooltipPreloadStarted = value;
  }), bindRuntimeValue(runtime2, "pendingTooltipProps", () => pendingTooltipProps, (value) => {
    pendingTooltipProps = value;
  }), bindRuntimeValue(runtime2, "TOUCH_TOOLTIP_HOLD_MS", () => TOUCH_TOOLTIP_HOLD_MS, (value) => {
    TOUCH_TOOLTIP_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "deferredTooltipImplementationContext", () => deferredTooltipImplementationContext, (value) => {
    deferredTooltipImplementationContext = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure8", () => initializeUiDisclosure8, (value) => {
    initializeUiDisclosure8 = value;
  }), bindRuntimeValue(runtime2, "isButtonActivationKey", () => isButtonActivationKey), bindRuntimeValue(runtime2, "isUnmodifiedButtonActivation", () => isUnmodifiedButtonActivation), bindRuntimeValue(runtime2, "useButtonGroup", () => useButtonGroup), bindRuntimeValue(runtime2, "getButtonIconSize", () => getButtonIconSize), bindRuntimeValue(runtime2, "useButtonIconSize", () => useButtonIconSize), bindRuntimeValue(runtime2, "getButtonIconVerticalPadding", () => getButtonIconVerticalPadding), bindRuntimeValue(runtime2, "reacttJ", () => reacttJ, (value) => {
    reacttJ = value;
  }), bindRuntimeValue(runtime2, "jsxForUiDisclosure2", () => jsxForUiDisclosure2, (value) => {
    jsxForUiDisclosure2 = value;
  }), bindRuntimeValue(runtime2, "stopEvent", () => stopEvent2, (value) => {
    stopEvent2 = value;
  }), bindRuntimeValue(runtime2, "BUTTON_ON_ACCENT_TEXT_CLASS", () => BUTTON_ON_ACCENT_TEXT_CLASS, (value) => {
    BUTTON_ON_ACCENT_TEXT_CLASS = value;
  }), bindRuntimeValue(runtime2, "BUTTON_END_ICON_OFFSET_CLASS", () => BUTTON_END_ICON_OFFSET_CLASS, (value) => {
    BUTTON_END_ICON_OFFSET_CLASS = value;
  }), bindRuntimeValue(runtime2, "buttonVariants", () => buttonVariants, (value) => {
    buttonVariants = value;
  }), bindRuntimeValue(runtime2, "BUTTON_ON_CONTENT_FILL_CLASS", () => BUTTON_ON_CONTENT_FILL_CLASS, (value) => {
    BUTTON_ON_CONTENT_FILL_CLASS = value;
  }), bindRuntimeValue(runtime2, "buttonPaintVariants", () => buttonPaintVariants, (value) => {
    buttonPaintVariants = value;
  }), bindRuntimeValue(runtime2, "buttonGroupContext", () => buttonGroupContext, (value) => {
    buttonGroupContext = value;
  }), bindRuntimeValue(runtime2, "BUTTON_SEGMENT_RADIUS_CLASSES", () => BUTTON_SEGMENT_RADIUS_CLASSES, (value) => {
    BUTTON_SEGMENT_RADIUS_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BUTTON_OUTSET_CLASSES", () => BUTTON_OUTSET_CLASSES, (value) => {
    BUTTON_OUTSET_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BUTTON_OUTSET_STYLES", () => BUTTON_OUTSET_STYLES, (value) => {
    BUTTON_OUTSET_STYLES = value;
  }), bindRuntimeValue(runtime2, "buttonIconSizeContext", () => buttonIconSizeContext, (value) => {
    buttonIconSizeContext = value;
  }), bindRuntimeValue(runtime2, "Button", () => Button3, (value) => {
    Button3 = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure9", () => initializeUiDisclosure9, (value) => {
    initializeUiDisclosure9 = value;
  }), bindRuntimeValue(runtime2, "isShimmerAnimation", () => isShimmerAnimation), bindRuntimeValue(runtime2, "synchronizeDocumentShimmers", () => synchronizeDocumentShimmers), bindRuntimeValue(runtime2, "flushShimmerSynchronization", () => flushShimmerSynchronization), bindRuntimeValue(runtime2, "scheduleShimmerSynchronization", () => scheduleShimmerSynchronization), bindRuntimeValue(runtime2, "createSkeletonShownStore", () => createSkeletonShownStore), bindRuntimeValue(runtime2, "markSkeletonShownAfterCallback", () => markSkeletonShownAfterCallback), bindRuntimeValue(runtime2, "clearSkeletonElapsedStyle", () => clearSkeletonElapsedStyle), bindRuntimeValue(runtime2, "setSkeletonMotion", () => setSkeletonMotion), bindRuntimeValue(runtime2, "ensurePositionedSkeletonHost", () => ensurePositionedSkeletonHost), bindRuntimeValue(runtime2, "synchronizeSkeletonAnimation", () => synchronizeSkeletonAnimation), bindRuntimeValue(runtime2, "SkeletonGroup", () => SkeletonGroup), bindRuntimeValue(runtime2, "Skeleton", () => Skeleton), bindRuntimeValue(runtime2, "SkeletonRows", () => SkeletonRows), bindRuntimeValue(runtime2, "SkeletonChip", () => SkeletonChip), bindRuntimeValue(runtime2, "SkeletonLines", () => SkeletonLines), bindRuntimeValue(runtime2, "SkeletonBlock", () => SkeletonBlock), bindRuntimeValue(runtime2, "reactz6", () => reactz6, (value) => {
    reactz6 = value;
  }), bindRuntimeValue(runtime2, "jsxW7", () => jsxW7, (value) => {
    jsxW7 = value;
  }), bindRuntimeValue(runtime2, "skeletonElementTags", () => skeletonElementTags, (value) => {
    skeletonElementTags = value;
  }), bindRuntimeValue(runtime2, "pendingShimmerElements", () => pendingShimmerElements, (value) => {
    pendingShimmerElements = value;
  }), bindRuntimeValue(runtime2, "shimmerStartTimes", () => shimmerStartTimes, (value) => {
    shimmerStartTimes = value;
  }), bindRuntimeValue(runtime2, "skeletonNotShownSnapshot", () => skeletonNotShownSnapshot, (value) => {
    skeletonNotShownSnapshot = value;
  }), bindRuntimeValue(runtime2, "skeletonShownSnapshot", () => skeletonShownSnapshot, (value) => {
    skeletonShownSnapshot = value;
  }), bindRuntimeValue(runtime2, "SKELETON_BREATHE_ANIMATION", () => SKELETON_BREATHE_ANIMATION, (value) => {
    SKELETON_BREATHE_ANIMATION = value;
  }), bindRuntimeValue(runtime2, "SKELETON_SWEEP_ANIMATION", () => SKELETON_SWEEP_ANIMATION, (value) => {
    SKELETON_SWEEP_ANIMATION = value;
  }), bindRuntimeValue(runtime2, "SKELETON_ANIMATION_DURATION_MS", () => SKELETON_ANIMATION_DURATION_MS, (value) => {
    SKELETON_ANIMATION_DURATION_MS = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_SKELETON_MOTION", () => DEFAULT_SKELETON_MOTION, (value) => {
    DEFAULT_SKELETON_MOTION = value;
  }), bindRuntimeValue(runtime2, "SKELETON_MINIMUM_HOLD_MS", () => SKELETON_MINIMUM_HOLD_MS, (value) => {
    SKELETON_MINIMUM_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "SKELETON_DURATION_LIMIT_MS", () => SKELETON_DURATION_LIMIT_MS, (value) => {
    SKELETON_DURATION_LIMIT_MS = value;
  }), bindRuntimeValue(runtime2, "SKELETON_SYNC_TOLERANCE_MS", () => SKELETON_SYNC_TOLERANCE_MS, (value) => {
    SKELETON_SYNC_TOLERANCE_MS = value;
  }), bindRuntimeValue(runtime2, "skeletonAnimationStartTimes", () => skeletonAnimationStartTimes, (value) => {
    skeletonAnimationStartTimes = value;
  }), bindRuntimeValue(runtime2, "skeletonIconRowWidths", () => skeletonIconRowWidths, (value) => {
    skeletonIconRowWidths = value;
  }), bindRuntimeValue(runtime2, "skeletonTextRowWidths", () => skeletonTextRowWidths, (value) => {
    skeletonTextRowWidths = value;
  }), bindRuntimeValue(runtime2, "skeletonLineWidths", () => skeletonLineWidths, (value) => {
    skeletonLineWidths = value;
  }), bindRuntimeValue(runtime2, "SkeletonPrimitive", () => SkeletonPrimitive, (value) => {
    SkeletonPrimitive = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure10", () => initializeUiDisclosure10, (value) => {
    initializeUiDisclosure10 = value;
  }), bindRuntimeValue(runtime2, "useSurfaceStyle", () => useSurfaceStyle), bindRuntimeValue(runtime2, "reactForUiDisclosure4", () => reactForUiDisclosure4, (value) => {
    reactForUiDisclosure4 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiDisclosure3", () => jsxForUiDisclosure3, (value) => {
    jsxForUiDisclosure3 = value;
  }), bindRuntimeValue(runtime2, "Surface", () => Surface, (value) => {
    Surface = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure11", () => initializeUiDisclosure11, (value) => {
    initializeUiDisclosure11 = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_SURFACE_CLASS", () => TEXT_INPUT_SURFACE_CLASS, (value) => {
    TEXT_INPUT_SURFACE_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_HOVER_CLASS", () => TEXT_INPUT_HOVER_CLASS, (value) => {
    TEXT_INPUT_HOVER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_CLASS", () => TEXT_INPUT_CLASS, (value) => {
    TEXT_INPUT_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_REQUIRED_CLASS", () => TEXT_INPUT_REQUIRED_CLASS, (value) => {
    TEXT_INPUT_REQUIRED_CLASS = value;
  }), bindRuntimeValue(runtime2, "fieldFocusClasses", () => fieldFocusClasses, (value) => {
    fieldFocusClasses = value;
  }), bindRuntimeValue(runtime2, "fieldFocusWithinClasses", () => fieldFocusWithinClasses, (value) => {
    fieldFocusWithinClasses = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_PLACEHOLDER_CLASS", () => TEXT_INPUT_PLACEHOLDER_CLASS, (value) => {
    TEXT_INPUT_PLACEHOLDER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_INVALID_CLASS", () => TEXT_INPUT_INVALID_CLASS, (value) => {
    TEXT_INPUT_INVALID_CLASS = value;
  }), bindRuntimeValue(runtime2, "initializeUiDisclosure12", () => initializeUiDisclosure12, (value) => {
    initializeUiDisclosure12 = value;
  }), bindRuntimeValue(runtime2, "staysSecondaryTextClasses", () => staysSecondaryTextClasses, (value) => {
    staysSecondaryTextClasses = value;
  }), () => {
    initializeUiDisclosure = (0, runtime2.initializeOnce)(() => {
      PRESERVE_INPUT_FOCUS_PROPS = Object.freeze({
        onMouseDown: preventRepeatedClickSelection
      });
    }), initializeUiDisclosure2 = (0, runtime2.initializeOnce)(() => {
      react_k = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), DISCLOSURE_PANEL_CLASS = "break-words h-[var(--cds-disclosure-panel-height)] transition-[height] duration-base ease-out motion-reduce:transition-none data-[starting-style]:h-0 data-[ending-style]:h-0 data-[starting-style]:[clip-path:inset(-8px_-100vw_0_-100vw)] data-[ending-style]:[clip-path:inset(-8px_-100vw_0_-100vw)] data-[animating]:[clip-path:inset(-8px_-100vw_0_-100vw)] data-[starting-style]:contain-layout data-[ending-style]:contain-layout data-[animating]:contain-layout", isHeightTransitionAnimation = (animation) => "transitionProperty" in animation && animation.transitionProperty === "height", observeDisclosureHeightAnimation = (element) => {
      let callback = () => {
        let value2 = element.hasAttribute("data-starting-style") || element.hasAttribute("data-ending-style") || (element.getAnimations?.().some(isHeightTransitionAnimation) ?? !1);
        element.toggleAttribute("data-animating", value2);
      }, value = new (element.ownerDocument.defaultView?.MutationObserver ?? MutationObserver)(callback);
      value.observe(element, {
        attributeFilter: ["data-starting-style", "data-ending-style"]
      }), callback();
      let callback2 = (event) => {
        event.target === element && event.propertyName === "height" && element.setAttribute("data-animating", "");
      }, callback3 = (event) => {
        event.target === element && event.propertyName === "height" && callback();
      };
      return element.addEventListener("transitionrun", callback2), element.addEventListener("transitionend", callback3), element.addEventListener("transitioncancel", callback3), () => {
        value.disconnect(), element.removeEventListener("transitionrun", callback2), element.removeEventListener("transitionend", callback3), element.removeEventListener("transitioncancel", callback3), element.removeAttribute("data-animating");
      };
    }, useDisclosureAnimationRef = () => {
      let ref = reactForUiDisclosure.useRef(null);
      return reactForUiDisclosure.useCallback((input) => {
        ref.current?.(), ref.current = input ? observeDisclosureHeightAnimation(input) : null;
      }, []);
    }, useDisclosureBodyRef = (ref) => (0, runtime2.useMergedRefs)(ref, useDisclosureAnimationRef(), useHiddenUntilFoundRef()), initializeUiDisclosure3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeMergedRefs)(), initializeUiDisclosure2(), reactForUiDisclosure = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), COLLAPSIBLE_TRIGGER_CLASS = "cds-reset group/clp inline-flex w-fit items-center gap-1.5 border-0 select-none outline-none focus-visible:outline-hidden font-sans text-body font-normal font-control text-secondary hover:text-primary transition-shadow duration-fast focus-visible:shadow-focus rounded data-[disabled]:opacity-disabled data-[disabled]:pointer-events-none", COLLAPSIBLE_ICON_CLASS = "shrink-0 transition-transform group-data-[panel-open]/clp:rotate-90 group-data-[panel-open]/clp:page-rtl:-rotate-90", initializeUiDisclosure4 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), initializeUiDisclosure(), initializeUiDisclosure3(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactForUiDisclosure2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiDisclosure = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CollapsibleRoot3 = reactForUiDisclosure2.forwardRef((input, options) => jsxForUiDisclosure.jsx(runtime2.baseCollapsible.Root, {
        ref: options,
        "data-cds": "Collapsible",
        ...input
      })), CollapsibleRoot3.displayName = "Collapsible.Root", CollapsibleTrigger3 = reactForUiDisclosure2.forwardRef(({ className, children, caretPosition, hideCaret, render, ...props }, options) => {
        let value = withRepeatedClickSelectionPrevention(props.onMouseDown), value2 = hideCaret ? null : jsxForUiDisclosure.jsx(runtime2.Icon, {
          name: "CaretRight",
          size: "sm",
          className: (0, runtime2.clsx)(COLLAPSIBLE_ICON_CLASS, caretPosition === "end" && "ms-auto")
        });
        return render ? jsxForUiDisclosure.jsx(runtime2.baseCollapsible.Trigger, {
          ref: options,
          render,
          className,
          ...props,
          onMouseDown: value
        }) : jsxForUiDisclosure.jsxs(runtime2.baseCollapsible.Trigger, {
          ref: options,
          ...props,
          className: (0, runtime2.cn)(COLLAPSIBLE_TRIGGER_CLASS, className),
          onMouseDown: value,
          children: [
            caretPosition !== "end" && value2,
            children,
            caretPosition === "end" && value2
          ]
        });
      }), CollapsibleTrigger3.displayName = "Collapsible.Trigger", COLLAPSIBLE_PANEL_CLASS = `${DISCLOSURE_PANEL_CLASS} [--cds-disclosure-panel-height:var(--collapsible-panel-height)]`, CollapsiblePanel3 = reactForUiDisclosure2.forwardRef(({ className, ...props }, options) => {
        let value = useDisclosureBodyRef(options);
        return jsxForUiDisclosure.jsx(runtime2.baseCollapsible.Panel, {
          ref: value,
          ...props,
          className: (0, runtime2.cn)(COLLAPSIBLE_PANEL_CLASS, className)
        });
      }), CollapsiblePanel3.displayName = "Collapsible.Panel", Collapsible = {
        Root: CollapsibleRoot3,
        Trigger: CollapsibleTrigger3,
        Panel: CollapsiblePanel3
      };
    }), initializeUiDisclosure5 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeRemScale)(), reactcK = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxEq = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), spinnerSizeAliases = {
        s: "sm",
        m: "md",
        l: "lg"
      }, spinnerSizeMetrics = {
        sm: {
          box: 12,
          stroke: 1.5
        },
        md: {
          box: 16,
          stroke: 1.75
        },
        lg: {
          box: 20,
          stroke: 2
        }
      };
    }), COMPACTABLE_ATTRIBUTE = "data-cds-compactable", initializeUiDisclosure6 = (0, runtime2.initializeOnce)(() => {
      reactForUiDisclosure3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), CompactableContext = reactForUiDisclosure3.createContext({
        compact: !1
      });
    }), initializeUiDisclosure7 = (0, runtime2.initializeOnce)(() => {
      reacttq0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), loadedTooltipImplementation = null, tooltipImplementationPromise = null, tooltipBatchTimer = null, tooltipPreloadStarted = !1, TOUCH_TOOLTIP_HOLD_MS = 700, initializeUiDisclosure8 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeDisabledReason)(), (0, runtime2.initializeTooltipContext)(), reactf6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxh3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactDomForTooltipBatch = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), tooltipImplementationListeners = /* @__PURE__ */ new Set(), tooltipBatchCallbacks = /* @__PURE__ */ new Set(), tooltipPreloadEvents = ["pointermove", "keydown", "touchstart"], pendingTooltipProps = {
        "data-cds-tooltip-pending": ""
      }, deferredTooltipImplementationContext = reactf6.createContext(null);
    }), stopEvent2 = (event) => {
      event.preventDefault(), event.stopPropagation();
    }, BUTTON_ON_ACCENT_TEXT_CLASS = "text-primary font-medium font-control focus-visible:shadow-[0_0_0_2px_var(--cds-gray-0),0_0_0_4px_var(--cds-role-accent-700)] [&[data-initial-focus]:focus]:shadow-[0_0_0_2px_var(--cds-gray-0),0_0_0_4px_var(--cds-role-accent-700)]", BUTTON_END_ICON_OFFSET_CLASS = "me-[calc((var(--cds-h-control)-1em-6px)/2-var(--cds-pad-md))]", BUTTON_ON_CONTENT_FILL_CLASS = "bg-[var(--cds-button-on-content)] backdrop-blur-md shadow-[inset_0_0_0_1px_var(--cds-button-on-content-ring)] group-focus-visible/btn:!shadow-[inset_0_0_0_1px_var(--cds-button-on-content-ring)] group-[[data-initial-focus]:focus]/btn:!shadow-[inset_0_0_0_1px_var(--cds-button-on-content-ring)] group-hover/btn:bg-[var(--cds-button-on-content-hover)] group-[[aria-haspopup][aria-expanded=true]]/btn:bg-[var(--cds-button-on-content-hover)]", initializeBusyButtonGuard = (0, runtime2.initializeOnce)(() => {
      busyButtonGuardDocuments = /* @__PURE__ */ new WeakSet();
    }), initializeUiDisclosure9 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsLink)(), (0, runtime2.initializeCdsRoot)(), initializeUiDisclosure(), (0, runtime2.initializeRemScale)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeShortcuts)(), (0, runtime2.initializeFeatureFlags)(), (0, runtime2.initializeButtonVariantClasses)(), (0, runtime2.initializeDisabledReasonDebug)(), (0, runtime2.initializeTooltipContext)(), initializeUiDisclosure6(), initializeUiDisclosure7(), initializeUiDisclosure5(), initializeUiDisclosure8(), initializeBusyButtonGuard(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reacttJ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiDisclosure2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), buttonVariants = (0, runtime2.cva)("cds-reset group/btn relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap select-none cursor-[var(--cds-cursor-interactive)] aria-disabled:cursor-default data-[disabled]:cursor-default border-0 outline-none focus-visible:outline-hidden [&[data-initial-focus]:focus]:outline-hidden rounded h-control font-sans text-body [&:disabled:not([aria-busy])]:opacity-disabled disabled:pointer-events-none transition-shadow duration-fast", {
        variants: {
          variant: {
            primary: `text-on-primary font-medium font-control [--cds-shortcut-cap-ink:currentColor] ${runtime2.buttonFocusClasses}`,
            secondary: `text-primary font-normal font-control aria-pressed:text-accent ${runtime2.buttonFocusClasses}`,
            ghost: `text-primary font-normal font-control aria-pressed:text-accent ${runtime2.buttonFocusClasses}`,
            danger: `text-on-danger font-medium font-control [--cds-shortcut-cap-ink:currentColor] ${runtime2.dangerButtonFocusClasses}`,
            brand: `text-on-brand font-medium font-control [--cds-shortcut-cap-ink:currentColor] ${runtime2.buttonFocusClasses}`,
            accent: `text-primary font-normal font-control aria-pressed:text-accent ${runtime2.buttonFocusClasses}`,
            onContent: BUTTON_ON_ACCENT_TEXT_CLASS,
            onAccent: BUTTON_ON_ACCENT_TEXT_CLASS
          },
          iconOnly: {
            true: "aspect-square w-control px-0",
            false: "px-md"
          }
        },
        defaultVariants: {
          variant: "secondary",
          iconOnly: !1
        }
      }), buttonPaintVariants = (0, runtime2.cva)(runtime2.buttonFillLayerClasses, {
        variants: {
          variant: {
            primary: "bg-fill-primary group-hover/btn:bg-fill-primary-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-primary-hover",
            secondary: runtime2.secondaryButtonFillClasses,
            ghost: "bg-transparent group-hover/btn:bg-fill-ghost-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-ghost-hover",
            danger: "bg-fill-danger group-hover/btn:bg-fill-danger-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-danger-hover",
            brand: "bg-fill-brand group-hover/btn:bg-fill-brand-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-brand-hover",
            accent: runtime2.secondaryButtonFillClasses,
            onContent: BUTTON_ON_CONTENT_FILL_CLASS,
            onAccent: BUTTON_ON_CONTENT_FILL_CLASS
          }
        },
        defaultVariants: {
          variant: "secondary"
        }
      }), buttonGroupContext = reacttJ.createContext(null), BUTTON_SEGMENT_RADIUS_CLASSES = {
        start: "rounded-e-none",
        end: "rounded-s-none",
        middle: "rounded-none"
      }, BUTTON_OUTSET_CLASSES = {
        start: "ms-outset",
        end: "me-outset",
        both: "mx-outset"
      }, BUTTON_OUTSET_STYLES = {
        "--cds-outset-x": "var(--cds-pad-md)"
      }, BUTTON_PANELS_OUTSET_STYLES = {
        "--cds-outset-x": "min(var(--cds-pad-md), var(--cds-button-pad-max, var(--cds-pad-md)))"
      }, buttonIconSizeContext = reacttJ.createContext(void 0), Button3 = reacttJ.forwardRef(({ variant, size: size4, icon, iconOnly = !1, iconPosition = "start", tooltip, tooltipSide, indicator, shortcut, hideShortcut = !1, busy = !1, busyLabel, pressed: pressed3, pressedVariant, flush = !1, style, disabled: disabled2, disabledReason, disabledReasonSide, type, href, routerOptions, target, rel, download, render, className, children, "aria-label": ariaLabel, ...props }, options) => {
        let value = useButtonGroup(), value2 = value?.joined;
        value && (size4 = size4 ?? value.size, value.enforceVariant ? variant = value.buttonVariant : variant = variant ?? value.buttonVariant);
        let value3 = variant ?? "secondary", stacksFill = runtime2.stacksButtonFillClasses[value3], isAccent = value3 === "accent", joinsFill = (value3 === "secondary" || isAccent) && !value2, value4 = useCompactable(), value5 = iconOnly === !0 ? void 0 : value4.icon, value6 = value5 !== void 0 && value4.compact, value7 = iconOnly === !0 || value6, value8 = value6 ? value5 : icon, value9 = value6 ? jsxForUiDisclosure2.jsx("span", {
          "data-cds-part": "compact-name",
          className: "contents",
          children
        }) : null, value10 = flush === !0 ? "start" : flush === !1 ? void 0 : flush, value11 = value10 !== void 0 && Object.hasOwn(BUTTON_OUTSET_CLASSES, value10) ? value10 : void 0, value12 = value11 !== void 0 && !value2 && value3 === "ghost" ? value11 : void 0, featureFlags = (0, runtime2.useFeatureFlagAttribute)(), panelsPart = (0, runtime2.hasFeatureFlagPart)(featureFlags, "panels"), selectedPressed = pressedVariant === "selected", selectedGhost = selectedPressed && value3 === "ghost" && href === void 0 && (0, runtime2.hasFeatureFlagPart)(featureFlags, "color"), selectedButton = selectedPressed && href === void 0, shownIcon = pressed3 === !0 && !selectedPressed && value3 === "ghost" && href === void 0 && (0, runtime2.hasFeatureFlagPart)(featureFlags, "color") && (0, runtime2.isIconName)(value8) ? (0, runtime2.filledIconName)(value8) : value8, activeClasses = pressed3 === !0 || props["aria-pressed"] === !0 || props["aria-pressed"] === "true" ? "" : runtime2.stacksButtonActiveClasses[value3] ?? "", pressedClasses = selectedGhost ? runtime2.stacksGhostPressedFillClasses : value3 === "secondary" || value3 === "ghost" ? runtime2.stacksAccentPressedHoverClasses : selectedButton && value3 === "danger" ? runtime2.stacksDangerPressedFillClasses : isAccent ? runtime2.stacksAccentPressedFillClasses : "", value13 = (0, runtime2.useAppleKeyboard)(), ref = reacttJ.useRef(null);
        useCompactableControlDebug(ref, "Button");
        let value14 = useButtonIconSize(size4), value15 = value7 && shownIcon ? (0, runtime2.isIconName)(shownIcon) ? jsxForUiDisclosure2.jsx(runtime2.Icon, {
          name: shownIcon,
          size: value14
        }) : shownIcon : null, value16 = (0, runtime2.useTooltipsDisabled)(), value17 = value7 && ariaLabel && tooltip !== !1 || value5 !== void 0, value18 = value5 !== void 0 ? value6 ? value9 : void 0 : typeof tooltip == "string" ? tooltip : ariaLabel, value19 = href === void 0 && !!disabled2 && !!disabledReason, value20 = href === void 0 && render === void 0, value21 = busy && value20, squishPaint = (element) => {
          let paintParent = ref.current?.parentElement;
          paintParent && !value2 && setPressSquishScale(paintParent, getButtonPressInset(element.offsetHeight), "--cds-btn-press-sx", "--cds-btn-press-sy");
        }, onPointerDownCapture = (event) => {
          squishPaint(event.currentTarget), props.onPointerDownCapture?.(event);
        }, callback = (event) => {
          if (isButtonActivationKey(event)) {
            if (value21 && isUnmodifiedButtonActivation(event)) {
              event.preventDefault(), event.stopPropagation();
              return;
            }
            event.key === " " && !event.repeat && squishPaint(event.currentTarget), event.repeat && value20 && event.preventDefault();
          }
          props.onKeyDown?.(event);
        }, callback2 = (event) => {
          if (value21 && isUnmodifiedButtonActivation(event)) {
            event.preventDefault(), event.stopPropagation();
            return;
          }
          props.onKeyUp?.(event);
        }, onFocus = (event) => {
          value20 && installBusyButtonGuard(event.currentTarget.ownerDocument), props.onFocus?.(event);
        }, value22 = value12 === void 0 ? void 0 : value7 ? {
          "--cds-outset-x": getButtonIconVerticalPadding(value14)
        } : panelsPart ? BUTTON_PANELS_OUTSET_STYLES : BUTTON_OUTSET_STYLES, value23 = (0, runtime2.cn)(buttonVariants({
          variant,
          iconOnly: value7
        }), panelsPart ? runtime2.buttonRadiusClasses : "", panelsPart && !value7 ? runtime2.buttonPaddingClasses : "", selectedGhost ? runtime2.buttonPressedTextClasses : "", value3 === "danger" ? runtime2.stacksDangerButtonTextClasses : "", isAccent ? runtime2.stacksAccentButtonTextClasses : "", value21 ? "pointer-events-none" : "", stacksFill === void 0 ? "" : runtime2.stacksDisabledButtonClasses, value12 ? BUTTON_OUTSET_CLASSES[value12] : "", value2 && value3 !== "ghost" ? BUTTON_SEGMENT_RADIUS_CLASSES[value2] : "", className), renderIconWithIndicator = (iconNode, offsetClass) => renderButtonIndicator((0, runtime2.isIconName)(iconNode) ? jsxForUiDisclosure2.jsx(runtime2.Icon, {
          name: iconNode,
          size: value14
        }) : jsxForUiDisclosure2.jsx("span", {
          className: "flex",
          children: iconNode
        }), indicator, offsetClass), value24 = jsxForUiDisclosure2.jsxs(jsxForUiDisclosure2.Fragment, {
          children: [
            jsxForUiDisclosure2.jsx("span", {
              "aria-hidden": !0,
              className: `${(0, runtime2.getButtonBackgroundLayerClasses)({
                joined: !!value2,
                solid: value3 === "primary" || value3 === "danger" || value3 === "brand"
              })}${(value3 === "primary" || value3 === "danger") && !value2 ? ` ${runtime2.stacksButtonInsetClasses}` : ""}${value2 ? "" : ` ${runtime2.stacksNoTransformClasses}`}`,
              children: jsxForUiDisclosure2.jsx("span", {
                ref,
                "data-cds-part": "paint",
                className: `${buttonPaintVariants({
                  variant: value3
                })} ${selectedGhost ? runtime2.ghostButtonPressedFillClasses : runtime2.buttonPressedFillClasses} ${joinsFill ? runtime2.buttonJoinedFillClasses : ""} ${stacksFill ?? ""} ${pressedClasses} ${activeClasses} ${joinsFill ? runtime2.stacksButtonNoShadowClasses : ""}`
              })
            }),
            jsxForUiDisclosure2.jsx("span", {
              className: `inline-flex min-w-0 items-center gap-1 ${busy ? "opacity-0" : ""}`,
              children: jsxForUiDisclosure2.jsx(buttonIconSizeContext.Provider, {
                value: value14,
                children: value15 ? jsxForUiDisclosure2.jsxs(jsxForUiDisclosure2.Fragment, {
                  children: [
                    indicator ? renderButtonIndicator(value15, indicator) : value15,
                    value6 ? jsxForUiDisclosure2.jsx("span", {
                      className: "sr-only",
                      children: value9
                    }) : null
                  ]
                }) : jsxForUiDisclosure2.jsxs(jsxForUiDisclosure2.Fragment, {
                  children: [
                    shownIcon && iconPosition === "start" && (indicator ? renderIconWithIndicator(shownIcon, "-ms-1") : (0, runtime2.isIconName)(shownIcon) ? jsxForUiDisclosure2.jsx(runtime2.Icon, {
                      name: shownIcon,
                      size: value14,
                      className: "-ms-1"
                    }) : jsxForUiDisclosure2.jsx("span", {
                      className: "-ms-1 inline-flex",
                      children: shownIcon
                    })),
                    children,
                    shownIcon && iconPosition === "end" && (indicator ? renderIconWithIndicator(shownIcon, "-me-1") : (0, runtime2.isIconName)(shownIcon) ? jsxForUiDisclosure2.jsx(runtime2.Icon, {
                      name: shownIcon,
                      size: value14,
                      className: "-me-1"
                    }) : jsxForUiDisclosure2.jsx("span", {
                      className: "-me-1 inline-flex",
                      children: shownIcon
                    })),
                    shortcut && jsxForUiDisclosure2.jsx(runtime2.Shortcut, {
                      keys: shortcut,
                      "aria-hidden": !0,
                      className: (0, runtime2.clsx)("pointer-coarse:hidden ms-1", hideShortcut && "invisible", (!value2 || value2 === "end") && (panelsPart ? BUTTON_PANELS_END_ICON_OFFSET_CLASS : BUTTON_END_ICON_OFFSET_CLASS))
                    })
                  ]
                })
              })
            }),
            busy && jsxForUiDisclosure2.jsx("span", {
              className: "absolute inset-0 grid place-items-center leading-[0]",
              children: jsxForUiDisclosure2.jsx(Spinner, {
                size: "sm",
                inheritColor: !0,
                label: busyLabel
              })
            })
          ]
        }), value25 = (0, runtime2.useCdsLink)({
          href,
          routerOptions,
          target,
          rel,
          download,
          ...(0, runtime2.pickLinkEventProps)(props)
        }), value26 = (0, runtime2.baseUseRender)({
          render: render ?? (href !== void 0 ? (renderProps) => jsxForUiDisclosure2.jsx("a", { ...renderProps }) : (renderProps) => jsxForUiDisclosure2.jsx("button", {
            type: type ?? "button",
            disabled: disabled2,
            ...renderProps
          })),
          ref: options,
          props: {
            "data-cds": "Button",
            ...value7 ? {
              "data-cds-icon-only": ""
            } : void 0,
            ...value5 !== void 0 ? {
              [COMPACTABLE_ATTRIBUTE]: ""
            } : void 0,
            ...value3 === "ghost" ? {
              "data-cds-ghost": ""
            } : void 0,
            ...selectedGhost ? {
              "data-cds-pressed-variant": pressedVariant
            } : void 0,
            ...size4 === "xxs" ? {
              "data-step": "1"
            } : (0, runtime2.getControlSizeAttributes)(size4),
            className: value23,
            style: value22 ? {
              ...value22,
              ...style
            } : style,
            "aria-busy": busy || void 0,
            "aria-pressed": href === void 0 ? pressed3 : void 0,
            "aria-disabled": value21 || void 0,
            "aria-label": ariaLabel,
            "aria-keyshortcuts": shortcut && !hideShortcut ? (0, runtime2.shortcutToAriaKeyShortcuts)(shortcut, value13) : void 0,
            children: value24,
            ...props,
            onMouseDown: withRepeatedClickSelectionPrevention(props.onMouseDown),
            onClick: value21 ? stopEvent2 : props.onClick,
            onFocus,
            onKeyDown: callback,
            onKeyUp: callback2,
            onPointerDownCapture,
            ...href !== void 0 ? value25 : void 0
          }
        }), value27 = value17 ? jsxForUiDisclosure2.jsx(DeferredTooltip, {
          side: tooltipSide,
          hoverable: !1,
          content: value16 || value19 ? void 0 : value18,
          shortcut: hideShortcut ? void 0 : shortcut,
          children: value26
        }) : value26;
        return disabledReason === void 0 || href !== void 0 ? value27 : jsxForUiDisclosure2.jsx(DeferredDisabledReasonTooltip, {
          side: disabledReasonSide,
          reason: value19 ? disabledReason : void 0,
          children: value27
        });
      }), Button3.displayName = "Button";
    }), SKELETON_BREATHE_ANIMATION = "cds-skeleton-breathe", SKELETON_SWEEP_ANIMATION = "cds-skeleton-sweep", SKELETON_ANIMATION_DURATION_MS = 2e3, DEFAULT_SKELETON_MOTION = "wave", SKELETON_MINIMUM_HOLD_MS = 90, SKELETON_DURATION_LIMIT_MS = 1e5, SKELETON_SYNC_TOLERANCE_MS = 1, initializeUiDisclosure10 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeErrorReporting)(), (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeResizeObserverAccess)(), (0, runtime2.initializeSkeletonContexts)(), reactz6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxW7 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), skeletonElementTags = {
        div: "div",
        span: "span"
      }, pendingShimmerElements = /* @__PURE__ */ new Set(), shimmerStartTimes = /* @__PURE__ */ new WeakMap(), skeletonNotShownSnapshot = Object.freeze({
        shown: !1
      }), skeletonShownSnapshot = Object.freeze({
        shown: !0
      }), skeletonAnimationStartTimes = /* @__PURE__ */ new WeakMap(), skeletonIconRowWidths = [160, 128, 144], skeletonTextRowWidths = [120, 88, 104], SkeletonRows.displayName = "Skeleton.Rows", SkeletonChip.displayName = "Skeleton.Chip", skeletonLineWidths = ["92%", "100%", "96%", "58%"], SkeletonLines.displayName = "Skeleton.Lines", SkeletonBlock.displayName = "Skeleton.Block", Skeleton.displayName = "Skeleton", SkeletonGroup.displayName = "SkeletonGroup", SkeletonPrimitive = Object.assign(Skeleton, {
        Rows: SkeletonRows,
        Chip: SkeletonChip,
        Lines: SkeletonLines,
        Block: SkeletonBlock
      });
    }), initializeUiDisclosure11 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeSurfaces)(), reactForUiDisclosure4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiDisclosure3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), Surface = reactForUiDisclosure4.forwardRef(({ elevation, className, style, children, ...props }, options) => {
        let value = useSurfaceStyle(runtime2.elevationSurfaceNames[elevation]);
        return jsxForUiDisclosure3.jsx("div", {
          ref: options,
          "data-cds": "Surface",
          "data-surface": elevation,
          ...props,
          className: (0, runtime2.cn)((0, runtime2.getSurfaceClasses)(elevation), className),
          style: {
            ...value,
            ...style
          },
          children: jsxForUiDisclosure3.jsx(runtime2.surfaceBackgroundContext.Provider, {
            value: runtime2.elevationSurfaceNames[elevation],
            children
          })
        });
      }), Surface.displayName = "Surface";
    }), TEXT_INPUT_SURFACE_CLASS = "bg-fill-field shadow-field-ring data-[invalid]:shadow-field-invalid", TEXT_INPUT_HOVER_CLASS = "[&:hover:not(:focus-visible):not(:has(:focus-visible)):not([data-invalid]):not([data-disabled])]:shadow-field-hover", fieldFocusClasses = "focus-visible:shadow-focus data-[invalid]:focus-visible:shadow-focus-danger", fieldFocusWithinClasses = "has-[:focus-visible]:shadow-focus data-[invalid]:has-[:focus-visible]:shadow-focus-danger", TEXT_INPUT_REQUIRED_CLASS = "cds-input cds-reset min-w-0 flex-1 h-full bg-transparent border-0 p-0 outline-none focus-visible:outline-hidden text-body font-normal text-primary focus-visible:shadow-none placeholder:text-muted disabled:opacity-disabled", initializeUiDisclosure12 = (0, runtime2.initializeOnce)(() => {
      TEXT_INPUT_CLASS = `h-control ps-md rounded ${TEXT_INPUT_SURFACE_CLASS} font-sans text-body font-normal text-primary transition duration-fast`, TEXT_INPUT_PLACEHOLDER_CLASS = `rounded ${TEXT_INPUT_SURFACE_CLASS} px-md py-sm transition duration-fast`, TEXT_INPUT_INVALID_CLASS = `${TEXT_INPUT_PLACEHOLDER_CLASS} [&:hover:not(:focus-within):not([data-invalid]):not([data-disabled])]:shadow-field-hover focus-within:shadow-focus data-[invalid]:focus-within:shadow-focus-danger font-sans text-body text-primary`;
    });
  };
}
export {
  installUiDisclosure
};
