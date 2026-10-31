// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelComments(runtime2) {
  var MAX_ARTIFACT_COMMENTS, MAX_COMMENT_TEXT_LENGTH, MAX_COMMENT_IMAGES;
  function isValidCommentImage(source) {
    return /^\/?_blob\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(source) ? !0 : source.length <= 2e5 && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(source);
  }
  function commentObjectProperty(value, key) {
    if (typeof value == "object" && value !== null)
      return value[key];
  }
  function normalizeComments(comments) {
    if (!Array.isArray(comments))
      return [];
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of comments) {
      let value2 = commentObjectProperty(value, "id"), value3 = commentObjectProperty(value, "text"), value4 = commentObjectProperty(value, "at");
      if (typeof value2 != "string" || value2.length === 0 || value2.length > 64 || values.has(value2) || typeof value3 != "string" || typeof value4 != "number" || !Number.isFinite(value4))
        continue;
      values.add(value2);
      let value5 = commentObjectProperty(value, "author"), value6 = commentObjectProperty(value, "userId"), value7 = commentObjectProperty(value, "elementKey"), value8 = commentObjectProperty(value, "elementLabel"), value9 = commentObjectProperty(value, "images"), value10 = Array.isArray(value9) ? value9.filter((input) => typeof input == "string" && isValidCommentImage(input)).slice(0, MAX_COMMENT_IMAGES) : [];
      items.push({
        id: value2,
        text: (0, runtime2.truncateUtf16Safely)(value3, MAX_COMMENT_TEXT_LENGTH),
        at: value4,
        author: typeof value5 == "string" && value5.length > 0 ? (0, runtime2.truncateUtf16Safely)(value5, 80) : "viewer",
        userId: typeof value6 == "string" && value6.length > 0 ? (0, runtime2.truncateUtf16Safely)(value6, 128) : void 0,
        elementKey: typeof value7 == "string" && value7.length > 0 ? (0, runtime2.truncateUtf16Safely)(value7, 400) : void 0,
        elementLabel: typeof value8 == "string" ? (0, runtime2.truncateUtf16Safely)(value8, 160) : void 0,
        ...value10.length > 0 ? {
          images: value10
        } : {}
      });
    }
    return items.sort((input, options) => input.at - options.at), items.slice(-MAX_ARTIFACT_COMMENTS);
  }
  function applyCommentOperations(comments, operations) {
    let value = comments;
    for (let value2 of operations)
      if (value2.op === "add") {
        if (value.some((input) => input.id === value2.comment.id) || value.length >= MAX_ARTIFACT_COMMENTS)
          continue;
        value = [...value, value2.comment].sort((input, options) => input.at - options.at);
      } else
        value = value.filter((input) => input.id !== value2.id);
    return value;
  }
  function applicableCommentOperations(comments, operations) {
    let values = new Set(comments.map((input) => input.id));
    return operations.filter((input) => input.op === "add" ? !values.has(input.comment.id) : values.has(input.id));
  }
  function normalizeCommentOperations(operations) {
    if (!Array.isArray(operations))
      return [];
    let items = [];
    for (let value of operations) {
      let value2 = commentObjectProperty(value, "op");
      if (value2 === "add") {
        let value3 = normalizeComments([
          commentObjectProperty(value, "comment")
        ])[0];
        value3 && items.push({
          op: "add",
          comment: value3
        });
      } else if (value2 === "remove") {
        let value3 = commentObjectProperty(value, "id");
        typeof value3 == "string" && value3.length > 0 && value3.length <= 64 && items.push({
          op: "remove",
          id: value3
        });
      }
    }
    return items;
  }
  return bindRuntimeValue(runtime2, "MAX_ARTIFACT_COMMENTS", () => MAX_ARTIFACT_COMMENTS, (value) => {
    MAX_ARTIFACT_COMMENTS = value;
  }), bindRuntimeValue(runtime2, "MAX_COMMENT_TEXT_LENGTH", () => MAX_COMMENT_TEXT_LENGTH, (value) => {
    MAX_COMMENT_TEXT_LENGTH = value;
  }), bindRuntimeValue(runtime2, "MAX_COMMENT_IMAGES", () => MAX_COMMENT_IMAGES, (value) => {
    MAX_COMMENT_IMAGES = value;
  }), bindRuntimeValue(runtime2, "isValidCommentImage", () => isValidCommentImage), bindRuntimeValue(runtime2, "commentObjectProperty", () => commentObjectProperty), bindRuntimeValue(runtime2, "normalizeComments", () => normalizeComments), bindRuntimeValue(runtime2, "applyCommentOperations", () => applyCommentOperations), bindRuntimeValue(runtime2, "applicableCommentOperations", () => applicableCommentOperations), bindRuntimeValue(runtime2, "normalizeCommentOperations", () => normalizeCommentOperations), () => {
    MAX_ARTIFACT_COMMENTS = 200, MAX_COMMENT_TEXT_LENGTH = 4e3, MAX_COMMENT_IMAGES = 4;
  };
}
export {
  installModelComments
};
