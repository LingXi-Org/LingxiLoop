// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
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
    return (0, runtime2.copyArtifactToClipboard)(kind, payload) ? !0 : ((0, runtime2.showToast)(command === "cut" ? (0, runtime2.formatMessage)({
      defaultMessage: "无法剪切，请改按 {keys}。",
      id: "oZ9QTsWvR+"
    }, {
      keys : (0, runtime2.formatCommandShortcut)( "X")
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "无法复制，请改按 {keys}。",
      id: "z8kb14T86S"
    }, {
      keys: (0, runtime2.formatCommandShortcut)( "C")
    })), !1);
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
        label: (0, runtime2.formatMessage)({
          defaultMessage: "剪切",
          id: "6zhcCfobKR"
        }),
        shortcut: "cmd+x"
      },
      copy: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "复制",
          id: "KcdfMmNv8Q"
        }),
        shortcut: "cmd+c"
      },
      paste: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "粘贴",
          id: "xwIXeZgj8c"
        }),
        shortcut: "cmd+v"
      },
      duplicate: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "创建副本",
          id: "tz9sbJQcgN"
        }),
        shortcut: "cmd+d"
      },
      front: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "置于顶层",
          id: "BSiFMmTht/"
        }),
        shortcut: "]"
      },
      back: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "置于底层",
          id: "A9iIvOtcyX"
        }),
        shortcut: "["
      },
      group: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "组合",
          id: "t9C7cnk98O"
        }),
        shortcut: "cmd+g"
      },
      ungroup: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "取消组合",
          id: "NNBNcDwX8W"
        }),
        shortcut: "shift+cmd+g"
      },
      scale: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "缩放…",
          id: "eUF9F02IrS"
        }),
        shortcut: "k"
      },
      delete: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "删除",
          id: "Uv8tTk6JvM"
        }),
        shortcut: "backspace"
      },
      "select-all": {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "全选",
          id: "9tRJnwyHS6"
        }),
        shortcut: "cmd+a"
      }
    }, internalPasteOnlyMessage = () => (0, runtime2.usesImmediateModalRelease)() ? (0, runtime2.formatMessage)({
      defaultMessage: "按 {keys} 粘贴。此菜单只能在你于此处复制或剪切后立即粘贴。",
      id: "5+8oOEnxEl"
    }, {
      keys: (0, runtime2.formatCommandShortcut)("V")
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "此菜单只能粘贴刚在此编辑器中复制或剪切的内容。",
      id: "oaBNESNRMe"
    }), isContextMenuKey = (event) => event.key === "ContextMenu" || event.key === "F10" && event.shiftKey;
  };
}
export {
  installUiEditContextMenu
};
