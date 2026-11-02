// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorFocusRegions(runtime2) {
  var ReactFocusRegions, FOCUS_REGION_FOCUSABLE_SELECTOR;
  function notificationsFocusRegion() {
    return {
      el: () => {
        let element = document.querySelector('[role="region"][aria-label="Notifications"]');
        return element !== null && element.childElementCount > 0 ? element : null;
      },
      ownsKey: !0
    };
  }
  function isFocusableInRegion(element, isRendered) {
    return element.isConnected && element.matches(FOCUS_REGION_FOCUSABLE_SELECTOR) && element.closest('[inert], [hidden], [aria-hidden="true"]') == null && isRendered(element);
  }
  function createRegionKeyboardNavigator(regions, { blocked = () => (0, runtime2.hasOpenOverlay)(), rendered = (input) => input.getClientRects().length > 0 } = {}) {
    let cache2 = /* @__PURE__ */ new WeakMap(), callback = () => regions().flatMap((input) => {
      let value = input.el();
      return value && value.isConnected ? [
        {
          region: input,
          el: value
        }
      ] : [];
    }), callback2 = (input, options) => {
      if (!(options instanceof HTMLElement))
        return -1;
      let value = -1;
      return input.forEach((input2, options2) => {
        input2.el.contains(options) && (value === -1 || input[value].el.contains(input2.el)) && (value = options2);
      }), value;
    }, callback3 = (input) => callback2(input, document.activeElement), callback4 = (input, options) => {
      if (options.region.enter?.() === !0)
        return !0;
      let value = input.filter((input2) => input2 !== options && options.el.contains(input2.el)), entry = cache2.get(options.el), items = [
        entry && options.el.contains(entry) ? entry : null,
        options.region.fallback?.() ?? null,
        ...Array.from(options.el.querySelectorAll(FOCUS_REGION_FOCUSABLE_SELECTOR))
      ];
      for (let value2 of items)
        if (!(!value2 || value2 === options.el || value.some((input2) => input2.el.contains(value2)) || !isFocusableInRegion(value2, rendered)) && (value2.focus(), document.activeElement === value2))
          return !0;
      return !1;
    }, callback5 = (input, options) => {
      if (blocked())
        return !1;
      let value = callback(), length = value.length;
      if (length === 0)
        return !1;
      let value2 = callback3(value), value3 = value2 !== -1 ? value2 : value.findIndex((input2) => input2.region.home);
      for (let count = 1; count <= length; count++) {
        let value4 = ((value3 + input * count) % length + length) % length;
        if (value4 === value2)
          continue;
        let value5 = value[value4];
        if (value5.region.ownsKey === !0) {
          if (!options)
            continue;
          return "owner";
        }
        if (callback4(value, value5))
          return "moved";
      }
      return !1;
    }, callback6 = (input) => callback5(input, !1) === "moved", callback7 = (event) => {
      let value = callback(), value2 = event.target instanceof Element ? event.target : null, value3 = callback2(value, value2);
      value3 !== -1 && value2 !== value[value3].el && cache2.set(value[value3].el, value2);
    }, callback8 = (event) => {
      if (event.key !== "F6" || event.defaultPrevented || event.isComposing || event.altKey || blocked())
        return;
      let value = event.repeat ? !1 : callback5(event.shiftKey ? -1 : 1, !0);
      event.preventDefault(), value !== "owner" && callback().some((input) => input.region.ownsKey) && event.stopPropagation();
    };
    return document.addEventListener("focusin", callback7), window.addEventListener("keydown", callback8, !0), {
      move: callback6,
      dispose() {
        document.removeEventListener("focusin", callback7), window.removeEventListener("keydown", callback8, !0);
      }
    };
  }
  function useRegionKeyboardNavigation(regions, blocked) {
    let ref = ReactFocusRegions.useRef(regions);
    ref.current = regions;
    let ref2 = ReactFocusRegions.useRef(blocked);
    ref2.current = blocked, ReactFocusRegions.useEffect(() => createRegionKeyboardNavigator(() => ref.current, {
      blocked: () => (0, runtime2.hasOpenOverlay)() || (ref2.current?.() ?? !1)
    }).dispose, []);
  }
  return bindRuntimeValue(runtime2, "ReactFocusRegions", () => ReactFocusRegions, (value) => {
    ReactFocusRegions = value;
  }), bindRuntimeValue(runtime2, "FOCUS_REGION_FOCUSABLE_SELECTOR", () => FOCUS_REGION_FOCUSABLE_SELECTOR, (value) => {
    FOCUS_REGION_FOCUSABLE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "notificationsFocusRegion", () => notificationsFocusRegion), bindRuntimeValue(runtime2, "isFocusableInRegion", () => isFocusableInRegion), bindRuntimeValue(runtime2, "createRegionKeyboardNavigator", () => createRegionKeyboardNavigator), bindRuntimeValue(runtime2, "useRegionKeyboardNavigation", () => useRegionKeyboardNavigation), () => {
    ReactFocusRegions = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), FOCUS_REGION_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]):not(iframe)';
  };
}
export {
  installEditorFocusRegions
};
