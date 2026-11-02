// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarControls(runtime2) {
  var reacty8, PANEL_ELEVATION, POPOVER_ELEVATION, reactq8, jsxv1, ToolbarFloatingContext, ToolbarQuietContext, SHORTCUT_MODIFIER_NAMES, SHORTCUT_MODIFIER_LABELS, SHORTCUT_KEY_NAMES, ownShortcutMapping, SHORTCUT_SYMBOL_MODIFIERS, SHORTCUT_SPOKEN_REPLACEMENTS, TOOLBAR_LINK_DESCRIPTION, ToolbarButton, jsxR8, toolbarPointerSession, installedToolbarPointerDocuments, monotonicNow, TOOLBAR_POINTER_TIME_TOLERANCE, TOOLBAR_POINTER_COORDINATE_TOLERANCE, TOOLBAR_TOUCH_HOLD_MS, TOOLBAR_TOUCH_RECENCY_MS, TOOLBAR_STRAY_HOLD_MS, TOOLBAR_EARLY_HOLD_MS, pointInsideElement, matchesToolbarPointerEvent, toolbarStrips, toolbarClickThroughTimer, lastToolbarTouchRelease, afterTwoAnimationFrames, TOOLBAR_POSITION_TOLERANCE, toolbarTouchDeadlines, ToolbarGroupWrapContext, ToolbarStripButton, TOOLBAR_SCROLL_FOCUS_MARGIN;
  function ToolbarWhenVisible({ children }) {
    return reactq8.useContext(ToolbarQuietContext) ? null : jsxv1.jsx(jsxv1.Fragment, {
      children
    });
  }
  function DrawnCaretGlyph({ d, plain, box, className }) {
    let size4 = "calc(" + String(box / 16) + "rem * var(--cds-rem-scale, 1))";
    return jsxv1.jsxs(jsxv1.Fragment, {
      children: [
        jsxv1.jsx("span", {
          className: "contents [[data-cds-fizzy-lake~=icons]_&]:hidden",
          children: plain
        }),
        jsxv1.jsx("span", {
          className: "hidden [[data-cds-fizzy-lake~=icons]_&]:contents",
          children: jsxv1.jsx("span", {
            className: (0, runtime2.joinClassNames)("inline-flex items-center justify-center", className),
            style: {
              width: size4,
              height: size4
            },
            children: jsxv1.jsx(runtime2.Icon, {
              customIcon: {
                name: runtime2.CARET_DOWN_SMALL_SHAPE_ICON,
                viewBox: 16,
                paths: [
                  {
                    d,
                    strokeWidth: runtime2.SHAPE_ICON_PATHS.stroke
                  }
                ]
              },
              size: "sm"
            })
          })
        })
      ]
    });
  }
  function CaretGlyph({ plain, box, className }) {
    let icon = runtime2.SHAPE_ICON_PATHS.icons[runtime2.CARET_DOWN_SMALL_SHAPE_ICON];
    return icon === void 0 ? plain : jsxv1.jsx(DrawnCaretGlyph, {
      d: icon.d16,
      plain,
      box,
      ...className === void 0 ? {} : { className }
    });
  }
  function ToolbarCaret({ inherit = !1 } = {}) {
    let className = (0, runtime2.joinClassNames)("-mx-0.5 shrink-0", !inherit && "text-fg-muted");
    return jsxv1.jsx(CaretGlyph, {
      plain: jsxv1.jsx(runtime2.Icon, {
        name: "CaretDown",
        size: "xs",
        className
      }),
      box: 12,
      className
    });
  }
  function toolbarTooltipContent(props) {
    return props.disabled ? {
      content: props.disabledTip ?? props.tip ?? props.label,
      shortcut: void 0
    } : {
      content: props.tip ?? props.label,
      shortcut: props.shortcut
    };
  }
  function useDisabledButtonDescription(options) {
    let value = reactq8.useId();
    if (!options.disabled)
      return {
        props: {},
        inner: {},
        mirror: null
      };
    let value2 = !!options.reason && options.reason !== options.name;
    return {
      props: {
        role: "button",
        "aria-disabled": !0,
        "aria-label": options.name,
        "aria-describedby": value2 ? value : void 0,
        "aria-pressed": options.pressed,
        "aria-expanded": options.expanded,
        "aria-haspopup": options.hasPopup
      },
      inner: {
        "aria-hidden": !0
      },
      mirror: value2 ? jsxv1.jsx("span", {
        hidden: !0,
        id: value,
        children: spokenShortcut(options.reason ?? "")
      }) : null
    };
  }
  function useDeferredTooltipFocus(enabled, onChange) {
    let ref = reactq8.useRef(onChange);
    ref.current = onChange;
    let ref2 = reactq8.useRef(void 0), ref3 = reactq8.useRef(!1), current = reactq8.useRef((event) => {
      let currentTarget = event.currentTarget;
      if (event.type === "pointerdown")
        ref2.current = !1;
      else if (event.type === "focusout") {
        let relatedTarget = event.relatedTarget;
        event.target === currentTarget && relatedTarget instanceof Node && relatedTarget.isConnected && !currentTarget.contains(relatedTarget) && (ref3.current = !1);
      } else
        ref2.current = event.target instanceof Element && event.target.matches(":focus-visible"), event.type === "focusin" && event.target === currentTarget && ref.current && (ref3.current = ref2.current);
    }).current, current2 = reactq8.useRef(() => {
      ref3.current = !1;
    }).current, ref4 = reactq8.useRef(null), callback = (element) => {
      let current3 = ref4.current;
      if (element === current3)
        return;
      let items = ["focusin", "focusout", "keydown", "pointerdown"];
      if (current3 !== null) {
        for (let value of items)
          current3.removeEventListener(value, current);
        current3.ownerDocument.removeEventListener("pointerdown", current2, !0);
      }
      if (ref4.current = element, element !== null) {
        for (let value of items)
          element.addEventListener(value, current);
        element.ownerDocument.addEventListener("pointerdown", current2, !0);
      }
    };
    reactq8.useLayoutEffect(() => callback(enabled.current)), reactq8.useLayoutEffect(() => () => callback(null), []), reactq8.useLayoutEffect(() => {
      let current3 = enabled.current;
      if (current3 === null)
        return;
      let ownerDocument2 = current3.ownerDocument, value = ownerDocument2.activeElement instanceof HTMLElement || ownerDocument2.activeElement instanceof SVGElement ? ownerDocument2.activeElement : null, value2 = value === null || value === ownerDocument2.body || value === ownerDocument2.documentElement;
      if (onChange)
        ownerDocument2.hasFocus() && !value2 && value !== current3 && current3.contains(value) && (ref2.current ?? value.matches(":focus-visible")) && current3.focus({
          preventScroll: !0
        });
      else {
        let current4 = ref3.current;
        ref3.current = !1, current4 && (value === current3 || value2 && ownerDocument2.hasFocus()) && current3.querySelector("button")?.focus({
          preventScroll: !0
        });
      }
    }, [onChange]);
  }
  function accessibleKeyShortcut(shortcut, isMac) {
    let value = shortcut.trim().replace(/\s*\+\s*/g, "+");
    if (value === "" || /\s/.test(value))
      return;
    let items = [], items2 = [];
    for (let value2 of value.split("+")) {
      let value3 = value2.toLowerCase();
      if (value3 === "")
        continue;
      let value4 = ownShortcutMapping(SHORTCUT_MODIFIER_NAMES, value3);
      if (value4 !== void 0) {
        let value6 = value4[isMac ? 0 : 1];
        items.includes(value6) || items.push(value6);
        continue;
      }
      let value5 = ownShortcutMapping(SHORTCUT_KEY_NAMES, value3);
      items2.push(value5 !== void 0 ? typeof value5 == "string" ? value5 : value5[isMac ? 0 : 1] : value3.length === 1 ? value3.toUpperCase() : value3.charAt(0).toUpperCase() + value3.slice(1));
    }
    if (items2.length !== 0)
      return items.sort((input, options) => SHORTCUT_MODIFIER_LABELS.indexOf(input) - SHORTCUT_MODIFIER_LABELS.indexOf(options)), [...items, ...items2].join("+");
  }
  function shortcutSymbols(shortcut) {
    let value = shortcut.trim().replace(/\s*\+\s*/g, "+").split("+").filter((input) => input !== ""), callback = (input) => SHORTCUT_SYMBOL_MODIFIERS.some(([, ...input2]) => input2.includes(input.toLowerCase())), value2 = SHORTCUT_SYMBOL_MODIFIERS.filter(([, ...input]) => value.some((input2) => input.includes(input2.toLowerCase()))).map(([input]) => input), value3 = value.filter((input) => !callback(input)).map((input) => input.charAt(0).toUpperCase() + input.slice(1));
    return [...value2, ...value3].join("");
  }
  function spokenShortcut(shortcut, isMac = (0, runtime2.isApplePlatform)()) {
    let value = shortcut;
    for (let [value2, value3, value4] of SHORTCUT_SPOKEN_REPLACEMENTS)
      value = value.replace(value2, isMac ? value3 : value4);
    return value.replace(/ {2,}/g, " ").trim();
  }
  function useButtonAccessibility(props) {
    let value = reactq8.useId(), value2 = (0, runtime2.useAppleKeyboard)(), value3 = !props.disabled, value4 = props.tip !== "" && !props.name.includes(props.tip), value5 = value3 && props.shortcut !== void 0 ? accessibleKeyShortcut(props.shortcut, value2) : void 0, value6 = value3 && props.shortcut !== void 0 ? (0, runtime2.shortcutToAriaKeyShortcuts)(props.shortcut, value2) : void 0, value7 = value3 && props.descriptionSuffix ? props.descriptionSuffix : void 0, value8 = value3 && (value4 || value5 !== void 0 || value7 !== void 0), value9 = [props.describedBy, value8 ? value : void 0].filter(Boolean).join(" ") || void 0;
    if (!value8)
      return {
        describedBy: value9,
        keyShortcuts: value6,
        mirror: null
      };
    let value10 = [
      value4 ? spokenShortcut(props.tip, value2) : void 0,
      value5 !== void 0 ? "Shortcut: " + value5 : void 0
    ].filter(Boolean).join(". "), value11 = value7 === void 0 ? value10 : value10 === "" ? value7 : value10 + (/[.!?]$/.test(value10) ? " " : ". ") + value7;
    return {
      describedBy: value9,
      keyShortcuts: value6,
      mirror: jsxv1.jsx("span", {
        hidden: !0,
        id: value,
        children: value11
      })
    };
  }
  function completedToolbarPointerSession(session, allowStray = !1) {
    return session === null || session.ended === null || session.onStrip && !(allowStray && session.stray === !0) || session.inPopup || session.mouse || !(session.ended.at - session.began.at >= 0) ? null : session;
  }
  function installToolbarPointerTracking(document2) {
    installedToolbarPointerDocuments.has(document2) || (installedToolbarPointerDocuments.add(document2), document2.addEventListener("pointerdown", (event) => {
      if (event.isPrimary === !1)
        return;
      let value = monotonicNow();
      for (let value7 of Array.from(document2.querySelectorAll("[data-mc-through]"))) {
        let value8 = Number(value7.getAttribute("data-mc-through") || Number.NaN);
        value !== null && value < value8 && value8 - value <= TOOLBAR_EARLY_HOLD_MS || value7.removeAttribute("data-mc-through");
      }
      let target = event.target, value2 = target?.closest?.("[data-mc-strip]") ?? null, state = {
        onStrip: value2 !== null,
        inPopup: target?.closest?.(runtime2.OPEN_OVERLAY_SELECTOR) != null,
        mouse: event.pointerType === "mouse",
        began: {
          x: event.clientX,
          y: event.clientY,
          at: event.timeStamp,
          perf: value
        },
        ended: null
      }, value3 = value === null ? -1 : value - event.timeStamp;
      value2 !== null && event.pointerType !== "mouse" && value3 >= 0 && value3 <= TOOLBAR_TOUCH_RECENCY_MS && (state.early = event.timeStamp < toolbarElementClickThroughDeadline(value2));
      let value4 = completedToolbarPointerSession(toolbarPointerSession, !0), value5 = value4 === null ? -1 : event.timeStamp - value4.ended.at, value6 = value4 === null ? 0 : value4.runAt ?? value4.ended.at;
      value4 !== null && value5 >= 0 && value5 <= TOOLBAR_POINTER_TIME_TOLERANCE && event.timeStamp - value6 < TOOLBAR_TOUCH_HOLD_MS && (state.runAt = value6, state.stray = event.pointerType !== "mouse" && value2 !== null && pointInsideElement(value2, value4.ended.x, value4.ended.y)), toolbarPointerSession = state;
    }, !0), document2.addEventListener("pointerup", (input) => {
      input.isPrimary !== !1 && toolbarPointerSession !== null && (toolbarPointerSession.ended = {
        at: input.timeStamp,
        x: input.clientX,
        y: input.clientY,
        perf: monotonicNow()
      }), updateToolbarClickThroughAttributes();
    }, !0));
  }
  function isToolbarClickThrough(event) {
    let value = toolbarPointerSession;
    return event.detail === 0 || value === null ? !1 : value.stray === !0 || value.early === !0 ? matchesToolbarPointerEvent(event, value.began.at, value.began.x, value.began.y) || value.ended !== null && matchesToolbarPointerEvent(event, value.ended.at, value.ended.x, value.ended.y) : !value.onStrip && value.ended !== null && matchesToolbarPointerEvent(event, value.ended.at, value.ended.x, value.ended.y);
  }
  function coarseToolbarPointer() {
    try {
      return typeof matchMedia == "function" && matchMedia(runtime2.COARSE_POINTER_QUERY)?.matches === !0;
    } catch {
      return !1;
    }
  }
  function updateToolbarTouchDeadline(element, active) {
    let entry = toolbarTouchDeadlines.get(element);
    if (!active) {
      entry !== void 0 && toolbarTouchDeadlines.delete(element);
      return;
    }
    let value = monotonicNow(), bounds = element.getBoundingClientRect(), value2 = entry === void 0 || Math.abs(bounds.left - entry.left) > TOOLBAR_POSITION_TOLERANCE || Math.abs(bounds.top - entry.top) > TOOLBAR_POSITION_TOLERANCE, value3 = toolbarPointerSession, value4 = value3 === null ? null : value3.ended === null ? value3.began.perf : value3.ended.perf, value5 = value === null || value4 === null ? -1 : value - value4, value6 = value3 !== null && (value3.onStrip && value3.stray !== !0 && value3.early !== !0 || value3.inPopup) && value5 >= 0 && value5 <= (value3.ended === null ? TOOLBAR_TOUCH_HOLD_MS : TOOLBAR_POINTER_TIME_TOLERANCE);
    if (value6 && entry !== void 0 && ([entry.left, entry.top] = [bounds.left, bounds.top]), !value2 || value === null || !(bounds.width > 0 && bounds.height > 0) || !coarseToolbarPointer())
      return;
    if (value6) {
      entry === void 0 && toolbarTouchDeadlines.set(element, {
        left: bounds.left,
        top: bounds.top,
        end: 0,
        since: value,
        movedAt: 0
      });
      return;
    }
    let value7 = entry !== void 0 && (value < entry.end || value - entry.movedAt <= TOOLBAR_TOUCH_HOLD_MS) ? entry.since : value, state = {
      left: bounds.left,
      top: bounds.top,
      end: Math.min(value + TOOLBAR_STRAY_HOLD_MS + TOOLBAR_POINTER_TIME_TOLERANCE, value7 + TOOLBAR_EARLY_HOLD_MS),
      since: value7,
      movedAt: value
    };
    toolbarTouchDeadlines.set(element, state), afterTwoAnimationFrames(() => {
      let value8 = monotonicNow();
      value8 !== null && toolbarTouchDeadlines.get(element) === state && (state.end = Math.min(state.end, value8 + TOOLBAR_POINTER_TIME_TOLERANCE)), updateToolbarClickThroughAttributes();
    });
  }
  function toolbarElementClickThroughDeadline(element) {
    let value = completedToolbarPointerSession(toolbarPointerSession), value2 = value !== null && value.end !== void 0 && pointInsideElement(element, value.ended.x, value.ended.y) ? value.end : 0;
    return Math.max(toolbarTouchDeadlines.get(element)?.end ?? 0, value2);
  }
  function toolbarStripClickThroughDeadline(element, now) {
    return Math.max(toolbarTouchDeadlines.get(element)?.end ?? 0, toolbarRecentTouchDeadline(element, now));
  }
  function toolbarRecentTouchDeadline(element, now) {
    let value = completedToolbarPointerSession(toolbarPointerSession);
    if (value === null || value.ended.perf === null)
      return 0;
    if (value.end === void 0) {
      let value2 = now - value.ended.perf;
      if (!(value2 >= 0 && value2 <= TOOLBAR_TOUCH_RECENCY_MS) || !pointInsideElement(element, value.ended.x, value.ended.y))
        return 0;
      let value3 = lastToolbarTouchRelease !== null && value.began.perf !== null && value.began.perf < lastToolbarTouchRelease;
      value3 || (lastToolbarTouchRelease = now + TOOLBAR_STRAY_HOLD_MS + TOOLBAR_TOUCH_HOLD_MS);
      let value4 = lastToolbarTouchRelease ?? 0;
      value.end = Math.min(now + TOOLBAR_STRAY_HOLD_MS + TOOLBAR_POINTER_TIME_TOLERANCE, value4), afterTwoAnimationFrames(() => {
        let value5 = monotonicNow();
        value5 !== null && !value3 && lastToolbarTouchRelease === value4 && (lastToolbarTouchRelease = Math.min(value4, value5 + TOOLBAR_TOUCH_HOLD_MS)), value5 !== null && value.end !== void 0 && (value.end = Math.min(value.end, value5 + TOOLBAR_POINTER_TIME_TOLERANCE, lastToolbarTouchRelease ?? 0)), updateToolbarClickThroughAttributes();
      });
    }
    return now < value.end && pointInsideElement(element, value.ended.x, value.ended.y) ? value.end : 0;
  }
  function updateToolbarOverflowAttributes(strip, row) {
    strip.toggleAttribute("data-mc-more-start", row.scrollLeft > 1), strip.toggleAttribute("data-mc-more-end", row.scrollLeft < row.scrollWidth - row.clientWidth - 1);
  }
  function updateToolbarClickThroughAttributes() {
    toolbarClickThroughTimer !== null && clearTimeout(toolbarClickThroughTimer), toolbarClickThroughTimer = null;
    let value = monotonicNow(), index4 = 0;
    for (let value2 of toolbarStrips) {
      let value3 = value === null ? 0 : toolbarStripClickThroughDeadline(value2, value);
      value !== null && value < value3 ? (value2.setAttribute("data-mc-through", String(Math.ceil(value3))), index4 = Math.max(index4, value3)) : value2.removeAttribute("data-mc-through");
    }
    value !== null && index4 > 0 && (toolbarClickThroughTimer = setTimeout(updateToolbarClickThroughAttributes, Math.min(TOOLBAR_POINTER_TIME_TOLERANCE, Math.max(0, index4 - value)) + 1));
  }
  function ToolbarStrip({ className, onPointerDown, onMouseDown, onMouseDownCapture, onClickCapture, onScroll, children, surface = "panel", placed = "above", coversSelection, wrap = !1, ...remainingProps }) {
    reacty8.useEffect(() => installToolbarPointerTracking(document), []);
    let ref = reacty8.useRef(null), ref2 = reacty8.useRef(null), value = (0, runtime2.useCoarsePointer)();
    return reacty8.useLayoutEffect(() => {
      let current = ref.current;
      if (current !== null)
        return toolbarStrips.add(current), () => {
          toolbarStrips.delete(current), toolbarStrips.size === 0 && toolbarClickThroughTimer !== null && (clearTimeout(toolbarClickThroughTimer), toolbarClickThroughTimer = null);
        };
    }, []), reacty8.useLayoutEffect(() => {
      ref.current !== null && updateToolbarTouchDeadline(ref.current, coversSelection === !0), updateToolbarClickThroughAttributes(), ref.current !== null && ref2.current !== null && updateToolbarOverflowAttributes(ref.current, ref2.current);
    }), reacty8.useLayoutEffect(() => {
      let current = ref.current, current2 = ref2.current;
      if (current === null || current2 === null || typeof ResizeObserver > "u")
        return;
      let observer = new ResizeObserver(() => updateToolbarOverflowAttributes(current, current2));
      return observer.observe(current2), () => observer.disconnect();
    }, []), reacty8.useLayoutEffect(() => {
      let current = ref.current, current2 = ref2.current;
      if (surface !== "popover" || current === null || current2 === null || typeof ResizeObserver > "u")
        return;
      let callback = () => {
        let element = current2.querySelector('[data-cds="Button"]'), value2 = getComputedStyle(current2), value3 = (element?.offsetHeight ?? 0) + (parseFloat(value2.paddingTop) || 0) + (parseFloat(value2.paddingBottom) || 0);
        current.toggleAttribute("data-mc-wrapped", element !== null && current2.clientHeight > value3 + 1);
      }, observer = new ResizeObserver(callback);
      return observer.observe(current2), callback(), () => observer.disconnect();
    }, [surface]), jsxR8.jsx(runtime2.CdsRoot, {
      density: surface === "popover" && value ? "comfortable" : "compact",
      render: jsxR8.jsx(runtime2.Surface, {
        elevation: POPOVER_ELEVATION,
        role: "toolbar",
        "data-mc-strip": "",
        "data-mc-surface": surface,
        onPointerDown: (input) => {
          input.stopPropagation(), onPointerDown?.(input);
        },
        onMouseDownCapture: (event) => {
          event.currentTarget.contains(event.target) && isToolbarClickThrough(event) && (event.preventDefault(), event.stopPropagation()), onMouseDownCapture?.(event);
        },
        onClickCapture: (event) => {
          event.currentTarget.contains(event.target) && isToolbarClickThrough(event) && (event.preventDefault(), event.stopPropagation()), onClickCapture?.(event);
        },
        onMouseDown: (event) => {
          event.target.closest(runtime2.TEXT_EDITABLE_SELECTOR) || event.preventDefault(), onMouseDown?.(event);
        },
        className: (0, runtime2.joinClassNames)("z-selection flex items-center", surface === "popover" ? "[--mc-group-gap:2px] [--mc-strip-gap:4px] [--mc-strip-pad:5px] pointer-coarse:rounded-xl pointer-coarse:[--mc-group-gap:8px] pointer-coarse:[--mc-strip-gap:8px] pointer-coarse:[--mc-strip-pad:6px] [&_[data-mc-divider]]:mx-0" : "[--mc-strip-gap:2px] [--mc-strip-pad:4px] [--mc-group-gap:4px]", "max-w-[calc(100vw-16px)] overflow-clip", className),
        ...remainingProps,
        ref
      }),
      children: jsxR8.jsxs("div", {
        className: "relative min-w-0 flex-auto rounded-[inherit]",
        children: [
          jsxR8.jsx("div", {
            ref: ref2,
            "data-mc-row": "",
            onScroll: (input) => {
              ref.current !== null && updateToolbarOverflowAttributes(ref.current, input.currentTarget), onScroll?.(input);
            },
            className: (0, runtime2.joinClassNames)("flex min-w-0 items-center gap-[var(--mc-strip-gap)] rounded-[inherit] p-[var(--mc-strip-pad)]", wrap ? "flex-wrap" : "overflow-x-auto [clip-path:inset(0_1px)] [scrollbar-width:none] [&>*]:shrink-0"),
            children: jsxR8.jsx(runtime2.ToolbarTooltipSideContext.Provider, {
              value: placed === "below" ? "bottom" : "top",
              children: jsxR8.jsx(ToolbarGroupWrapContext.Provider, {
                value: wrap,
                children: jsxR8.jsx(runtime2.TooltipProvider, {
                  children
                })
              })
            })
          }),
          jsxR8.jsx("span", {
            "aria-hidden": "true",
            "data-tb-fade": "start",
            className: "pointer-events-none absolute inset-y-px left-px z-10 w-12",
            children: jsxR8.jsx("span", {
              className: "pointer-events-auto absolute inset-y-0 left-0 w-[30%]"
            })
          }),
          jsxR8.jsx("span", {
            "aria-hidden": "true",
            "data-tb-fade": "end",
            className: "pointer-events-none absolute inset-y-px right-px z-10 w-12",
            children: jsxR8.jsx("span", {
              className: "pointer-events-auto absolute inset-y-0 right-0 w-[30%]"
            })
          })
        ]
      })
    });
  }
  function ToolbarGroup({ wrap = !1, fields = !1, className, ...remainingProps }) {
    let value = reacty8.useContext(ToolbarGroupWrapContext);
    return jsxR8.jsx("span", {
      "data-mc-group": "",
      className: (0, runtime2.joinClassNames)("flex items-center gap-y-1", fields ? "gap-x-1" : "gap-x-[var(--mc-group-gap,4px)]", wrap && value && "max-w-full shrink-0 flex-wrap", className),
      ...remainingProps
    });
  }
  function ToolbarDivider() {
    return jsxR8.jsx("span", {
      "aria-hidden": "true",
      "data-mc-divider": "",
      className: "mx-0.5 h-[18px] w-px bg-border-line"
    });
  }
  function toolbarScrollableRow(strip) {
    return strip.querySelector("[data-mc-row]") ?? strip;
  }
  function scrollToolbarButtonIntoView(strip, button) {
    let value = toolbarScrollableRow(strip), bounds = button.getBoundingClientRect(), bounds2 = value.getBoundingClientRect();
    bounds.left < bounds2.left + TOOLBAR_SCROLL_FOCUS_MARGIN ? value.scrollLeft -= bounds2.left + TOOLBAR_SCROLL_FOCUS_MARGIN - bounds.left : bounds.right > bounds2.right - TOOLBAR_SCROLL_FOCUS_MARGIN && (value.scrollLeft += bounds.right - (bounds2.right - TOOLBAR_SCROLL_FOCUS_MARGIN));
  }
  return bindRuntimeValue(runtime2, "reacty8", () => reacty8, (value) => {
    reacty8 = value;
  }), bindRuntimeValue(runtime2, "PANEL_ELEVATION", () => PANEL_ELEVATION, (value) => {
    PANEL_ELEVATION = value;
  }), bindRuntimeValue(runtime2, "POPOVER_ELEVATION", () => POPOVER_ELEVATION, (value) => {
    POPOVER_ELEVATION = value;
  }), bindRuntimeValue(runtime2, "reactq8", () => reactq8, (value) => {
    reactq8 = value;
  }), bindRuntimeValue(runtime2, "jsxv1", () => jsxv1, (value) => {
    jsxv1 = value;
  }), bindRuntimeValue(runtime2, "ToolbarFloatingContext", () => ToolbarFloatingContext, (value) => {
    ToolbarFloatingContext = value;
  }), bindRuntimeValue(runtime2, "ToolbarQuietContext", () => ToolbarQuietContext, (value) => {
    ToolbarQuietContext = value;
  }), bindRuntimeValue(runtime2, "ToolbarWhenVisible", () => ToolbarWhenVisible), bindRuntimeValue(runtime2, "ToolbarCaret", () => ToolbarCaret), bindRuntimeValue(runtime2, "DrawnCaretGlyph", () => DrawnCaretGlyph), bindRuntimeValue(runtime2, "CaretGlyph", () => CaretGlyph), bindRuntimeValue(runtime2, "toolbarTooltipContent", () => toolbarTooltipContent), bindRuntimeValue(runtime2, "useDisabledButtonDescription", () => useDisabledButtonDescription), bindRuntimeValue(runtime2, "useDeferredTooltipFocus", () => useDeferredTooltipFocus), bindRuntimeValue(runtime2, "SHORTCUT_MODIFIER_NAMES", () => SHORTCUT_MODIFIER_NAMES, (value) => {
    SHORTCUT_MODIFIER_NAMES = value;
  }), bindRuntimeValue(runtime2, "SHORTCUT_MODIFIER_LABELS", () => SHORTCUT_MODIFIER_LABELS, (value) => {
    SHORTCUT_MODIFIER_LABELS = value;
  }), bindRuntimeValue(runtime2, "SHORTCUT_KEY_NAMES", () => SHORTCUT_KEY_NAMES, (value) => {
    SHORTCUT_KEY_NAMES = value;
  }), bindRuntimeValue(runtime2, "ownShortcutMapping", () => ownShortcutMapping, (value) => {
    ownShortcutMapping = value;
  }), bindRuntimeValue(runtime2, "accessibleKeyShortcut", () => accessibleKeyShortcut), bindRuntimeValue(runtime2, "SHORTCUT_SYMBOL_MODIFIERS", () => SHORTCUT_SYMBOL_MODIFIERS, (value) => {
    SHORTCUT_SYMBOL_MODIFIERS = value;
  }), bindRuntimeValue(runtime2, "shortcutSymbols", () => shortcutSymbols), bindRuntimeValue(runtime2, "SHORTCUT_SPOKEN_REPLACEMENTS", () => SHORTCUT_SPOKEN_REPLACEMENTS, (value) => {
    SHORTCUT_SPOKEN_REPLACEMENTS = value;
  }), bindRuntimeValue(runtime2, "spokenShortcut", () => spokenShortcut), bindRuntimeValue(runtime2, "useButtonAccessibility", () => useButtonAccessibility), bindRuntimeValue(runtime2, "TOOLBAR_LINK_DESCRIPTION", () => TOOLBAR_LINK_DESCRIPTION, (value) => {
    TOOLBAR_LINK_DESCRIPTION = value;
  }), bindRuntimeValue(runtime2, "ToolbarButton", () => ToolbarButton, (value) => {
    ToolbarButton = value;
  }), bindRuntimeValue(runtime2, "jsxR8", () => jsxR8, (value) => {
    jsxR8 = value;
  }), bindRuntimeValue(runtime2, "toolbarPointerSession", () => toolbarPointerSession, (value) => {
    toolbarPointerSession = value;
  }), bindRuntimeValue(runtime2, "installedToolbarPointerDocuments", () => installedToolbarPointerDocuments, (value) => {
    installedToolbarPointerDocuments = value;
  }), bindRuntimeValue(runtime2, "monotonicNow", () => monotonicNow, (value) => {
    monotonicNow = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_POINTER_TIME_TOLERANCE", () => TOOLBAR_POINTER_TIME_TOLERANCE, (value) => {
    TOOLBAR_POINTER_TIME_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_POINTER_COORDINATE_TOLERANCE", () => TOOLBAR_POINTER_COORDINATE_TOLERANCE, (value) => {
    TOOLBAR_POINTER_COORDINATE_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_TOUCH_HOLD_MS", () => TOOLBAR_TOUCH_HOLD_MS, (value) => {
    TOOLBAR_TOUCH_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_TOUCH_RECENCY_MS", () => TOOLBAR_TOUCH_RECENCY_MS, (value) => {
    TOOLBAR_TOUCH_RECENCY_MS = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_STRAY_HOLD_MS", () => TOOLBAR_STRAY_HOLD_MS, (value) => {
    TOOLBAR_STRAY_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_EARLY_HOLD_MS", () => TOOLBAR_EARLY_HOLD_MS, (value) => {
    TOOLBAR_EARLY_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "completedToolbarPointerSession", () => completedToolbarPointerSession), bindRuntimeValue(runtime2, "pointInsideElement", () => pointInsideElement, (value) => {
    pointInsideElement = value;
  }), bindRuntimeValue(runtime2, "installToolbarPointerTracking", () => installToolbarPointerTracking), bindRuntimeValue(runtime2, "matchesToolbarPointerEvent", () => matchesToolbarPointerEvent, (value) => {
    matchesToolbarPointerEvent = value;
  }), bindRuntimeValue(runtime2, "isToolbarClickThrough", () => isToolbarClickThrough), bindRuntimeValue(runtime2, "toolbarStrips", () => toolbarStrips, (value) => {
    toolbarStrips = value;
  }), bindRuntimeValue(runtime2, "toolbarClickThroughTimer", () => toolbarClickThroughTimer, (value) => {
    toolbarClickThroughTimer = value;
  }), bindRuntimeValue(runtime2, "lastToolbarTouchRelease", () => lastToolbarTouchRelease, (value) => {
    lastToolbarTouchRelease = value;
  }), bindRuntimeValue(runtime2, "afterTwoAnimationFrames", () => afterTwoAnimationFrames, (value) => {
    afterTwoAnimationFrames = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_POSITION_TOLERANCE", () => TOOLBAR_POSITION_TOLERANCE, (value) => {
    TOOLBAR_POSITION_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "toolbarTouchDeadlines", () => toolbarTouchDeadlines, (value) => {
    toolbarTouchDeadlines = value;
  }), bindRuntimeValue(runtime2, "coarseToolbarPointer", () => coarseToolbarPointer), bindRuntimeValue(runtime2, "updateToolbarTouchDeadline", () => updateToolbarTouchDeadline), bindRuntimeValue(runtime2, "toolbarElementClickThroughDeadline", () => toolbarElementClickThroughDeadline), bindRuntimeValue(runtime2, "toolbarStripClickThroughDeadline", () => toolbarStripClickThroughDeadline), bindRuntimeValue(runtime2, "toolbarRecentTouchDeadline", () => toolbarRecentTouchDeadline), bindRuntimeValue(runtime2, "ToolbarGroupWrapContext", () => ToolbarGroupWrapContext, (value) => {
    ToolbarGroupWrapContext = value;
  }), bindRuntimeValue(runtime2, "updateToolbarOverflowAttributes", () => updateToolbarOverflowAttributes), bindRuntimeValue(runtime2, "updateToolbarClickThroughAttributes", () => updateToolbarClickThroughAttributes), bindRuntimeValue(runtime2, "ToolbarStrip", () => ToolbarStrip), bindRuntimeValue(runtime2, "ToolbarStripButton", () => ToolbarStripButton, (value) => {
    ToolbarStripButton = value;
  }), bindRuntimeValue(runtime2, "ToolbarGroup", () => ToolbarGroup), bindRuntimeValue(runtime2, "ToolbarDivider", () => ToolbarDivider), bindRuntimeValue(runtime2, "toolbarScrollableRow", () => toolbarScrollableRow), bindRuntimeValue(runtime2, "TOOLBAR_SCROLL_FOCUS_MARGIN", () => TOOLBAR_SCROLL_FOCUS_MARGIN, (value) => {
    TOOLBAR_SCROLL_FOCUS_MARGIN = value;
  }), bindRuntimeValue(runtime2, "scrollToolbarButtonIntoView", () => scrollToolbarButtonIntoView), () => {
    (0, runtime2.initializeUiInputs210)(), reacty8 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PANEL_ELEVATION = "panel", POPOVER_ELEVATION = "popover", (0, runtime2.initializeUiPropertyFocus)(), (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeColorSelect)(), (0, runtime2.initializeUiPointerMedia)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeShapeIconPaths)(), (0, runtime2.initializeShapeIconNames)(), reactq8 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxv1 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ToolbarFloatingContext = reactq8.createContext(!1), ToolbarQuietContext = reactq8.createContext(!1), SHORTCUT_MODIFIER_NAMES = {
      ctrl: ["Control", "Ctrl"],
      control: ["Control", "Ctrl"],
      alt: ["Option", "Alt"],
      option: ["Option", "Alt"],
      shift: ["Shift", "Shift"],
      cmd: ["Command", "Ctrl"],
      command: ["Command", "Ctrl"],
      meta: ["Command", "Ctrl"]
    }, SHORTCUT_MODIFIER_LABELS = [
      "Control",
      "Ctrl",
      "Option",
      "Alt",
      "Shift",
      "Command"
    ], SHORTCUT_KEY_NAMES = {
      esc: "Escape",
      escape: "Escape",
      enter: ["Return", "Enter"],
      return: ["Return", "Enter"],
      delete: ["Delete", "Backspace"],
      backspace: ["Delete", "Backspace"],
      space: "Space",
      tab: "Tab",
      up: "Up Arrow",
      down: "Down Arrow",
      left: "Left Arrow",
      right: "Right Arrow",
      pageup: "Page Up",
      pagedown: "Page Down",
      "\\": "Backslash",
      "/": "Slash",
      "-": "Minus",
      "=": "Equals",
      ",": "Comma",
      ".": "Period",
      ";": "Semicolon",
      "'": "Apostrophe",
      "`": "Backtick",
      "[": "Left Bracket",
      "]": "Right Bracket"
    }, ownShortcutMapping = (mapping, key) => Object.hasOwn(mapping, key) ? mapping[key] : void 0, SHORTCUT_SYMBOL_MODIFIERS = [
      ["⌃", "ctrl", "control"],
      ["⌥", "alt", "option"],
      ["⇧", "shift"],
      ["⌘", "cmd", "command", "meta"]
    ], SHORTCUT_SPOKEN_REPLACEMENTS = [
      [/⌘/g, "Command ", "Ctrl "],
      [/⇧/g, "Shift ", "Shift "],
      [/⌥/g, "Option ", "Alt "],
      [/⌃/g, "Control ", "Ctrl "],
      [/⏎/g, "Return", "Enter"],
      [/⌫/g, "Delete", "Backspace"]
    ], TOOLBAR_LINK_DESCRIPTION = "(opens in new tab)", ToolbarButton = reactq8.forwardRef(function({ icon, glyph, label, tip, disabledTip, shortcut, descriptionSuffix, children, pressed: pressed3, expanded, count, indicator, iconOnly, caret, tipSide = "bottom", tipShut = !1, className, variant = "ghost", href, "aria-expanded": ariaExpanded, "aria-describedby": ariaDescribedby, ...props }, options) {
      let value = reactq8.useContext(ToolbarFloatingContext), linkUrl = href === void 0 ? void 0 : (0, runtime2.classifyExternalLink)(href, {
        storedUrl: !0
      });
      reactq8.useEffect(() => {
        linkUrl === null && console.warn('ToolbarButton: this page may not open the href of "' + label + '", so the control is not drawn');
      }, [linkUrl, label]);
      let value2 = href === void 0 && props.disabled === !0, value3 = count ? label + " (" + String(count) + ")" : label, value4 = icon ?? glyph, value5 = toolbarTooltipContent({
        label,
        tip,
        disabledTip,
        shortcut,
        disabled: value2
      }), value6 = useButtonAccessibility({
        disabled: value2,
        name: value3,
        tip: value5.content,
        shortcut: value5.shortcut,
        describedBy: ariaDescribedby,
        descriptionSuffix: href === void 0 ? descriptionSuffix : [descriptionSuffix, TOOLBAR_LINK_DESCRIPTION].filter(Boolean).join(" ")
      }), value7 = useDisabledButtonDescription({
        disabled: value2,
        name: value3,
        reason: disabledTip ?? tip,
        pressed: pressed3,
        expanded: expanded ?? ariaExpanded,
        hasPopup: props["aria-haspopup"]
      }), ref = reactq8.useRef(null);
      useDeferredTooltipFocus(ref, value2);
      let state = {
        ...props,
        ref: options,
        variant,
        ...linkUrl == null ? {
          pressed: pressed3,
          "aria-expanded": expanded ?? ariaExpanded
        } : {
          href: linkUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          draggable: !1,
          disabled: void 0,
          type: void 0
        },
        "aria-label": value3,
        "aria-describedby": value6.describedBy,
        "aria-keyshortcuts": props["aria-keyshortcuts"] ?? value6.keyShortcuts,
        "data-tb-caret": caret === !0 ? "" : void 0,
        ...value7.inner
      };
      if (linkUrl === null)
        return null;
      let value8 = iconOnly === !0 || value && variant !== "primary", value9 = value8 && caret !== !0;
      return jsxv1.jsx(runtime2.Tooltip, {
        content: value5.content,
        shortcut: value5.shortcut,
        side: tipSide,
        hoverable: !1,
        open: tipShut ? !1 : void 0,
        children: jsxv1.jsxs("span", {
          ref,
          tabIndex: value2 ? 0 : -1,
          ...value7.props,
          "data-tb-icon": value9 ? "" : void 0,
          className: (0, runtime2.joinClassNames)("relative inline-flex shrink-0 rounded align-top outline-none focus-visible:outline-hidden focus-visible:shadow-focus", className),
          children: [
            value8 ? caret === !0 ? jsxv1.jsx(runtime2.Button, {
              ...state,
              icon: value4,
              children: jsxv1.jsx(ToolbarCaret, {})
            }) : jsxv1.jsx(runtime2.Button, {
              ...state,
              iconOnly: !0,
              icon: value4,
              tooltip: !1,
              indicator
            }) : jsxv1.jsxs(runtime2.Button, {
              ...state,
              icon: value4,
              children: [
                label,
                children,
                caret === !0 ? jsxv1.jsx(ToolbarCaret, {
                  inherit: variant === "primary"
                }) : null
              ]
            }),
            count ? jsxv1.jsx("span", {
              "aria-hidden": "true",
              className: "pointer-events-none absolute -top-0.5 -right-0.5 flex",
              children: jsxv1.jsx(runtime2.Counter, {
                value: count,
                variant: "accent",
                size: "xs"
              })
            }) : null,
            value6.mirror,
            value7.mirror
          ]
        })
      });
    }), jsxR8 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), toolbarPointerSession = null, installedToolbarPointerDocuments = /* @__PURE__ */ new WeakSet(), monotonicNow = () => typeof performance > "u" ? null : performance.now(), TOOLBAR_POINTER_TIME_TOLERANCE = 500, TOOLBAR_POINTER_COORDINATE_TOLERANCE = 8, TOOLBAR_TOUCH_HOLD_MS = 1e3, TOOLBAR_TOUCH_RECENCY_MS = 5e3, TOOLBAR_STRAY_HOLD_MS = 3e3, TOOLBAR_EARLY_HOLD_MS = 8e3, pointInsideElement = (element, x, y) => {
      let bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    }, typeof document < "u" && installToolbarPointerTracking(document), matchesToolbarPointerEvent = (event, timestamp, x, y) => Math.abs(event.timeStamp - timestamp) <= TOOLBAR_POINTER_TIME_TOLERANCE && Math.abs(event.clientX - x) <= TOOLBAR_POINTER_COORDINATE_TOLERANCE && Math.abs(event.clientY - y) <= TOOLBAR_POINTER_COORDINATE_TOLERANCE, toolbarStrips = /* @__PURE__ */ new Set(), toolbarClickThroughTimer = null, lastToolbarTouchRelease = null, afterTwoAnimationFrames = (callback) => {
      typeof requestAnimationFrame == "function" && requestAnimationFrame(() => requestAnimationFrame(callback));
    }, TOOLBAR_POSITION_TOLERANCE = 4, toolbarTouchDeadlines = /* @__PURE__ */ new WeakMap(), ToolbarGroupWrapContext = reacty8.createContext(!0), ToolbarStripButton = reacty8.forwardRef(function({ className, type, onMouseDown, chevron, icon, children, title, disabled: disabled2, "aria-pressed": ariaPressed, "aria-label": ariaLabel, "aria-expanded": ariaExpanded, "aria-describedby": ariaDescribedby, ...props }, options) {
      let value = ariaPressed === void 0 ? void 0 : ariaPressed === !0 || ariaPressed === "true", callback = (event) => {
        event.preventDefault(), onMouseDown?.(event);
      }, value2 = disabled2 === !0, value3 = reacty8.useContext(runtime2.ToolbarTooltipSideContext) ?? "top", value4 = ariaLabel ?? (typeof children == "string" ? children : void 0), value5 = useDisabledButtonDescription({
        disabled: value2 && title !== void 0,
        name: value4 ?? title ?? "",
        reason: title,
        pressed: ariaPressed,
        expanded: ariaExpanded,
        hasPopup: props["aria-haspopup"]
      }), ref = reacty8.useRef(null);
      useDeferredTooltipFocus(ref, value2 && title !== void 0);
      let value6 = reacty8.useId(), value7 = !value2 && !!title && value4?.startsWith(title) !== !0, value8 = [ariaDescribedby, value7 ? value6 : void 0].filter(Boolean).join(" ") || void 0, state = {
        ref: options,
        variant: "ghost",
        type: type ?? "button",
        pressed: value,
        disabled: disabled2,
        "aria-expanded": ariaExpanded,
        "aria-describedby": value8,
        onMouseDown: callback,
        className: (0, runtime2.joinClassNames)("shrink-0", className),
        ...props,
        "data-mc-item": "",
        ...value5.inner
      }, value9 = icon !== void 0 && children == null ? jsxR8.jsx(runtime2.Button, {
        ...state,
        iconOnly: !0,
        icon,
        "aria-label": ariaLabel ?? "",
        tooltip: !1
      }) : jsxR8.jsxs(runtime2.Button, {
        ...state,
        icon,
        "aria-label": ariaLabel,
        children: [
          children,
          chevron === !0 ? jsxR8.jsx(CaretGlyph, {
            plain: jsxR8.jsx(runtime2.Icon, {
              name: "CaretDown",
              size: "sm",
              className: "shrink-0 opacity-60"
            }),
            box: 16,
            className: "shrink-0 opacity-60"
          }) : null
        ]
      });
      return title === void 0 ? value9 : jsxR8.jsx(runtime2.Tooltip, {
        content: title,
        side: value3,
        hoverable: !1,
        open: (ariaExpanded === !0 || ariaExpanded === "true") && !value2 ? !1 : void 0,
        children: jsxR8.jsxs("span", {
          ref,
          tabIndex: value2 ? 0 : -1,
          ...value5.props,
          "data-tip": title,
          className: "relative inline-flex shrink-0 rounded align-top outline-none focus-visible:outline-hidden focus-visible:shadow-focus",
          children: [
            value9,
            value7 ? jsxR8.jsx("span", {
              hidden: !0,
              id: value6,
              children: spokenShortcut(title)
            }) : null,
            value5.mirror
          ]
        })
      });
    }), TOOLBAR_SCROLL_FOCUS_MARGIN = 48;
  };
}
export {
  installUiToolbarControls
};
