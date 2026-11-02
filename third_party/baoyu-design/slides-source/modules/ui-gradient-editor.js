// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiGradientEditor(runtime2) {
  var GradientEditorReact, GradientEditorJsx, gradientStopKeyboardHandlers, clampGradientEditorValue, normalizeGradientColor, normalizeGradientColorInput, symbolicGradientColorPattern, gradientStopLengthPattern, handAuthoredGradientExplanation, gradientTypeChoices, initializeGradientEditor;
  function normalizeGradientStopPositions(stops) {
    let value = stops.map((input) => input.pos === void 0 ? void 0 : clampGradientEditorValue(input.pos, 0, 100));
    if (value.length === 0)
      return [];
    value[0] === void 0 && (value[0] = 0), value[value.length - 1] === void 0 && (value[value.length - 1] = 100);
    let value2 = -1 / 0;
    for (let index4 = 0; index4 < value.length; index4++)
      value[index4] !== void 0 && (value[index4] < value2 && (value[index4] = value2), value2 = value[index4]);
    for (let count = 1; count < value.length - 1; count++) {
      if (value[count] !== void 0)
        continue;
      let value3 = count;
      for (; value[value3] === void 0; )
        value3++;
      let value4 = value[count - 1], value5 = value[value3];
      for (let value6 = count; value6 < value3; value6++)
        value[value6] = value4 + (value5 - value4) * (value6 - count + 1) / (value3 - count + 1);
      count = value3;
    }
    return value;
  }
  function GradientEditor({ radial, onRadial, angle, onAngle, onAngleScrub, onAngleScrubEnd, stops, selected, onSelect, onStops, onStopsLive, onLiveEnd, minStops = 2, maxStops = 8, disabled: disabled2 = !1, renderStopPicker, testid }) {
    let [value, value2] = GradientEditorReact.useState(null), value3 = value ?? stops, ref = GradientEditorReact.useRef(!1), value4 = normalizeGradientStopPositions(value3), value5 = ref.current || value !== null ? value3.map((input, options) => input.pos === void 0 ? value4[options] : clampGradientEditorValue(input.pos, 0, 100)) : value4, callback = (input) => input.swatch ?? input.color, value6 = value3.map(callback).join("\0"), memo4 = GradientEditorReact.useMemo(() => {
      let entries = /* @__PURE__ */ new Map();
      for (let value17 of value6.split("\0"))
        entries.has(value17) || entries.set(value17, symbolicGradientColorPattern.test(value17) || gradientStopLengthPattern.test(value17) ? "transparent" : normalizeGradientColor(value17));
      return (input) => entries.get(input) ?? "transparent";
    }, [value6]), value7 = clampGradientEditorValue(selected, 0, Math.max(0, value3.length - 1)), ref2 = GradientEditorReact.useRef(null), ref3 = GradientEditorReact.useRef(null), ref4 = GradientEditorReact.useRef([]), ref5 = GradientEditorReact.useRef(0);
    ref4.current.length !== value3.length && (ref4.current = value3.map(() => ref5.current++));
    let current = ref4.current, callback2 = () => ref3.current?.closest('[data-mc-popover], [role="dialog"]') ?? ref3.current, [value8, value9] = GradientEditorReact.useState(null), [value10, value11] = GradientEditorReact.useState(!1), value12 = value8 !== null && current.includes(value8) ? current.indexOf(value8) : null, ref6 = GradientEditorReact.useRef(null), ref7 = GradientEditorReact.useRef({
      stops,
      onStopsLive,
      onLiveEnd
    });
    ref7.current = {
      stops,
      onStopsLive,
      onLiveEnd
    };
    let callback3 = (input) => {
      let { stops: current2, onStopsLive: current3, onLiveEnd: current4 } = ref7.current, value17 = ref4.current.indexOf(input.id);
      current3 && value17 >= 0 && value17 < current2.length && current3(current2.map((input2, options) => options === value17 ? {
        ...input2,
        pos: input.posBefore
      } : input2)), current4?.();
    };
    GradientEditorReact.useEffect(() => () => {
      let current2 = ref6.current;
      current2?.moved && callback3(current2);
    }, []);
    let ref8 = GradientEditorReact.useRef(!1), callback4 = (input) => input.map((input2, options) => input2.locked === !0 ? input2 : {
      ...input2,
      pos: Math.round((input === value3 ? value5[options] : normalizeGradientStopPositions(input)[options]) * 100) / 100
    }), value13 = value3.some((input) => input.locked === !0), callback5 = (items, options, context) => {
      let value17 = value13 && options > 0 ? value5[options - 1] : 0, value18 = value13 && options < items.length - 1 ? value5[options + 1] : 100;
      return callback4(items).map((input, options2) => options2 === options ? {
        ...input,
        pos: Math.round(clampGradientEditorValue(context, value17, value18))
      } : input);
    }, callback6 = (input) => {
      ref.current = !0, onStopsLive ? onStopsLive(input) : value2(input);
    }, callback7 = (input) => {
      let activeElement2 = document.activeElement, current2 = ref3.current;
      if (!current2 || !(activeElement2 instanceof HTMLElement) || !current2.contains(activeElement2))
        return;
      let value17 = activeElement2.matches('button[role="slider"]') ? 'button[role="slider"]' : activeElement2.matches("input") && activeElement2.closest('[role="listitem"]') !== null ? '[role="listitem"] input' : null;
      value17 !== null && requestAnimationFrame(() => current2.querySelectorAll(value17)[input]?.focus());
    }, ref9 = GradientEditorReact.useRef(0), callback8 = (input, options) => {
      let value17 = input.some((input2) => input2.locked === !0), value18 = input.map((input2, options2) => options2);
      value17 || value18.sort((input2, options2) => input[input2].pos - input[options2].pos || input2 - options2);
      let value19 = Math.max(0, value18.indexOf(options)), value20 = value18.map((input2) => input[input2]);
      return ref4.current = value18.map((input2) => ref4.current[input2]), ref.current = !1, value19 !== options && (ref9.current += 1, onStopsLive?.(value20), callback7(value19)), value2(null), onLiveEnd?.(), onStops(value20), onSelect(value19), value19;
    }, length = value3.filter((input) => input.hint !== !0).length, value14 = length > minStops || length < value3.length, callback9 = (input) => !disabled2 && value3.length > 0 && (value3[input]?.hint === !0 ? !0 : length > minStops), callback10 = (input) => {
      if (!callback9(input))
        return value3.length;
      let value17 = value3.map((input2, options) => options !== input);
      for (let flag = !0; flag; ) {
        flag = !1;
        let value19 = value3.map((input2, options) => options).filter((input2) => value17[input2]);
        value19.forEach((input2, options) => {
          if (value3[input2].hint !== !0 || !value17[input2])
            return;
          let value20 = options === 0, value21 = options === value19.length - 1, value22 = options > 0 && value3[value19[options - 1]].hint === !0;
          (value20 || value21 || value22) && (value17[input2] = !1, flag = !0);
        });
      }
      let value18 = callback4(value3).filter((input2, options) => value17[options]);
      ref4.current = ref4.current.filter((input2, options) => value17[options]), value9(null), onStops(value18);
      let length2 = value17.slice(0, value7 + 1).filter((input2) => !input2).length;
      return onSelect(clampGradientEditorValue(value17[value7] ? value7 - length2 : value7 - length2 + (value7 - length2 + 1 < value18.length ? 1 : 0), 0, Math.max(0, value18.length - 1))), value18.length;
    }, callback11 = () => {
      if (disabled2 || value3.length >= maxStops || value3.length === 0)
        return;
      let value17 = value7, value18 = value17 < value3.length - 1, value19 = value5[value17], value20 = value18 ? value5[value17 + 1] : value5[value17 - 1] ?? 0, state = {
        color: (value3[value17].locked === !0 ? value3.find((input) => input.locked !== !0) : value3[value17])?.color ?? "#808080",
        pos: Math.round((value19 + value20) / 2)
      }, value21 = value18 ? value17 + 1 : value17, value22 = callback4(value3);
      ref4.current = [
        ...ref4.current.slice(0, value21),
        ref5.current++,
        ...ref4.current.slice(value21)
      ], onStops([
        ...value22.slice(0, value21),
        state,
        ...value22.slice(value21)
      ]), onSelect(value21);
    }, ref10 = GradientEditorReact.useRef(null), callback12 = (input) => {
      let bounds = (ref10.current ?? ref2.current).getBoundingClientRect();
      return (input.clientX - bounds.left) / Math.max(1, bounds.width) * 100;
    }, callback13 = (input) => (event) => {
      if (disabled2 || event.button !== 0 || ref6.current !== null || value3[input]?.locked === !0)
        return;
      event.preventDefault();
      let current2 = ref9.current, activeElement2 = document.activeElement;
      activeElement2 instanceof HTMLElement && activeElement2 !== event.currentTarget && ref3.current?.contains(activeElement2) && activeElement2.blur(), ref9.current === current2 && (event.currentTarget.setPointerCapture(event.pointerId), event.currentTarget.focus(), ref6.current = {
        index: input,
        id: current[input],
        pointer: event.pointerId,
        x0: event.clientX,
        moved: !1,
        last: value5[input],
        posBefore: value5[input]
      }, ref8.current = !1, onSelect(input));
    }, callback14 = (input) => {
      let current2 = ref6.current;
      !current2 || current2.pointer !== input.pointerId || !input.currentTarget.hasPointerCapture(input.pointerId) || !current2.moved && Math.abs(input.clientX - current2.x0) < 3 || (current2.moved = !0, current2.last = callback12(input), callback6(callback5(value3, current2.index, current2.last)));
    }, callback15 = (input, options) => {
      let current2 = ref6.current;
      !current2 || current2.pointer !== input.pointerId || (ref6.current = null, input.currentTarget.hasPointerCapture(input.pointerId) && input.currentTarget.releasePointerCapture(input.pointerId), current2.moved && (options ? (ref8.current = !0, callback8(callback5(value3, current2.index, current2.last), current2.index)) : (ref.current = !1, value2(null), onStopsLive ? callback3(current2) : onLiveEnd?.())));
    }, callback16 = (input) => (event) => {
      if (disabled2 || value3[input]?.locked === !0 && event.key !== "Delete" && event.key !== "Backspace")
        return;
      let value17 = event.shiftKey ? 10 : 1, value18 = value5[input], value19 = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown")
        value19 = value18 - value17;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp")
        value19 = value18 + value17;
      else if (event.key === "Home")
        value19 = 0;
      else if (event.key === "End")
        value19 = 100;
      else if (event.key === "Delete" || event.key === "Backspace") {
        if (event.preventDefault(), callback9(input)) {
          let value20 = callback10(input), value21 = Math.min(input, value20 - 1);
          requestAnimationFrame(() => ref10.current?.querySelectorAll('button[role="slider"]')[value21]?.focus());
        }
        return;
      }
      value19 !== null && (event.preventDefault(), event.stopPropagation(), callback8(callback5(value3, input, value19), input));
    }, callback17 = (input) => "calc(0.75rem + (100% - 1.5rem) * " + String(input / 100) + ")", value15 = value3.flatMap((input, options) => input.hint === !0 ? [] : [memo4(callback(input)) + " " + callback17(value5[options])]), value16 = "linear-gradient(90deg, " + (value15.length >= 2 ? value15 : ["transparent 0%", "transparent 100%"]).join(", ") + ")";
    return GradientEditorJsx.jsxs("div", {
      ref: ref3,
      "data-testid": testid,
      "data-kit": "gradient-editor",
      className: "flex flex-col",
      children: [
        GradientEditorJsx.jsx(runtime2.PropertyRow, {
          label: "样式",
          children: GradientEditorJsx.jsxs("div", {
            className: "flex min-w-0 flex-1 items-center gap-2",
            children: [
              GradientEditorJsx.jsx("div", {
                className: "min-w-0 flex-1",
                children: GradientEditorJsx.jsx(runtime2.Select, {
                  "aria-label": "渐变样式",
                  items: gradientTypeChoices(onRadial !== void 0),
                  value: radial ? "radial" : "linear",
                  disabled: disabled2,
                  onChange: (input) => {
                    input === "radial" !== radial && onRadial?.(input === "radial");
                  }
                })
              }),
              GradientEditorJsx.jsx("div", {
                className: "w-[4.75rem] shrink-0",
                title: radial ? "径向渐变不设角度。" : void 0,
                children: GradientEditorJsx.jsx(runtime2.PropertyNumberInput, {
                  "aria-label": "角度",
                  prefix: GradientEditorJsx.jsx(runtime2.PropertyIcon, {
                    icon: runtime2.ANGLE_ICON
                  }),
                  value: radial ? void 0 : angle,
                  placeholder: radial ? "–" : "180",
                  ownUnit: "deg",
                  min: 0,
                  max: 360,
                  step: 1,
                  steppers: !1,
                  disabled: disabled2 || radial,
                  onValue: (input) => onAngle(input === void 0 ? void 0 : clampGradientEditorValue(input, 0, 360)),
                  ...onAngleScrub ? {
                    onScrub: (input) => onAngleScrub(clampGradientEditorValue(input, 0, 360)),
                    onScrubEnd: onAngleScrubEnd
                  } : {}
                })
              })
            ]
          })
        }),
        GradientEditorJsx.jsx("div", {
          className: (0, runtime2.joinClassNames)(runtime2.PROPERTY_SECTION_GUTTER_CLASS, "pt-3 pb-4"),
          children: GradientEditorJsx.jsxs("div", {
            ref: ref2,
            "data-kit": "gradient-bar",
            className: "relative h-8 rounded shadow-card-ring bg-[repeating-conic-gradient(var(--cds-alpha-2)_0_25%,transparent_0_50%)] bg-[length:8px_8px]",
            children: [
              GradientEditorJsx.jsx("div", {
                className: "absolute inset-0 rounded",
                style: {
                  background: value16
                }
              }),
              GradientEditorJsx.jsx("div", {
                ref: ref10,
                className: "absolute inset-y-0 left-3 right-3",
                children: value3.map((input, options) => GradientEditorJsx.jsx("button", {
                  type: "button",
                  role: "slider",
                  "aria-label": "色标 " + String(options + 1) + "位置",
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                  "aria-valuenow": Math.round(value5[options]),
                  "aria-valuetext": String(Math.round(value5[options])) + "%",
                  "data-selected": options === value7 ? "" : void 0,
                  disabled: disabled2,
                  "aria-disabled": input.locked === !0 ? !0 : void 0,
                  title: input.locked === !0 ? handAuthoredGradientExplanation : void 0,
                  className: (0, runtime2.joinClassNames)("absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-default touch-none rounded-full border-2 border-white p-0 shadow-card-ring", "focus-visible:shadow-focus pointer-coarse:h-6 pointer-coarse:w-6", options === value7 ? "z-[1] outline outline-2 outline-offset-1 outline-border-strong" : "outline-none focus-visible:outline-hidden"),
                  style: {
                    left: String(value5[options]) + "%",
                    background: memo4(callback(input))
                  },
                  onPointerDown: callback13(options),
                  onPointerMove: callback14,
                  onPointerUp: (input2) => callback15(input2, !0),
                  onPointerCancel: (input2) => callback15(input2, !1),
                  onLostPointerCapture: (input2) => callback15(input2, !1),
                  onKeyDown: callback16(options),
                  onClick: () => {
                    ref8.current ? ref8.current = !1 : onSelect(options);
                  }
                }, current[options]))
              })
            ]
          })
        }),
        GradientEditorJsx.jsx(runtime2.PropertyRow, {
          label: "色标",
          children: GradientEditorJsx.jsx("div", {
            className: "flex min-w-0 flex-1 justify-end",
            children: GradientEditorJsx.jsx(runtime2.Button, {
              variant: "ghost",
              size: "sm",
              iconOnly: !0,
              icon: "Add",
              "aria-label": "添加色标",
              disabled: disabled2 || value3.length >= maxStops,
              disabledReason: String(maxStops) + " stops at most.",
              onClick: callback11
            })
          })
        }),
        GradientEditorJsx.jsx("div", {
          role: "list",
          "aria-label": "色标",
          className: (0, runtime2.joinClassNames)(runtime2.PROPERTY_SECTION_GUTTER_CLASS, "mt-1 flex flex-col gap-2"),
          children: value3.map((input, options) => {
            let value17 = !symbolicGradientColorPattern.test(callback(input)) && !gradientStopLengthPattern.test(callback(input));
            return GradientEditorJsx.jsxs("div", {
              role: "listitem",
              className: "flex min-w-0 items-center gap-2",
              children: [
                GradientEditorJsx.jsx("div", {
                  className: "w-[3.75rem] shrink-0",
                  children: GradientEditorJsx.jsx(runtime2.PropertyNumberInput, {
                    "aria-label": "色标 " + String(options + 1) + "位置",
                    value: Math.round(value5[options]),
                    unit: "%",
                    min: 0,
                    max: 100,
                    step: 1,
                    smallStep: 1,
                    steppers: !1,
                    disabled: disabled2 || input.locked === !0,
                    title: input.locked === !0 ? handAuthoredGradientExplanation : void 0,
                    onValue: (input2) => callback8(callback5(value3, options, input2 ?? value5[options]), options),
                    onScrub: (input2) => callback6(callback5(value3, options, input2)),
                    onScrubEnd: () => callback8(callback5(value3, options, value5[options]), options)
                  })
                }),
                GradientEditorJsx.jsx("span", {
                  className: "relative flex min-w-0 flex-1",
                  children: GradientEditorJsx.jsx(runtime2.PropertyPopup, {
                    open: value12 === options,
                    onOpen: () => value9(current[options]),
                    onClose: () => value9(null),
                    trigger: GradientEditorJsx.jsx(runtime2.FieldButton, {
                      "aria-label": "色标 " + String(options + 1) + "颜色：" + normalizeGradientColorInput(input.color),
                      "data-selected": options === value7 ? "" : void 0,
                      disabled: disabled2,
                      onClick: (input2) => {
                        onSelect(options), value11(input2.detail === 0);
                      },
                      className: (0, runtime2.joinClassNames)("min-w-0 cursor-default", options === value7 && "bg-fill-ghost-hover"),
                      chip: GradientEditorJsx.jsx(runtime2.PropertyColorPreview, {
                        background: value17 ? memo4(callback(input)) : void 0
                      }),
                      children: normalizeGradientColorInput(input.color)
                    }),
                    side: "left",
                    positionAnchor: callback2,
                    padding: "none",
                    className: runtime2.COLOR_PICKER_POPOVER_CLASS,
                    focusOnOpen: value10,
                    popupAttrs: {
                      "data-kit-stop-picker": String(options)
                    },
                    children: value12 === options ? renderStopPicker(options) : null
                  })
                }),
                value14 ? GradientEditorJsx.jsx(runtime2.Button, {
                  variant: "ghost",
                  size: "sm",
                  iconOnly: !0,
                  icon: "Minus",
                  "aria-label": "移除色标 " + String(options + 1),
                  disabled: !callback9(options),
                  disabledReason: "A gradient needs " + String(minStops) + " color stops.",
                  onClick: () => callback10(options)
                }) : null
              ]
            }, current[options]);
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "normalizeGradientStopPositions", () => normalizeGradientStopPositions), bindRuntimeValue(runtime2, "GradientEditor", () => GradientEditor), bindRuntimeValue(runtime2, "GradientEditorReact", () => GradientEditorReact, (value) => {
    GradientEditorReact = value;
  }), bindRuntimeValue(runtime2, "GradientEditorJsx", () => GradientEditorJsx, (value) => {
    GradientEditorJsx = value;
  }), bindRuntimeValue(runtime2, "gradientStopKeyboardHandlers", () => gradientStopKeyboardHandlers, (value) => {
    gradientStopKeyboardHandlers = value;
  }), bindRuntimeValue(runtime2, "clampGradientEditorValue", () => clampGradientEditorValue, (value) => {
    clampGradientEditorValue = value;
  }), bindRuntimeValue(runtime2, "normalizeGradientColor", () => normalizeGradientColor, (value) => {
    normalizeGradientColor = value;
  }), bindRuntimeValue(runtime2, "normalizeGradientColorInput", () => normalizeGradientColorInput, (value) => {
    normalizeGradientColorInput = value;
  }), bindRuntimeValue(runtime2, "symbolicGradientColorPattern", () => symbolicGradientColorPattern, (value) => {
    symbolicGradientColorPattern = value;
  }), bindRuntimeValue(runtime2, "gradientStopLengthPattern", () => gradientStopLengthPattern, (value) => {
    gradientStopLengthPattern = value;
  }), bindRuntimeValue(runtime2, "handAuthoredGradientExplanation", () => handAuthoredGradientExplanation, (value) => {
    handAuthoredGradientExplanation = value;
  }), bindRuntimeValue(runtime2, "gradientTypeChoices", () => gradientTypeChoices, (value) => {
    gradientTypeChoices = value;
  }), bindRuntimeValue(runtime2, "initializeGradientEditor", () => initializeGradientEditor, (value) => {
    initializeGradientEditor = value;
  }), () => {
    clampGradientEditorValue = (input, options, context) => Math.min(context, Math.max(options, input)), normalizeGradientColor = (input) => (0, runtime2.hsvaToCssColor)((0, runtime2.parseCssColorToHsva)(input)), normalizeGradientColorInput = (input) => /^#[0-9a-f]{3,8}$/i.test(input.trim()) ? input.trim().toUpperCase() : input.trim(), handAuthoredGradientExplanation = "Written by hand in a form this editor keeps as is.", gradientTypeChoices = (input) => [
      {
        value: "linear",
        label: "线性"
      },
      {
        value: "radial",
        label: "径向",
        disabled: !input,
        title: input ? void 0 : "此处仅支持线性渐变。"
      }
    ], initializeGradientEditor = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiNumberControls2)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeSelect)(), GradientEditorReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), GradientEditorJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), gradientStopKeyboardHandlers = {
        onKeyDownCapture: (event) => {
          let value = event.target instanceof HTMLElement ? event.target.closest('[role="radio"]') : null;
          if (value)
            if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(), event.stopPropagation();
              let items = [
                ...value.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"]') ?? []
              ], value2 = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
              items[(items.indexOf(value) + value2 + items.length) % items.length]?.focus();
            } else
              event.key === "Enter" && (event.preventDefault(), event.stopPropagation(), value.click());
        }
      }, symbolicGradientColorPattern = /\b(var|env|attr|calc|color-mix)\(|^\s*(currentcolor|inherit|initial|unset)\s*$/i, gradientStopLengthPattern = /^\s*-?[\d.]+[a-z%]*\s*$/i;
    });
  };
}
export {
  installUiGradientEditor
};
