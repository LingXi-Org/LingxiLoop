// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsJsonRecords(runtime2) {
  var ReactSpeakerNotesPanel, JSON_HTML_ESCAPE_PATTERN, JSON_LINE_SEPARATOR_ESCAPE_PATTERN, DELETE_DOCUMENT_RECORD, canonicalJsonCache;
  function estimateEmbeddedJsonBytes(value) {
    let json = JSON.stringify(value), escapedBytes = 5 * (json.match(JSON_HTML_ESCAPE_PATTERN)?.length ?? 0) + 3 * (json.match(JSON_LINE_SEPARATOR_ESCAPE_PATTERN)?.length ?? 0);
    return new TextEncoder().encode(json).length + escapedBytes;
  }
  function isCanonicalJsonObject(input) {
    return typeof input == "object" && input !== null && !Array.isArray(input);
  }
  function sortJsonObjectKeys(key, value) {
    if (!isCanonicalJsonObject(value))
      return value;
    let sortedObject = {};
    for (let value2 of Object.keys(value).sort())
      sortedObject[value2] = value[value2];
    return sortedObject;
  }
  function canonicalJsonString(value) {
    let cached = canonicalJsonCache.get(value);
    if (cached !== void 0)
      return cached;
    let canonical = JSON.stringify(value, sortJsonObjectKeys) ?? "undefined";
    return canonicalJsonCache.set(value, canonical), canonical;
  }
  function documentRecordsEqual(left, right) {
    return left === right ? !0 : typeof left != "object" || typeof right != "object" || left === null || right === null ? !1 : canonicalJsonString(left) === canonicalJsonString(right);
  }
  function basenameDocumentPath(input) {
    return input.slice(input.lastIndexOf("/") + 1);
  }
  return bindRuntimeValue(runtime2, "ReactSpeakerNotesPanel", () => ReactSpeakerNotesPanel, (value) => {
    ReactSpeakerNotesPanel = value;
  }), bindRuntimeValue(runtime2, "JSON_HTML_ESCAPE_PATTERN", () => JSON_HTML_ESCAPE_PATTERN, (value) => {
    JSON_HTML_ESCAPE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "JSON_LINE_SEPARATOR_ESCAPE_PATTERN", () => JSON_LINE_SEPARATOR_ESCAPE_PATTERN, (value) => {
    JSON_LINE_SEPARATOR_ESCAPE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "estimateEmbeddedJsonBytes", () => estimateEmbeddedJsonBytes), bindRuntimeValue(runtime2, "DELETE_DOCUMENT_RECORD", () => DELETE_DOCUMENT_RECORD, (value) => {
    DELETE_DOCUMENT_RECORD = value;
  }), bindRuntimeValue(runtime2, "isCanonicalJsonObject", () => isCanonicalJsonObject), bindRuntimeValue(runtime2, "canonicalJsonCache", () => canonicalJsonCache, (value) => {
    canonicalJsonCache = value;
  }), bindRuntimeValue(runtime2, "sortJsonObjectKeys", () => sortJsonObjectKeys), bindRuntimeValue(runtime2, "canonicalJsonString", () => canonicalJsonString), bindRuntimeValue(runtime2, "documentRecordsEqual", () => documentRecordsEqual), bindRuntimeValue(runtime2, "basenameDocumentPath", () => basenameDocumentPath), () => {
    (0, runtime2.initializeSlideModel)(), ReactSpeakerNotesPanel = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideModel)(), JSON_HTML_ESCAPE_PATTERN = /[<>&]/g, JSON_LINE_SEPARATOR_ESCAPE_PATTERN = /[\u2028\u2029]/g, DELETE_DOCUMENT_RECORD = Symbol("DELETE_DOC"), canonicalJsonCache = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installDocumentsJsonRecords
};
