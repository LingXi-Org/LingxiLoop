// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyPopover2(runtime2) {
  var reactdC, jsxcC, PropertyPopoverTrigger;
  function PropertyPopoverPanel({ title, onClose, labelWidth = "3rem", children }) {
    return jsxcC.jsxs("div", {
      role: "dialog",
      "aria-label": typeof title == "string" ? title : void 0,
      className: "flex flex-col py-sm",
      style: {
        "--pp-label-w": labelWidth,
        "--pp-gutter-l": "var(--cds-pad-md)"
      },
      "data-kit": "effect-editor",
      children: [
        jsxcC.jsxs("div", {
          className: "flex items-center pr-xs pb-xs pl-md",
          children: [
            jsxcC.jsx("h3", {
              className: "min-w-0 flex-1 truncate text-body-semibold text-primary",
              children: title
            }),
            jsxcC.jsx(runtime2.Button, {
              variant: "ghost",
              size: "sm",
              iconOnly: !0,
              icon: "X",
              "aria-label": "关闭",
              tooltip: "关闭",
              onClick: onClose
            })
          ]
        }),
        children
      ]
    });
  }
  function ShadowPropertyEditor({ title, value, onChange, onLive, onLiveEnd, onClose, spread = !0, bounds = {}, disabled: disabled2, swatches, unifiedPopover, editsAreUndoSteps }) {
    let callback = (input) => onChange({
      ...value,
      ...input
    }), callback2 = (input) => onLive && onLiveEnd ? {
      onScrub: (input2) => onLive({
        ...value,
        [input]: input2
      }),
      onScrubEnd: onLiveEnd
    } : {};
    return jsxcC.jsxs(PropertyPopoverPanel, {
      title,
      onClose,
      children: [
        jsxcC.jsx(runtime2.PropertyRow, {
          label: "偏移",
          disabled: disabled2,
          onPress: (element) => element.querySelector("input")?.focus(),
          children: jsxcC.jsxs("div", {
            className: "flex min-w-0 flex-1 items-center gap-2",
            children: [
              jsxcC.jsx(runtime2.PropertyNumberInput, {
                "aria-label": "水平偏移",
                prefix: "X",
                steppers: !1,
                value: value.x,
                onValue: (input) => input !== void 0 && callback({
                  x: input
                }),
                disabled: disabled2,
                ...bounds.x,
                ...callback2("x")
              }),
              jsxcC.jsx(runtime2.PropertyNumberInput, {
                "aria-label": "垂直偏移",
                prefix: "Y",
                steppers: !1,
                value: value.y,
                onValue: (input) => input !== void 0 && callback({
                  y: input
                }),
                disabled: disabled2,
                ...bounds.y,
                ...callback2("y")
              })
            ]
          })
        }),
        jsxcC.jsx(runtime2.NumberPropertyRow, {
          label: "模糊",
          unit: "px",
          value: value.blur,
          onValue: (input) => input !== void 0 && callback({
            blur: input
          }),
          disabled: disabled2,
          min: 0,
          ...bounds.blur,
          ...callback2("blur")
        }),
        spread && jsxcC.jsx(runtime2.NumberPropertyRow, {
          label: "扩散",
          unit: "px",
          value: value.spread ?? 0,
          onValue: (input) => input !== void 0 && callback({
            spread: input
          }),
          disabled: disabled2,
          ...bounds.spread,
          ...callback2("spread")
        }),
        jsxcC.jsx(runtime2.ColorTextPropertyRow, {
          label: "颜色",
          value: value.color,
          disabled: disabled2,
          swatches,
          popoverTitle: unifiedPopover ? runtime2.COLOR_LABEL : void 0,
          editsAreUndoSteps,
          onChange: (input) => input !== void 0 && callback({
            color: input
          }),
          ...onLive && onLiveEnd ? {
            onLive: (input) => onLive({
              ...value,
              color: input
            }),
            onLiveEnd: () => onLiveEnd()
          } : {}
        })
      ]
    });
  }
  function PropertyPopover({ open: open4, onOpenChange, trigger, anchor, side: side2 = "left", focusOnOpen, className, editsAreUndoSteps, children }) {
    return jsxcC.jsx(runtime2.PropertyPopup, {
      open: open4,
      onOpen: () => onOpenChange(!0),
      onClose: () => onOpenChange(!1),
      trigger,
      side: side2,
      positionAnchor: anchor,
      focusOnOpen,
      padding: "none",
      className: (0, runtime2.joinClassNames)("w-[14.5rem] pointer-coarse:w-[17rem]", className),
      editsAreUndoSteps,
      children
    });
  }
  function RemovePropertyButton({ label, verb = "Remove", onClick, disabled: disabled2, disabledReason }) {
    let value = verb + " " + label.toLowerCase();
    return jsxcC.jsx(runtime2.Button, {
      variant: "ghost",
      iconOnly: !0,
      icon: "Minus",
      "data-kit": "row-remove",
      "aria-label": value,
      tooltip: value,
      disabled: disabled2,
      disabledReason,
      onClick,
      className: "shrink-0"
    });
  }
  return bindRuntimeValue(runtime2, "reactdC", () => reactdC, (value) => {
    reactdC = value;
  }), bindRuntimeValue(runtime2, "jsxcC", () => jsxcC, (value) => {
    jsxcC = value;
  }), bindRuntimeValue(runtime2, "PropertyPopoverPanel", () => PropertyPopoverPanel), bindRuntimeValue(runtime2, "ShadowPropertyEditor", () => ShadowPropertyEditor), bindRuntimeValue(runtime2, "PropertyPopover", () => PropertyPopover), bindRuntimeValue(runtime2, "PropertyPopoverTrigger", () => PropertyPopoverTrigger, (value) => {
    PropertyPopoverTrigger = value;
  }), bindRuntimeValue(runtime2, "RemovePropertyButton", () => RemovePropertyButton), () => {
    (0, runtime2.initializeTooltipWrapper)(), (0, runtime2.initializeSelect)(), (0, runtime2.initializeUiPropertyRow2)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiNumberControls2)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiColorPicker)(), reactdC = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiPropertyLabels)(), jsxcC = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PropertyPopoverTrigger = reactdC.forwardRef(function({ label, color, text, open: open4, onClick, disabled: disabled2, ...props }, options) {
      let memo4 = reactdC.useMemo(() => typeof color == "string" ? (0, runtime2.parseCssColorToHsva)(color) : void 0, [color]);
      return jsxcC.jsx(runtime2.FieldButton, {
        ...open4 !== void 0 ? {
          "aria-haspopup": "dialog",
          "aria-expanded": open4
        } : void 0,
        ...props,
        ref: options,
        "aria-label": label + ": " + text,
        disabled: disabled2,
        onClick,
        chip: color !== void 0 ? jsxcC.jsx(runtime2.ColorChip, {
          hex: memo4 ? (0, runtime2.hsvaToHexColor)(memo4) : null,
          alpha: (memo4?.a ?? 1) * 100
        }) : void 0,
        caption: memo4 !== void 0 ? Math.round(memo4.a * 100) + "%" : void 0,
        children: text
      });
    });
  };
}
export {
  installUiPropertyPopover2
};
