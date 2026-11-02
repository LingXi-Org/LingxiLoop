// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesEarlySlides(runtime2) {
  var MAX_EARLY_FILE_SLIDES;
  async function readEarlySlidesFilesEnvelope(readText) {
    let indexText = await readText(runtime2.DECK_METADATA_PATH), rawIndex;
    try {
      rawIndex = indexText === null ? null : JSON.parse(indexText);
    } catch {
      rawIndex = null;
    }
    if (typeof rawIndex != "object" || rawIndex === null || Array.isArray(rawIndex))
      return null;
    let index4 = (0, runtime2.normalizeDeckMetadata)(rawIndex), order = [
      ...index4.cover !== void 0 ? [index4.cover] : [],
      ...index4.order.filter((input) => input !== index4.cover)
    ].filter((input) => (0, runtime2.slideIdFromFilePath)((0, runtime2.slideFilePath)(input)) !== void 0).slice(0, MAX_EARLY_FILE_SLIDES), entries = /* @__PURE__ */ new Map();
    for (let value of order) {
      let value2 = await readText((0, runtime2.slideFilePath)(value));
      value2 !== null && entries.set((0, runtime2.slideFilePath)(value), value2);
    }
    return {
      index: {
        ...index4,
        order: index4.order.filter((input) => entries.has((0, runtime2.slideFilePath)(input)))
      },
      files: entries
    };
  }
  return bindRuntimeValue(runtime2, "MAX_EARLY_FILE_SLIDES", () => MAX_EARLY_FILE_SLIDES, (value) => {
    MAX_EARLY_FILE_SLIDES = value;
  }), bindRuntimeValue(runtime2, "readEarlySlidesFilesEnvelope", () => readEarlySlidesFilesEnvelope), () => {
    MAX_EARLY_FILE_SLIDES = 4;
  };
}
export {
  installFilesEarlySlides
};
