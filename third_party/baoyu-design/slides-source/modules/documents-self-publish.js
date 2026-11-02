// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsSelfPublish(runtime2) {
  var SELF_PUBLISH_PERMISSION_ERROR_CODES, supportsSelfPublish, SELF_PUBLISH_ERROR_CODE_SET;
  function selfPublishInstalled() {
    return supportsSelfPublish((0, runtime2.getHostCapability)("self"));
  }
  function selfPublishAvailable() {
    return selfPublishInstalled() || (0, runtime2.hasHostCapabilityLoader)();
  }
  function getSelfPublishCapability() {
    return (0, runtime2.getOrLoadHostCapability)("self", supportsSelfPublish);
  }
  function normalizeSelfPublishError(error) {
    if (typeof error == "object" && error !== null && "code" in error) {
      let { code: value, message: value2, live: value3, say: value4 } = error;
      if (typeof value == "string" && SELF_PUBLISH_ERROR_CODE_SET.has(value))
        return {
          code: value,
          message: typeof value2 == "string" ? value2 : value,
          live: typeof value3 == "string" ? value3 : void 0,
          ...typeof value4 == "string" ? {
            say: value4
          } : {}
        };
      if (typeof value == "string")
        return {
          code: "upstream_error",
          message: (typeof value2 == "string" ? value2 : "publish failed") + " (unrecognized code: " + value + ")"
        };
    }
    return {
      code: "upstream_error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
  function createSelfPublisher() {
    if (!selfPublishAvailable())
      throw Error("slidesHost.self is missing — this view’s runtime predates the self capability (or this page is running outside a Frame shell and the emulator). Content cannot be saved from here.");
    return async (input) => {
      let value = await getSelfPublishCapability();
      if (value === null)
        throw {
          code: "not_granted",
          message: "The self capability is not available to this view."
        };
      return value.publish(input);
    };
  }
  return bindRuntimeValue(runtime2, "SELF_PUBLISH_PERMISSION_ERROR_CODES", () => SELF_PUBLISH_PERMISSION_ERROR_CODES, (value) => {
    SELF_PUBLISH_PERMISSION_ERROR_CODES = value;
  }), bindRuntimeValue(runtime2, "supportsSelfPublish", () => supportsSelfPublish, (value) => {
    supportsSelfPublish = value;
  }), bindRuntimeValue(runtime2, "selfPublishInstalled", () => selfPublishInstalled), bindRuntimeValue(runtime2, "selfPublishAvailable", () => selfPublishAvailable), bindRuntimeValue(runtime2, "getSelfPublishCapability", () => getSelfPublishCapability), bindRuntimeValue(runtime2, "SELF_PUBLISH_ERROR_CODE_SET", () => SELF_PUBLISH_ERROR_CODE_SET, (value) => {
    SELF_PUBLISH_ERROR_CODE_SET = value;
  }), bindRuntimeValue(runtime2, "normalizeSelfPublishError", () => normalizeSelfPublishError), bindRuntimeValue(runtime2, "createSelfPublisher", () => createSelfPublisher), () => {
    SELF_PUBLISH_PERMISSION_ERROR_CODES = [
      "not_writer",
      "not_declared",
      "not_granted",
      "consent_required",
      "capability_disabled",
      "capability_removed"
    ], supportsSelfPublish = (0, runtime2.capabilityHasMethod)("publish"), SELF_PUBLISH_ERROR_CODE_SET = /* @__PURE__ */ new Set([
      "conflict",
      "not_writer",
      "not_declared",
      "too_large",
      "invalid_content",
      "read_only_path",
      "rate_limited",
      "consent_required",
      "upstream_error",
      "not_granted",
      "capability_disabled",
      "capability_removed",
      "transform_error"
    ]);
  };
}
export {
  installDocumentsSelfPublish
};
