// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryProvider(runtime2) {
  var ReactExportProvider, MAX_EXPORT_INLINE_CHARS, DEFAULT_EXPORT_WINDOW_MS, INTERACTIVE_EXPORT_WINDOW_MS, ExportCancelledError, registeredExportEntries, registeredExportOptions, pendingExportRequests, runningExportRequests;
  function exportRequestOptionsCompatible(left, right) {
    return left.interactive === right.interactive && left.bundle === right.bundle && left.sender === right.sender && left.variant === right.variant && left.windowMs <= right.windowMs;
  }
  function exportCapabilityDescriptors(entries) {
    let descriptors = [];
    for (let value of entries) {
      let value2 = descriptors.findIndex((input) => input.format === value.format), state = {
        format: value.format,
        ...value.interactive === !0 && {
          interactive: !0
        },
        ...value.bundle === !0 && {
          bundle: !0
        },
        ...value.handoff === !0 && {
          handoff: !0
        }
      };
      if (value.variant === void 0) {
        value2 === -1 && descriptors.push({
          ...state,
          ...value.disabled === !0 && {
            disabled: !0
          }
        });
        continue;
      }
      let value3 = value.disabled === !0 ? {
        id: value.variant,
        disabled: !0
      } : {
        id: value.variant
      };
      if (value2 === -1)
        descriptors.push({
          ...state,
          variants: [value3]
        });
      else {
        let value4 = descriptors[value2];
        value4.variants !== void 0 && (descriptors[value2] = {
          ...value4,
          variants: [...value4.variants, value3]
        });
      }
    }
    return descriptors.map((input) => input.variants === void 0 ? input : input.variants.every((input2) => input2.disabled === !0) ? {
      ...input,
      disabled: !0,
      variants: input.variants.map((input2) => ({
        id: input2.id
      }))
    } : input);
  }
  function scheduleExportRequestRelease(request, entry) {
    !request.interactive || entry.releaseRequestAfterMs === void 0 || (request.releaseTimer = setTimeout(() => {
      request.releaseTimer = void 0, request.released = !0, (0, runtime2.declineHostExport)(request.request, !0);
    }, entry.releaseRequestAfterMs));
  }
  function clearExportRequestReleaseTimer(request) {
    request?.releaseTimer !== void 0 && (clearTimeout(request.releaseTimer), request.releaseTimer = void 0);
  }
  function consumePendingExportRequest(format, request) {
    let existing = pendingExportRequests.get(format), chosen = existing === void 0 || !exportRequestOptionsCompatible(request, existing) ? request : existing;
    return chosen === existing && pendingExportRequests.delete(format), clearExportRequestReleaseTimer(chosen), chosen;
  }
  function exportDeliveryHandled(delivery) {
    switch (delivery.outcome) {
      case "saved":
      case "declined":
        return !0;
      case "withheld":
        return !1;
      case "unsupported":
        return delivery.code !== "no_shell_save" && delivery.code !== "";
    }
  }
  async function produceAndDeliverExport(entry, request, attempt) {
    let { format, variant } = entry, value = variant === void 0 ? {} : {
      variant
    }, value2;
    try {
      value2 = await entry.produce({
        interactive: request.interactive,
        bundle: request.bundle,
        windowMs: request.windowMs,
        ...request.sender !== void 0 && {
          sender: request.sender
        },
        signal: attempt
      });
    } catch (value7) {
      let value8 = value7 instanceof Error && value7.name === "ExportCancelled", value9 = attempt.aborted ? request : consumePendingExportRequest(format, request);
      return clearExportRequestReleaseTimer(value9), value9.released !== !0 && (0, runtime2.declineHostExport)(value9.request, value8), value8 ? {
        format,
        ...value,
        outcome: "declined",
        code: "cancelled"
      } : {
        format,
        ...value,
        outcome: "failed",
        code: "producer_failed"
      };
    }
    let value3 = consumePendingExportRequest(format, request);
    if (value3.released === !0 && attempt.aborted)
      return {
        format,
        ...value,
        outcome: "unsupported",
        code: "request_unknown",
        filename: value2.filename
      };
    let value4 = value3.released === !0, value5 = value4 ? await (0, runtime2.saveThroughShell)(value2.data, value2.filename) : await (0, runtime2.saveThroughShell)(value2.data, value2.filename, {
      request: value3.request
    });
    !value4 && !attempt.aborted && request.interactive && entry.releaseRequestAfterMs !== void 0 && value5.outcome === "unsupported" && value5.code === "request_unknown" && (value5 = await (0, runtime2.saveThroughShell)(value2.data, value2.filename), value4 = !0), !value4 && !exportDeliveryHandled(value5) && (0, runtime2.declineHostExport)(value3.request);
    let value6 = value5.outcome === "saved" ? "delivered" : value5.outcome;
    return {
      format,
      ...value,
      outcome: value6,
      code: value5.code,
      filename: value2.filename,
      ...value4 && {
        late: {
          saved: value5,
          file: value2
        }
      }
    };
  }
  function findExportEntry(format, variant) {
    let entry = variant === void 0 ? registeredExportEntries?.find((input) => input.format === format) : registeredExportEntries?.find((input) => input.format === format && input.variant === variant);
    if (entry !== void 0 && entry.disabled !== !0)
      return entry;
  }
  async function dispatchExportRequest(format, request, interactive, variant, bundle, windowMs, sender) {
    let value = findExportEntry(format, variant);
    if (value === void 0) {
      variant === void 0 && registeredExportEntries?.some((input) => input.format === format && input.variant !== void 0) === !0 && (0, runtime2.declineHostExport)(request);
      return;
    }
    let state = {
      request,
      interactive,
      bundle,
      windowMs,
      ...sender !== void 0 && {
        sender
      },
      ...value.variant !== void 0 && {
        variant: value.variant
      }
    };
    clearExportRequestReleaseTimer(pendingExportRequests.get(format)), pendingExportRequests.set(format, state), scheduleExportRequestRelease(state, value);
    let entry = runningExportRequests.get(format);
    if (entry !== void 0) {
      exportRequestOptionsCompatible(entry, state) || entry.abort.abort();
      return;
    }
    try {
      for (; ; ) {
        let entry3 = pendingExportRequests.get(format), value2 = entry3 === void 0 ? void 0 : findExportEntry(format, entry3.variant);
        if (entry3 === void 0 || value2 === void 0)
          break;
        let controller = new AbortController();
        runningExportRequests.set(format, {
          interactive: entry3.interactive,
          bundle: entry3.bundle,
          windowMs: entry3.windowMs,
          ...entry3.sender !== void 0 && {
            sender: entry3.sender
          },
          ...entry3.variant !== void 0 && {
            variant: entry3.variant
          },
          abort: controller
        });
        let releaseExport = (0, runtime2.holdExportInProgress)(), value3 = await produceAndDeliverExport(value2, entry3, controller.signal).finally(releaseExport);
        try {
          registeredExportOptions.onResult?.(value3);
        } catch (value4) {
          typeof reportError == "function" ? reportError(value4) : console.error(value4);
        }
      }
      let entry2 = pendingExportRequests.get(format);
      entry2 !== void 0 && (pendingExportRequests.delete(format), clearExportRequestReleaseTimer(entry2), entry2.released !== !0 && (0, runtime2.declineHostExport)(entry2.request));
    } finally {
      runningExportRequests.delete(format);
    }
  }
  function handleExportCapabilityRequest(format, request, interactive, variant, bundle = !1, windowMs = interactive ? INTERACTIVE_EXPORT_WINDOW_MS : DEFAULT_EXPORT_WINDOW_MS, sender) {
    dispatchExportRequest(format, request, interactive, variant, bundle, windowMs, sender);
  }
  function validateExportEntries(entries) {
    let validEntries = [];
    for (let value of entries) {
      if (!runtime2.EXPORT_FORMAT_PATTERN.test(value.format) || value.variant !== void 0 && (value.handoff === !0 || !runtime2.HOST_DESTINATION_PATTERN.test(value.variant)))
        continue;
      let value2 = validEntries.find((input) => input.format === value.format);
      value2 !== void 0 && (value2.variant === void 0 || value.variant === void 0 || value2.interactive === !0 != (value.interactive === !0) || value2.bundle === !0 != (value.bundle === !0) || validEntries.some((input) => input.format === value.format && input.variant === value.variant)) || validEntries.push(value);
    }
    return validEntries;
  }
  function registerExportEntries(entries, options = {}) {
    let validatedEntries = validateExportEntries(entries);
    return registeredExportEntries = validatedEntries, registeredExportOptions = options, (0, runtime2.setHostExportHandler)(handleExportCapabilityRequest), (0, runtime2.setHostExports)(exportCapabilityDescriptors(validatedEntries)), () => {
      if (registeredExportEntries === validatedEntries) {
        registeredExportEntries = null, registeredExportOptions = {};
        for (let value of pendingExportRequests.values())
          clearExportRequestReleaseTimer(value), value.released !== !0 && (0, runtime2.declineHostExport)(value.request);
        pendingExportRequests.clear();
        for (let value of runningExportRequests.values())
          value.abort.abort();
        (0, runtime2.setHostExports)(null), (0, runtime2.setHostExportHandler)(null);
      }
    };
  }
  function useExportEntries(entries, options) {
    let current = ReactExportProvider.useRef({
      entries,
      opts: options
    });
    current.current = {
      entries,
      opts: options
    };
    let cleanup = ReactExportProvider.useRef(null), descriptorKey = entries === null ? "" : JSON.stringify([
      exportCapabilityDescriptors(entries),
      entries.map((input) => input.releaseRequestAfterMs ?? null)
    ]);
    ReactExportProvider.useEffect(() => {
      let { entries: current2 } = current.current;
      if (current2 === null) {
        cleanup.current?.(), cleanup.current = null;
        return;
      }
      let value = current2.map((input) => ({
        format: input.format,
        ...input.variant !== void 0 && {
          variant: input.variant
        },
        disabled: input.disabled,
        interactive: input.interactive,
        bundle: input.bundle,
        handoff: input.handoff,
        ...input.releaseRequestAfterMs !== void 0 && {
          releaseRequestAfterMs: input.releaseRequestAfterMs
        },
        produce: (input2) => (current.current.entries?.find((input3) => input3.format === input.format && input3.variant === input.variant) ?? input).produce(input2)
      }));
      cleanup.current = registerExportEntries(value, {
        onResult: (input) => current.current.opts?.onResult?.(input)
      });
    }, [descriptorKey]), ReactExportProvider.useEffect(() => () => {
      cleanup.current?.(), cleanup.current = null;
    }, []);
  }
  return bindRuntimeValue(runtime2, "ReactExportProvider", () => ReactExportProvider, (value) => {
    ReactExportProvider = value;
  }), bindRuntimeValue(runtime2, "MAX_EXPORT_INLINE_CHARS", () => MAX_EXPORT_INLINE_CHARS, (value) => {
    MAX_EXPORT_INLINE_CHARS = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_EXPORT_WINDOW_MS", () => DEFAULT_EXPORT_WINDOW_MS, (value) => {
    DEFAULT_EXPORT_WINDOW_MS = value;
  }), bindRuntimeValue(runtime2, "INTERACTIVE_EXPORT_WINDOW_MS", () => INTERACTIVE_EXPORT_WINDOW_MS, (value) => {
    INTERACTIVE_EXPORT_WINDOW_MS = value;
  }), bindRuntimeValue(runtime2, "ExportCancelledError", () => ExportCancelledError, (value) => {
    ExportCancelledError = value;
  }), bindRuntimeValue(runtime2, "registeredExportEntries", () => registeredExportEntries, (value) => {
    registeredExportEntries = value;
  }), bindRuntimeValue(runtime2, "registeredExportOptions", () => registeredExportOptions, (value) => {
    registeredExportOptions = value;
  }), bindRuntimeValue(runtime2, "pendingExportRequests", () => pendingExportRequests, (value) => {
    pendingExportRequests = value;
  }), bindRuntimeValue(runtime2, "runningExportRequests", () => runningExportRequests, (value) => {
    runningExportRequests = value;
  }), bindRuntimeValue(runtime2, "exportRequestOptionsCompatible", () => exportRequestOptionsCompatible), bindRuntimeValue(runtime2, "exportCapabilityDescriptors", () => exportCapabilityDescriptors), bindRuntimeValue(runtime2, "scheduleExportRequestRelease", () => scheduleExportRequestRelease), bindRuntimeValue(runtime2, "clearExportRequestReleaseTimer", () => clearExportRequestReleaseTimer), bindRuntimeValue(runtime2, "consumePendingExportRequest", () => consumePendingExportRequest), bindRuntimeValue(runtime2, "exportDeliveryHandled", () => exportDeliveryHandled), bindRuntimeValue(runtime2, "produceAndDeliverExport", () => produceAndDeliverExport), bindRuntimeValue(runtime2, "findExportEntry", () => findExportEntry), bindRuntimeValue(runtime2, "dispatchExportRequest", () => dispatchExportRequest), bindRuntimeValue(runtime2, "handleExportCapabilityRequest", () => handleExportCapabilityRequest), bindRuntimeValue(runtime2, "validateExportEntries", () => validateExportEntries), bindRuntimeValue(runtime2, "registerExportEntries", () => registerExportEntries), bindRuntimeValue(runtime2, "useExportEntries", () => useExportEntries), () => {
    ReactExportProvider = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), MAX_EXPORT_INLINE_CHARS = 2e5, DEFAULT_EXPORT_WINDOW_MS = 6e4, INTERACTIVE_EXPORT_WINDOW_MS = 3e5, ExportCancelledError = class extends Error {
      constructor() {
        super("export cancelled"), this.name = "ExportCancelled";
      }
    }, registeredExportEntries = null, registeredExportOptions = {}, pendingExportRequests = /* @__PURE__ */ new Map(), runningExportRequests = /* @__PURE__ */ new Map();
  };
}
export {
  installDeliveryProvider
};
