// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiInputs2(runtime2) {
  var reactForUiInputs22, jsxForUiInputs22, badgeVariantClasses, BADGE_VARIANT_CLASSES, BADGE_SIZE_CLASSES, BADGE_ICON_CLASSES, BADGE_ICON_SIZE_CLASSES, BADGE_TEXT_CLASS, BADGE_LABEL_CLASSES, BADGE_STACKS_BOLD_FILL_CLASSES, BADGE_STACKS_BORDER_CLASSES, BADGE_STACKS_TEXT_CLASSES, BADGE_STACKS_CLASS, BADGE_STACKS_TRANSPARENT_CLASS, BADGE_STACKS_BOLD_CLASS, BADGE_STACKS_ICON_ONLY_CLASS, BADGE_STACKS_ICON_NUDGE_CLASS, badgeDevWarning, reactForBadgeDevWarning, initializeBadgeDevWarning, Badge, initializeUiInputs22, FieldComponents, initializeUiInputs29, initializeUiInputs210;
  function isBadgeVariant(input) {
    return Object.hasOwn(badgeVariantClasses, input);
  }
  return bindRuntimeValue(runtime2, "isBadgeVariant", () => isBadgeVariant), bindRuntimeValue(runtime2, "BADGE_STACKS_BOLD_FILL_CLASSES", () => BADGE_STACKS_BOLD_FILL_CLASSES, (value) => {
    BADGE_STACKS_BOLD_FILL_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_BORDER_CLASSES", () => BADGE_STACKS_BORDER_CLASSES, (value) => {
    BADGE_STACKS_BORDER_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_TEXT_CLASSES", () => BADGE_STACKS_TEXT_CLASSES, (value) => {
    BADGE_STACKS_TEXT_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_CLASS", () => BADGE_STACKS_CLASS, (value) => {
    BADGE_STACKS_CLASS = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_TRANSPARENT_CLASS", () => BADGE_STACKS_TRANSPARENT_CLASS, (value) => {
    BADGE_STACKS_TRANSPARENT_CLASS = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_BOLD_CLASS", () => BADGE_STACKS_BOLD_CLASS, (value) => {
    BADGE_STACKS_BOLD_CLASS = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_ICON_ONLY_CLASS", () => BADGE_STACKS_ICON_ONLY_CLASS, (value) => {
    BADGE_STACKS_ICON_ONLY_CLASS = value;
  }), bindRuntimeValue(runtime2, "BADGE_STACKS_ICON_NUDGE_CLASS", () => BADGE_STACKS_ICON_NUDGE_CLASS, (value) => {
    BADGE_STACKS_ICON_NUDGE_CLASS = value;
  }), bindRuntimeValue(runtime2, "badgeDevWarning", () => badgeDevWarning, (value) => {
    badgeDevWarning = value;
  }), bindRuntimeValue(runtime2, "reactForBadgeDevWarning", () => reactForBadgeDevWarning, (value) => {
    reactForBadgeDevWarning = value;
  }), bindRuntimeValue(runtime2, "initializeBadgeDevWarning", () => initializeBadgeDevWarning, (value) => {
    initializeBadgeDevWarning = value;
  }), bindRuntimeValue(runtime2, "reactForUiInputs22", () => reactForUiInputs22, (value) => {
    reactForUiInputs22 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiInputs22", () => jsxForUiInputs22, (value) => {
    jsxForUiInputs22 = value;
  }), bindRuntimeValue(runtime2, "badgeVariantClasses", () => badgeVariantClasses, (value) => {
    badgeVariantClasses = value;
  }), bindRuntimeValue(runtime2, "BADGE_VARIANT_CLASSES", () => BADGE_VARIANT_CLASSES, (value) => {
    BADGE_VARIANT_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_SIZE_CLASSES", () => BADGE_SIZE_CLASSES, (value) => {
    BADGE_SIZE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_ICON_CLASSES", () => BADGE_ICON_CLASSES, (value) => {
    BADGE_ICON_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_ICON_SIZE_CLASSES", () => BADGE_ICON_SIZE_CLASSES, (value) => {
    BADGE_ICON_SIZE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "BADGE_TEXT_CLASS", () => BADGE_TEXT_CLASS, (value) => {
    BADGE_TEXT_CLASS = value;
  }), bindRuntimeValue(runtime2, "BADGE_LABEL_CLASSES", () => BADGE_LABEL_CLASSES, (value) => {
    BADGE_LABEL_CLASSES = value;
  }), bindRuntimeValue(runtime2, "Badge", () => Badge, (value) => {
    Badge = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs22", () => initializeUiInputs22, (value) => {
    initializeUiInputs22 = value;
  }), bindRuntimeValue(runtime2, "FieldComponents", () => FieldComponents, (value) => {
    FieldComponents = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs29", () => initializeUiInputs29, (value) => {
    initializeUiInputs29 = value;
  }), bindRuntimeValue(runtime2, "initializeUiInputs210", () => initializeUiInputs210, (value) => {
    initializeUiInputs210 = value;
  }), () => {
    BADGE_TEXT_CLASS = "leading-[calc(0.75rem*var(--cds-rem-scale,1))] py-[0.125em] -my-[0.125em]", badgeDevWarning = () => {
    }, initializeBadgeDevWarning = (0, runtime2.initializeOnce)(() => {
      reactForBadgeDevWarning = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)());
    }), BADGE_STACKS_CLASS = "stacks:rounded-[calc(var(--cds-h-control-nested)/2)] stacks:border-[1.5px] stacks:border-solid stacks:px-[calc(var(--cds-pad-sm)-1px)]", BADGE_STACKS_TRANSPARENT_CLASS = "stacks:bg-transparent", BADGE_STACKS_BOLD_CLASS = "stacks:border-transparent stacks:text-gray-0/90", BADGE_STACKS_ICON_ONLY_CLASS = "stacks:bg-transparent stacks:dark:bg-transparent", BADGE_STACKS_ICON_NUDGE_CLASS = "stacks:ms-[-1px] stacks:[&:where(:root[dir=rtl]_:dir(rtl))]:ms-[-1px]", initializeUiInputs22 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFeatureFlags)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeIcons)(), initializeBadgeDevWarning(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactForUiInputs22 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiInputs22 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), badgeVariantClasses = {
        neutral: "bg-neutral text-secondary",
        accent: "bg-tint-blue text-accent",
        success: "bg-tint-green text-tint-green",
        warning: "bg-tint-yellow text-warning",
        danger: "bg-tint-red text-danger",
        pro: "bg-tint-violet text-pro"
      }, BADGE_VARIANT_CLASSES = {
        neutral: "bg-gray-700 dark:bg-gray-550 text-gray-0",
        accent: "bg-blue-500 text-gray-0",
        success: "bg-green-500 text-gray-0",
        warning: "bg-yellow-500 text-gray-0",
        danger: "bg-red-450 text-gray-0",
        pro: "bg-violet-450 text-gray-0"
      }, BADGE_SIZE_CLASSES = {
        red: "bg-red-450 text-gray-0",
        orange: "bg-orange-450 text-gray-0",
        yellow: "bg-yellow-500 text-gray-0",
        green: "bg-green-500 text-gray-0",
        aqua: "bg-aqua-500 text-gray-0",
        blue: "bg-blue-500 text-gray-0",
        violet: "bg-violet-450 text-gray-0",
        magenta: "bg-magenta-450 text-gray-0"
      }, BADGE_ICON_CLASSES = {
        red: "bg-tint-red text-tint-red",
        orange: "bg-tint-orange text-tint-orange",
        yellow: "bg-tint-yellow text-tint-yellow",
        green: "bg-tint-green text-tint-green",
        aqua: "bg-tint-aqua text-tint-aqua",
        blue: "bg-tint-blue text-tint-blue",
        violet: "bg-tint-violet text-tint-violet",
        magenta: "bg-tint-magenta text-tint-magenta"
      }, BADGE_STACKS_BOLD_FILL_CLASSES = {
        accent: "stacks:bg-fill-tint-blue",
        success: "stacks:bg-fill-tint-green",
        warning: "stacks:bg-fill-tint-yellow",
        danger: "stacks:bg-fill-tint-red",
        pro: "stacks:bg-fill-tint-violet",
        red: "stacks:bg-fill-tint-red",
        orange: "stacks:bg-fill-tint-orange",
        yellow: "stacks:bg-fill-tint-yellow",
        green: "stacks:bg-fill-tint-green",
        aqua: "stacks:bg-fill-tint-aqua",
        blue: "stacks:bg-fill-tint-blue",
        violet: "stacks:bg-fill-tint-violet",
        magenta: "stacks:bg-fill-tint-magenta"
      }, BADGE_STACKS_BORDER_CLASSES = {
        neutral: "stacks:border-[color:var(--cds-border-line,var(--cds-border))] stacks:dark:border-strong",
        accent: "stacks:border-accent stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-blue)_40%,transparent)]",
        success: "stacks:border-success stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-green)_40%,transparent)]",
        warning: "stacks:border-warning stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-yellow)_30%,transparent)]",
        danger: "stacks:border-danger stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-red)_40%,transparent)]",
        pro: "stacks:border-pro stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-violet)_40%,transparent)]",
        red: "stacks:border-danger stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-red)_40%,transparent)]",
        orange: "stacks:border-[color-mix(in_srgb,var(--cds-fill-tint-orange)_22.2%,transparent)] stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-orange)_40%,transparent)]",
        yellow: "stacks:border-warning stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-yellow)_30%,transparent)]",
        green: "stacks:border-success stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-green)_40%,transparent)]",
        aqua: "stacks:border-[color-mix(in_srgb,var(--cds-fill-tint-aqua)_22.2%,transparent)] stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-aqua)_40%,transparent)]",
        blue: "stacks:border-accent stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-blue)_40%,transparent)]",
        violet: "stacks:border-pro stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-violet)_40%,transparent)]",
        magenta: "stacks:border-[color-mix(in_srgb,var(--cds-fill-tint-magenta)_22.2%,transparent)] stacks:dark:border-[color-mix(in_srgb,var(--cds-fill-tint-magenta)_40%,transparent)]"
      }, BADGE_STACKS_TEXT_CLASSES = {
        neutral: "stacks:text-secondary",
        accent: "stacks:text-accent",
        success: "stacks:text-tint-green",
        warning: "stacks:text-warning",
        danger: "stacks:text-danger",
        pro: "stacks:text-pro",
        red: "stacks:text-tint-red",
        orange: "stacks:text-tint-orange",
        yellow: "stacks:text-tint-yellow",
        green: "stacks:text-tint-green",
        aqua: "stacks:text-tint-aqua",
        blue: "stacks:text-tint-blue",
        violet: "stacks:text-tint-violet",
        magenta: "stacks:text-tint-magenta"
      }, BADGE_ICON_SIZE_CLASSES = {
        xs: "ml-[calc((var(--cds-h-control-nested)-calc(0.75rem*var(--cds-rem-scale,1)))/2-var(--cds-pad-sm)+1px)] mr-[-0.8px] [&:where(:root[dir=rtl]_:dir(rtl))]:ms-[calc((var(--cds-h-control-nested)-calc(0.75rem*var(--cds-rem-scale,1)))/2-var(--cds-pad-sm)+1px)] [&:where(:root[dir=rtl]_:dir(rtl))]:me-[-0.8px] shrink-0",
        sm: "ml-[calc((var(--cds-h-control-nested)-calc(1rem*var(--cds-rem-scale,1)))/2-var(--cds-pad-sm)+1px)] mr-[-0.8px] [&:where(:root[dir=rtl]_:dir(rtl))]:ms-[calc((var(--cds-h-control-nested)-calc(1rem*var(--cds-rem-scale,1)))/2-var(--cds-pad-sm)+1px)] [&:where(:root[dir=rtl]_:dir(rtl))]:me-[-0.8px] shrink-0",
        md: "ml-[calc((var(--cds-h-control-nested)-calc(1.25rem*var(--cds-rem-scale,1)))/2-var(--cds-pad-sm)+1px)] mr-[-0.8px] [&:where(:root[dir=rtl]_:dir(rtl))]:ms-[calc((var(--cds-h-control-nested)-calc(1.25rem*var(--cds-rem-scale,1)))/2-var(--cds-pad-sm)+1px)] [&:where(:root[dir=rtl]_:dir(rtl))]:me-[-0.8px] shrink-0"
      }, BADGE_LABEL_CLASSES = {
        comfortable: {
          lg: "md",
          base: "sm",
          sm: "sm",
          xs: "xs",
          xxs: "xs"
        },
        compact: {
          lg: "sm",
          base: "xs",
          sm: "xs",
          xs: "xs",
          xxs: "xs"
        }
      }, Badge = reactForUiInputs22.forwardRef(({ variant, icon, iconOnly = !1, onRemove, removeLabel, removeRender, bold, size: size4, truncate, labelDir, className, children, ...props }, options) => {
        let value = variant ?? "accent", value2 = (0, runtime2.useTranslation)("removeItem", "移除 {item}", {
          item: typeof children == "string" ? children : "item"
        }), value3 = (0, runtime2.useDensity)(), surface = (0, runtime2.useSurfaceBackground)(), fizzyColor = (0, runtime2.useFizzyColorPart)(), value4 = BADGE_LABEL_CLASSES[value3][size4 ?? "base"], length = reactForUiInputs22.Children.toArray(children).length;
        badgeDevWarning(labelDir !== void 0 && !truncate && length !== 1, 'cds: <Badge labelDir="auto"> applies only to a single child, or with `truncate`; this badge has several children, so labelDir is ignored. Pass the label as one string, such as a template literal.');
        let removable = onRemove !== void 0 || removeRender !== void 0, spaced = !iconOnly && (length > 0 || removable), classic = removable || !!surface && (0, runtime2.isTintedFillSurface)(surface), value5 = spaced ? (0, runtime2.cn)(BADGE_ICON_SIZE_CLASSES[value4], !classic && BADGE_STACKS_ICON_NUDGE_CLASS) : "shrink-0", value6 = (size4 === "xxs" ? 1 : (0, runtime2.getDensitySizeIndex)(value3, size4)) === 1 ? BADGE_TEXT_CLASS : "pb-[0.05em]", value7 = removeLabel || value2, value8 = (0, runtime2.clsx)("cds-reset relative inline-flex shrink-0 items-center justify-center", "before:absolute before:left-[-2px] [&:where(:root[dir=rtl]_:dir(rtl))]:before:start-[-2px] [&:where(:root[dir=rtl]_:dir(rtl))]:before:end-auto before:top-1/2 before:-translate-y-1/2 before:content-['']", "before:h-[max(24px,100%)] before:w-[max(24px,calc(100%+2px))]", "size-[max(calc(var(--cds-h-control-nested)-calc(0.375rem*var(--cds-rem-scale,1))),calc(0.75rem*var(--cds-rem-scale,1)))]", "rounded-[calc(var(--cds-h-control-nested)/4-min(calc(0.1875rem*var(--cds-rem-scale,1)),(var(--cds-h-control-nested)-calc(0.75rem*var(--cds-rem-scale,1)))/2))]", "-ml-0.5 mr-[calc(min(calc(0.1875rem*var(--cds-rem-scale,1)),(var(--cds-h-control-nested)-calc(0.75rem*var(--cds-rem-scale,1)))/2)-var(--cds-pad-sm))] [&:where(:root[dir=rtl]_:dir(rtl))]:-ms-0.5 [&:where(:root[dir=rtl]_:dir(rtl))]:me-[calc(min(calc(0.1875rem*var(--cds-rem-scale,1)),(var(--cds-h-control-nested)-calc(0.75rem*var(--cds-rem-scale,1)))/2)-var(--cds-pad-sm))]", "text-current outline-none focus-visible:outline-hidden", "[--cds-badge-x-wght:577.8] hover:[--cds-badge-x-wght:700]", "transition-[color,background-color,box-shadow,--cds-badge-x-wght]", bold === !0 ? "hover:bg-[color-mix(in_srgb,currentColor_20%,transparent)]" : "hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)]", "focus-visible:shadow-focus"), { className: value9, ...value10 } = Object.fromEntries(Object.entries(removeRender?.props ?? {}).filter(([, input]) => input !== void 0)), value11 = jsxForUiInputs22.jsx(runtime2.Icon, {
          name: "X",
          size: "xs",
          style: {
            fontVariationSettings: "'opsz' 12, 'wght' var(--cds-badge-x-wght, 577.8)"
          }
        }), value12 = removeRender !== void 0 ? reactForUiInputs22.cloneElement(removeRender, (0, runtime2.baseMergeProps)({
          className: (0, runtime2.cn)(value8, value9),
          "aria-label": value7,
          children: value11
        }, value10)) : onRemove !== void 0 && jsxForUiInputs22.jsx("button", {
          type: "button",
          "aria-label": value7,
          onClick: (input) => {
            input.stopPropagation(), onRemove();
          },
          onKeyDown: (input) => {
            (input.key === "Enter" || input.key === " ") && input.stopPropagation();
          },
          onKeyUp: (input) => {
            (input.key === "Enter" || input.key === " ") && input.stopPropagation();
          },
          className: value8,
          children: value11
        }), value13 = isBadgeVariant(value), value14 = bold === !0 ? value13 ? BADGE_VARIANT_CLASSES[value] : BADGE_SIZE_CLASSES[value] : value13 ? badgeVariantClasses[value] : BADGE_ICON_CLASSES[value], boldFill = bold === !0 ? BADGE_STACKS_BOLD_FILL_CLASSES[value] : void 0, stacks = classic ? void 0 : iconOnly ? (0, runtime2.cn)(BADGE_STACKS_ICON_ONLY_CLASS, bold === !0 && BADGE_STACKS_TEXT_CLASSES[value]) : (0, runtime2.cn)(BADGE_STACKS_CLASS, bold === !0 ? BADGE_STACKS_BOLD_CLASS : [
          BADGE_STACKS_TRANSPARENT_CLASS,
          BADGE_STACKS_BORDER_CLASSES[value]
        ]), filledIcon = typeof icon == "string" ? `${icon}实心` : "", shownIcon = fizzyColor && !classic && iconOnly && bold === !0 && (0, runtime2.isIconName)(filledIcon) && (0, runtime2.isKnownIconName)(filledIcon) ? filledIcon : icon;
        return jsxForUiInputs22.jsxs("span", {
          ref: options,
          "data-cds": "Badge",
          role: iconOnly ? "img" : void 0,
          ...size4 === "xxs" ? {
            "data-step": "1"
          } : (0, runtime2.getControlSizeAttributes)(size4),
          ...props,
          className: (0, runtime2.cn)("inline-flex items-center gap-1 align-middle h-control-nested whitespace-nowrap rounded-chip", iconOnly ? "aspect-square w-control-nested justify-center px-0" : "px-sm", "font-sans text-caption", classic ? "font-medium" : "font-medium font-badge", "leading-[round(1.25em,1px)]", truncate ? "min-w-0" : "shrink-0", value14, boldFill, stacks, className),
          children: [
            typeof shownIcon != "number" && shownIcon && ((0, runtime2.isIconName)(shownIcon) ? jsxForUiInputs22.jsx(runtime2.Icon, {
              name: shownIcon,
              size: value4,
              className: value5
            }) : jsxForUiInputs22.jsx("span", {
              "aria-hidden": !0,
              className: (0, runtime2.cn)("inline-flex", value5),
              children: shownIcon
            })),
            truncate ? jsxForUiInputs22.jsx("span", {
              className: (0, runtime2.cn)(value6, "min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap"),
              dir: labelDir,
              children
            }) : length === 1 ? jsxForUiInputs22.jsx("span", {
              className: value6,
              dir: labelDir,
              children
            }) : children,
            value12
          ]
        });
      }), Badge.displayName = "Badge";
    }), FieldComponents = {}, (0, runtime2.defineLiveExports)(FieldComponents, {
      Validity: () => runtime2.FieldRow,
      Root: () => runtime2.FieldRoot,
      Label: () => runtime2.FieldLabel,
      Error: () => runtime2.FieldError,
      Description: () => runtime2.FieldDescription,
      Control: () => runtime2.FieldRootWithLabel
    }), initializeUiInputs29 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiToast2)();
    }), initializeUiInputs210 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeUiEditorTokens)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeUiEditorSelection2)(), (0, runtime2.initializeUiAvatars3)(), (0, runtime2.initializeShortcuts)(), (0, runtime2.initializeTooltip)(), (0, runtime2.initializeUiAvatarStack)(), (0, runtime2.initializeUiDisclosure4)(), (0, runtime2.initializeUiDisclosure5)(), (0, runtime2.initializeUiDisclosure9)(), (0, runtime2.initializeUiDisclosure10)(), (0, runtime2.initializeUiDisclosure11)(), (0, runtime2.initializeUiMenu2)(), (0, runtime2.initializeMenuItemVariants)(), (0, runtime2.initializeUiMenu9)(), (0, runtime2.initializeUiMenu11)(), (0, runtime2.initializeUiMenu12)(), (0, runtime2.initializeUiInputs3)(), (0, runtime2.initializeUiInputs6)(), (0, runtime2.initializeUiInputs9)(), (0, runtime2.initializeUiDialog)(), (0, runtime2.initializePulse)(), (0, runtime2.initializeUiTabs2)(), (0, runtime2.initializeUiTabs3)(), (0, runtime2.initializeUiTabs4)(), (0, runtime2.initializeUiTabs5)(), (0, runtime2.initializeUiTabs6)(), (0, runtime2.initializeUiTable)(), (0, runtime2.initializeUiTable2)(), (0, runtime2.initializeUiTable3)(), (0, runtime2.initializeUiTable4)(), (0, runtime2.initializeUiTable5)(), (0, runtime2.initializeUiTable7)(), (0, runtime2.initializeUiTabs23)(), (0, runtime2.initializeUiToast)(), initializeUiInputs29();
    });
  };
}
export {
  installUiInputs2
};
