// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiCollaboratorTints(runtime2) {
  var COLLABORATOR_TINTS, COLLABORATOR_TINTS_WITH_MUTED, jsxMc0;
  return bindRuntimeValue(runtime2, "COLLABORATOR_TINTS", () => COLLABORATOR_TINTS, (value) => {
    COLLABORATOR_TINTS = value;
  }), bindRuntimeValue(runtime2, "COLLABORATOR_TINTS_WITH_MUTED", () => COLLABORATOR_TINTS_WITH_MUTED, (value) => {
    COLLABORATOR_TINTS_WITH_MUTED = value;
  }), bindRuntimeValue(runtime2, "jsxMc0", () => jsxMc0, (value) => {
    jsxMc0 = value;
  }), () => {
    (0, runtime2.initializeUiPropertyIcons)(), COLLABORATOR_TINTS = [
      "categorical-1",
      "categorical-2",
      "categorical-3",
      "categorical-4",
      "categorical-5",
      "categorical-6",
      "categorical-7",
      "categorical-8"
    ], COLLABORATOR_TINTS_WITH_MUTED = [...COLLABORATOR_TINTS, "muted"], jsxMc0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiCollaboratorTints
};
