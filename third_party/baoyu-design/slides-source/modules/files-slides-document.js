// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSlidesDocument(runtime2) {
  var slidesFilesTimers, SLIDES_FILES_SAVE_DEBOUNCE_MS, SLIDES_FILES_SHARED_MAX_WAIT_MS, SLIDES_FILES_SOLO_MAX_WAIT_MS, SLIDES_FILES_MAX_PARALLEL_READS, SLIDES_FILES_BOOT_REFRESH_MS, SLIDES_FILES_RECONNECT_TIMEOUT_MS, SLIDES_FILES_STALE_SYNC_TIMEOUT_MS, SLIDES_FILES_ERROR_NOTIFY_MS, SLIDES_FILES_MAX_RECOVERY_ATTEMPTS, LOCAL_SLIDE_RECOVERY_ORIGIN, SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS, slideDocumentPathForFile, SlidesContentUnbuildableError, isPermanentSlidesLoadFailure;
  function createSlidesFilesDocument(options) {
    let timers = options.timers ?? slidesFilesTimers, mayWrite = options.port.mayWrite ?? options.port.canWrite, canWrite = mayWrite, listingNarrowed = !1, newDeckUsesCssLists = !1, codecState = options.codec ?? (0, runtime2.createSlideDocumentCodec)(), notesStoredInFiles = options.notes === void 0, fileCodec = (0, runtime2.createSlidesFileCodec)(codecState.codec, {
      notesInFiles: notesStoredInFiles
    }), liveSlideFiles = /* @__PURE__ */ new Map(), knownSlideShas = /* @__PURE__ */ new Map(), localSlideOverrides = /* @__PURE__ */ new Map(), heldRemoteSlideBases = /* @__PURE__ */ new Map(), dirtySlidePaths = /* @__PURE__ */ new Set(), inFlightSlidePaths = /* @__PURE__ */ new Set(), slideConflicts = /* @__PURE__ */ new Map(), slideLocalRevisions = /* @__PURE__ */ new Map(), deckLocalRevision = 0, getSlideLocalRevision = (input) => deckLocalRevision * 1e6 + (slideLocalRevisions.get(input) ?? 0), reportedStaleSlideRevisions = /* @__PURE__ */ new Map(), bumpSlideLocalRevision = (input) => {
      let value = (0, runtime2.slideIdFromFilePath)(input);
      value !== void 0 && slideLocalRevisions.set(value, (slideLocalRevisions.get(value) ?? 0) + 1);
    }, remotePathRevisions = /* @__PURE__ */ new Map(), remoteSeenWhilePublishing = /* @__PURE__ */ new Map(), deletionConflicts = /* @__PURE__ */ new Set(), recentPublishedSlideText = /* @__PURE__ */ new Map(), overwrittenSlideText = /* @__PURE__ */ new Map(), keptSlideVersions = /* @__PURE__ */ new Map(), recentPublishTimes = [], structureRevision = 0, touchedSlidePaths = /* @__PURE__ */ new Set(), indexTouched = !1, structureTouched = !1, stashedSlideOffers = /* @__PURE__ */ new Map(), offeredSlideIds = /* @__PURE__ */ new Set(), stashOfferTimer, stashWriteCount = 0, localNotesChangedAt = /* @__PURE__ */ new Map(), notesBySlide = {}, emitEvent = (input, options2) => {
      try {
        options.onEvent?.(input, options2);
      } catch {
      }
    }, unsavedStash = options.stash, getSlideNumber = (input) => envelope.content.order.indexOf(input) + 1, envelope = {
      title: (0, runtime2.normalizeArtifactTitle)(options.defaultTitle) ?? (0, runtime2.untranslatedMessage)("未命名"),
      content: options.initialContent,
      comments: []
    }, decomposedEnvelope, codecCarry, loadState = "loading", loadFailureMessage, contentUnbuildable = !1, decompositionPending = !1, idleCommitTimer, maxWaitCommitTimer, lastSyncedAt, lastSaveError, stuckSave, unsendableFiles, unsendableNoticeShown = !1, saveTrouble = !1, gestureActive = !1, commitOwed = !1, disposed = !1, documentSubscribers = /* @__PURE__ */ new Set(), saveSubscribers = /* @__PURE__ */ new Set(), loadSubscribers = /* @__PURE__ */ new Set(), listUnlessNarrowed = options.port.listUnlessNarrowed, savePort = {
      get canWrite() {
        return options.port.canWrite;
      },
      get narrowed() {
        return options.port.narrowed === !0;
      },
      get mayWrite() {
        return options.port.mayWrite;
      },
      ...typeof listUnlessNarrowed == "function" ? {
        listUnlessNarrowed: () => listUnlessNarrowed.call(options.port)
      } : {},
      list: () => options.port.list(),
      readText: (input) => new Promise((input2, options2) => {
        let value = timers.setTimeout(() => options2(Error(input + ": no answer after " + String(SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS / 1e3) + " s")), SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS);
        options.port.readText(input).then((input3) => {
          timers.clearTimeout(value), input2(input3);
        }, (input3) => {
          timers.clearTimeout(value), options2(input3);
        });
      }),
      readBytes: (input) => options.port.readBytes(input),
      version: () => options.port.version(),
      onRemoteChange: (input) => options.port.onRemoteChange(input),
      async publish(input, options2) {
        keepListedSlidesInPublishedIndex(input);
        let entries = /* @__PURE__ */ new Map();
        for (let [value2, value3] of Object.entries(input)) {
          if ((0, runtime2.slideIdFromFilePath)(value2) === void 0)
            continue;
          let value4 = (0, runtime2.fileInputText)(value3);
          value4 !== void 0 && entries.set(value2, value4);
        }
        recentPublishTimes.push(timers.now());
        let value = await options.port.publish(input, options2);
        if (!value.ok)
          return value;
        for (let [value2, value3] of entries) {
          if (inFlightSlidePaths.delete(value2), rebasedSlideShas.delete(value2), value3 === null)
            liveSlideFiles.delete(value2), knownSlideShas.delete(value2), localSlideOverrides.get(value2) === null && !dirtySlidePaths.has(value2) && localSlideOverrides.delete(value2), runtime2.DECK_METADATA_PATH in input || followDeleteWithIndex();
          else {
            let value4 = value.shas?.[value2] ?? (0, runtime2.sha256Sync)(value3);
            liveSlideFiles.set(value2, {
              text: value3,
              sha: value4
            }), knownSlideShas.set(value2, value4), localSlideOverrides.get(value2) === value3 && !dirtySlidePaths.has(value2) && localSlideOverrides.delete(value2), recentPublishedSlideText.set(value2, {
              text: value3,
              at: timers.now()
            });
          }
          if (dirtySlidePaths.has(value2) || clearStashedSlide((0, runtime2.slideIdFromFilePath)(value2), "published"), overwrittenSlideText.delete(value2) && options.onOverwritten?.({
            path: value2,
            slideId: (0, runtime2.slideIdFromFilePath)(value2),
            slideNo: getSlideNumber((0, runtime2.slideIdFromFilePath)(value2)),
            settled: !0
          }), remoteSeenWhilePublishing.has(value2)) {
            let value4 = remoteSeenWhilePublishing.get(value2) === null;
            remoteSeenWhilePublishing.delete(value2), emitEvent("landed-with-theirs-seen", {
              path: value2
            }), slideConflicts.delete(value2) && (!localSlideOverrides.has(value2) || localSlideOverrides.get(value2) === value3) && (dirtySlidePaths.delete(value2), localSlideOverrides.delete(value2), dirtyButUnsendablePaths.delete(value2), clearStashedSlide((0, runtime2.slideIdFromFilePath)(value2), "published")), value4 && value3 !== null && LOCAL_SLIDE_RECOVERY_ORIGIN === "mine" && (restoreMissingIndexSlides([
              (0, runtime2.slideIdFromFilePath)(value2)
            ]), indexStore.dirty() && (recomposeFromFiles(!1), scheduleIdleCommit())), notifySaveSubscribers();
          } else
            slideConflicts.has(value2) && localSlideOverrides.get(value2) === value3 && (slideConflicts.delete(value2), dirtySlidePaths.delete(value2), localSlideOverrides.delete(value2), dirtyButUnsendablePaths.delete(value2), rebasedSlideShas.delete(value2), clearStashedSlide((0, runtime2.slideIdFromFilePath)(value2), "published"), notifySaveSubscribers());
        }
        return lastSyncedAt = timers.now(), emitEvent("landed", {
          paths: [...entries.keys()],
          version: value.version
        }), value;
      }
    }, readTextWithRetries = (input) => (0, runtime2.retryFileRead)(() => savePort.readText(input), timers, (input2, options2) => emitEvent("read-retry", {
      path: input,
      attempt: input2,
      status: options2?.status
    }), runtime2.BOOT_FILE_READ_RETRY_DELAYS_MS), indexStore = (0, runtime2.createIndexFileStore)({
      port: {
        readText: readTextWithRetries
      },
      path: runtime2.DECK_METADATA_PATH,
      schema: runtime2.DECK_INDEX_MERGE_SCHEMA,
      empty: () => (0, runtime2.normalizeDeckMetadata)((0, runtime2.emptyDeckIndex)())
    }), originalIndexMerge = indexStore.mergeFrom.bind(indexStore), designSystemTracker = (0, runtime2.createInstalledDesignSystemTracker)({
      list: () => (0, runtime2.listWritableFiles)(options.port),
      readText: readTextWithRetries
    }, () => savePort.version().version, () => {
      !disposed && loadState === "live" && recomposeFromFiles(!0);
    });
    indexStore.mergeFrom = (input) => {
      let items = [...indexStore.base().order], items2 = [...indexStore.get().order], value = indexStore.base().lists === void 0 && input.lists === void 0, value2 = originalIndexMerge(input);
      if (value && delete value2.lists, !Array.isArray(input.order) || !Array.isArray(value2.order) || (0, runtime2.stringArraysEqual)(items, items2))
        return value2;
      let value3 = (0, runtime2.mergeSlideOrderWithReplay)(items, items2, input.order);
      return emitEvent("order-merged", {
        base: items,
        mine: items2,
        theirs: [...input.order],
        merged: value3.order,
        replayed: value3.replayed,
        lost: value3.lost
      }), value2.order.splice(0, value2.order.length, ...value3.order), replayMergedOrderChanges(items, items2, value3), value2;
    };
    let saveQueue = (0, runtime2.createFilesSaveQueue)({
      port: savePort,
      index: indexStore,
      ...options.paced !== void 0 ? {
        paced: options.paced
      } : {},
      onShared: () => {
        disposed || maxWaitCommitTimer === void 0 || (timers.clearTimeout(maxWaitCommitTimer), maxWaitCommitTimer = void 0, scheduleMaxWaitCommit());
      },
      timers: {
        setTimeout: (input, options2) => timers.setTimeout(input, options2),
        clearTimeout: (input) => timers.clearTimeout(input),
        now: () => timers.now(),
        ...timers.random !== void 0 ? {
          random: () => timers.random()
        } : {}
      },
      onConflict: (input) => {
        if (dirtyButUnsendablePaths.delete(input.path), inFlightSlidePaths.delete(input.path), remoteSeenWhilePublishing.delete(input.path), LOCAL_SLIDE_RECOVERY_ORIGIN === "mine" && input.mine === null && input.unreadable !== !0 && input.theirsSha !== null && localSlideOverrides.get(input.path) === null) {
          clearSlideConflict(input.path), handDeleteToSaveQueue(input.path, input.theirsSha), commitOwed = !0, emitEvent("clash-decision", {
            path: input.path,
            slide: (0, runtime2.slideIdFromFilePath)(input.path),
            kind: "edited",
            chose: "mine",
            what: "my delete is sent again over their copy, in the same save as deck.json"
          });
          return;
        }
        markSlideDirtyAgainstBase(input.path, input.theirsSha);
      },
      onState: (input) => {
        if (lastSaveError = input.lastError, (input.lastError !== void 0 || input.stuck !== void 0) && !saveTrouble ? (saveTrouble = !0, emitEvent("save-trouble", input.lastError ?? input.stuck?.code)) : !input.inFlight && input.dirty === 0 && saveTrouble && (saveTrouble = !1, emitEvent("save-recovered", void 0)), input.stuck !== void 0 && stuckSave === void 0) {
          emitEvent("save-stuck", input.stuck);
          for (let value2 of slideConflicts.keys())
            timers.setTimeout(() => retryDirtySlide(value2), 0);
        }
        stuckSave = input.stuck, unsendableFiles = input.unsendable, unsendableFiles === void 0 && (unsendableNoticeShown = !1);
        let value = gestureActive;
        gestureActive = input.inFlight, value && !gestureActive && commitOwed && commitChanges(), notifySaveSubscribers();
      }
    }), getNotesSyncState = () => options.notes?.state?.() ?? {
      unsaved: 0
    }, pendingSaveCount = () => dirtySlidePaths.size + inFlightSlidePaths.size + (indexStore.dirty() ? 1 : 0) + (decompositionPending ? 1 : 0) + getNotesSyncState().unsaved;
    function describeSaveState(quiet) {
      let withHint = (input, options2) => quiet ? input : (0, runtime2.joinMessages)(input, options2), keepsTrying = () => quiet ? (0, runtime2.formatMessage)({
        defaultMessage: "正在自动重试。",
        id: "4+xOFgw2dV"
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "正在自动重试，也可点击立即重试。",
        id: "0rvCg2ddjE"
      });
      if (loadState === "loading")
        return {
          status: "loading",
          message: (0, runtime2.formatMessage)({
            defaultMessage: "正在加载最新内容…",
            id: "dYQ+dU7yu8"
          })
        };
      if (loadState === "failed")
        return {
          status: "error",
          message: withHint(loadFailureMessage !== void 0 ? (0, runtime2.formatMessage)({
            defaultMessage: "演示文稿加载失败（{reason}）。",
            id: "C4AnEHL+1C"
          }, {
            reason: loadFailureMessage
          }) : (0, runtime2.formatMessage)({
            defaultMessage: "演示文稿加载失败。",
            id: "AZ/iGfWBDL"
          }), (0, runtime2.formatMessage)({
            defaultMessage: "点击重试。",
            id: "7Uq3AyGjoX"
          }))
        };
      if (!canWrite)
        return {
          status: "readonly",
          message: contentUnbuildable ? (0, runtime2.formatMessage)({
            defaultMessage: "无法打开较新版本，当前显示之前的版本。",
            id: "NpkxP0U0lP"
          }) : waitingForReadableListing ? (0, runtime2.formatMessage)({
            defaultMessage: "当前无法保存任何更改。",
            id: "YesF3/q5yL"
          }) : listingNarrowed && mayWrite ? runtime2.FILE_LIST_UNAVAILABLE_MESSAGE : options.readOnlyReason ?? (0, runtime2.formatMessage)({
            defaultMessage: "只读，正在实时显示他人的更改。",
            id: "Jg6vTiHgBm"
          })
        };
      if (stuckSave !== void 0) {
        let durable = unsavedStash?.durable() === !0, notSaved = (0, runtime2.joinMessages)((0, runtime2.formatMessage)({
          defaultMessage: "最新更改尚未保存。",
          id: "HBR07mUCMF"
        }), durable ? (0, runtime2.formatMessage)({
          defaultMessage: "这些更改会在此浏览器中保留 {days} 天，关闭标签页后仍可恢复。",
          id: "W6CEg0uIk3"
        }, {
          days: runtime2.CRASH_STASH_MAX_AGE_MS / 864e5
        }) : (0, runtime2.formatMessage)({
          defaultMessage: "这些更改仅在标签页保持打开时保留。",
          id: "GqI5unjY8b"
        }));
        return stuckSave.retryable ? {
          status: "error",
          message: stuckSave.nextRetryAt !== void 0 ? (0, runtime2.joinMessages)(notSaved, keepsTrying()) : withHint(notSaved, (0, runtime2.formatMessage)({
            defaultMessage: "点击立即重试。",
            id: "dP9rlgcOoq"
          }))
        } : {
          status: "error",
          message: (0, runtime2.joinMessages)(notSaved, durable ? (0, runtime2.formatMessage)({
            defaultMessage: "重试无法解决此问题，请刷新页面。",
            id: "57IPqcdhe7"
          }) : (0, runtime2.formatMessage)({
            defaultMessage: "重试无法解决此问题，刷新会丢失这些更改，请先复制需要保留的内容。",
            id: "NdP49uZ7/a"
          }))
        };
      }
      if (lastSaveError !== void 0 || saveTrouble)
        return {
          status: "error",
          message: (0, runtime2.joinMessages)((0, runtime2.formatMessage)({
            defaultMessage: "有一项更改尚未保存。",
            id: "Cl2e/sJdK8"
          }), keepsTrying())
        };
      let value = [...slideConflicts.values()].find((input) => {
        let value7 = slideDocumentPathForFile(input.path);
        return value7 !== void 0 && (options.holdRemote?.(value7) === !0 || options.inSlide?.(value7) === !0);
      }), value2 = value !== void 0, value3 = value === void 0 ? "" : (getSlideNumber(value.slideId) > 0 ? "幻灯片 " + String(getSlideNumber(value.slideId)) : "A slide") + (value.theirsSha === null ? " deleted remotely" : " changed remotely");
      if (LOCAL_SLIDE_RECOVERY_ORIGIN === "theirs" && value2 && unsendableFiles === void 0)
        return {
          status: "dirty",
          message: value3
        };
      let value4 = getNotesSyncState();
      if (value4.fault === "no_store")
        return {
          status: "error",
          message: (0, runtime2.formatMessage)({
            defaultMessage: "当前视图无法保存演讲者备注。备注仅保留在此页面中，请在关闭标签页前复制。",
            id: "mBMghIW27z"
          })
        };
      if (value4.fault !== void 0)
        return {
          status: "error",
          message: withHint((0, runtime2.formatMessage)({
            defaultMessage: "有 {count} 页的演讲者备注尚未保存。",
            id: "lLbxZHb4k+"
          }, {
            n: value4.unsaved,
            count: String(value4.unsaved)
          }), (0, runtime2.formatMessage)({
            defaultMessage: "点击再次重试。",
            id: "yKJs3ODE7P"
          }))
        };
      let value5 = countBlockedFiles();
      if (inFlightSlidePaths.size > value5.slides || value4.unsaved > 0 && dirtySlidePaths.size === 0 && !indexStore.dirty())
        return {
          status: "saving",
          message: (0, runtime2.formatMessage)({
            defaultMessage: "正在保存…",
            id: "b7Lw/JQfSX"
          })
        };
      let value6 = pendingSaveCount() - value5.slides - value5.index;
      return value6 > 0 ? {
        status: "dirty",
        message: (0, runtime2.formatMessage)({
          defaultMessage: "有 {count} 项更改等待保存。",
          id: "ALH0ztdeEw"
        }, {
          n: value6,
          count: String(value6)
        })
      } : unsendableFiles !== void 0 ? {
        status: "error",
        message: formatUnsendableMessage(unsendableFiles),
        leftOut: unsendableFiles.map((input) => ({
          id: input.path,
          cause: input.cause
        }))
      } : contentUnbuildable ? {
        status: "readonly",
        message: (0, runtime2.formatMessage)({
          defaultMessage: "无法打开较新版本，编辑已暂停，待成功加载后恢复。此前的更改已保存。",
          id: "smMbPpyHlN"
        })
      } : {
        status: "ready",
        message: lastSyncedAt !== void 0 ? (0, runtime2.formatMessage)({
          defaultMessage: "所有更改已保存。",
          id: "VLKWNDPXfU"
        }) : (0, runtime2.formatMessage)({
          defaultMessage: "已保存。",
          id: "AnBfgI4KOV"
        })
      };
    }
    function getSaveState() {
      return describeSaveState(!1);
    }
    function countBlockedFiles() {
      let value = unsendableFiles ?? [];
      return {
        slides: value.filter((input) => inFlightSlidePaths.has(input.path)).length,
        index: indexStore.dirty() && value.some((input) => input.path === runtime2.DECK_METADATA_PATH) ? 1 : 0
      };
    }
    function canReportUnsendable() {
      let value = countBlockedFiles();
      return loadState === "live" && slideConflicts.size === 0 && stuckSave === void 0 && lastSaveError === void 0 && !saveTrouble && dirtySlidePaths.size === 0 && !decompositionPending && inFlightSlidePaths.size === value.slides && (!indexStore.dirty() || value.index === 1);
    }
    function formatUnsendableMessage(input) {
      let callback = (input2) => {
        let value5 = (0, runtime2.slideIdFromFilePath)(input2);
        return value5 === void 0 ? 0 : getSlideNumber(value5);
      }, callback2 = (input2) => input2 === runtime2.DECK_METADATA_PATH ? "the presentation’s own record (its title, sections and slide order)" : callback(input2) > 0 ? "slide " + String(callback(input2)) : void 0, value = [...input].sort((input2, options2) => callback(input2.path) - callback(options2.path));
      if (value.some((input2) => callback2(input2.path) === void 0))
        return (0, runtime2.formatLostSlideEditsMessage)(value);
      let value2 = unsavedStash?.durable() === !0 && value.every((input2) => typeof localSlideOverrides.get(input2.path) == "string" && unsavedStash.read((0, runtime2.slideIdFromFilePath)(input2.path) ?? "")?.html === localSlideOverrides.get(input2.path)), value3 = value.length === 1, value4 = String(value.length) + (value.every((input2) => callback(input2.path) > 0) ? " 页幻灯片" : " parts of this presentation");
      return "Everything else is saved, but " + (value3 ? callback2(value[0].path) + " is not: " : value4 + " are not. The first, " + callback2(value[0].path) + ": ") + value[0].why + ". Until then " + (value3 ? "it is" : "they are") + " kept " + (value2 ? "in this browser for " + runtime2.CRASH_STASH_RETENTION_LABEL + ", even if this tab closes." : "only while this tab stays open.");
    }
    let lastSaveAnnouncementKey = "";
    function notifySaveSubscribers() {
      let value = getSaveState();
      unsendableFiles !== void 0 && !unsendableNoticeShown && canReportUnsendable() && (unsendableNoticeShown = !0, emitEvent("save-left-out", {
        files: unsendableFiles,
        message: formatUnsendableMessage(unsendableFiles)
      }));
      let value2 = value.status + "|" + (value.message ?? "");
      if (value2 !== lastSaveAnnouncementKey) {
        lastSaveAnnouncementKey = value2;
        for (let value3 of [...saveSubscribers])
          value3(value);
      }
    }
    function notifyDocumentSubscribers(input) {
      for (let value of [...documentSubscribers])
        value(input ? {
          remote: !0
        } : void 0);
      notifySaveSubscribers();
    }
    function setLoadState(input) {
      if (loadState !== input) {
        loadState = input;
        for (let value of [...loadSubscribers])
          value();
        notifySaveSubscribers();
      }
    }
    function composeCurrentFiles() {
      let entries = /* @__PURE__ */ new Map();
      for (let [value, value2] of liveSlideFiles)
        entries.set(value, value2.text);
      for (let [value, value2] of heldRemoteSlideBases)
        value2 === null ? entries.delete(value) : entries.set(value, value2);
      for (let [value, value2] of localSlideOverrides)
        value2 === null ? entries.delete(value) : entries.set(value, value2);
      return entries;
    }
    let unheardInlineNoteIds = /* @__PURE__ */ new Set(), locallyEditedNoteIds = /* @__PURE__ */ new Set();
    function mergeInlineNotesIntoContent(input, options2) {
      if (notesStoredInFiles)
        return input;
      let value = input;
      for (let value2 of options2) {
        let value3 = value.slides[value2];
        if (value3?.notes === void 0)
          continue;
        if (canWrite && options.notes !== void 0) {
          notesBySlide[value2] === void 0 && (notesBySlide[value2] = value3.notes, options.notes.heard?.() === !0 ? options.notes.set(value2, value3.notes) : unheardInlineNoteIds.add(value2));
          continue;
        }
        let { notes: value4, ...value5 } = value3;
        value = {
          ...value,
          slides: {
            ...value.slides,
            [value2]: value5
          }
        };
      }
      return value;
    }
    function composeFromFiles() {
      decompositionPending && flushPendingDecomposition();
      try {
        let value3 = (0, runtime2.normalizeDeckMetadata)(indexStore.get()), value = fileCodec.compose({
          files: composeCurrentFiles(),
          index: newDeckUsesCssLists && (0, runtime2.readFileMigrationMarker)(value3) === null ? {
            ...value3,
            lists: "css"
          } : value3,
          notes: notesBySlide,
          designSystems: designSystemTracker.current()
        }, codecCarry), content = protectLocallyRevisedSlides(mergeInlineNotesIntoContent(options.parseContent(value.content), value.carry?.inlineNotes ?? [])), composed = {
          title: (0, runtime2.normalizeArtifactTitle)(typeof value.title == "string" ? value.title.trim() : value.title) ?? envelope.title,
          content,
          comments: []
        };
        decomposedEnvelope = fileCodec.decompose(composed, decomposedEnvelope, value.carry), codecCarry = value.carry, envelope = composed;
      } catch (value3) {
        return console.error("slides (files): compose failed; keeping the current content (" + (value3 instanceof Error ? value3.name : "a throw") + ")"), !1;
      }
      designSystemTracker.refresh(indexStore.get()), indexStore.get().order.forEach((input2, options2, context) => previousSlideById.set(input2, options2 === 0 ? null : context[options2 - 1]));
      let value2 = Object.entries(indexStore.get().sections).filter((input2) => typeof input2[1] == "object" && input2[1] !== null), values = new Set(value2.map(([, input2]) => input2.start));
      for (let value3 of indexStore.get().order)
        values.has(value3) || sectionIdByStartSlide.delete(value3);
      for (let [value3, value4] of value2)
        typeof value4.start == "string" && sectionIdByStartSlide.set(value4.start, value3);
      return !0;
    }
    function recomposeFromFiles(input) {
      let wasUnbuildable = contentUnbuildable;
      contentUnbuildable = !composeFromFiles(), contentUnbuildable ? wasUnbuildable || notifyDocumentSubscribers(!1) : notifyDocumentSubscribers(input);
    }
    function protectLocallyRevisedSlides(input) {
      let slides = input.slides;
      for (let [value, value2] of Object.entries(input.slides)) {
        let value3 = getSlideLocalRevision(value), value4 = value2[runtime2.SLIDE_GENERATION_SYMBOL];
        if (value4 !== value3) {
          if (value4 === void 0)
            try {
              Object.defineProperty(value2, runtime2.SLIDE_GENERATION_SYMBOL, {
                value: value3,
                enumerable: !0,
                writable: !1,
                configurable: !1
              });
              continue;
            } catch {
            }
          slides === input.slides && (slides = {
            ...slides
          }), slides[value] = {
            ...value2,
            [runtime2.SLIDE_GENERATION_SYMBOL]: value3
          };
        }
      }
      return slides === input.slides ? input : {
        ...input,
        slides
      };
    }
    function normalizeLocalEnvelope(input) {
      let slides = envelope.content.slides, slides2 = input.content.slides, order = input.content.order;
      for (let [value, value2] of Object.entries(input.content.slides)) {
        let value3 = slides[value];
        if (value2 === value3)
          continue;
        let value4 = value2[runtime2.SLIDE_GENERATION_SYMBOL];
        if (value4 === void 0 || value4 === getSlideLocalRevision(value) || value3 === void 0 && !slideLocalRevisions.has(value)) {
          value4 !== getSlideLocalRevision(value) && (slides2 === input.content.slides && (slides2 = {
            ...slides2
          }), slides2[value] = {
            ...value2,
            [runtime2.SLIDE_GENERATION_SYMBOL]: getSlideLocalRevision(value)
          });
          continue;
        }
        if (slides2 === input.content.slides && (slides2 = {
          ...slides2
        }), value3 !== void 0 ? slides2[value] = value3 : (delete slides2[value], order = order.filter((input2) => input2 !== value)), emitEvent("stale-write-dropped", {
          slide: value,
          from: value4,
          now: getSlideLocalRevision(value)
        }), LOCAL_SLIDE_RECOVERY_ORIGIN === "theirs" && reportedStaleSlideRevisions.get(value) !== getSlideLocalRevision(value)) {
          reportedStaleSlideRevisions.set(value, getSlideLocalRevision(value));
          let value5 = getSlideNumber(value);
          try {
            options.onNotice?.((value5 > 0 ? "幻灯片 " + String(value5) : "A slide") + " changed remotely");
          } catch {
          }
        }
      }
      return slides2 === input.content.slides ? input : {
        ...input,
        content: {
          ...input.content,
          slides: slides2,
          order
        }
      };
    }
    function updateLocalEnvelope(input) {
      contentUnbuildable || (envelope = normalizeLocalEnvelope(input), decompositionPending || (decompositionPending = !0, timers.setTimeout(flushPendingDecomposition, 16)), notifyDocumentSubscribers(!1));
    }
    function flushPendingDecomposition() {
      if (!decompositionPending || disposed)
        return;
      decompositionPending = !1;
      let value = fileCodec.decompose(envelope, decomposedEnvelope, codecCarry), value2 = decomposedEnvelope;
      if (decomposedEnvelope = value, !canWrite || loadState !== "live")
        return void notifySaveSubscribers();
      let flag = !1, flag2 = !1, deletedPaths = [], handedDeletes = [];
      for (let [value3, value4] of value.files) {
        let value5 = value2?.files.get(value3);
        value5 !== value4 && (value5 === void 0 && (flag = !0), localSlideOverrides.set(value3, value4), dirtySlidePaths.add(value3), touchedSlidePaths.add(value3), stashLocalSlideEdit(value3, value4, value.index.order), flag2 = !0);
      }
      for (let value3 of value2?.files.keys() ?? [])
        value.files.has(value3) || (clearSlideConflict(value3), heldRemoteSlideBases.delete(value3), localSlideOverrides.set(value3, null), deletedPaths.push(value3), touchedSlidePaths.add(value3), clearStashedSlide((0, runtime2.slideIdFromFilePath)(value3), "deleted here"), flag = !0, flag2 = !0);
      (value2 === void 0 || JSON.stringify(value2.index) !== JSON.stringify(value.index)) && (value2 !== void 0 && JSON.stringify(value2.index.order) !== JSON.stringify(value.index.order) && (flag = !0), indexStore.update((input) => (0, runtime2.patchDeckMetadata)(input, value2?.index, value.index)), indexStore.dirty() && (indexTouched = !0), flag2 = flag2 || indexStore.dirty());
      for (let value3 of deletedPaths)
        LOCAL_SLIDE_RECOVERY_ORIGIN === "mine" && (!inFlightSlidePaths.has(value3) || saveQueue.unsendable().has(value3)) ? (handDeleteToSaveQueue(value3, liveSlideFiles.get(value3)?.sha ?? null), handedDeletes.push(value3)) : dirtySlidePaths.add(value3);
      handedDeletes.length > 0 && emitEvent("delete-handed", {
        paths: handedDeletes
      });
      for (let value3 of /* @__PURE__ */ new Set([
        ...Object.keys(value.notes),
        ...Object.keys(value2?.notes ?? {})
      ]))
        value.notes[value3] !== value2?.notes[value3] && (value.notes[value3] === void 0 ? delete notesBySlide[value3] : notesBySlide[value3] = value.notes[value3], localNotesChangedAt.set(value3, timers.now()), options.notes?.set(value3, value.notes[value3]));
      if (!flag2)
        return void notifySaveSubscribers();
      flag ? (structureTouched = !0, commitChanges("structural")) : (scheduleIdleCommit(), scheduleMaxWaitCommit()), notifySaveSubscribers();
    }
    function scheduleIdleCommit() {
      timers.clearTimeout(idleCommitTimer), idleCommitTimer = timers.setTimeout(() => {
        idleCommitTimer = void 0, commitChanges("idle");
      }, SLIDES_FILES_SAVE_DEBOUNCE_MS);
    }
    function getMaxCommitWait() {
      if (saveQueue.solo())
        return SLIDES_FILES_SOLO_MAX_WAIT_MS;
      let value = timers.now();
      for (; recentPublishTimes.length > 0 && value - recentPublishTimes[0] >= SLIDES_FILES_RECONNECT_TIMEOUT_MS; )
        recentPublishTimes.shift();
      return recentPublishTimes.length >= SLIDES_FILES_MAX_PARALLEL_READS ? SLIDES_FILES_BOOT_REFRESH_MS : SLIDES_FILES_SHARED_MAX_WAIT_MS;
    }
    function scheduleMaxWaitCommit() {
      if (maxWaitCommitTimer !== void 0)
        return;
      let value = getMaxCommitWait();
      maxWaitCommitTimer = timers.setTimeout(() => {
        maxWaitCommitTimer = void 0;
        let value2 = [...dirtySlidePaths].filter((input) => !slideConflicts.has(input));
        value2.length === 0 && !indexStore.dirty() || (emitEvent("max-wait-flush", {
          paths: value2,
          index: indexStore.dirty(),
          afterMs: value,
          publishesLastMinute: recentPublishTimes.length,
          why: "edits kept coming with no boundary and no pause"
        }), commitChanges("max-wait"));
      }, value);
    }
    let readLocalOverride = (input) => () => {
      if (localSlideOverrides.has(input))
        return localSlideOverrides.get(input) ?? null;
      throw timers.setTimeout(() => {
        if (!(disposed || localSlideOverrides.has(input))) {
          try {
            saveQueue.withdraw(input);
          } catch {
          }
          inFlightSlidePaths.delete(input), dirtySlidePaths.delete(input), notifySaveSubscribers();
        }
      }, 0), Error(input + ": nothing of this tab to send");
    };
    function handDeleteToSaveQueue(input, base) {
      dirtySlidePaths.delete(input), inFlightSlidePaths.add(input), base !== null ? knownSlideShas.set(input, base) : knownSlideShas.delete(input), base !== (liveSlideFiles.get(input)?.sha ?? null) ? rebasedSlideShas.set(input, base) : rebasedSlideShas.delete(input), saveQueue.markDirty(input, readLocalOverride(input), base), indexStore.dirty() && indexStore.update(() => {
      });
    }
    let deletedListedSlideIds = () => [...localSlideOverrides].flatMap(([input, options2]) => options2 === null && liveSlideFiles.has(input) ? [(0, runtime2.slideIdFromFilePath)(input)] : []).filter((input) => input !== void 0);
    function keepListedSlidesInPublishedIndex(input) {
      let value = input[runtime2.DECK_METADATA_PATH], value2 = value === void 0 ? void 0 : (0, runtime2.fileInputText)(value);
      if (typeof value2 != "string")
        return;
      let ids = deletedListedSlideIds().filter((input2) => input[(0, runtime2.slideFilePath)(input2)] !== null);
      if (ids.length === 0)
        return;
      let parsed = indexStore.parse(value2), kept = (0, runtime2.restoreKeptListedSlides)(parsed, indexStore.base(), ids);
      kept !== parsed && (input[runtime2.DECK_METADATA_PATH] = (0, runtime2.serializeIndexDocument)(kept), emitEvent("index-kept-listed", {
        ids
      }));
    }
    function followDeleteWithIndex() {
      indexStore.dirty() && (indexStore.update(() => {
      }), timers.setTimeout(() => commitChanges("index-follows-delete"), 0));
    }
    function commitChanges(input = "boundary") {
      if (disposed || !canWrite || loadState !== "live")
        return;
      if (decompositionPending && flushPendingDecomposition(), options.startEmpty === !0 && !contentUnbuildable && (dirtySlidePaths.size > 0 || indexStore.dirty()) && (0, runtime2.readFileMigrationMarker)(indexStore.get()) === null && indexStore.update((input2) => {
        input2[runtime2.CREATED_ON_FILES_MARKER_FIELD] = (0, runtime2.createdOnFilesMarker)({
          at: new Date(timers.now()).toISOString()
        }), newDeckUsesCssLists && (input2.lists = "css"), input2.order.length === 0 && envelope.content.order.length > 0 && input2.order.push(...envelope.content.order);
      }), timers.clearTimeout(idleCommitTimer), idleCommitTimer = void 0, timers.clearTimeout(maxWaitCommitTimer), maxWaitCommitTimer = void 0, gestureActive) {
        !commitOwed && (dirtySlidePaths.size > 0 || indexStore.dirty()) && emitEvent("commit-owed", {
          why: input,
          waitingOn: "the publish in flight"
        }), commitOwed = !0;
        return;
      }
      commitOwed = !1;
      let items = [];
      for (let value of [...dirtySlidePaths]) {
        let value2 = knownSlideShas.has(value) ? knownSlideShas.get(value) ?? null : null, value3 = liveSlideFiles.get(value)?.sha ?? null, movedOn = value3 !== value2 && !inFlightSlidePaths.has(value) && !(rebasedSlideShas.has(value) && rebasedSlideShas.get(value) === value2);
        if (LOCAL_SLIDE_RECOVERY_ORIGIN === "mine" && localSlideOverrides.get(value) === null && (movedOn || slideConflicts.has(value))) {
          clearSlideConflict(value), handDeleteToSaveQueue(value, value3), items.push(value);
          continue;
        }
        if (!slideConflicts.has(value)) {
          if (movedOn) {
            markSlideDirtyAgainstBase(value, value3, value3 === null ? "deleted" : "edited");
            continue;
          }
          if (!localSlideOverrides.has(value)) {
            dirtySlidePaths.delete(value);
            continue;
          }
          dirtySlidePaths.delete(value), inFlightSlidePaths.add(value), items.push(value), saveQueue.markDirty(value, readLocalOverride(value), value2);
        }
      }
      (items.length > 0 || indexStore.dirty()) && emitEvent("commit", {
        why: input,
        paths: items,
        index: indexStore.dirty()
      }), saveQueue.commit(), notifySaveSubscribers();
    }
    function flushForUnload(input) {
      decompositionPending && flushPendingDecomposition();
      let state = {
        paths: [...dirtySlidePaths].filter((input2) => !slideConflicts.has(input2)),
        index: indexStore.dirty(),
        owed: gestureActive
      };
      return commitChanges(input), saveQueue.flushNow(), emitEvent("unload-flush", {
        why: input,
        ...state,
        inFlight: [...inFlightSlidePaths],
        stashed: unsavedStash !== void 0
      }), state;
    }
    function takeTouchedPaths() {
      decompositionPending && flushPendingDecomposition();
      let state = {
        paths: [...touchedSlidePaths],
        index: indexTouched,
        structural: structureTouched
      };
      return touchedSlidePaths.clear(), indexTouched = !1, structureTouched = !1, state;
    }
    function stashLocalSlideEdit(input, items, order) {
      let value = (0, runtime2.slideIdFromFilePath)(input);
      if (unsavedStash === void 0 || value === void 0 || stashedSlideOffers.has(value))
        return;
      let position = order.indexOf(value), value2 = unsavedStash.write(value, knownSlideShas.has(input) ? knownSlideShas.get(input) ?? null : null, items, position < 0 ? void 0 : position === 0 ? null : order[position - 1]);
      stashWriteCount += 1, value2 ? (stashWriteCount === 1 || stashWriteCount % 20 === 0) && emitEvent("stash-write", {
        slide: value,
        bytes: items.length,
        writes: stashWriteCount,
        where: unsavedStash.kind
      }) : emitEvent("stash-write-failed", {
        slide: value,
        bytes: items.length
      });
    }
    function clearStashedSlide(input, options2) {
      unsavedStash === void 0 || stashedSlideOffers.has(input) || unsavedStash.read(input) !== void 0 && (unsavedStash.clear(input), emitEvent("stash-clear", {
        slide: input,
        why: options2
      }));
    }
    function offerStashedSlides() {
      if (unsavedStash === void 0 || disposed || !canWrite)
        return;
      timers.clearTimeout(stashOfferTimer), stashOfferTimer = void 0;
      let value;
      for (let value2 of unsavedStash.all()) {
        if (offeredSlideIds.has(value2.slideId))
          continue;
        let value3 = (0, runtime2.slideFilePath)(value2.slideId);
        if (dirtySlidePaths.has(value3) || inFlightSlidePaths.has(value3)) {
          stashedSlideOffers.has(value2.slideId) && (value = Math.min(value ?? 1 / 0, 2e3));
          continue;
        }
        let entry = liveSlideFiles.get(value3);
        if (entry !== void 0 && entry.text === value2.html) {
          unsavedStash.clear(value2.slideId), stashedSlideOffers.delete(value2.slideId), emitEvent("stash-clear", {
            slide: value2.slideId,
            why: "the published slide already holds it"
          });
          continue;
        }
        stashedSlideOffers.set(value2.slideId, value2), value2.after !== void 0 && stashedPreviousSlideById.set(value2.slideId, value2.after);
        let value4 = timers.now() - value2.at;
        if (value4 < SLIDES_FILES_STALE_SYNC_TIMEOUT_MS) {
          value = Math.min(value ?? 1 / 0, SLIDES_FILES_STALE_SYNC_TIMEOUT_MS - value4 + 50);
          continue;
        }
        offeredSlideIds.add(value2.slideId);
        let state = {
          slideId: value2.slideId,
          slideNo: getSlideNumber(value2.slideId),
          at: value2.at,
          moved: (entry?.sha ?? null) !== value2.base
        };
        emitEvent("stash-offer", state);
        try {
          options.onStashOffer?.(state);
        } catch {
        }
      }
      for (let value2 of [...stashedSlideOffers.keys()])
        !offeredSlideIds.has(value2) && unsavedStash.read(value2) === void 0 && stashedSlideOffers.delete(value2);
      value !== void 0 && (stashOfferTimer = timers.setTimeout(offerStashedSlides, value));
    }
    function getStashOffers() {
      return [...offeredSlideIds].flatMap((input) => {
        let entry = stashedSlideOffers.get(input);
        if (entry === void 0)
          return [];
        let entry2 = liveSlideFiles.get((0, runtime2.slideFilePath)(input));
        return [
          {
            slideId: input,
            slideNo: getSlideNumber(input),
            at: entry.at,
            moved: (entry2?.sha ?? null) !== entry.base
          }
        ];
      });
    }
    function restoreStashedSlide(input) {
      let entry = stashedSlideOffers.get(input);
      if (entry === void 0)
        return;
      stashedSlideOffers.delete(input), offeredSlideIds.delete(input);
      let value = (0, runtime2.slideFilePath)(input), entry2 = liveSlideFiles.get(value), value2 = (entry2?.sha ?? null) !== entry.base;
      emitEvent("stash-restore", {
        slide: input,
        moved: value2,
        bytes: entry.html.length
      }), localSlideOverrides.set(value, entry.html), dirtySlidePaths.add(value), entry2 !== void 0 ? knownSlideShas.set(value, entry2.sha) : (knownSlideShas.delete(value), restoreMissingIndexSlides([input])), bumpSlideLocalRevision(value), recomposeFromFiles(!0), commitChanges("stash-restore");
    }
    function discardStashedSlide(input) {
      stashedSlideOffers.delete(input) && (offeredSlideIds.delete(input), unsavedStash?.clear(input), emitEvent("stash-discard", {
        slide: input
      }));
    }
    function createRestoredSlideId(input) {
      let value = options.newSlideId?.() ?? (0, runtime2.sha256Sync)(input + ":" + String(timers.now()) + ":" + String(Math.random())).slice(0, 8);
      for (; envelope.content.slides[value] !== void 0 || liveSlideFiles.has((0, runtime2.slideFilePath)(value)) || localSlideOverrides.has((0, runtime2.slideFilePath)(value)); )
        value = (0, runtime2.sha256Sync)(value).slice(0, 8);
      return value;
    }
    function keepSlideVersion(input, items, context) {
      if (typeof items != "string" || !canWrite)
        return;
      let value = timers.now();
      keptSlideVersions.set(input, {
        html: items,
        why: context,
        at: value,
        earlier: !1
      });
      let value2 = unsavedStash?.keep(input, items, context) ?? !1;
      if (emitEvent("kept", {
        slide: input,
        why: context,
        bytes: items.length,
        where: value2 ? unsavedStash.kind : "this tab’s memory only"
      }), context !== "overwritten")
        try {
          options.onKept?.({
            slideId: input,
            slideNo: getSlideNumber(input),
            why: context,
            at: value,
            earlier: !1
          });
        } catch {
        }
    }
    function dropKeptSlideVersion(input, options2) {
      keptSlideVersions.delete(input) && (unsavedStash?.dropKept(input), emitEvent("kept-dropped", {
        slide: input,
        why: options2
      }));
    }
    function getKeptSlideVersions() {
      return [...keptSlideVersions].map(([input, input2]) => ({
        slideId: input,
        slideNo: getSlideNumber(input),
        why: input2.why,
        at: input2.at,
        earlier: input2.earlier
      }));
    }
    function restoreKeptSlideAsCopy(input) {
      let entry = keptSlideVersions.get(input);
      if (entry === void 0 || !canWrite || loadState !== "live")
        return;
      decompositionPending && flushPendingDecomposition();
      let value = createRestoredSlideId(input), value2 = (0, runtime2.slideFilePath)(value);
      localSlideOverrides.set(value2, entry.html), indexStore.update((input2) => {
        let value4 = input2.order.indexOf(input);
        input2.order.splice(value4 < 0 ? input2.order.length : value4 + 1, 0, value);
      }), recomposeFromFiles(!0);
      let value3 = decomposedEnvelope?.files.get(value2);
      return value3 !== void 0 && localSlideOverrides.set(value2, value3), dirtySlidePaths.add(value2), keptSlideVersions.delete(input), unsavedStash?.dropKept(input), emitEvent("kept-restored", {
        slide: input,
        as: value,
        why: entry.why
      }), commitChanges("kept-restore"), value;
    }
    function loadKeptVersions() {
      if (unsavedStash === void 0 || disposed || !canWrite)
        return;
      let values = new Set([...liveSlideFiles.values()].map((input) => input.text));
      for (let value of unsavedStash.kept()) {
        if (keptSlideVersions.has(value.slideId))
          continue;
        if (values.has(value.html)) {
          unsavedStash.dropKept(value.slideId), emitEvent("kept-dropped", {
            slide: value.slideId,
            why: "the published deck already holds it"
          });
          continue;
        }
        keptSlideVersions.set(value.slideId, {
          html: value.html,
          why: value.why,
          at: value.at,
          earlier: !0
        });
        let state = {
          slideId: value.slideId,
          slideNo: getSlideNumber(value.slideId),
          why: value.why,
          at: value.at,
          earlier: !0
        };
        emitEvent("kept-offer", state);
        try {
          options.onKept?.(state);
        } catch {
        }
      }
    }
    function markReadAccessRevoked(input) {
      let value = unsavedStash?.purge() ?? 0;
      stashedSlideOffers.clear(), offeredSlideIds.clear(), keptSlideVersions.clear(), emitEvent("stash-purged", {
        why: input,
        entries: value
      });
    }
    function markSlideDirtyAgainstBase(input, options2, context = options2 === null ? "deleted" : "edited") {
      let value = (0, runtime2.slideIdFromFilePath)(input);
      if (value === void 0)
        return;
      let entry = slideConflicts.get(input), state = {
        path: input,
        slideId: value,
        theirsSha: options2,
        kind: entry?.kind === "landed-over" ? "landed-over" : context
      };
      slideConflicts.set(input, state), dirtySlidePaths.add(input), entry === void 0 && emitEvent("clash", state), timers.setTimeout(() => retryDirtySlide(input), 0), notifySaveSubscribers();
    }
    let dirtyButUnsendablePaths = /* @__PURE__ */ new Set();
    function clearSlideConflict(input) {
      let value = slideConflicts.delete(input);
      dirtyButUnsendablePaths.delete(input), remoteSeenWhilePublishing.delete(input), rebasedSlideShas.delete(input), value && notifySaveSubscribers();
    }
    let rebasedSlideShas = /* @__PURE__ */ new Map();
    function retryDirtySlide(input) {
      if (disposed || !slideConflicts.has(input))
        return;
      decompositionPending && flushPendingDecomposition();
      let entry = slideConflicts.get(input);
      if (entry === void 0)
        return;
      let value = slideDocumentPathForFile(input);
      if (inFlightSlidePaths.has(input) && !saveQueue.unsendable().has(input) && !(stuckSave !== void 0 && !stuckSave.retryable))
        return;
      if (LOCAL_SLIDE_RECOVERY_ORIGIN === "mine") {
        let value3 = entry.theirsSha === null && typeof localSlideOverrides.get(input) == "string";
        value3 && restoreMissingIndexSlides([entry.slideId]), resolveSlideConflict(input, "mine", !0), value3 && recomposeFromFiles(!1);
        return;
      }
      if (value !== void 0 && (options.holdRemote?.(value) === !0 || options.inSlide?.(value) === !0))
        return;
      let value2 = getSlideNumber(entry.slideId);
      remotePathRevisions.set(input, (remotePathRevisions.get(input) ?? 0) + 1), resolveSlideConflict(input, "theirs", !0), options.onNotice?.((value2 > 0 ? "幻灯片 " + String(value2) : "A slide") + (entry.theirsSha === null ? " deleted remotely" : " changed remotely"));
    }
    function clashLocalSlide(input) {
      let value = (0, runtime2.slideFilePath)(input);
      return decompositionPending && flushPendingDecomposition(), timers.clearTimeout(idleCommitTimer), idleCommitTimer = void 0, !dirtySlidePaths.has(value) || inFlightSlidePaths.has(value) ? slideConflicts.has(value) : (markSlideDirtyAgainstBase(value, liveSlideFiles.get(value)?.sha ?? null, "undo"), !0);
    }
    function copyConflictingSlide(input) {
      decompositionPending && flushPendingDecomposition();
      let value = envelope.content.slides[input];
      if (value === void 0 || contentUnbuildable)
        return;
      let value2 = createRestoredSlideId(input), items = [...envelope.content.order], value3 = items.indexOf(input);
      return items.splice(value3 < 0 ? items.length : value3 + 1, 0, value2), updateLocalEnvelope({
        ...envelope,
        content: {
          ...envelope.content,
          order: items,
          slides: {
            ...envelope.content.slides,
            [value2]: {
              ...value,
              id: value2
            }
          }
        }
      }), flushPendingDecomposition(), value2;
    }
    function resolveSlideConflict(input, options2, context = !1) {
      let entry = slideConflicts.get(input);
      if (entry === void 0)
        return;
      let value;
      if (options2 === "copy" && (value = copyConflictingSlide(entry.slideId), value === void 0))
        return;
      slideConflicts.delete(input), heldRemoteSlideBases.delete(input);
      let entry2 = liveSlideFiles.get(input), value2 = deletionConflicts.has(input) && remoteSeenWhilePublishing.has(input), entry3 = remoteSeenWhilePublishing.get(input), value3 = value2 ? entry2?.text : localSlideOverrides.get(input) ?? void 0, value4 = value2 ? entry3?.text : entry2?.text;
      if (remoteSeenWhilePublishing.delete(input), deletionConflicts.delete(input), emitEvent("resolve", {
        path: input,
        keep: options2,
        ...value2 ? {
          landedOverTheirs: !0
        } : {},
        ...value !== void 0 ? {
          copy: value
        } : {}
      }), emitEvent("clash-decision", {
        path: input,
        slide: entry.slideId,
        kind: entry.kind,
        chose: options2,
        ...value !== void 0 ? {
          mineIsNowSlide: value
        } : {}
      }), options2 === "theirs" || options2 === "copy") {
        if (bumpSlideLocalRevision(input), stashedSlideOffers.delete(entry.slideId), offeredSlideIds.delete(entry.slideId), context || clearStashedSlide(entry.slideId, options2 === "copy" ? "kept as a copy" : "theirs was chosen"), options2 === "theirs" && !context && keepSlideVersion(entry.slideId, value3, "theirs-chosen"), saveQueue.resolveConflict(input, "theirs"), saveQueue.unsendable().has(input) && (saveQueue.withdraw(input), inFlightSlidePaths.delete(input)), value2) {
          localSlideOverrides.set(input, entry3 == null ? null : entry3.text), dirtySlidePaths.add(input), entry2 !== void 0 ? knownSlideShas.set(input, entry2.sha) : knownSlideShas.delete(input), recomposeFromFiles(!0), commitChanges("clash-resolved");
          return;
        }
        localSlideOverrides.delete(input), dirtySlidePaths.delete(input), entry2 !== void 0 ? knownSlideShas.set(input, entry2.sha) : (knownSlideShas.delete(input), indexStore.get().order.includes(entry.slideId) && indexStore.update((input2) => void input2.order.splice(input2.order.indexOf(entry.slideId), 1))), recomposeFromFiles(!0), (value !== void 0 || indexStore.dirty()) && commitChanges("clash-resolved");
        return;
      }
      if (context && !localSlideOverrides.has(input)) {
        dirtySlidePaths.delete(input), dirtyButUnsendablePaths.delete(input), rebasedSlideShas.delete(input);
        try {
          saveQueue.resolveConflict(input, "theirs");
        } catch {
        }
        notifySaveSubscribers();
        return;
      }
      context || keepSlideVersion(entry.slideId, value4, "mine-chosen");
      let value5 = context && entry.theirsSha !== (entry2?.sha ?? null) ? entry.theirsSha : entry2?.sha ?? null;
      if (value5 !== null ? knownSlideShas.set(input, value5) : knownSlideShas.delete(input), value5 !== (entry2?.sha ?? null) && rebasedSlideShas.set(input, value5), value2 && (localSlideOverrides.get(input) ?? null) === (entry2?.text ?? null)) {
        dirtySlidePaths.delete(input), localSlideOverrides.delete(input), notifySaveSubscribers();
        return;
      }
      if (dirtySlidePaths.add(input), context && dirtyButUnsendablePaths.delete(input))
        return scheduleIdleCommit(), scheduleMaxWaitCommit(), notifySaveSubscribers();
      dirtyButUnsendablePaths.delete(input), commitChanges("clash-resolved");
    }
    function putBackOverwrittenSlide(input) {
      let entry = overwrittenSlideText.get(input), value = (0, runtime2.slideIdFromFilePath)(input);
      if (entry === void 0 || value === void 0)
        return;
      overwrittenSlideText.delete(input), keptSlideVersions.get(value)?.why === "overwritten" && dropKeptSlideVersion(value, "put back");
      let entry2 = liveSlideFiles.get(input);
      emitEvent("clash-decision", {
        path: input,
        slide: value,
        kind: "overwritten-by-a-simultaneous-save",
        chose: "put mine back"
      }), localSlideOverrides.set(input, entry), dirtySlidePaths.add(input), entry2 !== void 0 ? knownSlideShas.set(input, entry2.sha) : knownSlideShas.delete(input), recomposeFromFiles(!0), commitChanges("put-back");
    }
    let remoteApplyChain = Promise.resolve();
    function enqueueRemoteChange(input, options2 = 0) {
      loadState === "loading" && (remoteChangedWhileLoading = !0);
      let value = remoteApplyChain.then(() => applyRemoteChange(input, options2));
      return remoteApplyChain = value.catch(() => {
      }), value;
    }
    let remoteRereadDelays = [5e3, 2e4];
    async function applyRemoteChange(input, options2) {
      if (disposed)
        return;
      for (; loadState === "loading"; ) {
        let value3 = readyPromise;
        if (await value3, value3 === readyPromise)
          break;
      }
      if (disposed)
        return;
      if (loadState !== "live")
        return void emitEvent("remote-skipped", {
          to: input.to.version,
          why: "the load failed; its retry reads the newest version"
        });
      let value = input.changed.filter((input2) => input2.path === runtime2.DECK_METADATA_PATH || (0, runtime2.slideIdFromFilePath)(input2.path) !== void 0);
      if (value.length === 0)
        return;
      let entries = /* @__PURE__ */ new Map(), items = [], value2 = value.some((input2) => input2.path === runtime2.DECK_METADATA_PATH && input2.sha256 !== null);
      if (newDeckUsesCssLists = !1, await readFilesConcurrently(value.filter((input2) => input2.path !== runtime2.DECK_METADATA_PATH), async (input2) => {
        if (input2.sha256 === null)
          return void (liveSlideFiles.has(input2.path) || localSlideOverrides.has(input2.path) ? entries.set(input2.path, null) : void 0);
        try {
          let value3 = await readTextWithRetries(input2.path);
          entries.set(input2.path, {
            text: value3.text,
            sha: options2 > 0 ? value3.sha256 : input2.sha256
          });
        } catch (value3) {
          console.warn("slides (files): could not read " + input2.path + " after a remote change", value3), items.push(input2);
        }
      }), items.length > 0 && options2 < remoteRereadDelays.length) {
        emitEvent("remote-reread", {
          paths: items.map((input2) => input2.path),
          inMs: remoteRereadDelays[options2]
        });
        let entries2 = new Map(items.map((input2) => [
          input2.path,
          remotePathRevisions.get(input2.path) ?? 0
        ]));
        timers.setTimeout(() => {
          let value3 = items.filter((input2) => (remotePathRevisions.get(input2.path) ?? 0) === entries2.get(input2.path));
          !disposed && value3.length > 0 && enqueueRemoteChange({
            ...input,
            changed: value3
          }, options2 + 1);
        }, remoteRereadDelays[options2]);
      }
      value2 && decompositionPending && flushPendingDecomposition();
      let flag = !1;
      if (value2) {
        let items2 = [...indexStore.base().order];
        try {
          await indexStore.reloadAndMerge(), flag = !(0, runtime2.stringArraysEqual)(items2, indexStore.base().order);
        } catch (value3) {
          if (console.warn("slides (files): could not read " + runtime2.DECK_METADATA_PATH + " after a remote change", value3), options2 < remoteRereadDelays.length) {
            let value4 = value.find((input2) => input2.path === runtime2.DECK_METADATA_PATH);
            emitEvent("remote-reread", {
              paths: [runtime2.DECK_METADATA_PATH],
              inMs: remoteRereadDelays[options2]
            }), timers.setTimeout(() => {
              disposed || enqueueRemoteChange({
                ...input,
                changed: [value4]
              }, options2 + 1);
            }, remoteRereadDelays[options2]);
          }
        }
      }
      if (disposed)
        return;
      decompositionPending && flushPendingDecomposition();
      let flag2 = !1;
      for (let [value3, value4] of entries) {
        let entry = liveSlideFiles.get(value3);
        if (entry !== void 0 && value4 !== null && entry.sha === value4.sha && entry.text === value4.text) {
          entries.delete(value3);
          continue;
        }
        value4 === null ? liveSlideFiles.delete(value3) : liveSlideFiles.set(value3, value4), rebasedSlideShas.delete(value3), (entry === void 0 && value4 !== null || entry !== void 0 && value4 === null) && (flag2 = !0), remotePathRevisions.set(value3, (remotePathRevisions.get(value3) ?? 0) + 1);
        let value5 = dirtySlidePaths.has(value3) || inFlightSlidePaths.has(value3), entry2 = recentPublishedSlideText.get(value3);
        if (overwrittenSlideText.has(value3) && (value4?.text ?? null) === overwrittenSlideText.get(value3)) {
          overwrittenSlideText.delete(value3);
          let value8 = (0, runtime2.slideIdFromFilePath)(value3);
          keptSlideVersions.get(value8)?.why === "overwritten" && dropKeptSlideVersion(value8, "mine came back"), options.onOverwritten?.({
            path: value3,
            slideId: value8,
            slideNo: getSlideNumber(value8),
            settled: !0
          });
        } else if (options.onOverwritten !== void 0 && !value5 && entry2 !== void 0 && timers.now() - entry2.at <= SLIDES_FILES_ERROR_NOTIFY_MS && (value4?.text ?? null) !== entry2.text && entry?.text === entry2.text) {
          let value8 = (0, runtime2.slideIdFromFilePath)(value3);
          overwrittenSlideText.set(value3, entry2.text), keepSlideVersion(value8, entry2.text, "overwritten"), emitEvent("clash-decision", {
            path: value3,
            slide: value8,
            what: "a save made at the same moment as mine replaced mine " + String(timers.now() - entry2.at) + ' ms after it landed; told, with "Put mine back"'
          });
          try {
            options.onOverwritten?.({
              path: value3,
              slideId: value8,
              slideNo: getSlideNumber(value8),
              settled: !1
            });
          } catch {
          }
        }
        if (recentPublishedSlideText.delete(value3), value5) {
          (localSlideOverrides.get(value3) ?? null) === (value4?.text ?? null) ? (dirtySlidePaths.delete(value3), localSlideOverrides.delete(value3), applyRemoteSlideFile(value3, value4), clearSlideConflict(value3), value4 === null && (saveQueue.withdraw(value3), inFlightSlidePaths.delete(value3), followDeleteWithIndex()), inFlightSlidePaths.has(value3) || clearStashedSlide((0, runtime2.slideIdFromFilePath)(value3), "published")) : (inFlightSlidePaths.has(value3) && remoteSeenWhilePublishing.set(value3, value4), inFlightSlidePaths.has(value3) || dirtyButUnsendablePaths.add(value3), markSlideDirtyAgainstBase(value3, value4?.sha ?? null, value4 === null ? "deleted" : "edited"));
          continue;
        }
        let value6 = slideDocumentPathForFile(value3);
        if (value6 !== void 0 && (options.holdRemote?.(value6) === !0 || options.inSlide?.(value6) === !0)) {
          heldRemoteSlideBases.has(value3) || heldRemoteSlideBases.set(value3, entry?.text ?? null);
          continue;
        }
        let value7 = heldRemoteSlideBases.has(value3) ? heldRemoteSlideBases.get(value3) ?? null : entry?.text ?? null;
        heldRemoteSlideBases.delete(value3), applyRemoteSlideFile(value3, value4), value7 !== (value4?.text ?? null) && bumpSlideLocalRevision(value3);
      }
      if (!(entries.size === 0 && !value2)) {
        if (LOCAL_SLIDE_RECOVERY_ORIGIN === "mine") {
          let value3 = [.../* @__PURE__ */ new Set([...dirtySlidePaths, ...inFlightSlidePaths])].map((input2) => typeof localSlideOverrides.get(input2) == "string" ? (0, runtime2.slideIdFromFilePath)(input2) : void 0).filter((input2) => input2 !== void 0 && !indexStore.get().order.includes(input2) && previousSlideById.has(input2));
          value3.length > 0 && (restoreMissingIndexSlides(value3), indexStore.dirty() && scheduleIdleCommit());
        }
        (flag || flag2) && (structureRevision += 1), emitEvent("remote-applied", {
          paths: [...entries.keys()],
          index: value2,
          to: input.to.version,
          ...flag || flag2 ? {
            structureRev: structureRevision
          } : {}
        }), recomposeFromFiles(!0);
      }
    }
    function replayMergedOrderChanges(input, options2, context) {
      let value = (0, runtime2.longestCommonSubsequence)(input, options2);
      if (value.length === 0)
        return;
      let value2 = value.filter((input2) => !context.order.includes(input2));
      if (value2.length > 0) {
        let value5 = options2.indexOf(value2[0]) + 1, value6 = value2.length === 1 ? (0, runtime2.formatMessage)({
          defaultMessage: "移动期间第 {slide} 页被其他人删除，本次移动已取消。",
          id: "vFiNluHEmi"
        }, {
          slide: String(value5)
        }) : (0, runtime2.formatMessage)({
          defaultMessage: "移动期间有 {count} 页被其他人删除，本次移动已取消。",
          id: "7MkhoFus3F"
        }, {
          n: value2.length,
          count: String(value2.length)
        });
        emitEvent("clash-decision", {
          what: "my move of a slide someone deleted was dropped (delete wins)",
          slides: value2
        }), options.onNotice?.(value6);
        return;
      }
      if (context.lost.length === 0)
        return;
      let value3 = context.lost.length === 1, value4 = context.order.indexOf(context.lost[0]) + 1;
      emitEvent("clash-decision", {
        what: "we both moved the same slide; theirs landed first and was kept, my move of it was not applied",
        slides: context.lost
      }), options.onNotice?.(value3 ? (0, runtime2.formatMessage)({
        defaultMessage: "其他人同时移动了第 {slide} 页，已保留对方的操作。如仍需调整，请再次移动。",
        id: "1Wp0sYgdsW"
      }, {
        slide: String(value4)
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "其他人同时移动了其中 {count} 页，已保留对方的操作。如仍需调整，请再次移动。",
        id: "OWDzHwm7Uw"
      }, {
        n: context.lost.length,
        count: String(context.lost.length)
      }));
    }
    let previousSlideById = /* @__PURE__ */ new Map(), stashedPreviousSlideById = /* @__PURE__ */ new Map(), sectionIdByStartSlide = /* @__PURE__ */ new Map();
    function restoreMissingIndexSlides(input) {
      input.every((input2) => indexStore.get().order.includes(input2)) || indexStore.update((input2) => {
        for (let value of input) {
          if (input2.order.includes(value))
            continue;
          let previousOf = (input3) => previousSlideById.has(input3) ? previousSlideById.get(input3) : stashedPreviousSlideById.get(input3), entry = previousOf(value);
          for (let index4 = 0; typeof entry == "string" && !input2.order.includes(entry) && index4 < 1e4; index4++)
            entry = previousOf(entry);
          let position = typeof entry == "string" ? input2.order.indexOf(entry) : -1, value2 = entry === null ? 0 : position < 0 ? input2.order.length : position + 1;
          input2.order.splice(value2, 0, value);
          let entry2 = sectionIdByStartSlide.get(value), value3 = entry2 === void 0 ? void 0 : input2.sections[entry2];
          typeof value3 == "object" && value3 !== null && value2 + 1 < input2.order.length && value3.start === input2.order[value2 + 1] && (value3.start = value);
        }
      });
    }
    function applyRemoteSlideFile(input, options2) {
      options2 === null ? knownSlideShas.delete(input) : knownSlideShas.set(input, options2.sha);
    }
    function releaseRemoteHold(input) {
      decompositionPending && flushPendingDecomposition();
      let value = input.startsWith(runtime2.SLIDE_STORE_COLLECTION + "/") ? input.slice(runtime2.SLIDE_STORE_COLLECTION.length + 1) : void 0, value2 = value !== void 0 ? (0, runtime2.slideFilePath)(value) : void 0;
      if (value2 !== void 0 && heldRemoteSlideBases.has(value2) && options.inSlide?.(input) !== !0) {
        let value3 = heldRemoteSlideBases.get(value2) ?? null;
        heldRemoteSlideBases.delete(value2), dirtySlidePaths.has(value2) || inFlightSlidePaths.has(value2) ? markSlideDirtyAgainstBase(value2, liveSlideFiles.get(value2)?.sha ?? null, liveSlideFiles.has(value2) ? "edited" : "deleted") : (applyRemoteSlideFile(value2, liveSlideFiles.get(value2) ?? null), value3 !== (liveSlideFiles.get(value2)?.text ?? null) && bumpSlideLocalRevision(value2), recomposeFromFiles(!0));
      }
      value2 !== void 0 && retryDirtySlide(value2), commitChanges("hold-released");
    }
    let earlySlide, earlySlideSubscribers = /* @__PURE__ */ new Set(), bootGeneration = 0;
    function setEarlySlide(input) {
      if (earlySlide !== input) {
        earlySlide = input;
        for (let value of [...earlySlideSubscribers])
          try {
            value();
          } catch {
          }
      }
    }
    function createEarlySlideReader(input, options2) {
      let callback = (input2, options3) => {
        try {
          return input2();
        } catch {
          return options3;
        }
      }, value, value2, flag = !1, entries = /* @__PURE__ */ new Map(), callback2 = (input2, options3) => {
        if (flag || disposed || options2 !== bootGeneration || loadState !== "loading")
          return;
        if (input2 === runtime2.DECK_METADATA_PATH) {
          if (value !== void 0)
            return;
          let value5 = callback(() => {
            let value6 = JSON.parse(options3);
            return typeof value6.v != "number" || value6.v > runtime2.DECK_METADATA_VERSION ? null : (value = (0, runtime2.normalizeDeckMetadata)(value6), input.landing(value.order));
          }, null);
          if (value5 === null || (0, runtime2.slideIdFromFilePath)((0, runtime2.slideFilePath)(value5)) === void 0)
            return flag = !0, void entries.clear();
          value2 = (0, runtime2.slideFilePath)(value5);
          for (let value6 of [...entries.keys()])
            value6 !== value2 && entries.delete(value6);
        } else
          (value2 === void 0 || input2 === value2) && entries.set(input2, options3);
        if (value === void 0 || value2 === void 0)
          return;
        let entry = entries.get(value2);
        if (entry === void 0)
          return;
        flag = !0, entries.clear();
        let value3 = (0, runtime2.slideIdFromFilePath)(value2), value4 = callback(() => {
          if (input.allowed?.() === !1)
            return;
          let value5 = (0, runtime2.createSlidesFileCodec)((0, runtime2.createSlideDocumentCodec)().codec, {
            notesInFiles: notesStoredInFiles
          }).compose({
            files: /* @__PURE__ */ new Map([[value2, entry]]),
            index: {
              ...value,
              order: [value3]
            },
            designSystems: designSystemTracker.current()
          }, void 0);
          return input.parse(value5.content);
        }, void 0);
        value4?.slides[value3] !== void 0 && setEarlySlide({
          id: value3,
          content: value4
        });
      };
      return (input2, options3) => (!flag && (input2 === runtime2.DECK_METADATA_PATH || input2.startsWith(runtime2.SLIDE_FILE_DIRECTORY)) && options3.then((input3) => callback2(input2, input3.text), () => {
      }), options3);
    }
    async function readFilesConcurrently(items, options2) {
      let index4 = 0, callback = async () => {
        for (; index4 < items.length; )
          await options2(items[index4++]);
      };
      await Promise.all(Array.from({
        length: Math.min(SLIDES_FILES_MAX_RECOVERY_ATTEMPTS, items.length)
      }, callback));
    }
    let bootRetryDelays = [2e3, 5e3, 15e3], bootRetryAttempt = 0, bootRetryTimer, bootRetryPending = !1, bootFailure, bootFailureAt = timers.now(), unbuildableAttempts = 0, unbuildableRetryDelay = () => unbuildableAttempts > 1 ? runtime2.FILES_BOOT_PERMANENT_RETRY_MS : bootRetryDelays[0], remoteChangedWhileLoading = !1, retryLoadForNewVersion = (input) => {
      input === 0 ? retryLoad("another version arrived") : bootRetryTimer === void 0 && (bootRetryTimer = timers.setTimeout(() => {
        bootRetryTimer = void 0, retryLoad("another version arrived");
      }, input));
    }, waitingForReadableListing = !1, canTreatMissingListingAsEmpty = (state) => state instanceof runtime2.BootReadError && state.status === 404 && state.path === "_files.json", listingRetryDelays = [5e3, 2e4, 6e4], listingRetryTimer, listingRetryPromise;
    function retryReadableListing() {
      return listingRetryPromise ??= options.port.list().then(() => !0, () => !1).then((input) => (listingRetryPromise = void 0, !input || disposed || !waitingForReadableListing ? !1 : (timers.clearTimeout(listingRetryTimer), listingRetryTimer = void 0, waitingForReadableListing = !1, emitEvent("load-retry", {
        why: "a file listing appeared"
      }), setLoadState("loading"), readyPromise = loadDocument(), !0))), listingRetryPromise;
    }
    function retryMissingListingOnHotUpdate() {
      disposed || !waitingForReadableListing || retryReadableListing();
    }
    function scheduleListingRetry(input = 0) {
      waitingForReadableListing && (timers.clearTimeout(listingRetryTimer), listingRetryTimer = timers.setTimeout(() => {
        listingRetryTimer = void 0, !(disposed || !waitingForReadableListing) && retryReadableListing().then((input2) => {
          input2 || scheduleListingRetry(input + 1);
        });
      }, listingRetryDelays[Math.min(input, listingRetryDelays.length - 1)]));
    }
    async function readBootIndex() {
      let value = await (0, runtime2.retryFileRead)(() => options.port.list(), timers).catch(() => null);
      if (value === null || (0, runtime2.fileListingIsNarrowed)(value, options.port) || options.port.narrowed === !0)
        return null;
      let values = new Set(value.map((input) => input.path));
      if (!values.has("index.html") || values.has(runtime2.DECK_METADATA_PATH))
        return null;
      let entries = /* @__PURE__ */ new Map(), index4 = 0;
      for (let value2 of value) {
        if (!value2.path.startsWith(runtime2.SLIDE_FILE_DIRECTORY) || (0, runtime2.slideIdFromFilePath)(value2.path) === void 0)
          continue;
        index4 += 1;
        let value3 = await readTextWithRetries(value2.path).catch(() => null);
        value3 !== null && entries.set(value2.path, {
          text: value3.text,
          sha256: value2.sha256 ?? value3.sha256
        });
      }
      return {
        narrowed: !1,
        index: null,
        files: entries,
        slidesListed: index4
      };
    }
    async function loadDocument() {
      bootFailureAt = timers.now();
      let value = ++bootGeneration;
      contentUnbuildable = !1, remoteChangedWhileLoading = !1, setEarlySlide(void 0);
      try {
        let value2, callback = () => options.port.list().then((input) => (value2 = input, !1), (input) => input?.status === 404), flag = !1;
        if (options.startEmpty === !0 && await callback()) {
          if (await new Promise((input) => {
            timers.setTimeout(input, 1500);
          }), disposed)
            return;
          flag = await callback();
        }
        waitingForReadableListing = flag;
        let value3 = value2, flag2 = !1, value4 = options.firstSlide !== void 0 && !flag ? createEarlySlideReader(options.firstSlide, value) : void 0, value5 = value3 === void 0 && value4 === void 0 ? options.port : new Proxy(options.port, {
          get: (input, options2, context) => options2 === "list" && value3 !== void 0 ? () => flag2 ? input.list() : (flag2 = !0, Promise.resolve(value3)) : options2 === "readText" && value4 !== void 0 ? (input2) => value4(input2, input.readText(input2)) : Reflect.get(input, options2, context)
        }), value6 = flag ? {
          narrowed: !0,
          index: null,
          files: /* @__PURE__ */ new Map()
        } : await (0, runtime2.readFilesBootState)({
          port: value5,
          indexPath: runtime2.DECK_METADATA_PATH,
          wants: (input) => input.path.startsWith(runtime2.SLIDE_FILE_DIRECTORY) && (0, runtime2.slideIdFromFilePath)(input.path) !== void 0,
          timers,
          mayWrite,
          ...options.early !== void 0 ? {
            early: options.early
          } : {},
          onEvent: (input) => emitEvent(input.type, input)
        }).catch(async (input) => {
          if (options.startEmpty === !0 && canTreatMissingListingAsEmpty(input))
            return waitingForReadableListing = !0, {
              narrowed: !0,
              index: null,
              files: /* @__PURE__ */ new Map()
            };
          if (!(options.startEmpty === !0 && input instanceof runtime2.BootReadError && input.code === "no_index"))
            throw input;
          let value7 = await readBootIndex();
          if (value7 === null)
            throw new runtime2.BootReadError("unreadable", runtime2.DECK_METADATA_PATH, runtime2.DECK_METADATA_PATH + " could not be read yet");
          return value7;
        });
        if (earlySlide !== void 0 && options.firstSlide?.painted !== void 0 && (await options.firstSlide.painted().catch(() => {
        }), disposed || value !== bootGeneration) || (listingNarrowed = value6.narrowed === !0 || mayWrite && options.port.narrowed === !0, canWrite = options.port.canWrite && !listingNarrowed, newDeckUsesCssLists = value6.index === null && "slidesListed" in value6 && value6.slidesListed === 0 && canWrite, waitingForReadableListing && scheduleListingRetry(), value6.index === null ? emitEvent("started-empty", {
          why: waitingForReadableListing ? "this page has no file listing at all: read-only" : runtime2.DECK_METADATA_PATH + " is not in this artifact",
          slideFiles: value6.files.size
        }) : indexStore.loadText !== void 0 ? indexStore.loadText(value6.index.text, value6.index.sha256) : await indexStore.load(), notesBySlide = await options.notes?.load() ?? {}, disposed))
          return;
        liveSlideFiles.clear(), knownSlideShas.clear();
        for (let [value7, value8] of value6.files)
          liveSlideFiles.set(value7, {
            text: value8.text,
            sha: value8.sha256
          }), knownSlideShas.set(value7, value8.sha256);
        if (bootRetryAttempt = 0, loadFailureMessage = void 0, bootFailure = void 0, deckLocalRevision += 1, !composeFromFiles())
          throw contentUnbuildable = !0, new SlidesContentUnbuildableError("its content could not be read");
        unbuildableAttempts = 0, loadState = "live", notifyDocumentSubscribers(!0);
        for (let value7 of [...loadSubscribers])
          value7();
        notifySaveSubscribers(), offerStashedSlides(), loadKeptVersions();
      } catch (value2) {
        if (loadFailureMessage = value2 instanceof Error ? value2.message : String(value2?.message ?? value2), bootFailure = value2, console.error("slides (files): load failed (" + (value2 instanceof SlidesContentUnbuildableError ? "unbuildable" : (0, runtime2.classifyFilesBootFailure)(value2)) + ", " + (value2 instanceof Error ? value2.name : "a throw") + (value2 instanceof runtime2.BootReadError ? ", HTTP " + String(value2.status) : "") + ")"), setEarlySlide(void 0), value2 instanceof runtime2.BootReadError && value2.code === "access_revoked" && markReadAccessRevoked("the deck’s files were refused (HTTP " + String(value2.status) + ")"), bootRetryPending = !disposed && (isPermanentSlidesLoadFailure(value2) ? value2 instanceof SlidesContentUnbuildableError && remoteChangedWhileLoading && unbuildableAttempts === 0 : bootRetryAttempt < bootRetryDelays.length), setLoadState("failed"), !disposed && !isPermanentSlidesLoadFailure(value2) && bootRetryAttempt < bootRetryDelays.length) {
          let value3 = bootRetryDelays[bootRetryAttempt++];
          emitEvent("load-failed", {
            error: loadFailureMessage,
            kind: (0, runtime2.classifyFilesBootFailure)(value2),
            retryInMs: value3
          }), timers.clearTimeout(bootRetryTimer), bootRetryTimer = timers.setTimeout(() => {
            bootRetryTimer = void 0, retryLoad("auto");
          }, value3);
        } else
          emitEvent("load-failed", {
            error: loadFailureMessage,
            kind: value2 instanceof SlidesContentUnbuildableError ? "unbuildable" : (0, runtime2.classifyFilesBootFailure)(value2),
            retryInMs: null
          });
        value2 instanceof SlidesContentUnbuildableError && !disposed && (unbuildableAttempts += 1, remoteChangedWhileLoading && retryLoadForNewVersion(unbuildableRetryDelay()));
      }
    }
    function retryLoad(input) {
      loadState !== "failed" || disposed || ((input === "asked" || input === "save") && (unbuildableAttempts = 0), timers.clearTimeout(bootRetryTimer), bootRetryTimer = void 0, emitEvent("load-retry", {
        why: input
      }), bootRetryPending = !1, setLoadState("loading"), readyPromise = loadDocument());
    }
    let readyPromise = loadDocument(), unsubscribeRemoteChange = options.port.onRemoteChange((input) => {
      waitingForReadableListing && retryMissingListingOnHotUpdate(), loadState === "loading" && (remoteChangedWhileLoading = !0);
      let elapsed = timers.now() - bootFailureAt, value = loadState !== "failed" ? void 0 : bootFailure instanceof SlidesContentUnbuildableError ? Math.max(0, unbuildableRetryDelay() - elapsed) : (0, runtime2.filesBootRetryDelayForHotUpdate)(bootFailure, input, runtime2.DECK_METADATA_PATH, elapsed);
      value !== void 0 && retryLoadForNewVersion(value), notifySaveSubscribers();
    });
    options.notes?.onChange?.((input, options2) => {
      disposed || loadState !== "live" || timers.now() - (localNotesChangedAt.get(input) ?? -1 / 0) < 5e3 || notesBySlide[input] === options2 || (options2 === void 0 ? delete notesBySlide[input] : (notesBySlide[input] = options2, locallyEditedNoteIds.add(input)), recomposeFromFiles(!0));
    });
    let notesSyncHeard = options.notes?.heard?.() ?? !0;
    options.notes?.onState?.(() => {
      if (!disposed && (notifySaveSubscribers(), !notesSyncHeard && options.notes?.heard?.() === !0)) {
        notesSyncHeard = !0;
        for (let value of unheardInlineNoteIds)
          notesBySlide[value] !== void 0 && !locallyEditedNoteIds.has(value) && options.notes.set(value, notesBySlide[value]);
        unheardInlineNoteIds.clear(), loadState === "live" && recomposeFromFiles(!1);
      }
    });
    let emptyComments = [], emptyCommentSync = {
      status: "idle",
      pending: 0
    }, documentAdapter = {
      saveMode: () => "auto",
      state: () => envelope,
      content: () => envelope.content,
      title: () => envelope.title,
      comments: () => emptyComments,
      dirty: () => pendingSaveCount() > 0,
      readOnly: () => !canWrite || contentUnbuildable,
      saveState: getSaveState,
      saveTroubleWords: () => {
        let value = describeSaveState(!0);
        return value.status === "error" ? value.message : void 0;
      },
      commentSync: () => emptyCommentSync,
      pendingCommentIds: () => /* @__PURE__ */ new Set(),
      retryCommentPublish: () => {
      },
      setContent(input) {
        input !== envelope.content && (updateLocalEnvelope({
          ...envelope,
          content: input
        }), (0, runtime2.recordArtifactEdit)());
      },
      updateContent(input, options2) {
        let value = input(envelope.content);
        value !== envelope.content && (updateLocalEnvelope({
          ...envelope,
          content: value
        }), options2?.auto !== !0 && (0, runtime2.recordArtifactEdit)());
      },
      setTitle(input) {
        let value = (0, runtime2.normalizeTitleInput)(input);
        value.length === 0 || value === envelope.title || (updateLocalEnvelope({
          ...envelope,
          title: value
        }), (0, runtime2.recordArtifactEdit)(), commitChanges("title"));
      },
      addComment: () => {
      },
      removeComment: () => {
      },
      documentBytes() {
        let index4 = 0;
        for (let value of liveSlideFiles.values())
          index4 += value.text.length;
        return index4;
      },
      async save() {
        if (loadState === "failed")
          return void retryLoad("save");
        commitChanges("save"), options.notes?.retry?.(), saveQueue.flushNow(), saveQueue.retryNow(), await saveQueue.settle();
      },
      stashOffer: () => {
      },
      restoreStash: () => {
      },
      discardStash: () => {
      },
      restoreCount: () => 0,
      subscribe(input) {
        return documentSubscribers.add(input), () => documentSubscribers.delete(input);
      },
      subscribeSave(input) {
        return saveSubscribers.add(input), () => saveSubscribers.delete(input);
      },
      loadState: () => loadState,
      shown: () => loadState === "live",
      cachedSettled: () => !1,
      subscribeLoad(input) {
        return loadSubscribers.add(input), () => loadSubscribers.delete(input);
      },
      flushNow: () => commitChanges("flush-now"),
      retryLoad: () => retryLoad("asked"),
      storeUntouched: () => !1,
      releaseHold: releaseRemoteHold,
      syncDetail: () => ({
        pending: pendingSaveCount(),
        inflight: inFlightSlidePaths.values().next().value ?? null,
        flights: inFlightSlidePaths.size > 0 ? 1 : 0,
        ...lastSyncedAt !== void 0 ? {
          lastSyncedAt
        } : {}
      }),
      dispose() {
        disposed = !0, timers.clearTimeout(idleCommitTimer), timers.clearTimeout(maxWaitCommitTimer), timers.clearTimeout(stashOfferTimer), timers.clearTimeout(bootRetryTimer), timers.clearTimeout(listingRetryTimer), unsubscribeRemoteChange(), saveQueue.dispose();
      },
      commit: commitChanges,
      flushForUnload,
      settle: async () => {
        decompositionPending && flushPendingDecomposition(), await saveQueue.settle();
      },
      ready: () => readyPromise,
      applyRemote: enqueueRemoteChange,
      paused: () => contentUnbuildable && loadState === "live" ? {
        mayEdit: canWrite
      } : void 0,
      conflicts: () => [...slideConflicts.values()],
      resolveConflict: (input, options2) => resolveSlideConflict(input, options2),
      stashOffers: getStashOffers,
      restoreStashed: restoreStashedSlide,
      discardStashed: discardStashedSlide,
      putBack: putBackOverwrittenSlide,
      keptVersions: getKeptSlideVersions,
      restoreKeptAsCopy: restoreKeptSlideAsCopy,
      dismissKept: (input) => dropKeptSlideVersion(input, "dismissed"),
      slideRev: (input) => remotePathRevisions.get((0, runtime2.slideFilePath)(input)) ?? 0,
      structureRev: () => structureRevision,
      takeTouched: takeTouchedPaths,
      clashLocal: clashLocalSlide,
      knownShas: () => new Map([
        ...[...liveSlideFiles].map(([input, input2]) => [
          input,
          input2.sha
        ])
      ]),
      debugFiles() {
        return [
          .../* @__PURE__ */ new Set([
            ...liveSlideFiles.keys(),
            ...localSlideOverrides.keys()
          ])
        ].sort().map((input) => {
          let value = (0, runtime2.slideIdFromFilePath)(input), value2 = [
            dirtySlidePaths.has(input) ? "unsaved" : "",
            inFlightSlidePaths.has(input) ? "sending" : "",
            slideConflicts.has(input) ? "clash (" + slideConflicts.get(input).kind + ")" : "",
            heldRemoteSlideBases.has(input) ? "remote held under the caret" : "",
            localSlideOverrides.get(input) === null ? "deleted here" : "",
            value !== void 0 && unsavedStash?.read(value) !== void 0 ? stashedSlideOffers.has(value) ? "stash from an earlier session" : "stashed" : "",
            overwrittenSlideText.has(input) ? "mine was replaced (kept)" : "",
            value !== void 0 && keptSlideVersions.has(value) ? "a version set aside (" + keptSlideVersions.get(value).why + ")" : ""
          ].filter((input2) => input2 !== ""), value3 = localSlideOverrides.has(input) ? localSlideOverrides.get(input) : liveSlideFiles.get(input)?.text;
          return {
            path: input,
            sha: knownSlideShas.get(input) ?? null,
            liveSha: liveSlideFiles.get(input)?.sha ?? null,
            size: typeof value3 == "string" ? value3.length : 0,
            state: value2.join(", ") + (remotePathRevisions.has(input) ? (value2.length > 0 ? " · " : "") + "remote rev " + String(remotePathRevisions.get(input)) : "")
          };
        });
      },
      debugQueue: () => ({
        dirty: [
          ...dirtySlidePaths,
          ...indexStore.dirty() ? [runtime2.DECK_METADATA_PATH] : []
        ],
        inFlight: gestureActive,
        ...lastSaveError !== void 0 ? {
          lastError: lastSaveError
        } : {},
        conflicted: [...slideConflicts.keys()],
        note: "sending: " + ([...inFlightSlidePaths].join(", ") || "nothing") + " · idle commit " + (idleCommitTimer !== void 0 ? "armed (" + String(SLIDES_FILES_SAVE_DEBOUNCE_MS) + " ms)" : "off") + " · max-wait " + (maxWaitCommitTimer !== void 0 ? "armed (" + String(SLIDES_FILES_SHARED_MAX_WAIT_MS) + " ms)" : "off") + " · commit owed: " + String(commitOwed) + " · stuck: " + (stuckSave !== void 0 ? stuckSave.code + " x" + String(stuckSave.attempts) : "no") + " · publishes in the last minute " + String(recentPublishTimes.length) + " (max-wait now " + String(getMaxCommitWait()) + " ms) · structure rev " + String(structureRevision) + " · stash: " + (unsavedStash?.kind ?? "none")
      }),
      queue: saveQueue,
      index: indexStore,
      earlySlide: () => earlySlide,
      subscribeEarly(input) {
        return earlySlideSubscribers.add(input), () => {
          earlySlideSubscribers.delete(input), earlySlideSubscribers.size === 0 && loadState === "live" && (earlySlide = void 0);
        };
      }
    };
    return (0, runtime2.registerSlideDocumentCodec)(documentAdapter, codecState), documentAdapter;
  }
  return bindRuntimeValue(runtime2, "slidesFilesTimers", () => slidesFilesTimers, (value) => {
    slidesFilesTimers = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_SAVE_DEBOUNCE_MS", () => SLIDES_FILES_SAVE_DEBOUNCE_MS, (value) => {
    SLIDES_FILES_SAVE_DEBOUNCE_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_SHARED_MAX_WAIT_MS", () => SLIDES_FILES_SHARED_MAX_WAIT_MS, (value) => {
    SLIDES_FILES_SHARED_MAX_WAIT_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_SOLO_MAX_WAIT_MS", () => SLIDES_FILES_SOLO_MAX_WAIT_MS, (value) => {
    SLIDES_FILES_SOLO_MAX_WAIT_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_MAX_PARALLEL_READS", () => SLIDES_FILES_MAX_PARALLEL_READS, (value) => {
    SLIDES_FILES_MAX_PARALLEL_READS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_BOOT_REFRESH_MS", () => SLIDES_FILES_BOOT_REFRESH_MS, (value) => {
    SLIDES_FILES_BOOT_REFRESH_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_RECONNECT_TIMEOUT_MS", () => SLIDES_FILES_RECONNECT_TIMEOUT_MS, (value) => {
    SLIDES_FILES_RECONNECT_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_STALE_SYNC_TIMEOUT_MS", () => SLIDES_FILES_STALE_SYNC_TIMEOUT_MS, (value) => {
    SLIDES_FILES_STALE_SYNC_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_ERROR_NOTIFY_MS", () => SLIDES_FILES_ERROR_NOTIFY_MS, (value) => {
    SLIDES_FILES_ERROR_NOTIFY_MS = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_MAX_RECOVERY_ATTEMPTS", () => SLIDES_FILES_MAX_RECOVERY_ATTEMPTS, (value) => {
    SLIDES_FILES_MAX_RECOVERY_ATTEMPTS = value;
  }), bindRuntimeValue(runtime2, "LOCAL_SLIDE_RECOVERY_ORIGIN", () => LOCAL_SLIDE_RECOVERY_ORIGIN, (value) => {
    LOCAL_SLIDE_RECOVERY_ORIGIN = value;
  }), bindRuntimeValue(runtime2, "SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS", () => SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS, (value) => {
    SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "slideDocumentPathForFile", () => slideDocumentPathForFile, (value) => {
    slideDocumentPathForFile = value;
  }), bindRuntimeValue(runtime2, "SlidesContentUnbuildableError", () => SlidesContentUnbuildableError, (value) => {
    SlidesContentUnbuildableError = value;
  }), bindRuntimeValue(runtime2, "isPermanentSlidesLoadFailure", () => isPermanentSlidesLoadFailure, (value) => {
    isPermanentSlidesLoadFailure = value;
  }), bindRuntimeValue(runtime2, "createSlidesFilesDocument", () => createSlidesFilesDocument), () => {
    slidesFilesTimers = {
      setTimeout: (input, options) => setTimeout(input, options),
      clearTimeout: (input) => clearTimeout(input),
      now: () => Date.now()
    }, SLIDES_FILES_SAVE_DEBOUNCE_MS = 800, SLIDES_FILES_SHARED_MAX_WAIT_MS = runtime2.FILE_SAVE_DEBOUNCE_POLICY.shared.maxWaitMs, SLIDES_FILES_SOLO_MAX_WAIT_MS = runtime2.FILE_SAVE_DEBOUNCE_POLICY.solo.maxWaitMs, SLIDES_FILES_MAX_PARALLEL_READS = 6, SLIDES_FILES_BOOT_REFRESH_MS = 2500, SLIDES_FILES_RECONNECT_TIMEOUT_MS = 6e4, SLIDES_FILES_STALE_SYNC_TIMEOUT_MS = 1e4, SLIDES_FILES_ERROR_NOTIFY_MS = 3e3, SLIDES_FILES_MAX_RECOVERY_ATTEMPTS = 8, SlidesContentUnbuildableError = class extends Error {
    }, isPermanentSlidesLoadFailure = (input) => input instanceof SlidesContentUnbuildableError || (0, runtime2.isPermanentFilesBootFailure)(input), LOCAL_SLIDE_RECOVERY_ORIGIN = "mine", SLIDES_FILES_PENDING_NOTE_TIMEOUT_MS = 2e4, slideDocumentPathForFile = (input) => {
      let value = (0, runtime2.slideIdFromFilePath)(input);
      if (value !== void 0)
        return runtime2.SLIDE_STORE_COLLECTION + "/" + value;
    };
  };
}
export {
  installFilesSlidesDocument
};
