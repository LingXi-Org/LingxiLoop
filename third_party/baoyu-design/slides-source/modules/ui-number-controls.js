// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiNumberControls(runtime2) {
  var initializeNumberScrubNoop, reactForUiNumberControls, activeNumberScrubCleanup, initializeUiNumberControls, reactForUiNumberControls2, jsxForUiNumberControls, PROPERTY_NUMBER_FORMAT_OPTIONS, propertyNumberFormatter, NUMBER_MINUS_SIGNS, NUMBER_PLUS_SIGNS, PROPERTY_NUMBER_UNIT_CLASS, PROPERTY_NUMBER_INPUT_CLASS, PROPERTY_NUMBER_STEPPER_CLASS, initializeUiNumberControls2;
  function decimalPlaces(value) {
    let value2 = String(value), value3 = value2.indexOf(".");
    return value3 === -1 || value2.includes("e") ? 0 : value2.length - value3 - 1;
  }
  function roundScrubValue(value, step) {
    let value2 = 10 ** scrubPrecision(step);
    return Math.round(value * value2) / value2;
  }
  function scrubPrecision(step) {
    return Math.max(2, decimalPlaces(step), Math.ceil(-Math.log10(Math.max(step, Number.EPSILON))));
  }
  function snapScrubValue(value, step, origin) {
    if (!(step > 0) || !Number.isFinite(step) || !Number.isFinite(value))
      return value + 0;
    let value2 = origin == null && Number.isInteger(step) ? 1 : step, value3 = origin ?? 0, value4 = (value - value3) / value2, value5 = Math.round(Number(value4.toPrecision(12))), value6 = 10 ** Math.max(scrubPrecision(value2), decimalPlaces(value3)), value7 = Math.round((value5 * value2 + value3) * value6) / value6 + 0;
    if (Math.abs(value4) < 1e12 && Number.isFinite(value7))
      return value7;
    let value8 = roundScrubValue(value, step) + 0;
    return Number.isFinite(value8) ? value8 : value + 0;
  }
  function steppedNumberValue(value, direction, event, options = {}) {
    let value2 = options.step ?? 1, value3 = Math.min(0.1, value2), value4 = event.altKey ? value3 : value2 * (event.shiftKey ? 10 : 1), value5 = roundScrubValue(value + direction * value4, value2);
    return options.min != null && (value5 = Math.max(options.min, value5)), options.max != null && (value5 = Math.min(options.max, value5)), value5;
  }
  function createNumberScrubGesture(getOptions, startX) {
    let value = startX, value2 = null, flag = !1;
    return {
      move(input, options) {
        let value3 = getOptions(), value4 = input - value;
        if (value = input, !flag) {
          if (value4 === 0)
            return;
          flag = !0, value3.onScrubbing?.(!0);
        }
        value2 == null && (value2 = Number.isFinite(value3.value) ? value3.value : 0);
        let value5 = value3.step ?? 1, callback = (input2) => Math.min(value3.max ?? 1 / 0, Math.max(value3.min ?? -1 / 0, input2));
        value2 = callback(value2 + value4 * value5 * (options ? 10 : 1));
        let value6 = value2 === value3.min || value2 === value3.max ? value2 : callback(snapScrubValue(value2, value5, value3.origin));
        value3.onScrub(value6 + 0);
      },
      up() {
        if (!flag)
          return;
        let value3 = getOptions();
        value3.onScrubbing?.(!1), value3.onScrubEnd?.();
      },
      get live() {
        return flag;
      }
    };
  }
  function useNumberScrubGesture(options) {
    let ref = reactForUiNumberControls.useRef(options);
    ref.current = options;
    let ref2 = reactForUiNumberControls.useRef(null);
    return reactForUiNumberControls.useEffect(() => () => {
      ref2.current && ref2.current === activeNumberScrubCleanup && ref2.current();
    }, []), (event) => {
      if (ref.current.disabled || event.button !== 0)
        return;
      event.preventDefault();
      let activeElement2 = document.activeElement;
      activeElement2 && activeElement2 !== event.currentTarget && (activeElement2.tagName === "INPUT" || activeElement2.tagName === "TEXTAREA") && activeElement2.blur?.(), ref2.current = attachNumberScrubGesture(createNumberScrubGesture(() => ref.current, event.clientX));
    };
  }
  function captureNumberScrubPointer(event) {
    if (!(event.button !== 0 || event.pointerType === "touch"))
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
      }
  }
  function attachNumberScrubGesture(gesture, ownWindow = window) {
    activeNumberScrubCleanup?.();
    let callback = (input) => {
      let value = input;
      if (value.buttons === 0) {
        callback3();
        return;
      }
      gesture.move(value.clientX, value.shiftKey);
    }, callback2 = (event) => {
      event.key === "Escape" && (gesture.live && event.preventDefault(), callback3());
    }, callback3 = () => {
      activeNumberScrubCleanup === callback3 && (activeNumberScrubCleanup = null), ownWindow.removeEventListener("mousemove", callback), ownWindow.removeEventListener("mouseup", callback3), ownWindow.removeEventListener("blur", callback3), ownWindow.removeEventListener("keydown", callback2, !0), gesture.up();
    };
    return activeNumberScrubCleanup = callback3, ownWindow.addEventListener("mousemove", callback), ownWindow.addEventListener("mouseup", callback3), ownWindow.addEventListener("blur", callback3), ownWindow.addEventListener("keydown", callback2, !0), callback3;
  }
  function numberInputDecimalPlaces(value) {
    let value2 = String(value), value3 = value2.indexOf(".");
    return value3 === -1 || value2.includes("e") ? 0 : value2.length - value3 - 1;
  }
  function acceptsNumberFieldKey(key, input, allowMinus) {
    if (/^[0-9٠-٩۰-۹０-９零〇一二三四五六七八九,．，٫٬]$/.test(key))
      return !0;
    let rest = input.value.slice(0, input.selectionStart ?? 0) + input.value.slice(input.selectionEnd ?? 0);
    return key === "." ? !rest.includes(".") : (key.search(NUMBER_PLUS_SIGNS) === 0 || allowMinus && key.search(NUMBER_MINUS_SIGNS) === 0) && rest.search(NUMBER_PLUS_SIGNS) === -1 && rest.search(NUMBER_MINUS_SIGNS) === -1;
  }
  function parseTypedNumber(text, ownUnit) {
    let normalized = text.replace(/[٠-٩۰-۹０-９]/g, (digit) => String(digit.charCodeAt(0) % 16)).replace(/[．٫]/g, ".").replace(NUMBER_MINUS_SIGNS, "-").replace(NUMBER_PLUS_SIGNS, "+"), withoutPercent = ownUnit === "%" ? normalized.replace(/([\d.])\s*%\s*$/, "$1") : normalized, match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))([^\p{N}零〇一二三四五六七八九.,，٬+%٪％﹪‰‱-]*)$/u.exec(withoutPercent), parsed = Number(match?.[1]);
    return match !== null && Number.isFinite(parsed) ? {
      n: parsed + 0,
      unit: withoutPercent === normalized ? (match[2] ?? "").normalize("NFKC").trim() : "%"
    } : null;
  }
  function PropertyNumberInput({ value, onValue, onScrub, onScrubEnd, prefix, unit, unitScrubs = !0, refuseLetters = !1, ownUnit = typeof unit == "string" ? unit : void 0, min: min2, max: max2, step, scrubOrigin, smallStep, emptyStepFrom, placeholder, hint, clearable, mixed = !1, steppers = !0, fullWidth = !0, disabled: disabled2, title, "aria-label": ariaLabel, inputRef, className }) {
    let ref = reactForUiNumberControls2.useRef(null), callback = reactForUiNumberControls2.useCallback((input) => {
      ref.current = input, (0, runtime2.markKitField)(input), typeof inputRef == "function" ? inputRef(input) : inputRef && (inputRef.current = input);
    }, [inputRef]), value2 = unit != null && unit !== !1 && unit !== "", value3 = value === void 0 && !mixed && emptyStepFrom !== null && placeholder !== void 0 && /^-?\d+(\.\d+)?$/.test(placeholder) ? Number(placeholder) : void 0, value4 = value ?? value3, isEmptyText = (text) => text === "" || (value4 === void 0 || mixed === !0) && text.trim() === "", ref2 = reactForUiNumberControls2.useRef(!1), revertHit = reactForUiNumberControls2.useRef(!1), ref3 = reactForUiNumberControls2.useRef(!1), ref4 = reactForUiNumberControls2.useRef(!1), ref5 = reactForUiNumberControls2.useRef(""), typed = reactForUiNumberControls2.useRef(!1), ref6 = reactForUiNumberControls2.useRef(!1), pendingText = reactForUiNumberControls2.useRef(null), callback2 = (unitText = "") => {
      let value14 = (unitText || ref5.current).toLowerCase();
      return ref5.current = "", typed.current = !1, !refuseLetters || !value14 || value14 === (ownUnit ?? "").toLowerCase() ? !1 : (ref4.current && (ref6.current = !0), !0);
    }, value5 = step ?? 1, value6 = smallStep ?? Math.min(0.1, value5), value7 = ariaLabel || (typeof prefix == "string" && prefix !== "" ? prefix : void 0), callback3 = (input, unitText = "") => {
      if (ref2.current) {
        revertHit.current = !0;
        return;
      }
      if (callback2(unitText)) {
        (0, runtime2.announceLiveMessage)((0, runtime2.numberChangeRefusalMessage)(value7, ownUnit));
        return;
      }
      if (input === null) {
        if (ref.current?.value !== "")
          return;
        clearable && !mixed && value !== void 0 && !(ref4.current && emptyStepFrom !== void 0) && onValue(void 0);
        return;
      }
      value === void 0 && min2 !== void 0 && (input = Math.max(min2, input)), value === void 0 && max2 !== void 0 && (input = Math.min(max2, input)), (mixed || input !== value) && onValue(input);
    }, revertField = (input) => {
      ref2.current = !0, (0, runtime2.reselectKitField)(input), ref2.current = !1;
    }, revertFieldSoon = (input) => queueMicrotask(() => void (input.ownerDocument.activeElement === input && revertField(input))), clampValue = (input) => Math.min(max2 ?? Number.MAX_SAFE_INTEGER, Math.max(min2 ?? Number.MIN_SAFE_INTEGER, input)), stepFrom = (from, direction, options) => {
      let value19 = options.altKey ? value6 : value5 * (options.shiftKey ? 10 : 1), value20 = Math.min(20, Math.max(numberInputDecimalPlaces(from), numberInputDecimalPlaces(value5), options.altKey ? numberInputDecimalPlaces(value6) : 0));
      return clampValue(Number((from + direction * value19).toFixed(value20)));
    }, callback4 = (event) => {
      ref3.current = !1, ref6.current = !1;
      let composing = event.nativeEvent.isComposing || event.keyCode === 229;
      if (!event.metaKey && !event.ctrlKey && !event.altKey && (/^[a-zA-Z%]$/.test(event.key) && typed.current ? ref5.current += event.key : /^[0-9.\-]$/.test(event.key) && (ref5.current = "")), event.key === "Enter") {
        event.preventDefault();
        let current = ref.current;
        current?.blur(), current?.focus(), current?.select(), ref3.current = !0, queueMicrotask(() => {
          !ref3.current || !current || (ref3.current = !1, current.ownerDocument.activeElement === current && current.select());
        });
        return;
      }
      if (event.key === "Escape") {
        if (ref5.current = "", event.repeat)
          return event.preventDefault();
        let field = event.currentTarget, unchanged = field.value === (value4 === void 0 || mixed ? "" : propertyNumberFormatter.format(value4));
        revertHit.current = !1, revertField(field), !revertHit.current && !unchanged && revertFieldSoon(field), (revertHit.current || !unchanged) && event.preventDefault();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        let field = event.currentTarget, direction = event.key === "ArrowUp" ? 1 : -1, skipParse = composing || field.value === (value4 === void 0 || mixed ? "" : propertyNumberFormatter.format(value4)), parsed = skipParse ? null : parseTypedNumber(field.value, ownUnit), unparsable = !skipParse && parsed === null && field.value.trim() !== "";
        if (parsed !== null || unparsable || emptyStepFrom !== void 0 && isEmptyText(field.value)) {
          let preventBaseUIHandler = event.preventBaseUIHandler;
          if (preventBaseUIHandler && preventBaseUIHandler.call(event), event.preventDefault(), event.stopPropagation(), unparsable)
            revertHit.current = !1, revertField(field), revertHit.current || revertFieldSoon(field), (0, runtime2.announceLiveMessage)((0, runtime2.numberChangeRefusalMessage)(value7, ownUnit));
          else if (parsed === null)
            callback7(direction, event);
          else {
            let next = stepFrom(parsed.n, direction, event), refused = callback2(parsed.unit);
            revertField(field), refused ? (0, runtime2.announceLiveMessage)((0, runtime2.numberChangeRefusalMessage)(value7, ownUnit)) : callback3(next);
          }
        }
        let current = ref.current;
        ref3.current = !0, setTimeout(() => {
          !ref3.current || !current || (ref3.current = !1, current.ownerDocument.activeElement === current && current.select());
        }, 0);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        let preventBaseUIHandler = event.preventBaseUIHandler;
        preventBaseUIHandler ? preventBaseUIHandler.call(event) : event.preventDefault(), event.stopPropagation();
        return;
      }
      event.key.length === 1 && !composing && !event.metaKey && !event.ctrlKey && !event.altKey && !acceptsNumberFieldKey(event.key, event.currentTarget, min2 === void 0 || min2 < 0) && event.preventDefault(), (event.key !== "F6" || composing) && event.stopPropagation();
    }, value8 = value ?? (typeof emptyStepFrom == "number" && Number.isFinite(emptyStepFrom) ? emptyStepFrom : onScrub ? value3 : void 0), value9 = !disabled2 && !mixed && value8 !== void 0, [value10, value11] = reactForUiNumberControls2.useState(null), value12 = useNumberScrubGesture({
      value: value8 ?? NaN,
      step,
      min: min2,
      max: max2,
      origin: scrubOrigin,
      disabled: !value9,
      onScrub: (input) => {
        value11((input2) => ({
          from: input2 ? input2.from : value,
          v: input,
          hostMoved: !!input2 && (input2.hostMoved || !Object.is(value, input2.from))
        })), (onScrub ?? onValue)(input);
      },
      onScrubEnd: () => {
        value11(null), onScrubEnd?.();
      }
    }), callback5 = (input) => {
      value12(input), input.stopPropagation();
    }, callback6 = () => {
      let current = ref.current;
      if (current) {
        if (ref6.current = !1, current.ownerDocument.activeElement === current) {
          ref4.current = !0;
          try {
            current.blur();
          } finally {
            ref4.current = !1;
          }
        }
        current.focus({
          preventScroll: !0
        });
      }
    }, callback7 = (input, options) => {
      let value14 = value4 === void 0 || mixed ? "" : propertyNumberFormatter.format(value4), callback8 = () => ref6.current ? (ref6.current = !1, ref5.current = "", !0) : !1;
      if (callback8())
        return;
      let current = ref.current, wasTyped = typed.current;
      if (current && current.ownerDocument.activeElement === current && (current.value !== value14 || wasTyped) && callback6(), callback8())
        return;
      ref5.current = "";
      let value15 = ref.current?.value ?? "", value16 = value15 !== value14 || wasTyped ? Number.parseFloat(value15) : Number.NaN, value17 = mixed || isEmptyText(value15);
      if (value17 && !Number.isFinite(value16) && emptyStepFrom === null)
        return;
      let value18 = Number.isFinite(value16) ? value16 : value17 ? emptyStepFrom ?? min2 ?? 0 : value4 ?? 0, value21 = stepFrom(value18, input, options);
      (mixed || value21 !== value4) && onValue(value21);
    }, state = {
      ref: callback,
      value: mixed ? null : (value10 && !value10.hostMoved && Object.is(value10.from, value) ? value10.v : value4) ?? null,
      onValueCommitted: (input) => callback3(input),
      min: min2,
      max: max2,
      step: value5,
      largeStep: value5 * 10,
      smallStep: value6,
      format: PROPERTY_NUMBER_FORMAT_OPTIONS,
      locale: "en-US",
      inputMode: "decimal",
      "aria-label": value7,
      disabled: disabled2,
      placeholder: mixed ? runtime2.MIXED_LABEL : placeholder ?? hint,
      onKeyDown: callback4,
      onFocus: (event) => {
        event.preventDefault(), event.currentTarget.select(), ref5.current = "", typed.current = !1;
      },
      onInput: () => void (typed.current = !0)
    }, value13 = steppers;
    return jsxForUiNumberControls.jsx(runtime2.NumberInput, {
      ...state,
      onValueChange: (input, details) => {
        pendingText.current = input === null && ref.current?.value || null, pendingText.current !== null && details.cancel();
      },
      onBlur: (event) => {
        let text = event.currentTarget.value, rescued = text === pendingText.current && text.trim() !== "";
        if (pendingText.current = null, !rescued)
          return;
        let parsed = parseTypedNumber(text, ownUnit);
        parsed !== null ? callback3(clampValue(parsed.n), parsed.unit) : ref2.current || (ref4.current && (ref6.current = !0), (0, runtime2.announceLiveMessage)((0, runtime2.numberChangeRefusalMessage)(value7, ownUnit)));
      },
      title,
      fullWidth,
      className: (0, runtime2.joinClassNames)("group/field min-w-12", !mixed && value3 === void 0 && placeholder !== void 0 && placeholder !== runtime2.MIXED_LABEL && "[&_input]:placeholder:text-primary", className),
      slotStart: prefix !== void 0 && prefix !== "" ? jsxForUiNumberControls.jsx("span", {
        "data-scrub": "",
        onMouseDown: value9 ? callback5 : void 0,
        onPointerDown: value9 ? captureNumberScrubPointer : void 0,
        className: (0, runtime2.joinClassNames)(PROPERTY_NUMBER_UNIT_CLASS, "inline-flex items-center text-caption-medium", value9 && "cursor-ew-resize"),
        children: prefix
      }) : void 0,
      slotEnd: value2 || value13 ? jsxForUiNumberControls.jsxs("span", {
        className: "flex items-center gap-2",
        children: [
          value2 ? jsxForUiNumberControls.jsx("span", {
            "data-scrub": "",
            onMouseDown: value9 && unitScrubs ? callback5 : void 0,
            onPointerDown: value9 && unitScrubs ? captureNumberScrubPointer : void 0,
            className: (0, runtime2.joinClassNames)(PROPERTY_NUMBER_INPUT_CLASS, value9 && unitScrubs && "cursor-ew-resize"),
            children: unit
          }) : null,
          value13 ? jsxForUiNumberControls.jsxs("span", {
            className: "hidden flex-col group-focus-within/field:flex pointer-coarse:hidden!",
            children: [
              jsxForUiNumberControls.jsx("button", {
                type: "button",
                tabIndex: -1,
                "aria-label": value7 ? runtime2.INCREASE_LABEL + " " + value7 : runtime2.INCREASE_LABEL,
                className: PROPERTY_NUMBER_STEPPER_CLASS,
                disabled: disabled2,
                onMouseDown: (event) => {
                  event.preventDefault(), event.button === 0 && callback6();
                },
                onMouseLeave: () => ref6.current = !1,
                onClick: (input) => callback7(1, input),
                children: jsxForUiNumberControls.jsx(runtime2.KitIcon, {
                  name: "CaretUp",
                  size: 12
                })
              }),
              jsxForUiNumberControls.jsx("button", {
                type: "button",
                tabIndex: -1,
                "aria-label": value7 ? runtime2.DECREASE_LABEL + " " + value7 : runtime2.DECREASE_LABEL,
                className: PROPERTY_NUMBER_STEPPER_CLASS,
                disabled: disabled2,
                onMouseDown: (event) => {
                  event.preventDefault(), event.button === 0 && callback6();
                },
                onMouseLeave: () => ref6.current = !1,
                onClick: (input) => callback7(-1, input),
                children: jsxForUiNumberControls.jsx(runtime2.KitIcon, {
                  name: "CaretDown",
                  size: 12
                })
              })
            ]
          }) : null
        ]
      }) : void 0
    });
  }
  return bindRuntimeValue(runtime2, "decimalPlaces", () => decimalPlaces), bindRuntimeValue(runtime2, "roundScrubValue", () => roundScrubValue), bindRuntimeValue(runtime2, "scrubPrecision", () => scrubPrecision), bindRuntimeValue(runtime2, "snapScrubValue", () => snapScrubValue), bindRuntimeValue(runtime2, "steppedNumberValue", () => steppedNumberValue), bindRuntimeValue(runtime2, "initializeNumberScrubNoop", () => initializeNumberScrubNoop, (value) => {
    initializeNumberScrubNoop = value;
  }), bindRuntimeValue(runtime2, "createNumberScrubGesture", () => createNumberScrubGesture), bindRuntimeValue(runtime2, "useNumberScrubGesture", () => useNumberScrubGesture), bindRuntimeValue(runtime2, "captureNumberScrubPointer", () => captureNumberScrubPointer), bindRuntimeValue(runtime2, "attachNumberScrubGesture", () => attachNumberScrubGesture), bindRuntimeValue(runtime2, "reactForUiNumberControls", () => reactForUiNumberControls, (value) => {
    reactForUiNumberControls = value;
  }), bindRuntimeValue(runtime2, "activeNumberScrubCleanup", () => activeNumberScrubCleanup, (value) => {
    activeNumberScrubCleanup = value;
  }), bindRuntimeValue(runtime2, "initializeUiNumberControls", () => initializeUiNumberControls, (value) => {
    initializeUiNumberControls = value;
  }), bindRuntimeValue(runtime2, "numberInputDecimalPlaces", () => numberInputDecimalPlaces), bindRuntimeValue(runtime2, "acceptsNumberFieldKey", () => acceptsNumberFieldKey), bindRuntimeValue(runtime2, "parseTypedNumber", () => parseTypedNumber), bindRuntimeValue(runtime2, "NUMBER_MINUS_SIGNS", () => NUMBER_MINUS_SIGNS, (value) => {
    NUMBER_MINUS_SIGNS = value;
  }), bindRuntimeValue(runtime2, "NUMBER_PLUS_SIGNS", () => NUMBER_PLUS_SIGNS, (value) => {
    NUMBER_PLUS_SIGNS = value;
  }), bindRuntimeValue(runtime2, "PropertyNumberInput", () => PropertyNumberInput), bindRuntimeValue(runtime2, "reactForUiNumberControls2", () => reactForUiNumberControls2, (value) => {
    reactForUiNumberControls2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiNumberControls", () => jsxForUiNumberControls, (value) => {
    jsxForUiNumberControls = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_NUMBER_FORMAT_OPTIONS", () => PROPERTY_NUMBER_FORMAT_OPTIONS, (value) => {
    PROPERTY_NUMBER_FORMAT_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "propertyNumberFormatter", () => propertyNumberFormatter, (value) => {
    propertyNumberFormatter = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_NUMBER_UNIT_CLASS", () => PROPERTY_NUMBER_UNIT_CLASS, (value) => {
    PROPERTY_NUMBER_UNIT_CLASS = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_NUMBER_INPUT_CLASS", () => PROPERTY_NUMBER_INPUT_CLASS, (value) => {
    PROPERTY_NUMBER_INPUT_CLASS = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_NUMBER_STEPPER_CLASS", () => PROPERTY_NUMBER_STEPPER_CLASS, (value) => {
    PROPERTY_NUMBER_STEPPER_CLASS = value;
  }), bindRuntimeValue(runtime2, "initializeUiNumberControls2", () => initializeUiNumberControls2, (value) => {
    initializeUiNumberControls2 = value;
  }), () => {
    initializeNumberScrubNoop = () => {
    }, activeNumberScrubCleanup = null, initializeUiNumberControls = (0, runtime2.initializeOnce)(() => {
      initializeNumberScrubNoop(), reactForUiNumberControls = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), PROPERTY_NUMBER_UNIT_CLASS = "select-none text-muted", PROPERTY_NUMBER_STEPPER_CLASS = "flex h-2.5 w-3 items-center justify-center rounded-sm text-muted outline-none hover:text-primary disabled:opacity-50", initializeUiNumberControls2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeKitFieldUndo)(), initializeUiNumberControls(), (0, runtime2.initializeUiPropertyLabels)(), reactForUiNumberControls2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiNumberControls = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PROPERTY_NUMBER_FORMAT_OPTIONS = {
        useGrouping: !1
      }, propertyNumberFormatter = new Intl.NumberFormat("en-US", PROPERTY_NUMBER_FORMAT_OPTIONS), NUMBER_MINUS_SIGNS = /[-−－‒–—﹣]/g, NUMBER_PLUS_SIGNS = /[+＋﹢]/g, PROPERTY_NUMBER_INPUT_CLASS = PROPERTY_NUMBER_UNIT_CLASS + " text-caption";
    });
  };
}
export {
  installUiNumberControls
};
