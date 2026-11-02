// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesPublishInputs(runtime2) {
  var MAX_FILE_BATCH_ENTRIES, MAX_FILE_PATH_UTF8_BYTES, MAX_FILE_PUBLISH_ENCODED_BYTES, MAX_FILE_BATCH_ENCODED_BYTES, FILE_MIME_TYPES_BY_EXTENSION, FILE_ALLOWED_MIME_TYPES, FILE_BINARY_MIME_TYPES, TEXT_FILE_MIME_TYPES, UNICODE_REPLACEMENT_CHARACTER, FILE_UNPAIRED_SURROGATE_PATTERN, textContainsInvalidUnicode, isHtmlFilePath, FRAME_RUNTIME_BLOCK_START, FRAME_RUNTIME_BLOCK_END, filePublishContent, encodeFileUrlPath;
  function fileListingIsNarrowed(listing, port) {
    return listing.narrowed ?? port.narrowed === !0;
  }
  function normalizeFilesPort(input) {
    return input;
  }
  function validateFilePath(path) {
    if (path === "" || (0, runtime2.encodeFileUtf8)(path).length > MAX_FILE_PATH_UTF8_BYTES)
      return "its name is empty or too long. Rename it";
    if (/[\u0000-\u001f\u007f%;:\\]/.test(path))
      return "its name has a character that cannot be saved (% ; : \\ or a control character). Rename it";
    if (path.endsWith(".cmekshadow"))
      return "its name ends in .cmekshadow, which is reserved. Rename it";
    let segments = path.split("/");
    if (path.startsWith("/") || segments.some((input) => input === "" || input === "." || input === ".."))
      return "its path has an empty part, or a part that is only dots. Rename it";
    if (segments[0].startsWith("_"))
      return "its top-level name starts with an underscore, which is reserved. Rename it";
  }
  function isTextFileWithInvalidUnicode(input, options) {
    if (options === null)
      return !1;
    let value = normalizeFilePublishInput(input, options);
    return value !== null && typeof value != "string" && typeof value.content == "string" && TEXT_FILE_MIME_TYPES.has(value.contentType) && textContainsInvalidUnicode(value.content);
  }
  function filePublishRejection(input, options) {
    let value = validateFilePath(input);
    if (value !== void 0)
      return {
        why: value,
        cause: "name"
      };
    if (options === null)
      return;
    let value2 = normalizeFilePublishInput(input, options);
    if (typeof value2 == "string")
      return value2.includes("files of this kind") ? {
        why: value2.slice(value2.indexOf(": ") + 2),
        cause: "kind"
      } : value2.includes("cannot infer a content type") ? {
        why: "files of this kind cannot be saved here (nothing is known for a name like this). Use another format",
        cause: "kind"
      } : {
        why: "it is in a form that cannot be saved here",
        cause: "unreadable"
      };
    if (isTextFileWithInvalidUnicode(input, options))
      return {
        why: "it holds a character that did not decode (it shows as " + UNICODE_REPLACEMENT_CHARACTER + "). Find it and type it again",
        cause: "damaged_text"
      };
  }
  function fileMimeTypeFromPath(path) {
    let slashIndex = path.lastIndexOf("/"), dotIndex = path.lastIndexOf(".");
    if (!(dotIndex <= slashIndex + 1))
      return FILE_MIME_TYPES_BY_EXTENSION.get(path.slice(dotIndex + 1).toLowerCase());
  }
  function stripFrameRuntimeBlock(input) {
    let value = input.indexOf(FRAME_RUNTIME_BLOCK_START);
    if (value < 0)
      return input;
    let value2 = input.indexOf(FRAME_RUNTIME_BLOCK_END, value + FRAME_RUNTIME_BLOCK_START.length);
    return value2 < 0 ? input : input.slice(0, value) + input.slice(value2 + FRAME_RUNTIME_BLOCK_END.length);
  }
  function normalizeFilePublishInput(path, input) {
    if (input === null)
      return null;
    let content = input, contentType;
    typeof input == "object" && !(typeof Blob < "u" && input instanceof Blob) && (content = input.content, contentType = input.contentType);
    let isBlob = typeof Blob < "u" && content instanceof Blob;
    if (typeof content != "string" && !isBlob)
      return path + ": content must be a string or a Blob";
    let value = isBlob ? content.type.split(";")[0].trim() : "", value2 = contentType ?? (FILE_ALLOWED_MIME_TYPES.has(value) ? value : void 0) ?? fileMimeTypeFromPath(path) ?? (value !== "" ? value : void 0);
    return value2 === void 0 ? path + ": cannot infer a content type from the name; pass {content, contentType}" : value2 === "" || value2.includes(";") ? path + ": contentType must be a bare media type" : !FILE_ALLOWED_MIME_TYPES.has(value2) && !(contentType !== void 0 && FILE_BINARY_MIME_TYPES.has(value2)) ? path + ": files of this kind (" + value2 + ") cannot be saved here. Use another format" : {
      content,
      contentType: value2
    };
  }
  function filePublishEncodedBytes(input) {
    if (input === null)
      return 0;
    let value = filePublishContent(input);
    return typeof value == "string" ? (0, runtime2.encodeFileUtf8)(value).length : Math.ceil(value.size / 3) * 4;
  }
  function filePublishRawBytes(input) {
    if (input === null)
      return 0;
    let value = filePublishContent(input);
    return typeof value == "string" ? (0, runtime2.encodeFileUtf8)(value).length : value.size;
  }
  function filePublishSizeRejection(input) {
    if (input === null || filePublishEncodedBytes(input) <= MAX_FILE_PUBLISH_ENCODED_BYTES)
      return;
    let isText = typeof filePublishContent(input) == "string", limitMegabytes = (isText ? MAX_FILE_PUBLISH_ENCODED_BYTES : MAX_FILE_PUBLISH_ENCODED_BYTES / 4 * 3) / 1048576;
    return "it is over the " + String(limitMegabytes) + " MB limit for one file. Make it smaller" + (isText ? " (an image or a font pasted into it is the usual cause)" : "");
  }
  async function fileContentBytes(input) {
    return typeof input == "string" ? (0, runtime2.encodeFileUtf8)(input) : new Uint8Array(await input.arrayBuffer());
  }
  async function hashFilePublishEntries(entries) {
    let hashes = {};
    for (let [value, value2] of Object.entries(entries)) {
      let value3 = normalizeFilePublishInput(value, value2);
      value3 === null || typeof value3 == "string" || (hashes[value] = await (0, runtime2.sha256)(await fileContentBytes(value3.content)));
    }
    return hashes;
  }
  function validateFilePublishBatch(entries) {
    let paths = Object.keys(entries);
    if (paths.length === 0 || paths.length > MAX_FILE_BATCH_ENTRIES)
      return {
        ok: !1,
        code: "invalid_content"
      };
    let encodedBytes = 0;
    for (let value of paths) {
      if (validateFilePath(value) !== void 0)
        return {
          ok: !1,
          code: "invalid_content"
        };
      if (typeof normalizeFilePublishInput(value, entries[value]) == "string")
        return {
          ok: !1,
          code: "invalid_content"
        };
      encodedBytes += filePublishEncodedBytes(entries[value]);
    }
    if (encodedBytes > MAX_FILE_PUBLISH_ENCODED_BYTES)
      return {
        ok: !1,
        code: "too_large"
      };
  }
  function splitFilePublishBatches(entries, isIndexPath = runtime2.isProjectIndexFilePath, maxBytes = MAX_FILE_BATCH_ENCODED_BYTES, maxEntries = MAX_FILE_BATCH_ENTRIES) {
    let allEntries = Object.entries(entries), contentEntries = allEntries.filter(([input]) => !isIndexPath(input)), indexEntries = allEntries.filter(([input]) => isIndexPath(input)), batches = [], batch = {}, batchBytes = 0, batchCount = 0, appendEntry = (input, options) => {
      let value = filePublishEncodedBytes(options);
      batchCount > 0 && (batchBytes + value > maxBytes || batchCount + 1 > maxEntries) && (batches.push(batch), batch = {}, batchBytes = 0, batchCount = 0), batch[input] = options, batchBytes += value, batchCount += 1;
    };
    for (let [value, value2] of contentEntries)
      appendEntry(value, value2);
    for (let [value, value2] of indexEntries)
      appendEntry(value, value2);
    return batchCount > 0 && batches.push(batch), batches;
  }
  function fileContentContainsRuntimeMarkers(input) {
    if (input === null)
      return !1;
    let value = typeof input == "object" && !(typeof Blob < "u" && input instanceof Blob) ? input.content : input;
    return typeof value == "string" && (value.includes("/_cas/") || value.includes(FRAME_RUNTIME_BLOCK_START) || value.includes("__frame_comments__"));
  }
  return bindRuntimeValue(runtime2, "fileListingIsNarrowed", () => fileListingIsNarrowed), bindRuntimeValue(runtime2, "normalizeFilesPort", () => normalizeFilesPort), bindRuntimeValue(runtime2, "MAX_FILE_BATCH_ENTRIES", () => MAX_FILE_BATCH_ENTRIES, (value) => {
    MAX_FILE_BATCH_ENTRIES = value;
  }), bindRuntimeValue(runtime2, "MAX_FILE_PATH_UTF8_BYTES", () => MAX_FILE_PATH_UTF8_BYTES, (value) => {
    MAX_FILE_PATH_UTF8_BYTES = value;
  }), bindRuntimeValue(runtime2, "MAX_FILE_PUBLISH_ENCODED_BYTES", () => MAX_FILE_PUBLISH_ENCODED_BYTES, (value) => {
    MAX_FILE_PUBLISH_ENCODED_BYTES = value;
  }), bindRuntimeValue(runtime2, "MAX_FILE_BATCH_ENCODED_BYTES", () => MAX_FILE_BATCH_ENCODED_BYTES, (value) => {
    MAX_FILE_BATCH_ENCODED_BYTES = value;
  }), bindRuntimeValue(runtime2, "FILE_MIME_TYPES_BY_EXTENSION", () => FILE_MIME_TYPES_BY_EXTENSION, (value) => {
    FILE_MIME_TYPES_BY_EXTENSION = value;
  }), bindRuntimeValue(runtime2, "FILE_ALLOWED_MIME_TYPES", () => FILE_ALLOWED_MIME_TYPES, (value) => {
    FILE_ALLOWED_MIME_TYPES = value;
  }), bindRuntimeValue(runtime2, "FILE_BINARY_MIME_TYPES", () => FILE_BINARY_MIME_TYPES, (value) => {
    FILE_BINARY_MIME_TYPES = value;
  }), bindRuntimeValue(runtime2, "validateFilePath", () => validateFilePath), bindRuntimeValue(runtime2, "TEXT_FILE_MIME_TYPES", () => TEXT_FILE_MIME_TYPES, (value) => {
    TEXT_FILE_MIME_TYPES = value;
  }), bindRuntimeValue(runtime2, "UNICODE_REPLACEMENT_CHARACTER", () => UNICODE_REPLACEMENT_CHARACTER, (value) => {
    UNICODE_REPLACEMENT_CHARACTER = value;
  }), bindRuntimeValue(runtime2, "FILE_UNPAIRED_SURROGATE_PATTERN", () => FILE_UNPAIRED_SURROGATE_PATTERN, (value) => {
    FILE_UNPAIRED_SURROGATE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "textContainsInvalidUnicode", () => textContainsInvalidUnicode, (value) => {
    textContainsInvalidUnicode = value;
  }), bindRuntimeValue(runtime2, "isTextFileWithInvalidUnicode", () => isTextFileWithInvalidUnicode), bindRuntimeValue(runtime2, "filePublishRejection", () => filePublishRejection), bindRuntimeValue(runtime2, "fileMimeTypeFromPath", () => fileMimeTypeFromPath), bindRuntimeValue(runtime2, "isHtmlFilePath", () => isHtmlFilePath, (value) => {
    isHtmlFilePath = value;
  }), bindRuntimeValue(runtime2, "FRAME_RUNTIME_BLOCK_START", () => FRAME_RUNTIME_BLOCK_START, (value) => {
    FRAME_RUNTIME_BLOCK_START = value;
  }), bindRuntimeValue(runtime2, "FRAME_RUNTIME_BLOCK_END", () => FRAME_RUNTIME_BLOCK_END, (value) => {
    FRAME_RUNTIME_BLOCK_END = value;
  }), bindRuntimeValue(runtime2, "stripFrameRuntimeBlock", () => stripFrameRuntimeBlock), bindRuntimeValue(runtime2, "normalizeFilePublishInput", () => normalizeFilePublishInput), bindRuntimeValue(runtime2, "filePublishContent", () => filePublishContent, (value) => {
    filePublishContent = value;
  }), bindRuntimeValue(runtime2, "filePublishEncodedBytes", () => filePublishEncodedBytes), bindRuntimeValue(runtime2, "filePublishRawBytes", () => filePublishRawBytes), bindRuntimeValue(runtime2, "filePublishSizeRejection", () => filePublishSizeRejection), bindRuntimeValue(runtime2, "fileContentBytes", () => fileContentBytes), bindRuntimeValue(runtime2, "hashFilePublishEntries", () => hashFilePublishEntries), bindRuntimeValue(runtime2, "validateFilePublishBatch", () => validateFilePublishBatch), bindRuntimeValue(runtime2, "splitFilePublishBatches", () => splitFilePublishBatches), bindRuntimeValue(runtime2, "fileContentContainsRuntimeMarkers", () => fileContentContainsRuntimeMarkers), bindRuntimeValue(runtime2, "encodeFileUrlPath", () => encodeFileUrlPath, (value) => {
    encodeFileUrlPath = value;
  }), () => {
    MAX_FILE_BATCH_ENTRIES = 256, MAX_FILE_PATH_UTF8_BYTES = 512, MAX_FILE_PUBLISH_ENCODED_BYTES = 16777216, MAX_FILE_BATCH_ENCODED_BYTES = 15728640, FILE_MIME_TYPES_BY_EXTENSION = /* @__PURE__ */ new Map([
      ["html", "text/html"],
      ["htm", "text/html"],
      ["css", "text/css"],
      ["js", "text/javascript"],
      ["mjs", "text/javascript"],
      ["json", "application/json"],
      ["webmanifest", "application/manifest+json"],
      ["txt", "text/plain"],
      ["md", "text/markdown"],
      ["xml", "application/xml"],
      ["svg", "image/svg+xml"],
      ["png", "image/png"],
      ["jpg", "image/jpeg"],
      ["jpeg", "image/jpeg"],
      ["gif", "image/gif"],
      ["webp", "image/webp"],
      ["avif", "image/avif"],
      ["ico", "image/x-icon"],
      ["woff", "font/woff"],
      ["woff2", "font/woff2"],
      ["ttf", "font/ttf"],
      ["otf", "font/otf"],
      ["mp3", "audio/mpeg"],
      ["wav", "audio/wav"],
      ["mp4", "video/mp4"],
      ["webm", "video/webm"],
      ["pdf", "application/pdf"],
      ["wasm", "application/wasm"]
    ]), FILE_ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
      "text/html",
      "text/css",
      "text/plain",
      "text/markdown",
      "text/csv",
      "text/javascript",
      "application/javascript",
      "application/json",
      "application/manifest+json",
      "application/xml",
      "text/xml",
      "application/wasm",
      "image/svg+xml",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "font/woff",
      "font/woff2",
      "font/ttf",
      "font/otf",
      "font/collection",
      "application/vnd.ms-fontobject",
      "application/font-woff",
      "application/font-woff2",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "audio/webm",
      "video/mp4",
      "video/webm",
      "video/ogg",
      "application/pdf",
      "application/zip+dotlottie"
    ]), FILE_BINARY_MIME_TYPES = /* @__PURE__ */ new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/x-figma"
    ]), TEXT_FILE_MIME_TYPES = /* @__PURE__ */ new Set([
      "text/html",
      "text/ldx",
      "text/css",
      "text/plain",
      "text/markdown",
      "text/csv",
      "text/javascript",
      "application/javascript",
      "application/json",
      "application/manifest+json",
      "application/xml",
      "text/xml",
      "image/svg+xml"
    ]), UNICODE_REPLACEMENT_CHARACTER = "�", FILE_UNPAIRED_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/, textContainsInvalidUnicode = (input) => input.includes(UNICODE_REPLACEMENT_CHARACTER) || FILE_UNPAIRED_SURROGATE_PATTERN.test(input), isHtmlFilePath = (input) => /\.html?$/i.test(input), FRAME_RUNTIME_BLOCK_START = "<!-- frame-runtime -->", FRAME_RUNTIME_BLOCK_END = "<!-- /frame-runtime -->", filePublishContent = (input) => typeof input == "object" && !(typeof Blob < "u" && input instanceof Blob) ? input.content : input, encodeFileUrlPath = (input) => input.split("/").map(encodeURIComponent).join("/");
  };
}
export {
  installFilesPublishInputs
};
