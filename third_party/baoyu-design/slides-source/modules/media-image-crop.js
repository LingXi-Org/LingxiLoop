// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installMediaImageCrop(runtime2) {
  var defaultImageCrop, clampCropValue, roundCropValue, imageCropsEqual, coverImageScale, maxImageCropZoom, initializeImageCrop;
  function normalizeImageCrop(crop) {
    if (crop === null || typeof crop != "object")
      return;
    let rawCrop = crop, finiteField = (input) => typeof rawCrop[input] == "number" && Number.isFinite(rawCrop[input]) ? rawCrop[input] : null, [zoom, x, y] = [
      finiteField("zoom"),
      finiteField("x"),
      finiteField("y")
    ];
    if (zoom === null || x === null || y === null)
      return;
    let state = {
      zoom: roundCropValue(clampCropValue(zoom, 1, 50), 4),
      x: roundCropValue(clampCropValue(x, 0, 1), 5),
      y: roundCropValue(clampCropValue(y, 0, 1), 5)
    };
    if (!imageCropsEqual(state, defaultImageCrop))
      return state;
  }
  function imageCropRect(viewport, image, crop) {
    let scale = coverImageScale(viewport, image) * crop.zoom, [width, height2] = [image.w * scale, image.h * scale];
    return {
      x: (viewport.w - width) * crop.x + 0,
      y: (viewport.h - height2) * crop.y + 0,
      w: width,
      h: height2
    };
  }
  function cropFromImageRect(viewport, image, imageRect, previousCrop, maxZoom = maxImageCropZoom(previousCrop)) {
    let zoom = clampCropValue(imageRect.w / (image.w * coverImageScale(viewport, image)), 1, maxZoom), scale = coverImageScale(viewport, image) * zoom, [overflowWidth, overflowHeight] = [
      image.w * scale - viewport.w,
      image.h * scale - viewport.h
    ];
    return {
      zoom,
      x: overflowWidth > 1e-6 ? clampCropValue(-imageRect.x / overflowWidth, 0, 1) : previousCrop.x,
      y: overflowHeight > 1e-6 ? clampCropValue(-imageRect.y / overflowHeight, 0, 1) : previousCrop.y
    };
  }
  function panImageCrop(viewport, image, crop, deltaX, deltaY) {
    let imageRect = imageCropRect(viewport, image, crop);
    return cropFromImageRect(viewport, image, {
      ...imageRect,
      x: imageRect.x + deltaX,
      y: imageRect.y + deltaY
    }, crop);
  }
  function resizeImageCropFromCorner(viewport, image, crop, corner, deltaX, deltaY) {
    let value = imageCropRect(viewport, image, crop), [items, items2] = [
      corner === "ne" || corner === "se" ? 1 : -1,
      corner === "sw" || corner === "se" ? 1 : -1
    ], state = {
      x: items > 0 ? value.x : value.x + value.w,
      y: items2 > 0 ? value.y : value.y + value.h
    }, value2 = Math.hypot(value.w, value.h), value3 = ((items * value.w + deltaX) * items * value.w + (items2 * value.h + deltaY) * items2 * value.h) / value2, value4 = image.w * coverImageScale(viewport, image), value5 = items > 0 ? viewport.w - state.x : state.x, value6 = items2 > 0 ? viewport.h - state.y : state.y, value7 = Math.max(value4, value5, value6 * value.w / value.h), value8 = clampCropValue(value.w * value3 / value2, value7, Math.max(value7, value4 * maxImageCropZoom(crop))), value9 = value8 * value.h / value.w;
    return cropFromImageRect(viewport, image, {
      x: items > 0 ? state.x : state.x - value8,
      y: items2 > 0 ? state.y : state.y - value9,
      w: value8,
      h: value9
    }, crop);
  }
  function resizeCropViewport(viewport, image, crop, edge, deltaX, deltaY, minimumSize = 1) {
    let value = imageCropRect(viewport, image, crop), value2 = Math.max(50, crop.zoom), [items, items2] = [
      Math.min(viewport.w, Math.max(minimumSize, value.w / value2)),
      Math.min(viewport.h, Math.max(minimumSize, value.h / value2))
    ], [items3, items4, items5, items6] = [
      0,
      0,
      viewport.w,
      viewport.h
    ];
    edge.includes("w") && (items3 = clampCropValue(deltaX, value.x, items5 - items)), edge.includes("e") && (items5 = clampCropValue(viewport.w + deltaX, items3 + items, value.x + value.w)), edge.includes("n") && (items4 = clampCropValue(deltaY, value.y, items6 - items2)), edge.includes("s") && (items6 = clampCropValue(viewport.h + deltaY, items4 + items2, value.y + value.h));
    let state = {
      x: items3 + 0,
      y: items4 + 0,
      w: items5 - items3,
      h: items6 - items4
    };
    return {
      frame: state,
      crop: cropImageToRect(viewport, image, crop, state)
    };
  }
  function cropImageToRect(viewport, image, crop, rect) {
    let value = imageCropRect(viewport, image, crop);
    return cropFromImageRect(rect, image, {
      x: value.x - rect.x,
      y: value.y - rect.y,
      w: value.w,
      h: value.h
    }, crop, Math.max(50, crop.zoom));
  }
  function zoomImageCrop(viewport, image, crop, zoomFactor, anchor) {
    let value = imageCropRect(viewport, image, crop), value2 = image.w * coverImageScale(viewport, image), value3 = clampCropValue(value.w * zoomFactor, value2, value2 * maxImageCropZoom(crop)) / value.w, [items, items2] = [
      anchor?.x ?? viewport.w / 2,
      anchor?.y ?? viewport.h / 2
    ];
    return cropFromImageRect(viewport, image, {
      x: items + (value.x - items) * value3,
      y: items2 + (value.y - items2) * value3,
      w: value.w * value3,
      h: value.h * value3
    }, crop);
  }
  function centerUncroppedImageAxes(viewport, image, crop) {
    let imageRect = imageCropRect(viewport, image, crop);
    return normalizeImageCrop({
      zoom: crop.zoom,
      x: imageRect.w - viewport.w < 0.5 ? 0.5 : crop.x,
      y: imageRect.h - viewport.h < 0.5 ? 0.5 : crop.y
    });
  }
  function imageCropNormalizedViewport(viewport, image, crop) {
    let imageRect = imageCropRect(viewport, image, crop);
    return {
      x: -imageRect.x / imageRect.w,
      y: -imageRect.y / imageRect.h,
      w: viewport.w / imageRect.w,
      h: viewport.h / imageRect.h
    };
  }
  function imageCropCss(crop) {
    let percent = (input) => String(roundCropValue(input * 100, 4)) + "%";
    return {
      position: "absolute",
      width: percent(crop.zoom),
      height: percent(crop.zoom),
      left: percent(-(crop.zoom - 1) * crop.x),
      top: percent(-(crop.zoom - 1) * crop.y),
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "cover",
      objectPosition: percent(crop.x) + " " + percent(crop.y)
    };
  }
  return bindRuntimeValue(runtime2, "normalizeImageCrop", () => normalizeImageCrop), bindRuntimeValue(runtime2, "imageCropRect", () => imageCropRect), bindRuntimeValue(runtime2, "cropFromImageRect", () => cropFromImageRect), bindRuntimeValue(runtime2, "panImageCrop", () => panImageCrop), bindRuntimeValue(runtime2, "resizeImageCropFromCorner", () => resizeImageCropFromCorner), bindRuntimeValue(runtime2, "resizeCropViewport", () => resizeCropViewport), bindRuntimeValue(runtime2, "cropImageToRect", () => cropImageToRect), bindRuntimeValue(runtime2, "zoomImageCrop", () => zoomImageCrop), bindRuntimeValue(runtime2, "centerUncroppedImageAxes", () => centerUncroppedImageAxes), bindRuntimeValue(runtime2, "imageCropNormalizedViewport", () => imageCropNormalizedViewport), bindRuntimeValue(runtime2, "imageCropCss", () => imageCropCss), bindRuntimeValue(runtime2, "defaultImageCrop", () => defaultImageCrop, (value) => {
    defaultImageCrop = value;
  }), bindRuntimeValue(runtime2, "clampCropValue", () => clampCropValue, (value) => {
    clampCropValue = value;
  }), bindRuntimeValue(runtime2, "roundCropValue", () => roundCropValue, (value) => {
    roundCropValue = value;
  }), bindRuntimeValue(runtime2, "imageCropsEqual", () => imageCropsEqual, (value) => {
    imageCropsEqual = value;
  }), bindRuntimeValue(runtime2, "coverImageScale", () => coverImageScale, (value) => {
    coverImageScale = value;
  }), bindRuntimeValue(runtime2, "maxImageCropZoom", () => maxImageCropZoom, (value) => {
    maxImageCropZoom = value;
  }), bindRuntimeValue(runtime2, "initializeImageCrop", () => initializeImageCrop, (value) => {
    initializeImageCrop = value;
  }), () => {
    clampCropValue = (input, options, context) => Math.min(context, Math.max(options, input)), roundCropValue = (input, options) => Math.round(input * 10 ** options) / 10 ** options, imageCropsEqual = (input, options) => {
      let [items, items2] = [
        input ?? defaultImageCrop,
        options ?? defaultImageCrop
      ];
      return items.zoom === items2.zoom && items.x === items2.x && items.y === items2.y;
    }, coverImageScale = (input, options) => Math.max(input.w / options.w, input.h / options.h), maxImageCropZoom = (input) => Math.max(50, input.zoom), initializeImageCrop = (0, runtime2.initializeOnce)(() => {
      defaultImageCrop = {
        zoom: 1,
        x: 0.5,
        y: 0.5
      };
    });
  };
}
export {
  installMediaImageCrop
};
