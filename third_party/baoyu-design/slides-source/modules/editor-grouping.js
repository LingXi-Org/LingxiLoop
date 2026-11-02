// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorGrouping(runtime2) {
  var GROUP_COMMAND, GROUP_TEXT_TAP_ENABLED, GROUP_MEMBER_SIZES_FROM_MODEL, GROUP_RESIZING_ENABLED, GROUP_GROWING_STACK_CHILDREN_ENABLED, GROUP_MIXED_FRAME_STACK_CHILDREN_ENABLED, UNGROUP_UNMARKED_STACK_ENABLED, GROUP_REFUSAL_MESSAGES, GROUP_COORDINATE_TOLERANCE, roundGroupCoordinate, groupMainDimension, structurallyEqualGroupValues, hasGroupSizingConstraint, childHasGrow, GROUP_ZERO_ANCHOR, hasLeadingOverlayAnchors, isLeadingOverlayGroup;
  function groupingKeyCommand(event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey)
      return;
    let value = /^[\p{L}\p{M}]$/u.test(event.key) && !/\p{Script=Latin}/u.test(event.key);
    if (!(event.key.toLowerCase() !== "g" && !(event.code === "KeyG" && value)))
      return event.shiftKey ? "ungroup" : "group";
  }
  function normalizedGroupSelection(slide, selection) {
    let value = selection.flatMap((input) => {
      let value2 = (0, runtime2.frameById)(slide, input.frameId);
      return value2 === void 0 || (0, runtime2.isEmptyBackgroundFrame)(value2) || ((0, runtime2.selectedNode)(slide, input)?.kind ?? "spacer") === "spacer" ? [] : [
        (0, runtime2.isEmptyGroupBase)(value2.node) && (0, runtime2.nodePathsEqual)((0, runtime2.selectionNodePath)(input), [
          0
        ]) ? {
          frameId: input.frameId
        } : input
      ];
    }), callback = (input, options) => options.frameId === input.frameId && (0, runtime2.selectionNodePath)(options).length < (0, runtime2.selectionNodePath)(input).length && (0, runtime2.nodePathsEqual)((0, runtime2.selectionNodePath)(options), (0, runtime2.selectionNodePath)(input).slice(0, (0, runtime2.selectionNodePath)(options).length));
    return (0, runtime2.sortSelectionsInDocumentOrder)(slide, value.filter((input, options) => value.findIndex((input2) => (0, runtime2.selectionsEqual)(input2, input)) === options && !value.some((input2) => callback(input, input2))));
  }
  function nodeMainAxisInsets(node, direction) {
    let callback = (input) => typeof input == "number" ? input : 0, value = (0, runtime2.borderWidthsBySide)(node.style);
    return direction === "h" ? callback(node.style?.paddingLeft) + callback(node.style?.paddingRight) + value.left + value.right : callback(node.style?.paddingTop) + callback(node.style?.paddingBottom) + value.top + value.bottom;
  }
  function stackChildrenFitMeasuredBounds(frame, path, measure) {
    let value = (0, runtime2.nodeAtPath)(frame.node, path), value2 = measure.rect((0, runtime2.createNodeSelection)(frame.id, path));
    if (value === void 0 || value.kind !== "stack" || value2 === void 0)
      return !1;
    let value3 = value.children.map((input, options) => measure.rect((0, runtime2.createNodeSelection)(frame.id, [...path, options])));
    if (value3.some((input) => input === void 0))
      return !1;
    let value4 = value3.reduce((input, options) => input + groupMainDimension(options, value.dir), 0) + value.gap * Math.max(0, value.children.length - 1);
    return groupMainDimension(value2, value.dir) - nodeMainAxisInsets(value, value.dir) - value4 > GROUP_COORDINATE_TOLERANCE ? !0 : value.children.some((source, options) => {
      let place = source.place, value5 = source.kind === "spacer" ? place?.basis ?? 0 : place?.basis;
      return (place?.grow ?? 0) > 0 && value5 !== void 0 && place?.minW === void 0 && place?.minH === void 0 && place?.minWFit === void 0 && !hasGroupSizingConstraint(place, value.dir) && groupMainDimension(value3[options], value.dir) - Math.max(value5, nodeMainAxisInsets(source, value.dir)) > GROUP_COORDINATE_TOLERANCE;
    });
  }
  function stackMainAxisSizeIsKnown(frame, path, measure) {
    let value = (0, runtime2.nodeAtPath)(frame.node, path);
    if (value === void 0 || value.kind !== "stack")
      return !1;
    let dir = value.dir;
    if (stackChildrenFitMeasuredBounds(frame, path, measure))
      return !0;
    for (let items = [...path]; ; items = items.slice(0, -1)) {
      if (items.length === 0) {
        let value5 = dir === "h" ? frame.x : frame.y;
        if (value5.anchor === "fill" || value5.size !== void 0)
          return !1;
        let value6 = measure.rect({
          frameId: frame.id
        });
        return dir === "v" || value6 === void 0 ? dir === "v" : value5.anchor === "center" ? value6.w < runtime2.SLIDE_WIDTH / 2 - value5.offset - GROUP_COORDINATE_TOLERANCE : value5.anchor === "trailing" ? value6.x > GROUP_COORDINATE_TOLERANCE : value6.x + value6.w < runtime2.SLIDE_WIDTH - GROUP_COORDINATE_TOLERANCE;
      }
      let value2 = items.slice(0, -1), value3 = (0, runtime2.nodeAtPath)(frame.node, value2), value4 = (0, runtime2.nodeAtPath)(frame.node, items)?.place;
      if (value3 === void 0 || hasGroupSizingConstraint(value4, dir))
        return !1;
      if (value3.kind === "grid")
        return dir === "v" && value3.rows === void 0;
      if (value3.kind !== "stack")
        return !1;
      if (value3.dir === dir) {
        if ((value4?.grow ?? 0) > 0 || value4?.basis !== void 0)
          return !1;
        if (stackChildrenFitMeasuredBounds(frame, value2, measure))
          return !0;
      } else if ((value4?.alignSelf ?? value3.align) !== "stretch") {
        let value5 = measure.rect((0, runtime2.createNodeSelection)(frame.id, items)), value6 = measure.rect((0, runtime2.createNodeSelection)(frame.id, value2));
        if (value5 === void 0 || value6 === void 0)
          return !1;
        if (groupMainDimension(value5, dir) < groupMainDimension(value6, dir) - nodeMainAxisInsets(value3, dir) - GROUP_COORDINATE_TOLERANCE)
          return !0;
      }
    }
  }
  function canGroupStackChildren(stack, selected, startIndex, hasKnownSize) {
    if (stack.kind !== "stack" || stack.wrap === !0 || !hasKnownSize || startIndex < 1 || startIndex >= stack.children.length || stack.justify === "between" || stack.justify === "around" || stack.justify === "evenly" || stack.align === "baseline")
      return !1;
    let value = stack.children.slice(selected, selected + startIndex);
    if (value.length !== startIndex || value.some((source) => source.kind === "spacer") || stack.align !== "stretch" && value.some((input) => input.place?.alignSelf !== void 0))
      return !1;
    if (!value.some(childHasGrow))
      return stack.dir === "v" || !value.some((input) => input.place?.basis !== void 0 && input.place.shrink !== 0);
    let callback = (input) => (input?.grow ?? 0) >= 1 && input?.basis === 0 && input.shrink === void 0 && input.minW === void 0 && input.maxW === void 0 && input.minWFit === void 0 && input.aspect === void 0;
    return GROUP_GROWING_STACK_CHILDREN_ENABLED && stack.dir === "h" && value.every((input) => childHasGrow(input) && callback(input.place));
  }
  function groupedChildrenPlacement(stack, children) {
    if (children.some(childHasGrow))
      return {
        grow: children.reduce((input, options) => input + (options.place?.grow ?? 0), 0),
        basis: stack.gap * (children.length - 1) + children.reduce((input, options) => input + nodeMainAxisInsets(options, stack.dir), 0)
      };
  }
  function groupRelativeAnchor(anchor, relative, size4, preserveHug) {
    let value = anchor.anchor !== "fill" && anchor.size !== void 0 ? anchor.size : preserveHug && anchor.anchor !== "fill" ? void 0 : (0, runtime2.ceilMeasuredNodeSize)(size4);
    return {
      anchor: "leading",
      margin: roundGroupCoordinate(relative),
      offset: 0,
      ...value !== void 0 ? {
        size: value
      } : {}
    };
  }
  function groupFrameSelection(selected) {
    let value = Math.floor(Math.min(...selected.map((input) => input.rect.x))), value2 = Math.floor(Math.min(...selected.map((input) => input.rect.y))), value3 = selected.map((input) => ({
      node: input.node,
      x: groupRelativeAnchor(input.x, input.rect.x - value, input.rect.w, !1),
      y: groupRelativeAnchor(input.y, input.rect.y - value2, input.rect.h, !0)
    })), value4 = (0, runtime2.ceilMeasuredNodeSize)(Math.max(...value3.map((input, options) => input.x.margin + (input.x.size ?? selected[options].rect.w)))), value5 = (0, runtime2.ceilMeasuredNodeSize)(Math.max(...value3.map((input, options) => input.y.margin + (input.y.size ?? selected[options].rect.h)))), state = {
      kind: "overlay",
      base: {
        kind: "stack",
        dir: "v",
        align: "stretch",
        gap: 0,
        children: []
      },
      layers: value3,
      group: !0
    };
    return {
      id: (0, runtime2.createModelId)(),
      x: (0, runtime2.axisSpecFromRect)(GROUP_ZERO_ANCHOR, value, value4, runtime2.SLIDE_WIDTH),
      y: (0, runtime2.axisSpecFromRect)(GROUP_ZERO_ANCHOR, value2, value5, runtime2.SLIDE_HEIGHT),
      node: state
    };
  }
  function regroupOverlayLayers(frame, overlay, rectangles, fallbackRectangles) {
    if (overlay.layers.some((input, options) => (input.x.size === void 0 || input.y.size === void 0) && fallbackRectangles[options] === void 0))
      return;
    let value = Math.floor(Math.min(...rectangles.map((input) => input.x))), value2 = Math.floor(Math.min(...rectangles.map((input) => input.y))), value3 = overlay.layers.map((input, options) => ({
      ...input,
      x: {
        ...input.x,
        margin: roundGroupCoordinate(rectangles[options].x - value)
      },
      y: {
        ...input.y,
        margin: roundGroupCoordinate(rectangles[options].y - value2)
      }
    })), value4 = (0, runtime2.ceilMeasuredNodeSize)(Math.max(...value3.map((input, options) => input.x.margin + (input.x.size ?? fallbackRectangles[options].w)))), value5 = (0, runtime2.ceilMeasuredNodeSize)(Math.max(...value3.map((input, options) => input.y.margin + (input.y.size ?? fallbackRectangles[options].h))));
    return {
      ...frame,
      x: {
        ...frame.x,
        margin: value,
        size: value4
      },
      y: {
        ...frame.y,
        margin: value2,
        size: value5
      },
      node: {
        ...overlay,
        layers: value3
      }
    };
  }
  function moveLeadingGroupLayer(frame, index4, dx, dy2, rectangles) {
    let node = frame.node;
    if (!(0, runtime2.isEmptyGroupBase)(node) || !hasLeadingOverlayAnchors(frame, node) || node.layers[index4] === void 0)
      return;
    let value = node.layers.map((input, options) => ({
      x: options === index4 ? Math.max(0, frame.x.margin + input.x.margin + dx) : frame.x.margin + input.x.margin,
      y: options === index4 ? Math.max(0, frame.y.margin + input.y.margin + dy2) : frame.y.margin + input.y.margin
    }));
    return regroupOverlayLayers(frame, node, value, rectangles);
  }
  function scaleLeadingOverlayGroup(before, after) {
    let node = before.node;
    if (!(0, runtime2.isEmptyGroupBase)(node) || before.x.size === void 0 || before.y.size === void 0 || after.x.size === void 0 || after.y.size === void 0)
      return;
    let value = after.x.size / before.x.size, value2 = after.y.size / before.y.size, callback = (input, options) => ({
      ...input,
      margin: roundGroupCoordinate(input.margin * options),
      offset: roundGroupCoordinate(input.offset * options),
      ...input.size !== void 0 ? {
        size: Math.max(1, roundGroupCoordinate(input.size * options))
      } : {}
    });
    return {
      ...after,
      node: {
        ...node,
        layers: node.layers.map((input) => ({
          ...input,
          x: callback(input.x, value),
          y: callback(input.y, value2)
        }))
      }
    };
  }
  function resizeGroupedFrame(before, after, rectangle) {
    let value = !((0, runtime2.isOverlayNode)(before.node) && [before.node.style, before.node.base.style].some((input) => input?.borderStyle !== void 0 && input.borderStyle !== "none")) && [before.x, before.y, after.x, after.y].every((input) => input.anchor === "leading");
    if (!value && rectangle === void 0)
      return;
    let { place, ...remainingProps } = after.node, callback = (input, options) => options.size !== void 0 ? {
      ...input,
      size: options.size
    } : input, value2 = !value && rectangle !== void 0 ? (0, runtime2.createFreeFrameFromNode)(after.node, rectangle) : void 0, value3 = value2 !== void 0 && rectangle !== void 0 ? (0, runtime2.normalizeNegativeFrameMargins)({
      ...value2,
      x: callback(value2.x, after.x),
      y: callback(value2.y, after.y)
    }, rectangle) : {
      id: (0, runtime2.createModelId)(),
      x: {
        ...after.x,
        margin: roundGroupCoordinate(before.x.margin + after.x.margin)
      },
      y: {
        ...after.y,
        margin: roundGroupCoordinate(before.y.margin + after.y.margin)
      },
      node: remainingProps
    };
    return before.build !== void 0 ? {
      ...value3,
      build: before.build
    } : value3;
  }
  function canFlattenNestedStackGroup(parent, child) {
    return parent.kind !== "stack" || child.kind !== "stack" || parent.group !== !0 || parent.style !== void 0 && Object.keys(parent.style).length > 0 ? !1 : parent.dir === child.dir && parent.gap === child.gap && parent.align === child.align && parent.wrap !== !0 && parent.justify === void 0 && !parent.children.some((source) => source.kind === "spacer");
  }
  return bindRuntimeValue(runtime2, "GROUP_COMMAND", () => GROUP_COMMAND, (value) => {
    GROUP_COMMAND = value;
  }), bindRuntimeValue(runtime2, "GROUP_TEXT_TAP_ENABLED", () => GROUP_TEXT_TAP_ENABLED, (value) => {
    GROUP_TEXT_TAP_ENABLED = value;
  }), bindRuntimeValue(runtime2, "GROUP_MEMBER_SIZES_FROM_MODEL", () => GROUP_MEMBER_SIZES_FROM_MODEL, (value) => {
    GROUP_MEMBER_SIZES_FROM_MODEL = value;
  }), bindRuntimeValue(runtime2, "GROUP_RESIZING_ENABLED", () => GROUP_RESIZING_ENABLED, (value) => {
    GROUP_RESIZING_ENABLED = value;
  }), bindRuntimeValue(runtime2, "GROUP_GROWING_STACK_CHILDREN_ENABLED", () => GROUP_GROWING_STACK_CHILDREN_ENABLED, (value) => {
    GROUP_GROWING_STACK_CHILDREN_ENABLED = value;
  }), bindRuntimeValue(runtime2, "GROUP_MIXED_FRAME_STACK_CHILDREN_ENABLED", () => GROUP_MIXED_FRAME_STACK_CHILDREN_ENABLED, (value) => {
    GROUP_MIXED_FRAME_STACK_CHILDREN_ENABLED = value;
  }), bindRuntimeValue(runtime2, "UNGROUP_UNMARKED_STACK_ENABLED", () => UNGROUP_UNMARKED_STACK_ENABLED, (value) => {
    UNGROUP_UNMARKED_STACK_ENABLED = value;
  }), bindRuntimeValue(runtime2, "GROUP_REFUSAL_MESSAGES", () => GROUP_REFUSAL_MESSAGES, (value) => {
    GROUP_REFUSAL_MESSAGES = value;
  }), bindRuntimeValue(runtime2, "groupingKeyCommand", () => groupingKeyCommand), bindRuntimeValue(runtime2, "GROUP_COORDINATE_TOLERANCE", () => GROUP_COORDINATE_TOLERANCE, (value) => {
    GROUP_COORDINATE_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "roundGroupCoordinate", () => roundGroupCoordinate, (value) => {
    roundGroupCoordinate = value;
  }), bindRuntimeValue(runtime2, "groupMainDimension", () => groupMainDimension, (value) => {
    groupMainDimension = value;
  }), bindRuntimeValue(runtime2, "structurallyEqualGroupValues", () => structurallyEqualGroupValues, (value) => {
    structurallyEqualGroupValues = value;
  }), bindRuntimeValue(runtime2, "normalizedGroupSelection", () => normalizedGroupSelection), bindRuntimeValue(runtime2, "nodeMainAxisInsets", () => nodeMainAxisInsets), bindRuntimeValue(runtime2, "hasGroupSizingConstraint", () => hasGroupSizingConstraint, (value) => {
    hasGroupSizingConstraint = value;
  }), bindRuntimeValue(runtime2, "stackChildrenFitMeasuredBounds", () => stackChildrenFitMeasuredBounds), bindRuntimeValue(runtime2, "stackMainAxisSizeIsKnown", () => stackMainAxisSizeIsKnown), bindRuntimeValue(runtime2, "childHasGrow", () => childHasGrow, (value) => {
    childHasGrow = value;
  }), bindRuntimeValue(runtime2, "canGroupStackChildren", () => canGroupStackChildren), bindRuntimeValue(runtime2, "groupedChildrenPlacement", () => groupedChildrenPlacement), bindRuntimeValue(runtime2, "groupRelativeAnchor", () => groupRelativeAnchor), bindRuntimeValue(runtime2, "GROUP_ZERO_ANCHOR", () => GROUP_ZERO_ANCHOR, (value) => {
    GROUP_ZERO_ANCHOR = value;
  }), bindRuntimeValue(runtime2, "groupFrameSelection", () => groupFrameSelection), bindRuntimeValue(runtime2, "regroupOverlayLayers", () => regroupOverlayLayers), bindRuntimeValue(runtime2, "hasLeadingOverlayAnchors", () => hasLeadingOverlayAnchors, (value) => {
    hasLeadingOverlayAnchors = value;
  }), bindRuntimeValue(runtime2, "isLeadingOverlayGroup", () => isLeadingOverlayGroup, (value) => {
    isLeadingOverlayGroup = value;
  }), bindRuntimeValue(runtime2, "moveLeadingGroupLayer", () => moveLeadingGroupLayer), bindRuntimeValue(runtime2, "scaleLeadingOverlayGroup", () => scaleLeadingOverlayGroup), bindRuntimeValue(runtime2, "resizeGroupedFrame", () => resizeGroupedFrame), bindRuntimeValue(runtime2, "canFlattenNestedStackGroup", () => canFlattenNestedStackGroup), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeModelSelection)(), GROUP_COMMAND = "group", GROUP_TEXT_TAP_ENABLED = !0, GROUP_MEMBER_SIZES_FROM_MODEL = !1, GROUP_RESIZING_ENABLED = !0, GROUP_GROWING_STACK_CHILDREN_ENABLED = !0, GROUP_MIXED_FRAME_STACK_CHILDREN_ENABLED = !0, UNGROUP_UNMARKED_STACK_ENABLED = !1, GROUP_REFUSAL_MESSAGES = {
      few: (0, runtime2.formatMessage)({
        defaultMessage: "请选择至少两个对象进行组合。",
        id: "h3OyF2oqy/"
      }),
      where: (0, runtime2.formatMessage)({
        defaultMessage: "暂时无法组合这些对象。请选择同一行或列中的全部对象，或先将它们拖出。",
        id: "DiDnxsGYw/"
      }),
      stuck: (0, runtime2.formatMessage)({
        defaultMessage: "暂时无法在当前位置组合这些对象，请先将它们拖出。",
        id: "X5dlIvIJSt"
      }),
      styled: (0, runtime2.formatMessage)({
        defaultMessage: "自身样式包含位移或缩放的对象暂时无法组合。",
        id: "zXmFJ0qNrM"
      }),
      apart: (0, runtime2.formatMessage)({
        defaultMessage: "不同行或卡片中的元素暂时无法组合。请组合行或卡片本身，或先拖出其中的元素。",
        id: "DTAP1chqXT"
      }),
      inside: (0, runtime2.formatMessage)({
        defaultMessage: "组合内的对象暂时无法再次组合。",
        id: "qYijhMrvLF"
      }),
      already: (0, runtime2.formatMessage)({
        defaultMessage: "这些对象已经属于同一个组合。",
        id: "rV36C2Yp3n"
      }),
      labels: (0, runtime2.formatMessage)({
        defaultMessage: "固定有其他元素的对象暂时无法加入组合。",
        id: "RDLSRxIB4m"
      }),
      many: (0, runtime2.formatMessage)({
        defaultMessage: "一个组合最多容纳 {max} 个对象。",
        id: "3bpPhvzGrJ"
      }, {
        max: runtime2.maxTextLineSpacing
      }),
      embed: (0, runtime2.formatMessage)({
        defaultMessage: "网页嵌入内容无法组合。",
        id: "QdZ6wZqu5v"
      }),
      deep: (0, runtime2.formatMessage)({
        defaultMessage: "这些对象的嵌套层级过深，请先拖出再组合。",
        id: "dbLBO+/EPb"
      }),
      full: (0, runtime2.formatMessage)({
        defaultMessage: "此幻灯片已满，请先移除一个元素。",
        id: "92NXf/tFaH"
      }),
      nothing: (0, runtime2.formatMessage)({
        defaultMessage: "请先选择一个组合，再取消组合。",
        id: "buDDHouc86"
      }),
      card: (0, runtime2.formatMessage)({
        defaultMessage: "卡片暂时无法取消组合，请将其中的元素拖出。",
        id: "YQa88RfSVb"
      }),
      labelsStay: (0, runtime2.formatMessage)({
        defaultMessage: "固定有其他元素的对象暂时无法取消组合。",
        id: "I+noRXdGQj"
      }),
      painted: (0, runtime2.formatMessage)({
        defaultMessage: "自身带有填充、边框或阴影的组合暂时无法与其他对象组合。请先取消组合，或移除其填充、边框和阴影。",
        id: "/ZNBPIDrmp"
      }),
      unmarked: (0, runtime2.formatMessage)({
        defaultMessage: "已取消组合，内容位置保持不变。",
        id: "w+t/aakkOY"
      }),
      later: (0, runtime2.formatMessage)({
        defaultMessage: "暂时无法取消组合，请重试。",
        id: "1PdVqtJfGw"
      })
    }, GROUP_COORDINATE_TOLERANCE = 0.5, roundGroupCoordinate = (value) => Math.round(value * 100) / 100, groupMainDimension = (rectangle, direction) => direction === "h" ? rectangle.w : rectangle.h, structurallyEqualGroupValues = (left, right) => JSON.stringify(left) === JSON.stringify(right), hasGroupSizingConstraint = (place, direction) => place?.aspect !== void 0 || (direction === "h" ? place?.maxW : place?.maxH) !== void 0, childHasGrow = (node) => (node.place?.grow ?? 0) > 0, GROUP_ZERO_ANCHOR = {
      anchor: "leading",
      margin: 0,
      offset: 0
    }, hasLeadingOverlayAnchors = (frame, overlay) => [
      frame.x,
      frame.y,
      ...overlay.layers.flatMap((input) => [input.x, input.y])
    ].every((input) => input.anchor === "leading"), isLeadingOverlayGroup = (frame) => (0, runtime2.isEmptyGroupBase)(frame.node) && hasLeadingOverlayAnchors(frame, frame.node);
  };
}
export {
  installEditorGrouping
};
