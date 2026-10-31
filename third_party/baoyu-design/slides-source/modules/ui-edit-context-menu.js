// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiEditContextMenu(runtime2) {
  var isMacControlClick, isPlainMousePointer, isContextMenuEditingTarget, jsxCv, EDIT_COMMAND_DEFINITIONS, internalPasteOnlyMessage, isContextMenuKey;
  function EditCommandMenuItems({ groups, refusals, plainKeys = !0, onCommand }) {
    return groups.flatMap((input, options) => [
      options > 0 ? jsxCv.jsx(runtime2.Menu.Separator, {}, "separator-" + String(options)) : null,
      ...input.map((input2) => {
        let { id: value, label: value2, shortcut: value3, description: value4 } = typeof input2 == "string" ? {
          id: input2,
          ...EDIT_COMMAND_DEFINITIONS[input2]
        } : input2;
        return jsxCv.jsx(runtime2.Menu.Item, {
          shortcut: plainKeys || value3?.length !== 1 ? value3 : void 0,
          description: value4,
          variant: value === "delete" ? "danger" : void 0,
          disabled: refusals[value] !== void 0,
          disabledReason: refusals[value] ?? null,
          onClick: (input3) => onCommand(value, input3),
          children: value2
        }, value);
      })
    ]);
  }
  function EditContextMenu({ at, name, className, returnFocus, onClose, ...remainingProps }) {
    return jsxCv.jsx(runtime2.ContextMenuPopup, {
      at,
      "aria-label": name,
      focusFirstItem: at?.from === "key" || at?.keyboard === !0,
      className,
      returnFocus,
      onClose,
      children: jsxCv.jsx(EditCommandMenuItems, {
        ...remainingProps
      })
    });
  }
  function contextMenuAnchorPoint(element, container) {
    let callback = (input, options, context) => Math.min(Math.max(input, options + 8), options + context - 8), value = element === null ? container.left + container.width / 2 : element.left + Math.min(40, element.width / 2), value2 = element === null ? container.top + container.height / 2 : element.top + Math.min(24, element.height / 2);
    return {
      x: callback(value, container.left, container.width),
      y: callback(value2, container.top, container.height)
    };
  }
  function copySelectionForCommand(command, kind, payload) {
    return (0, runtime2.copyArtifactToClipboard)(kind, payload) ? !0 : ((0, runtime2.showToast)("操作未完成：" + (command === "cut" ? "cut" : "copied") + ". Press " + (0, runtime2.formatCommandShortcut)(command === "cut" ? "X" : "C") + " instead."), !1);
  }
  return bindRuntimeValue(runtime2, "isMacControlClick", () => isMacControlClick, (value) => {
    isMacControlClick = value;
  }), bindRuntimeValue(runtime2, "isPlainMousePointer", () => isPlainMousePointer, (value) => {
    isPlainMousePointer = value;
  }), bindRuntimeValue(runtime2, "isContextMenuEditingTarget", () => isContextMenuEditingTarget, (value) => {
    isContextMenuEditingTarget = value;
  }), bindRuntimeValue(runtime2, "jsxCv", () => jsxCv, (value) => {
    jsxCv = value;
  }), bindRuntimeValue(runtime2, "EDIT_COMMAND_DEFINITIONS", () => EDIT_COMMAND_DEFINITIONS, (value) => {
    EDIT_COMMAND_DEFINITIONS = value;
  }), bindRuntimeValue(runtime2, "EditCommandMenuItems", () => EditCommandMenuItems), bindRuntimeValue(runtime2, "EditContextMenu", () => EditContextMenu), bindRuntimeValue(runtime2, "contextMenuAnchorPoint", () => contextMenuAnchorPoint), bindRuntimeValue(runtime2, "internalPasteOnlyMessage", () => internalPasteOnlyMessage, (value) => {
    internalPasteOnlyMessage = value;
  }), bindRuntimeValue(runtime2, "copySelectionForCommand", () => copySelectionForCommand), bindRuntimeValue(runtime2, "isContextMenuKey", () => isContextMenuKey, (value) => {
    isContextMenuKey = value;
  }), () => {
    isMacControlClick = (event) => event.pointerType === "mouse" && event.button === 0 && event.ctrlKey === !0 && (0, runtime2.isApplePlatform)(), isPlainMousePointer = (event) => event.button !== 2 && !(event.ctrlKey && (0, runtime2.isApplePlatform)()) && event.pointerType !== "pen" && event.pointerType !== "touch", isContextMenuEditingTarget = (target) => target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') != null, (0, runtime2.initializeUiInputs210)(), jsxCv = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), EDIT_COMMAND_DEFINITIONS = {
      cut: {
        label: "剪切",
        shortcut: "cmd+x"
      },
      copy: {
        label: "复制",
        shortcut: "cmd+c"
      },
      paste: {
        label: "粘贴",
        shortcut: "cmd+v"
      },
      duplicate: {
        label: "创建副本",
        shortcut: "cmd+d"
      },
      front: {
        label: "置于顶层",
        shortcut: "]"
      },
      back: {
        label: "置于底层",
        shortcut: "["
      },
      group: {
        label: "组合",
        shortcut: "cmd+g"
      },
      ungroup: {
        label: "取消组合",
        shortcut: "shift+cmd+g"
      },
      delete: {
        label: "删除",
        shortcut: "backspace"
      },
      "select-all": {
        label: "全选",
        shortcut: "cmd+a"
      }
    }, internalPasteOnlyMessage = () => ((0, runtime2.usesImmediateModalRelease)() ? "按 " + (0, runtime2.formatCommandShortcut)("V") + " 进行粘贴。" : "") + "此菜单只能粘贴刚在此编辑器中复制或剪切的内容。", isContextMenuKey = (event) => event.key === "ContextMenu" || event.key === "F10" && event.shiftKey;
  };
}
export {
  installUiEditContextMenu
};
