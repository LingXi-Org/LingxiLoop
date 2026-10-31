// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiFindHighlights(runtime2) {
  var findHighlightStylesheets;
  function cssHighlightApi(page) {
    let defaultView = page.defaultView, value = defaultView?.CSS?.highlights;
    return !defaultView || !value || typeof defaultView.Highlight != "function" || typeof defaultView.CSSStyleSheet != "function" ? null : {
      highlights: value,
      Highlight: defaultView.Highlight,
      CSSStyleSheet: defaultView.CSSStyleSheet
    };
  }
  function adoptFindStylesheet(page, sheet) {
    if (!page.adoptedStyleSheets.includes(sheet))
      try {
        page.adoptedStyleSheets.push(sheet);
      } catch {
        page.adoptedStyleSheets = [...page.adoptedStyleSheets, sheet];
      }
  }
  function removeFindStylesheet(page, sheet) {
    let value = page.adoptedStyleSheets.indexOf(sheet);
    if (value !== -1)
      try {
        page.adoptedStyleSheets.splice(value, 1);
      } catch {
        page.adoptedStyleSheets = page.adoptedStyleSheets.filter((input) => input !== sheet);
      }
  }
  function setFindHighlights(page, ranges, current) {
    let value = cssHighlightApi(page);
    if (value === null)
      return !1;
    let entry = findHighlightStylesheets.get(page);
    return entry === void 0 && (entry = new value.CSSStyleSheet(), entry.replaceSync("::highlight(mc-find) { background-color: rgb(255 213 0); color: #000; } ::highlight(mc-find-active) { background-color: rgb(255 150 50); color: #000; }"), findHighlightStylesheets.set(page, entry)), adoptFindStylesheet(page, entry), value.highlights.set("mc-find", new value.Highlight(...ranges.filter((input) => input !== current))), current === null ? value.highlights.delete("mc-find-active") : value.highlights.set("mc-find-active", new value.Highlight(current)), !0;
  }
  function clearFindHighlights(page) {
    let value = cssHighlightApi(page);
    value?.highlights.delete("mc-find"), value?.highlights.delete("mc-find-active");
    let entry = findHighlightStylesheets.get(page);
    entry !== void 0 && (removeFindStylesheet(page, entry), findHighlightStylesheets.delete(page));
  }
  return bindRuntimeValue(runtime2, "findHighlightStylesheets", () => findHighlightStylesheets, (value) => {
    findHighlightStylesheets = value;
  }), bindRuntimeValue(runtime2, "cssHighlightApi", () => cssHighlightApi), bindRuntimeValue(runtime2, "adoptFindStylesheet", () => adoptFindStylesheet), bindRuntimeValue(runtime2, "removeFindStylesheet", () => removeFindStylesheet), bindRuntimeValue(runtime2, "setFindHighlights", () => setFindHighlights), bindRuntimeValue(runtime2, "clearFindHighlights", () => clearFindHighlights), () => {
    findHighlightStylesheets = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installUiFindHighlights
};
