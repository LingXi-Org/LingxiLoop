// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportCurrentFonts(runtime2) {
  var currentFontExports, normalizeCurrentFontName, isFontFaceSet, CURRENT_FONT_PROBE_TIMEOUT_MS, joinFontNames, initializeCurrentFonts;
  function currentRoleFontFace(fonts) {
    let value = (0, runtime2.getRenderingTheme)() !== "neutral";
    return (input) => {
      let value2 = (0, runtime2.renderingTypeScaleForRole)(input).serifDisplay ? "serif" : "sans", value3 = value ? fonts?.[value2] : void 0;
      return value3 !== void 0 && !(0, runtime2.isGenericFontFamily)(value3.family.trim()) ? {
        family: value3.family,
        fallback: value2
      } : (0, runtime2.webSafeFontFallback)(value2);
    };
  }
  function resolveCurrentFontFaces(slides, fonts) {
    return (0, runtime2.swapFaces)(slides, (input) => typeof input == "string" ? (0, runtime2.webSafeFontFallback)(input) : input, {
      faceless: currentRoleFontFace(fonts)
    });
  }
  function collectCustomFontUsage(slides) {
    let entries = /* @__PURE__ */ new Map(), callback = (source) => {
      for (let value4 of (0, runtime2.nodeChildren)(source) ?? [])
        callback(value4);
      if (source.kind !== "text" && source.kind !== "table")
        return;
      let value = source.style?.fontFamily;
      if (typeof value != "object" || (0, runtime2.resolveBasicFontFamily)(value.family) !== void 0)
        return;
      let value2 = (source.kind === "text" ? source.style?.fontWeight : void 0) ?? (0, runtime2.renderingTypeScaleForRole)(source.role ?? "body").fontWeight, value3 = entries.get(normalizeCurrentFontName(value.family)) ?? {
        family: value.family,
        weight: value2,
        italic: source.style?.fontStyle === "italic",
        text: ""
      };
      value3.text += source.kind === "text" ? source.text : source.rows.flat().join(""), entries.set(normalizeCurrentFontName(value.family), value3);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        callback(value2.node);
    return entries;
  }
  function pageFontSet(page) {
    let value = "fonts" in page ? page.fonts : void 0;
    if (isFontFaceSet(value))
      return value;
  }
  function canvasFontIsLoaded(family, weight, italic, text) {
    try {
      let value = typeof document > "u" ? void 0 : document.createElement("canvas").getContext("2d");
      if (value == null)
        return;
      let items = ["monospace", "serif", "sans-serif"], callback = (input) => {
        let callback2 = (input2) => (value.font = (text ? "italic " : "") + String(italic) + " 32px " + input2, value.measureText(input).width), value3 = items.map(callback2);
        if (value3.every((input2) => input2 === value3[0]))
          return;
        let value4 = items.map((input2) => callback2('"' + family + '", ' + input2));
        return value4.every((input2) => input2 === value4[0]);
      }, value2 = weight.replace(/[^\p{L}\p{N} ]+/gu, "").trim().slice(0, 40), items2 = [
        value2 === "" ? void 0 : callback(value2),
        callback("Hamburgefonstiv 0123")
      ];
      return items2.includes(!0) ? !0 : items2.includes(!1) ? !1 : void 0;
    } catch {
      return;
    }
  }
  async function unloadedFontFamilies(fontSet, slides, faces, fonts, timeoutMs = runtime2.fontReadyTimeoutMs) {
    if (fontSet === void 0)
      return [];
    let values = new Set([
      ...faces ?? [],
      ...Object.values(fonts ?? {})
    ].flatMap((input) => input === void 0 ? [] : [normalizeCurrentFontName(input.family)])), value = [...collectCustomFontUsage(slides).entries()].filter(([input]) => values.has(input));
    if (value.length === 0)
      return [];
    let value2 = Date.now() + timeoutMs, callback = () => Math.max(0, value2 - Date.now()), callback2 = () => {
      let entries2 = /* @__PURE__ */ new Map();
      for (let value4 of fontSet)
        typeof value4?.family == "string" && entries2.set(normalizeCurrentFontName(value4.family), (entries2.get(normalizeCurrentFontName(value4.family)) ?? /* @__PURE__ */ new Set()).add(String(value4.status)));
      return entries2;
    }, value3 = callback2(), entries = /* @__PURE__ */ new Map(), callback3 = (input, options) => {
      let entry = entries.get(input);
      if (entry !== void 0)
        return entry;
      let value4 = canvasFontIsLoaded(options.family, options.text, options.weight, options.italic) === !0;
      return entries.set(input, value4), value4;
    };
    for (let value4 = Math.min(value2, Date.now() + CURRENT_FONT_PROBE_TIMEOUT_MS); value.some(([input, input2]) => !value3.has(input) && !callback3(input, input2)) && Date.now() < value4; value3 = callback2())
      await new Promise((input) => setTimeout(input, Math.min(200, callback())));
    let values2 = new Set([...value3].flatMap(([input, input2]) => input2.has("loaded") ? [input] : [])), values3 = /* @__PURE__ */ new Set(), callback4 = ([input, input2]) => (values3.add(input), Promise.resolve().then(() => fontSet.load((input2.italic ? "italic " : "") + String(input2.weight) + ' 16px "' + input2.family + '"', " " + input2.text)).then((items) => {
      items.length > 0 && values2.add(input);
    }, () => {
    })), callback5 = ([input]) => !values3.has(input) && value3.get(input)?.has("loaded") === !1;
    return await (0, runtime2.promiseWithTimeout)(Promise.all(value.filter(callback5).map(callback4)), callback()), await (0, runtime2.promiseWithTimeout)(Promise.resolve(fontSet.ready).catch(() => {
    }), callback()), value3 = callback2(), await (0, runtime2.promiseWithTimeout)(Promise.all(value.filter(callback5).map(callback4)), callback()), value3 = callback2(), entries.clear(), value.filter(([input, input2]) => !values2.has(input) && value3.get(input)?.has("loaded") !== !0 && (value3.get(input)?.has("loading") === !0 || !callback3(input, input2))).map(([, input]) => input.family);
  }
  function withoutFontFamilies(slides, missingFamilies) {
    let entries = new Map(missingFamilies.map((input) => [
      normalizeCurrentFontName(input),
      input
    ])), entries2 = /* @__PURE__ */ new Map();
    return {
      slides: (0, runtime2.swapFaces)(slides, (input, options) => {
        let value = typeof input == "object" ? entries.get(normalizeCurrentFontName(input.family)) : void 0;
        if (value === void 0)
          return input;
        let value2 = (0, runtime2.webSafeFontFallback)(options), value3 = entries2.get(value) ?? [];
        return value3.includes(value2.family) || value3.push(value2.family), entries2.set(value, value3), value2;
      }),
      standIns: entries2
    };
  }
  function unloadedFontNote(standIns) {
    let items = [...standIns.keys()], items2 = [...new Set([...standIns.values()].flat())], value = [...standIns].map(([input, input2]) => input + " with " + joinFontNames(input2)), value2 = items.length === 1 || items2.length === 1 ? "uses " + joinFontNames(items2) + " instead" : "replaces " + value.slice(0, -1).join(", ") + ", and " + String(value[value.length - 1]);
    return (items.length === 1 ? "the font " : "the fonts ") + joinFontNames(items) + " did not load on this page, so this file " + value2 + "; to retry, export again in a moment or reload the page";
  }
  async function toCurrentFonts(fontSet, options, faces, fonts, timeoutMs = runtime2.fontReadyTimeoutMs) {
    let value = resolveCurrentFontFaces(options, fonts), value2 = await unloadedFontFamilies(fontSet, value, faces, fonts, timeoutMs).catch(() => []);
    if (value2.length === 0)
      return {
        slides: value,
        moved: [],
        notes: []
      };
    let { slides, standIns } = withoutFontFamilies(value, value2);
    return {
      slides,
      moved: [...standIns.keys()],
      notes: standIns.size > 0 ? [unloadedFontNote(standIns)] : []
    };
  }
  bindRuntimeValue(runtime2, "currentFontExports", () => currentFontExports, (value) => {
    currentFontExports = value;
  }), bindRuntimeValue(runtime2, "currentRoleFontFace", () => currentRoleFontFace), bindRuntimeValue(runtime2, "resolveCurrentFontFaces", () => resolveCurrentFontFaces), bindRuntimeValue(runtime2, "collectCustomFontUsage", () => collectCustomFontUsage), bindRuntimeValue(runtime2, "pageFontSet", () => pageFontSet), bindRuntimeValue(runtime2, "canvasFontIsLoaded", () => canvasFontIsLoaded), bindRuntimeValue(runtime2, "unloadedFontFamilies", () => unloadedFontFamilies), bindRuntimeValue(runtime2, "withoutFontFamilies", () => withoutFontFamilies), bindRuntimeValue(runtime2, "unloadedFontNote", () => unloadedFontNote);
  function usesLinkedGoogleFamily(slides, faces, fonts) {
    return (0, runtime2.collectGoogleSlidesFontRequests)(resolveCurrentFontFaces(slides, fonts), (0, runtime2.carriedFontFamilyMap)(faces, fonts)).size > 0;
  }
  return bindRuntimeValue(runtime2, "toCurrentFonts", () => toCurrentFonts), bindRuntimeValue(runtime2, "normalizeCurrentFontName", () => normalizeCurrentFontName, (value) => {
    normalizeCurrentFontName = value;
  }), bindRuntimeValue(runtime2, "isFontFaceSet", () => isFontFaceSet, (value) => {
    isFontFaceSet = value;
  }), bindRuntimeValue(runtime2, "CURRENT_FONT_PROBE_TIMEOUT_MS", () => CURRENT_FONT_PROBE_TIMEOUT_MS, (value) => {
    CURRENT_FONT_PROBE_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "joinFontNames", () => joinFontNames, (value) => {
    joinFontNames = value;
  }), bindRuntimeValue(runtime2, "usesLinkedGoogleFamily", () => usesLinkedGoogleFamily), bindRuntimeValue(runtime2, "initializeCurrentFonts", () => initializeCurrentFonts, (value) => {
    initializeCurrentFonts = value;
  }), () => {
    currentFontExports = {}, (0, runtime2.defineLiveExports)(currentFontExports, {
      pageFontSet: () => pageFontSet,
      toCurrentFonts: () => toCurrentFonts,
      usesLinkedGoogleFamily: () => usesLinkedGoogleFamily
    }), normalizeCurrentFontName = (family) => (0, runtime2.firstFontFamily)(family).toLowerCase(), isFontFaceSet = (value) => value != null && typeof value.load == "function" && typeof value[Symbol.iterator] == "function" && value.ready !== void 0, CURRENT_FONT_PROBE_TIMEOUT_MS = 2e3, joinFontNames = (names) => names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + String(names[names.length - 1]), initializeCurrentFonts = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeDesignTokenParser)(), (0, runtime2.initializeFontVariants)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeCaptureFallback)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeFontSubstitution)(), (0, runtime2.initializeGoogleSlidesFonts)();
    });
  };
}
export {
  installExportCurrentFonts
};
