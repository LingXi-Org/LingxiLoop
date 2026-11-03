// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsKeyboard(runtime2) {
  var SCROLLED_OUT_COMMENT_TARGET_MESSAGE, DEFAULT_COMMENT_POINT_INSET;
  function defaultCommentPoint(rect, inset = DEFAULT_COMMENT_POINT_INSET) {
    let value = Math.max(0, rect.width), value2 = Math.max(0, rect.height), value3 = Math.min(inset, value / 4, value2 / 4), value4 = rect.left + value - value3, value5 = rect.top + value3;
    return {
      x: value4,
      y: value5,
      fx: value > 0 ? (value4 - rect.left) / value : 0.5,
      fy: value2 > 0 ? (value5 - rect.top) / value2 : 0.5
    };
  }
  function formatCommentTargetLabel(label) {
    return (0, runtime2.formatMessage)({
      defaultMessage: "评论{where}",
      id: "naEZOG/TQ1"
    }, {
      where: label
    });
  }
  function commentKeyboardInstructions(targetKind, multipleSlides = !1) {
    return targetKind === "element" ? (0, runtime2.formatMessage)({
      defaultMessage: "Enter 或空格可评论此处；Esc 退出评论模式",
      id : "q7gLSGqawF"
    }) : multipleSlides ? targetKind === "canvas-slide" ? (0, runtime2.formatMessage)({
      defaultMessage: "Enter 或空格可评论此页；Tab 移到下一页；Esc 退出评论模式",
      id: "6nzdaFrxaS"
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "Enter 或空格可评论此页；Tab 移到页内对象；Esc 退出评论模式",
      id: "cBjnIu66V7"
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "Enter 或空格可评论此页；Esc 退出评论模式",
      id : "GaOYJC3W16"
    });
  }
  function isCommentKeyboardTarget(event) {
    return event.target instanceof Element && event.target.hasAttribute("data-slides-comment-target");
  }
  return bindRuntimeValue(runtime2, "DEFAULT_COMMENT_POINT_INSET", () => DEFAULT_COMMENT_POINT_INSET), bindRuntimeValue(runtime2, "defaultCommentPoint", () => defaultCommentPoint), bindRuntimeValue(runtime2, "formatCommentTargetLabel", () => formatCommentTargetLabel), bindRuntimeValue(runtime2, "commentKeyboardInstructions", () => commentKeyboardInstructions), bindRuntimeValue(runtime2, "isCommentKeyboardTarget", () => isCommentKeyboardTarget), bindRuntimeValue(runtime2, "SCROLLED_OUT_COMMENT_TARGET_MESSAGE", () => SCROLLED_OUT_COMMENT_TARGET_MESSAGE, (value) => {
    SCROLLED_OUT_COMMENT_TARGET_MESSAGE = value;
  }), () => {
    DEFAULT_COMMENT_POINT_INSET = 16,
    SCROLLED_OUT_COMMENT_TARGET_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页已滚出视图；缩小或滚动回来即可评论；Esc 退出评论模式",
      id: "uxQtrv2esx"
    });
  };
}
export {
  installCommentsKeyboard
};
