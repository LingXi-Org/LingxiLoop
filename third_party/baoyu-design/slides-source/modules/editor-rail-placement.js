// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorRailPlacement(runtime2) {
  var ReactRailPlacement, RAIL_LEFT_MIN_VIEWPORT_WIDTH, RAIL_LEFT_COLUMN_WIDTH, RAIL_FOOT_GAP, RAIL_BOTTOM_HEIGHT, RAIL_PLACEMENT_FOOT_HEIGHT, RAIL_PLACEMENT_SIDE_PAD, RAIL_PLACEMENT_TOP_HEIGHT, RAIL_PLACEMENT_HYSTERESIS, fittedSlideWidth, subscribeViewportResize;
  function slideWidthForRailPlacement(placement, width, height2) {
    return placement === "left" ? fittedSlideWidth(width - RAIL_LEFT_COLUMN_WIDTH, height2 - RAIL_PLACEMENT_TOP_HEIGHT - RAIL_PLACEMENT_FOOT_HEIGHT) : fittedSlideWidth(width, height2 - RAIL_PLACEMENT_TOP_HEIGHT - RAIL_BOTTOM_HEIGHT - RAIL_PLACEMENT_FOOT_HEIGHT);
  }
  function railPlacementAdvantage(width, height2) {
    return slideWidthForRailPlacement("left", width, height2) - slideWidthForRailPlacement("bottom", width, height2);
  }
  function chooseRailPlacement(previous, width, height2) {
    if (width < RAIL_LEFT_MIN_VIEWPORT_WIDTH)
      return "bottom";
    let advantage = railPlacementAdvantage(width, height2);
    return advantage >= RAIL_PLACEMENT_HYSTERESIS ? "left" : advantage <= -RAIL_PLACEMENT_HYSTERESIS ? "bottom" : previous ?? (advantage >= 0 ? "left" : "bottom");
  }
  function useRailPlacement(forceBottom) {
    let previousRef = ReactRailPlacement.useRef(null), getSnapshot2 = ReactRailPlacement.useCallback(() => forceBottom ? "bottom" : previousRef.current = chooseRailPlacement(previousRef.current, window.innerWidth, window.innerHeight), [forceBottom]);
    return ReactRailPlacement.useSyncExternalStore(subscribeViewportResize, getSnapshot2, () => "bottom");
  }
  return bindRuntimeValue(runtime2, "ReactRailPlacement", () => ReactRailPlacement, (value) => {
    ReactRailPlacement = value;
  }), bindRuntimeValue(runtime2, "RAIL_LEFT_MIN_VIEWPORT_WIDTH", () => RAIL_LEFT_MIN_VIEWPORT_WIDTH, (value) => {
    RAIL_LEFT_MIN_VIEWPORT_WIDTH = value;
  }), bindRuntimeValue(runtime2, "RAIL_LEFT_COLUMN_WIDTH", () => RAIL_LEFT_COLUMN_WIDTH, (value) => {
    RAIL_LEFT_COLUMN_WIDTH = value;
  }), bindRuntimeValue(runtime2, "RAIL_FOOT_GAP", () => RAIL_FOOT_GAP, (value) => {
    RAIL_FOOT_GAP = value;
  }), bindRuntimeValue(runtime2, "RAIL_BOTTOM_HEIGHT", () => RAIL_BOTTOM_HEIGHT, (value) => {
    RAIL_BOTTOM_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "RAIL_PLACEMENT_FOOT_HEIGHT", () => RAIL_PLACEMENT_FOOT_HEIGHT, (value) => {
    RAIL_PLACEMENT_FOOT_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "RAIL_PLACEMENT_SIDE_PAD", () => RAIL_PLACEMENT_SIDE_PAD, (value) => {
    RAIL_PLACEMENT_SIDE_PAD = value;
  }), bindRuntimeValue(runtime2, "RAIL_PLACEMENT_TOP_HEIGHT", () => RAIL_PLACEMENT_TOP_HEIGHT, (value) => {
    RAIL_PLACEMENT_TOP_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "RAIL_PLACEMENT_HYSTERESIS", () => RAIL_PLACEMENT_HYSTERESIS, (value) => {
    RAIL_PLACEMENT_HYSTERESIS = value;
  }), bindRuntimeValue(runtime2, "fittedSlideWidth", () => fittedSlideWidth, (value) => {
    fittedSlideWidth = value;
  }), bindRuntimeValue(runtime2, "slideWidthForRailPlacement", () => slideWidthForRailPlacement), bindRuntimeValue(runtime2, "railPlacementAdvantage", () => railPlacementAdvantage), bindRuntimeValue(runtime2, "chooseRailPlacement", () => chooseRailPlacement), bindRuntimeValue(runtime2, "subscribeViewportResize", () => subscribeViewportResize, (value) => {
    subscribeViewportResize = value;
  }), bindRuntimeValue(runtime2, "useRailPlacement", () => useRailPlacement), () => {
    ReactRailPlacement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideModel)(), RAIL_LEFT_MIN_VIEWPORT_WIDTH = 640, RAIL_LEFT_COLUMN_WIDTH = 4 * Number(runtime2.RAIL_COLUMN_WIDTH_CLASS.slice(2)), RAIL_FOOT_GAP = 24, RAIL_BOTTOM_HEIGHT = 67 + runtime2.MIN_RAIL_THUMB_WIDTH * runtime2.SLIDE_HEIGHT / runtime2.SLIDE_WIDTH, RAIL_PLACEMENT_FOOT_HEIGHT = 56, RAIL_PLACEMENT_SIDE_PAD = 12, RAIL_PLACEMENT_TOP_HEIGHT = 60, RAIL_PLACEMENT_HYSTERESIS = 16, fittedSlideWidth = (width, height2) => Math.min((0, runtime2.fitSlideEditorViewport)({
      w: width,
      h: height2,
      sidePad: RAIL_PLACEMENT_SIDE_PAD
    }).scale * runtime2.SLIDE_WIDTH, Math.max(0, height2 * runtime2.SLIDE_WIDTH / runtime2.SLIDE_HEIGHT)), subscribeViewportResize = (listener) => (window.addEventListener("resize", listener), () => window.removeEventListener("resize", listener));
  };
}
export {
  installEditorRailPlacement
};
