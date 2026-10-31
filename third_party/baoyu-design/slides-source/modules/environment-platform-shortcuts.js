// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentPlatformShortcuts(runtime2) {
  function isApplePlatform() {
    return typeof navigator > "u" ? !1 : /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  }
  function formatCommandShortcut(key, { shift: shift4 = !1 } = {}) {
    return isApplePlatform() ? (shift4 ? "⇧⌘" : "⌘") + key : "Ctrl+" + (shift4 ? "Shift+" : "") + key;
  }
  function isDuplicateShortcut(event) {
    return (event.key === "d" || event.key === "D") && !event.shiftKey && !event.altKey && (isApplePlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey);
  }
  return bindRuntimeValue(runtime2, "isApplePlatform", () => isApplePlatform), bindRuntimeValue(runtime2, "formatCommandShortcut", () => formatCommandShortcut), bindRuntimeValue(runtime2, "isDuplicateShortcut", () => isDuplicateShortcut), () => {
  };
}
export {
  installEnvironmentPlatformShortcuts
};
