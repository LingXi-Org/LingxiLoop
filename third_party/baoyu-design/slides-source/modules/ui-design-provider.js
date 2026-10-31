// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiDesignProvider(runtime2) {
  var jsxgp0, reactAl, reactDOMvT_, jsxfp0, reactPl, ICON_SET_FLAG, DEFAULT_EXPERIMENTAL_PARTS, ICON_EXPERIMENTAL_PARTS, jsxTl;
  async function experimentalIconPartsAsync() {
    return await (0, runtime2.getFeatureFlagAsync)(ICON_SET_FLAG, !1) ? ICON_EXPERIMENTAL_PARTS : DEFAULT_EXPERIMENTAL_PARTS;
  }
  function experimentalIconParts() {
    return (0, runtime2.getFeatureFlag)(ICON_SET_FLAG, !1) ? ICON_EXPERIMENTAL_PARTS : DEFAULT_EXPERIMENTAL_PARTS;
  }
  function useExperimentalIconParts() {
    let [value, value2] = reactPl.useState(experimentalIconParts);
    return reactPl.useEffect(() => {
      let flag = !0;
      return experimentalIconPartsAsync().then((input) => {
        flag && value2(input);
      }), () => {
        flag = !1;
      };
    }, []), value;
  }
  function AppDesignProvider({ children }) {
    let value = useExperimentalIconParts();
    return jsxTl.jsx(runtime2.CdsRoot, {
      density: runtime2.defaultDensity,
      font: "anthropic",
      className: "contents",
      experimental: {
        fizzyLake: {
          parts: value
        }
      },
      children: jsxTl.jsx(runtime2.TooltipImplementationProvider, {
        children: jsxTl.jsx(runtime2.ToastProvider, {
          viewportClassName: "bottom-[calc(1rem+var(--mc-foot-cover,0px))]",
          children
        })
      })
    });
  }
  return bindRuntimeValue(runtime2, "jsxgp0", () => jsxgp0, (value) => {
    jsxgp0 = value;
  }), bindRuntimeValue(runtime2, "reactAl", () => reactAl, (value) => {
    reactAl = value;
  }), bindRuntimeValue(runtime2, "reactDOMvT_", () => reactDOMvT_, (value) => {
    reactDOMvT_ = value;
  }), bindRuntimeValue(runtime2, "jsxfp0", () => jsxfp0, (value) => {
    jsxfp0 = value;
  }), bindRuntimeValue(runtime2, "reactPl", () => reactPl, (value) => {
    reactPl = value;
  }), bindRuntimeValue(runtime2, "ICON_SET_FLAG", () => ICON_SET_FLAG, (value) => {
    ICON_SET_FLAG = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_EXPERIMENTAL_PARTS", () => DEFAULT_EXPERIMENTAL_PARTS, (value) => {
    DEFAULT_EXPERIMENTAL_PARTS = value;
  }), bindRuntimeValue(runtime2, "ICON_EXPERIMENTAL_PARTS", () => ICON_EXPERIMENTAL_PARTS, (value) => {
    ICON_EXPERIMENTAL_PARTS = value;
  }), bindRuntimeValue(runtime2, "experimentalIconPartsAsync", () => experimentalIconPartsAsync), bindRuntimeValue(runtime2, "experimentalIconParts", () => experimentalIconParts), bindRuntimeValue(runtime2, "useExperimentalIconParts", () => useExperimentalIconParts), bindRuntimeValue(runtime2, "jsxTl", () => jsxTl, (value) => {
    jsxTl = value;
  }), bindRuntimeValue(runtime2, "AppDesignProvider", () => AppDesignProvider), () => {
    (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiContrastControls)(), (0, runtime2.initializeColorSelect)(), (0, runtime2.initializeIconButton)(), (0, runtime2.initializeUiPropertySearch)(), jsxgp0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactAl = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMvT_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), jsxfp0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiInputs210)(), reactPl = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ICON_SET_FLAG = "appifact_icon_set", DEFAULT_EXPERIMENTAL_PARTS = [], ICON_EXPERIMENTAL_PARTS = ["icons"], jsxTl = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiDesignProvider
};
