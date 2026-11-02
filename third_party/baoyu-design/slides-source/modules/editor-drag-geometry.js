// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorDragGeometry(runtime2) {
  var reactfl;
  function rectangleAttachmentPoints(rectangles) {
    let items = [];
    for (let value of rectangles)
      for (let value2 of [0, 0.5, 1])
        for (let value3 of [0, 0.5, 1])
          value2 === 0.5 && value3 === 0.5 || items.push({
            x: value.x + value.w * value2,
            y: value.y + value.h * value3,
            box: value
          });
    return items;
  }
  function nearestAttachmentPoint(points, x, y, maxDistance) {
    let value = null, value2 = maxDistance;
    for (let value3 of points) {
      let value4 = Math.hypot(value3.x - x, value3.y - y);
      value4 < value2 && (value = value3, value2 = value4);
    }
    return value;
  }
  function startCanvasDrag(event) {
    if (event.button !== 0)
      return !1;
    let target = event.target, value = target && typeof target.closest == "function" ? target.closest("button, a, input, select, textarea") : null;
    if (value !== null && !value.hasAttribute("data-drag-surface"))
      return !1;
    event.preventDefault();
    let activeElement2 = document.activeElement;
    return activeElement2 && activeElement2 !== document.body && activeElement2.blur?.(), !0;
  }
  function unionSelectionRectangles(rectangles) {
    if (rectangles.length === 0)
      return null;
    let [items, items2, items3, items4] = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
    for (let value of rectangles)
      [items, items2, items3, items4] = [
        Math.min(items, value.x),
        Math.min(items2, value.y),
        Math.max(items3, value.x + value.w),
        Math.max(items4, value.y + value.h)
      ];
    return {
      x: items,
      y: items2,
      w: items3 - items,
      h: items4 - items2
    };
  }
  function selectionResizeScaleLimits(selection, rectangles) {
    let [items, items2, items3, items4] = [0, 0, 1 / 0, 1 / 0];
    for (let value of rectangles)
      value.w > 0 && value.min?.w !== void 0 && value.w >= value.min.w && (items = Math.max(items, value.min.w / value.w)), value.h > 0 && value.min?.h !== void 0 && value.h >= value.min.h && (items2 = Math.max(items2, value.min.h / value.h)), value.w > 0 && value.max?.w !== void 0 && value.w <= value.max.w && (items3 = Math.min(items3, value.max.w / value.w)), value.h > 0 && value.max?.h !== void 0 && value.h <= value.max.h && (items4 = Math.min(items4, value.max.h / value.h));
    let callback = (input, options) => options === 1 / 0 ? 1 / 0 : input * options;
    return {
      min: {
        w: selection.w * items,
        h: selection.h * items2
      },
      max: {
        w: callback(selection.w, items3),
        h: callback(selection.h, items4)
      }
    };
  }
  return bindRuntimeValue(runtime2, "rectangleAttachmentPoints", () => rectangleAttachmentPoints), bindRuntimeValue(runtime2, "nearestAttachmentPoint", () => nearestAttachmentPoint), bindRuntimeValue(runtime2, "reactfl", () => reactfl, (value) => {
    reactfl = value;
  }), bindRuntimeValue(runtime2, "startCanvasDrag", () => startCanvasDrag), bindRuntimeValue(runtime2, "unionSelectionRectangles", () => unionSelectionRectangles), bindRuntimeValue(runtime2, "selectionResizeScaleLimits", () => selectionResizeScaleLimits), () => {
    reactfl = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installEditorDragGeometry
};
