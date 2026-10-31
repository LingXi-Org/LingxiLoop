// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCollaborationSelectionRings(runtime2) {
  var ReactPeerSelectionMeasurement, ReactPeerSelections, PeerSelectionJsx, MAX_PEER_SELECTED_UNITS, MAX_PEER_SELECTION_KEY_CHARS;
  function normalizePeerSelectedKeys(selection) {
    if (!Array.isArray(selection))
      return [];
    let keys = selection.filter((items) => typeof items == "string" && items.length <= MAX_PEER_SELECTION_KEY_CHARS);
    return keys.filter((input, options) => keys.lastIndexOf(input) === options).slice(-MAX_PEER_SELECTED_UNITS);
  }
  function collectPeerSelections(peers, context, exclude = []) {
    let items = [];
    for (let value of peers) {
      if (value.sameTab)
        continue;
      let context2 = value.presence.context;
      if (typeof context2 != "object" || context2 === null || Array.isArray(context2))
        continue;
      let value2 = context2;
      if (Object.keys(context).some((input) => value2[input] !== context[input]))
        continue;
      let value3 = normalizePeerSelectedKeys(value2.selected), state = {}, value4 = value3.length > 0;
      for (let value6 of exclude) {
        let value7 = normalizePeerSelectedKeys(value2[value6]);
        state[value6] = value7, value7.length > 0 && (value4 = !0);
      }
      if (!value4)
        continue;
      let who = value.presence.who, value5 = typeof who == "object" && who !== null ? who : {};
      items.push({
        peer: value.peer,
        collaborator: (0, runtime2.peerColorIndex)(value5.c, value.peer),
        selected: value3,
        lists: state
      });
    }
    return items;
  }
  function usePeerSelections(context, exclude) {
    let value = ReactPeerSelections.useSyncExternalStore(runtime2.roomPeerStore.subscribe, runtime2.roomPeerStore.getSnapshot, runtime2.roomPeerStore.getSnapshot);
    return collectPeerSelections(value, context, exclude);
  }
  function PeerSelectionRings({ rings, scale }) {
    let value = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return PeerSelectionJsx.jsx("div", {
      "aria-hidden": "true",
      "data-peer-selections": "",
      style: {
        position: "absolute",
        inset: 0,
        pointerEvents: "none"
      },
      children: rings.map((input) => PeerSelectionJsx.jsx(runtime2.SelectionRing, {
        "data-peer-ring": "",
        frame: {
          x: input.x,
          y: input.y,
          w: input.w,
          h: input.h
        },
        scale: value,
        rotation: input.rotation,
        collaborator: input.collaborator
      }, input.key))
    });
  }
  return bindRuntimeValue(runtime2, "ReactPeerSelectionMeasurement", () => ReactPeerSelectionMeasurement, (value) => {
    ReactPeerSelectionMeasurement = value;
  }), bindRuntimeValue(runtime2, "ReactPeerSelections", () => ReactPeerSelections, (value) => {
    ReactPeerSelections = value;
  }), bindRuntimeValue(runtime2, "PeerSelectionJsx", () => PeerSelectionJsx, (value) => {
    PeerSelectionJsx = value;
  }), bindRuntimeValue(runtime2, "MAX_PEER_SELECTED_UNITS", () => MAX_PEER_SELECTED_UNITS, (value) => {
    MAX_PEER_SELECTED_UNITS = value;
  }), bindRuntimeValue(runtime2, "MAX_PEER_SELECTION_KEY_CHARS", () => MAX_PEER_SELECTION_KEY_CHARS, (value) => {
    MAX_PEER_SELECTION_KEY_CHARS = value;
  }), bindRuntimeValue(runtime2, "normalizePeerSelectedKeys", () => normalizePeerSelectedKeys), bindRuntimeValue(runtime2, "collectPeerSelections", () => collectPeerSelections), bindRuntimeValue(runtime2, "usePeerSelections", () => usePeerSelections), bindRuntimeValue(runtime2, "PeerSelectionRings", () => PeerSelectionRings), () => {
    ReactPeerSelectionMeasurement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiInputs210)(), ReactPeerSelections = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PeerSelectionJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MAX_PEER_SELECTED_UNITS = 20, MAX_PEER_SELECTION_KEY_CHARS = 256;
  };
}
export {
  installCollaborationSelectionRings
};
