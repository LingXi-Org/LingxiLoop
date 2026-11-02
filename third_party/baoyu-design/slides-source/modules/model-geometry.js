// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelGeometry(runtime2) {
  var minimumObjectSize, axisSpecsAreSized, shouldPreserveMediaAspect, nodeAxisHasSize, initializeModelGeometry;
  function applyAxisSpecCss(axis, nearProperty, farProperty, sizeProperty, style, centers) {
    switch (axis.anchor) {
      case "leading":
        style[nearProperty] = String(axis.margin) + "px", axis.size !== void 0 ? style[sizeProperty] = String(axis.size) + "px" : axis.sizePct !== void 0 && (style[sizeProperty] = String(axis.sizePct) + "%");
        break;
      case "trailing":
        style[farProperty] = String(axis.margin) + "px", axis.size !== void 0 ? style[sizeProperty] = String(axis.size) + "px" : axis.sizePct !== void 0 && (style[sizeProperty] = String(axis.sizePct) + "%");
        break;
      case "center":
        style[nearProperty] = axis.offset === 0 ? "50%" : "calc(50% + " + String(axis.offset) + "px)", centers.push("-50%"), axis.size !== void 0 ? style[sizeProperty] = String(axis.size) + "px" : axis.sizePct !== void 0 && (style[sizeProperty] = String(axis.sizePct) + "%");
        break;
      case "fill":
        style[nearProperty] = String(axis.margin) + "px", style[farProperty] = String(axis.margin) + "px";
        break;
    }
    axis.anchor !== "center" && centers.push("0");
  }
  function framePositionCss(frame) {
    let css = {}, centers = [];
    return applyAxisSpecCss(frame.x, "left", "right", "width", css, centers), applyAxisSpecCss(frame.y, "top", "bottom", "height", css, centers), frame.node.kind === "table" && (delete css.height, frame.y.anchor === "fill" && delete css.bottom), (centers[0] !== "0" || centers[1] !== "0") && (css.transform = "translate(" + centers[0] + ", " + centers[1] + ")"), css;
  }
  function resolveAxisSpec(axis, designSize, intrinsicSize) {
    let size4 = axis.anchor === "fill" ? designSize - 2 * axis.margin : axis.size ?? intrinsicSize;
    switch (axis.anchor) {
      case "leading":
        return {
          start: axis.margin,
          size: size4
        };
      case "trailing":
        return {
          start: designSize - axis.margin - size4,
          size: size4
        };
      case "center":
        return {
          start: designSize / 2 + axis.offset - size4 / 2,
          size: size4
        };
      case "fill":
        return {
          start: axis.margin,
          size: size4
        };
    }
  }
  function frameBounds(xAxis, yAxis, intrinsicWidth = 0, intrinsicHeight = 0) {
    let x = resolveAxisSpec(xAxis, runtime2.SLIDE_WIDTH, intrinsicWidth), y = resolveAxisSpec(yAxis, runtime2.SLIDE_HEIGHT, intrinsicHeight);
    return {
      x: x.start,
      y: y.start,
      w: x.size,
      h: y.size
    };
  }
  function frameRect(frame, intrinsicWidth, intrinsicHeight) {
    return frameBounds(frame.x, frame.y, intrinsicWidth, intrinsicHeight);
  }
  function clampMoveDeltaToSlide(rects, dx, dy) {
    let clamp3 = (delta, start, size4, slideSize) => {
      let keep = Math.min(size4, Math.max(minimumObjectSize, size4 / 4));
      return Math.min(Math.max(0, slideSize - keep - start), Math.max(Math.min(0, keep - start - size4), delta));
    };
    for (let rect of rects)
      dx = clamp3(dx, rect.x, rect.w, runtime2.SLIDE_WIDTH), dy = clamp3(dy, rect.y, rect.h, runtime2.SLIDE_HEIGHT);
    return {
      dx,
      dy
    };
  }
  function rotatedFrameBounds(frame, intrinsicWidth, intrinsicHeight) {
    return rotatedRectBounds_Rn({
      ...frameRect(frame, intrinsicWidth ?? 0, intrinsicHeight ?? 0),
      rotation: (nodeTransform(frame.node)?.rotate ?? 0) * Math.PI / 180
    });
  }
  function moveAxisSpec(axis, delta) {
    switch (axis.anchor) {
      case "leading":
        return {
          ...axis,
          margin: Math.max(0, axis.margin + delta)
        };
      case "trailing":
        return {
          ...axis,
          margin: Math.max(0, axis.margin - delta)
        };
      case "center":
        return {
          ...axis,
          offset: axis.offset + delta
        };
      case "fill":
        return axis;
    }
  }
  function isTextNode(node) {
    return node.kind === "text";
  }
  function implicitAxisAnchorPosition(axis, designSize) {
    return axis.anchor === "center" ? designSize / 2 - axis.offset : designSize - axis.margin;
  }
  function preserveImplicitAxisSize(axis, movedAxis, designSize, currentSize) {
    if (axis.anchor === "fill" || axis.size !== void 0 || axis.sizePct !== void 0 || movedAxis.anchor === "fill" || designSize === void 0)
      return movedAxis;
    if (movedAxis.anchor === axis.anchor && Math.abs(movedAxis.margin - axis.margin) < 0.01 && Math.abs(movedAxis.offset - axis.offset) < 0.01)
      return axis;
    let value = Math.max(1, Math.ceil(designSize));
    if (value >= implicitAxisAnchorPosition(axis, currentSize) - 0.5 || value > implicitAxisAnchorPosition(movedAxis, currentSize))
      return {
        ...movedAxis,
        size: value
      };
    if (movedAxis.size === void 0)
      return movedAxis;
    let { size: value2, ...value3 } = movedAxis;
    return value3;
  }
  function moveAxisSpecPreservingSize(axis, delta, designSize, currentSize) {
    return preserveImplicitAxisSize(axis, moveAxisSpec(axis, delta), designSize, currentSize);
  }
  function minimumNodeResizeSize(node, currentSize) {
    if (node.kind !== "shape" || node.shape !== "connector")
      return minimumObjectSize;
    let value = 2 * (0, runtime2.connectorArrowInset)(node.strokeWidth);
    return currentSize === void 0 || currentSize <= 0 || currentSize >= value ? value : Math.min(currentSize, node.strokeWidth ?? runtime2.defaultShapeStrokeWidth);
  }
  function axisSpecSize(axis, currentSize, designSize) {
    return axis.anchor === "fill" ? designSize - 2 * axis.margin : axis.size ?? currentSize;
  }
  function clampedResizeMargin(margin, delta, size4, minimumSize) {
    return Math.max(0, Math.min(margin + delta, margin + Math.max(0, size4 - minimumSize)));
  }
  function resizeAxisSpec(axis, edge, delta, currentSize, designSize, minimumSize = minimumObjectSize) {
    let value = axisSpecSize(axis, currentSize, designSize);
    if (axis.anchor === "fill") {
      let margin = axis.margin;
      if (edge === "near") {
        let value5 = clampedResizeMargin(margin, delta, value, minimumSize);
        return {
          anchor: "leading",
          margin: value5,
          offset: 0,
          size: Math.max(minimumSize, designSize - axis.margin - value5)
        };
      }
      return {
        anchor: "leading",
        margin,
        offset: 0,
        size: Math.max(minimumSize, value + delta)
      };
    }
    if (axis.anchor === "leading") {
      if (edge === "far")
        return {
          ...axis,
          size: Math.max(minimumSize, value + delta)
        };
      let value5 = clampedResizeMargin(axis.margin, delta, value, minimumSize);
      return {
        ...axis,
        margin: value5,
        size: Math.max(minimumSize, value - (value5 - axis.margin))
      };
    }
    if (axis.anchor === "trailing") {
      if (edge === "near")
        return {
          ...axis,
          size: Math.max(minimumSize, value - delta)
        };
      let value5 = clampedResizeMargin(axis.margin, -delta, value, minimumSize);
      return {
        ...axis,
        margin: value5,
        size: Math.max(minimumSize, value - (value5 - axis.margin))
      };
    }
    let value2 = edge === "far" ? delta : -delta, value3 = Math.max(minimumSize, value + value2), value4 = value3 - value;
    return {
      ...axis,
      offset: axis.offset + (edge === "far" ? value4 / 2 : -value4 / 2),
      size: value3
    };
  }
  function axisSpecFromRect(previousAxis, start, size4, designSize) {
    let state = {
      anchor: "center",
      margin: 0,
      offset: start + size4 / 2 - designSize / 2,
      size: size4
    };
    if (previousAxis.anchor === "center")
      return {
        ...state,
        margin: previousAxis.margin
      };
    let value = previousAxis.anchor === "trailing" ? designSize - start - size4 : start;
    return value < 0 ? state : {
      anchor: previousAxis.anchor === "trailing" ? "trailing" : "leading",
      margin: value,
      offset: 0,
      size: size4
    };
  }
  function nodeSupportsSizing(node) {
    switch (node.kind) {
      case "img":
      case "icon":
      case "shape":
      case "text":
      case "stack":
      case "grid":
        return !0;
      case "overlay":
        return (0, runtime2.isFlowContainer)(node.base) && node.base.place === void 0;
      default:
        return !1;
    }
  }
  function isMediaSizeNode(node) {
    return node.kind === "img" || node.kind === "icon" || node.kind === "shape";
  }
  function nodeSupportsSelfAlignment(node, property) {
    return !(node.kind === "img" || node.kind === "overlay" || property === "alignSelf" && node.kind === "table");
  }
  function nodeExplicitAxisSize(node, axis) {
    if (isMediaSizeNode(node))
      return axis === "x" ? node.w : node.h;
    let place = node.place;
    if (axis === "y")
      return place?.minH;
    if (place?.minW !== void 0 && place.minW === place.maxW)
      return place.minW;
  }
  function nodeSupportsIntrinsicSizing(node) {
    return node.kind !== "icon" && node.kind !== "shape";
  }
  function nodeHasIntrinsicSize(node, axis) {
    return node.kind === "html" || node.kind === "spacer" || !nodeSupportsIntrinsicSizing(node) ? !1 : node.kind === "text" ? node.text.trim() !== "" : node.kind === "overlay" ? nodeAxisHasSize(node.base, axis) : (0, runtime2.isFlowContainer)(node) ? (node.kind === "grid" ? axis === "x" ? node.columns : node.rows ?? [] : []).some((input) => typeof input == "object" && "px" in input) || node.children.some((input) => canResizeNodeAxis(input, axis, node)) : !0;
  }
  function canResizeNodeAxis(node, axis, parent) {
    if (node.kind === "spacer")
      return !1;
    if (nodeAxisHasSize(node, axis))
      return !0;
    if (node.kind === "icon" || node.kind === "shape")
      return !(axis === "x" && node.kind === "shape" && node.shape === "line");
    let place = node.place, value = parent.kind === "stack" && parent.dir === "h";
    return axis === "x" ? place?.minW !== void 0 || value && (place?.basis ?? 0) > 0 && place?.shrink === 0 : parent.kind === "stack" && !value && (place?.basis ?? 0) > 0 ? !0 : place?.aspect !== void 0 && (nodeExplicitAxisSize(node, "x") !== void 0 || place.minW !== void 0 || !value || (place.grow ?? 0) > 0);
  }
  function clearPlacementForExplicitSize(placement, axis, mainAxis) {
    clearPlacementAxisConstraints(placement, axis), axis === "y" && delete placement.aspect, axis === mainAxis && (delete placement.grow, delete placement.basis);
  }
  function setNodeAxisSize(node, axis, size4, parentDirection) {
    if (!nodeSupportsSizing(node))
      return node;
    let state = {
      ...node.place
    };
    if (isMediaSizeNode(node)) {
      let state2 = {
        ...node
      };
      return axis === "x" ? size4 === void 0 ? delete state2.w : state2.w = size4 : size4 === void 0 ? delete state2.h : state2.h = size4, size4 === void 0 && state2.kind === "img" && delete state2.crop, size4 !== void 0 ? (clearPlacementForExplicitSize(state, axis, parentDirection), axis === parentDirection && (state.shrink = 0)) : axis === parentDirection && (state.shrink === 0 && delete state.shrink, state.grow === 0 && delete state.grow), setNodePlacement(state2, state);
    }
    return size4 === void 0 ? (axis === "x" ? (delete state.minW, delete state.maxW) : state.maxH === state.minH ? clearPlacementAxisConstraints(state, "y") : delete state.minH, setNodePlacement(node, state)) : (clearPlacementForExplicitSize(state, axis, parentDirection), axis === "x" ? state.minW = state.maxW = size4 : state.minH = size4, setNodePlacement(node, state));
  }
  function setNodeAxisIntrinsicSize(node, axis, size4, parentDirection) {
    if (!nodeSupportsSizing(node))
      return node;
    if (size4 !== void 0 && (isMediaSizeNode(node) || axis === "x"))
      return setNodeAxisSize(node, axis, size4, parentDirection);
    let value = isMediaSizeNode(node) ? setNodeAxisSize(node, axis, void 0, parentDirection) : node, state = {
      ...value.place
    };
    return size4 === void 0 ? (axis === "x" && state.minW !== void 0 && state.minW === state.maxW && (delete state.minW, delete state.maxW), axis === "y" && state.minH !== void 0 && state.minH === state.maxH && (delete state.minH, delete state.maxH), setNodePlacement(value, state)) : (clearPlacementForExplicitSize(state, "y", parentDirection), state.minH = state.maxH = size4, setNodePlacement(node, state));
  }
  function clearPlacementAxisConstraints(placement, axis) {
    axis === "x" ? (delete placement.minW, delete placement.maxW, delete placement.minWFit) : (delete placement.minH, delete placement.maxH);
  }
  function setNodePlacement(node, placement) {
    let state = {
      ...node
    };
    return Object.keys(placement).length === 0 ? delete state.place : state.place = placement, state;
  }
  function resizeNodeFromEdges(node, resize, minimumWidth = minimumObjectSize, minimumHeight = minimumWidth) {
    let callback = (input, options, context) => Math.round(Math.min(Math.max(context, options), Math.max(options, input))), value = node;
    if (resize.xEdge !== null) {
      let value2 = resize.w + (resize.xEdge === "far" ? resize.dx : -resize.dx);
      value = setNodeAxisSize(value, "x", callback(value2, minimumWidth, Math.max(runtime2.SLIDE_WIDTH, resize.w)), resize.mainAxis);
    }
    if (resize.yEdge !== null) {
      let value2 = callback(resize.h + (resize.yEdge === "far" ? resize.dy : -resize.dy), minimumHeight, Math.max(runtime2.SLIDE_HEIGHT, resize.h)), place = node.place, value3 = place?.maxH !== void 0 && place.maxH <= resize.h + 1, value4 = resize.mainAxis === "y" && place?.basis !== void 0 && Math.abs(place.basis - resize.h) <= 1;
      if (!isMediaSizeNode(node) && (value3 || value4)) {
        let state = {
          ...value.place
        };
        return clearPlacementForExplicitSize(state, "y", resize.mainAxis), state.minH = state.maxH = value2, setNodePlacement(value, state);
      }
      let value5 = (nodeExplicitAxisSize(node, "y") ?? 0) >= resize.h - 1 || place?.aspect !== void 0 || resize.mainAxis === "y" && ((place?.grow ?? 0) > 0 || place?.basis !== void 0);
      (isMediaSizeNode(node) || Math.round(value2) > Math.round(resize.h) || value5) && (value = setNodeAxisSize(value, "y", value2, resize.mainAxis));
    }
    return value;
  }
  function aspectRatioResizeDeltas(resize, minimumSize = minimumObjectSize) {
    if (resize.xEdge === null || resize.yEdge === null || resize.w <= 0 || resize.h <= 0)
      return {
        dx: resize.dx,
        dy: resize.dy
      };
    let value = resize.xEdge === "far" ? resize.dx : -resize.dx, value2 = resize.yEdge === "far" ? resize.dy : -resize.dy, value3 = (resize.w + value) / resize.w, value4 = (resize.h + value2) / resize.h, value5 = Math.max(value3, value4);
    value5 = Math.min(value5, Math.max(runtime2.SLIDE_WIDTH, resize.w) / resize.w, Math.max(runtime2.SLIDE_HEIGHT, resize.h) / resize.h), value5 = Math.max(value5, resize.w > minimumSize ? minimumSize / resize.w : 0, resize.h > minimumSize ? minimumSize / resize.h : 0);
    let callback = (input, options) => input === "far" ? (value5 - 1) * options : (1 - value5) * options;
    return {
      dx: value5 === value3 ? resize.dx : callback(resize.xEdge, resize.w),
      dy: value5 === value4 ? resize.dy : callback(resize.yEdge, resize.h)
    };
  }
  function aspectRatioAxisResizeDeltas(xResize, yResize, minimumSize = minimumObjectSize) {
    let value = axisSpecSize(xResize.spec, xResize.currentSize, xResize.designSize), value2 = axisSpecSize(yResize.spec, yResize.currentSize, yResize.designSize);
    if (value <= 0 || value2 <= 0)
      return {
        dx: xResize.delta,
        dy: yResize.delta
      };
    let callback = (input) => input.edge === "far" ? input.delta : -input.delta, value3 = (value + callback(xResize)) / value, value4 = (value2 + callback(yResize)) / value2, value5 = Math.max(value3, value4);
    value5 = Math.min(value5, (value + axisResizeTravelLimit(xResize)) / value, (value2 + axisResizeTravelLimit(yResize)) / value2), value5 = Math.max(value5, value > minimumSize ? minimumSize / value : 0, value2 > minimumSize ? minimumSize / value2 : 0);
    let callback2 = (input, options) => input.edge === "far" ? (value5 - 1) * options : (1 - value5) * options;
    return {
      dx: value5 === value3 ? xResize.delta : callback2(xResize, value),
      dy: value5 === value4 ? yResize.delta : callback2(yResize, value2)
    };
  }
  function axisResizeTravelLimit({ spec, edge }) {
    return spec.anchor === "center" ? 1 / 0 : spec.anchor === "trailing" ? edge === "far" ? spec.margin : 1 / 0 : edge === "near" ? spec.margin : 1 / 0;
  }
  function pointInRotatedRect(rect, x, y) {
    let value = rect.rotation ?? 0, value2 = x - (rect.x + rect.w / 2), value3 = y - (rect.y + rect.h / 2), value4 = value2 * Math.cos(value) + value3 * Math.sin(value), value5 = -value2 * Math.sin(value) + value3 * Math.cos(value);
    return Math.abs(value4) <= rect.w / 2 && Math.abs(value5) <= rect.h / 2;
  }
  function rotatedRectBounds_Rn(rect) {
    let value = rect.rotation ?? 0, value2 = Math.abs(Math.cos(value)), value3 = Math.abs(Math.sin(value)), value4 = rect.w * value2 + rect.h * value3, value5 = rect.w * value3 + rect.h * value2;
    return {
      x: rect.x + (rect.w - value4) / 2,
      y: rect.y + (rect.h - value5) / 2,
      w: value4,
      h: value5
    };
  }
  function screenDeltaToLocalDelta(deltaX, deltaY, rotation, scale) {
    let value = Math.cos(rotation), value2 = Math.sin(rotation);
    return {
      dx: (deltaX * value + deltaY * value2) / scale,
      dy: (-deltaX * value2 + deltaY * value) / scale
    };
  }
  function snapRotation(rotation, delta, snap) {
    let value = rotation + delta;
    if (snap)
      value = Math.round(value / 15) * 15;
    else {
      let value3 = Math.round(value / 90) * 90;
      Math.abs(value - value3) <= 3 && (value = value3);
    }
    let value2 = ((Math.round(value) + 180) % 360 + 360) % 360 - 180;
    return value2 === -180 ? 180 : value2;
  }
  function angleBetweenPoints(startX, startY, endX, endY) {
    return Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
  }
  function moveFillAxisAsPinned(axis, delta, designSize) {
    if (axis.anchor !== "fill" || Math.abs(delta) < 1e-9)
      return moveAxisSpec(axis, delta);
    let value = designSize - 2 * axis.margin;
    return {
      anchor: "leading",
      margin: Math.max(0, axis.margin + delta),
      offset: 0,
      size: value
    };
  }
  function nodeTransform(node) {
    if (node?.kind === "shape")
      return node.rotate !== void 0 && node.rotate !== 0 ? {
        rotate: node.rotate
      } : void 0;
    let value = node?.style?.transform;
    if (value !== void 0 && ((value.rotate ?? 0) !== 0 || (value.scale ?? 1) !== 1 || value.skewX || value.skewY || value.translateX || value.translateY))
      return value;
  }
  function axisSpecCenter(axis, designSize, intrinsicSize) {
    let value = resolveAxisSpec(axis, designSize, intrinsicSize);
    return value.start + value.size / 2;
  }
  function transformPositionCompensation(deltaX, deltaY, rotation, scale) {
    let value = Math.cos(rotation), value2 = Math.sin(rotation);
    return {
      dx: scale * (deltaX * value - deltaY * value2) - deltaX,
      dy: scale * (deltaX * value2 + deltaY * value) - deltaY
    };
  }
  return bindRuntimeValue(runtime2, "applyAxisSpecCss", () => applyAxisSpecCss), bindRuntimeValue(runtime2, "framePositionCss", () => framePositionCss), bindRuntimeValue(runtime2, "resolveAxisSpec", () => resolveAxisSpec), bindRuntimeValue(runtime2, "frameBounds", () => frameBounds), bindRuntimeValue(runtime2, "moveAxisSpec", () => moveAxisSpec), bindRuntimeValue(runtime2, "isTextNode", () => isTextNode), bindRuntimeValue(runtime2, "implicitAxisAnchorPosition", () => implicitAxisAnchorPosition), bindRuntimeValue(runtime2, "preserveImplicitAxisSize", () => preserveImplicitAxisSize), bindRuntimeValue(runtime2, "moveAxisSpecPreservingSize", () => moveAxisSpecPreservingSize), bindRuntimeValue(runtime2, "minimumNodeResizeSize", () => minimumNodeResizeSize), bindRuntimeValue(runtime2, "axisSpecSize", () => axisSpecSize), bindRuntimeValue(runtime2, "resizeAxisSpec", () => resizeAxisSpec), bindRuntimeValue(runtime2, "axisSpecFromRect", () => axisSpecFromRect), bindRuntimeValue(runtime2, "nodeSupportsSizing", () => nodeSupportsSizing), bindRuntimeValue(runtime2, "isMediaSizeNode", () => isMediaSizeNode), bindRuntimeValue(runtime2, "nodeSupportsSelfAlignment", () => nodeSupportsSelfAlignment), bindRuntimeValue(runtime2, "nodeExplicitAxisSize", () => nodeExplicitAxisSize), bindRuntimeValue(runtime2, "nodeSupportsIntrinsicSizing", () => nodeSupportsIntrinsicSizing), bindRuntimeValue(runtime2, "nodeHasIntrinsicSize", () => nodeHasIntrinsicSize), bindRuntimeValue(runtime2, "canResizeNodeAxis", () => canResizeNodeAxis), bindRuntimeValue(runtime2, "clearPlacementForExplicitSize", () => clearPlacementForExplicitSize), bindRuntimeValue(runtime2, "setNodeAxisSize", () => setNodeAxisSize), bindRuntimeValue(runtime2, "setNodeAxisIntrinsicSize", () => setNodeAxisIntrinsicSize), bindRuntimeValue(runtime2, "clearPlacementAxisConstraints", () => clearPlacementAxisConstraints), bindRuntimeValue(runtime2, "setNodePlacement", () => setNodePlacement), bindRuntimeValue(runtime2, "resizeNodeFromEdges", () => resizeNodeFromEdges), bindRuntimeValue(runtime2, "aspectRatioResizeDeltas", () => aspectRatioResizeDeltas), bindRuntimeValue(runtime2, "aspectRatioAxisResizeDeltas", () => aspectRatioAxisResizeDeltas), bindRuntimeValue(runtime2, "axisResizeTravelLimit", () => axisResizeTravelLimit), bindRuntimeValue(runtime2, "pointInRotatedRect", () => pointInRotatedRect), bindRuntimeValue(runtime2, "rotatedRectBounds_Rn", () => rotatedRectBounds_Rn), bindRuntimeValue(runtime2, "frameRect", () => frameRect), bindRuntimeValue(runtime2, "clampMoveDeltaToSlide", () => clampMoveDeltaToSlide), bindRuntimeValue(runtime2, "rotatedFrameBounds", () => rotatedFrameBounds), bindRuntimeValue(runtime2, "screenDeltaToLocalDelta", () => screenDeltaToLocalDelta), bindRuntimeValue(runtime2, "snapRotation", () => snapRotation), bindRuntimeValue(runtime2, "angleBetweenPoints", () => angleBetweenPoints), bindRuntimeValue(runtime2, "moveFillAxisAsPinned", () => moveFillAxisAsPinned), bindRuntimeValue(runtime2, "nodeTransform", () => nodeTransform), bindRuntimeValue(runtime2, "axisSpecCenter", () => axisSpecCenter), bindRuntimeValue(runtime2, "transformPositionCompensation", () => transformPositionCompensation), bindRuntimeValue(runtime2, "minimumObjectSize", () => minimumObjectSize, (value) => {
    minimumObjectSize = value;
  }), bindRuntimeValue(runtime2, "axisSpecsAreSized", () => axisSpecsAreSized, (value) => {
    axisSpecsAreSized = value;
  }), bindRuntimeValue(runtime2, "shouldPreserveMediaAspect", () => shouldPreserveMediaAspect, (value) => {
    shouldPreserveMediaAspect = value;
  }), bindRuntimeValue(runtime2, "nodeAxisHasSize", () => nodeAxisHasSize, (value) => {
    nodeAxisHasSize = value;
  }), bindRuntimeValue(runtime2, "initializeModelGeometry", () => initializeModelGeometry, (value) => {
    initializeModelGeometry = value;
  }), () => {
    minimumObjectSize = 24, axisSpecsAreSized = (input, options) => [input, options].every((input2) => input2.anchor === "fill" || input2.size !== void 0), shouldPreserveMediaAspect = (input, options, context) => context ? input.w !== void 0 && input.h !== void 0 : options, nodeAxisHasSize = (input, options) => nodeExplicitAxisSize(input, options) !== void 0 || nodeHasIntrinsicSize(input, options), initializeModelGeometry = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)();
    });
  };
}
export {
  installModelGeometry
};
