// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelRichTextDom(runtime2) {
  var richTextUndoStates, replayingRichTextHistory, initializeRichTextDom;
  function textRunsForRange(text, marks, start, end) {
    let items = [], value = start;
    for (let value2 of marks) {
      if (value2.end <= start)
        continue;
      if (value2.start >= end)
        break;
      let value3 = Math.max(value2.start, start), value4 = Math.min(value2.end, end);
      value3 > value && items.push({
        text: text.slice(value, value3)
      });
      let state = {
        text: text.slice(value3, value4)
      };
      value2.bold && (state.bold = !0), value2.italic && (state.italic = !0), value2.underline && (state.underline = !0), value2.color !== void 0 && (state.color = value2.color), value2.href !== void 0 && (state.href = value2.href), items.push(state), value = value4;
    }
    return value < end && items.push({
      text: text.slice(value, end)
    }), items.filter((input) => input.text !== "");
  }
  function textLinesAsRuns(node) {
    let marks = node.marks ?? [], lines = [], lineStart = 0, text = node.text;
    for (let index4 = 0; index4 <= text.length; index4++)
      (index4 === text.length || text[index4] === `
`) && (lines.push(textRunsForRange(text, marks, lineStart, index4)), lineStart = index4 + 1);
    return lines;
  }
  function groupTextLinesByList(node) {
    let lineLists = (0, runtime2.textLineLists)(node), groups = [];
    return textLinesAsRuns(node).forEach((line, index4) => {
      let last = groups[groups.length - 1];
      last !== void 0 && last.list === lineLists[index4] ? last.lines.push(line) : groups.push({
        list: lineLists[index4] ?? null,
        lines: [line]
      });
    }), groups;
  }
  function readEditableRichText(element, trimTrailingPlainLines = !1) {
    let text = "", marks = [], lineKinds = [], lineIndex = 0, appendText = (input, options, kind) => {
      if (input === "")
        return;
      let length = text.length;
      text += input, lineKinds[lineIndex] = kind;
      for (let index4 = input.indexOf(`
`); index4 !== -1; index4 = input.indexOf(`
`, index4 + 1))
        lineKinds[++lineIndex] = kind;
      (options.bold !== void 0 || options.italic !== void 0 || options.underline !== void 0 || options.color !== void 0 || options.href !== void 0) && marks.push({
        start: length,
        end: text.length,
        ...options
      });
    }, callback = () => {
      text !== "" && !text.endsWith(`
`) && (text += `
`, lineIndex++);
    }, callback2 = (input, options, kind) => {
      if (input.nodeType === 3) {
        appendText(input.nodeValue ?? "", options, kind);
        return;
      }
      if (input.nodeType !== 1)
        return;
      let value2 = input, tagName = value2.tagName;
      if (tagName === "BR") {
        text += `
`, lineKinds[lineIndex++] = kind;
        return;
      }
      let value3 = options, flag = !1, childKind = kind;
      if (tagName === "B" || tagName === "STRONG")
        value3 = {
          ...options,
          bold: !0
        };
      else if (tagName === "I" || tagName === "EM")
        value3 = {
          ...options,
          italic: !0
        };
      else if (tagName === "U")
        value3 = {
          ...options,
          underline: !0
        };
      else if (tagName === "FONT") {
        let value4 = value2.getAttribute("color") ?? "";
        value3 = (0, runtime2.isSlideColor)(value4) ? {
          ...options,
          color: value4
        } : options;
      } else if (tagName === "A") {
        let value4 = value2.getAttribute("href") ?? "", value5 = value2.getAttribute("title") ?? "", value6 = /(?:^|\s)(https?:\/\/\S+)$/i.exec(value5)?.[1] ?? "", value7 = value4 !== "" ? value4 : value6;
        value3 = (0, runtime2.isSafeHyperlink)(value7) ? {
          ...options,
          href: value7
        } : options;
      } else
        tagName === "UL" || tagName === "OL" ? childKind = tagName === "UL" ? "bullet" : "number" : (tagName === "LI" || tagName === "DIV" || tagName === "P") && (flag = !0);
      flag && callback();
      for (let value4 of Array.from(input.childNodes))
        callback2(value4, value3, childKind);
      flag && callback();
    };
    if (callback2(element, {}, null), text.endsWith(`
`) && (text = text.slice(0, -1)), trimTrailingPlainLines) {
      let lines = text.split(`
`), count = lines.length;
      for (; count > 1 && lines[count - 1] === "" && (lineKinds[count - 1] ?? null) === null; )
        count--;
      count < lines.length && (lineKinds[count - 1] ?? null) !== null && (text = lines.slice(0, count).join(`
`));
    }
    let fields = (0, runtime2.textListFields)(text.split(`
`).map((_line, index4) => lineKinds[index4] ?? null)), list = fields.list, lineLists = fields.lineLists;
    if (list === void 0 && lineLists === void 0) {
      let value2 = text.split(`
`).filter((input) => input.trim() !== "");
      if (value2.length > 1 && (value2.every((input) => /^-\s+/.test(input)) ? list = "bullet" : value2.every((input) => /^\d+[.)]\s+/.test(input)) && (list = "number"), list !== void 0)) {
        let index4 = 0, text2 = "", items = [];
        for (let value3 of text.split(`
`)) {
          let value4 = /^(-\s+|\d+[.)]\s+)/.exec(value3);
          value4 !== null && items.push({
            at: index4,
            len: value4[1].length
          }), index4 += value3.length + 1;
        }
        let callback3 = (input) => {
          let index22 = 0;
          for (let value3 of items) {
            if (input <= value3.at)
              break;
            index22 += Math.min(value3.len, input - value3.at);
          }
          return input - index22;
        };
        for (let value3 of marks)
          value3.start = callback3(value3.start), value3.end = callback3(value3.end);
        index4 = 0, text2 = text.split(`
`).map((input) => input.replace(/^(-\s+|\d+[.)]\s+)/, "")).join(`
`), text = text2;
      }
    }
    let value = (0, runtime2.normalizeTextMarks)(marks, text);
    return {
      text,
      marks: value,
      list,
      lineLists
    };
  }
  function readRichTextSelection(element, node) {
    let selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0)
      return null;
    let range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer))
      return null;
    let callback = (input) => {
      let state2 = {
        bold: !1,
        italic: !1,
        underline: !1
      }, value3 = input.nodeType === 3 ? input.parentElement : input;
      for (; value3 !== null && value3 !== element; ) {
        let tagName = value3.tagName;
        if (tagName === "A" && (state2.inLink = !0), tagName === "B" || tagName === "STRONG")
          state2.bold = !0;
        else if (tagName === "I" || tagName === "EM")
          state2.italic = !0;
        else if (tagName === "U")
          state2.underline = !0;
        else if (tagName === "FONT" && state2.color === void 0) {
          let value4 = value3.getAttribute("color") ?? "";
          (0, runtime2.isSlideColor)(value4) && (state2.color = value4);
        } else if (tagName === "A" && state2.href === void 0) {
          let value4 = value3.getAttribute("href") ?? "", value5 = value3.getAttribute("title") ?? "", value6 = /(?:^|\s)(https?:\/\/\S+)$/i.exec(value5)?.[1] ?? "", value7 = value4 !== "" ? value4 : value6;
          (0, runtime2.isSafeHyperlink)(value7) && (state2.href = value7);
        } else
          (tagName === "UL" || tagName === "OL") && state2.list === void 0 && (state2.list = tagName === "UL" ? "bullet" : "number");
        value3 = value3.parentElement;
      }
      return state2;
    }, items = [];
    if (range.collapsed)
      items.push(range.startContainer);
    else {
      let value3 = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let value4 = value3.nextNode(); value4 !== null; value4 = value3.nextNode()) {
        let value5 = value4;
        (value5.nodeValue ?? "") !== "" && range.intersectsNode(value5) && (value5 === range.startContainer && range.startOffset >= value5.length || value5 === range.endContainer && range.endOffset === 0 || items.push(value5));
      }
      items.length === 0 && items.push(range.startContainer);
    }
    let value = items.map(callback), value2 = value[0], state = {
      bold: value.every((input) => input.bold),
      italic: value.every((input) => input.italic),
      underline: value.every((input) => input.underline)
    }, callback2 = (input) => (node?.(input) ?? input).toLowerCase();
    return value2.color !== void 0 && value.every((input) => input.color !== void 0 && callback2(input.color) === callback2(value2.color)) && (state.color = value2.color), value2.href !== void 0 && value.every((input) => input.href === value2.href) && (state.href = value2.href), value.some((input) => input.inLink) && (state.touchesLink = !0), value.some((input) => input.list !== value2.list) ? state.listMixed = !0 : value2.list !== void 0 && (state.list = value2.list), state;
  }
  function selectionAnchorElements(element, range) {
    let findAnchor = (input) => {
      let value2 = input.nodeType === 3 ? input.parentElement : input;
      for (; value2 !== null && value2 !== element; ) {
        if (value2.tagName === "A")
          return value2;
        value2 = value2.parentElement;
      }
      return null;
    }, anchors = [];
    if (range.collapsed)
      anchors.push(range.startContainer);
    else {
      let value2 = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let value3 = value2.nextNode(); value3 !== null; value3 = value2.nextNode()) {
        let value4 = value3;
        (value4.nodeValue ?? "") !== "" && range.intersectsNode(value4) && (value4 === range.startContainer && range.startOffset >= value4.length || value4 === range.endContainer && range.endOffset === 0 || anchors.push(value4));
      }
      anchors.length === 0 && anchors.push(range.startContainer);
    }
    let items = [];
    for (let value2 of anchors) {
      let value3 = findAnchor(value2);
      value3 !== null && !items.includes(value3) && items.push(value3);
    }
    if (items.length === 0)
      return null;
    for (let value2 of items) {
      if (value2.getAttribute("href") !== null)
        continue;
      let value3 = value2.getAttribute("title") ?? "", value4 = /(?:^|\s)(https?:\/\/\S+)$/i.exec(value3)?.[1] ?? "";
      (0, runtime2.isSafeHyperlink)(value4) && value2.setAttribute("href", value4);
    }
    let value = element.ownerDocument.createRange();
    return value.setStartBefore(items[0]), value.setEndAfter(items[items.length - 1]), {
      range: value,
      anchors: items
    };
  }
  function unwrapAnchorElements(anchors) {
    for (let value of anchors) {
      if (!value.isConnected)
        continue;
      let parentNode = value.parentNode;
      if (parentNode !== null) {
        for (; value.firstChild !== null; )
          parentNode.insertBefore(value.firstChild, value);
        parentNode.removeChild(value);
      }
    }
  }
  function clearRichTextUndoState(element) {
    richTextUndoStates.delete(element);
  }
  function richTextDomFingerprint(element) {
    let richText = readEditableRichText(element);
    return JSON.stringify([
      richText.text,
      richText.marks ?? null,
      richText.list ?? richText.lineLists ?? null
    ]);
  }
  function reconcileNativeRichTextHistory(element, event, dashOnly = !1) {
    if (replayingRichTextHistory)
      return;
    let entry = richTextUndoStates.get(element);
    richTextUndoStates.delete(element);
    let value = window.getSelection();
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      let isUndo = event.inputType === "historyUndo";
      if (entry === void 0 || !(isUndo ? entry.undoArmed : entry.redoArmed))
        return;
      if (entry.intermediate !== null) {
        if (richTextDomFingerprint(element) !== entry.intermediate)
          return;
        replayingRichTextHistory = !0;
        try {
          document.execCommand(isUndo ? "undo" : "redo");
        } finally {
          replayingRichTextHistory = !1;
        }
      }
      isUndo && value !== null && value.rangeCount > 0 && value.collapseToEnd(), richTextUndoStates.set(element, {
        intermediate: entry.intermediate,
        undoArmed: !isUndo,
        redoArmed: isUndo
      });
      return;
    }
    if (event.inputType !== "insertText" || event.data !== " " && event.data !== " " || value === null || value.rangeCount === 0 || !value.isCollapsed)
      return;
    let value2 = value.getRangeAt(0);
    if (!element.contains(value2.startContainer))
      return;
    let value3 = element, value4 = null;
    for (let value11 = value2.startContainer.nodeType === 3 ? value2.startContainer.parentElement : value2.startContainer; value11 !== null && value11 !== element; value11 = value11.parentElement) {
      let tagName = value11.tagName;
      (tagName === "UL" || tagName === "OL") && value4 === null && (value4 = tagName), value3 === element && (tagName === "DIV" || tagName === "LI" || tagName === "P") && (value3 = value11);
    }
    if (dashOnly && value4 === "OL")
      return;
    let value5 = dashOnly ? /^-[ \u00a0]$/ : value4 === "OL" ? /^1\.[ \u00a0]$/ : value4 === "UL" ? /^[-*][ \u00a0]$/ : /^(?:[-*]|1\.)[ \u00a0]$/, matchTrigger = (input) => {
      let trimmed = input.replace(/^\n+/, "");
      return value5.test(trimmed) ? trimmed : null;
    }, value6 = document.createRange();
    value6.setStart(value3, 0);
    let value7 = value2.startContainer;
    for (; value7 !== null && value7 !== value3 && value7.parentNode !== value3; )
      value7 = value7.parentNode;
    for (let value11 = value4 === null && value7 !== value3 ? value7?.previousSibling ?? null : null; value11 !== null; value11 = value11.previousSibling)
      if (!(value11.nodeType !== 1 || !/^(?:DIV|P|UL|OL)$/.test(value11.tagName))) {
        value6.setStartAfter(value11);
        break;
      }
    if (value6.setEnd(value2.startContainer, value2.startOffset), value4 !== null && matchTrigger(value6.toString()) === null)
      return;
    let value8 = Array.from(value3.querySelectorAll("br")).filter((input) => value6.intersectsNode(input)).pop();
    if (value8 !== void 0 && value6.setStartAfter(value8), matchTrigger(value6.toString()) === null)
      return;
    let value9 = document.createTreeWalker(value3, NodeFilter.SHOW_TEXT);
    for (let value11 = value9.nextNode(); value11 !== null; value11 = value9.nextNode()) {
      if (!value6.intersectsNode(value11))
        continue;
      let data = value11.data, value12 = value11 === value2.startContainer ? value2.startOffset : data.length, value13 = value12 === 0 ? -1 : data.lastIndexOf(`
`, value12 - 1);
      value13 !== -1 && value6.setStart(value11, value13 + 1);
    }
    let trigger = matchTrigger(value6.toString());
    if (trigger === null)
      return;
    if (value4 === null) {
      let value11 = readEditableRichText(element);
      if (value11.list !== void 0 && element.querySelector("ul, ol") === null || dashOnly && value11.text.split(`
`).filter((input) => input.trim() !== "").length > 1)
        return;
    }
    value2.startContainer.nodeType === 3 && value2.startOffset >= trigger.length && value6.setStart(value2.startContainer, value2.startOffset - trigger.length), value.removeAllRanges(), value.addRange(value6), document.execCommand("delete");
    let value10 = value4 === null ? richTextDomFingerprint(element) : null;
    value4 === null && (document.execCommand("styleWithCSS", !1, "false"), document.execCommand(trigger.startsWith("1") ? "insertOrderedList" : "insertUnorderedList")), richTextUndoStates.set(element, {
      intermediate: value10,
      undoArmed: !0,
      redoArmed: !1
    });
  }
  function caretAtListItemStart(element) {
    let selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0 || !selection.isCollapsed)
      return !1;
    let range = selection.getRangeAt(0), item = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer)?.closest("li") ?? null;
    if (item === null || !element.contains(item))
      return !1;
    let before = document.createRange();
    return before.setStart(item, 0), before.setEnd(range.startContainer, range.startOffset), before.toString() === "" && !Array.from(item.querySelectorAll("br")).some((br) => before.intersectsNode(br));
  }
  return bindRuntimeValue(runtime2, "textRunsForRange", () => textRunsForRange), bindRuntimeValue(runtime2, "textLinesAsRuns", () => textLinesAsRuns), bindRuntimeValue(runtime2, "readEditableRichText", () => readEditableRichText), bindRuntimeValue(runtime2, "groupTextLinesByList", () => groupTextLinesByList), bindRuntimeValue(runtime2, "caretAtListItemStart", () => caretAtListItemStart), bindRuntimeValue(runtime2, "readRichTextSelection", () => readRichTextSelection), bindRuntimeValue(runtime2, "selectionAnchorElements", () => selectionAnchorElements), bindRuntimeValue(runtime2, "unwrapAnchorElements", () => unwrapAnchorElements), bindRuntimeValue(runtime2, "clearRichTextUndoState", () => clearRichTextUndoState), bindRuntimeValue(runtime2, "richTextDomFingerprint", () => richTextDomFingerprint), bindRuntimeValue(runtime2, "reconcileNativeRichTextHistory", () => reconcileNativeRichTextHistory), bindRuntimeValue(runtime2, "richTextUndoStates", () => richTextUndoStates, (value) => {
    richTextUndoStates = value;
  }), bindRuntimeValue(runtime2, "replayingRichTextHistory", () => replayingRichTextHistory, (value) => {
    replayingRichTextHistory = value;
  }), bindRuntimeValue(runtime2, "initializeRichTextDom", () => initializeRichTextDom, (value) => {
    initializeRichTextDom = value;
  }), () => {
    replayingRichTextHistory = !1, initializeRichTextDom = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), richTextUndoStates = /* @__PURE__ */ new WeakMap();
    });
  };
}
export {
  installModelRichTextDom
};
