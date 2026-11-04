// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorChangeAnnouncements(runtime2) {
  var PRESENTATION_CHANGE_ANNOUNCEMENTS, slideAnnouncementFingerprintCache;
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
  return bindRuntimeValue(runtime2, "PRESENTATION_CHANGE_ANNOUNCEMENTS", () => PRESENTATION_CHANGE_ANNOUNCEMENTS, (value) => {
    PRESENTATION_CHANGE_ANNOUNCEMENTS = value;
  }), bindRuntimeValue(runtime2, "slideAnnouncementFingerprintCache", () => slideAnnouncementFingerprintCache, (value) => {
    slideAnnouncementFingerprintCache = value;
  }), bindRuntimeValue(runtime2, "createSlideAnnouncementFingerprints", () => createSlideAnnouncementFingerprints), bindRuntimeValue(runtime2, "slideAnnouncementFingerprint", () => slideAnnouncementFingerprint), () => {
    (0, runtime2.initializeHtmlWriter)(), PRESENTATION_CHANGE_ANNOUNCEMENTS = {
      ready: (input) =>(0, runtime2.formatMessage) ({
        defaultMessage: "演示文稿已就绪，共 {count} 页",
        id : "yeiww4KNy+"
      }, {
        n: input,
        count: String (input)
      }),
      updated: (input) => (0, runtime2.formatMessage)({
        defaultMessage: "已更新 {count} 页幻灯片",
        id: "iV38ozgEHj"
      }, {
        n: input,
        count: String(input)
      }),
      changed: (input) => (0, runtime2.formatMessage)({
        defaultMessage: "{n, plural, =0 {演示文稿已更新，已无幻灯片} other {演示文稿已更新，共 {count} 页}}",
        id: "+sEQcoZWI5"
      }, {
        n:input,
        count : String(input)
      })
    }, slideAnnouncementFingerprintCache = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installEditorChangeAnnouncements
};
