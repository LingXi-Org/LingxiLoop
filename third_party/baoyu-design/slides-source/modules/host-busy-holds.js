// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostBusyHolds(runtime2) {
  var exportHolds, shellSaveHolds, holdExportInProgress, holdShellSaveInProgress, exportOrShellSaveInProgress, shellSaveInProgress;
  function addHold(holds, maxMs, timers) {
    let hold = {}, release = () => {
      holds.delete(hold), timers.clearTimeout(timer);
    };
    holds.add(hold);
    let timer = timers.setTimeout(release, maxMs);
    return release;
  }
  return bindRuntimeValue(runtime2, "holdExportInProgress", () => holdExportInProgress, (value) => {
    holdExportInProgress = value;
  }), bindRuntimeValue(runtime2, "holdShellSaveInProgress", () => holdShellSaveInProgress, (value) => {
    holdShellSaveInProgress = value;
  }), bindRuntimeValue(runtime2, "exportOrShellSaveInProgress", () => exportOrShellSaveInProgress, (value) => {
    exportOrShellSaveInProgress = value;
  }), bindRuntimeValue(runtime2, "shellSaveInProgress", () => shellSaveInProgress, (value) => {
    shellSaveInProgress = value;
  }), () => {
    exportHolds = /* @__PURE__ */ new Set(), shellSaveHolds = /* @__PURE__ */ new Set(), holdExportInProgress = (timers = globalThis) => addHold(exportHolds, 12e5, timers), holdShellSaveInProgress = (timers = globalThis) => addHold(shellSaveHolds, 15e4, timers), exportOrShellSaveInProgress = () => exportHolds.size > 0 || shellSaveHolds.size > 0, shellSaveInProgress = () => shellSaveHolds.size > 0;
  };
}
export {
  installHostBusyHolds
};
