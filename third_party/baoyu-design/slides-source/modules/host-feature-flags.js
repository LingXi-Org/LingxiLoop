// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostFeatureFlags(runtime2) {
  var CREATION_SEQUENCE_FLAG, creationSequenceFlagRequested, creationSequenceFlagSnapshot;
  function resolveFeatureFlagApi() {
    let __appifact_flags = globalThis.__appifact_flags;
    if (typeof __appifact_flags != "object" || __appifact_flags === null)
      return;
    let value = __appifact_flags;
    if (typeof value.ready == "function" && typeof value.get == "function" && typeof value.all == "function")
      return __appifact_flags;
  }
  function sameFlagValueType(value, fallback) {
    return fallback === null ? !0 : Array.isArray(fallback) ? Array.isArray(value) : typeof fallback == "object" ? typeof value == "object" && value !== null && !Array.isArray(value) : typeof value == typeof fallback;
  }
  async function getFeatureFlagAsync(key, fallback) {
    try {
      let value = resolveFeatureFlagApi();
      if (value === void 0)
        return fallback;
      try {
        await value.ready();
      } catch {
      }
      let entry = value.get(key, fallback);
      return sameFlagValueType(entry, fallback) ? entry : fallback;
    } catch {
      return fallback;
    }
  }
  function getFeatureFlag(key, fallback) {
    try {
      let value = resolveFeatureFlagApi()?.get(key, fallback);
      return value !== void 0 && sameFlagValueType(value, fallback) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  function requestCreationSequenceFlag() {
    if (creationSequenceFlagRequested)
      return;
    creationSequenceFlagRequested = !0;
    let value = Date.now();
    getFeatureFlagAsync(CREATION_SEQUENCE_FLAG, !1).then((input) => {
      input && creationSequenceFlagSnapshot === !1 && console.debug("slides: the " + CREATION_SEQUENCE_FLAG + " flag came back on " + String(Date.now() - value) + " ms after the page asked, too late for this load, which does not show the creation sequence");
    });
  }
  function wasCreationSequenceFlagRequested() {
    return creationSequenceFlagRequested;
  }
  function creationSequenceEnabled() {
    return creationSequenceFlagSnapshot ??= creationSequenceFlagRequested && getFeatureFlag(CREATION_SEQUENCE_FLAG, !1), creationSequenceFlagSnapshot;
  }
  return bindRuntimeValue(runtime2, "resolveFeatureFlagApi", () => resolveFeatureFlagApi), bindRuntimeValue(runtime2, "sameFlagValueType", () => sameFlagValueType), bindRuntimeValue(runtime2, "getFeatureFlagAsync", () => getFeatureFlagAsync), bindRuntimeValue(runtime2, "getFeatureFlag", () => getFeatureFlag), bindRuntimeValue(runtime2, "CREATION_SEQUENCE_FLAG", () => CREATION_SEQUENCE_FLAG, (value) => {
    CREATION_SEQUENCE_FLAG = value;
  }), bindRuntimeValue(runtime2, "creationSequenceFlagRequested", () => creationSequenceFlagRequested, (value) => {
    creationSequenceFlagRequested = value;
  }), bindRuntimeValue(runtime2, "creationSequenceFlagSnapshot", () => creationSequenceFlagSnapshot, (value) => {
    creationSequenceFlagSnapshot = value;
  }), bindRuntimeValue(runtime2, "requestCreationSequenceFlag", () => requestCreationSequenceFlag), bindRuntimeValue(runtime2, "wasCreationSequenceFlagRequested", () => wasCreationSequenceFlagRequested), bindRuntimeValue(runtime2, "creationSequenceEnabled", () => creationSequenceEnabled), () => {
    CREATION_SEQUENCE_FLAG = "appifact_creation_sequence", creationSequenceFlagRequested = !1;
  };
}
export {
  installHostFeatureFlags
};
