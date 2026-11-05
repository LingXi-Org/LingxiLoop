// Browser core of the pinned file debugger (MIT). Full panel stays optional.
import { bindRuntimeValue } from "../module-helpers.js";
  function fileInputDebugText(input) {
    if (input === null)
      return "";
    let content = typeof input == "object" && !(typeof Blob < "u" && input instanceof Blob) ? input.content : input;
    return typeof content == "string" ? content : "";
  }
  function filesDebugEnabled(getStorage = () => globalThis.localStorage) {
    try {
      return getStorage()?.getItem("appifact-files-debug") === "1";
    } catch {
      return !1;
    }
  }

export { filesDebugEnabled };
export function installFilesDebugCore(runtime2) {
  function instrumentFilesPort(port, debug) {
    let value = Object.create(port);
    return value.publish = async (input, options) => {
      let value2;
      try {
        value2 = debug.saveStart(Object.keys(input), Object.values(input).reduce((input2, options2) => input2 + (0, runtime2.filePublishEncodedBytes)(options2), 0));
      } catch {
      }
      let value3 = await port.publish(input, options);
      try {
        value2 !== void 0 && debug.saveEnd(value2, value3.ok ? {
          ok: !0,
          version: value3.version
        } : {
          ok: !1,
          code: value3.code,
          raw: value3
        });
      } catch {
      }
      return value3;
    }, value;
  }
  function createNoopFilesDebugger() {
    let callback = () => {
    };
    return {
      tab: "",
      reloadReason: "",
      field: callback,
      event: callback,
      hotEvent: callback,
      beforeRestart: callback,
      saveStart: () => 0,
      saveEnd: callback,
      phase: callback,
      read: callback,
      visible: callback,
      sample: callback,
      mount: callback,
      exportJson: () => "{}",
      option: () => () => !0,
      provide: callback
    };
  }

  for (const [name, value] of Object.entries({fileInputDebugText, filesDebugEnabled, instrumentFilesPort, createNoopFilesDebugger, createFilesDebugger: createNoopFilesDebugger})) bindRuntimeValue(runtime2, name, () => value);
  return () => {};
}
