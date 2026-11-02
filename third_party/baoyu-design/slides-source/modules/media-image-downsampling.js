// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installMediaImageDownsampling(runtime2) {
  var imageDataUrlQualities, imageBlobQualities, initializeImageDownsampling;
  function isSvgMimeType(mimeType) {
    return (mimeType.split(";")[0] ?? "").trim().toLowerCase() === "image/svg+xml";
  }
  async function decodeSvgImage(blob, maxEdge) {
    let value = URL.createObjectURL(blob);
    try {
      let value2 = new Image();
      await new Promise((input, options) => {
        let value11 = setTimeout(() => options(Error("timed out reading the SVG")), 2e4);
        value2.onload = () => {
          clearTimeout(value11), input();
        }, value2.onerror = () => {
          clearTimeout(value11), options(Error("the SVG could not be decoded as an image"));
        }, value2.src = value;
      });
      let value3 = value2.naturalWidth > 0 && value2.naturalHeight > 0, value4 = value3 ? value2.naturalWidth : maxEdge, value5 = value3 ? value2.naturalHeight : maxEdge, value6 = maxEdge / Math.max(value4, value5), value7 = Math.max(1, Math.round(value4 * value6)), value8 = Math.max(1, Math.round(value5 * value6)), value9 = document.createElement("canvas");
      value9.width = value7, value9.height = value8;
      let value10 = value9.getContext("2d");
      if (value10 === null)
        throw Error("no 2d canvas in this host");
      value10.drawImage(value2, 0, 0, value7, value8);
      try {
        value10.getImageData(0, 0, 1, 1);
      } catch {
        throw Error("this SVG uses features that can't be imported (embedded web content)");
      }
      return createImageBitmap(value9);
    } finally {
      URL.revokeObjectURL(value);
    }
  }
  async function decodeImageBitmap(blob, maxSvgEdge) {
    return isSvgMimeType(blob.type) ? decodeSvgImage(blob, maxSvgEdge) : createImageBitmap(blob);
  }
  function encodeImageDataUrl(image, maxEdge, mimeType, quality) {
    let scale = Math.min(1, maxEdge / Math.max(image.width, image.height)), width = Math.max(1, Math.round(image.width * scale)), height2 = Math.max(1, Math.round(image.height * scale)), canvas = document.createElement("canvas");
    canvas.width = width, canvas.height = height2;
    let context = canvas.getContext("2d");
    if (!context)
      return;
    context.drawImage(image, 0, 0, width, height2);
    let value = canvas.toDataURL(quality, mimeType);
    if (value.startsWith("data:" + quality))
      return value;
  }
  async function downsampleImageToDataUrl(blob, options = {}) {
    let maxBytes = options.maxBytes ?? 71680, maxEdge = options.maxEdge ?? 1280, image = await decodeImageBitmap(blob, Math.max(64, maxEdge));
    try {
      let value = Math.max(64, Math.min(maxEdge, Math.max(image.width, image.height))), value2;
      for (; value >= 64; ) {
        for (let value3 of imageDataUrlQualities) {
          let value4 = encodeImageDataUrl(image, value, value3, "image/webp") ?? encodeImageDataUrl(image, value, value3, "image/jpeg");
          if (value4 && value4.length <= maxBytes)
            return value4;
          value4 && (!value2 || value4.length < value2.length) && (value2 = value4);
        }
        value = Math.floor(value * 0.7);
      }
      throw Error("could not fit the image into " + String(maxBytes) + " bytes" + (value2 ? " (smallest attempt: " + String(value2.length) + ")" : ""));
    } finally {
      image.close();
    }
  }
  async function encodeImageBlob(image, maxEdge, mimeType, quality) {
    let scale = Math.min(1, maxEdge / Math.max(image.width, image.height)), width = Math.max(1, Math.round(image.width * scale)), height2 = Math.max(1, Math.round(image.height * scale)), canvas = document.createElement("canvas");
    canvas.width = width, canvas.height = height2;
    let context = canvas.getContext("2d");
    if (!context)
      return;
    context.drawImage(image, 0, 0, width, height2);
    let value = await new Promise((input) => canvas.toBlob(input, quality, mimeType));
    if (value !== null && value.type === quality)
      return value;
  }
  async function downsampleImageToBlob(blob, options = {}) {
    let maxEdge = options.maxEdge ?? 2560, maxBytes = options.maxBytes ?? 1572864, image = await decodeImageBitmap(blob, maxEdge);
    try {
      let value = Math.max(64, Math.min(maxEdge, Math.max(image.width, image.height)));
      for (; value >= 64; ) {
        for (let value2 of imageBlobQualities) {
          let value3 = await encodeImageBlob(image, value, value2, "image/webp") ?? await encodeImageBlob(image, value, value2, "image/jpeg");
          if (value3 && value3.size <= maxBytes)
            return value3;
        }
        value = Math.floor(value * 0.7);
      }
      throw Error("could not fit the image into " + String(maxBytes) + " bytes");
    } finally {
      image.close();
    }
  }
  function isImageFile(file) {
    return file.type.startsWith("image/");
  }
  return bindRuntimeValue(runtime2, "isSvgMimeType", () => isSvgMimeType), bindRuntimeValue(runtime2, "decodeSvgImage", () => decodeSvgImage), bindRuntimeValue(runtime2, "decodeImageBitmap", () => decodeImageBitmap), bindRuntimeValue(runtime2, "encodeImageDataUrl", () => encodeImageDataUrl), bindRuntimeValue(runtime2, "downsampleImageToDataUrl", () => downsampleImageToDataUrl), bindRuntimeValue(runtime2, "encodeImageBlob", () => encodeImageBlob), bindRuntimeValue(runtime2, "downsampleImageToBlob", () => downsampleImageToBlob), bindRuntimeValue(runtime2, "isImageFile", () => isImageFile), bindRuntimeValue(runtime2, "imageDataUrlQualities", () => imageDataUrlQualities, (value) => {
    imageDataUrlQualities = value;
  }), bindRuntimeValue(runtime2, "imageBlobQualities", () => imageBlobQualities, (value) => {
    imageBlobQualities = value;
  }), bindRuntimeValue(runtime2, "initializeImageDownsampling", () => initializeImageDownsampling, (value) => {
    initializeImageDownsampling = value;
  }), () => {
    initializeImageDownsampling = (0, runtime2.initializeOnce)(() => {
      imageDataUrlQualities = [0.8, 0.65, 0.5, 0.35, 0.25], imageBlobQualities = [0.85, 0.75, 0.65, 0.5];
    });
  };
}
export {
  installMediaImageDownsampling
};
