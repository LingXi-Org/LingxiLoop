// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiEditorBootstrapImports(runtime2) {
  var reactDOMClientOT0, reactd0, reactDOMN3_, reactd3;
  return bindRuntimeValue(runtime2, "reactDOMClientOT0", () => reactDOMClientOT0, (value) => {
    reactDOMClientOT0 = value;
  }), bindRuntimeValue(runtime2, "reactd0", () => reactd0, (value) => {
    reactd0 = value;
  }), bindRuntimeValue(runtime2, "reactDOMN3_", () => reactDOMN3_, (value) => {
    reactDOMN3_ = value;
  }), bindRuntimeValue(runtime2, "reactd3", () => reactd3, (value) => {
    reactd3 = value;
  }), () => {
    reactDOMClientOT0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomClientNamespace)(), 1), (0, runtime2.initializeUiInputs210)(), reactd0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMN3_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), (0, runtime2.initializeUiInputs210)(), reactd3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installUiEditorBootstrapImports
};
