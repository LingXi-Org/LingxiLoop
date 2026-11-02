// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesBootRecovery(runtime2) {
  var isPermanentFilesBootFailure, FILES_BOOT_RECOVERY_DELAYS_MS, FILES_BOOT_PERMANENT_RETRY_MS;
  function classifyFilesBootFailure(error) {
    return error instanceof runtime2.IndexFileError ? error.code === "newer_version" ? "newer_build" : error.code === "unreadable" ? "damaged_index" : "transient" : error instanceof runtime2.BootReadError && (error.code === "no_index" || error.code === "access_revoked") ? error.code : "transient";
  }
  function filesBootRetryDelayForHotUpdate(error, change, indexPath, elapsedMs) {
    let classification = classifyFilesBootFailure(error);
    if (classification === "transient")
      return Math.max(0, FILES_BOOT_RECOVERY_DELAYS_MS[0] - elapsedMs);
    if (!(classification !== "access_revoked" && !change.changed.some((input) => input.path === indexPath)))
      return Math.max(0, FILES_BOOT_PERMANENT_RETRY_MS - elapsedMs);
  }
  return bindRuntimeValue(runtime2, "classifyFilesBootFailure", () => classifyFilesBootFailure), bindRuntimeValue(runtime2, "isPermanentFilesBootFailure", () => isPermanentFilesBootFailure, (value) => {
    isPermanentFilesBootFailure = value;
  }), bindRuntimeValue(runtime2, "FILES_BOOT_RECOVERY_DELAYS_MS", () => FILES_BOOT_RECOVERY_DELAYS_MS, (value) => {
    FILES_BOOT_RECOVERY_DELAYS_MS = value;
  }), bindRuntimeValue(runtime2, "FILES_BOOT_PERMANENT_RETRY_MS", () => FILES_BOOT_PERMANENT_RETRY_MS, (value) => {
    FILES_BOOT_PERMANENT_RETRY_MS = value;
  }), bindRuntimeValue(runtime2, "filesBootRetryDelayForHotUpdate", () => filesBootRetryDelayForHotUpdate), () => {
    isPermanentFilesBootFailure = (input) => classifyFilesBootFailure(input) !== "transient", FILES_BOOT_RECOVERY_DELAYS_MS = [
      2e3,
      4e3,
      8e3,
      15e3,
      3e4,
      6e4,
      12e4,
      3e5
    ], FILES_BOOT_PERMANENT_RETRY_MS = 6e4;
  };
}
export {
  installFilesBootRecovery
};
