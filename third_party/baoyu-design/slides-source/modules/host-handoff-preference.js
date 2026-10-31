// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostHandoffPreference(runtime2) {
  var reactLH0, jsxzd, HANDOFF_TARGETS, HANDOFF_TARGET_STORAGE_KEY, preferredHandoffTarget;
  return bindRuntimeValue(runtime2, "reactLH0", () => reactLH0, (value) => {
    reactLH0 = value;
  }), bindRuntimeValue(runtime2, "jsxzd", () => jsxzd, (value) => {
    jsxzd = value;
  }), bindRuntimeValue(runtime2, "HANDOFF_TARGETS", () => HANDOFF_TARGETS, (value) => {
    HANDOFF_TARGETS = value;
  }), bindRuntimeValue(runtime2, "HANDOFF_TARGET_STORAGE_KEY", () => HANDOFF_TARGET_STORAGE_KEY, (value) => {
    HANDOFF_TARGET_STORAGE_KEY = value;
  }), bindRuntimeValue(runtime2, "preferredHandoffTarget", () => preferredHandoffTarget, (value) => {
    preferredHandoffTarget = value;
  }), () => {
    reactLH0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxzd = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), HANDOFF_TARGETS = ["cowork", "code", "coworker"], HANDOFF_TARGET_STORAGE_KEY = "appifact.handOff.target", preferredHandoffTarget = null;
    try {
      let value = localStorage.getItem(HANDOFF_TARGET_STORAGE_KEY);
      preferredHandoffTarget = HANDOFF_TARGETS.find((input) => input === value) ?? null;
    } catch {
      preferredHandoffTarget = null;
    }
  };
}
export {
  installHostHandoffPreference
};
