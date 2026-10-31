// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentColorMode(runtime2) {
  var defaultDensity, rootHtmlAttributes, automaticColorModeScript, pinnedColorModeAttribute;
  function colorModeBootstrapScript(mode) {
    return mode === void 0 ? automaticColorModeScript : "(function(){var h=document.documentElement;h.setAttribute('data-mode','" + mode + "');h.setAttribute('data-mode-pin','" + mode + "')})();";
  }
  function initializeDocumentColorMode(document2) {
    let documentElement = document2.documentElement;
    documentElement.classList.add("cds-root"), documentElement.hasAttribute("data-density") || documentElement.setAttribute("data-density", "comfortable");
    let attribute = documentElement.getAttribute("data-mode-pin");
    if (attribute === "light" || attribute === "dark")
      return documentElement.setAttribute("data-mode", attribute), () => {
      };
    let callback = () => {
      let attribute2 = documentElement.getAttribute("data-theme");
      attribute2 === "light" || attribute2 === "dark" ? documentElement.setAttribute("data-mode", attribute2) : documentElement.removeAttribute("data-mode");
    };
    callback();
    let value = document2.defaultView?.MutationObserver;
    if (value === void 0)
      return () => {
      };
    let value2 = new value(callback);
    return value2.observe(documentElement, {
      attributes: !0,
      attributeFilter: ["data-theme"]
    }), () => value2.disconnect();
  }
  return bindRuntimeValue(runtime2, "colorModeBootstrapScript", () => colorModeBootstrapScript), bindRuntimeValue(runtime2, "initializeDocumentColorMode", () => initializeDocumentColorMode), bindRuntimeValue(runtime2, "defaultDensity", () => defaultDensity, (value) => {
    defaultDensity = value;
  }), bindRuntimeValue(runtime2, "rootHtmlAttributes", () => rootHtmlAttributes, (value) => {
    rootHtmlAttributes = value;
  }), bindRuntimeValue(runtime2, "automaticColorModeScript", () => automaticColorModeScript, (value) => {
    automaticColorModeScript = value;
  }), bindRuntimeValue(runtime2, "pinnedColorModeAttribute", () => pinnedColorModeAttribute, (value) => {
    pinnedColorModeAttribute = value;
  }), () => {
    defaultDensity = "comfortable", rootHtmlAttributes = 'class="cds-root" data-density="comfortable"', automaticColorModeScript = "(function(){var h=document.documentElement;function s(){var t=h.getAttribute('data-theme');if(t==='light'||t==='dark'){h.setAttribute('data-mode',t)}else{h.removeAttribute('data-mode')}}s();if(typeof MutationObserver==='function'){new MutationObserver(s).observe(h,{attributes:true,attributeFilter:['data-theme']})}})();", pinnedColorModeAttribute = "data-mode-pin";
  };
}
export {
  installEnvironmentColorMode
};
