// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiColorPicker(runtime2) {
  var reactForUiColorPicker, jsxForUiColorPicker, SLIDER_KEY_STEPS, HUE_NAME_STOPS, clampUnit = (input) => Math.max(0, Math.min(1, input)), toPercent = (input) => Math.round(input * 100), hueName = (hue) => HUE_NAME_STOPS.find(([limit]) => hue < limit)?.[1] ?? "red", COLOR_ALPHA_CHECKERBOARD, COLOR_SWATCH_BUTTON_CLASS, COLOR_PICKER_POPOVER_HEIGHT, COLOR_PICKER_POPOVER_CLASS, initializeUiColorPicker;
  function joinPickerClasses(...input) {
    return input.filter(Boolean).join(" ");
  }
  function normalizedRgbToHsva(input, options, context, value) {
    let value2 = Math.max(input, options, context), value3 = Math.min(input, options, context), value4 = value2 - value3, index4 = 0;
    value4 !== 0 && (value2 === input ? index4 = (options - context) / value4 % 6 : value2 === options ? index4 = (context - input) / value4 + 2 : index4 = (input - options) / value4 + 4, index4 *= 60, index4 < 0 && (index4 += 360));
    let value5 = value2 === 0 ? 0 : value4 / value2;
    return {
      h: index4,
      s: value5,
      v: value2,
      a: value
    };
  }
  function parseCssColorToHsva(input) {
    let value = input.match(/^#([0-9a-f]{3,8})$/i)?.[1];
    if (value && value.length !== 5 && value.length !== 7) {
      let value5 = value.length <= 4 ? value.replace(/[0-9a-f]/gi, (input2) => input2 + input2) : value.padEnd(8, "f"), callback = (input2) => parseInt(value5.slice(input2 * 2, input2 * 2 + 2), 16) / 255;
      return normalizedRgbToHsva(callback(0), callback(1), callback(2), value.length === 4 || value.length === 8 ? callback(3) : 1);
    }
    let value2 = input.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
    if (value2) {
      let callback = (input2) => Math.min(1, Math.max(0, input2));
      return normalizedRgbToHsva(callback(+(value2[1] ?? 0) / 255), callback(+(value2[2] ?? 0) / 255), callback(+(value2[3] ?? 0) / 255), value2[4] != null ? callback(+value2[4]) : 1);
    }
    if (typeof document > "u" || typeof getComputedStyle > "u")
      return {
        h: 0,
        s: 0,
        v: 0,
        a: 1
      };
    let value3 = document.createElement("div");
    value3.style.color = input, document.body.appendChild(value3);
    let color = getComputedStyle(value3).color;
    document.body.removeChild(value3);
    let value4 = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return value4 ? normalizedRgbToHsva(+(value4[1] ?? 0) / 255, +(value4[2] ?? 0) / 255, +(value4[3] ?? 0) / 255, value4[4] != null ? +value4[4] : 1) : {
      h: 0,
      s: 0,
      v: 0,
      a: 1
    };
  }
  function hsvaToCssColor(input) {
    let { h: value, s: value2, v: value3, a: value4 } = input, value5 = value3 * value2, value6 = value5 * (1 - Math.abs(value / 60 % 2 - 1)), value7 = value3 - value5, index4 = 0, index22 = 0, index32 = 0;
    value < 60 ? (index4 = value5, index22 = value6) : value < 120 ? (index4 = value6, index22 = value5) : value < 180 ? (index22 = value5, index32 = value6) : value < 240 ? (index22 = value6, index32 = value5) : value < 300 ? (index4 = value6, index32 = value5) : (index4 = value5, index32 = value6);
    let value8 = Math.round((index4 + value7) * 255), value9 = Math.round((index22 + value7) * 255), value10 = Math.round((index32 + value7) * 255);
    return value4 < 1 ? `rgba(${value8}, ${value9}, ${value10}, ${+value4.toFixed(3)})` : `rgb(${value8}, ${value9}, ${value10})`;
  }
  function hsvaToHexColor(input) {
    let value = hsvaToCssColor({
      ...input,
      a: 1
    }).match(/(\d+),\s*(\d+),\s*(\d+)/);
    return value ? "#" + [+(value[1] ?? 0), +(value[2] ?? 0), +(value[3] ?? 0)].map((input2) => input2.toString(16).padStart(2, "0")).join("").toUpperCase() : "#000000";
  }
  function rgbaHexColor(color) {
    let value = hsvaToHexColor(color);
    return color.a >= 1 ? value : value + Math.round(color.a * 255).toString(16).padStart(2, "0").toUpperCase();
  }
  function isEyeDropperAvailable() {
    return typeof EyeDropper < "u";
  }
  async function pickScreenColor() {
    if (typeof EyeDropper > "u")
      return null;
    try {
      return (await new EyeDropper().open()).sRGBHex;
    } catch {
      return null;
    }
  }
  function beginColorPickerPointerGesture(event, onMove, onEnd) {
    event.preventDefault();
    let currentTarget = event.currentTarget, bounds = currentTarget.getBoundingClientRect(), pointerId = event.pointerId;
    try {
      currentTarget.setPointerCapture(pointerId);
    } catch {
    }
    onMove(event.clientX, event.clientY, bounds);
    let callback = (input) => {
      input.pointerId === pointerId && onMove(input.clientX, input.clientY, bounds);
    }, callback2 = () => {
      window.removeEventListener("pointermove", callback), window.removeEventListener("pointerup", callback3), window.removeEventListener("pointercancel", callback3);
    }, callback3 = (input) => {
      input.pointerId === pointerId && (callback2(), onEnd?.());
    };
    return window.addEventListener("pointermove", callback), window.addEventListener("pointerup", callback3), window.addEventListener("pointercancel", callback3), callback2;
  }
  function colorTrackFraction(clientX, rectangle) {
    return Math.max(0, Math.min(1, (clientX - rectangle.left - 7) / (rectangle.width - 14)));
  }
  function sliderKeyStep(event) {
    if (event.altKey || event.ctrlKey || event.metaKey)
      return;
    let step = SLIDER_KEY_STEPS.get(event.key);
    return step && event.shiftKey && event.key.startsWith("Arrow") ? [step[0] * 10, step[1] * 10] : step;
  }
  function nudgeSaturationBrightness(color, event) {
    let step = sliderKeyStep(event);
    return step ? { ...color, s: clampUnit(color.s + step[0] / 100), v: clampUnit(color.v + step[1] / 100) } : null;
  }
  function nudgeHue(color, event) {
    let step = sliderKeyStep(event);
    return step ? { ...color, h: Math.max(0, Math.min(360, color.h + step[0] + step[1])) } : null;
  }
  function nudgeAlpha(color, event) {
    let step = sliderKeyStep(event);
    return step ? { ...color, a: clampUnit(color.a + (step[0] + step[1]) / 100) } : null;
  }
  function ColorPickerLabel({ text, title = !1, quiet = !1 }) {
    return jsxForUiColorPicker.jsx("div", {
      className: joinPickerClasses("w-full truncate", quiet ? "text-caption text-muted" : joinPickerClasses("text-footnote", title ? "font-medium text-primary" : "text-muted")),
      title: text,
      children: text
    });
  }
  function ColorPickerGroup({ label, className, role = "group", scroll = !0, children }) {
    return jsxForUiColorPicker.jsx("div", {
      role,
      "aria-label": label,
      className: joinPickerClasses("flex flex-col", scroll && "kit-scrollbar max-h-[min(18rem,max(6rem,calc(var(--available-height,100vh)_-_7.5rem)))] overflow-y-auto", className),
      children
    });
  }
  function ColorPickerHeader({ text, title, quiet = !1 }) {
    return jsxForUiColorPicker.jsx("div", {
      role: "presentation",
      className: joinPickerClasses("flex shrink-0 items-center px-2", quiet ? "h-6" : "h-8"),
      children: jsxForUiColorPicker.jsx(ColorPickerLabel, {
        text,
        title,
        quiet
      })
    });
  }
  function SwatchDot({ paint, current = !1 }) {
    return jsxForUiColorPicker.jsx("span", {
      "aria-hidden": "true",
      "data-swatch-dot": "",
      className: joinPickerClasses("inline-block h-4 w-4 shrink-0 rounded-[4px] border border-border-strong", paint === void 0 && "border-dashed", current && "outline outline-2 outline-offset-1 outline-border-strong"),
      style: paint
    });
  }
  function SwatchButton({ label, paint, current = !1, onClick, readOnly = !1, disabled: disabled2 = !1, title, ...remainingProps }) {
    let value = jsxForUiColorPicker.jsxs(jsxForUiColorPicker.Fragment, {
      children: [
        jsxForUiColorPicker.jsx(SwatchDot, {
          paint,
          current
        }),
        jsxForUiColorPicker.jsx("span", {
          className: "min-w-0 flex-1 truncate text-footnote text-primary",
          children: label
        }),
        current ? jsxForUiColorPicker.jsx("span", {
          "data-swatch-check": "",
          "aria-hidden": "true",
          className: "-mr-1 flex size-icon shrink-0 items-center justify-center",
          style: {
            color: "var(--cds-fill-accent)"
          },
          children: jsxForUiColorPicker.jsx(runtime2.Icon, {
            name: "Check",
            size: "auto",
            bold: !0
          })
        }) : null
      ]
    });
    return readOnly ? jsxForUiColorPicker.jsx("div", {
      role: "listitem",
      title: title ?? label,
      "aria-label": label,
      className: joinPickerClasses(COLOR_SWATCH_BUTTON_CLASS, "cursor-default"),
      ...remainingProps,
      children: value
    }) : jsxForUiColorPicker.jsx("button", {
      type: "button",
      title: disabled2 ? void 0 : title ?? label,
      "aria-label": label,
      "aria-pressed": current,
      disabled: disabled2,
      onClick,
      className: joinPickerClasses(COLOR_SWATCH_BUTTON_CLASS, disabled2 ? "pointer-events-none opacity-50" : "cursor-default hover:bg-fill-ghost-hover focus-visible:outline-hidden focus-visible:shadow-focus forced-colors:focus-visible:-outline-offset-2", current && "bg-fill-ghost-hover"),
      ...remainingProps,
      children: value
    });
  }
  function ColorHexInput({ value, onChange, className = "mb-2" }) {
    let ref = reactForUiColorPicker.useRef(null), callback = (input) => {
      let activeElement2 = document.activeElement, value2 = ref.current?.closest('[data-mc-popover], [role="dialog"]') ?? ref.current?.parentElement;
      activeElement2 instanceof HTMLElement && value2 && value2.contains(activeElement2) && !ref.current.contains(activeElement2) && activeElement2.blur(), onChange(input);
    };
    return jsxForUiColorPicker.jsx(runtime2.Tabs.Root, {
      ref,
      value,
      onValueChange: (input) => callback(input),
      children: jsxForUiColorPicker.jsxs(runtime2.Tabs.List, {
        "aria-label": "来源",
        "data-kit": "menu-tabs",
        className,
        onMouseDown: (event) => event.preventDefault(),
        children: [
          jsxForUiColorPicker.jsx(runtime2.Tabs.Tab, {
            value: "system",
            children: "主题"
          }),
          jsxForUiColorPicker.jsx(runtime2.Tabs.Tab, {
            value: "custom",
            children: "自定义"
          })
        ]
      })
    });
  }
  function ColorPicker({ value, unset, opaque, onChange, onPickEnd, contrast }) {
    let callback = (input) => opaque ? {
      ...input,
      a: 1
    } : input, [value2, value3] = reactForUiColorPicker.useState(() => callback(parseCssColorToHsva(value))), ref = reactForUiColorPicker.useRef(value2);
    ref.current = value2;
    let ref2 = reactForUiColorPicker.useRef(!1), [value4, value5] = reactForUiColorPicker.useState(() => hsvaToHexColor(value2)), [value6, value7] = reactForUiColorPicker.useState(() => Math.round(value2.a * 100).toString()), ref3 = reactForUiColorPicker.useRef(null), ref4 = reactForUiColorPicker.useRef(null), ref5 = reactForUiColorPicker.useRef(unset ?? !1);
    ref5.current = unset ?? !1;
    let ref6 = reactForUiColorPicker.useRef(opaque ?? !1);
    ref6.current = opaque ?? !1;
    let ref7 = reactForUiColorPicker.useRef(onPickEnd);
    ref7.current = onPickEnd;
    let ref8 = reactForUiColorPicker.useRef(contrast);
    ref8.current = contrast;
    let contrastVerdictRef = reactForUiColorPicker.useRef(void 0), contrastVerdict = reactForUiColorPicker.useCallback((input) => {
      let current = ref8.current;
      return current === void 0 ? void 0 : (0, runtime2.colorContrastResults)(input, current)?.map((result) => result.passes ? "pass" : "fail").join();
    }, []), announcePendingRef = reactForUiColorPicker.useRef(!1), announceContrast = reactForUiColorPicker.useCallback((input) => {
      let current = ref8.current;
      current !== void 0 && (contrastVerdictRef.current = contrastVerdict(input), announcePendingRef.current = !0, (0, runtime2.announceLiveMessage)(() => {
        announcePendingRef.current = !1;
        let value18 = (0, runtime2.colorContrastResults)(input, current);
        return value18 === void 0 ? null : (0, runtime2.contrastDisplayInfo)(value18).spoken;
      }));
    }, [contrastVerdict]), callback2 = reactForUiColorPicker.useCallback((input, options) => {
      ref7.current?.(input), options && announceContrast(input);
    }, [announceContrast]), keyNudgeRef = reactForUiColorPicker.useRef(!1), releaseUndoHoldRef = reactForUiColorPicker.useRef(void 0), finishKeyNudge = reactForUiColorPicker.useCallback(() => {
      if (!keyNudgeRef.current)
        return;
      keyNudgeRef.current = !1, releaseUndoHoldRef.current?.(), releaseUndoHoldRef.current = void 0;
      let hex = rgbaHexColor(ref.current);
      return callback2(hex, !1), hex;
    }, [callback2]), ref9 = reactForUiColorPicker.useRef(!1), ref10 = reactForUiColorPicker.useRef(value), callback3 = reactForUiColorPicker.useCallback((input) => {
      ref10.current = input;
      let value18 = callback(parseCssColorToHsva(input));
      rgbaHexColor(value18) !== rgbaHexColor(ref.current) && (value3(value18), ref.current = value18, value5(hsvaToHexColor(value18)), value7(Math.round(value18.a * 100).toString()));
    }, []);
    reactForUiColorPicker.useEffect(() => {
      if (value === ref10.current)
        return;
      let activeElement2 = document.activeElement;
      activeElement2 === ref3.current || activeElement2 === ref4.current || callback3(value);
    }, [value, callback3]);
    let callback4 = (input, options) => {
      if (options)
        return;
      let relatedTarget = input.relatedTarget;
      relatedTarget !== null && (relatedTarget === ref3.current || relatedTarget === ref4.current) || value !== ref10.current && callback3(value);
    }, callback5 = reactForUiColorPicker.useCallback((input) => {
      let value18 = ref6.current ? {
        ...input,
        a: 1
      } : input, value19 = rgbaHexColor(value18), value20 = value19 !== rgbaHexColor(ref.current);
      return value3(value18), ref.current = value18, value5(hsvaToHexColor(value18)), value7(Math.round(value18.a * 100).toString()), !value20 && !ref5.current ? !1 : (ref10.current = value19, onChange(value19), !0);
    }, [onChange]), callback6 = reactForUiColorPicker.useCallback((input) => {
      let value18 = ref6.current ? {
        ...input,
        a: 1
      } : input;
      return !ref5.current && rgbaHexColor(value18) === rgbaHexColor(ref.current) ? (value5(hsvaToHexColor(ref.current)), value7(Math.round(ref.current.a * 100).toString()), !1) : (callback5(value18), callback2(rgbaHexColor(value18), !0), !0);
    }, [callback5, callback2]), callback7 = reactForUiColorPicker.useCallback(() => (input) => {
      callback2(rgbaHexColor(ref.current), input);
    }, [callback2]), ref11 = reactForUiColorPicker.useRef(/* @__PURE__ */ new Set()), [value8, value9] = reactForUiColorPicker.useState(void 0), value10 = value8 !== void 0, ref12 = reactForUiColorPicker.useRef(null), ref13 = reactForUiColorPicker.useRef(!1), callback8 = (input) => {
      input || ref3.current?.focus();
    };
    reactForUiColorPicker.useEffect(() => () => {
      for (let value18 of ref11.current)
        value18();
      ref11.current.clear();
    }, []);
    let settleKeyNudge = (element) => {
      let activeElement2 = element.ownerDocument.activeElement, hex = finishKeyNudge();
      hex !== void 0 && (activeElement2 === element && element.ownerDocument.activeElement !== element && element.focus({ preventScroll: !0 }), (announcePendingRef.current || contrastVerdict(hex) !== contrastVerdictRef.current) && announceContrast(hex));
    }, sliderProps = (nudge) => ({
      tabIndex: 0,
      role: "slider",
      "aria-orientation": "horizontal",
      onKeyDown: (event) => {
        if (event.key === " ")
          return event.preventDefault();
        if (event.key === "Control" || event.key === "Meta")
          return settleKeyNudge(event.currentTarget);
        let next = nudge(ref.current, event);
        next !== null && (event.preventDefault(), !(ref11.current.size > 0) && (!callback5(next) || keyNudgeRef.current || (keyNudgeRef.current = !0, releaseUndoHoldRef.current = (0, runtime2.holdUndoSteps)(event.currentTarget))));
      },
      onKeyUp: (event) => {
        SLIDER_KEY_STEPS.has(event.key) && settleKeyNudge(event.currentTarget);
      },
      onBlur: () => void finishKeyNudge()
    }), callback9 = (input, options) => {
      if (input.button !== 0)
        return;
      finishKeyNudge(), ref12.current?.contains(document.activeElement) && callback8(input.pointerType === "touch"), value9((input2) => input2 ?? {
        shade: memo32
      });
      let value18 = callback7(), flag = !1, callback18 = () => {
      }, callback19 = (input2) => {
        ref11.current.delete(callback20), ref11.current.size === 0 && value9(void 0), callback18(), flag && (flag = !1, value18(input2));
      }, callback20 = () => callback19(!1);
      callback18 = beginColorPickerPointerGesture(input, (input2, options2, context) => {
        options(input2, options2, context) && (flag = !0);
      }, () => callback19(!0)), ref11.current.add(callback20);
    }, callback10 = (input) => callback9(input, (input2, options, context) => callback5({
      ...ref.current,
      s: colorTrackFraction(input2, context),
      v: 1 - Math.max(0, Math.min(1, (options - context.top - 7) / (context.height - 14)))
    })), callback11 = (input) => callback9(input, (input2, options, context) => callback5({
      ...ref.current,
      h: colorTrackFraction(input2, context) * 360
    })), callback12 = (input) => callback9(input, (input2, options, context) => callback5({
      ...ref.current,
      a: colorTrackFraction(input2, context)
    })), callback13 = async () => {
      let value18 = await pickScreenColor();
      value18 && callback6({
        ...parseCssColorToHsva(value18),
        a: ref.current.a
      });
    }, callback14 = () => {
      if (ref2.current)
        return ref2.current = !1, !1;
      if (ref5.current && !ref9.current)
        return !1;
      let value18 = value4.trim();
      if (/^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value18)) {
        let value19 = parseCssColorToHsva(value18.startsWith("#") ? value18 : "#" + value18), length = value18.replace(/^#/, "").length;
        return callback6(length === 4 || length === 8 ? value19 : {
          ...value19,
          a: value2.a
        });
      }
      return value5(hsvaToHexColor(value2)), !1;
    }, callback15 = () => {
      if (ref2.current)
        return ref2.current = !1, !1;
      let value18 = parseFloat(value6);
      return isNaN(value18) || Math.round(value18) === Math.round(value2.a * 100) ? (value7(Math.round(value2.a * 100).toString()), !1) : callback6({
        ...value2,
        a: Math.max(0, Math.min(1, value18 / 100))
      });
    }, value11 = hsvaToCssColor({
      ...value2,
      a: 1
    }), value12 = rgbaHexColor(value2), value13 = contrast === void 0 ? void 0 : JSON.stringify(contrast), memo4 = reactForUiColorPicker.useMemo(() => contrast, [value13]), memo22 = reactForUiColorPicker.useMemo(() => memo4 === void 0 ? void 0 : (0, runtime2.colorContrastResults)(value12, memo4), [memo4, value12]), memo32 = reactForUiColorPicker.useMemo(() => memo4 === void 0 || value10 ? void 0 : (0, runtime2.contrastColorFix)(value12, memo4), [memo4, value12, value10]), value14 = value8 !== void 0 ? value8.shade : memo32, value15 = memo22 !== void 0 && value14 !== void 0;
    reactForUiColorPicker.useLayoutEffect(() => {
      ref13.current && (ref13.current = !1, value15 || ref3.current?.focus());
    }, [value15]);
    let callback16 = (input) => {
      memo32 !== void 0 && (callback6(parseCssColorToHsva(memo32.css)), callback8(input));
    }, callback17 = () => {
      ref13.current = !0;
    }, value16 = reactForUiColorPicker.useId(), sliderHintId = reactForUiColorPicker.useId(), roundedHue = Math.round(value2.h), value17 = memo22 === void 0 ? void 0 : value16;
    return jsxForUiColorPicker.jsxs("div", {
      className: "flex w-full min-w-56 flex-col",
      children: [
        jsxForUiColorPicker.jsx("div", {
          ...sliderProps(nudgeSaturationBrightness),
          "aria-label": "饱和度与亮度",
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": toPercent(value2.s),
          "aria-valuetext": `Saturation ${toPercent(value2.s)}%, brightness ${toPercent(value2.v)}%`,
          "aria-describedby": value17 === void 0 ? sliderHintId : sliderHintId + " " + value17,
          className: "relative aspect-[3/2] w-full touch-none rounded-md outline-none focus-visible:outline-hidden focus-visible:shadow-focus forced-colors:focus-visible:-outline-offset-2",
          style: {
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${value2.h}, 100%, 50%))`
          },
          onPointerDown: callback10,
          children: jsxForUiColorPicker.jsx("div", {
            className: "pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]",
            style: {
              left: `calc(${value2.s} * (100% - 14px) + 7px)`,
              top: `calc(${1 - value2.v} * (100% - 14px) + 7px)`,
              background: value11
            }
          })
        }),
        jsxForUiColorPicker.jsx("span", {
          id: sliderHintId,
          hidden: !0,
          children: "左右方向键调整饱和度，上下方向键调整亮度。"
        }),
        jsxForUiColorPicker.jsx("div", {
          ...sliderProps(nudgeHue),
          "aria-label": "色相",
          "aria-valuemin": 0,
          "aria-valuemax": 360,
          "aria-valuenow": roundedHue,
          "aria-valuetext": `${roundedHue} degree${roundedHue === 1 ? "" : "s"}, ${hueName(roundedHue)}`,
          "aria-describedby": value17,
          className: "group/slider relative touch-none pt-2 pb-1 outline-none focus-visible:outline-hidden forced-colors:focus-visible:-outline-offset-2 pointer-coarse:py-3.5",
          onPointerDown: callback11,
          children: jsxForUiColorPicker.jsx("div", {
            className: "relative h-3 w-full rounded-md bg-[linear-gradient(to_right,#f00_0%,#ff0_17%,#0f0_33%,#0ff_50%,#00f_67%,#f0f_83%,#f00_100%)] group-focus-visible/slider:shadow-focus",
            children: jsxForUiColorPicker.jsx("div", {
              className: "pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]",
              style: {
                left: `calc(${value2.h / 360} * (100% - 14px) + 7px)`,
                background: `hsl(${value2.h}, 100%, 50%)`
              }
            })
          })
        }),
        !opaque && jsxForUiColorPicker.jsx("div", {
          ...sliderProps(nudgeAlpha),
          "aria-label": "透明度",
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": toPercent(value2.a),
          "aria-valuetext": `${toPercent(value2.a)}% opaque`,
          "aria-describedby": value17,
          className: "group/slider relative touch-none pt-1 pb-2 outline-none focus-visible:outline-hidden forced-colors:focus-visible:-outline-offset-2 pointer-coarse:py-3.5",
          onPointerDown: callback12,
          children: jsxForUiColorPicker.jsx("div", {
            className: "relative h-3 w-full rounded-md group-focus-visible/slider:shadow-focus",
            style: {
              background: `linear-gradient(to right, transparent, ${value11}), ${COLOR_ALPHA_CHECKERBOARD}`
            },
            children: jsxForUiColorPicker.jsx("div", {
              className: "pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]",
              style: {
                left: `calc(${value2.a} * (100% - 14px) + 7px)`,
                background: hsvaToCssColor(value2)
              }
            })
          })
        }),
        jsxForUiColorPicker.jsxs("div", {
          className: `${opaque ? "mt-1" : "pointer-coarse:mt-1"} flex items-center gap-2`,
          children: [
            isEyeDropperAvailable() && jsxForUiColorPicker.jsx("button", {
              type: "button",
              title: "从屏幕取色",
              "aria-label": "从屏幕取色",
              onClick: callback13,
              className: "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted outline-none hover:bg-alpha-1 hover:text-primary focus-visible:outline-hidden focus-visible:shadow-focus pointer-coarse:h-10 pointer-coarse:w-10",
              children: jsxForUiColorPicker.jsx(runtime2.Icon, {
                name: "EyeDropper",
                size: "sm"
              })
            }),
            jsxForUiColorPicker.jsxs("div", {
              className: "flex h-6 min-w-0 flex-1 items-center rounded bg-fill-field shadow-field-ring transition duration-fast hover:not-focus-within:shadow-field-hover has-[:focus-visible]:shadow-focus pointer-coarse:h-10",
              children: [
                jsxForUiColorPicker.jsx("input", {
                  ref: (input) => {
                    ref3.current = input, (0, runtime2.markKitField)(input);
                  },
                  className: "h-full min-w-0 flex-1 bg-transparent px-1.5 font-mono text-[11px] text-primary outline-none focus-visible:outline-hidden",
                  value: value4,
                  "aria-label": "十六进制颜色",
                  "aria-describedby": value17,
                  onChange: (event) => {
                    ref9.current = !0, value5(event.target.value);
                  },
                  onFocus: () => {
                    ref9.current = !1;
                  },
                  onBlur: (input) => callback4(input, callback14()),
                  onKeyDown: (event) => {
                    if (event.key === "Enter")
                      event.target.blur();
                    else if (event.key === "Escape") {
                      if (!ref9.current && value4 === hsvaToHexColor(value2) && !event.repeat)
                        return;
                      ref2.current = !0, value5(hsvaToHexColor(value2)), (0, runtime2.reselectKitField)(event.currentTarget);
                    }
                    event.stopPropagation();
                  }
                }),
                !opaque && jsxForUiColorPicker.jsxs(jsxForUiColorPicker.Fragment, {
                  children: [
                    jsxForUiColorPicker.jsx("div", {
                      className: "my-1 w-px shrink-0 self-stretch bg-alpha-2"
                    }),
                    jsxForUiColorPicker.jsx("input", {
                      ref: (input) => {
                        ref4.current = input, (0, runtime2.markKitField)(input);
                      },
                      className: "h-full w-[34px] bg-transparent pl-1.5 pr-1 text-right font-mono text-[11px] text-primary outline-none focus-visible:outline-hidden pointer-coarse:w-[46px]",
                      value: value6,
                      "aria-label": "不透明度百分比",
                      "aria-describedby": value17,
                      onChange: (event) => value7(event.target.value),
                      onBlur: (input) => callback4(input, callback15()),
                      onKeyDown: (event) => {
                        if (event.key === "Enter")
                          event.target.blur();
                        else if (event.key === "Escape") {
                          if (value6 === Math.round(value2.a * 100).toString() && !event.repeat)
                            return;
                          ref2.current = !0, value7(Math.round(value2.a * 100).toString()), (0, runtime2.reselectKitField)(event.currentTarget);
                        }
                        event.stopPropagation();
                      }
                    }),
                    jsxForUiColorPicker.jsx("span", {
                      className: "pr-1.5 text-[10px] text-muted",
                      children: "%"
                    })
                  ]
                })
              ]
            })
          ]
        }),
        memo22 !== void 0 ? jsxForUiColorPicker.jsx(runtime2.ContrastColorDetails, {
          fg: value12,
          results: memo22,
          sentenceId: value16,
          ...value15 ? {
            fix: {
              css: value14.css,
              ratio: value14.ratio,
              ground: value14.ground.label,
              onUse: callback16
            },
            fixHeld: value10,
            fixRef: ref12,
            onFixGoneFocused: callback17
          } : {}
        }) : null
      ]
    });
  }
  return bindRuntimeValue(runtime2, "joinPickerClasses", () => joinPickerClasses), bindRuntimeValue(runtime2, "normalizedRgbToHsva", () => normalizedRgbToHsva), bindRuntimeValue(runtime2, "parseCssColorToHsva", () => parseCssColorToHsva), bindRuntimeValue(runtime2, "hsvaToCssColor", () => hsvaToCssColor), bindRuntimeValue(runtime2, "hsvaToHexColor", () => hsvaToHexColor), bindRuntimeValue(runtime2, "rgbaHexColor", () => rgbaHexColor), bindRuntimeValue(runtime2, "isEyeDropperAvailable", () => isEyeDropperAvailable), bindRuntimeValue(runtime2, "pickScreenColor", () => pickScreenColor), bindRuntimeValue(runtime2, "beginColorPickerPointerGesture", () => beginColorPickerPointerGesture), bindRuntimeValue(runtime2, "colorTrackFraction", () => colorTrackFraction), bindRuntimeValue(runtime2, "ColorPickerLabel", () => ColorPickerLabel), bindRuntimeValue(runtime2, "ColorPickerGroup", () => ColorPickerGroup), bindRuntimeValue(runtime2, "ColorPickerHeader", () => ColorPickerHeader), bindRuntimeValue(runtime2, "SwatchDot", () => SwatchDot), bindRuntimeValue(runtime2, "SwatchButton", () => SwatchButton), bindRuntimeValue(runtime2, "ColorHexInput", () => ColorHexInput), bindRuntimeValue(runtime2, "ColorPicker", () => ColorPicker), bindRuntimeValue(runtime2, "reactForUiColorPicker", () => reactForUiColorPicker, (value) => {
    reactForUiColorPicker = value;
  }), bindRuntimeValue(runtime2, "jsxForUiColorPicker", () => jsxForUiColorPicker, (value) => {
    jsxForUiColorPicker = value;
  }), bindRuntimeValue(runtime2, "COLOR_ALPHA_CHECKERBOARD", () => COLOR_ALPHA_CHECKERBOARD, (value) => {
    COLOR_ALPHA_CHECKERBOARD = value;
  }), bindRuntimeValue(runtime2, "COLOR_SWATCH_BUTTON_CLASS", () => COLOR_SWATCH_BUTTON_CLASS, (value) => {
    COLOR_SWATCH_BUTTON_CLASS = value;
  }), bindRuntimeValue(runtime2, "COLOR_PICKER_POPOVER_HEIGHT", () => COLOR_PICKER_POPOVER_HEIGHT, (value) => {
    COLOR_PICKER_POPOVER_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "COLOR_PICKER_POPOVER_CLASS", () => COLOR_PICKER_POPOVER_CLASS, (value) => {
    COLOR_PICKER_POPOVER_CLASS = value;
  }), bindRuntimeValue(runtime2, "initializeUiColorPicker", () => initializeUiColorPicker, (value) => {
    initializeUiColorPicker = value;
  }), () => {
    SLIDER_KEY_STEPS = /* @__PURE__ */ new Map([
      ["ArrowLeft", [-1, 0]],
      ["ArrowRight", [1, 0]],
      ["ArrowUp", [0, 1]],
      ["ArrowDown", [0, -1]],
      ["PageUp", [0, 10]],
      ["PageDown", [0, -10]],
      ["Home", [-1 / 0, 0]],
      ["End", [1 / 0, 0]]
    ]), HUE_NAME_STOPS = [
      [15, "red"],
      [45, "orange"],
      [80, "yellow"],
      [165, "green"],
      [195, "cyan"],
      [265, "blue"],
      [290, "purple"],
      [320, "magenta"],
      [345, "pink"],
      [1 / 0, "red"]
    ], COLOR_ALPHA_CHECKERBOARD = "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 / 8px 8px", COLOR_SWATCH_BUTTON_CLASS = "flex h-8 w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2 text-left outline-none pointer-coarse:h-10", COLOR_PICKER_POPOVER_HEIGHT = 440, COLOR_PICKER_POPOVER_CLASS = "w-64 p-4", initializeUiColorPicker = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiContrastControls)(), (0, runtime2.initializeKitFieldUndo)(), (0, runtime2.initializeUiPropertyFocus)(), reactForUiColorPicker = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiColorPicker = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiColorPicker
};
