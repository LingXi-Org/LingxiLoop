// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsMigrationMarkers(runtime2) {
  var CREATED_ON_FILES_MARKER_FIELD, isFileMigrationMarkerObject;
  function readFileMigrationMarker(record) {
    if (!isFileMigrationMarkerObject(record))
      return null;
    let convertedFrom = record.convertedFrom;
    if (isFileMigrationMarkerObject(convertedFrom))
      return {
        kind: "converted",
        marker: convertedFrom
      };
    let createdOnFiles = record.createdOnFiles;
    return isFileMigrationMarkerObject(createdOnFiles) ? {
      kind: "created",
      marker: createdOnFiles
    } : null;
  }
  function createdOnFilesMarker(marker) {
    return {
      v: 1,
      at: marker.at
    };
  }
  function readMovedToMarker(record) {
    if (!isFileMigrationMarkerObject(record))
      return null;
    let movedTo = record.movedTo;
    if (!isFileMigrationMarkerObject(movedTo) || typeof movedTo.path != "string" || typeof movedTo.at != "string")
      return null;
    let marker = {
      ...movedTo
    };
    for (let value of ["dropping", "dropped", "took"])
      typeof marker[value] != "string" && delete marker[value];
    return marker;
  }
  return bindRuntimeValue(runtime2, "CREATED_ON_FILES_MARKER_FIELD", () => CREATED_ON_FILES_MARKER_FIELD, (value) => {
    CREATED_ON_FILES_MARKER_FIELD = value;
  }), bindRuntimeValue(runtime2, "isFileMigrationMarkerObject", () => isFileMigrationMarkerObject, (value) => {
    isFileMigrationMarkerObject = value;
  }), bindRuntimeValue(runtime2, "readFileMigrationMarker", () => readFileMigrationMarker), bindRuntimeValue(runtime2, "createdOnFilesMarker", () => createdOnFilesMarker), bindRuntimeValue(runtime2, "readMovedToMarker", () => readMovedToMarker), () => {
    CREATED_ON_FILES_MARKER_FIELD = "createdOnFiles", isFileMigrationMarkerObject = (input) => typeof input == "object" && input !== null && !Array.isArray(input);
  };
}
export {
  installDocumentsMigrationMarkers
};
