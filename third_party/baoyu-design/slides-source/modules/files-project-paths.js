// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesProjectPaths(runtime2) {
  var PROJECT_INDEX_PATHS, LEGACY_PROJECT_INDEX_PATHS, isRuntimeInternalFilePath, isProjectIndexFilePath;
  return bindRuntimeValue(runtime2, "PROJECT_INDEX_PATHS", () => PROJECT_INDEX_PATHS, (value) => {
    PROJECT_INDEX_PATHS = value;
  }), bindRuntimeValue(runtime2, "LEGACY_PROJECT_INDEX_PATHS", () => LEGACY_PROJECT_INDEX_PATHS, (value) => {
    LEGACY_PROJECT_INDEX_PATHS = value;
  }), bindRuntimeValue(runtime2, "isRuntimeInternalFilePath", () => isRuntimeInternalFilePath, (value) => {
    isRuntimeInternalFilePath = value;
  }), bindRuntimeValue(runtime2, "isProjectIndexFilePath", () => isProjectIndexFilePath, (value) => {
    isProjectIndexFilePath = value;
  }), () => {
    PROJECT_INDEX_PATHS = {
      design: "project/canvas.json",
      slides: "project/deck.json",
      designSystem: "project/design-system.json"
    }, LEGACY_PROJECT_INDEX_PATHS = {
      designSystem: "design-system.json"
    }, isRuntimeInternalFilePath = (input) => input === "index.html" || input === "SKILL.md" || input.startsWith("artifact-type/"), isProjectIndexFilePath = (input) => input === PROJECT_INDEX_PATHS.design || input === PROJECT_INDEX_PATHS.slides || input === PROJECT_INDEX_PATHS.designSystem || input === LEGACY_PROJECT_INDEX_PATHS.designSystem;
  };
}
export {
  installFilesProjectPaths
};
