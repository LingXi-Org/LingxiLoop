// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsComposer(runtime2) {
  var lastCommentCompositionAt, elapsedSinceCommentComposition, commentAnchorController;
  function setCommentAnchorController(controller) {
    commentAnchorController = controller;
  }
  function getCommentAnchorController() {
    return commentAnchorController;
  }
  function composeFrameComment(anchor, element, label, detail) {
    let controller = commentAnchorController;
    if (!controller || !element.isConnected)
      return;
    let value = (0, runtime2.encodeSlideCommentAnchor)({
      ...anchor,
      fx: 0,
      fy: 0
    }) === null, bounds = (value ? element.closest("[data-frame-id]") ?? element : element).getBoundingClientRect(), value2 = Math.min(8, bounds.width / 2), value3 = Math.min(8, bounds.height / 2), value4 = Math.min(bounds.right - value2, Math.max(bounds.left + value2, label.x)), value5 = Math.min(bounds.bottom - value3, Math.max(bounds.top + value3, label.y)), state = {
      ...anchor,
      path: value ? [] : anchor.path
    }, value6 = (0, runtime2.encodeSlideCommentAnchor)({
      ...state,
      fx: (value4 - bounds.left) / (bounds.width || 1),
      fy: (value5 - bounds.top) / (bounds.height || 1)
    });
    value6 !== null && (lastCommentCompositionAt = performance.now(), controller.compose(value6, {
      x: value4 + window.scrollX,
      y: value5 + window.scrollY
    }, detail(state)).catch(() => {
    }));
  }
  return bindRuntimeValue(runtime2, "lastCommentCompositionAt", () => lastCommentCompositionAt, (value) => {
    lastCommentCompositionAt = value;
  }), bindRuntimeValue(runtime2, "elapsedSinceCommentComposition", () => elapsedSinceCommentComposition, (value) => {
    elapsedSinceCommentComposition = value;
  }), bindRuntimeValue(runtime2, "commentAnchorController", () => commentAnchorController, (value) => {
    commentAnchorController = value;
  }), bindRuntimeValue(runtime2, "setCommentAnchorController", () => setCommentAnchorController), bindRuntimeValue(runtime2, "getCommentAnchorController", () => getCommentAnchorController), bindRuntimeValue(runtime2, "composeFrameComment", () => composeFrameComment), () => {
    lastCommentCompositionAt = Number.NEGATIVE_INFINITY, elapsedSinceCommentComposition = () => performance.now() - lastCommentCompositionAt, commentAnchorController = null;
  };
}
export {
  installCommentsComposer
};
