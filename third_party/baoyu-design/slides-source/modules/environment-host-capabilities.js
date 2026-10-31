// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentHostCapabilities(runtime2) {
  var capabilityLoadTimeoutMs;
  function getHostBridge() {
    return globalThis.slidesHost;
  }
  function hasHostCapabilityLoader() {
    return typeof getHostBridge()?.use == "function";
  }
  function getHostCapability(name) {
    return getHostBridge()?.[name];
  }
  async function loadHostCapability(name) {
    let value = getHostBridge();
    if (typeof value?.use != "function")
      return null;
    let value2 = await value.use.call(value, name);
    return value2?.available === !1 ? null : value2;
  }
  async function getOrLoadHostCapability(name, validate, timeoutMs = capabilityLoadTimeoutMs) {
    let value = getHostCapability(name);
    return validate(value) ? value : loadHostCapabilityWithTimeout(name, validate, timeoutMs);
  }
  async function loadHostCapabilityWithTimeout(name, validate, timeoutMs = capabilityLoadTimeoutMs) {
    let value;
    try {
      let promise = new Promise((input) => value = setTimeout(input, timeoutMs, null)), value2 = await Promise.race([
        loadHostCapability(name),
        promise
      ]);
      return validate(value2) ? value2 : null;
    } catch {
      return null;
    } finally {
      clearTimeout(value);
    }
  }
  function capabilityHasMethod(methodName) {
    return (input) => (typeof input == "object" || typeof input == "function") && input !== null && typeof input[methodName] == "function";
  }
  return bindRuntimeValue(runtime2, "getHostBridge", () => getHostBridge), bindRuntimeValue(runtime2, "hasHostCapabilityLoader", () => hasHostCapabilityLoader), bindRuntimeValue(runtime2, "getHostCapability", () => getHostCapability), bindRuntimeValue(runtime2, "loadHostCapability", () => loadHostCapability), bindRuntimeValue(runtime2, "getOrLoadHostCapability", () => getOrLoadHostCapability), bindRuntimeValue(runtime2, "loadHostCapabilityWithTimeout", () => loadHostCapabilityWithTimeout), bindRuntimeValue(runtime2, "capabilityHasMethod", () => capabilityHasMethod), bindRuntimeValue(runtime2, "capabilityLoadTimeoutMs", () => capabilityLoadTimeoutMs, (value) => {
    capabilityLoadTimeoutMs = value;
  }), () => {
    capabilityLoadTimeoutMs = 45e3;
  };
}
export {
  installEnvironmentHostCapabilities
};
