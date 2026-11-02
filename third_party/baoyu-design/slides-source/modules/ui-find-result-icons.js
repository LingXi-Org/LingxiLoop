// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiFindResultIcons(runtime2) {
  var jsxfo0, findResultIcon, textFindResultIcon, frameFindResultIcon;
  return bindRuntimeValue(runtime2, "jsxfo0", () => jsxfo0, (value) => {
    jsxfo0 = value;
  }), bindRuntimeValue(runtime2, "findResultIcon", () => findResultIcon, (value) => {
    findResultIcon = value;
  }), bindRuntimeValue(runtime2, "textFindResultIcon", () => textFindResultIcon, (value) => {
    textFindResultIcon = value;
  }), bindRuntimeValue(runtime2, "frameFindResultIcon", () => frameFindResultIcon, (value) => {
    frameFindResultIcon = value;
  }), () => {
    (0, runtime2.initializeUiInputs210)(), jsxfo0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), findResultIcon = (name) => jsxfo0.jsx(runtime2.Icon, {
      name,
      size: "auto",
      className: "shrink-0"
    }), textFindResultIcon = findResultIcon("TextT"), frameFindResultIcon = findResultIcon("FrameHash");
  };
}
export {
  installUiFindResultIcons
};
