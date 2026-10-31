// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryShellDownloads(runtime2) {
  var ReactDownloadsPermission, DOWNLOADS_UNAVAILABLE_MESSAGE, MAX_SHELL_DOWNLOAD_BYTES, supportsShellSave, cachedDownloadsWithheld;
  function pageDeclaresDownloads() {
    if (typeof document > "u")
      return !1;
    let value = document.querySelector('meta[name="' + runtime2.compiledPageCapabilitiesMetaName + '"]')?.getAttribute("content");
    if (value == null)
      return !1;
    try {
      let value2 = JSON.parse(value);
      return typeof value2 == "object" && value2 !== null && Object.hasOwn(value2, "downloads");
    } catch {
      return !1;
    }
  }
  async function downloadsWithheld(input = runtime2.capabilityLoadTimeoutMs) {
    let value;
    try {
      if (!(0, runtime2.hasHostCapabilityLoader)() || !pageDeclaresDownloads())
        return !1;
      let promise = new Promise((input2) => value = setTimeout(input2, input, void 0));
      return await Promise.race([
        (0, runtime2.loadHostCapability)("downloads"),
        promise
      ]) === null;
    } catch {
      return !1;
    } finally {
      clearTimeout(value);
    }
  }
  async function downloadsCapabilityAvailable(timeoutMs = runtime2.capabilityLoadTimeoutMs) {
    if (!(0, runtime2.hasHostCapabilityLoader)() || !pageDeclaresDownloads())
      return !0;
    let timer;
    try {
      let late = new Promise((resolve) => timer = setTimeout(resolve, timeoutMs, "late")), value = await Promise.race([
        (0, runtime2.loadHostCapability)("downloads"),
        late
      ]);
      return value != null && value !== "late";
    } catch {
      return !1;
    } finally {
      clearTimeout(timer);
    }
  }
  function useDownloadsWithheld() {
    let [value, value2] = ReactDownloadsPermission.useState(cachedDownloadsWithheld);
    return ReactDownloadsPermission.useEffect(() => {
      let flag = !0;
      return downloadsWithheld().then((input) => {
        cachedDownloadsWithheld = input, flag && value2(input);
      }), () => {
        flag = !1;
      };
    }, []), value;
  }
  function shellSaveErrorCode(error) {
    if (typeof error == "object" && error !== null && "code" in error) {
      let code = error.code;
      if (typeof code == "string")
        return code;
    }
    return "";
  }
  async function saveThroughShell(file, filename, options = {}) {
    let releaseExport = (0, runtime2.holdExportInProgress)();
    try {
      if (await downloadsWithheld())
        return {
          outcome: "withheld",
          code: "withheld"
        };
      let downloads = await (0, runtime2.getOrLoadHostCapability)("downloads", supportsShellSave);
      if (downloads === null)
        return {
          outcome: "unsupported",
          code: "no_shell_save"
        };
      let value = file instanceof Blob ? file : new Uint8Array(file).buffer, releaseSave = (0, runtime2.holdShellSaveInProgress)();
      try {
        await downloads.save(options.request === void 0 ? {
          filename,
          data: value
        } : {
          filename,
          data: value,
          request: options.request
        });
      } finally {
        releaseSave();
      }
      return {
        outcome: "saved",
        code: ""
      };
    } catch (value) {
      let value2 = shellSaveErrorCode(value);
      return {
        outcome: value2 === "declined" ? "declined" : "unsupported",
        code: value2
      };
    } finally {
      releaseExport();
    }
  }
  return bindRuntimeValue(runtime2, "ReactDownloadsPermission", () => ReactDownloadsPermission, (value) => {
    ReactDownloadsPermission = value;
  }), bindRuntimeValue(runtime2, "DOWNLOADS_UNAVAILABLE_MESSAGE", () => DOWNLOADS_UNAVAILABLE_MESSAGE, (value) => {
    DOWNLOADS_UNAVAILABLE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "MAX_SHELL_DOWNLOAD_BYTES", () => MAX_SHELL_DOWNLOAD_BYTES, (value) => {
    MAX_SHELL_DOWNLOAD_BYTES = value;
  }), bindRuntimeValue(runtime2, "supportsShellSave", () => supportsShellSave, (value) => {
    supportsShellSave = value;
  }), bindRuntimeValue(runtime2, "pageDeclaresDownloads", () => pageDeclaresDownloads), bindRuntimeValue(runtime2, "downloadsWithheld", () => downloadsWithheld), bindRuntimeValue(runtime2, "downloadsCapabilityAvailable", () => downloadsCapabilityAvailable), bindRuntimeValue(runtime2, "cachedDownloadsWithheld", () => cachedDownloadsWithheld, (value) => {
    cachedDownloadsWithheld = value;
  }), bindRuntimeValue(runtime2, "useDownloadsWithheld", () => useDownloadsWithheld), bindRuntimeValue(runtime2, "shellSaveErrorCode", () => shellSaveErrorCode), bindRuntimeValue(runtime2, "saveThroughShell", () => saveThroughShell), () => {
    (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeCompiledPage)(), ReactDownloadsPermission = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), DOWNLOADS_UNAVAILABLE_MESSAGE = "你没有此演示文稿的下载权限。", MAX_SHELL_DOWNLOAD_BYTES = 16777216, supportsShellSave = (0, runtime2.capabilityHasMethod)("save");
  };
}
export {
  installDeliveryShellDownloads
};
