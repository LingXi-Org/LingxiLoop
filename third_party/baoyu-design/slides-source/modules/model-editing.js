// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelEditing(runtime2) {
  var borderSideNames, borderSideWidthFields, emptyBorderSideWidthPatch, borderCornerRadiusFields, borderCornerNames, emptyCornerRadiusPatch, headingTextRoles;
  function slideTitleTextAt(slide) {
    return slideTextAt(slide, headingTextRoles) ?? slideTextAt(slide);
  }
  function slideTitleText(slide) {
    return slideTitleTextAt(slide)?.text;
  }
  var initializeModelEditing;
  function nodeAtPath(node, path) {
    let value = node;
    for (let value2 of path) {
      let value3 = (0, runtime2.nodeChildren)(value);
      if (value3 === void 0)
        return;
      let value4 = value3[value2];
      if (!value4)
        return;
      value = value4;
    }
    return value;
  }
  function updateNodeAtPath(node, path, update2) {
    if (path.length === 0)
      return update2(node);
    let [index4, ...tail] = path;
    if ((0, runtime2.isOverlayNode)(node)) {
      if (index4 === 0)
        return {
          ...node,
          base: updateNodeAtPath(node.base, tail, update2)
        };
      let value2 = node.layers[index4 - 1];
      if (!value2)
        return node;
      let items2 = [...node.layers];
      return items2[index4 - 1] = {
        ...value2,
        node: updateNodeAtPath(value2.node, tail, update2)
      }, {
        ...node,
        layers: items2
      };
    }
    if (!(0, runtime2.isFlowContainer)(node))
      return node;
    let value = node.children[index4];
    if (!value)
      return node;
    let items = [...node.children];
    return items[index4] = updateNodeAtPath(value, tail, update2), {
      ...node,
      children: items
    };
  }
  function imageNodeAtPath(slide, frameId, path) {
    let frame = slide !== void 0 ? frameById(slide, frameId) : void 0, node = frame !== void 0 ? nodeAtPath(frame.node, path) : void 0;
    return node?.kind === "img" ? node : void 0;
  }
  function frameById(slide, frameId) {
    return slide.frames.find((input) => input.id === frameId);
  }
  function updateSlideFrame(slide, frameId, update2) {
    return {
      ...slide,
      frames: slide.frames.map((input) => input.id === frameId ? update2(input) : input)
    };
  }
  function removeSlideFrame(slide, frameId) {
    return {
      ...slide,
      frames: slide.frames.filter((input) => input.id !== frameId)
    };
  }
  function appendSlideFrame(slide, frame) {
    return {
      ...slide,
      frames: [...slide.frames, frame]
    };
  }
  function frameStackContentOffset(slide) {
    return (0, runtime2.isGradientBackgroundSlide)(slide) ? 1 : 0;
  }
  function reorderSlideFrames(slide, frameIds, direction) {
    let backgroundCount = frameStackContentOffset(slide), contentFrames = slide.frames.slice(backgroundCount), selectedFrames = contentFrames.filter((input) => frameIds.has(input.id));
    if (selectedFrames.length === 0)
      return slide;
    let remainingFrames = contentFrames.filter((input) => !frameIds.has(input.id)), backgroundFrames = slide.frames.slice(0, backgroundCount);
    return {
      ...slide,
      frames: direction === "back" ? [...backgroundFrames, ...selectedFrames, ...remainingFrames] : [...backgroundFrames, ...remainingFrames, ...selectedFrames]
    };
  }
  function removeOverlayLayer(overlay, layerIndex) {
    return {
      ...overlay,
      layers: overlay.layers.filter((input, options) => options !== layerIndex)
    };
  }
  function removeNestedNode(slide, frameId, path) {
    if (path.length < 2)
      return removeSlideNode(slide, frameId, path[0] ?? -1);
    let frame = frameById(slide, frameId);
    if (!frame)
      return slide;
    let parentPath = path.slice(0, -1), childIndex = path[path.length - 1], parent = nodeAtPath(frame.node, parentPath);
    if (parent === void 0)
      return slide;
    if ((0, runtime2.isOverlayNode)(parent))
      return childIndex === 0 ? removeNestedNode(slide, frameId, parentPath) : childIndex - 1 < 0 || childIndex - 1 >= parent.layers.length ? slide : updateSlideFrame(slide, frameId, (input) => ({
        ...input,
        node: updateNodeAtPath(input.node, parentPath, (input2) => (0, runtime2.isOverlayNode)(input2) ? removeOverlayLayer(input2, childIndex - 1) : input2)
      }));
    if (!(0, runtime2.isFlowContainer)(parent) || childIndex < 0 || childIndex >= parent.children.length)
      return slide;
    let value = parent.children.filter((input, options) => options !== childIndex);
    return value.every((source) => source.kind === "spacer") ? removeNestedNode(slide, frameId, parentPath) : updateSlideFrame(slide, frameId, (input) => ({
      ...input,
      node: updateNodeAtPath(input.node, parentPath, (input2) => (0, runtime2.isFlowContainer)(input2) ? {
        ...input2,
        children: value
      } : input2)
    }));
  }
  function removeSlideNode(slide, frameId, child) {
    if (typeof child != "number") {
      if (child.length !== 1)
        return removeNestedNode(slide, frameId, child);
      child = child[0];
    }
    let frame = frameById(slide, frameId);
    if (!frame)
      return slide;
    if ((0, runtime2.isOverlayNode)(frame.node)) {
      if (child === 0)
        return removeSlideFrame(slide, frameId);
      if (child - 1 < 0 || child - 1 >= frame.node.layers.length)
        return slide;
      let value2 = child - 1;
      return updateSlideFrame(slide, frameId, (input) => (0, runtime2.isOverlayNode)(input.node) ? {
        ...input,
        node: removeOverlayLayer(input.node, value2)
      } : input);
    }
    if (!(0, runtime2.isFlowContainer)(frame.node) || child < 0 || child >= frame.node.children.length)
      return slide;
    let value = frame.node.children.filter((input, options) => options !== child);
    return value.every((source) => source.kind === "spacer") ? removeSlideFrame(slide, frameId) : updateSlideFrame(slide, frameId, (input) => (0, runtime2.isFlowContainer)(input.node) ? {
      ...input,
      node: {
        ...input.node,
        children: value
      }
    } : input);
  }
  function wrapNodeInContainer(slide, frameId, child) {
    if (typeof child != "number") {
      if (child.length === 1)
        return wrapNodeInContainer(slide, frameId, child[0]);
      let value3 = frameById(slide, frameId), value4 = child.slice(0, -1), value5 = child[child.length - 1], value6 = value3 ? nodeAtPath(value3.node, value4) : void 0;
      if (!value3 || value6 === void 0)
        return slide;
      if ((0, runtime2.isOverlayNode)(value6)) {
        let value7 = value6.layers[value5 - 1];
        if (value5 === 0 || !value7 || value6.layers.length >= runtime2.maxTextLineSpacing)
          return slide;
        let value8 = structuredClone(value7);
        value8.x = (0, runtime2.moveAxisSpec)(value8.x, 24), value8.y = (0, runtime2.moveAxisSpec)(value8.y, 24);
        let items3 = [...value6.layers];
        return items3.splice(value5, 0, value8), updateSlideFrame(slide, frameId, (input) => ({
          ...input,
          node: updateNodeAtPath(input.node, value4, (input2) => (0, runtime2.isOverlayNode)(input2) ? {
            ...input2,
            layers: items3
          } : input2)
        }));
      }
      if (!(0, runtime2.isFlowContainer)(value6) || !value6.children[value5])
        return slide;
      let items2 = [...value6.children];
      return items2.splice(value5 + 1, 0, structuredClone(value6.children[value5])), updateSlideFrame(slide, frameId, (input) => ({
        ...input,
        node: updateNodeAtPath(input.node, value4, (input2) => (0, runtime2.isFlowContainer)(input2) ? {
          ...input2,
          children: items2
        } : input2)
      }));
    }
    let value = frameById(slide, frameId);
    if (!value)
      return slide;
    if ((0, runtime2.isOverlayNode)(value.node)) {
      let value3 = value.node.layers[child - 1];
      if (child === 0 || !value3 || value.node.layers.length >= runtime2.maxTextLineSpacing)
        return slide;
      let value4 = structuredClone(value3);
      value4.x = (0, runtime2.moveAxisSpec)(value4.x, 24), value4.y = (0, runtime2.moveAxisSpec)(value4.y, 24);
      let items2 = [...value.node.layers];
      return items2.splice(child, 0, value4), updateSlideFrame(slide, frameId, (input) => (0, runtime2.isOverlayNode)(input.node) ? {
        ...input,
        node: {
          ...input.node,
          layers: items2
        }
      } : input);
    }
    if (!(0, runtime2.isFlowContainer)(value.node))
      return slide;
    let value2 = value.node.children[child];
    if (!value2)
      return slide;
    let items = [...value.node.children];
    return items.splice(child + 1, 0, structuredClone(value2)), updateSlideFrame(slide, frameId, (input) => (0, runtime2.isFlowContainer)(input.node) ? {
      ...input,
      node: {
        ...input.node,
        children: items
      }
    } : input);
  }
  function isEditableTextNode(node) {
    return node?.kind === "text";
  }
  function nodeIsBold(node, theme = "anthropic") {
    return (node.style?.fontWeight ?? (theme === "neutral" ? (0, runtime2.typeScaleForRole)(node.role, theme).fontWeight : 0)) >= 600;
  }
  function toggleNodeBold(node, theme = "anthropic", weight) {
    let style = {
      ...node.style
    }, defaultWeight = (0, runtime2.typeScaleForRole)(node.role, theme).fontWeight, weight2 = nodeIsBold(node, theme) ? weight !== void 0 && weight < 600 ? weight : defaultWeight < 600 ? defaultWeight : 400 : weight !== void 0 && weight >= 600 ? weight : defaultWeight >= 600 ? defaultWeight : 700;
    weight2 === defaultWeight ? delete style.fontWeight : style.fontWeight = weight2;
    let state = {
      ...node
    };
    return Object.keys(style).length === 0 ? delete state.style : state.style = style, state;
  }
  function nodeIsItalic(node) {
    return node.style?.fontStyle === "italic";
  }
  function toggleNodeItalic(node) {
    let style = {
      ...node.style
    };
    nodeIsItalic(node) ? delete style.fontStyle : style.fontStyle = "italic";
    let node2 = {
      ...node
    };
    return Object.keys(style).length === 0 ? delete node2.style : node2.style = style, node2;
  }
  function applyTextListFields(node, fields, lists, gutter) {
    let { list: oldList, lineLists: oldLineLists, listIndent, ...rest } = node, result = {
      ...rest,
      ...fields.list !== void 0 ? { list: fields.list } : fields.lineLists !== void 0 ? { lineLists: fields.lineLists } : {}
    };
    if (oldLineLists !== void 0 && fields.lineLists !== void 0)
      return listIndent !== void 0 ? {
        ...result,
        listIndent
      } : result;
    if (lists !== "css")
      return result;
    let defaultGutter = runtime2.defaultListGutter, paddingLeft = node.style?.paddingLeft;
    if (oldLineLists !== void 0 && fields.list !== void 0) {
      let value = Math.min(256, (paddingLeft ?? 0) + (listIndent ?? defaultGutter));
      return patchNodeStyle(result, {
        paddingLeft: value === defaultGutter ? void 0 : value
      });
    }
    if (oldList === void 0 || fields.lineLists === void 0)
      return result;
    let indent = paddingLeft ?? defaultGutter, kept = Math.max(Math.min(indent, gutter ?? (paddingLeft !== void 0 ? node.style?.paddingRight : void 0) ?? 0), indent - defaultGutter), patched = patchNodeStyle(result, {
      paddingLeft: kept === 0 ? void 0 : kept
    });
    return indent - kept === defaultGutter ? patched : {
      ...patched,
      listIndent: indent - kept
    };
  }
  function setNodeList(node, list, lists) {
    return applyTextListFields(node, {
      list
    }, lists);
  }
  function nodeIsUnderlined(node) {
    return node.style?.textDecorationLine === "underline";
  }
  function toggleNodeUnderline(node) {
    return node.style?.textDecorationLine === "line-through" ? node : patchNodeStyle(node, nodeIsUnderlined(node) ? {
      textDecorationLine: void 0,
      textDecorationStyle: void 0,
      textDecorationColor: void 0
    } : {
      textDecorationLine: "underline"
    });
  }
  function patchNodeStyle(node, patch) {
    let style = {
      ...node.style
    };
    for (let [value, value2] of Object.entries(patch))
      value2 === void 0 ? delete style[value] : style[value] = value2;
    let result = {
      ...node
    };
    return Object.keys(style).length === 0 ? delete result.style : result.style = style, result.kind === "text" && result.fill !== void 0 && (patch.backgroundColor !== void 0 || patch.backgroundGradient !== void 0) && delete result.fill, result;
  }
  function setTextFill(node, fill) {
    if (node.kind !== "text")
      return node;
    if (fill === void 0) {
      let { fill: value, ...value2 } = node;
      return value2;
    }
    return {
      ...patchNodeStyle(node, {
        backgroundColor: void 0,
        backgroundGradient: void 0
      }),
      fill
    };
  }
  function setNodeRotation(node, rotation) {
    let rotation2 = (0, runtime2.normalizeRotation)(rotation);
    if (node.kind === "shape") {
      let { rotate: value, ...value2 } = node;
      return rotation2 === void 0 || node.shape === "connector" ? value2 : {
        ...value2,
        rotate: rotation2
      };
    }
    let transform = {
      ...node.style?.transform
    };
    return rotation2 === void 0 ? delete transform.rotate : transform.rotate = rotation2, patchNodeStyle(node, {
      transform: Object.keys(transform).length === 0 ? void 0 : transform
    });
  }
  function updatePositionedNode(slide, frameId, path, xAxis, yAxis, update2) {
    return updateSlideFrame(slide, frameId, (input) => {
      if (path.length === 0)
        return {
          ...input,
          x: xAxis,
          y: yAxis,
          node: update2(input.node)
        };
      let value = path[path.length - 1] - 1, value2 = updateNodeAtPath(input.node, path.slice(0, -1), (input2) => {
        let value3 = (0, runtime2.isOverlayNode)(input2) ? input2.layers[value] : void 0;
        if (!(0, runtime2.isOverlayNode)(input2) || !value3)
          return input2;
        let items = [...input2.layers];
        return items[value] = {
          ...value3,
          x: xAxis,
          y: yAxis,
          node: update2(value3.node)
        }, {
          ...input2,
          layers: items
        };
      });
      return value2 === input.node ? input : {
        ...input,
        node: value2
      };
    });
  }
  function pinNodeToRect(slide, frameId, path, rect) {
    let state = {
      anchor: "leading",
      margin: Math.max(0, rect.left),
      offset: 0,
      size: rect.w
    }, state2 = {
      anchor: "leading",
      margin: Math.max(0, rect.top),
      offset: 0,
      size: rect.h
    };
    return updatePositionedNode(slide, frameId, path, state, state2, (input) => {
      if (!(0, runtime2.isConnectorNode)(input))
        return input;
      let { from: value, w: value2, h: value3, ...value4 } = input;
      return rect.from === "tl" ? value4 : {
        ...value4,
        from: rect.from
      };
    });
  }
  function updatePinnedNodeRect(slide, frameId, path, rect, preservePosition) {
    let callback = (input, options, context) => input >= 0 ? {
      anchor: "leading",
      margin: input,
      offset: 0,
      size: options
    } : {
      anchor: "center",
      margin: 0,
      offset: input + options / 2 - context / 2,
      size: options
    }, callback2 = (input) => {
      if (!(0, runtime2.isLineShapeNode)(input))
        return input;
      let { w: value, h: value2, ...value3 } = input;
      return setNodeRotation(value3, rect.rotate ?? 0);
    };
    return updatePositionedNode(slide, frameId, path, callback(rect.left, rect.w, preservePosition[0]), callback(rect.top, rect.h, preservePosition[1]), callback2);
  }
  function smallerAxisSpec(xAxis, yAxis) {
    let width = xAxis.anchor !== "fill" ? xAxis.size : void 0, height2 = yAxis.anchor !== "fill" ? yAxis.size : void 0;
    return (width !== void 0 && height2 !== void 0 ? width < height2 : width !== void 0 ? yAxis.anchor === "fill" : height2 !== void 0 && xAxis.anchor !== "fill") ? {
      axis: "x",
      size: width,
      length: height2
    } : {
      axis: "y",
      size: height2,
      length: width
    };
  }
  function smallerMediaAxis(node) {
    return node.w !== void 0 && node.w < (node.h ?? runtime2.defaultMediaSize) ? "w" : "h";
  }
  function hollowShapeOutline(node) {
    let outline = (0, runtime2.shapeOutline)(node.style);
    if (outline !== void 0 && node.style?.backgroundColor === void 0 && node.style?.backgroundGradient === void 0)
      return outline;
  }
  function fillShapeFromOutline(node, outline) {
    return patchNodeStyle(node, {
      backgroundColor: outline.color,
      borderWidth: void 0,
      borderStyle: void 0,
      borderColor: void 0,
      borderSides: void 0,
      borderTopWidth: void 0,
      borderRightWidth: void 0,
      borderBottomWidth: void 0,
      borderLeftWidth: void 0
    });
  }
  function minimumStrokeAdjustedSize(node, size4) {
    let outline = (0, runtime2.shapeOutline)(node.style);
    return outline !== void 0 && size4 !== void 0 ? Math.max(size4, 2 * outline.width) : size4;
  }
  function minimumLineThickness(node) {
    let outline = (0, runtime2.shapeOutline)(node.style);
    return outline !== void 0 && hollowShapeOutline(node) === void 0 ? 2 * outline.width : 1;
  }
  function nodeThicknessInfo(slide, frameId, path) {
    let value = frameById(slide, frameId);
    if (!value)
      return;
    let callback = (input, options, context) => {
      let value5 = smallerAxisSpec(options, context);
      return {
        size: minimumStrokeAdjustedSize(input, value5.size),
        writable: (value5.axis === "y" ? context : options).anchor !== "fill"
      };
    };
    if (path.length === 0)
      return (0, runtime2.isLineShapeNode)(value.node) ? callback(value.node, value.x, value.y) : void 0;
    let value2 = nodeAtPath(value.node, path.slice(0, -1)), value3 = path[path.length - 1];
    if (value2 !== void 0 && (0, runtime2.isOverlayNode)(value2)) {
      let value5 = value3 >= 1 ? value2.layers[value3 - 1] : void 0;
      return value5 !== void 0 && (0, runtime2.isLineShapeNode)(value5.node) ? callback(value5.node, value5.x, value5.y) : void 0;
    }
    let value4 = value2 !== void 0 && (0, runtime2.isFlowContainer)(value2) ? value2.children[value3] : void 0;
    if (value4 !== void 0 && (0, runtime2.isLineShapeNode)(value4))
      return {
        size: minimumStrokeAdjustedSize(value4, value4[smallerMediaAxis(value4)]),
        writable: !0
      };
  }
  function nodeThickness(slide, frameId, path) {
    return nodeThicknessInfo(slide, frameId, path)?.size;
  }
  function nodeThicknessIsWritable(slide, frameId, path) {
    return nodeThicknessInfo(slide, frameId, path)?.writable === !0;
  }
  function setNodeThickness(slide, frameId, path, thickness) {
    let value = Math.max(1, Math.round(thickness)), callback = (input, options, context, value2) => {
      let value3 = smallerAxisSpec(options, context), value4 = value3.axis === "y" ? context : options;
      if (value4.anchor === "fill")
        return {
          x: options,
          y: context
        };
      let value5 = value3.axis === "y" ? options : context, value6 = value2 === void 0 ? void 0 : value3.axis === "y" ? value2[0] : value2[1], value7 = value3.length ?? (value5.anchor === "fill" && value6 !== void 0 ? value6 - 2 * value5.margin : void 0), value8 = Math.max(minimumLineThickness(input), value7 !== void 0 ? Math.max(1, Math.min(value, value7 - 1)) : value), value9 = value2 === void 0 ? void 0 : value3.axis === "y" ? value2[1] : value2[0], value10 = minimumStrokeAdjustedSize(input, value3.size), state = {
        ...value4,
        size: value8
      };
      if (value4.anchor !== "center" && value10 !== void 0) {
        let value11 = value4.margin - (value8 - value10) / 2;
        value11 >= 0 || value9 === void 0 ? state = {
          ...value4,
          size: value8,
          margin: Math.max(0, value11)
        } : state = {
          anchor: "center",
          margin: 0,
          offset: (value4.anchor === "leading" ? value11 : value9 - value11 - value8) + value8 / 2 - value9 / 2,
          size: value8
        };
      }
      return value3.axis === "y" ? {
        x: options,
        y: state
      } : {
        x: state,
        y: context
      };
    }, callback2 = (input) => {
      let value2 = hollowShapeOutline(input);
      return value2 === void 0 ? input : fillShapeFromOutline(input, value2);
    }, callback3 = (input) => {
      let { w: value2, h: value3, ...value4 } = callback2(input);
      return value4;
    };
    return updateSlideFrame(slide, frameId, (input) => {
      if (path.length === 0)
        return (0, runtime2.isLineShapeNode)(input.node) ? {
          ...input,
          ...callback(input.node, input.x, input.y, [
            runtime2.SLIDE_WIDTH,
            runtime2.SLIDE_HEIGHT
          ]),
          node: callback3(input.node)
        } : input;
      let value2 = path[path.length - 1], value3 = updateNodeAtPath(input.node, path.slice(0, -1), (source) => {
        if ((0, runtime2.isOverlayNode)(source) && value2 >= 1) {
          let value9 = source.layers[value2 - 1];
          if (value9 === void 0 || !(0, runtime2.isLineShapeNode)(value9.node))
            return source;
          let items2 = [...source.layers];
          return items2[value2 - 1] = {
            ...value9,
            ...callback(value9.node, value9.x, value9.y, void 0),
            node: callback3(value9.node)
          }, {
            ...source,
            layers: items2
          };
        }
        if (!(0, runtime2.isFlowContainer)(source))
          return source;
        let value4 = source.children[value2];
        if (value4 === void 0 || !(0, runtime2.isLineShapeNode)(value4))
          return source;
        let items = [...source.children], value5 = smallerMediaAxis(value4), value6 = value5 === "w" ? value4.h ?? runtime2.defaultMediaSize : value4.w, value7 = Math.max(minimumLineThickness(value4), value6 !== void 0 ? Math.max(1, Math.min(value, value6 - 1)) : value), value8 = source.kind === "stack" ? source.dir === "h" ? "x" : "y" : void 0;
        return items[value2] = (0, runtime2.setNodeAxisSize)(callback2(value4), value5 === "w" ? "x" : "y", value7, value8), {
          ...source,
          children: items
        };
      });
      return value3 === input.node ? input : {
        ...input,
        node: value3
      };
    });
  }
  function setTableCellColor(table, row, column, color) {
    let cellKey = String(row) + "." + String(column), cellStyles = {
      ...table.cellStyles
    };
    color === void 0 ? delete cellStyles[cellKey] : cellStyles[cellKey] = {
      ...cellStyles[cellKey],
      color
    };
    let result = {
      ...table
    };
    return Object.keys(cellStyles).length === 0 ? delete result.cellStyles : result.cellStyles = cellStyles, result;
  }
  function setTableColumnAlignment(table, column, alignment) {
    if (column < 0 || column >= table.cols)
      return table;
    let alignments = Array.from({
      length: table.cols
    }, (input, options) => options === column ? alignment : table.colAligns?.[options] ?? "start"), result = {
      ...table
    };
    return alignments.every((input) => input === "start") ? delete result.colAligns : result.colAligns = alignments, result;
  }
  function nodeUniformLink(node) {
    let linkMarks = (node.marks ?? []).filter((input) => input.href !== void 0), href = linkMarks[0]?.href;
    if (!(href === void 0 || linkMarks.some((input) => input.href !== href))) {
      for (let index4 = 0; index4 < node.text.length; index4++)
        if (node.text[index4] !== `
` && !linkMarks.some((input) => input.start <= index4 && index4 < input.end))
          return;
      if (node.text.replace(/\n/g, "") !== "")
        return href;
    }
  }
  function setNodeLink(node, href) {
    if (href !== void 0 && (node.marks?.length ?? 0) >= runtime2.maxTextMarks)
      return node;
    let marks = [];
    for (let value2 of node.marks ?? [])
      if (value2.href === void 0)
        marks.push(value2);
      else if (value2.bold !== void 0 || value2.italic !== void 0 || value2.underline !== void 0 || value2.color !== void 0) {
        let { href: value3, ...value4 } = value2;
        marks.push(value4);
      }
    href !== void 0 && node.text.length > 0 && marks.unshift({
      start: 0,
      end: node.text.length,
      href
    });
    let value = (0, runtime2.normalizeTextMarks)(marks, node.text), state = {
      ...node
    };
    return value === void 0 || value.length === 0 ? delete state.marks : state.marks = value, state;
  }
  function hasPerSideBorderWidths(style) {
    return style !== void 0 && borderSideNames.some((input) => style[borderSideWidthFields[input]] !== void 0);
  }
  function borderWidthsBySide(style) {
    let widths = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    };
    if (style === void 0 || style.borderStyle === void 0 || style.borderStyle === "none")
      return widths;
    let perSide = hasPerSideBorderWidths(style), sides2 = style.borderSides === void 0 ? null : " " + style.borderSides + " ", value = style.borderWidth ?? (perSide ? 0 : 3);
    for (let value2 of borderSideNames)
      widths[value2] = style[borderSideWidthFields[value2]] ?? (sides2 === null || sides2.includes(" " + value2 + " ") ? value : 0);
    return widths;
  }
  function setBorderWidthsPreservingSides(style, width) {
    let widths = borderWidthsBySide(style), hasBorder = borderSideNames.some((input) => widths[input] > 0);
    return borderPatchFromWidths({
      top: !hasBorder || widths.top > 0 ? width : 0,
      right: !hasBorder || widths.right > 0 ? width : 0,
      bottom: !hasBorder || widths.bottom > 0 ? width : 0,
      left: !hasBorder || widths.left > 0 ? width : 0
    });
  }
  function borderPatchFromWidths(widths) {
    let sides2 = borderSideNames.filter((input) => widths[input] > 0), patch = {
      ...emptyBorderSideWidthPatch,
      borderWidth: void 0,
      borderSides: void 0
    };
    if (sides2.length === 0)
      return {
        ...patch,
        borderWidth: 0
      };
    let uniformWidth = widths[sides2[0]];
    if (sides2.every((input) => widths[input] === uniformWidth))
      return patch.borderWidth = uniformWidth, sides2.length < 4 && (patch.borderSides = sides2.join(" ")), patch;
    for (let value of sides2)
      patch[borderSideWidthFields[value]] = widths[value];
    return patch;
  }
  function hasPerCornerRadius(style) {
    return style !== void 0 && borderCornerNames.some((input) => style[borderCornerRadiusFields[input]] !== void 0);
  }
  function borderRadiiByCorner(style) {
    let value = style?.borderRadius ?? 0;
    return {
      tl: style?.borderTopLeftRadius ?? value,
      tr: style?.borderTopRightRadius ?? value,
      br: style?.borderBottomRightRadius ?? value,
      bl: style?.borderBottomLeftRadius ?? value
    };
  }
  function borderRadiusPatch(radii) {
    return borderCornerNames.every((input) => radii[input] === radii.tl) ? {
      ...emptyCornerRadiusPatch,
      borderRadius: radii.tl === 0 ? void 0 : radii.tl
    } : {
      borderRadius: void 0,
      borderTopLeftRadius: radii.tl,
      borderTopRightRadius: radii.tr,
      borderBottomRightRadius: radii.br,
      borderBottomLeftRadius: radii.bl
    };
  }
  function looksLikeMediaFilename(label) {
    return /\.(png|jpe?g|jfif|pjpe?g|pjp|gif|webp|avif|apng|svg|heic|heif|bmp|ico|tiff?|jxl)$/i.test(label.trim());
  }
  function imageHasPoster(node) {
    return node.asset !== void 0 || node.src !== void 0;
  }
  function imageHasMedia(node) {
    return imageHasPoster(node) || node.video !== void 0 || node.videoLink !== void 0;
  }
  function replaceImageAsset(node, assetId, label) {
    return { ...clearImageMedia(node), asset: assetId, alt: node.alt === "" || looksLikeMediaFilename(node.alt) ? label : node.alt };
  }
  function setImageFit(node, fit) {
    if (node.fit === fit)
      return node;
    let state = {
      ...node,
      fit
    };
    return delete state.crop, state;
  }
  function resetImageDimensions(node, resetWidth, resetHeight, assets) {
    if (node.kind !== "img" || !resetWidth && !resetHeight)
      return node;
    let value = node.asset !== void 0 ? assets.get(node.asset) : node.src;
    if (value === void 0 || value.startsWith("data:image/svg+xml") || !(resetWidth && node.w !== void 0) && !(resetHeight && node.h !== void 0) && node.crop === void 0)
      return node;
    let state = {
      ...node
    };
    return resetWidth && delete state.w, resetHeight && delete state.h, delete state.crop, state;
  }
  function clearImageMedia(node) {
    let result = {
      ...node
    };
    return delete result.asset, delete result.src, delete result.crop, delete result.video, delete result.videoStart, delete result.videoDelay, delete result.videoLink, delete result.videoSound, delete result.videoLoop, delete result.videoStill, looksLikeMediaFilename(result.alt) && (result.alt = ""), result;
  }
  function nodeDisplayLabel(node, maxLength = 60) {
    switch (node.kind) {
      case "text": {
        let value = node.text.trim().replace(/\s+/g, " ");
        return value === "" ? "Empty text" : (0, runtime2.truncateUtf16Safely)(value, maxLength);
      }
      case "img": {
        let value = node.alt.trim().replace(/\s+/g, " ");
        return value === "" ? "Image" : (0, runtime2.truncateUtf16Safely)("Image — " + value, maxLength);
      }
      case "icon":
        return (0, runtime2.truncateUtf16Safely)("Icon — " + node.icon, maxLength);
      case "shape":
        return runtime2.shapeVariantLabels[node.shape];
      case "html":
        return "Web embed";
      case "table":
        return "Table " + String(node.rows.length) + "×" + String(node.cols);
      case "spacer":
        return "Spacer";
      case "stack": {
        let value = nodeTextLabel(node);
        return value === void 0 ? "Group" : (0, runtime2.truncateUtf16Safely)("Group — " + value, maxLength);
      }
      case "grid": {
        let value = nodeTextLabel(node);
        return value === void 0 ? "Grid" : (0, runtime2.truncateUtf16Safely)("Grid — " + value, maxLength);
      }
      case "overlay": {
        let value = nodeTextLabel(node);
        return value === void 0 ? "Overlay" : (0, runtime2.truncateUtf16Safely)("Overlay — " + value, maxLength);
      }
    }
  }
  function nodeTextAt(node, roles, at) {
    if (node.kind === "text") {
      if (roles !== void 0 && !roles.includes(node.role))
        return;
      let value2 = node.text.trim().replace(/\s+/g, " ");
      return value2 === "" ? void 0 : {
        text: value2,
        at
      };
    }
    for (let [index4, child] of ((0, runtime2.nodeChildren)(node) ?? []).entries()) {
      let value3 = nodeTextAt(child, roles, at + "/" + String(index4));
      if (value3 !== void 0)
        return value3;
    }
  }
  function nodeTextLabel(node, roles) {
    return nodeTextAt(node, roles, "")?.text;
  }
  function slideTextAt(slide, roles) {
    for (let frame of slide.frames) {
      let value = nodeTextAt(frame.node, roles, frame.id);
      if (value !== void 0)
        return value;
    }
  }
  function slideTextAtPath(slide, at) {
    let [frameId, ...path] = at.split("/"), node = slide.frames.find((frame) => frame.id === frameId)?.node;
    for (let step of path)
      node = node === void 0 ? void 0 : (0, runtime2.nodeChildren)(node)?.[Number(step)];
    return node?.kind === "text" ? nodeTextLabel(node) : void 0;
  }
  function nodeFallbackLabel(node) {
    if (node.kind === "table") {
      for (let value2 of node.rows)
        for (let value3 of value2) {
          let value4 = value3.trim().replace(/\s+/g, " ");
          if (value4 !== "")
            return value4;
        }
      return;
    }
    if (node.kind === "img") {
      let value2 = node.alt.trim().replace(/\s+/g, " ");
      return value2 === "" ? void 0 : value2;
    }
    let value = (0, runtime2.nodeChildren)(node);
    if (value !== void 0)
      for (let value2 of value) {
        let value3 = nodeFallbackLabel(value2);
        if (value3 !== void 0)
          return value3;
      }
  }
  function slideDisplayLabel(slide) {
    let title = slideTitleText(slide);
    if (title !== void 0)
      return title;
    for (let value of slide.frames) {
      let value2 = nodeFallbackLabel(value.node);
      if (value2 !== void 0)
        return value2;
    }
  }
  function isTableNode(node) {
    return node?.kind === "table";
  }
  function clampInteger(value, minimum, maximum) {
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : minimum;
  }
  function countNodeTableCells(node) {
    if (node.kind === "table")
      return Math.max(1, node.rows.length) * node.cols;
    let value = (0, runtime2.nodeChildren)(node);
    if (value === void 0)
      return 0;
    let index4 = 0;
    for (let value2 of value)
      index4 += countNodeTableCells(value2);
    return index4;
  }
  function countSlideTableCells(slide) {
    let index4 = 0;
    for (let value of slide.frames)
      index4 += countNodeTableCells(value.node);
    return index4;
  }
  function countDeckTableCells(slides) {
    let index4 = 0;
    for (let value of slides)
      index4 += countSlideTableCells(value);
    return index4;
  }
  function countNodeEmbeds(node) {
    if (node.kind === "html")
      return 1;
    let value = (0, runtime2.nodeChildren)(node);
    if (value === void 0)
      return 0;
    let index4 = 0;
    for (let value2 of value)
      index4 += countNodeEmbeds(value2);
    return index4;
  }
  function countSlideEmbeds(slide) {
    let index4 = 0;
    for (let value of slide.frames)
      index4 += countNodeEmbeds(value.node);
    return index4;
  }
  function setTableCellText(table, row, column, text) {
    let sourceRow = table.rows[row];
    if (!sourceRow || column < 0 || column >= sourceRow.length)
      return table;
    let cells = [...sourceRow];
    cells[column] = text;
    let rows = [...table.rows];
    return rows[row] = cells, {
      ...table,
      rows
    };
  }
  function tableCellExists(table, row, column) {
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 || column >= table.cols)
      return !1;
    let value = table.rows[row];
    return value !== void 0 && column < value.length;
  }
  function resizeTable(table, rows, columns) {
    let columnCount = clampInteger(columns, 1, runtime2.maxTableColumns), rowCount = clampInteger(rows, 0, runtime2.maxTableRows), rows2 = [];
    for (let index4 = 0; index4 < rowCount; index4++) {
      let value = table.rows[index4] ?? [], items = [];
      for (let index22 = 0; index22 < columnCount; index22++)
        items.push(value[index22] ?? "");
      rows2.push(items);
    }
    let result = {
      ...table,
      rows: rows2,
      cols: columnCount
    };
    if (table.colWidths !== void 0)
      if (columnCount <= table.colWidths.length)
        result.colWidths = table.colWidths.slice(0, columnCount);
      else {
        let length = table.colWidths.length, value = table.colWidths.reduce((input, options) => input + options, 0), value2 = clampInteger(length > 0 ? value / length : 100 / columnCount, 1, 100);
        result.colWidths = table.colWidths.concat(Array.from({
          length: columnCount - length
        }, () => value2));
      }
    if (table.colAligns !== void 0 && (result.colAligns = columnCount <= table.colAligns.length ? table.colAligns.slice(0, columnCount) : table.colAligns.concat(Array.from({
      length: columnCount - table.colAligns.length
    }, () => "start"))), table.cellStyles !== void 0) {
      let value = Object.entries(table.cellStyles).filter(([input]) => {
        let value2 = /^(\d+)\.(\d+)$/.exec(input);
        return value2 !== null && Number(value2[1]) < rowCount && Number(value2[2]) < columnCount;
      });
      value.length > 0 ? result.cellStyles = Object.fromEntries(value) : delete result.cellStyles;
    }
    return remapTableRowStyles(table, result, (input) => input < rowCount ? input : null), result;
  }
  function remapTableCellStyles(table, target, remap) {
    if (table.cellStyles === void 0)
      return;
    let state = {}, index4 = 0;
    for (let [value, value2] of Object.entries(table.cellStyles)) {
      let value3 = /^(\d+)\.(\d+)$/.exec(value), value4 = value3 !== null ? remap(Number(value3[1]), Number(value3[2])) : null;
      value4 !== null && (state[String(value4[0]) + "." + String(value4[1])] = value2, index4 += 1);
    }
    index4 > 0 ? target.cellStyles = state : delete target.cellStyles;
  }
  function remapTableRowStyles(table, target, remap) {
    if (table.rowStyles === void 0)
      return;
    let state = {};
    for (let [value, value2] of Object.entries(table.rowStyles)) {
      let value3 = /^\d+$/.test(value) ? remap(Number(value)) : null;
      value3 !== null && (state[String(value3)] = value2);
    }
    Object.keys(state).length > 0 ? target.rowStyles = state : delete target.rowStyles;
  }
  function insertTableRow(table, rowIndex) {
    let rowCount = table.rows.length;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > rowCount || rowCount >= runtime2.maxTableRows)
      return table;
    let rows = [...table.rows];
    rows.splice(rowIndex, 0, Array.from({
      length: table.cols
    }, () => ""));
    let result = {
      ...table,
      rows
    };
    return remapTableCellStyles(table, result, (input, options) => [
      input >= rowIndex ? input + 1 : input,
      options
    ]), remapTableRowStyles(table, result, (input) => input >= rowIndex ? input + 1 : input), result;
  }
  function setTableColumnWidth(table, column, width) {
    if (!Number.isInteger(column) || column < 0 || column >= table.cols)
      return table;
    let widths = table.colWidths !== void 0 && table.colWidths.length === table.cols ? [...table.colWidths] : Array.from({
      length: table.cols
    }, () => clampInteger(100 / table.cols, 1, 100));
    return widths[column] = clampInteger(width, 1, 100), {
      ...table,
      colWidths: widths
    };
  }
  return bindRuntimeValue(runtime2, "nodeAtPath", () => nodeAtPath), bindRuntimeValue(runtime2, "updateNodeAtPath", () => updateNodeAtPath), bindRuntimeValue(runtime2, "frameById", () => frameById), bindRuntimeValue(runtime2, "updateSlideFrame", () => updateSlideFrame), bindRuntimeValue(runtime2, "removeSlideFrame", () => removeSlideFrame), bindRuntimeValue(runtime2, "appendSlideFrame", () => appendSlideFrame), bindRuntimeValue(runtime2, "frameStackContentOffset", () => frameStackContentOffset), bindRuntimeValue(runtime2, "reorderSlideFrames", () => reorderSlideFrames), bindRuntimeValue(runtime2, "removeOverlayLayer", () => removeOverlayLayer), bindRuntimeValue(runtime2, "removeNestedNode", () => removeNestedNode), bindRuntimeValue(runtime2, "removeSlideNode", () => removeSlideNode), bindRuntimeValue(runtime2, "wrapNodeInContainer", () => wrapNodeInContainer), bindRuntimeValue(runtime2, "isEditableTextNode", () => isEditableTextNode), bindRuntimeValue(runtime2, "nodeIsBold", () => nodeIsBold), bindRuntimeValue(runtime2, "toggleNodeBold", () => toggleNodeBold), bindRuntimeValue(runtime2, "nodeIsItalic", () => nodeIsItalic), bindRuntimeValue(runtime2, "toggleNodeItalic", () => toggleNodeItalic), bindRuntimeValue(runtime2, "setNodeList", () => setNodeList), bindRuntimeValue(runtime2, "nodeIsUnderlined", () => nodeIsUnderlined), bindRuntimeValue(runtime2, "toggleNodeUnderline", () => toggleNodeUnderline), bindRuntimeValue(runtime2, "patchNodeStyle", () => patchNodeStyle), bindRuntimeValue(runtime2, "setTextFill", () => setTextFill), bindRuntimeValue(runtime2, "setNodeRotation", () => setNodeRotation), bindRuntimeValue(runtime2, "updatePositionedNode", () => updatePositionedNode), bindRuntimeValue(runtime2, "pinNodeToRect", () => pinNodeToRect), bindRuntimeValue(runtime2, "updatePinnedNodeRect", () => updatePinnedNodeRect), bindRuntimeValue(runtime2, "smallerAxisSpec", () => smallerAxisSpec), bindRuntimeValue(runtime2, "smallerMediaAxis", () => smallerMediaAxis), bindRuntimeValue(runtime2, "hollowShapeOutline", () => hollowShapeOutline), bindRuntimeValue(runtime2, "fillShapeFromOutline", () => fillShapeFromOutline), bindRuntimeValue(runtime2, "minimumStrokeAdjustedSize", () => minimumStrokeAdjustedSize), bindRuntimeValue(runtime2, "minimumLineThickness", () => minimumLineThickness), bindRuntimeValue(runtime2, "nodeThicknessInfo", () => nodeThicknessInfo), bindRuntimeValue(runtime2, "nodeThickness", () => nodeThickness), bindRuntimeValue(runtime2, "nodeThicknessIsWritable", () => nodeThicknessIsWritable), bindRuntimeValue(runtime2, "setNodeThickness", () => setNodeThickness), bindRuntimeValue(runtime2, "setTableCellColor", () => setTableCellColor), bindRuntimeValue(runtime2, "setTableColumnAlignment", () => setTableColumnAlignment), bindRuntimeValue(runtime2, "nodeUniformLink", () => nodeUniformLink), bindRuntimeValue(runtime2, "setNodeLink", () => setNodeLink), bindRuntimeValue(runtime2, "hasPerSideBorderWidths", () => hasPerSideBorderWidths), bindRuntimeValue(runtime2, "borderWidthsBySide", () => borderWidthsBySide), bindRuntimeValue(runtime2, "setBorderWidthsPreservingSides", () => setBorderWidthsPreservingSides), bindRuntimeValue(runtime2, "borderPatchFromWidths", () => borderPatchFromWidths), bindRuntimeValue(runtime2, "hasPerCornerRadius", () => hasPerCornerRadius), bindRuntimeValue(runtime2, "borderRadiiByCorner", () => borderRadiiByCorner), bindRuntimeValue(runtime2, "borderRadiusPatch", () => borderRadiusPatch), bindRuntimeValue(runtime2, "looksLikeMediaFilename", () => looksLikeMediaFilename), bindRuntimeValue(runtime2, "imageHasPoster", () => imageHasPoster), bindRuntimeValue(runtime2, "imageHasMedia", () => imageHasMedia), bindRuntimeValue(runtime2, "replaceImageAsset", () => replaceImageAsset), bindRuntimeValue(runtime2, "setImageFit", () => setImageFit), bindRuntimeValue(runtime2, "resetImageDimensions", () => resetImageDimensions), bindRuntimeValue(runtime2, "clearImageMedia", () => clearImageMedia), bindRuntimeValue(runtime2, "nodeDisplayLabel", () => nodeDisplayLabel), bindRuntimeValue(runtime2, "nodeTextLabel", () => nodeTextLabel), bindRuntimeValue(runtime2, "nodeTextAt", () => nodeTextAt), bindRuntimeValue(runtime2, "slideTextAt", () => slideTextAt), bindRuntimeValue(runtime2, "slideTextAtPath", () => slideTextAtPath), bindRuntimeValue(runtime2, "slideTitleTextAt", () => slideTitleTextAt), bindRuntimeValue(runtime2, "slideTitleText", () => slideTitleText), bindRuntimeValue(runtime2, "applyTextListFields", () => applyTextListFields), bindRuntimeValue(runtime2, "imageNodeAtPath", () => imageNodeAtPath), bindRuntimeValue(runtime2, "videoStillMaxAgeDays", () => 30), bindRuntimeValue(runtime2, "nodeFallbackLabel", () => nodeFallbackLabel), bindRuntimeValue(runtime2, "slideDisplayLabel", () => slideDisplayLabel), bindRuntimeValue(runtime2, "isTableNode", () => isTableNode), bindRuntimeValue(runtime2, "clampInteger", () => clampInteger), bindRuntimeValue(runtime2, "countNodeTableCells", () => countNodeTableCells), bindRuntimeValue(runtime2, "countSlideTableCells", () => countSlideTableCells), bindRuntimeValue(runtime2, "countDeckTableCells", () => countDeckTableCells), bindRuntimeValue(runtime2, "countNodeEmbeds", () => countNodeEmbeds), bindRuntimeValue(runtime2, "countSlideEmbeds", () => countSlideEmbeds), bindRuntimeValue(runtime2, "setTableCellText", () => setTableCellText), bindRuntimeValue(runtime2, "tableCellExists", () => tableCellExists), bindRuntimeValue(runtime2, "resizeTable", () => resizeTable), bindRuntimeValue(runtime2, "remapTableCellStyles", () => remapTableCellStyles), bindRuntimeValue(runtime2, "remapTableRowStyles", () => remapTableRowStyles), bindRuntimeValue(runtime2, "insertTableRow", () => insertTableRow), bindRuntimeValue(runtime2, "setTableColumnWidth", () => setTableColumnWidth), bindRuntimeValue(runtime2, "borderSideNames", () => borderSideNames, (value) => {
    borderSideNames = value;
  }), bindRuntimeValue(runtime2, "borderSideWidthFields", () => borderSideWidthFields, (value) => {
    borderSideWidthFields = value;
  }), bindRuntimeValue(runtime2, "emptyBorderSideWidthPatch", () => emptyBorderSideWidthPatch, (value) => {
    emptyBorderSideWidthPatch = value;
  }), bindRuntimeValue(runtime2, "borderCornerRadiusFields", () => borderCornerRadiusFields, (value) => {
    borderCornerRadiusFields = value;
  }), bindRuntimeValue(runtime2, "borderCornerNames", () => borderCornerNames, (value) => {
    borderCornerNames = value;
  }), bindRuntimeValue(runtime2, "emptyCornerRadiusPatch", () => emptyCornerRadiusPatch, (value) => {
    emptyCornerRadiusPatch = value;
  }), bindRuntimeValue(runtime2, "headingTextRoles", () => headingTextRoles, (value) => {
    headingTextRoles = value;
  }), bindRuntimeValue(runtime2, "initializeModelEditing", () => initializeModelEditing, (value) => {
    initializeModelEditing = value;
  }), () => {
    initializeModelEditing = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeTypographyInference)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeHtmlWriter)(), (0, runtime2.initializeVideoLinks)(), borderSideNames = ["top", "right", "bottom", "left"], borderSideWidthFields = {
        top: "borderTopWidth",
        right: "borderRightWidth",
        bottom: "borderBottomWidth",
        left: "borderLeftWidth"
      }, emptyBorderSideWidthPatch = {
        borderTopWidth: void 0,
        borderRightWidth: void 0,
        borderBottomWidth: void 0,
        borderLeftWidth: void 0
      }, borderCornerRadiusFields = {
        tl: "borderTopLeftRadius",
        tr: "borderTopRightRadius",
        br: "borderBottomRightRadius",
        bl: "borderBottomLeftRadius"
      }, borderCornerNames = ["tl", "tr", "br", "bl"], emptyCornerRadiusPatch = {
        borderTopLeftRadius: void 0,
        borderTopRightRadius: void 0,
        borderBottomRightRadius: void 0,
        borderBottomLeftRadius: void 0
      }, headingTextRoles = ["display", "h1", "h2", "h3"];
    });
  };
}
export { installModelEditing };
