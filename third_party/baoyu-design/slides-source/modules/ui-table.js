// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiTable(runtime2) {
  var reactd4, jsxy1, segmentedControlSegmentClasses, segmentedControlTextPaddingClasses, segmentedControlIconAspectClasses, segmentedControlVisualLayerClasses, segmentedControlFlexibleItemClasses, segmentedControlFullWidthItemClasses, segmentedControlTextClasses, ghostSegmentHoverClasses, segmentedControlThumbClasses, containedSegmentThumbClasses, ghostSegmentThumbClasses, SEGMENT_INDICATOR_SETTLE_MS, SEGMENT_INDICATOR_SETTLE_FRAMES, SEGMENT_TOOLTIP_DELAY_MS, segmentedControlResizeObservers, initializeUiTable, SELECTION_POINT_METRICS, initializeUiTable2, reactForUiTable, jsxForUiTable, SelectionPoints, initializeUiTable3, GRAB_CURSOR_CORNERS, RESIZE_CURSOR_CYCLE, GRAB_CURSOR_ANGLES, GRAB_CURSOR_MIME, GRAB_CURSOR_SVG_PREFIX, GRAB_CURSOR_SVG_PATH, GRAB_CURSOR_SVG_SUFFIX, initializeUiTable4, reactForUiTable2, jsxForUiTable2, SelectionRing, initializeUiTable5, DISAMBIGUATED_CURRENCY_CODES, CURRENCY_NUMBER_PART_TYPES, initializeUiTable6, reactForUiTable3, jsxForUiTable3, hydrationNoop, subscribeHydration, NumberInput, initializeUiTable7, reactDomForUiTable3, MINUS_SIGN_PATTERN, SIGN_PATTERN, EDGE_SPACE_PATTERN, PERCENT_SIGNS, ROUNDING_FORMAT_KEYS, LATIN_LIKE_NUMBERING_SYSTEMS, initializeUiTableNumberText;
  const NUMBER_SPACE_SEPARATORS = "    ", NUMBER_INPUT_FOCUS_CLASS = "has-[:focus-visible]:shadow-focus data-[invalid]:has-[:focus-visible]:shadow-focus-danger", FLOORED_COPY_CLASS = "cds-text-entry-floored before:invisible before:whitespace-pre before:content-[attr(data-copy)]";
  function observeSegmentedControlSize(input, options, context) {
    let value = (0, runtime2.getElementWindow)(input) ?? window, entry = segmentedControlResizeObservers.get(value);
    if (entry?.Observer !== options) {
      let entries = /* @__PURE__ */ new Map();
      entry = {
        Observer: options,
        observer: new options((input2) => {
          let items = [];
          for (let value4 of input2) {
            let entry2 = entries.get(value4.target);
            entry2 && (0, runtime2.invokeAndReportError)(() => entry2(!1, items));
          }
          for (let value4 of items)
            (0, runtime2.invokeAndReportError)(value4);
        }),
        measures: entries
      }, segmentedControlResizeObservers.set(value, entry);
    }
    let { observer: value2, measures: value3 } = entry;
    return value3.set(input, context), value2.observe(input), () => {
      value2.unobserve(input), value3.delete(input);
    };
  }
  function SegmentedControl({ segments, value, onChange, variant = "contained", size: size4, fullWidth = !1, disabled: disabled2, tooltipSide, tooltipClassName, "aria-label": ariaLabel, "aria-required": ariaRequired, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedby, thumbPosition, className }) {
    let ref = reactd4.useRef(null);
    (0, runtime2.useCompactableControlDebug)(ref, "SegmentedControl");
    let ref2 = reactd4.useRef(null), value2 = (0, runtime2.useHasFieldContext)(), value3 = (0, runtime2.useAppleKeyboard)(), ref3 = reactd4.useRef({
      live: !1,
      poll: null
    }), callback = reactd4.useCallback(function value8(input = !1, options) {
      let current = ref.current, current2 = ref2.current;
      if (!current || !current2)
        return;
      let element = current.querySelector("[data-checked]"), value9 = element ? measureScaledElementWidth(current) : null, value10 = null;
      if (!input || !(value9?.scaled || (0, runtime2.isImmediateFlipMarker)(current2))) {
        let value11 = element ? getRelativeSegmentBounds(element, current) : null;
        value10 = (0, runtime2.animateSegmentedControlThumb)(current2, current, value11, {
          correction: input
        });
      }
      let callback3 = () => {
        if (value10?.(), !ref3.current.live)
          return;
        let poll = ref3.current.poll;
        if (poll?.cancel(), ref3.current.poll = null, !value9 || !input && !poll && !value9.scaled)
          return;
        let { width: value11, still: value12, frames: value13 } = poll ?? {
          width: value9.width,
          still: 0,
          frames: 0
        };
        if (input && (value12 = value11 === value9.width ? value12 + 1 : 0, value11 = value9.width, value13 += 1, value12 >= (value9.scaled ? SEGMENT_INDICATOR_SETTLE_MS : SEGMENT_INDICATOR_SETTLE_FRAMES) || value13 >= SEGMENT_TOOLTIP_DELAY_MS))
          return;
        let value14 = scheduleElementAnimationFrame(current, () => value8(!0));
        value14 && (ref3.current.poll = {
          cancel: value14,
          width: value11,
          still: value12,
          frames: value13
        });
      };
      options ? options.push(callback3) : callback3();
    }, []), value4 = segments.map((input) => input.value).join("\0");
    reactd4.useLayoutEffect(() => {
      let current = ref.current, current2 = ref2.current, value8 = (0, runtime2.getResizeObserverConstructor)(current), value9 = current !== null && value8 !== void 0, current3 = ref3.current;
      current3.live = !0, (!value9 || current2 !== null && (0, runtime2.hasFlipAnimationMarker)(current2)) && callback();
      let value10 = value9 ? observeSegmentedControlSize(current, value8, callback) : null;
      return () => {
        value10?.(), current3.live = !1, current3.poll?.cancel();
      };
    }, [value, variant, fullWidth, value4, callback]), reactd4.useLayoutEffect(() => {
      if (!thumbPosition)
        return;
      let callback3 = (input) => {
        let current = ref.current, current2 = ref2.current;
        if (!(!current || !current2)) {
          if (input === null) {
            (0, runtime2.isImmediateFlipMarker)(current2) && callback();
            return;
          }
          (0, runtime2.pauseFlipAnimationAtProgress)(current2, input, () => Array.from(current.querySelectorAll('[role="radio"]'), (input2) => getRelativeSegmentBounds(input2, current)));
        }
      };
      callback3(thumbPosition.get());
      let value8 = thumbPosition.on("change", callback3);
      return () => {
        value8(), callback3(null);
      };
    }, [thumbPosition, callback]);
    let callback2 = reactd4.useCallback((input) => {
      onChange(input);
    }, [onChange]), value5 = variant === "contained", value6 = (0, runtime2.useHasTooltipProvider)(), value7 = jsxy1.jsxs(runtime2.baseRadioGroup, {
      ref,
      "data-cds": "SegmentedControl",
      "aria-label": ariaLabel,
      "aria-required": ariaRequired,
      "aria-invalid": ariaInvalid,
      "aria-describedby": ariaDescribedby,
      value,
      onValueChange: callback2,
      disabled: disabled2,
      ...(0, runtime2.getControlSizeAttributes)(size4),
      className: (0, runtime2.cn)("relative inline-flex", fullWidth ? "w-full" : "w-fit", "shrink-0 items-stretch h-control font-sans", value5 ? "rounded bg-[var(--cds-segmented-control-track)] p-px" : "gap-[1px]", className),
      children: [
        jsxy1.jsx("div", {
          "aria-hidden": !0,
          className: `pointer-events-none absolute inset-0 overflow-clip ${value5 ? "rounded" : ""}`,
          children: jsxy1.jsx("div", {
            ref: ref2,
            className: `${segmentedControlThumbClasses} ${value5 ? containedSegmentThumbClasses : ghostSegmentThumbClasses}`
          })
        }),
        segments.map((input) => {
          let value8 = input.icon && input.label === void 0, value9 = value8 ? input.tooltip ?? String(input.value) : input.tooltip, value10 = typeof input.tooltip == "string" ? input.tooltip : String(input.value), value11 = input.icon ? jsxy1.jsx(runtime2.Icon, {
            name: input.icon,
            size: "auto"
          }) : null, value12 = jsxy1.jsxs(runtime2.baseRadio.Root, {
            value: input.value,
            disabled: input.disabled,
            ...(0, runtime2.radioOptionTabIndex)(segments, value, input.value),
            "aria-label": value8 ? value10 : void 0,
            "aria-keyshortcuts": input.shortcut ? (0, runtime2.shortcutToAriaKeyShortcuts)(input.shortcut, value3) : void 0,
            onMouseDown: (0, runtime2.withRepeatedClickSelectionPrevention)(void 0),
            className: `${segmentedControlSegmentClasses} ${value5 ? segmentedControlTextClasses : ghostSegmentHoverClasses} ${value8 ? segmentedControlIconAspectClasses : segmentedControlTextPaddingClasses}${fullWidth ? " flex-1" : ""}`,
            children: [
              value11 && input.indicator ? jsxy1.jsxs("span", {
                className: "grid",
                children: [
                  jsxy1.jsx("span", {
                    className: "col-start-1 row-start-1 [--seg-dot-r:calc(0.1875rem*var(--cds-rem-scale,1))] [--seg-dot-x:calc(100%_-_var(--seg-dot-r)_+_1px)] [&:dir(rtl)]:[--seg-dot-x:calc(var(--seg-dot-r)_-_1px)] not-forced-colors:has-[~[data-cds-part=indicator]>*]:[mask-image:radial-gradient(circle_at_var(--seg-dot-x)_calc(var(--seg-dot-r)_-_1px),transparent_calc(var(--seg-dot-r)_+_2px),black_calc(var(--seg-dot-r)_+_2.5px))]",
                    children: value11
                  }),
                  jsxy1.jsx("span", {
                    "aria-hidden": !0,
                    "data-cds-part": "indicator",
                    className: "relative col-start-1 row-start-1 -me-px -mt-px self-start justify-self-end has-[>[data-cds=Pulse]]:[--cds-page-bg:transparent]",
                    children: input.indicator
                  })
                ]
              }) : value11,
              input.label
            ]
          }), value13 = input.disabled && input.disabledReason ? jsxy1.jsx(runtime2.DisabledReasonTooltip, {
            reason: input.disabledReason,
            side: tooltipSide,
            hoverable: !1,
            wrapperClassName: fullWidth ? `${segmentedControlVisualLayerClasses} ${value8 ? segmentedControlFullWidthItemClasses : segmentedControlFlexibleItemClasses}` : segmentedControlVisualLayerClasses,
            children: value12
          }) : value9 !== void 0 ? jsxy1.jsx(runtime2.Tooltip, {
            content: value9,
            detail: input.tooltipDetail,
            shortcut: input.shortcut,
            side: tooltipSide,
            hoverable: input.tooltipHoverable ?? !1,
            className: tooltipClassName,
            children: value12
          }) : value12;
          return value2 ? jsxy1.jsx(runtime2.baseLabelableProvider, {
            children: value13
          }, input.value) : jsxy1.jsx(reactd4.Fragment, {
            children: value13
          }, input.value);
        })
      ]
    });
    return value6 ? value7 : jsxy1.jsx(runtime2.TooltipProvider, {
      children: value7
    });
  }
  function getRelativeSegmentBounds(input, options) {
    let bounds = options.getBoundingClientRect(), value = getUnscaledBorderBoxWidth(options), value2 = Math.abs(bounds.width - value) < 0.01 ? 1 : bounds.width / value;
    if (!(value2 > 0) || !Number.isFinite(value2))
      return {
        left: input.offsetLeft,
        width: input.offsetWidth
      };
    let bounds2 = input.getBoundingClientRect(), value3 = (0, runtime2.getElementWindow)(options)?.devicePixelRatio || 1, callback = (input2) => Math.round(input2 * value3) / value3;
    return {
      left: (callback(bounds2.left) - callback(bounds.left)) / value2,
      width: (callback(bounds2.right) - callback(bounds2.left)) / value2
    };
  }
  function measureScaledElementWidth(input) {
    let width = input.getBoundingClientRect().width;
    return {
      width,
      scaled: input.offsetWidth > 0 && Math.abs(width - getUnscaledBorderBoxWidth(input)) >= 0.01
    };
  }
  function scheduleElementAnimationFrame(input, options) {
    let value = (0, runtime2.getConnectedElementWindow)(input);
    if (!value || typeof value.requestAnimationFrame != "function")
      return null;
    let value2 = value.requestAnimationFrame(options);
    return () => {
      try {
        value.cancelAnimationFrame(value2);
      } catch {
      }
    };
  }
  function getUnscaledBorderBoxWidth(input) {
    let style = ((0, runtime2.getElementWindow)(input) ?? window).getComputedStyle(input), value = parseFloat(style.width);
    return style.boxSizing === "border-box" ? value : value + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  }
  function selectionGripHitSize(frame, scale, touch) {
    if (touch)
      return SELECTION_POINT_METRICS.gripHitTouch;
    let value = Math.min(frame.w, frame.h) * scale;
    return Math.max(SELECTION_POINT_METRICS.grip, Math.min(SELECTION_POINT_METRICS.gripHit, value / 2));
  }
  function SelectionPointGrip() {
    let point = SELECTION_POINT_METRICS.point, pointStroke = SELECTION_POINT_METRICS.pointStroke;
    return jsxForUiTable.jsx("span", {
      "data-selection-grip": "",
      className: (0, runtime2.cn)("absolute top-1/2 left-1/2 box-border block -translate-x-1/2 -translate-y-1/2 rounded-full", runtime2.SELECTION_OUTLINE_CLASS),
      style: {
        width: point,
        height: point,
        backgroundColor: runtime2.designTokens.on.accent.cssVar,
        outlineStyle: "solid",
        outlineWidth: pointStroke,
        outlineOffset: -pointStroke,
        pointerEvents: "none"
      }
    });
  }
  function rotatedResizeCursor(point, rotation = 0) {
    let value = point.x === "left" ? -1 : point.x === "right" ? 1 : 0, value2 = point.y === "top" ? -1 : point.y === "bottom" ? 1 : 0;
    return RESIZE_CURSOR_CYCLE[(Math.round((Math.atan2(value2, value) + rotation) / (Math.PI / 4)) % 4 + 4) % 4] ?? "ew-resize";
  }
  function rotatedGrabCursor(corner, rotation = 0) {
    let value = Math.round(GRAB_CURSOR_ANGLES[corner] + rotation * 180 / Math.PI);
    return `url("data:${GRAB_CURSOR_MIME},${GRAB_CURSOR_SVG_PREFIX}${String(value)}${GRAB_CURSOR_SVG_SUFFIX}") 12 12, grab`;
  }
  function stopSelectionRingEvent(event) {
    event.preventDefault(), event.stopPropagation();
  }
  function SelectionHandleWithTooltip(index4, tooltip, element) {
    return (0, runtime2.hasDisabledReason)(tooltip.content) ? jsxForUiTable2.jsx(runtime2.Tooltip, {
      lazy: !0,
      content: tooltip.content,
      multiline: tooltip.reason,
      hoverable: !1,
      closeOnClick: tooltip.reason ? !1 : void 0,
      trackCursorAxis: tooltip.followPointer ? "both" : void 0,
      children: element
    }, index4) : reactForUiTable2.cloneElement(element, {
      key: index4
    });
  }
  function pointInsideSelectionGripHitArea(event, point, scale, touch) {
    let value = event.currentTarget.parentElement?.getBoundingClientRect();
    if (value === void 0)
      return !1;
    let value2 = event.clientX - (value.left + value.width / 2), value3 = event.clientY - (value.top + value.height / 2), value4 = value2 * Math.cos(touch) + value3 * Math.sin(touch), value5 = value3 * Math.cos(touch) - value2 * Math.sin(touch);
    return Math.abs(value4) <= point && Math.abs(value5) <= scale;
  }
  function selectionHandleKey(point) {
    return `${point.x ?? "mid"}-${point.y ?? "mid"}`;
  }
  function currencyDisplayParts(currency, locale) {
    let value = currency.toUpperCase();
    try {
      let value2 = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: value,
        currencyDisplay: DISAMBIGUATED_CURRENCY_CODES.has(value) ? "code" : "symbol"
      }).formatToParts(1), value3 = value2.findIndex((input) => input.type === "currency"), value4 = value2[value3];
      if (value4 === void 0)
        return {
          symbol: value,
          side: "start"
        };
      let value5 = value2.slice(0, value3).some((input) => CURRENCY_NUMBER_PART_TYPES.has(input.type)) ? "end" : "start";
      return {
        symbol: value4.value,
        side: value5
      };
    } catch {
      return {
        symbol: value,
        side: "start"
      };
    }
  }
  function digitValue(char) {
    let code = char.codePointAt(0) ?? 0;
    return code >= 48 && code <= 57 ? code - 48 : code >= 1632 && code <= 1641 || code >= 1776 && code <= 1785 || code >= 65296 && code <= 65305 ? code % 16 : -1;
  }
  function separatorKind(char) {
    return char === "." || char === "．" ? "." : char === "," || char === "，" ? "," : char === "٫" ? "arabicDecimal" : char === "٬" ? "arabicGroup" : char === "'" || char === "’" ? "apostrophe" : NUMBER_SPACE_SEPARATORS.includes(char) ? "space" : null;
  }
  function readNumberFormat(locale, format) {
    let formatter = new Intl.NumberFormat(locale, format), sample = new Intl.NumberFormat(locale, {
      style: format?.style,
      currency: format?.currency,
      currencyDisplay: format?.currencyDisplay,
      unit: format?.unit,
      unitDisplay: format?.unitDisplay,
      numberingSystem: format?.numberingSystem,
      useGrouping: format?.useGrouping,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).formatToParts(12345678e-1), decimal = sample.find((part) => part.type === "decimal")?.value;
    if (decimal === void 0)
      throw Error("readNumberText: the field's format wrote no decimal mark for 1234567.8");
    let group = sample.find((part) => part.type === "group")?.value, integers = sample.filter((part) => part.type === "integer"), percent = format?.style === "percent", fixedFraction = percent || format?.style === "currency" || ROUNDING_FORMAT_KEYS.some((key) => format?.[key] !== void 0);
    return {
      decimal: separatorKind(decimal),
      group: group === void 0 ? null : separatorKind(group),
      groupText: group ?? null,
      indian: integers.length >= 3 && integers.slice(1, -1).every((part) => part.value.length === 2),
      maxFraction: fixedFraction ? formatter.resolvedOptions().maximumFractionDigits ?? 1 / 0 : 1 / 0,
      signs: [
        ...formatter.formatToParts(-1).filter((part) => part.type === "currency" || part.type === "unit").map((part) => part.value.replace(EDGE_SPACE_PATTERN, "")).filter((sign) => sign !== ""),
        ...percent ? PERCENT_SIGNS : []
      ].sort((a, b) => b.length - a.length),
      percent
    };
  }
  function isAllDigits(text) {
    return Array.from(text).every((char) => digitValue(char) >= 0);
  }
  function hasSeparator(text) {
    return Array.from(text).some((char) => separatorKind(char) !== null);
  }
  function changedSpan(previous, next) {
    let shorter = Math.min(previous.length, next.length), head = 0;
    for (; head < shorter && previous[head] === next[head]; )
      head += 1;
    let tail = 0;
    for (; tail < shorter - head && previous[previous.length - 1 - tail] === next[next.length - 1 - tail]; )
      tail += 1;
    return next.slice(head, next.length - tail);
  }
  function countLooseSeparators(text, groupText) {
    let chars = Array.from(text);
    return chars.filter((char, index4) => char === groupText && (digitValue(chars[index4 - 1] ?? "") < 0 || digitValue(chars[index4 + 1] ?? "") < 0)).length;
  }
  function insertedText(event, pasted) {
    let { inputType, data } = event;
    return typeof inputType != "string" ? null : inputType.startsWith("delete") ? "" : inputType === "insertFromPaste" ? pasted : (inputType === "insertText" || inputType === "insertCompositionText" || inputType === "insertFromComposition") && typeof data == "string" ? data : null;
  }
  function editKeepsLenientGrouping(lenient, previous, next, inserted, { locale, format }) {
    if (!hasSeparator(next))
      return !0;
    let { groupText } = readNumberFormat(locale, format), added = changedSpan(previous, next), removed = changedSpan(next, previous), typedDigits = inserted !== "" && removed === "" && added.length === inserted?.length, deletedDigits = inserted === "" && added === "";
    return lenient && inserted !== null && isAllDigits(inserted) && isAllDigits(added) && isAllDigits(removed) && (typedDigits || deletedDigits) && countLooseSeparators(next, groupText) <= countLooseSeparators(previous, groupText);
  }
  function stripDigitGroupSeparators(text, { locale, format } = {}) {
    let { groupText } = readNumberFormat(locale, format), chars = Array.from(text);
    return chars.filter((char, index4) => char !== groupText || digitValue(chars[index4 - 1] ?? "") < 0 || digitValue(chars[index4 + 1] ?? "") < 0).join("");
  }
  function parseNumberTextLenient(text, options = {}) {
    let parsed = parseNumberText(text, options);
    return parsed.kind === "number" || parsed.kind === "empty" ? parsed : parseNumberText(stripDigitGroupSeparators(text, options), options);
  }
  function isLeadingDigitGroup(group) {
    return group.length >= 1 && group.length <= 3 && !group.startsWith("0");
  }
  function checkDigitGroups(groups, indian) {
    let [lead = "", ...rest] = groups;
    if (!isLeadingDigitGroup(lead))
      return !1;
    let check = (width) => {
      for (let [index4, group] of rest.entries()) {
        let size4 = width(index4), last = index4 === rest.length - 1;
        if (group.length > size4 || group.length < size4 && !last)
          return !1;
        if (group.length < size4)
          return "incomplete";
      }
      return !0;
    }, western = check(() => 3);
    return western !== !1 || !indian || lead.length > 2 ? western : check((index4) => index4 === rest.length - 1 ? 3 : 2);
  }
  function parseNumberText(text, { locale, format } = {}) {
    let spec = readNumberFormat(locale, format), rest = text, negative = !1, signed = !1, affixed = !1;
    for (let previous = ""; previous !== rest; ) {
      previous = rest, rest = rest.replace(EDGE_SPACE_PATTERN, "");
      for (let sign of affixed ? [] : spec.signs) {
        if (rest.startsWith(sign)) {
          rest = rest.slice(sign.length), affixed = !0;
          break;
        }
        if (rest.endsWith(sign)) {
          rest = rest.slice(0, -sign.length), affixed = !0;
          break;
        }
      }
      let first = rest.at(0) ?? "";
      !signed && SIGN_PATTERN.test(first) && (negative = MINUS_SIGN_PATTERN.test(first), signed = !0, rest = rest.slice(1));
    }
    if (rest === "")
      return signed ? { kind: "incomplete" } : { kind: "empty" };
    let toNumber = (whole, fraction) => {
      if (whole === "" && fraction === "")
        return { kind: "incomplete" };
      if ((whole + fraction).replace(/^0+|0+$/g, "").length > 15)
        return { kind: "refused" };
      let literal = `${negative ? "-" : ""}${whole === "" ? "0" : whole}${fraction === "" ? "" : `.${fraction}`}`, value = Number(spec.percent ? `${literal}e-2` : literal);
      return Number.isFinite(value) ? { kind: "number", value: value === 0 ? 0 : value } : { kind: "refused" };
    }, digitRuns = [""], separators = [];
    for (let char of Array.from(rest)) {
      let digit = digitValue(char), separator = separatorKind(char);
      if (digit >= 0)
        digitRuns[digitRuns.length - 1] += String(digit);
      else if (separator !== null)
        separators.push(separator), digitRuns.push("");
      else
        return { kind: "refused" };
    }
    let firstSeparator = separators[0], lastSeparator = separators[separators.length - 1];
    if (firstSeparator === void 0 || lastSeparator === void 0)
      return toNumber(digitRuns[0] ?? "", "");
    let fitsFraction = (fraction) => fraction.length <= spec.maxFraction || /^0*$/.test(fraction.slice(spec.maxFraction));
    if (separators.length > 1) {
      let endsWithDecimal = lastSeparator === spec.decimal, groupMarks = endsWithDecimal ? separators.slice(0, -1) : separators, groups = endsWithDecimal ? digitRuns.slice(0, -1) : digitRuns, fraction = endsWithDecimal ? digitRuns[digitRuns.length - 1] ?? "" : "";
      if (!groupMarks.every((mark) => mark === spec.group) || !fitsFraction(fraction))
        return { kind: "refused" };
      let grouping = checkDigitGroups(groups, spec.indian);
      return grouping === "incomplete" ? endsWithDecimal ? { kind: "refused" } : { kind: "incomplete" } : grouping ? toNumber(groups.join(""), fraction) : { kind: "refused" };
    }
    let [before = "", after = ""] = digitRuns;
    return after.length === 3 ? firstSeparator === spec.group ? isLeadingDigitGroup(before) ? toNumber(before + after, "") : { kind: "refused" } : firstSeparator === spec.decimal && spec.maxFraction >= 3 ? toNumber(before, after) : { kind: "refused" } : firstSeparator === spec.decimal && fitsFraction(after) ? toNumber(before, after) : firstSeparator === spec.group && isLeadingDigitGroup(before) && after.length < 3 ? { kind: "incomplete" } : { kind: "refused" };
  }
  function clampToRange(value, min2, max2) {
    return Math.min(max2 ?? Number.MAX_SAFE_INTEGER, Math.max(min2 ?? Number.MIN_SAFE_INTEGER, value));
  }
  function unlessDefaultPrevented(handler) {
    return (event) => {
      event.nativeEvent.defaultPrevented || handler(event);
    };
  }
  function CurrencyEndOverlay({ symbol, text }) {
    return jsxForUiTable3.jsxs(jsxForUiTable3.Fragment, {
      children: [
        jsxForUiTable3.jsx("span", {
          "aria-hidden": !0,
          "data-copy": text,
          suppressHydrationWarning: !0,
          className: (0, runtime2.cn)(FLOORED_COPY_CLASS, "pointer-events-none absolute inset-0 flex items-center gap-1 overflow-hidden ps-md pe-md before:min-w-0", runtime2.staysSecondaryTextClasses),
          children: text.includes(symbol) ? null : symbol
        }),
        jsxForUiTable3.jsx("span", {
          "aria-hidden": !0,
          "data-copy": symbol,
          className: FLOORED_COPY_CLASS
        })
      ]
    });
  }
  function useClientHydrated() {
    return reactForUiTable3.useSyncExternalStore(subscribeHydration, () => !0, () => !1);
  }
  return bindRuntimeValue(runtime2, "observeSegmentedControlSize", () => observeSegmentedControlSize), bindRuntimeValue(runtime2, "SegmentedControl", () => SegmentedControl), bindRuntimeValue(runtime2, "getRelativeSegmentBounds", () => getRelativeSegmentBounds), bindRuntimeValue(runtime2, "measureScaledElementWidth", () => measureScaledElementWidth), bindRuntimeValue(runtime2, "scheduleElementAnimationFrame", () => scheduleElementAnimationFrame), bindRuntimeValue(runtime2, "getUnscaledBorderBoxWidth", () => getUnscaledBorderBoxWidth), bindRuntimeValue(runtime2, "reactd4", () => reactd4, (value) => {
    reactd4 = value;
  }), bindRuntimeValue(runtime2, "jsxy1", () => jsxy1, (value) => {
    jsxy1 = value;
  }), bindRuntimeValue(runtime2, "segmentedControlSegmentClasses", () => segmentedControlSegmentClasses, (value) => {
    segmentedControlSegmentClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlTextPaddingClasses", () => segmentedControlTextPaddingClasses, (value) => {
    segmentedControlTextPaddingClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlIconAspectClasses", () => segmentedControlIconAspectClasses, (value) => {
    segmentedControlIconAspectClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlVisualLayerClasses", () => segmentedControlVisualLayerClasses, (value) => {
    segmentedControlVisualLayerClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlFlexibleItemClasses", () => segmentedControlFlexibleItemClasses, (value) => {
    segmentedControlFlexibleItemClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlFullWidthItemClasses", () => segmentedControlFullWidthItemClasses, (value) => {
    segmentedControlFullWidthItemClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlTextClasses", () => segmentedControlTextClasses, (value) => {
    segmentedControlTextClasses = value;
  }), bindRuntimeValue(runtime2, "ghostSegmentHoverClasses", () => ghostSegmentHoverClasses, (value) => {
    ghostSegmentHoverClasses = value;
  }), bindRuntimeValue(runtime2, "segmentedControlThumbClasses", () => segmentedControlThumbClasses, (value) => {
    segmentedControlThumbClasses = value;
  }), bindRuntimeValue(runtime2, "containedSegmentThumbClasses", () => containedSegmentThumbClasses, (value) => {
    containedSegmentThumbClasses = value;
  }), bindRuntimeValue(runtime2, "ghostSegmentThumbClasses", () => ghostSegmentThumbClasses, (value) => {
    ghostSegmentThumbClasses = value;
  }), bindRuntimeValue(runtime2, "SEGMENT_INDICATOR_SETTLE_MS", () => SEGMENT_INDICATOR_SETTLE_MS, (value) => {
    SEGMENT_INDICATOR_SETTLE_MS = value;
  }), bindRuntimeValue(runtime2, "SEGMENT_INDICATOR_SETTLE_FRAMES", () => SEGMENT_INDICATOR_SETTLE_FRAMES, (value) => {
    SEGMENT_INDICATOR_SETTLE_FRAMES = value;
  }), bindRuntimeValue(runtime2, "SEGMENT_TOOLTIP_DELAY_MS", () => SEGMENT_TOOLTIP_DELAY_MS, (value) => {
    SEGMENT_TOOLTIP_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "segmentedControlResizeObservers", () => segmentedControlResizeObservers, (value) => {
    segmentedControlResizeObservers = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable", () => initializeUiTable, (value) => {
    initializeUiTable = value;
  }), bindRuntimeValue(runtime2, "selectionGripHitSize", () => selectionGripHitSize), bindRuntimeValue(runtime2, "SELECTION_POINT_METRICS", () => SELECTION_POINT_METRICS, (value) => {
    SELECTION_POINT_METRICS = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable2", () => initializeUiTable2, (value) => {
    initializeUiTable2 = value;
  }), bindRuntimeValue(runtime2, "SelectionPointGrip", () => SelectionPointGrip), bindRuntimeValue(runtime2, "reactForUiTable", () => reactForUiTable, (value) => {
    reactForUiTable = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTable", () => jsxForUiTable, (value) => {
    jsxForUiTable = value;
  }), bindRuntimeValue(runtime2, "SelectionPoints", () => SelectionPoints, (value) => {
    SelectionPoints = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable3", () => initializeUiTable3, (value) => {
    initializeUiTable3 = value;
  }), bindRuntimeValue(runtime2, "rotatedResizeCursor", () => rotatedResizeCursor), bindRuntimeValue(runtime2, "rotatedGrabCursor", () => rotatedGrabCursor), bindRuntimeValue(runtime2, "GRAB_CURSOR_CORNERS", () => GRAB_CURSOR_CORNERS, (value) => {
    GRAB_CURSOR_CORNERS = value;
  }), bindRuntimeValue(runtime2, "RESIZE_CURSOR_CYCLE", () => RESIZE_CURSOR_CYCLE, (value) => {
    RESIZE_CURSOR_CYCLE = value;
  }), bindRuntimeValue(runtime2, "GRAB_CURSOR_ANGLES", () => GRAB_CURSOR_ANGLES, (value) => {
    GRAB_CURSOR_ANGLES = value;
  }), bindRuntimeValue(runtime2, "GRAB_CURSOR_MIME", () => GRAB_CURSOR_MIME, (value) => {
    GRAB_CURSOR_MIME = value;
  }), bindRuntimeValue(runtime2, "GRAB_CURSOR_SVG_PREFIX", () => GRAB_CURSOR_SVG_PREFIX, (value) => {
    GRAB_CURSOR_SVG_PREFIX = value;
  }), bindRuntimeValue(runtime2, "GRAB_CURSOR_SVG_PATH", () => GRAB_CURSOR_SVG_PATH, (value) => {
    GRAB_CURSOR_SVG_PATH = value;
  }), bindRuntimeValue(runtime2, "GRAB_CURSOR_SVG_SUFFIX", () => GRAB_CURSOR_SVG_SUFFIX, (value) => {
    GRAB_CURSOR_SVG_SUFFIX = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable4", () => initializeUiTable4, (value) => {
    initializeUiTable4 = value;
  }), bindRuntimeValue(runtime2, "stopSelectionRingEvent", () => stopSelectionRingEvent), bindRuntimeValue(runtime2, "SelectionHandleWithTooltip", () => SelectionHandleWithTooltip), bindRuntimeValue(runtime2, "pointInsideSelectionGripHitArea", () => pointInsideSelectionGripHitArea), bindRuntimeValue(runtime2, "selectionHandleKey", () => selectionHandleKey), bindRuntimeValue(runtime2, "reactForUiTable2", () => reactForUiTable2, (value) => {
    reactForUiTable2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTable2", () => jsxForUiTable2, (value) => {
    jsxForUiTable2 = value;
  }), bindRuntimeValue(runtime2, "SelectionRing", () => SelectionRing, (value) => {
    SelectionRing = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable5", () => initializeUiTable5, (value) => {
    initializeUiTable5 = value;
  }), bindRuntimeValue(runtime2, "currencyDisplayParts", () => currencyDisplayParts), bindRuntimeValue(runtime2, "DISAMBIGUATED_CURRENCY_CODES", () => DISAMBIGUATED_CURRENCY_CODES, (value) => {
    DISAMBIGUATED_CURRENCY_CODES = value;
  }), bindRuntimeValue(runtime2, "CURRENCY_NUMBER_PART_TYPES", () => CURRENCY_NUMBER_PART_TYPES, (value) => {
    CURRENCY_NUMBER_PART_TYPES = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable6", () => initializeUiTable6, (value) => {
    initializeUiTable6 = value;
  }), bindRuntimeValue(runtime2, "useClientHydrated", () => useClientHydrated), bindRuntimeValue(runtime2, "reactForUiTable3", () => reactForUiTable3, (value) => {
    reactForUiTable3 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTable3", () => jsxForUiTable3, (value) => {
    jsxForUiTable3 = value;
  }), bindRuntimeValue(runtime2, "hydrationNoop", () => hydrationNoop, (value) => {
    hydrationNoop = value;
  }), bindRuntimeValue(runtime2, "subscribeHydration", () => subscribeHydration, (value) => {
    subscribeHydration = value;
  }), bindRuntimeValue(runtime2, "NumberInput", () => NumberInput, (value) => {
    NumberInput = value;
  }), bindRuntimeValue(runtime2, "initializeUiTable7", () => initializeUiTable7, (value) => {
    initializeUiTable7 = value;
  }), () => {
    segmentedControlSegmentClasses = "cds-reset relative z-[1] inline-flex h-full items-center justify-center gap-1.5 select-none border-0 bg-transparent outline-none focus-visible:outline-hidden rounded-[calc(var(--cds-radius)-2px)] text-body font-normal font-control [&:not([data-disabled])]:hover:text-primary data-[checked]:text-primary data-[disabled]:opacity-disabled transition-shadow duration-fast focus-visible:shadow-focus", segmentedControlTextPaddingClasses = "px-md", segmentedControlIconAspectClasses = "aspect-square", segmentedControlVisualLayerClasses = "h-full relative z-[1] rounded-[calc(var(--cds-radius)-2px)]", segmentedControlFlexibleItemClasses = "grow basis-[calc(var(--cds-pad-md)*2)]", segmentedControlFullWidthItemClasses = "flex-1", segmentedControlTextClasses = "text-secondary", ghostSegmentHoverClasses = "text-secondary [&:not([data-checked]):not([data-disabled])]:hover:bg-fill-ghost-hover", segmentedControlThumbClasses = "invisible absolute left-0 origin-left rounded-[calc(var(--cds-radius)-1px)] bg-[var(--cds-segmented-control-thumb)] forced-colors:border-2 forced-colors:border-solid forced-colors:border-[color:Highlight]", containedSegmentThumbClasses = "top-px bottom-px [box-shadow:var(--cds-segmented-control-thumb-shadow,inset_0_0_0_1px_var(--cds-border),0_1px_2px_0_rgb(0_0_0/0.05))]", ghostSegmentThumbClasses = "inset-y-0 [box-shadow:inset_0_0_0_1px_var(--cds-border)]", SEGMENT_INDICATOR_SETTLE_MS = 30, SEGMENT_INDICATOR_SETTLE_FRAMES = 2, SEGMENT_TOOLTIP_DELAY_MS = 600, initializeUiTable = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeErrorReporting)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeResizeObserverAccess)(), (0, runtime2.initializeUiDisclosure)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeShortcuts)(), (0, runtime2.initializeTooltip)(), (0, runtime2.initializeUiDisclosure7)(), (0, runtime2.initializeUiMenu)(), (0, runtime2.initializeUiDialog22)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), reactd4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxy1 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), segmentedControlResizeObservers = /* @__PURE__ */ new WeakMap();
    }), initializeUiTable2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiEditorSelection)(), SELECTION_POINT_METRICS = {
        ...runtime2.SELECTION_METRICS,
        point: 10,
        pointStroke: 1.5,
        gripHit: 24,
        gripHitTouch: 40,
        edgeHit: 8,
        rotateReach: 16
      };
    }), initializeUiTable3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeUiEditorTokens)(), (0, runtime2.initializeModalReleasePlatform)(), (0, runtime2.initializeUiEditorSelection)(), initializeUiTable2(), reactForUiTable = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTable = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SelectionPoints = reactForUiTable.forwardRef(function({ points, scale = 1, shaft, shape = "round", onPointDragStart, cursor = "move", className, ...props }, options) {
        let value = reactForUiTable.useSyncExternalStore(runtime2.subscribeDeviceMediaQueries, runtime2.useCoarseOrHoverlessPointer, () => !1), value2 = (0, runtime2.validSelectionScale)(scale), index4 = 0;
        for (let value5 of points)
          for (let value6 of points)
            index4 = Math.max(index4, Math.abs(value5.x - value6.x), Math.abs(value5.y - value6.y));
        let value3 = value ? SELECTION_POINT_METRICS.gripHitTouch : Math.max(SELECTION_POINT_METRICS.grip, Math.min(SELECTION_POINT_METRICS.gripHit, index4 * value2 / 2)), value4 = onPointDragStart !== void 0;
        return jsxForUiTable.jsxs("div", {
          ...props,
          ref: options,
          "data-cds": "SelectionPoints",
          "aria-hidden": "true",
          className: (0, runtime2.cn)("pointer-events-none absolute top-0 left-0", className),
          children: [
            shaft !== void 0 && shaft.length > 1 ? jsxForUiTable.jsx("svg", {
              "data-selection-shaft": "",
              className: "pointer-events-none absolute top-0 left-0 overflow-visible",
              width: 1,
              height: 1,
              children: jsxForUiTable.jsx("polyline", {
                points: shaft.map((input) => `${input.x},${input.y}`).join(" "),
                fill: "none",
                stroke: runtime2.designTokens.fill.accent.cssVar,
                strokeWidth: 1 / value2
              })
            }) : null,
            points.map((input, options2) => jsxForUiTable.jsx("div", {
              className: "absolute top-0 left-0 size-0",
              style: {
                transform: `translate(${input.x}px, ${input.y}px) scale(${1 / value2})`
              },
              children: jsxForUiTable.jsx("div", {
                "data-resize-handle": value4 ? "" : void 0,
                "data-point-handle": options2,
                className: "absolute touch-none",
                style: {
                  left: -value3 / 2,
                  top: -value3 / 2,
                  width: value3,
                  height: value3,
                  cursor: value4 ? cursor : void 0,
                  pointerEvents: value4 ? "auto" : "none"
                },
                onPointerDown: value4 ? (input2) => onPointDragStart(options2, input2) : void 0,
                children: shape === "square" ? jsxForUiTable.jsx(runtime2.SelectionGrip, {}) : jsxForUiTable.jsx(SelectionPointGrip, {})
              })
            }, options2))
          ]
        });
      }), SelectionPoints.displayName = "SelectionPoints";
    }), GRAB_CURSOR_MIME = "image/svg+xml", GRAB_CURSOR_SVG_PREFIX = "%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%20viewBox=%270%200%2024%2024%27%3E%3Cg%20transform=%27rotate%28", GRAB_CURSOR_SVG_PATH = "%20d=%27M%204.5%2010.7%20L%205.4%2010.4%20A%206.5%206.5%200%200%201%2013.6%2018.6%20L%2013.3%2019.5%20M%206.3%207.8%20L%204.5%2010.7%20L%207.7%2012.0%20M%2012.0%2016.3%20L%2013.3%2019.5%20L%2016.2%2017.7%27", initializeUiTable4 = (0, runtime2.initializeOnce)(() => {
      GRAB_CURSOR_CORNERS = ["nw", "ne", "se", "sw"], RESIZE_CURSOR_CYCLE = [
        "ew-resize",
        "nwse-resize",
        "ns-resize",
        "nesw-resize"
      ], GRAB_CURSOR_ANGLES = {
        ne: 0,
        se: 90,
        sw: 180,
        nw: 270
      }, GRAB_CURSOR_SVG_SUFFIX = "%2012%2012%29%27%20fill=%27none%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E" + ("%3Cpath" + GRAB_CURSOR_SVG_PATH + "%20stroke=%27white%27%20stroke-width=%273.5%27/%3E") + ("%3Cpath" + GRAB_CURSOR_SVG_PATH + "%20stroke=%27black%27%20stroke-width=%271.5%27/%3E") + "%3C/g%3E%3C/svg%3E";
    }), initializeUiTable5 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeModalReleasePlatform)(), (0, runtime2.initializeUiEditorSelection)(), (0, runtime2.initializeDisabledReason)(), (0, runtime2.initializeTooltip)(), initializeUiTable2(), initializeUiTable4(), reactForUiTable2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTable2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SelectionRing = reactForUiTable2.forwardRef(function({ frame, scale = 1, rotation, state = "selected", variant = "object", grips, angleLabel, collaborator, onResizeStart, edgeStrips = !0, onGripDoubleClick, onRotateStart, resizeDisabledReason, rotateDisabledReason, gripLabel, className, style, ...props }, options) {
        let value = reactForUiTable2.useSyncExternalStore(runtime2.subscribeDeviceMediaQueries, runtime2.useCoarseOrHoverlessPointer, () => !1), value2 = (0, runtime2.validSelectionScale)(scale), value3 = (0, runtime2.collaboratorSelectionIndex)(collaborator);
        if (collaborator !== void 0 && value3 === void 0)
          return null;
        let value4 = (0, runtime2.selectionRingWidth)(state, value3), value5 = (0, runtime2.selectionHandlePositions)(grips, state, value3), value6 = (0, runtime2.finiteSelectionRotation)(rotation), value7 = (0, runtime2.hasDisabledReason)(resizeDisabledReason), value8 = (0, runtime2.hasDisabledReason)(rotateDisabledReason), value9 = value3 === void 0 && state === "selected", value10 = value9 && (value7 ? !value : onResizeStart !== void 0), value11 = frame.w * value2, value12 = frame.h * value2, value13 = selectionGripHitSize(frame, value2, value), edgeHit = SELECTION_POINT_METRICS.edgeHit, value14 = typeof grips == "object" ? runtime2.EDGE_SELECTION_HANDLES.filter((input) => grips.some((input2) => (0, runtime2.equalSelectionPoint)(input2, input))) : [], value15 = !value10 || value || value7 || !edgeStrips || value5.length === 0 ? [] : value14.length > 0 ? value14 : runtime2.EDGE_SELECTION_HANDLES, callback = (input) => input >= 3 * SELECTION_POINT_METRICS.edgeHit, value16 = value15.filter((input) => input.x === null ? input.y !== null && callback(value12) : input.y === null && callback(value11)), value17 = !value9 || value || onRotateStart === void 0 && !value8 ? [] : GRAB_CURSOR_CORNERS, value18 = value13 / 2 + SELECTION_POINT_METRICS.rotateReach, value19 = value7 ? {
          content: resizeDisabledReason,
          reason: !0
        } : {
          content: gripLabel,
          reason: !1
        };
        return jsxForUiTable2.jsxs("div", {
          ...props,
          ref: options,
          "data-cds": "SelectionRing",
          "data-state": value3 === void 0 ? state : void 0,
          "data-variant": value3 === void 0 ? variant : void 0,
          "data-collaborator": value3,
          "aria-hidden": "true",
          className: (0, runtime2.cn)(runtime2.SELECTION_OUTLINE_CLASS, className),
          style: {
            ...style,
            ...(0, runtime2.SelectionOutline)({
              frame,
              scale: value2,
              rotation,
              stroke: value4,
              collaborator: value3,
              variant
            })
          },
          children: [
            jsxForUiTable2.jsxs(runtime2.TooltipProvider, {
              children: [
                value17.map((input) => {
                  let state2 = {
                    position: "absolute",
                    left: input === "nw" || input === "sw" ? -value18 : value11,
                    top: input === "nw" || input === "ne" ? -value18 : value12,
                    width: value18,
                    height: value18,
                    pointerEvents: "auto",
                    cursor: value8 ? "default" : rotatedGrabCursor(input, value6)
                  };
                  return SelectionHandleWithTooltip(`rotate-${input}`, {
                    content: rotateDisabledReason,
                    reason: !0
                  }, jsxForUiTable2.jsx("div", {
                    "data-resize-handle": "",
                    "data-rotate-handle": input,
                    className: "touch-none",
                    "data-disabled": value8 ? "" : void 0,
                    style: state2,
                    onPointerDown: value8 ? stopSelectionRingEvent : (input2) => onRotateStart?.(input, input2)
                  }));
                }),
                value16.map((input) => {
                  let value20 = input.x === null, callback2 = (input2, options2) => value5.some((input3) => input3.x === input2 && input3.y === options2) ? value13 / 2 : 0, value21 = value20 ? callback2("left", input.y) : callback2(input.x, "top"), value22 = value20 ? callback2("right", input.y) : callback2(input.x, "bottom"), state2 = {
                    position: "absolute",
                    pointerEvents: "auto",
                    cursor: rotatedResizeCursor(input, value6),
                    ...value20 ? {
                      left: value21,
                      width: Math.max(0, value11 - value21 - value22),
                      top: (input.y === "top" ? 0 : value12) - edgeHit / 2,
                      height: edgeHit
                    } : {
                      top: value21,
                      height: Math.max(0, value12 - value21 - value22),
                      left: (input.x === "left" ? 0 : value11) - edgeHit / 2,
                      width: edgeHit
                    }
                  };
                  return SelectionHandleWithTooltip(`strip-${selectionHandleKey(input)}`, {
                    content: gripLabel,
                    reason: !1,
                    followPointer: !0
                  }, jsxForUiTable2.jsx("div", {
                    "data-resize-handle": "",
                    "data-resize-strip": "",
                    className: "touch-none",
                    style: state2,
                    onPointerDown: (input2) => onResizeStart?.(input, input2),
                    onDoubleClick: onGripDoubleClick === void 0 ? void 0 : (input2) => {
                      input2.stopPropagation(), onGripDoubleClick(input);
                    }
                  }));
                }),
                value5.map((input) => {
                  let value20 = (0, runtime2.selectionHandleCssPosition)(input);
                  if (!value10)
                    return jsxForUiTable2.jsx("span", {
                      className: "absolute block size-0",
                      style: value20,
                      children: jsxForUiTable2.jsx(runtime2.SelectionGrip, {
                        stroke: value4,
                        disabled: value9 && value7,
                        variant
                      })
                    }, selectionHandleKey(input));
                  let state2 = {
                    position: "absolute",
                    left: `calc(${value20.left} - ${value13 / 2}px)`,
                    top: `calc(${value20.top} - ${value13 / 2}px)`,
                    width: value13,
                    height: value13,
                    pointerEvents: "auto",
                    cursor: value7 ? "default" : rotatedResizeCursor(input, value6)
                  };
                  return SelectionHandleWithTooltip(selectionHandleKey(input), value19, jsxForUiTable2.jsx("div", {
                    "data-resize-handle": "",
                    "data-disabled": value7 ? "" : void 0,
                    className: "touch-none",
                    style: state2,
                    onPointerDown: value7 ? stopSelectionRingEvent : (input2) => onResizeStart?.(input, input2),
                    onDoubleClick: onGripDoubleClick === void 0 || value7 ? void 0 : (input2) => {
                      value && pointInsideSelectionGripHitArea(input2, value11 / 2, value12 / 2, value6) || (input2.stopPropagation(), onGripDoubleClick(input));
                    },
                    children: jsxForUiTable2.jsx(runtime2.SelectionGrip, {
                      stroke: value4,
                      disabled: value7,
                      variant
                    })
                  }));
                })
              ]
            }),
            angleLabel !== void 0 && value3 === void 0 ? jsxForUiTable2.jsx(runtime2.SelectionLabel, {
              "data-selection-angle": "",
              scale: 1,
              rotation,
              anchor: "center",
              at: runtime2.ROTATION_HANDLE_POSITION,
              variant,
              children: angleLabel
            }) : null
          ]
        });
      }), SelectionRing.displayName = "SelectionRing";
    }), initializeUiTable6 = (0, runtime2.initializeOnce)(() => {
      DISAMBIGUATED_CURRENCY_CODES = /* @__PURE__ */ new Set(["SGD", "AUD", "NZD"]), CURRENCY_NUMBER_PART_TYPES = /* @__PURE__ */ new Set([
        "integer",
        "group",
        "decimal",
        "fraction",
        "minusSign",
        "plusSign",
        "nan",
        "infinity"
      ]);
    }), hydrationNoop = () => {
    }, subscribeHydration = () => hydrationNoop, initializeUiTableNumberText = (0, runtime2.initializeOnce)(() => {
      MINUS_SIGN_PATTERN = /[-−－‒–—﹣]/u, SIGN_PATTERN = /[-−－‒–—﹣+＋﹢]/u, EDGE_SPACE_PATTERN = /^[\s\p{Zs}\p{Cf}]+|[\s\p{Zs}\p{Cf}]+$/gu, PERCENT_SIGNS = ["%", "٪", "％", "﹪"], ROUNDING_FORMAT_KEYS = [
        "maximumFractionDigits",
        "minimumFractionDigits",
        "roundingIncrement",
        "roundingMode",
        "roundingPriority"
      ];
    }), initializeUiTable7 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeClickToFocus)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializeUiDisclosure12)(), (0, runtime2.initializeUiMenu)(), initializeUiTable6(), initializeUiTableNumberText(), (0, runtime2.initializeNpmDependency)(), reactForUiTable3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTable3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactDomForUiTable3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)()), LATIN_LIKE_NUMBERING_SYSTEMS = /* @__PURE__ */ new Set(["latn", "arab", "arabext", "fullwide"]), NumberInput = reactForUiTable3.forwardRef(({ className, size: size4, fullWidth = !0, currency, slotStart, slotEnd, value, defaultValue, onValueChange, onValueCommitted, format, locale, min: min2, max: max2, step, smallStep, largeStep, snapOnStep, allowOutOfRange, required, disabled: disabled2, readOnly, name, form, ...props }, forwardedRef) => {
        let { id, ...inputProps } = props, configLocale = (0, runtime2.useCdsConfig)(), resolvedLocale = locale ?? configLocale, resolvedFormat = reactForUiTable3.useMemo(() => {
          if (format?.numberingSystem !== void 0)
            return format;
          let numberingSystem = new Intl.NumberFormat(resolvedLocale, format).resolvedOptions().numberingSystem;
          return LATIN_LIKE_NUMBERING_SYSTEMS.has(numberingSystem) ? format : { ...format, numberingSystem: "latn" };
        }, [format, resolvedLocale]), hydrated = useClientHydrated(), displayLocale = resolvedLocale ?? (hydrated ? void 0 : "en-US"), currencyParts = reactForUiTable3.useMemo(() => currency !== void 0 && slotStart === void 0 && slotEnd === void 0 ? currencyDisplayParts(currency, displayLocale) : null, [currency, displayLocale, slotStart, slotEnd]), startSlot = slotStart ?? (currencyParts?.side === "start" ? currencyParts.symbol : null), slotHidden = currencyParts !== null || void 0, endSymbol = currencyParts?.side === "end" ? currencyParts.symbol : null, zeroPlaceholder = reactForUiTable3.useMemo(() => endSymbol === null ? void 0 : new Intl.NumberFormat(resolvedLocale, resolvedFormat).format(0), [endSymbol, resolvedLocale, resolvedFormat]), fieldInvalid = (0, runtime2.useFieldInvalid)(), fieldDisabled = (0, runtime2.useFieldDisabled)(), widthClass = fullWidth ? "w-full min-w-0" : "", ref = reactForUiTable3.useRef(null), { clickToFocusProps } = (0, runtime2.useClickToFocus)(() => ref.current?.focus(), {
          disabled: disabled2 || fieldDisabled,
          readOnly
        }), controlled = value !== void 0, [ownValue, setOwnValue] = reactForUiTable3.useState(defaultValue ?? null), currentValue = value !== void 0 ? value : ownValue, [draft, setDraft] = reactForUiTable3.useState(null), [unreadableCommitted, setUnreadableCommitted] = reactForUiTable3.useState(!1), unreadableRef = reactForUiTable3.useRef(!1), canceledRef = reactForUiTable3.useRef(!1), pasteEventRef = reactForUiTable3.useRef(null), pastedTextRef = reactForUiTable3.useRef(null), lenientRef = reactForUiTable3.useRef(!0), textBeforeInputRef = reactForUiTable3.useRef(null);
        reactForUiTable3.useEffect(() => {
          const input = ref.current;
          if (input === null)
            return;
          let onBeforeInput = (event) => {
            textBeforeInputRef.current = input.value, event.inputType !== "insertFromPaste" && (pastedTextRef.current = null);
          };
          return input.addEventListener("beforeinput", onBeforeInput, !0), () => {
            input.removeEventListener("beforeinput", onBeforeInput, !0);
          };
        }, []);
        let formatKey = `${String(resolvedLocale)} ${JSON.stringify(resolvedFormat ?? null)}`, formatKeyRef = reactForUiTable3.useRef(formatKey), [emitCount, bumpEmitCount] = reactForUiTable3.useReducer((count) => count + 1, 0), drivenRef = reactForUiTable3.useRef({
          driven: currentValue,
          emits: emitCount
        });
        reactForUiTable3.useEffect(() => {
          let emitted = drivenRef.current.emits !== emitCount, drivenChanged = drivenRef.current.driven !== currentValue;
          drivenRef.current = {
            driven: currentValue,
            emits: emitCount
          };
          let input = ref.current;
          drivenChanged && !emitted && input?.ownerDocument.activeElement !== input && (setDraft(null), setUnreadableCommitted(!1), unreadableRef.current = !1);
        }, [currentValue, emitCount]);
        let { setDirty, validityData } = runtime2.baseUseFieldRootContext(), createChangeDetails = runtime2.baseCreateChangeEventDetails, createGenericDetails = runtime2.baseCreateGenericEventDetails, emitValue = (next, unreadable, details) => {
          if (canceledRef.current = !1, next === currentValue && unreadable === unreadableRef.current)
            return;
          let eventDetails = createChangeDetails(details.reason, details.event, void 0, {
            isUnreadable: unreadable
          });
          onValueChange?.(next, eventDetails), canceledRef.current = eventDetails.isCanceled, !eventDetails.isCanceled && (unreadableRef.current = unreadable, bumpEmitCount(), controlled || setOwnValue(next), setDirty(next !== validityData.initialValue));
        }, textOptions = {
          locale: resolvedLocale,
          format: resolvedFormat
        }, parseText = (text) => {
          let parse = lenientRef.current && formatKeyRef.current === formatKey ? parseNumberTextLenient : parseNumberText, symbol = currencyParts?.symbol, trimmed = text.trim();
          return symbol !== void 0 && trimmed.startsWith(symbol) ? parse(trimmed.slice(symbol.length), textOptions) : symbol !== void 0 && trimmed.endsWith(symbol) ? parse(trimmed.slice(0, -symbol.length), textOptions) : parse(text, textOptions);
        }, clampValue = (input) => allowOutOfRange ? input : clampToRange(input, min2, max2), refusesNegative = (input) => input < 0 && min2 !== void 0 && min2 >= 0 && allowOutOfRange !== !0, applyText = (text, details) => {
          let parsed = parseText(text);
          parsed.kind === "empty" ? emitValue(null, !1, {
            reason: "input-clear",
            event: details.event
          }) : parsed.kind === "number" && !refusesNegative(parsed.value) ? emitValue(clampValue(parsed.value), !1, details) : emitValue(null, !0, details);
        }, handleRootValueChange = (next, details) => {
          setDraft(null), setUnreadableCommitted(!1), unreadableRef.current = !1, bumpEmitCount(), controlled || setOwnValue(next), onValueChange?.(next, details);
        }, [, rerender] = reactForUiTable3.useReducer((count) => count + 1, 0), handleBlur = (event) => {
          if (inputProps.onBlur?.(event), canceledRef.current)
            canceledRef.current = !1, setDraft(null);
          else if (draft !== null && !unreadableCommitted) {
            let parsed = parseText(draft);
            if (parsed.kind === "empty" || parsed.kind === "number" && !refusesNegative(parsed.value)) {
              setDraft(null);
              let next = parsed.kind === "empty" ? null : clampValue(parsed.value);
              if (emitValue(next, !1, {
                reason: "input-blur",
                event: event.nativeEvent
              }), canceledRef.current) {
                canceledRef.current = !1, rerender();
                return;
              }
              onValueCommitted?.(next, next === null ? createGenericDetails("input-clear", event.nativeEvent, {
                isUnreadable: !1
              }) : createGenericDetails("input-blur", event.nativeEvent, {
                isUnreadable: !1
              }));
            } else {
              if (setUnreadableCommitted(!0), emitValue(null, !0, {
                reason: "input-blur",
                event: event.nativeEvent
              }), canceledRef.current) {
                canceledRef.current = !1, rerender();
                return;
              }
              onValueCommitted?.(null, createGenericDetails("input-blur", event.nativeEvent, {
                isUnreadable: !0
              }));
            }
          }
          rerender();
        }, mergedRef = (0, runtime2.useMergedRefs)(ref, forwardedRef);
        return jsxForUiTable3.jsxs(runtime2.baseNumberField.Root, {
          "data-cds": "NumberInput",
          ...(0, runtime2.getControlSizeAttributes)(size4),
          "data-invalid": fieldInvalid || unreadableCommitted || void 0,
          id,
          value: currentValue,
          onValueChange: handleRootValueChange,
          onValueCommitted,
          format: resolvedFormat,
          locale: resolvedLocale,
          min: min2,
          max: max2,
          step,
          smallStep,
          largeStep,
          snapOnStep,
          allowOutOfRange,
          required,
          disabled: disabled2,
          readOnly,
          name,
          form,
          onMouseDown: unlessDefaultPrevented(clickToFocusProps.onMouseDown),
          className: (0, runtime2.cn)(runtime2.TEXT_INPUT_CLASS, "pe-md", "inline-flex", endSymbol !== null && "relative", widthClass, "cursor-text items-center gap-[var(--cds-pad-sm,6px)]", NUMBER_INPUT_FOCUS_CLASS, "data-[disabled]:opacity-disabled", !disabled2 && "[&:hover:not(:focus-visible):not(:has(:focus-visible)):not([data-invalid]):not([data-disabled])]:shadow-field-hover", className),
          children: [
            startSlot ? jsxForUiTable3.jsx("span", {
              "aria-hidden": slotHidden,
              className: `flex shrink-0 items-center ${runtime2.staysSecondaryTextClasses}`,
              children: startSlot
            }) : null,
            jsxForUiTable3.jsx(runtime2.baseNumberField.Input, {
              ref: mergedRef,
              "aria-invalid": inputProps["aria-invalid"] ?? (fieldInvalid || unreadableCommitted || void 0),
              ...inputProps,
              placeholder: inputProps.placeholder ?? zeroPlaceholder,
              ...draft === null ? null : { value: draft },
              // Text is read here, so typed digits of any script and
              // separators stay as typed; Base UI only formats.
              onChange: (event) => {
                event.preventBaseUIHandler();
                let text = event.currentTarget.value, before = textBeforeInputRef.current;
                textBeforeInputRef.current = null, lenientRef.current = editKeepsLenientGrouping(before !== null && (draft === null || lenientRef.current && formatKeyRef.current === formatKey), before ?? "", text, insertedText(event.nativeEvent, pastedTextRef.current), textOptions), formatKeyRef.current = formatKey, pastedTextRef.current = null, setDraft(text), setUnreadableCommitted(!1), applyText(text, pasteEventRef.current === null ? {
                  reason: "input-change",
                  event: event.nativeEvent
                } : {
                  reason: "input-paste",
                  event: pasteEventRef.current
                }), pasteEventRef.current = null;
              },
              onPaste: (event) => {
                if (inputProps.onPaste?.(event), event.preventBaseUIHandler(), pasteEventRef.current = event.defaultPrevented ? null : event.nativeEvent, pastedTextRef.current = null, !event.defaultPrevented)
                  try {
                    pastedTextRef.current = event.clipboardData?.getData("text/plain").replace(/[\r\n]+$/, "") || null;
                  } catch {
                    pastedTextRef.current = null;
                  }
              },
              onKeyDown: (event) => {
                if (inputProps.onKeyDown?.(event), pasteEventRef.current = null, pastedTextRef.current = null, event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" && min2 !== void 0 || event.key === "End" && max2 !== void 0 || (event.key.length === 1 && event.preventBaseUIHandler(), event.key !== "Enter" || !unreadableRef.current || (0, runtime2.shouldSuppressCompositionEnter)(event.nativeEvent) || event.metaKey || event.ctrlKey) || (event.preventDefault(), event.repeat))
                  return;
                let input = event.currentTarget;
                reactDomForUiTable3.flushSync(() => {
                  input.blur(), input.focus();
                });
              },
              onBlur: handleBlur,
              className: (0, runtime2.cn)(runtime2.TEXT_INPUT_REQUIRED_CLASS, "disabled:opacity-100"),
              render: (renderProps) => jsxForUiTable3.jsxs(jsxForUiTable3.Fragment, {
                children: [
                  jsxForUiTable3.jsx("input", {
                    ...renderProps
                  }),
                  endSymbol === null ? null : jsxForUiTable3.jsx(CurrencyEndOverlay, {
                    symbol: endSymbol,
                    text: String(renderProps.value || renderProps.placeholder || "")
                  })
                ]
              })
            }),
            slotEnd ? jsxForUiTable3.jsx("span", {
              className: `flex shrink-0 items-center ${runtime2.staysSecondaryTextClasses}`,
              children: slotEnd
            }) : null
          ]
        });
      }), NumberInput.displayName = "NumberInput";
    });
  };
}
export {
  installUiTable
};
