// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsArtifactDocument(runtime2) {
  var MAX_ARTIFACT_TITLE_CHARS, autoSavingArtifactRuntime, READ_ONLY_ARTIFACT_MESSAGE, ARTIFACT_STASH_PREFIX, ARTIFACT_READ_ONLY_PREFIX;
  function normalizeArtifactTitle(title) {
    if (typeof title == "string" && title.length > 0)
      return (0, runtime2.truncateUtf16Safely)(title, MAX_ARTIFACT_TITLE_CHARS);
  }
  function normalizeTitleInput(title) {
    return (0, runtime2.truncateUtf16Safely)(title.trim(), MAX_ARTIFACT_TITLE_CHARS);
  }
  function createRuntimeArtifactDocument(options) {
    let runtime22 = options.runtime;
    function parseContent(input) {
      try {
        return options.parseContent(input);
      } catch {
        return options.initialContent;
      }
    }
    let defaultTitle = options.defaultTitle ?? "Untitled", snapshot = {
      title: normalizeArtifactTitle(options.snapshot.title) ?? defaultTitle,
      content: parseContent(options.snapshot.content),
      comments: (0, runtime2.normalizeComments)(options.snapshot.comments)
    }, readOnly = runtime22.saving.status === "readonly", contentHoldReason = options.contentHold?.(options.snapshot.content), saveError = runtime22.saving.status === "error" ? runtime22.saving.lastError?.message ?? "Autosave failed — retrying." : void 0, saving = runtime22.saving.status === "saving", pendingCommentIds = /* @__PURE__ */ new Set(), documentSubscribers = /* @__PURE__ */ new Set(), saveSubscribers = /* @__PURE__ */ new Set();
    function getSaveState() {
      return contentHoldReason !== void 0 ? {
        status: "readonly",
        message: contentHoldReason
      } : readOnly ? {
        status: "readonly",
        message: "This view cannot edit the document."
      } : saveError !== void 0 ? {
        status: "error",
        message: saveError
      } : saving || runtime22.saving.pending > 0 ? {
        status: "saving"
      } : {
        status: "ready"
      };
    }
    function notifySubscribers2() {
      for (let value2 of [...documentSubscribers])
        value2();
      let value = getSaveState();
      for (let value2 of [...saveSubscribers])
        value2(value);
    }
    runtime22.saving.onStatus((input, options2) => {
      saving = input === "saving", input === "readonly" && (readOnly = !0), input === "error" ? saveError = options2?.message ?? "Autosave failed — retrying." : (input === "idle" || input === "readonly") && (saveError = void 0), input === "idle" && pendingCommentIds.clear(), notifySubscribers2();
    }), runtime22.doc.observe("", (input) => {
      let flag = !1;
      for (let value of input)
        value.origin !== "local" && (value.key === "title" ? (snapshot.title = normalizeArtifactTitle(value.value) ?? defaultTitle, flag = !0) : value.key === "content" ? (snapshot.content = parseContent(value.value), contentHoldReason = options.contentHold?.(value.value), flag = !0) : value.key === "comments" && (snapshot.comments = (0, runtime2.normalizeComments)(value.value), flag = !0));
      flag && notifySubscribers2();
    });
    let serializeContent = (input) => options.serializeContent !== void 0 ? options.serializeContent(input, snapshot.title) : input;
    function setRuntimeField(input, options2) {
      runtime22.doc.set(input, options2).catch(() => {
        saveError = "Autosave failed — the change may not be stored.", notifySubscribers2();
      });
    }
    return {
      saveMode: () => "auto",
      title: () => snapshot.title,
      setTitle: (input) => {
        if (contentHoldReason !== void 0)
          return;
        let value = normalizeTitleInput(input);
        value.length === 0 || value === snapshot.title || (snapshot.title = value, setRuntimeField("title", value), options.serializeContent !== void 0 && setRuntimeField("content", serializeContent(snapshot.content)), (0, runtime2.recordArtifactEdit)(), notifySubscribers2());
      },
      content: () => snapshot.content,
      setContent: (input) => {
        contentHoldReason !== void 0 || input === snapshot.content || (snapshot.content = input, setRuntimeField("content", serializeContent(input)), (0, runtime2.recordArtifactEdit)(), notifySubscribers2());
      },
      updateContent: (input, options2) => {
        if (contentHoldReason !== void 0)
          return;
        let value = input(snapshot.content);
        value !== snapshot.content && (snapshot.content = value, setRuntimeField("content", serializeContent(value)), options2?.auto !== !0 && (0, runtime2.recordArtifactEdit)(), notifySubscribers2());
      },
      state: () => snapshot,
      comments: () => snapshot.comments,
      addComment: (input) => {
        if (snapshot.comments.length >= runtime2.MAX_ARTIFACT_COMMENTS)
          return;
        let value = (0, runtime2.normalizeComments)([
          {
            ...input,
            id: crypto.randomUUID().slice(0, 8),
            at: Date.now()
          }
        ])[0];
        if (value)
          return snapshot.comments = [...snapshot.comments, value], pendingCommentIds.add(value.id), setRuntimeField("comments", snapshot.comments), notifySubscribers2(), value;
      },
      removeComment: (input) => {
        let value = snapshot.comments.filter((input2) => input2.id !== input);
        value.length !== snapshot.comments.length && (snapshot.comments = value, pendingCommentIds.delete(input), setRuntimeField("comments", snapshot.comments), notifySubscribers2());
      },
      commentSync: () => {
        let size4 = pendingCommentIds.size;
        return readOnly && size4 > 0 ? {
          status: "blocked",
          pending: size4,
          message: "This view cannot edit the document."
        } : saveError !== void 0 && size4 > 0 ? {
          status: "error",
          pending: size4,
          message: saveError
        } : size4 > 0 ? {
          status: "publishing",
          pending: size4
        } : {
          status: "idle",
          pending: 0
        };
      },
      pendingCommentIds: () => new Set(pendingCommentIds),
      retryCommentPublish: () => {
        runtime22.saving.save().catch(() => {
        });
      },
      dirty: () => !1,
      readOnly: () => readOnly || contentHoldReason !== void 0,
      saveState: getSaveState,
      documentBytes: () => new TextEncoder().encode(JSON.stringify(snapshot)).length,
      save: async () => {
        readOnly || (await runtime22.saving.save().catch(() => {
        }), notifySubscribers2());
      },
      stashOffer: () => {
      },
      restoreStash: () => {
      },
      discardStash: () => {
      },
      restoreCount: () => 0,
      subscribe: (input) => (documentSubscribers.add(input), () => documentSubscribers.delete(input)),
      subscribeSave: (input) => (saveSubscribers.add(input), () => saveSubscribers.delete(input))
    };
  }
  function setAutoSavingArtifactRuntime(input) {
    autoSavingArtifactRuntime = input;
  }
  function getAutoSavingArtifactRuntime() {
    return autoSavingArtifactRuntime;
  }
  async function detectAutoSavingArtifactRuntime() {
    if (typeof window > "u")
      return;
    let value = window;
    if (value.appifact !== void 0)
      try {
        let value2 = await value.appifact.ready();
        if (value2.saving.mode !== "auto")
          return;
        let value3 = await value2.doc.getAll();
        setAutoSavingArtifactRuntime({
          runtime: value2,
          snapshot: value3
        });
      } catch (value2) {
        console.error("appifact runtime probe failed — booting the frame model", value2);
      }
  }
  function artifactStashKey(input) {
    return ARTIFACT_STASH_PREFIX + (0, runtime2.normalizeArtifactSessionPath)(input);
  }
  function createSessionStorageSlot(key) {
    return {
      read() {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      },
      write(input) {
        try {
          return sessionStorage.setItem(key, input), !0;
        } catch {
          return !1;
        }
      },
      clear() {
        try {
          sessionStorage.removeItem(key);
        } catch {
        }
      }
    };
  }
  function currentArtifactStash() {
    return createSessionStorageSlot(artifactStashKey(location.pathname));
  }
  function readCurrentArtifactReadOnlyReason() {
    let value = currentArtifactReadOnlySlot().read();
    return value !== null && value.length > 0 ? value : null;
  }
  function currentArtifactReadOnlySlot() {
    return typeof location > "u" ? {
      read: () => null,
      write: () => !1,
      clear: () => {
      }
    } : createSessionStorageSlot(ARTIFACT_READ_ONLY_PREFIX + artifactStashKey(location.pathname).slice(ARTIFACT_STASH_PREFIX.length));
  }
  function hashArtifactState(text) {
    let firstHash = 3735928559, secondHash = 1103547991;
    for (let index4 = 0; index4 < text.length; index4++) {
      let value = text.charCodeAt(index4);
      firstHash = Math.imul(firstHash ^ value, 2654435761), secondHash = Math.imul(secondHash ^ value, 1597334677);
    }
    return firstHash = Math.imul(firstHash ^ firstHash >>> 16, 2246822507) ^ Math.imul(secondHash ^ secondHash >>> 13, 3266489909), secondHash = Math.imul(secondHash ^ secondHash >>> 16, 2246822507) ^ Math.imul(firstHash ^ firstHash >>> 13, 3266489909), (secondHash >>> 0).toString(16).padStart(8, "0") + (firstHash >>> 0).toString(16).padStart(8, "0");
  }
  function parseArtifactStash(text) {
    if (text !== null)
      try {
        let value = JSON.parse(text);
        if (typeof value == "object" && value !== null && (value.v === 2 || value.v === 1) && typeof value.at == "number" && "state" in value) {
          let value2 = value;
          return {
            at: value2.at,
            state: value2.state,
            ops: value2.ops,
            expectEmbed: typeof value2.expectEmbed == "string" ? value2.expectEmbed : void 0
          };
        }
      } catch {
      }
  }
  function parseEmbeddedArtifactState(state, options) {
    let record = typeof state == "object" && state !== null ? state : {}, content;
    try {
      content = options.parseContent(record.content);
    } catch {
      content = options.initialContent;
    }
    return {
      title: normalizeArtifactTitle(record.title) ?? options.defaultTitle ?? "演示文稿",
      content,
      comments: (0, runtime2.normalizeComments)(record.comments)
    };
  }
  function createArtifactDocument(options) {
    let autoSaveRuntime = getAutoSavingArtifactRuntime();
    if (autoSaveRuntime !== void 0 && options.publish === void 0 && options.canPublish === void 0 && options.embeddedState === void 0 && options.pageParts === void 0)
      return createRuntimeArtifactDocument({
        runtime: autoSaveRuntime.runtime,
        snapshot: autoSaveRuntime.snapshot,
        parseContent: options.parseContent,
        ...options.serializeContent !== void 0 ? {
          serializeContent: options.serializeContent
        } : {},
        ...options.contentHold !== void 0 ? {
          contentHold: options.contentHold
        } : {},
        initialContent: options.initialContent,
        ...options.defaultTitle !== void 0 ? {
          defaultTitle: options.defaultTitle
        } : {}
      });
    let pageParts = options.pageParts ?? (0, runtime2.readCompiledPageAnatomy)(globalThis.document), embeddedState = options.embeddedState !== void 0 ? options.embeddedState : (0, runtime2.readCompiledPageDocument)(globalThis.document), stash = options.stash ?? currentArtifactStash(), readOnlyFlag = options.roFlag ?? currentArtifactReadOnlySlot(), canPublish = options.canPublish ?? (0, runtime2.selfPublishAvailable)(), publishedState = parseEmbeddedArtifactState(embeddedState, options), embeddedStateHash = hashArtifactState((0, runtime2.stringifyInlineJson)(serializeEnvelope(publishedState))), localState = publishedState, pendingCommentOperations = [], dirty = !1, restoreCount = 0, saving = !1, saveError, saveErrorCode, hasSaved = !1, reloading = !1, contentHoldReason = options.contentHold?.(embeddedState?.content), readOnly = contentHoldReason !== void 0 || !canPublish, readOnlyAtBoot = !1, readOnlyReason = contentHoldReason ?? (canPublish ? void 0 : "This view’s runtime does not offer self-publish (window.slidesHost.self is absent) — content can be viewed but not saved from here.");
    if (!readOnly) {
      let value = readOnlyFlag.read();
      value !== null && value.length > 0 && (readOnly = !0, readOnlyReason = value);
    }
    let publishingComments = !1, commentPublishError, flag = !1, documentSubscribers = /* @__PURE__ */ new Set(), saveSubscribers = /* @__PURE__ */ new Set();
    function getSaveState() {
      if (readOnly)
        return readOnlyAtBoot ? {
          status: "readonly",
          message: readOnlyReason,
          atBoot: !0
        } : {
          status: "readonly",
          message: readOnlyReason
        };
      let value = saving ? {
        status: "saving"
      } : saveError !== void 0 ? {
        status: "error",
        message: saveError,
        ...saveErrorCode !== void 0 ? {
          code: saveErrorCode
        } : {}
      } : {
        status: dirty ? "dirty" : hasSaved ? "saved" : "ready"
      };
      return reloading ? {
        ...value,
        reloading: !0
      } : value;
    }
    function getCommentSyncState() {
      let length = (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations).length;
      return readOnly && length > 0 ? {
        status: "blocked",
        pending: length,
        message: readOnlyReason
      } : commentPublishError !== void 0 ? {
        status: "error",
        pending: length,
        message: commentPublishError
      } : publishingComments || length > 0 ? {
        status: "publishing",
        pending: length
      } : {
        status: "idle",
        pending: 0
      };
    }
    let notificationOwed = !1;
    function flushOwedNotification() {
      notificationOwed && (notificationOwed = !1, queueMicrotask(() => notifyDocumentSubscribers()));
    }
    function notifyDocumentSubscribers(input) {
      documentSubscribers.size === 0 && (notificationOwed = !0);
      for (let value of documentSubscribers)
        value(input);
      notifySaveSubscribers();
    }
    function notifySaveSubscribers() {
      saveSubscribers.size === 0 && (notificationOwed = !0);
      let value = getSaveState();
      for (let value2 of saveSubscribers)
        value2(value);
    }
    let stashWriteSucceeded = !0, stashOffer, expectedEmbeddedStateHash;
    function writeStash() {
      let value = pendingCommentOperations, value2 = stashOffer ? stashOffer.state : localState;
      return stashWriteSucceeded = stash.write(JSON.stringify({
        v: 2,
        at: stashOffer ? stashOffer.at : Date.now(),
        state: value2,
        ...value.length > 0 ? {
          ops: value
        } : {},
        ...expectedEmbeddedStateHash !== void 0 && !stashOffer ? {
          expectEmbed: expectedEmbeddedStateHash
        } : {}
      })), stashWriteSucceeded;
    }
    {
      let value = parseArtifactStash(stash.read());
      if (value) {
        let value2 = parseEmbeddedArtifactState(value.state, options), callback = (input) => options.serializeContent !== void 0 ? options.serializeContent(input.content, input.title) : input.content, value3 = (0, runtime2.applicableCommentOperations)(publishedState.comments, (0, runtime2.normalizeCommentOperations)(value.ops));
        if (value3.length === 0 && value.ops === void 0) {
          let values = new Set(publishedState.comments.map((input) => input.id));
          value3 = value2.comments.filter((input) => !values.has(input.id)).map((input) => ({
            op: "add",
            comment: input
          }));
        }
        let value4 = JSON.stringify({
          t: value2.title,
          c: callback(value2)
        }) === JSON.stringify({
          t: publishedState.title,
          c: callback(publishedState)
        });
        pendingCommentOperations = value3, pendingCommentOperations.length > 0 && (localState = {
          ...localState,
          comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
        }), value4 ? pendingCommentOperations.length === 0 ? stash.clear() : writeStash() : value.expectEmbed === embeddedStateHash ? (localState = {
          title: value2.title,
          content: value2.content,
          comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
        }, dirty = !0, writeStash()) : stashOffer = {
          at: value.at,
          state: value2
        };
      }
    }
    function markReadOnlyFromError(input) {
      readOnly = !0, readOnlyReason = input.code === "not_writer" ? READ_ONLY_ARTIFACT_MESSAGE : input.code === "consent_required" ? "Saving needs the self-publish permission this view declined (or has not answered). Reload and accept the prompt to edit." : "This view cannot save: " + input.message + " (" + input.code + ")", (input.code === "not_writer" || input.code === "not_declared" || input.code === "capability_disabled" || input.code === "capability_removed") && readOnlyFlag.write(readOnlyReason);
    }
    function updateLocalState(input, options2 = !1) {
      localState = input, dirty = !0, hasSaved = !1, saveError = void 0, saveErrorCode = void 0, options2 || (stashOffer = void 0, (0, runtime2.recordArtifactEdit)()), writeStash(), notifyDocumentSubscribers();
    }
    function recomposeComments() {
      localState = {
        ...localState,
        comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
      }, writeStash(), notifyDocumentSubscribers();
    }
    function serializeEnvelope(input) {
      return options.serializeContent !== void 0 ? {
        ...input,
        content: options.serializeContent(input.content, input.title)
      } : input;
    }
    function buildPublishedPage(input) {
      return (0, runtime2.assembleCompiledPage)({
        ...pageParts,
        title: input.title
      }, (0, runtime2.stringifyInlineJson)(serializeEnvelope(input)));
    }
    async function publishPage(input, options2) {
      return (options.publish ?? (0, runtime2.createSelfPublisher)())(input, options2);
    }
    let publishChain = Promise.resolve();
    function serializePublish(input) {
      let value = publishChain.then(input, input);
      return publishChain = value.then(() => {
      }, () => {
      }), value;
    }
    function publishPendingComments() {
      if (readOnly || publishingComments || (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations).length === 0)
        return;
      publishingComments = !0, commentPublishError = void 0, notifyDocumentSubscribers();
      let flag2 = !1;
      serializePublish(async () => {
        try {
          let value = (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations);
          if (value.length === 0)
            return;
          let state = {
            title: publishedState.title,
            content: publishedState.content,
            comments: (0, runtime2.applyCommentOperations)(publishedState.comments, value)
          };
          if (JSON.stringify(state.comments) === JSON.stringify(publishedState.comments)) {
            let values = new Set(value);
            pendingCommentOperations = pendingCommentOperations.filter((input) => !values.has(input)), localState = {
              ...localState,
              comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
            }, writeStash();
            return;
          }
          let value2 = buildPublishedPage(state);
          if (new TextEncoder().encode(value2).length > runtime2.compiledPageMaxBytes) {
            commentPublishError = "The document is over the 16 MiB limit — the comment is kept locally but cannot publish until content shrinks.";
            return;
          }
          if (expectedEmbeddedStateHash = hashArtifactState((0, runtime2.stringifyInlineJson)(serializeEnvelope(parseEmbeddedArtifactState(JSON.parse(JSON.stringify(state)), options)))), writeStash(), dirty && !stashWriteSucceeded) {
            expectedEmbeddedStateHash = void 0, commentPublishError = "Comment held: you have unsaved edits that could NOT be kept locally (this document is too large to stash), and posting the comment reloads the page. Save your edits first, then retry.";
            return;
          }
          try {
            await publishPage(value2);
          } catch (value3) {
            if ((0, runtime2.normalizeSelfPublishError)(value3).code !== "upstream_error")
              throw value3;
            await new Promise((input) => setTimeout(input, 400 + Math.random() * 1200)), await publishPage(value2);
          }
          publishedState = state, pendingCommentOperations = (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations), localState = {
            ...localState,
            comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
          }, writeStash();
        } catch (value) {
          expectedEmbeddedStateHash = void 0;
          let value2 = (0, runtime2.normalizeSelfPublishError)(value);
          value2.code === "conflict" ? flag2 = !0 : runtime2.SELF_PUBLISH_PERMISSION_ERROR_CODES.includes(value2.code) ? markReadOnlyFromError(value2) : value2.code === "rate_limited" ? (commentPublishError = "Commenting too frequently — will retry in a moment.", setTimeout(() => {
            commentPublishError = void 0, publishPendingComments();
          }, 4e3 + Math.random() * 3e3)) : commentPublishError = "Comment not published (" + value2.message + ") — it is kept here; use retry to try again.", writeStash();
        } finally {
          publishingComments = !1, notifyDocumentSubscribers(), !flag2 && commentPublishError === void 0 && !readOnly && publishPendingComments();
        }
      });
    }
    async function save() {
      if (readOnly || saving || !dirty)
        return;
      saving = !0, saveError = void 0, saveErrorCode = void 0, notifySaveSubscribers();
      let { title: value, content: value2 } = localState;
      await serializePublish(async () => {
        try {
          writeStash();
          let value3 = (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations), state = {
            title: value,
            content: value2,
            comments: (0, runtime2.applyCommentOperations)(publishedState.comments, value3)
          }, value4 = options.publishesPage === !1 && options.publish !== void 0 ? "" : buildPublishedPage(state), length = new TextEncoder().encode(value4).length;
          if (length > runtime2.compiledPageMaxBytes) {
            saveError = "The document is " + String(Math.round(length / 1024 / 1024)) + " MiB — over the 16 MiB limit. Remove or shrink images (the usual culprit) and save again.";
            return;
          }
          let value5 = options.publish !== void 0 ? {
            published: serializeEnvelope(state),
            base: serializeEnvelope(publishedState)
          } : void 0, value6;
          try {
            value6 = await publishPage(value4, value5);
          } catch (value7) {
            if ((0, runtime2.normalizeSelfPublishError)(value7).code !== "upstream_error")
              throw value7;
            await new Promise((input) => setTimeout(input, 400 + Math.random() * 1200)), value6 = await publishPage(value4, value5);
          }
          publishedState = state, pendingCommentOperations = (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations), localState = {
            ...localState,
            comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
          }, value6?.reloads !== !1 && (reloading = !0), localState.title === value && localState.content === value2 ? (dirty = !1, hasSaved = value6?.reloads !== !1, pendingCommentOperations.length === 0 && (commentPublishError = void 0), hasSaved || stashOffer || pendingCommentOperations.length > 0 ? writeStash() : stash.clear(), hasSaved || publishPendingComments()) : !stashWriteSucceeded && value6?.reloads !== !1 && (saveError = "Saved — but you kept typing during the save, and those newer changes could NOT be kept locally (this document is too large to stash). Copy anything important now: the page is about to reload to the version without them.");
        } catch (value3) {
          let value4 = (0, runtime2.normalizeSelfPublishError)(value3);
          saveErrorCode = value4.code, value4.code === "conflict" ? saveError = stashWriteSucceeded ? "Someone saved a newer version first — loading it now. Your changes are kept and will be offered for restore." : "Someone saved a newer version first — loading it now. Your changes could NOT be kept locally (this document is too large to stash), so copy anything important before the reload." : runtime2.SELF_PUBLISH_PERMISSION_ERROR_CODES.includes(value4.code) ? markReadOnlyFromError(value4) : value4.say !== void 0 ? saveError = value4.say : value4.code === "rate_limited" ? saveError = "Not saved (" + value4.message + "). Your changes are kept; give it a moment, then save again." : value4.code === "invalid_content" || value4.code === "transform_error" ? saveError = "The store refused the document (" + value4.code + ": " + value4.message + "). This is usually a content problem — most often a pasted replacement character (U+FFFD, the question-mark-in-a-box glyph), which the platform rejects; find and remove the odd character, then save again. If the content looks clean, this is an appifact bug." : value4.code === "too_large" ? saveError = "The store refused the document as too large (16 MiB limit). Remove or shrink images and save again." : saveError = "Saving failed (" + value4.message + "). Your changes are kept — try again.";
        } finally {
          saving = !1, notifyDocumentSubscribers();
        }
      });
    }
    let canCheckLiveState = options.canPublish === void 0 && (options.publish === void 0 || options.publishWrapsFrame === !0), selfCapabilityReady = !readOnly && canCheckLiveState && !(0, runtime2.selfPublishInstalled)() ? (0, runtime2.getSelfPublishCapability)().then((input) => {
      input !== null || readOnly || (readOnly = !0, readOnlyAtBoot = !dirty, readOnlyReason = "This view can't save: no publish path is available here.", notifyDocumentSubscribers());
    }) : Promise.resolve();
    return !readOnly && canCheckLiveState && selfCapabilityReady.then(() => readOnly ? null : Promise.all([
      (0, runtime2.currentUserCanEditAsync)(),
      (0, runtime2.getAssetsCapability)()
    ])).then((input) => {
      input === null || input[0] !== !1 || input[1] !== null || readOnly || (readOnly = !0, readOnlyAtBoot = !dirty, readOnlyReason = READ_ONLY_ARTIFACT_MESSAGE, notifyDocumentSubscribers());
    }), readOnly || queueMicrotask(() => publishPendingComments()), {
      saveMode: () => "manual",
      state: () => localState,
      content: () => localState.content,
      title: () => localState.title,
      comments: () => localState.comments,
      dirty: () => dirty,
      readOnly: () => readOnly,
      saveState: getSaveState,
      commentSync: getCommentSyncState,
      setContent(input) {
        input !== localState.content && updateLocalState({
          ...localState,
          content: input
        });
      },
      updateContent(input, options2) {
        let value = input(localState.content);
        value !== localState.content && updateLocalState({
          ...localState,
          content: value
        }, options2?.auto === !0);
      },
      adoptRemote(input) {
        let value = input(publishedState.content, localState.content);
        value.base === publishedState.content && value.current === localState.content || (publishedState = {
          ...publishedState,
          content: value.base
        }, localState = {
          ...localState,
          content: value.current
        }, dirty && !value.dirty && localState.title === publishedState.title && (dirty = !1, !stashOffer && pendingCommentOperations.length === 0 && stash.clear()), dirty && writeStash(), notifyDocumentSubscribers({
          remote: !0
        }));
      },
      setTitle(input) {
        let value = normalizeTitleInput(input);
        value.length === 0 || value === localState.title || updateLocalState({
          ...localState,
          title: value
        });
      },
      addComment(input) {
        if (localState.comments.length >= runtime2.MAX_ARTIFACT_COMMENTS)
          return;
        let value = (0, runtime2.normalizeComments)([
          {
            ...input,
            id: crypto.randomUUID().slice(0, 8),
            at: Date.now()
          }
        ])[0];
        if (value)
          return pendingCommentOperations = [
            ...pendingCommentOperations,
            {
              op: "add",
              comment: value
            }
          ], recomposeComments(), publishPendingComments(), value;
      },
      removeComment(input) {
        !pendingCommentOperations.some((input2) => input2.op === "add" && input2.comment.id === input) && !publishedState.comments.some((input2) => input2.id === input) || (pendingCommentOperations = [
          ...pendingCommentOperations.filter((input2) => !(input2.op === "add" && input2.comment.id === input)),
          {
            op: "remove",
            id: input
          }
        ], recomposeComments(), publishPendingComments());
      },
      pendingCommentIds() {
        let values = /* @__PURE__ */ new Set();
        for (let value of (0, runtime2.applicableCommentOperations)(publishedState.comments, pendingCommentOperations))
          value.op === "add" && values.add(value.comment.id);
        return values;
      },
      retryCommentPublish() {
        commentPublishError !== void 0 && (commentPublishError = void 0, publishPendingComments());
      },
      documentBytes() {
        return new TextEncoder().encode(buildPublishedPage(localState)).length;
      },
      save,
      stashOffer: () => stashOffer ? {
        at: stashOffer.at
      } : void 0,
      restoreStash() {
        if (!stashOffer)
          return;
        let value = stashOffer, state = {
          title: localState.title,
          content: localState.content
        };
        return stashOffer = void 0, restoreCount += 1, updateLocalState({
          title: value.state.title,
          content: value.state.content,
          comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
        }), {
          label: "恢复未保存的更改",
          do() {
            stashOffer = void 0, updateLocalState({
              title: value.state.title,
              content: value.state.content,
              comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
            });
          },
          undo() {
            stashOffer = value, updateLocalState({
              title: state.title,
              content: state.content,
              comments: (0, runtime2.applyCommentOperations)(publishedState.comments, pendingCommentOperations)
            }, !0), (0, runtime2.recordArtifactEdit)();
          }
        };
      },
      restoreCount: () => restoreCount,
      discardStash() {
        stashOffer && (stashOffer = void 0, pendingCommentOperations.length === 0 ? stash.clear() : writeStash(), notifyDocumentSubscribers());
      },
      subscribe(input) {
        return documentSubscribers.add(input), flushOwedNotification(), () => documentSubscribers.delete(input);
      },
      subscribeSave(input) {
        return saveSubscribers.add(input), flushOwedNotification(), () => saveSubscribers.delete(input);
      }
    };
  }
  return bindRuntimeValue(runtime2, "MAX_ARTIFACT_TITLE_CHARS", () => MAX_ARTIFACT_TITLE_CHARS, (value) => {
    MAX_ARTIFACT_TITLE_CHARS = value;
  }), bindRuntimeValue(runtime2, "normalizeArtifactTitle", () => normalizeArtifactTitle), bindRuntimeValue(runtime2, "normalizeTitleInput", () => normalizeTitleInput), bindRuntimeValue(runtime2, "createRuntimeArtifactDocument", () => createRuntimeArtifactDocument), bindRuntimeValue(runtime2, "autoSavingArtifactRuntime", () => autoSavingArtifactRuntime, (value) => {
    autoSavingArtifactRuntime = value;
  }), bindRuntimeValue(runtime2, "setAutoSavingArtifactRuntime", () => setAutoSavingArtifactRuntime), bindRuntimeValue(runtime2, "getAutoSavingArtifactRuntime", () => getAutoSavingArtifactRuntime), bindRuntimeValue(runtime2, "detectAutoSavingArtifactRuntime", () => detectAutoSavingArtifactRuntime), bindRuntimeValue(runtime2, "READ_ONLY_ARTIFACT_MESSAGE", () => READ_ONLY_ARTIFACT_MESSAGE, (value) => {
    READ_ONLY_ARTIFACT_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_STASH_PREFIX", () => ARTIFACT_STASH_PREFIX, (value) => {
    ARTIFACT_STASH_PREFIX = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_READ_ONLY_PREFIX", () => ARTIFACT_READ_ONLY_PREFIX, (value) => {
    ARTIFACT_READ_ONLY_PREFIX = value;
  }), bindRuntimeValue(runtime2, "artifactStashKey", () => artifactStashKey), bindRuntimeValue(runtime2, "createSessionStorageSlot", () => createSessionStorageSlot), bindRuntimeValue(runtime2, "currentArtifactStash", () => currentArtifactStash), bindRuntimeValue(runtime2, "readCurrentArtifactReadOnlyReason", () => readCurrentArtifactReadOnlyReason), bindRuntimeValue(runtime2, "currentArtifactReadOnlySlot", () => currentArtifactReadOnlySlot), bindRuntimeValue(runtime2, "hashArtifactState", () => hashArtifactState), bindRuntimeValue(runtime2, "parseArtifactStash", () => parseArtifactStash), bindRuntimeValue(runtime2, "parseEmbeddedArtifactState", () => parseEmbeddedArtifactState), bindRuntimeValue(runtime2, "createArtifactDocument", () => createArtifactDocument), () => {
    (0, runtime2.initializeCompiledPage)(), (0, runtime2.initializeAssetStorage)(), MAX_ARTIFACT_TITLE_CHARS = 200, READ_ONLY_ARTIFACT_MESSAGE = "You can view this artifact but not edit it. Saving needs write access from an owner.", ARTIFACT_STASH_PREFIX = "appifact-stash/", ARTIFACT_READ_ONLY_PREFIX = "appifact-ro/";
  };
}
export {
  installDocumentsArtifactDocument
};
