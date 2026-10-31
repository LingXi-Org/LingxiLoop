// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBootStateFile(runtime2) {
  var StateFileReadFailure, EMPTY_FILE_STATE_PAGE_PARTS, unavailableStateStorageSlot;
  async function readStateFile(fetchFile, path, parseFile) {
    try {
      let value = await fetchFile(path);
      if (!value.ok)
        return new StateFileReadFailure(path + ": HTTP " + String(value.status), "fetch", value.status === 404);
      let value2 = await value.text(), value3;
      try {
        value3 = parseFile(value2);
      } catch {
        return new StateFileReadFailure(path + ": unreadable", "read");
      }
      return typeof value3 == "string" ? new StateFileReadFailure(path + ": " + value3, "read") : value3;
    } catch (value) {
      return new StateFileReadFailure(path + ": " + (value instanceof Error ? value.message : String(value)), "fetch");
    }
  }
  async function loadInstanceOrDemoState(options) {
    let fetchFile = options.fetch ?? ((input) => fetch(input)), instanceOutcome = await readStateFile(fetchFile, options.stateFile, options.read);
    if (!(instanceOutcome instanceof StateFileReadFailure))
      return {
        state: instanceOutcome.envelope,
        origin: "instance",
        note: instanceOutcome.note
      };
    let value = await readStateFile(fetchFile, options.demoFile, options.read), value2 = !instanceOutcome.missing;
    if (!(value instanceof StateFileReadFailure))
      return {
        state: value.envelope,
        origin: "demo",
        error: instanceOutcome.fail,
        stateFileFound: value2,
        errorAt: instanceOutcome.at,
        note: value.note
      };
    let value3 = instanceOutcome.missing ? value.at : instanceOutcome.at;
    return {
      state: {},
      origin: "failed",
      error: instanceOutcome.fail + "; " + value.fail,
      stateFileFound: value2,
      errorAt: value3
    };
  }
  function stateEnvelopeTitle(envelope) {
    let title = envelope.title;
    if (typeof title == "string" && title.length > 0)
      return (0, runtime2.truncateUtf16Safely)(title, 200);
  }
  function readableStateStorageSlot(text) {
    return {
      read: () => text,
      write: () => !0,
      clear() {
      }
    };
  }
  return bindRuntimeValue(runtime2, "StateFileReadFailure", () => StateFileReadFailure, (value) => {
    StateFileReadFailure = value;
  }), bindRuntimeValue(runtime2, "readStateFile", () => readStateFile), bindRuntimeValue(runtime2, "loadInstanceOrDemoState", () => loadInstanceOrDemoState), bindRuntimeValue(runtime2, "stateEnvelopeTitle", () => stateEnvelopeTitle), bindRuntimeValue(runtime2, "EMPTY_FILE_STATE_PAGE_PARTS", () => EMPTY_FILE_STATE_PAGE_PARTS, (value) => {
    EMPTY_FILE_STATE_PAGE_PARTS = value;
  }), bindRuntimeValue(runtime2, "readableStateStorageSlot", () => readableStateStorageSlot), bindRuntimeValue(runtime2, "unavailableStateStorageSlot", () => unavailableStateStorageSlot, (value) => {
    unavailableStateStorageSlot = value;
  }), () => {
    (0, runtime2.initializeUiInputs210)(), StateFileReadFailure = class {
      fail;
      at;
      missing;
      constructor(input, options, context = !1) {
        this.fail = input, this.at = options, this.missing = context;
      }
    }, EMPTY_FILE_STATE_PAGE_PARTS = {
      title: "",
      readme: "",
      readmeMeta: "",
      css: "",
      js: "",
      emulator: !1
    }, unavailableStateStorageSlot = {
      read: () => null,
      write: () => !1,
      clear() {
      }
    };
  };
}
export {
  installBootStateFile
};
