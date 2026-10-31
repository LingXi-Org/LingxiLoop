// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue, htmlNamedEntityTable } from "../module-helpers.js";
function installCompilerHtml(runtime2) {
  var HtmlSourceCursor, SlideHtmlCompiler, slideHtmlPrefixPattern, htmlVoidElementNames, htmlRawTextElementNames, htmlBlockElementNames, htmlOptionalClosingElementNames, htmlNamedEntities, HtmlParseError, cssBoxSideNames, cssBorderSideWidthFields, containerPaddingBounds, slideBoxShadowBounds, shapeStrokeBounds, diagnosticCssPropertyNames, diagnosticCssPropertyName, diagnosticHtmlTagLabel, connectorAttributeNames, videoAttributeNames, imageVideoAttributeNames, blockTextElementNames, cssAlignmentMap, cssJustificationMap, genericFontFallbackKinds, webSafeFontAliases, webSafeFallbackFaces, specialGenericFontFaces, supportedSlideHtmlElementNames, supportedInlineElementNames, inlineFormatElementNames, flattenableInlineElementNames, unsafeSvgMarkupRules, unsupportedSvgAnimationRules, nonRenderingSvgElementNames, forbiddenSvgElementNames, svgExternalResourceAttributes, svgTagTokenPattern, svgAttributeTokenPattern, svgNamespace, xlinkNamespace, htmlWindows1252CodePoints, isInvalidXmlCodePoint, htmlCompilerCounters, inheritedInlineStyles, elementInlineStyle, compileWarningCodes, estimatedGlyphWidthFactor, estimatedLongWordWidthFactor, importedHtmlTypeScale, htmlHeadingNames, slideHtmlIconNames, mediaHtmlElementNames, iconPlaceholderLabel, genericIconPlaceholderLabel, elementPlaceholderLabel, neutralHtmlShadowPresets, htmlTagTextRoles, simpleCssColorSource, transparentContainerBorderPattern, noBorderPattern, transparentContainerFillPattern, transparentContainerStylePatterns, fontFaceRulesPattern, initializeHtmlCompiler, textBoxLayoutStylePattern, dataRoleElementNames, plainCellStylePropertyPattern, cellColorDeclarationPattern;
  const isPlainInlineStyle = (style) => /^[A-Za-z0-9#(),.%:; \t\n\r\f-]*$/.test(style) && style.split("(").length === style.split(")").length, cssDeclarationName = (declaration) => declaration.slice(0, Math.max(declaration.indexOf(":"), 0)).trim().toLowerCase(), isPlainCellStyle = (style) => isPlainInlineStyle(style) && style.split(";").every((declaration) => declaration.trim() === "" || plainCellStylePropertyPattern.test(cssDeclarationName(declaration))), hasOnlyPlainInlineChildren = (element) => element.children.every((child) => child.kind === "text" || ["b", "i", "u", "strong", "em", "br", "span"].includes(child.tag) && Object.keys(child.attrs).length === 0 && hasOnlyPlainInlineChildren(child)), isFullWidthStyle = (style) => style.width !== void 0 && style.width !== "auto" && "pct" in style.width && style.width.pct === 100;
  function isListTextBoxDiv(element) {
    let indent = element.tag === "div" ? element.attrs["data-text"] : void 0;
    if (indent === void 0 || !/^(?:\d+(?:\.\d+)?)?$/.test(indent) || Number(indent) > 256 || element.attrs["data-group"] !== void 0 || textBoxLayoutStylePattern.test(elementInlineStyle(element) ?? ""))
      return !1;
    let isPlainBlock = (child) => child.kind === "el" && (child.tag === "p" || child.tag === "ul" || child.tag === "ol") && child.attrs.style === void 0;
    return element.children.every((child) => isPlainBlock(child) || child.kind === "text" && child.text.trim() === "") && element.children.some((child) => child.kind === "el" && child.tag !== "p");
  }
  function percentAxisPlacement(start, end, size4, centered) {
    if (size4 === void 0 || size4 === "auto" || !("pct" in size4) || !(size4.pct <= 100))
      return;
    let round2 = (value) => Math.round(value * 100) / 100, isAuto = (value) => value === void 0 || value === "auto", sizePct = round2(size4.pct);
    if (!(sizePct > 0) || !isAuto(start) && !isAuto(end))
      return;
    if (centered) {
      let offset4 = isAuto(start) ? void 0 : "calcPct" in start ? start.calcPct === 50 ? start.px : void 0 : "pct" in start && start.pct === 50 ? 0 : void 0;
      return offset4 === void 0 ? void 0 : {
        anchor: "center",
        margin: 0,
        offset: offset4,
        sizePct
      };
    }
    let edge = isAuto(end) ? start : end, margin = isAuto(edge) ? 0 : "px" in edge && !("calcPct" in edge) && edge.px >= 0 ? edge.px : void 0;
    if (margin !== void 0)
      return sizePct === 100 && round2(margin) === 0 ? {
        anchor: "fill",
        margin: 0,
        offset: 0
      } : {
        anchor: isAuto(end) ? "leading" : "trailing",
        margin,
        offset: 0,
        sizePct
      };
  }
  function isInvisibleNode(node) {
    let style = node.style ?? {};
    if (style.opacity === 0)
      return !0;
    let isClear = (color) => typeof color != "string" || /^#[0-9a-f]{6}00$/.test(color);
    return Object.entries(style).some(([key, value]) => /^border.*Width$/.test(key) && typeof value == "number" && value > 0) && !(typeof style.borderColor == "string" && isClear(style.borderColor)) || style.backgroundGradient !== void 0 || style.boxShadow !== void 0 || !isClear(style.backgroundColor) ? !1 : node.kind === "text" ? typeof node.text != "string" || !/[^\s\u2800\p{Default_Ignorable_Code_Point}]/u.test(node.text) : node.kind === "stack" || node.kind === "grid" ? (node.children ?? []).every(isInvisibleNode) : node.kind === "overlay" ? isInvisibleNode(node.base) && node.layers.every((layer) => isInvisibleNode(layer.node)) : !["img", "icon", "shape", "table", "html"].includes(String(node.kind));
  }
  function singleHexColorDeclaration(style, property) {
    if (style === void 0 || !isPlainInlineStyle(style) || property === "color" && /fill-color/i.test(style))
      return;
    let declarations = style.split(";").filter((declaration) => property === "color" ? cssDeclarationName(declaration) === "color" : cssDeclarationName(declaration).includes("background") && /^[a-z-]+$/.test(cssDeclarationName(declaration))), match = declarations.length === 1 ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(declarations[0].slice(declarations[0].indexOf(":") + 1).trim()) : null;
    if (match !== null)
      return "#" + (match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1]).toLowerCase();
  }
  function commonRowBackground(row, cells) {
    let rowStyle = row.attrs.style ?? "";
    if (cells.length === 0 || row.attrs.bgcolor !== void 0 || row.attrs.background !== void 0 || !isPlainCellStyle(rowStyle) || /background/i.test(rowStyle))
      return;
    let ignore = () => {
    }, rowColor = singleHexColorDeclaration(rowStyle, "color"), rowColorKept = rowColor !== void 0 && parseInlineStyle(rowStyle, ignore, ignore).color === rowColor, backgrounds = cells.map((cell) => {
      let cellStyle = cell.attrs.style;
      if (cellStyle === void 0 || ["bgcolor", "background", "colspan", "rowspan"].some((name) => cell.attrs[name] !== void 0) || !isPlainCellStyle(cellStyle) || !hasOnlyPlainInlineChildren(cell))
        return;
      let background = singleHexColorDeclaration(cellStyle, "background"), parsed = parseInlineStyle(cellStyle, ignore, ignore);
      if (background === void 0 || parsed["background-color"] !== background)
        return;
      let cellColor = singleHexColorDeclaration(cellStyle, "color");
      return (cellColor !== void 0 ? parsed.color === cellColor : !cellColorDeclarationPattern.test(cellStyle) && rowColorKept) ? background : void 0;
    });
    return backgrounds[0] !== void 0 && backgrounds.every((background) => background === backgrounds[0]) ? backgrounds[0] : void 0;
  }
  function commonTableFontSize(cells) {
    if (cells.length === 0 || cells.some((cell) => cell === void 0))
      return;
    let sizes = (tag) => [
      ...new Set(cells.filter((cell) => cell.tag === tag).map((cell) => cell.px))
    ], body = sizes("td"), header = sizes("th");
    if (!(body.length > 1 || header.length > 1 || body.length === 1 && header.length === 1 && Math.abs(body[0] - header[0]) > 2))
      return body.length === 1 && header.length === 1 && body[0] !== header[0] ? {
        px: body[0],
        header: header[0]
      } : {
        px: body[0] ?? header[0]
      };
  }
  function looksLikeSlideHtml(html) {
    return typeof html == "string" && slideHtmlPrefixPattern.test(html);
  }
  function decodeHtmlEntities(text) {
    return text.indexOf("&") < 0 ? text : text.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});?/gi, (input, options) => {
      if (options[0] === "#") {
        let value = options[1] === "x" || options[1] === "X", value2 = parseInt(options.slice(value ? 2 : 1), value ? 16 : 10);
        return !Number.isFinite(value2) || value2 > 1114111 || value2 >= 55296 && value2 <= 57343 || value2 === 0 ? "�" : String.fromCodePoint(value2);
      }
      return input.endsWith(";") ? htmlNamedEntities.get(options) ?? input : input;
    });
  }
  function parseHtmlTag(cursor, svgMode = !1) {
    let pos = cursor.pos, { line: value, col: value2 } = cursor.lineCol(pos), src = cursor.src;
    cursor.pos++;
    let flag = !1;
    src[cursor.pos] === "/" && (flag = !0, cursor.pos++);
    let value3 = /^[a-zA-Z][\w:-]*/.exec(src.slice(cursor.pos, cursor.pos + 64));
    value3 || cursor.fail("malformed tag", pos);
    let value4 = value3[0].toLowerCase();
    cursor.pos += value3[0].length;
    let value5 = /* @__PURE__ */ Object.create(null);
    for (; ; ) {
      for (; cursor.pos < src.length && /\s/.test(src[cursor.pos]); )
        cursor.pos++;
      let value6 = src[cursor.pos];
      if (value6 === void 0 && cursor.fail("unclosed tag <" + value4 + ">", pos), value6 === ">")
        return cursor.pos++, {
          name: value4,
          attrs: value5,
          selfClosing: !1,
          closing: flag,
          line: value,
          col: value2
        };
      if (value6 === "/" && src[cursor.pos + 1] === ">")
        return cursor.pos += 2, {
          name: value4,
          attrs: value5,
          selfClosing: !0,
          closing: flag,
          line: value,
          col: value2
        };
      flag && cursor.fail("closing tag </" + value4 + "> cannot have attributes", pos);
      let value7 = /^([^\s"'>\/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\`]+)))?/.exec(src.slice(cursor.pos));
      (!value7 || value7[0].length === 0) && cursor.fail("malformed attribute in <" + value4 + ">", cursor.pos);
      let value8 = svgMode ? value7[1] : value7[1].toLowerCase(), value9 = value7[2] ?? value7[3] ?? value7[4] ?? "";
      /^[a-z][\w:-]*$/.test(value8) && !Object.hasOwn(value5, value8) && (value5[value8] = decodeHtmlEntities(value9)), cursor.pos += value7[0].length;
    }
  }
  function parseSlideHtmlTree(html, fragment = !1, baseLine = 0, baseColumn = 0) {
    let cursor = new HtmlSourceCursor(html, baseLine, baseColumn), root = {
      kind: "el",
      tag: "#root",
      attrs: /* @__PURE__ */ Object.create(null),
      children: [],
      line: 1,
      col: 1
    }, stack = [root], currentElement = () => stack[stack.length - 1], value = html, index4 = 0, callback = (input) => {
      if (input <= index4)
        return;
      let value2 = value.slice(index4, input);
      if (value2.trim() === "" && !/[\u00a0]/.test(value2) && currentElement().tag !== "p" && currentElement().tag !== "li" && currentElement().tag !== "td" && currentElement().tag !== "th" && currentElement().tag !== "span" && currentElement().tag !== "a" && currentElement().tag !== "b" && currentElement().tag !== "i" && currentElement().tag !== "u" && currentElement().tag !== "strong" && currentElement().tag !== "em" && !/^h[1-6]$/.test(currentElement().tag))
        return;
      let { line: value3, col: value4 } = cursor.lineCol(index4);
      currentElement().children.push({
        kind: "text",
        text: decodeHtmlEntities(value2),
        line: value3,
        col: value4
      });
    }, callback2 = (input) => {
      for (; stack.length - 1 > input; ) {
        let value2 = stack.pop();
        htmlOptionalClosingElementNames.has(value2.tag) || cursor.fail("<" + value2.tag + "> opened at " + String(value2.line) + ":" + String(value2.col) + " was never closed", cursor.pos), value2.implied = !0;
      }
    };
    for (; cursor.pos < value.length; ) {
      let value2 = value.indexOf("<", cursor.pos);
      if (value2 < 0) {
        callback(value.length), cursor.pos = value.length;
        break;
      }
      if (value2 > cursor.pos && (callback(value2), cursor.pos = value2, index4 = value2), value.startsWith("<!--", cursor.pos)) {
        let value4 = value.indexOf("-->", cursor.pos + 4);
        value4 < 0 && cursor.fail("unclosed comment"), cursor.pos = value4 + 3, index4 = cursor.pos;
        continue;
      }
      if (value.startsWith("<!", cursor.pos) || value.startsWith("<?", cursor.pos)) {
        let value4 = value.indexOf(">", cursor.pos);
        value4 < 0 && cursor.fail("malformed <! declaration"), cursor.pos = value4 + 1, index4 = cursor.pos;
        continue;
      }
      if (!/[a-zA-Z\/]/.test(value[cursor.pos + 1] ?? "")) {
        cursor.pos++;
        continue;
      }
      let value3 = parseHtmlTag(cursor);
      if (index4 = cursor.pos, value3.closing) {
        let value4 = -1;
        for (let value5 = stack.length - 1; value5 > 0; value5--)
          if (stack[value5].tag === value3.name) {
            value4 = value5;
            break;
          }
        if (value4 < 0) {
          if (htmlVoidElementNames.has(value3.name) || htmlOptionalClosingElementNames.has(value3.name) || value3.name === "body" || value3.name === "html" || value3.name === "head")
            continue;
          cursor.fail("stray closing tag </" + value3.name + "> (nothing open to close)", value2);
        }
        callback2(value4), stack.pop();
        continue;
      }
      if (value3.name === "li" || value3.name === "td" || value3.name === "th" || value3.name === "tr" || value3.name === "p" || htmlBlockElementNames.has(value3.name))
        for (let value4 = stack.length - 1; value4 > 0; value4--) {
          let tag = stack[value4].tag;
          if (tag === "p" && htmlBlockElementNames.has(value3.name) || tag === "li" && value3.name === "li" || (tag === "td" || tag === "th") && (value3.name === "td" || value3.name === "th" || value3.name === "tr") || tag === "tr" && value3.name === "tr") {
            callback2(value4 - 1);
            break;
          }
          if (tag === "ul" || tag === "ol" || tag === "table" || tag === "div" || tag === "section")
            break;
        }
      let state = {
        kind: "el",
        tag: value3.name,
        attrs: value3.attrs,
        children: [],
        line: value3.line,
        col: value3.col
      };
      if (currentElement().children.push(state), !(htmlVoidElementNames.has(value3.name) || value3.selfClosing)) {
        if (value3.name === "svg") {
          let value4 = /<svg\b|<\/svg\s*>/gi;
          value4.lastIndex = cursor.pos;
          let count = 1, value5 = -1, value6;
          for (; (value6 = value4.exec(value)) !== null; )
            if (value6[0][1] === "/") {
              if (count--, count === 0) {
                value5 = value6.index + value6[0].length;
                break;
              }
            } else
              count++;
          value5 < 0 && cursor.fail("unclosed <svg>", value2), state.source = value.slice(value2, value5), cursor.pos = value5, index4 = cursor.pos;
          continue;
        }
        if (htmlRawTextElementNames.has(value3.name)) {
          let value4 = new RegExp("</" + value3.name + "\\s*>", "i").exec(value.slice(cursor.pos));
          value4 === null && cursor.fail("unclosed <" + value3.name + ">", value2);
          let value5 = value.slice(cursor.pos, cursor.pos + value4.index), { line: value6, col: value7 } = cursor.lineCol(cursor.pos);
          state.children.push({
            kind: "text",
            text: value3.name === "title" || value3.name === "textarea" ? decodeHtmlEntities(value5) : value5,
            line: value6,
            col: value7
          }), cursor.pos += value4.index + value4[0].length, index4 = cursor.pos;
          continue;
        }
        stack.push(state);
      }
    }
    for (callback(value.length); stack.length > 1; ) {
      let value2 = stack.pop();
      fragment && value2.tag === "section" || !htmlOptionalClosingElementNames.has(value2.tag) && value2.tag !== "html" && value2.tag !== "body" && value2.tag !== "head" && cursor.fail("<" + value2.tag + "> opened at " + String(value2.line) + ":" + String(value2.col) + " was never closed", value.length);
    }
    return root.children;
  }
  function recoverSectionTrees(html, reportError2) {
    let sectionOffsets = [], sectionPattern = /<section\b/gi, match;
    for (; (match = sectionPattern.exec(html)) !== null; )
      sectionOffsets.push(match.index);
    if (sectionOffsets.length === 0)
      return [];
    let sections = [], ranges = [[0, sectionOffsets[0]]];
    for (let index4 = 0; index4 < sectionOffsets.length; index4++)
      ranges.push([
        sectionOffsets[index4],
        sectionOffsets[index4 + 1] ?? html.length
      ]);
    for (let [value, value2] of ranges) {
      let value3 = html.slice(value, value2);
      if (value3.trim() === "")
        continue;
      let length = (html.slice(0, value).match(/\n/g) ?? []).length, value4 = value - (html.lastIndexOf(`
`, value - 1) + 1);
      try {
        sections.push(...parseSlideHtmlTree(value3, !0, length, value4));
      } catch (value5) {
        if (!(value5 instanceof HtmlParseError))
          throw value5;
        reportError2(value5);
      }
    }
    return sections;
  }
  function slideStylePropertySchema(property) {
    let value = runtime2.stylePropertyRegistry[property];
    return value.slidesValue ?? value.value;
  }
  function connectorHasExplicitEndpoints(element) {
    return ["x1", "y1", "x2", "y2"].some((input) => element.attrs[input] !== void 0);
  }
  function clampShapeOutlineWidth(border) {
    let value = border !== void 0 && border.style !== "none" ? border.width : void 0;
    return value === void 0 || value <= 0 ? runtime2.defaultShapeStrokeWidth : Math.min(runtime2.maxShapeStrokeWidth, Math.max(1, value));
  }
  function ownRecordValue(record, key) {
    if (Object.hasOwn(record, key))
      return record[key];
  }
  function resolveFontFamilyAlias(family) {
    let value = ownRecordValue(webSafeFontAliases, family.toLowerCase());
    if (value !== void 0)
      return {
        family: value.family,
        fallback: value.fallback
      };
  }
  function resolveBasicFontFamily(family) {
    let value = ownRecordValue(webSafeFontAliases, family.toLowerCase());
    if (value?.basic === !0)
      return value.family;
  }
  function webSafeFontFallback(font) {
    return typeof font == "string" ? {
      family: webSafeFallbackFaces[font],
      fallback: font
    } : {
      family: (font.webSafe !== void 0 ? resolveBasicFontFamily(font.webSafe) : void 0) ?? resolveBasicFontFamily(font.family) ?? webSafeFallbackFaces[font.fallback],
      fallback: font.fallback
    };
  }
  function stripHtmlMarkup(html) {
    let text = "", position = 0;
    for (; ; ) {
      let value = html.indexOf("<", position);
      if (value < 0)
        return text + html.slice(position);
      text += html.slice(position, value);
      let value2 = -1, text2 = "";
      if (html.startsWith("<!--", value))
        value2 = html.indexOf("-->", value + 4) < 0 ? -1 : html.indexOf("-->", value + 4) + 3;
      else if (html.startsWith("<![CDATA[", value)) {
        let value3 = html.indexOf("]]>", value + 9);
        value3 >= 0 && (text2 = html.slice(value + 9, value3).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), value2 = value3 + 3);
      } else if (/^<\?xml[\s?]/i.test(html.slice(value, value + 6)))
        value2 = html.indexOf("?>", value + 2) < 0 ? -1 : html.indexOf("?>", value + 2) + 2;
      else if (/^<!DOCTYPE/i.test(html.slice(value, value + 9))) {
        let value3 = html.indexOf(">", value);
        value3 >= 0 && !html.slice(value, value3).includes("[") && (value2 = value3 + 1);
      } else {
        text += "<", position = value + 1;
        continue;
      }
      if (value2 < 0)
        return text + html.slice(value);
      text += text2, position = value2;
    }
  }
  function utf8ToBase64(text) {
    let bytes = new TextEncoder().encode(text), binary = "";
    for (let index4 = 0; index4 < bytes.length; index4 += 32768)
      binary += String.fromCharCode(...bytes.subarray(index4, index4 + 32768));
    return btoa(binary);
  }
  function parseSvgDimensions(svg) {
    try {
      let value = new HtmlSourceCursor(svg);
      if (value.pos = svg.indexOf("<"), value.pos < 0)
        return;
      let value2 = parseHtmlTag(value, !0);
      if (value2.name !== "svg" || value2.closing)
        return;
      let value3 = -1;
      for (let value4 of svg.matchAll(/<\/svg\b/gi))
        value3 = value4.index;
      return value3 < value.pos ? void 0 : {
        attrs: value2.attrs,
        inner: svg.slice(value.pos, value3)
      };
    } catch {
      return;
    }
  }
  function decodeCssEscapes(css) {
    return css.indexOf("\\") < 0 ? css : css.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (input, options, context) => {
      if (options !== void 0) {
        let value = parseInt(options, 16);
        return value > 0 && value <= 1114111 && !(value >= 55296 && value <= 57343) ? String.fromCodePoint(value) : "�";
      }
      return context ?? "";
    });
  }
  function sanitizeSvgXmlText(text, inAttribute) {
    return /[&\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|\]\]>/.test(text) ? text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]{0,31})?(;?)|\]\]>|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, (input, options, context) => {
      if (input === "]]>")
        return inAttribute.add('"]]>" in text'), "]]&gt;";
      if (input[0] !== "&")
        return inAttribute.add("a character XML forbids"), "�";
      if (options === void 0)
        return inAttribute.add("a bare &"), "&amp;" + (context ?? "");
      if (options[0] === "#") {
        let value = options[1] === "x" || options[1] === "X", value2 = parseInt(options.slice(value ? 2 : 1), value ? 16 : 10), value3 = !Number.isFinite(value2) || value2 === 0 || isInvalidXmlCodePoint(value2) ? 65533 : htmlWindows1252CodePoints[value2] ?? value2, value4 = value3 !== value2 ? "&#" + String(value3) + ";" : "&" + (options[1] === "X" ? "#x" + options.slice(2) : options) + ";";
        return value4 !== input && inAttribute.add(value3 === 65533 ? "a numeric reference XML cannot hold" : value3 !== value2 ? "a numeric reference a page reads as another character (&#" + String(value2) + ";)" : "a numeric reference not written as XML writes it"), value4;
      }
      if (context !== ";")
        return inAttribute.add("&" + options + " without its semicolon (kept as those letters)"), "&amp;" + options;
      if (options === "amp" || options === "lt" || options === "gt" || options === "quot" || options === "apos")
        return input;
      let entity = htmlNamedEntities.get(options);
      return entity !== void 0 ? (inAttribute.add("&" + options + ";"), [...entity].map((input2) => "&#" + String(input2.codePointAt(0)) + ";").join("")) : (inAttribute.add("a bare &"), "&amp;" + options + ";");
    }) : text;
  }
  function sanitizeSvgMarkup(svg, report) {
    let values = /* @__PURE__ */ new Set(), items = [], items2 = [], entries = /* @__PURE__ */ new Map(), callback = (input) => {
      entries.set(input.lower, (entries.get(input.lower) ?? 1) - 1);
    }, value = svgTagTokenPattern(!0), value2 = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/, text = "", index4 = 0;
    for (; ; ) {
      let value3 = svg.indexOf("<", index4);
      if (text += sanitizeSvgXmlText(svg.slice(index4, value3 < 0 ? svg.length : value3), values), value3 < 0)
        break;
      value.lastIndex = value3;
      let value4 = value.exec(svg);
      if (value4 === null) {
        text += svg.slice(value3);
        break;
      }
      index4 = value3 + value4[0].length;
      let value5 = value4[2], value6 = items2.length > 0 ? items2[items2.length - 1].prefixes : report;
      if (value4[1] === "/") {
        let value13 = value5.toLowerCase();
        if ((entries.get(value13) ?? 0) === 0) {
          values.add("a closing tag that closes nothing (left out)");
          continue;
        }
        let value14 = items2.length - 1;
        if (items2[value14].lower !== value13) {
          let value17 = value14;
          for (; items2[value17].lower !== value13; )
            value17--;
          items.push("<" + items2[value14].name + "> is never closed");
          for (let value18 of items2.splice(value17))
            callback(value18);
          text += value4[0];
          continue;
        }
        let value15 = items2.pop();
        callback(value15);
        let name = value15.name, value16 = "</" + name + ">";
        value4[0] !== value16 && !/^<\/[^\s/>]+[ \t\r\n]*>$/.test(value4[0]) && values.add("a closing tag that carries more than its name"), name !== value5 && values.add("a closing tag in another case than its opening tag"), text += name === value5 && /^<\/[^\s/>]+[ \t\r\n]*>$/.test(value4[0]) ? value4[0] : value16;
        continue;
      }
      let value7 = value6, values2 = /* @__PURE__ */ new Set(), value8 = svgAttributeTokenPattern(!0), text2 = "", flag = !1, value9, entries2 = /* @__PURE__ */ new Map(), values3 = /* @__PURE__ */ new Set();
      for (; (value9 = value8.exec(value4[3])) !== null; ) {
        let value13 = value9[2].toLowerCase(), entry = entries2.get(value13);
        (entry === void 0 || !/^[a-z]/.test(entry) && /^[a-z]/.test(value9[2])) && entries2.set(value13, value9[2]);
      }
      for (value8.lastIndex = 0; (value9 = value8.exec(value4[3])) !== null; ) {
        let value13 = !values3.has(value9[2].toLowerCase());
        values3.add(value9[2].toLowerCase()), value13 && value9[2].startsWith("xmlns:") && value9[2] !== "xmlns:xmlns" && (value9[3] ?? value9[4] ?? value9[5] ?? "") !== "" && !value7.has(value9[2].slice(6)) && (value7 = new Set(value7).add(value9[2].slice(6)));
      }
      for (value8.lastIndex = 0; (value9 = value8.exec(value4[3])) !== null; ) {
        let value13 = entries2.get(value9[2].toLowerCase()) ?? value9[2], value14 = value9[3] ?? value9[4] ?? value9[5], callback2 = (input) => {
          values.add(input), flag = !0;
        };
        if (values2.has(value13.toLowerCase())) {
          callback2("an attribute written twice (the first is kept)");
          continue;
        }
        values2.add(value13.toLowerCase());
        let value15 = value13 !== value9[2];
        if (!value2.test(value13)) {
          callback2("an attribute name XML cannot read");
          continue;
        }
        if (value13 === "xmlns" ? value14 !== svgNamespace : value13.startsWith("xmlns:") && ((value14 ?? "") === "" || value13 === "xmlns:xmlns")) {
          callback2("a namespace an HTML page ignores");
          continue;
        }
        let value16 = value13.indexOf(":");
        if (value16 > 0 && value13.slice(0, value16) !== "xmlns" && !value7.has(value13.slice(0, value16))) {
          callback2("an attribute whose prefix is declared nowhere (" + value13 + ")");
          continue;
        }
        let value17 = /^[ \t\r\n]+$/.test(value9[1]), value18 = value14 === void 0 ? "" : sanitizeSvgXmlText(value14, values);
        value17 || values.add("a gap inside a tag that XML does not read as space"), value9[5] !== void 0 && values.add("an attribute value without quotes"), value14 === void 0 && values.add("an attribute with no value");
        let value19 = value14 === void 0 || value9[5] !== void 0 || /^[ \t\r\n]+[^\s=]+[ \t\r\n]*=[ \t\r\n]*$/.test(value9[0].slice(0, value9[0].length - value14.length - 2));
        value19 || values.add("a gap inside a tag that XML does not read as space");
        let value20 = value17 && value19 && !value15 && value14 !== void 0 && value9[5] === void 0 && value18 === value14;
        value20 || (flag = !0), text2 += value20 ? value9[0] : (value17 ? value9[1] : " ") + value13 + "=" + (value9[4] !== void 0 ? "'" + value18 + "'" : '"' + value18 + '"');
      }
      let value10 = value5.indexOf(":");
      (!value2.test(value5) || value10 > 0 && !value7.has(value5.slice(0, value10))) && items.push("<" + value5 + "> has a prefix that is declared nowhere");
      let value11 = svg.slice(value3 + 1 + value5.length + value4[3].length, index4), value12 = /^[ \t\r\n]*\/?>$/.test(value11);
      value12 || values.add("a gap inside a tag that XML does not read as space"), text += flag || !value12 ? "<" + value5 + text2 + (value12 ? value11 : value4[4] === "/" ? "/>" : ">") : value4[0], value4[4] !== "/" && (items2.push({
        name: value5,
        lower: value5.toLowerCase(),
        prefixes: value7
      }), entries.set(value5.toLowerCase(), (entries.get(value5.toLowerCase()) ?? 0) + 1));
    }
    for (let value3 of items2.reverse())
      items.push("<" + value3.name + "> is never closed");
    return {
      xml: text,
      said: [...values],
      open: [...new Set(items)]
    };
  }
  function validateSvgMarkup(svg, allowAnimation = !1) {
    let value = decodeHtmlEntities(svg);
    for (let value5 of [value, decodeCssEscapes(value)]) {
      let value6 = unsafeSvgMarkupRules.find(([input]) => input.test(value5)) ?? (allowAnimation ? void 0 : unsupportedSvgAnimationRules.find(([input]) => input.test(value5)));
      if (value6 !== void 0)
        return value6[1];
    }
    if (parseSvgDimensions(svg) === void 0)
      return "is not one <svg>…</svg> element";
    let value2 = svgTagTokenPattern(allowAnimation), value3 = svgAttributeTokenPattern(allowAnimation), index4 = 0, flag = !1, value4 = svg.indexOf("<");
    for (; value4 >= 0; ) {
      value2.lastIndex = value4;
      let value5 = value2.exec(svg);
      if (value5 === null)
        return allowAnimation ? "has markup this format cannot read (a comment or CDATA section that is never closed, a processing instruction, or a malformed tag)" : "has markup this format cannot read (a comment, CDATA, processing instruction or malformed tag)";
      let value6 = value5[1] === "/", value7 = value5[2].toLowerCase();
      if (forbiddenSvgElementNames.has(value7) && !(allowAnimation && nonRenderingSvgElementNames.has(value7)))
        return "may not contain <" + value7 + ">";
      if (!value6) {
        value3.lastIndex = 0;
        let value8;
        for (; (value8 = value3.exec(value5[3])) !== null; ) {
          let value9 = value8[2].toLowerCase();
          if (value9.startsWith("on"))
            return "may not carry on*= event attributes";
          if (svgExternalResourceAttributes.has(value9))
            return "may not carry " + value9 + '= (URL attributes: href="#…" or data:image/… only)';
        }
      }
      if (value7 === "svg") {
        if (flag || (value6 ? index4-- : value5[4] !== "/" && index4++, index4 < 0))
          return "is not one <svg>…</svg> element";
        index4 === 0 && (flag = !0);
      }
      value4 = svg.indexOf("<", value4 + value5[0].length);
    }
    if (!flag || index4 !== 0 || !/^\s*<\/svg\s*>\s*$/i.test(svg.slice(svg.toLowerCase().lastIndexOf("</svg"))))
      return "is not one <svg>…</svg> element";
  }
  function decodeSvgDataUrl(src) {
    if (src.startsWith("data:image/svg+xml;base64,"))
      try {
        let value = atob(src.slice(26)), value2 = new Uint8Array(value.length);
        for (let index4 = 0; index4 < value.length; index4++)
          value2[index4] = value.charCodeAt(index4);
        let value3 = new TextDecoder().decode(value2);
        return /^\s*<svg\b/i.test(value3) ? value3 : void 0;
      } catch {
        return;
      }
  }
  function parseInlineStyleUnchecked(style) {
    return style === void 0 ? [] : (0, runtime2.parseCssDeclarations)(stripCssComments(style).replace(/!\s*important/gi, ""), () => {
    });
  }
  function inlineStyleSuppressesFlowLayout(style) {
    let display = parseInlineStyleUnchecked(style).find((input) => input.prop === "display");
    return display !== void 0 && !/^(inline-)?(flex|grid)\b/i.test(display.value.trim());
  }
  function inlineStyleHasPercentSize(style, axis) {
    let logicalDimension = axis === "width" ? "inline-size" : "block-size", declarations = parseInlineStyleUnchecked(style), propertyHasPercent = (input, options) => declarations.filter((input2) => input2.prop === input || input2.prop === options).pop()?.value.includes("%") === !0;
    return propertyHasPercent(axis, logicalDimension) || propertyHasPercent("min-" + axis, "min-" + logicalDimension);
  }
  function nodeHasExplicitAxisSize(node, axis) {
    if (node.kind === "spacer")
      return !1;
    let placement = node.place ?? {}, positiveSize = (input) => typeof input == "number" && input > 0, media = node.kind === "img" || node.kind === "icon" || node.kind === "shape";
    return positiveSize(media ? axis === "x" ? node.w : node.h : axis === "x" ? placement.minW : placement.minH) ? !0 : node.kind === "icon" || node.kind === "shape" ? !(axis === "x" && node.shape === "line") : node.kind === "text" ? typeof node.text == "string" && node.text.trim() !== "" : node.kind === "img" ? typeof node.src == "string" : node.kind === "overlay" ? nodeHasExplicitAxisSize(node.base, axis) : node.kind === "table" || Array.isArray(node.children) && node.children.some((input) => nodeHasExplicitAxisSize(input, axis));
  }
  function inheritedContainerStretchSources(grid, node) {
    let sources = {};
    if (grid ? (node.justifyItems !== void 0 && (sources.w = "justify-items:" + node.justifyItems), node.alignItems !== void 0 && (sources.h = "align-items:" + node.alignItems)) : node.align !== void 0 && node.align !== "stretch" && (sources[node.dir === "h" ? "h" : "w"] = "align-items:" + node.align), !(sources.w === void 0 && sources.h === void 0))
      return sources;
  }
  function nonStretchAxisExplanation(context, dimension, alignSelf, justifySelf) {
    let value = context.parentGrid === !0 && dimension === "width" ? justifySelf === void 0 ? void 0 : "justify-self:" + justifySelf : alignSelf === void 0 ? void 0 : "align-self:" + alignSelf;
    if (value !== void 0)
      return value.endsWith(":stretch") ? void 0 : "its " + value;
    let value2 = dimension === "width" ? context.parentAlign?.w : context.parentAlign?.h;
    if (value2 !== void 0)
      return "the parent's " + value2;
  }
  function inlineStyleHasUnsafeSizing(style, dimension, percentSized = !1) {
    if (style === void 0 || !/-(width|height|size)/i.test(style))
      return !1;
    let items = [
      dimension,
      dimension === "width" ? "inline-size" : "block-size"
    ], flag = !1, value = (0, runtime2.parseCssDeclarations)(stripCssComments(style), (input) => {
      (input.startsWith("unbalanced") || items.some((input2) => input.startsWith("min-" + input2 + ":") || input.startsWith("max-" + input2 + ":"))) && (flag = !0);
    });
    return flag || value.some((input) => items.some((input2) => input.prop === "max-" + input2 && !/^(none|100%)$/i.test(input.value.trim()) || input.prop === "min-" + input2 && !(percentSized ? /^(auto|0(px|%)?)$/i : /^(auto|0(px|%)?|100%)$/i).test(input.value.trim())));
  }
  function inlineStyleHasUnsafeBackground(style) {
    if (style === void 0 || !/background/i.test(style))
      return !1;
    let flag = !1, value = (0, runtime2.parseCssDeclarations)(stripCssComments(style), (input) => {
      (input.startsWith("background") || input.startsWith("unbalanced")) && (flag = !0);
    });
    return flag || value.some((input) => input.prop.startsWith("background") && !/^(none|transparent)$/i.test(input.value.trim()));
  }
  function parseInlineStyle(css, warn, drop, box, fontSize) {
    let style = {};
    if (css === void 0 || css.trim() === "")
      return style;
    let declarations = (0, runtime2.parseCssDeclarations)(css, drop), resolvedDeclarations = fontSize === void 0 ? declarations : resolveEmListPadding(declarations, () => parseInlineStyle(css, () => {
    }, () => {
    })["font-size"] ?? fontSize, drop), callback = (input, options, context = "") => drop(input + ': "' + (0, runtime2.compactDiagnosticValue)(options) + '"' + (context !== "" ? " — " + context : (0, runtime2.cssPropertyValueHint)(input))), callback2 = (input, options, context, value) => {
      options === void 0 ? callback(context, value) : style[input] = options;
    }, callback3 = (input, options, context, value) => {
      let value2 = "lo" in context ? context.lo : context.min, value3 = "hi" in context ? context.hi : context.max;
      if (options >= value2 && options <= value3)
        return options;
      callback(input, value, "outside " + String(value2) + "–" + String(value3));
    }, callback4 = (input) => ({
      x: input.x,
      y: input.y,
      blur: input.blur,
      ...input.spread !== void 0 ? {
        spread: input.spread
      } : {}
    }), callback5 = (input, options, context, value) => Object.entries(options).every(([input2, input3]) => context[input2] === void 0 || callback3(input + " " + input2, input3, context[input2], value) !== void 0), callback6 = (input) => {
      let value = (0, runtime2.tokenizeCssValue)(input);
      if (value.length === 1)
        return (0, runtime2.cssTokenPixels)(value[0]);
    }, callback7 = (input, options) => {
      let value = (0, runtime2.tokenizeCssValue)(input), value2 = value[0];
      if (!(value.length !== 1 || value2 === void 0)) {
        if (value2.t === "ident" && value2.v === "auto")
          return "auto";
        if (value2.t === "fn" && value2.name === "calc" && options) {
          let value3 = /^\s*([+-]?[\d.]+)%\s*([+-])\s*([\d.]+)(?:px)?\s*$/.exec(value2.args);
          return value3 ? {
            calcPct: Number(value3[1]),
            px: (value3[2] === "-" ? -1 : 1) * Number(value3[3])
          } : void 0;
        }
        return (0, runtime2.cssTokenSize)(value2);
      }
    }, callback8 = (input) => {
      let value = (0, runtime2.tokenizeCssValue)(input), value2 = value[0];
      if (!(value.length !== 1 || value2 === void 0))
        return value2.t === "ident" && value2.v === "auto" ? "auto" : (0, runtime2.cssTokenSize)(value2);
    }, callback9 = (input) => (0, runtime2.normalizeCssColorHex)(input), callback10 = (input, options) => {
      let value = input.trim().toLowerCase();
      if (Object.hasOwn(options, value))
        return options[value];
    }, callback11 = (input, options) => {
      let value = input.trim().toLowerCase();
      if (options.includes(value))
        return value;
    }, callback12 = (input, options) => {
      let value = (0, runtime2.splitCssTokenGroups)((0, runtime2.tokenizeCssValue)(options)), value2 = value.length > 1 && value[0].some((input2) => input2.t === "fn" && /-gradient$/.test(input2.name)), value3 = input === "background" && value2 && value.length === 2 ? (0, runtime2.parseCssColorTokens)(value[1]) : void 0, callback14 = (input2) => {
        if (box !== void 0 && value.some((input3) => input3.some((input4) => input4.t === "fn" && /-gradient$/.test(input4.name)))) {
          let callback15 = (input3) => input3.flatMap((input4) => input4.t === "fn" && !/^(rgba?|hsla?)$/.test(input4.name) ? [] : [(0, runtime2.normalizeCssColorHex)(input4.raw)]).filter((input4) => input4 !== void 0), value7 = callback15(value[value.length - 1] ?? []), value8 = input === "background" && value7.length === 1 && !value.slice(0, -1).some((input3) => callback15(input3).some((input4) => hexColorAlpha(input4) > 0)) ? hexColorAlpha(value7[0]) : 0;
          value8 === 1 && (box.keptColour = value7[0]), value8 > 0 && (box.wroteColour = !0), box.refusedGradient = input === "background" ? input : "background-image";
        }
        callback(input, options, input2);
      };
      if (value.length > (value3 !== void 0 ? 2 : 1))
        return callback14(value2 ? "one gradient, then at most one plain COLOR, and only in the background shorthand: background: GRADIENT, #hex" : "one background layer only (a color, or one gradient)");
      let value4 = value[0] ?? [];
      if (value4.length === 1 && value4[0].t === "ident" && value4[0].v === "none") {
        delete style["background-image-src"], delete style["background-gradient"], input === "background" && delete style["background-color"], box !== void 0 && (box.refusedGradient = void 0);
        return;
      }
      if (value4[0]?.t === "fn" && value4[0].name === "url") {
        let value7 = (0, runtime2.parseSingleCssName)(value4[0].args);
        if (value7 === void 0)
          return callback(input, options, "url(SRC) names one image, as <img src> does");
        let value8;
        for (let count = 1; count < value4.length; count++) {
          let value9 = value4[count];
          if (!(value9.t === "ident" && (value9.v === "center" || value9.v === "no-repeat"))) {
            if (value9.t === "slash" && value4[count + 1]?.t === "ident" && value4[count + 1].v === "cover")
              value8 = "cover";
            else if (value9.t === "slash" && value4[count + 1]?.t === "ident" && value4[count + 1].v === "contain")
              value8 = "contain";
            else
              return callback(input, options, "url(SRC) [center / cover | contain] — with background-clip: text");
            count++;
          }
        }
        style["background-image-src"] = value7, value8 !== void 0 && (style["background-size"] = value8), delete style["background-gradient"], input === "background" && delete style["background-color"], box !== void 0 && (box.refusedGradient = void 0);
        return;
      }
      let value5 = value3, value6;
      for (let value7 of value4) {
        if (value7.t === "fn" && /^(repeating-linear|linear|radial)-gradient$/.test(value7.name) && value6 === void 0) {
          let value9 = (0, runtime2.parseCssGradient)(value7, box?.box);
          if (value9 === void 0)
            return callback14("gradients are linear-gradient(ANGLE | to SIDE, COLOR [N%], …), radial-gradient([circle | ellipse] [closest-side | closest-corner | farthest-side | farthest-corner] [at X% Y% | at top right], …) or repeating-linear-gradient(ANGLE, COLOR Npx, …) with 2–8 stops — no radial size (600px, 120% 80%) and no px centre");
          value6 = value9;
          continue;
        }
        let value8 = value7.t === "fn" && !/^(rgba?|hsla?)$/.test(value7.name) ? void 0 : (0, runtime2.normalizeCssColorHex)(value7.raw);
        if (value8 !== void 0 && value5 === void 0) {
          value5 = value8;
          continue;
        }
        return callback14();
      }
      value5 !== void 0 && (style["background-color"] = value5), value6 !== void 0 && (style["background-gradient"] = value6), (value6 !== void 0 || input === "background") && delete style["background-image-src"], box !== void 0 && value6 !== void 0 && (box.refusedGradient = void 0);
    }, callback13 = (input, options) => {
      let value = options === void 0 ? "border" : "border-" + options, value2 = (0, runtime2.tokenizeCssValue)(input), value3 = value2[0];
      if (value2.length === 1 && value3 !== void 0 && (value3.t === "ident" && (value3.v === "none" || value3.v === "hidden") || value3.t === "num" && value3.n === 0)) {
        if (options === void 0)
          style.border = {
            style: "none"
          };
        else if (style.border !== void 0 && style.border.style !== "none") {
          let value6 = (style.border.sides ?? cssBoxSideNames).filter((input2) => input2 !== options);
          if (value6.length === 0)
            style.border = {
              style: "none"
            };
          else if (style.border = {
            ...style.border,
            sides: value6
          }, style.border.widths !== void 0) {
            let { [options]: widths, ...widths2 } = style.border.widths;
            style.border.widths = widths2;
          }
        }
        return;
      }
      let value4 = (0, runtime2.parseCssBorder)(value2);
      if (value4 === void 0)
        return callback(value, input);
      if (value4.style === void 0)
        return callback(value, input, "name the style: " + String(value4.width ?? 1) + "px solid " + (value4.color ?? "COLOR") + " (CSS draws nothing without one)");
      if (value4.width !== void 0 && callback3(value, value4.width, shapeStrokeBounds, input) === void 0)
        return;
      let value5 = style.border !== void 0 && style.border.style !== void 0 && style.border.style !== "none" ? style.border : void 0;
      if (options === void 0) {
        let { sides: value6, widths: value7, ...value8 } = value5 ?? {};
        style.border = {
          ...value8,
          ...value4
        };
        return;
      }
      let state = {
        ...value4
      };
      if (value5 === void 0) {
        style.border = {
          ...state,
          sides: [options]
        };
        return;
      }
      if ((value5.style ?? "solid") !== (state.style ?? "solid") || (value5.color ?? "") !== (state.color ?? "")) {
        drop(value + ': "' + (0, runtime2.compactDiagnosticValue)(input) + '" — the drawn sides share one style and color here (widths may differ); for a different rule use a painted div');
        return;
      }
      if (value5.widths !== void 0 || (value5.width ?? 1) !== (state.width ?? 1)) {
        let value6 = value5.widths !== void 0 ? {
          ...value5.widths
        } : Object.fromEntries((value5.sides ?? cssBoxSideNames).map((input2) => [input2, value5.width ?? 1]));
        value6[options] = state.width ?? 1, style.border = {
          style: value5.style,
          color: value5.color,
          widths: value6,
          sides: cssBoxSideNames.filter((input2) => value6[input2] !== void 0)
        };
        return;
      }
      value5.sides !== void 0 && !value5.sides.includes(options) && (style.border = {
        ...value5,
        sides: cssBoxSideNames.filter((input2) => input2 === options || value5.sides.includes(input2))
      });
    };
    for (let { prop: value, value: value2 } of resolvedDeclarations) {
      let value3 = (0, runtime2.tokenizeCssValue)(value2);
      if (/^(inherit|initial|unset|revert|revert-layer)$/i.test(value2.trim())) {
        drop(value + ': "' + value2.trim() + '" — CSS-wide keywords are not in this format; write the value (text properties inherit on their own)');
        continue;
      }
      if ((0, runtime2.canonicalCssPropertyName)(value) === void 0) {
        if (ownRecordValue(runtime2.acceptedNoOpCssPropertyPatterns, value)?.test(value2.trim()) === !0)
          continue;
        let value4 = ownRecordValue(runtime2.unsupportedCssPropertyHints, value) ?? ownRecordValue(runtime2.unsupportedCssPropertyHints, value.replace(/-(top|right|bottom|left|inline|block)(-\w+)?$/, ""));
        drop(value + " is not in this format" + (value4 !== void 0 ? " — " + value4 : value.startsWith("-") ? " (no vendor properties)" : ""));
        continue;
      }
      switch (value) {
        case "position": {
          let value4 = callback11(value2, ["relative", "absolute"]);
          value4 === void 0 ? callback(value, value2, "absolute | relative (static is the default — delete it; nothing is fixed or sticky on a slide)") : style.position = value4;
          break;
        }
        case "top":
        case "right":
        case "bottom":
        case "left":
          callback2(value, callback7(value2, value === "left" || value === "top"), value, value2);
          break;
        case "inset": {
          let value4 = (0, runtime2.expandCssBoxValues)(value3, (input) => (0, runtime2.cssTokenSize)(input) !== void 0 ? 1 : void 0), value5 = value3.map((input) => (0, runtime2.cssTokenSize)(input));
          if (value4 === void 0 || value5.some((input) => input === void 0)) {
            callback(value, value2, "1 to 4 of LEN | PCT");
            break;
          }
          let [value6, value7 = value6, value8 = value6, value9 = value7] = value5;
          style.top = value6, style.right = value7, style.bottom = value8, style.left = value9;
          break;
        }
        case "width":
        case "height":
          callback2(value, callback8(value2), value, value2);
          break;
        case "min-width":
        case "min-height":
        case "max-width":
        case "max-height": {
          if (value === "min-width" && /^\s*(min|max)-content\s*$/i.test(value2)) {
            style["min-width-fit"] = value2.trim().toLowerCase();
            break;
          }
          if (value === "max-width" && /^\s*(100%|none)\s*$/i.test(value2) || value.startsWith("min-") && /^\s*0(px)?\s*$/.test(value2))
            break;
          let value4 = callback8(value2);
          value4 === void 0 || value4 === "auto" || "pct" in value4 ? callback(value, value2) : style[value] = value4;
          break;
        }
        case "display": {
          let value4 = callback11(value2, [
            "flex",
            "grid",
            "none",
            "block",
            "inline-flex",
            "inline-grid",
            "inline-block",
            "inline"
          ]);
          if (value4 === "flex" || value4 === "grid" || value4 === "none")
            style.display = value4;
          else {
            if (value4 === "block")
              break;
            value4 === "inline-flex" || value4 === "inline-grid" ? callback(value, value2, "write " + value4.slice(7) + " (every element is a block here)") : callback(value, value2, "flex | grid (a pill is a <p> with background + padding; text runs are <span>s inside one <p>)");
          }
          break;
        }
        case "flex-direction":
          callback2("flex-direction", callback11(value2, [
            "row",
            "column",
            "row-reverse",
            "column-reverse"
          ]), value, value2);
          break;
        case "flex-flow": {
          let value4 = value3.find((input) => input.t === "ident" && ["row", "column", "row-reverse", "column-reverse"].includes(input.v)), value5 = value3.find((input) => input.t === "ident" && (input.v === "wrap" || input.v === "nowrap"));
          if (value3.length < 1 || value3.length > 2 || value3.some((input) => input !== value4 && input !== value5)) {
            callback(value, value2, "flex-direction and/or wrap | nowrap");
            break;
          }
          value4?.t === "ident" && (style["flex-direction"] = value4.v), value5?.t === "ident" && (style["flex-wrap"] = value5.v === "wrap");
          break;
        }
        case "flex-wrap": {
          let value4 = callback11(value2, ["nowrap", "wrap"]);
          value4 === void 0 ? callback(value, value2) : style["flex-wrap"] = value4 === "wrap";
          break;
        }
        case "gap":
        case "grid-gap": {
          let value4 = value3.map((input) => (0, runtime2.cssTokenPixels)(input));
          value4.length < 1 || value4.length > 2 || value4.some((input) => input === void 0) ? callback(value, value2) : value4.every((input) => callback3(value, input, containerPaddingBounds, value2) !== void 0) && (style.gap = {
            row: value4[0],
            col: value4[1] ?? value4[0]
          });
          break;
        }
        case "row-gap":
        case "column-gap":
        case "grid-row-gap":
        case "grid-column-gap": {
          let value4 = callback6(value2);
          value4 === void 0 ? callback(value, value2, value + " is LEN 0–512") : callback3(value, value4, containerPaddingBounds, value2) !== void 0 && (style.gap = {
            row: 0,
            col: 0,
            ...style.gap,
            [value.endsWith("row-gap") ? "row" : "col"]: value4
          });
          break;
        }
        case "align-items":
          callback2("align-items", callback10(value2, cssAlignmentMap), value, value2);
          break;
        case "justify-content":
          callback2("justify-content", callback10(value2, cssJustificationMap), value, value2);
          break;
        case "justify-items": {
          let value4 = callback10(value2, cssAlignmentMap);
          callback2("justify-items", value4 === "baseline" ? void 0 : value4, value, value2);
          break;
        }
        case "place-items": {
          let value4 = value3.map((input) => input.t === "ident" ? cssAlignmentMap[input.v] : void 0);
          if (value4.length < 1 || value4.length > 2 || value4.some((input) => input === void 0) || value4[1] === "baseline") {
            callback(value, value2, "ALIGN [ALIGN] (no baseline on the justify axis)");
            break;
          }
          style["align-items"] = value4[0], (value4[1] ?? value4[0]) !== "baseline" && (style["justify-items"] = value4[1] ?? value4[0]);
          break;
        }
        case "grid-template-columns":
        case "grid-template-rows": {
          if (value3.length === 1 && value3[0].t === "ident" && value3[0].v === "none")
            break;
          let value4 = (0, runtime2.parseCssGridTracks)(value3);
          value4 === void 0 && callback(value, value2), style[value] = value4 ?? [
            {
              fr: 1
            }
          ];
          break;
        }
        case "padding": {
          let value4 = (0, runtime2.expandCssBoxValues)(value3, runtime2.cssTokenPixels);
          value4 === void 0 ? callback(value, value2) : value4.every((input) => callback3(value, input, slideStylePropertySchema("paddingTop"), value2) !== void 0) && ([
            style["padding-top"],
            style["padding-right"],
            style["padding-bottom"],
            style["padding-left"]
          ] = value4);
          break;
        }
        case "padding-top":
        case "padding-right":
        case "padding-bottom":
        case "padding-left": {
          let value4 = callback6(value2);
          value4 === void 0 ? callback(value, value2) : callback3(value, value4, slideStylePropertySchema("paddingTop"), value2) !== void 0 && (style[value] = value4);
          break;
        }
        case "padding-inline":
        case "padding-block": {
          let value4 = (0, runtime2.expandCssBoxValues)(value3, runtime2.cssTokenPixels);
          value4 === void 0 || value3.length > 2 ? callback(value, value2, "LEN [LEN]") : value4.every((input) => callback3(value, input, slideStylePropertySchema("paddingTop"), value2) !== void 0) && (value === "padding-inline" ? [style["padding-left"], style["padding-right"]] = [
            value4[0],
            value4[1]
          ] : [style["padding-top"], style["padding-bottom"]] = [
            value4[0],
            value4[1]
          ]);
          break;
        }
        case "overflow":
        case "overflow-x":
        case "overflow-y":
          callback2("overflow", callback11(value2, ["visible", "hidden"]), value, value2);
          break;
        case "flex": {
          let value4 = (0, runtime2.parseCssFlex)(value3);
          value4 === void 0 ? callback(value, value2) : (value4.grow !== void 0 && (style["flex-grow"] = value4.grow), value4.shrink !== void 0 && (style["flex-shrink"] = value4.shrink), value4.basis !== void 0 && (style["flex-basis"] = value4.basis));
          break;
        }
        case "flex-grow":
        case "flex-shrink": {
          let value4 = value3[0];
          callback2(value, value3.length === 1 && value4?.t === "num" && value4.unit === "" && value4.n >= 0 ? value4.n : void 0, value, value2);
          break;
        }
        case "flex-basis": {
          let value4 = value3[0];
          value3.length === 1 && value4?.t === "ident" && value4.v === "auto" ? style["flex-basis"] = "auto" : callback2("flex-basis", callback6(value2), value, value2);
          break;
        }
        case "align-self": {
          if (value2.trim().toLowerCase() === "auto")
            break;
          callback2("align-self", callback10(value2, cssAlignmentMap), value, value2);
          break;
        }
        case "justify-self": {
          if (value2.trim().toLowerCase() === "auto")
            break;
          let value4 = callback10(value2, cssAlignmentMap);
          callback2("justify-self", value4 === "baseline" ? void 0 : value4, value, value2);
          break;
        }
        case "place-self": {
          if (value2.trim().toLowerCase() === "auto")
            break;
          let value4 = value3.map((input) => input.t === "ident" ? cssAlignmentMap[input.v] : void 0);
          if (value4.length < 1 || value4.length > 2 || value4.some((input) => input === void 0) || value4[1] === "baseline") {
            callback(value, value2, "ALIGN [ALIGN] | auto (no baseline on the justify axis)");
            break;
          }
          style["align-self"] = value4[0], (value4[1] ?? value4[0]) !== "baseline" && (style["justify-self"] = value4[1] ?? value4[0]);
          break;
        }
        case "aspect-ratio": {
          let value4 = value3.filter((input) => input.t === "num" && input.unit === "");
          value4.length === 1 && value3.length === 1 && value4[0].n > 0 ? style["aspect-ratio"] = value4[0].n : value4.length === 2 && value3.length === 3 && value3[1].t === "slash" && value4[0].n > 0 && value4[1].n > 0 ? style["aspect-ratio"] = value4[0].n / value4[1].n : callback(value, value2);
          break;
        }
        case "grid-column":
        case "grid-row":
        case "grid-column-end":
        case "grid-row-end": {
          let value4 = /^\s*span\s+(\d+)\s*$/i.exec(value2), value5 = value4 ? Number(value4[1]) : NaN;
          !Number.isInteger(value5) || value5 < 1 || value5 > 24 ? callback(value, value2, "span INT only — cells place in source order; there are no line numbers here") : style[value.startsWith("grid-column") ? "grid-column" : "grid-row"] = value5;
          break;
        }
        case "font-family":
          callback2("font-family", (0, runtime2.parseCssFontFamilies)(value3), value, value2);
          break;
        case "font-size": {
          let value4 = value3[0], value5;
          value3.length === 1 && value4?.t === "num" && (value4.unit === "px" || value4.unit === "") ? value5 = value4.n : value3.length === 1 && value4?.t === "num" && value4.unit === "pt" && (value5 = Math.round(value4.n * 4 / 3), warn("font-size: pt converted to px (" + String(value5) + "px)")), value5 === void 0 ? callback(value, value2) : callback3(value, value5, slideStylePropertySchema("fontSize"), value2) !== void 0 && (style["font-size"] = value5);
          break;
        }
        case "font-weight":
          callback2("font-weight", (0, runtime2.parseCssFontWeight)(value3), value, value2);
          break;
        case "font-style": {
          let value4 = value2.trim().toLowerCase();
          callback2("font-style", value4 === "italic" || value4 === "oblique" ? "italic" : value4 === "normal" ? "normal" : void 0, value, value2);
          break;
        }
        case "font": {
          let value4 = (0, runtime2.parseCssFontShorthand)(value3);
          if (value4 === void 0 || callback3("font-size", value4.size, slideStylePropertySchema("fontSize"), value2) === void 0) {
            value4 === void 0 && callback(value, value2);
            break;
          }
          style["font-size"] = value4.size, style["font-family"] = value4.family, value4.weight !== void 0 && (style["font-weight"] = value4.weight), value4.style !== void 0 && (style["font-style"] = value4.style), value4.lineHeight !== void 0 && callback3("line-height", value4.lineHeight, slideStylePropertySchema("lineHeight"), value2) !== void 0 && (style["line-height"] = value4.lineHeight);
          break;
        }
        case "line-height": {
          let value4 = value3[0], value5;
          if (value3.length !== 1 || value4 === void 0)
            value5 = void 0;
          else {
            if (value4.t === "ident" && value4.v === "normal")
              break;
            if (value4.t === "num" && (value4.unit === "" || value4.unit === "em"))
              value5 = value4.n;
            else if (value4.t === "num" && value4.unit === "%")
              value5 = value4.n / 100;
            else if (value4.t === "num" && value4.unit === "px") {
              style["line-height"] = {
                px: value4.n
              };
              break;
            }
          }
          value5 === void 0 ? callback(value, value2) : callback3(value, value5, slideStylePropertySchema("lineHeight"), value2) !== void 0 && (style["line-height"] = value5);
          break;
        }
        case "letter-spacing": {
          let value4 = value3[0];
          value3.length !== 1 || value4 === void 0 ? callback(value, value2) : value4.t === "ident" && value4.v === "normal" ? style["letter-spacing"] = 0 : value4.t === "num" && (value4.unit === "px" || value4.unit === "") ? callback3(value, value4.n, slideStylePropertySchema("letterSpacing"), value2) !== void 0 && (style["letter-spacing"] = value4.n) : value4.t === "num" && value4.unit === "em" ? style["letter-spacing"] = {
            em: value4.n
          } : callback(value, value2);
          break;
        }
        case "text-align": {
          let value4 = value2.trim().toLowerCase();
          callback2("text-align", callback11(value4 === "start" ? "left" : value4 === "end" ? "right" : value4, ["left", "center", "right", "justify"]), value, value2);
          break;
        }
        case "text-transform":
          callback2("text-transform", callback11(value2, [
            "none",
            "uppercase",
            "lowercase",
            "capitalize"
          ]), value, value2);
          break;
        case "white-space": {
          let value4 = callback11(value2, ["normal", "nowrap"]);
          value4 === void 0 ? callback(value, value2, "normal | nowrap (line breaks are <br>)") : style["white-space"] = value4;
          break;
        }
        case "text-decoration":
        case "text-decoration-line":
        case "text-decoration-style":
        case "text-decoration-color": {
          if (value3.length === 1 && value3[0].t === "ident" && value3[0].v === "none") {
            style["text-decoration-line"] = "none";
            break;
          }
          for (let value4 of value3)
            if (value4.t === "ident" && (value4.v === "underline" || value4.v === "line-through"))
              style["text-decoration-line"] = value4.v;
            else if (value4.t === "ident" && ["solid", "double", "dotted", "dashed", "wavy"].includes(value4.v))
              style["text-decoration-style"] = value4.v;
            else {
              let value5 = value4.t === "ident" && value4.v === "overline" ? void 0 : (0, runtime2.normalizeCssColorHex)(value4.raw);
              value5 !== void 0 ? style["text-decoration-color"] = value5 : callback(value, value2);
            }
          break;
        }
        case "font-variant-numeric":
          callback2("font-variant-numeric", callback11(value2, ["normal", "tabular-nums"]), value, value2);
          break;
        case "-webkit-text-stroke": {
          let value4 = value3.find((input) => (0, runtime2.cssTokenPixels)(input) !== void 0), value5 = value3.map((input) => (0, runtime2.normalizeCssColorHex)(input.raw)).find((input) => input !== void 0);
          if (value4 === void 0 && value5 === void 0 || value3.length > 2) {
            callback(value, value2);
            break;
          }
          value4 !== void 0 && callback3(value, (0, runtime2.cssTokenPixels)(value4), slideStylePropertySchema("textStrokeWidth"), value2) !== void 0 && (style["text-stroke-width"] = (0, runtime2.cssTokenPixels)(value4)), value5 !== void 0 && (style["text-stroke-color"] = value5);
          break;
        }
        case "-webkit-text-stroke-width": {
          let value4 = callback6(value2);
          value4 === void 0 ? callback(value, value2) : callback3(value, value4, slideStylePropertySchema("textStrokeWidth"), value2) !== void 0 && (style["text-stroke-width"] = value4);
          break;
        }
        case "-webkit-text-stroke-color":
          callback2("text-stroke-color", callback9(value2), value, value2);
          break;
        case "color":
          callback2("color", callback9(value2), value, value2);
          break;
        case "background":
        case "background-image":
          callback12(value, value2);
          break;
        case "background-color": {
          let value4 = callback9(value2);
          callback2("background-color", value4, value, value2), box !== void 0 && value4 !== void 0 && (box.keptColour = void 0);
          break;
        }
        case "background-clip":
        case "-webkit-background-clip":
          /^\s*text\s*$/i.test(value2) ? style["background-clip"] = "text" : callback(value, value2, "text is the one clip (the glyphs take the background)");
          break;
        case "-webkit-text-fill-color":
          /^\s*transparent\s*$/i.test(value2) ? style["text-fill-transparent"] = !0 : /^\s*currentcolor\s*$/i.test(value2) ? style["text-fill-current"] = !0 : callback(value, value2, "transparent beside background-clip: text (the text color is color:), or currentcolor on a span inside such text");
          break;
        case "background-size": {
          let value4 = callback11(value2, ["cover", "contain"]);
          value4 === void 0 ? callback(value, value2, "cover | contain, for a text fill's url() (box images are <img> with object-fit)") : style["background-size"] = value4;
          break;
        }
        case "background-position":
          /^\s*(center|50%)(\s+(center|50%))?\s*$/i.test(value2) ? style["background-position"] = !0 : callback(value, value2, "center only (a text fill's url() is centered)");
          break;
        case "background-repeat":
          /^\s*no-repeat\s*$/i.test(value2) ? style["background-repeat"] = !0 : callback(value, value2, "no-repeat only (a text fill's url() never tiles)");
          break;
        case "border":
          callback13(value2);
          break;
        case "border-top":
        case "border-right":
        case "border-bottom":
        case "border-left":
          callback13(value2, value.slice(7));
          break;
        case "border-width": {
          let value4 = callback6(value2) ?? (value3.length === 1 && value3[0]?.t === "ident" ? {
            thin: 1,
            medium: 3,
            thick: 5
          }[value3[0].v] : void 0);
          value4 === void 0 ? callback(value, value2, "one LEN for the whole stroke (per-side: border-top|right|bottom|left)") : callback3(value, value4, shapeStrokeBounds, value2) !== void 0 && (style.border = value4 === 0 ? {
            style: "none"
          } : {
            ...style.border,
            width: value4,
            widths: void 0
          });
          break;
        }
        case "border-style": {
          let value4 = callback11(value2, [
            "none",
            "hidden",
            "solid",
            "dashed",
            "dotted",
            "double"
          ]);
          value4 === void 0 ? callback(value, value2, "solid | dashed | dotted | double | none") : style.border = value4 === "hidden" || value4 === "none" ? {
            style: "none"
          } : {
            ...style.border,
            style: value4
          };
          break;
        }
        case "border-color": {
          let value4 = value3.length === 1 ? callback9(value3[0].raw) : void 0;
          value4 === void 0 ? callback(value, value2, "one COLOR for the whole stroke") : style.border = {
            ...style.border,
            color: value4
          };
          break;
        }
        case "border-radius": {
          let value4 = value3.length >= 1 && value3.length <= 4 ? value3.map((input) => (0, runtime2.cssTokenSize)(input)) : [void 0];
          if (value4.some((input) => input === void 0 || "px" in input && input.px < 0)) {
            callback(value, value2, "1–4 LEN | PCT (TL TR BR BL)");
            break;
          }
          let callback14 = (input) => "px" in input ? {
            px: Math.min(input.px, slideStylePropertySchema("borderRadius").hi)
          } : input, value5 = value4.map(callback14), value6 = value5.length === 1 ? [value5[0], value5[0], value5[0], value5[0]] : value5.length === 2 ? [value5[0], value5[1], value5[0], value5[1]] : value5.length === 3 ? [value5[0], value5[1], value5[2], value5[1]] : [value5[0], value5[1], value5[2], value5[3]], value7 = value6.every((input) => JSON.stringify(input) === JSON.stringify(value6[0]));
          style["border-radius"] = value7 ? value6[0] : {
            corners: value6
          };
          break;
        }
        case "box-shadow":
        case "text-shadow": {
          if (value3.length === 1 && value3[0].t === "ident" && value3[0].v === "none")
            break;
          let value4 = (0, runtime2.splitCssTokenGroups)(value3);
          if (value4.length > runtime2.maxShadowCount) {
            callback(value, value2, "at most " + String(runtime2.maxShadowCount) + " shadows");
            break;
          }
          let value5 = value4.map((input) => (0, runtime2.parseCssShadow)(input, value === "box-shadow"));
          value5.some((input) => input === void 0) ? callback(value, value2) : value5.every((input) => callback5(value, callback4(input), value === "box-shadow" ? slideBoxShadowBounds : runtime2.defaultShadowBounds, value2)) && (style[value] = value5);
          break;
        }
        case "opacity": {
          let value4 = value3.length === 1 ? (0, runtime2.cssTokenRatio)(value3[0]) : void 0;
          callback2("opacity", value4 === void 0 ? void 0 : Math.max(0, Math.min(1, value4)), value, value2);
          break;
        }
        case "transform": {
          let value4 = (0, runtime2.parseCssTransform)(value3);
          value4 === void 0 ? callback(value, value2) : style.transform?.value.rotate !== void 0 && value4.value.rotate !== void 0 ? callback(value, value2, "rotate is given both as rotate: and inside transform — write one") : callback5(value, value4.value, runtime2.transformBounds, value2) && (style.transform = {
            ...value4,
            value: {
              ...style.transform?.value,
              ...value4.value
            }
          });
          break;
        }
        case "rotate": {
          let value4 = value3.length === 1 ? (0, runtime2.cssTokenDegrees)(value3[0]) : void 0;
          value4 === void 0 ? callback(value, value2, "ANGLE") : style.transform?.value.rotate !== void 0 ? callback(value, value2, "rotate is given both as rotate: and inside transform — write one") : style.transform = {
            centerX: !1,
            centerY: !1,
            ...style.transform,
            value: {
              ...style.transform?.value,
              rotate: (0, runtime2.normalizeSignedDegrees)(value4)
            }
          };
          break;
        }
        case "filter":
        case "backdrop-filter":
        case "-webkit-backdrop-filter": {
          let value4 = (0, runtime2.parseCssFilter)(value3);
          value4 === void 0 ? callback(value, value2) : callback5(value, value4, runtime2.filterBounds, value2) && (style[value === "filter" ? "filter" : "backdrop-filter"] = value4);
          break;
        }
        case "mix-blend-mode":
          callback2("mix-blend-mode", callback11(value2, [
            "normal",
            "multiply",
            "screen",
            "overlay",
            "darken",
            "lighten"
          ]), value, value2);
          break;
        case "object-fit":
          callback2("object-fit", callback11(value2, ["cover", "contain"]), value, value2);
          break;
        default:
          drop(value + " is not in this format");
      }
    }
    return style;
  }
  function resolveEmListPadding(declarations, getFontSize, warn) {
    let { lo: value, hi: value2 } = slideStylePropertySchema("paddingLeft");
    return declarations.flatMap((input) => {
      if (input.prop !== "padding-left" && input.prop !== "padding-inline-start")
        return [input];
      let value3 = (0, runtime2.tokenizeCssValue)(input.value), value4 = value3.length === 1 ? value3[0] : void 0, value5 = value4?.t === "num" && value4.unit === "em" && Number.isFinite(value4.n) ? value4.n : void 0, value6 = value5 !== void 0 ? Math.round(value5 * getFontSize() * 100) / 100 : (0, runtime2.cssTokenPixels)(value4);
      if (value6 !== void 0 && value6 >= value && value6 <= value2)
        return [
          {
            prop: "padding-left",
            value: String(value6) + "px"
          }
        ];
      if (value6 === void 0 && input.prop === "padding-left")
        return [input];
      let value7 = value6 === void 0 ? "a px or em length" : (value5 !== void 0 ? "is " + String(value6) + "px at the " + String(getFontSize()) + "px font size, " : "") + "outside " + String(value) + "–" + String(value2);
      return warn(input.prop + ': "' + (0, runtime2.compactDiagnosticValue)(input.value) + '" — ' + value7), [];
    });
  }
  function nodeFontSize(node) {
    let style = node.style;
    if (typeof style?.fontSize == "number")
      return style.fontSize;
    let role = String(node.role ?? "body");
    return runtime2.neutralTypeScale[role]?.fontSize ?? 32;
  }
  function nodeLineHeight(node) {
    let style = node.style;
    if (typeof style?.lineHeight == "number")
      return style.lineHeight;
    let role = String(node.role ?? "body");
    return runtime2.neutralTypeScale[role]?.lineHeight ?? 1.4;
  }
  function nodePaddingSize(node) {
    let style = node.style ?? {}, numeric = (input) => typeof style[input] == "number" ? style[input] : 0;
    return {
      x: numeric("paddingLeft") + numeric("paddingRight"),
      y: numeric("paddingTop") + numeric("paddingBottom")
    };
  }
  function nodeHasVisibleContent(node) {
    return node.kind === "text" ? String(node.text ?? "").trim() !== "" : node.kind === "stack" || node.kind === "grid" ? (node.children ?? []).some(nodeHasVisibleContent) : node.kind === "overlay" ? nodeHasVisibleContent(node.base) || (node.layers ?? []).some((input) => nodeHasVisibleContent(input.node)) : node.kind === "table" ? (node.rows ?? []).some((input) => input.some((input2) => String(input2).trim() !== "")) : !1;
  }
  function estimateTableHeight(table, width) {
    let value = table.rows ?? [], value2 = Math.max(1, typeof table.cols == "number" ? table.cols : 1), value3 = Array.isArray(table.colWidths) && table.colWidths.length === value2 ? table.colWidths : Array.from({
      length: value2
    }, () => 1), value4 = value3.reduce((input, options) => input + options, 0), value5 = nodeFontSize(table), value6 = nodeLineHeight(table) * value5, cellPadding = table.cellPadding, value7 = cellPadding?.x !== void 0 ? 2 * cellPadding.x : 0.8 * value5, value8 = cellPadding?.y !== void 0 ? 2 * cellPadding.y : 0.7 * value5, index4 = 0;
    for (let value9 of value) {
      let count = 1;
      value9.forEach((input, options) => {
        let value10 = Math.max(1, width * (value3[options] ?? 1) / value4 - value7);
        for (let value11 of String(input).split(`
`))
          count = Math.max(count, Math.ceil(value11.length * value5 * estimatedGlyphWidthFactor / value10));
      }), index4 += value8 + count * value6;
    }
    return index4;
  }
  function estimateTextUnwrappedWidth(node) {
    let fontSize = nodeFontSize(node), width = 0;
    for (let value of String(node.text ?? "").split(`
`))
      width = Math.max(width, value.length * fontSize * estimatedGlyphWidthFactor);
    return width + nodePaddingSize(node).x;
  }
  function estimateLongestWordWidth(node) {
    let fontSize = nodeFontSize(node), longestWord = "";
    for (let value of String(node.text ?? "").split(/\s+/))
      value.length > longestWord.length && (longestWord = value);
    return {
      px: longestWord.length * fontSize * estimatedLongWordWidthFactor,
      word: longestWord
    };
  }
  function estimateNodeHeight(node, width) {
    let padding = nodePaddingSize(node), innerWidth = Math.max(1, width - padding.x);
    if (node.kind === "text") {
      let value = nodeFontSize(node), value2 = nodeLineHeight(node) * value, index4 = 0;
      for (let value3 of String(node.text ?? "").split(`
`))
        index4 += node.wrap === "nowrap" ? 1 : Math.max(1, Math.ceil(value3.length * value * estimatedGlyphWidthFactor / innerWidth));
      return index4 * value2 + padding.y;
    }
    if (node.kind === "spacer")
      return 0;
    if (node.kind === "table")
      return estimateTableHeight(node, innerWidth) + padding.y;
    if (node.kind === "img" || node.kind === "icon" || node.kind === "shape" || node.kind === "html")
      return typeof node.h == "number" ? node.h : void 0;
    if (node.kind === "stack") {
      let value = node.children ?? [], value2 = typeof node.gap == "number" ? node.gap : 0;
      if (node.dir === "h") {
        if (node.wrap === !0)
          return;
        let index22 = 0, value3 = Math.max(1, (innerWidth - value2 * Math.max(0, value.length - 1)) / Math.max(1, value.length));
        for (let value4 of value) {
          let value5 = estimateNodeHeight(value4, explicitNodeWidth(value4) ?? value3);
          if (value5 === void 0)
            return;
          index22 = Math.max(index22, value5);
        }
        return index22 + padding.y;
      }
      let index4 = 0;
      for (let value3 of value) {
        let value4 = estimateNodeHeight(value3, innerWidth);
        if (value4 === void 0)
          return;
        index4 += value4;
      }
      return index4 + value2 * Math.max(0, value.length - 1) + padding.y;
    }
  }
  function explicitNodeWidth(node) {
    let place = node.place;
    if (place?.minWFit === void 0) {
      if (place !== void 0 && typeof place.minW == "number" && place.minW === place.maxW)
        return place.minW;
      if ((node.kind === "img" || node.kind === "icon" || node.kind === "shape") && typeof node.w == "number")
        return node.w;
    }
  }
  function resolveHtmlAxisPlacement(axis, designSize) {
    let value = typeof axis.margin == "number" ? axis.margin : 0, value2 = typeof axis.size == "number" ? axis.size : void 0, value3 = typeof axis.offset == "number" ? axis.offset : 0;
    switch (axis.anchor) {
      case "leading":
        return {
          at: value,
          ...value2 !== void 0 ? {
            size: value2
          } : {}
        };
      case "fill":
        return designSize === void 0 ? void 0 : {
          at: value,
          size: Math.max(0, designSize - 2 * value)
        };
      case "trailing":
        return designSize === void 0 || value2 === void 0 ? void 0 : {
          at: designSize - value - value2,
          size: value2
        };
      case "center":
        return designSize === void 0 || value2 === void 0 ? void 0 : {
          at: designSize / 2 + value3 - value2 / 2,
          size: value2
        };
      default:
        return;
    }
  }
  function rotatedBox(x, y, width, height2, centerX, centerY, rotation) {
    let value = rotation * Math.PI / 180, value2 = x + width / 2 - centerX, value3 = y + height2 / 2 - centerY;
    return {
      cx: centerX + value2 * Math.cos(value) - value3 * Math.sin(value),
      cy: centerY + value2 * Math.sin(value) + value3 * Math.cos(value),
      hw: width / 2,
      hh: height2 / 2,
      rot: rotation
    };
  }
  function pointInRotatedBoxCoordinates(box, point) {
    let value = -box.rot * Math.PI / 180, value2 = point[0] - box.cx, value3 = point[1] - box.cy;
    return [
      value2 * Math.cos(value) - value3 * Math.sin(value),
      value2 * Math.sin(value) + value3 * Math.cos(value)
    ];
  }
  function segmentIntersectsRotatedBox(box, padding, start, end) {
    let [value, value2] = pointInRotatedBoxCoordinates(box, start), [value3, value4] = pointInRotatedBoxCoordinates(box, end), index4 = 0, count = 1, items = [
      [-(value3 - value), value + box.hw + padding],
      [value3 - value, box.hw + padding - value],
      [-(value4 - value2), value2 + box.hh + padding],
      [value4 - value2, box.hh + padding - value2]
    ];
    for (let [value5, value6] of items) {
      if (Math.abs(value5) < 1e-9) {
        if (value6 < 0)
          return;
        continue;
      }
      let value7 = value6 / value5;
      if (value5 < 0 ? index4 = Math.max(index4, value7) : count = Math.min(count, value7), index4 > count)
        return;
    }
    return [index4, count];
  }
  function rotatedBoxesOverlap(box, otherBox) {
    let callback = (input) => {
      let value4 = input.rot * Math.PI / 180, items = [
        Math.cos(value4) * input.hw,
        Math.sin(value4) * input.hw
      ], items2 = [
        -Math.sin(value4) * input.hh,
        Math.cos(value4) * input.hh
      ];
      return [
        [input.cx + items[0] + items2[0], input.cy + items[1] + items2[1]],
        [input.cx + items[0] - items2[0], input.cy + items[1] - items2[1]],
        [input.cx - items[0] + items2[0], input.cy - items[1] + items2[1]],
        [input.cx - items[0] - items2[0], input.cy - items[1] - items2[1]]
      ];
    }, value = callback(box), value2 = callback(otherBox), value3 = 1 / 0;
    for (let value4 of [box, otherBox]) {
      let value5 = value4.rot * Math.PI / 180;
      for (let value6 of [
        [Math.cos(value5), Math.sin(value5)],
        [-Math.sin(value5), Math.cos(value5)]
      ]) {
        let value7 = value.map((input) => input[0] * value6[0] + input[1] * value6[1]), value8 = value2.map((input) => input[0] * value6[0] + input[1] * value6[1]), value9 = Math.min(Math.max(...value7), Math.max(...value8)) - Math.max(Math.min(...value7), Math.min(...value8));
        if (value9 <= 0)
          return 0;
        value3 = Math.min(value3, value9);
      }
    }
    return value3;
  }
  function estimateTextBounds(node, width, height2) {
    let value = node.style ?? {}, callback = (input) => typeof value[input] == "number" ? value[input] : 0, value2 = nodeFontSize(node), value3 = nodeLineHeight(node) * value2, value4 = Math.max(1, width - callback("paddingLeft") - callback("paddingRight")), value5 = estimateTextUnwrappedWidth(node) - nodePaddingSize(node).x, value6 = node.wrap !== "nowrap" && value5 > value4, index4 = 0;
    for (let value12 of String(node.text ?? "").split(`
`))
      index4 += value6 ? Math.max(1, Math.ceil(value12.length * value2 * estimatedGlyphWidthFactor / value4)) : 1;
    let value7 = value6 ? value4 : value5, value8 = Math.min(height2 - callback("paddingTop") - callback("paddingBottom"), index4 * value3), value9 = Math.max(0, value4 - value7), value10 = callback("paddingLeft") + (node.align === "center" ? value9 / 2 : node.align === "end" ? value9 : 0), value11 = Math.max(0.15 * value2, (value3 - 1.15 * value2) / 2);
    return {
      x: value10,
      y: callback("paddingTop") + value11,
      w: value7,
      h: Math.max(1, value8 - 2 * value11)
    };
  }
  function iconStyleWarnings(node, parentPainted) {
    let items = [], value = node.style ?? {}, value2 = typeof value.opacity == "number" ? value.opacity : 1;
    if (parentPainted || value2 <= 0.5)
      return items;
    let value3 = typeof node.w == "number" ? node.w : void 0, value4 = typeof node.h == "number" ? node.h : value3;
    if (value3 === void 0 || value4 === void 0)
      return items;
    let value5 = Math.round(Math.min(value3, value4) * Number((value.transform ?? {}).scale ?? 1));
    return value5 < 32 && items.push({
      key: "size",
      msg: '"' + String(node.icon) + '" is ' + String(value5) + "px — an icon draws its glyph at about half its box, so under 32px it reads as a speck beside the text; give it width and height of at least 32px (48px next to 24px text)"
    }), items;
  }
  function hasLowOpaqueContrast(foreground, background, opacity, minimumRatio = 1.6) {
    if ((parseHexColorChannels(background)?.a ?? 0) < 0.8)
      return !1;
    let value = hexContrastRatio(foreground, background, opacity);
    return value !== void 0 && value < minimumRatio;
  }
  function parseHexColorChannels(color) {
    let match = typeof color == "string" ? /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color) : null;
    if (match !== null)
      return {
        ch: [0, 2, 4].map((input) => parseInt(match[1].slice(input, input + 2), 16) / 255),
        a: match[2] !== void 0 ? parseInt(match[2], 16) / 255 : 1
      };
  }
  function hexContrastRatio(foreground, background, opacity = 1) {
    let [foregroundColor, backgroundColor] = [
      parseHexColorChannels(foreground),
      parseHexColorChannels(background)
    ];
    if (foregroundColor === void 0 || backgroundColor === void 0)
      return;
    let luminance = (input) => {
      let value4 = input.map((input2) => input2 <= 0.03928 ? input2 / 12.92 : ((input2 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * value4[0] + 0.7152 * value4[1] + 0.0722 * value4[2];
    }, value = foregroundColor.a * opacity, value2 = luminance(foregroundColor.ch.map((input, options) => value * input + (1 - value) * backgroundColor.ch[options])), value3 = luminance(backgroundColor.ch);
    return (Math.max(value2, value3) + 0.05) / (Math.min(value2, value3) + 0.05);
  }
  function compositeHexColor(foreground, background = "#ffffff") {
    let [foregroundColor, backgroundColor] = [
      parseHexColorChannels(foreground),
      parseHexColorChannels(background)
    ];
    return foregroundColor === void 0 || backgroundColor === void 0 ? foreground : "#" + foregroundColor.ch.map((input, options) => Math.round((foregroundColor.a * input + (1 - foregroundColor.a) * backgroundColor.ch[options]) * 255).toString(16).padStart(2, "0")).join("");
  }
  function contrastingTextColor(background) {
    return (hexContrastRatio("#faf9f5", background) ?? 0) > (hexContrastRatio("#141413", background) ?? 0) ? "#faf9f5" : "#141413";
  }
  function collectSlidePaintLayers(slide) {
    let items = [], [items2, items3] = [!1, !1], callback = (source, options, context, value, extra, detail) => {
      let value2 = source.style ?? {}, value3 = context * (typeof value2.opacity == "number" ? value2.opacity : 1), backgroundGradient = value2.backgroundGradient, value4 = backgroundGradient !== void 0 ? (backgroundGradient.stops ?? []).every((input) => parseHexColorChannels(input.color)?.a === 1) ? 1 : void 0 : value2.backgroundColor === void 0 ? 0 : parseHexColorChannels(value2.backgroundColor)?.a, value5 = extra || (value2.mixBlendMode ?? "normal") !== "normal", value6 = value2.filter !== void 0 || value2.backdropFilter !== void 0 || value4 === void 0 || value4 > 0 && value3 < 1, value7 = options === "hidden" ? options : value5 ? "unknown" : value4 === 1 && value3 === 1 ? "hidden" : value6 ? "unknown" : options === "unknown" || value4 === 0 ? options : [...options, value2.backgroundColor], value8 = source.kind === "text" && typeof source.text == "string" && source.text.trim() !== "";
      if ((source.kind === "table" || (value8 || source.kind === "icon") && source.fill === void 0 && source.color === void 0) && (items3 = !0), value7 !== "hidden" && (value8 || source.kind === "icon" || source.kind === "table" || source.kind === "html")) {
        let fill = source.fill, value9 = Array.isArray(source.marks) ? source.marks.flatMap((input) => input.color === void 0 ? [] : [input.color]) : [], value10 = typeof value2.textStrokeWidth == "number" && value2.textStrokeWidth > 0, value11 = fill !== void 0 ? (fill.gradient?.stops ?? []).map((input) => input.color) : [source.color], value12 = source.kind === "table" || source.kind === "html" || value10 || fill !== void 0 && fill.kind !== "gradient" ? void 0 : [...value11, ...value9];
        value7 === "unknown" || value12 === void 0 ? items2 = !0 : items.push({
          colors: value12,
          ink: value11,
          opacity: value3,
          fills: value7,
          bare: value && value8 && value7.length === 0 && value12.every((input) => input !== void 0)
        });
      }
      for (let value9 of Array.isArray(source.children) ? source.children : [])
        value9 !== null && typeof value9 == "object" && callback(value9, value7, value3, value, value5, detail);
      if (source.base !== null && typeof source.base == "object") {
        let base = source.base, value9 = callback(base, value7, value3, value, value5, detail), value10 = value && value9 === value7 && !nodePaintsVisibleContent(base), value11 = base.style ?? {}, value12 = typeof value11.opacity == "number" && value11.opacity < 1 || value11.filter !== void 0, value13 = value9 !== value7 && value9 !== "hidden";
        value13 && detail >= 2 && (items2 = !0);
        for (let value14 of Array.isArray(source.layers) ? source.layers : [])
          value14.node === null || typeof value14.node != "object" || (callback(value14.node, value12 && value7 !== "hidden" ? "unknown" : value7, value3, value10, value5, value13 ? detail + 1 : detail), value13 && detail < 2 && callback(value14.node, value9, value3, !1, value5, detail + 1));
      }
      return value7;
    };
    for (let value of slide)
      callback(value.node, [], 1, !0, !1, 0);
    return {
      shown: items,
      unmeasured: items2,
      colourless: items3
    };
  }
  function nodePaintsVisibleContent(node) {
    let value = node.style ?? {};
    return value.backgroundGradient !== void 0 || value.backgroundColor !== void 0 && parseHexColorChannels(value.backgroundColor)?.a !== 0 ? !0 : node.kind === "text" ? typeof node.text == "string" && node.text.trim() !== "" : node.kind === "spacer" ? !1 : node.kind !== "stack" && node.kind !== "grid" && node.kind !== "overlay" ? !0 : [
      ...Array.isArray(node.children) ? node.children : [],
      node.base,
      ...Array.isArray(node.layers) ? node.layers.map((input) => input.node) : []
    ].some((input) => input !== null && typeof input == "object" && nodePaintsVisibleContent(input));
  }
  function backgroundChangePreservesContrast(paints, previousBackground, background) {
    let callback = (input, options, context) => hexContrastRatio(options ?? contrastingTextColor(context), input.fills.reduce((input2, options2) => compositeHexColor(options2, input2), compositeHexColor(context)), input.opacity);
    return paints.unmeasured || paints.shown.some((input) => input.colors.some((input2) => {
      let [items, items2] = [
        callback(input, input2, previousBackground),
        callback(input, input2, background)
      ];
      return items === void 0 || items2 === void 0 || items >= 3 && items2 < 3;
    }));
  }
  function hexColorAlpha(color) {
    let value = typeof color == "string" ? /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(color) : null;
    return value === null ? 1 : parseInt(value[1], 16) / 255;
  }
  function combineNestedAxisSpecs(outerAxis, innerAxis) {
    let { anchor: outerAnchor, margin: outerMargin } = outerAxis, outerOffset = outerAxis.offset ?? 0, outerSize = outerAxis.size, innerAnchor = innerAxis.anchor, innerMargin = innerAxis.margin, innerOffset = innerAxis.offset ?? 0, innerSize = innerAxis.size, axis = (input, options, context, value2) => {
      let state = {
        anchor: input,
        margin: options,
        offset: context
      };
      return value2 !== void 0 && (state.size = Math.max(1, value2)), state;
    };
    if (outerAnchor === "fill")
      return innerAnchor === "center" ? axis("center", 0, innerOffset, innerSize) : axis(innerAnchor, outerMargin + innerMargin, 0, innerAnchor === "fill" ? void 0 : innerSize);
    if (innerAnchor === outerAnchor)
      return axis(outerAnchor, outerAnchor === "center" ? 0 : outerMargin + innerMargin, outerAnchor === "center" ? outerOffset + innerOffset : 0, innerSize);
    if (outerSize === void 0)
      return "outer";
    if (innerAnchor === "fill")
      return axis(outerAnchor, outerAnchor === "center" ? 0 : outerMargin + innerMargin, outerOffset, outerSize - 2 * innerMargin);
    if (innerSize === void 0)
      return "inner";
    let value = innerAnchor === "leading" ? innerMargin : innerAnchor === "trailing" ? outerSize - innerMargin - innerSize : outerSize / 2 + innerOffset - innerSize / 2;
    return outerAnchor === "leading" ? axis("leading", outerMargin + value, 0, innerSize) : outerAnchor === "trailing" ? axis("trailing", outerMargin + outerSize - value - innerSize, 0, innerSize) : axis("center", 0, outerOffset - outerSize / 2 + value + innerSize / 2, innerSize);
  }
  function isOutOfFlowElement(element) {
    return inlineStyleIsAbsolute(element.attrs.style) || element.tag === "x-connector" && connectorHasExplicitEndpoints(element);
  }
  function inlineStyleIsAbsolute(css) {
    if (css === void 0 || !/position/i.test(css))
      return !1;
    let position = (0, runtime2.parseCssDeclarations)(css, () => {
    }).find((input) => input.prop === "position");
    return position !== void 0 && /^absolute$/i.test(position.value.trim());
  }
  function unwrapTransparentContainer(element, node, context) {
    if (Object.keys(element.attrs).some((input) => input !== "style"))
      return;
    let flag = !1, callback = () => {
      flag = !0;
    };
    if (parseInlineStyle(element.attrs.style, callback, callback), flag || (0, runtime2.parseCssDeclarations)(element.attrs.style ?? "", callback).some((input) => transparentContainerStylePatterns.get(input.prop)?.test(input.value) !== !0))
      return;
    let callback2 = (input) => input !== void 0 && input !== "auto" && "px" in input ? input.px : void 0, value = callback2(node.width), nonStretchWidth = nonStretchAxisExplanation(context, "width", node["align-self"], node["justify-self"]) !== void 0 && !isFullWidthStyle(node);
    if (value !== void 0 ? value <= 0 : context.parentDir === "h" || nonStretchWidth || (context.flowCount ?? 0) < 2)
      return;
    let value2 = callback2(node.height) ?? 0, border = node.border;
    if (border === void 0 || border.style === "none")
      return node["background-color"] !== void 0 && value2 > 0 ? value2 : void 0;
    let value3 = border.width ?? 0;
    if (!(border.sides?.length !== 1 || value3 <= 0 || node["background-color"] !== void 0) && value2 <= value3)
      return value3;
  }
  function migrateThinBorderToFill(node, style, placement, context, thickness) {
    node.h = thickness, style.backgroundColor = style.borderColor;
    for (let value of ["borderStyle", "borderWidth", "borderColor"])
      delete style[value];
    node.style = style, context.parentDir === "v" && context.parentGrid !== !0 && thickness <= 2 * runtime2.maxShapeStrokeWidth && Object.assign(placement, {
      grow: 0,
      shrink: 0
    });
  }
  function parseInlineTextTree(element) {
    let text = "", lastCharacter = "", marks = [], hasList = !1, format, markStart = 0, flushMark = () => {
      if (format !== void 0 && text.length > markStart && (format.bold || format.italic || format.underline || format.color !== void 0 || format.href !== void 0)) {
        let state = {
          start: markStart,
          end: text.length
        };
        format.bold && (state.bold = !0), format.italic && (state.italic = !0), format.underline && (state.underline = !0), format.color !== void 0 && (state.color = format.color), format.href !== void 0 && (state.href = format.href), marks.push(state);
      }
    }, callback = (input, options) => input !== void 0 && input.bold === options.bold && input.italic === options.italic && input.underline === options.underline && input.color === options.color && input.href === options.href, callback2 = (input, options) => ({
      text: "",
      ...input.bold !== void 0 && input.bold === options.bold ? {
        bold: input.bold
      } : {},
      ...input.italic !== void 0 && input.italic === options.italic ? {
        italic: input.italic
      } : {},
      ...input.underline !== void 0 && input.underline === options.underline ? {
        underline: input.underline
      } : {},
      ...input.color !== void 0 && input.color === options.color ? {
        color: input.color
      } : {},
      ...input.href !== void 0 && input.href === options.href ? {
        href: input.href
      } : {}
    }), callback3 = (input, options) => {
      callback(format, options) || (flushMark(), format = options, markStart = text.length), text += input, lastCharacter = input;
    }, value;
    for (let value2 of element)
      for (let value3 of value2.text) {
        if (value3 === `
` && value2.text === `
`) {
          for (hasList = !1; lastCharacter === " "; )
            text = text.slice(0, -1), lastCharacter = text.slice(-1), format !== void 0 && text.length < markStart && (markStart = text.length);
          callback3(`
`, {
            text: ""
          }), value = value2;
          continue;
        }
        if (value3 === " " || value3 === "	" || value3 === `
` || value3 === "\r" || value3 === "\f") {
          hasList = !0, value = value2;
          continue;
        }
        hasList && text.length > 0 && lastCharacter !== `
` && callback3(" ", value === void 0 ? {
          text: ""
        } : callback(value, value2) ? value2 : callback2(value, value2)), hasList = !1, callback3(value3, value2), value = value2;
      }
    return flushMark(), {
      text,
      marks
    };
  }
  function stripCssComments(css) {
    let text = "", index4 = 0;
    for (; ; ) {
      htmlCompilerCounters.commentScans++;
      let value = css.indexOf("/*", index4);
      if (value < 0)
        break;
      let value2 = css.indexOf("*/", value + 2);
      if (value2 < 0)
        break;
      text += css.slice(index4, value), index4 = value2 + 2;
    }
    return text + css.slice(index4);
  }
  function parseFontFaceRules(css, warn, report) {
    let value = stripCssComments(css), value2, text = "";
    for (fontFaceRulesPattern.lastIndex = 0; (value2 = fontFaceRulesPattern.exec(value)) !== null; ) {
      text += value2[0];
      let value4 = value2[1], value5, value6, flag = !1, items = [], index4 = 0, index22 = 0;
      for (let index32 = 0; index32 < value4.length; index32++) {
        let value8 = value4[index32];
        value8 === "(" ? index4++ : value8 === ")" ? index4 = Math.max(0, index4 - 1) : value8 === ";" && index4 === 0 && (items.push(value4.slice(index22, index32)), index22 = index32 + 1);
      }
      items.push(value4.slice(index22));
      for (let value8 of items) {
        if (value8.trim() === "")
          continue;
        let value9 = value8.indexOf(":"), value10 = value8.slice(0, value9).trim().toLowerCase(), value11 = value8.slice(value9 + 1).trim();
        if (value10 === "font-family") {
          let value12 = /^(?:"([^"]*)"|'([^']*)'|([^"']+))$/.exec(value11);
          value5 = (value12?.[1] ?? value12?.[2] ?? value12?.[3] ?? "").trim();
        } else if (value10 === "src") {
          let value12 = /^url\(\s*(?:"([^"]*)"\s*|'([^']*)'\s*|([^"')\s]+)\s*)?\)(?:\s*format\((?:\s*"[^"]*"\s*|\s*'[^']*'\s*|[^)]*)\))?$/i.exec(value11);
          value12 ? value6 = (value12[1] ?? value12[2] ?? value12[3] ?? "").trim() : (warn.errorAt(report, "@font-face src must be one url(file.woff2) (or a data: URI)"), flag = !0);
        } else
          value10 === "font-weight" || value10 === "font-style" || value10 === "font-display" || value10 === "unicode-range" || value10 === "font-stretch" || (warn.errorAt(report, '@font-face: "' + (0, runtime2.compactDiagnosticValue)(value10) + '" — only font-family and src'), flag = !0);
      }
      if (flag)
        continue;
      if (value5 === void 0 || !runtime2.customFontFamilyPattern.test(value5)) {
        warn.errorAt(report, '@font-face font-family "' + (0, runtime2.compactDiagnosticValue)(value5 ?? "") + '" — a plain name (letters, digits, spaces, - _; ≤40 chars, starts with a letter)');
        continue;
      }
      if (value6 === void 0 || value6 === "") {
        warn.errorAt(report, '@font-face for "' + value5 + '" has no src: url(…)');
        continue;
      }
      if (/^data:/i.test(value6)) {
        if (!(0, runtime2.isEmbeddedFontDataUrl)(value6)) {
          warn.errorAt(report, '@font-face "' + value5 + '": src must be data:font/(woff2|woff|ttf|otf);base64,… up to 512 KB');
          continue;
        }
        warn.declareFace({
          family: value5,
          src: value6
        }, report);
        continue;
      }
      if ((0, runtime2.isModelBlobReference)(value6) || runtime2.designSystemFontPathPattern.test(value6)) {
        warn.declareFace({
          family: value5,
          src: value6
        }, report);
        continue;
      }
      if (/^https?:/i.test(value6)) {
        warn.errorAt(report, '@font-face "' + value5 + '": fonts are embedded from a file beside the deck (url(Name.woff2)) or linked through a Google Fonts <link>; other URLs are not fetched');
        continue;
      }
      if (/^\//.test(value6) || !warn.collectsFiles() && /(^|[\\/])\.\.([\\/]|$)/.test(value6)) {
        warn.errorAt(report, '@font-face "' + value5 + '": url(' + (0, runtime2.compactDiagnosticValue)(value6) + ") — a file name or relative path (no absolute paths)");
        continue;
      }
      let value7 = warn.fileRef(value6, "font", report);
      value7 === void 0 && !warn.collectsFiles() && warn.errorAt(report, '@font-face "' + value5 + '": url(' + (0, runtime2.compactDiagnosticValue)(value6) + ") is a file reference with no data — build the deck with scripts/make.ts (it uploads or embeds the font)"), warn.declareFace(value7 !== void 0 ? {
        family: value5,
        src: value7
      } : {
        family: value5,
        src: "file:" + value6
      }, report);
    }
    let value3 = value.replace(fontFaceRulesPattern, "").trim();
    value3 !== "" && warn.errorAt(report, '<style> may contain only @font-face rules — everything else is inline style="" (found "' + (0, runtime2.compactDiagnosticValue)(value3, 50) + '")');
  }
  function parseHtmlHead(head, compiler) {
    let value;
    for (let value2 of head.children)
      if (value2.kind !== "text")
        switch (value2.tag) {
          case "title":
            value = value2.children.map((source) => source.kind === "text" ? source.text : "").join("").replace(/\s+/g, " ").trim();
            break;
          case "meta":
          case "base":
            break;
          case "link": {
            let value3 = (value2.attrs.rel ?? "").trim().toLowerCase(), value4 = (value2.attrs.href ?? "").trim();
            if (value3 !== "stylesheet") {
              if (value3 === "preconnect" || value3 === "dns-prefetch" || value3 === "icon" || value3 === "preload") {
                compiler.warnAt(value2, '<link rel="' + value3 + '"> is not in this format — dropped');
                break;
              }
              compiler.errorAt(value2, '<link> — only rel="stylesheet" to a Google Fonts css2 URL');
              break;
            }
            if (!(0, runtime2.isAllowedGoogleFontStylesheet)(value4)) {
              compiler.errorAt(value2, '<link rel="stylesheet"> may only load https://fonts.googleapis.com/css2?family=… (≤1024 chars, spaces as +, no %-escapes); everything else is inline style=""');
              break;
            }
            let value5 = [
              ...value4.matchAll(/[?&]family=([^&:]+)/g)
            ].map((input) => decodeURIComponent(input[1].replace(/\+/g, " ")).trim());
            value5.length === 0 && compiler.errorAt(value2, "Google Fonts <link> names no family= parameter");
            for (let value6 of value5) {
              if (!runtime2.customFontFamilyPattern.test(value6)) {
                compiler.errorAt(value2, 'Google Fonts family "' + (0, runtime2.compactDiagnosticValue)(value6) + '" is not a usable family name');
                continue;
              }
              compiler.declareFace({
                family: value6,
                href: value4
              }, value2);
            }
            break;
          }
          case "style":
            parseFontFaceRules(value2.children.map((source) => source.kind === "text" ? source.text : "").join(""), compiler, value2);
            break;
          case "script":
            compiler.errorAt(value2, "<script> is not allowed (scripts never run here)");
            break;
          default:
            compiler.errorAt(value2, "<" + value2.tag + "> does not belong in <head> (title, link, style, meta)");
        }
    return value !== void 0 ? {
      title: value
    } : {};
  }
  function deterministicEmbedId(html, index4) {
    let count = 2166136261;
    for (let index22 = 0; index22 < html.length; index22++)
      count ^= html.charCodeAt(index22), count = Math.imul(count, 16777619) >>> 0;
    return "e" + String(index4) + "-" + count.toString(36);
  }
  function compileHtmlSection(section, compiler, theme, index4, assets, previousSlide) {
    compiler.resetSlide(), compiler.slideLabel = "slide " + String(index4 + 1) + (section.attrs.id !== void 0 ? ' "' + (0, runtime2.compactDiagnosticValue)(section.attrs.id, 24) + '"' : "") + ": ";
    let value = compiler.warner(section, "<section> "), state = {
      box: {
        w: runtime2.SLIDE_WIDTH,
        h: runtime2.SLIDE_HEIGHT
      }
    }, value2 = parseInlineStyle(section.attrs.style, value, compiler.rejecter(section, "<section> "), state), values = /* @__PURE__ */ new Set(), state2 = {
      v: 1
    }, value3 = (section.attrs.id ?? "").trim();
    if (previousSlide !== void 0)
      value3 !== previousSlide && value('id="' + (0, runtime2.compactDiagnosticValue)(value3) + '" differs from the record key "' + previousSlide + '" — the key is used'), state2.id = previousSlide;
    else if (value3 !== "" && /^[\w-]{1,64}$/.test(value3))
      state2.id = value3;
    else {
      value3 !== "" && value('id="' + (0, runtime2.compactDiagnosticValue)(value3) + '" — letters, digits, - and _ only — a generated id is used');
      let value14 = index4 + 1;
      for (; assets.has("slide-" + String(value14)); )
        value14++;
      let value15 = "slide-" + String(value14);
      state2.id = value15, assets.add(value15);
    }
    for (let value14 of Object.keys(section.attrs))
      value14 === "id" || value14 === "style" || value14 === "hidden" || value14 === "data-transition" || value14 === "data-section" || value14 === "data-slots" || (value14.startsWith("on") ? value(value14 + " is dropped (scripts never run here)") : value(value14 + " attribute is not in this format — dropped"));
    if ((section.attrs["data-section"] ?? "").replace(/\s+/g, " ").trim().length > runtime2.maxSectionDescriptionLength && value("data-section is one sentence — capped at " + String(runtime2.maxSectionDescriptionLength) + " characters"), section.attrs.hidden !== void 0 && (state2.skipped = !0), section.attrs["data-slots"] !== void 0) {
      let slots = (0, runtime2.normalizeNodeSlots)(section.attrs["data-slots"]);
      slots !== void 0 && (state2.slots = slots);
    }
    let value4 = section.attrs["data-transition"];
    if (value4 !== void 0) {
      let value14 = value4.trim().toLowerCase();
      runtime2.slideTransitionValues.includes(value14) ? state2.transition = value14 : value14 !== "none" && value14 !== "" && value('data-transition="' + (0, runtime2.compactDiagnosticValue)(value4) + '" — fade | push | magic — dropped');
    }
    values.add("background-color"), values.add("background-gradient"), state2.bg = value2["background-color"] ?? "#ffffff";
    let value5 = value2["background-gradient"];
    compiler.slideBg = value5 !== void 0 ? void 0 : value2["background-color"] ?? "#ffffff";
    let value6 = compiler.inherit(value2, theme, section);
    for (let value14 of [
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "letter-spacing",
      "text-align",
      "text-transform",
      "white-space",
      "color"
    ])
      values.add(value14);
    let items = [], items2 = [], items3 = [], value7, value8 = -1, index22 = 0;
    for (let value14 of section.children) {
      if (value14.kind === "text") {
        value14.text.trim() !== "" && (compiler.warnAt(value14, "text directly inside <section> — wrapped in <p>"), value8 < 0 && (value8 = index22), items2.push({
          kind: "el",
          tag: "p",
          attrs: /* @__PURE__ */ Object.create(null),
          children: [value14],
          line: value14.line,
          col: value14.col
        }), index22++);
        continue;
      }
      if (value14.tag === "aside") {
        let { text: value15 } = compiler.inline(value14, value14);
        value14.attrs.style !== void 0 && compiler.warnAt(value14, "style on <aside> is ignored (speaker notes are plain text)"), value15.trim() !== "" && (value7 = value7 === void 0 ? value15 : value7 + `
` + value15), value7 !== void 0 && value7.length > runtime2.maxSlideNotesLength && compiler.warnAt(value14, "speaker notes are capped at " + String(runtime2.maxSlideNotesLength) + " characters — the rest are dropped");
        continue;
      }
      if (value14.tag === "section") {
        compiler.errorAt(value14, "<section> inside <section> — slides do not nest; close the previous section first");
        continue;
      }
      isOutOfFlowElement(value14) ? items3.push({
        at: index22,
        el: value14
      }) : (value8 < 0 && (value8 = index22), items2.push(value14)), index22++;
    }
    if (value5 !== void 0) {
      let value14 = (0, runtime2.gradientSourceMetadata)(value5) ?? {
        first: value5.stops[0].color,
        seeThrough: (0, runtime2.gradientContainsAlpha)(value5)
      };
      value2["background-color"] === void 0 && !(value14.seeThrough && (0, runtime2.gradientHasCustomRadialGeometry)(value5)) && (state2.bg = value14.first);
      let slotWords = (section.attrs["data-slots"] ?? "").trim().split(/\s+/).filter((word) => word !== ""), groundSlots = slotWords.some((word) => word.startsWith("ground:")) ? (0, runtime2.normalizeNodeSlots)(slotWords.filter((word) => word.startsWith("ground:")).join(" ")) : void 0, layerSlotWords = slotWords.filter((word) => !word.startsWith("ground:")), layerSlots = layerSlotWords.length > 0 ? (0, runtime2.normalizeNodeSlots)(layerSlotWords.join(" ")) : void 0;
      groundSlots !== void 0 ? state2.slots = groundSlots : delete state2.slots, items.push({
        id: "",
        x: {
          anchor: "fill",
          margin: 0,
          offset: 0
        },
        y: {
          anchor: "fill",
          margin: 0,
          offset: 0
        },
        node: {
          kind: "stack",
          dir: "v",
          align: "stretch",
          gap: 0,
          children: [],
          style: {
            backgroundGradient: value5
          },
          ...layerSlots !== void 0 ? {
            slots: layerSlots
          } : {}
        }
      });
    }
    let { layout: value9, isGrid: value10 } = compiler.layout(value2, values, value, compiler.rejecter(section, "<section> "));
    values.add("position"), values.add("display");
    let items4 = [
      value2["padding-top"],
      value2["padding-right"],
      value2["padding-bottom"],
      value2["padding-left"]
    ];
    for (let value14 of [
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "overflow"
    ])
      values.add(value14);
    let value11, value12;
    if (items2.length > 0) {
      let value14 = !value10 && value9.dir === "h" ? "h" : "v", state3 = {
        inh: value6,
        depth: 1,
        parentDir: value14,
        parentGrid: value10,
        inContainer: !0,
        parentAlign: inheritedContainerStretchSources(value10, value9),
        parentBlock: inlineStyleSuppressesFlowLayout(section.attrs.style),
        flowCount: items2.length
      }, items7 = [], items8 = [];
      for (let value16 of items2) {
        let value17 = compiler.node(value16, state3);
        value17 !== void 0 && (items7.push(value17), items8.push(value16));
      }
      compiler.bareTableShare(items8, items7, value14, value9.wrap === !0), compiler.loneShareAfterDrops(items2, items8, items7, value14, value10), value12 = items8[0];
      let value15;
      value10 ? (value15 = {
        kind: "grid",
        columns: value9.columns,
        gap: value9.gap,
        children: items7
      }, value9.rows !== void 0 && (value15.rows = value9.rows), value9.alignItems !== void 0 && (value15.alignItems = value9.alignItems), value9.justifyItems !== void 0 && (value15.justifyItems = value9.justifyItems)) : (value15 = {
        kind: "stack",
        dir: value14,
        align: value9.align ?? "stretch",
        gap: value9.gap,
        children: items7
      }, value9.justify !== void 0 && value9.justify !== "start" && (value15.justify = value9.justify), value9.wrap === !0 && value14 === "h" && (value15.wrap = !0), value9.reverse && items7.reverse()), value9.rowGap !== void 0 && (value15.rowGap = value9.rowGap);
      let state4 = {};
      items4[0] !== void 0 && (state4.paddingTop = items4[0]), items4[1] !== void 0 && (state4.paddingRight = items4[1]), items4[2] !== void 0 && (state4.paddingBottom = items4[2]), items4[3] !== void 0 && (state4.paddingLeft = items4[3]), value2.overflow !== void 0 && (state4.overflow = value2.overflow), Object.keys(state4).length > 0 && (value15.style = state4), value11 = {
        id: "",
        x: {
          anchor: "fill",
          margin: 0,
          offset: 0
        },
        y: {
          anchor: "fill",
          margin: 0,
          offset: 0
        },
        node: value15
      };
    }
    for (let value14 of [
      "border",
      "border-radius",
      "box-shadow",
      "opacity",
      "transform",
      "filter",
      "backdrop-filter",
      "mix-blend-mode",
      "text-shadow",
      "text-decoration-line",
      "text-decoration-style",
      "text-decoration-color",
      "font-variant-numeric",
      "text-stroke-width",
      "text-stroke-color",
      "width",
      "height",
      "min-width",
      "min-width-fit",
      "min-height",
      "max-width",
      "max-height",
      "flex-grow",
      "flex-shrink",
      "flex-basis",
      "align-self",
      "justify-self",
      "aspect-ratio",
      "grid-column",
      "grid-row",
      "object-fit",
      "top",
      "right",
      "bottom",
      "left"
    ])
      value2[value14] !== void 0 && compiler.rejectAt(section, "<section> " + diagnosticCssPropertyName(value14) + " does not apply to <section> (the slide is the canvas: background, text defaults, display/gap/padding/align)"), values.add(value14);
    compiler.leftovers(value2, values, section, "<section>");
    let items5 = [], items6 = [], index32 = 0, value13 = index22;
    for (let index42 = 0; index42 < value13; index42++)
      for (index42 === value8 && value11 !== void 0 && (items5.push(value11), items6.push({
        el: section,
        x: value11.x,
        y: value11.y,
        node: value11.node,
        root: !0,
        lead: value12
      })); index32 < items3.length && items3[index32].at === index42; ) {
        let value14 = compiler.frame(items3[index32].el, {
          inh: value6,
          depth: 0,
          inContainer: !1
        }, runtime2.SLIDE_WIDTH, runtime2.SLIDE_HEIGHT, !1);
        value14 !== void 0 && (items5.push(value14), items6.push({
          el: items3[index32].el,
          x: value14.x,
          y: value14.y,
          node: value14.node
        })), index32++;
      }
    if (value5 === void 0 && state.keptColour !== void 0 && state.keptColour !== state2.bg) {
      let value14 = collectSlidePaintLayers(items5);
      !backgroundChangePreservesContrast(value14, state2.bg, state.keptColour) && !(value14.colourless && contrastingTextColor(state.keptColour) !== contrastingTextColor(state2.bg)) && (state2.bg = compiler.slideBg = state.keptColour, value("background: Slides cannot draw this background, so the slide uses the plain colour written in it, " + state.keptColour + " — add background-color: #hex after it to choose another"));
    }
    if (value5 === void 0 && state.refusedGradient !== void 0 && state.wroteColour !== !0 && value2["background-color"] === void 0) {
      let value14 = collectSlidePaintLayers(items5), value15 = value14.shown.filter((input) => input.bare), value16 = value15.every((input) => input.colors.every((input2) => (hexContrastRatio(input2, "#ffffff", input.opacity) ?? 3) < 3 && (hexContrastRatio(input2, "#141413", input.opacity) ?? 0) >= 3)) && value15.some((input) => input.ink.length > 0 && input.ink.every((input2) => (hexContrastRatio(typeof input2 == "string" ? input2.slice(0, 7) : input2, "#ffffff") ?? 3) < 2));
      value15.length > 0 && !value14.colourless && value16 && !backgroundChangePreservesContrast(value14, "#ffffff", "#141413") && (state2.bg = compiler.slideBg = "#141413", value(state.refusedGradient + ": Slides cannot draw this background and found no plain background colour (a hex, rgb(), hsl() or named colour), so the slide is made dark (#141413) to keep its light text readable — add background-color: #hex to choose your own"));
    }
    compiler.lintPinned(items6, runtime2.SLIDE_WIDTH, runtime2.SLIDE_HEIGHT, compiler.slideBg), compiler.flushIcons(), items.push(...items5);
    let count = 1;
    for (let value14 of items)
      for (let value15 of ["in", "out"]) {
        let value16 = value14.build?.[value15];
        value16 !== void 0 && (typeof value16.order != "number" && (value16.order = count), count = Math.max(count, value16.order + 1));
      }
    let values2 = /* @__PURE__ */ new Set();
    for (let value14 of items)
      value14.id !== "" && values2.has(value14.id) && (compiler.warnAt(section, 'duplicate id "' + value14.id + '" on this slide — the second gets a generated id'), value14.id = ""), value14.id !== "" && values2.add(value14.id);
    return items.forEach((input, options) => {
      if (input.id !== "")
        return;
      let value14 = deterministicEmbedId(state2.id, options);
      for (let count2 = 1; values2.has(value14); count2++)
        value14 = deterministicEmbedId(state2.id, options + count2 * items.length);
      input.id = value14, values2.add(value14);
    }), state2.frames = items, value7 !== void 0 && (state2.notes = value7), state2;
  }
  function normalizeVideoIframes(elements) {
    for (let value of elements) {
      if (value.kind !== "el")
        continue;
      if (value.tag !== "iframe" || (0, runtime2.parseVideoLinkUrl)(value.attrs.src ?? "") === null) {
        normalizeVideoIframes(value.children);
        continue;
      }
      let value2 = /* @__PURE__ */ Object.create(null);
      for (let value3 of [
        "src",
        "title",
        "width",
        "height",
        "style",
        "id",
        "data-build-in",
        "data-build-out"
      ])
        value.attrs[value3] !== void 0 && (value2[value3] = value.attrs[value3]);
      value.wrote = "iframe", value.tag = "video", value.attrs = value2, value.children = [];
    }
  }
  function compileSlideHtml(html, options = {}) {
    let compiler = new SlideHtmlCompiler(options.fileMap, options.collectFiles === !0, (0, runtime2.normalizeListRenderingMode)(options.lists)), elements;
    try {
      elements = parseSlideHtmlTree(html);
    } catch (value9) {
      if (!(value9 instanceof HtmlParseError))
        throw value9;
      compiler.errorAt(value9, value9.message), elements = recoverSectionTrees(html, (input) => compiler.errorAt(input, input.message));
    }
    normalizeVideoIframes(elements);
    let value, value2, items = [], index4 = 0, callback = (input) => {
      for (let value9 of input) {
        if (value9.kind === "text") {
          value9.text.trim() !== "" && items.push(value9);
          continue;
        }
        if (value9.tag === "html") {
          for (let value10 of Object.keys(value9.attrs))
            value10 !== "lang" && compiler.warnAt(value9, "<html " + value10 + "> attribute is dropped");
          callback(value9.children);
        } else
          value9.tag === "head" ? (value !== void 0 && compiler.errorAt(value9, "a second <head>"), value = value9) : value9.tag === "body" ? (value2 !== void 0 && compiler.errorAt(value9, "a second <body>"), value2 = value9) : value9.tag === "title" || value9.tag === "link" || value9.tag === "style" || value9.tag === "meta" ? (value === void 0 && (value = {
            kind: "el",
            tag: "head",
            attrs: /* @__PURE__ */ Object.create(null),
            children: [],
            line: value9.line,
            col: value9.col
          }), value.children.push(value9), index4 += 1) : items.push(value9);
      }
    };
    callback(elements);
    let { title: value3 } = value !== void 0 ? parseHtmlHead(value, compiler) : {}, value4 = compiler.warner(value2 ?? {
      line: 1,
      col: 1
    }, "<body> "), value5 = compiler.rejecter(value2 ?? {
      line: 1,
      col: 1
    }, "<body> "), value6 = value2 !== void 0 ? parseInlineStyle(value2.attrs.style, value4, value5) : {};
    if (value2 !== void 0)
      for (let value9 of Object.keys(value2.attrs))
        value9 !== "style" && value4(value9 + " attribute is dropped");
    let value7 = compiler.inherit(value6, {}, value2 ?? {
      line: 1,
      col: 1
    });
    for (let value9 of Object.keys(value6))
      ![
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "letter-spacing",
        "text-align",
        "text-transform",
        "white-space",
        "color"
      ].includes(value9) && value6[value9] !== void 0 && value5(diagnosticCssPropertyName(value9) + " does not apply to <body> (text defaults only: font-family/size/weight/style, line-height, letter-spacing, color, text-align, text-transform)");
    let items2 = [], items3 = [...value2?.children ?? [], ...items];
    for (let value9 of items3) {
      if (value9.kind === "text") {
        value9.text.trim() !== "" && compiler.errorAt(value9, "text outside any <section> — every slide is a <section>");
        continue;
      }
      value9.tag === "section" ? items2.push(value9) : value9.tag === "aside" || supportedSlideHtmlElementNames.has(value9.tag) || supportedInlineElementNames.has(value9.tag) ? compiler.errorAt(value9, "<" + value9.tag + "> outside any <section> — every slide is a <section>; put it inside one") : compiler.errorAt(value9, "<" + value9.tag + "> is not a tag in this format");
    }
    items2.length === 0 && compiler.errors.length === 0 && compiler.errorAt({
      line: 1,
      col: 1
    }, "no <section> found — a deck is one <section> per slide"), items2.length > runtime2.maxDeckSlides && compiler.errorAt(items2[runtime2.maxDeckSlides], "more than " + String(runtime2.maxDeckSlides) + " 页幻灯片");
    let items4 = [], value8 = /* @__PURE__ */ Object.create(null), items5 = [], values = /* @__PURE__ */ new Set(), values2 = /* @__PURE__ */ new Set();
    for (let value9 of items2) {
      let value10 = (value9.attrs.id ?? "").trim();
      /^[\w-]{1,64}$/.test(value10) && values2.add(value10);
    }
    items2.slice(0, runtime2.maxDeckSlides).forEach((input, options2) => {
      let value9 = compileHtmlSection(input, compiler, value7, options2, values2, options2 === 0 ? options.sectionId : void 0);
      if (value9 === void 0)
        return;
      let id = value9.id;
      if (values.has(id)) {
        compiler.errorAt(input, 'duplicate section id "' + id + '" — ids must be unique (magic move pairs elements by id across slides)');
        let count = 2;
        for (; values.has(id + "-" + String(count)); )
          count++;
        id = id + "-" + String(count), value9.id = id;
      }
      values.add(id), items4.push(id), value8[id] = value9, input.attrs["data-section"] !== void 0 && (items5.length >= runtime2.maxDeckSections ? compiler.warnAt(input, "more than " + String(runtime2.maxDeckSections) + " deck sections — data-section dropped") : /^__.*__$/.test(id) ? compiler.warnAt(input, 'id="' + id + '" cannot key a deck section — rename the slide') : items5.push({
        id,
        description: input.attrs["data-section"],
        start: id
      }));
    }), items2.length > 0 && compiler.faces.length === 0 && !compiler.sawFontFamily && compiler.warnAt(value2 ?? {
      line: 1,
      col: 1
    }, "no fonts declared (no @font-face <style> or Google Fonts <link>) and no font-family anywhere — text renders in the viewer's default fonts; link a face from Google Fonts or set font-family on <body>");
    let state = {
      theme: "neutral",
      format: "html",
      order: items4,
      slides: value8,
      assets: {}
    };
    return (0, runtime2.normalizeListRenderingMode)(options.lists) !== void 0 && (state.lists = (0, runtime2.normalizeListRenderingMode)(options.lists)), items5.length > 0 && (state.sections = items5), compiler.faces.length > 0 && (state.faces = compiler.faces.map((input) => typeof input.src == "string" && input.src.startsWith("file:") ? {
      family: input.family
    } : input)), compiler.dedupeDiags(), {
      content: state,
      ...value3 !== void 0 && value3 !== "" ? {
        title: value3
      } : {},
      warnings: compiler.warnings,
      errors: compiler.errors,
      hoisted: index4,
      notes: compiler.notes(),
      unsupported: compiler.unsupported,
      cellRemovals: compiler.cellRemovals,
      lints: compiler.lints,
      files: compiler.files
    };
  }
  function formatCompileDiagnostic(diagnostic) {
    return String(diagnostic.line) + ":" + String(diagnostic.col) + " " + diagnostic.message;
  }
  return bindRuntimeValue(runtime2, "looksLikeSlideHtml", () => looksLikeSlideHtml), bindRuntimeValue(runtime2, "decodeHtmlEntities", () => decodeHtmlEntities), bindRuntimeValue(runtime2, "HtmlSourceCursor", () => HtmlSourceCursor, (value) => {
    HtmlSourceCursor = value;
  }), bindRuntimeValue(runtime2, "parseHtmlTag", () => parseHtmlTag), bindRuntimeValue(runtime2, "parseSlideHtmlTree", () => parseSlideHtmlTree), bindRuntimeValue(runtime2, "recoverSectionTrees", () => recoverSectionTrees), bindRuntimeValue(runtime2, "slideStylePropertySchema", () => slideStylePropertySchema), bindRuntimeValue(runtime2, "connectorHasExplicitEndpoints", () => connectorHasExplicitEndpoints), bindRuntimeValue(runtime2, "clampShapeOutlineWidth", () => clampShapeOutlineWidth), bindRuntimeValue(runtime2, "ownRecordValue", () => ownRecordValue), bindRuntimeValue(runtime2, "resolveFontFamilyAlias", () => resolveFontFamilyAlias), bindRuntimeValue(runtime2, "resolveBasicFontFamily", () => resolveBasicFontFamily), bindRuntimeValue(runtime2, "webSafeFontFallback", () => webSafeFontFallback), bindRuntimeValue(runtime2, "stripHtmlMarkup", () => stripHtmlMarkup), bindRuntimeValue(runtime2, "utf8ToBase64", () => utf8ToBase64), bindRuntimeValue(runtime2, "parseSvgDimensions", () => parseSvgDimensions), bindRuntimeValue(runtime2, "decodeCssEscapes", () => decodeCssEscapes), bindRuntimeValue(runtime2, "sanitizeSvgXmlText", () => sanitizeSvgXmlText), bindRuntimeValue(runtime2, "sanitizeSvgMarkup", () => sanitizeSvgMarkup), bindRuntimeValue(runtime2, "validateSvgMarkup", () => validateSvgMarkup), bindRuntimeValue(runtime2, "decodeSvgDataUrl", () => decodeSvgDataUrl), bindRuntimeValue(runtime2, "parseInlineStyleUnchecked", () => parseInlineStyleUnchecked), bindRuntimeValue(runtime2, "inlineStyleSuppressesFlowLayout", () => inlineStyleSuppressesFlowLayout), bindRuntimeValue(runtime2, "inlineStyleHasPercentSize", () => inlineStyleHasPercentSize), bindRuntimeValue(runtime2, "nodeHasExplicitAxisSize", () => nodeHasExplicitAxisSize), bindRuntimeValue(runtime2, "inheritedContainerStretchSources", () => inheritedContainerStretchSources), bindRuntimeValue(runtime2, "nonStretchAxisExplanation", () => nonStretchAxisExplanation), bindRuntimeValue(runtime2, "inlineStyleHasUnsafeSizing", () => inlineStyleHasUnsafeSizing), bindRuntimeValue(runtime2, "inlineStyleHasUnsafeBackground", () => inlineStyleHasUnsafeBackground), bindRuntimeValue(runtime2, "parseInlineStyle", () => parseInlineStyle), bindRuntimeValue(runtime2, "resolveEmListPadding", () => resolveEmListPadding), bindRuntimeValue(runtime2, "nodeFontSize", () => nodeFontSize), bindRuntimeValue(runtime2, "nodeLineHeight", () => nodeLineHeight), bindRuntimeValue(runtime2, "nodePaddingSize", () => nodePaddingSize), bindRuntimeValue(runtime2, "nodeHasVisibleContent", () => nodeHasVisibleContent), bindRuntimeValue(runtime2, "estimateTableHeight", () => estimateTableHeight), bindRuntimeValue(runtime2, "estimateTextUnwrappedWidth", () => estimateTextUnwrappedWidth), bindRuntimeValue(runtime2, "estimateLongestWordWidth", () => estimateLongestWordWidth), bindRuntimeValue(runtime2, "estimateNodeHeight", () => estimateNodeHeight), bindRuntimeValue(runtime2, "explicitNodeWidth", () => explicitNodeWidth), bindRuntimeValue(runtime2, "resolveHtmlAxisPlacement", () => resolveHtmlAxisPlacement), bindRuntimeValue(runtime2, "rotatedBox", () => rotatedBox), bindRuntimeValue(runtime2, "pointInRotatedBoxCoordinates", () => pointInRotatedBoxCoordinates), bindRuntimeValue(runtime2, "segmentIntersectsRotatedBox", () => segmentIntersectsRotatedBox), bindRuntimeValue(runtime2, "rotatedBoxesOverlap", () => rotatedBoxesOverlap), bindRuntimeValue(runtime2, "estimateTextBounds", () => estimateTextBounds), bindRuntimeValue(runtime2, "iconStyleWarnings", () => iconStyleWarnings), bindRuntimeValue(runtime2, "hasLowOpaqueContrast", () => hasLowOpaqueContrast), bindRuntimeValue(runtime2, "parseHexColorChannels", () => parseHexColorChannels), bindRuntimeValue(runtime2, "hexContrastRatio", () => hexContrastRatio), bindRuntimeValue(runtime2, "compositeHexColor", () => compositeHexColor), bindRuntimeValue(runtime2, "contrastingTextColor", () => contrastingTextColor), bindRuntimeValue(runtime2, "collectSlidePaintLayers", () => collectSlidePaintLayers), bindRuntimeValue(runtime2, "nodePaintsVisibleContent", () => nodePaintsVisibleContent), bindRuntimeValue(runtime2, "backgroundChangePreservesContrast", () => backgroundChangePreservesContrast), bindRuntimeValue(runtime2, "hexColorAlpha", () => hexColorAlpha), bindRuntimeValue(runtime2, "SlideHtmlCompiler", () => SlideHtmlCompiler, (value) => {
    SlideHtmlCompiler = value;
  }), bindRuntimeValue(runtime2, "combineNestedAxisSpecs", () => combineNestedAxisSpecs), bindRuntimeValue(runtime2, "inlineStyleIsAbsolute", () => inlineStyleIsAbsolute), bindRuntimeValue(runtime2, "unwrapTransparentContainer", () => unwrapTransparentContainer), bindRuntimeValue(runtime2, "migrateThinBorderToFill", () => migrateThinBorderToFill), bindRuntimeValue(runtime2, "parseInlineTextTree", () => parseInlineTextTree), bindRuntimeValue(runtime2, "stripCssComments", () => stripCssComments), bindRuntimeValue(runtime2, "parseFontFaceRules", () => parseFontFaceRules), bindRuntimeValue(runtime2, "parseHtmlHead", () => parseHtmlHead), bindRuntimeValue(runtime2, "deterministicEmbedId", () => deterministicEmbedId), bindRuntimeValue(runtime2, "compileHtmlSection", () => compileHtmlSection), bindRuntimeValue(runtime2, "normalizeVideoIframes", () => normalizeVideoIframes), bindRuntimeValue(runtime2, "compileSlideHtml", () => compileSlideHtml), bindRuntimeValue(runtime2, "formatCompileDiagnostic", () => formatCompileDiagnostic), bindRuntimeValue(runtime2, "slideHtmlPrefixPattern", () => slideHtmlPrefixPattern, (value) => {
    slideHtmlPrefixPattern = value;
  }), bindRuntimeValue(runtime2, "htmlVoidElementNames", () => htmlVoidElementNames, (value) => {
    htmlVoidElementNames = value;
  }), bindRuntimeValue(runtime2, "htmlRawTextElementNames", () => htmlRawTextElementNames, (value) => {
    htmlRawTextElementNames = value;
  }), bindRuntimeValue(runtime2, "htmlBlockElementNames", () => htmlBlockElementNames, (value) => {
    htmlBlockElementNames = value;
  }), bindRuntimeValue(runtime2, "htmlOptionalClosingElementNames", () => htmlOptionalClosingElementNames, (value) => {
    htmlOptionalClosingElementNames = value;
  }), bindRuntimeValue(runtime2, "htmlNamedEntities", () => htmlNamedEntities, (value) => {
    htmlNamedEntities = value;
  }), bindRuntimeValue(runtime2, "HtmlParseError", () => HtmlParseError, (value) => {
    HtmlParseError = value;
  }), bindRuntimeValue(runtime2, "cssBoxSideNames", () => cssBoxSideNames, (value) => {
    cssBoxSideNames = value;
  }), bindRuntimeValue(runtime2, "cssBorderSideWidthFields", () => cssBorderSideWidthFields, (value) => {
    cssBorderSideWidthFields = value;
  }), bindRuntimeValue(runtime2, "containerPaddingBounds", () => containerPaddingBounds, (value) => {
    containerPaddingBounds = value;
  }), bindRuntimeValue(runtime2, "slideBoxShadowBounds", () => slideBoxShadowBounds, (value) => {
    slideBoxShadowBounds = value;
  }), bindRuntimeValue(runtime2, "shapeStrokeBounds", () => shapeStrokeBounds, (value) => {
    shapeStrokeBounds = value;
  }), bindRuntimeValue(runtime2, "diagnosticCssPropertyNames", () => diagnosticCssPropertyNames, (value) => {
    diagnosticCssPropertyNames = value;
  }), bindRuntimeValue(runtime2, "diagnosticCssPropertyName", () => diagnosticCssPropertyName, (value) => {
    diagnosticCssPropertyName = value;
  }), bindRuntimeValue(runtime2, "diagnosticHtmlTagLabel", () => diagnosticHtmlTagLabel, (value) => {
    diagnosticHtmlTagLabel = value;
  }), bindRuntimeValue(runtime2, "connectorAttributeNames", () => connectorAttributeNames, (value) => {
    connectorAttributeNames = value;
  }), bindRuntimeValue(runtime2, "videoAttributeNames", () => videoAttributeNames, (value) => {
    videoAttributeNames = value;
  }), bindRuntimeValue(runtime2, "imageVideoAttributeNames", () => imageVideoAttributeNames, (value) => {
    imageVideoAttributeNames = value;
  }), bindRuntimeValue(runtime2, "blockTextElementNames", () => blockTextElementNames, (value) => {
    blockTextElementNames = value;
  }), bindRuntimeValue(runtime2, "cssAlignmentMap", () => cssAlignmentMap, (value) => {
    cssAlignmentMap = value;
  }), bindRuntimeValue(runtime2, "cssJustificationMap", () => cssJustificationMap, (value) => {
    cssJustificationMap = value;
  }), bindRuntimeValue(runtime2, "genericFontFallbackKinds", () => genericFontFallbackKinds, (value) => {
    genericFontFallbackKinds = value;
  }), bindRuntimeValue(runtime2, "webSafeFontAliases", () => webSafeFontAliases, (value) => {
    webSafeFontAliases = value;
  }), bindRuntimeValue(runtime2, "webSafeFallbackFaces", () => webSafeFallbackFaces, (value) => {
    webSafeFallbackFaces = value;
  }), bindRuntimeValue(runtime2, "specialGenericFontFaces", () => specialGenericFontFaces, (value) => {
    specialGenericFontFaces = value;
  }), bindRuntimeValue(runtime2, "supportedSlideHtmlElementNames", () => supportedSlideHtmlElementNames, (value) => {
    supportedSlideHtmlElementNames = value;
  }), bindRuntimeValue(runtime2, "supportedInlineElementNames", () => supportedInlineElementNames, (value) => {
    supportedInlineElementNames = value;
  }), bindRuntimeValue(runtime2, "inlineFormatElementNames", () => inlineFormatElementNames, (value) => {
    inlineFormatElementNames = value;
  }), bindRuntimeValue(runtime2, "flattenableInlineElementNames", () => flattenableInlineElementNames, (value) => {
    flattenableInlineElementNames = value;
  }), bindRuntimeValue(runtime2, "unsafeSvgMarkupRules", () => unsafeSvgMarkupRules, (value) => {
    unsafeSvgMarkupRules = value;
  }), bindRuntimeValue(runtime2, "unsupportedSvgAnimationRules", () => unsupportedSvgAnimationRules, (value) => {
    unsupportedSvgAnimationRules = value;
  }), bindRuntimeValue(runtime2, "nonRenderingSvgElementNames", () => nonRenderingSvgElementNames, (value) => {
    nonRenderingSvgElementNames = value;
  }), bindRuntimeValue(runtime2, "forbiddenSvgElementNames", () => forbiddenSvgElementNames, (value) => {
    forbiddenSvgElementNames = value;
  }), bindRuntimeValue(runtime2, "svgExternalResourceAttributes", () => svgExternalResourceAttributes, (value) => {
    svgExternalResourceAttributes = value;
  }), bindRuntimeValue(runtime2, "svgTagTokenPattern", () => svgTagTokenPattern, (value) => {
    svgTagTokenPattern = value;
  }), bindRuntimeValue(runtime2, "svgAttributeTokenPattern", () => svgAttributeTokenPattern, (value) => {
    svgAttributeTokenPattern = value;
  }), bindRuntimeValue(runtime2, "svgNamespace", () => svgNamespace, (value) => {
    svgNamespace = value;
  }), bindRuntimeValue(runtime2, "xlinkNamespace", () => xlinkNamespace, (value) => {
    xlinkNamespace = value;
  }), bindRuntimeValue(runtime2, "htmlWindows1252CodePoints", () => htmlWindows1252CodePoints, (value) => {
    htmlWindows1252CodePoints = value;
  }), bindRuntimeValue(runtime2, "isInvalidXmlCodePoint", () => isInvalidXmlCodePoint, (value) => {
    isInvalidXmlCodePoint = value;
  }), bindRuntimeValue(runtime2, "htmlCompilerCounters", () => htmlCompilerCounters, (value) => {
    htmlCompilerCounters = value;
  }), bindRuntimeValue(runtime2, "inheritedInlineStyles", () => inheritedInlineStyles, (value) => {
    inheritedInlineStyles = value;
  }), bindRuntimeValue(runtime2, "elementInlineStyle", () => elementInlineStyle, (value) => {
    elementInlineStyle = value;
  }), bindRuntimeValue(runtime2, "compileWarningCodes", () => compileWarningCodes, (value) => {
    compileWarningCodes = value;
  }), bindRuntimeValue(runtime2, "estimatedGlyphWidthFactor", () => estimatedGlyphWidthFactor, (value) => {
    estimatedGlyphWidthFactor = value;
  }), bindRuntimeValue(runtime2, "estimatedLongWordWidthFactor", () => estimatedLongWordWidthFactor, (value) => {
    estimatedLongWordWidthFactor = value;
  }), bindRuntimeValue(runtime2, "importedHtmlTypeScale", () => importedHtmlTypeScale, (value) => {
    importedHtmlTypeScale = value;
  }), bindRuntimeValue(runtime2, "htmlHeadingNames", () => htmlHeadingNames, (value) => {
    htmlHeadingNames = value;
  }), bindRuntimeValue(runtime2, "slideHtmlIconNames", () => slideHtmlIconNames, (value) => {
    slideHtmlIconNames = value;
  }), bindRuntimeValue(runtime2, "mediaHtmlElementNames", () => mediaHtmlElementNames, (value) => {
    mediaHtmlElementNames = value;
  }), bindRuntimeValue(runtime2, "iconPlaceholderLabel", () => iconPlaceholderLabel, (value) => {
    iconPlaceholderLabel = value;
  }), bindRuntimeValue(runtime2, "genericIconPlaceholderLabel", () => genericIconPlaceholderLabel, (value) => {
    genericIconPlaceholderLabel = value;
  }), bindRuntimeValue(runtime2, "elementPlaceholderLabel", () => elementPlaceholderLabel, (value) => {
    elementPlaceholderLabel = value;
  }), bindRuntimeValue(runtime2, "neutralHtmlShadowPresets", () => neutralHtmlShadowPresets, (value) => {
    neutralHtmlShadowPresets = value;
  }), bindRuntimeValue(runtime2, "htmlTagTextRoles", () => htmlTagTextRoles, (value) => {
    htmlTagTextRoles = value;
  }), bindRuntimeValue(runtime2, "simpleCssColorSource", () => simpleCssColorSource, (value) => {
    simpleCssColorSource = value;
  }), bindRuntimeValue(runtime2, "transparentContainerBorderPattern", () => transparentContainerBorderPattern, (value) => {
    transparentContainerBorderPattern = value;
  }), bindRuntimeValue(runtime2, "noBorderPattern", () => noBorderPattern, (value) => {
    noBorderPattern = value;
  }), bindRuntimeValue(runtime2, "transparentContainerFillPattern", () => transparentContainerFillPattern, (value) => {
    transparentContainerFillPattern = value;
  }), bindRuntimeValue(runtime2, "transparentContainerStylePatterns", () => transparentContainerStylePatterns, (value) => {
    transparentContainerStylePatterns = value;
  }), bindRuntimeValue(runtime2, "fontFaceRulesPattern", () => fontFaceRulesPattern, (value) => {
    fontFaceRulesPattern = value;
  }), bindRuntimeValue(runtime2, "initializeHtmlCompiler", () => initializeHtmlCompiler, (value) => {
    initializeHtmlCompiler = value;
  }), () => {
    HtmlSourceCursor = class {
      src;
      baseLine;
      baseCol;
      pos = 0;
      lineStarts = [0];
      constructor(items, options = 0, context = 0) {
        this.src = items, this.baseLine = options, this.baseCol = context;
        for (let index4 = 0; index4 < items.length; index4++)
          items[index4] === `
` && this.lineStarts.push(index4 + 1);
      }
      lineCol(input = this.pos) {
        let index4 = 0, value = this.lineStarts.length - 1;
        for (; index4 < value; ) {
          let value4 = index4 + value + 1 >> 1;
          this.lineStarts[value4] <= input ? index4 = value4 : value = value4 - 1;
        }
        let value2 = index4 + 1, value3 = input - this.lineStarts[index4] + 1;
        return {
          line: value2 + this.baseLine,
          col: value2 === 1 ? value3 + this.baseCol : value3
        };
      }
      fail(input, options = this.pos) {
        let { line: value, col: value2 } = this.lineCol(options);
        throw new HtmlParseError(input, value, value2);
      }
    }, SlideHtmlCompiler = class {
      fileMap;
      collectFiles;
      lists;
      warnings = [];
      errors = [];
      lints = [];
      slideBg;
      iconQ = [];
      queueIcon(input, options, context, value) {
        for (let value2 of iconStyleWarnings(context, value))
          this.iconQ.push({
            p: input,
            key: value2.key,
            msg: options + value2.msg
          });
      }
      flushIcons() {
        let entries = /* @__PURE__ */ new Map();
        for (let value of this.iconQ) {
          let entry = entries.get(value.key);
          entry === void 0 ? entries.set(value.key, {
            first: value,
            n: 1
          }) : entry.n++;
        }
        for (let { first: value, n: value2 } of entries.values())
          this.lintAt(value.p, value.msg + (value2 > 1 ? " (and " + String(value2 - 1) + " more like it on this slide)" : ""));
        this.iconQ = [];
      }
      lintAt(input, options) {
        this.lints.length < 500 && this.lints.push({
          line: input.line,
          col: input.col,
          message: options
        });
      }
      lintPinned(input, options, context, value) {
        let callback = (input2) => "<" + input2.tag + (input2.attrs.id !== void 0 ? ' id="' + (0, runtime2.compactDiagnosticValue)(input2.attrs.id) + '"' : "") + ">", value2 = input.map((input2) => {
          let value4 = resolveHtmlAxisPlacement(input2.x, options), value5 = resolveHtmlAxisPlacement(input2.y, context), value6 = value4?.size, value7 = value5?.size, flag = !1;
          value7 === void 0 && value6 !== void 0 && nodeHasVisibleContent(input2.node) && (value7 = estimateNodeHeight(input2.node, value6), flag = !0);
          let value8 = input2.node.kind === "overlay" ? input2.node.base : input2.node, value9 = input2.node.kind === "shape" ? {
            rotate: Number(input2.node.rotate ?? 0)
          } : value8.style?.transform, value10 = Number(value9?.rotate ?? 0) % 180, value11 = Math.abs(Math.abs(value10) - 90) < 1, value12 = !value11 && Math.abs(value10) > 0.5 || (value9?.scale ?? 1) !== 1 || (value9?.skewX ?? 0) !== 0 || (value9?.skewY ?? 0) !== 0, value13 = value4 === void 0 ? void 0 : value4.at + Number(value9?.translateX ?? 0), value14 = value5 === void 0 ? void 0 : value5.at + Number(value9?.translateY ?? 0), value15 = value6 !== void 0 && input2.node.kind === "text" && input2.node.wrap === "nowrap" ? Math.max(value6, estimateTextUnwrappedWidth(input2.node)) : value6, value16 = value11 && value13 !== void 0 && value14 !== void 0 && value6 !== void 0 && value15 !== void 0 && value7 !== void 0 ? {
            x: value13 + value6 / 2 - value7 / 2,
            y: value10 < 0 ? value14 + value7 / 2 + value6 / 2 - value15 : value14 + value7 / 2 - value6 / 2,
            w: value7,
            h: value15
          } : {
            x: value13,
            y: value14,
            w: value15,
            h: value7
          };
          return {
            it: input2,
            x: value13,
            y: value14,
            w: value6,
            h: value7,
            estH: flag,
            skew: value12,
            quarter: value11,
            foot: value16
          };
        });
        for (let value4 of value2) {
          let { node: it, el: it2 } = value4.it;
          if (it.kind === "shape" && String(it.shape).startsWith("arrow-") && value4.w !== void 0 && value4.h !== void 0 && value4.w > 0 && value4.h > 0) {
            let value5 = String(it.shape).endsWith("left") || String(it.shape).endsWith("right") ? value4.w / value4.h : value4.h / value4.w;
            value5 > 3 && this.lintAt(it2, callback(it2) + ' kind="' + String(it.shape) + '" is stretched ' + String(Math.round(value5 * 10) / 10) + ":1 — block arrows distort past ~2:1; for a line with an arrowhead use <x-connector x1 y1 x2 y2>");
          }
          if (value4.w !== void 0 && it.kind !== "shape" && this.lintWords(it, value4.w, it2, callback(it2)), value4.w !== void 0 && value4.h !== void 0 && !value4.estH && nodeHasVisibleContent(it)) {
            let value5 = estimateNodeHeight(it, value4.w);
            value5 !== void 0 && value5 > value4.h * 1.05 + 8 && this.lintAt(it2, callback(it2) + " is " + String(Math.round(value4.h)) + "px tall but holds an estimated ~" + String(Math.round(value5)) + "px of content — " + (it.kind === "text" && (it.fit ?? runtime2.defaultTextFit) === "shrink" || it.kind === "stack" && it.dir !== "h" ? value4.h / value5 >= runtime2.textFitMinimumScale ? "expect its text to shrink to ~" + String(Math.min(99, Math.round(value4.h / value5 * 100))) + "% to fit" : "its text shrinks to the " + String(Math.round(runtime2.textFitMinimumScale * 100)) + "% floor and still does not fit" : "it may overflow") + "; budget the height, shorten the text, or let the box size itself (drop height)");
          }
        }
        for (let index4 = 0; index4 < value2.length; index4++) {
          let foot = value2[index4].foot, value4 = value2[index4];
          if (!(value4.it.root === !0 || value4.skew || foot.x === void 0 || foot.y === void 0 || foot.w === void 0 || foot.h === void 0 || !nodeHasVisibleContent(value4.it.node)))
            for (let value5 = index4 + 1; value5 < value2.length; value5++) {
              let foot2 = value2[value5].foot, value6 = value2[value5];
              if (value6.it.root === !0 || value6.skew || foot2.x === void 0 || foot2.y === void 0 || foot2.w === void 0 || foot2.h === void 0 || !nodeHasVisibleContent(value6.it.node))
                continue;
              let value7 = Math.min(foot.x + foot.w, foot2.x + foot2.w) - Math.max(foot.x, foot2.x), value8 = Math.min(foot.y + foot.h, foot2.y + foot2.h) - Math.max(foot.y, foot2.y);
              value7 > 4 && value8 > 4 && this.lintAt(value6.it.el, callback(value6.it.el) + " overlaps " + callback(value4.it.el) + " (line " + String(value4.it.el.line) + ") by " + String(Math.round(value7)) + "×" + String(Math.round(value8)) + "px" + (value4.estH || value6.estH ? " (heights estimated from the text)" : "") + " — both hold text; move or resize one");
            }
        }
        {
          let items3 = [], value4, flag = !1;
          for (let value5 of value2) {
            if (value5.it.root === !0) {
              flag = !0;
              let node2 = value5.it.node, value7 = node2.style ?? {}, callback12 = (input2) => typeof value7[input2] == "number" ? value7[input2] : 0;
              (node2.kind === "grid" ? node2.rows === void 0 && (node2.alignItems === void 0 || node2.alignItems === "start") : node2.kind === "stack" && (node2.dir === "h" ? node2.align === "stretch" || node2.align === "start" : node2.justify === void 0 || node2.justify === "between")) && value5.it.lead !== void 0 && nodeHasVisibleContent(node2) && options !== void 0 && (value4 = {
                top: callback12("paddingTop"),
                x0: callback12("paddingLeft"),
                x1: options - callback12("paddingRight"),
                lead: value5.it.lead
              });
              continue;
            }
            let node = value5.it.node, style = (node.kind === "overlay" ? node.base : node).style;
            if (value5.skew || value5.quarter || (style?.opacity ?? 1) <= 0.25 || !nodeHasVisibleContent(node) || value5.x === void 0 || value5.w === void 0 || value5.h === void 0)
              continue;
            let value6 = value5.y ?? (() => {
              let value7 = resolveHtmlAxisPlacement({
                ...value5.it.y,
                size: value5.h
              }, context);
              if (value7 !== void 0)
                return value7.at + Number(style?.transform?.translateY ?? 0);
            })();
            value6 !== void 0 && items3.push({
              el: value5.it.el,
              x: value5.x,
              y: value6,
              w: value5.w,
              h: value5.h,
              estH: value5.estH,
              before: !flag
            });
          }
          let text = " — a screen reader follows source order: ", callback9 = (input2) => input2.estH ? " (height estimated from the text)" : "";
          if (value4 !== void 0) {
            let value5 = value4, value6 = items3.filter((input2) => input2.before && input2.y >= value5.top + 8 && Math.min(input2.x + input2.w, value5.x1) - Math.max(input2.x, value5.x0) > 8);
            value6.length > 0 && this.lintAt(value6[0].el, callback(value6[0].el) + " reads before " + callback(value5.lead) + " (line " + String(value5.lead.line) + ") but sits below it (y " + String(Math.round(value6[0].y)) + " vs " + String(Math.round(value5.top)) + ")" + (value6.length > 1 ? ", and so do " + String(value6.length - 1) + " more before it" : "") + callback9(value6[0]) + text + "move it after the content it belongs to");
          }
          let callback10 = (input2, options2) => Math.min(input2.x + input2.w, options2.x + options2.w) - Math.max(input2.x, options2.x) > 8, callback11 = (input2, options2) => Math.min(input2.y + input2.h, options2.y + options2.h) - Math.max(input2.y, options2.y) >= 0.5 * Math.min(input2.h, options2.h), text2 = ", unless this is the order it should be heard in";
          for (let count = 2; count < items3.length; count++) {
            let value5 = items3[count], value6 = items3.slice(0, count), value7 = value6[0];
            value6.every((input2) => value5.y + value5.h <= input2.y + 8 && callback10(input2, value5)) ? this.lintAt(value5.el, callback(value5.el) + " reads after " + callback(value7.el) + " (line " + String(value7.el.line) + ") but sits above it (y " + String(Math.round(value5.y)) + " vs " + String(Math.round(value7.y)) + ")" + callback9(value5) + text + "move it before them in the file" + text2) : value6.every((input2) => value5.x + value5.w <= input2.x + 8 && callback11(input2, value5)) && this.lintAt(value5.el, callback(value5.el) + " reads after " + callback(value7.el) + " (line " + String(value7.el.line) + ") but sits left of it (x " + String(Math.round(value5.x)) + " vs " + String(Math.round(value7.x)) + ")" + text + "move it before them in the file" + text2);
          }
        }
        let value3 = value2.flatMap((input2) => {
          let node = input2.it.node;
          if (node.kind !== "shape" || node.shape !== "connector" || input2.x === void 0 || input2.y === void 0 || input2.w === void 0 || input2.h === void 0)
            return [];
          let { start: value4, end: value5 } = (0, runtime2.connectorEndpoints)(input2.w, input2.h, node.from, node.strokeWidth), value6 = (0, runtime2.connectorArrowHeads)(node), items3 = [];
          return value6.start === "none" && items3.push([input2.x + value4[0], input2.y + value4[1]]), value6.end === "none" && items3.push([input2.x + value5[0], input2.y + value5[1]]), items3.length === 0 ? [] : [
            {
              b: input2,
              pts: items3,
              stroke: node.stroke,
              sw: node.strokeWidth ?? runtime2.defaultShapeStrokeWidth
            }
          ];
        });
        for (let index4 = 0; index4 < value3.length; index4++)
          for (let value4 = index4 + 1; value4 < value3.length; value4++) {
            let value5 = value3[index4], value6 = value3[value4];
            if (value5.stroke !== value6.stroke || value5.sw !== value6.sw)
              continue;
            let value7 = Math.max(2 * value5.sw, 3), value8 = value5.pts.flatMap((input2) => value6.pts.map((input3) => ({
              p: input2,
              d: Math.hypot(input2[0] - input3[0], input2[1] - input3[1])
            }))).find(({ d }) => d > 0.5 && d <= value7);
            value8 !== void 0 && this.lintAt(value6.b.it.el, callback(value6.b.it.el) + " and " + callback(value5.b.it.el) + " (line " + String(value5.b.it.el.line) + ") end " + String(Math.round(value8.d * 10) / 10) + "px apart near (" + String(Math.round(value8.p[0])) + ", " + String(Math.round(value8.p[1])) + ") — give both ends the same x y so the round caps fuse into one line");
          }
        let items = [], items2 = [];
        value2.forEach((input2, options2) => {
          let { el: it } = input2.it, value4 = input2.it.node.kind === "overlay" ? input2.it.node.base : input2.it.node;
          if (input2.it.root === !0 || it.tag === "svg" || value4.kind === "html" || value4.kind === "spacer")
            return;
          let value5 = Number(value4.style?.transform?.translateX ?? 0), value6 = Number(value4.style?.transform?.translateY ?? 0), value7 = options === void 0 ? 1 / 0 : input2.x !== void 0 ? options - (input2.x - value5) : input2.it.x.anchor === "center" ? options / 2 - Number(input2.it.x.offset ?? 0) : input2.it.x.anchor === "trailing" ? options - Number(input2.it.x.margin ?? 0) : 1 / 0, value8 = input2.w ?? (value4.kind === "text" ? Math.min(estimateTextUnwrappedWidth(value4), Math.max(estimateLongestWordWidth(value4).px + nodePaddingSize(value4).x, value7)) : void 0), value9 = input2.h ?? (value4.kind === "text" && value8 !== void 0 ? estimateNodeHeight(value4, value8) : void 0);
          if (value8 === void 0 || value9 === void 0)
            return;
          let value10 = input2.x ?? (() => {
            let value33 = resolveHtmlAxisPlacement({
              ...input2.it.x,
              size: value8
            }, options);
            if (value33 !== void 0)
              return value33.at + value5;
          })(), value11 = input2.y ?? (() => {
            let value33 = resolveHtmlAxisPlacement({
              ...input2.it.y,
              size: value9
            }, context);
            if (value33 !== void 0)
              return value33.at + value6;
          })();
          if (value10 === void 0 || value11 === void 0)
            return;
          let value12 = value4.style ?? {}, value13 = value4.kind === "shape" ? {
            rotate: Number(value4.rotate ?? 0)
          } : value12.transform ?? {};
          if ((value13.scale ?? 1) !== 1 || (value13.skewX ?? 0) !== 0 || (value13.skewY ?? 0) !== 0)
            return;
          let value14 = Number(value13.rotate ?? 0), [items3, items4] = [value10, value11];
          if (value4.kind === "shape" && value4.shape === "connector") {
            let value33 = value4, value34 = (0, runtime2.connectorGeometry)(value8, value9, value33);
            items2.push({
              i: options2,
              el: it,
              pts: value34.points.map(([input3, input4]) => [
                items3 + input3,
                items4 + input4
              ]),
              sw: value33.strokeWidth ?? runtime2.defaultShapeStrokeWidth,
              conn: !0,
              heads: (0, runtime2.connectorArrowHeads)(value33),
              color: value4.stroke
            });
            return;
          }
          let value15 = typeof value12.opacity == "number" ? value12.opacity : 1;
          if (value15 <= 0.25)
            return;
          let value16 = value4.kind === "shape", value17 = value16 ? (0, runtime2.shapeOutline)(value12) : void 0, value18 = value16 && value4.shape === "line" ? value17?.color ?? value12.backgroundColor : value12.backgroundColor, value19 = value18 !== void 0 && hexColorAlpha(value18) > 0.1, backgroundGradient = value12.backgroundGradient, value20 = typeof value12.borderWidth == "number" && value12.borderWidth > 0 && value12.borderSides === void 0 || [
            "borderTopWidth",
            "borderRightWidth",
            "borderBottomWidth",
            "borderLeftWidth"
          ].every((input3) => typeof value12[input3] == "number" && value12[input3] > 0), value21 = value16 ? value17 !== void 0 && hexColorAlpha(value17.color) > 0.1 : value20 && hexColorAlpha(value12.borderColor) > 0.1, value22 = value4.kind === "img" || value4.kind === "icon" || value19 || backgroundGradient !== void 0 || value21, value23 = nodeHasVisibleContent(input2.it.node);
          if (!value22 && !(value23 && (value4.kind === "text" || value4.kind === "table")))
            return;
          let value24 = value15 >= 0.8 && (value12.mixBlendMode ?? "normal") === "normal" && (value4.kind === "img" || backgroundGradient !== void 0 && backgroundGradient.stops.every((input3) => hexColorAlpha(input3.color) >= 0.8) || value19 && hexColorAlpha(value18) >= 0.8);
          if (value22 && !nodeHasVisibleContent(value4) && value4.kind !== "icon" && value4.kind !== "img" && Math.min(value8, value9) <= 16 && Math.max(value8, value9) >= 3 * Math.min(value8, value9)) {
            if (Math.min(value8, value9) < 2 || !value24)
              return;
            let value33 = value14 * Math.PI / 180, [value34, value35] = value8 >= value9 ? [
              value8 / 2 * Math.cos(value33),
              value8 / 2 * Math.sin(value33)
            ] : [
              -(value9 / 2) * Math.sin(value33),
              value9 / 2 * Math.cos(value33)
            ], value36 = items3 + value8 / 2, value37 = items4 + value9 / 2;
            items2.push({
              i: options2,
              el: it,
              pts: [
                [value36 - value34, value37 - value35],
                [value36 + value34, value37 + value35]
              ],
              sw: Math.min(value8, value9),
              conn: !1
            });
            return;
          }
          let value25 = value16 && (value4.shape === "diamond" || value4.shape === "ellipse") || (typeof value12.borderRadius == "number" ? value12.borderRadius : 0) >= Math.min(value8, value9) / 2 - 0.5 && Math.abs(value8 - value9) <= 1, value26 = value4.shape === "diamond" ? 0.5 : value25 ? Math.SQRT1_2 : 1, value27 = value4.kind === "text" && !value22 ? estimateTextBounds(value4, value8, value9) : {
            x: value8 * (1 - value26) / 2,
            y: value9 * (1 - value26) / 2,
            w: value8 * value26,
            h: value9 * value26
          }, value28 = rotatedBox(items3 + value27.x, items4 + value27.y, value27.w, value27.h, items3 + value8 / 2, items4 + value9 / 2, value14), value29 = Math.abs(Math.abs(value14 % 180) - 90) < 1, value30 = Math.abs(value14 % 180) < 0.5 ? {
            x: items3,
            y: items4,
            w: value8,
            h: value9
          } : value29 ? {
            x: items3 + value8 / 2 - value9 / 2,
            y: items4 + value9 / 2 - value8 / 2,
            w: value9,
            h: value8
          } : void 0, value31 = value25 ? void 0 : value30, value32 = value16 ? value4.shape === "line" ? 0 : value17?.width ?? 0 : value21 ? typeof value12.borderWidth == "number" ? value12.borderWidth : Math.min(Number(value12.borderTopWidth ?? 0), Number(value12.borderRightWidth ?? 0), Number(value12.borderBottomWidth ?? 0), Number(value12.borderLeftWidth ?? 0)) : 0, items5 = [];
          if (input2.it.node.kind === "overlay" && value22)
            for (let value33 of input2.it.node.layers ?? []) {
              let value34 = value33.node.style ?? {}, value35 = value34.backgroundColor !== void 0 && hexColorAlpha(value34.backgroundColor) > 0.1 || typeof value34.borderWidth == "number" && value34.borderWidth > 0 && value34.borderSides === void 0 && hexColorAlpha(value34.borderColor) > 0.1, value36 = resolveHtmlAxisPlacement(value33.x, value8);
              if (!value35 || !nodeHasVisibleContent(value33.node) || value36?.size === void 0 || value36.size >= 0.9 * value8)
                continue;
              let value37 = resolveHtmlAxisPlacement(value33.y, value9), value38 = value37?.size ?? estimateNodeHeight(value33.node, value36.size);
              if (value37 === void 0 || value38 === void 0)
                continue;
              let value39 = value34.transform ?? {};
              items5.push({
                x: items3 + value36.at + Number(value39.translateX ?? 0),
                y: items4 + value37.at + Number(value39.translateY ?? 0),
                w: value36.size,
                h: value38
              });
            }
          items.push({
            i: options2,
            el: it,
            node: value4,
            rect: value28,
            text: value23,
            painted: value22,
            opaque: value24,
            opacity: value15,
            surface: typeof value18 == "string" ? value18 : void 0,
            border: value32,
            skew: !value29 && Math.abs(value14 % 180) > 0.5,
            aabb: value31,
            bbox: value30,
            kids: items5,
            filled: value19 || backgroundGradient !== void 0 || value4.kind === "img",
            fillAlpha: value4.kind === "img" ? 1 : 1 - (1 - (value19 ? hexColorAlpha(value18) : 0)) * (1 - (backgroundGradient !== void 0 ? Math.min(...backgroundGradient.stops.map((input3) => hexColorAlpha(input3.color))) : 0)),
            blend: (value12.mixBlendMode ?? "normal") !== "normal",
            region: !1
          });
        });
        let callback2 = (input2, options2) => {
          let value4 = items.findLast((input3) => {
            if (input3.i >= options2 || !(input3.opaque || input3.surface !== void 0 && hexColorAlpha(input3.surface) > 0.1))
              return !1;
            let [value5, value6] = pointInRotatedBoxCoordinates(input3.rect, input2);
            return Math.abs(value5) <= input3.rect.hw && Math.abs(value6) <= input3.rect.hh;
          });
          return value4 === void 0 ? value : value4.opaque ? value4.surface : void 0;
        };
        for (let value4 = items.length - 1; value4 >= 0; value4--) {
          let value5 = items[value4];
          !value5.painted && value5.node.kind === "text" && value5.node.fill === void 0 && hasLowOpaqueContrast(value5.node.color, callback2([value5.rect.cx, value5.rect.cy], value5.i), value5.opacity) && items.splice(value4, 1);
        }
        let callback3 = (input2) => items2.some((input3) => input3.conn && [input3.pts[0], input3.pts[input3.pts.length - 1]].some((input4) => input4[0] >= input2.x - 10 && input4[0] <= input2.x + input2.w + 10 && input4[1] >= input2.y - 10 && input4[1] <= input2.y + input2.h + 10));
        for (let value4 of items) {
          if (!value4.painted)
            continue;
          let bbox = value4.bbox, value5 = bbox?.w ?? 2 * value4.rect.hw, value6 = bbox?.h ?? 2 * value4.rect.hh, value7 = value4.node.kind === "text" ? 0.9 : 0.6, value8 = !value4.text && !value4.opaque && value4.border === 0 && value4.node.kind !== "img" && value4.node.kind !== "icon" && value4.node.kind !== "shape" && (value4.opacity <= 0.5 || value4.blend || value4.filled && value4.fillAlpha < 0.55);
          value4.region = value8 || value4.kids.some(callback3) || options !== void 0 && value5 >= Math.min(options, Math.max(value7 * options, 480)) || context !== void 0 && value6 >= Math.min(context, Math.max(value7 * context, 240)) || bbox !== void 0 && items.some((input2) => input2 !== value4 && input2.painted && input2.node.kind !== "icon" && input2.bbox !== void 0 && input2.bbox.x >= bbox.x + 4 && input2.bbox.y >= bbox.y + 4 && input2.bbox.x + input2.bbox.w <= bbox.x + bbox.w - 4 && input2.bbox.y + input2.bbox.h <= bbox.y + bbox.h - 4 && callback3(input2.bbox));
        }
        let callback4 = (input2) => callback(input2.el) + " (line " + String(input2.el.line) + ")" + (input2.node.kind === "text" ? ' "' + (0, runtime2.compactDiagnosticValue)(String(input2.node.text ?? ""), 24) + '"' : ""), callback5 = (input2, options2) => options2 === 1 ? "" : (input2 === 0 ? "first" : input2 === options2 - 1 ? "last" : "middle") + " leg ", callback6 = (input2, options2, context2) => input2 > 1 ? " (and " + String(input2 - 1) + " more " + (input2 > 2 ? context2 : options2) + ")" : "", state = {
          top: (input2) => [
            input2.y + input2.h,
            input2.x,
            input2.x + input2.w
          ],
          bottom: (input2) => [
            input2.y,
            input2.x,
            input2.x + input2.w
          ],
          left: (input2) => [
            input2.x + input2.w,
            input2.y,
            input2.y + input2.h
          ],
          right: (input2) => [
            input2.x,
            input2.y,
            input2.y + input2.h
          ]
        }, callback7 = (input2) => input2.node.kind === "icon" || input2.node.kind === "text" && input2.text && (!input2.painted || input2.rect.hw <= 130 && input2.rect.hh <= 30), entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map(), entries3 = /* @__PURE__ */ new Map(), entries4 = /* @__PURE__ */ new Map(), callback8 = (input2, options2, context2) => {
          let entry = input2.get(options2);
          entry === void 0 ? input2.set(options2, {
            best: context2,
            n: 1,
            head: context2.head === !0
          }) : (entry.n++, entry.head ||= context2.head === !0, context2.run > entry.best.run && (entry.best = context2));
        };
        for (let value4 of items2) {
          let value5 = value4.heads ?? {
            start: "none",
            end: "none"
          }, value6 = value5.start !== "none" || value5.end !== "none", value7 = value4.pts.slice(1).map((input2, options2) => ({
            p: value4.pts[options2],
            q: input2,
            len: Math.hypot(input2[0] - value4.pts[options2][0], input2[1] - value4.pts[options2][1])
          })), value8 = value7.reduce((input2, options2) => input2 + options2.len, 0);
          if (value8 < 1)
            continue;
          let value9 = value4.conn ? Math.min(Math.max(8, 3 * value4.sw), value8 / 4) : 0, items3 = [];
          for (let value10 of items) {
            if (value10.i <= value4.i || !value10.opaque)
              continue;
            let index4 = 0;
            for (let value11 of value7) {
              let value12 = value11.len > 0 ? segmentIntersectsRotatedBox(value10.rect, 0, value11.p, value11.q) : void 0;
              value12 !== void 0 && items3.push([
                index4 + value12[0] * value11.len,
                index4 + value12[1] * value11.len
              ]), index4 += value11.len;
            }
          }
          let callback9 = (input2, options2) => {
            let value10 = items3.filter(([input3, input4]) => input4 > input2 && input3 < options2).sort((input3, options3) => input3[0] - options3[0]), index4 = 0, value11 = input2;
            for (let [value12, value13] of value10)
              index4 = Math.max(index4, value12 - value11), value11 = Math.max(value11, value13);
            return Math.max(index4, options2 - value11);
          };
          for (let value10 of items) {
            if (value10.i === value4.i || value10.region)
              continue;
            let value11 = !value4.conn || !value6 && value7.length === 1;
            if (!value4.conn && !callback7(value10))
              continue;
            if (!value4.conn && value10.i > value4.i) {
              let [items4, items5] = [value4.pts[0], value4.pts[1]], value20 = -(items5[1] - items4[1]) / value8, value21 = (items5[0] - items4[0]) / value8, value22 = Math.abs(value20 * (value10.rect.cx - items4[0]) + value21 * (value10.rect.cy - items4[1])), value23 = value10.rect.rot * Math.PI / 180, value24 = Math.abs(value20 * Math.cos(value23) + value21 * Math.sin(value23)) * value10.rect.hw + Math.abs(-value20 * Math.sin(value23) + value21 * Math.cos(value23)) * value10.rect.hh;
              if (value22 + 0.5 * value24 <= value4.sw / 2)
                continue;
            }
            if (value4.conn && !(value10.opaque && value10.i < value4.i) && hasLowOpaqueContrast(value4.color, callback2([value10.rect.cx, value10.rect.cy], Math.min(value10.i, value4.i)), 1, 1.25))
              continue;
            let value12 = [
              value4.pts[0],
              value4.pts[value4.pts.length - 1]
            ].map((input2) => {
              let [value20, value21] = pointInRotatedBoxCoordinates(value10.rect, input2);
              return Math.abs(value20) <= value10.rect.hw + value4.sw / 2 + 2 && Math.abs(value21) <= value10.rect.hh + value4.sw / 2 + 2;
            }), value13 = value10.painted && value12[0] === !0 && value12[1] === !0, value14 = value12[0] === !0 || value12[1] === !0, value15 = !value10.text && (value10.node.kind === "shape" || value10.node.kind === "img" || value10.node.kind === "icon" || value10.painted && Math.max(value10.rect.hw, value10.rect.hh) <= 32);
            if (value15 && !value10.opaque && (value10.surface === void 0 || hexColorAlpha(value10.surface) <= 0.1) && Math.max(value10.rect.hw, value10.rect.hh) <= 32 && value7.some((input2) => {
              if (input2.len <= 0)
                return !1;
              let value20 = Math.max(0, Math.min(1, ((value10.rect.cx - input2.p[0]) * (input2.q[0] - input2.p[0]) + (value10.rect.cy - input2.p[1]) * (input2.q[1] - input2.p[1])) / (input2.len * input2.len)));
              return Math.hypot(value10.rect.cx - (input2.p[0] + value20 * (input2.q[0] - input2.p[0])), value10.rect.cy - (input2.p[1] + value20 * (input2.q[1] - input2.p[1]))) <= value4.sw / 2 + 2;
            }))
              continue;
            let value16 = value10.painted ? -Math.min(value4.sw / 2 + 1, Math.min(value10.rect.hw, value10.rect.hh) - 1) : value4.sw / 2, index4 = 0, state2 = {
              run: 0,
              leg: -1,
              touchRun: 0
            };
            if (!(value15 && value14) && !value13 && !(value11 && value4.conn && !callback7(value10)))
              for (let index22 = 0; index22 < value7.length; index22++) {
                let value20 = value7[index22], value21 = value20.len > 0 ? segmentIntersectsRotatedBox(value10.rect, value16, value20.p, value20.q) : void 0;
                if (value21 !== void 0) {
                  let value22 = Math.max(index4 + value21[0] * value20.len, value9), value23 = Math.min(index4 + value21[1] * value20.len, value8 - value9), value24 = value23 > value22 ? callback9(value22, value23) : 0, value25 = value24 > 0 ? value22 <= value9 ? "start" : value23 >= value8 - value9 ? "end" : void 0 : void 0;
                  value24 > state2.run && (state2 = {
                    ...state2,
                    run: value24,
                    leg: index22
                  }), value25 !== void 0 && value24 > state2.touchRun && (state2 = {
                    ...state2,
                    touches: value25,
                    touchRun: value24
                  });
                }
                index4 += value20.len;
              }
            let value17, value18 = callback7(value10) || value15 && Math.max(value10.rect.hw, value10.rect.hh) <= 32;
            if (value4.conn && value10.painted && !value18 && value10.aabb !== void 0 && (value14 ? value6 || value7.length > 1 : value6 && value10.border > 0 && value10.i < value4.i)) {
              let aabb = value10.aabb, value20 = value4.sw / 2 + value10.border / 2 + 3, index22 = 0;
              value7.forEach((input2, options2) => {
                let value21 = Math.max(index22, value9) - index22, value22 = Math.min(index22 + input2.len, value8 - value9) - index22;
                if (index22 += input2.len, value22 - value21 < 24)
                  return;
                let value23 = Math.abs(input2.q[1] - input2.p[1]) < 0.5, value24 = Math.abs(input2.q[0] - input2.p[0]) < 0.5;
                if (!value23 && !value24)
                  return;
                let value25 = value23 ? 0 : 1, value26 = value23 ? input2.p[1] : input2.p[0], value27 = Math.sign(input2.q[value25] - input2.p[value25]), value28 = input2.p[value25] + value27 * value21, value29 = input2.p[value25] + value27 * value22, [value30, value31] = value28 < value29 ? [value28, value29] : [value29, value28], value32 = value23 ? [
                  ["top", aabb.y, aabb.x, aabb.x + aabb.w],
                  ["bottom", aabb.y + aabb.h, aabb.x, aabb.x + aabb.w]
                ] : [
                  ["left", aabb.x, aabb.y, aabb.y + aabb.h],
                  ["right", aabb.x + aabb.w, aabb.y, aabb.y + aabb.h]
                ];
                for (let [value33, value34, value35, value36] of value32) {
                  if (Math.abs(value26 - value34) > value20)
                    continue;
                  let value37 = Math.max(value30, value35), value38 = Math.min(value31, value36);
                  if (value38 - value37 < 24 || value17 !== void 0 && value38 - value37 <= value17.run)
                    continue;
                  let value39 = value33 === "top" || value33 === "left" ? value26 - value34 : value34 - value26;
                  if (value10.i > value4.i && value10.opaque && value39 >= value4.sw / 2)
                    continue;
                  let index32 = 0;
                  for (let value41 of items) {
                    if (value41 === value10 || !value41.painted || value41.aabb === void 0)
                      continue;
                    let [value42, value43, value44] = state[value33](value41.aabb);
                    Math.abs(value42 - value34) <= value20 && (index32 += Math.max(0, Math.min(value38, value44) - Math.max(value37, value43)));
                  }
                  if (index32 >= Math.max(12, (value38 - value37) / 2))
                    continue;
                  let callback10 = (input3) => input3[value25] >= value37 - value9 - 2 && input3[value25] <= value38 + value9 + 2, value40 = options2 === value7.length - 1 && value5.end !== "none" && callback10(input2.q) || options2 === 0 && value5.start !== "none" && callback10(input2.p);
                  value17 = {
                    run: value38 - value37,
                    leg: options2,
                    side: value33,
                    head: value40,
                    clear: Math.ceil(value20 - value4.sw / 2 + 1)
                  };
                }
              });
            }
            let value19 = value10.node.kind === "text" && !value10.painted ? Math.max(8, 1.8 * Math.min(value10.rect.hw, value10.rect.hh)) : 8;
            if (value17 !== void 0)
              callback8(entries, value4.i, {
                ...value17,
                legs: value7.length,
                o: value10,
                ln: value4,
                touches: value14 ? "end" : void 0
              });
            else if (state2.run >= value19) {
              let state3 = {
                ...state2,
                legs: value7.length,
                o: value10,
                ln: value4,
                under: value10.i < value4.i && (value10.opaque || !value4.conn)
              };
              if (value18)
                callback8(entries4, value10.i, state3);
              else if (value14) {
                state3.touches = state2.touches ?? (value12[1] === !0 ? "end" : "start");
                let value20 = state3.touches === "start" ? value4.pts[0] : value4.pts[value4.pts.length - 1];
                items.some((input2) => {
                  if (input2 === value10 || input2.i === value4.i || input2.region || !input2.painted && input2.rect.hw >= 0.8 * value10.rect.hw)
                    return !1;
                  let [value21, value22] = pointInRotatedBoxCoordinates(input2.rect, value20);
                  if (Math.abs(value21) > input2.rect.hw + value9 + 2 || Math.abs(value22) > input2.rect.hh + value9 + 2)
                    return !1;
                  let [value23, value24] = pointInRotatedBoxCoordinates(value10.rect, [
                    input2.rect.cx,
                    input2.rect.cy
                  ]), value25 = (input2.rect.rot - value10.rect.rot) * Math.PI / 180, value26 = Math.abs(Math.cos(value25)) * input2.rect.hw + Math.abs(Math.sin(value25)) * input2.rect.hh, value27 = Math.abs(Math.sin(value25)) * input2.rect.hw + Math.abs(Math.cos(value25)) * input2.rect.hh;
                  return Math.abs(value23) + value26 <= value10.rect.hw + 2 && Math.abs(value24) + value27 <= value10.rect.hh + 2;
                }) || callback8(entries3, value4.i, state3);
              } else
                callback8(entries2, value4.i, {
                  ...state3,
                  touches: void 0
                });
            }
          }
        }
        for (let { best: value4, n: value5, head: value6 } of entries.values())
          this.lintAt(value4.ln.el, callback(value4.ln.el) + " " + callback5(value4.leg, value4.legs) + "runs along the " + String(value4.side) + " edge of " + callback4(value4.o) + " for " + String(Math.round(value4.run)) + "px" + callback6(value5, "edge", "edges") + " — the line disappears into the " + (value4.o.border > 0 ? "border" : "edge") + (value6 ? " and the head lies sideways" : "") + (value4.touches !== void 0 ? "; leave that box from another edge (vh/hv), or run the leg through the gap between the boxes" : "; move the leg into the gap, at least " + String(Math.max(8, value4.clear ?? 8)) + "px clear of the edge"));
        for (let { best: value4, n: value5 } of entries2.values())
          this.lintAt(value4.ln.el, callback(value4.ln.el) + " " + callback5(value4.leg, value4.legs) + "runs through " + callback4(value4.o) + " for " + String(Math.round(value4.run)) + "px" + callback6(value5, "box", "boxes") + ' — route it around: through the gap between the boxes (vh/hv from another edge, or straight head="none" segments), never across a box');
        for (let { best: value4, n: value5 } of entries3.values())
          this.lintAt(value4.ln.el, callback(value4.ln.el) + " runs " + String(Math.round(value4.run)) + "px inside " + callback4(value4.o) + (value4.touches === "start" ? " from its start" : " before its end") + callback6(value5, "box", "boxes") + " — put " + (value4.touches === "start" ? "x1 y1" : "x2 y2") + " on the edge of that box nearest the other end, so the line stops at the box");
        for (let { best: value4, n: value5 } of entries4.values()) {
          let value6 = value4.ln.conn ? callback(value4.ln.el) + " (line " + String(value4.ln.el.line) + ")" + (value4.legs > 1 ? ", " + callback5(value4.leg, value4.legs).trim() : "") : "the " + String(Math.round(value4.ln.sw)) + "px rule " + callback(value4.ln.el) + " (line " + String(value4.ln.el.line) + ")", value7 = value4.under === !0 ? " — it is listed before the line, so the line is drawn over it; put it after the line in the source, or move it clear" : value4.o.node.kind === "icon" ? " — move it clear of the line, or give it a background and list it after the line" : (Math.abs(value4.o.rect.rot % 180) > 0.5 ? " (a rotated label turns about its box centre, not its first letter)" : value4.o.painted ? "" : " (text extent estimated)") + " — move " + (value4.o.text ? "the label" : "it") + " 8px clear of the line, or route the line past it";
          this.lintAt(value4.o.el, callback4(value4.o) + " is crossed by " + value6 + callback6(value5, "line", "lines") + value7);
        }
        for (let index4 = 0; index4 < items.length; index4++)
          for (let value4 = index4 + 1; value4 < items.length; value4++) {
            let value5 = items[index4], value6 = items[value4];
            if (!value5.text || !value6.text || !value5.skew && !value6.skew && value2[value5.i].w !== void 0 && value2[value6.i].w !== void 0)
              continue;
            let value7 = rotatedBoxesOverlap(value5.rect, value6.rect);
            value7 > 4 && this.lintAt(value6.el, callback(value6.el) + " overlaps " + callback(value5.el) + " (line " + String(value5.el.line) + ") by ~" + String(Math.round(value7)) + "px (" + (value5.skew || value6.skew ? "rotated footprints, " : "") + "estimated from the text) — both hold text; move one or trim its width to the text");
          }
      }
      lintWords(source, options, context, value) {
        let entry = this.nodeEl.get(source), value2 = entry ?? context, value3 = entry !== void 0 && (entry.line !== context.line || entry.col !== context.col), value4 = value3 ? "<" + entry.tag + "> in " + value : value;
        if (source.kind === "text") {
          if (options === void 0 || source.place?.minWFit !== void 0)
            return;
          let x = nodePaddingSize(source).x, value5 = Math.max(1, options - x);
          if (source.wrap === "nowrap") {
            let value8 = estimateTextUnwrappedWidth(source) - x;
            value8 > value5 + 2 && this.lintAt(value2, value4 + " is " + String(Math.round(value5)) + "px wide" + (x > 0 ? " inside its padding" : "") + " but its one-line text needs ~" + String(Math.round(value8)) + "px — white-space: nowrap does not widen the box, the text will run past it; widen the box or shorten the text");
            return;
          }
          let { px: value6, word: value7 } = estimateLongestWordWidth(source);
          value7.length >= 3 && value6 > value5 + 2 && this.lintAt(value2, value4 + " is " + String(Math.round(value5)) + "px wide" + (x > 0 ? " inside its padding" : "") + ' but "' + (0, runtime2.compactDiagnosticValue)(value7) + '" needs ~' + String(Math.round(value6)) + "px — it will break mid-word; widen the box" + (value3 ? " or use min-width: min-content on it (with white-space: nowrap for a one-line label)" : " or shorten the word"));
          return;
        }
        if (source.kind === "shape" && String(source.shape).startsWith("arrow-") && typeof source.w == "number" && typeof source.h == "number" && source.w > 0 && source.h > 0) {
          let value5 = String(source.shape).endsWith("left") || String(source.shape).endsWith("right") ? source.w / source.h : source.h / source.w;
          value5 > 3 && this.lintAt(value2, value4 + ' kind="' + String(source.shape) + '" is stretched ' + String(Math.round(value5 * 10) / 10) + ":1 — block arrows distort past ~2:1; for a line with an arrowhead use <x-connector>");
          return;
        }
        if (source.kind === "stack" || source.kind === "overlay" || source.kind === "grid") {
          if (source.kind === "overlay") {
            this.lintWords(source.base, options, context, value);
            return;
          }
          let value5 = nodePaddingSize(source), value6 = options === void 0 ? void 0 : Math.max(1, options - value5.x), value7 = source.children ?? [], value8 = typeof source.gap == "number" ? source.gap : 0;
          if (source.kind === "grid") {
            let value10 = source.columns ?? [], value11 = value7.some((input) => {
              let place = input.place;
              return (place?.colSpan ?? 1) !== 1 || (place?.rowSpan ?? 1) !== 1;
            }), value12;
            if (value6 !== void 0 && !value11 && value10.length > 0 && value10.every((input) => typeof input == "object")) {
              let value13 = value10.reduce((input, options2) => input + (typeof options2 == "object" && typeof options2.px == "number" ? options2.px : 0), 0), value14 = value10.reduce((input, options2) => input + (typeof options2 == "object" && typeof options2.fr == "number" ? options2.fr : 0), 0), value15 = Math.max(0, value6 - value8 * (value10.length - 1) - value13);
              value12 = value10.map((input) => typeof input == "object" && typeof input.px == "number" ? input.px : value14 > 0 ? value15 * (typeof input == "object" && typeof input.fr == "number" ? input.fr : 0) / value14 : 0);
            }
            value7.forEach((input, options2) => this.lintWords(input, explicitNodeWidth(input) ?? (value12 !== void 0 ? Math.max(1, value12[options2 % value12.length]) : void 0), context, value));
            return;
          }
          let callback = (input) => Number(input.place?.grow ?? 0), callback2 = (input) => input.place?.basis, value9;
          if (source.dir === "h" && value6 !== void 0 && source.wrap !== !0) {
            let index4 = 0, index22 = 0;
            for (let value10 of value7) {
              let value11 = explicitNodeWidth(value10);
              value11 !== void 0 ? index4 += value11 : index22 += Math.max(1, callback(value10));
            }
            index22 > 0 && (value9 = Math.max(1, (value6 - value8 * Math.max(0, value7.length - 1) - index4) / index22));
          }
          for (let value10 of value7) {
            let value11 = explicitNodeWidth(value10), value12 = value9 !== void 0 && callback(value10) > 0 && callback2(value10) === 0 ? value9 * callback(value10) : void 0, value13 = value11 !== void 0 ? Math.min(value11, value6 ?? value11) : source.dir === "h" ? value12 : value6;
            this.lintWords(value10, value13, context, value);
          }
        }
      }
      files = [];
      faces = [];
      faceNames = /* @__PURE__ */ new Map();
      slideNodes = 0;
      fileSeen = /* @__PURE__ */ new Set();
      constructor(input, options, context) {
        this.fileMap = input, this.collectFiles = options, this.lists = context;
      }
      listEm(input, options) {
        if (this.lists === "css" && (input.tag === "ul" || input.tag === "ol"))
          return options.inh.fontSize ?? importedHtmlTypeScale.p.size;
      }
      noteMap = /* @__PURE__ */ new Map();
      lifted = [];
      warnAt(input, options) {
        for (let [value, value2] of compileWarningCodes) {
          if (!value.test(options))
            continue;
          let entry = this.noteMap.get(value2);
          entry !== void 0 ? entry.count++ : this.noteMap.set(value2, {
            key: value2,
            count: 1,
            line: input.line,
            col: input.col,
            message: options
          });
          return;
        }
        this.warnings.length < 2e3 && this.warnings.push({
          line: input.line,
          col: input.col,
          message: options
        });
      }
      notes() {
        return [...this.noteMap.values()];
      }
      loneShareAfterDrops(items, options, items2, value, extra) {
        if (extra || items.length < 2)
          return;
        let callback = (input) => input.place?.grow, value2 = items2.filter((input) => typeof callback(input) == "number" && callback(input) > 0);
        if (value2.length !== 1)
          return;
        let value3 = items2.indexOf(value2[0]), value4 = options[value3], value5 = value === "h" ? "width" : "height", value6 = parseInlineStyle(value4.attrs.style, () => {
        }, () => {
        })[value5];
        if (value6 === void 0 || value6 === "auto" || !("pct" in value6) || value6.pct >= 100 || callback(value2[0]) !== value6.pct)
          return;
        let entry = this.noteMap.get("percent-width");
        entry !== void 0 && --entry.count === 0 && this.noteMap.delete("percent-width"), items2.length === 1 ? this.warnAt(value4, value5 + ":" + String(value6.pct) + "% is dropped and the child stretches to the FULL " + value5 + " of its parent (100%, not " + String(value6.pct) + "% — its siblings were dropped, so its share is the whole axis); give it px") : this.warnAt(value4, value5 + ":" + String(value6.pct) + "% is dropped and the child takes ALL the free " + value5 + " next to its siblings (not " + String(value6.pct) + "% of the parent — it is the only child that grows); give it px");
      }
      bareTableShare(elements, nodes, dir, wrapped) {
        if (dir !== "h" || wrapped)
          return;
        let placeOf = (node) => node.place ?? {}, isBareTable = (node) => node.kind === "table" && ["grow", "shrink", "basis", "minW", "maxW", "minWFit"].every((key) => placeOf(node)[key] === void 0), tables = nodes.filter(isBareTable), shares = [];
        if (nodes.some(isInvisibleNode))
          return;
        for (let node of nodes) {
          if (tables.includes(node))
            continue;
          let place = placeOf(node);
          if (typeof place.grow == "number" && place.grow > 0 && place.basis === 0)
            shares.push(place.grow);
          else if (!("w" in node && typeof node.w == "number" || typeof place.minW == "number" && place.minW === place.maxW))
            return;
        }
        if (tables.length === 0 || shares.length === 0)
          return;
        let share = Math.max(0.01, Math.round(shares.reduce((sum, grow) => sum + grow, 0) / shares.length * 100) / 100);
        for (let table of tables)
          table.place = {
            ...placeOf(table),
            grow: share,
            basis: 0
          }, this.warnAt(elements[nodes.indexOf(table)], "<table> with no width, in a row beside boxes that share it (flex:N, or a % width), is given flex:" + String(share) + ", a share like theirs — as wide as its container, as a table normally is, it would leave them no room; write a width or flex on the table to size it yourself");
      }
      errorAt(input, options) {
        this.errors.length < 500 && this.errors.push({
          line: input.line,
          col: input.col,
          message: options
        });
      }
      warner(input, options) {
        return (input2) => this.warnAt(input, options + input2);
      }
      unsupported = [];
      cellRemovals = 0;
      slideLabel = "";
      rejectAt(input, options) {
        this.unsupported.length < 2e3 && this.unsupported.push({
          line: input.line,
          col: input.col,
          message: this.slideLabel + options
        });
      }
      rejecter(input, options) {
        return (input2) => this.rejectAt(input, options + input2);
      }
      countNode(input) {
        return this.slideNodes++, this.slideNodes === runtime2.maxSlideFrames + 1 && this.errorAt(input, "more than " + String(runtime2.maxSlideFrames) + " elements on one slide"), this.slideNodes <= runtime2.maxSlideFrames;
      }
      resetSlide() {
        this.slideNodes = 0, this.slideCells = 0;
      }
      slideCells = 0;
      deckCells = 0;
      countCells(input, options) {
        this.slideCells += options, this.deckCells += options, this.slideCells > runtime2.maxSlideTableCells && this.slideCells - options <= runtime2.maxSlideTableCells && this.errorAt(input, "tables on this slide hold more than " + String(runtime2.maxSlideTableCells) + " cells — split the table across slides"), this.deckCells > runtime2.maxDeckTableCells && this.deckCells - options <= runtime2.maxDeckTableCells && this.errorAt(input, "tables in this deck hold more than " + String(runtime2.maxDeckTableCells) + " cells in total");
      }
      textCaps(input, items, items2) {
        items.length > runtime2.maxNodeTextLength && this.errorAt(input, "text is " + String(items.length) + " characters — one element holds at most " + String(runtime2.maxNodeTextLength) + "; split it"), items2.length > runtime2.maxTextMarks && this.errorAt(input, String(items2.length) + " inline marks (b/i/u/a/span) in one element — at most " + String(runtime2.maxTextMarks) + "; split it");
      }
      collectsFiles() {
        return this.collectFiles;
      }
      fileRef(input, options, context) {
        let value = this.fileMap?.get(input);
        if (value !== void 0)
          return value;
        this.fileSeen.has(input) || (this.fileSeen.add(input), this.files.push({
          ref: input,
          kind: options,
          line: context.line,
          col: context.col
        }));
      }
      declareFace(input, options) {
        let value = input.family.toLowerCase();
        if (this.faceNames.has(value)) {
          this.warnAt(options, 'font "' + input.family + '" is declared twice — the first declaration is used');
          return;
        }
        if (this.faces.length >= runtime2.maxDeckFontFaces) {
          this.warnAt(options, "more than " + String(runtime2.maxDeckFontFaces) + ' font families declared — "' + input.family + '" is dropped');
          return;
        }
        this.faceNames.set(value, input.family), this.faces.push(input);
      }
      sawFontFamily = !1;
      resolveFamily(input, options) {
        this.sawFontFamily = !0;
        let value, text = "sans-serif", value2;
        for (let value8 of input.slice(1)) {
          let value9 = ownRecordValue(genericFontFallbackKinds, value8.toLowerCase());
          value9 === void 0 ? value2 ??= resolveBasicFontFamily(value8) : value === void 0 && (value = value9, text = value8.toLowerCase(), value2 ??= ownRecordValue(specialGenericFontFaces, text));
        }
        let value3 = input[0] ?? "", value4 = value3.toLowerCase(), value5 = ownRecordValue(genericFontFallbackKinds, value4);
        if (value5 !== void 0)
          return value5;
        let value6 = ownRecordValue(webSafeFontAliases, value4), value7 = value6?.basic === !0 || value2 === void 0 ? {} : {
          webSafe: value2
        }, entry = this.faceNames.get(value4);
        if ((entry !== void 0 || value6 !== void 0) && value2 === void 0 && value6?.basic !== !0 && value6?.fallback !== "helvetica") {
          let value8 = webSafeFallbackFaces[entry !== void 0 ? value ?? "sans" : value6.fallback];
          this.warnAt(options, 'font-family: "' + value3 + '" names no basic face (fonts.md), so a PowerPoint export with basic fonts falls back to ' + value8 + " — to choose, name one before the generic: font-family:'" + value3 + "', " + value8 + ", " + text);
        }
        return entry !== void 0 ? {
          family: entry,
          fallback: value ?? "sans",
          ...value7
        } : value6 !== void 0 ? {
          family: value6.family,
          fallback: value6.fallback,
          ...value7
        } : runtime2.customFontFamilyPattern.test(value3) ? (this.warnAt(options, 'font-family: "' + value3 + '" is not declared in <head> (a Google Fonts <link> or an @font-face) and is not a web-safe face — using ' + (value ?? "sans-serif") + "; declare it or pick a web-safe/generic family"), value ?? "sans") : (this.warnAt(options, 'font-family: "' + (0, runtime2.compactDiagnosticValue)(value3) + '" is not a usable family name — using ' + (value ?? "sans-serif")), value ?? "sans");
      }
      typography(input, options, context, value) {
        let state = {}, value2 = htmlHeadingNames.has(context), value3 = importedHtmlTypeScale[value2 ? context : "p"];
        if (input["font-family"] !== void 0) {
          let value7 = this.resolveFamily(input["font-family"], value);
          value7 !== void 0 && (state.fontFamily = value7);
        }
        input["font-size"] !== void 0 && (state.fontSize = input["font-size"]), input["font-weight"] !== void 0 && (state.fontWeight = input["font-weight"]), input["font-style"] !== void 0 && (state.fontStyle = input["font-style"]), input.color !== void 0 && (state.color = input.color), input["text-align"] !== void 0 && (state.textAlign = input["text-align"]), input["text-transform"] !== void 0 && (state.textTransform = input["text-transform"]), input["white-space"] !== void 0 && (state.noWrap = input["white-space"] === "nowrap");
        let value4 = state.fontSize ?? (value2 ? value3.size : options.fontSize ?? value3.size), callback = (input2, options2, context2, value7) => {
          let { lo: value8, hi: value9 } = slideStylePropertySchema(context2);
          if (options2 >= value8 && options2 <= value9)
            return options2;
          this.rejectAt(value, "<" + context + "> " + input2 + ": " + value7 + " is " + String(options2) + (input2 === "line-height" ? "× the " : "px at the ") + String(value4) + "px font size — outside " + String(value8) + "–" + String(value9));
        }, value5 = input["line-height"];
        if (value5 !== void 0)
          if (typeof value5 == "number")
            state.lineHeight = value5;
          else {
            let value7 = callback("line-height", Math.round(value5.px / value4 * 100) / 100, "lineHeight", String(value5.px) + "px");
            value7 !== void 0 && (state.lineHeight = value7, this.warnAt(value, "line-height: " + String(value5.px) + "px converted to " + String(value7) + " (unitless, relative to the " + String(value4) + "px font size)"));
          }
        let value6 = input["letter-spacing"];
        if (value6 !== void 0) {
          let value7 = typeof value6 == "number" ? value6 : callback("letter-spacing", Math.round(value6.em * value4 * 10) / 10, "letterSpacing", String(value6.em) + "em");
          value7 !== void 0 && (state.letterSpacing = value7);
        }
        let state2 = {
          fontFamily: state.fontFamily ?? options.fontFamily,
          fontSize: state.fontSize ?? (value2 ? void 0 : options.fontSize),
          fontWeight: state.fontWeight ?? (value2 ? void 0 : options.fontWeight),
          fontStyle: state.fontStyle ?? options.fontStyle,
          lineHeight: state.lineHeight ?? options.lineHeight,
          letterSpacing: state.letterSpacing ?? options.letterSpacing,
          color: state.color ?? options.color,
          textAlign: state.textAlign ?? options.textAlign,
          textTransform: state.textTransform ?? options.textTransform,
          noWrap: state.noWrap ?? options.noWrap
        };
        return {
          own: state,
          eff: state2
        };
      }
      inherit(input, options, context) {
        let { own: value } = this.typography(input, options, "div", context);
        return {
          ...options,
          ...value
        };
      }
      paintBag(input, options, context, value) {
        let state = {}, callback = (input2) => this.rejectAt(context, input2 + " does not apply to <" + {
          text: "p/h1/h2/h3/ul/ol",
          img: "img",
          icon: "x-icon",
          stack: "div",
          table: "table",
          shape: "x-shape"
        }[options] + ">"), callback2 = (input2) => (value.add(input2), input[input2]), value2 = callback2("background-color");
        value2 !== void 0 && (state.backgroundColor = value2);
        let value3 = callback2("background-gradient");
        value3 !== void 0 && (options === "icon" || options === "shape" ? callback("background gradient") : state.backgroundGradient = value3);
        let items = [
          callback2("padding-top"),
          callback2("padding-right"),
          callback2("padding-bottom"),
          callback2("padding-left")
        ];
        items.some((input2) => input2 !== void 0) && (options === "stack" || options === "text" || options === "table" ? (items[0] !== void 0 && (state.paddingTop = items[0]), items[1] !== void 0 && (state.paddingRight = items[1]), items[2] !== void 0 && (state.paddingBottom = items[2]), items[3] !== void 0 && (state.paddingLeft = items[3])) : callback("padding"));
        let value4 = callback2("border");
        if (value4 !== void 0 && value4.style !== "none")
          if (value4.style === void 0)
            this.rejectAt(context, diagnosticHtmlTagLabel(context) + "border-width/border-color without a border-style draw nothing — write border: " + String(value4.width ?? 1) + "px solid " + (value4.color ?? "COLOR"));
          else if (Math.max(value4.width ?? 1, ...Object.values(value4.widths ?? {})) > (options === "shape" ? runtime2.maxShapeStrokeWidth : slideStylePropertySchema("borderWidth").hi))
            this.rejectAt(context, diagnosticHtmlTagLabel(context) + "border: " + String(Math.max(value4.width ?? 1, ...Object.values(value4.widths ?? {}))) + "px — a border is 0–" + String(slideStylePropertySchema("borderWidth").hi) + "px (only x-shape / x-connector strokes go to " + String(runtime2.maxShapeStrokeWidth) + ")");
          else if (value4.widths !== void 0 && new Set(cssBoxSideNames.map((input2) => value4.widths[input2] ?? 0).filter((input2) => input2 > 0)).size > 1) {
            state.borderStyle = value4.style ?? "solid", state.borderColor = value4.color ?? "#000000";
            for (let value14 of cssBoxSideNames) {
              let value15 = value4.widths[value14];
              value15 !== void 0 && value15 > 0 && (state[cssBorderSideWidthFields[value14]] = value15);
            }
          } else {
            if (value4.widths !== void 0) {
              let value14 = cssBoxSideNames.filter((input2) => (value4.widths[input2] ?? 0) > 0);
              value4.width = value14.length > 0 ? value4.widths[value14[0]] : 0, value4.sides = value14, value14.length === 0 && (value4.style = "none");
            }
            value4.style === "none" || (state.borderWidth = value4.width ?? 1, state.borderStyle = value4.style ?? "solid", state.borderColor = value4.color ?? "#000000", value4.sides !== void 0 && value4.sides.length < 4 && (state.borderSides = value4.sides.join(" ")));
          }
        let value5 = callback2("border-radius");
        if (value5 !== void 0) {
          let callback3 = (input2) => "px" in input2 ? input2.px : input2.pct >= 50 ? 256 : Math.round(input2.pct / 100 * 256);
          if (options === "icon")
            callback("border-radius");
          else {
            let value14 = "corners" in value5 ? value5.corners.map(callback3) : null;
            value14 !== null && value14.some((input2) => input2 !== value14[0]) ? [
              state.borderTopLeftRadius,
              state.borderTopRightRadius,
              state.borderBottomRightRadius,
              state.borderBottomLeftRadius
            ] = value14 : state.borderRadius = value14 !== null ? value14[0] : callback3(value5);
          }
        }
        let value6 = callback2("opacity");
        value6 !== void 0 && (state.opacity = value6);
        let value7 = callback2("box-shadow");
        value7 !== void 0 && (state.boxShadow = value7);
        let value8 = callback2("text-shadow");
        value8 !== void 0 && (options === "text" || options === "table" ? state.textShadow = value8 : callback("text-shadow"));
        let value9 = callback2("transform");
        value9 !== void 0 && Object.keys(value9.value).length > 0 && (state.transform = value9.value);
        let value10 = callback2("filter");
        value10 !== void 0 && Object.keys(value10).length > 0 && (state.filter = value10);
        let value11 = callback2("backdrop-filter");
        value11 !== void 0 && Object.keys(value11).length > 0 && (state.backdropFilter = value11);
        let value12 = callback2("mix-blend-mode");
        value12 !== void 0 && (state.mixBlendMode = value12);
        let value13 = callback2("overflow");
        return value13 !== void 0 && (options === "stack" ? state.overflow = value13 : callback("overflow")), state;
      }
      textBag(input, options, context, value) {
        let value2 = this.paintBag(input, "text", context, value);
        for (let value3 of [
          "font-family",
          "font-size",
          "font-weight",
          "font-style",
          "line-height",
          "letter-spacing",
          "text-align",
          "text-transform",
          "white-space",
          "color",
          "text-decoration-line",
          "text-decoration-style",
          "text-decoration-color",
          "font-variant-numeric",
          "text-stroke-width",
          "text-stroke-color"
        ])
          value.add(value3);
        return this.typeKeys(value2, input, options, context), value2;
      }
      typeKeys(input, options, context, value) {
        context.fontFamily !== void 0 && (input.fontFamily = context.fontFamily), context.fontSize !== void 0 && (input.fontSize = context.fontSize), context.fontWeight !== void 0 && (input.fontWeight = context.fontWeight), context.fontStyle !== void 0 && (input.fontStyle = context.fontStyle), context.lineHeight !== void 0 && (input.lineHeight = context.lineHeight), context.letterSpacing !== void 0 && (input.letterSpacing = context.letterSpacing), context.textTransform !== void 0 && (input.textTransform = context.textTransform);
        let value2 = options["text-decoration-line"];
        value2 !== void 0 && (input.textDecorationLine = value2), (options["text-decoration-style"] !== void 0 || options["text-decoration-color"] !== void 0) && (value2 === void 0 || value2 === "none" ? this.warnAt(value, "text-decoration style/color without a line (underline | line-through) — dropped") : (options["text-decoration-style"] !== void 0 && (input.textDecorationStyle = options["text-decoration-style"]), options["text-decoration-color"] !== void 0 && (input.textDecorationColor = options["text-decoration-color"]))), options["font-variant-numeric"] !== void 0 && (input.fontVariantNumeric = options["font-variant-numeric"]), options["text-stroke-width"] !== void 0 && (input.textStrokeWidth = options["text-stroke-width"]), options["text-stroke-color"] !== void 0 && (input.textStrokeColor = options["text-stroke-color"]);
      }
      place(input, options, context, value, extra) {
        let state = {}, callback = (input2) => (extra.add(input2), input[input2]), value2 = callback("flex-grow"), value3 = callback("flex-shrink"), value4 = callback("flex-basis"), value5 = callback("align-self"), value6 = callback("justify-self"), value7 = callback("min-width"), value8 = callback("min-width-fit"), value9 = callback("min-height"), value10 = callback("max-width"), value11 = callback("max-height"), value12 = callback("aspect-ratio"), value13 = callback("grid-column"), value14 = callback("grid-row");
        if (!context.inContainer)
          return [
            value2,
            value3,
            value4,
            value5,
            value6,
            value7,
            value8,
            value9,
            value10,
            value11,
            value13,
            value14
          ].some((input2) => input2 !== void 0) && this.rejectAt(value, "flex/align-self/justify-self/min-*/max-*/grid-column apply to a div's flow children only (this element is pinned)"), value12 !== void 0 && this.rejectAt(value, "aspect-ratio applies to a div's flow children only — give a pinned element width and height"), state;
        value2 !== void 0 && (state.grow = value2), value3 !== void 0 && value3 !== 1 && (state.shrink = value3), value4 !== void 0 && value4 !== "auto" && (state.basis = value4), value5 !== void 0 && (state.alignSelf = value5), value6 !== void 0 && (state.justifySelf = value6);
        let callback2 = (input2, options2) => {
          if (input2 !== void 0) {
            if ("pct" in input2) {
              this.warnAt(value, options2 + ":" + String(input2.pct) + "% inside a div is dropped (the box may size differently) — use px, or flex:1 for a share");
              return;
            }
            return input2.px;
          }
        };
        if (value7 !== void 0 && (state.minW = callback2(value7, "min-width")), value8 !== void 0 && (state.minWFit = value8), value9 !== void 0 && (state.minH = callback2(value9, "min-height")), value10 !== void 0 && (state.maxW = callback2(value10, "max-width")), value11 !== void 0 && (state.maxH = callback2(value11, "max-height")), value12 !== void 0 && (state.aspect = value12), value13 !== void 0 && (state.colSpan = value13), value14 !== void 0 && (state.rowSpan = value14), options === "text" || options === "stack" || options === "table") {
          let value15 = callback("width"), value16 = callback("height"), callback3 = (input2, options2, context2) => {
            if (!("pct" in input2))
              return !1;
            if (options === "table" && options2 === "height")
              return this.warnAt(value, diagnosticHtmlTagLabel(value) + "height is ignored — a table is as tall as its rows"), !0;
            if (context2) {
              if (state.grow === 0)
                return this.warnAt(value, options2 + ":" + String(input2.pct) + "% is dropped (flex-grow is 0, so there is no share to take) — the box keeps its content size; give it px"), !0;
              state.grow === void 0 && (state.grow = input2.pct), state.basis === void 0 && (state.basis = 0), context.flowCount === 1 && input2.pct < 100 ? this.warnAt(value, options2 + ":" + String(input2.pct) + "% is dropped and the child stretches to the FULL " + options2 + " of its parent (100%, not " + String(input2.pct) + "% — a lone child's share is the whole axis); give it px") : this.warnAt(value, options2 + ": % of the parent is not supported inside a div — healed to a proportional share (flex-grow " + String(input2.pct) + ")");
            } else if (options === "table")
              options2 === "width" && input2.pct < 100 ? this.rejectAt(value, "<table> width:" + String(input2.pct) + "% — a table is always its container's width; give the table px, or wrap it in a div of that width") : this.warnAt(value, options2 + ": % of the parent is not supported inside a div — ignored (a table is " + (options2 === "width" ? "its container's width" : "as tall as its rows") + ")");
            else {
              let value17 = nonStretchAxisExplanation(context, options2, value5, value6);
              if (value17 === void 0 && input2.pct >= 100)
                this.warnAt(value, options2 + ": % of the parent is not supported inside a div — ignored across the axis (the child stretches to fill it)");
              else if (value17 !== void 0 && input2.pct === 100 && options2 === "width" && state.minW === void 0 && state.maxW === void 0 && state.minWFit === void 0 && !inlineStyleHasUnsafeSizing(value.attrs?.style, "width")) {
                let value18 = context.parentGrid === !0 ? "justify-self" : "align-self";
                value18 === "justify-self" ? state.justifySelf = "stretch" : state.alignSelf = "stretch";
                let value19 = value17.startsWith("the parent's ") ? "width:100% in a parent with " + value17.slice(13) + " is" : "has " + value17.replace(/^its /, "") + " and width:100%:";
                this.warnAt(value, diagnosticHtmlTagLabel(value) + value19 + " kept as " + value18 + ":stretch, which draws the same full-width box. Nothing to change.");
              } else
                value17 === void 0 ? this.rejectAt(value, diagnosticHtmlTagLabel(value) + options2 + ": " + String(input2.pct) + "% across the parent's axis — a flow child stretches (100%); for less use " + options2 + " in px, or align-self so it sizes to its content") : this.rejectAt(value, diagnosticHtmlTagLabel(value) + options2 + ":" + String(input2.pct) + "% across the parent's axis — " + value17 + " stops the child stretching, so it would shrink to its content; give it px");
            }
            return !0;
          };
          if (value15 !== void 0 && value15 !== "auto" && !callback3(value15, "width", context.parentGrid !== !0 && context.parentDir === "h")) {
            let value17 = callback2(value15, "width");
            value17 !== void 0 && (state.minW = value17, state.maxW = value17);
          }
          if (value16 !== void 0 && value16 !== "auto" && !callback3(value16, "height", context.parentGrid !== !0 && context.parentDir === "v")) {
            let value17 = callback2(value16, "height");
            value17 !== void 0 && (state.minH = value17, state.maxH = value17);
          }
        }
        options === "table" && (state.minH !== void 0 || state.maxH !== void 0 || state.aspect !== void 0) && (delete state.minH, delete state.maxH, delete state.aspect, this.warnAt(value, diagnosticHtmlTagLabel(value) + "height is ignored — a table is as tall as its rows"));
        for (let value15 of Object.keys(state))
          state[value15] === void 0 && delete state[value15];
        return state;
      }
      leftovers(input, options, context, value) {
        let flag = !1;
        for (let value2 of Object.keys(input))
          options.has(value2) || input[value2] === void 0 || value2 !== "position" && (value2 === "top" || value2 === "right" || value2 === "bottom" || value2 === "left" ? (flag || this.rejectAt(context, "left/top/right/bottom apply to position:absolute elements only (position:relative makes a div a pin host; it does not offset) — on " + value), flag = !0) : value2 === "background-image-src" || value2 === "background-size" || value2 === "background-position" || value2 === "background-repeat" ? this.rejectAt(context, diagnosticCssPropertyName(value2) + " does not apply to " + value + " — a box's picture is an <img> with object-fit; url() fills text only, with background-clip: text") : this.rejectAt(context, diagnosticCssPropertyName(value2) + " does not apply to " + value + (value2 === "display" ? " (only a section or div lays children out)" : "")));
      }
      inline(input, options, context = !1) {
        let items = [], items2 = [], items3 = [], callback = (input2) => input2.tag === "mark" || inlineStyleHasUnsafeBackground(input2.attrs.style), value, callback2 = (input2) => {
          if (value === void 0) {
            htmlCompilerCounters.fillWalks++, value = /* @__PURE__ */ new Set();
            let items4 = [], entries = /* @__PURE__ */ new Map(), items5 = [input];
            for (let value2 = items5.pop(); value2 !== void 0; value2 = items5.pop()) {
              items4.push(value2);
              for (let value3 of value2.children)
                value3.kind === "el" && (entries.set(value3, value2), items5.push(value3));
            }
            for (let value2 of items4.reverse())
              value2 !== input && (value.has(value2) || callback(value2)) && (value.add(value2), value.add(entries.get(value2)));
          }
          return value.has(input2);
        }, callback3 = (source, options2, context2, value2) => {
          if (source.kind === "text") {
            items.push({
              ...options2,
              text: source.text
            }), items2.push({
              ...context2,
              text: source.text
            });
            return;
          }
          let tag = source.tag;
          if (tag === "br") {
            items.push({
              text: `
`
            }), items2.push({
              text: `
`
            });
            return;
          }
          let state = {};
          if (tag === "b" || tag === "strong")
            state.bold = !0;
          else if (tag === "i" || tag === "em")
            state.italic = !0;
          else if (tag === "u")
            state.underline = !0;
          else if (tag === "a") {
            let value5 = source.attrs.href ?? "";
            (0, runtime2.isSafeHyperlink)(value5) ? state.href = value5.replace(/^https?:\/\//i, (input2) => input2.toLowerCase()) : this.warnAt(source, '<a href="' + (0, runtime2.compactDiagnosticValue)(value5) + '"> — only http(s) links are kept (text stays)'), source.attrs.style !== void 0 && this.inlineStyle(source, state);
          } else
            tag === "span" ? source.attrs.style !== void 0 && this.inlineStyle(source, state) : flattenableInlineElementNames.has(tag) ? this.warnAt(source, "<" + tag + "> is not in this format — its text is kept unstyled") : supportedSlideHtmlElementNames.has(tag) || tag === "li" ? this.errorAt(source, "<" + tag + "> cannot sit inside a text block (<" + input.tag + "> at " + String(input.line) + ":" + String(input.col) + ") — close the block first") : this.errorAt(source, "<" + tag + "> is not a tag in this format");
          let state2 = {
            ...options2,
            ...state
          }, state3 = {
            ...context2,
            ...state
          }, value3 = inlineFormatElementNames.has(tag) && source.attrs.style !== void 0, value4 = value2 || callback(source);
          value3 && !value4 && !callback2(source) && this.inlineStyle(source, state2, items3);
          for (let value5 of source.children)
            callback3(value5, state2, state3, value4);
        };
        for (let value2 of input.children)
          callback3(value2, {}, {}, context);
        return {
          ...parseInlineTextTree(items),
          plain: parseInlineTextTree(items2).marks,
          say: () => items3.forEach((input2) => input2())
        };
      }
      cappedMarks(input) {
        let callback = (input2) => input.reduce((input3, options) => input3 + options[input2].length, 0);
        if (callback("marks") > runtime2.maxTextMarks && callback("plain") <= runtime2.maxTextMarks)
          return input.map((input2) => input2.plain);
        for (let value of input)
          value.say();
        return input.map((input2) => input2.marks);
      }
      inlineStyle(input, options, context) {
        let callback = (input2) => context !== void 0 ? void context.push(input2) : input2(), value = this.warner(input, "<" + input.tag + "> "), value2 = this.rejecter(input, "<" + input.tag + "> "), callback2 = (input2) => callback(() => this.rejectAt(input, input2)), value3 = parseInlineStyle(input.attrs.style, (input2) => callback(() => value(input2)), (input2) => callback(() => value2(input2)));
        for (let value4 of Object.keys(value3))
          if (value4 === "color")
            options.color = value3.color;
          else {
            if (value4 === "text-fill-current")
              continue;
            if (value4 === "font-weight" && (value3["font-weight"] ?? 0) >= 600)
              options.bold = !0;
            else if (value4 === "font-style" && value3["font-style"] === "italic")
              options.italic = !0;
            else if (value4 === "font-weight" && /^(b|strong)$/.test(input.tag) || value4 === "font-style" && /^(i|em)$/.test(input.tag))
              callback2("inline <" + input.tag + "> " + value4 + ": a style cannot undo what the tag adds — leave the declaration out, or remove the <" + input.tag + "> itself");
            else if (value4 === "font-weight" || value4 === "font-style")
              callback2("inline <" + input.tag + "> " + value4 + ": only bold (≥600) / italic can be ADDED to a phrase — a lighter or upright phrase is a separate <p>");
            else if (value4.startsWith("text-decoration")) {
              let value5 = value3["text-decoration-style"] === void 0 && value3["text-decoration-color"] === void 0;
              value3["text-decoration-line"] === "underline" && value5 ? input.tag !== "a" && (options.underline = !0) : input.tag === "u" && value3["text-decoration-line"] === "none" && value5 ? value4 === "text-decoration-line" && callback2("inline <u> text-decoration:none cannot remove the underline the tag adds — leave the declaration out, or remove the <u> itself") : (value4 === "text-decoration-line" || value3["text-decoration-line"] === void 0) && callback2("inline <" + input.tag + "> text-decoration: a plain underline only (<u>) — a strikethrough or a styled/coloured line goes on the block");
            } else
              callback2("inline <" + input.tag + "> takes color, font-weight, font-style and a plain underline only (" + diagnosticCssPropertyName(value4) + " belongs on the block; a different size or face is a separate <p>)");
          }
      }
      tableHeightHeal(input, options, context) {
        let value = input;
        if (value.anchor !== "fill" && value.size === void 0)
          return input;
        let value2 = (0, runtime2.normalizeTableYAxis)(value, options), bottom = parseInlineStyle(context.attrs.style, () => {
        }, () => {
        }).bottom, value3 = bottom !== void 0 && bottom !== "auto", value4 = value.anchor === "fill" && value3 ? "bottom" : "height";
        return this.styleWarner(context)(value4 + " is ignored — a table is as tall as its rows" + (value2.anchor === "leading" ? " (pinned at top:" + String(value2.margin) + "px)" : "")), value2;
      }
      styleWarner(input) {
        return this.warner(input, "<" + input.tag + "> ");
      }
      styleRejecter(input) {
        return this.rejecter(input, "<" + input.tag + "> ");
      }
      nodeEl = /* @__PURE__ */ new WeakMap();
      node(input, options) {
        let value = this.nodeInner(input, options);
        if (this.connectorFrom = void 0, value !== void 0 && this.nodeEl.set(value, input), value !== void 0 && input.attrs["data-slots"] !== void 0) {
          let slots = (0, runtime2.normalizeNodeSlots)(input.attrs["data-slots"]);
          slots !== void 0 && (value.slots = slots);
        }
        return value;
      }
      nodeInner(input, options) {
        let tag = input.tag, value = this.styleWarner(input), value2 = this.parseOverride ?? parseInlineStyle(input.attrs.style, value, this.styleRejecter(input), void 0, this.listEm(input, options));
        this.parseOverride = void 0, this.frameFill !== void 0 && (options = {
          ...options,
          fill: this.frameFill
        }, this.frameFill = void 0);
        let values = /* @__PURE__ */ new Set();
        if (this.attrs(input, options), value2["background-clip"] === "text" && value2.color !== void 0 && /^#[0-9a-f]{6}00$/.test(value2.color) && (delete value2.color, value2["text-fill-transparent"] = !0), value2.display === "none") {
          value("display:none — the element is removed (delete it, or use hidden on a section)");
          return;
        }
        if (!this.countNode(input))
          return;
        if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "p" || tag === "span") {
          tag === "span" && values.add("display");
          let { eff: value4 } = this.typography(value2, options.inh, tag, input), value5 = this.inline(input, input), { text: value6 } = value5, value7 = this.cappedMarks([value5])[0];
          this.textCaps(input, value6, value7);
          let state = {
            kind: "text",
            role: htmlTagTextRoles[tag],
            text: value6
          };
          value7.length > 0 && (state.marks = value7), value4.color !== void 0 && (state.color = value4.color), value4.noWrap === !0 && (state.wrap = "nowrap");
          let value8 = (0, runtime2.normalizeShapeVariant)(input.attrs["data-fit"]);
          value8 !== void 0 && (state.fit = value8), value4.textAlign !== void 0 && value4.textAlign !== "left" && (state.align = value4.textAlign === "center" ? "center" : value4.textAlign === "justify" ? "justify" : "end");
          let value9 = this.textFill(value2, input, values);
          value9 !== void 0 && (state.fill = value9);
          let value10 = this.textBag(value2, value4, input, values);
          Object.keys(value10).length > 0 && (state.style = value10);
          let value11 = this.place(value2, "text", options, input, values);
          return Object.keys(value11).length > 0 && (state.place = value11), this.leftovers(value2, values, input, "<" + tag + ">"), state;
        }
        let isDataText = isListTextBoxDiv(input);
        if (tag === "ul" || tag === "ol" || isDataText) {
          let { eff: value4 } = this.typography(value2, options.inh, "p", input), items = [], items2 = [], index4 = 0, items3 = [], itemLists = [], callback = (input2, options2, listKind) => {
            let value9 = this.inline(input2, input2, options2);
            value9.text.includes(`
`) && this.warnAt(input2, "<br> inside <li> — a list item is one line here; use another <li>"), items3.push(value9), itemLists.push(listKind);
          }, callback2 = (input2, options2, context) => {
            let listKind = input2.tag === "ul" ? "bullet" : "number";
            for (let value9 of input2.children) {
              if (value9.kind === "text") {
                value9.text.trim() !== "" && this.errorAt(value9, "text directly inside <" + input2.tag + "> — wrap it in <li>");
                continue;
              }
              if (value9.tag === "li") {
                let value10 = value9.children.filter((source) => source.kind === "el" && (source.tag === "ul" || source.tag === "ol")), value11 = context || inlineStyleHasUnsafeBackground(value9.attrs.style);
                if (value10.length > 0) {
                  this.warnAt(value9, "nested lists are flattened (one level here)");
                  let state2 = {
                    ...value9,
                    children: value9.children.filter((source) => !(source.kind === "el" && (source.tag === "ul" || source.tag === "ol")))
                  };
                  callback(state2, value11, listKind);
                  for (let value12 of value10)
                    callback2(value12, options2 + 1, value11 || inlineStyleHasUnsafeBackground(value12.attrs.style));
                } else
                  callback(value9, value11, listKind);
                value9.attrs.style !== void 0 && this.rejectAt(value9, "style on <li> is not in this format — style the <" + (isDataText ? "div" : input2.tag) + ">");
                continue;
              }
              this.errorAt(value9, "<" + value9.tag + "> inside <" + input2.tag + "> — only <li> items");
            }
          };
          if (!isDataText)
            callback2(input, 0, !1);
          else
            for (let child of input.children)
              child.kind !== "text" && (this.attrs(child, {
                ...options,
                inContainer: !0
              }, !0), child.tag !== "p" ? callback2(child, 0, !1) : (items3.push(this.inline(child, child)), itemLists.push(null)));
          let lineLists = [];
          this.cappedMarks(items3).forEach((input2, options2) => {
            let value9 = itemLists[options2] === null ? items3[options2].text : items3[options2].text.replace(/\n/g, " ");
            for (let value10 of input2)
              items2.push({
                ...value10,
                start: value10.start + index4,
                end: value10.end + index4
              });
            items.push(value9);
            for (let _line of value9.split(`
`))
              lineLists.push(itemLists[options2] ?? null);
            index4 += value9.length + 1;
          }), this.textCaps(input, items.join(`
`), items2);
          let listFields = isDataText ? (0, runtime2.textListFields)(lineLists) : {
            list: tag === "ul" ? "bullet" : "number"
          }, dataRole = input.attrs["data-role"], role = dataRole === "h1" || dataRole === "h2" || dataRole === "h3" ? dataRole : "body", state = {
            kind: "text",
            role,
            text: items.join(`
`),
            ...listFields
          };
          items2.length > 0 && (state.marks = items2), value4.color !== void 0 && (state.color = value4.color), value4.noWrap === !0 && (state.wrap = "nowrap");
          let value5 = (0, runtime2.normalizeShapeVariant)(input.attrs["data-fit"]);
          value5 !== void 0 && (state.fit = value5), value4.textAlign !== void 0 && value4.textAlign !== "left" && (state.align = value4.textAlign === "center" ? "center" : value4.textAlign === "justify" ? "justify" : "end");
          let value6 = this.textFill(value2, input, values);
          value6 !== void 0 && (state.fill = value6);
          let value7 = this.textBag(value2, value4, input, values);
          role !== "body" && (value7.fontSize ??= importedHtmlTypeScale.p.size, value7.fontWeight ??= importedHtmlTypeScale.p.weight, value7.lineHeight ??= importedHtmlTypeScale.p.lh);
          let listIndent = isDataText && input.attrs["data-text"] !== "" ? Number(input.attrs["data-text"]) : void 0;
          listFields.lineLists !== void 0 && listIndent !== void 0 && (state.listIndent = listIndent), isDataText && this.lists === "css" && listFields.list !== void 0 && (value7.paddingLeft = Math.min(256, (value7.paddingLeft ?? 0) + (listIndent ?? runtime2.defaultListGutter)), value7.paddingLeft === runtime2.defaultListGutter && delete value7.paddingLeft), Object.keys(value7).length > 0 && (state.style = value7);
          let value8 = this.place(value2, "text", options, input, values);
          return Object.keys(value8).length > 0 && (state.place = value8), this.leftovers(value2, values, input, "<" + tag + ">"), state;
        }
        if (tag === "img" || tag === "video")
          return this.image(input, value2, options, values);
        if (tag === "x-shape" || tag === "hr")
          return this.shape(input, value2, options, values);
        if (tag === "x-connector")
          return this.connector(input, value2, options, values);
        if (tag === "x-icon")
          return this.icon(input, value2, options, values);
        if (tag === "table")
          return this.table(input, value2, options, values);
        if (tag === "svg")
          return this.svg(input, value2, options, values);
        if (tag === "x-embed")
          return this.embed(input, value2, options, values);
        if (tag === "div")
          return this.container(input, value2, options, values);
        if (tag === "aside") {
          this.errorAt(input, "<aside> (speaker notes) must be a direct child of <section>");
          return;
        }
        let value3 = {
          h4: '<p style="font-size:36px; font-weight:600">',
          h5: '<p style="font-size:32px; font-weight:600">',
          h6: '<p style="font-size:28px; font-weight:600">',
          blockquote: '<div style="border-left…"> is not available — use <div style="padding; background"> with a <p>',
          figure: "<div>",
          header: "<div>",
          footer: "<div>",
          nav: "<div>",
          main: "<div>",
          article: "<div>",
          pre: '<p style="font-family: monospace">',
          code: '<p style="font-family: monospace">',
          iframe: '<x-embed style="position:absolute; …; width; height">…html…</x-embed>',
          canvas: "an <x-embed>",
          button: '<div style="background; padding; border-radius"><p>label</p></div>',
          input: "nothing (no forms here)",
          form: "nothing (no forms here)",
          script: "nothing — scripts never run here",
          style: 'inline style="" attributes (the only <style> allowed is @font-face in <head>)'
        }[tag];
        this.errorAt(input, "<" + tag + "> is not a tag in this format" + (value3 !== void 0 ? " — use " + value3 : "") + "; allowed: section, h1-h3, p, ul/ol/li, div, img, svg, x-embed, table/tr/th/td, x-shape, x-connector, x-icon, hr, aside, b/i/u/a/span/br");
      }
      attrs(input, options, insideTextBox = !1) {
        for (let value of Object.keys(input.attrs))
          if (value !== "style") {
            if (value === "id" || value === "data-build-in" || value === "data-build-out") {
              options.inContainer && this.warnAt(input, value + " applies to a section's position:absolute children only (builds and magic move key on positioned elements) — dropped on this flow child");
              continue;
            }
            if (value !== "data-slots") {
              if (value === "data-fit") {
                !blockTextElementNames.has(input.tag) && !isListTextBoxDiv(input) ? this.warnAt(input, "data-fit applies to text (h1–h3, p, ul, ol, div data-text) and <table> only — dropped") : (0, runtime2.normalizeShapeVariant)(input.attrs[value]) === void 0 && this.warnAt(input, 'data-fit="' + (0, runtime2.compactDiagnosticValue)(input.attrs[value] ?? "") + '" — one of shrink | none | grow; using the default (' + runtime2.defaultTextFit + ")");
                continue;
              }
              if (!(input.tag === "img" && (value === "src" || value === "alt" || value === "width" || value === "height" || value === "loading" || value === "decoding" || value === "data-crop" || imageVideoAttributeNames.has(value))) && !(input.tag === "video" && videoAttributeNames.has(value)) && !(input.tag === "x-shape" && value === "kind") && !(input.tag === "x-connector" && connectorAttributeNames.has(value)) && !(input.tag === "x-icon" && value === "name") && input.tag !== "svg" && !(input.tag === "div" && (value === "data-group" || value === "data-artifact" && !isListTextBoxDiv(input) || value === "data-text" && isListTextBoxDiv(input))) && !(value === "data-role" && !insideTextBox && htmlHeadingNames.has(input.attrs[value] ?? "") && (input.tag === "ul" || input.tag === "ol" || isListTextBoxDiv(input)))) {
                if (input.tag === "div" && value === "data-text") {
                  this.warnAt(input, "data-text dropped, so this is a plain <div>. One text box needs: data-text bare or a list indent 0–256 (no unit); no data-group; no display, gap, flex, grid or align on the div; only unstyled <p>, <ul>, <ol> inside, at least one a list");
                  continue;
                }
                if (value.startsWith("on")) {
                  this.warnAt(input, value + " is dropped (scripts never run here)");
                  continue;
                }
                if (value === "class" || value === "title" || value === "role" || value.startsWith("aria-") || value === "lang" || value === "dir" || value.startsWith("data-") || value === "tabindex" || value === "draggable" || value === "contenteditable") {
                  this.warnAt(input, value + " attribute is not in this format — dropped" + (value === "class" ? ' (inline style="" only)' : value === "data-role" ? " (only h1, h2 or h3, on the <ul>, <ol> or <div data-text> that is a whole text box)" : ""));
                  continue;
                }
                this.warnAt(input, value + " attribute is not in this format — dropped");
              }
            }
          }
      }
      imageRef(input, options, context) {
        let value = this.collectFiles || this.fileMap !== void 0;
        if ((0, runtime2.isAllowedImageSource)(input) && !(value && runtime2.designSystemImagePathPattern.test(input)))
          return input;
        if (/^data:/i.test(input))
          this.errorAt(options, context("data:…") + " — only png/jpeg/gif/webp/avif/svg data URIs ≤70 KB (SVG: write # as %23)");
        else if (/^[a-z][a-z0-9+.-]*:/i.test(input) || input.startsWith("//"))
          this.errorAt(options, context((0, runtime2.compactDiagnosticValue)(input)) + ' — URLs are not fetched: save the image beside the deck and reference the file (src="photo.jpg")');
        else if (input.startsWith("/") || !this.collectFiles && input.split(/[\\/]/).includes(".."))
          this.errorAt(options, context((0, runtime2.compactDiagnosticValue)(input)) + " — a relative path under the deck's folder (the build may reach --assets-from roots), no absolute paths");
        else {
          let value2 = this.fileRef(input, "image", options);
          if (value2 !== void 0)
            return value2;
          if (this.collectFiles)
            return input;
          this.errorAt(options, context((0, runtime2.compactDiagnosticValue)(input)) + " is a file reference with no data — build the deck with scripts/make.ts (it uploads or inlines the file)");
        }
      }
      textFill(input, options, context) {
        for (let value5 of [
          "background-clip",
          "text-fill-transparent",
          "text-fill-current"
        ])
          context.add(value5);
        let value = this.styleWarner(options), value2 = this.styleRejecter(options), value3 = input["background-image-src"];
        if (input["text-fill-current"] && value2("-webkit-text-fill-color: currentcolor belongs on a coloured <span> INSIDE gradient/image text — dropped here"), input["background-clip"] !== "text") {
          input["text-fill-transparent"] && value2("-webkit-text-fill-color without background-clip: text — dropped");
          return;
        }
        for (let value5 of [
          "background-image-src",
          "background-size",
          "background-position",
          "background-repeat"
        ])
          context.add(value5);
        if (!input["text-fill-transparent"]) {
          value("background-clip: text needs -webkit-text-fill-color: transparent (or color: transparent) to show the fill — the text paints solid without it; clip ignored"), delete input["background-gradient"];
          return;
        }
        let value4 = input["background-gradient"];
        if (delete input["background-gradient"], input["background-color"] !== void 0 && (value2('background-color beside background-clip: text is dropped — the glyphs take the whole background; for a box behind them wrap the text in a <div style="background">'), delete input["background-color"]), input["text-shadow"] !== void 0 && value("text-shadow is not drawn on gradient/image text (it would paint over the fill) — kept for when the text is a plain colour"), value3 !== void 0) {
          let value5 = this.imageRef(value3, options, (input2) => "<" + options.tag + "> background: url(" + input2 + ")");
          if (value5 === void 0)
            return;
          if ((0, runtime2.isAllowedImageSource)(value5) && !(0, runtime2.isRenderableImageSource)(value5)) {
            value2("background: url(data:…) — a text fill's data URI must be ;base64 (no text-form SVG here)");
            return;
          }
          return {
            kind: "image",
            src: value5,
            ...input["background-size"] === "contain" ? {
              size: "contain"
            } : {}
          };
        }
        for (let value5 of [
          "background-size",
          "background-position",
          "background-repeat"
        ])
          input[value5] !== void 0 && value2(diagnosticCssPropertyName(value5) + " applies to a url() text fill only — dropped");
        if (value4 !== void 0)
          return {
            kind: "gradient",
            gradient: value4
          };
        value("background-clip: text without a gradient or url() background — ignored");
      }
      image(input, options, context, value) {
        let value2 = input.tag === "video", value3 = value2 ? input.attrs["aria-label"] ?? input.attrs.title ?? input.attrs.alt : input.attrs.alt, state = {
          kind: "img",
          alt: (value3 ?? "").replace(/\s+/g, " ").trim().slice(0, 500)
        };
        value3 === void 0 && this.warnAt(input, input.wrote === "iframe" ? '<iframe> without title — add a short description (title="")' : value2 ? '<video> without aria-label — add a short description (aria-label="")' : '<img> without alt — add a short description (alt="")'), value2 && input.children.some((source) => source.kind === "el") && this.warnAt(input, "<video> holds no elements here (<source>, <track>) — what is inside it is dropped; name the clip in src");
        let value4, value5 = value2 ? "src" : "data-video", value6 = (input.attrs[value5] ?? "").trim();
        if (value6 !== "") {
          let value21 = value2 ? (0, runtime2.parseVideoLinkUrl)(value6) : null;
          (0, runtime2.isModelBlobReference)(value6) ? state.video = value6 : value21 !== null ? value4 = value21 : this.rejectAt(input, "<" + input.tag + " " + value5 + '="' + (0, runtime2.compactDiagnosticValue)(value6) + '"> — a clip is an uploaded .mp4 or .webm (URLs and files beside the deck are not fetched); dropped, the picture stays. Upload it with upload_asset and use the /_blob/<id> it returns');
        } else
          value2 && this.warnAt(input, "<video> without src — give it the uploaded clip's /_blob/<id> reference");
        for (let value21 of value2 ? [] : runtime2.videoProviders) {
          let value22 = input.attrs["data-video-" + value21];
          if (value22 === void 0)
            continue;
          let value23 = (0, runtime2.normalizeVideoLink)({
            provider: value21,
            id: value22.trim()
          });
          state.video !== void 0 || value4 !== void 0 ? this.warnAt(input, "data-video-" + value21 + " beside another video — dropped (a picture names one video)") : value23 !== void 0 ? value4 = value23 : this.rejectAt(input, "<img data-video-" + value21 + '="' + (0, runtime2.compactDiagnosticValue)(value22) + `"> — write only the video's id (` + (0, runtime2.videoProviderIdHint)(value21) + "), not the address; dropped, the picture stays");
        }
        let value7 = input.attrs["data-video-at"];
        if (value7 !== void 0) {
          let value21 = (0, runtime2.normalizeVideoStartSeconds)(value7);
          value4 === void 0 ? this.warnAt(input, "data-video-at needs a valid " + runtime2.videoProviders.filter(runtime2.videoProviderKeepsStart).map((provider) => "data-video-" + provider).join(" or ") + " on the same <img> — dropped") : (0, runtime2.videoProviderKeepsStart)(value4.provider) ? value21 !== void 0 ? value4 = {
            ...value4,
            start: value21
          } : Number(value7) !== 0 && this.warnAt(input, 'data-video-at="' + (0, runtime2.compactDiagnosticValue)(value7) + '" — whole seconds into the video; starting at the beginning') : this.warnAt(input, "data-video-at — no start time is kept for a " + runtime2.videoProviderLabels[value4.provider] + " video; dropped");
        }
        value4 !== void 0 && (state.videoLink = value4);
        let value8 = input.attrs["data-video-start"], value9 = input.attrs["data-video-delay"], value10 = input.attrs["data-video-sound"], videoLoop = input.attrs["data-video-loop"], videoStill = input.attrs["data-video-still"]?.trim();
        if ((state.video !== void 0 ? videoStill === "clip" : value4 !== void 0 && (0, runtime2.isVideoStillStamp)(videoStill)) && (state.videoStill = videoStill), state.video !== void 0) {
          if (value10 !== void 0 && (value10.trim() === "on" ? state.videoSound = "on" : value10.trim() !== "off" && this.warnAt(input, 'data-video-sound="' + (0, runtime2.compactDiagnosticValue)(value10) + '" — one of on | off; using off (muted)')), videoLoop !== void 0 && (videoLoop.trim() === "off" ? state.videoLoop = "off" : videoLoop.trim() !== "on" && this.warnAt(input, 'data-video-loop="' + (0, runtime2.compactDiagnosticValue)(videoLoop) + '" — one of on | off; using on (it loops)')), value8 !== void 0 && (value8.trim() === "click" ? state.videoStart = "click" : value8.trim() !== "auto" && this.warnAt(input, 'data-video-start="' + (0, runtime2.compactDiagnosticValue)(value8) + '" — one of auto | click; using auto')), value9 !== void 0) {
            let value21 = (0, runtime2.normalizeVideoDelay)(value9);
            state.videoStart === "click" ? this.warnAt(input, "data-video-delay applies to a clip that starts by itself — dropped (this one starts on a click)") : value21 !== void 0 ? (state.videoDelay = value21, Number(value9) > runtime2.maxVideoDelaySeconds && this.warnAt(input, 'data-video-delay="' + (0, runtime2.compactDiagnosticValue)(value9) + '" — ' + String(runtime2.maxVideoDelaySeconds) + " seconds at most; using " + String(runtime2.maxVideoDelaySeconds))) : Number(value9) !== 0 && this.warnAt(input, 'data-video-delay="' + (0, runtime2.compactDiagnosticValue)(value9) + '" — seconds from 0 to ' + String(runtime2.maxVideoDelaySeconds) + "; using none");
          }
        } else
          (value8 !== void 0 || value9 !== void 0 || value10 !== void 0 || videoLoop !== void 0) && this.warnAt(input, "data-video-start / data-video-delay / data-video-sound / data-video-loop apply only with a clip (data-video, or <video src>) — dropped");
        let value11 = value2 ? "poster" : "src", value12 = (input.attrs[value11] ?? "").trim();
        if (value12 === "")
          state.video === void 0 && value4 === void 0 && !value2 && this.warnAt(input, '<img> without src — an empty image frame; give it src="photo.jpg"');
        else {
          let value21 = this.imageRef(value12, input, (input2) => "<" + input.tag + " " + value11 + '="' + input2 + '">');
          value21 !== void 0 && (state.src = value21);
        }
        value.add("object-fit");
        let value13 = options["object-fit"];
        if (value13 !== void 0 ? state.fit = value13 === "contain" ? "contain" : "cover" : state.fit = "cover", input.attrs["data-crop"] !== void 0) {
          let value21 = (0, runtime2.parseImageCrop)(input.attrs["data-crop"]), value22 = 'data-crop="' + (0, runtime2.compactDiagnosticValue)(input.attrs["data-crop"]) + '"';
          value21 === void 0 ? this.warnAt(input, value22 + ' — write ZOOM X% Y% (zoom 1–50, then the object-position), e.g. data-crop="1.5 50% 30%"; dropped') : state.fit === "contain" ? this.warnAt(input, value22 + " applies to object-fit:cover only — dropped") : typeof state.src == "string" && state.src.startsWith("data:image/svg+xml") ? this.warnAt(input, value22 + " does not apply to an svg — dropped") : state.src === void 0 ? this.warnAt(input, value22 + " on a <" + input.tag + "> with no still picture — dropped") : value21 !== null && (state.crop = value21);
        }
        value.add("width"), value.add("height");
        let value14 = options.width ?? (input.attrs.width !== void 0 ? {
          px: Number(input.attrs.width)
        } : void 0), value15 = options.height ?? (input.attrs.height !== void 0 ? {
          px: Number(input.attrs.height)
        } : void 0), value16, callback = (input2, options2) => {
          if (!(input2 === void 0 || input2 === "auto")) {
            if ("pct" in input2) {
              context.inContainer && (context.parentGrid !== !0 && options2 === "width" == (context.parentDir === "h") ? value16 = {
                pct: input2.pct,
                prop: options2
              } : this.rejectAt(input, "<" + input.tag + "> " + options2 + ":" + String(input2.pct) + "% — an image inside a div keeps its own size (it never stretches); give it px"));
              return;
            }
            if (Number.isFinite(input2.px) && input2.px > 0)
              return input2.px;
          }
        }, value17 = callback(value14, "width"), value18 = callback(value15, "height");
        value17 !== void 0 && (state.w = value17), value18 !== void 0 && (state.h = value18), context.inContainer && value17 === void 0 && value18 === void 0 && options["flex-grow"] === void 0 && options["align-self"] === void 0 && options["aspect-ratio"] === void 0 && this.warnAt(input, "<" + input.tag + "> inside a div without width/height (or flex:1 / aspect-ratio) — it renders at its natural size");
        let value19 = this.paintBag(options, "img", input, value);
        Object.keys(value19).length > 0 && (state.style = value19);
        let value20 = this.place(options, "img", context, input, value);
        if (value16 !== void 0) {
          let { pct: value21, prop: value22 } = value16;
          value20.grow === 0 ? this.warnAt(input, value22 + ":" + String(value21) + "% is dropped (flex-grow is 0, so there is no share to take) — the image keeps its own size; give it px") : (value20.grow === void 0 && (value20.grow = value21), value20.basis === void 0 && (value20.basis = 0), context.flowCount === 1 && value21 < 100 ? this.warnAt(input, value22 + ":" + String(value21) + "% is dropped and the image stretches to the FULL " + value22 + " of its parent (100%, not " + String(value21) + "% — a lone child's share is the whole axis); give it px") : this.warnAt(input, value22 + ": % of the parent is not supported inside a div — healed to a proportional share (flex-grow " + String(value21) + ")"));
        }
        return Object.keys(value20).length > 0 && (state.place = value20), this.leftovers(options, value, input, "<" + input.tag + ">"), state;
      }
      noContent(input) {
        input.children.some((source) => source.kind === "text" ? source.text.trim() !== "" : !0) && this.warnAt(input, "<" + input.tag + "> holds no content — what is inside it is dropped (put text in a <p> over it, inside a position:relative div)");
      }
      shape(input, options, context, value) {
        this.noContent(input);
        let value2 = input.tag === "hr", value3 = value2 ? "line" : (input.attrs.kind ?? "").trim().toLowerCase();
        if (value3 === "connector") {
          this.errorAt(input, '<x-shape kind="connector"> — a connector is its own tag: <x-connector x1 y1 x2 y2 head="end|both|none" route="straight|elbow|hv|vh">');
          return;
        }
        if (!runtime2.shapeVariants.includes(value3)) {
          this.errorAt(input, '<x-shape kind="' + (0, runtime2.compactDiagnosticValue)(input.attrs.kind ?? "") + '"> — kind is one of ' + runtime2.shapeVariants.filter((input2) => input2 !== "connector").join(", ") + " (a painted <div> is a rectangle; a line with an arrowhead is <x-connector>)");
          return;
        }
        let state = {
          kind: "shape",
          shape: value3 === "rounded" ? "rect" : value3
        }, value4 = value2 && context.inContainer ? unwrapTransparentContainer(input, options, context) : void 0, value5 = "<" + input.tag + "> ";
        value.add("width"), value.add("height");
        let state2 = {
          ...options
        }, value6 = state2["background-gradient"];
        value6 !== void 0 && (value.add("background-gradient"), state2["background-color"] ??= value6.stops[0].color, delete state2["background-gradient"], this.rejectAt(input, "<x-shape> background is one flat COLOR (no gradient)"));
        let value7 = state2.border !== void 0 ? {
          ...state2.border
        } : void 0;
        value7 !== void 0 && value7.style !== "none" && (value7.style ??= "solid", state.shape === "line" && value7.style !== "solid" && (this.rejectAt(input, value5 + "is a solid line (" + value7.style + ") — dashes are for x-connector"), value7.style = "solid"), value7.widths !== void 0 && (value7.width = Math.max(...Object.values(value7.widths).map((input2) => input2 ?? 0)), delete value7.widths, this.rejectAt(input, value5 + "border is the stroke: one width all round")), value7.sides !== void 0 && (value2 && value7.sides.length === 1 && (value7.sides[0] === "top" || value7.sides[0] === "bottom") || this.rejectAt(input, value5 + "border is the stroke: all sides (no border-top/right/bottom/left)" + (value2 ? " — or border-top alone for the line" : "")), delete value7.sides), value7.color ??= context.inh.color ?? "#000000", state2.border = value7);
        let value8 = state2.height !== void 0 && state2.height !== "auto" && "px" in state2.height ? state2.height.px : void 0;
        if (value2 && value.add("color"), value2 && (value7 === void 0 || value7.style === "none")) {
          let value13 = state2["background-color"];
          state2.border = {
            style: "solid",
            color: value13 ?? state2.color ?? context.inh.color ?? "#000000",
            width: value13 !== void 0 && value8 !== void 0 ? Math.min(runtime2.maxShapeStrokeWidth, Math.max(1, value8)) : 1
          }, delete state2["background-color"];
        }
        state.shape !== "rect" && state2["border-radius"] !== void 0 && (value.add("border-radius"), delete state2["border-radius"], this.rejectAt(input, "border-radius rounds a rectangle — not <" + input.tag + (value2 ? ">" : ' kind="' + value3 + '">')));
        let value9 = this.paintBag(state2, "shape", input, value);
        value3 === "rounded" && value9.borderRadius === void 0 && value9.borderTopLeftRadius === void 0 && (value9.borderRadius = runtime2.maxShapeCornerRadius), value9.backgroundColor === void 0 && !(0, runtime2.shapeHasOutline)(value9) && (0, runtime2.shapeZeroWidthOutlineColor)(value9) === void 0 && (value9.backgroundColor = context.inh.color ?? "#808080", this.warnAt(input, "<x-shape> without background or border — filled with the text color"));
        let boxShadow = value9.boxShadow;
        if (boxShadow !== void 0 && boxShadow.length === 1) {
          let value13 = boxShadow[0];
          for (let value14 of runtime2.shadowPresetNames) {
            let value15 = neutralHtmlShadowPresets[value14];
            value13.inset !== !0 && value13.x === 0 && value13.y === value15.y && value13.blur === value15.blur && (value13.spread ?? 0) === 0 && value13.color === value15.color && (value9.boxShadow = [
              {
                ...runtime2.shadowPresets[value14]
              }
            ]);
          }
        }
        let transform = value9.transform;
        if (delete value9.transform, transform !== void 0) {
          let { rotate: value13, ...value14 } = transform;
          Object.keys(value14).length > 0 ? this.rejectAt(input, "transform on <" + input.tag + "> is rotate(ANGLE) only — dropped (it has " + Object.keys(value14).join("/") + ")") : value13 !== void 0 && (0, runtime2.normalizeRotation)(value13) !== void 0 && (state.rotate = (0, runtime2.normalizeRotation)(value13));
        }
        Object.keys(value9).length > 0 && (state.style = value9);
        let callback = (input2, options2) => {
          if (!(input2 === void 0 || input2 === "auto")) {
            if ("pct" in input2) {
              this.rejectAt(input, value5 + options2 + ":" + String(input2.pct) + "% — only px here");
              return;
            }
            if (input2.px > 0)
              return input2.px;
          }
        }, value10 = value4 !== void 0 && isFullWidthStyle(state2) ? void 0 : callback(state2.width, "width"), value11 = callback(state2.height, "height");
        value10 !== void 0 && (state.w = value10), value11 !== void 0 && (state.h = value11), value2 && state.h === void 0 && (state.h = state2.border?.width ?? 1), !value2 && !context.inContainer && (value10 === void 0 && context.fill?.x !== !0 || value11 === void 0 && context.fill?.y !== !0) && this.warnAt(input, "<x-shape> on the slide needs width and height (or left+right / top+bottom)");
        let value12 = this.place(state2, "shape", context, input, value);
        if (value4 !== void 0 && migrateThinBorderToFill(state, value9, value12, context, value4), value4 !== void 0 && isFullWidthStyle(state2)) {
          let explanation = nonStretchAxisExplanation(context, "width", value12.alignSelf, value12.justifySelf), selfKey = context.parentGrid === !0 ? "justifySelf" : "alignSelf";
          explanation === void 0 ? this.warnAt(input, value5 + "width:100% is not stored: the line already stretches across its parent, which draws the same full-width line. Nothing to change.") : (selfKey === "alignSelf" ? value12.alignSelf = "stretch" : value12.justifySelf = "stretch", this.warnAt(input, value5 + "width:100% in a parent with " + explanation.slice(13) + " is kept as " + (selfKey === "alignSelf" ? "align" : "justify") + "-self:stretch, which draws the same full-width line. Nothing to change."));
        }
        return Object.keys(value12).length > 0 && (state.place = value12), this.leftovers(state2, value, input, "<" + input.tag + ">"), state;
      }
      connectorFrom;
      connectorFrame(input, options, context, value) {
        let callback = (input2) => {
          let value8 = (input.attrs[input2] ?? "").trim().replace(/px$/i, "");
          if (value8 === "")
            return;
          let value9 = /^(-?[\d.]+)%$/.exec(value8);
          if (value9 !== null) {
            let value11 = Number(value9[1]);
            if (!Number.isFinite(value11))
              return;
            let value12 = input2 === "x1" || input2 === "x2" ? context : value;
            return value12 === void 0 ? (this.rejectAt(input, "<x-connector> " + input2 + ": % inside a position:relative div whose size is not known — give the div width/height, or use px"), value11) : value11 / 100 * value12;
          }
          let value10 = Number(value8);
          if (Number.isFinite(value10))
            return value10;
        }, value2 = callback("x1"), value3 = callback("y1"), value4 = callback("x2"), value5 = callback("y2");
        if (value2 === void 0 || value3 === void 0 || value4 === void 0 || value5 === void 0)
          return this.errorAt(input, '<x-connector> needs x1 y1 x2 y2 (design px from the top-left of the slide or of its position:relative div), e.g. <x-connector x1="200" y1="540" x2="900" y2="540">'), !1;
        for (let value8 of [
          "left",
          "top",
          "right",
          "bottom",
          "width",
          "height"
        ])
          options[value8] !== void 0 && this.rejectAt(input, value8 + " does not apply to <x-connector> — its x1 y1 x2 y2 place it"), delete options[value8];
        options.transform !== void 0 && Object.keys(options.transform.value).length > 0 && this.rejectAt(input, "transform does not apply to <x-connector> — its x1 y1 x2 y2 place it"), delete options.transform;
        let value6 = clampShapeOutlineWidth(options.border), value7 = (0, runtime2.connectorBoundsFromEndpoints)([value2, value3], [value4, value5], value6);
        return (value7.left < 0 || value7.top < 0) && this.warnAt(input, "<x-connector> runs past the top/left edge of its box (including the " + String((0, runtime2.connectorArrowInset)(value6)) + "px head margin) — moved in to the edge"), options.left = {
          px: Math.max(0, value7.left)
        }, options.top = {
          px: Math.max(0, value7.top)
        }, options.width = {
          px: value7.w
        }, options.height = {
          px: value7.h
        }, options.position = "absolute", this.connectorFrom = value7.from, !0;
      }
      connector(input, options, context, value) {
        this.noContent(input);
        let state = {
          kind: "shape",
          shape: "connector"
        };
        for (let value6 of [
          "border",
          "color",
          "width",
          "height",
          "transform"
        ])
          value.add(value6);
        let value2 = this.connectorFrom !== void 0;
        if (value2)
          input.attrs.from !== void 0 && this.warnAt(input, "from is dropped when x1 y1 x2 y2 are given — the line runs from x1,y1 to x2,y2");
        else {
          let flag = !1, callback = (input2, options2) => {
            if (!(input2 === void 0 || input2 === "auto")) {
              if ("pct" in input2) {
                flag = !0, this.rejectAt(input, "<x-connector> " + options2 + ":" + String(input2.pct) + "% — only px here");
                return;
              }
              if (input2.px > 0)
                return input2.px;
            }
          }, value6 = callback(options.width, "width"), value7 = callback(options.height, "height");
          value6 !== void 0 && (state.w = value6), value7 !== void 0 && (state.h = value7), context.inContainer ? value6 === void 0 && value7 === void 0 && !flag && (options["flex-grow"] ?? 0) === 0 && this.warnAt(input, "flow <x-connector> without width/height (or flex:1) — drawn 240px wide") : (value6 === void 0 && context.fill?.x !== !0 || value7 === void 0 && context.fill?.y !== !0) && this.warnAt(input, "pinned <x-connector> without x1 y1 x2 y2 needs width and height (or left+right / top+bottom)");
          let value8 = (input.attrs.from ?? "tl").trim().toLowerCase();
          runtime2.connectorCornerValues.includes(value8) ? value8 !== "tl" && (state.from = value8) : this.warnAt(input, 'from="' + (0, runtime2.compactDiagnosticValue)(input.attrs.from ?? "") + '" — from is tl, tr, bl or br (the corner the line starts at; using tl)'), options.transform !== void 0 && Object.keys(options.transform.value).length > 0 && this.rejectAt(input, "transform does not apply to <x-connector>");
        }
        let border = options.border;
        border !== void 0 && border.style !== "none" ? (state.stroke = border.color ?? options.color ?? context.inh.color ?? "#000000", state.strokeWidth = clampShapeOutlineWidth(border), border.style === "dashed" || border.style === "dotted" ? state.dashed = !0 : border.style !== void 0 && border.style !== "solid" && this.rejectAt(input, "<x-connector> lines are solid | dashed | dotted (" + border.style + ")"), border.sides !== void 0 && this.rejectAt(input, "<x-connector> border is the stroke: all sides (no border-top/right/bottom/left)")) : (state.stroke = options.color ?? context.inh.color ?? "#000000", state.strokeWidth = runtime2.defaultShapeStrokeWidth);
        let state2 = {}, value3 = (input.attrs.head ?? "end").trim().toLowerCase();
        runtime2.connectorHeadValues.includes(value3) ? state2.head = value3 : this.warnAt(input, 'head="' + (0, runtime2.compactDiagnosticValue)(input.attrs.head ?? "") + '" — head is end, both or none (using end)');
        for (let [value6, value7] of [
          ["head-start", "headStart"],
          ["head-end", "headEnd"]
        ]) {
          let value8 = input.attrs[value6]?.trim().toLowerCase();
          value8 !== void 0 && (runtime2.arrowHeadKindValues.includes(value8) ? state2[value7] = value8 : this.warnAt(input, value6 + '="' + (0, runtime2.compactDiagnosticValue)(input.attrs[value6] ?? "") + '" — ' + value6 + " is none, open or filled (using what head gives this end)"));
        }
        Object.assign(state, (0, runtime2.setConnectorArrowHeads)({}, (0, runtime2.connectorArrowHeads)(state2)));
        let value4 = (input.attrs.route ?? "straight").trim().toLowerCase();
        runtime2.connectorRoutingValues.includes(value4) ? value4 !== "straight" && (state.route = value4) : this.warnAt(input, 'route="' + (0, runtime2.compactDiagnosticValue)(input.attrs.route ?? "") + '" — route is straight, elbow, hv or vh (using straight)'), value2 && this.connectorFrom !== "tl" && (state.from = this.connectorFrom), this.connectorFrom = void 0;
        for (let value6 of [
          "background-color",
          "background-gradient",
          "box-shadow",
          "border-radius",
          "opacity",
          "filter",
          "padding-top",
          "padding-right",
          "padding-bottom",
          "padding-left",
          "overflow"
        ])
          value.add(value6), options[value6] !== void 0 && this.rejectAt(input, diagnosticCssPropertyName(value6) + " does not apply to <x-connector> (it carries color, border-width, border-style, head, route)");
        let value5 = this.place(options, "shape", context, input, value);
        return Object.keys(value5).length > 0 && (state.place = value5), this.leftovers(options, value, input, "<x-connector>"), state;
      }
      icon(input, options, context, value) {
        this.noContent(input);
        let value2 = (input.attrs.name ?? "").trim(), value3 = slideHtmlIconNames.find((input2) => input2.toLowerCase() === value2.toLowerCase().replace(/[-_\s]/g, ""));
        if (value3 === void 0) {
          let value9 = value2 === "" ? genericIconPlaceholderLabel : iconPlaceholderLabel(value2);
          this.rejectAt(input, (value2 === "" ? "<x-icon> has no name" : '<x-icon name="' + (0, runtime2.compactDiagnosticValue)(value2) + '"> is not an icon in this format') + ", so it is shown as the text " + value9 + " — use one of: " + slideHtmlIconNames.join(", "));
          let value10 = options.color ?? context.inh.color, state2 = {
            kind: "text",
            role: "body",
            text: value9,
            ...value10 !== void 0 ? {
              color: value10
            } : {}
          };
          for (let value13 of ["color", "width", "height"])
            value.add(value13);
          let value11 = this.paintBag(options, "text", input, value);
          Object.keys(value11).length > 0 && (state2.style = value11);
          let value12 = this.place(options, "icon", context, input, value);
          return Object.keys(value12).length > 0 && (state2.place = value12), this.leftovers(options, value, input, "<x-icon>"), state2;
        }
        let state = {
          kind: "icon",
          icon: value3
        };
        value.add("color"), value.add("width"), value.add("height");
        let value4 = options.color ?? context.inh.color;
        value4 !== void 0 && (state.color = value4);
        let callback = (input2, options2) => {
          if (!(input2 === void 0 || input2 === "auto")) {
            if ("pct" in input2) {
              this.rejectAt(input, "<x-icon> " + options2 + ":" + String(input2.pct) + "% — only px here");
              return;
            }
            if (input2.px > 0)
              return input2.px;
          }
        }, value5 = callback(options.width, "width"), value6 = callback(options.height, "height");
        value5 !== void 0 && (state.w = value5), value6 !== void 0 && (state.h = value6), value5 === void 0 && value6 !== void 0 ? state.w = value6 : value6 === void 0 && value5 !== void 0 && (state.h = value5);
        let value7 = this.paintBag(options, "icon", input, value);
        Object.keys(value7).length > 0 && (state.style = value7);
        let value8 = this.place(options, "icon", context, input, value);
        return Object.keys(value8).length > 0 && (state.place = value8), this.leftovers(options, value, input, "<x-icon>"), this.queueIcon(input, diagnosticHtmlTagLabel(input), state, context.faded === !0), state;
      }
      svg(dataset, options, context, value) {
        if (dataset.source === void 0) {
          this.errorAt(dataset, '<svg> is empty — an inline graphic needs content (or use <img src="file.svg">)');
          return;
        }
        if (dataset.source.length > runtime2.maxInlineSvgBytes) {
          this.errorAt(dataset, "<svg> is " + String(Math.round(dataset.source.length / 1024)) + " KB — inline graphics stay under " + String(Math.round(runtime2.maxInlineSvgBytes * 3 / 4 / 1024)) + " KB; simplify it or export a PNG");
          return;
        }
        let value2 = stripHtmlMarkup(dataset.source), value3 = validateSvgMarkup(value2, !0);
        if (value3 !== void 0) {
          this.errorAt(dataset, "<svg> " + value3);
          return;
        }
        let value4 = parseSvgDimensions(value2), value5 = value2, items = [];
        if (value4 !== void 0) {
          let callback3 = (input) => input !== void 0 && input !== "auto" && "px" in input && input.px > 0 ? input.px : void 0, state2 = {
            xmlns: svgNamespace
          };
          (value4.attrs["xmlns:xlink"] !== void 0 || /\bxlink:/.test(value2) || Object.keys(value4.attrs).some((input) => input.startsWith("xlink:"))) && (state2["xmlns:xlink"] = xlinkNamespace), ((value4.attrs.xmlns ?? svgNamespace) !== svgNamespace || (value4.attrs["xmlns:xlink"] ?? xlinkNamespace) !== xlinkNamespace) && items.push("a namespace an HTML page ignores");
          for (let [value18, value19] of Object.entries(value4.attrs)) {
            let value20 = value18.toLowerCase();
            if (value20 === "style" || value20 === "id" || value20 === "data-slots" || value20.startsWith("data-build-") || value20 === "xmlns" || value20 === "xmlns:xlink")
              continue;
            let value21 = value18.indexOf(":"), value22 = value18.startsWith("xmlns:");
            if (!/^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/.test(value18) || value22 && (value19 === "" || value18 === "xmlns:xmlns") || value21 > 0 && !value22 && value18.slice(0, value21) !== "xml" && value18.slice(0, value21) !== "xlink" && (value4.attrs["xmlns:" + value18.slice(0, value21)] ?? "") === "") {
              items.push("an attribute on the root that XML cannot read (" + value18 + ")");
              continue;
            }
            state2[value18] = value19.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "�");
          }
          let value15 = callback3(options.width), value16 = callback3(options.height);
          state2.width === void 0 && value15 !== void 0 && (state2.width = String(value15)), state2.height === void 0 && value16 !== void 0 && (state2.height = String(value16));
          let callback4 = (input) => input.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"), values = /* @__PURE__ */ new Set([
            "xml",
            ...Object.keys(state2).filter((input) => input.startsWith("xmlns:") && state2[input] !== "").map((input) => input.slice(6))
          ]), value17 = sanitizeSvgMarkup(value4.inner, values);
          items.push(...value17.said), value5 = "<svg" + Object.entries(state2).map(([input, input2]) => " " + input + '="' + callback4(input2) + '"').join("") + ">" + value17.xml + "</svg>", items.length > 0 && this.warnAt(dataset, "<svg> is drawn as an image, which is read as XML — respelled for it, meaning the same: " + [...new Set(items)].join(", ")), value17.open.length > 0 && this.warnAt(dataset, "<svg> will not draw: an image is read as XML, where " + value17.open.join("; ") + (value17.open.some((input) => input.endsWith("is never closed")) ? " — close every element (<line … />, with a space before /> after an unquoted value)" : ""));
        }
        let value6 = "data:image/svg+xml;base64," + utf8ToBase64(value5);
        if (value6.length > runtime2.maxInlineSvgBytes) {
          this.errorAt(dataset, "<svg> is " + String(Math.round(value2.length / 1024)) + " KB — inline graphics stay under " + String(Math.round(runtime2.maxInlineSvgBytes * 3 / 4 / 1024)) + " KB; simplify it or export a PNG");
          return;
        }
        let state = {
          kind: "img",
          alt: (dataset.attrs["aria-label"] ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
          src: value6,
          fit: "contain"
        };
        value.add("object-fit"), value.add("width"), value.add("height");
        let callback = (input) => {
          if (input === void 0)
            return;
          let value15 = /^\s*([\d.]+)(px)?\s*$/.exec(input);
          if (value15 && Number(value15[1]) > 0)
            return Number(value15[1]);
        }, callback2 = (input) => input !== void 0 && input !== "auto" && "px" in input && input.px > 0 ? input.px : void 0, value7 = callback2(options.width) ?? callback(dataset.attrs.width), value8 = callback2(options.height) ?? callback(dataset.attrs.height), value9 = /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value2), value10 = value9 && Number(value9[1]) > 0 && Number(value9[2]) > 0 ? Number(value9[2]) / Number(value9[1]) : void 0, value11 = context.fill?.x === !0, value12 = context.fill?.y === !0;
        value7 === void 0 && value8 !== void 0 && value10 !== void 0 && !value11 ? value7 = Math.round(value8 / value10) : value8 === void 0 && value7 !== void 0 && value10 !== void 0 && !value12 && (value8 = Math.round(value7 * value10)), value7 === void 0 && value8 === void 0 && !(value11 && value12) && (value10 !== void 0 ? (value11 || (value7 = 400), value12 || (value8 = Math.round((value7 ?? 400) * value10)), this.warnAt(dataset, "<svg> without width/height — sized " + (value7 !== void 0 ? "400px wide" : "to its frame") + " from its viewBox")) : this.warnAt(dataset, "<svg> without width/height or viewBox — give it width and height")), value7 !== void 0 && (state.w = value7), value8 !== void 0 && (state.h = value8);
        let value13 = this.paintBag(options, "img", dataset, value);
        Object.keys(value13).length > 0 && (state.style = value13);
        let value14 = this.place(options, "img", context, dataset, value);
        return Object.keys(value14).length > 0 && (state.place = value14), this.leftovers(options, value, dataset, "<svg>"), state;
      }
      embed(input, options, context, value) {
        if (context.inContainer) {
          this.errorAt(input, "<x-embed> sits at the slide level: give it position:absolute with left/top (or right/bottom), width and height");
          return;
        }
        let value2 = input.children.map((source) => source.kind === "text" ? source.text : "").join("");
        if (value2.trim() === "") {
          this.warnAt(input, "<x-embed> is empty and was left out — put the embed's HTML inside it");
          return;
        }
        if (value2.length > runtime2.maxHtmlEmbedBytes) {
          this.errorAt(input, "<x-embed> is " + String(Math.round(value2.length / 1024)) + " KB — an embed holds at most " + String(Math.round(runtime2.maxHtmlEmbedBytes / 1024)) + " KB of HTML");
          return;
        }
        context.fill?.x !== !0 && options.width === void 0 && this.warnAt(input, "<x-embed> needs width (or left and right)"), context.fill?.y !== !0 && options.height === void 0 && this.warnAt(input, "<x-embed> needs height (or top and bottom)"), value.add("width"), value.add("height");
        for (let value3 of Object.keys(options))
          value3 === "position" || value3 === "width" || value3 === "height" || value3 === "display" || (options[value3] !== void 0 && this.rejectAt(input, diagnosticCssPropertyName(value3) + " does not apply to <x-embed> (position, left/top/right/bottom, width, height only)"), value.add(value3));
        return this.leftovers(options, value, input, "<x-embed>"), {
          kind: "html",
          html: value2
        };
      }
      cellContent(input) {
        let callback = (input2) => input2 === "x-shape" || input2 === "x-icon" || input2 === "x-connector", callback2 = (source) => source.kind === "text" ? source.text.trim() !== "" : source.tag === "x-icon" && (source.attrs.name ?? "").trim() !== "" ? !0 : source.tag === "img" ? (source.attrs.alt ?? "").trim() !== "" : mediaHtmlElementNames.has(source.tag) && !callback(source.tag) ? !1 : source.children.some(callback2), value = " inside <" + input.tag + "> — a table cell holds text only, so it is ", callback3 = (source) => {
          if (source.kind === "text")
            return [source];
          let callback4 = (input2) => ({
            kind: "text",
            text: " " + input2 + " ",
            line: source.line,
            col: source.col
          });
          if (source.tag === "x-icon") {
            let value5 = (source.attrs.name ?? "").trim(), value6 = source.children.flatMap(callback3);
            this.cellRemovals++;
            let value7 = value5 !== "" ? iconPlaceholderLabel(value5) : value6.some(callback2) ? "" : genericIconPlaceholderLabel;
            return this.rejectAt(source, "<x-icon>" + value + (value7 === "" ? "left out (what is inside it is kept)" : "shown as the text " + value7 + "; write " + (value5 === "" ? "a" : "the") + " word, or a character such as ✓, in the cell")), [callback4(value7), ...value6, callback4("")];
          }
          if (!mediaHtmlElementNames.has(source.tag))
            return [
              {
                ...source,
                children: source.children.flatMap(callback3)
              }
            ];
          let value2 = callback(source.tag) ? source.children.flatMap(callback3) : [];
          this.cellRemovals++;
          let value3 = source.tag === "img" ? (0, runtime2.truncateUtf16Safely)((source.attrs.alt ?? "").trim(), 120) : "", value4 = value3 !== "" ? "[image: " + value3 + "]" : value2.some(callback2) ? "" : elementPlaceholderLabel(source);
          return this.rejectAt(source, "<" + source.tag + ">" + value + (value4 !== "" ? "shown as the text " + value4 : "left out (what is inside it is kept)") + "; put it outside the table"), [callback4(value4), ...value2, callback4("")];
        };
        return {
          ...input,
          children: input.children.flatMap(callback3)
        };
      }
      table(input, options, context, value) {
        let items = [], items2 = [], callback = (input2) => {
          for (let value8 of input2.children) {
            if (value8.kind === "text") {
              value8.text.trim() !== "" && this.errorAt(value8, "text directly inside <" + input2.tag + "> — use <tr><td>");
              continue;
            }
            value8.tag === "tr" ? items2.push(value8) : value8.tag === "thead" || value8.tag === "tbody" || value8.tag === "tfoot" ? callback(value8) : value8.tag === "caption" || value8.tag === "colgroup" || value8.tag === "col" ? this.warnAt(value8, "<" + value8.tag + "> is not in this format — dropped") : this.errorAt(value8, "<" + value8.tag + "> inside <table> — rows are <tr> of <th>/<td>");
          }
        };
        if (callback(input), items2.length === 0) {
          this.errorAt(input, "<table> has no <tr> rows");
          return;
        }
        let items3 = [], flag = !0, count = 1, entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map(), state = {}, state2 = {}, items4 = [], value2, state3 = {
          n: 0
        }, values = /* @__PURE__ */ new Set(), rowColorUsed = !1, bandRows = [], cellFontSizes = [], entries3 = /* @__PURE__ */ new Map(), flag2 = !1, entries4 = /* @__PURE__ */ new Map(), callback2 = (input2, options2) => {
          let entry = entries4.get(options2);
          entry !== void 0 ? entry.n++ : entries4.set(options2, {
            n: 1,
            cell: input2
          });
        };
        items2.slice(0, runtime2.maxTableRows).forEach((input2, options2) => {
          let items5 = [];
          for (let value8 of input2.children) {
            if (value8.kind === "text") {
              value8.text.trim() !== "" && this.errorAt(value8, "text directly inside <tr> — use <td>");
              continue;
            }
            value8.tag === "td" || value8.tag === "th" ? items5.push(value8) : this.errorAt(value8, "<" + value8.tag + "> inside <tr> — cells are <th>/<td>");
          }
          let rowBand = commonRowBackground(input2, items5);
          rowBand !== void 0 && (state2[String(options2)] = {
            background: rowBand
          }, bandRows.push(input2));
          let rowColor, cellTakesRowColor = (cell, cellStyle, background) => {
            let raw = cell.attrs.style ?? "";
            return cellStyle.color !== void 0 || cell.attrs.bgcolor !== void 0 || cell.attrs.background !== void 0 || !isPlainInlineStyle(raw) || cellColorDeclarationPattern.test(raw) ? !1 : !inlineStyleHasUnsafeBackground(raw) || singleHexColorDeclaration(raw, "background") === background && cellStyle["background-color"] === background;
          };
          if (input2.attrs.style !== void 0) {
            let value8 = parseInlineStyle(input2.attrs.style, this.warner(input2, "<tr> "), this.rejecter(input2, "<tr> "));
            typeof value8["background-color"] == "string" && (state2[String(options2)] = {
              background: value8["background-color"]
            });
            let rowBackground = rowBand ?? (input2.attrs.bgcolor === void 0 && input2.attrs.background === void 0 ? singleHexColorDeclaration(input2.attrs.style, "background") : void 0), rowTextColor = singleHexColorDeclaration(input2.attrs.style, "color");
            rowBackground !== void 0 && rowTextColor !== void 0 && (rowBand !== void 0 || value8["background-color"] === rowBackground) && value8.color === rowTextColor && items5.some((cell) => cellTakesRowColor(cell, parseInlineStyle(cell.attrs.style, () => {
            }, () => {
            }), rowBackground)) && (rowColor = {
              color: rowTextColor,
              on: rowBackground
            }), rowColor !== void 0 && (rowColorUsed = !0);
            let value9 = Object.keys(value8).filter((input3) => input3 !== "background-color" && !(input3 === "color" && rowColor !== void 0) && value8[input3] !== void 0);
            for (let value10 of value9)
              values.add(diagnosticCssPropertyName(value10));
            value9.length > 0 && callback2(input2, "tr-style");
          }
          options2 === 0 && !items5.every((input3) => input3.tag === "th") && (flag = !1), items5.forEach((input3, options3) => {
            (input3.attrs.colspan !== void 0 || input3.attrs.rowspan !== void 0) && this.rejectAt(input3, "<" + input3.tag + "> colspan/rowspan are not in this format (the cell would be unmerged; split the table or repeat the text)");
            let value8 = this.warner(input3, "<" + input3.tag + "> "), value9 = parseInlineStyle(input3.attrs.style, value8, this.rejecter(input3, "<" + input3.tag + "> "));
            if (value9["text-align"] === "justify" ? value8("text-align: justify — table columns align left | center | right; kept left") : value9["text-align"] !== void 0 && (entries.has(options3) ? entries.get(options3) !== value9["text-align"] && value8("text-align differs from the first cell in this column (" + String(entries.get(options3)) + ") — alignment is per column; the first wins") : entries.set(options3, value9["text-align"])), value9.width !== void 0 && value9.width !== "auto" && options2 === 0 && entries2.set(options3, value9.width), input3.attrs.width !== void 0 && options2 === 0 && !entries2.has(options3)) {
              let value15 = /^(\d+(?:\.\d+)?)(%?)$/.exec(input3.attrs.width.trim());
              value15 && entries2.set(options3, value15[2] === "%" ? {
                pct: Number(value15[1])
              } : {
                px: Number(value15[1])
              });
            }
            cellFontSizes.push(typeof value9["font-size"] == "number" && hasOnlyPlainInlineChildren(input3) ? {
              tag: input3.tag,
              px: value9["font-size"]
            } : void 0);
            let cellColor = value9.color ?? (rowColor !== void 0 && cellTakesRowColor(input3, value9, rowColor.on) ? rowColor.color : void 0);
            cellColor !== void 0 && (state[String(options2) + "." + String(options3)] = {
              color: cellColor
            });
            let callback3 = (input4, options4) => input4 === void 0 && options4 === void 0 ? void 0 : Math.max(input4 ?? options4, options4 ?? input4), value10 = callback3(value9["padding-top"], value9["padding-bottom"]), value11 = callback3(value9["padding-left"], value9["padding-right"]);
            (value10 !== void 0 || value11 !== void 0) && (Math.max(value10 ?? 0, value11 ?? 0) > runtime2.maxGridGap ? callback2(input3, "padding-max") : items4.push({
              cell: input3,
              ...value11 !== void 0 ? {
                x: value11
              } : {},
              ...value10 !== void 0 ? {
                y: value10
              } : {}
            })), options2 === 0 && input3.tag === "th" && typeof value9["font-weight"] == "number" && (value2 === void 0 ? value2 = value9["font-weight"] : value9["font-weight"] !== value2 && (state3.n++, state3.cell ??= input3));
            for (let value15 of Object.keys(value9))
              value15 === "text-align" || value15 === "width" || value15 === "color" || value15.startsWith("padding-") || value9[value15] !== void 0 && (value15 === "font-weight" && input3.tag === "th" || value15 === "background-color" && rowBand !== void 0 || callback2(input3, value15));
            let value12 = this.inline(this.cellContent(input3), input3);
            value12.say();
            let { text: value13, marks: value14 } = value12;
            value14.length > 0 && !flag2 && (flag2 = !0, this.warnAt(input3, "bold/italic/underline/links inside table cells are not kept (plain text) — emphasise a cell with color, or pull the row out as its own element")), this.textCaps(input3, value13, []), entries3.set(input3, value13);
          }), count = Math.max(count, items5.length), items3.push(items5);
        });
        let value3 = items4.find((input2) => input2.cell.tag === "td") ?? items4[0];
        if (value3 !== void 0 && (value3.x === 0 || value3.y === 0) && [...entries3.values()].some((input2) => input2.trim() !== "")) {
          let callback3 = (input2, options2) => input2 === void 0 ? options2 : input2 === 0 ? "0" : String(input2) + "px";
          this.lintAt(value3.cell, "<" + value3.cell.tag + "> padding " + callback3(value3.y, "0.35em") + " " + callback3(value3.x, "0.6em") + " is this table's cell padding, and every cell is ruled on all four sides here, so its text sits on a rule — drop the padding (cells pad 0.35em 0.6em by default) or give both axes some");
        }
        let value4 = value3 !== void 0 ? {
          ...value3.x !== void 0 ? {
            x: value3.x
          } : {},
          ...value3.y !== void 0 ? {
            y: value3.y
          } : {}
        } : void 0;
        if (value3 !== void 0) {
          let value8 = items4.filter((input2) => input2.x !== value3.x || input2.y !== value3.y), value9 = (value3.y !== void 0 ? String(value3.y) + "px" : "0.35em") + " " + (value3.x !== void 0 ? String(value3.x) + "px" : "0.6em");
          value8.length > 0 && this.warnAt(value8[0].cell, "<" + value8[0].cell.tag + "> padding differs from the table's cell padding (" + value9 + ", one per table, from the first padded <" + value3.cell.tag + ">)" + (value8.length > 1 ? " (×" + String(value8.length) + " cells in this table)" : ""));
        }
        state3.cell !== void 0 && flag && this.warnAt(state3.cell, "<th> font-weight differs from the first <th> (" + String(value2) + ") — one weight per header row" + (state3.n > 1 ? " (×" + String(state3.n) + " cells in this table)" : ""));
        let tableFontSize = options["font-size"] === void 0 ? commonTableFontSize(cellFontSizes) : void 0;
        if (tableFontSize !== void 0) {
          entries4.delete("font-size");
          let sizeText = String(tableFontSize.px) + "px";
          tableFontSize.header === void 0 ? this.warnAt(input, "<table> font-size " + sizeText + ", written on every cell, is read as the table's font-size — write it on the <table>, as a save does") : this.warnAt(input, "<td> font-size " + sizeText + " (headers " + String(tableFontSize.header) + "px) is read as the table's font-size, so the header is drawn at " + sizeText + " too — write one size on the <table>");
        }
        bandRows.length > 0 && this.warnAt(bandRows[0], "<tr> background written the same on every cell of the row is read as the row's background" + (bandRows.length > 1 ? " (×" + String(bandRows.length) + " rows in this table)" : "") + " — write it on the <tr>, as a save does");
        for (let [value8, value9] of entries4) {
          let value10 = value9.n > 1 ? " (×" + String(value9.n) + " cells in this table)" : "", value11 = value8 === "tr-style" ? "style on <tr> takes background: COLOR" + (rowColorUsed || values.has("color") ? ", and a #hex color beside one #hex background that is the row's only background" + (bandRows.length > 0 ? " (on the row, or the same on every cell)" : "") + ", in a plainly written style" : " only") + " — dropped " + [...values].slice(0, 4).join(", ") + " (style the table for the rest)" : value8 === "padding-max" ? "padding above " + String(runtime2.maxGridGap) + "px is not supported on table cells (they pad 0–" + String(runtime2.maxGridGap) + "px)" : value8 === "font-family" || value8 === "font-size" ? value8 + " on a cell is not supported — set it on the <table> (cells inherit)" : diagnosticCssPropertyName(value8) + " is not supported on table cells (only text-align, width, color, padding; font-weight on <th>); emphasise a cell with color, or pull the row out as its own element";
          this.rejectAt(value9.cell, (value8 === "tr-style" ? "" : "<" + value9.cell.tag + "> ") + value11 + (value8 === "tr-style" ? value10.replace("cells", "rows") : value10));
        }
        let overLimits = [
          items2.length > runtime2.maxTableRows ? String(items2.length) + " rows (a table shows at most " + String(runtime2.maxTableRows) + ")" : "",
          count > runtime2.maxTableColumns ? String(count) + " columns (a table shows at most " + String(runtime2.maxTableColumns) + ")" : ""
        ].filter((limit) => limit !== ""), fitsInSmallerTables = items2.length <= runtime2.maxTableRows && this.slideCells + items2.length * count <= runtime2.maxSlideTableCells;
        overLimits.length > 0 && this.errorAt(input, "this table has " + overLimits.join(" and ") + " — all of its data fits " + (fitsInSmallerTables ? "in smaller tables" : "if it is split across slides") + (fitsInSmallerTables && items2.length <= runtime2.maxTableColumns && count <= runtime2.maxTableRows ? ", or with its rows and columns swapped" : "")), count = Math.min(runtime2.maxTableColumns, count), this.countCells(input, Math.min(items3.length, runtime2.maxTableRows) * count);
        for (let value8 of items3) {
          let items5 = [];
          for (let index4 = 0; index4 < count; index4++)
            items5.push(value8[index4] !== void 0 ? entries3.get(value8[index4]) ?? "" : "");
          items.push(items5);
        }
        let state4 = {
          kind: "table",
          rows: items,
          cols: count,
          header: flag
        }, value5 = (0, runtime2.normalizeShapeVariant)(input.attrs["data-fit"]);
        value5 !== void 0 && (state4.fit = value5);
        let columnWidths = Array.from({
          length: count
        }, (input2, options2) => entries2.get(options2)).filter((width) => width !== void 0);
        if (columnWidths.length === count) {
          let value8 = columnWidths.map((input2) => "pct" in input2 ? input2.pct : input2.px), value9 = value8.reduce((input2, options2) => input2 + options2, 0);
          value9 > 0 && (state4.colWidths = value8.map((input2) => Math.max(1, Math.min(100, Math.round(input2 / value9 * 100)))));
        } else
          entries2.size > 0 && this.warnAt(input, "column widths apply only when EVERY cell in the first row has a width — equal columns used");
        entries.size > 0 && (state4.colAligns = Array.from({
          length: count
        }, (input2, options2) => ({
          left: "start",
          center: "center",
          right: "end"
        })[entries.get(options2) ?? "left"])), Object.keys(state).length > 0 && (state4.cellStyles = state), Object.keys(state2).length > 0 && (state4.rowStyles = state2), value4 !== void 0 && (state4.cellPadding = value4), value2 !== void 0 && flag && (state4.headerWeight = value2);
        let typeStyle = tableFontSize !== void 0 ? {
          ...options,
          "font-size": tableFontSize.px
        } : options, { eff: value6 } = this.typography(typeStyle, context.inh, "p", input), value7 = this.paintBag(options, "table", input, value);
        for (let value8 of [
          "font-family",
          "font-size",
          "font-weight",
          "font-style",
          "line-height",
          "letter-spacing",
          "text-align",
          "text-transform",
          "color",
          "text-decoration-line",
          "text-decoration-style",
          "text-decoration-color",
          "font-variant-numeric",
          "text-stroke-width",
          "text-stroke-color"
        ])
          value.add(value8);
        if (value.add("white-space"), options["white-space"] === "nowrap" && this.rejectAt(input, "white-space does not apply to <table> (cells wrap) — widen the column or shorten the word"), this.typeKeys(value7, options, value6, input), value6.color !== void 0 && (value7.color = value6.color), options["text-align"] !== void 0 && this.warnAt(input, "text-align on <table> — align cells instead (text-align on a cell sets its column)"), Object.keys(value7).length > 0 && (state4.style = value7), value.add("width"), value.add("height"), context.inContainer) {
          let value8 = this.place(options, "table", context, input, value);
          Object.keys(value8).length > 0 && (state4.place = value8);
        }
        return this.leftovers(options, value, input, "<table>"), state4;
      }
      dedupeDiags() {
        let values = /* @__PURE__ */ new Set(), callback = (input) => {
          let value3 = String(input.line) + ":" + String(input.col) + ":" + input.message;
          return values.has(value3) ? !1 : (values.add(value3), !0);
        }, value = this.warnings.filter(callback);
        this.warnings.length = 0, this.warnings.push(...value), values.clear();
        let value2 = this.errors.filter(callback);
        this.errors.length = 0, this.errors.push(...value2);
      }
      container(input, options, context, value) {
        let value2 = this.warner(input, "<div> "), value3 = this.inherit(options, context.inh, input);
        for (let value17 of [
          "font-family",
          "font-size",
          "font-weight",
          "font-style",
          "line-height",
          "letter-spacing",
          "text-align",
          "text-transform",
          "white-space",
          "color"
        ])
          value.add(value17);
        let items = [], items2 = [];
        for (let value17 of input.children) {
          if (value17.kind === "text") {
            value17.text.trim() !== "" && (this.warnAt(value17, "text directly inside <div> — wrapped in <p>"), items.push({
              kind: "el",
              tag: "p",
              attrs: /* @__PURE__ */ Object.create(null),
              children: [value17],
              line: value17.line,
              col: value17.col
            }));
            continue;
          }
          if (value17.tag === "aside") {
            this.errorAt(value17, "<aside> (speaker notes) must be a direct child of <section>");
            continue;
          }
          isOutOfFlowElement(value17) ? items2.push(value17) : items.push(value17);
        }
        let { layout: value4, isGrid: value5 } = this.layout(options, value, value2, this.styleRejecter(input));
        value.add("position"), value.add("display");
        let value6 = options.position !== void 0 && options.position !== "static";
        items2.length > 0 && !value6 && value2("has position:absolute children but is not position:relative — treated as position:relative (the children pin to this div)");
        let value7 = !value5 && value4.dir === "h" ? "h" : "v", value8 = context.faded === !0 || typeof options.opacity == "number" && options.opacity <= 0.5, value9 = this.paintBag(options, "stack", input, value), value10 = value9.backgroundColor !== void 0 || value9.backgroundGradient !== void 0 || value9.borderWidth !== void 0 || value9.borderTopWidth !== void 0 || value9.borderRightWidth !== void 0 || value9.borderBottomWidth !== void 0 || value9.borderLeftWidth !== void 0 || value9.boxShadow !== void 0;
        if (context.depth >= runtime2.maxNodeTreeDepth && !(items.length === 0 && items2.length === 0 && !value10)) {
          this.errorAt(input, "<div> nested too deep — at most " + String(runtime2.maxNodeTreeDepth - 1) + " levels of <div> inside a slide or positioned element");
          return;
        }
        let callback = (input2) => input2 !== void 0 && input2 !== "auto" && "px" in input2 && input2.px > 0 ? input2.px : void 0, value11 = context.inContainer ? {
          w: callback(options.width),
          h: callback(options.height)
        } : {
          w: context.box?.w ?? callback(options.width),
          h: context.box?.h ?? callback(options.height)
        }, callback2 = (input2, options2) => input2 !== void 0 && input2 !== "auto" && "pct" in input2 && context.parentGrid !== !0 && context.parentDir === options2 && (options["flex-grow"] === void 0 || options["flex-grow"] > 0), callback3 = (input2) => input2 !== void 0 && input2 !== "auto" && (!("px" in input2) || input2.px > 0), value12 = !context.inContainer || value11.w !== void 0 || value11.h !== void 0 || (options["flex-grow"] ?? 0) > 0 || callback3(options["min-height"]) || callback3(options["min-width"]) || options["min-width-fit"] !== void 0 || callback2(options.width, "h") || callback2(options.height, "v"), length = this.errors.length, items3 = [];
        for (let value17 of items2) {
          let state2 = {
            inh: value3,
            depth: context.depth + 1,
            inContainer: !1,
            faded: value8,
            nestedHost: context.layerGeom !== void 0
          };
          this.lifted = [];
          let value18 = this.frame(value17, state2, value11.w, value11.h, !0);
          value18 !== void 0 && items3.push({
            node: value18.node,
            x: value18.x,
            y: value18.y,
            el: value17
          }), items3.push(...this.lifted), this.lifted = [];
        }
        let value13 = items3.length > 0 && context.layerGeom === void 0, state = {
          inh: value3,
          depth: context.depth + 1,
          parentDir: value7,
          parentGrid: value5,
          inContainer: !0,
          parentAlign: inheritedContainerStretchSources(value5, value4),
          parentBlock: inlineStyleSuppressesFlowLayout(elementInlineStyle(input)),
          flowCount: items.length,
          faded: value8
        }, items4 = [], items5 = [];
        for (let value17 of items) {
          let value18 = this.node(value17, state);
          value18 !== void 0 && (items4.push(value18), items5.push(value17));
        }
        this.bareTableShare(items5, items4, value7, value4.wrap === !0), this.loneShareAfterDrops(items, items5, items4, value7, value5);
        let value14 = items2.length > 0 && context.layerGeom !== void 0, artifactAttr = input.attrs["data-artifact"], artifact = value5 || value13 || value14 || items4.length === 0 ? void 0 : (0, runtime2.parseArtifactAddress)(artifactAttr);
        artifactAttr !== void 0 && artifact === void 0 && this.warnAt(input, 'data-artifact="' + (0, runtime2.compactDiagnosticValue)(artifactAttr) + `" dropped: it takes one artifact's address (https://claude.ai/artifact/…), on a <div> that holds something, is not a grid and has no position:absolute children`);
        let value15, hasPositiveGrow = (place) => typeof place == "object" && place !== null && "grow" in place && typeof place.grow == "number" && place.grow > 0, isEmptyFiller = (node) => node.kind === "spacer" ? !hasPositiveGrow(node.place) : node.kind === "stack" && node.style === void 0 && Array.isArray(node.children) && node.children.every(isEmptyFiller);
        if ((items4.length === 0 || !context.inContainer && items4.every(isEmptyFiller)) && !value13 && !value14 && !value10) {
          let grows = (options["flex-grow"] ?? 0) > 0;
          if (!grows && (!context.inContainer || input.attrs.hidden !== void 0 || parseInlineStyleUnchecked(input.attrs.style).some((declaration) => /^(position:fixed|display:contents)$/i.test(declaration.prop + ":" + declaration.value.trim())))) {
            this.errors.length === length && value2("empty and unpainted — dropped: it is pinned, hidden or display:contents, so it held no place (delete it, or give it a background to make a box)");
            return;
          }
          value15 = {
            kind: "spacer"
          };
          let axis = context.parentDir === "h" ? "width" : "height", axisSize = grows || context.parentGrid === !0 ? void 0 : options[axis], hasAxisSize = axisSize !== void 0 && axisSize !== "auto", percentAxis = hasAxisSize && axisSize !== void 0 && axisSize !== "auto" && "pct" in axisSize;
          percentAxis && axisSize !== void 0 && axisSize !== "auto" && "pct" in axisSize && (value.add(axis), value2(axis + ":" + String(axisSize.pct) + "% is ignored on an empty <div> (a percent along its parent's axis) — give it px, or flex:1 for a share"));
          let value17 = this.place(percentAxis ? {
            ...options,
            [axis]: void 0
          } : options, grows ? "spacer" : "stack", context, input, value);
          if (!grows) {
            if (context.parentGrid !== !0 && options["flex-shrink"] !== 0 && options[axis === "width" ? "min-width" : "min-height"] === void 0 && options[axis === "width" ? "max-width" : "max-height"] === void 0) {
              if (axisSize !== void 0 && axisSize !== "auto" && "px" in axisSize && axisSize.px > 0 && options["flex-basis"] === void 0) {
                for (let key of axis === "width" ? ["minW", "maxW"] : ["minH", "maxH"])
                  delete value17[key];
                value17.basis = axisSize.px;
              }
              axis === "height" && options["flex-shrink"] === void 0 && typeof value17.basis == "number" && value17.basis > 0 && (value17.shrink = 100);
            }
            let paddingX = (options["padding-left"] ?? 0) + (options["padding-right"] ?? 0), paddingY = (options["padding-top"] ?? 0) + (options["padding-bottom"] ?? 0);
            paddingX > (typeof value17.minW == "number" ? value17.minW : 0) && (value17.minW = paddingX), paddingY > (typeof value17.minH == "number" ? value17.minH : 0) && (value17.minH = paddingY);
            for (let key of ["minW", "maxW", "minH", "maxH"])
              value17[key] === 0 && delete value17[key];
            Object.assign(value17, context.parentGrid === !0 ? {
              grow: 1,
              basis: 0
            } : {
              grow: 0
            });
          }
          return Object.keys(value17).length > 0 && (value15.place = value17), this.leftovers(options, value, input, "an empty <div>"), value15;
        }
        if (value5 ? (value15 = {
          kind: "grid",
          columns: value4.columns,
          gap: value4.gap,
          children: items4
        }, value4.rows !== void 0 && (value15.rows = value4.rows), value4.alignItems !== void 0 && (value15.alignItems = value4.alignItems), value4.justifyItems !== void 0 && (value15.justifyItems = value4.justifyItems)) : (value15 = {
          kind: "stack",
          dir: value7,
          align: value4.align ?? "stretch",
          gap: value4.gap,
          children: items4
        }, value4.justify !== void 0 && value4.justify !== "start" && (value15.justify = value4.justify), value4.wrap === !0 && value7 === "h" && (value15.wrap = !0), value4.reverse && items4.reverse()), value4.rowGap !== void 0 && (value15.rowGap = value4.rowGap), Object.keys(value9).length > 0 && (value15.style = value9), artifact !== void 0 && value15.kind === "stack" && (value15.artifact = artifact), value13 || value14) {
          let value17;
          if (value13 && items4.length === 1 && Object.keys(value9).length === 0 && !value5 && !value12 && items4[0].kind !== "overlay" && items4[0].kind !== "spacer" ? (value17 = items4[0], (value4.gap !== 0 || value4.justify !== void 0) && value2("gap/justify on an overlay host with one child are ignored")) : (value17 = value15, items4.length === 0 && context.inContainer && value11.w === void 0 && value11.h === void 0 && (options["flex-grow"] ?? 0) === 0 && options["min-height"] === void 0 && value2("position:relative host with no flow child — the positioned children sit over an empty box; give the div width and height")), context.layerGeom === void 0)
            for (let value20 of items3)
              value20.node.kind === "table" && (value20.y = this.tableHeightHeal(value20.y, value11.h, value20.el));
          let value18 = typeof value9.opacity == "number" && value9.opacity <= 0.25;
          if (context.layerGeom === void 0 && !value18 && this.lintPinned(items3.map((input2) => ({
            el: input2.el,
            x: input2.x,
            y: input2.y,
            node: input2.node
          })), value11.w, value11.h, value9.backgroundGradient !== void 0 ? void 0 : typeof value9.backgroundColor == "string" && hexColorAlpha(value9.backgroundColor) > 0.1 ? hexColorAlpha(value9.backgroundColor) >= 0.8 ? value9.backgroundColor : void 0 : this.slideBg), value17.kind === "overlay") {
            this.errorAt(input, "a position:relative div cannot sit directly inside another one (overlay in overlay)");
            return;
          }
          if (context.layerGeom !== void 0) {
            for (let value20 of items3) {
              let value21 = combineNestedAxisSpecs(context.layerGeom.x, value20.x), value22 = combineNestedAxisSpecs(context.layerGeom.y, value20.y);
              if (value21 === "outer" || value22 === "outer") {
                this.errorAt(input, "position:absolute div inside a position:relative div: its positioned children are re-pinned to that div, which needs this div's " + (value21 === "outer" ? "width" : "height") + " — add it, or put them directly in the position:relative div");
                continue;
              }
              if (value21 === "inner" || value22 === "inner") {
                this.errorAt(value20.el, "pinned inside a position:absolute div that is itself inside a position:relative div — it is re-pinned to that div, which needs this element's " + (value21 === "inner" ? "width" : "height") + " when it uses right/bottom/centering; add it, pin it with left/top, or put it directly in the position:relative div");
                continue;
              }
              (value21.margin < 0 || value22.margin < 0) && (this.warnAt(value20.el, "re-pinned to the position:relative div, it starts " + String(Math.round(-Math.min(value21.margin, value22.margin))) + "px outside that div — clamped to its edge"), value21.margin = Math.max(0, value21.margin), value22.margin = Math.max(0, value22.margin)), this.lifted.push({
                node: value20.node,
                x: value21,
                y: value22,
                el: value20.el
              });
            }
            return this.warnAt(input, "position:absolute div inside a position:relative div — its positioned children are pinned to that div directly (flattened)"), value17 === value15 && Object.keys(value9).length === 0 && !value5 && items4.every((source) => source.kind === "spacer") ? void 0 : (this.place(options, "stack", context, input, value), this.leftovers(options, value, input, "<div>"), value17);
          }
          for (let value20 = items3.length - 1; value20 >= 0 && items3.length > runtime2.maxTextLineSpacing; value20--) {
            let el2 = items3[value20].el;
            el2.tag !== "x-icon" || (el2.attrs.name ?? "").trim() !== "" || (this.rejectAt(el2, "<x-icon> has no name and its box already holds " + String(runtime2.maxTextLineSpacing) + " positioned children, so it is left out"), items3.splice(value20, 1));
          }
          if (items3.length > runtime2.maxTextLineSpacing) {
            this.errorAt(input, "more than " + String(runtime2.maxTextLineSpacing) + " positioned children in one div (" + String(items3.length) + ") — split them across sibling position:relative divs, or pin some to the slide");
            return;
          }
          let state2 = {
            kind: "overlay",
            base: value17,
            layers: items3.map((input2) => ({
              node: input2.node,
              x: input2.x,
              y: input2.y
            }))
          };
          if (input.attrs["data-group"] !== void 0) {
            state2.group = !0;
            let value20 = value17;
            value17 === value15 && value20.kind === "stack" && value20.children?.length === 0 && value20.style !== void 0 && (state2.style = value20.style, delete value20.style);
          }
          let value19 = this.place(options, "stack", context, input, value);
          if (value17 === value15 && context.inContainer) {
            let value20 = context.parentGrid === !0, callback4 = (input2, options2) => {
              let value21 = input2 === "width" ? value19.minW : value19.minH;
              return options2 === void 0 || context.parentBlock === !0 || inlineStyleHasPercentSize(input.attrs.style, input2) || !(typeof value21 == "number" && value21 > 0) && !nodeHasExplicitAxisSize(value15, input2 === "width" ? "x" : "y");
            };
            value19.alignSelf === void 0 && callback4(value20 || context.parentDir === "h" ? "height" : "width", value20 ? context.parentAlign?.h : context.parentAlign?.w ?? context.parentAlign?.h) && (value19.alignSelf = "stretch"), value20 && value19.justifySelf === void 0 && callback4("width", context.parentAlign?.w) && (value19.justifySelf = "stretch");
          }
          return Object.keys(value19).length > 0 && (state2.place = value19), this.leftovers(options, value, input, "<div>"), state2;
        }
        input.attrs["data-group"] !== void 0 && (value15.group = !0);
        let value16 = this.place(options, "stack", context, input, value);
        return Object.keys(value16).length > 0 && (value15.place = value16), this.leftovers(options, value, input, "<div>"), value15;
      }
      layout(input, options, context, value) {
        for (let value5 of [
          "display",
          "flex-direction",
          "flex-wrap",
          "gap",
          "align-items",
          "justify-content",
          "justify-items",
          "grid-template-columns",
          "grid-template-rows"
        ])
          options.add(value5);
        let display = input.display, flag = !1;
        display === "grid" && (flag = !0);
        let value2 = input.gap ?? {
          row: 0,
          col: 0
        };
        if (flag) {
          let value5 = input["grid-template-columns"];
          value5 === void 0 && (value("display:grid needs a grid-template-columns this format reads (e.g. repeat(3, 1fr))"), value5 = [
            {
              fr: 1
            }
          ]), input["flex-direction"] !== void 0 && value("flex-direction does not apply to a grid"), input["flex-wrap"] === !0 && value("flex-wrap does not apply to a grid"), input["justify-content"] !== void 0 && value("justify-content does not apply to a grid (justify-items aligns cells; tracks size the row)");
          let state2 = {
            gap: value2.col,
            columns: value5
          };
          return value2.row !== value2.col && (state2.rowGap = value2.row), input["grid-template-rows"] !== void 0 && (state2.rows = input["grid-template-rows"]), input["align-items"] !== void 0 && input["align-items"] !== "stretch" && (state2.alignItems = input["align-items"]), input["justify-items"] !== void 0 && input["justify-items"] !== "stretch" && (state2.justifyItems = input["justify-items"]), {
            isGrid: !0,
            layout: state2
          };
        }
        let value3 = input["flex-direction"], value4, flag2 = !1;
        display === "flex" ? value4 = value3 === "column" || value3 === "column-reverse" ? "v" : "h" : value4 = value3 === "row" || value3 === "row-reverse" ? "h" : "v", (value3 === "row-reverse" || value3 === "column-reverse") && (flag2 = !0, context("flex-direction: *-reverse — children are reordered in the file instead (reverse is not stored)")), (input["grid-template-columns"] !== void 0 || input["grid-template-rows"] !== void 0) && value("grid-template-columns/rows need display:grid on the same element"), input["justify-items"] !== void 0 && value("justify-items applies to display:grid only (align-items / justify-content on a flex box)");
        let state = {
          dir: value4,
          reverse: flag2,
          gap: value4 === "h" ? value2.col : value2.row
        };
        return input["flex-wrap"] === !0 && (value4 === "h" && flag2 && context("flex-wrap with flex-direction: row-reverse is not in this format — reordered children wrap in a different line order; use flex-direction: row with justify-content: flex-end, or keep one line (wrapping kept, order reversed)"), value4 === "h" ? (state.wrap = !0, value2.row !== value2.col && (state.rowGap = value2.row)) : value("flex-wrap applies to a row (flex-direction: row), not a column")), input["align-items"] !== void 0 && (state.align = input["align-items"]), input["justify-content"] !== void 0 && (state.justify = input["justify-content"]), {
          isGrid: !1,
          layout: state
        };
      }
      frame(input, options, context, value, extra) {
        let value2 = this.styleWarner(input), value3 = parseInlineStyle(input.attrs.style, value2, this.styleRejecter(input), void 0, this.listEm(input, options));
        if (input.tag === "x-connector" && connectorHasExplicitEndpoints(input) && !this.connectorFrame(input, value3, context, value))
          return;
        let transform = value3.transform, callback = (input2, options2, context2, value12, extra2) => {
          let value13 = value3[input2], value14 = value3[options2], value15 = value3[context2], callback3 = (input3) => input3 === void 0 || input3 === "auto" || "px" in input3 && !("calcPct" in input3) && input3.px === 0 || "pct" in input3 && input3.pct === 0;
          if (value12 === void 0 && options.nestedHost !== !0 && !extra2 && callback3(value13) && callback3(value14) && !inlineStyleHasUnsafeSizing(input.attrs.style, context2) && value15 !== void 0 && value15 !== "auto" && "pct" in value15 && value15.pct === 100)
            return {
              spec: {
                anchor: "fill",
                margin: 0,
                offset: 0
              },
              sizeless: !1
            };
          let percentPlacement = extra === !0 && value12 === void 0 && options.nestedHost !== !0 && dataRoleElementNames.has(input.tag) ? percentAxisPlacement(value13, value14, value15, extra2) : void 0;
          if (percentPlacement !== void 0 && !inlineStyleHasUnsafeSizing(input.attrs.style, context2, !0) && !input.children.some((child) => child.kind === "el" && isOutOfFlowElement(child)))
            return {
              spec: percentPlacement,
              sizeless: percentPlacement.sizePct !== void 0
            };
          let callback4 = (input3) => {
            this.rejectAt(input, "<" + input.tag + "> " + input3 + ": % inside a position:relative div whose " + context2 + " is not known — give the div " + context2 + ", or use px");
          }, callback5 = (input3, options3) => {
            if (!(input3 === void 0 || input3 === "auto"))
              return "calcPct" in input3 ? value12 === void 0 ? (callback4(options3), input3.px) : input3.calcPct / 100 * value12 + input3.px : "pct" in input3 ? value12 === void 0 ? (callback4(options3), input3.pct) : input3.pct / 100 * value12 : input3.px;
          }, value16;
          if (value15 !== void 0 && value15 !== "auto" && ("pct" in value15 ? value12 === void 0 ? (callback4(context2), value16 = value15.pct) : value16 = value15.pct / 100 * value12 : value16 = value15.px), extra2) {
            let index4 = 0;
            value13 !== void 0 && value13 !== "auto" && ("calcPct" in value13 ? (value13.calcPct !== 50 && value2(input2 + ": calc(" + String(value13.calcPct) + "% …) with translate(-50%) — only 50% centers; offset kept"), index4 = value13.px) : "pct" in value13 ? value13.pct !== 50 && (value12 === void 0 ? callback4(input2) : (value2(input2 + ": " + String(value13.pct) + "% with translate(-50%) — treated as an offset from center"), index4 = (value13.pct - 50) / 100 * value12)) : value12 === void 0 ? value2(input2 + ": " + String(value13.px) + "px with translate(-50%) — centering needs the div's " + context2 + " to place it; centered in the div instead") : (value2(input2 + ": " + String(value13.px) + "px with translate(-50%) centers the element at " + String(value13.px) + "px (not on the slide center) — kept as an offset"), index4 = value13.px - value12 / 2)), value14 !== void 0 && value2(options2 + " is ignored when centering with translate(-50%)");
            let state5 = {
              anchor: "center",
              margin: 0,
              offset: index4
            };
            return value16 !== void 0 && (state5.size = value16), {
              spec: state5,
              sizeless: value16 === void 0
            };
          }
          let value17 = callback5(value13, input2), value18 = callback5(value14, options2);
          if (value17 !== void 0 && value17 < 0 && (value2(input2 + ": " + String(value17) + "px — negative offsets are not in this format; clamped to 0 (the element starts at the edge)"), value17 = 0), value18 !== void 0 && value18 < 0 && (value2(options2 + ": " + String(value18) + "px — negative offsets are not in this format; clamped to 0 (the element starts at the edge)"), value18 = 0), value17 !== void 0 && value18 !== void 0) {
            if (value16 !== void 0 && value2(context2 + " is ignored when both " + input2 + " and " + options2 + " are set (they define the size)"), value17 === value18)
              return {
                spec: {
                  anchor: "fill",
                  margin: value17,
                  offset: 0
                },
                sizeless: !1,
                ...value12 !== void 0 ? {
                  resolved: value12 - 2 * value17
                } : {}
              };
            if (value12 === void 0) {
              value2(input2 + " and " + options2 + " inside a position:relative div whose " + context2 + " is not known — " + options2 + " dropped (give the div " + context2 + ", or set " + context2 + ")");
              let state5 = {
                anchor: "leading",
                margin: value17,
                offset: 0
              };
              return value16 !== void 0 && (state5.size = value16), {
                spec: state5,
                sizeless: value16 === void 0
              };
            }
            let value19 = value12 - value17 - value18;
            return value19 < 1 && value2(input2 + "/" + options2 + " leave no room (" + String(value19) + "px)"), {
              spec: {
                anchor: "leading",
                margin: value17,
                offset: 0,
                size: Math.max(1, value19)
              },
              sizeless: !1
            };
          }
          if (value18 !== void 0) {
            let state5 = {
              anchor: "trailing",
              margin: value18,
              offset: 0
            };
            return value16 !== void 0 && (state5.size = value16), {
              spec: state5,
              sizeless: value16 === void 0
            };
          }
          let state4 = {
            anchor: "leading",
            margin: value17 ?? 0,
            offset: 0
          };
          return value16 !== void 0 && (state4.size = value16), {
            spec: state4,
            sizeless: value16 === void 0
          };
        }, value4 = transform?.centerX === !0, value5 = transform?.centerY === !0, value6 = callback("left", "right", "width", context, value4), value7 = callback("top", "bottom", "height", value, value5), state = {
          ...value3
        };
        delete state.top, delete state.right, delete state.bottom, delete state.left;
        let tag = input.tag, value8 = tag === "img" || tag === "video" || tag === "x-shape" || tag === "x-connector" || tag === "x-icon" || tag === "hr" || tag === "svg" || tag === "x-embed";
        this.frameFill = {
          x: value6.spec.anchor === "fill",
          y: value7.spec.anchor === "fill"
        }, value8 ? (state.width !== void 0 && state.width !== "auto" && "pct" in state.width && (state.width = value6.spec.size !== void 0 ? {
          px: value6.spec.size
        } : "auto"), state.height !== void 0 && state.height !== "auto" && "pct" in state.height && (state.height = value7.spec.size !== void 0 ? {
          px: value7.spec.size
        } : "auto"), value6.spec.size !== void 0 && state.width === void 0 && (state.width = {
          px: value6.spec.size
        }), value7.spec.size !== void 0 && state.height === void 0 && (state.height = {
          px: value7.spec.size
        }), value6.spec.anchor === "fill" && delete state.width, value7.spec.anchor === "fill" && delete state.height) : (delete state.width, delete state.height);
        let state2 = {
          ...input,
          attrs: {
            ...input.attrs
          }
        };
        delete state2.attrs.style, input.attrs.style !== void 0 && inheritedInlineStyles.set(state2, input.attrs.style);
        let parseOverride = this.parseOverride;
        if (this.parseOverride = state, extra && input.tag === "x-embed") {
          this.errorAt(input, "<x-embed> sits at the slide level, not inside a position:relative div"), this.parseOverride = parseOverride, this.frameFill = void 0;
          return;
        }
        let callback2 = (input2, options2) => input2.spec.anchor === "fill" ? options2 !== void 0 ? options2 - 2 * input2.spec.margin : void 0 : input2.spec.size ?? input2.resolved, value9 = this.node(state2, {
          ...options,
          depth: options.depth,
          inContainer: !1,
          box: {
            w: callback2(value6, context),
            h: callback2(value7, value)
          },
          ...extra ? {
            layerGeom: {
              x: value6.spec,
              y: value7.spec
            }
          } : {}
        });
        if (this.parseOverride = parseOverride, value9 === void 0)
          return;
        if (input.tag === "x-icon" && value9.kind === "text" && Object.assign(value9, {
          wrap: "nowrap",
          fit: "none"
        }), value9.kind === "shape" && value9.shape === "line") {
          if (value6.spec.anchor !== "fill" && value6.spec.size === void 0 && typeof value9.w != "number") {
            let value12 = context ?? runtime2.SLIDE_WIDTH, value13 = value6.spec.margin ?? 0, value14 = Math.max(1, Math.round(value6.spec.anchor === "center" ? value12 : value12 - value13));
            value9.w = value14, value2("<hr> without width — drawn to the right edge (" + String(value14) + "px); set width to size it");
          }
          value6.spec.anchor !== "fill" && value6.spec.size === void 0 && typeof value9.w == "number" && (value6.spec.size = value9.w), value7.spec.anchor !== "fill" && value7.spec.size === void 0 && typeof value9.h == "number" && (value7.spec.size = value9.h);
        }
        value9.kind === "table" && !extra && (value7.spec = this.tableHeightHeal(value7.spec, value, input));
        let state3 = {
          id: "",
          x: value6.spec,
          y: value7.spec,
          node: value9
        }, value10 = (input.attrs.id ?? "").trim();
        value10 !== "" && (/^[\w-]{1,64}$/.test(value10) ? state3.id = value10 : value2('id="' + (0, runtime2.compactDiagnosticValue)(value10) + '" — letters, digits, - and _ only (up to 64) — a generated id is used'));
        let value11 = this.build(input, extra);
        return value11 !== void 0 && (state3.build = value11), state3;
      }
      parseOverride;
      frameFill;
      build(input, options) {
        let callback = (input2, options2) => {
          if (input2 === void 0)
            return;
          if (options) {
            this.warnAt(input, options2 + " applies to a slide's own positioned children, not inside a div — dropped");
            return;
          }
          let value3 = input2.trim().toLowerCase().split(/\s+/), value4 = value3[0] ?? "";
          if (!runtime2.buildEffectValues.includes(value4)) {
            this.warnAt(input, options2 + '="' + (0, runtime2.compactDiagnosticValue)(input2) + '" — effects: ' + runtime2.buildEffectValues.join(", ") + " [order 1–" + String(runtime2.maxBuildOrder) + "] [auto] — dropped");
            return;
          }
          let state2 = {
            effect: value4
          };
          for (let value5 of value3.slice(1))
            value5 === "auto" ? state2.auto = !0 : /^\d+$/.test(value5) ? state2.order = Math.max(1, Math.min(runtime2.maxBuildOrder, Number(value5))) : this.warnAt(input, options2 + ': "' + value5 + '" ignored (effect [order] [auto])');
          return state2;
        }, value = callback(input.attrs["data-build-in"], "data-build-in"), value2 = callback(input.attrs["data-build-out"], "data-build-out");
        if (value === void 0 && value2 === void 0)
          return;
        let state = {};
        return value !== void 0 && (state.in = value), value2 !== void 0 && (state.out = value2), state;
      }
    }, diagnosticCssPropertyName = (input) => diagnosticCssPropertyNames[input] ?? input, diagnosticHtmlTagLabel = (input) => "tag" in input && typeof input.tag == "string" ? "<" + String(input.tag) + "> " : "", svgTagTokenPattern = (input) => input ? /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"<]*"|'[^'<]*'|[^\s"'<>=`]+))?)*)\s*(\/?)>/y : /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"<>]*"|'[^'<>]*'|[^\s"'<>=`]+))?)*)\s*(\/?)>/y, svgAttributeTokenPattern = (input) => input ? /(\s+)([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"<]*)"|'([^'<]*)'|([^\s"'<>=`]+)))?/g : /(\s+)([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'<>=`]+)))?/g, svgNamespace = "http://www.w3.org/2000/svg", xlinkNamespace = "http://www.w3.org/1999/xlink", isInvalidXmlCodePoint = (input) => input < 32 ? input !== 9 && input !== 10 && input !== 13 : input === 65534 || input === 65535 || input >= 55296 && input <= 57343 || input > 1114111, elementInlineStyle = (input) => input.attrs.style ?? inheritedInlineStyles.get(input), estimatedGlyphWidthFactor = 0.5, estimatedLongWordWidthFactor = 0.55, iconPlaceholderLabel = (input) => "[icon: " + (0, runtime2.truncateUtf16Safely)(input, 40) + "]", genericIconPlaceholderLabel = "[icon]", elementPlaceholderLabel = (input) => input.tag === "x-shape" ? "[shape: " + ((0, runtime2.truncateUtf16Safely)((input.attrs.kind ?? "").trim(), 20) || "rect") + "]" : input.tag === "img" ? "[image]" : input.tag === "svg" ? "[drawing]" : input.tag === "x-connector" ? "[line]" : input.tag === "hr" ? "[rule]" : "[" + input.tag.replace(/^x-/, "") + "]", simpleCssColorSource = "(#[0-9a-f]{3,8}|rgba?\\([0-9., %]{1,40}\\)|[a-z]{3,24})", initializeHtmlCompiler = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeArtifactAddresses)(), (0, runtime2.initializeVideoLinks)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeSlideTypeScales)(), (0, runtime2.initializeCssValueParser)(), slideHtmlPrefixPattern = /^\s*(?:<!doctype|<html|<section|<\!--)/i, htmlVoidElementNames = /* @__PURE__ */ new Set([
        "br",
        "img",
        "hr",
        "link",
        "meta",
        "input",
        "source",
        "wbr",
        "col",
        "embed",
        "param",
        "track",
        "area",
        "base"
      ]), htmlRawTextElementNames = /* @__PURE__ */ new Set([
        "style",
        "script",
        "title",
        "textarea",
        "x-embed"
      ]), htmlBlockElementNames = /* @__PURE__ */ new Set([
        "p",
        "div",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "table",
        "section",
        "hr",
        "aside",
        "x-shape",
        "x-icon",
        "x-connector",
        "blockquote",
        "pre",
        "figure",
        "header",
        "footer",
        "nav",
        "main",
        "article"
      ]), htmlOptionalClosingElementNames = /* @__PURE__ */ new Set([
        "p",
        "li",
        "td",
        "th",
        "tr",
        "thead",
        "tbody",
        "tfoot",
        "option",
        "dt",
        "dd"
      ]), htmlNamedEntities = new Map(htmlNamedEntityTable.trim().split(/\s+/).map((entry) => {
        let colon = entry.indexOf(":");
        return [
          entry.slice(0, colon),
          String.fromCodePoint(...entry.slice(colon + 1).split(".").map((code) => parseInt(code, 16)))
        ];
      })), HtmlParseError = class extends Error {
        line;
        col;
        constructor(input, options, context) {
          super(input), this.line = options, this.col = context;
        }
      }, cssBoxSideNames = ["top", "right", "bottom", "left"], cssBorderSideWidthFields = {
        top: "borderTopWidth",
        right: "borderRightWidth",
        bottom: "borderBottomWidth",
        left: "borderLeftWidth"
      }, containerPaddingBounds = {
        lo: 0,
        hi: 512
      }, slideBoxShadowBounds = (0, runtime2.shadowSchemaBounds)(runtime2.stylePropertyRegistry.boxShadow.slidesValue), shapeStrokeBounds = {
        lo: 0,
        hi: runtime2.maxShapeStrokeWidth
      }, diagnosticCssPropertyNames = {
        "min-width-fit": "min-width",
        "background-gradient": "background",
        "background-image-src": "background: url()",
        "text-fill-transparent": "-webkit-text-fill-color",
        "text-fill-current": "-webkit-text-fill-color",
        "text-stroke-width": "-webkit-text-stroke",
        "text-stroke-color": "-webkit-text-stroke"
      }, connectorAttributeNames = /* @__PURE__ */ new Set([
        "x1",
        "y1",
        "x2",
        "y2",
        "head",
        "head-start",
        "head-end",
        "route",
        "from"
      ]), videoAttributeNames = /* @__PURE__ */ new Set([
        "src",
        "poster",
        "aria-label",
        "title",
        "alt",
        "width",
        "height",
        "autoplay",
        "loop",
        "muted",
        "playsinline",
        "preload",
        "data-video-start",
        "data-video-delay",
        "data-video-sound",
        "data-video-loop",
        "data-video-still",
        "data-video-at",
        "data-crop"
      ]), imageVideoAttributeNames = /* @__PURE__ */ new Set([
        "data-video",
        "data-video-start",
        "data-video-delay",
        "data-video-sound",
        "data-video-loop",
        "data-video-still",
        "data-video-at",
        ...runtime2.videoProviders.map((input) => "data-video-" + input)
      ]), textBoxLayoutStylePattern = /(?:^|;)\s*(?:display|gap|row-gap|column-gap|flex-direction|flex-wrap|align-items|justify-content|grid-template[\w-]*|grid-auto-[\w-]+)\s*:/i, blockTextElementNames = /* @__PURE__ */ new Set([
        "h1",
        "h2",
        "h3",
        "p",
        "ul",
        "ol",
        "table"
      ]), cssAlignmentMap = {
        "flex-start": "start",
        start: "start",
        center: "center",
        "flex-end": "end",
        end: "end",
        stretch: "stretch",
        baseline: "baseline",
        normal: "stretch",
        "self-start": "start",
        "self-end": "end",
        left: "start",
        right: "end"
      }, cssJustificationMap = {
        "flex-start": "start",
        start: "start",
        left: "start",
        center: "center",
        "flex-end": "end",
        end: "end",
        right: "end",
        "space-between": "between",
        "space-around": "around",
        "space-evenly": "evenly",
        normal: "start"
      }, genericFontFallbackKinds = {
        serif: "serif",
        "ui-serif": "serif",
        "sans-serif": "sans",
        "system-ui": "sans",
        "ui-sans-serif": "sans",
        monospace: "mono",
        "ui-monospace": "mono",
        "ui-rounded": "sans",
        cursive: "serif",
        fantasy: "sans",
        math: "serif",
        emoji: "sans",
        "-apple-system": "sans",
        blinkmacsystemfont: "sans"
      }, webSafeFontAliases = {
        georgia: {
          family: "Georgia",
          fallback: "serif",
          basic: !0
        },
        "times new roman": {
          family: "Times New Roman",
          fallback: "serif",
          basic: !0
        },
        times: {
          family: "Times New Roman",
          fallback: "serif",
          basic: !0
        },
        palatino: {
          family: "Palatino",
          fallback: "serif"
        },
        "palatino linotype": {
          family: "Palatino",
          fallback: "serif"
        },
        garamond: {
          family: "Garamond",
          fallback: "serif"
        },
        baskerville: {
          family: "Baskerville",
          fallback: "serif"
        },
        didot: {
          family: "Didot",
          fallback: "serif"
        },
        "book antiqua": {
          family: "Book Antiqua",
          fallback: "serif"
        },
        cambria: {
          family: "Cambria",
          fallback: "serif"
        },
        arial: {
          family: "Arial",
          fallback: "helvetica",
          basic: !0
        },
        helvetica: {
          family: "Helvetica",
          fallback: "helvetica"
        },
        "helvetica neue": {
          family: "Helvetica Neue",
          fallback: "helvetica"
        },
        verdana: {
          family: "Verdana",
          fallback: "sans",
          basic: !0
        },
        tahoma: {
          family: "Tahoma",
          fallback: "sans",
          basic: !0
        },
        "trebuchet ms": {
          family: "Trebuchet MS",
          fallback: "sans",
          basic: !0
        },
        "gill sans": {
          family: "Gill Sans",
          fallback: "sans"
        },
        futura: {
          family: "Futura",
          fallback: "sans"
        },
        avenir: {
          family: "Avenir",
          fallback: "sans"
        },
        "avenir next": {
          family: "Avenir Next",
          fallback: "sans"
        },
        optima: {
          family: "Optima",
          fallback: "sans"
        },
        calibri: {
          family: "Calibri",
          fallback: "sans"
        },
        "segoe ui": {
          family: "Segoe UI",
          fallback: "sans"
        },
        roboto: {
          family: "Roboto",
          fallback: "sans"
        },
        impact: {
          family: "Impact",
          fallback: "sans",
          basic: !0
        },
        "comic sans ms": {
          family: "Comic Sans MS",
          fallback: "sans",
          basic: !0
        },
        "brush script mt": {
          family: "Brush Script MT",
          fallback: "serif",
          basic: !0
        },
        "courier new": {
          family: "Courier New",
          fallback: "mono",
          basic: !0
        },
        courier: {
          family: "Courier New",
          fallback: "mono",
          basic: !0
        },
        menlo: {
          family: "Menlo",
          fallback: "mono"
        },
        monaco: {
          family: "Monaco",
          fallback: "mono"
        },
        consolas: {
          family: "Consolas",
          fallback: "mono"
        },
        "lucida console": {
          family: "Lucida Console",
          fallback: "mono"
        },
        "sf mono": {
          family: "SF Mono",
          fallback: "mono"
        }
      }, webSafeFallbackFaces = {
        sans: "Arial",
        helvetica: "Arial",
        serif: "Georgia",
        mono: "Courier New"
      }, specialGenericFontFaces = {
        cursive: "Brush Script MT",
        fantasy: "Impact"
      }, supportedSlideHtmlElementNames = /* @__PURE__ */ new Set([
        "h1",
        "h2",
        "h3",
        "p",
        "div",
        "ul",
        "ol",
        "table",
        "img",
        "video",
        "x-shape",
        "x-icon",
        "x-connector",
        "hr",
        "span",
        "aside",
        "section",
        "svg",
        "x-embed",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "figure",
        "pre",
        "header",
        "footer",
        "nav",
        "main",
        "article"
      ]), supportedInlineElementNames = /* @__PURE__ */ new Set([
        "b",
        "strong",
        "i",
        "em",
        "u",
        "a",
        "span",
        "br"
      ]), inlineFormatElementNames = /* @__PURE__ */ new Set(["b", "strong", "i", "em", "u"]), flattenableInlineElementNames = /* @__PURE__ */ new Set([
        "s",
        "code",
        "small",
        "sup",
        "sub",
        "mark",
        "del",
        "ins",
        "abbr",
        "cite",
        "q",
        "kbd",
        "var",
        "time",
        "label",
        "font",
        "big",
        "tt",
        "dfn",
        "samp",
        "wbr",
        "nobr"
      ]), unsafeSvgMarkupRules = [
        [/<script\b/i, "may not contain <script>"],
        [/<foreignObject\b/i, "may not contain <foreignObject>"],
        [/javascript:/i, "may not reference javascript:"],
        [
          /<(iframe|embed|object|video|audio)\b/i,
          "may not contain iframe/embed/object/video/audio"
        ],
        [
          /(?<![\w-])(?:xlink:)?href\s*=\s*(?:["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,])|(?!["'\s])(?!#|data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]))/i,
          'may only reference local ids (href="#…") or data:image/png|jpeg|gif|webp|avif — no URLs'
        ],
        [
          /@import|(?:-webkit-)?image-set\s*\(|\bsrc\s*\(|cross-fade\s*\(|url\(\s*(?:["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,])|(?!["'\s])(?!#|data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]))/i,
          "styles may not import or reference URLs"
        ],
        [
          /&[a-z][a-z0-9]{1,31};/i,
          "may not hold text that still reads as a named character reference after decoding: a name HTML does not have, or one written doubly (&amp;colon;) — write the character itself, or &#…;; the letters of a reference cannot be shown as text in an inline svg"
        ],
        [
          /<!ENTITY|<!DOCTYPE/i,
          "may not declare entities, or a doctype that has an internal subset"
        ]
      ], unsupportedSvgAnimationRules = [
        [
          /<(animate|set|animateMotion|animateTransform|animateColor)\b/i,
          "may not contain SMIL animation elements"
        ]
      ], nonRenderingSvgElementNames = /* @__PURE__ */ new Set([
        "style",
        "animate",
        "set",
        "animatemotion",
        "animatetransform",
        "animatecolor"
      ]), forbiddenSvgElementNames = /* @__PURE__ */ new Set([
        "style",
        "script",
        "foreignobject",
        "iframe",
        "embed",
        "object",
        "video",
        "audio",
        "animate",
        "set",
        "animatemotion",
        "animatetransform",
        "animatecolor",
        "discard",
        "handler",
        "listener",
        "prefetch",
        "tref",
        "cursor",
        "b",
        "big",
        "blockquote",
        "body",
        "br",
        "center",
        "code",
        "dd",
        "div",
        "dl",
        "dt",
        "em",
        "embed",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "head",
        "hr",
        "i",
        "img",
        "li",
        "listing",
        "menu",
        "meta",
        "nobr",
        "ol",
        "p",
        "pre",
        "ruby",
        "s",
        "small",
        "span",
        "strong",
        "strike",
        "sub",
        "sup",
        "table",
        "tt",
        "u",
        "ul",
        "var",
        "font",
        "math",
        "template",
        "html",
        "frame",
        "frameset",
        "form",
        "input",
        "button",
        "link",
        "base",
        "noscript",
        "xmp",
        "plaintext"
      ]), svgExternalResourceAttributes = /* @__PURE__ */ new Set([
        "src",
        "srcset",
        "srcdoc",
        "data",
        "action",
        "formaction",
        "poster",
        "ping",
        "codebase",
        "background",
        "longdesc",
        "manifest",
        "cite",
        "profile",
        "usemap",
        "dynsrc",
        "lowsrc"
      ]), htmlWindows1252CodePoints = {
        128: 8364,
        130: 8218,
        131: 402,
        132: 8222,
        133: 8230,
        134: 8224,
        135: 8225,
        136: 710,
        137: 8240,
        138: 352,
        139: 8249,
        140: 338,
        142: 381,
        145: 8216,
        146: 8217,
        147: 8220,
        148: 8221,
        149: 8226,
        150: 8211,
        151: 8212,
        152: 732,
        153: 8482,
        154: 353,
        155: 8250,
        156: 339,
        158: 382,
        159: 376
      }, htmlCompilerCounters = {
        fillWalks: 0,
        commentScans: 0
      }, inheritedInlineStyles = /* @__PURE__ */ new WeakMap(), dataRoleElementNames = /* @__PURE__ */ new Set(["div", "p", "h1", "h2", "h3", "ul", "ol"]), plainCellStylePropertyPattern = /^(background(-color)?|color|padding(-(top|right|bottom|left))?|text-align|vertical-align|width|height|font-(weight|size|style|family)|border(-(top|right|bottom|left))?(-(width|style|color))?|white-space|line-height|letter-spacing|text-transform)$/, cellColorDeclarationPattern = /(?:^|;)\s*color\s*:|fill-color/i, compileWarningCodes = [
        [/% of the parent is not supported inside a div/, "percent-width"],
        [
          /width:100%.* kept as (align|justify)-self:stretch|<hr> width:100% is not stored/,
          "width-stretch"
        ],
        [/px converted to/, "line-height-px"],
        [/pt converted to px/, "font-size-pt"],
        [/text directly inside <(div|section)> — wrapped in <p>/, "bare-text"],
        [
          /is not position:relative — treated as position:relative/,
          "overlay-host"
        ],
        [
          /its positioned children are pinned to that div directly/,
          "nested-layer-flattened"
        ],
        [/<hr> without width — drawn to the right edge/, "hr-width"],
        [/is ignored — a table is as tall as its rows/, "table-height"],
        [/<table> with no width, in a row beside boxes that share it/, "table-share"],
        [
          /background written the same on every cell of the row is read as the row's background/,
          "row-band"
        ],
        [
          /<table> font-size [\d.]+px, written on every cell, is read as the table's font-size/,
          "cells-font-size"
        ],
        [/\*-reverse — children are reordered/, "flex-reverse"],
        [/<img> without alt/, "img-alt"],
        [
          /<svg> is drawn as an image, which is read as XML — respelled for it/,
          "svg-xml"
        ],
        [/<video> without aria-label|<iframe> without title/, "video-label"],
        [/<img> without src/, "img-src"],
        [/<(img|video)> inside a div without width\/height/, "img-size"],
        [/flow <x-connector> without width\/height/, "connector-size"],
        [/gap\/justify on an overlay host/, "overlay-host"],
        [/empty and unpainted — dropped/, "empty-div"],
        [
          /^(class|title|role|lang|dir|tabindex|draggable|contenteditable|aria-[\w-]+|data-[\w-]+) attribute is not in this format/,
          "attribute"
        ],
        [/^data-text dropped, so/, "data-text"],
        [/ applies to a section's position:absolute children only/, "flow-id"],
        [/<br> inside <li>/, "li-br"],
        [
          /is ignored when both .* are set \(they define the size\)/,
          "size-with-edges"
        ],
        [
          /layout properties \(display\/gap\/padding\) do nothing/,
          "section-layout"
        ],
        [/table font-size/, "table-size"],
        [/text-align on <table>/, "table-align"],
        [
          /text-align differs from the first cell in this column/,
          "table-align"
        ],
        [/padding differs from the table's cell padding/, "table-padding"],
        [/font-weight differs from the first <th>/, "table-header-weight"],
        [/column widths apply only when EVERY/, "table-widths"],
        [/display:none — the element is removed/, "display-none"],
        [/text-decoration style\/color without a line/, "text-decoration"],
        [/is dropped \(scripts never run here\)/, "event-attribute"],
        [/<link rel="\w+"> is not in this format/, "head-link"],
        [/style on <aside> is ignored/, "aside-style"],
        [/duplicate id .* on this slide/, "duplicate-id"],
        [/id=".*" — letters, digits/, "bad-id"],
        [/is not a usable family name/, "font-family-name"],
        [/is declared twice/, "font-declared-twice"],
        [/names no basic face/, "font-web-safe"],
        [/: % of the parent is not supported/, "percent-width"],
        [
          /text-shadow is not drawn on gradient\/image text/,
          "text-fill-shadow"
        ]
      ], importedHtmlTypeScale = {
        h1: {
          size: 96,
          weight: 600,
          lh: 1.1
        },
        h2: {
          size: 64,
          weight: 600,
          lh: 1.15
        },
        h3: {
          size: 44,
          weight: 600,
          lh: 1.2
        },
        p: {
          size: 32,
          weight: 400,
          lh: 1.4
        }
      }, htmlHeadingNames = /* @__PURE__ */ new Set(["h1", "h2", "h3"]), slideHtmlIconNames = runtime2.slideIconNames.filter((input) => input !== "Ant" && input !== "Owl"), mediaHtmlElementNames = /* @__PURE__ */ new Set([
        "x-shape",
        "x-connector",
        "img",
        "video",
        "svg",
        "x-embed",
        "hr"
      ]), neutralHtmlShadowPresets = {
        subtle: {
          y: 2,
          blur: 8,
          color: "#0000001f"
        },
        medium: {
          y: 6,
          blur: 20,
          color: "#00000029"
        },
        strong: {
          y: 12,
          blur: 40,
          color: "#0000003d"
        }
      }, htmlTagTextRoles = {
        h1: "h1",
        h2: "h2",
        h3: "h3",
        p: "body",
        span: "body",
        li: "body",
        ul: "body",
        ol: "body"
      }, transparentContainerBorderPattern = new RegExp("^(none|0|0px|\\d{1,2}(\\.\\d{1,2})?px solid " + simpleCssColorSource + ")$", "i"), noBorderPattern = /^(none|0|0px)$/i, transparentContainerFillPattern = new RegExp("^" + simpleCssColorSource + "$", "i"), transparentContainerStylePatterns = /* @__PURE__ */ new Map([
        ["width", /^(\d{1,4}(\.\d{1,2})?px|100%)$/i],
        ["height", /^(0|\d{1,4}(\.\d{1,2})?px)$/i],
        ["align-self", /^stretch$/i],
        ["border", noBorderPattern],
        ["border-top", transparentContainerBorderPattern],
        ["border-bottom", transparentContainerBorderPattern],
        ["border-left", noBorderPattern],
        ["border-right", noBorderPattern],
        ["background", transparentContainerFillPattern],
        ["background-color", transparentContainerFillPattern]
      ]), fontFaceRulesPattern = /@font-face\s*\{([^{}]*)\}/gi;
    });
  };
}
export {
  installCompilerHtml
};
