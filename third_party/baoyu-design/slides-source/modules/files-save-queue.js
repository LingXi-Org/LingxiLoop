// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSaveQueue(runtime2) {
  var FILE_SAVE_DEBOUNCE_POLICY, FILE_SAVE_RETRY_MIN_MS, FILE_SAVE_RETRY_MAX_MS, FILE_SAVE_BACKPRESSURE_DELAY_MS, FILE_SAVE_STUCK_TIMEOUT_MS, FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS, FILE_SAVE_QUICK_RETRY_MS, FILE_SAVE_LONG_REQUEST_MS, FILE_SAVE_CONFLICT_RETRY_MS, FILE_SAVE_MAX_TRANSIENT_RETRIES, FILE_SAVE_TOTAL_RETRY_WINDOW_MS, FILE_SAVE_RECENT_PEER_WINDOW_MS, FILE_SAVE_MAX_CONFLICT_PATHS, FILE_SAVE_RECENT_ACTIVITY_WINDOW_MS, FILE_SAVE_MAX_CONFLICT_RETRIES, FILE_SAVE_MAX_BATCH_CONFLICTS, FILE_SAVE_RETRY_JITTER_MS, FILE_SAVE_CONFLICT_BACKOFF_MS, FILE_SAVE_READ_RETRY_DELAYS_MS, FILE_SAVE_TERMINAL_ERROR_CODES, isIndexFileSaveError;
  function defaultFilesSaveTimers() {
    return {
      setTimeout: (input, options) => setTimeout(input, options),
      clearTimeout: (input) => clearTimeout(input),
      now: () => Date.now(),
      random: () => Math.random()
    };
  }
  function createFilesSaveQueue(options) {
    let { port } = options, normalizedPort = (0, runtime2.normalizeFilesPort)(port), timers = options.timers ?? defaultFilesSaveTimers(), indexStore = options.index, indexPath = indexStore?.path, isIndexPath = (input) => indexPath !== void 0 ? input === indexPath : (0, runtime2.isProjectIndexFilePath)(input), dirtyEntries = /* @__PURE__ */ new Map(), conflictedEntries = /* @__PURE__ */ new Map(), recentConflictTimes = /* @__PURE__ */ new Map(), conflictSurfacedAt = /* @__PURE__ */ new Map(), conflictBudgetExceeded = /* @__PURE__ */ new Set(), withdrawnPaths = /* @__PURE__ */ new Set(), remoteShas = /* @__PURE__ */ new Map(), unsendableReasons = /* @__PURE__ */ new Map(), unsendableEntries = /* @__PURE__ */ new Map(), unsendableStashed = !1, ownPublishedShas = /* @__PURE__ */ new Map(), awaitingComputedShas = /* @__PURE__ */ new Set(), lastRemoteVersion, isPublishVersionCurrent = () => lastRemoteVersion === port.version().version || port.version().version === lastPublishVersion, lastPublishVersion, ownPublishedVersions = /* @__PURE__ */ new Set(), counters2 = {
      publishes: 0,
      pathsSent: 0,
      conflicts: 0,
      retries: 0,
      rateLimited: 0,
      bytesSent: 0,
      lastPublishMs: 0,
      surfaced: 0
    }, dirtyGeneration = 0, inFlight = !1, commitRequested = !1, disposed = !1, lastError, backoffUntil, rateLimitBackoff = FILE_SAVE_BACKPRESSURE_DELAY_MS, commitTimer, lastPublishStartedAt = -1 / 0, settleWaiters = [], conflictRetryUsed = !1, retryOnRemoteChange = !1, remoteChangeGeneration = 0, retryWindow, retryBudgetMs = options.retryBudgetMs ?? FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS, refusalHistory, stuckState, retryTimer, stuckRetryBackoff = options.stuckRetryMs ?? FILE_SAVE_CONFLICT_RETRY_MS, hasStashedEntries = !1, clearOfferedStashOnSave = !1, rateLimitUntil = 0, serverRateLimit = !1, firstDirtyAt, maxWaitTimer, ignorePacingOnce = !1, indexNeedsMerge = !1, lastStuckRetryAt = -1 / 0, wakeRetryWait, retryWaitProtected = !1, random = () => timers.random?.() ?? Math.random(), jitterDelay = (input) => Math.round(input / 2 + random() * (input / 2)), currentRetryBudget = () => options.retryBudgetMs ?? FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS;
    function waitForRetryOrWake(input, options2 = !1) {
      return new Promise((input2) => {
        let value = timers.setTimeout(() => {
          wakeRetryWait = void 0, input2(!1);
        }, input);
        retryWaitProtected = options2, wakeRetryWait = () => {
          timers.clearTimeout(value), wakeRetryWait = void 0, input2(!0);
        };
      });
    }
    let liveSha = (input) => remoteShas.has(input) ? remoteShas.get(input) : normalizedPort.liveSha?.(input), getQueueState = () => ({
      dirty: dirtyEntries.size,
      inFlight,
      ...lastError !== void 0 ? {
        lastError
      } : {},
      ...backoffUntil !== void 0 ? {
        backoffUntil
      } : {},
      ...stuckState !== void 0 ? {
        stuck: {
          ...stuckState,
          paths: [...stuckState.paths]
        }
      } : {},
      ...unsendableEntries.size > 0 ? {
        unsendable: [...unsendableEntries].map(([input, input2]) => ({
          path: input,
          why: input2.why,
          cause: input2.cause
        })),
        ...unsendableStashed ? {
          unsendableStashed: !0
        } : {}
      } : {}
    }), notifyState = () => {
      try {
        options.onState?.(getQueueState());
      } catch {
      }
      if (!inFlight && commitTimer === void 0 && (dirtyEntries.size === 0 || hasTerminalError())) {
        let value = settleWaiters;
        settleWaiters = [];
        for (let value2 of value)
          value2();
      }
    }, hasTerminalError = () => lastError !== void 0 && backoffUntil === void 0 && !commitRequested, isOwnPublishEcho = (input) => ownPublishedShas.has(input.path) && ownPublishedShas.get(input.path) === input.sha256, lastSharedActivityAt = -1 / 0, peerStore = options.peers ?? runtime2.roomPeerStore, hasOtherPeers = () => peerStore.getSnapshot().some((input) => !input.sameTab), hasRecentSharedActivity = () => timers.now() - lastSharedActivityAt < FILE_SAVE_DEBOUNCE_POLICY.recentMs, isSoloPacing = () => options.paced === !0 && !hasOtherPeers() && !hasRecentSharedActivity(), getPacingPolicy = () => options.paced !== !0 ? void 0 : isSoloPacing() ? FILE_SAVE_DEBOUNCE_POLICY.solo : FILE_SAVE_DEBOUNCE_POLICY.shared;
    function switchToSharedPacing() {
      if (!disposed) {
        scheduleMaxWaitCommit(), commitTimer !== void 0 && (timers.clearTimeout(commitTimer), commitTimer = void 0), tryStartCommit();
        try {
          options.onShared?.();
        } catch {
        }
      }
    }
    function recordSharedActivity() {
      let value = isSoloPacing();
      lastSharedActivityAt = timers.now(), value && switchToSharedPacing();
    }
    let hadOtherPeers = options.paced === !0 && hasOtherPeers(), unsubscribePeers = options.paced !== !0 ? void 0 : peerStore.subscribe(() => {
      let value = hasOtherPeers(), value2 = value && !hadOtherPeers;
      hadOtherPeers = value, value2 && !hasRecentSharedActivity() && switchToSharedPacing();
    });
    function scheduleMaxWaitCommit() {
      maxWaitTimer !== void 0 && (timers.clearTimeout(maxWaitTimer), maxWaitTimer = void 0);
      let value = getPacingPolicy();
      value === void 0 || firstDirtyAt === void 0 || disposed || (maxWaitTimer = timers.setTimeout(() => {
        if (maxWaitTimer = void 0, dirtyEntries.size === 0) {
          firstDirtyAt = void 0;
          return;
        }
        stuckState === void 0 && (commitRequested = !0, tryStartCommit());
      }, Math.max(0, firstDirtyAt + value.maxWaitMs - timers.now())));
    }
    let unsubscribeRemoteChange = port.onRemoteChange((input) => handleRemoteChange(input));
    function handleRemoteChange(input) {
      remoteChangeGeneration += 1;
      let callback = (input2) => isOwnPublishEcho(input2) || awaitingComputedShas.has(input2.path) && input2.sha256 !== null && ownPublishedVersions.has(input.to.version), value = input.changed.some((input2) => !callback(input2));
      for (let value4 of input.changed)
        remoteShas.set(value4.path, value4.sha256), awaitingComputedShas.delete(value4.path), ownPublishedShas.has(value4.path) && ownPublishedShas.get(value4.path) !== value4.sha256 && ownPublishedShas.delete(value4.path);
      lastRemoteVersion = input.to.version, value && recordSharedActivity();
      let value2 = isIndexFileSaveError(stuckState?.code) && indexPath !== void 0 && input.changed.some((input2) => input2.path === indexPath), value3 = value2 && !retryOnRemoteChange ? runtime2.FILES_BOOT_PERMANENT_RETRY_MS - (timers.now() - lastStuckRetryAt) : 0;
      if (value3 > 0) {
        retryTimer === void 0 && !disposed && (retryTimer = timers.setTimeout(() => {
          retryTimer = void 0, restartRetryWindow(currentRetryBudget());
        }, value3));
        return;
      }
      (retryOnRemoteChange || value2) && !inFlight && !disposed && restartRetryWindow(currentRetryBudget());
    }
    indexStore?.bind?.((input, options2, context) => markDirty(input, options2, context));
    function recordConflictAttempt(input) {
      let value = timers.now();
      recentConflictTimes.set(input, [
        ...(recentConflictTimes.get(input) ?? []).filter((input2) => value - input2 < FILE_SAVE_TOTAL_RETRY_WINDOW_MS),
        value
      ]);
    }
    function markDirty(input, options2, context) {
      if (disposed)
        return;
      let entry = dirtyEntries.get(input);
      dirtyGeneration += 1;
      let value = ownPublishedShas.has(input) && (liveSha(input) === void 0 || liveSha(input) === ownPublishedShas.get(input)), value2 = context !== void 0 ? context : entry !== void 0 ? entry.base : value ? ownPublishedShas.get(input) : normalizedPort.heldSha?.(input) ?? liveSha(input) ?? null;
      if (unsendableReasons.delete(input), unsendableEntries.delete(input), dirtyEntries.set(input, {
        value: options2,
        base: value2,
        gen: dirtyGeneration
      }), firstDirtyAt === void 0 && (firstDirtyAt = timers.now(), scheduleMaxWaitCommit()), withdrawnPaths.delete(input), context !== void 0) {
        let entry2 = conflictSurfacedAt.get(input);
        entry2 !== void 0 && timers.now() - entry2 < FILE_SAVE_TOTAL_RETRY_WINDOW_MS && recordConflictAttempt(input), conflictSurfacedAt.delete(input), conflictedEntries.delete(input);
      }
      stuckState !== void 0 && (stuckState = {
        ...stuckState,
        paths: [...dirtyEntries.keys()]
      }), stashWritePaused = !1, scheduleStashWrite(), notifyState();
    }
    function commit() {
      if (!(disposed && dirtyEntries.size === 0) && dirtyEntries.size !== 0) {
        if (stuckState !== void 0) {
          inFlight ? commitRequested = !0 : restartRetryWindow(currentRetryBudget());
          return;
        }
        commitRequested = !0, tryStartCommit();
      }
    }
    function restartRetryWindow(input, options2 = !1) {
      if (disposed || inFlight)
        return;
      let value = rateLimitUntil - timers.now();
      if (value > 0 && (serverRateLimit || !options2)) {
        retryTimer === void 0 && (retryTimer = timers.setTimeout(() => {
          retryTimer = void 0, restartRetryWindow(input);
        }, value));
        return;
      }
      if (retryTimer !== void 0 && (timers.clearTimeout(retryTimer), retryTimer = void 0), ignorePacingOnce = !0, commitTimer !== void 0 && (timers.clearTimeout(commitTimer), commitTimer = void 0), retryWindow = void 0, retryBudgetMs = input, retryOnRemoteChange = !1, lastError = void 0, dirtyEntries.size === 0) {
        notifyState();
        return;
      }
      commitRequested = !0, tryStartCommit();
    }
    function tryStartCommit() {
      if (inFlight || !commitRequested)
        return;
      if (commitTimer !== void 0) {
        scheduleStashWrite(0);
        return;
      }
      if (dirtyEntries.size === 0) {
        commitRequested = !1, notifyState();
        return;
      }
      let value = Math.max(options.minGapMs ?? 0, ignorePacingOnce ? 0 : getPacingPolicy()?.gapMs ?? 0) - (timers.now() - lastPublishStartedAt);
      if (value > 0) {
        commitTimer = timers.setTimeout(() => {
          commitTimer = void 0, tryStartCommit();
        }, value), scheduleStashWrite(0);
        return;
      }
      commitRequested = !1, ignorePacingOnce = !1, publishDirtyEntries();
    }
    function detectChangedFileBases() {
      conflictBudgetExceeded.clear();
      for (let [value, value2] of [...dirtyEntries]) {
        if (isIndexPath(value))
          continue;
        let value3 = liveSha(value);
        if (value3 === void 0 || value3 === value2.base)
          continue;
        if (ownPublishedShas.has(value) && ownPublishedShas.get(value) === value3) {
          value2.base = value3;
          continue;
        }
        if (awaitingComputedShas.has(value) && typeof value3 == "string" && isPublishVersionCurrent()) {
          awaitingComputedShas.delete(value), ownPublishedShas.set(value, value3), value2.base = value3;
          continue;
        }
        let value4 = timers.now();
        if ((recentConflictTimes.get(value) ?? []).filter((input) => value4 - input < FILE_SAVE_TOTAL_RETRY_WINDOW_MS).length >= FILE_SAVE_MAX_TRANSIENT_RETRIES) {
          conflictBudgetExceeded.add(value);
          continue;
        }
        let value5, flag = !1;
        try {
          value5 = value2.value();
        } catch {
          value5 = null, flag = !0;
        }
        let state = {
          path: value,
          base: value2.base,
          mine: value5,
          theirsSha: value3,
          ...flag ? {
            unreadable: !0
          } : {}
        };
        dirtyEntries.delete(value), conflictedEntries.set(value, state), conflictSurfacedAt.set(value, value4), counters2.surfaced += 1, options.stash !== void 0 && (hasStashedEntries = !0, stashWritePaused = !1);
        try {
          options.onConflict(state);
        } catch {
        }
      }
    }
    function beginRetryAttempt() {
      let value = timers.now();
      return retryWindow ??= {
        since: value,
        refusals: 0,
        budgetMs: retryBudgetMs
      }, retryWindow.refusals += 1, refusalHistory ??= {
        since: value,
        attempts: 0
      }, refusalHistory.attempts += 1, retryWindow;
    }
    async function publishDirtyEntries() {
      inFlight = !0, lastPublishStartedAt = timers.now();
      let value = remoteChangeGeneration;
      if (detectChangedFileBases(), indexStore && indexPath !== void 0 && dirtyEntries.has(indexPath)) {
        let value4 = liveSha(indexPath), value5 = value4 != null && value4 !== indexStore.baseSha() && ownPublishedShas.get(indexPath) !== value4 || indexNeedsMerge ? await mergeRemoteIndex() : "merged";
        if (value5 !== "merged" && value5 !== "unread")
          return beginRetryAttempt(), markStuck(value5, !1, void 0, indexPath);
        if (value5 === "unread")
          return lastError = "conflict", beginRetryAttempt(), notifyState(), retryFailure("conflict", !0);
      }
      let state = {}, entries = /* @__PURE__ */ new Map(), state2 = {};
      for (let [value4, value5] of [...dirtyEntries]) {
        if (conflictBudgetExceeded.has(value4))
          continue;
        let value6;
        try {
          value6 = value5.value();
        } catch {
          continue;
        }
        let value7;
        try {
          if (normalizedPort.entryProblemDetail !== void 0)
            value7 = normalizedPort.entryProblemDetail(value4, value6);
          else if (normalizedPort.entryProblem !== void 0) {
            let value8 = normalizedPort.entryProblem(value4, value6);
            value7 = value8 === void 0 ? void 0 : {
              why: value8,
              cause: "other"
            };
          } else
            value7 = (0, runtime2.filePublishRejection)(value4, value6);
        } catch {
          value7 = (0, runtime2.filePublishRejection)(value4, value6);
        }
        if (value7 === void 0) {
          let value8 = (0, runtime2.filePublishSizeRejection)(value6);
          value8 !== void 0 && (value7 = {
            why: value8,
            cause: "size"
          });
        }
        if (value7 !== void 0 && value6 === null) {
          dirtyEntries.delete(value4), unsendableReasons.delete(value4), unsendableEntries.delete(value4);
          continue;
        }
        if (value7 !== void 0) {
          dirtyEntries.delete(value4), unsendableReasons.set(value4, value7.why), unsendableEntries.set(value4, {
            value: value5.value,
            base: value5.base,
            why: value7.why,
            cause: value7.cause
          }), unsendableStashed = !1, options.stash !== void 0 && (hasStashedEntries = !0, stashWritePaused = !1);
          try {
            options.onUnsendable?.(value4, value7.why);
          } catch {
          }
          continue;
        }
        state[value4] = value6, entries.set(value4, value5.gen), state2[value4] = value5.base;
      }
      if (entries.size === 0) {
        if (dirtyEntries.size === 0) {
          finishPublish();
          return;
        }
        return [...dirtyEntries.keys()].every((input) => conflictBudgetExceeded.has(input)) ? markStuck("conflict", !1, FILE_SAVE_RECENT_PEER_WINDOW_MS) : (beginRetryAttempt(), markStuck("invalid_content", !1));
      }
      notifyState();
      let value2 = (0, runtime2.splitFilePublishBatches)(state, isIndexPath), value3;
      for (let value4 of value2) {
        let value5 = timers.now(), value6, value7 = Object.fromEntries(Object.keys(value4).filter((input) => !(awaitingComputedShas.has(input) && state2[input] === ownPublishedShas.get(input))).map((input) => [input, state2[input] ?? null])), version2 = port.version().version;
        try {
          value6 = await port.publish(value4, {
            ifMatch: value7
          });
        } catch {
          value6 = {
            ok: !1,
            code: "upstream_error"
          };
        }
        if (value6.ok && value6.unchanged !== !0 && value6.version === version2 && (value6 = {
          ...value6,
          unchanged: !0
        }), !value6.ok) {
          value3 = value6;
          break;
        }
        if (value6.changed)
          for (let value10 of value6.changed)
            value10.path in value4 || (remoteShas.set(value10.path, value10.sha256), awaitingComputedShas.delete(value10.path));
        let value8 = value6.preconditionsChecked === !0 && Object.keys(value4).every((input) => Object.hasOwn(value7, input));
        value6.unchanged === !0 || value8 && value6.changed === void 0 || (lastPublishVersion = value6.version, ownPublishedVersions.add(value6.version), ownPublishedVersions.size > FILE_SAVE_MAX_BATCH_CONFLICTS && ownPublishedVersions.delete(ownPublishedVersions.values().next().value)), counters2.publishes += 1, counters2.pathsSent += Object.keys(value4).length, counters2.lastPublishMs = timers.now() - value5;
        let value9 = value6.shas ?? await (0, runtime2.hashFilePublishEntries)(value4);
        for (let [value10, value11] of Object.entries(value4)) {
          let value12 = value11 === null ? null : value9[value10] ?? null;
          counters2.bytesSent += (0, runtime2.filePublishRawBytes)(value11), ownPublishedShas.set(value10, value12), remoteShas.set(value10, value12), !(value6.shas?.[value10] !== void 0 && value6.computed?.includes(value10) !== !0) && value12 !== null && (0, runtime2.fileContentContainsRuntimeMarkers)(value11) ? awaitingComputedShas.add(value10) : awaitingComputedShas.delete(value10), value12 !== null && value6.unchanged !== !0 && options.tokens?.advance?.(value10, value12);
          let entry = dirtyEntries.get(value10);
          entry !== void 0 && entry.gen === entries.get(value10) ? (dirtyEntries.delete(value10), conflictSurfacedAt.delete(value10)) : entry !== void 0 && (entry.base = value12), indexStore && value10 === indexPath && value12 !== null && indexStore.markSaved((0, runtime2.fileInputDebugText)(value11), value12);
        }
      }
      if (value3 === void 0) {
        let value4 = [...conflictBudgetExceeded].some((input) => dirtyEntries.has(input));
        finishPublish(!value4, !value4);
        let value5 = [...dirtyEntries.keys()].some((input) => !conflictBudgetExceeded.has(input));
        value4 && markStuck("conflict", !1, value5 ? 0 : FILE_SAVE_RECENT_PEER_WINDOW_MS, void 0, value5 ? currentRetryBudget() : 0);
        return;
      }
      await handlePublishFailure(value3, value);
    }
    function finishPublish(input = !0, options2 = !0) {
      conflictRetryUsed = !1, retryOnRemoteChange = !1, lastError = void 0, backoffUntil = void 0, rateLimitBackoff = FILE_SAVE_BACKPRESSURE_DELAY_MS, retryWindow = void 0, refusalHistory = void 0, retryBudgetMs = currentRetryBudget(), stuckState = void 0, stuckRetryBackoff = options.stuckRetryMs ?? FILE_SAVE_CONFLICT_RETRY_MS, rateLimitUntil = 0, serverRateLimit = !1, retryTimer !== void 0 && (timers.clearTimeout(retryTimer), retryTimer = void 0), clearSavedStash(), firstDirtyAt = dirtyEntries.size === 0 ? void 0 : timers.now(), scheduleMaxWaitCommit(), inFlight = !1, options2 && notifyState(), input && tryStartCommit();
    }
    async function handlePublishFailure(input, options2) {
      if (lastError = input.code, input.code === "conflict") {
        if (counters2.conflicts += 1, input.changed)
          for (let value2 of input.changed)
            remoteShas.set(value2.path, value2.sha256), awaitingComputedShas.delete(value2.path);
        if (input.paths)
          for (let value2 of input.paths)
            remoteShas.set(value2.path, value2.liveSha), awaitingComputedShas.delete(value2.path);
        let value = beginRetryAttempt();
        for (indexStore && indexPath !== void 0 && dirtyEntries.has(indexPath) && (indexNeedsMerge = !0), notifyState(); ; ) {
          let value2 = remoteChangeGeneration !== options2 || input.live !== void 0 && port.version().version === input.live ? !0 : await waitForRemoteVersion();
          for (let index4 = 0; value2 && awaitingComputedShas.size > 0 && !isPublishVersionCurrent() && index4 < FILE_SAVE_MAX_CONFLICT_RETRIES && !disposed; index4++)
            await waitForRemoteVersion();
          let value3 = await refreshLiveFileShas();
          if (disposed) {
            inFlight = !1, notifyState();
            return;
          }
          if (value2 && !value3 && remoteChangeGeneration === options2) {
            if (timers.now() - value.since >= value.budgetMs)
              return markStuck("conflict", !1);
            let value4 = Math.min(jitterDelay(FILE_SAVE_QUICK_RETRY_MS * 2), Math.max(1, value.budgetMs - (timers.now() - value.since)));
            backoffUntil = timers.now() + value4, notifyState(), await waitForRetryOrWake(value4), backoffUntil = void 0;
            continue;
          }
          if (detectChangedFileBases(), indexStore && indexPath !== void 0 && dirtyEntries.has(indexPath)) {
            let value4 = await mergeRemoteIndex();
            if (value4 !== "merged" && value4 !== "unread")
              return markStuck(value4, !1, void 0, indexPath);
          }
          if (dirtyEntries.size === 0) {
            finishPublish();
            return;
          }
          if (!value2) {
            if (conflictRetryUsed)
              return markStuck("conflict", !0);
            conflictRetryUsed = !0;
          }
          return retryFailure("conflict", value2);
        }
      }
      if (input.code === "rate_limited") {
        counters2.rateLimited += 1;
        let value = beginRetryAttempt(), value2 = input.retryAfterMs !== void 0 && Number.isFinite(input.retryAfterMs) && input.retryAfterMs >= 0 ? Math.min(Math.max(input.retryAfterMs, FILE_SAVE_RETRY_JITTER_MS), FILE_SAVE_RECENT_ACTIVITY_WINDOW_MS) : void 0, value3 = value2 ?? rateLimitBackoff;
        rateLimitBackoff = Math.min(FILE_SAVE_STUCK_TIMEOUT_MS, rateLimitBackoff * 2), rateLimitUntil = timers.now() + value3, serverRateLimit = value2 !== void 0, backoffUntil = rateLimitUntil, notifyState();
        let value4 = value.budgetMs - (timers.now() - value.since), value5 = await waitForRetryOrWake(Math.max(0, Math.min(value3, value4)), serverRateLimit);
        if (disposed) {
          inFlight = !1, notifyState();
          return;
        }
        return !value5 && (timers.now() < rateLimitUntil || timers.now() - value.since >= value.budgetMs) ? markStuck("rate_limited", !1, Math.max(rateLimitUntil - timers.now(), FILE_SAVE_RETRY_JITTER_MS)) : (rateLimitUntil = 0, backoffUntil = void 0, counters2.retries += 1, lastError = void 0, publishDirtyEntries());
      }
      if (input.code === "upstream_error")
        return beginRetryAttempt(), notifyState(), retryFailure("upstream_error", !0);
      beginRetryAttempt(), markStuck(input.code, !1);
    }
    async function retryFailure(input, options2) {
      let value = retryWindow, value2 = timers.now() - value.since;
      if (value2 >= value.budgetMs)
        return markStuck(input, !options2);
      let refusals = value.refusals, value3;
      if (refusals <= 1 ? value3 = input === "upstream_error" ? FILE_SAVE_CONFLICT_BACKOFF_MS[0] + Math.floor(random() * (FILE_SAVE_CONFLICT_BACKOFF_MS[1] - FILE_SAVE_CONFLICT_BACKOFF_MS[0])) : 0 : value3 = jitterDelay(Math.min(FILE_SAVE_LONG_REQUEST_MS, FILE_SAVE_QUICK_RETRY_MS * 2 ** (refusals - 2))), value3 = Math.min(value3, value.budgetMs - value2), counters2.retries += 1, value3 > 0 && (backoffUntil = timers.now() + value3, notifyState(), await waitForRetryOrWake(value3), backoffUntil = void 0), disposed) {
        inFlight = !1, notifyState();
        return;
      }
      return lastError = void 0, publishDirtyEntries();
    }
    function markStuck(input, options2, context, value, extra = 0) {
      let value2 = timers.now();
      lastError = input;
      let value3 = input === "conflict" && (refusalHistory?.attempts ?? 0) >= FILE_SAVE_MAX_CONFLICT_PATHS;
      retryOnRemoteChange = options2 || value3, backoffUntil = void 0, commitRequested = !1, inFlight = !1, retryWindow = void 0;
      let value4 = !FILE_SAVE_TERMINAL_ERROR_CODES.has(input), value5, value6 = options.stuckRetryMs ?? FILE_SAVE_CONFLICT_RETRY_MS;
      if (value4 && !options2 && !value3 && (value6 > 0 || context !== void 0)) {
        let value7 = context ?? jitterDelay(stuckRetryBackoff);
        context === void 0 && (stuckRetryBackoff = Math.min(FILE_SAVE_STUCK_TIMEOUT_MS, stuckRetryBackoff * 2)), value5 = value2 + value7, retryTimer !== void 0 && timers.clearTimeout(retryTimer), retryTimer = timers.setTimeout(() => {
          retryTimer = void 0, restartRetryWindow(extra);
        }, value7);
      }
      stuckState = {
        code: input,
        since: refusalHistory?.since ?? value2,
        attempts: refusalHistory?.attempts ?? 1,
        paths: [...dirtyEntries.keys()],
        retryable: value4,
        stashed: stuckState?.stashed ?? !1,
        ...value5 !== void 0 ? {
          nextRetryAt: value5
        } : {},
        ...value !== void 0 ? {
          file: value
        } : {}
      }, stashWritePaused = !1, writePendingStash(), notifyState();
    }
    let stashGeneration = 0, stashWriteChain = Promise.resolve();
    function serializeStashWrite(input) {
      let value = stashWriteChain.then(input);
      return stashWriteChain = value.catch(() => {
      }), value;
    }
    let stashWriteInFlight = !1, stashWriteOwed = !1;
    function writePendingStash() {
      if (options.stash === void 0 || stashWritePaused)
        return;
      if (stashWriteInFlight) {
        stashWriteOwed = !0;
        return;
      }
      let items = [], flag = !0, value = [
        ...dirtyEntries
      ].map(([input, input2]) => [
        input,
        input2.value,
        input2.base
      ]);
      for (let [value3, value4] of conflictedEntries)
        if (!dirtyEntries.has(value3)) {
          if (value4.unreadable === !0) {
            flag = !1;
            continue;
          }
          value.push([value3, () => value4.mine, value4.base]);
        }
      for (let [value3, value4] of unsendableEntries)
        !dirtyEntries.has(value3) && !conflictedEntries.has(value3) && value.push([value3, value4.value, value4.base]);
      if (value.length === 0)
        return;
      for (let [value3, value4, value5] of value) {
        let value6;
        try {
          value6 = value4();
        } catch {
          flag = !1;
          continue;
        }
        let value7 = value6 === null ? null : typeof value6 == "object" && !(typeof Blob < "u" && value6 instanceof Blob) ? value6.content : value6;
        if (value7 !== null && typeof value7 != "string") {
          flag = !1;
          continue;
        }
        items.push({
          path: value3,
          text: value7,
          base: value5
        });
      }
      hasStashedEntries = !0, stashWriteInFlight = !0;
      let value2 = ++stashGeneration, stash = options.stash, version2 = port.version().version;
      serializeStashWrite(() => stash.put(items, version2)).finally(() => {
        stashWriteInFlight = !1, stashWriteOwed && (stashWriteOwed = !1, writePendingStash());
      }).then((input) => {
        value2 !== stashGeneration || disposed || stuckState === void 0 && unsendableEntries.size === 0 || (stuckState !== void 0 && (stuckState = {
          ...stuckState,
          stashed: input && flag
        }), unsendableStashed = unsendableEntries.size > 0 && input && flag, notifyState());
      });
    }
    function clearSavedStash() {
      if (!hasStashedEntries)
        return;
      if (dirtyEntries.size > 0 || conflictedEntries.size > 0 || unsendableEntries.size > 0) {
        scheduleStashWrite(0);
        return;
      }
      hasStashedEntries = !1;
      let stash = options.stash, value = clearOfferedStashOnSave;
      clearOfferedStashOnSave = !1, stash !== void 0 && serializeStashWrite(async () => {
        await stash.clear(), value && await stash.clearOffered();
      });
    }
    let stashWritePaused = !1, stashResumeTimer, stashWriteTimer, stashWriteDelay = 1e3;
    function scheduleStashWrite(input = stashWriteDelay) {
      if (!(options.stash === void 0 || disposed)) {
        if (stashWriteTimer !== void 0) {
          if (input > 0)
            return;
          timers.clearTimeout(stashWriteTimer);
        }
        stashWriteTimer = timers.setTimeout(() => {
          stashWriteTimer = void 0, !disposed && (dirtyEntries.size > 0 || conflictedEntries.size > 0 || unsendableEntries.size > 0) && writePendingStash();
        }, input);
      }
    }
    function clearStuckIfClean() {
      dirtyEntries.size > 0 || stuckState === void 0 || inFlight || finishPublish();
    }
    function waitForRemoteVersion() {
      return new Promise((input) => {
        let flag = !1, callback = (input2) => {
          flag || (flag = !0, value(), timers.clearTimeout(value2), input(input2));
        }, value = port.onRemoteChange(() => callback(!0)), value2 = timers.setTimeout(() => callback(!1), FILE_SAVE_RETRY_MIN_MS);
      });
    }
    async function refreshLiveFileShas() {
      try {
        let value = await (0, runtime2.retryFileRead)(() => (0, runtime2.listWritableFiles)(port), timers, void 0, FILE_SAVE_READ_RETRY_DELAYS_MS);
        if ((0, runtime2.fileListingIsNarrowed)(value, port))
          return !1;
        let entries = new Map(value.map((input) => [input.path, input.sha256]));
        for (let value2 of dirtyEntries.keys())
          remoteShas.set(value2, entries.get(value2) ?? null);
        return indexPath !== void 0 && remoteShas.set(indexPath, entries.get(indexPath) ?? null), !0;
      } catch {
        return !1;
      }
    }
    async function mergeRemoteIndex() {
      if (!indexStore)
        return "merged";
      try {
        let value = await (0, runtime2.retryFileRead)(() => indexStore.reloadAndMerge(), timers, void 0, FILE_SAVE_READ_RETRY_DELAYS_MS);
        if (indexNeedsMerge = !1, value.length > 0)
          try {
            options.onIndexMerged?.(value);
          } catch {
          }
        let entry = dirtyEntries.get(indexStore.path);
        return entry !== void 0 && (entry.base = indexStore.baseSha()), "merged";
      } catch (value) {
        if (value instanceof runtime2.IndexFileError && value.code !== "not_found")
          return lastStuckRetryAt = timers.now(), value.code === "newer_version" ? "index_newer_build" : "index_damaged";
        if (value?.status === 404 && liveSha(indexStore.path) === null) {
          indexNeedsMerge = !1;
          let entry = dirtyEntries.get(indexStore.path);
          return entry !== void 0 && (entry.base = null), "merged";
        }
        return "unread";
      }
    }
    function flushNow() {
      if (dirtyEntries.size !== 0) {
        if (stuckState !== void 0) {
          restartRetryWindow(currentRetryBudget());
          return;
        }
        ignorePacingOnce = !0, commitRequested = !0, commitTimer !== void 0 && (timers.clearTimeout(commitTimer), commitTimer = void 0), tryStartCommit();
      }
    }
    function settle() {
      return dirtyEntries.size > 0 && !inFlight && !hasTerminalError() && flushNow(), !inFlight && commitTimer === void 0 && (dirtyEntries.size === 0 || hasTerminalError()) ? Promise.resolve() : new Promise((input) => settleWaiters.push(input));
    }
    return {
      markDirty,
      commit,
      settle,
      async dispose() {
        flushNow(), await settle(), disposed = !0, unsubscribeRemoteChange(), unsubscribePeers?.(), maxWaitTimer !== void 0 && (timers.clearTimeout(maxWaitTimer), maxWaitTimer = void 0), commitTimer !== void 0 && (timers.clearTimeout(commitTimer), commitTimer = void 0), retryTimer !== void 0 && (timers.clearTimeout(retryTimer), retryTimer = void 0), stashResumeTimer !== void 0 && (timers.clearTimeout(stashResumeTimer), stashResumeTimer = void 0), stashWriteTimer !== void 0 && (timers.clearTimeout(stashWriteTimer), stashWriteTimer = void 0, writePendingStash()), wakeRetryWait?.();
      },
      counters: counters2,
      state: getQueueState,
      conflicted: () => conflictedEntries,
      unsendable: () => unsendableReasons,
      resolveConflict(input, options2) {
        let entry = conflictedEntries.get(input);
        entry !== void 0 && (options2 === "mine" && entry.unreadable === !0 || (conflictedEntries.delete(input), options2 === "mine" ? markDirty(input, () => entry.mine, entry.theirsSha) : clearSavedStash()));
      },
      pending: () => dirtyEntries.size > 0 || inFlight || conflictedEntries.size > 0 || unsendableReasons.size > 0,
      isOwnEcho: isOwnPublishEcho,
      solo: isSoloPacing,
      withdraw(input) {
        let value = dirtyEntries.delete(input), value2 = conflictedEntries.delete(input), value3 = unsendableReasons.delete(input);
        unsendableEntries.delete(input), (value || value2) && withdrawnPaths.add(input), dirtyEntries.size === 0 && (firstDirtyAt = void 0, scheduleMaxWaitCommit()), (value || value2 || value3) && notifyState(), clearStuckIfClean(), clearSavedStash();
      },
      withdrawn: () => withdrawnPaths,
      retryNow() {
        if (!(disposed || dirtyEntries.size === 0)) {
          if (recentConflictTimes.clear(), wakeRetryWait !== void 0) {
            retryWaitProtected || wakeRetryWait();
            return;
          }
          inFlight || restartRetryWindow(currentRetryBudget(), !0);
        }
      },
      flushNow,
      stashRestored() {
        options.stash !== void 0 && (hasStashedEntries = !0, clearOfferedStashOnSave = !0);
      },
      stashAtOnce() {
        stashWriteDelay = 0, stashWriteTimer !== void 0 && (timers.clearTimeout(stashWriteTimer), stashWriteTimer = void 0, writePendingStash());
      },
      stashHandedOff() {
        if (options.stash === void 0 || (stashWritePaused = !0, stashWriteTimer !== void 0 && (timers.clearTimeout(stashWriteTimer), stashWriteTimer = void 0), stashResumeTimer !== void 0 && timers.clearTimeout(stashResumeTimer), stashResumeTimer = timers.setTimeout(() => {
          stashResumeTimer = void 0, !(!stashWritePaused || disposed) && (stashWritePaused = !1, (dirtyEntries.size > 0 || conflictedEntries.size > 0 || unsendableEntries.size > 0) && writePendingStash());
        }, FILE_SAVE_RETRY_MAX_MS), !hasStashedEntries))
          return;
        hasStashedEntries = !1;
        let stash = options.stash, value = clearOfferedStashOnSave;
        clearOfferedStashOnSave = !1, serializeStashWrite(async () => {
          await stash.clear(), value && await stash.clearOffered();
        });
      }
    };
  }
  return bindRuntimeValue(runtime2, "FILE_SAVE_DEBOUNCE_POLICY", () => FILE_SAVE_DEBOUNCE_POLICY, (value) => {
    FILE_SAVE_DEBOUNCE_POLICY = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_RETRY_MIN_MS", () => FILE_SAVE_RETRY_MIN_MS, (value) => {
    FILE_SAVE_RETRY_MIN_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_RETRY_MAX_MS", () => FILE_SAVE_RETRY_MAX_MS, (value) => {
    FILE_SAVE_RETRY_MAX_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_BACKPRESSURE_DELAY_MS", () => FILE_SAVE_BACKPRESSURE_DELAY_MS, (value) => {
    FILE_SAVE_BACKPRESSURE_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_STUCK_TIMEOUT_MS", () => FILE_SAVE_STUCK_TIMEOUT_MS, (value) => {
    FILE_SAVE_STUCK_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS", () => FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS, (value) => {
    FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_QUICK_RETRY_MS", () => FILE_SAVE_QUICK_RETRY_MS, (value) => {
    FILE_SAVE_QUICK_RETRY_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_LONG_REQUEST_MS", () => FILE_SAVE_LONG_REQUEST_MS, (value) => {
    FILE_SAVE_LONG_REQUEST_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_CONFLICT_RETRY_MS", () => FILE_SAVE_CONFLICT_RETRY_MS, (value) => {
    FILE_SAVE_CONFLICT_RETRY_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_MAX_TRANSIENT_RETRIES", () => FILE_SAVE_MAX_TRANSIENT_RETRIES, (value) => {
    FILE_SAVE_MAX_TRANSIENT_RETRIES = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_TOTAL_RETRY_WINDOW_MS", () => FILE_SAVE_TOTAL_RETRY_WINDOW_MS, (value) => {
    FILE_SAVE_TOTAL_RETRY_WINDOW_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_RECENT_PEER_WINDOW_MS", () => FILE_SAVE_RECENT_PEER_WINDOW_MS, (value) => {
    FILE_SAVE_RECENT_PEER_WINDOW_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_MAX_CONFLICT_PATHS", () => FILE_SAVE_MAX_CONFLICT_PATHS, (value) => {
    FILE_SAVE_MAX_CONFLICT_PATHS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_RECENT_ACTIVITY_WINDOW_MS", () => FILE_SAVE_RECENT_ACTIVITY_WINDOW_MS, (value) => {
    FILE_SAVE_RECENT_ACTIVITY_WINDOW_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_MAX_CONFLICT_RETRIES", () => FILE_SAVE_MAX_CONFLICT_RETRIES, (value) => {
    FILE_SAVE_MAX_CONFLICT_RETRIES = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_MAX_BATCH_CONFLICTS", () => FILE_SAVE_MAX_BATCH_CONFLICTS, (value) => {
    FILE_SAVE_MAX_BATCH_CONFLICTS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_RETRY_JITTER_MS", () => FILE_SAVE_RETRY_JITTER_MS, (value) => {
    FILE_SAVE_RETRY_JITTER_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_CONFLICT_BACKOFF_MS", () => FILE_SAVE_CONFLICT_BACKOFF_MS, (value) => {
    FILE_SAVE_CONFLICT_BACKOFF_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_READ_RETRY_DELAYS_MS", () => FILE_SAVE_READ_RETRY_DELAYS_MS, (value) => {
    FILE_SAVE_READ_RETRY_DELAYS_MS = value;
  }), bindRuntimeValue(runtime2, "FILE_SAVE_TERMINAL_ERROR_CODES", () => FILE_SAVE_TERMINAL_ERROR_CODES, (value) => {
    FILE_SAVE_TERMINAL_ERROR_CODES = value;
  }), bindRuntimeValue(runtime2, "isIndexFileSaveError", () => isIndexFileSaveError, (value) => {
    isIndexFileSaveError = value;
  }), bindRuntimeValue(runtime2, "defaultFilesSaveTimers", () => defaultFilesSaveTimers), bindRuntimeValue(runtime2, "createFilesSaveQueue", () => createFilesSaveQueue), () => {
    FILE_SAVE_DEBOUNCE_POLICY = {
      solo: {
        gapMs: 1e4,
        maxWaitMs: 1e4
      },
      shared: {
        gapMs: 0,
        maxWaitMs: 1500
      },
      recentMs: 3e5
    }, FILE_SAVE_RETRY_MIN_MS = 5e3, FILE_SAVE_RETRY_MAX_MS = 15e3, FILE_SAVE_BACKPRESSURE_DELAY_MS = 2e3, FILE_SAVE_STUCK_TIMEOUT_MS = 3e4, FILE_SAVE_SHARED_ACTIVITY_TIMEOUT_MS = 1e4, FILE_SAVE_QUICK_RETRY_MS = 200, FILE_SAVE_LONG_REQUEST_MS = 3e3, FILE_SAVE_CONFLICT_RETRY_MS = 2e3, FILE_SAVE_MAX_TRANSIENT_RETRIES = 3, FILE_SAVE_TOTAL_RETRY_WINDOW_MS = 6e4, FILE_SAVE_RECENT_PEER_WINDOW_MS = 2e4, FILE_SAVE_MAX_CONFLICT_PATHS = 20, FILE_SAVE_RECENT_ACTIVITY_WINDOW_MS = 3e5, FILE_SAVE_MAX_CONFLICT_RETRIES = 4, FILE_SAVE_MAX_BATCH_CONFLICTS = 64, FILE_SAVE_RETRY_JITTER_MS = 1e3, FILE_SAVE_CONFLICT_BACKOFF_MS = [300, 800], FILE_SAVE_READ_RETRY_DELAYS_MS = [150, 300, 600, 1e3, 2e3], FILE_SAVE_TERMINAL_ERROR_CODES = /* @__PURE__ */ new Set([
      "not_writer",
      "not_declared",
      "capability_disabled",
      "too_large",
      "invalid_content",
      "read_only_path",
      "index_newer_build",
      "index_damaged"
    ]), isIndexFileSaveError = (input) => input === "index_newer_build" || input === "index_damaged";
  };
}
export {
  installFilesSaveQueue
};
