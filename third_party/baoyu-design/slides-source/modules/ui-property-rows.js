// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyRows(runtime2) {
  var reactK30, reactZ7, jsxmq, MAX_INLINE_CHOICE_OPTIONS, COLOR_CHIP_PATTERN, preventDefaultEvent;
  function InspectorPropertyRow({ label, onReset, title, description, onPress, disabled: disabled2, trailing, children }) {
    return jsxmq.jsx(runtime2.PropertyRow, {
      label,
      onReset,
      onPress,
      disabled: disabled2,
      title,
      description,
      trailing,
      children
    });
  }
  function NumberPropertyRow({ label, value, onValue, onScrub, onScrubEnd, min: min2, max: max2, step, smallStep, placeholder, hint, emptyStepFrom, clearable, prefix, unit, units, onUnit, mixed, adornment, trailing, onReset, disabled: disabled2, title, description }) {
    let ref = reactZ7.useRef(!1), callback = () => {
      ref.current = !0, setTimeout(() => {
        ref.current = !1;
      }, 0), onScrubEnd?.();
    }, value2 = onScrub && emptyStepFrom !== null && placeholder !== void 0 && /^-?\d+(\.\d+)?$/.test(placeholder) ? Number(placeholder) : void 0, value3 = value ?? (typeof emptyStepFrom == "number" && Number.isFinite(emptyStepFrom) ? emptyStepFrom : value2), value4 = !disabled2 && !mixed && value3 !== void 0, value5 = (0, runtime2.useNumberScrubGesture)({
      value: value3 ?? NaN,
      step,
      min: min2,
      max: max2,
      disabled: !value4,
      onScrub: (input) => (onScrub ?? onValue)(input),
      onScrubEnd: callback
    }), value6 = units !== void 0 && onUnit !== void 0;
    return jsxmq.jsxs(runtime2.PropertyRow, {
      label,
      title,
      description,
      disabled: disabled2,
      onReset,
      trailing,
      labelProps: {
        onMouseDown: value4 ? value5 : void 0,
        onPointerDown: value4 ? runtime2.captureNumberScrubPointer : void 0,
        className: value4 ? "cursor-ew-resize" : void 0
      },
      onPress: (element) => {
        ref.current || element.querySelector("input")?.focus();
      },
      children: [
        jsxmq.jsx(runtime2.PropertyNumberInput, {
          "aria-label": label,
          prefix,
          unit: value6 ? void 0 : unit,
          value,
          onValue,
          onScrub,
          onScrubEnd: callback,
          min: min2,
          max: max2,
          step,
          smallStep,
          placeholder,
          hint,
          emptyStepFrom,
          clearable,
          mixed,
          disabled: disabled2
        }),
        value6 ? jsxmq.jsx(runtime2.Select, {
          compact: !0,
          "aria-label": label + "单位",
          title: "单位",
          items: units.map((input) => ({
            value: input,
            label: input
          })),
          value: unit ?? units[0] ?? null,
          onChange: onUnit,
          disabled: disabled2,
          align: "end"
        }) : null,
        adornment
      ]
    });
  }
  function sliderFraction(value, min2, max2) {
    return max2 <= min2 ? 0 : Math.max(0, Math.min(1, (value - min2) / (max2 - min2)));
  }
  function sliderValueAtFraction(fraction, min2, max2, step) {
    let value = min2 + Math.max(0, Math.min(1, fraction)) * (max2 - min2);
    if (!step || step <= 0)
      return value;
    let value2 = Math.round((value - min2) / step) * step + min2, callback = (input) => {
      let value5 = String(input), value6 = value5.indexOf(".");
      return value6 === -1 ? 0 : value5.length - value6 - 1;
    }, value3 = Math.max(callback(step), callback(min2)), value4 = value3 === 0 ? value2 : Number(value2.toFixed(value3));
    return Math.max(min2, Math.min(max2, value4));
  }
  function SliderPropertyRow({ label, value, onValue, onLive, onLiveEnd, min: min2 = 0, max: max2 = 100, step = 1, unit, adornment, mixed = !1, onReset, disabled: disabled2, title, description }) {
    let ref = reactZ7.useRef(/* @__PURE__ */ new Set()), ref2 = reactZ7.useRef(onLiveEnd);
    ref2.current = onLiveEnd;
    let ref3 = reactZ7.useRef(value);
    reactZ7.useEffect(() => () => {
      for (let value3 of ref.current)
        value3();
      ref.current.clear();
    }, []);
    let callback = (input) => {
      if (disabled2 || input.button !== 0)
        return;
      let currentTarget = input.currentTarget, bounds = currentTarget.getBoundingClientRect(), pointerId = input.pointerId;
      try {
        currentTarget.setPointerCapture(pointerId);
      } catch {
      }
      currentTarget.focus();
      let value3 = value, flag = !1, callback3 = (input2) => {
        let value4 = sliderValueAtFraction((input2 - bounds.left - 6) / (bounds.width - 12), min2, max2, step);
        value4 !== value3 && (value3 = value4, flag = !0, (onLive ?? onValue)(value4));
      };
      callback3(input.clientX);
      let callback4 = (input2) => {
        input2.pointerId === pointerId && callback3(input2.clientX);
      }, callback5 = () => {
        window.removeEventListener("pointermove", callback4), window.removeEventListener("pointerup", callback7), window.removeEventListener("pointercancel", callback7);
      }, callback6 = () => {
        ref.current.delete(callback6), callback5(), flag && (flag = !1, ref2.current?.(value3));
      }, callback7 = (input2) => {
        input2.pointerId === pointerId && callback6();
      };
      window.addEventListener("pointermove", callback4), window.addEventListener("pointerup", callback7), window.addEventListener("pointercancel", callback7), ref.current.add(callback6);
    }, callback2 = (event) => {
      if (disabled2)
        return;
      let value3;
      if (event.key === "ArrowRight" || event.key === "ArrowUp")
        value3 = (0, runtime2.steppedNumberValue)(value, 1, event, {
          step,
          min: min2,
          max: max2
        });
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
        value3 = (0, runtime2.steppedNumberValue)(value, -1, event, {
          step,
          min: min2,
          max: max2
        });
      else if (event.key === "Home")
        value3 = min2;
      else if (event.key === "End")
        value3 = max2;
      else if (event.key === " ") {
        event.preventDefault();
        return;
      }
      value3 !== void 0 && (event.preventDefault(), value3 !== value && onValue(value3));
    }, value2 = sliderFraction(value, min2, max2);
    return jsxmq.jsxs(runtime2.PropertyRow, {
      label,
      title,
      description,
      disabled: disabled2,
      onReset,
      children: [
        jsxmq.jsx("div", {
          className: "w-[68px] shrink-0",
          children: jsxmq.jsx(runtime2.PropertyNumberInput, {
            "aria-label": label,
            value: mixed ? void 0 : value,
            mixed,
            emptyStepFrom: mixed ? null : void 0,
            onValue: (input) => {
              input !== void 0 && onValue(input);
            },
            onScrub: (input) => {
              ref3.current = input, (onLive ?? onValue)(input);
            },
            onScrubEnd: () => ref2.current?.(ref3.current),
            min: min2,
            max: max2,
            step,
            scrubOrigin: min2,
            unit,
            steppers: !1,
            disabled: disabled2
          })
        }),
        jsxmq.jsxs("div", {
          role: "slider",
          "aria-label": label,
          "aria-valuemin": min2,
          "aria-valuemax": max2,
          "aria-valuenow": mixed ? void 0 : value,
          "aria-valuetext": mixed ? runtime2.MIXED_LABEL : void 0,
          "aria-disabled": disabled2 || void 0,
          tabIndex: disabled2 ? -1 : 0,
          onPointerDown: callback,
          onKeyDown: callback2,
          className: "group/track relative ml-1 flex h-control min-w-8 flex-1 touch-none select-none items-center px-1.5 outline-none focus-visible:outline-hidden aria-disabled:opacity-50 pointer-coarse:h-10",
          children: [
            jsxmq.jsx("div", {
              className: "h-0.5 w-full rounded-full bg-alpha-2",
              children: mixed ? null : jsxmq.jsx("div", {
                className: "h-full rounded-full bg-fill-accent",
                style: {
                  width: String(value2 * 100) + "%"
                }
              })
            }),
            mixed ? null : jsxmq.jsx("div", {
              "data-kit": "slider-thumb",
              className: (0, runtime2.joinClassNames)("pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full", "bg-surface-3 shadow-panel-sm group-focus-visible/track:shadow-focus"),
              style: {
                left: "calc(" + String(value2) + " * (100% - 12px) + 6px)"
              }
            })
          ]
        }),
        adornment
      ]
    });
  }
  function TogglePropertyRow({ label, checked: checked5, onChange, onReset, disabled: disabled2, title, description }) {
    return jsxmq.jsx(runtime2.PropertyRow, {
      label,
      title,
      description,
      disabled: disabled2,
      onReset,
      onPress: () => onChange(!checked5),
      children: jsxmq.jsx(runtime2.Switch, {
        checked: checked5,
        onCheckedChange: (input) => onChange(input),
        "aria-label": label,
        disabled: disabled2
      })
    });
  }
  function ChoicePropertyRow({ label, options, value, onChange, popupAttrs, onReset, disabled: disabled2, title, description }) {
    let value2 = options.length > MAX_INLINE_CHOICE_OPTIONS;
    return jsxmq.jsx(runtime2.PropertyRow, {
      label,
      title,
      description,
      disabled: disabled2,
      onReset,
      onPress: value2 ? (element) => element.querySelector('[data-kit="PropertySelect"]')?.click() : void 0,
      children: value2 ? jsxmq.jsx(runtime2.Select, {
        "aria-label": label,
        items: options.map((input) => ({
          value: input.value,
          label: input.label
        })),
        value,
        onChange,
        disabled: disabled2,
        popupAttrs
      }) : jsxmq.jsx(runtime2.SegmentedControl, {
        "aria-label": label,
        fullWidth: !options.every((input) => input.icon !== void 0),
        segments: options.map((input) => {
          let state = {
            disabled: disabled2 || input.whyDisabled !== void 0,
            disabledReason: input.whyDisabled
          };
          return input.icon !== void 0 ? {
            value: input.value,
            icon: input.icon,
            tooltip: input.title ?? input.label,
            ...state
          } : {
            value: input.value,
            label: input.label,
            tooltip: input.title,
            ...state
          };
        }),
        value,
        onChange: disabled2 ? () => {
        } : onChange
      })
    });
  }
  function SelectPropertyRow({ label, icon, hint, options, value, onChange, placeholder, popupAttrs, searchable, searchLabel, onOpenChange, trailing, onReset, disabled: disabled2, title, description }) {
    return jsxmq.jsx(runtime2.PropertyRow, {
      label,
      title,
      description,
      disabled: disabled2,
      onReset,
      trailing,
      onPress: (element) => element.querySelector('[data-kit="PropertySelect"]')?.click(),
      children: jsxmq.jsx(runtime2.Select, {
        "aria-label": label,
        icon,
        hint,
        items: options,
        value,
        onChange,
        placeholder,
        disabled: disabled2,
        popupAttrs,
        searchable,
        searchLabel,
        onOpenChange
      })
    });
  }
  function ColorChip({ hex, alpha = 100, className }) {
    return jsxmq.jsx("span", {
      "aria-hidden": "true",
      className: (0, runtime2.joinClassNames)(runtime2.COLOR_SWATCH_CLASS, className),
      children: hex !== null ? jsxmq.jsxs(jsxmq.Fragment, {
        children: [
          jsxmq.jsx("span", {
            className: "absolute inset-y-0 left-0 w-1/2",
            style: {
              backgroundColor: hex
            }
          }),
          jsxmq.jsx("span", {
            className: "absolute inset-y-0 right-0 w-1/2",
            style: {
              backgroundColor: hex,
              opacity: Math.round(alpha * 100) / 1e4
            }
          })
        ]
      }) : null
    });
  }
  function useContrastResult(contrast, value) {
    let value2 = contrast === void 0 ? void 0 : JSON.stringify(contrast);
    return reactZ7.useMemo(() => contrast === void 0 || value === void 0 ? void 0 : (0, runtime2.colorContrastResults)(value, contrast), [value2, value]);
  }
  function ColorPropertyRow({ label, value, onChange, onLive, onLiveEnd, swatches, current, onSwatch, fold, opaque, description, contrast, contrastMark = !1, placeholder, clearLabel, popupAttrs, mixed = !1, unset = !1, valueName, chip, headerTabs, panel, closeLabel = runtime2.DEFAULT_CLOSE_LABEL, popoverTitle, allowNone, onNone, isNone, noneDisabledReason, disabled: disabled2, disabledReason, keepFocus = !1, editsAreUndoSteps, popover, open: open4, onOpenChange, title, testid }) {
    let [value2, value3] = reactZ7.useState(!1), value4 = open4 ?? value2, callback = (input) => {
      value3(input), onOpenChange?.(input);
    }, [value5, value6] = reactZ7.useState(!1), ref = reactZ7.useRef(!1), ref2 = reactZ7.useRef(null), value7 = popover?.anchor, value8 = value7 === void 0 ? void 0 : () => ref2.current === null ? null : value7(ref2.current), memo4 = reactZ7.useMemo(() => {
      let value23 = value ?? placeholder;
      if (value23 === void 0)
        return;
      let value24 = (0, runtime2.parseCssColorToHsva)(value23);
      return {
        solid: (0, runtime2.hsvaToHexColor)(value24),
        alpha: value24.a
      };
    }, [value, placeholder]), value9 = value !== void 0 && COLOR_CHIP_PATTERN.test(value), memo22 = reactZ7.useMemo(() => {
      if (!value9 || memo4 === void 0)
        return;
      if (valueName !== void 0)
        return valueName ?? void 0;
      if (swatches === void 0)
        return;
      if (current !== void 0) {
        if (current === null)
          return;
        let value24 = swatches.find((input) => typeof input != "string" && (input.name === current || "picks" in input && input.picks === current));
        return value24 !== void 0 && typeof value24 != "string" && value24.label !== void 0 && value24.label.trim() !== "" ? value24.label : void 0;
      }
      let value23 = memo4.solid.toLowerCase();
      for (let value24 of swatches) {
        let value25 = typeof value24 == "string" ? value24 : "value" in value24 ? value24.value : value24.color;
        if (!COLOR_CHIP_PATTERN.test(value25))
          continue;
        let value26 = (0, runtime2.parseCssColorToHsva)(value25);
        if (!(value26.a < 1) && (0, runtime2.hsvaToHexColor)(value26).toLowerCase() === value23)
          return typeof value24 != "string" && value24.label !== void 0 && value24.label.trim() !== "" ? value24.label : void 0;
      }
    }, [value9, memo4, swatches, current, valueName]), value10 = value !== void 0 ? typeof valueName == "string" ? valueName : value9 && memo4 !== void 0 ? memo22 ?? memo4.solid.toUpperCase() : value : clearLabel ?? placeholder ?? "None", value11 = value9 && memo4 !== void 0 && memo4.alpha < 1 ? Math.round(memo4.alpha * 100) + "%" : void 0, value12 = mixed || chip !== void 0 ? void 0 : value ?? placeholder, value13 = useContrastResult(contrast, value12), memo32 = reactZ7.useMemo(() => value13 === void 0 ? void 0 : (0, runtime2.contrastDisplayInfo)(value13).sentence, [value13]), value14 = description !== void 0 && description !== "" ? memo32 !== void 0 ? description.replace(/\.?\s*$/, ". ") + memo32 : description : memo32, value15 = reactZ7.useId(), value16 = swatches !== void 0 && swatches.length > 0, value17 = headerTabs === void 0 || headerTabs.value === (headerTabs.colorTab ?? "color"), [value18, value19] = reactZ7.useState("system"), [value20, value21] = reactZ7.useState(value4);
    value4 !== value20 && (value21(value4), value4 && (value19(value16 && value17 ? "system" : "custom"), value6(ref.current), ref.current = !1));
    let value22 = jsxmq.jsx(runtime2.ColorSelect, {
      testid: testid !== void 0 ? testid + "-menu" : void 0,
      title: popoverTitle ?? label,
      swatches,
      current,
      onSwatch,
      fold,
      value: value ?? placeholder ?? "#000000",
      unset: value === void 0 || mixed || !value17 || unset,
      repick: unset && current != null,
      opaque,
      contrast: value12 !== void 0 ? contrast : void 0,
      onChange: onLive ?? onChange,
      onPickEnd: onLive ? onLiveEnd : void 0,
      none: allowNone ? {
        current: isNone ?? (value === void 0 && placeholder === void 0 && chip === void 0 && !mixed),
        onPick: () => {
          onNone ? onNone() : onChange(void 0), callback(!1);
        },
        ...noneDisabledReason !== void 0 ? {
          disabledReason: noneDisabledReason
        } : {}
      } : void 0,
      kind: headerTabs !== void 0 ? {
        value: headerTabs.value,
        options: headerTabs.options,
        onChange: headerTabs.onChange,
        label: headerTabs.label ?? label,
        colorValue: headerTabs.colorTab
      } : void 0,
      face: panel,
      tab: value16 ? value18 : void 0,
      onTab: value19,
      heading: popoverTitle ?? label,
      headerEnd: value16 || headerTabs !== void 0 || popoverTitle !== void 0 ? jsxmq.jsx(runtime2.Button, {
        variant: "ghost",
        size: "sm",
        iconOnly: !0,
        icon: jsxmq.jsx(runtime2.Icon, {
          name: "X",
          size: "sm",
          className: "text-secondary"
        }),
        "aria-label": closeLabel,
        onClick: () => callback(!1),
        className: "relative shrink-0"
      }) : void 0
    });
    return jsxmq.jsxs("span", {
      ref: ref2,
      className: "relative flex min-w-0 flex-1",
      title: disabled2 ? disabledReason : void 0,
      children: [
        jsxmq.jsx(runtime2.PropertyPopup, {
          open: value4,
          onOpen: () => callback(!0),
          onClose: () => callback(!1),
          trigger: jsxmq.jsx(runtime2.FieldButton, {
            "data-testid": testid,
            title: disabled2 ? disabledReason ?? title : title,
            "aria-label": label + ": " + (mixed ? runtime2.MIXED_LABEL : chip !== void 0 ? chip.text : value !== void 0 ? value10 + (value11 !== void 0 ? " " + value11 : "") : clearLabel !== void 0 && /[\p{L}\p{N}]/u.test(clearLabel) ? clearLabel : clearLabel !== void 0 ? "none" : "未设置"),
            "aria-describedby": value14 !== void 0 ? value15 : void 0,
            disabled: disabled2,
            onClick: (input) => {
              value4 || (ref.current = input.detail === 0);
            },
            onMouseDown: keepFocus ? preventDefaultEvent : void 0,
            muted: mixed,
            chip: mixed ? jsxmq.jsxs(runtime2.PropertyColorPreview, {
              "data-kit": "swatch-mixed",
              children: [
                jsxmq.jsx("span", {
                  className: "absolute inset-y-0 left-0 w-1/2",
                  style: {
                    backgroundColor: "#ffffff"
                  }
                }),
                jsxmq.jsx("span", {
                  className: "absolute inset-y-0 right-0 w-1/2",
                  style: {
                    backgroundColor: "#141413"
                  }
                })
              ]
            }) : chip !== void 0 ? jsxmq.jsx(runtime2.PropertyColorPreview, {
              "data-kit": "swatch-chip",
              background: chip.css
            }) : jsxmq.jsx(ColorChip, {
              hex: memo4?.solid ?? null,
              alpha: (memo4?.alpha ?? 1) * 100
            }),
            caption: !mixed && chip === void 0 ? value11 : void 0,
            trailing: contrastMark && value13 !== void 0 ? jsxmq.jsx(runtime2.ContrastMark, {
              results: value13,
              sentence: !1,
              className: "ml-auto pl-1"
            }) : void 0,
            children: mixed ? runtime2.MIXED_LABEL : chip !== void 0 ? chip.text : value10
          }),
          align: "left",
          side: popover?.side,
          positionAnchor: value8,
          padding: "none",
          "aria-label": popoverTitle ?? label,
          className: runtime2.COLOR_PICKER_POPOVER_CLASS,
          popupAttrs,
          editsAreUndoSteps,
          focusOnOpen: value5,
          keepFocus,
          planHeight: value16 || headerTabs !== void 0 ? runtime2.COLOR_PICKER_POPOVER_HEIGHT : void 0,
          children: keepFocus ? jsxmq.jsx("div", {
            "data-session-strip": "",
            onKeyDownCapture: runtime2.popupPointerEvent,
            children: value22
          }) : value22
        }),
        value14 !== void 0 ? jsxmq.jsx("span", {
          id: value15,
          hidden: !0,
          "data-kit": "field-description",
          children: value14
        }) : null
      ]
    });
  }
  function ColorTextPropertyRow({ label, value, onChange, contrast, placeholder, clearLabel, adornment, trailing, mixed = !1, chip, onReset, disabled: disabled2, title, description, ...remainingProps }) {
    let [value2, value3] = reactZ7.useState(!1);
    return jsxmq.jsxs(runtime2.PropertyRow, {
      label,
      title,
      disabled: disabled2,
      onReset: onReset ?? (clearLabel !== void 0 && value !== void 0 ? () => onChange(void 0) : void 0),
      trailing,
      onPress: () => {
        disabled2 || value3(!value2);
      },
      onPointerDown: (event) => {
        value2 && !(0, runtime2.propertyRowPressShouldIgnore)(event.currentTarget, event.target) && event.stopPropagation();
      },
      children: [
        jsxmq.jsx(ColorPropertyRow, {
          ...remainingProps,
          label,
          value,
          onChange,
          description,
          contrast,
          placeholder,
          clearLabel,
          mixed,
          chip,
          disabled: disabled2,
          open: value2,
          onOpenChange: value3
        }),
        adornment
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactK30", () => reactK30, (value) => {
    reactK30 = value;
  }), bindRuntimeValue(runtime2, "reactZ7", () => reactZ7, (value) => {
    reactZ7 = value;
  }), bindRuntimeValue(runtime2, "jsxmq", () => jsxmq, (value) => {
    jsxmq = value;
  }), bindRuntimeValue(runtime2, "InspectorPropertyRow", () => InspectorPropertyRow), bindRuntimeValue(runtime2, "NumberPropertyRow", () => NumberPropertyRow), bindRuntimeValue(runtime2, "sliderFraction", () => sliderFraction), bindRuntimeValue(runtime2, "sliderValueAtFraction", () => sliderValueAtFraction), bindRuntimeValue(runtime2, "SliderPropertyRow", () => SliderPropertyRow), bindRuntimeValue(runtime2, "TogglePropertyRow", () => TogglePropertyRow), bindRuntimeValue(runtime2, "MAX_INLINE_CHOICE_OPTIONS", () => MAX_INLINE_CHOICE_OPTIONS, (value) => {
    MAX_INLINE_CHOICE_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "ChoicePropertyRow", () => ChoicePropertyRow), bindRuntimeValue(runtime2, "SelectPropertyRow", () => SelectPropertyRow), bindRuntimeValue(runtime2, "COLOR_CHIP_PATTERN", () => COLOR_CHIP_PATTERN, (value) => {
    COLOR_CHIP_PATTERN = value;
  }), bindRuntimeValue(runtime2, "ColorChip", () => ColorChip), bindRuntimeValue(runtime2, "useContrastResult", () => useContrastResult), bindRuntimeValue(runtime2, "ColorPropertyRow", () => ColorPropertyRow), bindRuntimeValue(runtime2, "preventDefaultEvent", () => preventDefaultEvent, (value) => {
    preventDefaultEvent = value;
  }), bindRuntimeValue(runtime2, "ColorTextPropertyRow", () => ColorTextPropertyRow), () => {
    reactK30 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeIconButton)(), (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiContrastControls)(), (0, runtime2.initializeColorSelect)(), (0, runtime2.initializeUiPropertyRow)(), (0, runtime2.initializeUiNumberControls2)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiPropertyFocus)(), (0, runtime2.initializeSelect)(), (0, runtime2.initializeUiNumberControls)(), (0, runtime2.initializeNumberScrubNoop)(), (0, runtime2.initializeUiPropertyLabels)(), reactZ7 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxmq = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MAX_INLINE_CHOICE_OPTIONS = 4, COLOR_CHIP_PATTERN = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:[\s,/]+[\d.]+)?\s*\))$/i, preventDefaultEvent = (event) => event.preventDefault();
  };
}
export {
  installUiPropertyRows
};
