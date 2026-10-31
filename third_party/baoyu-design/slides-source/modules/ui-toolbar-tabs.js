// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarTabs(runtime2) {
  var reactfS, jsxT_;
  function ToolbarTabs({ tabs, value, onChange, label }) {
    return jsxT_.jsx("div", {
      className: "mc-tabbar",
      children: jsxT_.jsx(runtime2.Tabs.Root, {
        value,
        onValueChange: (input) => onChange(input),
        children: jsxT_.jsx(runtime2.Tabs.List, {
          "aria-label": label,
          activateOnFocus: !0,
          className: "mx-auto w-fit max-w-full min-w-0 overflow-x-auto [scrollbar-width:none]",
          children: tabs.map((input) => jsxT_.jsx(runtime2.Tabs.Tab, {
            value: input.value,
            title: input.title,
            children: input.label
          }, input.value))
        })
      })
    });
  }
  return bindRuntimeValue(runtime2, "reactfS", () => reactfS, (value) => {
    reactfS = value;
  }), bindRuntimeValue(runtime2, "jsxT_", () => jsxT_, (value) => {
    jsxT_ = value;
  }), bindRuntimeValue(runtime2, "ToolbarTabs", () => ToolbarTabs), () => {
    reactfS = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiInputs210)(), jsxT_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiToolbarTabs
};
