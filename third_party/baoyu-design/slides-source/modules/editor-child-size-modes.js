// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorChildSizeModes(runtime2) {
  function placementAxisRole(parent, dimension) {
    return parent.kind === "grid" ? "cell" : parent.dir === "h" == (dimension === "w") ? "main" : "cross";
  }
  function dimensionToAxis(dimension) {
    return dimension === "w" ? "x" : "y";
  }
  function parentMainAxis(parent) {
    if (parent.kind === "stack")
      return parent.dir === "h" ? "x" : "y";
  }
  function childCrossAxisAlignment(node, parent, dimension) {
    let value = parent.kind === "grid" && dimension === "w" ? "justifySelf" : "alignSelf", value2 = parent.kind === "stack" ? parent.align : dimension === "h" ? parent.alignItems ?? "stretch" : parent.justifyItems ?? "stretch", value3 = value2 === "stretch" && !(0, runtime2.nodeSupportsSelfAlignment)(node, value) ? "start" : value2;
    return {
      key: value,
      inherited: value3
    };
  }
  function lockedPlacementDimension(node, dimension) {
    let place = node.place, value = dimension === "w" ? place?.minW : place?.minH, value2 = dimension === "w" ? place?.maxW : place?.maxH;
    if (value !== void 0 && value === value2)
      return value;
  }
  function intrinsicNodeDimension(node, dimension) {
    if ((0, runtime2.isMediaSizeNode)(node))
      return dimension === "w" ? node.w : node.h;
  }
  function fixedNodeDimension(node, dimension) {
    return lockedPlacementDimension(node, dimension) ?? intrinsicNodeDimension(node, dimension);
  }
  function placementGrows(place) {
    return (place?.grow ?? 0) > 0;
  }
  function childSizeModeOptions(node, parent, dimension) {
    if (!(0, runtime2.nodeSupportsSizing)(node))
      return [];
    let items = [
      {
        value: "hug",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "适应内容",
          id: "6F3j/ZyZwh"
        })
      },
      {
        value: "fixed",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "固定",
          id: "r5MItITaga"
        })
      },
      {
        value: "fill",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "填充",
          id: "f+ou5Or9XX"
        })
      }
    ];
    return (0, runtime2.nodeSupportsIntrinsicSizing)(node) ? items : placementAxisRole(parent, dimension) === "main" ? items.filter((input) => input.value !== "hug") : [items[1]];
  }
  function childSizeMode(node, parent, dimension) {
    let value = fixedNodeDimension(node, dimension);
    if (placementAxisRole(parent, dimension) === "main") {
      let value2 = lockedPlacementDimension(node, dimension);
      if (value2 !== void 0)
        return {
          mode: "fixed",
          value: value2
        };
      if (placementGrows(node.place))
        return {
          mode: "fill"
        };
      if (value !== void 0)
        return {
          mode: "fixed",
          value
        };
    } else {
      if (value !== void 0)
        return {
          mode: "fixed",
          value
        };
      let { key: value2, inherited: value3 } = childCrossAxisAlignment(node, parent, dimension);
      if ((node.place?.[value2] ?? value3) === "stretch" && (0, runtime2.nodeSupportsIntrinsicSizing)(node))
        return {
          mode: "fill"
        };
    }
    return {
      mode: (0, runtime2.nodeSupportsIntrinsicSizing)(node) ? "hug" : "fixed"
    };
  }
  function childAxisFills(node, parent, axis) {
    let value = (0, runtime2.setNodeAxisSize)(node, axis, void 0, parentMainAxis(parent));
    return (0, runtime2.nodeHasIntrinsicSize)(node, axis) || childSizeMode(value, parent, axis === "x" ? "w" : "h").mode === "fill";
  }
  function patchNodePlacement(node, patch) {
    let state = {
      ...node.place,
      ...patch
    };
    for (let value of Object.keys(state))
      state[value] === void 0 && delete state[value];
    let state2 = {
      ...node
    };
    return Object.keys(state).length === 0 ? delete state2.place : state2.place = state, state2;
  }
  function updateChildSizeMode(node, parent, dimension, mode, value) {
    if (!(0, runtime2.nodeSupportsSizing)(node))
      return node;
    let value2 = parentMainAxis(parent);
    if (mode === "fixed")
      return value === void 0 || !Number.isFinite(value) ? node : (0, runtime2.setNodeAxisIntrinsicSize)(node, dimensionToAxis(dimension), value, value2);
    let value3 = (0, runtime2.setNodeAxisIntrinsicSize)(node, dimensionToAxis(dimension), void 0, value2), place = value3.place;
    if (placementAxisRole(parent, dimension) === "main")
      return mode === "fill" ? placementGrows(place) ? value3 : patchNodePlacement(value3, {
        grow: 1
      }) : patchNodePlacement(value3, {
        grow: void 0,
        basis: void 0
      });
    let { key, inherited } = childCrossAxisAlignment(node, parent, dimension), value4 = place?.[key];
    return mode === "fill" ? inherited === "stretch" ? patchNodePlacement(value3, {
      [key]: void 0
    }) : value4 === "stretch" ? value3 : patchNodePlacement(value3, {
      [key]: "stretch"
    }) : inherited === "stretch" ? value4 !== void 0 && value4 !== "stretch" ? value3 : patchNodePlacement(value3, {
      [key]: "start"
    }) : value4 === "stretch" ? patchNodePlacement(value3, {
      [key]: void 0
    }) : value3;
  }
  function canResetChildSizeMode(node, parent, dimension) {
    return resetChildSizeMode(node, parent, dimension) !== node;
  }
  function resetChildSizeMode(node, parent, dimension) {
    let value = parentMainAxis(parent), value2 = fixedNodeDimension(node, dimension) !== void 0 ? (0, runtime2.setNodeAxisIntrinsicSize)(node, dimensionToAxis(dimension), void 0, value) : node, place = value2.place;
    if (placementAxisRole(parent, dimension) === "main")
      (place?.grow !== void 0 || place?.basis !== void 0) && (value2 = patchNodePlacement(value2, {
        grow: void 0,
        basis: void 0
      }));
    else {
      let { key: value3, inherited: value4 } = childCrossAxisAlignment(node, parent, dimension), value5 = place?.[value3];
      (value5 === "stretch" || value5 === "start" && value4 === "stretch") && (value2 = patchNodePlacement(value2, {
        [value3]: void 0
      }));
    }
    return value2;
  }
  function dimensionLimitKeys(dimension) {
    return dimension === "w" ? ["minW", "maxW"] : ["minH", "maxH"];
  }
  return bindRuntimeValue(runtime2, "placementAxisRole", () => placementAxisRole), bindRuntimeValue(runtime2, "dimensionToAxis", () => dimensionToAxis), bindRuntimeValue(runtime2, "parentMainAxis", () => parentMainAxis), bindRuntimeValue(runtime2, "childCrossAxisAlignment", () => childCrossAxisAlignment), bindRuntimeValue(runtime2, "lockedPlacementDimension", () => lockedPlacementDimension), bindRuntimeValue(runtime2, "intrinsicNodeDimension", () => intrinsicNodeDimension), bindRuntimeValue(runtime2, "fixedNodeDimension", () => fixedNodeDimension), bindRuntimeValue(runtime2, "placementGrows", () => placementGrows), bindRuntimeValue(runtime2, "childSizeModeOptions", () => childSizeModeOptions), bindRuntimeValue(runtime2, "childSizeMode", () => childSizeMode), bindRuntimeValue(runtime2, "childAxisFills", () => childAxisFills), bindRuntimeValue(runtime2, "patchNodePlacement", () => patchNodePlacement), bindRuntimeValue(runtime2, "updateChildSizeMode", () => updateChildSizeMode), bindRuntimeValue(runtime2, "canResetChildSizeMode", () => canResetChildSizeMode), bindRuntimeValue(runtime2, "resetChildSizeMode", () => resetChildSizeMode), bindRuntimeValue(runtime2, "dimensionLimitKeys", () => dimensionLimitKeys), () => {
    (0, runtime2.initializeFontVariants)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeModelGeometry)();
  };
}
export {
  installEditorChildSizeModes
};
