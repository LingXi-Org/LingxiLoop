// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installRenderingSlideSnapshots(runtime2) {
  var SlideSnapshotReact, slideSnapshotsEnabledContext, slideSnapshotMaxSide, slideSnapshotMaxEntryLength, slideSnapshotCacheLimit, slideSnapshotPngPrefix, slideSnapshotReadyPollMs, slideSnapshotReadyTimeoutMs, slideSnapshotSettleMs, slideSnapshotCache, slideSnapshotCacheLength, slideSnapshotSubscribers, hasSlideSnapshot, initializeSlideSnapshots;
  function isBlankSnapshot(image) {
    let pixels = image.pixels;
    for (let index4 = 4; index4 < pixels.length; index4 += 4)
      if (!(pixels[index4 + 3] === 0 && pixels[3] === 0) && (pixels[index4] !== pixels[0] || pixels[index4 + 1] !== pixels[1] || pixels[index4 + 2] !== pixels[2] || pixels[index4 + 3] !== pixels[3]))
        return !1;
    return !0;
  }
  function snapshotToDataUrl(image) {
    let canvas = document.createElement("canvas");
    canvas.width = image.width, canvas.height = image.height;
    let context = canvas.getContext("2d");
    if (context === null)
      return;
    let data = context.createImageData(image.width, image.height);
    return data.data.set(image.pixels), context.putImageData(data, 0, 0), canvas.toDataURL("image/png");
  }
  function snapshotCacheKey(html, size4) {
    return String(Math.round(size4.w)) + "x" + String(Math.round(size4.h)) + `
` + html;
  }
  function snapshotCaptureSize(size4) {
    let scale = Math.min(1, slideSnapshotMaxSide / Math.max(1, size4.w, size4.h));
    return {
      w: Math.max(1, Math.round(size4.w * scale)),
      h: Math.max(1, Math.round(size4.h * scale))
    };
  }
  function storeSlideSnapshot(html, size4, dataUrl) {
    if (!dataUrl.startsWith(slideSnapshotPngPrefix) || dataUrl.length > slideSnapshotMaxEntryLength)
      return;
    let key = snapshotCacheKey(html, size4);
    slideSnapshotCacheLength += dataUrl.length - (slideSnapshotCache.get(key)?.length ?? 0), slideSnapshotCache.delete(key), slideSnapshotCache.set(key, dataUrl);
    for (let [oldKey, oldUrl] of slideSnapshotCache) {
      if (slideSnapshotCacheLength <= slideSnapshotCacheLimit)
        break;
      slideSnapshotCache.delete(oldKey), slideSnapshotCacheLength -= oldUrl.length;
    }
    for (let listener of [...slideSnapshotSubscribers])
      listener();
  }
  function subscribeSlideSnapshots(listener) {
    return slideSnapshotSubscribers.add(listener), () => void slideSnapshotSubscribers.delete(listener);
  }
  function useSlideSnapshot(html, size4) {
    let enabled = SlideSnapshotReact.useContext(slideSnapshotsEnabledContext), width = size4?.w, height2 = size4?.h, key = SlideSnapshotReact.useMemo(() => enabled && width !== void 0 && height2 !== void 0 ? snapshotCacheKey(html, { w: width, h: height2 }) : void 0, [enabled, html, width, height2]);
    return SlideSnapshotReact.useSyncExternalStore(subscribeSlideSnapshots, () => key === void 0 ? void 0 : slideSnapshotCache.get(key), () => {
    });
  }
  function captureSlideSnapshot(host, html, size4, done) {
    let cancelled = !1, timeout, deadline = Date.now() + slideSnapshotReadyTimeoutMs, captureSize = snapshotCaptureSize(size4), capture = () => {
      host.render(0, {}, captureSize.w, captureSize.h).then((image) => {
        try {
          done(), !cancelled && image !== null && !isBlankSnapshot(image) && storeSlideSnapshot(html, size4, snapshotToDataUrl(image) ?? "");
        } catch {
        }
      });
    }, waitReady = () => {
      host.ready ? timeout = setTimeout(capture, slideSnapshotSettleMs) : Date.now() < deadline && (timeout = setTimeout(waitReady, slideSnapshotReadyPollMs));
    };
    return waitReady(), () => {
      cancelled = !0, clearTimeout(timeout);
    };
  }
  return bindRuntimeValue(runtime2, "isBlankSnapshot", () => isBlankSnapshot), bindRuntimeValue(runtime2, "snapshotToDataUrl", () => snapshotToDataUrl), bindRuntimeValue(runtime2, "snapshotCacheKey", () => snapshotCacheKey), bindRuntimeValue(runtime2, "snapshotCaptureSize", () => snapshotCaptureSize), bindRuntimeValue(runtime2, "storeSlideSnapshot", () => storeSlideSnapshot), bindRuntimeValue(runtime2, "subscribeSlideSnapshots", () => subscribeSlideSnapshots), bindRuntimeValue(runtime2, "useSlideSnapshot", () => useSlideSnapshot), bindRuntimeValue(runtime2, "captureSlideSnapshot", () => captureSlideSnapshot), bindRuntimeValue(runtime2, "SlideSnapshotReact", () => SlideSnapshotReact, (value) => {
    SlideSnapshotReact = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotsEnabledContext", () => slideSnapshotsEnabledContext, (value) => {
    slideSnapshotsEnabledContext = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotMaxSide", () => slideSnapshotMaxSide, (value) => {
    slideSnapshotMaxSide = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotMaxEntryLength", () => slideSnapshotMaxEntryLength, (value) => {
    slideSnapshotMaxEntryLength = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotCacheLimit", () => slideSnapshotCacheLimit, (value) => {
    slideSnapshotCacheLimit = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotPngPrefix", () => slideSnapshotPngPrefix, (value) => {
    slideSnapshotPngPrefix = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotReadyPollMs", () => slideSnapshotReadyPollMs, (value) => {
    slideSnapshotReadyPollMs = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotReadyTimeoutMs", () => slideSnapshotReadyTimeoutMs, (value) => {
    slideSnapshotReadyTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotSettleMs", () => slideSnapshotSettleMs, (value) => {
    slideSnapshotSettleMs = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotCache", () => slideSnapshotCache, (value) => {
    slideSnapshotCache = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotCacheLength", () => slideSnapshotCacheLength, (value) => {
    slideSnapshotCacheLength = value;
  }), bindRuntimeValue(runtime2, "slideSnapshotSubscribers", () => slideSnapshotSubscribers, (value) => {
    slideSnapshotSubscribers = value;
  }), bindRuntimeValue(runtime2, "hasSlideSnapshot", () => hasSlideSnapshot, (value) => {
    hasSlideSnapshot = value;
  }), bindRuntimeValue(runtime2, "initializeSlideSnapshots", () => initializeSlideSnapshots, (value) => {
    initializeSlideSnapshots = value;
  }), () => {
    slideSnapshotMaxSide = 960, slideSnapshotMaxEntryLength = 4194304, slideSnapshotCacheLimit = 33554432, slideSnapshotPngPrefix = "data:image/png;base64,", slideSnapshotReadyPollMs = 50, slideSnapshotReadyTimeoutMs = 3e3, slideSnapshotSettleMs = 700, slideSnapshotCacheLength = 0, hasSlideSnapshot = (html, size4) => slideSnapshotCache.has(snapshotCacheKey(html, size4)), initializeSlideSnapshots = (0, runtime2.initializeOnce)(() => {
      SlideSnapshotReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), slideSnapshotsEnabledContext = SlideSnapshotReact.createContext(!1), slideSnapshotCache = /* @__PURE__ */ new Map(), slideSnapshotSubscribers = /* @__PURE__ */ new Set();
    });
  };
}
export {
  installRenderingSlideSnapshots
};
