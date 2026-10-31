// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiTabs(runtime2) {
  var checkedTabFlexDocuments, initializeUiTabs, reactForUiTabs, jsxForUiTabs, initializeUiTabs2, reactForUiTabs2, jsxForUiTabs2, FORM_SIZE_GAP_CLASSES, Form, initializeUiTabs3, reactForUiTabs3, jsxForUiTabs3, SWITCH_TRACK_CLASS, SWITCH_THUMB_CLASS, SWITCH_TRACK_SIZE_CLASS, SWITCH_THUMB_SIZE_CLASS, Switch, initializeUiTabs4, reactForUiTabs4, jsxForUiTabs4, RADIO_MARK_CLASS, RadioGroupItem, RADIO_ITEM_CLASS, RadioGroupCard, RadioGroupRoot, RADIO_CARD_CLASS, initializeUiTabs5, reactForUiTabs5, jsxForUiTabs5, RESIZE_HANDLE_DRAG_TOLERANCE, RESIZE_HANDLE_KEY_STEP, RESIZE_HANDLE_SHIFT_KEY_STEP, RESIZE_HANDLE_SIDE_CLASSES, RESIZE_HANDLE_RELEASE_GRACE_MS, RESIZE_PILL_CLASSES, RESIZE_LINE_CLASSES, ResizeHandle, initializeUiTabs6;
  function isUnwrappedHorizontalFlex(input) {
    let value = getComputedStyle(input);
    return value.display.endsWith("flex") && !value.flexDirection.startsWith("column") && !value.flexWrap.startsWith("wrap");
  }
  function getInnerElementWidth(input) {
    let value = getComputedStyle(input);
    return input.getBoundingClientRect().width - (Number.parseFloat(value.paddingLeft) || 0) - (Number.parseFloat(value.paddingRight) || 0) - (Number.parseFloat(value.borderLeftWidth) || 0) - (Number.parseFloat(value.borderRightWidth) || 0);
  }
  function getTabOverflowWidth(input, options, context) {
    return context + measureVisibleSiblingWidth(input, options, Number.parseFloat(getComputedStyle(input).columnGap) || 0);
  }
  function measureVisibleSiblingWidth(input, options, context) {
    let index4 = 0;
    for (let value of Array.from(input.children)) {
      if (value === options || !(0, runtime2.isHtmlElement)(value))
        continue;
      let value2 = getComputedStyle(value);
      if (value2.position === "absolute" || value2.position === "fixed" || value2.display === "none")
        continue;
      if (value2.display === "contents") {
        index4 += measureVisibleSiblingWidth(value, options, context);
        continue;
      }
      if (value2.flexShrink === "0" && value2.flexGrow === "0") {
        index4 += value.getBoundingClientRect().width + context;
        continue;
      }
      let value3 = parsePixelCssValue(value2.flexBasis), attribute = value.getAttribute("style"), cssText = value.style.cssText;
      value.style.flex = "0 0 auto", value.style.width = "min-content";
      let width = value.getBoundingClientRect().width;
      applyTabFlexCorrection(value, attribute, cssText), index4 += Math.max(width, value3) + context;
    }
    return index4;
  }
  function applyTabFlexCorrection(element, options, context) {
    if (options === null) {
      element.removeAttribute("style");
      return;
    }
    let cssText = element.style.cssText;
    if (!checkedTabFlexDocuments.has(element.ownerDocument)) {
      if (element.setAttribute("style", options), !(cssText !== context && element.style.cssText === cssText))
        return;
      checkedTabFlexDocuments.add(element.ownerDocument);
    }
    element.style.cssText = context;
  }
  function parsePixelCssValue(input) {
    return /^\d*\.?\d+px$/.test(input) ? Number.parseFloat(input) : 0;
  }
  function measureTabStripContents(input) {
    let { POSITIVE_INFINITY: value, NEGATIVE_INFINITY: value2 } = Number;
    for (let value4 of Array.from(input.children)) {
      if (!(0, runtime2.isHtmlElement)(value4) && !(0, runtime2.isSvgElement)(value4))
        continue;
      let position = getComputedStyle(value4).position;
      if (position === "absolute" || position === "fixed")
        continue;
      let bounds = value4.getBoundingClientRect();
      bounds.width <= 0 && bounds.height <= 0 || (value = Math.min(value, bounds.left), value2 = Math.max(value2, bounds.right));
    }
    if (value2 < value)
      return 0;
    let value3 = getComputedStyle(input);
    return value2 - value + (Number.parseFloat(value3.paddingLeft) || 0) + (Number.parseFloat(value3.paddingRight) || 0);
  }
  function ButtonGroup(input) {
    let { variant = "spaced", orientation = "horizontal", children, size: size4, buttonVariant = "secondary" } = input, value = variant === "spaced" && orientation === "horizontal", memo4 = reactForUiTabs.useMemo(() => value ? classifyButtonGroupChildren(children) : null, [value, children]), value2 = memo4 !== null && memo4 !== "unrecognised", ref = reactForUiTabs.useRef(null), [value3, value4] = reactForUiTabs.useState(!1), ref2 = reactForUiTabs.useRef(0);
    if ((0, runtime2.useIsomorphicLayoutEffect)(() => {
      if (!value2)
        return;
      let current = ref.current, value6 = current?.parentElement ?? null;
      if (current === null || value6 === null)
        return;
      let value7 = (0, runtime2.getResizeObserverConstructor)(value6);
      if (value7 === void 0)
        return;
      let callback = () => {
        let value9 = getInnerElementWidth(value6);
        if (value9 <= 0)
          return;
        if (!isUnwrappedHorizontalFlex(value6)) {
          value3 && value4(!1);
          return;
        }
        if (value3) {
          value9 >= ref2.current + 64 && value4(!1);
          return;
        }
        let firstElementChild2 = current.firstElementChild;
        if (!(0, runtime2.isHtmlElement)(firstElementChild2))
          return;
        let value10 = getTabOverflowWidth(value6, current, firstElementChild2.getBoundingClientRect().width);
        ref2.current = value10, value9 < value10 && value4(!0);
      };
      callback();
      let value8 = new value7(callback);
      value8.observe(value6);
      let firstElementChild = current.firstElementChild;
      return (0, runtime2.isHtmlElement)(firstElementChild) && value8.observe(firstElementChild), () => value8.disconnect();
    }, [value2, value3]), !value)
      return jsxForUiTabs.jsx(runtime2.ButtonGroupRoot, {
        ...input
      });
    let value5 = value2 && value3;
    return jsxForUiTabs.jsx("span", {
      ref,
      className: "contents",
      "data-cds-collapsing": value2 ? "" : void 0,
      "data-collapsed": value5 ? "" : void 0,
      children: value5 ? jsxForUiTabs.jsx(runtime2.SplitButton, {
        ...memo4.primary.iconOnly && memo4.primary.icon !== void 0 ? {
          icon: memo4.primary.icon,
          "aria-label": memo4.primary.label
        } : {
          label: memo4.primary.label
        },
        variant: memo4.primary.variant ?? buttonVariant,
        size: size4,
        pressed: memo4.primary.pressed,
        pressedVariant: memo4.primary.pressedVariant,
        disabled: memo4.primary.disabled,
        onPrimaryClick: memo4.primary.onClick,
        items: memo4.overflow,
        className: input.className
      }) : jsxForUiTabs.jsx(runtime2.ButtonGroupRoot, {
        ...input
      })
    });
  }
  function elementHasDisplayName(element, displayName) {
    return element.type?.displayName === displayName;
  }
  function elementHasComponentType(element, component) {
    let value = element.type?.displayName;
    return element.type === component || !!value && value === component.displayName;
  }
  function flattenButtonGroupChildren(children) {
    return reactForUiTabs.Children.toArray(children).flatMap((input) => reactForUiTabs.isValidElement(input) && input.type === reactForUiTabs.Fragment ? reactForUiTabs.Children.toArray(input.props.children) : [input]);
  }
  function classifyButtonGroupChildren(children) {
    let value = flattenButtonGroupChildren(children);
    if (value.length < 2)
      return null;
    let items = [], value2 = null;
    for (let value3 of value) {
      if (!reactForUiTabs.isValidElement(value3))
        return "unrecognised";
      if (elementHasComponentType(value3, runtime2.Button)) {
        let props = value3.props;
        if ("href" in props && props.href !== void 0)
          return "unrecognised";
        let value4 = typeof props.icon == "string" ? props.icon : void 0, value5 = props.iconOnly === !0 ? props["aria-label"] : typeof props.children == "string" ? props.children : null;
        if (value5 === null)
          return "unrecognised";
        let onClick = props.onClick;
        if (onClick === void 0 || props.type === "submit" || props.type === "reset" || "render" in props)
          return null;
        value2 === null ? value2 = {
          label: value5,
          icon: value4,
          iconOnly: props.iconOnly === !0,
          onClick,
          pressed: props.pressed,
          pressedVariant: props.pressedVariant,
          disabled: props.disabled,
          variant: props.variant
        } : items.push({
          icon: value4,
          label: value5,
          disabled: props.disabled,
          onSelect: onClick,
          shortcut: "shortcut" in props && !props.hideShortcut ? props.shortcut : void 0,
          ...props.pressed !== void 0 && {
            checked: props.pressed,
            checkedRole: "checkbox",
            keepOpen: !0
          }
        });
      } else if (elementHasDisplayName(value3, "DropdownButton")) {
        let props = value3.props;
        if (!Array.isArray(props.items))
          return "unrecognised";
        let value4 = props.trigger === "label" || props.trigger === void 0 ? typeof props.label == "string" ? props.label : null : props["aria-label"];
        if (value4 === null)
          return "unrecognised";
        items.push({
          icon: "icon" in props ? props.icon : void 0,
          label: value4,
          disabled: props.disabled,
          items: props.items
        });
      } else
        return "unrecognised";
    }
    return value2 === null || value2.disabled === !0 && items.some((input) => input.disabled !== !0) ? null : {
      primary: value2,
      overflow: items
    };
  }
  function buttonGroupDiagnosticNoop(children, configuration) {
  }
  function preventRepeatedSwitchEnter(event) {
    event.repeat && event.key === "Enter" && event.preventDefault();
  }
  function RadioMark({ topAlign = !1, focusRing = !1 }) {
    return jsxForUiTabs4.jsx("span", {
      className: (0, runtime2.clsx)(RADIO_MARK_CLASS, focusRing && "group-focus-visible/rd:shadow-focus", topAlign && "mt-[calc((1lh_-_var(--cds-checkbox,1rem))_/_2)]"),
      children: jsxForUiTabs4.jsx(runtime2.baseRadio.Indicator, {
        className: "size-[calc(var(--cds-checkbox,1rem)-calc(0.625rem*var(--cds-rem-scale,1)))] rounded-full bg-[var(--cds-on-accent)] data-[unchecked]:hidden",
        keepMounted: !0
      })
    });
  }
  function radioOptionTabIndex(options, value, optionValue) {
    return options.some((option) => option.value === value) ? { tabIndex: value === optionValue ? 0 : -1 } : void 0;
  }
  function RadioGroup3(props) {
    let { value, defaultValue, onChange, options, disabled: disabled2, size: size4, name, className } = props;
    return jsxForUiTabs4.jsx(runtime2.baseRadioGroup, {
      "data-cds": "RadioGroup",
      value,
      defaultValue,
      onValueChange: onChange ? (input) => onChange(input) : void 0,
      disabled: disabled2,
      name,
      ...(0, runtime2.getControlSizeAttributes)(size4),
      className: (0, runtime2.cn)("flex flex-col gap-2 font-sans", className),
      children: options.map((input) => jsxForUiTabs4.jsx(RadioGroupItem, {
        value: input.value,
        label: input.label,
        description: input.description,
        disabled: input.disabled,
        ...radioOptionTabIndex(options, value, input.value)
      }, input.value))
    });
  }
  return bindRuntimeValue(runtime2, "isUnwrappedHorizontalFlex", () => isUnwrappedHorizontalFlex), bindRuntimeValue(runtime2, "getInnerElementWidth", () => getInnerElementWidth), bindRuntimeValue(runtime2, "getTabOverflowWidth", () => getTabOverflowWidth), bindRuntimeValue(runtime2, "measureVisibleSiblingWidth", () => measureVisibleSiblingWidth), bindRuntimeValue(runtime2, "applyTabFlexCorrection", () => applyTabFlexCorrection), bindRuntimeValue(runtime2, "parsePixelCssValue", () => parsePixelCssValue), bindRuntimeValue(runtime2, "measureTabStripContents", () => measureTabStripContents), bindRuntimeValue(runtime2, "checkedTabFlexDocuments", () => checkedTabFlexDocuments, (value) => {
    checkedTabFlexDocuments = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs", () => initializeUiTabs, (value) => {
    initializeUiTabs = value;
  }), bindRuntimeValue(runtime2, "ButtonGroup", () => ButtonGroup), bindRuntimeValue(runtime2, "elementHasDisplayName", () => elementHasDisplayName), bindRuntimeValue(runtime2, "elementHasComponentType", () => elementHasComponentType), bindRuntimeValue(runtime2, "flattenButtonGroupChildren", () => flattenButtonGroupChildren), bindRuntimeValue(runtime2, "classifyButtonGroupChildren", () => classifyButtonGroupChildren), bindRuntimeValue(runtime2, "buttonGroupDiagnosticNoop", () => buttonGroupDiagnosticNoop), bindRuntimeValue(runtime2, "reactForUiTabs", () => reactForUiTabs, (value) => {
    reactForUiTabs = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTabs", () => jsxForUiTabs, (value) => {
    jsxForUiTabs = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs2", () => initializeUiTabs2, (value) => {
    initializeUiTabs2 = value;
  }), bindRuntimeValue(runtime2, "reactForUiTabs2", () => reactForUiTabs2, (value) => {
    reactForUiTabs2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTabs2", () => jsxForUiTabs2, (value) => {
    jsxForUiTabs2 = value;
  }), bindRuntimeValue(runtime2, "FORM_SIZE_GAP_CLASSES", () => FORM_SIZE_GAP_CLASSES, (value) => {
    FORM_SIZE_GAP_CLASSES = value;
  }), bindRuntimeValue(runtime2, "Form", () => Form, (value) => {
    Form = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs3", () => initializeUiTabs3, (value) => {
    initializeUiTabs3 = value;
  }), bindRuntimeValue(runtime2, "preventRepeatedSwitchEnter", () => preventRepeatedSwitchEnter), bindRuntimeValue(runtime2, "reactForUiTabs3", () => reactForUiTabs3, (value) => {
    reactForUiTabs3 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTabs3", () => jsxForUiTabs3, (value) => {
    jsxForUiTabs3 = value;
  }), bindRuntimeValue(runtime2, "SWITCH_TRACK_CLASS", () => SWITCH_TRACK_CLASS, (value) => {
    SWITCH_TRACK_CLASS = value;
  }), bindRuntimeValue(runtime2, "SWITCH_THUMB_CLASS", () => SWITCH_THUMB_CLASS, (value) => {
    SWITCH_THUMB_CLASS = value;
  }), bindRuntimeValue(runtime2, "SWITCH_TRACK_SIZE_CLASS", () => SWITCH_TRACK_SIZE_CLASS, (value) => {
    SWITCH_TRACK_SIZE_CLASS = value;
  }), bindRuntimeValue(runtime2, "SWITCH_THUMB_SIZE_CLASS", () => SWITCH_THUMB_SIZE_CLASS, (value) => {
    SWITCH_THUMB_SIZE_CLASS = value;
  }), bindRuntimeValue(runtime2, "Switch", () => Switch, (value) => {
    Switch = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs4", () => initializeUiTabs4, (value) => {
    initializeUiTabs4 = value;
  }), bindRuntimeValue(runtime2, "RadioMark", () => RadioMark), bindRuntimeValue(runtime2, "radioOptionTabIndex", () => radioOptionTabIndex), bindRuntimeValue(runtime2, "RadioGroup", () => RadioGroup3), bindRuntimeValue(runtime2, "reactForUiTabs4", () => reactForUiTabs4, (value) => {
    reactForUiTabs4 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTabs4", () => jsxForUiTabs4, (value) => {
    jsxForUiTabs4 = value;
  }), bindRuntimeValue(runtime2, "RADIO_MARK_CLASS", () => RADIO_MARK_CLASS, (value) => {
    RADIO_MARK_CLASS = value;
  }), bindRuntimeValue(runtime2, "RadioGroupItem", () => RadioGroupItem, (value) => {
    RadioGroupItem = value;
  }), bindRuntimeValue(runtime2, "RADIO_ITEM_CLASS", () => RADIO_ITEM_CLASS, (value) => {
    RADIO_ITEM_CLASS = value;
  }), bindRuntimeValue(runtime2, "RadioGroupCard", () => RadioGroupCard, (value) => {
    RadioGroupCard = value;
  }), bindRuntimeValue(runtime2, "RadioGroupRoot", () => RadioGroupRoot, (value) => {
    RadioGroupRoot = value;
  }), bindRuntimeValue(runtime2, "RADIO_CARD_CLASS", () => RADIO_CARD_CLASS, (value) => {
    RADIO_CARD_CLASS = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs5", () => initializeUiTabs5, (value) => {
    initializeUiTabs5 = value;
  }), bindRuntimeValue(runtime2, "reactForUiTabs5", () => reactForUiTabs5, (value) => {
    reactForUiTabs5 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTabs5", () => jsxForUiTabs5, (value) => {
    jsxForUiTabs5 = value;
  }), bindRuntimeValue(runtime2, "RESIZE_HANDLE_DRAG_TOLERANCE", () => RESIZE_HANDLE_DRAG_TOLERANCE, (value) => {
    RESIZE_HANDLE_DRAG_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "RESIZE_HANDLE_RELEASE_GRACE_MS", () => RESIZE_HANDLE_RELEASE_GRACE_MS, (value) => {
    RESIZE_HANDLE_RELEASE_GRACE_MS = value;
  }), bindRuntimeValue(runtime2, "RESIZE_PILL_CLASSES", () => RESIZE_PILL_CLASSES, (value) => {
    RESIZE_PILL_CLASSES = value;
  }), bindRuntimeValue(runtime2, "RESIZE_LINE_CLASSES", () => RESIZE_LINE_CLASSES, (value) => {
    RESIZE_LINE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "RESIZE_HANDLE_KEY_STEP", () => RESIZE_HANDLE_KEY_STEP, (value) => {
    RESIZE_HANDLE_KEY_STEP = value;
  }), bindRuntimeValue(runtime2, "RESIZE_HANDLE_SHIFT_KEY_STEP", () => RESIZE_HANDLE_SHIFT_KEY_STEP, (value) => {
    RESIZE_HANDLE_SHIFT_KEY_STEP = value;
  }), bindRuntimeValue(runtime2, "RESIZE_HANDLE_SIDE_CLASSES", () => RESIZE_HANDLE_SIDE_CLASSES, (value) => {
    RESIZE_HANDLE_SIDE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "ResizeHandle", () => ResizeHandle, (value) => {
    ResizeHandle = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs6", () => initializeUiTabs6, (value) => {
    initializeUiTabs6 = value;
  }), () => {
    initializeUiTabs = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeElementNamespaces)(), checkedTabFlexDocuments = /* @__PURE__ */ new WeakSet();
    }), initializeUiTabs2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeResizeObserverAccess)(), (0, runtime2.initializeElementNamespaces)(), (0, runtime2.initializeUiDisclosure9)(), initializeUiTabs(), (0, runtime2.initializeUiDialog2)(), (0, runtime2.initializeUiDialog3)(), reactForUiTabs = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTabs = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ButtonGroup.displayName = "ButtonGroup";
    }), initializeUiTabs3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeNpmDependency)(), reactForUiTabs2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTabs2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FORM_SIZE_GAP_CLASSES = {
        xs: "gap-sm",
        sm: "gap-sm",
        base: "gap-md",
        lg: "gap-lg"
      }, Form = reactForUiTabs2.forwardRef(({ className, submitOnModEnter = !0, disabled: disabled2, size: size4, method, onSubmit, onKeyDown, ...props }, options) => jsxForUiTabs2.jsx(runtime2.baseFieldsetRoot, {
        ref: options,
        "data-cds": "Form",
        "data-disabled": disabled2 ? "" : void 0,
        ...(0, runtime2.getControlSizeAttributes)(size4),
        method,
        ...props,
        className: (0, runtime2.cn)("flex flex-col", FORM_SIZE_GAP_CLASSES[size4 ?? "base"], className),
        onSubmit: (event) => {
          if (method || event.preventDefault(), disabled2) {
            event.preventDefault();
            return;
          }
          onSubmit?.(event);
        },
        onKeyDown: (event) => {
          onKeyDown?.(event), submitOnModEnter && !event.defaultPrevented && event.key === "Enter" && (event.metaKey || event.ctrlKey) && (0, runtime2.isDomNode)(event.target) && event.currentTarget.contains(event.target) && !event.nativeEvent.isComposing && (event.preventDefault(), disabled2 || event.currentTarget.requestSubmit());
        }
      })), Form.displayName = "Form";
    }), SWITCH_TRACK_CLASS = "cds-reset relative inline-flex shrink-0 rounded-full border-0 outline-none focus-visible:outline-hidden bg-[var(--cds-switch-track)] hover:bg-[var(--cds-switch-track-hover)] data-[checked]:bg-fill-accent data-[checked]:hover:bg-fill-accent-hover data-[disabled]:opacity-disabled data-[disabled]:hover:bg-[var(--cds-switch-track)] data-[checked]:data-[disabled]:hover:bg-fill-accent focus-visible:shadow-focus forced-colors:border forced-colors:border-solid forced-colors:border-[color:CanvasText] forced-colors:data-[checked]:border-[color:Highlight] forced-colors:data-[checked]:!bg-[color:Highlight]", SWITCH_THUMB_CLASS = "block rounded-full bg-[var(--cds-switch-knob)] shadow-sm transition-transform duration-snap ease-overshoot motion-reduce:transition-none forced-colors:bg-[color:CanvasText] forced-colors:data-[checked]:bg-[color:HighlightText]", SWITCH_TRACK_SIZE_CLASS = "h-[var(--cds-switch-h)] w-[calc(var(--cds-switch-h,1.25rem)*1.8)] p-[2px] forced-colors:p-px", SWITCH_THUMB_SIZE_CLASS = "size-[calc(var(--cds-switch-h,1.25rem)-4px)] data-[checked]:translate-x-[calc(var(--cds-switch-h,1.25rem)*0.8)] data-[checked]:[&:where(:root[dir=rtl]_:dir(rtl))]:-translate-x-[calc(var(--cds-switch-h,1.25rem)*0.8)]", initializeUiTabs4 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeUiDisclosure)(), (0, runtime2.initializeTooltip)(), (0, runtime2.initializeNpmDependency)(), reactForUiTabs3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTabs3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), Switch = reactForUiTabs3.forwardRef(({ className, size: size4, disabledReason, disabledReasonSide, onKeyDown, onMouseDown, ...props }, options) => {
        let value = jsxForUiTabs3.jsx(runtime2.baseSwitch.Root, {
          ref: options,
          "data-cds": "Switch",
          ...props,
          ...(0, runtime2.getControlSizeAttributes)(size4),
          onMouseDown: (0, runtime2.withRepeatedClickSelectionPrevention)(onMouseDown),
          onKeyDown: (input) => {
            preventRepeatedSwitchEnter(input), onKeyDown?.(input);
          },
          className: (0, runtime2.cn)(SWITCH_TRACK_CLASS, SWITCH_TRACK_SIZE_CLASS, className),
          children: jsxForUiTabs3.jsx(runtime2.baseSwitch.Thumb, {
            className: `${SWITCH_THUMB_CLASS} ${SWITCH_THUMB_SIZE_CLASS}`
          })
        });
        return disabledReason === void 0 ? value : jsxForUiTabs3.jsx(runtime2.DisabledReasonTooltip, {
          side: disabledReasonSide,
          reason: props.disabled ? disabledReason : void 0,
          children: value
        });
      }), Switch.displayName = "Switch";
    }), RADIO_MARK_CLASS = "flex shrink-0 size-[var(--cds-checkbox)] items-center justify-center rounded-full border border-strong bg-transparent group-hover/rd:border-stronger group-data-[checked]/rd:bg-fill-accent group-data-[checked]/rd:border-0 group-data-[checked]/rd:group-hover/rd:bg-fill-accent-hover group-data-[disabled]/rd:group-hover/rd:border-strong", RADIO_ITEM_CLASS = "cds-reset group/rd flex w-full items-start gap-md rounded-card border bg-surface-1 p-md text-start text-body font-normal text-primary outline-none focus-visible:outline-hidden hover:border-strong focus-visible:shadow-focus data-[checked]:border-accent data-[checked]:bg-[var(--cds-radio-group-card-selected)] data-[checked]:hover:border-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled", initializeUiTabs5 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeUiDisclosure)(), (0, runtime2.initializeUiMenu)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactForUiTabs4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTabs4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), RadioGroupItem = reactForUiTabs4.forwardRef(({ value, label, description, disabled: disabled2, className, tabIndex }, options) => {
        let value2 = (0, runtime2.useHasFieldContext)(), value3 = reactForUiTabs4.useId(), value4 = reactForUiTabs4.useId(), value5 = jsxForUiTabs4.jsxs(runtime2.baseRadio.Root, {
          ref: options,
          value,
          disabled: disabled2,
          ...tabIndex !== void 0 && {
            tabIndex
          },
          "aria-labelledby": value3,
          "aria-describedby": description ? value4 : void 0,
          onMouseDown: (0, runtime2.withRepeatedClickSelectionPrevention)(void 0),
          className: (0, runtime2.cn)("cds-reset group/rd inline-flex", description ? "items-start" : "items-center", "gap-2 border-0 outline-none focus-visible:outline-hidden text-start text-body font-normal text-primary data-[disabled]:opacity-disabled", className),
          children: [
            jsxForUiTabs4.jsx(RadioMark, {
              focusRing: !0,
              topAlign: !!description
            }),
            jsxForUiTabs4.jsxs("span", {
              className: "flex min-w-0 flex-col",
              children: [
                jsxForUiTabs4.jsx("span", {
                  id: value3,
                  children: label
                }),
                description && jsxForUiTabs4.jsx("span", {
                  id: value4,
                  className: runtime2.footnoteDescriptionClasses,
                  children: description
                })
              ]
            })
          ]
        });
        return value2 ? jsxForUiTabs4.jsx(runtime2.baseLabelableProvider, {
          children: value5
        }) : value5;
      }), RadioGroupItem.displayName = "RadioGroup.Item", RadioGroupCard = reactForUiTabs4.forwardRef(({ value, label, description, leading, trailing, children, disabled: disabled2, className }, options) => {
        let value2 = (0, runtime2.useHasFieldContext)(), value3 = reactForUiTabs4.useId(), value4 = reactForUiTabs4.useId(), value5 = jsxForUiTabs4.jsxs(runtime2.baseRadio.Root, {
          ref: options,
          value,
          disabled: disabled2,
          "aria-labelledby": value3,
          "aria-describedby": description ? value4 : void 0,
          onMouseDown: (0, runtime2.withRepeatedClickSelectionPrevention)(void 0),
          className: (0, runtime2.cn)(RADIO_ITEM_CLASS, className),
          children: [
            jsxForUiTabs4.jsx(RadioMark, {
              topAlign: !0
            }),
            leading ? jsxForUiTabs4.jsx("span", {
              className: "shrink-0",
              children: leading
            }) : null,
            jsxForUiTabs4.jsxs("span", {
              className: "flex min-w-0 flex-1 flex-col gap-xs",
              children: [
                jsxForUiTabs4.jsxs("span", {
                  className: "flex min-w-0 flex-col",
                  children: [
                    jsxForUiTabs4.jsxs("span", {
                      className: "flex items-start justify-between gap-sm",
                      children: [
                        jsxForUiTabs4.jsx("span", {
                          id: value3,
                          className: "min-w-0 font-medium",
                          children: label
                        }),
                        trailing ? jsxForUiTabs4.jsx("span", {
                          className: "shrink-0",
                          children: trailing
                        }) : null
                      ]
                    }),
                    description && jsxForUiTabs4.jsx("span", {
                      id: value4,
                      className: runtime2.footnoteDescriptionClasses,
                      children: description
                    })
                  ]
                }),
                children
              ]
            })
          ]
        });
        return value2 ? jsxForUiTabs4.jsx(runtime2.baseLabelableProvider, {
          children: value5
        }) : value5;
      }), RadioGroupCard.displayName = "RadioGroup.Card", RadioGroup3.displayName = "RadioGroup", RadioGroupRoot = reactForUiTabs4.forwardRef(({ className, size: size4, ...props }, options) => jsxForUiTabs4.jsx(runtime2.baseRadioGroup, {
        "data-cds": "RadioGroup",
        ref: options,
        ...props,
        ...(0, runtime2.getControlSizeAttributes)(size4),
        className: (0, runtime2.cn)("flex flex-col gap-2 font-sans", className)
      })), RadioGroupRoot.displayName = "RadioGroup.Root", RADIO_CARD_CLASS = Object.assign(RadioGroup3, {
        Root: RadioGroupRoot,
        Item: RadioGroupItem,
        Card: RadioGroupCard
      });
    }), RESIZE_HANDLE_DRAG_TOLERANCE = 3, RESIZE_HANDLE_RELEASE_GRACE_MS = 200, RESIZE_HANDLE_KEY_STEP = 8, RESIZE_HANDLE_SHIFT_KEY_STEP = 32, initializeUiTabs6 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTransitionRunner)(), (0, runtime2.initializeNpmDependency)(), reactForUiTabs5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTabs5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), RESIZE_HANDLE_SIDE_CLASSES = {
        "inline-start": "inset-y-0 start-[calc(-6px_-_(var(--cds-ring-outer,0px)_-_var(--cds-ring-inner,0px))_/_2)]",
        "inline-end": "inset-y-0 end-[calc(-6px_-_(var(--cds-ring-outer,0px)_-_var(--cds-ring-inner,0px))_/_2)]",
        top: "inset-x-0 top-[calc(-6px_-_(var(--cds-ring-outer,0px)_-_var(--cds-ring-inner,0px))_/_2)]",
        bottom: "inset-x-0 bottom-[calc(-6px_-_(var(--cds-ring-outer,0px)_-_var(--cds-ring-inner,0px))_/_2)]"
      }, RESIZE_PILL_CLASSES = {
        base: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current transition-[opacity,color,background-color]",
        vertical: "h-full max-h-12 w-[3px] group-focus-visible/resize:max-h-none",
        horizontal: "h-[3px] w-full max-w-12 group-focus-visible/resize:max-w-none",
        dragging: "text-secondary opacity-100 duration-snap",
        resting: "text-muted opacity-[var(--cds-resize-pill-force,0)] delay-200 duration-base group-hover/resize:opacity-100",
        focus: "group-focus-visible/resize:bg-fill-accent group-focus-visible/resize:opacity-100 group-focus-visible/resize:delay-0"
      }, RESIZE_LINE_CLASSES = {
        base: "absolute bg-fill-accent transition-opacity [--resize-line:2px]",
        vertical: "inset-y-0 start-[calc(50%_-_var(--resize-line)_/_2)] my-auto w-[var(--resize-line)]",
        horizontal: "inset-x-0 top-[calc(50%_-_var(--resize-line)_/_2)] mx-auto h-[var(--resize-line)]",
        dragging: "opacity-100 duration-snap",
        resting: "opacity-[var(--cds-resize-pill-force,0)] delay-100 duration-base group-hover/resize:opacity-100",
        focus: "group-focus-visible/resize:rounded-full group-focus-visible/resize:opacity-100 group-focus-visible/resize:delay-0 group-focus-visible/resize:[--resize-line:3px]"
      }, ResizeHandle = reactForUiTabs5.forwardRef(function({ orientation = "vertical", side: side2, onResize, onResizeStart, onResizeEnd, onMouseDown, onKeyDown, className, ...props }, options) {
        let value = side2 === void 0 ? orientation === "vertical" : side2 === "inline-start" || side2 === "inline-end", [value2, value3] = reactForUiTabs5.useState(!1), indicator = (0, runtime2.useFeatureFlagPart)("panels") ? RESIZE_LINE_CLASSES : RESIZE_PILL_CLASSES, ref = reactForUiTabs5.useRef(null), ref2 = reactForUiTabs5.useRef(onResize), ref3 = reactForUiTabs5.useRef(onResizeStart), ref4 = reactForUiTabs5.useRef(onResizeEnd);
        (0, runtime2.useIsomorphicLayoutEffect)(() => {
          ref2.current = onResize, ref3.current = onResizeStart, ref4.current = onResizeEnd;
        }, [onResize, onResizeStart, onResizeEnd]);
        let ref5 = reactForUiTabs5.useRef(0), ref6 = reactForUiTabs5.useRef(!1), ref7 = reactForUiTabs5.useRef(!0), callback = reactForUiTabs5.useCallback((moved = !1, finalDelta) => {
          ref7.current || (ref7.current = !0, value3(!1), finalDelta !== void 0 && ref2.current(finalDelta), ref4.current?.(moved || ref6.current));
        }, []);
        reactForUiTabs5.useEffect(() => {
          let current = ref.current;
          if (!value2 || current === null)
            return;
          let buttonUp = !1, lastDelta = 0, pendingDelta = null, releaseTimer, finish = (moved) => {
            let hasDelta = moved || releaseTimer !== void 0, delta = moved ? lastDelta : pendingDelta ?? lastDelta;
            releaseTimer?.cancel(), releaseTimer = void 0, lastDelta = 0, buttonUp = !1, callback(moved, hasDelta ? delta : void 0);
          }, trackButtons = (input) => {
            input.pointerType === "mouse" && (buttonUp = (input.buttons & 1) === 0);
          }, callback4 = (input) => {
            let value4 = (value ? input.clientX : input.clientY) - ref5.current;
            Math.abs(value4) > RESIZE_HANDLE_DRAG_TOLERANCE && (ref6.current = !0), buttonUp ? releaseTimer === void 0 ? (pendingDelta = value4, releaseTimer = (0, runtime2.scheduleElementTimeout)(current.body, () => finish(!0), RESIZE_HANDLE_RELEASE_GRACE_MS)) : pendingDelta = null : (releaseTimer?.cancel(), releaseTimer = void 0, lastDelta = value4, ref2.current(value4));
          }, release = () => finish(!1), pressAgain = (input) => {
            input.button === 0 && finish(!0);
          }, style = current.body.style;
          return style.cursor = value ? "col-resize" : "row-resize", style.userSelect = "none", current.addEventListener("pointermove", trackButtons), current.addEventListener("mousemove", callback4), current.addEventListener("mouseup", release), current.addEventListener("mousedown", pressAgain, !0), () => {
            releaseTimer?.cancel(), current.removeEventListener("pointermove", trackButtons), current.removeEventListener("mousemove", callback4), current.removeEventListener("mouseup", release), current.removeEventListener("mousedown", pressAgain, !0), style.cursor = "", style.userSelect = "";
          };
        }, [value2, value, callback]), reactForUiTabs5.useEffect(() => callback, [callback]);
        let callback2 = (event) => {
          event.button === 0 && (event.preventDefault(), ref5.current = value ? event.clientX : event.clientY, ref6.current = !1, ref7.current = !1, ref.current = event.currentTarget.ownerDocument, value3(!0), ref3.current?.()), onMouseDown?.(event);
        }, callback3 = (event) => {
          if (event.metaKey || event.ctrlKey || event.altKey || !ref7.current)
            return;
          if ((event.key === "Enter" || event.key === " ") && !event.shiftKey) {
            if (event.preventDefault(), event.repeat)
              return;
            ref3.current?.(), ref4.current?.(!1);
            return;
          }
          let value4 = event.shiftKey ? RESIZE_HANDLE_SHIFT_KEY_STEP : RESIZE_HANDLE_KEY_STEP, [value5, value6] = value ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"], value7 = event.key === value5 ? -value4 : event.key === value6 ? value4 : 0;
          value7 !== 0 && (event.preventDefault(), ref3.current?.(), ref2.current(value7), ref4.current?.(!0));
        };
        return jsxForUiTabs5.jsxs("div", {
          ...props,
          ref: options,
          "data-cds": "ResizeHandle",
          role: "separator",
          "aria-orientation": value ? "vertical" : "horizontal",
          tabIndex: 0,
          "data-dragging": value2 ? "" : void 0,
          onMouseDown: callback2,
          onKeyDown: (input) => {
            callback3(input), onKeyDown?.(input);
          },
          className: (0, runtime2.cn)("cds-reset group/resize outline-none focus-visible:outline-hidden", value ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize", side2 === void 0 ? ["relative", value ? "h-full" : "w-full"] : ["absolute", RESIZE_HANDLE_SIDE_CLASSES[side2]], className),
          children: [
            jsxForUiTabs5.jsx("div", {
              "aria-hidden": !0,
              className: (0, runtime2.clsx)("absolute rounded-full transition-shadow duration-fast group-focus-visible/resize:shadow-focus", value ? "inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize" : "inset-x-0 top-1/2 h-3 -translate-y-1/2 cursor-row-resize")
            }),
            jsxForUiTabs5.jsx("div", {
              "aria-hidden": !0,
              "data-cds-part": "resize-pill",
              className: (0, runtime2.clsx)(indicator.base, value ? indicator.vertical : indicator.horizontal, value2 ? indicator.dragging : indicator.resting, indicator.focus)
            })
          ]
        });
      });
    });
  };
}
export {
  installUiTabs
};
