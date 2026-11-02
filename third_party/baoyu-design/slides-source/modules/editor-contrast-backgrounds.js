// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorContrastBackgrounds(runtime2) {
  var SLIDE_BACKGROUND_LABEL, BOX_FILL_LABEL, LARGE_TEXT_THRESHOLD, OPAQUE_BACKGROUND_THRESHOLD, TRANSPARENT_BACKGROUND_THRESHOLD, hasInsetBoxShadow, hasVisibleShadow, isHiddenContrastNode, coversWholeSlide, rectanglesOverlap_Ae0, FULL_SLIDE_RECTANGLE, rgbToHexColor, SLIDE_CONTRAST_SOURCE, UNKNOWN_CONTAINER_SIZE, LOWERCASE_GLYPH_WIDTH, UPPERCASE_GLYPH_WIDTH, WIDE_CONTRAST_GLYPH_PATTERN, UPPERCASE_CONTRAST_GLYPH_PATTERN, CONTRAST_KIND_PRIORITY, DEFAULT_CONTRAST_NODE_KINDS, TEXT_CONTRAST_NODE_KINDS, ICON_CONTRAST_NODE_KINDS, toolbarIconPath, createToolbarIcon, DEFAULT_JUSTIFY_ICON, JUSTIFY_ICONS, ALIGN_ICONS, CONNECTOR_DIRECTION_ICONS, STACK_LAYOUT_ICON, OVERLAY_LAYOUT_ICON, SELECTION_ALIGN_ICONS;
  function contrastContentKind(fontSize) {
    return fontSize >= LARGE_TEXT_THRESHOLD ? "largeText" : "text";
  }
  function boxShadowRecords(style) {
    let value = style?.boxShadow;
    return value === void 0 ? [] : Array.isArray(value) ? value : [value];
  }
  function textShadowRecords(style) {
    let value = style?.textShadow;
    return value === void 0 ? [] : Array.isArray(value) ? value : [value];
  }
  function styleShadowOutset(style) {
    let index4 = 0;
    for (let value of [
      ...boxShadowRecords(style).filter((input) => input.inset !== !0),
      ...textShadowRecords(style)
    ])
      index4 = Math.max(index4, Math.max(Math.abs(value.x), Math.abs(value.y)) + value.blur + Math.max(0, value.spread ?? 0));
    return index4;
  }
  function nodeShadowOutset(node) {
    return Math.max(styleShadowOutset(node.style), ...((0, runtime2.nodeChildren)(node) ?? []).map(nodeShadowOutset), 0);
  }
  function classifyContrastBackground(style) {
    if (style?.backgroundGradient !== void 0 || hasInsetBoxShadow(style))
      return {
        kind: "unknown"
      };
    let value = style?.backgroundColor;
    if (value === void 0 || value.trim().toLowerCase() === "transparent")
      return {
        kind: "none"
      };
    let value2 = (0, runtime2.parseContrastColor)((0, runtime2.resolveSlideColor)(value) ?? value);
    return value2 === void 0 ? {
      kind: "unknown"
    } : value2.a <= TRANSPARENT_BACKGROUND_THRESHOLD ? {
      kind: "none"
    } : {
      kind: value2.a >= OPAQUE_BACKGROUND_THRESHOLD ? "solid" : "wash",
      color: value2
    };
  }
  function styleComplicatesContrast(style) {
    return style === void 0 ? !1 : style.opacity !== void 0 && style.opacity < 1 || style.filter !== void 0 || style.backdropFilter !== void 0 || style.mixBlendMode !== void 0 && style.mixBlendMode !== "normal" || style.animation !== void 0;
  }
  function hasTransformedDescendant(node) {
    return node.style?.transform !== void 0 || node.kind === "shape" && node.rotate !== void 0 && node.rotate !== 0 || ((0, runtime2.nodeChildren)(node) ?? []).some(hasTransformedDescendant);
  }
  function paintsContrastSurface(node) {
    return isHiddenContrastNode(node) ? !1 : node.kind === "img" || node.kind === "html" || node.kind === "shape" || node.kind === "table" ? !0 : classifyContrastBackground(node.style).kind !== "none" || hasVisibleShadow(node.style);
  }
  function subtreePaintsContrastSurface(node) {
    return paintsContrastSurface(node) || styleComplicatesContrast(node.style) || ((0, runtime2.nodeChildren)(node) ?? []).some(subtreePaintsContrastSurface);
  }
  function subtreeComplicatesContrast(node) {
    if (styleComplicatesContrast(node.style))
      return !0;
    if (!isHiddenContrastNode(node)) {
      let value = classifyContrastBackground(node.style);
      if (value.kind === "wash" || value.kind === "unknown" || node.kind === "img" || node.kind === "html" || node.kind === "table" || hasVisibleShadow(node.style))
        return !0;
    }
    return ((0, runtime2.nodeChildren)(node) ?? []).some(subtreeComplicatesContrast);
  }
  function childrenComplicateContrast(node, ancestors) {
    let value = (0, runtime2.isFlowContainer)(node) ? Math.max(0, Math.min(node.gap ?? 0, (0, runtime2.effectiveRowGap)(node))) : 0;
    return ((0, runtime2.nodeChildren)(node) ?? []).some((input) => ancestors.has(input) ? childrenComplicateContrast(input, ancestors) : hasTransformedDescendant(input) && (subtreePaintsContrastSurface(input) || subtreeComplicatesContrast(input)) ? !0 : (node.kind === "overlay" && input === node.base ? containerShadowOutset(input) : nodeShadowOutset(input)) > value);
  }
  function containerShadowOutset(node) {
    let index4 = 0;
    for (let value of textShadowRecords(node.style))
      index4 = Math.max(index4, Math.max(Math.abs(value.x), Math.abs(value.y)) + value.blur);
    return Math.max(index4, ...((0, runtime2.nodeChildren)(node) ?? []).map(nodeShadowOutset), 0);
  }
  function contrastFrameBounds(frame) {
    if (hasTransformedDescendant(frame.node) || overlayComplicatesContrast(frame, frame.node, !0))
      return {
        may: FULL_SLIDE_RECTANGLE,
        bare: FULL_SLIDE_RECTANGLE,
        certain: void 0
      };
    let value = (0, runtime2.frameBounds)(frame.x, frame.y), value2 = frame.x.anchor === "fill" || frame.x.size !== void 0, value3 = frame.y.anchor === "fill" || frame.y.size !== void 0 && frame.node.kind !== "table", callback = (input, options, context, value9, extra) => value9 ? [options, context] : input.anchor === "trailing" ? [0, options] : input.anchor === "center" ? [0, extra] : [options, Math.max(0, extra - options)], [value4, value5] = callback(frame.x, value.x, value.w, value2, runtime2.SLIDE_WIDTH), [value6, value7] = callback(frame.y, value.y, value.h, value3, runtime2.SLIDE_HEIGHT), value8 = nodeShadowOutset(frame.node), state = {
      x: value4,
      y: value6,
      w: value5,
      h: value7
    };
    return {
      may: {
        x: value4 - value8,
        y: value6 - value8,
        w: value5 + 2 * value8,
        h: value7 + 2 * value8
      },
      bare: state,
      certain: value2 && value3 ? value : void 0
    };
  }
  function overlayComplicatesContrast(frame, node, atRoot) {
    if (node.kind === "overlay") {
      let value = atRoot ? overlayBaseKnownSize(frame, node) : UNKNOWN_CONTAINER_SIZE, value2 = frameAvailableSize(frame);
      if (node.layers.some((input) => !overlayLayerFitsWithin(input, value, value2, !0)))
        return !0;
    }
    return ((0, runtime2.nodeChildren)(node) ?? []).some((input) => overlayComplicatesContrast(frame, input, !1));
  }
  function certainSolidBackground(node) {
    if (!(0, runtime2.isFlowContainer)(node) || isHiddenContrastNode(node) || styleComplicatesContrast(node.style) || hasTransformedDescendant(node))
      return;
    let value = classifyContrastBackground(node.style);
    if (value.kind === "solid" && !node.children.some(subtreePaintsContrastSurface))
      return value.color;
  }
  function slideContrastBackground(slide) {
    if ((0, runtime2.isGradientBackgroundSlide)(slide))
      return;
    let value = (0, runtime2.resolveSlideColor)(slide.bg), value2 = value === void 0 ? void 0 : (0, runtime2.parseContrastColor)(value);
    if (!(value2 === void 0 || value2.a < OPAQUE_BACKGROUND_THRESHOLD))
      return {
        css: (0, runtime2.stripHexAlpha)(value),
        label: SLIDE_BACKGROUND_LABEL
      };
  }
  function nodeContrastBackground(slide, at, styleMode = (0, runtime2.getRenderingTheme)()) {
    let value = (0, runtime2.frameById)(slide, at.frameId);
    if (value === void 0)
      return;
    let value2 = (0, runtime2.selectionNodePath)(at), items = [value.node];
    for (let value7 of value2) {
      let value8 = (0, runtime2.nodeChildren)(items[items.length - 1])?.[value7];
      if (value8 === void 0)
        return;
      items.push(value8);
    }
    if (items.some((input) => styleComplicatesContrast(input.style)) || items.some((input) => textShadowRecords(input.style).length > 0) || childrenComplicateContrast(value.node, new Set(items)))
      return;
    for (let count = 1; count < items.length; count++) {
      let value7 = items[count - 1];
      if (value7.kind === "overlay" && value7.layers.slice(value2[count - 1]).some((input) => subtreeComplicatesContrast(input.node)))
        return;
    }
    let value3 = items.some(hasTransformedDescendant) ? FULL_SLIDE_RECTANGLE : frameTextContrastSize(value, styleMode, slide.lists), value4 = slide.frames.indexOf(value);
    for (let value7 of slide.frames.slice(value4 + 1))
      if (subtreeComplicatesContrast(value7.node) && rectanglesOverlap_Ae0(contrastFrameBounds(value7).may, value3))
        return;
    let items2 = [], callback = (input) => {
      let state = {
        ...input,
        a: 1
      };
      for (let value7 = items2.length - 1; value7 >= 0; value7--)
        state = (0, runtime2.compositeContrastColor)(items2[value7], state);
      return {
        css: rgbToHexColor(state),
        label: BOX_FILL_LABEL
      };
    }, value5 = items.map(
      /* @__PURE__ */ ((input) => (input2) => input = input2.style?.visibility === void 0 ? input : input2.style.visibility !== "hidden")(!0)
    ), index4 = 0;
    for (let value7 = items.length - 1; value7 >= 1; value7--)
      if (items[value7].style?.transform !== void 0) {
        index4 = value7;
        break;
      }
    for (let value7 = items.length - 1; value7 >= 0; value7--) {
      let value8 = value7 > 0 ? items[value7 - 1] : void 0, value9 = value8?.kind === "overlay" ? value2[value7 - 1] : void 0, value10 = value5[value7] ? classifyContrastBackground(items[value7].style) : {
        kind: "none"
      };
      if (value10.kind !== "none" && value7 < index4 || value10.kind === "unknown")
        return;
      if (value10.kind === "solid")
        return callback(value10.color);
      if (value10.kind === "wash" && items2.push(value10.color), value8?.kind === "overlay" && value9 !== void 0 && value9 >= 1) {
        if (value8.layers.slice(0, value9 - 1).some((input) => subtreePaintsContrastSurface(input.node)))
          return;
        let value11 = certainSolidBackground(value8.base);
        if (value11 !== void 0) {
          if (index4 >= value7)
            return;
          let value12 = value7 - 1 === 0 && !hasTransformedDescendant(value.node) ? overlayBaseKnownSize(value, value8) : UNKNOWN_CONTAINER_SIZE;
          return overlayLayerFitsWithin(value8.layers[value9 - 1], value12, frameAvailableSize(value)) ? callback(value11) : void 0;
        }
        if (subtreePaintsContrastSurface(value8.base))
          return;
      }
    }
    let value6 = earlierFrameContrastBackground(slide, value, value3);
    if (value6 !== void 0) {
      if (value6 === SLIDE_CONTRAST_SOURCE) {
        let value7 = slideContrastBackground(slide), value8 = value7 === void 0 ? void 0 : (0, runtime2.parseContrastColor)(value7.css);
        return value7 === void 0 || value8 === void 0 ? void 0 : items2.length === 0 ? value7 : callback(value8);
      }
      return callback(value6);
    }
  }
  function earlierFrameContrastBackground(slide, frame, rectangle) {
    for (let value = slide.frames.indexOf(frame) - 1; value >= 0; value--) {
      let value2 = slide.frames[value];
      if (!subtreePaintsContrastSurface(value2.node))
        continue;
      let { may: value3, certain: value4 } = contrastFrameBounds(value2);
      if (!rectanglesOverlap_Ae0(value3, rectangle))
        continue;
      let value5 = certainSolidBackground(value2.node);
      return value5 !== void 0 && value4 !== void 0 && coversWholeSlide(value4) ? value5 : void 0;
    }
    return SLIDE_CONTRAST_SOURCE;
  }
  function overlayLayerFitsWithin(layer, container, available, atRoot = !1) {
    let callback = (input, options, context) => input.anchor === "center" ? input.offset === 0 && (input.size === void 0 || input.size <= (options ?? (atRoot ? context : -1))) : input.margin < 0 ? !1 : input.anchor === "fill" || input.size === void 0 ? input.margin < (options ?? context) : options !== void 0 ? input.margin + input.size <= options : atRoot && input.margin + input.size <= context;
    return !(!callback(layer.x, container.w, available.w) || !callback(layer.y, container.h, available.h) || !atRoot && layer.y.size !== void 0 && hasNonShrinkTextFit(layer.node) || !atRoot && hasNoWrapText(layer.node));
  }
  function overlayBaseKnownSize(frame, overlay) {
    if (!(0, runtime2.isUnplacedFlowContainer)(overlay.base))
      return UNKNOWN_CONTAINER_SIZE;
    let value = (0, runtime2.frameBounds)(frame.x, frame.y);
    return {
      w: frame.x.anchor === "fill" || frame.x.size !== void 0 ? value.w : void 0,
      h: frame.y.anchor === "fill" || frame.y.size !== void 0 && frame.node.kind !== "table" ? value.h : void 0
    };
  }
  function frameAvailableSize(frame) {
    let value = (0, runtime2.frameBounds)(frame.x, frame.y), value2 = frame.x.anchor === "fill" || frame.x.size !== void 0 ? value.w : frame.x.anchor === "trailing" ? value.x + value.w : frame.x.anchor === "center" ? runtime2.SLIDE_WIDTH : Math.max(0, runtime2.SLIDE_WIDTH - value.x), value3 = frame.y.anchor === "fill" || frame.y.size !== void 0 && frame.node.kind !== "table" ? value.h : frame.y.anchor === "trailing" ? value.y + value.h : frame.y.anchor === "center" ? runtime2.SLIDE_HEIGHT : Math.max(0, runtime2.SLIDE_HEIGHT - value.y);
    return {
      w: value2,
      h: value3
    };
  }
  function hasNonShrinkTextFit(node) {
    return node.kind === "text" && node.fit !== void 0 && node.fit !== "shrink" || ((0, runtime2.nodeChildren)(node) ?? []).some(hasNonShrinkTextFit);
  }
  function hasNoWrapText(node) {
    return node.kind === "text" && node.wrap === "nowrap" || ((0, runtime2.nodeChildren)(node) ?? []).some(hasNoWrapText);
  }
  function estimatedGlyphWidth(text, uppercase) {
    let length = (text.match(WIDE_CONTRAST_GLYPH_PATTERN) ?? []).length, value = text.replace(WIDE_CONTRAST_GLYPH_PATTERN, "");
    if (uppercase)
      return length * 1.05 + value.length * UPPERCASE_GLYPH_WIDTH;
    let length2 = (value.match(UPPERCASE_CONTRAST_GLYPH_PATTERN) ?? []).length;
    return length * 1.05 + length2 * UPPERCASE_GLYPH_WIDTH + (value.length - length2) * LOWERCASE_GLYPH_WIDTH;
  }
  function frameTextContrastSize(frame, node, background) {
    let { bare, certain } = contrastFrameBounds(frame), node2 = frame.node, value = certain !== void 0 || frame.y.anchor === "fill" || frame.y.size !== void 0 && node2.kind !== "table";
    if (node2.kind !== "text") {
      let value7 = certain ?? bare, value8 = value && hasNonShrinkTextFit(node2) ? {
        y: 0,
        h: runtime2.SLIDE_HEIGHT
      } : {}, value9 = hasNoWrapText(node2) ? {
        x: 0,
        w: runtime2.SLIDE_WIDTH
      } : {};
      return {
        ...value7,
        ...value8,
        ...value9
      };
    }
    let value2 = node2.wrap === "nowrap" ? {
      x: 0,
      w: runtime2.SLIDE_WIDTH
    } : {
      x: bare.x,
      w: bare.w
    }, value3 = frame.x.anchor === "center" && frame.x.size === void 0 ? runtime2.SLIDE_WIDTH / 2 - Math.abs(frame.x.offset) : bare.w, value4 = nodeTextContrastSize(node2, node, value3, background), value5 = certain ?? bare;
    if (value)
      return {
        ...value5,
        ...value2,
        h: Math.max(value5.h, value4)
      };
    let value6 = (0, runtime2.frameBounds)(frame.x, frame.y, 0, value4);
    return {
      ...value2,
      y: value6.y,
      h: value6.h
    };
  }
  function nodeTextContrastSize(node, parentRole, rectangle, available) {
    let value = (0, runtime2.nodeTypographyCombo)(node, parentRole), value2 = node.style ?? {}, value3 = value2.textTransform === "uppercase" || value2.textTransform === "capitalize", listIndent = (node.lineLists === void 0 ? void 0 : node.listIndent ?? (available === "css" ? runtime2.defaultListGutter : void 0)) ?? (node.list !== void 0 || node.lineLists !== void 0 ? 1.2 * value.fontSize : 0), value4 = (value2.paddingLeft ?? 0) + (value2.paddingRight ?? 0) + (value2.borderLeftWidth ?? value2.borderWidth ?? 0) + (value2.borderRightWidth ?? value2.borderWidth ?? 0) + (node.hangingIndent ?? 0) + listIndent, value5 = (0, runtime2.textListGutter)(node, available), value6 = Math.max(1, rectangle - (value5 === void 0 ? value4 : value4 - (value2.paddingLeft ?? 0) - 1.2 * value.fontSize + value5)), value7 = node.text.split(`
`).reduce((input, items) => input + (node.wrap === "nowrap" ? 1 : Math.max(1, Math.ceil((estimatedGlyphWidth(items, value3) * value.fontSize + items.length * Math.max(0, value.letterSpacing)) / value6))), 0), value8 = (value2.borderTopWidth ?? value2.borderWidth ?? 0) + (value2.borderBottomWidth ?? value2.borderWidth ?? 0);
    return value7 * value.fontSize * value.lineHeight + (value2.paddingTop ?? 0) + (value2.paddingBottom ?? 0) + value8;
  }
  function selectionContrastBackground(slide, selection, kinds, options = DEFAULT_CONTRAST_NODE_KINDS, extra = {}) {
    let items = [], value;
    for (let value2 of selection) {
      let value3 = (0, runtime2.selectedNode)(slide, value2);
      if (value3 === void 0 || value3.kind !== "text" && value3.kind !== "icon" || !options.includes(value3.kind))
        continue;
      if (extra.runs !== !0 && value3.kind === "text" && value3.marks?.some((input) => input.color !== void 0) === !0)
        return;
      let value4 = nodeContrastBackground(slide, value2, kinds);
      if (value4 === void 0)
        return;
      items.some((input) => input.label === value4.label && input.css.toLowerCase() === value4.css.toLowerCase()) || items.push(value4);
      let value5 = value3.kind === "icon" ? "graphic" : contrastContentKind((0, runtime2.nodeTypographyCombo)(value3, kinds).fontSize);
      (value === void 0 || CONTRAST_KIND_PRIORITY[value5] > CONTRAST_KIND_PRIORITY[value]) && (value = value5);
    }
    if (!(value === void 0 || items.length === 0))
      return {
        against: items.length === 1 ? items[0] : items,
        role: value
      };
  }
  return bindRuntimeValue(runtime2, "SLIDE_BACKGROUND_LABEL", () => SLIDE_BACKGROUND_LABEL, (value) => {
    SLIDE_BACKGROUND_LABEL = value;
  }), bindRuntimeValue(runtime2, "BOX_FILL_LABEL", () => BOX_FILL_LABEL, (value) => {
    BOX_FILL_LABEL = value;
  }), bindRuntimeValue(runtime2, "LARGE_TEXT_THRESHOLD", () => LARGE_TEXT_THRESHOLD, (value) => {
    LARGE_TEXT_THRESHOLD = value;
  }), bindRuntimeValue(runtime2, "contrastContentKind", () => contrastContentKind), bindRuntimeValue(runtime2, "OPAQUE_BACKGROUND_THRESHOLD", () => OPAQUE_BACKGROUND_THRESHOLD, (value) => {
    OPAQUE_BACKGROUND_THRESHOLD = value;
  }), bindRuntimeValue(runtime2, "TRANSPARENT_BACKGROUND_THRESHOLD", () => TRANSPARENT_BACKGROUND_THRESHOLD, (value) => {
    TRANSPARENT_BACKGROUND_THRESHOLD = value;
  }), bindRuntimeValue(runtime2, "boxShadowRecords", () => boxShadowRecords), bindRuntimeValue(runtime2, "textShadowRecords", () => textShadowRecords), bindRuntimeValue(runtime2, "hasInsetBoxShadow", () => hasInsetBoxShadow, (value) => {
    hasInsetBoxShadow = value;
  }), bindRuntimeValue(runtime2, "hasVisibleShadow", () => hasVisibleShadow, (value) => {
    hasVisibleShadow = value;
  }), bindRuntimeValue(runtime2, "styleShadowOutset", () => styleShadowOutset), bindRuntimeValue(runtime2, "nodeShadowOutset", () => nodeShadowOutset), bindRuntimeValue(runtime2, "classifyContrastBackground", () => classifyContrastBackground), bindRuntimeValue(runtime2, "styleComplicatesContrast", () => styleComplicatesContrast), bindRuntimeValue(runtime2, "isHiddenContrastNode", () => isHiddenContrastNode, (value) => {
    isHiddenContrastNode = value;
  }), bindRuntimeValue(runtime2, "hasTransformedDescendant", () => hasTransformedDescendant), bindRuntimeValue(runtime2, "paintsContrastSurface", () => paintsContrastSurface), bindRuntimeValue(runtime2, "subtreePaintsContrastSurface", () => subtreePaintsContrastSurface), bindRuntimeValue(runtime2, "subtreeComplicatesContrast", () => subtreeComplicatesContrast), bindRuntimeValue(runtime2, "childrenComplicateContrast", () => childrenComplicateContrast), bindRuntimeValue(runtime2, "containerShadowOutset", () => containerShadowOutset), bindRuntimeValue(runtime2, "coversWholeSlide", () => coversWholeSlide, (value) => {
    coversWholeSlide = value;
  }), bindRuntimeValue(runtime2, "rectanglesOverlap_Ae0", () => rectanglesOverlap_Ae0, (value) => {
    rectanglesOverlap_Ae0 = value;
  }), bindRuntimeValue(runtime2, "FULL_SLIDE_RECTANGLE", () => FULL_SLIDE_RECTANGLE, (value) => {
    FULL_SLIDE_RECTANGLE = value;
  }), bindRuntimeValue(runtime2, "contrastFrameBounds", () => contrastFrameBounds), bindRuntimeValue(runtime2, "overlayComplicatesContrast", () => overlayComplicatesContrast), bindRuntimeValue(runtime2, "certainSolidBackground", () => certainSolidBackground), bindRuntimeValue(runtime2, "rgbToHexColor", () => rgbToHexColor, (value) => {
    rgbToHexColor = value;
  }), bindRuntimeValue(runtime2, "slideContrastBackground", () => slideContrastBackground), bindRuntimeValue(runtime2, "nodeContrastBackground", () => nodeContrastBackground), bindRuntimeValue(runtime2, "SLIDE_CONTRAST_SOURCE", () => SLIDE_CONTRAST_SOURCE, (value) => {
    SLIDE_CONTRAST_SOURCE = value;
  }), bindRuntimeValue(runtime2, "earlierFrameContrastBackground", () => earlierFrameContrastBackground), bindRuntimeValue(runtime2, "overlayLayerFitsWithin", () => overlayLayerFitsWithin), bindRuntimeValue(runtime2, "UNKNOWN_CONTAINER_SIZE", () => UNKNOWN_CONTAINER_SIZE, (value) => {
    UNKNOWN_CONTAINER_SIZE = value;
  }), bindRuntimeValue(runtime2, "overlayBaseKnownSize", () => overlayBaseKnownSize), bindRuntimeValue(runtime2, "frameAvailableSize", () => frameAvailableSize), bindRuntimeValue(runtime2, "hasNonShrinkTextFit", () => hasNonShrinkTextFit), bindRuntimeValue(runtime2, "hasNoWrapText", () => hasNoWrapText), bindRuntimeValue(runtime2, "LOWERCASE_GLYPH_WIDTH", () => LOWERCASE_GLYPH_WIDTH, (value) => {
    LOWERCASE_GLYPH_WIDTH = value;
  }), bindRuntimeValue(runtime2, "UPPERCASE_GLYPH_WIDTH", () => UPPERCASE_GLYPH_WIDTH, (value) => {
    UPPERCASE_GLYPH_WIDTH = value;
  }), bindRuntimeValue(runtime2, "WIDE_CONTRAST_GLYPH_PATTERN", () => WIDE_CONTRAST_GLYPH_PATTERN, (value) => {
    WIDE_CONTRAST_GLYPH_PATTERN = value;
  }), bindRuntimeValue(runtime2, "UPPERCASE_CONTRAST_GLYPH_PATTERN", () => UPPERCASE_CONTRAST_GLYPH_PATTERN, (value) => {
    UPPERCASE_CONTRAST_GLYPH_PATTERN = value;
  }), bindRuntimeValue(runtime2, "estimatedGlyphWidth", () => estimatedGlyphWidth), bindRuntimeValue(runtime2, "frameTextContrastSize", () => frameTextContrastSize), bindRuntimeValue(runtime2, "nodeTextContrastSize", () => nodeTextContrastSize), bindRuntimeValue(runtime2, "CONTRAST_KIND_PRIORITY", () => CONTRAST_KIND_PRIORITY, (value) => {
    CONTRAST_KIND_PRIORITY = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_CONTRAST_NODE_KINDS", () => DEFAULT_CONTRAST_NODE_KINDS, (value) => {
    DEFAULT_CONTRAST_NODE_KINDS = value;
  }), bindRuntimeValue(runtime2, "TEXT_CONTRAST_NODE_KINDS", () => TEXT_CONTRAST_NODE_KINDS, (value) => {
    TEXT_CONTRAST_NODE_KINDS = value;
  }), bindRuntimeValue(runtime2, "ICON_CONTRAST_NODE_KINDS", () => ICON_CONTRAST_NODE_KINDS, (value) => {
    ICON_CONTRAST_NODE_KINDS = value;
  }), bindRuntimeValue(runtime2, "selectionContrastBackground", () => selectionContrastBackground), bindRuntimeValue(runtime2, "toolbarIconPath", () => toolbarIconPath, (value) => {
    toolbarIconPath = value;
  }), bindRuntimeValue(runtime2, "createToolbarIcon", () => createToolbarIcon, (value) => {
    createToolbarIcon = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_JUSTIFY_ICON", () => DEFAULT_JUSTIFY_ICON, (value) => {
    DEFAULT_JUSTIFY_ICON = value;
  }), bindRuntimeValue(runtime2, "JUSTIFY_ICONS", () => JUSTIFY_ICONS, (value) => {
    JUSTIFY_ICONS = value;
  }), bindRuntimeValue(runtime2, "ALIGN_ICONS", () => ALIGN_ICONS, (value) => {
    ALIGN_ICONS = value;
  }), bindRuntimeValue(runtime2, "CONNECTOR_DIRECTION_ICONS", () => CONNECTOR_DIRECTION_ICONS, (value) => {
    CONNECTOR_DIRECTION_ICONS = value;
  }), bindRuntimeValue(runtime2, "STACK_LAYOUT_ICON", () => STACK_LAYOUT_ICON, (value) => {
    STACK_LAYOUT_ICON = value;
  }), bindRuntimeValue(runtime2, "OVERLAY_LAYOUT_ICON", () => OVERLAY_LAYOUT_ICON, (value) => {
    OVERLAY_LAYOUT_ICON = value;
  }), bindRuntimeValue(runtime2, "SELECTION_ALIGN_ICONS", () => SELECTION_ALIGN_ICONS, (value) => {
    SELECTION_ALIGN_ICONS = value;
  }), () => {
    (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeHtmlWriter)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeTypographyInference)(), SLIDE_BACKGROUND_LABEL = "幻灯片背景", BOX_FILL_LABEL = "文本框填充", LARGE_TEXT_THRESHOLD = 44, OPAQUE_BACKGROUND_THRESHOLD = 0.98, TRANSPARENT_BACKGROUND_THRESHOLD = 0.02, hasInsetBoxShadow = (style) => boxShadowRecords(style).some((input) => input.inset === !0), hasVisibleShadow = (style) => boxShadowRecords(style).some((input) => input.inset !== !0) || textShadowRecords(style).length > 0, isHiddenContrastNode = (node) => node.style?.visibility === "hidden", coversWholeSlide = (rectangle) => rectangle.x <= 0 && rectangle.y <= 0 && rectangle.x + rectangle.w >= runtime2.SLIDE_WIDTH && rectangle.y + rectangle.h >= runtime2.SLIDE_HEIGHT, rectanglesOverlap_Ae0 = (left, right) => left.x <= right.x + right.w && right.x <= left.x + left.w && left.y <= right.y + right.h && right.y <= left.y + left.h, FULL_SLIDE_RECTANGLE = {
      x: 0,
      y: 0,
      w: runtime2.SLIDE_WIDTH,
      h: runtime2.SLIDE_HEIGHT
    }, rgbToHexColor = (color) => "#" + [color.r, color.g, color.b].map((input) => Math.round(input * 255).toString(16).padStart(2, "0")).join(""), SLIDE_CONTRAST_SOURCE = "slide", UNKNOWN_CONTAINER_SIZE = {
      w: void 0,
      h: void 0
    }, LOWERCASE_GLYPH_WIDTH = 0.75, UPPERCASE_GLYPH_WIDTH = 0.9, WIDE_CONTRAST_GLYPH_PATTERN = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, UPPERCASE_CONTRAST_GLYPH_PATTERN = /\p{Lu}/gu, CONTRAST_KIND_PRIORITY = {
      text: 2,
      largeText: 1,
      graphic: 0
    }, DEFAULT_CONTRAST_NODE_KINDS = ["text", "icon"], TEXT_CONTRAST_NODE_KINDS = ["text"], ICON_CONTRAST_NODE_KINDS = ["icon"], toolbarIconPath = (d, strokeWidth = 1) => ({
      d,
      strokeWidth
    }), createToolbarIcon = (name, d) => ({
      name,
      viewBox: 16,
      paths: [toolbarIconPath(d)]
    }), DEFAULT_JUSTIFY_ICON = "JustifySpaceBetween", JUSTIFY_ICONS = {
      "flex-start": "JustifyStart",
      start: "JustifyStart",
      center: "JustifyCenter",
      "flex-end": "JustifyEnd",
      end: "JustifyEnd",
      "space-between": "JustifySpaceBetween",
      "space-around": createToolbarIcon("JustifyAround", "M2.5 2.5V13.5M13.5 2.5V13.5M6 5V11M10 5V11"),
      "space-evenly": createToolbarIcon("JustifyEvenly", "M2.5 2.5V13.5M13.5 2.5V13.5M6.25 5V11M9.75 5V11M8 7V9"),
      stretch: createToolbarIcon("JustifyStretch", "M2.5 2.5V13.5M13.5 2.5V13.5M4.5 6H11.5M4.5 10H11.5")
    }, ALIGN_ICONS = {
      "flex-start": "AlignStart",
      start: "AlignStart",
      center: "AlignCenter",
      "flex-end": "AlignEnd",
      end: "AlignEnd",
      stretch: "AlignStretch",
      baseline: createToolbarIcon("AlignItemsBaseline", "M2.5 10.5H13.5M5 10.5V5L6.5 5M9.5 10.5V7H11.5V10.5"),
      auto: createToolbarIcon("AlignAuto", "M4 4H6M10 4H12M4 12H6M10 12H12M4 4V6M12 4V6M4 10V12M12 10V12")
    }, CONNECTOR_DIRECTION_ICONS = {
      tl: createToolbarIcon("ConnectorDownRight", "M4 4L12 12M12 6.5V12H6.5"),
      tr: createToolbarIcon("ConnectorDownLeft", "M12 4L4 12M4 6.5V12H9.5"),
      bl: createToolbarIcon("ConnectorUpRight", "M4 12L12 4M6.5 4H12V9.5"),
      br: createToolbarIcon("ConnectorUpLeft", "M12 12L4 4M9.5 4H4V9.5")
    }, STACK_LAYOUT_ICON = createToolbarIcon("LayoutStack", "M2.5 3.5H13.5V12.5H2.5Z M5 6V10M8 6V10M11 6V10"), OVERLAY_LAYOUT_ICON = createToolbarIcon("LayoutLayered", "M3 5H11V11H3Z M5 3H13V9"), SELECTION_ALIGN_ICONS = {
      left: createToolbarIcon("ActionAlignLeft", "M3.93 3.4V12.58M6.59 10.99H12.17M6.59 7.99H9.48M6.59 4.99H12.17"),
      hcenter: createToolbarIcon("ActionAlignHCenter", "M5.21 10.99H10.79M6.56 7.99H9.44M5.21 4.99H10.79"),
      right: createToolbarIcon("ActionAlignRight", "M12.07 3.4V12.58M3.83 10.99H9.41M6.52 7.99H9.41M3.83 4.99H9.41"),
      top: createToolbarIcon("ActionAlignTop", "M5 6.58V12.16M11 6.58V12.16M8 6.58V9.47M3.41 3.93H12.59"),
      vcenter: createToolbarIcon("ActionAlignVCenter", "M10.99 5.21V10.79M7.99 6.56V9.44M4.99 5.21V10.79"),
      bottom: createToolbarIcon("ActionAlignBottom", "M3.42 12.07H12.6M5.01 3.83V9.41M8.01 6.52V9.41M11.01 3.83V9.41")
    };
  };
}
export {
  installEditorContrastBackgrounds
};
