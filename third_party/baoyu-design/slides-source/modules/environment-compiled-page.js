// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentCompiledPage(runtime2) {
  var compiledPageDocumentId, compiledPageAppId, compiledPageStyleId, compiledPageModeId, emulatorShimId, compiledPageCapabilitiesMetaName, defaultCompiledPageCapabilities, compiledPageMaxBytes, thumbnailDeferAttribute, databaseCapabilityKey, initializeCompiledPage;
  function emulatorBuildMetaName() {
    return ["appifact", "emulator", "build"].join("-");
  }
  function escapePageHtmlAttribute(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  }
  function escapeHtmlComment(text) {
    return text.replaceAll("-->", "--​>").replaceAll("--!>", "--​!>");
  }
  function stringifyInlineJson(value) {
    return JSON.stringify(value).replaceAll("<", "\\u003c");
  }
  function compiledPageHtmlAttributes(capabilities) {
    return 'lang="en" ' + runtime2.rootHtmlAttributes + (capabilitiesUseDatabase(capabilities) ? " " + thumbnailDeferAttribute : "");
  }
  function assembleCompiledPage(page, appScript) {
    return [
      "<!doctype html>",
      "<html " + compiledPageHtmlAttributes(page.capabilities ?? defaultCompiledPageCapabilities) + ">",
      "<head>",
      '<meta charset="utf-8">',
      "<title>" + escapePageHtmlAttribute(page.title) + "</title>",
      "<!-- README",
      escapeHtmlComment(page.readme),
      "-->",
      '<meta name="README" content="' + escapePageHtmlAttribute(page.readmeMeta) + '">',
      '<meta name="' + compiledPageCapabilitiesMetaName + '" content="' + escapePageHtmlAttribute(page.capabilities ?? defaultCompiledPageCapabilities) + '">',
      ...page.emulator ? [
        '<meta name="' + emulatorBuildMetaName() + '" content="unshippable">'
      ] : [],
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<script id="' + compiledPageModeId + '">' + (0, runtime2.colorModeBootstrapScript)(page.colorMode) + "<\/script>",
      ...page.emulator && page.emulatorShim !== void 0 ? [
        '<script id="' + emulatorShimId + '">',
        page.emulatorShim,
        "<\/script>"
      ] : [],
      '<style id="' + compiledPageStyleId + '">',
      page.css,
      "</style>",
      "</head>",
      "<body>",
      '<div id="root"></div>',
      ...appScript !== void 0 ? [
        '<script type="application/json" id="' + compiledPageDocumentId + '">',
        appScript,
        "<\/script>"
      ] : [],
      '<script id="' + compiledPageAppId + '">',
      page.js,
      "<\/script>",
      "</body>",
      "</html>",
      ""
    ].join(`
`);
  }
  function readCompiledPageDocument(document2) {
    let value = document2.getElementById(compiledPageDocumentId);
    if (value)
      try {
        return JSON.parse(value.textContent ?? "");
      } catch {
        return;
      }
  }
  function readCompiledPageAnatomy(document2) {
    let value = document2.getElementById(compiledPageAppId), value2 = document2.getElementById(compiledPageStyleId);
    if (!value || !value2)
      throw Error("page anatomy missing (#" + compiledPageAppId + " / #" + compiledPageStyleId + ") — this page was not assembled by the appifact compile step, so it cannot safely re-render itself.");
    let text = "";
    for (let value9 of Array.from(document2.head.childNodes))
      if (value9.nodeType === 8) {
        let data = value9.data;
        if (data.startsWith(` README
`) && data.endsWith(`
`)) {
          text = data.slice(8, -1);
          break;
        }
      }
    let value3 = document2.querySelector('meta[name="README"]')?.getAttribute("content") ?? "", value4 = document2.querySelector('meta[name="' + emulatorBuildMetaName() + '"]') !== null, value5 = document2.getElementById(emulatorShimId), callback = (input) => {
      let value9 = input ?? "";
      return value9.startsWith(`
`) && value9.endsWith(`
`) ? value9.slice(1, -1) : value9;
    }, value6 = document2.querySelector('meta[name="' + compiledPageCapabilitiesMetaName + '"]')?.getAttribute("content") ?? defaultCompiledPageCapabilities, value7 = document2.getElementById(compiledPageModeId)?.textContent ?? "", value8 = ["light", "dark"].find((input) => value7 === (0, runtime2.colorModeBootstrapScript)(input));
    return {
      title: document2.querySelector("title")?.textContent ?? "",
      capabilities: value6,
      readme: text,
      readmeMeta: value3,
      css: callback(value2.textContent),
      js: callback(value.textContent),
      emulator: value4,
      emulatorShim: value4 && value5 ? callback(value5.textContent) : void 0,
      ...value8 !== void 0 ? {
        colorMode: value8
      } : {}
    };
  }
  function detectCompiledPageStorageMode(document2) {
    let value = document2.querySelector('meta[name="' + compiledPageCapabilitiesMetaName + '"]')?.getAttribute("content") ?? "";
    return capabilitiesUseDatabase(value) ? "db" : document2.getElementById(compiledPageDocumentId) !== null ? "page" : "files";
  }
  function capabilitiesUseDatabase(capabilities) {
    try {
      let value = JSON.parse(capabilities);
      return typeof value == "object" && value !== null && Object.hasOwn(value, databaseCapabilityKey);
    } catch {
      return !1;
    }
  }
  return bindRuntimeValue(runtime2, "emulatorBuildMetaName", () => emulatorBuildMetaName), bindRuntimeValue(runtime2, "escapePageHtmlAttribute", () => escapePageHtmlAttribute), bindRuntimeValue(runtime2, "escapeHtmlComment", () => escapeHtmlComment), bindRuntimeValue(runtime2, "stringifyInlineJson", () => stringifyInlineJson), bindRuntimeValue(runtime2, "compiledPageHtmlAttributes", () => compiledPageHtmlAttributes), bindRuntimeValue(runtime2, "assembleCompiledPage", () => assembleCompiledPage), bindRuntimeValue(runtime2, "readCompiledPageDocument", () => readCompiledPageDocument), bindRuntimeValue(runtime2, "readCompiledPageAnatomy", () => readCompiledPageAnatomy), bindRuntimeValue(runtime2, "detectCompiledPageStorageMode", () => detectCompiledPageStorageMode), bindRuntimeValue(runtime2, "capabilitiesUseDatabase", () => capabilitiesUseDatabase), bindRuntimeValue(runtime2, "compiledPageDocumentId", () => compiledPageDocumentId, (value) => {
    compiledPageDocumentId = value;
  }), bindRuntimeValue(runtime2, "compiledPageAppId", () => compiledPageAppId, (value) => {
    compiledPageAppId = value;
  }), bindRuntimeValue(runtime2, "compiledPageStyleId", () => compiledPageStyleId, (value) => {
    compiledPageStyleId = value;
  }), bindRuntimeValue(runtime2, "compiledPageModeId", () => compiledPageModeId, (value) => {
    compiledPageModeId = value;
  }), bindRuntimeValue(runtime2, "emulatorShimId", () => emulatorShimId, (value) => {
    emulatorShimId = value;
  }), bindRuntimeValue(runtime2, "compiledPageCapabilitiesMetaName", () => compiledPageCapabilitiesMetaName, (value) => {
    compiledPageCapabilitiesMetaName = value;
  }), bindRuntimeValue(runtime2, "defaultCompiledPageCapabilities", () => defaultCompiledPageCapabilities, (value) => {
    defaultCompiledPageCapabilities = value;
  }), bindRuntimeValue(runtime2, "compiledPageMaxBytes", () => compiledPageMaxBytes, (value) => {
    compiledPageMaxBytes = value;
  }), bindRuntimeValue(runtime2, "thumbnailDeferAttribute", () => thumbnailDeferAttribute, (value) => {
    thumbnailDeferAttribute = value;
  }), bindRuntimeValue(runtime2, "databaseCapabilityKey", () => databaseCapabilityKey, (value) => {
    databaseCapabilityKey = value;
  }), bindRuntimeValue(runtime2, "initializeCompiledPage", () => initializeCompiledPage, (value) => {
    initializeCompiledPage = value;
  }), () => {
    compiledPageDocumentId = "appifact-doc", compiledPageAppId = "appifact-app", compiledPageStyleId = "appifact-style", compiledPageModeId = "appifact-mode", compiledPageCapabilitiesMetaName = "appifact-capabilities", defaultCompiledPageCapabilities = '{"self":{}}', compiledPageMaxBytes = 16777216, thumbnailDeferAttribute = "data-thumb-defer", databaseCapabilityKey = "db", initializeCompiledPage = (0, runtime2.initializeOnce)(() => {
      emulatorShimId = ["appifact", "emulator", "shim"].join("-");
    });
  };
}
export {
  installEnvironmentCompiledPage
};
