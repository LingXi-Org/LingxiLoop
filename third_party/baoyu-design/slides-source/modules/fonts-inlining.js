// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsInlining(runtime2) {
  var defaultFontInliningBudget, maxConcurrentFontFetches, fontInliningTimeoutMs, minimumFontInliningBudget, isFullUnicodeRange, rangesIntersect, unicodeRangesKey, fontFamilyStyleKey, unicodeSpaceCodePoint, fontInliningFacePattern, fontInliningFamilyPattern, embeddedFontFilePattern, initializeFontInlining, initializeExportFontWarming, warmedExportFontsKey = "", exportFontWarming;
  function loadedSheetFontFiles(css) {
    let faces = loadedDocumentFontFaces(!0), declarations = reconcileFontFaceWeights((0, runtime2.parseFontFaceDeclarations)(css).filter((face) => face.files.length > 0), faces === void 0 ? void 0 : documentFontCoverage(faces));
    return [
      ...new Set(declarations.flatMap((face) => face.files))
    ];
  }
  function noteWebFontFailures(findings, failures) {
    failures.sheet === !0 && (findings.missingWebSheet = !0), failures.file === !0 && (findings.missingWebFile = !0), failures.badData === !0 && (findings.missingWebBadData = !0), failures.deadline === !0 && (findings.missingWebDeadline = !0), failures.timeout === !0 && (findings.missingWebTimeout = !0), failures.status === !0 && (findings.missingWebStatus = !0), failures.network === !0 && (findings.missingWebNetwork = !0);
  }
  function warmExportWebFonts(css) {
    return exportFontWarming = exportFontWarming.then(() => warmExportWebFontsNow(css)).catch(() => {
    }), exportFontWarming;
  }
  async function warmExportWebFontsNow(css) {
    if (typeof document > "u" || !("fonts" in document))
      return;
    let loaded = [...(0, runtime2.documentFontSet)()].filter((face) => face.status === "loaded"), families = new Set(loaded.map((face) => (0, runtime2.normalizeFontFaceFamily)(face.family))), { hrefs, optional } = (0, runtime2.googleFontImports)(css), wanted = hrefs.filter((href) => optional.has(href) ? (0, runtime2.googleFontVariantAvailable)(href, !0) : googleFontUrlFamilies(href).some((family) => families.has(family.toLowerCase()))), key = wanted.join(" ") + " " + String(loaded.length);
    if (wanted.length === 0 || key === warmedExportFontsKey)
      return;
    await (0, runtime2.warmFontStylesheets)(wanted), wanted.every(runtime2.fontStylesheetSettled) && (warmedExportFontsKey = key);
    let sheets = wanted.map(runtime2.cachedFontStylesheet).filter((sheet) => sheet !== void 0);
    await (0, runtime2.prefetchFontFiles)([
      ...new Set(sheets.flatMap(loadedSheetFontFiles))
    ]);
  }
  function loadedDocumentFontFaces(includeLoading = !1) {
    if (typeof document > "u" || !("fonts" in document))
      return;
    let items = [];
    for (let value of (0, runtime2.documentFontSet)())
      value.status !== "loaded" && (includeLoading || value.status !== "loading") || items.push({
        family: value.family,
        style: value.style,
        weight: value.weight,
        unicodeRange: value.unicodeRange
      });
    return items;
  }
  function fontUnicodeRangesEqual(ranges, otherRanges) {
    return isFullUnicodeRange(ranges) ? !0 : ranges.length === otherRanges.length && ranges.every((input, options) => input[0] === otherRanges[options][0] && input[1] === otherRanges[options][1]);
  }
  function fontUnicodeRangesOverlap(ranges, otherRanges) {
    let index4 = 0, index22 = 0;
    for (; index4 < ranges.length && index22 < otherRanges.length; ) {
      if (ranges[index4][0] <= otherRanges[index22][1] && otherRanges[index22][0] <= ranges[index4][1])
        return !0;
      ranges[index4][1] < otherRanges[index22][1] ? index4++ : index22++;
    }
    return !1;
  }
  function nearestAvailableWeightRange(weight, ranges) {
    let value = ranges.filter((input) => input[1] < weight).sort((input, options) => options[1] - input[1]), value2 = ranges.filter((input) => input[0] > weight).sort((input, options) => input[0] - options[0]);
    return weight > 500 ? value2[0] ?? value[0] : weight < 400 ? value[0] ?? value2[0] : value2.find((input) => input[0] <= 500) ?? value[0] ?? value2[0];
  }
  function documentFontCoverage(fontFaces) {
    let entries = /* @__PURE__ */ new Map();
    for (let value of fontFaces) {
      let value2 = fontFamilyStyleKey(value.family, value.style), value3 = entries.get(value2) ?? [];
      value3.push({
        weight: (0, runtime2.parseFontWeightRange)(value.weight),
        ranges: (0, runtime2.parseFontUnicodeRanges)(value.unicodeRange)
      }), entries.set(value2, value3);
    }
    return entries;
  }
  function unicodeRangeContainsSpace(ranges) {
    return ranges.some(([input, input2]) => input <= unicodeSpaceCodePoint && unicodeSpaceCodePoint <= input2);
  }
  function reconcileFontFaceWeights(faces, coverage) {
    if (coverage === void 0)
      return [...faces];
    let entries = /* @__PURE__ */ new Map();
    for (let value3 of faces) {
      let value4 = fontFamilyStyleKey(value3.family, value3.style) + `
` + unicodeRangesKey(value3.ranges);
      entries.set(value4, [...entries.get(value4) ?? [], value3.weight]);
    }
    let value = faces.map((input) => {
      let value3 = coverage.get(fontFamilyStyleKey(input.family, input.style)) ?? [], value4 = value3.filter((input2) => fontUnicodeRangesEqual(input2.ranges, input.ranges));
      if (value4.some((input2) => rangesIntersect(input2.weight, input.weight)))
        return "same";
      let entry = entries.get(fontFamilyStyleKey(input.family, input.style) + `
` + unicodeRangesKey(input.ranges)), callback2 = (input2) => {
        let value5 = nearestAvailableWeightRange(input2.weight[0], entry);
        return value5 !== void 0 && value5[0] === input.weight[0] && value5[1] === input.weight[1];
      };
      return value4.some((input2) => !entry.some((input3) => rangesIntersect(input2.weight, input3)) && callback2(input2)) ? "same" : value3.some((input2) => rangesIntersect(input2.weight, input.weight) && fontUnicodeRangesOverlap(input2.ranges, input.ranges)) ? "near" : "none";
    }), values = new Set(faces.filter((input, options) => value[options] === "same").map((input) => input.family)), value2 = faces.map((input, options) => value[options] === "same" || value[options] === "near" && !values.has(input.family)), callback = (input) => fontFamilyStyleKey(input.family, input.style) + `
` + String(input.weight[0]) + " " + String(input.weight[1]), values2 = new Set(faces.filter((input, options) => value2[options]).map(callback));
    return faces.filter((input, options) => value2[options] || values2.has(callback(input)) && unicodeRangeContainsSpace(input.ranges));
  }
  function googleFontUrlFamilies(href) {
    return [...href.matchAll(/[?&]family=([^:&]+)/g)].map((input) => input[1].replace(/\+|%20/g, " "));
  }
  function googleFontUrlFamiliesLowercase(href) {
    return googleFontUrlFamilies(href).map((input) => input.toLowerCase());
  }
  function fontUsageHints(css, extra) {
    return (extra + (css.match(/--deck-[\w-]+:[^;}]*/g) ?? []).join(" ")).toLowerCase();
  }
  function removeUnusedFontFaces(css, usedFamilies) {
    return css.replace(fontInliningFacePattern, (input) => {
      let value = fontInliningFamilyPattern.exec(input)?.[2]?.trim().toLowerCase();
      return value === void 0 || usedFamilies.includes(value) ? input : "";
    });
  }
  function removeRuntimeFontFaces(css) {
    return css.replace(fontInliningFacePattern, (input) => /url\(["']?[^"')]*\/_runtime\//.test(input) ? "" : input);
  }
  async function inlineGoogleFontFaces(css, options) {
    let { hrefs, optional } = (0, runtime2.googleFontImports)(css), empty = {
      css: "",
      unavailable: !1,
      overBudget: !1,
      requested: !1,
      failures: {},
      carried: [],
      heldBack: []
    };
    if (hrefs.length === 0)
      return empty;
    let value2 = options.loadedFaces ?? "document", value3 = value2 === "document" || value2 === "settled" ? loadedDocumentFontFaces(value2 === "settled") : value2 === "all" ? void 0 : value2, value7 = options.familyNamed ?? (() => !0), value9 = value3 === void 0 ? void 0 : new Set(value3.map((input) => (0, runtime2.normalizeFontFaceFamily)(input.family))), linkedNames = new Map(hrefs.flatMap(googleFontUrlFamilies).map((family) => [
      family.toLowerCase(),
      family
    ])), linkedName = (families) => [...families].map((family) => linkedNames.get(family) ?? family), heldBack = /* @__PURE__ */ new Set(), entries = /* @__PURE__ */ new Map(), callback = (input) => {
      let entry = entries.get(input);
      return entry === void 0 && (entry = (value9 === void 0 || value9.has(input)) && value7(input), entry && options.mayCarry !== void 0 && !options.mayCarry(input) && (heldBack.add(input), entry = !1), entries.set(input, entry)), entry;
    };
    for (let family of linkedNames.keys())
      callback(family);
    if (heldBack.size > 0 && ![...entries.values()].includes(!0))
      return {
        ...empty,
        heldBack: linkedName(heldBack)
      };
    let budget = options.budget ?? defaultFontInliningBudget;
    if (budget < minimumFontInliningBudget)
      return {
        ...empty,
        overBudget: !0,
        heldBack: linkedName(heldBack)
      };
    let value = Math.min(Date.now() + fontInliningTimeoutMs, options.deadline ?? 1 / 0);
    if (Date.now() >= value)
      return {
        ...empty,
        unavailable: !0,
        failures: {
          deadline: !0
        },
        heldBack: linkedName(heldBack)
      };
    let value4 = options.fetchText ?? runtime2.fetchFontStylesheet, value5 = options.fetchDataUrl ?? runtime2.fetchFontDataUrl, value6 = options.faceInUse ?? (value2 === "settled" ? (input) => (0, runtime2.googleFontVariantAvailable)(input, !0) : runtime2.googleFontVariantAvailable), value8 = value3 === void 0 ? void 0 : documentFontCoverage(value3), flag = !1, requested = !1, failures = {}, noteFailure = (stage, error) => {
      failures[stage] = failures[(0, runtime2.fetchFailureKind)(error)] = !0;
    }, value10 = await Promise.all(hrefs.map(async (input) => {
      if (optional.has(input) && !value6(input) || !googleFontUrlFamiliesLowercase(input).some(callback))
        return [];
      requested = !0;
      try {
        return reconcileFontFaceWeights((0, runtime2.parseFontFaceDeclarations)(await value4(input)).filter((input2) => input2.files.length > 0 && callback(input2.family)), value8);
      } catch (error) {
        return flag = !0, noteFailure("sheet", error), [];
      }
    })), values = /* @__PURE__ */ new Set(), value11 = value10.flat().filter((input) => values.has(input.text) ? !1 : (values.add(input.text), !0)), value12 = textCodePointsWithCaseVariants(options.text), entries2 = new Map(value11.map((input) => [
      input,
      input.ranges.reduce((input2, [options2, options3]) => input2 + countCodePointsInRange(value12, options2, options3), 0)
    ])), value13 = [...value11].sort((input, options2) => Number(unicodeRangeContainsSpace(options2.ranges)) - Number(unicodeRangeContainsSpace(input.ranges)) || entries2.get(options2) - entries2.get(input)), entries3 = /* @__PURE__ */ new Map(), entries4 = /* @__PURE__ */ new Map(), index4 = 0, flag2 = !1, flag3 = !1, flag4 = !1, flag5 = !1, flag6 = !1, flag7 = !1, index22 = 0, value14 = Math.max(1, Math.floor(options.batch ?? maxConcurrentFontFetches)), roomTaken = /* @__PURE__ */ new Set(), callback2 = (input) => {
      let value15 = input.text.replace(runtime2.googleFontFileUrlRegex, (input2, options2, context) => 'url("' + entries3.get(context) + '")') + `
`, room = roomTaken.has(input.family) ? 0 : options.familyRoom?.(input.family) ?? 0;
      return index4 + value15.length + room > budget ? (flag2 = !0, !1) : (entries4.set(input, value15), index4 += value15.length + room, roomTaken.add(input.family), !0);
    };
    for (let index32 = 0; index32 < value13.length && !flag4 && !flag6 && index4 < budget && (flag7 = Date.now() >= value, !flag7); index32 += value14) {
      let value15 = value13.slice(index32, index32 + value14);
      index22 = index32 + value15.length;
      let value16 = [
        ...new Set(value15.flatMap((input) => input.files))
      ].filter((input) => !entries3.has(input));
      await Promise.all(value16.map(async (input) => {
        try {
          let value18 = await value5(input), isFont = embeddedFontFilePattern.test(value18);
          entries3.set(input, isFont ? value18 : null), isFont || (failures.badData = !0);
        } catch (error) {
          entries3.set(input, null), noteFailure("file", error);
        }
      }));
      let value17 = value16.length > 0 && value16.every((input) => entries3.get(input) === null);
      flag4 = value17 && (value16.length > 1 || flag5), value16.length > 0 && (flag5 = value17);
      let index42 = 0, index5 = 0;
      for (let value18 of value15) {
        if (value18.files.some((input) => entries3.get(input) == null)) {
          flag3 = !0;
          continue;
        }
        index5 += 1, callback2(value18) && (index42 += 1);
      }
      flag6 = index5 > 0 && index42 === 0;
    }
    let flag8 = !1;
    for (let value15 of value13.slice(index22))
      value15.files.every((input) => entries3.get(input) != null) ? callback2(value15) : value15.files.some((input) => !entries3.has(input)) && (flag8 = !0);
    return flag7 && flag8 && (failures.deadline = !0), {
      css: value11.flatMap((input) => entries4.get(input) ?? []).join(""),
      unavailable: flag || flag3 || flag7 && flag8,
      overBudget: flag2 || flag8 && !flag4 && !flag7,
      requested,
      failures,
      carried: linkedName(new Set(value11.filter((input) => entries4.has(input)).map((input) => input.family))),
      heldBack: linkedName(heldBack)
    };
  }
  function textCodePointsWithCaseVariants(text) {
    let codes = /* @__PURE__ */ new Set();
    for (let value of [text, text.toUpperCase(), text.toLowerCase()])
      for (let value2 of value)
        codes.add(value2.codePointAt(0));
    return [...codes].sort((input, options) => input - options);
  }
  function countCodePointsInRange(codePoints, minimum, maximum) {
    let lowerBound = (input) => {
      let index4 = 0, length = codePoints.length;
      for (; index4 < length; ) {
        let value = index4 + length >> 1;
        codePoints[value] < input ? index4 = value + 1 : length = value;
      }
      return index4;
    };
    return lowerBound(maximum + 1) - lowerBound(minimum);
  }
  return bindRuntimeValue(runtime2, "loadedDocumentFontFaces", () => loadedDocumentFontFaces), bindRuntimeValue(runtime2, "fontUnicodeRangesEqual", () => fontUnicodeRangesEqual), bindRuntimeValue(runtime2, "fontUnicodeRangesOverlap", () => fontUnicodeRangesOverlap), bindRuntimeValue(runtime2, "nearestAvailableWeightRange", () => nearestAvailableWeightRange), bindRuntimeValue(runtime2, "documentFontCoverage", () => documentFontCoverage), bindRuntimeValue(runtime2, "unicodeRangeContainsSpace", () => unicodeRangeContainsSpace), bindRuntimeValue(runtime2, "reconcileFontFaceWeights", () => reconcileFontFaceWeights), bindRuntimeValue(runtime2, "googleFontUrlFamilies", () => googleFontUrlFamilies), bindRuntimeValue(runtime2, "googleFontUrlFamiliesLowercase", () => googleFontUrlFamiliesLowercase), bindRuntimeValue(runtime2, "fontUsageHints", () => fontUsageHints), bindRuntimeValue(runtime2, "removeUnusedFontFaces", () => removeUnusedFontFaces), bindRuntimeValue(runtime2, "removeRuntimeFontFaces", () => removeRuntimeFontFaces), bindRuntimeValue(runtime2, "inlineGoogleFontFaces", () => inlineGoogleFontFaces), bindRuntimeValue(runtime2, "textCodePointsWithCaseVariants", () => textCodePointsWithCaseVariants), bindRuntimeValue(runtime2, "countCodePointsInRange", () => countCodePointsInRange), bindRuntimeValue(runtime2, "defaultFontInliningBudget", () => defaultFontInliningBudget, (value) => {
    defaultFontInliningBudget = value;
  }), bindRuntimeValue(runtime2, "maxConcurrentFontFetches", () => maxConcurrentFontFetches, (value) => {
    maxConcurrentFontFetches = value;
  }), bindRuntimeValue(runtime2, "fontInliningTimeoutMs", () => fontInliningTimeoutMs, (value) => {
    fontInliningTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "minimumFontInliningBudget", () => minimumFontInliningBudget, (value) => {
    minimumFontInliningBudget = value;
  }), bindRuntimeValue(runtime2, "isFullUnicodeRange", () => isFullUnicodeRange, (value) => {
    isFullUnicodeRange = value;
  }), bindRuntimeValue(runtime2, "rangesIntersect", () => rangesIntersect, (value) => {
    rangesIntersect = value;
  }), bindRuntimeValue(runtime2, "unicodeRangesKey", () => unicodeRangesKey, (value) => {
    unicodeRangesKey = value;
  }), bindRuntimeValue(runtime2, "fontFamilyStyleKey", () => fontFamilyStyleKey, (value) => {
    fontFamilyStyleKey = value;
  }), bindRuntimeValue(runtime2, "unicodeSpaceCodePoint", () => unicodeSpaceCodePoint, (value) => {
    unicodeSpaceCodePoint = value;
  }), bindRuntimeValue(runtime2, "fontInliningFacePattern", () => fontInliningFacePattern, (value) => {
    fontInliningFacePattern = value;
  }), bindRuntimeValue(runtime2, "fontInliningFamilyPattern", () => fontInliningFamilyPattern, (value) => {
    fontInliningFamilyPattern = value;
  }), bindRuntimeValue(runtime2, "embeddedFontFilePattern", () => embeddedFontFilePattern, (value) => {
    embeddedFontFilePattern = value;
  }), bindRuntimeValue(runtime2, "noteWebFontFailures", () => noteWebFontFailures), bindRuntimeValue(runtime2, "loadedSheetFontFiles", () => loadedSheetFontFiles), bindRuntimeValue(runtime2, "warmExportWebFonts", () => warmExportWebFonts), bindRuntimeValue(runtime2, "initializeExportFontWarming", () => initializeExportFontWarming, (value) => {
    initializeExportFontWarming = value;
  }), bindRuntimeValue(runtime2, "initializeFontInlining", () => initializeFontInlining, (value) => {
    initializeFontInlining = value;
  }), () => {
    defaultFontInliningBudget = 4194304, maxConcurrentFontFetches = 8, fontInliningTimeoutMs = 2e4, minimumFontInliningBudget = 16384, isFullUnicodeRange = (items) => items.length === 1 && items[0][0] <= 0 && items[0][1] >= 1114111, rangesIntersect = (input, options) => input[0] <= options[1] && options[0] <= input[1], unicodeRangesKey = (input) => input.map((input2) => String(input2[0]) + "-" + String(input2[1])).join(","), fontFamilyStyleKey = (input, options) => (0, runtime2.normalizeFontFaceFamily)(input) + `
` + options.trim().toLowerCase(), unicodeSpaceCodePoint = 32, initializeFontInlining = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFontFetching)(), (0, runtime2.initializeFontFaceParser)(), fontInliningFacePattern = /@font-face\s*\{[^}]*\}/g, fontInliningFamilyPattern = /font-family:\s*(["']?)([^;"'}]+)\1/, embeddedFontFilePattern = /^data:(?:font|application)\/[\w+.-]+(?:; ?[\w.+-]+=[\w.+-]+)*;base64,[A-Za-z0-9+/=]*$/;
    }), initializeExportFontWarming = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFontFetching)(), (0, runtime2.initializeFontFaceParser)(), initializeFontInlining(), exportFontWarming = Promise.resolve();
    });
  };
}
export {
  installFontsInlining
};
