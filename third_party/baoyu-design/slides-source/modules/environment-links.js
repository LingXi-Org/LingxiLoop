// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentLinks(runtime2) {
  var externalLinkPattern, storedLinkPattern, linkModifierLabel, linkOpenHint, createLinkEnterHandler, modifiedLinkEnterHandler, linkEnterHandler, initializeExternalLinks;
  function truncateUtf16Safely(text, maxLength) {
    if (text.length <= maxLength)
      return text;
    let value = text.slice(0, maxLength), value2 = value.charCodeAt(value.length - 1);
    return value2 >= 55296 && value2 <= 56319 ? value.slice(0, -1) : value;
  }
  function classifyExternalLink(url, options) {
    if (!(options?.storedUrl === !0 ? storedLinkPattern : externalLinkPattern).test(url))
      return null;
    let value;
    try {
      value = new URL(url);
    } catch {
      return null;
    }
    let value2 = typeof location > "u" ? "" : location.hostname, value3 = value2.replace(/^[^.]+\./, ""), hostname = value.hostname;
    return hostname === "" || hostname.endsWith(".") || hostname === value2 || value.username !== "" || value.password !== "" || value3.includes(".") && (hostname === value3 || hostname.endsWith("." + value3)) ? null : url;
  }
  function linkUrlFromElement(element) {
    let value = element.getAttribute("href") || element.getAttribute("data-href") || "";
    return externalLinkPattern.test(value) ? value : "";
  }
  function openExternalLink(url, options) {
    if (classifyExternalLink(url, options) === null)
      return;
    let value = document.createElement("a");
    value.href = url, value.target = "_blank", value.rel = "noopener noreferrer", document.body.append(value), value.click(), value.remove();
  }
  return bindRuntimeValue(runtime2, "truncateUtf16Safely", () => truncateUtf16Safely), bindRuntimeValue(runtime2, "classifyExternalLink", () => classifyExternalLink), bindRuntimeValue(runtime2, "linkUrlFromElement", () => linkUrlFromElement), bindRuntimeValue(runtime2, "openExternalLink", () => openExternalLink), bindRuntimeValue(runtime2, "externalLinkPattern", () => externalLinkPattern, (value) => {
    externalLinkPattern = value;
  }), bindRuntimeValue(runtime2, "storedLinkPattern", () => storedLinkPattern, (value) => {
    storedLinkPattern = value;
  }), bindRuntimeValue(runtime2, "linkModifierLabel", () => linkModifierLabel, (value) => {
    linkModifierLabel = value;
  }), bindRuntimeValue(runtime2, "linkOpenHint", () => linkOpenHint, (value) => {
    linkOpenHint = value;
  }), bindRuntimeValue(runtime2, "createLinkEnterHandler", () => createLinkEnterHandler, (value) => {
    createLinkEnterHandler = value;
  }), bindRuntimeValue(runtime2, "modifiedLinkEnterHandler", () => modifiedLinkEnterHandler, (value) => {
    modifiedLinkEnterHandler = value;
  }), bindRuntimeValue(runtime2, "linkEnterHandler", () => linkEnterHandler, (value) => {
    linkEnterHandler = value;
  }), bindRuntimeValue(runtime2, "initializeExternalLinks", () => initializeExternalLinks, (value) => {
    initializeExternalLinks = value;
  }), () => {
    createLinkEnterHandler = (input) => (event) => {
      event.key !== "Enter" || event.nativeEvent?.isComposing || input && !(event.metaKey || event.ctrlKey) || (event.preventDefault(), openExternalLink(linkUrlFromElement(event.currentTarget)));
    }, initializeExternalLinks = (0, runtime2.initializeOnce)(() => {
      externalLinkPattern = /^https?:\/\/[^\s)\[]*$/, storedLinkPattern = /^https?:\/\/\S*$/, linkModifierLabel = (0, runtime2.isApplePlatform)() ? "⌘" : "Ctrl", linkOpenHint = " (" + linkModifierLabel + "-click or " + linkModifierLabel + "+Enter to open)", modifiedLinkEnterHandler = createLinkEnterHandler(!0), linkEnterHandler = createLinkEnterHandler(!1);
    });
  };
}
export {
  installEnvironmentLinks
};
