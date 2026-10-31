// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installMediaAssets(runtime2) {
  var storedBlobPattern, allowedImageMimeTypes, maxImageUploadBytes, maxStoredImageBytes, maxStoredImageEdge, downsampleStoredImage, blobFetchPromises, blobObjectUrls, blobCacheByteSizes, blobCacheBytes, maxBlobCacheBytes, recentBlobFetchFailures, blobFailureCooldownMs, initializeAssetStorage;
  async function getAssetsCapability() {
    let slidesHost = globalThis.slidesHost;
    return typeof slidesHost?.use == "function" ? (0, runtime2.loadHostCapabilityWithTimeout)("assets", (0, runtime2.capabilityHasMethod)("upload")) : typeof slidesHost?.assets?.upload == "function" ? slidesHost.assets : null;
  }
  function isEmulatorBlobUrl(url) {
    return url.startsWith("blob:") && (0, runtime2.isEmulatorPage)();
  }
  function isStoredBlobReference(url) {
    return storedBlobPattern.test(url) || isEmulatorBlobUrl(url);
  }
  function normalizeUploadedAsset(uploaded) {
    if (typeof uploaded != "object" || uploaded === null)
      return;
    let value = uploaded, value2 = typeof value.id == "string" ? value.id : "", value3 = typeof value.url == "string" ? value.url : "", value4 = storedBlobPattern.test(value3) || isEmulatorBlobUrl(value3) ? value3 : /^[0-9a-f]{32}$/.test(value2) ? "_blob/" + value2 : "";
    if (value4 !== "")
      return {
        id: value2 || value4.slice(-32),
        src: value4,
        bytes: typeof value.sizeBytes == "number" ? value.sizeBytes : 0
      };
  }
  async function imageMaxDimension(blob) {
    try {
      let value = await createImageBitmap(blob), value2 = Math.max(value.width, value.height);
      return value.close(), value2;
    } catch {
      return 0;
    }
  }
  async function prepareImageUpload(blob) {
    return blob.size <= maxStoredImageBytes && await imageMaxDimension(blob) <= maxStoredImageEdge ? blob : downsampleStoredImage(blob);
  }
  async function storeImageAsset(blob, options = {}) {
    let value = options.downsample ?? runtime2.downsampleImageToDataUrl, callback = async (input) => {
      try {
        return {
          kind: "data",
          src: await value(blob, {
            maxBytes: options.maxDataBytes ?? 71680
          }),
          reason: input
        };
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : Error(String(error)), {
          reason: input
        });
      }
    }, type = blob.type, value2 = allowedImageMimeTypes.includes(type), value3 = type === "image/avif" || type === "image/bmp" || type === "image/svg+xml";
    if (!value2 && !value3)
      return callback("unsupported_type");
    let value4 = type === "image/gif";
    if (value4 && blob.size > maxImageUploadBytes)
      return callback("too_large");
    let value5 = await getAssetsCapability();
    if (value5 === null || typeof value5.upload != "function")
      return callback("unavailable");
    let value6 = blob;
    if (!value4)
      try {
        value6 = value3 ? await (options.transcode ?? downsampleStoredImage)(blob) : await (options.downsize ?? prepareImageUpload)(blob);
      } catch {
        return callback("downsize_failed");
      }
    try {
      let value7 = normalizeUploadedAsset(await value5.upload.call(value5, value6, {
        type: value6.type || type
      }));
      return value7 === void 0 ? callback("bad_result") : {
        kind: "blob",
        ...value7
      };
    } catch (value7) {
      let value8 = typeof value7 == "object" && value7 !== null ? String(value7.code ?? "") : "";
      return callback(value8 || "upload_failed");
    }
  }
  function accountBlobCacheEntry(url, byteLength) {
    blobCacheByteSizes.set(url, byteLength), blobCacheBytes += byteLength;
    for (let [value, value2] of blobCacheByteSizes) {
      if (blobCacheBytes <= maxBlobCacheBytes)
        break;
      value !== url && (blobCacheByteSizes.delete(value), blobFetchPromises.delete(value), blobObjectUrls.delete(value), blobCacheBytes -= value2);
    }
  }
  function fetchStoredBlob(url, timeoutMs = 8e3, options = {}) {
    let entry = blobFetchPromises.get(url);
    if (entry !== void 0)
      return entry;
    let entry2 = recentBlobFetchFailures.get(url);
    if (entry2 !== void 0 && options.ignoreRecentFailure !== !0 && Date.now() - entry2 < blobFailureCooldownMs)
      return Promise.reject(Error("blob fetch failed recently"));
    let value = (async () => {
      if (!isStoredBlobReference(url))
        throw Error("not a blob ref");
      let value2 = typeof AbortController == "function" ? new AbortController() : void 0, value3 = setTimeout(() => value2?.abort(), timeoutMs);
      try {
        let value4 = await fetch(url, {
          credentials: "same-origin",
          signal: value2?.signal
        });
        if (!value4.ok)
          throw Object.assign(Error("blob fetch " + String(value4.status)), {
            status: value4.status
          });
        let value5 = await value4.blob();
        return await new Promise((input, options2) => {
          let value6 = new FileReader();
          value6.onload = () => input(String(value6.result)), value6.onerror = () => options2(Error("blob read failed")), value6.readAsDataURL(value5);
        });
      } finally {
        clearTimeout(value3);
      }
    })();
    return blobFetchPromises.set(url, value), value.then((items) => {
      blobObjectUrls.set(url, items), accountBlobCacheEntry(url, items.length);
    }, () => {
      blobFetchPromises.delete(url), recentBlobFetchFailures.set(url, Date.now());
    }), value;
  }
  return bindRuntimeValue(runtime2, "getAssetsCapability", () => getAssetsCapability), bindRuntimeValue(runtime2, "isEmulatorBlobUrl", () => isEmulatorBlobUrl), bindRuntimeValue(runtime2, "isStoredBlobReference", () => isStoredBlobReference), bindRuntimeValue(runtime2, "normalizeUploadedAsset", () => normalizeUploadedAsset), bindRuntimeValue(runtime2, "imageMaxDimension", () => imageMaxDimension), bindRuntimeValue(runtime2, "prepareImageUpload", () => prepareImageUpload), bindRuntimeValue(runtime2, "storeImageAsset", () => storeImageAsset), bindRuntimeValue(runtime2, "accountBlobCacheEntry", () => accountBlobCacheEntry), bindRuntimeValue(runtime2, "fetchStoredBlob", () => fetchStoredBlob), bindRuntimeValue(runtime2, "storedBlobPattern", () => storedBlobPattern, (value) => {
    storedBlobPattern = value;
  }), bindRuntimeValue(runtime2, "allowedImageMimeTypes", () => allowedImageMimeTypes, (value) => {
    allowedImageMimeTypes = value;
  }), bindRuntimeValue(runtime2, "maxImageUploadBytes", () => maxImageUploadBytes, (value) => {
    maxImageUploadBytes = value;
  }), bindRuntimeValue(runtime2, "maxStoredImageBytes", () => maxStoredImageBytes, (value) => {
    maxStoredImageBytes = value;
  }), bindRuntimeValue(runtime2, "maxStoredImageEdge", () => maxStoredImageEdge, (value) => {
    maxStoredImageEdge = value;
  }), bindRuntimeValue(runtime2, "downsampleStoredImage", () => downsampleStoredImage, (value) => {
    downsampleStoredImage = value;
  }), bindRuntimeValue(runtime2, "blobFetchPromises", () => blobFetchPromises, (value) => {
    blobFetchPromises = value;
  }), bindRuntimeValue(runtime2, "blobObjectUrls", () => blobObjectUrls, (value) => {
    blobObjectUrls = value;
  }), bindRuntimeValue(runtime2, "blobCacheByteSizes", () => blobCacheByteSizes, (value) => {
    blobCacheByteSizes = value;
  }), bindRuntimeValue(runtime2, "blobCacheBytes", () => blobCacheBytes, (value) => {
    blobCacheBytes = value;
  }), bindRuntimeValue(runtime2, "maxBlobCacheBytes", () => maxBlobCacheBytes, (value) => {
    maxBlobCacheBytes = value;
  }), bindRuntimeValue(runtime2, "recentBlobFetchFailures", () => recentBlobFetchFailures, (value) => {
    recentBlobFetchFailures = value;
  }), bindRuntimeValue(runtime2, "blobFailureCooldownMs", () => blobFailureCooldownMs, (value) => {
    blobFailureCooldownMs = value;
  }), bindRuntimeValue(runtime2, "initializeAssetStorage", () => initializeAssetStorage, (value) => {
    initializeAssetStorage = value;
  }), () => {
    maxImageUploadBytes = 2097152, maxStoredImageBytes = 1572864, maxStoredImageEdge = 2560, downsampleStoredImage = (input) => (0, runtime2.downsampleImageToBlob)(input, {
      maxEdge: maxStoredImageEdge,
      maxBytes: maxStoredImageBytes
    }), blobCacheBytes = 0, maxBlobCacheBytes = 50331648, blobFailureCooldownMs = 3e4, initializeAssetStorage = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmulatorDetection)(), (0, runtime2.initializeImageDownsampling)(), storedBlobPattern = /^\/?_blob\/[0-9a-f]{32}$/, allowedImageMimeTypes = [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/svg+xml"
      ], blobFetchPromises = /* @__PURE__ */ new Map(), blobObjectUrls = /* @__PURE__ */ new Map(), blobCacheByteSizes = /* @__PURE__ */ new Map(), recentBlobFetchFailures = /* @__PURE__ */ new Map();
    });
  };
}
export {
  installMediaAssets
};
