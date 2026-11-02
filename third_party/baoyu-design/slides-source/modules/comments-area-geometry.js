// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsAreaGeometry(runtime2) {
  var COMMENT_AREA_COVERAGE_THRESHOLD, clampCommentFraction, intersectCommentRects;
  function rankCommentAreaHosts(area, hosts, limit = 1 / 0) {
    let areaSize = Math.max(1e-6, area.w * area.h), matches = [];
    if (hosts.forEach(({ board, frame }) => {
      let value = intersectCommentRects(area, frame);
      if (!value)
        return;
      let value2 = value.w * value.h, value3 = Math.max(1e-6, frame.w * frame.h);
      value2 < 0.04 * value3 && value2 < 0.25 * areaSize || matches.push({
        board,
        frame,
        inter: value,
        cov: value2 / value3,
        b: {
          x0: (value.x - frame.x) / frame.w,
          y0: (value.y - frame.y) / frame.h,
          x1: (value.x + value.w - frame.x) / frame.w,
          y1: (value.y + value.h - frame.y) / frame.h
        }
      });
    }), matches.length <= limit)
      return matches;
    let values = new Set([...matches].sort((input, options) => options.inter.w * options.inter.h - input.inter.w * input.inter.h).slice(0, limit));
    return matches.filter((input) => values.has(input));
  }
  function commentHostNormalizedBox(host, nodeRect) {
    if (!(nodeRect.w > 0 && nodeRect.h > 0))
      return null;
    let offsetX = host.inter.x - host.frame.x, offsetY2 = host.inter.y - host.frame.y, box = {
      x0: clampCommentFraction((offsetX - nodeRect.x) / nodeRect.w),
      y0: clampCommentFraction((offsetY2 - nodeRect.y) / nodeRect.h),
      x1: clampCommentFraction((offsetX + host.inter.w - nodeRect.x) / nodeRect.w),
      y1: clampCommentFraction((offsetY2 + host.inter.h - nodeRect.y) / nodeRect.h)
    };
    return box.x1 > box.x0 && box.y1 > box.y0 ? box : null;
  }
  function normalizedCommentBoxToRect(rect, box) {
    return {
      x: rect.x + box.x0 * rect.w,
      y: rect.y + box.y0 * rect.h,
      w: (box.x1 - box.x0) * rect.w,
      h: (box.y1 - box.y0) * rect.h
    };
  }
  function nearestCommentBoxCorner(rect, point) {
    let horizontal = point.x > rect.x + rect.w / 2 ? 1 : 0, vertical = point.y > rect.y + rect.h / 2 ? 2 : 0;
    return horizontal + vertical;
  }
  function commentBoxCornerPoint(rect, corner) {
    return corner == null ? {
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2
    } : {
      x: corner & 1 ? rect.x + rect.w : rect.x,
      y: corner & 2 ? rect.y + rect.h : rect.y
    };
  }
  function describeCommentBoxPart(box, coverage) {
    if (coverage >= 0.85)
      return "";
    if (box.x1 <= 0.15)
      return "left edge";
    if (box.x0 >= 0.85)
      return "right edge";
    if (box.y1 <= 0.15)
      return "top edge";
    if (box.y0 >= 0.85)
      return "bottom edge";
    let value = (box.y0 + box.y1) / 2, value2 = (box.x0 + box.x1) / 2, value3 = box.y1 <= 0.55 && value <= 0.35 ? "top" : box.y0 >= 0.45 && value >= 0.65 ? "bottom" : box.y1 - box.y0 <= 0.5 ? "middle" : "", value4 = box.x1 <= 0.55 && value2 <= 0.35 ? "left" : box.x0 >= 0.45 && value2 >= 0.65 ? "right" : box.x1 - box.x0 <= 0.5 ? "centre" : "", value5 = [value3, value4].filter(Boolean).join(" ");
    return value5 === "top" || value5 === "bottom" ? value5 + " half" : value5 === "left" || value5 === "right" ? value5 + " side" : value5 || "part";
  }
  function describeCommentAreaCoverage(area, elements, contains2) {
    let areaSize = Math.max(1e-6, area.w * area.h), covered = [], inside = [];
    for (let { el: value3, rect: value4 } of elements) {
      let value5 = value4.w * value4.h;
      if (!(value5 > 0))
        continue;
      let value6 = intersectCommentRects(area, value4), value7 = value6 ? value6.w * value6.h : 0;
      value7 >= 0.85 * areaSize && covered.push({
        el: value3,
        a: value5
      }), value7 >= 0.7 * value5 && inside.push(value3);
    }
    covered.sort((input, options) => input.a - options.a);
    let value = covered.find((input) => inside.every((input2) => input2 === input.el || contains2(input.el, input2) || contains2(input2, input.el)))?.el ?? null, value2 = inside.filter((input) => value === null || input !== value && contains2(value, input));
    return value2.length === 0 && value !== null && inside.includes(value) && (value2 = [value]), {
      enclosing: value,
      covered: value2.filter((input) => !value2.some((input2) => input2 !== input && contains2(input2, input)))
    };
  }
  function createCommentOperationToken() {
    let index4 = 0;
    return {
      begin() {
        index4 += 1;
        let value = index4;
        return {
          get live() {
            return index4 === value;
          }
        };
      },
      cancel() {
        index4 += 1;
      }
    };
  }
  return bindRuntimeValue(runtime2, "COMMENT_AREA_COVERAGE_THRESHOLD", () => COMMENT_AREA_COVERAGE_THRESHOLD, (value) => {
    COMMENT_AREA_COVERAGE_THRESHOLD = value;
  }), bindRuntimeValue(runtime2, "clampCommentFraction", () => clampCommentFraction, (value) => {
    clampCommentFraction = value;
  }), bindRuntimeValue(runtime2, "intersectCommentRects", () => intersectCommentRects, (value) => {
    intersectCommentRects = value;
  }), bindRuntimeValue(runtime2, "rankCommentAreaHosts", () => rankCommentAreaHosts), bindRuntimeValue(runtime2, "commentHostNormalizedBox", () => commentHostNormalizedBox), bindRuntimeValue(runtime2, "normalizedCommentBoxToRect", () => normalizedCommentBoxToRect), bindRuntimeValue(runtime2, "nearestCommentBoxCorner", () => nearestCommentBoxCorner), bindRuntimeValue(runtime2, "commentBoxCornerPoint", () => commentBoxCornerPoint), bindRuntimeValue(runtime2, "describeCommentBoxPart", () => describeCommentBoxPart), bindRuntimeValue(runtime2, "describeCommentAreaCoverage", () => describeCommentAreaCoverage), bindRuntimeValue(runtime2, "createCommentOperationToken", () => createCommentOperationToken), () => {
    COMMENT_AREA_COVERAGE_THRESHOLD = 0.85, clampCommentFraction = (input) => Math.min(1, Math.max(0, input)), intersectCommentRects = (input, options) => {
      let value = Math.max(input.x, options.x), value2 = Math.max(input.y, options.y), value3 = Math.min(input.x + input.w, options.x + options.w), value4 = Math.min(input.y + input.h, options.y + options.h);
      return value3 > value && value4 > value2 ? {
        x: value,
        y: value2,
        w: value3 - value,
        h: value4 - value2
      } : null;
    };
  };
}
export {
  installCommentsAreaGeometry
};
