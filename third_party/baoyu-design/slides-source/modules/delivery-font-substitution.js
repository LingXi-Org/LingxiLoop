// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryFontSubstitution(runtime2) {
  var isHelveticaFallbackFont;
  function createFontSubstitutionTracker() {
    let entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map();
    return {
      swapped: (input, options) => {
        let value = input.toLowerCase();
        entries.has(value) || entries.set(value, input);
        let value2 = value + `
` + options;
        !entries2.has(value2) && !(isHelveticaFallbackFont(input) && options === "Arial") && entries2.set(value2, [entries.get(value), options]);
      },
      swaps: () => [...entries2.values()]
    };
  }
  function formatFontSubstitutionNotes(substitutions, destination) {
    return substitutions.map(([input, input2]) => (0, runtime2.exportNote)("font_swapped", {
      family: input,
      standIn: input2,
      reader : destination
    }));
  }
  function collectCustomPresentationFontFamilies(slides) {
    let families = /* @__PURE__ */ new Map(), visit = (source) => {
      for (let value2 of (0, runtime2.nodeChildren)(source) ?? [])
        visit(value2);
      if (source.kind !== "text" && source.kind !== "table")
        return;
      let value = source.style?.fontFamily;
      typeof value == "object" && !families.has(value.family.toLowerCase()) && families.set(value.family.toLowerCase(), value.family);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        visit(value2.node);
    return [...families.values()];
  }
  function presentationFontPortabilityWarning(slides, carriedFamilies = []) {
    let carried = new Set(carriedFamilies.map((input) => input.toLowerCase())), families = collectCustomPresentationFontFamilies(slides).filter((input) => (0, runtime2.resolveBasicFontFamily)(input) === void 0 && !isHelveticaFallbackFont(input) && !carried.has(input.toLowerCase()));
    return families.length === 0 ? void 0 : (0, runtime2.exportNote)("fonts_not_everywhere", {families
    });
  }
  return bindRuntimeValue(runtime2, "isHelveticaFallbackFont", () => isHelveticaFallbackFont, (value) => {
    isHelveticaFallbackFont = value;
  }), bindRuntimeValue(runtime2, "createFontSubstitutionTracker", () => createFontSubstitutionTracker), bindRuntimeValue(runtime2, "formatFontSubstitutionNotes", () => formatFontSubstitutionNotes), bindRuntimeValue(runtime2, "collectCustomPresentationFontFamilies", () => collectCustomPresentationFontFamilies), bindRuntimeValue(runtime2, "presentationFontPortabilityWarning", () => presentationFontPortabilityWarning), () => {
    (0,runtime2.initializeExportNotes) (),(0,runtime2.initializeExportNotes) (), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeHtmlCompiler)(), isHelveticaFallbackFont = (family) => (0, runtime2.resolveFontFamilyAlias)(family)?.fallback === "helvetica";
  };
}
export {
  installDeliveryFontSubstitution
};
