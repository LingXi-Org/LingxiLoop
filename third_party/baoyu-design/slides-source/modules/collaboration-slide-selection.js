// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCollaborationSlideSelection(runtime2) {
  var SlidePeerSelectionJsx;
  function SlidePeerSelections({ hosted, deck, slideId, measure, scale }) {
    let value = (0, runtime2.usePeerSelections)({
      [hosted ? "deckMode" : "mode"]: "edit",
      deck,
      slideId
    }), value2 = JSON.stringify(value.map((input) => [
      input.peer,
      input.collaborator,
      input.selected
    ])), [value3, value4] = runtime2.ReactPeerSelectionMeasurement.useState([]);
    return runtime2.ReactPeerSelectionMeasurement.useLayoutEffect(() => {
      let items = [];
      for (let value5 of value)
        for (let value6 of value5.selected) {
          let value7 = (0, runtime2.parseObjectContextId)(value6), value8 = value7 ? measure(value7.frameId, value7.path) : null;
          value8 && items.push({
            key: value5.peer + "|" + value6,
            x: value8.x,
            y: value8.y,
            w: value8.w,
            h: value8.h,
            rotation: value8.rotation,
            collaborator: value5.collaborator
          });
        }
      value4((input) => JSON.stringify(input) === JSON.stringify(items) ? input : items);
    }, [value2, measure]), value3.length === 0 ? null : SlidePeerSelectionJsx.jsx(runtime2.PeerSelectionRings, {
      rings: value3,
      scale
    });
  }
  return bindRuntimeValue(runtime2, "SlidePeerSelectionJsx", () => SlidePeerSelectionJsx, (value) => {
    SlidePeerSelectionJsx = value;
  }), bindRuntimeValue(runtime2, "SlidePeerSelections", () => SlidePeerSelections), () => {
    (0, runtime2.initializeModelSelection)(), SlidePeerSelectionJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installCollaborationSlideSelection
};
