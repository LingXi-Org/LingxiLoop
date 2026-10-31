// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideGeneration(runtime2) {
  var SLIDE_GENERATION_SYMBOL, slideGeneration, isSlideGenerationStale;
  return bindRuntimeValue(runtime2, "SLIDE_GENERATION_SYMBOL", () => SLIDE_GENERATION_SYMBOL, (value) => {
    SLIDE_GENERATION_SYMBOL = value;
  }), bindRuntimeValue(runtime2, "slideGeneration", () => slideGeneration, (value) => {
    slideGeneration = value;
  }), bindRuntimeValue(runtime2, "isSlideGenerationStale", () => isSlideGenerationStale, (value) => {
    isSlideGenerationStale = value;
  }), () => {
    (0, runtime2.initializeFontCatalog)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeModelEditing)(), SLIDE_GENERATION_SYMBOL = Symbol.for("slides.gen"), slideGeneration = (slide) => slide?.[SLIDE_GENERATION_SYMBOL], isSlideGenerationStale = (generation, slide) => generation !== void 0 && slideGeneration(slide) !== void 0 && slideGeneration(slide) !== generation;
  };
}
export {
  installEditorSlideGeneration
};
