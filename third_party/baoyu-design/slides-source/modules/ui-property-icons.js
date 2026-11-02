// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyIcons(runtime2) {
  var jsxq20, initializeUiPropertyIcons;
  function joinClassNames(...input) {
    return input.filter(Boolean).join(" ");
  }
  function KitIcon({ name, size: size4 = 14, className, style }) {
    return jsxq20.jsx(runtime2.Icon, {
      name,
      customSize: size4,
      className: joinClassNames("shrink-0", className),
      style: {
        display: "inline-flex",
        ...style
      }
    });
  }
  function ZoomInIcon() {
    return jsxq20.jsx(runtime2.Icon, {
      name: "ZoomIn",
      size: "auto",
      className: "shrink-0"
    });
  }
  return bindRuntimeValue(runtime2, "joinClassNames", () => joinClassNames), bindRuntimeValue(runtime2, "KitIcon", () => KitIcon), bindRuntimeValue(runtime2, "ZoomInIcon", () => ZoomInIcon), bindRuntimeValue(runtime2, "jsxq20", () => jsxq20, (value) => {
    jsxq20 = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyIcons", () => initializeUiPropertyIcons, (value) => {
    initializeUiPropertyIcons = value;
  }), () => {
    initializeUiPropertyIcons = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), jsxq20 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiPropertyIcons
};
