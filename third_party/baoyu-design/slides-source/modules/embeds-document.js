// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEmbedsDocument(runtime2) {
  var embedSandboxPermissions, webEmbedDiagnosticsScript, initializeEmbedDocument;
  function embedContentSecurityPolicy(allowScripts) {
    return "default-src 'none'; script-src " + (allowScripts ? "'unsafe-inline'" : "'none'") + "; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  }
  function buildEmbedSrcdoc(html, options) {
    let allowScripts = (options.runtime ?? options.allowScripts) && options.allowScripts, interactive = options.interactive === !0 && allowScripts, runtime22 = options.saved !== void 0 || options.keepsSaves === !0 ? (0, runtime2.embedRuntimeBootstrapScript)(interactive, options.saved, options.keepsSaves === !0) : interactive ? runtime2.interactiveEmbedRuntimeScript : runtime2.defaultEmbedRuntimeScript;
    return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="' + embedContentSecurityPolicy(options.allowScripts) + '"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:0;overflow:hidden}' + (interactive ? "html{touch-action:pan-x pan-y}" : "") + "</style></head><body>" + (interactive ? "<script>" + runtime2.embedSharedRootBootstrapScript + webEmbedDiagnosticsScript + "<\/script><script>" + runtime22 + "<\/script>" : allowScripts ? "<script>" + runtime22 + "<\/script>" : "") + html + "</body></html>";
  }
  return bindRuntimeValue(runtime2, "embedContentSecurityPolicy", () => embedContentSecurityPolicy), bindRuntimeValue(runtime2, "buildEmbedSrcdoc", () => buildEmbedSrcdoc), bindRuntimeValue(runtime2, "embedSandboxPermissions", () => embedSandboxPermissions, (value) => {
    embedSandboxPermissions = value;
  }), bindRuntimeValue(runtime2, "webEmbedDiagnosticsScript", () => webEmbedDiagnosticsScript, (value) => {
    webEmbedDiagnosticsScript = value;
  }), bindRuntimeValue(runtime2, "initializeEmbedDocument", () => initializeEmbedDocument, (value) => {
    initializeEmbedDocument = value;
  }), () => {
    embedSandboxPermissions = "allow-scripts", initializeEmbedDocument = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmbedSanitizer)(), (0, runtime2.initializeEmbedRuntimeScript)(), webEmbedDiagnosticsScript = runtime2.embedSandboxDiagnosticsScript.replace(/\[design sandbox\]/g, "[web embed]").replace(/design previews/g, "web embeds").replace(/the design preview sandbox/g, "a web embed");
    });
  };
}
export {
  installEmbedsDocument
};
