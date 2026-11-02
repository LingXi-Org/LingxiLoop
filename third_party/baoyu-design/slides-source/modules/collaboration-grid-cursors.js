// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCollaborationGridCursors(runtime2) {
  var ReactGridPeerCursors, GridPeerCursorsJsx, peerCursorSurfaceSnapshot;
  function collectPeerCursorSurfaceKeys(peers) {
    let surfaces = /* @__PURE__ */ new Set();
    for (let value of peers) {
      if (value.sameTab)
        continue;
      let cursor = value.presence.cursor, value2 = typeof cursor == "object" && cursor !== null ? cursor.s : void 0;
      typeof value2 == "string" && value2.length <= 128 && !value2.includes(`
`) && surfaces.add(value2);
    }
    return [...surfaces].sort().join(`
`);
  }
  function GridPeerCursorLayers({ tiles, surfaceOf, glyphScale }) {
    let value = ReactGridPeerCursors.useSyncExternalStore(runtime2.roomPeerStore.subscribe, peerCursorSurfaceSnapshot, peerCursorSurfaceSnapshot);
    if (value === "")
      return null;
    let values = new Set(value.split(`
`));
    return GridPeerCursorsJsx.jsx(GridPeerCursorsJsx.Fragment, {
      children: tiles.map((input) => {
        let value2 = surfaceOf(input.id);
        return values.has(value2) ? GridPeerCursorsJsx.jsx("div", {
          "data-grid-peers": input.id,
          className: "pointer-events-none absolute",
          style: {
            left: input.x,
            top: input.y,
            width: runtime2.GRID_SLIDE_WIDTH,
            height: runtime2.GRID_SLIDE_HEIGHT
          },
          children: GridPeerCursorsJsx.jsx(runtime2.PeerCursors, {
            surface: value2,
            toLocal: (input2, options) => ({
              left: input2 * runtime2.GRID_SLIDE_WIDTH,
              top: options * runtime2.GRID_SLIDE_HEIGHT
            }),
            glyphScale
          })
        }, input.id) : null;
      })
    });
  }
  return bindRuntimeValue(runtime2, "ReactGridPeerCursors", () => ReactGridPeerCursors, (value) => {
    ReactGridPeerCursors = value;
  }), bindRuntimeValue(runtime2, "GridPeerCursorsJsx", () => GridPeerCursorsJsx, (value) => {
    GridPeerCursorsJsx = value;
  }), bindRuntimeValue(runtime2, "collectPeerCursorSurfaceKeys", () => collectPeerCursorSurfaceKeys), bindRuntimeValue(runtime2, "peerCursorSurfaceSnapshot", () => peerCursorSurfaceSnapshot, (value) => {
    peerCursorSurfaceSnapshot = value;
  }), bindRuntimeValue(runtime2, "GridPeerCursorLayers", () => GridPeerCursorLayers), () => {
    ReactGridPeerCursors = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), GridPeerCursorsJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), peerCursorSurfaceSnapshot = () => collectPeerCursorSurfaceKeys(runtime2.roomPeerStore.getSnapshot());
  };
}
export {
  installCollaborationGridCursors
};
