// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelNavigation(runtime2) {
  var maxAccessibleLabelLength, ACCESSIBLE_NODE_KIND_NAMES, UNKNOWN_OBJECT_LABEL, OBJECT_WORD, DELETED_NODE_KIND_LABELS, SHOWN_TEXT_MARKER = "", initializeObjectNavigation;
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
    return (0, runtime2.formatMessage)({
      defaultMessage: "“{text}”",
      id: "GiZIjauwur"
    }, {
      text: ellipsizeAccessibleLabel(text, maxAccessibleLabelLength)
    });
  }
  function accessibleNodeKindName(node) {
    return ACCESSIBLE_NODE_KIND_NAMES[accessibleNodeKind(node)];
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
        return value === "" ? (0, runtime2.formatMessage)({
          defaultMessage: "空",
          id: "XiZZYB+Kod"
        }) : quotedAccessibleLabel(value);
      }
      case "img": {
        let value = node.alt.trim().replace(/\s+/g, " ");
        return value === "" && node.videoLink !== void 0 ? runtime2.videoProviderLabels[node.videoLink.provider] : value === "" ? (0, runtime2.formatMessage)({
          defaultMessage: "无描述",
          id: "7fYFuCN9Mw"
        }) : quotedAccessibleLabel(value);
      }
      case "icon":
        return (runtime2.slideIconNames.includes( node.icon) ? (0, runtime2.slideIconLabel)(node.icon) : String(node.icon).replace(/-/g, " ")) || (0, runtime2.formatMessage)({
          defaultMessage: "未命名",
          id: "mPoRJZyJCC"
        });
      case "shape":
        return (0, runtime2.shapeKindLabel)(node.shape);
      case "html":
        return (0, runtime2.formatMessage)({
          defaultMessage: "交互内容",
          id: "1cuFHGW1gM"
        });
      case "table":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{rows}，{columns}",
          id: "L8UEKoF7ya"
        }, {
          rows: (0, runtime2.formatMessage)({
            defaultMessage: "{count} 行",
            id: "Lo7+ies/HS"
          }, {
            n: node.rows.length,
            count: String(node.rows.length)
          }),
          columns: (0, runtime2.formatMessage)({
            defaultMessage: "{count} 列",
            id: "kccKURjGbz"
          }, {
            n:node.cols,
            count: String(node.cols)
          })
        });
      case "stack":
      case "grid":
      case "overlay": {
        let length = ((0, runtime2.nodeChildren)(node) ?? []).filter(isNavigableNode).length, counts = {
          n: length,
          count: String(length)
        }, value = node.kind === "grid" ?(0, runtime2.formatMessage)({
          defaultMessage: "{count} 格网格",
          id: "m9KBrPgTJw"
        }, counts) : (0, runtime2.isEmptyGroupBase)(node) ?(0, runtime2.formatMessage)({
          defaultMessage: "{count} 个对象",
          id: "syo8PjoW1X"
        }, {
          n:node.layers.length,
          count: String(node.layers.length)
        }) : node.kind === "overlay" ?(0, runtime2.formatMessage)({
          defaultMessage: "{count} 层堆叠",
          id: "XJbR2mguXN"
        }, counts) :node.dir === "h" ? (0, runtime2.formatMessage)({
          defaultMessage: "{count} 项横排",
          id: "ysg53n3P8m"
        }, counts) : (0, runtime2.formatMessage)({
          defaultMessage: "{count} 项竖排",
          id: "zu/f0IskiI"
        }, counts), value2 = withText ? (0, runtime2.nodeTextLabel)(node) : void 0;
        return value2 === void 0 ? value : (0, runtime2.formatMessage)({
          defaultMessage: "{shape}，{quote}",
          id: "OcV5tQrite"
        }, {
          shape: value,
          quote : quotedAccessibleLabel(value2)
        });
      }
      case "spacer":
        return "";
    }
  }
  function capitalizeLabel(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function accessibleNodePositionLabel(node,index4, total, withText = !0) {
    let kindName = ACCESSIBLE_NODE_KIND_NAMES[accessibleNodeKind(node)], detail = accessibleNodeDetail(node, withText), values = {
      kindName,
      content: detail,
      n : String(index4 + 1),
      count: String(total)
    };
    return detail === "" ? kindName : index4 < 0 ?(0, runtime2.formatMessage)({
      defaultMessage: "{kindName}，{content}",
      id: "yNGsA5ZG/R"
    }, values) : (0, runtime2.formatMessage)( {
      defaultMessage: "{kindName}，{content}，第 {n} 项，共 {count} 项",
      id: "XkoAjdILWB"
    }, values);
  }
  function selectedObjectsLabel(count, name) {
    return(0, runtime2.formatMessage) ({
      defaultMessage: "已选择 {count} 个对象；{name}",
      id: "rQ2+VuXgM8"
    }, {
      n: count,
      count : String(count),
      name
    });
  }
  function deletedObjectsLabel(slide, selections) {
    if (selections.length !== 1)
      return (0, runtime2.formatMessage)({
        defaultMessage: "已删除 {count} 个对象",
        id: "mM6tft950u"
      }, {
        n: selections.length,
        count: String(selections.length)
      });
    let selection = selections[0];
    for (let parent = (0, runtime2.parentNodeSelection)(selection); parent !== void 0 && (0, runtime2.selectionNodePath)(selection).at(-1) === 0 && (0, runtime2.selectedNode)(slide, parent)?.kind === "overlay"; parent = (0, runtime2.parentNodeSelection)(selection))
      selection = parent;
    let node = (0, runtime2.selectedNode)(slide, selection);
    return node === void 0 ? (0, runtime2.formatMessage)({
      defaultMessage: "已删除对象",
      id: "1w+nDbJnMi"
    }) : DELETED_NODE_KIND_LABELS[accessibleNodeKind(node)];
  }
  function splitShownTextLabel(label) {
    let index4 = label.indexOf(SHOWN_TEXT_MARKER);
    return index4 < 0 ? {
      before: label.trim(),
      after: ""
    } : {
      before: label.slice(0, index4).trim(),
      after: label.slice(index4 + SHOWN_TEXT_MARKER.length).trim()
    };
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
    if ( value === void 0 || !cardTexts.has(value.text))
      return {};
    let values = {
      name: accessibleNodePositionLabel(node, -1, 0, !1),
      words: SHOWN_TEXT_MARKER,
      n: String(index4 + 1),
      count: String(total)
    }, label = index4 < 0 ? (0, runtime2.formatMessage)( {
      defaultMessage: "{name}，{words}",
      id: "c/bqgyJkz2"}, values) : (0, runtime2.formatMessage)({
      defaultMessage: "{name}，{words}，第 {n} 项，共 {count} 项",
      id: "Wjs6WH5dtb"
    }, values);
    return {
      shown: {
        text: (0, runtime2.createNodeSelection)(unit.frameId, [
          ...(0, runtime2.selectionNodePath)(unit),
          ...value.path
        ]),
        ...splitShownTextLabel(label)
      }
    };
  }
  function accessibleSelectionLabel(slide, selection) {
    let node = (0, runtime2.selectedNode)(slide, selection);
    if (node === void 0)
      return UNKNOWN_OBJECT_LABEL;
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
  return bindRuntimeValue(runtime2, "isNavigableNode", () => isNavigableNode), bindRuntimeValue(runtime2, "childNavigationSelections", () => childNavigationSelections), bindRuntimeValue(runtime2, "slideNavigationSelections", () => slideNavigationSelections), bindRuntimeValue(runtime2, "navigationParentSelection", () => navigationParentSelection), bindRuntimeValue(runtime2, "selectionNavigationGroup", () => selectionNavigationGroup), bindRuntimeValue(runtime2, "nextNavigationSelection", () => nextNavigationSelection), bindRuntimeValue(runtime2, "boundaryNavigationSelection", () => boundaryNavigationSelection), bindRuntimeValue(runtime2, "ellipsizeAccessibleLabel", () => ellipsizeAccessibleLabel), bindRuntimeValue(runtime2, "quotedAccessibleLabel", () => quotedAccessibleLabel), bindRuntimeValue(runtime2, "ACCESSIBLE_NODE_KIND_NAMES", () => ACCESSIBLE_NODE_KIND_NAMES, (value) => {
    ACCESSIBLE_NODE_KIND_NAMES = value;
  }), bindRuntimeValue(runtime2, "UNKNOWN_OBJECT_LABEL", () => UNKNOWN_OBJECT_LABEL, (value) => {
    UNKNOWN_OBJECT_LABEL = value;
  }), bindRuntimeValue(runtime2, "accessibleNodeKindName", () => accessibleNodeKindName), bindRuntimeValue(runtime2, "accessibleNodeKind", () => accessibleNodeKind), bindRuntimeValue(runtime2, "accessibleNodeDetail", () => accessibleNodeDetail), bindRuntimeValue(runtime2, "capitalizeLabel", () => capitalizeLabel), bindRuntimeValue(runtime2, "selectedObjectsLabel", () => selectedObjectsLabel), bindRuntimeValue(runtime2, "OBJECT_WORD", () => OBJECT_WORD, (value) => {
    OBJECT_WORD = value;
  }), bindRuntimeValue(runtime2, "DELETED_NODE_KIND_LABELS", () => DELETED_NODE_KIND_LABELS, (value) => {
    DELETED_NODE_KIND_LABELS = value;
  }), bindRuntimeValue(runtime2, "SHOWN_TEXT_MARKER", () => SHOWN_TEXT_MARKER, (value) => {
    SHOWN_TEXT_MARKER = value;
  }), bindRuntimeValue(runtime2, "splitShownTextLabel", () => splitShownTextLabel), bindRuntimeValue(runtime2, "deletedObjectsLabel", () => deletedObjectsLabel), bindRuntimeValue(runtime2, "accessibleNodePositionLabel", () => accessibleNodePositionLabel), bindRuntimeValue(runtime2, "accessibleSelectionLabel", () => accessibleSelectionLabel), bindRuntimeValue(runtime2, "accessibleNodeTypeLabel", () => accessibleNodeTypeLabel), bindRuntimeValue(runtime2, "accessibleTableCellLabel", () => accessibleTableCellLabel), bindRuntimeValue(runtime2, "nodeDefaultAction", () => nodeDefaultAction), bindRuntimeValue(runtime2, "slideNavigationTree", () => slideNavigationTree), bindRuntimeValue(runtime2, "visibleNavigationTree", () => visibleNavigationTree), bindRuntimeValue(runtime2, "maxAccessibleLabelLength", () => maxAccessibleLabelLength, (value) => {
    maxAccessibleLabelLength = value;
  }), bindRuntimeValue(runtime2, "initializeObjectNavigation", () => initializeObjectNavigation, (value) => {
    initializeObjectNavigation = value;
  }), () => {
    maxAccessibleLabelLength = 60, ACCESSIBLE_NODE_KIND_NAMES = {
      heading: (0, runtime2.formatMessage)({
        defaultMessage: "标题",
        id: "GwsoiWaAn/"
      }),
      text: (0, runtime2.formatMessage)({
        defaultMessage: "文本",
        id: "ZBIVmxnP7t"
      }),
      video: (0, runtime2.formatMessage)({
        defaultMessage: "视频",
        id: "5kCf1eNbOI"
      }),
      image: (0, runtime2.formatMessage)({
        defaultMessage: "图片",
        id: "oKLKmzz+3P"
      }),
      icon: (0, runtime2.formatMessage)({
        defaultMessage: "图标",
        id: "I40hdUexLd"
      }),
      shape: (0, runtime2.formatMessage)({
        defaultMessage: "形状",
        id: "fEkePmJKR3"
      }),
      "网页嵌入内容": (0, runtime2.formatMessage)({
        defaultMessage: "网页嵌入",
        id: "hiQWPDt1Te"
      }),
      table: (0, runtime2.formatMessage)({
        defaultMessage: "表格",
        id: "M/THeg97oH"
      }),
      group: (0, runtime2.formatMessage)({
        defaultMessage: "组合",
        id: "3wTwQUAPV7"
      }),
      "layered group": (0, runtime2.formatMessage)({
        defaultMessage: "分层组合",
        id: "CfiXDZv5+x"
      }),
      spacer: (0, runtime2.formatMessage)({
        defaultMessage: "间隔",
        id: "nog3IodWyc"
      })
    }, UNKNOWN_OBJECT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "对象",
      id: "i0B21p6iIP"
    }), OBJECT_WORD = (0, runtime2.formatMessage)({
      defaultMessage: "对象",
      id: "Z2cNOdLieR"
    }), DELETED_NODE_KIND_LABELS = {
      heading: (0, runtime2.formatMessage)({
        defaultMessage: "已删除标题",
        id: "osLioNVhDb"
      }),
      text: (0, runtime2.formatMessage)({
        defaultMessage: "已删除文本",
        id: "y7vPZXLHCc"
      }),
      video: (0, runtime2.formatMessage)({
        defaultMessage: "已删除视频",
        id: "F35biKsyJT"
      }),
      image: (0, runtime2.formatMessage)({
        defaultMessage: "已删除图片",
        id: "PjH40Q6d98"
      }),
      icon: (0, runtime2.formatMessage)({
        defaultMessage: "已删除图标",
        id: "QD8DUHbQZ0"
      }),
      shape: (0, runtime2.formatMessage)({
        defaultMessage: "已删除形状",
        id: "uMXt18T+1F"
      }),
      "网页嵌入内容": (0, runtime2.formatMessage)({
        defaultMessage: "已删除网页嵌入",
        id: "xMLqVASR/L"
      }),
      table: (0, runtime2.formatMessage)({
        defaultMessage: "已删除表格",
        id: "yJfFWC+GuQ"
      }),
      group: (0, runtime2.formatMessage)({
        defaultMessage: "已删除组合",
        id: "SQrnXDiFdT"
      }),
      "layered group": (0, runtime2.formatMessage)({
        defaultMessage: "已删除分层组合",
        id: "GJlTkqDN/X"
      }),
      spacer: (0, runtime2.formatMessage)({
        defaultMessage: "已删除间隔",
        id: "aWpUqf+yFk"
      })
    }, initializeObjectNavigation = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeModelSelection)();
    });
  };
}
export {
  installModelNavigation
};
