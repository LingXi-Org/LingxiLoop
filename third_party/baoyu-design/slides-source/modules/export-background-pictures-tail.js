// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportBackgroundPicturesTail(runtime2) {
  var backgroundCaptureStyleKeys, BACKGROUND_PICTURE_BUDGET, BACKGROUND_CAPTURE_SCALES, BACKGROUND_CAPTURE_TIMEOUT_MS, initializeBackgroundCapture;
  function averagePixelColor(pixels) {
    let items = [0, 0, 0];
    for (let index4 = 0; index4 < pixels.length; index4 += 4)
      for (let index22 = 0; index22 < 3; index22++)
        items[index22] += pixels[index4 + index22];
    return "#" + items.map((input) => Math.round(input / (pixels.length / 4)).toString(16).padStart(2, "0")).join("");
  }
  async function captureBackgroundPicture(surface, frameIds, scale) {
    try {
      let value = document.createElement("canvas");
      value.width = Math.round(runtime2.SLIDE_WIDTH * scale), value.height = Math.round(runtime2.SLIDE_HEIGHT * scale);
      let value2 = value.getContext("2d");
      if (value2 === null)
        return;
      let value3 = surface.cloneNode(!0);
      for (let value10 of Array.from(value3.querySelectorAll("[data-frame-id]")))
        frameIds.has(value10.getAttribute("data-frame-id") ?? "") || value10.remove();
      let value4 = new Image();
      await new Promise((input, options) => {
        let value10 = setTimeout(() => options(Error("timed out")), BACKGROUND_CAPTURE_TIMEOUT_MS);
        value4.onload = () => {
          clearTimeout(value10), input();
        }, value4.onerror = () => {
          clearTimeout(value10), options(Error("not drawn"));
        }, value4.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent((0, runtime2.slideForeignObjectSvg)(value3, "", "sans-serif"));
      }), value2.fillStyle = "#fff", value2.fillRect(0, 0, value.width, value.height), value2.drawImage(value4, 0, 0, value.width, value.height);
      let { data: value5 } = value2.getImageData(0, 0, value.width, value.height);
      if ((0, runtime2.imagePixelsAreWhite)(value5))
        return;
      let value6 = averagePixelColor(value5), value7 = await (0, runtime2.rgbPixelsToPngDataUrl)(value5, value.width, value.height).catch(() => {
      });
      if (value7 !== void 0)
        return {
          dataUri: (0, runtime2.pngBytesToDataUrl)(value7),
          bytes: value7.length,
          ground: value6
        };
      let value8 = value.toDataURL("image/png"), value9 = value8.indexOf(";base64,");
      return value8.startsWith("data:image/png") && value9 > 0 ? {
        dataUri: value8,
        bytes: Math.ceil((value8.length - value9 - 8) * 3 / 4),
        ground: value6
      } : void 0;
    } catch {
      return;
    }
  }
  async function captureDeckBackgrounds(slides, getSurface, measureRectangle, capture = captureBackgroundPicture) {
    let items = [];
    slides.forEach((input, options) => {
      let value2 = getSurface(options), value3 = value2?.getBoundingClientRect();
      if (value2 === null || value3 === void 0 || value3.width <= 0 || value3.height <= 0)
        return;
      let entries3 = /* @__PURE__ */ new Map(), value4 = (0, runtime2.slideBackgroundPaintFrames)(input, (input2) => {
        let element = value2.querySelector('[data-frame-id="' + input2.id + '"] [data-node-path=""]');
        if (element === null)
          return !1;
        let value6 = measureRectangle(element, value3);
        return entries3.set(input2.id, value6), value6.x <= 0.5 && value6.y <= 0.5 && value6.x + value6.w >= value3.width - 0.5 && value6.y + value6.h >= value3.height - 0.5;
      });
      if (!(0, runtime2.backgroundNeedsGradientRaster)(value4))
        return;
      let value5 = (0, runtime2.stableJsonStringify)([
        input.bg,
        value4.map((input2) => [entries3.get(input2.id), input2.node.style])
      ]);
      items.push({
        index: options,
        key: value5,
        surface: value2,
        frameIds: new Set(value4.map((input2) => input2.id))
      });
    });
    let entries = /* @__PURE__ */ new Map(), value = BACKGROUND_CAPTURE_SCALES[0];
    for (let value2 of BACKGROUND_CAPTURE_SCALES) {
      value = value2;
      let entries3 = /* @__PURE__ */ new Map();
      for (let value3 of items)
        entries3.has(value3.key) || entries3.set(value3.key, entries.has(value3.key) && entries.get(value3.key) === void 0 ? void 0 : await capture(value3.surface, value3.frameIds, value2));
      entries = entries3;
      let index4 = 0;
      for (let value3 of entries.values())
        index4 += value3?.bytes ?? 0;
      if (index4 <= BACKGROUND_PICTURE_BUDGET)
        break;
    }
    let items2 = [];
    value < 1 && [...entries.values()].some((input) => input !== void 0) && items2.push("slide backgrounds saved at " + (value === 0.5 ? "half" : "quarter") + " resolution to keep the file small");
    let entries2 = /* @__PURE__ */ new Map(), items3 = [];
    for (let value2 of items) {
      let entry = entries.get(value2.key);
      entry !== void 0 ? entries2.set(value2.index, {
        dataUri: entry.dataUri,
        ground: entry.ground,
        frameIds: value2.frameIds
      }) : items3.push(value2.index + 1);
    }
    if (items3.length > 0) {
      let value2 = items3.length > 1, value3 = items3.slice(0, 3).join(", ") + (items3.length > 3 ? " and " + String(items3.length - 3) + " more" : "");
      items2.push("the gradient background" + (value2 ? "s on slides " : " on slide ") + value3 + (value2 ? " were not saved as pictures, so they" : " was not saved as a picture, so it") + " may look different in the file");
    }
    return {
      pictures: entries2,
      notes: items2
    };
  }
  return bindRuntimeValue(runtime2, "averagePixelColor", () => averagePixelColor), bindRuntimeValue(runtime2, "captureBackgroundPicture", () => captureBackgroundPicture), bindRuntimeValue(runtime2, "captureDeckBackgrounds", () => captureDeckBackgrounds), bindRuntimeValue(runtime2, "backgroundCaptureStyleKeys", () => backgroundCaptureStyleKeys, (value) => {
    backgroundCaptureStyleKeys = value;
  }), bindRuntimeValue(runtime2, "BACKGROUND_PICTURE_BUDGET", () => BACKGROUND_PICTURE_BUDGET, (value) => {
    BACKGROUND_PICTURE_BUDGET = value;
  }), bindRuntimeValue(runtime2, "BACKGROUND_CAPTURE_SCALES", () => BACKGROUND_CAPTURE_SCALES, (value) => {
    BACKGROUND_CAPTURE_SCALES = value;
  }), bindRuntimeValue(runtime2, "BACKGROUND_CAPTURE_TIMEOUT_MS", () => BACKGROUND_CAPTURE_TIMEOUT_MS, (value) => {
    BACKGROUND_CAPTURE_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "initializeBackgroundCapture", () => initializeBackgroundCapture, (value) => {
    initializeBackgroundCapture = value;
  }), () => {
    BACKGROUND_PICTURE_BUDGET = 8388608, BACKGROUND_CAPTURE_TIMEOUT_MS = 5e3, initializeBackgroundCapture = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializePdfCapture)(), (0, runtime2.initializePngEncoding)(), backgroundCaptureStyleKeys = /* @__PURE__ */ new Set([
        "backgroundGradient",
        "backgroundColor",
        "opacity"
      ]), BACKGROUND_CAPTURE_SCALES = [1, 0.5, 0.25];
    });
  };
}
export {
  installExportBackgroundPicturesTail
};
