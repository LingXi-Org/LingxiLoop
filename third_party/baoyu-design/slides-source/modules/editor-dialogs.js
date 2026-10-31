// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorDialogs(runtime2) {
  var ReactEditorDialogs, EditorDialogsJsx, pendingEditorDialog, editorDialogSequence, editorDialogSubscribers;
  function notifyEditorDialogSubscribers() {
    for (let value of editorDialogSubscribers)
      value(pendingEditorDialog);
  }
  function cancelEditorDialogRequest(request) {
    request.kind === "confirm" ? request.resolve(!1) : request.resolve(null);
  }
  function enqueueEditorDialog(request) {
    let previous = pendingEditorDialog;
    if (pendingEditorDialog = request, previous && cancelEditorDialogRequest(previous), editorDialogSubscribers.size === 0) {
      pendingEditorDialog = null, cancelEditorDialogRequest(request);
      return;
    }
    notifyEditorDialogSubscribers();
  }
  function confirmEditorAction(options) {
    return new Promise((input) => {
      enqueueEditorDialog({
        id: editorDialogSequence++,
        kind: "confirm",
        opts: options,
        resolve: input
      });
    });
  }
  function promptEditorText(options) {
    return new Promise((input) => {
      enqueueEditorDialog({
        id: editorDialogSequence++,
        kind: "prompt",
        opts: options,
        resolve: input
      });
    });
  }
  function dismissEditorDialog() {
    let value = pendingEditorDialog;
    value && (pendingEditorDialog = null, cancelEditorDialogRequest(value), notifyEditorDialogSubscribers());
  }
  function resolveEditorDialog(request, value) {
    pendingEditorDialog === request && (pendingEditorDialog = null, request.kind === "confirm" ? request.resolve(value === !0) : request.resolve(typeof value == "string" ? value : null), notifyEditorDialogSubscribers());
  }
  function dismissMatchingEditorDialog(request) {
    pendingEditorDialog === request && dismissEditorDialog();
  }
  function EditorDialogLayout({ title, onDismiss, footer, children }) {
    return EditorDialogsJsx.jsx(runtime2.DialogComponents.Root, {
      open: !0,
      onOpenChange: (input) => {
        input || onDismiss();
      },
      children: EditorDialogsJsx.jsxs(runtime2.DialogComponents.Popup, {
        size: "sm",
        children: [
          EditorDialogsJsx.jsx(runtime2.DialogComponents.Header, {
            showClose: !0,
            children: title
          }),
          EditorDialogsJsx.jsx("div", {
            className: "mt-3 text-sm",
            children
          }),
          EditorDialogsJsx.jsx(runtime2.DialogComponents.Footer, {
            align: "end",
            className: "mc-dialog-foot",
            children: footer
          })
        ]
      })
    });
  }
  function EditorConfirmDialog({ p }) {
    let { opts } = p, callback = () => dismissMatchingEditorDialog(p);
    return EditorDialogsJsx.jsx(runtime2.ConfirmationDialog, {
      open: !0,
      initialFocus: "cancel",
      onOpenChange: (input) => {
        input || callback();
      },
      title: opts.title,
      description: opts.message,
      confirmLabel: opts.confirmLabel ?? (opts.danger ? "Delete" : "OK"),
      cancelLabel: opts.cancelLabel ?? "Cancel",
      confirmVariant: opts.danger ? "danger" : "primary",
      size: "sm",
      onConfirm: () => resolveEditorDialog(p, !0)
    });
  }
  function EditorPromptDialog({ p }) {
    let { opts } = p, [value, value2] = ReactEditorDialogs.useState(opts.initialValue ?? ""), value3 = value.trim(), value4 = value3.length === 0, callback = () => {
      value4 || resolveEditorDialog(p, value3);
    }, callback2 = () => dismissMatchingEditorDialog(p);
    return EditorDialogsJsx.jsxs(EditorDialogLayout, {
      title: opts.title,
      onDismiss: callback2,
      footer: EditorDialogsJsx.jsxs(EditorDialogsJsx.Fragment, {
        children: [
          EditorDialogsJsx.jsx(runtime2.Button, {
            onClick: callback2,
            children: opts.cancelLabel ?? "取消"
          }),
          EditorDialogsJsx.jsx(runtime2.DisabledReasonTooltip, {
            wrapperClassName: "grid",
            reason: value4 ? "Type something first" : void 0,
            children: EditorDialogsJsx.jsx(runtime2.Button, {
              variant: "primary",
              disabled: value4,
              "data-testid": "mc-alert-confirm",
              onClick: callback,
              children: opts.confirmLabel ?? "确定"
            })
          })
        ]
      }),
      children: [
        opts.message ? EditorDialogsJsx.jsx("p", {
          className: "text-fg-secondary",
          children: opts.message
        }) : null,
        EditorDialogsJsx.jsx(runtime2.TextInput, {
          className: opts.message ? "mt-2" : void 0,
          "data-testid": "mc-alert-input",
          "aria-label": opts.inputLabel ?? opts.title,
          autoFocus: !0,
          value,
          placeholder: opts.placeholder,
          maxLength: opts.maxLength,
          onChange: (input) => value2(input.currentTarget.value),
          onFocus: (input) => input.currentTarget.select(),
          onKeyDown: (event) => {
            event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229 || (event.preventDefault(), !event.repeat && callback()));
          }
        })
      ]
    });
  }
  function EditorDialogHost() {
    let [value, value2] = ReactEditorDialogs.useState(pendingEditorDialog);
    return (0, runtime2.usePopupFocusRestoration)(value, () => pendingEditorDialog !== null), ReactEditorDialogs.useEffect(() => (editorDialogSubscribers.add(value2), () => {
      editorDialogSubscribers.delete(value2), editorDialogSubscribers.size === 0 && dismissEditorDialog();
    }), []), value ? value.kind === "confirm" ? EditorDialogsJsx.jsx(EditorConfirmDialog, {
      p: value
    }, value.id) : EditorDialogsJsx.jsx(EditorPromptDialog, {
      p: value
    }, value.id) : null;
  }
  return bindRuntimeValue(runtime2, "ReactEditorDialogs", () => ReactEditorDialogs, (value) => {
    ReactEditorDialogs = value;
  }), bindRuntimeValue(runtime2, "EditorDialogsJsx", () => EditorDialogsJsx, (value) => {
    EditorDialogsJsx = value;
  }), bindRuntimeValue(runtime2, "pendingEditorDialog", () => pendingEditorDialog, (value) => {
    pendingEditorDialog = value;
  }), bindRuntimeValue(runtime2, "editorDialogSequence", () => editorDialogSequence, (value) => {
    editorDialogSequence = value;
  }), bindRuntimeValue(runtime2, "editorDialogSubscribers", () => editorDialogSubscribers, (value) => {
    editorDialogSubscribers = value;
  }), bindRuntimeValue(runtime2, "notifyEditorDialogSubscribers", () => notifyEditorDialogSubscribers), bindRuntimeValue(runtime2, "cancelEditorDialogRequest", () => cancelEditorDialogRequest), bindRuntimeValue(runtime2, "enqueueEditorDialog", () => enqueueEditorDialog), bindRuntimeValue(runtime2, "confirmEditorAction", () => confirmEditorAction), bindRuntimeValue(runtime2, "promptEditorText", () => promptEditorText), bindRuntimeValue(runtime2, "dismissEditorDialog", () => dismissEditorDialog), bindRuntimeValue(runtime2, "resolveEditorDialog", () => resolveEditorDialog), bindRuntimeValue(runtime2, "dismissMatchingEditorDialog", () => dismissMatchingEditorDialog), bindRuntimeValue(runtime2, "EditorDialogLayout", () => EditorDialogLayout), bindRuntimeValue(runtime2, "EditorConfirmDialog", () => EditorConfirmDialog), bindRuntimeValue(runtime2, "EditorPromptDialog", () => EditorPromptDialog), bindRuntimeValue(runtime2, "EditorDialogHost", () => EditorDialogHost), () => {
    (0, runtime2.initializeUiInputs210)(), ReactEditorDialogs = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), EditorDialogsJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), pendingEditorDialog = null, editorDialogSequence = 1, editorDialogSubscribers = /* @__PURE__ */ new Set();
  };
}
export {
  installEditorDialogs
};
