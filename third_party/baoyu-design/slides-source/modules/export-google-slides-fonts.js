// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportGoogleSlidesFonts(runtime2) {
  var googleSlidesFontExports, googleSlidesFontFamilyMap, googleSlidesSystemFontFamilyMap, googleSlidesFontWeight, GOOGLE_SLIDES_FONT_STYLES, equalFontStyle, googleFontStylesheetUrl, rangesContainCodepoints, unicodeRangeCss, GOOGLE_SLIDES_FONT_WAIT_MS, initializeGoogleSlidesFonts;
  function resolveGoogleSlidesFontFamily(family, carriedFamilies) {
    let value = family.toLowerCase();
    return googleSlidesSystemFontFamilyMap.get(value) ?? googleSlidesFontFamilyMap.get(value) ?? carriedFamilies.get(value);
  }
  function googleSlidesBasicFont(fallback) {
    let value = (0, runtime2.webSafeFontFallback)(fallback);
    return value.family === "Tahoma" ? {
      family: "Verdana",
      fallback: value.fallback
    } : value.family === "Brush Script MT" ? (0, runtime2.webSafeFontFallback)(value.fallback) : value;
  }
  function carriedFontFamilyMap(faces, fonts) {
    let entries = /* @__PURE__ */ new Map();
    for (let value of [
      ...faces ?? [],
      ...Object.values(fonts ?? {})
    ])
      value !== void 0 && "href" in value && !entries.has(value.family.toLowerCase()) && entries.set(value.family.toLowerCase(), value.family);
    return entries;
  }
  function toGoogleSlidesFonts(slides, faces, fonts, swapped) {
    return mapGoogleSlidesFontFaces(slides, carriedFontFamilyMap(faces, fonts), swapped);
  }
  function mapGoogleSlidesFontFaces(slides, carriedFamilies, swapped) {
    return (0, runtime2.swapFaces)(slides, (input, options) => {
      if (typeof input == "string")
        return googleSlidesBasicFont(options);
      let value = resolveGoogleSlidesFontFamily(input.family, carriedFamilies);
      return value === void 0 ? googleSlidesBasicFont(options) : value === input.family ? input : {
        ...input,
        family: value
      };
    }, {
      swapped
    });
  }
  function normalizeGoogleSlidesNodeTypography(node) {
    switch (node.kind) {
      case "text":
      case "table": {
        let { letterSpacing: value, ...value2 } = node.style ?? {}, value3 = node.kind === "text" ? value2.fontWeight ?? (0, runtime2.renderingTypeScaleForRole)(node.role).fontWeight : (0, runtime2.renderingTypeScaleForRole)(node.role ?? "body").fontWeight, state = {
          ...node,
          style: {
            ...value2,
            fontWeight: googleSlidesFontWeight(value3)
          }
        };
        return state.kind === "table" && state.header ? {
          ...state,
          headerWeight: googleSlidesFontWeight(state.headerWeight ?? 600)
        } : state;
      }
      case "stack":
      case "grid":
        return {
          ...node,
          children: node.children.map(normalizeGoogleSlidesNodeTypography)
        };
      case "overlay":
        return {
          ...node,
          base: normalizeGoogleSlidesNodeTypography(node.base),
          layers: node.layers.map((input) => ({
            ...input,
            node: normalizeGoogleSlidesNodeTypography(input.node)
          }))
        };
      default:
        return node;
    }
  }
  function toGoogleSlidesWeights(slides) {
    return slides.map((input) => ({
      ...input,
      frames: input.frames.map((input2) => ({
        ...input2,
        node: normalizeGoogleSlidesNodeTypography(input2.node)
      }))
    }));
  }
  function collectGoogleSlidesFontRequests(slides, carriedFamilies) {
    let entries = /* @__PURE__ */ new Map(), callback = (source) => {
      for (let value5 of (0, runtime2.nodeChildren)(source) ?? [])
        callback(value5);
      if (source.kind !== "text" && source.kind !== "table")
        return;
      let value = source.style?.fontFamily;
      if (typeof value != "object" || !carriedFamilies.has(value.family.toLowerCase()) || !runtime2.customFontFamilyPattern.test(value.family))
        return;
      let value2 = entries.get(value.family.toLowerCase()) ?? {
        family: value.family,
        faces: [],
        text: "",
        codePoints: /* @__PURE__ */ new Set([32])
      }, value3 = source.style?.fontStyle === "italic";
      for (let value5 of [
        source.style?.fontWeight ?? 400,
        ...source.kind === "table" && source.header ? [source.headerWeight ?? 600] : []
      ]) {
        let state = {
          weight: googleSlidesFontWeight(value5),
          italic: value3
        };
        value2.faces.some((input) => equalFontStyle(input, state)) || value2.faces.push(state);
      }
      let value4 = source.kind === "text" ? source.text : source.rows.flat().join("");
      value2.text += value4;
      for (let value5 of value4)
        value2.codePoints.add(value5.codePointAt(0));
      entries.set(value.family.toLowerCase(), value2);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        callback(value2.node);
    return entries;
  }
  function installGoogleSlidesFonts(page, fontRequests, timeoutMs) {
    let value = "fonts" in page ? page.fonts : void 0, controller = new AbortController(), value2, items = [], callback = () => {
      controller.abort(), clearTimeout(value2);
      let value3 = items.splice(0);
      for (let value4 of value3)
        value?.delete(value4);
      value3.length > 0 && value?.dispatchEvent(new Event("loadingdone"));
    };
    if (value === void 0 || typeof FontFace != "function" || typeof fetch != "function" || fontRequests.size === 0)
      return {
        ready: Promise.resolve(),
        remove: callback
      };
    let callback2 = async (input) => {
      let value3 = await fetch(input, {
        signal: controller.signal,
        credentials: "omit"
      });
      if (!value3.ok)
        throw Error("fetch " + String(value3.status));
      return value3;
    }, items2 = [];
    try {
      for (let value3 of fontRequests.values()) {
        let family = value3.family, value4 = (0, runtime2.availableFontVariants)(value, family) ?? [], value5 = (0, runtime2.knownFontVariants)(family);
        for (let value6 of GOOGLE_SLIDES_FONT_STYLES) {
          if (value5 !== void 0 && !value5.some((input) => equalFontStyle(input, value6)))
            continue;
          let state = {
            weight: String(value6.weight),
            style: value6.italic ? "italic" : "normal"
          };
          if (value4.some((input) => equalFontStyle(input, value6))) {
            value3.faces.some((input) => equalFontStyle(input, value6)) && value.load((value6.italic ? "italic " : "") + String(value6.weight) + ' 16px "' + family + '"', value3.text).catch(() => []);
            continue;
          }
          items2.push(callback2(googleFontStylesheetUrl(family, value6)).then((input) => input.text()).then((input) => Promise.all((0, runtime2.parseFontFaceDeclarations)(input).filter((input2) => input2.files[0] !== void 0 && rangesContainCodepoints(input2.ranges, value3.codePoints)).map(async (input2) => new FontFace(family, await (await callback2(input2.files[0])).arrayBuffer(), {
            ...state,
            unicodeRange: unicodeRangeCss(input2.ranges)
          }).load()))).then((input) => {
            if (!controller.signal.aborted) {
              for (let value7 of input)
                value.add(value7);
              items.push(...input);
            }
          }).catch(() => {
          }));
        }
      }
    } catch (value3) {
      throw controller.abort(), value3;
    }
    let promise = new Promise((input) => {
      value2 = setTimeout(() => {
        controller.abort(), input();
      }, timeoutMs);
    });
    return {
      ready: Promise.race([
        Promise.all(items2).then(() => {
        }),
        promise
      ]).finally(() => clearTimeout(value2)),
      remove: callback
    };
  }
  async function measuredAsGoogleSlides(page, slides, faces, fonts, assets, { waitMs: options = GOOGLE_SLIDES_FONT_WAIT_MS, fontsReadyMs = runtime2.fontReadyTimeoutMs, swapped } = {}) {
    let value = carriedFontFamilyMap(faces, fonts), value2 = toGoogleSlidesWeights(mapGoogleSlidesFontFaces(slides, value, swapped)), { ready: ready2, remove } = installGoogleSlidesFonts(page, collectGoogleSlidesFontRequests(value2, value), options);
    try {
      return await ready2, await assets(value2, {
        fontsReadyMs
      });
    } finally {
      remove();
    }
  }
  return bindRuntimeValue(runtime2, "googleSlidesFontExports", () => googleSlidesFontExports, (value) => {
    googleSlidesFontExports = value;
  }), bindRuntimeValue(runtime2, "resolveGoogleSlidesFontFamily", () => resolveGoogleSlidesFontFamily), bindRuntimeValue(runtime2, "googleSlidesBasicFont", () => googleSlidesBasicFont), bindRuntimeValue(runtime2, "carriedFontFamilyMap", () => carriedFontFamilyMap), bindRuntimeValue(runtime2, "toGoogleSlidesFonts", () => toGoogleSlidesFonts), bindRuntimeValue(runtime2, "mapGoogleSlidesFontFaces", () => mapGoogleSlidesFontFaces), bindRuntimeValue(runtime2, "normalizeGoogleSlidesNodeTypography", () => normalizeGoogleSlidesNodeTypography), bindRuntimeValue(runtime2, "toGoogleSlidesWeights", () => toGoogleSlidesWeights), bindRuntimeValue(runtime2, "collectGoogleSlidesFontRequests", () => collectGoogleSlidesFontRequests), bindRuntimeValue(runtime2, "installGoogleSlidesFonts", () => installGoogleSlidesFonts), bindRuntimeValue(runtime2, "measuredAsGoogleSlides", () => measuredAsGoogleSlides), bindRuntimeValue(runtime2, "googleSlidesFontFamilyMap", () => googleSlidesFontFamilyMap, (value) => {
    googleSlidesFontFamilyMap = value;
  }), bindRuntimeValue(runtime2, "googleSlidesSystemFontFamilyMap", () => googleSlidesSystemFontFamilyMap, (value) => {
    googleSlidesSystemFontFamilyMap = value;
  }), bindRuntimeValue(runtime2, "googleSlidesFontWeight", () => googleSlidesFontWeight, (value) => {
    googleSlidesFontWeight = value;
  }), bindRuntimeValue(runtime2, "GOOGLE_SLIDES_FONT_STYLES", () => GOOGLE_SLIDES_FONT_STYLES, (value) => {
    GOOGLE_SLIDES_FONT_STYLES = value;
  }), bindRuntimeValue(runtime2, "equalFontStyle", () => equalFontStyle, (value) => {
    equalFontStyle = value;
  }), bindRuntimeValue(runtime2, "googleFontStylesheetUrl", () => googleFontStylesheetUrl, (value) => {
    googleFontStylesheetUrl = value;
  }), bindRuntimeValue(runtime2, "rangesContainCodepoints", () => rangesContainCodepoints, (value) => {
    rangesContainCodepoints = value;
  }), bindRuntimeValue(runtime2, "unicodeRangeCss", () => unicodeRangeCss, (value) => {
    unicodeRangeCss = value;
  }), bindRuntimeValue(runtime2, "GOOGLE_SLIDES_FONT_WAIT_MS", () => GOOGLE_SLIDES_FONT_WAIT_MS, (value) => {
    GOOGLE_SLIDES_FONT_WAIT_MS = value;
  }), bindRuntimeValue(runtime2, "initializeGoogleSlidesFonts", () => initializeGoogleSlidesFonts, (value) => {
    initializeGoogleSlidesFonts = value;
  }), () => {
    googleSlidesFontExports = {}, (0, runtime2.defineLiveExports)(googleSlidesFontExports, {
      linkedFamilies: () => carriedFontFamilyMap,
      linkedFamilyUse: () => collectGoogleSlidesFontRequests,
      measuredAsGoogleSlides: () => measuredAsGoogleSlides,
      sheetUrl: () => googleFontStylesheetUrl,
      toGoogleSlidesFonts: () => toGoogleSlidesFonts
    }), googleSlidesFontWeight = (weight) => weight >= 600 ? 700 : 400, equalFontStyle = (left, right) => left.weight === right.weight && left.italic === right.italic, googleFontStylesheetUrl = (family, style) => "https://fonts.googleapis.com/css2?family=" + family.replace(/ /g, "+") + ":ital,wght@" + (style.italic ? "1" : "0") + "," + String(style.weight) + "&display=swap", rangesContainCodepoints = (ranges, codepoints) => [...codepoints].some((input) => ranges.some(([input2, input3]) => input >= input2 && input <= input3)), unicodeRangeCss = (ranges) => ranges.map(([input, input2]) => "U+" + input.toString(16) + (input2 > input ? "-" + input2.toString(16) : "")).join(", "), GOOGLE_SLIDES_FONT_WAIT_MS = 4e3, initializeGoogleSlidesFonts = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeFontVariants)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeFontFaceParser)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeFontSubstitution)(), (0, runtime2.initializeGoogleFontFamilies)(), (0, runtime2.initializeCaptureFallback)(), googleSlidesFontFamilyMap = new Map(runtime2.GOOGLE_SLIDES_FONT_FAMILIES.map((input) => [
        input.toLowerCase(),
        input
      ])), googleSlidesSystemFontFamilyMap = new Map([
        "Arial",
        "Georgia",
        "Times New Roman",
        "Courier New",
        "Verdana",
        "Trebuchet MS",
        "Impact",
        "Comic Sans MS",
        "Calibri",
        "Cambria"
      ].map((input) => [input.toLowerCase(), input])), GOOGLE_SLIDES_FONT_STYLES = [
        {
          weight: 400,
          italic: !1
        },
        {
          weight: 700,
          italic: !1
        },
        {
          weight: 400,
          italic: !0
        },
        {
          weight: 700,
          italic: !0
        }
      ];
    });
  };
}
export {
  installExportGoogleSlidesFonts
};
