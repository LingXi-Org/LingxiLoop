// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBootLegacyHtml(runtime2) {
  var LEGACY_SLIDES_HTML_PATH, LEGACY_SLIDES_DEMO_PATH, MAX_LEGACY_HTML_CHARS, parseLegacySlidesHtml;
  return bindRuntimeValue(runtime2, "LEGACY_SLIDES_HTML_PATH", () => LEGACY_SLIDES_HTML_PATH, (value) => {
    LEGACY_SLIDES_HTML_PATH = value;
  }), bindRuntimeValue(runtime2, "LEGACY_SLIDES_DEMO_PATH", () => LEGACY_SLIDES_DEMO_PATH, (value) => {
    LEGACY_SLIDES_DEMO_PATH = value;
  }), bindRuntimeValue(runtime2, "MAX_LEGACY_HTML_CHARS", () => MAX_LEGACY_HTML_CHARS, (value) => {
    MAX_LEGACY_HTML_CHARS = value;
  }), bindRuntimeValue(runtime2, "parseLegacySlidesHtml", () => parseLegacySlidesHtml, (value) => {
    parseLegacySlidesHtml = value;
  }), () => {
    (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeSlideModel)(), LEGACY_SLIDES_HTML_PATH = "slides.html", LEGACY_SLIDES_DEMO_PATH = "artifact-type/demo.html", MAX_LEGACY_HTML_CHARS = 33554432, parseLegacySlidesHtml = (html) => {
      if (html.length > MAX_LEGACY_HTML_CHARS)
        return "too large";
      if (!(0, runtime2.looksLikeSlideHtml)(html))
        return "not a slide HTML document";
      let parsed = (0, runtime2.compileSlideHtml)(html);
      if ((0, runtime2.normalizeDeck)(parsed.content).order.length === 0)
        return "no slides";
      let value = parsed.errors[0], value2 = value === void 0 ? void 0 : "Its HTML has " + String(parsed.errors.length) + " 处结构错误" + (parsed.errors.length === 1 ? "" : "s") + " (first at " + String(value.line) + ":" + String(value.col) + "); what could be read is shown.";
      return {
        envelope: parsed.title === void 0 ? {
          content: html
        } : {
          title: parsed.title,
          content: html
        },
        note: value2
      };
    };
  };
}
export {
  installBootLegacyHtml
};
