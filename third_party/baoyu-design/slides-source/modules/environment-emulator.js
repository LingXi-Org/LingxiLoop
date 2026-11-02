// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentEmulator(runtime2) {
  var emulatorPageDetected, initializeEmulatorDetection;
  function emulatorHostMetaName() {
    return ["appifact", "emulator", "host"].join("-");
  }
  function isEmulatorPage() {
    return emulatorPageDetected ??= typeof document < "u" && (document.querySelector('meta[name="' + (0, runtime2.emulatorBuildMetaName)() + '"]') !== null || document.querySelector('meta[name="' + emulatorHostMetaName() + '"]') !== null), emulatorPageDetected;
  }
  return bindRuntimeValue(runtime2, "emulatorHostMetaName", () => emulatorHostMetaName), bindRuntimeValue(runtime2, "isEmulatorPage", () => isEmulatorPage), bindRuntimeValue(runtime2, "emulatorPageDetected", () => emulatorPageDetected, (value) => {
    emulatorPageDetected = value;
  }), bindRuntimeValue(runtime2, "initializeEmulatorDetection", () => initializeEmulatorDetection, (value) => {
    initializeEmulatorDetection = value;
  }), () => {
    initializeEmulatorDetection = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeCompiledPage)();
    });
  };
}
export {
  installEnvironmentEmulator
};
