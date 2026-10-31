// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorCanvas(runtime2) {
  var CanvasEditorJsx, EMPTY_EDITOR_TOOL_OPTIONS, placementSideToSnapLine, HORIZONTAL_GROUP_RESIZE_HANDLES, EDITOR_ENTER_KEY_HINTS, EDITOR_TEXT_ZOOM_BOTTOM_PADDING, EDITOR_TEXT_ZOOM_MIN_TEXT_PX, EDITOR_KEYBOARD_ZOOM, EDITOR_TEXT_ZOOM_TAP_GUARD_MS, TEXT_COLOR_LABEL, STYLE_DEFAULT_LABEL, SYSTEM_FONT_LABEL, THEME_DEFAULT_LABEL, SLIDE_FULL_MESSAGE;
  function editorVideoEnterHint(handle) {
    return handle?.openLabel !== void 0 ? "open" : handle !== void 0 && handle.pause === void 0 ? "playStop" : "play";
  }
  function fitTextEditingZoom(textRect, viewport, currentView, maxScale, fontPx = 1 / 0, keyboard2 = !1) {
    let width = viewport.w - 2 * EDITOR_TEXT_ZOOM_SIDE_PADDING;
    if (!(textRect.w > 0) || !(width > 0))
      return currentView;
    let top = viewport.top ?? 0, reserve = keyboard2 || viewport.h >= 2 * EDITOR_TEXT_ZOOM_TOP_PADDING ? EDITOR_TEXT_ZOOM_TOP_PADDING : 8, gap = keyboard2 ? 8 : reserve, scale = Math.min(width / textRect.w, textRect.h > 0 ? Math.max((viewport.h - reserve - (keyboard2 ? gap : 0) - EDITOR_TEXT_ZOOM_BOTTOM_PADDING) / textRect.h, EDITOR_TEXT_ZOOM_MIN_TEXT_PX / fontPx) : 1, 1, maxScale);
    if (scale >= currentView.scale * 1.2)
      return clampEditorViewport({
        scale,
        x: textRect.x + textRect.w / 2 - viewport.w / (2 * scale),
        y: textRect.y - (top + gap) / scale
      }, viewport);
    let scrolled = clampEditorViewport({
      ...currentView,
      y: textRect.y - (top + gap) / currentView.scale
    }, viewport);
    return scrolled.y > currentView.y ? scrolled : currentView;
  }
  function unionRotatedRectBounds(rects) {
    return (0, runtime2.unionSelectionRectangles)(rects.filter((rect) => rect !== null).map((rect) => (0, runtime2.rotatedRectBounds_Rn)(rect)));
  }
  function FormattingToolbarTransition({ on, children }) {
    let [lingering, setLingering] = runtime2.reactK_.useState(!1);
    return runtime2.reactK_.useEffect(() => {
      if (on) {
        setLingering(!0);
        return;
      }
      let timer = setTimeout(() => setLingering(!1), 400);
      return () => clearTimeout(timer);
    }, [on]), CanvasEditorJsx.jsx("div", {
      className: (0, runtime2.joinClassNames)("h-full", (on || lingering) && "[&_*]:transition-colors [&_*]:duration-200 motion-reduce:[&_*]:transition-none"),
      children
    });
  }
  function describeTextLinks(node) {
    let runs = [];
    for (let mark of node.marks ?? []) {
      if (mark.href === void 0)
        continue;
      let href = (0, runtime2.normalizeExternalLink)(mark.href) ?? mark.href, last = runs.at(-1);
      last !== void 0 && last.href === href && last.end === mark.start ? last.end = mark.end : runs.push({ start: mark.start, end: mark.end, href });
    }
    return runs.map((run) => String(run.start) + "-" + String(run.end) + " " + run.href).join(`
`);
  }
  function selectionLinkValue(element) {
    let format = element === null ? null : (0, runtime2.readRichTextSelection)(element);
    return format?.href !== void 0 ? (0, runtime2.normalizeExternalLink)(format.href) ?? format.href : format?.touchesLink === !0 ? "several" : "";
  }
  function linkChangeMessage(changes) {
    let changed = changes.filter(([before, after]) => before !== after);
    return changed.length === 0 ? null : changed.every(([, after]) => after === "") ? "Link removed" : changed.every(([before]) => before === "") ? "Link added" : "Link updated";
  }
  function announceLinkChanges(changes) {
    let message = linkChangeMessage(changes);
    message !== null && (0, runtime2.announceLiveMessage)(message);
  }
  var EDITOR_VIEWPORT_PADDING, EDITOR_MIN_STAGE_HEIGHT, EDITOR_STAGE_PADDING_FRACTION, EDITOR_FALLBACK_STAGE_WIDTH, EDITOR_FORMATTING_LABELS, centerViewportAxis, EDITOR_TEXT_ZOOM_DURATION_MS, EDITOR_TEXT_ZOOM_SIDE_PADDING, EDITOR_TEXT_ZOOM_TOP_PADDING, SLIDE_LIFT_SCALE_ATTRIBUTE, getFrameHitTestOptions, isEmptyUnstyledFlowContainer, canInsertNodeIntoFlow, NODE_BACKGROUND_AND_PADDING_PROPERTIES, TEXT_ALIGNMENT_LABELS, TEXT_ALIGNMENT_ICONS, TABLE_TEXT_ALIGNMENT_OPTIONS, TEXT_ALIGNMENT_OPTIONS;
  function typeStylesToEditorOptions(typeStyles) {
    return typeStyles.map((input) => ({
      value: input.id,
      text: input.name,
      label: CanvasEditorJsx.jsx("span", {
        className: "min-w-0 whitespace-nowrap",
        style: (0, runtime2.typographyStyleCss)(input),
        children: input.name
      }),
      hint: input.hint,
      ...input.title !== void 0 ? {
        title: input.title
      } : {},
      ...input.group !== void 0 ? {
        group: input.group
      } : {},
      ...input.subgroup !== void 0 ? {
        subgroup: input.subgroup
      } : {}
    }));
  }
  function resolveSingleUnitTransformTarget(slide, selection) {
    if (selection.length !== 1)
      return null;
    let unit = selection[0], frame = (0, runtime2.frameById)(slide, unit.frameId);
    if (unit.child === void 0)
      return !runtime2.GROUP_RESIZING_ENABLED && frame !== void 0 && (0, runtime2.isEmptyGroupBase)(frame.node) ? null : {
        unit,
        flow: !1
      };
    if (!frame)
      return null;
    let value = (0, runtime2.selectionNodePath)(unit), value2 = (0, runtime2.nodeAtPath)(frame.node, value), value3 = (0, runtime2.nodeAtPath)(frame.node, value.slice(0, -1));
    if (!value2 || !value3 || !(0, runtime2.isFlowContainer)(value3) || !(0, runtime2.nodeSupportsSizing)(value2))
      return null;
    let value4 = value3.kind === "stack" ? value3.dir === "h" ? "x" : "y" : void 0;
    return {
      unit,
      flow: !0,
      mainAxis: value4
    };
  }
  function resolveSingleUnitStyleTarget(slide, selection) {
    if (selection.length !== 1)
      return null;
    let unit = selection[0], node = (0, runtime2.selectedNode)(slide, unit);
    if (node === void 0 || node.kind === "overlay")
      return null;
    let path = (0, runtime2.selectionNodePath)(unit);
    return path.length > 0 && path[path.length - 1] === 0 && (0, runtime2.selectedNode)(slide, (0, runtime2.createNodeSelection)(unit.frameId, path.slice(0, -1)))?.kind === "overlay" ? null : (node.kind === "shape" ? node.shape !== "connector" : (0, runtime2.nodeStyleKind)(node) !== void 0) ? unit : null;
  }
  function copySelectedUnitsToClipboard(slide, selection) {
    (0, runtime2.setGestureCursor)((0, runtime2.rotatedResizeCursor)(slide, selection));
  }
  function editorRectsEqual(left, right) {
    return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h && left.rotation === right.rotation && left.nodeScale === right.nodeScale;
  }
  function fitSlideEditorViewport(viewport) {
    let bottomPadding = Math.min(EDITOR_VIEWPORT_PADDING, Math.max(viewport.h - EDITOR_MIN_STAGE_HEIGHT, viewport.h * EDITOR_STAGE_PADDING_FRACTION)), width = Math.min(viewport.w - 2 * (viewport.sidePad ?? EDITOR_VIEWPORT_PADDING / 2), (viewport.h - bottomPadding) * runtime2.SLIDE_WIDTH / runtime2.SLIDE_HEIGHT), scale = (width > 0 ? width : EDITOR_FALLBACK_STAGE_WIDTH) / runtime2.SLIDE_WIDTH;
    return {
      x: centerViewportAxis(viewport.w, runtime2.SLIDE_WIDTH, scale, 0),
      y: centerViewportAxis(viewport.h, runtime2.SLIDE_HEIGHT, scale, viewport.top ?? 0),
      scale
    };
  }
  function editorViewportFromScreenRect(slideRect, containerRect) {
    let scale = slideRect.width / runtime2.SLIDE_WIDTH;
    return {
      scale,
      x: -(slideRect.left - containerRect.left) / scale,
      y: -(slideRect.top - containerRect.top) / scale
    };
  }
  function clampEditorViewport(view, viewport) {
    if (view.scale <= 0)
      return view;
    let padding = EDITOR_VIEWPORT_PADDING / view.scale, callback = (input, options, context, value3) => {
      let value4 = options / view.scale;
      if (value4 >= context)
        return centerViewportAxis(options, context, view.scale, value3);
      let value5 = value3 / view.scale;
      return Math.min(context - value4 + padding - value5, Math.max(-padding - value5, input));
    }, value = callback(view.x, viewport.w, runtime2.SLIDE_WIDTH, 0), value2 = callback(view.y, viewport.h, runtime2.SLIDE_HEIGHT, viewport.top ?? 0);
    return value === view.x && value2 === view.y ? view : {
      x: value,
      y: value2,
      scale: view.scale
    };
  }
  function getEditorViewportBounds(element, topInset = 0) {
    let bounds = element?.getBoundingClientRect();
    return bounds !== void 0 && bounds.width > 0 ? {
      left: bounds.left,
      top: bounds.top + topInset,
      right: bounds.right,
      bottom: bounds.bottom
    } : {
      left: 0,
      top: topInset,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }
  function constrainEditorBandBottom(bottom, viewportHeight, bottomInset) {
    return bottomInset > 0 ? Math.min(bottom, viewportHeight - bottomInset) : bottom;
  }
  function unscaleEditorScreenRect(rect, originX, originY, scaleX, scaleY) {
    return !(scaleX > 0) || !(scaleY > 0) ? rect : {
      left: originX + (rect.left - originX) / scaleX,
      top: originY + (rect.top - originY) / scaleY,
      width: rect.width / scaleX,
      height: rect.height / scaleY
    };
  }
  function parseCssScaleFactors(cssScale) {
    let [scaleX, scaleY] = (cssScale ?? "").trim().split(/\s+/).map(parseFloat), fallback = scaleX !== void 0 && scaleX > 0 ? scaleX : 1;
    return [fallback, scaleY !== void 0 && scaleY > 0 ? scaleY : fallback];
  }
  function getUnliftedBoundingClientRect(element) {
    let rect = element.getBoundingClientRect(), liftedAncestor = element.closest("[" + SLIDE_LIFT_SCALE_ATTRIBUTE + "]");
    if (liftedAncestor === null)
      return rect;
    let value = getComputedStyle(liftedAncestor), [value2, value3] = parseCssScaleFactors(value.scale), [value4, value5] = parseCssScaleFactors(liftedAncestor.getAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE)), value6 = liftedAncestor === element ? rect : liftedAncestor.getBoundingClientRect(), [value7, value8] = (value.transformOrigin ?? "").split(" ").map(parseFloat), value9 = liftedAncestor instanceof HTMLElement ? liftedAncestor.offsetWidth : 0, value10 = liftedAncestor instanceof HTMLElement ? liftedAncestor.offsetHeight : 0, value11 = value9 > 0 && value7 !== void 0 && !Number.isNaN(value7) ? value7 / value9 : 0.5, value12 = value10 > 0 && value8 !== void 0 && !Number.isNaN(value8) ? value8 / value10 : 0.5;
    return unscaleEditorScreenRect(rect, value6.left + value11 * value6.width, value6.top + value12 * value6.height, value2 / value4, value3 / value5);
  }
  function placeFloatingEditorToolbar(layout) {
    let maxTop = layout.bandTop + 8, desiredTop = Math.max(maxTop, layout.bandBottom - 8 - layout.menuH), value = Math.max(maxTop, layout.selTop - layout.menuH - 10);
    if (value + layout.menuH + 8 <= layout.selTop)
      return {
        top: Math.min(value, desiredTop),
        placed: "above",
        overlaps: !1
      };
    let value2 = layout.selBottom + 10;
    if (value2 <= desiredTop)
      return {
        top: Math.max(maxTop, value2),
        placed: "below",
        overlaps: !1
      };
    let value3 = layout.caret();
    if (value3 === null || value3.top >= maxTop + layout.menuH + 10)
      return {
        top: maxTop,
        placed: "above",
        overlaps: !0
      };
    let value4 = Math.max(maxTop, value3.bottom + 10);
    if (value4 <= desiredTop)
      return {
        top: value4,
        placed: "below",
        overlaps: !0
      };
    let callback = (input, options) => Math.max(0, Math.min(input + layout.menuH, value3.bottom) - Math.max(input, options)), value5 = value3.lineTop ?? value3.top;
    return (callback(maxTop, value5) - callback(desiredTop, value5) || callback(maxTop, value3.top) - callback(desiredTop, value3.top)) <= 0 ? {
      top: maxTop,
      placed: "above",
      overlaps: !0
    } : {
      top: desiredTop,
      placed: "below",
      overlaps: !0
    };
  }
  function getEditableCaretClientRect() {
    let selection = document.getSelection(), focusNode = selection?.focusNode ?? null, focusOffset = selection?.focusOffset ?? 0, focusElement = focusNode instanceof Element ? focusNode : focusNode?.parentElement ?? null;
    if (focusNode === null || focusElement === null || focusElement.closest("[data-text-path][contenteditable]") === null)
      return null;
    for (; focusNode.nodeType === 1 && focusNode.childNodes.length > 0; ) {
      let childNodes = focusNode.childNodes, value7 = focusOffset >= childNodes.length, value8 = childNodes[value7 ? childNodes.length - 1 : focusOffset];
      if (value8 === void 0)
        break;
      focusNode = value8, focusOffset = value7 ? value8.nodeType === 3 ? (value8.textContent ?? "").length : value8.childNodes.length : 0;
    }
    let value = document.createRange();
    value.setStart(focusNode, focusOffset);
    let value2 = value.getClientRects()[0];
    if (value2 === void 0 && focusNode.nodeType === 3 && (focusNode.textContent ?? "") !== "") {
      let value7 = Math.max(1, focusOffset);
      value.setStart(focusNode, value7 - 1), value.setEnd(focusNode, value7), value2 = [...value.getClientRects()].pop();
    }
    let value3 = value2 ?? (focusNode instanceof Element ? focusNode : focusNode.parentElement ?? focusElement).getBoundingClientRect(), bottom = value3.bottom, value4, value5 = focusNode.nodeType === 3 ? focusNode : null, value6 = focusOffset, ancestor = focusElement.closest("[data-text-path][contenteditable]");
    if (value5 !== null && ancestor !== null && focusOffset >= (focusNode.textContent ?? "").length) {
      let value7 = document.createTreeWalker(ancestor, 5);
      value7.currentNode = focusNode, value5 = null, value6 = 0;
      for (let value8 = value7.nextNode(); value8 !== null; value8 = value7.nextNode())
        if (value8.nodeType !== 3) {
          if (value8.nodeName === "BR" || value8 instanceof Element && getComputedStyle(value8).display !== "inline")
            break;
        } else if ((value8.textContent ?? "") !== "") {
          value5 = value8;
          break;
        }
    }
    if (value5 !== null && value6 < (value5.textContent ?? "").length) {
      value.setStart(value5, value6), value.setEnd(value5, value6 + 1);
      let value7 = value.getClientRects()[0];
      value7 !== void 0 && value7.bottom > bottom && (bottom = value7.bottom, value4 = Math.round(value7.top));
    }
    return value4 === void 0 ? {
      top: Math.round(value3.top),
      bottom: Math.round(bottom)
    } : {
      top: Math.round(value3.top),
      bottom: Math.round(bottom),
      lineTop: value4
    };
  }
  function chooseTextEditingTarget(element, frameElement, node) {
    if (element.closest("[data-cell], [data-text-path]") !== null)
      return element;
    let value = (0, runtime2.editableElementAtPoint)(frameElement, node);
    return value !== null ? value : element;
  }
  function pointerDragThreshold(pointerType) {
    return pointerType === "touch" ? 9 : pointerType === "pen" ? 4 : 1.5;
  }
  function isAdditionalTouchPointer(pointers, event) {
    return event.pointerType === "touch" && !event.isPrimary && pointers.size >= 1 && !pointers.has(event.pointerId);
  }
  function isFrameOrResizeTarget(target) {
    let element = target;
    return element !== null && typeof element.closest == "function" && element.closest("[data-frame-id], [data-resize-handle]") !== null;
  }
  function canStartCanvasPinch(context) {
    return context.dragActive ? !1 : !context.editTarget;
  }
  function canStartCanvasRectSelection(context) {
    return context.pointerType === "mouse" && context.button === 0 && context.surface !== "object" && !context.textEdit;
  }
  function rectanglesOverlap(left, right) {
    return left.x <= right.x + right.w && right.x <= left.x + left.w && left.y <= right.y + right.h && right.y <= left.y + left.h;
  }
  function collectUnitsIntersectingSelectionRect(rect, units, selection) {
    let result = [...selection];
    for (let value of units)
      value.rect.w === 0 || value.rect.h === 0 || rectanglesOverlap(rect, value.rect) && (result.some((input) => (0, runtime2.selectionsEqual)(input, value.unit)) || (result = result.filter((input) => input.frameId !== value.unit.frameId || !pathsOverlap((0, runtime2.selectionNodePath)(input), (0, runtime2.selectionNodePath)(value.unit))), result.push(value.unit)));
    return result;
  }
  function pathsOverlap(leftPath, rightPath) {
    return isStrictPathAncestor(leftPath, rightPath) || isStrictPathAncestor(rightPath, leftPath);
  }
  function getFrameTransformScreenRect(slide, frameId, element) {
    return (((0, runtime2.nodeTransform)((0, runtime2.frameById)(slide, frameId)?.node) !== void 0 ? element.querySelector('[data-node-path=""]') : null) ?? element).getBoundingClientRect();
  }
  function resolveSelectionDragHit(context) {
    let { selection, selRects: selectionRects, unit, toggle, x, y } = context;
    if (toggle || selection.length === 0 || unit !== null && (0, runtime2.selectionContainsNode)(selection, unit) || !selectionRects.some((input) => input !== null && (0, runtime2.pointInRotatedRect)(input, x, y)))
      return null;
    let value = selection[selection.length - 1];
    return value === void 0 ? null : {
      unit: value,
      clickSelect: unit === null ? [] : [unit]
    };
  }
  function preservePinchAnchorCoordinate(start, anchor, previousScale, nextScale) {
    return anchor - (anchor - start) / previousScale * nextScale;
  }
  function parseEditorNodePath(path) {
    return (path ?? "").split(".").filter((input) => input !== "").map(Number).filter((input) => Number.isInteger(input) && input >= 0);
  }
  function removeNodeFromFrame(frame, path) {
    if (path.length === 0)
      return frame;
    let parentPath = path.slice(0, -1), childIndex = path[path.length - 1];
    return {
      ...frame,
      node: (0, runtime2.updateNodeAtPath)(frame.node, parentPath, (input) => (0, runtime2.isOverlayNode)(input) ? childIndex === 0 ? input : (0, runtime2.removeOverlayLayer)(input, childIndex - 1) : (0, runtime2.isFlowContainer)(input) ? {
        ...input,
        children: input.children.filter((input2, options) => options !== childIndex)
      } : input)
    };
  }
  function ceilMeasuredNodeSize(size4) {
    return Math.max(1, Math.ceil(size4 - 78125e-7));
  }
  function createFreeFrameFromNode(node, rect) {
    let x = {
      anchor: "leading",
      margin: Math.round(rect.x),
      offset: 0,
      size: ceilMeasuredNodeSize(rect.w)
    }, y = {
      anchor: "leading",
      margin: Math.round(rect.y),
      offset: 0
    }, freeNode = node;
    if (node.kind !== "text" && node.kind !== "table" && (y.size = ceilMeasuredNodeSize(rect.h), (node.kind === "img" || node.kind === "icon" || node.kind === "shape") && (node.w !== void 0 || node.h !== void 0))) {
      let state = {
        ...node
      };
      delete state.w, delete state.h, freeNode = state;
    }
    if (freeNode.place !== void 0) {
      let state = {
        ...freeNode
      };
      delete state.place, freeNode = state;
    }
    return {
      id: (0, runtime2.createModelId)(),
      x,
      y,
      node: freeNode
    };
  }
  function fillMissingFrameSizes(frame, rect) {
    let fillAxisSize = (input, options) => input.anchor === "fill" || input.size !== void 0 ? input : {
      ...input,
      size: ceilMeasuredNodeSize(options)
    };
    return {
      ...frame,
      x: fillAxisSize(frame.x, rect.w),
      y: fillAxisSize(frame.y, rect.h)
    };
  }
  function setNodeMinimumPlacementSize(node, rect) {
    let { minWFit: previousMinimumWidthFit, ...placement } = node.place ?? {};
    return {
      ...node,
      place: {
        ...placement,
        minW: Math.round(rect.w),
        minH: Math.round(rect.h)
      }
    };
  }
  function findChangedFrameIds(before, after) {
    return new Set(after.frames.filter((input) => (0, runtime2.frameById)(before, input.id)?.node !== input.node).map((input) => input.id));
  }
  function findSurvivingNodePath(before, after, path) {
    let node = (0, runtime2.nodeAtPath)(before, path);
    if (node !== void 0)
      return [
        [...path],
        ...path.map((input, options) => [
          ...path.slice(0, options),
          ...path.slice(options + 1)
        ])
      ].find((input) => (0, runtime2.nodeAtPath)(after, input) === node);
  }
  function removeNodeAndEmptyAncestors(frame, path, removedPaths) {
    let result = removeNodeFromFrame(frame, path);
    for (let value = path.slice(0, -1); value.length > 0; value = value.slice(0, -1)) {
      let value2 = (0, runtime2.nodeAtPath)(result.node, value);
      if (value2 === void 0 || !isEmptyUnstyledFlowContainer(value2))
        break;
      result = removeNodeFromFrame(result, value), removedPaths?.push([...value]);
    }
    return result;
  }
  function extractFlowDragSelection(slide, extraction) {
    let frame = (0, runtime2.frameById)(slide, extraction.frameId), children = frame ? (0, runtime2.nodeChildren)(frame.node) : void 0;
    if (!frame || children === void 0)
      return null;
    let keptFrame = extraction.keep ? (0, runtime2.styleHasVisiblePaint)(frame.node.style) ? fillMissingFrameSizes(frame, extraction.keep) : frame : null, value = extraction.keep === void 0 ? {
      root: (0, runtime2.isPrimaryLayoutFrame)(slide, frame) && (0, runtime2.nodeTransform)(frame.node) === void 0,
      tag: (0, runtime2.createModelId)(),
      taken: new Set(slide.frames.map((input) => input.id))
    } : null, callback = (input, options) => {
      let value7 = value !== null ? (0, runtime2.encodePromotedFrameId)(extraction.frameId, value.root, options, value.tag) : null;
      return value7 === null || value.taken.has(value7) ? input : (value.taken.add(value7), {
        ...input,
        id: value7
      });
    }, value2 = keptFrame ? [] : extraction.children.map((input, options) => {
      let value7 = children[options];
      return !value7 || value7.kind === "spacer" ? null : callback(createFreeFrameFromNode(value7, input.rect), [
        options
      ]);
    }), value3 = !keptFrame && extraction.dragIndex !== void 0 ? value2[extraction.dragIndex] ?? void 0 : void 0;
    if (!keptFrame && extraction.dragIndex !== void 0 && !value3)
      return null;
    let callback2 = (input) => keptFrame !== null ? {
      get: () => keptFrame,
      set: (input2) => keptFrame = input2,
      rel: [...input]
    } : {
      get: () => value2[input[0]] ?? null,
      set: (input2) => value2[input[0]] = input2,
      rel: input.slice(1)
    }, items = [], items2 = [], values = /* @__PURE__ */ new Set(), callback3 = (input) => extraction.deep.map((input2) => input2.path).filter((input2) => isStrictPathAncestor(input2, input)).sort((items3, items4) => items3.length - items4.length)[0], value4 = extraction.deep.filter((input) => callback3(input.path) === void 0), value5 = extraction.dragPath !== void 0 ? callback3(extraction.dragPath) ?? extraction.dragPath : void 0;
    for (let value7 of [...value4].sort((input, options) => (0, runtime2.compareNodePaths)(options.path, input.path))) {
      let value8 = callback2(value7.path), entry = value8.get(), value9 = entry && value8.rel.length > 0 ? (0, runtime2.nodeAtPath)(entry.node, value8.rel) : void 0;
      if (!entry || !value9 || value9.kind === "spacer")
        continue;
      let items3 = [], value10 = removeNodeAndEmptyAncestors(entry, value8.rel, items3);
      if ((0, runtime2.nodeAtPath)(value10.node, value8.rel) !== value9) {
        value8.set(value10);
        for (let value11 of items3)
          items2.push(keptFrame ? value11 : [value7.path[0], ...value11]);
        values.add(keptFrame ? -1 : value7.path[0]), items.push({
          frame: callback(createFreeFrameFromNode(value9, value7.rect), value7.path),
          path: value7.path
        });
      }
    }
    if (value5 !== void 0 && (value3 = items.find((input) => (0, runtime2.nodePathsEqual)(input.path, value5))?.frame, !value3))
      return null;
    for (let value7 of extraction.pins ?? []) {
      let value8 = callback2(value7.path), entry = value8.get(), value9 = entry && value8.rel.length > 0 ? (0, runtime2.nodeAtPath)(entry.node, value8.rel.slice(0, -1)) : void 0;
      !entry || !value9 || !(0, runtime2.isFlowContainer)(value9) || value8.set({
        ...entry,
        node: (0, runtime2.updateNodeAtPath)(entry.node, value8.rel, (input) => (0, runtime2.isFlowContainer)(input) ? setNodeMinimumPlacementSize(input, value7) : (0, runtime2.isOverlayNode)(input) ? (0, runtime2.isFlowContainer)(input.base) && input.base.place !== void 0 ? {
          ...input,
          base: setNodeMinimumPlacementSize(input.base, value7)
        } : setNodeMinimumPlacementSize(input, value7) : input)
      });
    }
    for (let value7 of values)
      value7 >= 0 && value2[value7] && isEmptyUnstyledFlowContainer(value2[value7].node) && (value2[value7] = null);
    keptFrame && isEmptyUnstyledFlowContainer(keptFrame.node) && (keptFrame = null), items.sort((input, options) => (0, runtime2.compareNodePaths)(input.path, options.path));
    let value6 = keptFrame ? slide.frames.map((input) => input.id === extraction.frameId ? keptFrame : input) : slide.frames.filter((input) => input.id !== extraction.frameId).concat(value2.filter((input) => input !== null));
    return {
      slide: {
        ...slide,
        frames: value6.concat(items.map((input) => input.frame))
      },
      newFrames: value2,
      plucked: items,
      pruned: items2,
      drag: value3
    };
  }
  function collectFlowDragChildPaths(drag2, paths) {
    let selectedNodes = [
      ...drag2.selectedChildren.filter((input) => input !== drag2.dragIndex || drag2.dragPath !== void 0).map((input) => ({
        path: [input],
        rect: drag2.children[input].rect
      })),
      ...drag2.deep,
      ...drag2.dragIndex !== void 0 && drag2.dragPath === void 0 ? [
        {
          path: [drag2.dragIndex],
          rect: drag2.children[drag2.dragIndex].rect
        }
      ] : []
    ], value = drag2.dragPath ?? (drag2.dragIndex !== void 0 ? [drag2.dragIndex] : void 0), { dragIndex, ...value2 } = drag2;
    return {
      ...value2,
      selectedChildren: [],
      deep: selectedNodes,
      keep: paths,
      ...value ? {
        dragPath: value
      } : {}
    };
  }
  function normalizeFlowDragExtraction(drag2, frame, flow, paths) {
    return (0, runtime2.isFlowContainer)(frame.node) && ((0, runtime2.styleHasVisiblePaint)(frame.node.style) || !flow && !(0, runtime2.nodeTransform)(frame.node)) ? collectFlowDragChildPaths(drag2, paths) : drag2;
  }
  function createFlowChildIndexRemapper(extraction, children) {
    let remainingIndices = extraction.kids.map((input, options) => options).filter((input) => !extraction.gone.has(input) && !children.includes(extraction.kids[input])), insertedChildren = children.filter((input) => !extraction.kids.includes(input));
    return (input) => {
      let value = children[input];
      if (value === void 0)
        return null;
      let value2 = extraction.kids.indexOf(value);
      return value2 < 0 && remainingIndices.length === insertedChildren.length && (value2 = remainingIndices[insertedChildren.indexOf(value)] ?? -1), value2 >= 0 ? extraction.rects[value2] ?? null : null;
    };
  }
  function collapseSingleChildFlowFrame(slide, frameId, measure) {
    let frame = (0, runtime2.frameById)(slide, frameId);
    if (!frame || !(0, runtime2.isFlowContainer)(frame.node) || (0, runtime2.styleHasVisiblePaint)(frame.node.style) || (0, runtime2.nodeTransform)(frame.node))
      return {
        slide
      };
    let remainingChildren = frame.node.children.flatMap((source, options) => source.kind === "spacer" ? [] : [
      {
        c: source,
        i: options
      }
    ]);
    if (remainingChildren.length >= 2)
      return {
        slide
      };
    if (remainingChildren.length === 0)
      return {
        slide: {
          ...slide,
          frames: slide.frames.filter((input) => input.id !== frameId)
        }
      };
    let value = measure(remainingChildren[0].i);
    if (!value)
      return {
        slide
      };
    let c = remainingChildren[0].c, value2 = (0, runtime2.isFlowContainer)(c) ? removeFrameAxisSizes(createFreeFrameFromNode(c, value), ["y"]) : createFreeFrameFromNode(c, value);
    return {
      slide: {
        ...slide,
        frames: slide.frames.map((input) => input.id === frameId ? value2 : input)
      },
      minted: value2,
      from: remainingChildren[0].i
    };
  }
  function reparentExtractedFlowNode(before, after, dragPath, extracted, removedPaths = []) {
    let items = [
      ...extracted.map((input) => input.path),
      ...removedPaths
    ], value = items.filter((input) => !items.some((input2) => isStrictPathAncestor(input2, input))), value2 = removedPaths.filter((input) => isStrictPathAncestor(input, dragPath)).sort((items2, items3) => items2.length - items3.length)[0] ?? dragPath;
    if (value2.length === 0)
      return null;
    let value3 = value2.slice(0, -1), value4 = value2[value2.length - 1], value5 = (0, runtime2.nodeAtPath)(before, value3);
    if (!value5 || !(0, runtime2.isFlowContainer)(value5))
      return null;
    let callback = (items2) => value.filter((items3) => items3.length === items2.length + 1 && (0, runtime2.nodePathsEqual)(items3.slice(0, -1), items2)).map((input) => input[items2.length]), value6 = value3.map((input, options) => input - callback(value3.slice(0, options)).filter((input2) => input2 < input).length), values = new Set(callback(value3)), value7 = (0, runtime2.nodeAtPath)(after, value6);
    return !value7 || !(0, runtime2.isFlowContainer)(value7) || value7.kind !== value5.kind ? null : {
      path: value6,
      index: value4 - [...values].filter((input) => input < value4).length,
      stay: value5.children.map((input, options) => options).filter((input) => !values.has(input)),
      before: value3,
      had: value5.children.length
    };
  }
  function getRemainingFlowChildRects(drag2) {
    let deepChildren = new Set(drag2.deep.filter((input) => input.path.length === 1).map((input) => input.path[0])), remainingRects = drag2.children.filter((input, options) => (options !== drag2.dragIndex || drag2.dragPath !== void 0) && !drag2.selectedChildren.includes(options) && !deepChildren.has(options)).map((input) => input.rect);
    return drag2.keep ? [drag2.keep, ...remainingRects] : remainingRects;
  }
  function removeFrameAxisSizes(frame, axes) {
    let result = frame;
    for (let value of axes) {
      if (result[value].anchor === "fill" || result[value].size === void 0)
        continue;
      let { size: value2, ...value3 } = result[value];
      result = {
        ...result,
        [value]: value3
      };
    }
    return result;
  }
  function removeFlowNodePlacement(frame, rect) {
    let axisSize = (input, options) => input.anchor === "fill" ? options - 2 * input.margin : input.size, node = frame.node;
    if (node.place !== void 0) {
      let state2 = {
        ...node
      };
      delete state2.place, node = state2;
    }
    if (node.kind !== "img" && node.kind !== "icon" && node.kind !== "shape") {
      let value3 = axisSize(frame.x, runtime2.SLIDE_WIDTH);
      return rect?.kind === "stack" && rect.dir === "h" && value3 !== void 0 ? {
        ...node,
        place: {
          minW: Math.round(value3),
          maxW: Math.round(value3)
        }
      } : node;
    }
    let state = {
      ...node
    };
    delete state.w, delete state.h;
    let value = axisSize(frame.x, runtime2.SLIDE_WIDTH), value2 = axisSize(frame.y, runtime2.SLIDE_HEIGHT);
    return value !== void 0 && (state.w = Math.round(value)), value2 !== void 0 && (state.h = Math.round(value2)), state;
  }
  function calculateNestedOverlayDepth(node, path) {
    let currentNode = node, depth = 0;
    for (let value of path) {
      if (currentNode === void 0)
        return depth;
      (0, runtime2.isOverlayNode)(currentNode) ? (depth = value === 0 ? (0, runtime2.overlayBaseDepth)(currentNode, depth) : depth + 1, currentNode = value === 0 ? currentNode.base : currentNode.layers[value - 1]?.node) : (depth += 1, currentNode = (0, runtime2.nodeChildren)(currentNode)?.[value]);
    }
    return depth;
  }
  function insertFramesIntoFlowContainer(slide, frameIds, target, measure) {
    let value = (0, runtime2.frameById)(slide, target.frameId), value2 = value ? (0, runtime2.nodeAtPath)(value.node, target.path) : void 0, value3 = frameIds.map((input) => (0, runtime2.frameById)(slide, input));
    if (!value || !value2 || !(0, runtime2.isFlowContainer)(value2) || frameIds.includes(value.id))
      return null;
    let callback = (input) => input !== void 0 && input.node.kind !== "html" && !(0, runtime2.isEmptyGroupBase)(input.node) && (!(0, runtime2.isConnectorNode)(input.node) || measure?.has(input.id) === !0);
    if (!value3.every(callback) || value2.children.length + value3.length > runtime2.maxSlideFrames)
      return null;
    let value4 = calculateNestedOverlayDepth(value.node, target.path) + 1, value5 = value3.map((input) => measure?.get(input.id) ?? removeFlowNodePlacement(input, value2));
    if (!value5.every((input) => (0, runtime2.nodeTreeWithinDepthLimit)(input, value4)))
      return null;
    let value6 = Math.max(0, Math.min(target.index, value2.children.length)), items = [...value2.children];
    items.splice(value6, 0, ...value5);
    let value7 = removeFrameAxisSizes({
      ...value,
      node: (0, runtime2.updateNodeAtPath)(value.node, target.path, (input) => (0, runtime2.isFlowContainer)(input) ? {
        ...input,
        children: items
      } : input)
    }, target.release ?? []);
    return {
      ...slide,
      frames: slide.frames.filter((input) => !frameIds.includes(input.id)).map((input) => input.id === value.id ? value7 : input)
    };
  }
  function setFlowInsertionSize(slide, unit, size4, axis) {
    let value = (0, runtime2.frameById)(slide, unit.frameId), value2 = value ? (0, runtime2.nodeAtPath)(value.node, unit.path) : void 0;
    if (!value || !value2 || !(0, runtime2.isFlowContainer)(value2))
      return slide;
    let value3 = Math.max(1, Math.round(size4)), value4 = value2.kind === "stack" && value2.dir === "h" ? {
      minW: value3,
      maxW: value3,
      shrink: 0
    } : {
      minH: value3,
      shrink: 0
    }, value5 = axis !== void 0 && canInsertNodeIntoFlow(axis) ? {
      kind: "spacer",
      ghost: axis
    } : {
      kind: "spacer",
      place: value4
    }, items = [...value2.children];
    items.splice(Math.min(unit.index, items.length), 0, value5);
    let state = {
      ...value,
      node: (0, runtime2.updateNodeAtPath)(value.node, unit.path, (input) => (0, runtime2.isFlowContainer)(input) ? {
        ...input,
        children: items
      } : input)
    };
    return (0, runtime2.updateSlideFrame)(slide, value.id, () => removeFrameAxisSizes(state, unit.release ?? []));
  }
  function findFlowInsertionIndex(node, rects, x, y) {
    if (rects.length === 0)
      return 0;
    if (node.kind === "grid" || node.wrap) {
      let index4 = 0, value3 = 1 / 0;
      rects.forEach((input, options) => {
        let value5 = (x - (input.x + input.w / 2)) ** 2 + (y - (input.y + input.h / 2)) ** 2;
        value5 < value3 && (value3 = value5, index4 = options);
      });
      let value4 = rects[index4];
      return y < value4.y || y <= value4.y + value4.h && x < value4.x + value4.w / 2 ? index4 : index4 + 1;
    }
    let value = node.dir === "h", value2 = rects.findIndex((input) => value ? x < input.x + input.w / 2 : y < input.y + input.h / 2);
    return value2 < 0 ? rects.length : value2;
  }
  function calculateFlowInsertionGuide(node, rects, index4, gap) {
    let value = rects[index4 - 1], value2 = node.kind !== "grid" && node.dir === "h" && value && rects[index4] && rects[index4].y >= value.y + value.h ? void 0 : rects[index4];
    if (!value && !value2)
      return null;
    let value3 = node.kind === "grid" || node.dir === "h" ? "x" : "y", [items, items2] = [value ?? value2, value2 ?? value];
    if (value3 === "x") {
      let value6 = value && value2 ? (value.x + value.w + value2.x) / 2 : value ? value.x + value.w + gap : value2.x - gap, value7 = Math.min(items.y, items2.y);
      return {
        x: value6 - gap / 2,
        y: value7,
        w: gap,
        h: Math.max(items.y + items.h, items2.y + items2.h) - value7
      };
    }
    let value4 = value && value2 ? (value.y + value.h + value2.y) / 2 : value ? value.y + value.h + gap : value2.y - gap, value5 = Math.min(items.x, items2.x);
    return {
      x: value5,
      y: value4 - gap / 2,
      w: Math.max(items.x + items.w, items2.x + items2.w) - value5,
      h: gap
    };
  }
  function shouldExtractOversizedNode(dragRect, containerRect, forced) {
    return forced ? !0 : dragRect.w <= containerRect.w && dragRect.h <= containerRect.h ? !1 : dragRect.w * dragRect.h >= 1.1 * containerRect.w * containerRect.h;
  }
  function canFitHorizontalFlowInsertion(node, containerWidth, children, dragWidth) {
    if (node.kind !== "stack" || node.dir !== "h" || node.wrap === !0)
      return !0;
    let callback = (input) => input?.kind === "spacer" && !((input.place?.basis ?? 0) > 0) && !((input.place?.minW ?? 0) > 0), value = children.reduce((input, options) => input + (callback(options.node) ? 0 : options.w), 0) + node.gap * children.length;
    return dragWidth <= containerWidth - value + 2;
  }
  function pairFlowRectsWithRemainingNodes(rects, nodes, removedIndex) {
    return rects.flatMap((input, options) => options === removedIndex ? [] : [
      {
        w: input.w,
        node: nodes[removedIndex >= 0 && options > removedIndex ? options - 1 : options]
      }
    ]);
  }
  function flowInsertionTargetMatches(target, frameId, path, dragNodes, selectedKeys) {
    return target === null || target.frameId !== frameId || !(0, runtime2.nodePathsEqual)(target.path, path) ? !1 : target.had === target.rests.length + dragNodes.length && dragNodes.every((input) => selectedKeys.has(input));
  }
  function collectCollapsibleFlowAncestors(node, path, minimumDepth) {
    let ancestors = [], items = [...path], value = minimumDepth;
    for (; items.length > minimumDepth; ) {
      let value2 = items.slice(0, -1), value3 = (0, runtime2.nodeAtPath)(node, value2);
      if (!value3 || !(0, runtime2.isFlowContainer)(value3))
        break;
      let value4 = items[items.length - 1], children = value3.children, callback = (source) => source.kind === "spacer" || (source.place?.grow ?? 0) > 0, value5 = value3.kind === "grid" || value3.justify !== void 0 && value3.justify !== "start", value6 = children.findIndex((input, options) => options < value4 && callback(input)), value7 = children.flatMap((source, options) => options !== value4 && source.kind !== "spacer" && (value5 || options > value4 || value6 >= 0 && options > value6 || callback(source)) ? [options] : []);
      for (let value9 of value7)
        ancestors.push([...value2, value9]);
      let value8 = children.some((source, options) => options !== value4 && source.kind !== "spacer" && !value7.includes(options));
      if (value = value2.length, value8 || (0, runtime2.styleHasVisiblePaint)(value3.style) || value2.length <= minimumDepth)
        break;
      items = value2;
    }
    let items2 = [];
    for (let value2 = minimumDepth + 1; value2 <= value && value2 < path.length; value2++)
      items2.push(path.slice(0, value2));
    return {
      lift: ancestors,
      pin: items2
    };
  }
  function flowRectsAligned(left, right, xHandle, yHandle, tolerance = 1) {
    let callback = (input, options, context, value, extra) => extra === null || Math.abs(extra === "near" ? context + value - (input + options) : context - input) <= tolerance;
    return callback(left.x, left.w, right.x, right.w, xHandle) && callback(left.y, left.h, right.y, right.h, yHandle);
  }
  function isStrictPathAncestor(ancestor, descendant) {
    return ancestor.length < descendant.length && ancestor.every((input, options) => input === descendant[options]);
  }
  function duplicateFrameWithFixedFillPlacement(frame) {
    let normalizeAxis = (input, options, context) => input.anchor !== "fill" ? input : {
      anchor: "leading",
      margin: input.margin,
      offset: 0,
      ...context ? {} : {
        size: Math.max(1, options - 2 * input.margin)
      }
    };
    return {
      ...frame,
      id: (0, runtime2.createModelId)(),
      x: normalizeAxis(frame.x, runtime2.SLIDE_WIDTH, !1),
      y: normalizeAxis(frame.y, runtime2.SLIDE_HEIGHT, frame.node.kind === "text" || frame.node.kind === "table")
    };
  }
  function deleteSelectedUnits(slide, selection, options) {
    let callback = (input, options2) => input.child === void 0 || input.child === 0 && input.path === void 0 && (0, runtime2.isOverlayNode)(options2.node), values = new Set(selection.filter((input) => {
      let value = (0, runtime2.frameById)(slide, input.frameId);
      return value !== void 0 && callback(input, value);
    }).map((input) => input.frameId)), callback2 = (input) => values.has(input.frameId) || selection.some((input2) => input2.frameId === input.frameId && isStrictPathAncestor((0, runtime2.selectionNodePath)(input2), (0, runtime2.selectionNodePath)(input))), values2 = /* @__PURE__ */ new Set(), items = [];
    for (let value of (0, runtime2.sortSelectionsInDocumentOrder)(slide, selection)) {
      let value2 = (0, runtime2.frameById)(slide, value.frameId), value3 = (0, runtime2.selectedNode)(slide, value);
      if (!value2 || !value3 || value3.kind === "spacer")
        continue;
      if (callback(value, value2)) {
        if (values2.has(value2.id))
          continue;
        values2.add(value2.id), items.push({
          unit: value,
          copy: duplicateFrameWithFixedFillPlacement(value2)
        });
        continue;
      }
      if (callback2(value))
        continue;
      let value4 = options(value);
      value4 && items.push({
        unit: value,
        copy: createFreeFrameFromNode(value3, value4),
        rect: value4
      });
    }
    return items;
  }
  function rotatedRectBounds(rect) {
    if (rect === null || !(rect.w > 0) || !(rect.h > 0))
      return null;
    let rotatedBounds = (0, runtime2.rotatedRectBounds_Rn)(rect);
    return {
      l: rotatedBounds.x,
      t: rotatedBounds.y,
      r: rotatedBounds.x + rotatedBounds.w,
      b: rotatedBounds.y + rotatedBounds.h
    };
  }
  function selectionBoundsForUnits(units, rects, slide, measure) {
    let bounds = null, firstUnit;
    for (let index4 = 0; index4 < units.length; index4++) {
      let value2 = rotatedRectBounds(rects[index4] ?? null);
      value2 !== null && (firstUnit ??= units[index4], bounds = bounds === null ? value2 : {
        l: Math.min(bounds.l, value2.l),
        t: Math.min(bounds.t, value2.t),
        r: Math.max(bounds.r, value2.r),
        b: Math.max(bounds.b, value2.b)
      });
    }
    if (bounds === null || firstUnit === void 0)
      return null;
    let value = slide !== null && !(0, runtime2.selectionContainsNode)(units, slide) ? rotatedRectBounds(measure(slide)) : null;
    for (let value2 = value === null ? (0, runtime2.parentNodeSelection)(firstUnit) : void 0; value2 !== void 0 && value === null; value2 = (0, runtime2.parentNodeSelection)(value2))
      value = rotatedRectBounds(measure(value2));
    return {
      a: bounds,
      b: value ?? {
        l: 0,
        t: 0,
        r: runtime2.SLIDE_WIDTH,
        b: runtime2.SLIDE_HEIGHT
      }
    };
  }
  function getSelectedTextStyle(slide, unit) {
    let frame = (0, runtime2.frameById)(slide, unit.frameId), node = frame ? (0, runtime2.nodeAtPath)(frame.node, unit.path) : void 0, cell = unit.cell;
    return cell ? (0, runtime2.isTableNode)(node) && (0, runtime2.tableCellExists)(node, cell.r, cell.c) : (0, runtime2.isEditableTextNode)(node);
  }
  function SlideCanvasEditor({ slide, lookPreview, slideNumber, slideName, busy, designColors, slideColors, assets, faces, facesFull, fonts, typeStyles, deckTypeStyles, onReplaceImage, pickImage, pending = [], covered, peerLayer, onPointerNorm, selection, onSelectionChange, onLiveChange, onGestureEnd, onMenu, dragLiveRef, textEdit, onTextEdit, onDropImage, onDropInsert, onCropStart, returnTakenHint, deckCellCount, withinStyleBudget, onOpenInspector, moreMenu, onDeleteSelection, selectionMenuHidden = !1, onChangeSlide, presenting, commenting = !1, commentStop = !0, zoomApiRef, onScaleChange, onStageMoved, startCamera, onCamera, bottomInset, topInset, sideInset, readOnly = !1, stageOverlay, surround }) {
    let stageRef = runtime2.reactK_.useRef(null), slideSurfaceRef = runtime2.reactK_.useRef(null), pointInsideSlide = runtime2.reactK_.useCallback((input, options) => {
      let value59 = slideSurfaceRef.current?.getBoundingClientRect();
      return value59 !== void 0 && input >= value59.left && input <= value59.right && options >= value59.top && options <= value59.bottom;
    }, []), slideRef = runtime2.reactK_.useRef(slide);
    slideRef.current = slide;
    let selectionRef = runtime2.reactK_.useRef(selection);
    selectionRef.current = selection;
    let readOnlyRef = runtime2.reactK_.useRef(readOnly);
    readOnlyRef.current = readOnly;
    let deleteSelectionRef = runtime2.reactK_.useRef(onDeleteSelection);
    deleteSelectionRef.current = onDeleteSelection;
    let [stageSize, setStageSize] = runtime2.reactK_.useState({
      w: 0,
      h: 0
    }), colorPalette = (0, runtime2.useDeckColorChoices)(designColors, slideColors), [, refreshFontOptions] = runtime2.reactK_.useState(0), [manualViewport, setManualViewport] = runtime2.reactK_.useState(null), frameElementsRef = runtime2.reactK_.useRef(/* @__PURE__ */ new Map()), dragSessionRef = runtime2.reactK_.useRef(null), plainPressRef = runtime2.reactK_.useRef(!0), isPlainPress = runtime2.reactK_.useCallback(() => plainPressRef.current, []), touchPressRef = runtime2.reactK_.useRef(null), longPressTimerRef = runtime2.reactK_.useRef(null), beginFrameDragRef = runtime2.reactK_.useRef(() => {
    }), releasePointerRef = runtime2.reactK_.useRef(() => {
    }), applyTouchLiftRef = runtime2.reactK_.useRef(() => {
    }), clearTouchLiftRef = runtime2.reactK_.useRef(() => {
    }), endViewportGestureRef = runtime2.reactK_.useRef(() => {
    }), touchLiftActiveRef = runtime2.reactK_.useRef(!1), beginPanRef = runtime2.reactK_.useRef(() => {
    }), pendingToggleFrameRef = runtime2.reactK_.useRef(null), pendingPlayClipRef = runtime2.reactK_.useRef(null), lastClipPlayAtRef = runtime2.reactK_.useRef(-1 / 0), videoControlsShownAtRef = runtime2.reactK_.useRef(-1 / 0), togglePendingFrame = () => {
      pendingPlayClipRef.current !== null ? lastClipPlayAtRef.current = performance.now() : pendingToggleFrameRef.current !== null && performance.now() - lastClipPlayAtRef.current > 0, pendingToggleFrameRef.current = pendingPlayClipRef.current = null;
    }, [selectionRects, setSelectionRects] = runtime2.reactK_.useState([]), [measuredSelectionKey, setMeasuredSelectionKey] = runtime2.reactK_.useState(""), [unitRectCache, setUnitRectCache] = runtime2.reactK_.useState(() => /* @__PURE__ */ new Map()), [snapGuides, setSnapGuides] = runtime2.reactK_.useState([]), [flowDropPreview, setFlowDropPreview] = runtime2.reactK_.useState(null), [dragPreviewSlide, setDragPreviewSlide] = runtime2.reactK_.useState(null), imageCropController = (0, runtime2.useMediaCropSession)({
      slide,
      selection,
      assets,
      editable: !readOnly,
      busy: textEdit !== null || presenting === !0,
      frameEl: (input) => frameElementsRef.current.get(input),
      root: () => slideSurfaceRef.current,
      onCommit: onChangeSlide
    }), selectionKey2 = (0, runtime2.selectionsKey)(selection);
    runtime2.reactK_.useLayoutEffect(() => {
      let element = document.querySelector("[data-slides-strip]");
      element !== null && ((0, runtime2.toolbarScrollableRow)(element).scrollLeft = 0);
    }, [selectionKey2]);
    let resolvedTypeStyles = typeStyles ?? runtime2.emptyTypographyStyles, resolvedDeckTypeStyles = deckTypeStyles ?? runtime2.emptyTypographyStyles, allTypeStyles = runtime2.reactK_.useMemo(() => resolvedTypeStyles === resolvedDeckTypeStyles ? resolvedTypeStyles : [...resolvedTypeStyles, ...resolvedDeckTypeStyles], [resolvedTypeStyles, resolvedDeckTypeStyles]), typeStyleOptions = runtime2.reactK_.useMemo(() => typeStylesToEditorOptions(resolvedTypeStyles), [resolvedTypeStyles]), lastSelectedUnit = selection.length > 0 ? selection[selection.length - 1] : void 0, lastSelectedUnitKey = lastSelectedUnit !== void 0 ? (0, runtime2.selectionKey)(lastSelectedUnit) : null, selectedUnitKeys = runtime2.reactK_.useMemo(() => new Set(selection.map(runtime2.selectionKey)), [selectionKey2]), keyboardTree = runtime2.reactK_.useMemo(() => (0, runtime2.slideNavigationTree)(slide), [slide]), keyboardTargets = runtime2.reactK_.useMemo(() => (0, runtime2.visibleNavigationTree)(keyboardTree, slide, lastSelectedUnit), [keyboardTree, lastSelectedUnitKey]), keyboardStopOrderRef = runtime2.reactK_.useRef({
      slide: "",
      seq: /* @__PURE__ */ new Map()
    }), [keyboardOrderGeneration, refreshKeyboardOrder] = runtime2.reactK_.useState(0), keyboardGroups = runtime2.reactK_.useMemo(() => {
      let current = keyboardStopOrderRef.current;
      current.slide !== slide.id && (current.slide = slide.id, current.seq = /* @__PURE__ */ new Map());
      for (let value59 of keyboardTargets)
        current.seq.has(value59.key) || current.seq.set(value59.key, current.seq.size);
      let callback77 = (input) => current.seq.get(input.key) ?? 0, entries = /* @__PURE__ */ new Map();
      for (let value59 of keyboardTargets) {
        let value60 = value59.stop ? value59.parentKey ?? "" : "*", entry = entries.get(value60);
        entry === void 0 ? entries.set(value60, [value59]) : entry.push(value59);
      }
      return [...entries].map(([input, input2]) => ({
        id: input,
        tree: input2,
        stops: [...input2].sort((input3, options) => callback77(input3) - callback77(options))
      }));
    }, [keyboardTargets, slide.id, keyboardOrderGeneration]), slideNavigationUnits = runtime2.reactK_.useMemo(() => (0, runtime2.slideNavigationSelections)(slide), [slide]), slideKeyboardInstructions = returnTakenHint ?? (slideNavigationUnits.length === 0 ? "This slide has no objects." : "Press Enter to go into the slide. Inside, Tab and Shift+Tab move between its objects, Shift+Enter goes up a level, and Escape comes back here."), singleTransformTarget = resolveSingleUnitTransformTarget(slide, selection), singleStyleTarget = readOnly ? null : resolveSingleUnitStyleTarget(slide, selection), lastSelectedRect = selection.length > 0 ? selectionRects[selection.length - 1] ?? null : null, [measurementGeneration, refreshMeasurements] = runtime2.reactK_.useState(0), [rotationPreviewAngle, setRotationPreviewAngle] = runtime2.reactK_.useState(null), [endpointSnapPoint, setEndpointSnapPoint] = runtime2.reactK_.useState(null), [altPressed, setAltPressed] = runtime2.reactK_.useState(!1), altPressedRef = runtime2.reactK_.useRef(!1);
    altPressedRef.current = altPressed;
    let lastPointerTargetRef = runtime2.reactK_.useRef(null), lastPointerSlideRef = runtime2.reactK_.useRef(null), [distanceHoverTarget, setDistanceHoverTarget] = runtime2.reactK_.useState(null), [hoverTarget, setHoverTarget] = runtime2.reactK_.useState(null), [hoverRect, setHoverRect] = runtime2.reactK_.useState(null), [textEditRect, setTextEditRect] = runtime2.reactK_.useState(null), [distanceMeasurements, setDistanceMeasurements] = runtime2.reactK_.useState(null);
    runtime2.reactK_.useLayoutEffect(() => {
      let current = stageRef.current;
      if (!current)
        return;
      let callback77 = () => setStageSize({
        w: current.clientWidth,
        h: current.clientHeight
      });
      callback77();
      let observer = new ResizeObserver(callback77);
      return observer.observe(current), () => observer.disconnect();
    }, []);
    let usableViewport = {
      w: stageSize.w,
      h: Math.max(0, stageSize.h - (topInset ?? 0) - (bottomInset ?? 0)),
      top: topInset ?? 0,
      sidePad: sideInset || EDITOR_VIEWPORT_PADDING / 2
    }, fittedViewport = fitSlideEditorViewport(usableViewport), ref = runtime2.reactK_.useRef(null), ref2 = runtime2.reactK_.useRef(-1 / 0), ref3 = runtime2.reactK_.useRef(null), ref4 = runtime2.reactK_.useRef(null), ref5 = runtime2.reactK_.useRef(surround);
    ref5.current = surround;
    let callback = runtime2.reactK_.useCallback((input, options) => ref5.current ? input : clampEditorViewport(input, options), []), value = manualViewport ?? fittedViewport, scale = value.scale, ref6 = runtime2.reactK_.useRef(null);
    manualViewport === null && (ref6.current = value);
    let ref7 = runtime2.reactK_.useRef(!1);
    ref7.current = manualViewport !== null;
    let ref8 = runtime2.reactK_.useRef(value);
    ref8.current = ref6.current ?? value;
    let ref9 = runtime2.reactK_.useRef({
      dx: 0,
      dy: 0
    }), ref10 = runtime2.reactK_.useRef(0), ref11 = runtime2.reactK_.useRef(/* @__PURE__ */ new Map()), ref12 = runtime2.reactK_.useRef(/* @__PURE__ */ new Set()), ref13 = runtime2.reactK_.useRef(/* @__PURE__ */ new Set()), ref14 = runtime2.reactK_.useRef(null), ref15 = runtime2.reactK_.useRef(null), ref16 = runtime2.reactK_.useRef(() => !1), [value2, value3] = runtime2.reactK_.useState(null), startCameraRef = runtime2.reactK_.useRef(startCamera ?? null), restoredCameraRef = runtime2.reactK_.useRef(null);
    runtime2.reactK_.useEffect(() => {
      manualViewport !== restoredCameraRef.current && (startCameraRef.current = null);
    }, [manualViewport]);
    let ref17 = runtime2.reactK_.useRef({
      minScale: 0.01,
      maxScale: 64
    });
    ref17.current.minScale = surround ? Math.min(surround.minScale, fittedViewport.scale) : fittedViewport.scale, ref17.current.maxScale = surround ? surround.maxScale : fittedViewport.scale * 16, runtime2.reactK_.useEffect(() => {
      if (manualViewport === null || ref3.current !== null || ref.current !== null || startCameraRef.current !== null && manualViewport !== restoredCameraRef.current)
        return;
      let current = ref17.current, value59 = Math.min(current.maxScale, Math.max(current.minScale, manualViewport.scale)), value60 = manualViewport;
      value59 !== manualViewport.scale && (value60 = (0, runtime2.zoomViewportAt)(manualViewport, usableViewport.w / 2, usableViewport.top + usableViewport.h / 2, value59 / manualViewport.scale, current)), value60 = callback(value60, {
        w: usableViewport.w,
        h: usableViewport.h,
        top: usableViewport.top
      }), value60 !== manualViewport && (manualViewport === restoredCameraRef.current && (restoredCameraRef.current = value60), ref6.current = value60, setManualViewport(value60));
    }, [
      manualViewport,
      usableViewport.w,
      usableViewport.h,
      usableViewport.top,
      usableViewport.sidePad,
      callback,
      surround?.minScale,
      surround?.maxScale
    ]);
    let value4 = surround?.seat;
    runtime2.reactK_.useLayoutEffect(() => {
      let current = stageRef.current;
      if (!value4 || !current || !(value4.width > 0))
        return;
      let value59 = editorViewportFromScreenRect(value4, current.getBoundingClientRect());
      ref7.current = !0, ref6.current = value59, ref8.current = value59, setManualViewport(value59);
    }, [value4]), runtime2.reactK_.useLayoutEffect(() => {
      let camera = startCameraRef.current;
      if (!(camera === null || !(usableViewport.w > 0))) {
        if (restoredCameraRef.current !== null && ref6.current !== restoredCameraRef.current) {
          startCameraRef.current = null;
          return;
        }
        ref7.current = !0, ref6.current = camera, ref8.current = camera, restoredCameraRef.current = camera, setManualViewport(camera);
      }
    }, [usableViewport.w, usableViewport.h, usableViewport.top]), runtime2.reactK_.useEffect(() => {
      let zoom = ref.current;
      onCamera?.(zoom === null || zoom.kept ? manualViewport : zoom.from);
    }, [manualViewport, onCamera]);
    let value5 = surround?.pick, ref18 = runtime2.reactK_.useRef(onSelectionChange);
    ref18.current = onSelectionChange, runtime2.reactK_.useEffect(() => {
      if (!value5)
        return;
      let value59 = requestAnimationFrame(() => {
        let current = stageRef.current, value60 = current ? document.elementsFromPoint(value5.x, value5.y).find((input) => current.contains(input)) : void 0, value61 = value60?.closest("[data-frame-id]")?.getAttribute("data-frame-id"), value62 = value61 != null ? (0, runtime2.frameById)(slideRef.current, value61) : void 0, value63 = value62 && value60 ? (0, runtime2.resolvePointerSelection)(value62.id, value62.node, parseEditorNodePath(value60.closest("[data-node-path]")?.getAttribute("data-node-path")), [], getFrameHitTestOptions(slideRef.current, value62)).tap : null;
        value63 && ref18.current([value63]);
      });
      return () => cancelAnimationFrame(value59);
    }, [value5]);
    let value6 = surround !== void 0;
    runtime2.reactK_.useLayoutEffect(() => {
      let current = stageRef.current;
      !value6 || manualViewport === null || !current || stageSize.w <= 0 || ref5.current?.onViewChange(value, current.getBoundingClientRect());
    }, [
      value6,
      manualViewport,
      value.x,
      value.y,
      value.scale,
      stageSize.w,
      stageSize.h,
      bottomInset,
      topInset
    ]);
    let stageMovedRef = runtime2.reactK_.useRef(onStageMoved);
    stageMovedRef.current = onStageMoved, runtime2.reactK_.useLayoutEffect(() => {
      stageMovedRef.current?.();
    }, [
      value.x,
      value.y,
      value.scale,
      stageSize.w,
      stageSize.h,
      bottomInset,
      topInset,
      sideInset
    ]);
    let value7 = (0, runtime2.useCoarsePointer)(), value8 = (0, runtime2.useFrameBottomInset)(), value9 = textEdit !== null && value7 && surround === void 0 && Math.min(window.screen.width, window.screen.height) < EDITOR_TEXT_ZOOM_DURATION_MS ? (0, runtime2.selectionKey)((0, runtime2.createNodeSelection)(textEdit.frameId, textEdit.path)) : null, keyboardKeyRef = runtime2.reactK_.useRef(null), textZoomRotated = ref4.current?.key === value9 && ref4.current.w !== stageSize.w;
    textZoomRotated ? keyboardKeyRef.current = null : (value8 > 0 || value9 === null) && (keyboardKeyRef.current = value9);
    let [, setKeyboardTick] = runtime2.reactK_.useState(0);
    runtime2.reactK_.useEffect(() => {
      if (value9 === null || !(0, runtime2.isApplePlatform)())
        return;
      let timer = setTimeout(() => {
        keyboardKeyRef.current = value9, setKeyboardTick((input) => input + 1);
      }, EDITOR_KEYBOARD_ZOOM.ms);
      return () => clearTimeout(timer);
    }, [value9, stageSize.w]);
    let keyboardInset = keyboardKeyRef.current !== value9 && (0, runtime2.isApplePlatform)() ? Math.round(Math.min(EDITOR_KEYBOARD_ZOOM.px, window.innerHeight * EDITOR_KEYBOARD_ZOOM.share)) : value8, value10 = value9 !== null && keyboardInset > 0 ? Math.max(0, (stageRef.current?.getBoundingClientRect().bottom ?? 0) - (bottomInset ?? 0) - (window.innerHeight - keyboardInset)) : 0, state = {
      ...usableViewport,
      h: Math.max(0, usableViewport.h - value10)
    }, ref19 = runtime2.reactK_.useRef(null), ref20 = runtime2.reactK_.useRef(null), value11 = textEdit !== null && textEdit.cell === void 0, [, value12] = runtime2.reactK_.useState(0);
    runtime2.reactK_.useEffect(() => {
      if (!value11)
        return;
      let callback77 = () => {
        let current = ref19.current;
        if (current === null)
          return;
        let value59 = getEditableCaretClientRect() ?? ref20.current;
        (value59?.top !== current.box?.top || value59?.bottom !== current.box?.bottom) && value12((input) => input + 1);
      };
      return document.addEventListener("selectionchange", callback77), () => {
        document.removeEventListener("selectionchange", callback77), ref20.current = null;
      };
    }, [value11]);
    let ref21 = runtime2.reactK_.useRef(null);
    runtime2.reactK_.useEffect(() => {
      ref21.current = null;
    }, [selectionKey2, slide.id]), runtime2.reactK_.useEffect(() => {
      ref15.current = null, value3(null);
    }, [slide.id]);
    let ref22 = runtime2.reactK_.useRef(null), ref23 = runtime2.reactK_.useRef(null), callback2 = runtime2.reactK_.useCallback(() => {
      ref3.current !== null && cancelAnimationFrame(ref3.current.raf), ref3.current = null, ref.current !== null && (ref.current.kept = !0);
    }, []), callback3 = runtime2.reactK_.useCallback(() => {
      if (ref5.current)
        return ref5.current.onFit();
      callback2(), ref6.current = null, setManualViewport(null);
    }, [callback2]), ref24 = runtime2.reactK_.useRef(usableViewport);
    ref24.current = ref.current !== null ? state : usableViewport;
    let callback4 = runtime2.reactK_.useCallback((input) => {
      let current = ref8.current, value59 = callback((0, runtime2.zoomViewportAt)(current, ref24.current.w / 2, ref24.current.top + ref24.current.h / 2, input, ref17.current), ref24.current);
      value59.x === current.x && value59.y === current.y && value59.scale === current.scale || (callback2(), ref6.current = value59, setManualViewport(value59));
    }, [callback, callback2]), callback5 = runtime2.reactK_.useCallback((input) => {
      let current = ref8.current;
      current.scale <= 0 || callback4(input / current.scale);
    }, [callback4]), scale2 = ref8.current.scale, ref25 = runtime2.reactK_.useRef(onScaleChange);
    ref25.current = onScaleChange, runtime2.reactK_.useEffect(() => {
      ref25.current?.(scale2);
    }, [scale2]);
    let ref26 = runtime2.reactK_.useRef(textEdit);
    ref26.current = textEdit;
    let ref27 = runtime2.reactK_.useRef(presenting);
    ref27.current = presenting;
    let callback6 = runtime2.reactK_.useCallback((input) => {
      if (input !== null && dragSessionRef.current !== null)
        return;
      let value59 = null;
      if (input !== null) {
        let value60 = input.closest("[data-frame-id]")?.getAttribute("data-frame-id"), value61 = value60 != null ? (0, runtime2.frameById)(slideRef.current, value60) : void 0, value62 = parseEditorNodePath(input.closest("[data-node-path]")?.getAttribute("data-node-path"));
        value59 = {
          unit: value61 !== void 0 ? (0, runtime2.resolvePointerSelection)(value61.id, value61.node, value62, selectionRef.current, getFrameHitTestOptions(slideRef.current, value61)).tap : null
        };
      }
      setDistanceHoverTarget((input2) => input2 === null || value59 === null ? input2 === value59 ? input2 : value59 : (input2.unit === null || value59.unit === null ? input2.unit === value59.unit : (0, runtime2.selectionsEqual)(input2.unit, value59.unit)) ? input2 : value59);
    }, []), callback7 = runtime2.reactK_.useCallback((input) => {
      let value59 = null;
      if (input !== null && dragSessionRef.current === null && ref26.current === null) {
        let value61 = input.closest("[data-frame-id]")?.getAttribute("data-frame-id"), value62 = value61 != null ? (0, runtime2.frameById)(slideRef.current, value61) : void 0, value63 = parseEditorNodePath(input.closest("[data-node-path]")?.getAttribute("data-node-path"));
        value59 = value62 !== void 0 ? (0, runtime2.resolvePointerSelection)(value62.id, value62.node, value63, selectionRef.current, getFrameHitTestOptions(slideRef.current, value62)).tap : null;
        let value64 = value62 !== void 0 && value59 !== null && (0, runtime2.selectionNodePath)(value59).length === 0 && ((0, runtime2.isPrimaryLayoutFrame)(slideRef.current, value62) || (0, runtime2.isEmptyBackgroundFrame)(value62)), value65 = value59 !== null ? (0, runtime2.selectedNode)(slideRef.current, value59) : void 0;
        (value64 || value65 !== void 0 && ((0, runtime2.isLineShapeNode)(value65) || (0, runtime2.isConnectorNode)(value65))) && (value59 = null);
      }
      let value60 = value59, [items, items2] = [slideRef.current, ref8.current];
      setHoverTarget((input2) => value60 === null ? null : input2 !== null && (0, runtime2.selectionsEqual)(input2.unit, value60) && input2.slide === items && input2.view.x === items2.x && input2.view.y === items2.y && input2.view.scale === items2.scale ? input2 : {
        unit: value60,
        slide: items,
        view: items2
      });
    }, []);
    runtime2.reactK_.useEffect(() => {
      lastPointerSlideRef.current === slideRef.current && callback7(lastPointerTargetRef.current);
    }, [selectionKey2, callback7]), runtime2.reactK_.useEffect(() => {
      let callback77 = (input) => {
        setAltPressed(input), input && callback6(lastPointerTargetRef.current);
      }, callback78 = (input) => {
        input.key === "Alt" && !input.repeat && callback77(input.type === "keydown");
      }, callback79 = () => {
        document.hasFocus() || callback77(!1);
      };
      return window.addEventListener("keydown", callback78, !0), window.addEventListener("keyup", callback78, !0), window.addEventListener("blur", callback79), () => {
        window.removeEventListener("keydown", callback78, !0), window.removeEventListener("keyup", callback78, !0), window.removeEventListener("blur", callback79);
      };
    }, [callback6]), runtime2.reactK_.useEffect(() => {
      let callback77 = (event) => {
        if (event.defaultPrevented || ref27.current === !0 || !(event.metaKey || event.ctrlKey) || event.altKey || event.key !== "0" && event.key !== "=" && event.key !== "+" && event.key !== "-" || ref26.current)
          return;
        let target = event.target;
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || (event.preventDefault(), event.key === "0" ? callback3() : callback4(event.key === "-" ? 0.8 : 1.25));
      };
      return window.addEventListener("keydown", callback77), () => window.removeEventListener("keydown", callback77);
    }, [callback3, callback4]), runtime2.reactK_.useEffect(() => {
      if (selection.length === 0)
        return;
      let callback77 = () => refreshMeasurements((input) => input + 1);
      return window.addEventListener("scroll", callback77, {
        capture: !0,
        passive: !0
      }), window.addEventListener("resize", callback77), () => {
        window.removeEventListener("scroll", callback77, {
          capture: !0
        }), window.removeEventListener("resize", callback77);
      };
    }, [selectionKey2]);
    let callback8 = runtime2.reactK_.useCallback(() => {
      stageRef.current?.focus({
        preventScroll: !0
      });
    }, []), value13 = runtime2.reactK_.useId(), value14 = value13 + "-slide-hint", value15 = value13 + "-object-hint", shownBeforeIdPrefix = value13 + "-object-before-", shownAfterIdPrefix = value13 + "-object-after-", selectedCountPrefix = (key) => key === lastSelectedUnitKey && selection.length > 1 ? String(selection.length) + " objects selected; " : "", value16 = value13 + "-slide-heading", ref28 = runtime2.reactK_.useRef(null), [value17, value18] = runtime2.reactK_.useState(!1), ref29 = runtime2.reactK_.useRef(0), [value19, value20] = runtime2.reactK_.useState(!1);
    runtime2.reactK_.useEffect(() => {
      value17 && value20(!0);
    }, [value17, selectionKey2]);
    let value21 = value17 && value19, [value22, value23] = runtime2.reactK_.useState(!1), ref30 = runtime2.reactK_.useRef(/* @__PURE__ */ new Map()), ref31 = runtime2.reactK_.useRef(/* @__PURE__ */ new Map()), callback9 = runtime2.reactK_.useCallback((input) => {
      let entry = ref31.current.get(input);
      if (entry !== void 0)
        return entry;
      let value59 = null, callback77 = (input2) => {
        if (input2 !== null) {
          value59 = input2, ref30.current.set(input, input2), ref31.current.has(input) || ref31.current.set(input, callback77);
          return;
        }
        ref30.current.get(input) === value59 && ref30.current.delete(input), ref31.current.get(input) === callback77 && ref31.current.delete(input), value59 = null;
      };
      return ref31.current.set(input, callback77), callback77;
    }, []), callback10 = runtime2.reactK_.useCallback(() => {
      let current = selectionRef.current, value59 = current[current.length - 1];
      return value59 === void 0 ? null : ref30.current.get((0, runtime2.selectionKey)(value59)) ?? null;
    }, []), ref32 = runtime2.reactK_.useRef(!1), ref33 = runtime2.reactK_.useRef(!1), callback11 = runtime2.reactK_.useCallback((input, options) => {
      if (!(input == null || input === document.activeElement)) {
        options.current = !0;
        try {
          input.focus({
            preventScroll: !0
          });
        } finally {
          options.current = !1;
        }
      }
    }, []), callback12 = runtime2.reactK_.useCallback(() => {
      ref29.current = 0, slideSurfaceRef.current?.focus({
        preventScroll: !0
      });
    }, []), callback13 = runtime2.reactK_.useCallback((input) => {
      if (input === void 0)
        return !1;
      value18(!0), ref29.current = 0, callback11(ref30.current.get((0, runtime2.selectionKey)(input)), ref32);
      let current = selectionRef.current;
      return current.length === 1 && (0, runtime2.selectionsEqual)(current[0], input) || ref18.current([input]), !0;
    }, []), callback14 = (input) => input !== null && input !== slideSurfaceRef.current && slideSurfaceRef.current?.contains(input) === !0, ref34 = runtime2.reactK_.useRef(null), ref35 = runtime2.reactK_.useRef(!1), ref36 = runtime2.reactK_.useRef(null), ref37 = runtime2.reactK_.useRef(null), ref38 = runtime2.reactK_.useRef(/* @__PURE__ */ new Set()), ref39 = runtime2.reactK_.useRef(slide), [value24, value25] = runtime2.reactK_.useState(() => /* @__PURE__ */ new Map()), ref40 = runtime2.reactK_.useRef(!1), ref41 = runtime2.reactK_.useRef(selectionKey2);
    runtime2.reactK_.useEffect(() => {
      let surface = slideSurfaceRef.current;
      if (surface === null)
        return;
      let onFocusIn = (event) => {
        event.target instanceof Element && (ref28.current = event.target);
      };
      return surface.addEventListener("focusin", onFocusIn), () => surface.removeEventListener("focusin", onFocusIn);
    }, []), runtime2.reactK_.useLayoutEffect(() => {
      let value59 = ref40.current && textEdit === null;
      ref40.current = textEdit !== null;
      let value60 = ref41.current !== selectionKey2;
      ref41.current = selectionKey2;
      let value61 = lastSelectedUnit !== void 0 && lastSelectedUnit.child === void 0 && lastSelectedUnit.frameId === ref37.current;
      if ((value61 || value60) && (ref37.current = null), commenting) {
        let lastFocused = ref28.current;
        !commentStop && document.activeElement === document.body && lastFocused instanceof HTMLElement && lastFocused.hasAttribute("data-object-proxy") && !lastFocused.isConnected && callback11(slideSurfaceRef.current, ref33), ref28.current = null, ref34.current !== null && cancelAnimationFrame(ref34.current), ref34.current = null, ref35.current = !1, ref36.current = null;
        return;
      }
      let activeElement2 = document.activeElement, current = ref28.current, value62 = lastSelectedUnitKey !== null && ref38.current.has(lastSelectedUnitKey), value63 = lastSelectedUnit !== void 0 && lastSelectedUnitKey !== null && (!value62 || (0, runtime2.selectedNode)(ref39.current, lastSelectedUnit) !== (0, runtime2.selectedNode)(slide, lastSelectedUnit));
      if (value60 && document.hasFocus()) {
        let value66 = activeElement2 instanceof HTMLElement && ref42.current?.contains(activeElement2) === !0, value67 = (activeElement2 === null || activeElement2 === document.body) && current instanceof HTMLElement && current.hasAttribute("data-object-proxy") && !current.isConnected;
        value66 && activeElement2.getAttribute("data-object-proxy") !== lastSelectedUnitKey ? value63 ? ref36.current = activeElement2 : callback11(selection.length === 0 ? slideSurfaceRef.current : callback10(), ref33) : value67 ? value63 ? ref36.current = document.body : callback11(selection.length === 0 ? slideSurfaceRef.current : callback10() ?? slideSurfaceRef.current, ref33) : value61 && !value66 && !callback14(activeElement2) && (ref36.current = "outside"), value63 && value62 && ref36.current !== null && value25((input) => new Map(input).set(lastSelectedUnitKey, (input.get(lastSelectedUnitKey) ?? 0) + 1));
      }
      ref38.current = new Set(ref30.current.keys()), ref39.current = slide;
      let activeElement22 = document.activeElement;
      activeElement22 !== null && activeElement22 !== document.body && slideSurfaceRef.current?.contains(activeElement22) !== !0 && ref42.current?.contains(activeElement22) !== !0 && (ref28.current = null);
      let value64 = value59 && selection.length > 0 && (activeElement22 === slideSurfaceRef.current || activeElement22 === stageRef.current), value65 = current !== null && !current.isConnected && (activeElement22 === null || activeElement22 === document.body);
      value64 && (ref35.current = !0), !(!value64 && !value65 && ref36.current === null || ref34.current !== null) && (ref34.current = requestAnimationFrame(() => {
        ref34.current = null;
        let current2 = ref35.current;
        ref35.current = !1;
        let current3 = ref36.current;
        if (ref36.current = null, ref26.current !== null || !document.hasFocus())
          return;
        let activeElement3 = document.activeElement;
        if (current3 === "outside") {
          let value66 = callback10();
          if (callback14(activeElement3) || activeElement3 !== null && ref42.current?.contains(activeElement3) === !0 || value66 === null)
            return;
          value18(!0), callback11(value66, ref33);
          return;
        }
        if (current3 !== null) {
          (activeElement3 === current3 || activeElement3 === null || activeElement3 === document.body) && callback11(callback10() ?? slideSurfaceRef.current, ref33);
          return;
        }
        current2 && (activeElement3 === slideSurfaceRef.current || activeElement3 === stageRef.current) ? callback11(callback10(), ref33) : (activeElement3 === null || activeElement3 === document.body) && callback11(callback10() ?? slideSurfaceRef.current, ref33);
      }));
    }), runtime2.reactK_.useEffect(() => () => {
      ref34.current !== null && cancelAnimationFrame(ref34.current), ref34.current = null;
    }, []);
    let ref42 = runtime2.reactK_.useRef(null);
    runtime2.reactK_.useLayoutEffect(() => {
      let activeElement2 = document.activeElement;
      activeElement2 !== null && ref42.current?.contains(activeElement2) === !0 || keyboardGroups.every((input) => input.stops.every((input2, options) => input2 === input.tree[options])) || (keyboardStopOrderRef.current.seq = /* @__PURE__ */ new Map(), refreshKeyboardOrder((input) => input + 1));
    }, [keyboardGroups]);
    let callback15 = runtime2.reactK_.useCallback(() => {
      if (selectionRef.current.length === 0)
        return callback13((0, runtime2.slideNavigationSelections)(slideRef.current)[0]);
      let value59 = callback10();
      return value59 === null ? !1 : (value18(!0), ref29.current = 0, callback11(value59, ref32), !0);
    }, [callback13, callback10, callback11]), callback16 = runtime2.reactK_.useCallback(() => {
      if (ref26.current !== null) {
        let value60 = slideSurfaceRef.current?.querySelector("[data-text-path][contenteditable], [data-cell][contenteditable]") ?? null;
        return value60 === null ? !1 : (value60.focus({
          preventScroll: !0
        }), document.activeElement === value60);
      }
      if (selectionRef.current.length === 0 || !callback15())
        return !1;
      let value59 = callback10();
      return value59 !== null && document.activeElement === value59;
    }, [callback15, callback10]), memo4 = runtime2.reactK_.useMemo(() => ({
      rect: (input) => {
        let value59 = ref44.current(input);
        if (value59 !== null)
          return {
            x: value59.x,
            y: value59.y,
            w: value59.w,
            h: value59.h
          };
      },
      shrunk: (input) => {
        let entry = frameElementsRef.current.get(input.frameId), value59 = input.child === void 0 ? entry : entry?.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(input).join(".") + '"]');
        return value59 != null && (0, runtime2.hasTextFitCssVariable)(value59);
      }
    }), []), callback17 = () => {
      let value59 = stageRef.current?.getBoundingClientRect(), value60 = slideSurfaceRef.current?.getBoundingClientRect();
      if (value59 === void 0 || value60 === void 0 || value60.width <= 0)
        return null;
      let value61 = value60.width / runtime2.SLIDE_WIDTH, value62 = (0, runtime2.unionSelectionRectangles)(selectionRef.current.map((input) => ref44.current(input)).filter((input) => input !== null)) ?? {
        x: runtime2.SLIDE_WIDTH / 2,
        y: runtime2.SLIDE_HEIGHT / 2,
        w: 0,
        h: 0
      };
      return (0, runtime2.contextMenuAnchorPoint)({
        left: value60.left + value62.x * value61,
        top: value60.top + value62.y * value61,
        width: value62.w * value61,
        height: value62.h * value61
      }, value59);
    }, ref43 = runtime2.reactK_.useRef(null), elementLinkOpenerRef = runtime2.reactK_.useRef(null);
    zoomApiRef && (ref43.current = zoomApiRef.current = {
      getScale: () => ref8.current.scale,
      getLimits: () => ({
        ...ref17.current
      }),
      setScaleTo: callback5,
      returnToFit: callback3,
      stepZoom: callback4,
      focusSlide: callback12,
      focusSelection: callback16,
      endTextEdit: () => callback42(),
      landOnCreated: (input) => {
        ref37.current = input;
      },
      measureUnit: (input) => {
        let entry = frameElementsRef.current.get(input.frameId), value59 = input.child === void 0 ? entry : entry?.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(input).join(".") + '"]');
        if (!value59)
          return;
        let value60 = getComputedStyle(value59), value61 = Math.ceil(parseFloat(value60.width)), value62 = Math.ceil(parseFloat(value60.height));
        return {
          w: value61 > 0 ? value61 : void 0,
          h: value62 > 0 ? value62 : void 0
        };
      },
      groupMeasure: memo4,
      menuPoint: callback17,
      canLinkSelection: () => elementLinkOpenerRef.current !== null,
      linkSelection: () => elementLinkOpenerRef.current?.(),
      endCrop: () => imageCropController.end(!0)
    }), runtime2.reactK_.useEffect(() => () => {
      zoomApiRef && zoomApiRef.current === ref43.current && (zoomApiRef.current = null);
    }, [zoomApiRef]);
    let callback18 = (event) => {
      event.target !== event.currentTarget || event.defaultPrevented || commenting || event.key === "Enter" && !event.repeat && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && callback15() && event.preventDefault();
    }, callback19 = (input, options) => {
      if ([
        ...document.querySelectorAll(runtime2.OPEN_OVERLAY_SELECTOR + ', [data-mc-pick], [role="dialog"]')
      ].some((input2) => !(0, runtime2.isOverlayClosed)(input2)))
        return !1;
      let current = slideRef.current, value59 = (0, runtime2.selectedNode)(current, input);
      if (value59 === void 0)
        return !1;
      let value60 = (0, runtime2.nodeDefaultAction)(value59);
      if (value60 === "enter")
        options((0, runtime2.childNavigationSelections)(current, input)[0]);
      else if (value60 === "edit-text" && !readOnlyRef.current)
        onTextEdit({
          frameId: input.frameId,
          path: (0, runtime2.selectionNodePath)(input),
          caret: "end"
        });
      else if (value60 === "edit-cell" && !readOnlyRef.current)
        onTextEdit({
          frameId: input.frameId,
          path: (0, runtime2.selectionNodePath)(input),
          cell: {
            r: 0,
            c: 0
          },
          caret: "end"
        });
      else
        return !1;
      return !0;
    }, memo22 = runtime2.reactK_.useMemo(() => new Map(keyboardTargets.map((input) => [input.key, input])), [keyboardTargets]), callback20 = (element) => memo22.get(element.getAttribute("data-object-proxy") ?? "")?.unit, callback21 = (input) => input instanceof Element && (input === slideSurfaceRef.current || input.closest("[data-object-proxy]") !== null), callback22 = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
        return;
      let value59 = callback20(event.currentTarget);
      if (value59 === void 0)
        return;
      let current = slideRef.current;
      if (event.key === "Tab")
        event.preventDefault(), callback13((0, runtime2.nextNavigationSelection)(current, value59, event.shiftKey ? -1 : 1));
      else if ((event.key === "Home" || event.key === "End") && !event.shiftKey)
        event.preventDefault(), callback13((0, runtime2.boundaryNavigationSelection)(current, value59, event.key === "Home" ? "first" : "last"));
      else if (event.key === "Enter" && !event.repeat)
        if (event.shiftKey) {
          event.preventDefault();
          let value60 = (0, runtime2.navigationParentSelection)(current, value59);
          value60 !== null ? callback13(value60) : (callback12(), onSelectionChange([]));
        } else if (selectionRef.current.length > 1)
          event.preventDefault(), callback13(value59);
        else {
          let value60 = (0, runtime2.selectedNode)(current, value59);
          value60 !== void 0 && (0, runtime2.nodeDefaultAction)(value60) === "enter" && (event.preventDefault(), callback13((0, runtime2.childNavigationSelections)(current, value59)[0]));
        }
      else
        readOnlyRef.current && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "PageUp" || event.key === "PageDown") && event.preventDefault();
    }, callback23 = (input) => {
      let value59 = callback20(input.currentTarget);
      if (value59 === void 0)
        return;
      let current = selectionRef.current;
      current.length === 1 && (0, runtime2.selectionsEqual)(current[0], value59) || callback13(value59), current.length <= 1 && callback19(value59, callback13);
    }, callback24 = (event) => {
      if (ref32.current || ref33.current || event.target !== event.currentTarget)
        return;
      let value59 = callback20(event.currentTarget);
      if (value59 === void 0)
        return;
      let current = selectionRef.current, value60 = current.some((input) => (0, runtime2.selectionsEqual)(input, value59));
      if (value60 && ref28.current === event.currentTarget)
        return;
      value18(!0);
      let value61 = current[current.length - 1];
      value61 !== void 0 && (0, runtime2.selectionsEqual)(value61, value59) || onSelectionChange(value60 ? [
        ...current.filter((input) => !(0, runtime2.selectionsEqual)(input, value59)),
        value59
      ] : [value59]);
    }, callback25 = runtime2.reactK_.useCallback((input, options) => {
      options ? frameElementsRef.current.set(input, options) : frameElementsRef.current.delete(input);
    }, []), callback26 = runtime2.reactK_.useCallback((input, options) => {
      let entry = frameElementsRef.current.get(input), value59 = entry?.offsetParent;
      if (!entry || !value59)
        return null;
      let bounds = value59.getBoundingClientRect(), callback77 = (input2) => ({
        x: (input2.left - bounds.left) / scale,
        y: (input2.top - bounds.top) / scale,
        w: input2.width / scale,
        h: input2.height / scale
      }), value60 = callback77(getFrameTransformScreenRect(slideRef.current, input, entry)), items = [];
      for (let [value61, value62] of frameElementsRef.current)
        value61 === input || options?.has(value61) || items.push(callback77(getFrameTransformScreenRect(slideRef.current, value61, value62)));
      return {
        startRect: value60,
        layout: callback77(entry.getBoundingClientRect()),
        siblingRects: items
      };
    }, [scale]), callback27 = runtime2.reactK_.useCallback((input) => {
      let entry = frameElementsRef.current.get(input.frameId), value59 = entry?.offsetParent;
      if (!entry || !value59)
        return null;
      let element = entry.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(input).join(".") + '"]'), value60 = input.child === void 0 ? entry : element;
      if (!value60)
        return null;
      let bounds = value59.getBoundingClientRect(), value61 = getUnliftedBoundingClientRect(value60), value62 = (0, runtime2.nodeTransform)((0, runtime2.selectedNode)(slide, input)), value63 = element !== null && typeof element.offsetWidth == "number";
      if (value62 === void 0 || element === null)
        return {
          x: (value61.left - bounds.left) / scale,
          y: (value61.top - bounds.top) / scale,
          w: value61.width / scale,
          h: value61.height / scale
        };
      let value64 = getUnliftedBoundingClientRect(element), value65 = value62.scale ?? 1, value66 = value63 || input.child === void 0 ? null : getComputedStyle(element), value67 = (value63 ? element.offsetWidth : value66 !== null ? parseFloat(value66.width) || value64.width / scale : value61.width / scale) * value65, value68 = (value63 ? element.offsetHeight : value66 !== null ? parseFloat(value66.height) || value64.height / scale : value61.height / scale) * value65;
      return {
        x: (value64.left + value64.width / 2 - bounds.left) / scale - value67 / 2,
        y: (value64.top + value64.height / 2 - bounds.top) / scale - value68 / 2,
        w: value67,
        h: value68,
        rotation: (value62.rotate ?? 0) * Math.PI / 180,
        nodeScale: value65
      };
    }, [slide, scale]);
    runtime2.reactK_.useLayoutEffect(() => {
      let current = dragSessionRef.current, value59 = current?.kind === "move" ? current.drop : null, value60 = value59 ? frameElementsRef.current.get(value59.frameId) : void 0, value61 = value60?.offsetParent, value62 = null;
      if (current?.kind === "move" && value59 && value60 && value61) {
        let k = current.k, bounds = value61.getBoundingClientRect(), callback77 = (input) => {
          let value67 = value60.querySelector('[data-node-path="' + input.join(".") + '"]')?.getBoundingClientRect();
          return value67 ? {
            x: (value67.left - bounds.left) / k,
            y: (value67.top - bounds.top) / k,
            w: value67.width / k,
            h: value67.height / k
          } : null;
        }, value63 = current.preview?.slide ?? current.last?.slide ?? current.applyBase, value64 = (0, runtime2.frameById)(value63, value59.frameId), value65 = value64 ? (0, runtime2.nodeAtPath)(value64.node, value59.path) : void 0, value66 = callback77(value59.path);
        if (value66 && value65 && (0, runtime2.isFlowContainer)(value65)) {
          let value67 = value65.children.map((input, options) => callback77([...value59.path, options])), value68 = 2 / k, value69 = current.preview ? value67[value59.index] : void 0, value70 = value65.kind === "grid" || value65.dir === "v", value71 = value69 ? value70 ? {
            x: value69.x,
            y: value69.y + value69.h / 2 - value68 / 2,
            w: value69.w,
            h: value68
          } : {
            x: value69.x + value69.w / 2 - value68 / 2,
            y: value69.y,
            w: value68,
            h: value69.h
          } : value67.every((input) => input !== null) ? calculateFlowInsertionGuide(value65, value67, value59.index, value68) : null;
          value62 = {
            box: value66,
            bar: value71
          };
        }
      }
      setFlowDropPreview((input) => JSON.stringify(input) === JSON.stringify(value62) ? input : value62);
    }), runtime2.reactK_.useLayoutEffect(() => {
      let value59 = null;
      if (altPressed && distanceHoverTarget !== null && !textEdit && dragSessionRef.current === null && value2 === null) {
        let value60 = selectionBoundsForUnits(selection, selectionRects, distanceHoverTarget.unit, callback27), value61 = value60 !== null ? (0, runtime2.measureDistances)(value60.a, value60.b, 1) : null;
        value59 = value61 !== null && value61.lines.length > 0 ? value61 : null;
      }
      setDistanceMeasurements((input) => JSON.stringify(input) === JSON.stringify(value59) ? input : value59);
    });
    let value26 = hoverTarget !== null && hoverTarget.slide === slide && hoverTarget.view.x === value.x && hoverTarget.view.y === value.y && hoverTarget.view.scale === scale ? hoverTarget.unit : null;
    runtime2.reactK_.useLayoutEffect(() => {
      let value59 = value26 !== null && !value21 && !commenting && !textEdit && dragSessionRef.current === null && value2 === null && imageCropController.session === null && !selection.some((input) => (0, runtime2.selectionsEqual)(input, value26)) ? callback27(value26) : null;
      setHoverRect((input) => JSON.stringify(input) === JSON.stringify(value59) ? input : value59);
    }), runtime2.reactK_.useLayoutEffect(() => {
      let value59 = textEdit !== null ? callback27((0, runtime2.createNodeSelection)(textEdit.frameId, textEdit.path)) : null;
      setTextEditRect((input) => JSON.stringify(input) === JSON.stringify(value59) ? input : value59);
    }), runtime2.reactK_.useLayoutEffect(() => {
      setSelectionRects(selection.map(callback27)), setMeasuredSelectionKey(selectionKey2);
    }, [selectionKey2, callback27, value.x, value.y, measurementGeneration]);
    let ref44 = runtime2.reactK_.useRef(callback27);
    ref44.current = callback27;
    let applyViewportNow = (input) => {
      ref7.current = !0, ref6.current = input, ref8.current = input, setManualViewport(input);
    }, callback28 = (input, options, context) => {
      ref3.current !== null && cancelAnimationFrame(ref3.current.raf);
      let current = ref8.current, callback77 = (input2) => {
        ref7.current = !0, ref6.current = input2, ref8.current = input2, setManualViewport(input2);
      }, callback78 = () => {
        ref3.current !== null && cancelAnimationFrame(ref3.current.raf), ref3.current = null, callback77(input), context?.();
      };
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        return callback78();
      let value59 = -1, callback79 = (input2) => {
        value59 < 0 && (value59 = input2);
        let value60 = Math.min(1, (input2 - value59) / runtime2.GRID_ZOOM_ANIMATION_MS);
        if (value60 >= 1)
          return callback78();
        callback77((0, runtime2.interpolateGridViewport)(current, input, options, 1 - (1 - value60) ** 3)), ref3.current = {
          raf: requestAnimationFrame(callback79),
          to: input,
          land: callback78
        };
      };
      ref3.current = {
        raf: requestAnimationFrame(callback79),
        to: input,
        land: callback78
      };
    }, zoomedNowAtRef = runtime2.reactK_.useRef(-1 / 0), fitTextZoom = (immediate) => {
      let current = ref.current, startView = ref8.current, callback77 = () => {
        if (current === null)
          return;
        ref.current = null;
        let value64 = current.kept ? callback(ref8.current, usableViewport) : current.from !== null ? callback(current.from, usableViewport) : null;
        value64 === null ? callback28(fittedViewport, current.anchor, () => {
          ref7.current = !1, ref6.current = null, setManualViewport(null);
        }) : value64 !== ref8.current && callback28(value64, current.anchor);
      };
      if (value9 === null || textEdit === null) {
        if (ref4.current = null, current === null)
          return;
        !current.held && !current.kept && performance.now() - ref2.current < 1e3 ? ref.current = {
          ...current,
          held: !0
        } : (!current.held || selection.length === 0 || current.slide !== slide.id) && callback77();
        return;
      }
      let last = ref4.current?.key === value9 ? ref4.current : null;
      if (last !== null && last.w === state.w && last.h === state.h && last.top === state.top)
        return;
      let layout = {
        key: value9,
        w: state.w,
        h: state.h,
        top: state.top,
        zooms: last?.zooms ?? null
      };
      if (current?.kept === !0) {
        let value64 = callback(ref8.current, state);
        ref4.current = layout, value64 !== ref8.current && !immediate && callback28(value64, current.anchor);
        return;
      }
      if (!immediate && (0, runtime2.isApplePlatform)() && !textZoomRotated) {
        ref4.current = layout;
        return;
      }
      let frame = immediate && textEdit.path.length === 0 ? (0, runtime2.frameById)(slide, textEdit.frameId) : void 0, combo = frame !== void 0 && (0, runtime2.isEditableTextNode)(frame.node) ? (0, runtime2.nodeTypographyCombo)(frame.node, (0, runtime2.getRenderingTheme)()) : null, measured = ref44.current((0, runtime2.createNodeSelection)(textEdit.frameId, textEdit.path)), rect = measured ?? (frame !== void 0 && combo !== null ? (0, runtime2.frameRect)(frame, 0, combo.fontSize * combo.lineHeight) : null);
      if (rect === null) {
        immediate || (ref4.current = {
          ...layout,
          h: NaN
        });
        return;
      }
      let value60 = (0, runtime2.rotatedRectBounds_Rn)(rect), value61 = ref3.current?.to ?? ref8.current, base = current === null ? value61 : current.from !== null ? callback(current.from, usableViewport) : fittedViewport, textElement = frameElementsRef.current.get(textEdit.frameId)?.querySelector('[data-node-path="' + textEdit.path.join(".") + '"]') ?? null, fontPx = textElement !== null && parseFloat(getComputedStyle(textElement).fontSize) * (measured?.nodeScale ?? 1) || 1 / 0, fitted = fitTextEditingZoom((0, runtime2.isApplePlatform)() ? value60 : {
        ...value60,
        h: 0
      }, state, base, layout.zooms === !1 ? base.scale : ref17.current.maxScale, fontPx, (0, runtime2.isApplePlatform)() && textEdit.cell === void 0), target = value10 === 0 && fitted.scale === base.scale ? base : fitted;
      ref4.current = measured === null ? {
        ...layout,
        h: NaN
      } : {
        ...layout,
        zooms: layout.zooms ?? target.scale !== base.scale
      };
      let state2 = {
        x: value60.x,
        y: value60.y
      };
      if (target.x === value61.x && target.y === value61.y && target.scale === value61.scale) {
        current !== null && (ref.current = {
          ...current,
          key: value9,
          anchor: state2,
          held: !1
        });
        return;
      }
      current === null ? ref3.current?.land() : immediate && ref3.current !== null && cancelAnimationFrame(ref3.current.raf), immediate && (ref3.current = null), ref.current = current !== null ? {
        ...current,
        key: value9,
        anchor: state2,
        held: !1
      } : {
        key: value9,
        slide: slide.id,
        from: ref7.current ? ref6.current : null,
        anchor: state2,
        kept: !1,
        held: !1
      }, immediate && (target.x !== startView.x || target.y !== startView.y || target.scale !== startView.scale) && (zoomedNowAtRef.current = performance.now()), immediate ? applyViewportNow(target) : callback28(target, state2);
    };
    value9 !== null && ref4.current?.key !== value9 && (zoomedNowAtRef.current = -1 / 0, fitTextZoom(!0)), runtime2.reactK_.useEffect(() => {
      let element = stageRef.current;
      if (element === null || value9 === null || performance.now() - zoomedNowAtRef.current > EDITOR_TEXT_ZOOM_TAP_GUARD_MS)
        return;
      let swallow = (event) => {
        event.preventDefault(), event.type !== "touchstart" && event.stopPropagation();
      }, events = ["touchstart", "mousedown", "mouseup", "click", "dblclick"], release = () => events.forEach((input) => element.removeEventListener(input, swallow, {
        capture: !0
      }));
      for (let input of events)
        element.addEventListener(input, swallow, {
          capture: !0,
          passive: !1
        });
      let timer = setTimeout(release, EDITOR_TEXT_ZOOM_TAP_GUARD_MS);
      return () => {
        clearTimeout(timer), release();
      };
    }, [value9]), runtime2.reactK_.useEffect(() => {
      fitTextZoom(!1);
    }, [
      value9,
      selectionKey2,
      slide.id,
      value10,
      stageSize.w,
      stageSize.h,
      topInset,
      bottomInset
    ]), runtime2.reactK_.useEffect(() => () => {
      cancelAnimationFrame(ref3.current?.raf ?? 0), ref3.current = null;
    }, []);
    let ref45 = runtime2.reactK_.useRef(unitRectCache);
    ref45.current = unitRectCache;
    let ref46 = runtime2.reactK_.useRef(keyboardTargets);
    ref46.current = keyboardTargets;
    let ref47 = runtime2.reactK_.useRef(lastSelectedUnitKey);
    ref47.current = lastSelectedUnitKey;
    let value27 = textEdit !== null, value28 = textEdit !== null ? (0, runtime2.selectionKey)((0, runtime2.createNodeSelection)(textEdit.frameId, textEdit.path)) : null, ref48 = runtime2.reactK_.useRef(value28);
    ref48.current = value28;
    let memo32 = runtime2.reactK_.useMemo(() => keyboardTargets.map((input) => input.key).join("|"), [keyboardTargets]);
    runtime2.reactK_.useLayoutEffect(() => {
      if (dragSessionRef.current !== null)
        return;
      let current = ref45.current, entries = /* @__PURE__ */ new Map(), flag = !1;
      for (let value59 of ref46.current) {
        let entry = current.get(value59.key), value60 = value27 && (value59.key !== ref47.current || value59.key === ref48.current) && entry !== void 0 ? entry : ref44.current(value59.unit) ?? entry;
        value60 !== void 0 && (entries.set(value59.key, value60), (entry === void 0 || !editorRectsEqual(entry, value60)) && (flag = !0));
      }
      (flag || entries.size !== current.size) && setUnitRectCache(entries);
    }, [memo32, slide, measurementGeneration, value27]), runtime2.reactK_.useEffect(() => {
      let flag = !0;
      return document.fonts?.ready.then(() => {
        flag && refreshMeasurements((input) => input + 1);
      }), () => {
        flag = !1;
      };
    }, []);
    let [value29, value30] = runtime2.reactK_.useState(null), callback29 = (input) => {
      let value59 = callback27(input);
      return value59 === null || !imageCropController.begin(input) ? !1 : (onCropStart?.(), (0, runtime2.blurCropEditingTarget)(), value30(value59), !0);
    }, value31 = imageCropController.session?.unit, [value32, value33] = runtime2.reactK_.useState(0);
    runtime2.reactK_.useLayoutEffect(() => {
      let value59 = value31 ? callback27(value31) : null;
      value30((input) => value59 === null || input !== null && input.x === value59.x && input.y === value59.y && input.w === value59.w && input.h === value59.h ? value31 ? input : null : value59);
    }, [
      imageCropController.slide,
      value31,
      callback27,
      value.x,
      value.y,
      value32
    ]), runtime2.reactK_.useEffect(() => {
      let value59 = value31 ? frameElementsRef.current.get(value31.frameId) : void 0, value60 = value59?.querySelector('[data-img-path="' + (value31 ? (0, runtime2.selectionNodePath)(value31).join(".") : "") + '"]');
      if (!value59 || !value60 || typeof ResizeObserver > "u")
        return;
      let callback77 = () => value33((input) => input + 1), observer = new ResizeObserver(callback77);
      observer.observe(value59), observer.observe(value60);
      let current = slideSurfaceRef.current, fonts2 = value59.ownerDocument.fonts;
      return current?.addEventListener("load", callback77, !0), fonts2?.addEventListener("loadingdone", callback77), () => {
        observer.disconnect(), current?.removeEventListener("load", callback77, !0), fonts2?.removeEventListener("loadingdone", callback77);
      };
    }, [value31]);
    let callback30 = runtime2.reactK_.useCallback((input, options) => callback27((0, runtime2.createNodeSelection)(input, options)), [callback27, measurementGeneration]), ref49 = runtime2.reactK_.useRef(() => {
    }), ref50 = runtime2.reactK_.useRef(() => {
    }), ref51 = runtime2.reactK_.useRef(null), callback31 = runtime2.reactK_.useCallback((input) => {
      ref51.current = input, onLiveChange(input);
    }, [onLiveChange]);
    runtime2.reactK_.useEffect(() => {
      let callback77 = (input, options) => [
        input.frameId,
        ...input.extras.map((input2) => input2.frameId)
      ].reduce((input2, options2) => input.autoW.has(options2) ? (0, runtime2.updateSlideFrame)(input2, options2, (input3) => removeFrameAxisSizes(input3, ["x"])) : input2, options), callback78 = (input, options, context) => {
        let value59 = null;
        for (let value71 of frameElementsRef.current.values())
          if (value59 = value71.isConnected ? value71.offsetParent : null)
            break;
        if (!value59 || !(input.k > 0))
          return null;
        let bounds = value59.getBoundingClientRect(), callback88 = (input2) => ({
          x: (input2.left - bounds.left) / input.k,
          y: (input2.top - bounds.top) / input.k,
          w: input2.width / input.k,
          h: input2.height / input.k
        }), value60 = (options - bounds.left) / input.k, value61 = (context - bounds.top) / input.k, callback89 = (input2) => value60 >= input2.x && value60 <= input2.x + input2.w && value61 >= input2.y && value61 <= input2.y + input2.h, value62 = callback77(input, input.last?.slide ?? input.applyBase), items = [
          input.frameId,
          ...input.extras.map((input2) => input2.frameId)
        ];
        if (items.some((input2) => (0, runtime2.isEmptyGroupBase)((0, runtime2.frameById)(value62, input2)?.node ?? {
          kind: "spacer"
        })))
          return null;
        let value63 = (0, runtime2.slidePrimaryLayoutFrame)(value62)?.id, value64 = items.map((input2) => {
          let value71 = frameElementsRef.current.get(input2)?.getBoundingClientRect();
          return value71 && value71.width > 0 ? {
            w: value71.width / input.k,
            h: value71.height / input.k
          } : input2 === input.frameId ? {
            w: input.startRect.w,
            h: input.startRect.h
          } : {
            w: 0,
            h: 0
          };
        }), value65 = items.length === 1 ? (0, runtime2.frameById)(value62, input.frameId) : void 0, callback90 = (input2, options2) => {
          for (let value71 = value62.frames.length - 1; value71 >= 0; value71--) {
            let value72 = value62.frames[value71], entry = frameElementsRef.current.get(value72.id);
            if (!entry || items.includes(value72.id) || !(0, runtime2.isFlowContainer)(value72.node) || (0, runtime2.isEmptyBackgroundFrame)(value72) || (0, runtime2.nodeTransform)(value72.node))
              continue;
            let callback91 = (input3) => entry.querySelector('[data-node-path="' + input3.join(".") + '"]'), callback92 = (input3) => {
              let value73 = callback91(input3);
              return value73 ? callback88(value73.getBoundingClientRect()) : null;
            }, items2 = [], items3 = [], items4 = [], node = value72.node;
            for (; ; ) {
              let value73 = callback92(items4);
              if (!value73 || !(0, runtime2.isFlowContainer)(node) || (0, runtime2.nodeTransform)(node) || !callback89(value73))
                break;
              let value74 = input2 && input2.frameId === value72.id && (0, runtime2.nodePathsEqual)(input2.path, items3) ? input2.index : -1, callback93 = (input3) => [
                ...items4,
                value74 >= 0 && input3 >= value74 ? input3 + 1 : input3
              ];
              items2.push({
                path: items3,
                dom: items4,
                node,
                rect: value73,
                gapAt: value74
              });
              let value75 = node.children.findIndex((input3, options3) => {
                if (!(0, runtime2.isFlowContainer)(input3) || (0, runtime2.nodeTransform)(input3))
                  return !1;
                let value76 = callback92(callback93(options3));
                return value76 !== null && callback89(value76);
              });
              if (value75 < 0)
                break;
              items3 = [...items3, value75], items4 = callback93(value75), node = node.children[value75];
            }
            for (let value73 = items2.length - 1; value73 >= 0; value73--) {
              let { path: value74, dom: value75, node: value76, rect: value77, gapAt: value78 } = items2[value73], origin = input.origin, value79 = origin !== null && origin.frameId === value72.id && value74.length <= origin.path.length && value74.every((input3, options3) => input3 === origin.path[options3]);
              if (value72.id === value63 && value74.length === 0 && !(value79 && (0, runtime2.styleHasVisiblePaint)(value76.style)))
                continue;
              let value80 = (origin !== null && origin.frameId === value72.id && value74.length === origin.path.length + 1 && origin.path.every((input3, options3) => input3 === value74[options3]) ? origin.rests?.[value74[value74.length - 1]] : void 0) ?? value77;
              if (!shouldExtractOversizedNode(value80, input.startRect, value79) || !value64.every((input3) => shouldExtractOversizedNode(value80, {
                x: 0,
                y: 0,
                ...input3
              }, value79)))
                continue;
              let value81 = value76.kind === "stack" ? value76.dir : "grid", entries = new Map([...input.lifted].filter(([, input3]) => input3.dir === value81).map(([input3, input4]) => [
                input3,
                input4.node
              ]));
              if (insertFramesIntoFlowContainer(value62, items, {
                frameId: value72.id,
                path: value74,
                index: 0
              }, entries) === null)
                continue;
              if (input2 && value78 < 0 && !options2)
                return "stale";
              let value82 = Array.from({
                length: value76.children.length + (value78 >= 0 ? 1 : 0)
              }, (input3, options3) => callback92([...value75, options3]));
              if (value82.some((input3) => input3 === null))
                continue;
              let value83 = value82, value84 = findFlowInsertionIndex(value76, value83, value60, value61), value85 = value78 >= 0 && value84 > value78 ? value84 - 1 : value84, value86 = origin !== null && origin.frameId === value72.id ? [...origin.pinned] : [], value87 = value76.kind === "stack" && value76.dir === "v", value88 = value76.kind === "grid" || value76.wrap ? Math.max(0, ...value64.map((input3) => input3.h)) : value64.reduce((input3, options3) => input3 + (value87 ? options3.h : options3.w), 0) + value76.gap * (value64.length - 1), value89, callback93 = () => value89 ??= getComputedStyle(callback91(value75) ?? entry);
              if ((value72.x.anchor === "fill" || value72.x.size !== void 0) && !value86.includes("x") && value76.kind === "stack" && value76.dir === "h" && !value76.wrap && !flowInsertionTargetMatches(origin, value72.id, value74, items, entries) && !(value78 >= 0 && !options2)) {
                let value91 = callback93(), value92 = value77.w - parseFloat(value91.paddingLeft) - parseFloat(value91.paddingRight) - parseFloat(value91.borderLeftWidth) - parseFloat(value91.borderRightWidth), value93 = value64.every((input3) => input3.w > 0) ? value88 : 1 / 0;
                if (!canFitHorizontalFlowInsertion(value76, value92, pairFlowRectsWithRemainingNodes(value83, value76.children, value78), value93))
                  continue;
              }
              if (value72.y.anchor !== "fill" && value72.y.size !== void 0 && !value86.includes("y"))
                if (value78 >= 0)
                  input2.release?.includes("y") && value86.push("y");
                else {
                  let value91 = callback93(), value92 = value77.h - parseFloat(value91.paddingTop) - parseFloat(value91.paddingBottom) - parseFloat(value91.borderTopWidth) - parseFloat(value91.borderBottomWidth), value93 = value83.filter((input3, options3) => value76.children[options3]?.kind !== "spacer");
                  (value87 ? value93.reduce((input3, options3) => input3 + options3.h, 0) + value76.gap * value93.length + value88 : Math.max(0, ...value64.map((input3) => input3.h))) > value92 + 1 && value86.push("y");
                }
              let state2 = {
                frameId: value72.id,
                path: value74,
                index: value85,
                ...value86.length > 0 ? {
                  release: value86
                } : {}
              }, value90 = value65 ? entries.get(value65.id) ?? removeFlowNodePlacement(value65, value76) : void 0;
              return {
                target: state2,
                extent: value88,
                ...entries.size > 0 ? {
                  originals: entries
                } : {},
                ...value90 ? {
                  ghost: value90
                } : {}
              };
            }
          }
          return null;
        }, value66 = callback79(input, value62), value67 = input.preview?.target, value68 = callback90(value67, value67 !== void 0 && value66 !== null && ((input2, options2) => input2.frameId === options2.frameId && (0, runtime2.nodePathsEqual)(input2.path, options2.path) && input2.index === options2.index && (input2.release ?? []).join() === (options2.release ?? []).join())(value67, value66.target));
        if (value68 !== "stale")
          return value68;
        input.preview = value66 ? {
          slide: setFlowInsertionSize(value62, value66.target, value66.extent, value66.ghost),
          target: value66.target
        } : null;
        let value69 = input.preview?.slide ?? null;
        runtime2.FrameViewportReactDom.flushSync(() => setDragPreviewSlide(value69));
        let value70 = callback90(value66?.target, !0);
        return value70 === "stale" ? null : value70;
      }, callback79 = (input, options) => {
        let origin = input.origin, value59 = origin ? (0, runtime2.frameById)(options, origin.frameId) : void 0, value60 = value59 && origin ? (0, runtime2.nodeAtPath)(value59.node, origin.path) : void 0;
        if (!origin || !value60 || !(0, runtime2.isFlowContainer)(value60))
          return null;
        let value61 = value60.kind === "stack" && value60.dir === "h" && !value60.wrap ? input.startRect.w : input.startRect.h, value62 = input.extras.length === 0 ? input.lifted.get(input.frameId)?.node : void 0;
        return {
          target: {
            frameId: origin.frameId,
            path: origin.path,
            index: origin.index,
            ...origin.pinned.length > 0 ? {
              release: [...origin.pinned]
            } : {}
          },
          extent: value61,
          ...value62 ? {
            ghost: value62
          } : {}
        };
      }, callback80 = (input, options, context) => {
        let value59 = options, value60;
        for (let value61 of input.sheds) {
          if (input.drop !== null && input.drop.frameId === value61.frameId && input.drop.path.length === 0)
            continue;
          let value62 = (0, runtime2.frameById)(value59, value61.frameId);
          if (!value62 || !(0, runtime2.isFlowContainer)(value62.node))
            continue;
          let value63 = createFlowChildIndexRemapper(value61, value62.node.children), callback88 = (input2) => {
            let value65 = value63(input2) ?? callback39(value61.frameId, [input2], input.k);
            return value65 && context && context.frameId === value61.frameId && context.index === input2 ? {
              ...value65,
              w: context.w
            } : value65;
          }, value64 = collapseSingleChildFlowFrame(value59, value61.frameId, callback88);
          value59 = value64.slide, value64.minted && input.drop !== null && input.drop.frameId === value61.frameId && input.drop.path[0] === value64.from && (value60 = value64.minted);
        }
        return {
          slide: value59,
          ...value60 ? {
            into: value60
          } : {}
        };
      }, callback81 = (input, options, context = !1) => {
        let last = input.last;
        if (last === null)
          return;
        input.drop = options?.target ?? null, input.restore = options?.originals ?? null;
        let value59 = options ?? (context ? null : callback79(input, last.slide));
        input.preview = value59 && (value59.ghost !== void 0 || value59.extent > 0) ? {
          slide: setFlowInsertionSize(last.slide, value59.target, value59.extent, value59.ghost),
          target: value59.target
        } : null;
        let value60 = input.preview?.slide ?? null;
        runtime2.FrameViewportReactDom.flushSync(() => {
          callback31(last.slide), setDragPreviewSlide(value60);
        });
      }, callback82 = (source, options) => {
        if ((0, runtime2.clearGestureCursor)(), clearTouchLiftRef.current(), dragLiveRef && (dragLiveRef.current = !1), setRotationPreviewAngle(null), setEndpointSnapPoint(null), source.moved && refreshMeasurements((input) => input + 1), !source.moved) {
          (source.kind === "move" || source.kind === "layer-move") && !options && source.clickSelect !== null && onSelectionChange(source.clickSelect), (source.kind === "move" || source.kind === "layer-move") && !options && togglePendingFrame(), pendingToggleFrameRef.current = pendingPlayClipRef.current = null;
          return;
        }
        if (pendingToggleFrameRef.current = pendingPlayClipRef.current = null, source.kind === "layer-move") {
          if (!options) {
            let value59 = source.layerRect.x + source.lastDx + source.layerRect.w / 2, value60 = source.layerRect.y + source.lastDy + source.layerRect.h / 2, state2 = {
              x: source.layerRect.x + source.lastDx,
              y: source.layerRect.y + source.lastDy,
              w: source.layerRect.w,
              h: source.layerRect.h
            }, entry = frameElementsRef.current.get(source.frameId), value61 = entry?.offsetParent, value62 = entry?.querySelector('[data-overlay-layer="' + String(source.layerIndex + 1) + '"]'), scale3 = ref8.current.scale;
            if (value61 && value62 && scale3 > 0) {
              let bounds = value61.getBoundingClientRect(), bounds2 = value62.getBoundingClientRect();
              state2 = {
                x: (bounds2.left - bounds.left) / scale3,
                y: (bounds2.top - bounds.top) / scale3,
                w: bounds2.width / scale3,
                h: bounds2.height / scale3
              };
            }
            let wrapperRect = source.wrapperRect;
            if (!(value59 >= wrapperRect.x && value59 <= wrapperRect.x + wrapperRect.w && value60 >= wrapperRect.y && value60 <= wrapperRect.y + wrapperRect.h) && source.memberSizes === void 0) {
              let current = slideRef.current, value63 = (0, runtime2.frameById)(current, source.frameId);
              if (current.frames.length >= runtime2.maxSlideFrames)
                (0, runtime2.showToast)(SLIDE_FULL_MESSAGE);
              else if (value63 && (0, runtime2.isOverlayNode)(value63.node)) {
                let value64 = value63.node.layers[source.layerIndex];
                if (value64) {
                  let value65 = (0, runtime2.normalizeNegativeFrameMargins)(createFreeFrameFromNode(value64.node, state2), state2), state3 = {
                    ...current,
                    frames: current.frames.map((input) => input.id === source.frameId && (0, runtime2.isOverlayNode)(input.node) ? {
                      ...input,
                      node: (0, runtime2.removeOverlayLayer)(input.node, source.layerIndex)
                    } : input).concat([value65])
                  }, callback88 = (input) => memo4.rect(input.child !== void 0 && input.child > source.layerIndex ? (0, runtime2.createNodeSelection)(input.frameId, [
                    input.child + 1
                  ]) : input);
                  callback31((0, runtime2.rewriteNestedOverlayPlacements)(
                    state3,
                    /* @__PURE__ */ new Set([source.frameId]),
                    {
                      ...memo4,
                      rect: callback88
                    }
                  )), onSelectionChange([
                    {
                      frameId: value65.id
                    }
                  ]);
                }
              }
            }
          }
          onGestureEnd(source.before);
          return;
        }
        if (!options && source.kind === "move" && source.last !== null && source.drop !== null) {
          let drop = source.drop, value59 = (0, runtime2.frameById)(source.last.slide, drop.frameId), value60 = value59 ? (0, runtime2.nodeAtPath)(value59.node, drop.path) : void 0, callback88 = (input) => {
            let value63 = frameElementsRef.current.get(input)?.getBoundingClientRect();
            return value63 ? value60?.kind === "grid" ? [value63.top, value63.left] : value60?.kind === "stack" && value60.dir === "v" ? [value63.top, 0] : [value63.left, 0] : [0, 0];
          }, value61 = [
            source.frameId,
            ...source.extras.map((input) => input.frameId)
          ].sort((input, options2) => {
            let [value63, value64] = callback88(input), [value65, value66] = callback88(options2);
            return value63 - value65 || value64 - value66;
          }), value62 = insertFramesIntoFlowContainer(callback77(source, source.last.slide), value61, drop, source.restore ?? void 0);
          if (value62) {
            let origin = source.origin, value63 = source.sheds.find((input) => input.frameId === drop.frameId && drop.path.length > 0), value64 = value63 && origin && !(origin.frameId === drop.frameId && (0, runtime2.nodePathsEqual)(origin.path, drop.path)) ? callback79(source, value62) : null, value65;
            if (value63 && value64) {
              runtime2.FrameViewportReactDom.flushSync(() => {
                setDragPreviewSlide(setFlowInsertionSize(value62, value64.target, value64.extent, value64.ghost)), callback31(value62);
              });
              let value76 = drop.path[0], value77 = origin.frameId === value63.frameId && origin.path.length === 0 && value64.target.index <= value76 ? value76 + 1 : value76, value78 = callback39(value63.frameId, [value77], source.k);
              value78 && (value65 = {
                frameId: value63.frameId,
                index: value76,
                w: value78.w
              });
            }
            runtime2.FrameViewportReactDom.flushSync(() => {
              setDragPreviewSlide(null), callback31(value62);
            });
            let value66 = value62, value67 = frameElementsRef.current.get(drop.frameId)?.querySelector('[data-node-path=""]');
            value67 && value67.scrollHeight > value67.clientHeight + 1 && (value66 = (0, runtime2.updateSlideFrame)(value66, drop.frameId, (input) => removeFrameAxisSizes(input, ["y"])));
            let value68 = callback80(source, value66, value65);
            value66 = value68.slide;
            let value69 = value68.into ? {
              id: value68.into.id,
              path: drop.path.slice(1)
            } : {
              id: drop.frameId,
              path: drop.path
            }, value70 = value61.map((input, options2) => [
              ...value69.path,
              drop.index + options2
            ]), value71 = (0, runtime2.frameById)(value66, value69.id), value72 = (0, runtime2.rewriteNestedOverlayPlacements)(value66, findChangedFrameIds(source.before, value66), memo4), value73 = (0, runtime2.frameById)(value72, value69.id), value74 = value70.map((input) => value71 && value73 ? findSurvivingNodePath(value71.node, value73.node, input) : void 0);
            value74.every((input) => input !== void 0) && (value66 = value72, value70 = value74), value66 !== value62 && callback31(value66);
            let value75 = value61.map((input, options2) => ({
              id: input,
              unit: (0, runtime2.createNodeSelection)(value69.id, value70[options2])
            }));
            onSelectionChange([
              ...value75.filter((input) => input.id !== source.frameId),
              ...value75.filter((input) => input.id === source.frameId)
            ].map((input) => input.unit));
          } else {
            runtime2.FrameViewportReactDom.flushSync(() => setDragPreviewSlide(null)), (0, runtime2.showToast)((0, runtime2.formatMessage)({
              defaultMessage: "目标组合已满或嵌套过深，对象保留在放下的位置。",
              id: "+/koWmtdjE"
            }));
            let slide2 = callback80(source, source.last.slide).slide;
            slide2 !== source.last.slide && callback31(slide2);
          }
          onGestureEnd(source.before);
          return;
        }
        if (source.kind === "move" && source.preview !== null && runtime2.FrameViewportReactDom.flushSync(() => setDragPreviewSlide(null)), !options && source.kind === "move" && source.last !== null) {
          let slide2 = source.last.slide, value59 = (0, runtime2.applyFrameSnapAnchors)(source.last.frame, source.lastSnaps);
          if (value59 !== source.last.frame) {
            let value60 = (0, runtime2.preserveImplicitAxisSize)(source.xSpec, value59.x, source.autoW.get(source.frameId), runtime2.SLIDE_WIDTH);
            value59 = {
              ...value59,
              x: value60
            }, slide2 = (0, runtime2.updateSlideFrame)(source.last.slide, source.frameId, () => value59);
          }
          slide2 = callback80(source, slide2).slide, slide2 = (0, runtime2.rewriteNestedOverlayPlacements)(slide2, findChangedFrameIds(source.before, slide2), memo4), slide2 !== source.last.slide && callback31(slide2);
        }
        if (options && source.kind === "move" && source.moved && slideRef.current.id === source.before.id) {
          let current = slideRef.current, value59 = source.sheds.length > 0 ? callback80({
            ...source,
            drop: null
          }, current).slide : current, value60 = (0, runtime2.rewriteNestedOverlayPlacements)(value59, findChangedFrameIds(source.before, value59), memo4);
          value60 !== current && callback31(value60);
        }
        onGestureEnd(source.before);
      };
      ref49.current = (input) => {
        setSnapGuides([]), callback82(input, !0);
      }, ref50.current = (input) => {
        clearTouchLiftRef.current(), dragLiveRef && (dragLiveRef.current = !1), setSnapGuides([]), setDragPreviewSlide(null), (0, runtime2.clearGestureCursor)(), setRotationPreviewAngle(null), setEndpointSnapPoint(null), callback31(input.before), onGestureEnd(input.before);
        let value59 = (0, runtime2.filterValidSelections)(input.before, selectionRef.current);
        value59.length !== selectionRef.current.length && onSelectionChange(value59);
      };
      let callback83 = (input) => {
        let current = slideRef.current, value59 = (0, runtime2.frameById)(current, input.frameId);
        if (!value59)
          return;
        let target = input.press.target, value60 = (0, runtime2.resolvePaintedSelection)(input.frameId, value59.node, parseEditorNodePath(target?.closest?.("[data-node-path]")?.getAttribute("data-node-path"))), current2 = selectionRef.current;
        if (!readOnlyRef.current && value60 !== null && current2.length === 1 && (0, runtime2.selectionContainsNode)(current2, value60)) {
          let value61 = (0, runtime2.selectedNode)(current, value60), value62 = target?.closest?.("[data-cell]") ?? null;
          if ((0, runtime2.isTableNode)(value61) && value62 !== null) {
            let [value63, value64] = (value62.getAttribute("data-cell") ?? "").split("."), value65 = Number(value63), value66 = Number(value64);
            if ((0, runtime2.tableCellExists)(value61, value65, value66)) {
              onTextEdit({
                frameId: value60.frameId,
                path: (0, runtime2.selectionNodePath)(value60),
                cell: {
                  r: value65,
                  c: value66
                }
              });
              return;
            }
          }
          if ((0, runtime2.isEditableTextNode)(value61)) {
            onTextEdit({
              frameId: value60.frameId,
              path: (0, runtime2.selectionNodePath)(value60)
            });
            return;
          }
        }
        beginFrameDragRef.current(input.frameId, input.press);
        let current3 = dragSessionRef.current;
        current3 !== null && current3.pointerId === input.pointerId && (dragSessionRef.current = null, callback82(current3, !1));
      }, callback84 = (input, options, context, value59, extra) => {
        let value60 = (0, runtime2.snapLineEndpoint)([
          input.fixed[0] + input.origin[0],
          input.fixed[1] + input.origin[1]
        ], [input.start[0] + options, input.start[1] + context], value59 ? [] : input.sites, 8 / input.k, extra);
        setEndpointSnapPoint(value60.site ? {
          x: value60.site.x,
          y: value60.site.y
        } : null);
        let value61 = input.bar !== null ? 0 : (0, runtime2.connectorArrowInset)(input.strokeWidth), callback88 = (input2) => input.bar !== null ? input2 : Math.round(input2), items = [
          Math.max(value61, callback88(value60.point[0] - input.origin[0])),
          Math.max(value61, callback88(value60.point[1] - input.origin[1]))
        ];
        if (input.bar !== null)
          callback31((0, runtime2.updatePinnedNodeRect)(input.before, input.frameId, input.path, (0, runtime2.lineShapeFromEndpoints)(input.fixed, items, input.bar.thickness, input.which), input.bar.span));
        else {
          let value62 = input.which === 0 ? (0, runtime2.connectorBoundsFromEndpoints)(items, input.fixed, input.strokeWidth) : (0, runtime2.connectorBoundsFromEndpoints)(input.fixed, items, input.strokeWidth);
          callback31((0, runtime2.pinNodeToRect)(input.before, input.frameId, input.path, value62));
        }
        refreshMeasurements((input2) => input2 + 1);
      }, callback85 = (input) => {
        let current = touchPressRef.current;
        if (current !== null && current.pointerId === input.pointerId && input.isTrusted) {
          let value69 = (0, runtime2.reduceTouchLongPress)(current, {
            kind: "move",
            clientX: input.clientX,
            clientY: input.clientY
          }, pointerDragThreshold("touch"));
          touchPressRef.current = value69.press, (value69.outcome === "pan" || value69.outcome === "drag") && (plainPressRef.current = !1), value69.outcome === "drag" && !readOnlyRef.current && (releasePointerRef.current(current.pointerId), beginFrameDragRef.current(current.frameId, current.press)), (value69.outcome === "pan" || value69.outcome === "drag") && callback50();
        }
        let current2 = dragSessionRef.current;
        if (!current2 || input.pointerId !== current2.pointerId)
          return;
        if (input.buttons === 0) {
          dragSessionRef.current = null, setSnapGuides([]), callback82(current2, !0);
          return;
        }
        let scale3 = ref8.current.scale;
        scale3 !== current2.k && scale3 > 0 && (current2.startX = preservePinchAnchorCoordinate(current2.startX, input.clientX, current2.k, scale3), current2.startY = preservePinchAnchorCoordinate(current2.startY, input.clientY, current2.k, scale3), current2.k = scale3);
        let value59 = (input.clientX - current2.startX) / current2.k, value60 = (input.clientY - current2.startY) / current2.k, value61 = current2.kind === "move" || current2.kind === "layer-move" ? current2.slop : void 0, value62 = input.clientX - current2.downX, value63 = input.clientY - current2.downY;
        if (!current2.moved && (value61 !== void 0 ? Math.hypot(value62, value63) <= value61 : Math.abs(value62) + Math.abs(value63) < pointerDragThreshold(current2.type)))
          return;
        let value64 = !current2.moved;
        if (current2.moved = !0, plainPressRef.current = !1, dragLiveRef && (dragLiveRef.current = !0), current2.kind === "rotate") {
          let value69 = frameElementsRef.current.get(current2.frameId)?.offsetParent;
          if (!value69)
            return;
          let bounds = value69.getBoundingClientRect(), value70 = (0, runtime2.angleBetweenPoints)(bounds.left + current2.cx * current2.k, bounds.top + current2.cy * current2.k, input.clientX, input.clientY), value71 = (0, runtime2.snapRotation)(current2.startDeg, value70 - current2.startBearing, input.shiftKey);
          if (value71 === current2.lastDeg)
            return;
          current2.lastDeg = value71, callback31((0, runtime2.updateSelectedNode)(current2.before, (0, runtime2.createNodeSelection)(current2.frameId, current2.path), (input2) => (0, runtime2.setNodeRotation)(input2, value71))), setRotationPreviewAngle(value71), current2.type !== "touch" && (0, runtime2.setGestureCursor)((0, runtime2.rotatedGrabCursor)(current2.corner, value71 * Math.PI / 180)), refreshMeasurements((input2) => input2 + 1);
          return;
        }
        if (current2.kind === "endpoint") {
          current2.last = {
            dx: value59,
            dy: value60
          }, callback84(current2, value59, value60, input.metaKey || input.ctrlKey, input.shiftKey);
          return;
        }
        if (current2.kind === "layer-move") {
          current2.type === "touch" && applyTouchLiftRef.current(current2), current2.lastDx = value59, current2.lastDy = value60, { dx: value59, dy: value60 } = (0, runtime2.clampMoveDeltaToSlide)([current2.layerRect], value59, value60);
          let memberSizes = current2.memberSizes;
          callback31((0, runtime2.updateSlideFrame)(current2.before, current2.frameId, (input2) => {
            let value69 = memberSizes !== void 0 ? (0, runtime2.moveLeadingGroupLayer)(input2, current2.layerIndex, value59, value60, memberSizes) : void 0;
            if (value69 !== void 0)
              return value69;
            if (!(0, runtime2.isOverlayNode)(input2.node))
              return input2;
            let value70 = input2.node.layers[current2.layerIndex];
            if (!value70)
              return input2;
            let items = [...input2.node.layers];
            return items[current2.layerIndex] = {
              ...value70,
              x: (0, runtime2.moveAxisSpecPreservingSize)(current2.xSpec, value59, current2.autoW, current2.roomW),
              y: (0, runtime2.moveAxisSpec)(current2.ySpec, value60)
            }, {
              ...input2,
              node: {
                ...input2.node,
                layers: items
              }
            };
          }));
          return;
        }
        if (current2.kind === "move" && value64 && current2.pendingBreakouts.length > 0) {
          let pendingBreakouts = current2.pendingBreakouts;
          current2.pendingBreakouts = [];
          let applyBase2 = current2.applyBase, flag = !1;
          for (let value69 of pendingBreakouts) {
            let value70 = extractFlowDragSelection(applyBase2, value69);
            if (!value70)
              continue;
            if (value70.slide.frames.length > runtime2.maxSlideFrames) {
              (0, runtime2.showToast)(SLIDE_FULL_MESSAGE);
              continue;
            }
            let { newFrames: value71, drag: value72 } = value70, value73 = (0, runtime2.frameById)(applyBase2, value69.frameId);
            if (applyBase2 = value70.slide, flag = !0, value73) {
              let callback88 = (input2, options, context) => {
                let value74 = (0, runtime2.nodeAtPath)(value73.node, options), value75 = (0, runtime2.nodeAtPath)(value73.node, options.slice(0, -1));
                if (!value74 || !value75 || !(0, runtime2.isFlowContainer)(value75))
                  return;
                let value76 = value70.plucked.some((input3) => isStrictPathAncestor(options, input3.path)) ? value74.place !== void 0 ? {
                  ...context,
                  place: value74.place
                } : context : value74;
                current2.lifted.set(input2, {
                  node: value76,
                  dir: value75.kind === "stack" ? value75.dir : "grid"
                });
              };
              for (let value74 of value70.plucked)
                callback88(value74.frame.id, value74.path, value74.frame.node);
              value71.forEach((input2, options) => input2 && callback88(input2.id, [options], input2.node));
            }
            for (let value74 of value70.plucked)
              value74.frame !== value72 && current2.extras.push({
                frameId: value74.frame.id,
                xSpec: value74.frame.x,
                ySpec: value74.frame.y
              });
            for (let value74 of value69.selectedChildren) {
              if (value74 === value69.dragIndex)
                continue;
              let value75 = value71[value74];
              value75 && current2.extras.push({
                frameId: value75.id,
                xSpec: value75.x,
                ySpec: value75.y
              });
            }
            if (value72) {
              current2.frameId = value72.id, current2.baseFrame = value72, current2.xSpec = value72.x, current2.ySpec = value72.y;
              let value74 = value70.plucked.find((input2) => input2.frame === value72)?.path ?? value69.dragPath ?? [value69.dragIndex], value75 = value69.deep.find((input2) => (0, runtime2.nodePathsEqual)(input2.path, value74)) ?? (value74.length === 1 ? value69.children[value74[0]] : void 0);
              value75 && (current2.startRect = value75.rect);
              let value76 = value71[value74[0]], value77 = ["x", "y"].filter((input2) => value73 && (0, runtime2.styleHasVisiblePaint)(value73.node.style) && value73[input2].anchor !== "fill" && value73[input2].size === void 0), value78 = value69.keep ? (0, runtime2.frameById)(applyBase2, value69.frameId) : void 0, value79 = value73 && value74.length > 1 ? (0, runtime2.nodeAtPath)(value73.node, [value74[0]]) : void 0, callback88 = (input2) => input2.filter((input3) => input3[0] === value74[0]).map((input3) => input3.slice(1)), value80 = value73 && value78 ? reparentExtractedFlowNode(value73.node, value78.node, value74, value70.plucked, value70.pruned) : value79 && value76 ? reparentExtractedFlowNode(value79, value76.node, value74.slice(1), callback88(value70.plucked.map((input2) => input2.path)).map((input2) => ({
                path: input2
              })), callback88(value70.pruned)) : null;
              if (value80) {
                let value81 = value78 ? [] : [value74[0]], value82 = (0, runtime2.nodeAtPath)(value78 ? value73.node : value79, value80.before), value83 = value82?.kind === "stack" ? value82.dir : "grid", value84 = value80.stay.map((input2) => callback39(value69.frameId, [...value81, ...value80.before, input2], current2.k));
                current2.origin = {
                  frameId: value78 ? value69.frameId : value76.id,
                  path: value80.path,
                  index: value80.index,
                  dir: value83,
                  pinned: value78 ? value77 : [],
                  rests: value84,
                  had: value80.had
                };
              }
            }
            if (value73) {
              let value74 = (0, runtime2.nodeChildren)(value73.node) ?? [], items = [
                ...value70.plucked.map((input2) => input2.path),
                ...value70.pruned
              ], callback88 = (items2) => new Set(items.filter((items3) => items3.length === items2.length + 1 && (0, runtime2.nodePathsEqual)(items3.slice(0, -1), items2)).map((input2) => input2[items2.length]));
              value69.keep && !(0, runtime2.styleHasVisiblePaint)(value73.node.style) && current2.sheds.push({
                frameId: value69.frameId,
                kids: value74,
                gone: callback88([]),
                rects: value69.children.map((input2) => input2.rect)
              });
              for (let value75 of new Set(value70.plucked.map((input2) => input2.path[0]))) {
                let value76 = value71[value75], value77 = value74[value75];
                !value76 || !value77 || !(0, runtime2.isFlowContainer)(value77) || (0, runtime2.styleHasVisiblePaint)(value77.style) || current2.sheds.push({
                  frameId: value76.id,
                  kids: value77.children,
                  gone: callback88([value75]),
                  rects: value77.children.map((input2, options) => callback39(value69.frameId, [value75, options], current2.k))
                });
              }
            }
            current2.siblingRects = current2.siblingRects.concat(getRemainingFlowChildRects(value69));
          }
          if (flag) {
            current2.applyBase = applyBase2, current2.candidates = (0, runtime2.buildSiblingSnapCandidates)(current2.siblingRects);
            let value69 = callback79(current2, applyBase2);
            current2.preview = value69 ? {
              slide: setFlowInsertionSize(applyBase2, value69.target, value69.extent, value69.ghost),
              target: value69.target
            } : null;
            let value70 = current2.preview?.slide ?? null;
            runtime2.FrameViewportReactDom.flushSync(() => {
              callback31(applyBase2), setDragPreviewSlide(value70);
            }), onSelectionChange([
              ...current2.extras.map((input2) => ({
                frameId: input2.frameId
              })),
              {
                frameId: current2.frameId
              }
            ]), current2.clickSelect = null;
          }
        }
        if (current2.kind === "flow-resize") {
          let value69 = value59, value70 = value60;
          (current2.rotation !== 0 || current2.nodeScale !== 1) && ({ dx: value69, dy: value70 } = (0, runtime2.screenDeltaToLocalDelta)(value59, value60, current2.rotation, current2.nodeScale));
          let state2 = {
            xEdge: current2.xEdge,
            yEdge: current2.yEdge,
            dx: value69,
            dy: value70,
            w: current2.w,
            h: current2.h,
            mainAxis: current2.mainAxis
          };
          input.shiftKey && current2.xEdge && current2.yEdge && (state2 = {
            ...state2,
            ...(0, runtime2.aspectRatioResizeDeltas)(state2, Math.min(current2.minW, current2.minH))
          });
          let value71 = (0, runtime2.updateSelectedNode)(current2.before, (0, runtime2.createNodeSelection)(current2.frameId, current2.path), (input2) => (0, runtime2.resizeNodeFromEdges)(input2, state2, current2.minW, current2.minH)), breakout = current2.breakout;
          if (breakout === null) {
            callback31(value71), refreshMeasurements((input2) => input2 + 1);
            return;
          }
          runtime2.FrameViewportReactDom.flushSync(() => callback31(value71));
          let value72 = callback39(current2.frameId, current2.path, current2.k);
          if (value72 === null || flowRectsAligned(breakout.rect, value72, current2.xEdge, current2.yEdge)) {
            refreshMeasurements((input2) => input2 + 1);
            return;
          }
          let value73 = extractFlowDragSelection(current2.before, breakout.record);
          if (!value73?.drag || value73.slide.frames.length > runtime2.maxSlideFrames) {
            value73?.drag && (0, runtime2.showToast)(SLIDE_FULL_MESSAGE), current2.breakout = null, refreshMeasurements((input2) => input2 + 1);
            return;
          }
          dragSessionRef.current = {
            kind: "resize",
            frameId: value73.drag.id,
            pointerId: current2.pointerId,
            type: current2.type,
            k: current2.k,
            downX: current2.downX,
            downY: current2.downY,
            startX: current2.startX,
            startY: current2.startY,
            before: current2.before,
            applyBase: value73.slide,
            xSpec: value73.drag.x,
            ySpec: value73.drag.y,
            xEdge: current2.xEdge,
            yEdge: current2.yEdge,
            w: breakout.rect.w,
            h: breakout.rect.h,
            rotation: 0,
            nodeScale: 1,
            moved: !0,
            startRect: breakout.rect,
            candidates: (0, runtime2.buildSiblingSnapCandidates)(breakout.siblingRects)
          }, onSelectionChange([
            {
              frameId: value73.drag.id
            }
          ]), callback85(input);
          return;
        }
        let applyBase = current2.applyBase, value65 = (0, runtime2.frameById)(applyBase, current2.frameId) ?? (current2.kind === "move" ? current2.baseFrame : void 0);
        if (!value65)
          return;
        let value66 = input.metaKey || input.ctrlKey, value67 = 8 / current2.k, value68;
        if (current2.kind === "move") {
          current2.type === "touch" && applyTouchLiftRef.current(current2), current2.at = {
            x: input.clientX,
            y: input.clientY
          };
          let value69 = value66 ? null : callback78(current2, input.clientX, input.clientY);
          if (value66 || value69)
            current2.lastSnaps = {}, setSnapGuides([]);
          else {
            let value71 = (0, runtime2.snapMovingRectangle)(current2.startRect, value59, value60, current2.candidates, value67, {
              x: current2.xSpec.anchor !== "fill",
              y: current2.ySpec.anchor !== "fill"
            });
            value59 = value71.dx, value60 = value71.dy, current2.lastSnaps = (0, runtime2.nodeTransform)(value65.node) === void 0 ? value71.snaps : {}, setSnapGuides(value71.guides);
          }
          let moveSession = current2;
          moveSession.movers ??= [
            moveSession.startRect,
            ...moveSession.extras.map((extra) => callback39(extra.frameId, [], moveSession.k) ?? (0, runtime2.frameBounds)(extra.xSpec, extra.ySpec))
          ];
          let clamped = (0, runtime2.clampMoveDeltaToSlide)(moveSession.movers, value59, value60);
          (clamped.dx !== value59 || clamped.dy !== value60) && ({ dx: value59, dy: value60 } = clamped, current2.lastSnaps = {}, setSnapGuides([])), value68 = {
            ...value65,
            x: (0, runtime2.moveAxisSpecPreservingSize)(current2.xSpec, value59, current2.autoW.get(current2.frameId), runtime2.SLIDE_WIDTH),
            y: (0, runtime2.moveAxisSpec)(current2.ySpec, value60)
          };
          let value70 = (0, runtime2.updateSlideFrame)(current2.applyBase, current2.frameId, () => value68);
          for (let value71 of current2.extras)
            value70 = (0, runtime2.updateSlideFrame)(value70, value71.frameId, (input2) => ({
              ...input2,
              x: (0, runtime2.moveAxisSpecPreservingSize)(value71.xSpec, value59, current2.autoW.get(value71.frameId), runtime2.SLIDE_WIDTH),
              y: (0, runtime2.moveAxisSpec)(value71.ySpec, value60)
            }));
          current2.last = {
            slide: value70,
            frame: value68
          }, callback81(current2, value69, value66), value64 && current2.altDup && onSelectionChange([
            ...current2.extras.map((input2) => ({
              frameId: input2.frameId
            })),
            {
              frameId: current2.frameId
            }
          ]);
        } else {
          let value69 = current2.rotation === 0 && current2.nodeScale === 1;
          value69 || ({ dx: value59, dy: value60 } = (0, runtime2.screenDeltaToLocalDelta)(value59, value60, current2.rotation, current2.nodeScale));
          let items = [];
          if (!value66 && value69) {
            let value71 = (0, runtime2.snapResizingRectangle)(current2.startRect, current2.xEdge, current2.yEdge, value59, value60, current2.candidates, value67);
            value59 = value71.dx, value60 = value71.dy, items = value71.guides;
          }
          let value70 = runtime2.GROUP_RESIZING_ENABLED ? (0, runtime2.measureOverlayGroupLayout)(value65) : void 0;
          if (input.shiftKey && current2.xEdge && current2.yEdge) {
            let value71 = (0, runtime2.aspectRatioAxisResizeDeltas)({
              spec: current2.xSpec,
              edge: current2.xEdge,
              delta: value59,
              currentSize: current2.w,
              designSize: runtime2.SLIDE_WIDTH
            }, {
              spec: current2.ySpec,
              edge: current2.yEdge,
              delta: value60,
              currentSize: current2.h,
              designSize: runtime2.SLIDE_HEIGHT
            }, Math.max(value70?.w ?? 0, value70?.h ?? 0, Math.min((0, runtime2.minimumNodeResizeSize)(value65.node, current2.w), (0, runtime2.minimumNodeResizeSize)(value65.node, current2.h))));
            items = items.filter((input2) => Math.abs(input2.axis === "x" ? value71.dx - value59 : value71.dy - value60) < 0.5), value59 = value71.dx, value60 = value71.dy;
          }
          if (setSnapGuides(items), value68 = {
            ...value65,
            x: current2.xEdge ? (0, runtime2.resizeAxisSpec)(current2.xSpec, current2.xEdge, value59, current2.w, runtime2.SLIDE_WIDTH, Math.max(value70?.w ?? 0, (0, runtime2.minimumNodeResizeSize)(value65.node, current2.w))) : current2.xSpec,
            y: current2.yEdge ? (0, runtime2.resizeAxisSpec)(current2.ySpec, current2.yEdge, value60, current2.h, runtime2.SLIDE_HEIGHT, Math.max(value70?.h ?? 0, (0, runtime2.minimumNodeResizeSize)(value65.node, current2.h))) : current2.ySpec
          }, !value69) {
            let value71 = (0, runtime2.transformPositionCompensation)((0, runtime2.axisSpecCenter)(value68.x, runtime2.SLIDE_WIDTH, current2.w) - (0, runtime2.axisSpecCenter)(current2.xSpec, runtime2.SLIDE_WIDTH, current2.w), (0, runtime2.axisSpecCenter)(value68.y, runtime2.SLIDE_HEIGHT, current2.h) - (0, runtime2.axisSpecCenter)(current2.ySpec, runtime2.SLIDE_HEIGHT, current2.h), current2.rotation, current2.nodeScale);
            value68 = {
              ...value68,
              x: (0, runtime2.moveFillAxisAsPinned)(value68.x, value71.dx, runtime2.SLIDE_WIDTH),
              y: (0, runtime2.moveFillAxisAsPinned)(value68.y, value71.dy, runtime2.SLIDE_HEIGHT)
            };
          }
          runtime2.GROUP_RESIZING_ENABLED && (value68 = (0, runtime2.scaleLeadingOverlayGroup)(value65, value68) ?? value68), callback31((0, runtime2.updateSlideFrame)(current2.applyBase, current2.frameId, () => value68));
        }
        refreshMeasurements((input2) => input2 + 1);
      }, callback86 = (input) => {
        let current = touchPressRef.current;
        if (current !== null && current.pointerId === input.pointerId && input.isTrusted) {
          let value59 = (0, runtime2.reduceTouchLongPress)(current, {
            kind: input.type === "pointercancel" ? "cancel" : "up"
          }, pointerDragThreshold("touch"));
          callback50(), value59.outcome === "tap" && callback83(current);
        }
        let current2 = dragSessionRef.current;
        !current2 || input.pointerId !== current2.pointerId || (dragSessionRef.current = null, setSnapGuides([]), input.type === "pointercancel" && (current2.kind === "move" || current2.kind === "layer-move") && (current2.clickSelect = null, current2.kind === "move" && (current2.drop = null)), callback82(current2, !1));
      }, callback87 = (input) => {
        let current = dragSessionRef.current;
        if (current?.kind === "endpoint" && current.moved && current.last !== null && (input.key === "Meta" || input.key === "Control" || input.key === "Shift")) {
          callback84(current, current.last.dx, current.last.dy, input.metaKey || input.ctrlKey, input.shiftKey);
          return;
        }
        if (current?.kind !== "move" || !current.moved || current.at === null || input.key !== "Meta" && input.key !== "Control")
          return;
        let value59 = input.type === "keydown" || input.metaKey || input.ctrlKey;
        value59 && current.drop === null && current.preview === null || (callback81(current, value59 ? null : callback78(current, current.at.x, current.at.y), value59), refreshMeasurements((input2) => input2 + 1));
      };
      return window.addEventListener("pointermove", callback85), window.addEventListener("pointerup", callback86), window.addEventListener("pointercancel", callback86), window.addEventListener("keydown", callback87), window.addEventListener("keyup", callback87), () => {
        window.removeEventListener("keydown", callback87), window.removeEventListener("keyup", callback87), window.removeEventListener("pointermove", callback85), window.removeEventListener("pointerup", callback86), window.removeEventListener("pointercancel", callback86);
      };
    }, [callback31, onGestureEnd, onSelectionChange, onTextEdit, dragLiveRef]), runtime2.reactK_.useEffect(() => runtime2.clearGestureCursor, []), runtime2.reactK_.useEffect(() => {
      let current = stageRef.current;
      if (current === null)
        return;
      let flag = !1, value59 = (0, runtime2.attachViewportGestures)({
        element: current,
        getView: () => ref8.current,
        setView: (input) => {
          if (input === ref8.current)
            return;
          let current2 = ref8.current;
          if (!(current2.scale <= 0) && !(touchPressRef.current?.selected === !0 && !touchPressRef.current.popped && input.scale === current2.scale)) {
            if ((!ref7.current || ref3.current !== null || ref.current?.kept === !1) && input.scale === current2.scale) {
              let value60 = Date.now();
              ref11.current.size === 0 && value60 - ref10.current > 400 && (ref9.current = {
                dx: 0,
                dy: 0
              }), ref10.current = value60, ref9.current.dx += (input.x - current2.x) * current2.scale, ref9.current.dy += (input.y - current2.y) * current2.scale;
              let value61 = Math.abs(ref9.current.dx) + Math.abs(ref9.current.dy), text = "mouse";
              for (let value62 of ref11.current.values())
                text = value62;
              if (value61 < pointerDragThreshold(text))
                return;
              input = {
                x: current2.x + ref9.current.dx / current2.scale,
                y: current2.y + ref9.current.dy / current2.scale,
                scale: current2.scale
              };
            }
            if (input = callback(input, ref24.current), input.x === current2.x && input.y === current2.y && input.scale === current2.scale) {
              ref9.current = {
                dx: 0,
                dy: 0
              };
              return;
            }
            ref9.current = {
              dx: 0,
              dy: 0
            }, callback2(), ref7.current = !0, ref6.current = input, ref8.current = input, setManualViewport(input);
          }
        },
        onGestureEnd: () => {
          ref11.current.clear(), ref9.current = {
            dx: 0,
            dy: 0
          }, flag && (flag = !1, (0, runtime2.clearGestureCursor)());
        },
        limits: ref17.current,
        shouldPan: (event) => {
          if (callback21(event.target))
            return !1;
          let current2 = dragSessionRef.current;
          if (current2?.moved === !0 && !(event.pointerType !== current2.type || event.isPrimary))
            return !1;
          if (isAdditionalTouchPointer(ref12.current, event))
            return ref11.current.set(event.pointerId, event.pointerType), !0;
          let value60 = event.target?.closest?.("[data-mc-chrome]") != null;
          if (event.button === 1 && !value60)
            return ref11.current.set(event.pointerId, event.pointerType), flag = !0, (0, runtime2.setGestureCursor)("grabbing"), !0;
          let value61 = isFrameOrResizeTarget(event.target) || value60;
          if (!(ref5.current && !pointInsideSlide(event.clientX, event.clientY)) && canStartCanvasRectSelection({
            pointerType: event.pointerType,
            button: event.button,
            surface: value61 ? "object" : "empty",
            textEdit: ref26.current !== null
          }))
            return !1;
          if ((0, runtime2.canEditAfterTouchLongPress)({
            pointerType: event.pointerType,
            editTarget: value61,
            onHandle: event.target?.closest?.("[data-resize-handle], [data-video-control]") != null,
            textEdit: ref26.current !== null
          }))
            return ref11.current.set(event.pointerId, event.pointerType), !0;
          let value62 = canStartCanvasPinch({
            dragActive: !1,
            editTarget: value61
          });
          return value62 && ref11.current.set(event.pointerId, event.pointerType), value62;
        }
      }), callback77 = (input) => {
        let flag2 = !1;
        if (input.pointerType === "touch") {
          if (input.isPrimary) {
            ref12.current.clear(), ref13.current.clear();
            for (let [value60, value61] of ref11.current)
              value60 !== input.pointerId && value61 === "touch" && ref11.current.delete(value60);
          }
          if (isAdditionalTouchPointer(ref12.current, input)) {
            flag2 = !0, ref13.current.add(input.pointerId), ref14.current = null, callback50();
            let current3 = dragSessionRef.current;
            current3 !== null && (current3.kind === "move" || current3.kind === "layer-move") && (current3.clickSelect = null);
          }
          ref12.current.add(input.pointerId);
        }
        let current2 = dragSessionRef.current;
        !flag2 && current2 !== null && (input.isPrimary || input.pointerType !== current2.type) && (dragSessionRef.current = null, ref49.current(current2)), dragSessionRef.current === null && endViewportGestureRef.current(), [...ref11.current.keys()].some((input2) => input2 !== input.pointerId) || (ref9.current = {
          dx: 0,
          dy: 0
        });
      }, callback78 = (input) => {
        input.isTrusted && (ref12.current.delete(input.pointerId), ref13.current.delete(input.pointerId));
      };
      return current.addEventListener("pointerdown", callback77), window.addEventListener("pointerup", callback78), window.addEventListener("pointercancel", callback78), () => {
        current.removeEventListener("pointerdown", callback77), window.removeEventListener("pointerup", callback78), window.removeEventListener("pointercancel", callback78), value59.destroy();
      };
    }, []), runtime2.reactK_.useEffect(() => {
      let callback77 = () => {
        let current = dragSessionRef.current;
        dragSessionRef.current = null, callback50(), ref12.current.clear(), ref13.current.clear(), ref11.current.clear(), ref14.current = null, ref9.current = {
          dx: 0,
          dy: 0
        }, ref15.current = null, value3(null), setSnapGuides([]), current !== null && ref49.current(current);
      }, callback78 = () => {
        document.visibilityState === "hidden" && callback77();
      }, callback79 = (event) => {
        if (event.key === "Escape" && ref16.current()) {
          event.preventDefault(), event.stopPropagation();
          return;
        }
        let current = dragSessionRef.current;
        event.key !== "Escape" || current === null || !current.moved || (event.preventDefault(), event.stopPropagation(), dragSessionRef.current = null, slideRef.current === ref51.current ? ref50.current(current) : ref49.current(current));
      };
      return window.addEventListener("blur", callback77), document.addEventListener("visibilitychange", callback78), window.addEventListener("keydown", callback79, !0), () => {
        window.removeEventListener("blur", callback77), document.removeEventListener("visibilitychange", callback78), window.removeEventListener("keydown", callback79, !0);
      };
    }, []), runtime2.reactK_.useEffect(() => {
      if (!readOnly)
        return;
      let current = dragSessionRef.current;
      current !== null && (dragSessionRef.current = null, clearTouchLiftRef.current(), dragLiveRef && (dragLiveRef.current = !1), setSnapGuides([]), setDragPreviewSlide(null), (0, runtime2.clearGestureCursor)(), setRotationPreviewAngle(null), setEndpointSnapPoint(null), onLiveChange(current.before));
    }, [readOnly, onLiveChange, dragLiveRef]);
    let callback32 = (input) => {
      if (input <= 0)
        return null;
      let value59 = (0, runtime2.countSlideTableCells)(slide);
      return value59 + input > runtime2.maxSlideTableCells ? (0, runtime2.formatMessage)({
        defaultMessage: "此页的表格单元格数已达上限，请先删除部分单元格。",
        id: "UVm+/hU/6M"
      }) : (deckCellCount !== void 0 && Number.isFinite(deckCellCount) ? deckCellCount : value59) + input > runtime2.maxDeckTableCells ? (0, runtime2.formatMessage)({
        defaultMessage: "此演示文稿的表格单元格数已达上限，请先删除部分单元格。",
        id: "LaV+ulhUKP"
      }) : null;
    }, callback33 = (input) => {
      let value59 = (0, runtime2.countSlideTableCells)(slide), value60 = deckCellCount !== void 0 && Number.isFinite(deckCellCount) ? deckCellCount : value59, value61 = Math.min(runtime2.maxSlideTableCells - value59, runtime2.maxDeckTableCells - value60);
      return Math.max(0, Math.floor(value61 / Math.max(1, input)));
    }, callback34 = (input, options, context, value59) => {
      let value60 = frameElementsRef.current.get(options)?.getBoundingClientRect(), value61 = slideSurfaceRef.current?.getBoundingClientRect(), value62 = (0, runtime2.updateSlideFrame)(input, options, (input2) => ({
        ...input2,
        node: (0, runtime2.updateNodeAtPath)(input2.node, context, (source) => source.kind === "table" ? value59(source) : source)
      }));
      runtime2.FrameViewportReactDom.flushSync(() => onLiveChange(value62));
      let value63 = frameElementsRef.current.get(options)?.getBoundingClientRect(), value64 = (0, runtime2.frameById)(value62, options);
      if (value60 && value63 && value61 && value64 && scale > 0) {
        let callback77 = (input2, options2, context2, value67, extra, detail) => {
          let value68 = context2 >= 0 && context2 + extra <= detail, value69 = Math.floor(detail - extra);
          if (input2.anchor === "fill")
            return input2;
          if (input2.anchor === "leading")
            return value68 || !value67 ? input2 : {
              ...input2,
              margin: Math.max(0, value69)
            };
          if (Math.abs(options2) < 0.5 || input2.anchor === "trailing" && !value68)
            return input2;
          let value70 = Math.max(0, value67 ? Math.min(context2, value69) : context2);
          return {
            ...input2,
            anchor: "leading",
            margin: value70,
            offset: 0
          };
        }, value65 = callback77(value64.x, value60.left - value63.left, Math.round((value60.left - value61.left) / scale), value63.width > value60.width + 0.5, value63.width / scale, runtime2.SLIDE_WIDTH), value66 = callback77(value64.y, value60.top - value63.top, Math.round((value60.top - value61.top) / scale), value63.height > value60.height + 0.5, value63.height / scale, runtime2.SLIDE_HEIGHT);
        (value65 !== value64.x || value66 !== value64.y) && onLiveChange((0, runtime2.updateSlideFrame)(value62, options, (input2) => ({
          ...input2,
          x: value65,
          y: value66
        })));
      }
      onGestureEnd(input);
    }, callback35 = (items) => {
      if (slide.frames.length + items.length > runtime2.maxSlideFrames)
        return (0, runtime2.formatMessage)({
          defaultMessage: "此页已满，请先移除一个元素。",
          id: "rVJPt03VKF"
        });
      let value59 = items.reduce((input, options) => input + (0, runtime2.countNodeEmbeds)(options), 0);
      return value59 > 0 && (0, runtime2.countSlideEmbeds)(slide) + value59 > runtime2.maxSlideHtmlEmbeds ? (0, runtime2.formatMessage)({
        defaultMessage: "此页的网页嵌入内容已达上限（{max} 个），请先移除一个。",
        id: "q9dWZ6pp6V"
      }, { max: runtime2.maxSlideHtmlEmbeds }) : callback32(items.reduce((input, options) => input + (0, runtime2.countNodeTableCells)(options), 0));
    }, callback36 = (input) => {
      let entry = frameElementsRef.current.get(input), value59 = (0, runtime2.frameById)(slide, input), value60 = value59 !== void 0 ? (0, runtime2.nodeChildren)(value59.node) : void 0;
      if (!entry || !value59 || value60 === void 0)
        return null;
      let value61 = entry.offsetParent?.getBoundingClientRect();
      if (!value61)
        return null;
      let items = [];
      for (let index4 = 0; index4 < value60.length; index4++) {
        let element = entry.querySelector('[data-node-path="' + String(index4) + '"]');
        if (!element)
          return null;
        let bounds = element.getBoundingClientRect();
        items.push({
          rect: {
            x: (bounds.left - value61.left) / scale,
            y: (bounds.top - value61.top) / scale,
            w: bounds.width / scale,
            h: bounds.height / scale
          }
        });
      }
      return items;
    }, callback37 = (input) => {
      let value59 = input ? parseFloat(getComputedStyle(input).width) : NaN;
      if (value59 > 0)
        return value59;
    }, callback38 = (input, options = (input2) => input2.id) => {
      let entries = /* @__PURE__ */ new Map();
      for (let value59 of input) {
        let value60 = !(0, runtime2.isTextNode)(value59.node) || value59.x.anchor === "fill" || value59.x.size !== void 0 ? void 0 : callback37(frameElementsRef.current.get(options(value59)));
        value60 !== void 0 && entries.set(value59.id, value60);
      }
      return entries;
    }, callback39 = (input, options, context = scale) => {
      let entry = frameElementsRef.current.get(input), value59 = entry?.offsetParent, value60 = entry?.querySelector('[data-node-path="' + options.join(".") + '"]');
      if (!entry || !value59 || !value60 || !(context > 0))
        return null;
      let bounds = value59.getBoundingClientRect(), value61 = getUnliftedBoundingClientRect(value60);
      return {
        x: (value61.left - bounds.left) / context,
        y: (value61.top - bounds.top) / context,
        w: value61.width / context,
        h: value61.height / context
      };
    }, callback40 = (input, options, context, value59) => {
      let current = stageRef.current;
      if (!current)
        return;
      callback8();
      let bounds = current.getBoundingClientRect();
      ref15.current = {
        pointerId: input.pointerId,
        sx: input.clientX,
        sy: input.clientY,
        ox: bounds.left,
        oy: bounds.top,
        live: !1,
        lastKey: null,
        base: context,
        prev: [...selection],
        clickSelect: value59
      }, options.setPointerCapture(input.pointerId);
    };
    ref16.current = () => {
      let current = ref15.current;
      return current === null || !current.live ? !1 : (ref15.current = null, ref14.current?.pointerId === current.pointerId && (ref14.current = null), value3(null), onSelectionChange(current.prev), !0);
    };
    let callback41 = () => {
      let items = [], value59 = (0, runtime2.slidePrimaryLayoutFrame)(slide)?.id, callback77 = (input) => ({
        x: input.left,
        y: input.top,
        w: input.width,
        h: input.height
      });
      for (let value60 of slide.frames) {
        let id = value60.id, entry = frameElementsRef.current.get(id);
        if (!(entry === void 0 || (0, runtime2.isEmptyBackgroundFrame)(value60))) {
          if (id !== value59) {
            items.push({
              unit: {
                frameId: id
              },
              rect: callback77(getFrameTransformScreenRect(slide, id, entry))
            });
            continue;
          }
          for (let value61 of (0, runtime2.collectMarqueeSelection)(id, value60.node)) {
            let element = entry.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(value61).join(".") + '"]');
            element && items.push({
              unit: value61,
              rect: callback77(element.getBoundingClientRect())
            });
          }
        }
      }
      return items;
    }, callback42 = () => {
      if (ref26.current === null)
        return !0;
      let value59 = slideSurfaceRef.current?.querySelector("[data-text-path][contenteditable], [data-cell][contenteditable]") ?? null;
      return value59 === null ? (runtime2.FrameViewportReactDom.flushSync(() => onTextEdit(null)), ref26.current === null) : (document.activeElement !== value59 && runtime2.FrameViewportReactDom.flushSync(() => value59.focus({
        preventScroll: !0
      })), runtime2.FrameViewportReactDom.flushSync(() => value59.blur()), ref26.current === null);
    }, callback43 = (input, event) => {
      if (ref13.current.has(event.pointerId))
        return;
      if (plainPressRef.current = !(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey), textEdit) {
        if (event.pointerType === "touch") {
          let value60 = (0, runtime2.frameById)(slide, input), value61 = value60 !== void 0 && !(0, runtime2.isEmptyBackgroundFrame)(value60) ? (0, runtime2.resolvePaintedSelection)(input, value60.node, parseEditorNodePath(event.target?.closest?.("[data-node-path]")?.getAttribute("data-node-path"))) : null;
          value61 !== null && (0, runtime2.selectionKey)(value61) !== (0, runtime2.selectionKey)((0, runtime2.createNodeSelection)(textEdit.frameId, textEdit.path)) && (ref2.current = performance.now());
        }
        if (event.pointerType === "touch" || event.button !== 0 || (0, runtime2.isMacControlClick)(event) || !callback42())
          return;
        beginPanRef.current(input, event);
        return;
      }
      event.stopPropagation();
      let value59 = (0, runtime2.snapshotPointerEvent)(event);
      if ((0, runtime2.canStartTouchLongPress)(value59)) {
        callback57(input, value59);
        return;
      }
      (0, runtime2.isMacControlClick)(event) || !(0, runtime2.startCanvasDrag)(event) || callback47(input, value59);
    }, callback44 = (input, event) => {
      let value59 = parseEditorNodePath(event.target?.closest?.("[data-node-path]")?.getAttribute("data-node-path")), value60 = (0, runtime2.resolvePointerSelection)(input.id, input.node, value59, selection, getFrameHitTestOptions(slide, input)), value61 = event.shiftKey || event.ctrlKey || event.metaKey, value62 = slideSurfaceRef.current?.getBoundingClientRect(), value63 = value62 !== void 0 ? resolveSelectionDragHit({
        selection,
        selRects: selectionRects,
        unit: value60.grab,
        toggle: value61,
        x: (event.clientX - value62.left) / scale,
        y: (event.clientY - value62.top) / scale
      }) : null;
      return {
        pressed: value60,
        toggle: value61,
        redirect: value63
      };
    }, callback45 = (input) => {
      let value59 = (0, runtime2.frameById)(slide, input.frameId), value60 = (0, runtime2.selectionNodePath)(input);
      if (value59 === void 0 || value60.length > 1)
        return !1;
      if (value60.length === 0)
        return value59.x.anchor === "fill" && value59.y.anchor === "fill";
      let value61 = (0, runtime2.isOverlayNode)(value59.node) ? value59.node.layers[(value60[0] ?? 0) - 1] : void 0;
      return value61 !== void 0 && value61.x.anchor === "fill" && value61.y.anchor === "fill";
    }, callback46 = (input, options) => {
      let value59 = (0, runtime2.frameById)(slide, input);
      if (!value59)
        return !1;
      let { pressed: value60, toggle: value61, redirect: value62 } = callback44(value59, options);
      return !value61 && (value62 !== null || value60.grab !== null && (0, runtime2.selectionContainsNode)(selection, value60.grab)) && !selection.every(callback45);
    }, callback47 = (input, event) => {
      pendingToggleFrameRef.current = pendingPlayClipRef.current = null, callback8();
      let value59 = (0, runtime2.frameById)(slide, input);
      if (!value59)
        return;
      let pressTarget = event.target, value60 = pressTarget.closest("a[data-drag-surface]") !== null ? Math.max(pointerDragThreshold(event.pointerType), runtime2.pointerClickMovementTolerance) : void 0, { pressed: value61, toggle: value62, redirect: value63 } = callback44(value59, event), grab = value61.grab, value64 = value63 !== null ? (0, runtime2.frameById)(slide, value63.unit.frameId) : void 0, entry = frameElementsRef.current.get(input);
      if (!(value63 !== null && value64 !== void 0) && (grab === null ? (0, runtime2.isPrimaryLayoutFrame)(slide, value59) : (0, runtime2.isEmptyBackgroundFrame)(value59)) && entry !== void 0 && canStartCanvasRectSelection({
        pointerType: event.pointerType,
        button: event.button,
        surface: "slide",
        textEdit: ref26.current !== null
      })) {
        callback40(event, entry, value62 ? [...selection] : [], grab === null ? value62 ? null : [] : value62 ? (0, runtime2.toggleNodeSelection)(selection, grab) : [grab]);
        return;
      }
      let value65 = grab, value66 = input, value67 = value59, value68, value69 = null;
      if (value63 !== null && value64 !== void 0)
        value65 = value63.unit, value66 = value64.id, value67 = value64, value68 = [...selection], value69 = value63.clickSelect;
      else if (grab === null)
        value68 = [], value69 = value62 ? null : [];
      else if (value62 && (0, runtime2.togglePointerSelection)(selection, value61) !== null) {
        onSelectionChange((0, runtime2.togglePointerSelection)(selection, value61) ?? []);
        return;
      } else if (value62) {
        if ((0, runtime2.selectionContainsNode)(selection, grab)) {
          onSelectionChange(selection.filter((input2) => !(0, runtime2.selectionsEqual)(input2, grab)));
          return;
        }
        value68 = [...selection, grab], onSelectionChange(value68);
      } else if ((0, runtime2.selectionContainsNode)(selection, grab)) {
        value68 = [
          ...selection.filter((input2) => !(0, runtime2.selectionsEqual)(input2, grab)),
          grab
        ], selection.length > 1 && (value69 = [grab]);
        let value71 = (0, runtime2.selectedNode)(slide, grab);
        selection.length === 1 && value71?.kind, onSelectionChange(value68);
      } else
        value68 = [grab], onSelectionChange(value68);
      let playElement, playKey = playElement != null ? (playElement.closest("[data-frame-id]")?.getAttribute("data-frame-id") ?? input) + "/" + (playElement.getAttribute("data-img-path") ?? "") : null, playHandle;
      if (playHandle !== void 0 && playHandle.openLabel === void 0 && (pendingPlayClipRef.current = playKey), !value62 && value61.tap !== null && grab !== null && !(0, runtime2.selectionsEqual)(value61.tap, grab) && (value69 = [value61.tap]), readOnly) {
        value69 !== null && onSelectionChange(value69), togglePendingFrame();
        return;
      }
      if (event.altKey && value65 !== null) {
        let value71 = value65, value72 = callback26(value66);
        if (!value72)
          return;
        let value73 = deleteSelectedUnits(slide, value68, (input2) => callback39(input2.frameId, (0, runtime2.selectionNodePath)(input2))), value74 = value73.find((input2) => (0, runtime2.selectionsEqual)(input2.unit, value71)) ?? value73.find((input2) => input2.unit.frameId === value66 && (input2.rect === void 0 || isStrictPathAncestor((0, runtime2.selectionNodePath)(input2.unit), (0, runtime2.selectionNodePath)(value71)))), value75 = value73.map((input2) => input2.copy.node), value76 = value74 ? callback35(value75) : null;
        if (value76 !== null && (0, runtime2.showToast)(value76), !value74 || value76 !== null || withinStyleBudget?.(value75) === !1) {
          value69 !== null && onSelectionChange(value69);
          return;
        }
        let value77 = value73.map((input2) => input2.copy), value78 = value77.filter((input2) => input2 !== value74.copy);
        event.pointerType !== "touch" && (0, runtime2.setGestureCursor)("copy");
        let items3 = [
          ...value72.siblingRects,
          value72.startRect,
          ...value71.child !== void 0 ? (callback36(value66) ?? []).map((input2) => input2.rect) : [],
          ...value73.flatMap((input2) => input2.rect ? [input2.rect] : [])
        ];
        dragSessionRef.current = {
          kind: "move",
          frameId: value74.copy.id,
          pointerId: event.pointerId,
          type: event.pointerType,
          slop: value60,
          k: ref8.current.scale,
          downX: event.clientX,
          downY: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          before: slide,
          applyBase: {
            ...slide,
            frames: [...slide.frames, ...value77]
          },
          baseFrame: value74.copy,
          xSpec: value74.copy.x,
          ySpec: value74.copy.y,
          autoW: callback38(value77, (input2) => value73.find((input3) => input3.copy === input2)?.unit.frameId ?? input2.id),
          moved: !1,
          altDup: !0,
          pendingBreakouts: [],
          extras: value78.map((input2) => ({
            frameId: input2.id,
            xSpec: input2.x,
            ySpec: input2.y
          })),
          movers: value73.map((input2) => input2.rect ?? callback39(input2.unit.frameId, []) ?? (0, runtime2.frameBounds)(input2.copy.x, input2.copy.y)),
          clickSelect: value69,
          startRect: value74.rect ?? (value74.copy.node.kind === "text" && value74.copy.y.size === void 0 ? callback39(value66, []) : null) ?? value72.startRect,
          siblingRects: items3,
          candidates: (0, runtime2.buildSiblingSnapCandidates)(items3),
          lastSnaps: {},
          last: null,
          origin: null,
          lifted: /* @__PURE__ */ new Map(),
          sheds: [],
          drop: null,
          preview: null,
          restore: null,
          at: null
        };
        return;
      }
      if (value65 !== null && value65.child !== void 0 && value65.child >= 1 && (0, runtime2.isOverlayNode)(value67.node) && value65.child - 1 < value67.node.layers.length) {
        let entry2 = frameElementsRef.current.get(value66), value71 = entry2?.offsetParent, value72 = entry2?.querySelector('[data-overlay-layer="' + String(value65.child) + '"]');
        if (entry2 && value71 && value72) {
          let bounds = value71.getBoundingClientRect(), bounds2 = entry2.getBoundingClientRect(), bounds3 = value72.getBoundingClientRect(), value73 = value67.node.layers[value65.child - 1];
          dragSessionRef.current = {
            kind: "layer-move",
            frameId: value66,
            layerIndex: value65.child - 1,
            pointerId: event.pointerId,
            type: event.pointerType,
            slop: value60,
            k: ref8.current.scale,
            downX: event.clientX,
            downY: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            lastDx: 0,
            lastDy: 0,
            clickSelect: value69,
            before: slide,
            xSpec: value73.x,
            ySpec: value73.y,
            autoW: (0, runtime2.isTextNode)(value73.node) ? callback37(value72) : void 0,
            roomW: value72.offsetParent?.clientWidth ?? bounds2.width / scale,
            wrapperRect: {
              x: (bounds2.left - bounds.left) / scale,
              y: (bounds2.top - bounds.top) / scale,
              w: bounds2.width / scale,
              h: bounds2.height / scale
            },
            layerRect: {
              x: (bounds3.left - bounds.left) / scale,
              y: (bounds3.top - bounds.top) / scale,
              w: bounds3.width / scale,
              h: bounds3.height / scale
            },
            ...!runtime2.GROUP_MEMBER_SIZES_FROM_MODEL && (0, runtime2.isLeadingOverlayGroup)(value67) ? {
              memberSizes: value67.node.layers.map((input2, options) => memo4.rect((0, runtime2.createNodeSelection)(value66, [
                options + 1
              ])))
            } : {},
            moved: !1
          };
          return;
        }
      }
      let entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map();
      for (let value71 of value68) {
        if (value71.child === void 0)
          continue;
        if (value71.path !== void 0) {
          let value74 = entries2.get(value71.frameId) ?? [];
          value74.push(value71.path), entries2.set(value71.frameId, value74);
          continue;
        }
        let value72 = (0, runtime2.frameById)(slide, value71.frameId);
        if (value72 !== void 0 && (0, runtime2.isOverlayNode)(value72.node) && !(value71.frameId === value66 && value65?.child === 0))
          continue;
        let value73 = entries.get(value71.frameId) ?? [];
        value73.push(value71.child), entries.set(value71.frameId, value73);
      }
      let values = new Set(value68.filter((input2) => input2.child === void 0 && input2.frameId !== value66).map((input2) => input2.frameId));
      for (let value71 of entries2.keys())
        entries.has(value71) || entries.set(value71, []);
      let values2 = /* @__PURE__ */ new Set([...values, ...entries.keys()]), value70 = callback26(value66, values2);
      if (!value70)
        return;
      let items = [];
      for (let [value71, value72] of entries) {
        let value73 = callback36(value71);
        if (!value73)
          continue;
        let state2 = {
          frameId: value71,
          children: value73,
          selectedChildren: value72.filter((input2) => input2 < value73.length),
          deep: (entries2.get(value71) ?? []).map((input2) => {
            let value75 = callback39(value71, input2);
            return value75 ? {
              path: input2,
              rect: value75
            } : null;
          }).filter((input2) => input2 !== null)
        };
        value65 !== null && value65.child !== void 0 && value71 === value66 && value65.child < value73.length && (state2.dragIndex = value65.child, value65.path !== void 0 && (state2.dragPath = value65.path));
        let value74 = (0, runtime2.frameById)(slide, value71), entry2 = frameElementsRef.current.get(value71);
        if (value74 && entry2) {
          let bounds = entry2.getBoundingClientRect(), value75 = entry2.offsetParent?.getBoundingClientRect() ?? bounds, state3 = {
            x: (bounds.left - value75.left) / scale,
            y: (bounds.top - value75.top) / scale,
            w: bounds.width / scale,
            h: bounds.height / scale
          };
          items.push(normalizeFlowDragExtraction(state2, value74, (0, runtime2.isPrimaryLayoutFrame)(slide, value74), state3));
        } else
          items.push(state2);
      }
      let items2 = [];
      for (let value71 of values) {
        let value72 = (0, runtime2.frameById)(slide, value71);
        value72 && items2.push({
          frameId: value71,
          xSpec: value72.x,
          ySpec: value72.y
        });
      }
      dragSessionRef.current = {
        kind: "move",
        frameId: value66,
        pointerId: event.pointerId,
        type: event.pointerType,
        slop: value60,
        k: ref8.current.scale,
        downX: event.clientX,
        downY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        before: slide,
        applyBase: slide,
        baseFrame: value67,
        xSpec: value67.x,
        ySpec: value67.y,
        autoW: callback38([
          value67,
          ...items2.flatMap((input2) => (0, runtime2.frameById)(slide, input2.frameId) ?? [])
        ]),
        moved: !1,
        altDup: !1,
        pendingBreakouts: items,
        extras: items2,
        clickSelect: value69,
        startRect: value70.startRect,
        siblingRects: value70.siblingRects,
        candidates: (0, runtime2.buildSiblingSnapCandidates)(value70.siblingRects),
        lastSnaps: {},
        last: null,
        origin: null,
        lifted: /* @__PURE__ */ new Map(),
        sheds: [],
        drop: null,
        preview: null,
        restore: null,
        at: null
      };
    };
    beginFrameDragRef.current = callback47, beginPanRef.current = callback43;
    let callback48 = (input) => {
      ref11.current.delete(input), window.dispatchEvent(new PointerEvent("pointercancel", {
        pointerId: input,
        pointerType: "touch"
      }));
    };
    releasePointerRef.current = callback48;
    let callback49 = (input) => {
      let value59 = slideSurfaceRef.current?.style;
      for (let value60 of [
        "user-select",
        "-webkit-user-select",
        "-webkit-touch-callout"
      ])
        input ? value59?.setProperty(value60, "none") : value59?.removeProperty(value60);
    }, callback50 = () => {
      longPressTimerRef.current !== null && clearTimeout(longPressTimerRef.current), longPressTimerRef.current = null, touchPressRef.current = null, dragSessionRef.current?.type !== "touch" && callback49(!1);
    }, callback51 = (element, options = !1) => {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement) || !element.isConnected || element.hasAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE) && element.classList.contains("slides-lift"))
        return;
      let value59 = getComputedStyle(element), [value60, value61] = element.hasAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE) ? parseCssScaleFactors(element.getAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE) ?? "") : parseCssScaleFactors(value59.scale), value62 = parseFloat(element.hasAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE) ? element.style.getPropertyValue("--slides-lift-own") : value59.opacity), value63 = Number.isNaN(value62) ? 1 : value62;
      element.setAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE, String(value60) + " " + String(value61)), element.style.setProperty("--slides-lift-own", String(value63)), element.style.setProperty("--slides-lift-fade", String(value63 * 0.75)), element.classList.remove("slides-lift-out"), element.classList.toggle("slides-lift-held", options), element.classList.add("slides-lift");
    }, callback52 = (input) => {
      if (!(!(input instanceof HTMLElement) && !(input instanceof SVGElement))) {
        input.classList.remove("slides-lift", "slides-lift-out", "slides-lift-held"), input.removeAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE);
        for (let value59 of [
          "--slides-lift-own",
          "--slides-lift-fade"
        ])
          input.style.removeProperty(value59);
        refreshMeasurements((input2) => input2 + 1);
      }
    }, callback53 = () => {
      touchLiftActiveRef.current = !1, callback49(!1);
      for (let value59 of document.querySelectorAll("[" + SLIDE_LIFT_SCALE_ATTRIBUTE + "]")) {
        if (!value59.classList.contains("slides-lift"))
          continue;
        if (value59.classList.remove("slides-lift", "slides-lift-held"), value59.classList.add("slides-lift-out"), getComputedStyle(value59).animationName !== "slides-lift-out") {
          callback52(value59);
          continue;
        }
        let callback77 = () => {
          value59.removeEventListener("animationend", callback78), value59.removeEventListener("animationcancel", callback78), value59.hasAttribute(SLIDE_LIFT_SCALE_ATTRIBUTE) && !value59.classList.contains("slides-lift") && callback52(value59);
        }, callback78 = (event) => {
          event.target === value59 && "animationName" in event && event.animationName === "slides-lift-out" && callback77();
        };
        value59.addEventListener("animationend", callback78), value59.addEventListener("animationcancel", callback78), setTimeout(callback77, 400);
      }
    }, callback54 = () => {
      touchLiftActiveRef.current = !1, callback49(!1);
      for (let value59 of document.querySelectorAll("[" + SLIDE_LIFT_SCALE_ATTRIBUTE + "]"))
        callback52(value59);
    }, callback55 = (source) => {
      let items = [];
      if (source.kind === "layer-move")
        items.push(frameElementsRef.current.get(source.frameId)?.querySelector('[data-overlay-layer="' + String(source.layerIndex + 1) + '"]')?.firstElementChild);
      else {
        for (let value59 of source.pendingBreakouts) {
          let value60 = value59.dragPath ?? (value59.dragIndex !== void 0 ? [value59.dragIndex] : void 0), items2 = [
            ...value60 ? [value60] : [],
            ...value59.selectedChildren.map((input) => [input]),
            ...value59.deep.map((input) => input.path)
          ];
          for (let value61 of items2)
            items2.some((items3) => items3.length < value61.length && items3.every((input, options) => input === value61[options])) || items.push(frameElementsRef.current.get(value59.frameId)?.querySelector('[data-node-path="' + value61.join(".") + '"]'));
        }
        for (let value59 of [
          source.frameId,
          ...source.extras.map((input) => input.frameId)
        ]) {
          let value60 = (0, runtime2.frameById)(slideRef.current, value59);
          source.pendingBreakouts.some((input) => input.frameId === value59) || value60 !== void 0 && ((0, runtime2.isPrimaryLayoutFrame)(slideRef.current, value60) || (0, runtime2.isEmptyBackgroundFrame)(value60)) || items.push(frameElementsRef.current.get(value59)?.firstElementChild);
        }
      }
      if (items.some((input) => input != null)) {
        for (let value59 of document.querySelectorAll("[" + SLIDE_LIFT_SCALE_ATTRIBUTE + "]"))
          items.includes(value59) || callback52(value59);
        for (let value59 of items)
          callback51(value59, touchLiftActiveRef.current);
        touchLiftActiveRef.current = !0;
      }
    };
    applyTouchLiftRef.current = callback55, clearTouchLiftRef.current = callback53, endViewportGestureRef.current = callback54;
    let callback56 = (input, options) => {
      queueMicrotask(() => {
        let current = dragSessionRef.current;
        current !== null && current.type === "touch" && (current.kind === "move" || current.kind === "layer-move") && callback55(current);
      });
      try {
        navigator.vibrate?.(10);
      } catch {
      }
    }, callback57 = (input, event) => {
      callback54(), callback50(), touchPressRef.current = {
        pointerId: event.pointerId,
        frameId: input,
        press: event,
        popped: !1,
        selected: !readOnlyRef.current && callback46(input, event)
      }, callback49(!readOnlyRef.current), longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        let current = touchPressRef.current;
        if (current === null || current.pointerId !== event.pointerId || readOnlyRef.current)
          return;
        let value59 = (0, runtime2.reduceTouchLongPress)(current, {
          kind: "hold"
        }, pointerDragThreshold("touch"));
        if (touchPressRef.current = value59.press, value59.outcome === "pop") {
          if (ref12.current.size > 1) {
            callback50();
            return;
          }
          callback48(event.pointerId), plainPressRef.current = !1, callback56(input, event.target), beginFrameDragRef.current(input, event);
        }
      }, runtime2.TOUCH_LONG_PRESS_MS);
    }, callback58 = (input, options) => {
      if (!singleTransformTarget || !onChangeSlide)
        return;
      if (singleTransformTarget.flow) {
        let unit = singleTransformTarget.unit, value62 = (0, runtime2.selectedNode)(slide, unit), value63 = (0, runtime2.frameById)(slide, unit.frameId)?.node, value64 = value63 && (0, runtime2.nodeAtPath)(value63, (0, runtime2.selectionNodePath)(unit).slice(0, -1));
        if (!value62 || !(0, runtime2.nodeSupportsIntrinsicSizing)(value62) || !value64 || !(0, runtime2.isFlowContainer)(value64))
          return;
        let value65 = input !== null && (0, runtime2.nodeExplicitAxisSize)(value62, "x") !== void 0 && (0, runtime2.childAxisFills)(value62, value64, "x"), value66 = options !== null && (0, runtime2.nodeExplicitAxisSize)(value62, "y") !== void 0 && (0, runtime2.childAxisFills)(value62, value64, "y");
        if (!value65 && !value66)
          return;
        onChangeSlide((0, runtime2.updateSelectedNode)(slide, unit, (input2) => {
          let value67 = input2;
          return value65 && (value67 = (0, runtime2.setNodeAxisSize)(value67, "x", void 0, singleTransformTarget.mainAxis)), value66 && (value67 = (0, runtime2.setNodeAxisSize)(value67, "y", void 0, singleTransformTarget.mainAxis)), value67;
        }));
        return;
      }
      let value59 = (0, runtime2.frameById)(slide, singleTransformTarget.unit.frameId);
      if (!value59)
        return;
      let callback77 = (input2, options2) => {
        if (!options2 || input2.anchor === "fill" || input2.size === void 0)
          return input2;
        let state2 = {
          ...input2
        };
        return delete state2.size, state2;
      }, value60 = callback77(value59.x, input !== null && (0, runtime2.nodeHasIntrinsicSize)(value59.node, "x")), value61 = callback77(value59.y, options !== null && (0, runtime2.nodeHasIntrinsicSize)(value59.node, "y"));
      value60 === value59.x && value61 === value59.y || onChangeSlide((0, runtime2.updateSlideFrame)(slide, value59.id, (input2) => ({
        ...input2,
        x: value60,
        y: value61,
        node: (0, runtime2.resetImageDimensions)(input2.node, value60 !== value59.x, value61 !== value59.y, assets)
      })));
    }, callback59 = (input, options, context) => {
      if (readOnly || !singleTransformTarget || !lastSelectedRect || (options.stopPropagation(), ref13.current.has(options.pointerId)) || (0, runtime2.isMacControlClick)(options) || !(0, runtime2.startCanvasDrag)(options))
        return;
      callback8();
      let value59 = placementSideToSnapLine(input.x), value60 = placementSideToSnapLine(input.y), value61 = lastSelectedRect.rotation ?? 0;
      if (singleTransformTarget.flow) {
        let unit = singleTransformTarget.unit, value64 = (0, runtime2.selectedNode)(slide, unit), value65 = (0, runtime2.frameById)(slide, unit.frameId)?.node;
        if (!value64 || !value65)
          return;
        let value66 = (0, runtime2.selectionNodePath)(unit), value67 = frameElementsRef.current.get(unit.frameId)?.querySelector('[data-node-path="' + value66.join(".") + '"]'), value68 = value67 && !(value67 instanceof HTMLElement) ? getComputedStyle(value67) : null, value69 = value67 instanceof HTMLElement ? {
          w: value67.offsetWidth,
          h: value67.offsetHeight
        } : value68 && parseFloat(value68.width) > 0 && parseFloat(value68.height) > 0 ? {
          w: parseFloat(value68.width),
          h: parseFloat(value68.height)
        } : {
          w: lastSelectedRect.w,
          h: lastSelectedRect.h
        }, value70 = null, value71 = (0, runtime2.isFlowContainer)(value65) && (0, runtime2.styleHasVisiblePaint)(value65.style), value72 = value61 === 0 && (lastSelectedRect.nodeScale ?? 1) === 1 && context?.inFlow !== !0 ? callback36(unit.frameId) : null, value73 = value72 ? callback39(unit.frameId, value66) : null, value74 = value73 ? callback26(unit.frameId) : null;
        if (value72 && value73 && value74) {
          let { lift: value75, pin: value76 } = collectCollapsibleFlowAncestors(value65, value66, value71 ? 0 : 1), value77 = value71 || value66.length > 1 ? [[...value66], ...value75] : value75, value78 = [
            ...value66.map((input2, options2) => value66.slice(0, options2)),
            ...value71 ? [] : ((0, runtime2.nodeChildren)(value65) ?? []).map((input2, options2) => [
              options2
            ]),
            ...value77
          ].every((input2) => {
            let value82 = (0, runtime2.nodeAtPath)(value65, input2);
            return value82 === void 0 || (0, runtime2.nodeTransform)(value82) === void 0;
          }), value79 = value77.flatMap((input2) => {
            let value82 = (0, runtime2.nodePathsEqual)(input2, value66) ? value73 : callback39(unit.frameId, input2);
            return value82 ? [
              {
                path: input2,
                rect: value82
              }
            ] : [];
          }), value80 = value76.flatMap((input2) => {
            let value82 = callback39(unit.frameId, input2);
            return value82 ? [
              {
                path: input2,
                w: value82.w,
                h: value82.h
              }
            ] : [];
          }), state2 = {
            frameId: unit.frameId,
            children: value72,
            selectedChildren: [],
            deep: value79,
            pins: value80
          };
          value71 ? state2.keep = value74.layout : state2.dragIndex = value66[0], (value71 || value66.length > 1) && (state2.dragPath = [...value66]);
          let value81 = value71 ? [value74.startRect] : value72.filter((input2, options2) => options2 !== value66[0] || value66.length > 1).map((input2) => input2.rect);
          value78 && (value70 = {
            rect: value73,
            record: state2,
            siblingRects: value74.siblingRects.concat(value81, value79.filter((input2) => !(0, runtime2.nodePathsEqual)(input2.path, value66)).map((input2) => input2.rect))
          });
        }
        dragSessionRef.current = {
          kind: "flow-resize",
          frameId: unit.frameId,
          path: value66,
          pointerId: options.pointerId,
          type: options.pointerType,
          k: ref8.current.scale,
          downX: options.clientX,
          downY: options.clientY,
          startX: options.clientX,
          startY: options.clientY,
          before: slide,
          xEdge: value59,
          yEdge: value60,
          w: value69.w,
          h: value69.h,
          rotation: value61,
          nodeScale: lastSelectedRect.nodeScale ?? 1,
          mainAxis: singleTransformTarget.mainAxis,
          minW: (0, runtime2.minimumNodeResizeSize)(value64, value69.w),
          minH: (0, runtime2.minimumNodeResizeSize)(value64, value69.h),
          moved: !1,
          breakout: value70
        }, options.pointerType !== "touch" && copySelectedUnitsToClipboard(input, value61);
        return;
      }
      let value62 = (0, runtime2.frameById)(slide, singleTransformTarget.unit.frameId);
      if (!value62)
        return;
      let value63 = callback26(value62.id);
      value63 && (dragSessionRef.current = {
        kind: "resize",
        frameId: value62.id,
        pointerId: options.pointerId,
        type: options.pointerType,
        k: ref8.current.scale,
        downX: options.clientX,
        downY: options.clientY,
        startX: options.clientX,
        startY: options.clientY,
        before: slide,
        xSpec: value62.x,
        ySpec: value62.y,
        xEdge: value59,
        yEdge: value60,
        w: value63.layout.w,
        h: value63.layout.h,
        rotation: value61,
        nodeScale: lastSelectedRect.nodeScale ?? 1,
        moved: !1,
        applyBase: slide,
        startRect: value63.startRect,
        candidates: (0, runtime2.buildSiblingSnapCandidates)(value63.siblingRects)
      }, options.pointerType !== "touch" && copySelectedUnitsToClipboard(input, value61));
    }, callback60 = (input) => {
      let items = [];
      for (let [value59, value60] of frameElementsRef.current) {
        let value61 = (0, runtime2.frameById)(slide, value59);
        if (!(!value61 || !value60.isConnected))
          for (let value62 of value60.querySelectorAll("[data-node-path]")) {
            if (value62 === input)
              continue;
            let value63 = parseEditorNodePath(value62.getAttribute("data-node-path")), value64 = callback39(value59, value63);
            if (!value64 || value64.w <= 0 || value64.h <= 0)
              continue;
            let value65 = (0, runtime2.nodeAtPath)(value61.node, value63);
            if (value65?.kind !== "spacer")
              if (value65 !== void 0 && (0, runtime2.isConnectorNode)(value65))
                for (let [value66, value67] of (0, runtime2.absoluteConnectorEndpoints)(value64, value65.from, value65.strokeWidth))
                  items.push({
                    x: value66,
                    y: value67,
                    box: value64
                  });
              else if (value65 !== void 0 && (0, runtime2.isLineShapeNode)(value65)) {
                let value66 = value62.offsetWidth || value64.w, value67 = value62.offsetHeight || value64.h, state2 = {
                  x: value64.x + (value64.w - value66) / 2,
                  y: value64.y + (value64.h - value67) / 2,
                  w: value66,
                  h: value67
                };
                for (let [value68, value69] of (0, runtime2.lineShapeEndpoints)(state2, value65.rotate))
                  items.push({
                    x: value68,
                    y: value69,
                    box: value64
                  });
                items.push({
                  x: state2.x + state2.w / 2,
                  y: state2.y + state2.h / 2,
                  box: value64
                });
              } else
                items.push(...(0, runtime2.rectangleAttachmentPoints)([value64]));
          }
      }
      return items;
    }, callback61 = (input, options) => {
      if (readOnly || selection.length !== 1 || !lastSelectedRect || (options.stopPropagation(), ref13.current.has(options.pointerId)))
        return;
      let value59 = selection[0], value60 = (0, runtime2.frameById)(slide, value59.frameId), value61 = (0, runtime2.selectedNode)(slide, value59);
      if (!value60 || value61 === void 0 || !((0, runtime2.isConnectorNode)(value61) || (0, runtime2.isLineShapeNode)(value61)))
        return;
      let value62 = (0, runtime2.isLineShapeNode)(value61), value63 = (0, runtime2.selectionNodePath)(value59), value64 = value63.length > 0 ? (0, runtime2.nodeAtPath)(value60.node, value63.slice(0, -1)) : void 0, value65 = value62 ? (0, runtime2.lineShapeEndpoints)(lastSelectedRect, value61.rotate) : (0, runtime2.absoluteConnectorEndpoints)(lastSelectedRect, value61.from, value61.strokeWidth);
      if (value64 !== void 0 && (0, runtime2.isFlowContainer)(value64)) {
        let value72 = 2 * (0, runtime2.connectorArrowInset)(value61.strokeWidth) + 0.5, value73 = value65[input === 0 ? 0 : 1];
        callback59(value62 ? lastSelectedRect.w >= lastSelectedRect.h ? {
          x: input === 0 ? "left" : "right",
          y: null
        } : {
          x: null,
          y: input === 0 ? "top" : "bottom"
        } : {
          x: lastSelectedRect.w <= value72 ? null : value73[0] < lastSelectedRect.x + lastSelectedRect.w / 2 ? "left" : "right",
          y: lastSelectedRect.h <= value72 ? null : value73[1] < lastSelectedRect.y + lastSelectedRect.h / 2 ? "top" : "bottom"
        }, options, {
          inFlow: !0
        });
        return;
      }
      let value66 = value64 !== void 0 && (0, runtime2.isOverlayNode)(value64) ? value64.layers[value63[value63.length - 1] - 1] : void 0;
      if (value63.length > 0 && value66 === void 0 || (0, runtime2.isMacControlClick)(options) || !(0, runtime2.startCanvasDrag)(options))
        return;
      callback8();
      let items = [0, 0], items2 = [runtime2.SLIDE_WIDTH, runtime2.SLIDE_HEIGHT], value67 = (0, runtime2.frameBounds)(value60.x, value60.y, lastSelectedRect.w, lastSelectedRect.h), entry = frameElementsRef.current.get(value59.frameId);
      if (value66 !== void 0) {
        let value72 = entry?.querySelector('[data-node-path="' + value63.slice(0, -1).join(".") + '"]'), value73 = callback39(value59.frameId, value63.slice(0, -1));
        if (!value72 || !value73)
          return;
        items = [
          value73.x + value72.clientLeft,
          value73.y + value72.clientTop
        ], items2 = [value72.clientWidth, value72.clientHeight];
        let value74 = (0, runtime2.resolveAxisSpec)(value66.x, items2[0], lastSelectedRect.w), value75 = (0, runtime2.resolveAxisSpec)(value66.y, items2[1], lastSelectedRect.h);
        value67 = {
          x: value74.start,
          y: value75.start,
          w: value74.size,
          h: value75.size
        };
      }
      let value68 = value62 ? (0, runtime2.lineShapeEndpoints)(value67, value61.rotate) : (0, runtime2.absoluteConnectorEndpoints)(value67, value61.from, value61.strokeWidth), value69 = entry?.querySelector('[data-node-path="' + value63.join(".") + '"]') ?? null, value70 = value62 ? 0 : (0, runtime2.connectorArrowInset)(value61.strokeWidth), value71 = callback60(value69).filter((input2) => input2.x >= items[0] + value70 - 0.5 && input2.y >= items[1] + value70 - 0.5);
      dragSessionRef.current = {
        kind: "endpoint",
        frameId: value59.frameId,
        path: value63,
        which: input === 0 ? 0 : 1,
        pointerId: options.pointerId,
        type: options.pointerType,
        k: ref8.current.scale,
        downX: options.clientX,
        downY: options.clientY,
        startX: options.clientX,
        startY: options.clientY,
        before: slide,
        strokeWidth: value61.strokeWidth,
        bar: value62 ? {
          thickness: Math.min(value67.w, value67.h),
          span: items2
        } : null,
        start: [
          value68[input === 0 ? 0 : 1][0] + items[0],
          value68[input === 0 ? 0 : 1][1] + items[1]
        ],
        fixed: value68[input === 0 ? 1 : 0],
        origin: items,
        sites: value71,
        last: null,
        moved: !1
      }, options.pointerType !== "touch" && (0, runtime2.setGestureCursor)("move");
    }, callback62 = (input, options) => {
      if (readOnly || !singleStyleTarget || (options.stopPropagation(), ref13.current.has(options.pointerId)) || (0, runtime2.isMacControlClick)(options) || !(0, runtime2.startCanvasDrag)(options))
        return;
      callback8();
      let value59 = singleStyleTarget, value60 = (0, runtime2.selectedNode)(slide, value59), entry = frameElementsRef.current.get(value59.frameId), value61 = entry?.offsetParent, value62 = entry?.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(value59).join(".") + '"]');
      if (!value60 || !value61 || !value62)
        return;
      let bounds = value61.getBoundingClientRect(), bounds2 = value62.getBoundingClientRect(), scale3 = ref8.current.scale, value63 = bounds2.left + bounds2.width / 2, value64 = bounds2.top + bounds2.height / 2, value65 = (0, runtime2.nodeTransform)(value60)?.rotate ?? 0;
      dragSessionRef.current = {
        kind: "rotate",
        frameId: value59.frameId,
        path: (0, runtime2.selectionNodePath)(value59),
        pointerId: options.pointerId,
        type: options.pointerType,
        k: scale3,
        downX: options.clientX,
        downY: options.clientY,
        startX: options.clientX,
        startY: options.clientY,
        before: slide,
        corner: input,
        cx: (value63 - bounds.left) / scale3,
        cy: (value64 - bounds.top) / scale3,
        startBearing: (0, runtime2.angleBetweenPoints)(value63, value64, options.clientX, options.clientY),
        startDeg: value65,
        lastDeg: null,
        moved: !1
      }, options.pointerType !== "touch" && (0, runtime2.setGestureCursor)((0, runtime2.rotatedGrabCursor)(input, value65 * Math.PI / 180));
    }, callback63 = (event) => {
      if (readOnly || commenting || performance.now() - videoControlsShownAtRef.current < 1e3)
        return;
      let value59 = chooseTextEditingTarget(event.target, event.clientX, event.clientY), callback77 = (input) => (input ?? "").split(".").filter((input2) => input2 !== "").map(Number), ancestor = value59.closest("[data-cell]");
      if (ancestor) {
        let ancestor5 = ancestor.closest("[data-node-path]"), ancestor6 = ancestor.closest("[data-frame-id]");
        if (!ancestor5 || !ancestor6)
          return;
        let attribute2 = ancestor6.getAttribute("data-frame-id"), value63 = callback77(ancestor5.getAttribute("data-node-path")), value64 = (0, runtime2.frameById)(slide, attribute2), value65 = value64 ? (0, runtime2.nodeAtPath)(value64.node, value63) : void 0;
        if (!(0, runtime2.isTableNode)(value65))
          return;
        let [value66, value67] = (ancestor.getAttribute("data-cell") ?? "").split("."), value68 = Number(value66), value69 = Number(value67);
        if (!(0, runtime2.tableCellExists)(value65, value68, value69))
          return;
        onSelectionChange([
          (0, runtime2.createNodeSelection)(attribute2, value63)
        ]), onTextEdit({
          frameId: attribute2,
          path: value63,
          cell: {
            r: value68,
            c: value69
          }
        });
        return;
      }
      let ancestor2 = value59.closest("[data-img-path]"), value60 = ancestor2?.closest("[data-frame-id]")?.getAttribute("data-frame-id");
      if (ancestor2 && value60 != null) {
        if (performance.now() - lastClipPlayAtRef.current <= 0)
          return;
        let value63 = (0, runtime2.createNodeSelection)(value60, callback77(ancestor2.getAttribute("data-img-path")));
        callback29(value63) && onSelectionChange([value63]);
        return;
      }
      let ancestor3 = value59.closest("[data-text-path]"), ancestor4 = value59.closest("[data-frame-id]");
      if (!ancestor3 && ancestor4) {
        let value63 = (0, runtime2.frameById)(slide, ancestor4.getAttribute("data-frame-id")), value64 = value63 ? (0, runtime2.pointerSelectsGroup)(value63.id, value63.node, callback77(value59.closest("[data-node-path]")?.getAttribute("data-node-path") ?? null), selection, getFrameHitTestOptions(slide, value63)) : null;
        value64 !== null && onSelectionChange([value64]);
        return;
      }
      if (!ancestor3 || !ancestor4)
        return;
      let attribute = ancestor4.getAttribute("data-frame-id"), value61 = callback77(ancestor3.getAttribute("data-text-path")), value62 = (0, runtime2.frameById)(slide, attribute);
      value62 && (0, runtime2.isEditableTextNode)((0, runtime2.nodeAtPath)(value62.node, value61)) && (onSelectionChange([
        (0, runtime2.createNodeSelection)(attribute, value61)
      ]), onTextEdit({
        frameId: attribute,
        path: value61
      }));
    }, ref52 = runtime2.reactK_.useRef(null), ref53 = runtime2.reactK_.useRef(!1), [value34, value35] = runtime2.reactK_.useState(null), ref54 = runtime2.reactK_.useRef(null), value36 = textEdit ? textEdit.frameId + ":" + textEdit.path.join(".") + (textEdit.cell ? ":" + String(textEdit.cell.r) + "." + String(textEdit.cell.c) : "") : null;
    if (value34 !== null && ref54.current !== value36 && value35(null), value36 === null)
      ref52.current = null;
    else if (ref52.current?.key !== value36) {
      let value59 = (0, runtime2.frameById)(slide, textEdit.frameId), value60 = value59 ? (0, runtime2.nodeAtPath)(value59.node, textEdit.path) : void 0, cell = textEdit.cell;
      ref52.current = {
        key: value36,
        ...(0, runtime2.slideGeneration)(slide) !== void 0 ? {
          gen: (0, runtime2.slideGeneration)(slide)
        } : {},
        text: cell ? (0, runtime2.isTableNode)(value60) ? value60.rows[cell.r]?.[cell.c] ?? "" : "" : (0, runtime2.isEditableTextNode)(value60) ? value60.text : "",
        ...cell === void 0 && (0, runtime2.isEditableTextNode)(value60) ? {
          marks: value60.marks,
          list: value60.list,
          lineLists: value60.lineLists,
          pad: value60.style?.paddingLeft,
          indent: value60.listIndent
        } : {}
      };
    }
    let value37 = (() => {
      let current = ref52.current;
      if (textEdit !== null && current !== null && current.key === value36 && (0, runtime2.isSlideGenerationStale)(current.gen, slide))
        return current.dirty === !0 && (ref53.current = !0), current.dirty = !1, !0;
      if (textEdit === null || current === null || current.key !== value36 || current.dirty === !0)
        return !1;
      let value59 = (0, runtime2.frameById)(slide, textEdit.frameId), value60 = value59 ? (0, runtime2.nodeAtPath)(value59.node, textEdit.path) : void 0;
      return (textEdit.cell ? (0, runtime2.isTableNode)(value60) ? value60.rows[textEdit.cell.r]?.[textEdit.cell.c] ?? "" : "" : (0, runtime2.isEditableTextNode)(value60) ? value60.text : "") !== current.text ? !0 : textEdit.cell || !(0, runtime2.isEditableTextNode)(value60) ? !1 : JSON.stringify([
        value60.marks ?? [],
        value60.list ?? value60.lineLists ?? null
      ]) !== JSON.stringify([
        current.marks ?? [],
        current.list ?? current.lineLists ?? null
      ]);
    })();
    if (textEdit !== null && textEdit.cell === void 0 && !value37 && ref52.current?.key === value36 && ref52.current.moved !== !0) {
      let value59 = (0, runtime2.frameById)(slide, textEdit.frameId), value60 = value59 ? (0, runtime2.nodeAtPath)(value59.node, textEdit.path) : void 0;
      (0, runtime2.isEditableTextNode)(value60) && Object.assign(ref52.current, {
        pad: value60.style?.paddingLeft,
        indent: value60.listIndent
      });
    }
    let value38 = textEdit !== null && (!getSelectedTextStyle(slide, textEdit) || value37);
    runtime2.reactK_.useEffect(() => {
      value38 && (onTextEdit(null), ref53.current && (ref53.current = !1, onGestureEnd(slide)));
    }, [value38, onTextEdit, onGestureEnd, slide]);
    let callback64 = runtime2.reactK_.useCallback((input, options) => (0, runtime2.updateSlideFrame)(slide, input.frameId, (input2) => ({
      ...input2,
      node: (0, runtime2.updateNodeAtPath)(input2.node, input.path, (source) => source.kind === "text" ? {
        ...source,
        text: options
      } : source)
    })), [slide]), callback65 = runtime2.reactK_.useCallback((input, options) => (0, runtime2.updateSlideFrame)(slide, input.frameId, (input2) => ({
      ...input2,
      node: (0, runtime2.updateNodeAtPath)(input2.node, input.path, (source) => {
        if (source.kind !== "text")
          return source;
        let state2 = {
          ...source,
          text: options.text
        };
        options.marks !== void 0 && options.marks.length > 0 ? state2.marks = options.marks : delete state2.marks;
        let draft = ref52.current, value60 = (0, runtime2.applyTextListFields)(state2, options, slide.lists, draft !== null && draft.list === void 0 ? draft.pad ?? 0 : void 0);
        if (options.indents === void 0)
          return value60;
        let { listIndent: _listIndent, ...value61 } = (0, runtime2.patchNodeStyle)(value60, {
          paddingLeft: options.indents.paddingLeft
        });
        return options.indents.listIndent !== void 0 ? {
          ...value61,
          listIndent: options.indents.listIndent
        } : value61;
      })
    })), [slide]), callback66 = runtime2.reactK_.useCallback((input, options) => {
      let cell = input.cell;
      return cell ? (0, runtime2.updateSlideFrame)(slide, input.frameId, (input2) => ({
        ...input2,
        node: (0, runtime2.updateNodeAtPath)(input2.node, input.path, (source) => source.kind === "table" ? (0, runtime2.setTableCellText)(source, cell.r, cell.c, options) : source)
      })) : slide;
    }, [slide]), ref55 = runtime2.reactK_.useRef(null);
    runtime2.reactK_.useEffect(() => {
      if (!readOnly) {
        ref55.current = null;
        return;
      }
      let current = ref26.current, current2 = ref52.current;
      current === null || current2 === null || current2.dirty !== !0 || ref55.current === current2.key || (ref55.current = current2.key, onLiveChange(current.cell ? callback66(current, current2.text) : callback65(current, {
        text: current2.text,
        marks: current2.marks,
        list: current2.list,
        lineLists: current2.lineLists,
        ...current2.moved === !0 ? {
          indents: {
            paddingLeft: current2.pad,
            listIndent: current2.indent
          }
        } : {}
      })));
    }, [readOnly, onLiveChange, callback66, callback65]);
    let callback67 = (input, options, context) => {
      let cell = input.cell, value59 = (0, runtime2.frameById)(slide, input.frameId), value60 = value59 ? (0, runtime2.nodeAtPath)(value59.node, input.path) : void 0;
      if (!cell || !(0, runtime2.isTableNode)(value60))
        return null;
      let value61 = cell.r + options, value62 = cell.c + context;
      return value62 >= value60.cols ? (value62 = 0, value61 += 1) : value62 < 0 && (value62 = value60.cols - 1, value61 -= 1), value61 < 0 || value61 >= value60.rows.length ? null : {
        frameId: input.frameId,
        path: input.path,
        cell: {
          r: value61,
          c: value62
        }
      };
    }, value39 = null, callback68 = () => slide, callback69 = (input) => {
    }, openSelectionLink = () => {
    };
    if (textEdit && ref52.current && !value38) {
      let text = ref52.current.text, value59 = textEdit, callback77 = (input) => value59.cell ? callback66(value59, input) : callback64(value59, input), callback78 = (input) => value59.cell ? trimTrailingTextNewlines(input) : input, current = ref52.current, callback79 = () => ref26.current !== value59 || current.closed === !0, callback80 = (input) => {
        current.dirty === !0 && (onLiveChange(input), onGestureEnd(input));
      }, callback81 = (input) => {
        if (current.dirty === !0) {
          if (input === text) {
            callback80(callback77(text));
            return;
          }
          onLiveChange(callback77(input)), onGestureEnd(callback77(text));
        }
      }, callback82 = () => ({
        text: current.text,
        marks: current.marks,
        list: current.list,
        lineLists: current.lineLists,
        ...current.moved === !0 ? {
          indents: {
            paddingLeft: current.pad,
            listIndent: current.indent
          }
        } : {}
      }), callback83 = (input, options) => input.start === options.start && input.end === options.end && input.bold === options.bold && input.italic === options.italic && input.underline === options.underline && input.color === options.color && input.href === options.href, callback84 = (input) => {
        let value60 = callback82(), value61 = input.marks ?? [], value62 = value60.marks ?? [];
        return input.text === value60.text && value61.length === value62.length && value61.every((input2, options) => callback83(input2, value62[options])) && (input.list ?? null) === (value60.list ?? null) && (input.lineLists ?? []).join() === (value60.lineLists ?? []).join();
      }, callback85 = (input) => {
        if (current.dirty === !0) {
          if (callback84(input)) {
            callback80(callback65(value59, callback82()));
            return;
          }
          onLiveChange(callback65(value59, input)), onGestureEnd(callback65(value59, callback82()));
        }
      };
      value59.cell || (callback68 = () => {
        if (current.dirty !== !0 || callback79())
          return slide;
        let element = document.querySelector("[data-text-path][contenteditable]");
        if (element === null)
          return slide;
        let value60 = (0, runtime2.readEditableRichText)(element, !0), value61 = callback65(value59, callback82()), value62 = callback65(value59, value60);
        return onLiveChange(value62), onGestureEnd(value61), current.text = value60.text, current.marks = value60.marks !== void 0 && value60.marks.length > 0 ? value60.marks : void 0, current.list = value60.list, current.lineLists = value60.lineLists, current.dirty = !1, current.moved = !1, value62;
      }), value39 = {
        frameId: value59.frameId,
        path: value59.path.join("."),
        ...value59.cell ? {
          cell: value59.cell
        } : {},
        ...value59.caret ? {
          caret: value59.caret
        } : {},
        ...value9 !== null ? {
          reselect: !0
        } : {},
        initialText: text,
        onInput: (input) => {
          callback79() || (current.dirty = !0, onLiveChange(callback77(input)));
        },
        onCommit: (input) => {
          callback79() || (current.closed = !0, onTextEdit(null), callback81(callback78(input)));
        },
        ...value59.cell ? {} : {
          onRichInput: (input) => {
            if (callback79())
              return;
            current.dirty = !0;
            let value60 = callback65(value59, input), callback86 = (input2) => {
              let value61 = (0, runtime2.frameById)(input2, value59.frameId), value62 = value61 ? (0, runtime2.nodeAtPath)(value61.node, value59.path) : void 0;
              return (0, runtime2.isEditableTextNode)(value62) ? [value62.style?.paddingLeft, value62.listIndent].join() : "";
            };
            callback86(value60) !== callback86(slide) && (current.moved = !0), onLiveChange(value60);
          },
          onRichCommit: (input) => {
            callback79() || (current.closed = !0, onTextEdit(null), callback85(input));
          },
          onFormat: (input) => {
            callback79() || callback69(input);
          },
          onLink: () => {
            callback79() || openSelectionLink();
          }
        },
        onCommitMove: (input, options, context) => {
          if (callback79())
            return;
          let value60 = callback78(input), value61 = callback67(value59, options, context);
          if (value61 === null && context > 0 && value59.cell !== void 0) {
            let value62 = (0, runtime2.frameById)(slide, value59.frameId), value63 = value62 ? (0, runtime2.nodeAtPath)(value62.node, value59.path) : void 0;
            if ((0, runtime2.isTableNode)(value63) && value63.rows.length < runtime2.maxTableRows && callback32(value63.cols) === null) {
              callback81(value60);
              let value64 = current.dirty === !0 ? callback77(value60) : slide;
              callback34(value64, value59.frameId, value59.path, (input2) => (0, runtime2.insertTableRow)(input2, input2.rows.length)), runtime2.FrameViewportReactDom.flushSync(() => onTextEdit(null)), onTextEdit({
                frameId: value59.frameId,
                path: value59.path,
                cell: {
                  r: value63.rows.length,
                  c: 0
                }
              });
              return;
            }
          }
          value61 === null && (current.closed = !0), callback81(value60), onTextEdit(value61);
        }
      };
    }
    let callback70 = (input) => {
      let value59 = slideSurfaceRef.current?.getBoundingClientRect();
      return value59 ? {
        x: Math.min(runtime2.SLIDE_WIDTH, Math.max(0, (input.clientX - value59.left) / scale)),
        y: Math.min(runtime2.SLIDE_HEIGHT, Math.max(0, (input.clientY - value59.top) / scale))
      } : {
        x: runtime2.SLIDE_WIDTH / 2,
        y: runtime2.SLIDE_HEIGHT / 2
      };
    }, callback71 = (event) => {
      let types = event.dataTransfer.types;
      (types.includes("Files") || types.includes("application/x-slides-insert")) && (event.preventDefault(), event.dataTransfer.dropEffect = readOnly ? "none" : "copy");
    }, callback72 = (event) => {
      if (readOnly) {
        event.preventDefault();
        return;
      }
      let value59 = event.dataTransfer.getData("application/x-slides-insert"), value60 = callback70(event);
      if (value59 !== "") {
        event.preventDefault(), onDropInsert?.(value59, value60.x, value60.y);
        return;
      }
      let items = [...event.dataTransfer.files];
      items.some((file) => (0, runtime2.isImageFile)(file) || !1) ? (event.preventDefault(), onDropImage?.(items, value60.x, value60.y)) : items.length > 0 && (event.preventDefault(), (0, runtime2.showToast)((0, runtime2.formatMessage)({
        defaultMessage: "只能将图片和视频文件（.mp4、.mov、.webm）拖到幻灯片上。",
        id: "VQjMGGu9Mn"
      })));
    }, value40 = null;
    ref19.current = null;
    let value41 = onOpenInspector ?? onChangeSlide ?? ((0, runtime2.commentsAvailable)() ? !0 : void 0), value42 = !readOnly && value41 !== void 0 && !selectionMenuHidden, value43 = textEdit !== null && textEdit.cell === void 0 && value39?.onRichInput !== void 0 && lastSelectedUnit !== void 0 && lastSelectedUnit.frameId === textEdit.frameId && (0, runtime2.nodePathsEqual)((0, runtime2.selectionNodePath)(lastSelectedUnit), textEdit.path), value44 = (0, runtime2.commonSelectedNodeKind)(slide, selection), value45 = lastSelectedUnit ? (0, runtime2.selectedNode)(slide, lastSelectedUnit) : void 0, selectedIsVideo = selection.length === 1 && value45?.kind === "img" && !1, selectedIsEmbeddableVideo = !1, value46 = selectedIsVideo ? "Video formatting" : EDITOR_FORMATTING_LABELS[value44 ?? "mixed"], value47 = (0, runtime2.createRovingKeyHandler)(callback16), value48 = onChangeSlide !== void 0 && value44 === "text" && value45?.kind === "text" ? value45 : null, callback73 = (input) => {
      if (onChangeSlide === void 0)
        return;
      let value59 = value43 ? callback68() : slide;
      onChangeSlide(selection.reduce((input2, options) => (0, runtime2.updateSelectedNode)(input2, options, (source) => source.kind === "text" ? input(source) : source), value59));
    }, value49 = (0, runtime2.getRenderingTheme)(), value50 = value48 !== null && (0, runtime2.nodeIsBold)(value48, value49), value51 = value48 !== null && (0, runtime2.nodeIsItalic)(value48), callback74 = () => callback73((input) => (0, runtime2.nodeIsBold)(input, value49) === value50 ? (0, runtime2.toggleNodeBold)(input, value49, (0, runtime2.resolveTypographyEmphasisVariant)(input, resolvedTypeStyles, resolvedDeckTypeStyles, value49)) : input), callback75 = () => callback73((input) => (0, runtime2.nodeIsItalic)(input) === value51 ? (0, runtime2.toggleNodeItalic)(input) : input), value52 = value48 === null ? [] : selection.map((input) => (0, runtime2.selectedNode)(slide, input)).filter(runtime2.isEditableTextNode), value53 = value48 !== null && (0, runtime2.nodeIsUnderlined)(value52.find((input) => input.style?.textDecorationLine !== "line-through") ?? value48), callback76 = () => callback73((input) => (0, runtime2.nodeIsUnderlined)(input) === value53 ? (0, runtime2.toggleNodeUnderline)(input) : input), value54 = value48 !== null ? (0, runtime2.findTypographyStyle)(value48, resolvedTypeStyles, value49) ?? (0, runtime2.findTypographyStyle)(value48, resolvedDeckTypeStyles, value49) : null, value55 = value50 || value54 !== null && value54.fontWeight >= 600, value56 = value51 || value54?.italic === !0;
    if (value43 && value48 !== null && !readOnly && (callback69 = (input) => {
      let element = document.querySelector("[data-text-path][contenteditable]"), value59 = element !== null ? (0, runtime2.readRichTextSelection)(element, runtime2.resolveSlideColor) : null, [value60, value61, value62] = input === "bold" ? [value50, value55, callback74] : input === "italic" ? [value51, value56, callback75] : [value53, value53, callback76];
      input === "underline" && !value60 && (value48.style?.textDecorationLine === "line-through" || value59?.touchesLink === !0) || (value60 || value61 && value59?.[input] !== !0 ? value62() : (0, runtime2.executeRichTextCommand)(input));
    }), lastSelectedRect !== null && (textEdit === null || value43) && dragSessionRef.current?.moved !== !0 && value2 === null && value41 !== void 0 && !selectionMenuHidden && !readOnly) {
      let value59 = slideSurfaceRef.current?.getBoundingClientRect();
      if (value59) {
        let callback77 = function(input) {
          let value102 = ref21.current ?? (value43 ? callback68() : slide);
          ref21.current = value102, onLiveChange(selection.reduce((input2, options) => (0, runtime2.updateSelectedNode)(input2, options, input), value102));
        }, value60 = onChangeSlide !== void 0 && selection.length === 1 && value45?.kind === "table" ? value45 : null, { style: value61, mixed: value62 } = value48 !== null ? (0, runtime2.matchingTypographyNodes)(value48, value52, resolvedTypeStyles, value49) : {
          style: null,
          mixed: !1
        }, value63 = value48 !== null && value52.some((input) => input.color !== value48.color), value64 = value48 !== null && value52.some((input) => (input.align ?? "start") !== (value48.align ?? "start")), value65 = value48 !== null && value52.some((input) => input.lineLists !== void 0 || input.list !== value48.list), value66 = (() => {
          if (value45 === void 0 || onChangeSlide === void 0 || value44 === void 0)
            return null;
          let value102 = value45;
          if (value102.kind === "shape" && value102.shape === "connector") {
            let value103 = (0, runtime2.resolveSlideColor)(value102.stroke ?? "clay") ?? "#D97757";
            return {
              title: (0, runtime2.formatMessage)({
                defaultMessage: "线条颜色",
                id: "flTgrhVMEj"
              }),
              current: value102.stroke ?? "clay",
              seed: value103,
              paint: value103,
              unset: !1,
              contrast: void 0,
              apply: (source, options) => source.kind === "shape" && source.shape === "connector" ? {
                ...source,
                stroke: options
              } : source
            };
          }
          if (value102.kind === "shape" && value102.shape === "line") {
            let value103 = value102.style?.backgroundColor;
            return {
              title: (0, runtime2.formatMessage)({
                defaultMessage: "填充颜色",
                id: "ZP8ITYxg4z"
              }),
              current: value103,
              seed: value103 ?? (0, runtime2.themeAccentColor)(),
              paint: value103,
              unset: value103 === void 0,
              contrast: void 0,
              apply: (source, options) => source.kind === "shape" && source.shape === "line" ? (0, runtime2.patchNodeStyle)(source, {
                backgroundColor: options.toLowerCase()
              }) : source
            };
          }
          if (value102.kind === "icon") {
            let value103 = (0, runtime2.resolveSlideColor)(value102.color) ?? (0, runtime2.slideTextColor)(slide.bg), value104 = selection.some((input) => {
              let value105 = (0, runtime2.selectedNode)(slide, input);
              return value105?.kind === "icon" && (value105.color ?? null) !== (value102.color ?? null);
            }) ? void 0 : (0, runtime2.selectionContrastBackground)(slide, selection, value49, runtime2.ICON_CONTRAST_NODE_KINDS);
            return {
              title: (0, runtime2.formatMessage)({
                defaultMessage: "图标颜色",
                id: "SO1ZYvmYb4"
              }),
              current: value102.color,
              seed: value103,
              paint: value103,
              unset: value102.color === void 0,
              contrast: value104,
              apply: (source, options) => source.kind === "icon" ? {
                ...source,
                color: options
              } : source
            };
          }
          return null;
        })(), callback78 = (input) => {
          if (value66 === null)
            return;
          let value102 = (0, runtime2.slideColorOrUndefined)(input);
          value102 !== void 0 && callback77((input2) => value66.apply(input2, value102));
        }, callback79 = () => {
          let current = ref21.current;
          ref21.current = null, current !== null && onGestureEnd(current);
        }, callback80 = (input, options) => {
          if (onChangeSlide === void 0)
            return;
          let value102 = value43 ? callback68() : slide;
          onChangeSlide(selection.reduce((input2, options2) => (0, runtime2.updateSelectedNode)(input2, options2, input), value102), options);
        }, value67 = value45 !== void 0 && value44 !== void 0 && (0, runtime2.nodeStyleKind)(value45) !== void 0 && onChangeSlide !== void 0 ? {
          bag: (0, runtime2.textListGutter)(value45, slide.lists) !== void 0 && value45.style?.paddingLeft === void 0 ? {
            ...value45.style,
            paddingLeft: runtime2.defaultListGutter
          } : value45.style,
          kind: (0, runtime2.nodeStyleKind)(value45),
          fillMixed: selection.some((input) => {
            let value102 = (0, runtime2.selectedNode)(slide, input)?.style;
            return JSON.stringify([
              value102?.backgroundColor ?? null,
              value102?.backgroundGradient ?? null
            ]) !== JSON.stringify([
              value45.style?.backgroundColor ?? null,
              value45.style?.backgroundGradient ?? null
            ]);
          }),
          commit: (input) => callback80((source) => source.kind === value44 && (0, runtime2.nodeStyleKind)(source) !== void 0 ? (0, runtime2.updateNodeShapeStyle)(source, input) : source),
          update: (input) => callback80((source) => source.kind === value44 && (0, runtime2.nodeStyleKind)(source) !== void 0 ? (0, runtime2.updateNodeShapeStyle)(source, input(source.style)) : source),
          live: (input) => callback77((source) => source.kind === value44 && (0, runtime2.nodeStyleKind)(source) !== void 0 ? (0, runtime2.updateNodeShapeStyle)(source, input) : source),
          liveWith: (input) => callback77((source) => source.kind === value44 && (0, runtime2.nodeStyleKind)(source) !== void 0 ? (0, runtime2.updateNodeShapeStyle)(source, input(source.style)) : source),
          settle: () => callback79()
        } : null, value68 = value48 !== null && selection.length === 1 && NODE_BACKGROUND_AND_PADDING_PROPERTIES.some((input) => value48.style?.[input] !== void 0), value69 = value67 !== null && (value44 === "stack" || value44 === "grid" || value44 === "overlay") ? value45 : void 0, value70 = value67 !== null && selection.length === 1 && value45?.kind === "img" ? value45 : null, value71 = value67 !== null && value44 === "shape" && value45?.kind === "shape" && value45.shape !== "connector" && value45.shape !== "line" ? value45 : null, value72 = value71 !== null && !selection.some((input) => {
          let value102 = (0, runtime2.selectedNode)(slide, input);
          return value102?.kind === "shape" && value102.shape !== "connector" && (0, runtime2.shapeHasOutline)(value102.style);
        }) ? runtime2.BORDER_REQUIRED_REASON : void 0, value73 = value48?.align ?? "start", value74 = value7, value75 = getEditorViewportBounds(stageRef.current, topInset), value76 = value75.right - value75.left - 16, value77 = value48 !== null && value34 !== null, value78 = value48 ? value77 ? value7 ? 320 : 360 : (value7 ? 370 : 300) + (value7 ? 125 : 105) : 0, value79 = value7 ? 44 : 32, value80 = value66 !== null ? value7 ? 52 : 46 : 0, value81 = (value69 !== void 0 || value68 ? (value7 ? 52 : 46) + value79 * 3 + 16 : 0) + (value71 !== null ? (value7 ? 52 : 46) + value79 + 8 : 0) + (value70 !== null ? value79 * 3 + 8 : 0) + (value60 !== null ? value7 ? 200 : 150 : 0), value82 = ((0, runtime2.commentsAvailable)() ? 1 : 0) + (value7 && onDeleteSelection !== void 0 ? 1 : 0) + (onOpenInspector !== void 0 ? 1 : 0), value83 = value7 ? 0 : 8, value84 = (value48 && !value77 ? 12 + value83 : 0) + (value69 !== void 0 || value68 ? 4 + value83 : 0) + (value71 !== null ? 2 : 0) + (value70 !== null ? 2 : 0) + Math.max(0, value82 - 1) * 2 + (value82 > 0 && value60 === null ? value83 : 0) + value83, value85 = value78 + value80 + value81 + value82 * value79 + 16 - value84, value86 = !value74 && value85 > value76, value87 = Math.min(value85, value76), value88 = value7 ? 44 : 34, value89 = !value74 && value87 >= value76 ? value88 * 2 : value88, value90 = (0, runtime2.rotatedRectBounds_Rn)(lastSelectedRect), value91 = null, { top: value92, placed: value93, overlaps: value94 } = placeFloatingEditorToolbar({
          selTop: value59.top + value90.y * scale,
          selBottom: value59.top + (value90.y + value90.h) * scale,
          menuH: value89,
          bandTop: value75.top,
          bandBottom: constrainEditorBandBottom(value75.bottom - (bottomInset ?? 0), window.innerHeight, value8),
          caret: value43 ? () => value91 = ref20.current = getEditableCaretClientRect() ?? ref20.current : () => null
        });
        ref19.current = value94 && value43 ? {
          box: value91
        } : null;
        let value95 = Math.max(value75.left + 8, Math.min(value59.left + value90.x * scale, value75.right - value87 - 8)), value96 = lastSelectedUnit != null && (0, runtime2.commentsAvailable)() ? (input) => {
          let bounds = input.getBoundingClientRect();
          value43 ? runtime2.FrameViewportReactDom.flushSync(() => callback8()) : callback8();
          let entry = frameElementsRef.current.get(lastSelectedUnit.frameId), value102 = lastSelectedUnit.child === void 0 ? entry : entry?.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(lastSelectedUnit).join(".") + '"]');
          if (!value102)
            return;
          let value103 = lastSelectedUnit.child === void 0 ? [] : (0, runtime2.selectionNodePath)(lastSelectedUnit);
          (0, runtime2.getCommentAnchorController)() ? (0, runtime2.composeFrameComment)({
            kind: "frame",
            slideId: slide.id,
            frameId: lastSelectedUnit.frameId,
            path: value103
          }, value102, {
            x: bounds.left + bounds.width / 2,
            y: bounds.bottom
          }, (input2) => (0, runtime2.describeFrameCommentAnchor)(slideNumber, slide, input2, allTypeStyles)) : (0, runtime2.openCommentComposer)(value102);
        } : null, value97 = (() => {
          if (value48 === null || value67 === null)
            return null;
          let style = value48.style, value102 = style?.fontFamily, value103 = (0, runtime2.fontFamilyChoiceValue)(value102, faces), value104 = value49 === "neutral", callback81 = (input) => (0, runtime2.resolveNodeTypographyStyle)(input, resolvedTypeStyles, resolvedDeckTypeStyles, value49), value105 = (0, runtime2.nodeTypographyCombo)(value48, value49), callback82 = (input, options, context, value106) => ({
            value: style?.[input],
            placeholder: String(value105[input]),
            min: options,
            max: context,
            step: value106,
            onValue: (input2) => input2 === void 0 ? callback73((input3) => {
              let value107 = callback81(input3)?.[input], value108 = input === "letterSpacing" ? 0 : (0, runtime2.typeScaleForRole)(input3.role, value49)[input];
              return (0, runtime2.patchNodeStyle)(input3, {
                [input]: value107 === void 0 || value107 === value108 ? void 0 : value107
              });
            }) : value67.commit({
              [input]: input2
            }),
            onScrub: (input2) => value67.live({
              [input]: input2
            }),
            onScrubEnd: value67.settle
          });
          return {
            family: {
              value: value103,
              options: [
                ...value104 ? value103 === "" ? [
                  {
                    value: "",
                    label: SYSTEM_FONT_LABEL
                  }
                ] : [] : [
                  {
                    value: "",
                    label: STYLE_DEFAULT_LABEL
                  }
                ],
                ...(0, runtime2.fontFamilyOptions)(faces, value102, facesFull)
              ],
              searchable: !0,
              onOpenChange: (input) => input && (0, runtime2.ensureGoogleFonts)(runtime2.fontFamilyChoices),
              onChange: (input) => {
                let value106 = (0, runtime2.fontFamilyPatchFromChoice)(input, faces, value102);
                callback80((source) => source.kind === value44 ? (0, runtime2.patchNodeStyle)(source, {
                  fontFamily: value106.fontFamily
                }) : source, value106.face);
              }
            },
            face: {
              weight: value105.fontWeight,
              italic: value105.italic,
              faces: (0, runtime2.resolvedFontVariants)(value102, value48.role, fonts),
              onOpenChange: (input) => input && refreshFontOptions((input2) => input2 + 1),
              onChange: (input, options) => callback80((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                fontWeight: input === Math.round((0, runtime2.renderingTypeScaleForRole)(source.role).fontWeight / 100) * 100 ? void 0 : input,
                fontStyle: options ? "italic" : void 0
              }) : source)
            },
            size: callback82("fontSize", 8, 400),
            lineHeight: callback82("lineHeight", 0.5, 4, 0.05),
            letterSpacing: callback82("letterSpacing", -24, 32, 0.5)
          };
        })(), value98 = value70 !== null && lastSelectedUnit != null ? lastSelectedUnit : null, value99 = onDeleteSelection === void 0 ? void 0 : () => {
          callback42() && (callback8(), deleteSelectionRef.current?.());
        }, value100 = selection.length > 1 ? (0, runtime2.formatMessage)({
          defaultMessage: "删除这些元素",
          id: "K4rCylTJtH"
        }) : void 0, value101 = value98 !== null && imageCropController.session === null ? imageCropController.reason(value98) : void 0, startSelectionLink = () => {
          let element = slideSurfaceRef.current?.querySelector("[data-text-path][contenteditable]") ?? null, domSelection = element?.ownerDocument.defaultView?.getSelection();
          if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed || element === null || !element.contains(domSelection.anchorNode))
            return;
          ref54.current = value36;
          let existing = (0, runtime2.readRichTextSelection)(element)?.href ?? "", draft = value34, keepTyped = draft !== null && draft.url !== "" && draft.url !== draft.filled;
          value35({
            range: domSelection.getRangeAt(0),
            url: keepTyped && draft !== null ? draft.url : existing,
            filled: keepTyped && draft !== null ? draft.filled : existing,
            editable: element
          }), element.ownerDocument.querySelector("[data-slides-strip] [data-link-mode] input")?.focus();
        };
        value43 && value48 !== null && value97 !== null && (openSelectionLink = startSelectionLink), value40 = runtime2.FrameViewportReactDom.createPortal(CanvasEditorJsx.jsx(runtime2.ToolbarStrip, {
          "data-mc-chrome": "",
          "data-slides-strip": "",
          surface: "popover",
          "aria-label": value46,
          onKeyDown: value47,
          ...value43 ? {
            "data-session-strip": ""
          } : {},
          placed: value93,
          coversSelection: value94,
          wrap: !value74,
          style: {
            position: "fixed",
            left: value95,
            top: value92,
            maxWidth: value76
          },
          children: value48 !== null && value97 !== null ? CanvasEditorJsx.jsx(TextFormattingToolbar, {
            selKey: selectionKey2,
            compact: value86,
            oneRow: value74,
            styleValue: value62 || value61 === null ? null : value61.id,
            styleChip: value62 ? runtime2.MIXED_LABEL : value61 === null ? (0, runtime2.nodeTypographyLabel)(value48, value49) : void 0,
            styleOptions: typeStyleOptions,
            onStyle: (input) => {
              let value102 = resolvedTypeStyles.find((input2) => input2.id === input);
              value102 !== void 0 && callback73((input2) => (0, runtime2.applyTypographyStyle)(input2, value102, value49));
            },
            custom: value97,
            color: {
              value: value63 || value48.fill !== void 0 || value48.color === void 0 ? null : (0, runtime2.selectedSwatchName)(colorPalette.quick, value48.color),
              paint: value63 ? void 0 : (value48.fill?.kind === "gradient" ? (0, runtime2.textFillCssImage)(value48.fill) : void 0) ?? (0, runtime2.resolveSlideColor)(value48.color) ?? (0, runtime2.slideTextColor)(slide.bg),
              swatches: colorPalette.quick,
              onChange: (input) => {
                let value102 = (0, runtime2.namedSwatchColor)(colorPalette.quick, input);
                value102 !== void 0 && callback73((input2) => ({
                  ...(0, runtime2.setTextFill)(input2, void 0),
                  color: value102
                }));
              },
              custom: {
                seed: (0, runtime2.resolveSlideColor)(value48.color) ?? (0, runtime2.slideTextColor)(slide.bg),
                onChange: (input) => {
                  let value102 = (0, runtime2.slideColorOrUndefined)(input);
                  value102 !== void 0 && callback77((source) => source.kind === "text" ? {
                    ...(0, runtime2.setTextFill)(source, void 0),
                    color: value102
                  } : source);
                },
                onPickEnd: () => callback79(),
                contrast: !value63 && value52.every((input) => input.fill === void 0) ? (0, runtime2.selectionContrastBackground)(slide, selection, value49, runtime2.TEXT_CONTRAST_NODE_KINDS) : void 0
              },
              runContrast: value48.fill === void 0 ? (0, runtime2.selectionContrastBackground)(slide, selection, value49, runtime2.TEXT_CONTRAST_NODE_KINDS, {
                runs: !0
              }) : void 0,
              fill: {
                node: value48,
                slideBg: slide.bg,
                swatches: colorPalette.rows,
                fillMixed: value52.some((input) => JSON.stringify(input.fill ?? null) !== JSON.stringify(value48.fill ?? null)),
                updateNodes: callback80,
                liveUpdateNodes: callback77,
                end: callback79,
                pickImage
              }
            },
            bold: value50,
            onBold: callback74,
            wholeBold: value55,
            italic: value51,
            onItalic: callback75,
            wholeItalic: value56,
            underline: value53,
            underlineDead: value48 !== null && value52.length > 0 && value52.every((input) => input.style?.textDecorationLine === "line-through") ? (0, runtime2.formatMessage)({
              defaultMessage: "文字已添加删除线，可在“属性 › 高级”中修改",
              id: "UaJxxIIumm"
            }, { count: value52.length }) : null,
            onUnderline: callback76,
            align: value73,
            alignMixed: value64,
            onAlign: (input) => callback73((input2) => {
              let state2 = {
                ...input2
              };
              return input === "start" ? delete state2.align : state2.align = input, state2;
            }),
            list: value48.list,
            listMixed: value65,
            onList: (input) => callback73((input2) => (0, runtime2.setNodeList)(input2, input, slide.lists)),
            elementLink: value48 !== null ? (0, runtime2.nodeUniformLink)(value48) : void 0,
            linkOpener: elementLinkOpenerRef,
            onLinkClosed: () => void callback16(),
            onElementLink: (input) => {
              let changes = [];
              callback73((input2) => {
                let next = input === void 0 && (0, runtime2.nodeUniformLink)(input2) === void 0 ? input2 : (0, runtime2.setNodeLink)(input2, input);
                return changes.push([
                  describeTextLinks(input2),
                  describeTextLinks(next)
                ]), next;
              }), announceLinkChanges(changes);
            },
            session: value43 ? {
              linkDraft: value34,
              setLinkDraft: value35,
              onLinkClick: startSelectionLink,
              commitFromEditable: (input) => {
                (0, runtime2.clearRichTextUndoState)(input), value39?.onRichCommit?.((0, runtime2.readEditableRichText)(input, !0));
              }
            } : null,
            extra: value68 && value67 !== null ? CanvasEditorJsx.jsx(runtime2.BoxStyleToolbar, {
              compact: value86,
              wrap: !value74,
              swatches: colorPalette.quick,
              io: value67,
              padding: !0,
              corner: (0, runtime2.cornerStyleBindings)(value67)
            }) : null,
            onDelete: value99,
            deleteTitle: value100,
            onComment: value96,
            onOpenInspector,
            moreMenu
          }) : CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
            children: [
              value66 !== null && CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
                children: [
                  CanvasEditorJsx.jsx(runtime2.ToolbarGroup, {
                    wrap: !value74,
                    children: CanvasEditorJsx.jsx(runtime2.SessionColorPopover, {
                      testid: "frame-color",
                      editsAreUndoSteps: !0,
                      title: value66.title,
                      paint: value66.paint,
                      swatches: colorPalette.quick,
                      value: value66.current !== void 0 ? (0, runtime2.selectedSwatchName)(colorPalette.quick, value66.current) : null,
                      onSwatch: (input) => {
                        let value102 = (0, runtime2.namedSwatchColor)(colorPalette.quick, input);
                        value102 !== void 0 && callback80((input2) => value66.apply(input2, value102));
                      },
                      custom: {
                        seed: value66.seed,
                        unset: value66.unset,
                        onChange: callback78,
                        onPickEnd: callback79,
                        contrast: value66.contrast
                      }
                    }, selectionKey2)
                  }),
                  value86 ? null : CanvasEditorJsx.jsx(runtime2.ToolbarDivider, {})
                ]
              }),
              value69 !== void 0 && value67 !== null ? CanvasEditorJsx.jsx(runtime2.BoxStyleToolbar, {
                compact: value86,
                wrap: !value74,
                swatches: colorPalette.quick,
                io: value67,
                padding: !0,
                corner: (0, runtime2.cornerStyleBindings)(value67)
              }, selectionKey2) : null,
              value71 !== null && value67 !== null ? CanvasEditorJsx.jsx(runtime2.BoxStyleToolbar, {
                compact: value86,
                wrap: !value74,
                swatches: colorPalette.quick,
                io: value67,
                padding: !1,
                border: {
                  sides: runtime2.SHAPE_BORDER_SIDES_REASON,
                  widthMax: runtime2.maxShapeStrokeWidth
                },
                noneReason: value72
              }, selectionKey2) : null,
              value70 !== null && value98 !== null && value67 !== null ? CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
                children: [
                  CanvasEditorJsx.jsxs(runtime2.ToolbarGroup, {
                    wrap: !value74,
                    children: [
                      null,
                      null,
                      CanvasEditorJsx.jsx(runtime2.SessionImageReplaceButton, {
                        src: value70.asset !== void 0 ? assets.get(value70.asset) : value70.src,
                        title: onReplaceImage === void 0 ? "此处不支持替换图片" : (0, runtime2.imageHasPoster)(value70) ? "替换图片…" : "添加图片…",
                        disabled: onReplaceImage === void 0,
                        onClick: () => {
                          ref23.current = {
                            frameId: value98.frameId,
                            path: (0, runtime2.selectionNodePath)(value98)
                          }, ref22.current?.click();
                        }
                      }),
                      CanvasEditorJsx.jsx(runtime2.ToolbarStripButton, {
                        "data-testid": "frame-image-crop",
                        "data-media-crop-keep": "",
                        icon: CanvasEditorJsx.jsx(runtime2.PropertyIcon, {
                          icon: runtime2.CROP_ICON
                        }),
                        title: value101 ?? (imageCropController.session !== null ? "完成裁剪（或按 Enter）" : "裁剪（或双击图片）"),
                        "aria-label": "裁剪",
                        "aria-pressed": imageCropController.session !== null,
                        disabled: value101 !== void 0,
                        onClick: () => imageCropController.session !== null ? imageCropController.end(!0) : callback29(value98)
                      }),
                      CanvasEditorJsx.jsx(runtime2.CornerStylePopover, {
                        ...(0, runtime2.cornerStyleBindings)(value67)
                      }, selectionKey2)
                    ]
                  }),
                  value86 ? null : CanvasEditorJsx.jsx(runtime2.ToolbarDivider, {})
                ]
              }) : null,
              value60 !== null && lastSelectedUnit != null && CanvasEditorJsx.jsx(CanvasEditorJsx.Fragment, {
                children: CanvasEditorJsx.jsxs(runtime2.ToolbarGroup, {
                  wrap: !value74,
                  fields: !0,
                  children: [
                    CanvasEditorJsx.jsx(runtime2.SessionNumberField, {
                      testid: "frame-table-rows",
                      title: "行",
                      label: "行",
                      icon: runtime2.TABLE_ROWS_ICON,
                      value: value60.rows.length,
                      min: 1,
                      max: Math.min(runtime2.maxTableRows, value60.rows.length + callback33(value60.cols)),
                      maxReason: value60.rows.length >= runtime2.maxTableRows ? (0, runtime2.formatMessage)({
                        defaultMessage: "此表格的行数已达上限。",
                        id: "y22sp58AzJ"
                      }) : callback32(value60.cols) ?? void 0,
                      hint: "Fewer rows drop the bottom rows’ text (undoable)",
                      onValue: (input) => callback34(slide, lastSelectedUnit.frameId, (0, runtime2.selectionNodePath)(lastSelectedUnit), (input2) => (0, runtime2.resizeTable)(input2, input, input2.cols))
                    }, "r:" + selectionKey2),
                    CanvasEditorJsx.jsx(runtime2.SessionNumberField, {
                      testid: "frame-table-cols",
                      title: "列",
                      label: "列",
                      icon: runtime2.TABLE_COLUMNS_ICON,
                      value: value60.cols,
                      min: 1,
                      max: Math.min(runtime2.maxTableColumns, value60.cols + callback33(Math.max(1, value60.rows.length))),
                      maxReason: value60.cols >= runtime2.maxTableColumns ? (0, runtime2.formatMessage)({
                        defaultMessage: "此表格的列数已达上限。",
                        id: "E9+6yUP6uF"
                      }) : callback32(Math.max(1, value60.rows.length)) ?? void 0,
                      hint: "Fewer columns drop the rightmost columns’ text (undoable)",
                      onValue: (input) => callback34(slide, lastSelectedUnit.frameId, (0, runtime2.selectionNodePath)(lastSelectedUnit), (input2) => (0, runtime2.resizeTable)(input2, input2.rows.length, input))
                    }, "c:" + selectionKey2)
                  ]
                })
              }),
              CanvasEditorJsx.jsx(runtime2.SelectionActionButtons, {
                onComment: value96,
                commentTitle: selectedIsEmbeddableVideo ? "Comment on this video" : void 0,
                onDelete: value99,
                deleteTitle: value100,
                onOpenInspector,
                moreMenu
              })
            ]
          })
        }), document.body);
      }
    }
    let value57 = null;
    if (textEdit !== null && textEdit.cell !== void 0 && value39 !== null && onChangeSlide !== void 0 && !selectionMenuHidden) {
      let value59 = textEdit, { r: cell, c: cell2 } = textEdit.cell, value60 = (0, runtime2.frameById)(slide, value59.frameId), value61 = value60 ? (0, runtime2.nodeAtPath)(value60.node, value59.path) : void 0, entry = frameElementsRef.current.get(value59.frameId), value62 = value59.path.length === 0 ? entry : entry?.querySelector('[data-node-path="' + value59.path.join(".") + '"]'), value63 = (value62 ?? entry)?.getBoundingClientRect(), value64 = value39;
      if ((0, runtime2.isTableNode)(value61) && value63) {
        let callback77 = (input, options) => {
          let element = (value62 ?? document).querySelector('[data-cell="' + String(cell) + "." + String(cell2) + '"][contenteditable]'), value73 = trimTrailingTextNewlines(element?.innerText ?? value61.rows[cell]?.[cell2] ?? "");
          value64.onCommit(value73), callback34(callback66(value59, value73), value59.frameId, value59.path, input), runtime2.FrameViewportReactDom.flushSync(() => onTextEdit(null)), onTextEdit({
            frameId: value59.frameId,
            path: value59.path,
            cell: options
          });
        }, value65 = value7 ? 440 : 340, value66 = value7 ? 44 : 34, value67 = value62?.querySelector('[data-cell="' + String(cell) + "." + String(cell2) + '"]')?.getBoundingClientRect() ?? value63, value68 = getEditorViewportBounds(stageRef.current, topInset), value69 = value67.top - value66 - 8, value70 = value69 >= value68.top + 8, value71 = value70 ? value69 : Math.min(value68.bottom - value66 - 8, value67.bottom + 8), value72 = Math.max(value68.left + 8, Math.min(value67.left, value68.right - value65 - 8));
        value57 = runtime2.FrameViewportReactDom.createPortal(CanvasEditorJsx.jsxs(FloatingTableCellToolbar, {
          left: value72,
          top: value71,
          placed: value70 ? "above" : "below",
          children: [
            (() => {
              let state2 = {
                r: cell,
                c: cell2
              }, value73 = value61.cellStyles?.[String(cell) + "." + String(cell2)]?.color, value74 = value61.colAligns?.[cell2] ?? "start";
              return CanvasEditorJsx.jsxs(runtime2.ToolbarGroup, {
                children: [
                  CanvasEditorJsx.jsx(runtime2.SessionColorPopover, {
                    testid: "cell-text-color",
                    title: TEXT_COLOR_LABEL,
                    value: value73 === void 0 ? "default" : (0, runtime2.selectedSwatchName)(colorPalette.quick, value73),
                    paint: (0, runtime2.resolveSlideColor)(value73) ?? (0, runtime2.slideTextColor)(slide.bg),
                    swatches: [
                      {
                        name: "default",
                        label: THEME_DEFAULT_LABEL,
                        color: (0, runtime2.slideTextColor)(slide.bg)
                      },
                      ...colorPalette.quick
                    ],
                    onSwatch: (input) => {
                      let value75 = input === "default" ? void 0 : (0, runtime2.namedSwatchColor)(colorPalette.quick, input);
                      (input === "default" || value75 !== void 0) && callback77((input2) => (0, runtime2.setTableCellColor)(input2, cell, cell2, value75), state2);
                    }
                  }, "cc:" + String(cell) + "." + String(cell2)),
                  CanvasEditorJsx.jsx(runtime2.SessionChoicePopover, {
                    testid: "cell-text-align",
                    title: (0, runtime2.formatMessage)({
                      defaultMessage: "列对齐：{alignment}",
                      id: "T3oUnnhKjk"
                    }, { alignment: TEXT_ALIGNMENT_LABELS[value74] }),
                    face: TEXT_ALIGNMENT_ICONS[value74],
                    value: value74,
                    options: TABLE_TEXT_ALIGNMENT_OPTIONS,
                    onChange: (input) => {
                      input !== "justify" && callback77((input2) => (0, runtime2.setTableColumnAlignment)(input2, cell2, input), state2);
                    }
                  }, "ca:" + String(cell2))
                ]
              });
            })(),
            CanvasEditorJsx.jsx(runtime2.ToolbarDivider, {}),
            CanvasEditorJsx.jsx(runtime2.SelectionActionButtons, {
              onComment: (0, runtime2.commentsAvailable)() && value62 ? (input) => {
                let bounds = input.getBoundingClientRect(), value73 = Math.min(8, value67.width / 2), value74 = Math.min(8, value67.height / 2), state2 = {
                  x: Math.min(value67.right - value73, Math.max(value67.left + value73, bounds.left + bounds.width / 2)),
                  y: Math.min(value67.bottom - value74, Math.max(value67.top + value74, bounds.bottom))
                };
                runtime2.FrameViewportReactDom.flushSync(() => callback8()), (0, runtime2.getCommentAnchorController)() ? (0, runtime2.composeFrameComment)({
                  kind: "frame",
                  slideId: slide.id,
                  frameId: value59.frameId,
                  path: [...value59.path]
                }, value62, state2, (input2) => (0, runtime2.describeFrameCommentAnchor)(slideNumber, slide, {
                  ...input2,
                  cell: {
                    r: cell,
                    c: cell2
                  }
                }, allTypeStyles)) : (0, runtime2.openCommentComposer)(value62);
              } : null,
              onOpenInspector,
              moreMenu
            })
          ]
        }), document.body);
      }
    }
    let value58 = CanvasEditorJsx.jsxs("div", {
      ref: stageRef,
      "data-slides-ground": "",
      role: "group",
      "aria-labelledby": value16,
      tabIndex: -1,
      className: (0, runtime2.joinClassNames)("relative h-full w-full overflow-hidden outline-none", surround ? "bg-transparent" : "bg-editor-canvas", value2 !== null && "select-none"),
      onPointerDownCapture: (event) => {
        callback21(event.target) || value18(!1);
      },
      onKeyDownCapture: () => {
        ref29.current = 0;
      },
      onPointerDown: (event) => {
        if (ref13.current.has(event.pointerId) || callback21(event.target) || (0, runtime2.isMacControlClick)(event))
          return;
        let value59 = textEdit !== null;
        if (value59 && (event.pointerType === "touch" || event.button !== 0 || !callback42()))
          return;
        let value60 = !value59 && event.button === 0 && !pointInsideSlide(event.clientX, event.clientY);
        ref14.current = {
          pointerId: event.pointerId,
          sx: event.clientX,
          sy: event.clientY,
          outside: value60
        };
        let value61 = isFrameOrResizeTarget(event.target) || event.target?.closest?.("[data-mc-chrome]") != null;
        if (!value59 && !commenting && !(surround && value60) && canStartCanvasRectSelection({
          pointerType: event.pointerType,
          button: event.button,
          surface: value61 ? "object" : "empty",
          textEdit: !1
        })) {
          let value62 = event.shiftKey || event.ctrlKey || event.metaKey;
          callback40(event, event.currentTarget, value62 ? [...selection] : [], null);
        }
      },
      onPointerMove: (input) => {
        let current = ref15.current;
        if (current === null || current.pointerId !== input.pointerId)
          return;
        if (input.buttons === 0) {
          ref15.current = null, value3(null);
          return;
        }
        if (!current.live && Math.abs(input.clientX - current.sx) + Math.abs(input.clientY - current.sy) < pointerDragThreshold(input.pointerType))
          return;
        current.live = !0;
        let state2 = {
          x: Math.min(current.sx, input.clientX),
          y: Math.min(current.sy, input.clientY),
          w: Math.abs(input.clientX - current.sx),
          h: Math.abs(input.clientY - current.sy)
        };
        value3({
          left: state2.x - current.ox,
          top: state2.y - current.oy,
          width: state2.w,
          height: state2.h
        });
        let value59 = collectUnitsIntersectingSelectionRect(state2, callback41(), current.base), value60 = (0, runtime2.selectionsKey)(value59);
        value60 !== current.lastKey && (current.lastKey = value60, onSelectionChange(value59));
      },
      onPointerUp: (input) => {
        let current = ref15.current;
        current !== null && current.pointerId === input.pointerId && (ref15.current = null, value3(null), !current.live && current.clickSelect !== null && onSelectionChange(current.clickSelect));
        let current2 = ref14.current;
        current2 === null || current2.pointerId !== input.pointerId || (ref14.current = null, Math.abs(input.clientX - current2.sx) + Math.abs(input.clientY - current2.sy) < pointerDragThreshold(input.pointerType) && (onSelectionChange([]), current2.outside && surround?.onOutsideClick(input.clientX, input.clientY)));
      },
      onPointerCancel: (input) => {
        let current = ref15.current;
        current !== null && current.pointerId === input.pointerId && (ref15.current = null, value3(null));
        let current2 = ref14.current;
        current2 !== null && current2.pointerId === input.pointerId && (ref14.current = null);
      },
      onDoubleClick: (event) => {
        textEdit || isFrameOrResizeTarget(event.target) || event.target?.closest?.("[data-mc-chrome]") == null && (surround || (callback2(), ref6.current = null, setManualViewport(null)));
      },
      onContextMenu: (event) => {
        let target = event.target;
        (event.nativeEvent.pointerType === "touch" || touchPressRef.current !== null || dragSessionRef.current?.type === "touch") && textEdit === null && !readOnly && slideSurfaceRef.current?.contains(target) && event.preventDefault();
        let value59 = event.nativeEvent.pointerType === "touch" || dragSessionRef.current !== null || touchPressRef.current !== null || commenting === !0, value60 = (0, runtime2.isPlainMousePointer)(event.nativeEvent), value61 = textEdit !== null || (0, runtime2.isContextMenuEditingTarget)(target) || !event.currentTarget.contains(target) || target.closest("[data-mc-chrome]") !== null || value60 && target.closest('button,a[href],[role="button"]') !== null || surround !== void 0 && !value60 && !pointInsideSlide(event.clientX, event.clientY);
        if (onMenu === void 0 || readOnly || value59 || value61 || (event.preventDefault(), ref15.current?.live === !0))
          return;
        if (value60) {
          let value67 = callback17();
          return value67 === null ? void 0 : onMenu({
            ...value67,
            from: "key"
          }, [...selection]);
        }
        let state2 = {
          x: event.clientX,
          y: event.clientY,
          from: "right-click"
        }, value62 = (0, runtime2.frameById)(slide, target.closest("[data-frame-id]")?.getAttribute("data-frame-id") ?? ""), value63 = value62 ? (0, runtime2.resolvePointerSelection)(value62.id, value62.node, parseEditorNodePath(target.closest("[data-node-path]")?.getAttribute("data-node-path")), selection, getFrameHitTestOptions(slide, value62)) : null, value64 = value63?.grab ?? null;
        if (ref14.current = null, value64 === null) {
          let value67 = selection.length > 0 && target.closest("[data-resize-handle]") !== null;
          return value67 || onSelectionChange([]), onMenu(state2, value67 ? [...selection] : []);
        }
        let value65 = selection.some((input) => input.frameId === value64.frameId && isStrictPathAncestor((0, runtime2.selectionNodePath)(input), (0, runtime2.selectionNodePath)(value64))), value66 = (0, runtime2.selectionContainsNode)(selection, value64) || value65 || value63?.add != null && (0, runtime2.selectionContainsNode)(selection, value63.add);
        value66 || onSelectionChange([value64]), onMenu(state2, value66 ? [...selection] : [value64]);
      },
      onDragOver: callback71,
      onDrop: callback72,
      children: [
        CanvasEditorJsx.jsx("span", {
          id: value14,
          hidden: !0,
          children: slideKeyboardInstructions
        }),
        Object.keys(EDITOR_ENTER_KEY_HINTS).map((input) => CanvasEditorJsx.jsx("span", {
          id: value15 + "-" + input,
          hidden: !0,
          children: EDITOR_ENTER_KEY_HINTS[input]
        }, input)),
        CanvasEditorJsx.jsx("span", {
          id: value15 + "-toolbar",
          hidden: !0,
          children: "按 " + (0, runtime2.spokenShortcut)((0, runtime2.formatCommandShortcut)("F6")) + " 可跳转到格式工具栏。"
        }),
        keyboardTargets.map((input) => input.shown === void 0 ? null : CanvasEditorJsx.jsxs(runtime2.reactK_.Fragment, {
          children: [
            CanvasEditorJsx.jsx("span", {
              id: shownBeforeIdPrefix + input.key,
              hidden: !0,
              children: selectedCountPrefix(input.key) + input.shown.before
            }),
            CanvasEditorJsx.jsx("span", {
              id: shownAfterIdPrefix + input.key,
              hidden: !0,
              children: input.shown.after
            })
          ]
        }, input.key)),
        CanvasEditorJsx.jsxs("div", {
          ref: slideSurfaceRef,
          "data-slide-surface": "",
          tabIndex: commenting && commentStop ? -1 : 0,
          role: "group",
          "aria-label": slideName,
          "aria-busy": busy ? !0 : void 0,
          "aria-describedby": commenting ? void 0 : value14,
          onKeyDown: callback18,
          onClick: (event) => {
            event.target === event.currentTarget && (0, runtime2.isKeyboardOrPrimaryActivation)(event) && !commenting && callback15();
          },
          onPointerDownCapture: (input) => {
            ref29.current = performance.now(), input.pointerType === "touch" && callback7(null);
          },
          onPointerUpCapture: () => {
            ref29.current = performance.now();
          },
          onBlur: (event) => {
            let relatedTarget = event.relatedTarget;
            relatedTarget instanceof Node && !event.currentTarget.contains(relatedTarget) && ref42.current?.contains(relatedTarget) !== !0 && (ref28.current = null), event.target === event.currentTarget && value23(!1);
          },
          onFocus: (event) => {
            ref28.current = event.target, event.target === event.currentTarget && (performance.now() - ref29.current < 500 ? callback8() : value23(event.currentTarget.matches(":focus-visible")));
          },
          className: "absolute shadow-lg touch-none outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-app-accent",
          style: {
            left: -value.x * scale,
            top: -value.y * scale,
            width: runtime2.SLIDE_WIDTH * scale,
            height: runtime2.SLIDE_HEIGHT * scale
          },
          onDoubleClick: callback63,
          onPointerMove: (event) => {
            if (lastPointerTargetRef.current = event.target, lastPointerSlideRef.current = slideRef.current, event.altKey !== altPressedRef.current && setAltPressed(event.altKey), event.altKey && callback6(lastPointerTargetRef.current), event.pointerType !== "touch" && (callback7(lastPointerTargetRef.current), value20(!1)), !onPointerNorm)
              return;
            let bounds = event.currentTarget.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0)
              return;
            let value59 = (event.clientX - bounds.left) / bounds.width, value60 = (event.clientY - bounds.top) / bounds.height;
            value59 >= 0 && value59 <= 1 && value60 >= 0 && value60 <= 1 && onPointerNorm(value59, value60);
          },
          onPointerLeave: () => {
            lastPointerTargetRef.current = null, callback6(null), callback7(null);
          },
          children: [
            CanvasEditorJsx.jsx(FormattingToolbarTransition, {
              on: lookPreview !== void 0,
              children: CanvasEditorJsx.jsx(runtime2.SlideCanvas, {
                slide: imageCropController.slide ?? dragPreviewSlide ?? lookPreview ?? slide,
                assets,
                width: runtime2.SLIDE_WIDTH * scale,
                editorChrome: !readOnly,
                links: readOnly ? "view" : "edit",
                interactive: {
                  registerFrame: callback25,
                  onFramePointerDown: callback43,
                  editing: value39,
                  plainPress: isPlainPress,
                  selectedFrameIds: selection.map((input) => input.frameId),
                  soleSelected: selection.length === 1 && selection[0] !== void 0 ? selection[0].frameId + "/" + (0, runtime2.selectionNodePath)(selection[0]).join(".") : void 0,
                  cropping: imageCropController.session !== null ? imageCropController.session.unit.frameId + "/" + (0, runtime2.selectionNodePath)(imageCropController.session.unit).join(".") : void 0,
                  cardWordsIds: value13
                }
              })
            }),
            CanvasEditorJsx.jsxs("div", {
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: runtime2.SLIDE_WIDTH,
                height: runtime2.SLIDE_HEIGHT,
                transform: "scale(" + String(scale) + ")",
                transformOrigin: "top left",
                pointerEvents: "none"
              },
              children: [
                CanvasEditorJsx.jsxs("div", {
                  className: "absolute inset-0 overflow-hidden",
                  children: [
                    CanvasEditorJsx.jsx("span", {
                      className: "sr-only",
                      role: "status",
                      children: pending.length > 0 ? "正在上传 " + (pending[0]?.what ?? "image") : ""
                    }),
                    pending.map((input) => CanvasEditorJsx.jsx("div", {
                      className: "absolute overflow-hidden",
                      style: {
                        left: input.rect.x,
                        top: input.rect.y,
                        width: input.rect.w,
                        height: input.rect.h
                      },
                      children: input.what === "video" ? CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
                        children: [
                          CanvasEditorJsx.jsx("img", {
                            src: input.url,
                            alt: "",
                            draggable: !1,
                            className: "block h-full w-full object-cover opacity-50 blur-[1.5px] saturate-50"
                          }),
                          CanvasEditorJsx.jsx("span", {
                            className: "absolute top-1/2 left-1/2 flex rounded-full bg-black/40 p-1.5 text-white",
                            style: {
                              transform: "translate(-50%, -50%) scale(" + String(1 / scale) + ")"
                            },
                            children: CanvasEditorJsx.jsx(runtime2.Spinner, {
                              size: "lg",
                              inheritColor: !0
                            })
                          })
                        ]
                      }) : CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
                        children: [
                          CanvasEditorJsx.jsx("img", {
                            src: input.url,
                            alt: "",
                            draggable: !1,
                            className: "block h-full w-full object-cover"
                          }),
                          CanvasEditorJsx.jsx("span", {
                            className: "slides-uploading absolute inset-0 block bg-fg-muted"
                          })
                        ]
                      })
                    }, input.id))
                  ]
                }),
                CanvasEditorJsx.jsx(runtime2.AlignmentGuides, {
                  guides: snapGuides,
                  scale
                }),
                endpointSnapPoint !== null ? CanvasEditorJsx.jsx("div", {
                  "data-testid": "endpoint-site",
                  style: {
                    position: "absolute",
                    left: endpointSnapPoint.x - 7 / scale,
                    top: endpointSnapPoint.y - 7 / scale,
                    width: 14 / scale,
                    height: 14 / scale,
                    boxSizing: "border-box",
                    borderWidth: 1.5 / scale,
                    borderStyle: "solid",
                    borderColor: "var(--t-app-accent)",
                    borderRadius: "50%",
                    pointerEvents: "none"
                  }
                }) : null,
                peerLayer?.(1 / scale, callback30),
                flowDropPreview !== null ? CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
                  children: [
                    CanvasEditorJsx.jsx(runtime2.SelectionRing, {
                      "data-testid": "drop-target",
                      frame: flowDropPreview.box,
                      scale,
                      state: "hover"
                    }),
                    flowDropPreview.bar !== null ? CanvasEditorJsx.jsx("div", {
                      "data-testid": "drop-slot",
                      style: {
                        position: "absolute",
                        left: flowDropPreview.bar.x,
                        top: flowDropPreview.bar.y,
                        width: flowDropPreview.bar.w,
                        height: flowDropPreview.bar.h,
                        borderRadius: 1 / scale,
                        backgroundColor: "color-mix(in srgb, var(--t-app-accent) 55%, transparent)"
                      }
                    }) : null
                  ]
                }) : null,
                hoverRect !== null ? CanvasEditorJsx.jsx(runtime2.SelectionRing, {
                  "data-testid": "hover-ring",
                  frame: hoverRect,
                  scale,
                  rotation: hoverRect.rotation,
                  state: "hover"
                }) : null,
                textEdit ? null : selection.map((input, options) => {
                  let value59 = selectionRects[options];
                  if (!value59 || imageCropController.session !== null)
                    return null;
                  let value60 = !readOnly && singleTransformTarget !== null && (0, runtime2.selectionsEqual)(input, singleTransformTarget.unit), value61 = value60 && !singleTransformTarget?.flow ? (0, runtime2.selectedNode)(slide, input)?.kind : void 0, value62 = value61 === "table" || value59.rotation !== void 0 && value61 === "text", value63 = singleStyleTarget !== null && (0, runtime2.selectionsEqual)(input, singleStyleTarget), value64 = selection.length === 1 ? (0, runtime2.selectedNode)(slide, input) : void 0, value65 = value64 !== void 0 && (0, runtime2.isConnectorNode)(value64);
                  if (value64 !== void 0 && ((0, runtime2.isConnectorNode)(value64) || (0, runtime2.isLineShapeNode)(value64))) {
                    let [value66, value67] = (0, runtime2.isLineShapeNode)(value64) ? (0, runtime2.lineShapeEndpoints)(value59, value64.rotate) : (0, runtime2.absoluteConnectorEndpoints)(value59, value64.from, value64.strokeWidth), value68 = (0, runtime2.isLineShapeNode)(value64) ? [
                      {
                        x: value66[0],
                        y: value66[1]
                      },
                      {
                        x: value67[0],
                        y: value67[1]
                      }
                    ] : (0, runtime2.connectorGeometry)(value59.w, value59.h, value64).points.map(([input2, input3]) => ({
                      x: value59.x + input2,
                      y: value59.y + input3
                    })), value69 = (0, runtime2.selectionNodePath)(input), value70 = (0, runtime2.frameById)(slide, input.frameId)?.node ?? value64, value71 = value69.length > 0 ? (0, runtime2.nodeAtPath)(value70, value69.slice(0, -1)) : void 0, value72 = value71 !== void 0 && (0, runtime2.isFlowContainer)(value71), value73 = value69.every((input2, options2) => {
                      let value75 = (0, runtime2.nodeAtPath)(value70, value69.slice(0, options2));
                      return value75 === void 0 || (0, runtime2.nodeTransform)(value75) === void 0;
                    }) && (value69.length === 0 || value72 || value71 !== void 0 && (0, runtime2.isOverlayNode)(value71) && value69[value69.length - 1] >= 1), value74 = (0, runtime2.isLineShapeNode)(value64) ? Math.min(value59.w, value59.h) + 0.5 : 2 * (0, runtime2.connectorArrowInset)(value64.strokeWidth) + 0.5;
                    if (value73)
                      return CanvasEditorJsx.jsx(runtime2.SelectionPoints, {
                        points: [
                          {
                            x: value66[0],
                            y: value66[1]
                          },
                          {
                            x: value67[0],
                            y: value67[1]
                          }
                        ],
                        shaft: value68,
                        scale,
                        cursor: value72 ? value59.h <= value74 ? "ew-resize" : value59.w <= value74 ? "ns-resize" : value64.from === "tr" || value64.from === "bl" ? "nesw-resize" : "nwse-resize" : "move",
                        onPointDragStart: readOnly ? void 0 : callback61
                      }, (0, runtime2.selectionKey)(input));
                  }
                  return CanvasEditorJsx.jsx(runtime2.SelectionRing, {
                    frame: value59,
                    scale,
                    rotation: value59.rotation,
                    grips: !value60 || value65 ? "none" : value62 ? HORIZONTAL_GROUP_RESIZE_HANDLES : void 0,
                    onResizeStart: callback59,
                    onGripDoubleClick: (input2) => callback58(placementSideToSnapLine(input2.x), placementSideToSnapLine(input2.y)),
                    onRotateStart: value63 ? callback62 : void 0,
                    angleLabel: value63 && rotationPreviewAngle !== null ? String(rotationPreviewAngle) + "°" : void 0
                  }, (0, runtime2.selectionKey)(input));
                }),
                textEdit !== null && textEditRect !== null && imageCropController.session === null ? CanvasEditorJsx.jsx(runtime2.SelectionRing, {
                  "data-testid": "text-edit-ring",
                  frame: textEditRect,
                  scale,
                  rotation: textEditRect.rotation,
                  grips: "none"
                }) : null,
                distanceMeasurements !== null ? CanvasEditorJsx.jsx(runtime2.MeasureOverlay, {
                  m: distanceMeasurements,
                  scale
                }) : null,
                imageCropController.session !== null && value29 !== null ? ((input, options, context, value59) => CanvasEditorJsx.jsx("div", {
                  "data-mc-chrome": "",
                  "data-testid": "slides-crop",
                  style: {
                    position: "absolute",
                    left: options.x,
                    top: options.y,
                    width: options.w,
                    height: options.h,
                    transform: options.rotation ? "rotate(" + String(options.rotation) + "rad)" : void 0
                  },
                  children: CanvasEditorJsx.jsx("div", {
                    style: {
                      position: "absolute",
                      left: input.frame.x * context,
                      top: input.frame.y * context,
                      width: input.local.w,
                      height: input.local.h,
                      transform: context !== 1 ? "scale(" + String(context) + ")" : void 0,
                      transformOrigin: "0 0"
                    },
                    children: CanvasEditorJsx.jsx(runtime2.MediaCropOverlay, {
                      frame: input.local,
                      natural: input.natural,
                      crop: input.live,
                      scale: scale * context,
                      rotation: options.rotation,
                      src: value59?.kind === "img" ? (0, runtime2.cropImageSource)(value59, assets) ?? null : null,
                      onLive: imageCropController.setLive,
                      minFrame: value59 ? (0, runtime2.minimumNodeResizeSize)(value59) : void 0,
                      ...imageCropController.handlesOff !== !1 ? {
                        onFrame: imageCropController.setFrame,
                        frameHandleOff: imageCropController.handlesOff
                      } : null,
                      onDone: imageCropController.end
                    })
                  })
                }))(imageCropController.session, value29, value29.nodeScale ?? 1, (0, runtime2.selectedNode)(slide, imageCropController.session.unit)) : null
              ]
            })
          ]
        }),
        CanvasEditorJsx.jsx("div", {
          style: {
            position: "absolute",
            left: -value.x * scale,
            top: -value.y * scale,
            width: runtime2.SLIDE_WIDTH * scale,
            height: runtime2.SLIDE_HEIGHT * scale,
            pointerEvents: "none"
          },
          onFocus: (event) => {
            ref28.current = event.target;
          },
          onBlur: (input) => {
            let relatedTarget = input.relatedTarget;
            relatedTarget instanceof Node && !input.currentTarget.contains(relatedTarget) && slideSurfaceRef.current?.contains(relatedTarget) !== !0 && (ref28.current = null);
          },
          children: CanvasEditorJsx.jsx("div", {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: runtime2.SLIDE_WIDTH,
              height: runtime2.SLIDE_HEIGHT,
              transform: "scale(" + String(scale) + ")",
              transformOrigin: "top left",
              pointerEvents: "none"
            },
            children: commenting ? null : CanvasEditorJsx.jsx("div", {
              ref: ref42,
              "data-object-proxies": "",
              style: {
                "--ring-w": String(Math.ceil(2 / scale)) + "px",
                "--ring-off": String(3 / scale) + "px"
              },
              children: keyboardGroups.map((input) => CanvasEditorJsx.jsx("div", {
                "data-object-level": input.id,
                children: input.stops.map((input2) => {
                  if (input2.key === value28)
                    return null;
                  let value59 = input2.key === lastSelectedUnitKey, value60 = (value59 && measuredSelectionKey === selectionKey2 && lastSelectedRect !== null ? lastSelectedRect : unitRectCache.get(input2.key)) ?? null, value61 = selection.length > 1 && selectedUnitKeys.has(input2.key) ? "multi" : input2.opens === "enter" ? "enter" : (input2.opens, readOnly ? null : input2.opens === "edit-text" ? "text" : input2.opens === "edit-cell" ? "cell" : null), shownText = input2.shown !== void 0 && dragPreviewSlide === null && (0, runtime2.selectionKey)(input2.shown.text) !== value28 ? input2.shown.text : void 0, value62 = [
                    returnTakenHint !== void 0 ? value14 : value61 !== null ? value15 + "-" + value61 : "",
                    value42 ? value15 + "-toolbar" : ""
                  ].filter((input3) => input3 !== "").join(" ");
                  return CanvasEditorJsx.jsx("div", {
                    ref: callback9(input2.key),
                    "data-object-proxy": input2.key,
                    "data-testid": value59 ? "object-cursor" : void 0,
                    "data-object-cursor": value59 ? value17 ? "keys" : "pointer" : void 0,
                    tabIndex: -1,
                    role: "group",
                    "aria-roledescription": "object",
                    "aria-label": selectedCountPrefix(input2.key) + input2.name,
                    "aria-labelledby": shownText === void 0 ? void 0 : [
                      shownBeforeIdPrefix + input2.key,
                      // Same id the slide renderer gives the text's words (cardWordsIds).
                      value13 + ":words:" + shownText.frameId + ":" + (0, runtime2.selectionNodePath)(shownText).join("."),
                      shownAfterIdPrefix + input2.key
                    ].join(" "),
                    "aria-describedby": value62 === "" ? void 0 : value62,
                    onKeyDown: callback22,
                    onClick: callback23,
                    onFocus: callback24,
                    className: (0, runtime2.joinClassNames)(value59 && !value27 ? "outline-hidden" : "outline-none", "focus-visible:outline-solid focus-visible:outline-app-accent"),
                    style: {
                      position: "absolute",
                      left: value60?.x ?? 0,
                      top: value60?.y ?? 0,
                      width: value60?.w ?? 0,
                      height: value60?.h ?? 0,
                      outlineWidth: value60 === null ? 0 : "var(--ring-w)",
                      outlineOffset: "var(--ring-off)",
                      transform: value60?.rotation !== void 0 && value60.rotation !== 0 ? "rotate(" + String(value60.rotation) + "rad)" : void 0,
                      pointerEvents: "none"
                    }
                  }, slide.id + "/" + input2.key + "#" + String(value24.get(input2.key) ?? 0));
                })
              }, input.id))
            })
          })
        }),
        value22 && (value.x > 0 || value.y > 0 || (runtime2.SLIDE_WIDTH - value.x) * scale > stageSize.w || (runtime2.SLIDE_HEIGHT - value.y) * scale > stageSize.h) ? CanvasEditorJsx.jsx("div", {
          "aria-hidden": "true",
          className: "pointer-events-none absolute inset-0 z-30 outline-2 -outline-offset-2 outline-app-accent outline-solid"
        }) : null,
        value2 !== null ? CanvasEditorJsx.jsx("div", {
          "data-slides-marquee": "",
          "aria-hidden": "true",
          className: "pointer-events-none absolute z-30 bg-accent-muted outline-1 -outline-offset-1 outline-fill-accent",
          style: {
            left: value2.left,
            top: value2.top,
            width: value2.width,
            height: value2.height
          }
        }) : null,
        value40,
        onReplaceImage !== void 0 ? CanvasEditorJsx.jsx("input", {
          ref: ref22,
          "data-testid": "frame-image-file",
          type: "file",
          accept: (value45?.kind, "image/*"),
          className: "hidden",
          onChange: (input) => {
            let value59 = input.currentTarget.files?.[0], current = ref23.current;
            input.currentTarget.value = "", value59 && current && onReplaceImage(current.frameId, current.path, value59);
          }
        }) : null,
        value57,
        stageOverlay
      ]
    });
    return CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
      children: [
        CanvasEditorJsx.jsx("h2", {
          id: value16,
          className: "sr-only",
          "data-slide-heading": "",
          children: slideName
        }),
        value58
      ]
    });
  }
  function textFormattingSnapshotsEqual(left, right) {
    return left === null || right === null ? left === right : left.bold === right.bold && left.italic === right.italic && left.underline === right.underline && left.color === right.color && left.href === right.href && left.touchesLink === right.touchesLink && left.list === right.list && left.listMixed === right.listMixed;
  }
  function trimTrailingTextNewlines(text) {
    return text.replace(/\n+$/, "");
  }
  function FloatingTableCellToolbar({ left, top, placed, children }) {
    return CanvasEditorJsx.jsx(runtime2.ToolbarStrip, {
      "data-mc-chrome": "",
      "data-cell-strip": "",
      surface: "popover",
      "aria-label": EDITOR_FORMATTING_LABELS.cell,
      placed,
      style: {
        position: "fixed",
        left,
        top
      },
      onMouseDown: (event) => event.preventDefault(),
      children
    });
  }
  function TextColorControl({ color }) {
    let value = (0, runtime2.useFillEditor)(color.fill);
    return CanvasEditorJsx.jsx(runtime2.SessionColorPopover, {
      testid: "frame-text-color",
      title: TEXT_COLOR_LABEL,
      paint: color.paint,
      swatches: color.swatches,
      value: color.value,
      onSwatch: color.onChange,
      custom: color.custom,
      editsAreUndoSteps: !0,
      ...value
    });
  }
  function TextFormattingToolbar({ selKey, compact, oneRow = !1, styleValue, styleChip, styleOptions, onStyle, custom, color, bold, onBold, italic, onItalic, underline, onUnderline, underlineDead = null, linkOpener, onLinkClosed, elementLink, onElementLink, align: align2, alignMixed = !1, onAlign, list, listMixed = !1, onList, wholeBold = bold, wholeItalic = italic, session, extra, onComment, onDelete, deleteTitle, onOpenInspector, moreMenu }) {
    let value = session !== null, [value2, value3] = runtime2.reactK_.useState(null), [value4, value5] = runtime2.reactK_.useState(void 0), [value6, value7] = runtime2.reactK_.useState(!1), [value8, value9] = runtime2.reactK_.useState(0), ref = runtime2.reactK_.useRef(null), callback = runtime2.reactK_.useCallback(() => {
      let element = document.querySelector("[data-text-path][contenteditable]"), value30 = element !== null ? (0, runtime2.readRichTextSelection)(element, runtime2.resolveSlideColor) : null;
      value3((input) => textFormattingSnapshotsEqual(input, value30) ? input : value30), value5(element !== null ? getComputedStyle(element).color : void 0);
      let value31 = window.getSelection(), value32 = element !== null && value31 !== null && value31.rangeCount > 0 && element.contains(value31.anchorNode);
      value32 && (ref.current = value31.getRangeAt(0).cloneRange()), value7(value32 && !value31.isCollapsed);
    }, []), callback2 = () => {
      let element = document.querySelector("[data-text-path][contenteditable]"), value30 = window.getSelection();
      return element === null || value30 === null || document.activeElement !== element && ref.current !== null && (element.focus({
        preventScroll: !0
      }), value30.removeAllRanges(), value30.addRange(ref.current)), element;
    }, ref2 = runtime2.reactK_.useRef(session);
    ref2.current = session, runtime2.reactK_.useEffect(() => {
      if (!value)
        return;
      let callback8 = (event) => {
        let target = event.target;
        target instanceof Element && target.closest("[data-text-path][contenteditable]") && value9((input) => input + 1);
      }, callback9 = (event) => {
        let target = event.target;
        if (!(target instanceof Element))
          return;
        let value30 = target.closest("[data-mc-popover] [data-session-strip], " + runtime2.SESSION_POPUP_SELECTOR) !== null, value31 = target instanceof HTMLInputElement && target.closest("[data-link-mode]") !== null, value32 = !value30 && !value31 && target.closest("[data-mc-strip][data-session-strip]") !== null;
        if (!value30 && !value32)
          return;
        let element = document.querySelector("[data-text-path][contenteditable]");
        if (element === null)
          return;
        let relatedTarget = event.relatedTarget;
        relatedTarget instanceof Element && (element.contains(relatedTarget) || relatedTarget.closest("[data-session-strip]") !== null) || (relatedTarget === null && value30 ? callback2() : ref2.current?.commitFromEditable(element));
      };
      return document.addEventListener("pointerdown", callback8, !0), document.addEventListener("focusout", callback9), callback(), document.addEventListener("selectionchange", callback), () => {
        document.removeEventListener("pointerdown", callback8, !0), document.removeEventListener("focusout", callback9), document.removeEventListener("selectionchange", callback);
      };
    }, [value, callback]);
    let callback3 = (input, options) => {
      callback2(), (0, runtime2.executeRichTextCommand)(input, options), callback();
    }, value10 = selKey + ":" + String(value8), value11 = color.swatches.filter((input) => input.color.length === 7), callback4 = (input) => ((0, runtime2.resolveSlideColor)(input) ?? input).toLowerCase(), value12 = value ? value2?.color : void 0, value13 = value12 !== void 0 ? ((input) => input === void 0 ? null : input.picks ?? input.name)(value11.find((input) => input.color === callback4(value12))) : null, value14 = value12 !== void 0 ? (0, runtime2.resolveSlideColor)(value12) ?? value12 : void 0, value15 = bold || value && value2?.bold === !0, value16 = italic || value && value2?.italic === !0, value17 = underline || value && value2?.underline === !0, value18 = value ? value2?.list : list, listIsMixed = value ? value2?.listMixed === !0 : listMixed, value19 = session?.linkDraft ?? null, value20 = styleOptions ?? EMPTY_EDITOR_TOOL_OPTIONS, value21 = styleChip ?? value20.find((input) => input.value === styleValue)?.text ?? "", callback5 = () => {
      let element = document.querySelector("[data-text-path][contenteditable]"), value30 = window.getSelection();
      if (element === null || value30 === null || value30.rangeCount === 0)
        return;
      let value31 = value30.getRangeAt(0);
      if (!element.contains(value31.startContainer) || !element.contains(value31.endContainer))
        return;
      let value32 = (0, runtime2.selectionAnchorElements)(element, value31);
      value32 !== null && (value30.removeAllRanges(), value30.addRange(value32.range), (0, runtime2.executeRichTextCommand)("unlink"), (0, runtime2.unwrapAnchorElements)(value32.anchors), callback(), (0, runtime2.announceLiveMessage)("Link removed"));
    }, value22 = value && value2?.href !== void 0, [value23, value24] = runtime2.reactK_.useState(null), elementLinkWrapRef = runtime2.reactK_.useRef(null), elementLinkAvailable = !value && extra == null;
    runtime2.reactK_.useEffect(() => {
      if (!(linkOpener === void 0 || !elementLinkAvailable))
        return linkOpener.current = () => {
          value24((input) => input ?? elementLink ?? ""), elementLinkWrapRef.current?.querySelector("input")?.focus();
        }, () => {
          linkOpener.current = null;
        };
    }, [linkOpener, elementLinkAvailable, elementLink]);
    let [value25, value26] = runtime2.reactK_.useState(!1), value27 = value22 || value19 !== null || !value || value6 ? null : (0, runtime2.formatMessage)({
      defaultMessage: "请先选择文字",
      id: "1EuAsjLHI1"
    }), value28 = underlineDead ?? (value && value2?.touchesLink === !0 && !underline ? (0, runtime2.formatMessage)({
      defaultMessage: "链接已带有下划线",
      id: "6NBy7/gxKa"
    }) : null), callback6 = (input) => {
      if (!value)
        return onList(input);
      callback3(input === void 0 ? "outdent" : input === "bullet" ? "insertUnorderedList" : "insertOrderedList");
    }, callback7 = () => {
      value26(!1), value && value19 !== null ? (callback2(), session.setLinkDraft(null)) : (value24(null), onLinkClosed?.());
    }, value29 = !value && value23 !== null || value && value19 !== null;
    runtime2.reactK_.useEffect(() => {
      value29 || value26(!1);
    }, [value29]);
    let draftRange = value19?.range;
    return runtime2.reactK_.useLayoutEffect(() => {
      draftRange !== void 0 && (ref.current = draftRange.cloneRange());
    }, [draftRange]), !value && value23 !== null ? CanvasEditorJsx.jsx("span", {
      ref: elementLinkWrapRef,
      className: "contents",
      onBlur: (event) => {
        event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget) || value24(null);
      },
      children: CanvasEditorJsx.jsx(runtime2.LinkEditor, {
        value: value23,
        invalid: value25,
        onChange: (input) => {
          value26(!1), value24(input);
        },
        onCancel: callback7,
        onKeyDown: (event) => {
          if ((0, runtime2.isLinkSelectShortcut)(event) && event.preventDefault(), event.key === "Escape" && (event.preventDefault(), value24(null), onLinkClosed?.()), event.key === "Enter") {
            event.preventDefault();
            let value30 = (0, runtime2.normalizeExternalLink)(value23);
            if (value30 === null)
              return value26(!0);
            onElementLink(value30), value24(null), onLinkClosed?.();
          }
        }
      })
    }) : value && value19 !== null ? CanvasEditorJsx.jsx(runtime2.LinkEditor, {
      value: value19.url,
      invalid: value25,
      onChange: (input) => {
        value26(!1), session.setLinkDraft({
          ...value19,
          url: input
        });
      },
      onBlur: (input) => {
        let relatedTarget = input.relatedTarget, value30 = relatedTarget instanceof Element && relatedTarget.closest("[data-session-strip]") !== null, value31 = relatedTarget !== null && relatedTarget === value19.editable;
        if (value30 || value31)
          return;
        let editable = value19.editable;
        session.setLinkDraft(null), editable !== null && session.commitFromEditable(editable);
      },
      onCancel: callback7,
      onKeyDown: (event) => {
        if ((0, runtime2.isLinkSelectShortcut)(event) && event.preventDefault(), event.key === "Escape" && (event.preventDefault(), callback7()), event.key === "Enter") {
          event.preventDefault();
          let value30 = (0, runtime2.normalizeExternalLink)(value19.url);
          if (value30 === null)
            return value26(!0);
          value19.editable?.focus();
          let value31 = window.getSelection();
          value31?.removeAllRanges(), value31?.addRange(value19.range);
          let linkBefore = selectionLinkValue(value19.editable);
          callback3("createLink", value30);
          let linkAfter = selectionLinkValue(value19.editable);
          linkAfter !== "" && announceLinkChanges([[linkBefore, linkAfter]]), session.setLinkDraft(null);
        }
      }
    }) : !value && extra != null ? CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
      children: [
        CanvasEditorJsx.jsxs(runtime2.ToolbarGroup, {
          wrap: !oneRow,
          children: [
            CanvasEditorJsx.jsx(runtime2.SessionTextStylePopover, {
              testid: "frame-text-style",
              value: styleValue,
              chipText: value21,
              options: value20,
              onChange: onStyle,
              custom
            }, "ts:" + value10),
            CanvasEditorJsx.jsx(TextColorControl, {
              color
            }, "tc:" + value10)
          ]
        }),
        compact ? null : CanvasEditorJsx.jsx(runtime2.ToolbarDivider, {}),
        CanvasEditorJsx.jsx(runtime2.reactK_.Fragment, {
          children: extra
        }, "x:" + value10),
        CanvasEditorJsx.jsx(runtime2.SelectionActionButtons, {
          onComment,
          onDelete,
          deleteTitle,
          onOpenInspector,
          moreMenu
        })
      ]
    }) : CanvasEditorJsx.jsxs(CanvasEditorJsx.Fragment, {
      children: [
        CanvasEditorJsx.jsxs(runtime2.ToolbarGroup, {
          wrap: !oneRow,
          children: [
            CanvasEditorJsx.jsx(runtime2.SessionTextStylePopover, {
              testid: "frame-text-style",
              value: styleValue,
              chipText: value21,
              options: value20,
              onChange: onStyle,
              custom
            }, "ts:" + value10),
            value ? CanvasEditorJsx.jsx(runtime2.SessionColorPopover, {
              testid: "slides-text-color",
              title: (0, runtime2.formatMessage)({
                defaultMessage: "设置所选文字的颜色",
                id: "E+lvpX5fh+"
              }),
              paint: value14 ?? value4,
              swatches: value11,
              value: value13,
              onSwatch: (input) => {
                let value30 = value11.find((input2) => input2.name === input)?.color;
                value30 !== void 0 && callback3("foreColor", value30);
              },
              custom: {
                seed: value14 ?? value4 ?? "#141413",
                opaque: !0,
                onChange: () => {
                },
                onPickEnd: (input) => callback3("foreColor", input),
                contrast: color.runContrast
              }
            }, "c:" + value10) : CanvasEditorJsx.jsx(TextColorControl, {
              color
            }, "tc:" + value10),
            CanvasEditorJsx.jsx(runtime2.ToolbarStripButton, {
              title: (0, runtime2.formatMessage)({
                defaultMessage: "加粗（{shortcut}）",
                id: "t50X/+obFg"
              }, { shortcut: (0, runtime2.formatCommandShortcut)("B") }),
              "aria-label": "加粗",
              "aria-pressed": value15,
              icon: "TextBold",
              onClick: () => value && !bold && (value2?.bold === !0 || !wholeBold) ? callback3("bold") : onBold()
            }),
            CanvasEditorJsx.jsx(runtime2.ToolbarStripButton, {
              title: (0, runtime2.formatMessage)({
                defaultMessage: "斜体（{shortcut}）",
                id: "yFlLhHISEH"
              }, { shortcut: (0, runtime2.formatCommandShortcut)("I") }),
              "aria-label": "斜体",
              "aria-pressed": value16,
              icon: "TextItalics",
              onClick: () => value && !italic && (value2?.italic === !0 || !wholeItalic) ? callback3("italic") : onItalic()
            }),
            CanvasEditorJsx.jsx(runtime2.ToolbarStripButton, {
              icon: "TextUnderline",
              title: value28 ?? (0, runtime2.formatMessage)({
                defaultMessage: "下划线（{shortcut}）",
                id: "/z2gpT4L9k"
              }, { shortcut: (0, runtime2.formatCommandShortcut)("U") }),
              "aria-label": "下划线",
              "aria-pressed": value28 !== null ? void 0 : value17,
              disabled: value28 !== null,
              onClick: () => value && !underline ? callback3("underline") : onUnderline()
            }),
            CanvasEditorJsx.jsx(runtime2.ToolbarStripButton, {
              icon: "Link",
              title: value ? value22 ? (0, runtime2.formatMessage)({
                defaultMessage: "移除光标处文字的链接",
                id: "vvSvsLZvCk"
              }) : value27 ?? (0, runtime2.formatMessage)({
                defaultMessage: "为所选文字添加链接，仅支持 http/https",
                id: "nHp35D3isP"
              }) : elementLink !== void 0 ? (0, runtime2.formatMessage)({
                defaultMessage: "移除链接（{url}）",
                id: "VcegYtzze/"
              }, { url: elementLink }) : (0, runtime2.formatMessage)({
                defaultMessage: "为整段文字添加链接，仅支持 http/https",
                id: "nGAlW/tsVZ"
              }),
              "aria-label": "链接",
              "aria-pressed": value ? value22 : elementLink !== void 0 || value23 !== null,
              disabled: value27 !== null,
              onClick: () => {
                if (value && value22)
                  return callback5();
                if (value)
                  return callback2(), session?.onLinkClick();
                elementLink !== void 0 ? onElementLink(void 0) : value24((input) => input === null ? "" : null);
              }
            })
          ]
        }),
        compact ? null : CanvasEditorJsx.jsx(runtime2.ToolbarDivider, {}),
        CanvasEditorJsx.jsxs(runtime2.ToolbarGroup, {
          wrap: !oneRow,
          children: [
            CanvasEditorJsx.jsx(runtime2.SessionChoicePopover, {
              testid: "frame-text-list",
              title: listIsMixed ? (0, runtime2.formatMessage)({
                defaultMessage: "列表：混合",
                id: "vf0Bc0CWlo"
              }) : (0, runtime2.formatMessage)({
                defaultMessage: "列表：{list}",
                id: "+DoSJ9PA4n"
              }, { list: runtime2.TEXT_LIST_LABELS[value18 ?? "none"] }),
              face: value18 === "number" ? "ListNumbered" : "ListBullet",
              value: listIsMixed ? null : value18 ?? "none",
              options: runtime2.TEXT_LIST_OPTIONS,
              onChange: (input) => callback6(input === "none" ? void 0 : input)
            }, "li:" + value10),
            CanvasEditorJsx.jsx(runtime2.SessionChoicePopover, {
              testid: "frame-text-align",
              title: alignMixed ? (0, runtime2.formatMessage)({
                defaultMessage: "对齐：混合",
                id: "EMaY2rOJkx"
              }) : (0, runtime2.formatMessage)({
                defaultMessage: "对齐：{alignment}",
                id: "HQaBo+E04j"
              }, { alignment: TEXT_ALIGNMENT_LABELS[align2] }),
              face: TEXT_ALIGNMENT_ICONS[align2],
              value: alignMixed ? null : align2,
              options: TEXT_ALIGNMENT_OPTIONS,
              onChange: onAlign
            }, "al:" + value10)
          ]
        }),
        compact ? null : CanvasEditorJsx.jsx(runtime2.ToolbarDivider, {}),
        CanvasEditorJsx.jsx(runtime2.SelectionActionButtons, {
          onComment,
          onDelete,
          deleteTitle,
          onOpenInspector,
          moreMenu
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "CanvasEditorJsx", () => CanvasEditorJsx, (value) => {
    CanvasEditorJsx = value;
  }), bindRuntimeValue(runtime2, "EMPTY_EDITOR_TOOL_OPTIONS", () => EMPTY_EDITOR_TOOL_OPTIONS, (value) => {
    EMPTY_EDITOR_TOOL_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "typeStylesToEditorOptions", () => typeStylesToEditorOptions), bindRuntimeValue(runtime2, "resolveSingleUnitTransformTarget", () => resolveSingleUnitTransformTarget), bindRuntimeValue(runtime2, "resolveSingleUnitStyleTarget", () => resolveSingleUnitStyleTarget), bindRuntimeValue(runtime2, "placementSideToSnapLine", () => placementSideToSnapLine, (value) => {
    placementSideToSnapLine = value;
  }), bindRuntimeValue(runtime2, "HORIZONTAL_GROUP_RESIZE_HANDLES", () => HORIZONTAL_GROUP_RESIZE_HANDLES, (value) => {
    HORIZONTAL_GROUP_RESIZE_HANDLES = value;
  }), bindRuntimeValue(runtime2, "copySelectedUnitsToClipboard", () => copySelectedUnitsToClipboard), bindRuntimeValue(runtime2, "EDITOR_ENTER_KEY_HINTS", () => EDITOR_ENTER_KEY_HINTS, (value) => {
    EDITOR_ENTER_KEY_HINTS = value;
  }), bindRuntimeValue(runtime2, "editorRectsEqual", () => editorRectsEqual), bindRuntimeValue(runtime2, "editorVideoEnterHint", () => editorVideoEnterHint), bindRuntimeValue(runtime2, "EDITOR_TEXT_ZOOM_BOTTOM_PADDING", () => EDITOR_TEXT_ZOOM_BOTTOM_PADDING), bindRuntimeValue(runtime2, "EDITOR_TEXT_ZOOM_MIN_TEXT_PX", () => EDITOR_TEXT_ZOOM_MIN_TEXT_PX), bindRuntimeValue(runtime2, "EDITOR_KEYBOARD_ZOOM", () => EDITOR_KEYBOARD_ZOOM), bindRuntimeValue(runtime2, "EDITOR_TEXT_ZOOM_TAP_GUARD_MS", () => EDITOR_TEXT_ZOOM_TAP_GUARD_MS), bindRuntimeValue(runtime2, "fitTextEditingZoom", () => fitTextEditingZoom), bindRuntimeValue(runtime2, "unionRotatedRectBounds", () => unionRotatedRectBounds), bindRuntimeValue(runtime2, "FormattingToolbarTransition", () => FormattingToolbarTransition), bindRuntimeValue(runtime2, "describeTextLinks", () => describeTextLinks), bindRuntimeValue(runtime2, "selectionLinkValue", () => selectionLinkValue), bindRuntimeValue(runtime2, "linkChangeMessage", () => linkChangeMessage), bindRuntimeValue(runtime2, "announceLinkChanges", () => announceLinkChanges), bindRuntimeValue(runtime2, "EDITOR_VIEWPORT_PADDING", () => EDITOR_VIEWPORT_PADDING, (value) => {
    EDITOR_VIEWPORT_PADDING = value;
  }), bindRuntimeValue(runtime2, "EDITOR_MIN_STAGE_HEIGHT", () => EDITOR_MIN_STAGE_HEIGHT, (value) => {
    EDITOR_MIN_STAGE_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "EDITOR_STAGE_PADDING_FRACTION", () => EDITOR_STAGE_PADDING_FRACTION, (value) => {
    EDITOR_STAGE_PADDING_FRACTION = value;
  }), bindRuntimeValue(runtime2, "EDITOR_FALLBACK_STAGE_WIDTH", () => EDITOR_FALLBACK_STAGE_WIDTH, (value) => {
    EDITOR_FALLBACK_STAGE_WIDTH = value;
  }), bindRuntimeValue(runtime2, "EDITOR_FORMATTING_LABELS", () => EDITOR_FORMATTING_LABELS, (value) => {
    EDITOR_FORMATTING_LABELS = value;
  }), bindRuntimeValue(runtime2, "centerViewportAxis", () => centerViewportAxis, (value) => {
    centerViewportAxis = value;
  }), bindRuntimeValue(runtime2, "fitSlideEditorViewport", () => fitSlideEditorViewport), bindRuntimeValue(runtime2, "editorViewportFromScreenRect", () => editorViewportFromScreenRect), bindRuntimeValue(runtime2, "clampEditorViewport", () => clampEditorViewport), bindRuntimeValue(runtime2, "EDITOR_TEXT_ZOOM_DURATION_MS", () => EDITOR_TEXT_ZOOM_DURATION_MS, (value) => {
    EDITOR_TEXT_ZOOM_DURATION_MS = value;
  }), bindRuntimeValue(runtime2, "EDITOR_TEXT_ZOOM_SIDE_PADDING", () => EDITOR_TEXT_ZOOM_SIDE_PADDING, (value) => {
    EDITOR_TEXT_ZOOM_SIDE_PADDING = value;
  }), bindRuntimeValue(runtime2, "EDITOR_TEXT_ZOOM_TOP_PADDING", () => EDITOR_TEXT_ZOOM_TOP_PADDING, (value) => {
    EDITOR_TEXT_ZOOM_TOP_PADDING = value;
  }), bindRuntimeValue(runtime2, "getEditorViewportBounds", () => getEditorViewportBounds), bindRuntimeValue(runtime2, "constrainEditorBandBottom", () => constrainEditorBandBottom), bindRuntimeValue(runtime2, "unscaleEditorScreenRect", () => unscaleEditorScreenRect), bindRuntimeValue(runtime2, "parseCssScaleFactors", () => parseCssScaleFactors), bindRuntimeValue(runtime2, "SLIDE_LIFT_SCALE_ATTRIBUTE", () => SLIDE_LIFT_SCALE_ATTRIBUTE, (value) => {
    SLIDE_LIFT_SCALE_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "getUnliftedBoundingClientRect", () => getUnliftedBoundingClientRect), bindRuntimeValue(runtime2, "placeFloatingEditorToolbar", () => placeFloatingEditorToolbar), bindRuntimeValue(runtime2, "getEditableCaretClientRect", () => getEditableCaretClientRect), bindRuntimeValue(runtime2, "chooseTextEditingTarget", () => chooseTextEditingTarget), bindRuntimeValue(runtime2, "pointerDragThreshold", () => pointerDragThreshold), bindRuntimeValue(runtime2, "isAdditionalTouchPointer", () => isAdditionalTouchPointer), bindRuntimeValue(runtime2, "isFrameOrResizeTarget", () => isFrameOrResizeTarget), bindRuntimeValue(runtime2, "canStartCanvasPinch", () => canStartCanvasPinch), bindRuntimeValue(runtime2, "canStartCanvasRectSelection", () => canStartCanvasRectSelection), bindRuntimeValue(runtime2, "rectanglesOverlap", () => rectanglesOverlap), bindRuntimeValue(runtime2, "collectUnitsIntersectingSelectionRect", () => collectUnitsIntersectingSelectionRect), bindRuntimeValue(runtime2, "pathsOverlap", () => pathsOverlap), bindRuntimeValue(runtime2, "getFrameHitTestOptions", () => getFrameHitTestOptions, (value) => {
    getFrameHitTestOptions = value;
  }), bindRuntimeValue(runtime2, "getFrameTransformScreenRect", () => getFrameTransformScreenRect), bindRuntimeValue(runtime2, "resolveSelectionDragHit", () => resolveSelectionDragHit), bindRuntimeValue(runtime2, "preservePinchAnchorCoordinate", () => preservePinchAnchorCoordinate), bindRuntimeValue(runtime2, "parseEditorNodePath", () => parseEditorNodePath), bindRuntimeValue(runtime2, "removeNodeFromFrame", () => removeNodeFromFrame), bindRuntimeValue(runtime2, "ceilMeasuredNodeSize", () => ceilMeasuredNodeSize), bindRuntimeValue(runtime2, "createFreeFrameFromNode", () => createFreeFrameFromNode), bindRuntimeValue(runtime2, "fillMissingFrameSizes", () => fillMissingFrameSizes), bindRuntimeValue(runtime2, "isEmptyUnstyledFlowContainer", () => isEmptyUnstyledFlowContainer, (value) => {
    isEmptyUnstyledFlowContainer = value;
  }), bindRuntimeValue(runtime2, "setNodeMinimumPlacementSize", () => setNodeMinimumPlacementSize), bindRuntimeValue(runtime2, "findChangedFrameIds", () => findChangedFrameIds), bindRuntimeValue(runtime2, "findSurvivingNodePath", () => findSurvivingNodePath), bindRuntimeValue(runtime2, "removeNodeAndEmptyAncestors", () => removeNodeAndEmptyAncestors), bindRuntimeValue(runtime2, "extractFlowDragSelection", () => extractFlowDragSelection), bindRuntimeValue(runtime2, "collectFlowDragChildPaths", () => collectFlowDragChildPaths), bindRuntimeValue(runtime2, "normalizeFlowDragExtraction", () => normalizeFlowDragExtraction), bindRuntimeValue(runtime2, "createFlowChildIndexRemapper", () => createFlowChildIndexRemapper), bindRuntimeValue(runtime2, "collapseSingleChildFlowFrame", () => collapseSingleChildFlowFrame), bindRuntimeValue(runtime2, "reparentExtractedFlowNode", () => reparentExtractedFlowNode), bindRuntimeValue(runtime2, "getRemainingFlowChildRects", () => getRemainingFlowChildRects), bindRuntimeValue(runtime2, "removeFrameAxisSizes", () => removeFrameAxisSizes), bindRuntimeValue(runtime2, "removeFlowNodePlacement", () => removeFlowNodePlacement), bindRuntimeValue(runtime2, "calculateNestedOverlayDepth", () => calculateNestedOverlayDepth), bindRuntimeValue(runtime2, "insertFramesIntoFlowContainer", () => insertFramesIntoFlowContainer), bindRuntimeValue(runtime2, "canInsertNodeIntoFlow", () => canInsertNodeIntoFlow, (value) => {
    canInsertNodeIntoFlow = value;
  }), bindRuntimeValue(runtime2, "setFlowInsertionSize", () => setFlowInsertionSize), bindRuntimeValue(runtime2, "findFlowInsertionIndex", () => findFlowInsertionIndex), bindRuntimeValue(runtime2, "calculateFlowInsertionGuide", () => calculateFlowInsertionGuide), bindRuntimeValue(runtime2, "shouldExtractOversizedNode", () => shouldExtractOversizedNode), bindRuntimeValue(runtime2, "canFitHorizontalFlowInsertion", () => canFitHorizontalFlowInsertion), bindRuntimeValue(runtime2, "pairFlowRectsWithRemainingNodes", () => pairFlowRectsWithRemainingNodes), bindRuntimeValue(runtime2, "flowInsertionTargetMatches", () => flowInsertionTargetMatches), bindRuntimeValue(runtime2, "collectCollapsibleFlowAncestors", () => collectCollapsibleFlowAncestors), bindRuntimeValue(runtime2, "flowRectsAligned", () => flowRectsAligned), bindRuntimeValue(runtime2, "isStrictPathAncestor", () => isStrictPathAncestor), bindRuntimeValue(runtime2, "duplicateFrameWithFixedFillPlacement", () => duplicateFrameWithFixedFillPlacement), bindRuntimeValue(runtime2, "deleteSelectedUnits", () => deleteSelectedUnits), bindRuntimeValue(runtime2, "rotatedRectBounds", () => rotatedRectBounds), bindRuntimeValue(runtime2, "selectionBoundsForUnits", () => selectionBoundsForUnits), bindRuntimeValue(runtime2, "getSelectedTextStyle", () => getSelectedTextStyle), bindRuntimeValue(runtime2, "SlideCanvasEditor", () => SlideCanvasEditor), bindRuntimeValue(runtime2, "textFormattingSnapshotsEqual", () => textFormattingSnapshotsEqual), bindRuntimeValue(runtime2, "trimTrailingTextNewlines", () => trimTrailingTextNewlines), bindRuntimeValue(runtime2, "FloatingTableCellToolbar", () => FloatingTableCellToolbar), bindRuntimeValue(runtime2, "TextColorControl", () => TextColorControl), bindRuntimeValue(runtime2, "TextFormattingToolbar", () => TextFormattingToolbar), bindRuntimeValue(runtime2, "NODE_BACKGROUND_AND_PADDING_PROPERTIES", () => NODE_BACKGROUND_AND_PADDING_PROPERTIES, (value) => {
    NODE_BACKGROUND_AND_PADDING_PROPERTIES = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGNMENT_LABELS", () => TEXT_ALIGNMENT_LABELS, (value) => {
    TEXT_ALIGNMENT_LABELS = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGNMENT_ICONS", () => TEXT_ALIGNMENT_ICONS, (value) => {
    TEXT_ALIGNMENT_ICONS = value;
  }), bindRuntimeValue(runtime2, "TABLE_TEXT_ALIGNMENT_OPTIONS", () => TABLE_TEXT_ALIGNMENT_OPTIONS, (value) => {
    TABLE_TEXT_ALIGNMENT_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGNMENT_OPTIONS", () => TEXT_ALIGNMENT_OPTIONS, (value) => {
    TEXT_ALIGNMENT_OPTIONS = value;
  }), () => {
    CanvasEditorJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), EMPTY_EDITOR_TOOL_OPTIONS = [], placementSideToSnapLine = (side2) => side2 === "left" || side2 === "top" ? "near" : side2 === null ? null : "far", HORIZONTAL_GROUP_RESIZE_HANDLES = [
      {
        x: "left",
        y: null
      },
      {
        x: "right",
        y: null
      }
    ], EDITOR_ENTER_KEY_HINTS = {
      multi: "Press Enter to keep only this object selected.",
      enter: "Press Enter to go into this group; Shift+Enter comes back up.",
      text: "Press Enter to edit this text; Escape or Tab ends the edit and keeps your change.",
      cell: "Press Enter to edit the table; inside it Tab and Enter move between cells; Escape finishes and keeps your change, as does Ctrl or Command with Enter.",
      play: "Press Enter to play or pause this video. Escape stops it.",
      playStop: "Press Enter to play this video. Enter or Escape stops it.",
      open: "Press Enter to open this video on its site, in a new tab."
    }, EDITOR_VIEWPORT_PADDING = 48, EDITOR_MIN_STAGE_HEIGHT = 200, EDITOR_STAGE_PADDING_FRACTION = 0.1, EDITOR_FALLBACK_STAGE_WIDTH = 320, EDITOR_FORMATTING_LABELS = {
      text: "Text formatting",
      img: "Image formatting",
      icon: "Icon formatting",
      shape: "Shape formatting",
      stack: "Group formatting",
      grid: "Grid formatting",
      table: "Table formatting",
      html: "Embed formatting",
      spacer: "Spacer formatting",
      overlay: "Overlay formatting",
      mixed: "Formatting",
      cell: "Table cell formatting"
    }, centerViewportAxis = (input, options, context, value) => -(input - options * context) / (2 * context) - value / context, EDITOR_TEXT_ZOOM_DURATION_MS = 600, EDITOR_TEXT_ZOOM_SIDE_PADDING = 16, EDITOR_TEXT_ZOOM_TOP_PADDING = 76, EDITOR_TEXT_ZOOM_BOTTOM_PADDING = 8, EDITOR_TEXT_ZOOM_MIN_TEXT_PX = 14, EDITOR_KEYBOARD_ZOOM = {
      px: 380,
      share: 0.6,
      ms: 1e3
    }, EDITOR_TEXT_ZOOM_TAP_GUARD_MS = 500, SLIDE_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页已满，请先移除一个框架。",
      id: "sYhFBGWPpc"
    }), TEXT_COLOR_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "文字颜色",
      id: "mK2qZMtHUK"
    }), STYLE_DEFAULT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "样式默认",
      id: "AFst2NiWrl"
    }), SYSTEM_FONT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "系统字体",
      id: "K2Lx/k3SeI"
    }), THEME_DEFAULT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "主题默认",
      id: "gH9y7vOehZ"
    }), SLIDE_LIFT_SCALE_ATTRIBUTE = "data-slides-lift", getFrameHitTestOptions = (slide, frame) => ({
      groupFirst: runtime2.GROUP_COMMAND === "group",
      textTap: runtime2.GROUP_TEXT_TAP_ENABLED,
      flow: (0, runtime2.isPrimaryLayoutFrame)(slide, frame)
    }), isEmptyUnstyledFlowContainer = (node) => (0, runtime2.isFlowContainer)(node) && !(0, runtime2.styleHasVisiblePaint)(node.style) && node.children.every((source) => source.kind === "spacer"), canInsertNodeIntoFlow = (node) => node.kind !== "html" && ((0, runtime2.nodeChildren)(node) ?? []).every(canInsertNodeIntoFlow), NODE_BACKGROUND_AND_PADDING_PROPERTIES = [
      "backgroundColor",
      "backgroundGradient",
      "borderStyle",
      "borderWidth",
      "borderRadius",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft"
    ], TEXT_ALIGNMENT_LABELS = {
      start: (0, runtime2.formatMessage)({
        defaultMessage: "左对齐",
        id: "PjxMeBfQCx"
      }),
      center: (0, runtime2.formatMessage)({
        defaultMessage: "居中",
        id: "aOAnAMIgUV"
      }),
      end: (0, runtime2.formatMessage)({
        defaultMessage: "右对齐",
        id: "vbdW4HJh0F"
      }),
      justify: (0, runtime2.formatMessage)({
        defaultMessage: "两端对齐",
        id: "CqtkL+XURl"
      })
    }, TEXT_ALIGNMENT_ICONS = {
      start: runtime2.TEXT_ALIGN_LEFT_ICON,
      center: runtime2.TEXT_ALIGN_CENTER_ICON,
      end: runtime2.TEXT_ALIGN_RIGHT_ICON,
      justify: runtime2.TEXT_ALIGN_JUSTIFY_ICON
    }, TABLE_TEXT_ALIGNMENT_OPTIONS = [
      {
        value: "start",
        label: TEXT_ALIGNMENT_LABELS.start,
        icon: runtime2.TEXT_ALIGN_LEFT_ICON
      },
      {
        value: "center",
        label: TEXT_ALIGNMENT_LABELS.center,
        icon: runtime2.TEXT_ALIGN_CENTER_ICON
      },
      {
        value: "end",
        label: TEXT_ALIGNMENT_LABELS.end,
        icon: runtime2.TEXT_ALIGN_RIGHT_ICON
      },
      {
        value: "justify",
        label: TEXT_ALIGNMENT_LABELS.justify,
        icon: runtime2.TEXT_ALIGN_JUSTIFY_ICON,
        disabledReason: (0, runtime2.formatMessage)({
          defaultMessage: "表格列支持左对齐、居中和右对齐",
          id: "wGlgSDV9Wj"
        })
      }
    ], TEXT_ALIGNMENT_OPTIONS = [
      {
        value: "start",
        label: TEXT_ALIGNMENT_LABELS.start,
        icon: runtime2.TEXT_ALIGN_LEFT_ICON
      },
      {
        value: "center",
        label: TEXT_ALIGNMENT_LABELS.center,
        icon: runtime2.TEXT_ALIGN_CENTER_ICON
      },
      {
        value: "end",
        label: TEXT_ALIGNMENT_LABELS.end,
        icon: runtime2.TEXT_ALIGN_RIGHT_ICON
      },
      {
        value: "justify",
        label: TEXT_ALIGNMENT_LABELS.justify,
        icon: runtime2.TEXT_ALIGN_JUSTIFY_ICON
      }
    ];
  };
}
export {
  installEditorCanvas
};
