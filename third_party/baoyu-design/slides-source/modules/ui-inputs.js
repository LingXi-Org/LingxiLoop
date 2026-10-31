// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiInputs(runtime2) {
  var reactHu, supportsNativeFieldSizing, initializeUiInputs, reactForUiInputs, jsxForUiInputs, TextArea, initializeUiInputs2, reactForUiInputs2, jsxForUiInputs2, COUNTER_VARIANT_CLASSES, COUNTER_SIZE_CLASSES, COUNTER_STACKS_CLASSES, Counter, initializeUiInputs3, reactfK0, REACT_MEMO_SYMBOL, REACT_FORWARD_REF_SYMBOL, initializeUiInputs4, pictogramCardRadiusClass, initializeSplitButtonNoop, leadingIconInsetClasses, leadingIconOutsetClasses, SPLIT_BUTTON_LABEL_CLASS, trailingIconOutsetClasses, SPLIT_BUTTON_ICON_CLASS, leadingIconSpacingClasses, SPLIT_BUTTON_STYLE_DEFAULTS, initializeUiInputs5, reactZQ, jsxd8, calloutSizeByDensity, CALLOUT_PICTOGRAM_SIZE, calloutVariantClasses, calloutTextClasses, calloutIconStacksClasses, CALLOUT_TEXT_TINT_CLASS = "text-[color-mix(in_srgb,currentColor_85%,transparent)]", CALLOUT_ACTION_TRAILING_CLASS = "-me-[calc(var(--cds-pad-md)-2px)]", CALLOUT_FIZZY_ACTION_TRAILING_CLASS = "-me-[calc(var(--cds-pad-md)-6px)]", CALLOUT_ACTION_ROW_CLASS = "min-h-control my-[calc((1lh-var(--cds-h-control))/2)]", CALLOUT_STACKS_CLASS = "stacks:bg-page stacks:bg-none stacks:shadow-card-ring stacks:text-primary stacks:[--cds-text-link-color:initial]", CALLOUT_STACKS_COVER_CLASS = "stacks:in-data-cds-covers-content:bg-surface-popover stacks:in-data-cds-covers-content:shadow-panel-md", calloutDefaultIcons, initializeUiInputs6, reactpK0, jsxGP, interactiveLinkReservedProps, initializeUiInputs7, jsxdK0, initializeUiInputs8, reactForUiInputs3, jsxp4, TEXT_LINK_CLASS, TEXT_LINK_UNDERLINE_CLASS, textLinkVariants, TEXT_LINK_COLOR_CLASS, TEXT_LINK_FOCUS_CLASS, TEXT_LINK_OWN_COLOR_CLASS = "[--cds-text-link-color:initial]", TEXT_LINK_DISABLED_CLASS, TEXT_LINK_EXTERNAL_ICON_CLASS, TextLink, initializeUiInputs9, reactc4, DIALOG_KEYBOARD_MARGIN_PX, DIALOG_KEYBOARD_MARGIN_CSS, MINIMUM_DIALOG_KEYBOARD_VISIBLE_HEIGHT, dialogOverrideStyleProperties, dialogKeyboardExcludedStyleProperties, dialogKeyboardPositionProperties, initializeUiInputs10;
  function resizeTextAreaToContent(input, options) {
    if (input.clientWidth === 0 || input.style.height !== options.current && input.style.height !== "")
      return;
    let offsetHeight = input.offsetHeight, value = offsetHeight - input.clientHeight, { overflowY: style, marginBottom: style2 } = input.style;
    input.style.height = "0px", input.style.marginBottom = `${offsetHeight}px`, input.style.overflowY = "hidden", options.current = `${input.scrollHeight + value}px`, input.style.height = options.current, input.style.marginBottom = style2, input.style.overflowY = style;
  }
  function observeTextAreaValue(input, options) {
    let value = Object.getOwnPropertyDescriptor(input, "value"), value2 = value ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    if (!value2?.set || !value2.configurable)
      return;
    let flag = !0, callback = (input2) => {
      value2.set?.call(input, input2), flag && options();
    };
    return Object.defineProperty(input, "value", {
      ...value2,
      set: callback
    }), () => {
      flag = !1, Object.getOwnPropertyDescriptor(input, "value")?.set === callback && (value ? Object.defineProperty(input, "value", value) : Reflect.deleteProperty(input, "value"));
    };
  }
  function useTextAreaAutosize({ autosize, value, defaultValue }) {
    let value2 = autosize && !supportsNativeFieldSizing, value3 = value !== void 0, ref = reactHu.useRef(null), ref2 = reactHu.useRef("");
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = ref.current, value4 = current?.ownerDocument.defaultView;
      if (!value2 || !current || !value4)
        return;
      let callback = () => resizeTextAreaToContent(current, ref2), index4 = 0, callback2 = () => {
        value4.cancelAnimationFrame(index4), index4 = value4.requestAnimationFrame(callback);
      }, value5 = new value4.ResizeObserver(callback2);
      value5.observe(current), value4.document.fonts.addEventListener("loadingdone", callback);
      let callback3 = (event) => {
        event.target === current.form && callback2();
      }, value6 = current.getRootNode(), value7 = value6 instanceof value4.ShadowRoot ? value6 : value4.document, value8;
      return value3 || (value8 = observeTextAreaValue(current, callback), current.addEventListener("input", callback), value7.addEventListener("reset", callback3, !0)), () => {
        value8?.(), value7.removeEventListener("reset", callback3, !0), value5.disconnect(), value4.cancelAnimationFrame(index4), value4.document.fonts.removeEventListener("loadingdone", callback), current.removeEventListener("input", callback), current.style.height === ref2.current && (current.style.height = "");
      };
    }, [value2, value3]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      value2 && ref.current && resizeTextAreaToContent(ref.current, ref2);
    }, [value2, value2 ? value : null, value2 ? defaultValue : null]), ref;
  }
  function isPictogramElement(input) {
    return !reactfK0.isValidElement(input) || typeof input.type == "string" ? !1 : isPictogramComponent(input.type);
  }
  function isPictogramComponent(input) {
    let value = input;
    for (let index4 = 0; index4 < 4 && value !== null && value !== void 0; index4++) {
      if (value.isCdsPictogram === !0)
        return !0;
      let value2 = value;
      if (value2.$$typeof === REACT_MEMO_SYMBOL)
        value = value2.type;
      else if (value2.$$typeof === REACT_FORWARD_REF_SYMBOL)
        value = value2.render;
      else
        return !1;
    }
    return !1;
  }
  function Callout({ variant, icon, action, actionAlign = "first-line", details, defaultDetailsOpen = !1, detailsOpen, onDetailsOpenChange, onDismiss, dismissLabel, role, composerCalibration, className, "data-testid": dataTestid, children }) {
    let value = (0, runtime2.useTranslation)("dismiss", "Dismiss"), value2 = dismissLabel ?? value, value3 = (0, runtime2.useDensity)(), fizzyPanels = (0, runtime2.useFeatureFlagPart)("panels"), fizzyColor = (0, runtime2.useFizzyColorPart)(), detailsCaretIcon = (0, runtime2.useFeatureFlagPart)("icons") ? (0, runtime2.fizzyIconName)("CaretDownFilled") : runtime2.fizzyLakeFallbackNames.CaretDownFilled, state = {
      "data-step": (0, runtime2.getDensitySizeIndex)(value3, calloutSizeByDensity[value3])
    }, value4 = variant ?? "neutral", value5 = composerCalibration === !0 ? "glyph" : composerCalibration === !1 ? void 0 : composerCalibration, value6 = value5 !== void 0, value7 = icon != null && typeof icon != "boolean", value8 = isPictogramElement(icon), value9 = details != null && typeof details != "boolean", value10 = role ?? (value9 ? "none" : "status"), [value11, value12] = reactZQ.useState(defaultDetailsOpen), [value13, value14] = reactZQ.useState(!1), ref = reactZQ.useRef(null), ref2 = reactZQ.useRef(null), ref3 = reactZQ.useRef(null), ref4 = reactZQ.useRef(0), value15 = action != null && typeof action != "boolean", centeredIcon = value8 || value6 && actionAlign === "center", value22 = value9 || !centeredIcon, value16 = !value9 && (centeredIcon || actionAlign === "center"), value17 = value16, value18 = !value9 && value15, value19 = value18 && value13, value20 = value6 && value19 && !value16, centerDismiss = value22 && value16 && value15 && !value19;
    reactZQ.useLayoutEffect(() => {
      if ((!value6 || !value18 || value17) && (ref4.current = 0), !value18)
        return;
      let current = ref.current, value24 = (0, runtime2.getResizeObserverConstructor)(current);
      if (current === null || value24 === void 0)
        return;
      let callback2 = () => {
        if (value20) {
          current.offsetWidth > ref4.current + CALLOUT_PICTOGRAM_SIZE && value14(!1);
          return;
        }
        let current3 = ref2.current, current4 = ref3.current;
        if (current3 === null || current4 === null)
          return;
        let value26 = Number.parseFloat(getComputedStyle(current3).lineHeight);
        if (!Number.isFinite(value26) || value26 <= 0)
          return;
        let top = current4.getBoundingClientRect().top, bounds = current3.getBoundingClientRect();
        if (value17 && bounds.height === 0)
          return;
        let value27 = value17 ? top >= bounds.bottom - 1 : top - bounds.top > value26 / 2;
        value27 && value6 && !value17 && (ref4.current = current.offsetWidth), value14(value27);
      };
      callback2();
      let value25 = new value24(callback2);
      value25.observe(current);
      let current2 = ref2.current;
      return value17 && current2 !== null && value25.observe(current2), () => value25.disconnect();
    }, [value18, value6, value20, value17]);
    let value21 = detailsOpen ?? value11, callback = (input) => {
      value12(input), onDetailsOpenChange?.(input);
    }, actionTrailingClass = fizzyPanels ? CALLOUT_FIZZY_ACTION_TRAILING_CLASS : CALLOUT_ACTION_TRAILING_CLASS, value23 = action ? jsxd8.jsx("span", {
      ref: ref3,
      ...state,
      className: (0, runtime2.cn)("flex shrink-0 items-center gap-xs", !value19 && CALLOUT_ACTION_ROW_CLASS, value20 && "basis-full", !value19 && "-ms-[2px]", value20 && !fizzyPanels && value5 && leadingIconOutsetClasses[value5], value5 !== void 0 && !onDismiss && (fizzyPanels ? "-me-[2px]" : leadingIconSpacingClasses[value5]), !value6 && !onDismiss && actionTrailingClass),
      children: action
    }) : null;
    return jsxd8.jsxs("div", {
      "data-cds": "Banner",
      "data-prose-box": "",
      "data-icon-layout": value22 ? "first-line" : "centered",
      "data-cta-layout": value20 ? "stacked" : value19 ? "wrapped" : "inline",
      "data-action-align": value16 ? "center" : "first-line",
      "data-composer-keyline": value5,
      "data-testid": dataTestid,
      role: value10 === "none" ? void 0 : value10,
      ref,
      className: (0, runtime2.cn)("flex", value22 ? "items-start" : "items-center", "gap-xs py-md font-sans text-body font-normal break-words", value6 ? "px-md" : "px-lg", fizzyPanels && (value6 ? "py-[calc(var(--cds-pad-md)+2px)]" : "!py-lg"), value20 && fizzyPanels && !onDismiss && "pt-[calc(var(--cds-pad-md)-2px)]", value19 && !value20 && "pb-lg", value6 ? pictogramCardRadiusClass : "rounded-card", calloutVariantClasses[value4], CALLOUT_STACKS_CLASS, CALLOUT_STACKS_COVER_CLASS, className),
      children: [
        icon !== null && (!value20 || fizzyColor && value4 !== "neutral") && jsxd8.jsx("span", {
          className: (0, runtime2.cn)(value22 ? "flex min-h-[1lh] shrink-0 items-center" : "shrink-0", value6 && "ms-[4px] -me-[4px]", !value8 && calloutIconStacksClasses[value4]),
          children: value7 ? icon : jsxd8.jsx(runtime2.Icon, {
            name: calloutDefaultIcons[value4],
            size: "auto"
          })
        }),
        value9 ? jsxd8.jsx("div", {
          className: (0, runtime2.cn)("flex min-w-0 flex-1 flex-col", value5 && leadingIconInsetClasses[value5]),
          children: jsxd8.jsxs(runtime2.Collapsible.Root, {
            className: "contents",
            open: value21,
            onOpenChange: callback,
            children: [
              jsxd8.jsxs("div", {
                className: "flex min-w-0 flex-wrap items-start gap-y-sm gap-x-md",
                children: [
                  jsxd8.jsx(runtime2.Collapsible.Trigger, {
                    render: jsxd8.jsxs("button", {
                      type: "button",
                      className: "cds-reset flex min-w-0 grow select-none items-center gap-x-[2px] border-0 text-start outline-none focus-visible:shadow-focus focus-visible:outline-hidden rounded transition-shadow duration-fast",
                      children: [
                        jsxd8.jsx("div", {
                          className: "min-w-0",
                          children
                        }),
                        jsxd8.jsx(runtime2.Icon, {
                          name: detailsCaretIcon,
                          size: "sm",
                          className: `shrink-0 ${calloutTextClasses[value4]} transition-transform ${value21 ? "rotate-0" : "-rotate-90 rtl:rotate-90"}`
                        })
                      ]
                    })
                  }),
                  value23
                ]
              }),
              jsxd8.jsx(runtime2.Collapsible.Panel, {
                className: `w-full ${calloutTextClasses[value4]}`,
                children: jsxd8.jsx("div", {
                  className: "pt-[var(--cds-gap-sm)]",
                  children: details
                })
              })
            ]
          })
        }) : jsxd8.jsxs("div", {
          className: (0, runtime2.cn)("flex min-w-0 flex-wrap", value16 ? "items-center" : "items-start", "gap-y-sm gap-x-md flex-1", value20 && "gap-y-xs", value20 && fizzyPanels && !onDismiss && "me-[2px]", value5 && leadingIconInsetClasses[value5]),
          children: [
            jsxd8.jsx("div", {
              ref: ref2,
              className: value16 ? value6 ? "min-w-[min(40ch,100%)] flex-1" : "min-w-[min(20ch,100%)] flex-1" : "max-w-full min-w-0 flex-auto",
              children
            }),
            value23
          ]
        }),
        onDismiss && jsxd8.jsx("span", {
          ...state,
          className: (0, runtime2.cn)(value5 !== void 0 ? fizzyPanels ? "-me-[2px]" : trailingIconOutsetClasses[value5] : actionTrailingClass, "flex h-[1lh] shrink-0 items-center", centerDismiss && "self-center"),
          children: jsxd8.jsx(runtime2.Button, {
            variant: "ghost",
            iconOnly: !0,
            icon: "X",
            "aria-label": value2,
            tooltip: !1,
            onClick: onDismiss
          })
        })
      ]
    });
  }
  function omitProps(input, options) {
    let value = input, state = {};
    for (let value2 of Object.keys(value))
      options.includes(value2) || (state[value2] = value[value2]);
    return state;
  }
  function InteractiveLinkElement({ stamp, forwardedRef, linkInput, render, body, className, actionClassName, actionDisabled, rest }) {
    let value = reactpK0.isValidElement(render), value2 = (0, runtime2.useCdsLink)({
      ...linkInput,
      ...(0, runtime2.pickLinkEventProps)(rest),
      href: value ? void 0 : linkInput.href
    }), value3 = omitProps(rest, [
      ...interactiveLinkReservedProps,
      "disabled"
    ]), value4 = (0, runtime2.baseUseRender)({
      enabled: value,
      render,
      ref: forwardedRef,
      props: {
        ...value3,
        ...stamp,
        className,
        children: body
      }
    });
    if (value)
      return value4;
    if (linkInput.href !== void 0) {
      let value6 = omitProps(rest, [
        ...interactiveLinkReservedProps,
        ...runtime2.linkEventPropNames
      ]);
      return jsxGP.jsx("a", {
        ref: forwardedRef,
        ...stamp,
        ...value6,
        ...value2,
        className,
        children: body
      });
    }
    let value5 = omitProps(rest, ["href", "disabled"]);
    return jsxGP.jsx(runtime2.baseButton, {
      render: jsxGP.jsx("span", {
        ...stamp
      }),
      nativeButton: !1,
      ...actionDisabled !== void 0 ? {
        disabled: actionDisabled
      } : {},
      ref: forwardedRef,
      ...value5,
      className: actionClassName,
      children: body
    });
  }
  function NewTabAnnouncement({ id }) {
    return jsxdK0.jsx("span", {
      id,
      hidden: !0,
      className: "sr-only",
      children: (0, runtime2.useTranslation)("opensInNewTab", "(opens in new tab)")
    });
  }
  function TextLinkIcon(input) {
    return (0, runtime2.isIconName)(input) ? jsxp4.jsx(runtime2.Icon, {
      name: input,
      size: "sm",
      className: "self-center",
      style: {
        fontSize: "1lh"
      }
    }) : jsxp4.jsx("span", {
      className: "self-center",
      children: input
    });
  }
  function readInlineStyleProperty(input, options) {
    return {
      value: input.getPropertyValue(options),
      priority: input.getPropertyPriority(options)
    };
  }
  function isOwnedImportantStyle(input, options, context) {
    return context !== void 0 && input.getPropertyPriority(options) === "important" && input.getPropertyValue(options) === context;
  }
  function restoreDialogStyleOverride(input) {
    let style = input.node.style;
    for (let value of dialogOverrideStyleProperties)
      if (isOwnedImportantStyle(style, value, input.written[value])) {
        let { value: value2, priority: value3 } = input.baseline[value];
        style.setProperty(value, value2, value3);
      }
  }
  function useDialogVisualKeyboard(input) {
    let [value, value2] = reactc4.useState(null), [value3, value4] = reactc4.useState(null), callback = reactc4.useCallback((input2) => !input || value === null ? () => {
    } : (value.addEventListener("focusin", input2), value.addEventListener("focusout", input2), () => {
      value.removeEventListener("focusin", input2), value.removeEventListener("focusout", input2);
    }), [input, value]), callback2 = reactc4.useCallback(() => {
      if (!input || value === null)
        return !1;
      let activeElement2 = value.ownerDocument.activeElement;
      return value.contains(activeElement2) && (0, runtime2.isEditableElement)(activeElement2);
    }, [input, value]), value5 = reactc4.useSyncExternalStore(callback, callback2, () => !1);
    (0, runtime2.useVisualKeyboard)(input && (value5 || value3 !== null), value4);
    let memo4 = reactc4.useMemo(() => getKeyboardAdjustedDialogStyle(value3), [value3]), ref = reactc4.useRef(null);
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = ref.current;
      if (current !== null && (current.node !== value || memo4 === void 0) && (restoreDialogStyleOverride(current), ref.current = null), value === null || memo4 === void 0)
        return;
      let style = value.style, state = {
        top: memo4.top,
        "max-height": memo4.maxHeight,
        "min-height": "0px"
      }, current2 = ref.current;
      if (current2 === null) {
        if (dialogKeyboardPositionProperties.some((input2) => style.getPropertyValue(input2) !== ""))
          return;
        current2 = {
          node: value,
          baseline: {
            top: readInlineStyleProperty(style, "top"),
            "max-height": readInlineStyleProperty(style, "max-height"),
            "min-height": readInlineStyleProperty(style, "min-height")
          },
          intended: {},
          written: {},
          cap: ""
        }, ref.current = current2;
      } else {
        let value6 = dialogKeyboardExcludedStyleProperties.some((input2) => style.getPropertyValue(input2) !== "");
        for (let value7 of dialogOverrideStyleProperties)
          if (!isOwnedImportantStyle(style, value7, current2.written[value7])) {
            let value8 = readInlineStyleProperty(style, value7);
            current2.baseline[value7] = value8, value7 === "top" && value8.value !== "" && (value6 = !0);
          }
        if (value6) {
          restoreDialogStyleOverride(current2), ref.current = null;
          return;
        }
      }
      for (let value6 of dialogOverrideStyleProperties)
        (current2.intended[value6] !== state[value6] || !isOwnedImportantStyle(style, value6, current2.written[value6])) && (style.setProperty(value6, state[value6], "important"), current2.intended[value6] = state[value6], current2.written[value6] = style.getPropertyValue(value6));
      if (current2.cap !== memo4.maxHeight) {
        current2.cap = memo4.maxHeight;
        let activeElement2 = value.ownerDocument.activeElement, defaultView = value.ownerDocument.defaultView;
        defaultView !== null && activeElement2 instanceof defaultView.HTMLElement && activeElement2 !== value && value.contains(activeElement2) && scrollDialogInputIntoView(value, activeElement2);
      }
    }), (0, runtime2.useIsomorphicLayoutEffect)(() => () => {
      ref.current !== null && (restoreDialogStyleOverride(ref.current), ref.current = null);
    }, []), value2;
  }
  function getKeyboardAdjustedDialogStyle(input) {
    if (!(input === null || input.visible < MINIMUM_DIALOG_KEYBOARD_VISIBLE_HEIGHT))
      return {
        top: `calc(${input.offset + (input.visible + DIALOG_KEYBOARD_MARGIN_PX) / 2}px - ${DIALOG_KEYBOARD_MARGIN_CSS} / 2)`,
        maxHeight: `calc(${input.visible - DIALOG_KEYBOARD_MARGIN_PX}px - ${DIALOG_KEYBOARD_MARGIN_CSS})`
      };
  }
  function scrollDialogInputIntoView(element, options) {
    let defaultView = element.ownerDocument.defaultView;
    if (defaultView !== null)
      for (let parentElement = options.parentElement; parentElement !== null; parentElement = parentElement === element ? null : parentElement.parentElement) {
        if (parentElement.scrollHeight <= parentElement.clientHeight)
          continue;
        let { overflowY: style } = defaultView.getComputedStyle(parentElement);
        if (style !== "auto" && style !== "scroll")
          continue;
        let bounds = parentElement.getBoundingClientRect(), bounds2 = options.getBoundingClientRect();
        bounds2.bottom > bounds.bottom ? parentElement.scrollTop += bounds2.bottom - bounds.bottom + DIALOG_KEYBOARD_MARGIN_PX : bounds2.top < bounds.top && (parentElement.scrollTop -= bounds.top - bounds2.top + DIALOG_KEYBOARD_MARGIN_PX);
      }
  }
  return bindRuntimeValue(runtime2, "resizeTextAreaToContent", () => resizeTextAreaToContent), bindRuntimeValue(runtime2, "observeTextAreaValue", () => observeTextAreaValue), bindRuntimeValue(runtime2, "useTextAreaAutosize", () => useTextAreaAutosize), bindRuntimeValue(runtime2, "reactHu", () => reactHu, (value) => {
    reactHu = value;
  }), bindRuntimeValue(runtime2, "supportsNativeFieldSizing", () => supportsNativeFieldSizing, (value) => {
    supportsNativeFieldSizing = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs", () => initializeUiInputs, (value) => {
    initializeUiInputs = value;
  }), bindRuntimeValue(runtime2, "reactForUiInputs", () => reactForUiInputs, (value) => {
    reactForUiInputs = value;
  }), bindRuntimeValue(runtime2, "jsxForUiInputs", () => jsxForUiInputs, (value) => {
    jsxForUiInputs = value;
  }), bindRuntimeValue(runtime2, "TextArea", () => TextArea, (value) => {
    TextArea = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs2", () => initializeUiInputs2, (value) => {
    initializeUiInputs2 = value;
  }), bindRuntimeValue(runtime2, "reactForUiInputs2", () => reactForUiInputs2, (value) => {
    reactForUiInputs2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiInputs2", () => jsxForUiInputs2, (value) => {
    jsxForUiInputs2 = value;
  }), bindRuntimeValue(runtime2, "COUNTER_VARIANT_CLASSES", () => COUNTER_VARIANT_CLASSES, (value) => {
    COUNTER_VARIANT_CLASSES = value;
  }), bindRuntimeValue(runtime2, "COUNTER_SIZE_CLASSES", () => COUNTER_SIZE_CLASSES, (value) => {
    COUNTER_SIZE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "Counter", () => Counter, (value) => {
    Counter = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs3", () => initializeUiInputs3, (value) => {
    initializeUiInputs3 = value;
  }), bindRuntimeValue(runtime2, "isPictogramElement", () => isPictogramElement), bindRuntimeValue(runtime2, "isPictogramComponent", () => isPictogramComponent), bindRuntimeValue(runtime2, "reactfK0", () => reactfK0, (value) => {
    reactfK0 = value;
  }), bindRuntimeValue(runtime2, "REACT_MEMO_SYMBOL", () => REACT_MEMO_SYMBOL, (value) => {
    REACT_MEMO_SYMBOL = value;
  }), bindRuntimeValue(runtime2, "REACT_FORWARD_REF_SYMBOL", () => REACT_FORWARD_REF_SYMBOL, (value) => {
    REACT_FORWARD_REF_SYMBOL = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs4", () => initializeUiInputs4, (value) => {
    initializeUiInputs4 = value;
  }), bindRuntimeValue(runtime2, "pictogramCardRadiusClass", () => pictogramCardRadiusClass, (value) => {
    pictogramCardRadiusClass = value;
  }), bindRuntimeValue(runtime2, "initializeSplitButtonNoop", () => initializeSplitButtonNoop, (value) => {
    initializeSplitButtonNoop = value;
  }), bindRuntimeValue(runtime2, "leadingIconInsetClasses", () => leadingIconInsetClasses, (value) => {
    leadingIconInsetClasses = value;
  }), bindRuntimeValue(runtime2, "leadingIconOutsetClasses", () => leadingIconOutsetClasses, (value) => {
    leadingIconOutsetClasses = value;
  }), bindRuntimeValue(runtime2, "SPLIT_BUTTON_LABEL_CLASS", () => SPLIT_BUTTON_LABEL_CLASS, (value) => {
    SPLIT_BUTTON_LABEL_CLASS = value;
  }), bindRuntimeValue(runtime2, "trailingIconOutsetClasses", () => trailingIconOutsetClasses, (value) => {
    trailingIconOutsetClasses = value;
  }), bindRuntimeValue(runtime2, "SPLIT_BUTTON_ICON_CLASS", () => SPLIT_BUTTON_ICON_CLASS, (value) => {
    SPLIT_BUTTON_ICON_CLASS = value;
  }), bindRuntimeValue(runtime2, "leadingIconSpacingClasses", () => leadingIconSpacingClasses, (value) => {
    leadingIconSpacingClasses = value;
  }), bindRuntimeValue(runtime2, "SPLIT_BUTTON_STYLE_DEFAULTS", () => SPLIT_BUTTON_STYLE_DEFAULTS, (value) => {
    SPLIT_BUTTON_STYLE_DEFAULTS = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs5", () => initializeUiInputs5, (value) => {
    initializeUiInputs5 = value;
  }), bindRuntimeValue(runtime2, "Callout", () => Callout), bindRuntimeValue(runtime2, "reactZQ", () => reactZQ, (value) => {
    reactZQ = value;
  }), bindRuntimeValue(runtime2, "jsxd8", () => jsxd8, (value) => {
    jsxd8 = value;
  }), bindRuntimeValue(runtime2, "calloutSizeByDensity", () => calloutSizeByDensity, (value) => {
    calloutSizeByDensity = value;
  }), bindRuntimeValue(runtime2, "CALLOUT_PICTOGRAM_SIZE", () => CALLOUT_PICTOGRAM_SIZE, (value) => {
    CALLOUT_PICTOGRAM_SIZE = value;
  }), bindRuntimeValue(runtime2, "calloutVariantClasses", () => calloutVariantClasses, (value) => {
    calloutVariantClasses = value;
  }), bindRuntimeValue(runtime2, "calloutTextClasses", () => calloutTextClasses, (value) => {
    calloutTextClasses = value;
  }), bindRuntimeValue(runtime2, "calloutDefaultIcons", () => calloutDefaultIcons, (value) => {
    calloutDefaultIcons = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs6", () => initializeUiInputs6, (value) => {
    initializeUiInputs6 = value;
  }), bindRuntimeValue(runtime2, "omitProps", () => omitProps), bindRuntimeValue(runtime2, "InteractiveLinkElement", () => InteractiveLinkElement), bindRuntimeValue(runtime2, "reactpK0", () => reactpK0, (value) => {
    reactpK0 = value;
  }), bindRuntimeValue(runtime2, "jsxGP", () => jsxGP, (value) => {
    jsxGP = value;
  }), bindRuntimeValue(runtime2, "interactiveLinkReservedProps", () => interactiveLinkReservedProps, (value) => {
    interactiveLinkReservedProps = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs7", () => initializeUiInputs7, (value) => {
    initializeUiInputs7 = value;
  }), bindRuntimeValue(runtime2, "NewTabAnnouncement", () => NewTabAnnouncement), bindRuntimeValue(runtime2, "jsxdK0", () => jsxdK0, (value) => {
    jsxdK0 = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs8", () => initializeUiInputs8, (value) => {
    initializeUiInputs8 = value;
  }), bindRuntimeValue(runtime2, "TextLinkIcon", () => TextLinkIcon), bindRuntimeValue(runtime2, "reactForUiInputs3", () => reactForUiInputs3, (value) => {
    reactForUiInputs3 = value;
  }), bindRuntimeValue(runtime2, "jsxp4", () => jsxp4, (value) => {
    jsxp4 = value;
  }), bindRuntimeValue(runtime2, "TEXT_LINK_CLASS", () => TEXT_LINK_CLASS, (value) => {
    TEXT_LINK_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_LINK_UNDERLINE_CLASS", () => TEXT_LINK_UNDERLINE_CLASS, (value) => {
    TEXT_LINK_UNDERLINE_CLASS = value;
  }), bindRuntimeValue(runtime2, "textLinkVariants", () => textLinkVariants, (value) => {
    textLinkVariants = value;
  }), bindRuntimeValue(runtime2, "TEXT_LINK_COLOR_CLASS", () => TEXT_LINK_COLOR_CLASS, (value) => {
    TEXT_LINK_COLOR_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_LINK_FOCUS_CLASS", () => TEXT_LINK_FOCUS_CLASS, (value) => {
    TEXT_LINK_FOCUS_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_LINK_DISABLED_CLASS", () => TEXT_LINK_DISABLED_CLASS, (value) => {
    TEXT_LINK_DISABLED_CLASS = value;
  }), bindRuntimeValue(runtime2, "TEXT_LINK_EXTERNAL_ICON_CLASS", () => TEXT_LINK_EXTERNAL_ICON_CLASS, (value) => {
    TEXT_LINK_EXTERNAL_ICON_CLASS = value;
  }), bindRuntimeValue(runtime2, "TextLink", () => TextLink, (value) => {
    TextLink = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs9", () => initializeUiInputs9, (value) => {
    initializeUiInputs9 = value;
  }), bindRuntimeValue(runtime2, "readInlineStyleProperty", () => readInlineStyleProperty), bindRuntimeValue(runtime2, "isOwnedImportantStyle", () => isOwnedImportantStyle), bindRuntimeValue(runtime2, "restoreDialogStyleOverride", () => restoreDialogStyleOverride), bindRuntimeValue(runtime2, "useDialogVisualKeyboard", () => useDialogVisualKeyboard), bindRuntimeValue(runtime2, "getKeyboardAdjustedDialogStyle", () => getKeyboardAdjustedDialogStyle), bindRuntimeValue(runtime2, "scrollDialogInputIntoView", () => scrollDialogInputIntoView), bindRuntimeValue(runtime2, "reactc4", () => reactc4, (value) => {
    reactc4 = value;
  }), bindRuntimeValue(runtime2, "DIALOG_KEYBOARD_MARGIN_PX", () => DIALOG_KEYBOARD_MARGIN_PX, (value) => {
    DIALOG_KEYBOARD_MARGIN_PX = value;
  }), bindRuntimeValue(runtime2, "DIALOG_KEYBOARD_MARGIN_CSS", () => DIALOG_KEYBOARD_MARGIN_CSS, (value) => {
    DIALOG_KEYBOARD_MARGIN_CSS = value;
  }), bindRuntimeValue(runtime2, "MINIMUM_DIALOG_KEYBOARD_VISIBLE_HEIGHT", () => MINIMUM_DIALOG_KEYBOARD_VISIBLE_HEIGHT, (value) => {
    MINIMUM_DIALOG_KEYBOARD_VISIBLE_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "dialogOverrideStyleProperties", () => dialogOverrideStyleProperties, (value) => {
    dialogOverrideStyleProperties = value;
  }), bindRuntimeValue(runtime2, "dialogKeyboardExcludedStyleProperties", () => dialogKeyboardExcludedStyleProperties, (value) => {
    dialogKeyboardExcludedStyleProperties = value;
  }), bindRuntimeValue(runtime2, "dialogKeyboardPositionProperties", () => dialogKeyboardPositionProperties, (value) => {
    dialogKeyboardPositionProperties = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs10", () => initializeUiInputs10, (value) => {
    initializeUiInputs10 = value;
  }), () => {
    initializeUiInputs = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), reactHu = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), supportsNativeFieldSizing = typeof CSS > "u" || typeof CSS.supports != "function" || CSS.supports("field-sizing", "content");
    }), initializeUiInputs2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializeUiDisclosure12)(), (0, runtime2.initializeUiMenu)(), initializeUiInputs(), (0, runtime2.initializeNpmDependency)(), reactForUiInputs = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiInputs = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TextArea = reactForUiInputs.forwardRef(({ className, rows, resize = "none", autosize = !1, bare = !1, size: size4, fullWidth = !0, id, "aria-describedby": ariaDescribedby, "aria-invalid": ariaInvalid, disabled: disabled2, style, ...props }, options) => {
        let value = (0, runtime2.useFieldInvalid)(), value2 = rows ?? 3, value3 = autosize && rows !== void 0, value4 = resize === "y" ? "resize-y" : "resize-none", value5 = autosize ? "[field-sizing:content]" : "", value6 = useTextAreaAutosize({
          autosize,
          value: props.value,
          defaultValue: props.defaultValue
        }), value7 = (0, runtime2.useMergedRefs)(options, value6), value8 = value3 ? bare ? "min-h-[calc(var(--cds-textarea-rows)*1lh)]" : "min-h-[calc(var(--cds-textarea-rows)*1lh+2*var(--cds-pad-sm))]" : "", value9 = value3 ? {
          ...style,
          "--cds-textarea-rows": value2
        } : style, value10 = fullWidth ? "w-full" : "";
        return jsxForUiInputs.jsx(runtime2.baseField.Control, {
          id,
          "aria-describedby": ariaDescribedby,
          disabled: disabled2,
          render: jsxForUiInputs.jsx("textarea", {
            ref: value7,
            "data-cds": "TextArea",
            rows: value2,
            style: value9,
            ...(0, runtime2.getControlSizeAttributes)(size4),
            "data-invalid": value || void 0,
            "aria-invalid": value || ariaInvalid,
            ...props,
            className: (0, runtime2.cn)("cds-reset", value10, bare ? "block resize-none border-0 bg-transparent p-0 shadow-none" : `cds-input font-normal ${runtime2.TEXT_INPUT_PLACEHOLDER_CLASS} enabled:[&:hover:not(:focus):not([data-invalid])]:shadow-field-hover focus-visible:shadow-focus data-[invalid]:focus-visible:shadow-focus-danger ${value4}`, "font-sans text-body text-primary placeholder:text-muted outline-none focus-visible:outline-hidden disabled:opacity-disabled", value5, value8, className)
          })
        });
      }), TextArea.displayName = "TextArea";
    }), initializeUiInputs3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), reactForUiInputs2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiInputs2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), COUNTER_VARIANT_CLASSES = {
        neutral: "bg-neutral text-secondary",
        accent: "bg-fill-accent text-on-accent",
        success: "bg-green-500 text-gray-0",
        warning: "bg-fill-warning text-yellow-750",
        danger: "bg-fill-danger text-on-danger"
      }, COUNTER_STACKS_CLASSES = {
        success: "stacks:bg-fill-tint-green",
        warning: "stacks:text-on-warning"
      }, COUNTER_SIZE_CLASSES = {
        neutral: "bg-fill-control",
        accent: "bg-fill-accent",
        success: "bg-fill-success",
        warning: "bg-fill-warning",
        danger: "bg-fill-danger"
      }, Counter = reactForUiInputs2.forwardRef(({ value, max: max2 = 99, showZero = !1, dot = !1, variant = "danger", size: size4, className, ...props }, options) => {
        if (dot)
          return jsxForUiInputs2.jsx("span", {
            ref: options,
            "data-cds": "Counter",
            "aria-hidden": "true",
            ...props,
            className: (0, runtime2.cn)("inline-block size-2 shrink-0 rounded-full align-middle", COUNTER_SIZE_CLASSES[variant], className)
          });
        if (!Number.isFinite(value))
          return null;
        let value2 = Math.max(0, Math.floor(value));
        if (value2 === 0 && !showZero)
          return null;
        let value3 = value2 > max2 ? `${max2}+` : `${value2}`;
        return jsxForUiInputs2.jsx("span", {
          ref: options,
          "data-cds": "Counter",
          ...size4 === "xxs" ? { "data-step": "1" } : (0, runtime2.getControlSizeAttributes)(size4),
          ...props,
          className: (0, runtime2.cn)("inline-flex shrink-0 items-center justify-center align-middle", "h-control-nested min-w-[var(--cds-h-control-nested)] rounded-full", value3.length === 1 ? "px-0" : "px-[calc(var(--cds-h-control-nested)*0.3)]", "font-sans text-caption font-medium proportional-nums", COUNTER_VARIANT_CLASSES[variant], COUNTER_STACKS_CLASSES[variant], className),
          children: value3
        });
      }), Counter.displayName = "Counter";
    }), initializeUiInputs4 = (0, runtime2.initializeOnce)(() => {
      reactfK0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), REACT_MEMO_SYMBOL = Symbol.for("react.memo"), REACT_FORWARD_REF_SYMBOL = Symbol.for("react.forward_ref");
    }), pictogramCardRadiusClass = "rounded-composer", initializeSplitButtonNoop = () => {
    }, initializeUiInputs5 = (0, runtime2.initializeOnce)(() => {
      leadingIconInsetClasses = {
        glyph: "ml-[6px] compact:ml-[6px] comfortable:ml-[4px]",
        text: "ml-[4px] compact:ml-[4px] comfortable:ml-[2px]"
      }, leadingIconOutsetClasses = {
        glyph: "-ml-[6px] compact:-ml-[6px] comfortable:-ml-[4px]",
        text: "-ml-[4px] compact:-ml-[4px] comfortable:-ml-[2px]"
      }, SPLIT_BUTTON_LABEL_CLASS = leadingIconInsetClasses.glyph, trailingIconOutsetClasses = {
        glyph: "-mr-[4px]",
        text: "-mr-[2px] compact:-mr-[2px] comfortable:-mr-[4px]"
      }, SPLIT_BUTTON_ICON_CLASS = trailingIconOutsetClasses.glyph, leadingIconSpacingClasses = {
        glyph: "me-[calc(8px-var(--cds-pad-md))] compact:me-[calc(8px-var(--cds-pad-md))] comfortable:me-[calc(4px-var(--cds-pad-md))]",
        text: "me-[calc(6px-var(--cds-pad-md))] compact:me-[calc(6px-var(--cds-pad-md))] comfortable:me-[calc(5px-var(--cds-pad-md))]"
      }, SPLIT_BUTTON_STYLE_DEFAULTS = leadingIconSpacingClasses.glyph;
    }), CALLOUT_PICTOGRAM_SIZE = 64, initializeUiInputs6 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFeatureFlags)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeResizeObserverAccess)(), (0, runtime2.initializeFizzyLakeIcons)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeUiDisclosure4)(), (0, runtime2.initializeUiDisclosure9)(), initializeUiInputs4(), initializeSplitButtonNoop(), initializeUiInputs5(), reactZQ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxd8 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), calloutSizeByDensity = {
        comfortable: "sm",
        compact: "base"
      }, calloutVariantClasses = {
        neutral: "bg-surface-1 layers-1-[color:var(--cds-banner-neutral-tint)] text-primary shadow-[inset_0_0_0_var(--cds-ring-inner)_var(--cds-banner-neutral-ring,var(--cds-ring-color)),0_0_0_var(--cds-ring-outer)_var(--cds-banner-neutral-ring,var(--cds-ring-color))] [--cds-prose-code-color:var(--cds-text-danger)] [--cds-prose-marker-color:var(--cds-text-secondary)] [--cds-text-link-color:initial]",
        warning: "bg-warning text-warning shadow-ring-warning [--cds-prose-code-color:currentColor] [--cds-prose-marker-color:currentColor] [--cds-text-link-color:var(--cds-text-warning)]",
        danger: "bg-danger text-danger shadow-ring-danger [--cds-prose-code-color:currentColor] [--cds-prose-marker-color:currentColor] [--cds-text-link-color:var(--cds-text-danger)]"
      }, calloutIconStacksClasses = {
        neutral: "stacks:text-secondary",
        warning: "stacks:text-fill-warning",
        danger: "stacks:text-fill-danger"
      }, calloutTextClasses = {
        neutral: "text-secondary",
        warning: `${CALLOUT_TEXT_TINT_CLASS} stacks:text-secondary`,
        danger: `${CALLOUT_TEXT_TINT_CLASS} stacks:text-secondary`
      }, calloutDefaultIcons = {
        neutral: "Info",
        warning: "Warning",
        danger: "Warning"
      };
    }), initializeUiInputs7 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCdsLink)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactpK0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxGP = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), interactiveLinkReservedProps = [
        "href",
        "routerOptions",
        "target",
        "rel",
        "download"
      ];
    }), initializeUiInputs8 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeTranslations)(), jsxdK0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), TEXT_LINK_CLASS = "cds-reset cds-text-link", TEXT_LINK_UNDERLINE_CLASS = "cds-text-link-underline", TEXT_LINK_COLOR_CLASS = "text-inherit [transition-property:text-decoration-color,box-shadow] [&:not(:hover,:focus-visible)]:[--_text-link-line:color-mix(in_srgb,currentColor,transparent_35%)]", TEXT_LINK_FOCUS_CLASS = "[transition-property:text-decoration-color]", initializeUiInputs9 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeHrefWhitespace)(), (0, runtime2.initializeLinkTargets)(), (0, runtime2.initializeCdsLink)(), (0, runtime2.initializePointerDismissal)(), (0, runtime2.initializeIcons)(), initializeUiInputs7(), initializeUiInputs8(), (0, runtime2.initializeNpmDependency)(), reactForUiInputs3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxp4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), textLinkVariants = `${TEXT_LINK_CLASS} ${TEXT_LINK_UNDERLINE_CLASS} inline`, TEXT_LINK_DISABLED_CLASS = `${TEXT_LINK_CLASS} inline-flex items-baseline`, TEXT_LINK_EXTERNAL_ICON_CLASS = TEXT_LINK_UNDERLINE_CLASS, TextLink = reactForUiInputs3.forwardRef(({ className, children, icon, iconPosition = "end", external, inheritColor, render, "aria-describedby": ariaDescribedby, ...props }, options) => {
        let value = "href" in props && props.href !== void 0, value2 = reactForUiInputs3.useContext(runtime2.pointerDismissalContext), value3 = inheritColor ?? value2, value4 = external && !(value && !reactForUiInputs3.isValidElement(render) && (0, runtime2.isSanitizedHrefFallback)(props.href, (0, runtime2.sanitizeHref)(props.href))) ? external : !1, value5 = value ? props.target ?? (value4 ? "_blank" : void 0) : void 0, value6 = value ? props.rel ?? (value4 && value5 !== void 0 && !(0, runtime2.opensInSeparateBrowsingContext)(value5) ? (0, runtime2.getAutomaticLinkRel)(props.href, value5) : void 0) : void 0, value7 = reactForUiInputs3.useId(), value8 = jsxp4.jsx(NewTabAnnouncement, {
          id: value7
        }), value9 = icon || (value4 === "with-icon" ? "ArrowUpRight" : void 0), value10 = !!value9, value11 = `${(0, runtime2.cn)(value10 ? (0, runtime2.clsx)(TEXT_LINK_DISABLED_CLASS, icon ? "gap-[0.25em]" : "gap-0") : textLinkVariants, value3 && TEXT_LINK_COLOR_CLASS, inheritColor === !1 && TEXT_LINK_OWN_COLOR_CLASS)}`, value12 = value10 ? jsxp4.jsxs(jsxp4.Fragment, {
          children: [
            iconPosition === "start" && TextLinkIcon(value9),
            jsxp4.jsx("span", {
              className: (0, runtime2.clsx)(TEXT_LINK_EXTERNAL_ICON_CLASS, value3 && TEXT_LINK_FOCUS_CLASS),
              children
            }),
            iconPosition === "end" && TextLinkIcon(value9),
            value4 && value8
          ]
        }) : value4 ? jsxp4.jsxs(jsxp4.Fragment, {
          children: [children, value8]
        }) : children, value13 = (0, runtime2.cn)(value11, "cursor-pointer", className), value14 = props.disabled ?? !1;
        return jsxp4.jsx(InteractiveLinkElement, {
          stamp: {
            "data-cds": "TextLink"
          },
          forwardedRef: options,
          linkInput: {
            href: value ? props.href : void 0,
            routerOptions: value ? props.routerOptions : void 0,
            target: value5,
            rel: value6,
            download: value ? props.download : void 0
          },
          render,
          body: value12,
          className: value13,
          actionClassName: (0, runtime2.cn)(value11, value14 ? "cursor-default opacity-disabled" : "cursor-pointer", className),
          actionDisabled: value14,
          rest: {
            ...props,
            ...value3 && {
              "data-inherit-color": ""
            },
            "aria-describedby": [ariaDescribedby, value4 ? value7 : void 0].filter(Boolean).join(" ") || void 0
          }
        });
      }), TextLink.displayName = "TextLink";
    }), DIALOG_KEYBOARD_MARGIN_PX = 8, MINIMUM_DIALOG_KEYBOARD_VISIBLE_HEIGHT = 240, initializeUiInputs10 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeVisualKeyboard)(), reactc4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), DIALOG_KEYBOARD_MARGIN_CSS = `max(${DIALOG_KEYBOARD_MARGIN_PX}px, env(safe-area-inset-bottom, 0px))`, dialogOverrideStyleProperties = ["top", "max-height", "min-height"], dialogKeyboardExcludedStyleProperties = [
        "bottom",
        "inset",
        "translate",
        "transform"
      ], dialogKeyboardPositionProperties = [
        "top",
        ...dialogKeyboardExcludedStyleProperties
      ];
    });
  };
}
export {
  installUiInputs
};
