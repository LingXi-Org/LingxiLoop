// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiOverlays(runtime2) {
  var overlayOwnerResolvers, MAX_OVERLAY_OWNER_DEPTH, initializeOverlayOwners, reactOverlayOwners, sheetTreeDialogs, OPEN_OVERLAY_FOCUS_SELECTOR, HIDDEN_SUBTREE_SELECTOR, overlayFocusHandoffs, overlayDialogReturns, FOCUS_STEAL_ALLOWED_SELECTOR, preventFocusStealDefault, initializeFocusStealGuard, reactOverlayFocus, initializeOverlayFocus, OVERLAY_ATTRIBUTE, OPEN_OVERLAY_SELECTOR_VQ5, initializeOverlaySelector, reactOverlayStack, overlayStackContext, DOCUMENT_NODE_TYPE, initializeOverlayStack, reactMenuOverlayRegistration, menuOverlayAttributes, initializeMenuOverlayRegistration, reactContextMenuPopup, jsxContextMenuPopup, contextMenuPopupClasses, ContextMenuPopupFrame, initializeContextMenuPopup, reactClickToFocus, INTERACTIVE_CLICK_TARGET_SELECTOR, initializeClickToFocus, FORM_POINTER_FOCUS_SELECTOR, SELECT_ELEMENT_SELECTOR, DRAGGABLE_ELEMENT_SELECTOR, initializePopupPointerFocus, reactPassiveOpen, jsxPassiveOpen, reactDomPassiveOpen, PASSIVE_HOVER_OPEN_REASON, PASSIVE_FOCUS_OUT_REASON, passiveOpenStateContext, passiveFocusDeclinedContext, passiveDeclinedFocusProps, passiveDefaultFocusProps, passiveOpenEngagementKeys, passiveOpenModifierKeys, subscribePassiveOpenNoop, getPassiveOffSnapshot, unchangedPopupProps, initializePassiveOpen, menuItemVariants, menuItemDescriptionPaddingClass, initializeMenuItemVariants, reactMenuOpener, menuOpenerRefContext, MenuOpenerProvider, initializeMenuOpener, reactMenuPopupElement, jsxMenuPopupElement, MenuPopupElement, initializeMenuPopupElement, reactStablePopupPlacement, heldPositionerClasses, heldPopupClasses, POPUP_PLACEMENT_SETTLE_FRAMES, initializeStablePopupPlacement, COARSE_OR_HOVERLESS_QUERY, MOBILE_WIDTH_QUERY, TOUCH_DEVICE_QUERY, ELECTRON_USER_AGENT_TOKEN, initializeModalReleasePlatform, reactModalPortalInert, inertExcludedTags, MODAL_INERT_LIVE_REGION_SELECTOR, modalInertRefCounts, initializeModalPortalInert, reactMenuSheetPopup, jsxMenuSheetPopup, coveredMenuSheetOwners, MenuSheetPopup, initializeMenuSheetPopup, jsxPopoverSheetBody, initializePopoverSheetBody, jsxContextMenuSheetBackdrop, initializeContextMenuSheetBackdrop, mobileSheetExports, initializeMobileSheetExports, reactSheetImplementation, loadedSheetImplementation, sheetImplementationFailed, sheetImplementationRequests, sheetImplementationGeneration, sheetImplementationPromise, sheetImplementationSubscribers, getSheetImplementationSnapshot, getSheetImplementationLoadedSnapshot, getSheetImplementationFailedSnapshot, getNullSheetImplementationSnapshot, getFalseSheetImplementationSnapshot, initializeSheetImplementation, reactPreloadSheets, initializePreloadSheets, desktopPlatformUserAgentPattern, initializeCdsPlatform, MAX_LINK_DEBUG_WARNINGS, MAX_LINK_DEBUG_LENGTH, reportedLinkWarnings, linkWarningLimitReached, initializeLinkWarnings, linkWhitespacePattern, initializeHrefWhitespace, existingBrowsingContextNames, unsafeLinkRelTokenPattern, initializeLinkTargets, reactCdsLink, cdsRouterContext, forbiddenHrefControlCharacterPattern, leadingHrefWhitespacePattern, networkPathHrefPattern, rootRelativeHrefPattern, unrootedHrefPattern, relativePathDotSegmentPattern, dotSegmentPattern, encodedOrBackslashPathPattern, allowedHrefSchemePattern, androidIntentHrefPattern, editorHrefSchemePattern, allowedEditorHrefPattern, allowedIntentPropertyNames, absoluteHrefPattern, trustedFirstPartyDomains, trustedAndroidIntentPackages, HTTPS_RELATIVE_HREF_BASE, HTTP_RELATIVE_HREF_BASE, linkEventPropNames, linkPrefetchEventKinds, linkPrefetchEventNames, initializeCdsLink, reactCdsRoot, jsxCdsRoot, subscribePlatformNoop, getWebPlatformSnapshot, getCoarsePointerServerSnapshot, subscribeRootCoarsePointer, hasMigratedHtmlFontSizing, densitySizeIndices, controlSizeOffsets, densityContext, portalDensityContext, colorModeStoreContext, defaultColorModeStore, DARK_COLOR_SCHEME_QUERY, normalizeColorMode, platformContext, fontContext, monospaceFontContext, pageBackgroundContext, naturalImageTilesContext, shrinkWrapMemoryContext, cdsLayoutDebugProbe, densityOverrideContext, surfaceBackgroundContext, localeContext, rootElementContext, rootPortalContainerContext, isPortalRootContext, opaqueTintOverrides, surfaceTokenNames, initializeCdsRoot;
  function useCaptureOverlayOpener(open4, openerRef, rootRef, onCaptured, ownerChainRef) {
    let rootElement = useRootElement(), capturedRef = reactOverlayFocus.useRef(!1);
    reactOverlayFocus.useInsertionEffect(() => {
      if (!open4) {
        capturedRef.current = !1;
        return;
      }
      if (capturedRef.current)
        return;
      capturedRef.current = !0, openerRef.current = null, rootRef.current = rootElement ?? null;
      let value = rootElement?.ownerDocument ?? document, activeElement2 = value.activeElement, value2 = activeElement2 && activeElement2 !== value.body ? activeElement2 : null;
      openerRef.current = value2, ownerChainRef && (ownerChainRef.current = (0, runtime2.getOverlayOwnerChain)(value2)), onCaptured?.();
    }, [open4, rootElement, openerRef, rootRef, onCaptured, ownerChainRef]);
  }
  function useOverlayFocusReturn(options) {
    let skipRestoreOnOutsideFocus = options?.skipRestoreOnOutsideFocus ?? !1, registerOpenerReturn = options?.registerOpenerReturn ?? !0, triggerRef = options?.triggerRef, openerRef = reactOverlayFocus.useRef(null), popupRef = reactOverlayFocus.useRef(null), rootRef = reactOverlayFocus.useRef(null);
    useCaptureOverlayOpener(options?.open ?? !0, openerRef, rootRef);
    let shouldRegisterRef = reactOverlayFocus.useRef(registerOpenerReturn);
    reactOverlayFocus.useLayoutEffect(() => {
      shouldRegisterRef.current = registerOpenerReturn;
    }, [registerOpenerReturn]), reactOverlayFocus.useLayoutEffect(() => {
      popupRef.current && (0, runtime2.registerOverlayOwner)(popupRef.current, () => shouldRegisterRef.current ? resolveConnectedRefElement(triggerRef) ?? openerRef.current : null);
    }, [triggerRef]);
    let finalFocus = reactOverlayFocus.useCallback(() => {
      if (skipRestoreOnOutsideFocus) {
        let current = popupRef.current, value = rootRef.current?.ownerDocument ?? document, activeElement2 = value.activeElement;
        if (activeElement2 && activeElement2 !== value.body && !current?.contains(activeElement2))
          return !1;
      }
      return resolveConnectedRefElement(triggerRef) !== null ? null : resolveFinalFocusTarget(openerRef.current, popupRef.current);
    }, [skipRestoreOnOutsideFocus, triggerRef]);
    return reactOverlayFocus.useMemo(() => ({
      finalFocus,
      popupRef
    }), [finalFocus]);
  }
  function resolveConnectedRefElement(input) {
    let value = input?.current ?? null;
    return value?.isConnected ? value : null;
  }
  function useOverlayFinalFocus(open4, takeFocus = !0, fallbackTriggerRef) {
    let rootElement = useRootElement(), fallbackOpenerRef = reactOverlayFocus.useRef(null), needsFocusCheckRef = reactOverlayFocus.useRef(!1), onCaptured = reactOverlayFocus.useCallback(() => {
      fallbackOpenerRef.current = null, needsFocusCheckRef.current = !0;
    }, []), openerRef = reactOverlayFocus.useRef(null), ownerChainRef = reactOverlayFocus.useRef({
      targets: [],
      dialog: null
    }), popupRef = reactOverlayFocus.useRef(null), rootRef = reactOverlayFocus.useRef(null);
    useCaptureOverlayOpener(open4, openerRef, rootRef, onCaptured, ownerChainRef), reactOverlayFocus.useLayoutEffect(() => {
      if (!needsFocusCheckRef.current || (needsFocusCheckRef.current = !1, !takeFocus && !fallbackTriggerRef))
        return;
      let value = rootElement?.ownerDocument ?? document;
      if (!openerRef.current) {
        let value4 = fallbackTriggerRef?.current ?? null;
        fallbackOpenerRef.current = value4 !== null && value4.isConnected && !popupRef.current?.contains(value4) ? value4 : null;
      }
      if (!takeFocus)
        return;
      let value2 = (0, runtime2.asElement)(value.activeElement), value3 = value2 && value2 !== value.body ? value2 : null;
      !value3 || popupRef.current?.contains(value3) || (0, runtime2.blurWithSafeRelatedTarget)(value3);
    }, [open4, takeFocus, fallbackTriggerRef, rootElement]);
    let skipRestoreOnOutsideFocus = !takeFocus, unmountedRef = reactOverlayFocus.useRef(!1);
    reactOverlayFocus.useLayoutEffect(() => (unmountedRef.current = !1, () => {
      unmountedRef.current = !0;
    }), []);
    let resolveOwnerDialog = reactOverlayFocus.useCallback(() => {
      let popup = popupRef.current;
      if (!unmountedRef.current && popup?.isConnected && popup.hasAttribute("data-open"))
        return null;
      let dialog = [
        ownerChainRef.current.dialog,
        popup && overlayFocusHandoffs.get(popup),
        popup && overlayDialogReturns.get(popup)
      ].find((candidate) => !!candidate && candidate !== popup && (0, runtime2.isSheetTreeDialog)(candidate) && candidate.isConnected && candidate.hasAttribute("data-open"));
      return (0, runtime2.asElement)(dialog);
    }, []), resolveReturnTarget = reactOverlayFocus.useCallback(() => {
      let opener = openerRef.current, target = opener ? opener.isConnected ? opener : ownerChainRef.current.targets.find((candidate) => candidate.isConnected) : fallbackOpenerRef.current?.isConnected ? fallbackOpenerRef.current : null, popup = popupRef.current;
      return (0, runtime2.asElement)(target) ?? (popup && overlayFocusHandoffs.get(popup)) ?? resolveOwnerDialog();
    }, [resolveOwnerDialog]), resolveHandoffTarget = reactOverlayFocus.useCallback(() => {
      let popup = popupRef.current, handoff = popup ? overlayFocusHandoffs.get(popup) : void 0;
      if (!handoff?.isConnected || (0, runtime2.isSheetTreeDialog)(handoff))
        return null;
      let doc = rootRef.current?.ownerDocument ?? document, activeElement2 = doc.activeElement;
      return !activeElement2 || activeElement2 === doc.body || popup?.contains(activeElement2) ? handoff : null;
    }, []), restoreFocusTarget = reactOverlayFocus.useCallback(() => {
      if (skipRestoreOnOutsideFocus) {
        let current = popupRef.current, value = rootRef.current?.ownerDocument ?? document, activeElement2 = value.activeElement;
        if (activeElement2 && activeElement2 !== value.body && !current?.contains(activeElement2))
          return !1;
      }
      if (openerRef.current) {
        if (!openerRef.current.isConnected) {
          let value = ownerChainRef.current.targets.find((input) => input.isConnected);
          if (value)
            return resolveFinalFocusTarget(value, popupRef.current);
          let handoff2 = resolveHandoffTarget();
          if (handoff2)
            return resolveFinalFocusTarget(handoff2, popupRef.current);
        }
        return resolveFinalFocusTarget(openerRef.current, popupRef.current);
      }
      if (fallbackOpenerRef.current) {
        let current = popupRef.current, activeElement2 = (rootRef.current?.ownerDocument ?? document).activeElement;
        return activeElement2 && isTextEntryTarget(activeElement2) && !current?.contains(activeElement2) || !fallbackOpenerRef.current.isConnected ? !1 : null;
      }
      let handoff = resolveHandoffTarget();
      return handoff ? resolveFinalFocusTarget(handoff, popupRef.current) : !1;
    }, [skipRestoreOnOutsideFocus, resolveHandoffTarget]), scheduleDialogFocus = reactOverlayFocus.useCallback((doc) => {
      let dialog = resolveOwnerDialog(), popup = popupRef.current;
      dialog !== null && (doc.defaultView ?? window).setTimeout(() => {
        let activeElement2 = doc.activeElement, focusLost = !activeElement2 || activeElement2 === doc.body || popup?.contains(activeElement2) && !popup.hasAttribute("data-open");
        if (!dialog.isConnected || !dialog.hasAttribute("data-open"))
          return;
        let nextOverlay = findNextOpenOverlay(doc, dialog);
        nextOverlay !== null ? overlayDialogReturns.has(nextOverlay) || overlayDialogReturns.set(nextOverlay, dialog) : focusLost && dialog.focus({
          preventScroll: !0
        });
      }, 0);
    }, [resolveOwnerDialog]), finalFocus = reactOverlayFocus.useCallback((closeType) => {
      let doc = rootRef.current?.ownerDocument ?? document, focusedOverlay = skipRestoreOnOutsideFocus ? null : findFocusedOpenOverlay(doc, popupRef.current);
      if (scheduleDialogFocus(doc), focusedOverlay === null)
        return restoreFocusTarget();
      let returnTarget = resolveReturnTarget();
      return returnTarget && !focusedOverlay.contains(returnTarget) && overlayFocusHandoffs.set(focusedOverlay, returnTarget), queueMicrotask(() => {
        if (!focusedOverlay.isConnected && doc.activeElement === doc.body) {
          let target = restoreFocusTarget() || fallbackOpenerRef.current;
          (0, runtime2.asElement)(target)?.focus({
            preventScroll: !0,
            ...closeType === "keyboard" && {
              focusVisible: !0
            }
          });
        }
      }), !1;
    }, [
      restoreFocusTarget,
      skipRestoreOnOutsideFocus,
      resolveReturnTarget,
      scheduleDialogFocus
    ]);
    return reactOverlayFocus.useMemo(() => ({
      finalFocus,
      popupRef
    }), [finalFocus, popupRef]);
  }
  function resolveFinalFocusTarget(opener, popup) {
    if (!opener?.isConnected)
      return !1;
    let activeElement2 = opener.ownerDocument.activeElement;
    if (activeElement2 && isTextEntryTarget(activeElement2) && !popup?.contains(activeElement2) || activeElement2 && findOpenSheetTreeDialogAncestor(activeElement2)?.contains(opener) === !1)
      return !1;
    let focusTarget = opener;
    return focusTarget.tabIndex < 0 ? (focusTarget.focus({
      preventScroll: !0
    }), !1) : focusTarget;
  }
  function findOpenSheetTreeDialogAncestor(element) {
    for (let value = element; value !== null; value = value.parentElement)
      if ((0, runtime2.isSheetTreeDialog)(value) && value.hasAttribute("data-open"))
        return value;
    return null;
  }
  function findFocusedOpenOverlay(doc, popup) {
    let activeElement2 = doc.activeElement;
    if (!activeElement2 || activeElement2 === doc.body || popup?.contains(activeElement2))
      return null;
    let overlay = activeElement2.closest(`[${OVERLAY_ATTRIBUTE}]`);
    return overlay?.matches(OPEN_OVERLAY_FOCUS_SELECTOR) ? overlay : null;
  }
  function findNextOpenOverlay(doc, overlay) {
    for (let value of doc.querySelectorAll(OPEN_OVERLAY_FOCUS_SELECTOR))
      if (value !== overlay && !value.closest(HIDDEN_SUBTREE_SELECTOR) && overlay.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING)
        return value;
    return null;
  }
  function isCdsLayoutDebugEnabled() {
    try {
      return cdsLayoutDebugProbe?.() ?? !1;
    } catch {
      return !1;
    }
  }
  function isTextEntryTarget(input) {
    return input.matches(runtime2.TEXT_ENTRY_SELECTOR);
  }
  function preventFocusStealing(handler) {
    return handler === void 0 ? preventFocusStealDefault : (event) => {
      handler(event), event.baseUIHandlerPrevented !== !0 && preventFocusStealDefault(event);
    };
  }
  function createOverlayStack() {
    let overlays = [];
    return {
      register: (input) => (overlays.push(input), () => {
        let value = overlays.lastIndexOf(input);
        value !== -1 && overlays.splice(value, 1);
      }),
      topmostOpen: () => {
        for (let value = overlays.length - 1; value >= 0; value -= 1) {
          let value2 = overlays[value];
          if (value2?.isOpen())
            return value2;
        }
      }
    };
  }
  function useRegisterInnerOverlay(overlay) {
    let stack = reactOverlayStack.useContext(overlayStackContext), overlayRef = reactOverlayStack.useRef(overlay);
    reactOverlayStack.useEffect(() => {
      overlayRef.current = overlay;
    }, [overlay]), reactOverlayStack.useEffect(() => {
      if (stack !== null)
        return stack.register({
          isOpen: () => overlayRef.current.isOpen(),
          close: () => overlayRef.current.close()
        });
    }, [stack]);
  }
  function isDocumentCurrentTarget(input) {
    return input?.currentTarget?.nodeType === DOCUMENT_NODE_TYPE;
  }
  function interceptEscapeForInnerOverlay(stack, open4, details) {
    let closeDetails = details;
    if (open4 || closeDetails.reason !== "escape-key")
      return !1;
    let topmostOverlay = stack.topmostOpen();
    if (topmostOverlay === void 0)
      return !1;
    closeDetails.cancel?.();
    let event = closeDetails.event;
    return isDocumentCurrentTarget(event) ? (event?.currentTarget?.defaultView ?? globalThis).setTimeout(() => {
      topmostOverlay.isOpen() && topmostOverlay.close();
    }, 0) : (event?.preventDefault(), topmostOverlay.close()), !0;
  }
  function useMenuOverlayRegistration() {
    let ref = reactMenuOverlayRegistration.useRef(null), value = reactMenuOverlayRegistration.useContext(runtime2.menuRootIdentityContext);
    return useRegisterInnerOverlay({
      isOpen: () => value !== null && ref.current?.hasAttribute("data-open") === !0,
      close: () => value?.current?.close?.()
    }), {
      elementRef: ref,
      overlayAttrs: menuOverlayAttributes
    };
  }
  function calculateScrollbarThickness(offsetSize, clientSize, borderSize) {
    return offsetSize - clientSize - (borderSize || 0);
  }
  function isScrollbarPointerPosition(offsetX, offsetY2, targetElement) {
    let style = getComputedStyle(targetElement);
    if (style.display === "inline")
      return !1;
    let verticalScrollbarWidth = calculateScrollbarThickness(targetElement.offsetWidth, targetElement.clientWidth, parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)), horizontalScrollbarHeight = calculateScrollbarThickness(targetElement.offsetHeight, targetElement.clientHeight, parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)), overVerticalScrollbar = verticalScrollbarWidth >= 1 && (style.direction === "rtl" ? offsetX < verticalScrollbarWidth : offsetX >= targetElement.clientWidth), overHorizontalScrollbar = horizontalScrollbarHeight >= 1 && offsetY2 >= targetElement.clientHeight;
    return overVerticalScrollbar || overHorizontalScrollbar;
  }
  function useClickToFocus(focus, options = {}) {
    let { disabled: disabled2 = !1, readOnly = !1, shouldIgnoreTarget } = options, focusCallback = (0, runtime2.useOptionalEventCallback)(focus), ignoreTargetCallback = (0, runtime2.useOptionalEventCallback)(shouldIgnoreTarget);
    return {
      clickToFocusProps: {
        onMouseDown: reactClickToFocus.useCallback((event) => {
          if (event.button !== 0 || readOnly || disabled2)
            return;
          let { target: value, currentTarget: value2 } = event;
          if (!value2.contains(value))
            return;
          if (value !== value2) {
            if (ignoreTargetCallback?.(value))
              return;
            let ancestor = value.closest(INTERACTIVE_CLICK_TARGET_SELECTOR);
            if (ancestor && ancestor !== value2 && value2.contains(ancestor))
              return;
          }
          let { offsetX: nativeEvent, offsetY: nativeEvent2 } = event.nativeEvent;
          isScrollbarPointerPosition(nativeEvent, nativeEvent2, value) || (event.preventDefault(), focusCallback?.());
        }, [disabled2, readOnly, focusCallback, ignoreTargetCallback])
      }
    };
  }
  function shouldAllowPopupPointerFocus(event, { draggable = !1 } = {}) {
    let targetElement = (0, runtime2.asElement)(event.target);
    return targetElement === null ? !1 : (0, runtime2.isEditableElement)(targetElement) || targetElement.matches(FORM_POINTER_FOCUS_SELECTOR) || closestWithinElement(targetElement, SELECT_ELEMENT_SELECTOR, event.currentTarget) || draggable && closestWithinElement(targetElement, DRAGGABLE_ELEMENT_SELECTOR, event.currentTarget) || isScrollbarPointerPosition(event.nativeEvent.offsetX, event.nativeEvent.offsetY, targetElement);
  }
  function closestWithinElement(targetElement, selector, container) {
    let matchingAncestor = targetElement.closest(selector);
    return matchingAncestor !== null && container.contains(matchingAncestor);
  }
  function usePassiveOpenState(onOpenChange, open4, allowHover = !0) {
    let [state] = reactPassiveOpen.useState(createPassiveOpenState);
    return state.renderedWith(open4, onOpenChange, allowHover), state;
  }
  function createPassiveOpenState() {
    let value, flag = !0, text = "off", value2 = null, value3 = null, flag2 = !1, value4, value5, flag3 = !1, value6 = null, value7 = null, value8 = null, value9, flag4 = !1, flag5 = !1, values = /* @__PURE__ */ new Set(), callback = (input, options) => {
      input !== text && (text = input, options && values.forEach((input2) => {
        input2();
      }));
    }, callback2 = () => {
      flag3 = !1, value6 = null, value7 = null, value8 = null, flag2 = !1;
    };
    return {
      cell: {
        getLevel: () => text,
        subscribe(input) {
          return values.add(input), () => {
            values.delete(input);
          };
        },
        engage() {
          text === "declared" && (flag3 = !1), callback("off", !0);
        },
        registerPopup(element) {
          if (value2 = element, element !== null)
            flag2 && (flag2 = !1, value6 = getFocusedElement(element.ownerDocument));
          else if (!flag5 && (callback("off", !1), value3 !== null)) {
            let value10 = value3;
            value3 = null, restorePassiveOverlayFocus(value10.ownerDocument, null, value10, !1);
          }
        },
        declareFocusProps(input, options) {
          value4 = options;
          let value10 = input !== value5;
          if (value5 = input, !value10 || !flag5 || value2 !== null || value8 === null)
            return;
          let value11 = declinesInitialFocus(input, value8.type);
          if (value11 === (text === "declared"))
            return;
          let value12 = value11 ? "declared" : value8.byHover ? "hover" : "off";
          flag3 = value12 !== "off", callback(value12, !1);
        },
        getPopup: () => value2,
        getTrigger: () => value7,
        getOpen: () => value8
      },
      renderedWith(input, options, context) {
        value = options, flag = context, value9 !== !0 && input === !0 && !flag4 ? (flag5 = !0, value3 = null, value2 !== null ? value6 = getFocusedElement(value2.ownerDocument) : (value6 = null, flag2 = !0), value7 = null, value8 = {
          type: "",
          byHover: !1
        }, flag3 = declinesInitialFocus(value5, ""), callback(flag3 ? "declared" : "off", !1)) : value9 === !0 && input === !1 && (flag5 = !1, flag4 = !1, value3 = text === "declared" && flag3 ? resolvePassiveFinalFocus(value4, value6) : null, callback2(), text === "hover" && callback("off", !1)), value9 = input;
      },
      onOpenChange(input, options) {
        if (value?.(input, options), options.isCanceled === !0)
          return;
        flag2 = !1;
        let value10 = flag && options.reason === PASSIVE_HOVER_OPEN_REASON, value11 = options.trigger?.ownerDocument ?? value2?.ownerDocument ?? getDocumentIfAvailable();
        if (!input) {
          if (flag5 = !1, flag4 = !1, flag3 && value11 !== void 0) {
            let value15 = resolvePassiveFinalFocus(value4, options.reason === PASSIVE_FOCUS_OUT_REASON && value7 !== null ? value7 : value6);
            value15 !== null && restorePassiveOverlayFocus(value11, value2, value15, !value10);
          }
          callback2(), text === "hover" && callback("off", !0);
          return;
        }
        flag5 = !0, flag4 = !0, value3 = null;
        let value12 = value11 !== void 0 && elementIsWithin(value11.activeElement, value2), value13 = classifyOpenInputType(options.event), value14 = value12 ? "off" : declinesInitialFocus(value5, value13) ? "declared" : value10 ? "hover" : "off";
        value10 && value12 || (value6 = getFocusedElement(value11), value7 = (0, runtime2.asElement)(options.trigger ?? null), value8 = value12 ? null : {
          type: value13,
          byHover: value10
        }, flag3 = value14 !== "off"), callback(value14, !0);
      }
    };
  }
  function classifyOpenInputType(input) {
    if (input === void 0)
      return "";
    if ("key" in input)
      return "keyboard";
    let { type: value } = input;
    return value === "click" && input.detail === 0 ? "keyboard" : value === "click" || value === "contextmenu" || value.startsWith("mouse") || value.startsWith("pointer") || value.startsWith("touch") ? "mouse" : "";
  }
  function declinesInitialFocus(initialFocus, interactionType) {
    if (initialFocus === void 0 || initialFocus === !0)
      return !1;
    if (initialFocus === !1)
      return !0;
    let resolvedFocus = initialFocus(interactionType);
    return resolvedFocus === !1 || resolvedFocus === void 0;
  }
  function getDocumentIfAvailable() {
    if (!(typeof document > "u"))
      return document;
  }
  function resolvePassiveFinalFocus(finalFocus, fallbackElement) {
    return finalFocus === !1 ? null : finalFocus === void 0 || finalFocus === !0 || finalFocus === null || typeof finalFocus == "function" ? fallbackElement : finalFocus.current ?? fallbackElement;
  }
  function getFocusedElement(input) {
    let value = (0, runtime2.asElement)(input?.activeElement ?? null);
    return value === null || value === input?.body ? null : value;
  }
  function elementIsWithin(input, options) {
    return input !== null && options !== null && options.contains(input);
  }
  function restorePassiveOverlayFocus(documentObject, popup, opener, blurBeforeRestore) {
    queueMicrotask(() => {
      let activeElement2 = documentObject.activeElement, value = elementIsWithin(activeElement2, popup);
      if ((activeElement2 === null || activeElement2 === documentObject.body || value) && opener.isConnected && opener !== activeElement2) {
        let value2 = blurBeforeRestore && value ? (0, runtime2.asElement)(activeElement2) : null;
        value2 !== null && (0, runtime2.blurWithSafeRelatedTarget)(value2), opener.focus({
          preventScroll: !0
        });
      }
    });
  }
  function usePassiveOpenContext(input) {
    let value = reactPassiveOpen.useContext(passiveOpenStateContext);
    return input ? {
      cell: value,
      root: value
    } : {
      cell: value,
      root: null
    };
  }
  function useMenuPassiveFocusProps() {
    return reactPassiveOpen.useContext(passiveFocusDeclinedContext) ? passiveDeclinedFocusProps : passiveDefaultFocusProps;
  }
  function PassiveOpenGate({ cell, nested, children }) {
    let value = reactPassiveOpen.useSyncExternalStore(cell === null ? subscribePassiveOpenNoop : cell.subscribe, cell === null ? getPassiveOffSnapshot : cell.getLevel, getPassiveOffSnapshot), value2 = cell === null || nested && value === "hover" ? "off" : value;
    return jsxPassiveOpen.jsxs(passiveFocusDeclinedContext.Provider, {
      value: value2 === "declared",
      children: [
        value2 === "declared" && !nested && cell !== null ? jsxPassiveOpen.jsx(PassiveOpenKeyboardBridge, {
          cell
        }) : null,
        children(cell === null || value2 === "off" ? unchangedPopupProps : value2 === "hover" ? (input) => ({
          ...input,
          tabIndex: void 0,
          onFocus(input2) {
            input.onFocus?.(input2), cell.engage();
          }
        }) : (input) => ({
          ...input,
          tabIndex: void 0,
          finalFocus: !1,
          onMouseDown(event) {
            input.onMouseDown?.(event), shouldAllowPopupPointerFocus(event) || event.preventDefault();
          },
          onKeyDown(event) {
            input.onKeyDown?.(event), !event.nativeEvent.isComposing && passiveOpenEngagementKeys.has(event.key) && cell.engage();
          }
        }))
      ]
    });
  }
  function PassiveOpenKeyboardBridge({ cell }) {
    return reactPassiveOpen.useEffect(() => {
      let value = cell.getTrigger();
      if (value === null)
        return;
      let callback = (event) => {
        if (event.isComposing || event.key === "Tab" || passiveOpenModifierKeys.has(event.key) || (reactDomPassiveOpen.flushSync(() => {
          cell.engage();
        }), event.key !== "ArrowDown" && event.key !== "ArrowUp" || value.ownerDocument.activeElement !== value))
          return;
        let value2 = cell.getPopup(), value3 = value2 === null ? [] : Array.from(value2.querySelectorAll('[role^="menuitem"]:not([data-disabled])')), value4 = event.key === "ArrowDown" ? value3[0] : value3[value3.length - 1], value5 = (0, runtime2.asElement)(value4 ?? null);
        value5 !== null && value5.hasAttribute("data-highlighted") && (event.preventDefault(), event.stopImmediatePropagation(), value5.focus({
          preventScroll: !0
        }));
      };
      return value.addEventListener("keydown", callback), () => {
        value.removeEventListener("keydown", callback);
      };
    }, [cell]), null;
  }
  function isCanceledOpenWithinTrigger(input) {
    if (input.reason !== "cancel-open")
      return !1;
    let value = input.trigger ?? null, value2 = input.event?.target ?? null;
    if (value === null || value2 === null || !("nodeType" in value2))
      return !1;
    let value3 = value2;
    if (value.contains(value3))
      return !0;
    let attribute = value.getAttribute("aria-controls");
    return (attribute ? value.ownerDocument.getElementById(attribute) : null)?.contains(value3) ?? !1;
  }
  function useTrackedMenuTrigger(onOpenChange, refuseCanceledTriggerOpen = !1) {
    let triggerRef = reactMenuOpener.useRef(null);
    return {
      triggerRef,
      onOpenChange: (0, runtime2.useEventCallback)((input, options) => {
        if (!input && refuseCanceledTriggerOpen && isCanceledOpenWithinTrigger(options)) {
          options.cancel?.();
          return;
        }
        triggerRef.current = options.trigger ?? null, onOpenChange?.(input, options);
      })
    };
  }
  function useMenuOpenerRef() {
    return reactMenuOpener.useContext(menuOpenerRefContext);
  }
  function useMenuOwnerRef(input, options) {
    let value = reactMenuOpener.useContext(menuOpenerRefContext), resolveDefault = reactMenuOpener.useCallback(() => input !== void 0 ? input.current : value?.current ?? null, [input, value]);
    return (0, runtime2.useOverlayOwnerRef)(resolveDefault, options);
  }
  function readPopupPlacement(element) {
    return {
      side: element.getAttribute("data-side") || void 0,
      align: element.getAttribute("data-align") || void 0
    };
  }
  function arePopupPlacementsEqual(input, options) {
    return input !== null && input.side === options.side && input.align === options.align;
  }
  function placementNeedsBottomHold(input) {
    return input?.side === "top" || input?.side !== void 0 && input.side !== "bottom" && input.align === "end";
  }
  function useStablePopupPlacement({ enabled, side: side2, align: align2 }) {
    let [value, value2] = reactStablePopupPlacement.useState(null), [value3, value4] = reactStablePopupPlacement.useState(null), [value5, value6] = reactStablePopupPlacement.useState(), ref = reactStablePopupPlacement.useRef(null), ref2 = reactStablePopupPlacement.useRef(!1), ref3 = reactStablePopupPlacement.useRef(null), callback = reactStablePopupPlacement.useCallback((element) => {
      if (ref3.current?.(), ref3.current = null, !element) {
        value2(null), value4(null), ref2.current = !1;
        return;
      }
      let value8 = element.ownerDocument.defaultView ?? window, value9 = typeof value8.requestAnimationFrame == "function", index4 = 0, index22 = 0, callback3 = () => {
        if (index22 += 1, index22 < POPUP_PLACEMENT_SETTLE_FRAMES) {
          index4 = value8.requestAnimationFrame(callback3);
          return;
        }
        index4 = 0;
        let value10 = readPopupPlacement(element);
        value2((input) => arePopupPlacementsEqual(input, value10) ? input : value10);
      }, callback4 = () => {
        let value10 = readPopupPlacement(element);
        if (value4((input) => arePopupPlacementsEqual(input, value10) ? input : value10), ref2.current = placementNeedsBottomHold(value10), !ref2.current) {
          let value11 = ref.current?.getBoundingClientRect().height;
          value6(value11 !== void 0 && value11 > 0 ? value11 : void 0);
        }
        index22 = 0, value9 && index4 === 0 && (index4 = value8.requestAnimationFrame(callback3));
      };
      callback4();
      let observer = new MutationObserver(callback4);
      observer.observe(element, {
        attributes: !0,
        attributeFilter: ["data-side", "data-align"]
      }), ref3.current = () => {
        observer.disconnect(), index4 !== 0 && value8.cancelAnimationFrame(index4);
      };
    }, []), ref4 = reactStablePopupPlacement.useRef(null), callback2 = reactStablePopupPlacement.useCallback((input) => {
      if (ref4.current?.disconnect(), ref4.current = null, ref.current = input, !input) {
        value6(void 0);
        return;
      }
      if (!enabled)
        return;
      let callback3 = () => {
        let height2 = input.getBoundingClientRect().height;
        height2 > 0 && value6((input2) => ref2.current && input2 !== void 0 && height2 <= input2 ? input2 : height2);
      };
      if (callback3(), typeof ResizeObserver < "u") {
        let observer = new ResizeObserver(callback3);
        observer.observe(input), ref4.current = observer;
      }
    }, [enabled]), value7 = enabled && placementNeedsBottomHold(value3) && value5 !== void 0 ? {
      positionerStyle: {
        minHeight: `min(${Math.floor(value5)}px, var(--available-height))`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end"
      },
      positionerClassName: heldPositionerClasses,
      popupClassName: heldPopupClasses
    } : null;
    return {
      positionerRef: enabled ? callback : void 0,
      popupRef: callback2,
      side: enabled ? value?.side ?? side2 : side2,
      align: enabled ? value?.align ?? align2 : align2,
      held: value7
    };
  }
  function resolvePlatformWindow(input) {
    return input ?? (typeof window > "u" ? void 0 : window);
  }
  function matchesWindowMediaQuery(input, options) {
    let value = resolvePlatformWindow(options);
    return typeof value?.matchMedia == "function" && value.matchMedia(input).matches;
  }
  function useCoarseOrHoverlessPointer(ownWindow) {
    return matchesWindowMediaQuery(COARSE_OR_HOVERLESS_QUERY, ownWindow);
  }
  function usesImmediateModalRelease(input) {
    let value = resolvePlatformWindow(input);
    return value?.navigator?.userAgent?.includes(ELECTRON_USER_AGENT_TOKEN) ? !0 : !(matchesWindowMediaQuery(TOUCH_DEVICE_QUERY, value) && (value?.navigator?.maxTouchPoints ?? 0) > 0);
  }
  function subscribeDeviceMediaQueries(listener, ownWindow) {
    let value = resolvePlatformWindow(ownWindow);
    if (typeof value?.matchMedia != "function")
      return () => {
      };
    let value2 = [
      COARSE_OR_HOVERLESS_QUERY,
      MOBILE_WIDTH_QUERY,
      TOUCH_DEVICE_QUERY
    ].map((input) => value.matchMedia(input));
    for (let value3 of value2)
      value3.addEventListener("change", listener);
    return () => {
      for (let value3 of value2)
        value3.removeEventListener("change", listener);
    };
  }
  function makeOutsidePortalInert(element) {
    let items = [], callback = (input) => {
      let value2 = modalInertRefCounts.get(input) ?? 0;
      if (value2 === 0) {
        if (input.hasAttribute("inert"))
          return;
        input.setAttribute("inert", ""), input.setAttribute("data-cds-sheet-inert", "");
      }
      modalInertRefCounts.set(input, value2 + 1), items.push(input);
    }, callback2 = (element2) => {
      if (!(inertExcludedTags.has(element2.tagName) || element2.matches(MODAL_INERT_LIVE_REGION_SELECTOR))) {
        if (element2.querySelector(MODAL_INERT_LIVE_REGION_SELECTOR) === null) {
          callback(element2);
          return;
        }
        for (let value2 of Array.from(element2.children))
          callback2(value2);
      }
    }, value = element, body = element.ownerDocument.body;
    for (; value !== null && value !== body && value.parentElement !== null; ) {
      let parentElement = value.parentElement, value2 = value;
      for (let value3 of Array.from(parentElement.children))
        value3 !== value2 && callback2(value3);
      value = parentElement;
    }
    return () => {
      for (let value2 of items) {
        let value3 = (modalInertRefCounts.get(value2) ?? 1) - 1;
        value3 <= 0 ? (modalInertRefCounts.delete(value2), value2.hasAttribute("data-cds-sheet-inert") && (value2.removeAttribute("inert"), value2.removeAttribute("data-cds-sheet-inert"))) : modalInertRefCounts.set(value2, value3);
      }
    };
  }
  function useModalPortalInert({ node, open: open4, liftOnClose }) {
    let value = useRootWindow(), value2 = (0, runtime2.useOptionalEventCallback)(liftOnClose), ref = reactModalPortalInert.useRef(null), ref2 = reactModalPortalInert.useRef(null);
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      if (!open4 || node === null || value === void 0)
        return;
      let value3 = value.requestAnimationFrame(() => {
        if (ref.current === null) {
          let value4 = findOverlayPortalContainer(node);
          value4 !== null && (ref.current = makeOutsidePortalInert(value4));
        }
      });
      return () => {
        value.cancelAnimationFrame(value3);
        let current = ref.current;
        if (ref.current = null, current === null)
          return;
        if ((value2?.() ?? "now") === "now" || !canDelayModalInertRelease(value)) {
          current();
          return;
        }
        let value4 = releaseInertAfterPaint(value, current, () => {
          ref2.current === value4 && (ref2.current = null);
        });
        ref2.current = value4;
      };
    }, [node, open4, value, value2]), reactModalPortalInert.useCallback(() => ref2.current?.(), []);
  }
  function canDelayModalInertRelease(input) {
    return !usesImmediateModalRelease(input) && !(0, runtime2.isReducedMotion)() && input.document.visibilityState !== "hidden";
  }
  function releaseInertAfterPaint(input, options, context) {
    let document2 = input.document, flag = !1, callback = () => {
      flag || (flag = !0, input.cancelAnimationFrame(value), input.removeEventListener("pointerdown", callback, !0), input.removeEventListener("keydown", callback, !0), input.removeEventListener("pagehide", callback), document2.removeEventListener("visibilitychange", callback2), options(), context());
    }, callback2 = () => {
      document2.visibilityState === "hidden" && callback();
    }, value = input.requestAnimationFrame(() => {
      value = input.requestAnimationFrame(callback);
    });
    return input.addEventListener("pointerdown", callback, !0), input.addEventListener("keydown", callback, !0), input.addEventListener("pagehide", callback), document2.addEventListener("visibilitychange", callback2), callback;
  }
  function findOverlayPortalContainer(element) {
    let body = element.ownerDocument.body, value = element, value2 = null;
    for (; value !== null && value !== body; ) {
      if (value.hasAttribute("data-base-ui-portal") || value.hasAttribute("data-cds-portal"))
        return value;
      value2 = value, value = value.parentElement;
    }
    return value2;
  }
  function preventModalTabNavigation(event) {
    event.key === "Tab" && (event.preventDefault(), event.stopPropagation());
  }
  function coverParentMenuSheet(input, options) {
    let entry = coveredMenuSheetOwners.get(input);
    entry === void 0 && (entry = /* @__PURE__ */ new Set(), coveredMenuSheetOwners.set(input, entry)), entry.add(options), input.setAttribute("aria-hidden", "true"), input.setAttribute(runtime2.SHEET_DRILLED_ATTRIBUTE, "");
  }
  function uncoverParentMenuSheet(input, options) {
    let entry = coveredMenuSheetOwners.get(input);
    entry?.delete(options), (entry === void 0 || entry.size === 0) && (input.removeAttribute("aria-hidden"), input.removeAttribute(runtime2.SHEET_DRILLED_ATTRIBUTE));
  }
  function getSheetInertReleaseTiming(input) {
    if (input?.reason === "outside-press")
      return "after-paint";
    let value = input?.event;
    if (input?.reason !== "item-press" || value === void 0 || !("detail" in value) || value.detail === 0)
      return "now";
    let target = value.target;
    return (target !== null && "closest" in target ? target.closest('[role^="menuitem"]') : null)?.hasAttribute("data-cds-focuses-nothing") === !0 ? "after-paint" : "now";
  }
  function MenuSheetTitleBar({ nested }) {
    let value = reactMenuSheetPopup.useContext(runtime2.menuTriggerContext), { label: value2 } = reactMenuSheetPopup.useContext(runtime2.submenuStateContext), value3 = reactMenuSheetPopup.useContext(runtime2.menuSheetLabelsContext), value4 = (0, runtime2.useTranslation)("back", "Back"), value5 = value3.backLabel ?? value4;
    return jsxMenuSheetPopup.jsx(runtime2.SheetTitleBar, {
      title: nested ? value2 : value3.sheetTitle,
      leading: nested ? jsxMenuSheetPopup.jsx(runtime2.baseMenu.Item, {
        closeOnClick: !1,
        onClick: () => value?.close(),
        "aria-label": value5,
        label: value5,
        className: (0, runtime2.cn)(menuItemVariants({
          variant: "default"
        }), "min-h-control w-auto py-0"),
        children: jsxMenuSheetPopup.jsx(runtime2.IconSlot, {
          icon: jsxMenuSheetPopup.jsx(runtime2.Icon, {
            // Icon mirrors ArrowLeft in RTL on its own.
            name: "ArrowLeft",
            size: "md"
          })
        })
      }) : void 0
    });
  }
  function MenuSheetCloseButton() {
    let value = reactMenuSheetPopup.useContext(runtime2.sheetFrameContext), value2 = (0, runtime2.useTranslation)("close", "Close"), value3 = reactMenuSheetPopup.useContext(runtime2.menuSheetLabelsContext).closeLabel ?? value2;
    return jsxMenuSheetPopup.jsx(runtime2.baseMenu.Item, {
      closeOnClick: !1,
      onClick: () => value?.dismiss(),
      "aria-label": value3,
      label: value3,
      "data-cds-sheet-control": "",
      className: "group/sheet-close cds-reset block w-full rounded outline-none select-none focus-visible:outline-hidden [&:not(:focus-visible):not([data-highlighted]):not([data-cds-sheet-control-held])]:sr-only",
      children: jsxMenuSheetPopup.jsxs("span", {
        className: (0, runtime2.cn)(menuItemVariants({
          variant: "default"
        }), "group-data-[highlighted]/sheet-close:bg-fill-ghost-hover"),
        children: [
          jsxMenuSheetPopup.jsx(runtime2.IconSlot, {
            icon: "X"
          }),
          jsxMenuSheetPopup.jsx("span", {
            className: "min-w-0 flex-1 truncate",
            children: value3
          })
        ]
      })
    });
  }
  function PopoverSheetBackdrop({ sheetPopup }) {
    return jsxPopoverSheetBody.jsx(runtime2.basePopover.Backdrop, {
      "data-presentation": "sheet",
      "data-sheet-scrim": sheetPopup.frame?.treeId,
      className: sheetPopup.state.depth > 0 ? runtime2.transparentSheetBackdropClasses : runtime2.sheetBackdropClasses
    });
  }
  function PopoverSheetBody({ sheetPopup, className, bodyRef, bodyClassName, closeLabel, children }) {
    let { chrome: value } = sheetPopup;
    return jsxPopoverSheetBody.jsxs(runtime2.sheetParentContext.Provider, {
      value: sheetPopup.stack,
      children: [
        jsxPopoverSheetBody.jsx(value.Handle, {}),
        jsxPopoverSheetBody.jsxs(value.Body, {
          className: (0, runtime2.cn)(className, "h-auto max-h-none min-h-0 w-full min-w-0 max-w-none flex-auto"),
          children: [
            jsxPopoverSheetBody.jsx("div", {
              ref: bodyRef,
              tabIndex: -1,
              "data-cds-popover-body": "",
              [runtime2.SHEET_SCROLL_ATTRIBUTE]: "",
              className: bodyClassName,
              children
            }),
            jsxPopoverSheetBody.jsx(value.DismissButton, {
              as: runtime2.basePopover.Close,
              label: closeLabel
            })
          ]
        })
      ]
    });
  }
  function ContextMenuSheetBackdrop({ sheetPopup }) {
    return jsxContextMenuSheetBackdrop.jsx(runtime2.baseCombobox.Backdrop, {
      "data-presentation": "sheet",
      "data-sheet-scrim": sheetPopup.frame?.treeId,
      className: sheetPopup.state.depth > 0 ? runtime2.transparentSheetBackdropClasses : runtime2.sheetBackdropClasses
    });
  }
  function subscribeSheetImplementation(input) {
    return sheetImplementationSubscribers.add(input), () => {
      sheetImplementationSubscribers.delete(input);
    };
  }
  function loadSheetImplementation() {
    let value = sheetImplementationGeneration;
    return sheetImplementationPromise ??= (0, runtime2.runWithTransition)("cds_mobile_sheets", () => Promise.resolve().then(() => (initializeMobileSheetExports(), mobileSheetExports))).then((input) => typeof input == "object" && input !== null && "SheetPopupHost" in input ? input : null, () => null).then((input) => {
      if (value !== sheetImplementationGeneration)
        return input;
      input === null ? sheetImplementationFailed = !0 : loadedSheetImplementation = input;
      for (let value2 of sheetImplementationSubscribers)
        value2();
      return input;
    }), sheetImplementationPromise;
  }
  function preloadSheetImplementation() {
    loadedSheetImplementation !== null || sheetImplementationFailed || (sheetImplementationRequests += 1, loadSheetImplementation());
  }
  function isSheetImplementationLoaded() {
    return loadedSheetImplementation !== null;
  }
  function useSheetImplementationLoaded() {
    return reactSheetImplementation.useSyncExternalStore(subscribeSheetImplementation, getSheetImplementationLoadedSnapshot, getFalseSheetImplementationSnapshot);
  }
  function useSheetImplementationFailed() {
    return reactSheetImplementation.useSyncExternalStore(subscribeSheetImplementation, getSheetImplementationFailedSnapshot, getFalseSheetImplementationSnapshot);
  }
  function useLoadedSheetImplementation() {
    return reactSheetImplementation.useSyncExternalStore(subscribeSheetImplementation, getSheetImplementationSnapshot, getNullSheetImplementationSnapshot);
  }
  function usePreloadSheetsForCoarsePointer(input, options) {
    let value = (0, runtime2.useMediaQuery__U)(input ? options : void 0, runtime2.COARSE_POINTER_QUERY_rG);
    reactPreloadSheets.useEffect(() => {
      input && value && preloadSheetImplementation();
    }, [input, value]);
  }
  function detectCdsPlatform() {
    return typeof navigator > "u" ? "web" : desktopPlatformUserAgentPattern.test(navigator.userAgent) ? "desktop" : "web";
  }
  function reportLinkSanitizationDebug(input, options, context) {
  }
  function truncateLinkDebugValue(items) {
    if (items.length <= MAX_LINK_DEBUG_LENGTH)
      return items;
    let value = items.charCodeAt(119), value2 = value >= 55296 && value <= 56319 ? 119 : MAX_LINK_DEBUG_LENGTH;
    return `${items.slice(0, value2)}…`;
  }
  function normalizeHrefWhitespace(input) {
    let value = input.replace(linkWhitespacePattern, ""), index4 = 0, length = value.length;
    for (; index4 < length && value.charCodeAt(index4) <= 32; )
      index4++;
    for (; length > index4 && value.charCodeAt(length - 1) <= 32; )
      length--;
    return index4 === 0 && length === value.length ? value : value.slice(index4, length);
  }
  function isSanitizedHrefFallback(input, options) {
    return options === "#" && input !== void 0 && normalizeHrefWhitespace(input) !== "#";
  }
  function opensInSeparateBrowsingContext(input) {
    return !!input && !existingBrowsingContextNames.has(input.toLowerCase());
  }
  function normalizeLinkRel(input, options, context) {
    if (!opensInSeparateBrowsingContext(input))
      return options ?? void 0;
    if (options == null)
      return context();
    let value = options.split(/\s+/).filter((input2) => input2 !== "" && input2.toLowerCase() !== "opener");
    return value.some((input2) => unsafeLinkRelTokenPattern.test(input2)) || value.push("noopener"), value.join(" ");
  }
  function useCdsRouter() {
    return reactCdsLink.useContext(cdsRouterContext);
  }
  function sanitizeHref(input) {
    if (!input)
      return input;
    let value = normalizeHrefWhitespace(input);
    return forbiddenHrefControlCharacterPattern.test(value) ? rejectUnsafeHref(value, "it contains a control character") : leadingHrefWhitespacePattern.test(value) ? rejectUnsafeHref(value, "it starts with whitespace the browser keeps") : absoluteHrefPattern.test(value) ? value.startsWith("//") ? value : androidIntentHrefPattern.test(value) ? isAllowedAndroidIntentHref(value) ? value : rejectUnsafeHref(value, "only an Anthropic Android app's own sign-in intent: shape is followed") : editorHrefSchemePattern.test(value) ? isAllowedEditorHref(value) ? value : rejectUnsafeHref(value, "only an Anthropic extension's marketplace page or a VS Code settings link is followed") : allowedHrefSchemePattern.test(value) ? value : rejectUnsafeHref(value, "its scheme is not one CDS links navigate") : validateRelativeHref(value);
  }
  function rejectUnsafeHref(input, options) {
    return "#";
  }
  function validateRelativeHref(input) {
    let value = networkPathHrefPattern.test(input);
    try {
      let value2 = new URL(input, HTTPS_RELATIVE_HREF_BASE), value3 = value2.pathname.replace(/^\/{2,}/, "/") + value2.search + value2.hash;
      if (value || value2.origin !== HTTPS_RELATIVE_HREF_BASE || value2.pathname.startsWith("//"))
        return value || value2.origin, value3;
      if (hasUnsafeRelativePath(input))
        return value3;
      let value4 = getHrefPathBeforeQuery(input);
      if (unrootedHrefPattern.test(input) && encodedOrBackslashPathPattern.test(value4) && !value2.pathname.startsWith("//")) {
        let value5 = value4.replaceAll("\\", "/").split("/").map((input2) => dotSegmentPattern.test(input2) ? input2.replace(/%2e/gi, ".") : input2).join("/");
        if (value5 !== value4)
          return value5 + input.slice(value4.length);
      }
    } catch {
      if (value)
        return rejectUnsafeHref(input, "it names a host this URL parser cannot parse");
    }
    return input;
  }
  function hasUnsafeRelativePath(input) {
    if (!rootRelativeHrefPattern.test(input))
      return !1;
    let value = getHrefPathBeforeQuery(input);
    return value.includes("\\") || relativePathDotSegmentPattern.test(value);
  }
  function getHrefPathBeforeQuery(input) {
    let value = input.search(/[?#]/);
    return value < 0 ? input : input.slice(0, value);
  }
  function isAllowedEditorHref(input) {
    return allowedEditorHrefPattern.test(input.replace(editorHrefSchemePattern, (input2) => input2.toLowerCase()));
  }
  function isAllowedAndroidIntentHref(input) {
    if (!androidIntentHrefPattern.test(input))
      return !1;
    let value = input.indexOf("#");
    if (value < 0 || input.indexOf("#", value + 1) >= 0)
      return !1;
    let value2 = input.slice(value + 1);
    if (!value2.startsWith("Intent;") || !value2.endsWith(";end"))
      return !1;
    let value3 = value2.slice(7, -4), entries = /* @__PURE__ */ new Map();
    for (let value4 of value3.split(";")) {
      let value5 = value4.indexOf("=");
      if (value5 <= 0)
        return !1;
      let value6 = value4.slice(0, value5);
      if (entries.has(value6) || !allowedIntentPropertyNames.has(value6))
        return !1;
      entries.set(value6, value4.slice(value5 + 1));
    }
    let entry = entries.get("package");
    if (entry === void 0 || !trustedAndroidIntentPackages.has(entry) || entries.get("scheme") !== "https")
      return !1;
    let entry2 = entries.get("S.browser_fallback_url");
    if (entry2 === void 0)
      return !0;
    try {
      return new URL(decodeURIComponent(entry2)).protocol === "https:";
    } catch {
      return !1;
    }
  }
  function classifyHrefOrigin(input, options) {
    let value;
    try {
      value = new URL(input, options);
    } catch {
      return "other";
    }
    if (value.origin === options)
      return "relative";
    if (value.protocol !== "https:" && value.protocol !== "http:")
      return "other";
    let hostname = value.hostname;
    return trustedFirstPartyDomains.some((input2) => hostname === input2 || hostname.endsWith("." + input2)) ? "first-party" : "other";
  }
  function isOriginStableHref(input) {
    if (!input)
      return !1;
    let value = classifyHrefOrigin(input, HTTPS_RELATIVE_HREF_BASE);
    return value !== "other" && value === classifyHrefOrigin(input, HTTP_RELATIVE_HREF_BASE);
  }
  function getSeparateContextRel(input) {
    return isOriginStableHref(input) ? "noopener" : "noopener noreferrer";
  }
  function getAutomaticLinkRel(input, options) {
    let value = sanitizeHref(input);
    if (opensInSeparateBrowsingContext(options))
      return getSeparateContextRel(value);
    if (!isOriginStableHref(value))
      return "noreferrer";
  }
  function isSameOriginHref(input) {
    if (typeof window > "u")
      return !1;
    try {
      let value = new URL(input, window.location.href);
      return value.origin !== "null" && value.protocol === window.location.protocol && value.origin === window.location.origin;
    } catch {
      return !1;
    }
  }
  function shouldHandleLinkWithRouter(event) {
    return !event.router || !event.href || event.href.startsWith("#") || event.target && event.target.toLowerCase() !== "_self" || event.download !== null && event.download !== void 0 && event.download !== !1 ? !1 : isSameOriginHref(event.href);
  }
  function normalizeRouterHref(input) {
    if (!absoluteHrefPattern.test(input))
      return input;
    let value = new URL(input, window.location.href);
    return value.pathname.replace(/^\/{2,}/, "/") + value.search + value.hash;
  }
  function isModifiedLinkClick(input) {
    return input.defaultPrevented || input.button !== 0 || input.metaKey || input.ctrlKey || input.shiftKey || input.altKey;
  }
  function pickLinkEventProps(input) {
    let value = input, state = {};
    for (let value2 of linkEventPropNames)
      value[value2] !== void 0 && (state[value2] = value[value2]);
    return state;
  }
  function omitLinkEventProps(input) {
    let state = {
      ...input
    };
    for (let value of linkEventPropNames)
      delete state[value];
    return state;
  }
  function composeLinkEventHandlers(input, options, context) {
    return options ? (input2) => {
      input?.(input2), (!context || !input2.defaultPrevented) && options(input2);
    } : input;
  }
  function useCdsLink({ href, routerOptions, target, rel, download, onClick, onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur }) {
    let router = useCdsRouter(), safeHref = sanitizeHref(href), hrefRejected = isSanitizedHrefFallback(href, safeHref), safeTarget = hrefRejected ? void 0 : target, safeDownload = hrefRejected ? void 0 : download, resolvedHref = router?.resolveHref && safeHref && !safeHref.startsWith("#") && !absoluteHrefPattern.test(safeHref) ? router.resolveHref(safeHref) : safeHref, hasRouter = router !== void 0, routerHref = reactCdsLink.useMemo(() => {
      let state = {
        href: safeHref,
        target: safeTarget,
        download: safeDownload,
        router: hasRouter
      };
      if (shouldHandleLinkWithRouter(state))
        return normalizeRouterHref(state.href);
    }, [safeHref, safeTarget, safeDownload, hasRouter]), handleClick = reactCdsLink.useCallback((event) => {
      onClick?.(event), !(isModifiedLinkClick(event) || routerHref === void 0 || !router) && (event.preventDefault(), router.navigate(routerHref, routerOptions));
    }, [onClick, routerHref, router, routerOptions]), intentHandlers = router?.intentHandlers, routerIntentHandlers = reactCdsLink.useMemo(() => intentHandlers && routerHref !== void 0 ? intentHandlers(routerHref) : void 0, [intentHandlers, routerHref]), combinedIntentHandlers = reactCdsLink.useMemo(() => {
      let state = {
        onPointerEnter,
        onPointerLeave,
        onPointerDown,
        onFocus,
        onBlur
      }, state2 = {};
      for (let value of linkPrefetchEventNames) {
        let value2 = composeLinkEventHandlers(state[value], routerIntentHandlers?.[value], linkPrefetchEventKinds[value]);
        value2 && (state2[value] = value2);
      }
      return state2;
    }, [
      routerIntentHandlers,
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onFocus,
      onBlur
    ]);
    return {
      href: resolvedHref,
      target: safeTarget,
      rel: normalizeLinkRel(safeTarget, rel, () => getSeparateContextRel(resolvedHref)),
      download: safeDownload,
      onClick: handleClick,
      ...combinedIntentHandlers
    };
  }
  function getElementWindow(input) {
    return input?.ownerDocument.defaultView ?? globalThis.window;
  }
  function elementHasUnavailableWindow(element) {
    return element !== void 0 && (!element.isConnected || element.ownerDocument.defaultView === null);
  }
  function getConnectedElementWindow(input) {
    if (!elementHasUnavailableWindow(input))
      return getElementWindow(input);
  }
  function scheduleElementTimeout(element, callback, delay) {
    let elementWindow = getConnectedElementWindow(element);
    if (!elementWindow)
      return null;
    let timer = elementWindow.setTimeout(callback, delay);
    return {
      cancel() {
        try {
          elementWindow.clearTimeout(timer);
        } catch {
        }
      }
    };
  }
  function hasCdsHtmlFontSizing(element) {
    return element === element.ownerDocument.documentElement && element.style.fontSize.includes("--cds-font-size-body");
  }
  function migrateCdsHtmlFontSizing() {
    if (!(hasMigratedHtmlFontSizing || typeof document > "u")) {
      hasMigratedHtmlFontSizing = !0;
      try {
        let items = [], values = /* @__PURE__ */ new Set(), callback = (input) => {
          if (!input)
            return;
          let value3 = input.split(".")[0] ?? input;
          values.has(value3) || (values.add(value3), items.push(value3));
        }, callback2 = (input) => {
          let value3;
          try {
            value3 = input.cssRules;
          } catch {
            return;
          }
          for (let value4 of value3) {
            let name = value4.constructor.name;
            if (name === "CSSLayerStatementRule")
              for (let value5 of value4.nameList)
                callback(value5);
            else if (name === "CSSLayerBlockRule")
              callback(value4.name);
            else if (name === "CSSImportRule") {
              let value5 = value4;
              callback(value5.layerName), value5.styleSheet && callback2(value5.styleSheet);
            }
          }
        };
        for (let value3 of document.styleSheets)
          callback2(value3);
        let value = items.indexOf("utilities");
        if (value === -1)
          return;
        let value2 = items.indexOf("cds-card");
        (value2 === -1 || value2 > value) && console.error("cds: the `cds-card` cascade layer is " + (value2 === -1 ? "not declared" : "declared after `utilities`") + " in this document, so Card's stretched-link lift rules outrank consumer positioning utilities — `absolute`/`z-*` on interactive children inside <Card> will silently lose, and a `backgroundClassName` surface override stops applying, since the fill layer's resting color and hover step sit in the same layer and must rank below consumer utilities to be overridable. Fix: add `@layer cds-card;` before the `@import \"tailwindcss\"` line in this app's Tailwind entry CSS (see packages/cds/src/component-base.css § cds-card).");
      } catch {
      }
    }
  }
  function getControlSizeAttributes(input) {
    return input && input !== "base" ? {
      "data-size": input
    } : {};
  }
  function getDensitySizeIndex(input, options) {
    let value = densitySizeIndices[input] + controlSizeOffsets[options ?? "base"];
    return value < 1 ? 1 : value > 5 ? 5 : value;
  }
  function createColorModeStore(configuredMode) {
    let element = null, inheritedModeAttribute = configuredMode === void 0 && typeof document < "u" ? document.documentElement.getAttribute("data-mode") : null, getSetting = () => configuredMode ?? normalizeColorMode(inheritedModeAttribute), modeFromDarkPreference = (input) => input ? "dark" : "light", colorSchemeMedia, systemColorMode, initialized = !1, initialize = () => {
      initialized || (initialized = !0, colorSchemeMedia = configuredMode !== "light" && configuredMode !== "dark" && typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia(DARK_COLOR_SCHEME_QUERY) : void 0, systemColorMode = colorSchemeMedia ? modeFromDarkPreference(colorSchemeMedia.matches) : void 0);
    }, readInheritedMode = () => {
      element && (inheritedModeAttribute = element.closest("[data-mode]")?.getAttribute("data-mode") ?? (element.isConnected ? null : document.documentElement.getAttribute("data-mode")));
    }, explicitColorMode = (input) => input === "light" || input === "dark" ? input : void 0, listeners = /* @__PURE__ */ new Set(), notify = () => listeners.forEach((input) => input()), changedBeforeSubscription = !1, startObserving = () => {
      let items = [];
      initialize();
      let value = colorSchemeMedia;
      if (value) {
        let callback = () => {
          systemColorMode = modeFromDarkPreference(value.matches), notify();
        };
        value.addEventListener("change", callback), items.push(() => value.removeEventListener("change", callback));
        let value2 = modeFromDarkPreference(value.matches);
        value2 !== systemColorMode && (systemColorMode = value2, changedBeforeSubscription = !0);
      }
      if (configuredMode === void 0 && typeof MutationObserver < "u") {
        let value2 = inheritedModeAttribute;
        readInheritedMode(), inheritedModeAttribute !== value2 && (changedBeforeSubscription = !0);
        let value3 = (0, runtime2.createSafeMutationObserver)(MutationObserver, () => {
          let value4 = inheritedModeAttribute;
          readInheritedMode(), inheritedModeAttribute !== value4 && notify();
        });
        value3.observe(document.documentElement, {
          attributes: !0,
          attributeFilter: ["data-mode"],
          subtree: !0
        }), items.push(() => value3.disconnect());
      }
      return changedBeforeSubscription && (changedBeforeSubscription = !1, queueMicrotask(notify)), () => items.forEach((input) => input());
    }, stopObserving;
    return {
      setElement: (input) => {
        if (element = input, configuredMode === void 0 && input !== null) {
          let value = inheritedModeAttribute;
          readInheritedMode(), inheritedModeAttribute !== value && listeners.size === 0 && (changedBeforeSubscription = !0), notify();
        }
      },
      subscribe: (input) => (listeners.size === 0 && (stopObserving = startObserving()), listeners.add(input), () => {
        listeners.delete(input), listeners.size === 0 && (stopObserving?.(), stopObserving = void 0);
      }),
      getSnapshot: () => (initialize(), explicitColorMode(getSetting()) ?? systemColorMode),
      getServerSnapshot: () => explicitColorMode(configuredMode),
      getAttrSnapshot: () => {
        if (initialize(), configuredMode !== void 0)
          return explicitColorMode(configuredMode) ?? systemColorMode ?? configuredMode;
      },
      getServerAttrSnapshot: () => configuredMode,
      getSettingSnapshot: () => getSetting(),
      getServerSettingSnapshot: () => configuredMode
    };
  }
  function usePageBackground() {
    return reactCdsRoot.useContext(pageBackgroundContext);
  }
  function useDensity() {
    return reactCdsRoot.useContext(densityContext);
  }
  function useResolvedColorMode() {
    return useColorMode() ?? "light";
  }
  function useColorMode() {
    let value = reactCdsRoot.useContext(colorModeStoreContext) ?? defaultColorModeStore;
    return reactCdsRoot.useSyncExternalStore(value.subscribe, value.getSnapshot, value.getServerSnapshot);
  }
  function usePlatform() {
    return reactCdsRoot.useContext(platformContext) ?? "web";
  }
  function useFont() {
    return reactCdsRoot.useContext(fontContext);
  }
  function useMonospaceFont() {
    return reactCdsRoot.useContext(monospaceFontContext);
  }
  function getMonospaceOverrideStyle(input) {
    if (input === null)
      return {
        "--cds-font-mono-override": "initial"
      };
    let value = input?.trim();
    return value ? {
      "--cds-font-mono-override": `"${value.replaceAll(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}",`
    } : {};
  }
  function useSurfaceBackground() {
    return reactCdsRoot.useContext(surfaceBackgroundContext);
  }
  function getSurfaceBackgroundStyle(input) {
    return input ? {
      "--cds-page-bg": isSurfaceToken(input) ? `var(--cds-${input})` : sanitizeCssBackground(input),
      ...isTintedFillSurface(input) ? opaqueTintOverrides : {}
    } : {};
  }
  function isTintedFillSurface(input) {
    return isSurfaceToken(input) && input.startsWith("fill-");
  }
  function sanitizeCssBackground(input) {
    return input.replaceAll(/[\u0000-\u001f\u007f;{}*]/g, "");
  }
  function isSurfaceToken(input) {
    return surfaceTokenNames.has(input);
  }
  function useCdsConfig() {
    return reactCdsRoot.useContext(localeContext);
  }
  function useRootElement() {
    return reactCdsRoot.useContext(rootElementContext);
  }
  function usePortalContainer() {
    let value = reactCdsRoot.useContext(rootElementContext), value2 = reactCdsRoot.useContext(rootPortalContainerContext), value3 = reactCdsRoot.useContext(isPortalRootContext);
    return value ?? (value3 ? void 0 : value2);
  }
  function useRootWindow() {
    return getElementWindow(reactCdsRoot.useContext(rootElementContext));
  }
  function CdsRoot({ density, mode, platform: platform3, font, fontMono, pageBackground, locale, direction, router, labels, experimental, render, className, children }) {
    let parentDensity = reactCdsRoot.useContext(densityContext), parentPlatform = reactCdsRoot.useContext(platformContext), parentFont = reactCdsRoot.useContext(fontContext), parentPageBackground = reactCdsRoot.useContext(pageBackgroundContext), parentRouter = useCdsRouter(), parentLabels = reactCdsRoot.useContext(runtime2.translationContext), parentDensityOverride = reactCdsRoot.useContext(densityOverrideContext), densityOverride = experimental?.densityOverride ?? parentDensityOverride, coarsePointer = reactCdsRoot.useSyncExternalStore(subscribeRootCoarsePointer, runtime2.getCoarsePointerSnapshot, getCoarsePointerServerSnapshot), resolvedDensity = densityOverride ?? (coarsePointer ? "comfortable" : density ?? parentDensity), resolvedRouter = router ?? parentRouter, resolvedLabels = reactCdsRoot.useMemo(() => labels && parentLabels ? (input, options, context) => labels(input, options, context) || parentLabels(input, options, context) : labels ?? parentLabels, [labels, parentLabels]), parentNaturalImageTiles = reactCdsRoot.useContext(naturalImageTilesContext), naturalImageTiles = experimental?.naturalImageTiles ?? parentNaturalImageTiles, featureFlagNames = (0, runtime2.mergeFeatureFlagNames)(reactCdsRoot.useContext(runtime2.featureFlagContext), experimental?.fizzyLake?.parts), parentShrinkWrapMemory = reactCdsRoot.useContext(shrinkWrapMemoryContext), shrinkWrapMemory = experimental?.shrinkWrapMemory ?? parentShrinkWrapMemory;
    usePreloadSheetsForCoarsePointer(parentFont === void 0, useRootWindow());
    let parentFontMono = reactCdsRoot.useContext(monospaceFontContext), resolvedFontMono = fontMono === null ? null : (fontMono?.trim() ? fontMono.trim() : void 0) ?? parentFontMono, resolvedPageBackground = pageBackground ?? parentPageBackground, parentSurfaceBackground = reactCdsRoot.useContext(surfaceBackgroundContext), resolvedSurfaceBackground = pageBackground ?? parentSurfaceBackground, parentLocale = reactCdsRoot.useContext(localeContext), normalizedLocale = locale?.trim() ? locale.trim() : void 0, resolvedLocale = normalizedLocale ?? parentLocale, detectedPlatform = reactCdsRoot.useSyncExternalStore(subscribePlatformNoop, detectCdsPlatform, getWebPlatformSnapshot), resolvedPlatform = platform3 ?? parentPlatform ?? detectedPlatform, elementRef = reactCdsRoot.useRef(null), parentColorModeStore = reactCdsRoot.useContext(colorModeStoreContext), ownsColorModeStore = mode !== void 0 || parentColorModeStore === void 0, [colorModeState, setColorModeState] = reactCdsRoot.useState(() => ownsColorModeStore ? {
      mode,
      scope: createColorModeStore(mode)
    } : null), inheritedColorModeStore = ownsColorModeStore ? void 0 : parentColorModeStore, colorModeStore;
    inheritedColorModeStore !== void 0 ? colorModeStore = inheritedColorModeStore : colorModeState !== null && colorModeState.mode === mode ? colorModeStore = colorModeState.scope : (colorModeStore = createColorModeStore(mode), setColorModeState({
      mode,
      scope: colorModeStore
    })), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      (0, runtime2.registerInputDismissalTracking)(elementRef.current?.ownerDocument);
    }, []), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      if (ownsColorModeStore)
        return colorModeStore.setElement(elementRef.current), () => colorModeStore.setElement(null);
    }, [ownsColorModeStore, colorModeStore]);
    let themeStore = (0, runtime2.useExperimentalThemeStore)(experimental?.theme, elementRef), colorModeAttribute = reactCdsRoot.useSyncExternalStore(colorModeStore.subscribe, ownsColorModeStore ? colorModeStore.getAttrSnapshot : colorModeStore.getSnapshot, ownsColorModeStore ? colorModeStore.getServerAttrSnapshot : colorModeStore.getServerSnapshot);
    reactCdsRoot.useEffect(() => {
    }, [normalizedLocale]), reactCdsRoot.useEffect(() => {
    }, [!1]), reactCdsRoot.useEffect(() => {
    }, []);
    let renderElement = render;
    typeof renderElement == "object" && renderElement !== null && renderElement.$$typeof === Symbol.for("react.lazy") && (renderElement = reactCdsRoot.Children.toArray(renderElement)[0]);
    let isHtmlRoot = reactCdsRoot.isValidElement(renderElement) && renderElement.type === "html", documentFont = (0, runtime2.useDocumentFont)(font === void 0 && parentFont === void 0 && !isHtmlRoot), resolvedFont = font ?? parentFont ?? documentFont ?? "anthropic", rootElement = (0, runtime2.baseUseRender)({
      render: renderElement,
      defaultTagName: "div",
      ref: elementRef,
      props: {
        className: (0, runtime2.cn)("cds-root text-primary", className),
        "data-density": resolvedDensity,
        "data-mode": colorModeAttribute,
        "data-platform": resolvedPlatform,
        "data-font": resolvedFont,
        "data-cds-fizzy-lake": featureFlagNames,
        "data-page-bg": resolvedPageBackground,
        style: {
          ...!isHtmlRoot && {
            fontSize: "var(--cds-font-size-body)"
          },
          ...getSurfaceBackgroundStyle(resolvedSurfaceBackground),
          ...getMonospaceOverrideStyle(resolvedFontMono)
        },
        children
      }
    }), directedRootElement = direction === void 0 ? rootElement : jsxCdsRoot.jsx(runtime2.baseDirectionProvider, {
      direction,
      children: rootElement
    });
    return jsxCdsRoot.jsx(densityContext.Provider, {
      value: resolvedDensity,
      children: jsxCdsRoot.jsx(colorModeStoreContext.Provider, {
        value: colorModeStore,
        children: jsxCdsRoot.jsx(platformContext.Provider, {
          value: resolvedPlatform,
          children: jsxCdsRoot.jsx(fontContext.Provider, {
            value: resolvedFont,
            children: jsxCdsRoot.jsx(monospaceFontContext.Provider, {
              value: resolvedFontMono,
              children: jsxCdsRoot.jsx(pageBackgroundContext.Provider, {
                value: resolvedPageBackground,
                children: jsxCdsRoot.jsx(surfaceBackgroundContext.Provider, {
                  value: resolvedSurfaceBackground,
                  children: jsxCdsRoot.jsx(localeContext.Provider, {
                    value: resolvedLocale,
                    children: jsxCdsRoot.jsx(cdsRouterContext.Provider, {
                      value: resolvedRouter,
                      children: jsxCdsRoot.jsx(runtime2.translationContext.Provider, {
                        value: resolvedLabels,
                        children: jsxCdsRoot.jsx(naturalImageTilesContext.Provider, {
                          value: naturalImageTiles,
                          children: jsxCdsRoot.jsx(densityOverrideContext.Provider, {
                            value: densityOverride,
                            children: jsxCdsRoot.jsx(runtime2.themeStoreContext.Provider, {
                              value: themeStore,
                              children: jsxCdsRoot.jsx(runtime2.featureFlagContext.Provider, {
                                value: featureFlagNames,
                                children: jsxCdsRoot.jsx(shrinkWrapMemoryContext.Provider, {
                                  value: shrinkWrapMemory,
                                  children: directedRootElement
                                })
                              })
                            })
                          })
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    });
  }
  return bindRuntimeValue(runtime2, "overlayOwnerResolvers", () => overlayOwnerResolvers, (value) => {
    overlayOwnerResolvers = value;
  }), bindRuntimeValue(runtime2, "MAX_OVERLAY_OWNER_DEPTH", () => MAX_OVERLAY_OWNER_DEPTH, (value) => {
    MAX_OVERLAY_OWNER_DEPTH = value;
  }), bindRuntimeValue(runtime2, "initializeOverlayOwners", () => initializeOverlayOwners, (value) => {
    initializeOverlayOwners = value;
  }), bindRuntimeValue(runtime2, "useCaptureOverlayOpener", () => useCaptureOverlayOpener), bindRuntimeValue(runtime2, "useOverlayFocusReturn", () => useOverlayFocusReturn), bindRuntimeValue(runtime2, "resolveConnectedRefElement", () => resolveConnectedRefElement), bindRuntimeValue(runtime2, "useOverlayFinalFocus", () => useOverlayFinalFocus), bindRuntimeValue(runtime2, "resolveFinalFocusTarget", () => resolveFinalFocusTarget), bindRuntimeValue(runtime2, "isTextEntryTarget", () => isTextEntryTarget), bindRuntimeValue(runtime2, "isCdsLayoutDebugEnabled", () => isCdsLayoutDebugEnabled), bindRuntimeValue(runtime2, "shrinkWrapMemoryContext", () => shrinkWrapMemoryContext, (value) => {
    shrinkWrapMemoryContext = value;
  }), bindRuntimeValue(runtime2, "cdsLayoutDebugProbe", () => cdsLayoutDebugProbe, (value) => {
    cdsLayoutDebugProbe = value;
  }), bindRuntimeValue(runtime2, "findOpenSheetTreeDialogAncestor", () => findOpenSheetTreeDialogAncestor), bindRuntimeValue(runtime2, "findFocusedOpenOverlay", () => findFocusedOpenOverlay), bindRuntimeValue(runtime2, "findNextOpenOverlay", () => findNextOpenOverlay), bindRuntimeValue(runtime2, "preventFocusStealing", () => preventFocusStealing), bindRuntimeValue(runtime2, "reactOverlayOwners", () => reactOverlayOwners, (value) => {
    reactOverlayOwners = value;
  }), bindRuntimeValue(runtime2, "sheetTreeDialogs", () => sheetTreeDialogs, (value) => {
    sheetTreeDialogs = value;
  }), bindRuntimeValue(runtime2, "OPEN_OVERLAY_FOCUS_SELECTOR", () => OPEN_OVERLAY_FOCUS_SELECTOR, (value) => {
    OPEN_OVERLAY_FOCUS_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "HIDDEN_SUBTREE_SELECTOR", () => HIDDEN_SUBTREE_SELECTOR, (value) => {
    HIDDEN_SUBTREE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "overlayFocusHandoffs", () => overlayFocusHandoffs, (value) => {
    overlayFocusHandoffs = value;
  }), bindRuntimeValue(runtime2, "overlayDialogReturns", () => overlayDialogReturns, (value) => {
    overlayDialogReturns = value;
  }), bindRuntimeValue(runtime2, "FOCUS_STEAL_ALLOWED_SELECTOR", () => FOCUS_STEAL_ALLOWED_SELECTOR, (value) => {
    FOCUS_STEAL_ALLOWED_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "preventFocusStealDefault", () => preventFocusStealDefault, (value) => {
    preventFocusStealDefault = value;
  }), bindRuntimeValue(runtime2, "initializeFocusStealGuard", () => initializeFocusStealGuard, (value) => {
    initializeFocusStealGuard = value;
  }), bindRuntimeValue(runtime2, "reactOverlayFocus", () => reactOverlayFocus, (value) => {
    reactOverlayFocus = value;
  }), bindRuntimeValue(runtime2, "initializeOverlayFocus", () => initializeOverlayFocus, (value) => {
    initializeOverlayFocus = value;
  }), bindRuntimeValue(runtime2, "OVERLAY_ATTRIBUTE", () => OVERLAY_ATTRIBUTE, (value) => {
    OVERLAY_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "OPEN_OVERLAY_SELECTOR_VQ5", () => OPEN_OVERLAY_SELECTOR_VQ5, (value) => {
    OPEN_OVERLAY_SELECTOR_VQ5 = value;
  }), bindRuntimeValue(runtime2, "initializeOverlaySelector", () => initializeOverlaySelector, (value) => {
    initializeOverlaySelector = value;
  }), bindRuntimeValue(runtime2, "createOverlayStack", () => createOverlayStack), bindRuntimeValue(runtime2, "useRegisterInnerOverlay", () => useRegisterInnerOverlay), bindRuntimeValue(runtime2, "isDocumentCurrentTarget", () => isDocumentCurrentTarget), bindRuntimeValue(runtime2, "interceptEscapeForInnerOverlay", () => interceptEscapeForInnerOverlay), bindRuntimeValue(runtime2, "reactOverlayStack", () => reactOverlayStack, (value) => {
    reactOverlayStack = value;
  }), bindRuntimeValue(runtime2, "overlayStackContext", () => overlayStackContext, (value) => {
    overlayStackContext = value;
  }), bindRuntimeValue(runtime2, "DOCUMENT_NODE_TYPE", () => DOCUMENT_NODE_TYPE, (value) => {
    DOCUMENT_NODE_TYPE = value;
  }), bindRuntimeValue(runtime2, "initializeOverlayStack", () => initializeOverlayStack, (value) => {
    initializeOverlayStack = value;
  }), bindRuntimeValue(runtime2, "useMenuOverlayRegistration", () => useMenuOverlayRegistration), bindRuntimeValue(runtime2, "reactMenuOverlayRegistration", () => reactMenuOverlayRegistration, (value) => {
    reactMenuOverlayRegistration = value;
  }), bindRuntimeValue(runtime2, "menuOverlayAttributes", () => menuOverlayAttributes, (value) => {
    menuOverlayAttributes = value;
  }), bindRuntimeValue(runtime2, "initializeMenuOverlayRegistration", () => initializeMenuOverlayRegistration, (value) => {
    initializeMenuOverlayRegistration = value;
  }), bindRuntimeValue(runtime2, "reactContextMenuPopup", () => reactContextMenuPopup, (value) => {
    reactContextMenuPopup = value;
  }), bindRuntimeValue(runtime2, "jsxContextMenuPopup", () => jsxContextMenuPopup, (value) => {
    jsxContextMenuPopup = value;
  }), bindRuntimeValue(runtime2, "contextMenuPopupClasses", () => contextMenuPopupClasses, (value) => {
    contextMenuPopupClasses = value;
  }), bindRuntimeValue(runtime2, "ContextMenuPopupFrame", () => ContextMenuPopupFrame, (value) => {
    ContextMenuPopupFrame = value;
  }), bindRuntimeValue(runtime2, "initializeContextMenuPopup", () => initializeContextMenuPopup, (value) => {
    initializeContextMenuPopup = value;
  }), bindRuntimeValue(runtime2, "calculateScrollbarThickness", () => calculateScrollbarThickness), bindRuntimeValue(runtime2, "isScrollbarPointerPosition", () => isScrollbarPointerPosition), bindRuntimeValue(runtime2, "useClickToFocus", () => useClickToFocus), bindRuntimeValue(runtime2, "reactClickToFocus", () => reactClickToFocus, (value) => {
    reactClickToFocus = value;
  }), bindRuntimeValue(runtime2, "INTERACTIVE_CLICK_TARGET_SELECTOR", () => INTERACTIVE_CLICK_TARGET_SELECTOR, (value) => {
    INTERACTIVE_CLICK_TARGET_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "initializeClickToFocus", () => initializeClickToFocus, (value) => {
    initializeClickToFocus = value;
  }), bindRuntimeValue(runtime2, "shouldAllowPopupPointerFocus", () => shouldAllowPopupPointerFocus), bindRuntimeValue(runtime2, "closestWithinElement", () => closestWithinElement), bindRuntimeValue(runtime2, "FORM_POINTER_FOCUS_SELECTOR", () => FORM_POINTER_FOCUS_SELECTOR, (value) => {
    FORM_POINTER_FOCUS_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "SELECT_ELEMENT_SELECTOR", () => SELECT_ELEMENT_SELECTOR, (value) => {
    SELECT_ELEMENT_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "DRAGGABLE_ELEMENT_SELECTOR", () => DRAGGABLE_ELEMENT_SELECTOR, (value) => {
    DRAGGABLE_ELEMENT_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "initializePopupPointerFocus", () => initializePopupPointerFocus, (value) => {
    initializePopupPointerFocus = value;
  }), bindRuntimeValue(runtime2, "usePassiveOpenState", () => usePassiveOpenState), bindRuntimeValue(runtime2, "createPassiveOpenState", () => createPassiveOpenState), bindRuntimeValue(runtime2, "classifyOpenInputType", () => classifyOpenInputType), bindRuntimeValue(runtime2, "declinesInitialFocus", () => declinesInitialFocus), bindRuntimeValue(runtime2, "getDocumentIfAvailable", () => getDocumentIfAvailable), bindRuntimeValue(runtime2, "resolvePassiveFinalFocus", () => resolvePassiveFinalFocus), bindRuntimeValue(runtime2, "getFocusedElement", () => getFocusedElement), bindRuntimeValue(runtime2, "elementIsWithin", () => elementIsWithin), bindRuntimeValue(runtime2, "restorePassiveOverlayFocus", () => restorePassiveOverlayFocus), bindRuntimeValue(runtime2, "usePassiveOpenContext", () => usePassiveOpenContext), bindRuntimeValue(runtime2, "useMenuPassiveFocusProps", () => useMenuPassiveFocusProps), bindRuntimeValue(runtime2, "PassiveOpenGate", () => PassiveOpenGate), bindRuntimeValue(runtime2, "PassiveOpenKeyboardBridge", () => PassiveOpenKeyboardBridge), bindRuntimeValue(runtime2, "reactPassiveOpen", () => reactPassiveOpen, (value) => {
    reactPassiveOpen = value;
  }), bindRuntimeValue(runtime2, "jsxPassiveOpen", () => jsxPassiveOpen, (value) => {
    jsxPassiveOpen = value;
  }), bindRuntimeValue(runtime2, "reactDomPassiveOpen", () => reactDomPassiveOpen, (value) => {
    reactDomPassiveOpen = value;
  }), bindRuntimeValue(runtime2, "PASSIVE_HOVER_OPEN_REASON", () => PASSIVE_HOVER_OPEN_REASON, (value) => {
    PASSIVE_HOVER_OPEN_REASON = value;
  }), bindRuntimeValue(runtime2, "PASSIVE_FOCUS_OUT_REASON", () => PASSIVE_FOCUS_OUT_REASON, (value) => {
    PASSIVE_FOCUS_OUT_REASON = value;
  }), bindRuntimeValue(runtime2, "passiveOpenStateContext", () => passiveOpenStateContext, (value) => {
    passiveOpenStateContext = value;
  }), bindRuntimeValue(runtime2, "passiveFocusDeclinedContext", () => passiveFocusDeclinedContext, (value) => {
    passiveFocusDeclinedContext = value;
  }), bindRuntimeValue(runtime2, "passiveDeclinedFocusProps", () => passiveDeclinedFocusProps, (value) => {
    passiveDeclinedFocusProps = value;
  }), bindRuntimeValue(runtime2, "passiveDefaultFocusProps", () => passiveDefaultFocusProps, (value) => {
    passiveDefaultFocusProps = value;
  }), bindRuntimeValue(runtime2, "passiveOpenEngagementKeys", () => passiveOpenEngagementKeys, (value) => {
    passiveOpenEngagementKeys = value;
  }), bindRuntimeValue(runtime2, "passiveOpenModifierKeys", () => passiveOpenModifierKeys, (value) => {
    passiveOpenModifierKeys = value;
  }), bindRuntimeValue(runtime2, "subscribePassiveOpenNoop", () => subscribePassiveOpenNoop, (value) => {
    subscribePassiveOpenNoop = value;
  }), bindRuntimeValue(runtime2, "getPassiveOffSnapshot", () => getPassiveOffSnapshot, (value) => {
    getPassiveOffSnapshot = value;
  }), bindRuntimeValue(runtime2, "unchangedPopupProps", () => unchangedPopupProps, (value) => {
    unchangedPopupProps = value;
  }), bindRuntimeValue(runtime2, "initializePassiveOpen", () => initializePassiveOpen, (value) => {
    initializePassiveOpen = value;
  }), bindRuntimeValue(runtime2, "menuItemVariants", () => menuItemVariants, (value) => {
    menuItemVariants = value;
  }), bindRuntimeValue(runtime2, "menuItemDescriptionPaddingClass", () => menuItemDescriptionPaddingClass, (value) => {
    menuItemDescriptionPaddingClass = value;
  }), bindRuntimeValue(runtime2, "initializeMenuItemVariants", () => initializeMenuItemVariants, (value) => {
    initializeMenuItemVariants = value;
  }), bindRuntimeValue(runtime2, "isCanceledOpenWithinTrigger", () => isCanceledOpenWithinTrigger), bindRuntimeValue(runtime2, "useTrackedMenuTrigger", () => useTrackedMenuTrigger), bindRuntimeValue(runtime2, "useMenuOpenerRef", () => useMenuOpenerRef), bindRuntimeValue(runtime2, "useMenuOwnerRef", () => useMenuOwnerRef), bindRuntimeValue(runtime2, "reactMenuOpener", () => reactMenuOpener, (value) => {
    reactMenuOpener = value;
  }), bindRuntimeValue(runtime2, "menuOpenerRefContext", () => menuOpenerRefContext, (value) => {
    menuOpenerRefContext = value;
  }), bindRuntimeValue(runtime2, "MenuOpenerProvider", () => MenuOpenerProvider, (value) => {
    MenuOpenerProvider = value;
  }), bindRuntimeValue(runtime2, "initializeMenuOpener", () => initializeMenuOpener, (value) => {
    initializeMenuOpener = value;
  }), bindRuntimeValue(runtime2, "reactMenuPopupElement", () => reactMenuPopupElement, (value) => {
    reactMenuPopupElement = value;
  }), bindRuntimeValue(runtime2, "jsxMenuPopupElement", () => jsxMenuPopupElement, (value) => {
    jsxMenuPopupElement = value;
  }), bindRuntimeValue(runtime2, "MenuPopupElement", () => MenuPopupElement, (value) => {
    MenuPopupElement = value;
  }), bindRuntimeValue(runtime2, "initializeMenuPopupElement", () => initializeMenuPopupElement, (value) => {
    initializeMenuPopupElement = value;
  }), bindRuntimeValue(runtime2, "readPopupPlacement", () => readPopupPlacement), bindRuntimeValue(runtime2, "arePopupPlacementsEqual", () => arePopupPlacementsEqual), bindRuntimeValue(runtime2, "placementNeedsBottomHold", () => placementNeedsBottomHold), bindRuntimeValue(runtime2, "useStablePopupPlacement", () => useStablePopupPlacement), bindRuntimeValue(runtime2, "reactStablePopupPlacement", () => reactStablePopupPlacement, (value) => {
    reactStablePopupPlacement = value;
  }), bindRuntimeValue(runtime2, "heldPositionerClasses", () => heldPositionerClasses, (value) => {
    heldPositionerClasses = value;
  }), bindRuntimeValue(runtime2, "heldPopupClasses", () => heldPopupClasses, (value) => {
    heldPopupClasses = value;
  }), bindRuntimeValue(runtime2, "POPUP_PLACEMENT_SETTLE_FRAMES", () => POPUP_PLACEMENT_SETTLE_FRAMES, (value) => {
    POPUP_PLACEMENT_SETTLE_FRAMES = value;
  }), bindRuntimeValue(runtime2, "initializeStablePopupPlacement", () => initializeStablePopupPlacement, (value) => {
    initializeStablePopupPlacement = value;
  }), bindRuntimeValue(runtime2, "resolvePlatformWindow", () => resolvePlatformWindow), bindRuntimeValue(runtime2, "matchesWindowMediaQuery", () => matchesWindowMediaQuery), bindRuntimeValue(runtime2, "useCoarseOrHoverlessPointer", () => useCoarseOrHoverlessPointer), bindRuntimeValue(runtime2, "usesImmediateModalRelease", () => usesImmediateModalRelease), bindRuntimeValue(runtime2, "subscribeDeviceMediaQueries", () => subscribeDeviceMediaQueries), bindRuntimeValue(runtime2, "COARSE_OR_HOVERLESS_QUERY", () => COARSE_OR_HOVERLESS_QUERY, (value) => {
    COARSE_OR_HOVERLESS_QUERY = value;
  }), bindRuntimeValue(runtime2, "MOBILE_WIDTH_QUERY", () => MOBILE_WIDTH_QUERY, (value) => {
    MOBILE_WIDTH_QUERY = value;
  }), bindRuntimeValue(runtime2, "TOUCH_DEVICE_QUERY", () => TOUCH_DEVICE_QUERY, (value) => {
    TOUCH_DEVICE_QUERY = value;
  }), bindRuntimeValue(runtime2, "ELECTRON_USER_AGENT_TOKEN", () => ELECTRON_USER_AGENT_TOKEN, (value) => {
    ELECTRON_USER_AGENT_TOKEN = value;
  }), bindRuntimeValue(runtime2, "initializeModalReleasePlatform", () => initializeModalReleasePlatform, (value) => {
    initializeModalReleasePlatform = value;
  }), bindRuntimeValue(runtime2, "makeOutsidePortalInert", () => makeOutsidePortalInert), bindRuntimeValue(runtime2, "useModalPortalInert", () => useModalPortalInert), bindRuntimeValue(runtime2, "canDelayModalInertRelease", () => canDelayModalInertRelease), bindRuntimeValue(runtime2, "releaseInertAfterPaint", () => releaseInertAfterPaint), bindRuntimeValue(runtime2, "findOverlayPortalContainer", () => findOverlayPortalContainer), bindRuntimeValue(runtime2, "preventModalTabNavigation", () => preventModalTabNavigation), bindRuntimeValue(runtime2, "reactModalPortalInert", () => reactModalPortalInert, (value) => {
    reactModalPortalInert = value;
  }), bindRuntimeValue(runtime2, "inertExcludedTags", () => inertExcludedTags, (value) => {
    inertExcludedTags = value;
  }), bindRuntimeValue(runtime2, "MODAL_INERT_LIVE_REGION_SELECTOR", () => MODAL_INERT_LIVE_REGION_SELECTOR, (value) => {
    MODAL_INERT_LIVE_REGION_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "modalInertRefCounts", () => modalInertRefCounts, (value) => {
    modalInertRefCounts = value;
  }), bindRuntimeValue(runtime2, "initializeModalPortalInert", () => initializeModalPortalInert, (value) => {
    initializeModalPortalInert = value;
  }), bindRuntimeValue(runtime2, "coverParentMenuSheet", () => coverParentMenuSheet), bindRuntimeValue(runtime2, "uncoverParentMenuSheet", () => uncoverParentMenuSheet), bindRuntimeValue(runtime2, "getSheetInertReleaseTiming", () => getSheetInertReleaseTiming), bindRuntimeValue(runtime2, "MenuSheetTitleBar", () => MenuSheetTitleBar), bindRuntimeValue(runtime2, "MenuSheetCloseButton", () => MenuSheetCloseButton), bindRuntimeValue(runtime2, "reactMenuSheetPopup", () => reactMenuSheetPopup, (value) => {
    reactMenuSheetPopup = value;
  }), bindRuntimeValue(runtime2, "jsxMenuSheetPopup", () => jsxMenuSheetPopup, (value) => {
    jsxMenuSheetPopup = value;
  }), bindRuntimeValue(runtime2, "coveredMenuSheetOwners", () => coveredMenuSheetOwners, (value) => {
    coveredMenuSheetOwners = value;
  }), bindRuntimeValue(runtime2, "MenuSheetPopup", () => MenuSheetPopup, (value) => {
    MenuSheetPopup = value;
  }), bindRuntimeValue(runtime2, "initializeMenuSheetPopup", () => initializeMenuSheetPopup, (value) => {
    initializeMenuSheetPopup = value;
  }), bindRuntimeValue(runtime2, "PopoverSheetBackdrop", () => PopoverSheetBackdrop), bindRuntimeValue(runtime2, "PopoverSheetBody", () => PopoverSheetBody), bindRuntimeValue(runtime2, "jsxPopoverSheetBody", () => jsxPopoverSheetBody, (value) => {
    jsxPopoverSheetBody = value;
  }), bindRuntimeValue(runtime2, "initializePopoverSheetBody", () => initializePopoverSheetBody, (value) => {
    initializePopoverSheetBody = value;
  }), bindRuntimeValue(runtime2, "ContextMenuSheetBackdrop", () => ContextMenuSheetBackdrop), bindRuntimeValue(runtime2, "jsxContextMenuSheetBackdrop", () => jsxContextMenuSheetBackdrop, (value) => {
    jsxContextMenuSheetBackdrop = value;
  }), bindRuntimeValue(runtime2, "initializeContextMenuSheetBackdrop", () => initializeContextMenuSheetBackdrop, (value) => {
    initializeContextMenuSheetBackdrop = value;
  }), bindRuntimeValue(runtime2, "mobileSheetExports", () => mobileSheetExports, (value) => {
    mobileSheetExports = value;
  }), bindRuntimeValue(runtime2, "initializeMobileSheetExports", () => initializeMobileSheetExports, (value) => {
    initializeMobileSheetExports = value;
  }), bindRuntimeValue(runtime2, "subscribeSheetImplementation", () => subscribeSheetImplementation), bindRuntimeValue(runtime2, "loadSheetImplementation", () => loadSheetImplementation), bindRuntimeValue(runtime2, "preloadSheetImplementation", () => preloadSheetImplementation), bindRuntimeValue(runtime2, "isSheetImplementationLoaded", () => isSheetImplementationLoaded), bindRuntimeValue(runtime2, "useSheetImplementationLoaded", () => useSheetImplementationLoaded), bindRuntimeValue(runtime2, "useSheetImplementationFailed", () => useSheetImplementationFailed), bindRuntimeValue(runtime2, "useLoadedSheetImplementation", () => useLoadedSheetImplementation), bindRuntimeValue(runtime2, "reactSheetImplementation", () => reactSheetImplementation, (value) => {
    reactSheetImplementation = value;
  }), bindRuntimeValue(runtime2, "loadedSheetImplementation", () => loadedSheetImplementation, (value) => {
    loadedSheetImplementation = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationFailed", () => sheetImplementationFailed, (value) => {
    sheetImplementationFailed = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationRequests", () => sheetImplementationRequests, (value) => {
    sheetImplementationRequests = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationGeneration", () => sheetImplementationGeneration, (value) => {
    sheetImplementationGeneration = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationPromise", () => sheetImplementationPromise, (value) => {
    sheetImplementationPromise = value;
  }), bindRuntimeValue(runtime2, "sheetImplementationSubscribers", () => sheetImplementationSubscribers, (value) => {
    sheetImplementationSubscribers = value;
  }), bindRuntimeValue(runtime2, "getSheetImplementationSnapshot", () => getSheetImplementationSnapshot, (value) => {
    getSheetImplementationSnapshot = value;
  }), bindRuntimeValue(runtime2, "getSheetImplementationLoadedSnapshot", () => getSheetImplementationLoadedSnapshot, (value) => {
    getSheetImplementationLoadedSnapshot = value;
  }), bindRuntimeValue(runtime2, "getSheetImplementationFailedSnapshot", () => getSheetImplementationFailedSnapshot, (value) => {
    getSheetImplementationFailedSnapshot = value;
  }), bindRuntimeValue(runtime2, "getNullSheetImplementationSnapshot", () => getNullSheetImplementationSnapshot, (value) => {
    getNullSheetImplementationSnapshot = value;
  }), bindRuntimeValue(runtime2, "getFalseSheetImplementationSnapshot", () => getFalseSheetImplementationSnapshot, (value) => {
    getFalseSheetImplementationSnapshot = value;
  }), bindRuntimeValue(runtime2, "initializeSheetImplementation", () => initializeSheetImplementation, (value) => {
    initializeSheetImplementation = value;
  }), bindRuntimeValue(runtime2, "usePreloadSheetsForCoarsePointer", () => usePreloadSheetsForCoarsePointer), bindRuntimeValue(runtime2, "reactPreloadSheets", () => reactPreloadSheets, (value) => {
    reactPreloadSheets = value;
  }), bindRuntimeValue(runtime2, "initializePreloadSheets", () => initializePreloadSheets, (value) => {
    initializePreloadSheets = value;
  }), bindRuntimeValue(runtime2, "detectCdsPlatform", () => detectCdsPlatform), bindRuntimeValue(runtime2, "desktopPlatformUserAgentPattern", () => desktopPlatformUserAgentPattern, (value) => {
    desktopPlatformUserAgentPattern = value;
  }), bindRuntimeValue(runtime2, "initializeCdsPlatform", () => initializeCdsPlatform, (value) => {
    initializeCdsPlatform = value;
  }), bindRuntimeValue(runtime2, "reportLinkSanitizationDebug", () => reportLinkSanitizationDebug), bindRuntimeValue(runtime2, "truncateLinkDebugValue", () => truncateLinkDebugValue), bindRuntimeValue(runtime2, "MAX_LINK_DEBUG_WARNINGS", () => MAX_LINK_DEBUG_WARNINGS, (value) => {
    MAX_LINK_DEBUG_WARNINGS = value;
  }), bindRuntimeValue(runtime2, "MAX_LINK_DEBUG_LENGTH", () => MAX_LINK_DEBUG_LENGTH, (value) => {
    MAX_LINK_DEBUG_LENGTH = value;
  }), bindRuntimeValue(runtime2, "reportedLinkWarnings", () => reportedLinkWarnings, (value) => {
    reportedLinkWarnings = value;
  }), bindRuntimeValue(runtime2, "linkWarningLimitReached", () => linkWarningLimitReached, (value) => {
    linkWarningLimitReached = value;
  }), bindRuntimeValue(runtime2, "initializeLinkWarnings", () => initializeLinkWarnings, (value) => {
    initializeLinkWarnings = value;
  }), bindRuntimeValue(runtime2, "normalizeHrefWhitespace", () => normalizeHrefWhitespace), bindRuntimeValue(runtime2, "isSanitizedHrefFallback", () => isSanitizedHrefFallback), bindRuntimeValue(runtime2, "linkWhitespacePattern", () => linkWhitespacePattern, (value) => {
    linkWhitespacePattern = value;
  }), bindRuntimeValue(runtime2, "initializeHrefWhitespace", () => initializeHrefWhitespace, (value) => {
    initializeHrefWhitespace = value;
  }), bindRuntimeValue(runtime2, "opensInSeparateBrowsingContext", () => opensInSeparateBrowsingContext), bindRuntimeValue(runtime2, "normalizeLinkRel", () => normalizeLinkRel), bindRuntimeValue(runtime2, "existingBrowsingContextNames", () => existingBrowsingContextNames, (value) => {
    existingBrowsingContextNames = value;
  }), bindRuntimeValue(runtime2, "unsafeLinkRelTokenPattern", () => unsafeLinkRelTokenPattern, (value) => {
    unsafeLinkRelTokenPattern = value;
  }), bindRuntimeValue(runtime2, "initializeLinkTargets", () => initializeLinkTargets, (value) => {
    initializeLinkTargets = value;
  }), bindRuntimeValue(runtime2, "useCdsRouter", () => useCdsRouter), bindRuntimeValue(runtime2, "sanitizeHref", () => sanitizeHref), bindRuntimeValue(runtime2, "rejectUnsafeHref", () => rejectUnsafeHref), bindRuntimeValue(runtime2, "validateRelativeHref", () => validateRelativeHref), bindRuntimeValue(runtime2, "hasUnsafeRelativePath", () => hasUnsafeRelativePath), bindRuntimeValue(runtime2, "getHrefPathBeforeQuery", () => getHrefPathBeforeQuery), bindRuntimeValue(runtime2, "isAllowedEditorHref", () => isAllowedEditorHref), bindRuntimeValue(runtime2, "isAllowedAndroidIntentHref", () => isAllowedAndroidIntentHref), bindRuntimeValue(runtime2, "classifyHrefOrigin", () => classifyHrefOrigin), bindRuntimeValue(runtime2, "isOriginStableHref", () => isOriginStableHref), bindRuntimeValue(runtime2, "getSeparateContextRel", () => getSeparateContextRel), bindRuntimeValue(runtime2, "getAutomaticLinkRel", () => getAutomaticLinkRel), bindRuntimeValue(runtime2, "isSameOriginHref", () => isSameOriginHref), bindRuntimeValue(runtime2, "shouldHandleLinkWithRouter", () => shouldHandleLinkWithRouter), bindRuntimeValue(runtime2, "normalizeRouterHref", () => normalizeRouterHref), bindRuntimeValue(runtime2, "isModifiedLinkClick", () => isModifiedLinkClick), bindRuntimeValue(runtime2, "pickLinkEventProps", () => pickLinkEventProps), bindRuntimeValue(runtime2, "omitLinkEventProps", () => omitLinkEventProps), bindRuntimeValue(runtime2, "composeLinkEventHandlers", () => composeLinkEventHandlers), bindRuntimeValue(runtime2, "useCdsLink", () => useCdsLink), bindRuntimeValue(runtime2, "reactCdsLink", () => reactCdsLink, (value) => {
    reactCdsLink = value;
  }), bindRuntimeValue(runtime2, "cdsRouterContext", () => cdsRouterContext, (value) => {
    cdsRouterContext = value;
  }), bindRuntimeValue(runtime2, "forbiddenHrefControlCharacterPattern", () => forbiddenHrefControlCharacterPattern, (value) => {
    forbiddenHrefControlCharacterPattern = value;
  }), bindRuntimeValue(runtime2, "leadingHrefWhitespacePattern", () => leadingHrefWhitespacePattern, (value) => {
    leadingHrefWhitespacePattern = value;
  }), bindRuntimeValue(runtime2, "networkPathHrefPattern", () => networkPathHrefPattern, (value) => {
    networkPathHrefPattern = value;
  }), bindRuntimeValue(runtime2, "rootRelativeHrefPattern", () => rootRelativeHrefPattern, (value) => {
    rootRelativeHrefPattern = value;
  }), bindRuntimeValue(runtime2, "unrootedHrefPattern", () => unrootedHrefPattern, (value) => {
    unrootedHrefPattern = value;
  }), bindRuntimeValue(runtime2, "relativePathDotSegmentPattern", () => relativePathDotSegmentPattern, (value) => {
    relativePathDotSegmentPattern = value;
  }), bindRuntimeValue(runtime2, "dotSegmentPattern", () => dotSegmentPattern, (value) => {
    dotSegmentPattern = value;
  }), bindRuntimeValue(runtime2, "encodedOrBackslashPathPattern", () => encodedOrBackslashPathPattern, (value) => {
    encodedOrBackslashPathPattern = value;
  }), bindRuntimeValue(runtime2, "allowedHrefSchemePattern", () => allowedHrefSchemePattern, (value) => {
    allowedHrefSchemePattern = value;
  }), bindRuntimeValue(runtime2, "androidIntentHrefPattern", () => androidIntentHrefPattern, (value) => {
    androidIntentHrefPattern = value;
  }), bindRuntimeValue(runtime2, "editorHrefSchemePattern", () => editorHrefSchemePattern, (value) => {
    editorHrefSchemePattern = value;
  }), bindRuntimeValue(runtime2, "allowedEditorHrefPattern", () => allowedEditorHrefPattern, (value) => {
    allowedEditorHrefPattern = value;
  }), bindRuntimeValue(runtime2, "allowedIntentPropertyNames", () => allowedIntentPropertyNames, (value) => {
    allowedIntentPropertyNames = value;
  }), bindRuntimeValue(runtime2, "absoluteHrefPattern", () => absoluteHrefPattern, (value) => {
    absoluteHrefPattern = value;
  }), bindRuntimeValue(runtime2, "trustedFirstPartyDomains", () => trustedFirstPartyDomains, (value) => {
    trustedFirstPartyDomains = value;
  }), bindRuntimeValue(runtime2, "trustedAndroidIntentPackages", () => trustedAndroidIntentPackages, (value) => {
    trustedAndroidIntentPackages = value;
  }), bindRuntimeValue(runtime2, "HTTPS_RELATIVE_HREF_BASE", () => HTTPS_RELATIVE_HREF_BASE, (value) => {
    HTTPS_RELATIVE_HREF_BASE = value;
  }), bindRuntimeValue(runtime2, "HTTP_RELATIVE_HREF_BASE", () => HTTP_RELATIVE_HREF_BASE, (value) => {
    HTTP_RELATIVE_HREF_BASE = value;
  }), bindRuntimeValue(runtime2, "linkEventPropNames", () => linkEventPropNames, (value) => {
    linkEventPropNames = value;
  }), bindRuntimeValue(runtime2, "linkPrefetchEventKinds", () => linkPrefetchEventKinds, (value) => {
    linkPrefetchEventKinds = value;
  }), bindRuntimeValue(runtime2, "linkPrefetchEventNames", () => linkPrefetchEventNames, (value) => {
    linkPrefetchEventNames = value;
  }), bindRuntimeValue(runtime2, "initializeCdsLink", () => initializeCdsLink, (value) => {
    initializeCdsLink = value;
  }), bindRuntimeValue(runtime2, "getElementWindow", () => getElementWindow), bindRuntimeValue(runtime2, "elementHasUnavailableWindow", () => elementHasUnavailableWindow), bindRuntimeValue(runtime2, "getConnectedElementWindow", () => getConnectedElementWindow), bindRuntimeValue(runtime2, "scheduleElementTimeout", () => scheduleElementTimeout), bindRuntimeValue(runtime2, "hasCdsHtmlFontSizing", () => hasCdsHtmlFontSizing), bindRuntimeValue(runtime2, "migrateCdsHtmlFontSizing", () => migrateCdsHtmlFontSizing), bindRuntimeValue(runtime2, "getControlSizeAttributes", () => getControlSizeAttributes), bindRuntimeValue(runtime2, "getDensitySizeIndex", () => getDensitySizeIndex), bindRuntimeValue(runtime2, "createColorModeStore", () => createColorModeStore), bindRuntimeValue(runtime2, "usePageBackground", () => usePageBackground), bindRuntimeValue(runtime2, "useDensity", () => useDensity), bindRuntimeValue(runtime2, "useResolvedColorMode", () => useResolvedColorMode), bindRuntimeValue(runtime2, "useColorMode", () => useColorMode), bindRuntimeValue(runtime2, "usePlatform", () => usePlatform), bindRuntimeValue(runtime2, "useFont", () => useFont), bindRuntimeValue(runtime2, "useMonospaceFont", () => useMonospaceFont), bindRuntimeValue(runtime2, "getMonospaceOverrideStyle", () => getMonospaceOverrideStyle), bindRuntimeValue(runtime2, "useSurfaceBackground", () => useSurfaceBackground), bindRuntimeValue(runtime2, "getSurfaceBackgroundStyle", () => getSurfaceBackgroundStyle), bindRuntimeValue(runtime2, "isTintedFillSurface", () => isTintedFillSurface), bindRuntimeValue(runtime2, "sanitizeCssBackground", () => sanitizeCssBackground), bindRuntimeValue(runtime2, "isSurfaceToken", () => isSurfaceToken), bindRuntimeValue(runtime2, "useCdsConfig", () => useCdsConfig), bindRuntimeValue(runtime2, "useRootElement", () => useRootElement), bindRuntimeValue(runtime2, "usePortalContainer", () => usePortalContainer), bindRuntimeValue(runtime2, "useRootWindow", () => useRootWindow), bindRuntimeValue(runtime2, "CdsRoot", () => CdsRoot), bindRuntimeValue(runtime2, "reactCdsRoot", () => reactCdsRoot, (value) => {
    reactCdsRoot = value;
  }), bindRuntimeValue(runtime2, "jsxCdsRoot", () => jsxCdsRoot, (value) => {
    jsxCdsRoot = value;
  }), bindRuntimeValue(runtime2, "subscribePlatformNoop", () => subscribePlatformNoop, (value) => {
    subscribePlatformNoop = value;
  }), bindRuntimeValue(runtime2, "getWebPlatformSnapshot", () => getWebPlatformSnapshot, (value) => {
    getWebPlatformSnapshot = value;
  }), bindRuntimeValue(runtime2, "getCoarsePointerServerSnapshot", () => getCoarsePointerServerSnapshot, (value) => {
    getCoarsePointerServerSnapshot = value;
  }), bindRuntimeValue(runtime2, "subscribeRootCoarsePointer", () => subscribeRootCoarsePointer, (value) => {
    subscribeRootCoarsePointer = value;
  }), bindRuntimeValue(runtime2, "hasMigratedHtmlFontSizing", () => hasMigratedHtmlFontSizing, (value) => {
    hasMigratedHtmlFontSizing = value;
  }), bindRuntimeValue(runtime2, "densitySizeIndices", () => densitySizeIndices, (value) => {
    densitySizeIndices = value;
  }), bindRuntimeValue(runtime2, "controlSizeOffsets", () => controlSizeOffsets, (value) => {
    controlSizeOffsets = value;
  }), bindRuntimeValue(runtime2, "densityContext", () => densityContext, (value) => {
    densityContext = value;
  }), bindRuntimeValue(runtime2, "portalDensityContext", () => portalDensityContext, (value) => {
    portalDensityContext = value;
  }), bindRuntimeValue(runtime2, "colorModeStoreContext", () => colorModeStoreContext, (value) => {
    colorModeStoreContext = value;
  }), bindRuntimeValue(runtime2, "defaultColorModeStore", () => defaultColorModeStore, (value) => {
    defaultColorModeStore = value;
  }), bindRuntimeValue(runtime2, "DARK_COLOR_SCHEME_QUERY", () => DARK_COLOR_SCHEME_QUERY, (value) => {
    DARK_COLOR_SCHEME_QUERY = value;
  }), bindRuntimeValue(runtime2, "normalizeColorMode", () => normalizeColorMode, (value) => {
    normalizeColorMode = value;
  }), bindRuntimeValue(runtime2, "platformContext", () => platformContext, (value) => {
    platformContext = value;
  }), bindRuntimeValue(runtime2, "fontContext", () => fontContext, (value) => {
    fontContext = value;
  }), bindRuntimeValue(runtime2, "monospaceFontContext", () => monospaceFontContext, (value) => {
    monospaceFontContext = value;
  }), bindRuntimeValue(runtime2, "pageBackgroundContext", () => pageBackgroundContext, (value) => {
    pageBackgroundContext = value;
  }), bindRuntimeValue(runtime2, "naturalImageTilesContext", () => naturalImageTilesContext, (value) => {
    naturalImageTilesContext = value;
  }), bindRuntimeValue(runtime2, "densityOverrideContext", () => densityOverrideContext, (value) => {
    densityOverrideContext = value;
  }), bindRuntimeValue(runtime2, "surfaceBackgroundContext", () => surfaceBackgroundContext, (value) => {
    surfaceBackgroundContext = value;
  }), bindRuntimeValue(runtime2, "localeContext", () => localeContext, (value) => {
    localeContext = value;
  }), bindRuntimeValue(runtime2, "rootElementContext", () => rootElementContext, (value) => {
    rootElementContext = value;
  }), bindRuntimeValue(runtime2, "rootPortalContainerContext", () => rootPortalContainerContext, (value) => {
    rootPortalContainerContext = value;
  }), bindRuntimeValue(runtime2, "isPortalRootContext", () => isPortalRootContext, (value) => {
    isPortalRootContext = value;
  }), bindRuntimeValue(runtime2, "opaqueTintOverrides", () => opaqueTintOverrides, (value) => {
    opaqueTintOverrides = value;
  }), bindRuntimeValue(runtime2, "surfaceTokenNames", () => surfaceTokenNames, (value) => {
    surfaceTokenNames = value;
  }), bindRuntimeValue(runtime2, "initializeCdsRoot", () => initializeCdsRoot, (value) => {
    initializeCdsRoot = value;
  }), () => {
    MAX_OVERLAY_OWNER_DEPTH = 8, initializeOverlayOwners = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), reactOverlayOwners = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), overlayOwnerResolvers = /* @__PURE__ */ new WeakMap(), sheetTreeDialogs = /* @__PURE__ */ new WeakMap();
    }), initializeOverlayFocus = (0, runtime2.initializeOnce)(() => {
      initializeCdsRoot(), (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeTextEntrySelector)(), initializeOverlaySelector(), (0, runtime2.initializeSafeBlur)(), initializeOverlayOwners(), reactOverlayFocus = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), OPEN_OVERLAY_FOCUS_SELECTOR = `[${OVERLAY_ATTRIBUTE}][data-open]`, overlayFocusHandoffs = /* @__PURE__ */ new WeakMap(), overlayDialogReturns = /* @__PURE__ */ new WeakMap();
    }), HIDDEN_SUBTREE_SELECTOR = '[aria-hidden="true"], [inert]', preventFocusStealDefault = (event) => {
      (0, runtime2.asElement)(event.target)?.closest(FOCUS_STEAL_ALLOWED_SELECTOR) || event.preventDefault();
    }, initializeFocusStealGuard = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeTextEntrySelector)(), FOCUS_STEAL_ALLOWED_SELECTOR = `${runtime2.TEXT_ENTRY_SELECTOR},a[href]`;
    }), OVERLAY_ATTRIBUTE = "data-cds-overlay", initializeOverlaySelector = (0, runtime2.initializeOnce)(() => {
      OPEN_OVERLAY_SELECTOR_VQ5 = `[${OVERLAY_ATTRIBUTE}][data-open]`;
    }), DOCUMENT_NODE_TYPE = 9, initializeOverlayStack = (0, runtime2.initializeOnce)(() => {
      reactOverlayStack = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), overlayStackContext = reactOverlayStack.createContext(null);
    }), initializeMenuOverlayRegistration = (0, runtime2.initializeOnce)(() => {
      initializeOverlaySelector(), (0, runtime2.initializeMenuContexts)(), initializeOverlayStack(), reactMenuOverlayRegistration = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), menuOverlayAttributes = {
        [OVERLAY_ATTRIBUTE]: ""
      };
    }), initializeContextMenuPopup = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeCollisionPadding)(), (0, runtime2.initializeSurfaces)(), (0, runtime2.initializeAdaptiveSheets)(), (0, runtime2.initializeKeyboardContextMenuFocus)(), initializeOverlayFocus(), initializeMenuOverlayRegistration(), (0, runtime2.initializeMenuScrollContent)(), initializeFocusStealGuard(), (0, runtime2.initializeNpmDependency)(), reactContextMenuPopup = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxContextMenuPopup = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), contextMenuPopupClasses = (0, runtime2.cn)(`cds-reset draggable-none group/menu-popup relative flex flex-col min-w-[128px] max-w-[320px] max-h-[var(--available-height)] ${(0, runtime2.getSurfaceClasses)("popover")} text-body font-normal text-primary outline-none focus-visible:outline-hidden`, "rounded-[calc(var(--cds-radius)+var(--cds-menu-gutter,calc(0.25rem*var(--cds-rem-scale,1))))]"), ContextMenuPopupFrame = reactContextMenuPopup.forwardRef(({ anchor, side: side2, align: align2, sideOffset, collisionPadding, finalFocus, className, children, onContextMenu, "data-cds": dataCds, ...props }, options) => {
        let { finalFocus: value, popupRef: value2 } = useOverlayFocusReturn({
          registerOpenerReturn: finalFocus == null
        });
        (0, runtime2.useKeyboardContextMenuInitialFocus)(value2);
        let value3 = (0, runtime2.useDefaultOverlayLayer)("contextmenu"), { elementRef: value4, overlayAttrs: value5 } = useMenuOverlayRegistration(), value6 = (0, runtime2.useMergedRefs)(options, value2, value4);
        return jsxContextMenuPopup.jsx(runtime2.ResetSheetContexts, {
          children: jsxContextMenuPopup.jsx(runtime2.PortalRoot, {
            ...value3.portalProps,
            surface: runtime2.elevationSurfaceNames.popover,
            companionModalCatcher: !0,
            closeOnActivityHide: !0,
            children: jsxContextMenuPopup.jsx(runtime2.CollisionPaddingProvider, {
              override: collisionPadding,
              provideInherit: !0,
              children: (input) => jsxContextMenuPopup.jsx(runtime2.layerBaseContext.Provider, {
                value: value3.base,
                children: jsxContextMenuPopup.jsx(runtime2.baseContextMenu.Positioner, {
                  style: value3.style,
                  anchor,
                  side: side2,
                  align: align2,
                  sideOffset,
                  collisionPadding: input,
                  children: jsxContextMenuPopup.jsx(runtime2.baseContextMenu.Popup, {
                    "data-cds": dataCds,
                    ...value5,
                    ref: value6,
                    finalFocus: finalFocus ?? value,
                    ...props,
                    className: (0, runtime2.cn)(contextMenuPopupClasses, className),
                    // A right click inside the menu must not move focus out of it.
                    onContextMenu: preventFocusStealing(onContextMenu),
                    children: jsxContextMenuPopup.jsx(runtime2.MenuScrollContent, {
                      children
                    })
                  })
                })
              })
            })
          })
        });
      }), ContextMenuPopupFrame.displayName = "ContextMenuPopupFrame";
    }), initializeClickToFocus = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeTextEntrySelector)(), (0, runtime2.initializeEventCallbacks)(), reactClickToFocus = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), INTERACTIVE_CLICK_TARGET_SELECTOR = `button,a[href],label,[role="button"],select,[tabindex]:not([tabindex="-1"]),${runtime2.TEXT_ENTRY_SELECTOR}`;
    }), FORM_POINTER_FOCUS_SELECTOR = 'input[type="range"], select, input[readonly], textarea[readonly]', SELECT_ELEMENT_SELECTOR = "select", DRAGGABLE_ELEMENT_SELECTOR = '[draggable="true"]', initializePopupPointerFocus = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)(), initializeClickToFocus(), (0, runtime2.initializeVisualKeyboard)();
    }), PASSIVE_HOVER_OPEN_REASON = "trigger-hover", PASSIVE_FOCUS_OUT_REASON = "focus-out", subscribePassiveOpenNoop = () => () => {
    }, getPassiveOffSnapshot = () => "off", unchangedPopupProps = (input) => input, initializePassiveOpen = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeSafeBlur)(), initializePopupPointerFocus(), reactPassiveOpen = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxPassiveOpen = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactDomPassiveOpen = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), passiveOpenStateContext = reactPassiveOpen.createContext(null), passiveFocusDeclinedContext = reactPassiveOpen.createContext(!1), passiveDeclinedFocusProps = {
        tabIndex: void 0
      }, passiveDefaultFocusProps = {}, passiveOpenEngagementKeys = /* @__PURE__ */ new Set([
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End"
      ]), PassiveOpenGate.displayName = "PassiveOpenGate", passiveOpenModifierKeys = /* @__PURE__ */ new Set([
        "Shift",
        "Control",
        "Alt",
        "Meta",
        "AltGraph",
        "CapsLock",
        "NumLock",
        "ScrollLock",
        "Fn",
        "FnLock",
        "Hyper",
        "Super",
        "Symbol",
        "SymbolLock"
      ]);
    }), menuItemDescriptionPaddingClass = "pb-[calc((var(--cds-h-control)-var(--cds-font-size-body)-var(--cds-leading-footnote)+var(--cds-font-size-footnote))/2)]", initializeMenuItemVariants = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeNpmDependency)(), menuItemVariants = (0, runtime2.cva)("cds-reset flex w-full items-center gap-xs compact:px-2 comfortable:px-2.5 py-[calc((var(--cds-h-control)-var(--cds-leading-body))/2)] rounded text-body font-normal font-control [--cds-shortcut-cap-ink:var(--cds-text-muted)] select-none outline-none focus-visible:outline-hidden data-[disabled]:opacity-disabled data-[disabled]:pointer-events-none data-[disabled]:focus-visible:shadow-focus", {
        variants: {
          variant: {
            default: "text-primary data-[highlighted]:bg-fill-ghost-hover",
            danger: "group/menu-danger text-danger data-[highlighted]:bg-fill-danger data-[highlighted]:text-on-danger data-[highlighted]:[--cds-shortcut-cap-ink:currentColor] stacks:data-[highlighted]:bg-danger stacks:data-[highlighted]:text-danger stacks:data-[highlighted]:[--cds-shortcut-cap-ink:var(--cds-text-muted)]"
          }
        },
        defaultVariants: {
          variant: "default"
        }
      });
    }), initializeMenuOpener = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeEventCallbacks)(), initializeOverlayOwners(), reactMenuOpener = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), menuOpenerRefContext = reactMenuOpener.createContext(void 0), MenuOpenerProvider = menuOpenerRefContext.Provider;
    }), initializeMenuPopupElement = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializeAdaptiveSheets)(), initializeOverlayFocus(), initializeMenuOverlayRegistration(), initializeMenuOpener(), initializeFocusStealGuard(), (0, runtime2.initializeNpmDependency)(), reactMenuPopupElement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxMenuPopupElement = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MenuPopupElement = reactMenuPopupElement.forwardRef(({ anchoredWithoutFinalFocus, cursorAnchored = !1, finalFocus, onContextMenu, ...props }, options) => {
        let value = reactMenuPopupElement.useContext(runtime2.sheetFrameContext)?.open ?? !0, { elementRef: value2, overlayAttrs: value3 } = useMenuOverlayRegistration(), value4 = useOverlayFocusReturn({
          open: value,
          skipRestoreOnOutsideFocus: !cursorAnchored,
          registerOpenerReturn: anchoredWithoutFinalFocus,
          triggerRef: useMenuOpenerRef()
        }), value5 = (0, runtime2.useMergedRefs)(options, value2, anchoredWithoutFinalFocus ? value4.popupRef : void 0);
        return jsxMenuPopupElement.jsx(runtime2.baseMenu.Popup, {
          ...value3,
          ref: value5,
          finalFocus: (finalFocus === void 0 || cursorAnchored && finalFocus === null) && anchoredWithoutFinalFocus ? value4.finalFocus : finalFocus,
          ...props,
          onContextMenu: cursorAnchored ? preventFocusStealing(onContextMenu) : onContextMenu
        });
      }), MenuPopupElement.displayName = "MenuPopupElement";
    }), heldPositionerClasses = "pointer-events-none", heldPopupClasses = "pointer-events-auto", POPUP_PLACEMENT_SETTLE_FRAMES = 2, initializeStablePopupPlacement = (0, runtime2.initializeOnce)(() => {
      reactStablePopupPlacement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), COARSE_OR_HOVERLESS_QUERY = "(pointer: coarse), (hover: none)", MOBILE_WIDTH_QUERY = "(width < 40rem)", TOUCH_DEVICE_QUERY = "(pointer: coarse)", ELECTRON_USER_AGENT_TOKEN = " Electron/", initializeModalReleasePlatform = () => {
    }, MODAL_INERT_LIVE_REGION_SELECTOR = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [data-cds="Toast"]', initializeModalPortalInert = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), initializeCdsRoot(), initializeModalReleasePlatform(), (0, runtime2.initializeEventCallbacks)(), (0, runtime2.initializeReducedMotion)(), reactModalPortalInert = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), inertExcludedTags = /* @__PURE__ */ new Set([
        "SCRIPT",
        "STYLE",
        "LINK",
        "TEMPLATE",
        "NOSCRIPT"
      ]), modalInertRefCounts = /* @__PURE__ */ new WeakMap();
    }), initializeMenuSheetPopup = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), initializeCdsRoot(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeAndroidCloseWatcher)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeCollisionPadding)(), (0, runtime2.initializeSurfaces)(), (0, runtime2.initializeSheetStyles)(), (0, runtime2.initializePresentationMode)(), (0, runtime2.initializeAdaptiveSheets)(), (0, runtime2.initializeSheetClassNames)(), (0, runtime2.initializeMenuContexts)(), (0, runtime2.initializeMenuScrollContent)(), initializeContextMenuPopup(), initializePassiveOpen(), initializeMenuItemVariants(), initializeMenuOpener(), initializeMenuPopupElement(), initializeStablePopupPlacement(), (0, runtime2.initializeSheetDrag)(), (0, runtime2.initializeSheetChrome)(), (0, runtime2.initializeSheetMeasurement)(), initializeModalPortalInert(), (0, runtime2.initializeNpmDependency)(), reactMenuSheetPopup = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxMenuSheetPopup = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), coveredMenuSheetOwners = /* @__PURE__ */ new WeakMap(), MenuSheetPopup = reactMenuSheetPopup.forwardRef(({ side: side2, align: align2 = "start", sideOffset, collisionPadding, collisionAvoidance, anchor, container, className, children, header, footer, maxVisibleItems, layerOffset, stableWhileOpen = !1, "data-cds": dataCds = "Menu", style, initialFocus, ...props }, options) => {
        let value = usePortalContainer(), value2 = reactMenuSheetPopup.useContext(runtime2.menuTriggerContext), value3 = reactMenuSheetPopup.useContext(runtime2.contextMenuContext) && value2 === null, value4 = (0, runtime2.useIsSheet)(), value5 = value4 && value2 !== null, value6 = reactMenuSheetPopup.useContext(runtime2.collisionPaddingContext), value7 = collisionPadding ?? value6?.collisionPadding, memo4 = reactMenuSheetPopup.useMemo(() => anchor !== void 0 || !value2 ? anchor : (0, runtime2.createMenuVirtualAnchor)(value2), [anchor, value2]), value8 = sideOffset ?? (value3 ? void 0 : value2 && anchor === void 0 ? 2 : 6), value9 = useStablePopupPlacement({
          enabled: stableWhileOpen && !value4 && !value3,
          side: side2,
          align: align2
        }), value10 = reactMenuSheetPopup.useContext(runtime2.sheetFrameContext), value11 = reactMenuSheetPopup.useContext(runtime2.submenuStateContext), ref = reactMenuSheetPopup.useRef(null), ref2 = reactMenuSheetPopup.useRef(null), callback = reactMenuSheetPopup.useCallback(() => {
          let current = ref2.current;
          current !== null && (uncoverParentMenuSheet(current, ref2), ref2.current = null);
        }, []), callback2 = reactMenuSheetPopup.useCallback((element) => {
          if (value2 === null)
            return;
          let value43 = value10 !== null ? value2.triggerRef.current?.closest(`[data-sheet-tree="${CSS.escape(value10.treeId)}"][data-presentation="sheet"]`) ?? null : null;
          value43 !== null && ref2.current !== value43 && (callback(), coverParentMenuSheet(value43, ref2), ref2.current = value43), element.contains(element.ownerDocument.activeElement) || element.focus({
            preventScroll: !0
          });
        }, [value2, callback, value10]), [value12, value13] = reactMenuSheetPopup.useState(!1), ref3 = reactMenuSheetPopup.useRef(!1), callback3 = reactMenuSheetPopup.useCallback((input) => {
          ref3.current = input, value13(input);
        }, []), [value14, value15] = reactMenuSheetPopup.useState(null), value16 = value10?.takeCloseRequest, callback4 = reactMenuSheetPopup.useCallback(() => getSheetInertReleaseTiming(value16?.() ?? null), [value16]), value17 = useModalPortalInert({
          node: value14,
          open: value4 && !value5 && (value10?.open ?? !1),
          liftOnClose: callback4
        }), value18 = (0, runtime2.useSheetState)(), value19 = reactMenuSheetPopup.useContext(runtime2.sheetParentContext), value20 = reactMenuSheetPopup.useContext(runtime2.sheetCoverContext), [value21, value22] = reactMenuSheetPopup.useState(null), callback5 = reactMenuSheetPopup.useCallback((element) => {
          if (ref.current = value4 ? element : null, value22(value4 ? element : null), value15(value4 && !value5 ? element : null), element === null) {
            value17(), callback(), callback3(!1);
            return;
          }
          if (!value4) {
            callback3(!1);
            return;
          }
          if (!value5) {
            let value43 = (0, runtime2.hasEditableSheetContent)(element);
            value43 && (element.style.minHeight = runtime2.MIN_SHEET_HEIGHT_CSS, element.style.maxHeight = runtime2.MIN_SHEET_HEIGHT_CSS), callback3(value43), value10?.pinHeight(element.getBoundingClientRect().height, (0, runtime2.sheetContentCanGrow)(element));
            return;
          }
          callback2(element), element.style.transition = "none", element.style.translate = element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl" ? "-100% 0" : "100% 0", element.getBoundingClientRect(), element.style.transition = "", element.style.translate = "";
        }, [
          value4,
          value5,
          value10,
          callback,
          callback2,
          callback3,
          value17
        ]);
        (0, runtime2.useSheetTextEntryFocus)(value21, value10), (0, runtime2.useSheetPressedState)(value21), (0, runtime2.useDismissSheetOnForeignFocus)(value21, value10, value18.covered);
        let value23 = value4 && value18.covered, value24 = value4 && value18.inert;
        (0, runtime2.useAndroidCloseWatcher)(value4 && (value5 ? value11.open : value10?.open ?? !1), value5 ? value2?.close : value10?.dismiss);
        let ref4 = reactMenuSheetPopup.useRef(!1), value25 = value10?.open ?? !1;
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          let current = ref.current, value43 = value5 && value11.open && current !== null, current2 = ref4.current;
          ref4.current = value43, value43 && !current2 ? callback2(current) : !value43 && value25 && callback();
        }, [value5, value11.open, value25, callback2, callback]);
        let ref5 = reactMenuSheetPopup.useRef(!1), [value26, value27] = reactMenuSheetPopup.useState(!1);
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          let value43 = value5 && value11.open, current = ref5.current;
          ref5.current = value43, value43 !== current && value27(!value43 && value25);
        }, [value5, value11.open, value25]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
          let current = ref.current;
          value5 && value11.open && current !== null && (0, runtime2.resetSheetDragStyle)(current);
        }, [value5, value11.open]);
        let value28 = value10?.pushLevelHeight, value29 = value10?.drag;
        reactMenuSheetPopup.useEffect(() => {
          if (!value5 || !value11.open || value21 === null || value28 === void 0)
            return;
          let defaultView = value21.ownerDocument.defaultView, value43, flag = !1, callback6 = () => {
            let value47 = defaultView?.innerHeight ?? 1 / 0, value48 = (defaultView ? (0, runtime2.getSheetAvailableHeight)(defaultView, value21) : 1 / 0) * runtime2.MAX_SHEET_HEIGHT_FRACTION, value49 = (0, runtime2.hasEditableSheetContent)(value21), value50 = (0, runtime2.measureNaturalSheetHeight)(value21);
            flag = value50 > value48;
            let value51 = value49 ? value47 * runtime2.MIN_SHEET_HEIGHT_FRACTION : Math.min(value50, value48), value52 = value49 || flag;
            value43 === void 0 ? value43 = value28(value51, value52) : value43.set(value51, value52);
          }, callback7 = () => {
            if (value45 = void 0, value29 !== void 0 && value29.get() !== null) {
              value45 = defaultView?.requestAnimationFrame(callback7);
              return;
            }
            value44.ready() && callback6();
          }, value44 = (0, runtime2.createSheetUncoverGate)(value21, () => {
            value45 === void 0 && (value45 = defaultView?.requestAnimationFrame(callback7));
          }), value45 = defaultView?.requestAnimationFrame(callback7), value46 = defaultView !== null && typeof defaultView.MutationObserver < "u" ? new defaultView.MutationObserver((input) => {
            value45 !== void 0 || value43 === void 0 || (0, runtime2.isScrollContentReplacement)(input, flag) || (value45 = defaultView.requestAnimationFrame(callback7));
          }) : null;
          return value46?.observe(value21, {
            childList: !0,
            subtree: !0
          }), () => {
            value46?.disconnect(), value44.dispose(), value45 !== void 0 && defaultView?.cancelAnimationFrame(value45), value43?.release();
          };
        }, [value5, value11.open, value21, value28, value29]);
        let value30 = value10?.repinHeight, value31 = value10?.open ?? !1;
        reactMenuSheetPopup.useEffect(() => {
          if (!value4 || value5 || !value31 || value21 === null || value30 === void 0)
            return;
          let defaultView = value21.ownerDocument.defaultView;
          if (defaultView === null || typeof defaultView.MutationObserver > "u")
            return;
          let index4 = 0, flag = !1, callback6 = () => {
            if (index4 = 0, value29 !== void 0 && value29.get() !== null) {
              index4 = defaultView.requestAnimationFrame(callback6);
              return;
            }
            if (!value43.ready())
              return;
            if ((0, runtime2.hasEditableSheetContent)(value21)) {
              ref3.current || (callback3(!0), value30(defaultView.innerHeight * runtime2.MIN_SHEET_HEIGHT_FRACTION, !0));
              return;
            }
            let value45 = (0, runtime2.getSheetAvailableHeight)(defaultView, value21) * runtime2.MAX_SHEET_HEIGHT_FRACTION, value46 = (0, runtime2.measureNaturalSheetHeight)(value21);
            flag = value46 > value45;
            let value47 = (0, runtime2.getSheetMinimumHeight)(defaultView.innerHeight, ref3.current);
            value30(Math.max(Math.min(value46, value45), value47), flag);
          }, value43 = (0, runtime2.createSheetUncoverGate)(value21, () => {
            index4 === 0 && (index4 = defaultView.requestAnimationFrame(callback6));
          }), value44 = new defaultView.MutationObserver((input) => {
            index4 !== 0 || (0, runtime2.isScrollContentReplacement)(input, flag) || (index4 = defaultView.requestAnimationFrame(callback6));
          });
          return value44.observe(value21, {
            childList: !0,
            subtree: !0
          }), () => {
            value44.disconnect(), value43.dispose(), index4 !== 0 && defaultView.cancelAnimationFrame(index4);
          };
        }, [value4, value5, value31, value21, value30, value29, callback3]);
        let value32 = value10?.height, value33 = value10?.pinHeight;
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          let current = ref.current;
          !value4 || value5 || value32 !== void 0 || current === null || ((0, runtime2.resetSheetDragStyle)(current), value33?.(current.getBoundingClientRect().height, (0, runtime2.sheetContentCanGrow)(current)));
        }, [value4, value5, value32, value33]);
        let value34 = useMenuOwnerRef(value2?.triggerRef, props.finalFocus), value35 = value3 ? props.finalFocus === void 0 || props.finalFocus === null : anchor != null && value2 === null && props.finalFocus === void 0, value36 = usePassiveOpenContext(value2 === null);
        value36.root?.declareFocusProps(initialFocus, props.finalFocus), value2 !== null && initialFocus !== void 0 && (0, runtime2.warnNestedMenuInitialFocus)();
        let state = {
          ...props,
          onKeyDown: (input) => {
            props.onKeyDown?.(input), preventModalTabNavigation(input);
          }
        }, value37 = (0, runtime2.useStableMergedRef)((input) => {
          value9.popupRef(input), callback5(input), value34(input), value36.root?.registerPopup(input);
        }, options), value38 = value4 ? (0, runtime2.getSheetPopupStyle)(value10, {
          floor: value12 ? "half" : "content",
          parentFrameHeight: value5 ? void 0 : value19?.frameHeight
        }) : void 0, value39 = value38 === void 0 ? style : typeof style == "function" ? (input) => ({
          ...style(input),
          ...value38
        }) : {
          ...style,
          ...value38
        };
        value2 !== null && layerOffset !== void 0 && (0, runtime2.warnNestedMenuLayerOffset)();
        let value40 = (0, runtime2.useOverlayLayer)(value3 ? "contextmenu" : "menu", value2 === null ? layerOffset : void 0), value41 = useRootWindow(), value42 = (0, runtime2.getSheetFrameHeight)(value10, value41, value21), treeId = value10?.treeId, trees = reactMenuSheetPopup.useMemo(() => [
          ...value19?.trees ?? [],
          ...treeId === void 0 ? [] : [treeId]
        ], [value19?.trees, treeId]), memo22 = reactMenuSheetPopup.useMemo(() => value4 && value20 !== null ? {
          depth: value18.depth,
          frameHeight: value42,
          cover: value20,
          trees
        } : null, [value4, value20, value18.depth, value42, trees]);
        return jsxMenuSheetPopup.jsx(runtime2.baseMenu.Portal, {
          container: container ?? value,
          children: jsxMenuSheetPopup.jsxs(runtime2.PortalRoot, {
            ...value40.portalProps,
            surface: runtime2.elevationSurfaceNames.popover,
            density: value4 ? runtime2.SHEET_DENSITY : void 0,
            companionModalCatcher: !value4,
            closeOnActivityHide: !0,
            children: [
              value4 && !value5 && jsxMenuSheetPopup.jsx(runtime2.baseMenu.Backdrop, {
                "data-presentation": "sheet",
                "data-sheet-scrim": value10?.treeId,
                className: value18.depth > 0 ? "draggable-none fixed inset-0 bg-transparent" : runtime2.sheetBackdropClasses
              }),
              jsxMenuSheetPopup.jsx(runtime2.CollisionPaddingProvider, {
                override: value7,
                container: container ?? value,
                provideInherit: !0,
                children: (input) => jsxMenuSheetPopup.jsx(runtime2.layerBaseContext.Provider, {
                  value: value40.base,
                  children: jsxMenuSheetPopup.jsx(runtime2.baseMenu.Positioner, {
                    ref: value9.positionerRef,
                    "data-sheet-tree": value4 ? value10?.treeId : void 0,
                    style: value4 ? {
                      ...value40.style,
                      ...(0, runtime2.getSheetPositionerStyle)(value10)
                    } : value9.held !== null ? {
                      ...value40.style,
                      ...value9.held.positionerStyle
                    } : value40.style,
                    side: value9.side,
                    align: value9.align,
                    sideOffset: value8,
                    collisionPadding: input,
                    collisionAvoidance,
                    anchor: memo4,
                    ...value4 ? runtime2.sheetPositioningOverrides : {},
                    className: value4 ? value5 ? runtime2.sheetClipClasses : value18.depth === 0 ? runtime2.sheetOverflowBackgroundClasses : void 0 : value9.held?.positionerClassName,
                    children: jsxMenuSheetPopup.jsx(PassiveOpenGate, {
                      cell: value4 ? null : value36.cell,
                      nested: value2 !== null,
                      children: (input2) => jsxMenuSheetPopup.jsx(MenuPopupElement, {
                        anchoredWithoutFinalFocus: value35,
                        cursorAnchored: value3,
                        "data-cds": dataCds,
                        "data-presentation": value4 ? "sheet" : void 0,
                        "data-sheet-tree": value4 ? value10?.treeId : void 0,
                        "data-cds-sheet-depth": value4 ? String(value18.depth) : void 0,
                        ...value23 ? {
                          [runtime2.SHEET_COVERED_ATTRIBUTE]: ""
                        } : {},
                        ...value24 ? runtime2.inertElementProps : {},
                        ...value5 && value10 !== null && !value10.open ? {
                          [runtime2.SHEET_TREE_CLOSING_ATTRIBUTE]: ""
                        } : {},
                        ...value5 && value26 && !value11.open ? {
                          [runtime2.SHEET_PEELING_ATTRIBUTE]: ""
                        } : {},
                        ...value4 ? getControlSizeAttributes("lg") : {},
                        ref: value37,
                        ...input2(value4 ? state : props),
                        style: value39,
                        className: (0, runtime2.cn)(contextMenuPopupClasses, value9.held?.popupClassName, value4 && runtime2.sheetPopupClasses, value4 && (value5 ? "bg-transparent shadow-none forced-colors:border-0 [&[data-ending-style]:not([data-cds-sheet-tree-closing])]:translate-x-full rtl:[&[data-ending-style]:not([data-cds-sheet-tree-closing])]:-translate-x-full [&[data-ending-style][data-cds-sheet-peeling]]:translate-x-full rtl:[&[data-ending-style][data-cds-sheet-peeling]]:-translate-x-full [&[data-ending-style][data-cds-sheet-tree-closing]]:translate-y-[calc(100%+1.5rem)]" : "data-[starting-style]:translate-y-[calc(100%+1.5rem)] data-[ending-style]:translate-y-[calc(100%+1.5rem)]"), value4 && "origin-top [&[data-cds-sheet-covered]:not([data-starting-style]):not([data-ending-style])]:-translate-y-3 data-[cds-sheet-covered]:scale-[0.94] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-backdrop after:opacity-0 after:transition-opacity after:duration-sheet motion-reduce:after:transition-none data-[cds-sheet-covered]:after:opacity-100", className),
                        children: value4 ? jsxMenuSheetPopup.jsxs(runtime2.sheetParentContext.Provider, {
                          value: memo22,
                          children: [
                            jsxMenuSheetPopup.jsx(runtime2.SheetHandle, {
                              drawPill: !value5
                            }),
                            jsxMenuSheetPopup.jsxs("div", {
                              className: runtime2.sheetDrillBodyClasses,
                              children: [
                                jsxMenuSheetPopup.jsxs(runtime2.MenuScrollContent, {
                                  header,
                                  headerClassName: runtime2.sheetSeparatorClasses,
                                  footer,
                                  fill: !0,
                                  children: [
                                    children,
                                    !value5 && jsxMenuSheetPopup.jsx(MenuSheetCloseButton, {})
                                  ]
                                }),
                                jsxMenuSheetPopup.jsx(MenuSheetTitleBar, {
                                  nested: value5
                                })
                              ]
                            })
                          ]
                        }) : jsxMenuSheetPopup.jsx(runtime2.MenuScrollContent, {
                          header,
                          footer,
                          maxVisibleItems,
                          children
                        })
                      })
                    })
                  })
                })
              })
            ]
          })
        });
      }), MenuSheetPopup.displayName = "MenuSheetPopup";
    }), initializePopoverSheetBody = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializePresentationMode)(), (0, runtime2.initializeAdaptiveSheets)(), (0, runtime2.initializeSheetClassNames)(), (0, runtime2.initializeNpmDependency)(), jsxPopoverSheetBody = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), initializeContextMenuSheetBackdrop = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSheetClassNames)(), (0, runtime2.initializeNpmDependency)(), jsxContextMenuSheetBackdrop = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), mobileSheetExports = {}, (0, runtime2.defineLiveExports)(mobileSheetExports, {
      SheetPopupHost: () => runtime2.SheetPopupHost,
      PopoverSheetContent: () => PopoverSheetBody,
      PopoverSheetBackdrop: () => PopoverSheetBackdrop,
      MenuSheetPopup: () => MenuSheetPopup,
      ComboboxSheetBackdrop: () => ContextMenuSheetBackdrop
    }), initializeMobileSheetExports = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSheetPopupHost)(), initializeMenuSheetPopup(), initializePopoverSheetBody(), initializeContextMenuSheetBackdrop();
    }), loadedSheetImplementation = null, sheetImplementationFailed = !1, sheetImplementationRequests = 0, sheetImplementationGeneration = 0, sheetImplementationPromise = null, getSheetImplementationSnapshot = () => loadedSheetImplementation, getSheetImplementationLoadedSnapshot = () => loadedSheetImplementation !== null, getSheetImplementationFailedSnapshot = () => sheetImplementationFailed, getNullSheetImplementationSnapshot = () => null, getFalseSheetImplementationSnapshot = () => !1, initializeSheetImplementation = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeTransitionRunner)(), reactSheetImplementation = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), sheetImplementationSubscribers = /* @__PURE__ */ new Set();
    }), initializePreloadSheets = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeMediaQueryStores)(), initializeSheetImplementation(), reactPreloadSheets = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), initializeCdsPlatform = (0, runtime2.initializeOnce)(() => {
      desktopPlatformUserAgentPattern = /\bElectron\//i;
    }), MAX_LINK_DEBUG_WARNINGS = 50, MAX_LINK_DEBUG_LENGTH = 120, linkWarningLimitReached = !1, initializeLinkWarnings = (0, runtime2.initializeOnce)(() => {
      reportedLinkWarnings = /* @__PURE__ */ new Set();
    }), initializeHrefWhitespace = (0, runtime2.initializeOnce)(() => {
      linkWhitespacePattern = /[\t\n\r]/g;
    }), initializeLinkTargets = (0, runtime2.initializeOnce)(() => {
      existingBrowsingContextNames = /* @__PURE__ */ new Set(["_self", "_parent", "_top"]), unsafeLinkRelTokenPattern = /^no(?:opener|referrer)$/i;
    }), HTTPS_RELATIVE_HREF_BASE = "https://cds-relative-href.invalid", HTTP_RELATIVE_HREF_BASE = "http://cds-relative-href.invalid", initializeCdsLink = (0, runtime2.initializeOnce)(() => {
      initializeLinkWarnings(), initializeHrefWhitespace(), initializeLinkTargets(), reactCdsLink = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), cdsRouterContext = reactCdsLink.createContext(void 0), forbiddenHrefControlCharacterPattern = /[\x00-\x1f\x7f-\x9f]/, leadingHrefWhitespacePattern = /^\s/, networkPathHrefPattern = /^[/\\]{2}/, rootRelativeHrefPattern = /^[/\\](?![/\\])/, unrootedHrefPattern = /^[^/\\]/, relativePathDotSegmentPattern = /\/(?:\.|%2e){1,2}(?:\/|$)/i, dotSegmentPattern = /^(?:\.|%2e){1,2}$/i, encodedOrBackslashPathPattern = /\\|%2e/i, allowedHrefSchemePattern = /^(?:https?|mailto|tel|slack|blob):/i, androidIntentHrefPattern = /^intent:/i, editorHrefSchemePattern = /^(?:vscode|cursor):/i, allowedEditorHrefPattern = /^vscode:\/\/settings\/[A-Za-z0-9][A-Za-z0-9_.-]*$/, allowedIntentPropertyNames = /* @__PURE__ */ new Set([
        "scheme",
        "package",
        "S.browser_fallback_url"
      ]), absoluteHrefPattern = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i, trustedFirstPartyDomains = [], trustedAndroidIntentPackages = /* @__PURE__ */ new Set(), linkEventPropNames = [
        "onClick",
        "onPointerEnter",
        "onPointerLeave",
        "onPointerDown",
        "onFocus",
        "onBlur"
      ], linkPrefetchEventKinds = {
        onPointerEnter: !0,
        onPointerLeave: !1,
        onPointerDown: !0,
        onFocus: !0,
        onBlur: !1
      }, linkPrefetchEventNames = Object.keys(linkPrefetchEventKinds);
    }), subscribePlatformNoop = () => () => {
    }, getWebPlatformSnapshot = () => "web", getCoarsePointerServerSnapshot = () => !1, subscribeRootCoarsePointer = (input) => {
      let value = (0, runtime2.subscribeCoarsePointer)(input);
      return queueMicrotask(input), value;
    }, hasMigratedHtmlFontSizing = !1, DARK_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)", normalizeColorMode = (input) => input === "dark" || input === "light" ? input : input === "auto" || input === "system" ? "system" : void 0, initializeCdsRoot = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeAccentColors)(), (0, runtime2.initializeCoarsePointerStores)(), (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeDocumentFont)(), (0, runtime2.initializeFeatureFlags)(), (0, runtime2.initializeInputDismissalTracking)(), initializePreloadSheets(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeExperimentalTheme)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), initializeCdsPlatform(), initializeCdsLink(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactCdsRoot = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxCdsRoot = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), densitySizeIndices = {
        compact: 2,
        comfortable: 4
      }, controlSizeOffsets = {
        xs: -2,
        sm: -1,
        base: 0,
        lg: 1
      }, densityContext = reactCdsRoot.createContext("comfortable"), portalDensityContext = densityContext, colorModeStoreContext = reactCdsRoot.createContext(void 0), defaultColorModeStore = {
        setElement: () => {
        },
        subscribe: () => () => {
        },
        getSnapshot: () => {
        },
        getServerSnapshot: () => {
        },
        getAttrSnapshot: () => {
        },
        getServerAttrSnapshot: () => {
        },
        getSettingSnapshot: () => {
        },
        getServerSettingSnapshot: () => {
        }
      }, platformContext = reactCdsRoot.createContext(void 0), fontContext = reactCdsRoot.createContext(void 0), monospaceFontContext = reactCdsRoot.createContext(void 0), pageBackgroundContext = reactCdsRoot.createContext(void 0), naturalImageTilesContext = reactCdsRoot.createContext(void 0), shrinkWrapMemoryContext = reactCdsRoot.createContext(void 0), densityOverrideContext = reactCdsRoot.createContext(void 0), surfaceBackgroundContext = reactCdsRoot.createContext(void 0), localeContext = reactCdsRoot.createContext(void 0), rootElementContext = reactCdsRoot.createContext(void 0), rootPortalContainerContext = reactCdsRoot.createContext(void 0), isPortalRootContext = reactCdsRoot.createContext(!1), opaqueTintOverrides = Object.fromEntries(runtime2.accentColorNames.map((input) => [
        `--cds-bg-tint-${input}`,
        `var(--cds-bg-tint-${input}-opaque)`
      ])), surfaceTokenNames = /* @__PURE__ */ new Set([
        "surface-0",
        "surface-1",
        "surface-2",
        "surface-3",
        "fill-accent"
      ]);
    });
  };
}
export {
  installUiOverlays
};
