// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installLayoutSelectionGroups(runtime2) {
  function measureOverlayGroupLayout(frame) {
    if (!(0, runtime2.isEmptyGroupBase)(frame.node) || frame.x.size === void 0 || frame.y.size === void 0)
      return;
    let layerSizes = frame.node.layers.map((input) => ({
      w: input.x.size ?? 0,
      h: input.y.size ?? 0,
      min: {
        w: 24,
        h: 24
      }
    }));
    return (0, runtime2.selectionResizeScaleLimits)({
      x: 0,
      y: 0,
      w: frame.x.size,
      h: frame.y.size
    }, layerSizes).min;
  }
  function rewriteNestedOverlayPlacements(node, visit, options) {
    let callback = (source) => {
      if ((0, runtime2.isOverlayNode)(source)) {
        let value3 = callback(source.base), value4 = source.layers.map((input) => ({
          l: input,
          node: callback(input.node)
        }));
        return value3 === source.base && value4.every((input) => input.node === input.l.node) ? source : {
          ...source,
          base: value3,
          layers: value4.map((input) => input.node === input.l.node ? input.l : {
            ...input.l,
            node: input.node
          })
        };
      }
      if (!(0, runtime2.isFlowContainer)(source))
        return source;
      let value2 = source.children.flatMap((input) => {
        let value3 = callback(input);
        if (!(0, runtime2.canFlattenNestedStackGroup)(value3, source))
          return [value3];
        if (value3.children.length <= 1)
          return value3.children;
        let value4 = source.kind === "stack" && value3.place?.grow !== void 0 ? (0, runtime2.groupedChildrenPlacement)(source, value3.children) : value3.place;
        return [
          (0, runtime2.structurallyEqualGroupValues)(value4, value3.place) ? value3 : {
            ...value3,
            ...value4 !== void 0 ? {
              place: value4
            } : {}
          }
        ];
      });
      return value2.length === source.children.length && value2.every((input, options2) => input === source.children[options2]) ? source : {
        ...source,
        children: value2
      };
    }, value = node.frames.flatMap((input) => {
      if (!visit.has(input.id))
        return [input];
      let value2 = callback(input.node), value3 = value2 === input.node ? input : {
        ...input,
        node: value2
      };
      if (!(0, runtime2.isEmptyGroupBase)(value2))
        return [value3];
      let value4 = !(0, runtime2.overlayHasVisiblePaint)(value2);
      if (value4 && value2.layers.length === 0)
        return [];
      if (value4 && value2.layers.length === 1)
        return [
          (0, runtime2.resizeGroupedFrame)(value3, value2.layers[0], options.rect((0, runtime2.createNodeSelection)(input.id, [1]))) ?? value3
        ];
      if (value2.layers.length === 0 || !(0, runtime2.hasLeadingOverlayAnchors)(value3, value2))
        return [value3];
      let value5 = (0, runtime2.regroupOverlayLayers)(value3, value2, value2.layers.map((input2) => ({
        x: input.x.margin + input2.x.margin,
        y: input.y.margin + input2.y.margin
      })), value2.layers.map((input2, options2) => options.rect((0, runtime2.createNodeSelection)(input.id, [options2 + 1]))));
      return [
        value5 !== void 0 && !(0, runtime2.structurallyEqualGroupValues)(value5, value3) ? value5 : value3
      ];
    });
    return value.length === node.frames.length && value.every((input, options2) => input === node.frames[options2]) ? node : {
      ...node,
      frames: value
    };
  }
  function groupSelectedFramesAsOverlay(slide, selectedFrameIds, measure) {
    let value = slide.frames.filter((input) => selectedFrameIds.has(input.id)), items = [];
    for (let value3 of value) {
      if (value3.node.kind === "html")
        return {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.embed
        };
      if ((0, runtime2.isOverlayNode)(value3.node) && !(0, runtime2.isEmptyGroupBase)(value3.node))
        return {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.labels
        };
      if ((0, runtime2.isEmptyGroupBase)(value3.node) && (0, runtime2.overlayHasVisiblePaint)(value3.node))
        return {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.painted
        };
      let value4 = (0, runtime2.isEmptyGroupBase)(value3.node) ? value3.node.layers.map((input, options) => ({
        ...input,
        rect: measure.rect((0, runtime2.createNodeSelection)(value3.id, [options + 1]))
      })) : [
        {
          node: value3.node,
          x: value3.x,
          y: value3.y,
          rect: measure.rect({
            frameId: value3.id
          })
        }
      ];
      for (let value5 of value4) {
        if (hasNodeTransform(value5.node))
          return {
            refused: runtime2.GROUP_REFUSAL_MESSAGES.styled
          };
        if (value5.rect === void 0)
          return {
            refused: runtime2.GROUP_REFUSAL_MESSAGES.stuck
          };
        items.push({
          ...value5,
          rect: value5.rect
        });
      }
    }
    if (items.length > runtime2.maxTextLineSpacing)
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.many
      };
    let value2 = (0, runtime2.groupFrameSelection)(items);
    if (!(0, runtime2.nodeTreeWithinDepthLimit)(value2.node, 0))
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.deep
      };
    let build = value[0].build;
    build !== void 0 && value.every((input) => (0, runtime2.structurallyEqualGroupValues)(input.build, build)) && (value2.build = build);
    let id = value[value.length - 1].id;
    return {
      slide: {
        ...slide,
        frames: slide.frames.flatMap((input) => input.id === id ? [value2] : selectedFrameIds.has(input.id) ? [] : [input])
      },
      selection: [
        {
          frameId: value2.id
        }
      ]
    };
  }
  function hasNodeTransform(node) {
    let transform = (0, runtime2.nodeTransform)(node);
    return transform !== void 0 && ((transform.scale ?? 1) !== 1 || !!transform.skewX || !!transform.skewY || !!transform.translateX || !!transform.translateY);
  }
  function normalizeNegativeFrameMargins(frame, rect) {
    let options = (input, options2, context) => input.margin < 0 ? (0, runtime2.axisSpecFromRect)(runtime2.GROUP_ZERO_ANCHOR, input.margin, input.size ?? (0, runtime2.ceilMeasuredNodeSize)(options2), context) : input;
    return {
      ...frame,
      x: options(frame.x, rect.w, runtime2.SLIDE_WIDTH),
      y: options(frame.y, rect.h, runtime2.SLIDE_HEIGHT)
    };
  }
  function measureFlowGroupChildRects(slide, frame, measure) {
    if (!(0, runtime2.isFlowContainer)(frame.node) || frame.node.children.some((source) => source.kind !== "spacer" && hasNodeTransform(source)))
      return;
    let value = frame.node.children.map((source, options) => source.kind === "spacer" ? {
      x: 0,
      y: 0,
      w: 0,
      h: 0
    } : measure.rect((0, runtime2.createNodeSelection)(frame.id, [options])));
    if (value.some((input) => input === void 0))
      return;
    let value2 = (0, runtime2.extractFlowDragSelection)(slide, {
      frameId: frame.id,
      children: value.map((input) => ({
        rect: input
      })),
      selectedChildren: [],
      deep: []
    });
    if (value2 === null)
      return;
    let value3 = value2.newFrames.map((input, options) => input === null ? null : {
      ...normalizeNegativeFrameMargins(input, value[options]),
      ...frame.build !== void 0 ? {
        build: frame.build
      } : {}
    });
    return {
      slide: {
        ...slide,
        frames: slide.frames.flatMap((input) => input.id === frame.id ? value3.filter((input2) => input2 !== null) : [input])
      },
      minted: value3
    };
  }
  function groupSelectedUnits(slide, selection, measure) {
    let value = (0, runtime2.normalizedGroupSelection)(slide, selection);
    if (value.length < 2)
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.few
      };
    let value2 = (0, runtime2.slidePrimaryLayoutFrame)(slide);
    for (let value7 of value) {
      let value8 = (0, runtime2.selectionNodePath)(value7).length > 0 ? (0, runtime2.nodeAtPath)((0, runtime2.frameById)(slide, value7.frameId).node, (0, runtime2.selectionNodePath)(value7).slice(0, -1)) : void 0;
      if (value8 !== void 0 && (0, runtime2.isOverlayNode)(value8))
        return {
          refused: (0, runtime2.isEmptyGroupBase)(value8) ? runtime2.GROUP_REFUSAL_MESSAGES.inside : runtime2.GROUP_REFUSAL_MESSAGES.labels
        };
    }
    let value3 = value[0], value4 = (0, runtime2.selectionNodePath)(value3).slice(0, -1);
    if ((0, runtime2.selectionNodePath)(value3).length > 0 && value.every((input) => input.frameId === value3.frameId && (0, runtime2.selectionNodePath)(input).length === value4.length + 1 && (0, runtime2.nodePathsEqual)((0, runtime2.selectionNodePath)(input).slice(0, -1), value4))) {
      let value7 = (0, runtime2.frameById)(slide, value3.frameId), value8 = (0, runtime2.nodeAtPath)(value7.node, value4), value9 = value7.id === value2?.id && value4.length === 0, value10 = value.map((input) => (0, runtime2.selectionNodePath)(input)[value4.length]), value11 = (0, runtime2.isFlowContainer)(value8) ? value8.children.filter((source) => source.kind !== "spacer").length : 0, value12 = value4.length === 0 && [value7.x, value7.y].every((input) => input.anchor === "fill" && input.margin === 0) && !(0, runtime2.styleHasVisiblePaint)(value7.node.style);
      if (!value9 && value12 && (0, runtime2.isFlowContainer)(value8) && value10.length === value11)
        return {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.stuck
        };
      if (!value9 && (0, runtime2.isFlowContainer)(value8) && value10.length === value11) {
        let value14 = value4.slice(0, -1), value15 = value4.length > 0 && value4[value4.length - 1] === 0 ? (0, runtime2.nodeAtPath)(value7.node, value14) : void 0, value16 = value15 !== void 0 && (0, runtime2.isOverlayNode)(value15) ? value14 : value4, value17 = (0, runtime2.nodeAtPath)(value7.node, value16);
        return value17 !== void 0 && "group" in value17 && value17.group === !0 ? {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.already
        } : {
          slide: {
            ...slide,
            frames: slide.frames.map((input) => input.id === value7.id ? {
              ...input,
              node: (0, runtime2.updateNodeAtPath)(input.node, value16, (input2) => ({
                ...input2,
                group: !0
              }))
            } : input)
          },
          selection: [(0, runtime2.createNodeSelection)(value7.id, value16)]
        };
      }
      let value13 = value10.every((input, options) => options === 0 || input === value10[options - 1] + 1) && value8.kind === "stack" && (0, runtime2.stackMainAxisSizeIsKnown)(value7, value4, measure) && !measure.shrunk((0, runtime2.createNodeSelection)(value7.id, value4));
      if (value8.kind === "stack" && (0, runtime2.canGroupStackChildren)(value8, value10[0], value10.length, value13)) {
        let value14 = value8.children.slice(value10[0], value10[0] + value10.length), value15 = (0, runtime2.groupedChildrenPlacement)(value8, value14), state = {
          kind: "stack",
          dir: value8.dir,
          align: value8.align,
          gap: value8.gap,
          group: !0,
          children: value14,
          ...value15 !== void 0 ? {
            place: value15
          } : {}
        }, value16 = (0, runtime2.updateNodeAtPath)(value7.node, value4, (source) => source.kind === "stack" ? {
          ...source,
          children: [
            ...source.children.slice(0, value10[0]),
            state,
            ...source.children.slice(value10[0] + value10.length)
          ]
        } : source);
        return (0, runtime2.nodeTreeWithinDepthLimit)(value16, 0) ? {
          slide: {
            ...slide,
            frames: slide.frames.map((input) => input.id === value7.id ? {
              ...input,
              node: value16
            } : input)
          },
          selection: [
            (0, runtime2.createNodeSelection)(value7.id, [
              ...value4,
              value10[0]
            ])
          ]
        } : {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.deep
        };
      }
      if (!value9)
        return {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.where
        };
    }
    let value5 = value.filter((input) => input.frameId === value2?.id);
    if (value5.some((input) => (0, runtime2.selectionNodePath)(input).length !== 1) || value.some((input) => input.frameId !== value2?.id && (0, runtime2.selectionNodePath)(input).length > 0))
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.apart
      };
    if (value5.length === 0 || value2 === void 0)
      return groupSelectedFramesAsOverlay(slide, new Set(value.map((input) => input.frameId)), measure);
    if (!runtime2.GROUP_MIXED_FRAME_STACK_CHILDREN_ENABLED || (0, runtime2.styleHasVisiblePaint)(value2.node.style) || (0, runtime2.nodeTransform)(value2.node) !== void 0 || !(0, runtime2.stackChildrenFitMeasuredBounds)(value2, [], measure) || measure.shrunk({
      frameId: value2.id
    }))
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.stuck
      };
    let value6 = measureFlowGroupChildRects(slide, value2, measure);
    if (value6 === void 0)
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.stuck
      };
    if (value6.slide.frames.length > runtime2.maxSlideFrames)
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.full
      };
    let entries = /* @__PURE__ */ new Map();
    for (let value7 of value) {
      let value8 = value7.frameId === value2.id ? value6.minted[(0, runtime2.selectionNodePath)(value7)[0]] : void 0;
      if (value7.frameId === value2.id && value8 == null)
        return {
          refused: runtime2.GROUP_REFUSAL_MESSAGES.stuck
        };
      entries.set(value8?.id ?? value7.frameId, value8 ? measure.rect(value7) : void 0);
    }
    return groupSelectedFramesAsOverlay(value6.slide, new Set(entries.keys()), {
      ...measure,
      rect: (input) => (0, runtime2.selectionNodePath)(input).length === 0 && entries.get(input.frameId) !== void 0 ? entries.get(input.frameId) : measure.rect(input)
    });
  }
  function inspectUngroupTarget(slide, unit, measure, singleSelection) {
    let frame = (0, runtime2.frameById)(slide, unit.frameId), path = (0, runtime2.selectionNodePath)(unit), node = (0, runtime2.nodeAtPath)(frame.node, path);
    if ((0, runtime2.isEmptyGroupBase)(node) && path.length === 0)
      return {
        kind: "free"
      };
    if ((0, runtime2.isOverlayNode)(node) && node.group !== !0)
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.labelsStay
      };
    if (!(0, runtime2.isFlowContainer)(node) && !(0, runtime2.isOverlayNode)(node))
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.nothing
      };
    let value = (0, runtime2.styleHasVisiblePaint)(node.style);
    if (path.length === 0)
      return (0, runtime2.isFlowContainer)(node) && !value && (0, runtime2.nodeTransform)(node) === void 0 && !measure.shrunk(unit) && !node.children.some((source) => source.kind !== "spacer" && hasNodeTransform(source)) && frame.id !== (0, runtime2.slidePrimaryLayoutFrame)(slide)?.id && (node.group === !0 || runtime2.UNGROUP_UNMARKED_STACK_ENABLED && singleSelection) ? {
        kind: "dissolve"
      } : node.group === !0 ? {
        kind: "unmark"
      } : {
        refused: value ? runtime2.GROUP_REFUSAL_MESSAGES.card : runtime2.GROUP_REFUSAL_MESSAGES.nothing
      };
    if (node.group !== !0)
      return {
        refused: value ? runtime2.GROUP_REFUSAL_MESSAGES.card : runtime2.GROUP_REFUSAL_MESSAGES.nothing
      };
    let value2 = path.slice(0, -1), value3 = (0, runtime2.nodeAtPath)(frame.node, value2);
    if (!(0, runtime2.canFlattenNestedStackGroup)(node, value3) || value3.kind !== "stack")
      return {
        kind: "unmark"
      };
    let value4 = path[path.length - 1], state = {
      ...value3,
      children: [
        ...value3.children.slice(0, value4),
        ...node.children,
        ...value3.children.slice(value4 + 1)
      ]
    }, value5 = (0, runtime2.structurallyEqualGroupValues)(node.place, (0, runtime2.groupedChildrenPlacement)(value3, node.children)) && value3.children.length - 1 + node.children.length <= runtime2.maxSlideFrames && (0, runtime2.stackMainAxisSizeIsKnown)(frame, value2, measure) && !measure.shrunk((0, runtime2.createNodeSelection)(frame.id, value2));
    return {
      kind: (0, runtime2.canGroupStackChildren)(state, value4, node.children.length, value5) ? "unwrap" : "unmark"
    };
  }
  function removeGroupMarker(node) {
    let { group, ...ungroupedNode } = node;
    return ungroupedNode;
  }
  function ungroupSelectedUnits(slide, selection, measure) {
    let selectedUnits = (0, runtime2.normalizedGroupSelection)(slide, selection);
    if (selectedUnits.length === 0)
      return {
        refused: runtime2.GROUP_REFUSAL_MESSAGES.nothing
      };
    let reversedUnits = [...selectedUnits].reverse(), results = reversedUnits.map((input) => inspectUngroupTarget(slide, input, measure, selectedUnits.length === 1)), refusal = results.find((input) => "refused" in input);
    if (refusal !== void 0)
      return refusal;
    let value = results.filter((input) => "kind" in input), value2 = slide, items = [];
    for (let [value3, value4] of reversedUnits.entries()) {
      let kind = value[value3].kind, value5 = (0, runtime2.frameById)(value2, value4.frameId), value6 = (0, runtime2.selectionNodePath)(value4);
      if (kind === "free") {
        let node = value5.node, value7 = node.layers.flatMap((input, options) => (0, runtime2.resizeGroupedFrame)(value5, input, measure.rect((0, runtime2.createNodeSelection)(value5.id, [options + 1]))) ?? []);
        if (value7.length < node.layers.length)
          return {
            refused: runtime2.GROUP_REFUSAL_MESSAGES.later
          };
        value2 = {
          ...value2,
          frames: value2.frames.flatMap((input) => input.id === value5.id ? value7 : [input])
        }, items = [
          ...value7.map((input) => ({
            frameId: input.id
          })),
          ...items
        ];
      } else if (kind === "dissolve") {
        let value7 = measureFlowGroupChildRects(value2, value5, measure);
        if (value7 === void 0)
          return {
            refused: runtime2.GROUP_REFUSAL_MESSAGES.later
          };
        value2 = value7.slide, items = [
          ...value7.minted.flatMap((input) => input !== null ? [
            {
              frameId: input.id
            }
          ] : []),
          ...items
        ];
      } else if (kind === "unmark")
        value2 = {
          ...value2,
          frames: value2.frames.map((input) => input.id === value5.id ? {
            ...input,
            node: (0, runtime2.updateNodeAtPath)(input.node, value6, removeGroupMarker)
          } : input)
        }, items = [value4, ...items];
      else {
        let value7 = value6.slice(0, -1), value8 = value6[value6.length - 1], length = (0, runtime2.nodeAtPath)(value5.node, value6).children.length;
        value2 = {
          ...value2,
          frames: value2.frames.map((input) => input.id === value5.id ? {
            ...input,
            node: (0, runtime2.updateNodeAtPath)(input.node, value7, (source) => source.kind === "stack" ? {
              ...source,
              children: [
                ...source.children.slice(0, value8),
                ...source.children[value8].children,
                ...source.children.slice(value8 + 1)
              ]
            } : source)
          } : input)
        }, items = items.map((input) => {
          let value9 = (0, runtime2.selectionNodePath)(input);
          return input.frameId === value5.id && value9.length > value7.length && (0, runtime2.nodePathsEqual)(value9.slice(0, value7.length), value7) && (0, runtime2.compareNodePaths)(value9, value6) > 0 ? (0, runtime2.createNodeSelection)(input.frameId, [
            ...value7,
            value9[value7.length] + length - 1,
            ...value9.slice(value7.length + 1)
          ]) : input;
        }), items = [
          ...Array.from({
            length
          }, (input, options) => (0, runtime2.createNodeSelection)(value5.id, [
            ...value7,
            value8 + options
          ])),
          ...items
        ];
      }
    }
    return value2.frames.length > runtime2.maxSlideFrames ? {
      refused: runtime2.GROUP_REFUSAL_MESSAGES.full
    } : {
      slide: value2,
      selection: items,
      ...value.every((source) => source.kind === "unmark") ? {
        note: runtime2.GROUP_REFUSAL_MESSAGES.unmarked
      } : {}
    };
  }
  return bindRuntimeValue(runtime2, "measureOverlayGroupLayout", () => measureOverlayGroupLayout), bindRuntimeValue(runtime2, "rewriteNestedOverlayPlacements", () => rewriteNestedOverlayPlacements), bindRuntimeValue(runtime2, "groupSelectedFramesAsOverlay", () => groupSelectedFramesAsOverlay), bindRuntimeValue(runtime2, "hasNodeTransform", () => hasNodeTransform), bindRuntimeValue(runtime2, "normalizeNegativeFrameMargins", () => normalizeNegativeFrameMargins), bindRuntimeValue(runtime2, "measureFlowGroupChildRects", () => measureFlowGroupChildRects), bindRuntimeValue(runtime2, "groupSelectedUnits", () => groupSelectedUnits), bindRuntimeValue(runtime2, "inspectUngroupTarget", () => inspectUngroupTarget), bindRuntimeValue(runtime2, "removeGroupMarker", () => removeGroupMarker), bindRuntimeValue(runtime2, "ungroupSelectedUnits", () => ungroupSelectedUnits), () => {
  };
}
export {
  installLayoutSelectionGroups
};
