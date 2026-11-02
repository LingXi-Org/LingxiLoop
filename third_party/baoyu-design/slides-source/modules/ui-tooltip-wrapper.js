// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiTooltipWrapper(runtime2) {
  var TooltipWrapperJsx, initializeTooltipWrapper;
  function TooltipWrapper({ tip, shortcut, side: side2 = "top", align: align2 = "center", wrap = !1, delay, className, children }) {
    return TooltipWrapperJsx.jsx(runtime2.Tooltip, {
      content: tip,
      shortcut,
      side: side2,
      align: align2 === "right" ? "end" : align2 === "left" ? "start" : "center",
      multiline: wrap,
      delay,
      hoverable: !1,
      children: TooltipWrapperJsx.jsx("span", {
        "data-tip": typeof tip == "string" ? tip : void 0,
        className: (0, runtime2.joinClassNames)("relative inline-flex align-top", className),
        children
      })
    });
  }
  return bindRuntimeValue(runtime2, "TooltipWrapper", () => TooltipWrapper), bindRuntimeValue(runtime2, "TooltipWrapperJsx", () => TooltipWrapperJsx, (value) => {
    TooltipWrapperJsx = value;
  }), bindRuntimeValue(runtime2, "initializeTooltipWrapper", () => initializeTooltipWrapper, (value) => {
    initializeTooltipWrapper = value;
  }), () => {
    initializeTooltipWrapper = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), TooltipWrapperJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiTooltipWrapper
};
