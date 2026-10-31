// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsCapability(runtime2) {
  var supportsCommentComposer;
  function commentsAvailable() {
    return (0, runtime2.getHostCapability)("comments") !== void 0 || (0, runtime2.hasHostCapabilityLoader)();
  }
  async function openCommentComposer(element) {
    let comments = await (0, runtime2.getOrLoadHostCapability)("comments", supportsCommentComposer);
    if (comments === null)
      return !1;
    try {
      return (await comments.openComposer({
        element
      }))?.opened === !0;
    } catch {
      return !1;
    }
  }
  async function getCustomCommentAnchors(handlers) {
    let comments = await getCommentsCapability(), customAnchors = comments?.customAnchors;
    if (typeof customAnchors != "function")
      return null;
    try {
      let value = await customAnchors.call(comments, handlers);
      return value && typeof value.compose == "function" ? value : null;
    } catch {
      return null;
    }
  }
  async function getCommentsCapability() {
    let slidesHost = globalThis.slidesHost;
    if (typeof slidesHost?.comments?.customAnchors == "function" || typeof slidesHost?.use != "function")
      return slidesHost?.comments;
    try {
      let value = await slidesHost.use.call(slidesHost, "comments");
      return value?.available === !1 ? null : value;
    } catch {
      return null;
    }
  }
  return bindRuntimeValue(runtime2, "supportsCommentComposer", () => supportsCommentComposer, (value) => {
    supportsCommentComposer = value;
  }), bindRuntimeValue(runtime2, "commentsAvailable", () => commentsAvailable), bindRuntimeValue(runtime2, "openCommentComposer", () => openCommentComposer), bindRuntimeValue(runtime2, "getCustomCommentAnchors", () => getCustomCommentAnchors), bindRuntimeValue(runtime2, "getCommentsCapability", () => getCommentsCapability), () => {
    (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeRichTextDom)(), supportsCommentComposer = (0, runtime2.capabilityHasMethod)("openComposer");
  };
}
export {
  installCommentsCapability
};
