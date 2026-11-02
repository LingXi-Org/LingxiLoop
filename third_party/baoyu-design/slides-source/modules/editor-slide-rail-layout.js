// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideRailLayout(runtime2) {
  var ReactSlideRailLayout, MIN_RAIL_THUMB_WIDTH, MIN_STAGE_HEIGHT_AFTER_RAIL, MAX_RAIL_HEIGHT_FRACTION, RAIL_RESIZE_VIEWPORT_MINIMUM, RAIL_THUMB_WIDTH_CSS_VARIABLE, SLIDE_THUMB_ASPECT_RATIO, RAIL_THUMB_WIDTH_STORAGE_KEY, RAIL_THUMB_RESIZE_SETTLE_MS;
  function calculateMaxRailThumbWidth(availableHeight2, chromeHeight, maxWidth = 1 / 0) {
    let maxRailHeight = Math.min(availableHeight2 * MAX_RAIL_HEIGHT_FRACTION, availableHeight2 - MIN_STAGE_HEIGHT_AFTER_RAIL);
    return Math.max(MIN_RAIL_THUMB_WIDTH, Math.floor(Math.min((maxRailHeight - chromeHeight) * SLIDE_THUMB_ASPECT_RATIO, maxWidth)));
  }
  function canResizeSlideRail(width, height2, touch) {
    return width >= RAIL_RESIZE_VIEWPORT_MINIMUM.w && height2 >= (touch ? RAIL_RESIZE_VIEWPORT_MINIMUM.touchH : RAIL_RESIZE_VIEWPORT_MINIMUM.h);
  }
  function clampRailThumbWidth(width, maxWidth) {
    return Math.max(MIN_RAIL_THUMB_WIDTH, Math.min(maxWidth, Math.round(width)));
  }
  function calculateRailHeight(layout, stageHeightDelta) {
    return layout.chrome + clampRailThumbWidth(layout.pref, calculateMaxRailThumbWidth(layout.room - stageHeightDelta, layout.chrome, layout.fitW)) / SLIDE_THUMB_ASPECT_RATIO;
  }
  function clampStageRailResizeDelta(delta, layout, minimum, maximum) {
    if (!Number.isFinite(delta + minimum + maximum) || layout !== null && !Number.isFinite(layout.room + layout.chrome + layout.pref))
      return Number.isFinite(minimum + maximum) ? Math.max(minimum, Math.min(maximum, 0)) : 0;
    if (maximum <= minimum)
      return minimum;
    if (!layout)
      return Math.max(minimum, Math.min(maximum, delta));
    let value = calculateRailHeight(layout, 0), callback = (input) => input + calculateRailHeight(layout, input) - value;
    if (callback(minimum) >= delta)
      return minimum;
    if (callback(maximum) < delta)
      return maximum;
    let [items, items2] = [minimum, maximum];
    for (let index4 = 0; index4 < 24; index4++) {
      let value2 = (items + items2) / 2;
      callback(value2) >= delta ? items2 = value2 : items = value2;
    }
    return items2;
  }
  function resizeRailThumbWidth(preferredWidth, heightDelta, maxWidth) {
    return clampRailThumbWidth(preferredWidth - heightDelta * SLIDE_THUMB_ASPECT_RATIO, maxWidth);
  }
  function readRailThumbWidthPreference() {
    try {
      let value = JSON.parse(localStorage.getItem(RAIL_THUMB_WIDTH_STORAGE_KEY) ?? "null");
      if (typeof value == "number" && Number.isFinite(value))
        return Math.max(MIN_RAIL_THUMB_WIDTH, Math.round(value));
    } catch {
    }
    return MIN_RAIL_THUMB_WIDTH;
  }
  function writeRailThumbWidthPreference(width) {
    try {
      localStorage.setItem(RAIL_THUMB_WIDTH_STORAGE_KEY, JSON.stringify(width));
    } catch {
    }
  }
  function captureRailScrollAnchor(layout) {
    let anchorVisible = layout.anchor !== void 0 && layout.anchor.left + layout.anchor.width > 0 && layout.anchor.left < layout.view, anchorWhole = anchorVisible && layout.anchor !== void 0 && layout.anchor.left >= 0 && layout.anchor.left + layout.anchor.width <= layout.view, anchorLeft = anchorVisible && layout.anchor ? layout.anchor.left + layout.anchor.width / 2 : layout.view / 2, callback = (input) => layout.pitch > 0 ? (layout.scrollLeft + input - layout.pad) / layout.pitch : 0;
    return {
      at: anchorLeft,
      t: callback(anchorLeft),
      pad: layout.pad,
      gap: layout.pitch - layout.w,
      view: layout.view,
      held: anchorVisible,
      whole: anchorWhole,
      mid: callback(layout.view / 2)
    };
  }
  function calculateAnchoredRailScroll(anchor, width, centerPartial = !1) {
    let cellSpan = width + anchor.gap;
    if (centerPartial && !anchor.whole)
      return anchor.pad + anchor.mid * cellSpan - anchor.view / 2;
    let value = anchor.pad + anchor.t * cellSpan - anchor.at;
    if (!anchor.held)
      return value;
    let value2 = anchor.pad + Math.floor(anchor.t) * cellSpan;
    return Math.min(Math.max(value, value2 + cellSpan + anchor.pad - anchor.view), value2 - anchor.pad);
  }
  function useSlideRailLayout(enabled, options, layoutChanged, anchor) {
    let value = options?.canvas, value2 = options?.thumbW ?? MIN_RAIL_THUMB_WIDTH, [value3, value4] = ReactSlideRailLayout.useState(MIN_RAIL_THUMB_WIDTH), value5 = clampRailThumbWidth(value2, value3), ref = ReactSlideRailLayout.useRef(value5), ref2 = ReactSlideRailLayout.useRef(value3), ref3 = ReactSlideRailLayout.useRef(!1), ref4 = ReactSlideRailLayout.useRef({
      anchor,
      pref: value2,
      maxW: value3,
      onThumbW: options?.onThumbW
    });
    ReactSlideRailLayout.useLayoutEffect(() => {
      ref3.current || (ref.current = value5), ref4.current = {
        anchor,
        pref: value2,
        maxW: value3,
        onThumbW: options?.onThumbW
      };
    });
    let callback = ReactSlideRailLayout.useCallback(() => {
      let current = layoutChanged.current, value8 = current?.firstElementChild;
      if (!current || !value8)
        return captureRailScrollAnchor({
          scrollLeft: 0,
          view: 0,
          pad: 0,
          pitch: 0,
          w: ref.current
        });
      let bounds = current.getBoundingClientRect(), bounds2 = value8.getBoundingClientRect(), value9 = ref4.current.anchor()?.getBoundingClientRect();
      return captureRailScrollAnchor({
        scrollLeft: current.scrollLeft,
        view: bounds.width,
        pad: bounds2.left - bounds.left + current.scrollLeft,
        pitch: bounds2.width,
        w: ref.current,
        anchor: value9 && {
          left: value9.left - bounds.left,
          width: value9.width
        }
      });
    }, [layoutChanged]), ref5 = ReactSlideRailLayout.useRef(null), ref6 = ReactSlideRailLayout.useRef(!1), ref7 = ReactSlideRailLayout.useRef(null), callback2 = ReactSlideRailLayout.useCallback(() => {
      ref7.current = null;
    }, []), callback3 = ReactSlideRailLayout.useCallback((input) => {
      let current = ref5.current;
      return !current || current.to !== input ? null : (ref5.current = null, current.hold.onMount && (ref7.current = null), current.hold);
    }, []), ref8 = ReactSlideRailLayout.useRef(0);
    ReactSlideRailLayout.useLayoutEffect(() => () => clearTimeout(ref8.current), []);
    let callback4 = ReactSlideRailLayout.useCallback(() => {
      let current = enabled.current, value8 = value?.current;
      if (!current || !value8)
        return null;
      let height2 = current.getBoundingClientRect().height;
      if (height2 === 0)
        return null;
      let current2 = layoutChanged.current, value9 = current2?.firstElementChild, value10 = 1 / 0;
      if (current2 && value9 && current2.clientWidth > 0) {
        let value11 = value9.getBoundingClientRect().left - current2.getBoundingClientRect().left + current2.scrollLeft;
        value10 = current2.clientWidth - 2 * value11 - (value9.getBoundingClientRect().width - ref.current);
      }
      return {
        room: Math.round(height2 + value8.getBoundingClientRect().height),
        chrome: height2 - ref.current / SLIDE_THUMB_ASPECT_RATIO,
        fitW: value10,
        pref: ref4.current.pref
      };
    }, [enabled, value, layoutChanged]), value6 = options?.geometry;
    ReactSlideRailLayout.useLayoutEffect(() => {
      if (value6)
        return value6.current = callback4, () => {
          value6.current = null;
        };
    }, [value6, callback4]);
    let callback5 = ReactSlideRailLayout.useCallback((input = !1) => {
      let value8 = ref3.current ? null : callback4();
      if (!value8)
        return;
      let value9 = calculateMaxRailThumbWidth(value8.room, value8.chrome, value8.fitW);
      ref2.current = value9, clearTimeout(ref8.current);
      let current = ref4.current, value10 = clampRailThumbWidth(current.pref, value9) !== clampRailThumbWidth(current.pref, current.maxW);
      if (value10) {
        let value11 = callback(), value12 = layoutChanged.current?.childElementCount ?? 0, value13 = ref4.current.anchor(), current2 = ref7.current, value14 = current2 === null || Math.abs(current2.view - value11.view) > 0.5 || current2.count !== value12 || current2.anchor !== value13 ? {
          ...value11,
          onMount: !ref6.current,
          count: value12,
          anchor: value13
        } : current2;
        ref7.current = value14, ref5.current = {
          hold: value14,
          to: clampRailThumbWidth(current.pref, value9)
        };
      }
      ref6.current = !0, input || value10 || value9 <= MIN_RAIL_THUMB_WIDTH != current.maxW <= MIN_RAIL_THUMB_WIDTH ? value4(value9) : value9 !== current.maxW && (ref8.current = setTimeout(() => value4(value9), RAIL_THUMB_RESIZE_SETTLE_MS));
    }, [callback4, callback, layoutChanged]), value7 = options?.paneH ?? 0;
    ReactSlideRailLayout.useLayoutEffect(() => {
      callback5();
    }, [value7, callback5]), ReactSlideRailLayout.useLayoutEffect(() => {
      let current = enabled.current, value8 = value?.current;
      if (!current || !value8 || typeof ResizeObserver > "u")
        return;
      callback5(!0);
      let observer = new ResizeObserver(() => callback5());
      return observer.observe(current), observer.observe(value8), () => observer.disconnect();
    }, [enabled, value, callback5]);
    let ref9 = ReactSlideRailLayout.useRef({
      w: MIN_RAIL_THUMB_WIDTH,
      max: MIN_RAIL_THUMB_WIDTH,
      at: 0,
      t: 0,
      pad: 0,
      gap: 0,
      view: 0,
      held: !1,
      whole: !1,
      mid: 0
    }), ref10 = ReactSlideRailLayout.useRef(null), callback6 = ReactSlideRailLayout.useCallback((input) => {
      ref.current = input, enabled.current?.style.setProperty(RAIL_THUMB_WIDTH_CSS_VARIABLE, String(input)), ref10.current?.setAttribute("aria-valuenow", String(input)), layoutChanged.current && (layoutChanged.current.scrollLeft = calculateAnchoredRailScroll(ref9.current, input));
    }, [enabled, layoutChanged]), callback7 = ReactSlideRailLayout.useCallback(() => {
      ref7.current = null, callback5(!0), ref3.current = !0, ref9.current = {
        ...callback(),
        w: ref.current,
        max: ref2.current
      }, ref10.current = Array.from(enabled.current?.children ?? []).find((element) => element.getAttribute("role") === "separator") ?? null;
    }, [callback5, callback, enabled]), callback8 = ReactSlideRailLayout.useCallback((input) => {
      ref3.current = !1, ref5.current = null, input ? callback6(ref9.current.w) : ref.current !== ref9.current.w && (ref4.current.onThumbW?.(ref.current), writeRailThumbWidthPreference(ref.current)), callback5();
      let value8 = clampRailThumbWidth(ref.current, ref2.current);
      !input && value8 !== ref.current && (callback6(value8), value4(ref2.current));
    }, [callback6, callback5]), memo4 = ReactSlideRailLayout.useMemo(() => ({
      onResizeStart: callback7,
      onResize: (input) => callback6(resizeRailThumbWidth(ref9.current.w, input, ref9.current.max)),
      onResizeEnd: (input, options2, context) => callback8(context)
    }), [callback7, callback6, callback8]), callback9 = ReactSlideRailLayout.useCallback((input) => {
      callback7(), callback6(clampRailThumbWidth(input, ref9.current.max)), callback8();
    }, [callback7, callback6, callback8]);
    return {
      thumbW: value5,
      maxW: value3,
      gesture: memo4,
      setThumbW: callback9,
      takeAutoHold: callback3,
      forgetAutoHold: callback2
    };
  }
  return bindRuntimeValue(runtime2, "ReactSlideRailLayout", () => ReactSlideRailLayout, (value) => {
    ReactSlideRailLayout = value;
  }), bindRuntimeValue(runtime2, "MIN_RAIL_THUMB_WIDTH", () => MIN_RAIL_THUMB_WIDTH, (value) => {
    MIN_RAIL_THUMB_WIDTH = value;
  }), bindRuntimeValue(runtime2, "MIN_STAGE_HEIGHT_AFTER_RAIL", () => MIN_STAGE_HEIGHT_AFTER_RAIL, (value) => {
    MIN_STAGE_HEIGHT_AFTER_RAIL = value;
  }), bindRuntimeValue(runtime2, "MAX_RAIL_HEIGHT_FRACTION", () => MAX_RAIL_HEIGHT_FRACTION, (value) => {
    MAX_RAIL_HEIGHT_FRACTION = value;
  }), bindRuntimeValue(runtime2, "RAIL_RESIZE_VIEWPORT_MINIMUM", () => RAIL_RESIZE_VIEWPORT_MINIMUM, (value) => {
    RAIL_RESIZE_VIEWPORT_MINIMUM = value;
  }), bindRuntimeValue(runtime2, "RAIL_THUMB_WIDTH_CSS_VARIABLE", () => RAIL_THUMB_WIDTH_CSS_VARIABLE, (value) => {
    RAIL_THUMB_WIDTH_CSS_VARIABLE = value;
  }), bindRuntimeValue(runtime2, "SLIDE_THUMB_ASPECT_RATIO", () => SLIDE_THUMB_ASPECT_RATIO, (value) => {
    SLIDE_THUMB_ASPECT_RATIO = value;
  }), bindRuntimeValue(runtime2, "RAIL_THUMB_WIDTH_STORAGE_KEY", () => RAIL_THUMB_WIDTH_STORAGE_KEY, (value) => {
    RAIL_THUMB_WIDTH_STORAGE_KEY = value;
  }), bindRuntimeValue(runtime2, "calculateMaxRailThumbWidth", () => calculateMaxRailThumbWidth), bindRuntimeValue(runtime2, "canResizeSlideRail", () => canResizeSlideRail), bindRuntimeValue(runtime2, "clampRailThumbWidth", () => clampRailThumbWidth), bindRuntimeValue(runtime2, "calculateRailHeight", () => calculateRailHeight), bindRuntimeValue(runtime2, "clampStageRailResizeDelta", () => clampStageRailResizeDelta), bindRuntimeValue(runtime2, "resizeRailThumbWidth", () => resizeRailThumbWidth), bindRuntimeValue(runtime2, "readRailThumbWidthPreference", () => readRailThumbWidthPreference), bindRuntimeValue(runtime2, "writeRailThumbWidthPreference", () => writeRailThumbWidthPreference), bindRuntimeValue(runtime2, "captureRailScrollAnchor", () => captureRailScrollAnchor), bindRuntimeValue(runtime2, "calculateAnchoredRailScroll", () => calculateAnchoredRailScroll), bindRuntimeValue(runtime2, "RAIL_THUMB_RESIZE_SETTLE_MS", () => RAIL_THUMB_RESIZE_SETTLE_MS, (value) => {
    RAIL_THUMB_RESIZE_SETTLE_MS = value;
  }), bindRuntimeValue(runtime2, "useSlideRailLayout", () => useSlideRailLayout), () => {
    (0, runtime2.initializeSlideModel)(), ReactSlideRailLayout = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), MIN_RAIL_THUMB_WIDTH = 124, MIN_STAGE_HEIGHT_AFTER_RAIL = 200, MAX_RAIL_HEIGHT_FRACTION = 0.4, RAIL_RESIZE_VIEWPORT_MINIMUM = {
      w: 640,
      h: 460,
      touchH: 640
    }, RAIL_THUMB_WIDTH_CSS_VARIABLE = "--sl-thumb-w";
    try {
      typeof CSS < "u" && "registerProperty" in CSS && CSS.registerProperty({
        name: RAIL_THUMB_WIDTH_CSS_VARIABLE,
        syntax: "<number>",
        inherits: !1,
        initialValue: String(MIN_RAIL_THUMB_WIDTH)
      });
    } catch {
    }
    SLIDE_THUMB_ASPECT_RATIO = runtime2.SLIDE_WIDTH / runtime2.SLIDE_HEIGHT, RAIL_THUMB_WIDTH_STORAGE_KEY = "mc-slides/strip-thumb-w", RAIL_THUMB_RESIZE_SETTLE_MS = 200;
  };
}
export {
  installEditorSlideRailLayout
};
