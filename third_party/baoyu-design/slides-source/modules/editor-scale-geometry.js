// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorScaleGeometry(runtime2) {
  var SCALE_MIN_FACTOR, SCALE_MAX_FACTOR, SCALE_FLOW_ICON_SIZE, SCALE_MIN_BOX, MAX_SCALED_GAP, MAX_SCALED_HANGING_INDENT, MAX_SCALED_LIST_INDENT, FONT_SIZE_RANGE, LETTER_SPACING_RANGE;
  function clampScaleFactor(factor, min2 = 0.01, max2 = 100) {
    return Math.min(Math.max(factor, min2), max2);
  }
  function roundToHundredths(value) {
    return Math.round(value * 100) / 100 || 0;
  }
  function parseScaleInput(text, width) {
    let normalized = text.replace(/[٠-٩۰-۹０-９]/g, (digit) => String(digit.charCodeAt(0) % 16)).replace(/[．٫]/g, ".").replace(/，/g, ",").replace(/[٪％﹪]/g, "%"), match = /^\s*(\d*[.,]?\d+)\s*(%|x|×|px)?\s*$/i.exec(normalized);
    if (match === null || /,\d{3}$/.test(match[1]))
      return null;
    let amount = Number(match[1].replace(",", ".")), unit = (match[2] ?? "%").toLowerCase(), factor = unit === "%" ? amount / 100 : unit === "px" ? width !== void 0 && width > 0 ? amount / width : NaN : amount;
    return Number.isFinite(factor) && factor > 0 ? factor : null;
  }
  function formatScalePercent(factor) {
    return String(Math.round(factor * 1e3) / 10) + "%";
  }
  function scaleGripAnchor(grip) {
    return {
      x: grip.includes("w") ? 1 : grip.includes("e") ? 0 : 0.5,
      y: grip.includes("n") ? 1 : grip.includes("s") ? 0 : 0.5
    };
  }
  function gripScaleFactor(box, grip, dx, dy, rotation = 0) {
    let [cos, sin] = [
      Math.cos(rotation * Math.PI / 180),
      Math.sin(rotation * Math.PI / 180)
    ], [along, across] = [dx * cos + dy * sin, dy * cos - dx * sin], measurable = (size4, other) => size4 > 0 && (size4 >= 8 || size4 >= other), horizontal = measurable(box.w, box.h) ? grip.includes("e") ? (box.w + along) / box.w : grip.includes("w") ? (box.w - along) / box.w : 1 : 1, vertical = measurable(box.h, box.w) ? grip.includes("s") ? (box.h + across) / box.h : grip.includes("n") ? (box.h - across) / box.h : 1 : 1;
    return Math.abs(horizontal - 1) >= Math.abs(vertical - 1) ? horizontal : vertical;
  }
  function scaleAnchorShift(box, anchor, from, to, rotation = 0) {
    let [cos, sin] = [
      Math.cos(rotation * Math.PI / 180),
      Math.sin(rotation * Math.PI / 180)
    ], [x, y] = [(anchor.x - 0.5) * box.w, (anchor.y - 0.5) * box.h];
    return {
      x: (x * cos - y * sin + box.w / 2) * (from - to),
      y: (x * sin + y * cos + box.h / 2) * (from - to)
    };
  }
  function scaleNumberFields(value, fields, factor) {
    if (typeof value != "object" || value === null)
      return value;
    let scaled = {
      ...value
    };
    for (let field of fields)
      typeof scaled[field] == "number" && (scaled[field] = scaled[field] * factor);
    return scaled;
  }
  function stylePropertyValueKind(name) {
    return runtime2.stylePropertyRegistry[name].value.kind;
  }
  function scaleStyleValue(name, value, nodeKind, factor) {
    switch (stylePropertyValueKind(name)) {
      case "len":
        return typeof value == "number" ? value * factor : value;
      case "shadow":
        return (Array.isArray(value) ? value : [value]).map((shadow) => scaleNumberFields(shadow, ["x", "y", "blur", "spread"], factor));
      case "gradient":
        return scaleNumberFields(value, ["repeat"], factor);
      case "filter":
        return scaleNumberFields(value, ["blur"], factor);
      case "transform":
        return scaleNumberFields(value, ["translateX", "translateY"], factor);
      case "size":
        return scaleNumberFields(value, ["px"], factor);
      case "animation": {
        let animation = value, keyframes = animation.keyframes;
        return Array.isArray(keyframes) ? {
          ...animation,
          keyframes: keyframes.map((keyframe) => ({
            ...keyframe,
            style: scaleStyleBag(keyframe.style ?? {}, nodeKind, factor)
          }))
        } : value;
      }
      default:
        return value;
    }
  }
  function scaleStyleBag(style, nodeKind, factor) {
    let scaled = {
      ...style
    };
    for (let name of runtime2.stylePropertyNames)
      scaled[name] !== void 0 && (scaled[name] = scaleStyleValue(name, scaled[name], nodeKind, factor));
    return scaled;
  }
  function scaleNodeStyle(style, nodeKind, factor) {
    let base = {
      ...style
    }, sideWidth = base.borderTopWidth ?? base.borderRightWidth ?? base.borderBottomWidth ?? base.borderLeftWidth;
    style.borderStyle !== void 0 && style.borderStyle !== "none" && style.borderWidth === void 0 && sideWidth === void 0 && (base.borderWidth = 3);
    let scaled = scaleStyleBag(base, nodeKind, factor);
    style.hover !== void 0 && (scaled.hover = scaleStyleBag(style.hover, nodeKind, factor));
    let normalized = runtime2.normalizeStyleBag(scaled, nodeKind).bag ?? {}, result = {};
    for (let name of Object.keys(base))
      result[name] = normalized[name] ?? base[name];
    return result;
  }
  function scaleClamped(value, factor, lo, hi) {
    return Math.min(hi, Math.max(lo, roundToHundredths(value * factor)));
  }
  function scaleTypeValue(value, factor, range) {
    return Math.min(range.hi, Math.max(range.lo, Math.floor(value * factor * 10 + 1e-6) / 10));
  }
  function scalePlacement(place, factor) {
    if (place === void 0)
      return {};
    let scaled = {
      ...place
    };
    return place.basis !== void 0 && (scaled.basis = scaleClamped(place.basis, factor, 0, runtime2.maxModelCoordinate)), place.minW !== void 0 && (scaled.minW = scaleClamped(place.minW, factor, 0, runtime2.maxModelCoordinate)), place.minH !== void 0 && (scaled.minH = scaleClamped(place.minH, factor, 0, runtime2.maxModelCoordinate)), place.maxW !== void 0 && (scaled.maxW = scaleClamped(place.maxW, factor, 1, runtime2.maxModelCoordinate)), place.maxH !== void 0 && (scaled.maxH = scaleClamped(place.maxH, factor, 1, runtime2.maxModelCoordinate)), {
      place: scaled
    };
  }
  function scaledNodeStyle(node, factor, extra = {}) {
    let nodeKind = (0, runtime2.nodeStyleKind)(node), style = {
      ...node.style,
      ...extra
    };
    return nodeKind === void 0 || Object.keys(style).length === 0 ? {} : {
      style: scaleNodeStyle(style, nodeKind, factor)
    };
  }
  function scaledTextStyle(node, fontSize, factor, extra = {}) {
    let letterSpacing = node.style?.letterSpacing;
    return {
      style: {
        ...scaledNodeStyle(node, factor, extra).style,
        fontSize: scaleTypeValue(fontSize, factor, FONT_SIZE_RANGE),
        ...letterSpacing !== void 0 ? {
          letterSpacing: scaleTypeValue(letterSpacing, factor, LETTER_SPACING_RANGE)
        } : {}
      }
    };
  }
  function nodeFontSize(node, theme) {
    return node.kind === "text" ? node.style?.fontSize ?? (0, runtime2.typeScaleForRole)(node.role, theme).fontSize : node.kind === "table" ? node.style?.fontSize ?? (0, runtime2.typeScaleForRole)(node.role ?? "body", theme).fontSize : void 0;
  }
  function withMeasuredAxisSize(axis, node, measured) {
    return (node.kind === "img" || node.kind === "icon" || node.kind === "shape" || node.kind === "html") && axis.anchor !== "fill" && axis.size === void 0 && axis.sizePct === void 0 && measured !== void 0 && measured > 0 ? {
      ...axis,
      size: measured
    } : axis;
  }
  function scaledStrokeWidth(node, factor) {
    return scaleClamped(node.strokeWidth ?? runtime2.defaultShapeStrokeWidth, factor, 1, runtime2.maxShapeStrokeWidth);
  }
  function scaledConnectorLength(length, node, factor) {
    let [inset, scaledInset] = [
      (0, runtime2.connectorArrowInset)(node.strokeWidth),
      (0, runtime2.connectorArrowInset)(scaledStrokeWidth(node, factor))
    ], between = Math.max(0, length - 2 * inset);
    return scaleClamped(between * factor + (length - between) * scaledInset / inset, 1, 1, runtime2.maxModelCoordinate);
  }
  function scaleConnectorAxis(scaled, original, node, factor) {
    if (!(0, runtime2.isConnectorNode)(node) || scaled.size === void 0 || original.size === void 0)
      return scaled;
    let size4 = scaledConnectorLength(original.size, node, factor);
    return {
      ...scaled,
      size: size4,
      margin: scaled.anchor === "center" ? scaled.margin : scaleClamped(scaled.margin + (scaled.size - size4) / 2, 1, 0, runtime2.maxModelCoordinate)
    };
  }
  function scaleAxisSpec(axis, factor) {
    return {
      ...axis,
      margin: scaleClamped(axis.margin, factor, 0, runtime2.maxModelCoordinate),
      offset: scaleClamped(axis.offset, factor, -runtime2.maxModelCoordinate, runtime2.maxModelCoordinate),
      ...axis.size !== void 0 ? {
        size: scaleClamped(axis.size, factor, 1, runtime2.maxModelCoordinate)
      } : {}
    };
  }
  function scaleTrackSize(track, factor) {
    return typeof track == "object" && "px" in track ? {
      px: scaleClamped(track.px, factor, 1, runtime2.maxModelCoordinate)
    } : track;
  }
  function childScaleContext(context, index4, flow) {
    return {
      ...context,
      unit: (0, runtime2.createNodeSelection)(context.unit.frameId, [
        ...(0, runtime2.selectionNodePath)(context.unit),
        index4
      ]),
      flow
    };
  }
  function scaledBoxSize(node, factor, fallback) {
    let width = node.w ?? fallback.w, height2 = node.h ?? fallback.h;
    return {
      ...width !== void 0 ? {
        w: scaleClamped(width, factor, 1, runtime2.maxModelCoordinate)
      } : {},
      ...height2 !== void 0 ? {
        h: scaleClamped(height2, factor, 1, runtime2.maxModelCoordinate)
      } : {}
    };
  }
  function scaleNode(node, factor, context) {
    let placement = scalePlacement(node.place, factor);
    switch (node.kind) {
      case "text": {
        let gutter = (0, runtime2.textListGutter)(node, context.lists), listIndent = node.lineLists === void 0 ? void 0 : node.listIndent ?? (context.lists === "css" ? runtime2.defaultListGutter : void 0), gradient = node.fill?.kind === "gradient" ? scaleNodeStyle({
          backgroundGradient: node.fill.gradient
        }, "slides-text", factor).backgroundGradient : void 0;
        return {
          ...node,
          ...scaledTextStyle(node, nodeFontSize(node, context.ctx.theme), factor, gutter !== void 0 ? {
            paddingLeft: gutter
          } : {}),
          ...node.hangingIndent !== void 0 ? {
            hangingIndent: scaleClamped(node.hangingIndent, factor, 0, MAX_SCALED_HANGING_INDENT)
          } : {},
          ...listIndent !== void 0 ? {
            listIndent: scaleClamped(listIndent, factor, 0, MAX_SCALED_LIST_INDENT)
          } : {},
          ...gradient !== void 0 ? {
            fill: {
              kind: "gradient",
              gradient
            }
          } : {},
          ...placement
        };
      }
      case "table": {
        let scalePadding = (value) => value === void 0 ? void 0 : Math.min(runtime2.maxGridGap, Math.round(value * factor * 10) / 10), paddingX = scalePadding(node.cellPadding?.x), paddingY = scalePadding(node.cellPadding?.y);
        return {
          ...node,
          ...scaledTextStyle(node, nodeFontSize(node, context.ctx.theme), factor),
          ...node.cellPadding !== void 0 ? {
            cellPadding: {
              ...paddingX !== void 0 ? {
                x: paddingX
              } : {},
              ...paddingY !== void 0 ? {
                y: paddingY
              } : {}
            }
          } : {},
          ...placement
        };
      }
      case "img": {
        let place = node.place, measuredWidth = context.flow && node.w === void 0 && node.h === void 0 && (place === void 0 || Object.keys(place).every((key) => key === "shrink" || (key === "alignSelf" || key === "justifySelf") && place[key] !== "stretch"));
        return {
          ...node,
          ...scaledBoxSize(node, factor, measuredWidth ? {
            w: context.ctx.rect(context.unit)?.w
          } : {}),
          ...scaledNodeStyle(node, factor),
          ...placement
        };
      }
      case "icon":
        return {
          ...node,
          ...scaledBoxSize(node, factor, context.flow ? {
            w: SCALE_FLOW_ICON_SIZE,
            h: SCALE_FLOW_ICON_SIZE
          } : {}),
          ...scaledNodeStyle(node, factor),
          ...placement
        };
      case "shape": {
        if (node.shape === "connector") {
          let flowSize2 = context.flow && node.w === void 0 && node.h === void 0 && !((node.place?.grow ?? 0) > 0) ? {
            w: runtime2.defaultMediaSize
          } : {}, [width, height2] = [node.w ?? flowSize2.w, node.h].map((size4) => size4 === void 0 ? void 0 : scaledConnectorLength(size4, node, factor));
          return {
            ...node,
            ...width !== void 0 ? {
              w: width
            } : {},
            ...height2 !== void 0 ? {
              h: height2
            } : {},
            strokeWidth: scaledStrokeWidth(node, factor),
            ...placement
          };
        }
        let flowSize = context.flow ? node.shape === "line" ? {
          h: runtime2.defaultMediaSize
        } : {
          w: runtime2.defaultMediaSize,
          h: runtime2.defaultMediaSize
        } : {};
        return {
          ...node,
          ...scaledBoxSize(node, factor, flowSize),
          ...scaledNodeStyle(node, factor),
          ...placement
        };
      }
      case "stack":
        return {
          ...node,
          gap: scaleClamped(node.gap, factor, 0, MAX_SCALED_GAP),
          ...node.rowGap !== void 0 ? {
            rowGap: scaleClamped(node.rowGap, factor, 0, MAX_SCALED_GAP)
          } : {},
          children: node.children.map((child, index4) => scaleNode(child, factor, childScaleContext(context, index4, !0))),
          ...scaledNodeStyle(node, factor),
          ...placement
        };
      case "grid":
        return {
          ...node,
          columns: node.columns.map((track) => scaleTrackSize(track, factor)),
          ...node.rows !== void 0 ? {
            rows: node.rows.map((track) => scaleTrackSize(track, factor))
          } : {},
          gap: scaleClamped(node.gap, factor, 0, MAX_SCALED_GAP),
          ...node.rowGap !== void 0 ? {
            rowGap: scaleClamped(node.rowGap, factor, 0, MAX_SCALED_GAP)
          } : {},
          children: node.children.map((child, index4) => scaleNode(child, factor, childScaleContext(context, index4, !0))),
          ...scaledNodeStyle(node, factor),
          ...placement
        };
      case "overlay":
        return {
          ...node,
          base: scaleNode(node.base, factor, childScaleContext(context, 0, context.flow)),
          layers: node.layers.map((layer, index4) => {
            let layerContext = childScaleContext(context, index4 + 1, !1), rect = context.ctx.rect(layerContext.unit), [x, y] = [
              withMeasuredAxisSize(layer.x, layer.node, rect?.w),
              withMeasuredAxisSize(layer.y, layer.node, rect?.h)
            ];
            return {
              node: scaleNode(layer.node, factor, layerContext),
              x: scaleConnectorAxis(scaleAxisSpec(x, factor), x, layer.node, factor),
              y: scaleConnectorAxis(scaleAxisSpec(y, factor), y, layer.node, factor)
            };
          }),
          ...scaledNodeStyle(node, factor),
          ...placement
        };
      case "html":
      case "spacer":
        return {
          ...node,
          ...placement
        };
    }
  }
  function scaleUnitsForSelection(slide, selection) {
    let units = selection.map((unit) => {
      let path = (0, runtime2.selectionNodePath)(unit), overlay = path.length > 0 && path[path.length - 1] === 0 ? (0, runtime2.createNodeSelection)(unit.frameId, path.slice(0, -1)) : void 0;
      return overlay !== void 0 && (0, runtime2.selectedNode)(slide, overlay)?.kind === "overlay" ? overlay : unit;
    });
    return (0, runtime2.normalizedGroupSelection)(slide, units).filter((unit) => (0, runtime2.selectionNodePath)(unit).length > 0 || !(0, runtime2.isPrimaryLayoutFrame)(slide, (0, runtime2.frameById)(slide, unit.frameId)));
  }
  function isStartAlignment(alignment) {
    return alignment === void 0 || alignment === "start" || alignment === "stretch";
  }
  function axisPinsStart(axis) {
    return axis.anchor === "leading" || axis.anchor === "fill" || axis.size !== void 0 || axis.sizePct !== void 0;
  }
  function childKeepsStart(parent, index4) {
    if (parent !== void 0 && (0, runtime2.isOverlayNode)(parent))
      return index4 === 0 || axisPinsStart(parent.layers[index4 - 1].x) && axisPinsStart(parent.layers[index4 - 1].y);
    if (parent === void 0 || !(0, runtime2.isFlowContainer)(parent))
      return !1;
    let place = parent.children[index4].place, isPx = (track) => typeof track == "object" && "px" in track;
    return parent.kind === "grid" ? isStartAlignment(place?.alignSelf ?? parent.alignItems) && isStartAlignment(place?.justifySelf ?? parent.justifyItems) && (index4 === 0 || [...parent.columns, ...parent.rows ?? []].every(isPx)) : isStartAlignment(parent.justify) && parent.wrap !== !0 && isStartAlignment(place?.alignSelf ?? parent.align) && !parent.children.slice(0, index4).some((child) => (child.place?.grow ?? 0) > 0);
  }
  function scaleGripMode(slide, units) {
    let unit = units.length === 1 ? units[0] : void 0, [frame, node] = unit === void 0 ? [] : [(0, runtime2.frameById)(slide, unit.frameId), (0, runtime2.selectedNode)(slide, unit)];
    if (unit === void 0 || frame === void 0 || node === void 0 || (0, runtime2.isConnectorNode)(node) || (0, runtime2.isLineShapeNode)(node))
      return "none";
    let path = (0, runtime2.selectionNodePath)(unit);
    if (path.length === 0)
      return "all";
    let ancestors = path.map((_step, index4) => (0, runtime2.nodeAtPath)(frame.node, path.slice(0, index4))), parent = ancestors[ancestors.length - 1], sizable = parent !== void 0 && (0, runtime2.isFlowContainer)(parent) && (0, runtime2.nodeSupportsSizing)(node), untransformed = [...ancestors, node].every((ancestor) => ancestor !== void 0 && (0, runtime2.nodeTransform)(ancestor) === void 0);
    return sizable && untransformed && axisPinsStart(frame.x) && axisPinsStart(frame.y) && path.every((step, index4) => childKeepsStart(ancestors[index4], step)) ? "far" : "none";
  }
  function unitsBoundingRect(units, context) {
    let rects = units.map((unit) => context.rect(unit));
    return rects.every((rect) => rect !== void 0) ? (0, runtime2.unionSelectionRectangles)(rects) ?? void 0 : void 0;
  }
  function scaleLimits(slide, units, context) {
    let min2 = SCALE_MIN_FACTOR, max2 = SCALE_MAX_FACTOR, capAt = (length, limit = runtime2.maxModelCoordinate) => {
      length !== void 0 && length > 0 && (max2 = Math.min(max2, limit / length));
    }, childUnit = (unit, index4) => (0, runtime2.createNodeSelection)(unit.frameId, [
      ...(0, runtime2.selectionNodePath)(unit),
      index4
    ]), visit = (node, unit) => {
      let fontSize = nodeFontSize(node, context.theme);
      if (fontSize !== void 0 && (min2 = Math.max(min2, FONT_SIZE_RANGE.lo / fontSize), max2 = Math.min(max2, FONT_SIZE_RANGE.hi / fontSize)), "w" in node || "h" in node) {
        let sized = node;
        [sized.w, sized.h].forEach((length) => capAt(length));
      }
      if ([
        node.place?.basis,
        node.place?.minW,
        node.place?.minH,
        node.place?.maxW,
        node.place?.maxH
      ].forEach((length) => capAt(length)), node.kind === "grid")
        for (let track of [...node.columns, ...node.rows ?? []])
          typeof track == "object" && "px" in track && capAt(track.px);
      node.kind === "text" && (capAt(node.hangingIndent, MAX_SCALED_HANGING_INDENT), capAt(node.lineLists !== void 0 ? node.listIndent ?? (slide.lists === "css" ? runtime2.defaultListGutter : void 0) : (0, runtime2.textListGutter)(node, slide.lists), MAX_SCALED_LIST_INDENT)), (0, runtime2.isFlowContainer)(node) && ([node.gap, node.rowGap].forEach((gap) => capAt(gap, MAX_SCALED_GAP)), node.children.forEach((child, index4) => visit(child, childUnit(unit, index4)))), (0, runtime2.isOverlayNode)(node) && (visit(node.base, childUnit(unit, 0)), node.layers.forEach((layer, index4) => {
        let rect = context.rect(childUnit(unit, index4 + 1));
        [
          withMeasuredAxisSize(layer.x, layer.node, rect?.w).size,
          withMeasuredAxisSize(layer.y, layer.node, rect?.h).size
        ].forEach((length) => capAt(length)), visit(layer.node, childUnit(unit, index4 + 1));
      }));
    };
    for (let unit of units) {
      let node = (0, runtime2.selectedNode)(slide, unit);
      node !== void 0 && visit(node, unit);
      let rect = context.rect(unit);
      [rect?.w, rect?.h].forEach((length) => capAt(length));
    }
    let box = unitsBoundingRect(units, context);
    return box !== void 0 && Math.max(box.w, box.h) > 0 && (min2 = Math.max(min2, SCALE_MIN_BOX / Math.max(box.w, box.h)), capAt(box.w, runtime2.maxModelCoordinate - Math.max(0, box.x)), capAt(box.h, runtime2.maxModelCoordinate - Math.max(0, box.y))), {
      min: Math.min(1, Math.ceil(min2 * 1e3 - 1e-6) / 1e3),
      max: Math.max(1, Math.floor(max2 * 1e3 + 1e-6) / 1e3)
    };
  }
  function scaleAxisPlacement(axis, factor, boxStart, shift4, designSize, rectStart, rectSize, translate) {
    let extent = (0, runtime2.resolveAxisSpec)(axis, designSize, rectSize), origin = extent.start + translate + (boxStart - rectStart), scaled = (0, runtime2.axisSpecFromRect)(axis, origin + (extent.start - origin) * factor + shift4, extent.size * factor, designSize), sizeFromContent = axis.anchor !== "fill" && axis.size === void 0 && axis.sizePct === void 0;
    return {
      anchor: scaled.anchor,
      margin: scaleClamped(scaled.margin, 1, 0, runtime2.maxModelCoordinate),
      offset: scaleClamped(scaled.offset, 1, -runtime2.maxModelCoordinate, runtime2.maxModelCoordinate),
      ...sizeFromContent ? {} : {
        size: scaleClamped(extent.size, factor, 1, runtime2.maxModelCoordinate)
      }
    };
  }
  function scaleLayerPosition(layer, factor, box, shift4, parentSize, rect) {
    let transform = layer.node.style?.transform, measured = rect ?? {
      x: box.x,
      y: box.y,
      w: 0,
      h: 0
    }, x = withMeasuredAxisSize(layer.x, layer.node, measured.w), y = withMeasuredAxisSize(layer.y, layer.node, measured.h);
    return {
      x: scaleConnectorAxis(scaleAxisPlacement(x, factor, box.x, shift4.x, parentSize.w, measured.x, measured.w, transform?.translateX ?? 0), x, layer.node, factor),
      y: scaleConnectorAxis(scaleAxisPlacement(y, factor, box.y, shift4.y, parentSize.h, measured.y, measured.h, transform?.translateY ?? 0), y, layer.node, factor)
    };
  }
  function keepFlowChildSize(scaled, original, parent, factor, rect) {
    if (rect === void 0 || parent === void 0 || !(0, runtime2.isFlowContainer)(parent) || !(0, runtime2.nodeSupportsSizing)(original))
      return scaled;
    let mainAxis = parent.kind === "stack" ? parent.dir === "h" ? "x" : "y" : void 0, grows = (original.place?.grow ?? 0) > 0, stretchesAcross = !(0, runtime2.isMediaSizeNode)(original) && (original.place?.alignSelf ?? (parent.kind === "stack" ? parent.align : parent.alignItems ?? "stretch")) === "stretch" && (0, runtime2.nodeSupportsSelfAlignment)(original, "alignSelf"), stretchesAlong = parent.kind === "stack" ? stretchesAcross : (original.place?.justifySelf ?? parent.justifyItems ?? "stretch") === "stretch" && (0, runtime2.nodeSupportsSelfAlignment)(original, "justifySelf"), result = scaled;
    return (0, runtime2.nodeExplicitAxisSize)(original, "x") === void 0 && (mainAxis === "x" ? grows : stretchesAlong) && (result = (0, runtime2.setNodeAxisSize)(result, "x", scaleClamped(rect.w, factor, 1, runtime2.maxModelCoordinate), mainAxis)), (mainAxis === "y" ? grows && (0, runtime2.nodeExplicitAxisSize)(original, "y") === void 0 : stretchesAcross) && (result = (0, runtime2.setNodeAxisSize)(result, "y", scaleClamped(rect.h, factor, 1, runtime2.maxModelCoordinate), mainAxis)), mainAxis !== "y" && stretchesAcross && factor < 1 ? {
      ...result,
      place: {
        ...result.place,
        alignSelf: "start"
      }
    } : result;
  }
  function scaleUnit(slide, unit, units, factor, box, shift4, context) {
    let frame = (0, runtime2.frameById)(slide, unit.frameId), path = (0, runtime2.selectionNodePath)(unit), node = frame && (0, runtime2.nodeAtPath)(frame.node, path);
    if (frame === void 0 || node === void 0)
      return slide;
    let rect = context.rect(unit), nodeContext = (flow) => ({
      ctx: context,
      lists: slide.lists,
      unit,
      flow
    });
    if (path.length === 0)
      return (0, runtime2.updateSlideFrame)(slide, frame.id, (current) => ({
        ...current,
        node: scaleNode(node, factor, nodeContext(!1)),
        ...scaleLayerPosition(current, factor, box, shift4, {
          w: runtime2.SLIDE_WIDTH,
          h: runtime2.SLIDE_HEIGHT
        }, rect)
      }));
    let parentPath = path.slice(0, -1), parent = (0, runtime2.nodeAtPath)(frame.node, parentPath);
    if (parent === void 0 || !(0, runtime2.isOverlayNode)(parent))
      return (0, runtime2.updateSlideFrame)(slide, frame.id, (current) => ({
        ...current,
        node: (0, runtime2.updateNodeAtPath)(current.node, path, (child) => keepFlowChildSize(scaleNode(child, factor, nodeContext(!0)), child, parent, factor, rect))
      }));
    let layerIndex = path[path.length - 1] - 1, layer = parent.layers[layerIndex], scaled = scaleNode(node, factor, nodeContext(!1)), withLayer = (replacement) => ({
      ...frame,
      node: (0, runtime2.updateNodeAtPath)(frame.node, parentPath, (overlay) => (0, runtime2.isOverlayNode)(overlay) ? {
        ...overlay,
        layers: overlay.layers.map((current, index4) => index4 === layerIndex ? replacement : current)
      } : overlay)
    });
    if (parentPath.length === 0 && (0, runtime2.isLeadingOverlayGroup)(frame) && rect !== void 0) {
      let scaleAxis = (axis) => scaleConnectorAxis({
        ...scaleAxisSpec(axis, factor),
        margin: axis.margin
      }, axis, node, factor), scaledFrame = withLayer({
        node: scaled,
        x: scaleAxis(withMeasuredAxisSize(layer.x, node, rect.w)),
        y: scaleAxis(withMeasuredAxisSize(layer.y, node, rect.h))
      }), layerRects = parent.layers.map((_layer, index4) => {
        let layerUnit = (0, runtime2.createNodeSelection)(frame.id, [index4 + 1]), layerRect = context.rect(layerUnit);
        return layerRect && (units.some((selected) => (0, runtime2.selectionsEqual)(selected, layerUnit)) ? {
          ...layerRect,
          w: layerRect.w * factor,
          h: layerRect.h * factor
        } : layerRect);
      }), moved = (0, runtime2.moveLeadingGroupLayer)(scaledFrame, layerIndex, roundToHundredths((rect.x - box.x) * (factor - 1) + shift4.x), roundToHundredths((rect.y - box.y) * (factor - 1) + shift4.y), layerRects);
      if (moved !== void 0)
        return (0, runtime2.updateSlideFrame)(slide, frame.id, () => moved);
    }
    let parentRect = context.rect((0, runtime2.createNodeSelection)(frame.id, parentPath));
    return (0, runtime2.updateSlideFrame)(slide, frame.id, () => withLayer({
      node: scaled,
      ...scaleLayerPosition(layer, factor, box, shift4, parentRect ?? {
        w: 0,
        h: 0
      }, rect)
    }));
  }
  function scaleUnits(slide, units, factor, box, context, shift4 = {
    x: 0,
    y: 0
  }) {
    return factor === 1 && shift4.x === 0 && shift4.y === 0 ? slide : units.reduce((current, unit) => scaleUnit(current, unit, units, factor, box, shift4, context), slide);
  }
  function frozenRectLookup(slide, units, measure) {
    let rects = /* @__PURE__ */ new Map(), visit = (frameId, node, path) => {
      let unit = (0, runtime2.createNodeSelection)(frameId, path);
      rects.set((0, runtime2.selectionKey)(unit), measure(unit)), ((0, runtime2.nodeChildren)(node) ?? []).forEach((child, index4) => visit(frameId, child, [...path, index4]));
    };
    for (let frameId of new Set(units.map((unit) => unit.frameId))) {
      let frame = (0, runtime2.frameById)(slide, frameId);
      frame !== void 0 && visit(frameId, frame.node, []);
    }
    return (unit) => rects.get((0, runtime2.selectionKey)(unit));
  }
  return bindRuntimeValue(runtime2, "SCALE_MIN_FACTOR", () => SCALE_MIN_FACTOR), bindRuntimeValue(runtime2, "SCALE_MAX_FACTOR", () => SCALE_MAX_FACTOR), bindRuntimeValue(runtime2, "clampScaleFactor", () => clampScaleFactor), bindRuntimeValue(runtime2, "roundToHundredths", () => roundToHundredths), bindRuntimeValue(runtime2, "parseScaleInput", () => parseScaleInput), bindRuntimeValue(runtime2, "formatScalePercent", () => formatScalePercent), bindRuntimeValue(runtime2, "scaleGripAnchor", () => scaleGripAnchor), bindRuntimeValue(runtime2, "gripScaleFactor", () => gripScaleFactor), bindRuntimeValue(runtime2, "scaleAnchorShift", () => scaleAnchorShift), bindRuntimeValue(runtime2, "scaleUnitsForSelection", () => scaleUnitsForSelection), bindRuntimeValue(runtime2, "scaleGripMode", () => scaleGripMode), bindRuntimeValue(runtime2, "unitsBoundingRect", () => unitsBoundingRect), bindRuntimeValue(runtime2, "scaleLimits", () => scaleLimits), bindRuntimeValue(runtime2, "scaleUnits", () => scaleUnits), bindRuntimeValue(runtime2, "frozenRectLookup", () => frozenRectLookup), () => {
    (0, runtime2.initializeStyleSchema)(), SCALE_MIN_FACTOR = 0.01, SCALE_MAX_FACTOR = 100, SCALE_FLOW_ICON_SIZE = 160, SCALE_MIN_BOX = 24, [MAX_SCALED_GAP, MAX_SCALED_HANGING_INDENT, MAX_SCALED_LIST_INDENT] = [512, 512, 256], FONT_SIZE_RANGE = runtime2.stylePropertyRegistry.fontSize.slidesValue, LETTER_SPACING_RANGE = runtime2.stylePropertyRegistry.letterSpacing.slidesValue;
  };
}
export {
  installEditorScaleGeometry
};
