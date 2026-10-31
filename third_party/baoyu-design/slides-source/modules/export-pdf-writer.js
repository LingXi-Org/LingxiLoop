// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPdfWriter(runtime2) {
  var pdfWriterExports, pdfListNumberingNames, maxLosslessPageDimension, losslessCompressionRowsPerChunk, compressionTimeoutMessage, winAnsiExtraCodePoints, helveticaAsciiGlyphWidths, unicodeAstralGlyphCidStart, maxAstralPdfGlyphs, unicodeReplacementCodePoint, embeddedPdfFontBase64, compressedPdfCidToGidMapBase64, wideUnicodeGlyphRanges, defaultUnicodeGlyphWidth, rtlTextPattern, rtlCandidatePattern, unicodeLetterPatternForRtl, rtlTextClusterPattern, pdfEncodedSpaceOperands, encodeWinAnsiPdfText, maxPdfPageTextCharacters, pdfStructureRoles, pdfTextStructureRoles, pdfListNumberingKinds, pdfStructureRoleSet, pdfListNumberingKindSet, maxPdfStructureBlocks, pdfTableCellStructureRole, maxPdfFigureAltLength, noWordSpaceScriptPattern, maxPdfLinkLength, maxPdfAnnotations, maxPdfDocumentLinks, minPdfLinkSizePoints, latinLanguageWordLists, distinctiveLanguageScriptPatterns, japaneseScriptPattern, hanScriptPattern, koreanScriptPattern, latinScriptPattern, languageTagPattern, inferredScriptLanguages, maxPdfPages, minPdfPagePoints, maxPdfPagePoints, maxPdfTextCoordinate, initializePdfWriter;
  function pdfListNumbering(listStyle) {
    return pdfListNumberingNames[listStyle.trim().toLowerCase()];
  }
  function base64ToBytes(base64) {
    let binary = atob(base64), bytes = new Uint8Array(binary.length);
    for (let index4 = 0; index4 < binary.length; index4++)
      bytes[index4] = binary.charCodeAt(index4);
    return bytes;
  }
  function parseJpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216)
      throw Error("not a JPEG image (missing SOI marker)");
    let offset4 = 2;
    for (; ; ) {
      if (offset4 + 1 >= bytes.length)
        throw Error("not a valid JPEG image (no frame header found)");
      if (bytes[offset4] !== 255)
        throw Error("not a valid JPEG image (corrupt marker stream)");
      let value = offset4 + 1;
      for (; value < bytes.length && bytes[value] === 255; )
        value++;
      if (value >= bytes.length)
        throw Error("not a valid JPEG image (truncated)");
      let value2 = bytes[value];
      if (value2 === 1 || value2 >= 208 && value2 <= 215) {
        offset4 = value + 1;
        continue;
      }
      if (value2 === 217 || value2 === 218)
        throw Error("not a valid JPEG image (no frame header found)");
      if (offset4 + 3 >= bytes.length || value + 2 >= bytes.length)
        throw Error("not a valid JPEG image (truncated)");
      let value3 = bytes[value + 1] << 8 | bytes[value + 2];
      if (value3 < 2 || value + 1 + value3 > bytes.length)
        throw Error("not a valid JPEG image (truncated segment)");
      if (value2 === 192 || value2 === 193 || value2 === 194) {
        if (value3 < 8)
          throw Error("not a valid JPEG image (bad frame header)");
        let value4 = bytes[value + 3], value5 = bytes[value + 4] << 8 | bytes[value + 5], value6 = bytes[value + 6] << 8 | bytes[value + 7], value7 = bytes[value + 8];
        if (value4 !== 8)
          throw Error("unsupported JPEG (only 8-bit precision embeds)");
        if (value6 === 0 || value5 === 0)
          throw Error("not a valid JPEG image (zero size)");
        if (value7 !== 1 && value7 !== 3)
          throw Error("unsupported JPEG color layout (" + String(value7) + " components — only grayscale and RGB embed)");
        return {
          width: value6,
          height: value5,
          components: value7
        };
      }
      if (value2 >= 195 && value2 <= 207 && value2 !== 196 && value2 !== 200 && value2 !== 204)
        throw Error("unsupported JPEG variant (not baseline or progressive)");
      offset4 = value + 1 + value3;
    }
  }
  async function deflatePagePixels(context, width, height2, byteLimit = Number.POSITIVE_INFINITY, timeLimitMs = Number.POSITIVE_INFINITY) {
    if (!Number.isInteger(width) || !Number.isInteger(height2) || width < 1 || height2 < 1 || width > maxLosslessPageDimension || height2 > maxLosslessPageDimension)
      throw Error("cannot compress a page of " + String(width) + "×" + String(height2) + " pixels");
    if (typeof CompressionStream != "function")
      throw Error("this browser cannot compress page pixels");
    let startedAt = performance.now(), stream = new CompressionStream("deflate"), writer = stream.writable.getWriter(), reader = stream.readable.getReader(), chunks = [], compressedBytes = 0, processedRows = 0, overBudget = !1, reading = (async () => {
      for (; ; ) {
        let { done: value, value: value2 } = await reader.read();
        if (value)
          return;
        if (compressedBytes += value2.length, compressedBytes >= byteLimit || processedRows * 4 >= height2 && compressedBytes * (height2 / processedRows) > 2 * byteLimit) {
          overBudget = !0, await reader.cancel().catch(() => {
          });
          return;
        }
        chunks.push(value2);
      }
    })();
    reading.catch(() => {
    });
    try {
      for (let index4 = 0; index4 < height2 && !overBudget; index4 += losslessCompressionRowsPerChunk) {
        if (performance.now() - startedAt >= timeLimitMs)
          throw Error(compressionTimeoutMessage);
        let value = Math.min(losslessCompressionRowsPerChunk, height2 - index4);
        processedRows = index4 + value;
        let { data: value2 } = context.getImageData(0, index4, width, value);
        if (value2.length !== width * value * 4)
          throw Error("the canvas returned the wrong amount of pixel data");
        let value3 = new Uint8Array(width * value * 3);
        for (let index22 = 0, index32 = 0; index22 < value2.length; index22 += 4, index32 += 3) {
          let value4 = value2[index22 + 3];
          value4 === 255 ? (value3[index32] = value2[index22], value3[index32 + 1] = value2[index22 + 1], value3[index32 + 2] = value2[index22 + 2]) : (value3[index32] = Math.round((value2[index22] * value4 + 255 * (255 - value4)) / 255), value3[index32 + 1] = Math.round((value2[index22 + 1] * value4 + 255 * (255 - value4)) / 255), value3[index32 + 2] = Math.round((value2[index22 + 2] * value4 + 255 * (255 - value4)) / 255));
        }
        await writer.write(value3);
      }
      overBudget || await writer.close();
    } catch (value) {
      if (!overBudget)
        throw writer.abort(value).catch(() => {
        }), value;
    }
    if (await reading, overBudget) {
      writer.abort().catch(() => {
      });
      return;
    }
    let zlib = new Uint8Array(compressedBytes), offset4 = 0;
    for (let value of chunks)
      zlib.set(value, offset4), offset4 += value.length;
    return {
      width,
      height: height2,
      zlib
    };
  }
  function deflateWorstCaseBytes(byteLength) {
    return byteLength + Math.floor(byteLength / 4096) + Math.floor(byteLength / 16384) + Math.floor(byteLength / 33554432) + 13;
  }
  function validateLosslessPageImage(image, page) {
    if (typeof image != "object" || image === null)
      throw Error("its lossless picture is not an object");
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width !== page.width || image.height !== page.height)
      throw Error("its lossless picture is " + String(image.width) + "×" + String(image.height) + " pixels but its JPEG is " + String(page.width) + "×" + String(page.height));
    let zlib = image.zlib;
    if (Object.prototype.toString.call(zlib) !== "[object Uint8Array]" || zlib.length < 8 || zlib.length > deflateWorstCaseBytes(image.width * image.height * 3) || (zlib[0] & 15) !== 8 || zlib[0] >> 4 > 7 || (zlib[0] << 8 | zlib[1]) % 31 !== 0 || zlib[1] & 32)
      throw Error("its lossless picture is not a zlib stream of its pixels");
  }
  function winAnsiCodePoint(codePoint) {
    return codePoint >= 32 && codePoint <= 126 || codePoint >= 160 && codePoint <= 255 ? codePoint : winAnsiExtraCodePoints[codePoint];
  }
  function winAnsiGlyphWidth(code) {
    return code >= 32 && code <= 126 ? helveticaAsciiGlyphWidths[code - 32] : 556;
  }
  function encodeWinAnsiText(text) {
    let items = [], flag = !1;
    for (let value of text) {
      let value2 = value.codePointAt(0), value3 = winAnsiCodePoint(value2);
      value3 === void 0 ? items.push(32) : (items.push(value3), value3 !== 32 && (flag = !0));
    }
    if (flag)
      return items;
  }
  function escapePdfWinAnsiText(bytes) {
    let text = "";
    for (let value of bytes)
      value === 92 ? text += "\\\\" : value === 40 ? text += "\\(" : value === 41 ? text += "\\)" : value >= 32 && value <= 126 ? text += String.fromCharCode(value) : text += "\\" + value.toString(8).padStart(3, "0");
    return text;
  }
  function unicodePdfGlyphWidth(codePoint) {
    return codePoint >= 32 && codePoint <= 126 ? helveticaAsciiGlyphWidths[codePoint - 32] : wideUnicodeGlyphRanges.some(([input, input2]) => codePoint >= input && codePoint <= input2) ? 1e3 : defaultUnicodeGlyphWidth;
  }
  function unicodeHex4(code) {
    return code.toString(16).padStart(4, "0");
  }
  function encodeUnicodePdfText(text, glyphs) {
    let codes = [], hasText = !1;
    for (let value of text) {
      let value2 = value.codePointAt(0), value3;
      if (value2 < 32 || value2 >= 127 && value2 <= 159)
        value3 = 32;
      else if (value2 >= 55296 && value2 <= 57343)
        value3 = unicodeReplacementCodePoint, hasText = !0;
      else if (value2 > 65535) {
        let entry = glyphs.astral.get(value2);
        entry === void 0 && glyphs.astral.size < maxAstralPdfGlyphs && (entry = unicodeAstralGlyphCidStart + glyphs.astral.size, glyphs.astral.set(value2, entry)), value3 = entry ?? unicodeReplacementCodePoint, hasText = !0;
      } else
        value3 = value2, value.trim() !== "" && (hasText = !0);
      codes.push(value3), (value3 < unicodeAstralGlyphCidStart || value3 >= unicodeAstralGlyphCidStart + maxAstralPdfGlyphs) && glyphs.highBytes.add(value3 >> 8);
    }
    if (hasText)
      return codes;
  }
  function pdfCmapEntries(kind, entries) {
    let text = "";
    for (let index4 = 0; index4 < entries.length; index4 += 100) {
      let value = entries.slice(index4, index4 + 100);
      text += String(value.length) + " begin" + kind + `
` + value.join("") + "end" + kind + `
`;
    }
    return text;
  }
  function unicodeToPdfCmap(glyphs) {
    let ranges = [...glyphs.highBytes].sort((input, options) => input - options).map((input) => "<" + unicodeHex4(input << 8) + "> <" + unicodeHex4(input << 8 | 255) + "> <" + unicodeHex4(input << 8) + `>
`), astralMappings = [];
    for (let [value, value2] of glyphs.astral) {
      let value3 = value - 65536;
      astralMappings.push("<" + unicodeHex4(value2) + "> <" + unicodeHex4(55296 + (value3 >> 10)) + unicodeHex4(56320 + (value3 & 1023)) + `>
`);
    }
    return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <ffff>
endcodespacerange
` + pdfCmapEntries("bfrange", ranges) + pdfCmapEntries("bfchar", astralMappings) + `endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;
  }
  function pdfUnicodeFontObjects(firstObjectId, glyphs) {
    let objectReference = (input) => String(firstObjectId + input) + " 0 R", streamObject = (input, items) => [
      asciiPdfBytes(input + " /Length " + String(items.length) + ` >>
stream
`),
      items,
      asciiPdfBytes(`
endstream`)
    ], fontBytes = base64ToBytes(embeddedPdfFontBase64), widths = "/DW " + String(defaultUnicodeGlyphWidth) + " /W [32 [" + helveticaAsciiGlyphWidths.join(" ") + "] " + wideUnicodeGlyphRanges.map(([input, input2]) => String(input) + " " + String(input2) + " 1000").join(" ") + "]";
    return [
      [
        asciiPdfBytes("<< /Type /Font /Subtype /Type0 /BaseFont /Glyphless /Encoding /Identity-H /DescendantFonts [" + objectReference(1) + "] /ToUnicode " + objectReference(5) + " >>")
      ],
      [
        asciiPdfBytes("<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Glyphless /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor " + objectReference(2) + " " + widths + " /CIDToGIDMap " + objectReference(4) + " >>")
      ],
      [
        asciiPdfBytes("<< /Type /FontDescriptor /FontName /Glyphless /Flags 4 /FontBBox [0 -207 500 718] /ItalicAngle 0 /Ascent 718 /Descent -207 /CapHeight 718 /StemV 80 /FontFile2 " + objectReference(3) + " >>")
      ],
      streamObject("<< /Length1 " + String(fontBytes.length), fontBytes),
      streamObject("<< /Filter /FlateDecode", base64ToBytes(compressedPdfCidToGidMapBase64)),
      streamObject("<<", asciiPdfBytes(unicodeToPdfCmap(glyphs)))
    ];
  }
  function simpleRtlVisualOrder(text) {
    if (!rtlCandidatePattern.test(text))
      return;
    let clusters = text.match(rtlTextClusterPattern) ?? [];
    if (!clusters.some((input) => unicodeLetterPatternForRtl.test(input) && !rtlTextPattern.test(input)))
      return clusters.reverse().join("");
  }
  function createUnicodePdfTextEncoder(glyphs) {
    return (input) => {
      let value = simpleRtlVisualOrder(input), value2 = encodeUnicodePdfText(value ?? input, glyphs);
      if (value2 !== void 0)
        return {
          operand: "<" + value2.map(unicodeHex4).join("") + ">",
          em: value2.reduce((input2, options) => input2 + unicodePdfGlyphWidth(options), 0) / 1e3,
          reordered: value !== void 0
        };
    };
  }
  function preparePdfTextRuns(runs, pageIndex, pageWidth, pageHeight, warnings, encode, fontMode) {
    let index4 = 0, items = [], flag = !1;
    return runs.forEach((input, options) => {
      let value = flag && input.spaceBefore !== void 0 ? {
        ...input,
        spaceBefore: void 0
      } : input, value2 = "page " + String(pageIndex + 1) + " text run " + String(options + 1);
      if (typeof value.text != "string" || !Number.isFinite(value.xPt) || !Number.isFinite(value.yPt) || !Number.isFinite(value.sizePt) || !Number.isFinite(value.widthPt) || value.sizePt <= 0 || value.widthPt < 0 || value.sizePt > maxPdfPagePoints || value.widthPt > maxPdfTextCoordinate || Math.abs(value.xPt) > maxPdfTextCoordinate || Math.abs(value.yPt) > maxPdfTextCoordinate)
        throw Error(value2 + " is not a valid text run");
      if (fontMode && value.block !== void 0 && !(Number.isInteger(value.block) && value.block >= 0 && value.block < (encode?.length ?? 0) && encode?.[value.block] != null))
        throw Error(value2 + " names a block the page does not have");
      if (fontMode && value.block !== void 0 && encode?.[value.block]?.role === "Figure")
        throw Error(value2 + " points at block " + String(value.block + 1) + ", a figure, which can hold no text");
      if (fontMode && value.spaceBefore !== void 0 && typeof value.spaceBefore != "boolean")
        throw Error(value2 + " has a spaceBefore other than true or false (leave it out when unknown)");
      if (fontMode && value.link !== void 0 && !(Number.isInteger(value.link) && value.link >= 0))
        throw Error(value2 + " has link " + (typeof value.link == "string" ? JSON.stringify(value.link) : String(value.link)).slice(0, 20) + "; it must be a whole number, 0 or more");
      if (fontMode && value.item !== void 0 && !(Number.isInteger(value.item) && value.item >= 0 && value.item < maxPdfStructureBlocks))
        throw Error(value2 + " names a list item that is not a whole number from 0");
      let value3 = fontMode && value.block !== void 0 && encode?.[value.block]?.role === "Table" ? encode[value.block] : void 0;
      if (value3 !== void 0 && value.cell !== void 0 && !(Number.isInteger(value.cell) && value.cell >= 0 && value.cell < value3.rows * value3.cols))
        throw Error(value2 + " names table cell " + String(value.cell).slice(0, 20) + ", but block " + String(value.block + 1) + " is a " + String(value3.rows) + " × " + String(value3.cols) + " table whose cells are numbered 0 to " + String(value3.rows * value3.cols - 1));
      if (index4 += value.text.length, index4 > maxPdfPageTextCharacters)
        throw Error("page " + String(pageIndex + 1) + " has an implausibly large text layer");
      if (value.xPt > pageWidth || value.yPt < 0 || value.yPt > pageHeight || value.xPt + value.widthPt < 0) {
        flag = !0;
        return;
      }
      let value4 = value.sizePt < 5e-3 ? void 0 : warnings(value.text);
      if (value4 === void 0) {
        flag = !0;
        return;
      }
      flag = !1;
      let value5 = encode?.[value.block ?? -1]?.role;
      items.push({
        run: value,
        encoded: value4,
        block: value.block,
        item: value5 === "L" ? value.item ?? 0 : value5 === "Table" ? value.cell ?? 0 : void 0,
        link: fontMode && value5 !== "Artifact" ? value.link : void 0
      });
    }), items;
  }
  function pdfRunsNeedSpace(previousRun, run) {
    return run.spaceBefore !== void 0 ? run.spaceBefore && textSegmentsNeedSpace(previousRun.text, run.text, !0) : Math.abs(run.yPt - previousRun.yPt) >= 0.5 * Math.max(previousRun.sizePt, run.sizePt) && textSegmentsNeedSpace(previousRun.text, run.text, !1);
  }
  function pdfTextOperators(runs, pageIndex, fontMode, unicodeEncoder, warnings, knownLinks) {
    if (runs.length === 0)
      return {
        ops: "",
        marks: []
      };
    runs = runs.map((input) => input.link === void 0 || knownLinks.has(input.link) ? input : {
      ...input,
      link: void 0
    });
    let marks = [], operators = `BT
3 Tr
`, callback = (input, options) => options !== void 0 && input.block !== void 0 && options.block === input.block && options.item === input.item, callback2 = (input, options) => callback(input, options) && options.link === input.link;
    return runs.forEach((input, options) => {
      let { run: value, encoded: value2, block: value3, item: value4, link: value5 } = input, value6 = runs[options + 1];
      if (fontMode && !(options > 0 && callback2(runs[options - 1], input))) {
        options > 0 && (operators += `EMC
`);
        let value10 = value3 === void 0 ? "P" : unicodeEncoder[value3], value11 = value10 === "L" ? "LBody" : value10 === "Table" ? pdfTableCellStructureRole(warnings[value3], value4 ?? 0) : value10;
        value11 === "Artifact" ? operators += `/Artifact BMC
` : (operators += "/" + (value5 !== void 0 ? "Link" : value11) + " << /MCID " + String(marks.length) + ` >> BDC
`, marks.push({
          mcid: marks.length,
          block: value3,
          item: value4,
          link: value5
        }));
      }
      let value7 = fontMode && callback(input, value6) && value2.reordered !== !0 && pdfRunsNeedSpace(value, value6.run) ? pageIndex : void 0, value8 = value2.em * value.sizePt, value9 = value8 > 0 ? 100 * value.widthPt / value8 : 100;
      value9 = Math.max(10, Math.min(1e3, value9)), operators += "/F0 " + formatPdfNumber(value.sizePt) + ` Tf
` + formatPdfNumber(value9) + ` Tz
1 0 0 1 ` + formatPdfNumber(value.xPt) + " " + formatPdfNumber(value.yPt) + ` Tm
`, operators += value7 === void 0 ? value2.operand + ` Tj
` : "[" + value2.operand + " " + formatPdfNumber(value7.em * 1e3) + " " + value7.operand + `] TJ
`;
    }), {
      ops: operators + (fontMode ? `EMC
` : "") + `ET
`,
      marks
    };
  }
  function clipPdfBlockBounds(block, width, height2) {
    let box = block.box, [left, bottom, right, top] = [
      Math.max(0, box.xPt),
      Math.max(0, box.yPt),
      Math.min(width, box.xPt + box.widthPt),
      Math.min(height2, box.yPt + box.heightPt)
    ];
    if (!(right - left < 0.5 || top - bottom < 0.5))
      return {
        x0: left,
        y0: bottom,
        x1: right,
        y1: top
      };
  }
  function pdfFigureOperators(blocks, width, height2, nextMcid, tagged) {
    let marks = [], operators = "";
    return tagged ? ((blocks ?? []).forEach((input, options) => {
      if (input.role !== "Figure")
        return;
      let value = clipPdfBlockBounds(input, width, height2);
      if (value === void 0)
        return;
      let value2 = nextMcid + marks.length;
      marks.push({
        mcid: value2,
        block: options,
        item: void 0,
        link: void 0
      }), operators += "/Figure << /MCID " + String(value2) + ` >> BDC
` + [value.x0, value.y0, value.x1 - value.x0, value.y1 - value.y0].map(formatPdfNumber).join(" ") + ` re n
EMC
`;
    }), {
      ops: operators,
      marks
    }) : {
      ops: operators,
      marks
    };
  }
  function pdfFigureLinkBlocks(blocks, textRuns, width, height2) {
    let linkedTextIds = new Set(textRuns.map((input) => input.link).filter((input) => input !== void 0)), figureBlocksByLink = /* @__PURE__ */ new Map();
    return (blocks ?? []).forEach((input, options) => {
      input.role !== "Figure" || input.link === void 0 || linkedTextIds.has(input.link) || figureBlocksByLink.has(input.link) || clipPdfBlockBounds(input, width, height2) === void 0 || figureBlocksByLink.set(input.link, options);
    }), figureBlocksByLink;
  }
  function textSegmentsNeedSpace(previousText, text, explicit) {
    return previousText === "" || text === "" || /\s$/u.test(previousText) || /^\s/u.test(text) || !explicit && /[\-\u00ad\u2010-\u2014]$/u.test(previousText) ? !1 : !(noWordSpaceScriptPattern.test(previousText.slice(-1)) || noWordSpaceScriptPattern.test(text[0]));
  }
  function safePdfLinkUri(uri) {
    if (typeof uri != "string" || uri.length > maxPdfLinkLength)
      return;
    let value = uri.trim();
    if (!/^(?:https?:\/\/|mailto:)/i.test(value))
      return;
    let value2;
    try {
      let value3 = new URL(value);
      if (value3.protocol !== "http:" && value3.protocol !== "https:" && value3.protocol !== "mailto:" || value3.username !== "" || value3.password !== "" || value3.protocol === "mailto:" && value3.pathname === "")
        return;
      value2 = value3.href;
    } catch {
      return;
    }
    if (!(value2.length > maxPdfLinkLength || !/^[\x21-\x7e]+$/.test(value2)))
      return value2;
  }
  function pdfLinkAnnotations(links, width, height2, maximum, warn, objectId, anchorId) {
    let annotations = [], anchors = [];
    if (!Array.isArray(links))
      return {
        dicts: annotations,
        anchors
      };
    for (let value of links) {
      if (annotations.length >= maximum && warn(), annotations.length >= Math.min(maxPdfAnnotations, maximum))
        break;
      if (typeof value != "object" || value === null)
        continue;
      let value2 = safePdfLinkUri(value.uri);
      if (value2 === void 0 || !Number.isFinite(value.xPt) || !Number.isFinite(value.yPt) || !Number.isFinite(value.widthPt) || !Number.isFinite(value.heightPt))
        continue;
      let value3 = Math.max(0, value.xPt), value4 = Math.max(0, value.yPt), value5 = Math.min(width, value.xPt + value.widthPt), value6 = Math.min(height2, value.yPt + value.heightPt);
      if (value5 - value3 < minPdfLinkSizePoints || value6 - value4 < minPdfLinkSizePoints)
        continue;
      let value7 = value2.replace(/[\\()]/g, "\\$&"), value8 = typeof value.anchor == "number" && Number.isInteger(value.anchor) && value.anchor >= 0 ? value.anchor : void 0, value9 = value8 !== void 0 && anchorId !== void 0 ? anchorId(value8) : void 0;
      anchors.push(value8), annotations.push("<< /Type /Annot /Subtype /Link /Rect [" + [value3, value4, value5, value6].map(formatPdfNumber).join(" ") + "] /Border [0 0 0] /H /N /F 4 /A << /Type /Action /S /URI /URI (" + value7 + ") >>" + (objectId === void 0 ? "" : " /StructParent " + String(objectId + annotations.length) + " /Contents " + (value9 !== void 0 ? pdfStringOperand(value9) : "(" + value7 + ")")) + " >>");
    }
    return {
      dicts: annotations,
      anchors
    };
  }
  function guessTextLanguage(text) {
    let sample = text.slice(0, 2e5), count = (input) => (sample.match(input) ?? []).length, letterCount = count(/\p{L}/gu);
    if (letterCount < 10)
      return;
    let [japanese, han, korean] = [
      count(japaneseScriptPattern),
      count(hanScriptPattern),
      count(koreanScriptPattern)
    ], weightedLetterCount = letterCount + 2 * (japanese + han + korean), dominant = (input, options = 1) => input * options * 2 > weightedLetterCount;
    if (dominant(japanese + han, 3))
      return japanese >= 2 && japanese * 12 >= japanese + han ? "ja" : japanese * 12 < japanese + han && korean === 0 ? "zh" : void 0;
    if (dominant(korean, 3))
      return "ko";
    for (let [value2, value3] of distinctiveLanguageScriptPatterns)
      if (dominant(count(value3)))
        return value2;
    if (!dominant(count(latinScriptPattern)))
      return;
    let value = [
      ...scoreLatinLanguages(sample.toLowerCase().match(/\p{L}+/gu) ?? [])
    ].sort((input, options) => options[1] - input[1]), [items, items2] = [value[0], value[1]];
    if (items[1] >= 5 && items[1] >= 2 * items2[1])
      return items[0];
  }
  function scoreLatinLanguages(words) {
    return latinLanguageWordLists.map(([input, input2]) => {
      let values = new Set(input2.split(" "));
      return [
        input,
        words.reduce((input3, options) => input3 + (values.has(options) ? 1 : 0), 0)
      ];
    });
  }
  function isLanguageTag(tag) {
    return typeof tag == "string" && languageTagPattern.test(tag);
  }
  function documentLanguage(text, preferredLanguage = globalThis.navigator?.language) {
    let guessed = guessTextLanguage(text);
    if (guessed !== void 0)
      return guessed;
    if (!isLanguageTag(preferredLanguage))
      return "und";
    let [language, ...subtags] = preferredLanguage.toLowerCase().split("-"), script2 = subtags.find((input) => /^[a-z]{4}$/.test(input)), languageScript = language + (script2 === void 0 ? "" : "-" + script2[0].toUpperCase() + script2.slice(1)), value = text.slice(0, 2e5), length = (value.match(/\p{L}/gu) ?? []).length;
    if (length < 10)
      return languageScript;
    for (let [value2, value3, value4] of inferredScriptLanguages) {
      let length2 = (value.match(value2) ?? []).filter((input) => unicodeLetterPatternForRtl.test(input)).length;
      if (!(length2 * 2 <= length)) {
        if (!(script2 !== void 0 ? value3.toLowerCase().split(" ").includes(script2) : value4.split(" ").includes(language)) || language === "en" && (value.match(/[A-Za-z]/g) ?? []).length * 40 < length2 * 39)
          return "und";
        if (latinLanguageWordLists.some(([input]) => input === language)) {
          let value5 = value.toLowerCase().match(/\p{L}+/gu) ?? [], value6 = scoreLatinLanguages(value5), value7 = value6.find(([input]) => input === language)[1];
          if (value6.some(([, input]) => input > value7) || value5.length >= 30 && value7 * 16 < value5.length)
            return "und";
        }
        return languageScript;
      }
    }
    return "und";
  }
  function pdfHeadingStructureLevels(pages, textRuns) {
    let items = [];
    return textRuns.map((input, options) => {
      let value = (pages[options].blocks ?? []).map((input2) => input2.role), values = new Set(input.map((input2) => input2.block));
      return value.forEach((input2, options2) => {
        let value2 = values.has(options2) ? /^H([1-6])$/.exec(input2) : null;
        if (value2 === null)
          return;
        let value3 = Number(value2[1]);
        for (; items.length > 0 && items[items.length - 1] >= value3; )
          items.pop();
        items.push(value3), value[options2] = "H" + String(items.length);
      }), value;
    });
  }
  function pdfStructureTreeObjects(firstObjectId, pages, marks, roles, links, tagged, outlines, title, pageObjectId) {
    let value = firstObjectId, callback = () => value++, value2 = callback(), value3 = callback(), value4 = callback(), callback2 = (input) => String(input) + " 0 R", callback3 = (input, options, context, value5, extra = "") => "<< /Type /StructElem /S /" + input + " /P " + callback2(options) + " /Pg " + callback2(pageObjectId(context)) + extra + " /K " + value5 + " >>", callback4 = (items5) => items5.length === 1 ? String(items5[0]) : "[" + items5.join(" ") + "]", entries = /* @__PURE__ */ new Map(), items = [], items2 = [], items3 = [];
    pages.forEach((input, options) => {
      let value5 = callback();
      items.push(value5);
      let items5 = [], items6 = [], entries2 = /* @__PURE__ */ new Map(), items7 = [], entries3 = /* @__PURE__ */ new Map(), values = new Set([...marks[options].marks, ...roles[options].marks].map((input2) => input2.block)), values2 = new Set(outlines[options].filter((input2) => input2 !== void 0)), entries4 = /* @__PURE__ */ new Map();
      for (let [value6, value7] of title[options])
        values2.has(value6) && entries4.set(value7, value6);
      let entries5 = /* @__PURE__ */ new Map(), index4 = 0, callback5 = (input2) => {
        for (; index4 <= input2; index4++) {
          if (!values.has(index4))
            continue;
          let value6 = callback(), value7 = input.blocks[index4], value8 = value7.role === "Table" ? {
            rows: Array.from({
              length: value7.rows
            }, callback),
            cells: Array.from({
              length: value7.rows * value7.cols
            }, callback),
            mcids: Array.from({
              length: value7.rows * value7.cols
            }, () => [])
          } : void 0;
          entries2.set(index4, {
            obj: value6,
            mcids: [],
            items: /* @__PURE__ */ new Map(),
            table: value8
          });
          let entry = entries4.get(index4);
          if (entry === void 0) {
            items5.push(value6);
            continue;
          }
          let state = {
            obj: callback(),
            kids: [callback2(value6)],
            parent: value5
          };
          items7.push(state), entries3.set(entry, state), entries5.set(index4, state.obj), items5.push(state.obj);
        }
      }, callback6 = (input2, options2, context) => {
        if (input2.link === void 0) {
          context.push(input2.mcid), items6[input2.mcid] = options2;
          return;
        }
        let state = {
          obj: callback(),
          kids: [input2.mcid],
          parent: options2
        };
        items7.push(state), entries3.has(input2.link) || entries3.set(input2.link, state), context.push(callback2(state.obj)), items6[input2.mcid] = state.obj;
      };
      for (let value6 of marks[options].marks) {
        if (value6.block === void 0) {
          let value7 = callback();
          items5.push(value7);
          let items8 = [];
          callback6(value6, value7, items8), entries.set(value7, callback3("P", value5, options, callback4(items8)));
          continue;
        }
        callback5(value6.block);
        let entry = entries2.get(value6.block);
        if (entry.table !== void 0)
          callback6(value6, entry.table.cells[value6.item], entry.table.mcids[value6.item]);
        else if (value6.item === void 0)
          callback6(value6, entry.obj, entry.mcids);
        else {
          let entry2 = entry.items.get(value6.item);
          entry2 === void 0 && (entry2 = {
            li: callback(),
            body: callback(),
            mcids: []
          }, entry.items.set(value6.item, entry2)), callback6(value6, entry2.body, entry2.mcids);
        }
      }
      callback5((input.blocks?.length ?? 0) - 1);
      for (let value6 of roles[options].marks)
        entries2.get(value6.block).mcids.push(value6.mcid), items6[value6.mcid] = entries2.get(value6.block).obj;
      for (let [value6, value7] of entries2) {
        let value8 = links[options][value6];
        if (value8 === "Figure") {
          let value10 = input.blocks[value6], value11 = clipPdfBlockBounds(value10, input.widthPt, input.heightPt), value12 = typeof value10.alt == "string" ? sanitizeUnicodeMetadata(value10.alt, maxPdfFigureAltLength).trim() : "", value13 = value12 !== "" ? " /Alt " + pdfStringOperand(value12) : "";
          entries.set(value7.obj, callback3("Figure", entries5.get(value6) ?? value5, options, callback4(value7.mcids), value13 + " /A << /O /Layout /BBox [" + [value11.x0, value11.y0, value11.x1, value11.y1].map(formatPdfNumber).join(" ") + "] /Placement /Block >>"));
          continue;
        }
        if (value8 === "Table") {
          let { cols: value10 } = input.blocks[value6], value11 = input.blocks[value6].headerRows ?? 0, table = value7.table;
          entries.set(value7.obj, callback3("Table", value5, options, "[" + table.rows.map(callback2).join(" ") + "]")), table.rows.forEach((input2, options2) => {
            entries.set(input2, callback3("TR", value7.obj, options, "[" + table.cells.slice(options2 * value10, (options2 + 1) * value10).map(callback2).join(" ") + "]"));
            for (let index22 = 0; index22 < value10; index22++) {
              let value12 = options2 * value10 + index22, value13 = options2 < value11 ? " /A << /O /Table /Scope /Column >>" : "", value14 = table.mcids[value12];
              entries.set(table.cells[value12], value14.length === 0 ? "<< /Type /StructElem /S /" + (options2 < value11 ? "TH" : "TD") + " /P " + callback2(input2) + " /Pg " + callback2(pageObjectId(options)) + value13 + " >>" : callback3(options2 < value11 ? "TH" : "TD", input2, options, callback4(value14), value13));
            }
          });
          continue;
        }
        if (value8 !== "L") {
          entries.set(value7.obj, callback3(value8, value5, options, callback4(value7.mcids)));
          continue;
        }
        let numbering = input.blocks[value6].numbering, value9 = numbering == null ? "" : " /A << /O /List /ListNumbering /" + numbering + " >>";
        entries.set(value7.obj, callback3("L", value5, options, "[" + [...value7.items.values()].map((input2) => callback2(input2.li)).join(" ") + "]", value9));
        for (let value10 of value7.items.values())
          entries.set(value10.li, callback3("LI", value7.obj, options, "[" + callback2(value10.body) + "]")), entries.set(value10.body, callback3("LBody", value10.li, options, callback4(value10.mcids)));
      }
      let entries6 = /* @__PURE__ */ new Map();
      tagged[options].forEach((input2, options2) => {
        let value6 = "<< /Type /OBJR /Obj " + callback2(input2) + " /Pg " + callback2(pageObjectId(options)) + " >>", value7 = outlines[options][options2], value8 = value7 === void 0 ? void 0 : entries3.get(value7)?.obj;
        value8 !== void 0 ? entries6.set(value8, [...entries6.get(value8) ?? [], value6]) : (value8 = callback(), items5.push(value8), entries.set(value8, callback3("Link", value5, options, value6))), items3.push(String(pages.length + items3.length) + " " + callback2(value8));
      });
      for (let value6 of items7)
        entries.set(value6.obj, callback3("Link", value6.parent, options, callback4([...value6.kids, ...entries6.get(value6.obj) ?? []])));
      entries.set(value5, items5.length === 0 ? "<< /Type /StructElem /S /Sect /P " + callback2(value4) + " /Pg " + callback2(pageObjectId(options)) + " >>" : callback3("Sect", value4, options, "[" + items5.map(callback2).join(" ") + "]")), items2.push(String(options) + " [" + items6.map(callback2).join(" ") + "]");
    });
    let items4 = [];
    items4[value2 - firstObjectId] = "<< /Type /StructTreeRoot /K " + callback2(value4) + " /ParentTree " + callback2(value3) + " /ParentTreeNextKey " + String(pages.length + items3.length) + " >>", items4[value3 - firstObjectId] = "<< /Nums [" + [...items2, ...items3].join(" ") + "] >>", items4[value4 - firstObjectId] = "<< /Type /StructElem /S /Document /P " + callback2(value2) + " /K [" + items.map(callback2).join(" ") + "] >>";
    for (let [value5, value6] of entries)
      items4[value5 - firstObjectId] = value6;
    return {
      rootObj: value2,
      nextObj: value,
      bodies: items4
    };
  }
  function pdfOutlineObjects(firstObjectId, marks, roles, pageObjectId) {
    let items = [];
    if (marks.forEach((input, options) => {
      roles[options].some((input2, options2) => {
        if (!/^H[1-6]$/.test(input2))
          return !1;
        let text = "", value;
        for (let value2 of input)
          value2.block === options2 && (text += (value !== void 0 && pdfRunsNeedSpace(value, value2.run) ? " " : "") + value2.run.text, value = value2.run);
        return text = normalizePdfOutlineTitle(text, maxPdfPages), text === "" ? !1 : (items.push({
          page: options,
          title: text
        }), !0);
      });
    }), items.length === 0)
      return;
    let callback = (input) => String(input) + " 0 R", items2 = [
      "<< /Type /Outlines /First " + callback(firstObjectId + 1) + " /Last " + callback(firstObjectId + items.length) + " /Count " + String(items.length) + " >>"
    ];
    return items.forEach((input, options) => {
      let value = firstObjectId + 1 + options;
      items2.push("<< /Title " + pdfStringOperand(input.title) + " /Parent " + callback(firstObjectId) + (options > 0 ? " /Prev " + callback(value - 1) : "") + (options < items.length - 1 ? " /Next " + callback(value + 1) : "") + " /Dest [" + callback(pageObjectId(input.page)) + " /XYZ null null null] >>");
    }), {
      rootObj: firstObjectId,
      nextObj: firstObjectId + items2.length,
      bodies: items2
    };
  }
  function asciiPdfBytes(text) {
    let bytes = new Uint8Array(text.length);
    for (let index4 = 0; index4 < text.length; index4++) {
      let value = text.charCodeAt(index4);
      if (value > 127)
        throw Error("internal: non-ASCII in PDF structure");
      bytes[index4] = value;
    }
    return bytes;
  }
  function formatPdfNumber(value) {
    return String(Math.round(value * 100) / 100);
  }
  function sanitizePdfMetadataText(text, fontMode) {
    return fontMode === "winansi" ? Array.from(text.slice(0, 256), (input) => /^[\x20-\x7e]$/.test(input) ? input : " ").join("") : sanitizeUnicodeMetadata(text, 256);
  }
  function sanitizeUnicodeMetadata(text, maxLength) {
    return Array.from(text.slice(0, 2 * maxLength)).slice(0, maxLength).map((input) => {
      let value = input.codePointAt(0);
      return value < 32 || value >= 127 && value <= 159 ? " " : value >= 55296 && value <= 57343 ? String.fromCharCode(unicodeReplacementCodePoint) : input;
    }).join("");
  }
  function normalizePdfOutlineTitle(text, maxLength) {
    return sanitizeUnicodeMetadata(text.replace(/[\s\p{Cc}]+/gu, " ").trim(), maxLength).trimEnd();
  }
  function pdfStringOperand(text) {
    if (/^[\x20-\x7e]*$/.test(text))
      return "(" + text.replace(/[\\()]/g, "\\$&") + ")";
    let hex = "feff";
    for (let index4 = 0; index4 < text.length; index4++)
      hex += unicodeHex4(text.charCodeAt(index4));
    return "<" + hex + ">";
  }
  function pdfInfoTextOperand(text, fontMode) {
    if (text === "")
      return "";
    let sanitized = sanitizePdfMetadataText(text, fontMode);
    if (fontMode === "winansi" || Array.from(text).slice(0, 256).every((input) => /^[\x20-\x7e]$/.test(input)))
      return "(" + sanitized.replace(/[\\()]/g, "\\$&") + ")";
    let hex = "feff";
    for (let index4 = 0; index4 < sanitized.length; index4++)
      hex += unicodeHex4(sanitized.charCodeAt(index4));
    return "<" + hex + ">";
  }
  function pdfXmpMetadata(title) {
    let items = [
      "<dc:format>application/pdf</dc:format>",
      ...title === "" ? [] : [
        '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + ((input) => input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "�").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))(title) + "</rdf:li></rdf:Alt></dc:title>"
      ]
    ], value = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
` + items.join(`
`) + `
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`, value2 = new TextEncoder().encode(value);
    return [
      asciiPdfBytes("<< /Type /Metadata /Subtype /XML /Length " + String(value2.length) + ` >>
stream
`),
      value2,
      asciiPdfBytes(`
endstream`)
    ];
  }
  function jpegPagesToPdf(pages, options) {
    if (pages.length === 0)
      throw Error("nothing to export — no pages were produced");
    let value = pages.map((input, options2) => {
      if (!Number.isFinite(input.widthPt) || !Number.isFinite(input.heightPt) || input.widthPt < minPdfPagePoints || input.heightPt < minPdfPagePoints || input.widthPt > maxPdfPagePoints || input.heightPt > maxPdfPagePoints)
        throw Error("page " + String(options2 + 1) + " has an out-of-range page size");
      try {
        let value29 = parseJpegDimensions(input.jpeg);
        if (input.lossless != null && validateLosslessPageImage(input.lossless, value29), options?.tagged === !0 && input.blocks != null) {
          if (!Array.isArray(input.blocks))
            throw Error("its blocks are not a list");
          if (input.blocks.length > maxPdfStructureBlocks)
            throw Error("it has more than " + String(maxPdfStructureBlocks) + " blocks");
          let value30 = input.blocks.findIndex((input2) => typeof input2 != "object" || input2 === null || !pdfStructureRoleSet.has(input2.role));
          if (value30 >= 0)
            throw Error("block " + String(value30 + 1) + " has a role other than " + pdfStructureRoles.join(", "));
          let value31 = input.blocks.findIndex((input2) => input2.role === "Figure" && !(typeof input2.box == "object" && input2.box !== null && [
            input2.box.xPt,
            input2.box.yPt,
            input2.box.widthPt,
            input2.box.heightPt
          ].every((input3) => Number.isFinite(input3) && Math.abs(input3) <= maxPdfTextCoordinate) && (input2.alt === void 0 || typeof input2.alt == "string"))), value32 = input.blocks.findIndex((input2) => input2.role === "Table" && !(Number.isInteger(input2.cols) && Number.isInteger(input2.rows) && input2.cols >= 1 && input2.rows >= 1 && input2.cols * input2.rows <= maxPdfStructureBlocks && (input2.headerRows == null || Number.isInteger(input2.headerRows) && input2.headerRows >= 0 && input2.headerRows <= input2.rows)));
          if (value32 >= 0) {
            let value35 = input.blocks[value32], callback6 = (input2) => String(input2).slice(0, 20);
            throw Error("block " + String(value32 + 1) + " is a table with rows " + callback6(value35.rows) + ", cols " + callback6(value35.cols) + ", headerRows " + callback6(value35.headerRows) + ": rows and cols must be whole numbers from 1 with rows × cols at most " + String(maxPdfStructureBlocks) + ", and headerRows, when given, a whole number from 0 to rows");
          }
          if (input.blocks.reduce((input2, options3) => input2 + (options3.role === "Table" ? options3.rows * options3.cols : 0), 0) > maxPdfStructureBlocks)
            throw Error("its tables hold more than " + String(maxPdfStructureBlocks) + " cells in all");
          if (value31 >= 0)
            throw Error("block " + String(value31 + 1) + " is a figure with a bad box (xPt, yPt, widthPt and heightPt must each be a finite number of at most " + String(maxPdfTextCoordinate) + ") or an alt that is not a string");
          let value33 = input.blocks.findIndex((input2) => input2.role === "Figure" && input2.link !== void 0 && !(Number.isInteger(input2.link) && input2.link >= 0));
          if (value33 >= 0) {
            let link = input.blocks[value33].link;
            throw Error("block " + String(value33 + 1) + " is a figure with link " + (typeof link == "string" ? JSON.stringify(link) : String(link)).slice(0, 20) + "; it must be a whole number, 0 or more");
          }
          let value34 = input.blocks.findIndex((input2) => input2.numbering != null && !(typeof input2.numbering == "string" && pdfListNumberingKindSet.has(input2.numbering)));
          if (value34 >= 0)
            throw Error("block " + String(value34 + 1) + " has list numbering " + JSON.stringify(String(input.blocks[value34].numbering).slice(0, 40)) + "; allowed: " + pdfListNumberingKinds.join(", "));
        }
        return value29;
      } catch (value29) {
        throw Error("page " + String(options2 + 1) + ": " + (value29 instanceof Error ? value29.message : String(value29)));
      }
    }), callback = (input) => 4 + 3 * input, callback2 = (input) => 5 + 3 * input, callback3 = (input) => 6 + 3 * input, value2 = pages.some((input) => (input.textRuns?.length ?? 0) > 0), value3 = options?.textEncoding === "unicode" ? "unicode" : "winansi", state = {
      astral: /* @__PURE__ */ new Map(),
      highBytes: /* @__PURE__ */ new Set()
    }, value4 = value3 === "unicode" ? createUnicodePdfTextEncoder(state) : encodeWinAnsiPdfText, value5 = 4 + 3 * pages.length, value6 = value2 ? value3 === "unicode" ? 6 : 1 : 0, value7 = options?.tagged === !0, value8 = options?.lang;
    if (value7 && value8 !== void 0 && !isLanguageTag(value8))
      throw Error("the document language " + JSON.stringify(String(value8).slice(0, 40)) + ' is not a language tag such as "en" or "ja-JP"');
    let value9 = pages.map((input, options2) => (input.textRuns?.length ?? 0) > 0 ? preparePdfTextRuns(input.textRuns, options2, input.widthPt, input.heightPt, value4, input.blocks, value7) : []), value10 = value9.map((input, options2) => value7 ? pdfFigureLinkBlocks(pages[options2].blocks, input, pages[options2].widthPt, pages[options2].heightPt) : /* @__PURE__ */ new Map()), value11 = value9.map((input, options2) => {
      let entries = /* @__PURE__ */ new Map();
      for (let value29 of input) {
        if (value29.link === void 0)
          continue;
        let entry = entries.get(value29.link);
        entry === void 0 ? entries.set(value29.link, {
          text: value29.run.text,
          last: value29.run
        }) : entries.set(value29.link, {
          text: entry.text + (pdfRunsNeedSpace(entry.last, value29.run) ? " " : "") + value29.run.text,
          last: value29.run
        });
      }
      let entries2 = /* @__PURE__ */ new Map();
      for (let [value29, value30] of entries) {
        let value31 = normalizePdfOutlineTitle(value30.text, maxPdfPages);
        value31 !== "" && entries2.set(value29, value31);
      }
      for (let [value29, value30] of value10[options2]) {
        let alt = pages[options2].blocks[value30].alt, value31 = typeof alt == "string" ? normalizePdfOutlineTitle(alt, maxPdfPages) : "";
        value31 !== "" && entries2.set(value29, value31);
      }
      return (input2) => entries2.get(input2);
    }), value12 = maxPdfDocumentLinks, flag = !1, index4 = 0, value13 = pages.map((input, options2) => {
      let value29 = pdfLinkAnnotations(input.links, input.widthPt, input.heightPt, value12, () => flag = !0, value7 ? pages.length + index4 : void 0, value7 ? value11[options2] : void 0);
      return value12 -= value29.dicts.length, index4 += value29.dicts.length, value29;
    });
    flag && console.warn("[pdf] the file holds " + String(maxPdfDocumentLinks) + " links; any further ones are not clickable");
    let value14 = value5 + value6, value15 = value13.map((input) => input.dicts.map(() => value14++)), value16 = value15.map((input) => input.map((input2) => String(input2) + " 0 R").join(" ")), value17 = value7 ? pdfHeadingStructureLevels(pages, value9) : pages.map(() => []), value18 = value9.map((input, options2) => pdfTextOperators(input, pdfEncodedSpaceOperands[value3], value7, value17[options2], pages[options2].blocks, new Set(value13[options2].anchors.filter((input2) => input2 !== void 0)))), value19 = pages.map((input, options2) => pdfFigureOperators(input.blocks, input.widthPt, input.heightPt, value18[options2].marks.length, value7));
    value7 && value3 === "unicode" && state.highBytes.add(0);
    let value20 = value7 ? pdfStructureTreeObjects(value14, pages, value18, value19, value17, value15, value13.map((input) => input.anchors), value10, callback) : void 0, value21 = value20 !== void 0 && options?.outline === !0 ? pdfOutlineObjects(value20.nextObj, value9, value17, callback) : void 0, value22 = value20 !== void 0 ? value21?.nextObj ?? value20.nextObj : void 0, value23 = value22 ?? value14 - 1, value24 = pages.map((input, options2) => String(callback(options2)) + " 0 R").join(" "), value25 = pdfInfoTextOperand(options?.title ?? "", value3), items = [];
    items.push([
      asciiPdfBytes(value20 === void 0 ? "<< /Type /Catalog /Pages 2 0 R >>" : "<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true >> /ViewerPreferences << /DisplayDocTitle true >> /Lang (" + (value8 ?? "und") + ") /StructTreeRoot " + String(value20.rootObj) + " 0 R" + (value21 !== void 0 ? " /Outlines " + String(value21.rootObj) + " 0 R" : "") + " /Metadata " + String(value22) + " 0 R >>")
    ]), items.push([
      asciiPdfBytes("<< /Type /Pages /Kids [" + value24 + "] /Count " + String(pages.length) + " >>")
    ]), items.push([
      asciiPdfBytes("<<" + (value25 === "" ? "" : " /Title " + value25) + " >>")
    ]), pages.forEach((input, options2) => {
      let value29 = value[options2], value30 = input.lossless != null && input.lossless.zlib.length + 2 < input.jpeg.length ? input.lossless : void 0, value31 = formatPdfNumber(input.widthPt), value32 = formatPdfNumber(input.heightPt), value33 = (input.textRuns?.length ?? 0) > 0;
      items.push([
        asciiPdfBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + value31 + " " + value32 + "] /Resources << /XObject << /Im0 " + String(callback3(options2)) + " 0 R >> " + (value33 ? "/Font << /F0 " + String(value5) + " 0 R >> " : "") + "/ProcSet [/PDF /ImageC" + (value33 ? " /Text" : "") + "] >> /Contents " + String(callback2(options2)) + " 0 R" + (value16[options2] === "" ? "" : " /Annots [" + value16[options2] + "]") + (value20 === void 0 ? "" : " /StructParents " + String(options2) + " /Tabs /S") + " >>")
      ]);
      let value34 = `q
` + value31 + " 0 0 " + value32 + ` 0 0 cm
/Im0 Do
Q
`, value35 = (value20 === void 0 ? value34 : `/Artifact BMC
` + value34 + `EMC
`) + value18[options2].ops + value19[options2].ops;
      items.push([
        asciiPdfBytes("<< /Length " + String(value35.length) + ` >>
stream
` + value35 + "endstream")
      ]);
      let value36 = value30 !== void 0 ? value30.zlib : input.jpeg;
      items.push([
        asciiPdfBytes("<< /Type /XObject /Subtype /Image /Width " + String(value29.width) + " /Height " + String(value29.height) + " /ColorSpace " + (value30 !== void 0 || value29.components === 3 ? "/DeviceRGB" : "/DeviceGray") + " /BitsPerComponent 8 /Filter " + (value30 !== void 0 ? "/FlateDecode" : "/DCTDecode") + " /Length " + String(value36.length) + ` >>
stream
`),
        value36,
        asciiPdfBytes(`
endstream`)
      ]);
    }), value2 && value3 === "unicode" ? items.push(...pdfUnicodeFontObjects(value5, state)) : value2 && items.push([
      asciiPdfBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    ]);
    for (let value29 of value13)
      for (let value30 of value29.dicts)
        items.push([asciiPdfBytes(value30)]);
    if (value20 !== void 0) {
      for (let value29 of value20.bodies)
        items.push([asciiPdfBytes(value29)]);
      for (let value29 of value21?.bodies ?? [])
        items.push([asciiPdfBytes(value29)]);
      items.push(pdfXmpMetadata(sanitizePdfMetadataText(options?.title ?? "", value3)));
    }
    let items2 = [], index22 = 0, callback4 = (items4) => {
      items2.push(items4), index22 += items4.length;
    };
    callback4(asciiPdfBytes(value20 === void 0 ? `%PDF-1.4
` : `%PDF-1.7
`)), callback4(Uint8Array.from([37, 226, 227, 207, 211, 10]));
    let items3 = [];
    items.forEach((input, options2) => {
      items3.push(index22), callback4(asciiPdfBytes(String(options2 + 1) + ` 0 obj
`));
      for (let value29 of input)
        callback4(value29);
      callback4(asciiPdfBytes(`
endobj
`));
    });
    let value26 = index22, callback5 = (input) => String(input).padStart(10, "0");
    callback4(asciiPdfBytes(`xref
0 ` + String(value23 + 1) + `
0000000000 65535 f 
` + items3.map((input) => callback5(input) + ` 00000 n 
`).join("") + `trailer
<< /Size ` + String(value23 + 1) + ` /Root 1 0 R /Info 3 0 R >>
startxref
` + String(value26) + `
%%EOF
`));
    let value27 = items2.reduce((input, items4) => input + items4.length, 0), value28 = new Uint8Array(value27), index32 = 0;
    for (let value29 of items2)
      value28.set(value29, index32), index32 += value29.length;
    return value28;
  }
  return bindRuntimeValue(runtime2, "pdfWriterExports", () => pdfWriterExports, (value) => {
    pdfWriterExports = value;
  }), bindRuntimeValue(runtime2, "pdfListNumbering", () => pdfListNumbering), bindRuntimeValue(runtime2, "base64ToBytes", () => base64ToBytes), bindRuntimeValue(runtime2, "parseJpegDimensions", () => parseJpegDimensions), bindRuntimeValue(runtime2, "deflatePagePixels", () => deflatePagePixels), bindRuntimeValue(runtime2, "deflateWorstCaseBytes", () => deflateWorstCaseBytes), bindRuntimeValue(runtime2, "validateLosslessPageImage", () => validateLosslessPageImage), bindRuntimeValue(runtime2, "winAnsiCodePoint", () => winAnsiCodePoint), bindRuntimeValue(runtime2, "winAnsiGlyphWidth", () => winAnsiGlyphWidth), bindRuntimeValue(runtime2, "encodeWinAnsiText", () => encodeWinAnsiText), bindRuntimeValue(runtime2, "escapePdfWinAnsiText", () => escapePdfWinAnsiText), bindRuntimeValue(runtime2, "unicodePdfGlyphWidth", () => unicodePdfGlyphWidth), bindRuntimeValue(runtime2, "unicodeHex4", () => unicodeHex4), bindRuntimeValue(runtime2, "encodeUnicodePdfText", () => encodeUnicodePdfText), bindRuntimeValue(runtime2, "pdfCmapEntries", () => pdfCmapEntries), bindRuntimeValue(runtime2, "unicodeToPdfCmap", () => unicodeToPdfCmap), bindRuntimeValue(runtime2, "pdfUnicodeFontObjects", () => pdfUnicodeFontObjects), bindRuntimeValue(runtime2, "simpleRtlVisualOrder", () => simpleRtlVisualOrder), bindRuntimeValue(runtime2, "createUnicodePdfTextEncoder", () => createUnicodePdfTextEncoder), bindRuntimeValue(runtime2, "preparePdfTextRuns", () => preparePdfTextRuns), bindRuntimeValue(runtime2, "pdfRunsNeedSpace", () => pdfRunsNeedSpace), bindRuntimeValue(runtime2, "pdfTextOperators", () => pdfTextOperators), bindRuntimeValue(runtime2, "clipPdfBlockBounds", () => clipPdfBlockBounds), bindRuntimeValue(runtime2, "pdfFigureOperators", () => pdfFigureOperators), bindRuntimeValue(runtime2, "pdfFigureLinkBlocks", () => pdfFigureLinkBlocks), bindRuntimeValue(runtime2, "textSegmentsNeedSpace", () => textSegmentsNeedSpace), bindRuntimeValue(runtime2, "safePdfLinkUri", () => safePdfLinkUri), bindRuntimeValue(runtime2, "pdfLinkAnnotations", () => pdfLinkAnnotations), bindRuntimeValue(runtime2, "guessTextLanguage", () => guessTextLanguage), bindRuntimeValue(runtime2, "scoreLatinLanguages", () => scoreLatinLanguages), bindRuntimeValue(runtime2, "isLanguageTag", () => isLanguageTag), bindRuntimeValue(runtime2, "documentLanguage", () => documentLanguage), bindRuntimeValue(runtime2, "pdfHeadingStructureLevels", () => pdfHeadingStructureLevels), bindRuntimeValue(runtime2, "pdfStructureTreeObjects", () => pdfStructureTreeObjects), bindRuntimeValue(runtime2, "pdfOutlineObjects", () => pdfOutlineObjects), bindRuntimeValue(runtime2, "asciiPdfBytes", () => asciiPdfBytes), bindRuntimeValue(runtime2, "formatPdfNumber", () => formatPdfNumber), bindRuntimeValue(runtime2, "sanitizePdfMetadataText", () => sanitizePdfMetadataText), bindRuntimeValue(runtime2, "sanitizeUnicodeMetadata", () => sanitizeUnicodeMetadata), bindRuntimeValue(runtime2, "normalizePdfOutlineTitle", () => normalizePdfOutlineTitle), bindRuntimeValue(runtime2, "pdfStringOperand", () => pdfStringOperand), bindRuntimeValue(runtime2, "pdfInfoTextOperand", () => pdfInfoTextOperand), bindRuntimeValue(runtime2, "pdfXmpMetadata", () => pdfXmpMetadata), bindRuntimeValue(runtime2, "jpegPagesToPdf", () => jpegPagesToPdf), bindRuntimeValue(runtime2, "pdfListNumberingNames", () => pdfListNumberingNames, (value) => {
    pdfListNumberingNames = value;
  }), bindRuntimeValue(runtime2, "maxLosslessPageDimension", () => maxLosslessPageDimension, (value) => {
    maxLosslessPageDimension = value;
  }), bindRuntimeValue(runtime2, "losslessCompressionRowsPerChunk", () => losslessCompressionRowsPerChunk, (value) => {
    losslessCompressionRowsPerChunk = value;
  }), bindRuntimeValue(runtime2, "compressionTimeoutMessage", () => compressionTimeoutMessage, (value) => {
    compressionTimeoutMessage = value;
  }), bindRuntimeValue(runtime2, "winAnsiExtraCodePoints", () => winAnsiExtraCodePoints, (value) => {
    winAnsiExtraCodePoints = value;
  }), bindRuntimeValue(runtime2, "helveticaAsciiGlyphWidths", () => helveticaAsciiGlyphWidths, (value) => {
    helveticaAsciiGlyphWidths = value;
  }), bindRuntimeValue(runtime2, "unicodeAstralGlyphCidStart", () => unicodeAstralGlyphCidStart, (value) => {
    unicodeAstralGlyphCidStart = value;
  }), bindRuntimeValue(runtime2, "maxAstralPdfGlyphs", () => maxAstralPdfGlyphs, (value) => {
    maxAstralPdfGlyphs = value;
  }), bindRuntimeValue(runtime2, "unicodeReplacementCodePoint", () => unicodeReplacementCodePoint, (value) => {
    unicodeReplacementCodePoint = value;
  }), bindRuntimeValue(runtime2, "embeddedPdfFontBase64", () => embeddedPdfFontBase64, (value) => {
    embeddedPdfFontBase64 = value;
  }), bindRuntimeValue(runtime2, "compressedPdfCidToGidMapBase64", () => compressedPdfCidToGidMapBase64, (value) => {
    compressedPdfCidToGidMapBase64 = value;
  }), bindRuntimeValue(runtime2, "wideUnicodeGlyphRanges", () => wideUnicodeGlyphRanges, (value) => {
    wideUnicodeGlyphRanges = value;
  }), bindRuntimeValue(runtime2, "defaultUnicodeGlyphWidth", () => defaultUnicodeGlyphWidth, (value) => {
    defaultUnicodeGlyphWidth = value;
  }), bindRuntimeValue(runtime2, "rtlTextPattern", () => rtlTextPattern, (value) => {
    rtlTextPattern = value;
  }), bindRuntimeValue(runtime2, "rtlCandidatePattern", () => rtlCandidatePattern, (value) => {
    rtlCandidatePattern = value;
  }), bindRuntimeValue(runtime2, "unicodeLetterPatternForRtl", () => unicodeLetterPatternForRtl, (value) => {
    unicodeLetterPatternForRtl = value;
  }), bindRuntimeValue(runtime2, "rtlTextClusterPattern", () => rtlTextClusterPattern, (value) => {
    rtlTextClusterPattern = value;
  }), bindRuntimeValue(runtime2, "pdfEncodedSpaceOperands", () => pdfEncodedSpaceOperands, (value) => {
    pdfEncodedSpaceOperands = value;
  }), bindRuntimeValue(runtime2, "encodeWinAnsiPdfText", () => encodeWinAnsiPdfText, (value) => {
    encodeWinAnsiPdfText = value;
  }), bindRuntimeValue(runtime2, "maxPdfPageTextCharacters", () => maxPdfPageTextCharacters, (value) => {
    maxPdfPageTextCharacters = value;
  }), bindRuntimeValue(runtime2, "pdfStructureRoles", () => pdfStructureRoles, (value) => {
    pdfStructureRoles = value;
  }), bindRuntimeValue(runtime2, "pdfTextStructureRoles", () => pdfTextStructureRoles, (value) => {
    pdfTextStructureRoles = value;
  }), bindRuntimeValue(runtime2, "pdfListNumberingKinds", () => pdfListNumberingKinds, (value) => {
    pdfListNumberingKinds = value;
  }), bindRuntimeValue(runtime2, "pdfStructureRoleSet", () => pdfStructureRoleSet, (value) => {
    pdfStructureRoleSet = value;
  }), bindRuntimeValue(runtime2, "pdfListNumberingKindSet", () => pdfListNumberingKindSet, (value) => {
    pdfListNumberingKindSet = value;
  }), bindRuntimeValue(runtime2, "maxPdfStructureBlocks", () => maxPdfStructureBlocks, (value) => {
    maxPdfStructureBlocks = value;
  }), bindRuntimeValue(runtime2, "pdfTableCellStructureRole", () => pdfTableCellStructureRole, (value) => {
    pdfTableCellStructureRole = value;
  }), bindRuntimeValue(runtime2, "maxPdfFigureAltLength", () => maxPdfFigureAltLength, (value) => {
    maxPdfFigureAltLength = value;
  }), bindRuntimeValue(runtime2, "noWordSpaceScriptPattern", () => noWordSpaceScriptPattern, (value) => {
    noWordSpaceScriptPattern = value;
  }), bindRuntimeValue(runtime2, "maxPdfLinkLength", () => maxPdfLinkLength, (value) => {
    maxPdfLinkLength = value;
  }), bindRuntimeValue(runtime2, "maxPdfAnnotations", () => maxPdfAnnotations, (value) => {
    maxPdfAnnotations = value;
  }), bindRuntimeValue(runtime2, "maxPdfDocumentLinks", () => maxPdfDocumentLinks, (value) => {
    maxPdfDocumentLinks = value;
  }), bindRuntimeValue(runtime2, "minPdfLinkSizePoints", () => minPdfLinkSizePoints, (value) => {
    minPdfLinkSizePoints = value;
  }), bindRuntimeValue(runtime2, "latinLanguageWordLists", () => latinLanguageWordLists, (value) => {
    latinLanguageWordLists = value;
  }), bindRuntimeValue(runtime2, "distinctiveLanguageScriptPatterns", () => distinctiveLanguageScriptPatterns, (value) => {
    distinctiveLanguageScriptPatterns = value;
  }), bindRuntimeValue(runtime2, "japaneseScriptPattern", () => japaneseScriptPattern, (value) => {
    japaneseScriptPattern = value;
  }), bindRuntimeValue(runtime2, "hanScriptPattern", () => hanScriptPattern, (value) => {
    hanScriptPattern = value;
  }), bindRuntimeValue(runtime2, "koreanScriptPattern", () => koreanScriptPattern, (value) => {
    koreanScriptPattern = value;
  }), bindRuntimeValue(runtime2, "latinScriptPattern", () => latinScriptPattern, (value) => {
    latinScriptPattern = value;
  }), bindRuntimeValue(runtime2, "languageTagPattern", () => languageTagPattern, (value) => {
    languageTagPattern = value;
  }), bindRuntimeValue(runtime2, "inferredScriptLanguages", () => inferredScriptLanguages, (value) => {
    inferredScriptLanguages = value;
  }), bindRuntimeValue(runtime2, "maxPdfPages", () => maxPdfPages, (value) => {
    maxPdfPages = value;
  }), bindRuntimeValue(runtime2, "minPdfPagePoints", () => minPdfPagePoints, (value) => {
    minPdfPagePoints = value;
  }), bindRuntimeValue(runtime2, "maxPdfPagePoints", () => maxPdfPagePoints, (value) => {
    maxPdfPagePoints = value;
  }), bindRuntimeValue(runtime2, "maxPdfTextCoordinate", () => maxPdfTextCoordinate, (value) => {
    maxPdfTextCoordinate = value;
  }), bindRuntimeValue(runtime2, "initializePdfWriter", () => initializePdfWriter, (value) => {
    initializePdfWriter = value;
  }), () => {
    pdfWriterExports = {}, (0, runtime2.defineLiveExports)(pdfWriterExports, {
      MAX_BLOCKS_PER_PAGE: () => maxPdfStructureBlocks,
      PAGE_PIXELS_TOO_SLOW: () => compressionTimeoutMessage,
      deflatePagePixels: () => deflatePagePixels,
      documentLanguage: () => documentLanguage,
      jpegPagesToPdf: () => jpegPagesToPdf,
      listNumbering: () => pdfListNumbering
    }), maxLosslessPageDimension = 65535, losslessCompressionRowsPerChunk = 128, compressionTimeoutMessage = "compressing the page's pixels took too long", unicodeAstralGlyphCidStart = 55296, maxAstralPdfGlyphs = 2048, unicodeReplacementCodePoint = 65533, embeddedPdfFontBase64 = "AAEAAAAKAIAAAwAgT1MvMkSQQzcAAAEoAAAAYGNtYXAADABGAAABkAAAACxnbHlmVRS2+AAAAcQAAAAaaGVhZGELQt8AAACsAAAANmhoZWEExAEoAAAA5AAAACRobXR4AfQAAAAAAYgAAAAIbG9jYQANAAAAAAG8AAAABm1heHAABAAGAAABCAAAACBuYW1lA4cLdQAAAeAAAAA+cG9zdAADAAAAAAIgAAAAIAABAAAAAQAAm3oJWV8PPPUAAwPoAAAAAAAAAAAAAAAAAAAAAAAA/zEB9ALOAAAAAwACAAAAAAAAAAEAAALO/zEAAAH0AAAAAAH0AAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwH0AZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPz8/PwAAAAAAAALO/zEAAALOAM8AAAAAAAAAAAAAAAAAAAAgAAAAAAAAAfQAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAGAAAAAIAAgAAAAD//wAA//8AAQAAAAAAAAANAAAAAQAA/zEB9ALOAAMAABURIREB9M8DnfxjAAAAAAAAAgAeAAMAAQQJAAEAEgAAAAMAAQQJAAIADgASAEcAbAB5AHAAaABsAGUAcwBzAFIAZQBnAHUAbABhAHIAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", compressedPdfCidToGidMapBase64 = "eNrtwgEJAAAAAqD6fzpoh2gaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgBsA/wAQ", defaultUnicodeGlyphWidth = 556, encodeWinAnsiPdfText = (input) => {
      let value = encodeWinAnsiText(input);
      if (value !== void 0)
        return {
          operand: "(" + escapePdfWinAnsiText(value) + ")",
          em: value.reduce((input2, options) => input2 + winAnsiGlyphWidth(options), 0) / 1e3
        };
    }, maxPdfPageTextCharacters = 2e5, maxPdfStructureBlocks = 1e4, pdfTableCellStructureRole = (input, options) => options < (input.headerRows ?? 0) * input.cols ? "TH" : "TD", maxPdfFigureAltLength = 1e3, maxPdfLinkLength = 2048, maxPdfAnnotations = 4e3, maxPdfDocumentLinks = 1e4, minPdfLinkSizePoints = 0.5, maxPdfPages = 200, minPdfPagePoints = 3, maxPdfPagePoints = 14400, initializePdfWriter = (0, runtime2.initializeOnce)(() => {
      pdfListNumberingNames = {
        none: "None",
        disc: "Disc",
        circle: "Circle",
        square: "Square",
        decimal: "Decimal",
        "decimal-leading-zero": "Decimal",
        "upper-roman": "UpperRoman",
        "lower-roman": "LowerRoman",
        "upper-alpha": "UpperAlpha",
        "upper-latin": "UpperAlpha",
        "lower-alpha": "LowerAlpha",
        "lower-latin": "LowerAlpha"
      }, winAnsiExtraCodePoints = {
        8364: 128,
        8218: 130,
        402: 131,
        8222: 132,
        8230: 133,
        8224: 134,
        8225: 135,
        710: 136,
        8240: 137,
        352: 138,
        8249: 139,
        338: 140,
        381: 142,
        8216: 145,
        8217: 146,
        8220: 147,
        8221: 148,
        8226: 149,
        8211: 150,
        8212: 151,
        732: 152,
        8482: 153,
        353: 154,
        8250: 155,
        339: 156,
        382: 158,
        376: 159
      }, helveticaAsciiGlyphWidths = [
        278,
        278,
        355,
        556,
        556,
        889,
        667,
        191,
        333,
        333,
        389,
        584,
        278,
        333,
        278,
        278,
        556,
        556,
        556,
        556,
        556,
        556,
        556,
        556,
        556,
        556,
        278,
        278,
        584,
        584,
        584,
        556,
        1015,
        667,
        667,
        722,
        722,
        667,
        611,
        778,
        722,
        278,
        500,
        667,
        556,
        833,
        722,
        778,
        667,
        778,
        722,
        667,
        611,
        722,
        667,
        944,
        667,
        667,
        611,
        278,
        278,
        278,
        469,
        556,
        333,
        556,
        556,
        500,
        556,
        556,
        278,
        556,
        556,
        222,
        222,
        500,
        222,
        833,
        556,
        556,
        556,
        556,
        333,
        500,
        278,
        556,
        500,
        722,
        500,
        500,
        500,
        334,
        260,
        334,
        584
      ], wideUnicodeGlyphRanges = [
        [11904, 40959],
        [44032, 55203],
        [55296, 57343],
        [63744, 64255],
        [65281, 65376]
      ], rtlTextPattern = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/, rtlCandidatePattern = /(?=\p{L})[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/u, unicodeLetterPatternForRtl = /\p{L}/u, rtlTextClusterPattern = /[+\-\u2212#$%\u00a2-\u00a5\u00b0\u00b1\u066a\u2030\u2031\u20a0-\u20cf]{0,4}[0-9\u0660-\u0669\u066b\u066c\u06f0-\u06f9]+(?:[+\-\u2012\u2013\u2212,.:/\u00a0\u060c\u202f][0-9\u0660-\u0669\u066b\u066c\u06f0-\u06f9]+)*[#$%\u00a2-\u00a5\u00b0\u00b1\u066a\u2030\u2031\u20a0-\u20cf]{0,4}|[^]/gu, pdfEncodedSpaceOperands = {
        winansi: {
          operand: "( )",
          em: winAnsiGlyphWidth(32) / 1e3
        },
        unicode: {
          operand: "<0020>",
          em: unicodePdfGlyphWidth(32) / 1e3
        }
      }, pdfStructureRoles = Object.freeze([
        "P",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "L",
        "Table",
        "Figure",
        "Artifact"
      ]), pdfTextStructureRoles = Object.freeze([
        "P",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "L",
        "Artifact"
      ]), pdfListNumberingKinds = Object.freeze([
        "None",
        "Disc",
        "Circle",
        "Square",
        "Decimal",
        "UpperRoman",
        "LowerRoman",
        "UpperAlpha",
        "LowerAlpha"
      ]), pdfStructureRoleSet = new Set(pdfStructureRoles), pdfListNumberingKindSet = new Set(pdfListNumberingKinds), noWordSpaceScriptPattern = /[\u0e00-\u0e7f\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/u, latinLanguageWordLists = [
        [
          "en",
          "the and of to in is for that with on are as be this by from at or an was it you your we our not have has will can"
        ],
        [
          "es",
          "de la el en y los las del que por con para una un es se no su al como más lo sus este esta son"
        ],
        [
          "fr",
          "de la le les et des en du une un est pour que dans qui par sur au pas plus avec ce cette nous vous sont ne"
        ],
        [
          "de",
          "der die und das in den von zu mit ist für auf dem des eine ein im nicht sich auch als an es wir sie werden bei oder"
        ],
        [
          "pt",
          "de da do em para com que os as uma um dos das não por mais se na no ao como é são seu sua"
        ],
        [
          "it",
          "di il la che in per del con le della un una dei è al non da sono alla più come gli delle nel questo"
        ],
        [
          "nl",
          "de het van een en in is op te voor met dat die zijn niet aan er om ook als bij door wordt deze dit wij"
        ]
      ], distinctiveLanguageScriptPatterns = [
        ["he", /(?=\p{L})[\u0590-\u05ff]/gu],
        ["th", /(?=\p{L})[\u0e00-\u0e7f]/gu],
        ["el", /(?=\p{L})[\u0370-\u03ff]/gu]
      ], japaneseScriptPattern = /(?=\p{L})[\u3040-\u30ff\uff66-\uff9f]/gu, hanScriptPattern = /[\u3400-\u4dbf\u4e00-\u9fff]/gu, koreanScriptPattern = /(?=\p{L})[\uac00-\ud7a3\u1100-\u11ff]/gu, latinScriptPattern = /\p{Script=Latin}/gu, languageTagPattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,3}$/, inferredScriptLanguages = [
        [
          /\p{Script=Latin}/gu,
          "Latn",
          "en es fr de pt it nl ca gl eu pl cs sk sl hu ro hr bs sq sv da nb nn no fi et lv lt is ga cy mt tr az uz tk id ms vi tl fil sw af zu xh yo ha so lb eo la"
        ],
        [/\p{Script=Cyrillic}/gu, "Cyrl", "ru uk be bg mk sr kk ky mn tg"],
        [/\p{Script=Arabic}/gu, "Arab", "ar fa ur ps ug sd ckb"],
        [/\p{Script=Devanagari}/gu, "Deva", "hi mr ne sa"],
        [/\p{Script=Bengali}/gu, "Beng", "bn as"],
        [/\p{Script=Gurmukhi}/gu, "Guru", "pa"],
        [/\p{Script=Gujarati}/gu, "Gujr", "gu"],
        [/\p{Script=Tamil}/gu, "Taml", "ta"],
        [/\p{Script=Telugu}/gu, "Telu", "te"],
        [/\p{Script=Kannada}/gu, "Knda", "kn"],
        [/\p{Script=Malayalam}/gu, "Mlym", "ml"],
        [/\p{Script=Sinhala}/gu, "Sinh", "si"],
        [/\p{Script=Thai}/gu, "Thai", "th"],
        [/\p{Script=Lao}/gu, "Laoo", "lo"],
        [/\p{Script=Khmer}/gu, "Khmr", "km"],
        [/\p{Script=Myanmar}/gu, "Mymr", "my"],
        [/\p{Script=Georgian}/gu, "Geor", "ka"],
        [/\p{Script=Armenian}/gu, "Armn", "hy"],
        [/\p{Script=Ethiopic}/gu, "Ethi", "am ti"],
        [/\p{Script=Hebrew}/gu, "Hebr", "he iw yi"],
        [/\p{Script=Greek}/gu, "Grek", "el"],
        [
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
          "Hani Hans Hant Jpan",
          "zh ja yue"
        ],
        [/\p{Script=Hangul}/gu, "Hang Kore", "ko"]
      ], maxPdfTextCoordinate = 4 * maxPdfPagePoints;
    });
  };
}
export {
  installExportPdfWriter
};
