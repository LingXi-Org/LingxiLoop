// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportNotesPages(runtime2) {
  var notesPageExports, NOTES_PAGE, NOTES_TEXT_TOP, NOTES_TEXT_HEIGHT, NOTES_TEXT_WIDTH, NOTES_LINES_PER_PAGE, NOTES_COLUMNS_PER_LINE, WIDE_GLYPH_PATTERN, notesGlyphWidth, NOTES_PICTURE_PLACEMENT, notesPictureAsset, initializeNotesPages;
  function splitNotesLine(text, maxWidth) {
    let value = Array.from(text), index4 = 0, index22 = 0;
    for (; index22 < value.length && index4 + notesGlyphWidth(value[index22]) <= maxWidth; )
      index4 += notesGlyphWidth(value[index22++]);
    return index22 === 0 && (index22 = 1), [value.slice(0, index22).join(""), value.slice(index22).join("")];
  }
  function paginateNotes(text, maxLines = NOTES_LINES_PER_PAGE, maxColumns = NOTES_COLUMNS_PER_LINE, maxPages = NOTES_PAGE.maxPages) {
    let value = Math.max(1, maxLines), value2 = Math.max(1, maxColumns), items = [];
    for (let value4 of text.replace(/\r\n?/g, `
`).split(`
`)) {
      let text2 = "", value5 = `
`, callback = (input) => {
        items.push({
          text: text2,
          glue: value5
        }), text2 = "", value5 = input;
      };
      for (let value6 of value4.split(/[ \t]+/).filter((input) => input !== "")) {
        let value7 = value6;
        for (; notesGlyphWidth(value7) > value2; ) {
          text2 !== "" && callback(" ");
          let [value8, value9] = splitNotesLine(value7, value2);
          text2 = value8, callback(""), value7 = value9;
        }
        text2 === "" ? text2 = value7 : notesGlyphWidth(text2) + 1 + notesGlyphWidth(value7) <= value2 ? text2 += " " + value7 : (callback(" "), text2 = value7);
      }
      callback(`
`);
    }
    for (; items.length > 0 && items[items.length - 1].text.trim() === ""; )
      items.pop();
    for (; items.length > 0 && items[0].text.trim() === ""; )
      items.shift();
    let items2 = [], flag = !1, value3 = Math.max(1, maxPages);
    for (let index4 = 0; index4 < items.length; index4 += value) {
      let value4 = items2.length + 1 >= value3 ? items.slice(index4) : items.slice(index4, index4 + value), value5 = value4.map((input, options) => (options === 0 ? "" : input.glue) + input.text).join("").trim();
      if (value5 !== "" && items2.push(value5), items2.length >= value3) {
        flag = value4.length > value;
        break;
      }
    }
    return {
      pages: items2,
      cut: flag
    };
  }
  function notesPageSlides(slide, slideNumber, mapNode = (input) => input) {
    let { pages, cut } = paginateNotes(slide.notes ?? "");
    return {
      pages: pages.map((input, options) => {
        let value = mapNode({
          kind: "text",
          role: "body",
          text: input,
          color: "#1f1f1f",
          align: "start",
          fit: "shrink"
        }), state = {
          ...value.style,
          fontSize: NOTES_PAGE.fontPx,
          lineHeight: NOTES_PAGE.lineHeight
        };
        return {
          v: 1,
          id: slide.id + "-notes-" + String(options + 1),
          bg: "#ffffff",
          frames: [
            {
              id: "picture",
              x: {
                anchor: "center",
                margin: 0,
                offset: 0,
                size: NOTES_PICTURE_PLACEMENT.w
              },
              y: {
                anchor: "leading",
                margin: NOTES_PICTURE_PLACEMENT.y,
                offset: 0,
                size: NOTES_PICTURE_PLACEMENT.h
              },
              node: {
                kind: "img",
                asset: notesPictureAsset(slide.id),
                alt: "幻灯片 " + String(slideNumber),
                fit: "contain"
              }
            },
            {
              id: "notes",
              x: {
                anchor: "fill",
                margin: NOTES_PAGE.margin,
                offset: 0
              },
              y: {
                anchor: "leading",
                margin: NOTES_TEXT_TOP,
                offset: 0,
                size: NOTES_TEXT_HEIGHT
              },
              node: {
                ...value,
                style: state
              }
            }
          ]
        };
      }),
      cut
    };
  }
  function planNotesPages(slides, mapNode) {
    let items = [], items2 = [], items3 = [];
    return slides.forEach((input, options) => {
      let value = notesPageSlides(input, options + 1, mapNode);
      items2.push(value.pages.length), items.push(...value.pages), value.cut && items3.push(options + 1);
    }), {
      noteSlides: items,
      after: items2,
      cut: items3
    };
  }
  function notesPictureAssets(slides, captures, pageCounts) {
    let entries = /* @__PURE__ */ new Map();
    return slides.forEach((input, options) => {
      (pageCounts[options] ?? 0) > 0 && entries.set(notesPictureAsset(input.id), "data:image/jpeg;base64," + (0, runtime2.bytesToBase64)(captures[options].jpeg));
    }), entries;
  }
  function transformSlideForNotesPage(slide, pageHeight, scale) {
    let scale2 = NOTES_PICTURE_PLACEMENT.scale, value = NOTES_PICTURE_PLACEMENT.x * scale, value2 = pageHeight - (NOTES_PICTURE_PLACEMENT.y + NOTES_PICTURE_PLACEMENT.h) * scale, value3 = runtime2.SLIDE_WIDTH * scale, callback = (input) => {
      let value4 = Math.max(0, input.xPt);
      return {
        ...input,
        xPt: value4,
        widthPt: Math.max(0, Math.min(value3, input.xPt + input.widthPt) - value4)
      };
    };
    return {
      textRuns: slide.textRuns.map(callback).map((input) => ({
        ...input,
        xPt: value + input.xPt * scale2,
        yPt: value2 + input.yPt * scale2,
        sizePt: input.sizePt * scale2,
        widthPt: input.widthPt * scale2
      })),
      links: slide.links.map((input) => ({
        ...input,
        xPt: value + input.xPt * scale2,
        yPt: value2 + input.yPt * scale2,
        widthPt: input.widthPt * scale2,
        heightPt: input.heightPt * scale2
      })),
      blocks: (slide.blocks ?? []).map((input) => {
        if (input.box === void 0)
          return input;
        let value4 = Math.max(0, input.box.xPt), value5 = Math.max(0, input.box.yPt), value6 = Math.max(0, Math.min(value3, input.box.xPt + input.box.widthPt) - value4), value7 = Math.max(0, Math.min(pageHeight, input.box.yPt + input.box.heightPt) - value5);
        return {
          ...input,
          box: {
            xPt: value + value4 * scale2,
            yPt: value2 + value5 * scale2,
            widthPt: value6 * scale2,
            heightPt: value7 * scale2
          }
        };
      })
    };
  }
  function placeNotesPages(slides, notePages, after, scale) {
    let items = [], value = runtime2.SLIDE_HEIGHT * scale, index4 = 0;
    return slides.forEach((input, options) => {
      let value2 = after[options] ?? 0;
      if (value2 === 0) {
        items.push(input);
        return;
      }
      let value3 = transformSlideForNotesPage(input, value, scale), blocks = value3.blocks, value4 = value3.links.reduce((input2, options2) => options2.anchor === void 0 ? input2 : Math.max(input2, options2.anchor + 1), 0);
      for (let index22 = 0; index22 < value2; index22++) {
        let value5 = notePages[index4++], value6 = value5.textRuns.map((input2) => {
          let value9 = input2.block === void 0 ? input2 : {
            ...input2,
            block: input2.block + blocks.length
          };
          return value9.link === void 0 ? value9 : {
            ...value9,
            link: value9.link + value4
          };
        }), value7 = value5.links.map((input2) => input2.anchor === void 0 ? input2 : {
          ...input2,
          anchor: input2.anchor + value4
        });
        if (index22 === 0) {
          items.push({
            ...value5,
            textRuns: [...value3.textRuns, ...value6],
            blocks: [...blocks, ...value5.blocks ?? []],
            links: [...value3.links, ...value7]
          });
          continue;
        }
        let items2 = [
          ...blocks.map(() => ({
            role: "Artifact"
          })),
          ...value5.blocks ?? [],
          {
            role: "Artifact"
          }
        ], value8 = value3.textRuns.map((input2) => input2.block === void 0 ? {
          ...input2,
          block: items2.length - 1
        } : input2);
        items.push({
          ...value5,
          textRuns: [...value8, ...value6],
          blocks: items2,
          links: [...value3.links, ...value7]
        });
      }
    }), items;
  }
  return bindRuntimeValue(runtime2, "notesPageExports", () => notesPageExports, (value) => {
    notesPageExports = value;
  }), bindRuntimeValue(runtime2, "splitNotesLine", () => splitNotesLine), bindRuntimeValue(runtime2, "paginateNotes", () => paginateNotes), bindRuntimeValue(runtime2, "notesPageSlides", () => notesPageSlides), bindRuntimeValue(runtime2, "planNotesPages", () => planNotesPages), bindRuntimeValue(runtime2, "notesPictureAssets", () => notesPictureAssets), bindRuntimeValue(runtime2, "transformSlideForNotesPage", () => transformSlideForNotesPage), bindRuntimeValue(runtime2, "placeNotesPages", () => placeNotesPages), bindRuntimeValue(runtime2, "NOTES_PAGE", () => NOTES_PAGE, (value) => {
    NOTES_PAGE = value;
  }), bindRuntimeValue(runtime2, "NOTES_TEXT_TOP", () => NOTES_TEXT_TOP, (value) => {
    NOTES_TEXT_TOP = value;
  }), bindRuntimeValue(runtime2, "NOTES_TEXT_HEIGHT", () => NOTES_TEXT_HEIGHT, (value) => {
    NOTES_TEXT_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "NOTES_TEXT_WIDTH", () => NOTES_TEXT_WIDTH, (value) => {
    NOTES_TEXT_WIDTH = value;
  }), bindRuntimeValue(runtime2, "NOTES_LINES_PER_PAGE", () => NOTES_LINES_PER_PAGE, (value) => {
    NOTES_LINES_PER_PAGE = value;
  }), bindRuntimeValue(runtime2, "NOTES_COLUMNS_PER_LINE", () => NOTES_COLUMNS_PER_LINE, (value) => {
    NOTES_COLUMNS_PER_LINE = value;
  }), bindRuntimeValue(runtime2, "WIDE_GLYPH_PATTERN", () => WIDE_GLYPH_PATTERN, (value) => {
    WIDE_GLYPH_PATTERN = value;
  }), bindRuntimeValue(runtime2, "notesGlyphWidth", () => notesGlyphWidth, (value) => {
    notesGlyphWidth = value;
  }), bindRuntimeValue(runtime2, "NOTES_PICTURE_PLACEMENT", () => NOTES_PICTURE_PLACEMENT, (value) => {
    NOTES_PICTURE_PLACEMENT = value;
  }), bindRuntimeValue(runtime2, "notesPictureAsset", () => notesPictureAsset, (value) => {
    notesPictureAsset = value;
  }), bindRuntimeValue(runtime2, "initializeNotesPages", () => initializeNotesPages, (value) => {
    initializeNotesPages = value;
  }), () => {
    notesPageExports = {}, (0, runtime2.defineLiveExports)(notesPageExports, {
      planNotesPages: () => planNotesPages,
      placeNotesPages: () => placeNotesPages,
      paginateNotes: () => paginateNotes,
      notesPictureAssets: () => notesPictureAssets,
      notesPictureAsset: () => notesPictureAsset,
      notesPageSlides: () => notesPageSlides,
      NOTES_PAGE: () => NOTES_PAGE,
      NOTES_LINES_PER_PAGE: () => NOTES_LINES_PER_PAGE,
      NOTES_COLS_PER_LINE: () => NOTES_COLUMNS_PER_LINE
    }), notesGlyphWidth = (input) => Array.from(input).reduce((input2, options) => input2 + (WIDE_GLYPH_PATTERN.test(options) ? 2 : 1), 0), notesPictureAsset = (slideId) => "notes-picture-" + slideId, initializeNotesPages = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), NOTES_PAGE = {
        margin: 64,
        pictureHeight: 432,
        gap: 40,
        fontPx: 26,
        lineHeight: 1.4,
        glyphEm: 0.55,
        maxPages: 8
      }, NOTES_TEXT_TOP = NOTES_PAGE.margin + NOTES_PAGE.pictureHeight + NOTES_PAGE.gap, NOTES_TEXT_HEIGHT = runtime2.SLIDE_HEIGHT - NOTES_TEXT_TOP - NOTES_PAGE.margin, NOTES_TEXT_WIDTH = runtime2.SLIDE_WIDTH - 2 * NOTES_PAGE.margin, NOTES_LINES_PER_PAGE = Math.floor(NOTES_TEXT_HEIGHT / (NOTES_PAGE.fontPx * NOTES_PAGE.lineHeight)), NOTES_COLUMNS_PER_LINE = Math.floor(NOTES_TEXT_WIDTH / (NOTES_PAGE.fontPx * NOTES_PAGE.glyphEm)), WIDE_GLYPH_PATTERN = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u, NOTES_PICTURE_PLACEMENT = (() => {
        let value = Math.round(NOTES_PAGE.pictureHeight * runtime2.SLIDE_WIDTH / runtime2.SLIDE_HEIGHT);
        return {
          x: (runtime2.SLIDE_WIDTH - value) / 2,
          y: NOTES_PAGE.margin,
          w: value,
          h: NOTES_PAGE.pictureHeight,
          scale: NOTES_PAGE.pictureHeight / runtime2.SLIDE_HEIGHT
        };
      })();
    });
  };
}
export {
  installExportNotesPages
};
