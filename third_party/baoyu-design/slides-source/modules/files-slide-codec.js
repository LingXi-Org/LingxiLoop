// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSlideCodec(runtime2) {
  var optionalFileRecordString, defaultSlidesFileCodec;
  function composeSlidesFilesEnvelope(codec, fileEnvelope, carry) {
    let records = /* @__PURE__ */ new Map(), order = [];
    for (let [value2, value3] of fileEnvelope.files) {
      let value4 = (0, runtime2.slideIdFromFilePath)(value2);
      if (value4 === void 0)
        continue;
      order.push(value4);
      let value5 = fileEnvelope.notes?.[value4];
      records.set(runtime2.SLIDE_STORE_COLLECTION + "/" + value4, {
        html: value3,
        ...value5 !== void 0 ? {
          notes: value5
        } : {}
      });
    }
    for (let [value2, value3] of Object.entries(fileEnvelope.index.faces))
      records.set(runtime2.FONT_STORE_COLLECTION + "/" + value2, {
        ...value3
      });
    let index4 = fileEnvelope.index;
    records.set(runtime2.DECK_HTML_DOCUMENT_PATH, {
      v: 3,
      title: index4.title,
      order: (0, runtime2.mergeSlideOrder)(index4.order, order),
      ...Object.keys(index4.sections).length > 0 ? {
        sections: index4.sections
      } : {},
      ...index4.cover !== void 0 ? {
        cover: index4.cover
      } : {},
      ...(0, runtime2.normalizeListRenderingMode)(index4.lists) !== void 0 ? {
        lists: (0, runtime2.normalizeListRenderingMode)(index4.lists)
      } : {},
      ...index4.style !== void 0 ? {
        style: index4.style
      } : {}
    }), fileEnvelope.designSystems !== void 0 && records.set(runtime2.DECK_ASSETS_DOCUMENT_PATH, fileEnvelope.designSystems);
    let value = codec.compose(records, carry);
    return {
      ...value,
      dangling: value.dangling.map((input) => (0, runtime2.slideFilePath)(input.slice(runtime2.SLIDE_STORE_COLLECTION.length + 1)))
    };
  }
  function decomposeSlidesFilesEnvelope(codec, envelope, priorFileEnvelope, carry, notesInFiles) {
    let value = codec.decompose(envelope, priorFileEnvelope?.records, notesInFiles ? {
      dangling: [],
      ...carry,
      inlineNotes: [...envelope.content.order]
    } : carry !== void 0 ? {
      ...carry,
      inlineNotes: []
    } : void 0), entries = /* @__PURE__ */ new Map(), state = {}, state2 = {};
    for (let [value5, value6] of value)
      if (value5.startsWith(runtime2.SLIDE_STORE_COLLECTION + "/")) {
        let value7 = value5.slice(runtime2.SLIDE_STORE_COLLECTION.length + 1);
        entries.set((0, runtime2.slideFilePath)(value7), optionalFileRecordString(value6.html) ?? "");
        let value8 = optionalFileRecordString(value6.notes);
        value8 !== void 0 && (state[value7] = value8);
      } else if (value5.startsWith(runtime2.FONT_STORE_COLLECTION + "/")) {
        let value7 = optionalFileRecordString(value6.family);
        if (value7 === void 0)
          continue;
        let value8 = optionalFileRecordString(value6.src), value9 = optionalFileRecordString(value6.href);
        state2[(0, runtime2.fontStoreKey)(value7)] = {
          family: value7,
          ...value9 !== void 0 ? {
            href: value9
          } : {},
          ...value8 !== void 0 && !value8.startsWith("data:") ? {
            src: value8
          } : {}
        };
      }
    let value2 = value.get(runtime2.DECK_HTML_DOCUMENT_PATH) ?? {}, value3 = optionalFileRecordString(value2.cover), value4 = typeof value2.sections == "object" && value2.sections !== null && !Array.isArray(value2.sections) ? value2.sections : {};
    return {
      files: entries,
      notes: state,
      records: value,
      index: {
        title: optionalFileRecordString(value2.title) ?? envelope.title,
        ...value3 !== void 0 ? {
          cover: value3
        } : {},
        order: Array.isArray(value2.order) ? value2.order.filter((input) => typeof input == "string") : [],
        sections: value4,
        faces: state2,
        ...Array.isArray(value2.style) ? {
          style: value2.style
        } : {}
      }
    };
  }
  function createSlidesFileCodec(codec, options = {}) {
    return {
      indexPath: runtime2.DECK_METADATA_PATH,
      slideFilePath: runtime2.slideFilePath,
      slideIdOfPath: runtime2.slideIdFromFilePath,
      compose: (input, options2) => composeSlidesFilesEnvelope(codec, input, options2),
      decompose: (input, options2, context) => decomposeSlidesFilesEnvelope(codec, input, options2, context, options.notesInFiles === !0)
    };
  }
  return bindRuntimeValue(runtime2, "optionalFileRecordString", () => optionalFileRecordString, (value) => {
    optionalFileRecordString = value;
  }), bindRuntimeValue(runtime2, "composeSlidesFilesEnvelope", () => composeSlidesFilesEnvelope), bindRuntimeValue(runtime2, "decomposeSlidesFilesEnvelope", () => decomposeSlidesFilesEnvelope), bindRuntimeValue(runtime2, "createSlidesFileCodec", () => createSlidesFileCodec), bindRuntimeValue(runtime2, "defaultSlidesFileCodec", () => defaultSlidesFileCodec, (value) => {
    defaultSlidesFileCodec = value;
  }), () => {
    (0, runtime2.initializeSlideModel)(), optionalFileRecordString = (input) => typeof input == "string" ? input : void 0, defaultSlidesFileCodec = createSlidesFileCodec(runtime2.slideDocumentCodec);
  };
}
export {
  installFilesSlideCodec
};
