// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelDeck(runtime2) {
  var SLIDE_WIDTH, SLIDE_HEIGHT, defaultMediaSize, textRoles, textRoleLabels, maxTextMarks, maxVideoDelaySeconds, slideIconNames, shapeVariants, shapeVariantLabels, connectorCornerValues, connectorHeadValues, arrowHeadKindValues, connectorRoutingValues, defaultShapeStrokeWidth, arrowHeadLengthFactor, filledArrowHeadWidthFactor, openArrowHeadWidthFactor, arrowShaftInsetFactor, shadowPresetNames, shadowPresets, maxShapeStrokeWidth, maxShapeCornerRadius, anthropicAccentColor, maxGridTracks, maxGridGap, textFitValues, defaultTextFit, textFitMinimumScale, minimumTextFontSize, maxTextLineSpacing, buildEffectValues, maxBuildOrder, slideTransitionValues, normalizeListRenderingMode, defaultListGutter, textListGutter, slideHexColorPattern, slideColorNames, imageBase64DataUrlPattern, svgUtf8DataUrlPattern, svgDataUrlPattern, maxInlineSvgBytes, maxInlineImageBytes, modelStoredBlobPattern, modelEmulatorBlobPattern, designSystemAssetPathSource, designSystemImagePathPattern, slideModelEmulatorDetected, themeFontFamilyKinds, embeddedFontDataUrlPattern, maxEmbeddedFontBytes, googleFontStylesheetPattern, maxFontStylesheetUrlLength, reservedModelFontFamilyNames, designSystemFontPathSource, designSystemFontPathPattern, maxDeckFontFaces, maxDeckFontCssBytes, maxDeckAssetBytes, modelIdPattern, maxModelCoordinate, maxNodeTextLength, maxSlideNotesLength, maxSectionDescriptionLength, maxHtmlEmbedBytes, maxSlideHtmlEmbeds, maxSlideFrames, maxNodeTreeDepth, maxTableColumns, maxTableRows, maxSlideTableCells, maxDeckTableCells, tableCellKeyPattern, maxSlidePaintCost, maxSlideAnimations, maxDeckSections, descriptionControlCharacterPattern, maxDeckSlides, maxDeckAssets, maxDeckStyleLength, maxFlexFactor, maxNodeSlots, slotNamePattern, percentSizeNodeKinds, formatNodeSlots, listIndentCss, enumStringOrUndefined, initializeSlideModel;
  function normalizeVideoDelay(delay) {
    let value = typeof delay == "number" ? delay : typeof delay == "string" && delay.trim() !== "" ? Number(delay) : NaN;
    if (!Number.isFinite(value))
      return;
    let normalized = Math.round(Math.min(value, maxVideoDelaySeconds) * 10) / 10;
    if (normalized > 0)
      return normalized;
  }
  function serializeImageCrop(crop) {
    let callback = (input) => String(Math.round(input * 1e5) / 1e3) + "%";
    return String(crop.zoom) + " " + callback(crop.x) + " " + callback(crop.y);
  }
  function parseImageCrop(cropText) {
    let value = /^(\d{1,9}(?:\.\d{1,6})?) (\d{1,9}(?:\.\d{1,6})?)% (\d{1,9}(?:\.\d{1,6})?)%$/.exec((cropText ?? "").trim().replace(/\s+/g, " "));
    if (value)
      return (0, runtime2.normalizeImageCrop)({
        zoom: Number(value[1]),
        x: Number(value[2]) / 100,
        y: Number(value[3]) / 100
      }) ?? null;
  }
  function connectorArrowInset(strokeWidth) {
    return Math.max(4, Math.ceil(2.2 * (strokeWidth ?? defaultShapeStrokeWidth)) + 1);
  }
  function connectorArrowHeads(connector) {
    let head = connector.head ?? "end";
    return {
      start: connector.headStart ?? (head === "both" ? "filled" : "none"),
      end: connector.headEnd ?? (head === "none" ? "none" : "filled")
    };
  }
  function setConnectorArrowHeads(connector, heads) {
    let result = {
      ...connector
    };
    heads.end === "none" ? result.head = "none" : heads.start === "none" ? delete result.head : result.head = "both";
    let defaultHeads = connectorArrowHeads({
      head: result.head
    });
    return heads.start === defaultHeads.start ? delete result.headStart : result.headStart = heads.start, heads.end === defaultHeads.end ? delete result.headEnd : result.headEnd = heads.end, result;
  }
  function connectorEndpoints(width, height2, corner, strokeWidth) {
    let value = connectorArrowInset(strokeWidth), value2 = width < 2 * value ? width / 2 : value, value3 = height2 < 2 * value ? height2 / 2 : value, value4 = width < 2 * value ? width / 2 : width - value, value5 = height2 < 2 * value ? height2 / 2 : height2 - value, value6 = corner ?? "tl", value7 = value6 === "tl" || value6 === "bl" ? value2 : value4, value8 = value6 === "tl" || value6 === "tr" ? value3 : value5;
    return {
      start: [value7, value8],
      end: [
        value7 === value2 ? value4 : value2,
        value8 === value3 ? value5 : value3
      ]
    };
  }
  function absoluteConnectorEndpoints(rect, corner, strokeWidth) {
    let { start: value, end: value2 } = connectorEndpoints(rect.w, rect.h, corner, strokeWidth);
    return [
      [rect.x + value[0], rect.y + value[1]],
      [rect.x + value2[0], rect.y + value2[1]]
    ];
  }
  function connectorBoundsFromEndpoints(start, end, strokeWidth) {
    let value = connectorArrowInset(strokeWidth), [value2, value3] = start, [value4, value5] = end;
    return {
      left: Math.min(value2, value4) - value,
      top: Math.min(value3, value5) - value,
      w: Math.abs(value4 - value2) + 2 * value,
      h: Math.abs(value5 - value3) + 2 * value,
      from: value5 >= value3 ? value4 >= value2 ? "tl" : "tr" : value4 >= value2 ? "bl" : "br"
    };
  }
  function connectorGeometry(width, height2, connector) {
    let { start: value, end: value2 } = connectorEndpoints(width, height2, connector.from, connector.strokeWidth), value3 = (value[0] + value2[0]) / 2, value4 = (value[1] + value2[1]) / 2, value5 = Math.abs(value2[0] - value[0]) < 1, value6 = Math.abs(value2[1] - value[1]) < 1, items = [value5 ? value3 : value[0], value6 ? value4 : value[1]], items2 = [
      value5 ? value3 : value2[0],
      value6 ? value4 : value2[1]
    ], items3 = [items, items2], value7 = connector.route ?? "straight";
    !value5 && !value6 && (value7 === "elbow" ? items3 = Math.abs(items2[0] - items[0]) >= Math.abs(items2[1] - items[1]) ? [items, [value3, items[1]], [value3, items2[1]], items2] : [items, [items[0], value4], [items2[0], value4], items2] : value7 === "hv" ? items3 = [items, [items2[0], items[1]], items2] : value7 === "vh" && (items3 = [items, [items[0], items2[1]], items2]));
    let callback = (input, options) => {
      let value9 = options[0] - input[0], value10 = options[1] - input[1], value11 = Math.hypot(value9, value10) || 1;
      return [value9 / value11, value10 / value11];
    }, items4 = [], value8 = connectorArrowHeads(connector), length = items3.length;
    return value8.end !== "none" && items4.push({
      tip: items3[length - 1],
      dir: callback(items3[length - 2], items3[length - 1]),
      kind: value8.end
    }), value8.start !== "none" && items4.push({
      tip: items3[0],
      dir: callback(items3[1], items3[0]),
      kind: value8.start
    }), {
      points: items3,
      heads: items4
    };
  }
  function shortenConnectorShaftForHeads(geometry, strokeWidth) {
    let value = geometry.points.map(([input, input2]) => [input, input2]), length = value.length, value2 = arrowShaftInsetFactor * strokeWidth;
    for (let value3 of geometry.heads) {
      if (value3.kind !== "filled")
        continue;
      let value4 = geometry.points[length - 1], value5 = value3.tip[0] === value4[0] && value3.tip[1] === value4[1] ? length - 1 : 0, value6 = value[value5 === 0 ? 1 : length - 2], value7 = Math.hypot(value3.tip[0] - value6[0], value3.tip[1] - value6[1]);
      if (length === 2 && value7 <= value2)
        return value7 === 0 ? value : [];
      let value8 = Math.min(value2, value7);
      value[value5] = [
        value3.tip[0] - value3.dir[0] * value8,
        value3.tip[1] - value3.dir[1] * value8
      ];
    }
    return value;
  }
  function connectorArrowHeadWings(head, strokeWidth) {
    let [tip, tip2] = head.tip, [dir, dir2] = head.dir, value = arrowHeadLengthFactor * strokeWidth, value2 = (head.kind === "open" ? openArrowHeadWidthFactor : filledArrowHeadWidthFactor) * strokeWidth, value3 = tip - dir * value, value4 = tip2 - dir2 * value;
    return [
      [value3 - dir2 * value2, value4 + dir * value2],
      [value3 + dir2 * value2, value4 - dir * value2]
    ];
  }
  function lineShapeEndpoints(rect, rotate) {
    let value = rect.x + rect.w / 2, value2 = rect.y + rect.h / 2, value3 = rect.w >= rect.h, value4 = (value3 ? rect.w : rect.h) / 2, value5 = ((rotate ?? 0) + (value3 ? 0 : 90)) * Math.PI / 180, value6 = Math.cos(value5) * value4, value7 = Math.sin(value5) * value4;
    return [
      [value - value6, value2 - value7],
      [value + value6, value2 + value7]
    ];
  }
  function lineShapeFromEndpoints(start, end, thickness, endpoint) {
    let value = end[0] - start[0], value2 = end[1] - start[1], value3 = Math.max(Math.max(1, thickness), Math.round(Math.hypot(value, value2))), value4 = normalizeRotation(Math.atan2(value2, value) * 180 / Math.PI + (endpoint === 0 ? 180 : 0)), value5 = (value4 ?? 0) * Math.PI / 180, value6 = endpoint === 0 ? -1 : 1, value7 = start[0] + value6 * Math.cos(value5) * value3 / 2, value8 = start[1] + value6 * Math.sin(value5) * value3 / 2, value9 = Math.abs(((value4 ?? 0) % 180 + 180) % 180 - 90);
    return value3 > thickness && value9 < 45 ? {
      left: value7 - thickness / 2,
      top: value8 - value3 / 2,
      w: thickness,
      h: value3,
      rotate: normalizeRotation((value4 ?? 0) - 90)
    } : {
      left: value7 - value3 / 2,
      top: value8 - thickness / 2,
      w: value3,
      h: thickness,
      rotate: value4
    };
  }
  function shapeOutline(style) {
    if (style === void 0 || style.borderStyle === void 0 || style.borderStyle === "none")
      return;
    let value = style.borderWidth ?? 3;
    if (value > 0)
      return {
        color: style.borderColor ?? "#000000",
        width: value,
        line: style.borderStyle
      };
  }
  function shapeHasOutline(style) {
    return shapeOutline(style) !== void 0;
  }
  function shapeZeroWidthOutlineColor(style) {
    if (style !== void 0 && style.borderStyle !== void 0 && style.borderStyle !== "none" && style.borderWidth === 0)
      return style.borderColor ?? "#000000";
  }
  function migrateLegacyShapeStyle(node, kind, fill, stroke, strokeWidth) {
    let state = {
      ...typeof node.style == "object" && node.style !== null && !Array.isArray(node.style) ? node.style : {}
    }, callback = (input) => isSlideColor(input) ? runtime2.namedSlideColors[input] ?? input : void 0;
    state.backgroundColor === void 0 && callback(fill) !== void 0 && (state.backgroundColor = callback(fill)), state.borderStyle === void 0 && state.borderWidth === void 0 && callback(stroke) !== void 0 && (state.borderStyle = "solid", state.borderWidth = strokeWidth ?? 2, state.borderColor = state.borderColor ?? callback(stroke));
    let value = stringOrDefault(node.shadow);
    if (state.boxShadow === void 0 && shadowPresetNames.includes(value) && (state.boxShadow = [
      {
        ...shadowPresets[value]
      }
    ]), kind === "rounded" && [
      "borderRadius",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius"
    ].every((input) => state[input] === void 0) && (state.borderRadius = maxShapeCornerRadius), Object.keys(state).length > 0)
      return state;
  }
  function normalizeShapeVariant(variant) {
    if (typeof variant == "string" && textFitValues.includes(variant))
      return variant;
  }
  function isFlowContainer(node) {
    return node.kind === "stack" || node.kind === "grid";
  }
  function isOverlayNode(node) {
    return node.kind === "overlay";
  }
  function isConnectorNode(node) {
    return node.kind === "shape" && node.shape === "connector";
  }
  function isLineShapeNode(node) {
    return node.kind === "shape" && node.shape === "line";
  }
  function textLineLists(node) {
    return node.text.split(`
`).map((_line, index4) => node.list ?? node.lineLists?.[index4] ?? null);
  }
  function textListFields(lines) {
    let first = lines[0] ?? null;
    return lines.every((line) => line === first) ? first === null ? {} : {
      list: first
    } : {
      lineLists: [...lines]
    };
  }
  function isVideoStillStamp(value) {
    return typeof value == "string" && /^site \d{4}-\d{2}-\d{2} [\w/-]{1,64}$/.test(value);
  }
  function normalizeNodeSlots(slots) {
    let pairs = typeof slots == "string" ? slots.trim().split(/\s+/).map((pair) => pair.split(":")) : typeof slots == "object" && slots !== null ? Object.entries(slots) : [], entries = pairs.filter((pair) => pair.length === 2 && typeof pair[0] == "string" && typeof pair[1] == "string" && slotNamePattern.test(pair[0]) && slotNamePattern.test(pair[1])).slice(0, maxNodeSlots);
    return entries.length > 0 ? Object.fromEntries(entries) : void 0;
  }
  function effectiveRowGap(node) {
    return (node.kind === "grid" || node.wrap === !0 && node.dir === "h" ? node.rowGap : void 0) ?? node.gap;
  }
  function isUnplacedFlowContainer(node) {
    return (node.kind === "stack" || node.kind === "grid") && node.place === void 0;
  }
  function overlayBaseDepth(overlay, depth) {
    return isUnplacedFlowContainer(overlay.base) ? depth : depth + 1;
  }
  function nodeTreeWithinDepthLimit(node, depth) {
    let value = nodeChildren(node);
    return value === void 0 ? !0 : depth >= maxNodeTreeDepth ? !1 : node.kind === "overlay" ? nodeTreeWithinDepthLimit(node.base, overlayBaseDepth(node, depth)) && node.layers.every((input) => nodeTreeWithinDepthLimit(input.node, depth + 1)) : value.every((input) => nodeTreeWithinDepthLimit(input, depth + 1));
  }
  function nodeChildren(node) {
    if (isFlowContainer(node))
      return node.children;
    if (node.kind === "overlay")
      return [node.base, ...node.layers.map((input) => input.node)];
  }
  function normalizeRotation(rotation) {
    if (!Number.isFinite(rotation))
      return;
    let normalized = ((Math.round(rotation * 100) / 100 + 180) % 360 + 360) % 360 - 180, rounded = Math.round(normalized * 100) / 100;
    if (rounded !== 0)
      return rounded === -180 ? 180 : rounded;
  }
  function nodeStyleKind(node) {
    switch (node.kind) {
      case "text":
        return "slides-text";
      case "img":
        return "slides-img";
      case "icon":
        return "slides-icon";
      case "stack":
      case "grid":
      case "overlay":
        return "slides-stack";
      case "table":
        return "slides-table";
      case "shape":
        return node.shape === "connector" ? void 0 : "slides-shape";
      case "html":
      case "spacer":
        return;
    }
  }
  function isFullBleedAxis(axis) {
    return axis.anchor === "fill" && axis.margin === 0 && axis.offset === 0 && axis.size === void 0;
  }
  function isEmptyBackgroundFrame(frame) {
    return isFullBleedAxis(frame.x) && isFullBleedAxis(frame.y) && frame.node.kind === "stack" && frame.node.children.length === 0;
  }
  function countNodeTree(node) {
    return 1 + (nodeChildren(node) ?? []).reduce((input, options) => input + countNodeTree(options), 0);
  }
  function slidePrimaryLayoutFrame(slide) {
    let bestFrame, largestCount = -1;
    for (let value of slide.frames) {
      if (!isFullBleedAxis(value.x) || !isFullBleedAxis(value.y) || !isFlowContainer(value.node) || value.node.children.length === 0)
        continue;
      let value2 = countNodeTree(value.node);
      value2 >= largestCount && (bestFrame = value, largestCount = value2);
    }
    return bestFrame;
  }
  function isPrimaryLayoutFrame(slide, frame) {
    return slidePrimaryLayoutFrame(slide)?.id === frame.id;
  }
  function createModelId() {
    return crypto.randomUUID().slice(0, 8);
  }
  function isSlideColor(color) {
    return slideHexColorPattern.test(color) || slideColorNames.includes(color);
  }
  function isSlideModelEmulator() {
    return slideModelEmulatorDetected ??= typeof document < "u" && typeof document.querySelector == "function" && ["build", "host"].some((input) => document.querySelector('meta[name="' + ["appifact", "emulator", input].join("-") + '"]') !== null), slideModelEmulatorDetected;
  }
  function isModelBlobReference(src) {
    return modelStoredBlobPattern.test(src) || modelEmulatorBlobPattern.test(src) && isSlideModelEmulator();
  }
  function isAllowedImageSource(src) {
    return isModelBlobReference(src) || designSystemImagePathPattern.test(src) ? !0 : !imageBase64DataUrlPattern.test(src) && !svgUtf8DataUrlPattern.test(src) || svgUtf8DataUrlPattern.test(src) && src.includes("#") ? !1 : !svgDataUrlPattern.test(src) || src.length <= maxInlineSvgBytes;
  }
  function isRenderableImageSource(src) {
    if (isModelBlobReference(src) || designSystemImagePathPattern.test(src))
      return !0;
    let value = imageBase64DataUrlPattern.exec(src);
    return value === null || !/^[A-Za-z0-9+/=]+$/.test(src.slice(value[0].length)) ? !1 : value[1] !== "svg+xml" || src.length <= maxInlineSvgBytes;
  }
  function normalizeTextFill(fill) {
    if (typeof fill != "object" || fill === null)
      return;
    let value = fill;
    if (value.kind === "gradient") {
      let value2 = (0, runtime2.normalizeStyleBag)({
        backgroundGradient: value.gradient
      }, "slides-text").bag?.backgroundGradient;
      return value2 !== void 0 ? {
        kind: "gradient",
        gradient: value2
      } : void 0;
    }
    if (value.kind === "image" && typeof value.src == "string" && isRenderableImageSource(value.src))
      return {
        kind: "image",
        src: value.src,
        ...value.size === "contain" ? {
          size: "contain"
        } : {}
      };
  }
  function isEmbeddedFontDataUrl(src) {
    return embeddedFontDataUrlPattern.test(src) && src.length <= maxEmbeddedFontBytes;
  }
  function isAllowedFontSource(src) {
    return isEmbeddedFontDataUrl(src) || isModelBlobReference(src) || designSystemFontPathPattern.test(src);
  }
  function isAllowedGoogleFontStylesheet(url) {
    return url.length <= maxFontStylesheetUrlLength && googleFontStylesheetPattern.test(url);
  }
  function normalizeFontFaces(faces) {
    if (!Array.isArray(faces))
      return;
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of faces.slice(0, maxDeckFontFaces * 4)) {
      if (items.length >= maxDeckFontFaces)
        break;
      if (typeof value != "object" || value === null)
        continue;
      let { family: value2, src: value3, href: value4 } = value;
      if (!(typeof value2 != "string" || !runtime2.customFontFamilyPattern.test(value2)) && !(reservedModelFontFamilyNames.has(value2.toLowerCase()) || values.has(value2.toLowerCase()))) {
        if (value4 !== void 0) {
          if (value3 !== void 0 || typeof value4 != "string" || !isAllowedGoogleFontStylesheet(value4))
            continue;
          values.add(value2.toLowerCase()), items.push({
            family: value2,
            href: value4
          });
          continue;
        }
        typeof value3 != "string" || !isAllowedFontSource(value3) || (values.add(value2.toLowerCase()), items.push({
          family: value2,
          src: value3
        }));
      }
    }
    if (items.length > 0)
      return items;
  }
  function normalizeThemeFontFamilies(families) {
    if (typeof families != "object" || families === null)
      return;
    let value = families, state = {};
    for (let value2 of themeFontFamilyKinds) {
      if (!Object.hasOwn(value, value2))
        continue;
      let value3 = value[value2];
      if (typeof value3 != "object" || value3 === null)
        continue;
      let { family: value4, src: value5, href: value6 } = value3;
      if (!(typeof value4 != "string" || !runtime2.customFontFamilyPattern.test(value4)) && !reservedModelFontFamilyNames.has(value4.toLowerCase())) {
        if (value6 !== void 0) {
          if (value5 !== void 0 || typeof value6 != "string" || !isAllowedGoogleFontStylesheet(value6))
            continue;
          state[value2] = {
            family: value4,
            href: value6
          };
          continue;
        }
        typeof value5 != "string" || !isAllowedFontSource(value5) || (state[value2] = {
          family: value4,
          src: value5
        });
      }
    }
    if (Object.keys(state).length > 0)
      return state;
  }
  function stringOrDefault(value, fallback = "") {
    return typeof value == "string" ? value : fallback;
  }
  function boundedJsonSummary(value, maxDepth, maxLength) {
    let items = [], index4 = 0, flag = !1, callback = (items2) => {
      flag || (items.push(items2), index4 += items2.length, index4 >= maxLength && (flag = !0));
    }, callback2 = (items2, options) => {
      if (flag)
        return;
      if (typeof items2 == "string") {
        callback(JSON.stringify(items2.length > maxLength ? (0, runtime2.truncateUtf16Safely)(items2, maxLength) + "…" : items2));
        return;
      }
      if (items2 === null || typeof items2 == "number" || typeof items2 == "boolean") {
        callback(JSON.stringify(items2));
        return;
      }
      if (typeof items2 != "object") {
        callback("null");
        return;
      }
      if (options >= maxDepth) {
        callback('"…"');
        return;
      }
      if (Array.isArray(items2)) {
        callback("[");
        for (let index22 = 0; index22 < items2.length && !flag; index22++) {
          index22 > 0 && callback(",");
          let value2 = items2[index22];
          value2 === void 0 || typeof value2 == "function" || typeof value2 == "symbol" ? callback("null") : callback2(value2, options + 1);
        }
        callback("]");
        return;
      }
      callback("{");
      let flag2 = !0;
      for (let value2 of Object.keys(items2)) {
        if (flag)
          break;
        let value3 = items2[value2];
        value3 === void 0 || typeof value3 == "function" || typeof value3 == "symbol" || (flag2 || callback(","), flag2 = !1, callback(JSON.stringify(value2) + ":"), callback2(value3, options + 1));
      }
      callback("}");
    };
    return callback2(value, 0), items.join("");
  }
  function finiteNumberOrDefault(value, fallback, minimum, maximum) {
    let value2 = typeof value == "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(maximum, Math.max(minimum, value2));
  }
  function finiteNumberInRange(value, minimum, maximum) {
    if (!(typeof value != "number" || !Number.isFinite(value)))
      return Math.min(maximum, Math.max(minimum, value));
  }
  function normalizeAxisSpec(axis, nodeKind) {
    let value = typeof axis == "object" && axis !== null ? axis : {}, anchor = value.anchor === "center" || value.anchor === "trailing" || value.anchor === "fill" ? value.anchor : "leading", size4 = finiteNumberInRange(value.size, 1, maxModelCoordinate), sizePct = nodeKind !== void 0 && percentSizeNodeKinds.has(nodeKind) && anchor !== "fill" && size4 === void 0 ? finiteNumberInRange(value.sizePct, 0.01, 100) : void 0;
    return {
      anchor,
      margin: finiteNumberOrDefault(value.margin, 0, 0, maxModelCoordinate),
      offset: finiteNumberOrDefault(value.offset, 0, -maxModelCoordinate, maxModelCoordinate),
      size: size4,
      ...sizePct !== void 0 ? {
        sizePct: Math.round(sizePct * 100) / 100
      } : {}
    };
  }
  function normalizeAlignment(align2) {
    if (align2 === "start" || align2 === "center" || align2 === "end")
      return align2;
  }
  function normalizeTextAlignment(align2) {
    return normalizeAlignment(align2) ?? (align2 === "justify" ? align2 : void 0);
  }
  function normalizeContainerAlignment(align2) {
    return normalizeAlignment(align2) ?? (align2 === "stretch" || align2 === "baseline" ? align2 : void 0);
  }
  function normalizeJustification(justify) {
    if (justify === "start" || justify === "center" || justify === "end" || justify === "between" || justify === "around" || justify === "evenly")
      return justify;
  }
  function normalizeNodePlacement(placement) {
    if (typeof placement != "object" || placement === null)
      return;
    let raw = placement, placement2 = {}, grow = finiteNumberInRange(raw.grow, 0, maxFlexFactor);
    grow !== void 0 && (placement2.grow = grow);
    let shrink = finiteNumberInRange(raw.shrink, 0, maxFlexFactor);
    shrink !== void 0 && (placement2.shrink = shrink);
    let basis = finiteNumberInRange(raw.basis, 0, maxModelCoordinate);
    basis !== void 0 && (placement2.basis = basis);
    let value = normalizeContainerAlignment(raw.alignSelf);
    value !== void 0 && (placement2.alignSelf = value);
    let value2 = finiteNumberInRange(raw.minW, 0, maxModelCoordinate);
    value2 !== void 0 && (placement2.minW = value2), (raw.minWFit === "min-content" || raw.minWFit === "max-content") && (placement2.minWFit = raw.minWFit);
    let value3 = finiteNumberInRange(raw.minH, 0, maxModelCoordinate);
    value3 !== void 0 && (placement2.minH = value3);
    let value4 = finiteNumberInRange(raw.maxW, 1, maxModelCoordinate);
    value4 !== void 0 && (placement2.maxW = value4);
    let value5 = finiteNumberInRange(raw.maxH, 1, maxModelCoordinate);
    value5 !== void 0 && (placement2.maxH = value5);
    let value6 = finiteNumberInRange(raw.aspect, 0.05, 20);
    value6 !== void 0 && (placement2.aspect = value6);
    let value7 = finiteNumberInRange(raw.colSpan, 1, maxGridTracks);
    value7 !== void 0 && (placement2.colSpan = Math.round(value7));
    let value8 = finiteNumberInRange(raw.rowSpan, 1, maxGridTracks);
    value8 !== void 0 && (placement2.rowSpan = Math.round(value8));
    let value9 = raw.justifySelf === "stretch" ? "stretch" : normalizeAlignment(raw.justifySelf);
    if (value9 !== void 0 && (placement2.justifySelf = value9), Object.keys(placement2).length > 0)
      return placement2;
  }
  function normalizeGridTrack(track) {
    if (track === "auto")
      return "auto";
    if (typeof track != "object" || track === null)
      return;
    let value = track, value2 = finiteNumberInRange(value.fr, 1e-6, maxFlexFactor);
    if (value2 !== void 0 && value.fr !== void 0)
      return {
        fr: value2
      };
    let value3 = finiteNumberInRange(value.px, 1, maxModelCoordinate);
    if (value3 !== void 0 && value.px !== void 0)
      return {
        px: value3
      };
  }
  function normalizeGridTracks(tracks) {
    if (!Array.isArray(tracks))
      return;
    let items = [];
    for (let value of tracks.slice(0, maxGridTracks)) {
      let value2 = normalizeGridTrack(value);
      value2 !== void 0 && items.push(value2);
    }
    if (items.length > 0)
      return items;
  }
  function tablePlacementWithoutHeight(placement) {
    if (!placement || placement.minH === void 0 && placement.maxH === void 0 && placement.aspect === void 0)
      return placement;
    let state = {
      ...placement
    };
    if (delete state.minH, delete state.maxH, delete state.aspect, Object.keys(state).length > 0)
      return state;
  }
  function applyNormalizedPlacement(node, placement, depth) {
    if (depth === 0)
      return;
    let value = normalizeNodePlacement(placement), value2 = node.kind === "table" ? tablePlacementWithoutHeight(value) : value;
    value2 && (node.place = value2);
  }
  function createDeckNormalizationBudget() {
    return {
      slideCells: maxSlideTableCells,
      deckCells: 1 / 0,
      slideEmbeds: maxSlideHtmlEmbeds
    };
  }
  function normalizeTableColumnWidths(widths, columns) {
    if (!Array.isArray(widths) || widths.length !== columns)
      return;
    let items = [];
    for (let value of widths) {
      if (typeof value != "number" || !Number.isFinite(value))
        return;
      items.push(Math.min(100, Math.max(1, value)));
    }
    return items;
  }
  function normalizeTableColumnAlignments(alignments, columns) {
    if (!Array.isArray(alignments) || alignments.length !== columns)
      return;
    let items = [];
    for (let value of alignments) {
      let value2 = normalizeAlignment(value);
      if (value2 === void 0)
        return;
      items.push(value2);
    }
    return items;
  }
  function normalizeTableCellStyles(cellStyles, rows, columns) {
    if (typeof cellStyles != "object" || cellStyles === null || rows === 0)
      return;
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of Object.keys(cellStyles)) {
      let value2 = tableCellKeyPattern.exec(value);
      if (!value2)
        continue;
      let value3 = Number(value2[1]), value4 = Number(value2[2]);
      if (value3 >= rows || value4 >= columns)
        continue;
      let value5 = String(value3) + "." + String(value4);
      if (values.has(value5))
        continue;
      let value6 = cellStyles[value];
      if (typeof value6 != "object" || value6 === null)
        continue;
      let color = value6.color;
      typeof color != "string" || !isSlideColor(color) || (values.add(value5), items.push([
        value5,
        {
          color
        }
      ]));
    }
    if (items.length > 0)
      return Object.fromEntries(items);
  }
  function normalizeTableRowStyles(rowStyles, rowCount) {
    if (typeof rowStyles != "object" || rowStyles === null)
      return;
    let items = [], values = /* @__PURE__ */ new Set();
    for (let value of Object.keys(rowStyles)) {
      if (!/^\d{1,3}$/.test(value))
        continue;
      let value2 = Number(value);
      if (value2 >= rowCount)
        continue;
      let value3 = String(value2);
      if (values.has(value3))
        continue;
      let value4 = rowStyles[value];
      if (typeof value4 != "object" || value4 === null)
        continue;
      let background = value4.background;
      typeof background != "string" || !isSlideColor(background) || (values.add(value3), items.push([
        value3,
        {
          background
        }
      ]));
    }
    if (items.length > 0)
      return Object.fromEntries(items);
  }
  function normalizeTableRows(table, budget) {
    let rawRows = Array.isArray(table.rows) ? table.rows.slice(0, maxTableRows) : [], columns;
    if (typeof table.cols == "number" && Number.isFinite(table.cols))
      columns = Math.min(maxTableColumns, Math.max(1, Math.round(table.cols)));
    else {
      let count = 1;
      for (let value10 of rawRows)
        Array.isArray(value10) && value10.length > count && (count = value10.length);
      columns = Math.min(maxTableColumns, count);
    }
    let value = Math.max(1, rawRows.length), value2 = Math.min(budget.slideCells, budget.deckCells), value3 = Math.min(value, Math.floor(value2 / columns));
    budget.slideCells -= value3 * columns, budget.deckCells -= value3 * columns;
    let items = [];
    for (let index4 = 0; index4 < value3; index4++) {
      let value10 = rawRows[index4], items2 = [];
      for (let index22 = 0; index22 < columns; index22++) {
        let value11 = Array.isArray(value10) ? value10[index22] : void 0;
        items2.push((0, runtime2.truncateUtf16Safely)(stringOrDefault(value11), maxNodeTextLength));
      }
      items.push(items2);
    }
    let state = {
      kind: "table",
      rows: items,
      cols: columns,
      header: table.header === !0
    }, value4 = normalizeTableColumnWidths(table.colWidths, columns);
    value4 && (state.colWidths = value4);
    let value5 = normalizeTableColumnAlignments(table.colAligns, columns);
    value5 && (state.colAligns = value5);
    let value6 = normalizeTableCellStyles(table.cellStyles, items.length, columns);
    value6 && (state.cellStyles = value6);
    let value7 = normalizeTableRowStyles(table.rowStyles, items.length);
    value7 && (state.rowStyles = value7);
    let cellPadding = table.cellPadding;
    if (typeof cellPadding == "object" && cellPadding !== null && !Array.isArray(cellPadding)) {
      let callback = (input) => typeof input == "number" && Number.isFinite(input) ? Math.min(maxGridGap, Math.max(0, Math.round(input * 10) / 10)) : void 0, value10 = callback(cellPadding.x), value11 = callback(cellPadding.y);
      (value10 !== void 0 || value11 !== void 0) && (state.cellPadding = {
        ...value10 !== void 0 ? {
          x: value10
        } : {},
        ...value11 !== void 0 ? {
          y: value11
        } : {}
      });
    }
    state.header && typeof table.headerWeight == "number" && Number.isFinite(table.headerWeight) && (state.headerWeight = Math.min(900, Math.max(100, Math.round(table.headerWeight / 100) * 100)));
    let value8 = stringOrDefault(table.role);
    textRoles.includes(value8) && (state.role = value8);
    let value9 = normalizeShapeVariant(table.fit);
    return value9 !== void 0 && (state.fit = value9), state;
  }
  function applyNormalizedNodeStyle(node, style, nodeKind, diagnostics) {
    let { bag: value, dropped: value2 } = (0, runtime2.normalizeStyleBag)(style, nodeKind);
    diagnostics && (diagnostics.droppedStyles += value2), value && (node.style = value);
  }
  function normalizeSlideNode(node, depth = 0, budget = createDeckNormalizationBudget(), diagnostics, overlayBaseDepth2 = 0) {
    let value = normalizeSlideNodeFields(node, depth, budget, diagnostics, overlayBaseDepth2), slots = normalizeNodeSlots(typeof node == "object" && node !== null ? node.slots : void 0);
    return slots !== void 0 ? {
      ...value,
      slots
    } : value;
  }
  function normalizeSlideNodeFields(node, depth = 0, budget = createDeckNormalizationBudget(), diagnostics, overlayBaseDepth2 = 0) {
    let value = typeof node == "object" && node !== null ? node : {}, value2 = depth - overlayBaseDepth2;
    if (value.kind === "img") {
      let value11 = stringOrDefault(value.src), state2 = {
        kind: "img",
        alt: (0, runtime2.truncateUtf16Safely)(stringOrDefault(value.alt), 500),
        fit: value.fit === "contain" ? "contain" : "cover"
      }, value12 = stringOrDefault(value.asset);
      modelIdPattern.test(value12) && (state2.asset = value12), isAllowedImageSource(value11) && (state2.src = value11);
      let value13 = stringOrDefault(value.video);
      if (isModelBlobReference(value13)) {
        state2.video = value13, value.videoStart === "click" && (state2.videoStart = "click");
        let value18 = normalizeVideoDelay(value.videoDelay);
        value18 !== void 0 && state2.videoStart === void 0 && (state2.videoDelay = value18), value.videoSound === "on" && (state2.videoSound = "on"), value.videoLoop === "off" && (state2.videoLoop = "off"), value.videoStill === "clip" && (state2.videoStill = "clip");
      } else {
        let value18 = (0, runtime2.normalizeVideoLink)(value.videoLink);
        value18 !== void 0 && (state2.videoLink = value18), value18 !== void 0 && isVideoStillStamp(value.videoStill) && (value.videoStill.endsWith(" " + value18.id) ? state2.videoStill = value.videoStill : (delete state2.asset, delete state2.src));
      }
      let value14 = state2.fit === "cover" && (state2.asset !== void 0 || state2.src !== void 0) ? (0, runtime2.normalizeImageCrop)(value.crop) : void 0;
      value14 !== void 0 && (state2.crop = value14);
      let value15 = finiteNumberInRange(value.w, 1, maxModelCoordinate), value16 = finiteNumberInRange(value.h, 1, maxModelCoordinate);
      value15 !== void 0 && (state2.w = value15), value16 !== void 0 && (state2.h = value16), applyNormalizedNodeStyle(state2, value.style, "slides-img", diagnostics);
      let value17 = finiteNumberInRange(value.radius, 0, 200);
      if (value17 !== void 0 && value17 > 0) {
        let value18 = Object.fromEntries(Object.entries(state2.style ?? {}).filter(([input]) => !/^border.+Radius$/.test(input)));
        state2.style = {
          ...value18,
          borderRadius: value17
        };
      }
      return applyNormalizedPlacement(state2, value.place, depth), state2;
    }
    if (value.kind === "icon") {
      let value11 = stringOrDefault(value.icon);
      if (slideIconNames.includes(value11)) {
        let state2 = {
          kind: "icon",
          icon: value11
        }, value12 = stringOrDefault(value.color);
        isSlideColor(value12) && (state2.color = value12);
        let value13 = finiteNumberInRange(value.w, 1, maxModelCoordinate), value14 = finiteNumberInRange(value.h, 1, maxModelCoordinate);
        return value13 !== void 0 && (state2.w = value13), value14 !== void 0 && (state2.h = value14), applyNormalizedNodeStyle(state2, value.style, "slides-icon", diagnostics), applyNormalizedPlacement(state2, value.place, depth), state2;
      }
      return {
        kind: "text",
        role: "body",
        text: (0, runtime2.truncateUtf16Safely)("[icon: " + value11 + "]", maxNodeTextLength)
      };
    }
    if (value.kind === "shape") {
      let value11 = stringOrDefault(value.shape);
      if (shapeVariants.includes(value11)) {
        let state2 = {
          kind: "shape",
          shape: value11 === "rounded" ? "rect" : value11
        }, value12 = finiteNumberInRange(value.w, 1, maxModelCoordinate), value13 = finiteNumberInRange(value.h, 1, maxModelCoordinate);
        value12 !== void 0 && (state2.w = value12), value13 !== void 0 && (state2.h = value13);
        let value14 = stringOrDefault(value.fill), value15 = stringOrDefault(value.stroke), value16 = finiteNumberInRange(value.strokeWidth, 0, maxShapeStrokeWidth);
        if (state2.shape === "connector") {
          state2.stroke = isSlideColor(value15) ? value15 : "clay", state2.strokeWidth = value16 !== void 0 && value16 > 0 ? value16 : defaultShapeStrokeWidth;
          let value17 = stringOrDefault(value.from);
          connectorCornerValues.includes(value17) && value17 !== "tl" && (state2.from = value17);
          let callback = (input, options) => options.find((input2) => input2 === input);
          Object.assign(state2, setConnectorArrowHeads({}, connectorArrowHeads({
            head: callback(value.head, connectorHeadValues),
            headStart: callback(value.headStart, arrowHeadKindValues),
            headEnd: callback(value.headEnd, arrowHeadKindValues)
          })));
          let value18 = stringOrDefault(value.route);
          connectorRoutingValues.includes(value18) && value18 !== "straight" && (state2.route = value18), value.dashed === !0 && (state2.dashed = !0);
        } else {
          let value17 = typeof value.rotate == "number" ? normalizeRotation(value.rotate) : void 0;
          if (value17 !== void 0 && (state2.rotate = value17), applyNormalizedNodeStyle(state2, migrateLegacyShapeStyle(value, value11, value14, value15, value16), "slides-shape", diagnostics), state2.shape !== "rect" && state2.style !== void 0) {
            let { borderRadius: style, borderTopLeftRadius: style2, borderTopRightRadius: style3, borderBottomRightRadius: style4, borderBottomLeftRadius: style5, ...style6 } = state2.style;
            state2.style = Object.keys(style6).length > 0 ? style6 : void 0;
          }
          state2.shape === "line" && state2.style?.borderStyle !== void 0 && state2.style.borderStyle !== "none" && state2.style.borderStyle !== "solid" && (state2.style = {
            ...state2.style,
            borderStyle: "solid"
          }), state2.style?.backgroundColor === void 0 && !shapeHasOutline(state2.style) && shapeZeroWidthOutlineColor(state2.style) === void 0 && (state2.style = {
            ...state2.style,
            backgroundColor: anthropicAccentColor
          });
        }
        return applyNormalizedPlacement(state2, value.place, depth), state2;
      }
      return {
        kind: "text",
        role: "body",
        text: (0, runtime2.truncateUtf16Safely)("[shape: " + value11 + "]", maxNodeTextLength)
      };
    }
    if (value.kind === "table") {
      let value11 = normalizeTableRows(value, budget);
      return applyNormalizedNodeStyle(value11, value.style, "slides-table", diagnostics), applyNormalizedPlacement(value11, value.place, depth), value11;
    }
    if (value.kind === "spacer") {
      let state2 = {
        kind: "spacer"
      };
      return applyNormalizedPlacement(state2, value.place, depth), state2;
    }
    if (value.kind === "html")
      return depth > 0 ? {
        kind: "text",
        role: "caption",
        text: "[web embed — embeds sit at the slide level, not in stacks]"
      } : budget.slideEmbeds > 0 ? (budget.slideEmbeds -= 1, {
        kind: "html",
        html: (0, runtime2.truncateUtf16Safely)(stringOrDefault(value.html), maxHtmlEmbedBytes)
      }) : {
        kind: "text",
        role: "caption",
        text: "[web embed removed — a slide holds at most " + String(maxSlideHtmlEmbeds) + "]"
      };
    if (value.kind === "overlay" && value2 < maxNodeTreeDepth) {
      let state2 = {};
      applyNormalizedNodeStyle(state2, value.style, "slides-stack", diagnostics), applyNormalizedPlacement(state2, value.place, depth);
      let value11 = Array.isArray(value.layers) ? value.layers.slice(0, maxTextLineSpacing).filter((input) => typeof input == "object" && input !== null) : [], value12 = typeof value.base == "object" && value.base !== null ? value.base : {}, value13 = value12.kind !== "overlay" && isUnplacedFlowContainer({
        kind: value12.kind,
        place: normalizeNodePlacement(value12.place)
      }), value14 = normalizeSlideNode(value.base, depth + 1, budget, diagnostics, value13 ? overlayBaseDepth2 + 1 : overlayBaseDepth2), items = [];
      for (let value15 of value11) {
        let value16 = normalizeSlideNode(value15.node, depth + 1, budget, diagnostics, overlayBaseDepth2), value17 = value16.kind === "overlay" ? value16.base : value16, value18 = normalizeAxisSpec(value15.y, value17.kind);
        items.push({
          node: value17,
          x: normalizeAxisSpec(value15.x, value17.kind),
          y: value17.kind === "table" ? normalizeTableYAxis(value18, void 0) : value18
        });
      }
      let state3 = {
        kind: "overlay",
        base: value14.kind === "overlay" ? value14.base : value14,
        layers: items,
        ...state2
      };
      return value.group === !0 && (state3.group = !0), state3;
    }
    if (value.kind === "grid" && value2 < maxNodeTreeDepth) {
      let value11 = Array.isArray(value.children) ? value.children.slice(0, maxSlideFrames).map((input) => normalizeSlideNode(input, depth + 1, budget, diagnostics, overlayBaseDepth2)) : [], value12 = normalizeGridTracks(value.rows), value13 = normalizeContainerAlignment(value.alignItems), value14 = value.justifyItems === "stretch" ? "stretch" : normalizeAlignment(value.justifyItems), state2 = {
        kind: "grid",
        columns: normalizeGridTracks(value.columns) ?? [
          {
            fr: 1
          }
        ],
        ...value12 !== void 0 ? {
          rows: value12
        } : {},
        gap: finiteNumberOrDefault(value.gap, 16, 0, 512),
        ...value13 !== void 0 && value13 !== "stretch" ? {
          alignItems: value13
        } : {},
        ...value14 !== void 0 && value14 !== "stretch" ? {
          justifyItems: value14
        } : {},
        children: value11
      }, rowGap = finiteNumberInRange(value.rowGap, 0, 512);
      return rowGap !== void 0 && rowGap !== state2.gap && (state2.rowGap = rowGap), value.group === !0 && (state2.group = !0), applyNormalizedNodeStyle(state2, value.style, "slides-stack", diagnostics), applyNormalizedPlacement(state2, value.place, depth), state2;
    }
    if (value.kind === "stack" && value2 < maxNodeTreeDepth) {
      let value11 = Array.isArray(value.children) ? value.children.slice(0, maxSlideFrames).map((input) => normalizeSlideNode(input, depth + 1, budget, diagnostics, overlayBaseDepth2)) : [], value12 = normalizeJustification(value.justify), value13 = value12 === "start" ? void 0 : value12, state2 = {
        kind: "stack",
        dir: value.dir === "h" ? "h" : "v",
        align: normalizeContainerAlignment(value.align) ?? "stretch",
        ...value13 !== void 0 ? {
          justify: value13
        } : {},
        gap: finiteNumberOrDefault(value.gap, 16, 0, 512),
        children: value11
      };
      value.wrap === !0 && (state2.wrap = !0);
      let rowGap = finiteNumberInRange(value.rowGap, 0, 512);
      state2.wrap === !0 && state2.dir === "h" && rowGap !== void 0 && rowGap !== state2.gap && (state2.rowGap = rowGap), value.group === !0 && (state2.group = !0);
      let artifact = (0, runtime2.parseArtifactAddress)(value.artifact);
      return artifact !== void 0 && (state2.artifact = artifact), applyNormalizedNodeStyle(state2, value.style, "slides-stack", diagnostics), applyNormalizedPlacement(state2, value.place, depth), state2;
    }
    let value3 = value.text ?? (value.kind === void 0 ? "" : void 0), value4 = value3 === void 0;
    value4 && diagnostics && (diagnostics.degradedNodes = (diagnostics.degradedNodes ?? 0) + 1);
    let state = {
      kind: "text",
      role: textRoles.includes(stringOrDefault(value.role)) ? value.role : "body",
      text: (0, runtime2.truncateUtf16Safely)(stringOrDefault(value4 ? boundedJsonSummary(value, 12, maxNodeTextLength) : value3), maxNodeTextLength)
    }, value5 = stringOrDefault(value.color);
    isSlideColor(value5) && (state.color = value5);
    let value6 = normalizeTextAlignment(value.align);
    value6 && (state.align = value6), value.wrap === "nowrap" && (state.wrap = "nowrap");
    let value7 = normalizeShapeVariant(value.fit);
    value7 !== void 0 && (state.fit = value7);
    let value8 = finiteNumberInRange(value.hangingIndent, 0, 512);
    value8 !== void 0 && value8 > 0 && (state.hangingIndent = value8);
    let value9 = normalizeTextMarks(value.marks, state.text);
    if (value9 !== void 0 && (state.marks = value9), value.list === "bullet" || value.list === "number")
      state.list = value.list;
    else if (Array.isArray(value.lineLists)) {
      let lineLists = value.lineLists;
      Object.assign(state, textListFields(state.text.split(`
`).map((_line, index4) => lineLists[index4] === "bullet" || lineLists[index4] === "number" ? lineLists[index4] : null)));
      let listIndent = finiteNumberInRange(value.listIndent, 0, 256);
      state.lineLists !== void 0 && listIndent !== void 0 && (state.listIndent = listIndent);
    }
    applyNormalizedNodeStyle(state, value.style, "slides-text", diagnostics);
    let value10 = normalizeTextFill(value.fill);
    if (value10 !== void 0 && (state.fill = value10, state.style?.backgroundColor !== void 0 || state.style?.backgroundGradient !== void 0)) {
      let { backgroundColor: style, backgroundGradient: style2, ...style3 } = state.style;
      Object.keys(style3).length > 0 ? state.style = style3 : delete state.style;
    }
    return applyNormalizedPlacement(state, value.place, depth), state;
  }
  function isSafeHyperlink(href) {
    if (href.length === 0 || href.length > 2048 || /\s/.test(href))
      return !1;
    for (let index4 = 0; index4 < href.length; index4++)
      if (href.charCodeAt(index4) < 32)
        return !1;
    return /^https?:\/\//i.test(href);
  }
  function alignUtf16Boundary(text, offset4) {
    if (offset4 <= 0)
      return 0;
    if (offset4 >= text.length)
      return text.length;
    let value = text.charCodeAt(offset4);
    return value >= 56320 && value <= 57343 ? offset4 - 1 : offset4;
  }
  function normalizeTextMarks(marks, text) {
    if (!Array.isArray(marks))
      return;
    let validMarks = [];
    for (let value of marks.slice(0, maxTextMarks)) {
      if (typeof value != "object" || value === null)
        continue;
      let value2 = value, value3 = typeof value2.start == "number" ? value2.start : NaN, value4 = typeof value2.end == "number" ? value2.end : NaN;
      if (!Number.isInteger(value3) || !Number.isInteger(value4))
        continue;
      let value5 = alignUtf16Boundary(text, Math.max(0, Math.min(text.length, value3))), value6 = alignUtf16Boundary(text, Math.max(0, Math.min(text.length, value4)));
      if (value6 <= value5)
        continue;
      let state = {
        start: value5,
        end: value6
      };
      value2.bold === !0 && (state.bold = !0), value2.italic === !0 && (state.italic = !0), value2.underline === !0 && (state.underline = !0);
      let value7 = stringOrDefault(value2.color);
      isSlideColor(value7) && (state.color = value7);
      let value8 = stringOrDefault(value2.href);
      value8 !== "" && isSafeHyperlink(value8) && (state.href = value8.replace(/^https?:\/\//i, (input) => input.toLowerCase())), !(state.bold === void 0 && state.italic === void 0 && state.underline === void 0 && state.color === void 0 && state.href === void 0) && validMarks.push(state);
    }
    if (validMarks.length === 0)
      return;
    validMarks.sort((input, options) => input.start - options.start || input.end - options.end);
    let lineBreakBoundaries = [];
    for (let index4 = 0; index4 < text.length; index4++)
      text[index4] === `
` && (lineBreakBoundaries.push(index4), lineBreakBoundaries.push(index4 + 1));
    let boundaries = [
      .../* @__PURE__ */ new Set([
        ...validMarks.flatMap((input) => [input.start, input.end]),
        ...lineBreakBoundaries
      ])
    ].sort((input, options) => input - options), normalizedMarks = [];
    for (let index4 = 0; index4 < boundaries.length - 1; index4++) {
      let value = boundaries[index4], value2 = boundaries[index4 + 1], value3 = validMarks.filter((input) => input.start <= value && input.end >= value2);
      if (value3.length === 0 || value2 === value + 1 && text[value] === `
`)
        continue;
      let state = {
        start: value,
        end: value2
      };
      for (let value5 of value3)
        value5.bold && (state.bold = !0), value5.italic && (state.italic = !0), value5.underline && (state.underline = !0), value5.color !== void 0 && (state.color = value5.color), value5.href !== void 0 && (state.href = value5.href);
      if (state.bold === void 0 && state.italic === void 0 && state.underline === void 0 && state.color === void 0 && state.href === void 0)
        continue;
      let value4 = normalizedMarks[normalizedMarks.length - 1];
      if (value4 !== void 0 && value4.end === state.start && value4.bold === state.bold && value4.italic === state.italic && value4.underline === state.underline && value4.color === state.color && value4.href === state.href) {
        value4.end = state.end;
        continue;
      }
      normalizedMarks.push(state);
    }
    if (normalizedMarks.length > 0)
      return normalizedMarks.slice(0, maxTextMarks);
  }
  function normalizeBuildEffect(build) {
    if (typeof build != "object" || build === null)
      return;
    let raw = build, effect = raw.effect;
    if (typeof effect != "string" || !buildEffectValues.includes(effect))
      return;
    let order = typeof raw.order == "number" && Number.isFinite(raw.order) ? Math.max(1, Math.min(maxBuildOrder, Math.round(raw.order))) : 1;
    return {
      effect,
      order,
      ...raw.auto === !0 ? {
        auto: !0
      } : {}
    };
  }
  function normalizeFrameBuild(build) {
    if (typeof build != "object" || build === null)
      return;
    let raw = build, enter = normalizeBuildEffect(raw.in), exit = normalizeBuildEffect(raw.out);
    if (!(enter === void 0 && exit === void 0))
      return enter !== void 0 && exit !== void 0 && exit.order <= enter.order && (exit.order = Math.min(maxBuildOrder, enter.order + 1), exit.order <= enter.order && (enter.order = exit.order - 1)), {
        ...enter !== void 0 ? {
          in: enter
        } : {},
        ...exit !== void 0 ? {
          out: exit
        } : {}
      };
  }
  function normalizeTableYAxis(axis, explicitSize) {
    if (axis.anchor !== "fill" && axis.size === void 0)
      return axis;
    if (explicitSize === void 0 && (axis.anchor === "center" || axis.anchor === "trailing"))
      return {
        anchor: axis.anchor,
        margin: axis.margin,
        offset: axis.offset
      };
    let size4 = axis.size ?? 0, designSize = explicitSize ?? 0, start = axis.anchor === "center" ? designSize / 2 + axis.offset - size4 / 2 : axis.anchor === "trailing" ? designSize - axis.margin - size4 : axis.margin;
    return {
      anchor: "leading",
      margin: Math.max(0, Math.round(start)),
      offset: 0
    };
  }
  function normalizeSlideFrame(frame, budget, diagnostics) {
    let raw = typeof frame == "object" && frame !== null ? frame : {}, id = stringOrDefault(raw.id), build = normalizeFrameBuild(raw.build), node = normalizeSlideNode(raw.node, 0, budget ?? createDeckNormalizationBudget(), diagnostics), yAxis = normalizeAxisSpec(raw.y);
    return {
      id: modelIdPattern.test(id) ? id : createModelId(),
      x: normalizeAxisSpec(raw.x),
      y: node.kind === "table" ? normalizeTableYAxis(yAxis, SLIDE_HEIGHT) : yAxis,
      node,
      ...build !== void 0 ? {
        build
      } : {}
    };
  }
  function normalizeSlide(slide, fallbackId, budget, diagnostics) {
    let raw = typeof slide == "object" && slide !== null ? slide : {}, id = stringOrDefault(raw.id), background = stringOrDefault(raw.bg), budget2 = budget ?? createDeckNormalizationBudget();
    budget2.slideCells = maxSlideTableCells, budget2.slideEmbeds = maxSlideHtmlEmbeds;
    let notes = typeof raw.notes == "string" ? raw.notes : "", frameIds = /* @__PURE__ */ new Set(), ensureUniqueFrameId = (input) => {
      let id2 = input.id;
      for (; frameIds.has(id2); )
        id2 = createModelId();
      return frameIds.add(id2), id2 === input.id ? input : {
        ...input,
        id: id2
      };
    };
    return {
      v: 1,
      id: modelIdPattern.test(id) ? id : fallbackId,
      bg: isSlideColor(background) ? background : "ivory-warm",
      frames: Array.isArray(raw.frames) ? raw.frames.slice(0, maxSlideFrames).map((input) => ensureUniqueFrameId(normalizeSlideFrame(input, budget2, diagnostics))) : [],
      ...raw.skipped === !0 ? {
        skipped: !0
      } : {},
      ...normalizeNodeSlots(raw.slots) !== void 0 ? {
        slots: normalizeNodeSlots(raw.slots)
      } : {},
      ...normalizeListRenderingMode(raw.lists) !== void 0 ? {
        lists: normalizeListRenderingMode(raw.lists)
      } : {},
      ...notes.trim() !== "" ? {
        notes: (0, runtime2.truncateUtf16Safely)(notes, maxSlideNotesLength)
      } : {},
      ...typeof raw.transition == "string" && slideTransitionValues.includes(raw.transition) ? {
        transition: raw.transition
      } : {}
    };
  }
  function setDeckListStyle(deck, lists) {
    if (deck.lists === lists)
      return deck;
    let { lists: value, ...value2 } = deck;
    return lists === void 0 ? value2 : {
      ...value2,
      lists
    };
  }
  function stripPaintEffects(style) {
    let value = style;
    for (let value2 of runtime2.paintEffectProperties)
      delete value[value2];
    delete value.animation;
    let hover = style.hover;
    if (hover) {
      for (let value2 of runtime2.hoverStyleProperties)
        runtime2.paintEffectProperties.includes(value2) && delete hover[value2];
      Object.keys(hover).length === 0 && delete value.hover;
    }
    if (Object.keys(style).length !== 0)
      return style;
  }
  function enforceDeckPaintBudget(slides, diagnostics) {
    let index4 = 0, index22 = 0, callback = (input) => {
      let style = input.style;
      if (style !== void 0) {
        let value2 = (0, runtime2.paintEffectCost)(style);
        value2 > 0 && (index4 += value2) > maxSlidePaintCost ? (input.style = stripPaintEffects(style), diagnostics && (diagnostics.droppedStyles += 1)) : style.animation !== void 0 && ++index22 > maxSlideAnimations && (delete style.animation, Object.keys(style).length === 0 && (input.style = void 0), diagnostics && (diagnostics.droppedStyles += 1));
      }
      let value = nodeChildren(input);
      if (value !== void 0)
        for (let value2 of value)
          callback(value2);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        callback(value2.node);
  }
  function normalizeDescription(text, maxLength) {
    return (0, runtime2.truncateUtf16Safely)(stringOrDefault(text).replace(descriptionControlCharacterPattern, "").replace(/\s+/g, " "), maxLength).trim();
  }
  function importLegacyDeckChildren(children, diagnostics) {
    let value = Array.isArray(children) ? children : typeof children == "object" && children !== null ? children.children : void 0, values = /* @__PURE__ */ new Set(), values2 = /* @__PURE__ */ new Set(), values3 = /* @__PURE__ */ new Set(), value2 = 4 * (maxDeckSlides + maxDeckSections), callback = (input, options, context, value3) => {
      if (!(!Array.isArray(input) || value3 > 32))
        for (let value4 of input) {
          if (value2-- <= 0)
            return;
          if (typeof value4 != "object" || value4 === null)
            continue;
          let value5 = value4;
          if (typeof value5.slide == "string") {
            diagnostics.has(value5.slide) && !values2.has(value5.slide) && (values2.add(value5.slide), options && values.add(value5.slide));
            continue;
          }
          if (typeof value5.group != "object" || value5.group === null || values3.size >= maxDeckSections)
            continue;
          let group = value5.group, value6 = stringOrDefault(group.id);
          if (!modelIdPattern.test(value6) || values3.has(value6) || context > 3) {
            callback(group.children, options, context, value3 + 1);
            continue;
          }
          values3.add(value6), callback(group.children, options || group.skipped === !0, context + 1, value3 + 1);
        }
    };
    return callback(value, !1, 1, 0), values;
  }
  function slideTitleSnippet(slide, maxLength = 42) {
    if (!slide)
      return "";
    let text = "", text2 = "", callback = (source) => {
      if (text2 === "") {
        if (source.kind === "text") {
          let value2 = source.text.replace(/\s+/g, " ").trim();
          value2 !== "" && (text === "" && (text = value2), (source.role === "display" || source.role === "h1" || source.role === "h2" || source.role === "h3") && (text2 = value2));
        }
        if (source.kind === "stack" || source.kind === "grid")
          for (let value2 of source.children)
            callback(value2);
        else if (source.kind === "overlay") {
          callback(source.base);
          for (let value2 of source.layers)
            callback(value2.node);
        }
      }
    };
    for (let value2 of slide.frames)
      callback(value2.node);
    let value = text2 !== "" ? text2 : text;
    return value.length > maxLength ? (0, runtime2.truncateUtf16Safely)(value, maxLength - 1).trimEnd() + "…" : value;
  }
  function normalizeDeck(deck, diagnostics) {
    diagnostics && (diagnostics.droppedStyles = 0, diagnostics.degradedNodes = 0);
    let raw = typeof deck == "object" && deck !== null ? deck : {}, rawSlides = typeof raw.slides == "object" && raw.slides !== null ? raw.slides : {}, rawOrder = Array.isArray(raw.order) ? raw.order : [], order = [], slideEntries = [], slideIds = /* @__PURE__ */ new Set(), budget = {
      slideCells: 0,
      deckCells: maxDeckTableCells,
      slideEmbeds: 0
    };
    for (let value of rawOrder)
      if (!(typeof value != "string" || !modelIdPattern.test(value) || slideIds.has(value) || !Object.hasOwn(rawSlides, value)) && (slideIds.add(value), order.push(value), order.length >= maxDeckSlides))
        break;
    let skippedSlideIds = importLegacyDeckChildren(raw.outline, slideIds), listMode = normalizeListRenderingMode(raw.lists);
    for (let value of order) {
      let value2 = rawSlides[value], value3 = skippedSlideIds.has(value) ? typeof value2 == "object" && value2 !== null ? {
        ...value2,
        skipped: !0
      } : {
        skipped: !0
      } : value2;
      slideEntries.push([
        value,
        setDeckListStyle(normalizeSlide(value3, value, budget, diagnostics), listMode)
      ]);
    }
    enforceDeckPaintBudget(slideEntries.map(([, input]) => input), diagnostics);
    let assetEntries = [], rawAssets = typeof raw.assets == "object" && raw.assets !== null ? raw.assets : {};
    for (let value in rawAssets) {
      if (assetEntries.length >= maxDeckAssets)
        break;
      if (!Object.hasOwn(rawAssets, value) || !modelIdPattern.test(value))
        continue;
      let value2 = rawAssets[value];
      typeof value2 != "string" || !isAllowedImageSource(value2) || assetEntries.push([value, value2]);
    }
    let fonts = normalizeThemeFontFamilies(raw.fonts), faces = normalizeFontFaces(raw.faces), slides = Object.fromEntries(slideEntries), sections = (0, runtime2.normalizeSections)(raw.sections), cover = enumStringOrUndefined(raw.cover, order);
    return {
      theme: raw.theme === "neutral" ? "neutral" : "anthropic",
      ...raw.format === "html" ? {
        format: "html"
      } : {},
      ...sections !== void 0 ? {
        sections
      } : {},
      ...cover !== void 0 ? {
        cover
      } : {},
      order,
      slides,
      assets: Object.fromEntries(assetEntries),
      ...fonts !== void 0 ? {
        fonts
      } : {},
      ...faces !== void 0 ? {
        faces
      } : {},
      ...listMode !== void 0 ? {
        lists: listMode
      } : {},
      ...Array.isArray(raw.style) && JSON.stringify(raw.style).length <= maxDeckStyleLength ? {
        style: raw.style
      } : {}
    };
  }
  function collectSlideAssetIds(slide, assetIds) {
    let callback = (source) => {
      source.kind === "img" && source.asset !== void 0 && assetIds.add(source.asset);
      let value = nodeChildren(source);
      if (value !== void 0)
        for (let value2 of value)
          callback(value2);
    };
    for (let value of slide.frames)
      callback(value.node);
  }
  return bindRuntimeValue(runtime2, "normalizeVideoDelay", () => normalizeVideoDelay), bindRuntimeValue(runtime2, "serializeImageCrop", () => serializeImageCrop), bindRuntimeValue(runtime2, "parseImageCrop", () => parseImageCrop), bindRuntimeValue(runtime2, "connectorArrowInset", () => connectorArrowInset), bindRuntimeValue(runtime2, "connectorArrowHeads", () => connectorArrowHeads), bindRuntimeValue(runtime2, "setConnectorArrowHeads", () => setConnectorArrowHeads), bindRuntimeValue(runtime2, "connectorEndpoints", () => connectorEndpoints), bindRuntimeValue(runtime2, "absoluteConnectorEndpoints", () => absoluteConnectorEndpoints), bindRuntimeValue(runtime2, "connectorBoundsFromEndpoints", () => connectorBoundsFromEndpoints), bindRuntimeValue(runtime2, "connectorGeometry", () => connectorGeometry), bindRuntimeValue(runtime2, "shortenConnectorShaftForHeads", () => shortenConnectorShaftForHeads), bindRuntimeValue(runtime2, "connectorArrowHeadWings", () => connectorArrowHeadWings), bindRuntimeValue(runtime2, "lineShapeEndpoints", () => lineShapeEndpoints), bindRuntimeValue(runtime2, "lineShapeFromEndpoints", () => lineShapeFromEndpoints), bindRuntimeValue(runtime2, "shapeOutline", () => shapeOutline), bindRuntimeValue(runtime2, "shapeHasOutline", () => shapeHasOutline), bindRuntimeValue(runtime2, "shapeZeroWidthOutlineColor", () => shapeZeroWidthOutlineColor), bindRuntimeValue(runtime2, "migrateLegacyShapeStyle", () => migrateLegacyShapeStyle), bindRuntimeValue(runtime2, "normalizeShapeVariant", () => normalizeShapeVariant), bindRuntimeValue(runtime2, "isFlowContainer", () => isFlowContainer), bindRuntimeValue(runtime2, "isOverlayNode", () => isOverlayNode), bindRuntimeValue(runtime2, "isConnectorNode", () => isConnectorNode), bindRuntimeValue(runtime2, "isLineShapeNode", () => isLineShapeNode), bindRuntimeValue(runtime2, "isUnplacedFlowContainer", () => isUnplacedFlowContainer), bindRuntimeValue(runtime2, "overlayBaseDepth", () => overlayBaseDepth), bindRuntimeValue(runtime2, "nodeTreeWithinDepthLimit", () => nodeTreeWithinDepthLimit), bindRuntimeValue(runtime2, "nodeChildren", () => nodeChildren), bindRuntimeValue(runtime2, "normalizeRotation", () => normalizeRotation), bindRuntimeValue(runtime2, "nodeStyleKind", () => nodeStyleKind), bindRuntimeValue(runtime2, "isFullBleedAxis", () => isFullBleedAxis), bindRuntimeValue(runtime2, "isEmptyBackgroundFrame", () => isEmptyBackgroundFrame), bindRuntimeValue(runtime2, "countNodeTree", () => countNodeTree), bindRuntimeValue(runtime2, "slidePrimaryLayoutFrame", () => slidePrimaryLayoutFrame), bindRuntimeValue(runtime2, "isPrimaryLayoutFrame", () => isPrimaryLayoutFrame), bindRuntimeValue(runtime2, "createModelId", () => createModelId), bindRuntimeValue(runtime2, "isSlideColor", () => isSlideColor), bindRuntimeValue(runtime2, "isSlideModelEmulator", () => isSlideModelEmulator), bindRuntimeValue(runtime2, "isModelBlobReference", () => isModelBlobReference), bindRuntimeValue(runtime2, "isAllowedImageSource", () => isAllowedImageSource), bindRuntimeValue(runtime2, "isRenderableImageSource", () => isRenderableImageSource), bindRuntimeValue(runtime2, "normalizeTextFill", () => normalizeTextFill), bindRuntimeValue(runtime2, "isEmbeddedFontDataUrl", () => isEmbeddedFontDataUrl), bindRuntimeValue(runtime2, "isAllowedFontSource", () => isAllowedFontSource), bindRuntimeValue(runtime2, "isAllowedGoogleFontStylesheet", () => isAllowedGoogleFontStylesheet), bindRuntimeValue(runtime2, "normalizeFontFaces", () => normalizeFontFaces), bindRuntimeValue(runtime2, "normalizeThemeFontFamilies", () => normalizeThemeFontFamilies), bindRuntimeValue(runtime2, "stringOrDefault", () => stringOrDefault), bindRuntimeValue(runtime2, "boundedJsonSummary", () => boundedJsonSummary), bindRuntimeValue(runtime2, "finiteNumberOrDefault", () => finiteNumberOrDefault), bindRuntimeValue(runtime2, "finiteNumberInRange", () => finiteNumberInRange), bindRuntimeValue(runtime2, "normalizeAxisSpec", () => normalizeAxisSpec), bindRuntimeValue(runtime2, "isVideoStillStamp", () => isVideoStillStamp), bindRuntimeValue(runtime2, "textLineLists", () => textLineLists), bindRuntimeValue(runtime2, "textListFields", () => textListFields), bindRuntimeValue(runtime2, "normalizeNodeSlots", () => normalizeNodeSlots), bindRuntimeValue(runtime2, "effectiveRowGap", () => effectiveRowGap), bindRuntimeValue(runtime2, "normalizeSlideNodeFields", () => normalizeSlideNodeFields), bindRuntimeValue(runtime2, "normalizeAlignment", () => normalizeAlignment), bindRuntimeValue(runtime2, "normalizeTextAlignment", () => normalizeTextAlignment), bindRuntimeValue(runtime2, "normalizeContainerAlignment", () => normalizeContainerAlignment), bindRuntimeValue(runtime2, "normalizeJustification", () => normalizeJustification), bindRuntimeValue(runtime2, "normalizeNodePlacement", () => normalizeNodePlacement), bindRuntimeValue(runtime2, "normalizeGridTrack", () => normalizeGridTrack), bindRuntimeValue(runtime2, "normalizeGridTracks", () => normalizeGridTracks), bindRuntimeValue(runtime2, "tablePlacementWithoutHeight", () => tablePlacementWithoutHeight), bindRuntimeValue(runtime2, "applyNormalizedPlacement", () => applyNormalizedPlacement), bindRuntimeValue(runtime2, "createDeckNormalizationBudget", () => createDeckNormalizationBudget), bindRuntimeValue(runtime2, "normalizeTableColumnWidths", () => normalizeTableColumnWidths), bindRuntimeValue(runtime2, "normalizeTableColumnAlignments", () => normalizeTableColumnAlignments), bindRuntimeValue(runtime2, "normalizeTableCellStyles", () => normalizeTableCellStyles), bindRuntimeValue(runtime2, "normalizeTableRowStyles", () => normalizeTableRowStyles), bindRuntimeValue(runtime2, "normalizeTableRows", () => normalizeTableRows), bindRuntimeValue(runtime2, "applyNormalizedNodeStyle", () => applyNormalizedNodeStyle), bindRuntimeValue(runtime2, "normalizeSlideNode", () => normalizeSlideNode), bindRuntimeValue(runtime2, "isSafeHyperlink", () => isSafeHyperlink), bindRuntimeValue(runtime2, "alignUtf16Boundary", () => alignUtf16Boundary), bindRuntimeValue(runtime2, "normalizeTextMarks", () => normalizeTextMarks), bindRuntimeValue(runtime2, "normalizeBuildEffect", () => normalizeBuildEffect), bindRuntimeValue(runtime2, "normalizeFrameBuild", () => normalizeFrameBuild), bindRuntimeValue(runtime2, "normalizeTableYAxis", () => normalizeTableYAxis), bindRuntimeValue(runtime2, "normalizeSlideFrame", () => normalizeSlideFrame), bindRuntimeValue(runtime2, "normalizeSlide", () => normalizeSlide), bindRuntimeValue(runtime2, "setDeckListStyle", () => setDeckListStyle), bindRuntimeValue(runtime2, "stripPaintEffects", () => stripPaintEffects), bindRuntimeValue(runtime2, "enforceDeckPaintBudget", () => enforceDeckPaintBudget), bindRuntimeValue(runtime2, "normalizeDescription", () => normalizeDescription), bindRuntimeValue(runtime2, "importLegacyDeckChildren", () => importLegacyDeckChildren), bindRuntimeValue(runtime2, "slideTitleSnippet", () => slideTitleSnippet), bindRuntimeValue(runtime2, "normalizeDeck", () => normalizeDeck), bindRuntimeValue(runtime2, "collectSlideAssetIds", () => collectSlideAssetIds), bindRuntimeValue(runtime2, "SLIDE_WIDTH", () => SLIDE_WIDTH, (value) => {
    SLIDE_WIDTH = value;
  }), bindRuntimeValue(runtime2, "SLIDE_HEIGHT", () => SLIDE_HEIGHT, (value) => {
    SLIDE_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "defaultMediaSize", () => defaultMediaSize, (value) => {
    defaultMediaSize = value;
  }), bindRuntimeValue(runtime2, "textRoles", () => textRoles, (value) => {
    textRoles = value;
  }), bindRuntimeValue(runtime2, "textRoleLabels", () => textRoleLabels, (value) => {
    textRoleLabels = value;
  }), bindRuntimeValue(runtime2, "maxTextMarks", () => maxTextMarks, (value) => {
    maxTextMarks = value;
  }), bindRuntimeValue(runtime2, "maxVideoDelaySeconds", () => maxVideoDelaySeconds, (value) => {
    maxVideoDelaySeconds = value;
  }), bindRuntimeValue(runtime2, "slideIconNames", () => slideIconNames, (value) => {
    slideIconNames = value;
  }), bindRuntimeValue(runtime2, "shapeVariants", () => shapeVariants, (value) => {
    shapeVariants = value;
  }), bindRuntimeValue(runtime2, "shapeVariantLabels", () => shapeVariantLabels, (value) => {
    shapeVariantLabels = value;
  }), bindRuntimeValue(runtime2, "connectorCornerValues", () => connectorCornerValues, (value) => {
    connectorCornerValues = value;
  }), bindRuntimeValue(runtime2, "connectorHeadValues", () => connectorHeadValues, (value) => {
    connectorHeadValues = value;
  }), bindRuntimeValue(runtime2, "arrowHeadKindValues", () => arrowHeadKindValues, (value) => {
    arrowHeadKindValues = value;
  }), bindRuntimeValue(runtime2, "connectorRoutingValues", () => connectorRoutingValues, (value) => {
    connectorRoutingValues = value;
  }), bindRuntimeValue(runtime2, "defaultShapeStrokeWidth", () => defaultShapeStrokeWidth, (value) => {
    defaultShapeStrokeWidth = value;
  }), bindRuntimeValue(runtime2, "arrowHeadLengthFactor", () => arrowHeadLengthFactor, (value) => {
    arrowHeadLengthFactor = value;
  }), bindRuntimeValue(runtime2, "filledArrowHeadWidthFactor", () => filledArrowHeadWidthFactor, (value) => {
    filledArrowHeadWidthFactor = value;
  }), bindRuntimeValue(runtime2, "openArrowHeadWidthFactor", () => openArrowHeadWidthFactor, (value) => {
    openArrowHeadWidthFactor = value;
  }), bindRuntimeValue(runtime2, "arrowShaftInsetFactor", () => arrowShaftInsetFactor, (value) => {
    arrowShaftInsetFactor = value;
  }), bindRuntimeValue(runtime2, "shadowPresetNames", () => shadowPresetNames, (value) => {
    shadowPresetNames = value;
  }), bindRuntimeValue(runtime2, "shadowPresets", () => shadowPresets, (value) => {
    shadowPresets = value;
  }), bindRuntimeValue(runtime2, "maxShapeStrokeWidth", () => maxShapeStrokeWidth, (value) => {
    maxShapeStrokeWidth = value;
  }), bindRuntimeValue(runtime2, "maxShapeCornerRadius", () => maxShapeCornerRadius, (value) => {
    maxShapeCornerRadius = value;
  }), bindRuntimeValue(runtime2, "anthropicAccentColor", () => anthropicAccentColor, (value) => {
    anthropicAccentColor = value;
  }), bindRuntimeValue(runtime2, "maxGridTracks", () => maxGridTracks, (value) => {
    maxGridTracks = value;
  }), bindRuntimeValue(runtime2, "maxGridGap", () => maxGridGap, (value) => {
    maxGridGap = value;
  }), bindRuntimeValue(runtime2, "textFitValues", () => textFitValues, (value) => {
    textFitValues = value;
  }), bindRuntimeValue(runtime2, "defaultTextFit", () => defaultTextFit, (value) => {
    defaultTextFit = value;
  }), bindRuntimeValue(runtime2, "textFitMinimumScale", () => textFitMinimumScale, (value) => {
    textFitMinimumScale = value;
  }), bindRuntimeValue(runtime2, "minimumTextFontSize", () => minimumTextFontSize, (value) => {
    minimumTextFontSize = value;
  }), bindRuntimeValue(runtime2, "maxTextLineSpacing", () => maxTextLineSpacing, (value) => {
    maxTextLineSpacing = value;
  }), bindRuntimeValue(runtime2, "buildEffectValues", () => buildEffectValues, (value) => {
    buildEffectValues = value;
  }), bindRuntimeValue(runtime2, "maxBuildOrder", () => maxBuildOrder, (value) => {
    maxBuildOrder = value;
  }), bindRuntimeValue(runtime2, "slideTransitionValues", () => slideTransitionValues, (value) => {
    slideTransitionValues = value;
  }), bindRuntimeValue(runtime2, "normalizeListRenderingMode", () => normalizeListRenderingMode, (value) => {
    normalizeListRenderingMode = value;
  }), bindRuntimeValue(runtime2, "defaultListGutter", () => defaultListGutter, (value) => {
    defaultListGutter = value;
  }), bindRuntimeValue(runtime2, "textListGutter", () => textListGutter, (value) => {
    textListGutter = value;
  }), bindRuntimeValue(runtime2, "slideHexColorPattern", () => slideHexColorPattern, (value) => {
    slideHexColorPattern = value;
  }), bindRuntimeValue(runtime2, "slideColorNames", () => slideColorNames, (value) => {
    slideColorNames = value;
  }), bindRuntimeValue(runtime2, "imageBase64DataUrlPattern", () => imageBase64DataUrlPattern, (value) => {
    imageBase64DataUrlPattern = value;
  }), bindRuntimeValue(runtime2, "svgUtf8DataUrlPattern", () => svgUtf8DataUrlPattern, (value) => {
    svgUtf8DataUrlPattern = value;
  }), bindRuntimeValue(runtime2, "svgDataUrlPattern", () => svgDataUrlPattern, (value) => {
    svgDataUrlPattern = value;
  }), bindRuntimeValue(runtime2, "maxInlineSvgBytes", () => maxInlineSvgBytes, (value) => {
    maxInlineSvgBytes = value;
  }), bindRuntimeValue(runtime2, "maxInlineImageBytes", () => maxInlineImageBytes, (value) => {
    maxInlineImageBytes = value;
  }), bindRuntimeValue(runtime2, "modelStoredBlobPattern", () => modelStoredBlobPattern, (value) => {
    modelStoredBlobPattern = value;
  }), bindRuntimeValue(runtime2, "modelEmulatorBlobPattern", () => modelEmulatorBlobPattern, (value) => {
    modelEmulatorBlobPattern = value;
  }), bindRuntimeValue(runtime2, "designSystemAssetPathSource", () => designSystemAssetPathSource, (value) => {
    designSystemAssetPathSource = value;
  }), bindRuntimeValue(runtime2, "designSystemImagePathPattern", () => designSystemImagePathPattern, (value) => {
    designSystemImagePathPattern = value;
  }), bindRuntimeValue(runtime2, "slideModelEmulatorDetected", () => slideModelEmulatorDetected, (value) => {
    slideModelEmulatorDetected = value;
  }), bindRuntimeValue(runtime2, "themeFontFamilyKinds", () => themeFontFamilyKinds, (value) => {
    themeFontFamilyKinds = value;
  }), bindRuntimeValue(runtime2, "embeddedFontDataUrlPattern", () => embeddedFontDataUrlPattern, (value) => {
    embeddedFontDataUrlPattern = value;
  }), bindRuntimeValue(runtime2, "maxEmbeddedFontBytes", () => maxEmbeddedFontBytes, (value) => {
    maxEmbeddedFontBytes = value;
  }), bindRuntimeValue(runtime2, "googleFontStylesheetPattern", () => googleFontStylesheetPattern, (value) => {
    googleFontStylesheetPattern = value;
  }), bindRuntimeValue(runtime2, "maxFontStylesheetUrlLength", () => maxFontStylesheetUrlLength, (value) => {
    maxFontStylesheetUrlLength = value;
  }), bindRuntimeValue(runtime2, "reservedModelFontFamilyNames", () => reservedModelFontFamilyNames, (value) => {
    reservedModelFontFamilyNames = value;
  }), bindRuntimeValue(runtime2, "designSystemFontPathSource", () => designSystemFontPathSource, (value) => {
    designSystemFontPathSource = value;
  }), bindRuntimeValue(runtime2, "designSystemFontPathPattern", () => designSystemFontPathPattern, (value) => {
    designSystemFontPathPattern = value;
  }), bindRuntimeValue(runtime2, "maxDeckFontFaces", () => maxDeckFontFaces, (value) => {
    maxDeckFontFaces = value;
  }), bindRuntimeValue(runtime2, "maxDeckFontCssBytes", () => maxDeckFontCssBytes, (value) => {
    maxDeckFontCssBytes = value;
  }), bindRuntimeValue(runtime2, "maxDeckAssetBytes", () => maxDeckAssetBytes, (value) => {
    maxDeckAssetBytes = value;
  }), bindRuntimeValue(runtime2, "modelIdPattern", () => modelIdPattern, (value) => {
    modelIdPattern = value;
  }), bindRuntimeValue(runtime2, "maxModelCoordinate", () => maxModelCoordinate, (value) => {
    maxModelCoordinate = value;
  }), bindRuntimeValue(runtime2, "maxNodeTextLength", () => maxNodeTextLength, (value) => {
    maxNodeTextLength = value;
  }), bindRuntimeValue(runtime2, "maxSlideNotesLength", () => maxSlideNotesLength, (value) => {
    maxSlideNotesLength = value;
  }), bindRuntimeValue(runtime2, "maxSectionDescriptionLength", () => maxSectionDescriptionLength, (value) => {
    maxSectionDescriptionLength = value;
  }), bindRuntimeValue(runtime2, "maxHtmlEmbedBytes", () => maxHtmlEmbedBytes, (value) => {
    maxHtmlEmbedBytes = value;
  }), bindRuntimeValue(runtime2, "maxSlideHtmlEmbeds", () => maxSlideHtmlEmbeds, (value) => {
    maxSlideHtmlEmbeds = value;
  }), bindRuntimeValue(runtime2, "maxSlideFrames", () => maxSlideFrames, (value) => {
    maxSlideFrames = value;
  }), bindRuntimeValue(runtime2, "maxNodeTreeDepth", () => maxNodeTreeDepth, (value) => {
    maxNodeTreeDepth = value;
  }), bindRuntimeValue(runtime2, "maxTableColumns", () => maxTableColumns, (value) => {
    maxTableColumns = value;
  }), bindRuntimeValue(runtime2, "maxTableRows", () => maxTableRows, (value) => {
    maxTableRows = value;
  }), bindRuntimeValue(runtime2, "maxSlideTableCells", () => maxSlideTableCells, (value) => {
    maxSlideTableCells = value;
  }), bindRuntimeValue(runtime2, "maxDeckTableCells", () => maxDeckTableCells, (value) => {
    maxDeckTableCells = value;
  }), bindRuntimeValue(runtime2, "tableCellKeyPattern", () => tableCellKeyPattern, (value) => {
    tableCellKeyPattern = value;
  }), bindRuntimeValue(runtime2, "maxSlidePaintCost", () => maxSlidePaintCost, (value) => {
    maxSlidePaintCost = value;
  }), bindRuntimeValue(runtime2, "maxSlideAnimations", () => maxSlideAnimations, (value) => {
    maxSlideAnimations = value;
  }), bindRuntimeValue(runtime2, "maxDeckSections", () => maxDeckSections, (value) => {
    maxDeckSections = value;
  }), bindRuntimeValue(runtime2, "descriptionControlCharacterPattern", () => descriptionControlCharacterPattern, (value) => {
    descriptionControlCharacterPattern = value;
  }), bindRuntimeValue(runtime2, "maxDeckSlides", () => maxDeckSlides, (value) => {
    maxDeckSlides = value;
  }), bindRuntimeValue(runtime2, "maxDeckAssets", () => maxDeckAssets, (value) => {
    maxDeckAssets = value;
  }), bindRuntimeValue(runtime2, "maxDeckStyleLength", () => maxDeckStyleLength, (value) => {
    maxDeckStyleLength = value;
  }), bindRuntimeValue(runtime2, "maxFlexFactor", () => maxFlexFactor, (value) => {
    maxFlexFactor = value;
  }), bindRuntimeValue(runtime2, "maxNodeSlots", () => maxNodeSlots, (value) => {
    maxNodeSlots = value;
  }), bindRuntimeValue(runtime2, "slotNamePattern", () => slotNamePattern, (value) => {
    slotNamePattern = value;
  }), bindRuntimeValue(runtime2, "percentSizeNodeKinds", () => percentSizeNodeKinds, (value) => {
    percentSizeNodeKinds = value;
  }), bindRuntimeValue(runtime2, "formatNodeSlots", () => formatNodeSlots, (value) => {
    formatNodeSlots = value;
  }), bindRuntimeValue(runtime2, "listIndentCss", () => listIndentCss, (value) => {
    listIndentCss = value;
  }), bindRuntimeValue(runtime2, "enumStringOrUndefined", () => enumStringOrUndefined, (value) => {
    enumStringOrUndefined = value;
  }), bindRuntimeValue(runtime2, "initializeSlideModel", () => initializeSlideModel, (value) => {
    initializeSlideModel = value;
  }), () => {
    SLIDE_WIDTH = 1920, SLIDE_HEIGHT = 1080, defaultMediaSize = 240, maxTextMarks = 100, maxVideoDelaySeconds = 60, defaultShapeStrokeWidth = 2, arrowHeadLengthFactor = 4, filledArrowHeadWidthFactor = 2, openArrowHeadWidthFactor = 1.7, arrowShaftInsetFactor = 2, maxShapeStrokeWidth = 32, maxShapeCornerRadius = 24, anthropicAccentColor = "#d97757", maxGridTracks = 24, maxGridGap = 64, defaultTextFit = "shrink", textFitMinimumScale = 0.6, minimumTextFontSize = 8, maxTextLineSpacing = 24, maxBuildOrder = 50, normalizeListRenderingMode = (input) => input === "css" ? "css" : void 0, defaultListGutter = 40, textListGutter = (source, options) => options === "css" && source.kind === "text" && source.list !== void 0 ? source.style?.paddingLeft ?? defaultListGutter : void 0, maxInlineSvgBytes = 71680, maxInlineImageBytes = 71680, designSystemAssetPathSource = "project/ds/[a-z0-9][a-z0-9_-]{0,63}/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,99}/){0,8}[A-Za-z0-9][A-Za-z0-9._-]{0,99}\\.", maxEmbeddedFontBytes = 524288, maxFontStylesheetUrlLength = 1024, maxDeckFontFaces = 4, maxDeckFontCssBytes = 245760, maxDeckAssetBytes = 2097152, maxModelCoordinate = 4096, maxNodeTextLength = 2e4, maxSlideNotesLength = 4e3, maxSectionDescriptionLength = 400, maxHtmlEmbedBytes = 16384, maxSlideHtmlEmbeds = 8, maxSlideFrames = 200, maxNodeTreeDepth = 16, maxTableColumns = 24, maxTableRows = 100, maxSlideTableCells = 4e3, maxDeckTableCells = 4e4, maxSlidePaintCost = 1e3, maxSlideAnimations = 100, maxDeckSections = 100, maxDeckSlides = 500, maxDeckAssets = 200, maxDeckStyleLength = 32768, maxFlexFactor = 1e12, maxNodeSlots = 128, formatNodeSlots = (slots) => Object.entries(slots).map(([name, value]) => name + ":" + value).join(" "), listIndentCss = (node, lists) => node.listIndent !== void 0 || lists === "css" ? String(node.listIndent ?? defaultListGutter) + "px" : "1.2em", enumStringOrUndefined = (input, options) => typeof input == "string" && options.includes(input) ? input : void 0, initializeSlideModel = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeVideoLinks)(), (0, runtime2.initializeArtifactAddresses)(), (0, runtime2.initializeImageCrop)(), (0, runtime2.initializeSections)(), (0, runtime2.initializeSlideTypeScales)(), (0, runtime2.initializeStyleSchema)(), textRoles = [
        "display",
        "h1",
        "h2",
        "h3",
        "lead",
        "eyebrow",
        "body",
        "caption"
      ], textRoleLabels = {
        display: "大标题",
        h1: "一级标题",
        h2: "二级标题",
        h3: "三级标题",
        lead: "导语",
        eyebrow: "眉题",
        body: "正文",
        caption: "说明文字"
      }, slideIconNames = [
        "Ant",
        "Activity",
        "Book",
        "Chart",
        "Chat",
        "Check",
        "CheckCircle",
        "Clock",
        "Cloud",
        "Code",
        "Database",
        "Globe",
        "GraduationCap",
        "Home",
        "Key",
        "Lightbulb",
        "Lightning",
        "Link",
        "Lock",
        "Owl",
        "PaperPlane",
        "Play",
        "Search",
        "Settings",
        "Star",
        "ThumbsUp",
        "Tool",
        "Trust",
        "Users",
        "Verified",
        "Warning",
        "Wrench"
      ], shapeVariants = [
        "rect",
        "rounded",
        "ellipse",
        "diamond",
        "arrow-right",
        "arrow-left",
        "arrow-up",
        "arrow-down",
        "line",
        "connector"
      ], shapeVariantLabels = {
        rect: "矩形",
        rounded: "圆角矩形",
        ellipse: "椭圆",
        diamond: "菱形（判断）",
        "arrow-right": "右箭头",
        "arrow-left": "左箭头",
        "arrow-up": "上箭头",
        "arrow-down": "下箭头",
        line: "线条",
        connector: "连接线"
      }, connectorCornerValues = ["tl", "tr", "bl", "br"], connectorHeadValues = ["end", "both", "none"], arrowHeadKindValues = ["none", "open", "filled"], connectorRoutingValues = ["straight", "elbow", "hv", "vh"], shadowPresetNames = ["subtle", "medium", "strong"], shadowPresets = {
        subtle: {
          x: 0,
          y: 2,
          blur: 8,
          spread: 0,
          color: "#1414132e"
        },
        medium: {
          x: 0,
          y: 6,
          blur: 20,
          spread: 0,
          color: "#14141340"
        },
        strong: {
          x: 0,
          y: 14,
          blur: 40,
          spread: 0,
          color: "#14141352"
        }
      }, textFitValues = ["shrink", "none", "grow"], slotNamePattern = /^[a-z][a-z0-9-]{0,31}$/, buildEffectValues = [
        "fade",
        "rise",
        "drop",
        "left",
        "right",
        "scale",
        "pop"
      ], slideTransitionValues = ["fade", "push", "magic"], slideHexColorPattern = /^#[0-9a-fA-F]{3,8}$/, slideColorNames = [
        "slate",
        "ivory",
        "ivory-warm",
        "clay",
        "oat",
        "white",
        "text-secondary",
        "text-tertiary"
      ], imageBase64DataUrlPattern = /^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);base64,/, svgUtf8DataUrlPattern = /^data:image\/svg\+xml(;utf8|;charset=utf-8)?,/, svgDataUrlPattern = /^data:image\/svg\+xml(;base64|;utf8|;charset=utf-8)?[;,]/, modelStoredBlobPattern = /^\/?_blob\/[0-9a-f]{32}$/, modelEmulatorBlobPattern = /^blob:(null|https?:\/\/[A-Za-z0-9.:\[\]-]{1,100})\/[0-9a-f-]{36}$/, designSystemImagePathPattern = new RegExp("^project/ds/[a-z0-9][a-z0-9_-]{0,63}/(?:[A-Za-z0-9][A-Za-z0-9._@-]{0,99}/){0,8}[A-Za-z0-9][A-Za-z0-9._@-]{0,99}\\.(?:[Pp][Nn][Gg]|[Jj][Pp][Ee]?[Gg]|[Gg][Ii][Ff]|[Ww][Ee][Bb][Pp]|[Aa][Vv][Ii][Ff]|[Ss][Vv][Gg])$"), themeFontFamilyKinds = ["sans", "serif"], embeddedFontDataUrlPattern = /^data:font\/(woff2|woff|ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/, googleFontStylesheetPattern = /^https:\/\/fonts\.googleapis\.com\/css2\?[A-Za-z0-9&=+,.:;@_-]+$/, reservedModelFontFamilyNames = /* @__PURE__ */ new Set([
        "inherit",
        "initial",
        "unset",
        "revert",
        "revert-layer",
        "default"
      ]), designSystemFontPathSource = designSystemAssetPathSource + "(?:[Ww][Oo][Ff][Ff]2?|[Tt][Tt][Ff]|[Oo][Tt][Ff])", designSystemFontPathPattern = new RegExp("^" + designSystemFontPathSource + "$"), modelIdPattern = /^[\w-]{1,64}$/, percentSizeNodeKinds = /* @__PURE__ */ new Set(["stack", "grid", "text", "spacer"]), tableCellKeyPattern = /^(\d{1,3})\.(\d{1,2})$/, descriptionControlCharacterPattern = /[^\P{Cc}\t\n\r]|\p{Cf}/gu;
    });
  };
}
export {
  installModelDeck
};
