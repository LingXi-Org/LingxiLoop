// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsReadiness(runtime2) {
  var fontReadyTimeoutMs, unquoteFontFamilyName;
  function loadingFontFaces(fontFaces) {
    return [...fontFaces].filter((state) => state.status === "loading");
  }
  function uniqueFontFamilyNames(fontFaces) {
    return [
      ...new Set(fontFaces.map((input) => unquoteFontFamilyName(input.family)))
    ];
  }
  function fontTimeoutWarning(families, mode) {
    let textPossessive = "some of " + (families.length === 1 ? "its" : "their") + "文字";
    return formatFontFamilyList(families) + " did not load in time" + (mode === "drawn" ? ", so " + textPossessive + " may be drawn in a substitute font or not fit its box" : "; " + textPossessive + " was sized with a substitute font and may not fit its box exactly");
  }
  function fontUnavailableWarning(families, mode) {
    let singleFamily = families.length === 1, textPossessive = (singleFamily ? "its" : "their") + "文字";
    return formatFontFamilyList(families) + (singleFamily ? " was" : " were") + " not available" + (mode === "drawn" ? ", so " + textPossessive + " is drawn in a substitute font and may not fit its box" : "; " + textPossessive + " was sized with a substitute font and may not fit its box exactly");
  }
  function formatFontFamilyList(families) {
    return families.length === 1 ? "the font " + String(families[0]) : "the fonts " + families.slice(0, -1).join(", ") + " and " + String(families[families.length - 1]);
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
  return bindRuntimeValue(runtime2, "loadingFontFaces", () => loadingFontFaces), bindRuntimeValue(runtime2, "uniqueFontFamilyNames", () => uniqueFontFamilyNames), bindRuntimeValue(runtime2, "fontTimeoutWarning", () => fontTimeoutWarning), bindRuntimeValue(runtime2, "fontUnavailableWarning", () => fontUnavailableWarning), bindRuntimeValue(runtime2, "formatFontFamilyList", () => formatFontFamilyList), bindRuntimeValue(runtime2, "waitForDocumentFonts", () => waitForDocumentFonts), bindRuntimeValue(runtime2, "promiseWithTimeout", () => promiseWithTimeout), bindRuntimeValue(runtime2, "fontReadyTimeoutMs", () => fontReadyTimeoutMs, (value) => {
    fontReadyTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "unquoteFontFamilyName", () => unquoteFontFamilyName, (value) => {
    unquoteFontFamilyName = value;
  }), () => {
    fontReadyTimeoutMs = 6e3, unquoteFontFamilyName = (input) => input.replace(/["']/g, "");
  };
}
export {
  installFontsReadiness
};
