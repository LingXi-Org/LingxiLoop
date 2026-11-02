// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPng(runtime2) {
  var pngSignature, pngCrc32Table, initializePngEncoding;
  function pngCrc32(bytes) {
    let count = 4294967295;
    for (let value of bytes)
      count = pngCrc32Table[(count ^ value) & 255] ^ count >>> 8;
    return (count ^ 4294967295) >>> 0;
  }
  function pngChunk(type, bytes) {
    let chunk = new Uint8Array(12 + bytes.length), view = new DataView(chunk.buffer);
    view.setUint32(0, bytes.length);
    for (let index4 = 0; index4 < 4; index4++)
      chunk[4 + index4] = type.charCodeAt(index4);
    return chunk.set(bytes, 8), view.setUint32(8 + bytes.length, pngCrc32(chunk.subarray(4, 8 + bytes.length))), chunk;
  }
  async function rgbPixelsToPngDataUrl(rgba, width, height2) {
    if (typeof CompressionStream != "function")
      return;
    let rowBytes = 1 + width * 3, filteredPixels = new Uint8Array(rowBytes * height2);
    for (let index22 = 0; index22 < height2; index22++) {
      filteredPixels[index22 * rowBytes] = 1;
      for (let index32 = 0; index32 < width; index32++)
        for (let index42 = 0; index42 < 3; index42++) {
          let value5 = (index22 * width + index32) * 4 + index42;
          filteredPixels[index22 * rowBytes + 1 + index32 * 3 + index42] = rgba[value5] - (index32 > 0 ? rgba[value5 - 4] : 0);
        }
    }
    let value = new Uint8Array(await new Response(new Blob([filteredPixels]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer()), value2 = new Uint8Array(13), value3 = new DataView(value2.buffer);
    value3.setUint32(0, width), value3.setUint32(4, height2), value2[8] = 8, value2[9] = 2;
    let items = [
      Uint8Array.from(pngSignature),
      pngChunk("IHDR", value2),
      pngChunk("IDAT", value),
      pngChunk("IEND", new Uint8Array(0))
    ], value4 = new Uint8Array(items.reduce((input, items2) => input + items2.length, 0)), index4 = 0;
    for (let value5 of items)
      value4.set(value5, index4), index4 += value5.length;
    return value4;
  }
  function pngBytesToDataUrl(bytes) {
    let binary = "";
    for (let index4 = 0; index4 < bytes.length; index4 += 32768)
      binary += String.fromCharCode(...bytes.subarray(index4, index4 + 32768));
    return "data:image/png;base64," + btoa(binary);
  }
  return bindRuntimeValue(runtime2, "pngCrc32", () => pngCrc32), bindRuntimeValue(runtime2, "pngChunk", () => pngChunk), bindRuntimeValue(runtime2, "rgbPixelsToPngDataUrl", () => rgbPixelsToPngDataUrl), bindRuntimeValue(runtime2, "pngBytesToDataUrl", () => pngBytesToDataUrl), bindRuntimeValue(runtime2, "pngSignature", () => pngSignature, (value) => {
    pngSignature = value;
  }), bindRuntimeValue(runtime2, "pngCrc32Table", () => pngCrc32Table, (value) => {
    pngCrc32Table = value;
  }), bindRuntimeValue(runtime2, "initializePngEncoding", () => initializePngEncoding, (value) => {
    initializePngEncoding = value;
  }), () => {
    initializePngEncoding = (0, runtime2.initializeOnce)(() => {
      pngSignature = [137, 80, 78, 71, 13, 10, 26, 10], pngCrc32Table = Uint32Array.from({
        length: 256
      }, (input, options) => {
        let value = options;
        for (let index4 = 0; index4 < 8; index4++)
          value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
        return value >>> 0;
      });
    });
  };
}
export {
  installExportPng
};
