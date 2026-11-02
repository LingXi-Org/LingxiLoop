// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorGestureCursor(runtime2) {
  function setGestureCursor(cursor) {
    let documentElement = document.documentElement;
    documentElement.style.setProperty("--gesture-cursor", cursor), documentElement.setAttribute("data-gesture-cursor", "");
  }
  function clearGestureCursor() {
    let documentElement = document.documentElement;
    documentElement.removeAttribute("data-gesture-cursor"), documentElement.style.removeProperty("--gesture-cursor");
  }
  return bindRuntimeValue(runtime2, "setGestureCursor", () => setGestureCursor), bindRuntimeValue(runtime2, "clearGestureCursor", () => clearGestureCursor), () => {
  };
}
export {
  installEditorGestureCursor
};
