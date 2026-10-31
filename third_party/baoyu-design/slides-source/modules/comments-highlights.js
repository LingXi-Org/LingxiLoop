// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsHighlights(runtime2) {
  var CommentHighlightsJsx;
  function CommentTargetHighlight({ rect }) {
    return CommentHighlightsJsx.jsx("div", {
      "aria-hidden": !0,
      className: "pointer-events-none absolute rounded-sm border-[1.5px] border-editor-comment-target",
      style: rect
    });
  }
  function CommentKeyHighlight({ rect }) {
    return CommentHighlightsJsx.jsx("div", {
      "aria-hidden": !0,
      "data-testid": "comment-key-ring",
      className: "pointer-events-none absolute rounded-sm border-2 border-editor-comment-target",
      style: {
        ...rect,
        boxShadow: "0 0 0 2px #fff"
      }
    });
  }
  function CommentKeyPin({ at }) {
    return CommentHighlightsJsx.jsx(runtime2.CommentPin, {
      "data-testid": "comment-key-pin",
      at
    });
  }
  return bindRuntimeValue(runtime2, "CommentHighlightsJsx", () => CommentHighlightsJsx, (value) => {
    CommentHighlightsJsx = value;
  }), bindRuntimeValue(runtime2, "CommentTargetHighlight", () => CommentTargetHighlight), bindRuntimeValue(runtime2, "CommentKeyHighlight", () => CommentKeyHighlight), bindRuntimeValue(runtime2, "CommentKeyPin", () => CommentKeyPin), () => {
    CommentHighlightsJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installCommentsHighlights
};
