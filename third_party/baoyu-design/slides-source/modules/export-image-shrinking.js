// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportImageShrinking(runtime2) {
  var INLINE_IMAGE_PATTERN, INLINE_IMAGE_PREFIX_PATTERN, IMAGE_ENCODING_ATTEMPTS, decodeExportImage, opaqueImageProbeCanvas, imageHasOpaquePixels, initializeImageShrinking;
  function createImageEncoder() {
    let value, values = /* @__PURE__ */ new Set();
    return (dataset, options, context, value2, extra) => {
      if (values.has(value2))
        return;
      value ??= document.createElement("canvas"), value.width = options, value.height = context;
      let value3 = value.getContext("2d");
      if (value3 !== null)
        try {
          value3.clearRect(0, 0, options, context), value3.imageSmoothingQuality = "high", value3.drawImage(dataset.source, 0, 0, options, context);
          let value4 = value.toDataURL(value2, extra);
          if (value4.startsWith("data:" + value2))
            return value4;
          value4.startsWith("data:image/") && values.add(value2);
          return;
        } catch {
          return;
        }
    };
  }
  async function collectExportImages(pages, decodedImages, references, decodeImage = decodeExportImage) {
    let entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map(), callback = (input, options, context, dataset) => {
      let entry = entries.get(input);
      if (entry !== void 0) {
        entry.drawnW = Math.max(entry.drawnW, options), entry.drawnH = Math.max(entry.drawnH, context);
        return;
      }
      let entry2 = entries2.get(input), state = {
        drawnW: Math.max(entry2?.drawnW ?? 0, options),
        drawnH: Math.max(entry2?.drawnH ?? 0, context)
      };
      dataset !== void 0 ? (entries.set(input, {
        url: input,
        naturalW: dataset.w,
        naturalH: dataset.h,
        ...state,
        source: dataset.source
      }), entries2.delete(input)) : entries2.set(input, state);
    };
    pages.forEach((element, options) => {
      let bounds = element.getBoundingClientRect(), value = bounds.width > 0 ? references / bounds.width : 1, callback2 = (input) => {
        let bounds2 = input.getBoundingClientRect();
        return [bounds2.width * value, bounds2.height * value];
      };
      for (let value2 of Array.from(element.querySelectorAll("img"))) {
        let value3 = value2.getAttribute("src") ?? "";
        if (!INLINE_IMAGE_PREFIX_PATTERN.test(value3))
          continue;
        let value4 = value2.naturalWidth > 0 && value2.naturalHeight > 0 ? {
          source: value2,
          w: value2.naturalWidth,
          h: value2.naturalHeight
        } : void 0;
        callback(value3, ...callback2(value2), value4);
      }
      for (let value2 of Array.from(element.querySelectorAll('[style*="data:image/"]')))
        for (let value3 of (value2.getAttribute("style") ?? "").matchAll(INLINE_IMAGE_PATTERN))
          callback(value3[0], ...callback2(value2));
      for (let [value2, value3] of decodedImages.get(options) ?? []) {
        if (!INLINE_IMAGE_PREFIX_PATTERN.test(value3))
          continue;
        let element2 = element.querySelector('[data-frame-id="' + value2 + '"] [data-node-path=""]');
        callback(value3, ...element2 === null ? [0, 0] : callback2(element2));
      }
    });
    for (let [value, value2] of entries2) {
      let value3 = await decodeImage(value);
      value3 !== void 0 && entries.set(value, {
        url: value,
        naturalW: value3.w,
        naturalH: value3.h,
        ...value2,
        source: value3.source
      });
    }
    return [...entries.values()];
  }
  function isAnimatedImage(dataUri) {
    let value = dataUri.indexOf(","), text = "";
    try {
      text = atob(dataUri.slice(value + 1, value + 1 + 65536));
    } catch {
      return !1;
    }
    if (dataUri.startsWith("data:image/webp"))
      return text.slice(12, 16) === "VP8X" && (text.charCodeAt(20) & 2) !== 0;
    if (!dataUri.startsWith("data:image/png"))
      return !1;
    let callback = (input) => (text.charCodeAt(input) << 24 | text.charCodeAt(input + 1) << 16 | text.charCodeAt(input + 2) << 8 | text.charCodeAt(input + 3)) >>> 0;
    for (let count = 8; count + 8 <= text.length; count += 12 + callback(count)) {
      let value2 = text.slice(count + 4, count + 8);
      if (value2 === "acTL")
        return !0;
      if (value2 === "IDAT")
        return !1;
    }
    return !1;
  }
  function imageEncodingMimeTypes(dataUri, isOpaque) {
    return dataUri.startsWith("data:image/jpeg") ? ["image/jpeg"] : isOpaque() ? ["image/webp", "image/jpeg"] : ["image/webp", "image/png"];
  }
  function yieldToBrowser() {
    return typeof MessageChannel != "function" ? new Promise((input) => setTimeout(input, 0)) : new Promise((input) => {
      let value = new MessageChannel();
      value.port1.onmessage = () => input(), value.port2.postMessage(null);
    });
  }
  async function shrinkExportImages(pages, images, options) {
    let state = {
      pages: [...pages],
      fits: options.mustSave <= 0,
      reduced: 0,
      saved: 0
    };
    if (options.mustSave <= 0)
      return state;
    let value = Math.max(options.mustSave, options.wantSave ?? options.mustSave), value2 = options.encode ?? createImageEncoder(), value3 = options.opaque ?? imageHasOpaquePixels, value4 = options.tiers ?? IMAGE_ENCODING_ATTEMPTS, entries = /* @__PURE__ */ new Map();
    for (let value7 of pages)
      for (let value8 of value7.matchAll(INLINE_IMAGE_PATTERN))
        entries.set(value8[0], (entries.get(value8[0]) ?? 0) + 1);
    let value5 = images.filter((input) => input.url.length >= 131072 && (entries.get(input.url) ?? 0) > 0 && input.naturalW > 0 && input.naturalH > 0 && !isAnimatedImage(input.url)).map((input) => ({
      img: input,
      uses: entries.get(input.url),
      current: input.url,
      mimes: void 0,
      tried: /* @__PURE__ */ new Set()
    })), index4 = 0, value6 = Date.now();
    $: for (let value7 of value4) {
      value5.sort((input, options2) => options2.current.length * options2.uses - input.current.length * input.uses);
      for (let value8 of value5) {
        if (index4 >= value || options.deadline !== void 0 && Date.now() >= options.deadline || index4 >= options.mustSave && options.wantDeadline !== void 0 && Date.now() >= options.wantDeadline)
          break $;
        let { img: value9 } = value8, value10 = value9.drawnW > 0 && value9.drawnH > 0 ? Math.max(value9.drawnW / value9.naturalW, value9.drawnH / value9.naturalH) : 1, value11 = Math.min(1, value7.scale * value10), value12 = Math.max(1, Math.round(value9.naturalW * value11)), value13 = Math.max(1, Math.round(value9.naturalH * value11));
        value8.mimes ??= imageEncodingMimeTypes(value9.url, () => value3(value9));
        let value14;
        for (let value15 of value8.mimes) {
          let value16 = String(value12) + "x" + String(value13) + value15 + (value15 === "image/png" ? "" : String(value7.quality));
          if (!value8.tried.has(value16) && (value8.tried.add(value16), value14 = value2(value9, value12, value13, value15, value7.quality), value14 !== void 0))
            break;
        }
        value14 !== void 0 && value14.length < value8.current.length && (index4 += (value8.current.length - value14.length) * value8.uses, value8.current = value14), Date.now() - value6 > 50 && (await yieldToBrowser(), value6 = Date.now());
      }
      if (index4 >= options.mustSave)
        break;
    }
    if (index4 < options.mustSave)
      return state;
    let entries2 = new Map(value5.filter((input) => input.current !== input.img.url).map((input) => [input.img.url, input.current]));
    return {
      pages: pages.map((input) => input.replace(INLINE_IMAGE_PATTERN, (input2) => entries2.get(input2) ?? input2)),
      fits: !0,
      reduced: entries2.size,
      saved: index4
    };
  }
  return bindRuntimeValue(runtime2, "createImageEncoder", () => createImageEncoder), bindRuntimeValue(runtime2, "collectExportImages", () => collectExportImages), bindRuntimeValue(runtime2, "isAnimatedImage", () => isAnimatedImage), bindRuntimeValue(runtime2, "imageEncodingMimeTypes", () => imageEncodingMimeTypes), bindRuntimeValue(runtime2, "yieldToBrowser", () => yieldToBrowser), bindRuntimeValue(runtime2, "shrinkExportImages", () => shrinkExportImages), bindRuntimeValue(runtime2, "INLINE_IMAGE_PATTERN", () => INLINE_IMAGE_PATTERN, (value) => {
    INLINE_IMAGE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "INLINE_IMAGE_PREFIX_PATTERN", () => INLINE_IMAGE_PREFIX_PATTERN, (value) => {
    INLINE_IMAGE_PREFIX_PATTERN = value;
  }), bindRuntimeValue(runtime2, "IMAGE_ENCODING_ATTEMPTS", () => IMAGE_ENCODING_ATTEMPTS, (value) => {
    IMAGE_ENCODING_ATTEMPTS = value;
  }), bindRuntimeValue(runtime2, "decodeExportImage", () => decodeExportImage, (value) => {
    decodeExportImage = value;
  }), bindRuntimeValue(runtime2, "opaqueImageProbeCanvas", () => opaqueImageProbeCanvas, (value) => {
    opaqueImageProbeCanvas = value;
  }), bindRuntimeValue(runtime2, "imageHasOpaquePixels", () => imageHasOpaquePixels, (value) => {
    imageHasOpaquePixels = value;
  }), bindRuntimeValue(runtime2, "initializeImageShrinking", () => initializeImageShrinking, (value) => {
    initializeImageShrinking = value;
  }), () => {
    decodeExportImage = async (dataUri) => {
      try {
        let value = new Image();
        return value.src = dataUri, await value.decode(), value.naturalWidth > 0 && value.naturalHeight > 0 ? {
          source: value,
          w: value.naturalWidth,
          h: value.naturalHeight
        } : void 0;
      } catch {
        return;
      }
    }, imageHasOpaquePixels = (image) => {
      try {
        let value = opaqueImageProbeCanvas ??= document.createElement("canvas");
        value.width = 256, value.height = 256;
        let value2 = value.getContext("2d");
        if (value2 === null)
          return !1;
        value2.clearRect(0, 0, 256, 256), value2.imageSmoothingQuality = "high", value2.drawImage(image.source, 0, 0, 256, 256);
        let data = value2.getImageData(0, 0, 256, 256).data;
        for (let count = 3; count < data.length; count += 4)
          if (data[count] !== 255)
            return !1;
        return !0;
      } catch {
        return !1;
      }
    }, initializeImageShrinking = (0, runtime2.initializeOnce)(() => {
      INLINE_IMAGE_PATTERN = /data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+/g, INLINE_IMAGE_PREFIX_PATTERN = /^data:image\/(?:png|jpeg|webp|avif);base64,/, IMAGE_ENCODING_ATTEMPTS = [
        {
          scale: 2,
          quality: 0.85
        },
        {
          scale: 1.5,
          quality: 0.8
        },
        {
          scale: 1,
          quality: 0.72
        }
      ];
    });
  };
}
export {
  installExportImageShrinking
};
