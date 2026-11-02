// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiDialog2(runtime2) {
  var noopFlipCleanup, FLIP_HELD_MARKER, FLIP_PAUSE_DURATION_MS, pausedFlipAnimations, initializeUiDialog22;
  function animateSegmentedControlThumb(input, options, context, { correction: value = !1 } = {}) {
    if (context === null || context.width <= 0) {
      let value9 = getElementAnimations(input);
      return () => {
        cancelAnimations(value9), input.style.visibility = "", input.style.willChange = "", delete input.dataset.flipAt;
      };
    }
    let value2 = `${context.left},${context.width}`, flipAt = input.dataset.flipAt;
    if (flipAt === value2)
      return noopFlipCleanup;
    let bounds = input.getBoundingClientRect(), left = options.getBoundingClientRect().left, value3 = getComputedStyle(input), value4 = readCssDuration(value3, "--cds-dur-base"), value5 = value3.getPropertyValue("--cds-ease-snap").trim() || "linear", value6 = usesAlphaBackground(value3), value7 = value && !hasRunningAnimations(input), value8 = getElementAnimations(input);
    return () => {
      if (cancelAnimations(value8), input.dataset.flipAt = value2, input.style.width = `${context.width}px`, input.style.transform = `translateX(${context.left}px)`, input.style.visibility = "inherit", value6 || (input.style.willChange = ""), !(flipAt === void 0 || !supportsElementAnimations(input) || (0, runtime2.isReducedMotion)()) && !value7)
        try {
          input.animate({
            transform: [
              `translateX(${bounds.left - left}px) scaleX(${bounds.width / context.width})`,
              `translateX(${context.left}px) scaleX(1)`
            ]
          }, {
            duration: value4,
            easing: value5
          }), value4 > 0 && setTransformWillChange(input, value6);
        } catch {
        }
    };
  }
  function readCssDuration(input, options) {
    let value = input.getPropertyValue(options).trim(), value2 = value.endsWith("ms") ? 1 : value.endsWith("s") ? 1e3 : 0;
    return Math.max(0, parseFloat(value) * value2) || 0;
  }
  function supportsElementAnimations(input) {
    return typeof input.animate == "function" && typeof input.getAnimations == "function";
  }
  function usesAlphaBackground(input) {
    return /^rgba\(|\//.test(input.backgroundColor);
  }
  function setTransformWillChange(input, options) {
    input.style.willChange = options ? "transform" : "";
  }
  function hasRunningAnimations(input) {
    return supportsElementAnimations(input) && input.getAnimations().some((input2) => input2.playState === "running");
  }
  function getElementAnimations(input) {
    return supportsElementAnimations(input) ? input.getAnimations() : [];
  }
  function cancelAnimations(input) {
    for (let value of input)
      value.cancel();
  }
  function hasFlipAnimationMarker(input) {
    return input.dataset.flipAt !== void 0;
  }
  function pauseFlipAnimationAtProgress(input, options, context) {
    if (!Number.isFinite(options) || !hasFlipAnimationMarker(input) || !supportsElementAnimations(input))
      return;
    let entry = pausedFlipAnimations.get(input);
    if (entry?.playState !== "paused") {
      let value = context();
      if (value.length < 2 || value.some((input2) => input2.width <= 0))
        return;
      let value2 = parseFloat(input.style.width), value3 = usesAlphaBackground(getComputedStyle(input));
      entry = input.animate(value.map((input2) => ({
        transform: `translateX(${input2.left}px) scaleX(${input2.width / value2})`
      })), {
        duration: (value.length - 1) * FLIP_PAUSE_DURATION_MS,
        fill: "both"
      }), entry.pause(), setTransformWillChange(input, value3), pausedFlipAnimations.set(input, entry), input.dataset.flipAt = FLIP_HELD_MARKER;
    }
    entry.currentTime = options * FLIP_PAUSE_DURATION_MS;
  }
  function isImmediateFlipMarker(input) {
    return input.dataset.flipAt === FLIP_HELD_MARKER;
  }
  return bindRuntimeValue(runtime2, "animateSegmentedControlThumb", () => animateSegmentedControlThumb), bindRuntimeValue(runtime2, "readCssDuration", () => readCssDuration), bindRuntimeValue(runtime2, "supportsElementAnimations", () => supportsElementAnimations), bindRuntimeValue(runtime2, "usesAlphaBackground", () => usesAlphaBackground), bindRuntimeValue(runtime2, "setTransformWillChange", () => setTransformWillChange), bindRuntimeValue(runtime2, "hasRunningAnimations", () => hasRunningAnimations), bindRuntimeValue(runtime2, "getElementAnimations", () => getElementAnimations), bindRuntimeValue(runtime2, "cancelAnimations", () => cancelAnimations), bindRuntimeValue(runtime2, "hasFlipAnimationMarker", () => hasFlipAnimationMarker), bindRuntimeValue(runtime2, "pauseFlipAnimationAtProgress", () => pauseFlipAnimationAtProgress), bindRuntimeValue(runtime2, "isImmediateFlipMarker", () => isImmediateFlipMarker), bindRuntimeValue(runtime2, "noopFlipCleanup", () => noopFlipCleanup, (value) => {
    noopFlipCleanup = value;
  }), bindRuntimeValue(runtime2, "FLIP_HELD_MARKER", () => FLIP_HELD_MARKER, (value) => {
    FLIP_HELD_MARKER = value;
  }), bindRuntimeValue(runtime2, "FLIP_PAUSE_DURATION_MS", () => FLIP_PAUSE_DURATION_MS, (value) => {
    FLIP_PAUSE_DURATION_MS = value;
  }), bindRuntimeValue(runtime2, "pausedFlipAnimations", () => pausedFlipAnimations, (value) => {
    pausedFlipAnimations = value;
  }), bindRuntimeValue(runtime2, "initializeUiDialog22", () => initializeUiDialog22, (value) => {
    initializeUiDialog22 = value;
  }), () => {
    noopFlipCleanup = () => {
    }, FLIP_HELD_MARKER = "held", FLIP_PAUSE_DURATION_MS = 1e3, initializeUiDialog22 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeReducedMotion)(), pausedFlipAnimations = /* @__PURE__ */ new WeakMap();
    });
  };
}
export {
  installUiDialog2
};
