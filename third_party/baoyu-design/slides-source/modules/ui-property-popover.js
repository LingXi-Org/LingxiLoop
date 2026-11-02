// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyPopover(runtime2) {
  var reactForUiPropertyPopover, reactDOMForUiPropertyPopover, jsxForUiPropertyPopover, initializeUiPropertyPopover, reactForUiPropertyPopover2, jsxForUiPropertyPopover2, popupCloseStack, preventPopupMouseDown, preservePopupSelection, initializeUiPropertyPopover2;
  function blurActivePopupEditor() {
    let activeElement2 = document.activeElement;
    activeElement2?.closest("[data-mc-popover], [data-mc-menu]") && (activeElement2.tagName === "INPUT" || activeElement2.tagName === "TEXTAREA" || activeElement2.isContentEditable) && activeElement2.blur();
  }
  function PopupScrim({ onClose }) {
    let ref = reactForUiPropertyPopover.useRef(onClose);
    ref.current = onClose;
    let ref2 = reactForUiPropertyPopover.useRef(null), ref3 = reactForUiPropertyPopover.useRef(!1), stopPressThrough = reactForUiPropertyPopover.useRef(void 0);
    reactForUiPropertyPopover.useEffect(() => () => stopPressThrough.current?.(), []);
    let [value, value2] = reactForUiPropertyPopover.useState(!1), ref4 = reactForUiPropertyPopover.useRef(!1);
    reactForUiPropertyPopover.useEffect(() => {
      let callback = () => {
        ref4.current = !0, ref2.current && (ref2.current.style.pointerEvents = "none"), value2(!0);
      }, callback2 = () => {
        ref4.current = !1, ref2.current && (ref2.current.style.pointerEvents = ""), value2(!1);
      };
      document.addEventListener("dragstart", callback, !0), document.addEventListener("dragend", callback2, !0), document.addEventListener("drop", callback2, !0);
      let current = ref2.current, callback3 = (event) => {
        if (event.preventDefault(), !current)
          return;
        current.style.pointerEvents = "none", blurActivePopupEditor(), ref.current();
        let value3 = document.elementFromPoint?.(event.clientX, event.clientY);
        value3 && value3 !== current && value3.dispatchEvent(new WheelEvent("wheel", event));
      }, callback4 = (event) => {
        event.preventDefault(), current && (current.style.pointerEvents = "none"), blurActivePopupEditor(), ref.current();
      };
      return current?.addEventListener("wheel", callback3, {
        passive: !1
      }), current?.addEventListener("gesturestart", callback4, {
        passive: !1
      }), current?.addEventListener("gesturechange", callback4, {
        passive: !1
      }), () => {
        document.removeEventListener("dragstart", callback, !0), document.removeEventListener("dragend", callback2, !0), document.removeEventListener("drop", callback2, !0), current?.removeEventListener("wheel", callback3), current?.removeEventListener("gesturestart", callback4), current?.removeEventListener("gesturechange", callback4);
      };
    }, []);
    let focusWindow = () => {
      document.hasFocus() || window.focus();
    };
    return reactDOMForUiPropertyPopover.createPortal(jsxForUiPropertyPopover.jsx("div", {
      ref: ref2,
      "data-mc-scrim": "",
      "aria-hidden": "true",
      className: "fixed inset-0 z-scrim",
      style: {
        pointerEvents: value ? "none" : void 0
      },
      onPointerDown: (event) => {
        event.pointerType !== "touch" && focusWindow(), event.preventDefault(), event.stopPropagation(), blurActivePopupEditor();
        let scrim = event.currentTarget, closeForPress = () => {
          ref3.current = !1, scrim.style.pointerEvents = "none", ref.current();
        };
        event.button === 0 ? (ref3.current = !0, (0, runtime2.isMacControlClick)(event) || (stopPressThrough.current = (0, runtime2.pressThroughOnDrag)(event.nativeEvent, closeForPress))) : (0, runtime2.pressThroughNow)(event.nativeEvent, closeForPress);
      },
      onPointerCancel: () => {
        ref3.current && (ref3.current = !1, onClose());
      },
      onClick: (input) => {
        input.stopPropagation(), ref3.current && (ref3.current = !1, focusWindow(), onClose());
      },
      onContextMenu: (event) => {
        event.preventDefault(), event.stopPropagation(), blurActivePopupEditor(), onClose();
      },
      onDragEnter: () => {
        ref4.current || (blurActivePopupEditor(), onClose());
      }
    }), document.body);
  }
  function suppressRepeatedEnterClicks(input) {
    let value = input, flag = !1, flag2 = !1, callback = () => {
      window.removeEventListener("keydown", callback2, !0), window.removeEventListener("keyup", callback2, !0), window.removeEventListener("click", callback4, !0), window.removeEventListener("blur", callback3);
    }, callback2 = (input2) => {
      input2.key === "Enter" && (value = input2.type === "keydown", flag = value && input2.repeat, flag2 && !flag && callback());
    }, callback3 = () => {
      value = flag = !1, flag2 && callback();
    }, callback4 = (event) => {
      !flag || event.detail !== 0 || (event.preventDefault(), event.stopPropagation());
    };
    return window.addEventListener("keydown", callback2, !0), window.addEventListener("keyup", callback2, !0), window.addEventListener("click", callback4, !0), window.addEventListener("blur", callback3), () => {
      flag2 = !0, value || callback();
    };
  }
  function usePopupOpenFocus(input) {
    reactForUiPropertyPopover2.useEffect(() => input ? suppressRepeatedEnterClicks(!1) : void 0, [input]);
  }
  function suppressEnterClicksUntilRelease() {
    suppressRepeatedEnterClicks(!0)();
  }
  function PropertyPopup({ open: open4, onClose, trigger, onOpen, children, align: align2 = "right", side: side2, planHeight, positionAnchor, popupAttrs, editsAreUndoSteps = !1, padding = "default", className, "aria-label": ariaLabel, focusOnOpen = !1, initialFocus, keepFocus = !1, maxWidth, gap }) {
    let ref = reactForUiPropertyPopover2.useRef(null);
    usePopupOpenFocus(open4 && focusOnOpen);
    let documentHasFocus = (0, runtime2.useDocumentHasFocus)(open4 && focusOnOpen), hadFocusWhileOpen = reactForUiPropertyPopover2.useRef(!0);
    reactForUiPropertyPopover2.useLayoutEffect(() => {
      open4 && (hadFocusWhileOpen.current = documentHasFocus);
    }, [open4, documentHasFocus]);
    let restoreFocus = focusOnOpen && (open4 ? documentHasFocus : hadFocusWhileOpen.current || document.hasFocus()), ref2 = reactForUiPropertyPopover2.useRef(null), value = reactForUiPropertyPopover2.useContext(runtime2.ToolbarTooltipSideContext), value2 = side2 === void 0 ? value : void 0, value3 = side2 ?? value2 ?? "bottom", value4 = value3 === "bottom" || value3 === "top", [value5, value6] = reactForUiPropertyPopover2.useState({
      side: value4 ? value3 : "bottom",
      maxHeight: void 0
    });
    reactForUiPropertyPopover2.useLayoutEffect(() => {
      open4 && value6(value4 && planHeight !== void 0 ? (0, runtime2.choosePopoverSide)(positionAnchor?.() ?? ref2.current?.parentElement, planHeight, value3, value2 !== void 0 ? runtime2.popupFocusReturnTimer : void 0) : {
        side: value4 ? value3 : "bottom",
        maxHeight: void 0
      });
    }, [open4]);
    let value7 = value4 && planHeight !== void 0, value8 = value4 ? value5.side : value3, collisionPadding = (0, runtime2.useFootInsetCollisionPadding)(open4), ref3 = reactForUiPropertyPopover2.useRef(onClose);
    ref3.current = onClose;
    let ref4 = reactForUiPropertyPopover2.useRef(onOpen);
    ref4.current = onOpen;
    let ref5 = reactForUiPropertyPopover2.useRef(!1);
    return reactForUiPropertyPopover2.useEffect(() => {
      if (!open4)
        return;
      ref5.current = !1;
      let value9 = Symbol("popover");
      popupCloseStack.push(value9);
      let callback = () => popupCloseStack[popupCloseStack.length - 1] === value9, callback2 = (event) => {
        if (!callback())
          return;
        let target = event.target;
        if (target instanceof Element && target.hasAttribute("data-mc-scrim") || (0, runtime2.anyMenuOrPopoverOpen)() || target instanceof Element && target.closest(runtime2.MENU_POPOVER_OPEN_SELECTORS) !== null)
          return;
        let value10 = ref2.current?.parentElement?.contains(target) ?? !1, value11 = ref.current?.contains(target) ?? !1;
        !value10 && !value11 && ref3.current();
      }, callback3 = (event) => {
        let target = event.target;
        target instanceof Element && target.closest("[data-mc-strip]") !== null && callback2(event);
      }, callback4 = (event) => {
        event.defaultPrevented || !callback() || (0, runtime2.anyMenuOrPopoverOpen)() || event.key === "Escape" && (event.preventDefault(), ref3.current());
      }, callback5 = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !callback() || (0, runtime2.anyMenuOrPopoverOpen)())
          return;
        let target = event.target;
        target && (ref.current?.contains(target) || target.closest("[data-mc-popover]") !== null) && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) || (event.preventDefault(), event.stopPropagation(), ref3.current());
      };
      return document.addEventListener("pointerdown", callback2), document.addEventListener("pointerdown", callback3, {
        capture: !0
      }), window.addEventListener("keydown", callback4), window.addEventListener("keydown", callback5, {
        capture: !0
      }), () => {
        let value10 = popupCloseStack.indexOf(value9);
        value10 >= 0 && popupCloseStack.splice(value10, 1), document.removeEventListener("pointerdown", callback2), document.removeEventListener("pointerdown", callback3, {
          capture: !0
        }), window.removeEventListener("keydown", callback4), window.removeEventListener("keydown", callback5, {
          capture: !0
        });
      };
    }, [open4]), jsxForUiPropertyPopover2.jsxs(jsxForUiPropertyPopover2.Fragment, {
      children: [
        jsxForUiPropertyPopover2.jsx("span", {
          ref: ref2,
          className: "hidden",
          "aria-hidden": "true"
        }),
        open4 ? jsxForUiPropertyPopover2.jsx(PopupScrim, {
          onClose: () => ref3.current()
        }) : null,
        jsxForUiPropertyPopover2.jsxs(runtime2.PopoverComponents.Root, {
          open: open4,
          onOpenChange: (input, options) => {
            if (input) {
              ref4.current?.();
              return;
            }
            if (options.reason === "escape-key") {
              options.event.defaultPrevented || (options.event.preventDefault(), ref5.current || ref3.current(), ref5.current = !0), options.cancel();
              return;
            }
            if (options.reason === "trigger-press" || options.reason === "imperative-action" || options.reason === "close-press" || options.reason === "focus-out" && isBaseUiFocusGuardEvent(options)) {
              ref5.current || ref3.current(), ref5.current = !0;
              return;
            }
            options.cancel();
          },
          children: [
            trigger !== void 0 ? jsxForUiPropertyPopover2.jsx(runtime2.PopoverComponents.Trigger, {
              render: trigger
            }) : null,
            jsxForUiPropertyPopover2.jsx(runtime2.PopoverComponents.Popup, {
              ref,
              "aria-label": ariaLabel,
              anchor: () => positionAnchor?.() ?? ref2.current?.parentElement ?? null,
              side: value8,
              align: !value4 || align2 === "left" ? "start" : "end",
              sideOffset: gap ?? (value3 === "right" ? 12 : value3 === "left" ? 8 : 4),
              collisionPadding,
              style: {
                maxHeight: value7 && value5.maxHeight !== void 0 ? `min(${value5.maxHeight}px, var(--available-height))` : void 0,
                maxWidth: maxWidth !== void 0 ? `min(${maxWidth}, var(--available-width))` : void 0
              },
              padding: "none",
              initialFocus: focusOnOpen ? initialFocus : !1,
              finalFocus: restoreFocus ? trigger !== void 0 ? !0 : void 0 : !1,
              onKeyDown: focusOnOpen && trigger === void 0 ? (event) => {
                if (event.key !== "Tab")
                  return;
                let current = ref.current;
                if (!current || !current.contains(document.activeElement))
                  return;
                let value9 = collectFocusableDescendants(current);
                if (value9.length === 0)
                  return;
                let value10 = value9[0], value11 = value9[value9.length - 1];
                event.shiftKey && document.activeElement === value10 ? (event.preventDefault(), value11?.focus()) : !event.shiftKey && document.activeElement === value11 && (event.preventDefault(), value10?.focus());
              } : void 0,
              "data-mc-popover": "",
              ...editsAreUndoSteps ? runtime2.pendingPopupFocusReturn : {},
              children: jsxForUiPropertyPopover2.jsx("div", {
                ...popupAttrs,
                className: (0, runtime2.joinClassNames)("min-w-48", padding === "none" ? void 0 : "p-1", className),
                onMouseDown: keepFocus ? preservePopupSelection : void 0,
                children: jsxForUiPropertyPopover2.jsx(runtime2.ToolbarTooltipSideContext.Provider, {
                  value: void 0,
                  children
                })
              })
            })
          ]
        })
      ]
    });
  }
  function PropertyMenuItem({ onClick, children, disabled: disabled2, title, danger, checked: checked5, hint, icon, "data-testid": dataTestid }) {
    return jsxForUiPropertyPopover2.jsxs("button", {
      type: "button",
      "data-kit": "MenuItem",
      "data-testid": dataTestid,
      disabled: disabled2,
      title,
      "aria-pressed": checked5,
      onMouseDown: preventPopupMouseDown,
      onClick,
      className: (0, runtime2.joinClassNames)((0, runtime2.menuItemVariants)({
        variant: danger ? "danger" : "default"
      }), "cursor-default text-left disabled:cursor-not-allowed disabled:opacity-50", danger ? "enabled:hover:bg-fill-danger enabled:hover:text-on-danger focus-visible:bg-fill-danger focus-visible:text-on-danger" : "enabled:hover:bg-fill-ghost-hover focus-visible:bg-fill-ghost-hover"),
      children: [
        icon !== void 0 ? jsxForUiPropertyPopover2.jsx("span", {
          className: "flex size-icon shrink-0 items-center justify-center",
          children: typeof icon == "string" ? jsxForUiPropertyPopover2.jsx(runtime2.Icon, {
            name: icon,
            size: "auto"
          }) : icon || null
        }) : null,
        typeof children == "string" || typeof children == "number" ? jsxForUiPropertyPopover2.jsx("span", {
          className: "min-w-0 flex-1 truncate",
          children
        }) : jsxForUiPropertyPopover2.jsx("span", {
          className: "flex min-w-0 flex-1 items-center gap-xs",
          children
        }),
        checked5 !== void 0 || hint ? jsxForUiPropertyPopover2.jsxs("span", {
          className: "ms-md flex shrink-0 items-center gap-xs",
          children: [
            hint ? jsxForUiPropertyPopover2.jsx("span", {
              className: (0, runtime2.joinClassNames)("max-w-[160px] shrink-0 truncate py-[0.125em] -my-[0.125em] text-footnote tabular-nums text-muted", danger && !disabled2 && "group-hover/menu-danger:text-on-danger group-focus-visible/menu-danger:text-on-danger"),
              children: hint
            }) : null,
            checked5 !== void 0 ? jsxForUiPropertyPopover2.jsx("span", {
              className: "-mr-1 flex size-icon shrink-0 items-center justify-center",
              style: {
                color: "var(--cds-fill-accent)"
              },
              children: checked5 ? jsxForUiPropertyPopover2.jsx(runtime2.Icon, {
                name: "Check",
                size: "auto",
                bold: !0
              }) : null
            }) : null
          ]
        }) : null
      ]
    });
  }
  function collectFocusableDescendants(input) {
    return Array.from(input.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((input2) => input2.tabIndex >= 0 && input2.closest('[aria-hidden="true"]') === null);
  }
  function isBaseUiFocusGuardEvent(details) {
    let value = details.trigger ?? details.event?.target;
    return value instanceof Element && value.hasAttribute("data-base-ui-focus-guard");
  }
  return bindRuntimeValue(runtime2, "blurActivePopupEditor", () => blurActivePopupEditor), bindRuntimeValue(runtime2, "PopupScrim", () => PopupScrim), bindRuntimeValue(runtime2, "reactForUiPropertyPopover", () => reactForUiPropertyPopover, (value) => {
    reactForUiPropertyPopover = value;
  }), bindRuntimeValue(runtime2, "reactDOMForUiPropertyPopover", () => reactDOMForUiPropertyPopover, (value) => {
    reactDOMForUiPropertyPopover = value;
  }), bindRuntimeValue(runtime2, "jsxForUiPropertyPopover", () => jsxForUiPropertyPopover, (value) => {
    jsxForUiPropertyPopover = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyPopover", () => initializeUiPropertyPopover, (value) => {
    initializeUiPropertyPopover = value;
  }), bindRuntimeValue(runtime2, "suppressRepeatedEnterClicks", () => suppressRepeatedEnterClicks), bindRuntimeValue(runtime2, "usePopupOpenFocus", () => usePopupOpenFocus), bindRuntimeValue(runtime2, "suppressEnterClicksUntilRelease", () => suppressEnterClicksUntilRelease), bindRuntimeValue(runtime2, "PropertyPopup", () => PropertyPopup), bindRuntimeValue(runtime2, "PropertyMenuItem", () => PropertyMenuItem), bindRuntimeValue(runtime2, "collectFocusableDescendants", () => collectFocusableDescendants), bindRuntimeValue(runtime2, "isBaseUiFocusGuardEvent", () => isBaseUiFocusGuardEvent), bindRuntimeValue(runtime2, "reactForUiPropertyPopover2", () => reactForUiPropertyPopover2, (value) => {
    reactForUiPropertyPopover2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiPropertyPopover2", () => jsxForUiPropertyPopover2, (value) => {
    jsxForUiPropertyPopover2 = value;
  }), bindRuntimeValue(runtime2, "popupCloseStack", () => popupCloseStack, (value) => {
    popupCloseStack = value;
  }), bindRuntimeValue(runtime2, "preventPopupMouseDown", () => preventPopupMouseDown, (value) => {
    preventPopupMouseDown = value;
  }), bindRuntimeValue(runtime2, "preservePopupSelection", () => preservePopupSelection, (value) => {
    preservePopupSelection = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyPopover2", () => initializeUiPropertyPopover2, (value) => {
    initializeUiPropertyPopover2 = value;
  }), () => {
    initializeUiPropertyPopover = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeScrimPressThrough)(), reactForUiPropertyPopover = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMForUiPropertyPopover = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), jsxForUiPropertyPopover = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), preventPopupMouseDown = (event) => event.preventDefault(), preservePopupSelection = (event) => {
      (!(event.target instanceof Element) || event.target.closest(runtime2.TEXT_EDITABLE_SELECTOR) === null) && event.preventDefault();
    }, initializeUiPropertyPopover2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyFocus)(), (0, runtime2.initializeFrameFootInset)(), initializeUiPropertyPopover(), reactForUiPropertyPopover2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiPropertyPopover2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), popupCloseStack = [];
    });
  };
}
export {
  installUiPropertyPopover
};
