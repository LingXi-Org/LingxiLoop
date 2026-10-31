// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorPalette(runtime2) {
  function normalizePaletteColor(color) {
    if (typeof color != "string")
      return;
    let normalized = ((0, runtime2.resolveSlideColor)(color.trim()) ?? color.trim()).toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(normalized))
      return "#" + normalized[1] + normalized[1] + normalized[2] + normalized[2] + normalized[3] + normalized[3];
    if (/^#[0-9a-f]{4}$/.test(normalized))
      return normalizePaletteColor("#" + normalized[1] + normalized[1] + normalized[2] + normalized[2] + normalized[3] + normalized[3] + normalized[4] + normalized[4]);
    if (/^#[0-9a-f]{6}$/.test(normalized))
      return normalized;
    if (/^#[0-9a-f]{8}$/.test(normalized))
      return parseInt(normalized.slice(7, 9), 16) < 51 ? void 0 : normalized.endsWith("ff") ? normalized.slice(0, 7) : normalized;
  }
  function visitNodeColors(node, visitColor) {
    let currentNode = node;
    if (visitColor(currentNode.color), typeof currentNode.fill == "object" && currentNode.fill !== null)
      for (let value of currentNode.fill.gradient?.stops ?? [])
        visitColor(value.color);
    if (visitColor(currentNode.stroke), Array.isArray(currentNode.marks))
      for (let value of currentNode.marks)
        visitColor(value?.color);
    let style = currentNode.style;
    if (style) {
      visitColor(style.backgroundColor), visitColor(style.borderColor), visitColor(style.color), visitColor(style.textDecorationColor), visitColor(style.textStrokeColor);
      let backgroundGradient = style.backgroundGradient;
      for (let value of backgroundGradient?.stops ?? [])
        visitColor(value.color);
      for (let value of ["boxShadow", "textShadow"]) {
        let value2 = style[value];
        if (Array.isArray(value2))
          for (let value3 of value2)
            visitColor(value3.color);
      }
    }
    for (let value of (0, runtime2.nodeChildren)(node) ?? [])
      visitNodeColors(value, visitColor);
    for (let value of Object.values(currentNode.cellStyles ?? {}))
      visitColor(value?.color);
    for (let value of Object.values(currentNode.rowStyles ?? {}))
      visitColor(value?.background);
  }
  function collectPresentationPalette(slides, limit = 12) {
    let counts = /* @__PURE__ */ new Map(), countColor = (input) => {
      let value = normalizePaletteColor(input);
      value !== void 0 && counts.set(value, (counts.get(value) ?? 0) + 1);
    };
    for (let value of slides) {
      countColor(value.bg);
      for (let value2 of value.frames)
        visitNodeColors(value2.node, countColor);
    }
    return [...counts].sort((input, options) => options[1] - input[1]).slice(0, limit).map(([input]) => input);
  }
  return bindRuntimeValue(runtime2, "normalizePaletteColor", () => normalizePaletteColor), bindRuntimeValue(runtime2, "visitNodeColors", () => visitNodeColors), bindRuntimeValue(runtime2, "collectPresentationPalette", () => collectPresentationPalette), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeFontFetching)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeRenderingTheme)();
  };
}
export {
  installEditorPalette
};
