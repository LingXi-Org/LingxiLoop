// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelDeckMetadata(runtime2) {
  var DECK_METADATA_PATH, DECK_METADATA_VERSION, SLIDE_FILE_DIRECTORY, SLIDE_FILE_ID_PATTERN, slideFilePath, isMetadataObject, conflictingUndoMessage;
  function slideIdFromFilePath(path) {
    if (!path.startsWith("project/slides/") || !path.endsWith(".html"))
      return;
    let value = path.slice(15, -5);
    if (SLIDE_FILE_ID_PATTERN.test(value))
      return value;
  }
  function normalizeDeckMetadata(metadata) {
    let value = isMetadataObject(metadata) ? metadata : {}, state = {};
    if (isMetadataObject(value.faces))
      for (let [value2, value3] of Object.entries(value.faces)) {
        if (!isMetadataObject(value3) || typeof value3.family != "string")
          continue;
        let value4 = typeof value3.src == "string" && !value3.src.startsWith("data:") ? value3.src : void 0;
        state[value2] = {
          family: value3.family,
          ...typeof value3.href == "string" ? {
            href: value3.href
          } : {},
          ...value4 !== void 0 ? {
            src: value4
          } : {}
        };
      }
    let items = [
      ...new Set((Array.isArray(value.order) ? value.order : []).filter((input) => typeof input == "string"))
    ];
    return {
      ...value,
      v: typeof value.v == "number" ? value.v : 4,
      title: typeof value.title == "string" ? value.title : "",
      ...typeof value.cover == "string" ? {
        cover: value.cover
      } : {},
      order: items,
      sections: isMetadataObject(value.sections) ? value.sections : {},
      faces: state,
      designSystems: (Array.isArray(value.designSystems) ? value.designSystems : isMetadataObject(value.designSystems) ? Object.values(value.designSystems) : []).filter(isMetadataObject),
      attachments: isMetadataObject(value.attachments) ? value.attachments : {}
    };
  }
  function setDeckStyle(target, metadata) {
    metadata.style === void 0 ? delete target.style : target.style = metadata.style;
  }
  function replaceDeckMetadata(target, metadata) {
    target.v = 4, target.title = metadata.title, metadata.cover === void 0 ? delete target.cover : target.cover = metadata.cover, target.order.splice(0, target.order.length, ...metadata.order), setDeckStyle(target, metadata);
    for (let value of ["sections", "faces"]) {
      let value2 = target[value], value3 = metadata[value];
      for (let value4 of Object.keys(value2))
        Object.hasOwn(value3, value4) || delete value2[value4];
      for (let [value4, value5] of Object.entries(value3))
        JSON.stringify(value2[value4]) !== JSON.stringify(value5) && (value2[value4] = value5);
    }
  }
  function patchDeckMetadata(target, before, after) {
    if (before === void 0)
      return replaceDeckMetadata(target, after);
    target.v = 4, before.title !== after.title && (target.title = after.title), before.cover !== after.cover && (after.cover === void 0 ? delete target.cover : target.cover = after.cover), JSON.stringify(before.order) !== JSON.stringify(after.order) && target.order.splice(0, target.order.length, ...after.order), JSON.stringify(before.style) !== JSON.stringify(after.style) && setDeckStyle(target, after);
    let callback = (input) => typeof input == "object" && input !== null && typeof input.family == "string" ? input.family.toLowerCase().replace(/ /g, "-") : void 0;
    for (let value of ["sections", "faces"]) {
      let value2 = target[value], value3 = before[value], value4 = after[value], callback2 = (input, options) => {
        if (!(value !== "faces" || input === void 0))
          for (let value5 of Object.keys(value2))
            value5 !== options && callback(value2[value5]) === input && delete value2[value5];
      };
      for (let value5 of Object.keys(value3))
        Object.hasOwn(value4, value5) || (delete value2[value5], callback2(callback(value3[value5])));
      for (let [value5, value6] of Object.entries(value4))
        JSON.stringify(value3[value5]) !== JSON.stringify(value6) && (callback2(callback(value6), value5), callback2(callback(value3[value5]), value5), value2[value5] = value6);
    }
  }
  function mergeSlideOrder(order, slideIds) {
    let listed = new Set(order);
    return [
      ...order,
      ...[...new Set(slideIds)].sort().filter((id) => !listed.has(id))
    ];
  }
  function restoreKeptListedSlides(metadata, base, keptIds) {
    let baseOrder = (isMetadataObject(base) && Array.isArray(base.order) ? base.order : []).filter((input) => typeof input == "string"), missing2 = [...new Set(baseOrder)].filter((id) => keptIds.includes(id) && !metadata.order.includes(id));
    if (missing2.length === 0)
      return metadata;
    let order = [...metadata.order];
    for (let id of missing2) {
      let at = 0;
      for (let index4 = baseOrder.indexOf(id) - 1; index4 >= 0 && at === 0; index4--)
        at = order.indexOf(baseOrder[index4]) + 1;
      order.splice(at, 0, id);
    }
    return {
      ...metadata,
      order
    };
  }
  return bindRuntimeValue(runtime2, "DECK_METADATA_PATH", () => DECK_METADATA_PATH, (value) => {
    DECK_METADATA_PATH = value;
  }), bindRuntimeValue(runtime2, "DECK_METADATA_VERSION", () => DECK_METADATA_VERSION, (value) => {
    DECK_METADATA_VERSION = value;
  }), bindRuntimeValue(runtime2, "SLIDE_FILE_DIRECTORY", () => SLIDE_FILE_DIRECTORY, (value) => {
    SLIDE_FILE_DIRECTORY = value;
  }), bindRuntimeValue(runtime2, "SLIDE_FILE_ID_PATTERN", () => SLIDE_FILE_ID_PATTERN, (value) => {
    SLIDE_FILE_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "slideFilePath", () => slideFilePath, (value) => {
    slideFilePath = value;
  }), bindRuntimeValue(runtime2, "slideIdFromFilePath", () => slideIdFromFilePath), bindRuntimeValue(runtime2, "isMetadataObject", () => isMetadataObject, (value) => {
    isMetadataObject = value;
  }), bindRuntimeValue(runtime2, "normalizeDeckMetadata", () => normalizeDeckMetadata), bindRuntimeValue(runtime2, "replaceDeckMetadata", () => replaceDeckMetadata), bindRuntimeValue(runtime2, "patchDeckMetadata", () => patchDeckMetadata), bindRuntimeValue(runtime2, "mergeSlideOrder", () => mergeSlideOrder), bindRuntimeValue(runtime2, "restoreKeptListedSlides", () => restoreKeptListedSlides), bindRuntimeValue(runtime2, "conflictingUndoMessage", () => conflictingUndoMessage, (value) => {
    conflictingUndoMessage = value;
  }), () => {
    DECK_METADATA_PATH = "project/deck.json", DECK_METADATA_VERSION = 4, SLIDE_FILE_DIRECTORY = "project/slides/", SLIDE_FILE_ID_PATTERN = /^[\w-]{1,64}$/, slideFilePath = (slideId) => "project/slides/" + slideId + ".html", isMetadataObject = (value) => typeof value == "object" && value !== null && !Array.isArray(value), conflictingUndoMessage = (command) => command === "undo" ? (0, runtime2.formatMessage)({
      defaultMessage: "其他人已调整、添加、删除或修改幻灯片，本次未作更改。再次撤销可在保留对方更改的同时撤销你的操作。",
      id: "lW4vpNeZHa"
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "其他人已调整、添加、删除或修改幻灯片，本次未作更改。再次重做可在保留对方更改的同时重做你的操作。",
      id: "Xg54P22sNr"
    });
  };
}
export {
  installModelDeckMetadata
};
