// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsHitTesting(runtime2) {
  var FULL_COMMENT_AREA_RECT, normalizeCommentPoint, parseCommentNodePath, getCommentElementRect, parseCommentCell, collectCommentableNodeElements, commentNodeUnitKey;
  function hitTestFrameCommentAnchor(slideId, surface, target, clientX, clientY) {
    let ancestor = target.closest("[data-frame-id]");
    if (!ancestor || !surface.contains(ancestor))
      return null;
    let ancestor2 = target.closest("[data-node-path]"), value = ancestor2 && ancestor.contains(ancestor2) ? ancestor2 : ancestor, bounds = value.getBoundingClientRect(), ancestor3 = target.closest("[data-cell]"), value2 = ancestor3 && value.contains(ancestor3) ? /^(\d+)\.(\d+)$/.exec(ancestor3.getAttribute("data-cell") ?? "") : null;
    return {
      anchor: {
        kind: "frame",
        slideId,
        frameId: ancestor.getAttribute("data-frame-id") ?? "",
        path: value === ancestor ? [] : parseCommentNodePath(value.getAttribute("data-node-path")),
        fx: normalizeCommentPoint(clientX, bounds.left, bounds.width),
        fy: normalizeCommentPoint(clientY, bounds.top, bounds.height)
      },
      el: value,
      ...value2 ? {
        cell: {
          r: Number(value2[1]),
          c: Number(value2[2])
        }
      } : {}
    };
  }
  function hitTestSlideCommentAnchor(slideId, surface, clientX, clientY) {
    let bounds = surface.getBoundingClientRect();
    return {
      anchor: {
        kind: "slide",
        slideId,
        fx: normalizeCommentPoint(clientX, bounds.left, bounds.width),
        fy: normalizeCommentPoint(clientY, bounds.top, bounds.height)
      },
      el: surface
    };
  }
  function resolveCommentAnchorElement(anchor, slide, container, surface) {
    if (anchor.kind === "slide" || anchor.kind === "area" && anchor.frameHash === null)
      return surface;
    let value = slide ? (0, runtime2.resolvePromotedCommentFrame)(anchor, slide) : null;
    if (value === null)
      return null;
    if (value.kind === "surface")
      return surface ?? container.querySelector("[data-slide-surface]");
    let element = container.querySelector('[data-frame-id="' + CSS.escape(value.frameId) + '"]');
    return element ? value.kind === "piece" ? element : anchor.path.length > 0 && element.querySelector('[data-node-path="' + anchor.path.join(".") + '"]') || element : null;
  }
  function commentAnchorPoint(element, anchor) {
    let bounds = element.getBoundingClientRect();
    return bounds.width === 0 && bounds.height === 0 ? null : anchor.kind === "area" ? (0, runtime2.commentBoxCornerPoint)((0, runtime2.normalizedCommentBoxToRect)({
      x: bounds.left,
      y: bounds.top,
      w: bounds.width,
      h: bounds.height
    }, anchor.box), anchor.box.corner) : {
      x: bounds.left + anchor.fx * bounds.width,
      y: bounds.top + anchor.fy * bounds.height
    };
  }
  function commentAnchorAreaRect(element, anchor, origin) {
    let value = getCommentElementRect(element, origin);
    if (value.width === 0 && value.height === 0)
      return null;
    let value2 = (0, runtime2.normalizedCommentBoxToRect)({
      x: value.left,
      y: value.top,
      w: value.width,
      h: value.height
    }, anchor.box);
    return {
      left: value2.x,
      top: value2.y,
      width: value2.w,
      height: value2.h
    };
  }
  function collectSlideCommentAreaTargets(slide, surface, container, measure) {
    let bounds = container.getBoundingClientRect(), value = (0, runtime2.slidePrimaryLayoutFrame)(slide)?.id, values = new Set(slide.frames.filter((input) => input.id === value || (0, runtime2.isEmptyBackgroundFrame)(input)).map((input) => input.id)), items = [];
    for (let value2 of surface.querySelectorAll("[data-frame-id] [data-node-path]")) {
      let ancestor = value2.closest("[data-frame-id]");
      if (!ancestor || value2.closest(measure))
        continue;
      let value3 = ancestor.getAttribute("data-frame-id") ?? "", value4 = parseCommentNodePath(value2.getAttribute("data-node-path"));
      if (value4.length === 0 && values.has(value3))
        continue;
      let value5 = value4.length === 0 ? ancestor : value2, bounds2 = value5.getBoundingClientRect();
      items.push({
        el: value5,
        ref: {
          frameId: value3,
          path: value4
        },
        rect: commentNodeUnitKey(bounds2, bounds),
        client: bounds2
      });
    }
    return {
      surface: bounds,
      els: items
    };
  }
  function createCommentAnchorDescription(hit, slideNumber, slide, typeStyles) {
    let { anchor, cell } = hit, value = (0, runtime2.encodeSlideCommentAnchor)(anchor);
    return value === null && anchor.kind === "frame" && (anchor = {
      ...anchor,
      path: []
    }, cell = void 0, value = (0, runtime2.encodeSlideCommentAnchor)(anchor)), value === null ? null : {
      anchor: value,
      ...(0, runtime2.describeFrameCommentAnchor)(slideNumber, slide, anchor.kind === "frame" ? {
        ...anchor,
        cell
      } : anchor, typeStyles)
    };
  }
  function describeSlideCommentArea(area, slide, elements, slideNumber, typeStyles, corner) {
    let [value] = (0, runtime2.rankCommentAreaHosts)(area, [
      {
        board: FULL_COMMENT_AREA_RECT,
        frame: FULL_COMMENT_AREA_RECT
      }
    ]);
    if (!value)
      return null;
    let value2 = (0, runtime2.describeCommentAreaCoverage)(area, elements.map((input) => ({
      el: input,
      rect: input.rect
    })), (input, options) => input.el.contains(options.el)), callback = (input) => ((0, runtime2.rankCommentAreaHosts)(input.rect, [
      {
        board: FULL_COMMENT_AREA_RECT,
        frame: FULL_COMMENT_AREA_RECT
      }
    ])[0]?.cov ?? 0) >= runtime2.COMMENT_AREA_COVERAGE_THRESHOLD, value3 = value2.enclosing && !callback(value2.enclosing) ? value2.enclosing : null, { covered } = value2, state = {
      kind: "area",
      slideId: typeStyles.id,
      frameId: null,
      path: [],
      box: {
        ...value.b,
        ...slide != null ? {
          corner: slide
        } : {}
      }
    }, value4 = null;
    for (let value7 of value3 ? [
      value3,
      elements.find((input) => input.ref.frameId === value3.ref.frameId && input.ref.path.length === 0)
    ] : []) {
      let value8 = value7 ? (0, runtime2.commentHostNormalizedBox)(value, value7.rect) : null, value9 = value7 && value8 ? {
        kind: "area",
        slideId: typeStyles.id,
        frameId: value7.ref.frameId,
        path: value7.ref.path,
        box: {
          ...value8,
          ...slide != null ? {
            corner: slide
          } : {}
        }
      } : null;
      if (value9 && (0, runtime2.encodeSlideCommentAnchor)(value9) !== null) {
        state = value9, value4 = value7;
        break;
      }
    }
    let value5 = (0, runtime2.encodeSlideCommentAnchor)(state);
    if (value5 === null)
      return null;
    let box = state.box, value6 = (0, runtime2.describeCommentBoxPart)(box, value4 ? (box.x1 - box.x0) * (box.y1 - box.y0) : value.cov), state2 = {
      within: value4?.ref ?? null,
      part: value6,
      covered: covered.filter((input) => input !== value4).map((input) => input.ref)
    };
    return {
      anchor: value5,
      label: (0, runtime2.describeAreaCommentAnchor)(slideNumber, typeStyles, state2, corner),
      detail: (0, runtime2.formatAreaCommentDetail)(slideNumber, typeStyles, state2),
      area: !0
    };
  }
  return bindRuntimeValue(runtime2, "FULL_COMMENT_AREA_RECT", () => FULL_COMMENT_AREA_RECT, (value) => {
    FULL_COMMENT_AREA_RECT = value;
  }), bindRuntimeValue(runtime2, "normalizeCommentPoint", () => normalizeCommentPoint, (value) => {
    normalizeCommentPoint = value;
  }), bindRuntimeValue(runtime2, "parseCommentNodePath", () => parseCommentNodePath, (value) => {
    parseCommentNodePath = value;
  }), bindRuntimeValue(runtime2, "getCommentElementRect", () => getCommentElementRect, (value) => {
    getCommentElementRect = value;
  }), bindRuntimeValue(runtime2, "parseCommentCell", () => parseCommentCell, (value) => {
    parseCommentCell = value;
  }), bindRuntimeValue(runtime2, "collectCommentableNodeElements", () => collectCommentableNodeElements, (value) => {
    collectCommentableNodeElements = value;
  }), bindRuntimeValue(runtime2, "commentNodeUnitKey", () => commentNodeUnitKey, (value) => {
    commentNodeUnitKey = value;
  }), bindRuntimeValue(runtime2, "hitTestFrameCommentAnchor", () => hitTestFrameCommentAnchor), bindRuntimeValue(runtime2, "hitTestSlideCommentAnchor", () => hitTestSlideCommentAnchor), bindRuntimeValue(runtime2, "resolveCommentAnchorElement", () => resolveCommentAnchorElement), bindRuntimeValue(runtime2, "commentAnchorPoint", () => commentAnchorPoint), bindRuntimeValue(runtime2, "commentAnchorAreaRect", () => commentAnchorAreaRect), bindRuntimeValue(runtime2, "collectSlideCommentAreaTargets", () => collectSlideCommentAreaTargets), bindRuntimeValue(runtime2, "createCommentAnchorDescription", () => createCommentAnchorDescription), bindRuntimeValue(runtime2, "describeSlideCommentArea", () => describeSlideCommentArea), () => {
    (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeSlideModel)(), FULL_COMMENT_AREA_RECT = {
      x: 0,
      y: 0,
      w: 1,
      h: 1
    }, normalizeCommentPoint = (coordinate, origin, size4) => Math.min(1, Math.max(0, size4 > 0 ? (coordinate - origin) / size4 : 0.5)), parseCommentNodePath = (path) => path === null || path === "" ? [] : path.split(".").map(Number), getCommentElementRect = (element, origin) => {
      let bounds = element.getBoundingClientRect();
      return {
        left: bounds.left - origin.left,
        top: bounds.top - origin.top,
        width: bounds.width,
        height: bounds.height
      };
    }, parseCommentCell = (element, options) => element === options || !!element && !!options && element.left === options.left && element.top === options.top && element.width === options.width && element.height === options.height, collectCommentableNodeElements = (root, options, context, value = 0) => {
      let value2 = Math.max(0, root.left), value3 = Math.max(Math.min(value, context), root.top), value4 = Math.min(options, root.left + root.width), value5 = Math.min(context, root.top + root.height);
      return value4 > value2 && value5 > value3 ? {
        left: value2,
        top: value3,
        width: value4 - value2,
        height: value5 - value3
      } : null;
    }, commentNodeUnitKey = (unit, options) => ({
      x: (unit.left - options.left) / (options.width || 1),
      y: (unit.top - options.top) / (options.height || 1),
      w: unit.width / (options.width || 1),
      h: unit.height / (options.height || 1)
    });
  };
}
export {
  installCommentsHitTesting
};
