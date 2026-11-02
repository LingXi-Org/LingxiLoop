// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorClipboard(runtime2) {
  var FRAME_CLIPBOARD_TYPE, SLIDE_CLIPBOARD_TYPE, videoClipboardHomeMetadata, CLIPBOARD_TEXT_LINE_BREAK_PATTERN, CLIPBOARD_TEXT_CONTROL_BREAK_PATTERN, CLIPBOARD_UNSAFE_TEXT_CHARACTERS_PATTERN, CLIPBOARD_TEXT_LEADING_SPACE_PATTERN, CLIPBOARD_LEADING_JOINER_PATTERN, MAX_PASTED_FRAMES, nodeContainsVideoStill, PASTE_SLIDE_FULL_MESSAGE, PASTE_TABLE_CELLS_FULL_MESSAGE, PASTE_EMBEDS_FULL_MESSAGE, PASTE_IMAGE_STORE_FULL_MESSAGE, PASTE_TABLE_TOO_LARGE_MESSAGE;
  function payloadHasOversizedTable(value, depth = 0) {
    if (typeof value != "object" || value === null || depth > 64)
      return !1;
    let record = value, rows = record.kind === "table" && Array.isArray(record.rows) ? record.rows : [];
    return rows.length > runtime2.maxTableRows || rows.some((row) => Array.isArray(row) && row.length > runtime2.maxTableColumns) ? !0 : Object.values(record).some((child) => payloadHasOversizedTable(child, depth + 1));
  }
  function getClipboardHomeOrigin() {
    return typeof location > "u" ? "" : location.origin;
  }
  function nodeContainsVideo(node) {
    return node.kind === "img" ? !1 : (0, runtime2.nodeChildren)(node)?.some(nodeContainsVideo) === !0;
  }
  function escapeSpreadsheetFormula(text) {
    return /^[\s"]*[=+@-]/.test(text) ? "'" + text : text;
  }
  function sanitizeClipboardText(text) {
    return text.replace(CLIPBOARD_UNSAFE_TEXT_CHARACTERS_PATTERN, "").replace(CLIPBOARD_TEXT_LEADING_SPACE_PATTERN, (input) => input.replace(CLIPBOARD_LEADING_JOINER_PATTERN, ""));
  }
  function sanitizeClipboardTableCell(text) {
    return escapeSpreadsheetFormula(sanitizeClipboardText(text.replace(CLIPBOARD_TEXT_LINE_BREAK_PATTERN, " ")));
  }
  function nodeContainsTable(node) {
    return node.kind === "table" ? !0 : (0, runtime2.nodeChildren)(node)?.some(nodeContainsTable) ?? !1;
  }
  function collectFrameClipboardText(frame, tabular) {
    let parts = [], cleanText = (input) => tabular ? input.split(`
`).map((input2) => escapeSpreadsheetFormula(sanitizeClipboardText(input2.replace(CLIPBOARD_TEXT_CONTROL_BREAK_PATTERN, " ")))).join(`
`) : input, visit = (source) => {
      if (source.kind === "text" && source.text !== "")
        parts.push(cleanText(source.text));
      else if (source.kind === "img" && source.alt !== "")
        parts.push(cleanText(source.alt));
      else if (source.kind === "icon")
        parts.push(cleanText(source.icon));
      else if (source.kind === "table") {
        if (source.rows.some((input) => input.some((input2) => input2 !== "")))
          for (let value of source.rows)
            parts.push(value.map(sanitizeClipboardTableCell).join("	"));
      } else {
        let value = (0, runtime2.nodeChildren)(source);
        if (value !== void 0)
          for (let value2 of value)
            visit(value2);
      }
    };
    return visit(frame.node), parts;
  }
  function framesClipboardText(frames) {
    let tabular = frames.some((input) => nodeContainsTable(input.node)), parts = [];
    for (let value of frames)
      parts.push(...collectFrameClipboardText(value, tabular));
    return parts.join(`
`);
  }
  function slideClipboardText(slide) {
    return slidesClipboardText([slide]);
  }
  function slidesClipboardText(slides) {
    let tabular = slides.some((input) => input.frames.some((input2) => nodeContainsTable(input2.node)));
    return slides.map((input) => {
      let items = [];
      for (let value of input.frames)
        items.push(...collectFrameClipboardText(value, tabular));
      return items.join(`
`);
    }).join(`

`);
  }
  function collectClipboardAssets(node, assets, collected) {
    if (node.kind === "img" && node.asset !== void 0) {
      let entry = assets.get(node.asset);
      entry !== void 0 && (collected[node.asset] = entry);
    }
    let children = (0, runtime2.nodeChildren)(node);
    if (children !== void 0)
      for (let value of children)
        collectClipboardAssets(value, assets, collected);
  }
  function createFramesClipboardPayload(frames, assets) {
    let collected = {};
    for (let value of frames)
      collectClipboardAssets(value.node, assets, collected);
    return {
      frame: frames[0],
      frames: [...frames],
      assets: collected,
      ...videoClipboardHomeMetadata(frames)
    };
  }
  function createSlideClipboardPayload(slide, assets) {
    let collected = {};
    for (let value of slide.frames)
      collectClipboardAssets(value.node, assets, collected);
    return {
      slide,
      assets: collected,
      ...videoClipboardHomeMetadata(slide.frames)
    };
  }
  function createSlidesClipboardPayload(slides, assets) {
    let collected = {};
    for (let value of slides)
      for (let value2 of value.frames)
        collectClipboardAssets(value2.node, assets, collected);
    return {
      slide: slides[0],
      slides: [...slides],
      assets: collected,
      ...videoClipboardHomeMetadata(slides.flatMap((input) => input.frames))
    };
  }
  function sanitizePastedNode(node, foreignHome) {
    if (node.kind === "img") {
      let value = node.src !== void 0 && node.src.length > runtime2.maxInlineImageBytes, value2 = foreignHome && !1, stillStamp = foreignHome && (0, runtime2.isVideoStillStamp)(void 0);
      if (!value && !value2 && !stillStamp)
        return node;
      let state = {
        ...node
      };
      return (value || stillStamp) && (delete state.src, delete state.crop, delete state.videoStill), value2 && (delete state.video, delete state.videoStart, delete state.videoDelay, delete state.videoSound, delete state.videoLoop, delete state.videoStill), state;
    }
    if (node.kind === "text" && node.fill?.kind === "image" && node.fill.src.length > runtime2.maxInlineImageBytes) {
      let { fill: value, ...value2 } = node;
      return value2;
    }
    if ((0, runtime2.isFlowContainer)(node)) {
      let value = node.children.map((input) => sanitizePastedNode(input, foreignHome));
      return value.some((input, options) => input !== node.children[options]) ? {
        ...node,
        children: value
      } : node;
    }
    if ((0, runtime2.isOverlayNode)(node)) {
      let value = sanitizePastedNode(node.base, foreignHome), value2 = node.layers.map((input) => {
        let value3 = sanitizePastedNode(input.node, foreignHome);
        return value3 !== input.node ? {
          ...input,
          node: value3
        } : input;
      });
      return value !== node.base || value2.some((input, options) => input !== node.layers[options]) ? {
        ...node,
        base: value,
        layers: value2
      } : node;
    }
    return node;
  }
  function remapNodeAssets(node, mapAsset) {
    if (node.kind === "img" && node.asset !== void 0) {
      let value = mapAsset(node.asset);
      if (value === node.asset)
        return node;
      let state = {
        ...node
      };
      return value === null ? (delete state.asset, delete state.crop) : state.asset = value, state;
    }
    if ((0, runtime2.isFlowContainer)(node)) {
      let value = node.children.map((input) => remapNodeAssets(input, mapAsset));
      return value.some((input, options) => input !== node.children[options]) ? {
        ...node,
        children: value
      } : node;
    }
    if ((0, runtime2.isOverlayNode)(node)) {
      let value = remapNodeAssets(node.base, mapAsset), value2 = node.layers.map((input) => {
        let value3 = remapNodeAssets(input.node, mapAsset);
        return value3 !== input.node ? {
          ...input,
          node: value3
        } : input;
      });
      return value !== node.base || value2.some((input, options) => input !== node.layers[options]) ? {
        ...node,
        base: value,
        layers: value2
      } : node;
    }
    return node;
  }
  function createClipboardAssetImporter(clipboardAssets, existingAssets) {
    let assetsBySource = /* @__PURE__ */ new Map();
    for (let [value, value2] of existingAssets)
      assetsBySource.set(value2, value);
    let addedAssets = [], remappedIds = /* @__PURE__ */ new Map();
    return {
      map: (input) => {
        let entry = remappedIds.get(input);
        if (entry !== void 0)
          return entry;
        let value = Object.hasOwn(clipboardAssets, input) ? clipboardAssets[input] : void 0;
        if (typeof value == "string" && value.length <= runtime2.maxInlineImageBytes && (0, runtime2.isAllowedImageSource)(value)) {
          let entry2 = assetsBySource.get(value);
          if (entry2 !== void 0)
            return remappedIds.set(input, entry2), entry2;
          let value2 = (0, runtime2.createModelId)();
          return remappedIds.set(input, value2), assetsBySource.set(value, value2), addedAssets.push([value2, value]), value2;
        }
        return existingAssets.has(input) ? input : null;
      },
      addAssets: addedAssets
    };
  }
  function parsePastedFrames(payload, slide, assets) {
    let record = typeof payload == "object" && payload !== null ? payload : {}, frames = Array.isArray(record.frames) ? record.frames.slice(0, MAX_PASTED_FRAMES) : record.frame !== void 0 ? [record.frame] : [];
    if (frames.length === 0)
      return {
        error: (0, runtime2.formatMessage)({
          defaultMessage: "没有可粘贴的内容。",
          id: "MF4cpkC2OS"
        })
      };
    if (slide.frames.length + frames.length > runtime2.maxSlideFrames)
      return {
        error: PASTE_SLIDE_FULL_MESSAGE
      };
    let value = typeof record.assets == "object" && record.assets !== null ? record.assets : {};
    if (payloadHasOversizedTable(frames))
      return {
        error: PASTE_TABLE_TOO_LARGE_MESSAGE
      };
    let value2 = frames.map((input) => (0, runtime2.normalizeSlideFrame)(input)), value3 = value2.reduce((input, options) => input + (0, runtime2.countNodeTableCells)(options.node), 0);
    if (value3 > 0 && (0, runtime2.countSlideTableCells)(slide) + value3 > runtime2.maxSlideTableCells)
      return {
        error: PASTE_TABLE_CELLS_FULL_MESSAGE
      };
    let value4 = value2.reduce((input, options) => input + (0, runtime2.countNodeEmbeds)(options.node), 0);
    if (value4 > 0 && (0, runtime2.countSlideEmbeds)(slide) + value4 > runtime2.maxSlideHtmlEmbeds)
      return {
        error: PASTE_EMBEDS_FULL_MESSAGE
      };
    let value5 = createClipboardAssetImporter(value, assets), value6 = record.home !== getClipboardHomeOrigin(), value7 = value2.some((input) => nodeContainsVideo(input.node)), value8 = value2.map((input) => ({
      ...input,
      id: (0, runtime2.createModelId)(),
      node: sanitizePastedNode(remapNodeAssets(input.node, value5.map), value6)
    })), addAssets = value5.addAssets;
    if (assets.size + addAssets.length > runtime2.maxDeckAssets)
      return {
        error: PASTE_IMAGE_STORE_FULL_MESSAGE
      };
    let callback = (input) => slide.frames.some((input2) => JSON.stringify(input2.x) === JSON.stringify(input.x) && JSON.stringify(input2.y) === JSON.stringify(input.y)), callback2 = (input) => input.some(callback);
    for (let index4 = 0; index4 < 20 && callback2(value8); index4++)
      value8 = value8.map((input) => ({
        ...input,
        x: (0, runtime2.moveAxisSpec)(input.x, 24),
        y: (0, runtime2.moveAxisSpec)(input.y, 24)
      }));
    return {
      frames: value8,
      addAssets,
      ...value6 && value7 ? {
        leftClips: !0
      } : {}
    };
  }
  function countNodeEffects(node) {
    let effects = 0, animated = 0, visit = (input) => {
      let style = input.style;
      style !== void 0 && (effects += (0, runtime2.paintEffectCost)(style), style.animation !== void 0 && (animated += 1));
      let value = (0, runtime2.nodeChildren)(input);
      if (value !== void 0)
        for (let value2 of value)
          visit(value2);
    };
    return visit(node), {
      effects,
      animated
    };
  }
  function countSlideEffects(slides) {
    let effects = 0, animated = 0;
    for (let value of slides)
      for (let value2 of value.frames) {
        let value3 = countNodeEffects(value2.node);
        effects += value3.effects, animated += value3.animated;
      }
    return {
      effects,
      animated
    };
  }
  function parsePastedSlides(payload, slides, assets) {
    let record = typeof payload == "object" && payload !== null ? payload : {}, count = Array.isArray(record.slides) && record.slides.length > 0 ? record.slides.length : 1;
    if (slides.length + count > runtime2.maxDeckSlides)
      return {
        error: count > 1 && slides.length < runtime2.maxDeckSlides ? (0, runtime2.formatMessage)({
          defaultMessage: "无法再添加 {count} 页，演示文稿最多容纳 {max} 页。请先删除部分幻灯片。",
          id: "fTIRcDmsQ4"
        }, {
          n: count,
          count: String(count),
          max: String(runtime2.maxDeckSlides)
        }) : (0, runtime2.formatMessage)({
          defaultMessage: "此演示文稿已满（{max} 页），请先删除一页。",
          id: "+sk55b1xpA"
        }, {
          max: runtime2.maxDeckSlides
        })
      };
    let value = Array.isArray(record.slides) && record.slides.length > 0 ? record.slides : [record.slide], value2 = typeof record.assets == "object" && record.assets !== null ? record.assets : {};
    if (payloadHasOversizedTable(value))
      return {
        error: PASTE_TABLE_TOO_LARGE_MESSAGE
      };
    let value3 = value.map((input) => (0, runtime2.normalizeSlide)(input, (0, runtime2.createModelId)())), value4 = (0, runtime2.countDeckTableCells)(value3);
    if (value4 > 0 && (0, runtime2.countDeckTableCells)(slides) + value4 > runtime2.maxDeckTableCells)
      return {
        error: (0, runtime2.formatMessage)({
          defaultMessage: "此演示文稿的表格单元格数已达上限，请先删除部分单元格。",
          id: "LaV+ulhUKP"
        })
      };
    let value5 = countSlideEffects(value3);
    if (value5.effects > 0 || value5.animated > 0) {
      let value9 = countSlideEffects(slides);
      if (value5.effects > 0 && value5.effects + value9.effects > runtime2.maxSlidePaintCost)
        return {
          error: (0, runtime2.formatMessage)({
            defaultMessage: "此演示文稿的视觉效果数已达上限，请先移除部分效果。",
            id: "ZGLtPTsZio"
          })
        };
      if (value5.animated > 0 && value5.animated + value9.animated > runtime2.maxSlideAnimations)
        return {
          error: (0, runtime2.formatMessage)({
            defaultMessage: "此演示文稿的动画数已达上限，请先移除部分动画。",
            id: "P1U588cMyk"
          })
        };
    }
    let value6 = createClipboardAssetImporter(value2, assets), value7 = record.home !== getClipboardHomeOrigin(), entries = /* @__PURE__ */ new Map(), callback = (input) => entries.get(input) ?? (entries.set(input, (0, runtime2.createModelId)()), entries.get(input)), value8 = value3.map((input) => ({
      ...input,
      id: (0, runtime2.createModelId)(),
      frames: input.frames.map((input2) => ({
        ...input2,
        id: callback(input2.id),
        node: sanitizePastedNode(remapNodeAssets(input2.node, value6.map), value7)
      }))
    }));
    return assets.size + value6.addAssets.length > runtime2.maxDeckAssets ? {
      error: PASTE_IMAGE_STORE_FULL_MESSAGE
    } : {
      slides: value8,
      addAssets: value6.addAssets,
      ...value7 && value3.some((input) => input.frames.some((input2) => nodeContainsVideo(input2.node))) ? {
        leftClips: !0
      } : {}
    };
  }
  function clipboardPressTargetMatches(press, pressCount, target) {
    return pressCount === press.presses && (target === press.from || target === null || target === target.ownerDocument.body);
  }
  return bindRuntimeValue(runtime2, "FRAME_CLIPBOARD_TYPE", () => FRAME_CLIPBOARD_TYPE, (value) => {
    FRAME_CLIPBOARD_TYPE = value;
  }), bindRuntimeValue(runtime2, "SLIDE_CLIPBOARD_TYPE", () => SLIDE_CLIPBOARD_TYPE, (value) => {
    SLIDE_CLIPBOARD_TYPE = value;
  }), bindRuntimeValue(runtime2, "getClipboardHomeOrigin", () => getClipboardHomeOrigin), bindRuntimeValue(runtime2, "nodeContainsVideo", () => nodeContainsVideo), bindRuntimeValue(runtime2, "videoClipboardHomeMetadata", () => videoClipboardHomeMetadata, (value) => {
    videoClipboardHomeMetadata = value;
  }), bindRuntimeValue(runtime2, "nodeContainsVideoStill", () => nodeContainsVideoStill, (value) => {
    nodeContainsVideoStill = value;
  }), bindRuntimeValue(runtime2, "PASTE_SLIDE_FULL_MESSAGE", () => PASTE_SLIDE_FULL_MESSAGE, (value) => {
    PASTE_SLIDE_FULL_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "PASTE_TABLE_CELLS_FULL_MESSAGE", () => PASTE_TABLE_CELLS_FULL_MESSAGE, (value) => {
    PASTE_TABLE_CELLS_FULL_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "PASTE_EMBEDS_FULL_MESSAGE", () => PASTE_EMBEDS_FULL_MESSAGE, (value) => {
    PASTE_EMBEDS_FULL_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "PASTE_IMAGE_STORE_FULL_MESSAGE", () => PASTE_IMAGE_STORE_FULL_MESSAGE, (value) => {
    PASTE_IMAGE_STORE_FULL_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "PASTE_TABLE_TOO_LARGE_MESSAGE", () => PASTE_TABLE_TOO_LARGE_MESSAGE, (value) => {
    PASTE_TABLE_TOO_LARGE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "payloadHasOversizedTable", () => payloadHasOversizedTable), bindRuntimeValue(runtime2, "escapeSpreadsheetFormula", () => escapeSpreadsheetFormula), bindRuntimeValue(runtime2, "CLIPBOARD_TEXT_LINE_BREAK_PATTERN", () => CLIPBOARD_TEXT_LINE_BREAK_PATTERN, (value) => {
    CLIPBOARD_TEXT_LINE_BREAK_PATTERN = value;
  }), bindRuntimeValue(runtime2, "CLIPBOARD_TEXT_CONTROL_BREAK_PATTERN", () => CLIPBOARD_TEXT_CONTROL_BREAK_PATTERN, (value) => {
    CLIPBOARD_TEXT_CONTROL_BREAK_PATTERN = value;
  }), bindRuntimeValue(runtime2, "CLIPBOARD_UNSAFE_TEXT_CHARACTERS_PATTERN", () => CLIPBOARD_UNSAFE_TEXT_CHARACTERS_PATTERN, (value) => {
    CLIPBOARD_UNSAFE_TEXT_CHARACTERS_PATTERN = value;
  }), bindRuntimeValue(runtime2, "CLIPBOARD_TEXT_LEADING_SPACE_PATTERN", () => CLIPBOARD_TEXT_LEADING_SPACE_PATTERN, (value) => {
    CLIPBOARD_TEXT_LEADING_SPACE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "CLIPBOARD_LEADING_JOINER_PATTERN", () => CLIPBOARD_LEADING_JOINER_PATTERN, (value) => {
    CLIPBOARD_LEADING_JOINER_PATTERN = value;
  }), bindRuntimeValue(runtime2, "sanitizeClipboardText", () => sanitizeClipboardText), bindRuntimeValue(runtime2, "sanitizeClipboardTableCell", () => sanitizeClipboardTableCell), bindRuntimeValue(runtime2, "nodeContainsTable", () => nodeContainsTable), bindRuntimeValue(runtime2, "collectFrameClipboardText", () => collectFrameClipboardText), bindRuntimeValue(runtime2, "framesClipboardText", () => framesClipboardText), bindRuntimeValue(runtime2, "slideClipboardText", () => slideClipboardText), bindRuntimeValue(runtime2, "slidesClipboardText", () => slidesClipboardText), bindRuntimeValue(runtime2, "collectClipboardAssets", () => collectClipboardAssets), bindRuntimeValue(runtime2, "createFramesClipboardPayload", () => createFramesClipboardPayload), bindRuntimeValue(runtime2, "createSlideClipboardPayload", () => createSlideClipboardPayload), bindRuntimeValue(runtime2, "createSlidesClipboardPayload", () => createSlidesClipboardPayload), bindRuntimeValue(runtime2, "sanitizePastedNode", () => sanitizePastedNode), bindRuntimeValue(runtime2, "remapNodeAssets", () => remapNodeAssets), bindRuntimeValue(runtime2, "createClipboardAssetImporter", () => createClipboardAssetImporter), bindRuntimeValue(runtime2, "MAX_PASTED_FRAMES", () => MAX_PASTED_FRAMES, (value) => {
    MAX_PASTED_FRAMES = value;
  }), bindRuntimeValue(runtime2, "parsePastedFrames", () => parsePastedFrames), bindRuntimeValue(runtime2, "countNodeEffects", () => countNodeEffects), bindRuntimeValue(runtime2, "countSlideEffects", () => countSlideEffects), bindRuntimeValue(runtime2, "parsePastedSlides", () => parsePastedSlides), bindRuntimeValue(runtime2, "clipboardPressTargetMatches", () => clipboardPressTargetMatches), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeModelEditing)(), FRAME_CLIPBOARD_TYPE = "slides-frame", SLIDE_CLIPBOARD_TYPE = "slides-slide", nodeContainsVideoStill = (node) => node.kind === "img" ? (0, runtime2.isVideoStillStamp)(void 0) : (0, runtime2.nodeChildren)(node)?.some(nodeContainsVideoStill) === !0, videoClipboardHomeMetadata = (frames) => frames.some((input) => nodeContainsVideo(input.node) || nodeContainsVideoStill(input.node)) ? {
      home: getClipboardHomeOrigin()
    } : {}, CLIPBOARD_TEXT_LINE_BREAK_PATTERN = /[\t\v\f\r\n\u0085\u2028\u2029]/g, CLIPBOARD_TEXT_CONTROL_BREAK_PATTERN = /[\t\v\f\r\u0085\u2028\u2029]/g, CLIPBOARD_UNSAFE_TEXT_CHARACTERS_PATTERN = /[\p{Cc}\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu, CLIPBOARD_TEXT_LEADING_SPACE_PATTERN = /^[\s"\u200c\u200d]+/, CLIPBOARD_LEADING_JOINER_PATTERN = /[\u200c\u200d]/g, MAX_PASTED_FRAMES = runtime2.maxSlideFrames, PASTE_SLIDE_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页已满，请先移除一个元素。",
      id: "rVJPt03VKF"
    }), PASTE_TABLE_CELLS_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页无法容纳该表格的单元格，请先删除部分单元格。",
      id: "M8h9SlVU/1"
    }), PASTE_EMBEDS_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页的网页嵌入内容已达上限（{max} 个），请先移除一个。",
      id: "q9dWZ6pp6V"
    }, {
      max: runtime2.maxSlideHtmlEmbeds
    }), PASTE_IMAGE_STORE_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此演示文稿的图片数已达上限（{max} 张），请先移除一张。",
      id: "Ocl8wiUmJl"
    }, {
      max: runtime2.maxDeckAssets
    }), PASTE_TABLE_TOO_LARGE_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "表格的行数或列数超出幻灯片限制，未能粘贴。",
      id: "wyDn/diYSp"
    });
  };
}
export {
  installEditorClipboard
};
