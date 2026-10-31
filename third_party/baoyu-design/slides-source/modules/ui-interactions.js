// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiInteractions(runtime2) {
  var classMergeThemeKeys, classMergeTypographyScale, classMergeTypographyWeights, classMergeWeightRoleMarkers, hitGapTokenValues, hitGridGapTokenValues, getClassMergeThemeValues, paddingTokenNames, marginTokenNames, gapTokenNames, createDirectionalClassGroups, typographyClassNames, typographyWeightClassNames, mergeTailwindClasses, initializeClassNames, reactTranslations, translationContext, initializeTranslations, reactSheetChrome, jsxSheetChrome, SheetDismissButton, SheetChrome, initializeSheetChrome, initializeAnimationWait, reactSheetMeasurement, initializeSheetMeasurement, outsidePressWrappersContext, initializeOutsidePressWrappers, sheetTreeHostsContext, EMPTY_SHEET_TREES, sheetTreeAnnouncements, sheetTreeAnnouncementListeners, initializeSheetTreeAnnouncements, reactSheetPopupHost, initializeSheetPopupHost, reactLayers, jsxLayers, LAYER_BAND_SIZE, TOAST_LAYER_BASE, layerBaseContext, overlayLayerOffsets, portalLayerClasses, initializeLayers, reactMergedRefs, initializeMergedRefs, reactExperimentalTheme, createResolvedThemeSnapshot, themeStoreContext, defaultThemeStore, reportedThemeErrors, initializeExperimentalTheme, HTML_NAMESPACE, SVG_NAMESPACE_GE0, initializeElementNamespaces, reactActivityHide, jsxActivityHide, activityHideElementsContext, initializeCloseOnActivityHide, modalCatcherDragSession, modalCatcherDragEndEvents, initializeModalCatcher, reactPointerDismissal, jsxPointerDismissal, pointerDismissalContext, initializePointerDismissal, reactSkeletonContexts, jsxSkeletonContexts, skeletonActiveContext, skeletonElementContext, skeletonGroupContext, skeletonShownStoreContext, initializeSkeletonContexts, jsxPortalRoot, initializePortalRoot, reactForUiInteractions, REM_SCALE_VARIABLE, DEFAULT_ROOT_FONT_SIZE, ROOT_REM_PROBE_LENGTH_CSS, ROOT_REM_PROBE_STYLE, pixelsToScaledRem, initializeRemScale, iconFontManifest, iconCodepoints, secondaryIconCodepoints, nextIconCodepoint, iconMasterWeights, animatedIconNames, loopingIconNames, iconAnimationDurations, iconAnimationExitDurations, iconAnimationEasings, iconManifest, initializeIconManifest, initializeIconAccessibility, jsxIcons, iconSizeMetrics, iconSizes, DEFAULT_ICON_SIZE, primaryIconGlyphs, secondaryIconGlyphs, animatedIcons, loopingIcons, animationDurations, animationExitDurations, animationEasings, iconWeightBounds, MIN_ICON_FONT_WEIGHT, MAX_ICON_FONT_WEIGHT, customIconBaseStyle, iconFontStyles, ICON_FONT_RETRY_DELAY, iconFontRetriedDocuments, iconFontRetryCounts, MAX_ICON_FONT_RETRIES, MAX_ICON_FONT_PROBES, initializeIconFontRetry, fizzyLakeCodepoints, fizzyLakeFallbackNames, initializeFizzyLakeIcons, mirroredIconNames, initializeMirroredIcons, fizzyIconGlyphs, mirroredIcons, fizzyIconFallbacks, ICON_SLOT_CLASS_NAME, ICON_SLOT_FIRST_LINE_CLASS_NAME, initializeIcons, reactCollisionPadding, jsxCollisionPadding, DEFAULT_COLLISION_PADDING, desktopTitlebarStores, getZeroInsetSnapshot, subscribeInsetNoop, collisionPaddingContext, initializeCollisionPadding, elevationSurfaceNames, elevationShadowClasses, surfaceBackgroundClasses, focusShadowByMode, dangerFocusShadowByMode, initializeSurfaces, reactMenuContexts, menuTriggerContext, defaultSubmenuState, submenuStateContext, FOCUSES_NOTHING_ATTRIBUTE, contextMenuContext, menuBarContext, menuSheetLabelsContext, MENU_ANCHOR_SELECTOR, menuRootIdentityContext, menuIsOpenContext, initializeMenuContexts, jsxMenuScrollContent, reactMenuScrollContent, MENU_SCROLL_INTERACTION_EVENTS, menuScrollOpenRecords, keyboardContextMenuEventContext, menuScrollClasses, SURFACE_FORCED_COLORS_BORDER_CLASS, menuBodyScrollClasses, menuHeaderClasses, menuFooterClasses, MENU_ITEM_HEIGHT_CSS, initializeMenuScrollContent, reactKeyboardContextMenuFocus, keyboardContextMenuRoots, initializeKeyboardContextMenuFocus, TEXT_ENTRY_SELECTOR, initializeTextEntrySelector, initializeSafeBlur;
  function cn(...classValues) {
    return mergeTailwindClasses((0, runtime2.clsx)(classValues));
  }
  function interpolateTranslation(template, values) {
    return values ? template.replace(/\{(\w+)\}/g, (input, options) => options in values ? String(values[options]) : input) : template;
  }
  function translateWithFallback(translate, key, fallback, values) {
    return translate?.(key, fallback, values) || interpolateTranslation(fallback, values);
  }
  function useTranslation(key, fallback, values) {
    return translateWithFallback(reactTranslations.useContext(translationContext), key, fallback, values);
  }
  function SheetHandle({ drawPill = !0 }) {
    let dragHandlers = (0, runtime2.useSheetDrag)();
    return jsxSheetChrome.jsx("div", {
      "aria-hidden": !0,
      "data-cds-sheet-handle": "",
      ...dragHandlers,
      className: "flex min-h-8 shrink-0 touch-none items-center justify-center select-none",
      children: jsxSheetChrome.jsx("div", {
        className: (0, runtime2.clsx)("h-1 w-9 rounded-full bg-border", !drawPill && "opacity-0")
      })
    });
  }
  function SheetTitleBar({ leading, title }) {
    let dragHandlers = (0, runtime2.useSheetDrag)(), hasLeading = leading != null && leading !== !1;
    return !hasLeading && !(title != null && title !== !1 && title !== "") ? null : jsxSheetChrome.jsxs("div", {
      ...dragHandlers,
      className: "order-first flex min-h-control shrink-0 touch-none items-center gap-xs px-1 pb-1 select-none",
      children: [
        hasLeading && jsxSheetChrome.jsx("span", {
          className: "-me-2.5 shrink-0",
          children: leading
        }),
        jsxSheetChrome.jsx("span", {
          "aria-hidden": !0,
          className: (0, runtime2.clsx)("min-w-0 flex-1 truncate text-start text-heading font-semibold font-header text-primary", !hasLeading && "ps-2.5"),
          children: title
        })
      ]
    });
  }
  function SheetBody({ className, children }) {
    return jsxSheetChrome.jsx("div", {
      className: cn("flex min-h-0 flex-auto flex-col", className),
      children
    });
  }
  function getFiniteRunningAnimations(element) {
    return typeof element.getAnimations != "function" ? [] : element.getAnimations().filter(isFiniteRunningAnimation);
  }
  function isFiniteRunningAnimation(animation) {
    if (animation.playState !== "running" || animation.effect?.getTiming().iterations === 1 / 0)
      return !1;
    let timeline = animation.timeline;
    return !(typeof timeline == "object" && timeline !== null && "source" in timeline);
  }
  function afterElementAnimations(element, onComplete) {
    let active = !0, animationFrame = requestAnimationFrame(() => {
      animationFrame = requestAnimationFrame(() => {
        let value = getFiniteRunningAnimations(element);
        if (value.length === 0) {
          onComplete();
          return;
        }
        Promise.allSettled(value.map((input) => input.finished)).then(() => {
          active && onComplete();
        });
      });
    });
    return () => {
      active = !1, cancelAnimationFrame(animationFrame);
    };
  }
  function useSheetTextEntryFocus(element, options) {
    let value = options?.setDetent, value2 = options?.holdTextEntryFocus;
    reactSheetMeasurement.useEffect(() => {
      if (element === null || value === void 0 || value2 === void 0)
        return;
      let value3 = null, callback = () => {
        value3 === null && (value3 = value2());
      }, callback2 = () => {
        value3?.(), value3 = null;
      }, index4 = 0, callback3 = (input) => {
        if (!(input instanceof Element))
          return !1;
        if ((0, runtime2.isEditableElement)(input))
          return !0;
        let ancestor = input.closest('[data-cds="TextInput"], label');
        if (ancestor === null)
          return !1;
        let value4 = ancestor instanceof HTMLLabelElement ? ancestor.control : null;
        return (0, runtime2.isEditableElement)(value4) || ancestor.querySelector('input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null;
      }, callback4 = (event) => {
        callback3(event.target) && (index4 = event.timeStamp || Date.now());
      }, callback5 = (event) => {
        (0, runtime2.isEditableElement)(event.target) && (callback(), index4 > 0 && (event.timeStamp || Date.now()) - index4 < 1e3 && (index4 = 0, value("tall")));
      }, callback6 = (event) => {
        index4 > 0 && callback3(event.target) && (index4 = 0, value("tall"));
      }, callback7 = (event) => {
        (0, runtime2.isEditableElement)(event.target) && callback2();
      };
      return element.addEventListener("pointerdown", callback4), element.addEventListener("focusin", callback5), element.addEventListener("focusout", callback7), element.addEventListener("click", callback6), element.contains(element.ownerDocument.activeElement) && (0, runtime2.isEditableElement)(element.ownerDocument.activeElement) && callback(), () => {
        element.removeEventListener("pointerdown", callback4), element.removeEventListener("focusin", callback5), element.removeEventListener("focusout", callback7), element.removeEventListener("click", callback6), callback2();
      };
    }, [element, value, value2]);
  }
  function useSheetPressedState(element) {
    reactSheetMeasurement.useEffect(() => {
      if (element === null)
        return;
      let ownerDocument2 = element.ownerDocument, value = null, callback = () => {
        element.removeAttribute(runtime2.SHEET_PRESSED_ATTRIBUTE), value?.removeAttribute(runtime2.SHEET_CONTROL_HELD_ATTRIBUTE), value = null, ownerDocument2.removeEventListener("click", callback, !0), ownerDocument2.removeEventListener("pointercancel", callback, !0), ownerDocument2.removeEventListener("keydown", callback, !0);
      }, callback2 = () => {
        ownerDocument2.addEventListener("click", callback, !0), ownerDocument2.addEventListener("pointercancel", callback, !0), ownerDocument2.addEventListener("keydown", callback, !0), element.setAttribute(runtime2.SHEET_PRESSED_ATTRIBUTE, "");
        let element2 = element.querySelector("[data-cds-sheet-control]");
        element2?.matches(":focus-visible, [data-highlighted]") && (value = element2, element2.setAttribute(runtime2.SHEET_CONTROL_HELD_ATTRIBUTE, ""));
      };
      return element.addEventListener("pointerdown", callback2, !0), () => {
        element.removeEventListener("pointerdown", callback2, !0), callback();
      };
    }, [element]);
  }
  function isScrollContentReplacement(records, hadOverflow) {
    if (!hadOverflow)
      return !1;
    let scrollSelector = `[${runtime2.SHEET_SCROLL_ATTRIBUTE}]`, addedCount = 0, removedCount = 0;
    for (let value of records) {
      let target = value.target, value2 = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
      if (value2 === null || value2.closest(scrollSelector) === null)
        return !1;
      addedCount += value.addedNodes.length, removedCount += value.removedNodes.length;
    }
    return addedCount > 0 && removedCount > 0 && removedCount <= addedCount;
  }
  function measureNaturalSheetHeight(element) {
    let renderedHeight = element.getBoundingClientRect().height, scrollElements = Array.from(element.querySelectorAll(`[${runtime2.SHEET_SCROLL_ATTRIBUTE}]`));
    if (scrollElements.length === 0)
      return renderedHeight;
    let naturalHeight = renderedHeight;
    for (let value of scrollElements) {
      let firstElementChild = value.firstElementChild;
      for (; firstElementChild !== null && firstElementChild.getClientRects().length === 0; )
        firstElementChild = firstElementChild.nextElementSibling;
      let lastElementChild = value.lastElementChild;
      for (; lastElementChild !== null && lastElementChild.getClientRects().length === 0; )
        lastElementChild = lastElementChild.previousElementSibling;
      let value2 = element.ownerDocument.defaultView?.getComputedStyle(value), value3 = parseFloat(value2?.paddingTop ?? "0") + parseFloat(value2?.paddingBottom ?? "0"), value4 = firstElementChild !== null && lastElementChild !== null ? lastElementChild.getBoundingClientRect().bottom - firstElementChild.getBoundingClientRect().top + value3 : value3;
      naturalHeight += value4 - value.clientHeight;
    }
    return Math.max(0, naturalHeight);
  }
  function createSheetUncoverGate(element, onReady) {
    let windowObject = element.ownerDocument.defaultView;
    if (windowObject === null || typeof windowObject.MutationObserver > "u")
      return {
        ready: () => !0,
        dispose: () => {
        }
      };
    let pending = !1, cancelWait = null, flush = () => {
      cancelWait = null, pending && (pending = !1, onReady());
    }, observer = new windowObject.MutationObserver(() => {
      if (cancelWait?.(), element.hasAttribute("data-cds-sheet-covered")) {
        cancelWait = null;
        return;
      }
      cancelWait = typeof element.getAnimations == "function" ? afterElementAnimations(element, flush) : afterCssTransitions(element, windowObject, flush);
    });
    return observer.observe(element, {
      attributes: !0,
      attributeFilter: [runtime2.SHEET_COVERED_ATTRIBUTE]
    }), {
      ready: () => element.hasAttribute("data-cds-sheet-covered") || cancelWait !== null ? (pending = !0, !1) : !0,
      dispose: () => {
        observer.disconnect(), cancelWait?.(), cancelWait = null;
      }
    };
  }
  function afterCssTransitions(input, options, context) {
    let style = options.getComputedStyle(input), callback = (input2) => input2.split(",").map((input3) => {
      let value4 = parseFloat(input3);
      return Number.isFinite(value4) ? input3.trim().endsWith("ms") ? value4 : value4 * 1e3 : 0;
    }), value = callback(style.transitionDelay ?? ""), value2 = Math.max(...callback(style.transitionDuration ?? "").map((input2, options2) => input2 + (value[options2 % value.length] ?? 0))), value3 = options.setTimeout(context, value2 + 34);
    return () => options.clearTimeout(value3);
  }
  function measureSheetScrollContent(element) {
    let visible = 0, overflowContent = 0;
    for (let value of Array.from(element.querySelectorAll(`[${runtime2.SHEET_SCROLL_ATTRIBUTE}]`)))
      visible += value.clientHeight, value.scrollHeight > value.clientHeight + 1 && (overflowContent += value.scrollHeight);
    return {
      visible,
      overflowContent
    };
  }
  function measureSheetControlOverflow(sheetElement, controlElement) {
    let windowObject = sheetElement.ownerDocument.defaultView;
    if (windowObject === null || controlElement === null || !sheetElement.contains(controlElement))
      return 0;
    let position = windowObject.getComputedStyle(controlElement).position;
    if (position === "absolute" || position === "fixed")
      return 0;
    let overflow = 0;
    for (let value = controlElement; value !== sheetElement; ) {
      let parentElement = value.parentElement;
      if (parentElement === null)
        break;
      let style = windowObject.getComputedStyle(parentElement), value2 = parentElement.getBoundingClientRect().bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth), value3 = parseFloat(windowObject.getComputedStyle(value).marginBottom);
      overflow += Math.max(0, value.getBoundingClientRect().bottom + Math.max(0, value3) - value2 + parentElement.scrollTop), value = parentElement;
    }
    return overflow;
  }
  function getSheetTreeAnnouncement(popup) {
    return sheetTreeAnnouncements.get(popup);
  }
  function subscribeSheetTreeAnnouncements(listener) {
    return sheetTreeAnnouncementListeners.add(listener), () => {
      sheetTreeAnnouncementListeners.delete(listener);
    };
  }
  function announceSheetTreeDialog(announcement) {
    if (!sheetTreeAnnouncements.has(announcement.popup)) {
      sheetTreeAnnouncements.set(announcement.popup, announcement);
      for (let listener of Array.from(sheetTreeAnnouncementListeners))
        listener(announcement);
    }
  }
  function useSheetTreeDialogAnnouncement(enabled) {
    initializeSheetMeasurement();
    let hostSheetTrees = reactSheetMeasurement.useContext(runtime2.sheetParentContext)?.trees ?? EMPTY_SHEET_TREES, parentHosts = reactSheetMeasurement.useContext(sheetTreeHostsContext), [dialog] = reactSheetMeasurement.useState(() => ({})), hosts = reactSheetMeasurement.useMemo(() => [...parentHosts, dialog], [parentHosts, dialog]), announceRef = reactSheetMeasurement.useCallback((element) => {
      element !== null && enabled && announceSheetTreeDialog({
        popup: element,
        dialog,
        hostSheetTrees
      });
    }, [enabled, dialog, hostSheetTrees]);
    return reactSheetMeasurement.useMemo(() => ({
      announceRef,
      hosts
    }), [announceRef, hosts]);
  }
  function findSheetTreeDialogAncestor(element) {
    for (let value = element; value !== null; value = value.parentElement)
      if (isSheetTreeDialog(value))
        return value;
    return null;
  }
  function useDismissSheetOnForeignFocus(element, options, context) {
    let ref = reactSheetMeasurement.useRef(context);
    reactSheetMeasurement.useEffect(() => {
      ref.current = context;
    }, [context]);
    let open4 = options?.open ?? !1, dismiss = options?.dismiss, claimHandoff = options?.claimHandoff, treeId = options?.treeId, outsideCdsRoot = (0, runtime2.useRootElement)() === void 0, hosts = reactSheetMeasurement.useContext(sheetTreeHostsContext);
    reactSheetMeasurement.useEffect(() => {
      if (element === null || !open4 || dismiss === void 0 || claimHandoff === void 0 || treeId === void 0)
        return;
      let ownerDocument2 = element.ownerDocument, defaultView = ownerDocument2.defaultView, treeSelector = `[data-sheet-tree="${CSS.escape(treeId)}"]`, isInsideTree = (target) => element.contains(target) || target.closest(treeSelector) !== null, handOff = (target) => {
        claimHandoff(target) && dismiss();
      }, frames = /* @__PURE__ */ new Set(), nextFrame = (callback2) => {
        if (defaultView === null)
          return;
        let frame = defaultView.requestAnimationFrame(() => {
          frames.delete(frame), callback2();
        });
        frames.add(frame);
      }, unsubscribe = subscribeSheetTreeAnnouncements((announcement) => {
        let { popup } = announcement;
        popup.ownerDocument !== ownerDocument2 || announcement.hostSheetTrees.includes(treeId) || hosts.includes(announcement.dialog) || nextFrame(() => nextFrame(() => {
          popup.isConnected && popup.hasAttribute("data-open") && isSheetTreeDialog(popup) && handOff(popup);
        }));
      }), scheduled = !1, callback = () => {
        scheduled || (scheduled = !0, nextFrame(() => {
          scheduled = !1;
          let activeElement2 = ownerDocument2.activeElement;
          if (activeElement2 === null || activeElement2 === ownerDocument2.body) {
            outsideCdsRoot && ownerDocument2.addEventListener("focusin", callback, {
              capture: !0,
              once: !0
            });
            return;
          }
          if (ref.current || isInsideTree(activeElement2))
            return;
          let dialog = findSheetTreeDialogAncestor(activeElement2);
          if (dialog !== null) {
            let announcement = getSheetTreeAnnouncement(dialog);
            (announcement === void 0 || !(announcement.hostSheetTrees.includes(treeId) || hosts.includes(announcement.dialog))) && handOff(dialog);
            return;
          }
          activeElement2.closest('[aria-modal="true"]') !== null && ![element, ...ownerDocument2.querySelectorAll(treeSelector)].some((value) => value.closest("[data-base-ui-portal]")?.contains(activeElement2) === !0) && handOff(null);
        }));
      };
      return element.addEventListener("focusout", callback), () => {
        unsubscribe(), element.removeEventListener("focusout", callback), ownerDocument2.removeEventListener("focusin", callback, {
          capture: !0
        });
        for (let frame of frames)
          defaultView?.cancelAnimationFrame(frame);
      };
    }, [element, open4, dismiss, claimHandoff, treeId, outsideCdsRoot, hosts]);
  }
  function createPinnedSheetMeasurement(element, height2, canGrow) {
    let roundedHeight = Math.round(height2), chromeHeight = height2 - measureSheetScrollContent(element).visible;
    return {
      contentHeight: roundedHeight,
      written: roundedHeight,
      chromeAtPin: chromeHeight,
      chromeSettled: chromeHeight,
      grows: canGrow
    };
  }
  function useSheetHeightUntilVisible(element, onMeasure) {
    reactSheetPopupHost.useEffect(() => {
      let value = (0, runtime2.getResizeObserverConstructor)(element);
      if (element === null || value === void 0)
        return;
      let value2 = new value(() => {
        let height2 = element.getBoundingClientRect().height;
        height2 > 0 && (value2.disconnect(), onMeasure(element, height2));
      });
      return value2.observe(element), () => value2.disconnect();
    }, [element, onMeasure]);
  }
  function useSheetPopupHost() {
    let sheetState = (0, runtime2.useSheetState)(), [halfHeightFloor, setHalfHeightFloor] = reactSheetPopupHost.useState(!1), halfHeightFloorRef = reactSheetPopupHost.useRef(!1), measurementRef = reactSheetPopupHost.useRef(null), pinnedElementRef = reactSheetPopupHost.useRef(null), detachedElementRef = reactSheetPopupHost.useRef(null), updateHalfHeightFloor = reactSheetPopupHost.useCallback((input) => {
      halfHeightFloorRef.current = input, setHalfHeightFloor(input);
    }, []), [element, setElement] = reactSheetPopupHost.useState(null), { sheet } = sheetState, frame = reactSheetPopupHost.useContext(runtime2.sheetFrameContext), parentSheet = reactSheetPopupHost.useContext(runtime2.sheetParentContext), elementRef = reactSheetPopupHost.useRef(null), pinHeight = frame?.pinHeight, measureAndPin = reactSheetPopupHost.useCallback((input, options) => {
      let value = (0, runtime2.sheetContentCanGrow)(input);
      pinHeight?.(options, value), pinnedElementRef.current = input, measurementRef.current = createPinnedSheetMeasurement(input, options, value);
    }, [pinHeight]), attachElement = reactSheetPopupHost.useCallback((input) => {
      let current = detachedElementRef.current;
      if (detachedElementRef.current = input === null && elementRef.current !== null ? {
        node: elementRef.current,
        half: halfHeightFloorRef.current
      } : null, elementRef.current = sheet ? input : null, setElement(sheet ? input : null), sheet && input !== null && current?.node === input) {
        updateHalfHeightFloor(current.half), pinnedElementRef.current !== input && (pinnedElementRef.current = input, measurementRef.current = createPinnedSheetMeasurement(input, input.getBoundingClientRect().height, (0, runtime2.sheetContentCanGrow)(input)));
        return;
      }
      if ((input === null || !sheet) && updateHalfHeightFloor(!1), input !== null && sheet) {
        let value = (0, runtime2.hasEditableSheetContent)(input);
        if (value) {
          let value2 = `min(${runtime2.MIN_SHEET_HEIGHT_CSS}, ${runtime2.MAX_SHEET_HEIGHT_CSS})`;
          input.style.minHeight = value2, input.style.maxHeight = value2;
        }
        updateHalfHeightFloor(value), measureAndPin(input, input.getBoundingClientRect().height);
      }
    }, [sheet, measureAndPin, updateHalfHeightFloor]), height2 = frame?.height;
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = elementRef.current;
      !sheet || height2 !== void 0 || current === null || ((0, runtime2.resetSheetDragStyle)(current), measureAndPin(current, current.getBoundingClientRect().height));
    }, [sheet, height2, measureAndPin]);
    let open4 = frame?.open ?? !1;
    useSheetHeightUntilVisible(sheet && open4 && height2 === void 0 ? element : null, measureAndPin);
    let repinHeight = frame?.repinHeight, dragState = frame?.drag;
    reactSheetPopupHost.useEffect(() => {
      if (!sheet || !open4 || element === null || repinHeight === void 0)
        return;
      let defaultView = element.ownerDocument.defaultView;
      if (defaultView === null || typeof defaultView.MutationObserver > "u")
        return;
      let index4 = 0, flag = !1, flag2 = !1, value = null, value2 = typeof defaultView.ResizeObserver > "u" ? null : new defaultView.ResizeObserver(() => {
        callback4();
      }), callback = () => {
        let element2 = element.querySelector("[data-cds-sheet-control]");
        element2 === value || value2 === null || (value !== null && value2.unobserve(value), value = element2, element2 !== null && value2.observe(element2));
      }, callback2 = (input, options) => {
        let value5 = (0, runtime2.getSheetMinimumHeight)(defaultView.innerHeight, halfHeightFloorRef.current);
        repinHeight(Math.max(input, value5), options);
      }, callback3 = () => {
        if (index4 = 0, dragState !== void 0 && dragState.get() !== null) {
          index4 = defaultView.requestAnimationFrame(callback3);
          return;
        }
        if (!value3.ready())
          return;
        if (callback(), (0, runtime2.hasEditableSheetContent)(element)) {
          halfHeightFloorRef.current || (updateHalfHeightFloor(!0), repinHeight(defaultView.innerHeight * runtime2.MIN_SHEET_HEIGHT_FRACTION, !0)), flag2 = !1;
          return;
        }
        let value5 = measureSheetControlOverflow(element, value), value6 = measureSheetScrollContent(element), value7 = element.getBoundingClientRect().height + value5 - value6.visible, value8 = (0, runtime2.getSheetAvailableHeight)(defaultView, element) * runtime2.MAX_SHEET_HEIGHT_FRACTION;
        if (flag2) {
          flag2 = !1;
          let value10 = Math.round(Math.max(measureNaturalSheetHeight(element) + value5, value6.overflowContent > 0 ? value7 + value6.overflowContent : 0));
          flag = value10 > value8, measurementRef.current = {
            contentHeight: value10,
            written: Math.min(value10, value8),
            chromeAtPin: value7,
            chromeSettled: value7,
            grows: flag
          }, callback2(Math.min(value10, value8), flag);
          return;
        }
        let current = measurementRef.current;
        if (current === null || Math.abs(value7 - current.chromeSettled) < 1)
          return;
        if (current.chromeSettled = value7, Math.abs(value7 - current.chromeAtPin) < 1) {
          callback2(current.written, current.grows);
          return;
        }
        let value9 = current.contentHeight + value7 - current.chromeAtPin;
        callback2(Math.min(value9, value8), value9 > value8 || current.grows);
      }, callback4 = () => {
        index4 === 0 && (index4 = defaultView.requestAnimationFrame(callback3));
      }, value3 = createSheetUncoverGate(element, callback4);
      callback();
      let value4 = new defaultView.MutationObserver((input) => {
        index4 !== 0 && flag2 || isScrollContentReplacement(input, flag) || (flag2 = !0, callback4());
      });
      return value4.observe(element, {
        childList: !0,
        subtree: !0
      }), () => {
        value4.disconnect(), value3.dispose(), value2?.disconnect(), index4 !== 0 && defaultView.cancelAnimationFrame(index4), pinnedElementRef.current === element && (measurementRef.current = null, pinnedElementRef.current = null);
      };
    }, [sheet, open4, element, repinHeight, dragState, updateHalfHeightFloor]), useSheetTextEntryFocus(element, frame), useSheetPressedState(element), useDismissSheetOnForeignFocus(element, frame, sheetState.covered), (0, runtime2.useAndroidCloseWatcher)(sheet && (frame?.open ?? !1), frame?.dismiss);
    let coverParent = reactSheetPopupHost.useContext(runtime2.sheetCoverContext), windowObject = (0, runtime2.useRootWindow)(), frameHeight = (0, runtime2.getSheetFrameHeight)(frame, windowObject, element), treeId = frame?.treeId, trees = reactSheetPopupHost.useMemo(() => [
      ...parentSheet?.trees ?? [],
      ...treeId === void 0 ? [] : [treeId]
    ], [parentSheet?.trees, treeId]), stack = reactSheetPopupHost.useMemo(() => sheet && coverParent !== null ? {
      depth: sheetState.depth,
      frameHeight,
      cover: coverParent,
      trees
    } : null, [sheet, coverParent, sheetState.depth, frameHeight, trees]), covered = sheet && sheetState.covered, inert = sheet && sheetState.inert, style = sheet ? (0, runtime2.getSheetPopupStyle)(frame, {
      floor: halfHeightFloor ? "half" : "content",
      parentFrameHeight: parentSheet?.frameHeight
    }) : void 0;
    return {
      sheet,
      concealed: !1,
      chrome: SheetChrome,
      ref: attachElement,
      style,
      positionerStyle: sheet ? (0, runtime2.getSheetPositionerStyle)(frame) : void 0,
      attrs: {
        ...sheet ? (0, runtime2.getControlSizeAttributes)("lg") : {},
        "data-presentation": sheet ? "sheet" : void 0,
        "data-sheet-tree": sheet ? frame?.treeId : void 0,
        [runtime2.SHEET_COVERED_ATTRIBUTE]: covered ? "" : void 0,
        "data-cds-sheet-depth": sheet ? String(sheetState.depth) : void 0,
        "data-cds-sheet-detent": sheet ? frame?.detent : void 0,
        "aria-hidden": inert ? "true" : void 0,
        ...inert ? runtime2.inertElementProps : {}
      },
      frame,
      state: sheetState,
      stack
    };
  }
  function SheetPopupHost({ children }) {
    return children(useSheetPopupHost());
  }
  function checkLayerBase(input, options) {
  }
  function CdsLayer({ children, base, render }) {
    let value = reactLayers.useContext(layerBaseContext), value2 = base ?? value + LAYER_BAND_SIZE, value3 = render === void 0 ? null : reactLayers.cloneElement(render, {
      "data-cds": render.props["data-cds"] ?? "CdsLayer",
      style: {
        ...render.props.style,
        zIndex: value2,
        "--cds-layer-base": value2
      }
    }, children);
    return jsxLayers.jsx(layerBaseContext.Provider, {
      value: value2,
      children: value3 ?? children
    });
  }
  function warnInvalidLayerOffset(source, layerOffset) {
    if (Number.isInteger(layerOffset) && layerOffset >= 0 && layerOffset < LAYER_BAND_SIZE)
      return;
    let warning = `cds: ${source} — value must be an integer in [0, ${LAYER_BAND_SIZE}). A non-integer is silently invalid as a z-index (the declaration is dropped and the element falls to z-auto); anything outside the range escapes its band and stacks unpredictably against other overlays.`;
    console.warn(warning);
  }
  function useDefaultOverlayLayer(input) {
    return useOverlayLayer(input);
  }
  function useOverlayLayer(kind, layerOffset) {
    let parentBase = reactLayers.useContext(layerBaseContext);
    if (layerOffset === void 0) {
      let value = parentBase + LAYER_BAND_SIZE, value2 = value + overlayLayerOffsets[kind];
      return {
        base: value,
        style: {
          zIndex: value2,
          "--cds-layer-base": value
        },
        portalProps: {
          className: portalLayerClasses,
          style: {
            "--cds-portal-z": value2,
            "--cds-layer-base": value
          },
          popup: !0,
          closesOnOutsidePress: !0
        }
      };
    }
    warnInvalidLayerOffset(`layerOffset=${layerOffset}`, layerOffset);
    let zIndex = parentBase + layerOffset;
    return {
      base: parentBase,
      style: {
        zIndex,
        "--cds-layer-base": parentBase
      },
      portalProps: {
        className: portalLayerClasses,
        style: {
          "--cds-portal-z": zIndex,
          "--cds-layer-base": parentBase
        },
        popup: !0,
        closesOnOutsidePress: !0
      }
    };
  }
  function useCdsLayerAwareZIndex(offset4) {
    let parentBase = reactLayers.useContext(layerBaseContext);
    return warnInvalidLayerOffset(`useCdsLayerAwareZIndex(${offset4})`, offset4), parentBase + offset4;
  }
  function CdsLayerVarBridge({ children, className }) {
    let value = reactLayers.useContext(layerBaseContext);
    return jsxLayers.jsx("div", {
      className: cn("contents", className),
      "data-cds": "CdsLayerVarBridge",
      "data-cds-layer-var-bridge": "",
      style: {
        "--cds-layer-base": value
      },
      children
    });
  }
  function setReactRef(ref, value) {
    if (typeof ref == "function")
      return ref(value);
    ref && (ref.current = value);
  }
  function mergeRefs(...refs) {
    return (input) => {
      let value = refs.map((input2) => setReactRef(input2, input));
      if (value.some((input2) => typeof input2 == "function"))
        return () => {
          refs.forEach((input2, options) => {
            let value2 = value[options];
            typeof value2 == "function" ? value2() : setReactRef(input2, null);
          });
        };
    };
  }
  function useMergedRefs2(firstRef, secondRef, thirdRef) {
    return reactMergedRefs.useMemo(() => mergeRefs(firstRef, secondRef, thirdRef), [firstRef, secondRef, thirdRef]);
  }
  function useStableMergedRef(firstRef, secondRef) {
    let stableFirstRef = (0, runtime2.useEventCallback)(firstRef);
    return (0, runtime2.useEventCallback)((input) => mergeRefs(stableFirstRef, secondRef)(input));
  }
  function resolveExperimentalTheme(configuration) {
    try {
      return configuration.resolve?.(configuration.theme);
    } catch (value) {
      reportThemeErrorOnce('<CdsRoot experimental.theme> could not resolve the theme "' + String(configuration.theme.id) + '", so useTokenValue returns unthemed values. ' + (value instanceof Error ? value.message : String(value)));
      return;
    }
  }
  function createThemeStore(configuration) {
    let listeners = /* @__PURE__ */ new Set(), snapshot = createResolvedThemeSnapshot(configuration), serverSnapshot = snapshot, notify = () => {
      for (let value of listeners)
        value();
    };
    return {
      subscribe: (input) => (listeners.add(input), () => listeners.delete(input)),
      getSnapshot: () => snapshot,
      getServerSnapshot: () => serverSnapshot,
      getId: () => snapshot?.theme.id,
      set: (input) => {
        let value = createResolvedThemeSnapshot(input, snapshot);
        value !== snapshot && (snapshot = value, notify());
      }
    };
  }
  function useCdsThemeId() {
    let value = reactExperimentalTheme.useContext(themeStoreContext) ?? defaultThemeStore;
    return reactExperimentalTheme.useSyncExternalStore(value.subscribe, value.getId, () => value.getServerSnapshot()?.theme.id);
  }
  function reportThemeErrorOnce(message) {
    reportedThemeErrors.has(message) || (reportedThemeErrors.add(message), console.error("cds: " + message));
  }
  function reportThemeApplicationError(themeId, error) {
    reportThemeErrorOnce('<CdsRoot experimental.theme> could not put the theme "' + themeId + '" on the page, so the page keeps what it had (no theme, or the previous one) while useTokenValue and useCdsTheme answer for "' + themeId + '". ' + (error instanceof Error ? error.message : String(error)));
  }
  function disposeThemeApplication(cleanupRef) {
    let cleanup = cleanupRef.current;
    cleanupRef.current = void 0;
    try {
      cleanup?.();
    } catch {
    }
  }
  function useExperimentalThemeStore(configuration, targetRef) {
    let parentStore = reactExperimentalTheme.useContext(themeStoreContext), [ownStore] = reactExperimentalTheme.useState(() => parentStore === void 0 ? createThemeStore(configuration) : defaultThemeStore), isRoot = parentStore === void 0, theme = configuration?.theme ?? void 0, resolve = configuration?.resolve, apply = configuration?.apply, applyRef = reactExperimentalTheme.useRef(apply);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      applyRef.current = apply;
    }, [apply]);
    let hasApply = apply !== void 0, cleanupRef = reactExperimentalTheme.useRef(void 0);
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      isRoot && ownStore.set(theme === void 0 ? void 0 : {
        theme,
        resolve
      });
    }, [isRoot, ownStore, theme, resolve]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = targetRef.current, current2 = applyRef.current;
      if (isRoot && theme !== void 0 && current2 !== void 0 && current !== null)
        try {
          cleanupRef.current = current2(theme, {
            target: current
          });
        } catch (value) {
          reportThemeApplicationError(theme.id, value);
        }
      else
        disposeThemeApplication(cleanupRef);
    }, [isRoot, theme, hasApply, targetRef]), (0, runtime2.useIsomorphicLayoutEffect)(() => () => disposeThemeApplication(cleanupRef), []), reactExperimentalTheme.useEffect(() => {
    }, [
      configuration === null,
      theme,
      hasApply,
      parentStore,
      targetRef
    ]), parentStore ?? ownStore;
  }
  function getElementNamespace(input) {
    let value = input;
    if (value?.nodeType === 1)
      return value.namespaceURI;
  }
  function isHtmlElement(input) {
    return getElementNamespace(input) === HTML_NAMESPACE;
  }
  function isSvgElement(input) {
    return getElementNamespace(input) === SVG_NAMESPACE_GE0;
  }
  function isHiddenByInlineDisplay(input) {
    if (!input.isConnected)
      return !1;
    for (let value = input; value !== null; value = value.parentElement)
      if (isHtmlElement(value) && value.style.display === "none")
        return !0;
    return !1;
  }
  function hasOpenChild(input) {
    for (let value of input.children)
      if (value.hasAttribute("data-open"))
        return !0;
    return !1;
  }
  function CloseOnActivityHideProvider({ actionsRef, children }) {
    let [value] = reactActivityHide.useState(() => /* @__PURE__ */ new Set()), ref = reactActivityHide.useRef(!1);
    return reactActivityHide.useEffect(() => (ref.current && (ref.current = !1, actionsRef.current?.close?.()), () => {
      ref.current = !1;
      for (let value2 of value)
        isHiddenByInlineDisplay(value2) && hasOpenChild(value2) && (ref.current = !0);
    }), [actionsRef, value]), jsxActivityHide.jsx(activityHideElementsContext.Provider, {
      value,
      children
    });
  }
  function useCloseOnActivityHideRef(input) {
    return useElementSetRegistration(reactActivityHide.useContext(activityHideElementsContext), input);
  }
  function useElementSetRegistration(elements, enabled) {
    let ref = reactActivityHide.useRef(null);
    return reactActivityHide.useEffect(() => {
      let current = ref.current;
      if (!(!enabled || elements === null || current === null))
        return elements.add(current), () => {
          elements.delete(current);
        };
    }, [elements, enabled]), ref;
  }
  function createOutsidePressWrappers() {
    let wrappers = /* @__PURE__ */ new Set(), refused = /* @__PURE__ */ new WeakSet(), pressed3 = [];
    return {
      wrappers,
      pressStarted(event) {
        event.button === 0 && (pressed3 = [...wrappers].filter((value) => hasOpenChild(value) && !refused.has(value)));
      },
      pressClosesPopup: () => pressed3.length > 0,
      refusesClose() {
        let value = pressed3.length > 0;
        for (let value2 of pressed3)
          refused.add(value2);
        return pressed3 = [], value;
      }
    };
  }
  function useOutsidePressWrapperRef(enabled) {
    let value = reactActivityHide.useContext(outsidePressWrappersContext);
    return useElementSetRegistration(value?.wrappers ?? null, enabled);
  }
  function isDomNode(input) {
    return typeof input == "object" && input !== null && typeof input.nodeType == "number";
  }
  function getCompanionModalCatcher(input, options) {
    let value = (0, runtime2.asElement)(options);
    return value === null || value.parentElement !== input ? null : value.childElementCount === 0 && value.style.position === "fixed" ? value : null;
  }
  function shouldSuppressModalCatcherFocus(input, options) {
    let value = getCompanionModalCatcher(input, options);
    if (value === null)
      return !1;
    let value2 = (0, runtime2.asElement)(value.ownerDocument.activeElement), value3 = input.parentElement ?? input;
    return value2 === null || !value3.contains(value2);
  }
  function handleModalCatcherPointerDown(event) {
    event.pointerType !== "touch" && shouldSuppressModalCatcherFocus(event.currentTarget, event.target) && event.preventDefault();
  }
  function handleModalCatcherMouseDown(event) {
    shouldSuppressModalCatcherFocus(event.currentTarget, event.target) && event.preventDefault();
  }
  function handleModalCatcherDragStart(event) {
    let currentTarget = event.currentTarget, value = null;
    for (let value3 of currentTarget.children)
      if (value = getCompanionModalCatcher(currentTarget, value3), value !== null)
        break;
    if (value === null)
      return;
    let value2 = value;
    if (modalCatcherDragSession !== null && modalCatcherDragSession.event === event.nativeEvent) {
      value2.style.pointerEvents = "none";
      let restoreAll = modalCatcherDragSession.restoreAll;
      modalCatcherDragSession.restoreAll = () => {
        value2.style.pointerEvents = "", restoreAll();
      };
      return;
    }
    modalCatcherDragSession?.restoreAll(), value2.style.pointerEvents = "none";
    let ownerDocument2 = value2.ownerDocument, state = {
      event: event.nativeEvent,
      restoreAll: () => {
        value2.style.pointerEvents = "";
        for (let value3 of modalCatcherDragEndEvents)
          ownerDocument2.removeEventListener(value3, callback, !0);
        modalCatcherDragSession === state && (modalCatcherDragSession = null);
      }
    }, callback = () => state.restoreAll();
    modalCatcherDragSession = state;
    for (let value3 of modalCatcherDragEndEvents)
      ownerDocument2.addEventListener(value3, callback, !0);
  }
  function ResetSkeletonContexts({ children }) {
    return jsxSkeletonContexts.jsx(skeletonActiveContext.Provider, {
      value: !1,
      children: jsxSkeletonContexts.jsx(skeletonElementContext.Provider, {
        value: "div",
        children: jsxSkeletonContexts.jsx(skeletonShownStoreContext.Provider, {
          value: null,
          children: jsxSkeletonContexts.jsx(skeletonGroupContext.Provider, {
            value: null,
            children
          })
        })
      })
    });
  }
  function PortalRoot({ children, className, style, surface, density, companionModalCatcher = !1, closeOnActivityHide = !1, closesOnOutsidePress = !1, popup = !1 }) {
    let value = useCloseOnActivityHideRef(closeOnActivityHide), outsidePressRef = useOutsidePressWrapperRef(closesOnOutsidePress), value2 = useMergedRefs2(runtime2.trackInputForElement, value, outsidePressRef), value3 = (0, runtime2.useDensity)(), value4 = density ?? value3, value5 = (0, runtime2.useColorMode)(), value6 = useCdsThemeId(), value7 = (0, runtime2.usePlatform)(), value8 = (0, runtime2.useFont)(), value9 = (0, runtime2.useDocumentFont)(value8 === void 0) ?? value8, value10 = (0, runtime2.useMonospaceFont)(), value11 = (0, runtime2.useFeatureFlagAttribute)(), value12 = (0, runtime2.usePageBackground)(), fizzyColor = (0, runtime2.useFeatureFlagPart)("color"), value13 = (0, runtime2.useSurfaceBackground)(), value14 = surface ?? value13, value15 = value14 || value10 !== void 0 || style ? {
      ...(0, runtime2.getSurfaceBackgroundStyle)(value14),
      ...(0, runtime2.getMonospaceOverrideStyle)(value10),
      ...style
    } : void 0;
    return jsxPortalRoot.jsx("div", {
      ref: value2,
      className: cn("cds-root pointer-events-auto", className),
      "data-cds-portal": "",
      "data-density": value4,
      "data-mode": value5,
      "data-cds-theme": value6,
      "data-platform": value7,
      "data-font": value9,
      "data-cds-fizzy-lake": value11,
      "data-cds-surface": fizzyColor ? value14 : void 0,
      "data-cds-popup": fizzyColor && popup ? "" : void 0,
      "data-page-bg": value12,
      style: value15,
      onPointerDown: companionModalCatcher ? handleModalCatcherPointerDown : void 0,
      onMouseDown: companionModalCatcher ? handleModalCatcherMouseDown : void 0,
      onDragStart: companionModalCatcher ? handleModalCatcherDragStart : void 0,
      children: jsxPortalRoot.jsx(runtime2.portalDensityContext.Provider, {
        value: value4,
        children: jsxPortalRoot.jsx(runtime2.surfaceBackgroundContext.Provider, {
          value: value14,
          children: jsxPortalRoot.jsx(runtime2.isPortalRootContext.Provider, {
            value: !0,
            children: jsxPortalRoot.jsx(pointerDismissalContext.Provider, {
              value: !1,
              children: jsxPortalRoot.jsx(ResetSkeletonContexts, {
                children
              })
            })
          })
        })
      })
    });
  }
  function resolveIconSize(size4, densitySize) {
    return size4 === "auto" ? densitySize : size4 === "auto-sm" || size4 === "auto-lg" ? iconSizes[iconSizes.indexOf(densitySize) + (size4 === "auto-lg" ? 1 : -1)] ?? densitySize : size4;
  }
  function useDensityIconSize() {
    return (0, runtime2.useDensity)() === "comfortable" ? "md" : "sm";
  }
  function useIconSize(input = DEFAULT_ICON_SIZE) {
    return resolveIconSize(input, useDensityIconSize());
  }
  function getClosestIconSize(pixels) {
    let closestSize = iconSizes[0], minimumDistance = 1 / 0;
    for (let value of iconSizes) {
      let value2 = Math.abs(iconSizeMetrics[value].px - pixels);
      value2 <= minimumDistance && (minimumDistance = value2, closestSize = value);
    }
    return closestSize;
  }
  function calculateIconFontWeight(strokeWidth, masterSize, pixels) {
    let normalizedWeight = strokeWidth * masterSize / pixels, { lo: minimumMasterWeight, hi: maximumMasterWeight } = iconWeightBounds[`${masterSize}`], weightFraction = (normalizedWeight - minimumMasterWeight) / (maximumMasterWeight - minimumMasterWeight), fontWeight = MIN_ICON_FONT_WEIGHT + (MAX_ICON_FONT_WEIGHT - MIN_ICON_FONT_WEIGHT) * weightFraction;
    return Math.round(Math.max(MIN_ICON_FONT_WEIGHT, Math.min(MAX_ICON_FONT_WEIGHT, fontWeight)) * 10) / 10;
  }
  function validateIconAccessibility(input, options) {
  }
  function getCustomIconFontStyle(pixels, strokeWidth) {
    let masterSize = pixels <= 18 ? 16 : 20;
    return {
      fontSize: pixelsToScaledRem(pixels),
      fontWeight: calculateIconFontWeight(strokeWidth, masterSize, pixels)
    };
  }
  function createIconSizeStyles(size4) {
    let { px: pixels, stroke } = iconSizeMetrics[size4];
    return Object.freeze({
      regular: Object.freeze(getCustomIconFontStyle(pixels, stroke.regular)),
      ..."strong" in stroke && {
        strong: Object.freeze(getCustomIconFontStyle(pixels, stroke.strong))
      }
    });
  }
  function unquoteFontFamily(family) {
    return family.replace(/^["']|["']$/g, "");
  }
  function splitFontFamilyList(fontFamily) {
    return fontFamily.split(",").map((family) => family.trim()).filter(Boolean);
  }
  function isFontFamilyLoaded(fonts, family) {
    let loaded = !1;
    return fonts.forEach((face) => {
      unquoteFontFamily(face.family) === family && (loaded ||= face.status === "loaded");
    }), loaded;
  }
  function findIconFontFamilyStack(element, doc, elementWindow) {
    let candidates = [
      element,
      ...doc.querySelectorAll('[data-cds="Icon"]:not(svg)')
    ].slice(0, MAX_ICON_FONT_PROBES);
    for (let candidate of candidates)
      if (candidate.isConnected) {
        let families = splitFontFamilyList(elementWindow.getComputedStyle(candidate).fontFamily);
        if (families.length > 1)
          return families;
      }
    return [];
  }
  function retryIconFontLoad(element) {
    let doc = element?.ownerDocument;
    if (!element || !doc || iconFontRetriedDocuments.has(doc))
      return;
    let fonts = doc.fonts, elementWindow = (0, runtime2.getElementWindow)(element);
    !fonts || !elementWindow || (iconFontRetriedDocuments.add(doc), elementWindow.setTimeout(() => {
      let [firstFamily = "", ...fallbackFamilies] = findIconFontFamilyStack(element, doc, elementWindow);
      if (fallbackFamilies.length === 0) {
        let attempts = (iconFontRetryCounts.get(doc) ?? 0) + 1;
        iconFontRetryCounts.set(doc, attempts), attempts < MAX_ICON_FONT_RETRIES && iconFontRetriedDocuments.delete(doc);
        return;
      }
      isFontFamilyLoaded(fonts, unquoteFontFamily(firstFamily)) || fonts.load(`16px ${fallbackFamilies.join(", ")}`).catch(() => {
      });
    }, ICON_FONT_RETRY_DELAY));
  }
  function getIconRotateProps(rotate) {
    return rotate === void 0 || rotate === 0 ? {} : {
      "data-cds-rotate": "",
      style: {
        "--cds-icon-rotate": `${rotate}deg`
      }
    };
  }
  function Icon(input) {
    let value = useDensityIconSize(), fizzyIcons = (0, runtime2.useFeatureFlagPart)("icons");
    if (input.customIcon) {
      let { customIcon: value27, size: value35 = DEFAULT_ICON_SIZE, alt: value28, className: value29, style: value30, rotate: rotate2, name: value31, icon: value32, animated: value33, ...value34 } = input, rotateProps2 = getIconRotateProps(rotate2), px = iconSizeMetrics[resolveIconSize(value35, value)].px, value36 = pixelsToScaledRem(px);
      return jsxIcons.jsx("svg", {
        "data-cds": "Icon",
        width: "1em",
        height: "1em",
        viewBox: `0 0 ${value27.viewBox} ${value27.viewBox}`,
        fill: "currentColor",
        fillRule: "evenodd",
        stroke: "none",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        xmlns: "http://www.w3.org/2000/svg",
        "data-cds-rotate": rotateProps2["data-cds-rotate"],
        style: {
          ...customIconBaseStyle,
          fontSize: value36,
          ...rotateProps2.style,
          ...value30
        },
        className: value29,
        ...value34,
        role: value34.role ?? (value28 ? "img" : void 0),
        "aria-hidden": value34["aria-hidden"] ?? (value28 ? void 0 : !0),
        "aria-label": value34["aria-label"] ?? (value28 || void 0),
        children: value27.paths.map((input2, options) => typeof input2 == "string" ? jsxIcons.jsx("path", {
          d: input2
        }, options) : jsxIcons.jsx("path", {
          d: input2.d,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: input2.strokeWidth,
          vectorEffect: "non-scaling-stroke"
        }, options))
      });
    }
    let { bold: value11 = !1, animated: value12 = !1, alt: value2, className: value3, style: value4, rotate, name: value5, icon: value6, size: value7, customSize: value8, customIcon: value9, ...value10 } = input, rotateProps = getIconRotateProps(rotate), requestedName = input.name ?? input.icon.name, value13 = fizzyIcons && requestedName === "DotsVertical" ? "DotsHorizontal" : requestedName, value14, value15;
    value8 !== void 0 ? (value14 = value8, value15 = getClosestIconSize(value14)) : (value15 = resolveIconSize(value7 ?? DEFAULT_ICON_SIZE, value), value14 = iconSizeMetrics[value15].px);
    let stroke = iconSizeMetrics[value15].stroke, value16 = value7 === "auto" || value7 === "auto-sm" || value7 === "auto-lg", value17 = value11 && !("strong" in stroke) && !value16, primaryGlyph = primaryIconGlyphs[value13], value18 = primaryGlyph ?? fizzyIconGlyphs[value13], fizzyOnlyGlyph = value18 !== primaryGlyph, value19 = value18 === void 0 ? void 0 : secondaryIconGlyphs[value13], value20 = iconFontStyles[value15], value21 = value8 === void 0 ? value11 && value20.strong !== void 0 ? value20.strong : value20.regular : getCustomIconFontStyle(value14, value11 && "strong" in stroke ? stroke.strong : stroke.regular), value22 = value12 && animatedIcons.has(value13), mirrorName = fizzyOnlyGlyph ? fizzyIconFallbacks[value13] : value13, mirrored = mirrorName !== void 0 && mirroredIcons.has(mirrorName), value23 = value22 ? animationDurations[value13] : void 0, value24 = value22 ? animationExitDurations[value13] : void 0, value25 = value22 ? animationEasings[value13] : void 0, value26 = value22 ? {
      ...value21,
      "--cds-opsz": value14,
      "--cds-wght": value21.fontWeight,
      ...value23 !== void 0 && {
        "--cds-anim-dur": `${value23}ms`
      },
      ...value24 !== void 0 && {
        "--cds-anim-dur-out": `${value24}ms`
      },
      ...value25 !== void 0 && {
        "--cds-anim-ease": value25
      }
    } : value21;
    return jsxIcons.jsxs("span", {
      "data-cds": "Icon",
      ref: fizzyIcons ? retryIconFontLoad : void 0,
      "data-cds-anim": value22 ? "" : void 0,
      "data-cds-anim-loop": value22 && loopingIcons.has(value13) ? "" : void 0,
      "data-cds-mirror": mirrored ? "" : void 0,
      "data-cds-rotate": rotateProps["data-cds-rotate"],
      style: value4 || rotateProps.style ? {
        ...value26,
        ...rotateProps.style,
        ...value4
      } : value26,
      className: value3,
      ...value10,
      role: value10.role ?? (value2 ? "img" : void 0),
      "aria-hidden": value10["aria-hidden"] ?? (value2 ? void 0 : !0),
      "aria-label": value10["aria-label"] ?? (value2 || void 0),
      children: [
        value19 !== void 0 && jsxIcons.jsx("span", {
          "data-cds-icon-layer": "secondary",
          "aria-hidden": "true",
          children: String.fromCodePoint(value19)
        }),
        value18 !== void 0 ? String.fromCodePoint(value18) : null
      ]
    });
  }
  function isIconName(input) {
    return typeof input == "string";
  }
  function isKnownIconName(name) {
    return Object.hasOwn(primaryIconGlyphs, name);
  }
  function filledIconName(name) {
    let filledName = `${name}实心`;
    return primaryIconGlyphs[filledName] === void 0 ? name : filledName;
  }
  function IconSlot({ icon, firstLine = !1 }) {
    return jsxIcons.jsx("span", {
      className: firstLine ? ICON_SLOT_FIRST_LINE_CLASS_NAME : ICON_SLOT_CLASS_NAME,
      children: isIconName(icon) ? jsxIcons.jsx(Icon, {
        name: icon,
        size: "auto"
      }) : icon
    });
  }
  function readDesktopTitlebarInset(doc) {
    let documentElement = doc.documentElement, value = doc.defaultView?.getComputedStyle(documentElement).getPropertyValue("--desktop-titlebar-inset") || documentElement.style.getPropertyValue("--desktop-titlebar-inset"), value2 = Number.parseFloat(value);
    return Number.isFinite(value2) && value2 > 0 ? value2 : 0;
  }
  function getDesktopTitlebarStore(doc) {
    let entry = desktopTitlebarStores.get(doc);
    if (entry === void 0) {
      let values = /* @__PURE__ */ new Set(), value = null, flag = !1, value2, flag2 = !1, callback = () => (flag2 = !1, value2 = readDesktopTitlebarInset(doc), value2);
      entry = {
        subscribe(input) {
          if (values.add(input), value === null && !flag) {
            let value3 = (0, runtime2.createSafeMutationObserver)(MutationObserver, () => {
              if (values.size === 0) {
                flag2 = !0;
                return;
              }
              let value4 = value2;
              if (callback() !== value4)
                for (let value5 of values)
                  value5();
            });
            value3.observe(doc.documentElement, {
              attributes: !0,
              attributeFilter: ["style"]
            }) ? (callback(), value = value3) : flag = !0;
          }
          return () => {
            values.delete(input);
          };
        },
        getSnapshot: () => {
          if (value === null)
            return readDesktopTitlebarInset(doc);
          let value3 = values.size === 0 && value.takeRecords().length > 0;
          return (flag2 || value3) && callback(), value2;
        }
      }, desktopTitlebarStores.set(doc, entry);
    }
    return entry;
  }
  function resolveContainerElement(input) {
    let callback = (input2) => typeof input2 == "object" && input2 !== null && (input2.nodeType === 1 || input2.nodeType === 11) && "ownerDocument" in input2;
    if (callback(input))
      return input;
    if (typeof input == "object" && input !== null && "current" in input) {
      let current = input.current;
      return callback(current) ? current : null;
    }
    return null;
  }
  function useDesktopTitlebarInset(input) {
    let value = (0, runtime2.useRootElement)(), callback = reactCollisionPadding.useCallback(() => (resolveContainerElement(input) ?? value)?.ownerDocument ?? (typeof document > "u" ? null : document), [input, value]), [value2, value3] = reactCollisionPadding.useState(callback);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      value3(callback());
    });
    let memo4 = reactCollisionPadding.useMemo(() => value2 === null ? null : getDesktopTitlebarStore(value2), [value2]);
    return reactCollisionPadding.useSyncExternalStore(memo4 === null ? subscribeInsetNoop : memo4.subscribe, memo4 === null ? getZeroInsetSnapshot : memo4.getSnapshot, getZeroInsetSnapshot);
  }
  function useCollisionPadding(input, options) {
    let value = useDesktopTitlebarInset(options);
    return reactCollisionPadding.useMemo(() => {
      if (input !== void 0)
        return input;
      if (!(value <= 0))
        return {
          top: DEFAULT_COLLISION_PADDING + value,
          right: DEFAULT_COLLISION_PADDING,
          bottom: DEFAULT_COLLISION_PADDING,
          left: DEFAULT_COLLISION_PADDING
        };
    }, [input, value]);
  }
  function CollisionPaddingProvider({ override, container, provideInherit = !1, children }) {
    let value = useCollisionPadding(override, container), memo4 = reactCollisionPadding.useMemo(() => ({
      collisionPadding: value
    }), [value]), value2 = children(value);
    return provideInherit ? jsxCollisionPadding.jsx(collisionPaddingContext.Provider, {
      value: memo4,
      children: value2
    }) : value2;
  }
  function getSurfaceClasses(input) {
    return `rounded-card ${surfaceBackgroundClasses[elevationSurfaceNames[input]]} ${elevationShadowClasses[input]} ${SURFACE_FORCED_COLORS_BORDER_CLASS}`;
  }
  function createMenuVirtualAnchor(input) {
    return {
      get contextElement() {
        return input.triggerRef.current ?? void 0;
      },
      getBoundingClientRect: () => {
        let value = input.triggerRef.current?.getBoundingClientRect(), value2 = input.triggerRef.current?.closest(MENU_ANCHOR_SELECTOR)?.getBoundingClientRect(), value3 = value2?.x ?? value?.x ?? 0, value4 = value?.y ?? 0, value5 = value2?.width ?? value?.width ?? 0, value6 = value?.height ?? 0;
        return {
          x: value3,
          y: value4,
          width: value5,
          height: value6,
          top: value4,
          left: value3,
          right: value3 + value5,
          bottom: value4 + value6
        };
      }
    };
  }
  function warnNestedMenuLayerOffset() {
    console.warn("cds: layerOffset is ignored on nested `Menu.Popup` / `ContextMenu.SubmenuPopup` — a submenu's parent band is the root menu's own band, where the root's click shield sits; joining it would interleave the submenu with the root's own popup and shield — below them at low offsets. Set layerOffset on the root popup instead.");
  }
  function warnNestedMenuInitialFocus() {
    console.warn("cds: initialFocus is ignored on nested `Menu.Popup` / `ContextMenu.SubmenuPopup` — whether an open moves focus is the root popup's decision and its submenus follow it. Set initialFocus on the root Menu.Popup instead.");
  }
  function useStableObjectRef() {
    let [value] = reactMenuContexts.useState(() => ({
      current: null
    }));
    return value;
  }
  function isMenuScrollOpenSeen(element, record) {
    return menuScrollOpenRecords.has(element) && menuScrollOpenRecords.get(element) === record;
  }
  function prefersMenuScrollReset(cell, target) {
    let type = cell?.getOpen()?.type;
    if (type === "keyboard")
      return !1;
    if (type === "mouse")
      return !0;
    try {
      return !target.matches(":focus-visible");
    } catch {
      return !1;
    }
  }
  function resetMenuScrollOnFocus(event, cell) {
    let container = event.currentTarget, record = cell?.getOpen() ?? null;
    if (isMenuScrollOpenSeen(container, record) || !(event.target instanceof Node) || !container.contains(event.target))
      return;
    menuScrollOpenRecords.set(container, record);
    let menu = container.closest('[role="menu"]') ?? container, target = event.target;
    if (event.relatedTarget instanceof Node && menu.contains(event.relatedTarget) || !(target instanceof Element) || target.matches('[role^="menuitem"]') || !(target.ownerDocument.defaultView !== null && target instanceof target.ownerDocument.defaultView.HTMLElement) || !prefersMenuScrollReset(cell, target))
      return;
    let reveal = () => target.scrollIntoView({
      block: "nearest"
    }), detach = () => {
      container.removeEventListener("scroll", onScroll), MENU_SCROLL_INTERACTION_EVENTS.forEach((name) => container.removeEventListener(name, detach));
    }, onBlur = () => {
      detach(), target.removeEventListener("keydown", reveal);
    }, onScroll = () => {
      detach(), container.scrollTop = 0;
    };
    container.addEventListener("scroll", onScroll), MENU_SCROLL_INTERACTION_EVENTS.forEach((name) => container.addEventListener(name, detach, {
      passive: !0
    })), target.addEventListener("blur", onBlur, {
      once: !0
    }), target.addEventListener("keydown", reveal, {
      once: !0
    }), container.scrollTop = 0, queueMicrotask(() => {
      container.scrollTop = 0;
    });
  }
  function MenuScrollContent({ header, headerClassName, footer, maxVisibleItems, fill = !1, children }) {
    let cell = reactMenuScrollContent.useContext(runtime2.passiveOpenStateContext), markSeen = (event) => {
      menuScrollOpenRecords.set(event.currentTarget, cell?.getOpen() ?? null);
    }, scrollHandlers = {
      onFocus: (event) => resetMenuScrollOnFocus(event, cell),
      onWheel: markSeen,
      onTouchStart: markSeen,
      onKeyDown: markSeen,
      onPointerDown: markSeen
    }, value = maxVisibleItems !== void 0 ? `calc(${maxVisibleItems} * ${MENU_ITEM_HEIGHT_CSS} + ${header ? "var(--cds-menu-gutter, 0.25rem) + 0.25rem" : "2 * var(--cds-menu-gutter, 0.25rem)"})` : void 0;
    return header || footer ? jsxMenuScrollContent.jsxs("div", {
      className: (0, runtime2.clsx)("flex min-h-0 flex-col overflow-hidden rounded-[inherit]", fill && "flex-1"),
      children: [
        header && jsxMenuScrollContent.jsx("div", {
          className: cn(menuHeaderClasses, headerClassName),
          children: header
        }),
        jsxMenuScrollContent.jsx("div", {
          style: {
            maxHeight: value
          },
          className: `${menuBodyScrollClasses}${header ? " pt-0" : ""}`,
          ...scrollHandlers,
          [runtime2.SHEET_SCROLL_ATTRIBUTE]: "",
          children
        }),
        footer && jsxMenuScrollContent.jsx("div", {
          className: menuFooterClasses,
          children: footer
        })
      ]
    }) : jsxMenuScrollContent.jsx("div", {
      style: {
        maxHeight: value
      },
      className: (0, runtime2.clsx)(menuScrollClasses, fill && "flex-1"),
      ...scrollHandlers,
      [runtime2.SHEET_SCROLL_ATTRIBUTE]: "",
      children
    });
  }
  function isKeyboardContextMenuEvent(input) {
    if (input === void 0 || input.type !== "contextmenu")
      return !1;
    let { button: value, pointerType: value2 } = input;
    return value === -1 && value2 !== "touch" && value2 !== "pen";
  }
  function recordKeyboardContextMenuOpen(input, options, context) {
    context.isCanceled || (options && isKeyboardContextMenuEvent(context.event) ? keyboardContextMenuRoots.set(input, !0) : keyboardContextMenuRoots.delete(input));
  }
  function useKeyboardContextMenuInitialFocus(input) {
    let value = reactKeyboardContextMenuFocus.useContext(menuRootIdentityContext), pendingEvent = reactKeyboardContextMenuFocus.useContext(keyboardContextMenuEventContext);
    reactKeyboardContextMenuFocus.useEffect(() => {
      if (value === null || (pendingEvent !== void 0 && recordKeyboardContextMenuOpen(value, !0, {
        isCanceled: !1,
        event: pendingEvent ?? void 0
      }), !keyboardContextMenuRoots.has(value)))
        return;
      let index4 = 0, count = 3, callback = () => {
        let current = input.current, value2 = current?.ownerDocument.activeElement ?? null;
        if (current !== null && value2 !== null && !current.contains(value2) && count > 0) {
          count -= 1, index4 = requestAnimationFrame(callback);
          return;
        }
        keyboardContextMenuRoots.delete(value), current !== null && value2 === current && current.querySelector('[role^="menuitem"]:not([data-disabled])')?.focus({
          preventScroll: !0
        });
      };
      return index4 = requestAnimationFrame(callback), () => {
        cancelAnimationFrame(index4);
      };
    }, [value, pendingEvent, input]);
  }
  function blurWithSafeRelatedTarget(input) {
    let callback = (input2) => {
      let relatedTarget = input2.relatedTarget;
      relatedTarget != null && (0, runtime2.asElement)(relatedTarget) === null && Object.defineProperty(input2, "relatedTarget", {
        value: null,
        configurable: !0
      });
    };
    input.addEventListener("focusout", callback, !0);
    try {
      input.blur();
    } finally {
      input.removeEventListener("focusout", callback, !0);
    }
  }
  function registerOverlayOwner(input, options) {
    runtime2.overlayOwnerResolvers.set(input, options);
  }
  function useOverlayOwnerRef(resolveDefault, finalFocus) {
    let finalFocusRef = runtime2.reactOverlayOwners.useRef(finalFocus);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      finalFocusRef.current = finalFocus;
    }, [finalFocus]);
    let resolveOwner = runtime2.reactOverlayOwners.useCallback(() => {
      let current = finalFocusRef.current;
      return current === !1 || typeof current == "function" ? null : current === void 0 || current === !0 || current === null ? resolveDefault() : current.current ?? resolveDefault();
    }, [resolveDefault]);
    return runtime2.reactOverlayOwners.useCallback((element) => {
      element !== null && registerOverlayOwner(element, resolveOwner);
    }, [resolveOwner]);
  }
  function unmarkSheetTreeDialog(element) {
    element !== null && runtime2.sheetTreeDialogs.set(element, !1);
  }
  function markSheetTreeDialog(element) {
    element !== null && runtime2.sheetTreeDialogs.set(element, !0);
  }
  function isSheetTreeDialog(element) {
    return runtime2.sheetTreeDialogs.get(element) === !0;
  }
  function getOverlayOwnerChain(input) {
    let targets = [], value = input;
    for (; value !== null && targets.length < runtime2.MAX_OVERLAY_OWNER_DEPTH; ) {
      if (runtime2.sheetTreeDialogs.has(value))
        return {
          targets,
          dialog: value
        };
      let entry = runtime2.overlayOwnerResolvers.get(value);
      if (entry === void 0) {
        value = value.parentElement;
        continue;
      }
      let value2 = entry();
      if (value2 === null || value2 === value || targets.includes(value2))
        break;
      targets.push(value2), value = value2;
    }
    return {
      targets,
      dialog: null
    };
  }
  return bindRuntimeValue(runtime2, "cn", () => cn), bindRuntimeValue(runtime2, "classMergeThemeKeys", () => classMergeThemeKeys, (value) => {
    classMergeThemeKeys = value;
  }), bindRuntimeValue(runtime2, "classMergeTypographyScale", () => classMergeTypographyScale, (value) => {
    classMergeTypographyScale = value;
  }), bindRuntimeValue(runtime2, "classMergeTypographyWeights", () => classMergeTypographyWeights, (value) => {
    classMergeTypographyWeights = value;
  }), bindRuntimeValue(runtime2, "classMergeWeightRoleMarkers", () => classMergeWeightRoleMarkers, (value) => {
    classMergeWeightRoleMarkers = value;
  }), bindRuntimeValue(runtime2, "hitGapTokenValues", () => hitGapTokenValues, (value) => {
    hitGapTokenValues = value;
  }), bindRuntimeValue(runtime2, "hitGridGapTokenValues", () => hitGridGapTokenValues, (value) => {
    hitGridGapTokenValues = value;
  }), bindRuntimeValue(runtime2, "getClassMergeThemeValues", () => getClassMergeThemeValues, (value) => {
    getClassMergeThemeValues = value;
  }), bindRuntimeValue(runtime2, "paddingTokenNames", () => paddingTokenNames, (value) => {
    paddingTokenNames = value;
  }), bindRuntimeValue(runtime2, "marginTokenNames", () => marginTokenNames, (value) => {
    marginTokenNames = value;
  }), bindRuntimeValue(runtime2, "gapTokenNames", () => gapTokenNames, (value) => {
    gapTokenNames = value;
  }), bindRuntimeValue(runtime2, "createDirectionalClassGroups", () => createDirectionalClassGroups, (value) => {
    createDirectionalClassGroups = value;
  }), bindRuntimeValue(runtime2, "typographyClassNames", () => typographyClassNames, (value) => {
    typographyClassNames = value;
  }), bindRuntimeValue(runtime2, "typographyWeightClassNames", () => typographyWeightClassNames, (value) => {
    typographyWeightClassNames = value;
  }), bindRuntimeValue(runtime2, "mergeTailwindClasses", () => mergeTailwindClasses, (value) => {
    mergeTailwindClasses = value;
  }), bindRuntimeValue(runtime2, "initializeClassNames", () => initializeClassNames, (value) => {
    initializeClassNames = value;
  }), bindRuntimeValue(runtime2, "interpolateTranslation", () => interpolateTranslation), bindRuntimeValue(runtime2, "translateWithFallback", () => translateWithFallback), bindRuntimeValue(runtime2, "useTranslation", () => useTranslation), bindRuntimeValue(runtime2, "reactTranslations", () => reactTranslations, (value) => {
    reactTranslations = value;
  }), bindRuntimeValue(runtime2, "translationContext", () => translationContext, (value) => {
    translationContext = value;
  }), bindRuntimeValue(runtime2, "initializeTranslations", () => initializeTranslations, (value) => {
    initializeTranslations = value;
  }), bindRuntimeValue(runtime2, "SheetHandle", () => SheetHandle), bindRuntimeValue(runtime2, "SheetTitleBar", () => SheetTitleBar), bindRuntimeValue(runtime2, "SheetBody", () => SheetBody), bindRuntimeValue(runtime2, "reactSheetChrome", () => reactSheetChrome, (value) => {
    reactSheetChrome = value;
  }), bindRuntimeValue(runtime2, "jsxSheetChrome", () => jsxSheetChrome, (value) => {
    jsxSheetChrome = value;
  }), bindRuntimeValue(runtime2, "SheetDismissButton", () => SheetDismissButton, (value) => {
    SheetDismissButton = value;
  }), bindRuntimeValue(runtime2, "SheetChrome", () => SheetChrome, (value) => {
    SheetChrome = value;
  }), bindRuntimeValue(runtime2, "initializeSheetChrome", () => initializeSheetChrome, (value) => {
    initializeSheetChrome = value;
  }), bindRuntimeValue(runtime2, "getFiniteRunningAnimations", () => getFiniteRunningAnimations), bindRuntimeValue(runtime2, "isFiniteRunningAnimation", () => isFiniteRunningAnimation), bindRuntimeValue(runtime2, "afterElementAnimations", () => afterElementAnimations), bindRuntimeValue(runtime2, "initializeAnimationWait", () => initializeAnimationWait, (value) => {
    initializeAnimationWait = value;
  }), bindRuntimeValue(runtime2, "useSheetTextEntryFocus", () => useSheetTextEntryFocus), bindRuntimeValue(runtime2, "useSheetPressedState", () => useSheetPressedState), bindRuntimeValue(runtime2, "isScrollContentReplacement", () => isScrollContentReplacement), bindRuntimeValue(runtime2, "measureNaturalSheetHeight", () => measureNaturalSheetHeight), bindRuntimeValue(runtime2, "createSheetUncoverGate", () => createSheetUncoverGate), bindRuntimeValue(runtime2, "afterCssTransitions", () => afterCssTransitions), bindRuntimeValue(runtime2, "measureSheetScrollContent", () => measureSheetScrollContent), bindRuntimeValue(runtime2, "measureSheetControlOverflow", () => measureSheetControlOverflow), bindRuntimeValue(runtime2, "useDismissSheetOnForeignFocus", () => useDismissSheetOnForeignFocus), bindRuntimeValue(runtime2, "getSheetTreeAnnouncement", () => getSheetTreeAnnouncement), bindRuntimeValue(runtime2, "subscribeSheetTreeAnnouncements", () => subscribeSheetTreeAnnouncements), bindRuntimeValue(runtime2, "announceSheetTreeDialog", () => announceSheetTreeDialog), bindRuntimeValue(runtime2, "useSheetTreeDialogAnnouncement", () => useSheetTreeDialogAnnouncement), bindRuntimeValue(runtime2, "findSheetTreeDialogAncestor", () => findSheetTreeDialogAncestor), bindRuntimeValue(runtime2, "useElementSetRegistration", () => useElementSetRegistration), bindRuntimeValue(runtime2, "createOutsidePressWrappers", () => createOutsidePressWrappers), bindRuntimeValue(runtime2, "useOutsidePressWrapperRef", () => useOutsidePressWrapperRef), bindRuntimeValue(runtime2, "isDomNode", () => isDomNode), bindRuntimeValue(runtime2, "useCdsLayerAwareZIndex", () => useCdsLayerAwareZIndex), bindRuntimeValue(runtime2, "outsidePressWrappersContext", () => outsidePressWrappersContext, (value) => {
    outsidePressWrappersContext = value;
  }), bindRuntimeValue(runtime2, "initializeOutsidePressWrappers", () => initializeOutsidePressWrappers, (value) => {
    initializeOutsidePressWrappers = value;
  }), bindRuntimeValue(runtime2, "sheetTreeHostsContext", () => sheetTreeHostsContext, (value) => {
    sheetTreeHostsContext = value;
  }), bindRuntimeValue(runtime2, "EMPTY_SHEET_TREES", () => EMPTY_SHEET_TREES, (value) => {
    EMPTY_SHEET_TREES = value;
  }), bindRuntimeValue(runtime2, "sheetTreeAnnouncements", () => sheetTreeAnnouncements, (value) => {
    sheetTreeAnnouncements = value;
  }), bindRuntimeValue(runtime2, "sheetTreeAnnouncementListeners", () => sheetTreeAnnouncementListeners, (value) => {
    sheetTreeAnnouncementListeners = value;
  }), bindRuntimeValue(runtime2, "initializeSheetTreeAnnouncements", () => initializeSheetTreeAnnouncements, (value) => {
    initializeSheetTreeAnnouncements = value;
  }), bindRuntimeValue(runtime2, "reactSheetMeasurement", () => reactSheetMeasurement, (value) => {
    reactSheetMeasurement = value;
  }), bindRuntimeValue(runtime2, "initializeSheetMeasurement", () => initializeSheetMeasurement, (value) => {
    initializeSheetMeasurement = value;
  }), bindRuntimeValue(runtime2, "createPinnedSheetMeasurement", () => createPinnedSheetMeasurement), bindRuntimeValue(runtime2, "useSheetHeightUntilVisible", () => useSheetHeightUntilVisible), bindRuntimeValue(runtime2, "useSheetPopupHost", () => useSheetPopupHost), bindRuntimeValue(runtime2, "SheetPopupHost", () => SheetPopupHost), bindRuntimeValue(runtime2, "reactSheetPopupHost", () => reactSheetPopupHost, (value) => {
    reactSheetPopupHost = value;
  }), bindRuntimeValue(runtime2, "initializeSheetPopupHost", () => initializeSheetPopupHost, (value) => {
    initializeSheetPopupHost = value;
  }), bindRuntimeValue(runtime2, "checkLayerBase", () => checkLayerBase), bindRuntimeValue(runtime2, "CdsLayer", () => CdsLayer), bindRuntimeValue(runtime2, "warnInvalidLayerOffset", () => warnInvalidLayerOffset), bindRuntimeValue(runtime2, "useDefaultOverlayLayer", () => useDefaultOverlayLayer), bindRuntimeValue(runtime2, "useOverlayLayer", () => useOverlayLayer), bindRuntimeValue(runtime2, "CdsLayerVarBridge", () => CdsLayerVarBridge), bindRuntimeValue(runtime2, "reactLayers", () => reactLayers, (value) => {
    reactLayers = value;
  }), bindRuntimeValue(runtime2, "jsxLayers", () => jsxLayers, (value) => {
    jsxLayers = value;
  }), bindRuntimeValue(runtime2, "LAYER_BAND_SIZE", () => LAYER_BAND_SIZE, (value) => {
    LAYER_BAND_SIZE = value;
  }), bindRuntimeValue(runtime2, "TOAST_LAYER_BASE", () => TOAST_LAYER_BASE, (value) => {
    TOAST_LAYER_BASE = value;
  }), bindRuntimeValue(runtime2, "layerBaseContext", () => layerBaseContext, (value) => {
    layerBaseContext = value;
  }), bindRuntimeValue(runtime2, "overlayLayerOffsets", () => overlayLayerOffsets, (value) => {
    overlayLayerOffsets = value;
  }), bindRuntimeValue(runtime2, "portalLayerClasses", () => portalLayerClasses, (value) => {
    portalLayerClasses = value;
  }), bindRuntimeValue(runtime2, "initializeLayers", () => initializeLayers, (value) => {
    initializeLayers = value;
  }), bindRuntimeValue(runtime2, "setReactRef", () => setReactRef), bindRuntimeValue(runtime2, "mergeRefs", () => mergeRefs), bindRuntimeValue(runtime2, "useMergedRefs", () => useMergedRefs2), bindRuntimeValue(runtime2, "useStableMergedRef", () => useStableMergedRef), bindRuntimeValue(runtime2, "reactMergedRefs", () => reactMergedRefs, (value) => {
    reactMergedRefs = value;
  }), bindRuntimeValue(runtime2, "initializeMergedRefs", () => initializeMergedRefs, (value) => {
    initializeMergedRefs = value;
  }), bindRuntimeValue(runtime2, "resolveExperimentalTheme", () => resolveExperimentalTheme), bindRuntimeValue(runtime2, "createThemeStore", () => createThemeStore), bindRuntimeValue(runtime2, "useCdsThemeId", () => useCdsThemeId), bindRuntimeValue(runtime2, "reportThemeErrorOnce", () => reportThemeErrorOnce), bindRuntimeValue(runtime2, "reportThemeApplicationError", () => reportThemeApplicationError), bindRuntimeValue(runtime2, "disposeThemeApplication", () => disposeThemeApplication), bindRuntimeValue(runtime2, "useExperimentalThemeStore", () => useExperimentalThemeStore), bindRuntimeValue(runtime2, "reactExperimentalTheme", () => reactExperimentalTheme, (value) => {
    reactExperimentalTheme = value;
  }), bindRuntimeValue(runtime2, "createResolvedThemeSnapshot", () => createResolvedThemeSnapshot, (value) => {
    createResolvedThemeSnapshot = value;
  }), bindRuntimeValue(runtime2, "themeStoreContext", () => themeStoreContext, (value) => {
    themeStoreContext = value;
  }), bindRuntimeValue(runtime2, "defaultThemeStore", () => defaultThemeStore, (value) => {
    defaultThemeStore = value;
  }), bindRuntimeValue(runtime2, "reportedThemeErrors", () => reportedThemeErrors, (value) => {
    reportedThemeErrors = value;
  }), bindRuntimeValue(runtime2, "initializeExperimentalTheme", () => initializeExperimentalTheme, (value) => {
    initializeExperimentalTheme = value;
  }), bindRuntimeValue(runtime2, "getElementNamespace", () => getElementNamespace), bindRuntimeValue(runtime2, "isHtmlElement", () => isHtmlElement), bindRuntimeValue(runtime2, "isSvgElement", () => isSvgElement), bindRuntimeValue(runtime2, "HTML_NAMESPACE", () => HTML_NAMESPACE, (value) => {
    HTML_NAMESPACE = value;
  }), bindRuntimeValue(runtime2, "SVG_NAMESPACE_GE0", () => SVG_NAMESPACE_GE0, (value) => {
    SVG_NAMESPACE_GE0 = value;
  }), bindRuntimeValue(runtime2, "initializeElementNamespaces", () => initializeElementNamespaces, (value) => {
    initializeElementNamespaces = value;
  }), bindRuntimeValue(runtime2, "isHiddenByInlineDisplay", () => isHiddenByInlineDisplay), bindRuntimeValue(runtime2, "hasOpenChild", () => hasOpenChild), bindRuntimeValue(runtime2, "CloseOnActivityHideProvider", () => CloseOnActivityHideProvider), bindRuntimeValue(runtime2, "useCloseOnActivityHideRef", () => useCloseOnActivityHideRef), bindRuntimeValue(runtime2, "reactActivityHide", () => reactActivityHide, (value) => {
    reactActivityHide = value;
  }), bindRuntimeValue(runtime2, "jsxActivityHide", () => jsxActivityHide, (value) => {
    jsxActivityHide = value;
  }), bindRuntimeValue(runtime2, "activityHideElementsContext", () => activityHideElementsContext, (value) => {
    activityHideElementsContext = value;
  }), bindRuntimeValue(runtime2, "initializeCloseOnActivityHide", () => initializeCloseOnActivityHide, (value) => {
    initializeCloseOnActivityHide = value;
  }), bindRuntimeValue(runtime2, "getCompanionModalCatcher", () => getCompanionModalCatcher), bindRuntimeValue(runtime2, "shouldSuppressModalCatcherFocus", () => shouldSuppressModalCatcherFocus), bindRuntimeValue(runtime2, "handleModalCatcherPointerDown", () => handleModalCatcherPointerDown), bindRuntimeValue(runtime2, "handleModalCatcherMouseDown", () => handleModalCatcherMouseDown), bindRuntimeValue(runtime2, "handleModalCatcherDragStart", () => handleModalCatcherDragStart), bindRuntimeValue(runtime2, "modalCatcherDragSession", () => modalCatcherDragSession, (value) => {
    modalCatcherDragSession = value;
  }), bindRuntimeValue(runtime2, "modalCatcherDragEndEvents", () => modalCatcherDragEndEvents, (value) => {
    modalCatcherDragEndEvents = value;
  }), bindRuntimeValue(runtime2, "initializeModalCatcher", () => initializeModalCatcher, (value) => {
    initializeModalCatcher = value;
  }), bindRuntimeValue(runtime2, "reactPointerDismissal", () => reactPointerDismissal, (value) => {
    reactPointerDismissal = value;
  }), bindRuntimeValue(runtime2, "jsxPointerDismissal", () => jsxPointerDismissal, (value) => {
    jsxPointerDismissal = value;
  }), bindRuntimeValue(runtime2, "pointerDismissalContext", () => pointerDismissalContext, (value) => {
    pointerDismissalContext = value;
  }), bindRuntimeValue(runtime2, "initializePointerDismissal", () => initializePointerDismissal, (value) => {
    initializePointerDismissal = value;
  }), bindRuntimeValue(runtime2, "ResetSkeletonContexts", () => ResetSkeletonContexts), bindRuntimeValue(runtime2, "reactSkeletonContexts", () => reactSkeletonContexts, (value) => {
    reactSkeletonContexts = value;
  }), bindRuntimeValue(runtime2, "jsxSkeletonContexts", () => jsxSkeletonContexts, (value) => {
    jsxSkeletonContexts = value;
  }), bindRuntimeValue(runtime2, "skeletonActiveContext", () => skeletonActiveContext, (value) => {
    skeletonActiveContext = value;
  }), bindRuntimeValue(runtime2, "skeletonElementContext", () => skeletonElementContext, (value) => {
    skeletonElementContext = value;
  }), bindRuntimeValue(runtime2, "skeletonGroupContext", () => skeletonGroupContext, (value) => {
    skeletonGroupContext = value;
  }), bindRuntimeValue(runtime2, "skeletonShownStoreContext", () => skeletonShownStoreContext, (value) => {
    skeletonShownStoreContext = value;
  }), bindRuntimeValue(runtime2, "initializeSkeletonContexts", () => initializeSkeletonContexts, (value) => {
    initializeSkeletonContexts = value;
  }), bindRuntimeValue(runtime2, "PortalRoot", () => PortalRoot), bindRuntimeValue(runtime2, "jsxPortalRoot", () => jsxPortalRoot, (value) => {
    jsxPortalRoot = value;
  }), bindRuntimeValue(runtime2, "initializePortalRoot", () => initializePortalRoot, (value) => {
    initializePortalRoot = value;
  }), bindRuntimeValue(runtime2, "reactForUiInteractions", () => reactForUiInteractions, (value) => {
    reactForUiInteractions = value;
  }), bindRuntimeValue(runtime2, "REM_SCALE_VARIABLE", () => REM_SCALE_VARIABLE, (value) => {
    REM_SCALE_VARIABLE = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_ROOT_FONT_SIZE", () => DEFAULT_ROOT_FONT_SIZE, (value) => {
    DEFAULT_ROOT_FONT_SIZE = value;
  }), bindRuntimeValue(runtime2, "ROOT_REM_PROBE_LENGTH_CSS", () => ROOT_REM_PROBE_LENGTH_CSS, (value) => {
    ROOT_REM_PROBE_LENGTH_CSS = value;
  }), bindRuntimeValue(runtime2, "ROOT_REM_PROBE_STYLE", () => ROOT_REM_PROBE_STYLE, (value) => {
    ROOT_REM_PROBE_STYLE = value;
  }), bindRuntimeValue(runtime2, "pixelsToScaledRem", () => pixelsToScaledRem, (value) => {
    pixelsToScaledRem = value;
  }), bindRuntimeValue(runtime2, "initializeRemScale", () => initializeRemScale, (value) => {
    initializeRemScale = value;
  }), bindRuntimeValue(runtime2, "iconFontManifest", () => iconFontManifest, (value) => {
    iconFontManifest = value;
  }), bindRuntimeValue(runtime2, "iconCodepoints", () => iconCodepoints, (value) => {
    iconCodepoints = value;
  }), bindRuntimeValue(runtime2, "secondaryIconCodepoints", () => secondaryIconCodepoints, (value) => {
    secondaryIconCodepoints = value;
  }), bindRuntimeValue(runtime2, "nextIconCodepoint", () => nextIconCodepoint, (value) => {
    nextIconCodepoint = value;
  }), bindRuntimeValue(runtime2, "iconMasterWeights", () => iconMasterWeights, (value) => {
    iconMasterWeights = value;
  }), bindRuntimeValue(runtime2, "animatedIconNames", () => animatedIconNames, (value) => {
    animatedIconNames = value;
  }), bindRuntimeValue(runtime2, "loopingIconNames", () => loopingIconNames, (value) => {
    loopingIconNames = value;
  }), bindRuntimeValue(runtime2, "iconAnimationDurations", () => iconAnimationDurations, (value) => {
    iconAnimationDurations = value;
  }), bindRuntimeValue(runtime2, "iconAnimationExitDurations", () => iconAnimationExitDurations, (value) => {
    iconAnimationExitDurations = value;
  }), bindRuntimeValue(runtime2, "iconAnimationEasings", () => iconAnimationEasings, (value) => {
    iconAnimationEasings = value;
  }), bindRuntimeValue(runtime2, "iconManifest", () => iconManifest, (value) => {
    iconManifest = value;
  }), bindRuntimeValue(runtime2, "initializeIconManifest", () => initializeIconManifest, (value) => {
    initializeIconManifest = value;
  }), bindRuntimeValue(runtime2, "initializeIconAccessibility", () => initializeIconAccessibility, (value) => {
    initializeIconAccessibility = value;
  }), bindRuntimeValue(runtime2, "resolveIconSize", () => resolveIconSize), bindRuntimeValue(runtime2, "useDensityIconSize", () => useDensityIconSize), bindRuntimeValue(runtime2, "useIconSize", () => useIconSize), bindRuntimeValue(runtime2, "getClosestIconSize", () => getClosestIconSize), bindRuntimeValue(runtime2, "calculateIconFontWeight", () => calculateIconFontWeight), bindRuntimeValue(runtime2, "validateIconAccessibility", () => validateIconAccessibility), bindRuntimeValue(runtime2, "getCustomIconFontStyle", () => getCustomIconFontStyle), bindRuntimeValue(runtime2, "createIconSizeStyles", () => createIconSizeStyles), bindRuntimeValue(runtime2, "Icon", () => Icon), bindRuntimeValue(runtime2, "isIconName", () => isIconName), bindRuntimeValue(runtime2, "unquoteFontFamily", () => unquoteFontFamily), bindRuntimeValue(runtime2, "splitFontFamilyList", () => splitFontFamilyList), bindRuntimeValue(runtime2, "isFontFamilyLoaded", () => isFontFamilyLoaded), bindRuntimeValue(runtime2, "findIconFontFamilyStack", () => findIconFontFamilyStack), bindRuntimeValue(runtime2, "retryIconFontLoad", () => retryIconFontLoad), bindRuntimeValue(runtime2, "getIconRotateProps", () => getIconRotateProps), bindRuntimeValue(runtime2, "isKnownIconName", () => isKnownIconName), bindRuntimeValue(runtime2, "filledIconName", () => filledIconName), bindRuntimeValue(runtime2, "ICON_FONT_RETRY_DELAY", () => ICON_FONT_RETRY_DELAY, (value) => {
    ICON_FONT_RETRY_DELAY = value;
  }), bindRuntimeValue(runtime2, "iconFontRetriedDocuments", () => iconFontRetriedDocuments, (value) => {
    iconFontRetriedDocuments = value;
  }), bindRuntimeValue(runtime2, "iconFontRetryCounts", () => iconFontRetryCounts, (value) => {
    iconFontRetryCounts = value;
  }), bindRuntimeValue(runtime2, "MAX_ICON_FONT_RETRIES", () => MAX_ICON_FONT_RETRIES, (value) => {
    MAX_ICON_FONT_RETRIES = value;
  }), bindRuntimeValue(runtime2, "MAX_ICON_FONT_PROBES", () => MAX_ICON_FONT_PROBES, (value) => {
    MAX_ICON_FONT_PROBES = value;
  }), bindRuntimeValue(runtime2, "initializeIconFontRetry", () => initializeIconFontRetry, (value) => {
    initializeIconFontRetry = value;
  }), bindRuntimeValue(runtime2, "fizzyLakeCodepoints", () => fizzyLakeCodepoints, (value) => {
    fizzyLakeCodepoints = value;
  }), bindRuntimeValue(runtime2, "fizzyLakeFallbackNames", () => fizzyLakeFallbackNames, (value) => {
    fizzyLakeFallbackNames = value;
  }), bindRuntimeValue(runtime2, "initializeFizzyLakeIcons", () => initializeFizzyLakeIcons, (value) => {
    initializeFizzyLakeIcons = value;
  }), bindRuntimeValue(runtime2, "mirroredIconNames", () => mirroredIconNames, (value) => {
    mirroredIconNames = value;
  }), bindRuntimeValue(runtime2, "initializeMirroredIcons", () => initializeMirroredIcons, (value) => {
    initializeMirroredIcons = value;
  }), bindRuntimeValue(runtime2, "fizzyIconGlyphs", () => fizzyIconGlyphs, (value) => {
    fizzyIconGlyphs = value;
  }), bindRuntimeValue(runtime2, "mirroredIcons", () => mirroredIcons, (value) => {
    mirroredIcons = value;
  }), bindRuntimeValue(runtime2, "fizzyIconFallbacks", () => fizzyIconFallbacks, (value) => {
    fizzyIconFallbacks = value;
  }), bindRuntimeValue(runtime2, "ICON_SLOT_CLASS_NAME", () => ICON_SLOT_CLASS_NAME, (value) => {
    ICON_SLOT_CLASS_NAME = value;
  }), bindRuntimeValue(runtime2, "ICON_SLOT_FIRST_LINE_CLASS_NAME", () => ICON_SLOT_FIRST_LINE_CLASS_NAME, (value) => {
    ICON_SLOT_FIRST_LINE_CLASS_NAME = value;
  }), bindRuntimeValue(runtime2, "IconSlot", () => IconSlot), bindRuntimeValue(runtime2, "jsxIcons", () => jsxIcons, (value) => {
    jsxIcons = value;
  }), bindRuntimeValue(runtime2, "iconSizeMetrics", () => iconSizeMetrics, (value) => {
    iconSizeMetrics = value;
  }), bindRuntimeValue(runtime2, "iconSizes", () => iconSizes, (value) => {
    iconSizes = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_ICON_SIZE", () => DEFAULT_ICON_SIZE, (value) => {
    DEFAULT_ICON_SIZE = value;
  }), bindRuntimeValue(runtime2, "primaryIconGlyphs", () => primaryIconGlyphs, (value) => {
    primaryIconGlyphs = value;
  }), bindRuntimeValue(runtime2, "secondaryIconGlyphs", () => secondaryIconGlyphs, (value) => {
    secondaryIconGlyphs = value;
  }), bindRuntimeValue(runtime2, "animatedIcons", () => animatedIcons, (value) => {
    animatedIcons = value;
  }), bindRuntimeValue(runtime2, "loopingIcons", () => loopingIcons, (value) => {
    loopingIcons = value;
  }), bindRuntimeValue(runtime2, "animationDurations", () => animationDurations, (value) => {
    animationDurations = value;
  }), bindRuntimeValue(runtime2, "animationExitDurations", () => animationExitDurations, (value) => {
    animationExitDurations = value;
  }), bindRuntimeValue(runtime2, "animationEasings", () => animationEasings, (value) => {
    animationEasings = value;
  }), bindRuntimeValue(runtime2, "iconWeightBounds", () => iconWeightBounds, (value) => {
    iconWeightBounds = value;
  }), bindRuntimeValue(runtime2, "MIN_ICON_FONT_WEIGHT", () => MIN_ICON_FONT_WEIGHT, (value) => {
    MIN_ICON_FONT_WEIGHT = value;
  }), bindRuntimeValue(runtime2, "MAX_ICON_FONT_WEIGHT", () => MAX_ICON_FONT_WEIGHT, (value) => {
    MAX_ICON_FONT_WEIGHT = value;
  }), bindRuntimeValue(runtime2, "customIconBaseStyle", () => customIconBaseStyle, (value) => {
    customIconBaseStyle = value;
  }), bindRuntimeValue(runtime2, "iconFontStyles", () => iconFontStyles, (value) => {
    iconFontStyles = value;
  }), bindRuntimeValue(runtime2, "initializeIcons", () => initializeIcons, (value) => {
    initializeIcons = value;
  }), bindRuntimeValue(runtime2, "readDesktopTitlebarInset", () => readDesktopTitlebarInset), bindRuntimeValue(runtime2, "getDesktopTitlebarStore", () => getDesktopTitlebarStore), bindRuntimeValue(runtime2, "resolveContainerElement", () => resolveContainerElement), bindRuntimeValue(runtime2, "useDesktopTitlebarInset", () => useDesktopTitlebarInset), bindRuntimeValue(runtime2, "useCollisionPadding", () => useCollisionPadding), bindRuntimeValue(runtime2, "CollisionPaddingProvider", () => CollisionPaddingProvider), bindRuntimeValue(runtime2, "reactCollisionPadding", () => reactCollisionPadding, (value) => {
    reactCollisionPadding = value;
  }), bindRuntimeValue(runtime2, "jsxCollisionPadding", () => jsxCollisionPadding, (value) => {
    jsxCollisionPadding = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_COLLISION_PADDING", () => DEFAULT_COLLISION_PADDING, (value) => {
    DEFAULT_COLLISION_PADDING = value;
  }), bindRuntimeValue(runtime2, "desktopTitlebarStores", () => desktopTitlebarStores, (value) => {
    desktopTitlebarStores = value;
  }), bindRuntimeValue(runtime2, "getZeroInsetSnapshot", () => getZeroInsetSnapshot, (value) => {
    getZeroInsetSnapshot = value;
  }), bindRuntimeValue(runtime2, "subscribeInsetNoop", () => subscribeInsetNoop, (value) => {
    subscribeInsetNoop = value;
  }), bindRuntimeValue(runtime2, "collisionPaddingContext", () => collisionPaddingContext, (value) => {
    collisionPaddingContext = value;
  }), bindRuntimeValue(runtime2, "initializeCollisionPadding", () => initializeCollisionPadding, (value) => {
    initializeCollisionPadding = value;
  }), bindRuntimeValue(runtime2, "getSurfaceClasses", () => getSurfaceClasses), bindRuntimeValue(runtime2, "elevationSurfaceNames", () => elevationSurfaceNames, (value) => {
    elevationSurfaceNames = value;
  }), bindRuntimeValue(runtime2, "elevationShadowClasses", () => elevationShadowClasses, (value) => {
    elevationShadowClasses = value;
  }), bindRuntimeValue(runtime2, "surfaceBackgroundClasses", () => surfaceBackgroundClasses, (value) => {
    surfaceBackgroundClasses = value;
  }), bindRuntimeValue(runtime2, "focusShadowByMode", () => focusShadowByMode, (value) => {
    focusShadowByMode = value;
  }), bindRuntimeValue(runtime2, "dangerFocusShadowByMode", () => dangerFocusShadowByMode, (value) => {
    dangerFocusShadowByMode = value;
  }), bindRuntimeValue(runtime2, "initializeSurfaces", () => initializeSurfaces, (value) => {
    initializeSurfaces = value;
  }), bindRuntimeValue(runtime2, "createMenuVirtualAnchor", () => createMenuVirtualAnchor), bindRuntimeValue(runtime2, "warnNestedMenuLayerOffset", () => warnNestedMenuLayerOffset), bindRuntimeValue(runtime2, "warnNestedMenuInitialFocus", () => warnNestedMenuInitialFocus), bindRuntimeValue(runtime2, "useStableObjectRef", () => useStableObjectRef), bindRuntimeValue(runtime2, "reactMenuContexts", () => reactMenuContexts, (value) => {
    reactMenuContexts = value;
  }), bindRuntimeValue(runtime2, "menuTriggerContext", () => menuTriggerContext, (value) => {
    menuTriggerContext = value;
  }), bindRuntimeValue(runtime2, "defaultSubmenuState", () => defaultSubmenuState, (value) => {
    defaultSubmenuState = value;
  }), bindRuntimeValue(runtime2, "submenuStateContext", () => submenuStateContext, (value) => {
    submenuStateContext = value;
  }), bindRuntimeValue(runtime2, "FOCUSES_NOTHING_ATTRIBUTE", () => FOCUSES_NOTHING_ATTRIBUTE, (value) => {
    FOCUSES_NOTHING_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "contextMenuContext", () => contextMenuContext, (value) => {
    contextMenuContext = value;
  }), bindRuntimeValue(runtime2, "menuBarContext", () => menuBarContext, (value) => {
    menuBarContext = value;
  }), bindRuntimeValue(runtime2, "menuSheetLabelsContext", () => menuSheetLabelsContext, (value) => {
    menuSheetLabelsContext = value;
  }), bindRuntimeValue(runtime2, "MENU_ANCHOR_SELECTOR", () => MENU_ANCHOR_SELECTOR, (value) => {
    MENU_ANCHOR_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "menuRootIdentityContext", () => menuRootIdentityContext, (value) => {
    menuRootIdentityContext = value;
  }), bindRuntimeValue(runtime2, "menuIsOpenContext", () => menuIsOpenContext, (value) => {
    menuIsOpenContext = value;
  }), bindRuntimeValue(runtime2, "initializeMenuContexts", () => initializeMenuContexts, (value) => {
    initializeMenuContexts = value;
  }), bindRuntimeValue(runtime2, "MenuScrollContent", () => MenuScrollContent), bindRuntimeValue(runtime2, "jsxMenuScrollContent", () => jsxMenuScrollContent, (value) => {
    jsxMenuScrollContent = value;
  }), bindRuntimeValue(runtime2, "menuScrollClasses", () => menuScrollClasses, (value) => {
    menuScrollClasses = value;
  }), bindRuntimeValue(runtime2, "menuBodyScrollClasses", () => menuBodyScrollClasses, (value) => {
    menuBodyScrollClasses = value;
  }), bindRuntimeValue(runtime2, "menuHeaderClasses", () => menuHeaderClasses, (value) => {
    menuHeaderClasses = value;
  }), bindRuntimeValue(runtime2, "menuFooterClasses", () => menuFooterClasses, (value) => {
    menuFooterClasses = value;
  }), bindRuntimeValue(runtime2, "MENU_ITEM_HEIGHT_CSS", () => MENU_ITEM_HEIGHT_CSS, (value) => {
    MENU_ITEM_HEIGHT_CSS = value;
  }), bindRuntimeValue(runtime2, "initializeMenuScrollContent", () => initializeMenuScrollContent, (value) => {
    initializeMenuScrollContent = value;
  }), bindRuntimeValue(runtime2, "isKeyboardContextMenuEvent", () => isKeyboardContextMenuEvent), bindRuntimeValue(runtime2, "recordKeyboardContextMenuOpen", () => recordKeyboardContextMenuOpen), bindRuntimeValue(runtime2, "useKeyboardContextMenuInitialFocus", () => useKeyboardContextMenuInitialFocus), bindRuntimeValue(runtime2, "reactKeyboardContextMenuFocus", () => reactKeyboardContextMenuFocus, (value) => {
    reactKeyboardContextMenuFocus = value;
  }), bindRuntimeValue(runtime2, "keyboardContextMenuRoots", () => keyboardContextMenuRoots, (value) => {
    keyboardContextMenuRoots = value;
  }), bindRuntimeValue(runtime2, "keyboardContextMenuEventContext", () => keyboardContextMenuEventContext, (value) => {
    keyboardContextMenuEventContext = value;
  }), bindRuntimeValue(runtime2, "initializeKeyboardContextMenuFocus", () => initializeKeyboardContextMenuFocus, (value) => {
    initializeKeyboardContextMenuFocus = value;
  }), bindRuntimeValue(runtime2, "TEXT_ENTRY_SELECTOR", () => TEXT_ENTRY_SELECTOR, (value) => {
    TEXT_ENTRY_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "initializeTextEntrySelector", () => initializeTextEntrySelector, (value) => {
    initializeTextEntrySelector = value;
  }), bindRuntimeValue(runtime2, "blurWithSafeRelatedTarget", () => blurWithSafeRelatedTarget), bindRuntimeValue(runtime2, "initializeSafeBlur", () => initializeSafeBlur, (value) => {
    initializeSafeBlur = value;
  }), bindRuntimeValue(runtime2, "registerOverlayOwner", () => registerOverlayOwner), bindRuntimeValue(runtime2, "useOverlayOwnerRef", () => useOverlayOwnerRef), bindRuntimeValue(runtime2, "unmarkSheetTreeDialog", () => unmarkSheetTreeDialog), bindRuntimeValue(runtime2, "markSheetTreeDialog", () => markSheetTreeDialog), bindRuntimeValue(runtime2, "isSheetTreeDialog", () => isSheetTreeDialog), bindRuntimeValue(runtime2, "getOverlayOwnerChain", () => getOverlayOwnerChain), () => {
    getClassMergeThemeValues = (input) => classMergeThemeKeys[input], createDirectionalClassGroups = (input, options) => Object.fromEntries(["", "x", "y", "s", "e", "t", "r", "b", "l"].map((input2) => [
      `${input}${input2}`,
      [
        {
          [`${input}${input2}`]: options
        }
      ]
    ])), initializeClassNames = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeThemeTokenManifest)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), {
        themeKeys: classMergeThemeKeys,
        TYPE_SCALE: classMergeTypographyScale,
        TYPE_WEIGHT_NAMES: classMergeTypographyWeights,
        WEIGHT_ROLE_MARKERS: classMergeWeightRoleMarkers
      } = runtime2.themeTokenManifest, paddingTokenNames = getClassMergeThemeValues("padding"), marginTokenNames = getClassMergeThemeValues("margin"), gapTokenNames = getClassMergeThemeValues("gap"), hitGapTokenValues = [
        ...gapTokenNames,
        runtime2.validators.isNumber,
        runtime2.validators.isArbitraryValue,
        runtime2.validators.isArbitraryVariable
      ], hitGridGapTokenValues = [
        ...gapTokenNames,
        runtime2.validators.isNumber,
        runtime2.validators.isArbitraryLength,
        runtime2.validators.isArbitraryVariableLength
      ], typographyClassNames = classMergeTypographyScale, typographyWeightClassNames = classMergeTypographyScale.flatMap((input) => classMergeTypographyWeights.map((input2) => `${input}-${input2}`)), mergeTailwindClasses = (0, runtime2.extendTailwindMerge)({
        extend: {
          conflictingClassGroups: {
            "font-size-weight": [
              "font-size",
              "font-weight",
              "font-weight-role",
              "leading"
            ],
            "font-size": ["font-size-weight"],
            "font-weight": ["font-weight-role"],
            px: ["ps", "pe"],
            mx: ["ms", "me"],
            "inset-x": ["start", "end"],
            "border-w-x": ["border-w-s", "border-w-e"],
            "border-color-x": ["border-color-s", "border-color-e"],
            "scroll-px": ["scroll-ps", "scroll-pe"],
            "scroll-mx": ["scroll-ms", "scroll-me"],
            "rounded-t": ["rounded-ss", "rounded-se"],
            "rounded-b": ["rounded-es", "rounded-ee"]
          },
          theme: {
            radius: getClassMergeThemeValues("borderRadius")
          },
          classGroups: {
            "font-size": [
              {
                text: typographyClassNames
              }
            ],
            "font-size-weight": [
              {
                text: typographyWeightClassNames
              }
            ],
            "font-family": [
              {
                font: [...getClassMergeThemeValues("fontFamily"), "inherit"]
              }
            ],
            "font-weight": [
              {
                font: getClassMergeThemeValues("fontWeight")
              }
            ],
            "font-weight-role": [
              {
                font: classMergeWeightRoleMarkers
              }
            ],
            grade: [
              {
                grad: [
                  "semibold",
                  "bold",
                  runtime2.validators.isInteger,
                  runtime2.validators.isArbitraryValue
                ]
              }
            ],
            "bg-image": [
              {
                "layers-1": [runtime2.validators.isAny],
                "layers-2": [runtime2.validators.isAny],
                "layers-3": [runtime2.validators.isAny]
              }
            ],
            h: [
              {
                h: getClassMergeThemeValues("height")
              }
            ],
            w: [
              {
                w: [...getClassMergeThemeValues("width"), "stretch"]
              }
            ],
            size: [
              {
                size: getClassMergeThemeValues("size")
              }
            ],
            "min-h": [
              {
                "min-h": getClassMergeThemeValues("minHeight")
              }
            ],
            "max-h": [
              {
                "max-h": ["none"]
              }
            ],
            shadow: [
              {
                shadow: getClassMergeThemeValues("boxShadow")
              }
            ],
            duration: [
              {
                duration: getClassMergeThemeValues("transitionDuration")
              }
            ],
            ease: [
              {
                ease: getClassMergeThemeValues("transitionTimingFunction")
              }
            ],
            cursor: [
              {
                cursor: getClassMergeThemeValues("cursor")
              }
            ],
            z: [
              {
                z: getClassMergeThemeValues("zIndex")
              }
            ],
            opacity: [
              {
                opacity: getClassMergeThemeValues("opacity")
              }
            ],
            ...createDirectionalClassGroups("p", paddingTokenNames),
            ...createDirectionalClassGroups("m", [
              ...marginTokenNames,
              "outset"
            ]),
            gap: [
              {
                gap: gapTokenNames,
                "hit-grid-gap": hitGridGapTokenValues
              }
            ],
            "gap-x": [
              {
                "gap-x": gapTokenNames,
                "hit-grid-gap-x": hitGridGapTokenValues
              }
            ],
            "gap-y": [
              {
                "gap-y": gapTokenNames,
                "hit-gap-y": [...hitGapTokenValues, "px"],
                "hit-grid-gap-y": hitGridGapTokenValues
              }
            ]
          }
        }
      });
    }), initializeTranslations = (0, runtime2.initializeOnce)(() => {
      reactTranslations = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), translationContext = reactTranslations.createContext(void 0);
    }), initializeSheetChrome = (0, runtime2.initializeOnce)(() => {
      initializeClassNames(), initializeTranslations(), (0, runtime2.initializeSheetDrag)(), (0, runtime2.initializeNpmDependency)(), reactSheetChrome = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxSheetChrome = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SheetDismissButton = reactSheetChrome.forwardRef(function({ as: as2 = "button", onDismiss, label, className, ...props }, options) {
        let value = useTranslation("close", "Close"), value2 = label ?? value;
        return jsxSheetChrome.jsx(as2, {
          ref: options,
          type: "button",
          "data-cds-sheet-control": "",
          onClick: onDismiss,
          ...props,
          className: cn("cds-reset mx-1 mb-1 block shrink-0 rounded px-2 text-start text-body font-normal font-control text-primary outline-none select-none focus-visible:bg-fill-ghost-hover focus-visible:outline-hidden [&:not(:focus-visible):not([data-cds-sheet-control-held])]:sr-only", "min-h-control", className),
          children: value2
        });
      }), SheetChrome = {
        Handle: SheetHandle,
        TitleBar: SheetTitleBar,
        DismissButton: SheetDismissButton,
        Body: SheetBody
      };
    }), initializeAnimationWait = () => {
    }, initializeSheetMeasurement = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeVisualKeyboard)(), (0, runtime2.initializePresentationMode)(), initializeAnimationWait(), initializeSheetTreeAnnouncements(), reactSheetMeasurement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), initializeSheetTreeAnnouncements = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeAdaptiveSheets)(), sheetTreeHostsContext = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1).createContext([]), EMPTY_SHEET_TREES = [], sheetTreeAnnouncements = /* @__PURE__ */ new WeakMap(), sheetTreeAnnouncementListeners = /* @__PURE__ */ new Set();
    }), initializeSheetPopupHost = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeResizeObserverAccess)(), (0, runtime2.initializeAndroidCloseWatcher)(), (0, runtime2.initializeSheetStyles)(), (0, runtime2.initializePresentationMode)(), (0, runtime2.initializeAdaptiveSheets)(), (0, runtime2.initializeSheetDrag)(), initializeSheetChrome(), initializeSheetMeasurement(), reactSheetPopupHost = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), LAYER_BAND_SIZE = 100, TOAST_LAYER_BASE = 9e3, portalLayerClasses = "[&>*]:z-[var(--cds-portal-z)] [&>:not([inert])]:draggable-none", initializeLayers = (0, runtime2.initializeOnce)(() => {
      initializeClassNames(), reactLayers = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxLayers = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), layerBaseContext = reactLayers.createContext(0), CdsLayer.displayName = "CdsLayer", overlayLayerOffsets = {
        modal: 40,
        tooltip: 30,
        contextmenu: 30,
        popover: 20,
        menu: 20,
        combobox: 20,
        coachmark: 10
      }, CdsLayerVarBridge.displayName = "CdsLayerVarBridge";
    }), initializeMergedRefs = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEventCallbacks)(), reactMergedRefs = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), createResolvedThemeSnapshot = (input, options) => {
      if (input == null || input.theme === void 0 || input.theme === null)
        return;
      let value = resolveExperimentalTheme(input);
      return options !== void 0 && options.theme === input.theme && options.resolved === value ? options : {
        theme: input.theme,
        resolved: value
      };
    }, initializeExperimentalTheme = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), reactExperimentalTheme = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), themeStoreContext = reactExperimentalTheme.createContext(void 0), defaultThemeStore = createThemeStore(void 0), reportedThemeErrors = /* @__PURE__ */ new Set();
    }), HTML_NAMESPACE = "http://www.w3.org/1999/xhtml", SVG_NAMESPACE_GE0 = "http://www.w3.org/2000/svg", initializeElementNamespaces = () => {
    }, initializeCloseOnActivityHide = (0, runtime2.initializeOnce)(() => {
      initializeElementNamespaces(), reactActivityHide = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxActivityHide = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), activityHideElementsContext = reactActivityHide.createContext(null);
    }), initializeOutsidePressWrappers = (0, runtime2.initializeOnce)(() => {
      initializeCloseOnActivityHide(), outsidePressWrappersContext = reactActivityHide.createContext(null);
    }), modalCatcherDragSession = null, initializeModalCatcher = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)(), modalCatcherDragEndEvents = ["dragend", "drop", "pointerdown"];
    }), initializePointerDismissal = (0, runtime2.initializeOnce)(() => {
      reactPointerDismissal = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxPointerDismissal = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), pointerDismissalContext = reactPointerDismissal.createContext(!1);
    }), initializeSkeletonContexts = (0, runtime2.initializeOnce)(() => {
      reactSkeletonContexts = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxSkeletonContexts = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), skeletonActiveContext = reactSkeletonContexts.createContext(!1), skeletonElementContext = reactSkeletonContexts.createContext("div"), skeletonGroupContext = reactSkeletonContexts.createContext(null), skeletonShownStoreContext = reactSkeletonContexts.createContext(null);
    }), initializePortalRoot = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeDocumentFont)(), (0, runtime2.initializeFeatureFlags)(), (0, runtime2.initializeInputDismissalTracking)(), initializeExperimentalTheme(), initializeClassNames(), (0, runtime2.initializeCdsRoot)(), initializeCloseOnActivityHide(), initializeOutsidePressWrappers(), initializeModalCatcher(), initializePointerDismissal(), initializeMergedRefs(), initializeSkeletonContexts(), jsxPortalRoot = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), REM_SCALE_VARIABLE = "--cds-rem-scale", DEFAULT_ROOT_FONT_SIZE = 16, pixelsToScaledRem = (input) => `calc(${input / 16}rem * var(${REM_SCALE_VARIABLE}, 1))`, initializeRemScale = (0, runtime2.initializeOnce)(() => {
      reactForUiInteractions = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ROOT_REM_PROBE_LENGTH_CSS = `calc(${DEFAULT_ROOT_FONT_SIZE}rem * var(${REM_SCALE_VARIABLE}, 1))`, ROOT_REM_PROBE_STYLE = `position:fixed;top:0;left:0;width:${ROOT_REM_PROBE_LENGTH_CSS};min-width:0;max-width:none;height:0;font-size:${ROOT_REM_PROBE_LENGTH_CSS};-webkit-text-size-adjust:none;text-size-adjust:none;visibility:hidden;pointer-events:none;`;
    }), initializeIconManifest = (0, runtime2.initializeOnce)(() => {
      iconFontManifest = JSON.parse(`{
 "icons": {
  "Activity": 57344,
  "Add": 57345,
  "AddCircle": 57346,
  "Agent": 57347,
  "Alarm": 57348,
  "Android": 57349,
  "Ant": 57350,
  "Apple": 57351,
  "Archive": 57352,
  "ArrowDown": 57353,
  "ArrowDownCircle": 57354,
  "ArrowInSquare": 57355,
  "ArrowLeft": 57356,
  "ArrowLeftCircle": 57357,
  "ArrowOutSquare": 57358,
  "ArrowReturn": 57359,
  "ArrowRight": 57360,
  "ArrowRightCircle": 57361,
  "ArrowSplitRight": 57362,
  "ArrowUp": 57363,
  "ArrowUpCircle": 57364,
  "ArrowUpRight": 57365,
  "ArrowsOut": 57366,
  "Artifacts": 57367,
  "Atom": 57368,
  "Attachment": 57369,
  "Batch": 57370,
  "Beaker": 57371,
  "Binoculars": 57372,
  "Book": 57373,
  "BookClosed": 57374,
  "BookText": 57375,
  "Box": 57376,
  "BrowseSelect": 57377,
  "Bullhorn": 57378,
  "Cache": 57379,
  "Calendar": 57380,
  "Camera": 57381,
  "Capacity": 57382,
  "CaretDown": 57383,
  "CaretDownUp": 57384,
  "CaretLeft": 57385,
  "CaretRight": 57386,
  "CaretUp": 57387,
  "CaretUpDown": 57388,
  "ChangesPlusMinus": 57389,
  "ChangesPlusMinusFilled": 57390,
  "Chart": 57391,
  "ChartLine": 57392,
  "Chat": 57393,
  "ChatAdd": 57394,
  "ChatAddFilled": 57395,
  "ChatDelete": 57396,
  "ChatDeleteFilled": 57397,
  "ChatFilled": 57398,
  "ChatSimple": 57399,
  "ChatSimpleFilled": 57400,
  "Chats": 57401,
  "ChatsFilled": 57402,
  "Check": 57403,
  "CheckCircle": 57404,
  "CheckCircleFilled": 57405,
  "CheckDouble": 57406,
  "Checklist": 57407,
  "ChecklistFilled": 57408,
  "Clipboard": 57409,
  "ClipboardArrow": 57410,
  "Clock": 57411,
  "Cloud": 57412,
  "CloudFilled": 57413,
  "CloudSlash": 57414,
  "CloudSlashFilled": 57415,
  "Code": 57416,
  "CodeBlock": 57417,
  "CodeBrackets": 57418,
  "CodeFilled": 57419,
  "CoffeeCup": 57420,
  "Collapse": 57421,
  "CommandCard": 57422,
  "CommandLine": 57423,
  "CommandLineFilled": 57424,
  "CommandLinePrompt": 57425,
  "Compact": 57426,
  "Computer": 57427,
  "Concierge": 57428,
  "Connectors": 57429,
  "Copy": 57430,
  "Create": 57431,
  "CreditCard": 57432,
  "Cursor": 57433,
  "CursorFilled": 57434,
  "DNA": 57435,
  "Database": 57436,
  "Disconnect": 57437,
  "Dispatch": 57438,
  "DollarSign": 57439,
  "DotsCircle": 57440,
  "DotsHorizontal": 57441,
  "DotsVertical": 57442,
  "Download": 57443,
  "Edit": 57444,
  "Email": 57445,
  "Evals": 57446,
  "Expand": 57447,
  "ExtendedThinking": 57448,
  "Eye": 57449,
  "EyeSlash": 57450,
  "Fastforward": 57451,
  "File": 57452,
  "FileAdd": 57453,
  "FileUpload": 57454,
  "Files": 57455,
  "Filter": 57456,
  "Flag": 57457,
  "Folder": 57458,
  "FolderOpen": 57459,
  "FolderPlus": 57460,
  "Ghost": 57461,
  "GhostFilled": 57462,
  "Gift": 57463,
  "GitBranch": 57464,
  "GitCommit": 57465,
  "GitDiff": 57466,
  "GitFork": 57467,
  "GitMerge": 57468,
  "GitMergeConflict": 57469,
  "GitMergedSimple": 57470,
  "GitPullRequest": 57471,
  "GitPullRequestClosed": 57472,
  "GitPullRequestDraft": 57473,
  "Globe": 57474,
  "GraduationCap": 57475,
  "Grid": 57476,
  "Hand": 57477,
  "HandHeart": 57478,
  "Haptics": 57479,
  "Help": 57480,
  "History": 57481,
  "Home": 57482,
  "ID": 57483,
  "Image": 57484,
  "Indent": 57485,
  "InfoSimple": 57486,
  "Info": 57487,
  "Interactive": 57488,
  "Key": 57489,
  "Keyboard": 57490,
  "Laptop": 57491,
  "LaptopFilled": 57492,
  "LaptopSlash": 57493,
  "Library": 57494,
  "Lightbulb": 57495,
  "Lightning": 57496,
  "Link": 57497,
  "LinkSimple": 57498,
  "ListAdd": 57499,
  "ListBullet": 57500,
  "ListNumbered": 57501,
  "Location": 57502,
  "LocationQuestionMark": 57503,
  "LocationSlash": 57504,
  "Lock": 57505,
  "LockOpen": 57506,
  "LockShield": 57507,
  "Logout": 57508,
  "Mailbox": 57509,
  "MapPin": 57510,
  "Mcp": 57511,
  "Memory": 57512,
  "Mention": 57513,
  "Menu": 57514,
  "Microphone": 57515,
  "MicrophoneFilled": 57516,
  "MicrophoneSlash": 57517,
  "Minus": 57518,
  "MobilePhone": 57519,
  "Moon": 57520,
  "MoonFilled": 57521,
  "MoonStars": 57522,
  "Note": 57523,
  "Notification": 57524,
  "NotificationSlash": 57525,
  "Organization": 57526,
  "Owl": 57527,
  "Palette": 57528,
  "PaletteFilled": 57529,
  "PaperPlane": 57530,
  "Pause": 57531,
  "Phone": 57532,
  "Pin": 57533,
  "PinFilled": 57534,
  "PinSlash": 57535,
  "Placeholder": 57536,
  "Play": 57537,
  "PlayCircle": 57538,
  "PlayCircleFilled": 57539,
  "PlayFilled": 57540,
  "Plugin": 57541,
  "Press": 57542,
  "Pro": 57543,
  "Prohibit": 57544,
  "Projects": 57545,
  "ProjectsFilled": 57546,
  "ProjectsX": 57547,
  "Prompt": 57548,
  "Recording": 57549,
  "Reorder": 57551,
  "Research": 57552,
  "Screenshare": 57553,
  "Scroll": 57554,
  "Search": 57555,
  "SearchCircle": 57556,
  "Select": 57557,
  "Settings": 57558,
  "Shapes": 57559,
  "ArrowBendUpRight": 57560,
  "ShareAndroid": 57561,
  "Share": 57562,
  "ShieldSearch": 57563,
  "Shuffle": 57564,
  "Sidebar": 57565,
  "SidebarClose": 57566,
  "SidebarOpen": 57567,
  "Signpost": 57568,
  "SlashShortcutCommand": 57569,
  "Slides": 57570,
  "Sort": 57571,
  "Speaker": 57572,
  "Spinner": 57573,
  "Spreadsheet": 57574,
  "Star": 57575,
  "StarFilled": 57576,
  "StarSlash": 57577,
  "Stop": 57578,
  "StopCircle": 57579,
  "StopFilled": 57580,
  "Styles": 57581,
  "Sun": 57582,
  "SunFilled": 57583,
  "SunHorizon": 57584,
  "Tasks": 57585,
  "Team": 57586,
  "Temperature": 57587,
  "TemperatureSimple": 57588,
  "TextAa": 57589,
  "TextBold": 57590,
  "TextItalics": 57591,
  "TextUnderline": 57592,
  "ThumbsDown": 57593,
  "ThumbsDownFilled": 57594,
  "ThumbsUp": 57595,
  "ThumbsUpFilled": 57596,
  "Timer": 57597,
  "Toggles": 57598,
  "Token": 57599,
  "Tool": 57600,
  "Trash": 57601,
  "Trust": 57602,
  "Upload": 57603,
  "User": 57604,
  "UserCircle": 57605,
  "Users": 57606,
  "Verified": 57607,
  "Voice": 57608,
  "Warning": 57609,
  "WarningCircle": 57610,
  "WarningShield": 57611,
  "Workspace": 57612,
  "Wrench": 57613,
  "WrenchFilled": 57614,
  "X": 57615,
  "XCircle": 57616,
  "GitMergeQueue": 57617,
  "Orbit": 57618,
  "SidebarRight": 57619,
  "Bluetooth": 57621,
  "BluetoothSlash": 57622,
  "Bookmark": 57623,
  "ComputerClassic": 57624,
  "Linux": 57625,
  "Windows": 57626,
  "AgentSimple": 57627,
  "AgentsSimple": 57628,
  "ArrowClockwise": 57629,
  "ArrowCounterClockwise": 57630,
  "MinimizeBottomLeft": 57631,
  "MinimizeBottomRight": 57632,
  "MinimizeTopLeft": 57633,
  "MinimizeTopRight": 57634,
  "EyeFrame": 57635,
  "Frame": 57636,
  "Hammer": 57637,
  "HealthConnect": 57638,
  "Heart": 57639,
  "Scale": 57640,
  "ArrowDownLeft": 57641,
  "ArrowDownRight": 57642,
  "ArrowUpLeft": 57643,
  "Bank": 57644,
  "Goal": 57645,
  "ProgressQuarter": 57646,
  "UsageGaugeHigh": 57647,
  "UsageGaugeMiddle": 57648,
  "EditFilled": 57649,
  "Quote": 57650,
  "MemorySlash": 57651,
  "AddLarge": 57652,
  "Ticket": 57653,
  "WindowNew": 57654,
  "BookmarkFilled": 57655,
  "AlignStretch": 57656,
  "ArrowLine": 57657,
  "Crop": 57658,
  "Diagram": 57659,
  "Dropdown": 57660,
  "Eraser": 57661,
  "EyeDropper": 57662,
  "FrameHash": 57663,
  "Heading1": 57664,
  "Heading2": 57665,
  "Heading3": 57666,
  "JustifyCenter": 57667,
  "LineHeight": 57668,
  "LineSegment": 57669,
  "Outdent": 57670,
  "Sigma": 57671,
  "Table": 57672,
  "TextAlignCenter": 57673,
  "TextAlignJustify": 57674,
  "TextAlignLeft": 57675,
  "TextAlignRight": 57676,
  "TextHighlight": 57677,
  "TextT": 57678,
  "ZoomIn": 57679,
  "ZoomOut": 57680,
  "AlignCenter": 57681,
  "AlignEnd": 57682,
  "AlignStart": 57683,
  "CornerBottomLeft": 57684,
  "CornerBottomRight": 57685,
  "CornerTopLeft": 57686,
  "CornerTopRight": 57687,
  "JustifyEnd": 57688,
  "JustifySpaceBetween": 57689,
  "JustifyStart": 57690,
  "LetterSpacing": 57691,
  "TableCellSplit": 57692,
  "TableCellsMerge": 57693,
  "TableColumnDelete": 57694,
  "TableColumnInsertLeft": 57695,
  "TableColumnInsertRight": 57696,
  "TableRowDelete": 57697,
  "TableRowInsertAbove": 57698,
  "TableRowInsertBelow": 57699,
  "Smiley": 57719,
  "SmileyAdd": 57720,
  "SideBottom": 57721,
  "SideLeft": 57722,
  "SideRight": 57723,
  "SideTop": 57724,
  "Comment": 57729,
  "CommentFilled": 57730,
  "FolderLink": 57732,
  "ArrowBendUpLeft": 57733,
  "Circle": 57734,
  "Github": 57735,
  "Images": 57736,
  "SpeakerSlash": 57737,
  "CirclesAdd": 57738,
  "Collection": 57739,
  "ListCard": 57740
 },
 "secondary": {
  "AlignCenter": 57700,
  "AlignEnd": 57701,
  "AlignStart": 57702,
  "CornerBottomLeft": 57703,
  "CornerBottomRight": 57704,
  "CornerTopLeft": 57705,
  "CornerTopRight": 57706,
  "JustifyEnd": 57707,
  "JustifySpaceBetween": 57708,
  "JustifyStart": 57709,
  "LetterSpacing": 57710,
  "TableCellSplit": 57711,
  "TableCellsMerge": 57712,
  "TableColumnDelete": 57713,
  "TableColumnInsertLeft": 57714,
  "TableColumnInsertRight": 57715,
  "TableRowDelete": 57716,
  "TableRowInsertAbove": 57717,
  "TableRowInsertBelow": 57718,
  "SideBottom": 57725,
  "SideLeft": 57726,
  "SideRight": 57727,
  "SideTop": 57728,
  "JustifyCenter": 57731
 },
 "next": 57741,
 "wght": {
  "16": {
   "lo": 0.8,
   "hi": 1.25
  },
  "20": {
   "lo": 1.125,
   "hi": 1.8
  }
 },
 "anim": [
  "Artifacts",
  "Chart",
  "Chats",
  "Clock",
  "Code",
  "Download",
  "Lightbulb",
  "Palette",
  "Projects",
  "Signpost",
  "Tasks",
  "Tool"
 ],
 "animLoop": [
  "Code"
 ],
 "animDur": {
  "Palette": 800
 },
 "animDurOut": {
  "Palette": 0
 },
 "animEase": {
  "Palette": "ease-out"
 }
}`), iconCodepoints = iconFontManifest.icons, secondaryIconCodepoints = iconFontManifest.secondary, nextIconCodepoint = iconFontManifest.next, iconMasterWeights = iconFontManifest.wght, animatedIconNames = iconFontManifest.anim, loopingIconNames = iconFontManifest.animLoop, iconAnimationDurations = iconFontManifest.animDur, iconAnimationExitDurations = iconFontManifest.animDurOut, iconAnimationEasings = iconFontManifest.animEase, iconManifest = iconFontManifest;
    }), initializeIconAccessibility = () => {
    }, initializeFizzyLakeIcons = (0, runtime2.initializeOnce)(() => {
      fizzyLakeCodepoints = {
        Accessibility: 61551,
        Animation: 61474,
        Brush: 61465,
        Bug: 61490,
        CaretDownFilled: 61456,
        CaretDownSmall: 61443,
        CaretRightFilled: 61457,
        Devices: 61489,
        DropFilled: 61527,
        HandWave: 61528,
        PaneBottom: 61500,
        PaneFill: 61501,
        PaneLeft: 61502,
        PaneRight: 61503,
        PaneTop: 61505,
        PauseFilled: 61531,
        Printer: 61533,
        Ruler: 61536,
        SnowflakeFilled: 61539,
        Sunset: 61540,
        Toggle: 61507,
        Window: 61460,
        ZoomActual: 61515,
        ZoomFit: 61516
      }, fizzyLakeFallbackNames = {
        Accessibility: "Eye",
        Animation: "PlayCircle",
        Brush: "Palette",
        Bug: "Warning",
        CaretDownFilled: "CaretDown",
        CaretDownSmall: "CaretDown",
        CaretRightFilled: "CaretRight",
        Devices: "CirclesAdd",
        DropFilled: "CloudFilled",
        HandWave: "Hand",
        PaneBottom: "Sidebar",
        PaneFill: "Expand",
        PaneLeft: "Sidebar",
        PaneRight: "SidebarRight",
        PaneTop: "Sidebar",
        PauseFilled: "Pause",
        Printer: "File",
        Ruler: "Scale",
        SnowflakeFilled: "CloudFilled",
        Sunset: "SunHorizon",
        Toggle: "PlayCircle",
        Window: "Globe",
        ZoomActual: "Search",
        ZoomFit: "Expand"
      };
    }), ICON_FONT_RETRY_DELAY = 1e3, MAX_ICON_FONT_RETRIES = 3, MAX_ICON_FONT_PROBES = 32, initializeIconFontRetry = (0, runtime2.initializeOnce)(() => {
      iconFontRetriedDocuments = /* @__PURE__ */ new WeakSet(), iconFontRetryCounts = /* @__PURE__ */ new WeakMap();
    }), initializeMirroredIcons = (0, runtime2.initializeOnce)(() => {
      mirroredIconNames = [
        "ArrowInSquare",
        "ArrowLeft",
        "ArrowLeftCircle",
        "ArrowOutSquare",
        "ArrowReturn",
        "ArrowRight",
        "ArrowRightCircle",
        "ArrowSplitRight",
        "ArrowUpRight",
        "CaretLeft",
        "CaretRight",
        "Logout",
        "PaperPlane",
        "ArrowBendUpRight",
        "ArrowDownLeft",
        "ArrowDownRight",
        "ArrowUpLeft",
        "ArrowBendUpLeft"
      ];
    }), DEFAULT_ICON_SIZE = "md", ICON_SLOT_CLASS_NAME = "flex size-icon shrink-0 items-center justify-center", ICON_SLOT_FIRST_LINE_CLASS_NAME = "flex h-[1lh] w-icon shrink-0 items-center justify-center self-start", initializeIcons = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFeatureFlags)(), (0, runtime2.initializeCdsRoot)(), initializeFizzyLakeIcons(), initializeIconFontRetry(), initializeRemScale(), initializeIconManifest(), initializeMirroredIcons(), initializeIconAccessibility(), initializeTextEntrySelector(), jsxIcons = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), iconSizeMetrics = {
        xs: {
          px: 12,
          master: "small",
          stroke: {
            regular: 0.8
          }
        },
        sm: {
          px: 16,
          master: "small",
          stroke: {
            regular: 1,
            strong: 1.25
          }
        },
        md: {
          px: 20,
          master: "base",
          stroke: {
            regular: 1.2,
            strong: 1.5
          }
        },
        lg: {
          px: 24,
          master: "base",
          stroke: {
            regular: 1.4
          }
        },
        xl: {
          px: 28,
          master: "base",
          stroke: {
            regular: 1.6
          }
        },
        xxl: {
          px: 32,
          master: "base",
          stroke: {
            regular: 1.8
          }
        }
      }, iconSizes = ["xs", "sm", "md", "lg", "xl", "xxl"], primaryIconGlyphs = iconManifest.icons, fizzyIconGlyphs = fizzyLakeCodepoints, secondaryIconGlyphs = iconManifest.secondary ?? {}, animatedIcons = new Set(iconManifest.anim ?? []), mirroredIcons = new Set(mirroredIconNames), fizzyIconFallbacks = fizzyLakeFallbackNames, loopingIcons = new Set(iconManifest.animLoop ?? []), animationDurations = iconManifest.animDur ?? {}, animationExitDurations = iconManifest.animDurOut ?? {}, animationEasings = iconManifest.animEase ?? {}, iconWeightBounds = iconManifest.wght, [MIN_ICON_FONT_WEIGHT, MAX_ICON_FONT_WEIGHT] = [400, 700], customIconBaseStyle = {
        flexShrink: 0
      }, iconFontStyles = Object.freeze({
        xs: createIconSizeStyles("xs"),
        sm: createIconSizeStyles("sm"),
        md: createIconSizeStyles("md"),
        lg: createIconSizeStyles("lg"),
        xl: createIconSizeStyles("xl"),
        xxl: createIconSizeStyles("xxl")
      });
    }), DEFAULT_COLLISION_PADDING = 5, getZeroInsetSnapshot = () => 0, subscribeInsetNoop = () => () => {
    }, initializeCollisionPadding = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeCdsRoot)(), reactCollisionPadding = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxCollisionPadding = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), desktopTitlebarStores = /* @__PURE__ */ new WeakMap(), collisionPaddingContext = reactCollisionPadding.createContext(null);
    }), initializeSurfaces = (0, runtime2.initializeOnce)(() => {
      elevationSurfaceNames = {
        panel: "surface-2",
        popover: "surface-3"
      }, elevationShadowClasses = {
        panel: "shadow-panel-sm",
        popover: "shadow-panel"
      }, surfaceBackgroundClasses = {
        "surface-2": "bg-surface-2",
        "surface-3": "bg-surface-3"
      }, focusShadowByMode = {
        light: "inset 0 0 0 1px var(--cds-page-bg), 0 0 0 1px var(--cds-fill-accent), 0 0 6px 1px var(--cds-bg-accent)",
        dark: "inset 0 0 0 1px var(--cds-page-bg), 0 0 0 1px var(--cds-fill-accent), 0 0 6px 1px hsl(from var(--cds-role-accent-600) h s l / 60%)"
      }, dangerFocusShadowByMode = {
        light: "inset 0 0 0 1px var(--cds-page-bg), 0 0 0 1px var(--cds-fill-danger), 0 0 6px 1px var(--cds-bg-danger)",
        dark: "inset 0 0 0 1px var(--cds-page-bg), 0 0 0 1px var(--cds-fill-danger), 0 0 6px 1px hsl(from var(--cds-role-danger-600) h s l / 60%)"
      };
    }), FOCUSES_NOTHING_ATTRIBUTE = "data-cds-focuses-nothing", MENU_ANCHOR_SELECTOR = '[data-cds="Menu"], [data-cds="ContextMenu"], [data-cds="DropdownButton"], [data-cds="SplitDropdownButton"], [data-cds="ModelSelector"]', initializeMenuContexts = (0, runtime2.initializeOnce)(() => {
      reactMenuContexts = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), menuTriggerContext = reactMenuContexts.createContext(null), defaultSubmenuState = {
        label: null,
        open: !1
      }, submenuStateContext = reactMenuContexts.createContext(defaultSubmenuState), contextMenuContext = reactMenuContexts.createContext(!1), menuBarContext = reactMenuContexts.createContext(!1), menuSheetLabelsContext = reactMenuContexts.createContext({
        sheetTitle: void 0,
        backLabel: void 0,
        closeLabel: void 0
      }), menuRootIdentityContext = reactMenuContexts.createContext(null), menuIsOpenContext = reactMenuContexts.createContext(null);
    }), menuScrollClasses = "relative min-h-0 overflow-y-auto overflow-x-hidden scroll-fade-y rounded-[inherit] border-b-[length:var(--cds-ring-inner)] border-transparent forced-colors:border-b-0 p-[var(--cds-menu-gutter,0.25rem)]", menuBodyScrollClasses = "relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-fade-y border-b-[length:var(--cds-ring-inner)] border-transparent forced-colors:border-b-0 p-[var(--cds-menu-gutter,0.25rem)]", menuHeaderClasses = "shrink-0 px-[var(--cds-menu-gutter,0.25rem)] pt-[var(--cds-menu-gutter,0.25rem)]", menuFooterClasses = "-mt-[var(--cds-menu-gutter,0.25rem)] shrink-0 px-[var(--cds-menu-gutter,0.25rem)] pb-[var(--cds-menu-gutter,0.25rem)]", MENU_ITEM_HEIGHT_CSS = "max(var(--cds-h-control), var(--cds-leading-body))", SURFACE_FORCED_COLORS_BORDER_CLASS = "forced-colors:border forced-colors:border-solid forced-colors:border-[color:CanvasText]", initializeMenuScrollContent = (0, runtime2.initializeOnce)(() => {
      initializeClassNames(), (0, runtime2.initializePresentationMode)(), (0, runtime2.initializePassiveOpen)(), (0, runtime2.initializeNpmDependency)(), reactMenuScrollContent = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxMenuScrollContent = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MENU_SCROLL_INTERACTION_EVENTS = [
        "wheel",
        "touchstart",
        "keydown",
        "pointerdown"
      ], menuScrollOpenRecords = /* @__PURE__ */ new WeakMap();
    }), initializeKeyboardContextMenuFocus = (0, runtime2.initializeOnce)(() => {
      initializeMenuContexts(), reactKeyboardContextMenuFocus = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), keyboardContextMenuRoots = /* @__PURE__ */ new WeakMap(), keyboardContextMenuEventContext = reactKeyboardContextMenuFocus.createContext(void 0);
    }), TEXT_ENTRY_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", initializeTextEntrySelector = () => {
    }, initializeSafeBlur = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)();
    });
  };
}
export {
  installUiInteractions
};
