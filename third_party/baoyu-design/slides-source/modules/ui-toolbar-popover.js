// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarPopover(runtime2) {
  var reactv4, jsxeQ, jsx_T, TOOLBAR_SPLIT_TRIGGER_CLASS, TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS;
  function ToolbarPopover(props) {
    let { label, tip, descriptionSuffix, children, align: align2 = "start", side: side2 = "bottom", open: open4, onOpenChange, disabled: disabled2 = !1, disabledTip, finalFocus, className, "data-testid": value } = props, value2 = reactv4.useContext(runtime2.ToolbarFloatingContext), appleKeyboard = (0, runtime2.useAppleKeyboard)(), ref = reactv4.useRef(null), splitRef = reactv4.useRef(null), ref2 = reactv4.useRef(null), [value3, value4] = reactv4.useState(!1), value5 = open4 ?? value3, [value6, value7] = reactv4.useState(!1), value8 = finalFocus === !0 ? void 0 : finalFocus, ref3 = reactv4.useRef(!1), ref4 = reactv4.useRef({
      disabled: disabled2,
      popupFinalFocus: value8
    });
    ref4.current = {
      disabled: disabled2,
      popupFinalFocus: value8
    };
    let ref5 = reactv4.useRef(!1), callback = reactv4.useCallback((input) => {
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
    }, []), value9 = props.icon ?? props.glyph, value10 = props.readout === void 0 || props.readout === "" ? label : props.readout + ", " + label, value11 = props.readout === void 0 ? props.pressed : void 0, value12 = props.readout === void 0 && props.emphasis === !0, value13 = props.iconOnly === !0 || value2 && !value12, coarsePointer = (0, runtime2.useCoarsePointer)(), primary = props.readout === void 0 && !coarsePointer ? props.primary : void 0, value14 = (0, runtime2.useDisabledButtonDescription)({
      disabled: disabled2,
      name: value10,
      reason: disabledTip ?? tip,
      pressed: value11,
      expanded: !1,
      hasPopup: "menu"
    });
    (0, runtime2.useDeferredTooltipFocus)(ref, disabled2);
    let content = (0, runtime2.toolbarTooltipContent)({
      label,
      tip,
      disabledTip,
      disabled: disabled2
    }).content, value15 = (0, runtime2.useButtonAccessibility)({
      disabled: disabled2,
      name: value10,
      tip: content,
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
    reactv4.useLayoutEffect(() => {
      disabled2 && value5 && (open4 === void 0 && value4(!1), onOpenChange?.(!1)), value7(!disabled2 && ref.current !== null && ref.current.contains(ref.current.ownerDocument.activeElement));
    }, [disabled2]);
    let value18 = value5 && !disabled2;
    (0, runtime2.usePopupOpenFocus)(value18);
    let collisionPadding = (0, runtime2.useFootInsetCollisionPadding)(value18), primaryTestId = primary?.["data-testid"];
    reactv4.useLayoutEffect(() => {
      let [primaryButton, caretButton] = splitRef.current?.querySelectorAll("button") ?? [];
      primaryTestId !== void 0 && primaryButton?.setAttribute("data-testid", primaryTestId), value !== void 0 && caretButton?.setAttribute("data-testid", value);
    });
    let ref6 = reactv4.useRef(!1);
    return reactv4.useLayoutEffect(() => {
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
        onPrimaryClick: primary.onClick,
        menuLabel: "More " + label.charAt(0).toLowerCase() + label.slice(1),
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
          content,
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
  function ToolbarMenuItem({ glyph, label, shortcut, pressed: pressed3, checked: checked5, "aria-describedby": ariaDescribedby, "aria-keyshortcuts": ariaKeyshortcuts, ...remainingProps }) {
    let value = checked5 ?? pressed3, value2 = (0, runtime2.useButtonAccessibility)({
      disabled: remainingProps.disabled === !0,
      name: label,
      tip: shortcut !== void 0 ? remainingProps.title ?? "" : "",
      shortcut,
      describedBy: ariaDescribedby
    });
    return jsx_T.jsxs("button", {
      type: "button",
      ...checked5 === void 0 ? {
        "aria-pressed": pressed3
      } : {
        role: "radio",
        "aria-checked": checked5
      },
      ...remainingProps,
      "aria-describedby": value2.describedBy,
      "aria-keyshortcuts": ariaKeyshortcuts ?? value2.keyShortcuts,
      className: (0, runtime2.joinClassNames)("flex h-7 w-full cursor-default select-none items-center gap-2 rounded-md px-2 text-left text-xs text-fg", "enabled:hover:bg-wash-1 enabled:active:bg-wash-2 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:text-sm", value && "bg-wash-1"),
      children: [
        jsx_T.jsx("span", {
          className: "flex h-4 w-4 shrink-0 items-center justify-center text-fg-secondary pointer-coarse:h-5 pointer-coarse:w-5",
          children: glyph
        }),
        jsx_T.jsx("span", {
          className: "min-w-0 flex-1 truncate",
          children: label
        }),
        shortcut !== void 0 ? jsx_T.jsx("span", {
          "aria-hidden": "true",
          className: "ml-3 shrink-0 text-fg-muted pointer-coarse:hidden",
          children: (0, runtime2.shortcutSymbols)(shortcut)
        }) : null,
        value2.mirror
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactv4", () => reactv4, (value) => {
    reactv4 = value;
  }), bindRuntimeValue(runtime2, "jsxeQ", () => jsxeQ, (value) => {
    jsxeQ = value;
  }), bindRuntimeValue(runtime2, "ToolbarPopover", () => ToolbarPopover), bindRuntimeValue(runtime2, "TOOLBAR_SPLIT_TRIGGER_CLASS", () => TOOLBAR_SPLIT_TRIGGER_CLASS, (value) => {
    TOOLBAR_SPLIT_TRIGGER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS", () => TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS, (value) => {
    TOOLBAR_SPLIT_TRIGGER_FIZZY_CLASS = value;
  }), bindRuntimeValue(runtime2, "jsx_T", () => jsx_T, (value) => {
    jsx_T = value;
  }), bindRuntimeValue(runtime2, "ToolbarMenuItem", () => ToolbarMenuItem), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeFrameFootInset)(), (0, runtime2.initializeUiPointerMedia)(), reactv4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxeQ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TOOLBAR_SPLIT_TRIGGER_CLASS = [
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
    ].join(" "), jsx_T = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiToolbarPopover
};
