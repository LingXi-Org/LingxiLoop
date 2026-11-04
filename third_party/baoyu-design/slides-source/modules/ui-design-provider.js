// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiDesignProvider(runtime2) {
  var jsxgp0, reactAl, reactDOMvT_, jsxfp0, reactFizzyLake, FIZZY_LAKE_SHEET_PARTS, KIT_APPLIES_FIZZY_LAKE_ATTRIBUTE, ICON_SET_ON_WHEN_UNSET, reactIconSet, ICONS_FOR_EVERY_VIEWER, ICON_SET_FLAG, ICON_SET_ROLLOUT, isClaudeNativeApp, fizzyLakePartsSource, jsxTl, reactBottomToolbarFlag, BOTTOM_TOOLBAR_FLAG_KEY, readBottomToolbarFlag; function createIconSetGate({
    withoutValue,
    iconsForEveryViewer = ICONS_FOR_EVERY_VIEWER
  }) {
    let decide = () => {
      let flagOn = (0, runtime2.getFeatureFlag)(ICON_SET_FLAG, !1), unsetRollout = ICON_SET_ROLLOUT && withoutValue && (0, runtime2.featureFlagsReady)() && (0, runtime2.getFeatureFlag)(ICON_SET_FLAG, null) === null, nativeApp = isClaudeNativeApp();
      return {
        icons: iconsForEveryViewer || flagOn || unsetRollout && !nativeApp,
        sheets : (flagOn || unsetRollout) && !nativeApp
      };
  };
    return (0, runtime2.awaitFeatureFlagsReady)(), {
      ifSettled: decide,
      forViewer: async () => (await (0, runtime2.awaitFeatureFlagsReady)(), decide())
    };
  }
  function createFizzyLakePartsSource(sheetParts, withoutValue) {
    let gate = createIconSetGate({
      withoutValue
    }), byKey = /* @__PURE__ */ new Map(), partsFor = ({ icons, sheets }) => {
      let parts = [...icons ? ["icons"] : [], ...sheets ? sheetParts : []], key = parts.join(" "), cached = byKey.get(key);
      return cached !== void 0 ? cached : (byKey.set(key, parts), parts);
    };
    return {
      ifSettled: () => partsFor(gate.ifSettled()),
      forViewer : async () => partsFor(await gate.forViewer())
    };
  }
  function useFizzyLakePartsSource(source) {
    let [parts, setParts] = reactIconSet.useState(source.ifSettled);
    return reactIconSet.useEffect(() => {
      let live = !0;
      return source.forViewer().then((value) => {
        live && setParts(value);
      }), () => {
        live = !1;
      };
    }, [source]), parts;
  }
  function applyFizzyLakeAttribute(parts) {
    parts.length > 0 ? document.documentElement.setAttribute("data-cds-fizzy-lake", parts.join(" ")) : document.documentElement.removeAttribute("data-cds-fizzy-lake");
  }
  function useExperimentalIconParts() {
    let parts = useFizzyLakePartsSource(fizzyLakePartsSource);
    return reactFizzyLake.useLayoutEffect(() => {
      FIZZY_LAKE_SHEET_PARTS.length > 0 && !KIT_APPLIES_FIZZY_LAKE_ATTRIBUTE && applyFizzyLakeAttribute(parts);
    }, [parts]), parts;
  }
  function AppDesignProvider({ children }) {
    let value = useExperimentalIconParts();
    return jsxTl.jsx(runtime2.CdsRoot, {
      density: runtime2.defaultDensity,
      font: "anthropic",
      className: "contents",
      ...(0, runtime2.currentDesignKitI18n)(),
      experimental: {
        fizzyLake: {
          parts: value
        },
        densityOverride: value.includes("panels") ? "comfortable" : void 0
      },
      children: jsxTl.jsx(runtime2.TooltipImplementationProvider, {
        children: jsxTl.jsx(runtime2.ToastProvider, {
          viewportClassName: "bottom-[calc(1rem+var(--mc-foot-cover,0px))]",
          children
        })
      })
    });
  }
  function useBottomToolbarFlag() {
    let [on, setOn] = reactBottomToolbarFlag.useState(readBottomToolbarFlag);
    return reactBottomToolbarFlag.useEffect(() => {
      let live = !0;
      return (0, runtime2.getFeatureFlagAsync)(BOTTOM_TOOLBAR_FLAG_KEY, !1).then((value) => {
        live && value && setOn(!0);
      }), () => {
        live = !1;
      };
    }, []), on;
  }
  function useBottomToolbarChrome() {
    let on = useBottomToolbarFlag(), coarse = (0, runtime2.useCoarsePointer)();
    return on && !coarse;
  }
  return bindRuntimeValue(runtime2, "jsxgp0", () => jsxgp0, (value) => {
    jsxgp0 = value;
  }), bindRuntimeValue(runtime2, "reactAl", () => reactAl, (value) => {
    reactAl = value;
  }), bindRuntimeValue(runtime2, "reactDOMvT_", () => reactDOMvT_, (value) => {
    reactDOMvT_ = value;
  }), bindRuntimeValue(runtime2, "jsxfp0", () => jsxfp0, (value) => {
    jsxfp0 = value;
  }), bindRuntimeValue(runtime2, "reactFizzyLake", () => reactFizzyLake, (value) => {
    reactFizzyLake = value;
  }), bindRuntimeValue(runtime2, "FIZZY_LAKE_SHEET_PARTS", () => FIZZY_LAKE_SHEET_PARTS, (value) => {
    FIZZY_LAKE_SHEET_PARTS = value;
  }), bindRuntimeValue(runtime2, "KIT_APPLIES_FIZZY_LAKE_ATTRIBUTE", () => KIT_APPLIES_FIZZY_LAKE_ATTRIBUTE, (value) => {
    KIT_APPLIES_FIZZY_LAKE_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "ICON_SET_ON_WHEN_UNSET", () => ICON_SET_ON_WHEN_UNSET, (value) => {
    ICON_SET_ON_WHEN_UNSET = value;
  }), bindRuntimeValue(runtime2, "reactIconSet", () => reactIconSet, (value) => {
    reactIconSet = value;
  }), bindRuntimeValue(runtime2, "ICONS_FOR_EVERY_VIEWER", () => ICONS_FOR_EVERY_VIEWER, (value) => {
    ICONS_FOR_EVERY_VIEWER = value;
  }), bindRuntimeValue(runtime2, "ICON_SET_FLAG", () => ICON_SET_FLAG, (value) => {
    ICON_SET_FLAG = value;
  }), bindRuntimeValue(runtime2, "ICON_SET_ROLLOUT", () => ICON_SET_ROLLOUT, (value) => {
    ICON_SET_ROLLOUT = value;
  }), bindRuntimeValue(runtime2, "isClaudeNativeApp", () => isClaudeNativeApp, (value) => {
    isClaudeNativeApp = value;
  }), bindRuntimeValue(runtime2, "createIconSetGate", () => createIconSetGate), bindRuntimeValue(runtime2, "createFizzyLakePartsSource", () => createFizzyLakePartsSource), bindRuntimeValue(runtime2, "useFizzyLakePartsSource", () => useFizzyLakePartsSource), bindRuntimeValue(runtime2, "applyFizzyLakeAttribute", () => applyFizzyLakeAttribute), bindRuntimeValue(runtime2, "fizzyLakePartsSource", () => fizzyLakePartsSource, (value) => {
    fizzyLakePartsSource = value;
  }), bindRuntimeValue(runtime2, "useExperimentalIconParts", () => useExperimentalIconParts), bindRuntimeValue(runtime2, "jsxTl", () => jsxTl, (value) => {
    jsxTl = value;
  }), bindRuntimeValue(runtime2, "AppDesignProvider", () => AppDesignProvider), bindRuntimeValue(runtime2, "reactBottomToolbarFlag", () => reactBottomToolbarFlag, (value) => {
    reactBottomToolbarFlag = value;
  }), bindRuntimeValue(runtime2, "BOTTOM_TOOLBAR_FLAG_KEY", () => BOTTOM_TOOLBAR_FLAG_KEY, (value) => {
    BOTTOM_TOOLBAR_FLAG_KEY = value;
  }), bindRuntimeValue(runtime2, "readBottomToolbarFlag", () => readBottomToolbarFlag, (value) => {
    readBottomToolbarFlag = value;
  }), bindRuntimeValue(runtime2, "useBottomToolbarFlag", () => useBottomToolbarFlag), bindRuntimeValue(runtime2, "useBottomToolbarChrome", () => useBottomToolbarChrome), () => {
    (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiContrastControls)(), (0, runtime2.initializeColorSelect)(), (0, runtime2.initializeIconButton)(), (0, runtime2.initializeUiPropertySearch)(), jsxgp0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactAl = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMvT_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), jsxfp0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiInputs210)(), reactFizzyLake = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), FIZZY_LAKE_SHEET_PARTS = ["color", "panels", "type"], KIT_APPLIES_FIZZY_LAKE_ATTRIBUTE = !0, ICON_SET_ON_WHEN_UNSET = !0, reactIconSet = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ICONS_FOR_EVERY_VIEWER = !1, ICON_SET_FLAG = "appifact_icon_set", ICON_SET_ROLLOUT = !0, isClaudeNativeApp = () => navigator.userAgent.includes(" Claude/") && !navigator.userAgent.includes(" Electron/"), fizzyLakePartsSource = createFizzyLakePartsSource(FIZZY_LAKE_SHEET_PARTS, ICON_SET_ON_WHEN_UNSET), jsxTl = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactBottomToolbarFlag = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), BOTTOM_TOOLBAR_FLAG_KEY = "appifact_bottom_toolbar", readBottomToolbarFlag = () => (0, runtime2.getFeatureFlag)(BOTTOM_TOOLBAR_FLAG_KEY, ! 1);
  };
}
export {
  installUiDesignProvider
};
