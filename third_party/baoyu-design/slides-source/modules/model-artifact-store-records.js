// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelArtifactStoreRecords(runtime2) {
  var reactK_, DECK_STORE_COLLECTION, DECK_META_STORE_KEY, SLIDE_STORE_COLLECTION, FONT_STORE_COLLECTION;
  function fontStoreKey(family) {
    return family.toLowerCase().replace(/ /g, "-");
  }
  function uniqueDeckFontFaces(deck) {
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of [
      ...deck.faces ?? [],
      deck.fonts?.sans,
      deck.fonts?.serif
    ])
      value === void 0 || values.has(fontStoreKey(value.family)) || (values.add(fontStoreKey(value.family)), items.push(value));
    return items;
  }
  function legacyDeckMetadata(title, order, sections, cover, style) {
    let state = {
      v: 3,
      title,
      order: [...order],
      ...cover !== void 0 ? {
        cover
      } : {},
      ...style !== void 0 ? {
        style
      } : {}
    };
    if (sections === void 0)
      return state;
    let state2 = {};
    for (let value of sections) {
      let value2 = value.title !== void 0 ? {
        title: value.title
      } : {};
      state2[value.id] = value.start !== void 0 ? {
        ...value2,
        description: value.description,
        start: value.start,
        before: null
      } : {
        ...value2,
        description: value.description,
        start: null,
        before: value.before ?? null,
        ...value.seq !== void 0 ? {
          seq: value.seq
        } : {}
      };
    }
    return {
      ...state,
      sections: state2
    };
  }
  function cloneFontFaceRecord(face) {
    return {
      ...face
    };
  }
  function serializedSlideRecord(assets, slide, includeNotes) {
    if (includeNotes)
      return {
        html: (0, runtime2.serializeSlideHtml)(assets, slide)
      };
    let { notes, ...remainingProps } = slide;
    return {
      html: (0, runtime2.serializeSlideHtml)(assets, remainingProps),
      ...notes !== void 0 ? {
        notes
      } : {}
    };
  }
  return bindRuntimeValue(runtime2, "reactK_", () => reactK_, (value) => {
    reactK_ = value;
  }), bindRuntimeValue(runtime2, "DECK_STORE_COLLECTION", () => DECK_STORE_COLLECTION, (value) => {
    DECK_STORE_COLLECTION = value;
  }), bindRuntimeValue(runtime2, "DECK_META_STORE_KEY", () => DECK_META_STORE_KEY, (value) => {
    DECK_META_STORE_KEY = value;
  }), bindRuntimeValue(runtime2, "SLIDE_STORE_COLLECTION", () => SLIDE_STORE_COLLECTION, (value) => {
    SLIDE_STORE_COLLECTION = value;
  }), bindRuntimeValue(runtime2, "FONT_STORE_COLLECTION", () => FONT_STORE_COLLECTION, (value) => {
    FONT_STORE_COLLECTION = value;
  }), bindRuntimeValue(runtime2, "fontStoreKey", () => fontStoreKey), bindRuntimeValue(runtime2, "uniqueDeckFontFaces", () => uniqueDeckFontFaces), bindRuntimeValue(runtime2, "legacyDeckMetadata", () => legacyDeckMetadata), bindRuntimeValue(runtime2, "cloneFontFaceRecord", () => cloneFontFaceRecord), bindRuntimeValue(runtime2, "serializedSlideRecord", () => serializedSlideRecord), () => {
    (0, runtime2.initializeUiInputs210)(), reactK_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeFontCatalog)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeHtmlWriter)(), DECK_STORE_COLLECTION = "deck", DECK_META_STORE_KEY = "meta", SLIDE_STORE_COLLECTION = "slides", FONT_STORE_COLLECTION = "fonts";
  };
}
export {
  installModelArtifactStoreRecords
};
