// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostBusyHolds(runtime2) {
  var EXPORT_HOLD_MAX_MS, SHELL_SAVE_HOLD_MAX_MS, exportHolds, shellSaveHolds, holdExportInProgress, holdShellSaveInProgress, exportOrShellSaveInProgress, shellSaveInProgress;
  function addBusyHold(holds, maxMs, timers, onRelease) {
    let hold = {}, release = () => {
      holds.delete(hold), timers.clearTimeout(timer), onRelease?.();
    };
    holds.add(hold);
    let timer = timers.setTimeout(release, maxMs);
    return release;
  }
  return bindRuntimeValue(runtime2, "EXPORT_HOLD_MAX_MS", () => EXPORT_HOLD_MAX_MS, (value) => {
    EXPORT_HOLD_MAX_MS = value;
  }), bindRuntimeValue(runtime2, "SHELL_SAVE_HOLD_MAX_MS", () => SHELL_SAVE_HOLD_MAX_MS, (value) => {
    SHELL_SAVE_HOLD_MAX_MS = value;
  }), bindRuntimeValue(runtime2, "exportHolds", () => exportHolds, (value) => {
    exportHolds = value;
  }), bindRuntimeValue(runtime2, "shellSaveHolds", () => shellSaveHolds, (value) => {
    shellSaveHolds = value;
  }), bindRuntimeValue(runtime2, "addBusyHold", () => addBusyHold), bindRuntimeValue(runtime2, "holdExportInProgress", () => holdExportInProgress, (value) => {
    holdExportInProgress = value;
  }), bindRuntimeValue(runtime2, "holdShellSaveInProgress", () => holdShellSaveInProgress, (value) => {
    holdShellSaveInProgress = value;
  }), bindRuntimeValue(runtime2, "exportOrShellSaveInProgress", () => exportOrShellSaveInProgress, (value) => {
    exportOrShellSaveInProgress = value;
  }), bindRuntimeValue(runtime2, "shellSaveInProgress", () => shellSaveInProgress, (value) => {
    shellSaveInProgress = value;
  }), () => {
    EXPORT_HOLD_MAX_MS = 12e5, SHELL_SAVE_HOLD_MAX_MS = 15e4,
    exportHolds = /* @__PURE__ */ new Set(), shellSaveHolds = /* @__PURE__ */ new Set(), holdExportInProgress = (timers = globalThis) => addBusyHold(exportHolds, EXPORT_HOLD_MAX_MS, timers, (0, runtime2.holdHostLeaveWarning)()), holdShellSaveInProgress = (timers = globalThis) => addBusyHold(shellSaveHolds, SHELL_SAVE_HOLD_MAX_MS, timers), exportOrShellSaveInProgress = () => exportHolds.size > 0 || shellSaveHolds.size > 0, shellSaveInProgress = () => shellSaveHolds.size > 0;
  };
}
export {
  installHostBusyHolds
};
