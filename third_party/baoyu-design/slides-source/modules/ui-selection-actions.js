// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { COMMENT_ICON, bindRuntimeValue } from "../module-helpers.js";
function installUiSelectionActions(runtime2) {
  var reacttv_, jsxNY, TEXT_LIST_LABELS, TEXT_LIST_OPTIONS, LINK_INPUT_CLASS;
  function LinkEditor({ value, invalid: invalid2, invalidHint, onChange, onKeyDown, onBlur, onCancel, onRemove }) {
    return jsxNY.jsxs("span", {
      className: "flex items-center gap-1",
      "data-link-mode": "",
      onKeyDown: (event) => {
        event.key !== "Escape" || event.defaultPrevented || (event.preventDefault(), event.stopPropagation(), onCancel());
      },
      children: [
        jsxNY.jsx("span", {
          "aria-hidden": "true",
          className: "inline-flex h-6 w-6 items-center justify-center text-muted",
          children: jsxNY.jsx(runtime2.KitIcon, {
            name: "Link"
          })
        }),
        jsxNY.jsx("input", {
          autoFocus: !0,
          "aria-label": "链接地址",
          placeholder: "https://…",
          value,
          "aria-invalid": invalid2 || void 0,
          onChange: (event) => onChange(event.target.value),
          onPointerDown: (input) => input.stopPropagation(),
          onBlur,
          onKeyDown: (input) => {
            input.stopPropagation(), onKeyDown(input);
          },
          className: LINK_INPUT_CLASS,
          title: invalid2 ? invalidHint ?? "请输入 http:// 或 https:// 地址" : void 0
        }),
        onRemove !== void 0 && jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: "Trash",
          "aria-label": "移除链接",
          title: "移除链接",
          onClick: onRemove
        }),
        jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: "X",
          "aria-label": "取消链接",
          title: "取消（Esc）",
          onClick: onCancel
        })
      ]
    });
  }
  function normalizeExternalLink(value) {
    let value2 = /^https?:\/\//i.test(value.trim()) ? value.trim() : "https://" + value.trim();
    return value2 = value2.replace(/^https?:\/\//i, (input) => input.toLowerCase()), /^https?:\/\/\S+$/.test(value2) && value2.length <= 2048 ? value2 : null;
  }
  function SelectionActionButtons({ lead, onComment, commentTitle = "评论此元素", onDelete, deleteTitle = "删除此元素", onOpenInspector, disabledReason, moreMenu, testids }) {
    let value = (0, runtime2.useCoarsePointer)() ? onDelete : void 0, value2 = typeof disabledReason == "string" ? {
      more: disabledReason
    } : disabledReason ?? {};
    return lead == null && onComment === null && value === void 0 && onOpenInspector === void 0 && value2.more === void 0 ? null : jsxNY.jsxs(runtime2.ToolbarGroup, {
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
          "aria-label": "删除",
          disabled: value2.delete !== void 0,
          onClick: value
        }),
        (onOpenInspector !== void 0 || value2.more !== void 0) && jsxNY.jsx(runtime2.ToolbarStripButton, {
          icon: "DotsVertical",
          "data-testid": testids?.more ?? "frame-more",
          title: value2.more ?? moreMenu?.label ?? "打开属性面板",
          "aria-label": moreMenu?.label ?? "属性",
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
  }), bindRuntimeValue(runtime2, "LINK_INPUT_CLASS", () => LINK_INPUT_CLASS, (value) => {
    LINK_INPUT_CLASS = value;
  }), bindRuntimeValue(runtime2, "LinkEditor", () => LinkEditor), bindRuntimeValue(runtime2, "normalizeExternalLink", () => normalizeExternalLink), bindRuntimeValue(runtime2, "SelectionActionButtons", () => SelectionActionButtons), () => {
    (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiPointerMedia)(), reacttv_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxNY = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TEXT_LIST_LABELS = {
      none: "None",
      bullet: "项目符号列表",
      number: "编号列表"
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
    ], LINK_INPUT_CLASS = "h-control w-72 rounded bg-fill-field px-2 text-body text-primary shadow-field-ring outline-none placeholder:text-muted focus-visible:outline-hidden focus-visible:shadow-focus aria-[invalid]:shadow-[0_0_0_2px_var(--cds-color-border-danger,#d9534f)] pointer-coarse:h-10 pointer-coarse:w-56";
  };
}
export {
  installUiSelectionActions
};
