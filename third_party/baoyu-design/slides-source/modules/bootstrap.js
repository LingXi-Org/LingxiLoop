// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBootstrap(runtime2) {
  var BootstrapJsx, slidesBootStartedAt, slidesBootDebugger, getSlidesBootDebugger, FILES_PRESENTATION_READ_ONLY_MESSAGE, FILES_PRESENTATION_LOAD_FAILURE_MESSAGE, EMPTY_BOOT_PRESENTATION, SlidesRootApp, slidesWriteAccessPromise, getSlidesWriteAccess, filesBootPortOptions, createSlidesBootFilesPort, FILES_PRESENTATION_LOAD_FAILURE_TITLE, bootAllowsExternalUpdates, syncFailureToastId, SLIDES_BOOT_LOADING_NOTICE_DELAY_MS;
  function buildBootErrorPresentation(diagnostic) {
    let makeTextFrame = (input, options, context, value) => ({
      id: input,
      x: {
        anchor: "leading",
        margin: 128,
        offset: 0,
        size: 1600
      },
      y: {
        anchor: "leading",
        margin: options,
        offset: 0
      },
      node: {
        kind: "text",
        role: context,
        text: value
      }
    });
    return {
      title: FILES_PRESENTATION_LOAD_FAILURE_TITLE,
      content: {
        order: ["notice"],
        slides: {
          notice: {
            v: 1,
            id: "notice",
            bg: "ivory-warm",
            frames: [
              makeTextFrame("t", 320, "display", FILES_PRESENTATION_LOAD_FAILURE_TITLE),
              makeTextFrame("d", 520, "lead", (0, runtime2.untranslatedMessage)("无法读取") + runtime2.LEGACY_SLIDES_HTML_PATH + (0, runtime2.untranslatedMessage)("，也无法读取示例文稿（") + diagnostic + ").")
            ]
          }
        }
      }
    };
  }
  function configureLoadedLegacyState(outcome) {
    outcome.error !== void 0 && console.warn("slides (files mode): " + outcome.error);
    let state = outcome.origin === "failed" ? buildBootErrorPresentation(outcome.error ?? "") : outcome.state, reason = outcome.origin === "failed" ? (0, runtime2.formatMessage)({
      defaultMessage: "无法加载此演示文稿。",
      id: "HbXOJpyGbe"
    }) : outcome.origin === "demo" ? (0, runtime2.joinMessages)(FILES_PRESENTATION_READ_ONLY_MESSAGE, outcome.stateFileFound === !0 ? (0, runtime2.formatMessage)({
      defaultMessage: "无法使用此页面的演示文稿文件（{error}），当前显示示例文稿。",
      id: "C6ADLfmkge"
    }, {
      error: outcome.error ?? ""
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "此页面尚未发布 {file}，当前显示示例文稿。",
      id: "MwykD39eZP"
    }, {
      file: runtime2.LEGACY_SLIDES_HTML_PATH
    })) : FILES_PRESENTATION_READ_ONLY_MESSAGE, readOnlyReason = outcome.note === void 0 ? reason : (0, runtime2.joinMessages)(reason, outcome.note);
    (0, runtime2.configureArtifactDocument)({
      embeddedState: state,
      pageParts: runtime2.EMPTY_FILE_STATE_PAGE_PARTS,
      roFlag: (0, runtime2.readableStateStorageSlot)(readOnlyReason),
      stash: runtime2.unavailableStateStorageSlot,
      canPublish: !0
    });
    let value = (0, runtime2.stateEnvelopeTitle)(state);
    value !== void 0 && (document.title = value);
  }
  function failedLegacyStateOutcome(error) {
    return {
      state: {},
      origin: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
  }
  async function bootLegacyFileState() {
    let value;
    try {
      value = await (0, runtime2.loadInstanceOrDemoState)({
        stateFile: runtime2.LEGACY_SLIDES_HTML_PATH,
        demoFile: runtime2.LEGACY_SLIDES_DEMO_PATH,
        read: runtime2.parseLegacySlidesHtml
      });
    } catch (value2) {
      value = failedLegacyStateOutcome(value2);
    }
    configureLoadedLegacyState(value);
  }
  function configureReadOnlyBoot(reason) {
    (0, runtime2.configureArtifactDocumentFactory)(void 0), (0, runtime2.configureArtifactDocument)((0, runtime2.readOnlyEmbeddedDocumentOptions)(EMPTY_BOOT_PRESENTATION, reason)), (0, runtime2.prepareSlidesThumbnailCapture)();
  }
  function detachEarlyHotUpdatesForLegacyBoot() {
    let value = runtime2.hotReloadBridge.owed() !== void 0, length = runtime2.hotReloadBridge.queued.length;
    if (runtime2.hotReloadBridge.detach(), !value && length > 0)
      try {
        (0, runtime2.getHotCapability)()?.restart?.({
          note: "content changed during a non-files boot"
        });
      } catch {
      }
  }
  function initializeSlidesBootDebugger(port) {
    let debug = getSlidesBootDebugger();
    debug.phase("listing read"), debug.field("slidesHost.hot handler", runtime2.hotReloadBridge.active ? "registered at module start (registerEarlyHot, first import)" : "absent"), (0, runtime2.setArtifactFeedbackHandler)((input, options) => debug.event(input, options));
    let unloadReport = (0, runtime2.readLastUnloadFlushReport)();
    return unloadReport !== void 0 && debug.event("unload-flush-previous-load", unloadReport), (0, runtime2.instrumentFilesPort)(port, debug);
  }
  function showStashedSlideRecovery(document2, offer) {
    let chooseAction = (input) => () => {
      (0, runtime2.closeToast)(value), input ? document2.restoreStashed(offer.slideId) : document2.discardStashed(offer.slideId);
    }, confirmation = (0, runtime2.stashedSlideRestoreConfirmation)({
      slideNo: offer.slideNo,
      gone: document2.content().slides[offer.slideId] === void 0,
      moved: offer.moved
    }), value = (0, runtime2.showActionToast)(confirmation.message, BootstrapJsx.jsxs("span", {
      style: {
        display: "inline-flex",
        gap: 8
      },
      children: [
        BootstrapJsx.jsx(runtime2.Button, {
          size: "sm",
          variant: "secondary",
          onClick: chooseAction(!0),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "恢复",
            id: "6FKoe0cWzv"
          })
        }),
        BootstrapJsx.jsx(runtime2.Button, {
          size: "sm",
          variant: "secondary",
          onClick: chooseAction(!1),
          children: confirmation.discardLabel
        })
      ]
    }));
  }
  function configureFilesDocumentFactory(port, stash) {
    slidesBootDebugger?.field("crash stash", stash?.kind ?? "none"), (0, runtime2.configureArtifactDocumentFactory)((options) => {
      let value = (0, runtime2.createDelayedSyncErrorNotifier)({
        show: () => showSyncFailureToast(value2),
        hide: () => {
          syncFailureToastId !== void 0 && ((0, runtime2.closeToast)(syncFailureToastId), syncFailureToastId = void 0);
        }
      }), value2 = (0, runtime2.createSlidesFilesDocument)({
        port,
        parseContent: options.parseContent,
        initialContent: options.initialContent,
        defaultTitle: document.title || options.defaultTitle,
        holdRemote: (input) => input === (0, runtime2.protectedSlideDocumentPath)(),
        inSlide: (input) => input === (0, runtime2.activeEditingDocumentPath)(),
        startEmpty: !0,
        paced: !0,
        early: runtime2.hotReloadBridge,
        firstSlide: {
          landing: (input) => (0, runtime2.initialCurrentSlideId)(input, (0, runtime2.resolvePagePlaceLink)(), !0),
          parse: (0, runtime2.createSlidesArtifactDocumentOptions)().parseContent,
          allowed: bootAllowsExternalUpdates,
          painted: runtime2.waitForEarlySlidePaint
        },
        onNotice: (input) => {
          slidesBootDebugger?.event("notice", {
            text: input
          }), (0, runtime2.showToast)(input);
        },
        onStashOffer: (input) => showStashedSlideRecovery(value2, input),
        ...stash !== void 0 ? {
          stash
        } : {},
        onEvent: (input, options2) => {
          slidesBootDebugger?.event("doc-" + input, options2), value(input), input === "save-left-out" && (0, runtime2.showToast)(options2.message, 12e3);
        }
      });
      (0, runtime2.installUnloadSaveFlush)(value2, {
        report: (input) => slidesBootDebugger?.event("unload-flush-" + input.result, input)
      }), slidesBootDebugger?.provide({
        files: () => value2.debugFiles(),
        queue: () => value2.debugQueue()
      }), value2.ready().then(() => {
        slidesBootDebugger?.phase("deck on screen"), slidesBootDebugger !== void 0 && slidesBootDebugger.reloadReason.startsWith("hot restart") && slidesBootDebugger.visible(port.version().version, "restarted");
      });
      let value3 = (0, runtime2.createFilesHotUpdateController)({
        port,
        isBusy: runtime2.editorViewStateBusy,
        ...(0, runtime2.editorSaveHandoff)(value2),
        contentWhileBusy: !0,
        snapshot: runtime2.captureEditorViewState,
        ...(0, runtime2.hotRestoreViewState)(runtime2.restoreEditorViewState),
        applyRemote: (input) => value2.applyRemote(input),
        onEvent: (input) => {
          input.type === "reveal" && (0, runtime2.revealAfterHotRestore)(), slidesBootDebugger?.hotEvent(input), input.type === "applied" && slidesBootDebugger?.visible(input.to, "adopted");
        },
        onBeforeRestart: (input) => slidesBootDebugger?.beforeRestart(input)
      });
      return slidesBootDebugger?.field("slidesHost.hot", value3.active ? "present" : "absent (plain reloads)"), slidesBootDebugger?.mount("files"), value2;
    });
  }
  function showSyncFailureToast(document2) {
    let message = document2.saveTroubleWords();
    if (message === void 0)
      return;
    syncFailureToastId !== void 0 && (0, runtime2.closeToast)(syncFailureToastId);
    let toast = (0, runtime2.showActionToast)(message, BootstrapJsx.jsx(runtime2.Button, {
      size: "sm",
      variant: "secondary",
      onClick: () => {
        (0, runtime2.closeToast)(toast), syncFailureToastId = void 0, document2.save();
      },
      children: (0, runtime2.formatMessage)({
        defaultMessage: "立即重试",
        id: "u2EYD45Tmm"
      })
    }));
    syncFailureToastId = toast;
  }
  function isFrameRevealedMessage(data) {
    return data?.__frame_revealed === !0;
  }
  function revealPlaceholderWhenShown(win, isAllowedOrigin = runtime2.isAllowedHostMessageOrigin) {
    let placeholder = () => win.document.querySelector("#root > [data-placeholder]"), reveal = () => placeholder()?.setAttribute("data-revealed", "");
    if (placeholder() === null)
      return;
    if (win.parent === win)
      return reveal();
    let onMessage = (event) => {
      event.source !== win.parent || !isAllowedOrigin(event.origin) || isFrameRevealedMessage(event.data) && (win.removeEventListener("message", onMessage), reveal());
    };
    win.addEventListener("message", onMessage);
  }
  async function bootThumbnailFromEarlyFiles() {
    let value = await (0, runtime2.readEarlySlidesFilesEnvelope)(async (input) => {
      try {
        let value3 = await fetch(input);
        return value3.ok ? await value3.text() : null;
      } catch {
        return null;
      }
    }).catch(() => null);
    if (value === null)
      return !1;
    let value2;
    try {
      value2 = runtime2.defaultSlidesFileCodec.compose({
        files: value.files,
        index: value.index
      }, void 0);
    } catch {
      return !1;
    }
    return (0, runtime2.configureArtifactDocument)({
      embeddedState: {
        title: value2.title,
        content: value2.content
      },
      pageParts: runtime2.EMPTY_FILE_STATE_PAGE_PARTS,
      roFlag: (0, runtime2.readableStateStorageSlot)(""),
      stash: runtime2.unavailableStateStorageSlot,
      canPublish: !0
    }), (0, runtime2.waitForThumbnailResources)(), !0;
  }
  async function bootSlidesApplication() {
    if (!((0, runtime2.isFrameCaptureMode)() && await bootThumbnailFromEarlyFiles())) {
      if ((0, runtime2.detectCompiledPageStorageMode)(document) !== "db")
        return detachEarlyHotUpdatesForLegacyBoot(), bootLegacyFileState().catch((input) => configureLoadedLegacyState(failedLegacyStateOutcome(input)));
      if ((0, runtime2.isFrameCaptureMode)() || runtime2.isEmbeddedArtifact)
        return configureReadOnlyBoot();
      await bootSlidesFilesMode().catch((input) => {
        console.error("slides (files): boot failed", input), configureReadOnlyBoot(FILES_PRESENTATION_LOAD_FAILURE_MESSAGE);
      });
    }
  }
  async function bootSlidesFilesMode() {
    runtime2.hotReloadBridge.armReady();
    let value = initializeSlidesBootDebugger(await createSlidesBootFilesPort()), value2 = value.canWrite ? await Promise.race([
      (0, runtime2.createPersistentUnsavedSlideStash)({
        version: () => value.version().version
      }).catch(() => {
      }),
      new Promise((input) => setTimeout(() => input(void 0), SLIDES_BOOT_LOADING_NOTICE_DELAY_MS))
    ]) : void 0;
    configureFilesDocumentFactory(value, value2);
  }
  return bindRuntimeValue(runtime2, "BootstrapJsx", () => BootstrapJsx, (value) => {
    BootstrapJsx = value;
  }), bindRuntimeValue(runtime2, "slidesBootStartedAt", () => slidesBootStartedAt, (value) => {
    slidesBootStartedAt = value;
  }), bindRuntimeValue(runtime2, "slidesBootDebugger", () => slidesBootDebugger, (value) => {
    slidesBootDebugger = value;
  }), bindRuntimeValue(runtime2, "getSlidesBootDebugger", () => getSlidesBootDebugger, (value) => {
    getSlidesBootDebugger = value;
  }), bindRuntimeValue(runtime2, "FILES_PRESENTATION_READ_ONLY_MESSAGE", () => FILES_PRESENTATION_READ_ONLY_MESSAGE, (value) => {
    FILES_PRESENTATION_READ_ONLY_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "FILES_PRESENTATION_LOAD_FAILURE_MESSAGE", () => FILES_PRESENTATION_LOAD_FAILURE_MESSAGE, (value) => {
    FILES_PRESENTATION_LOAD_FAILURE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "buildBootErrorPresentation", () => buildBootErrorPresentation), bindRuntimeValue(runtime2, "configureLoadedLegacyState", () => configureLoadedLegacyState), bindRuntimeValue(runtime2, "failedLegacyStateOutcome", () => failedLegacyStateOutcome), bindRuntimeValue(runtime2, "bootLegacyFileState", () => bootLegacyFileState), bindRuntimeValue(runtime2, "EMPTY_BOOT_PRESENTATION", () => EMPTY_BOOT_PRESENTATION, (value) => {
    EMPTY_BOOT_PRESENTATION = value;
  }), bindRuntimeValue(runtime2, "SlidesRootApp", () => SlidesRootApp, (value) => {
    SlidesRootApp = value;
  }), bindRuntimeValue(runtime2, "configureReadOnlyBoot", () => configureReadOnlyBoot), bindRuntimeValue(runtime2, "slidesWriteAccessPromise", () => slidesWriteAccessPromise, (value) => {
    slidesWriteAccessPromise = value;
  }), bindRuntimeValue(runtime2, "getSlidesWriteAccess", () => getSlidesWriteAccess, (value) => {
    getSlidesWriteAccess = value;
  }), bindRuntimeValue(runtime2, "detachEarlyHotUpdatesForLegacyBoot", () => detachEarlyHotUpdatesForLegacyBoot), bindRuntimeValue(runtime2, "filesBootPortOptions", () => filesBootPortOptions, (value) => {
    filesBootPortOptions = value;
  }), bindRuntimeValue(runtime2, "createSlidesBootFilesPort", () => createSlidesBootFilesPort, (value) => {
    createSlidesBootFilesPort = value;
  }), bindRuntimeValue(runtime2, "initializeSlidesBootDebugger", () => initializeSlidesBootDebugger), bindRuntimeValue(runtime2, "FILES_PRESENTATION_LOAD_FAILURE_TITLE", () => FILES_PRESENTATION_LOAD_FAILURE_TITLE, (value) => {
    FILES_PRESENTATION_LOAD_FAILURE_TITLE = value;
  }), bindRuntimeValue(runtime2, "showStashedSlideRecovery", () => showStashedSlideRecovery), bindRuntimeValue(runtime2, "bootAllowsExternalUpdates", () => bootAllowsExternalUpdates, (value) => {
    bootAllowsExternalUpdates = value;
  }), bindRuntimeValue(runtime2, "configureFilesDocumentFactory", () => configureFilesDocumentFactory), bindRuntimeValue(runtime2, "syncFailureToastId", () => syncFailureToastId, (value) => {
    syncFailureToastId = value;
  }), bindRuntimeValue(runtime2, "showSyncFailureToast", () => showSyncFailureToast), bindRuntimeValue(runtime2, "bootThumbnailFromEarlyFiles", () => bootThumbnailFromEarlyFiles), bindRuntimeValue(runtime2, "SLIDES_BOOT_LOADING_NOTICE_DELAY_MS", () => SLIDES_BOOT_LOADING_NOTICE_DELAY_MS, (value) => {
    SLIDES_BOOT_LOADING_NOTICE_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "bootSlidesApplication", () => bootSlidesApplication), bindRuntimeValue(runtime2, "bootSlidesFilesMode", () => bootSlidesFilesMode), bindRuntimeValue(runtime2, "isFrameRevealedMessage", () => isFrameRevealedMessage), bindRuntimeValue(runtime2, "revealPlaceholderWhenShown", () => revealPlaceholderWhenShown), () => {
    BootstrapJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), (0, runtime2.initializeDocumentColorMode)(document), slidesBootStartedAt = typeof performance < "u" ? performance.now() : 0, getSlidesBootDebugger = () => slidesBootDebugger ??= (0, runtime2.createFilesDebugger)({
      product: "slides",
      hot: (0, runtime2.getHotCapability)(),
      bootStartedAt: slidesBootStartedAt
    }), FILES_PRESENTATION_READ_ONLY_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此演示文稿为只读。",
      id: "huG9NyjIOM"
    }), FILES_PRESENTATION_LOAD_FAILURE_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "无法加载演示文稿，请刷新重试。",
      id: "yg/TNIGw1T"
    }), FILES_PRESENTATION_LOAD_FAILURE_TITLE = (0, runtime2.untranslatedMessage)("无法加载演示文稿"), EMPTY_BOOT_PRESENTATION = {
      format: "html",
      theme: "neutral",
      order: [],
      slides: {}
    }, SlidesRootApp = (0, runtime2.isFrameCaptureMode)() ? runtime2.SlidesThumbnailApp : runtime2.SlidesApp, getSlidesWriteAccess = () => slidesWriteAccessPromise ??= (0, runtime2.determineSlidesWriteAccess)(), filesBootPortOptions = {
      fetchFresh: (input) => fetch(input, {
        cache: "no-store"
      }),
      onRead: (input, options, context, value) => slidesBootDebugger?.read(input, options, context, value),
      onPublishError: (input) => slidesBootDebugger?.event("publish-raw-error", input)
    }, createSlidesBootFilesPort = async () => (0, runtime2.createBrowserFilesPort)({
      canWrite: (await getSlidesWriteAccess()).canWrite,
      ...filesBootPortOptions
    }), bootAllowsExternalUpdates = () => !(0, runtime2.wasCreationSequenceFlagRequested)() || !(0, runtime2.getFeatureFlag)(runtime2.CREATION_SEQUENCE_FLAG, !1) || runtime2.agentActivityStore.get() === "idle", SLIDES_BOOT_LOADING_NOTICE_DELAY_MS = 3e3, revealPlaceholderWhenShown(window);
    try {
      (0, runtime2.detectCompiledPageStorageMode)(document) === "db" && !(0, runtime2.isFrameCaptureMode)() && !runtime2.isEmbeddedArtifact && ((0, runtime2.requestCreationSequenceFlag)(), runtime2.agentActivityStore.subscribe(() => {
      }));
    } catch {
    }
    bootSlidesApplication().then(runtime2.detectAutoSavingArtifactRuntime).then(() => {
      let value = document.getElementById("root");
      if (!value)
        throw Error("missing #root");
      runtime2.reactDOMClientOT0.createRoot(value).render(BootstrapJsx.jsx(SlidesRootApp, {}));
    }).catch((error) => {
      throw document.querySelector("#root > [data-placeholder]")?.remove(), error;
    });
  };
}
export {
  installBootstrap
};
