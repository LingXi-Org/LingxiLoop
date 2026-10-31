// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportBackground(runtime2) {
  function slideBackgroundPaintFrames(slide, matchesFrame) {
    let frames = [];
    for (let value of slide.frames) {
      if (!(value.node.kind === "stack" && value.node.children.length === 0 && Object.keys(value.node.style ?? {}).every((input) => runtime2.backgroundCaptureStyleKeys.has(input))) || !matchesFrame(value))
        break;
      frames.push(value);
    }
    return frames;
  }
  function backgroundNeedsGradientRaster(frames) {
    return frames.some((input) => {
      let value = input.node.style?.backgroundGradient;
      return value !== void 0 && (value.radial === !0 || value.repeat !== void 0);
    });
  }
  function stableJsonStringify(value) {
    return Array.isArray(value) ? "[" + value.map(stableJsonStringify).join(",") + "]" : value === null || typeof value != "object" ? JSON.stringify(value) ?? "null" : "{" + Object.entries(value).sort(([input], [options]) => input < options ? -1 : input > options ? 1 : 0).map(([input, input2]) => JSON.stringify(input) + ":" + stableJsonStringify(input2)).join(",") + "}";
  }
  function imagePixelsAreWhite(rgba) {
    for (let index4 = 0; index4 < rgba.length; index4 += 4)
      if (rgba[index4] !== 255 || rgba[index4 + 1] !== 255 || rgba[index4 + 2] !== 255)
        return !1;
    return !0;
  }
  return bindRuntimeValue(runtime2, "slideBackgroundPaintFrames", () => slideBackgroundPaintFrames), bindRuntimeValue(runtime2, "backgroundNeedsGradientRaster", () => backgroundNeedsGradientRaster), bindRuntimeValue(runtime2, "stableJsonStringify", () => stableJsonStringify), bindRuntimeValue(runtime2, "imagePixelsAreWhite", () => imagePixelsAreWhite), () => {
  };
}
export {
  installExportBackground
};
