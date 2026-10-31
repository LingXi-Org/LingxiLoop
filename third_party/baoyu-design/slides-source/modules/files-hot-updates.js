// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesHotUpdates(runtime2) {
  var BOOT_FILE_READ_RETRY_DELAYS_MS, MAX_HOT_FETCH_RETRIES, HOT_UPDATE_MAX_DEFER_MS, HOT_RESTART_GRACE_MS, HOT_UPDATE_SETTLE_MS, HOT_RESTART_BACKOFF_MS, HOT_RESTART_BACKOFF_MAX_MS, HOT_UNSENT_WAIT_MS, hotChangedPath, shortHotErrorMessage, hotListingDescriptor, describeHotChangedPaths, hotAdoptMethodKind, HOT_INDEX_RECHECK_DELAY_MS;
  function getHotCapability() {
    let value = (0, runtime2.getHostCapability)("hot");
    return (typeof value == "object" || typeof value == "function") && value !== null ? value : null;
  }
  function waitForHotUpdateIdle(input, options = {}) {
    let value = options.timers ?? {
      setTimeout: (input2, options2) => setTimeout(input2, options2),
      clearTimeout: (input2) => clearTimeout(input2)
    }, callback = () => value.now?.() ?? Date.now(), value2 = callback();
    return new Promise((input2) => {
      let flag = !1, callback2 = (input3) => {
        if (!flag) {
          flag = !0, input3 || value.clearTimeout?.(value3);
          try {
            options.onEvent?.({
              type: "reveal",
              heldMs: callback() - value2,
              timedOut: input3,
              carried: options.carried === !0
            });
          } catch {
          }
          input2();
        }
      }, value3 = value.setTimeout(() => callback2(!0), options.holdMs ?? HOT_INDEX_RECHECK_DELAY_MS);
      Promise.resolve(input).then(() => callback2(!1), () => callback2(!1));
    });
  }
  function createFilesHotUpdateController(options) {
    let hot = options.hot !== void 0 ? options.hot : getHotCapability(), counters2 = {
      updates: 0,
      applied: 0,
      deferred: 0,
      restarts: 0,
      fetchRetries: 0
    }, cleanups = [];
    if (options.embedded === !0 || hot === null || typeof hot.accept != "function")
      return {
        dispose: () => {
        },
        active: !1,
        stats: () => ({
          ...counters2
        }),
        events: cleanups
      };
    let { port } = options, noFiles = options.noFiles === !0, value = port === void 0 ? {} : (0, runtime2.normalizeFilesPort)(port), value2 = options.isCode ?? runtime2.isRuntimeInternalFilePath, value3 = options.retryMs ?? BOOT_FILE_READ_RETRY_DELAYS_MS, value4 = options.timers ?? {
      setTimeout: (input, options2) => setTimeout(input, options2),
      clearTimeout: (input) => clearTimeout(input),
      now: () => Date.now()
    }, callback = () => value4.now?.() ?? Date.now(), editorBusy = () => {
      try {
        return options.isBusy?.() === !0;
      } catch {
        return !1;
      }
    }, pageBusy = () => editorBusy() || (0, runtime2.exportOrShellSaveInProgress)(), editsUnsent = () => {
      try {
        return options.unsent?.() === !0;
      } catch {
        return !0;
      }
    }, firstWaitAt, waitedMs = () => firstWaitAt === void 0 ? 0 : callback() - (firstWaitAt = Math.min(firstWaitAt, callback())), restartHeld = () => {
      if (options.held === void 0)
        return pageBusy();
      try {
        return options.held(waitedMs()) === !0;
      } catch {
        return !1;
      }
    }, unsentSince, restartBackoff = HOT_RESTART_BACKOFF_MS, backingOff = !1, flag = !1, value5, value6, leaving = !1, items = [], value7;
    port !== void 0 && value.knownListing === void 0 && port.list().then((input) => {
      value7 ??= new Map(input.map((input2) => [
        input2.path,
        input2.sha256
      ]));
    }, () => {
    });
    function value8(input) {
      cleanups.push(input), cleanups.length > HOT_UPDATE_SETTLE_MS && cleanups.shift();
      try {
        options.onEvent ? options.onEvent(input) : globalThis.console?.debug?.("[hot]", JSON.stringify(input));
      } catch {
      }
    }
    let callback2 = (input) => {
      try {
        options.onBeforeRestart?.(input);
      } catch {
      }
    };
    function value9(input, options2 = 0) {
      if (firstWaitAt ??= callback(), leaving)
        return void (value6 ??= input);
      backingOff && (value6 = input), value6 ??= input, !(flag || value5 !== void 0 && !backingOff) && (value5 !== void 0 && value4.clearTimeout(value5), scheduleRestart(options2));
    }
    function scheduleRestart(delay, backoff = !1) {
      backingOff = backoff, value5 = value4.setTimeout(tryRestart, delay);
    }
    function tryRestart() {
      if (value5 = void 0, flag || value6 === void 0)
        return;
      let pollMs = options.busyPollMs ?? 250;
      if (restartHeld())
        return unsentSince = void 0, scheduleRestart(pollMs);
      let value14 = callback();
      if (!editsUnsent())
        unsentSince = void 0;
      else {
        if (unsentSince === void 0) {
          unsentSince = value14;
          try {
            options.sendNow?.();
          } catch {
          }
        }
        if (value14 - unsentSince < HOT_UNSENT_WAIT_MS)
          return scheduleRestart(pollMs);
      }
      for (unsentSince = void 0; items.length > 0 && value14 - items[0] > HOT_UPDATE_MAX_DEFER_MS; )
        items.shift();
      if (items.length >= HOT_RESTART_GRACE_MS)
        return scheduleRestart(HOT_UPDATE_MAX_DEFER_MS - (value14 - items[0]) + 1);
      items.push(value14), counters2.restarts += 1, callback2(value6);
      try {
        hot.restart?.({
          note: value6
        });
      } catch {
      }
      scheduleRestart(restartBackoff, !0), restartBackoff = Math.min(restartBackoff * 2, HOT_RESTART_BACKOFF_MAX_MS);
    }
    function backOffAfterRestart() {
      flag || backingOff || (firstWaitAt ??= callback(), value6 ??= "deferred-update", value5 !== void 0 && value4.clearTimeout(value5), scheduleRestart(restartBackoff, !0), restartBackoff = Math.min(restartBackoff * 2, HOT_RESTART_BACKOFF_MAX_MS));
    }
    async function value10(filesPort) {
      let entries = new Map(value.knownListing?.() ?? value7 ?? []), entries2 = new Map((await (0, runtime2.listWritableFiles)(filesPort)).map((input) => [input.path, input.sha256]));
      value7 = entries2;
      let items2 = [];
      for (let [value14, value15] of entries2)
        entries.get(value14) !== value15 && items2.push({
          path: value14,
          sha256: value15
        });
      for (let value14 of entries.keys())
        entries2.has(value14) || items2.push({
          path: value14,
          sha256: null
        });
      return items2.sort((input, options2) => input.path < options2.path ? -1 : 1);
    }
    function value11(input) {
      if (flag)
        return void input.restart?.();
      counters2.updates += 1;
      let value14 = hotListingDescriptor(input.from), value15 = hotListingDescriptor(input.to), value16 = restartHeld() || editsUnsent(), value17 = input.required !== "none" ? "required" : noFiles || input.changed !== null && input.changed.some((input2) => value2(input2.path)) ? "code" : void 0, state = {
        type: "update",
        from: value14.version,
        to: value15.version,
        ...value14.seq !== void 0 ? {
          fromSeq: value14.seq
        } : {},
        ...value15.seq !== void 0 ? {
          toSeq: value15.seq
        } : {},
        required: String(input.required),
        shape: hotAdoptMethodKind(input),
        changed: describeHotChangedPaths(input.changed, value2),
        busy: value16
      };
      if (value17 !== void 0) {
        let value19 = value17 === "required" ? "required is " + String(input.required) : noFiles ? "this page keeps nothing in files, so every version is new page code" : "a changed path is the page’s own code: " + (input.changed ?? []).filter((input2) => value2(input2.path)).map((input2) => input2.path).join(", "), value20 = value17 === "code" && input.changed !== null ? input.changed.filter((input2) => !value2(input2.path)) : [], waitWhy = options.held !== void 0 ? "the page says it must wait" : editorBusy() ? "the editor is busy" : editsUnsent() ? "edits are not saved yet" : "an export or a shell save is in progress", shellSaving = (0, runtime2.shellSaveInProgress)() && !editorBusy() && !editsUnsent(), hasDeadline = input.deadline?.now === !0 || typeof input.deadline?.until == "number", deferNote = value17 === "required" || noFiles ? "" : input.deadline?.now === !0 ? " (its deadline has come: the kernel restarts the page)" : hasDeadline ? " (it has a deadline)" : shellSaving ? " (the shell may be showing its save confirm)" : options.contentWhileBusy === !1 ? " (contentWhileBusy is off)" : " (this kernel has no adopt())";
        if (value16 && !noFiles && !shellSaving && !hasDeadline && options.contentWhileBusy !== !1 && value17 === "code" && typeof input.adopt == "function") {
          try {
            input.adopt();
          } catch (value22) {
            return value8({
              ...state,
              decision: "restart",
              why: "u.adopt() threw: " + shortHotErrorMessage(value22)
            }), callback2("adopt failed"), void input.restart?.();
          }
          value8({
            ...state,
            decision: "adopt",
            why: value19 + "; " + waitWhy + ", so the version is taken now (" + String(value20.length) + " content row(s) to apply) and only the restart waits"
          }), value8({
            type: "deferred",
            from: value14.version,
            to: value15.version,
            reason: "code"
          }), counters2.deferred += 1;
          let value21 = callback();
          try {
            value.noteAdopted?.(value15, value14);
          } catch {
          }
          return value9("deferred-update", options.busyPollMs ?? 250), value12(value20, value14, value15, value21, !1).catch((input2) => (value8({
            type: "restart",
            from: value14.version,
            to: value15.version,
            reason: "apply-failed",
            asked: !0,
            error: shortHotErrorMessage(input2)
          }), value9("apply-failed"), "applied"));
        }
        return value16 && typeof input.defer == "function" ? (input.defer(), counters2.deferred += 1, value8({
          ...state,
          decision: "defer",
          why: value19 + "; " + waitWhy + ", so the update waits whole" + deferNote
        }), value8({
          type: "deferred",
          from: value14.version,
          to: value15.version,
          reason: value17
        }), value9("deferred-update", options.busyPollMs ?? 250), "deferred") : (counters2.restarts += 1, value8({
          ...state,
          decision: "restart",
          why: value19
        }), value8({
          type: "restart",
          from: value14.version,
          to: value15.version,
          reason: value17,
          asked: !0
        }), callback2(value17 === "code" ? "code changed" : "required: " + String(input.required)), backOffAfterRestart(), void input.restart?.());
      }
      try {
        input.adopt?.();
      } catch (value19) {
        return value8({
          ...state,
          decision: "restart",
          why: "u.adopt() threw: " + shortHotErrorMessage(value19)
        }), callback2("adopt failed"), void input.restart?.();
      }
      value8({
        ...state,
        decision: "adopt",
        why: input.changed === null ? "the shell sent no diff (changed: null); the listing is diffed after adopt" : "content only"
      });
      let value18 = callback();
      try {
        value.noteAdopted?.(value15, value14);
      } catch {
      }
      return value12(input.changed, value14, value15, value18, !1).catch((input2) => (value8({
        type: "restart",
        from: value14.version,
        to: value15.version,
        reason: "apply-failed",
        asked: !0,
        error: shortHotErrorMessage(input2)
      }), value9("apply-failed"), "applied"));
    }
    async function value12(input, options2, context, value14, extra) {
      if (port === void 0)
        return "applied";
      let filesPort = port, index4 = 0, flag2 = !1, callback3 = (input2, options3) => (value8({
        type: "restart",
        from: options2.version,
        to: context.version,
        reason: input2,
        asked: !0,
        ...options3 !== void 0 ? {
          error: shortHotErrorMessage(options3)
        } : {}
      }), value9(input2), "applied"), callback4 = (input2) => {
        let value22 = input2?.status;
        if (typeof value22 == "number")
          return value22;
      }, callback5 = (input2, options3) => {
        let index22 = 0;
        return (0, runtime2.retryFileRead)(() => (index22 += 1, options3()), value4, (input3, options4) => {
          index4 += 1, counters2.fetchRetries += 1;
          let value22 = callback4(options4), value23 = options4?.redirectedTo;
          value8({
            type: "fetch",
            to: context.version,
            path: input2,
            attempt: input3,
            ok: !1,
            ...value22 !== void 0 ? {
              status: value22
            } : {},
            msAfterAdopt: callback() - value14,
            ...typeof value23 == "string" ? {
              redirectedTo: value23
            } : {}
          }), input3 >= MAX_HOT_FETCH_RETRIES && !flag2 && (flag2 = !0, value8({
            type: "pending",
            from: options2.version,
            to: context.version,
            paths: [input2],
            msAfterAdopt: callback() - value14
          }));
        }, value3).then((input3) => (value8({
          type: "fetch",
          to: context.version,
          path: input2,
          attempt: index22,
          ok: !0,
          msAfterAdopt: callback() - value14
        }), input3));
      }, value15;
      try {
        value15 = input === null ? await callback5("_files.json", () => value10(filesPort)) : input.map((input2) => ({
          path: input2.path,
          sha256: hotChangedPath(input2)
        }));
      } catch (value22) {
        return callback3("fetch-exhausted", value22);
      }
      if (input === null && value15.some((input2) => value2(input2.path)))
        if (options.contentWhileBusy !== !1 && (restartHeld() || editsUnsent()) && value15.some((input2) => !value2(input2.path)))
          value8({
            type: "restart",
            from: options2.version,
            to: context.version,
            reason: "code-after-adopt",
            asked: !0
          }), value9("code-after-adopt"), value15 = value15.filter((input2) => !value2(input2.path));
        else
          return callback3("code-after-adopt");
      if (value7 !== void 0 && input !== null)
        for (let value22 of value15)
          value22.sha256 === null ? value7.delete(value22.path) : value7.set(value22.path, value22.sha256);
      value15 = value15.filter((input2) => value.olderThanMyWrite?.(context.version, input2.path) !== !0);
      let value16 = extra ? value15.slice() : value15.filter((input2) => {
        let value22 = value.heldSha?.(input2.path);
        if (value22 === void 0 || value22 !== input2.sha256)
          return !0;
        let value23 = value.liveSha?.(input2.path);
        return value23 !== void 0 && value23 !== input2.sha256;
      });
      try {
        value.noteIncoming?.(value15);
      } catch {
      }
      let callback6 = (input2) => {
        try {
          return value.answersByReference?.(input2) === !0;
        } catch {
          return !1;
        }
      }, value17 = value16.filter((input2) => input2.sha256 !== null), value18 = value17.filter((input2) => !callback6(input2.path)), entries = /* @__PURE__ */ new Map(), value19, value20;
      if (value18.length === 0 && value17.length > 0 && input !== null)
        try {
          await callback5("_files.json", () => (0, runtime2.listWritableFiles)(filesPort)), value19 = callback() - value14;
        } catch (value22) {
          return callback3("fetch-exhausted", value22);
        }
      let value21 = await Promise.all(value18.map((input2) => callback5(input2.path, () => filesPort.readBytes(input2.path)).then((input3) => {
        value19 ??= callback() - value14;
        let state2 = {
          ...input3,
          sha256: input2.sha256 ?? input3.sha256
        };
        entries.set(input2.path, state2);
        try {
          value.primeRead?.(input2.path, state2);
        } catch {
        }
        return !0;
      }, (input3) => (value20 = input3, !1))));
      if (value19 !== void 0 && (counters2.lastGrantLagMs = value19, counters2.maxGrantLagMs = Math.max(counters2.maxGrantLagMs ?? 0, value19)), value21.includes(!1))
        return callback3("fetch-exhausted", value20);
      let state = {
        from: options2,
        to: context,
        changed: value16
      };
      try {
        value16.length > 0 && await options.applyRemote?.(state, entries);
      } catch (value22) {
        return callback3("apply-failed", value22);
      }
      try {
        value.noteRemote?.(state);
      } catch {
      }
      return counters2.applied += 1, value8({
        type: "applied",
        from: options2.version,
        to: context.version,
        rows: value15.length,
        applied: value16.length,
        fetched: entries.size,
        ...value17.length > value18.length ? {
          skipped: value17.length - value18.length
        } : {},
        retries: index4,
        ...value19 !== void 0 ? {
          grantLagMs: value19
        } : {},
        ms: callback() - value14,
        paths: value16.map((input2) => input2.path),
        ...extra ? {
          early: !0
        } : {}
      }), "applied";
    }
    let value13 = options.early ?? (0, runtime2.currentHotReloadBridge)(hot), snapshotUnlessDisposed = (input) => flag ? null : options.snapshot(input);
    options.snapshot !== void 0 && typeof hot.snapshot == "function" && hot.snapshot(snapshotUnlessDisposed);
    let stopLeaveWatch = (0, runtime2.onHotPageLeaving)(() => {
      backOffAfterRestart(), leaving = !0;
    }, hot);
    if (value13?.attach === void 0 && (options.restore !== void 0 || options.reveal !== void 0) && typeof hot.ready == "function" && hot.ready((input) => {
      if (!flag) {
        try {
          options.restore?.(input);
        } catch {
        }
        if (options.reveal !== void 0)
          return waitForHotUpdateIdle(options.reveal, {
            holdMs: options.revealHoldMs,
            timers: value4,
            carried: input != null,
            onEvent: value8
          });
      }
    }), hot.accept(value11), value13 !== void 0) {
      value13.attach?.({
        ...options.snapshot !== void 0 ? {
          snapshot: snapshotUnlessDisposed
        } : {},
        ...options.restore !== void 0 ? {
          restore: (input) => {
            flag || options.restore(input);
          }
        } : {},
        ...options.reveal !== void 0 ? {
          reveal: options.reveal
        } : {},
        onEvent: value8,
        onBeforeRestart: callback2
      }), value13.release();
      let value14 = value13.takeOwed?.();
      value14 !== void 0 && (value8({
        type: "restart",
        from: value14.from.version,
        to: value14.to.version,
        reason: "deferred-update",
        asked: !0
      }), value9("deferred-update", options.busyPollMs ?? 250));
      let value15 = value13.queued.splice(0);
      if (noFiles && value15.length > 0)
        value9("deferred-update", options.busyPollMs ?? 250);
      else if (value15.length > 0) {
        let value16 = value15.some((input) => input.changed === null), entries = /* @__PURE__ */ new Map();
        if (!value16)
          for (let value19 of value15)
            for (let value20 of value19.changed)
              entries.set(value20.path, value20);
        let value17 = value15[0], value18 = value15[value15.length - 1];
        counters2.updates += value15.length;
        try {
          value.noteAdopted?.(value18.to, value17.from);
        } catch {
        }
        value12(value16 ? null : [...entries.values()], value17.from, value18.to, value17.at, !0).catch((input) => {
          value8({
            type: "restart",
            from: value17.from.version,
            to: value18.to.version,
            reason: "apply-failed",
            asked: !0,
            error: shortHotErrorMessage(input)
          }), value9("apply-failed");
        });
      }
    }
    return {
      get active() {
        return !flag;
      },
      stats: () => ({
        ...counters2
      }),
      events: cleanups,
      dispose() {
        flag = !0, stopLeaveWatch(), value5 !== void 0 && (value4.clearTimeout(value5), value5 = void 0);
      }
    };
  }
  return bindRuntimeValue(runtime2, "BOOT_FILE_READ_RETRY_DELAYS_MS", () => BOOT_FILE_READ_RETRY_DELAYS_MS, (value) => {
    BOOT_FILE_READ_RETRY_DELAYS_MS = value;
  }), bindRuntimeValue(runtime2, "HOT_RESTART_BACKOFF_MS", () => HOT_RESTART_BACKOFF_MS, (value) => {
    HOT_RESTART_BACKOFF_MS = value;
  }), bindRuntimeValue(runtime2, "HOT_RESTART_BACKOFF_MAX_MS", () => HOT_RESTART_BACKOFF_MAX_MS, (value) => {
    HOT_RESTART_BACKOFF_MAX_MS = value;
  }), bindRuntimeValue(runtime2, "HOT_UNSENT_WAIT_MS", () => HOT_UNSENT_WAIT_MS, (value) => {
    HOT_UNSENT_WAIT_MS = value;
  }), bindRuntimeValue(runtime2, "MAX_HOT_FETCH_RETRIES", () => MAX_HOT_FETCH_RETRIES, (value) => {
    MAX_HOT_FETCH_RETRIES = value;
  }), bindRuntimeValue(runtime2, "getHotCapability", () => getHotCapability), bindRuntimeValue(runtime2, "HOT_UPDATE_MAX_DEFER_MS", () => HOT_UPDATE_MAX_DEFER_MS, (value) => {
    HOT_UPDATE_MAX_DEFER_MS = value;
  }), bindRuntimeValue(runtime2, "HOT_RESTART_GRACE_MS", () => HOT_RESTART_GRACE_MS, (value) => {
    HOT_RESTART_GRACE_MS = value;
  }), bindRuntimeValue(runtime2, "HOT_UPDATE_SETTLE_MS", () => HOT_UPDATE_SETTLE_MS, (value) => {
    HOT_UPDATE_SETTLE_MS = value;
  }), bindRuntimeValue(runtime2, "hotChangedPath", () => hotChangedPath, (value) => {
    hotChangedPath = value;
  }), bindRuntimeValue(runtime2, "shortHotErrorMessage", () => shortHotErrorMessage, (value) => {
    shortHotErrorMessage = value;
  }), bindRuntimeValue(runtime2, "hotListingDescriptor", () => hotListingDescriptor, (value) => {
    hotListingDescriptor = value;
  }), bindRuntimeValue(runtime2, "describeHotChangedPaths", () => describeHotChangedPaths, (value) => {
    describeHotChangedPaths = value;
  }), bindRuntimeValue(runtime2, "hotAdoptMethodKind", () => hotAdoptMethodKind, (value) => {
    hotAdoptMethodKind = value;
  }), bindRuntimeValue(runtime2, "HOT_INDEX_RECHECK_DELAY_MS", () => HOT_INDEX_RECHECK_DELAY_MS, (value) => {
    HOT_INDEX_RECHECK_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "waitForHotUpdateIdle", () => waitForHotUpdateIdle), bindRuntimeValue(runtime2, "createFilesHotUpdateController", () => createFilesHotUpdateController), () => {
    BOOT_FILE_READ_RETRY_DELAYS_MS = [
      150,
      300,
      600,
      1e3,
      2e3,
      2e3,
      2e3,
      2e3,
      2e3,
      2e3,
      2e3,
      2e3
    ], MAX_HOT_FETCH_RETRIES = 4, HOT_UPDATE_MAX_DEFER_MS = 6e4, HOT_RESTART_GRACE_MS = 1, HOT_UPDATE_SETTLE_MS = 50, HOT_RESTART_BACKOFF_MS = 36e4, HOT_RESTART_BACKOFF_MAX_MS = 36e5, HOT_UNSENT_WAIT_MS = 15e3, hotChangedPath = (source) => source.kind === "removed" ? null : typeof source.to == "string" ? source.to : null, shortHotErrorMessage = (input) => (input instanceof Error ? input.message : String(input?.message ?? input)).slice(0, 120), hotListingDescriptor = (input) => ({
      version: input.ver,
      ...input.seq !== void 0 ? {
        seq: input.seq
      } : {}
    }), describeHotChangedPaths = (input, options) => input === null ? null : input.map((source) => ({
      path: source.path,
      kind: String(source.kind),
      klass: options(source.path) ? "code" : "content"
    })), hotAdoptMethodKind = (input) => typeof input.adopt == "function" ? "calls" : "string", HOT_INDEX_RECHECK_DELAY_MS = 4500;
  };
}
export {
  installFilesHotUpdates
};
