// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiContrast(runtime2) {
  var CONTRAST_HEX_PATTERN, CONTRAST_RGB_PATTERN, clampColorChannel_di, CONTRAST_RATIO_EPSILON, CONTRAST_MINIMUMS, formatContrastRatio, srgbToLinearChannel, linearToSrgbChannel, oklchHueRadians, rgbIsInGamut, initializeUiContrast;
  function parseContrastColor(text) {
    let value = text.trim(), value2 = CONTRAST_HEX_PATTERN.exec(value)?.[1];
    if (value2 !== void 0) {
      let value8 = value2.length <= 4 ? value2.replace(/[0-9a-f]/gi, (input) => input + input) : value2, callback2 = (input) => parseInt(value8.slice(input * 2, input * 2 + 2), 16) / 255;
      return {
        r: callback2(0),
        g: callback2(1),
        b: callback2(2),
        a: value8.length === 8 ? callback2(3) : 1
      };
    }
    let value3 = CONTRAST_RGB_PATTERN.exec(value);
    if (value3 === null)
      return;
    let callback = (input, options) => clampColorChannel_di(Number(input) / (options === "%" ? 100 : 255)), value4 = callback(value3[1], value3[2]), value5 = callback(value3[3], value3[4]), value6 = callback(value3[5], value3[6]), value7 = value3[7] === void 0 ? 1 : clampColorChannel_di(Number(value3[7]) / (value3[8] === "%" ? 100 : 1));
    if ([value4, value5, value6, value7].every(Number.isFinite))
      return {
        r: value4,
        g: value5,
        b: value6,
        a: value7
      };
  }
  function relativeLuminance(color) {
    let callback = (input) => input <= 0.03928 ? input / 12.92 : ((input + 0.055) / 1.055) ** 2.4;
    return 0.2126 * callback(color.r) + 0.7152 * callback(color.g) + 0.0722 * callback(color.b);
  }
  function compositeContrastColor(foreground, background) {
    let callback = (input, options) => foreground.a * input + (1 - foreground.a) * options;
    return {
      r: callback(foreground.r, background.r),
      g: callback(foreground.g, background.g),
      b: callback(foreground.b, background.b),
      a: 1
    };
  }
  function contrastRatio(foreground, background) {
    let value = relativeLuminance(compositeContrastColor(foreground, background)), value2 = relativeLuminance(background);
    return value > value2 ? (value + 0.05) / (value2 + 0.05) : (value2 + 0.05) / (value + 0.05);
  }
  function strongerContrastColor(color, first, second) {
    let value = typeof color == "string" ? parseContrastColor(color) : color, value2 = parseContrastColor(first), value3 = parseContrastColor(second);
    if (value === void 0 || value2 === void 0 || value3 === void 0)
      return second;
    let state = {
      ...value,
      a: 1
    };
    return contrastRatio(value2, state) > contrastRatio(value3, state) ? first : second;
  }
  function colorContrastResults(color, contrast) {
    let value = typeof color == "string" ? parseContrastColor(color) : color;
    if (value === void 0)
      return;
    let value2 = CONTRAST_MINIMUMS[contrast.role ?? "text"], value3 = Array.isArray(contrast.against) ? contrast.against : [contrast.against], items = [];
    for (let value4 of value3) {
      let value5 = parseContrastColor(value4.css);
      if (value5 === void 0)
        continue;
      let value6 = contrastRatio(value, {
        ...value5,
        a: 1
      });
      items.push({
        ground: value4,
        ratio: value6,
        min: value2,
        passes: value6 + CONTRAST_RATIO_EPSILON >= value2
      });
    }
    if (items.length > 0)
      return items;
  }
  function worstContrastResult(results) {
    let value = results[0];
    for (let value2 of results)
      value2.ratio < value.ratio && (value = value2);
    return value;
  }
  function contrastRatioReadout(ratio) {
    return formatContrastRatio(ratio) + ":1";
  }
  function contrastRatioSpoken(ratio) {
    return formatContrastRatio(ratio) + " to 1";
  }
  function contrastColorHex(color) {
    let callback = (input) => Math.round(clampColorChannel_di(input) * 255).toString(16).padStart(2, "0").toUpperCase();
    return "#" + callback(color.r) + callback(color.g) + callback(color.b) + (color.a < 1 ? callback(color.a) : "");
  }
  function rgbToOklch(color) {
    let value = srgbToLinearChannel(color.r), value2 = srgbToLinearChannel(color.g), value3 = srgbToLinearChannel(color.b), value4 = Math.cbrt(0.4122214708 * value + 0.5363325363 * value2 + 0.0514459929 * value3), value5 = Math.cbrt(0.2119034982 * value + 0.6806995451 * value2 + 0.1073969566 * value3), value6 = Math.cbrt(0.0883024619 * value + 0.2817188376 * value2 + 0.6299787005 * value3), value7 = 0.2104542553 * value4 + 0.793617785 * value5 - 0.0040720468 * value6, value8 = 1.9779984951 * value4 - 2.428592205 * value5 + 0.4505937099 * value6, value9 = 0.0259040371 * value4 + 0.7827717662 * value5 - 0.808675766 * value6;
    return {
      l: value7,
      c: Math.hypot(value8, value9),
      h: Math.atan2(value9, value8)
    };
  }
  function oklchToRgb(lightness, chroma, hue) {
    let value = chroma * Math.cos(hue), value2 = chroma * Math.sin(hue), value3 = (lightness + 0.3963377774 * value + 0.2158037573 * value2) ** 3, value4 = (lightness - 0.1055613458 * value - 0.0638541728 * value2) ** 3, value5 = (lightness - 0.0894841775 * value - 1.291485548 * value2) ** 3;
    return [
      linearToSrgbChannel(4.0767416621 * value3 - 3.3077115913 * value4 + 0.2309699292 * value5),
      linearToSrgbChannel(-1.2684380046 * value3 + 2.6097574011 * value4 - 0.3413193965 * value5),
      linearToSrgbChannel(-0.0041960863 * value3 - 0.7034186147 * value4 + 1.707614701 * value5)
    ];
  }
  function clippedOklchColor(lightness, chroma, hue, alpha = 1) {
    let index4 = 0, value = chroma;
    if (!rgbIsInGamut(oklchToRgb(lightness, chroma, hue))) {
      for (let index22 = 0; index22 < 18; index22++) {
        let value5 = (index4 + value) / 2;
        rgbIsInGamut(oklchToRgb(lightness, value5, hue)) ? index4 = value5 : value = value5;
      }
      value = index4;
    }
    let [value2, value3, value4] = oklchToRgb(lightness, value, hue), callback = (input) => Math.round(clampColorChannel_di(input) * 255) / 255;
    return {
      r: callback(value2),
      g: callback(value3),
      b: callback(value4),
      a: callback(alpha)
    };
  }
  function contrastColorFix(color, contrast) {
    let value = typeof color == "string" ? parseContrastColor(color) : color;
    if (value === void 0)
      return;
    let callback = (input) => {
      let value7 = colorContrastResults(input, contrast);
      if (value7 !== void 0)
        return {
          passes: value7.every((input2) => input2.passes),
          worst: worstContrastResult(value7)
        };
    };
    if (callback(value)?.passes !== !1)
      return;
    let { l, c, h } = rgbToOklch(value), value2 = c < 1e-4 ? 0 : c, count = 390625e-8, value3 = (Array.isArray(contrast.against) ? contrast.against.length : 1) === 1, callback2 = (input) => {
      if (value3 && callback(clippedOklchColor(input, value2, h, value.a))?.passes !== !0)
        return;
      let value7 = l;
      for (let value8 = l; value8 !== input; ) {
        value7 = value8, value8 = Math.abs(input - value8) <= count ? input : value8 + Math.sign(input - l) * count;
        let value9 = clippedOklchColor(value8, value2, h, value.a), value10 = callback(value9);
        if (value10?.passes === !0) {
          for (let index4 = 0; index4 < 12; index4++) {
            let value11 = (value7 + value8) / 2, value12 = clippedOklchColor(value11, value2, h, value.a), value13 = callback(value12);
            value13?.passes === !0 ? (value8 = value11, value9 = value12, value10 = value13) : value7 = value11;
          }
          return {
            rgba: value9,
            worst: value10.worst,
            moved: Math.abs(rgbToOklch(value9).l - l)
          };
        }
      }
    }, value4 = callback2(1), value5 = callback2(0), value6 = value4 === void 0 ? value5 : value5 === void 0 ? value4 : Math.abs(value4.moved - value5.moved) > 1e-3 ? value4.moved < value5.moved ? value4 : value5 : value4.worst.ratio >= value5.worst.ratio ? value4 : value5;
    if (value6 !== void 0)
      return {
        rgba: value6.rgba,
        css: contrastColorHex(value6.rgba),
        ground: value6.worst.ground,
        ratio: value6.worst.ratio
      };
  }
  return bindRuntimeValue(runtime2, "parseContrastColor", () => parseContrastColor), bindRuntimeValue(runtime2, "relativeLuminance", () => relativeLuminance), bindRuntimeValue(runtime2, "compositeContrastColor", () => compositeContrastColor), bindRuntimeValue(runtime2, "contrastRatio", () => contrastRatio), bindRuntimeValue(runtime2, "strongerContrastColor", () => strongerContrastColor), bindRuntimeValue(runtime2, "colorContrastResults", () => colorContrastResults), bindRuntimeValue(runtime2, "worstContrastResult", () => worstContrastResult), bindRuntimeValue(runtime2, "contrastRatioReadout", () => contrastRatioReadout), bindRuntimeValue(runtime2, "contrastRatioSpoken", () => contrastRatioSpoken), bindRuntimeValue(runtime2, "contrastColorHex", () => contrastColorHex), bindRuntimeValue(runtime2, "rgbToOklch", () => rgbToOklch), bindRuntimeValue(runtime2, "oklchToRgb", () => oklchToRgb), bindRuntimeValue(runtime2, "clippedOklchColor", () => clippedOklchColor), bindRuntimeValue(runtime2, "contrastColorFix", () => contrastColorFix), bindRuntimeValue(runtime2, "CONTRAST_HEX_PATTERN", () => CONTRAST_HEX_PATTERN, (value) => {
    CONTRAST_HEX_PATTERN = value;
  }), bindRuntimeValue(runtime2, "CONTRAST_RGB_PATTERN", () => CONTRAST_RGB_PATTERN, (value) => {
    CONTRAST_RGB_PATTERN = value;
  }), bindRuntimeValue(runtime2, "clampColorChannel_di", () => clampColorChannel_di, (value) => {
    clampColorChannel_di = value;
  }), bindRuntimeValue(runtime2, "CONTRAST_RATIO_EPSILON", () => CONTRAST_RATIO_EPSILON, (value) => {
    CONTRAST_RATIO_EPSILON = value;
  }), bindRuntimeValue(runtime2, "CONTRAST_MINIMUMS", () => CONTRAST_MINIMUMS, (value) => {
    CONTRAST_MINIMUMS = value;
  }), bindRuntimeValue(runtime2, "formatContrastRatio", () => formatContrastRatio, (value) => {
    formatContrastRatio = value;
  }), bindRuntimeValue(runtime2, "srgbToLinearChannel", () => srgbToLinearChannel, (value) => {
    srgbToLinearChannel = value;
  }), bindRuntimeValue(runtime2, "linearToSrgbChannel", () => linearToSrgbChannel, (value) => {
    linearToSrgbChannel = value;
  }), bindRuntimeValue(runtime2, "oklchHueRadians", () => oklchHueRadians, (value) => {
    oklchHueRadians = value;
  }), bindRuntimeValue(runtime2, "rgbIsInGamut", () => rgbIsInGamut, (value) => {
    rgbIsInGamut = value;
  }), bindRuntimeValue(runtime2, "initializeUiContrast", () => initializeUiContrast, (value) => {
    initializeUiContrast = value;
  }), () => {
    clampColorChannel_di = (channel) => channel < 0 ? 0 : channel > 1 ? 1 : channel, CONTRAST_RATIO_EPSILON = 1e-9, formatContrastRatio = (ratio) => {
      let value = Math.floor((ratio + CONTRAST_RATIO_EPSILON) * 10) / 10;
      return value < 10 || !Number.isInteger(value) ? value.toFixed(1) : String(value);
    }, srgbToLinearChannel = (channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4, linearToSrgbChannel = (channel) => channel <= 31308e-7 ? 12.92 * channel : 1.055 * channel ** 0.4166666666666667 - 0.055, oklchHueRadians = 1953125e-9, rgbIsInGamut = (color) => color.every((input) => input >= -oklchHueRadians && input <= 1 + oklchHueRadians), initializeUiContrast = (0, runtime2.initializeOnce)(() => {
      CONTRAST_HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, CONTRAST_RGB_PATTERN = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/i, CONTRAST_MINIMUMS = {
        text: 4.5,
        largeText: 3,
        graphic: 3
      };
    });
  };
}
export {
  installUiContrast
};
