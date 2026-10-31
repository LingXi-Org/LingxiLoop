// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsAnchors(runtime2) {
  var COMMENT_ANCHOR_VERSION, COMMENT_ANCHOR_SEGMENT_PATTERN, COMMENT_ANCHOR_HOST_SEGMENT_PATTERN, COMMENT_ANCHOR_NODE_SEGMENT_PATTERN, COMMENT_ANCHOR_POINT_SEGMENT_PATTERN, COMMENT_ANCHOR_AREA_SEGMENT_PATTERN, COMMENT_ANCHOR_HASH_CHARS, commentAnchorScope, hashScopedSlideId, encodeCommentAnchorFraction, decodeCommentAnchorFraction, quantizeCommentAnchorFraction, encodeCommentAnchorBox, decodeCommentAnchorBox, PROMOTED_FRAME_ID_PATTERN;
  function setCommentAnchorScope(scope) {
    commentAnchorScope = scope;
  }
  function hashCommentAnchorId(text) {
    let firstHash = -559038737, secondHash = 1103547991;
    for (let index4 = 0; index4 < text.length; index4++) {
      let value = text.charCodeAt(index4);
      firstHash = Math.imul(firstHash ^ value, 2654435761), secondHash = Math.imul(secondHash ^ value, 1597334677);
    }
    return firstHash = Math.imul(firstHash ^ firstHash >>> 16, 2246822507) ^ Math.imul(secondHash ^ secondHash >>> 13, 3266489909), secondHash = Math.imul(secondHash ^ secondHash >>> 16, 2246822507) ^ Math.imul(firstHash ^ firstHash >>> 13, 3266489909), (4294967296 * (2097151 & secondHash) + (firstHash >>> 0)).toString(16).padStart(14, "0").slice(-COMMENT_ANCHOR_HASH_CHARS);
  }
  function encodeSlideCommentAnchor(anchor) {
    let segments = [
      "sl" + hashScopedSlideId(anchor.slideId) + ":nth-of-type(1)"
    ], frameId = anchor.kind === "frame" || anchor.kind === "area" ? anchor.frameId : null;
    if (frameId !== null) {
      if (segments.push("fr" + hashCommentAnchorId(frameId) + ":nth-of-type(1)"), anchor.kind !== "slide" && anchor.path.length > 0) {
        if (!anchor.path.every((input) => Number.isInteger(input) && input >= 0 && input <= 999))
          return null;
        let value4 = "np" + anchor.path.join("-");
        if (value4.length > 24)
          return null;
        segments.push(value4 + ":nth-of-type(1)");
      }
    } else if (anchor.kind === "area" && anchor.path.length > 0)
      return null;
    let value = anchor.kind === "area" ? encodeCommentAnchorBox(anchor.box) : "";
    if (value === null)
      return null;
    let value2 = anchor.kind === "area" ? (frameId !== null ? "g" : "r") + value : (anchor.kind === "frame" ? "x" : "b") + encodeCommentAnchorFraction(anchor.fx) + encodeCommentAnchorFraction(anchor.fy);
    segments.push("s" + value2 + ":nth-of-type(" + String(COMMENT_ANCHOR_VERSION) + ")");
    let value3 = segments.join(" > ");
    return segments.every((input) => COMMENT_ANCHOR_SEGMENT_PATTERN.test(input)) && value3.length <= 1024 ? value3 : null;
  }
  function parseSlideCommentAnchor(anchor) {
    if (typeof anchor != "string" || anchor === "" || anchor.length > 1024)
      return null;
    let segments = anchor.split(" > ");
    if (!segments.every((input) => COMMENT_ANCHOR_SEGMENT_PATTERN.test(input)))
      return null;
    let tail = segments[segments.length - 1] ?? "", slideMatch = COMMENT_ANCHOR_HOST_SEGMENT_PATTERN.exec(segments[0] ?? "");
    if (!slideMatch || slideMatch[1] !== "sl")
      return null;
    let value = slideMatch[2], value2 = COMMENT_ANCHOR_AREA_SEGMENT_PATTERN.exec(tail);
    if (value2) {
      let value7 = decodeCommentAnchorBox(value2[2]);
      if (!value7 || Number(value2[3]) !== COMMENT_ANCHOR_VERSION)
        return null;
      if (value2[1] === "r")
        return segments.length === 2 ? {
          kind: "area",
          slideHash: value,
          frameHash: null,
          path: [],
          box: value7
        } : null;
      let value8 = parseCommentFramePath(segments);
      return value8 ? {
        kind: "area",
        slideHash: value,
        frameHash: value8.frameHash,
        path: value8.path,
        box: value7
      } : null;
    }
    let value3 = COMMENT_ANCHOR_POINT_SEGMENT_PATTERN.exec(tail);
    if (!value3 || Number(value3[4]) !== COMMENT_ANCHOR_VERSION)
      return null;
    let value4 = decodeCommentAnchorFraction(value3[2]), value5 = decodeCommentAnchorFraction(value3[3]);
    if (value3[1] === "b")
      return segments.length === 2 ? {
        kind: "slide",
        slideHash: value,
        fx: value4,
        fy: value5
      } : null;
    let value6 = parseCommentFramePath(segments);
    return value6 ? {
      kind: "frame",
      slideHash: value,
      frameHash: value6.frameHash,
      path: value6.path,
      fx: value4,
      fy: value5
    } : null;
  }
  function parseCommentFramePath(segments) {
    let frameMatch = COMMENT_ANCHOR_HOST_SEGMENT_PATTERN.exec(segments[1] ?? "");
    if (!frameMatch || frameMatch[1] !== "fr")
      return null;
    if (segments.length === 3)
      return {
        frameHash: frameMatch[2],
        path: []
      };
    let value = segments.length === 4 ? COMMENT_ANCHOR_NODE_SEGMENT_PATTERN.exec(segments[2]) : null;
    return value ? {
      frameHash: frameMatch[2],
      path: value[1].split("-").map(Number)
    } : null;
  }
  function resolveCommentSlide(anchor, slides) {
    return slides.find((input) => hashScopedSlideId(input.id) === anchor.slideHash) ?? null;
  }
  function countOpenCommentsBySlide(threads, slides) {
    let countByHash = /* @__PURE__ */ new Map();
    for (let value of threads) {
      let value2 = value.resolved ? null : parseSlideCommentAnchor(value.anchor);
      value2 && countByHash.set(value2.slideHash, (countByHash.get(value2.slideHash) ?? 0) + 1);
    }
    let countById = /* @__PURE__ */ new Map();
    if (countByHash.size === 0)
      return countById;
    for (let value of slides) {
      let entry = countByHash.get(hashScopedSlideId(value.id));
      entry !== void 0 && countById.set(value.id, entry);
    }
    return countById;
  }
  function resolveCommentFrameId(anchor, slide) {
    return anchor.frameHash === null ? null : slide.frames.find((input) => hashCommentAnchorId(input.id) === anchor.frameHash)?.id ?? null;
  }
  function encodePromotedFrameId(hostId, root, path, tag) {
    if (path.length === 0 || !path.every((input) => Number.isInteger(input) && input >= 0 && input <= 999))
      return null;
    let id = "p" + hashCommentAnchorId(hostId) + (root ? "r" : "c") + path.join("_") + "-" + tag;
    return id.length <= 64 && parsePromotedFrameId(id) !== null ? id : null;
  }
  function parsePromotedFrameId(id) {
    let match = PROMOTED_FRAME_ID_PATTERN.exec(id);
    if (!match)
      return null;
    let path = match[3].split("_").map(Number);
    return path.join("_") === match[3] ? {
      hostHash: match[1],
      root: match[2] === "r",
      path,
      tag: match[4]
    } : null;
  }
  function resolvePromotedCommentFrame(anchor, slide) {
    let frameId = resolveCommentFrameId(anchor, slide);
    if (frameId !== null)
      return {
        kind: "frame",
        frameId
      };
    let promotedFrames = slide.frames.flatMap((input) => {
      let value2 = parsePromotedFrameId(input.id);
      return value2 !== null && value2.hostHash === anchor.frameHash ? [
        {
          id: input.id,
          ...value2
        }
      ] : [];
    });
    if (anchor.path.length === 0)
      return promotedFrames.length > 0 && promotedFrames.every((input) => input.root) ? {
        kind: "surface"
      } : null;
    if (new Set(promotedFrames.map((input) => input.tag)).size > 1)
      return null;
    let value = promotedFrames.filter((input) => input.path.length === anchor.path.length && input.path.every((input2, options) => input2 === anchor.path[options]));
    return value.length === 1 ? {
      kind: "piece",
      frameId: value[0].id
    } : null;
  }
  return bindRuntimeValue(runtime2, "COMMENT_ANCHOR_VERSION", () => COMMENT_ANCHOR_VERSION, (value) => {
    COMMENT_ANCHOR_VERSION = value;
  }), bindRuntimeValue(runtime2, "COMMENT_ANCHOR_SEGMENT_PATTERN", () => COMMENT_ANCHOR_SEGMENT_PATTERN, (value) => {
    COMMENT_ANCHOR_SEGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "COMMENT_ANCHOR_HOST_SEGMENT_PATTERN", () => COMMENT_ANCHOR_HOST_SEGMENT_PATTERN, (value) => {
    COMMENT_ANCHOR_HOST_SEGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "COMMENT_ANCHOR_NODE_SEGMENT_PATTERN", () => COMMENT_ANCHOR_NODE_SEGMENT_PATTERN, (value) => {
    COMMENT_ANCHOR_NODE_SEGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "COMMENT_ANCHOR_POINT_SEGMENT_PATTERN", () => COMMENT_ANCHOR_POINT_SEGMENT_PATTERN, (value) => {
    COMMENT_ANCHOR_POINT_SEGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "COMMENT_ANCHOR_AREA_SEGMENT_PATTERN", () => COMMENT_ANCHOR_AREA_SEGMENT_PATTERN, (value) => {
    COMMENT_ANCHOR_AREA_SEGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "COMMENT_ANCHOR_HASH_CHARS", () => COMMENT_ANCHOR_HASH_CHARS, (value) => {
    COMMENT_ANCHOR_HASH_CHARS = value;
  }), bindRuntimeValue(runtime2, "commentAnchorScope", () => commentAnchorScope, (value) => {
    commentAnchorScope = value;
  }), bindRuntimeValue(runtime2, "setCommentAnchorScope", () => setCommentAnchorScope), bindRuntimeValue(runtime2, "hashScopedSlideId", () => hashScopedSlideId, (value) => {
    hashScopedSlideId = value;
  }), bindRuntimeValue(runtime2, "hashCommentAnchorId", () => hashCommentAnchorId), bindRuntimeValue(runtime2, "encodeCommentAnchorFraction", () => encodeCommentAnchorFraction, (value) => {
    encodeCommentAnchorFraction = value;
  }), bindRuntimeValue(runtime2, "decodeCommentAnchorFraction", () => decodeCommentAnchorFraction, (value) => {
    decodeCommentAnchorFraction = value;
  }), bindRuntimeValue(runtime2, "quantizeCommentAnchorFraction", () => quantizeCommentAnchorFraction, (value) => {
    quantizeCommentAnchorFraction = value;
  }), bindRuntimeValue(runtime2, "encodeCommentAnchorBox", () => encodeCommentAnchorBox, (value) => {
    encodeCommentAnchorBox = value;
  }), bindRuntimeValue(runtime2, "decodeCommentAnchorBox", () => decodeCommentAnchorBox, (value) => {
    decodeCommentAnchorBox = value;
  }), bindRuntimeValue(runtime2, "encodeSlideCommentAnchor", () => encodeSlideCommentAnchor), bindRuntimeValue(runtime2, "parseSlideCommentAnchor", () => parseSlideCommentAnchor), bindRuntimeValue(runtime2, "parseCommentFramePath", () => parseCommentFramePath), bindRuntimeValue(runtime2, "resolveCommentSlide", () => resolveCommentSlide), bindRuntimeValue(runtime2, "countOpenCommentsBySlide", () => countOpenCommentsBySlide), bindRuntimeValue(runtime2, "resolveCommentFrameId", () => resolveCommentFrameId), bindRuntimeValue(runtime2, "PROMOTED_FRAME_ID_PATTERN", () => PROMOTED_FRAME_ID_PATTERN, (value) => {
    PROMOTED_FRAME_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "encodePromotedFrameId", () => encodePromotedFrameId), bindRuntimeValue(runtime2, "parsePromotedFrameId", () => parsePromotedFrameId), bindRuntimeValue(runtime2, "resolvePromotedCommentFrame", () => resolvePromotedCommentFrame), () => {
    COMMENT_ANCHOR_VERSION = 1, COMMENT_ANCHOR_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{0,23}:nth-of-type\([1-9][0-9]{0,3}\)$/, COMMENT_ANCHOR_HOST_SEGMENT_PATTERN = /^(sl|fr)([0-9a-f]{12}):nth-of-type\(1\)$/, COMMENT_ANCHOR_NODE_SEGMENT_PATTERN = /^np(\d{1,3}(?:-\d{1,3})*):nth-of-type\(1\)$/, COMMENT_ANCHOR_POINT_SEGMENT_PATTERN = /^s([xb])(\d{4})(\d{4}):nth-of-type\(([1-9][0-9]{0,3})\)$/, COMMENT_ANCHOR_AREA_SEGMENT_PATTERN = /^s([gr])(\d{12}[0-3]?):nth-of-type\(([1-9][0-9]{0,3})\)$/, COMMENT_ANCHOR_HASH_CHARS = 12, commentAnchorScope = "", hashScopedSlideId = (slideId) => hashCommentAnchorId(commentAnchorScope === "" ? slideId : commentAnchorScope + "/" + slideId), encodeCommentAnchorFraction = (fraction) => String(Math.round(Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0.5)) * 9999)).padStart(4, "0"), decodeCommentAnchorFraction = (encoded) => Number(encoded) / 9999, quantizeCommentAnchorFraction = (fraction, edge) => {
      let scaled = Math.min(1, Math.max(0, fraction)) * 1e3;
      return Math.min(999, Math.max(0, edge ? Math.ceil(scaled - 1e-7) - 1 : Math.floor(scaled + 1e-7)));
    }, encodeCommentAnchorBox = (box) => {
      if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || !(box.x1 > box.x0 && box.y1 > box.y0) || box.corner != null && ![0, 1, 2, 3].includes(box.corner))
        return null;
      let value = quantizeCommentAnchorFraction(box.x0, !1), value2 = quantizeCommentAnchorFraction(box.y0, !1), callback = (input) => String(input).padStart(3, "0");
      return callback(value) + callback(value2) + callback(Math.max(value, quantizeCommentAnchorFraction(box.x1, !0))) + callback(Math.max(value2, quantizeCommentAnchorFraction(box.y1, !0))) + (box.corner != null ? String(box.corner) : "");
    }, decodeCommentAnchorBox = (segment) => {
      let value = /^(\d{3})(\d{3})(\d{3})(\d{3})([0-3])?$/.exec(segment);
      if (!value)
        return null;
      let [items, items2, items3, items4] = [
        Number(value[1]) / 1e3,
        Number(value[2]) / 1e3,
        (Number(value[3]) + 1) / 1e3,
        (Number(value[4]) + 1) / 1e3
      ];
      return items3 > items && items4 > items2 ? value[5] != null ? {
        x0: items,
        y0: items2,
        x1: items3,
        y1: items4,
        corner: Number(value[5])
      } : {
        x0: items,
        y0: items2,
        x1: items3,
        y1: items4
      } : null;
    }, PROMOTED_FRAME_ID_PATTERN = /^p([0-9a-f]{12})([rc])(\d{1,3}(?:_\d{1,3})*)-([0-9a-z]{8})$/;
  };
}
export {
  installCommentsAnchors
};
