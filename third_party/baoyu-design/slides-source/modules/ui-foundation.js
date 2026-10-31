// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiFoundation(runtime2) {
  var accentColorNames, initializeAccentColors, reactMediaQuery, MOBILE_COARSE_POINTER_QUERY, mediaQueryStores, subscribeNoop, getFalseSnapshot, COARSE_POINTER_QUERY_rG, initializeMediaQueryStores, coarsePointerStores, initializeCoarsePointerStores, initializeErrorReporting, initializeSafeObservers, reactDocumentFont, supportedFonts, isSupportedFont, readDocumentFont, subscribeFontNoop, getUndefinedFontSnapshot, initializeDocumentFont, reactFeatureFlags, featureFlagContext, initializeFeatureFlags, inputDismissalStates, dismissalKeys, initializeInputDismissalTracking, transitionRunner, initializeTransitionRunner, reactIsomorphicLayoutEffect, useIsomorphicLayoutEffect, initializeIsomorphicLayoutEffect, initializeResizeObserverAccess, reactAndroidCloseWatcher, initializeAndroidCloseWatcher, sheetDragSettings, initializeSheetDragSettings, SAFE_AREA_TOP_CSS, VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS, baseSheetPositionerStyle, sheetPositioningOverrides, MAX_SHEET_HEIGHT_FRACTION, MAX_SHEET_HEIGHT_CSS, MAX_SHEET_OVERSHOOT_HEIGHT_CSS, SHEET_DENSITY, MIN_SHEET_HEIGHT_FRACTION, MIN_SHEET_HEIGHT_CSS, initializeSheetStyles, initializeElementAccess, reactEventCallbacks, initializeEventCallbacks, reactVisualKeyboard, EDITABLE_ELEMENT_SELECTOR, KEYBOARD_MINIMUM_HEIGHT, VIEWPORT_SCALE_TOLERANCE, initializeVisualKeyboard, reactPresentationMode, presentationModeContext, SHEET_DRILLED_ATTRIBUTE, SHEET_COVERED_ATTRIBUTE, SHEET_PEELING_ATTRIBUTE, SHEET_TREE_CLOSING_ATTRIBUTE, SHEET_SCROLL_ATTRIBUTE, SHEET_PRESSED_ATTRIBUTE, SHEET_CONTROL_HELD_ATTRIBUTE, OVERLAY_CLOSE_FALLBACK_MS, initializePresentationMode, reactInertProps, reactMajorVersion, supportsBooleanInert, initializeInertProps, reactOverlayActions, initializeOverlayActions, reactAdaptiveSheets, jsxAdaptiveSheets, sheetFrameContext, getStackedSheetCanGrow, sheetParentContext, sheetStateContext, inertElementProps, SHEET_IMPLEMENTATION_WAIT_MS, sheetImplementationUnavailable, sheetImplementationWaiters, ambientCloseReasons, SHEET_UNCOVER_CLOSE_GRACE_MS, LIVE_REGION_SELECTOR, defaultSheetState, emptySheetRef, defaultSheetHost, concealedSheetHost, sheetCoverContext, initializeAdaptiveSheets, reactReducedMotion, REDUCED_MOTION_QUERY, REDUCED_MOTION_ATTRIBUTE, initializeReducedMotion, SHEET_DURATION_CLASS, sheetTransitionClasses, sheetRadiusClasses, sheetPopupClasses, SHEET_DISMISS_TRANSLATE_CSS, sheetDrillBodyClasses, sheetBackdropClasses, transparentSheetBackdropClasses, sheetOverflowBackgroundClasses, sheetClipClasses, sheetSeparatorClasses, initializeSheetClassNames, reactSheetDrag, initializeSheetDrag, THEME_TOKEN_SCHEMA_DESCRIPTION, typographyScaleNames, typographyWeightNames, weightRoleMarkers, themeTokenKeys, themeTokenManifest, initializeThemeTokenManifest;
  function getMediaQueryStore(windowObject, query) {
    if (typeof windowObject.matchMedia != "function")
      return null;
    let windowStores = mediaQueryStores.get(windowObject);
    windowStores === void 0 && (windowStores = /* @__PURE__ */ new Map(), mediaQueryStores.set(windowObject, windowStores));
    let store = windowStores.get(query);
    if (store === void 0) {
      let value = windowObject.matchMedia(query);
      store = {
        subscribe: (input) => (value.addEventListener("change", input), () => value.removeEventListener("change", input)),
        getSnapshot: () => value.matches
      }, windowStores.set(query, store);
    }
    return store;
  }
  function useMediaQuery__U(windowObject, query) {
    let store = windowObject == null ? null : getMediaQueryStore(windowObject, query);
    return reactMediaQuery.useSyncExternalStore(store === null ? subscribeNoop : store.subscribe, store === null ? getFalseSnapshot : store.getSnapshot, getFalseSnapshot);
  }
  function resolveWindow(windowOverride) {
    return windowOverride ?? (typeof window > "u" ? void 0 : window);
  }
  function addMediaQueryListener(mediaQuery, listener) {
    mediaQuery.addEventListener?.("change", listener);
  }
  function removeMediaQueryListener(mediaQuery, listener) {
    mediaQuery.removeEventListener?.("change", listener);
  }
  function notifySubscribers(subscribers) {
    let errors = [];
    for (let value of Array.from(subscribers))
      try {
        subscribers.has(value) && value();
      } catch (value2) {
        errors.push(value2);
      }
    if (errors.length > 0)
      throw errors[0];
  }
  function createCoarsePointerStore(windowObject, previousStore) {
    let subscribers = previousStore?.subscribers ?? /* @__PURE__ */ new Set(), mediaQuery = windowObject.matchMedia(COARSE_POINTER_QUERY_rG), store = {
      source: windowObject.matchMedia,
      list: mediaQuery,
      coarse: mediaQuery.matches,
      subscribers,
      onListChange: () => {
        store.coarse = mediaQuery.matches, notifySubscribers(subscribers);
      }
    };
    return subscribers.size > 0 ? (previousStore !== void 0 && removeMediaQueryListener(previousStore.list, previousStore.onListChange), addMediaQueryListener(mediaQuery, store.onListChange), previousStore !== void 0 && previousStore.coarse !== store.coarse && queueMicrotask(() => notifySubscribers(subscribers))) : queueMicrotask(() => {
      subscribers.size === 0 && coarsePointerStores.get(windowObject) === store && coarsePointerStores.delete(windowObject);
    }), coarsePointerStores.set(windowObject, store), store;
  }
  function getCoarsePointerSnapshot(windowOverride) {
    let windowObject = resolveWindow(windowOverride);
    if (typeof windowObject?.matchMedia != "function")
      return !1;
    let store = coarsePointerStores.get(windowObject);
    return store === void 0 || store.source !== windowObject.matchMedia ? createCoarsePointerStore(windowObject, store).coarse : (store.subscribers.size === 0 && (store.coarse = store.list.matches), store.coarse);
  }
  function subscribeCoarsePointer(listener, windowOverride) {
    let windowObject = resolveWindow(windowOverride);
    if (typeof windowObject?.matchMedia != "function")
      return () => {
      };
    let previousStore = coarsePointerStores.get(windowObject), store = previousStore !== void 0 && previousStore.source === windowObject.matchMedia ? previousStore : createCoarsePointerStore(windowObject, previousStore), { subscribers } = store;
    subscribers.size === 0 && (addMediaQueryListener(store.list, store.onListChange), store.coarse = store.list.matches);
    let notify = () => listener();
    return subscribers.add(notify), () => {
      if (!subscribers.delete(notify) || subscribers.size > 0)
        return;
      let entry = coarsePointerStores.get(windowObject);
      entry?.subscribers === subscribers && (removeMediaQueryListener(entry.list, entry.onListChange), coarsePointerStores.delete(windowObject));
    };
  }
  function reportAsyncError(input) {
    typeof reportError == "function" ? reportError(input) : queueMicrotask(() => {
      throw input;
    });
  }
  function invokeAndReportError(input) {
    try {
      input();
    } catch (value) {
      reportAsyncError(value);
    }
  }
  function createSafeObserver(constructObserver) {
    let reported = !1, reportOnce = (input) => {
      reported || (reported = !0, reportAsyncError(input));
    }, observer = null;
    try {
      observer = constructObserver();
    } catch (value) {
      reportOnce(value);
    }
    return {
      observer,
      attempt(input) {
        if (observer === null)
          return !1;
        try {
          return input(observer), !0;
        } catch (value) {
          return reportOnce(value), !1;
        }
      }
    };
  }
  function createSafeResizeObserver(ObserverConstructor, callback) {
    let safeObserver = createSafeObserver(() => new ObserverConstructor(callback));
    return {
      observe: (input, options) => safeObserver.attempt((input2) => options === void 0 ? input2.observe(input) : input2.observe(input, options)),
      unobserve: (input) => safeObserver.observer?.unobserve(input),
      disconnect: () => safeObserver.observer?.disconnect()
    };
  }
  function createSafeMutationObserver(ObserverConstructor, callback) {
    let safeObserver = createSafeObserver(() => new ObserverConstructor(callback));
    return {
      observe: (input, options) => safeObserver.attempt((input2) => input2.observe(input, options)),
      disconnect: () => safeObserver.observer?.disconnect(),
      takeRecords: () => safeObserver.observer?.takeRecords() ?? []
    };
  }
  function createFontAttributeStore() {
    let value, flag = !1, callback = () => {
      let value2 = value;
      return value = readDocumentFont(), flag = !0, value !== value2;
    };
    return {
      subscribe: (input) => {
        if (typeof MutationObserver > "u")
          return () => {
          };
        let value2 = createSafeMutationObserver(MutationObserver, () => {
          callback() && input();
        });
        return value2.observe(document.documentElement, {
          attributes: !0,
          attributeFilter: ["data-font"]
        }), callback() && queueMicrotask(input), () => {
          value2.disconnect(), flag = !1;
        };
      },
      getSnapshot: () => (flag || callback(), value)
    };
  }
  function useDocumentFont(enabled) {
    let [store] = reactDocumentFont.useState(createFontAttributeStore);
    return reactDocumentFont.useSyncExternalStore(enabled ? store.subscribe : subscribeFontNoop, enabled ? store.getSnapshot : getUndefinedFontSnapshot, getUndefinedFontSnapshot);
  }
  function useFeatureFlagAttribute() {
    return reactFeatureFlags.useContext(featureFlagContext);
  }
  function hasFeatureFlagPart(names, part) {
    return names?.split(" ").includes(part) ?? !1;
  }
  function useFeatureFlagPart(part) {
    return hasFeatureFlagPart(useFeatureFlagAttribute(), part);
  }
  function useFizzyColorPart() {
    let enabled = useFeatureFlagPart("color"), themed = (0, runtime2.useCdsThemeId)() !== void 0;
    return enabled && !themed;
  }
  function fizzyIconName(name) {
    return name;
  }
  function mergeFeatureFlagNames(existingNames, additionalNames) {
    if (!additionalNames?.length)
      return existingNames;
    let names = new Set(existingNames?.split(" "));
    for (let value of additionalNames)
      names.add(value);
    return [...names].sort().join(" ");
  }
  function registerInputDismissalTracking(documentObject) {
    if (documentObject === void 0 || inputDismissalStates.has(documentObject))
      return;
    let inputState = {
      observedInput: !1,
      lastInputDismissing: !1
    };
    inputDismissalStates.set(documentObject, inputState);
    let eventTarget = documentObject.defaultView ?? documentObject;
    eventTarget.addEventListener("keydown", (input) => {
      input.isTrusted && (inputState.observedInput = !0, inputState.lastInputDismissing = !input.isComposing && dismissalKeys.has(input.key));
    }, !0), eventTarget.addEventListener("pointerdown", (input) => {
      input.isTrusted && (inputState.observedInput = !0, inputState.lastInputDismissing = !0);
    }, !0), documentObject.defaultView?.addEventListener("blur", () => {
      inputState.observedInput = !1, inputState.lastInputDismissing = !1;
    });
  }
  function trackInputForElement(element) {
    registerInputDismissalTracking(element?.ownerDocument);
  }
  function isInputTriggeredBlur(event) {
    if (event.relatedTarget !== null && event.relatedTarget !== void 0)
      return !1;
    let ownerDocument2 = event.target?.ownerDocument ?? void 0, inputState = ownerDocument2 == null ? void 0 : inputDismissalStates.get(ownerDocument2);
    return inputState === void 0 || !inputState.observedInput ? !1 : inputState.lastInputDismissing;
  }
  function runWithTransition(input, options) {
    try {
      return transitionRunner ? Promise.resolve(transitionRunner(input, options)) : options();
    } catch (value) {
      return Promise.reject(value instanceof Error ? value : Error(String(value)));
    }
  }
  function getResizeObserverConstructor(element) {
    return element?.ownerDocument.defaultView?.ResizeObserver;
  }
  function isAndroidWindow(windowObject) {
    let navigator2 = windowObject.navigator, platform3 = navigator2.userAgentData?.platform ?? "";
    return /android/i.test(platform3) || /android/i.test(navigator2.userAgent ?? "");
  }
  function useAndroidCloseWatcher(enabled, onClose) {
    let windowObject = (0, runtime2.useRootWindow)();
    reactAndroidCloseWatcher.useEffect(() => {
      if (!enabled || windowObject === void 0 || onClose === void 0)
        return;
      let CloseWatcher = windowObject.CloseWatcher;
      if (CloseWatcher === void 0 || !isAndroidWindow(windowObject))
        return;
      let value = null, flag = !1, callback = () => {
        try {
          value = new CloseWatcher();
        } catch {
          value = null;
          return;
        }
        value.onclose = () => {
          onClose(), windowObject.addEventListener("pointerup", callback2, {
            capture: !0,
            once: !0
          }), windowObject.addEventListener("keydown", callback2, {
            capture: !0,
            once: !0
          });
        };
      }, callback2 = () => {
        windowObject.removeEventListener("pointerup", callback2, {
          capture: !0
        }), windowObject.removeEventListener("keydown", callback2, {
          capture: !0
        }), flag || (value?.destroy(), callback());
      };
      return callback(), () => {
        flag = !0, windowObject.removeEventListener("pointerup", callback2, {
          capture: !0
        }), windowObject.removeEventListener("keydown", callback2, {
          capture: !0
        }), value?.destroy();
      };
    }, [enabled, windowObject, onClose]);
  }
  function rubberBandDistance(distance, overshootRoom) {
    return distance <= 0 || overshootRoom <= 0 ? 0 : (1 - 1 / (distance * sheetDragSettings.rubberBand / overshootRoom + 1)) * overshootRoom;
  }
  function inverseRubberBandDistance(distance, overshootRoom) {
    return distance <= 0 || overshootRoom <= 0 ? 0 : (1 / (1 - Math.min(distance, overshootRoom * 0.9) / overshootRoom) - 1) * overshootRoom / sheetDragSettings.rubberBand;
  }
  function calculateSheetBounds(restHeight, availableHeight2, maximumHeightFraction, canGrow = !0) {
    let maximumHeight = Math.max(availableHeight2 * maximumHeightFraction, restHeight), tallHeight = !canGrow || maximumHeight - restHeight < sheetDragSettings.detentThreshold ? restHeight : maximumHeight;
    return {
      rest: restHeight,
      tall: tallHeight,
      room: Math.max(0, (availableHeight2 - tallHeight) * sheetDragSettings.overshootRoom)
    };
  }
  function hasTallSheetDetent(bounds) {
    return bounds.tall > bounds.rest;
  }
  function calculateSheetDragGeometry(bounds, rawHeight) {
    if (rawHeight > bounds.tall)
      return {
        height: bounds.tall + rubberBandDistance(rawHeight - bounds.tall, bounds.room),
        slide: 0,
        shown: 1
      };
    if (rawHeight >= bounds.rest)
      return {
        height: rawHeight,
        slide: 0,
        shown: 1
      };
    let slide = bounds.rest - rawHeight;
    return {
      height: bounds.rest,
      slide,
      shown: 1 - Math.min(1, slide / Math.max(1, bounds.rest))
    };
  }
  function recoverRawSheetHeight(bounds, height2, slide) {
    return height2 > bounds.tall ? bounds.tall + inverseRubberBandDistance(height2 - bounds.tall, bounds.room) : Math.min(height2, bounds.tall) - Math.max(0, slide);
  }
  function determineSheetRelease(bounds, release) {
    let { slide } = calculateSheetDragGeometry(bounds, release.rawAtRelease), dismiss = release.commit && slide > 0 && (slide - release.caughtSlide > bounds.rest * sheetDragSettings.dismissFraction || release.detent === "default" && release.velocity > sheetDragSettings.flingVelocity);
    if (!release.commit || dismiss)
      return {
        dismiss,
        detent: release.detent
      };
    if (release.rawAtGrab > bounds.rest && release.rawAtGrab < bounds.tall) {
      let value = release.rawAtRelease - release.rawAtGrab;
      return value > sheetDragSettings.detentThreshold && hasTallSheetDetent(bounds) ? {
        dismiss: !1,
        detent: "tall"
      } : value < -sheetDragSettings.detentThreshold ? {
        dismiss: !1,
        detent: "default"
      } : {
        dismiss: !1,
        detent: release.detent
      };
    }
    return release.detent === "default" && hasTallSheetDetent(bounds) && release.rawAtRelease > bounds.rest + sheetDragSettings.detentThreshold ? {
      dismiss: !1,
      detent: "tall"
    } : release.detent === "tall" && release.rawAtRelease < bounds.tall - sheetDragSettings.detentThreshold ? {
      dismiss: !1,
      detent: "default"
    } : {
      dismiss: !1,
      detent: release.detent
    };
  }
  function getSheetPositionerStyle(frame) {
    let keyboardInset = frame?.keyboard?.inset ?? 0;
    return keyboardInset > 0 ? {
      ...baseSheetPositionerStyle,
      bottom: keyboardInset
    } : baseSheetPositionerStyle;
  }
  function getSheetAvailableHeight(windowObject, sheetElement) {
    let positioner = sheetElement?.parentElement;
    if (positioner == null)
      return windowObject.innerHeight;
    let topMargin = Number.parseFloat(windowObject.getComputedStyle(positioner)?.scrollMarginTop ?? "");
    return topMargin > 0 ? Math.max(0, windowObject.innerHeight - topMargin) : windowObject.innerHeight;
  }
  function getSheetMinimumHeight(viewportHeight, hasHalfHeightFloor) {
    return hasHalfHeightFloor ? viewportHeight * MIN_SHEET_HEIGHT_FRACTION : 0;
  }
  function getSheetPopupStyle(frame, { floor: floor2, parentFrameHeight }) {
    let keyboard2 = frame?.keyboard ?? null, minimumHeightCss = floor2 === "half" ? `min(${MIN_SHEET_HEIGHT_CSS}, ${MAX_SHEET_HEIGHT_CSS})` : "0px";
    return {
      "--available-height": MAX_SHEET_HEIGHT_CSS,
      width: "100%",
      maxWidth: "none",
      minWidth: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      paddingBottom: keyboard2 !== null ? "0.5rem" : void 0,
      minHeight: keyboard2 !== null ? void 0 : parentFrameHeight !== void 0 ? `max(${minimumHeightCss}, ${parentFrameHeight}px)` : floor2 === "half" ? minimumHeightCss : void 0,
      maxHeight: keyboard2 !== null ? `calc(${keyboard2.visible}px - ${SAFE_AREA_TOP_CSS} - 8px)` : frame?.height !== void 0 ? MAX_SHEET_OVERSHOOT_HEIGHT_CSS : floor2 === "half" ? minimumHeightCss : MAX_SHEET_HEIGHT_CSS,
      height: frame?.detent === "tall" ? MAX_SHEET_HEIGHT_CSS : frame?.height !== void 0 ? `${frame.height}px` : void 0
    };
  }
  function asElement(node) {
    return node?.nodeType === 1 ? node : null;
  }
  function createRequiredRefCallback(input) {
    return (...input2) => input.current(...input2);
  }
  function createOptionalRefCallback(input) {
    return (...input2) => input.current?.(...input2);
  }
  function useOptionalEventCallback(callback) {
    let callbackRef = reactEventCallbacks.useRef(callback);
    reactEventCallbacks.useInsertionEffect(() => {
      callbackRef.current = callback;
    }, [callback]);
    let [stableCallback] = reactEventCallbacks.useState(() => createOptionalRefCallback(callbackRef));
    if (callback !== void 0)
      return stableCallback;
  }
  function useEventCallback(callback) {
    let callbackRef = reactEventCallbacks.useRef(callback);
    reactEventCallbacks.useInsertionEffect(() => {
      callbackRef.current = callback;
    }, [callback]);
    let [stableCallback] = reactEventCallbacks.useState(() => createRequiredRefCallback(callbackRef));
    return stableCallback;
  }
  function isEditableElement(element) {
    return element == null ? !1 : element.matches('input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') ? !0 : asElement(element)?.isContentEditable === !0;
  }
  function measureVisualKeyboard(windowObject) {
    let viewport = windowObject.visualViewport;
    if (viewport == null || Math.abs((viewport.scale ?? 1) - 1) > VIEWPORT_SCALE_TOLERANCE)
      return null;
    let documentHeight = windowObject.document.documentElement.clientHeight;
    return {
      inset: Math.max(0, Math.round(documentHeight - (viewport.offsetTop + viewport.height))),
      visible: Math.round(viewport.height),
      offset: Math.max(0, Math.round(viewport.offsetTop))
    };
  }
  function useVisualKeyboard(enabled, onKeyboardChange, { unpan = !1 } = {}) {
    let windowObject = (0, runtime2.useRootWindow)(), notifyKeyboardChange = useEventCallback(onKeyboardChange);
    reactVisualKeyboard.useEffect(() => {
      if (!enabled || windowObject === void 0)
        return;
      let visualViewport = windowObject.visualViewport;
      if (visualViewport == null)
        return;
      let value = null, flag = !1, index4 = 0, callback = () => {
        index4 = 0;
        let value2 = measureVisualKeyboard(windowObject), clientHeight = windowObject.document.documentElement.clientHeight, value3 = value2 !== null && value2.visible < clientHeight - KEYBOARD_MINIMUM_HEIGHT, value4 = value3 ? value2 : null;
        (value4?.inset !== value?.inset || value4?.visible !== value?.visible || value4?.offset !== value?.offset) && (value = value4, notifyKeyboardChange(value4)), unpan && value3 && !flag && visualViewport.offsetTop > 0 && (flag = !0, windowObject.document.documentElement.scrollIntoView({
          block: "start",
          inline: "start",
          behavior: "instant"
        }), windowObject.scrollTo({
          top: 0,
          left: 0,
          behavior: "instant"
        })), value3 || (flag = !1);
      }, callback2 = () => {
        index4 === 0 && (index4 = windowObject.requestAnimationFrame(callback));
      };
      return callback(), visualViewport.addEventListener("resize", callback2), visualViewport.addEventListener("scroll", callback2), () => {
        visualViewport.removeEventListener("resize", callback2), visualViewport.removeEventListener("scroll", callback2), index4 !== 0 && windowObject.cancelAnimationFrame(index4), notifyKeyboardChange(null);
      };
    }, [enabled, windowObject, notifyKeyboardChange, unpan]);
  }
  function useMobileSheetMediaQuery() {
    return useMediaQuery__U((0, runtime2.useRootWindow)(), MOBILE_COARSE_POINTER_QUERY);
  }
  function usePresentationMode() {
    return reactPresentationMode.useContext(presentationModeContext);
  }
  function useCoarsePresentation() {
    let presentationMode = usePresentationMode(), windowObject = (0, runtime2.useRootWindow)(), coarsePointer = reactPresentationMode.useSyncExternalStore(subscribeNoop, () => windowObject !== void 0 && (getMediaQueryStore(windowObject, "(pointer: coarse)")?.getSnapshot() ?? !1), getFalseSnapshot);
    return presentationMode === "sheet" || coarsePointer;
  }
  function sheetContentCanGrow(element) {
    if (hasEditableSheetContent(element))
      return !0;
    for (let value of Array.from(element.querySelectorAll(`[${SHEET_SCROLL_ATTRIBUTE}]`)))
      if (value.scrollHeight > value.clientHeight + 1)
        return !0;
    return !1;
  }
  function hasEditableSheetContent(element) {
    return element.querySelector(EDITABLE_ELEMENT_SELECTOR) !== null;
  }
  function shouldUseSheetPresentation(mode, anchored, mobileCoarsePointer) {
    return anchored ? !1 : mode !== "auto" ? mode === "sheet" : mobileCoarsePointer;
  }
  function usePresentationWhileShowing(presentation, open4, showing) {
    let [capturedPresentation, setCapturedPresentation] = reactPresentationMode.useState(presentation), [previousOpen, setPreviousOpen] = reactPresentationMode.useState(open4);
    return open4 !== previousOpen && (setPreviousOpen(open4), open4) ? (setCapturedPresentation(presentation), presentation) : showing ? capturedPresentation : presentation;
  }
  function useOverlayShowing(open4) {
    let [wasShowing, setWasShowing] = reactPresentationMode.useState(open4);
    open4 && !wasShowing && setWasShowing(!0);
    let onOpenChangeComplete = reactPresentationMode.useCallback((input) => {
      input || setWasShowing(!1);
    }, []);
    return reactPresentationMode.useEffect(() => {
      if (open4 || !wasShowing)
        return;
      let value = setTimeout(() => {
        setWasShowing(!1);
      }, OVERLAY_CLOSE_FALLBACK_MS);
      return () => {
        clearTimeout(value);
      };
    }, [open4, wasShowing]), {
      showing: open4 || wasShowing,
      onOpenChangeComplete
    };
  }
  function useValueCapturedOnOpen(open4, readValue, defaultValue) {
    let [capturedState, setCapturedState] = reactPresentationMode.useState(() => ({
      wasOpen: open4,
      value: open4 ? readValue() : defaultValue
    })), readValueRef = reactPresentationMode.useRef(readValue);
    if (useIsomorphicLayoutEffect(() => {
      readValueRef.current = readValue;
    }), useIsomorphicLayoutEffect(() => {
      if (!open4)
        return;
      let value = readValueRef.current();
      setCapturedState((input) => input.wasOpen && Object.is(input.value, value) ? input : {
        wasOpen: !0,
        value
      });
    }, [open4]), open4 !== capturedState.wasOpen) {
      let value = open4 ? readValue() : capturedState.value;
      return setCapturedState({
        wasOpen: open4,
        value
      }), value;
    }
    return capturedState.value;
  }
  function getInertProps(inert) {
    return inert ? {
      inert: supportsBooleanInert ? !0 : ""
    } : {};
  }
  function useForwardedOverlayActions(internalActionsRef, forwardedActionsRef) {
    reactOverlayActions.useImperativeHandle(forwardedActionsRef, () => ({
      close: () => internalActionsRef.current?.close?.(),
      unmount: () => internalActionsRef.current?.unmount()
    }), [internalActionsRef]);
  }
  function createMutableValue() {
    let value = null;
    return {
      get: () => value,
      set: (input) => {
        value = input;
      }
    };
  }
  function getSheetFrameHeight(frame, windowObject, element) {
    if (frame !== null)
      return frame.detent === "tall" && windowObject !== void 0 ? Math.round(getSheetAvailableHeight(windowObject, element) * MAX_SHEET_HEIGHT_FRACTION) : frame.height;
  }
  function getStackedSheetHeight(levels) {
    let firstLevel = levels[0], lastLevel = levels.at(-1);
    if (!(firstLevel === void 0 || lastLevel === void 0))
      return Math.max(lastLevel.height, firstLevel.height);
  }
  function useSheetFrame(open4, forwardedActionsRef, onOpenChangeComplete, close) {
    let actionsRef = reactAdaptiveSheets.useRef(null);
    useForwardedOverlayActions(actionsRef, forwardedActionsRef);
    let treeId = reactAdaptiveSheets.useId(), [height2, setHeight] = reactAdaptiveSheets.useState(), [canGrow, setCanGrow] = reactAdaptiveSheets.useState(!0), levelsRef = reactAdaptiveSheets.useRef([]), [detent, setDetent] = reactAdaptiveSheets.useState("default"), focusHoldsRef = reactAdaptiveSheets.useRef(/* @__PURE__ */ new Set()), [hasFocusHold, setHasFocusHold] = reactAdaptiveSheets.useState(!1), [keyboard2, setKeyboard] = reactAdaptiveSheets.useState(null), [previousOpen, setPreviousOpen] = reactAdaptiveSheets.useState(open4);
    open4 !== previousOpen && (setPreviousOpen(open4), open4 && (setHeight(void 0), setCanGrow(!0), setDetent("default"), setHasFocusHold(!1))), useIsomorphicLayoutEffect(() => {
      open4 || (levelsRef.current = [], focusHoldsRef.current = /* @__PURE__ */ new Set());
    }, [open4]), useVisualKeyboard(open4 && hasFocusHold, setKeyboard, {
      unpan: !0
    });
    let { showing, onOpenChangeComplete: completeShowingTransition } = useOverlayShowing(open4), notifyOpenChangeComplete = useOptionalEventCallback(onOpenChangeComplete), lastCompletedOpenRef = reactAdaptiveSheets.useRef(null);
    reactAdaptiveSheets.useEffect(() => {
      lastCompletedOpenRef.current = null;
    }, [open4]);
    let handoffClaimedRef = reactAdaptiveSheets.useRef(!1), handoffTargetRef = reactAdaptiveSheets.useRef(null);
    reactAdaptiveSheets.useEffect(() => {
      open4 && (handoffClaimedRef.current = !1, handoffTargetRef.current = null);
    }, [open4]);
    let claimHandoff = reactAdaptiveSheets.useCallback((input) => {
      let value = !handoffClaimedRef.current;
      return handoffClaimedRef.current = !0, value && (handoffTargetRef.current = input), value;
    }, []), handleOpenChangeComplete = reactAdaptiveSheets.useCallback((input) => {
      input || (focusSheetHandoffTarget(handoffTargetRef.current, treeId), handoffTargetRef.current = null), completeShowingTransition(input), lastCompletedOpenRef.current !== input && (lastCompletedOpenRef.current = input, notifyOpenChangeComplete?.(input));
    }, [completeShowingTransition, notifyOpenChangeComplete, treeId]), pinHeight = reactAdaptiveSheets.useCallback((input, options = !0) => {
      levelsRef.current.length > 0 || !(input > 0) || (levelsRef.current = [
        {
          height: Math.round(input),
          grows: options
        }
      ], setHeight(Math.round(input)), setCanGrow(options));
    }, []), repinHeight = reactAdaptiveSheets.useCallback((input, options) => {
      let current = levelsRef.current, value = current[0];
      value === void 0 || !(input > 0) || (value.height = Math.round(input), options !== void 0 && (value.grows = options), setHeight(getStackedSheetHeight(current)), setCanGrow(getStackedSheetCanGrow(current)));
    }, []), pushLevelHeight = reactAdaptiveSheets.useCallback((input, options = !0) => {
      let state = {
        height: Math.round(input),
        grows: options
      }, current = levelsRef.current;
      current.push(state), setHeight(getStackedSheetHeight(current)), setCanGrow(getStackedSheetCanGrow(current));
      let flag = !1, callback = () => !flag && current === levelsRef.current;
      return {
        set: (input2, options2) => {
          callback() && (state.height = Math.round(input2), options2 !== void 0 && (state.grows = options2), setHeight(getStackedSheetHeight(current)), setCanGrow(getStackedSheetCanGrow(current)));
        },
        release: () => {
          if (flag)
            return;
          let value = current.indexOf(state);
          flag = !0, value >= 0 && current.splice(value, 1), current === levelsRef.current && (setHeight(getStackedSheetHeight(current)), setCanGrow(getStackedSheetCanGrow(current)));
        }
      };
    }, []), holdTextEntryFocus = reactAdaptiveSheets.useCallback(() => {
      let state = {}, current = focusHoldsRef.current;
      return current.add(state), setHasFocusHold(!0), () => {
        current.delete(state), current === focusHoldsRef.current && setHasFocusHold(current.size > 0);
      };
    }, []), closeCallback = useOptionalEventCallback(close), dismiss = reactAdaptiveSheets.useCallback(() => {
      closeCallback !== void 0 ? closeCallback() : actionsRef.current?.close?.();
    }, [closeCallback]), [dragState] = reactAdaptiveSheets.useState(createMutableValue);
    return {
      showing,
      frame: reactAdaptiveSheets.useMemo(() => ({
        treeId,
        open: open4,
        showing,
        height: height2,
        pinHeight,
        repinHeight,
        pushLevelHeight,
        canGrow,
        detent,
        setDetent,
        holdTextEntryFocus,
        keyboard: keyboard2,
        dismiss,
        claimHandoff,
        drag: dragState
      }), [
        treeId,
        open4,
        showing,
        height2,
        canGrow,
        pinHeight,
        repinHeight,
        pushLevelHeight,
        detent,
        holdTextEntryFocus,
        keyboard2,
        dismiss,
        claimHandoff,
        dragState
      ]),
      actionsRef,
      onOpenChangeComplete: handleOpenChangeComplete
    };
  }
  function focusSheetHandoffTarget(element, treeId) {
    if (element === null || !element.isConnected || !element.hasAttribute("data-open") || !(0, runtime2.isSheetTreeDialog)(element))
      return;
    let ownerDocument2 = element.ownerDocument, activeElement2 = ownerDocument2.activeElement;
    (activeElement2 === null || activeElement2 === ownerDocument2.body || activeElement2.closest(`[data-sheet-tree="${CSS.escape(treeId)}"]`) !== null) && asElement(element)?.focus({ preventScroll: !0 });
  }
  function useIsSheet() {
    return reactAdaptiveSheets.useContext(sheetStateContext).sheet;
  }
  function useSheetState() {
    return reactAdaptiveSheets.useContext(sheetStateContext);
  }
  function isLiveRegionEvent(event) {
    let target = event?.target;
    return target instanceof Element && target.closest(LIVE_REGION_SELECTOR) !== null;
  }
  function useAdaptiveSheet(props) {
    let { open: open4, actionsRef: forwardedActionsRef, close, onOpenChange, onOpenChangeComplete, structurallyAnchored = !1, closable = !0, refuseClose } = props, parentSheet = reactAdaptiveSheets.useContext(sheetParentContext), presentationMode = usePresentationMode(), mobileCoarsePointer = useMobileSheetMediaQuery(), sheetFrame = useSheetFrame(open4, forwardedActionsRef, onOpenChangeComplete, close), sheetImplementationAvailable = (0, runtime2.useSheetImplementationLoaded)(), sheetImplementationRejected = (0, runtime2.useSheetImplementationFailed)(), coarsePresentation = useCoarsePresentation();
    reactAdaptiveSheets.useEffect(() => {
      coarsePresentation && !sheetImplementationAvailable && !sheetImplementationRejected && (0, runtime2.preloadSheetImplementation)();
    }, [
      coarsePresentation,
      sheetImplementationAvailable,
      sheetImplementationRejected,
      open4
    ]);
    let prefersSheet = usePresentationWhileShowing(shouldUseSheetPresentation(presentationMode, !1, mobileCoarsePointer) && (closable || presentationMode === "sheet"), open4, sheetFrame.showing), [usesFallback, setUsesFallback] = reactAdaptiveSheets.useState(() => (sheetImplementationUnavailable || sheetImplementationRejected) && !sheetImplementationAvailable), [previousOpen, setPreviousOpen] = reactAdaptiveSheets.useState(open4);
    if (open4 !== previousOpen) {
      setPreviousOpen(open4);
      let value = (sheetImplementationUnavailable || sheetImplementationRejected) && !sheetImplementationAvailable;
      open4 && usesFallback !== value && setUsesFallback(value);
    }
    open4 && sheetImplementationRejected && !sheetImplementationAvailable && !usesFallback && setUsesFallback(!0);
    let waitingForImplementation = prefersSheet && !structurallyAnchored && !sheetImplementationAvailable && !usesFallback;
    reactAdaptiveSheets.useEffect(() => {
      if (!waitingForImplementation || !open4)
        return;
      let callback = () => {
        (0, runtime2.isSheetImplementationLoaded)() || (sheetImplementationUnavailable = !0, setUsesFallback(!0));
      };
      sheetImplementationWaiters.add(callback);
      let value = setTimeout(callback, SHEET_IMPLEMENTATION_WAIT_MS);
      return () => {
        sheetImplementationWaiters.delete(callback), clearTimeout(value);
      };
    }, [waitingForImplementation, open4]);
    let sheet = prefersSheet && !structurallyAnchored && !usesFallback;
    useAndroidCloseWatcher(open4 && prefersSheet && !structurallyAnchored && usesFallback, sheetFrame.frame.dismiss);
    let pending = sheet && sheetFrame.showing && (!sheetImplementationAvailable || !open4), depth = sheet && parentSheet !== null ? parentSheet.depth + 1 : 0, coveringChildrenRef = reactAdaptiveSheets.useRef(/* @__PURE__ */ new Set()), lastUncoveredAtRef = reactAdaptiveSheets.useRef(0), [covered, setCovered] = reactAdaptiveSheets.useState(!1), cover = reactAdaptiveSheets.useCallback((input) => (coveringChildrenRef.current.add(input), setCovered(!0), () => {
      coveringChildrenRef.current.delete(input), lastUncoveredAtRef.current = Date.now(), setCovered(coveringChildrenRef.current.size > 0);
    }), []), [coverToken] = reactAdaptiveSheets.useState(() => ({}));
    useIsomorphicLayoutEffect(() => {
      if (!(!sheet || !open4 || parentSheet === null))
        return parentSheet.cover(coverToken);
    }, [sheet, open4, parentSheet, coverToken]);
    let windowObject = (0, runtime2.useRootWindow)(), treeId = sheetFrame.frame.treeId, [focusOutsideCoveredSheet, setFocusOutsideCoveredSheet] = reactAdaptiveSheets.useState(!1);
    useIsomorphicLayoutEffect(() => {
      if (!covered || windowObject === void 0)
        return;
      let index4 = 0, callback = () => {
        let activeElement2 = windowObject.document.activeElement;
        if (activeElement2 !== null && activeElement2.closest(`[data-sheet-tree="${CSS.escape(treeId)}"]`) !== null) {
          index4 = windowObject.requestAnimationFrame(callback);
          return;
        }
        setFocusOutsideCoveredSheet(!0);
      };
      return index4 = windowObject.requestAnimationFrame(callback), () => {
        windowObject.cancelAnimationFrame(index4), setFocusOutsideCoveredSheet(!1);
      };
    }, [covered, treeId, windowObject]);
    let inert = covered && focusOutsideCoveredSheet, notifyOpenChange = useOptionalEventCallback(onOpenChange), refuseCloseCallback = useOptionalEventCallback(refuseClose), sheetRef = reactAdaptiveSheets.useRef(sheet);
    useIsomorphicLayoutEffect(() => {
      sheetRef.current = sheet;
    }, [sheet]);
    let refusesAmbientClose = reactAdaptiveSheets.useCallback((input) => input.reason === void 0 ? !1 : (coveringChildrenRef.current.size > 0 || Date.now() - lastUncoveredAtRef.current < SHEET_UNCOVER_CLOSE_GRACE_MS) && ambientCloseReasons.has(input.reason) ? !0 : sheetRef.current && input.reason === "outside-press" && isLiveRegionEvent(input.event), []), closeRequestRef = reactAdaptiveSheets.useRef(null), takeCloseRequest = reactAdaptiveSheets.useCallback(() => {
      let current = closeRequestRef.current;
      return closeRequestRef.current = null, current?.isCanceled === !0 ? null : current;
    }, []), handleOpenChange = reactAdaptiveSheets.useCallback((input, options) => {
      let value = options;
      if (!input && refusesAmbientClose(value)) {
        value.cancel?.();
        return;
      }
      if (!input && sheetRef.current && refuseCloseCallback?.(options, treeId) === !0) {
        value.cancel?.();
        return;
      }
      closeRequestRef.current = input ? null : value, input || windowObject?.requestAnimationFrame(() => {
        closeRequestRef.current === value && (closeRequestRef.current = null);
      }), input && coarsePresentation && (0, runtime2.preloadSheetImplementation)(), notifyOpenChange?.(input, options);
    }, [
      notifyOpenChange,
      refuseCloseCallback,
      refusesAmbientClose,
      treeId,
      coarsePresentation,
      windowObject
    ]), state = reactAdaptiveSheets.useMemo(() => ({
      sheet,
      pending,
      covered,
      inert,
      depth
    }), [sheet, pending, covered, inert, depth]), parentFrameHeight = parentSheet?.frameHeight, effectiveFrame = reactAdaptiveSheets.useMemo(() => {
      let value = sheetFrame.frame.height !== void 0 && parentFrameHeight !== void 0 ? Math.max(sheetFrame.frame.height, parentFrameHeight) : sheetFrame.frame.height;
      return value !== sheetFrame.frame.height ? {
        ...sheetFrame.frame,
        height: value
      } : sheetFrame.frame;
    }, [sheetFrame.frame, parentFrameHeight]), frame = reactAdaptiveSheets.useMemo(() => ({
      ...effectiveFrame,
      refusesAmbientClose,
      takeCloseRequest
    }), [effectiveFrame, refusesAmbientClose, takeCloseRequest]), stack = reactAdaptiveSheets.useMemo(() => ({
      cover
    }), [cover]);
    return {
      sheet,
      showing: sheetFrame.showing,
      frame,
      actionsRef: sheetFrame.actionsRef,
      onOpenChange: handleOpenChange,
      onOpenChangeComplete: sheetFrame.onOpenChangeComplete,
      modal: sheet ? !0 : void 0,
      state,
      stack
    };
  }
  function ResetSheetContexts({ children }) {
    return jsxAdaptiveSheets.jsx(sheetStateContext.Provider, {
      value: defaultSheetState,
      children: jsxAdaptiveSheets.jsx(sheetParentContext.Provider, {
        value: null,
        children: jsxAdaptiveSheets.jsx(sheetCoverContext.Provider, {
          value: null,
          children: jsxAdaptiveSheets.jsx(sheetFrameContext.Provider, {
            value: null,
            children
          })
        })
      })
    });
  }
  function FloatingPositionRenderProp(props) {
    let { children, ...remainingProps } = props, value = useAdaptiveSheet(remainingProps);
    return jsxAdaptiveSheets.jsx(SheetContextProvider, {
      value,
      children: children(value)
    });
  }
  function SheetContextProvider({ value, children }) {
    return jsxAdaptiveSheets.jsx(sheetStateContext.Provider, {
      value: value.state,
      children: jsxAdaptiveSheets.jsx(sheetCoverContext.Provider, {
        value: value.stack.cover,
        children: jsxAdaptiveSheets.jsx(sheetFrameContext.Provider, {
          value: value.frame,
          children
        })
      })
    });
  }
  function useControllableOpen(props) {
    let [uncontrolledOpen, setUncontrolledOpen] = reactAdaptiveSheets.useState(props.defaultOpen ?? !1), open4 = props.open ?? uncontrolledOpen, onOpenChange = useOptionalEventCallback(props.onOpenChange);
    return {
      open: open4,
      onOpenChange: reactAdaptiveSheets.useCallback((input, options) => {
        onOpenChange?.(input, options), options.isCanceled || setUncontrolledOpen(input);
      }, [onOpenChange])
    };
  }
  function useHasSheetFrame() {
    return reactAdaptiveSheets.useContext(sheetFrameContext) !== null;
  }
  function useSheetCapablePresentation() {
    let value = useCoarsePresentation(), value2 = reactAdaptiveSheets.useContext(sheetFrameContext) !== null;
    return value || value2;
  }
  function useSheetImplementation() {
    let implementation = (0, runtime2.useLoadedSheetImplementation)(), frame = reactAdaptiveSheets.useContext(sheetFrameContext), showing = frame?.showing ?? !1, open4 = frame?.open ?? !1, { sheet } = useSheetState(), canCaptureImplementation = !showing || sheet && open4, [capturedImplementation, setCapturedImplementation] = reactAdaptiveSheets.useState(() => implementation !== null && canCaptureImplementation ? implementation : null);
    return capturedImplementation === null && implementation !== null && canCaptureImplementation ? (setCapturedImplementation(implementation), implementation) : capturedImplementation;
  }
  function isReducedMotion() {
    return typeof window > "u" || typeof document > "u" ? !1 : typeof window.matchMedia == "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches || document.documentElement.getAttribute(REDUCED_MOTION_ATTRIBUTE) === "true";
  }
  function resetSheetDragStyle(input) {
    input.style.transition = "", input.style.translate = "";
  }
  function useSheetDrag() {
    let frame = reactSheetDrag.useContext(sheetFrameContext), [dragOwner] = reactSheetDrag.useState(() => ({})), [fallbackDragState] = reactSheetDrag.useState(createMutableValue), dragState = frame?.drag ?? fallbackDragState, findTreeSheets = (element) => frame === null ? [] : Array.from(element.ownerDocument.querySelectorAll(`[data-presentation="sheet"][data-sheet-tree="${CSS.escape(frame.treeId)}"]:not([data-ending-style])`)), applyDragGeometry = (input, options) => {
      let { height: value, slide: value2, shown: value3 } = calculateSheetDragGeometry(input, input.raw - options);
      for (let { el: value5 } of input.sheets)
        value5.style.height = `${value}px`, value5.style.translate = value2 > 0 ? `0 ${value2}px` : "";
      let value4 = value3 < 1 ? value3.toFixed(3) : "";
      for (let value5 of input.scrims)
        value5.style.opacity !== value4 && (value5.style.opacity = value4);
    }, onPointerDown = (event) => {
      if (frame === null || !frame.open || event.button !== 0 || dragState.get() !== null || frame.keyboard !== null || event.target instanceof Element && event.target.closest('button, a, input, textarea, [role="menuitem"], [role="option"], [data-cds-sheet-control]') !== null || event.currentTarget.closest("[data-cds-sheet-covered]") !== null)
        return;
      let ancestor = event.currentTarget.closest('[data-presentation="sheet"]');
      if (ancestor === null)
        return;
      let bounds = ancestor.getBoundingClientRect(), height2 = bounds.height, value = ancestor.parentElement?.getBoundingClientRect().bottom, value2 = Math.max(0, bounds.bottom - (value ?? bounds.bottom)), defaultView = ancestor.ownerDocument.defaultView, value3 = defaultView === null ? height2 : getSheetAvailableHeight(defaultView, ancestor);
      event.currentTarget.setPointerCapture(event.pointerId);
      let value4 = findTreeSheets(ancestor).map((input) => {
        let height22 = input.style.height;
        return input.style.transition = "none", input.style.height = `${height2}px`, {
          el: input,
          height: height22
        };
      }), value5 = frame.canGrow || frame.detent === "tall", value6 = calculateSheetBounds(Math.min(frame.height ?? height2, height2), value3, MAX_SHEET_HEIGHT_FRACTION, value5), value7 = isReducedMotion() || !value5 ? {
        ...value6,
        room: 0
      } : value6, value8 = Array.from(ancestor.ownerDocument.querySelectorAll(`[data-presentation="sheet"][data-sheet-scrim="${CSS.escape(frame.treeId)}"]`));
      for (let value9 of value8)
        value9.style.transition = "none";
      let state = {
        owner: dragOwner,
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastT: event.timeStamp,
        velocity: 0,
        detent: frame.detent,
        raw: recoverRawSheetHeight(value7, height2, value2),
        caughtSlide: value2,
        ...value7,
        sheets: value4,
        doc: ancestor.ownerDocument,
        scrims: value8
      };
      dragState.set(state), applyDragGeometry(state, 0);
    }, onPointerMove = (input) => {
      let entry = dragState.get();
      if (entry === null || entry.owner !== dragOwner || input.pointerId !== entry.pointerId)
        return;
      let value = input.timeStamp - entry.lastT;
      value > 0 && (entry.velocity = (input.clientY - entry.lastY) / value), entry.lastY = input.clientY, entry.lastT = input.timeStamp, applyDragGeometry(entry, input.clientY - entry.startY);
    }, restoreDragStyles = (input, options) => {
      for (let { el: value, height: value2 } of input.sheets)
        value.style.transition = "", options ? value.style.translate = `0 ${SHEET_DISMISS_TRANSLATE_CSS}` : (value.style.height = value2, value.style.translate = "");
      for (let value of input.scrims)
        value.style.transition = "", value.style.opacity = "";
    }, open4 = frame?.open ?? !1;
    useIsomorphicLayoutEffect(() => {
      let entry = dragState.get();
      !open4 && entry !== null && entry.owner === dragOwner && (dragState.set(null), restoreDragStyles(entry, !1));
    }, [open4, dragState, dragOwner]);
    let latestFrameRef = reactSheetDrag.useRef({
      open: !1,
      height: void 0,
      detent: "default"
    });
    useIsomorphicLayoutEffect(() => {
      latestFrameRef.current = {
        open: frame?.open ?? !1,
        height: frame?.height,
        detent: frame?.detent ?? "default"
      };
    }, [frame]), reactSheetDrag.useEffect(() => () => {
      let entry = dragState.get();
      entry !== null && entry.owner === dragOwner && (dragState.set(null), restoreDragStyles(entry, !1));
    }, [dragState, dragOwner]);
    let finishDrag = (input, options) => {
      let entry = dragState.get();
      if (entry === null || entry.owner !== dragOwner || frame === null || input.pointerId !== entry.pointerId)
        return;
      dragState.set(null), input.currentTarget.hasPointerCapture(input.pointerId) && input.currentTarget.releasePointerCapture(input.pointerId);
      let value = entry.lastY - entry.startY, value2 = input.timeStamp - entry.lastT > 100 ? 0 : entry.velocity, { dismiss: value3, detent: value4 } = determineSheetRelease(entry, {
        detent: entry.detent,
        rawAtGrab: entry.raw,
        rawAtRelease: entry.raw - value,
        caughtSlide: entry.caughtSlide,
        velocity: value2,
        commit: options
      });
      if (restoreDragStyles(entry, value3), value3) {
        frame.dismiss();
        let { doc: value5 } = entry;
        value5.defaultView?.requestAnimationFrame(() => {
          let current = latestFrameRef.current;
          if (!current.open)
            return;
          let value6 = current.detent === "tall" ? MAX_SHEET_HEIGHT_CSS : current.height !== void 0 ? `${current.height}px` : "";
          for (let value7 of value5.querySelectorAll(`[data-sheet-tree="${CSS.escape(frame.treeId)}"][data-presentation="sheet"]`))
            resetSheetDragStyle(value7), value7.style.height = value6;
        });
      } else
        value4 !== entry.detent && frame.setDetent(value4);
    };
    return {
      onPointerDown,
      onPointerMove,
      onPointerUp: (input) => finishDrag(input, !0),
      onPointerCancel: (input) => finishDrag(input, !1),
      onLostPointerCapture: (input) => finishDrag(input, !1)
    };
  }
  return bindRuntimeValue(runtime2, "accentColorNames", () => accentColorNames, (value) => {
    accentColorNames = value;
  }), bindRuntimeValue(runtime2, "initializeAccentColors", () => initializeAccentColors, (value) => {
    initializeAccentColors = value;
  }), bindRuntimeValue(runtime2, "getMediaQueryStore", () => getMediaQueryStore), bindRuntimeValue(runtime2, "useMediaQuery__U", () => useMediaQuery__U), bindRuntimeValue(runtime2, "reactMediaQuery", () => reactMediaQuery, (value) => {
    reactMediaQuery = value;
  }), bindRuntimeValue(runtime2, "MOBILE_COARSE_POINTER_QUERY", () => MOBILE_COARSE_POINTER_QUERY, (value) => {
    MOBILE_COARSE_POINTER_QUERY = value;
  }), bindRuntimeValue(runtime2, "mediaQueryStores", () => mediaQueryStores, (value) => {
    mediaQueryStores = value;
  }), bindRuntimeValue(runtime2, "subscribeNoop", () => subscribeNoop, (value) => {
    subscribeNoop = value;
  }), bindRuntimeValue(runtime2, "getFalseSnapshot", () => getFalseSnapshot, (value) => {
    getFalseSnapshot = value;
  }), bindRuntimeValue(runtime2, "COARSE_POINTER_QUERY_rG", () => COARSE_POINTER_QUERY_rG, (value) => {
    COARSE_POINTER_QUERY_rG = value;
  }), bindRuntimeValue(runtime2, "initializeMediaQueryStores", () => initializeMediaQueryStores, (value) => {
    initializeMediaQueryStores = value;
  }), bindRuntimeValue(runtime2, "resolveWindow", () => resolveWindow), bindRuntimeValue(runtime2, "addMediaQueryListener", () => addMediaQueryListener), bindRuntimeValue(runtime2, "removeMediaQueryListener", () => removeMediaQueryListener), bindRuntimeValue(runtime2, "notifySubscribers", () => notifySubscribers), bindRuntimeValue(runtime2, "createCoarsePointerStore", () => createCoarsePointerStore), bindRuntimeValue(runtime2, "getCoarsePointerSnapshot", () => getCoarsePointerSnapshot), bindRuntimeValue(runtime2, "subscribeCoarsePointer", () => subscribeCoarsePointer), bindRuntimeValue(runtime2, "coarsePointerStores", () => coarsePointerStores, (value) => {
    coarsePointerStores = value;
  }), bindRuntimeValue(runtime2, "initializeCoarsePointerStores", () => initializeCoarsePointerStores, (value) => {
    initializeCoarsePointerStores = value;
  }), bindRuntimeValue(runtime2, "reportAsyncError", () => reportAsyncError), bindRuntimeValue(runtime2, "invokeAndReportError", () => invokeAndReportError), bindRuntimeValue(runtime2, "initializeErrorReporting", () => initializeErrorReporting, (value) => {
    initializeErrorReporting = value;
  }), bindRuntimeValue(runtime2, "createSafeObserver", () => createSafeObserver), bindRuntimeValue(runtime2, "createSafeResizeObserver", () => createSafeResizeObserver), bindRuntimeValue(runtime2, "createSafeMutationObserver", () => createSafeMutationObserver), bindRuntimeValue(runtime2, "initializeSafeObservers", () => initializeSafeObservers, (value) => {
    initializeSafeObservers = value;
  }), bindRuntimeValue(runtime2, "createFontAttributeStore", () => createFontAttributeStore), bindRuntimeValue(runtime2, "useDocumentFont", () => useDocumentFont), bindRuntimeValue(runtime2, "reactDocumentFont", () => reactDocumentFont, (value) => {
    reactDocumentFont = value;
  }), bindRuntimeValue(runtime2, "supportedFonts", () => supportedFonts, (value) => {
    supportedFonts = value;
  }), bindRuntimeValue(runtime2, "isSupportedFont", () => isSupportedFont, (value) => {
    isSupportedFont = value;
  }), bindRuntimeValue(runtime2, "readDocumentFont", () => readDocumentFont, (value) => {
    readDocumentFont = value;
  }), bindRuntimeValue(runtime2, "subscribeFontNoop", () => subscribeFontNoop, (value) => {
    subscribeFontNoop = value;
  }), bindRuntimeValue(runtime2, "getUndefinedFontSnapshot", () => getUndefinedFontSnapshot, (value) => {
    getUndefinedFontSnapshot = value;
  }), bindRuntimeValue(runtime2, "initializeDocumentFont", () => initializeDocumentFont, (value) => {
    initializeDocumentFont = value;
  }), bindRuntimeValue(runtime2, "useFeatureFlagAttribute", () => useFeatureFlagAttribute), bindRuntimeValue(runtime2, "hasFeatureFlagPart", () => hasFeatureFlagPart), bindRuntimeValue(runtime2, "useFeatureFlagPart", () => useFeatureFlagPart), bindRuntimeValue(runtime2, "useFizzyColorPart", () => useFizzyColorPart), bindRuntimeValue(runtime2, "fizzyIconName", () => fizzyIconName), bindRuntimeValue(runtime2, "mergeFeatureFlagNames", () => mergeFeatureFlagNames), bindRuntimeValue(runtime2, "reactFeatureFlags", () => reactFeatureFlags, (value) => {
    reactFeatureFlags = value;
  }), bindRuntimeValue(runtime2, "featureFlagContext", () => featureFlagContext, (value) => {
    featureFlagContext = value;
  }), bindRuntimeValue(runtime2, "initializeFeatureFlags", () => initializeFeatureFlags, (value) => {
    initializeFeatureFlags = value;
  }), bindRuntimeValue(runtime2, "registerInputDismissalTracking", () => registerInputDismissalTracking), bindRuntimeValue(runtime2, "trackInputForElement", () => trackInputForElement), bindRuntimeValue(runtime2, "isInputTriggeredBlur", () => isInputTriggeredBlur), bindRuntimeValue(runtime2, "inputDismissalStates", () => inputDismissalStates, (value) => {
    inputDismissalStates = value;
  }), bindRuntimeValue(runtime2, "dismissalKeys", () => dismissalKeys, (value) => {
    dismissalKeys = value;
  }), bindRuntimeValue(runtime2, "initializeInputDismissalTracking", () => initializeInputDismissalTracking, (value) => {
    initializeInputDismissalTracking = value;
  }), bindRuntimeValue(runtime2, "runWithTransition", () => runWithTransition), bindRuntimeValue(runtime2, "transitionRunner", () => transitionRunner, (value) => {
    transitionRunner = value;
  }), bindRuntimeValue(runtime2, "initializeTransitionRunner", () => initializeTransitionRunner, (value) => {
    initializeTransitionRunner = value;
  }), bindRuntimeValue(runtime2, "reactIsomorphicLayoutEffect", () => reactIsomorphicLayoutEffect, (value) => {
    reactIsomorphicLayoutEffect = value;
  }), bindRuntimeValue(runtime2, "useIsomorphicLayoutEffect", () => useIsomorphicLayoutEffect, (value) => {
    useIsomorphicLayoutEffect = value;
  }), bindRuntimeValue(runtime2, "initializeIsomorphicLayoutEffect", () => initializeIsomorphicLayoutEffect, (value) => {
    initializeIsomorphicLayoutEffect = value;
  }), bindRuntimeValue(runtime2, "getResizeObserverConstructor", () => getResizeObserverConstructor), bindRuntimeValue(runtime2, "initializeResizeObserverAccess", () => initializeResizeObserverAccess, (value) => {
    initializeResizeObserverAccess = value;
  }), bindRuntimeValue(runtime2, "isAndroidWindow", () => isAndroidWindow), bindRuntimeValue(runtime2, "useAndroidCloseWatcher", () => useAndroidCloseWatcher), bindRuntimeValue(runtime2, "reactAndroidCloseWatcher", () => reactAndroidCloseWatcher, (value) => {
    reactAndroidCloseWatcher = value;
  }), bindRuntimeValue(runtime2, "initializeAndroidCloseWatcher", () => initializeAndroidCloseWatcher, (value) => {
    initializeAndroidCloseWatcher = value;
  }), bindRuntimeValue(runtime2, "rubberBandDistance", () => rubberBandDistance), bindRuntimeValue(runtime2, "inverseRubberBandDistance", () => inverseRubberBandDistance), bindRuntimeValue(runtime2, "calculateSheetBounds", () => calculateSheetBounds), bindRuntimeValue(runtime2, "hasTallSheetDetent", () => hasTallSheetDetent), bindRuntimeValue(runtime2, "calculateSheetDragGeometry", () => calculateSheetDragGeometry), bindRuntimeValue(runtime2, "recoverRawSheetHeight", () => recoverRawSheetHeight), bindRuntimeValue(runtime2, "determineSheetRelease", () => determineSheetRelease), bindRuntimeValue(runtime2, "sheetDragSettings", () => sheetDragSettings, (value) => {
    sheetDragSettings = value;
  }), bindRuntimeValue(runtime2, "initializeSheetDragSettings", () => initializeSheetDragSettings, (value) => {
    initializeSheetDragSettings = value;
  }), bindRuntimeValue(runtime2, "getSheetPositionerStyle", () => getSheetPositionerStyle), bindRuntimeValue(runtime2, "getSheetAvailableHeight", () => getSheetAvailableHeight), bindRuntimeValue(runtime2, "getSheetMinimumHeight", () => getSheetMinimumHeight), bindRuntimeValue(runtime2, "getSheetPopupStyle", () => getSheetPopupStyle), bindRuntimeValue(runtime2, "SAFE_AREA_TOP_CSS", () => SAFE_AREA_TOP_CSS, (value) => {
    SAFE_AREA_TOP_CSS = value;
  }), bindRuntimeValue(runtime2, "VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS", () => VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS, (value) => {
    VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS = value;
  }), bindRuntimeValue(runtime2, "baseSheetPositionerStyle", () => baseSheetPositionerStyle, (value) => {
    baseSheetPositionerStyle = value;
  }), bindRuntimeValue(runtime2, "sheetPositioningOverrides", () => sheetPositioningOverrides, (value) => {
    sheetPositioningOverrides = value;
  }), bindRuntimeValue(runtime2, "MAX_SHEET_HEIGHT_FRACTION", () => MAX_SHEET_HEIGHT_FRACTION, (value) => {
    MAX_SHEET_HEIGHT_FRACTION = value;
  }), bindRuntimeValue(runtime2, "MAX_SHEET_HEIGHT_CSS", () => MAX_SHEET_HEIGHT_CSS, (value) => {
    MAX_SHEET_HEIGHT_CSS = value;
  }), bindRuntimeValue(runtime2, "MAX_SHEET_OVERSHOOT_HEIGHT_CSS", () => MAX_SHEET_OVERSHOOT_HEIGHT_CSS, (value) => {
    MAX_SHEET_OVERSHOOT_HEIGHT_CSS = value;
  }), bindRuntimeValue(runtime2, "SHEET_DENSITY", () => SHEET_DENSITY, (value) => {
    SHEET_DENSITY = value;
  }), bindRuntimeValue(runtime2, "MIN_SHEET_HEIGHT_FRACTION", () => MIN_SHEET_HEIGHT_FRACTION, (value) => {
    MIN_SHEET_HEIGHT_FRACTION = value;
  }), bindRuntimeValue(runtime2, "MIN_SHEET_HEIGHT_CSS", () => MIN_SHEET_HEIGHT_CSS, (value) => {
    MIN_SHEET_HEIGHT_CSS = value;
  }), bindRuntimeValue(runtime2, "initializeSheetStyles", () => initializeSheetStyles, (value) => {
    initializeSheetStyles = value;
  }), bindRuntimeValue(runtime2, "asElement", () => asElement), bindRuntimeValue(runtime2, "initializeElementAccess", () => initializeElementAccess, (value) => {
    initializeElementAccess = value;
  }), bindRuntimeValue(runtime2, "createRequiredRefCallback", () => createRequiredRefCallback), bindRuntimeValue(runtime2, "createOptionalRefCallback", () => createOptionalRefCallback), bindRuntimeValue(runtime2, "useOptionalEventCallback", () => useOptionalEventCallback), bindRuntimeValue(runtime2, "useEventCallback", () => useEventCallback), bindRuntimeValue(runtime2, "reactEventCallbacks", () => reactEventCallbacks, (value) => {
    reactEventCallbacks = value;
  }), bindRuntimeValue(runtime2, "initializeEventCallbacks", () => initializeEventCallbacks, (value) => {
    initializeEventCallbacks = value;
  }), bindRuntimeValue(runtime2, "isEditableElement", () => isEditableElement), bindRuntimeValue(runtime2, "measureVisualKeyboard", () => measureVisualKeyboard), bindRuntimeValue(runtime2, "useVisualKeyboard", () => useVisualKeyboard), bindRuntimeValue(runtime2, "reactVisualKeyboard", () => reactVisualKeyboard, (value) => {
    reactVisualKeyboard = value;
  }), bindRuntimeValue(runtime2, "EDITABLE_ELEMENT_SELECTOR", () => EDITABLE_ELEMENT_SELECTOR, (value) => {
    EDITABLE_ELEMENT_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "KEYBOARD_MINIMUM_HEIGHT", () => KEYBOARD_MINIMUM_HEIGHT, (value) => {
    KEYBOARD_MINIMUM_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "VIEWPORT_SCALE_TOLERANCE", () => VIEWPORT_SCALE_TOLERANCE, (value) => {
    VIEWPORT_SCALE_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "initializeVisualKeyboard", () => initializeVisualKeyboard, (value) => {
    initializeVisualKeyboard = value;
  }), bindRuntimeValue(runtime2, "useMobileSheetMediaQuery", () => useMobileSheetMediaQuery), bindRuntimeValue(runtime2, "usePresentationMode", () => usePresentationMode), bindRuntimeValue(runtime2, "useCoarsePresentation", () => useCoarsePresentation), bindRuntimeValue(runtime2, "sheetContentCanGrow", () => sheetContentCanGrow), bindRuntimeValue(runtime2, "hasEditableSheetContent", () => hasEditableSheetContent), bindRuntimeValue(runtime2, "shouldUseSheetPresentation", () => shouldUseSheetPresentation), bindRuntimeValue(runtime2, "usePresentationWhileShowing", () => usePresentationWhileShowing), bindRuntimeValue(runtime2, "useOverlayShowing", () => useOverlayShowing), bindRuntimeValue(runtime2, "useValueCapturedOnOpen", () => useValueCapturedOnOpen), bindRuntimeValue(runtime2, "reactPresentationMode", () => reactPresentationMode, (value) => {
    reactPresentationMode = value;
  }), bindRuntimeValue(runtime2, "presentationModeContext", () => presentationModeContext, (value) => {
    presentationModeContext = value;
  }), bindRuntimeValue(runtime2, "SHEET_DRILLED_ATTRIBUTE", () => SHEET_DRILLED_ATTRIBUTE, (value) => {
    SHEET_DRILLED_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHEET_COVERED_ATTRIBUTE", () => SHEET_COVERED_ATTRIBUTE, (value) => {
    SHEET_COVERED_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHEET_PEELING_ATTRIBUTE", () => SHEET_PEELING_ATTRIBUTE, (value) => {
    SHEET_PEELING_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHEET_TREE_CLOSING_ATTRIBUTE", () => SHEET_TREE_CLOSING_ATTRIBUTE, (value) => {
    SHEET_TREE_CLOSING_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHEET_SCROLL_ATTRIBUTE", () => SHEET_SCROLL_ATTRIBUTE, (value) => {
    SHEET_SCROLL_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHEET_PRESSED_ATTRIBUTE", () => SHEET_PRESSED_ATTRIBUTE, (value) => {
    SHEET_PRESSED_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHEET_CONTROL_HELD_ATTRIBUTE", () => SHEET_CONTROL_HELD_ATTRIBUTE, (value) => {
    SHEET_CONTROL_HELD_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "OVERLAY_CLOSE_FALLBACK_MS", () => OVERLAY_CLOSE_FALLBACK_MS, (value) => {
    OVERLAY_CLOSE_FALLBACK_MS = value;
  }), bindRuntimeValue(runtime2, "initializePresentationMode", () => initializePresentationMode, (value) => {
    initializePresentationMode = value;
  }), bindRuntimeValue(runtime2, "getInertProps", () => getInertProps), bindRuntimeValue(runtime2, "reactInertProps", () => reactInertProps, (value) => {
    reactInertProps = value;
  }), bindRuntimeValue(runtime2, "reactMajorVersion", () => reactMajorVersion, (value) => {
    reactMajorVersion = value;
  }), bindRuntimeValue(runtime2, "supportsBooleanInert", () => supportsBooleanInert, (value) => {
    supportsBooleanInert = value;
  }), bindRuntimeValue(runtime2, "initializeInertProps", () => initializeInertProps, (value) => {
    initializeInertProps = value;
  }), bindRuntimeValue(runtime2, "useForwardedOverlayActions", () => useForwardedOverlayActions), bindRuntimeValue(runtime2, "reactOverlayActions", () => reactOverlayActions, (value) => {
    reactOverlayActions = value;
  }), bindRuntimeValue(runtime2, "initializeOverlayActions", () => initializeOverlayActions, (value) => {
    initializeOverlayActions = value;
  }), bindRuntimeValue(runtime2, "createMutableValue", () => createMutableValue), bindRuntimeValue(runtime2, "getSheetFrameHeight", () => getSheetFrameHeight), bindRuntimeValue(runtime2, "getStackedSheetHeight", () => getStackedSheetHeight), bindRuntimeValue(runtime2, "useSheetFrame", () => useSheetFrame), bindRuntimeValue(runtime2, "useIsSheet", () => useIsSheet), bindRuntimeValue(runtime2, "useSheetState", () => useSheetState), bindRuntimeValue(runtime2, "isLiveRegionEvent", () => isLiveRegionEvent), bindRuntimeValue(runtime2, "useAdaptiveSheet", () => useAdaptiveSheet), bindRuntimeValue(runtime2, "ResetSheetContexts", () => ResetSheetContexts), bindRuntimeValue(runtime2, "FloatingPositionRenderProp", () => FloatingPositionRenderProp), bindRuntimeValue(runtime2, "SheetContextProvider", () => SheetContextProvider), bindRuntimeValue(runtime2, "useControllableOpen", () => useControllableOpen), bindRuntimeValue(runtime2, "useHasSheetFrame", () => useHasSheetFrame), bindRuntimeValue(runtime2, "useSheetCapablePresentation", () => useSheetCapablePresentation), bindRuntimeValue(runtime2, "useSheetImplementation", () => useSheetImplementation), bindRuntimeValue(runtime2, "reactAdaptiveSheets", () => reactAdaptiveSheets, (value) => {
    reactAdaptiveSheets = value;
  }), bindRuntimeValue(runtime2, "jsxAdaptiveSheets", () => jsxAdaptiveSheets, (value) => {
    jsxAdaptiveSheets = value;
  }), bindRuntimeValue(runtime2, "sheetFrameContext", () => sheetFrameContext, (value) => {
    sheetFrameContext = value;
  }), bindRuntimeValue(runtime2, "getStackedSheetCanGrow", () => getStackedSheetCanGrow, (value) => {
    getStackedSheetCanGrow = value;
  }), bindRuntimeValue(runtime2, "sheetParentContext", () => sheetParentContext, (value) => {
    sheetParentContext = value;
  }), bindRuntimeValue(runtime2, "sheetStateContext", () => sheetStateContext, (value) => {
    sheetStateContext = value;
  }), bindRuntimeValue(runtime2, "inertElementProps", () => inertElementProps, (value) => {
    inertElementProps = value;
  }), bindRuntimeValue(runtime2, "SHEET_IMPLEMENTATION_WAIT_MS", () => SHEET_IMPLEMENTATION_WAIT_MS, (value) => {
    SHEET_IMPLEMENTATION_WAIT_MS = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationUnavailable", () => sheetImplementationUnavailable, (value) => {
    sheetImplementationUnavailable = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationWaiters", () => sheetImplementationWaiters, (value) => {
    sheetImplementationWaiters = value;
  }), bindRuntimeValue(runtime2, "ambientCloseReasons", () => ambientCloseReasons, (value) => {
    ambientCloseReasons = value;
  }), bindRuntimeValue(runtime2, "SHEET_UNCOVER_CLOSE_GRACE_MS", () => SHEET_UNCOVER_CLOSE_GRACE_MS, (value) => {
    SHEET_UNCOVER_CLOSE_GRACE_MS = value;
  }), bindRuntimeValue(runtime2, "LIVE_REGION_SELECTOR", () => LIVE_REGION_SELECTOR, (value) => {
    LIVE_REGION_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "defaultSheetState", () => defaultSheetState, (value) => {
    defaultSheetState = value;
  }), bindRuntimeValue(runtime2, "emptySheetRef", () => emptySheetRef, (value) => {
    emptySheetRef = value;
  }), bindRuntimeValue(runtime2, "defaultSheetHost", () => defaultSheetHost, (value) => {
    defaultSheetHost = value;
  }), bindRuntimeValue(runtime2, "concealedSheetHost", () => concealedSheetHost, (value) => {
    concealedSheetHost = value;
  }), bindRuntimeValue(runtime2, "sheetCoverContext", () => sheetCoverContext, (value) => {
    sheetCoverContext = value;
  }), bindRuntimeValue(runtime2, "initializeAdaptiveSheets", () => initializeAdaptiveSheets, (value) => {
    initializeAdaptiveSheets = value;
  }), bindRuntimeValue(runtime2, "isReducedMotion", () => isReducedMotion), bindRuntimeValue(runtime2, "reactReducedMotion", () => reactReducedMotion, (value) => {
    reactReducedMotion = value;
  }), bindRuntimeValue(runtime2, "REDUCED_MOTION_QUERY", () => REDUCED_MOTION_QUERY, (value) => {
    REDUCED_MOTION_QUERY = value;
  }), bindRuntimeValue(runtime2, "REDUCED_MOTION_ATTRIBUTE", () => REDUCED_MOTION_ATTRIBUTE, (value) => {
    REDUCED_MOTION_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "initializeReducedMotion", () => initializeReducedMotion, (value) => {
    initializeReducedMotion = value;
  }), bindRuntimeValue(runtime2, "SHEET_DURATION_CLASS", () => SHEET_DURATION_CLASS, (value) => {
    SHEET_DURATION_CLASS = value;
  }), bindRuntimeValue(runtime2, "sheetTransitionClasses", () => sheetTransitionClasses, (value) => {
    sheetTransitionClasses = value;
  }), bindRuntimeValue(runtime2, "sheetRadiusClasses", () => sheetRadiusClasses, (value) => {
    sheetRadiusClasses = value;
  }), bindRuntimeValue(runtime2, "sheetPopupClasses", () => sheetPopupClasses, (value) => {
    sheetPopupClasses = value;
  }), bindRuntimeValue(runtime2, "SHEET_DISMISS_TRANSLATE_CSS", () => SHEET_DISMISS_TRANSLATE_CSS, (value) => {
    SHEET_DISMISS_TRANSLATE_CSS = value;
  }), bindRuntimeValue(runtime2, "sheetDrillBodyClasses", () => sheetDrillBodyClasses, (value) => {
    sheetDrillBodyClasses = value;
  }), bindRuntimeValue(runtime2, "sheetBackdropClasses", () => sheetBackdropClasses, (value) => {
    sheetBackdropClasses = value;
  }), bindRuntimeValue(runtime2, "transparentSheetBackdropClasses", () => transparentSheetBackdropClasses, (value) => {
    transparentSheetBackdropClasses = value;
  }), bindRuntimeValue(runtime2, "sheetOverflowBackgroundClasses", () => sheetOverflowBackgroundClasses, (value) => {
    sheetOverflowBackgroundClasses = value;
  }), bindRuntimeValue(runtime2, "sheetClipClasses", () => sheetClipClasses, (value) => {
    sheetClipClasses = value;
  }), bindRuntimeValue(runtime2, "sheetSeparatorClasses", () => sheetSeparatorClasses, (value) => {
    sheetSeparatorClasses = value;
  }), bindRuntimeValue(runtime2, "initializeSheetClassNames", () => initializeSheetClassNames, (value) => {
    initializeSheetClassNames = value;
  }), bindRuntimeValue(runtime2, "resetSheetDragStyle", () => resetSheetDragStyle), bindRuntimeValue(runtime2, "useSheetDrag", () => useSheetDrag), bindRuntimeValue(runtime2, "reactSheetDrag", () => reactSheetDrag, (value) => {
    reactSheetDrag = value;
  }), bindRuntimeValue(runtime2, "initializeSheetDrag", () => initializeSheetDrag, (value) => {
    initializeSheetDrag = value;
  }), bindRuntimeValue(runtime2, "THEME_TOKEN_SCHEMA_DESCRIPTION", () => THEME_TOKEN_SCHEMA_DESCRIPTION, (value) => {
    THEME_TOKEN_SCHEMA_DESCRIPTION = value;
  }), bindRuntimeValue(runtime2, "typographyScaleNames", () => typographyScaleNames, (value) => {
    typographyScaleNames = value;
  }), bindRuntimeValue(runtime2, "typographyWeightNames", () => typographyWeightNames, (value) => {
    typographyWeightNames = value;
  }), bindRuntimeValue(runtime2, "weightRoleMarkers", () => weightRoleMarkers, (value) => {
    weightRoleMarkers = value;
  }), bindRuntimeValue(runtime2, "themeTokenKeys", () => themeTokenKeys, (value) => {
    themeTokenKeys = value;
  }), bindRuntimeValue(runtime2, "themeTokenManifest", () => themeTokenManifest, (value) => {
    themeTokenManifest = value;
  }), bindRuntimeValue(runtime2, "initializeThemeTokenManifest", () => initializeThemeTokenManifest, (value) => {
    initializeThemeTokenManifest = value;
  }), () => {
    initializeAccentColors = (0, runtime2.initializeOnce)(() => {
      accentColorNames = [
        "red",
        "orange",
        "yellow",
        "green",
        "aqua",
        "blue",
        "violet",
        "magenta"
      ];
    }), MOBILE_COARSE_POINTER_QUERY = "(pointer: coarse) and (max-width: 639.98px)", subscribeNoop = () => () => {
    }, getFalseSnapshot = () => !1, COARSE_POINTER_QUERY_rG = "(pointer: coarse)", initializeMediaQueryStores = (0, runtime2.initializeOnce)(() => {
      reactMediaQuery = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), mediaQueryStores = /* @__PURE__ */ new WeakMap();
    }), initializeCoarsePointerStores = (0, runtime2.initializeOnce)(() => {
      initializeMediaQueryStores(), coarsePointerStores = /* @__PURE__ */ new WeakMap();
    }), initializeErrorReporting = () => {
    }, initializeSafeObservers = (0, runtime2.initializeOnce)(() => {
      initializeErrorReporting();
    }), isSupportedFont = (input) => Object.hasOwn(supportedFonts, input), readDocumentFont = () => {
      if (typeof document > "u")
        return;
      let attribute = document.documentElement.getAttribute("data-font");
      if (attribute !== null && isSupportedFont(attribute))
        return attribute;
    }, subscribeFontNoop = () => () => {
    }, getUndefinedFontSnapshot = () => {
    }, initializeDocumentFont = (0, runtime2.initializeOnce)(() => {
      initializeSafeObservers(), reactDocumentFont = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), supportedFonts = {
        anthropic: !0,
        system: !0
      };
    }), initializeFeatureFlags = (0, runtime2.initializeOnce)(() => {
      reactFeatureFlags = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), featureFlagContext = reactFeatureFlags.createContext(void 0);
    }), initializeInputDismissalTracking = (0, runtime2.initializeOnce)(() => {
      inputDismissalStates = /* @__PURE__ */ new WeakMap(), dismissalKeys = /* @__PURE__ */ new Set(["Escape", "Enter", " "]);
    }), initializeTransitionRunner = () => {
    }, initializeIsomorphicLayoutEffect = (0, runtime2.initializeOnce)(() => {
      reactIsomorphicLayoutEffect = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), useIsomorphicLayoutEffect = typeof window < "u" ? reactIsomorphicLayoutEffect.useLayoutEffect : reactIsomorphicLayoutEffect.useEffect;
    }), initializeResizeObserverAccess = () => {
    }, initializeAndroidCloseWatcher = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCdsRoot)(), reactAndroidCloseWatcher = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), initializeSheetDragSettings = (0, runtime2.initializeOnce)(() => {
      sheetDragSettings = {
        detentThreshold: 40,
        dismissFraction: 0.25,
        flingVelocity: 0.8,
        rubberBand: 0.55,
        overshootRoom: 0.5
      };
    }), SAFE_AREA_TOP_CSS = "env(safe-area-inset-top, 0px)", MAX_SHEET_HEIGHT_FRACTION = 0.9, SHEET_DENSITY = "comfortable", MIN_SHEET_HEIGHT_FRACTION = 0.5, initializeSheetStyles = (0, runtime2.initializeOnce)(() => {
      initializeSheetDragSettings(), VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS = `(100dvh - ${SAFE_AREA_TOP_CSS})`, baseSheetPositionerStyle = {
        position: "fixed",
        top: "自动",
        right: 0,
        bottom: 0,
        left: 0,
        width: "自动",
        minWidth: 0,
        maxWidth: "none",
        transform: "none",
        scrollMarginTop: SAFE_AREA_TOP_CSS
      }, sheetPositioningOverrides = {
        disableAnchorTracking: !0,
        collisionAvoidance: {
          side: "none",
          align: "none"
        }
      }, MAX_SHEET_HEIGHT_CSS = `calc(${VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS} * ${MAX_SHEET_HEIGHT_FRACTION})`, MAX_SHEET_OVERSHOOT_HEIGHT_CSS = `calc(${VIEWPORT_HEIGHT_EXCLUDING_SAFE_AREA_CSS} * ${MAX_SHEET_HEIGHT_FRACTION + 0.09999999999999998 * sheetDragSettings.overshootRoom})`, MIN_SHEET_HEIGHT_CSS = `${MIN_SHEET_HEIGHT_FRACTION * 100}dvh`;
    }), initializeElementAccess = () => {
    }, initializeEventCallbacks = (0, runtime2.initializeOnce)(() => {
      reactEventCallbacks = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), EDITABLE_ELEMENT_SELECTOR = 'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]', KEYBOARD_MINIMUM_HEIGHT = 120, VIEWPORT_SCALE_TOLERANCE = 0.01, initializeVisualKeyboard = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCdsRoot)(), initializeElementAccess(), initializeEventCallbacks(), reactVisualKeyboard = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), SHEET_DRILLED_ATTRIBUTE = "data-cds-sheet-drilled", SHEET_COVERED_ATTRIBUTE = "data-cds-sheet-covered", SHEET_PEELING_ATTRIBUTE = "data-cds-sheet-peeling", SHEET_TREE_CLOSING_ATTRIBUTE = "data-cds-sheet-tree-closing", SHEET_SCROLL_ATTRIBUTE = "data-cds-sheet-scroll", SHEET_PRESSED_ATTRIBUTE = "data-cds-sheet-pressed", SHEET_CONTROL_HELD_ATTRIBUTE = "data-cds-sheet-control-held", OVERLAY_CLOSE_FALLBACK_MS = 1e3, initializePresentationMode = (0, runtime2.initializeOnce)(() => {
      initializeMediaQueryStores(), initializeIsomorphicLayoutEffect(), (0, runtime2.initializeCdsRoot)(), initializeVisualKeyboard(), reactPresentationMode = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), presentationModeContext = reactPresentationMode.createContext("auto");
    }), initializeInertProps = (0, runtime2.initializeOnce)(() => {
      reactInertProps = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactMajorVersion = Number.parseInt(reactInertProps.version, 10), supportsBooleanInert = !Number.isFinite(reactMajorVersion) || reactMajorVersion === 0 || reactMajorVersion >= 19;
    }), initializeOverlayActions = (0, runtime2.initializeOnce)(() => {
      reactOverlayActions = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), getStackedSheetCanGrow = (input) => input.at(-1)?.grows ?? !0, SHEET_IMPLEMENTATION_WAIT_MS = 600, sheetImplementationUnavailable = !1, SHEET_UNCOVER_CLOSE_GRACE_MS = 120, LIVE_REGION_SELECTOR = '[data-cds="Toast"], [aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]', emptySheetRef = () => {
    }, initializeAdaptiveSheets = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSheetImplementation)(), initializeIsomorphicLayoutEffect(), (0, runtime2.initializeCdsRoot)(), initializeAndroidCloseWatcher(), initializeEventCallbacks(), initializeInertProps(), initializeOverlayActions(), initializeVisualKeyboard(), initializeSheetStyles(), initializePresentationMode(), reactAdaptiveSheets = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxAdaptiveSheets = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), sheetFrameContext = reactAdaptiveSheets.createContext(null), sheetParentContext = reactAdaptiveSheets.createContext(null), sheetStateContext = reactAdaptiveSheets.createContext({
        sheet: !1,
        pending: !1,
        covered: !1,
        inert: !1,
        depth: 0
      }), inertElementProps = getInertProps(!0), sheetImplementationWaiters = /* @__PURE__ */ new Set(), ambientCloseReasons = /* @__PURE__ */ new Set([
        "outside-press",
        "focus-out",
        "escape-key"
      ]), defaultSheetState = {
        sheet: !1,
        pending: !1,
        covered: !1,
        inert: !1,
        depth: 0
      }, defaultSheetHost = {
        sheet: !1,
        concealed: !1,
        chrome: null,
        ref: emptySheetRef,
        style: void 0,
        positionerStyle: void 0,
        attrs: {},
        frame: null,
        state: defaultSheetState,
        stack: null
      }, concealedSheetHost = {
        ...defaultSheetHost,
        concealed: !0
      }, sheetCoverContext = reactAdaptiveSheets.createContext(null);
    }), REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)", REDUCED_MOTION_ATTRIBUTE = "data-reduce-motion", initializeReducedMotion = (0, runtime2.initializeOnce)(() => {
      reactReducedMotion = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), SHEET_DURATION_CLASS = "duration-sheet", sheetRadiusClasses = "rounded-t-card rounded-b-none", SHEET_DISMISS_TRANSLATE_CSS = "calc(100% + 1.5rem)", transparentSheetBackdropClasses = "draggable-none fixed inset-0 bg-transparent", sheetOverflowBackgroundClasses = "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[100dvh] after:bg-surface-3", sheetClipClasses = "[clip-path:inset(0_0_-200vh_0)]", sheetSeparatorClasses = "[&_[role=separator]]:-mx-1 [&_[role=separator]]:mt-0", initializeSheetClassNames = (0, runtime2.initializeOnce)(() => {
      sheetTransitionClasses = `${SHEET_DURATION_CLASS} ease-out motion-reduce:transition-none`, sheetPopupClasses = `group/sheet relative w-full min-w-0 max-w-none overflow-hidden ${sheetRadiusClasses} pb-[max(env(safe-area-inset-bottom),0.5rem)] transition-[translate,height,scale] ${sheetTransitionClasses} [&_[data-cds-sheet-scroll]]:overscroll-contain [&[data-cds-sheet-pressed]_[data-cds-sheet-scroll]]:[scroll-padding-block:0px]`, sheetDrillBodyClasses = `flex min-h-0 flex-1 flex-col transition-[translate] ${sheetTransitionClasses} group-data-[cds-sheet-drilled]/sheet:-translate-x-full rtl:group-data-[cds-sheet-drilled]/sheet:translate-x-full`, sheetBackdropClasses = `draggable-none fixed inset-0 bg-backdrop transition-opacity ${sheetTransitionClasses} data-[starting-style]:opacity-0 data-[ending-style]:opacity-0`;
    }), initializeSheetDrag = (0, runtime2.initializeOnce)(() => {
      initializeIsomorphicLayoutEffect(), initializeReducedMotion(), initializeSheetDragSettings(), initializeSheetStyles(), initializeAdaptiveSheets(), initializeSheetClassNames(), reactSheetDrag = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), THEME_TOKEN_SCHEMA_DESCRIPTION = "GENERATED by `bun run gen:tokens` from tokens/theme.ts (key names of theme-extend.json sections, for src/utils/cn.ts)", initializeThemeTokenManifest = (0, runtime2.initializeOnce)(() => {
      typographyScaleNames = [
        "caption",
        "footnote",
        "code",
        "body",
        "prose",
        "heading",
        "title"
      ], typographyWeightNames = ["regular", "medium", "semibold", "bold"], weightRoleMarkers = ["control", "header", "badge"], themeTokenKeys = {
        borderRadius: ["composer", "card", "chip"],
        boxShadow: [
          "sm",
          "md",
          "lg",
          "popover",
          "drop-ring",
          "drop-ring-danger",
          "drop-glow",
          "drop-glow-danger",
          "focus",
          "focus-danger",
          "field",
          "field-pressed",
          "field-drop",
          "field-ring",
          "field-hover",
          "field-invalid",
          "panel",
          "panel-sm",
          "panel-md",
          "panel-lg",
          "card-ring",
          "composer",
          "composer-hover",
          "composer-focus",
          "ring-accent",
          "ring-pro",
          "ring-warning",
          "ring-danger",
          "ring-success"
        ],
        cursor: ["interactive"],
        fontFamily: ["mono", "mono-ui", "sans", "sans-display", "voice"],
        fontWeight: ["medium", "semibold", "bold", "normal"],
        gap: ["xs", "sm", "md", "lg", "xl"],
        height: ["control", "control-nested", "icon"],
        margin: [
          "pad-xs",
          "pad-sm",
          "pad-md",
          "pad-lg",
          "pad-xl",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        minHeight: ["control"],
        opacity: ["disabled", "icon-secondary"],
        padding: ["xs", "sm", "md", "lg", "xl"],
        size: ["control", "control-nested", "icon"],
        transitionDuration: ["fast", "snap", "base", "sheet", "slow"],
        transitionTimingFunction: ["out", "snap", "overshoot"],
        width: ["control", "control-nested", "icon"],
        zIndex: ["modal", "coachmark", "popover", "tooltip", "toast"]
      }, themeTokenManifest = {
        $schema: THEME_TOKEN_SCHEMA_DESCRIPTION,
        TYPE_SCALE: typographyScaleNames,
        TYPE_WEIGHT_NAMES: typographyWeightNames,
        WEIGHT_ROLE_MARKERS: weightRoleMarkers,
        themeKeys: themeTokenKeys
      };
    });
  };
}
export {
  installUiFoundation
};
