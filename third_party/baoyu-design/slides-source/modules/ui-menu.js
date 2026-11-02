// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiMenu(runtime2) {
  var reactiK, textFieldStateContext, initializeUiMenu, reactForUiMenu, MENU_DESCRIPTION_STACKS_CLASS, MENU_ITEM_SLOT_ALIGN_CLASS, MENU_SEARCH_FOCUS_OPTIONS, TYPED_DIR_ATTRIBUTE, STRONG_RTL_PATTERN, TYPED_DIR_INPUT_TYPES, documentDirObservers, jsxForUiMenu, TextInput_oE0, TEXT_INPUT_CLEAR_CLASS, TEXT_INPUT_CLUSTER_CLASS, TEXT_INPUT_ICON_CLASS, TEXT_INPUT_CLEAR_BUTTON_CLASS, TextInput, initializeUiMenu2, reactiZ, jsxZu, reactDOMrG0, SHEET_PENDING_ATTRIBUTE, concealedPopupStyle, preventPendingSheetFocus, initializeUiMenu3, COMPOSITION_TIME_SENTINEL, lastCompositionEndTime, suppressedCompositionEvents, compositionLineBreakInputTypes, compositionSuppressionResetEvents, initializeUiMenu4, jsxsM, checkboxVisualClasses, CHECKBOX_MARK_CLASS, CheckboxMark, footnoteDescriptionClasses, initializeUiMenu5, jsxo_, initializeUiMenu6, initializeUiMenu7, reacttM, initializeUiMenu8, reacta0, jsxC0, numericShortcutPattern, MenuPopup3, MenuSheetCapablePopup, MenuItem3, MenuSubmenuTrigger3, menuGroupLabelClasses, MenuTriggerButton, MENU_PLACEHOLDER_MINIMUM_WIDTH, emptyMenuSize, HIGHLIGHTED_MENU_ITEM_SELECTOR, MenuBar, Menu, initializeUiMenu9, jsxtK, initializeUiMenu10, reactD6, jsxU7, POPOVER_SURFACE_CLASS, POPOVER_LAYOUT_INHERIT_CLASS, POPOVER_TAIL_PATH, POPOVER_TAIL_SIDE_OFFSET, POPOVER_TAIL_RING_PATH, POPOVER_TAIL_INNER_PATH, POPOVER_TAIL_FILL_CLASS, POPOVER_TAIL_CLASS, POPOVER_ARROW_SHADOW_CLASS, POPOVER_ARROW_RING_CLASS, POPOVER_TAIL_RING_CLASS, POPOVER_BODY_STYLE, popoverTailReachContext, PopoverTail, POPOVER_PADDING_CLASSES, POPOVER_PADDING_OVERFLOW_CLASS_PATTERN, POPOVER_PADDING_OVERFLOW_STYLE_PATTERN, PopoverPopupInner, PopoverPopup3, PopoverSheetCapablePopup, PopoverPopupView, popoverStateContext, popoverControlledStateContext, PopoverTrigger3, PopoverTriggerAlias, PopoverComponents, initializeUiMenu11, reactForUiMenu2, jsxForUiMenu2, CHECKBOX_CLASS, Checkbox, initializeUiMenu12, touchHoldOwnerByDocument, touchHoldDocumentByOwner, touchHoldReleasedOwners, touchHoldTargets, touchHoldTrackedTargets, TOUCH_HOLD_TARGET_OPTIONS, touchHoldListeners, initializeContextMenuTouchGuard, SUBMENU_AIM_BUFFER = 0.5, SUBMENU_AIM_MIN_SPEED = 0.1, SUBMENU_AIM_REST_MS = 40, submenuAimByMenu, initializeSubmenuAim;
  function useFieldInvalid() {
    return reactiK.useContext(textFieldStateContext)?.invalid ?? !1;
  }
  function useFieldDisabled() {
    return reactiK.useContext(textFieldStateContext)?.disabled ?? !1;
  }
  function useFieldLabelId() {
    let { labelId, controlId } = (0, runtime2.baseUseLabelableContext)();
    return labelId ?? (controlId ? `${controlId}-label` : void 0);
  }
  function useHasFieldContext() {
    return reactiK.useContext(textFieldStateContext) !== null;
  }
  function useRefocusAfterPendingSheet(input) {
    let ref = reactiZ.useRef(null), ref2 = reactiZ.useRef(input);
    return reactiZ.useEffect(() => {
      ref2.current && !input && ref.current?.focus({
        preventScroll: !0
      }), ref2.current = input;
    }, [input]), reactiZ.useCallback((input2) => {
      ref.current = input2;
    }, []);
  }
  function PendingSheetBackdrop({ kind }) {
    let value = reactiZ.useContext(runtime2.sheetFrameContext), value2 = (0, runtime2.usePortalContainer)(), value3 = (0, runtime2.useDefaultOverlayLayer)(kind);
    (0, runtime2.useAndroidCloseWatcher)(value?.open ?? !1, value?.dismiss);
    let [value4, value5] = reactiZ.useState(!1), ref = reactiZ.useRef(!1), value6 = (0, runtime2.useRootWindow)();
    reactiZ.useEffect(() => {
      if (value6 === void 0)
        return;
      let value8 = value6.requestAnimationFrame(() => {
        value5(!0);
      });
      return () => {
        value6.cancelAnimationFrame(value8);
      };
    }, [value6]);
    let value7 = value2 ?? (typeof document > "u" ? null : document.body);
    return value7 === null || value === null || !value.open ? null : reactDOMrG0.createPortal(jsxZu.jsx(runtime2.PortalRoot, {
      ...value3.portalProps,
      children: jsxZu.jsx("div", {
        role: "presentation",
        [SHEET_PENDING_ATTRIBUTE]: "",
        className: (0, runtime2.clsx)(runtime2.sheetBackdropClasses, !value4 && "opacity-0"),
        style: value3.style,
        onPointerDown: (input) => {
          ref.current = !0, preventPendingSheetFocus(input);
        },
        onPointerCancel: () => {
          ref.current = !1;
        },
        onMouseDown: preventPendingSheetFocus,
        onClick: () => {
          ref.current && (ref.current = !1, value.dismiss());
        }
      })
    }), value7);
  }
  function isAppleBrowser() {
    return typeof window > "u" ? !1 : /Apple Computer/.test(window.navigator.vendor);
  }
  function recordCompositionEnd(input) {
    lastCompositionEndTime = input;
  }
  function resetCompositionSuppression(event) {
    (event.key !== "Enter" || event.shiftKey || event.altKey || event.keyCode === 229 || event.isComposing === !0 || event.nativeEvent?.isComposing === !0) && (lastCompositionEndTime = COMPOSITION_TIME_SENTINEL);
  }
  function shouldSuppressCompositionEnter(input) {
    return input.isComposing || input.keyCode === 229 ? (lastCompositionEndTime = COMPOSITION_TIME_SENTINEL, !0) : suppressedCompositionEvents.has(input) ? !0 : isAppleBrowser() && Math.abs(input.timeStamp - lastCompositionEndTime) < 500 ? (lastCompositionEndTime = COMPOSITION_TIME_SENTINEL, input.metaKey || input.ctrlKey ? !1 : (suppressedCompositionEvents.add(input), !0)) : !1;
  }
  function suppressFollowupCompositionLineBreak(input, options, context) {
    if (!suppressedCompositionEvents.has(input))
      return;
    let value = input, callback = (event) => {
      if (event !== value) {
        for (let value2 of compositionSuppressionResetEvents)
          options.removeEventListener(value2, callback, {
            capture: !0
          });
        event.type === "beforeinput" && "inputType" in event && typeof event.inputType == "string" && compositionLineBreakInputTypes.has(event.inputType) && (event.preventDefault(), context());
      }
    };
    for (let value2 of compositionSuppressionResetEvents)
      options.addEventListener(value2, callback, {
        capture: !0
      });
  }
  function CheckboxGlyph({ indeterminate = !1 }) {
    return jsxsM.jsx(runtime2.Icon, {
      name: indeterminate ? "Minus" : "Check",
      size: "sm",
      bold: !0,
      style: {
        fontSize: "var(--cds-checkbox-glyph)"
      }
    });
  }
  function CheckboxVisual({ checked: checked5, indeterminate = !1, className }) {
    let value = checked5 || indeterminate;
    return jsxsM.jsx("span", {
      "data-checked": checked5 && !indeterminate ? "" : void 0,
      "data-indeterminate": indeterminate ? "" : void 0,
      "data-unchecked": value ? void 0 : "",
      className: (0, runtime2.cn)(checkboxVisualClasses, value && "bg-fill-accent border-transparent", className),
      children: value && jsxsM.jsx("span", {
        className: "text-on-accent",
        children: jsxsM.jsx(CheckboxGlyph, {
          indeterminate
        })
      })
    });
  }
  function MenuContextProviders(input, options, context, value = !1) {
    let value2 = jsxo_.jsx(runtime2.passiveOpenStateContext.Provider, {
      value: options,
      children: jsxo_.jsx(runtime2.menuRootIdentityContext.Provider, {
        value: context,
        children: jsxo_.jsx(runtime2.menuIsOpenContext.Provider, {
          value: null,
          children: jsxo_.jsx(runtime2.menuTriggerContext.Provider, {
            value: null,
            children: jsxo_.jsx(runtime2.submenuStateContext.Provider, {
              value: runtime2.defaultSubmenuState,
              children: jsxo_.jsx(runtime2.contextMenuContext.Provider, {
                value,
                children: value ? input : jsxo_.jsx(runtime2.TooltipImplementationProvider, {
                  children: input
                })
              })
            })
          })
        })
      })
    });
    return value ? jsxo_.jsx(runtime2.MenuOpenerProvider, {
      value: void 0,
      children: value2
    }) : value2;
  }
  function isNestedMenuEvent(input, options) {
    let value = (0, runtime2.asElement)(input)?.closest("[data-nested]") ?? null;
    if (value === null)
      return !1;
    if (options === void 0)
      return !0;
    let value2 = (0, runtime2.asElement)(value.closest("[data-sheet-tree]"));
    return value2 !== null && value2.getAttribute("data-sheet-tree") === options;
  }
  function isFocusOutEvent(input) {
    return input !== void 0 && "relatedTarget" in input && input.type === "focusout";
  }
  function shouldRefuseNestedMenuClose(input, options, context) {
    if (input)
      return !1;
    let { reason: value, event: value2 } = options;
    if (value === "outside-press")
      return isNestedMenuEvent(value2?.target, context);
    if (value === "focus-out" && isFocusOutEvent(value2)) {
      let value3 = (0, runtime2.asElement)(value2.relatedTarget), value4 = value2.relatedTarget === null || value3 !== null && (value3 === value3.ownerDocument.body || !value3.isConnected);
      return isNestedMenuEvent(value2.relatedTarget, context) || value4 && isNestedMenuEvent(value2.target, context);
    }
    return !1;
  }
  function cancelNestedMenuClose(input, options, context) {
    return shouldRefuseNestedMenuClose(input, options, context) ? (options.cancel(), !0) : !1;
  }
  function extractReactText(input) {
    if (typeof input == "string")
      return input;
    if (typeof input == "number")
      return String(input);
    if (input == null || typeof input == "boolean")
      return "";
    if (!Array.isArray(input))
      return;
    let text = "";
    for (let value of input) {
      let value2 = extractReactText(value);
      if (value2 === void 0)
        return;
      text += value2;
    }
    return text;
  }
  function unlessDefaultPrevented(handler) {
    return (event) => {
      event.nativeEvent.defaultPrevented || handler(event);
    };
  }
  function detectTextDirection(text) {
    let first = /[\p{L}\u200E\u200F\u061C]/u.exec(text)?.[0];
    if (first !== void 0)
      return first === "‏" || STRONG_RTL_PATTERN.test(first) ? "rtl" : "ltr";
  }
  function applyTypedDirection(element, applied, direction) {
    let current = element.getAttribute("dir");
    if (current !== null && current !== applied.current) {
      element.removeAttribute(TYPED_DIR_ATTRIBUTE);
      return;
    }
    direction === void 0 ? (element.removeAttribute("dir"), element.removeAttribute(TYPED_DIR_ATTRIBUTE)) : (current !== direction && element.setAttribute("dir", direction), element.localName === "textarea" && element.getAttribute(TYPED_DIR_ATTRIBUTE) !== direction && element.setAttribute(TYPED_DIR_ATTRIBUTE, direction)), applied.current = direction ?? null;
  }
  function subscribeDocumentDir(doc, listener) {
    let entry = documentDirObservers.get(doc);
    if (!entry) {
      let listeners2 = /* @__PURE__ */ new Set(), observer2 = new (doc.defaultView?.MutationObserver ?? MutationObserver)(() => listeners2.forEach((item) => item()));
      observer2.observe(doc.documentElement, {
        attributes: !0,
        attributeFilter: ["dir"]
      }), entry = { listeners: listeners2, observer: observer2 }, documentDirObservers.set(doc, entry);
    }
    entry.listeners.add(listener);
    let { listeners, observer } = entry;
    return () => {
      listeners.delete(listener), listeners.size === 0 && (observer.disconnect(), documentDirObservers.delete(doc));
    };
  }
  function subscribeDocumentDirNoop() {
    return () => {
    };
  }
  function useTypedInputDirection(ref, { value, dir, type, remountKey }) {
    let [doc, setDoc] = reactForUiMenu.useState(() => typeof document > "u" ? null : document), subscribe2 = reactForUiMenu.useCallback((listener) => doc ? subscribeDocumentDir(doc, listener) : subscribeDocumentDirNoop(), [doc]), pageRtl = reactForUiMenu.useSyncExternalStore(subscribe2, () => doc?.documentElement.dir === "rtl", () => !1), [wasPassword, setWasPassword] = reactForUiMenu.useState(type === "password"), applied = reactForUiMenu.useRef(null), controlled = value != null, eligible = (type === void 0 || TYPED_DIR_INPUT_TYPES.has(type)) && !wasPassword;
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      type === "password" && setWasPassword(!0);
    }, [type]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      setDoc(ref.current?.ownerDocument ?? null);
    }, [ref, remountKey]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      const element = ref.current;
      if (!element || dir !== void 0) {
        element?.removeAttribute(TYPED_DIR_ATTRIBUTE), applied.current = null;
        return;
      }
      let apply = (direction) => applyTypedDirection(element, applied, direction);
      if (element.ownerDocument.documentElement.dir !== "rtl" || !eligible) {
        apply(void 0);
        return;
      }
      if (controlled) {
        apply(detectTextDirection(String(value ?? "")));
        return;
      }
      let update2 = () => apply(detectTextDirection(element.value)), view = element.ownerDocument.defaultView ?? window, frame, onReset = () => {
        frame = view.requestAnimationFrame(update2);
      }, form = element.form;
      return update2(), element.addEventListener("input", update2), element.addEventListener("focus", update2), form?.addEventListener("reset", onReset), () => {
        element.removeEventListener("input", update2), element.removeEventListener("focus", update2), form?.removeEventListener("reset", onReset), frame !== void 0 && view.cancelAnimationFrame(frame);
      };
    }, [
      controlled,
      controlled && pageRtl && eligible ? value : void 0,
      dir,
      eligible,
      ref,
      remountKey,
      pageRtl
    ]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let element = ref.current;
      element && !controlled && dir === void 0 && eligible && element.ownerDocument.documentElement.dir === "rtl" && applyTypedDirection(element, applied, detectTextDirection(element.value));
    });
  }
  function useMenuDirection() {
    return (0, runtime2.baseUseDirection)();
  }
  function getDirAutoProps(dir, rtl, className, alignStart = !0) {
    return dir !== "auto" || !rtl ? { className } : alignStart ? { dir: "auto", className: `${className} rtl:text-right` } : { dir: "auto", className };
  }
  function getDescriptionLineProps(lines) {
    let count = Math.floor(lines ?? 0);
    return !Number.isFinite(count) || count < 1 ? { className: "break-words", style: void 0 } : count === 1 ? { className: "truncate py-[0.125em] -my-[0.125em]", style: void 0 } : {
      className: "line-clamp-[var(--cds-menu-description-lines)] break-words",
      style: { "--cds-menu-description-lines": String(count) }
    };
  }
  function normalizeLabelText(input) {
    return input.replace(/\s+/g, " ").trim();
  }
  function useMenuItemLabel(input, options) {
    let ref = reacttM.useRef(null), ref2 = reacttM.useRef(null), [value, value2] = reacttM.useState(), value3 = options === void 0 && normalizeLabelText(extractReactText(input) ?? "") || void 0, value4 = options === void 0 && value3 === void 0;
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      if (!value4)
        return;
      let value5 = normalizeLabelText((ref.current?.textContent ?? "").replace(/\p{Co}/gu, "")), value6 = (ref2.current?.textContent ?? "").startsWith(value5), value7 = value5 === "" || value6 && value !== value5 ? void 0 : value5;
      value7 !== value && value2(value7);
    }), {
      label: options ?? value3 ?? (value4 ? value : void 0),
      labelSpanRef: ref,
      rowRef: ref2
    };
  }
  function getShortcutNumeralClasses(input) {
    return numericShortcutPattern.test(input) ? "tabular-nums" : "";
  }
  function MenuShortcut({ keys }) {
    return jsxC0.jsx(runtime2.Shortcut, {
      keys,
      variant: "text",
      "aria-hidden": !0,
      className: (0, runtime2.cn)("pointer-coarse:hidden text-footnote", getShortcutNumeralClasses(keys))
    });
  }
  function useMenuPopupElement(input, options, context, value) {
    let { side: value2, align: value16 = "start", sideOffset: value3, collisionPadding: value4, collisionAvoidance: value5, anchor: value6, container: value7, className: value8, children: value9, header: value10, footer: value11, maxVisibleItems: value12, layerOffset: value13, stableWhileOpen: value17 = !1, "data-cds": value18 = "Menu", initialFocus: value14, ...value15 } = input, value19 = (0, runtime2.usePortalContainer)(), value20 = reacta0.useContext(runtime2.menuTriggerContext), value21 = reacta0.useContext(runtime2.contextMenuContext) && value20 === null, value22 = reacta0.useContext(runtime2.collisionPaddingContext), value23 = value4 ?? value22?.collisionPadding, memo4 = reacta0.useMemo(() => value6 !== void 0 || !value20 ? value6 : (0, runtime2.createMenuVirtualAnchor)(value20), [value6, value20]), value24 = value3 ?? (value21 ? void 0 : value20 && value6 === void 0 ? 2 : 6), value25 = (0, runtime2.useStablePopupPlacement)({
      enabled: value17 && !value21,
      side: value2,
      align: value16
    }), value26 = (0, runtime2.useMenuOwnerRef)(value20?.triggerRef, value15.finalFocus), value27 = value21 ? value15.finalFocus === void 0 || value15.finalFocus === null : value6 != null && value20 === null && value15.finalFocus === void 0, value28 = (0, runtime2.usePassiveOpenContext)(value20 === null);
    value28.root?.declareFocusProps(value14, value15.finalFocus), context && value20 !== null && value14 !== void 0 && (0, runtime2.warnNestedMenuInitialFocus)();
    let value29 = useRefocusAfterPendingSheet(value), value30 = (0, runtime2.useStableMergedRef)((input2) => {
      value25.popupRef(input2), value26(input2), value29(input2), value28.root?.registerPopup(input2);
    }, options);
    context && value20 !== null && value13 !== void 0 && (0, runtime2.warnNestedMenuLayerOffset)();
    let value31 = (0, runtime2.useOverlayLayer)(value21 ? "contextmenu" : "menu", value20 === null ? value13 : void 0);
    return jsxC0.jsx(runtime2.baseMenu.Portal, {
      container: value7 ?? value19,
      children: jsxC0.jsx(runtime2.PortalRoot, {
        ...value31.portalProps,
        style: value ? {
          ...value31.portalProps.style,
          ...concealedPopupStyle
        } : value31.portalProps.style,
        surface: runtime2.elevationSurfaceNames.popover,
        companionModalCatcher: !0,
        closeOnActivityHide: !0,
        children: jsxC0.jsx(runtime2.CollisionPaddingProvider, {
          override: value23,
          container: value7 ?? value19,
          provideInherit: !0,
          children: (input2) => jsxC0.jsx(runtime2.layerBaseContext.Provider, {
            value: value31.base,
            children: jsxC0.jsx(runtime2.baseMenu.Positioner, {
              ref: value25.positionerRef,
              className: value25.held?.positionerClassName,
              style: value25.held !== null ? {
                ...value31.style,
                ...value25.held.positionerStyle
              } : value31.style,
              side: value25.side,
              align: value25.align,
              sideOffset: value24,
              collisionPadding: input2,
              collisionAvoidance: value5,
              anchor: memo4,
              children: jsxC0.jsx(runtime2.PassiveOpenGate, {
                cell: value28.cell,
                nested: value20 !== null,
                children: (input3) => jsxC0.jsx(runtime2.MenuPopupElement, {
                  anchoredWithoutFinalFocus: value27,
                  cursorAnchored: value21,
                  "data-cds": value18,
                  ref: value30,
                  ...input3(value15),
                  className: (0, runtime2.cn)(runtime2.contextMenuPopupClasses, value25.held?.popupClassName, value8),
                  children: jsxC0.jsx(runtime2.MenuScrollContent, {
                    header: value10,
                    footer: value11,
                    maxVisibleItems: value12,
                    children: value9
                  })
                })
              })
            })
          })
        })
      })
    });
  }
  function getSubmenuSide(trigger, submenu) {
    return submenu.left >= trigger.right - 1 ? "right" : submenu.right <= trigger.left + 1 ? "left" : submenu.top >= trigger.bottom - 1 ? "bottom" : submenu.bottom <= trigger.top + 1 ? "top" : null;
  }
  function crossesRay(x, y, x1, y1, x2, y2) {
    return y1 >= y != y2 >= y && x <= (x2 - x1) * (y - y1) / (y2 - y1) + x1;
  }
  function isInsideQuad(x, y, quad) {
    let [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0, x4 = 0, y4 = 0] = quad;
    return [
      crossesRay(x, y, x1, y1, x2, y2),
      crossesRay(x, y, x2, y2, x3, y3),
      crossesRay(x, y, x3, y3, x4, y4),
      crossesRay(x, y, x4, y4, x1, y1)
    ].filter(Boolean).length % 2 === 1;
  }
  function isInsideBox(x, y, x1, y1, x2, y2) {
    return x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
  }
  function getSubmenuAimZone(startX, startY, x, y, trigger, submenu) {
    let side2 = getSubmenuSide(trigger, submenu);
    if (side2 === null || side2 === "top" && startY >= trigger.bottom - 1 || side2 === "bottom" && startY <= trigger.top + 1 || side2 === "left" && startX >= trigger.right - 1 || side2 === "right" && startX <= trigger.left + 1)
      return "release";
    let submenuWider = submenu.width > trigger.width, submenuTaller = submenu.height > trigger.height, gapLeft = (submenuWider ? trigger : submenu).left, gapRight = (submenuWider ? trigger : submenu).right, gapTop = (submenuTaller ? trigger : submenu).top, gapBottom = (submenuTaller ? trigger : submenu).bottom;
    if (side2 === "top" ? isInsideBox(x, y, gapLeft, trigger.top + 1, gapRight, submenu.bottom - 1) : side2 === "bottom" ? isInsideBox(x, y, gapLeft, submenu.top + 1, gapRight, trigger.bottom - 1) : side2 === "left" ? isInsideBox(x, y, submenu.right - 1, gapBottom, trigger.left + 1, gapTop) : isInsideBox(x, y, trigger.right - 1, gapBottom, submenu.left + 1, gapTop))
      return "wait";
    let pastMidX = startX > submenu.right - submenu.width / 2, pastMidY = startY > submenu.bottom - submenu.height / 2, quad;
    if (side2 === "top" || side2 === "bottom") {
      let spread = submenuWider ? SUBMENU_AIM_BUFFER / 2 : SUBMENU_AIM_BUFFER * 4, apexX1 = submenuWider || pastMidX ? startX + spread : startX - spread, apexX2 = submenuWider ? startX - spread : pastMidX ? startX + spread : startX - spread, nearEdge = side2 === "top" ? submenu.bottom - SUBMENU_AIM_BUFFER : submenu.top + SUBMENU_AIM_BUFFER, farEdge = side2 === "top" ? submenu.top : submenu.bottom, apexY = side2 === "top" ? startY + SUBMENU_AIM_BUFFER + 1 : startY - SUBMENU_AIM_BUFFER, leftEdge = pastMidX || submenuWider ? nearEdge : farEdge, rightEdge = pastMidX ? submenuWider ? nearEdge : farEdge : nearEdge;
      quad = [apexX1, apexY, apexX2, apexY, submenu.left, leftEdge, submenu.right, rightEdge];
    } else {
      let spread = submenuTaller ? SUBMENU_AIM_BUFFER / 2 : SUBMENU_AIM_BUFFER * 4, apexY1 = submenuTaller || pastMidY ? startY + spread : startY - spread, apexY2 = submenuTaller ? startY - spread : pastMidY ? startY + spread : startY - spread, nearEdge = side2 === "left" ? submenu.right - SUBMENU_AIM_BUFFER : submenu.left + SUBMENU_AIM_BUFFER, farEdge = side2 === "left" ? submenu.left : submenu.right, apexX = side2 === "left" ? startX + SUBMENU_AIM_BUFFER + 1 : startX - SUBMENU_AIM_BUFFER, topEdge = pastMidY || submenuTaller ? nearEdge : farEdge, bottomEdge = pastMidY ? submenuTaller ? nearEdge : farEdge : nearEdge;
      quad = side2 === "left" ? [topEdge, submenu.top, bottomEdge, submenu.bottom, apexX, apexY1, apexX, apexY2] : [apexX, apexY1, apexX, apexY2, topEdge, submenu.top, bottomEdge, submenu.bottom];
    }
    return isInsideQuad(x, y, quad) ? "rest" : "release";
  }
  function createSubmenuAim(now) {
    let menu = null, heldTrigger = null, blockedItems = [], stopTracking = null, stopPressWatch = null, cancelTracking = () => {
      stopTracking?.(), stopTracking = null;
    }, blockSiblings = (parentMenu, trigger) => {
      let items = Array.from(parentMenu.querySelectorAll('[role^="menuitem"]')).filter((item) => !item.contains(trigger) && !trigger.contains(item)), itemSet = new Set(items);
      for (let item of blockedItems)
        itemSet.has(item) || item.style.removeProperty("pointer-events");
      blockedItems = items;
      for (let item of blockedItems)
        item.style.pointerEvents = "none";
    }, release = () => {
      if (cancelTracking(), stopPressWatch?.(), stopPressWatch = null, menu && submenuAimByMenu.get(menu) === aim) {
        submenuAimByMenu.delete(menu);
        for (let item of blockedItems)
          item.style.removeProperty("pointer-events");
      }
      menu = null, heldTrigger = null, blockedItems = [];
    }, aim = {
      hold(trigger) {
        if (cancelTracking(), heldTrigger === trigger && menu) {
          blockSiblings(menu, trigger);
          return;
        }
        release();
        let parentMenu = trigger.parentElement?.closest('[role="menu"]');
        if (!parentMenu)
          return;
        submenuAimByMenu.get(parentMenu)?.release(), submenuAimByMenu.set(parentMenu, aim), menu = parentMenu, heldTrigger = trigger, blockSiblings(parentMenu, trigger);
        let doc = trigger.ownerDocument, onPointerDown = (event) => {
          (0, runtime2.isDomNode)(event.target) && trigger.contains(event.target) || release();
        };
        doc.addEventListener("pointerdown", onPointerDown, !0), stopPressWatch = () => doc.removeEventListener("pointerdown", onPointerDown, !0);
      },
      leave(event, trigger) {
        if (cancelTracking(), heldTrigger !== trigger)
          return;
        let submenuId = trigger.getAttribute("aria-controls"), submenu = submenuId ? trigger.ownerDocument.getElementById(submenuId) : null, related = event.relatedTarget;
        if (!submenu || !trigger.hasAttribute("data-popup-open") || event.pointerType !== "mouse" && event.pointerType !== "pen" || (0, runtime2.isDomNode)(related) && submenu.contains(related)) {
          release();
          return;
        }
        let { clientX: startX, clientY: startY } = event, doc = trigger.ownerDocument, view = doc.defaultView ?? window, clock = now ?? (() => view.performance.now()), last = null, restTimer, isSlowMove = (x, y) => {
          let time = clock(), slow = last !== null && time > last.time && (x - last.x) ** 2 + (y - last.y) ** 2 < ((time - last.time) * SUBMENU_AIM_MIN_SPEED) ** 2;
          return last = { x, y, time }, slow;
        }, check = (x, y, first) => {
          view.clearTimeout(restTimer);
          let zone = getSubmenuAimZone(startX, startY, x, y, trigger.getBoundingClientRect(), submenu.getBoundingClientRect());
          zone === "release" || zone === "rest" && !first && isSlowMove(x, y) ? release() : zone === "rest" && (restTimer = view.setTimeout(release, SUBMENU_AIM_REST_MS));
        }, onPointerMove = (moveEvent) => {
          if (moveEvent.pointerType !== "mouse" && moveEvent.pointerType !== "pen")
            return;
          let target = (0, runtime2.isDomNode)(moveEvent.target) ? moveEvent.target : null;
          target && submenu.contains(target) ? release() : target && trigger.contains(target) ? cancelTracking() : check(moveEvent.clientX, moveEvent.clientY, !1);
        };
        doc.addEventListener("pointermove", onPointerMove), stopTracking = () => {
          view.clearTimeout(restTimer), doc.removeEventListener("pointermove", onPointerMove);
        }, check(startX, startY, !0);
      },
      release
    };
    return aim;
  }
  function refocusParentMenu(trigger) {
    if (!trigger)
      return;
    let doc = trigger.ownerDocument;
    doc.getElementById(trigger.getAttribute("aria-controls") ?? "")?.contains(doc.activeElement) && trigger.closest('[role="menu"]')?.focus({ preventScroll: !0 });
  }
  function MenuSubmenu({ actionsRef, ...props }) {
    let [value, value2] = reacta0.useState(props.open ?? props.defaultOpen ?? !1), ref = reacta0.useRef(value), value3 = (0, runtime2.useOptionalEventCallback)(props.onOpenChange), { sheet: value4 } = (0, runtime2.useSheetState)(), value5 = reacta0.useContext(runtime2.sheetFrameContext), value6 = value5?.treeId, ref2 = reacta0.useRef(null), callback = reacta0.useCallback((input) => {
      ref2.current = input;
    }, []), [value7, value8] = reacta0.useState(null), [aim] = reacta0.useState(() => createSubmenuAim());
    reacta0.useEffect(() => () => aim.release(), [aim]);
    let callback2 = reacta0.useCallback((input, options) => {
      if (!(value4 && cancelNestedMenuClose(input, options, value6))) {
        if (value4 && !input && value5?.refusesAmbientClose(options) === !0) {
          options.cancel();
          return;
        }
        value3?.(input, options), options.isCanceled || (ref.current = input, value2(input), input ? value8(ref2.current) : options.reason === "trigger-hover" && refocusParentMenu(ref3.current));
      }
    }, [value3, value4, value5, value6]), ref3 = reacta0.useRef(null), callback3 = reacta0.useCallback((input) => {
      ref3.current = input;
    }, []), ref4 = reacta0.useRef(null);
    (0, runtime2.useForwardedOverlayActions)(ref4, actionsRef);
    let callback4 = reacta0.useCallback(() => {
      ref4.current?.close();
    }, []), value9 = reacta0.useContext(runtime2.menuIsOpenContext), value10 = reacta0.useContext(runtime2.menuRootIdentityContext), value11 = value9 ?? value10, memo4 = reacta0.useMemo(() => ({
      triggerRef: ref3,
      setTriggerNode: callback3,
      openRef: ref,
      close: callback4,
      stashLabel: callback,
      aim
    }), [callback3, callback4, callback, aim]), value12 = props.open ?? value;
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      if (ref.current = value12, value12) {
        let current = ref2.current;
        value8((input) => input === current ? input : current);
      } else
        aim.release();
    }, [value12, aim]);
    let memo22 = reacta0.useMemo(() => ({
      label: value7,
      open: value12
    }), [value7, value12]);
    return jsxC0.jsx(runtime2.menuTriggerContext.Provider, {
      value: memo4,
      children: jsxC0.jsx(runtime2.submenuStateContext.Provider, {
        value: memo22,
        children: jsxC0.jsx(runtime2.menuIsOpenContext.Provider, {
          value: value11,
          children: jsxC0.jsx(runtime2.menuRootIdentityContext.Provider, {
            value: ref4,
            children: jsxC0.jsx(runtime2.baseMenu.SubmenuRoot, {
              ...props,
              actionsRef: ref4,
              onOpenChange: callback2
            })
          })
        })
      })
    });
  }
  function MenuSeparator() {
    return jsxC0.jsx(runtime2.baseMenu.Separator, {
      className: "compact:mx-2 comfortable:mx-2.5 my-1 h-px bg-border"
    });
  }
  function MenuHeader({ children, className }) {
    let value = (0, runtime2.useIsSheet)(), value2 = reacta0.useContext(runtime2.menuTriggerContext) !== null, { label: value3 } = reacta0.useContext(runtime2.submenuStateContext), value4 = value && value2 && typeof children == "string" && typeof value3 == "string" && children.trim() === value3.trim();
    return jsxC0.jsx("div", {
      role: "presentation",
      className: (0, runtime2.cn)(menuGroupLabelClasses, value4 && "first:hidden", className),
      children
    });
  }
  function MenuGroupLabel3({ children, className }) {
    return jsxC0.jsx(runtime2.baseMenu.GroupLabel, {
      className: (0, runtime2.cn)(menuGroupLabelClasses, className),
      children
    });
  }
  function isMenuItemList(input) {
    return Array.isArray(input);
  }
  function renderMenuItems(input) {
    return isMenuItemList(input) ? input.map((event, options) => event === "separator" ? jsxC0.jsx(MenuSeparator, {}, options) : event.label === void 0 || event.label === null || event.label === "" || event.label === !1 ? null : event.items ? jsxC0.jsxs(reacta0.Fragment, {
      children: [
        event.separatorBefore && jsxC0.jsx(MenuSeparator, {}),
        jsxC0.jsxs(MenuSubmenu, {
          disabled: event.disabled,
          children: [
            jsxC0.jsx(MenuSubmenuTrigger3, {
              icon: event.icon,
              hint: event.hint,
              hintDir: event.hintDir,
              labelDir: event.labelDir,
              children: event.label
            }),
            jsxC0.jsx(MenuPopup3, {
              children: renderMenuItems(event.items)
            })
          ]
        })
      ]
    }, options) : jsxC0.jsxs(reacta0.Fragment, {
      children: [
        event.separatorBefore && jsxC0.jsx(MenuSeparator, {}),
        jsxC0.jsx(MenuItem3, {
          icon: event.icon,
          shortcut: event.shortcut,
          variant: event.variant,
          disabled: event.disabled,
          checked: event.checked,
          checkedRole: event.checkedRole,
          indicator: event.indicator,
          indeterminate: event.indeterminate,
          hint: event.hint,
          hintDir: event.hintDir,
          labelDir: event.labelDir,
          description: event.description,
          descriptionDir: event.descriptionDir,
          descriptionLines: event.descriptionLines,
          disabledReason: event.disabledReason,
          keepOpen: event.keepOpen,
          leading: event.leading,
          trailing: event.trailing,
          href: event.href,
          routerOptions: event.routerOptions,
          target: event.target,
          onClick: event.onSelect,
          children: event.label
        })
      ]
    }, options)) : input;
  }
  function getMenuCaretSize(input, options) {
    return (0, runtime2.getDensitySizeIndex)(input, options) >= 4 ? "sm" : "xs";
  }
  function MenuCaret({ size: size4 }) {
    let value = (0, runtime2.useDensity)(), value2 = (0, runtime2.useButtonGroup)(), caretSize = getMenuCaretSize(value, size4 ?? value2?.size), iconsOffset = (0, runtime2.useFeatureFlagPart)("icons") && (caretSize === "xs" ? "-me-0.5" : "-me-0.75");
    return jsxC0.jsx(runtime2.Icon, {
      name: "CaretDown",
      size: caretSize,
      "data-cds-part": "menu-caret",
      className: (0, runtime2.clsx)("shrink-0 opacity-60", iconsOffset)
    });
  }
  function MenuPopupContent({ side: side2, align: align2, sideOffset, collisionPadding, finalFocus, dataCds, items }) {
    return jsxC0.jsx(runtime2.ContextMenuPopupFrame, {
      side: side2,
      align: align2,
      sideOffset,
      collisionPadding,
      finalFocus,
      "data-cds": dataCds ?? "Menu",
      children: renderMenuItems(items)
    });
  }
  function isTouchHoldTargetPresent(owner) {
    let target = touchHoldTargets.get(owner);
    return target !== void 0 && target.isConnected && !target.closest("[data-popup-open]");
  }
  function getTouchHoldOwner(event) {
    let target = event.currentTarget, doc = target && "document" in target ? target.document : target && "ownerDocument" in target ? target.ownerDocument : void 0;
    return typeof doc == "object" && doc !== null ? touchHoldOwnerByDocument.get(doc) : void 0;
  }
  function releaseTouchHoldOnPress(event) {
    let owner = getTouchHoldOwner(event);
    owner && releaseTouchHold(owner);
  }
  function areAllTouchesLifted(event) {
    let touches = "touches" in event ? event.touches : void 0;
    return typeof touches == "object" && touches !== null && "length" in touches && touches.length === 0;
  }
  function getTouchElement(touch) {
    let target = typeof touch == "object" && touch !== null && "target" in touch ? touch.target : void 0, parent = typeof target == "object" && target !== null && "parentNode" in target ? target.parentNode : void 0;
    return (0, runtime2.asElement)(target) ?? (0, runtime2.asElement)(parent);
  }
  function didTouchEndOffTarget(event, owner) {
    let tracked = touchHoldTrackedTargets.get(owner), changed = "changedTouches" in event ? event.changedTouches : void 0;
    if (!tracked || typeof changed != "object" || changed === null || !("length" in changed) || typeof changed.length != "number" || changed.length === 0)
      return !1;
    for (let index4 = 0; index4 < changed.length; index4 += 1) {
      let element = getTouchElement(Reflect.get(changed, index4));
      if (!element || element === tracked)
        return !1;
    }
    return !0;
  }
  function handleTouchHoldEnd(event) {
    let owner = getTouchHoldOwner(event);
    if (!(!owner || !areAllTouchesLifted(event))) {
      if (didTouchEndOffTarget(event, owner)) {
        releaseTouchHold(owner);
        return;
      }
      event.cancelable && !isTouchHoldTargetPresent(owner) && event.preventDefault(), touchHoldReleasedOwners.add(owner);
    }
  }
  function swallowTouchHoldMouse(event) {
    let owner = getTouchHoldOwner(event);
    !owner || !touchHoldReleasedOwners.has(owner) || ("detail" in event && event.detail !== 0 && !isTouchHoldTargetPresent(owner) && (event.stopPropagation(), event.preventDefault()), event.type === "click" && releaseTouchHold(owner));
  }
  function trackTouchHoldTarget(owner, target) {
    let tracked = touchHoldTrackedTargets.get(owner);
    tracked !== target && (tracked?.removeEventListener("touchend", handleTouchHoldEnd, TOUCH_HOLD_TARGET_OPTIONS), target ? (touchHoldTrackedTargets.set(owner, target), target.addEventListener("touchend", handleTouchHoldEnd, TOUCH_HOLD_TARGET_OPTIONS)) : touchHoldTrackedTargets.delete(owner));
  }
  function releaseTouchHold(owner) {
    let doc = touchHoldDocumentByOwner.get(owner);
    if (doc) {
      touchHoldDocumentByOwner.delete(owner), touchHoldOwnerByDocument.delete(doc), touchHoldReleasedOwners.delete(owner), touchHoldTargets.delete(owner), trackTouchHoldTarget(owner, void 0);
      for (let [type, listener, options] of touchHoldListeners)
        doc.defaultView?.removeEventListener(type, listener, options);
    }
  }
  function startTouchHold(owner, doc, target) {
    let view = doc.defaultView;
    if (!view)
      return;
    if (touchHoldDocumentByOwner.get(owner) === doc) {
      target && trackTouchHoldTarget(owner, target);
      return;
    }
    releaseTouchHold(owner);
    let previousOwner = touchHoldOwnerByDocument.get(doc);
    previousOwner && releaseTouchHold(previousOwner), touchHoldOwnerByDocument.set(doc, owner), touchHoldDocumentByOwner.set(owner, doc);
    for (let [type, listener, options] of touchHoldListeners)
      view.addEventListener(type, listener, options);
    trackTouchHoldTarget(owner, target);
  }
  function cancelCloseDuringTouchHold(owner, details) {
    return touchHoldDocumentByOwner.has(owner) && (details?.reason === "outside-press" || details?.reason === "cancel-open") ? (details.cancel(), !0) : !1;
  }
  function handleContextMenuOpenChange(owner, open4, details, onOpenChange) {
    if (!open4 && cancelCloseDuringTouchHold(owner, details) || (onOpenChange?.(open4, details), details.isCanceled))
      return;
    if (!open4) {
      releaseTouchHold(owner);
      return;
    }
    let target = details.event.type === "touchstart" ? (0, runtime2.asElement)(details.event.target) : null;
    target && (startTouchHold(owner, target.ownerDocument, target), touchHoldDocumentByOwner.has(owner) && touchHoldTargets.set(owner, target));
  }
  function SimpleMenu(input) {
    let value = (0, runtime2.useSheetCapablePresentation)(), value2 = reacta0.useContext(runtime2.menuBarContext), value3 = (0, runtime2.useStableObjectRef)(), onOpenChange = input.onOpenChange, { onOpenChange: value4, triggerRef: value5 } = (0, runtime2.useTrackedMenuTrigger)((input2, options) => {
      input.trigger === "context-menu" ? handleContextMenuOpenChange(value3, input2, options, onOpenChange) : onOpenChange?.(input2, options), (0, runtime2.recordKeyboardContextMenuOpen)(value3, input2, options);
    }, value2), value6 = (0, runtime2.usePortalContainer)();
    return value ? jsxC0.jsx(MenuRootProviders, {
      ...input,
      holdOwner: value3
    }) : useDropdownMenu(input, value6, {
      triggerRef: value5,
      onOpenChange: value4,
      actionsRef: value3,
      contextMenuOnOpenChange: value4,
      inMenuBar: value2
    });
  }
  function MenuRootProviders(input) {
    let { open: value, sheetTitle: value2, backLabel: value3, closeLabel: value4, holdOwner } = input, onOpenChange = input.onOpenChange, memo4 = reacta0.useMemo(() => ({
      sheetTitle: value2,
      backLabel: value3,
      closeLabel: value4
    }), [value2, value3, value4]), value5 = (0, runtime2.usePortalContainer)(), value6 = reacta0.useContext(runtime2.menuBarContext), { onOpenChange: value7, triggerRef: value8 } = (0, runtime2.useTrackedMenuTrigger)(input.trigger === "context-menu" ? (open5, details) => handleContextMenuOpenChange(holdOwner, open5, details, onOpenChange) : onOpenChange, value6), value9 = (0, runtime2.useControllableOpen)({
      open: value,
      onOpenChange: value7
    }), open4 = value9.open, value10 = (0, runtime2.useAdaptiveSheet)({
      open: open4,
      onOpenChange: value9.onOpenChange,
      closable: !(value !== void 0 && input.onOpenChange === void 0),
      refuseClose: refuseInnerMenuClose
    }), value11 = useDropdownMenu(input, value5, {
      triggerRef: value8,
      onOpenChange: value10.onOpenChange,
      onOpenChangeComplete: value10.onOpenChangeComplete,
      actionsRef: value10.actionsRef,
      sheetCapable: !0,
      inMenuBar: value6
    });
    return jsxC0.jsx(runtime2.SheetContextProvider, {
      value: value10,
      children: jsxC0.jsx(runtime2.menuSheetLabelsContext.Provider, {
        value: memo4,
        children: value11
      })
    });
  }
  function useDropdownMenu(input, options, context) {
    let { items: value, side: value2, align: value3, sideOffset: value4, collisionPadding: value5, finalFocus: value6, open: value7, disabled: value8, className: value9, style: value10, "data-cds": value11 } = input;
    if (input.trigger === "context-menu")
      return value8 ? jsxC0.jsx("div", {
        "data-disabled": "",
        className: value9,
        children: input.children
      }) : context.sheetCapable ? jsxC0.jsx(runtime2.CloseOnActivityHideProvider, {
        actionsRef: context.actionsRef,
        children: jsxC0.jsx(runtime2.baseContextMenu.Root, {
          open: value7,
          onOpenChange: context.onOpenChange,
          onOpenChangeComplete: context.onOpenChangeComplete,
          actionsRef: context.actionsRef,
          children: MenuContextProviders(jsxC0.jsxs(jsxC0.Fragment, {
            children: [
              jsxC0.jsx(runtime2.baseContextMenu.Trigger, {
                className: value9,
                children: input.children
              }),
              jsxC0.jsx(MenuPopup3, {
                side: value2,
                align: value3,
                sideOffset: value4,
                collisionPadding: value5,
                finalFocus: value6,
                "data-cds": value11 ?? "Menu",
                children: renderMenuItems(value)
              })
            ]
          }), null, context.actionsRef, !0)
        })
      }) : jsxC0.jsx(runtime2.CloseOnActivityHideProvider, {
        actionsRef: context.actionsRef,
        children: jsxC0.jsxs(runtime2.baseContextMenu.Root, {
          open: value7,
          onOpenChange: context.contextMenuOnOpenChange,
          actionsRef: context.actionsRef,
          children: [
            jsxC0.jsx(runtime2.baseContextMenu.Trigger, {
              className: value9,
              children: input.children
            }),
            jsxC0.jsx(runtime2.baseContextMenu.Portal, {
              container: options,
              children: jsxC0.jsx(runtime2.menuRootIdentityContext.Provider, {
                value: context.actionsRef,
                children: jsxC0.jsx(runtime2.keyboardContextMenuEventContext.Provider, {
                  value: void 0,
                  children: jsxC0.jsx(MenuPopupContent, {
                    side: value2,
                    align: value3,
                    sideOffset: value4,
                    collisionPadding: value5,
                    finalFocus: value6,
                    dataCds: value11,
                    items: value
                  })
                })
              })
            })
          ]
        })
      });
    let value12;
    if (input.renderTrigger !== void 0)
      value12 = jsxC0.jsx(runtime2.baseMenu.Trigger, {
        disabled: value8,
        className: value9,
        style: value10,
        render: input.renderTrigger
      });
    else if (input.iconOnly) {
      let value13 = input.tooltip === !1 ? void 0 : typeof input.tooltip == "string" ? input.tooltip : input["aria-label"], value14 = jsxC0.jsx(runtime2.baseMenu.Trigger, {
        disabled: value8,
        render: jsxC0.jsx(runtime2.Button, {
          variant: input.variant,
          size: input.size,
          iconOnly: !0,
          icon: input.icon || "DotsVertical",
          "aria-label": input["aria-label"],
          pressed: input.pressed,
          tooltip: !1,
          className: value9,
          style: value10
        })
      }), value15 = value13 ? jsxC0.jsx(runtime2.Tooltip, {
        content: value13,
        children: value14
      }) : value14;
      value12 = input.disabledReason !== void 0 ? jsxC0.jsx(runtime2.DisabledReasonTooltip, {
        side: input.disabledReasonSide,
        reason: value8 ? input.disabledReason : void 0,
        children: value15
      }) : value15;
    } else
      value12 = jsxC0.jsx(runtime2.baseMenu.Trigger, {
        disabled: value8,
        render: jsxC0.jsxs(runtime2.Button, {
          variant: input.variant,
          size: input.size,
          icon: input.icon,
          iconPosition: input.iconPosition,
          "aria-label": input["aria-label"],
          className: value9,
          style: value10,
          children: [
            input.label,
            jsxC0.jsx(MenuCaret, {
              size: input.size
            })
          ]
        })
      });
    return jsxC0.jsx(runtime2.MenuOpenerProvider, {
      value: context.triggerRef,
      children: jsxC0.jsx(runtime2.CloseOnActivityHideProvider, {
        actionsRef: context.actionsRef,
        children: jsxC0.jsx(runtime2.baseMenu.Root, {
          open: value7,
          onOpenChange: context.onOpenChange,
          onOpenChangeComplete: context.onOpenChangeComplete,
          actionsRef: context.actionsRef,
          modal: context.inMenuBar ? void 0 : !0,
          children: MenuContextProviders(jsxC0.jsxs(jsxC0.Fragment, {
            children: [
              value12,
              jsxC0.jsx(MenuPopup3, {
                side: value2,
                align: value3,
                sideOffset: value4,
                collisionPadding: value5,
                finalFocus: value6,
                "data-cds": value11,
                children: renderMenuItems(value)
              })
            ]
          }), null, context.actionsRef)
        })
      })
    });
  }
  function refuseInnerMenuClose(input, options) {
    return shouldRefuseNestedMenuClose(!1, input, options);
  }
  function MenuRoot3(input) {
    let { children: value, sheetTitle: value2, backLabel: value3, closeLabel: value4, ...value5 } = input, value6 = (0, runtime2.useSheetCapablePresentation)(), value7 = reacta0.useContext(runtime2.menuBarContext), { onOpenChange: value8, triggerRef: value9 } = (0, runtime2.useTrackedMenuTrigger)(value5.onOpenChange, value7), value10 = (0, runtime2.usePassiveOpenState)(value8, value5.open, !value7), value11 = (0, runtime2.useStableObjectRef)();
    return (0, runtime2.useForwardedOverlayActions)(value11, value5.actionsRef), value6 ? jsxC0.jsx(runtime2.CloseOnActivityHideProvider, {
      actionsRef: value11,
      children: jsxC0.jsx(ControlledMenuRoot, {
        ...input,
        actionsRef: value11
      })
    }) : jsxC0.jsx(runtime2.MenuOpenerProvider, {
      value: value9,
      children: jsxC0.jsx(runtime2.CloseOnActivityHideProvider, {
        actionsRef: value11,
        children: jsxC0.jsx(runtime2.baseMenu.Root, {
          ...value5,
          modal: value7 ? void 0 : value5.modal,
          actionsRef: value11,
          onOpenChange: value10.onOpenChange,
          children: typeof value == "function" ? (input2) => MenuContextProviders(value(input2), value10.cell, value11) : MenuContextProviders(value, value10.cell, value11)
        })
      })
    });
  }
  function ControlledMenuRoot(input) {
    let { children: value, sheetTitle: value2, backLabel: value3, closeLabel: value4, ...value5 } = input, memo4 = reacta0.useMemo(() => ({
      sheetTitle: value2,
      backLabel: value3,
      closeLabel: value4
    }), [value2, value3, value4]), value6 = reacta0.useContext(runtime2.menuBarContext), { onOpenChange: value7, triggerRef: value8 } = (0, runtime2.useTrackedMenuTrigger)(input.onOpenChange, value6), value9 = (0, runtime2.usePassiveOpenState)(value7, input.open, !value6), value10 = (0, runtime2.useControllableOpen)({
      ...input,
      onOpenChange: value9.onOpenChange
    }), value11 = (0, runtime2.useValueCapturedOnOpen)(value10.open, () => value9.cell.getLevel() === "declared", !1), value12 = (0, runtime2.useAdaptiveSheet)({
      open: value10.open,
      actionsRef: input.actionsRef,
      onOpenChange: value10.onOpenChange,
      onOpenChangeComplete: input.onOpenChangeComplete,
      structurallyAnchored: value11,
      closable: !(input.open !== void 0 && input.onOpenChange === void 0),
      refuseClose: refuseInnerMenuClose
    });
    return jsxC0.jsx(runtime2.MenuOpenerProvider, {
      value: value8,
      children: jsxC0.jsx(runtime2.SheetContextProvider, {
        value: value12,
        children: jsxC0.jsx(runtime2.menuSheetLabelsContext.Provider, {
          value: memo4,
          children: jsxC0.jsx(runtime2.baseMenu.Root, {
            ...value5,
            modal: value6 ? void 0 : value12.modal ?? value5.modal,
            actionsRef: value12.actionsRef,
            onOpenChange: value12.onOpenChange,
            onOpenChangeComplete: value12.onOpenChangeComplete,
            children: typeof value == "function" ? (input2) => MenuContextProviders(value(input2), value9.cell, value12.actionsRef) : MenuContextProviders(value, value9.cell, value12.actionsRef)
          })
        })
      })
    });
  }
  function ResetQueryOnUnmount({ reset }) {
    return reacta0.useEffect(() => () => reset(), [reset]), null;
  }
  function isMenuSearchEditingKey(input) {
    let value = input.getModifierState("AltGraph");
    return (input.key.length === 1 && input.key !== " " || input.key === "Backspace" || input.key === "Delete" && !input.shiftKey) && (!input.ctrlKey || value) && !input.metaKey && (!input.altKey || value) && input.keyCode !== 229;
  }
  function MenuSearchTriggerKeyboardBridge({ inputRef, applyKey }) {
    let value = reacta0.useContext(runtime2.menuTriggerContext)?.triggerRef;
    return reacta0.useEffect(() => {
      let value2 = value?.current;
      if (!value2)
        return;
      let callback = (event) => {
        event.isComposing || !isMenuSearchEditingKey(event) || (event.preventDefault(), event.stopPropagation(), inputRef.current?.focus({
          preventScroll: !0
        }), applyKey(event.key));
      };
      return value2.addEventListener("keydown", callback, !0), () => value2.removeEventListener("keydown", callback, !0);
    }, [value, inputRef, applyKey]), null;
  }
  function useMenuSearchInputFocus(inputRef, retarget = !1) {
    let value = reacta0.useContext(runtime2.menuTriggerContext);
    reacta0.useEffect(() => {
      let trigger = value?.triggerRef.current;
      if (!value || !trigger)
        return;
      const triggerElement = trigger;
      let { openRef } = value, moves = 0, allowed = 2, track = (event) => {
        let target = (0, runtime2.asElement)(event.target);
        event instanceof KeyboardEvent && event.type === "keydown" ? allowed = event.key === "Tab" ? 0 : allowed : event.type === "pointerover" ? allowed = moves === 0 && target && triggerElement.contains(target) ? Math.min(allowed, 1) : allowed : target?.closest('[role="menu"]') && (allowed = 0);
      }, trackedEvents = retarget ? ["keydown", "pointerdown", "pointermove", "pointerover", "wheel"] : [], callback = (input) => {
        let current = inputRef.current, related = (0, runtime2.asElement)(input.relatedTarget);
        if (current && related && openRef.current && current.closest('[role="menu"]')?.contains(related)) {
          if (!retarget) {
            current.focus({
              preventScroll: !0
            });
            return;
          }
          if (moves >= allowed)
            return;
          moves += 1;
          let next = related.getAttribute("role") === "menu" ? current : related;
          queueMicrotask(() => {
            openRef.current && triggerElement.ownerDocument.activeElement === triggerElement && next.focus(MENU_SEARCH_FOCUS_OPTIONS);
          });
        }
      };
      triggerElement.addEventListener("focus", callback);
      for (let name of trackedEvents)
        triggerElement.ownerDocument.addEventListener(name, track, !0);
      return () => {
        triggerElement.removeEventListener("focus", callback);
        for (let name of trackedEvents)
          triggerElement.ownerDocument.removeEventListener(name, track, !0);
      };
    }, [value, inputRef, retarget]), reacta0.useEffect(() => {
      let view = (0, runtime2.getElementWindow)(inputRef.current ?? void 0) ?? window, callback = () => {
        let current = inputRef.current;
        if (!current || value?.openRef.current === !1)
          return;
        let ancestor = current.closest('[role="menu"]'), activeElement2 = current.ownerDocument.activeElement;
        ancestor?.contains(activeElement2) && activeElement2 !== ancestor || current.focus(retarget ? MENU_SEARCH_FOCUS_OPTIONS : {
          preventScroll: !0
        });
      };
      if (callback(), retarget && value)
        return;
      let index4 = 0, index22 = 0, callback2 = () => {
        callback(), index4 += 1, index4 < 2 && (index22 = view.requestAnimationFrame(callback2));
      };
      return index22 = view.requestAnimationFrame(callback2), () => {
        try {
          view.cancelAnimationFrame(index22);
        } catch {
        }
      };
    }, [inputRef, retarget, value]);
  }
  function MenuSearchTriggerFocusBridge({ inputRef }) {
    return useMenuSearchInputFocus(inputRef), null;
  }
  function MenuSearchablePopup({ children, searchLabel, query, onQueryChange, resetQueryOnClose = !0, onSubmitQuery, beforeSearch, onKeyDown, onFocus, stableWhileOpen = !0, ...props }) {
    let [value, value2] = reacta0.useState(""), value3 = query ?? value, value4 = (0, runtime2.useEventCallback)((input) => {
      value2(input), onQueryChange?.(input);
    }), value5 = (0, runtime2.useEventCallback)(() => {
      value3 !== "" && value4("");
    }), ref = reacta0.useRef(!1);
    reacta0.useEffect(() => {
    }, [query, onQueryChange]);
    let value6 = (0, runtime2.useIsSheet)(), value7 = (0, runtime2.useMediaQuery__U)((0, runtime2.useRootWindow)(), runtime2.COARSE_POINTER_QUERY_rG), value8 = !value6 && !value7, value9 = reacta0.useContext(runtime2.menuIsOpenContext), value10 = reacta0.useContext(runtime2.menuRootIdentityContext), value11 = value9 ?? value10, ref2 = reacta0.useRef(null), ref3 = reacta0.useRef(null), ref4 = reacta0.useRef(null);
    reacta0.useEffect(() => () => ref4.current?.(), []);
    let callback = reacta0.useCallback((input) => {
      let current = ref3.current;
      if (!current)
        return;
      let { value: value12 } = current, value13 = current.selectionStart ?? value12.length, value14 = current.selectionEnd ?? value12.length, value15 = input === "Backspace" || input === "Delete", value16 = value15 ? "" : input;
      if (value15 && value13 === value14)
        if (input === "Backspace") {
          let value19 = (value12.codePointAt(value13 - 2) ?? 0) > 65535;
          value13 = Math.max(0, value13 - (value19 ? 2 : 1));
        } else {
          let value19 = (value12.codePointAt(value14) ?? 0) > 65535;
          value14 = Math.min(value12.length, value14 + (value19 ? 2 : 1));
        }
      let value17 = value12.slice(0, value13) + value16 + value12.slice(value14), value18 = current.ownerDocument.defaultView ?? window;
      Object.getOwnPropertyDescriptor(value18.HTMLInputElement.prototype, "value")?.set?.call(current, value17), current.setSelectionRange(value13 + value16.length, value13 + value16.length), current.dispatchEvent(new Event("input", {
        bubbles: !0
      }));
    }, []), callback2 = () => {
      let current = ref2.current, value12 = current?.querySelector('[tabindex="0"]') ?? current?.querySelector('input, button, [role="radio"]');
      return value12 ? (value12.focus(), !0) : !1;
    };
    return jsxC0.jsxs(MenuPopup3, {
      ...props,
      stableWhileOpen,
      onKeyDown: (event) => {
        let current = ref3.current;
        if (!current || event.target.closest?.("input, textarea, [contenteditable]") || event.nativeEvent.isComposing || !isMenuSearchEditingKey(event)) {
          onKeyDown?.(event);
          return;
        }
        event.preventDefault(), event.stopPropagation(), event.preventBaseUIHandler(), current.focus({
          preventScroll: !0
        }), callback(event.key);
      },
      onFocus: (event) => {
        onFocus?.(event);
        let currentTarget = event.currentTarget, ownerDocument2 = currentTarget.ownerDocument;
        if (!value8 || event.target !== currentTarget || ownerDocument2.activeElement !== currentTarget)
          return;
        let value12 = (0, runtime2.asElement)(event.relatedTarget);
        if (!(value12?.hasAttribute("data-popup-open") && currentTarget.contains(value12))) {
          ref3.current?.focus({
            preventScroll: !0
          });
          return;
        }
        ref4.current?.();
        let callback3 = (event2) => {
          let value13 = (0, runtime2.asElement)(event2.target), value14 = value13?.closest('[role="menu"]'), bounds = currentTarget.getBoundingClientRect(), value15 = event2.clientX >= bounds.left && event2.clientX < bounds.right && event2.clientY >= bounds.top && event2.clientY < bounds.bottom;
          !value14 && value15 || (ref4.current?.(), !(value14 && (value14 !== currentTarget || value13?.closest('[role^="menuitem"]'))) && ownerDocument2.activeElement === currentTarget && ref3.current?.focus({
            preventScroll: !0
          }));
        };
        ownerDocument2.addEventListener("mousemove", callback3), ref4.current = () => {
          ownerDocument2.removeEventListener("mousemove", callback3), ref4.current = null;
        };
      },
      onMouseDown: (event) => {
        let target = event.target;
        (0, runtime2.isHtmlElement)(target) && target.localName === "input" || target === event.currentTarget || target.classList.contains("overflow-y-auto") && (0, runtime2.isScrollbarPointerPosition)(event.nativeEvent.offsetX, event.nativeEvent.offsetY, target) || event.preventDefault();
      },
      header: jsxC0.jsxs(jsxC0.Fragment, {
        children: [
          beforeSearch !== void 0 && jsxC0.jsx("div", {
            ref: ref2,
            role: "presentation",
            className: "px-sm pt-sm",
            onKeyDown: (event) => {
              event.key !== "Escape" && (event.stopPropagation(), event.key === "Tab" && (event.preventDefault(), ref3.current?.focus()));
            },
            children: beforeSearch
          }),
          jsxC0.jsx(TextInput, {
            ref: ref3,
            value: value3,
            onChange: (event) => value4(event.target.value),
            onCompositionEnd: (event) => recordCompositionEnd(event.nativeEvent.timeStamp),
            onKeyDown: (event) => {
              if (resetCompositionSuppression(event), event.nativeEvent.isComposing || event.keyCode === 229) {
                event.stopPropagation();
                return;
              }
              if (event.key === "Enter") {
                let value12 = value3.trim();
                if (onSubmitQuery !== void 0 && value12 !== "" && !event.repeat && !event.shiftKey && !event.altKey) {
                  let callback3 = () => {
                    onSubmitQuery(value12), value11?.current?.close?.();
                  };
                  shouldSuppressCompositionEnter(event.nativeEvent) ? suppressFollowupCompositionLineBreak(event.nativeEvent, event.currentTarget, callback3) : (event.preventDefault(), callback3());
                }
                event.stopPropagation();
                return;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                let value12 = event.currentTarget.closest('[role="menu"]')?.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])'), value13 = event.key === "ArrowDown" ? value12?.[0] : value12?.[value12.length - 1];
                value13 !== void 0 && (event.preventDefault(), event.stopPropagation(), value13.focus());
                return;
              }
              if (event.key === "Tab" && !event.shiftKey && callback2()) {
                event.preventDefault(), event.stopPropagation();
                return;
              }
              event.key === "Escape" || event.key === "Tab" || event.stopPropagation();
            },
            placeholder: searchLabel,
            "aria-label": searchLabel,
            autoComplete: "off",
            "data-1p-ignore": !0,
            autoFocus: value8,
            tabIndex: value8 ? void 0 : -1,
            className: "!border-transparent !bg-transparent !shadow-none compact:!ps-2 comfortable:!ps-2.5"
          }),
          jsxC0.jsx(runtime2.baseMenu.Separator, {
            className: "-mx-[var(--cds-menu-gutter,0.25rem)] mt-[var(--cds-menu-gutter,0.25rem)] mb-1 h-px bg-border"
          })
        ]
      }),
      children: [
        resetQueryOnClose && jsxC0.jsx(ResetQueryOnUnmount, {
          reset: value5
        }),
        value8 && jsxC0.jsx(MenuSearchTriggerFocusBridge, {
          inputRef: ref3
        }),
        jsxC0.jsx(MenuSearchTriggerKeyboardBridge, {
          inputRef: ref3,
          applyKey: callback
        }),
        children(value3.trim().toLowerCase(), value3.trim())
      ]
    });
  }
  function useFocusMenuAfterPending(input, options) {
    let ref = reacta0.useRef(options);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let value = input.current?.closest('[role="menu"]');
      if (!options || ref.current || !value?.hasAttribute("data-open"))
        return;
      let activeElement2 = value.ownerDocument.activeElement;
      (activeElement2 === null || activeElement2 === value.ownerDocument.body) && value.focus({
        preventScroll: !0
      });
    }, [input, options]), reacta0.useEffect(() => {
      let value = ref.current && !options;
      ref.current = options;
      let current = input.current;
      if (!value || !current)
        return;
      let value2 = requestAnimationFrame(() => {
        let element = current.querySelector(HIGHLIGHTED_MENU_ITEM_SELECTOR), ancestor = current.closest('[role="menu"]');
        element && ancestor && current.ownerDocument.activeElement === ancestor && element.focus({
          preventScroll: !0
        });
      });
      return () => cancelAnimationFrame(value2);
    }, [input, options]);
  }
  function MenuPendingList({ pending = !1, loading = !1, placeholderRows = 3, icon = !1, children }) {
    let ref = reacta0.useRef(null), ref2 = reacta0.useRef(emptyMenuSize);
    reacta0.useEffect(() => {
      let current = ref.current, ObserverConstructor = (0, runtime2.getResizeObserverConstructor)(current);
      if (!current || ObserverConstructor === void 0)
        return;
      let observer = (0, runtime2.createSafeResizeObserver)(ObserverConstructor, () => {
        ref2.current = {
          width: current.offsetWidth,
          height: current.offsetHeight
        };
      });
      return observer.observe(current), () => observer.disconnect();
    }, []);
    let value = pending || loading, [value2, value3] = reacta0.useState(emptyMenuSize);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = ref.current;
      if (!value || !current) {
        value3(emptyMenuSize);
        return;
      }
      value3(loading && ref2.current.height > 0 ? ref2.current : {
        width: current.offsetWidth,
        height: current.offsetHeight
      });
    }, [value, loading]);
    let value4 = value && value2.height > 0;
    return useFocusMenuAfterPending(ref, loading), jsxC0.jsx("div", {
      ref,
      "aria-busy": value || void 0,
      style: value4 ? {
        minWidth: value2.width,
        height: value2.height
      } : void 0,
      className: value4 ? "overflow-hidden" : void 0,
      children: loading ? jsxC0.jsx(runtime2.SkeletonGroup, {
        children: jsxC0.jsx(runtime2.SkeletonPrimitive.Rows, {
          icon,
          rows: value4 ? Math.ceil(value2.height / MENU_PLACEHOLDER_MINIMUM_WIDTH) : placeholderRows
        })
      }) : children
    });
  }
  function AdaptiveSheetPopupHost({ kind, children }) {
    let value = (0, runtime2.useSheetImplementation)(), { pending: value2 } = (0, runtime2.useSheetState)();
    return value !== null ? jsxtK.jsx(value.SheetPopupHost, {
      children: (input) => children(input, value)
    }) : jsxtK.jsxs(jsxtK.Fragment, {
      children: [
        children(value2 ? runtime2.concealedSheetHost : runtime2.defaultSheetHost, null),
        value2 ? jsxtK.jsx(PendingSheetBackdrop, {
          kind
        }) : null
      ]
    });
  }
  function usePopoverStyleDebug(input, options) {
    let ref = reactD6.useRef(!1);
    reactD6.useEffect(() => {
    }, [input, options]);
  }
  function isPopoverArrow(input) {
    return reactD6.isValidElement(input) && input.type === runtime2.basePopover.Arrow;
  }
  function isPopoverTail(input) {
    return reactD6.isValidElement(input) && input.type === PopoverTail;
  }
  function isPopoverArrowOrTail(input) {
    return reactD6.isValidElement(input) && (input.type === runtime2.basePopover.Arrow || input.type === PopoverTail);
  }
  function getArrowAlignOffset(data, alignOffset, arrow5, arrowSize) {
    let offset4 = typeof alignOffset == "function" ? alignOffset(data) : alignOffset ?? 0, view = arrow5?.ownerDocument.defaultView;
    if (data.align === "center" || !arrow5 || !view || !(arrow5 instanceof view.HTMLElement))
      return offset4;
    let horizontal = data.side === "top" || data.side === "bottom", measured = horizontal ? arrow5.offsetWidth : arrow5.offsetHeight;
    if (measured === 0)
      return offset4;
    let size4 = arrowSize ?? measured, anchorSize = horizontal ? data.anchor.width : data.anchor.height;
    return Math.min(offset4, anchorSize / 2 - size4 / 2 - 16);
  }
  function renderPopoverTail({ variant, reach }) {
    let paths = jsxU7.jsxs(jsxU7.Fragment, {
      children: [
        jsxU7.jsx("path", { d: POPOVER_TAIL_PATH }),
        variant === "neutral" ? jsxU7.jsxs(jsxU7.Fragment, {
          children: [
            jsxU7.jsx("path", {
              d: POPOVER_TAIL_RING_PATH,
              fill: "var(--cds-ring-color)",
              className: "forced-colors:fill-[CanvasText]"
            }),
            jsxU7.jsx("path", { d: POPOVER_TAIL_INNER_PATH })
          ]
        }) : null
      ]
    }), clipped = reach !== void 0 && reach < 10 ? Math.max(0, 2 + reach) : void 0;
    return jsxU7.jsx("svg", {
      width: "28",
      height: "12",
      viewBox: "0 0 28 12",
      className: `block overflow-visible ${variant === "accent" ? "fill-accent" : POPOVER_TAIL_FILL_CLASS}`,
      children: clipped === void 0 ? paths : jsxU7.jsx("svg", {
        width: "28",
        height: clipped,
        viewBox: `0 0 28 ${clipped}`,
        className: "overflow-hidden",
        children: paths
      })
    });
  }
  function usePopoverOverlayStack(input) {
    let [value] = reactD6.useState(runtime2.createOverlayStack);
    return {
      innerOverlays: value,
      onOpenChange: reactD6.useCallback((input2, options) => {
        (0, runtime2.interceptEscapeForInnerOverlay)(value, input2, options) || input?.(input2, options);
      }, [value, input])
    };
  }
  function resolvePopoverAnchor(input) {
    let anchor = input.anchor;
    if (anchor == null)
      return input.triggerEl;
    if (anchor instanceof Element)
      return anchor;
    if (typeof anchor == "object" && "current" in anchor) {
      let current = anchor.current;
      return current instanceof Element ? current : null;
    }
    return "virtual";
  }
  function popoverRefusesFocusOut(input) {
    if (!input.popupMounted || !input.declinesFocus)
      return !1;
    let value = resolvePopoverAnchor(input);
    return value === "virtual" ? !0 : value === null ? !1 : (0, runtime2.isEditableElement)(value) || value.querySelector('input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null || value.closest('input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null;
  }
  function PopoverRoot2({ onOpenChange, actionsRef, ...props }) {
    let value = usePopoverOverlayStack(onOpenChange), value2 = (0, runtime2.useSheetCapablePresentation)(), ref = reactD6.useRef(null);
    return (0, runtime2.useForwardedOverlayActions)(ref, actionsRef), jsxU7.jsx(popoverControlledStateContext.Provider, {
      value: value.innerOverlays,
      children: jsxU7.jsx(runtime2.CloseOnActivityHideProvider, {
        actionsRef: ref,
        children: value2 ? jsxU7.jsx(ControlledPopoverRoot, {
          ...props,
          actionsRef: ref,
          onOpenChange: value.onOpenChange,
          consumerHandlesOpenChange: onOpenChange !== void 0
        }) : jsxU7.jsx(runtime2.basePopover.Root, {
          ...props,
          actionsRef: ref,
          onOpenChange: value.onOpenChange
        })
      })
    });
  }
  function ControlledPopoverRoot({ consumerHandlesOpenChange, ...props }) {
    let value = (0, runtime2.useControllableOpen)(props), ref = reactD6.useRef({
      popupMounted: !1,
      declinesFocus: !1,
      anchor: void 0,
      triggerEl: null
    }), openerRef = reactD6.useRef(null), memo4 = reactD6.useMemo(() => ({
      update: (input) => {
        Object.assign(ref.current, input);
      },
      read: () => ref.current,
      triggerRef: openerRef
    }), []), value2 = (0, runtime2.useValueCapturedOnOpen)(value.open, () => {
      let value4 = memo4.read();
      return !value4.popupMounted || popoverRefusesFocusOut(value4);
    }, !1), value3 = (0, runtime2.useAdaptiveSheet)({
      open: value.open,
      actionsRef: props.actionsRef,
      onOpenChange: value.onOpenChange,
      onOpenChangeComplete: props.onOpenChangeComplete,
      structurallyAnchored: value2,
      closable: !(props.open !== void 0 && !consumerHandlesOpenChange)
    }), sheetOpenChange = value3.onOpenChange, recordOpenChange = reactD6.useCallback((open4, details) => {
      sheetOpenChange(open4, details), !details.isCanceled && (open4 || details.trigger !== void 0) && (openerRef.current = details.trigger ?? null);
    }, [sheetOpenChange]);
    return jsxU7.jsx(popoverStateContext.Provider, {
      value: memo4,
      children: jsxU7.jsx(runtime2.SheetContextProvider, {
        value: value3,
        children: jsxU7.jsx(runtime2.basePopover.Root, {
          ...props,
          modal: value3.modal ?? props.modal,
          actionsRef: value3.actionsRef,
          onOpenChange: recordOpenChange,
          onOpenChangeComplete: value3.onOpenChangeComplete
        })
      })
    });
  }
  return bindRuntimeValue(runtime2, "useFieldInvalid", () => useFieldInvalid), bindRuntimeValue(runtime2, "useFieldDisabled", () => useFieldDisabled), bindRuntimeValue(runtime2, "useFieldLabelId", () => useFieldLabelId), bindRuntimeValue(runtime2, "useHasFieldContext", () => useHasFieldContext), bindRuntimeValue(runtime2, "reactiK", () => reactiK, (value) => {
    reactiK = value;
  }), bindRuntimeValue(runtime2, "textFieldStateContext", () => textFieldStateContext, (value) => {
    textFieldStateContext = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu", () => initializeUiMenu, (value) => {
    initializeUiMenu = value;
  }), bindRuntimeValue(runtime2, "reactForUiMenu", () => reactForUiMenu, (value) => {
    reactForUiMenu = value;
  }), bindRuntimeValue(runtime2, "jsxForUiMenu", () => jsxForUiMenu, (value) => {
    jsxForUiMenu = value;
  }), bindRuntimeValue(runtime2, "TextInput_oE0", () => TextInput_oE0, (value) => {
    TextInput_oE0 = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_CLEAR_CLASS", () => TEXT_INPUT_CLEAR_CLASS, (value) => {
    TEXT_INPUT_CLEAR_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_CLUSTER_CLASS", () => TEXT_INPUT_CLUSTER_CLASS, (value) => {
    TEXT_INPUT_CLUSTER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_ICON_CLASS", () => TEXT_INPUT_ICON_CLASS, (value) => {
    TEXT_INPUT_ICON_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_INPUT_CLEAR_BUTTON_CLASS", () => TEXT_INPUT_CLEAR_BUTTON_CLASS, (value) => {
    TEXT_INPUT_CLEAR_BUTTON_CLASS = value;
  }), bindRuntimeValue(runtime2, "TextInput", () => TextInput, (value) => {
    TextInput = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu2", () => initializeUiMenu2, (value) => {
    initializeUiMenu2 = value;
  }), bindRuntimeValue(runtime2, "useRefocusAfterPendingSheet", () => useRefocusAfterPendingSheet), bindRuntimeValue(runtime2, "PendingSheetBackdrop", () => PendingSheetBackdrop), bindRuntimeValue(runtime2, "reactiZ", () => reactiZ, (value) => {
    reactiZ = value;
  }), bindRuntimeValue(runtime2, "jsxZu", () => jsxZu, (value) => {
    jsxZu = value;
  }), bindRuntimeValue(runtime2, "reactDOMrG0", () => reactDOMrG0, (value) => {
    reactDOMrG0 = value;
  }), bindRuntimeValue(runtime2, "SHEET_PENDING_ATTRIBUTE", () => SHEET_PENDING_ATTRIBUTE, (value) => {
    SHEET_PENDING_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "concealedPopupStyle", () => concealedPopupStyle, (value) => {
    concealedPopupStyle = value;
  }), bindRuntimeValue(runtime2, "preventPendingSheetFocus", () => preventPendingSheetFocus, (value) => {
    preventPendingSheetFocus = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu3", () => initializeUiMenu3, (value) => {
    initializeUiMenu3 = value;
  }), bindRuntimeValue(runtime2, "isAppleBrowser", () => isAppleBrowser), bindRuntimeValue(runtime2, "recordCompositionEnd", () => recordCompositionEnd), bindRuntimeValue(runtime2, "resetCompositionSuppression", () => resetCompositionSuppression), bindRuntimeValue(runtime2, "shouldSuppressCompositionEnter", () => shouldSuppressCompositionEnter), bindRuntimeValue(runtime2, "suppressFollowupCompositionLineBreak", () => suppressFollowupCompositionLineBreak), bindRuntimeValue(runtime2, "COMPOSITION_TIME_SENTINEL", () => COMPOSITION_TIME_SENTINEL, (value) => {
    COMPOSITION_TIME_SENTINEL = value;
  }), bindRuntimeValue(runtime2, "lastCompositionEndTime", () => lastCompositionEndTime, (value) => {
    lastCompositionEndTime = value;
  }), bindRuntimeValue(runtime2, "suppressedCompositionEvents", () => suppressedCompositionEvents, (value) => {
    suppressedCompositionEvents = value;
  }), bindRuntimeValue(runtime2, "compositionLineBreakInputTypes", () => compositionLineBreakInputTypes, (value) => {
    compositionLineBreakInputTypes = value;
  }), bindRuntimeValue(runtime2, "compositionSuppressionResetEvents", () => compositionSuppressionResetEvents, (value) => {
    compositionSuppressionResetEvents = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu4", () => initializeUiMenu4, (value) => {
    initializeUiMenu4 = value;
  }), bindRuntimeValue(runtime2, "CheckboxGlyph", () => CheckboxGlyph), bindRuntimeValue(runtime2, "CheckboxVisual", () => CheckboxVisual), bindRuntimeValue(runtime2, "footnoteDescriptionClasses", () => footnoteDescriptionClasses, (value) => {
    footnoteDescriptionClasses = value;
  }), bindRuntimeValue(runtime2, "jsxsM", () => jsxsM, (value) => {
    jsxsM = value;
  }), bindRuntimeValue(runtime2, "checkboxVisualClasses", () => checkboxVisualClasses, (value) => {
    checkboxVisualClasses = value;
  }), bindRuntimeValue(runtime2, "CHECKBOX_MARK_CLASS", () => CHECKBOX_MARK_CLASS, (value) => {
    CHECKBOX_MARK_CLASS = value;
  }), bindRuntimeValue(runtime2, "CheckboxMark", () => CheckboxMark, (value) => {
    CheckboxMark = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu5", () => initializeUiMenu5, (value) => {
    initializeUiMenu5 = value;
  }), bindRuntimeValue(runtime2, "MenuContextProviders", () => MenuContextProviders), bindRuntimeValue(runtime2, "jsxo_", () => jsxo_, (value) => {
    jsxo_ = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu6", () => initializeUiMenu6, (value) => {
    initializeUiMenu6 = value;
  }), bindRuntimeValue(runtime2, "isNestedMenuEvent", () => isNestedMenuEvent), bindRuntimeValue(runtime2, "isFocusOutEvent", () => isFocusOutEvent), bindRuntimeValue(runtime2, "shouldRefuseNestedMenuClose", () => shouldRefuseNestedMenuClose), bindRuntimeValue(runtime2, "cancelNestedMenuClose", () => cancelNestedMenuClose), bindRuntimeValue(runtime2, "initializeUiMenu7", () => initializeUiMenu7, (value) => {
    initializeUiMenu7 = value;
  }), bindRuntimeValue(runtime2, "extractReactText", () => extractReactText), bindRuntimeValue(runtime2, "normalizeLabelText", () => normalizeLabelText), bindRuntimeValue(runtime2, "useMenuItemLabel", () => useMenuItemLabel), bindRuntimeValue(runtime2, "reacttM", () => reacttM, (value) => {
    reacttM = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu8", () => initializeUiMenu8, (value) => {
    initializeUiMenu8 = value;
  }), bindRuntimeValue(runtime2, "getShortcutNumeralClasses", () => getShortcutNumeralClasses), bindRuntimeValue(runtime2, "MenuShortcut", () => MenuShortcut), bindRuntimeValue(runtime2, "useMenuPopupElement", () => useMenuPopupElement), bindRuntimeValue(runtime2, "MenuSubmenu", () => MenuSubmenu), bindRuntimeValue(runtime2, "MenuSeparator", () => MenuSeparator), bindRuntimeValue(runtime2, "MenuHeader", () => MenuHeader), bindRuntimeValue(runtime2, "MenuGroupLabel", () => MenuGroupLabel3), bindRuntimeValue(runtime2, "isMenuItemList", () => isMenuItemList), bindRuntimeValue(runtime2, "renderMenuItems", () => renderMenuItems), bindRuntimeValue(runtime2, "getMenuCaretSize", () => getMenuCaretSize), bindRuntimeValue(runtime2, "MenuCaret", () => MenuCaret), bindRuntimeValue(runtime2, "MenuPopupContent", () => MenuPopupContent), bindRuntimeValue(runtime2, "SimpleMenu", () => SimpleMenu), bindRuntimeValue(runtime2, "MenuRootProviders", () => MenuRootProviders), bindRuntimeValue(runtime2, "useDropdownMenu", () => useDropdownMenu), bindRuntimeValue(runtime2, "refuseInnerMenuClose", () => refuseInnerMenuClose), bindRuntimeValue(runtime2, "MenuRoot", () => MenuRoot3), bindRuntimeValue(runtime2, "ControlledMenuRoot", () => ControlledMenuRoot), bindRuntimeValue(runtime2, "ResetQueryOnUnmount", () => ResetQueryOnUnmount), bindRuntimeValue(runtime2, "isMenuSearchEditingKey", () => isMenuSearchEditingKey), bindRuntimeValue(runtime2, "MenuSearchTriggerKeyboardBridge", () => MenuSearchTriggerKeyboardBridge), bindRuntimeValue(runtime2, "MenuSearchTriggerFocusBridge", () => MenuSearchTriggerFocusBridge), bindRuntimeValue(runtime2, "MenuSearchablePopup", () => MenuSearchablePopup), bindRuntimeValue(runtime2, "useFocusMenuAfterPending", () => useFocusMenuAfterPending), bindRuntimeValue(runtime2, "MenuPendingList", () => MenuPendingList), bindRuntimeValue(runtime2, "reacta0", () => reacta0, (value) => {
    reacta0 = value;
  }), bindRuntimeValue(runtime2, "jsxC0", () => jsxC0, (value) => {
    jsxC0 = value;
  }), bindRuntimeValue(runtime2, "numericShortcutPattern", () => numericShortcutPattern, (value) => {
    numericShortcutPattern = value;
  }), bindRuntimeValue(runtime2, "MenuPopup", () => MenuPopup3, (value) => {
    MenuPopup3 = value;
  }), bindRuntimeValue(runtime2, "MenuSheetCapablePopup", () => MenuSheetCapablePopup, (value) => {
    MenuSheetCapablePopup = value;
  }), bindRuntimeValue(runtime2, "MenuItem", () => MenuItem3, (value) => {
    MenuItem3 = value;
  }), bindRuntimeValue(runtime2, "MenuSubmenuTrigger", () => MenuSubmenuTrigger3, (value) => {
    MenuSubmenuTrigger3 = value;
  }), bindRuntimeValue(runtime2, "menuGroupLabelClasses", () => menuGroupLabelClasses, (value) => {
    menuGroupLabelClasses = value;
  }), bindRuntimeValue(runtime2, "MenuTriggerButton", () => MenuTriggerButton, (value) => {
    MenuTriggerButton = value;
  }), bindRuntimeValue(runtime2, "MENU_PLACEHOLDER_MINIMUM_WIDTH", () => MENU_PLACEHOLDER_MINIMUM_WIDTH, (value) => {
    MENU_PLACEHOLDER_MINIMUM_WIDTH = value;
  }), bindRuntimeValue(runtime2, "emptyMenuSize", () => emptyMenuSize, (value) => {
    emptyMenuSize = value;
  }), bindRuntimeValue(runtime2, "HIGHLIGHTED_MENU_ITEM_SELECTOR", () => HIGHLIGHTED_MENU_ITEM_SELECTOR, (value) => {
    HIGHLIGHTED_MENU_ITEM_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "MenuBar", () => MenuBar, (value) => {
    MenuBar = value;
  }), bindRuntimeValue(runtime2, "Menu", () => Menu, (value) => {
    Menu = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu9", () => initializeUiMenu9, (value) => {
    initializeUiMenu9 = value;
  }), bindRuntimeValue(runtime2, "AdaptiveSheetPopupHost", () => AdaptiveSheetPopupHost), bindRuntimeValue(runtime2, "jsxtK", () => jsxtK, (value) => {
    jsxtK = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu10", () => initializeUiMenu10, (value) => {
    initializeUiMenu10 = value;
  }), bindRuntimeValue(runtime2, "usePopoverStyleDebug", () => usePopoverStyleDebug), bindRuntimeValue(runtime2, "isPopoverArrow", () => isPopoverArrow), bindRuntimeValue(runtime2, "unlessDefaultPrevented", () => unlessDefaultPrevented), bindRuntimeValue(runtime2, "usePopoverOverlayStack", () => usePopoverOverlayStack), bindRuntimeValue(runtime2, "resolvePopoverAnchor", () => resolvePopoverAnchor), bindRuntimeValue(runtime2, "popoverRefusesFocusOut", () => popoverRefusesFocusOut), bindRuntimeValue(runtime2, "PopoverRoot", () => PopoverRoot2), bindRuntimeValue(runtime2, "ControlledPopoverRoot", () => ControlledPopoverRoot), bindRuntimeValue(runtime2, "reactD6", () => reactD6, (value) => {
    reactD6 = value;
  }), bindRuntimeValue(runtime2, "jsxU7", () => jsxU7, (value) => {
    jsxU7 = value;
  }), bindRuntimeValue(runtime2, "POPOVER_SURFACE_CLASS", () => POPOVER_SURFACE_CLASS, (value) => {
    POPOVER_SURFACE_CLASS = value;
  }), bindRuntimeValue(runtime2, "POPOVER_LAYOUT_INHERIT_CLASS", () => POPOVER_LAYOUT_INHERIT_CLASS, (value) => {
    POPOVER_LAYOUT_INHERIT_CLASS = value;
  }), bindRuntimeValue(runtime2, "POPOVER_PADDING_CLASSES", () => POPOVER_PADDING_CLASSES, (value) => {
    POPOVER_PADDING_CLASSES = value;
  }), bindRuntimeValue(runtime2, "POPOVER_PADDING_OVERFLOW_CLASS_PATTERN", () => POPOVER_PADDING_OVERFLOW_CLASS_PATTERN, (value) => {
    POPOVER_PADDING_OVERFLOW_CLASS_PATTERN = value;
  }), bindRuntimeValue(runtime2, "POPOVER_PADDING_OVERFLOW_STYLE_PATTERN", () => POPOVER_PADDING_OVERFLOW_STYLE_PATTERN, (value) => {
    POPOVER_PADDING_OVERFLOW_STYLE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "PopoverPopupInner", () => PopoverPopupInner, (value) => {
    PopoverPopupInner = value;
  }), bindRuntimeValue(runtime2, "PopoverPopup", () => PopoverPopup3, (value) => {
    PopoverPopup3 = value;
  }), bindRuntimeValue(runtime2, "PopoverSheetCapablePopup", () => PopoverSheetCapablePopup, (value) => {
    PopoverSheetCapablePopup = value;
  }), bindRuntimeValue(runtime2, "PopoverPopupView", () => PopoverPopupView, (value) => {
    PopoverPopupView = value;
  }), bindRuntimeValue(runtime2, "popoverStateContext", () => popoverStateContext, (value) => {
    popoverStateContext = value;
  }), bindRuntimeValue(runtime2, "popoverControlledStateContext", () => popoverControlledStateContext, (value) => {
    popoverControlledStateContext = value;
  }), bindRuntimeValue(runtime2, "PopoverTrigger", () => PopoverTrigger3, (value) => {
    PopoverTrigger3 = value;
  }), bindRuntimeValue(runtime2, "PopoverTriggerAlias", () => PopoverTriggerAlias, (value) => {
    PopoverTriggerAlias = value;
  }), bindRuntimeValue(runtime2, "PopoverComponents", () => PopoverComponents, (value) => {
    PopoverComponents = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu11", () => initializeUiMenu11, (value) => {
    initializeUiMenu11 = value;
  }), bindRuntimeValue(runtime2, "reactForUiMenu2", () => reactForUiMenu2, (value) => {
    reactForUiMenu2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiMenu2", () => jsxForUiMenu2, (value) => {
    jsxForUiMenu2 = value;
  }), bindRuntimeValue(runtime2, "CHECKBOX_CLASS", () => CHECKBOX_CLASS, (value) => {
    CHECKBOX_CLASS = value;
  }), bindRuntimeValue(runtime2, "Checkbox", () => Checkbox, (value) => {
    Checkbox = value;
  }), bindRuntimeValue(runtime2, "initializeUiMenu12", () => initializeUiMenu12, (value) => {
    initializeUiMenu12 = value;
  }), () => {
    initializeUiMenu = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeNpmDependency)(), reactiK = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), textFieldStateContext = reactiK.createContext(null);
    }), TEXT_INPUT_CLUSTER_CLASS = "[&_[data-cds=Button]:not([data-cds-ghost])]:h-[var(--fhn)] [&_[data-cds=Button]:not([data-cds-ghost])]:rounded-[calc(var(--fr)-(var(--fh)-var(--fhn))/2)] [&_[data-cds=Button][data-cds-icon-only]:not([data-cds-ghost])]:w-[var(--fhn)]", TEXT_INPUT_ICON_CLASS = "has-[[data-cds-end-slot]_[data-cds=Button]:not([data-cds-ghost])]:pe-[calc((var(--cds-h-control)-var(--cds-h-control-nested))/2)]", TEXT_INPUT_CLEAR_BUTTON_CLASS = "pe-[calc((var(--cds-h-control)-var(--cds-h-control-nested))/2)]", TYPED_DIR_ATTRIBUTE = "data-cds-typed-dir", MENU_DESCRIPTION_STACKS_CLASS = "stacks:group-data-[highlighted]/menu-danger:text-muted", MENU_ITEM_SLOT_ALIGN_CLASS = "min-h-[1lh] self-start has-[[data-cds=Switch],[data-cds=Checkbox],[data-cds=Button]]:self-stretch", MENU_SEARCH_FOCUS_OPTIONS = { preventScroll: !0, focusVisible: !0 }, STRONG_RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u, TYPED_DIR_INPUT_TYPES = /* @__PURE__ */ new Set(["", "text", "search"]), documentDirObservers = /* @__PURE__ */ new WeakMap(), initializeUiMenu2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeClickToFocus)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializeUiDisclosure9)(), (0, runtime2.initializeUiDisclosure12)(), initializeUiMenu(), (0, runtime2.initializeNpmDependency)(), reactForUiMenu = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiMenu = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TextInput_oE0 = runtime2.TEXT_INPUT_CLASS, TEXT_INPUT_CLEAR_CLASS = runtime2.TEXT_INPUT_REQUIRED_CLASS, TextInput = reactForUiMenu.forwardRef(({ className, size: size4, fullWidth = !0, slotStart, slotEnd, clearable = !1, onClear, clearLabel, onChange, onKeyDown, ...props }, options) => {
        let { id: value, "aria-describedby": value2, "aria-invalid": value3, disabled: value4, ...value5 } = props, state = {
          id: value,
          "aria-describedby": value2,
          disabled: value4
        }, value6 = (0, runtime2.useTranslation)("clear", "Clear"), value7 = clearLabel ?? value6, value8 = useFieldInvalid(), value9 = value8 || value3, value10 = useFieldDisabled(), value11 = value4 || value10, value12 = fullWidth ? "w-full" : "", value13 = fullWidth ? "w-full min-w-0" : "", ref = reactForUiMenu.useRef(null), { clickToFocusProps: value14 } = (0, runtime2.useClickToFocus)(() => ref.current?.focus(), {
          disabled: value11,
          readOnly: value5.readOnly
        }), value15 = (0, runtime2.useMergedRefs)(ref, options);
        useTypedInputDirection(ref, {
          value: value5.value,
          dir: value5.dir,
          type: value5.type,
          remountKey: !!(slotStart || slotEnd || clearable)
        });
        let value16 = value5.value !== void 0, [value17, value18] = reactForUiMenu.useState(() => value5.defaultValue !== void 0 && String(value5.defaultValue).length > 0), value19 = value16 ? value5.value !== void 0 && String(value5.value).length > 0 : value17, callback = (event) => {
          clearable && !value16 && value18(event.target.value.length > 0), onChange?.(event);
        }, callback2 = () => {
          let current = ref.current;
          !value16 && current && (Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(current, ""), current.dispatchEvent(new Event("input", {
            bubbles: !0
          })), value18(!1)), onClear?.(), current?.focus();
        }, value20 = (clearable === "always" || clearable && value19) && !value11, value21 = value20 && value19 && (!value16 || onClear !== void 0) && !value5.readOnly, value22 = value20 ? jsxForUiMenu.jsx(runtime2.Button, {
          iconOnly: !0,
          variant: "ghost",
          size: size4 === "sm" || size4 === "xs" ? "xs" : "sm",
          className: "!size-[var(--fhn)] !rounded-[calc(var(--fr)-(var(--fh)-var(--fhn))/2)]",
          icon: "X",
          "aria-label": value7,
          tooltip: !1,
          tabIndex: value21 ? -1 : void 0,
          onMouseDown: (event) => event.preventDefault(),
          onClick: callback2
        }) : null, ref2 = reactForUiMenu.useRef(!1), callback3 = (event) => {
          event.preventDefault(), event.stopPropagation(), event.nativeEvent.stopImmediatePropagation();
        }, callback4 = (event) => {
          if (onKeyDown?.(event), event.key === "Escape" && !event.repeat && (ref2.current = !1), event.key === "Escape" && !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !event.defaultPrevented && !event.isPropagationStopped()) {
            if (event.repeat) {
              ref2.current && callback3(event);
              return;
            }
            ref2.current = value21 && event.currentTarget.value !== "", ref2.current && (callback3(event), callback2());
          }
        };
        if (slotStart || slotEnd || clearable) {
          let value23 = value22 ? TEXT_INPUT_CLEAR_BUTTON_CLASS : "pe-md", value24 = `flex shrink-0 items-center gap-[var(--cds-pad-sm,6px)] ${runtime2.staysSecondaryTextClasses} [--fh:var(--cds-h-control)] [--fr:var(--cds-radius)] [--fhn:var(--cds-h-control-nested)] ${TEXT_INPUT_CLUSTER_CLASS}`;
          return jsxForUiMenu.jsxs("div", {
            "data-cds": "TextInput",
            ...(0, runtime2.getControlSizeAttributes)(size4),
            "data-invalid": value8 || void 0,
            onMouseDown: unlessDefaultPrevented(value14.onMouseDown),
            className: (0, runtime2.cn)(TextInput_oE0, value23, TEXT_INPUT_ICON_CLASS, "inline-flex", value13, value11 ? "cursor-default" : "cursor-text", "items-center gap-[var(--cds-pad-sm,6px)]", runtime2.fieldFocusWithinClasses, "has-[input:disabled]:opacity-disabled", value11 ? void 0 : runtime2.TEXT_INPUT_HOVER_CLASS, className),
            children: [
              slotStart ? jsxForUiMenu.jsx("span", {
                className: `flex shrink-0 items-center ${runtime2.staysSecondaryTextClasses}`,
                children: slotStart
              }) : null,
              jsxForUiMenu.jsx(runtime2.baseField.Control, {
                ...state,
                render: jsxForUiMenu.jsx("input", {
                  ref: value15,
                  "aria-invalid": value9,
                  ...value5,
                  onChange: callback,
                  onKeyDown: callback4,
                  className: (0, runtime2.cn)(TEXT_INPUT_CLEAR_CLASS, "disabled:opacity-100")
                })
              }),
              value22 || slotEnd ? jsxForUiMenu.jsxs("span", {
                "data-cds-end-slot": "",
                className: value24,
                children: [slotEnd, value22]
              }) : null
            ]
          });
        }
        return jsxForUiMenu.jsx(runtime2.baseField.Control, {
          ref: options,
          ...state,
          render: jsxForUiMenu.jsx("input", {
            "data-cds": "TextInput",
            ...(0, runtime2.getControlSizeAttributes)(size4),
            "data-invalid": value8 || void 0,
            "aria-invalid": value9,
            ...value5,
            onChange: callback,
            onKeyDown: callback4,
            className: (0, runtime2.cn)("cds-input cds-reset", TextInput_oE0, "pe-md", value12, "placeholder:text-muted outline-none focus-visible:outline-hidden enabled:[&:hover:not(:focus):not([data-invalid])]:shadow-field-hover disabled:opacity-disabled", runtime2.fieldFocusClasses, className)
          })
        });
      }), TextInput.displayName = "TextInput";
    }), SHEET_PENDING_ATTRIBUTE = "data-cds-sheet-pending", preventPendingSheetFocus = (event) => {
      event.preventDefault();
    }, initializeUiMenu3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeAndroidCloseWatcher)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeAdaptiveSheets)(), (0, runtime2.initializeSheetClassNames)(), (0, runtime2.initializeNpmDependency)(), reactiZ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxZu = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactDOMrG0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), concealedPopupStyle = {
        visibility: "hidden",
        opacity: 0
      };
    }), COMPOSITION_TIME_SENTINEL = -1e8, initializeUiMenu4 = (0, runtime2.initializeOnce)(() => {
      lastCompositionEndTime = COMPOSITION_TIME_SENTINEL, suppressedCompositionEvents = /* @__PURE__ */ new WeakSet(), compositionLineBreakInputTypes = /* @__PURE__ */ new Set([
        "insertParagraph",
        "insertLineBreak"
      ]), compositionSuppressionResetEvents = [
        "beforeinput",
        "keydown",
        "keyup",
        "compositionstart",
        "focusout"
      ];
    }), checkboxVisualClasses = "flex shrink-0 size-[var(--cds-checkbox)] items-center justify-center rounded-[var(--cds-checkbox-radius)] border border-strong bg-transparent", CHECKBOX_MARK_CLASS = "inline-flex gap-xs text-start font-sans text-body font-normal text-primary", CheckboxMark = "mt-[calc((1lh_-_var(--cds-checkbox,1rem))_/_2)]", initializeUiMenu5 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeIcons)(), jsxsM = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), footnoteDescriptionClasses = `text-footnote leading-snug ${runtime2.staysSecondaryTextClasses}`;
    }), initializeUiMenu6 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeTooltip)(), (0, runtime2.initializeMenuContexts)(), (0, runtime2.initializePassiveOpen)(), (0, runtime2.initializeMenuOpener)(), jsxo_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), initializeUiMenu7 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementAccess)();
    }), initializeUiMenu8 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), reacttM = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), menuGroupLabelClasses = "compact:px-2 comfortable:px-2.5 py-1 text-footnote font-medium text-muted", MENU_PLACEHOLDER_MINIMUM_WIDTH = 20, HIGHLIGHTED_MENU_ITEM_SELECTOR = '[data-highlighted][tabindex="0"]', initializeContextMenuTouchGuard = (0, runtime2.initializeOnce)(() => {
      touchHoldOwnerByDocument = /* @__PURE__ */ new WeakMap(), touchHoldDocumentByOwner = /* @__PURE__ */ new WeakMap(), touchHoldReleasedOwners = /* @__PURE__ */ new WeakSet(), touchHoldTargets = /* @__PURE__ */ new WeakMap(), touchHoldTrackedTargets = /* @__PURE__ */ new WeakMap();
      let capture = { capture: !0 }, activeCapture = { capture: !0, passive: !1 }, passiveCapture = { capture: !0, passive: !0 };
      TOUCH_HOLD_TARGET_OPTIONS = { capture: !1, passive: !1 }, touchHoldListeners = [
        ["pointerdown", releaseTouchHoldOnPress, capture],
        ["touchstart", releaseTouchHoldOnPress, passiveCapture],
        ["touchend", handleTouchHoldEnd, activeCapture],
        ["touchcancel", handleTouchHoldEnd, capture],
        ["mousedown", swallowTouchHoldMouse, capture],
        ["mouseup", swallowTouchHoldMouse, capture],
        ["click", swallowTouchHoldMouse, capture]
      ];
    }), initializeSubmenuAim = (0, runtime2.initializeOnce)(() => {
      submenuAimByMenu = /* @__PURE__ */ new WeakMap();
    }), initializeUiMenu9 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeMediaQueryStores)(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsLink)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeEventCallbacks)(), (0, runtime2.initializeClickToFocus)(), (0, runtime2.initializeElementNamespaces)(), (0, runtime2.initializeCloseOnActivityHide)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeCollisionPadding)(), (0, runtime2.initializeShortcuts)(), (0, runtime2.initializeDisabledReason)(), (0, runtime2.initializeTooltip)(), (0, runtime2.initializeUiDisclosure9)(), (0, runtime2.initializeSurfaces)(), (0, runtime2.initializeUiDisclosure10)(), (0, runtime2.initializeOverlayActions)(), (0, runtime2.initializePresentationMode)(), (0, runtime2.initializeAdaptiveSheets)(), initializeUiMenu3(), initializeUiMenu4(), initializeUiMenu5(), initializeUiMenu2(), (0, runtime2.initializeMenuContexts)(), (0, runtime2.initializeKeyboardContextMenuFocus)(), (0, runtime2.initializeMenuScrollContent)(), (0, runtime2.initializeContextMenuPopup)(), (0, runtime2.initializePassiveOpen)(), (0, runtime2.initializeMenuItemVariants)(), (0, runtime2.initializeMenuOpener)(), initializeUiMenu6(), initializeContextMenuTouchGuard(), initializeSubmenuAim(), (0, runtime2.initializeMenuPopupElement)(), initializeUiMenu7(), (0, runtime2.initializeStablePopupPlacement)(), initializeUiMenu8(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reacta0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxC0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), numericShortcutPattern = /^\d+$/, MenuPopup3 = reacta0.forwardRef(({ align: align2 = "start", stableWhileOpen = !1, "data-cds": dataCds = "Menu", ...props }, options) => {
        let state = {
          align: align2,
          stableWhileOpen,
          "data-cds": dataCds,
          ...props
        }, value = (0, runtime2.useHasSheetFrame)(), value2 = useMenuPopupElement(state, options, !value, !1);
        return value ? jsxC0.jsx(MenuSheetCapablePopup, {
          ...state,
          ref: options
        }) : value2;
      }), MenuPopup3.displayName = "Menu.Popup", MenuSheetCapablePopup = reacta0.forwardRef((input, options) => {
        let value = (0, runtime2.useSheetImplementation)(), { pending: value2 } = (0, runtime2.useSheetState)(), value3 = reacta0.useContext(runtime2.menuTriggerContext), value4 = reacta0.useContext(runtime2.contextMenuContext) && value3 === null ? "contextmenu" : "menu", value5 = useMenuPopupElement(input, options, value === null, value === null && value2);
        return value !== null ? jsxC0.jsx(value.MenuSheetPopup, {
          ...input,
          ref: options
        }) : jsxC0.jsxs(jsxC0.Fragment, {
          children: [
            value5,
            value2 && value3 === null ? jsxC0.jsx(PendingSheetBackdrop, {
              kind: value4
            }) : null
          ]
        });
      }), MenuSheetCapablePopup.displayName = "MenuSheetCapablePopup", MenuItem3 = reacta0.forwardRef(({ variant, icon, shortcut, checked: checked5, checkedRole, checkPosition, indicator = "check", indeterminate, hint, hintDir, labelDir, description, descriptionDir, descriptionLines, disabledReason, href, routerOptions, target, rel, download, keepOpen, focusesNothing, leading, trailing, className, children, ...props }, options) => {
        let value = indicator === "checkbox", value2 = value ? href !== void 0 ? void 0 : checked5 ?? !1 : checked5, value3 = value ? "checkbox" : checkedRole ?? "checkbox", value4 = checkPosition ?? (value ? "leading" : "trailing"), value5 = (0, runtime2.useAppleKeyboard)(), rtl = useMenuDirection() === "rtl", value6 = reacta0.useId(), { label: value7, labelSpanRef: value8, rowRef: value9 } = useMenuItemLabel(children, props.label), value10 = (0, runtime2.useMergedRefs)(options, value9), value11 = props.disabled === !0 && (0, runtime2.hasDisabledReason)(disabledReason), state = {
          "aria-keyshortcuts": shortcut ? (0, runtime2.shortcutToAriaKeyShortcuts)(shortcut, value5) : void 0,
          "data-cds-icon-row": icon !== void 0 && !(value2 !== void 0 && value4 === "leading") ? "" : void 0,
          [runtime2.FOCUSES_NOTHING_ATTRIBUTE]: focusesNothing ? "" : void 0,
          ...props,
          label: value7,
          "aria-describedby": [value11 ? value6 : void 0, props["aria-describedby"]].filter(Boolean).join(" ") || void 0
        }, value12 = (0, runtime2.useMenuPassiveFocusProps)(), callback = (input) => disabledReason === void 0 ? input : jsxC0.jsx(runtime2.Tooltip, {
          content: value11 ? disabledReason : void 0,
          side: rtl ? "left" : "right",
          multiline: !0,
          closeOnClick: !1,
          children: jsxC0.jsxs("div", {
            role: "none",
            children: [
              input,
              jsxC0.jsx(runtime2.DisabledReasonAnnouncement, {
                id: value6,
                reason: value11 ? disabledReason : void 0
              })
            ]
          })
        }), value13 = (0, runtime2.useCdsLink)({
          href,
          routerOptions,
          target,
          rel,
          download,
          ...(0, runtime2.pickLinkEventProps)(props)
        }), value14 = (0, runtime2.cn)((0, runtime2.menuItemVariants)({
          variant
        }), description ? `${runtime2.menuItemDescriptionPaddingClass} ` : "", className), hasDescription = !!description, value15 = value2 !== void 0 && jsxC0.jsx("span", {
          className: (0, runtime2.clsx)(value4 === "leading" && hasDescription && !value ? "flex h-[1lh] w-icon shrink-0 items-center justify-center self-start" : "flex size-icon shrink-0 items-center justify-center", value4 === "trailing" && !hint && !shortcut && "-me-1", !!(value4 === "trailing" && shortcut && !hint) && "pointer-coarse:-me-1", value && value4 === "leading" && "-ms-1 group-has-[[data-cds-icon-row]]/menu-popup:ms-0"),
          style: value ? void 0 : {
            color: "var(--cds-fill-accent)"
          },
          children: value ? jsxC0.jsx("span", {
            "data-size": hasDescription && value4 === "leading" ? void 0 : "xs",
            className: "flex shrink-0",
            children: jsxC0.jsx(CheckboxVisual, {
              checked: value2,
              indeterminate
            })
          }) : value2 && jsxC0.jsx(runtime2.Icon, {
            name: "Check",
            size: "auto",
            bold: !0
          })
        }), hasTrailing = trailing != null && typeof trailing != "boolean" && trailing !== "", hasEndCluster = !!(value2 !== void 0 && value4 === "trailing" || hint || shortcut), shortcutOnly = !!(shortcut && !(value2 !== void 0 && value4 === "trailing") && !hint), lineProps = getDescriptionLineProps(descriptionLines), value16 = jsxC0.jsxs(jsxC0.Fragment, {
          children: [
            leading,
            value4 === "leading" && value15,
            icon !== void 0 && jsxC0.jsx(runtime2.IconSlot, {
              icon,
              firstLine: hasDescription
            }),
            description ? jsxC0.jsxs("span", {
              className: "flex min-w-0 flex-1 flex-col",
              children: [
                jsxC0.jsx("span", {
                  ref: value8,
                  ...getDirAutoProps(labelDir, rtl, "truncate"),
                  children
                }),
                jsxC0.jsx("span", {
                  ...getDirAutoProps(descriptionDir, rtl, `${lineProps.className} text-footnote text-muted group-data-[highlighted]/menu-danger:text-on-danger ${MENU_DESCRIPTION_STACKS_CLASS}`, !(Math.floor(descriptionLines ?? 0) >= 2)),
                  style: lineProps.style,
                  children: description
                })
              ]
            }) : jsxC0.jsx("span", {
              ref: value8,
              ...getDirAutoProps(labelDir, rtl, "min-w-0 flex-1 truncate"),
              children
            }),
            hasTrailing && jsxC0.jsx("span", {
              className: (0, runtime2.clsx)("ms-md flex shrink-0 items-center gap-xs", hasDescription && MENU_ITEM_SLOT_ALIGN_CLASS),
              children: trailing
            }),
            hasEndCluster && jsxC0.jsxs("span", {
              className: (0, runtime2.cn)("flex shrink-0 items-center gap-xs", !hasTrailing && "ms-md", hasDescription && "h-[1lh] self-start", shortcutOnly && "pointer-coarse:hidden"),
              children: [
                value4 === "trailing" && value15,
                hint && jsxC0.jsx("span", {
                  ...getDirAutoProps(hintDir, rtl, `max-w-[160px] shrink-0 truncate py-[0.125em] -my-[0.125em] text-footnote text-muted group-data-[highlighted]/menu-danger:text-on-danger stacks:group-data-[highlighted]/menu-danger:text-muted ${getShortcutNumeralClasses(hint)}`),
                  children: hint
                }),
                shortcut && jsxC0.jsx(MenuShortcut, {
                  keys: shortcut
                })
              ]
            })
          ]
        });
        if (href !== void 0) {
          let value17 = (0, runtime2.omitLinkEventProps)(state);
          return callback(jsxC0.jsx(runtime2.baseMenu.Item, {
            ref: value10,
            ...value17,
            ...value12,
            closeOnClick: keepOpen ? !1 : void 0,
            className: value14,
            render: jsxC0.jsx("a", {
              ...value13
            }),
            children: value16
          }));
        }
        return callback(value2 !== void 0 ? value3 === "radio" ? jsxC0.jsx(runtime2.baseMenu.Item, {
          ref: value10,
          ...state,
          ...value12,
          role: "menuitemradio",
          "aria-checked": value2,
          closeOnClick: keepOpen ? !1 : void 0,
          className: value14,
          children: value16
        }) : jsxC0.jsx(runtime2.baseMenu.CheckboxItem, {
          ref: value10,
          ...state,
          ...value && indeterminate ? {
            "aria-checked": "mixed"
          } : {},
          ...value12,
          checked: value2,
          closeOnClick: value ? !1 : !keepOpen,
          className: value14,
          children: value16
        }) : jsxC0.jsx(runtime2.baseMenu.Item, {
          ref: value10,
          ...state,
          ...value12,
          closeOnClick: keepOpen ? !1 : void 0,
          className: value14,
          children: value16
        }));
      }), MenuItem3.displayName = "Menu.Item", MenuSubmenuTrigger3 = reacta0.forwardRef(({ icon, leading, hint, hintDir, labelDir, trailing, className, children, openOnHover, onPointerMove, onPointerUp, onPointerLeave, ...props }, options) => {
        let value = reacta0.useContext(runtime2.menuTriggerContext), value2 = (0, runtime2.useIsSheet)(), triggerRtl = useMenuDirection() === "rtl", activeAim = !value2 && openOnHover === !1 ? value?.aim : void 0, holdAim = (event) => {
          activeAim && value?.openRef.current && (event.pointerType === "mouse" || event.pointerType === "pen") && activeAim.hold(event.currentTarget);
        }, handlePointerMove = (0, runtime2.useEventCallback)((event) => {
          onPointerMove?.(event), holdAim(event);
        }), handlePointerUp = (0, runtime2.useEventCallback)((event) => {
          onPointerUp?.(event), holdAim(event);
        }), handlePointerLeave = (0, runtime2.useEventCallback)((event) => {
          onPointerLeave?.(event), activeAim?.leave(event.nativeEvent, event.currentTarget);
        }), contextAim = value?.aim;
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          activeAim === void 0 && contextAim?.release();
        }, [activeAim, contextAim]);
        let value3 = (0, runtime2.useMenuPassiveFocusProps)(), { label: value4, labelSpanRef: value5, rowRef: value6 } = useMenuItemLabel(children, props.label), value7 = (0, runtime2.useMergedRefs)(value?.setTriggerNode, options, value6), value8 = value?.stashLabel;
        return (0, runtime2.useIsomorphicLayoutEffect)(() => {
          value2 && value8?.(children);
        }, [value2, value8, children]), jsxC0.jsxs(runtime2.baseMenu.SubmenuTrigger, {
          ref: value7,
          "data-cds-icon-row": icon !== void 0 ? "" : void 0,
          ...props,
          label: value4,
          ...value3,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerLeave: handlePointerLeave,
          openOnHover: value2 ? !1 : openOnHover,
          className: (0, runtime2.cn)((0, runtime2.menuItemVariants)({
            variant: "default"
          }), "justify-between data-[popup-open]:bg-fill-ghost-hover", className),
          children: [
            leading,
            icon !== void 0 && jsxC0.jsx(runtime2.IconSlot, {
              icon
            }),
            jsxC0.jsx("span", {
              ref: value5,
              ...getDirAutoProps(labelDir, triggerRtl, "min-w-0 flex-1 truncate"),
              children
            }),
            trailing || hint ? jsxC0.jsxs("span", {
              className: "ms-md flex shrink-0 items-center gap-xs",
              children: [
                trailing,
                hint && jsxC0.jsx("span", {
                  ...getDirAutoProps(hintDir, triggerRtl, `max-w-[160px] shrink-0 truncate py-[0.125em] -my-[0.125em] text-footnote text-muted ${getShortcutNumeralClasses(hint)}`),
                  children: hint
                }),
                jsxC0.jsx(runtime2.Icon, {
                  name: "CaretRight",
                  size: "sm",
                  className: "-me-1 shrink-0 text-muted"
                })
              ]
            }) : jsxC0.jsx(runtime2.Icon, {
              name: "CaretRight",
              size: "sm",
              className: "-me-1 shrink-0 text-muted"
            })
          ]
        });
      }), MenuSubmenuTrigger3.displayName = "Menu.SubmenuTrigger", MenuSubmenu.displayName = "Menu.Submenu", MenuSeparator.displayName = "Menu.Separator", MenuHeader.displayName = "Menu.Header", MenuGroupLabel3.displayName = "Menu.GroupLabel", SimpleMenu.displayName = "Menu", MenuRoot3.displayName = "Menu.Root", MenuTriggerButton = reacta0.forwardRef(function({ children, id, ...props }, options) {
        return jsxC0.jsx(runtime2.baseMenu.Trigger, {
          id,
          disabled: props.disabled || props.busy,
          render: jsxC0.jsxs(runtime2.Button, {
            ref: options,
            ...props,
            ...props.busy ? {
              disabled: props.disabled
            } : void 0,
            children: [
              children,
              jsxC0.jsx(MenuCaret, {
                size: props.size
              })
            ]
          })
        });
      }), MenuTriggerButton.displayName = "Menu.TriggerButton", MenuSearchablePopup.displayName = "Menu.SearchablePopup", emptyMenuSize = {
        width: 0,
        height: 0
      }, MenuPendingList.displayName = "Menu.PendingList", MenuBar = reacta0.forwardRef(function({ className, ...props }, options) {
        return jsxC0.jsx(runtime2.menuBarContext.Provider, {
          value: !0,
          children: jsxC0.jsx(runtime2.baseMenubar, {
            ref: options,
            "data-cds": "MenuBar",
            ...props,
            className: (0, runtime2.cn)("flex items-center gap-xs", className)
          })
        });
      }), MenuBar.displayName = "Menu.Bar", Menu = Object.assign(SimpleMenu, {
        Root: MenuRoot3,
        Bar: MenuBar,
        Trigger: runtime2.baseMenu.Trigger,
        TriggerButton: MenuTriggerButton,
        Popup: MenuPopup3,
        Item: MenuItem3,
        Separator: MenuSeparator,
        Group: runtime2.baseMenu.Group,
        GroupLabel: MenuGroupLabel3,
        Header: MenuHeader,
        Submenu: MenuSubmenu,
        SubmenuTrigger: MenuSubmenuTrigger3,
        SearchablePopup: MenuSearchablePopup,
        PendingList: MenuPendingList
      });
    }), initializeUiMenu10 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeAdaptiveSheets)(), initializeUiMenu3(), jsxtK = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), POPOVER_LAYOUT_INHERIT_CLASS = "[display:inherit] [flex-direction:inherit] [flex-wrap:inherit] [align-items:inherit] [justify-content:inherit] [justify-items:inherit] [gap:inherit] [grid-template-columns:inherit] [grid-template-rows:inherit] [grid-auto-flow:inherit] [grid-auto-columns:inherit] [grid-auto-rows:inherit] col-span-full row-span-full self-stretch justify-self-stretch max-h-[inherit] min-h-0 min-w-0 flex-auto overflow-y-auto rounded-[inherit] outline-none focus-visible:outline-hidden", initializeUiMenu11 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeOverlaySelector)(), (0, runtime2.initializeCloseOnActivityHide)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeSurfaces)(), (0, runtime2.initializeOverlayActions)(), (0, runtime2.initializeVisualKeyboard)(), (0, runtime2.initializeSheetStyles)(), (0, runtime2.initializePresentationMode)(), (0, runtime2.initializeAdaptiveSheets)(), (0, runtime2.initializeSheetClassNames)(), initializeUiMenu3(), initializeUiMenu10(), (0, runtime2.initializeOverlayFocus)(), (0, runtime2.initializeOverlayStack)(), (0, runtime2.initializePopupPointerFocus)(), (0, runtime2.initializeNpmDependency)(), reactD6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxU7 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), POPOVER_SURFACE_CLASS = `draggable-none max-w-[320px] max-h-[var(--available-height)] ${(0, runtime2.getSurfaceClasses)("popover")} cds-reset text-body font-normal text-primary outline-none focus-visible:outline-hidden`, POPOVER_TAIL_PATH = "M0 0H28V2C23.5 2 22.8 2.2 21.6 3.3L15.6 8.6C14.7 9.4 13.3 9.4 12.4 8.6L6.4 3.3C5.2 2.2 4.5 2 0 2Z", POPOVER_TAIL_RING_PATH = "M0 1H28V2C23.5 2 22.8 2.2 21.6 3.3L15.6 8.6C14.7 9.4 13.3 9.4 12.4 8.6L6.4 3.3C5.2 2.2 4.5 2 0 2Z", POPOVER_TAIL_INNER_PATH = "M0 0H28V1C23.5 1 22.8 1.2 21.6 2.3L15.6 7.6C14.7 8.4 13.3 8.4 12.4 7.6L6.4 2.3C5.2 1.2 4.5 1 0 1Z", POPOVER_TAIL_FILL_CLASS = "fill-[var(--cds-surface-popover)] forced-colors:fill-[Canvas]", POPOVER_TAIL_CLASS = "data-[side=top]:bottom-[-10px] data-[side=bottom]:top-[-10px] data-[side=bottom]:rotate-180 data-[side=left]:right-[-18px] data-[side=left]:-rotate-90 data-[side=right]:left-[-18px] data-[side=right]:rotate-90 data-[side=inline-start]:hidden data-[side=inline-end]:hidden", POPOVER_ARROW_SHADOW_CLASS = "[filter:drop-shadow(0_8px_24px_var(--cds-shadow-color))_drop-shadow(0_2px_6px_var(--cds-shadow-color))] forced-colors:[filter:none]", POPOVER_ARROW_RING_CLASS = "shadow-card-ring", POPOVER_TAIL_SIDE_OFFSET = 10, POPOVER_TAIL_RING_CLASS = "shadow-[inset_0_0_0_1px_var(--cds-ring-color)]", POPOVER_BODY_STYLE = { "--transform-origin": "initial" }, popoverTailReachContext = reactD6.createContext(void 0), POPOVER_PADDING_CLASSES = {
        none: "p-0",
        xs: "p-xs",
        sm: "p-sm",
        md: "p-md",
        lg: "p-lg"
      }, POPOVER_PADDING_OVERFLOW_CLASS_PATTERN = /(?:^|\s)!?(?:-?p[xysetrbl]?-[^\s:]+|overflow-[^\s:]+)!?(?=\s|$)/, POPOVER_PADDING_OVERFLOW_STYLE_PATTERN = /^(?:padding|overflow[XY]?$)/, PopoverPopupInner = reactD6.forwardRef(({ anchored, finalFocus, className, children, ...props }, options) => {
        let value = reactD6.useContext(runtime2.sheetFrameContext)?.open ?? !0, value2 = anchored && finalFocus === void 0, mountStore = reactD6.useContext(popoverStateContext), returnsToTrigger = mountStore !== null && !anchored && (finalFocus === void 0 || finalFocus === !0), value3 = (0, runtime2.useOverlayFocusReturn)({
          skipRestoreOnOutsideFocus: !0,
          open: value,
          registerOpenerReturn: value2 || returnsToTrigger,
          triggerRef: returnsToTrigger ? mountStore?.triggerRef : void 0
        }), value4 = (0, runtime2.useMergedRefs)(options, value3.popupRef);
        return jsxU7.jsx(runtime2.basePopover.Popup, {
          "data-cds": "Popover",
          [runtime2.OVERLAY_ATTRIBUTE]: "",
          ref: value4,
          finalFocus: value2 ? value3.finalFocus : finalFocus,
          ...props,
          className,
          children
        });
      }), PopoverPopupInner.displayName = "Popover.PopupInner", PopoverPopup3 = reactD6.forwardRef(({ side: side2 = "bottom", align: align2 = "center", sideOffset: sideOffsetProp, padding = "lg", scrollFade = !0, ...props }, options) => {
        let state = {
          side: side2,
          align: align2,
          // A tail needs more room than the default arrow gap.
          sideOffset: sideOffsetProp === void 0 && reactD6.Children.toArray(props.children).some(isPopoverTail) ? POPOVER_TAIL_SIDE_OFFSET : sideOffsetProp ?? 6,
          padding,
          scrollFade,
          ...props
        };
        return (0, runtime2.useHasSheetFrame)() ? jsxU7.jsx(PopoverSheetCapablePopup, {
          ...state,
          ref: options
        }) : jsxU7.jsx(PopoverPopupView, {
          ...state,
          ref: options,
          sheetPopup: runtime2.defaultSheetHost,
          sheetParts: null
        });
      }), PopoverPopup3.displayName = "Popover.Popup", PopoverSheetCapablePopup = reactD6.forwardRef((input, options) => jsxU7.jsx(AdaptiveSheetPopupHost, {
        kind: "popover",
        children: (input2, options2) => jsxU7.jsx(PopoverPopupView, {
          ...input,
          ref: options,
          sheetPopup: input2,
          sheetParts: options2
        })
      })), PopoverSheetCapablePopup.displayName = "PopoverSheetCapablePopup", PopoverPopupView = reactD6.forwardRef(function({ sheetPopup, sheetParts, ...props }, options) {
        let { side: value12 = "bottom", align: value13 = "center", sideOffset: value14 = 6, alignOffset: value, anchor: value2, collisionPadding: value3, padding: value15 = "lg", scrollFade: value16 = !0, layerOffset: value4, closeLabel: value5, sheetHeight: value6, className: value7, children: value8, onFocus: value9, onMouseDown: value10, keepFocus: value17 = !1, ...value11 } = props, ref = reactD6.useRef(null), sheet = sheetPopup.sheet, value18 = reactD6.useContext(runtime2.sheetFrameContext), value19 = (value18?.open ?? !1) && value18?.height !== void 0, value20 = value18?.setDetent;
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          let current = ref.current;
          sheet && value19 && value6 === "tall" && current !== null && current.querySelector('input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null && value20?.("tall");
        }, [sheet, value19, value6, value20]);
        let value21 = sheetPopup.sheet && sheetParts !== null ? sheetParts : null, value22 = reactD6.useContext(popoverStateContext), value23 = value11.initialFocus === !1, callback = (event) => {
          let value31 = (0, runtime2.asElement)(event.target);
          !value17 || value31 === null || !event.currentTarget.contains(value31) || (0, runtime2.shouldAllowPopupPointerFocus)(event, {
            draggable: !0
          }) || event.preventDefault();
        }, value24 = reactD6.useContext(popoverControlledStateContext);
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          if (value22 !== null)
            return value22.update({
              popupMounted: !0,
              declinesFocus: value23,
              anchor: value2
            }), () => {
              value22.update({
                popupMounted: !1
              });
            };
        }, [value22, value23, value2]);
        let value25 = useRefocusAfterPendingSheet(sheetPopup.concealed && !value23), value26 = (0, runtime2.useMergedRefs)(options, sheetPopup.ref, value25), value27 = (0, runtime2.useOverlayLayer)("popover", value4);
        usePopoverStyleDebug(value7, value11.style);
        let value28 = reactD6.Children.toArray(value8), value29 = value28.filter(isPopoverArrowOrTail), hasArrow = !sheet && value29.length > 0, hasTail = hasArrow && value29.some(isPopoverTail), arrowWrapRef = reactD6.useRef(null), value30 = jsxU7.jsx(runtime2.overlayStackContext.Provider, {
          value: value24,
          children: value28.filter((input) => !isPopoverArrowOrTail(input))
        });
        return jsxU7.jsx(runtime2.basePopover.Portal, {
          container: (0, runtime2.usePortalContainer)(),
          children: jsxU7.jsxs(runtime2.PortalRoot, {
            ...value27.portalProps,
            style: sheetPopup.concealed ? {
              ...value27.portalProps.style,
              ...concealedPopupStyle
            } : value27.portalProps.style,
            surface: runtime2.elevationSurfaceNames.popover,
            density: sheet ? runtime2.SHEET_DENSITY : void 0,
            companionModalCatcher: !sheet,
            closeOnActivityHide: !0,
            children: [
              value21 !== null && sheetPopup.sheet && jsxU7.jsx(value21.PopoverSheetBackdrop, {
                sheetPopup
              }),
              jsxU7.jsx(runtime2.layerBaseContext.Provider, {
                value: value27.base,
                children: jsxU7.jsx(runtime2.basePopover.Positioner, {
                  style: sheetPopup.positionerStyle !== void 0 ? {
                    ...value27.style,
                    ...sheetPopup.positionerStyle
                  } : value27.style,
                  side: value12,
                  align: value13,
                  sideOffset: value14,
                  alignOffset: hasArrow ? (data) => getArrowAlignOffset(data, value, arrowWrapRef.current?.firstElementChild, isPopoverTail(value29[0]) ? 28 : void 0) : value,
                  anchor: value2,
                  collisionPadding: value3,
                  ...sheet ? runtime2.sheetPositioningOverrides : {},
                  className: sheet && sheetPopup.state.depth === 0 ? runtime2.sheetOverflowBackgroundClasses : hasArrow ? POPOVER_ARROW_SHADOW_CLASS : void 0,
                  children: jsxU7.jsx(PopoverPopupInner, {
                    anchored: value2 != null,
                    ref: value26,
                    ...sheetPopup.attrs,
                    ...value11,
                    ...sheet ? {
                      initialFocus: void 0
                    } : {},
                    onMouseDown: sheet ? value10 : (input) => {
                      value10?.(input), callback(input);
                    },
                    style: sheetPopup.style === void 0 ? value11.style : typeof value11.style == "function" ? (input) => ({
                      ...value11.style(input),
                      ...sheetPopup.style
                    }) : {
                      ...value11.style,
                      ...sheetPopup.style
                    },
                    onFocus: (event) => {
                      value9?.(event);
                      let currentTarget = event.currentTarget;
                      event.target === currentTarget && currentTarget.ownerDocument.activeElement === currentTarget && ref.current?.focus({
                        preventScroll: !0
                      });
                    },
                    className: (0, runtime2.cn)(POPOVER_SURFACE_CLASS, hasArrow && (hasTail ? POPOVER_TAIL_RING_CLASS : POPOVER_ARROW_RING_CLASS), sheet && runtime2.sheetPopupClasses, sheet && "data-[starting-style]:translate-y-[calc(100%+1.5rem)] data-[ending-style]:translate-y-[calc(100%+1.5rem)]", sheet && "origin-top [&[data-cds-sheet-covered]:not([data-starting-style]):not([data-ending-style])]:-translate-y-3 data-[cds-sheet-covered]:scale-[0.94] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-backdrop after:opacity-0 after:transition-opacity after:duration-sheet motion-reduce:after:transition-none data-[cds-sheet-covered]:after:opacity-100", sheet && "flex flex-col", !sheet && value7),
                    children: value21 !== null && sheetPopup.sheet ? jsxU7.jsx(value21.PopoverSheetContent, {
                      sheetPopup,
                      className: value7,
                      bodyRef: ref,
                      bodyClassName: (0, runtime2.cn)(POPOVER_LAYOUT_INHERIT_CLASS, value16 && "scroll-fade-y", POPOVER_PADDING_CLASSES[value15]),
                      closeLabel: value5,
                      children: value30
                    }) : jsxU7.jsxs(jsxU7.Fragment, {
                      children: [
                        jsxU7.jsx("div", {
                          ref,
                          tabIndex: -1,
                          "data-cds-popover-body": "",
                          [runtime2.SHEET_SCROLL_ATTRIBUTE]: "",
                          style: POPOVER_BODY_STYLE,
                          className: (0, runtime2.cn)(POPOVER_LAYOUT_INHERIT_CLASS, value16 && "scroll-fade-y", POPOVER_PADDING_CLASSES[value15]),
                          children: value30
                        }),
                        value29.length > 0 && jsxU7.jsx("div", {
                          ref: arrowWrapRef,
                          className: "contents forced-colors:hidden",
                          children: jsxU7.jsx(popoverTailReachContext.Provider, {
                            value: typeof value14 == "number" ? value14 : void 0,
                            children: value29
                          })
                        })
                      ]
                    })
                  })
                })
              })
            ]
          })
        });
      }), PopoverPopupView.displayName = "PopoverPopupView", PopoverTail = reactD6.forwardRef(function({ className, ...props }, ref) {
        let reach = reactD6.useContext(popoverTailReachContext);
        return jsxU7.jsx(runtime2.basePopover.Arrow, {
          ...props,
          ref,
          className: (0, runtime2.cn)(POPOVER_TAIL_CLASS, className),
          children: renderPopoverTail({ variant: "neutral", reach })
        });
      }), PopoverTail.displayName = "Popover.Tail", popoverStateContext = reactD6.createContext(null), popoverControlledStateContext = reactD6.createContext(null), PopoverRoot2.displayName = "Popover.Root", PopoverTrigger3 = reactD6.forwardRef(function(input, options) {
        let value = reactD6.useContext(popoverStateContext), callback = reactD6.useCallback((input2) => {
          value?.update({
            triggerEl: input2
          });
        }, [value]), value2 = (0, runtime2.useMergedRefs)(options, callback);
        return jsxU7.jsx(runtime2.basePopover.Trigger, {
          ...input,
          ref: value2
        });
      }), PopoverTrigger3.displayName = "Popover.Trigger", PopoverTriggerAlias = PopoverTrigger3, PopoverComponents = {
        Root: PopoverRoot2,
        Trigger: PopoverTriggerAlias,
        Popup: PopoverPopup3,
        Title: runtime2.basePopover.Title,
        Description: runtime2.basePopover.Description,
        Close: runtime2.basePopover.Close,
        Arrow: runtime2.basePopover.Arrow,
        Tail: PopoverTail,
        createHandle: runtime2.basePopover.createHandle
      };
    }), initializeUiMenu12 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeUiDisclosure)(), (0, runtime2.initializeTooltip)(), initializeUiMenu5(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactForUiMenu2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiMenu2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CHECKBOX_CLASS = `${checkboxVisualClasses} group-data-[unchecked]/cb:group-hover/cb:border-stronger group-data-[checked]/cb:bg-fill-accent group-data-[checked]/cb:border-transparent group-data-[indeterminate]/cb:bg-fill-accent group-data-[indeterminate]/cb:border-transparent group-data-[checked]/cb:group-hover/cb:bg-fill-accent-hover group-data-[indeterminate]/cb:group-hover/cb:bg-fill-accent-hover group-data-[disabled]/cb:group-data-[unchecked]/cb:group-hover/cb:border-strong group-focus-visible/cb:shadow-focus`, Checkbox = reactForUiMenu2.forwardRef(({ label, description, size: size4, className, disabledReason, animated = !1, "aria-describedby": ariaDescribedby, "aria-labelledby": ariaLabelledby, onMouseDown, ...props }, options) => {
        let value = reactForUiMenu2.useId(), value2 = reactForUiMenu2.useId(), value3 = label != null && typeof label != "boolean" && label !== "", value4 = value3 && !!description, [value5, value6] = reactForUiMenu2.useState(props.indeterminate ?? !1), value7 = props.indeterminate === !0 || props.checked === !1 && value5;
        value7 !== value5 && value6(value7);
        let value8 = jsxForUiMenu2.jsxs(runtime2.baseCheckbox.Root, {
          ref: options,
          "data-cds": "Checkbox",
          "aria-labelledby": ariaLabelledby || (value4 && !props["aria-label"] ? value : void 0),
          "aria-describedby": [ariaDescribedby, value4 ? value2 : void 0].filter(Boolean).join(" ") || void 0,
          ...props,
          ...size4 === "xxs" ? {
            "data-size": "xxs"
          } : (0, runtime2.getControlSizeAttributes)(size4),
          onMouseDown: (0, runtime2.withRepeatedClickSelectionPrevention)(onMouseDown),
          className: (0, runtime2.cn)("cds-reset group/cb border-0 outline-none focus-visible:outline-hidden data-[disabled]:opacity-disabled", CHECKBOX_MARK_CLASS, value3 ? "items-start" : "items-center", size4 === "xxs" && "[--cds-checkbox:var(--cds-checkbox-xxs)] [--cds-checkbox-radius:var(--cds-checkbox-xxs-radius)] [--cds-checkbox-glyph:var(--cds-checkbox-xxs-glyph)]", className),
          children: [
            jsxForUiMenu2.jsx("span", {
              className: (0, runtime2.clsx)(CHECKBOX_CLASS, animated && "transition-colors duration-fast ease-out motion-reduce:transition-none", value3 && "mt-[calc((1lh_-_var(--cds-checkbox,1rem))_/_2)]"),
              children: jsxForUiMenu2.jsx("span", {
                className: (0, runtime2.clsx)("text-on-accent [clip-path:inset(0_100%_0_0)] group-data-[checked]/cb:[clip-path:inset(0)] group-data-[indeterminate]/cb:[clip-path:inset(0)]", animated && "transition-[clip-path] duration-snap ease-out motion-reduce:transition-none group-data-[checked]/cb:duration-base group-data-[indeterminate]/cb:duration-base"),
                children: jsxForUiMenu2.jsx(CheckboxGlyph, {
                  indeterminate: value7
                })
              })
            }),
            value3 && (value4 ? jsxForUiMenu2.jsxs("span", {
              className: "flex min-w-0 flex-col",
              children: [
                jsxForUiMenu2.jsx("span", {
                  id: value,
                  children: label
                }),
                jsxForUiMenu2.jsx("span", {
                  id: value2,
                  className: footnoteDescriptionClasses,
                  children: description
                })
              ]
            }) : jsxForUiMenu2.jsx("span", {
              children: label
            }))
          ]
        });
        return disabledReason === void 0 ? value8 : jsxForUiMenu2.jsx(runtime2.DisabledReasonTooltip, {
          reason: props.disabled ? disabledReason : void 0,
          children: value8
        });
      }), Checkbox.displayName = "Checkbox";
    });
  };
}
export {
  installUiMenu
};
