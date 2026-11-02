// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportFontTables(runtime2) {
  var FONT_TAG_TRUE, FONT_TAG_CFF, FONT_TAG_COLLECTION, FONT_TAG_WOFF, FONT_TAG_WOFF2, maxFontNameBytes, maxFontLongNameBytes, readFontNameIds, uint32, rewrittenNameIds, droppedNameIds, initializeFontTables;
  function fontTag(value) {
    return String.fromCharCode(value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255);
  }
  function readFontTables(bytes) {
    let empty = (flavor) => ({
      flavor,
      tables: [],
      names: {}
    });
    if (bytes.byteLength < 12)
      return empty("unknown");
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = view.getUint32(0);
    if (tag === FONT_TAG_COLLECTION)
      return empty("collection");
    if (tag === FONT_TAG_WOFF)
      return empty("woff");
    if (tag === FONT_TAG_WOFF2)
      return bytes.byteLength >= 20 ? {
        ...empty("woff2"),
        extent: view.getUint32(16)
      } : empty("woff2");
    if (tag !== 65536 && tag !== FONT_TAG_TRUE && tag !== FONT_TAG_CFF)
      return empty("unknown");
    let count = view.getUint16(4);
    if (bytes.byteLength < 12 + count * 16)
      return empty("unknown");
    let tables = /* @__PURE__ */ new Map(), end = 12 + count * 16;
    for (let index4 = 0; index4 < count; index4++) {
      let entry = 12 + index4 * 16, offset4 = view.getUint32(entry + 8), length = view.getUint32(entry + 12);
      offset4 + length <= bytes.byteLength && (tables.set(fontTag(view.getUint32(entry)), {
        offset: offset4,
        length
      }), end = Math.max(end, offset4 + length));
    }
    let info = {
      flavor: tag === FONT_TAG_CFF ? "cff" : "truetype",
      tables: [...tables.keys()],
      extent: Math.min(bytes.byteLength, Math.ceil(end / 4) * 4),
      names: {}
    }, os2 = tables.get("OS/2");
    if (os2 && os2.length >= 78) {
      let at = os2.offset;
      info.os2 = {
        fsType: view.getUint16(at + 8),
        weightClass: view.getUint16(at + 4),
        italic: (view.getUint16(at + 62) & 1) === 1,
        panose: Array.from(bytes.subarray(at + 32, at + 42)),
        unicodeRange: [
          view.getUint32(at + 42),
          view.getUint32(at + 46),
          view.getUint32(at + 50),
          view.getUint32(at + 54)
        ],
        codePageRange: os2.length >= 86 ? [view.getUint32(at + 78), view.getUint32(at + 82)] : [0, 0]
      };
    }
    let head = tables.get("head");
    head && head.length >= 12 && (info.checkSumAdjustment = view.getUint32(head.offset + 8));
    let name = tables.get("name");
    return name && name.length >= 6 && (info.names = readFontNames(bytes, view, name.offset, name.length)), info;
  }
  function readFontNames(bytes, view, offset4, length) {
    let count = view.getUint16(offset4 + 2), storage = offset4 + view.getUint16(offset4 + 4), found = /* @__PURE__ */ new Map();
    for (let index4 = 0; index4 < count; index4++) {
      let entry = offset4 + 6 + index4 * 12;
      if (entry + 12 > offset4 + length)
        break;
      let platform3 = view.getUint16(entry), encoding = view.getUint16(entry + 2), language = view.getUint16(entry + 4), id = view.getUint16(entry + 6), size4 = view.getUint16(entry + 8), at = storage + view.getUint16(entry + 10);
      if (!readFontNameIds.includes(id) || at + size4 > bytes.byteLength || size4 > (id === 0 || id === 13 ? maxFontLongNameBytes : maxFontNameBytes))
        continue;
      let rank = 0, text = "";
      if (platform3 === 3 && (encoding === 1 || encoding === 10) && language === 1033)
        rank = 3;
      else if (platform3 === 0)
        rank = 2;
      else if (platform3 === 1 && encoding === 0 && language === 0)
        rank = 1;
      else
        continue;
      if (!((found.get(id)?.rank ?? 0) >= rank)) {
        if (platform3 === 1)
          for (let i = 0; i < size4; i++)
            text += String.fromCharCode(bytes[at + i]);
        else
          for (let i = 0; i + 1 < size4; i += 2)
            text += String.fromCharCode(view.getUint16(at + i));
        found.set(id, {
          rank,
          text
        });
      }
    }
    return {
      family: found.get(1)?.text,
      subfamily: found.get(2)?.text,
      version: found.get(5)?.text,
      full: found.get(4)?.text,
      copyright: found.get(0)?.text,
      licence: found.get(13)?.text
    };
  }
  function fontTableChecksum(bytes) {
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), sum = 0, whole = bytes.byteLength & -4;
    for (let at = 0; at < whole; at += 4)
      sum = uint32(sum + view.getUint32(at));
    if (whole < bytes.byteLength) {
      let tail = 0;
      for (let i = 0; i < 4; i++)
        tail = tail << 8 | (whole + i < bytes.byteLength ? bytes[whole + i] : 0);
      sum = uint32(sum + uint32(tail));
    }
    return sum;
  }
  function nameRecords(names) {
    let records = [];
    for (let name of names) {
      let utf16 = new Uint8Array(name.text.length * 2);
      for (let i = 0; i < name.text.length; i++)
        utf16[i * 2] = name.text.charCodeAt(i) >>> 8, utf16[i * 2 + 1] = name.text.charCodeAt(i) & 255;
      records.push({
        platform: 3,
        encoding: 1,
        language: 1033,
        id: name.id,
        bytes: utf16
      }), records.push({
        platform: 1,
        encoding: 0,
        language: 0,
        id: name.id,
        bytes: Uint8Array.from(name.text, (input) => input.charCodeAt(0) < 128 ? input.charCodeAt(0) : 63)
      });
    }
    return records;
  }
  function nameTableBytes(records) {
    let sorted = records.slice().sort((left, right) => left.platform - right.platform || left.encoding - right.encoding || left.language - right.language || left.id - right.id), storage = 6 + 12 * sorted.length, out = new Uint8Array(storage + sorted.reduce((sum, record) => sum + record.bytes.byteLength, 0)), view = new DataView(out.buffer);
    view.setUint16(0, 0), view.setUint16(2, sorted.length), view.setUint16(4, storage);
    let offset4 = 0;
    return sorted.forEach((record, index4) => {
      let entry = 6 + index4 * 12;
      view.setUint16(entry, record.platform), view.setUint16(entry + 2, record.encoding), view.setUint16(entry + 4, record.language), view.setUint16(entry + 6, record.id), view.setUint16(entry + 8, record.bytes.byteLength), view.setUint16(entry + 10, offset4), out.set(record.bytes, storage + offset4), offset4 += record.bytes.byteLength;
    }), out;
  }
  function renameFontFace(bytes, family, subfamily, style) {
    if (bytes.byteLength < 12)
      return bytes;
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = view.getUint32(0);
    if (tag !== 65536 && tag !== FONT_TAG_TRUE && tag !== FONT_TAG_CFF)
      return bytes;
    let count = view.getUint16(4);
    if (bytes.byteLength < 12 + count * 16)
      return bytes;
    let tables = [];
    for (let index4 = 0; index4 < count; index4++) {
      let entry = 12 + index4 * 16, offset4 = view.getUint32(entry + 8), length = view.getUint32(entry + 12);
      if (offset4 + length > bytes.byteLength)
        return bytes;
      tables.push({
        tag: fontTag(view.getUint32(entry)),
        bytes: bytes.subarray(offset4, offset4 + length)
      });
    }
    let name = tables.find((input) => input.tag === "name"), head = tables.find((input) => input.tag === "head"), os2 = tables.find((input) => input.tag === "OS/2");
    if (!name || !head || head.bytes.byteLength < 54 || name.bytes.byteLength < 6 || os2 && os2.bytes.byteLength < 64 || new Set(tables.map((input) => input.tag)).size !== tables.length || tables.reduce((sum, input) => sum + input.bytes.byteLength, 0) > bytes.byteLength)
      return bytes;
    let records = [];
    {
      let nameView = new DataView(name.bytes.buffer, name.bytes.byteOffset, name.bytes.byteLength);
      if (nameView.getUint16(0) > 1)
        return bytes;
      let recordCount = nameView.getUint16(2), storage = nameView.getUint16(4);
      for (let index4 = 0; index4 < recordCount && 6 + index4 * 12 + 12 <= name.bytes.byteLength; index4++) {
        let entry = 6 + index4 * 12, size5 = nameView.getUint16(entry + 8), at2 = storage + nameView.getUint16(entry + 10), language = nameView.getUint16(entry + 4);
        at2 + size5 > name.bytes.byteLength || language >= 32768 || records.push({
          platform: nameView.getUint16(entry),
          encoding: nameView.getUint16(entry + 2),
          language,
          id: nameView.getUint16(entry + 6),
          bytes: name.bytes.subarray(at2, at2 + size5)
        });
      }
    }
    let references = nameReferences(tables);
    if (references === void 0)
      return bytes;
    let nextId = Math.max(records.reduce((max2, record) => Math.max(max2, record.id), 255), references.reduce((max2, reference) => Math.max(max2, reference.id === 65535 ? 0 : reference.id), 0)) + 1, movedIds = /* @__PURE__ */ new Map();
    for (let reference of references)
      if (!(!rewrittenNameIds.includes(reference.id) && !droppedNameIds.includes(reference.id)) && !movedIds.has(reference.id)) {
        if (nextId > 32767)
          return bytes;
        movedIds.set(reference.id, nextId);
        for (let record of records.filter((input) => input.id === reference.id))
          records.push({
            ...record,
            id: nextId
          });
        nextId += 1;
      }
    let kept = records.filter((input) => !rewrittenNameIds.includes(input.id) && !droppedNameIds.includes(input.id)), alphanumeric = (input) => input.replace(/[^A-Za-z0-9]/g, ""), postscriptName = ((alphanumeric(family) || "Font") + "-" + (alphanumeric(subfamily) || "Regular")).slice(0, 63), rewritten = [
      ...nameRecords([
        { id: 1, text: family },
        { id: 2, text: subfamily },
        { id: 3, text: family + " " + subfamily },
        { id: 4, text: family + " " + subfamily },
        { id: 6, text: postscriptName },
        { id: 16, text: family },
        { id: 17, text: subfamily }
      ]),
      ...kept
    ];
    if (6 + 12 * rewritten.length + rewritten.reduce((sum, record) => sum + record.bytes.byteLength, 0) > 65535)
      return bytes;
    name.bytes = nameTableBytes(rewritten);
    for (let table of tables) {
      if (table.tag !== "fvar" && table.tag !== "STAT" || !references.some((reference) => reference.table === table.tag && movedIds.has(reference.id)))
        continue;
      let copy = new Uint8Array(table.bytes), copyView = new DataView(copy.buffer);
      for (let reference of references)
        reference.table === table.tag && movedIds.has(reference.id) && copyView.setUint16(reference.at, movedIds.get(reference.id));
      table.bytes = copy;
    }
    let headCopy = new Uint8Array(head.bytes), headView = new DataView(headCopy.buffer);
    if (headView.setUint32(8, 0), headView.setUint16(44, headView.getUint16(44) & -4 | (style.bold ? 1 : 0) | (style.italic ? 2 : 0)), head.bytes = headCopy, os2) {
      let os2Copy = new Uint8Array(os2.bytes), os2View = new DataView(os2Copy.buffer), weight = style.bold ? 700 : 400, wasItalic = (os2View.getUint16(62) & 1) === 1;
      if (os2Copy[32] === 2) {
        os2View.getUint16(4) !== weight && os2Copy[34] >= 2 && (os2Copy[34] = style.bold ? 8 : 5);
        let letterform = os2Copy[39];
        wasItalic !== style.italic && letterform >= 2 && letterform <= 15 && (os2Copy[39] = style.italic ? letterform <= 8 ? letterform + 7 : letterform : letterform >= 9 ? letterform - 7 : letterform);
      }
      os2View.setUint16(4, weight);
      let selection = os2View.getUint16(62) & -610;
      os2View.setUint16(62, selection | (style.italic ? 1 : 0) | (style.bold ? 32 : 0) | (!style.bold && !style.italic ? 64 : 0)), os2.bytes = os2Copy;
    }
    let ordered = tables.filter((input) => input.tag !== "DSIG").sort((left, right) => left.tag < right.tag ? -1 : left.tag > right.tag ? 1 : 0), directoryEnd = 12 + 16 * ordered.length, size4 = directoryEnd;
    for (let table of ordered)
      size4 += table.bytes.byteLength + 3 & -4;
    let out = new Uint8Array(size4), outView = new DataView(out.buffer);
    outView.setUint32(0, tag), outView.setUint16(4, ordered.length);
    let searchRange = 1, entrySelector = 0;
    for (; searchRange * 2 <= ordered.length; )
      searchRange *= 2, entrySelector += 1;
    outView.setUint16(6, searchRange * 16), outView.setUint16(8, entrySelector), outView.setUint16(10, ordered.length * 16 - searchRange * 16);
    let at = directoryEnd;
    ordered.forEach((table, index4) => {
      out.set(table.bytes, at);
      let entry = 12 + index4 * 16;
      for (let i = 0; i < 4; i++)
        out[entry + i] = table.tag.charCodeAt(i);
      outView.setUint32(entry + 4, fontTableChecksum(out.subarray(at, at + (table.bytes.byteLength + 3 & -4)))), outView.setUint32(entry + 8, at), outView.setUint32(entry + 12, table.bytes.byteLength), table.tag === "head" && (table.bytes = out.subarray(at, at + table.bytes.byteLength)), at += table.bytes.byteLength + 3 & -4;
    });
    let headBytes = ordered.find((input) => input.tag === "head").bytes;
    return new DataView(headBytes.buffer, headBytes.byteOffset, headBytes.byteLength).setUint32(8, uint32(2981146554 - fontTableChecksum(out))), out;
  }
  function nameReferences(tables) {
    let references = [], fvar = tables.find((input) => input.tag === "fvar");
    if (fvar) {
      let data = fvar.bytes;
      if (data.byteLength < 16)
        return;
      let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (view.getUint16(0) !== 1)
        return;
      let axesOffset = view.getUint16(4), axisCount = view.getUint16(8), axisSize = view.getUint16(10), instanceCount = view.getUint16(12), instanceSize = view.getUint16(14);
      if (axisSize < 20 || instanceSize < 4 + 4 * axisCount || axesOffset + axisCount * axisSize + instanceCount * instanceSize > data.byteLength)
        return;
      for (let index4 = 0; index4 < axisCount; index4++) {
        let at = axesOffset + index4 * axisSize + 18;
        references.push({
          table: "fvar",
          id: view.getUint16(at),
          at
        });
      }
      for (let index4 = 0; index4 < instanceCount; index4++) {
        let at = axesOffset + axisCount * axisSize + index4 * instanceSize;
        if (references.push({
          table: "fvar",
          id: view.getUint16(at),
          at
        }), instanceSize >= 6 + 4 * axisCount) {
          let postscriptAt = at + 4 + 4 * axisCount;
          references.push({
            table: "fvar",
            id: view.getUint16(postscriptAt),
            at: postscriptAt
          });
        }
      }
    }
    let stat = tables.find((input) => input.tag === "STAT");
    if (stat) {
      let data = stat.bytes;
      if (data.byteLength < 18)
        return;
      let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (view.getUint16(0) !== 1)
        return;
      let minorVersion = view.getUint16(2), axisSize = view.getUint16(4), axisCount = view.getUint16(6), axesOffset = view.getUint32(8), valueCount = view.getUint16(12), valuesOffset = view.getUint32(14);
      if (axisSize < 8 || axesOffset + axisCount * axisSize > data.byteLength || valuesOffset + valueCount * 2 > data.byteLength)
        return;
      for (let index4 = 0; index4 < axisCount; index4++) {
        let at = axesOffset + index4 * axisSize + 4;
        references.push({
          table: "STAT",
          id: view.getUint16(at),
          at
        });
      }
      for (let index4 = 0; index4 < valueCount; index4++) {
        let value = valuesOffset + view.getUint16(valuesOffset + index4 * 2);
        if (value + 2 > data.byteLength)
          return;
        let format = view.getUint16(value), at = value + 6;
        if (format < 1 || format > 4 || at + 2 > data.byteLength)
          return;
        references.push({
          table: "STAT",
          id: view.getUint16(at),
          at
        });
      }
      if (minorVersion >= 1) {
        if (data.byteLength < 20)
          return;
        references.push({
          table: "STAT",
          id: view.getUint16(18),
          at: 18
        });
      }
    }
    return references;
  }
  return bindRuntimeValue(runtime2, "readFontTables", () => readFontTables), bindRuntimeValue(runtime2, "renameFontFace", () => renameFontFace), bindRuntimeValue(runtime2, "initializeFontTables", () => initializeFontTables, (value) => {
    initializeFontTables = value;
  }), () => {
    FONT_TAG_TRUE = 1953658213, FONT_TAG_CFF = 1330926671, FONT_TAG_COLLECTION = 1953784678, FONT_TAG_WOFF = 2001684038, FONT_TAG_WOFF2 = 2001684018, maxFontNameBytes = 510, maxFontLongNameBytes = 16384, uint32 = (value) => value >>> 0, initializeFontTables = (0, runtime2.initializeOnce)(() => {
      readFontNameIds = [0, 1, 2, 4, 5, 13], rewrittenNameIds = [1, 2, 3, 4, 6, 16, 17], droppedNameIds = [18, 21, 22, 25];
    });
  };
}
export {
  installExportFontTables
};
