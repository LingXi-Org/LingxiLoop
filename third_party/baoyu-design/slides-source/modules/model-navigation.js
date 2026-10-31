// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelNavigation(runtime2) {
  var maxAccessibleLabelLength, initializeObjectNavigation;
  function isNavigableNode(node) {
    return node.kind !== "spacer";
  }
  function childNavigationSelections(slide, selection) {
    let node = (0, runtime2.selectedNode)(slide, selection);
    if (node === void 0)
      return [];
    let children = (0, runtime2.nodeChildren)(node);
    if (children === void 0)
      return [];
    let path = (0, runtime2.selectionNodePath)(selection), selections = [];
    return children.forEach((input, options) => {
      isNavigableNode(input) && !(options === 0 && (0, runtime2.isEmptyGroupBase)(node)) && selections.push((0, runtime2.createNodeSelection)(selection.frameId, [
        ...path,
        options
      ]));
    }), selections;
  }
  function slideNavigationSelections(slide) {
    let primaryFrameId = (0, runtime2.slidePrimaryLayoutFrame)(slide)?.id, selections = [];
    for (let value of slide.frames)
      (0, runtime2.isEmptyBackgroundFrame)(value) || (value.id === primaryFrameId ? selections.push(...childNavigationSelections(slide, {
        frameId: value.id
      })) : isNavigableNode(value.node) && selections.push({
        frameId: value.id
      }));
    return selections;
  }
  function navigationParentSelection(slide, selection) {
    let parent = (0, runtime2.parentNodeSelection)(selection);
    return parent === void 0 || (0, runtime2.selectionNodePath)(parent).length === 0 && (0, runtime2.slidePrimaryLayoutFrame)(slide)?.id === parent.frameId ? null : parent;
  }
  function selectionNavigationGroup(slide, selection) {
    let parent = navigationParentSelection(slide, selection), units = parent === null ? slideNavigationSelections(slide) : childNavigationSelections(slide, parent);
    return {
      units,
      index: units.findIndex((input) => (0, runtime2.selectionsEqual)(input, selection))
    };
  }
  function nextNavigationSelection(slide, selection, direction) {
    let { units, index: index4 } = selectionNavigationGroup(slide, selection);
    if (units.length !== 0)
      return index4 < 0 ? direction > 0 ? units[0] : units[units.length - 1] : units[(index4 + direction + units.length) % units.length];
  }
  function boundaryNavigationSelection(slide, selection, edge) {
    let { units } = selectionNavigationGroup(slide, selection);
    return edge === "first" ? units[0] : units[units.length - 1];
  }
  function ellipsizeAccessibleLabel(text, maxLength) {
    return text.length <= maxLength ? text : (0, runtime2.truncateUtf16Safely)(text, maxLength - 1) + "…";
  }
  function quotedAccessibleLabel(text) {
    return "“" + ellipsizeAccessibleLabel(text, maxAccessibleLabelLength) + "”";
  }
  function pluralCountLabel(count, label) {
    return String(count) + " " + label + (count === 1 ? "" : "s");
  }
  function accessibleNodeKind(node) {
    switch (node.kind) {
      case "text":
        return node.role === "display" || node.role === "h1" || node.role === "h2" || node.role === "h3" ? "heading" : "text";
      case "img":
        return node.video !== void 0 || node.videoLink !== void 0 ? "video" : "image";
      case "icon":
        return "icon";
      case "shape":
        return "shape";
      case "html":
        return "网页嵌入内容";
      case "table":
        return "table";
      case "stack":
      case "grid":
        return "group";
      case "overlay":
        return (0, runtime2.isEmptyGroupBase)(node) ? "group" : "layered group";
      case "spacer":
        return "spacer";
    }
  }
  function accessibleNodeDetail(node, withText = !0) {
    switch (node.kind) {
      case "text": {
        if (!withText)
          return "";
        let value = node.text.trim().replace(/\s+/g, " ");
        return value === "" ? "Empty" : quotedAccessibleLabel(value);
      }
      case "img": {
        let value = node.alt.trim().replace(/\s+/g, " ");
        return value === "" && node.videoLink !== void 0 ? runtime2.videoProviderLabels[node.videoLink.provider] : value === "" ? "No description" : quotedAccessibleLabel(value);
      }
      case "icon":
        return node.icon.replace(/-/g, " ") || "Unnamed";
      case "shape":
        return runtime2.shapeVariantLabels[node.shape];
      case "html":
        return "Interactive content";
      case "table":
        return pluralCountLabel(node.rows.length, "row") + ", " + pluralCountLabel(node.cols, "column");
      case "stack":
      case "grid":
      case "overlay": {
        let length = ((0, runtime2.nodeChildren)(node) ?? []).filter(isNavigableNode).length, value = node.kind === "grid" ? "Grid of " + String(length) : (0, runtime2.isEmptyGroupBase)(node) ? pluralCountLabel(node.layers.length, "object") : node.kind === "overlay" ? "Stack of " + pluralCountLabel(length, "layer") : (node.dir === "h" ? "Row of " : "Column of ") + String(length), value2 = withText ? (0, runtime2.nodeTextLabel)(node) : void 0;
        return value + (value2 === void 0 ? "" : ", " + quotedAccessibleLabel(value2));
      }
      case "spacer":
        return "";
    }
  }
  function capitalizeLabel(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function accessiblePositionSuffix(index4, total) {
    return index4 < 0 ? "" : ", " + String(index4 + 1) + " / " + String(total);
  }
  function accessibleNodePositionLabel(node, index4, total, withText = !0) {
    let detail = accessibleNodeDetail(node, withText);
    return capitalizeLabel(accessibleNodeKind(node)) + (detail === "" ? "" : ", " + detail) + accessiblePositionSuffix(index4, total);
  }
  function deletedObjectsLabel(slide, selections) {
    if (selections.length !== 1)
      return String(selections.length) + " objects deleted";
    let selection = selections[0];
    for (let parent = (0, runtime2.parentNodeSelection)(selection); parent !== void 0 && (0, runtime2.selectionNodePath)(selection).at(-1) === 0 && (0, runtime2.selectedNode)(slide, parent)?.kind === "overlay"; parent = (0, runtime2.parentNodeSelection)(selection))
      selection = parent;
    let node = (0, runtime2.selectedNode)(slide, selection);
    return (node === void 0 ? "Object" : capitalizeLabel(accessibleNodeKind(node))) + " deleted";
  }
  function firstTextNodeWithPath(node) {
    if (node.kind === "text")
      return node.text.trim() === "" ? void 0 : {
        text: node,
        path: []
      };
    for (let [index4, child] of ((0, runtime2.nodeChildren)(node) ?? []).entries()) {
      let value = firstTextNodeWithPath(child);
      if (value !== void 0)
        return {
          text: value.text,
          path: [index4, ...value.path]
        };
    }
  }
  function linkCardShownText(cardTexts, unit, node, index4, total) {
    let value = cardTexts.size > 0 ? firstTextNodeWithPath(node) : void 0;
    return value === void 0 || !cardTexts.has(value.text) ? {} : {
      shown: {
        text: (0, runtime2.createNodeSelection)(unit.frameId, [
          ...(0, runtime2.selectionNodePath)(unit),
          ...value.path
        ]),
        before: accessibleNodePositionLabel(node, -1, 0, !1) + ",",
        after: accessiblePositionSuffix(index4, total)
      }
    };
  }
  function accessibleSelectionLabel(slide, selection) {
    let node = (0, runtime2.selectedNode)(slide, selection);
    if (node === void 0)
      return "Object";
    let { units, index: index4 } = selectionNavigationGroup(slide, selection);
    return accessibleNodePositionLabel(node, index4, units.length);
  }
  function accessibleNodeTypeLabel(node) {
    return capitalizeLabel(accessibleNodeKind(node));
  }
  function accessibleTableCellLabel(cell) {
    return "Row " + String(cell.r + 1) + ", column " + String(cell.c + 1);
  }
  function nodeDefaultAction(node) {
    if (node.kind === "text")
      return "edit-text";
    if (node.kind === "img" && (node.video !== void 0 || node.videoLink !== void 0))
      return "play";
    if (node.kind === "table")
      return node.rows.length > 0 && node.cols > 0 ? "edit-cell" : "none";
    let value = (0, runtime2.nodeChildren)(node);
    return value !== void 0 && value.some(isNavigableNode) ? "enter" : "none";
  }
  function slideNavigationTree(slide) {
    let tree = [], cardTexts = (0, runtime2.artifactLinkCardTextNodes)(slide), visit = (items, options, context) => {
      items.forEach((input, options2) => {
        let value = (0, runtime2.selectedNode)(slide, input);
        if (value === void 0)
          return;
        let value2 = (0, runtime2.selectionKey)(input);
        tree.push({
          unit: input,
          key: value2,
          name: accessibleNodePositionLabel(value, options2, items.length),
          opens: nodeDefaultAction(value),
          depth: options,
          parentKey: context,
          stop: !0,
          ...linkCardShownText(cardTexts, input, value, options2, items.length)
        }), visit(childNavigationSelections(slide, input), options + 1, value2);
      });
    };
    return visit(slideNavigationSelections(slide), 1, null), tree;
  }
  function visibleNavigationTree(tree, slide, current) {
    if (current === void 0)
      return tree.filter((input) => input.parentKey === null);
    let items = [];
    for (let value5 = navigationParentSelection(slide, current); value5 !== null; value5 = navigationParentSelection(slide, value5))
      items.push((0, runtime2.selectionKey)(value5));
    let value = (0, runtime2.selectedNode)(slide, current), value2 = value === void 0 ? "none" : nodeDefaultAction(value), value3 = (0, runtime2.selectionKey)(current), values = /* @__PURE__ */ new Set([
      null,
      ...items,
      ...value2 === "enter" ? [value3] : []
    ]), value4 = tree.filter((input) => values.has(input.parentKey));
    return value !== void 0 && !value4.some((input) => input.key === value3) && value4.push({
      unit: current,
      key: value3,
      name: accessibleSelectionLabel(slide, current),
      opens: value2,
      depth: items.length + 1,
      parentKey: items[0] ?? null,
      stop: !1,
      ...linkCardShownText((0, runtime2.artifactLinkCardTextNodes)(slide), current, value, -1, 0)
    }), value4;
  }
  return bindRuntimeValue(runtime2, "isNavigableNode", () => isNavigableNode), bindRuntimeValue(runtime2, "childNavigationSelections", () => childNavigationSelections), bindRuntimeValue(runtime2, "slideNavigationSelections", () => slideNavigationSelections), bindRuntimeValue(runtime2, "navigationParentSelection", () => navigationParentSelection), bindRuntimeValue(runtime2, "selectionNavigationGroup", () => selectionNavigationGroup), bindRuntimeValue(runtime2, "nextNavigationSelection", () => nextNavigationSelection), bindRuntimeValue(runtime2, "boundaryNavigationSelection", () => boundaryNavigationSelection), bindRuntimeValue(runtime2, "ellipsizeAccessibleLabel", () => ellipsizeAccessibleLabel), bindRuntimeValue(runtime2, "quotedAccessibleLabel", () => quotedAccessibleLabel), bindRuntimeValue(runtime2, "pluralCountLabel", () => pluralCountLabel), bindRuntimeValue(runtime2, "accessibleNodeKind", () => accessibleNodeKind), bindRuntimeValue(runtime2, "accessibleNodeDetail", () => accessibleNodeDetail), bindRuntimeValue(runtime2, "capitalizeLabel", () => capitalizeLabel), bindRuntimeValue(runtime2, "accessiblePositionSuffix", () => accessiblePositionSuffix), bindRuntimeValue(runtime2, "deletedObjectsLabel", () => deletedObjectsLabel), bindRuntimeValue(runtime2, "accessibleNodePositionLabel", () => accessibleNodePositionLabel), bindRuntimeValue(runtime2, "accessibleSelectionLabel", () => accessibleSelectionLabel), bindRuntimeValue(runtime2, "accessibleNodeTypeLabel", () => accessibleNodeTypeLabel), bindRuntimeValue(runtime2, "accessibleTableCellLabel", () => accessibleTableCellLabel), bindRuntimeValue(runtime2, "nodeDefaultAction", () => nodeDefaultAction), bindRuntimeValue(runtime2, "slideNavigationTree", () => slideNavigationTree), bindRuntimeValue(runtime2, "visibleNavigationTree", () => visibleNavigationTree), bindRuntimeValue(runtime2, "maxAccessibleLabelLength", () => maxAccessibleLabelLength, (value) => {
    maxAccessibleLabelLength = value;
  }), bindRuntimeValue(runtime2, "initializeObjectNavigation", () => initializeObjectNavigation, (value) => {
    initializeObjectNavigation = value;
  }), () => {
    maxAccessibleLabelLength = 60, initializeObjectNavigation = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeModelSelection)();
    });
  };
}
export {
  installModelNavigation
};
