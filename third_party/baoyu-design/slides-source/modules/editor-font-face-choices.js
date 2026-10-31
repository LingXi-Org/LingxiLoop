// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorFontFaceChoices(runtime2) {
  var DECK_FONT_LIMIT_MESSAGE, FONT_FALLBACK_OPTIONS, BUILTIN_FONT_FACE_CHOICES, findCarriedFontFace, fontFaceMenuLabel, sameStoredFontFace;
  function usedDeckFontFamilies(slides) {
    let values = /* @__PURE__ */ new Set(), callback = (input) => {
      let value = input.style?.fontFamily;
      typeof value == "object" && values.add(value.family.toLowerCase());
      for (let value2 of (0, runtime2.nodeChildren)(input) ?? [])
        callback(value2);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        callback(value2.node);
    return values;
  }
  function canCarryAnotherFontFace(faces, usedFamilies) {
    return removableCarriedFontFaces(faces, usedFamilies) !== null;
  }
  function removableCarriedFontFaces(faces, usedFamilies) {
    let value = faces ?? [];
    if (value.length < runtime2.maxDeckFontFaces)
      return [];
    let value2 = value.filter((input) => !usedFamilies.has(input.family.toLowerCase()));
    return value.length - value2.length < runtime2.maxDeckFontFaces ? value2 : null;
  }
  function addCarriedFontFace(faces, added, removable, usedFamilies) {
    let value = faces.filter((input) => !(removable.some((input2) => sameStoredFontFace(input2, input)) && !usedFamilies.has(input.family.toLowerCase())));
    return value.some((input) => sameStoredFontFace(input, added)) || value.push(added), value.length <= runtime2.maxDeckFontFaces ? value : null;
  }
  function restoreCarriedFontFaces(faces, removed, restored, usedFamilies) {
    let value = usedFamilies.has(removed.family.toLowerCase()) ? [...faces] : faces.filter((input) => !sameStoredFontFace(input, removed));
    for (let value2 of restored)
      value.length < runtime2.maxDeckFontFaces && !value.some((input) => sameStoredFontFace(input, value2)) && value.push(value2);
    return value;
  }
  function fontFamilyOptions(faces, value, includeAuto = !1) {
    let value2 = faces ?? [], value3 = value2.map((input) => ({
      value: "face:" + input.family,
      label: input.family,
      labelStyle: (0, runtime2.fontFamilyCss)({
        family: input.family,
        fallback: "sans"
      })
    }));
    typeof value == "object" && !findCarriedFontFace(value2, value.family) && !BUILTIN_FONT_FACE_CHOICES.some((input) => input.family.toLowerCase() === value.family.toLowerCase()) && value3.push({
      value: "face:" + value.family,
      label: value.family,
      labelStyle: (0, runtime2.fontFamilyCss)(value)
    });
    for (let value4 of FONT_FALLBACK_OPTIONS)
      value3.push({
        ...value4,
        labelStyle: (0, runtime2.fontFamilyCss)(value4.value)
      });
    for (let value4 of BUILTIN_FONT_FACE_CHOICES)
      findCarriedFontFace(value2, value4.family) || value3.push({
        value: "face:" + value4.family,
        label: value4.family,
        labelStyle: (0, runtime2.fontFamilyCss)({
          family: value4.family,
          fallback: value4.fallback
        }),
        ...value4.google && includeAuto ? {
          disabled: !0,
          title: DECK_FONT_LIMIT_MESSAGE
        } : {}
      });
    return value3;
  }
  function fontFamilyPatchFromChoice(value, faces, current) {
    if (value === "")
      return {
        fontFamily: void 0
      };
    if (!value.startsWith("face:"))
      return {
        fontFamily: value
      };
    let value2 = value.slice(5), value3 = typeof current == "object" && current.family.toLowerCase() === value2.toLowerCase() ? current : void 0, value4 = value3?.fallback, value5 = value3?.webSafe !== void 0 ? {
      webSafe: value3.webSafe
    } : {}, value6 = findCarriedFontFace(faces ?? [], value2), value7 = BUILTIN_FONT_FACE_CHOICES.find((input) => input.family.toLowerCase() === value2.toLowerCase());
    return value6 ? {
      fontFamily: {
        family: value6.family,
        fallback: value4 ?? value7?.fallback ?? "sans",
        ...value5
      }
    } : value7 === void 0 ? {
      fontFamily: {
        family: value2,
        fallback: value4 ?? "sans",
        ...value5
      }
    } : {
      fontFamily: {
        family: value7.family,
        fallback: value4 ?? value7.fallback,
        ...value5
      },
      ...value7.google ? {
        face: {
          family: value7.family,
          href: (0, runtime2.googleFontStylesheetUrl_MG0)(value7.family)
        }
      } : {}
    };
  }
  function fontFamilyChoiceValue(family, faces) {
    return family === void 0 || typeof family == "string" ? family ?? "" : "face:" + (findCarriedFontFace(faces ?? [], family.family)?.family ?? BUILTIN_FONT_FACE_CHOICES.find((input) => input.family.toLowerCase() === family.family.toLowerCase())?.family ?? family.family);
  }
  return bindRuntimeValue(runtime2, "DECK_FONT_LIMIT_MESSAGE", () => DECK_FONT_LIMIT_MESSAGE, (value) => {
    DECK_FONT_LIMIT_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "FONT_FALLBACK_OPTIONS", () => FONT_FALLBACK_OPTIONS, (value) => {
    FONT_FALLBACK_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "BUILTIN_FONT_FACE_CHOICES", () => BUILTIN_FONT_FACE_CHOICES, (value) => {
    BUILTIN_FONT_FACE_CHOICES = value;
  }), bindRuntimeValue(runtime2, "findCarriedFontFace", () => findCarriedFontFace, (value) => {
    findCarriedFontFace = value;
  }), bindRuntimeValue(runtime2, "fontFaceMenuLabel", () => fontFaceMenuLabel, (value) => {
    fontFaceMenuLabel = value;
  }), bindRuntimeValue(runtime2, "usedDeckFontFamilies", () => usedDeckFontFamilies), bindRuntimeValue(runtime2, "canCarryAnotherFontFace", () => canCarryAnotherFontFace), bindRuntimeValue(runtime2, "sameStoredFontFace", () => sameStoredFontFace, (value) => {
    sameStoredFontFace = value;
  }), bindRuntimeValue(runtime2, "removableCarriedFontFaces", () => removableCarriedFontFaces), bindRuntimeValue(runtime2, "addCarriedFontFace", () => addCarriedFontFace), bindRuntimeValue(runtime2, "restoreCarriedFontFaces", () => restoreCarriedFontFaces), bindRuntimeValue(runtime2, "fontFamilyOptions", () => fontFamilyOptions), bindRuntimeValue(runtime2, "fontFamilyPatchFromChoice", () => fontFamilyPatchFromChoice), bindRuntimeValue(runtime2, "fontFamilyChoiceValue", () => fontFamilyChoiceValue), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeRenderingTheme)(), DECK_FONT_LIMIT_MESSAGE = "演示文稿最多容纳 " + String(runtime2.maxDeckFontFaces) + " 种字体，当前均在使用中", FONT_FALLBACK_OPTIONS = [
      {
        value: "sans",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "无衬线字体",
          id: "iG5uxeDWAG"
        })
      },
      {
        value: "serif",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "衬线字体",
          id: "ZitJ/exOJE"
        })
      },
      {
        value: "mono",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "等宽字体",
          id: "ASQQ5ydSuZ"
        })
      },
      {
        value: "helvetica",
        label: (0, runtime2.literalMessage)("Helvetica")
      }
    ], BUILTIN_FONT_FACE_CHOICES = [
      ...runtime2.webSafeFontCatalog.flatMap((input) => {
        let value = (0, runtime2.resolveFontFamilyAlias)(input.family);
        return value && !runtime2.fontFamilyFallbackValues.includes(input.family.toLowerCase()) ? [
          {
            family: value.family,
            fallback: value.fallback,
            google: !1
          }
        ] : [];
      }),
      ...runtime2.googleFontCatalog.map((input) => ({
        family: input.family,
        fallback: input.generic,
        google: !0
      }))
    ].sort((input, options) => input.family.localeCompare(options.family)), findCarriedFontFace = (input, options) => input.find((input2) => (0, runtime2.fontStoreKey)(input2.family) === (0, runtime2.fontStoreKey)(options)), fontFaceMenuLabel = (input, options) => findCarriedFontFace(input ?? [], options.family) !== void 0, sameStoredFontFace = (left, right) => (0, runtime2.fontStoreKey)(left.family) === (0, runtime2.fontStoreKey)(right.family);
  };
}
export {
  installEditorFontFaceChoices
};
