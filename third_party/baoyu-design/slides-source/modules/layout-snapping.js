// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installLayoutSnapping(runtime2) {
  var SNAP_SLIDE_MARGIN, SNAP_SLIDE_MARGIN_LABEL, SNAP_GUIDE_PRIORITY, SNAP_DISTANCE_TIE_EPSILON;
  function buildSlideSnapCandidates(axis) {
    let extent = axis === "x" ? runtime2.SLIDE_WIDTH : runtime2.SLIDE_HEIGHT;
    return [
      {
        axis,
        pos: 0,
        kind: "slide-edge"
      },
      {
        axis,
        pos: extent,
        kind: "slide-edge"
      },
      {
        axis,
        pos: extent / 2,
        kind: "slide-center",
        label: (0, runtime2.formatMessage)({
          defaultMessage: "居中",
          id: "S88Zb/YJtT"
        })
      },
      {
        axis,
        pos: SNAP_SLIDE_MARGIN,
        kind: "margin",
        label: SNAP_SLIDE_MARGIN_LABEL
      },
      {
        axis,
        pos: extent - SNAP_SLIDE_MARGIN,
        kind: "margin",
        label: SNAP_SLIDE_MARGIN_LABEL
      }
    ];
  }
  function buildSiblingSnapCandidates(siblings) {
    let candidates = [
      ...buildSlideSnapCandidates("x"),
      ...buildSlideSnapCandidates("y")
    ];
    for (let value of siblings)
      candidates.push({
        axis: "x",
        pos: value.x,
        kind: "sibling-edge"
      }, {
        axis: "x",
        pos: value.x + value.w / 2,
        kind: "sibling-center"
      }, {
        axis: "x",
        pos: value.x + value.w,
        kind: "sibling-edge"
      }, {
        axis: "y",
        pos: value.y,
        kind: "sibling-edge"
      }, {
        axis: "y",
        pos: value.y + value.h / 2,
        kind: "sibling-center"
      }, {
        axis: "y",
        pos: value.y + value.h,
        kind: "sibling-edge"
      });
    return candidates;
  }
  function snapLineMatchesGuide(line, guideKind) {
    let isCenterGuide = guideKind === "slide-center" || guideKind === "sibling-center";
    return line === "center" ? isCenterGuide : !isCenterGuide;
  }
  function findClosestSnap(candidates, axis, movingLines, threshold) {
    let matches = [];
    for (let value3 of candidates)
      if (value3.axis === axis)
        for (let value4 of movingLines) {
          if (!snapLineMatchesGuide(value4.line, value3.kind))
            continue;
          let value5 = value3.pos - value4.value, value6 = Math.abs(value5);
          value6 <= threshold && matches.push({
            adjust: value5,
            dist: value6,
            snap: {
              line: value4.line,
              candidate: value3
            }
          });
        }
    let value = Math.min(...matches.map((input) => input.dist)), value2;
    for (let value3 of matches)
      if (!(value3.dist - value > SNAP_DISTANCE_TIE_EPSILON))
        if (value2 === void 0)
          value2 = value3;
        else {
          let value4 = SNAP_GUIDE_PRIORITY[value2.snap.candidate.kind] - SNAP_GUIDE_PRIORITY[value3.snap.candidate.kind];
          (value4 > 0 || value4 === 0 && value3.dist < value2.dist) && (value2 = value3);
        }
    return value2;
  }
  function snapMovingRectangle(rect, dx, dy2, candidates, threshold, enabledAxes = {
    x: !0,
    y: !0
  }) {
    let result = {
      dx,
      dy: dy2,
      snaps: {},
      guides: []
    };
    if (enabledAxes.x) {
      let value = rect.x + dx, value2 = findClosestSnap(candidates, "x", [
        {
          line: "near",
          value
        },
        {
          line: "center",
          value: value + rect.w / 2
        },
        {
          line: "far",
          value: value + rect.w
        }
      ], threshold);
      value2 && (result.dx = dx + value2.adjust, result.snaps.x = value2.snap, result.guides.push(value2.snap.candidate));
    }
    if (enabledAxes.y) {
      let value = rect.y + dy2, value2 = findClosestSnap(candidates, "y", [
        {
          line: "near",
          value
        },
        {
          line: "center",
          value: value + rect.h / 2
        },
        {
          line: "far",
          value: value + rect.h
        }
      ], threshold);
      value2 && (result.dy = dy2 + value2.adjust, result.snaps.y = value2.snap, result.guides.push(value2.snap.candidate));
    }
    return result;
  }
  function snapResizingRectangle(rect, xHandle, yHandle, dx, dy2, candidates, threshold) {
    let result = {
      dx,
      dy: dy2,
      snaps: {},
      guides: []
    };
    if (xHandle) {
      let value = xHandle === "near" ? rect.x + dx : rect.x + rect.w + dx, value2 = findClosestSnap(candidates, "x", [
        {
          line: xHandle,
          value
        }
      ], threshold);
      value2 && (result.dx = dx + value2.adjust, result.guides.push(value2.snap.candidate));
    }
    if (yHandle) {
      let value = yHandle === "near" ? rect.y + dy2 : rect.y + rect.h + dy2, value2 = findClosestSnap(candidates, "y", [
        {
          line: yHandle,
          value
        }
      ], threshold);
      value2 && (result.dy = dy2 + value2.adjust, result.guides.push(value2.snap.candidate));
    }
    return result;
  }
  function preserveExplicitAxisSize(axis, previousAxis) {
    return previousAxis.size !== void 0 ? {
      ...axis,
      size: previousAxis.size
    } : axis;
  }
  function applyAxisSnapAnchor(axis, snap, extent) {
    if (!snap || axis.anchor === "fill")
      return axis;
    let { line, candidate } = snap;
    return candidate.kind === "sibling-edge" || candidate.kind === "sibling-center" ? axis : line === "center" && candidate.kind === "slide-center" ? preserveExplicitAxisSize({
      anchor: "center",
      margin: 0,
      offset: 0
    }, axis) : line === "near" && (candidate.kind === "slide-edge" || candidate.kind === "margin") ? candidate.pos >= extent ? axis : preserveExplicitAxisSize({
      anchor: "leading",
      margin: candidate.pos,
      offset: 0
    }, axis) : line === "far" && (candidate.kind === "slide-edge" || candidate.kind === "margin") ? candidate.pos <= 0 ? axis : preserveExplicitAxisSize({
      anchor: "trailing",
      margin: extent - candidate.pos,
      offset: 0
    }, axis) : axis;
  }
  function applyFrameSnapAnchors(frame, snaps) {
    let x = applyAxisSnapAnchor(frame.x, snaps.x, runtime2.SLIDE_WIDTH), y = applyAxisSnapAnchor(frame.y, snaps.y, runtime2.SLIDE_HEIGHT);
    return x === frame.x && y === frame.y ? frame : {
      ...frame,
      x,
      y
    };
  }
  function snapLineEndpoint(start, end, candidates, threshold, constrainAngle) {
    if (constrainAngle) {
      let value2 = end[0] - start[0], value3 = end[1] - start[1], value4 = Math.hypot(value2, value3), value5 = Math.round(Math.atan2(value3, value2) / (Math.PI / 4)) * (Math.PI / 4);
      return {
        point: [
          start[0] + value4 * Math.cos(value5),
          start[1] + value4 * Math.sin(value5)
        ],
        site: null
      };
    }
    let value = (0, runtime2.nearestAttachmentPoint)(candidates, end[0], end[1], threshold);
    return value ? {
      point: [value.x, value.y],
      site: value
    } : {
      point: [end[0], end[1]],
      site: null
    };
  }
  return bindRuntimeValue(runtime2, "SNAP_SLIDE_MARGIN", () => SNAP_SLIDE_MARGIN, (value) => {
    SNAP_SLIDE_MARGIN = value;
  }), bindRuntimeValue(runtime2, "SNAP_GUIDE_PRIORITY", () => SNAP_GUIDE_PRIORITY, (value) => {
    SNAP_GUIDE_PRIORITY = value;
  }), bindRuntimeValue(runtime2, "buildSlideSnapCandidates", () => buildSlideSnapCandidates), bindRuntimeValue(runtime2, "buildSiblingSnapCandidates", () => buildSiblingSnapCandidates), bindRuntimeValue(runtime2, "SNAP_DISTANCE_TIE_EPSILON", () => SNAP_DISTANCE_TIE_EPSILON, (value) => {
    SNAP_DISTANCE_TIE_EPSILON = value;
  }), bindRuntimeValue(runtime2, "snapLineMatchesGuide", () => snapLineMatchesGuide), bindRuntimeValue(runtime2, "findClosestSnap", () => findClosestSnap), bindRuntimeValue(runtime2, "snapMovingRectangle", () => snapMovingRectangle), bindRuntimeValue(runtime2, "snapResizingRectangle", () => snapResizingRectangle), bindRuntimeValue(runtime2, "preserveExplicitAxisSize", () => preserveExplicitAxisSize), bindRuntimeValue(runtime2, "applyAxisSnapAnchor", () => applyAxisSnapAnchor), bindRuntimeValue(runtime2, "applyFrameSnapAnchors", () => applyFrameSnapAnchors), bindRuntimeValue(runtime2, "snapLineEndpoint", () => snapLineEndpoint), () => {
    (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeObjectNavigation)(), (0, runtime2.initializeSlideModel)(), SNAP_SLIDE_MARGIN = 128, SNAP_SLIDE_MARGIN_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "边距 {px}",
      id: "j1t5HJg5Vs"
    }, {
      px: String(SNAP_SLIDE_MARGIN)
    }), SNAP_GUIDE_PRIORITY = {
      "slide-center": 0,
      "slide-edge": 1,
      margin: 2,
      "sibling-center": 3,
      "sibling-edge": 4
    }, SNAP_DISTANCE_TIE_EPSILON = 0.5;
  };
}
export {
  installLayoutSnapping
};
