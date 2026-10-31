// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiSegmentedProperty(runtime2) {
  var jsxz30, jsxoG, COMPACT_SEGMENTED_CLASS, TIGHT_SEGMENTED_CLASS, VERTICAL_GLYPH_STYLE;
  function SegmentedPropertyControl({ label, options, value, inherited, inheritedHint = runtime2.INHERITED_LABEL, onChange, disabled: disabled2, mixed, vertical, compact, dir, "data-testid": dataTestid }) {
    let value2 = value === void 0 && !mixed && inherited !== void 0, value3 = options.every((input) => input.glyph !== void 0 || input.icon !== void 0), value4 = mixed ? "" : value ?? inherited ?? "", callback = (input) => (input.tooltip ?? input.label) + (value2 && input.value === inherited ? " (" + inheritedHint + ")" : "");
    return jsxoG.jsx("span", {
      dir,
      className: (0, runtime2.joinClassNames)("block min-w-0 flex-1", compact ? TIGHT_SEGMENTED_CLASS : value3 && COMPACT_SEGMENTED_CLASS),
      "data-testid": dataTestid,
      "data-inherited": value2 ? "" : void 0,
      onClickCapture: value2 && !disabled2 ? (event) => {
        let ancestor = event.target.closest('[role="radio"]');
        ancestor !== null && ancestor.hasAttribute("data-checked") && !ancestor.hasAttribute("data-disabled") && onChange(inherited);
      } : void 0,
      children: jsxoG.jsx(runtime2.SegmentedControl, {
        "aria-label": label,
        fullWidth: !0,
        segments: options.map((input) => input.icon !== void 0 ? {
          value: input.value,
          icon: input.icon,
          tooltip: callback(input),
          disabled: disabled2 || input.whyDisabled !== void 0,
          disabledReason: input.whyDisabled
        } : {
          value: input.value,
          label: input.glyph !== void 0 ? jsxoG.jsx("span", {
            role: "img",
            "aria-label": input.label,
            className: "inline-flex",
            style: vertical ? VERTICAL_GLYPH_STYLE : void 0,
            children: jsxoG.jsx(runtime2.PropertyIcon, {
              icon: input.glyph
            })
          }) : input.label,
          tooltip: callback(input),
          disabled: disabled2 || input.whyDisabled !== void 0,
          disabledReason: input.whyDisabled
        }),
        value: value4,
        onChange: (input) => {
          disabled2 || options.find((input2) => input2.value === input)?.whyDisabled !== void 0 || (mixed || input !== value) && onChange(input);
        }
      })
    });
  }
  function SegmentedPropertyRow(input) {
    let { label, onReset, title, description, trailing, options, disabled: disabled2, "data-testid": value, ...remainingProps } = input, value2 = jsxoG.jsx(SegmentedPropertyControl, {
      ...remainingProps,
      label,
      options,
      disabled: disabled2,
      "data-testid": value ? value + "-segments" : void 0
    });
    return options.length > 4 ? jsxoG.jsxs("div", {
      className: "contents",
      "data-testid": value,
      children: [
        jsxoG.jsx(runtime2.PropertyRow, {
          label,
          title,
          onReset,
          disabled: disabled2,
          className: "min-h-0 pt-1"
        }),
        jsxoG.jsx(runtime2.PropertyRow, {
          title,
          description,
          trailing,
          disabled: disabled2,
          children: value2
        })
      ]
    }) : jsxoG.jsx(runtime2.PropertyRow, {
      label,
      title,
      description,
      onReset,
      trailing,
      disabled: disabled2,
      "data-testid": value,
      children: value2
    });
  }
  return bindRuntimeValue(runtime2, "jsxz30", () => jsxz30, (value) => {
    jsxz30 = value;
  }), bindRuntimeValue(runtime2, "jsxoG", () => jsxoG, (value) => {
    jsxoG = value;
  }), bindRuntimeValue(runtime2, "COMPACT_SEGMENTED_CLASS", () => COMPACT_SEGMENTED_CLASS, (value) => {
    COMPACT_SEGMENTED_CLASS = value;
  }), bindRuntimeValue(runtime2, "TIGHT_SEGMENTED_CLASS", () => TIGHT_SEGMENTED_CLASS, (value) => {
    TIGHT_SEGMENTED_CLASS = value;
  }), bindRuntimeValue(runtime2, "VERTICAL_GLYPH_STYLE", () => VERTICAL_GLYPH_STYLE, (value) => {
    VERTICAL_GLYPH_STYLE = value;
  }), bindRuntimeValue(runtime2, "SegmentedPropertyControl", () => SegmentedPropertyControl), bindRuntimeValue(runtime2, "SegmentedPropertyRow", () => SegmentedPropertyRow), () => {
    jsxz30 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiPropertyLabels)(), jsxoG = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), COMPACT_SEGMENTED_CLASS = "[&_[role=radio]]:px-0 [&_[role=radio]]:min-w-[calc(var(--cds-h-control)_-_2px)]", TIGHT_SEGMENTED_CLASS = "[&_[data-cds=SegmentedControl]]:gap-0 [&_[data-cds=SegmentedControl]]:p-0 [&_[role=radio]]:px-0 [&_[role=radio]]:min-w-[var(--cds-h-control)]", VERTICAL_GLYPH_STYLE = {
      transform: "matrix(0, 1, 1, 0, 0, 0)"
    };
  };
}
export {
  installUiSegmentedProperty
};
