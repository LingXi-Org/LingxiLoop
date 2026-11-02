// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsLabels(runtime2) {
  var COMMENT_LABEL_MAX_UTF8_BYTES, COMMENT_DETAIL_MAX_UTF8_BYTES, COMMENT_LABEL_MAX_CODEPOINTS, commentLabelTextEncoder, commentLabelByteLength, quoteCommentLabelText, COMMENT_LABEL_BREADCRUMB, COMMENT_AREA_MAX_DESCRIBED_ELEMENTS, COMMENT_DETAIL_MAX_CODEPOINTS, slideDiagnosticIdSuffix, parenthesizeCommentAreaPart;
  function replaceUnpairedSurrogates(text) {
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
  }
  function normalizeCommentLabelText(text, maxChars = 40) {
    let characters = Array.from(replaceUnpairedSurrogates(text ?? "").replace(/\s+/g, " ").trim().replace(/"/g, "’"));
    return characters.length <= maxChars ? characters.join("") : characters.slice(0, Math.max(0, maxChars - 1)).join("").trimEnd() + "…";
  }
  function truncateCommentLabelToBytes(text, maxBytes) {
    if (commentLabelByteLength(text) <= maxBytes)
      return text;
    let characters = Array.from(text), length = characters.length;
    for (; length > 0 && commentLabelByteLength(characters.slice(0, length).join("").trimEnd() + "…") > maxBytes; )
      length--;
    return characters.slice(0, length).join("").trimEnd() + "…";
  }
  function localizedCommentLabel(key, fallback, ...args) {
    let labels = globalThis.slidesHost?.commentLabels, value = typeof labels?.[key] == "function" ? labels[key](...args) : void 0;
    return typeof value == "string" && value !== "" ? value : fallback;
  }
  function getTextNodeRoleLabel(node, typeStyles) {
    let theme = (0, runtime2.getRenderingTheme)(), style = (0, runtime2.findExactTypographyStyle)(node, typeStyles ?? (0, runtime2.systemTypographyStyles)(theme), theme), role = style?.role ?? node.role, name = style?.name ?? runtime2.textRoleLabels[node.role];
    return name === runtime2.textRoleLabels[role] ? localizedCommentLabel("textRole", name, role) : name;
  }
  function describeCommentElementKind(node, fallback) {
    return localizedCommentLabel("element", fallback, node.kind === "shape" ? { kind: node.kind, shape: node.shape } : node.kind === "table" ? { kind: node.kind, rows: node.rows.length, cols: node.cols } : { kind: node.kind });
  }
  function describeCommentNode(node, typeStyles) {
    switch (node.kind) {
      case "text":
        return {
          kind: getTextNodeRoleLabel(node, typeStyles),
          text: node.text
        };
      case "img":
        return {
          kind: describeCommentElementKind(node, "Image"),
          text: node.alt
        };
      case "icon":
        return {
          kind: describeCommentElementKind(node, "Icon"),
          text: node.icon
        };
      case "stack":
        return {
          kind: describeCommentElementKind(node, "Group"),
          text: (0, runtime2.nodeTextLabel)(node)
        };
      case "grid":
        return {
          kind: describeCommentElementKind(node, "Grid"),
          text: (0, runtime2.nodeTextLabel)(node)
        };
      case "overlay":
        return {
          kind: describeCommentElementKind(node, "Overlay"),
          text: (0, runtime2.nodeTextLabel)(node)
        };
      case "shape":
      case "html":
      case "table":
      case "spacer":
        return {
          kind: describeCommentElementKind(node, (0, runtime2.nodeDisplayLabel)(node)),
          text: void 0
        };
    }
  }
  function formatFrameCommentLabel(slideNumber, slide, anchor, typeStyles) {
    let prefix = localizedCommentLabel("slide", "幻灯片 " + String(slideNumber), slideNumber);
    if (anchor.kind === "slide")
      return buildCommentLabel(prefix, "", normalizeCommentLabelText((0, runtime2.slideDisplayLabel)(slide)));
    let value = (0, runtime2.frameById)(slide, anchor.frameId);
    if (!value)
      return prefix;
    let value2 = (0, runtime2.nodeAtPath)(value.node, anchor.path), value3 = describeCommentNode(value2 ?? value.node, typeStyles);
    return buildCommentLabel(prefix, COMMENT_LABEL_BREADCRUMB + value3.kind, normalizeCommentLabelText(getCommentTableCellText(value2, anchor.cell)?.text ?? value3.text));
  }
  function formatFrameCommentDetail(slideNumber, slide, anchor) {
    let prefix = "幻灯片 " + String(slideNumber) + slideDiagnosticIdSuffix(slide);
    if (anchor.kind === "slide")
      return buildCommentLabel(prefix, "", normalizeCommentLabelText((0, runtime2.slideDisplayLabel)(slide), COMMENT_DETAIL_MAX_CODEPOINTS), "", COMMENT_DETAIL_MAX_UTF8_BYTES);
    let value = (0, runtime2.frameById)(slide, anchor.frameId);
    if (!value)
      return prefix;
    let value2 = (0, runtime2.nodeAtPath)(value.node, anchor.path), value3 = value2 ?? value.node, value4 = value2 ? anchor.path : [], value5 = getCommentTableCellText(value2, anchor.cell), value6 = normalizeCommentLabelText(value5 ? value5.text : getCommentNodeText(value3), COMMENT_DETAIL_MAX_CODEPOINTS), callback = (input) => (0, runtime2.normalizeObjectContextIds)([
      [anchor.frameId, ...input].join("/")
    ])[0], value7 = callback(value5 ? [...value4, value5.r, value5.c] : value4);
    if (value7 !== void 0)
      return buildCommentLabel(prefix, ": " + value7 + " " + (value5 ? "cell" : value3.kind), value6, "", COMMENT_DETAIL_MAX_UTF8_BYTES);
    let value8 = value5 ? "cell " + String(value5.r) + "/" + String(value5.c) : value3.kind;
    for (let length = value4.length; length >= 0; length--) {
      let value9 = callback(value4.slice(0, length));
      if (value9 !== void 0)
        return buildCommentLabel(prefix, ": " + value9 + " " + ((0, runtime2.nodeAtPath)(value.node, value4.slice(0, length)) ?? value.node).kind + COMMENT_LABEL_BREADCRUMB + value8, value6, "", COMMENT_DETAIL_MAX_UTF8_BYTES);
    }
    return buildCommentLabel(prefix, ": " + value8, value6, "", COMMENT_DETAIL_MAX_UTF8_BYTES);
  }
  function getCommentTableCellText(node, cell) {
    let text = cell && node?.kind === "table" ? node.rows[cell.r]?.[cell.c] : void 0;
    if (cell && text !== void 0)
      return {
        ...cell,
        text
      };
  }
  function describeFrameCommentAnchor(slideNumber, slide, anchor, typeStyles) {
    return {
      label: formatFrameCommentLabel(slideNumber, slide, anchor, typeStyles),
      detail: formatFrameCommentDetail(slideNumber, slide, anchor)
    };
  }
  function describeAreaCommentAnchor(slideNumber, slide, area, typeStyles) {
    let value = localizedCommentLabel("slide", "幻灯片 " + String(slideNumber), slideNumber), value2 = area.covered.length === 0 ? "" : localizedCommentLabel("covered", " · " + String(area.covered.length) + (area.covered.length === 1 ? " element" : " elements"), area.covered.length), value3 = (area.part ? localizedCommentLabel("areaPart", parenthesizeCommentAreaPart(area.part), area.part) : "") + value2, value4 = area.within ? resolveCommentNode(slide, area.within) : void 0;
    if (!value4)
      return value + value3;
    let value5 = describeCommentNode(value4, typeStyles);
    return buildCommentLabel(value, COMMENT_LABEL_BREADCRUMB + value5.kind, normalizeCommentLabelText(value5.text), value3);
  }
  function formatAreaCommentDetail(slideNumber, slide, area) {
    let callback = (input) => [input.frameId, ...input.path].join("/"), callback2 = (input, options) => {
      let value2 = resolveCommentNode(slide, input), [value3] = (0, runtime2.normalizeObjectContextIds)([
        callback(input)
      ]);
      if (!value2 || value3 === void 0)
        return null;
      let value4 = options === null ? "" : normalizeCommentLabelText(getCommentNodeText(value2), options);
      return value3 + " " + value2.kind + quoteCommentLabelText(value4);
    }, value = slideDiagnosticIdSuffix(slide), callback3 = (input, options) => {
      let value2 = area.within ? callback2(area.within, input) : null, value3 = "Area on slide " + String(slideNumber) + value + (value2 !== null ? " in " + value2 : "") + " (" + (area.part || "whole") + ")", value4 = area.covered.slice(0, options).map((input2) => callback2(input2, input)).filter((input2) => input2 !== null), value5 = area.covered.length - value4.length;
      return value5 > 0 && value4.push("+" + String(value5) + " more"), value3 + (value4.length > 0 ? ": " + value4.join(", ") : "");
    }, items = [
      [COMMENT_LABEL_MAX_CODEPOINTS, COMMENT_AREA_MAX_DESCRIBED_ELEMENTS],
      [16, COMMENT_AREA_MAX_DESCRIBED_ELEMENTS],
      [null, COMMENT_AREA_MAX_DESCRIBED_ELEMENTS],
      [null, 4],
      [null, 2],
      [null, 0]
    ];
    for (let [value2, value3] of items) {
      let value4 = callback3(value2, value3);
      if (commentLabelByteLength(value4) <= COMMENT_DETAIL_MAX_UTF8_BYTES)
        return value4;
    }
    return truncateCommentLabelToBytes(callback3(null, 0), COMMENT_DETAIL_MAX_UTF8_BYTES);
  }
  function resolveCommentNode(slide, target) {
    let frame = (0, runtime2.frameById)(slide, target.frameId);
    if (frame)
      return (0, runtime2.nodeAtPath)(frame.node, target.path);
  }
  function getCommentNodeText(node) {
    switch (node.kind) {
      case "text":
        return node.text;
      case "img":
        return node.alt;
      case "icon":
        return node.icon;
      case "stack":
      case "grid":
      case "overlay":
        return (0, runtime2.nodeTextLabel)(node);
      case "shape":
        return (0, runtime2.nodeDisplayLabel)(node);
      case "table":
      case "html":
      case "spacer":
        return;
    }
  }
  function buildCommentLabel(prefix, kindSuffix, text, detailSuffix = "", maxBytes = COMMENT_LABEL_MAX_UTF8_BYTES) {
    let label = prefix + kindSuffix, textBytes = maxBytes - commentLabelByteLength(label) - commentLabelByteLength(detailSuffix) - 3;
    return label + (textBytes >= 4 ? quoteCommentLabelText(truncateCommentLabelToBytes(text, textBytes)) : "") + detailSuffix;
  }
  return bindRuntimeValue(runtime2, "COMMENT_LABEL_MAX_UTF8_BYTES", () => COMMENT_LABEL_MAX_UTF8_BYTES, (value) => {
    COMMENT_LABEL_MAX_UTF8_BYTES = value;
  }), bindRuntimeValue(runtime2, "COMMENT_DETAIL_MAX_UTF8_BYTES", () => COMMENT_DETAIL_MAX_UTF8_BYTES, (value) => {
    COMMENT_DETAIL_MAX_UTF8_BYTES = value;
  }), bindRuntimeValue(runtime2, "COMMENT_LABEL_MAX_CODEPOINTS", () => COMMENT_LABEL_MAX_CODEPOINTS, (value) => {
    COMMENT_LABEL_MAX_CODEPOINTS = value;
  }), bindRuntimeValue(runtime2, "commentLabelTextEncoder", () => commentLabelTextEncoder, (value) => {
    commentLabelTextEncoder = value;
  }), bindRuntimeValue(runtime2, "commentLabelByteLength", () => commentLabelByteLength, (value) => {
    commentLabelByteLength = value;
  }), bindRuntimeValue(runtime2, "replaceUnpairedSurrogates", () => replaceUnpairedSurrogates), bindRuntimeValue(runtime2, "normalizeCommentLabelText", () => normalizeCommentLabelText), bindRuntimeValue(runtime2, "quoteCommentLabelText", () => quoteCommentLabelText, (value) => {
    quoteCommentLabelText = value;
  }), bindRuntimeValue(runtime2, "truncateCommentLabelToBytes", () => truncateCommentLabelToBytes), bindRuntimeValue(runtime2, "COMMENT_LABEL_BREADCRUMB", () => COMMENT_LABEL_BREADCRUMB, (value) => {
    COMMENT_LABEL_BREADCRUMB = value;
  }), bindRuntimeValue(runtime2, "COMMENT_AREA_MAX_DESCRIBED_ELEMENTS", () => COMMENT_AREA_MAX_DESCRIBED_ELEMENTS, (value) => {
    COMMENT_AREA_MAX_DESCRIBED_ELEMENTS = value;
  }), bindRuntimeValue(runtime2, "COMMENT_DETAIL_MAX_CODEPOINTS", () => COMMENT_DETAIL_MAX_CODEPOINTS, (value) => {
    COMMENT_DETAIL_MAX_CODEPOINTS = value;
  }), bindRuntimeValue(runtime2, "slideDiagnosticIdSuffix", () => slideDiagnosticIdSuffix, (value) => {
    slideDiagnosticIdSuffix = value;
  }), bindRuntimeValue(runtime2, "getTextNodeRoleLabel", () => getTextNodeRoleLabel), bindRuntimeValue(runtime2, "describeCommentNode", () => describeCommentNode), bindRuntimeValue(runtime2, "formatFrameCommentLabel", () => formatFrameCommentLabel), bindRuntimeValue(runtime2, "formatFrameCommentDetail", () => formatFrameCommentDetail), bindRuntimeValue(runtime2, "getCommentTableCellText", () => getCommentTableCellText), bindRuntimeValue(runtime2, "describeFrameCommentAnchor", () => describeFrameCommentAnchor), bindRuntimeValue(runtime2, "parenthesizeCommentAreaPart", () => parenthesizeCommentAreaPart, (value) => {
    parenthesizeCommentAreaPart = value;
  }), bindRuntimeValue(runtime2, "describeAreaCommentAnchor", () => describeAreaCommentAnchor), bindRuntimeValue(runtime2, "formatAreaCommentDetail", () => formatAreaCommentDetail), bindRuntimeValue(runtime2, "resolveCommentNode", () => resolveCommentNode), bindRuntimeValue(runtime2, "getCommentNodeText", () => getCommentNodeText), bindRuntimeValue(runtime2, "buildCommentLabel", () => buildCommentLabel), () => {
    COMMENT_LABEL_MAX_UTF8_BYTES = 128, COMMENT_DETAIL_MAX_UTF8_BYTES = 512, COMMENT_LABEL_MAX_CODEPOINTS = 40, commentLabelTextEncoder = new TextEncoder(), commentLabelByteLength = (input) => commentLabelTextEncoder.encode(input).length, quoteCommentLabelText = (input) => input ? ' "' + input + '"' : "", (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeTypographyInference)(), COMMENT_LABEL_BREADCRUMB = " › ", COMMENT_AREA_MAX_DESCRIBED_ELEMENTS = 8, COMMENT_DETAIL_MAX_CODEPOINTS = 300, slideDiagnosticIdSuffix = (input) => (0, runtime2.frameContextId)(input.id) !== null ? " #" + input.id : "", parenthesizeCommentAreaPart = (part) => part ? " (" + part + ")" : "";
  };
}
export {
  installCommentsLabels
};
