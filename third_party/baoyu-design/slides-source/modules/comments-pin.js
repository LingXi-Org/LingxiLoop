// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsPin(runtime2) {
  var CommentPinJsx, offsetCommentPinCoordinate;
  function CommentPin({ at, className, "data-testid": dataTestid }) {
    return CommentPinJsx.jsx("svg", {
      "aria-hidden": !0,
      "data-testid": dataTestid,
      className: (0, runtime2.joinClassNames)("pointer-events-none absolute", className),
      width: runtime2.COMMENT_PIN_SIZE,
      height: runtime2.COMMENT_PIN_SIZE,
      viewBox: `0 0 ${runtime2.COMMENT_PIN_SIZE} ${runtime2.COMMENT_PIN_SIZE}`,
      style: {
        left: offsetCommentPinCoordinate(at.x, runtime2.COMMENT_PIN_HOTSPOT.x),
        top: offsetCommentPinCoordinate(at.y, runtime2.COMMENT_PIN_HOTSPOT.y)
      },
      children: CommentPinJsx.jsx("path", {
        d: runtime2.COMMENT_PIN_PATH,
        fill: runtime2.COMMENT_PIN_FILL,
        stroke: runtime2.COMMENT_PIN_STROKE,
        strokeWidth: runtime2.COMMENT_PIN_STROKE_WIDTH
      })
    });
  }
  return bindRuntimeValue(runtime2, "CommentPinJsx", () => CommentPinJsx, (value) => {
    CommentPinJsx = value;
  }), bindRuntimeValue(runtime2, "offsetCommentPinCoordinate", () => offsetCommentPinCoordinate, (value) => {
    offsetCommentPinCoordinate = value;
  }), bindRuntimeValue(runtime2, "CommentPin", () => CommentPin), () => {
    CommentPinJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), offsetCommentPinCoordinate = (coordinate, offset4) => typeof coordinate == "number" ? coordinate - offset4 : `calc(${coordinate} - ${offset4}px)`;
  };
}
export {
  installCommentsPin
};
