// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryNotesDialog(runtime2) {
  var ReactExportNotes, ExportNotesJsx;
  function ExportNotesDialog({ notes, onClosed }) {
    let [value, value2] = ReactExportNotes.useState(!0);
    return (0, runtime2.usePopupFocusRestoration)(!0), ExportNotesJsx.jsx(runtime2.DialogComponents.Root, {
      open: value,
      onOpenChange: (input) => {
        input || value2(!1);
      },
      onOpenChangeComplete: (input) => {
        input || onClosed();
      },
      children: ExportNotesJsx.jsxs(runtime2.DialogComponents.Popup, {
        size: "sm",
        "data-testid": "export-notes-dialog",
        children: [
          ExportNotesJsx.jsx(runtime2.DialogComponents.Header, {
            showClose: !0,
            children: (0, runtime2.formatMessage)({
              defaultMessage: "导出说明",
              id: "5HKMqf6yQl"
            })
          }),
          ExportNotesJsx.jsx("ul", {
            className: "flex list-disc flex-col gap-xs pl-lg text-body",
            children: notes.map((input, options) => ExportNotesJsx.jsx("li", {
              children: input
            }, options))
          }),
          ExportNotesJsx.jsx(runtime2.DialogComponents.Footer, {
            align: "end",
            children: ExportNotesJsx.jsx(runtime2.DialogComponents.Close, {
              render: ExportNotesJsx.jsx(runtime2.Button, {
                variant: "primary",
                children: runtime2.doneLabel
              })
            })
          })
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "ReactExportNotes", () => ReactExportNotes, (value) => {
    ReactExportNotes = value;
  }), bindRuntimeValue(runtime2, "ExportNotesJsx", () => ExportNotesJsx, (value) => {
    ExportNotesJsx = value;
  }), bindRuntimeValue(runtime2, "ExportNotesDialog", () => ExportNotesDialog), () => {
    (0, runtime2.initializeUiInputs210)(), ReactExportNotes = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ExportNotesJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installDeliveryNotesDialog
};
