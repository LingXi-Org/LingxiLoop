// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiAvatars(runtime2) {
  var reactForUiAvatars, jsxForUiAvatars, CLAUDE_SPARK_PATH, CLAUDE_CLAY_COLOR, CLAUDE_CLAY_CSS_COLOR, SPARK_SIZE_CLASS, StaticSpark, Spark, initializeUiAvatars, reactForUiAvatars2, AvatarStackContext, initializeUiAvatars2, reactForUiAvatars3, jsxForUiAvatars2, avatarVariants, Avatar, initializeUiAvatars3, reactShortcut, jsxShortcut, shortcutKeycapClasses, singleCharacterKeycapClasses, multipleCharacterKeycapClasses, shortcutTextKeyClasses, shortcutVariantClasses, SHORTCUT_RTL_CLASSES, SHORTCUT_SEQUENCE_SEPARATOR, SHORTCUT_MODIFIER_SEPARATOR, appleKeyboardUserAgentPattern, subscribeAppleKeyboardNoop, shortcutModifierNames, isShortcutModifier, shortcutModifierOrder, appleModifierLabels, otherModifierLabels, appleKeyLabels, otherKeyLabels, appleAriaModifierNames, otherAriaModifierNames, initializeShortcuts, reactTextClipping, documentTextRanges, initializeTextClipping, reactCancelableTimeout, initializeCancelableTimeout, SHRINK_WRAP_STYLE_PROPERTY, shrinkWrapBaselineWidths, shrinkWrapWrittenWidths, SHRINK_WRAP_MAX_ITERATIONS, SHRINK_WRAP_ATTRIBUTE, SHRINK_WRAP_MAX_LINE_RECTS, SHRINK_WRAP_MEMORY_LIMIT, SHRINK_WRAP_MAX_TEXT_LENGTH, shrinkWrapMemory, SHRINK_WRAP_HASH_SEED, shrinkWrapAtomicTags, shrinkWrapQueues, shrinkWrapResizeObservers, shrinkWrapWindowResizeStores, initializeShrinkWrapMeasurement, reactShrinkWrap, jsxShrinkWrap, ShrinkWrap, initializeShrinkWrap, buttonBackgroundLayerClasses, buttonFocusClasses, dangerButtonFocusClasses, buttonFillLayerClasses, buttonBackgroundShadowClasses, buttonJoinedFillClasses, buttonPressedFillClasses, secondaryButtonFillClasses, buttonSolidInsetClasses, ghostButtonPressedFillClasses, buttonPressedTextClasses, buttonPaddingClasses, buttonRadiusClasses, buttonEndRadiusClasses, stacksSecondaryButtonFillClasses, stacksButtonNoShadowClasses, stacksGhostButtonFillClasses, stacksDisabledButtonFillClasses, stacksDangerButtonFillClasses, stacksDangerButtonTextClasses, stacksDangerButtonBgClasses, stacksAccentButtonFillClasses, stacksAccentButtonTextClasses, stacksAccentPressedHoverClasses, stacksGhostPressedFillClasses, stacksDangerPressedFillClasses, stacksAccentPressedFillClasses, stacksNoTransformClasses, stacksButtonInsetClasses, stacksDisabledButtonClasses, stacksButtonFillClasses, stacksButtonActiveClasses, initializeButtonVariantClasses, initializeDisabledReasonDebug, reactDisabledReason, jsxDisabledReason, disabledReasonFocusClasses, disabledReasonTypeIds, nextDisabledReasonTypeId, DISABLED_REASON_ATTRIBUTE, initializeDisabledReason, jsxTooltipClasses, tooltipBaseClasses, singleLineTooltipClasses, tooltipDetailClasses, multilineTooltipBaseClasses, multilineTooltipClasses, multilineTooltipArrowClass, initializeTooltipClasses, reactTooltipContext, tooltipsDisabledContext, tooltipImplementationContext, initializeTooltipContext, tooltipExports, reactTooltip, jsxTooltip, activeTooltipActionsRef, TOOLTIP_NO_SHOW, closedTooltipState, openTooltipState, closeTooltipState, clearTooltipBody, openTooltipWithBody, replaceTooltipBody, resetTooltipState, tooltipSingleLineClasses, tooltipTextBalanceClass, tooltipSecondaryDetailClasses, tooltipContentRowClasses, tooltipContentAlignmentClass, tooltipMultilineBodyClasses, OverflowTooltip, defaultTooltipImplementation, tooltipDelayContext, initializeTooltip, initializeTooltipSingleton, OVERFLOW_TOOLTIP_OWNER_SELECTOR, OVERFLOW_TOOLTIP_REVEAL_SELECTOR, overflowTooltipRevealers, focusedOverflowLabels, focusBeforeWindowBlur, watchedOverflowDocuments, settleOverflowReveal, TOOLTIP_DEFAULT_DELAY, reactDomTooltip;
  function useAvatarStack() {
    return reactForUiAvatars2.useContext(AvatarStackContext);
  }
  function avatarInitials(name, locale, maxInitials) {
    let value = name.trim().split(/\s+/), callback = (input) => input ? [...input][0] ?? "" : "";
    return (callback(value[0]) + (maxInitials === 2 && value.length > 1 ? callback(value[value.length - 1]) : "")).toLocaleUpperCase(locale) || "?";
  }
  function getKeycapClasses(input) {
    return `${shortcutKeycapClasses} ${Array.from(input ?? "").length === 1 ? singleCharacterKeycapClasses : multipleCharacterKeycapClasses}`;
  }
  function Shortcut({ keys, variant = "keycap", onFill = !1, className, ...props }) {
    let value = useAppleKeyboard(), value2 = (0, runtime2.useTranslation)("sequenceThen", SHORTCUT_SEQUENCE_SEPARATOR), value3 = parseShortcutSequence(keys).map((input) => renderShortcutChord(input, value)), value4 = variant === "text" && !value;
    return jsxShortcut.jsx("span", {
      ...props,
      "data-cds": "Shortcut",
      "data-variant": variant,
      className: (0, runtime2.cn)(shortcutVariantClasses[variant], value3.length === 1 && SHORTCUT_RTL_CLASSES, onFill && "[--cds-shortcut-cap-ink:currentColor]", className),
      children: value3.map((input, options) => jsxShortcut.jsxs(reactShortcut.Fragment, {
        children: [
          options > 0 && jsxShortcut.jsx("span", {
            className: "px-[2px] [color:var(--cds-shortcut-cap-ink)]",
            children: value2
          }),
          input.map(({ label, spoken }, options2) => jsxShortcut.jsxs(reactShortcut.Fragment, {
            children: [
              value4 && options2 > 0 && jsxShortcut.jsx("span", {
                className: "mx-[-0.15em] [color:var(--cds-shortcut-cap-ink)]",
                children: SHORTCUT_MODIFIER_SEPARATOR
              }),
              jsxShortcut.jsx("kbd", {
                className: variant === "text" ? shortcutTextKeyClasses : getKeycapClasses(label),
                children: spoken === void 0 ? label : value4 ? spoken : jsxShortcut.jsxs(jsxShortcut.Fragment, {
                  children: [
                    jsxShortcut.jsx("span", {
                      "aria-hidden": "true",
                      children: label
                    }),
                    jsxShortcut.jsx("span", {
                      className: "sr-only select-none",
                      children: spoken
                    })
                  ]
                })
              })
            ]
          }, options2))
        ]
      }, options))
    });
  }
  function useAppleKeyboard() {
    return reactShortcut.useSyncExternalStore(subscribeAppleKeyboardNoop, () => appleKeyboardUserAgentPattern.test(navigator.userAgent), () => !1);
  }
  function ownPropertyValue(input, options) {
    if (Object.hasOwn(input, options))
      return input[options];
  }
  function getShortcutKeyLabel(items, options) {
    let value = ownPropertyValue(options ? appleKeyLabels : otherKeyLabels, items);
    return value !== void 0 ? value : /^f\d+$/.test(items) || items.length === 1 ? items.toUpperCase() : items.charAt(0).toUpperCase() + items.slice(1);
  }
  function parseShortcutSequence(input) {
    let value = input.trim().replace(/\s*\+\s*/g, "+");
    return value ? value.split(/\s+/) : [];
  }
  function parseShortcutChord(input, options) {
    let value = input.toLowerCase().split("+").map((input2) => input2.trim()).filter((input2) => input2 !== ""), items = [], items2 = [];
    for (let value2 of value)
      isShortcutModifier(value2) ? items.push(value2) : items2.push(value2);
    let callback = (input2) => shortcutModifierOrder.indexOf(!options && (input2 === "cmd" || input2 === "command" || input2 === "meta") ? "ctrl" : input2);
    return items.sort((input2, options2) => callback(input2) - callback(options2)), {
      modifiers: items,
      keys: items2
    };
  }
  function renderShortcutChord(input, options) {
    let { modifiers: value, keys: value2 } = parseShortcutChord(input, options), value3 = options ? appleModifierLabels : otherModifierLabels, callback = (input2, options2) => {
      if (/^[A-Za-z0-9 ]+$/.test(options2))
        return {
          label: options2
        };
      let value4 = ownPropertyValue(appleAriaModifierNames, input2);
      return value4 === void 0 ? {
        label: options2
      } : {
        label: options2,
        spoken: value4
      };
    };
    return [
      ...value.map((input2) => callback(input2, value3[input2])),
      ...value2.map((input2) => callback(input2, getShortcutKeyLabel(input2, options)))
    ];
  }
  function shortcutToAriaKeyShortcuts(input, options) {
    let [value, ...value2] = parseShortcutSequence(input);
    if (value === void 0 || value2.length > 0)
      return;
    let { modifiers: value3, keys: value4 } = parseShortcutChord(value, options);
    if (value4.length !== 1)
      return;
    let value5 = options ? "Meta" : "Control", callback = (items) => items === "cmd" || items === "command" || items === "meta" ? value5 : ownPropertyValue(otherAriaModifierNames, items) ?? (/^f\d+$/.test(items) ? items.toUpperCase() : items.length === 1 ? items : items.charAt(0).toUpperCase() + items.slice(1));
    return [...value3, ...value4].map(callback).join("+");
  }
  function isTextRangeClipped(element) {
    let ownerDocument2 = element.ownerDocument, entry = documentTextRanges.get(ownerDocument2);
    entry === void 0 && (entry = ownerDocument2.createRange(), documentTextRanges.set(ownerDocument2, entry)), entry.selectNodeContents(element);
    let value = entry.getBoundingClientRect?.();
    if (entry.setStart(ownerDocument2, 0), entry.collapse(!0), value === void 0 || value.width === 0)
      return !1;
    let bounds = element.getBoundingClientRect();
    return value.right - bounds.right > 0.1 || bounds.left - value.left > 0.1;
  }
  function useCancelableTimeout() {
    let ref = reactCancelableTimeout.useRef(void 0), callback = reactCancelableTimeout.useCallback(() => {
      window.clearTimeout(ref.current), ref.current = void 0;
    }, []), callback2 = reactCancelableTimeout.useCallback((input, options) => {
      callback(), ref.current = window.setTimeout(options, input);
    }, [callback]);
    return reactCancelableTimeout.useEffect(() => callback, [callback]), reactCancelableTimeout.useMemo(() => ({
      start: callback2,
      cancel: callback
    }), [callback2, callback]);
  }
  function writeShrinkWrapWidth(input, options) {
    input.style[SHRINK_WRAP_STYLE_PROPERTY] = options, shrinkWrapWrittenWidths.set(input, options);
  }
  function readShrinkWrapBaseline(input) {
    let value = input.style[SHRINK_WRAP_STYLE_PROPERTY];
    return shrinkWrapBaselineWidths.has(input) && value === shrinkWrapWrittenWidths.get(input) ? shrinkWrapBaselineWidths.get(input) ?? "" : value;
  }
  function captureShrinkWrapBaseline(input) {
    shrinkWrapBaselineWidths.set(input, readShrinkWrapBaseline(input));
  }
  function shrinkWrapTextRules(input) {
    return [
      input.whiteSpace,
      input.wordBreak,
      input.overflowWrap,
      input.hyphens,
      input.lineBreak,
      input.textWrap,
      input.textAlign
    ].join("|");
  }
  function rememberShrinkWrapWidth(input, key, entry) {
    let entries = shrinkWrapMemory.get(input);
    if (entries || (entries = /* @__PURE__ */ new Map(), shrinkWrapMemory.set(input, entries)), entries.delete(key), entries.set(key, entry), entries.size > SHRINK_WRAP_MEMORY_LIMIT) {
      let oldest = entries.keys().next().value;
      oldest !== void 0 && entries.delete(oldest);
    }
  }
  function recallShrinkWrapWidth(input, key) {
    return shrinkWrapMemory.get(input.ownerDocument)?.get(key);
  }
  function hashShrinkWrapString(input, text) {
    let value = input;
    for (let index4 = 0; index4 < text.length; index4++)
      value ^= text.charCodeAt(index4), value = Math.imul(value, 16777619);
    return value >>> 0;
  }
  function shrinkWrapContentKey(input) {
    let text = input.textContent ?? "";
    if (text.length === 0 || text.length > SHRINK_WRAP_MAX_TEXT_LENGTH)
      return null;
    let density = input.closest("[data-density]")?.getAttribute("data-density") ?? "", textSize = input.closest("[data-text-size]")?.getAttribute("data-text-size") ?? "", lang = input.closest("[lang]")?.getAttribute("lang") ?? "", descendants = input.getElementsByTagName("*"), hash = SHRINK_WRAP_HASH_SEED;
    for (let descendant of descendants)
      hash = hashShrinkWrapString(hash, descendant.tagName), hash = hashShrinkWrapString(hash, descendant.getAttribute("class") ?? ""), hash = hashShrinkWrapString(hash, shrinkWrapStyleKey(descendant)), hash = hashShrinkWrapString(hash, descendant.getAttribute("data-shrinkwrap") ?? ""), hash = hashShrinkWrapString(hash, "|");
    return [
      input.className,
      density,
      textSize,
      lang,
      descendants.length,
      hash,
      text.length,
      hashShrinkWrapString(SHRINK_WRAP_HASH_SEED, text)
    ].join("|");
  }
  function shrinkWrapStyleKey(input) {
    let style = (input.getAttribute("style") ?? "").replace(/(^|;)\s*max-width:[^;]*;?/g, "$1");
    return input instanceof HTMLElement ? `${style}|${readShrinkWrapBaseline(input)}` : style;
  }
  function shrinkWrapAncestorWidths(input) {
    let widths = [];
    for (let parentElement = input.parentElement, index4 = 0; parentElement && index4 < SHRINK_WRAP_MAX_LINE_RECTS; parentElement = parentElement.parentElement, index4++)
      widths.push(parentElement.offsetWidth);
    return widths;
  }
  function shrinkWrapAncestorsMatch(input, rooms) {
    let widths = shrinkWrapAncestorWidths(input);
    return widths.length === rooms.length && widths.every((width, index4) => Math.abs(width - (rooms[index4] ?? 0)) <= 1);
  }
  function shrinkWrapParentContentWidth(input) {
    let parentElement = input.parentElement, style = parentElement?.ownerDocument.defaultView?.getComputedStyle(parentElement);
    return !parentElement || !style ? 0 : parentElement.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  }
  function measureShrinkWrapLineRects(element, options) {
    let ownerDocument2 = element.ownerDocument, defaultView = ownerDocument2.defaultView, items = [], POSITIVE_INFINITY = Number.POSITIVE_INFINITY, NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY, callback = (input) => {
      items.push(input), input.left < POSITIVE_INFINITY && (POSITIVE_INFINITY = input.left), input.right > NEGATIVE_INFINITY && (NEGATIVE_INFINITY = input.right);
    }, index4 = 0, POSITIVE_INFINITY2 = Number.POSITIVE_INFINITY, NEGATIVE_INFINITY2 = Number.NEGATIVE_INFINITY, callback2 = (input) => {
      input.left < POSITIVE_INFINITY2 && (POSITIVE_INFINITY2 = input.left), input.right > NEGATIVE_INFINITY2 && (NEGATIVE_INFINITY2 = input.right);
    }, callback3 = (input) => {
      for (let value4 = input.nodeType === 1 ? input : input.parentElement; value4 && value4 !== element; value4 = value4.parentElement)
        if (value4.getAttribute("data-shrinkwrap") === "fill")
          return !0;
      return !1;
    }, value = ownerDocument2.createRange(), value2 = ownerDocument2.createTreeWalker(element, 5, {
      acceptNode: (input) => {
        if (input.nodeType === 1) {
          let value4 = defaultView?.getComputedStyle(input);
          return value4 && (value4.display === "none" || value4.position === "absolute" || value4.position === "fixed") ? 2 : 1;
        }
        return callback3(input) ? 2 : 1;
      }
    }), value3 = value2.nextNode();
    for (; value3; ) {
      if (value3.nodeType === 3) {
        value.selectNodeContents(value3);
        for (let value4 of value.getClientRects?.() ?? [])
          value4.width > 0 && (callback(value4), callback2(value4));
      } else {
        let value4 = value3, value5 = defaultView?.getComputedStyle(value4), bounds = value4.getBoundingClientRect();
        if (bounds.width > 0 && callback2(bounds), value5 && !callback3(value4) && isShrinkWrapAtomicElement(value4, value5))
          for (let value6 of value4.getClientRects())
            value6.width > 0 && callback(value6);
        value5 && (value5.overflowX !== "visible" || value5.overflowY !== "visible") && (index4 += Math.max(0, value4.scrollWidth - value4.clientWidth) + Math.max(0, value4.scrollHeight - value4.clientHeight));
      }
      if (options && NEGATIVE_INFINITY > POSITIVE_INFINITY && options(NEGATIVE_INFINITY - POSITIVE_INFINITY))
        break;
      value3 = value2.nextNode();
    }
    return {
      rects: items,
      left: POSITIVE_INFINITY,
      right: NEGATIVE_INFINITY,
      clipped: index4,
      boundLeft: POSITIVE_INFINITY2,
      boundRight: NEGATIVE_INFINITY2
    };
  }
  function isShrinkWrapAtomicElement(input, options) {
    return shrinkWrapAtomicTags.has(input.tagName.toUpperCase()) ? !0 : options.display.startsWith("inline");
  }
  function measureShrinkWrapLayout(element, { rects, clipped, boundLeft, boundRight }) {
    let value = element.ownerDocument.defaultView?.getComputedStyle(element), bounds = element.getBoundingClientRect(), index4 = 0;
    if (value && Number.isFinite(boundLeft)) {
      let value2 = parseFloat(value.width), value3 = value.boxSizing === "border-box" ? value2 : value2 + parseFloat(value.paddingLeft) + parseFloat(value.paddingRight) + parseFloat(value.borderLeftWidth) + parseFloat(value.borderRightWidth), value4 = value3 > 0 && bounds.width / value3 || 1, value5 = bounds.left + (parseFloat(value.borderLeftWidth) + parseFloat(value.paddingLeft)) * value4, value6 = bounds.right - (parseFloat(value.borderRightWidth) + parseFloat(value.paddingRight)) * value4;
      index4 = Math.max(0, boundRight - value6) + Math.max(0, value5 - boundLeft);
    }
    return {
      height: element.scrollHeight,
      overflow: element.scrollWidth,
      client: element.clientWidth,
      spill: index4,
      clipped,
      widths: rects.map((input) => input.width)
    };
  }
  function shrinkWrapLayoutWorsened(input, options) {
    return options.height > input.height || options.overflow > options.client + 0.5 || options.spill > input.spill + 0.5 || options.clipped > input.clipped + 0.5 ? !1 : input.widths.length === options.widths.length && input.widths.every((input2, options2) => Math.abs(input2 - (options.widths[options2] ?? NaN)) <= 0.5);
  }
  function shrinkWrapLayoutImproved(input, options) {
    return (options.height < input.height || options.clipped < input.clipped - 0.5) && input.widths.length === options.widths.length && input.widths.every((input2, options2) => Math.abs(input2 - (options.widths[options2] ?? NaN)) <= 0.5);
  }
  function restoreShrinkWrapWidth(input) {
    shrinkWrapBaselineWidths.has(input) && (captureShrinkWrapBaseline(input), writeShrinkWrapWidth(input, shrinkWrapBaselineWidths.get(input) ?? ""));
  }
  function createShrinkWrapJob(input, options, context = {}) {
    return {
      el: input,
      done: options,
      lookup: context.lookup ?? !1,
      remember: context.remember ?? !1,
      key: void 0,
      rules: "",
      width: null,
      boxWidth: 0,
      borderBoxSizing: !0,
      natural: null,
      candidate: 0,
      stage: "read",
      lo: 0,
      hi: 0,
      probes: 0,
      resizeDue: !1
    };
  }
  function settleShrinkWrapJob(input, options) {
    options === null ? restoreShrinkWrapWidth(input.el) : writeShrinkWrapWidth(input.el, `${options}px`), input.stage = "settled", input.width = options, input.done(options);
  }
  function storeShrinkWrapResult(input, options) {
    let { el: element } = input;
    if (!input.remember || input.natural === null || readShrinkWrapBaseline(element) !== "" || element.ownerDocument.fonts?.status === "loading")
      return;
    let key = input.key === void 0 ? shrinkWrapContentKey(element) : input.key, rooms = shrinkWrapAncestorWidths(element);
    key === null || rooms.every((width) => width <= 0) || rememberShrinkWrapWidth(element.ownerDocument, key, {
      width: options,
      natural: input.natural,
      rooms,
      content: shrinkWrapParentContentWidth(element),
      rules: input.rules
    });
  }
  function readShrinkWrapNaturalLayout(input) {
    let { el: value } = input, defaultView = value.ownerDocument.defaultView;
    if (!defaultView || typeof value.getBoundingClientRect != "function") {
      settleShrinkWrapJob(input, null);
      return;
    }
    let style = defaultView.getComputedStyle(value), value2 = parseFloat(style.width);
    if (!Number.isFinite(value2) || value2 <= 0) {
      settleShrinkWrapJob(input, null);
      return;
    }
    let value3 = style.boxSizing === "border-box", value4 = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth), value5 = value3 ? value2 : value2 + value4, value6 = value.getBoundingClientRect().width / value5 || 1, callback = (input2) => {
      let value9 = input2 / value6;
      return Math.ceil((value3 ? value9 + value4 : value9) - 1e-3);
    }, callback2 = (input2) => callback(input2) >= value2 - 0.5, value7 = measureShrinkWrapLineRects(value, callback2);
    if (value7.rects.length === 0) {
      settleShrinkWrapJob(input, null);
      return;
    }
    let value8 = value7.right - value7.left;
    if (callback2(value8)) {
      settleShrinkWrapJob(input, null);
      return;
    }
    input.natural = measureShrinkWrapLayout(value, value7), input.rules = input.remember ? shrinkWrapTextRules(style) : "", input.boxWidth = value2, input.borderBoxSizing = value3, input.candidate = callback(value8), input.stage = "verify";
  }
  function checkShrinkWrapCandidate(input, natural) {
    if (natural === null)
      return !1;
    let value = measureShrinkWrapLayout(input, measureShrinkWrapLineRects(input));
    return shrinkWrapLayoutImproved(natural, value) ? "shrank" : shrinkWrapLayoutWorsened(natural, value);
  }
  function applyRememberedShrinkWraps(input) {
    let hits = [], pending = [];
    for (let job of input) {
      let hit = lookupShrinkWrapMemory(job);
      hit ? hits.push(hit) : pending.push(job);
    }
    for (let { job, known } of hits)
      known.width === null ? restoreShrinkWrapWidth(job.el) : writeShrinkWrapWidth(job.el, `${known.width}px`);
    for (let { job, key, known } of hits) {
      let { el: element } = job;
      shrinkWrapAncestorsMatch(element, known.rooms) && Math.abs(shrinkWrapParentContentWidth(element) - known.content) <= 1 && shrinkWrapRulesMatch(element, known.rules) && checkShrinkWrapCandidate(element, known.natural) === !0 ? (job.stage = "settled", job.width = known.width, job.done(known.width), rememberShrinkWrapWidth(element.ownerDocument, key, known)) : pending.push(job);
    }
    return pending;
  }
  function shrinkWrapRulesMatch(input, rules) {
    let style = input.ownerDocument.defaultView?.getComputedStyle(input);
    return style !== void 0 && shrinkWrapTextRules(style) === rules;
  }
  function lookupShrinkWrapMemory(input) {
    if (!input.lookup)
      return;
    if (input.lookup = !1, captureShrinkWrapBaseline(input.el), readShrinkWrapBaseline(input.el) !== "") {
      input.remember = !1;
      return;
    }
    input.key = shrinkWrapContentKey(input.el);
    let known = input.key === null ? void 0 : recallShrinkWrapWidth(input.el, input.key);
    return known && input.key !== null ? {
      job: input,
      key: input.key,
      known
    } : void 0;
  }
  function advanceShrinkWrapSearch(input, options) {
    let { boxWidth: value } = input;
    if (input.stage === "verify") {
      if (options)
        return settleShrinkWrapJob(input, input.candidate), null;
      if (input.stage = "nudge1", input.candidate + 1 < value)
        return input.candidate + 1;
      input.stage = "bisect";
    } else if (input.stage === "nudge1") {
      if (options)
        return settleShrinkWrapJob(input, input.candidate + 1), null;
      if (input.stage = "nudge2", input.candidate + 2 < value)
        return input.candidate + 2;
      input.stage = "bisect";
    } else if (input.stage === "nudge2") {
      if (options)
        return settleShrinkWrapJob(input, input.candidate + 2), null;
      input.stage = "bisect";
    } else if (input.stage === "bisect") {
      input.probes += 1;
      let value2 = input.lo > 0 ? Math.floor((input.lo + input.hi) / 2) : NaN;
      options ? input.hi = value2 : input.lo = value2;
    }
    return input.stage === "bisect" ? (input.lo === 0 && (input.lo = input.candidate + 2, input.hi = Math.ceil(value)), input.probes >= SHRINK_WRAP_MAX_ITERATIONS || input.hi - input.lo <= 1 ? (input.hi < value - 0.5 ? settleShrinkWrapJob(input, input.hi) : settleShrinkWrapJob(input, null), null) : Math.floor((input.lo + input.hi) / 2)) : null;
  }
  function runShrinkWrapJobs(input) {
    for (let value2 of input)
      captureShrinkWrapBaseline(value2.el), restoreShrinkWrapWidth(value2.el);
    for (let value2 of input)
      readShrinkWrapNaturalLayout(value2);
    let value = input.filter((input2) => input2.stage === "verify");
    for (let value2 of value)
      writeShrinkWrapWidth(value2.el, `${value2.candidate}px`);
    for (let index4 = 0; value.length > 0 && index4 < 16; index4++) {
      let value2 = value.map((input2) => [
        input2,
        checkShrinkWrapCandidate(input2.el, input2.natural)
      ]), items = [];
      for (let [value3, value4] of value2) {
        if (value4 === "shrank") {
          settleShrinkWrapJob(value3, null);
          continue;
        }
        let value5 = advanceShrinkWrapSearch(value3, value4);
        value5 !== null && items.push([value3, value5]);
      }
      for (let [value3, value4] of items)
        writeShrinkWrapWidth(value3.el, `${value4}px`);
      value = items.map(([input2]) => input2);
    }
    for (let value2 of value)
      value2.stage !== "settled" && settleShrinkWrapJob(value2, null);
  }
  function shrinkWrapSynchronously(input) {
    let value = null;
    return runShrinkWrapJobs([
      createShrinkWrapJob(input, (input2) => {
        value = input2;
      })
    ]), value;
  }
  function getShrinkWrapQueue(input) {
    let entry = shrinkWrapQueues.get(input);
    return entry || (entry = {
      queue: /* @__PURE__ */ new Map(),
      microtaskQueued: !1,
      frameQueued: 0
    }, shrinkWrapQueues.set(input, entry)), entry;
  }
  function drainShrinkWrapQueue(input, options, items) {
    let pending = applyRememberedShrinkWraps(items);
    if (pending.length > 0) {
      runShrinkWrapJobs(pending);
      for (let job of pending)
        job.stage === "settled" && storeShrinkWrapResult(job, job.width);
    }
    options.queue.size > 0 || (options.frameQueued && (input.cancelAnimationFrame(options.frameQueued), options.frameQueued = 0), options.microtaskQueued || shrinkWrapQueues.delete(input));
  }
  function flushShrinkWrapMicrotask(input) {
    let entry = shrinkWrapQueues.get(input);
    if (!entry)
      return;
    entry.microtaskQueued = !1, entry.frameQueued && (input.cancelAnimationFrame(entry.frameQueued), entry.frameQueued = 0);
    let items = [...entry.queue.values()];
    entry.queue.clear(), drainShrinkWrapQueue(input, entry, items);
  }
  function flushShrinkWrapResizeJobs(input) {
    let entry = shrinkWrapQueues.get(input);
    if (!entry)
      return;
    let items = [];
    for (let [value, value2] of entry.queue)
      value2.resizeDue && (entry.queue.delete(value), items.push(value2));
    drainShrinkWrapQueue(input, entry, items);
  }
  function enqueueShrinkWrapJob(element, options, context, jobOptions = {}) {
    let defaultView = element.ownerDocument.defaultView;
    if (!defaultView) {
      options(shrinkWrapSynchronously(element));
      return;
    }
    let value = getShrinkWrapQueue(defaultView), entry = value.queue.get(element);
    entry ? (entry.done = options, entry.lookup ||= jobOptions.lookup ?? !1, entry.remember &&= jobOptions.remember ?? !1) : (entry = createShrinkWrapJob(element, options, jobOptions), value.queue.set(element, entry)), context === "microtask" ? value.microtaskQueued || (value.microtaskQueued = !0, queueMicrotask(() => {
      flushShrinkWrapMicrotask(defaultView);
    })) : context === "resize" ? entry.resizeDue = !0 : !value.frameQueued && !value.microtaskQueued && (value.frameQueued = defaultView.requestAnimationFrame(() => {
      flushShrinkWrapMicrotask(defaultView);
    }));
  }
  function cancelShrinkWrapJob(element) {
    let defaultView = element.ownerDocument.defaultView;
    if (!defaultView)
      return;
    let entry = shrinkWrapQueues.get(defaultView);
    entry && (entry.queue.delete(element), drainShrinkWrapQueue(defaultView, entry, []));
  }
  function shouldRecomputeShrinkWrap(input) {
    if (input.self) {
      let value = input.applied !== null && Math.abs(input.inline - input.applied) <= 1;
      return Math.abs(input.block - input.prevBlock) > 1 || !value && Math.abs(input.inline - input.prevInline) > 1;
    }
    return Math.abs(input.inline - input.prevInline) > 1;
  }
  function registerShrinkWrapResizeHandler(input, options, context) {
    let entry = shrinkWrapResizeObservers.get(input);
    if (!entry) {
      let entries = /* @__PURE__ */ new Map();
      entry = {
        observer: new input.ResizeObserver((input2) => {
          for (let value of input2)
            for (let value2 of entries.get(value.target) ?? [])
              value2(value);
          flushShrinkWrapResizeJobs(input);
        }),
        handlers: entries,
        paused: /* @__PURE__ */ new Set(),
        resumeQueued: 0
      }, shrinkWrapResizeObservers.set(input, entry);
    }
    let entry2 = entry.handlers.get(options);
    if (!entry2) {
      try {
        entry.observer.observe(options);
      } catch (value) {
        throw entry.handlers.size === 0 && shrinkWrapResizeObservers.delete(input), value;
      }
      entry2 = /* @__PURE__ */ new Set(), entry.handlers.set(options, entry2);
    }
    entry2.add(context);
  }
  function unregisterShrinkWrapResizeHandler(input, options, context) {
    let entry = shrinkWrapResizeObservers.get(input), value = entry?.handlers.get(options);
    !entry || !value || (value.delete(context), value.size === 0 && (entry.handlers.delete(options), entry.paused.delete(options), entry.observer.unobserve(options)), entry.handlers.size === 0 && (entry.observer.disconnect(), entry.resumeQueued && input.cancelAnimationFrame(entry.resumeQueued), shrinkWrapResizeObservers.delete(input)));
  }
  function pauseShrinkWrapResizeObservation(input, options) {
    let entry = shrinkWrapResizeObservers.get(input);
    !entry || !entry.handlers.has(options) || entry.paused.has(options) || (entry.observer.unobserve(options), entry.paused.add(options), entry.resumeQueued || (entry.resumeQueued = input.requestAnimationFrame(() => {
      entry.resumeQueued = 0;
      for (let value of entry.paused)
        entry.handlers.has(value) && entry.observer.observe(value);
      entry.paused.clear();
    })));
  }
  function subscribeShrinkWrapWindowResize(input, options) {
    if (typeof input?.addEventListener != "function")
      return () => {
      };
    let entry = shrinkWrapWindowResizeStores.get(input);
    if (!entry) {
      let values = /* @__PURE__ */ new Set(), callback = () => {
        for (let value2 of values)
          value2();
      };
      input.addEventListener("loadingdone", callback), entry = {
        refits: values,
        listener: callback
      }, shrinkWrapWindowResizeStores.set(input, entry);
    }
    let value = entry;
    return value.refits.add(options), () => {
      value.refits.delete(options), value.refits.size === 0 && shrinkWrapWindowResizeStores.get(input) === value && (shrinkWrapWindowResizeStores.delete(input), input.removeEventListener?.("loadingdone", value.listener));
    };
  }
  function observeShrinkWrap(element, { immediate: options = !1, remember = !1 } = {}) {
    let rememberable = remember && !options, flag = !1, value = null, defaultView = element.ownerDocument.defaultView, entries = /* @__PURE__ */ new Map(), items = [], callback = (input) => {
      let value4 = input;
      entries.set(input, {
        inline: value4.offsetWidth ?? 0,
        block: value4.offsetHeight ?? 0
      });
    }, value2 = defaultView?.ResizeObserver ? defaultView : null, index4 = 0, callback2 = (input) => {
      if (!flag) {
        value = input;
        for (let value4 of items)
          callback(value4);
        if (value2 && index4 > 0)
          for (let value4 of items.slice(index4))
            pauseShrinkWrapResizeObservation(value2, value4);
        index4 = 0;
      }
    }, callback3 = (input) => {
      flag || enqueueShrinkWrapJob(element, callback2, input, {
        remember: rememberable && input !== "resize"
      });
    }, callback4 = (event) => {
      let value4 = event.borderBoxSize?.[0], value5 = value4 ? value4.inlineSize : event.contentRect.width, value6 = value4 ? value4.blockSize : event.contentRect.height, value7 = entries.get(event.target) ?? {
        inline: value5,
        block: value6
      };
      entries.set(event.target, {
        inline: value5,
        block: value6
      });
      let value8 = event.target === element;
      shouldRecomputeShrinkWrap({
        self: value8,
        inline: value5,
        block: value6,
        prevInline: value7.inline,
        prevBlock: value7.block,
        applied: value
      }) && (value8 || (index4 = Math.max(index4, items.indexOf(event.target))), callback3(value8 ? "frame" : "resize"));
    }, callback5 = (input) => {
      value2 && registerShrinkWrapResizeHandler(value2, input, callback4), items.push(input), options && callback(input);
    }, value3 = null, callback6 = () => {
    }, callback7 = () => {
      if (flag = !0, cancelShrinkWrapJob(element), value2)
        for (let value4 of items)
          unregisterShrinkWrapResizeHandler(value2, value4, callback4);
      value3?.disconnect(), callback6(), restoreShrinkWrapWidth(element);
    };
    try {
      options ? value = shrinkWrapSynchronously(element) : enqueueShrinkWrapJob(element, callback2, "microtask", {
        lookup: rememberable,
        remember: rememberable
      }), callback5(element);
      for (let parentElement = element.parentElement, index22 = 0; parentElement && index22 < SHRINK_WRAP_MAX_LINE_RECTS; parentElement = parentElement.parentElement, index22++)
        callback5(parentElement);
      if (defaultView?.MutationObserver) {
        let value4 = new defaultView.MutationObserver(() => {
          callback3("microtask");
        });
        value4.observe(element, {
          subtree: !0,
          childList: !0,
          characterData: !0,
          attributes: !0,
          attributeFilter: [SHRINK_WRAP_ATTRIBUTE]
        }), value3 = value4;
      }
      let fonts = element.ownerDocument.fonts, callback8 = () => callback3("microtask");
      if (callback6 = subscribeShrinkWrapWindowResize(fonts, callback8), fonts && fonts.status !== "loaded")
        try {
          let ready2 = fonts.ready;
          typeof ready2?.then == "function" && ready2.then(callback8, callback8);
        } catch {
        }
    } catch (value4) {
      try {
        callback7();
      } catch {
      }
      throw value4;
    }
    return callback7;
  }
  function useShrinkWrapMemory() {
    return reactShrinkWrap.useContext(runtime2.shrinkWrapMemoryContext) ?? !1;
  }
  function useShrinkWrapRef({ enabled: input = !0, immediate: input2 = !1 } = {}) {
    let remember = useShrinkWrapMemory(), ref = reactShrinkWrap.useRef(null);
    return reactShrinkWrap.useCallback((input3) => {
      let current = ref.current;
      if (ref.current = null, current && (0, runtime2.invokeAndReportError)(current), !!input3) {
        if (!input) {
          restoreShrinkWrapWidth(input3);
          return;
        }
        (0, runtime2.invokeAndReportError)(() => {
          ref.current = observeShrinkWrap(input3, {
            immediate: input2,
            remember
          });
        });
      }
    }, [input, input2, remember]);
  }
  function getButtonBackgroundLayerClasses(input) {
    return `${buttonBackgroundLayerClasses} ${!input.joined && input.solid ? buttonSolidInsetClasses : "inset-0"} ${input.joined ? "" : buttonBackgroundShadowClasses}`;
  }
  function getDisabledReasonWrapperProps(input, options, context) {
    let value = hasDisabledReason(input);
    return {
      tabIndex: value ? 0 : -1,
      "aria-describedby": value ? options : void 0,
      "data-cds-disabled-reason-wrapper": "",
      className: (0, runtime2.cn)("inline-flex", disabledReasonFocusClasses, context)
    };
  }
  function hasDisabledReason(input) {
    return !!input;
  }
  function disabledReasonKey(input) {
    if (input == null || input === "" || typeof input == "boolean")
      return "none";
    if (Array.isArray(input))
      return `[${input.map(disabledReasonKey).join(",")}]`;
    if (!reactDisabledReason.isValidElement(input))
      return typeof input;
    let key = input.key ?? "", type = input.type;
    if (type === reactDisabledReason.Fragment || typeof type == "string") {
      let { children } = input.props;
      return `<${String(type)}:${key}>${disabledReasonKey(children)}`;
    }
    if (typeof type != "function" && (typeof type != "object" || !type))
      return `tag:${String(type)}:${key}`;
    let id = disabledReasonTypeIds.get(type);
    return id === void 0 && (id = `type:${nextDisabledReasonTypeId++}`, disabledReasonTypeIds.set(type, id)), `${id}:${key}`;
  }
  function DisabledReasonAnnouncement({ id, reason }) {
    let ref = reactDisabledReason.useRef(null);
    return reactDisabledReason.useEffect(() => {
    }, [reason]), jsxDisabledReason.jsx("span", {
      ref,
      id,
      hidden: !0,
      [DISABLED_REASON_ATTRIBUTE]: "",
      children: hasDisabledReason(reason) ? reason : null
    }, disabledReasonKey(hasDisabledReason(reason) ? reason : null));
  }
  function DarkTooltipScope({ children }) {
    return jsxTooltipClasses.jsx("div", {
      className: "cds-dark-scope contents",
      "data-mode": "dark",
      children
    });
  }
  function useTooltipsDisabled() {
    return reactTooltipContext.useContext(tooltipsDisabledContext);
  }
  function cancelInputDismissingTooltipOpen(input, options) {
    return input && options.reason === "trigger-focus" && (0, runtime2.isInputTriggeredBlur)(options.event) ? (options.cancel(), !0) : !1;
  }
  function closePreviousTooltip(input) {
    activeTooltipActionsRef !== null && activeTooltipActionsRef !== input && activeTooltipActionsRef.current?.closeInstant(), activeTooltipActionsRef = input;
  }
  function releaseTooltip(input) {
    activeTooltipActionsRef === input && (activeTooltipActionsRef = null);
  }
  function useTooltipSingleton(input, active) {
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      if (active)
        return closePreviousTooltip(input), () => releaseTooltip(input);
    }, [input, active]);
  }
  function isOpenPopupTrigger(input) {
    let node = input;
    if (node?.nodeType !== 1)
      return !1;
    let element = node, popup = element.getAttribute("aria-haspopup");
    return popup !== null && popup !== "false" && element.getAttribute("aria-expanded") === "true";
  }
  function cancelHoverOverOpenPopup(input, options) {
    return input && options.reason === "trigger-hover" && isOpenPopupTrigger(options.trigger ?? options.event?.target) ? (options.cancel(), !0) : !1;
  }
  function isElementFocusVisible(input) {
    try {
      return input.matches(":focus-visible");
    } catch {
      return !1;
    }
  }
  function findFocusedOverflowLabel(event) {
    let target = event.target, owner = target?.nodeType === 1 ? target : null;
    if (owner === null || !owner.matches(OVERFLOW_TOOLTIP_REVEAL_SELECTOR) || !isElementFocusVisible(owner) || (0, runtime2.isInputTriggeredBlur)(event))
      return;
    let label = [
      ...owner.querySelectorAll('[data-cds="OverflowTooltip"]')
    ].find((input) => overflowTooltipRevealers.has(input) && input.closest(OVERFLOW_TOOLTIP_OWNER_SELECTOR) === owner && isOverflowClipped(input));
    return label === void 0 ? void 0 : {
      label,
      owner
    };
  }
  function hideFocusedOverflowTooltip(input) {
    let focused = focusedOverflowLabels.get(input);
    focusedOverflowLabels.delete(input), focused !== void 0 && overflowTooltipRevealers.get(focused.label)?.(!1);
  }
  function handleOverflowTooltipFocusIn(event) {
    let doc = event.currentTarget;
    hideFocusedOverflowTooltip(doc);
    let returning = focusBeforeWindowBlur.get(doc) === event.target;
    focusBeforeWindowBlur.delete(doc);
    let focused = returning ? void 0 : findFocusedOverflowLabel(event);
    focused !== void 0 && (focusedOverflowLabels.set(doc, focused), overflowTooltipRevealers.get(focused.label)?.(!0));
  }
  function rememberFocusBeforeWindowBlur(event) {
    let doc = event.currentTarget.document;
    doc.activeElement !== null && focusBeforeWindowBlur.set(doc, doc.activeElement);
  }
  function handleOverflowTooltipFocusOut(event) {
    hideFocusedOverflowTooltip(event.currentTarget);
  }
  function handleOverflowTooltipKeyDown(event) {
    let doc = event.currentTarget, label = focusedOverflowLabels.get(doc)?.label;
    if (label !== void 0 && overflowTooltipRevealers.has(label) && label.hasAttribute("data-popup-open"))
      if (event.key === "Escape") {
        if (reactDomTooltip.flushSync(() => hideFocusedOverflowTooltip(doc)), label.hasAttribute("data-popup-open"))
          return;
        event.preventDefault(), event.stopPropagation();
      } else
        (event.key === "Enter" || event.key === " ") && hideFocusedOverflowTooltip(doc);
  }
  function watchOverflowTooltipFocus(input) {
    watchedOverflowDocuments.has(input) || (watchedOverflowDocuments.add(input), input.addEventListener("focusin", handleOverflowTooltipFocusIn, !0), input.addEventListener("focusout", handleOverflowTooltipFocusOut, !0), input.addEventListener("click", handleOverflowTooltipFocusOut, !0), input.addEventListener("keydown", handleOverflowTooltipKeyDown, !0), input.defaultView?.addEventListener("blur", rememberFocusBeforeWindowBlur));
  }
  function isOverflowClipped(input) {
    return input.scrollWidth > input.clientWidth || isTextRangeClipped(input);
  }
  function useOverflowTooltipFocusReveal(input, disabled2) {
    let [value, value2] = reactTooltip.useState("no");
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = input.current;
      if (current === null || disabled2)
        return;
      watchOverflowTooltipFocus(current.ownerDocument), overflowTooltipRevealers.set(current, (show) => value2(show ? "shown" : settleOverflowReveal));
      let focused = focusedOverflowLabels.get(current.ownerDocument);
      return (focused?.label !== current || !isElementFocusVisible(focused.owner)) && value2(settleOverflowReveal), () => {
        overflowTooltipRevealers.delete(current);
      };
    }, [disabled2, input]), [
      value,
      (open4) => value2((state) => open4 ? "no" : settleOverflowReveal(state))
    ];
  }
  function isEmptyTooltipContent(input) {
    return input == null || input === "" || typeof input == "boolean" || Array.isArray(input) && input.every(isEmptyTooltipContent);
  }
  function evaluateTooltipContent(input) {
    let value = input();
    return isEmptyTooltipContent(value) ? TOOLTIP_NO_SHOW : value;
  }
  function TooltipShortcut({ keys, className }) {
    return jsxTooltip.jsx(Shortcut, {
      keys,
      variant: "text",
      className: (0, runtime2.cn)("text-[calc(0.75rem*var(--cds-rem-scale,1))] [--cds-shortcut-cap-ink:var(--cds-text-muted)]", className)
    });
  }
  function Tooltip({ content, detail, secondaryHint, multiline, shortcut, side: side2 = "top", align: align2, anchor, sideOffset = 4, collisionPadding, collisionAvoidance, trackCursorAxis, delay, open: open4, onOpenChange, closeDelay, hoverable = !1, closeOnClick, lazy = !1, openOnHandedBackFocus = !1, triggerRef, container, className, children }) {
    let groupDelay = reactTooltip.useContext(tooltipDelayContext), resolvedDelay = delay ?? groupDelay ?? TOOLTIP_DEFAULT_DELAY, value = (0, runtime2.usePortalContainer)(), value2 = useShrinkWrapRef({
      immediate: !0
    }), value3 = reactTooltip.useId(), ref = reactTooltip.useRef(null), [value4, value5] = reactTooltip.useState(!1), ref2 = reactTooltip.useRef({
      closeInstant: () => {
        value5(!0), ref.current?.close();
      }
    }), [value6, value7] = reactTooltip.useState(null), [value8, value9] = reactTooltip.useState(closedTooltipState);
    open4 === !1 && value8.open && value9(closeTooltipState);
    let value10 = typeof content == "function", value11 = value10 || !isEmptyTooltipContent(content), value12 = !value10 && value11 ? content : value8.body, value13 = !isEmptyTooltipContent(value12), value14 = (open4 ?? value8.open) && (!value10 || value13);
    !value10 && value11 && value14 && !Object.is(value8.body, content) && value9(replaceTooltipBody(content));
    let callback = reactTooltip.useCallback((input, options) => {
      if (!openOnHandedBackFocus && cancelInputDismissingTooltipOpen(input, options) || cancelHoverOverOpenPopup(input, options))
        return !1;
      if (input) {
        if (typeof content != "function")
          value9(openTooltipWithBody(content));
        else if (value14)
          value9(openTooltipState);
        else {
          let value29 = evaluateTooltipContent(content);
          if (value29 === TOOLTIP_NO_SHOW)
            return options.cancel(), !1;
          value9(openTooltipWithBody(value29));
        }
        value5(!1);
      } else
        value9(value14 ? closeTooltipState : resetTooltipState);
      return value7(input && options.reason === "trigger-hover" ? options.trigger ?? null : null), !input && !value14 && options.reason === "none" || onOpenChange?.(input), !0;
    }, [onOpenChange, openOnHandedBackFocus, content, value14]), hasTrigger = children !== void 0 || anchor === void 0;
    useTooltipSingleton(ref2, hasTrigger && value11 && value14);
    let callback2 = reactTooltip.useCallback((input) => {
      input || (value5(!1), value7(null), value9(clearTooltipBody));
    }, []);
    reactTooltip.useEffect(() => {
      if (!value6)
        return;
      let ownerDocument2 = value6.ownerDocument, callback5 = (event) => {
        let target = event.target;
        target && target !== value6 && target.contains(value6) && ref2.current.closeInstant();
      };
      ownerDocument2.addEventListener("scroll", callback5, {
        capture: !0,
        passive: !0
      });
      let defaultView = ownerDocument2.defaultView, observer = defaultView === null ? null : (0, runtime2.createSafeMutationObserver)(defaultView.MutationObserver, () => {
        isOpenPopupTrigger(value6) && ref2.current.closeInstant();
      });
      return observer?.observe(value6, {
        attributes: !0,
        attributeFilter: ["aria-expanded"]
      }), () => {
        ownerDocument2.removeEventListener("scroll", callback5, {
          capture: !0
        }), observer?.disconnect();
      };
    }, [value6]);
    let value16 = (0, runtime2.useDefaultOverlayLayer)("tooltip"), [value17] = reactTooltip.useState(() => lazy && open4 === void 0 ? runtime2.baseTooltip.createHandle() : null), [value18, value19] = reactTooltip.useState(!1), value20 = value18 || value17 === null, ref3 = reactTooltip.useRef(!1), callback3 = reactTooltip.useCallback(() => {
      ref3.current = !0, value19(!0);
    }, []), value21 = useCancelableTimeout(), ref4 = reactTooltip.useRef(null), ref5 = reactTooltip.useRef(!1);
    reactTooltip.useEffect(() => {
      open4 === !1 && (ref5.current = !1);
    }, [open4]);
    let value22 = (0, runtime2.useOptionalEventCallback)(() => {
      if (ref3.current || value20 || !value11 || open4 !== void 0 || isOpenPopupTrigger(ref4.current))
        return;
      let value29;
      if (typeof content == "function") {
        let value30 = evaluateTooltipContent(content);
        if (value30 === TOOLTIP_NO_SHOW)
          return;
        value29 = value30;
      } else
        value29 = content;
      callback3(), value5(!1), value7(ref4.current), value9(openTooltipWithBody(value29)), ref5.current = !0, onOpenChange?.(!0);
    }), pointerSeen = reactTooltip.useRef(!1), value23 = (0, runtime2.useOptionalEventCallback)((input) => {
      switch (input.type) {
        case "pointerdown":
          closeOnClick !== !1 && (pointerSeen.current = !0, value21.cancel());
          return;
        case "pointerleave":
          pointerSeen.current = !1, value21.cancel();
          return;
        case "pointermove":
          if (pointerSeen.current || !input.currentTarget.contains(input.target))
            return;
      }
      pointerSeen.current = !0, !(value20 || input.pointerType === "touch") && value11 && (ref4.current = input.currentTarget, value21.start(resolvedDelay, value22));
    }), value25 = (0, runtime2.useOptionalEventCallback)((event) => {
      value20 || isElementFocusVisible(event.target) && (!openOnHandedBackFocus && (0, runtime2.isInputTriggeredBlur)(event.nativeEvent) || (ref4.current = null, value21.cancel(), value22()));
    });
    value17 !== null && open4 === !0 && !value18 && value19(!0);
    let callback4 = reactTooltip.useCallback((input, options) => {
      if (!(!openOnHandedBackFocus && cancelInputDismissingTooltipOpen(input, options))) {
        if (input && ref5.current && value14) {
          value9(openTooltipState);
          return;
        }
        callback(input, options) && (ref5.current = input);
      }
    }, [callback, openOnHandedBackFocus, value14]), value26 = reactTooltip.isValidElement(children) && children.type !== reactTooltip.Fragment ? children : (input) => jsxTooltip.jsx("span", {
      ...input,
      className: "inline-flex",
      children
    }), value27 = hasTrigger && jsxTooltip.jsx(runtime2.baseTooltip.Trigger, {
      ref: triggerRef,
      id: value3,
      delay: resolvedDelay,
      closeDelay,
      closeOnClick,
      handle: value17 ?? void 0,
      disabled: value17 !== null && !value20 ? !value11 : void 0,
      onPointerEnter: value17 ? value23 : void 0,
      onPointerMove: value17 ? value23 : void 0,
      onPointerLeave: value17 ? value23 : void 0,
      onPointerDown: value17 ? value23 : void 0,
      onFocus: value17 ? value25 : void 0,
      render: value26
    }), value28 = value20 && value13 ? jsxTooltip.jsx(runtime2.baseTooltip.Portal, {
      container: container ?? value,
      children: jsxTooltip.jsx(runtime2.PortalRoot, {
        popup: !0,
        children: jsxTooltip.jsx(runtime2.CollisionPaddingProvider, {
          override: collisionPadding,
          container: container ?? value,
          children: (input) => jsxTooltip.jsx(runtime2.layerBaseContext.Provider, {
            value: value16.base,
            children: jsxTooltip.jsx(runtime2.baseTooltip.Positioner, {
              "data-cds": "Tooltip",
              className: "data-[anchor-hidden]:invisible",
              style: value16.style,
              side: side2,
              align: align2,
              anchor,
              sideOffset,
              collisionPadding: input,
              collisionAvoidance,
              positionMethod: "fixed",
              children: jsxTooltip.jsx(runtime2.baseTooltip.Popup, {
                ref: value2,
                role: "tooltip",
                style: value4 ? {
                  transition: "none"
                } : void 0,
                className: (0, runtime2.cn)(tooltipSingleLineClasses, tooltipSecondaryDetailClasses, multiline || detail || secondaryHint ? tooltipMultilineBodyClasses : tooltipContentRowClasses, !shortcut && tooltipTextBalanceClass, className),
                children: jsxTooltip.jsx(DarkTooltipScope, {
                  children: multiline || detail || secondaryHint ? jsxTooltip.jsxs(jsxTooltip.Fragment, {
                    children: [
                      jsxTooltip.jsxs("span", {
                        className: "inline-flex min-w-0 items-center gap-2",
                        children: [
                          jsxTooltip.jsx("span", {
                            className: multilineTooltipArrowClass,
                            children: value12
                          }, disabledReasonKey(value12)),
                          shortcut && jsxTooltip.jsx(TooltipShortcut, {
                            keys: shortcut
                          })
                        ]
                      }),
                      secondaryHint && jsxTooltip.jsxs("span", {
                        className: "inline-flex min-w-0 items-center gap-2",
                        children: [
                          jsxTooltip.jsx("span", {
                            className: "min-w-0 break-words",
                            children: secondaryHint.label
                          }, disabledReasonKey(secondaryHint.label)),
                          jsxTooltip.jsx(TooltipShortcut, {
                            keys: secondaryHint.shortcut
                          })
                        ]
                      }),
                      detail && jsxTooltip.jsx("span", {
                        className: "break-words text-[calc(0.6875rem*var(--cds-rem-scale,1))]/[calc(0.875rem*var(--cds-rem-scale,1))] text-secondary",
                        children: detail
                      }, disabledReasonKey(detail))
                    ]
                  }) : jsxTooltip.jsxs(jsxTooltip.Fragment, {
                    children: [
                      jsxTooltip.jsx("span", {
                        className: multilineTooltipArrowClass,
                        children: value12
                      }, disabledReasonKey(value12)),
                      shortcut && jsxTooltip.jsx(TooltipShortcut, {
                        keys: shortcut,
                        className: tooltipContentAlignmentClass
                      })
                    ]
                  })
                })
              })
            })
          })
        })
      })
    }) : null;
    return value17 ? jsxTooltip.jsxs(jsxTooltip.Fragment, {
      children: [
        jsxTooltip.jsx(tooltipImplementationContext.Provider, {
          value: defaultTooltipImplementation,
          children: jsxTooltip.jsx(tooltipsDisabledContext.Provider, {
            value: value11,
            children: value27
          })
        }),
        value20 && jsxTooltip.jsx(runtime2.baseTooltip.Root, {
          handle: value17,
          open: value14,
          disableHoverablePopup: !hoverable,
          trackCursorAxis,
          disabled: !value11,
          actionsRef: ref,
          onOpenChange: callback4,
          onOpenChangeComplete: callback2,
          triggerId: value3,
          children: value28
        })
      ]
    }) : jsxTooltip.jsxs(runtime2.baseTooltip.Root, {
      open: value14,
      disableHoverablePopup: !hoverable,
      trackCursorAxis,
      disabled: !value11,
      actionsRef: ref,
      onOpenChange: callback,
      onOpenChangeComplete: callback2,
      triggerId: value3,
      children: [
        jsxTooltip.jsx(tooltipImplementationContext.Provider, {
          value: defaultTooltipImplementation,
          children: jsxTooltip.jsx(tooltipsDisabledContext.Provider, {
            value: value11,
            children: value27
          })
        }),
        value28
      ]
    });
  }
  function DisabledReasonTooltip({ reason, side: side2, align: align2, sideOffset, multiline = !0, delay, collisionPadding, hoverable, className, wrapperClassName, children }) {
    let value = reactTooltip.useId();
    return jsxTooltip.jsx(Tooltip, {
      content: hasDisabledReason(reason) ? reason : void 0,
      side: side2,
      align: align2,
      sideOffset,
      multiline,
      delay,
      collisionPadding,
      hoverable,
      className,
      closeOnClick: !1,
      openOnHandedBackFocus: !0,
      children: jsxTooltip.jsxs("span", {
        ...getDisabledReasonWrapperProps(reason, value, wrapperClassName),
        children: [
          children,
          jsxTooltip.jsx(DisabledReasonAnnouncement, {
            id: value,
            reason
          })
        ]
      })
    });
  }
  function TooltipImplementationProvider({ children }) {
    return jsxTooltip.jsx(tooltipImplementationContext.Provider, {
      value: defaultTooltipImplementation,
      children
    });
  }
  function useHasTooltipProvider() {
    return reactTooltip.useContext(tooltipDelayContext) !== null;
  }
  function TooltipProvider3({ delay, closeDelay = 200, children }) {
    let groupDelay = reactTooltip.useContext(tooltipDelayContext), resolvedDelay = delay ?? groupDelay ?? TOOLTIP_DEFAULT_DELAY;
    return jsxTooltip.jsx(tooltipDelayContext.Provider, {
      value: resolvedDelay,
      children: jsxTooltip.jsx(runtime2.baseTooltip.Provider, {
        delay: resolvedDelay,
        closeDelay,
        children
      })
    });
  }
  return bindRuntimeValue(runtime2, "reactForUiAvatars", () => reactForUiAvatars, (value) => {
    reactForUiAvatars = value;
  }), bindRuntimeValue(runtime2, "jsxForUiAvatars", () => jsxForUiAvatars, (value) => {
    jsxForUiAvatars = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_SPARK_PATH", () => CLAUDE_SPARK_PATH, (value) => {
    CLAUDE_SPARK_PATH = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_CLAY_COLOR", () => CLAUDE_CLAY_COLOR, (value) => {
    CLAUDE_CLAY_COLOR = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_CLAY_CSS_COLOR", () => CLAUDE_CLAY_CSS_COLOR, (value) => {
    CLAUDE_CLAY_CSS_COLOR = value;
  }), bindRuntimeValue(runtime2, "SPARK_SIZE_CLASS", () => SPARK_SIZE_CLASS, (value) => {
    SPARK_SIZE_CLASS = value;
  }), bindRuntimeValue(runtime2, "StaticSpark", () => StaticSpark, (value) => {
    StaticSpark = value;
  }), bindRuntimeValue(runtime2, "Spark", () => Spark, (value) => {
    Spark = value;
  }), bindRuntimeValue(runtime2, "initializeUiAvatars", () => initializeUiAvatars, (value) => {
    initializeUiAvatars = value;
  }), bindRuntimeValue(runtime2, "useAvatarStack", () => useAvatarStack), bindRuntimeValue(runtime2, "reactForUiAvatars2", () => reactForUiAvatars2, (value) => {
    reactForUiAvatars2 = value;
  }), bindRuntimeValue(runtime2, "AvatarStackContext", () => AvatarStackContext, (value) => {
    AvatarStackContext = value;
  }), bindRuntimeValue(runtime2, "initializeUiAvatars2", () => initializeUiAvatars2, (value) => {
    initializeUiAvatars2 = value;
  }), bindRuntimeValue(runtime2, "avatarInitials", () => avatarInitials), bindRuntimeValue(runtime2, "reactForUiAvatars3", () => reactForUiAvatars3, (value) => {
    reactForUiAvatars3 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiAvatars2", () => jsxForUiAvatars2, (value) => {
    jsxForUiAvatars2 = value;
  }), bindRuntimeValue(runtime2, "avatarVariants", () => avatarVariants, (value) => {
    avatarVariants = value;
  }), bindRuntimeValue(runtime2, "Avatar", () => Avatar, (value) => {
    Avatar = value;
  }), bindRuntimeValue(runtime2, "initializeUiAvatars3", () => initializeUiAvatars3, (value) => {
    initializeUiAvatars3 = value;
  }), bindRuntimeValue(runtime2, "getKeycapClasses", () => getKeycapClasses), bindRuntimeValue(runtime2, "Shortcut", () => Shortcut), bindRuntimeValue(runtime2, "useAppleKeyboard", () => useAppleKeyboard), bindRuntimeValue(runtime2, "ownPropertyValue", () => ownPropertyValue), bindRuntimeValue(runtime2, "getShortcutKeyLabel", () => getShortcutKeyLabel), bindRuntimeValue(runtime2, "parseShortcutSequence", () => parseShortcutSequence), bindRuntimeValue(runtime2, "parseShortcutChord", () => parseShortcutChord), bindRuntimeValue(runtime2, "renderShortcutChord", () => renderShortcutChord), bindRuntimeValue(runtime2, "shortcutToAriaKeyShortcuts", () => shortcutToAriaKeyShortcuts), bindRuntimeValue(runtime2, "reactShortcut", () => reactShortcut, (value) => {
    reactShortcut = value;
  }), bindRuntimeValue(runtime2, "jsxShortcut", () => jsxShortcut, (value) => {
    jsxShortcut = value;
  }), bindRuntimeValue(runtime2, "shortcutKeycapClasses", () => shortcutKeycapClasses, (value) => {
    shortcutKeycapClasses = value;
  }), bindRuntimeValue(runtime2, "singleCharacterKeycapClasses", () => singleCharacterKeycapClasses, (value) => {
    singleCharacterKeycapClasses = value;
  }), bindRuntimeValue(runtime2, "multipleCharacterKeycapClasses", () => multipleCharacterKeycapClasses, (value) => {
    multipleCharacterKeycapClasses = value;
  }), bindRuntimeValue(runtime2, "shortcutTextKeyClasses", () => shortcutTextKeyClasses, (value) => {
    shortcutTextKeyClasses = value;
  }), bindRuntimeValue(runtime2, "shortcutVariantClasses", () => shortcutVariantClasses, (value) => {
    shortcutVariantClasses = value;
  }), bindRuntimeValue(runtime2, "SHORTCUT_RTL_CLASSES", () => SHORTCUT_RTL_CLASSES, (value) => {
    SHORTCUT_RTL_CLASSES = value;
  }), bindRuntimeValue(runtime2, "SHORTCUT_SEQUENCE_SEPARATOR", () => SHORTCUT_SEQUENCE_SEPARATOR, (value) => {
    SHORTCUT_SEQUENCE_SEPARATOR = value;
  }), bindRuntimeValue(runtime2, "SHORTCUT_MODIFIER_SEPARATOR", () => SHORTCUT_MODIFIER_SEPARATOR, (value) => {
    SHORTCUT_MODIFIER_SEPARATOR = value;
  }), bindRuntimeValue(runtime2, "appleKeyboardUserAgentPattern", () => appleKeyboardUserAgentPattern, (value) => {
    appleKeyboardUserAgentPattern = value;
  }), bindRuntimeValue(runtime2, "subscribeAppleKeyboardNoop", () => subscribeAppleKeyboardNoop, (value) => {
    subscribeAppleKeyboardNoop = value;
  }), bindRuntimeValue(runtime2, "shortcutModifierNames", () => shortcutModifierNames, (value) => {
    shortcutModifierNames = value;
  }), bindRuntimeValue(runtime2, "isShortcutModifier", () => isShortcutModifier, (value) => {
    isShortcutModifier = value;
  }), bindRuntimeValue(runtime2, "shortcutModifierOrder", () => shortcutModifierOrder, (value) => {
    shortcutModifierOrder = value;
  }), bindRuntimeValue(runtime2, "appleModifierLabels", () => appleModifierLabels, (value) => {
    appleModifierLabels = value;
  }), bindRuntimeValue(runtime2, "otherModifierLabels", () => otherModifierLabels, (value) => {
    otherModifierLabels = value;
  }), bindRuntimeValue(runtime2, "appleKeyLabels", () => appleKeyLabels, (value) => {
    appleKeyLabels = value;
  }), bindRuntimeValue(runtime2, "otherKeyLabels", () => otherKeyLabels, (value) => {
    otherKeyLabels = value;
  }), bindRuntimeValue(runtime2, "appleAriaModifierNames", () => appleAriaModifierNames, (value) => {
    appleAriaModifierNames = value;
  }), bindRuntimeValue(runtime2, "otherAriaModifierNames", () => otherAriaModifierNames, (value) => {
    otherAriaModifierNames = value;
  }), bindRuntimeValue(runtime2, "initializeShortcuts", () => initializeShortcuts, (value) => {
    initializeShortcuts = value;
  }), bindRuntimeValue(runtime2, "isTextRangeClipped", () => isTextRangeClipped), bindRuntimeValue(runtime2, "reactTextClipping", () => reactTextClipping, (value) => {
    reactTextClipping = value;
  }), bindRuntimeValue(runtime2, "documentTextRanges", () => documentTextRanges, (value) => {
    documentTextRanges = value;
  }), bindRuntimeValue(runtime2, "initializeTextClipping", () => initializeTextClipping, (value) => {
    initializeTextClipping = value;
  }), bindRuntimeValue(runtime2, "useCancelableTimeout", () => useCancelableTimeout), bindRuntimeValue(runtime2, "reactCancelableTimeout", () => reactCancelableTimeout, (value) => {
    reactCancelableTimeout = value;
  }), bindRuntimeValue(runtime2, "initializeCancelableTimeout", () => initializeCancelableTimeout, (value) => {
    initializeCancelableTimeout = value;
  }), bindRuntimeValue(runtime2, "writeShrinkWrapWidth", () => writeShrinkWrapWidth), bindRuntimeValue(runtime2, "readShrinkWrapBaseline", () => readShrinkWrapBaseline), bindRuntimeValue(runtime2, "captureShrinkWrapBaseline", () => captureShrinkWrapBaseline), bindRuntimeValue(runtime2, "shrinkWrapTextRules", () => shrinkWrapTextRules), bindRuntimeValue(runtime2, "rememberShrinkWrapWidth", () => rememberShrinkWrapWidth), bindRuntimeValue(runtime2, "recallShrinkWrapWidth", () => recallShrinkWrapWidth), bindRuntimeValue(runtime2, "hashShrinkWrapString", () => hashShrinkWrapString), bindRuntimeValue(runtime2, "shrinkWrapContentKey", () => shrinkWrapContentKey), bindRuntimeValue(runtime2, "shrinkWrapStyleKey", () => shrinkWrapStyleKey), bindRuntimeValue(runtime2, "shrinkWrapAncestorWidths", () => shrinkWrapAncestorWidths), bindRuntimeValue(runtime2, "shrinkWrapAncestorsMatch", () => shrinkWrapAncestorsMatch), bindRuntimeValue(runtime2, "shrinkWrapParentContentWidth", () => shrinkWrapParentContentWidth), bindRuntimeValue(runtime2, "storeShrinkWrapResult", () => storeShrinkWrapResult), bindRuntimeValue(runtime2, "applyRememberedShrinkWraps", () => applyRememberedShrinkWraps), bindRuntimeValue(runtime2, "shrinkWrapRulesMatch", () => shrinkWrapRulesMatch), bindRuntimeValue(runtime2, "lookupShrinkWrapMemory", () => lookupShrinkWrapMemory), bindRuntimeValue(runtime2, "measureShrinkWrapLineRects", () => measureShrinkWrapLineRects), bindRuntimeValue(runtime2, "isShrinkWrapAtomicElement", () => isShrinkWrapAtomicElement), bindRuntimeValue(runtime2, "measureShrinkWrapLayout", () => measureShrinkWrapLayout), bindRuntimeValue(runtime2, "shrinkWrapLayoutWorsened", () => shrinkWrapLayoutWorsened), bindRuntimeValue(runtime2, "shrinkWrapLayoutImproved", () => shrinkWrapLayoutImproved), bindRuntimeValue(runtime2, "restoreShrinkWrapWidth", () => restoreShrinkWrapWidth), bindRuntimeValue(runtime2, "createShrinkWrapJob", () => createShrinkWrapJob), bindRuntimeValue(runtime2, "settleShrinkWrapJob", () => settleShrinkWrapJob), bindRuntimeValue(runtime2, "readShrinkWrapNaturalLayout", () => readShrinkWrapNaturalLayout), bindRuntimeValue(runtime2, "checkShrinkWrapCandidate", () => checkShrinkWrapCandidate), bindRuntimeValue(runtime2, "advanceShrinkWrapSearch", () => advanceShrinkWrapSearch), bindRuntimeValue(runtime2, "runShrinkWrapJobs", () => runShrinkWrapJobs), bindRuntimeValue(runtime2, "shrinkWrapSynchronously", () => shrinkWrapSynchronously), bindRuntimeValue(runtime2, "getShrinkWrapQueue", () => getShrinkWrapQueue), bindRuntimeValue(runtime2, "drainShrinkWrapQueue", () => drainShrinkWrapQueue), bindRuntimeValue(runtime2, "flushShrinkWrapMicrotask", () => flushShrinkWrapMicrotask), bindRuntimeValue(runtime2, "flushShrinkWrapResizeJobs", () => flushShrinkWrapResizeJobs), bindRuntimeValue(runtime2, "enqueueShrinkWrapJob", () => enqueueShrinkWrapJob), bindRuntimeValue(runtime2, "cancelShrinkWrapJob", () => cancelShrinkWrapJob), bindRuntimeValue(runtime2, "shouldRecomputeShrinkWrap", () => shouldRecomputeShrinkWrap), bindRuntimeValue(runtime2, "registerShrinkWrapResizeHandler", () => registerShrinkWrapResizeHandler), bindRuntimeValue(runtime2, "unregisterShrinkWrapResizeHandler", () => unregisterShrinkWrapResizeHandler), bindRuntimeValue(runtime2, "pauseShrinkWrapResizeObservation", () => pauseShrinkWrapResizeObservation), bindRuntimeValue(runtime2, "subscribeShrinkWrapWindowResize", () => subscribeShrinkWrapWindowResize), bindRuntimeValue(runtime2, "observeShrinkWrap", () => observeShrinkWrap), bindRuntimeValue(runtime2, "SHRINK_WRAP_STYLE_PROPERTY", () => SHRINK_WRAP_STYLE_PROPERTY, (value) => {
    SHRINK_WRAP_STYLE_PROPERTY = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapBaselineWidths", () => shrinkWrapBaselineWidths, (value) => {
    shrinkWrapBaselineWidths = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapWrittenWidths", () => shrinkWrapWrittenWidths, (value) => {
    shrinkWrapWrittenWidths = value;
  }), bindRuntimeValue(runtime2, "SHRINK_WRAP_MAX_ITERATIONS", () => SHRINK_WRAP_MAX_ITERATIONS, (value) => {
    SHRINK_WRAP_MAX_ITERATIONS = value;
  }), bindRuntimeValue(runtime2, "SHRINK_WRAP_ATTRIBUTE", () => SHRINK_WRAP_ATTRIBUTE, (value) => {
    SHRINK_WRAP_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "SHRINK_WRAP_MAX_LINE_RECTS", () => SHRINK_WRAP_MAX_LINE_RECTS, (value) => {
    SHRINK_WRAP_MAX_LINE_RECTS = value;
  }), bindRuntimeValue(runtime2, "SHRINK_WRAP_MEMORY_LIMIT", () => SHRINK_WRAP_MEMORY_LIMIT, (value) => {
    SHRINK_WRAP_MEMORY_LIMIT = value;
  }), bindRuntimeValue(runtime2, "SHRINK_WRAP_MAX_TEXT_LENGTH", () => SHRINK_WRAP_MAX_TEXT_LENGTH, (value) => {
    SHRINK_WRAP_MAX_TEXT_LENGTH = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapMemory", () => shrinkWrapMemory, (value) => {
    shrinkWrapMemory = value;
  }), bindRuntimeValue(runtime2, "SHRINK_WRAP_HASH_SEED", () => SHRINK_WRAP_HASH_SEED, (value) => {
    SHRINK_WRAP_HASH_SEED = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapAtomicTags", () => shrinkWrapAtomicTags, (value) => {
    shrinkWrapAtomicTags = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapQueues", () => shrinkWrapQueues, (value) => {
    shrinkWrapQueues = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapResizeObservers", () => shrinkWrapResizeObservers, (value) => {
    shrinkWrapResizeObservers = value;
  }), bindRuntimeValue(runtime2, "shrinkWrapWindowResizeStores", () => shrinkWrapWindowResizeStores, (value) => {
    shrinkWrapWindowResizeStores = value;
  }), bindRuntimeValue(runtime2, "initializeShrinkWrapMeasurement", () => initializeShrinkWrapMeasurement, (value) => {
    initializeShrinkWrapMeasurement = value;
  }), bindRuntimeValue(runtime2, "useShrinkWrapMemory", () => useShrinkWrapMemory), bindRuntimeValue(runtime2, "useShrinkWrapRef", () => useShrinkWrapRef), bindRuntimeValue(runtime2, "reactShrinkWrap", () => reactShrinkWrap, (value) => {
    reactShrinkWrap = value;
  }), bindRuntimeValue(runtime2, "jsxShrinkWrap", () => jsxShrinkWrap, (value) => {
    jsxShrinkWrap = value;
  }), bindRuntimeValue(runtime2, "ShrinkWrap", () => ShrinkWrap, (value) => {
    ShrinkWrap = value;
  }), bindRuntimeValue(runtime2, "initializeShrinkWrap", () => initializeShrinkWrap, (value) => {
    initializeShrinkWrap = value;
  }), bindRuntimeValue(runtime2, "getButtonBackgroundLayerClasses", () => getButtonBackgroundLayerClasses), bindRuntimeValue(runtime2, "buttonBackgroundLayerClasses", () => buttonBackgroundLayerClasses, (value) => {
    buttonBackgroundLayerClasses = value;
  }), bindRuntimeValue(runtime2, "buttonFocusClasses", () => buttonFocusClasses, (value) => {
    buttonFocusClasses = value;
  }), bindRuntimeValue(runtime2, "dangerButtonFocusClasses", () => dangerButtonFocusClasses, (value) => {
    dangerButtonFocusClasses = value;
  }), bindRuntimeValue(runtime2, "buttonFillLayerClasses", () => buttonFillLayerClasses, (value) => {
    buttonFillLayerClasses = value;
  }), bindRuntimeValue(runtime2, "buttonBackgroundShadowClasses", () => buttonBackgroundShadowClasses, (value) => {
    buttonBackgroundShadowClasses = value;
  }), bindRuntimeValue(runtime2, "buttonJoinedFillClasses", () => buttonJoinedFillClasses, (value) => {
    buttonJoinedFillClasses = value;
  }), bindRuntimeValue(runtime2, "buttonPressedFillClasses", () => buttonPressedFillClasses, (value) => {
    buttonPressedFillClasses = value;
  }), bindRuntimeValue(runtime2, "secondaryButtonFillClasses", () => secondaryButtonFillClasses, (value) => {
    secondaryButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "buttonSolidInsetClasses", () => buttonSolidInsetClasses, (value) => {
    buttonSolidInsetClasses = value;
  }), bindRuntimeValue(runtime2, "ghostButtonPressedFillClasses", () => ghostButtonPressedFillClasses, (value) => {
    ghostButtonPressedFillClasses = value;
  }), bindRuntimeValue(runtime2, "buttonPressedTextClasses", () => buttonPressedTextClasses, (value) => {
    buttonPressedTextClasses = value;
  }), bindRuntimeValue(runtime2, "buttonPaddingClasses", () => buttonPaddingClasses, (value) => {
    buttonPaddingClasses = value;
  }), bindRuntimeValue(runtime2, "buttonRadiusClasses", () => buttonRadiusClasses, (value) => {
    buttonRadiusClasses = value;
  }), bindRuntimeValue(runtime2, "buttonEndRadiusClasses", () => buttonEndRadiusClasses, (value) => {
    buttonEndRadiusClasses = value;
  }), bindRuntimeValue(runtime2, "stacksSecondaryButtonFillClasses", () => stacksSecondaryButtonFillClasses, (value) => {
    stacksSecondaryButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksButtonNoShadowClasses", () => stacksButtonNoShadowClasses, (value) => {
    stacksButtonNoShadowClasses = value;
  }), bindRuntimeValue(runtime2, "stacksGhostButtonFillClasses", () => stacksGhostButtonFillClasses, (value) => {
    stacksGhostButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksDisabledButtonFillClasses", () => stacksDisabledButtonFillClasses, (value) => {
    stacksDisabledButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksDangerButtonFillClasses", () => stacksDangerButtonFillClasses, (value) => {
    stacksDangerButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksDangerButtonTextClasses", () => stacksDangerButtonTextClasses, (value) => {
    stacksDangerButtonTextClasses = value;
  }), bindRuntimeValue(runtime2, "stacksDangerButtonBgClasses", () => stacksDangerButtonBgClasses, (value) => {
    stacksDangerButtonBgClasses = value;
  }), bindRuntimeValue(runtime2, "stacksAccentButtonFillClasses", () => stacksAccentButtonFillClasses, (value) => {
    stacksAccentButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksAccentButtonTextClasses", () => stacksAccentButtonTextClasses, (value) => {
    stacksAccentButtonTextClasses = value;
  }), bindRuntimeValue(runtime2, "stacksAccentPressedHoverClasses", () => stacksAccentPressedHoverClasses, (value) => {
    stacksAccentPressedHoverClasses = value;
  }), bindRuntimeValue(runtime2, "stacksGhostPressedFillClasses", () => stacksGhostPressedFillClasses, (value) => {
    stacksGhostPressedFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksDangerPressedFillClasses", () => stacksDangerPressedFillClasses, (value) => {
    stacksDangerPressedFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksAccentPressedFillClasses", () => stacksAccentPressedFillClasses, (value) => {
    stacksAccentPressedFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksNoTransformClasses", () => stacksNoTransformClasses, (value) => {
    stacksNoTransformClasses = value;
  }), bindRuntimeValue(runtime2, "stacksButtonInsetClasses", () => stacksButtonInsetClasses, (value) => {
    stacksButtonInsetClasses = value;
  }), bindRuntimeValue(runtime2, "stacksDisabledButtonClasses", () => stacksDisabledButtonClasses, (value) => {
    stacksDisabledButtonClasses = value;
  }), bindRuntimeValue(runtime2, "stacksButtonFillClasses", () => stacksButtonFillClasses, (value) => {
    stacksButtonFillClasses = value;
  }), bindRuntimeValue(runtime2, "stacksButtonActiveClasses", () => stacksButtonActiveClasses, (value) => {
    stacksButtonActiveClasses = value;
  }), bindRuntimeValue(runtime2, "initializeButtonVariantClasses", () => initializeButtonVariantClasses, (value) => {
    initializeButtonVariantClasses = value;
  }), bindRuntimeValue(runtime2, "initializeDisabledReasonDebug", () => initializeDisabledReasonDebug, (value) => {
    initializeDisabledReasonDebug = value;
  }), bindRuntimeValue(runtime2, "getDisabledReasonWrapperProps", () => getDisabledReasonWrapperProps), bindRuntimeValue(runtime2, "hasDisabledReason", () => hasDisabledReason), bindRuntimeValue(runtime2, "DisabledReasonAnnouncement", () => DisabledReasonAnnouncement), bindRuntimeValue(runtime2, "reactDisabledReason", () => reactDisabledReason, (value) => {
    reactDisabledReason = value;
  }), bindRuntimeValue(runtime2, "jsxDisabledReason", () => jsxDisabledReason, (value) => {
    jsxDisabledReason = value;
  }), bindRuntimeValue(runtime2, "disabledReasonFocusClasses", () => disabledReasonFocusClasses, (value) => {
    disabledReasonFocusClasses = value;
  }), bindRuntimeValue(runtime2, "disabledReasonKey", () => disabledReasonKey), bindRuntimeValue(runtime2, "disabledReasonTypeIds", () => disabledReasonTypeIds, (value) => {
    disabledReasonTypeIds = value;
  }), bindRuntimeValue(runtime2, "nextDisabledReasonTypeId", () => nextDisabledReasonTypeId, (value) => {
    nextDisabledReasonTypeId = value;
  }), bindRuntimeValue(runtime2, "DISABLED_REASON_ATTRIBUTE", () => DISABLED_REASON_ATTRIBUTE, (value) => {
    DISABLED_REASON_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "initializeDisabledReason", () => initializeDisabledReason, (value) => {
    initializeDisabledReason = value;
  }), bindRuntimeValue(runtime2, "DarkTooltipScope", () => DarkTooltipScope), bindRuntimeValue(runtime2, "jsxTooltipClasses", () => jsxTooltipClasses, (value) => {
    jsxTooltipClasses = value;
  }), bindRuntimeValue(runtime2, "tooltipBaseClasses", () => tooltipBaseClasses, (value) => {
    tooltipBaseClasses = value;
  }), bindRuntimeValue(runtime2, "singleLineTooltipClasses", () => singleLineTooltipClasses, (value) => {
    singleLineTooltipClasses = value;
  }), bindRuntimeValue(runtime2, "tooltipDetailClasses", () => tooltipDetailClasses, (value) => {
    tooltipDetailClasses = value;
  }), bindRuntimeValue(runtime2, "multilineTooltipBaseClasses", () => multilineTooltipBaseClasses, (value) => {
    multilineTooltipBaseClasses = value;
  }), bindRuntimeValue(runtime2, "multilineTooltipClasses", () => multilineTooltipClasses, (value) => {
    multilineTooltipClasses = value;
  }), bindRuntimeValue(runtime2, "multilineTooltipArrowClass", () => multilineTooltipArrowClass, (value) => {
    multilineTooltipArrowClass = value;
  }), bindRuntimeValue(runtime2, "initializeTooltipClasses", () => initializeTooltipClasses, (value) => {
    initializeTooltipClasses = value;
  }), bindRuntimeValue(runtime2, "useTooltipsDisabled", () => useTooltipsDisabled), bindRuntimeValue(runtime2, "reactTooltipContext", () => reactTooltipContext, (value) => {
    reactTooltipContext = value;
  }), bindRuntimeValue(runtime2, "tooltipsDisabledContext", () => tooltipsDisabledContext, (value) => {
    tooltipsDisabledContext = value;
  }), bindRuntimeValue(runtime2, "tooltipImplementationContext", () => tooltipImplementationContext, (value) => {
    tooltipImplementationContext = value;
  }), bindRuntimeValue(runtime2, "initializeTooltipContext", () => initializeTooltipContext, (value) => {
    initializeTooltipContext = value;
  }), bindRuntimeValue(runtime2, "tooltipExports", () => tooltipExports, (value) => {
    tooltipExports = value;
  }), bindRuntimeValue(runtime2, "cancelInputDismissingTooltipOpen", () => cancelInputDismissingTooltipOpen), bindRuntimeValue(runtime2, "closePreviousTooltip", () => closePreviousTooltip), bindRuntimeValue(runtime2, "releaseTooltip", () => releaseTooltip), bindRuntimeValue(runtime2, "useTooltipSingleton", () => useTooltipSingleton), bindRuntimeValue(runtime2, "isOpenPopupTrigger", () => isOpenPopupTrigger), bindRuntimeValue(runtime2, "cancelHoverOverOpenPopup", () => cancelHoverOverOpenPopup), bindRuntimeValue(runtime2, "isElementFocusVisible", () => isElementFocusVisible), bindRuntimeValue(runtime2, "findFocusedOverflowLabel", () => findFocusedOverflowLabel), bindRuntimeValue(runtime2, "hideFocusedOverflowTooltip", () => hideFocusedOverflowTooltip), bindRuntimeValue(runtime2, "handleOverflowTooltipFocusIn", () => handleOverflowTooltipFocusIn), bindRuntimeValue(runtime2, "rememberFocusBeforeWindowBlur", () => rememberFocusBeforeWindowBlur), bindRuntimeValue(runtime2, "handleOverflowTooltipFocusOut", () => handleOverflowTooltipFocusOut), bindRuntimeValue(runtime2, "handleOverflowTooltipKeyDown", () => handleOverflowTooltipKeyDown), bindRuntimeValue(runtime2, "watchOverflowTooltipFocus", () => watchOverflowTooltipFocus), bindRuntimeValue(runtime2, "isOverflowClipped", () => isOverflowClipped), bindRuntimeValue(runtime2, "useOverflowTooltipFocusReveal", () => useOverflowTooltipFocusReveal), bindRuntimeValue(runtime2, "tooltipDelayContext", () => tooltipDelayContext, (value) => {
    tooltipDelayContext = value;
  }), bindRuntimeValue(runtime2, "initializeTooltipSingleton", () => initializeTooltipSingleton, (value) => {
    initializeTooltipSingleton = value;
  }), bindRuntimeValue(runtime2, "OVERFLOW_TOOLTIP_OWNER_SELECTOR", () => OVERFLOW_TOOLTIP_OWNER_SELECTOR, (value) => {
    OVERFLOW_TOOLTIP_OWNER_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "OVERFLOW_TOOLTIP_REVEAL_SELECTOR", () => OVERFLOW_TOOLTIP_REVEAL_SELECTOR, (value) => {
    OVERFLOW_TOOLTIP_REVEAL_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "overflowTooltipRevealers", () => overflowTooltipRevealers, (value) => {
    overflowTooltipRevealers = value;
  }), bindRuntimeValue(runtime2, "focusedOverflowLabels", () => focusedOverflowLabels, (value) => {
    focusedOverflowLabels = value;
  }), bindRuntimeValue(runtime2, "focusBeforeWindowBlur", () => focusBeforeWindowBlur, (value) => {
    focusBeforeWindowBlur = value;
  }), bindRuntimeValue(runtime2, "watchedOverflowDocuments", () => watchedOverflowDocuments, (value) => {
    watchedOverflowDocuments = value;
  }), bindRuntimeValue(runtime2, "settleOverflowReveal", () => settleOverflowReveal, (value) => {
    settleOverflowReveal = value;
  }), bindRuntimeValue(runtime2, "TOOLTIP_DEFAULT_DELAY", () => TOOLTIP_DEFAULT_DELAY, (value) => {
    TOOLTIP_DEFAULT_DELAY = value;
  }), bindRuntimeValue(runtime2, "reactDomTooltip", () => reactDomTooltip, (value) => {
    reactDomTooltip = value;
  }), bindRuntimeValue(runtime2, "isEmptyTooltipContent", () => isEmptyTooltipContent), bindRuntimeValue(runtime2, "evaluateTooltipContent", () => evaluateTooltipContent), bindRuntimeValue(runtime2, "TooltipShortcut", () => TooltipShortcut), bindRuntimeValue(runtime2, "Tooltip", () => Tooltip), bindRuntimeValue(runtime2, "DisabledReasonTooltip", () => DisabledReasonTooltip), bindRuntimeValue(runtime2, "TooltipImplementationProvider", () => TooltipImplementationProvider), bindRuntimeValue(runtime2, "useHasTooltipProvider", () => useHasTooltipProvider), bindRuntimeValue(runtime2, "TooltipProvider", () => TooltipProvider3), bindRuntimeValue(runtime2, "reactTooltip", () => reactTooltip, (value) => {
    reactTooltip = value;
  }), bindRuntimeValue(runtime2, "jsxTooltip", () => jsxTooltip, (value) => {
    jsxTooltip = value;
  }), bindRuntimeValue(runtime2, "activeTooltipActionsRef", () => activeTooltipActionsRef, (value) => {
    activeTooltipActionsRef = value;
  }), bindRuntimeValue(runtime2, "TOOLTIP_NO_SHOW", () => TOOLTIP_NO_SHOW, (value) => {
    TOOLTIP_NO_SHOW = value;
  }), bindRuntimeValue(runtime2, "closedTooltipState", () => closedTooltipState, (value) => {
    closedTooltipState = value;
  }), bindRuntimeValue(runtime2, "openTooltipState", () => openTooltipState, (value) => {
    openTooltipState = value;
  }), bindRuntimeValue(runtime2, "closeTooltipState", () => closeTooltipState, (value) => {
    closeTooltipState = value;
  }), bindRuntimeValue(runtime2, "clearTooltipBody", () => clearTooltipBody, (value) => {
    clearTooltipBody = value;
  }), bindRuntimeValue(runtime2, "openTooltipWithBody", () => openTooltipWithBody, (value) => {
    openTooltipWithBody = value;
  }), bindRuntimeValue(runtime2, "replaceTooltipBody", () => replaceTooltipBody, (value) => {
    replaceTooltipBody = value;
  }), bindRuntimeValue(runtime2, "resetTooltipState", () => resetTooltipState, (value) => {
    resetTooltipState = value;
  }), bindRuntimeValue(runtime2, "tooltipSingleLineClasses", () => tooltipSingleLineClasses, (value) => {
    tooltipSingleLineClasses = value;
  }), bindRuntimeValue(runtime2, "tooltipTextBalanceClass", () => tooltipTextBalanceClass, (value) => {
    tooltipTextBalanceClass = value;
  }), bindRuntimeValue(runtime2, "tooltipSecondaryDetailClasses", () => tooltipSecondaryDetailClasses, (value) => {
    tooltipSecondaryDetailClasses = value;
  }), bindRuntimeValue(runtime2, "tooltipContentRowClasses", () => tooltipContentRowClasses, (value) => {
    tooltipContentRowClasses = value;
  }), bindRuntimeValue(runtime2, "tooltipContentAlignmentClass", () => tooltipContentAlignmentClass, (value) => {
    tooltipContentAlignmentClass = value;
  }), bindRuntimeValue(runtime2, "tooltipMultilineBodyClasses", () => tooltipMultilineBodyClasses, (value) => {
    tooltipMultilineBodyClasses = value;
  }), bindRuntimeValue(runtime2, "OverflowTooltip", () => OverflowTooltip, (value) => {
    OverflowTooltip = value;
  }), bindRuntimeValue(runtime2, "defaultTooltipImplementation", () => defaultTooltipImplementation, (value) => {
    defaultTooltipImplementation = value;
  }), bindRuntimeValue(runtime2, "initializeTooltip", () => initializeTooltip, (value) => {
    initializeTooltip = value;
  }), () => {
    CLAUDE_SPARK_PATH = "m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z", CLAUDE_CLAY_COLOR = "#d97757", SPARK_SIZE_CLASS = "h-[var(--cds-spark-size)] w-[var(--cds-spark-size)]", StaticSpark = ({ size: size4 = 32, color = CLAUDE_CLAY_CSS_COLOR, className }) => {
      let value = typeof size4 == "number";
      return jsxForUiAvatars.jsx("svg", {
        "data-cds": "Spark",
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 100 100",
        width: size4,
        height: size4,
        className: value ? (0, runtime2.cn)(SPARK_SIZE_CLASS, className) : className,
        style: value ? {
          "--cds-spark-size": (0, runtime2.pixelsToScaledRem)(size4)
        } : void 0,
        fill: color,
        "aria-hidden": !0,
        children: jsxForUiAvatars.jsx("path", {
          d: CLAUDE_SPARK_PATH
        })
      });
    }, initializeUiAvatars = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeRemScale)(), reactForUiAvatars = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiAvatars = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CLAUDE_CLAY_CSS_COLOR = `var(--cds-clay, ${CLAUDE_CLAY_COLOR})`, StaticSpark.displayName = "StaticSpark", Spark = reactForUiAvatars.memo(StaticSpark);
    }), initializeUiAvatars2 = (0, runtime2.initializeOnce)(() => {
      reactForUiAvatars2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), AvatarStackContext = reactForUiAvatars2.createContext(null);
    }), initializeUiAvatars3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), initializeUiAvatars(), initializeUiAvatars2(), (0, runtime2.initializeNpmDependency)(), reactForUiAvatars3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiAvatars2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), avatarVariants = (0, runtime2.cva)("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-sans font-medium leading-none", {
        variants: {
          size: {
            xs: "size-[var(--cds-avatar-xs)] text-[length:var(--cds-avatar-text-xs)]",
            sm: "size-[var(--cds-avatar-sm)] text-[calc(0.5625rem*var(--cds-rem-scale,1))]",
            md: "size-[var(--cds-avatar-md)] text-footnote",
            lg: "size-[var(--cds-avatar-lg)] text-body"
          },
          variant: {
            default: "bg-fill-control text-primary",
            pro: "bg-fill-pro text-on-pro",
            claude: "bg-fill-brand text-on-brand"
          }
        },
        defaultVariants: {
          size: "md",
          variant: "default"
        }
      }), Avatar = reactForUiAvatars3.forwardRef(({ src, name, size: size4, variant, className, ...props }, options) => {
        let value = useAvatarStack();
        value && (size4 = value.size);
        let value2 = (0, runtime2.useCdsConfig)(), [value3, value4] = reactForUiAvatars3.useState(!1), [value5, value6] = reactForUiAvatars3.useState(src);
        value5 !== src && (value6(src), value4(!1));
        let memo4 = reactForUiAvatars3.useMemo(() => avatarInitials(name, value2, size4 === "xs" ? 1 : 2), [name, value2, size4]), value7 = !!src && !value3;
        return jsxForUiAvatars2.jsx("span", {
          ref: options,
          "data-cds": "Avatar",
          ...props,
          className: (0, runtime2.cn)(avatarVariants({
            size: size4,
            variant
          }), className),
          role: value7 ? void 0 : "img",
          "aria-label": value7 ? void 0 : name,
          children: value7 ? jsxForUiAvatars2.jsx("img", {
            src,
            alt: name,
            className: "size-full object-cover",
            draggable: !1,
            onError: () => value4(!0)
          }) : variant === "claude" ? jsxForUiAvatars2.jsx(Spark, {
            size: "60%",
            color: "currentColor"
          }) : memo4
        });
      }), Avatar.displayName = "Avatar";
    }), shortcutKeycapClasses = "inline-flex shrink-0 items-center justify-center h-[calc(1em+6px)] rounded-[var(--cds-keycap-radius,4px)] [color:var(--cds-shortcut-cap-ink)] bg-[color:var(--cds-shortcut-cap-fill)] border border-[color:var(--cds-shortcut-cap-line)] font-inherit [font-variation-settings:inherit] [line-height:1]", singleCharacterKeycapClasses = "w-[calc(1em+6px)] px-0", multipleCharacterKeycapClasses = "min-w-[calc(1em+6px)] px-[3px]", shortcutTextKeyClasses = "font-inherit [font-variation-settings:inherit] [color:var(--cds-shortcut-cap-ink)]", SHORTCUT_RTL_CLASSES = "[&:where(:root[dir=rtl]_:dir(rtl))]:flex-row-reverse", SHORTCUT_SEQUENCE_SEPARATOR = "then", SHORTCUT_MODIFIER_SEPARATOR = "+", subscribeAppleKeyboardNoop = () => () => {
    }, isShortcutModifier = (input) => shortcutModifierNames.includes(input), initializeShortcuts = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), reactShortcut = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxShortcut = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), shortcutVariantClasses = {
        keycap: "inline-flex shrink-0 items-center gap-[2px] text-caption",
        text: "inline-flex shrink-0 items-baseline gap-[0.15em] text-caption"
      }, appleKeyboardUserAgentPattern = /mac|iphone|ipad|ipod/i, shortcutModifierNames = [
        "cmd",
        "command",
        "meta",
        "ctrl",
        "control",
        "alt",
        "option",
        "shift"
      ], shortcutModifierOrder = [
        "ctrl",
        "control",
        "alt",
        "option",
        "shift",
        "cmd",
        "command",
        "meta"
      ], appleModifierLabels = {
        ctrl: "⌃",
        control: "⌃",
        alt: "⌥",
        option: "⌥",
        shift: "⇧",
        cmd: "⌘",
        command: "⌘",
        meta: "⌘"
      }, otherModifierLabels = {
        ctrl: "Ctrl",
        control: "Ctrl",
        alt: "Alt",
        option: "Alt",
        shift: "Shift",
        cmd: "Ctrl",
        command: "Ctrl",
        meta: "Ctrl"
      }, appleKeyLabels = {
        space: "␣",
        enter: "⏎",
        return: "⏎",
        delete: "⌫",
        backspace: "⌫",
        escape: "Esc",
        esc: "Esc",
        tab: "⇥",
        up: "↑",
        down: "↓",
        left: "←",
        right: "→",
        pageup: "Page Up",
        pagedown: "Page Down",
        home: "Home",
        end: "End",
        insert: "Insert",
        plus: "+"
      }, otherKeyLabels = {
        space: "Space",
        enter: "⏎",
        return: "⏎",
        delete: "Backspace",
        backspace: "Backspace",
        escape: "Esc",
        esc: "Esc",
        tab: "Tab",
        up: "↑",
        down: "↓",
        left: "←",
        right: "→",
        pageup: "Page Up",
        pagedown: "Page Down",
        home: "Home",
        end: "End",
        insert: "Insert",
        plus: "+"
      }, appleAriaModifierNames = {
        cmd: "Command",
        command: "Command",
        meta: "Command",
        ctrl: "Control",
        control: "Control",
        alt: "Option",
        option: "Option",
        shift: "Shift",
        enter: "Enter",
        return: "Enter",
        space: "Space",
        tab: "Tab",
        delete: "Delete",
        backspace: "Delete",
        up: "Up",
        down: "Down",
        left: "Left",
        right: "Right"
      }, otherAriaModifierNames = {
        ctrl: "Control",
        control: "Control",
        alt: "Alt",
        option: "Alt",
        shift: "Shift",
        enter: "Enter",
        return: "Enter",
        escape: "Escape",
        esc: "Escape",
        space: "Space",
        tab: "Tab",
        delete: "Backspace",
        backspace: "Backspace",
        up: "ArrowUp",
        down: "ArrowDown",
        left: "ArrowLeft",
        right: "ArrowRight",
        home: "Home",
        end: "End",
        pageup: "PageUp",
        pagedown: "PageDown",
        insert: "Insert"
      };
    }), initializeTextClipping = (0, runtime2.initializeOnce)(() => {
      reactTextClipping = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), documentTextRanges = /* @__PURE__ */ new WeakMap();
    }), initializeCancelableTimeout = (0, runtime2.initializeOnce)(() => {
      reactCancelableTimeout = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    }), SHRINK_WRAP_STYLE_PROPERTY = "maxWidth", SHRINK_WRAP_MAX_ITERATIONS = 12, SHRINK_WRAP_ATTRIBUTE = "data-shrinkwrap", SHRINK_WRAP_MAX_LINE_RECTS = 16, SHRINK_WRAP_MEMORY_LIMIT = 512, SHRINK_WRAP_MAX_TEXT_LENGTH = 2e4, SHRINK_WRAP_HASH_SEED = 2166136261, initializeShrinkWrapMeasurement = (0, runtime2.initializeOnce)(() => {
      shrinkWrapBaselineWidths = /* @__PURE__ */ new WeakMap(), shrinkWrapWrittenWidths = /* @__PURE__ */ new WeakMap(), shrinkWrapMemory = /* @__PURE__ */ new WeakMap(), shrinkWrapAtomicTags = /* @__PURE__ */ new Set([
        "IMG",
        "SVG",
        "VIDEO",
        "AUDIO",
        "CANVAS",
        "IFRAME",
        "EMBED",
        "OBJECT",
        "PICTURE",
        "INPUT",
        "TEXTAREA",
        "SELECT",
        "PROGRESS",
        "METER"
      ]), shrinkWrapQueues = /* @__PURE__ */ new WeakMap(), shrinkWrapResizeObservers = /* @__PURE__ */ new WeakMap(), shrinkWrapWindowResizeStores = /* @__PURE__ */ new WeakMap();
    }), initializeShrinkWrap = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeErrorReporting)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeMergedRefs)(), initializeShrinkWrapMeasurement(), reactShrinkWrap = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxShrinkWrap = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ShrinkWrap = reactShrinkWrap.forwardRef(({ enabled = !0, immediate = !1, children, ...props }, options) => {
        let value = useShrinkWrapRef({
          enabled,
          immediate
        }), value2 = (0, runtime2.useMergedRefs)(options, value);
        return jsxShrinkWrap.jsx("div", {
          ref: value2,
          "data-cds": "ShrinkWrap",
          ...props,
          children
        });
      }), ShrinkWrap.displayName = "ShrinkWrap";
    }), buttonBackgroundLayerClasses = "absolute -z-[1] rounded-[inherit]", buttonFocusClasses = "focus-visible:shadow-focus [&[data-initial-focus]:focus]:shadow-focus", dangerButtonFocusClasses = "focus-visible:shadow-focus-danger [&[data-initial-focus]:focus]:shadow-focus-danger", buttonFillLayerClasses = "absolute inset-0 rounded-[inherit] transition-[background-color,box-shadow,color] stacks:transition-[box-shadow,color] duration-fast ease-out group-focus-visible/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)] group-[[data-initial-focus]:focus]/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)]", buttonBackgroundShadowClasses = "cds-btn-squish", buttonJoinedFillClasses = "shadow-field group-aria-pressed/btn:shadow-field-pressed group-focus-visible/btn:group-aria-pressed/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)]", buttonPressedFillClasses = "group-aria-pressed/btn:bg-accent group-hover/btn:group-aria-pressed/btn:bg-accent", secondaryButtonFillClasses = "bg-fill-secondary group-hover/btn:bg-fill-secondary-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-secondary-hover", buttonSolidInsetClasses = "inset-[0.5px]", ghostButtonPressedFillClasses = "group-aria-pressed/btn:bg-fill-ghost-selected group-hover/btn:group-aria-pressed/btn:bg-fill-ghost-selected group-[[aria-haspopup][aria-expanded=true]]/btn:group-aria-pressed/btn:bg-fill-ghost-selected", buttonPressedTextClasses = "aria-pressed:text-primary", buttonPaddingClasses = "px-[min(var(--cds-pad-md),var(--cds-button-pad-max,var(--cds-pad-md)))]", buttonRadiusClasses = "rounded-[calc(var(--cds-radius)+var(--cds-button-radius-add,0px))]", buttonEndRadiusClasses = "rounded-e-[calc(var(--cds-radius)+var(--cds-button-radius-add,0px))]", stacksSecondaryButtonFillClasses = "stacks:group-hover/btn:bg-fill-secondary stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-secondary stacks:group-hover/btn:layers-1-fill-button-layer stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-2-fill-button-layer stacks:group-hover/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-3-fill-button-layer stacks:group-[:disabled:not([aria-busy])]/btn:bg-fill-disabled stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-disabled stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-none", stacksButtonNoShadowClasses = "stacks:shadow-none stacks:group-aria-pressed/btn:shadow-none", stacksGhostButtonFillClasses = "stacks:group-hover/btn:bg-fill-button-ghost-hover stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-button-ghost-hover stacks:group-hover/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-1-fill-button-layer stacks:group-[:disabled:not([aria-busy])]/btn:bg-transparent stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-transparent", stacksDisabledButtonFillClasses = "stacks:group-[:disabled:not([aria-busy])]/btn:bg-fill-disabled", stacksDangerButtonFillClasses = "stacks:bg-danger stacks:group-hover/btn:bg-danger stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-danger stacks:group-hover/btn:layers-1-danger-layer stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-2-danger-layer stacks:group-hover/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-3-danger-layer stacks:group-[:disabled:not([aria-busy])]/btn:bg-fill-disabled stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-disabled stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-none", stacksDangerButtonTextClasses = "stacks:text-danger stacks:[--cds-shortcut-cap-ink:inherit]", stacksDangerButtonBgClasses = "stacks:bg-danger", stacksAccentButtonFillClasses = "stacks:bg-accent stacks:group-hover/btn:bg-accent stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-accent stacks:group-hover/btn:layers-1-accent-layer stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-2-accent-layer stacks:group-hover/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:layers-3-accent-layer stacks:group-[:disabled:not([aria-busy])]/btn:bg-fill-disabled stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-disabled stacks:group-[:disabled:not([aria-busy])]/btn:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-none", stacksAccentButtonTextClasses = "stacks:text-accent", stacksAccentPressedHoverClasses = "stacks:group-hover/btn:group-aria-pressed/btn:layers-1-accent-layer", stacksGhostPressedFillClasses = "stacks:group-aria-pressed/btn:bg-fill-button-ghost-hover stacks:group-hover/btn:group-aria-pressed/btn:bg-fill-button-ghost-hover stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:group-aria-pressed/btn:bg-fill-button-ghost-hover stacks:group-hover/btn:group-aria-pressed/btn:layers-1-fill-button-layer", stacksDangerPressedFillClasses = "stacks:group-aria-pressed/btn:bg-danger stacks:group-hover/btn:group-aria-pressed/btn:bg-danger stacks:group-aria-pressed/btn:layers-2-danger-layer stacks:group-hover/btn:group-aria-pressed/btn:layers-3-danger-layer stacks:group-[:disabled:not([aria-busy])]/btn:bg-none", stacksAccentPressedFillClasses = "stacks:group-aria-pressed/btn:layers-2-accent-layer stacks:group-hover/btn:group-aria-pressed/btn:layers-3-accent-layer stacks:group-[:disabled:not([aria-busy])]/btn:bg-none", stacksNoTransformClasses = "stacks:transform-none!", stacksButtonInsetClasses = "stacks:inset-0", stacksDisabledButtonClasses = "stacks:[&:disabled:not([aria-busy])]:opacity-100 stacks:[&:disabled:not([aria-busy])]:text-button-disabled stacks:[&:disabled:not([aria-busy])]:[--cds-shortcut-cap-ink:currentColor]", initializeButtonVariantClasses = (0, runtime2.initializeOnce)(() => {
      stacksButtonFillClasses = {
        secondary: stacksSecondaryButtonFillClasses,
        accent: stacksAccentButtonFillClasses,
        ghost: stacksGhostButtonFillClasses,
        primary: stacksDisabledButtonFillClasses,
        danger: stacksDangerButtonFillClasses,
        brand: stacksDisabledButtonFillClasses
      }, stacksButtonActiveClasses = {
        secondary: "stacks:group-active/btn:layers-2-fill-button-layer stacks:group-has-[:active]/btn:layers-2-fill-button-layer",
        ghost: "stacks:group-active/btn:bg-fill-button-ghost-hover stacks:group-has-[:active]/btn:bg-fill-button-ghost-hover stacks:group-active/btn:layers-1-fill-button-layer stacks:group-has-[:active]/btn:layers-1-fill-button-layer",
        primary: "stacks:group-active/btn:bg-fill-primary-hover stacks:group-has-[:active]/btn:bg-fill-primary-hover stacks:group-active/btn:layers-1-fill-primary-layer stacks:group-has-[:active]/btn:layers-1-fill-primary-layer stacks:group-[[aria-haspopup][aria-expanded=true]]/btn:bg-none",
        danger: "stacks:group-active/btn:layers-2-danger-layer stacks:group-has-[:active]/btn:layers-2-danger-layer",
        accent: "stacks:group-active/btn:layers-2-accent-layer stacks:group-has-[:active]/btn:layers-2-accent-layer"
      };
    }), initializeDisabledReasonDebug = () => {
    }, nextDisabledReasonTypeId = 0, DISABLED_REASON_ATTRIBUTE = "data-cds-disabled-reason", initializeDisabledReason = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), initializeDisabledReasonDebug(), initializeButtonVariantClasses(), reactDisabledReason = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxDisabledReason = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), disabledReasonFocusClasses = `${buttonRadiusClasses} outline-none focus-visible:outline-hidden [&[data-initial-focus]:focus]:outline-hidden transition-shadow duration-fast ${buttonFocusClasses}`, disabledReasonTypeIds = /* @__PURE__ */ new WeakMap();
    }), tooltipBaseClasses = "rounded-[calc(0.375rem*var(--cds-rem-scale,1))] bg-[var(--cds-tooltip-bg)] text-[var(--cds-tooltip-fg)] shadow-sm dark:shadow-panel-sm print:hidden text-[calc(0.8125rem*var(--cds-rem-scale,1))]/[calc(1.125rem*var(--cds-rem-scale,1))] font-normal", tooltipDetailClasses = "origin-[var(--transform-origin)] transition-[opacity,scale] duration-snap ease-snap motion-reduce:transition-none data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[instant]:duration-0", multilineTooltipBaseClasses = "max-w-[240px] whitespace-normal", multilineTooltipArrowClass = "min-w-0 break-words", initializeTooltipClasses = (0, runtime2.initializeOnce)(() => {
      jsxTooltipClasses = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), singleLineTooltipClasses = `px-2 ${tooltipBaseClasses}`, multilineTooltipClasses = `${multilineTooltipBaseClasses} py-1.5`;
    }), initializeTooltipContext = (0, runtime2.initializeOnce)(() => {
      reactTooltipContext = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), tooltipsDisabledContext = reactTooltipContext.createContext(!1), tooltipImplementationContext = reactTooltipContext.createContext(null);
    }), tooltipExports = {}, (0, runtime2.defineLiveExports)(tooltipExports, {
      useTooltipTrigger: () => useTooltipsDisabled,
      useTooltipGroup: () => useHasTooltipProvider,
      TooltipImplProvider: () => TooltipImplementationProvider,
      TooltipGroup: () => TooltipProvider3,
      Tooltip: () => Tooltip,
      OverflowTooltip: () => OverflowTooltip,
      DisabledReasonTooltip: () => DisabledReasonTooltip
    }), activeTooltipActionsRef = null, openTooltipState = (input) => input.open ? input : {
      ...input,
      open: !0
    }, closeTooltipState = (input) => input.open ? {
      ...input,
      open: !1
    } : input, clearTooltipBody = (input) => input.body === void 0 ? input : {
      ...input,
      body: void 0
    }, openTooltipWithBody = (input) => (input2) => input2.open && Object.is(input2.body, input) ? input2 : {
      open: !0,
      body: input
    }, replaceTooltipBody = (input) => (input2) => Object.is(input2.body, input) ? input2 : {
      ...input2,
      body: input
    }, resetTooltipState = (input) => input.open || input.body !== void 0 ? closedTooltipState : input, tooltipTextBalanceClass = "text-balance", tooltipContentRowClasses = "inline-flex items-center gap-2 min-h-[calc(1.5rem*var(--cds-rem-scale,1))] max-w-[240px] py-[calc(0.1875rem*var(--cds-rem-scale,1))]", tooltipContentAlignmentClass = "self-start", OVERFLOW_TOOLTIP_OWNER_SELECTOR = "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]", OVERFLOW_TOOLTIP_REVEAL_SELECTOR = 'a[href], button, summary, [role="button"], [role="link"], [role="tab"], [role^="menuitem"], [role="treeitem"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="row"], [role="gridcell"]', settleOverflowReveal = (input) => input === "shown" ? "shut" : input, TOOLTIP_DEFAULT_DELAY = 300, initializeTooltipSingleton = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)();
    }), initializeTooltip = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeInputDismissalTracking)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializeEventCallbacks)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeCollisionPadding)(), initializeTextClipping(), initializeCancelableTimeout(), initializeShortcuts(), initializeShrinkWrap(), initializeDisabledReason(), initializeTooltipSingleton(), initializeTooltipClasses(), initializeTooltipContext(), (0, runtime2.initializeNpmDependency)(), reactTooltip = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxTooltip = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactDomTooltip = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), TOOLTIP_NO_SHOW = Symbol("cds.Tooltip.noShow"), closedTooltipState = {
        open: !1,
        body: void 0
      }, tooltipSingleLineClasses = singleLineTooltipClasses, tooltipSecondaryDetailClasses = tooltipDetailClasses, tooltipMultilineBodyClasses = `flex flex-col gap-0.5 ${multilineTooltipClasses}`, overflowTooltipRevealers = /* @__PURE__ */ new WeakMap(), focusedOverflowLabels = /* @__PURE__ */ new WeakMap(), focusBeforeWindowBlur = /* @__PURE__ */ new WeakMap(), watchedOverflowDocuments = /* @__PURE__ */ new WeakSet(), OverflowTooltip = reactTooltip.forwardRef(function({ className, side: side2, align: align2, sideOffset, delay, collisionPadding, hoverable, lazy, children, ...props }, options) {
        let ref = reactTooltip.useRef(null), value = (0, runtime2.useMergedRefs)(ref, options), value2 = useTooltipsDisabled(), [reveal, onRevealChange] = useOverflowTooltipFocusReveal(ref, value2), body = props.dir === void 0 ? children : jsxTooltip.jsx("span", {
          dir: props.dir,
          children
        });
        return jsxTooltip.jsx(Tooltip, {
          content: value2 ? void 0 : reveal === "shown" ? body : () => {
            let current = ref.current;
            if (current !== null)
              return isOverflowClipped(current) ? body : void 0;
          },
          open: reveal === "shown" ? !0 : void 0,
          onOpenChange: onRevealChange,
          className: reveal === "no" ? void 0 : "transition-none",
          side: side2,
          align: align2,
          sideOffset,
          delay,
          collisionPadding,
          hoverable,
          lazy,
          children: jsxTooltip.jsx("span", {
            ...props,
            ref: value,
            "data-cds": "OverflowTooltip",
            className: (0, runtime2.cn)("block min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap", className),
            children
          })
        });
      }), OverflowTooltip.displayName = "OverflowTooltip", defaultTooltipImplementation = {
        Tooltip,
        DisabledReasonTooltip
      }, tooltipDelayContext = reactTooltip.createContext(null);
    });
  };
}
export {
  installUiAvatars
};
