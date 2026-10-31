// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsKeyboard(runtime2) {
  var SCROLLED_OUT_COMMENT_TARGET_MESSAGE;
  function defaultCommentPoint(rect, inset = 16) {
    let value = Math.max(0, rect.width), value2 = Math.max(0, rect.height), value3 = Math.min(inset, value / 4, value2 / 4), value4 = rect.left + value - value3, value5 = rect.top + value3;
    return {
      x: value4,
      y: value5,
      fx: value > 0 ? (value4 - rect.left) / value : 0.5,
      fy: value2 > 0 ? (value5 - rect.top) / value2 : 0.5
    };
  }
  function formatCommentTargetLabel(label) {
    return "Comment on " + label;
  }
  function commentKeyboardInstructions(targetKind, multipleSlides = !1) {
    return targetKind === "canvas-slide" ? "Enter or Space comments on this slide;" + (multipleSlides ? " Tab moves to the next slide;" : "") + " Escape leaves comment mode" : targetKind === "slide" ? "Enter or Space comments on this slide;" + (multipleSlides ? " Tab moves to the things on it;" : "") + " Escape leaves comment mode" : "Enter or Space comments on this; Escape leaves comment mode";
  }
  function isCommentKeyboardTarget(event) {
    return event.target instanceof Element && event.target.hasAttribute("data-slides-comment-target");
  }
  return bindRuntimeValue(runtime2, "defaultCommentPoint", () => defaultCommentPoint), bindRuntimeValue(runtime2, "formatCommentTargetLabel", () => formatCommentTargetLabel), bindRuntimeValue(runtime2, "commentKeyboardInstructions", () => commentKeyboardInstructions), bindRuntimeValue(runtime2, "isCommentKeyboardTarget", () => isCommentKeyboardTarget), bindRuntimeValue(runtime2, "SCROLLED_OUT_COMMENT_TARGET_MESSAGE", () => SCROLLED_OUT_COMMENT_TARGET_MESSAGE, (value) => {
    SCROLLED_OUT_COMMENT_TARGET_MESSAGE = value;
  }), () => {
    SCROLLED_OUT_COMMENT_TARGET_MESSAGE = "This slide is scrolled out of view; zoom out or scroll back to comment on it; Escape leaves comment mode";
  };
}
export {
  installCommentsKeyboard
};
