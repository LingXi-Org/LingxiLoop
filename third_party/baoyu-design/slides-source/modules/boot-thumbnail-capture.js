// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBootThumbnailCapture(runtime2) {
  var THUMBNAIL_READY_ATTRIBUTE, BLANK_THUMBNAIL_ATTRIBUTE;
  function prepareSlidesThumbnailCapture(document2 = document) {
    if ((0, runtime2.detectCompiledPageStorageMode)(document2) === "db") {
      if (!(0, runtime2.isFrameCaptureMode)(document2))
        return waitForThumbnailResources(() => waitForThumbnailAssets(document2), document2);
      createBlankThumbnailOverlay(document2), markThumbnailReady(document2);
    }
  }
  function waitForThumbnailResources(wait = () => waitForThumbnailAssets(), document2 = document) {
    let ready2 = () => markThumbnailReady(document2);
    wait().then(ready2, ready2);
  }
  function markThumbnailReady(document2 = document) {
    document2.documentElement.setAttribute(THUMBNAIL_READY_ATTRIBUTE, "");
  }
  function createBlankThumbnailOverlay(document2) {
    if (document2.querySelector("[" + BLANK_THUMBNAIL_ATTRIBUTE + "]") !== null)
      return;
    for (let value of [document2.documentElement, document2.body])
      value.style.overflow = "hidden";
    let overlay = document2.createElement("div");
    overlay.setAttribute(BLANK_THUMBNAIL_ATTRIBUTE, ""), overlay.setAttribute("aria-hidden", "true"), overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:" + getThumbnailPageBackground(document2), document2.body.appendChild(overlay);
  }
  function getThumbnailPageBackground(document2) {
    let window2 = document2.defaultView;
    for (let value of [document2.body, document2.documentElement]) {
      let value2 = window2?.getComputedStyle(value).backgroundColor ?? "";
      if (value2 !== "" && value2 !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(value2))
        return value2;
    }
    return "#fff";
  }
  async function waitForThumbnailAssets(document2 = document) {
    await waitForSlidesRootContent(document2);
    let window2 = document2.defaultView, nextFrame = () => new Promise((input) => window2?.requestAnimationFrame ? window2.requestAnimationFrame(() => input()) : setTimeout(input, 16));
    await nextFrame(), await nextFrame(), await document2.fonts?.ready;
    let images = Array.from(document2.images).filter((input) => !(input.loading === "lazy" && !input.complete) && typeof input.decode == "function");
    await Promise.all(images.map((input) => input.decode().catch(() => {
    }))), await nextFrame();
  }
  function waitForSlidesRootContent(document2) {
    let root = document2.getElementById("root"), hasContent = () => root !== null && Array.from(root.children).some((input) => !input.hasAttribute("data-placeholder"));
    if (root === null || hasContent())
      return Promise.resolve();
    let Observer = document2.defaultView?.MutationObserver;
    return Observer === void 0 ? Promise.resolve() : new Promise((input) => {
      let value = new Observer(() => {
        hasContent() && (value.disconnect(), input());
      });
      value.observe(root, {
        childList: !0
      });
    });
  }
  return bindRuntimeValue(runtime2, "THUMBNAIL_READY_ATTRIBUTE", () => THUMBNAIL_READY_ATTRIBUTE, (value) => {
    THUMBNAIL_READY_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "BLANK_THUMBNAIL_ATTRIBUTE", () => BLANK_THUMBNAIL_ATTRIBUTE, (value) => {
    BLANK_THUMBNAIL_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "prepareSlidesThumbnailCapture", () => prepareSlidesThumbnailCapture), bindRuntimeValue(runtime2, "waitForThumbnailResources", () => waitForThumbnailResources), bindRuntimeValue(runtime2, "markThumbnailReady", () => markThumbnailReady), bindRuntimeValue(runtime2, "createBlankThumbnailOverlay", () => createBlankThumbnailOverlay), bindRuntimeValue(runtime2, "getThumbnailPageBackground", () => getThumbnailPageBackground), bindRuntimeValue(runtime2, "waitForThumbnailAssets", () => waitForThumbnailAssets), bindRuntimeValue(runtime2, "waitForSlidesRootContent", () => waitForSlidesRootContent), () => {
    (0, runtime2.initializeCompiledPage)(), THUMBNAIL_READY_ATTRIBUTE = "data-thumb-ready", BLANK_THUMBNAIL_ATTRIBUTE = "data-thumb-blank";
  };
}
export {
  installBootThumbnailCapture
};
