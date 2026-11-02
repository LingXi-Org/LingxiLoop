// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryFontSubstitution(runtime2) {
  var isHelveticaFallbackFont, MAX_FORMATTED_FONT_NAMES, formatFontNameList;
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
    return substitutions.map(([input, input2]) => destination === "google" ? "Google Slides does not have the font " + input + ", so it shows " + input2 + " instead" : input + " is not on every computer, so this file uses " + input2 + " instead");
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
    if (families.length === 0)
      return;
    let single = families.length === 1;
    return "not every computer has the font" + (single ? " " : "s ") + formatFontNameList(families) + ", so this file can look different on a computer without " + (single ? "it" : "them") + "; the basic-fonts PowerPoint and the PDF look the same everywhere";
  }
  return bindRuntimeValue(runtime2, "isHelveticaFallbackFont", () => isHelveticaFallbackFont, (value) => {
    isHelveticaFallbackFont = value;
  }), bindRuntimeValue(runtime2, "createFontSubstitutionTracker", () => createFontSubstitutionTracker), bindRuntimeValue(runtime2, "formatFontSubstitutionNotes", () => formatFontSubstitutionNotes), bindRuntimeValue(runtime2, "MAX_FORMATTED_FONT_NAMES", () => MAX_FORMATTED_FONT_NAMES, (value) => {
    MAX_FORMATTED_FONT_NAMES = value;
  }), bindRuntimeValue(runtime2, "formatFontNameList", () => formatFontNameList, (value) => {
    formatFontNameList = value;
  }), bindRuntimeValue(runtime2, "collectCustomPresentationFontFamilies", () => collectCustomPresentationFontFamilies), bindRuntimeValue(runtime2, "presentationFontPortabilityWarning", () => presentationFontPortabilityWarning), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeHtmlCompiler)(), isHelveticaFallbackFont = (family) => (0, runtime2.resolveFontFamilyAlias)(family)?.fallback === "helvetica", MAX_FORMATTED_FONT_NAMES = 4, formatFontNameList = (families) => {
      let listed = families.length > MAX_FORMATTED_FONT_NAMES ? [
        ...families.slice(0, MAX_FORMATTED_FONT_NAMES - 1),
        String(families.length - MAX_FORMATTED_FONT_NAMES + 1) + " others"
      ] : families;
      return listed.length === 1 ? String(listed[0]) : listed.slice(0, -1).join(", ") + " and " + String(listed[listed.length - 1]);
    };
  };
}
export {
  installDeliveryFontSubstitution
};
