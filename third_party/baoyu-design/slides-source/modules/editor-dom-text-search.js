// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorDomTextSearch(runtime2) {
  var SPECIAL_SEARCH_LOWERCASE_PATTERN, SEARCH_CHARACTER_FOLDS, SEARCH_FOLDED_CHARACTER_PATTERN, normalizeSearchCharacter, SEARCH_BLOCK_TAGS, SEARCH_SKIPPED_TAGS, MAX_SEARCH_DOM_NODES, MAX_SEARCH_CHARACTERS, SEARCH_COLLAPSIBLE_WHITESPACE;
  function normalizeSearchText(text) {
    let value = text.toLowerCase();
    if (value.length === text.length && !SPECIAL_SEARCH_LOWERCASE_PATTERN.test(text))
      return value.replace(SEARCH_FOLDED_CHARACTER_PATTERN, normalizeSearchCharacter);
    let text2 = "";
    for (let index4 = 0; index4 < text.length; index4++) {
      let value2 = text[index4].toLowerCase();
      text2 += value2.length === 1 ? value2 : text[index4];
    }
    return text2.replace(SEARCH_FOLDED_CHARACTER_PATTERN, normalizeSearchCharacter);
  }
  function findTextOffsets(text, query) {
    if (query === "")
      return [];
    let value = normalizeSearchText(text), value2 = normalizeSearchText(query), items = [];
    for (let value3 = value.indexOf(value2); value3 !== -1; value3 = value.indexOf(value2, value3 + value2.length))
      items.push(value3);
    return items;
  }
  function collapseSearchWhitespace(text) {
    return text.replace(SEARCH_COLLAPSIBLE_WHITESPACE, " ");
  }
  function searchWhitespaceMode(whiteSpace, element) {
    return whiteSpace === "pre-line" ? "keep-newlines" : whiteSpace === "normal" || whiteSpace === "nowrap" || whiteSpace === "" && element.closest("pre, textarea") === null ? "all" : "none";
  }
  function isSearchBlockElement(element, display) {
    return element.tagName === "BR" ? !0 : display === "" ? SEARCH_BLOCK_TAGS.has(element.tagName) : display !== "inline" && display !== "contents" && display !== "inline-block" && display !== "inline-flex";
  }
  function isInvisibleSearchAncestor(element) {
    let defaultView = element.ownerDocument.defaultView, flag = !1;
    for (let value = element; value !== null; value = value.parentElement)
      if (parseFloat(defaultView?.getComputedStyle(value).opacity ?? "") === 0) {
        if (!(value.getAnimations?.() ?? []).some((input) => input.playState === "running" && input.effect?.getKeyframes?.().some((input2) => "opacity" in input2) === !0))
          return !1;
        flag = !0;
      }
    return flag;
  }
  function isVisibleSearchElement(element, style) {
    let value = style?.visibility ?? "";
    if (value !== "" && value !== "visible")
      return !1;
    let value2 = element;
    for (; value2 !== null && (value2 === element ? style?.display : value2.ownerDocument.defaultView?.getComputedStyle(value2).display) === "contents"; )
      value2 = value2.parentElement;
    let value3 = value2?.checkVisibility;
    return value2 === null || typeof value3 != "function" || value3.call(value2, {
      opacityProperty: !0,
      checkOpacity: !0
    }) ? !0 : value3.call(value2, {}) && isInvisibleSearchAncestor(value2);
  }
  function visitSearchTextRuns(container, skip, onRun) {
    let defaultView = container.ownerDocument.defaultView, items = [], state = {
      text: "",
      nodes: [],
      nodeAt: [],
      offsetAt: [],
      collapses: !1
    }, text = "", index4 = 0, value = MAX_SEARCH_CHARACTERS, flag = !0, callback = () => {
      state.collapses && text === " " && (items.pop(), state.nodeAt.pop(), state.offsetAt.pop()), items.length > 0 && flag && (state.text = items.join(""), flag = onRun(state)), items = [], state = {
        text: "",
        nodes: [],
        nodeAt: [],
        offsetAt: [],
        collapses: !1
      }, text = "";
    }, callback2 = (input, options) => {
      let data = input.data, value2 = state.nodes.push(input) - 1;
      options !== "none" && (state.collapses = !0);
      for (let index22 = 0; index22 < data.length && value > 0; index22++, value--) {
        let value3 = data[index22];
        if (options !== "none" && (value3 === " " || value3 === "	" || value3 === "\r" || value3 === "\f" || value3 === " " || value3 === " " || value3 === " " || value3 === `
` && options === "all")) {
          if (text === "" || text === " " || text === `
`)
            continue;
          value3 = " ";
        }
        items.push(value3), state.nodeAt.push(value2), state.offsetAt.push(index22), text = value3;
      }
    }, callback3 = (input) => {
      if (!flag || SEARCH_SKIPPED_TAGS.has(input.tagName.toUpperCase()) || skip?.(input) === !0)
        return;
      let value2 = defaultView?.getComputedStyle(input), value3 = value2?.display ?? "";
      if (value3 === "none")
        return;
      let value4 = input !== container && isSearchBlockElement(input, value3);
      value4 && callback();
      let value5, text2 = "none";
      for (let firstChild = input.firstChild; firstChild !== null && flag; firstChild = firstChild.nextSibling) {
        if (++index4 > MAX_SEARCH_DOM_NODES) {
          flag = !1;
          return;
        }
        firstChild.nodeType === 3 ? (value5 === void 0 && (value5 = isVisibleSearchElement(input, value2), text2 = value5 ? searchWhitespaceMode(value2?.whiteSpace ?? "", input) : "none"), value5 && callback2(firstChild, text2)) : firstChild.nodeType === 1 && callback3(firstChild);
      }
      value4 && callback();
    };
    callback3(container), callback();
  }
  function findDomTextRanges(container, query, options = {}) {
    let items = [], value = options.limit ?? 1 / 0, value2 = container.ownerDocument.defaultView?.StaticRange, value3 = collapseSearchWhitespace(query);
    return visitSearchTextRuns(container, options.skip, (input) => {
      let value4 = input.collapses ? value3 : query;
      for (let value5 of findTextOffsets(input.text, value4)) {
        if (items.length >= value)
          return !1;
        let value6 = value5 + value4.length - 1, state = {
          node: input.nodes[input.nodeAt[value5]],
          offset: input.offsetAt[value5]
        }, state2 = {
          node: input.nodes[input.nodeAt[value6]],
          offset: input.offsetAt[value6] + 1
        };
        if (typeof value2 == "function") {
          items.push(new value2({
            startContainer: state.node,
            startOffset: state.offset,
            endContainer: state2.node,
            endOffset: state2.offset
          }));
          continue;
        }
        let value7 = container.ownerDocument.createRange();
        value7.setStart(state.node, state.offset), value7.setEnd(state2.node, state2.offset), items.push(value7);
      }
      return !0;
    }), items;
  }
  function liveRangeFromStaticRange(staticRange) {
    let ownerDocument2 = staticRange.startContainer.ownerDocument;
    if (!ownerDocument2 || !staticRange.startContainer.isConnected || !staticRange.endContainer.isConnected)
      return null;
    let value = ownerDocument2.createRange();
    return value.setStart(staticRange.startContainer, staticRange.startOffset), value.setEnd(staticRange.endContainer, staticRange.endOffset), value;
  }
  function findRangeRectangle(range) {
    try {
      return liveRangeFromStaticRange(range)?.getBoundingClientRect() ?? null;
    } catch {
      return null;
    }
  }
  return bindRuntimeValue(runtime2, "SPECIAL_SEARCH_LOWERCASE_PATTERN", () => SPECIAL_SEARCH_LOWERCASE_PATTERN, (value) => {
    SPECIAL_SEARCH_LOWERCASE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "SEARCH_CHARACTER_FOLDS", () => SEARCH_CHARACTER_FOLDS, (value) => {
    SEARCH_CHARACTER_FOLDS = value;
  }), bindRuntimeValue(runtime2, "SEARCH_FOLDED_CHARACTER_PATTERN", () => SEARCH_FOLDED_CHARACTER_PATTERN, (value) => {
    SEARCH_FOLDED_CHARACTER_PATTERN = value;
  }), bindRuntimeValue(runtime2, "normalizeSearchCharacter", () => normalizeSearchCharacter, (value) => {
    normalizeSearchCharacter = value;
  }), bindRuntimeValue(runtime2, "normalizeSearchText", () => normalizeSearchText), bindRuntimeValue(runtime2, "findTextOffsets", () => findTextOffsets), bindRuntimeValue(runtime2, "SEARCH_BLOCK_TAGS", () => SEARCH_BLOCK_TAGS, (value) => {
    SEARCH_BLOCK_TAGS = value;
  }), bindRuntimeValue(runtime2, "SEARCH_SKIPPED_TAGS", () => SEARCH_SKIPPED_TAGS, (value) => {
    SEARCH_SKIPPED_TAGS = value;
  }), bindRuntimeValue(runtime2, "MAX_SEARCH_DOM_NODES", () => MAX_SEARCH_DOM_NODES, (value) => {
    MAX_SEARCH_DOM_NODES = value;
  }), bindRuntimeValue(runtime2, "MAX_SEARCH_CHARACTERS", () => MAX_SEARCH_CHARACTERS, (value) => {
    MAX_SEARCH_CHARACTERS = value;
  }), bindRuntimeValue(runtime2, "SEARCH_COLLAPSIBLE_WHITESPACE", () => SEARCH_COLLAPSIBLE_WHITESPACE, (value) => {
    SEARCH_COLLAPSIBLE_WHITESPACE = value;
  }), bindRuntimeValue(runtime2, "collapseSearchWhitespace", () => collapseSearchWhitespace), bindRuntimeValue(runtime2, "searchWhitespaceMode", () => searchWhitespaceMode), bindRuntimeValue(runtime2, "isSearchBlockElement", () => isSearchBlockElement), bindRuntimeValue(runtime2, "isInvisibleSearchAncestor", () => isInvisibleSearchAncestor), bindRuntimeValue(runtime2, "isVisibleSearchElement", () => isVisibleSearchElement), bindRuntimeValue(runtime2, "visitSearchTextRuns", () => visitSearchTextRuns), bindRuntimeValue(runtime2, "findDomTextRanges", () => findDomTextRanges), bindRuntimeValue(runtime2, "liveRangeFromStaticRange", () => liveRangeFromStaticRange), bindRuntimeValue(runtime2, "findRangeRectangle", () => findRangeRectangle), () => {
    SPECIAL_SEARCH_LOWERCASE_PATTERN = /[\u03a3\ud800-\udfff]/, SEARCH_CHARACTER_FOLDS = /* @__PURE__ */ new Map([
      [" ", " "],
      [" ", " "],
      [" ", " "],
      ["ς", "σ"],
      ["‘", "'"],
      ["’", "'"],
      ["“", '"'],
      ["”", '"']
    ]), SEARCH_FOLDED_CHARACTER_PATTERN = new RegExp("[" + [...SEARCH_CHARACTER_FOLDS.keys()].join("") + "]", "g"), normalizeSearchCharacter = (character) => SEARCH_CHARACTER_FOLDS.get(character) ?? character, SEARCH_BLOCK_TAGS = /* @__PURE__ */ new Set([
      "ADDRESS",
      "ARTICLE",
      "ASIDE",
      "BLOCKQUOTE",
      "DD",
      "DIV",
      "DL",
      "DT",
      "FIGCAPTION",
      "FIGURE",
      "FOOTER",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HEADER",
      "HR",
      "LI",
      "MAIN",
      "NAV",
      "OL",
      "P",
      "PRE",
      "SECTION",
      "TABLE",
      "TBODY",
      "TD",
      "TFOOT",
      "TH",
      "THEAD",
      "TR",
      "UL"
    ]), SEARCH_SKIPPED_TAGS = /* @__PURE__ */ new Set([
      "SCRIPT",
      "STYLE",
      "TEMPLATE",
      "NOSCRIPT",
      "TEXTAREA",
      "IFRAME"
    ]), MAX_SEARCH_DOM_NODES = 2e5, MAX_SEARCH_CHARACTERS = 2e6, SEARCH_COLLAPSIBLE_WHITESPACE = /[ \t\n\r\f\u00a0\u2007\u202f]+/g;
  };
}
export {
  installEditorDomTextSearch
};
