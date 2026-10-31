// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorChangeAnnouncements(runtime2) {
  var formatSlideCount, PRESENTATION_CHANGE_ANNOUNCEMENTS, slideAnnouncementFingerprintCache;
  function createSlideAnnouncementFingerprints(content) {
    let fingerprints = /* @__PURE__ */ new Map();
    for (let value2 of content.order) {
      let value3 = content.slides[value2];
      if (value3 === void 0)
        continue;
      let entry = slideAnnouncementFingerprintCache.get(value3);
      (entry === void 0 || entry.theme !== content.theme || entry.fonts !== content.fonts || entry.assets !== content.assets) && slideAnnouncementFingerprintCache.set(value3, entry = {
        theme: content.theme,
        fonts: content.fonts,
        assets: content.assets,
        html: (0, runtime2.serializeSlideHtml)(content, value3)
      }), fingerprints.set(value2, entry.html);
    }
    let value = [...content.sections ?? []].sort((input, options) => input.id < options.id ? -1 : input.id > options.id ? 1 : 0);
    return fingerprints.set(runtime2.REMOTE_CHANGE_WORD_SEPARATOR + "deck", slideAnnouncementFingerprint([
      content.order,
      value,
      content.theme,
      content.fonts,
      content.faces,
      content.cover,
      content.format
    ])), fingerprints;
  }
  function slideAnnouncementFingerprint(value) {
    return JSON.stringify(value, (input, items) => {
      if (typeof items == "string")
        return items.startsWith("data:") ? items.length : items;
      if (typeof items != "object" || items === null || Array.isArray(items))
        return items;
      let value2 = items;
      return Object.fromEntries(Object.keys(value2).sort().map((input2) => [
        input2,
        value2[input2]
      ]));
    });
  }
  return bindRuntimeValue(runtime2, "formatSlideCount", () => formatSlideCount, (value) => {
    formatSlideCount = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_CHANGE_ANNOUNCEMENTS", () => PRESENTATION_CHANGE_ANNOUNCEMENTS, (value) => {
    PRESENTATION_CHANGE_ANNOUNCEMENTS = value;
  }), bindRuntimeValue(runtime2, "slideAnnouncementFingerprintCache", () => slideAnnouncementFingerprintCache, (value) => {
    slideAnnouncementFingerprintCache = value;
  }), bindRuntimeValue(runtime2, "createSlideAnnouncementFingerprints", () => createSlideAnnouncementFingerprints), bindRuntimeValue(runtime2, "slideAnnouncementFingerprint", () => slideAnnouncementFingerprint), () => {
    (0, runtime2.initializeHtmlWriter)(), formatSlideCount = (count) => String(count) + (count === 1 ? " slide" : " 页幻灯片"), PRESENTATION_CHANGE_ANNOUNCEMENTS = {
      ready: (input) => "Presentation ready, " + formatSlideCount(input),
      updated: (input) => formatSlideCount(input) + " updated",
      changed: (input) => "Presentation updated, " + (input === 0 ? "no slides left" : formatSlideCount(input) + " in all")
    }, slideAnnouncementFingerprintCache = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installEditorChangeAnnouncements
};
