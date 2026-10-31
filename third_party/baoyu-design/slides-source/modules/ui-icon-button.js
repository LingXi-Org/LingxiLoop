// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiIconButton(runtime2) {
  var IconButtonJsx, initializeIconButton;
  return bindRuntimeValue(runtime2, "IconButtonJsx", () => IconButtonJsx, (value) => {
    IconButtonJsx = value;
  }), bindRuntimeValue(runtime2, "initializeIconButton", () => initializeIconButton, (value) => {
    initializeIconButton = value;
  }), () => {
    initializeIconButton = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeTooltipWrapper)(), IconButtonJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiIconButton
};
