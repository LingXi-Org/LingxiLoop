// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportCodedFailure(runtime2) {
  var CodedFailure, remapNotesPageFailure, slideFailure, initializeCodedFailure;
  function failureKindForLog(error) {
    return error instanceof CodedFailure ? error.kind + (error.slide === void 0 ? "" : ", slide " + String(error.slide)) : typeof error == "object" && error !== null && "kind" in error && typeof error.kind == "string" ? error.kind : error instanceof Error ? error.name : typeof error;
  }
  return bindRuntimeValue(runtime2, "failureKindForLog", () => failureKindForLog), bindRuntimeValue(runtime2, "CodedFailure", () => CodedFailure, (value) => {
    CodedFailure = value;
  }), bindRuntimeValue(runtime2, "remapNotesPageFailure", () => remapNotesPageFailure, (value) => {
    remapNotesPageFailure = value;
  }), bindRuntimeValue(runtime2, "slideFailure", () => slideFailure, (value) => {
    slideFailure = value;
  }), bindRuntimeValue(runtime2, "initializeCodedFailure", () => initializeCodedFailure, (value) => {
    initializeCodedFailure = value;
  }), () => {
    remapNotesPageFailure = (error, slideNumbers) => error instanceof CodedFailure && error.slide !== void 0 ? slideFailure(error, slideNumbers[error.slide - 1] ?? error.slide, !0) : error, slideFailure = (failure, slide, notesPage = !1) => new CodedFailure(failure.kind, "slide " + String(slide) + ": " + failure.message, {
      slide,
      notesPage,
      detail: failure.detail,
      cause: failure
    }), initializeCodedFailure = (0, runtime2.initializeOnce)(() => {
      CodedFailure = class extends Error {
        kind;
        slide;
        notesPage;
        detail;
        constructor(kind, message, options = {}) {
          super(message, {
            cause: options.cause
          });
          this.name = "CodedFailure", this.kind = kind, this.slide = options.slide, this.notesPage = options.notesPage === !0, this.detail = options.detail;
        }
      };
    });
  };
}
export {
  installExportCodedFailure
};
