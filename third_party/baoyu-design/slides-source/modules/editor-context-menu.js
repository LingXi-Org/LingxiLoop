// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorContextMenu(runtime2) {
  var CanvasContextMenuJsx, ENABLE_OBJECT_PROPERTIES_MENU, OBJECT_PROPERTIES_MENU_GROUPS, OBJECT_CONTEXT_MENU_GROUPS, COPY_SLIDE_LINK_MENU_ITEM, objectContextMenuGroups;
  function CanvasContextMenu({ objects, fitLabel, copyLink, ...props }) {
    let linkItems = copyLink ? [COPY_SLIDE_LINK_MENU_ITEM] : [], value = objects === 0 ? "Slide actions" : objects === 1 ? "Object actions" : "操作：" + String(objects) + " objects";
    return CanvasContextMenuJsx.jsx(runtime2.EditContextMenu, {
      ...props,
      name: value,
      className: "min-w-52",
      groups: objects > 0 ? objectContextMenuGroups(linkItems) : [
        [...linkItems, "paste"],
        [
          {
            id: "fit",
            label: fitLabel,
            shortcut: "cmd+0"
          }
        ]
      ]
    });
  }
  return bindRuntimeValue(runtime2, "CanvasContextMenuJsx", () => CanvasContextMenuJsx, (value) => {
    CanvasContextMenuJsx = value;
  }), bindRuntimeValue(runtime2, "ENABLE_OBJECT_PROPERTIES_MENU", () => ENABLE_OBJECT_PROPERTIES_MENU, (value) => {
    ENABLE_OBJECT_PROPERTIES_MENU = value;
  }), bindRuntimeValue(runtime2, "OBJECT_PROPERTIES_MENU_GROUPS", () => OBJECT_PROPERTIES_MENU_GROUPS, (value) => {
    OBJECT_PROPERTIES_MENU_GROUPS = value;
  }), bindRuntimeValue(runtime2, "OBJECT_CONTEXT_MENU_GROUPS", () => OBJECT_CONTEXT_MENU_GROUPS, (value) => {
    OBJECT_CONTEXT_MENU_GROUPS = value;
  }), bindRuntimeValue(runtime2, "COPY_SLIDE_LINK_MENU_ITEM", () => COPY_SLIDE_LINK_MENU_ITEM, (value) => {
    COPY_SLIDE_LINK_MENU_ITEM = value;
  }), bindRuntimeValue(runtime2, "objectContextMenuGroups", () => objectContextMenuGroups, (value) => {
    objectContextMenuGroups = value;
  }), bindRuntimeValue(runtime2, "CanvasContextMenu", () => CanvasContextMenu), () => {
    (0, runtime2.initializeModelSelection)(), CanvasContextMenuJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ENABLE_OBJECT_PROPERTIES_MENU = !1, OBJECT_PROPERTIES_MENU_GROUPS = ENABLE_OBJECT_PROPERTIES_MENU ? [
      [
        {
          id: "properties",
          label: "属性"
        }
      ]
    ] : [], COPY_SLIDE_LINK_MENU_ITEM = {
      id: "link",
      label: runtime2.COPY_SLIDE_LINK_LABEL,
      shortcut: runtime2.COPY_SLIDE_LINK_SHORTCUT
    }, objectContextMenuGroups = (linkItems) => [
      ["cut", "copy", ...linkItems, "paste", "duplicate"],
      ["front", "back", "group", "ungroup"],
      ...OBJECT_PROPERTIES_MENU_GROUPS,
      ["delete"]
    ], OBJECT_CONTEXT_MENU_GROUPS = objectContextMenuGroups([]);
  };
}
export {
  installEditorContextMenu
};
