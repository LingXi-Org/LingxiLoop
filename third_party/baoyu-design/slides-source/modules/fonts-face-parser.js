// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsFaceParser(runtime2) {
  var normalizeFontFaceFamily, fullUnicodeRange, fontFaceRulePattern, fontFacePropertyPattern, fontFamilyPropertyPattern, fontStylePropertyPattern, fontWeightPropertyPattern, unicodeRangePropertyPattern, initializeFontFaceParser;
  function parseFontUnicodeRanges(unicodeRange) {
    if (unicodeRange === void 0 || unicodeRange.trim() === "")
      return [fullUnicodeRange];
    let items = [];
    for (let value of unicodeRange.split(",")) {
      let value2 = /^u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(value.trim());
      if (value2 === null)
        return [fullUnicodeRange];
      value2[2] !== void 0 ? items.push([parseInt(value2[1], 16), parseInt(value2[2], 16)]) : value2[1].includes("?") ? items.push([
        parseInt(value2[1].replaceAll("?", "0"), 16),
        parseInt(value2[1].replaceAll("?", "f"), 16)
      ]) : items.push([parseInt(value2[1], 16), parseInt(value2[1], 16)]);
    }
    if (items.some(([input, input2]) => Number.isNaN(input) || Number.isNaN(input2) || input > input2))
      return [fullUnicodeRange];
    items.sort((input, options) => input[0] - options[0]);
    let items2 = [];
    for (let value of items) {
      let value2 = items2[items2.length - 1];
      value2 !== void 0 && value[0] <= value2[1] + 1 ? value2[1] = Math.max(value2[1], value[1]) : items2.push([value[0], value[1]]);
    }
    return items2;
  }
  function parseFontWeightRange(weight) {
    let value = (weight ?? "").trim().toLowerCase().split(/\s+/), callback = (input) => input === "bold" ? 700 : input === void 0 || input === "" || input === "normal" ? 400 : Number(input), value2 = callback(value[0]), value3 = value.length > 1 ? callback(value[1]) : value2;
    return Number.isFinite(value2) && Number.isFinite(value3) ? [Math.min(value2, value3), Math.max(value2, value3)] : [1, 1e3];
  }
  function parseFontFaceDeclarations(css) {
    return (css.match(fontFaceRulePattern) ?? []).filter((input) => !/[{<]/.test(input.slice(input.indexOf("{") + 1)) && !/[^\x00-\x7f]/.test(input)).map((input) => ({
      text: input,
      family: normalizeFontFaceFamily(fontFamilyPropertyPattern.exec(input)?.[1] ?? ""),
      style: (fontStylePropertyPattern.exec(input)?.[1] ?? "normal").trim().toLowerCase(),
      weight: parseFontWeightRange(fontWeightPropertyPattern.exec(input)?.[1]),
      ranges: parseFontUnicodeRanges(unicodeRangePropertyPattern.exec(input)?.[1]),
      files: [...input.matchAll(runtime2.googleFontFileUrlRegex)].map((input2) => input2[2])
    }));
  }
  return bindRuntimeValue(runtime2, "parseFontUnicodeRanges", () => parseFontUnicodeRanges), bindRuntimeValue(runtime2, "parseFontWeightRange", () => parseFontWeightRange), bindRuntimeValue(runtime2, "parseFontFaceDeclarations", () => parseFontFaceDeclarations), bindRuntimeValue(runtime2, "normalizeFontFaceFamily", () => normalizeFontFaceFamily, (value) => {
    normalizeFontFaceFamily = value;
  }), bindRuntimeValue(runtime2, "fullUnicodeRange", () => fullUnicodeRange, (value) => {
    fullUnicodeRange = value;
  }), bindRuntimeValue(runtime2, "fontFaceRulePattern", () => fontFaceRulePattern, (value) => {
    fontFaceRulePattern = value;
  }), bindRuntimeValue(runtime2, "fontFacePropertyPattern", () => fontFacePropertyPattern, (value) => {
    fontFacePropertyPattern = value;
  }), bindRuntimeValue(runtime2, "fontFamilyPropertyPattern", () => fontFamilyPropertyPattern, (value) => {
    fontFamilyPropertyPattern = value;
  }), bindRuntimeValue(runtime2, "fontStylePropertyPattern", () => fontStylePropertyPattern, (value) => {
    fontStylePropertyPattern = value;
  }), bindRuntimeValue(runtime2, "fontWeightPropertyPattern", () => fontWeightPropertyPattern, (value) => {
    fontWeightPropertyPattern = value;
  }), bindRuntimeValue(runtime2, "unicodeRangePropertyPattern", () => unicodeRangePropertyPattern, (value) => {
    unicodeRangePropertyPattern = value;
  }), bindRuntimeValue(runtime2, "initializeFontFaceParser", () => initializeFontFaceParser, (value) => {
    initializeFontFaceParser = value;
  }), () => {
    normalizeFontFaceFamily = (input) => input.trim().replace(/^["']|["']$/g, "").trim().toLowerCase(), fontFacePropertyPattern = (input) => new RegExp("(?:^|[{;\\s])" + input + "\\s*:\\s*([^;}]+)", "i"), initializeFontFaceParser = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFontFetching)(), fullUnicodeRange = [0, 1114111], fontFaceRulePattern = /@font-face\s*\{[^}]*\}/g, fontFamilyPropertyPattern = fontFacePropertyPattern("font-family"), fontStylePropertyPattern = fontFacePropertyPattern("font-style"), fontWeightPropertyPattern = fontFacePropertyPattern("font-weight"), unicodeRangePropertyPattern = fontFacePropertyPattern("unicode-range");
    });
  };
}
export {
  installFontsFaceParser
};
