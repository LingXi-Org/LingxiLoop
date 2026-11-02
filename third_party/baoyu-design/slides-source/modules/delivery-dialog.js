// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryDialog(runtime2) {
  var ReactExportDelivery, ExportDeliveryJsx, PPTX_MIME_TYPE, PDF_MIME_TYPE, HTML_MIME_TYPE, PNG_MIME_TYPE;
  function exportDeliveryFailureMessage(code, extension, bytes) {
    let lowerExtension = extension.toLowerCase();
    switch (code) {
      case "extension_not_enabled":
        return (0, runtime2.formatMessage)({
          defaultMessage: "当前环境暂不支持保存 .{ext} 文件。",
          id: "8Is3SprbU3"
        }, { ext: lowerExtension });
      case "too_large":
        return (0, runtime2.formatMessage)({
          defaultMessage: "未能保存大小为 {size} 的 {kind} 文件。",
          id: "jTOLZfOFRn"
        }, {
          size: (0, runtime2.megabytesLabel)((Math.ceil(bytes / 1048576 * 10) / 10).toLocaleString((0, runtime2.intlLocale)("NumberFormat", "en-US"), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
            useGrouping: !1
          })),
          kind: extension
        });
      case "no_shell_save":
        return (0, runtime2.formatMessage)({
          defaultMessage: "如果下载未开始，可在此保存。",
          id: "qohurj95Dq"
        });
      case "unavailable":
        return (0, runtime2.formatMessage)({
          defaultMessage: "保存未成功，请关闭后重试，或在此保存。",
          id: "m9fxil1tFl"
        });
      case "rate_limited":
        return (0, runtime2.formatMessage)({
          defaultMessage: "暂时未能保存，可能有其他对话框未关闭。请关闭后重试，或在此保存。",
          id: "VriZoTmlRU"
        });
      default:
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法在此保存文件。",
          id: "847J/KdjOE"
        });
    }
  }
  function richMessage(descriptor, values) {
    let parts = (0, runtime2.formatMessage)(descriptor, values);
    return typeof parts == "string" ? parts : ReactExportDelivery.createElement(ReactExportDelivery.Fragment, null, ...parts);
  }
  function ExportDeliveryDialog({ delivery, onClose }) {
    let memo4 = ReactExportDelivery.useMemo(() => delivery ? URL.createObjectURL(delivery.blob) : null, [delivery]);
    if (ReactExportDelivery.useEffect(() => {
      if (memo4 !== null)
        return () => URL.revokeObjectURL(memo4);
    }, [memo4]), !delivery || memo4 === null)
      return null;
    let value = Math.max(1, Math.round(delivery.blob.size / 1024));
    return ExportDeliveryJsx.jsx(runtime2.DialogComponents.Root, {
      open: !0,
      onOpenChange: (input) => {
        input || onClose();
      },
      children: ExportDeliveryJsx.jsxs(runtime2.DialogComponents.Popup, {
        size: "sm",
        children: [
          ExportDeliveryJsx.jsx(runtime2.DialogComponents.Header, {
            showClose: !0,
            children: (0, runtime2.formatMessage)({ defaultMessage: "{kind} 已就绪", id: "GngQmkfdeF" }, { kind: delivery.kind })
          }),
          ExportDeliveryJsx.jsxs("div", {
            className: "mt-3 flex flex-col gap-3 text-sm",
            children: [
              ExportDeliveryJsx.jsx("p", {
                className: "text-sm",
                children: exportDeliveryFailureMessage(delivery.reason, delivery.kind, delivery.blob.size)
              }),
              ExportDeliveryJsx.jsxs("div", {
                draggable: !0,
                onDragStart: (input) => {
                  input.dataTransfer.effectAllowed = "copy", input.dataTransfer.setData("DownloadURL", delivery.mime + ":" + delivery.filename + ":" + memo4);
                },
                title: (0, runtime2.formatMessage)({
                  defaultMessage: "拖到窗口外以保存文件",
                  id: "a98QwaIu+w"
                }),
                className: "flex cursor-grab items-center gap-2.5 rounded-lg border border-border-line bg-panel px-3 py-2.5 shadow-sm select-none hover:bg-wash-1 active:cursor-grabbing",
                children: [
                  ExportDeliveryJsx.jsx(runtime2.KitIcon, {
                    name: (0, runtime2.literalMessage)("File"),
                    size: 18,
                    className: "shrink-0 text-fg-secondary"
                  }),
                  ExportDeliveryJsx.jsxs("div", {
                    className: "min-w-0 flex-1",
                    children: [
                      ExportDeliveryJsx.jsx("div", {
                        className: "truncate text-sm font-medium",
                        children: delivery.filename
                      }),
                      ExportDeliveryJsx.jsx("div", {
                        className: "text-xs text-fg-muted",
                        children: (0, runtime2.kilobytesLabel)(value.toLocaleString((0, runtime2.intlLocale)("NumberFormat", "en-US"), { useGrouping: !1 }))
                      })
                    ]
                  }),
                  ExportDeliveryJsx.jsx("span", {
                    className: "shrink-0 rounded border border-border-line bg-page px-1.5 py-0.5 text-[11px] text-fg-muted",
                    children: (0, runtime2.formatMessage)({
                      defaultMessage: "拖出以保存",
                      id: "QqiFkgov5D"
                    })
                  })
                ]
              }),
              ExportDeliveryJsx.jsx("p", {
                className: "text-xs text-fg-muted",
                children: richMessage({
                  // Upstream says "Or ask Claude in chat for the file."; this port keeps its agent wording.
                  defaultMessage: "将<strong>文件标签拖到</strong>桌面或文件夹即可保存（支持 Chrome 和 Edge，桌面应用可能不支持）。也可以请助手提供文件。",
                  id: "qWwldSj2x6"
                }, {
                  strong: (parts) => ExportDeliveryJsx.jsx("strong", {
                    children: parts
                  })
                })
              })
            ]
          }),
          ExportDeliveryJsx.jsx(runtime2.DialogComponents.Footer, {
            align: "end",
            children: ExportDeliveryJsx.jsx(runtime2.DialogComponents.Close, {
              render: ExportDeliveryJsx.jsx(runtime2.Button, {
                variant: "primary",
                children: runtime2.doneLabel
              })
            })
          })
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "ReactExportDelivery", () => ReactExportDelivery, (value) => {
    ReactExportDelivery = value;
  }), bindRuntimeValue(runtime2, "ExportDeliveryJsx", () => ExportDeliveryJsx, (value) => {
    ExportDeliveryJsx = value;
  }), bindRuntimeValue(runtime2, "PPTX_MIME_TYPE", () => PPTX_MIME_TYPE, (value) => {
    PPTX_MIME_TYPE = value;
  }), bindRuntimeValue(runtime2, "PDF_MIME_TYPE", () => PDF_MIME_TYPE, (value) => {
    PDF_MIME_TYPE = value;
  }), bindRuntimeValue(runtime2, "HTML_MIME_TYPE", () => HTML_MIME_TYPE, (value) => {
    HTML_MIME_TYPE = value;
  }), bindRuntimeValue(runtime2, "PNG_MIME_TYPE", () => PNG_MIME_TYPE, (value) => {
    PNG_MIME_TYPE = value;
  }), bindRuntimeValue(runtime2, "exportDeliveryFailureMessage", () => exportDeliveryFailureMessage), bindRuntimeValue(runtime2, "ExportDeliveryDialog", () => ExportDeliveryDialog), () => {
    (0, runtime2.initializeUiInputs210)(), ReactExportDelivery = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ExportDeliveryJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation", PDF_MIME_TYPE = "application/pdf", HTML_MIME_TYPE = "text/html", PNG_MIME_TYPE = "image/png";
  };
}
export {
  installDeliveryDialog
};
