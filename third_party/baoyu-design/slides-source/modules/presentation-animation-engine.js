// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationAnimationEngine(runtime2) {
  var REDUCED_MOTION_MEDIA_QUERY, HOVER_CAPABILITY_MEDIA_QUERY, animationEnginesByRoot;
  function camelCaseToCssProperty(name) {
    return name.replace(/[A-Z]/g, (input) => "-" + input.toLowerCase());
  }
  function getElementInlineStyle(element) {
    let style = element.style;
    if (!(!style || typeof style.setProperty != "function"))
      return style;
  }
  function collectAnimatedElements(root) {
    let animated = [], stack = [root];
    for (; stack.length > 0; ) {
      let value = stack.pop();
      if (!value)
        break;
      value.hasAttribute(runtime2.dynamicStyleAttribute) && animated.push(value);
      for (let value2 = value.children.length - 1; value2 >= 0; value2--) {
        let value3 = value.children.item(value2);
        value3 && stack.push(value3);
      }
    }
    return animated;
  }
  function closestAnimatedElement(target, root) {
    let node = target ?? null, element = null;
    for (node && (element = node.nodeType === 1 ? node : node.parentElement); element; element = element.parentElement) {
      if (element.hasAttribute(runtime2.dynamicStyleAttribute))
        return element;
      if (element === root)
        break;
    }
  }
  function animationDescriptorKey(descriptor) {
    return JSON.stringify(descriptor);
  }
  function isRepeatingAnimation(descriptor) {
    return descriptor.options.iterations !== 1;
  }
  function cancelElementAnimation(animation) {
    if (animation)
      try {
        animation.cancel();
      } catch {
      }
  }
  function createSlideAnimationEngine(options) {
    let { root } = options, document2 = root.ownerDocument, window2 = document2.defaultView, animations = /* @__PURE__ */ new Map(), value, flag = !1;
    function value2(input) {
      if (!(!window2 || typeof window2.matchMedia != "function"))
        try {
          return window2.matchMedia(input);
        } catch {
          return;
        }
    }
    let value3 = value2(REDUCED_MOTION_MEDIA_QUERY), value4 = value2(HOVER_CAPABILITY_MEDIA_QUERY), value5 = value3?.matches ?? !1;
    function value6(input, options2) {
      if (value5 && isRepeatingAnimation(options2) || typeof input.animate != "function")
        return;
      let items = [];
      for (let value16 of options2.keyframes)
        items.push(Object.fromEntries(Object.entries(value16)));
      let options3 = options2.options, state = {
        duration: options3.duration,
        delay: options3.delay,
        iterations: options3.iterations,
        direction: options3.direction === "reverse" || options3.direction === "alternate" ? options3.direction : "normal",
        easing: options3.easing
      };
      try {
        return input.animate(items, state);
      } catch {
        return;
      }
    }
    function value7() {
      let values = /* @__PURE__ */ new Set();
      for (let value16 of collectAnimatedElements(root)) {
        let value17 = options.resolveBag(value16);
        if (!value17)
          continue;
        let value18;
        try {
          value18 = (0, runtime2.styleAnimationToKeyframes)(value17.bag, value17.kind);
        } catch {
          continue;
        }
        if (!value18)
          continue;
        values.add(value16);
        let value19 = animationDescriptorKey(value18), entry = animations.get(value16);
        entry && entry.key === value19 || (cancelElementAnimation(entry?.anim), animations.set(value16, {
          key: value19,
          spec: value18,
          anim: value6(value16, value18)
        }));
      }
      for (let [value16, value17] of animations)
        values.has(value16) || (cancelElementAnimation(value17.anim), animations.delete(value16));
    }
    function value8() {
      for (let [value16, value17] of animations) {
        let value18 = value5 && isRepeatingAnimation(value17.spec);
        value18 && value17.anim ? (cancelElementAnimation(value17.anim), value17.anim = void 0) : !value18 && !value17.anim && (value17.anim = value6(value16, value17.spec));
      }
    }
    let callback = () => {
      value5 = value3?.matches ?? !1, value8();
    };
    function value9(input, options2) {
      let value16;
      try {
        value16 = (0, runtime2.hoverStyleToCss)(input, options2);
      } catch {
        return [];
      }
      if (value16 === null || typeof value16 != "object")
        return [];
      let items = [];
      for (let [value17, value18] of Object.entries(value16))
        (typeof value18 == "string" || typeof value18 == "number") && items.push([camelCaseToCssProperty(value17), String(value18)]);
      return items;
    }
    function value10(input) {
      return input.map((input2) => input2[0] + ":" + input2[1]).join(";");
    }
    function value11(element, options2, context, value16) {
      let entries = /* @__PURE__ */ new Map(), state = {};
      for (let [value17, value18] of value16)
        state[value17] = options2.getPropertyValue(value17), options2.setProperty(value17, value18), entries.set(value17, options2.getPropertyValue(value17));
      animationEnginesByRoot.set(element, state), value = {
        el: element,
        style: options2,
        saved: context,
        applied: entries,
        appliedText: element.getAttribute("style"),
        cssKey: value10(value16)
      };
    }
    function value12(element, source) {
      let value16 = getElementInlineStyle(element);
      if (!value16)
        return;
      let value17 = value9(source.bag, source.kind);
      value17.length !== 0 && value11(element, value16, element.getAttribute("style"), value17);
    }
    function value13() {
      let value16 = value;
      value16 && (value = void 0, animationEnginesByRoot.delete(value16.el), value16.saved === null ? value16.el.removeAttribute("style") : value16.el.setAttribute("style", value16.saved));
    }
    function value14() {
      let value16 = value;
      if (!value16)
        return;
      if (!value16.el.isConnected || !root.contains(value16.el)) {
        animationEnginesByRoot.delete(value16.el), value = void 0;
        return;
      }
      let value17 = value16.el.hasAttribute(runtime2.dynamicStyleAttribute) ? options.resolveBag(value16.el) : void 0;
      if (!value17) {
        value13();
        return;
      }
      let value18 = value9(value17.bag, value17.kind), value19;
      if (value16.el.getAttribute("style") === value16.appliedText) {
        if (value10(value18) === value16.cssKey)
          return;
        value16.saved === null ? value16.el.removeAttribute("style") : value16.el.setAttribute("style", value16.saved), value19 = value16.saved;
      } else {
        for (let [value20, value21] of value16.applied)
          value16.style.getPropertyValue(value20) === value21 && value16.style.removeProperty(value20);
        value19 = value16.el.getAttribute("style");
      }
      if (value = void 0, value18.length === 0) {
        animationEnginesByRoot.delete(value16.el);
        return;
      }
      value11(value16.el, value16.style, value19, value18);
    }
    function value15(input) {
      let value16 = "pointerType" in input ? String(input.pointerType) : "";
      return value16 === "mouse" ? !0 : value16 === "" && (value4?.matches ?? !1);
    }
    let callback2 = (event) => {
      if (!value15(event))
        return;
      let value16 = closestAnimatedElement(event.target, root);
      if (value) {
        if (value16 && value16 === value.el)
          return;
        value13();
      }
      if (!value16)
        return;
      let value17 = options.resolveBag(value16);
      value17 && value12(value16, value17);
    }, callback3 = (input) => {
      let value16 = value;
      if (!value16)
        return;
      let value17 = "relatedTarget" in input ? input.relatedTarget : null;
      value17 && value16.el.contains(value17) || value13();
    }, callback4 = () => {
      value13();
    };
    root.addEventListener("pointerover", callback2), root.addEventListener("pointerout", callback3), root.addEventListener("pointercancel", callback4), document2.addEventListener("pointerleave", callback4), window2?.addEventListener("blur", callback4), value3 && typeof value3.addEventListener == "function" && value3.addEventListener("change", callback);
    let callback5 = () => {
      flag || (value7(), value14());
    }, callback6 = () => {
      if (!flag) {
        flag = !0;
        for (let value16 of animations.values())
          cancelElementAnimation(value16.anim);
        animations.clear(), value13(), root.removeEventListener("pointerover", callback2), root.removeEventListener("pointerout", callback3), root.removeEventListener("pointercancel", callback4), document2.removeEventListener("pointerleave", callback4), window2?.removeEventListener("blur", callback4), value3 && typeof value3.removeEventListener == "function" && value3.removeEventListener("change", callback);
      }
    };
    return callback5(), {
      refresh: callback5,
      dispose: callback6
    };
  }
  return bindRuntimeValue(runtime2, "REDUCED_MOTION_MEDIA_QUERY", () => REDUCED_MOTION_MEDIA_QUERY, (value) => {
    REDUCED_MOTION_MEDIA_QUERY = value;
  }), bindRuntimeValue(runtime2, "HOVER_CAPABILITY_MEDIA_QUERY", () => HOVER_CAPABILITY_MEDIA_QUERY, (value) => {
    HOVER_CAPABILITY_MEDIA_QUERY = value;
  }), bindRuntimeValue(runtime2, "camelCaseToCssProperty", () => camelCaseToCssProperty), bindRuntimeValue(runtime2, "getElementInlineStyle", () => getElementInlineStyle), bindRuntimeValue(runtime2, "collectAnimatedElements", () => collectAnimatedElements), bindRuntimeValue(runtime2, "closestAnimatedElement", () => closestAnimatedElement), bindRuntimeValue(runtime2, "animationDescriptorKey", () => animationDescriptorKey), bindRuntimeValue(runtime2, "isRepeatingAnimation", () => isRepeatingAnimation), bindRuntimeValue(runtime2, "cancelElementAnimation", () => cancelElementAnimation), bindRuntimeValue(runtime2, "animationEnginesByRoot", () => animationEnginesByRoot, (value) => {
    animationEnginesByRoot = value;
  }), bindRuntimeValue(runtime2, "createSlideAnimationEngine", () => createSlideAnimationEngine), () => {
    (0, runtime2.initializeStyleSchema)(), REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)", HOVER_CAPABILITY_MEDIA_QUERY = "(hover: hover)", animationEnginesByRoot = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installPresentationAnimationEngine
};
