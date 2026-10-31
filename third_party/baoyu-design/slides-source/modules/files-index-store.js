// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesIndexStore(runtime2) {
  var DECK_INDEX_MERGE_SCHEMA, emptyDeckIndex, IndexFileError;
  function sortIndexDocumentKeys(value, versionFirst) {
    if (Array.isArray(value))
      return value.map((input) => sortIndexDocumentKeys(input, !1));
    if (!(0, runtime2.isMergeObject)(value))
      return value;
    let keys = Object.keys(value).filter((input) => value[input] !== void 0).sort();
    if (versionFirst) {
      let value2 = keys.indexOf("v");
      value2 > 0 && (keys.splice(value2, 1), keys.unshift("v"));
    }
    let sorted = {};
    for (let value2 of keys)
      (0, runtime2.setMergePropertySafely)(sorted, value2, sortIndexDocumentKeys(value[value2], !1));
    return sorted;
  }
  function serializeIndexDocument(index4) {
    return JSON.stringify(sortIndexDocumentKeys(index4, !0), null, 2) + `
`;
  }
  function createIndexFileStore(input) {
    let value = input.empty(), value2 = (0, runtime2.cloneMergeValue)(value), value3 = null, value4, items = [], flag = !1;
    function value5(input2) {
      let value6;
      try {
        value6 = JSON.parse(input2);
      } catch {
        throw new IndexFileError("unreadable", input.path + " is not JSON");
      }
      if (!(0, runtime2.isMergeObject)(value6) || typeof value6.v != "number")
        throw new IndexFileError("unreadable", input.path + " has no numeric v");
      let value7 = input.empty();
      if (value6.v > (input.maxVersion ?? value7.v))
        throw new IndexFileError("newer_version", input.path + " was written by a newer editor (v " + String(value6.v) + ")");
      for (let [value8, value9] of Object.entries(value7)) {
        if (value8 === "v")
          continue;
        let value10 = Array.isArray(value9) ? "array" : (0, runtime2.isMergeObject)(value9) ? "object" : void 0;
        if (value10 === void 0)
          continue;
        let value11 = value6[value8], value12 = input.schema.kind === "map" ? input.schema.keys?.[value8] : void 0;
        if (value12?.kind === "records" && value10 === "array" && (0, runtime2.isMergeObject)(value11)) {
          let value13 = (0, runtime2.keyedListToMergeObject)(value11, value12.by);
          value6[value8] = Object.keys(value13).map((input3) => value13[input3]);
          continue;
        }
        (value10 === "array" && !Array.isArray(value11) || value10 === "object" && !(0, runtime2.isMergeObject)(value11)) && (value6[value8] = value9);
      }
      return value6;
    }
    let callback = () => {
      flag = !0, value4?.(input.path, () => state.serialize(), value3);
    }, state = {
      path: input.path,
      parse: value5,
      async load() {
        let value6;
        try {
          value6 = await input.port.readText(input.path);
        } catch (value7) {
          throw new IndexFileError("not_found", input.path + ": " + (value7 instanceof Error ? value7.message : String(value7?.message ?? value7)));
        }
        return value = value5(value6.text), value2 = (0, runtime2.cloneMergeValue)(value), value3 = value6.sha256, flag = !1, value;
      },
      loadText(input2, options) {
        return value = value5(input2), value2 = (0, runtime2.cloneMergeValue)(value), value3 = options, flag = !1, value;
      },
      init(input2) {
        return value = input2 ?? input.empty(), value2 = input.empty(), value3 = null, callback(), value;
      },
      get: () => value,
      base: () => value2,
      baseSha: () => value3,
      dirty: () => flag,
      lastConflicts: () => [...items],
      update(input2) {
        input2(value), callback();
      },
      mergeFrom(input2) {
        return items = [], value = (0, runtime2.preserveFileMigrationMarkers)((0, runtime2.mergeDocumentValues)(value2, value, input2, input.schema, {
          conflicts: items,
          externalMembers: input.externalMembers
        }), input2, value2), value2 = (0, runtime2.deepCloneMergeValue)(input2), value;
      },
      serialize: () => serializeIndexDocument((0, runtime2.preserveFileMigrationMarkers)(value, value2)),
      bind(input2) {
        value4 = input2;
      },
      markSaved(input2, options) {
        try {
          value2 = JSON.parse(input2);
        } catch {
          value2 = (0, runtime2.cloneMergeValue)(value);
        }
        value3 = options, flag = !(0, runtime2.mergeValuesEqual)(value2, value);
      },
      async reloadAndMerge() {
        let value6 = await input.port.readText(input.path);
        return value6.sha256 === value3 ? [] : (state.mergeFrom(value5(value6.text)), value3 = value6.sha256, flag = !(0, runtime2.mergeValuesEqual)(value2, value), flag && value4?.(input.path, () => state.serialize(), value3), [...items]);
      }
    };
    return state;
  }
  return bindRuntimeValue(runtime2, "DECK_INDEX_MERGE_SCHEMA", () => DECK_INDEX_MERGE_SCHEMA, (value) => {
    DECK_INDEX_MERGE_SCHEMA = value;
  }), bindRuntimeValue(runtime2, "emptyDeckIndex", () => emptyDeckIndex, (value) => {
    emptyDeckIndex = value;
  }), bindRuntimeValue(runtime2, "sortIndexDocumentKeys", () => sortIndexDocumentKeys), bindRuntimeValue(runtime2, "serializeIndexDocument", () => serializeIndexDocument), bindRuntimeValue(runtime2, "IndexFileError", () => IndexFileError, (value) => {
    IndexFileError = value;
  }), bindRuntimeValue(runtime2, "createIndexFileStore", () => createIndexFileStore), () => {
    DECK_INDEX_MERGE_SCHEMA = {
      kind: "map",
      keys: {
        order: {
          kind: "list"
        },
        sections: {
          kind: "map",
          of: {
            kind: "map",
            of: {
              kind: "leaf"
            }
          }
        },
        faces: {
          kind: "map",
          of: {
            kind: "map",
            of: {
              kind: "leaf"
            }
          }
        },
        designSystems: {
          kind: "records",
          by: "namespace"
        },
        attachments: {
          kind: "map",
          of: {
            kind: "map",
            of: {
              kind: "leaf"
            }
          }
        },
        style: {
          kind: "leaf"
        }
      }
    }, emptyDeckIndex = () => ({
      v: 4,
      order: [],
      sections: {},
      faces: {},
      designSystems: [],
      attachments: {}
    }), IndexFileError = class extends Error {
      code;
      constructor(input, options) {
        super(options), this.code = input, this.name = "IndexFileError";
      }
    };
  };
}
export {
  installFilesIndexStore
};
