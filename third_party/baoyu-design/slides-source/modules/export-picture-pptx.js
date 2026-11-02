// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPicturePptx(runtime2) {
  var picturePptxExports, PICTURE_ALT_MAX, initializePicturePptx;
  function pictureAltText(slide) {
    return (0, runtime2.normalizeDescription)(slide.textRuns.map((input) => input.text).join(" "), PICTURE_ALT_MAX);
  }
  async function slidePicturesToPptxBlob(title, slides, captures) {
    if (slides.length !== captures.length)
      throw Error("one captured page per slide expected");
    await runtime2.loadPptx?.();
    let value = (0, runtime2.createPptxPresentation)(title), value2 = (0, runtime2.pxToInches)(runtime2.SLIDE_WIDTH), value3 = (0, runtime2.pxToInches)(runtime2.SLIDE_HEIGHT);
    return value.defineLayout({
      name: "APPIFACT",
      width: value2,
      height: value3
    }), value.layout = "APPIFACT", captures.forEach((input, options) => {
      let value4 = value.addSlide(), value5 = "幻灯片 " + String(options + 1);
      value4.addImage({
        data: "data:image/jpeg;base64," + (0, runtime2.bytesToBase64)(input.jpeg),
        x: 0,
        y: 0,
        w: value2,
        h: value3,
        altText: pictureAltText(input) || value5,
        objectName: value5
      });
      let notes = slides[options].notes;
      notes !== void 0 && value4.addNotes(notes);
    }), await value.write({
      outputType: "blob",
      compression: !1
    });
  }
  return bindRuntimeValue(runtime2, "picturePptxExports", () => picturePptxExports, (value) => {
    picturePptxExports = value;
  }), bindRuntimeValue(runtime2, "pictureAltText", () => pictureAltText), bindRuntimeValue(runtime2, "slidePicturesToPptxBlob", () => slidePicturesToPptxBlob), bindRuntimeValue(runtime2, "PICTURE_ALT_MAX", () => PICTURE_ALT_MAX, (value) => {
    PICTURE_ALT_MAX = value;
  }), bindRuntimeValue(runtime2, "initializePicturePptx", () => initializePicturePptx, (value) => {
    initializePicturePptx = value;
  }), () => {
    picturePptxExports = {}, (0, runtime2.defineLiveExports)(picturePptxExports, {
      slidePicturesToPptxBlob: () => slidePicturesToPptxBlob
    }), PICTURE_ALT_MAX = 1e3, initializePicturePptx = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializePptxExport)();
    });
  };
}
export {
  installExportPicturePptx
};
