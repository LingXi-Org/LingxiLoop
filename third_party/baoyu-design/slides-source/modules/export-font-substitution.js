// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportFontSubstitution(runtime2) {
  var fontSubstitutionExports, defaultRoleFontFallback, normalizeFontFamily, initializeFontSubstitution;
  function collectWebSafeFontFallbacks(slides) {
    let entries = /* @__PURE__ */ new Map(), callback = (input) => {
      let value = input.style?.fontFamily;
      typeof value == "object" && value.webSafe !== void 0 && !entries.has(value.family.toLowerCase()) && entries.set(value.family.toLowerCase(), value.webSafe);
      for (let value2 of (0, runtime2.nodeChildren)(input) ?? [])
        callback(value2);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        callback(value2.node);
    return entries;
  }
  function mapNodeFontFaces(node, carriedFamilies, swap, faceless, swapped) {
    switch (node.kind) {
      case "text":
      case "table": {
        let value = node.style?.fontFamily ?? faceless(node.role ?? "body"), value2 = typeof value == "object" && value.webSafe === void 0 ? carriedFamilies.get(value.family.toLowerCase()) : void 0, value3 = typeof value == "object" && value2 !== void 0 ? {
          ...value,
          webSafe: value2
        } : value, value4 = swap(value, value3);
        return typeof value == "object" && typeof value4 == "object" && normalizeFontFamily(value4.family) !== normalizeFontFamily(value.family) && swapped?.(value.family, value4.family), {
          ...node,
          style: {
            ...node.style,
            fontFamily: value4
          }
        };
      }
      case "stack":
      case "grid":
        return {
          ...node,
          children: node.children.map((input) => mapNodeFontFaces(input, carriedFamilies, swap, faceless, swapped))
        };
      case "overlay":
        return {
          ...node,
          base: mapNodeFontFaces(node.base, carriedFamilies, swap, faceless, swapped),
          layers: node.layers.map((input) => ({
            ...input,
            node: mapNodeFontFaces(input.node, carriedFamilies, swap, faceless, swapped)
          }))
        };
      default:
        return node;
    }
  }
  function swapFaces(slides, swap, { faceless: options = defaultRoleFontFallback, swapped } = {}) {
    let value = collectWebSafeFontFallbacks(slides);
    return slides.map((input) => ({
      ...input,
      frames: input.frames.map((input2) => ({
        ...input2,
        node: mapNodeFontFaces(input2.node, value, swap, options, swapped)
      }))
    }));
  }
  function toBasicFonts(slides, swapped) {
    return swapFaces(slides, (input, options) => (0, runtime2.webSafeFontFallback)(options), {
      swapped
    });
  }
  return bindRuntimeValue(runtime2, "fontSubstitutionExports", () => fontSubstitutionExports, (value) => {
    fontSubstitutionExports = value;
  }), bindRuntimeValue(runtime2, "collectWebSafeFontFallbacks", () => collectWebSafeFontFallbacks), bindRuntimeValue(runtime2, "mapNodeFontFaces", () => mapNodeFontFaces), bindRuntimeValue(runtime2, "swapFaces", () => swapFaces), bindRuntimeValue(runtime2, "toBasicFonts", () => toBasicFonts), bindRuntimeValue(runtime2, "defaultRoleFontFallback", () => defaultRoleFontFallback, (value) => {
    defaultRoleFontFallback = value;
  }), bindRuntimeValue(runtime2, "normalizeFontFamily", () => normalizeFontFamily, (value) => {
    normalizeFontFamily = value;
  }), bindRuntimeValue(runtime2, "initializeFontSubstitution", () => initializeFontSubstitution, (value) => {
    initializeFontSubstitution = value;
  }), () => {
    fontSubstitutionExports = {}, (0, runtime2.defineLiveExports)(fontSubstitutionExports, {
      toBasicFonts: () => toBasicFonts,
      swapFaces: () => swapFaces
    }), defaultRoleFontFallback = (role) => (0, runtime2.renderingTypeScaleForRole)(role).serifDisplay ? "serif" : "sans", normalizeFontFamily = (family) => ((0, runtime2.resolveFontFamilyAlias)(family)?.family ?? family).toLowerCase(), initializeFontSubstitution = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeRenderingTheme)();
    });
  };
}
export {
  installExportFontSubstitution
};
