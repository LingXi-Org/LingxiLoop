// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsReadiness(runtime2) {
  var fontReadyTimeoutMs, unquoteFontFamilyName, fontTimeoutWarning, fontUnavailableWarning, initializeCaptureFallback;
  function loadingFontFaces(fontFaces) {
    return [...fontFaces].filter((state) => state.status === "loading");
  }
  function uniqueFontFamilyNames(fontFaces) {
    return [
      ...new Set(fontFaces.map((input) => unquoteFontFamilyName(input.family)))
    ];
  }
  async function waitForDocumentFonts(fontSet, timeoutMs) {
    if (timeoutMs === void 0)
      return await fontSet.ready, [];
    if (await promiseWithTimeout(fontSet.ready.then(() => "ready"), timeoutMs) === "ready")
      return [];
    let loadingFaces = loadingFontFaces(fontSet), fontDescription = loadingFaces.map((input) => unquoteFontFamilyName(input.family) + " " + input.weight + " " + input.style).join(", ");
    return console.warn("Slides export: stopped waiting for fonts after " + String(timeoutMs) + " ms" + (loadingFaces.length > 0 ? ". Still loading: " + fontDescription + ". Text in those faces is measured and drawn with a fallback font, so the exported file may differ from the slides on screen." : "; no face reports itself still loading, so going on with the fonts available now.")), loadingFaces;
  }
  function promiseWithTimeout(promise, timeoutMs) {
    let timeout, timeoutPromise = new Promise((input) => {
      timeout = setTimeout(() => input(void 0), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
  }
  return bindRuntimeValue(runtime2, "loadingFontFaces", () => loadingFontFaces), bindRuntimeValue(runtime2, "uniqueFontFamilyNames", () => uniqueFontFamilyNames), bindRuntimeValue(runtime2, "waitForDocumentFonts", () => waitForDocumentFonts), bindRuntimeValue(runtime2, "promiseWithTimeout", () => promiseWithTimeout), bindRuntimeValue(runtime2, "fontReadyTimeoutMs", () => fontReadyTimeoutMs, (value) => {
    fontReadyTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "unquoteFontFamilyName", () => unquoteFontFamilyName, (value) => {
    unquoteFontFamilyName = value;
  }), bindRuntimeValue(runtime2, "fontTimeoutWarning", () => fontTimeoutWarning, (value) => {
    fontTimeoutWarning = value;
  }), bindRuntimeValue(runtime2, "fontUnavailableWarning", () => fontUnavailableWarning, (value) => {
    fontUnavailableWarning = value;
  }), bindRuntimeValue(runtime2, "initializeCaptureFallback", () => initializeCaptureFallback, (value) => {
    initializeCaptureFallback = value;
  }), () => {
    fontReadyTimeoutMs = 6e3, unquoteFontFamilyName = (input) => input.replace(/["']/g, ""), fontTimeoutWarning = (families, mode) => (0, runtime2.exportNote)("fonts_late", {
      families,
      how: mode
    }), fontUnavailableWarning = (families, mode) => (0, runtime2.exportNote)("fonts_missing", {
      families,
      how: mode
    }), initializeCaptureFallback = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeExportNotes)();
    });
  };
}
export {
  installFontsReadiness
};
