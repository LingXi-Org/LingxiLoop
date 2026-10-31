// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelSelection(runtime2) {
  var objectContextIdPattern, overlayHasVisiblePaint, initializeModelSelection;
  function selectionNodePath(selection) {
    return selection.path !== void 0 ? selection.path : selection.child === void 0 ? [] : [selection.child];
  }
  function createNodeSelection(frameId, path) {
    return path.length === 0 ? {
      frameId
    } : path.length === 1 ? {
      frameId,
      child: path[0]
    } : {
      frameId,
      child: path[0],
      path: [...path]
    };
  }
  function parentNodeSelection(selection) {
    let value = selectionNodePath(selection);
    if (value.length !== 0)
      return createNodeSelection(selection.frameId, value.slice(0, -1));
  }
  function nodePathsEqual(path, otherPath) {
    return path.length === otherPath.length && path.every((input, options) => input === otherPath[options]);
  }
  function compareNodePaths(path, otherPath) {
    let value = Math.min(path.length, otherPath.length);
    for (let index4 = 0; index4 < value; index4++)
      if (path[index4] !== otherPath[index4])
        return path[index4] - otherPath[index4];
    return path.length - otherPath.length;
  }
  function sortSelectionsInDocumentOrder(slide, selections) {
    let frameIndex = (input) => slide.frames.findIndex((input2) => input2.id === input.frameId);
    return [...selections].sort((input, options) => frameIndex(input) - frameIndex(options) || compareNodePaths(selectionNodePath(input), selectionNodePath(options)));
  }
  function selectionsEqual(selection, otherSelection) {
    return selection.frameId === otherSelection.frameId && nodePathsEqual(selectionNodePath(selection), selectionNodePath(otherSelection));
  }
  function selectionKey(selection) {
    let value = selectionNodePath(selection);
    return value.length === 0 ? selection.frameId : selection.frameId + ":" + value.join(".");
  }
  function selectionsKey(selections) {
    return selections.map(selectionKey).join("|");
  }
  function selectedObjectContextIds(selections, editing) {
    let value = selections.map((input) => [input.frameId, ...selectionNodePath(input)].join("/"));
    if (editing) {
      let value2 = editing.cell ? [editing.cell.r, editing.cell.c] : [];
      value.push([editing.frameId, ...editing.path, ...value2].join("/"));
    }
    return normalizeObjectContextIds(value);
  }
  function selectedObjectContext(slide, selections, editing) {
    let items = [];
    for (let value of selections) {
      let value2 = selectedNode(slide, value);
      value2 && items.push({
        id: [value.frameId, ...selectionNodePath(value)].join("/"),
        kind: value2.kind,
        label: (0, runtime2.nodeDisplayLabel)(value2, 1 / 0)
      });
    }
    if (editing) {
      let value = selectedNode(slide, createNodeSelection(editing.frameId, editing.path)), { cell: value2 } = editing, value3 = value2 && value?.kind === "table" ? value.rows[value2.r]?.[value2.c] : void 0;
      value2 && value3 !== void 0 ? items.push({
        id: [editing.frameId, ...editing.path, value2.r, value2.c].join("/"),
        kind: "cell",
        label: value3
      }) : !value2 && value && items.push({
        id: [editing.frameId, ...editing.path].join("/"),
        kind: value.kind,
        label: (0, runtime2.nodeDisplayLabel)(value, 1 / 0)
      });
    }
    return items.filter((input, options) => items.findLastIndex((input2) => input2.id === input.id) === options).filter((input) => objectContextIdPattern.test(input.id));
  }
  function parseObjectContextId(contextId) {
    if (!objectContextIdPattern.test(contextId))
      return null;
    let [value, ...value2] = contextId.split("/");
    return {
      frameId: value,
      path: value2.map(Number)
    };
  }
  function frameContextId(contextId) {
    return contextId != null && objectContextIdPattern.test(contextId) && !contextId.includes("/") ? contextId : null;
  }
  function normalizeObjectContextIds(contextIds) {
    return contextIds.filter((input, options) => contextIds.lastIndexOf(input) === options).filter((input) => objectContextIdPattern.test(input)).slice(-20);
  }
  function selectedNode(slide, selection) {
    let frame = (0, runtime2.frameById)(slide, selection.frameId);
    if (frame)
      return (0, runtime2.nodeAtPath)(frame.node, selectionNodePath(selection));
  }
  function filterValidSelections(slide, selections) {
    return selections.filter((input) => selectedNode(slide, input) !== void 0);
  }
  function toggleNodeSelection(selections, selection) {
    let value = selections.filter((input) => !selectionsEqual(input, selection));
    return value.length === selections.length ? [...selections, selection] : value;
  }
  function selectionContainsNode(selections, selection) {
    return selections.some((input) => selectionsEqual(input, selection));
  }
  function updateSelectedNode(slide, selection, update2) {
    if (selectedNode(slide, selection) === void 0)
      return slide;
    let frame = (0, runtime2.frameById)(slide, selection.frameId);
    if (!frame)
      return slide;
    let updatedNode = (0, runtime2.updateNodeAtPath)(frame.node, selectionNodePath(selection), update2);
    return !(0, runtime2.nodeTreeWithinDepthLimit)(updatedNode, 0) && (0, runtime2.nodeTreeWithinDepthLimit)(frame.node, 0) ? slide : (0, runtime2.updateSlideFrame)(slide, selection.frameId, (input) => ({
      ...input,
      node: updatedNode
    }));
  }
  function cssColorOpacity(color) {
    let value = color.trim().toLowerCase();
    if (value === "transparent")
      return 0;
    let value2 = /^#([0-9a-f]{3,8})$/.exec(value);
    if (value2 !== null) {
      let value4 = value2[1];
      return value4.length === 4 ? parseInt(value4[3] + value4[3], 16) / 255 : value4.length === 8 ? parseInt(value4.slice(6, 8), 16) / 255 : 1;
    }
    let value3 = /^(?:rgba?|hsla?)\(([^)]*)\)$/.exec(value);
    if (value3 !== null) {
      let value4 = value3[1], callback = (input) => Number.isFinite(input) ? Math.min(1, Math.max(0, input)) : 1, callback2 = (input) => callback(input.endsWith("%") ? Number(input.slice(0, -1)) / 100 : Number(input)), value5 = value4.indexOf("/");
      if (value5 >= 0)
        return callback2(value4.slice(value5 + 1).trim());
      let value6 = value4.split(",");
      return value6.length < 4 ? 1 : callback2(value6[3].trim());
    }
    return 1;
  }
  function styleHasVisiblePaint(style) {
    if (style === void 0)
      return !1;
    let backgroundColor = style.backgroundColor;
    if (typeof backgroundColor == "string" && cssColorOpacity(backgroundColor) > 0)
      return !0;
    let backgroundGradient = style.backgroundGradient;
    if (backgroundGradient !== void 0 && backgroundGradient.stops.some((input) => cssColorOpacity(input.color) > 0))
      return !0;
    if (style.borderStyle !== void 0 && style.borderStyle !== "none") {
      let borderWidth = style.borderWidth, value = borderWidth === void 0 || borderWidth > 0, borderColor = style.borderColor, value2 = borderColor === void 0 || typeof borderColor == "string" && cssColorOpacity(borderColor) > 0;
      if (value && value2)
        return !0;
    }
    return style.boxShadow?.some((input) => cssColorOpacity(input.color) > 0) === !0;
  }
  function resolvePaintedSelection(frameId, node, path) {
    if ((0, runtime2.isOverlayNode)(node)) {
      if (node.group === !0 && path.length > 0) {
        let value2 = path[0], value3 = value2 === 0 ? isEmptyGroupBase(node) ? void 0 : node.base : node.layers[value2 - 1]?.node;
        if (value3 === void 0)
          return {
            frameId
          };
        let value4 = resolvePaintedSelection(frameId, value3, path.slice(1));
        return value2 === 0 && (value4 === null || selectionNodePath(value4).length === 0) ? {
          frameId
        } : createNodeSelection(frameId, [
          value2,
          ...value4 === null ? [] : selectionNodePath(value4)
        ]);
      }
      return path.length > 0 ? createNodeSelection(frameId, [path[0]]) : styleHasVisiblePaint(node.style) ? {
        frameId
      } : null;
    }
    if (!(0, runtime2.isFlowContainer)(node))
      return {
        frameId
      };
    let items = [...path];
    for (; items.length > 0 && (0, runtime2.nodeAtPath)(node, items) === void 0; )
      items.pop();
    let value = (0, runtime2.nodeAtPath)(node, items);
    if (!(0, runtime2.isFlowContainer)(value) && !(0, runtime2.isOverlayNode)(value))
      return createNodeSelection(frameId, items);
    for (let length = items.length; length >= 0; length--) {
      let value2 = items.slice(0, length), value3 = (0, runtime2.nodeAtPath)(node, value2);
      if (value3 !== void 0 && styleHasVisiblePaint(value3.style))
        return createNodeSelection(frameId, value2);
    }
    return null;
  }
  function isEmptyGroupBase(node) {
    return (0, runtime2.isOverlayNode)(node) && node.group === !0 && node.base.kind === "stack" && node.base.children.length === 0;
  }
  function resolvePointerSelection(frameId, node, path, selected, options) {
    let items = [...path];
    for (; items.length > 0 && (0, runtime2.nodeAtPath)(node, items) === void 0; )
      items.pop();
    let value = resolvePaintedSelection(frameId, node, items), value2 = value;
    for (let value5 = options.flow === !0 ? 1 : 0; options.groupFirst && value5 <= items.length; value5++) {
      let value6 = (0, runtime2.nodeAtPath)(node, items.slice(0, value5)), value7 = value6 !== void 0 && ((0, runtime2.isFlowContainer)(value6) || (0, runtime2.isOverlayNode)(value6)) && value6.group === !0, value8 = value5 < items.length && selected.some((input) => input.frameId === frameId && selectionNodePath(input).length > value5 && nodePathsEqual(selectionNodePath(input).slice(0, value5), items.slice(0, value5)));
      if (value7 && !value8) {
        value2 = createNodeSelection(frameId, items.slice(0, value5));
        break;
      }
    }
    let value3 = value2 !== null && (0, runtime2.isOverlayNode)(node) && node.group === !0 && selectionNodePath(value2).length > 1 && value2 !== null ? selectionNodePath(value2)[0] === 0 ? {
      frameId
    } : createNodeSelection(frameId, [selectionNodePath(value2)[0]]) : value2, value4 = options.textTap && value2 !== null && value !== null && !selectionsEqual(value2, value) && (0, runtime2.nodeAtPath)(node, selectionNodePath(value))?.kind === "text";
    return {
      grab: value3,
      tap: value4 ? value : value2,
      add: value2
    };
  }
  function togglePointerSelection(selections, pointerSelection) {
    return pointerSelection.add === null || pointerSelection.grab === null || selectionsEqual(pointerSelection.add, pointerSelection.grab) ? null : toggleNodeSelection(selections, pointerSelection.add);
  }
  function pointerSelectsGroup(frameId, node, path, selected, options) {
    let tap = resolvePointerSelection(frameId, node, path, selected, {
      ...options,
      textTap: !1
    }).tap, value = tap === null ? 0 : selectionNodePath(tap).length, value2 = tap === null ? void 0 : (0, runtime2.nodeAtPath)(node, selectionNodePath(tap));
    return tap === null || value2 === void 0 || !("group" in value2) || value2.group !== !0 || path.length <= value ? null : resolvePointerSelection(frameId, node, path, [...selected, createNodeSelection(frameId, path.slice(0, value + 1))], options).tap;
  }
  function collectMarqueeSelection(slide, rect) {
    let items = [], callback = (source, items2) => {
      let value = (0, runtime2.nodeChildren)(source), value2 = items2.length > 0 && ((0, runtime2.isFlowContainer)(source) || (0, runtime2.isOverlayNode)(source)) && source.group === !0;
      value !== void 0 && !value2 && (items2.length === 0 || !styleHasVisiblePaint(source.style)) ? value.forEach((input, options) => callback(input, [...items2, options])) : items2.length > 0 && source.kind !== "spacer" && items.push(createNodeSelection(slide, items2));
    };
    return callback(rect, []), items;
  }
  function commonSelectedNodeKind(slide, selections) {
    let value;
    for (let value2 of selections) {
      let value3 = selectedNode(slide, value2);
      if (!value3)
        return;
      if (value === void 0)
        value = value3.kind;
      else if (value !== value3.kind)
        return;
    }
    return value;
  }
  return bindRuntimeValue(runtime2, "selectionNodePath", () => selectionNodePath), bindRuntimeValue(runtime2, "createNodeSelection", () => createNodeSelection), bindRuntimeValue(runtime2, "parentNodeSelection", () => parentNodeSelection), bindRuntimeValue(runtime2, "nodePathsEqual", () => nodePathsEqual), bindRuntimeValue(runtime2, "compareNodePaths", () => compareNodePaths), bindRuntimeValue(runtime2, "sortSelectionsInDocumentOrder", () => sortSelectionsInDocumentOrder), bindRuntimeValue(runtime2, "selectionsEqual", () => selectionsEqual), bindRuntimeValue(runtime2, "selectionKey", () => selectionKey), bindRuntimeValue(runtime2, "selectionsKey", () => selectionsKey), bindRuntimeValue(runtime2, "selectedObjectContextIds", () => selectedObjectContextIds), bindRuntimeValue(runtime2, "selectedObjectContext", () => selectedObjectContext), bindRuntimeValue(runtime2, "parseObjectContextId", () => parseObjectContextId), bindRuntimeValue(runtime2, "frameContextId", () => frameContextId), bindRuntimeValue(runtime2, "normalizeObjectContextIds", () => normalizeObjectContextIds), bindRuntimeValue(runtime2, "selectedNode", () => selectedNode), bindRuntimeValue(runtime2, "filterValidSelections", () => filterValidSelections), bindRuntimeValue(runtime2, "toggleNodeSelection", () => toggleNodeSelection), bindRuntimeValue(runtime2, "selectionContainsNode", () => selectionContainsNode), bindRuntimeValue(runtime2, "updateSelectedNode", () => updateSelectedNode), bindRuntimeValue(runtime2, "cssColorOpacity", () => cssColorOpacity), bindRuntimeValue(runtime2, "styleHasVisiblePaint", () => styleHasVisiblePaint), bindRuntimeValue(runtime2, "resolvePaintedSelection", () => resolvePaintedSelection), bindRuntimeValue(runtime2, "isEmptyGroupBase", () => isEmptyGroupBase), bindRuntimeValue(runtime2, "resolvePointerSelection", () => resolvePointerSelection), bindRuntimeValue(runtime2, "togglePointerSelection", () => togglePointerSelection), bindRuntimeValue(runtime2, "pointerSelectsGroup", () => pointerSelectsGroup), bindRuntimeValue(runtime2, "collectMarqueeSelection", () => collectMarqueeSelection), bindRuntimeValue(runtime2, "commonSelectedNodeKind", () => commonSelectedNodeKind), bindRuntimeValue(runtime2, "objectContextIdPattern", () => objectContextIdPattern, (value) => {
    objectContextIdPattern = value;
  }), bindRuntimeValue(runtime2, "overlayHasVisiblePaint", () => overlayHasVisiblePaint, (value) => {
    overlayHasVisiblePaint = value;
  }), bindRuntimeValue(runtime2, "initializeModelSelection", () => initializeModelSelection, (value) => {
    initializeModelSelection = value;
  }), () => {
    overlayHasVisiblePaint = (input) => styleHasVisiblePaint(input.style) || styleHasVisiblePaint(input.base.style), initializeModelSelection = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), objectContextIdPattern = /^[A-Za-z0-9_-]{1,64}(\/\d{1,2}){0,4}$/;
    });
  };
}
export {
  installModelSelection
};
