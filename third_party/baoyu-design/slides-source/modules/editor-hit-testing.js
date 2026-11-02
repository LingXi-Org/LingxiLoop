// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorHitTesting(runtime2) {
  function editableElementAtPoint(clientX, clientY, selectors9 = ["[data-cell]", "[data-text-path]"]) {
    if (typeof document > "u" || typeof document.elementsFromPoint != "function")
      return null;
    for (let value of document.elementsFromPoint(clientX, clientY))
      if (value.closest("[data-resize-handle]") === null) {
        for (let value2 of selectors9) {
          let ancestor = value.closest(value2);
          if (ancestor !== null)
            return ancestor;
        }
        return null;
      }
    return null;
  }
  return bindRuntimeValue(runtime2, "editableElementAtPoint", () => editableElementAtPoint), () => {
    (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeGradientEditor)(), (0, runtime2.initializeUiPropertyLabels)(), (0, runtime2.initializeUiNumberControls)();
  };
}
export {
  installEditorHitTesting
};
