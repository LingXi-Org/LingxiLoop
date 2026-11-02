// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesBootReader(runtime2) {
  var BootReadError, MAX_BOOT_EARLY_SLIDE_READS, errorHttpStatus, errorMessage;
  async function readFilesBootState(options) {
    let { port, indexPath } = options, normalizedPort = (0, runtime2.normalizeFilesPort)(port), retryDelays = options.waits ?? runtime2.BOOT_FILE_READ_RETRY_DELAYS_MS, wantsEarlySlide = options.wants ?? (() => !1), timers = options.timers ?? {
      setTimeout: (input, options2) => setTimeout(input, options2)
    }, earlyHotSource = options.early ?? (0, runtime2.currentHotReloadBridge)(), value = Math.max(1, options.maxPasses ?? MAX_BOOT_EARLY_SLIDE_READS), index4 = 0, callback = (input) => {
      try {
        options.onEvent?.(input);
      } catch {
      }
    }, callback2 = (input) => new Promise((input2) => void timers.setTimeout(input2, input));
    function value2() {
      let value9 = earlyHotSource?.queued;
      if (value9 === void 0 || value9.length === 0)
        return;
      let value10 = value9[value9.length - 1];
      if (port.version().version !== value10.to.version)
        try {
          normalizedPort.noteAdopted?.(value10.to, value9[0].from);
        } catch {
        }
    }
    function value3(input, options2) {
      if (input instanceof BootReadError)
        return input;
      let value9 = errorHttpStatus(input);
      return input?.code === "redirected" ? new BootReadError("unreadable", options2, options2 + ": " + errorMessage(input)) : new BootReadError(value9 === 401 || value9 === 403 ? "access_revoked" : "unreadable", options2, options2 + ": " + errorMessage(input), value9);
    }
    async function value4(input, options2) {
      if (!(input?.code !== "redirected" || normalizedPort.readTextUnchecked === void 0))
        try {
          let value9 = await normalizedPort.readTextUnchecked(options2);
          return callback({
            type: "boot-took-redirected",
            path: options2
          }), value9;
        } catch {
          return;
        }
    }
    async function value5(input, options2, context, value9) {
      for (let index32 = 0; ; index32++)
        try {
          return await options2();
        } catch (value10) {
          if (!(0, runtime2.isRetryableFileReadAccessError)(value10))
            throw value3(value10, input);
          if (context !== void 0 && errorHttpStatus(value10) === 404 && await context())
            return null;
          if (index32 >= retryDelays.length) {
            let value12 = await value9?.(value10);
            if (value12 !== void 0)
              return value12;
            throw value3(value10, input);
          }
          index4 += 1;
          let value11 = errorHttpStatus(value10);
          callback({
            type: "boot-retry",
            path: input,
            attempt: index32 + 1,
            ...value11 !== void 0 ? {
              status: value11
            } : {},
            waitMs: retryDelays[index32]
          }), await callback2(retryDelays[index32]);
        }
    }
    async function value6() {
      let callback4 = () => new BootReadError("no_index", indexPath, indexPath + " is not in this artifact", void 0, !0), value9 = options.mayWrite === !0 ? retryDelays : runtime2.FILE_FETCH_RETRY_DELAYS_MS;
      try {
        return await (0, runtime2.retryFileRead)(() => port.readText(indexPath), timers, (input, options2) => {
          index4 += 1, callback({
            type: "boot-retry",
            path: indexPath,
            attempt: input,
            ...errorHttpStatus(options2) !== void 0 ? {
              status: errorHttpStatus(options2)
            } : {},
            waitMs: value9[input - 1] ?? 0
          });
        }, value9);
      } catch (value10) {
        let value11 = await value4(value10, indexPath);
        if (value11 !== void 0)
          return value11;
        throw options.mayWrite !== !0 || errorHttpStatus(value10) === 404 ? callback4() : new BootReadError("unreadable", indexPath, indexPath + ": " + errorMessage(value10), errorHttpStatus(value10));
      }
    }
    let index22 = 0;
    async function value7() {
      for (; ; ) {
        let value9 = await value5("_files.json", () => port.list());
        if (options.mayWrite !== !0 || !(0, runtime2.fileListingIsNarrowed)(value9, port) || index22 >= retryDelays.length)
          return value9;
        let value10 = retryDelays[index22];
        index22 += 1, index4 += 1, callback({
          type: "boot-retry",
          path: "_files.json",
          attempt: index22,
          reason: "narrowed",
          waitMs: value10
        }), await callback2(value10);
        try {
          normalizedPort.forgetBootListing?.();
        } catch {
        }
      }
    }
    let callback3 = (input) => async () => {
      value2();
      let value9 = await port.list().catch(() => {
      });
      return value9 !== void 0 && !(0, runtime2.fileListingIsNarrowed)(value9, port) && !value9.some((input2) => input2.path === input);
    }, value8, entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map();
    for (let count = 1; ; count++) {
      value2();
      let version2 = port.version().version, value9 = await value7(), value10 = (0, runtime2.fileListingIsNarrowed)(value9, port), entries3 = new Map(value9.map((input) => [
        input.path,
        input
      ])), entry = entries3.get(indexPath);
      if (entry === void 0) {
        if (!value10)
          throw new BootReadError("no_index", indexPath, indexPath + " is not in this artifact", void 0, !1);
        value8 = await value6();
      }
      for (let value12 of [...entries.keys()]) {
        let entry2 = entries3.get(value12);
        (entry2 === void 0 || !wantsEarlySlide(entry2)) && (entries.delete(value12), entries2.delete(value12));
      }
      let value11 = [
        ...entry !== void 0 ? [entry] : [],
        ...value9.filter((input) => input.path !== indexPath && wantsEarlySlide(input))
      ].filter((input) => entries2.get(input.path) !== input.sha256);
      await Promise.all(value11.map(async (input) => {
        let value12 = await value5(input.path, () => port.readText(input.path), callback3(input.path), (input2) => value4(input2, input.path));
        if (value12 === null) {
          callback({
            type: "boot-removed",
            path: input.path
          }), entries.delete(input.path), entries2.delete(input.path), input.path === indexPath && (value8 = void 0);
          return;
        }
        input.path === indexPath ? value8 = value12 : entries.set(input.path, value12), entries2.set(input.path, input.sha256);
      })), value2();
      let version22 = port.version().version;
      if (version22 === version2 || count >= value) {
        if (value8 === void 0)
          throw new BootReadError("no_index", indexPath, indexPath + " was removed while the editor booted");
        return {
          version: port.version(),
          listing: value9,
          index: value8,
          files: entries,
          retries: index4,
          passes: count,
          ...value10 ? {
            narrowed: !0
          } : {}
        };
      }
      callback({
        type: "boot-moved",
        from: version2,
        to: version22
      });
    }
  }
  return bindRuntimeValue(runtime2, "BootReadError", () => BootReadError, (value) => {
    BootReadError = value;
  }), bindRuntimeValue(runtime2, "MAX_BOOT_EARLY_SLIDE_READS", () => MAX_BOOT_EARLY_SLIDE_READS, (value) => {
    MAX_BOOT_EARLY_SLIDE_READS = value;
  }), bindRuntimeValue(runtime2, "errorHttpStatus", () => errorHttpStatus, (value) => {
    errorHttpStatus = value;
  }), bindRuntimeValue(runtime2, "errorMessage", () => errorMessage, (value) => {
    errorMessage = value;
  }), bindRuntimeValue(runtime2, "readFilesBootState", () => readFilesBootState), () => {
    BootReadError = class extends Error {
      code;
      path;
      status;
      narrowed;
      constructor(input, options, context, value, extra) {
        super(context), this.name = "BootReadError", this.code = input, this.path = options, this.status = value, this.narrowed = extra;
      }
    }, MAX_BOOT_EARLY_SLIDE_READS = 6, errorHttpStatus = (input) => {
      let value = input?.status;
      if (typeof value == "number")
        return value;
    }, errorMessage = (input) => input instanceof Error ? input.message : String(input?.message ?? input);
  };
}
export {
  installFilesBootReader
};
