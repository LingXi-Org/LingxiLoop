// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarPopover(runtime2) {
  var reactToolbarPopover, reactv4, MENU_CUT_HOST_WORD, jsxeQ, TOOLBAR_SPLIT_TRIGGER_CLASS, TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS;
  function supportsUserActivation(win) {
    let prototype = win.MessageEvent?.prototype;
    return prototype !== void 0 && "userActivation" in prototype;
  }
  function createMenuCutReporter({
    listed,
    post
  }) {
    let shown = null, clearing = null, away = null, passThroughBackdrop = null, closing = () => {
      away = null;
      let win = shown?.win;
      shown = null, win !== void 0 && (clearing = {
        win,
        frame: win.requestAnimationFrame(() => {
          clearing = null, post({
            __frame_menu_cut: !0,
            box: null
          }, win, !1);
        })
      });
    };
    return {
      closing,
      handBack: (target) => {
        const returning = away;
        if (away = null, returning !== null && target != null && target !== !1) {
          let until = returning.win.performance.now() + 1e3, tick = () => {
            if (returning.popup.isConnected && returning.win.performance.now() < until) {
              returning.win.requestAnimationFrame(tick);
              return;
            }
            let activeElement3 = returning.win.document.activeElement;
            returning.win.document.hasFocus() && (activeElement3 === null || activeElement3 === returning.win.document.body) && target.focus({
              preventScroll: !0
            });
          };
          returning.win.requestAnimationFrame(tick);
          return;
        }
        let ownerDocument2 = shown?.popup.ownerDocument, activeElement2 = ownerDocument2?.activeElement;
        ownerDocument2?.hasFocus() !== !0 || activeElement2?.closest('[role="menu"]') == null || target == null || (activeElement2.blur(), target !== !1 && target.focus({
          preventScroll: !0
        }));
      },
      watch: ({ win, popup: findPopup, close }) => {
        if (!listed() || !supportsUserActivation(win))
          return () => {
          };
        let ownerDocument2 = win.document, realm = win, popup = null, lastBox = "", settleFrame = 0, keyFrame = 0, blurTimer = 0, setBackdropBlocking = (blocking) => {
          if (blocking) {
            passThroughBackdrop !== null && (passThroughBackdrop.style.pointerEvents = ""), passThroughBackdrop = null;
            return;
          }
          let backdrop = popup?.parentElement?.previousElementSibling;
          !(backdrop instanceof realm.HTMLElement) || !backdrop.hasAttribute("data-base-ui-inert") || (backdrop.style.pointerEvents = "none", passThroughBackdrop = backdrop);
        }, report = () => {
          if (popup?.getAttribute("data-tb-foot-menu") === "away")
            return;
          if (!listed()) {
            closing();
            return;
          }
          if (popup === null) {
            if (popup = findPopup(), popup === null)
              return;
            for (let ending of ownerDocument2.querySelectorAll("[data-tb-foot-menu][data-ending-style]"))
              ending !== popup && (ending.style.transition = "none");
            popup.style.transition = "", popup.setAttribute("data-tb-foot-menu", ""), setBackdropBlocking(!0), resizeObserver?.observe(popup), popup.parentElement !== null && mutationObserver.observe(popup.parentElement, {
              attributes: !0,
              attributeFilter: ["style"]
            });
          }
          let rect = popup.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || popup.parentElement !== null && win.getComputedStyle(popup.parentElement).opacity === "0")
            return;
          let box = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            radius: Math.round(Number.parseFloat(win.getComputedStyle(popup).borderTopLeftRadius) || 0)
          }, text = JSON.stringify(box);
          text !== lastBox && (lastBox = text, clearing !== null && clearing.win.cancelAnimationFrame(clearing.frame), clearing = null, shown = {
            win,
            popup
          }, post({
            __frame_menu_cut: !0,
            box
          }, win, !0));
        }, resizeObserver = typeof realm.ResizeObserver == "function" ? new realm.ResizeObserver(report) : null, mutationObserver = new realm.MutationObserver(report), settleUntil = win.performance.now() + 500, settle = () => {
          report(), settleFrame = lastBox === "" && win.performance.now() < settleUntil ? win.requestAnimationFrame(settle) : 0;
        };
        settle();
        let onKeyDown = (event) => {
          popup === null || !(event.target instanceof realm.Node) || !popup.contains(event.target) || (win.cancelAnimationFrame(keyFrame), keyFrame = win.requestAnimationFrame(() => {
            lastBox = "", report();
          }));
        }, onBlur = () => {
          blurTimer = win.setTimeout(() => {
            ownerDocument2.hasFocus() || (popup?.setAttribute("data-tb-foot-menu", "away"), setBackdropBlocking(!1), closing());
          }, 0);
        }, onFocus = () => {
          popup?.getAttribute("data-tb-foot-menu") === "away" && (away = {
            win,
            popup
          }, close());
        };
        return ownerDocument2.addEventListener("keydown", onKeyDown, !0), win.addEventListener("resize", report), win.addEventListener("blur", onBlur), win.addEventListener("focus", onFocus), () => {
          win.cancelAnimationFrame(settleFrame), win.cancelAnimationFrame(keyFrame), win.clearTimeout(blurTimer), resizeObserver?.disconnect(), mutationObserver.disconnect(), ownerDocument2.removeEventListener("keydown", onKeyDown, !0), win.removeEventListener("resize", report), win.removeEventListener("blur", onBlur), win.removeEventListener("focus", onFocus);
        };
      }
    };
  }
  function findControlledMenu(root) {
    let id = root.querySelector('[aria-haspopup="menu"][aria-controls]')?.getAttribute("aria-controls");
    return id == null ? null : root.ownerDocument.getElementById(id);
  }
  function useFootMenuCut({
    at,
    open: open4,
    reports,
    close,
    finalFocus
  }) {
    let closeRef = reactv4.useRef(close);
    closeRef.current = close;
    let finalFocusRef = reactv4.useRef(finalFocus);
    finalFocusRef.current = finalFocus;
    let [reporter] = reactv4.useState(() => createMenuCutReporter({
      listed: () => (0, runtime2.hostWords)()?.has(MENU_CUT_HOST_WORD) === !0,
      post: (message, win, userActivation) => (0, runtime2.postToHost)(message, win, void 0, userActivation)
    }));
    reactv4.useLayoutEffect(() => reporter.closing, [reporter]), reactv4.useLayoutEffect(() => {
      let root = at.current, win = root?.ownerDocument.defaultView;
      if (!open4 || !reports) {
        let focus = finalFocusRef.current;
        if (!open4) {
          let trigger = root?.querySelector('[aria-haspopup="menu"]');
          reporter.handBack(focus === !1 ? !1 : focus?.current ?? (trigger?.disabled === !0 ? root : trigger));
        }
        reporter.closing();
        return;
      }
      if (!(root == null || win == null || root.closest("[data-tb-foot], [data-tb-foot-tools]") === null))
        return reporter.watch({
          win,
          popup: () => findControlledMenu(root),
          close: () => closeRef.current()
        });
    }, [at, open4, reports, reporter]);
  }
  function ToolbarPopover(props) {
    let { label, tip, descriptionSuffix, children, align: align2 = "start", side: side2 = "bottom", open: open4, onOpenChange, disabled: disabled2 = !1, disabledTip, finalFocus, className, "data-testid": value } = props, value2 = reactToolbarPopover.useContext(runtime2.ToolbarFloatingContext), appleKeyboard = (0, runtime2.useAppleKeyboard)(), ref = reactToolbarPopover.useRef(null), splitRef = reactToolbarPopover.useRef(null), ref2 = reactToolbarPopover.useRef(null), [value3, value4] = reactToolbarPopover.useState(!1), value5 = open4 ?? value3, [value6, value7] = reactToolbarPopover.useState(!1), value8 = finalFocus === !0 ? void 0 : finalFocus, ref3 = reactToolbarPopover.useRef(!1), ref4 = reactToolbarPopover.useRef({
      disabled: disabled2,
      popupFinalFocus: value8
    });
    ref4.current = {
      disabled: disabled2,
      popupFinalFocus: value8
    };
    let ref5 = reactToolbarPopover.useRef(!1), callback = reactToolbarPopover.useCallback((input) => {
      ref2.current = input, input === null && setTimeout(() => {
        ref3.current = !1;
        let current = ref.current;
        if (!ref5.current || !ref4.current.disabled || current === null || ref4.current.popupFinalFocus === !1 || !current.ownerDocument.hasFocus())
          return;
        let activeElement2 = current.ownerDocument.activeElement;
        (activeElement2 === null || activeElement2 === current.ownerDocument.body || !activeElement2.isConnected) && current.focus({
          preventScroll: !0
        });
      }, 0);
    }, []), value9 = props.icon ?? props.glyph, value10 = props.readout === void 0 || props.readout === "" ? label : (0, runtime2.formatMessage)({
      defaultMessage: "{readout}，{label}",
      id: "G48WnmgGh5"
    }, {
      readout: props.readout, label
    }), value11 = props.readout === void 0 ? props.pressed : void 0, value12 = props.readout === void 0 && props.emphasis === !0, value13 = props.iconOnly === !0 || value2 && !value12, coarsePointer = (0, runtime2.useCoarsePointer)(), primary = props.readout === void 0 && !coarsePointer ? props.primary : void 0, value14 = (0, runtime2.useDisabledButtonDescription)({
      disabled: disabled2,
      name: value10,
      reason: disabledTip ?? tip,
      pressed: value11,
      expanded: !1,
      hasPopup: "menu"
    });
    (0, runtime2.useDeferredTooltipFocus)(ref, disabled2);
    let tooltip = (0, runtime2.toolbarTooltipContent)({
      label,
      tip,
      disabledTip,
      disabled: disabled2,
      nameOnly: (0, runtime2.useInsideToolbarFoot)(ref)
    }), value15 = (0, runtime2.useButtonAccessibility)({
      disabled: disabled2,
      name: value10,
      tip: tooltip. content,
      descriptionSuffix
    }), value16 = props.readout !== void 0 ? jsxeQ.jsx(runtime2.Menu.Trigger, {
      render: jsxeQ.jsxs(runtime2.Button, {
        variant: "ghost",
        disabled: disabled2,
        "aria-label": value10,
        "aria-describedby": value15.describedBy,
        ...value14.inner,
        "data-testid": value,
        "data-tb-caret": "",
        className: "shrink-0 tabular-nums",
        children: [
          props.readoutSizer === void 0 ? props.readout : jsxeQ.jsx("span", {
            "data-sizer": props.readoutSizer,
            className: "inline-flex flex-col items-center before:invisible before:h-0 before:content-[attr(data-sizer)]",
            children: props.readout
          }),
          jsxeQ.jsx(runtime2.ToolbarCaret, {})
        ]
      })
    }) : jsxeQ.jsx(runtime2.Menu.Trigger, {
      render: value13 && props.caret !== !0 ? jsxeQ.jsx(runtime2.Button, {
        iconOnly: !0,
        variant: "ghost",
        icon: value9,
        pressed: value11,
        disabled: disabled2,
        "aria-label": label,
        "aria-describedby": value15.describedBy,
        ...value14.inner,
        "data-testid": value,
        className: "shrink-0"
      }) : jsxeQ.jsxs(runtime2.Button, {
        "data-tb-caret": props.caret === !0 ? "" : void 0,
        variant: value12 ? disabled2 ? "secondary" : "primary" : "ghost",
        icon: value9,
        pressed: value11,
        disabled: disabled2,
        "aria-label": label,
        "aria-describedby": value15.describedBy,
        ...value14.inner,
        "data-testid": value,
        className: "shrink-0",
        children: [
          value13 ? null : label,
          props.caret === !0 ? jsxeQ.jsx(runtime2.ToolbarCaret, {
            inherit: value12 && !disabled2
          }) : null
        ]
      })
    }), value17 = (0, runtime2.joinClassNames)("relative inline-flex shrink-0 rounded align-top outline-none focus-visible:outline-hidden focus-visible:shadow-focus", className);
    reactToolbarPopover.useLayoutEffect(() => {
      disabled2 && value5 && (open4 === void 0 && value4(!1), onOpenChange?.(!1)), value7(!disabled2 && ref.current !== null && ref.current.contains(ref.current.ownerDocument.activeElement));
    }, [disabled2]);
    let value18 = value5 && !disabled2;
    (0, runtime2.usePopupOpenFocus)(value18);
    let collisionPadding = (0, runtime2.useFootInsetCollisionPadding)(value18), menuItemPicked = reactToolbarPopover.useRef(!1);
    reactToolbarPopover.useLayoutEffect(() => {
      let anchor = ref.current ?? splitRef.current;
      if (anchor === null)
        return;
      if (!value18) {
        menuItemPicked.current && (0, runtime2.closeFrameComposerFromFoot)(anchor, !0), menuItemPicked.current = !1;
        return;
      }
      let onClick = (event) => {
        menuItemPicked.current = event.target instanceof Element && event.target.closest('[role^="menuitem"]:not([aria-haspopup], [aria-disabled="true"], [data-cds-sheet-control])') !== null, setTimeout(() => {
          menuItemPicked.current = !1;
        }, 0);
      };
      return anchor.ownerDocument.addEventListener("click", onClick, !0), () => anchor.ownerDocument.removeEventListener("click", onClick, !0);
    }, [value18]), useFootMenuCut({
      at: primary !== void 0 ? splitRef : ref,
      open: value18,
      reports: side2 === "top" && !coarsePointer,
      close: () => {
        open4 === void 0 && value4(!1), onOpenChange?.(!1);
      },
      finalFocus: primary !== void 0 ? void 0 : value8
    });
    let primaryTestId = primary?.["data-testid"];
    reactToolbarPopover.useLayoutEffect(() => {
      let [primaryButton, caretButton] = splitRef.current?.querySelectorAll("button") ?? [];
      primaryTestId !== void 0 && primaryButton?.setAttribute("data-testid", primaryTestId), value !== void 0 && caretButton?.setAttribute("data-testid", value);
    });
    let ref6 = reactToolbarPopover.useRef(!1);
    return reactToolbarPopover.useLayoutEffect(() => {
      if (ref6.current && !value18 && (ref5.current = ref2.current?.querySelector(":focus-visible") != null), ref6.current && !value18 && !disabled2 && value8 !== !1) {
        let current = ref.current;
        current !== null && current.contains(current.ownerDocument.activeElement) ? value7(!0) : ref3.current = !0;
      }
      ref6.current = value18;
    }, [value18]), primary !== void 0 ? jsxeQ.jsx("span", {
      ref: splitRef,
      className: (0, runtime2.joinClassNames)("me-0.5 inline-flex shrink-0 align-top", className),
      children: jsxeQ.jsx(runtime2.SplitButton, {
        variant: "ghost",
        className: TOOLBAR_SPLIT_TRIGGER_CLASS + " " + TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS,
        icon: value9,
        "aria-label": primary.label,
        "aria-keyshortcuts": primary.shortcut === void 0 ? void 0 : (0, runtime2.shortcutToAriaKeyShortcuts)(primary.shortcut, appleKeyboard),
        tooltip: primary.shortcut === void 0 ? !0 : primary.label + "  " + (0, runtime2.shortcutSymbols)(primary.shortcut),
        tooltipSide: side2,
        pressed: value11,
        onPrimaryClick: () => {
          (0, runtime2.closeFrameComposerFromFoot)(splitRef.current), primary.onClick();
        },
        menuLabel: (0, runtime2.formatMessage)({
          defaultMessage: "更多{name}",
          id: "0TdPzxEMer"
        }, {
          name: label.charAt(0).toLowerCase() + label.slice(1)
        }),
        caretSize: "xs",
        groupLabel: label,
        menuTooltip: tip ?? !0,
        items: children,
        side: side2,
        align: align2,
        disabled: disabled2,
        open: value18,
        onOpenChange: (input) => {
          open4 === void 0 && value4(input), onOpenChange?.(input);
        }
      })
    }) : jsxeQ.jsxs(runtime2.Menu.Root, {
      open: value18,
      disabled: disabled2,
      onOpenChange: (input) => {
        open4 === void 0 && value4(input), onOpenChange?.(input);
      },
      children: [
        jsxeQ.jsx(runtime2.Tooltip, {
          content: tooltip.shown,
          side: side2,
          hoverable: !1,
          open: !disabled2 && (value5 || value6) ? !1 : void 0,
          children: jsxeQ.jsxs("span", {
            ref,
            tabIndex: disabled2 ? 0 : -1,
            ...value14.props,
            onPointerEnter: value6 ? () => value7(!1) : void 0,
            onBlur: value6 ? () => value7(!1) : void 0,
            onFocus: (input) => {
              let relatedTarget = input.relatedTarget, value19 = relatedTarget !== null && relatedTarget.isConnected && !ref2.current?.contains(relatedTarget) && !ref.current?.contains(relatedTarget);
              ref3.current ? (ref3.current = !1, !value19 && !disabled2 && value7(!0)) : value6 && value19 && value7(!1);
            },
            "data-tb-icon": props.readout === void 0 && props.caret !== !0 && value13 ? "" : void 0,
            "data-tb-readout": props.readout !== void 0 ? "" : void 0,
            className: value17,
            children: [value16, value15.mirror, value14.mirror]
          })
        }),
        jsxeQ.jsx(runtime2.Menu.Popup, {
          ref: callback,
          side: side2,
          align: align2,
          collisionPadding,
          finalFocus: value8,
          children
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactToolbarPopover", () => reactToolbarPopover, (value) => {
    reactToolbarPopover = value;
  }), bindRuntimeValue ( runtime2, "reactv4", () => reactv4, (value) => {
    reactv4 = value;
      }), bindRuntimeValue(runtime2, "MENU_CUT_HOST_WORD", () => MENU_CUT_HOST_WORD,( value) => {
    MENU_CUT_HOST_WORD = value;
        }), bindRuntimeValue(runtime2, "supportsUserActivation", () => supportsUserActivation), bindRuntimeValue(runtime2, "createMenuCutReporter",() => createMenuCutReporter), bindRuntimeValue(runtime2, "findControlledMenu", () => findControlledMenu), bindRuntimeValue(runtime2, "useFootMenuCut", () => useFootMenuCut), bindRuntimeValue(runtime2, "jsxeQ", () => jsxeQ, (value) => {
    jsxeQ = value;
  }), bindRuntimeValue(runtime2, "ToolbarPopover", () => ToolbarPopover), bindRuntimeValue(runtime2, "TOOLBAR_SPLIT_TRIGGER_CLASS", () => TOOLBAR_SPLIT_TRIGGER_CLASS, (value) => {
    TOOLBAR_SPLIT_TRIGGER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS", () => TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS, (value) => {
    TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS = value;
  }), () => {
    (0, runtime2.initializeUiInputs210) (),(0,runtime2.initializeFrameFootInset) (), (0, runtime2.initializeUiPointerMedia)(), reactToolbarPopover = (0, runtime2.toModuleNamespace)( (0, runtime2.loadReactNamespace)(), 1), reactv4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), MENU_CUT_HOST_WORD = "menu_cut", jsxeQ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TOOLBAR_SPLIT_TRIGGER_CLASS = [
      "!shadow-none",
      "[&>[data-cds-segment]:first-child_[data-cds-part=paint]]:!p-0",
      "[&>[data-cds-segment]:last-child_[data-cds-part=paint]]:!px-0",
      "[&>[data-cds-segment]:last-child_button]:!ms-0",
      "[&>[data-cds-segment]:last-child_button]:!px-0.5",
      "[&>[data-cds-segment]:last-child_button]:after:!start-0",
      "[&>[data-cds-segment]:last-child_button]:after:!-end-1"
    ].join(" "), TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS = [
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:last-child_[data-cds-part=paint]]:!p-0',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:last-child_button]:!ms-px',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:last-child_button]:!px-px',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:last-child_button]:after:!-start-0.5',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:first-child_button]:after:absolute',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:first-child_button]:after:inset-0',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:first-child_button]:after:rounded-s-[inherit]',
      '[[data-cds-fizzy-lake~="icons"]_&_[data-cds-part=paint]]:![transition-property:box-shadow,color]',
      '[[data-cds-fizzy-lake~="icons"]_&:is(:hover:not([data-disabled]),[data-popup-open])_button:not([aria-pressed=true])_[data-cds-part=paint]]:[background-color:var(--cds-fill-button-ghost-hover,var(--cds-fill-ghost-hover))]',
      '[[data-cds-fizzy-lake~="icons"]_&:not([data-disabled])_button:hover:not([aria-pressed=true])_[data-cds-part=paint]]:[background-image:linear-gradient(var(--cds-fill-button-layer,var(--cds-fill-ghost-hover))_0_0)]',
      '[[data-cds-fizzy-lake~="icons"]_&>[data-cds-segment]:last-child_button[aria-expanded=true]_[data-cds-part=paint]]:[background-image:linear-gradient(var(--cds-fill-button-layer,var(--cds-fill-ghost-hover))_0_0)]'
    ].join(" ");
  };
}
export {
  installUiToolbarPopover
};
