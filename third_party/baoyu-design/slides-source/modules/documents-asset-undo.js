// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsAssetUndo(runtime2) {
  function findUnusedUploadedAssets(store, assetIds) {
    if (assetIds.length === 0)
      return [];
    let referenced = /* @__PURE__ */ new Set();
    for (let value of store.getSnapshot().meta.order) {
      let value2 = store.getSlide(value);
      value2 && (0, runtime2.collectSlideAssetIds)(value2, referenced);
    }
    return assetIds.filter((input) => !referenced.has(input));
  }
  function createUnusedAssetUndoOperation(store, assetIds) {
    let removed = [];
    return {
      drop: () => {
        for (let value of findUnusedUploadedAssets(store, assetIds)) {
          let value2 = store.getAsset(value);
          value2 === void 0 || removed.some(([input]) => input === value) || (removed.push([value, value2]), store.removeAssetEntry(value));
        }
      },
      restore: () => {
        for (let [value, value2] of removed)
          store.setAssetEntry(value, value2);
        removed = [];
      }
    };
  }
  function filterReferencedDeckAssets(slides, order, assets) {
    let referenced = /* @__PURE__ */ new Set();
    for (let value of order) {
      let value2 = slides[value];
      value2 && (0, runtime2.collectSlideAssetIds)(value2, referenced);
    }
    let entries = Object.entries(assets).filter(([input]) => referenced.has(input));
    return entries.length === Object.keys(assets).length ? assets : Object.fromEntries(entries);
  }
  return bindRuntimeValue(runtime2, "findUnusedUploadedAssets", () => findUnusedUploadedAssets), bindRuntimeValue(runtime2, "createUnusedAssetUndoOperation", () => createUnusedAssetUndoOperation), bindRuntimeValue(runtime2, "filterReferencedDeckAssets", () => filterReferencedDeckAssets), () => {
  };
}
export {
  installDocumentsAssetUndo
};
