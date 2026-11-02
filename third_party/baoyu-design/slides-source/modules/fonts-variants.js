// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsVariants(runtime2) {
  var weightNames, fontWeightValues, webSafeFontVariants, defaultFontVariants, webSafeFontFamilyNames, sortFontVariants, initializeFontVariants;
  function optionalGoogleFontStylesheetUrls(href, weights) {
    if (typeof href != "string" || href.length > 1024 || href.slice(0, 34) !== "https://fonts.googleapis.com/css2?")
      return [];
    let value = href.slice(34).split("&");
    if (value.some((input) => input.slice(0, 5) === "text="))
      return [];
    let items = [];
    for (let value2 of value) {
      if (value2.slice(0, 7) !== "family=")
        continue;
      let value3 = items.length + 16, value4 = value2.slice(7).replace(/%20| /g, "+"), value5 = value4.indexOf(":"), value6 = value5 < 0 ? value4 : value4.slice(0, value5);
      if (!/^[A-Za-z0-9][A-Za-z0-9+._-]{0,99}$/.test(value6))
        continue;
      let items2 = [["0", "400"]];
      if (value5 >= 0) {
        let value10 = value4.indexOf("@", value5), value11 = value4.slice(value5 + 1, value10 < 0 ? value5 : value10).split(","), value12 = value11.indexOf("ital"), value13 = value11.indexOf("wght");
        if (value10 < 0 || value11.some((input) => input !== "ital" && input !== "wght"))
          continue;
        items2 = [];
        for (let value14 of value4.slice(value10 + 1).split(";")) {
          let value15 = value14.split(","), items3 = [
            value12 < 0 ? "0" : value15[value12] ?? "",
            value13 < 0 ? "400" : value15[value13] ?? ""
          ];
          if (value15.length !== value11.length || !/^[01]$/.test(items3[0]) || !/^[1-9]\d{0,3}(?:\.\.[1-9]\d{0,3})?$/.test(items3[1])) {
            items2 = [];
            break;
          }
          items2.push(items3);
        }
        if (items2.length === 0)
          continue;
      }
      let value7 = items2.map((input) => input[0] + "," + input[1]), value8 = weights !== void 0 && Object.prototype.hasOwnProperty.call(weights, value6.replace(/\+/g, " ").toLowerCase()) ? weights[value6.replace(/\+/g, " ").toLowerCase()] : void 0, value9;
      if (value8 !== void 0) {
        let callback = (input, options) => items2.some((input2) => input2[0] === input && options >= Number(input2[1].split("..")[0]) && options <= Number(input2[1].split("..").pop()));
        value9 = [];
        for (let value10 of value8.italic ? ["0", "1"] : ["0"]) {
          if (value8.wght === void 0) {
            for (let value11 of value8.statics ?? [])
              callback(value10, value11) || value9.push(value10 + "," + String(value11));
            continue;
          }
          let index4 = 0;
          for (let value11 = value8.wght[0]; value11 <= value8.wght[1] + 100; value11 += 100) {
            let value12 = value11 <= value8.wght[1] && !callback(value10, value11);
            value12 && index4 === 0 && (index4 = value11), !value12 && index4 !== 0 && (value9.push(value10 + "," + String(index4) + (value11 - 100 > index4 ? ".." + String(value11 - 100) : "")), index4 = 0);
          }
        }
      } else {
        let callback = (input) => Number(input[1].split("..").pop()) >= 600, value10 = items2.filter((input) => input[0] === "0");
        value9 = value10.map((input) => "1," + input[1]).concat(value10.some(callback) ? [] : ["0,700"], items2.some(callback) ? [] : ["1,700"]);
      }
      for (let value10 of value9) {
        let value11 = "https://fonts.googleapis.com/css2?family=" + value6 + ":ital,wght@" + value10 + "&display=swap";
        value7.indexOf(value10) < 0 && items.indexOf(value11) < 0 && items.length < value3 && items.push(value11);
      }
    }
    return items;
  }
  function normalizeFontWeight(weight) {
    return Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
  }
  function fontVariantLabel(weight, italic) {
    let value = weightNames[normalizeFontWeight(weight)] ?? String(weight);
    return italic ? normalizeFontWeight(weight) === 400 ? "Italic" : value + " italic" : value;
  }
  function fontVariantKey(weight, italic) {
    return String(normalizeFontWeight(weight)) + (italic ? "i" : "");
  }
  function parseFontVariantKey(key) {
    let value = /^([1-9]00)(i?)$/.exec(key);
    if (value)
      return {
        weight: Number(value[1]),
        italic: value[2] === "i"
      };
  }
  function firstFontFamily(fontFamily) {
    return (fontFamily.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "").trim();
  }
  function availableFontVariants(fontFaces, family) {
    let familyName = firstFontFamily(family).toLowerCase(), variants = /* @__PURE__ */ new Map();
    for (let value of fontFaces) {
      if (typeof value?.family != "string" || typeof value.weight != "string" || typeof value.style != "string" || value.status === "error" || firstFontFamily(value.family).toLowerCase() !== familyName)
        continue;
      let value2 = /^(?:italic|oblique)/.test(value.style.trim()), value3 = value.weight.trim(), value4 = /^(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(value3), value5 = value3 === "normal" ? 400 : value3 === "bold" ? 700 : value4 ? Number(value4[1]) : NaN;
      if (!Number.isFinite(value5))
        continue;
      let value6 = value4?.[2] !== void 0 ? Number(value4[2]) : value5, value7 = fontWeightValues.filter((input) => input >= Math.min(value5, value6) && input <= Math.max(value5, value6));
      for (let value8 of value7.length > 0 ? value7 : [normalizeFontWeight(value5)])
        variants.set(fontVariantKey(value8, value2), {
          weight: value8,
          italic: value2
        });
    }
    if (variants.size !== 0)
      return sortFontVariants(variants.values());
  }
  function knownFontVariants(family) {
    let value = firstFontFamily(family), value2 = (0, runtime2.knownFontFamily)(value);
    if (value2 !== void 0)
      return (value2.wght !== void 0 ? fontWeightValues.filter((input) => input >= value2.wght[0] && input <= value2.wght[1]) : [...value2.statics ?? [400]]).flatMap((input) => value2.italic ? [
        {
          weight: input,
          italic: !1
        },
        {
          weight: input,
          italic: !0
        }
      ] : [
        {
          weight: input,
          italic: !1
        }
      ]);
    let value3 = value.toLowerCase();
    if (webSafeFontFamilyNames.has(value3) || value3 === "helvetica neue" || runtime2.webSafeFontFamilyPattern.test(value3) || /^(?:-apple-system|blinkmacsystemfont)$/.test(value3))
      return [...webSafeFontVariants];
  }
  function fontVariantsOrDefault(family, fallbackVariants) {
    return knownFontVariants(family) ?? (fallbackVariants !== void 0 && fallbackVariants.length > 0 ? fallbackVariants : defaultFontVariants);
  }
  function fontVariantChoices(variants, current) {
    let sortedVariants = sortFontVariants(variants);
    return current !== void 0 && !sortedVariants.some((input) => input.weight === normalizeFontWeight(current.weight) && input.italic === current.italic) && sortedVariants.unshift({
      weight: normalizeFontWeight(current.weight),
      italic: current.italic
    }), sortedVariants.map((input) => ({
      value: fontVariantKey(input.weight, input.italic),
      label: fontVariantLabel(input.weight, input.italic)
    }));
  }
  return bindRuntimeValue(runtime2, "optionalGoogleFontStylesheetUrls", () => optionalGoogleFontStylesheetUrls), bindRuntimeValue(runtime2, "normalizeFontWeight", () => normalizeFontWeight), bindRuntimeValue(runtime2, "fontVariantLabel", () => fontVariantLabel), bindRuntimeValue(runtime2, "fontVariantKey", () => fontVariantKey), bindRuntimeValue(runtime2, "parseFontVariantKey", () => parseFontVariantKey), bindRuntimeValue(runtime2, "firstFontFamily", () => firstFontFamily), bindRuntimeValue(runtime2, "availableFontVariants", () => availableFontVariants), bindRuntimeValue(runtime2, "knownFontVariants", () => knownFontVariants), bindRuntimeValue(runtime2, "fontVariantsOrDefault", () => fontVariantsOrDefault), bindRuntimeValue(runtime2, "fontVariantChoices", () => fontVariantChoices), bindRuntimeValue(runtime2, "weightNames", () => weightNames, (value) => {
    weightNames = value;
  }), bindRuntimeValue(runtime2, "fontWeightValues", () => fontWeightValues, (value) => {
    fontWeightValues = value;
  }), bindRuntimeValue(runtime2, "webSafeFontVariants", () => webSafeFontVariants, (value) => {
    webSafeFontVariants = value;
  }), bindRuntimeValue(runtime2, "defaultFontVariants", () => defaultFontVariants, (value) => {
    defaultFontVariants = value;
  }), bindRuntimeValue(runtime2, "webSafeFontFamilyNames", () => webSafeFontFamilyNames, (value) => {
    webSafeFontFamilyNames = value;
  }), bindRuntimeValue(runtime2, "sortFontVariants", () => sortFontVariants, (value) => {
    sortFontVariants = value;
  }), bindRuntimeValue(runtime2, "initializeFontVariants", () => initializeFontVariants, (value) => {
    initializeFontVariants = value;
  }), () => {
    sortFontVariants = (input) => [...input].sort((input2, options) => input2.weight - options.weight || Number(input2.italic) - Number(options.italic)), initializeFontVariants = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFontCatalog)(), weightNames = {
        100: "极细",
        200: "特细",
        300: "细体",
        400: "常规",
        500: "中等",
        600: "半粗",
        700: "加粗",
        800: "特粗",
        900: "黑体"
      }, fontWeightValues = [100, 200, 300, 400, 500, 600, 700, 800, 900], webSafeFontVariants = [
        {
          weight: 400,
          italic: !1
        },
        {
          weight: 400,
          italic: !0
        },
        {
          weight: 700,
          italic: !1
        },
        {
          weight: 700,
          italic: !0
        }
      ], defaultFontVariants = fontWeightValues.flatMap((input) => [
        {
          weight: input,
          italic: !1
        },
        {
          weight: input,
          italic: !0
        }
      ]), webSafeFontFamilyNames = new Set(runtime2.webSafeFontCatalog.map((input) => input.family.toLowerCase()));
    });
  };
}
export {
  installFontsVariants
};
