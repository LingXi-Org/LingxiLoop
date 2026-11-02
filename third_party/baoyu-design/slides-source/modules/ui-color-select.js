// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiColorSelect(runtime2) {
  var ColorSelectReact, ColorSelectJsx, symbolicColorPattern, unsafeColorPattern, swatchLabel, isEmptySwatch, swatchLabelIsColor, swatchPaletteColumns, emptySwatchValue, initializeColorSelect;
  function swatchPreviewStyle(input) {
    if (input === void 0)
      return;
    if (/gradient\(/.test(input) && !unsafeColorPattern.test(input))
      return {
        background: input
      };
    if (symbolicColorPattern.test(input) && !unsafeColorPattern.test(input))
      return {
        backgroundColor: input
      };
    let value = (0, runtime2.parseCssColorToHsva)(input), value2 = (0, runtime2.hsvaToCssColor)(value);
    return value.a < 1 ? {
      background: `linear-gradient(${value2}, ${value2}), ${runtime2.COLOR_ALPHA_CHECKERBOARD}`
    } : {
      backgroundColor: value2
    };
  }
  function swatchColorKey(color) {
    return symbolicColorPattern.test(color) ? "sym:" + color.trim() : (0, runtime2.hsvaToCssColor)((0, runtime2.parseCssColorToHsva)(color));
  }
  function colorsEqual(color, otherColor) {
    return swatchColorKey(color) === swatchColorKey(otherColor);
  }
  function mergeDesignSystemSwatches(system, swatches) {
    if (system === void 0 || system.colors.length === 0)
      return [...swatches];
    let value = swatches.findIndex((input) => !isEmptySwatch(input)), value2 = (value < 0 ? swatches : swatches.slice(0, value)).map((input) => input.group === void 0 ? input : {
      ...input,
      group: system.label,
      subgroup: void 0
    }), value3 = value < 0 ? [] : swatches.slice(value), entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map();
    for (let value4 of value3) {
      if (isEmptySwatch(value4) || swatchLabelIsColor(value4) || value4.picks !== void 0)
        continue;
      let value5 = swatchColorKey(value4.color);
      entries.has(value5) || entries.set(value5, value4);
      let value6 = (value4.label ?? value4.name).replace(/^--/, "");
      entries2.set(value6, [...entries2.get(value6) ?? [], value4]);
    }
    let callback = (input, options) => {
      let value4 = entries2.get(input) ?? [];
      if (value4.length <= 1 || value4.every((input2) => swatchColorKey(input2.color) === swatchColorKey(value4[0].color)))
        return value4[0];
      if (options !== void 0)
        return value4.find((input2) => swatchColorKey(input2.color) === swatchColorKey(options));
    }, values = /* @__PURE__ */ new Set(), items = [];
    for (let value4 of system.colors) {
      if (items.length >= swatchPaletteColumns)
        break;
      let value5 = /^var\(\s*--([\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/.exec(value4), value6 = value5 !== null ? callback(value5[1], value5[2]) : entries.get(swatchColorKey(value4));
      value6 === void 0 || values.has(value6.name) || (values.add(value6.name), items.push({
        name: "used:" + value6.name,
        color: value6.color,
        label: value6.label ?? value6.name,
        group: system.label,
        picks: value6.name
      }));
    }
    return items.length === 0 ? [...swatches] : [...value2, ...items, ...value3];
  }
  function SwatchPalette({ title, swatches, current, repick = !1, onSwatch, onPicked, fold = !1, color, kind, face, tab, onTab, headerEnd, heading, headless = !1, testid, className }) {
    let value = swatches.some((input) => !isEmptySwatch(input)), value2 = value && color !== void 0, value3 = kind !== void 0 && kind.options.length > 1 ? kind : void 0, value4 = value3 === void 0 || value3.value === (value3.colorValue ?? "color"), [value5, value6] = ColorSelectReact.useState(() => value && value4 ? "system" : "custom"), value7 = value2 ? tab ?? value5 : color === void 0 ? "system" : "custom", callback = (input) => {
      value6(input), onTab?.(input);
    }, value8 = value2 && (swatches.some((input) => input.subgroup !== void 0) || swatches.length > runtime2.OPTION_LIST_MAX_HEIGHT), [value9, value10] = ColorSelectReact.useState(""), value11 = value8 ? value9.trim().toLowerCase() : "", value12 = JSON.stringify(swatches.map((input) => [
      input.name,
      input.color,
      input.label,
      input.group,
      input.subgroup,
      input.empty === !0,
      input.disabledReason ?? null,
      input.picks ?? null
    ])), { shown: memo4, foldedInto: memo22 } = ColorSelectReact.useMemo(() => {
      let entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map(), items = [];
      for (let value19 of swatches) {
        if (isEmptySwatch(value19) || !fold) {
          items.push(value19);
          continue;
        }
        let value20 = swatchColorKey(value19.color), entry = entries.get(value20);
        if (entry !== void 0 && swatchLabelIsColor(value19)) {
          entries2.set(value19.name, entry);
          continue;
        }
        entry === void 0 && entries.set(value20, value19.name), items.push(value19);
      }
      return {
        shown: items,
        foldedInto: entries2
      };
    }, [value12, fold]), value13 = current !== null ? memo22.get(current) ?? current : null, value14 = memo4.filter((input) => (0, runtime2.optionMatchesQuery)(value11, swatchLabel(input), input.color, input.subgroup, input.group)), value15 = value8 ? ColorSelectJsx.jsx(runtime2.OptionList, {
      value: value9,
      onChange: value10,
      label: runtime2.COLOR_SEARCH_LABEL,
      className: "mt-1 mb-2 w-0 min-w-full",
      rowSelector: "[data-swatch]",
      onEnterIndex: () => (0, runtime2.optionTypeaheadMatch)(value11, value14.filter((input) => input.disabledReason === void 0).map((input) => swatchLabel(input))),
      "data-testid": testid !== void 0 ? testid + "-search" : void 0
    }) : null, callback2 = (input) => {
      let value19 = ColorSelectJsx.jsx(runtime2.SwatchButton, {
        label: swatchLabel(input),
        "data-testid": testid !== void 0 ? testid + "-" + input.name : void 0,
        "data-swatch": input.name,
        paint: input.empty === !0 ? void 0 : swatchPreviewStyle(input.color),
        current: input.name === value13 || input.picks !== void 0 && input.picks === value13,
        disabled: input.disabledReason !== void 0,
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => {
          onPicked?.(), (repick || (input.picks ?? input.name) !== current || isEmptySwatch(input)) && onSwatch(input.picks ?? input.name);
        }
      });
      return input.disabledReason === void 0 ? value19 : ColorSelectJsx.jsx(runtime2.DisabledReasonTooltip, {
        reason: input.disabledReason,
        wrapperClassName: "flex w-full shrink-0 cursor-not-allowed",
        children: value19
      });
    }, callback3 = (input, options) => ColorSelectJsx.jsx(runtime2.ColorPickerGroup, {
      label: title,
      className: (0, runtime2.joinClassNames)("w-0 min-w-full", options),
      children: input.map((input2, options2) => {
        let value19 = input2.group !== void 0 && input2.group !== input[options2 - 1]?.group, value20 = input2.subgroup !== void 0 && (value19 || input2.subgroup !== input[options2 - 1]?.subgroup);
        return ColorSelectJsx.jsxs(ColorSelectReact.Fragment, {
          children: [
            value19 ? ColorSelectJsx.jsx(runtime2.ColorPickerHeader, {
              text: input2.group,
              title: !0
            }) : null,
            value20 ? ColorSelectJsx.jsx(runtime2.ColorPickerHeader, {
              text: input2.subgroup
            }) : null,
            callback2(input2)
          ]
        }, input2.name + ":" + String(options2));
      })
    }), value16 = !headless && (value2 || headerEnd !== void 0) ? ColorSelectJsx.jsxs("div", {
      className: (0, runtime2.joinClassNames)("-mx-2 -mt-2 mb-1 flex items-center justify-between gap-2", !value2 && "order-first"),
      "data-kit": "color-popover-header",
      children: [
        value2 ? ColorSelectJsx.jsx(runtime2.ColorHexInput, {
          value: value7,
          onChange: callback,
          className: ""
        }) : ColorSelectJsx.jsx("span", {
          className: "min-w-0 flex-1 truncate pl-2 text-body-semibold text-primary",
          children: heading
        }),
        title !== void 0 && value2 ? ColorSelectJsx.jsx("span", {
          className: "sr-only",
          children: title
        }) : null,
        headerEnd
      ]
    }) : null, value17 = !value2 && color !== void 0 ? memo4 : [], value18 = ColorSelectJsx.jsxs(ColorSelectJsx.Fragment, {
      children: [
        value17.length > 0 ? ColorSelectJsx.jsx("div", {
          className: "-mx-2 mb-1 flex flex-col",
          children: callback3(value17)
        }) : null,
        value3 !== void 0 ? ColorSelectJsx.jsx(runtime2.PropertyRow, {
          label: runtime2.TYPE_LABEL,
          className: value4 ? "mb-1" : void 0,
          ...runtime2.gradientStopKeyboardHandlers,
          children: ColorSelectJsx.jsx(runtime2.SegmentedControl, {
            "aria-label": value3.label ?? "填充类型",
            fullWidth: !0,
            segments: value3.options.map((input) => ({
              ...(0, runtime2.fillModeOption)(input.value, input.label, value3.disabled === !0 || input.disabledReason !== void 0 ? !0 : void 0),
              ...input.disabledReason !== void 0 ? {
                disabledReason: input.disabledReason
              } : {}
            })),
            value: value3.value,
            onChange: (input) => input !== value3.value && !value3.disabled && value3.onChange(input)
          })
        }) : null,
        value4 && color !== void 0 ? ColorSelectJsx.jsx(runtime2.ColorPicker, {
          ...color
        }) : face
      ]
    });
    return ColorSelectJsx.jsxs("div", {
      "data-kit": "color-selector",
      "data-search-scope": "",
      onKeyDown: (0, runtime2.createOptionListKeyHandler)("[data-swatch]"),
      className: (0, runtime2.joinClassNames)("flex min-w-56 flex-col [--pp-gutter-l:0px] [--pp-gutter-r:0px] [--pp-label-w:3rem]", className),
      children: [
        value2 ? value16 : null,
        value7 === "system" ? ColorSelectJsx.jsxs("div", {
          className: (0, runtime2.joinClassNames)("flex min-h-0 flex-col", value2 ? "-mx-2" : "-m-2"),
          children: [
            value15,
            value14.length > 0 ? callback3(value14, value2 ? "mb-[calc(-1*var(--cs-bottom,16px))] pb-[var(--cs-bottom,16px)]" : void 0) : ColorSelectJsx.jsx("p", {
              role: "status",
              className: "px-2 py-1 text-footnote text-muted",
              children: runtime2.NO_COLOR_MATCHES_LABEL
            })
          ]
        }) : value18,
        value2 ? null : value16
      ]
    });
  }
  function normalizeColorSwatches(swatches, allowEmpty, disabledReason) {
    let value = (swatches ?? []).map((input) => typeof input == "string" ? {
      name: input,
      color: input
    } : "value" in input ? {
      name: input.name,
      color: input.value,
      label: input.label,
      group: input.group,
      subgroup: input.subgroup,
      ...input.picks !== void 0 ? {
        picks: input.picks
      } : {}
    } : input);
    if (!allowEmpty)
      return value;
    let state = {
      name: emptySwatchValue,
      label: "无",
      color: "transparent",
      empty: !0,
      group: value[0]?.group,
      subgroup: value[0]?.subgroup
    };
    return disabledReason !== void 0 && (state.disabledReason = disabledReason), [state, ...value];
  }
  function ColorSelect({ value, unset, opaque, onChange, onPickEnd, contrast, swatches, none: none2, current, onSwatch, ...props }) {
    let memo4 = ColorSelectReact.useMemo(() => normalizeColorSwatches(swatches, none2 !== void 0, none2?.disabledReason), [swatches, none2 !== void 0, none2?.disabledReason]), callback = (input) => (0, runtime2.rgbaHexColor)({
      ...(0, runtime2.parseCssColorToHsva)(input),
      ...opaque ? {
        a: 1
      } : {}
    }), value2 = JSON.stringify(memo4.map((input) => [input.name, input.color])), memo22 = ColorSelectReact.useMemo(() => memo4.map((input) => input.empty === !0 ? null : callback(input.color)), [value2, opaque]), memo32 = ColorSelectReact.useMemo(() => {
      if (none2?.current)
        return emptySwatchValue;
      if (current !== void 0)
        return current;
      if (unset)
        return null;
      let value3 = callback(value), value4 = memo22.indexOf(value3);
      return value4 < 0 ? null : memo4[value4].picks ?? memo4[value4].name;
    }, [memo4, memo22, value, unset, opaque, none2?.current, current]);
    return ColorSelectJsx.jsx(SwatchPalette, {
      ...props,
      swatches: memo4,
      current: memo32,
      onSwatch: (input) => {
        if (input === emptySwatchValue)
          return none2?.onPick();
        if (onSwatch !== void 0)
          return onSwatch(input);
        let value3 = memo4.find((input2) => input2.name === input);
        if (value3 === void 0)
          return;
        let value4 = callback(value3.color);
        onChange(value4), onPickEnd?.(value4), contrast !== void 0 && (0, runtime2.announceLiveMessage)(() => {
          let value5 = (0, runtime2.colorContrastResults)(value4, contrast);
          return value5 === void 0 ? null : (0, runtime2.contrastDisplayInfo)(value5).spoken;
        });
      },
      color: {
        value,
        unset,
        opaque,
        onChange,
        onPickEnd,
        contrast
      }
    });
  }
  return bindRuntimeValue(runtime2, "swatchPreviewStyle", () => swatchPreviewStyle), bindRuntimeValue(runtime2, "swatchColorKey", () => swatchColorKey), bindRuntimeValue(runtime2, "colorsEqual", () => colorsEqual), bindRuntimeValue(runtime2, "mergeDesignSystemSwatches", () => mergeDesignSystemSwatches), bindRuntimeValue(runtime2, "SwatchPalette", () => SwatchPalette), bindRuntimeValue(runtime2, "normalizeColorSwatches", () => normalizeColorSwatches), bindRuntimeValue(runtime2, "ColorSelect", () => ColorSelect), bindRuntimeValue(runtime2, "ColorSelectReact", () => ColorSelectReact, (value) => {
    ColorSelectReact = value;
  }), bindRuntimeValue(runtime2, "ColorSelectJsx", () => ColorSelectJsx, (value) => {
    ColorSelectJsx = value;
  }), bindRuntimeValue(runtime2, "symbolicColorPattern", () => symbolicColorPattern, (value) => {
    symbolicColorPattern = value;
  }), bindRuntimeValue(runtime2, "unsafeColorPattern", () => unsafeColorPattern, (value) => {
    unsafeColorPattern = value;
  }), bindRuntimeValue(runtime2, "swatchLabel", () => swatchLabel, (value) => {
    swatchLabel = value;
  }), bindRuntimeValue(runtime2, "isEmptySwatch", () => isEmptySwatch, (value) => {
    isEmptySwatch = value;
  }), bindRuntimeValue(runtime2, "swatchLabelIsColor", () => swatchLabelIsColor, (value) => {
    swatchLabelIsColor = value;
  }), bindRuntimeValue(runtime2, "swatchPaletteColumns", () => swatchPaletteColumns, (value) => {
    swatchPaletteColumns = value;
  }), bindRuntimeValue(runtime2, "emptySwatchValue", () => emptySwatchValue, (value) => {
    emptySwatchValue = value;
  }), bindRuntimeValue(runtime2, "initializeColorSelect", () => initializeColorSelect, (value) => {
    initializeColorSelect = value;
  }), () => {
    swatchLabel = (input) => input.label ?? input.name[0].toUpperCase() + input.name.slice(1), isEmptySwatch = (input) => input.empty === !0 || input.name === "default", swatchLabelIsColor = (input) => /^(#|rgba?\(|hsla?\()/i.test((input.label ?? input.name).trim()), swatchPaletteColumns = 12, emptySwatchValue = ":none", initializeColorSelect = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiContrastControls)(), (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeGradientEditor)(), (0, runtime2.initializeIconButton)(), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiPropertySearch)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiPropertyLabels)(), ColorSelectReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ColorSelectJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), symbolicColorPattern = /^\s*(var|color-mix)\(/i, unsafeColorPattern = /url\s*\(|image(-set)?\s*\(|src\s*\(|cross-fade\s*\(|element\s*\(|\\/i;
    });
  };
}
export {
  installUiColorSelect
};
