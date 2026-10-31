// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportFilenames(runtime2) {
  var initializeCaptureFallback;
  function bytesToBase64(bytes) {
    let binary = "";
    for (let index4 = 0; index4 < bytes.length; index4 += 32768)
      binary += String.fromCharCode(...bytes.subarray(index4, index4 + 32768));
    return btoa(binary);
  }
  function exportFilename(title, extension) {
    return (title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "presentation") + "." + extension;
  }
  function slideExportFilename(title, slideNumber, extension) {
    let suffix = " - slide " + String(slideNumber), basename = [
      ...exportFilename(title, extension).slice(0, -(extension.length + 1))
    ].slice(0, 120 - suffix.length), utf8Length = (input) => new TextEncoder().encode(input).length;
    for (; basename.length > 1 && utf8Length(basename.join("") + suffix + "." + extension) > 240; )
      basename.pop();
    return basename.join("").trimEnd() + suffix + "." + extension;
  }
  return bindRuntimeValue(runtime2, "initializeCaptureFallback", () => initializeCaptureFallback, (value) => {
    initializeCaptureFallback = value;
  }), bindRuntimeValue(runtime2, "bytesToBase64", () => bytesToBase64), bindRuntimeValue(runtime2, "exportFilename", () => exportFilename), bindRuntimeValue(runtime2, "slideExportFilename", () => slideExportFilename), () => {
    initializeCaptureFallback = () => {
    };
  };
}
export {
  installExportFilenames
};
