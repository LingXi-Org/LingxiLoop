// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { COMMENT_ICON, bindRuntimeValue } from "../module-helpers.js";
function installUiSelectionActions(runtime2) {
  var reacttv_, jsxNY, TEXT_LIST_LABELS, TEXT_LIST_OPTIONS, TEXT_ALIGN_LABELS, LINK_INPUT_CLASS;
  function LinkEditor({ value, invalid: invalid2, invalidHint, onChange, onKeyDown, onBlur, onCancel, onRemove }) {
    let bottomToolbar = (0, runtime2.useBottomToolbarChrome)();
    return jsxNY.jsxs("span", {
      className: "flex items-center gap-1",
      "data-link-mode": "",
      onKeyDown: (event) => {
        event.key !== "Escape" || event.defaultPrevented || (event.preventDefault(), event.stopPropagation(), onCancel());
      },
      children: [
        jsxNY.jsx("span", {
          "aria-hidden": "true",
          className: (0, runtime2.joinClassNames)("inline-flex items-center justify-center text-muted", bottomToolbar ? "h-8 w-8" : "h-6 w-6"),
          children: jsxNY.jsx(runtime2.KitIcon, {
            name: "Link",
            size: bottomToolbar ? 20 : void 0
          })
        }),
        jsxNY.jsx("input", {
          autoFocus: !0,
          "aria-label": (0, runtime2.formatMessage)({
            defaultMessage: "链接地址",
            id: "M7ahDICIrf"
          }),
          placeholder: (0, runtime2.literalMessage)( "https://…"),
          value,
          "aria-invalid": invalid2 || void 0,
          onChange: (event) => onChange(event.target.value),
          onPointerDown: (input) => input.stopPropagation(),
          onBlur,
          onKeyDown: (input) => {
            input.stopPropagation(), onKeyDown(input);
          },
          className: LINK_INPUT_CLASS,
          title: invalid2 ? invalidHint ?? (0, runtime2.formatMessage)({
            defaultMessage: "请输入 http:// 或 https:// 地址",
            id: "p8xAmP2OjL"
          }) : void 0
        }),
        onRemove !== void 0 && jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: "Trash",
          "aria-label": (0, runtime2.formatMessage)({
            defaultMessage: "移除链接",
            id: "kHqoDNMzGd"
          }),
          title: (0, runtime2.formatMessage)({
            defaultMessage: "移除链接",
            id: "lWUdwNYxnO"
          }),
          onClick: onRemove
        }),
        jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: "X",
          "aria-label": (0, runtime2.formatMessage)({
            defaultMessage: "取消链接",
            id: "0OHOP7BO3L"
          }),
          title: (0, runtime2.formatMessage)({
            defaultMessage: "取消（Esc）",
            id: "JVDsU0etqi"
          }),
          onClick: onCancel
        })
      ]
    });
  }
  function normalizeExternalLink(value) {
    let value2 = /^https?:\/\//i.test(value.trim()) ? value.trim() : "https://" + value.trim();
    return value2 = value2.replace(/^https?:\/\//i, (input) => input.toLowerCase()), /^https?:\/\/\S+$/.test(value2) && value2.length <= 2048 ? value2 : null;
  }
  function SelectionActionButtons({ lead, onComment, commentTitle = (0, runtime2.formatMessage)({
      defaultMessage: "评论此元素",
      id: "7rzTXIwoVO"
    }), onDelete, deleteTitle = (0, runtime2.formatMessage)({
      defaultMessage: "删除此元素",
      id: "NVHNxrOnsZ"
    }), onOpenInspector, disabledReason, moreMenu, testids }) {
    let value = (0, runtime2.useCoarsePointer)() ? onDelete : void 0, value2 = typeof disabledReason == "string" ? {
      more: disabledReason
    } : disabledReason ?? {}, fold = reacttv_.useContext(runtime2.ToolbarFoldContext);
    return lead == null && onComment === null && value === void 0 && onOpenInspector === void 0 && value2.more === void 0 ? null : jsxNY.jsxs(runtime2.ToolbarGroup, {
      "data-mc-tail": "",
      children: [
        lead,
        onComment !== null && jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: COMMENT_ICON,
          "data-testid": testids?.comment,
          title: value2.comment ?? commentTitle,
          "aria-label": "评论",
          disabled: value2.comment !== void 0,
          onClick: (input) => onComment(input.currentTarget)
        }),
        value !== void 0 && jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: "Trash",
          "data-testid": testids?.delete ?? "frame-delete",
          title: value2.delete ?? deleteTitle,
          "aria-label": (0, runtime2.formatMessage)({
            defaultMessage: "删除",
            id: "2kWn/1qTlB"
          }),
          disabled: value2.delete !== void 0,
          onClick: value
        }),
        (onOpenInspector !== void 0 || value2.more !== void 0) && jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: fold?.folded === !0 && moreMenu === void 0 ? "SidebarRight" : "DotsVertical",
          "data-mc-more": "",
          "data-testid": testids?.more ?? "frame-more",
          title: value2.more ?? moreMenu?.label ?? (0, runtime2.formatMessage)({
            defaultMessage: "打开属性面板",
            id: "2HZf7SMMWt"
          }),
          "aria-label": moreMenu?.label ?? (0, runtime2.formatMessage)({
            defaultMessage: "属性",
            id: "iYCU2e54+g"
          }),
          "aria-haspopup": moreMenu ? "menu" : void 0,
          "aria-expanded": moreMenu?.open,
          disabled: value2.more !== void 0,
          onClick: onOpenInspector
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reacttv_", () => reacttv_, (value) => {
    reacttv_ = value;
  }), bindRuntimeValue(runtime2, "jsxNY", () => jsxNY, (value) => {
    jsxNY = value;
  }), bindRuntimeValue(runtime2, "TEXT_LIST_LABELS", () => TEXT_LIST_LABELS, (value) => {
    TEXT_LIST_LABELS = value;
  }), bindRuntimeValue(runtime2, "TEXT_LIST_OPTIONS", () => TEXT_LIST_OPTIONS, (value) => {
    TEXT_LIST_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGN_LABELS", () => TEXT_ALIGN_LABELS, (value) => {
    TEXT_ALIGN_LABELS = value;
  }), bindRuntimeValue(runtime2, "LINK_INPUT_CLASS", () => LINK_INPUT_CLASS, (value) => {
    LINK_INPUT_CLASS = value;
  }), bindRuntimeValue(runtime2, "LinkEditor", () => LinkEditor), bindRuntimeValue(runtime2, "normalizeExternalLink", () => normalizeExternalLink), bindRuntimeValue(runtime2, "SelectionActionButtons", () => SelectionActionButtons), () => {
    (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiPointerMedia)(), reacttv_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxNY = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TEXT_LIST_LABELS = {
      none: (0, runtime2.formatMessage)({
        defaultMessage: "无",
        id: "ftl29MyM/j"
      }),
      bullet: (0, runtime2.formatMessage)({
        defaultMessage: "项目符号列表",
        id: "Q6dK4bj86z"
      }),
      number: (0, runtime2.formatMessage)({
        defaultMessage: "编号列表",
        id: "0pySO6cDMU"
      })
    }, TEXT_LIST_OPTIONS = [
      {
        value: "none",
        label: TEXT_LIST_LABELS.none,
        icon: "Prohibit"
      },
      {
        value: "bullet",
        label: TEXT_LIST_LABELS.bullet,
        icon: "ListBullet"
      },
      {
        value: "number",
        label: TEXT_LIST_LABELS.number,
        icon: "ListNumbered"
      }
    ], TEXT_ALIGN_LABELS = {
      start: (0, runtime2.formatMessage)({
        defaultMessage: "左对齐",
        id: "SUYCFualOa"
      }),
      center: (0, runtime2.formatMessage)({
        defaultMessage: "居中",
        id: "OyDYsO2hrJ"
      }),
      end: (0, runtime2.formatMessage)({
        defaultMessage: "右对齐",
        id: "KxPPl3LEQj"
      }),
      justify: (0, runtime2.formatMessage)({
        defaultMessage: "两端对齐",
        id: "FlXNqoSMqq"
      })
    }, LINK_INPUT_CLASS = "h-control w-72 rounded bg-fill-field px-2 text-body text-primary shadow-field-ring outline-none placeholder:text-muted focus-visible:outline-hidden focus-visible:shadow-focus aria-[invalid]:shadow-[0_0_0_2px_var(--cds-color-border-danger,#d9534f)] pointer-coarse:h-10 pointer-coarse:w-56";
  };
}
export {
  installUiSelectionActions
};
