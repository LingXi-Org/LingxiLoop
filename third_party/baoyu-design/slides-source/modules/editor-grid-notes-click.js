// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorGridNotesClick(runtime2) {
  function reduceGridNotesOutsideClick(context) {
    return context.editing !== null && context.hit?.id === context.editing ? context.target === "off" ? "clear" : context.moved ? "ignore" : context.hit : context.target === "ground" && context.hit !== null ? context.hit : "clear";
  }
  function classifyGridNotesClickTarget(target) {
    let element = target;
    return element === null || typeof element.closest != "function" ? "off" : element.hasAttribute("data-slides-ground") ? "ground" : element.closest("[data-slides-editor]") !== null ? "editor" : element.closest("[data-slides-grid]") !== null && element.closest("[data-mc-menu]") === null ? "ground" : "off";
  }
  return bindRuntimeValue(runtime2, "reduceGridNotesOutsideClick", () => reduceGridNotesOutsideClick), bindRuntimeValue(runtime2, "classifyGridNotesClickTarget", () => classifyGridNotesClickTarget), () => {
  };
}
export {
  installEditorGridNotesClick
};
