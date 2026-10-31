// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationBuildEffects(runtime2) {
  var buildEffectDurationMs, buildExitEasing, buildEnterEasing, slideTransitionDurations, slideTransitionEasing, initializeBuildEffects;
  function slideBuildOrders(slide) {
    let orders = /* @__PURE__ */ new Set();
    for (let value of slide.frames)
      value.build?.in !== void 0 && orders.add(value.build.in.order), value.build?.out !== void 0 && orders.add(value.build.out.order);
    return [...orders].sort((input, options) => input - options);
  }
  function slideBuildCount(slide) {
    return slideBuildOrders(slide).length;
  }
  function hiddenBuildFrameIds(slide, buildStep) {
    let orders = slideBuildOrders(slide), hidden = /* @__PURE__ */ new Set();
    for (let value of slide.frames) {
      let build = value.build;
      if (build === void 0)
        continue;
      let value2 = build.in !== void 0 ? orders.indexOf(build.in.order) + 1 : 0, value3 = build.out !== void 0 ? orders.indexOf(build.out.order) + 1 : 1 / 0;
      (buildStep < value2 || buildStep >= value3) && hidden.add(value.id);
    }
    return hidden;
  }
  function slideBuildStepEffects(slide, buildStep) {
    let order = slideBuildOrders(slide)[buildStep - 1];
    if (order === void 0)
      return [];
    let effects = [];
    for (let value of slide.frames) {
      let build = value.build;
      build?.in !== void 0 && build.in.order === order && effects.push({
        frame: value,
        dir: "in",
        effect: build.in.effect,
        auto: build.in.auto === !0
      }), build?.out !== void 0 && build.out.order === order && effects.push({
        frame: value,
        dir: "out",
        effect: build.out.effect,
        auto: build.out.auto === !0
      });
    }
    return effects;
  }
  function slideBuildStepIsAutomatic(slide, buildStep) {
    let effects = slideBuildStepEffects(slide, buildStep);
    return effects.length > 0 && effects.every((input) => input.auto);
  }
  function buildEffectTransition(effect) {
    switch (effect) {
      case "fade":
        return {
          transform: "",
          easing: buildEnterEasing
        };
      case "rise":
        return {
          transform: "translateY(48px)",
          easing: buildEnterEasing
        };
      case "drop":
        return {
          transform: "translateY(-48px)",
          easing: buildEnterEasing
        };
      case "left":
        return {
          transform: "translateX(-72px)",
          easing: buildEnterEasing
        };
      case "right":
        return {
          transform: "translateX(72px)",
          easing: buildEnterEasing
        };
      case "scale":
        return {
          transform: "scale(0.8)",
          easing: buildEnterEasing
        };
      case "pop":
        return {
          transform: "scale(0.5)",
          easing: "cubic-bezier(0.34, 1.56, 0.64, 1)"
        };
    }
  }
  return bindRuntimeValue(runtime2, "slideBuildOrders", () => slideBuildOrders), bindRuntimeValue(runtime2, "slideBuildCount", () => slideBuildCount), bindRuntimeValue(runtime2, "hiddenBuildFrameIds", () => hiddenBuildFrameIds), bindRuntimeValue(runtime2, "slideBuildStepEffects", () => slideBuildStepEffects), bindRuntimeValue(runtime2, "slideBuildStepIsAutomatic", () => slideBuildStepIsAutomatic), bindRuntimeValue(runtime2, "buildEffectTransition", () => buildEffectTransition), bindRuntimeValue(runtime2, "buildEffectDurationMs", () => buildEffectDurationMs, (value) => {
    buildEffectDurationMs = value;
  }), bindRuntimeValue(runtime2, "buildExitEasing", () => buildExitEasing, (value) => {
    buildExitEasing = value;
  }), bindRuntimeValue(runtime2, "buildEnterEasing", () => buildEnterEasing, (value) => {
    buildEnterEasing = value;
  }), bindRuntimeValue(runtime2, "slideTransitionDurations", () => slideTransitionDurations, (value) => {
    slideTransitionDurations = value;
  }), bindRuntimeValue(runtime2, "slideTransitionEasing", () => slideTransitionEasing, (value) => {
    slideTransitionEasing = value;
  }), bindRuntimeValue(runtime2, "initializeBuildEffects", () => initializeBuildEffects, (value) => {
    initializeBuildEffects = value;
  }), () => {
    buildEffectDurationMs = 380, buildExitEasing = "cubic-bezier(0.45, 0, 0.85, 0.6)", buildEnterEasing = "cubic-bezier(0.2, 0.7, 0.2, 1)", slideTransitionEasing = "cubic-bezier(0.33, 0.01, 0.2, 1)", initializeBuildEffects = (0, runtime2.initializeOnce)(() => {
      slideTransitionDurations = {
        fade: 320,
        push: 420,
        magic: 480
      };
    });
  };
}
export {
  installPresentationBuildEffects
};
