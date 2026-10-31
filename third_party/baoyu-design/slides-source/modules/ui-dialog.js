// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiDialog(runtime2) {
  var reactI5, jsxD5, DIALOG_POPUP_CLASS, DIALOG_MAX_HEIGHT_CLASS, dialogFullHeightClasses, dialogPopupPositionClasses, dialogPopupTransitionClasses, dialogBackdropClasses, dialogStartingOpacityClass, dialogBackdropFocusAbortController, desktopWindowDragStripStyle, nestedDialogOverlayClasses, nestedDialogBlurClasses, dialogSizeClasses, DIALOG_Z_INDEX_CLASS_PATTERN, dialogStateContext, confirmationDialogContext, dialogTitleClasses, DIALOG_TITLE_CLASS, dialogDescriptionSmallSpacing, dialogDescriptionLargeSpacing, dialogDescriptionClasses, dialogTriggerRefContext, dialogInitialFocusContext, dialogPressTargets, isDialogActivationKey, TALL_WINDOW_QUERY, dialogBackdropBaseClasses, DialogTrigger3, DIALOG_AUTOFILL_WAIT_MS, DIALOG_HIDDEN_SELECTOR, DialogPopupInner, ConfirmationDialogPopupInner, DialogPopup3, DialogTitle3, dialogCloseButtonOutsetClasses, DialogDescription3, dialogFooterAlignmentClasses, DialogComponents, AlertDialogComponents, initializeUiDialog, reactForUiDialog, jsxForUiDialog, BUTTON_GROUP_SEGMENT_RING_CLASS, BUTTON_GROUP_VARIANT_COLORS, BUTTON_GROUP_SEAM_HOVER_CLASS, BUTTON_GROUP_SEAM_DISABLED_CLASS, BUTTON_GROUP_STACKS_NO_SHADOW_CLASS = "stacks:shadow-none stacks:after:shadow-none", BUTTON_GROUP_STACKS_SEAM_DISABLED_CLASS = "stacks:[[data-cds-segment]:has(:disabled:not([aria-busy]))+&:has(+[data-cds-segment]_:disabled:not([aria-busy]))]:opacity-100 stacks:[[data-cds-segment]:has(:disabled:not([aria-busy]))+&:has(+[data-cds-segment]_:disabled:not([aria-busy]))]:bg-fill-disabled", BUTTON_GROUP_STACKS_DANGER_LINE_CLASS = "stacks:bg-[var(--cds-text-danger)]", initializeUiDialog2, reactForUiDialog2, jsxForUiDialog2, SPLIT_CARET_STYLES, SPLIT_CARET_AUTO_STYLES, SPLIT_LABEL_STYLES, SPLIT_LABEL_CLASS, SPLIT_LABEL_PAD_STYLES, SPLIT_LABEL_HOVER_CLASSES, SPLIT_BUTTON_TRANSITION_CLASS, SPLIT_BUTTON_DISABLED_CLASS, SPLIT_INLINE_CARET_STYLES, SPLIT_CARET_HIT_CLASS, SPLIT_CARET_RECESSED_HIT_CLASS, SPLIT_CARET_OPEN_CLASS, SPLIT_LABEL_RADIUS_CLASS, SPLIT_CARET_RADIUS_CLASS, SPLIT_BUTTON_RING_CLASS, SPLIT_PAINT_EDGE_CLASS, SPLIT_GHOST_SEGMENT_CLASS, SPLIT_STACKS_SECONDARY_HOVER_CLASS, SPLIT_STACKS_GHOST_PEER_HOVER_CLASS, SPLIT_STACKS_DANGER_HOVER_CLASS, SPLIT_STACKS_DISABLED_TEXT_CLASS, SPLIT_STACKS_DISABLED_FILL_CLASS, SPLIT_STACKS_RING_CLASS, SPLIT_STACKS_GHOST_HOVER_CLASS, SPLIT_STACKS_ACTIVE_CLASSES, SPLIT_STACKS_CARET_EXPANDED_CLASS, SPLIT_FIZZY_CARET_HIT_CLASS, SPLIT_FIZZY_LABEL_HIT_CLASS, SPLIT_FIZZY_CARET_STYLES, SPLIT_FIZZY_CARET_ICON_STYLES, initializeUiDialog3;
  function preventDialogBackdropDefault(event) {
    event.preventDefault();
  }
  function preserveDialogBackdropFocus(event, pressClosesPopup) {
    if (event.button !== 0) {
      event.preventDefault();
      return;
    }
    let currentTarget = event.currentTarget, parentElement = currentTarget.parentElement, ownerDocument2 = currentTarget.ownerDocument, value = (0, runtime2.asElement)(ownerDocument2.activeElement);
    if (parentElement === null || value === null || !parentElement.contains(value))
      return;
    if (pressClosesPopup) {
      event.preventDefault();
      return;
    }
    dialogBackdropFocusAbortController?.abort();
    let value2 = new (ownerDocument2.defaultView?.AbortController ?? AbortController)();
    dialogBackdropFocusAbortController = value2;
    let { signal: value3 } = value2;
    value3.addEventListener("abort", () => {
      dialogBackdropFocusAbortController === value2 && (dialogBackdropFocusAbortController = null);
    }, {
      once: !0
    }), ownerDocument2.addEventListener("mousedown", () => value2.abort(), {
      capture: !0,
      once: !0,
      signal: value3
    }), ownerDocument2.addEventListener("mouseup", (event2) => {
      value2.abort(), event2.target !== currentTarget && ownerDocument2.activeElement === ownerDocument2.body && value.isConnected && value.focus({
        preventScroll: !0
      });
    }, {
      capture: !0,
      once: !0,
      signal: value3
    });
  }
  function DesktopWindowDragStrip() {
    return jsxD5.jsx("div", {
      "aria-hidden": !0,
      "data-cds-window-drag-strip": "",
      className: "fixed inset-x-0 top-0",
      style: desktopWindowDragStripStyle
    });
  }
  function useDialogStyleDebug(input) {
    reactI5.useEffect(() => {
    }, [input]);
  }
  function useDialogInitialFocus(input, options, context, value, extra, detail) {
    let ref = reactI5.useRef(null);
    return reactI5.useEffect(() => () => ref.current?.(), []), reactI5.useCallback(() => {
      let current = input.current, value2 = current?.ownerDocument, value3 = value2?.defaultView;
      if (current && value2 && value3) {
        value3.requestAnimationFrame(() => {
          if (!value.current || !current.isConnected)
            return;
          let current2 = context.current, activeElement2 = value2.activeElement;
          current2 && activeElement2 && activeElement2 !== current && current2.contains(activeElement2) || current.focus({
            preventScroll: !0,
            focusVisible: options
          });
        });
        let index4 = 0, flag = !1, callback = (event) => {
          let current2 = context.current, target = event.target;
          if (!(flag || !value.current || extra.current || index4 >= 3 || !current2 || !(target instanceof value3.Element) || current2.contains(target))) {
            if (!target.closest(DIALOG_HIDDEN_SELECTOR)) {
              flag = !0;
              return;
            }
            index4 += 1, value3.requestAnimationFrame(() => {
              let value5 = detail();
              !value.current || extra.current || !value5?.isConnected || value5 instanceof value3.HTMLButtonElement && value5.disabled || value5.focus({
                preventScroll: !0,
                focusVisible: value5 !== context.current
              });
            });
          }
        };
        ref.current?.(), value2.addEventListener("focusin", callback, !0);
        let value4 = value3.setTimeout(() => ref.current?.(), 1e3);
        ref.current = () => {
          value3.clearTimeout(value4), value2.removeEventListener("focusin", callback, !0), ref.current = null;
        };
      }
      return current;
    }, [input, options, context, value, extra, detail]);
  }
  function DialogCloseButton({ "aria-label": ariaLabel, className, flush = !1 }) {
    let value = (0, runtime2.useTranslation)("close", "Close");
    return jsxD5.jsx(runtime2.baseAlertDialog.Close, {
      render: jsxD5.jsx(runtime2.Button, {
        variant: "ghost",
        iconOnly: !0,
        icon: "X",
        "aria-label": ariaLabel ?? value,
        tooltip: !1,
        className: (0, runtime2.cn)(flush && dialogCloseButtonOutsetClasses, className)
      })
    });
  }
  function DialogHeader({ actions, description, showClose = !0, closeLabel, className, children }) {
    let value = reactI5.useContext(confirmationDialogContext);
    return jsxD5.jsxs("div", {
      className: (0, runtime2.cn)("mb-pad-md flex items-start gap-2", className),
      children: [
        jsxD5.jsxs("div", {
          className: (0, runtime2.clsx)(value ? dialogDescriptionSmallSpacing : dialogDescriptionLargeSpacing, "flex min-w-0 flex-1 flex-col gap-1"),
          children: [
            jsxD5.jsx(DialogTitle3, {
              children
            }),
            description && jsxD5.jsx(runtime2.baseAlertDialog.Description, {
              className: "text-body font-normal text-secondary break-words",
              children: description
            })
          ]
        }),
        actions && jsxD5.jsx("div", {
          className: "-mt-pad-sm",
          children: actions
        }),
        showClose && jsxD5.jsx(DialogCloseButton, {
          "aria-label": closeLabel,
          flush: !0
        })
      ]
    });
  }
  function DialogFooter({ align: align2 = "end", className, children }) {
    return jsxD5.jsx("div", {
      className: (0, runtime2.cn)("mt-pad-lg flex flex-col-reverse gap-2 sm:flex-row", "max-sm:[&>[data-cds-disabled-reason-wrapper]]:flex-col", dialogFooterAlignmentClasses[align2], className),
      children
    });
  }
  function useTallWindowRef() {
    let [element, setElement] = reactI5.useState(null);
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let value = getTallWindowQuery(element);
      if (!element || !value)
        return;
      let update2 = () => {
        element.toggleAttribute("data-cds-tall-window", value.matches);
      };
      return update2(), value.addEventListener("change", update2), () => value.removeEventListener("change", update2);
    }, [element]), reactI5.useCallback((input) => {
      let value = getTallWindowQuery(input);
      input && value && input.toggleAttribute("data-cds-tall-window", value.matches), setElement(input);
    }, []);
  }
  function getTallWindowQuery(element) {
    return element ? (0, runtime2.getElementWindow)(element)?.matchMedia?.(TALL_WINDOW_QUERY) : void 0;
  }
  function takeDialogPressTarget(element) {
    let value = dialogPressTargets.get(element);
    return dialogPressTargets.delete(element), value;
  }
  function shouldBlockClosedDialogEvent(event, phase) {
    let currentTarget = event.currentTarget, closed4 = currentTarget.hasAttribute("data-closed");
    if (phase === "submit") {
      let pressTarget = takeDialogPressTarget(currentTarget), submitter = event.nativeEvent.submitter ?? null;
      return closed4 && !(submitter !== null && (pressTarget !== void 0 && submitter.contains(pressTarget) || currentTarget.contains(event.target) && !currentTarget.contains(submitter)));
    }
    if (phase === "click" && !closed4) {
      let target = event.target;
      dialogPressTargets.set(currentTarget, target.closest("button, input") ?? target);
    } else
      dialogPressTargets.delete(currentTarget);
    return closed4;
  }
  function getClosedDialogGuardProps(props) {
    let guard = (handler, blocks, preventDefault = !0) => (event) => {
      if (blocks(event)) {
        preventDefault && event.preventDefault(), event.stopPropagation();
        return;
      }
      handler?.(event);
    };
    return {
      onPointerDownCapture: guard(props.onPointerDownCapture, (event) => shouldBlockClosedDialogEvent(event, "start"), !1),
      onMouseDownCapture: guard(props.onMouseDownCapture, (event) => shouldBlockClosedDialogEvent(event, "start")),
      onClickCapture: guard(props.onClickCapture, (event) => shouldBlockClosedDialogEvent(event, "click")),
      onAuxClickCapture: guard(props.onAuxClickCapture, (event) => shouldBlockClosedDialogEvent(event, "start")),
      onKeyDownCapture: guard(props.onKeyDownCapture, (event) => {
        let value = shouldBlockClosedDialogEvent(event, "start");
        return isDialogActivationKey(event) && value;
      }),
      onSubmitCapture: guard(props.onSubmitCapture, (event) => shouldBlockClosedDialogEvent(event, "submit"))
    };
  }
  function DialogRoot3({ dismissible, disablePointerDismissal, actionsRef, onOpenChange, ...props }) {
    let ref = reactI5.useRef(null), ref2 = reactI5.useRef(null);
    (0, runtime2.useForwardedOverlayActions)(ref2, actionsRef);
    let value = disablePointerDismissal ?? (dismissible === !1 ? !0 : void 0), [outsidePressWrappers] = reactI5.useState(runtime2.createOutsidePressWrappers);
    return jsxD5.jsx(confirmationDialogContext.Provider, {
      value: !1,
      children: jsxD5.jsx(dialogStateContext.Provider, {
        value: props.modal,
        children: jsxD5.jsx(dialogTriggerRefContext.Provider, {
          value: ref,
          children: jsxD5.jsx(dialogInitialFocusContext.Provider, {
            value: value ? null : outsidePressWrappers,
            children: jsxD5.jsx(runtime2.CloseOnActivityHideProvider, {
              actionsRef: ref2,
              children: jsxD5.jsx(runtime2.baseAlertDialog.Root, {
                disablePointerDismissal: value,
                actionsRef: ref2,
                onOpenChange: (open4, eventDetails) => {
                  if (eventDetails.reason === "outside-press" && outsidePressWrappers.refusesClose()) {
                    eventDetails.cancel();
                    return;
                  }
                  onOpenChange?.(open4, eventDetails);
                },
                ...props
              })
            })
          })
        })
      })
    });
  }
  function AlertDialogRoot2({ actionsRef, ...props }) {
    let ref = reactI5.useRef(null);
    return (0, runtime2.useForwardedOverlayActions)(ref, actionsRef), jsxD5.jsx(confirmationDialogContext.Provider, {
      value: !0,
      children: jsxD5.jsx(dialogStateContext.Provider, {
        value: !0,
        children: jsxD5.jsx(dialogInitialFocusContext.Provider, {
          value: null,
          children: jsxD5.jsx(runtime2.CloseOnActivityHideProvider, {
            actionsRef: ref,
            children: jsxD5.jsx(runtime2.baseDialog.Root, {
              ...props,
              actionsRef: ref
            })
          })
        })
      })
    });
  }
  function ConfirmationDialog({ open: open4, onOpenChange, title, description, confirmLabel, cancelLabel, confirmVariant = "primary", initialFocus = "confirm", disabled: disabled2 = !1, confirmDisabledReason, size: size4 = "sm", className, portalClassName, onConfirm, closeOnConfirm = !1, children }) {
    let value = (0, runtime2.useTranslation)("confirm", "Confirm"), value2 = (0, runtime2.useTranslation)("cancel", "Cancel"), value3 = confirmLabel ?? value, value4 = cancelLabel ?? value2, [value5, value6] = reactI5.useState(!1), ref = reactI5.useRef(null), ref2 = reactI5.useRef(null), { finalFocus: value7, popupRef: value8 } = (0, runtime2.useOverlayFinalFocus)(open4), callback = () => initialFocus === "cancel" ? "cancel" : disabled2 ? "pending" : "confirm", [value9, value10] = reactI5.useState(callback), ref3 = reactI5.useRef(value9);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      ref3.current = value9;
    }, [value9]);
    let callback2 = reactI5.useCallback(() => {
      switch (ref3.current) {
        case "confirm":
          return ref2.current;
        case "cancel":
          return ref.current;
        default:
          return value8.current;
      }
    }, [value8]), ref4 = reactI5.useRef(!1), callback3 = reactI5.useCallback(() => {
      ref4.current = !0;
    }, []);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      open4 && (ref4.current = !1, value10(callback()));
    }, [open4]);
    let callback4 = reactI5.useCallback((input) => {
      value10(input);
      let value15 = input === "confirm" ? ref2.current : ref.current, current = value8.current;
      if (!value15 || !current)
        return;
      let activeElement2 = value15.ownerDocument.activeElement, value16 = !activeElement2 || activeElement2 === current || activeElement2 === value15.ownerDocument.body || !current.contains(activeElement2) && activeElement2.closest(DIALOG_HIDDEN_SELECTOR) !== null, value17 = activeElement2 === ref.current || activeElement2 === ref2.current;
      (value16 || value17 && !ref4.current) && value15.focus({
        preventScroll: !0,
        focusVisible: !0
      });
    }, [value8]);
    reactI5.useEffect(() => {
      if (!open4 || value9 !== "pending")
        return;
      if (!disabled2) {
        let value16 = requestAnimationFrame(() => callback4("confirm"));
        return () => cancelAnimationFrame(value16);
      }
      let value15 = setTimeout(() => callback4("cancel"), DIALOG_AUTOFILL_WAIT_MS);
      return () => clearTimeout(value15);
    }, [disabled2, value9, callback4, open4]);
    let ref5 = reactI5.useRef(open4);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      ref5.current = open4;
    }, [open4]);
    let value11 = useDialogInitialFocus(value9 === "confirm" ? ref2 : value9 === "cancel" ? ref : value8, value9 !== "pending", value8, ref5, ref4, callback2), callback5 = reactI5.useCallback((event) => {
      event.repeat && (event.key === "Enter" || event.key === " ") && event.preventDefault();
    }, []), ref6 = reactI5.useRef(!1);
    reactI5.useEffect(() => {
      open4 && (ref6.current = !1);
    }, [open4]);
    let value12 = (0, runtime2.usePortalContainer)(), callback6 = reactI5.useCallback(() => {
      if (value5 || disabled2 || !open4 || ref6.current)
        return;
      closeOnConfirm ? ref6.current = !0 : value6(!0);
      let value15;
      try {
        value15 = Promise.resolve(onConfirm());
      } catch (value16) {
        value15 = Promise.reject(value16);
      }
      closeOnConfirm && onOpenChange(!1, {
        reason: "confirm"
      }), value15.finally(() => {
        closeOnConfirm || value6(!1);
      });
    }, [value5, closeOnConfirm, disabled2, onConfirm, onOpenChange, open4]), callback7 = reactI5.useCallback((input) => {
      value5 || !open4 || onOpenChange(input, {
        reason: "dismiss"
      });
    }, [value5, onOpenChange, open4]), value13 = (0, runtime2.useDefaultOverlayLayer)("modal");
    useDialogStyleDebug(portalClassName);
    let ref7 = reactI5.useRef(null), value14 = jsxD5.jsx(runtime2.Button, {
      ref: ref2,
      variant: confirmVariant,
      busy: value5,
      disabled: disabled2,
      disabledReason: confirmDisabledReason,
      "data-initial-focus": value9 === "confirm" ? "" : void 0,
      onClick: callback6,
      onKeyDown: callback5,
      children: value3
    });
    return jsxD5.jsx(runtime2.CloseOnActivityHideProvider, {
      actionsRef: ref7,
      children: jsxD5.jsx(runtime2.baseDialog.Root, {
        open: open4,
        onOpenChange: callback7,
        actionsRef: ref7,
        children: jsxD5.jsx(runtime2.baseDialog.Portal, {
          container: value12,
          children: jsxD5.jsx(runtime2.PortalRoot, {
            className: (0, runtime2.cn)("relative", portalClassName),
            style: value13.style,
            surface: runtime2.elevationSurfaceNames.popover,
            closeOnActivityHide: !0,
            children: jsxD5.jsxs(runtime2.layerBaseContext.Provider, {
              value: value13.base,
              children: [
                jsxD5.jsx(runtime2.baseDialog.Backdrop, {
                  forceRender: !0,
                  onMouseDown: preventDialogBackdropDefault,
                  className: (0, runtime2.clsx)(dialogBackdropClasses, dialogStartingOpacityClass)
                }),
                jsxD5.jsx(DesktopWindowDragStrip, {}),
                jsxD5.jsx(ConfirmationDialogPopupInner, {
                  "data-cds": "ConfirmationDialog",
                  ref: value8,
                  onKeyDownCapture: callback3,
                  onPointerDownCapture: callback3,
                  initialFocus: value11,
                  finalFocus: value7,
                  className: (0, runtime2.cn)("draggable-none", nestedDialogOverlayClasses, dialogFullHeightClasses, dialogPopupTransitionClasses, nestedDialogBlurClasses, dialogSizeClasses[size4], className),
                  children: jsxD5.jsxs("div", {
                    className: dialogPopupPositionClasses,
                    children: [
                      jsxD5.jsx(runtime2.baseDialog.Title, {
                        className: (0, runtime2.clsx)(dialogDescriptionSmallSpacing, dialogTitleClasses, "text-primary"),
                        children: title
                      }),
                      description && jsxD5.jsx(runtime2.baseDialog.Description, {
                        className: dialogDescriptionClasses,
                        children: description
                      }),
                      children,
                      jsxD5.jsxs(DialogFooter, {
                        children: [
                          jsxD5.jsx(runtime2.baseDialog.Close, {
                            render: jsxD5.jsx(runtime2.Button, {
                              ref,
                              variant: "secondary",
                              disabled: value5,
                              "data-initial-focus": value9 === "cancel" ? "" : void 0,
                              children: value4
                            })
                          }),
                          value14
                        ]
                      })
                    ]
                  })
                })
              ]
            })
          })
        })
      })
    });
  }
  function ButtonGroupSeam({ variant, line }) {
    let value = BUTTON_GROUP_VARIANT_COLORS[variant];
    if (!value)
      return jsxForUiDialog.jsx("span", {
        "aria-hidden": !0,
        className: "w-px shrink-0 self-stretch"
      });
    let value2 = variant === "secondary" ? "" : BUTTON_GROUP_SEAM_DISABLED_CLASS;
    return jsxForUiDialog.jsx("span", {
      "aria-hidden": !0,
      className: `relative w-px shrink-0 self-stretch ${value.seam} ${BUTTON_GROUP_SEAM_HOVER_CLASS} ${value2} ${BUTTON_GROUP_STACKS_SEAM_DISABLED_CLASS} ${variant === "danger" ? runtime2.stacksDangerButtonBgClasses : ""}`,
      children: line && jsxForUiDialog.jsx("span", {
        "data-cds-seam-line": "",
        className: `absolute inset-x-0 inset-y-1/4 ${value.line} ${variant === "danger" ? BUTTON_GROUP_STACKS_DANGER_LINE_CLASS : ""}`
      })
    });
  }
  function ButtonGroupRoot({ "aria-label": ariaLabel, variant = "spaced", orientation = "horizontal", size: size4, buttonVariant = "secondary", dividers = !0, className, children, ...remainingProps }) {
    let value = variant === "joined", value2 = reactForUiDialog.Children.toArray(children), value3 = value2.length - 1, value4 = value && value3 > 0, memo4 = reactForUiDialog.useMemo(() => {
      let state = {
        size: size4,
        buttonVariant,
        enforceVariant: value
      };
      return {
        start: {
          ...state,
          joined: value4 ? "start" : void 0
        },
        middle: {
          ...state,
          joined: value4 ? "middle" : void 0
        },
        end: {
          ...state,
          joined: value4 ? "end" : void 0
        }
      };
    }, [size4, buttonVariant, value, value4]);
    return jsxForUiDialog.jsx("div", {
      "data-cds": "ButtonGroup",
      ...remainingProps,
      role: "group",
      "aria-label": ariaLabel,
      ...(0, runtime2.getControlSizeAttributes)(size4),
      className: (0, runtime2.cn)("relative inline-flex w-fit shrink-0", orientation === "vertical" ? "flex-col items-stretch" : "items-stretch", value4 ? `${runtime2.buttonRadiusClasses} ${buttonVariant === "secondary" ? `shadow-field-drop ${BUTTON_GROUP_SEGMENT_RING_CLASS}` : ""}` : value ? "" : "gap-xs", value4 && buttonVariant === "secondary" ? BUTTON_GROUP_STACKS_NO_SHADOW_CLASS : "", className),
      children: jsxForUiDialog.jsx(runtime2.TooltipProvider, {
        children: value2.map((input, options) => {
          let value5 = options === 0 ? "start" : options === value3 ? "end" : "middle";
          return jsxForUiDialog.jsxs(reactForUiDialog.Fragment, {
            children: [
              value4 && options > 0 && jsxForUiDialog.jsx(ButtonGroupSeam, {
                variant: buttonVariant,
                line: dividers
              }),
              jsxForUiDialog.jsx(runtime2.buttonGroupContext.Provider, {
                value: memo4[value5],
                children: jsxForUiDialog.jsx("div", {
                  "data-cds-segment": "",
                  className: "contents",
                  children: input
                })
              })
            ]
          }, reactForUiDialog.isValidElement(input) ? input.key : options);
        })
      })
    });
  }
  function SplitButton({ variant = "secondary", size: size4, label, icon, shortcut, hideShortcut, tooltip = !1, tooltipSide, indicator, "aria-label": ariaLabel, "aria-expanded": ariaExpanded, "aria-haspopup": ariaHaspopup, "aria-controls": ariaControls, "aria-keyshortcuts": ariaKeyshortcuts, "aria-disabled": ariaDisabled, "aria-describedby": ariaDescribedby, onPrimaryClick, onPrimaryPointerDown, onPrimaryMouseDown, pressed: pressed3, pressedVariant, primaryRef, groupLabel, menuLabel, menuTooltip, items, disabled: disabled2, busy, status, caretSize, side: side2, align: align2 = "end", collisionPadding, open: open4, onOpenChange, className }) {
    let value = (0, runtime2.useTranslation)("moreOptions", "更多选项"), value2 = menuLabel ?? value, value3 = (0, runtime2.useDensity)(), value4 = caretSize ?? (0, runtime2.getMenuCaretSize)(value3, size4), value5 = !disabled2 && (variant === "secondary" || variant === "ghost"), [value6, value7] = reactForUiDialog2.useState(!1), value8 = open4 ?? value6, callback = (input) => {
      value7(input), onOpenChange?.(input);
    }, value9 = status != null && status !== !1, value10 = variant === "ghost" && label !== void 0 && !value9, value11 = variant === "ghost" && label === void 0 && !value9, value12 = variant === "ghost" && value9, value13 = value10 || value11, fizzyGhost = (0, runtime2.useFizzyColorPart)() && value13, fizzyIcons = (0, runtime2.useFeatureFlagPart)("icons") && fizzyGhost, value14 = (0, runtime2.getButtonIconVerticalPadding)((0, runtime2.useButtonIconSize)(size4)), value15 = fizzyGhost ? SPLIT_FIZZY_CARET_STYLES : variant !== "ghost" ? SPLIT_CARET_STYLES : value10 ? SPLIT_INLINE_CARET_STYLES : value11 ? {
      ...SPLIT_CARET_AUTO_STYLES,
      "--cds-split-caret-tuck": value14,
      marginInlineStart: `calc(-1 * ${value14})`
    } : SPLIT_CARET_AUTO_STYLES, state = {
      ...ariaKeyshortcuts !== void 0 ? {
        "aria-keyshortcuts": ariaKeyshortcuts
      } : void 0,
      ...ariaDisabled !== void 0 && !busy ? {
        "aria-disabled": ariaDisabled
      } : void 0,
      ...ariaDescribedby !== void 0 ? {
        "aria-describedby": ariaDescribedby
      } : void 0
    }, value16 = jsxForUiDialog2.jsxs("div", {
      className: "contents",
      children: [
        label === void 0 ? jsxForUiDialog2.jsx(runtime2.Button, {
          ref: primaryRef,
          busy,
          disabled: disabled2,
          pressed: pressed3,
          pressedVariant,
          onClick: onPrimaryClick,
          onPointerDown: onPrimaryPointerDown,
          onMouseDown: onPrimaryMouseDown,
          icon,
          iconOnly: !0,
          "aria-label": ariaLabel ?? "",
          "aria-expanded": ariaExpanded,
          "aria-haspopup": ariaHaspopup,
          "aria-controls": ariaControls,
          ...state,
          tooltip,
          tooltipSide,
          indicator,
          className: (0, runtime2.clsx)(value9 && "peer/slot", value12 && SPLIT_LABEL_RADIUS_CLASS, value11 && SPLIT_CARET_OPEN_CLASS, value11 && SPLIT_GHOST_SEGMENT_CLASS, value11 && SPLIT_STACKS_GHOST_HOVER_CLASS, fizzyGhost && SPLIT_FIZZY_LABEL_HIT_CLASS)
        }) : jsxForUiDialog2.jsx(runtime2.Button, {
          ref: primaryRef,
          busy,
          disabled: disabled2,
          pressed: pressed3,
          pressedVariant,
          onClick: onPrimaryClick,
          onPointerDown: onPrimaryPointerDown,
          onMouseDown: onPrimaryMouseDown,
          "aria-expanded": ariaExpanded,
          "aria-haspopup": ariaHaspopup,
          "aria-controls": ariaControls,
          ...state,
          icon,
          shortcut,
          hideShortcut,
          className: (0, runtime2.clsx)(SPLIT_LABEL_CLASS, value10 && SPLIT_GHOST_SEGMENT_CLASS, value10 && SPLIT_STACKS_GHOST_HOVER_CLASS, fizzyGhost && SPLIT_FIZZY_LABEL_HIT_CLASS, value9 && "peer/slot", value12 && SPLIT_LABEL_RADIUS_CLASS),
          style: value10 && !fizzyGhost ? SPLIT_LABEL_STYLES : value9 ? SPLIT_LABEL_PAD_STYLES : void 0,
          children: label
        }),
        value9 && jsxForUiDialog2.jsx("span", {
          className: (0, runtime2.cn)("flex shrink-0 items-center self-stretch pe-[min(var(--cds-pad-md),var(--cds-button-pad-max,var(--cds-pad-md)))]", value12 && runtime2.buttonEndRadiusClasses, BUTTON_GROUP_VARIANT_COLORS[variant]?.seam, SPLIT_LABEL_HOVER_CLASSES[variant], variant === "secondary" && SPLIT_STACKS_SECONDARY_HOVER_CLASS, variant === "ghost" && SPLIT_STACKS_GHOST_PEER_HOVER_CLASS, variant === "danger" && "stacks:bg-danger", variant === "danger" && SPLIT_STACKS_DANGER_HOVER_CLASS, pressed3 !== !0 && SPLIT_STACKS_ACTIVE_CLASSES[variant], SPLIT_BUTTON_TRANSITION_CLASS, "stacks:transition-none", SPLIT_BUTTON_DISABLED_CLASS, runtime2.stacksButtonFillClasses[variant] !== void 0 && SPLIT_STACKS_DISABLED_TEXT_CLASS, runtime2.stacksButtonFillClasses[variant] !== void 0 && variant !== "ghost" && SPLIT_STACKS_DISABLED_FILL_CLASS),
          children: status
        })
      ]
    });
    return jsxForUiDialog2.jsxs(ButtonGroupRoot, {
      "data-cds": "SplitDropdownButton",
      "aria-label": groupLabel ?? (typeof label == "string" ? label : ariaLabel ?? value2),
      variant: "joined",
      buttonVariant: variant,
      size: size4,
      className: (0, runtime2.cn)("group/split", value13 && SPLIT_BUTTON_RING_CLASS, value13 && SPLIT_STACKS_RING_CLASS, value10 && !fizzyGhost && SPLIT_PAINT_EDGE_CLASS, className),
      "data-popup-open": value8 ? "" : void 0,
      "data-disabled": disabled2 || void 0,
      style: value13 ? {
        "--cds-split-inset": `min(calc(${value14} / 2), 3px)`
      } : void 0,
      children: [
        value16,
        jsxForUiDialog2.jsx(runtime2.Menu, {
          iconOnly: !0,
          icon: jsxForUiDialog2.jsx(runtime2.Icon, {
            name: fizzyIcons ? (0, runtime2.fizzyIconName)("CaretDownSmall") : "CaretDown",
            size: fizzyIcons ? "sm" : fizzyGhost ? "xs" : value4,
            style: fizzyIcons ? SPLIT_FIZZY_CARET_ICON_STYLES : void 0,
            className: value5 ? "text-muted" : void 0
          }),
          "aria-label": value2,
          tooltip: menuTooltip ?? fizzyGhost,
          disabled: disabled2,
          className: variant === "ghost" ? (0, runtime2.cn)(SPLIT_CARET_HIT_CLASS, value11 && !fizzyGhost && SPLIT_CARET_RECESSED_HIT_CLASS, fizzyGhost && SPLIT_FIZZY_CARET_HIT_CLASS, value13 && SPLIT_STACKS_CARET_EXPANDED_CLASS, value13 && SPLIT_STACKS_GHOST_HOVER_CLASS) : void 0,
          items,
          side: side2,
          align: align2,
          collisionPadding,
          open: open4,
          onOpenChange: callback,
          style: value15
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "preventDialogBackdropDefault", () => preventDialogBackdropDefault), bindRuntimeValue(runtime2, "preserveDialogBackdropFocus", () => preserveDialogBackdropFocus), bindRuntimeValue(runtime2, "takeDialogPressTarget", () => takeDialogPressTarget), bindRuntimeValue(runtime2, "shouldBlockClosedDialogEvent", () => shouldBlockClosedDialogEvent), bindRuntimeValue(runtime2, "getClosedDialogGuardProps", () => getClosedDialogGuardProps), bindRuntimeValue(runtime2, "getTallWindowQuery", () => getTallWindowQuery), bindRuntimeValue(runtime2, "useTallWindowRef", () => useTallWindowRef), bindRuntimeValue(runtime2, "dialogPressTargets", () => dialogPressTargets, (value) => {
    dialogPressTargets = value;
  }), bindRuntimeValue(runtime2, "isDialogActivationKey", () => isDialogActivationKey, (value) => {
    isDialogActivationKey = value;
  }), bindRuntimeValue(runtime2, "TALL_WINDOW_QUERY", () => TALL_WINDOW_QUERY, (value) => {
    TALL_WINDOW_QUERY = value;
  }), bindRuntimeValue(runtime2, "dialogBackdropBaseClasses", () => dialogBackdropBaseClasses, (value) => {
    dialogBackdropBaseClasses = value;
  }), bindRuntimeValue(runtime2, "DesktopWindowDragStrip", () => DesktopWindowDragStrip), bindRuntimeValue(runtime2, "useDialogStyleDebug", () => useDialogStyleDebug), bindRuntimeValue(runtime2, "useDialogInitialFocus", () => useDialogInitialFocus), bindRuntimeValue(runtime2, "DialogCloseButton", () => DialogCloseButton), bindRuntimeValue(runtime2, "DialogHeader", () => DialogHeader), bindRuntimeValue(runtime2, "DialogFooter", () => DialogFooter), bindRuntimeValue(runtime2, "DialogRoot", () => DialogRoot3), bindRuntimeValue(runtime2, "AlertDialogRoot", () => AlertDialogRoot2), bindRuntimeValue(runtime2, "ConfirmationDialog", () => ConfirmationDialog), bindRuntimeValue(runtime2, "reactI5", () => reactI5, (value) => {
    reactI5 = value;
  }), bindRuntimeValue(runtime2, "jsxD5", () => jsxD5, (value) => {
    jsxD5 = value;
  }), bindRuntimeValue(runtime2, "DIALOG_POPUP_CLASS", () => DIALOG_POPUP_CLASS, (value) => {
    DIALOG_POPUP_CLASS = value;
  }), bindRuntimeValue(runtime2, "DIALOG_MAX_HEIGHT_CLASS", () => DIALOG_MAX_HEIGHT_CLASS, (value) => {
    DIALOG_MAX_HEIGHT_CLASS = value;
  }), bindRuntimeValue(runtime2, "dialogFullHeightClasses", () => dialogFullHeightClasses, (value) => {
    dialogFullHeightClasses = value;
  }), bindRuntimeValue(runtime2, "dialogPopupPositionClasses", () => dialogPopupPositionClasses, (value) => {
    dialogPopupPositionClasses = value;
  }), bindRuntimeValue(runtime2, "dialogPopupTransitionClasses", () => dialogPopupTransitionClasses, (value) => {
    dialogPopupTransitionClasses = value;
  }), bindRuntimeValue(runtime2, "dialogBackdropClasses", () => dialogBackdropClasses, (value) => {
    dialogBackdropClasses = value;
  }), bindRuntimeValue(runtime2, "dialogStartingOpacityClass", () => dialogStartingOpacityClass, (value) => {
    dialogStartingOpacityClass = value;
  }), bindRuntimeValue(runtime2, "dialogBackdropFocusAbortController", () => dialogBackdropFocusAbortController, (value) => {
    dialogBackdropFocusAbortController = value;
  }), bindRuntimeValue(runtime2, "desktopWindowDragStripStyle", () => desktopWindowDragStripStyle, (value) => {
    desktopWindowDragStripStyle = value;
  }), bindRuntimeValue(runtime2, "nestedDialogOverlayClasses", () => nestedDialogOverlayClasses, (value) => {
    nestedDialogOverlayClasses = value;
  }), bindRuntimeValue(runtime2, "nestedDialogBlurClasses", () => nestedDialogBlurClasses, (value) => {
    nestedDialogBlurClasses = value;
  }), bindRuntimeValue(runtime2, "dialogSizeClasses", () => dialogSizeClasses, (value) => {
    dialogSizeClasses = value;
  }), bindRuntimeValue(runtime2, "DIALOG_Z_INDEX_CLASS_PATTERN", () => DIALOG_Z_INDEX_CLASS_PATTERN, (value) => {
    DIALOG_Z_INDEX_CLASS_PATTERN = value;
  }), bindRuntimeValue(runtime2, "dialogStateContext", () => dialogStateContext, (value) => {
    dialogStateContext = value;
  }), bindRuntimeValue(runtime2, "confirmationDialogContext", () => confirmationDialogContext, (value) => {
    confirmationDialogContext = value;
  }), bindRuntimeValue(runtime2, "dialogTitleClasses", () => dialogTitleClasses, (value) => {
    dialogTitleClasses = value;
  }), bindRuntimeValue(runtime2, "DIALOG_TITLE_CLASS", () => DIALOG_TITLE_CLASS, (value) => {
    DIALOG_TITLE_CLASS = value;
  }), bindRuntimeValue(runtime2, "dialogDescriptionSmallSpacing", () => dialogDescriptionSmallSpacing, (value) => {
    dialogDescriptionSmallSpacing = value;
  }), bindRuntimeValue(runtime2, "dialogDescriptionLargeSpacing", () => dialogDescriptionLargeSpacing, (value) => {
    dialogDescriptionLargeSpacing = value;
  }), bindRuntimeValue(runtime2, "dialogDescriptionClasses", () => dialogDescriptionClasses, (value) => {
    dialogDescriptionClasses = value;
  }), bindRuntimeValue(runtime2, "dialogTriggerRefContext", () => dialogTriggerRefContext, (value) => {
    dialogTriggerRefContext = value;
  }), bindRuntimeValue(runtime2, "dialogInitialFocusContext", () => dialogInitialFocusContext, (value) => {
    dialogInitialFocusContext = value;
  }), bindRuntimeValue(runtime2, "DialogTrigger", () => DialogTrigger3, (value) => {
    DialogTrigger3 = value;
  }), bindRuntimeValue(runtime2, "DIALOG_AUTOFILL_WAIT_MS", () => DIALOG_AUTOFILL_WAIT_MS, (value) => {
    DIALOG_AUTOFILL_WAIT_MS = value;
  }), bindRuntimeValue(runtime2, "DIALOG_HIDDEN_SELECTOR", () => DIALOG_HIDDEN_SELECTOR, (value) => {
    DIALOG_HIDDEN_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "DialogPopupInner", () => DialogPopupInner, (value) => {
    DialogPopupInner = value;
  }), bindRuntimeValue(runtime2, "ConfirmationDialogPopupInner", () => ConfirmationDialogPopupInner, (value) => {
    ConfirmationDialogPopupInner = value;
  }), bindRuntimeValue(runtime2, "DialogPopup", () => DialogPopup3, (value) => {
    DialogPopup3 = value;
  }), bindRuntimeValue(runtime2, "DialogTitle", () => DialogTitle3, (value) => {
    DialogTitle3 = value;
  }), bindRuntimeValue(runtime2, "dialogCloseButtonOutsetClasses", () => dialogCloseButtonOutsetClasses, (value) => {
    dialogCloseButtonOutsetClasses = value;
  }), bindRuntimeValue(runtime2, "DialogDescription", () => DialogDescription3, (value) => {
    DialogDescription3 = value;
  }), bindRuntimeValue(runtime2, "dialogFooterAlignmentClasses", () => dialogFooterAlignmentClasses, (value) => {
    dialogFooterAlignmentClasses = value;
  }), bindRuntimeValue(runtime2, "DialogComponents", () => DialogComponents, (value) => {
    DialogComponents = value;
  }), bindRuntimeValue(runtime2, "AlertDialogComponents", () => AlertDialogComponents, (value) => {
    AlertDialogComponents = value;
  }), bindRuntimeValue(runtime2, "initializeUiDialog", () => initializeUiDialog, (value) => {
    initializeUiDialog = value;
  }), bindRuntimeValue(runtime2, "ButtonGroupSeam", () => ButtonGroupSeam), bindRuntimeValue(runtime2, "ButtonGroupRoot", () => ButtonGroupRoot), bindRuntimeValue(runtime2, "reactForUiDialog", () => reactForUiDialog, (value) => {
    reactForUiDialog = value;
  }), bindRuntimeValue(runtime2, "jsxForUiDialog", () => jsxForUiDialog, (value) => {
    jsxForUiDialog = value;
  }), bindRuntimeValue(runtime2, "BUTTON_GROUP_SEGMENT_RING_CLASS", () => BUTTON_GROUP_SEGMENT_RING_CLASS, (value) => {
    BUTTON_GROUP_SEGMENT_RING_CLASS = value;
  }), bindRuntimeValue(runtime2, "BUTTON_GROUP_VARIANT_COLORS", () => BUTTON_GROUP_VARIANT_COLORS, (value) => {
    BUTTON_GROUP_VARIANT_COLORS = value;
  }), bindRuntimeValue(runtime2, "BUTTON_GROUP_SEAM_HOVER_CLASS", () => BUTTON_GROUP_SEAM_HOVER_CLASS, (value) => {
    BUTTON_GROUP_SEAM_HOVER_CLASS = value;
  }), bindRuntimeValue(runtime2, "BUTTON_GROUP_SEAM_DISABLED_CLASS", () => BUTTON_GROUP_SEAM_DISABLED_CLASS, (value) => {
    BUTTON_GROUP_SEAM_DISABLED_CLASS = value;
  }), bindRuntimeValue(runtime2, "initializeUiDialog2", () => initializeUiDialog2, (value) => {
    initializeUiDialog2 = value;
  }), bindRuntimeValue(runtime2, "SplitButton", () => SplitButton), bindRuntimeValue(runtime2, "reactForUiDialog2", () => reactForUiDialog2, (value) => {
    reactForUiDialog2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiDialog2", () => jsxForUiDialog2, (value) => {
    jsxForUiDialog2 = value;
  }), bindRuntimeValue(runtime2, "SPLIT_CARET_STYLES", () => SPLIT_CARET_STYLES, (value) => {
    SPLIT_CARET_STYLES = value;
  }), bindRuntimeValue(runtime2, "SPLIT_CARET_AUTO_STYLES", () => SPLIT_CARET_AUTO_STYLES, (value) => {
    SPLIT_CARET_AUTO_STYLES = value;
  }), bindRuntimeValue(runtime2, "SPLIT_LABEL_STYLES", () => SPLIT_LABEL_STYLES, (value) => {
    SPLIT_LABEL_STYLES = value;
  }), bindRuntimeValue(runtime2, "SPLIT_LABEL_CLASS", () => SPLIT_LABEL_CLASS, (value) => {
    SPLIT_LABEL_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_LABEL_PAD_STYLES", () => SPLIT_LABEL_PAD_STYLES, (value) => {
    SPLIT_LABEL_PAD_STYLES = value;
  }), bindRuntimeValue(runtime2, "SPLIT_LABEL_HOVER_CLASSES", () => SPLIT_LABEL_HOVER_CLASSES, (value) => {
    SPLIT_LABEL_HOVER_CLASSES = value;
  }), bindRuntimeValue(runtime2, "SPLIT_BUTTON_TRANSITION_CLASS", () => SPLIT_BUTTON_TRANSITION_CLASS, (value) => {
    SPLIT_BUTTON_TRANSITION_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_BUTTON_DISABLED_CLASS", () => SPLIT_BUTTON_DISABLED_CLASS, (value) => {
    SPLIT_BUTTON_DISABLED_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_INLINE_CARET_STYLES", () => SPLIT_INLINE_CARET_STYLES, (value) => {
    SPLIT_INLINE_CARET_STYLES = value;
  }), bindRuntimeValue(runtime2, "SPLIT_CARET_HIT_CLASS", () => SPLIT_CARET_HIT_CLASS, (value) => {
    SPLIT_CARET_HIT_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_CARET_RECESSED_HIT_CLASS", () => SPLIT_CARET_RECESSED_HIT_CLASS, (value) => {
    SPLIT_CARET_RECESSED_HIT_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_CARET_OPEN_CLASS", () => SPLIT_CARET_OPEN_CLASS, (value) => {
    SPLIT_CARET_OPEN_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_LABEL_RADIUS_CLASS", () => SPLIT_LABEL_RADIUS_CLASS, (value) => {
    SPLIT_LABEL_RADIUS_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_CARET_RADIUS_CLASS", () => SPLIT_CARET_RADIUS_CLASS, (value) => {
    SPLIT_CARET_RADIUS_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_BUTTON_RING_CLASS", () => SPLIT_BUTTON_RING_CLASS, (value) => {
    SPLIT_BUTTON_RING_CLASS = value;
  }), bindRuntimeValue(runtime2, "SPLIT_PAINT_EDGE_CLASS", () => SPLIT_PAINT_EDGE_CLASS, (value) => {
    SPLIT_PAINT_EDGE_CLASS = value;
  }), bindRuntimeValue(runtime2, "initializeUiDialog3", () => initializeUiDialog3, (value) => {
    initializeUiDialog3 = value;
  }), () => {
    DIALOG_MAX_HEIGHT_CLASS = "max-h-[calc(100dvh_-_max(2rem,2*var(--desktop-titlebar-inset,0px))_-_2*max(env(safe-area-inset-top,0px),env(safe-area-inset-bottom,0px)))]", dialogPopupPositionClasses = "isolate flex min-h-0 flex-1 flex-col overflow-y-auto scroll-fade-y rounded-[inherit] p-xl break-words", dialogPopupTransitionClasses = "transition-[opacity,scale,filter] duration-base ease-out motion-reduce:transition-none data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98] starting:opacity-0 starting:scale-[0.98] motion-reduce:data-[starting-style]:scale-100 data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]", dialogBackdropBaseClasses = "fixed inset-0 bg-backdrop transition-opacity duration-base ease-out motion-reduce:transition-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 has-[~[data-nested]]:bg-transparent has-[~[data-nested]]:backdrop-blur-none", dialogBackdropClasses = `draggable-none ${dialogBackdropBaseClasses}`, TALL_WINDOW_QUERY = "(min-height: 30rem)", isDialogActivationKey = (event) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.key !== "Enter" && event.key !== " ")
        return !1;
      let target = event.target;
      return (0, runtime2.isEditableElement)(target) ? event.key === "Enter" && (event.metaKey || event.ctrlKey || target.tagName !== "TEXTAREA" && (0, runtime2.asElement)(target)?.isContentEditable !== !0) : !0;
    }, dialogStartingOpacityClass = "starting:opacity-0", dialogBackdropFocusAbortController = null, nestedDialogOverlayClasses = "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-backdrop after:opacity-0 after:z-50 after:transition-opacity after:duration-base after:ease-out data-[nested-dialog-open]:after:opacity-100", nestedDialogBlurClasses = "data-[nested-dialog-open]:blur-[2px]", dialogTitleClasses = "text-heading font-medium font-header break-words", DIALOG_TITLE_CLASS = "text-title font-semibold font-header break-words", dialogDescriptionSmallSpacing = "-mt-0.5", dialogDescriptionLargeSpacing = "-mt-1", dialogDescriptionClasses = "mt-1 text-body font-normal text-secondary break-words", DIALOG_AUTOFILL_WAIT_MS = 250, DIALOG_HIDDEN_SELECTOR = '[aria-hidden="true"], [inert]', dialogCloseButtonOutsetClasses = "-me-pad-sm -mt-pad-sm", initializeUiDialog = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeElementAccess)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeOverlaySelector)(), (0, runtime2.initializeCloseOnActivityHide)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeUiDisclosure9)(), (0, runtime2.initializeSurfaces)(), (0, runtime2.initializeOverlayActions)(), (0, runtime2.initializeOverlayFocus)(), (0, runtime2.initializeUiInputs10)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactI5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxD5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), DIALOG_POPUP_CLASS = `${(0, runtime2.getSurfaceClasses)("popover")} shadow-panel-lg`, dialogFullHeightClasses = `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-[calc(100vw_-_2rem_-_2*max(env(safe-area-inset-left,0px),env(safe-area-inset-right,0px)))] ${DIALOG_MAX_HEIGHT_CLASS} ${DIALOG_POPUP_CLASS} cds-reset text-body font-normal text-primary outline-none focus-visible:outline-hidden`, desktopWindowDragStripStyle = {
        height: "var(--desktop-titlebar-inset, 0px)",
        WebkitAppRegion: "drag"
      }, dialogSizeClasses = {
        sm: "max-w-[400px]",
        md: "max-w-[520px]",
        lg: "max-w-[720px]",
        xl: "max-w-[880px]",
        "2xl": "max-w-[1024px]",
        "3xl": "max-w-[1152px]"
      }, DIALOG_Z_INDEX_CLASS_PATTERN = /(^|\s)!?-?z-/, dialogStateContext = reactI5.createContext(void 0), confirmationDialogContext = reactI5.createContext(!1), dialogTriggerRefContext = reactI5.createContext(void 0), dialogInitialFocusContext = reactI5.createContext(null), dialogPressTargets = /* @__PURE__ */ new WeakMap(), DialogTrigger3 = reactI5.forwardRef((input, options) => {
        let value = reactI5.useContext(dialogTriggerRefContext), value2 = input.handle ? null : value ?? null, value3 = (0, runtime2.useMergedRefs)(options, value2);
        return jsxD5.jsx(runtime2.baseAlertDialog.Trigger, {
          ref: value3,
          ...input
        });
      }), DialogTrigger3.displayName = "Dialog.Trigger", DialogPopupInner = reactI5.forwardRef(({ finalFocus, fitVisualViewport, children, ...props }, options) => {
        let value = reactI5.useContext(dialogStateContext), value2 = reactI5.useContext(dialogTriggerRefContext), { finalFocus: value3, popupRef: value4 } = (0, runtime2.useOverlayFinalFocus)(!0, value !== !1, value2), value5 = (0, runtime2.useDialogVisualKeyboard)(fitVisualViewport), tallWindowRef = useTallWindowRef(), sheetTreeMarker = value === void 0 || value === !0 ? runtime2.markSheetTreeDialog : runtime2.unmarkSheetTreeDialog, { announceRef, hosts } = (0, runtime2.useSheetTreeDialogAnnouncement)(sheetTreeMarker === runtime2.markSheetTreeDialog), popupRefs = (0, runtime2.useMergedRefs)(value5, tallWindowRef, sheetTreeMarker), announcedRefs = (0, runtime2.useMergedRefs)(popupRefs, announceRef), value6 = (0, runtime2.useMergedRefs)(options, value4, announcedRefs), guardProps = getClosedDialogGuardProps(props);
        return jsxD5.jsx(runtime2.baseAlertDialog.Popup, {
          [runtime2.OVERLAY_ATTRIBUTE]: "",
          ref: value6,
          finalFocus: finalFocus ?? value3,
          "aria-modal": value === !1 ? "false" : void 0,
          ...props,
          ...guardProps,
          children: jsxD5.jsx(runtime2.sheetTreeHostsContext.Provider, {
            value: hosts,
            children
          })
        });
      }), DialogPopupInner.displayName = "Dialog.PopupInner", ConfirmationDialogPopupInner = reactI5.forwardRef(({ children, ...props }, options) => {
        let value = (0, runtime2.useDialogVisualKeyboard)(!0), tallWindowRef = useTallWindowRef(), popupRefs = (0, runtime2.useMergedRefs)(value, tallWindowRef, runtime2.markSheetTreeDialog), { announceRef, hosts } = (0, runtime2.useSheetTreeDialogAnnouncement)(!0), value2 = (0, runtime2.useMergedRefs)(options, popupRefs, announceRef), guardProps = getClosedDialogGuardProps(props);
        return jsxD5.jsx(runtime2.baseDialog.Popup, {
          [runtime2.OVERLAY_ATTRIBUTE]: "",
          ref: value2,
          ...props,
          ...guardProps,
          children: jsxD5.jsx(runtime2.sheetTreeHostsContext.Provider, {
            value: hosts,
            children
          })
        });
      }), ConfirmationDialogPopupInner.displayName = "ConfirmationDialog.PopupInner", DialogPopup3 = reactI5.forwardRef(({ size: size4 = "md", fullHeight = !1, unstyled = !1, surface, backdropClassName, backdropStyle, portalClassName, className, children, ...props }, options) => {
        let value = unstyled ? "" : `${dialogFullHeightClasses} ${dialogPopupTransitionClasses} ${nestedDialogBlurClasses} ${dialogSizeClasses[size4]} ${fullHeight ? "h-dvh" : ""}`, value2 = (0, runtime2.useDefaultOverlayLayer)("modal");
        useDialogStyleDebug(portalClassName);
        let value3 = reactI5.useContext(dialogStateContext), value4 = reactI5.useContext(dialogInitialFocusContext), value5 = value3 === void 0 || value3 === !0, nonModal = value3 === !1;
        return jsxD5.jsx(runtime2.baseAlertDialog.Portal, {
          container: (0, runtime2.usePortalContainer)(),
          children: jsxD5.jsx(runtime2.PortalRoot, {
            className: (0, runtime2.cn)("relative", portalClassName),
            style: value2.style,
            surface: surface ?? (unstyled ? void 0 : runtime2.elevationSurfaceNames.popover),
            closeOnActivityHide: !0,
            children: jsxD5.jsxs(runtime2.layerBaseContext.Provider, {
              value: value2.base,
              children: [
                jsxD5.jsx(runtime2.baseAlertDialog.Backdrop, {
                  forceRender: value5,
                  onPointerDownCapture: value4?.pressStarted,
                  onMouseDown: (event) => {
                    value4 === null ? preventDialogBackdropDefault(event) : preserveDialogBackdropFocus(event, value4.pressClosesPopup());
                  },
                  className: (0, runtime2.cn)(nonModal ? dialogBackdropBaseClasses : dialogBackdropClasses, !unstyled && dialogStartingOpacityClass, nonModal && "pointer-events-none opacity-0", backdropClassName),
                  style: backdropStyle
                }),
                !nonModal && jsxD5.jsx(DesktopWindowDragStrip, {}),
                jsxD5.jsx(DialogPopupInner, {
                  "data-cds": "Dialog",
                  ref: options,
                  ...props,
                  fitVisualViewport: !unstyled,
                  className: (0, runtime2.cn)("draggable-none", nestedDialogOverlayClasses, value, className),
                  children: jsxD5.jsx(runtime2.outsidePressWrappersContext.Provider, {
                    value: value4,
                    children: unstyled ? children : jsxD5.jsx("div", {
                      className: dialogPopupPositionClasses,
                      children
                    })
                  })
                })
              ]
            })
          })
        });
      }), DialogPopup3.displayName = "Dialog.Popup", DialogTitle3 = reactI5.forwardRef(({ className, ...props }, options) => {
        let value = reactI5.useContext(confirmationDialogContext);
        return jsxD5.jsx(runtime2.baseAlertDialog.Title, {
          ref: options,
          ...props,
          className: (0, runtime2.cn)("text-primary", value ? dialogTitleClasses : DIALOG_TITLE_CLASS, className)
        });
      }), DialogTitle3.displayName = "Dialog.Title", DialogCloseButton.displayName = "Dialog.CloseButton", DialogHeader.displayName = "Dialog.Header", DialogDescription3 = reactI5.forwardRef(({ className, ...props }, options) => jsxD5.jsx(runtime2.baseAlertDialog.Description, {
        ref: options,
        ...props,
        className: (0, runtime2.cn)(dialogDescriptionClasses, className)
      })), DialogDescription3.displayName = "Dialog.Description", dialogFooterAlignmentClasses = {
        start: "sm:justify-start",
        center: "sm:justify-center",
        end: "sm:justify-end",
        between: "sm:justify-between"
      }, DialogFooter.displayName = "Dialog.Footer", DialogRoot3.displayName = "Dialog.Root", DialogComponents = {
        Root: DialogRoot3,
        Trigger: DialogTrigger3,
        Popup: DialogPopup3,
        Backdrop: runtime2.baseAlertDialog.Backdrop,
        Header: DialogHeader,
        Title: DialogTitle3,
        Description: DialogDescription3,
        Footer: DialogFooter,
        Close: runtime2.baseAlertDialog.Close,
        CloseButton: DialogCloseButton
      }, AlertDialogRoot2.displayName = "AlertDialog.Root", AlertDialogComponents = {
        Root: AlertDialogRoot2,
        Trigger: runtime2.baseDialog.Trigger,
        Popup: DialogPopup3,
        Backdrop: runtime2.baseDialog.Backdrop,
        Header: DialogHeader,
        Title: DialogTitle3,
        Description: DialogDescription3,
        Footer: DialogFooter,
        Close: runtime2.baseDialog.Close,
        CloseButton: DialogCloseButton,
        createHandle: runtime2.baseDialog.createHandle
      };
    }), BUTTON_GROUP_SEGMENT_RING_CLASS = "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:[box-shadow:inset_0_0_0_1px_var(--cds-fill-secondary-ring)]", BUTTON_GROUP_SEAM_HOVER_CLASS = "[[data-cds-segment]:hover+&>[data-cds-seam-line]]:opacity-0 [&:has(+[data-cds-segment]:hover)>[data-cds-seam-line]]:opacity-0 [[data-cds-segment]:has([aria-haspopup][aria-expanded=true])+&>[data-cds-seam-line]]:opacity-0 [&:has(+[data-cds-segment]_[aria-haspopup][aria-expanded=true])>[data-cds-seam-line]]:opacity-0 [[data-cds-segment]:has([aria-pressed=true])+&>[data-cds-seam-line]]:opacity-0 [&:has(+[data-cds-segment]_[aria-pressed=true])>[data-cds-seam-line]]:opacity-0", BUTTON_GROUP_SEAM_DISABLED_CLASS = "[[data-cds-segment]:has(:disabled:not([aria-busy]))+&:has(+[data-cds-segment]_:disabled:not([aria-busy]))]:opacity-disabled", initializeUiDialog2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeButtonVariantClasses)(), (0, runtime2.initializeTooltip)(), (0, runtime2.initializeUiDisclosure9)(), reactForUiDialog = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiDialog = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), BUTTON_GROUP_VARIANT_COLORS = {
        secondary: {
          seam: "bg-fill-secondary",
          line: "bg-border"
        },
        primary: {
          seam: "bg-fill-primary",
          line: "bg-[var(--cds-on-primary)] opacity-25"
        },
        danger: {
          seam: "bg-fill-danger",
          line: "bg-[var(--cds-on-danger)] opacity-25"
        },
        brand: {
          seam: "bg-fill-brand",
          line: "bg-[var(--cds-on-brand)] opacity-25"
        }
      };
    }), SPLIT_LABEL_CLASS = "min-w-0 shrink", SPLIT_BUTTON_TRANSITION_CLASS = "transition-colors duration-fast ease-out", SPLIT_BUTTON_DISABLED_CLASS = "peer-[:disabled:not([aria-busy])]/slot:opacity-disabled", SPLIT_CARET_HIT_CLASS = "after:absolute after:inset-y-0 after:start-0 after:-end-2 after:content-['']", SPLIT_CARET_RECESSED_HIT_CLASS = "pointer-events-none after:pointer-events-auto after:start-[calc(var(--cds-split-caret-tuck)-1px)] after:-end-[calc(3px+var(--cds-split-caret-tuck))]", SPLIT_CARET_OPEN_CLASS = "group-data-[popup-open]/split:pointer-events-none", SPLIT_LABEL_RADIUS_CLASS = "rounded-e-none", SPLIT_CARET_RADIUS_CLASS = "rounded-e", SPLIT_GHOST_SEGMENT_CLASS = "", SPLIT_STACKS_SECONDARY_HOVER_CLASS = "stacks:peer-hover/slot:bg-fill-secondary stacks:peer-hover/slot:layers-1-fill-button-layer", SPLIT_STACKS_GHOST_PEER_HOVER_CLASS = "stacks:peer-hover/slot:bg-fill-button-ghost-hover", SPLIT_STACKS_DANGER_HOVER_CLASS = "stacks:peer-hover/slot:bg-danger stacks:peer-hover/slot:layers-1-danger-layer", SPLIT_STACKS_DISABLED_TEXT_CLASS = "stacks:peer-[:disabled:not([aria-busy])]/slot:opacity-100 stacks:peer-[:disabled:not([aria-busy])]/slot:text-button-disabled", SPLIT_STACKS_DISABLED_FILL_CLASS = "stacks:peer-[:disabled:not([aria-busy])]/slot:bg-fill-disabled", SPLIT_STACKS_RING_CLASS = "stacks:shadow-none stacks:[&_[data-cds-part=paint]]:p-0", SPLIT_STACKS_GHOST_HOVER_CLASS = "stacks:group-[:not([data-disabled])]/split:group-hover/split:not-aria-pressed:[&_[data-cds-part=paint]]:bg-fill-button-ghost-hover stacks:group-data-[popup-open]/split:not-aria-pressed:[&_[data-cds-part=paint]]:bg-fill-button-ghost-hover stacks:hover:not-aria-pressed:[&_[data-cds-part=paint]]:layers-1-fill-button-layer", SPLIT_FIZZY_CARET_HIT_CLASS = "after:-start-[2px] after:-end-[9px]", SPLIT_FIZZY_LABEL_HIT_CLASS = "after:absolute after:inset-0 after:rounded-s-[inherit] after:content-['']", SPLIT_PAINT_EDGE_CLASS = "[&>[data-cds-segment]:first-child_[data-cds-part=paint]]:pe-0 [&>[data-cds-segment]:last-child_[data-cds-part=paint]]:ps-0", initializeUiDialog3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeButtonVariantClasses)(), (0, runtime2.initializeUiDisclosure9)(), (0, runtime2.initializeUiMenu9)(), initializeUiDialog2(), (0, runtime2.initializeNpmDependency)(), reactForUiDialog2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiDialog2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SPLIT_CARET_STYLES = {
        aspectRatio: "auto",
        paddingInline: 4,
        minWidth: 0
      }, SPLIT_CARET_AUTO_STYLES = {
        ...SPLIT_CARET_STYLES,
        width: "auto"
      }, SPLIT_LABEL_STYLES = {
        paddingInlineEnd: 5
      }, SPLIT_LABEL_PAD_STYLES = {
        paddingInlineEnd: 4
      }, SPLIT_LABEL_HOVER_CLASSES = {
        primary: "peer-hover/slot:bg-fill-primary-hover",
        secondary: "peer-hover/slot:bg-fill-secondary-hover",
        ghost: "peer-hover/slot:bg-fill-ghost-hover",
        danger: "peer-hover/slot:bg-fill-danger-hover",
        brand: "peer-hover/slot:bg-fill-brand-hover"
      }, SPLIT_INLINE_CARET_STYLES = {
        ...SPLIT_CARET_AUTO_STYLES,
        paddingInlineStart: 0
      }, SPLIT_STACKS_ACTIVE_CLASSES = {
        primary: "stacks:peer-active/slot:bg-fill-primary-hover stacks:peer-active/slot:layers-1-fill-primary-layer",
        secondary: "stacks:peer-active/slot:layers-2-fill-button-layer",
        ghost: "stacks:peer-active/slot:bg-fill-button-ghost-hover stacks:peer-active/slot:layers-1-fill-button-layer",
        danger: "stacks:peer-active/slot:layers-2-danger-layer"
      }, SPLIT_STACKS_CARET_EXPANDED_CLASS = (0, runtime2.cn)(!1, "stacks:aria-expanded:[&_[data-cds-part=paint]]:layers-1-fill-button-layer"), SPLIT_FIZZY_CARET_STYLES = {
        ...SPLIT_CARET_AUTO_STYLES,
        paddingInline: 1,
        marginInlineStart: 1
      }, SPLIT_FIZZY_CARET_ICON_STYLES = {
        margin: -2
      }, SPLIT_BUTTON_RING_CLASS = [
        "shadow-[inset_0_0_0_1px_var(--cds-split-ring,transparent)] transition-[box-shadow] duration-fast ease-out",
        "[&:not([data-disabled])]:hover:[--cds-split-ring:var(--cds-border)]",
        "data-[popup-open]:[--cds-split-ring:var(--cds-border)]",
        "[&:not([data-disabled])]:has-[[aria-pressed=true]]:[--cds-split-ring:var(--cds-border)]",
        "[&_[data-cds-part=paint]]:p-(--cds-split-inset) [&_[data-cds-part=paint]]:bg-clip-content"
      ].join(" ");
    });
  };
}
export {
  installUiDialog
};
