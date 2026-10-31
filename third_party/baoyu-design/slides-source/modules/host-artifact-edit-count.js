// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostArtifactEditCount(runtime2) {
  var EDIT_COUNT_STORAGE_PATTERN, artifactEditCount, lastArtifactEditTime, artifactEditNow, artifactEditSubscribers;
  function normalizeArtifactSessionPath(path) {
    return path.replace(/\/_f\/[^/]+(\/|$)/, "/_f/_$1");
  }
  function artifactEditStorageKey() {
    return typeof location > "u" ? null : "appifact:edits:" + normalizeArtifactSessionPath(location.pathname);
  }
  function readArtifactEditCount() {
    try {
      let value = artifactEditStorageKey(), value2 = EDIT_COUNT_STORAGE_PATTERN.exec(value === null ? "" : sessionStorage.getItem(value) ?? "");
      return value2 === null ? 0 : Number(value2[1]);
    } catch {
      return 0;
    }
  }
  function writeArtifactEditCount(count) {
    try {
      let value = artifactEditStorageKey();
      value !== null && sessionStorage.setItem(value, String(count));
    } catch {
    }
  }
  function getArtifactEditCount() {
    return artifactEditCount ??= readArtifactEditCount(), artifactEditCount;
  }
  function recordArtifactEdit() {
    let value = artifactEditNow(), value2 = value - lastArtifactEditTime < 500;
    if (lastArtifactEditTime = value, value2)
      return;
    let value3 = Math.min(getArtifactEditCount() + 1, 999999999);
    if (value3 !== artifactEditCount) {
      artifactEditCount = value3, writeArtifactEditCount(value3);
      for (let value4 of [...artifactEditSubscribers])
        value4(value3);
    }
  }
  function subscribeArtifactEdits(listener) {
    return artifactEditSubscribers.add(listener), () => {
      artifactEditSubscribers.delete(listener);
    };
  }
  return bindRuntimeValue(runtime2, "EDIT_COUNT_STORAGE_PATTERN", () => EDIT_COUNT_STORAGE_PATTERN, (value) => {
    EDIT_COUNT_STORAGE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "artifactEditCount", () => artifactEditCount, (value) => {
    artifactEditCount = value;
  }), bindRuntimeValue(runtime2, "lastArtifactEditTime", () => lastArtifactEditTime, (value) => {
    lastArtifactEditTime = value;
  }), bindRuntimeValue(runtime2, "artifactEditNow", () => artifactEditNow, (value) => {
    artifactEditNow = value;
  }), bindRuntimeValue(runtime2, "artifactEditSubscribers", () => artifactEditSubscribers, (value) => {
    artifactEditSubscribers = value;
  }), bindRuntimeValue(runtime2, "normalizeArtifactSessionPath", () => normalizeArtifactSessionPath), bindRuntimeValue(runtime2, "artifactEditStorageKey", () => artifactEditStorageKey), bindRuntimeValue(runtime2, "readArtifactEditCount", () => readArtifactEditCount), bindRuntimeValue(runtime2, "writeArtifactEditCount", () => writeArtifactEditCount), bindRuntimeValue(runtime2, "getArtifactEditCount", () => getArtifactEditCount), bindRuntimeValue(runtime2, "recordArtifactEdit", () => recordArtifactEdit), bindRuntimeValue(runtime2, "subscribeArtifactEdits", () => subscribeArtifactEdits), () => {
    EDIT_COUNT_STORAGE_PATTERN = /^([0-9]{1,9})(?:\/[0-9]{1,9})?$/, lastArtifactEditTime = -1 / 0, artifactEditNow = () => Date.now(), artifactEditSubscribers = /* @__PURE__ */ new Set();
  };
}
export {
  installHostArtifactEditCount
};
