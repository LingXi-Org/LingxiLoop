// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsWriteAccess(runtime2) {
  var CONTENT_SIGN_IN_REQUIRED_MESSAGE, EDITING_UNAVAILABLE_MESSAGE, LIVE_READ_ONLY_MESSAGE, FILE_LIST_UNAVAILABLE_MESSAGE, unavailableStorageSlot, EMPTY_EMBEDDED_PAGE_PARTS;
  async function determineSlidesWriteAccess() {
    if (!(0, runtime2.selfPublishAvailable)())
      return {
        canWrite: !1,
        reason: EDITING_UNAVAILABLE_MESSAGE
      };
    let options = (0, runtime2.readCurrentArtifactReadOnlyReason)();
    if (options !== null)
      return {
        canWrite: !1,
        reason: options
      };
    let [value, value2, value3, value4] = await Promise.all([
      (0, runtime2.currentUserCan)("data.write"),
      (0, runtime2.currentUserCan)("files.write"),
      (0, runtime2.currentUserCanEdit)(),
      (0, runtime2.getAssetsCapability)()
    ]);
    return value !== null || value2 !== null ? (value === !0 || value2 === !0) && value3 !== !1 ? {
      canWrite: !0
    } : {
      canWrite: !1,
      reason: LIVE_READ_ONLY_MESSAGE
    } : value3 !== !0 && value4 === null ? {
      canWrite: !1,
      reason: LIVE_READ_ONLY_MESSAGE
    } : {
      canWrite: !0
    };
  }
  function constantReadOnlyReasonSlot(reason) {
    return {
      read: () => reason,
      write: () => !1,
      clear() {
      }
    };
  }
  function readOnlyEmbeddedDocumentOptions(content, readOnlyReason = CONTENT_SIGN_IN_REQUIRED_MESSAGE) {
    return {
      embeddedState: {
        title: typeof document < "u" ? document.title : void 0,
        content,
        comments: []
      },
      roFlag: constantReadOnlyReasonSlot(readOnlyReason),
      stash: unavailableStorageSlot,
      canPublish: !0,
      pageParts: EMPTY_EMBEDDED_PAGE_PARTS
    };
  }
  return bindRuntimeValue(runtime2, "CONTENT_SIGN_IN_REQUIRED_MESSAGE", () => CONTENT_SIGN_IN_REQUIRED_MESSAGE, (value) => {
    CONTENT_SIGN_IN_REQUIRED_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "EDITING_UNAVAILABLE_MESSAGE", () => EDITING_UNAVAILABLE_MESSAGE, (value) => {
    EDITING_UNAVAILABLE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "LIVE_READ_ONLY_MESSAGE", () => LIVE_READ_ONLY_MESSAGE, (value) => {
    LIVE_READ_ONLY_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "FILE_LIST_UNAVAILABLE_MESSAGE", () => FILE_LIST_UNAVAILABLE_MESSAGE, (value) => {
    FILE_LIST_UNAVAILABLE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "determineSlidesWriteAccess", () => determineSlidesWriteAccess), bindRuntimeValue(runtime2, "unavailableStorageSlot", () => unavailableStorageSlot, (value) => {
    unavailableStorageSlot = value;
  }), bindRuntimeValue(runtime2, "constantReadOnlyReasonSlot", () => constantReadOnlyReasonSlot), bindRuntimeValue(runtime2, "EMPTY_EMBEDDED_PAGE_PARTS", () => EMPTY_EMBEDDED_PAGE_PARTS, (value) => {
    EMPTY_EMBEDDED_PAGE_PARTS = value;
  }), bindRuntimeValue(runtime2, "readOnlyEmbeddedDocumentOptions", () => readOnlyEmbeddedDocumentOptions), () => {
    (0, runtime2.initializeCompiledPage)(), (0, runtime2.initializeAssetStorage)(), CONTENT_SIGN_IN_REQUIRED_MESSAGE = "You might not have access to this content. Reload the page to try again.", EDITING_UNAVAILABLE_MESSAGE = "Editing isn’t available in this view.", LIVE_READ_ONLY_MESSAGE = "Read-only. You can view live changes.", FILE_LIST_UNAVAILABLE_MESSAGE = "Couldn’t read the full file list. Reload to try again.", unavailableStorageSlot = {
      read: () => null,
      write: () => !1,
      clear() {
      }
    }, EMPTY_EMBEDDED_PAGE_PARTS = {
      title: "",
      readme: "",
      readmeMeta: "",
      css: "",
      js: "",
      emulator: !1
    };
  };
}
export {
  installDocumentsWriteAccess
};
