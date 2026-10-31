// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiAvatarStack(runtime2) {
  var reactForUiAvatarStack, jsxForUiAvatarStack, AVATAR_STACK_SIZE_CLASSES, AVATAR_STACK_SURPLUS_SIZE_CLASSES, AVATAR_STACK_DEFAULT_MAX, AVATAR_STACK_ITEM_CLASS, AVATAR_STACK_SURPLUS_TUCK_CLASSES, AvatarStack, initializeUiAvatarStack;
  function avatarStackStyle(index4, isFirst) {
    return {
      marginInlineStart: isFirst ? void 0 : "calc(-1 * var(--cds-stack-overlap))",
      zIndex: index4
    };
  }
  function avatarAccessibleName(element) {
    if (!reactForUiAvatarStack.isValidElement(element))
      return;
    let value = element;
    if (typeof value.props.name == "string")
      return value.props.name;
    let children = value.props.children;
    if (reactForUiAvatarStack.isValidElement(children)) {
      let name = children.props.name;
      if (typeof name == "string")
        return name;
    }
  }
  return bindRuntimeValue(runtime2, "avatarStackStyle", () => avatarStackStyle), bindRuntimeValue(runtime2, "avatarAccessibleName", () => avatarAccessibleName), bindRuntimeValue(runtime2, "reactForUiAvatarStack", () => reactForUiAvatarStack, (value) => {
    reactForUiAvatarStack = value;
  }), bindRuntimeValue(runtime2, "jsxForUiAvatarStack", () => jsxForUiAvatarStack, (value) => {
    jsxForUiAvatarStack = value;
  }), bindRuntimeValue(runtime2, "AVATAR_STACK_SIZE_CLASSES", () => AVATAR_STACK_SIZE_CLASSES, (value) => {
    AVATAR_STACK_SIZE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "AVATAR_STACK_SURPLUS_SIZE_CLASSES", () => AVATAR_STACK_SURPLUS_SIZE_CLASSES, (value) => {
    AVATAR_STACK_SURPLUS_SIZE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "AVATAR_STACK_DEFAULT_MAX", () => AVATAR_STACK_DEFAULT_MAX, (value) => {
    AVATAR_STACK_DEFAULT_MAX = value;
  }), bindRuntimeValue(runtime2, "AVATAR_STACK_ITEM_CLASS", () => AVATAR_STACK_ITEM_CLASS, (value) => {
    AVATAR_STACK_ITEM_CLASS = value;
  }), bindRuntimeValue(runtime2, "AVATAR_STACK_SURPLUS_TUCK_CLASSES", () => AVATAR_STACK_SURPLUS_TUCK_CLASSES, (value) => {
    AVATAR_STACK_SURPLUS_TUCK_CLASSES = value;
  }), bindRuntimeValue(runtime2, "AvatarStack", () => AvatarStack, (value) => {
    AvatarStack = value;
  }), bindRuntimeValue(runtime2, "initializeUiAvatarStack", () => initializeUiAvatarStack, (value) => {
    initializeUiAvatarStack = value;
  }), () => {
    AVATAR_STACK_SURPLUS_TUCK_CLASSES = "ps-[calc(var(--cds-stack-chip-pad)_/_2_+_var(--cds-stack-overlap)_*_2_/_3_+_2px)] pe-[calc(var(--cds-stack-chip-pad)_/_2_+_var(--cds-stack-overlap)_/_3)]", AVATAR_STACK_DEFAULT_MAX = 4, AVATAR_STACK_ITEM_CLASS = "relative inline-flex rounded-full bg-[var(--cds-page-bg)] [box-shadow:0_0_0_2px_var(--cds-page-bg)]", initializeUiAvatarStack = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeUiAvatars2)(), (0, runtime2.initializeTooltip)(), reactForUiAvatarStack = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiAvatarStack = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), AVATAR_STACK_SIZE_CLASSES = {
        xs: "[--cds-stack-overlap:calc(var(--cds-avatar-xs)*0.25)] [--cds-stack-chip-pad:0.25rem]",
        sm: "[--cds-stack-overlap:calc(var(--cds-avatar-sm)*0.25)] [--cds-stack-chip-pad:0.375rem]",
        md: "[--cds-stack-overlap:calc(var(--cds-avatar-md)*0.25)] [--cds-stack-chip-pad:0.5rem]",
        lg: "[--cds-stack-overlap:calc(var(--cds-avatar-lg)*0.25)] [--cds-stack-chip-pad:0.75rem]"
      }, AVATAR_STACK_SURPLUS_SIZE_CLASSES = {
        xs: "h-[var(--cds-avatar-xs)] min-w-[var(--cds-avatar-xs)] text-[length:var(--cds-avatar-text-xs)]",
        sm: "h-[var(--cds-avatar-sm)] min-w-[var(--cds-avatar-sm)] text-[calc(0.5625rem*var(--cds-rem-scale,1))]",
        md: "h-[var(--cds-avatar-md)] min-w-[var(--cds-avatar-md)] text-footnote",
        lg: "h-[var(--cds-avatar-lg)] min-w-[var(--cds-avatar-lg)] text-body"
      }, AvatarStack = reactForUiAvatarStack.forwardRef(({ children, max: max2 = 5, total, size: size4 = "md", surplusTooltip = !0, noun, "aria-label": ariaLabel, className }, options) => {
        let value = reactForUiAvatarStack.Children.toArray(children), value2 = total ?? value.length, value3 = (0, runtime2.useTranslation)("avatarGroup", "{count} {noun}", {
          count: value2,
          noun: noun ?? ""
        }), value4 = ariaLabel ?? value3, value5 = Math.max(0, Math.min(max2, value.length)), value6 = value.slice(0, value5), value7 = value.slice(value5), value8 = Math.max(0, value2 - value5), value9 = value7.map(avatarAccessibleName).filter((items) => !!items && items.length > 0).slice(0, AVATAR_STACK_DEFAULT_MAX), value10 = value8 - value9.length, value11 = value9.length > 0 ? value9.join(", ") + (value10 > 0 ? `, and ${value10} other${value10 === 1 ? "" : "s"}` : "") : void 0, value12 = surplusTooltip ? value11 : void 0, value13 = (0, runtime2.useTranslation)("overflowCount", "and {count} more", {
          count: value8
        }) + (value11 ? `: ${value11}` : ""), memo4 = reactForUiAvatarStack.useMemo(() => ({
          size: size4
        }), [size4]), value14 = value6.length + (value8 > 0 ? 1 : 0);
        return jsxForUiAvatarStack.jsx("div", {
          ref: options,
          "data-cds": "AvatarStack",
          role: "group",
          "aria-label": value4,
          className: (0, runtime2.cn)("isolate inline-flex shrink-0 items-center", AVATAR_STACK_SIZE_CLASSES[size4], className),
          children: jsxForUiAvatarStack.jsx(runtime2.AvatarStackContext.Provider, {
            value: memo4,
            children: jsxForUiAvatarStack.jsxs(runtime2.TooltipProvider, {
              children: [
                value6.map((input, options2) => jsxForUiAvatarStack.jsx("span", {
                  "data-stack-item": !0,
                  className: AVATAR_STACK_ITEM_CLASS,
                  style: avatarStackStyle(value14 - 1 - options2, options2 === 0),
                  children: input
                }, reactForUiAvatarStack.isValidElement(input) ? input.key ?? options2 : options2)),
                value8 > 0 && jsxForUiAvatarStack.jsx(runtime2.Tooltip, {
                  content: value12,
                  children: jsxForUiAvatarStack.jsx("span", {
                    "data-stack-item": !0,
                    "data-surplus": !0,
                    className: AVATAR_STACK_ITEM_CLASS,
                    style: avatarStackStyle(0, value6.length === 0),
                    children: jsxForUiAvatarStack.jsx("span", {
                      role: "img",
                      "aria-label": value13,
                      className: `inline-flex shrink-0 select-none items-center justify-center rounded-full bg-fill-control px-[var(--cds-stack-chip-pad)] font-sans font-medium leading-none text-secondary ${AVATAR_STACK_SURPLUS_SIZE_CLASSES[size4]}${value6.length === 0 ? "" : ` ${AVATAR_STACK_SURPLUS_TUCK_CLASSES}`}`,
                      children: `+${value8}`
                    })
                  })
                })
              ]
            })
          })
        });
      }), AvatarStack.displayName = "AvatarStack";
    });
  };
}
export {
  installUiAvatarStack
};
