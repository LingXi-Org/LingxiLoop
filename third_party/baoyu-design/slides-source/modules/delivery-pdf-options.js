// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryPdfOptions(runtime2) {
  var ReactPdfOptions, PdfOptionsJsx, DEFAULT_PDF_EXPORT_OPTIONS, PDF_EXPORT_QUALITY_OPTIONS, pendingPdfOptionsRequest, pdfOptionsRequestSequence, pdfOptionsSubscribers, preventRepeatedExportDialogActivation;
  function notifyPdfOptionsSubscribers() {
    for (let value of pdfOptionsSubscribers)
      value(pendingPdfOptionsRequest);
  }
  function requestPdfExportOptions(ask = {}) {
    return new Promise((input) => {
      let value = pendingPdfOptionsRequest;
      if (pendingPdfOptionsRequest = {
        id: pdfOptionsRequestSequence++,
        ask,
        resolve: input
      }, value && value.resolve(null), pdfOptionsSubscribers.size === 0) {
        pendingPdfOptionsRequest = null, input(null);
        return;
      }
      notifyPdfOptionsSubscribers();
    });
  }
  function dismissPdfExportOptions() {
    let value = pendingPdfOptionsRequest;
    value && (pendingPdfOptionsRequest = null, value.resolve(null), notifyPdfOptionsSubscribers());
  }
  function resolvePdfExportOptions(request, options) {
    pendingPdfOptionsRequest === request && (pendingPdfOptionsRequest = null, request.resolve(options), notifyPdfOptionsSubscribers());
  }
  function captureExportDialogReturnFocus() {
    let activeElement2 = document.activeElement;
    if (activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement)
      return [];
    let ancestor = activeElement2.closest('[role="menu"]'), value = ancestor === null ? null : document.getElementById(ancestor.getAttribute("aria-labelledby") ?? "");
    return value === null ? [activeElement2] : [activeElement2, value];
  }
  function PdfExportOptionsDialog({ p, warning, notesAvailable }) {
    let [value, value2] = ReactPdfOptions.useState(p.ask.defaults ?? DEFAULT_PDF_EXPORT_OPTIONS), ref = ReactPdfOptions.useRef(null), [value3] = ReactPdfOptions.useState(() => document.hasFocus() ? captureExportDialogReturnFocus() : []), callback = () => document.hasFocus() && value3.find((input) => input.isConnected) || !1, [value4, value5] = ReactPdfOptions.useState(warning);
    warning !== void 0 && value4 !== warning && value5(warning);
    let value6 = warning !== void 0 ? warning.title + ". " + warning.message : value4?.cleared;
    return PdfOptionsJsx.jsx(runtime2.DialogComponents.Root, {
      open: !0,
      onOpenChange: (input) => {
        input || resolvePdfExportOptions(p, null);
      },
      children: PdfOptionsJsx.jsx(runtime2.DialogComponents.Popup, {
        size: "sm",
        initialFocus: ref,
        finalFocus: callback,
        "data-testid": "pdf-options-dialog",
        children: PdfOptionsJsx.jsxs(runtime2.Form, {
          className: "contents",
          onSubmit: () => resolvePdfExportOptions(p, value),
          children: [
            PdfOptionsJsx.jsx(runtime2.DialogComponents.Header, {
              showClose: !1,
              description: value6 !== void 0 ? PdfOptionsJsx.jsx("span", {
                "data-testid": "pdf-options-warning",
                children: value6
              }) : void 0,
              children: (0, runtime2.formatMessage)({
                defaultMessage: "下载为 PDF",
                id: "39/mBoZWkP"
              })
            }),
            PdfOptionsJsx.jsxs("div", {
              className: "flex flex-col gap-lg",
              children: [
                PdfOptionsJsx.jsxs(runtime2.FieldRoot, {
                  name: "quality",
                  className: "gap-md",
                  children: [
                    PdfOptionsJsx.jsx(runtime2.FieldLabel, {
                      children: (0, runtime2.formatMessage)({
                        defaultMessage: "图片质量",
                        id: "6CALXekMDt"
                      })
                    }),
                    PdfOptionsJsx.jsx(runtime2.RADIO_CARD_CLASS, {
                      value: value.quality,
                      onChange: (input) => value2({
                        ...value,
                        quality: input
                      }),
                      options: PDF_EXPORT_QUALITY_OPTIONS
                    }),
                    PdfOptionsJsx.jsx(runtime2.FieldDescription, {
                      children: (0, runtime2.formatMessage)({
                        defaultMessage: "质量越高，文件越大。",
                        id: "LCcDL7YrPK"
                      })
                    })
                  ]
                }),
                PdfOptionsJsx.jsx(runtime2.Checkbox, {
                  label: (0, runtime2.formatMessage)({
                    defaultMessage: "包含演讲者备注",
                    id: "PlHwkIjxHf"
                  }),
                  checked: value.notes,
                  onCheckedChange: (input) => value2({
                    ...value,
                    notes: input
                  }),
                  disabled: !notesAvailable,
                  disabledReason: (0, runtime2.formatMessage)({
                    defaultMessage: "要导出的幻灯片均没有演讲者备注。",
                    id: "KY03wgmlX8"
                  })
                })
              ]
            }),
            PdfOptionsJsx.jsxs(runtime2.DialogComponents.Footer, {
              align: "end",
              children: [
                PdfOptionsJsx.jsx(runtime2.DialogComponents.Close, {
                  render: PdfOptionsJsx.jsx(runtime2.Button, {
                    variant: "secondary",
                    children: (0, runtime2.formatMessage)({
                      defaultMessage: "取消",
                      id: "QNtFQoNJGx"
                    })
                  })
                }),
                PdfOptionsJsx.jsx(runtime2.Button, {
                  ref,
                  type: "button",
                  onClick: () => resolvePdfExportOptions(p, value),
                  variant: "primary",
                  "data-initial-focus": "",
                  onKeyDown: preventRepeatedExportDialogActivation,
                  children: warning?.confirmLabel ?? (0, runtime2.formatMessage)({
                    defaultMessage: "下载",
                    id: "rygQNms/gX"
                  })
                })
              ]
            })
          ]
        })
      })
    });
  }
  function PdfExportOptionsHost({ warning, notesAvailable = !0 }) {
    let [value, value2] = ReactPdfOptions.useState(pendingPdfOptionsRequest);
    return (0, runtime2.usePopupFocusRestoration)(value, () => pendingPdfOptionsRequest !== null), ReactPdfOptions.useEffect(() => (pdfOptionsSubscribers.add(value2), () => {
      pdfOptionsSubscribers.delete(value2), pdfOptionsSubscribers.size === 0 && dismissPdfExportOptions();
    }), []), value ? PdfOptionsJsx.jsx(PdfExportOptionsDialog, {
      p: value,
      warning,
      notesAvailable
    }, value.id) : null;
  }
  return bindRuntimeValue(runtime2, "ReactPdfOptions", () => ReactPdfOptions, (value) => {
    ReactPdfOptions = value;
  }), bindRuntimeValue(runtime2, "PdfOptionsJsx", () => PdfOptionsJsx, (value) => {
    PdfOptionsJsx = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_PDF_EXPORT_OPTIONS", () => DEFAULT_PDF_EXPORT_OPTIONS, (value) => {
    DEFAULT_PDF_EXPORT_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "PDF_EXPORT_QUALITY_OPTIONS", () => PDF_EXPORT_QUALITY_OPTIONS, (value) => {
    PDF_EXPORT_QUALITY_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "pendingPdfOptionsRequest", () => pendingPdfOptionsRequest, (value) => {
    pendingPdfOptionsRequest = value;
  }), bindRuntimeValue(runtime2, "pdfOptionsRequestSequence", () => pdfOptionsRequestSequence, (value) => {
    pdfOptionsRequestSequence = value;
  }), bindRuntimeValue(runtime2, "pdfOptionsSubscribers", () => pdfOptionsSubscribers, (value) => {
    pdfOptionsSubscribers = value;
  }), bindRuntimeValue(runtime2, "notifyPdfOptionsSubscribers", () => notifyPdfOptionsSubscribers), bindRuntimeValue(runtime2, "requestPdfExportOptions", () => requestPdfExportOptions), bindRuntimeValue(runtime2, "dismissPdfExportOptions", () => dismissPdfExportOptions), bindRuntimeValue(runtime2, "resolvePdfExportOptions", () => resolvePdfExportOptions), bindRuntimeValue(runtime2, "captureExportDialogReturnFocus", () => captureExportDialogReturnFocus), bindRuntimeValue(runtime2, "preventRepeatedExportDialogActivation", () => preventRepeatedExportDialogActivation, (value) => {
    preventRepeatedExportDialogActivation = value;
  }), bindRuntimeValue(runtime2, "PdfExportOptionsDialog", () => PdfExportOptionsDialog), bindRuntimeValue(runtime2, "PdfExportOptionsHost", () => PdfExportOptionsHost), () => {
    (0, runtime2.initializeUiInputs210)(), ReactPdfOptions = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PdfOptionsJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), DEFAULT_PDF_EXPORT_OPTIONS = {
      quality: "best",
      notes: !1
    }, PDF_EXPORT_QUALITY_OPTIONS = [
      {
        value: "good",
        label: (0, runtime2.formatMessage)({ defaultMessage: "标准", id: "DEmnN3sz8P" })
      },
      {
        value: "better",
        label: (0, runtime2.formatMessage)({ defaultMessage: "高清", id: "dL+sGx3G/p" })
      },
      {
        value: "best",
        label: (0, runtime2.formatMessage)({ defaultMessage: "最佳", id: "6ZyCmoqrLJ" })
      }
    ], pendingPdfOptionsRequest = null, pdfOptionsRequestSequence = 1, pdfOptionsSubscribers = /* @__PURE__ */ new Set(), preventRepeatedExportDialogActivation = (event) => {
      event.repeat && (event.key === "Enter" || event.key === " ") && event.preventDefault();
    };
  };
}
export {
  installDeliveryPdfOptions
};
