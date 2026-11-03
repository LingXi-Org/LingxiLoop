// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBridgeBottomToolbar(runtime2) {
  var ReactBottomToolbar, BOTTOM_TOOLBAR_FLAG, syncAnswer, lateAnswer, lateLayout;
  function readBottomToolbarFlagNow() {
    return syncAnswer === void 0 && (syncAnswer = (0, runtime2.getFeatureFlag)(BOTTOM_TOOLBAR_FLAG, !1), syncAnswer || (lateAnswer = (0, runtime2.getFeatureFlagAsync)(BOTTOM_TOOLBAR_FLAG, !1))), syncAnswer;
  }
  function useBottomToolbarLayout(busy) {
    let onNow = readBottomToolbarFlagNow(), [lateOn, setLateOn] = ReactBottomToolbar.useState(() => lateLayout === !0), busyRef = ReactBottomToolbar.useRef(busy);
    return busyRef.current = busy, ReactBottomToolbar.useEffect(() => {
      if (onNow || lateAnswer === void 0 || lateLayout !== void 0)
        return;
      let live = !0;
      return lateAnswer.then((on) => {
        !live || lateLayout !== void 0 || (lateLayout = on && !busyRef.current(), on && !lateLayout && console.debug("slides: the " + BOTTOM_TOOLBAR_FLAG + " flag answered on after the page had drawn, while someone was editing, presenting or using the controls it moves; this load keeps the old layout"), lateLayout && setLateOn(!0));
      }), () => {
        live = !1;
      };
    }, [onNow]), onNow || lateOn;
  }
  return bindRuntimeValue(runtime2, "ReactBottomToolbar", () => ReactBottomToolbar, (value) => {
    ReactBottomToolbar = value;
  }), bindRuntimeValue(runtime2, "BOTTOM_TOOLBAR_FLAG", () => BOTTOM_TOOLBAR_FLAG, (value) => {
    BOTTOM_TOOLBAR_FLAG = value;
  }), bindRuntimeValue(runtime2, "readBottomToolbarFlagNow", () => readBottomToolbarFlagNow), bindRuntimeValue(runtime2, "useBottomToolbarLayout", () => useBottomToolbarLayout), () => {
    ReactBottomToolbar = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), BOTTOM_TOOLBAR_FLAG = "appifact_bottom_toolbar";
  };
}
export {
  installBridgeBottomToolbar
};
