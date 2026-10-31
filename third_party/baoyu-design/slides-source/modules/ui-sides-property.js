// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiSidesProperty(runtime2) {
  var reactSl, jsxW9, SIDE_INPUT_ORDER, ALL_SIDE_INDICES, SIDE_ICON_NAMES, CORNER_ICON_NAMES;
  function SidesPropertyRow({ label, kind = "side", values, placeholders, unit = "px", min: min2, max: max2, step, smallStep, mixed, disabled: disabled2, toggleDisabledReason, onSides, onScrubSides, onScrubEnd, onReset, title, description, icon, expandLabel, partLabels, "data-testid": dataTestid }) {
    let value = expandLabel ?? (kind === "corner" ? runtime2.PER_CORNER_LABEL : runtime2.PER_SIDE_LABEL), value2 = partLabels ?? (kind === "corner" ? runtime2.CORNER_LABELS_rc0 : runtime2.SIDE_LABELS), value3 = icon ?? (kind === "corner" ? runtime2.INDIVIDUAL_CORNERS_ICON : runtime2.BORDER_SIDES_ICON), value4 = values.map((input, options) => input !== void 0 ? String(input) : placeholders?.[options] ?? ""), value5 = values.some((input) => input !== void 0) && values.every((input) => input !== void 0 && input === values[0]), value6 = value4.every((input) => input === value4[0]), value7 = !mixed && !value6 && !value5, [value8, value9] = reactSl.useState(value7);
    value7 && !value8 && value9(!0);
    let value10 = mixed || !value5 ? void 0 : values[0], value11 = mixed || value7 ? void 0 : value4[0], callback = (input) => {
      if (mixed)
        return null;
      let value15 = input === void 0 || input.trim() === "" ? NaN : Number(input);
      if (Number.isFinite(value15))
        return value15;
    }, value12 = label.toLowerCase(), ref = reactSl.useRef([]), value13 = onScrubSides && ((input) => {
      ref.current = input, onScrubSides(input);
    }), callback2 = () => {
      let current = ref.current;
      ref.current = [], onScrubEnd?.(current);
    }, value14 = jsxW9.jsx(runtime2.DisabledReasonTooltip, {
      reason: toggleDisabledReason ?? (!disabled2 && value7 && value8 ? runtime2.UNIFIED_VALUES_DISABLED_REASON : void 0),
      wrapperClassName: "shrink-0",
      children: jsxW9.jsx(runtime2.Button, {
        variant: "ghost",
        iconOnly: !0,
        icon: jsxW9.jsx(runtime2.PropertyIcon, {
          icon: value3
        }),
        "aria-label": (value8 ? runtime2.HIDE_LABEL : runtime2.EDIT_LABEL) + " " + value12 + " " + value.toLowerCase(),
        pressed: value8,
        disabled: disabled2 || value7 && value8 || toggleDisabledReason !== void 0,
        "data-testid": dataTestid ? dataTestid + "-toggle" : void 0,
        onClick: () => value9((input) => !input),
        className: "shrink-0"
      })
    });
    return jsxW9.jsxs(jsxW9.Fragment, {
      children: [
        jsxW9.jsx(runtime2.PropertyRow, {
          label,
          title,
          description,
          onReset,
          disabled: disabled2,
          "data-testid": dataTestid,
          onPress: (element) => element.querySelector("input")?.focus(),
          trailing: value14,
          children: jsxW9.jsx(runtime2.PropertyNumberInput, {
            "aria-label": label,
            value: value10,
            placeholder: value11,
            hint: value7 ? value : void 0,
            unit,
            min: min2,
            max: max2,
            step,
            smallStep,
            mixed,
            clearable: !0,
            refuseLetters: !0,
            disabled: disabled2,
            emptyStepFrom: value7 ? null : callback(value4[0]),
            onValue: (input) => onSides(ALL_SIDE_INDICES.map((input2) => ({
              side: input2,
              value: input
            }))),
            onScrub: value13 && ((input) => value13(ALL_SIDE_INDICES.map((input2) => ({
              side: input2,
              value: input
            })))),
            onScrubEnd: callback2
          })
        }),
        value8 ? jsxW9.jsx(runtime2.PropertyRow, {
          label: "",
          title,
          disabled: disabled2,
          "data-testid": dataTestid ? dataTestid + "-parts" : void 0,
          children: jsxW9.jsx("div", {
            className: "grid min-w-0 flex-1 grid-cols-2 gap-2",
            children: SIDE_INPUT_ORDER[kind].map((input) => jsxW9.jsx(runtime2.PropertyNumberInput, {
              "aria-label": label + " " + value2[input].toLowerCase(),
              title: value2[input],
              prefix: jsxW9.jsx(SideOrCornerIcon, {
                kind,
                index: input
              }),
              value: mixed ? void 0 : values[input],
              placeholder: mixed ? void 0 : placeholders?.[input] ?? "",
              emptyStepFrom: callback(placeholders?.[input]),
              mixed,
              min: min2,
              max: max2,
              step,
              smallStep,
              clearable: !0,
              refuseLetters: !0,
              ownUnit: unit,
              steppers: !1,
              disabled: disabled2,
              onValue: (input2) => onSides([
                {
                  side: input,
                  value: input2
                }
              ]),
              onScrub: value13 && ((input2) => value13([
                {
                  side: input,
                  value: input2
                }
              ])),
              onScrubEnd: callback2
            }, input))
          })
        }) : null
      ]
    });
  }
  function CornersPropertyRow(input) {
    return jsxW9.jsx(SidesPropertyRow, {
      ...input,
      kind: "corner"
    });
  }
  function SideOrCornerIcon({ kind, index: index4 }) {
    return jsxW9.jsx(runtime2.KitIcon, {
      name: (kind === "corner" ? CORNER_ICON_NAMES : SIDE_ICON_NAMES)[index4],
      size: 16
    });
  }
  return bindRuntimeValue(runtime2, "reactSl", () => reactSl, (value) => {
    reactSl = value;
  }), bindRuntimeValue(runtime2, "jsxW9", () => jsxW9, (value) => {
    jsxW9 = value;
  }), bindRuntimeValue(runtime2, "SIDE_INPUT_ORDER", () => SIDE_INPUT_ORDER, (value) => {
    SIDE_INPUT_ORDER = value;
  }), bindRuntimeValue(runtime2, "ALL_SIDE_INDICES", () => ALL_SIDE_INDICES, (value) => {
    ALL_SIDE_INDICES = value;
  }), bindRuntimeValue(runtime2, "SidesPropertyRow", () => SidesPropertyRow), bindRuntimeValue(runtime2, "CornersPropertyRow", () => CornersPropertyRow), bindRuntimeValue(runtime2, "SIDE_ICON_NAMES", () => SIDE_ICON_NAMES, (value) => {
    SIDE_ICON_NAMES = value;
  }), bindRuntimeValue(runtime2, "CORNER_ICON_NAMES", () => CORNER_ICON_NAMES, (value) => {
    CORNER_ICON_NAMES = value;
  }), bindRuntimeValue(runtime2, "SideOrCornerIcon", () => SideOrCornerIcon), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiNumberControls2)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiPropertyLabels)(), reactSl = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxW9 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SIDE_INPUT_ORDER = {
      side: [0, 1, 2, 3],
      corner: [0, 1, 3, 2]
    }, ALL_SIDE_INDICES = [0, 1, 2, 3], SIDE_ICON_NAMES = ["SideTop", "SideRight", "SideBottom", "SideLeft"], CORNER_ICON_NAMES = [
      "CornerTopLeft",
      "CornerTopRight",
      "CornerBottomRight",
      "CornerBottomLeft"
    ];
  };
}
export {
  installUiSidesProperty
};
