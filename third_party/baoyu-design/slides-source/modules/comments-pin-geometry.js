// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsPinGeometry(runtime2) {
  var COMMENT_PIN_SIZE, COMMENT_PIN_HOTSPOT, COMMENT_PIN_PATH, COMMENT_PIN_FILL, COMMENT_PIN_STROKE, COMMENT_PIN_STROKE_WIDTH, encodedCommentPinSvg, COMMENT_MODE_CURSOR;
  return bindRuntimeValue(runtime2, "COMMENT_PIN_SIZE", () => COMMENT_PIN_SIZE, (value) => {
    COMMENT_PIN_SIZE = value;
  }), bindRuntimeValue(runtime2, "COMMENT_PIN_HOTSPOT", () => COMMENT_PIN_HOTSPOT, (value) => {
    COMMENT_PIN_HOTSPOT = value;
  }), bindRuntimeValue(runtime2, "COMMENT_PIN_PATH", () => COMMENT_PIN_PATH, (value) => {
    COMMENT_PIN_PATH = value;
  }), bindRuntimeValue(runtime2, "COMMENT_PIN_FILL", () => COMMENT_PIN_FILL, (value) => {
    COMMENT_PIN_FILL = value;
  }), bindRuntimeValue(runtime2, "COMMENT_PIN_STROKE", () => COMMENT_PIN_STROKE, (value) => {
    COMMENT_PIN_STROKE = value;
  }), bindRuntimeValue(runtime2, "COMMENT_PIN_STROKE_WIDTH", () => COMMENT_PIN_STROKE_WIDTH, (value) => {
    COMMENT_PIN_STROKE_WIDTH = value;
  }), bindRuntimeValue(runtime2, "encodedCommentPinSvg", () => encodedCommentPinSvg, (value) => {
    encodedCommentPinSvg = value;
  }), bindRuntimeValue(runtime2, "COMMENT_MODE_CURSOR", () => COMMENT_MODE_CURSOR, (value) => {
    COMMENT_MODE_CURSOR = value;
  }), () => {
    COMMENT_PIN_SIZE = 28, COMMENT_PIN_HOTSPOT = {
      x: 2,
      y: 2
    }, COMMENT_PIN_PATH = "M 2 2 L 2 14 A 12 12 0 1 0 14 2 Z", COMMENT_PIN_FILL = "#000", COMMENT_PIN_STROKE = "#fff", COMMENT_PIN_STROKE_WIDTH = 2, encodedCommentPinSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M 2 2 L 2 14 A 12 12 0 1 0 14 2 Z' fill='#000' stroke='#fff' stroke-width='2'/></svg>".replace(/[ '<>#]/g, (input) => "%" + input.charCodeAt(0).toString(16).toUpperCase()), COMMENT_MODE_CURSOR = `url("data:image/svg+xml,${encodedCommentPinSvg}") ${COMMENT_PIN_HOTSPOT.x} ${COMMENT_PIN_HOTSPOT.y}, crosshair`;
  };
}
export {
  installCommentsPinGeometry
};
