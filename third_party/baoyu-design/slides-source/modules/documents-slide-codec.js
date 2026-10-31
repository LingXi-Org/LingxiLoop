// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsSlideCodec(runtime2) {
  var DECK_HTML_DOCUMENT_PATH, DECK_ASSETS_DOCUMENT_PATH, MAX_SYNC_DOCUMENT_BYTES, MAX_SYNC_TOTAL_BYTES, SYNC_RECORD_ID_PATTERN, SLIDE_READ_FAILED_DIAGNOSTIC, decomposedSlideRecordCache, decomposedDeckMetaCache, INVALID_FONT_PLACEHOLDER_DATA_URI, SLIDE_HTML_HOLD_TIMEOUT_MS, EMPTY_AWAITING_SLIDE_LIST, bytesToKilobytes, defaultSlideDocumentCodec, slideDocumentCodec, slideHtmlHold, awaitingSlideHtml, slideDocumentCodecByDocument;
  function cachedDecomposeDeckMeta(fontFace) {
    let cached = decomposedDeckMetaCache.get(fontFace);
    return cached === void 0 && decomposedDeckMetaCache.set(fontFace, cached = (0, runtime2.cloneFontFaceRecord)(fontFace)), cached;
  }
  function cachedDecomposeSlideHtml(content, slide, inlineNotes) {
    let cached = decomposedSlideRecordCache.get(slide);
    if (cached !== void 0 && cached.theme === content.theme && cached.assets === content.assets && cached.inline === inlineNotes)
      return cached.rec;
    let record = (0, runtime2.serializedSlideRecord)(content, slide, inlineNotes);
    return decomposedSlideRecordCache.set(slide, {
      theme: content.theme,
      assets: content.assets,
      inline: inlineNotes,
      rec: record
    }), record;
  }
  function restoreDanglingSlideOrder(order, carry) {
    let dangling = carry?.dangling ?? [];
    if (dangling.length === 0)
      return [...order];
    let head = {}, next = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set(), tail = head;
    for (let value of order)
      seen.has(value) || (seen.add(value), next.set(tail, value), tail = value);
    for (let { id: value, after: value2 } of dangling) {
      if (seen.has(value))
        continue;
      let anchor = value2 === null ? head : seen.has(value2) ? value2 : tail, following = next.get(anchor);
      next.set(anchor, value), following === void 0 ? tail = value : next.set(value, following), seen.add(value);
    }
    let restoredOrder = [];
    for (let value = next.get(head); value !== void 0; value = next.get(value))
      restoredOrder.push(value);
    return restoredOrder;
  }
  function reuseEqualDocumentRecord(previousRecords, path, record) {
    let prior = previousRecords?.get(path);
    return prior !== void 0 && (prior === record || (0, runtime2.documentRecordsEqual)(prior, record)) ? prior : record;
  }
  function offsetHtmlDiagnosticLines(diagnostic, lineOffset) {
    let adjustLine = (input) => Math.max(1, input - lineOffset), message = diagnostic.message.split('"').map((input, options) => options % 2 === 0 ? input.replace(/\b(\d+):(\d+)\b/g, (input2, options2, context) => String(adjustLine(Number(options2))) + ":" + context) : input).join('"');
    return (0, runtime2.formatCompileDiagnostic)({
      line: adjustLine(diagnostic.line),
      col: diagnostic.col,
      message
    });
  }
  function optionalString(input) {
    if (typeof input == "string")
      return input;
  }
  function createSlideDocumentCodec(options = {}) {
    let parsedSlideCache = /* @__PURE__ */ new Map(), heldSlideHtml = /* @__PURE__ */ new Map(), slideHtmlErrors = /* @__PURE__ */ new Map(), hasMissingSlides = !1, missingSlideCount = 0, outline = EMPTY_AWAITING_SLIDE_LIST, seenSlideIds = /* @__PURE__ */ new Set(), assets = {}, rawDeckMeta, hideMovedDeck = !1, notesBySlide = /* @__PURE__ */ new Map(), missingNotesSince = /* @__PURE__ */ new Map(), notesStreamSettled = !1, now = options.now ?? (() => Date.now()), hasShownSlides = !1, awaitingSlides = /* @__PURE__ */ new Set();
    function decompose(input, options2, context) {
      let content = input.content;
      assets = content.assets;
      let value = hideMovedDeck ? [] : content.order;
      value.length > 0 && (hasShownSlides = !0);
      let entries = /* @__PURE__ */ new Map();
      for (let value4 of (0, runtime2.uniqueDeckFontFaces)(content))
        entries.set(runtime2.FONT_STORE_COLLECTION + "/" + (0, runtime2.fontStoreKey)(value4.family), reuseEqualDocumentRecord(options2, runtime2.FONT_STORE_COLLECTION + "/" + (0, runtime2.fontStoreKey)(value4.family), cachedDecomposeDeckMeta(value4)));
      let values = new Set(context?.inlineNotes);
      for (let value4 of value) {
        let value5 = content.slides[value4];
        if (value5 === void 0)
          continue;
        typeof value5.notes == "string" ? (notesBySlide.set(value4, value5.notes), missingNotesSince.delete(value4)) : notesStreamSettled && value5.notes === void 0 ? notesBySlide.delete(value4) : !notesStreamSettled && value5.notes === void 0 && notesBySlide.has(value4) && !missingNotesSince.has(value4) && missingNotesSince.set(value4, now());
        let value6 = runtime2.SLIDE_STORE_COLLECTION + "/" + value4, value7 = reuseEqualDocumentRecord(options2, value6, cachedDecomposeSlideHtml(content, value5, values.has(value4)));
        if (slideHtmlErrors.has(value4)) {
          let entry = heldSlideHtml.get(value4);
          if (entry === void 0)
            heldSlideHtml.set(value4, optionalString(value7.html) ?? "");
          else if (entry !== value7.html) {
            let entries2 = new Map(slideHtmlErrors);
            entries2.delete(value4), slideHtmlErrors = entries2;
          }
        }
        entries.set(value6, value7);
      }
      (0, runtime2.decomposeCommentDocuments)(input.comments, options2, entries);
      let value2 = restoreDanglingSlideOrder(value, context), value3 = (hideMovedDeck ? void 0 : content.cover) ?? (context?.cover !== void 0 && value2.includes(context.cover) ? context.cover : void 0);
      return entries.set(DECK_HTML_DOCUMENT_PATH, reuseEqualDocumentRecord(options2, DECK_HTML_DOCUMENT_PATH, (0, runtime2.legacyDeckMetadata)(input.title, value2, content.sections, value3, content.style))), entries;
    }
    function parseSlideRecord(input, options2, context, value, extra, detail, argument) {
      let value2 = (argument ?? "") + "\0" + value + "\0" + options2 + "\0" + extra, value3 = parsedSlideCache.get(value2) ?? detail.get(value2);
      if (value3 === void 0)
        try {
          let value4 = `<!doctype html><html>
` + input + `<body>
`, value5 = (0, runtime2.compileSlideHtml)(value4 + extra + `
</body></html>`, {
            sectionId: value,
            ...argument !== void 0 ? {
              lists: argument
            } : {}
          }), value6 = value4.split(`
`).length - 1, value7 = Array.isArray(value5.content.order) ? value5.content.order : [], value8 = value5.content.slides ?? {}, value9 = Object.hasOwn(value8, value) ? value8[value] : void 0, value10 = value5.errors[0] !== void 0 ? offsetHtmlDiagnosticLines(value5.errors[0], value6) : void 0;
          value10 === void 0 && value7.length !== 1 && (value10 = "a slide record holds exactly one <section> (found " + String(value7.length) + ")");
          let value11 = (Array.isArray(value5.content.faces) ? value5.content.faces.length : 0) - context;
          value10 === void 0 && (value5.hoisted > 0 || value5.title !== void 0 || value11 > 0) && (value10 = "a slide record may not carry <title>, <link> or <style> (typefaces are fonts/<family> documents)"), value3 = {
            slide: value9,
            ...value10 !== void 0 ? {
              error: value10
            } : {}
          };
        } catch (error) {
          console.error("slides: slide " + value + " could not be parsed (" + (error instanceof Error ? error.name : "a throw") + ")"), value3 = {
            slide: void 0,
            error: SLIDE_READ_FAILED_DIAGNOSTIC
          };
        }
      return detail.set(value2, value3), value3;
    }
    function compose(input, options2) {
      let entry = input.get(DECK_HTML_DOCUMENT_PATH);
      rawDeckMeta = entry, (0, runtime2.publishDesignSystems)(input.get(DECK_ASSETS_DOCUMENT_PATH)), (0, runtime2.setDeckDesignSystemsRecord)(input.get(DECK_ASSETS_DOCUMENT_PATH));
      let listedIds = /* @__PURE__ */ new Set(), items = [], items2 = [], items3 = [], items4 = [], index4 = 0, value = null, value2 = options.hideMovedDeck === !0 && !hasShownSlides && (0, runtime2.readMovedToMarker)(entry) !== null;
      hideMovedDeck = value2;
      for (let value12 of Array.isArray(entry?.order) ? entry.order : [])
        typeof value12 != "string" || listedIds.has(value12) || (listedIds.add(value12), value2 ? items2.push({
          id: value12,
          after: value
        }) : !SYNC_RECORD_ID_PATTERN.test(value12) || items.length >= runtime2.maxDeckSlides ? (items2.push({
          id: value12,
          after: value
        }), index4 += 1) : input.has(runtime2.SLIDE_STORE_COLLECTION + "/" + value12) ? (items.push(value12), items4.length < runtime2.maxDeckSlides && items4.push({
          id: value12,
          here: !0,
          seenBefore: seenSlideIds.has(value12)
        })) : (items2.push({
          id: value12,
          after: value
        }), items3.push(runtime2.SLIDE_STORE_COLLECTION + "/" + value12), items4.length < runtime2.maxDeckSlides && items4.push({
          id: value12,
          here: !1,
          seenBefore: seenSlideIds.has(value12)
        })), value = value12);
      outline = items4, index4 > 0 && console.warn("slides: " + String(index4) + " order entr" + (index4 === 1 ? "y" : "ies") + " not shown (id outside [A-Za-z0-9_-]{1,64} or past " + String(runtime2.maxDeckSlides) + " slides); kept in the order");
      let entries = /* @__PURE__ */ new Map();
      for (let [value12, value13] of [...input].filter(([input2]) => input2.startsWith(runtime2.FONT_STORE_COLLECTION + "/")).sort(([input2], [options3]) => input2 < options3 ? -1 : 1)) {
        if (typeof value13.family != "string")
          continue;
        let value14 = (0, runtime2.fontStoreKey)(value13.family);
        (!entries.has(value14) || (0, runtime2.basenameDocumentPath)(value12) === value14) && entries.set(value14, value13);
      }
      let value3 = [...entries].sort(([input2], [options3]) => input2 < options3 ? -1 : 1).map(([, input2]) => input2), value4 = (0, runtime2.normalizeFontFaces)(value3), value5 = (value4 ?? []).map((input2) => input2.family), value6 = (0, runtime2.serializeDeckHead)(value5.length > 0 ? {
        faces: value5.map((input2) => ({
          family: input2,
          src: INVALID_FONT_PLACEHOLDER_DATA_URI
        }))
      } : {}, ""), value7 = /* @__PURE__ */ Object.create(null), items5 = [], entries2 = /* @__PURE__ */ new Map(), entries3 = /* @__PURE__ */ new Map(), value8 = (0, runtime2.readMovedToMarker)(entry) !== null;
      notesStreamSettled = value8;
      let value9 = (0, runtime2.normalizeListRenderingMode)(entry?.lists);
      items.forEach((input2) => {
        seenSlideIds.add(input2);
        let entry2 = input.get(runtime2.SLIDE_STORE_COLLECTION + "/" + input2), value12 = optionalString(entry2.html), value13 = value12 !== void 0 ? parseSlideRecord(value6, value5.join(""), value5.length, input2, value12, entries3, value9) : void 0, value14 = optionalString(entry2.notes), value15 = value13?.slide?.notes, value16 = value14 ?? (typeof value15 == "string" ? value15 : void 0);
        if (value16 !== void 0 ? (notesBySlide.set(input2, value16), missingNotesSince.delete(input2)) : value8 ? (missingNotesSince.has(input2) && (now() - missingNotesSince.get(input2) > SLIDE_HTML_HOLD_TIMEOUT_MS && notesBySlide.delete(input2), missingNotesSince.delete(input2)), value14 = notesBySlide.get(input2)) : notesBySlide.has(input2) && !missingNotesSince.has(input2) && missingNotesSince.set(input2, now()), value13?.slide === void 0) {
          entries2.set(input2, value12 === void 0 ? "the record has no html string" : value13?.error ?? "no readable <section>"), value7[input2] = {
            v: 1,
            id: input2,
            bg: "#ffffff",
            ...value14 !== void 0 ? {
              notes: value14
            } : {}
          };
          return;
        }
        value14 !== void 0 ? value7[input2] = {
          ...value13.slide,
          notes: value14
        } : (value7[input2] = value13.slide, value13.slide.notes !== void 0 && items5.push(input2)), value13.error !== void 0 && entries2.set(input2, value13.error);
      }), parsedSlideCache = entries3, slideHtmlErrors = entries2, hasMissingSlides = items3.length > 0, missingSlideCount = items3.filter((input2) => !seenSlideIds.has((0, runtime2.basenameDocumentPath)(input2))).length, heldSlideHtml = /* @__PURE__ */ new Map();
      for (let value12 of [...awaitingSlides])
        queueMicrotask(value12);
      let value10 = optionalString(entry?.cover), value11 = value10 !== void 0 && items2.some((input2) => input2.id === value10) ? value10 : void 0;
      return {
        title: optionalString(entry?.title) ?? "",
        content: {
          theme: "neutral",
          format: "html",
          ...value10 !== void 0 && items.includes(value10) ? {
            cover: value10
          } : {},
          order: items,
          slides: value7,
          assets,
          ...value4 !== void 0 ? {
            faces: value3
          } : {},
          ...entry !== void 0 && typeof entry.sections == "object" && entry.sections !== null && !Array.isArray(entry.sections) ? {
            sections: entry.sections
          } : {},
          ...value9 !== void 0 ? {
            lists: value9
          } : {},
          ...entry?.style !== void 0 ? {
            style: entry.style
          } : {}
        },
        comments: (0, runtime2.composeCommentDocuments)(input),
        carry: {
          dangling: items2,
          inlineNotes: items5,
          ...value11 !== void 0 ? {
            cover: value11
          } : {}
        },
        dangling: items3
      };
    }
    return {
      codec: {
        collections: [
          runtime2.FONT_STORE_COLLECTION,
          runtime2.SLIDE_STORE_COLLECTION,
          "comments",
          "deck"
        ],
        metaPath: DECK_HTML_DOCUMENT_PATH,
        decompose,
        compose,
        refuse: validateSyncDocumentSize
      },
      slideHtmlHold: (input) => slideHtmlErrors.get(input),
      awaitingSlides: () => hasMissingSlides,
      awaitedSlideCount: () => missingSlideCount,
      slideOutline: () => outline,
      hidingMovedDeck: () => hideMovedDeck,
      metaFields: () => rawDeckMeta,
      subscribeMeta(input) {
        return awaitingSlides.add(input), () => void awaitingSlides.delete(input);
      },
      reset() {
        rawDeckMeta = void 0, hasShownSlides = !1, hideMovedDeck = !1, notesBySlide.clear(), missingNotesSince.clear(), notesStreamSettled = !1, parsedSlideCache = /* @__PURE__ */ new Map(), slideHtmlErrors = /* @__PURE__ */ new Map(), hasMissingSlides = !1, missingSlideCount = 0, outline = EMPTY_AWAITING_SLIDE_LIST, seenSlideIds.clear(), heldSlideHtml = /* @__PURE__ */ new Map(), assets = {};
      }
    };
  }
  function validateSyncDocumentSize(path, record, totalBytes) {
    let bytes = (0, runtime2.estimateEmbeddedJsonBytes)(record);
    if (bytes > MAX_SYNC_DOCUMENT_BYTES)
      return path.startsWith(runtime2.SLIDE_STORE_COLLECTION + "/") ? "Slide “" + (0, runtime2.basenameDocumentPath)(path) + "” is too large to sync (" + bytesToKilobytes(bytes) + " KB > 240 KB). Drop images onto the slide so they upload as assets, or move some content to another slide." : path.startsWith(runtime2.FONT_STORE_COLLECTION + "/") ? "The typeface “" + (optionalString(record.family) ?? (0, runtime2.basenameDocumentPath)(path)) + "” is too large to sync (" + bytesToKilobytes(bytes) + " KB > 240 KB). Link it from Google Fonts or embed a smaller file." : "此项更改过大，无法同步（" + bytesToKilobytes(bytes) + " KB).";
    if (totalBytes > MAX_SYNC_TOTAL_BYTES) {
      let value = path.slice(0, path.indexOf("/"));
      return value === runtime2.SLIDE_STORE_COLLECTION ? "幻灯片内容超过 2 MB 实时同步上限。请将图片拖入幻灯片以作为资源上传，或拆分文稿。" : "此演示文稿的" + (value === runtime2.FONT_STORE_COLLECTION ? "typefaces" : value === "deck" ? "文稿元数据" : value) + "超过 2 MB 实时同步上限。";
    }
  }
  function registerSlideDocumentCodec(document2, codec) {
    slideDocumentCodecByDocument.set(document2, codec);
  }
  function getSlideDocumentCodec(document2) {
    return slideDocumentCodecByDocument.get(document2) ?? defaultSlideDocumentCodec;
  }
  return bindRuntimeValue(runtime2, "SLIDE_READ_FAILED_DIAGNOSTIC", () => SLIDE_READ_FAILED_DIAGNOSTIC, (value) => {
    SLIDE_READ_FAILED_DIAGNOSTIC = value;
  }), bindRuntimeValue(runtime2, "DECK_HTML_DOCUMENT_PATH", () => DECK_HTML_DOCUMENT_PATH, (value) => {
    DECK_HTML_DOCUMENT_PATH = value;
  }), bindRuntimeValue(runtime2, "DECK_ASSETS_DOCUMENT_PATH", () => DECK_ASSETS_DOCUMENT_PATH, (value) => {
    DECK_ASSETS_DOCUMENT_PATH = value;
  }), bindRuntimeValue(runtime2, "MAX_SYNC_DOCUMENT_BYTES", () => MAX_SYNC_DOCUMENT_BYTES, (value) => {
    MAX_SYNC_DOCUMENT_BYTES = value;
  }), bindRuntimeValue(runtime2, "MAX_SYNC_TOTAL_BYTES", () => MAX_SYNC_TOTAL_BYTES, (value) => {
    MAX_SYNC_TOTAL_BYTES = value;
  }), bindRuntimeValue(runtime2, "SYNC_RECORD_ID_PATTERN", () => SYNC_RECORD_ID_PATTERN, (value) => {
    SYNC_RECORD_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "decomposedSlideRecordCache", () => decomposedSlideRecordCache, (value) => {
    decomposedSlideRecordCache = value;
  }), bindRuntimeValue(runtime2, "decomposedDeckMetaCache", () => decomposedDeckMetaCache, (value) => {
    decomposedDeckMetaCache = value;
  }), bindRuntimeValue(runtime2, "cachedDecomposeDeckMeta", () => cachedDecomposeDeckMeta), bindRuntimeValue(runtime2, "cachedDecomposeSlideHtml", () => cachedDecomposeSlideHtml), bindRuntimeValue(runtime2, "restoreDanglingSlideOrder", () => restoreDanglingSlideOrder), bindRuntimeValue(runtime2, "reuseEqualDocumentRecord", () => reuseEqualDocumentRecord), bindRuntimeValue(runtime2, "offsetHtmlDiagnosticLines", () => offsetHtmlDiagnosticLines), bindRuntimeValue(runtime2, "optionalString", () => optionalString), bindRuntimeValue(runtime2, "INVALID_FONT_PLACEHOLDER_DATA_URI", () => INVALID_FONT_PLACEHOLDER_DATA_URI, (value) => {
    INVALID_FONT_PLACEHOLDER_DATA_URI = value;
  }), bindRuntimeValue(runtime2, "SLIDE_HTML_HOLD_TIMEOUT_MS", () => SLIDE_HTML_HOLD_TIMEOUT_MS, (value) => {
    SLIDE_HTML_HOLD_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "EMPTY_AWAITING_SLIDE_LIST", () => EMPTY_AWAITING_SLIDE_LIST, (value) => {
    EMPTY_AWAITING_SLIDE_LIST = value;
  }), bindRuntimeValue(runtime2, "createSlideDocumentCodec", () => createSlideDocumentCodec), bindRuntimeValue(runtime2, "bytesToKilobytes", () => bytesToKilobytes, (value) => {
    bytesToKilobytes = value;
  }), bindRuntimeValue(runtime2, "validateSyncDocumentSize", () => validateSyncDocumentSize), bindRuntimeValue(runtime2, "defaultSlideDocumentCodec", () => defaultSlideDocumentCodec, (value) => {
    defaultSlideDocumentCodec = value;
  }), bindRuntimeValue(runtime2, "slideDocumentCodec", () => slideDocumentCodec, (value) => {
    slideDocumentCodec = value;
  }), bindRuntimeValue(runtime2, "slideHtmlHold", () => slideHtmlHold, (value) => {
    slideHtmlHold = value;
  }), bindRuntimeValue(runtime2, "awaitingSlideHtml", () => awaitingSlideHtml, (value) => {
    awaitingSlideHtml = value;
  }), bindRuntimeValue(runtime2, "slideDocumentCodecByDocument", () => slideDocumentCodecByDocument, (value) => {
    slideDocumentCodecByDocument = value;
  }), bindRuntimeValue(runtime2, "registerSlideDocumentCodec", () => registerSlideDocumentCodec), bindRuntimeValue(runtime2, "getSlideDocumentCodec", () => getSlideDocumentCodec), () => {
    (0, runtime2.initializeDesignTokenParser)(), (0, runtime2.initializeDesignSystemsStore)(), (0, runtime2.initializeHtmlWriter)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeSlideModel)(), DECK_HTML_DOCUMENT_PATH = runtime2.DECK_STORE_COLLECTION + "/" + runtime2.DECK_META_STORE_KEY, DECK_ASSETS_DOCUMENT_PATH = runtime2.DECK_STORE_COLLECTION + "/" + runtime2.designSystemsCapabilityName, MAX_SYNC_DOCUMENT_BYTES = runtime2.maxDeckFontCssBytes, MAX_SYNC_TOTAL_BYTES = runtime2.maxDeckAssetBytes, SYNC_RECORD_ID_PATTERN = /^[\w-]{1,64}$/, SLIDE_READ_FAILED_DIAGNOSTIC = "编辑器读取此页失败", decomposedSlideRecordCache = /* @__PURE__ */ new WeakMap(), decomposedDeckMetaCache = /* @__PURE__ */ new WeakMap(), INVALID_FONT_PLACEHOLDER_DATA_URI = "data:font/woff2;base64,AAAA", SLIDE_HTML_HOLD_TIMEOUT_MS = 6e4, EMPTY_AWAITING_SLIDE_LIST = [], bytesToKilobytes = (input) => String(Math.ceil(input / 1024)), defaultSlideDocumentCodec = createSlideDocumentCodec(), slideDocumentCodec = defaultSlideDocumentCodec.codec, slideHtmlHold = defaultSlideDocumentCodec.slideHtmlHold, awaitingSlideHtml = defaultSlideDocumentCodec.awaitingSlides, slideDocumentCodecByDocument = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installDocumentsSlideCodec
};
