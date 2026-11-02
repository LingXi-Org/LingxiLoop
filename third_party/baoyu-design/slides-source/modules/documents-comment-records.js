// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsCommentRecords(runtime2) {
  var COMMENT_DOCUMENT_PREFIX;
  function decomposeCommentDocuments(comments, previousRecords, records) {
    for (let value of comments) {
      let value2 = COMMENT_DOCUMENT_PREFIX + "/" + value.id, state = {};
      for (let [value4, value5] of Object.entries(value))
        value5 !== void 0 && (state[value4] = value5);
      let value3 = previousRecords?.get(value2);
      records.set(value2, value3 !== void 0 && (0, runtime2.documentRecordsEqual)(value3, state) ? value3 : state);
    }
  }
  function composeCommentDocuments(records) {
    let comments = [], prefix = COMMENT_DOCUMENT_PREFIX + "/";
    for (let [value, value2] of records)
      !value.startsWith(prefix) || value.indexOf("/", prefix.length) >= 0 || comments.push({
        ...value2,
        id: value.slice(prefix.length)
      });
    return (0, runtime2.normalizeComments)(comments);
  }
  return bindRuntimeValue(runtime2, "COMMENT_DOCUMENT_PREFIX", () => COMMENT_DOCUMENT_PREFIX, (value) => {
    COMMENT_DOCUMENT_PREFIX = value;
  }), bindRuntimeValue(runtime2, "decomposeCommentDocuments", () => decomposeCommentDocuments), bindRuntimeValue(runtime2, "composeCommentDocuments", () => composeCommentDocuments), () => {
    COMMENT_DOCUMENT_PREFIX = "comments";
  };
}
export {
  installDocumentsCommentRecords
};
