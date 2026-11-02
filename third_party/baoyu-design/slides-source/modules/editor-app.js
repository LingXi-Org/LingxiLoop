// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { pointInRect, TEXT_TOOL_TOUCH_DRAG, TEXT_TOOL_MOUSE_DRAG, bindRuntimeValue } from "../module-helpers.js";
function installEditorApp(runtime2) {
  var SlidesAppJsx, EMPTY_SLIDE_GRID_SELECTION, ZOOM_KEYBOARD_SHORTCUT_LABEL, QUICK_INSERT_SHAPES, QUICK_INSERT_LINE_SHAPES, SHAPE_INSERT_SHORTCUTS, TEXT_INSERT_SHORTCUT_KEY, disabledInsertControlProps, isLocalEmbeddableResource, DAMAGED_SLIDE_ACTION_MESSAGE, LOADING_PRESENTATION_PASTE_MESSAGE, presentationCapacityMessage, SPEAKER_NOTES_POPOUT_FALLBACK_MESSAGE, ALL_SLIDES_SKIPPED_EXPORT_MESSAGE, PRESENTATION_BUILDING_MESSAGE, formatPresentationBuildProgress, PRESENTATION_EXPORT_ALL_SLIDES_ARRIVED_MESSAGE, EXTRA_EXPORT_FORMATS_META_NAME, EMPTY_EXTRA_EXPORT_FORMATS, SHELL_EXPORT_IMAGE_REDUCTION_NOTE, GOOGLE_SLIDES_BUILD_TIMEOUT_MS, MAX_BROWSER_EXPORT_BYTES, BROWSER_EXPORT_IMAGE_REDUCTION_NOTE, exportFormatSupportsNotes, EXPORT_FORMAT_MIME_AND_EXTENSION, getActiveSlideSurfaceRect, ACTIVE_SLIDE_SURFACE_SELECTOR, GRID_COMMENT_SLIDE_TARGET_SELECTOR, findActiveCommentSlideTarget, EDITOR_TAB_TARGET_SELECTOR, isCanvasEditorFocusTarget, ACTIVE_SLIDES_VIEW_SWITCH_SELECTOR, VIDEO_UPLOAD_TIMEOUT_MS, ignoreGlobalFileDrop, COPIED_VIDEO_OMISSION_MESSAGE, jpegReplacementUploadInput, editorHasBlockingOverlay, SVG_TOO_LARGE_KIND, UNKNOWN_TYPE_KIND, AGENT_CURSOR_OFFSET, AGENT_CURSOR_LABEL, DEFAULT_TEXT_INSERT_WIDTH, MIN_TEXT_INSERT_WIDTH, PROPERTY_PANEL_TABS, EXPORT_FONT_DEADLINE_MS, MAX_IMAGES_PLACED_AT_ONCE, INSERT_STAGGER_STEP, UPLOAD_TIMEOUT_PER_FILE_MS, FONT_LICENCE_LISTS_TIMEOUT_MS, PHONE_REMOTE_FLAG, RAIL_FOCUSABLE_OPTION_SELECTOR, LAST_SLIDE_DELETE_MESSAGE, DAMAGED_SLIDES_DELETE_MESSAGE, SLIDE_FULL_MESSAGE, TABLE_CELLS_FULL_MESSAGE, presentationSlideCapacityMessage, exportFailedMessage, slidesCopiedMessage, EXPORTING_MESSAGE, PRESENT_FROM_CURRENT_LABEL, ADD_SLIDE_LABEL, SHOW_SLIDE_THUMBNAILS_LABEL, CANVAS_VIEW_NO_THUMBNAILS_MESSAGE, TEXT_INPUT_TYPES;
  class ImageReadError extends Error {
  }
  function coarsePointerNow() {
    return typeof matchMedia == "function" && matchMedia(runtime2.COARSE_POINTER_QUERY).matches;
  }
  function refocusRailAfterRemoval(rail) {
    requestAnimationFrame(() => {
      let active = document.activeElement;
      (active === null || active === document.body || !active.isConnected || active.getAttribute("role") === "option" && rail.current?.contains(active) === !0) && rail.current?.querySelector(RAIL_FOCUSABLE_OPTION_SELECTOR)?.focus({ preventScroll: !0 });
    });
  }
  function railFocusReturnSelector(element) {
    let option = RAIL_FOCUSABLE_OPTION_SELECTOR;
    if (element.getAttribute("role") === "option")
      return option;
    if (element.closest('[role="option"]') !== null)
      return element.closest('[data-kit="thumb-actions"]') !== null ? option + ' [data-kit="thumb-actions"] button' : null;
    let label = element.getAttribute("aria-label");
    return label === null || element.closest("[data-rail-actions]") === null ? null : '[data-rail-actions] [aria-label="' + label.replace(/["\\]/g, "\\$&") + '"]';
  }
  function isTypingInField() {
    let active = document.activeElement;
    return active instanceof HTMLInputElement ? TEXT_INPUT_TYPES.has(active.type) : active instanceof HTMLElement && (active.isContentEditable || active.tagName === "TEXTAREA");
  }
  function subscribeFocusChanges(listener) {
    return document.addEventListener("focusin", listener), document.addEventListener("focusout", listener), () => {
      document.removeEventListener("focusin", listener), document.removeEventListener("focusout", listener);
    };
  }
  function placeInsertedTextBox(point, height2, endX) {
    let width = endX === void 0 ? void 0 : Math.min(runtime2.SLIDE_WIDTH, Math.round(Math.abs(endX - point.x))), left = Math.round(Math.min(Math.max(0, Math.min(point.x, endX ?? point.x)), runtime2.SLIDE_WIDTH - (width ?? MIN_TEXT_INSERT_WIDTH)));
    return {
      x: {
        anchor: "leading",
        margin: left,
        offset: 0,
        size: width ?? Math.min(DEFAULT_TEXT_INSERT_WIDTH, runtime2.SLIDE_WIDTH - left)
      },
      y: {
        anchor: "leading",
        margin: Math.round(Math.min(Math.max(0, point.y - height2 / 2), runtime2.SLIDE_HEIGHT - height2)),
        offset: 0
      }
    };
  }
  function placeInsertedFrame(sourceFrame, width, height2, stagger) {
    let margin = (center, size4, extent) => {
      let value = Math.max(0, Math.round(center - size4 / 2));
      return stagger === void 0 ? value : Math.min(value, Math.max(0, extent - size4 - (stagger.of - 1) * INSERT_STAGGER_STEP)) + stagger.i * INSERT_STAGGER_STEP;
    };
    return sourceFrame ? {
      x: {
        anchor: "leading",
        margin: margin(sourceFrame.x, width, runtime2.SLIDE_WIDTH),
        offset: 0,
        size: width
      },
      y: {
        anchor: "leading",
        margin: margin(sourceFrame.y, height2 ?? 80, runtime2.SLIDE_HEIGHT),
        offset: 0,
        ...height2 !== void 0 ? {
          size: height2
        } : {}
      }
    } : {
      x: {
        anchor: "center",
        margin: 0,
        offset: 0,
        size: width
      },
      y: {
        anchor: "center",
        margin: 0,
        offset: 0,
        ...height2 !== void 0 ? {
          size: height2
        } : {}
      }
    };
  }
  function getShapeInsertShortcut(shape) {
    let shortcut = SHAPE_INSERT_SHORTCUTS[shape];
    if (shortcut !== void 0)
      return (shortcut.shift ? "shift+" : "") + shortcut.key;
  }
  function parseShapeInsertShortcut(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.isComposing || typeof event.key != "string")
      return;
    let key = event.key.toLowerCase();
    return key === TEXT_INSERT_SHORTCUT_KEY && !event.shiftKey ? "text" : runtime2.shapeVariants.find((input) => SHAPE_INSERT_SHORTCUTS[input]?.key === key && SHAPE_INSERT_SHORTCUTS[input]?.shift === !0 === event.shiftKey);
  }
  async function readEmbeddableImageResource(url) {
    if ((0, runtime2.isStoredBlobReference)(url))
      return (0, runtime2.fetchStoredBlob)(url);
    let dataUri = await (0, runtime2.fetchResourceDataUrl)(url, 8e3, {
      credentials: "same-origin"
    });
    if (!/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)[;,]/.test(dataUri))
      throw Error("not a picture");
    return dataUri;
  }
  async function inlineLocalDeckResources(slides, assets) {
    let urls = /* @__PURE__ */ new Set(), localUrls = /* @__PURE__ */ new Set();
    for (let value of assets.values())
      isLocalEmbeddableResource(value) && (urls.add(value), localUrls.add(value));
    let callback = (source) => {
      source.kind === "img" && source.src !== void 0 && isLocalEmbeddableResource(source.src) && (urls.add(source.src), localUrls.add(source.src)), source.kind === "text" && source.fill?.kind === "image" && isLocalEmbeddableResource(source.fill.src) && urls.add(source.fill.src);
      for (let value of (0, runtime2.nodeChildren)(source) ?? [])
        callback(value);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        callback(value2.node);
    if (urls.size === 0)
      return {
        slides,
        assets,
        warnings: []
      };
    let entries = /* @__PURE__ */ new Map(), index4 = 0, index22 = 0, values = /* @__PURE__ */ new Set();
    await Promise.all([...urls].map(async (input) => {
      try {
        entries.set(input, await readEmbeddableImageResource(input));
      } catch {
        localUrls.has(input) ? index4 += 1 : index22 += 1;
      }
    }));
    let callback2 = (source) => {
      if (source.kind === "img") {
        if (source.src === void 0 || !isLocalEmbeddableResource(source.src))
          return source;
        let { src: value, ...value2 } = source, entry = entries.get(value);
        return entry !== void 0 ? {
          ...value2,
          src: entry
        } : value2;
      }
      if (source.kind === "text" && source.fill?.kind === "image" && isLocalEmbeddableResource(source.fill.src)) {
        let { fill: value, ...value2 } = source, entry = entries.get(value.src);
        return entry !== void 0 && !(0, runtime2.isRenderableImageSource)(entry) ? (values.add(entry.length > runtime2.maxInlineSvgBytes && entry.startsWith("data:image/svg+xml") ? SVG_TOO_LARGE_KIND : entry.slice(5, Math.max(5, entry.indexOf(";"))) || UNKNOWN_TYPE_KIND), value2) : entry !== void 0 ? {
          ...value2,
          fill: {
            ...value,
            src: entry
          }
        } : value2;
      }
      return source.kind === "overlay" ? {
        ...source,
        base: callback2(source.base),
        layers: source.layers.map((input) => ({
          ...input,
          node: callback2(input.node)
        }))
      } : (0, runtime2.isFlowContainer)(source) ? {
        ...source,
        children: source.children.map(callback2)
      } : source;
    }, entries2 = /* @__PURE__ */ new Map();
    for (let [value, value2] of assets)
      isLocalEmbeddableResource(value2) ? entries.has(value2) && entries2.set(value, entries.get(value2)) : entries2.set(value, value2);
    return {
      slides: slides.map((input) => ({
        ...input,
        frames: input.frames.map((input2) => ({
          ...input2,
          node: callback2(input2.node)
        }))
      })),
      assets: entries2,
      warnings: [
        ...index4 > 0 ? [
          (0, runtime2.formatMessage)({
            defaultMessage: "有 {count} 张图片无法加载，已导出为占位图。",
            id: "4a1usg4zuY"
          }, { n: index4, count: String(index4) })
        ] : [],
        ...index22 > 0 ? [
          (0, runtime2.formatMessage)({
            defaultMessage: "有 {count} 张文字填充图片无法加载，相关文字已使用纯色导出。",
            id: "sDy4Uz5yhX"
          }, { n: index22, count: String(index22) })
        ] : [],
        ...values.size > 0 ? [
          (0, runtime2.formatMessage)({
            defaultMessage: "文字填充图片的格式为 {kinds}，无法嵌入文字，已使用纯色导出。",
            id: "o1hLejQVqP"
          }, {
            kinds: new Intl.ListFormat((0, runtime2.intlLocale)("ListFormat", "en"), { type: "conjunction", style: "narrow" }).format([...values].map((kind) => kind === SVG_TOO_LARGE_KIND ? (0, runtime2.formatMessage)({
              defaultMessage: "超过 {size} KB 的 SVG",
              id: "psxOQEzlnb"
            }, {
              size: String(Math.round(runtime2.maxInlineSvgBytes / 1024))
            }) : kind === UNKNOWN_TYPE_KIND ? (0, runtime2.formatMessage)({
              defaultMessage: "未知格式",
              id: "O3oBhanWOy"
            }) : kind))
          })
        ] : []
      ]
    };
  }
  function incompleteDeckExportConfirmation(action, loadedCount, totalCount) {
    return {
      title: PRESENTATION_BUILDING_MESSAGE,
      message: (action === "Send" ? "Sending" : "Downloading") + " now would include only " + String(loadedCount) + " / " + String(totalCount) + " slides. " + action + " " + (loadedCount === 1 ? "that one" : "those") + " now, or wait for the rest, then " + action.toLowerCase() + " again.",
      confirmLabel: action + " anyway"
    };
  }
  function PresentationWaitingAnnouncement({ waiting, slideCount, turnBusy, startSaidElsewhere, onStartSaid }) {
    let ref = runtime2.reactd0.useRef(waiting);
    return runtime2.reactd0.useEffect(() => {
      waiting ? startSaidElsewhere?.() !== !0 && (0, runtime2.announceLiveMessage)(() => (onStartSaid?.(), PRESENTATION_BUILDING_MESSAGE), {
        ifIdle: !0
      }) : ref.current && !turnBusy && slideCount > 0 && (0, runtime2.announceLiveMessage)(runtime2.PRESENTATION_CHANGE_ANNOUNCEMENTS.ready(slideCount), {
        ifIdle: !0
      }), ref.current = waiting;
    }, [waiting]), null;
  }
  function findVisibleSlidesViewSwitch() {
    for (let value of document.querySelectorAll(ACTIVE_SLIDES_VIEW_SWITCH_SELECTOR))
      if (value.closest('[inert], [aria-hidden="true"], [data-slides-grid-leaving]') === null)
        return value;
    return null;
  }
  function SlidesApp({ host } = {}) {
    let memoryScope = host?.memoryScope ?? "";
    runtime2.reactd0.useState(() => (0, runtime2.setCommentAnchorScope)(memoryScope)), runtime2.reactd0.useEffect(() => ((0, runtime2.setCommentAnchorScope)(memoryScope), () => (0, runtime2.setCommentAnchorScope)("")), [memoryScope]);
    let scopedSlideKey = runtime2.reactd0.useCallback((input) => memoryScope === "" ? input : memoryScope + "/" + input, [memoryScope]);
    (0, runtime2.useFileDrop)({
      onFiles: ignoreGlobalFileDrop,
      disabled: !0
    });
    let documentStore = runtime2.reactd0.useMemo(() => new runtime2.SlidesDocumentStore(), []), codecState = runtime2.reactd0.useMemo(() => (0, runtime2.getSlideDocumentCodec)(documentStore.doc), [documentStore]), { slideHtmlHold: slideHtmlHold2, awaitingSlides, awaitedSlideCount, subscribeMeta, hidingMovedDeck } = codecState, creationActivityRef = runtime2.reactd0.useRef(null), undoRedoListenerRef = runtime2.reactd0.useRef(() => {
    }), undoHistory = runtime2.reactd0.useMemo(() => (0, runtime2.createDeckCommandHistory)(host?.undo ?? (0, runtime2.createCommandHistory)(), (input) => documentStore.doc.commit?.(input), (input, options) => {
      input === "do" && creationActivityRef.current?.(options.structural === !0 ? "structure" : "edit"), (input === "undo" || input === "redo") && undoRedoListenerRef.current(input), (0, runtime2.reportArtifactFeedback)(input === "do" ? "step" : input === "declined" ? "undo-declined" : input, options);
    }, {
      tokens: () => {
        let doc = documentStore.doc;
        if (typeof doc.takeTouched == "function" && typeof doc.structureRev == "function" && typeof doc.slideRev == "function" && typeof doc.clashLocal == "function")
          return doc;
      },
      tell: (input) => (0, runtime2.showToast)(input)
    }), [host?.undo, documentStore]), snapshot = runtime2.reactd0.useSyncExternalStore(runtime2.reactd0.useCallback((input) => documentStore.subscribe(input), [documentStore]), () => documentStore.getSnapshot()), readOnly = documentStore.doc.readOnly(), saveMessage = runtime2.reactd0.useSyncExternalStore(runtime2.reactd0.useCallback((input) => documentStore.doc.subscribeSave(() => input()), [documentStore]), () => documentStore.doc.saveState().message ?? ""), saveStatus = runtime2.reactd0.useSyncExternalStore(runtime2.reactd0.useCallback((input) => documentStore.doc.subscribeSave(() => input()), [documentStore]), () => documentStore.doc.saveState().status), initialPlaceLinkRef = runtime2.reactd0.useRef(void 0);
    initialPlaceLinkRef.current === void 0 && (initialPlaceLinkRef.current = host === void 0 ? (0, runtime2.resolvePagePlaceLink)() : null);
    let pendingPlaceFragmentRef = runtime2.reactd0.useRef(initialPlaceLinkRef.current?.why === "new" ? initialPlaceLinkRef.current.place : null), clearInitialPlaceLink = () => {
      initialPlaceLinkRef.current != null && (0, runtime2.writePlaceLinkField)("link", initialPlaceLinkRef.current.place), initialPlaceLinkRef.current = null, pendingPlaceFragmentRef.current = null;
    }, [initialCurrentSlide] = runtime2.reactd0.useState(() => {
      let order = documentStore.getSnapshot().meta.order, value = (0, runtime2.newLinkedSlideId)(order, initialPlaceLinkRef.current ?? null, !awaitingSlides());
      return value !== void 0 ? {
        id: value,
        exact: !0,
        at: order.indexOf(value),
        home: null
      } : (0, runtime2.resolveRememberedCurrentSlide)(order, host?.memoryScope);
    }), [currentSlideId, setCurrentSlideId] = runtime2.reactd0.useState(initialCurrentSlide.id), lastSelectedSlideIdRef = runtime2.reactd0.useRef(initialCurrentSlide.id), rememberedSlideFallbackRef = runtime2.reactd0.useRef(initialCurrentSlide.exact || initialCurrentSlide.id === null ? null : {
      id: initialCurrentSlide.id,
      at: initialCurrentSlide.at,
      home: initialCurrentSlide.home,
      load: !0,
      since: Date.now()
    }), currentSlideIndexRef = runtime2.reactd0.useRef(initialCurrentSlide.at);
    runtime2.reactd0.useEffect(() => {
      let order = snapshot.meta.order;
      if (order.length === 0)
        return;
      let value = Date.now(), callback = (input) => {
        lastSelectedSlideIdRef.current = input, setCurrentSlideId(input), setSelection([]), setTextEditState(null);
      }, current = pendingPlaceFragmentRef.current;
      if (current === null)
        clearInitialPlaceLink();
      else {
        let settledOrder = !awaitingSlides() && order === documentStore.getSnapshot().meta.order, value4 = (0, runtime2.resolveSlidePlaceFragment)(current, order, settledOrder), value5 = currentSlideId !== null && currentSlideId !== lastSelectedSlideIdRef.current;
        if ((value4 !== void 0 || value5 || settledOrder) && clearInitialPlaceLink(), value4 !== void 0 && !value5 && value4 !== currentSlideId && selectionRef.current.length === 0 && !textEditingRef.current) {
          rememberedSlideFallbackRef.current = null, callback(value4);
          return;
        }
      }
      if (currentSlideId === null) {
        let value4 = (0, runtime2.resolveRememberedCurrentSlide)(order, host?.memoryScope, !awaitingSlides());
        if (value4.id === null)
          return;
        rememberedSlideFallbackRef.current = value4.exact ? null : {
          id: value4.id,
          at: value4.at,
          home: value4.home,
          load: !0,
          since: value
        }, callback(value4.id);
        return;
      }
      rememberedSlideFallbackRef.current !== null && rememberedSlideFallbackRef.current.id !== currentSlideId && (rememberedSlideFallbackRef.current = null);
      let current2 = rememberedSlideFallbackRef.current;
      current2 !== null && current2.home !== null && value - current2.since >= VIDEO_UPLOAD_TIMEOUT_MS && (current2.home = null);
      let value2 = current2 !== null ? current2.home : null, value3 = order.indexOf(currentSlideId);
      if (value3 < 0) {
        if (awaitingSlides())
          return;
        let value4 = value2 !== null && order.includes(value2) ? value2 : (0, runtime2.slideAtClampedIndex)(order, currentSlideIndexRef.current);
        rememberedSlideFallbackRef.current = value4 === value2 ? null : {
          id: value4,
          at: order.indexOf(value4),
          home: value2 ?? currentSlideId,
          load: !1,
          since: current2 !== null && value2 !== null ? current2.since : value
        }, callback(value4);
        return;
      }
      if (value2 !== null && order.includes(value2)) {
        rememberedSlideFallbackRef.current = null, callback(value2);
        return;
      }
      currentSlideIndexRef.current = value3, !(current2 !== null && current2.load && current2.at === value3) && (current2 !== null && (current2.load = !1), (0, runtime2.writeCurrentSlidePreference)(currentSlideId, value3, host?.memoryScope));
    }, [currentSlideId, snapshot.meta.order, host?.memoryScope]);
    let cameraPreferenceRef = runtime2.reactd0.useRef(void 0);
    cameraPreferenceRef.current === void 0 && (cameraPreferenceRef.current = (pendingPlaceFragmentRef.current === null ? (0, runtime2.readCanvasCameraPreference)(host?.memoryScope) : void 0) ?? null);
    let [gridRequested, setGridRequested] = runtime2.reactd0.useState(cameraPreferenceRef.current?.canvas === !0), gridOpen = gridRequested && snapshot.slides.length > 0, deckEmpty = snapshot.slides.length === 0;
    runtime2.reactd0.useEffect(() => {
      !deckEmpty || saveStatus === "loading" || (setGridRequested(!1), setEditingGridSlide(!1), setGridSlideSurround(null));
    }, [deckEmpty, saveStatus]);
    let [gridSelection, setGridSelection] = runtime2.reactd0.useState(EMPTY_SLIDE_GRID_SELECTION), gridEnterFromRectRef = runtime2.reactd0.useRef(null), [gridLeaving, setGridLeaving] = runtime2.reactd0.useState(!1), gridLeavingRef = runtime2.reactd0.useRef(!1);
    gridLeavingRef.current = gridLeaving;
    let [gridMountGeneration, bumpGridMountGeneration] = runtime2.reactd0.useState(0), [editingGridSlide, setEditingGridSlide] = runtime2.reactd0.useState(!1), editingGridSlideRef = runtime2.reactd0.useRef(!1);
    editingGridSlideRef.current = editingGridSlide;
    let gridOpenRef = runtime2.reactd0.useRef(gridOpen);
    gridOpenRef.current = gridOpen;
    let saveCameraPreference = runtime2.reactd0.useCallback((canvas, view) => {
      canvas === (gridOpenRef.current || editingGridSlideRef.current) && (cameraPreferenceRef.current = null, (0, runtime2.writeCanvasCameraPreference)({ canvas, view }, host?.memoryScope));
    }, [host?.memoryScope]), saveSlideCamera = runtime2.reactd0.useCallback((input) => saveCameraPreference(!1, input), [saveCameraPreference]), saveCanvasCamera = runtime2.reactd0.useCallback((input) => saveCameraPreference(!0, input), [saveCameraPreference]), [gridSlideSurround, setGridSlideSurround] = runtime2.reactd0.useState(null), selectGridSlideSurround = runtime2.reactd0.useCallback((input, options) => {
      let current = gridZoomApiRef.current, value = current?.tileRect(input);
      return !current || !value ? !1 : (setGridSlideSurround({
        id: input,
        rect: value,
        ...current.getLimits(),
        pick: options && {
          x: value.left + options.fx * value.width,
          y: value.top + options.fy * value.height
        }
      }), !0);
    }, []), gridFollowRef = runtime2.reactd0.useRef(null), followGridEditingSlide = runtime2.reactd0.useCallback(() => {
      let current = gridFollowRef.current;
      current && gridZoomApiRef.current?.follow(current.id, current.view, current.rect);
    }, []), focusViewSwitchAfterCloseRef = runtime2.reactd0.useRef(!1), focusEditor = runtime2.reactd0.useCallback((input = ACTIVE_SLIDE_SURFACE_SELECTOR) => {
      requestAnimationFrame(() => {
        let current = focusViewSwitchAfterCloseRef.current;
        focusViewSwitchAfterCloseRef.current = !1, !document.activeElement?.closest("[data-slides-editor]") && ((current ? findVisibleSlidesViewSwitch() : null) ?? document.querySelector(input))?.focus({
          preventScroll: !0
        });
      });
    }, []), openGridSlideInEditor = runtime2.reactd0.useCallback((input, options, context = EDITOR_TAB_TARGET_SELECTOR) => gridLeavingRef.current || !selectGridSlideSurround(input, options) ? !1 : (setCurrentSlideId(input), setSelection([]), setTextEditState(null), setGridSelection(EMPTY_SLIDE_GRID_SELECTION), setCommentViewReveal(null), setGridRequested(!1), setEditingGridSlide(!0), document.activeElement instanceof HTMLElement && document.activeElement.closest("[data-slides-grid]") && document.activeElement.blur(), focusViewSwitchAfterCloseRef.current = !1, focusEditor(context), !0), [selectGridSlideSurround, focusEditor]), handleGridOpenSlide = runtime2.reactd0.useCallback((input, options) => openGridSlideInEditor(input, options, options === void 0 ? ACTIVE_SLIDE_SURFACE_SELECTOR : EDITOR_TAB_TARGET_SELECTOR), [openGridSlideInEditor]), returnToGrid = runtime2.reactd0.useCallback((input) => {
      setEditingGridSlide(!1), setGridSlideSurround(null), setSelection([]), setTextEditState(null), setInspectorOpen(!1), setGridSelection(EMPTY_SLIDE_GRID_SELECTION), setGridRequested(!0), input?.select !== void 0 && setCurrentSlideId(input.select), input?.fit && gridZoomApiRef.current?.fitAll(currentSlideRef.current?.id);
    }, []), openGrid = runtime2.reactd0.useCallback(() => {
      if (documentStore.getSnapshot().meta.order.length === 0)
        return;
      if (editingGridSlideRef.current)
        return returnToGrid({
          fit: !0
        });
      let value = getActiveSlideSurfaceRect(), value2 = currentSlideRef.current?.id;
      gridEnterFromRectRef.current = value && value2 !== void 0 ? {
        id: value2,
        rect: value
      } : null, setSelection([]), setTextEditState(null), setInspectorOpen(!1), setGridSelection(EMPTY_SLIDE_GRID_SELECTION), gridLeavingRef.current && bumpGridMountGeneration((input) => input + 1), focusViewSwitchAfterCloseRef.current = !1, setGridLeaving(!1), setGridRequested(!0);
    }, [documentStore, returnToGrid]), wasEditingWhenGridLeftRef = runtime2.reactd0.useRef(!1), closeGrid = runtime2.reactd0.useCallback((input = !1) => {
      wasEditingWhenGridLeftRef.current = editingGridSlideRef.current, focusViewSwitchAfterCloseRef.current = input && !editingGridSlideRef.current, editingGridSlideRef.current && returnToGrid(), setGridSelection(EMPTY_SLIDE_GRID_SELECTION), setCommentViewReveal(null), setGridRequested(!1), gridZoomApiRef.current !== null ? setGridLeaving(!0) : focusEditor();
    }, [focusEditor, returnToGrid]), closeGridFromButton = runtime2.reactd0.useCallback(() => closeGrid(!0), [closeGrid]), setGridOpen = runtime2.reactd0.useCallback((input) => input ? openGrid() : closeGrid(!0), [openGrid, closeGrid]);
    runtime2.reactd0.useEffect(() => {
      gridOpen && (gridEnterFromRectRef.current = null);
    }, [gridOpen]), runtime2.reactd0.useEffect(() => {
      if (!gridLeaving)
        return;
      let value = requestAnimationFrame(() => {
        let value2 = getActiveSlideSurfaceRect(), value3 = currentSlideRef.current?.id, current = gridZoomApiRef.current, callback = () => {
          setGridLeaving(!1), gridTransitionActiveRef.current || focusEditor();
        };
        !value2 || value3 === void 0 || !current ? callback() : current.glideToSlide(value3, value2, callback);
      });
      return () => cancelAnimationFrame(value);
    }, [gridLeaving, focusEditor]);
    let gridTransitionActiveRef = runtime2.reactd0.useRef(!1);
    gridTransitionActiveRef.current = gridOpen;
    let textEditRef = runtime2.reactd0.useRef(null);
    runtime2.reactd0.useEffect(() => {
      let callback = (event) => {
        if (event.defaultPrevented || event.repeat || presentingRef.current || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.code !== "Digit0" || (0, runtime2.hasOpenOverlay)() || textEditRef.current !== null)
          return;
        let target = event.target;
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || (event.preventDefault(), gridTransitionActiveRef.current ? closeGrid() : openGrid());
      };
      return window.addEventListener("keydown", callback), () => window.removeEventListener("keydown", callback);
    }, [openGrid, closeGrid]);
    let railChosenRef = runtime2.reactd0.useRef(!1);
    runtime2.reactd0.useEffect(() => {
      let callback = () => {
        railChosenRef.current || setRailOpen((0, runtime2.canResizeSlideRail)(window.innerWidth, window.innerHeight, coarsePointerNow()));
      };
      return window.addEventListener("resize", callback), () => window.removeEventListener("resize", callback);
    }, []);
    let chooseRailOpen = runtime2.reactd0.useCallback((input) => {
      railChosenRef.current = !0, setRailOpen(input), requestAnimationFrame(() => {
        document.querySelector(input ? "[data-slides-rail-hide]" : "[data-slides-rail-show]")?.focus({
          preventScroll: !0
        });
      });
    }, []), presentingRef = runtime2.reactd0.useRef(!1), focusAfterPresentation = runtime2.reactd0.useCallback(() => {
      let callback = () => requestAnimationFrame(() => {
        if (presentingRef.current || !document.hasFocus())
          return;
        let activeElement2 = document.activeElement;
        activeElement2 !== null && activeElement2 !== document.body && activeElement2.getClientRects().length > 0 && activeElement2.closest("[data-slides-present-entry]") === null || Array.from(document.querySelectorAll("[data-slides-present-entry] button")).find((input) => input.getClientRects().length > 0)?.focus({
          preventScroll: !0
        });
      });
      if ((0, runtime2.getFullscreenElement)() === null) {
        callback();
        return;
      }
      let flag = !1, callback2 = () => {
        flag || (flag = !0, value(), clearTimeout(value2), callback());
      }, value = (0, runtime2.subscribeFullscreenChange)(callback2), value2 = setTimeout(callback2, 3e3);
    }, []), exitPresentation = runtime2.reactd0.useCallback((input, options = !0) => {
      presentingRef.current = !1, setPresentationStartIndex(null), setFullscreenRequest(null), setPresentationCurrentIndex(null), input !== void 0 && setCurrentSlideId(input), options && focusAfterPresentation();
    }, [focusAfterPresentation]), lastRestoreCountRef = runtime2.reactd0.useRef(0);
    runtime2.reactd0.useEffect(() => documentStore.doc.subscribe(() => {
      documentStore.doc.restoreCount() !== lastRestoreCountRef.current && (lastRestoreCountRef.current = documentStore.doc.restoreCount(), undoHistory.clear(), setSelection([]), setTextEditState(null));
    }), [documentStore, undoHistory]);
    let [selection, setSelectionState] = runtime2.reactd0.useState([]), selectionRef = runtime2.reactd0.useRef(selection);
    selectionRef.current = selection;
    let currentSelectionRef = runtime2.reactd0.useRef(selection), setSelection = runtime2.reactd0.useCallback((input) => {
      currentSelectionRef.current = typeof input == "function" ? input(currentSelectionRef.current) : input, setSelectionState(currentSelectionRef.current);
    }, []), [gestureSelectionController] = runtime2.reactd0.useState(() => (0, runtime2.createSlideGestureHistory)({
      latest: () => currentSelectionRef.current,
      onScreen: (input) => currentSlideRef.current?.id === input && !presentingRef.current,
      selectable: (input) => currentSlideRef.current?.id === input && !gridTransitionActiveRef.current && !presentingRef.current && !textEditingRef.current && !commentModeRef.current && !liveGestureRef.current && !dragActiveRef.current ? documentStore.getSlide(input) : void 0,
      select: setSelection
    })), bootStyleNoticeShownRef = runtime2.reactd0.useRef(!1);
    runtime2.reactd0.useEffect(() => {
      if (bootStyleNoticeShownRef.current)
        return;
      bootStyleNoticeShownRef.current = !0;
      let droppedStyles = documentStore.bootReport.droppedStyles, value = documentStore.bootReport.htmlErrors ?? 0, value2 = documentStore.bootReport.htmlWarnings ?? 0, value3 = "releaseHold" in documentStore.doc;
      if (value > 0) {
        let sample = documentStore.bootReport.htmlErrorSample;
        (0, runtime2.showToast)(sample !== void 0 ? value3 ? (0, runtime2.formatMessage)({
          defaultMessage: "演示文稿的 HTML 有 {count} 处结构错误，首处：{sample}。已载入可读部分；如内容缺失，请修复源文件。",
          id: "RTIEJj4our"
        }, { n: value, count: String(value), sample }) : (0, runtime2.formatMessage)({
          defaultMessage: "演示文稿的 HTML 有 {count} 处结构错误，首处：{sample}。当前尽量展示可读内容，无法保存。",
          id: "avyvEBtRID"
        }, { n: value, count: String(value), sample }) : value3 ? (0, runtime2.formatMessage)({
          defaultMessage: "演示文稿的 HTML 有 {count} 处结构错误。已载入可读部分；如内容缺失，请修复源文件。",
          id: "YrHh0ICfQz"
        }, { n: value, count: String(value) }) : (0, runtime2.formatMessage)({
          defaultMessage: "演示文稿的 HTML 有 {count} 处结构错误。当前尽量展示可读内容，无法保存。",
          id: "kj2WIexEXJ"
        }, { n: value, count: String(value) }));
      } else
        value2 > 0 && !documentStore.doc.readOnly() && (0, runtime2.showToast)(value3 ? (0, runtime2.formatMessage)({
          defaultMessage: "加载时已修复 {count} 个值，下次编辑对应幻灯片时会保存修复结果",
          id: "+9hnnOivg3"
        }, { n: value2, count: String(value2) }) : (0, runtime2.formatMessage)({
          defaultMessage: "加载时已修复 {count} 个值，保存时会写入修复结果",
          id: "J27XFqSVdn"
        }, { n: value2, count: String(value2) }));
      droppedStyles === 0 || documentStore.doc.readOnly() || (0, runtime2.showToast)((0, runtime2.formatMessage)({
        defaultMessage: "已移除 {count} 个不受支持的样式值",
        id: "NGWZNldssi"
      }, { n: droppedStyles, count: String(droppedStyles) }));
    }, [documentStore]);
    let [textEdit, setTextEditState] = runtime2.reactd0.useState(null);
    textEditRef.current = textEdit, (0, runtime2.useCoverTitleFromContent)(documentStore.doc, host === void 0 && textEdit !== null ? currentSlideId : null);
    let touchLayout = (0, runtime2.useCoarsePointer)(), toolbarButtonSize = touchLayout ? void 0 : "xs", modalOpen = (0, runtime2.useSmallCoarsePointer)(), [presentationStartIndex, setPresentationStartIndex] = runtime2.reactd0.useState(null), showCommentTargets = (gridOpen || gridLeaving || editingGridSlide) && presentationStartIndex === null;
    presentingRef.current = presentationStartIndex !== null;
    let speakerNotesSession = (0, runtime2.useSpeakerNotesSession)(), [dockSpeakerNotes, setDockSpeakerNotes] = runtime2.reactd0.useState(!1), [fullscreenRequest, setFullscreenRequest] = runtime2.reactd0.useState(null), [presentationCurrentIndex, setPresentationCurrentIndex] = runtime2.reactd0.useState(null), [exporting, setExporting] = runtime2.reactd0.useState(!1), downloadsWithheld2 = (0, runtime2.useDownloadsWithheld)(), [extraExportFormats, setExtraExportFormats] = runtime2.reactd0.useState(!1);
    runtime2.reactd0.useEffect(() => {
      let flag = !0;
      return (0, runtime2.getFeatureFlagAsync)(EXTRA_EXPORT_FORMATS_META_NAME, !1).then((input) => {
        flag && setExtraExportFormats(input);
      }), () => {
        flag = !1;
      };
    }, []);
    let [textToolOn, setTextToolOn] = runtime2.reactd0.useState(!1), textToolOnRef = runtime2.reactd0.useRef(!1), textButtonRef = runtime2.reactd0.useRef(null);
    textToolOnRef.current = textToolOn;
    let stopTextTool = (quiet) => {
      textToolOnRef.current && (setTextToolOn(!1), (0, runtime2.announceLiveMessage)("Text tool off.", quiet === !0 ? { ifIdle: !0 } : void 0));
    }, stopTextToolRef = runtime2.reactd0.useRef(stopTextTool);
    stopTextToolRef.current = stopTextTool;
    let [phoneRemoteFlag, setPhoneRemoteFlag] = runtime2.reactd0.useState(void 0);
    runtime2.reactd0.useEffect(() => {
      let live = !0;
      return (0, runtime2.getFeatureFlagAsync)(PHONE_REMOTE_FLAG, !1).then((input) => {
        live && setPhoneRemoteFlag(input);
      }), () => {
        live = !1;
      };
    }, []);
    let phoneRemote = phoneRemoteFlag === !0 && host === void 0, [exportDelivery, setExportDelivery] = runtime2.reactd0.useState(null), [exportNotes, setExportNotes] = runtime2.reactd0.useState(null), [templatePickerOpen, setTemplatePickerOpen] = runtime2.reactd0.useState(!1), [templatePickerReturnFocus, setTemplatePickerReturnFocus] = runtime2.reactd0.useState(void 0), openTemplatePicker = (input) => {
      setTemplatePickerReturnFocus(() => input?.returnFocus), setTemplatePickerOpen(!0);
    }, [insertMenuOpen, setInsertMenuOpen] = runtime2.reactd0.useState(!1), [focusInsertMenuOnOpen, setFocusInsertMenuOnOpen] = runtime2.reactd0.useState(!1);
    runtime2.reactd0.useEffect(() => {
      readOnly && (setTextEditState(null), setTemplatePickerOpen(!1), setInspectorOpen(!1));
    }, [readOnly]);
    let editorZoomApiRef = runtime2.reactd0.useRef(null), editorScaleSubscribers = runtime2.reactd0.useRef(/* @__PURE__ */ new Set()), editorScaleRef = runtime2.reactd0.useRef(null), subscribeEditorScale = runtime2.reactd0.useCallback((input) => (editorScaleSubscribers.current.add(input), editorScaleRef.current !== null && input(editorScaleRef.current), () => {
      editorScaleSubscribers.current.delete(input);
    }), []), setToolbarScale = runtime2.reactd0.useCallback((input) => {
      editorScaleRef.current = input;
      for (let value of editorScaleSubscribers.current)
        value(input);
    }, []), gridZoomApiRef = runtime2.reactd0.useRef(null), showCommentSlide = runtime2.reactd0.useCallback((input, options) => gridZoomApiRef.current?.showSlide(input, options) ?? !1, []), commentViewSettling = runtime2.reactd0.useCallback(() => gridZoomApiRef.current?.settling() ?? !0, []), [commentViewReveal, setCommentViewReveal] = runtime2.reactd0.useState(null), commentModeRef = runtime2.reactd0.useRef(!1), gridLeavingPanelRef = runtime2.reactd0.useRef(null), gridScaleRef = runtime2.reactd0.useRef(null), gridScaleSubscribers = runtime2.reactd0.useRef(/* @__PURE__ */ new Set()), subscribeGridScale = runtime2.reactd0.useCallback((input) => (gridScaleSubscribers.current.add(input), gridScaleRef.current !== null && input(gridScaleRef.current), () => {
      gridScaleSubscribers.current.delete(input);
    }), []), onGridScaleChange = runtime2.reactd0.useCallback((input) => {
      gridScaleRef.current = input;
      for (let value of gridScaleSubscribers.current)
        value(input);
    }, []), [railOpen, setRailOpen] = runtime2.reactd0.useState(() => (0, runtime2.canResizeSlideRail)(window.innerWidth, window.innerHeight, touchLayout)), [notesOpen, setNotesOpen] = runtime2.reactd0.useState(!1), [notesHeight, setNotesHeight] = runtime2.reactd0.useState(runtime2.DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT), [thumbWidth, setThumbWidth] = runtime2.reactd0.useState(runtime2.readRailThumbWidthPreference), railGeometryRef = runtime2.reactd0.useRef(null), notesResizeGeometryRef = runtime2.reactd0.useRef(null), [inspectorOpen, setInspectorOpen] = runtime2.reactd0.useState(!1), [inspectorUnasked, setInspectorUnasked] = runtime2.reactd0.useState(inspectorOpen), [inspectorTab, setInspectorTab] = runtime2.reactd0.useState("properties"), inspectorContentRef = runtime2.reactd0.useRef(null), inspectorRegion = runtime2.reactd0.useCallback(() => inspectorContentRef.current?.closest('[role="complementary"], [role="dialog"]') ?? null, []), inspectorCloseButton = runtime2.reactd0.useCallback(() => {
      let value = inspectorContentRef.current?.querySelectorAll(runtime2.FOCUS_REGION_FOCUSABLE_SELECTOR) ?? [], value2 = Array.from(value).find((input) => input.closest("[data-property-row]") !== null && !input.matches('[data-kit="row-reset"]') && input.getClientRects().length > 0), value3 = inspectorRegion()?.querySelector('[data-kit="panel-header"] button');
      return value2 ?? (value3 != null && value3.getClientRects().length > 0 ? value3 : null);
    }, [inspectorRegion]), inspectorReturnFocusRef = runtime2.reactd0.useRef(null), inspectorPointerInvocationRef = runtime2.reactd0.useRef(!1), inspectorHadFocusRef = runtime2.reactd0.useRef(!1), inspectorLastFocusRegionRef = runtime2.reactd0.useRef(null), [pageOcclusionBand, setPageOcclusionBand] = runtime2.reactd0.useState(0), pageOcclusionObserverRef = runtime2.reactd0.useRef(null), creationRailRef = runtime2.reactd0.useCallback((input) => {
      if (pageOcclusionObserverRef.current?.disconnect(), pageOcclusionObserverRef.current = null, input === null) {
        setPageOcclusionBand(0);
        return;
      }
      let callback = () => {
        let offsetParent = input.offsetParent;
        setPageOcclusionBand(offsetParent instanceof HTMLElement ? offsetParent.clientHeight - input.offsetTop : 0);
      };
      callback(), pageOcclusionObserverRef.current = new ResizeObserver(callback), pageOcclusionObserverRef.current.observe(input, {
        box: "border-box"
      });
    }, []), imageUploadInputRef = runtime2.reactd0.useRef(null), uploadInvocationRef = runtime2.reactd0.useRef(!1), clickUploadInput = (input, options = imageUploadInputRef) => {
      stopTextTool(), uploadInvocationRef.current = input, options.current?.click();
    }, insertMenuRef = runtime2.reactd0.useRef(null), [insertMenuRecentlyActive, setInsertMenuRecentlyActive] = runtime2.reactd0.useState(!1), insertGestureActiveRef = runtime2.reactd0.useRef(!1), lastInsertGestureAtRef = runtime2.reactd0.useRef(-1 / 0), insertGestureSequenceRef = runtime2.reactd0.useRef(0);
    runtime2.reactd0.useEffect(() => {
      let callback = () => {
        lastInsertGestureAtRef.current = performance.now(), insertGestureActiveRef.current = !0, insertGestureSequenceRef.current += 1;
      }, callback2 = () => {
        lastInsertGestureAtRef.current = -1 / 0;
      }, callback3 = (event) => {
        insertGestureActiveRef.current = performance.now() - lastInsertGestureAtRef.current < 300, setInsertMenuRecentlyActive(event.target instanceof Node && (insertMenuRef.current?.contains(event.target) ?? !1));
      }, callback4 = (input) => {
        setInsertMenuRecentlyActive(input.relatedTarget instanceof Node && (insertMenuRef.current?.contains(input.relatedTarget) ?? !1));
      };
      return document.addEventListener("pointerdown", callback, !0), document.addEventListener("keydown", callback2, !0), document.addEventListener("focusin", callback3), document.addEventListener("focusout", callback4), () => {
        document.removeEventListener("pointerdown", callback, !0), document.removeEventListener("keydown", callback2, !0), document.removeEventListener("focusin", callback3), document.removeEventListener("focusout", callback4);
      };
    }, []), runtime2.reactd0.useEffect(() => {
      railOpen || setInsertMenuRecentlyActive(!1);
    }, [railOpen]);
    let insertWasKeyboard = () => !insertGestureActiveRef.current && !insertMenuRecentlyActive, slides = snapshot.slides, deckTypeStyles = runtime2.reactd0.useMemo(() => (0, runtime2.inferDeckTypographyStyles)(snapshot.baseline, snapshot.meta.theme), [snapshot.baseline, snapshot.meta.theme]), designSystem = (0, runtime2.useDesignSystems)(), designSystemActive = (0, runtime2.hasDesignSystems)(designSystem), typefaceLookup = runtime2.reactd0.useMemo(() => (0, runtime2.collectDeckFontFamilies)(snapshot.faces, snapshot.fonts), [snapshot.faces, snapshot.fonts]), currentTypeStyles = runtime2.reactd0.useMemo(() => designSystemActive ? (0, runtime2.designSystemTypographyStyles)(designSystem, snapshot.meta.theme, typefaceLookup) : deckTypeStyles, [
      designSystemActive,
      designSystem,
      snapshot.meta.theme,
      typefaceLookup,
      deckTypeStyles
    ]), allTypeStyles = runtime2.reactd0.useMemo(() => currentTypeStyles === deckTypeStyles ? currentTypeStyles : [...currentTypeStyles, ...deckTypeStyles], [currentTypeStyles, deckTypeStyles]), commentRemeasureRef = runtime2.reactd0.useRef(null), remeasureCommentsOnStageMove = runtime2.reactd0.useCallback(() => commentRemeasureRef.current?.(), []), commentController = (0, runtime2.useSlideCommentController)({
      onMode: (input) => {
        if (!input)
          return setCommentViewReveal(null);
        setSelection([]), setTextEditState(null);
      },
      onReveal: (input) => {
        let value = (0, runtime2.resolveCommentSlide)(input, slides);
        value && (presentationStartIndex !== null && exitPresentation(void 0, !1), gridOpen && commentModeRef.current ? setCommentViewReveal(input) : gridRequested && closeGrid(), setCurrentSlideId(value.id));
      }
    }), commentMode = commentController.ctl !== null && commentController.on, commentPinning = commentController.on && presentationStartIndex === null && commentController.ctl === null;
    commentModeRef.current = commentMode;
    let openCommentCounts = runtime2.reactd0.useMemo(() => commentMode ? (0, runtime2.countOpenCommentsBySlide)(commentController.threads, slides) : void 0, [commentMode, commentController.threads, slides]), commentModePersistent = runtime2.reactd0.useCallback((input) => insertMenuRef.current?.contains(input) === !0 || gridTransitionActiveRef.current && gridLeavingPanelRef.current?.contains(input) === !0 || input.closest("[data-slides-zoom], [data-mc-scrim]") !== null || input.closest(runtime2.OPEN_OVERLAY_SELECTOR) !== null && document.querySelector('[data-slides-zoom] [aria-expanded="true"]') !== null, []), presentableSlides = runtime2.reactd0.useMemo(() => slides.filter((input) => input.skipped !== !0), [slides]), fontCss = runtime2.reactd0.useMemo(() => (0, runtime2.buildDeckThemeCss)(snapshot.fonts, snapshot.faces), [snapshot.fonts, snapshot.faces]), fullFontFaces = runtime2.reactd0.useMemo(() => !(0, runtime2.canCarryAnotherFontFace)(snapshot.faces, (0, runtime2.usedDeckFontFamilies)([
      ...snapshot.slides,
      ...snapshot.baseline
    ])), [snapshot.faces, snapshot.slides, snapshot.baseline]);
    runtime2.reactd0.useEffect(() => {
      if (!extraExportFormats || typeof document > "u" || !("fonts" in document))
        return;
      let live = !0, warm = () => {
        live && Promise.resolve().then(() => {
          (0, runtime2.initializeExportFontWarming)();
        }).then(() => live ? (0, runtime2.warmExportWebFonts)(fontCss) : void 0, () => {
        });
      };
      return document.fonts.ready.then(warm), document.fonts.addEventListener("loadingdone", warm), () => {
        live = !1, document.fonts.removeEventListener("loadingdone", warm);
      };
    }, [extraExportFormats, fontCss]), runtime2.reactd0.useEffect(() => {
      presentationStartIndex === null || presentableSlides.length > 0 || exitPresentation();
    }, [presentationStartIndex, presentableSlides.length, exitPresentation]), runtime2.reactd0.useEffect(() => (window.addEventListener("slides-exit-presentation", exitPresentation), () => window.removeEventListener("slides-exit-presentation", exitPresentation)), [exitPresentation]);
    let themeTabEnabled = (0, runtime2.useThemeTabEnabled)() && !readOnly && snapshot.meta.theme === "neutral", restyleHost = runtime2.reactd0.useMemo(() => ({
      store: documentStore,
      undo: undoHistory,
      held: (input) => slideHtmlHold2(input) !== void 0,
      tell: (input) => void (0, runtime2.showToast)(input),
      announce: (input) => (0, runtime2.announceLiveMessage)(input),
      commit: () => void documentStore.doc.commit?.("edit step")
    }), [documentStore, undoHistory, slideHtmlHold2]), deckRestyle = (0, runtime2.useDeckRestyle)({
      host: restyleHost,
      snap: snapshot,
      enabled: themeTabEnabled,
      open: themeTabEnabled && inspectorOpen && inspectorTab === "theme"
    }), themeTabShown = themeTabEnabled && inspectorTab === "theme", pendingLook = textEdit === null ? deckRestyle.peeked : void 0, deferredPendingLook = runtime2.reactd0.useDeferredValue(pendingLook), railSlides = runtime2.reactd0.useMemo(() => Object.fromEntries(slides.map((input) => [input.id, input])), [slides]), currentSlide = (currentSlideId !== null ? slides.find((input) => input.id === currentSlideId) : void 0) ?? slides[Math.min(currentSlideIndexRef.current, slides.length - 1)], getCurrentSlide = () => currentSlide !== void 0 ? documentStore.getSlide(currentSlide.id) ?? currentSlide : void 0, selectRailSlide = (input) => {
      setCurrentSlideId(input), setSelection([]), setTextEditState(null);
    }, slideOrderIds = runtime2.reactd0.useMemo(() => slides.map((input) => input.id), [slides]), slideSelection = (0, runtime2.useSlideSelection)({
      order: slideOrderIds,
      currentId: currentSlide?.id ?? null,
      onSelect: selectRailSlide
    }), severalSlides = slideSelection.selected.length > 1, severalSlidesRef = runtime2.reactd0.useRef(severalSlides);
    severalSlidesRef.current = severalSlides, runtime2.reactd0.useLayoutEffect(() => {
      severalSlides && (setSelection((input) => input.length > 0 ? [] : input), setTextEditState(null));
    }, [severalSlides, slideSelection.selected, setSelection]);
    let collapseSlideSelection = slideSelection.collapse;
    runtime2.reactd0.useLayoutEffect(() => {
      (selection.length > 0 || textEdit !== null) && severalSlidesRef.current && collapseSlideSelection();
    }, [selection, textEdit, collapseSlideSelection]);
    let templateRestyler = runtime2.reactd0.useMemo(() => templatePickerOpen ? (0, runtime2.createTemplateRestyler)({
      current: currentSlide,
      slides,
      typeStyles: deckTypeStyles,
      theme: snapshot.meta.theme
    }) : void 0, [
      templatePickerOpen,
      currentSlide,
      slides,
      deckTypeStyles,
      snapshot.meta.theme
    ]), slideHtmlError = currentSlide !== void 0 ? slideHtmlHold2(currentSlide.id) : void 0, slideErrorMessage = slideHtmlError !== void 0 ? (0, runtime2.truncateUtf16Safely)(slideHtmlError, 160) + (slideHtmlError.length > 160 ? "…" : "") : void 0, currentSlideReadOnly = readOnly || slideErrorMessage !== void 0, canShowEmptyCreation = !currentSlide && !readOnly && (documentStore.bootReport.htmlErrors ?? 0) === 0 && !hidingMovedDeck(), creationController = (0, runtime2.useSlideCreation)({
      doc: documentStore.doc,
      codec: codecState,
      readOnly,
      stripOpen: railOpen && !editingGridSlide,
      current: currentSlide?.id ?? null
    });
    creationActivityRef.current = creationController.person;
    let creationView = creationController.view, creationOnEmptyDeck = !currentSlide && (creationView.greySlide || creationView.holdsEmptyDeck) && (documentStore.bootReport.htmlErrors ?? 0) === 0 && !hidingMovedDeck(), [presentationBusy, setPresentationBusy] = runtime2.reactd0.useState(!1), resolvedAwaitedSlideCount = awaitedSlideCount(), resolvedAwaitingSlides = resolvedAwaitedSlideCount > 0, creationCanShowPlaceholder = creationController.mayDraw && (creationView.greySlide || (creationView.cells?.some((input) => input.as === "box") ?? !1)), showAwaitingPlaceholder = resolvedAwaitingSlides && !creationCanShowPlaceholder, creationControllerRef = runtime2.reactd0.useRef(creationController);
    creationControllerRef.current = creationController;
    let railSlidesShown = !editingGridSlide && (currentSlide !== void 0 || creationView.cells !== null), railSelectionLive = railSlidesShown && !gridOpen && presentationStartIndex === null && railOpen;
    runtime2.reactd0.useEffect(() => {
      railSelectionLive || collapseSlideSelection();
    }, [railSelectionLive, collapseSlideSelection]);
    let duplicatedSelectionsRef = runtime2.reactd0.useRef(
      /* @__PURE__ */ new Map()
    ), selectionKey = (input) => [...input].sort().join(" "), rememberDuplicatedSelection = (input, source) => {
      let memory = duplicatedSelectionsRef.current;
      memory.set(selectionKey(input), [...source]), memory.size > 20 && memory.delete(memory.keys().next().value ?? "");
    };
    undoRedoListenerRef.current = (kind) => {
      insertMenuRef.current?.contains(document.activeElement) === !0 && refocusRailAfterRemoval(insertMenuRef);
      let order = documentStore.doc.content().order, restored = order.filter((input) => !slideOrderIds.includes(input)), removed = slideOrderIds.filter((input) => !order.includes(input));
      railSelectionLive && restored.length > 1 ? (0, runtime2.announceLiveMessage)(String(restored.length) + " slides restored") : railSelectionLive && removed.length > 1 && (0, runtime2.announceLiveMessage)(String(removed.length) + " slides removed");
      let reselect = restored.length > 1 ? restored : kind === "undo" && removed.length > 0 ? (duplicatedSelectionsRef.current.get(selectionKey(removed)) ?? []).filter((input) => order.includes(input)) : [];
      reselect.length < 2 || !railSelectionLive || selectionRef.current.length > 0 || textEdit !== null || (slideSelection.set(reselect), setCurrentSlideId(reselect[reselect.length - 1]));
    };
    let exportDialogPendingRef = runtime2.reactd0.useRef(null), withExportDialogPending = (input) => {
      let state = {};
      return exportDialogPendingRef.current = state, input().finally(() => {
        exportDialogPendingRef.current === state && (exportDialogPendingRef.current = null);
      });
    }, confirmCompleteDeckExport = (input) => awaitedSlideCount() === 0 ? Promise.resolve(!0) : withExportDialogPending(() => (0, runtime2.confirmEditorAction)(incompleteDeckExportConfirmation(input, presentableSlides.length, slides.length + resolvedAwaitedSlideCount)).then((input2) => input2 && exportStateRef.current.presentable.length > 0)), askPdfOptions = () => withExportDialogPending(() => (0, runtime2.requestPdfExportOptions)({
      defaults: runtime2.DEFAULT_PDF_EXPORT_OPTIONS
    }).then((input) => input !== null && exportStateRef.current.presentable.length > 0 ? input : null)), waitForGoogleSlidesReady = async () => {
      if (exportDialogPendingRef.current === null)
        return;
      (0, runtime2.dismissPdfExportOptions)(), (0, runtime2.dismissEditorDialog)();
      let state = {};
      exportDialogPendingRef.current = state, await new Promise((input) => {
        let value = setTimeout(input, 250);
        requestAnimationFrame(() => {
          clearTimeout(value), setTimeout(input, 0);
        });
      }), exportDialogPendingRef.current === state && (exportDialogPendingRef.current = null);
    };
    runtime2.reactd0.useEffect(() => {
      let value = awaitedSlideCount();
      return subscribeMeta(() => {
        let value2 = awaitedSlideCount();
        value > 0 && value2 === 0 && (0, runtime2.dismissEditorDialog)(), value = value2;
      });
    }, [awaitedSlideCount, subscribeMeta]);
    let singleSelectedGridSlide = gridOpen && gridSelection.sections.length === 0 && gridSelection.slides.length === 1 && gridSelection.slides[0] === currentSlide?.id, currentSlideHeld = slideErrorMessage !== void 0;
    runtime2.reactd0.useEffect(() => {
      currentSlideHeld && setTextEditState(null);
    }, [currentSlideHeld, currentSlide?.id]);
    let remoteHoldDocument = "releaseHold" in documentStore.doc ? documentStore.doc : null, activeSlideProtection = runtime2.reactd0.useMemo(() => remoteHoldDocument === null ? null : (0, runtime2.createActiveSlideProtection)((input) => remoteHoldDocument.releaseHold(input)), [remoteHoldDocument]);
    runtime2.reactd0.useEffect(() => () => activeSlideProtection?.dispose(), [activeSlideProtection]);
    let textEditing = textEdit !== null, textEditingRef = runtime2.reactd0.useRef(!1);
    textEditingRef.current = textEditing, runtime2.reactd0.useEffect(() => activeSlideProtection?.stage(currentSlide?.id, textEditing), [activeSlideProtection, currentSlide?.id, textEditing]);
    let setProtectedEditorSlide = runtime2.reactd0.useCallback((input, options) => activeSlideProtection?.input(input, options), [activeSlideProtection]), liveGestureRef = runtime2.reactd0.useRef(!1), dragActiveRef = runtime2.reactd0.useRef(!1), editorBusyPredicate = () => presentingRef.current || liveGestureRef.current || dragActiveRef.current || textEditingRef.current, recentGestureRef = runtime2.reactd0.useRef(!1);
    runtime2.reactd0.useEffect(() => ((0, runtime2.setRecentSlideBusyPredicate)(() => recentGestureRef.current || dragActiveRef.current), () => (0, runtime2.setRecentSlideBusyPredicate)(void 0)), []);
    let [gestureGeneration, bumpGestureGeneration] = runtime2.reactd0.useState(0), onLiveChange = runtime2.reactd0.useCallback((input) => {
      slideHtmlHold2(input.id) === void 0 && (setProtectedEditorSlide(input.id, textEditingRef.current ? void 0 : !0), textEditingRef.current || (recentGestureRef.current = !0), liveGestureRef.current = !0, gestureSelectionController.gestureFrame(documentStore.getSlide(input.id)), documentStore.setSlide(input));
    }, [setProtectedEditorSlide, documentStore, gestureSelectionController]);
    runtime2.reactd0.useEffect(() => {
      currentSlide && setSelection((items) => {
        let value = (0, runtime2.filterValidSelections)(currentSlide, items);
        return value.length === items.length ? items : value;
      });
    }, [currentSlide]);
    let lastEditedRevisionsRef = runtime2.reactd0.useRef(/* @__PURE__ */ new Map());
    runtime2.reactd0.useEffect(() => "slideRev" in documentStore.doc ? void 0 : (0, runtime2.subscribeRemoteDocumentChanges)(documentStore.doc, (input) => {
      input && lastEditedRevisionsRef.current.clear();
    }), [documentStore]), runtime2.reactd0.useEffect(() => {
      let unsubscribe = runtime2.roomPeerStore.subscribe(() => {
      });
      return () => void unsubscribe();
    }, []);
    let slideCapacityAvailable = runtime2.reactd0.useCallback((input) => slideHtmlHold2(input) === void 0 ? !1 : ((0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE), !0), []), canChangeSlide = runtime2.reactd0.useCallback((input) => {
      if (slideHtmlHold2(input.id) !== void 0)
        return (0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE), !1;
      let previous = documentStore.getSlide(input.id);
      return documentStore.setSlide(input), documentStore.getSlide(input.id) !== previous && lastEditedRevisionsRef.current.set(input.id, documentStore.doc.slideRev?.(input.id) ?? 0), !0;
    }, [documentStore]), commitDocumentBoundary = runtime2.reactd0.useCallback((input) => documentStore.doc.commit?.(input), [documentStore]), getSlideRevision = runtime2.reactd0.useCallback((input) => documentStore.doc.slideRev?.(input) ?? 0, [documentStore]), slideHasConflict = runtime2.reactd0.useCallback((input) => documentStore.doc.clashLocal?.(input) ?? !1, [documentStore]), editingAlone = runtime2.reactd0.useCallback(() => {
      let peers = runtime2.roomPeerStore.getSnapshot();
      return (documentStore.doc.queue?.solo() ?? !0) && document.visibilityState === "visible" && (0, runtime2.roomConnected)() && peers.length > 0 && peers.every((peer) => peer.sameTab);
    }, [documentStore]), commitSlideEdit = runtime2.reactd0.useCallback((input, options, context, value = !1) => {
      if (JSON.stringify(input) === JSON.stringify(options))
        return;
      if (slideHtmlHold2(options.id) !== void 0)
        return void canChangeSlide(options);
      let value2 = null, callback = (input2, options2) => {
        let value3 = value2 !== null && getSlideRevision(input2.id) !== value2, value4 = documentStore.getSlide(input2.id);
        return canChangeSlide(input2) ? (value3 && slideHasConflict(input2.id) ? (0, runtime2.reportArtifactFeedback)("undo-refused", {
          slide: input2.id,
          kind: options2,
          label: context,
          why: "a newer remote version of this slide arrived since the step was recorded"
        }) : commitDocumentBoundary(options2 === "do" ? "edit step" : "undo step"), value2 = getSlideRevision(input2.id), documentStore.getSlide(input2.id) !== value4) : !1;
      };
      undoHistory.exec(gestureSelectionController.command(options.id, context, (input2) => callback(input2 === "do" ? options : input, input2), value ? input : void 0));
    }, [
      undoHistory,
      documentStore,
      canChangeSlide,
      commitDocumentBoundary,
      getSlideRevision,
      slideHasConflict,
      gestureSelectionController
    ]), notesEditGesture = runtime2.reactd0.useMemo(() => ({
      live: (input) => {
        slideHtmlHold2(input.id) === void 0 && (setProtectedEditorSlide(input.id, !0), documentStore.updateSlide(input.id, (input2) => (0, runtime2.setSlideSpeakerNotes)(input2, input.notes)));
      },
      end: (input) => {
        setProtectedEditorSlide(input.id, !1);
        let value = documentStore.getSlide(input.id);
        !value || slideHtmlHold2(input.id) !== void 0 || value.notes === input.notes || commitSlideEdit((0, runtime2.setSlideSpeakerNotes)(value, input.notes), value, "edit");
      }
    }), [documentStore, commitSlideEdit, setProtectedEditorSlide]), commitCompletedGesture = runtime2.reactd0.useCallback((input) => {
      let value = documentStore.getSlide(input.id);
      value && commitSlideEdit(input, value, "edit", !0);
    }, [documentStore, commitSlideEdit]), onGestureEnd = runtime2.reactd0.useCallback((input) => {
      slideHtmlHold2(input.id) === void 0 && commitCompletedGesture(input), gestureSelectionController.gestureEnd(), liveGestureRef.current = !1, recentGestureRef.current = !1, documentStore.getSlide(input.id) !== input && lastEditedRevisionsRef.current.set(input.id, getSlideRevision(input.id)), setProtectedEditorSlide(input.id, !1), bumpGestureGeneration((input2) => input2 + 1), commitDocumentBoundary("pointer-up");
    }, [
      commitCompletedGesture,
      setProtectedEditorSlide,
      commitDocumentBoundary,
      gestureSelectionController,
      documentStore,
      getSlideRevision
    ]);
    runtime2.reactd0.useEffect(() => {
      textEditing || commitDocumentBoundary("caret closed");
    }, [textEditing, commitDocumentBoundary]);
    let editorViewStateRef = runtime2.reactd0.useRef({
      presenting: !1,
      slideId: null,
      selection: []
    });
    editorViewStateRef.current = {
      presenting: presentationStartIndex !== null,
      slideId: (presentationStartIndex !== null ? presentableSlides[presentationCurrentIndex ?? presentationStartIndex]?.id : currentSlide?.id) ?? null,
      selection
    };
    let shownSlideId = editorViewStateRef.current.slideId, placeLinkReporterRef = runtime2.reactd0.useRef(null), gotoSlideRef = runtime2.reactd0.useRef(() => {
    });
    gotoSlideRef.current = (input) => {
      presentationStartIndex !== null && exitPresentation(void 0, !1), gridRequested && closeGrid(), input !== currentSlideId && (setCurrentSlideId(input), setSelection([]), setTextEditState(null));
    };
    let placeLinkStateRef = runtime2.reactd0.useRef({
      order: [],
      shownId: null
    });
    placeLinkStateRef.current = {
      order: snapshot.meta.order,
      shownId: shownSlideId
    };
    let standalonePage = host === void 0;
    runtime2.reactd0.useEffect(() => {
      if (!standalonePage)
        return;
      let value = (0, runtime2.createPlaceLinkReporter)();
      placeLinkReporterRef.current = value;
      let value2 = (0, runtime2.subscribeGotoAnchorMessages)((input) => {
        let value3 = (0, runtime2.resolveSlidePlaceFragment)(input, placeLinkStateRef.current.order, !awaitingSlides());
        value3 !== void 0 && (clearInitialPlaceLink(), (0, runtime2.writePlaceLinkField)("goto", input));
        let value4 = value3 ?? placeLinkStateRef.current.shownId;
        value4 !== null && value.answer((0, runtime2.slidePlaceFragment)(value4)), value3 !== void 0 && gotoSlideRef.current(value3);
      });
      return () => {
        value2(), value.stop(), placeLinkReporterRef.current = null;
      };
    }, [standalonePage]), runtime2.reactd0.useEffect(() => {
      shownSlideId !== null && placeLinkReporterRef.current?.report((0, runtime2.slidePlaceFragment)(shownSlideId));
    }, [shownSlideId]);
    let [copySlideLink] = runtime2.reactd0.useState(() => {
      let copy = (0, runtime2.createPlaceLinkCopier)((message) => void (0, runtime2.showToast)(message));
      return (slideId) => copy((0, runtime2.slidePlaceFragment)(slideId));
    });
    runtime2.reactd0.useEffect(() => {
      if (standalonePage)
        return (0, runtime2.listenForCopySlideLinkShortcut)(() => {
          let shown = placeLinkStateRef.current.shownId;
          !presentingRef.current && shown !== null && copySlideLink(shown);
        });
    }, [standalonePage, copySlideLink]);
    let presentedSlideId = editorViewStateRef.current.presenting ? editorViewStateRef.current.slideId : null, lastReportedPresentationRef = runtime2.reactd0.useRef({
      presenting: !1,
      slideId: null
    });
    runtime2.reactd0.useEffect(() => {
      let current = lastReportedPresentationRef.current, value = presentationStartIndex !== null;
      value === current.presenting && presentedSlideId === current.slideId || ((0, runtime2.reportArtifactFeedback)("present", {
        state: value ? current.presenting ? "slide" : "started" : "ended",
        slide: presentedSlideId,
        ...current.presenting && value ? {
          from: current.slideId
        } : {}
      }), lastReportedPresentationRef.current = {
        presenting: value,
        slideId: presentedSlideId
      });
    }, [presentationStartIndex, presentedSlideId]);
    let deferredPresentationRestoreRef = runtime2.reactd0.useRef(null);
    runtime2.reactd0.useEffect(() => (0, runtime2.registerEditorViewStateAdapter)({
      snapshot: () => editorViewStateRef.current,
      busy: editorBusyPredicate,
      restore: (input) => {
        input.slideId !== null && setCurrentSlideId(input.slideId), Array.isArray(input.selection) && setSelection(input.selection), deferredPresentationRestoreRef.current = input.presenting ? input : null;
      }
    }), []), runtime2.reactd0.useEffect(() => {
      let current = deferredPresentationRestoreRef.current;
      if (current === null || !current.presenting || presentationStartIndex !== null)
        return;
      let value = presentableSlides.findIndex((input) => input.id === current.slideId);
      value < 0 || (deferredPresentationRestoreRef.current = null, presentingRef.current = !0, setFullscreenRequest("next"), setPresentationStartIndex(value));
    }, [presentableSlides, presentationStartIndex]), runtime2.reactd0.useEffect(() => {
      !liveGestureRef.current && !recentGestureRef.current || (liveGestureRef.current = !1, recentGestureRef.current = !1, gestureSelectionController.gestureEnd(), bumpGestureGeneration((input) => input + 1), activeSlideProtection?.poke());
    }, [
      readOnly,
      currentSlide?.id,
      activeSlideProtection,
      gestureSelectionController
    ]);
    let onChangeSlide = runtime2.reactd0.useCallback((input, options) => {
      let value = documentStore.getSlide(input.id);
      if (!value)
        return;
      let value2 = documentStore.getSnapshot().faces ?? [];
      if (options === void 0 || (0, runtime2.fontFaceMenuLabel)(value2, options) || slideHtmlHold2(input.id) !== void 0)
        return commitSlideEdit(value, input, "inspect");
      let callback = (input2) => (0, runtime2.usedDeckFontFamilies)([
        ...documentStore.getSnapshot().slides.map((input3) => input3.id === input2.id ? input2 : input3),
        ...documentStore.getSnapshot().baseline
      ]), items = [], items2 = [];
      undoHistory.exec({
        label: "查看属性",
        canDo: () => {
          let value3 = documentStore.getSnapshot().faces ?? [], value4 = !documentStore.getSlide(input.id) || (0, runtime2.fontFaceMenuLabel)(value3, options) ? [] : (0, runtime2.removableCarriedFontFaces)(value3, callback(input));
          return value4 === null ? (0, runtime2.showToast)(runtime2.DECK_FONT_LIMIT_MESSAGE + ".") : items = value4, value4 !== null;
        },
        do: () => {
          if (!documentStore.getSlide(input.id) || !canChangeSlide(input))
            return;
          let value3 = documentStore.getSnapshot().faces ?? [];
          if ((0, runtime2.fontFaceMenuLabel)(value3, options))
            return;
          items2 = items;
          let value4 = (0, runtime2.addCarriedFontFace)(value3, options, items2, callback(input));
          value4 !== null && documentStore.setFaces(value4);
        },
        undo: () => {
          !documentStore.getSlide(value.id) || !canChangeSlide(value) || documentStore.setFaces((0, runtime2.restoreCarriedFontFaces)(documentStore.getSnapshot().faces ?? [], options, items2, callback(value)));
        }
      });
    }, [documentStore, undoHistory, commitSlideEdit, canChangeSlide]), insertFrameNow = runtime2.reactd0.useCallback((input, options, context = !1) => {
      let value = getCurrentSlide();
      if (!value || currentSlideReadOnly)
        return !1;
      if (value.frames.length >= runtime2.maxSlideFrames)
        return (0, runtime2.showToast)(SLIDE_FULL_MESSAGE), !1;
      if (gridOpen && !(singleSelectedGridSlide && openGridSlideInEditor(value.id)))
        return !1;
      let value2 = value;
      return commitSlideEdit(value2, (0, runtime2.appendSlideFrame)(value2, input), options), context && !gridOpen && editorZoomApiRef.current?.landOnCreated(input.id), setSelection([
        {
          frameId: input.id
        }
      ]), !0;
    }, [
      currentSlide,
      currentSlideReadOnly,
      commitSlideEdit,
      gridOpen,
      singleSelectedGridSlide,
      openGridSlideInEditor
    ]), insertFrame = runtime2.reactd0.useCallback((input, options, context = !1, quietTextTool = !1) => {
      let inserted = insertFrameNow(input, options, context);
      return inserted && quietTextTool ? setTextToolOn(!1) : stopTextToolRef.current(!0), inserted;
    }, [insertFrameNow]), canAddTableCells = (input) => currentSlide ? input <= 0 ? !0 : (0, runtime2.countSlideTableCells)(currentSlide) + input > runtime2.maxSlideTableCells ? ((0, runtime2.showToast)((0, runtime2.formatMessage)({
      defaultMessage: "此页的表格单元格数已达上限，请先删除部分单元格。",
      id: "UVm+/hU/6M"
    })), !1) : (0, runtime2.countDeckTableCells)(slides) + input > runtime2.maxDeckTableCells ? ((0, runtime2.showToast)(TABLE_CELLS_FULL_MESSAGE), !1) : !0 : !1, canAddFrames = (input) => currentSlide ? input <= 0 ? !0 : (0, runtime2.countSlideEmbeds)(currentSlide) + input > runtime2.maxSlideHtmlEmbeds ? ((0, runtime2.showToast)("This slide can’t hold more web embeds (" + String(runtime2.maxSlideHtmlEmbeds) + " max) — remove one first."), !1) : !0 : !1, referencedAssetIds = () => {
      let values = /* @__PURE__ */ new Set();
      for (let value of documentStore.getSnapshot().meta.order) {
        let value2 = documentStore.getSlide(value);
        value2 && (0, runtime2.collectSlideAssetIds)(value2, values);
      }
      return values;
    }, showPasteWarnings = (input) => {
      let items = [];
      for (let [value, value2] of input)
        documentStore.getAsset(value) === void 0 && (documentStore.setAssetEntry(value, value2), items.push(value));
      return items;
    }, canAddStyledNodes = (input) => {
      let value = Array.isArray(input) ? input : [input], state = {
        effects: 0,
        animated: 0
      };
      for (let value2 of value) {
        let value3 = (0, runtime2.countNodeEffects)(value2);
        state.effects += value3.effects, state.animated += value3.animated;
      }
      if (state.effects === 0 && state.animated === 0)
        return !0;
      let index4 = 0, index22 = 0;
      for (let value2 of slides)
        for (let value3 of value2.frames) {
          let value4 = (0, runtime2.countNodeEffects)(value3.node);
          index4 += value4.effects, index22 += value4.animated;
        }
      return state.effects > 0 && index4 + state.effects > runtime2.maxSlidePaintCost ? ((0, runtime2.showToast)("This presentation can't hold more visual effects — remove some first."), !1) : state.animated > 0 && index22 + state.animated > runtime2.maxSlideAnimations ? ((0, runtime2.showToast)("This presentation can't hold more animations — remove some first."), !1) : !0;
    }, bodyLineHeight = () => {
      let style = (0, runtime2.defaultBodyTypographyStyle)(deckTypeStyles) ?? (0, runtime2.renderingTypeScaleForRole)("body");
      return style.fontSize * style.lineHeight;
    }, insertText = ({ at: input, clicked, toX } = {}) => {
      let value = clicked === !0 && input !== void 0 ? placeInsertedTextBox(input, bodyLineHeight(), toX) : placeInsertedFrame(input, DEFAULT_TEXT_INSERT_WIDTH), value2 = (0, runtime2.defaultBodyTypographyStyle)(deckTypeStyles), state = {
        kind: "text",
        role: "body",
        text: "Text",
        ...value2 !== null ? {
          style: {
            fontWeight: value2.fontWeight
          }
        } : {}
      }, state2 = {
        id: (0, runtime2.createModelId)(),
        x: value.x,
        y: value.y,
        node: value2 !== null ? (0, runtime2.applyTypographyStyle)(state, value2, snapshot.meta.theme) : state
      };
      insertFrame(state2, "insert text", !1, !0) && currentSlide !== void 0 && (setTextEditState({
        frameId: state2.id,
        path: []
      }), setProtectedEditorSlide(currentSlide.id));
    }, startTextTool = () => {
      if (textToolOn)
        return stopTextTool();
      if (editorZoomApiRef.current?.endTextEdit() === !1)
        return;
      let message = "Text tool on. Click where the text should go, or press " + ((0, runtime2.isApplePlatform)() ? "Return" : "Enter") + " on the slide to add it in the middle. Escape cancels.";
      (0, runtime2.announceLiveMessage)(() => textToolOnRef.current ? message : null), setTextToolOn(!0);
    }, slideSurface = () => editorElementRef.current?.querySelector("[data-slide-surface]") ?? null, overSlide = (x, y) => {
      let rect = slideSurface()?.getBoundingClientRect();
      return rect !== void 0 && pointInRect(rect, x, y);
    }, placeTextAt = (x, y, endX) => {
      let rect = slideSurface()?.getBoundingClientRect();
      if (rect === void 0 || rect.width === 0 || !pointInRect(rect, x, y))
        return stopTextTool();
      let scale = runtime2.SLIDE_WIDTH / rect.width;
      insertText({
        at: { x: (x - rect.left) * scale, y: (y - rect.top) * scale },
        clicked: !0,
        ...endX !== void 0 ? { toX: (endX - rect.left) * scale } : {}
      });
    }, insertTable = ({ at: input, byKey: input2 } = {}) => {
      let items = [
        ["Column", "Column", "Column"],
        ["", "", ""],
        ["", "", ""]
      ];
      if (!canAddTableCells(items.length * 3))
        return stopTextTool(!0);
      let value = placeInsertedFrame(input, 900);
      insertFrame({
        id: (0, runtime2.createModelId)(),
        x: input ? value.x : {
          anchor: "leading",
          margin: 128,
          offset: 0,
          size: 900
        },
        y: input ? value.y : {
          anchor: "center",
          margin: 0,
          offset: 0
        },
        node: {
          kind: "table",
          rows: items,
          cols: 3,
          header: !0
        }
      }, "insert table", input2);
    }, insertShape = (input, { at: options, byKey: options2 } = {}) => {
      let value = input === "line", value2 = input === "connector", value3 = placeInsertedFrame(options, value || value2 ? 480 : 300, value ? 8 : value2 ? 2 * (0, runtime2.connectorArrowInset)(runtime2.defaultShapeStrokeWidth) : 300);
      insertFrame({
        id: (0, runtime2.createModelId)(),
        x: value3.x,
        y: value3.y,
        node: value2 ? {
          kind: "shape",
          shape: input,
          stroke: (0, runtime2.themeAccentColor)(snapshot.meta.theme),
          strokeWidth: runtime2.defaultShapeStrokeWidth
        } : {
          kind: "shape",
          shape: input === "rounded" ? "rect" : input,
          style: {
            backgroundColor: value ? snapshot.meta.theme === "neutral" ? "#1a1a1a" : "#141413" : (0, runtime2.themeAccentColor)(snapshot.meta.theme),
            ...input === "rounded" ? {
              borderRadius: runtime2.maxShapeCornerRadius
            } : {}
          }
        }
      }, "insert shape", options2);
    }, imageReductionNoticesRef = runtime2.reactd0.useRef(/* @__PURE__ */ new Set()), prepareImageAsset = async (input, options = "image") => {
      let value = await (0, runtime2.storeImageAsset)(input);
      return value.kind === "data" && value.reason !== "unsupported_type" && !imageReductionNoticesRef.current.has(value.reason) && (imageReductionNoticesRef.current.add(value.reason), (0, runtime2.showToast)("Stored a compressed copy of the " + options + " (" + (value.reason === "unavailable" ? "uploads aren’t available in this view" : value.reason === "too_large" ? "it is too large to upload as-is" : "the upload didn’t go through") + ").")), value;
    }, [pendingUploads, setPendingUploads] = runtime2.reactd0.useState([]), mountedRef = runtime2.reactd0.useRef(!0);
    runtime2.reactd0.useEffect(() => (mountedRef.current = !0, () => {
      mountedRef.current = !1;
    }), []);
    let uploadAndInsertImage = async (frameId, path, file) => {
      if (!file.type.startsWith("image/")) {
        runtime2.showToast("请选择图片文件。");
        return;
      }
      const slideId = currentSlide?.id;
      if (!slideId || currentSlideReadOnly)
        return;
      const before = documentStore.getSlide(slideId), frame = before && runtime2.frameById(before, frameId), previous = frame && runtime2.nodeAtPath(frame.node, path);
      if (previous?.kind === "img")
        try {
          const { src } = await prepareImageAsset(file);
          if (!mountedRef.current)
            return;
          const live = documentStore.getSlide(slideId), liveFrame = live && runtime2.frameById(live, frameId), node = liveFrame && runtime2.nodeAtPath(liveFrame.node, path);
          if (!live || documentStore.doc.readOnly() || slideHtmlHold2(slideId) !== void 0)
            return;
          if (node !== previous) {
            runtime2.showToast("这张图片在上传期间已被修改，请重新选择。");
            return;
          }
          const asset = documentStore.prepareAsset(src), next = runtime2.updateSlideFrame(live, frameId, (value) => ({ ...value, node: runtime2.updateNodeAtPath(value.node, path, (source) => runtime2.replaceImageAsset(source, asset, file.name)) })), unused = runtime2.createUnusedAssetUndoOperation(documentStore, previous.asset ? [previous.asset] : []);
          undoHistory.exec({ label: "替换图片", do: () => {
            canChangeSlide(next) && (documentStore.setAssetEntry(asset, src), unused.drop());
          }, undo: () => {
            canChangeSlide(live) && (unused.restore(), documentStore.removeAssetEntry(asset));
          } });
        } catch {
          runtime2.showToast("图片替换失败，请重试。");
        }
    }, uploadAndInsertImageRef = runtime2.reactd0.useRef(uploadAndInsertImage);
    uploadAndInsertImageRef.current = uploadAndInsertImage;
    let removeSelectedImages = (input, poster = !1) => {
      if (!currentSlide || currentSlideReadOnly)
        return;
      let value = documentStore.getSlide(currentSlide.id);
      if (!value || slideHtmlHold2(value.id) !== void 0)
        return;
      let items = [], index4 = 0, value2 = value;
      for (let value4 of input)
        value2 = (0, runtime2.updateSlideFrame)(value2, value4.frameId, (input2) => ({
          ...input2,
          node: (0, runtime2.updateNodeAtPath)(input2.node, value4.path, (source) => source.kind !== "img" || !(poster ? (0, runtime2.imageHasPoster)(source) : (0, runtime2.imageHasMedia)(source)) ? source : (index4++, source.asset !== void 0 && items.push(source.asset), (0, runtime2.clearImageMedia)(source)))
        }));
      if (index4 === 0)
        return;
      let value3 = (0, runtime2.createUnusedAssetUndoOperation)(documentStore, items);
      undoHistory.exec({
        label: poster ? "移除封面图片" : "移除图片",
        do: () => {
          canChangeSlide(value2) && value3.drop();
        },
        undo: () => {
          canChangeSlide(value) && value3.restore();
        }
      });
    }, insertImageFromInput = async (file, { at, byKey, nth: batch } = {}) => {
      if (!file.type.startsWith("image/")) {
        runtime2.showToast("请选择图片文件。");
        return;
      }
      stopTextTool(!0);
      const before = getCurrentSlide();
      if (!before || currentSlideReadOnly || before.frames.length >= runtime2.maxSlideFrames || gridOpen && !(singleSelectedGridSlide && openGridSlideInEditor(before.id)))
        return;
      const generation = insertGestureSequenceRef.current;
      try {
        const { src } = await prepareImageAsset(file), dimensions = await loadImageDimensions(src), live = documentStore.getSlide(before.id);
        if (!mountedRef.current || !live || documentStore.doc.readOnly() || slideHtmlHold2(live.id) !== void 0)
          return;
        if (live.frames.length >= runtime2.maxSlideFrames) {
          runtime2.showToast(SLIDE_FULL_MESSAGE);
          return;
        }
        const asset = documentStore.prepareAsset(src), frame = { id: runtime2.createModelId(), ...placeInsertedFrame(at, 640, Math.round(640 * dimensions.h / dimensions.w) || 480, batch), node: runtime2.replaceImageAsset({ kind: "img", alt: "", fit: "cover" }, asset, file.name) }, next = runtime2.appendSlideFrame(live, frame);
        return undoHistory.exec({ label: "插入图片", do: () => {
          canChangeSlide(next) && documentStore.setAssetEntry(asset, src);
        }, undo: () => {
          canChangeSlide(live) && documentStore.removeAssetEntry(asset);
        } }), batch?.landed.set(batch.i, frame.id), currentSlideRef.current?.id === live.id && (setSelection([{ frameId: frame.id }]), byKey && generation === insertGestureSequenceRef.current && editorZoomApiRef.current?.landOnCreated(frame.id)), frame.id;
      } catch {
        runtime2.showToast("图片无法读取，请检查文件后重试。");
      }
    }, insertImageFromInputRef = runtime2.reactd0.useRef(insertImageFromInput);
    insertImageFromInputRef.current = insertImageFromInput;
    let dropFilesOnSlide = async (files, x, y) => {
      const images = files.filter(runtime2.isImageFile);
      images.length !== files.length && runtime2.showToast("仅支持图片，其他文件已跳过。");
      for (let i = 0; i < images.length; i++)
        await insertImageFromInput(images[i], { at: { x: x + i * 12, y: y + i * 12 } });
    }, onDropInsert = (input, options, context) => {
      if (setInsertMenuOpen(!1), input === "text")
        insertText({
          at: {
            x: options,
            y: context
          }
        });
      else if (input === "table")
        insertTable({
          at: {
            x: options,
            y: context
          }
        });
      else if (input.startsWith("shape:")) {
        let value = input.slice(6);
        runtime2.shapeVariants.includes(value) && insertShape(value, {
          at: {
            x: options,
            y: context
          }
        });
      }
    }, currentSlideIndex = currentSlide ? slides.findIndex((input) => input.id === currentSlide.id) : -1;
    runtime2.reactd0.useLayoutEffect(() => {
      speakerNotesSession === null || presentationStartIndex !== null || speakerNotesSession.render(SlidesAppJsx.jsx(runtime2.CompactSpeakerNotes, {
        win: speakerNotesSession.view.win,
        slide: currentSlide,
        index: currentSlideIndex
      }));
    }, [
      speakerNotesSession,
      presentationStartIndex,
      currentSlide,
      currentSlideIndex
    ]);
    let presencePublisherRef = runtime2.reactd0.useRef(null), cursorPublisherRef = runtime2.reactd0.useRef(null);
    runtime2.reactd0.useEffect(() => {
      let value = (0, runtime2.createArtifactPresence)();
      presencePublisherRef.current = value;
      let value2 = (0, runtime2.createCursorPresence)();
      return cursorPublisherRef.current = value2, (0, runtime2.currentUserProfile)().then((input) => value2.setWho(input?.name ?? "", input?.color ?? "")), () => {
        value.dispose(), value2.dispose(), presencePublisherRef.current = null, cursorPublisherRef.current = null;
      };
    }, []);
    let lastGridPointerRef = runtime2.reactd0.useRef(null), clearGridCursor = presentationStartIndex !== null ? "present" : gridOpen ? "canvas" : (editingGridSlide ? "place:" : "slide:") + (currentSlide?.id ?? "");
    runtime2.reactd0.useEffect(() => () => {
      cursorPublisherRef.current?.clear(), lastGridPointerRef.current = null;
    }, [clearGridCursor]);
    let publishGridPointer = (event, options = !0) => {
      if (!(gridOpen || editingGridSlide) || presentationStartIndex !== null || event.pointerType === "touch")
        return;
      let value = (0, runtime2.reduceGridNotesOutsideClick)({
        moved: options,
        target: (0, runtime2.classifyGridNotesClickTarget)(event.target),
        hit: gridZoomApiRef.current?.slideAt(event.clientX, event.clientY) ?? null,
        editing: editingGridSlide ? currentSlide?.id ?? null : null
      });
      value === "clear" ? cursorPublisherRef.current?.clear() : value !== "ignore" && cursorPublisherRef.current?.move(scopedSlideKey(value.id), value.fx, value.fy);
    }, publishGridPointerRef = runtime2.reactd0.useRef(publishGridPointer);
    publishGridPointerRef.current = publishGridPointer;
    let republishGridPointerOnCameraChange = runtime2.reactd0.useCallback(() => {
      let current = lastGridPointerRef.current;
      if (current === null || Date.now() - current.at >= runtime2.PEER_CURSOR_STALE_MS)
        return;
      let value = document.elementFromPoint(current.clientX, current.clientY);
      value && publishGridPointerRef.current({
        clientX: current.clientX,
        clientY: current.clientY,
        target: value
      }, !1);
    }, []), documentDirty = runtime2.reactd0.useSyncExternalStore(runtime2.reactd0.useCallback((input) => documentStore.subscribe(input), [documentStore]), () => documentStore.doc.dirty());
    runtime2.reactd0.useEffect(() => {
      let value = presentationStartIndex !== null ? "present" : gridOpen ? "grid" : "edit", value2 = presentationStartIndex !== null ? presentableSlides[presentationCurrentIndex ?? presentationStartIndex] : currentSlide, value3 = value === "present" ? [] : value === "grid" ? (0, runtime2.normalizeObjectContextIds)(gridSelection.slides) : (0, runtime2.selectedObjectContextIds)(selection, textEdit), callback = (input) => input.flatMap((input2) => {
        let value10 = slides.find((input3) => input3.id === input2);
        return value10 ? [
          {
            id: input2,
            kind: "slide",
            label: (0, runtime2.slideDisplayLabel)(value10) ?? ""
          }
        ] : [];
      }), value4 = value === "grid" ? (0, runtime2.normalizeObjectContextIds)(gridSelection.sections) : [], value5 = value4.length > 0 ? (0, runtime2.sectionGroups)((0, runtime2.reconcileSectionsWithSlideOrder)(snapshot.sections, snapshot.meta.order), snapshot.meta.order) : [], value6 = value4.flatMap((input) => {
        let value10 = value5.findIndex((input2) => input2.section?.id === input);
        return value10 < 0 ? [] : [
          {
            id: input,
            kind: "section",
            label: value5[value10].section.description || "章节 " + String(value10 + 1)
          }
        ];
      }), value7 = value === "present" ? [] : value === "grid" ? [...callback(value3), ...value6] : currentSlide ? (0, runtime2.selectedObjectContext)(currentSlide, selection, textEdit) : [], value8 = value2 ? slides.findIndex((input) => input.id === value2.id) : -1, value9 = value2 !== void 0 ? slideHtmlHold2(value2.id) : void 0;
      presencePublisherRef.current?.report({
        ...host?.presence ? {
          deckMode: value
        } : {},
        mode: value,
        deck: memoryScope === "" ? null : (0, runtime2.frameContextId)(memoryScope),
        slideId: (0, runtime2.frameContextId)(value2?.id),
        slideTitle: {
          text: (value2 && (0, runtime2.slideDisplayLabel)(value2)) ?? ""
        },
        slideIndex: value8 + 1,
        slideCount: slides.length,
        dirty: documentDirty,
        ...value9 !== void 0 ? {
          slideHeld: !0,
          slideHeldWhy: {
            text: value9
          }
        } : {},
        selected: value3,
        selection: value7,
        ...value === "edit" && railSelectionLive && severalSlides && selection.length === 0 && textEdit === null ? {
          selectedSlides: (0, runtime2.normalizeObjectContextIds)(slideOrderIds.flatMap((input) => slideSelection.has(input) ? (0, runtime2.frameContextId)(input) ?? [] : [])),
          selectedCount: slideSelection.selected.length
        } : {},
        ...value === "grid" ? {
          sections: value4,
          slideSections: value3.map((input) => gridSelection.slideSections[gridSelection.slides.indexOf(input)] ?? "-"),
          selectedCount: gridSelection.slides.length,
          editingSection: gridSelection.editingSection === "-" ? "-" : (0, runtime2.frameContextId)(gridSelection.editingSection)
        } : {},
        ...host?.presence
      });
    }, [
      currentSlide,
      slides,
      presentableSlides,
      presentationStartIndex,
      presentationCurrentIndex,
      gridOpen,
      gridSelection,
      snapshot.sections,
      snapshot.meta.order,
      selection,
      textEdit,
      documentDirty,
      memoryScope,
      railSelectionLive,
      severalSlides,
      slideSelection.selected,
      host?.presence
    ]);
    let [onPersonPaged, bumpPageNavigation] = runtime2.reactd0.useState(0), pageSlide = (input) => {
      let value = slides[currentSlideIndex + input];
      value && (bumpPageNavigation((input2) => input2 + 1), setCurrentSlideId(value.id), setSelection([]), setTextEditState(null));
    }, pickSlideTemplate = (input) => {
      if (readOnly)
        return;
      let value = (0, runtime2.countSlideTableCells)(input);
      if (value > 0 && (0, runtime2.countDeckTableCells)(slides) + value > runtime2.maxDeckTableCells) {
        (0, runtime2.showToast)(TABLE_CELLS_FULL_MESSAGE);
        return;
      }
      let value2 = (templateRestyler ?? (0, runtime2.createTemplateRestyler)({
        current: currentSlide,
        slides,
        typeStyles: deckTypeStyles,
        theme: snapshot.meta.theme
      }))(input), value3 = currentSlideIndex >= 0 ? currentSlideIndex + 1 : slides.length, value4 = documentStore.sectionsSnapshot();
      undoHistory.exec({
        label: "添加幻灯片",
        do: () => {
          documentStore.arm(value4), slideCapacityAvailable(value2.id) || documentStore.insertSlide(value2, value3, {
            joinTop: !0
          });
        },
        undo: () => {
          slideCapacityAvailable(value2.id) || (documentStore.removeSlide(value2.id), documentStore.restoreSections(value4));
        }
      }), setCurrentSlideId(value2.id), setSelection([]);
    }, duplicateSlide = (input, options) => {
      let value = documentStore.getSlide(input);
      if (readOnly || !value)
        return null;
      if (slides.length + 1 > runtime2.maxDeckSlides)
        return (0, runtime2.showToast)(presentationCapacityMessage(1)), null;
      let value2 = (0, runtime2.countSlideTableCells)(value);
      if (value2 > 0 && (0, runtime2.countDeckTableCells)(slides) + value2 > runtime2.maxDeckTableCells)
        return (0, runtime2.showToast)(TABLE_CELLS_FULL_MESSAGE), null;
      let state = {
        ...value,
        id: (0, runtime2.createModelId)(),
        frames: value.frames.map((input2) => ({
          ...input2
        }))
      }, value3 = options ?? slides.findIndex((input2) => input2.id === input) + 1, value4 = documentStore.sectionsSnapshot(), entries = new Map(Object.entries(documentStore.snapshotAssetsFor(input)));
      return undoHistory.exec({
        label: "创建幻灯片副本",
        do: () => {
          documentStore.arm(value4), slideCapacityAvailable(state.id) || (showPasteWarnings(entries), documentStore.insertSlide(state, value3, {
            joinTop: !0
          }));
        },
        undo: () => {
          slideCapacityAvailable(state.id) || (documentStore.removeSlide(state.id), documentStore.restoreSections(value4));
        }
      }), setCurrentSlideId(state.id), state.id;
    }, duplicateSlides = (input, options) => {
      let value = slides.flatMap((input2) => input.includes(input2.id) ? [documentStore.getSlide(input2.id)] : []).filter((input2) => input2 !== void 0);
      if (readOnly || value.length === 0)
        return [];
      if (value.length === 1 && options === void 0) {
        let value6 = duplicateSlide(value[0].id);
        return value6 === null ? [] : [value6];
      }
      if (slides.length + value.length > runtime2.maxDeckSlides)
        return (0, runtime2.showToast)(presentationCapacityMessage(value.length)), [];
      let value2 = (0, runtime2.countDeckTableCells)(value);
      if (value2 > 0 && (0, runtime2.countDeckTableCells)(slides) + value2 > runtime2.maxDeckTableCells)
        return (0, runtime2.showToast)(TABLE_CELLS_FULL_MESSAGE), [];
      if (!canAddStyledNodes(value.flatMap((input2) => input2.frames.map((input3) => input3.node))))
        return [];
      let value3 = value.map((input2) => ({
        ...input2,
        id: (0, runtime2.createModelId)(),
        frames: input2.frames.map((input3) => ({
          ...input3
        }))
      })), entries = new Map(value.flatMap((input2) => Object.entries(documentStore.snapshotAssetsFor(input2.id)))), id = value[value.length - 1].id, items = [], callback = (input2) => input2 === 0 || documentStore.getSnapshot().meta.order.length + input2 <= runtime2.maxDeckSlides ? !0 : ((0, runtime2.showToast)(presentationCapacityMessage(input2)), !1), flag = !1, items2 = [
        (0, runtime2.createModelId)(),
        (0, runtime2.createModelId)()
      ], value4 = options === void 0 ? void 0 : (input2, options2) => (0, runtime2.insertSlidesAtSectionTarget)(input2, options2.map((input3) => input3.id), options, ...items2), callback2 = (input2) => flag || value4 === void 0 || value4(documentStore.doc.content(), input2) !== void 0;
      undoHistory.exec({
        label: "创建多页副本",
        canDo: () => {
          let value6 = value3.filter((input2) => documentStore.getSlide(input2.id) === void 0);
          return callback(value6.length) && callback2(value6);
        },
        do: () => {
          flag = !0;
          let order = documentStore.getSnapshot().meta.order;
          if (value3.some((input2) => documentStore.getSlide(input2.id) !== void 0 && slideCapacityAvailable(input2.id)))
            return;
          let value6 = value3.filter((input2) => documentStore.getSlide(input2.id) === void 0);
          if (items = items.filter((input2) => documentStore.getSlide(input2.id) !== void 0), value6.length > 0 && showPasteWarnings(entries), value4 !== void 0) {
            let value8 = documentStore.sectionsSnapshot();
            if (documentStore.insertSlides(value6, (input2) => value4(input2, value6))) {
              items.push(...value6.map((input2) => ({
                id: input2.id,
                ob: value8
              })));
              return;
            }
          }
          let value7 = order.indexOf(id) + 1 || order.length;
          for (let value8 of value6)
            items.push({
              id: value8.id,
              ob: documentStore.sectionsSnapshot()
            }), documentStore.insertSlide(value8, value7++, {
              joinTop: !0
            });
        },
        undo: () => {
          documentStore.forgetParked(value3.map((input2) => input2.id));
          let value6 = [...items].reverse().filter((input2) => documentStore.getSlide(input2.id) !== void 0);
          value6.some((input2) => slideCapacityAvailable(input2.id)) || value6.forEach(({ id: id2, ob }, options2) => {
            for (let [value7, value8] of Object.entries(documentStore.snapshotAssetsFor(id2)))
              entries.set(value7, value8);
            documentStore.removeSlide(id2), value6[options2 + 1]?.ob !== ob && documentStore.restoreSections(ob);
          });
        }
      });
      let value5 = value3.flatMap((input2) => documentStore.getSlide(input2.id) !== void 0 ? [input2.id] : []);
      return value5.length > 0 && setCurrentSlideId(value5[value5.length - 1]), value5;
    }, deleteSlide = (input) => {
      let value = documentStore.getSlide(input);
      if (readOnly || !value || slides.length <= 1)
        return !1;
      if (slideHtmlHold2(input) !== void 0)
        return (0, runtime2.showToast)("That slide can’t be edited until its saved content is fixed, so it can’t be deleted yet."), !1;
      let value2 = slides.findIndex((input2) => input2.id === input), value3 = slides[value2 - 1]?.id, value4 = slides[value2 + 1]?.id, value5 = documentStore.snapshotAssetsFor(input), value6 = documentStore.sectionsSnapshot(), flag = !1, flag2 = !1;
      if (undoHistory.exec({
        label: "删除幻灯片",
        do: () => {
          documentStore.forgetParked([input]), !(flag2 || documentStore.getSlide(input) === void 0 || slideCapacityAvailable(input)) && (documentStore.arm(value6), flag = documentStore.getSnapshot().cover === input, documentStore.removeSlide(input), flag2 = !0);
        },
        canUndo: () => !flag2 || documentStore.getSnapshot().meta.order.length + 1 <= runtime2.maxDeckSlides ? !0 : ((0, runtime2.showToast)("This presentation is full (" + String(runtime2.maxDeckSlides) + " slides). Remove one first."), !1),
        undo: () => {
          if (!flag2 || slideCapacityAvailable(input))
            return;
          let order = documentStore.getSnapshot().meta.order, value7 = value3 !== void 0 ? order.indexOf(value3) : -1, value8 = value4 !== void 0 ? order.indexOf(value4) : -1;
          documentStore.restoreSlide(value, value7 >= 0 ? value7 + 1 : value8 >= 0 ? value8 : value2, value5), documentStore.restoreSections(value6), flag && documentStore.getSnapshot().cover === void 0 && documentStore.setCover(input), flag2 = !1;
        }
      }), input === currentSlideId) {
        let value7 = slides[value2 + 1] ?? slides[value2 - 1];
        setCurrentSlideId(value7 ? value7.id : null), setSelection([]);
      }
      return !0;
    }, deleteSlides = (input) => {
      let value = slides.flatMap((input2, options) => input.includes(input2.id) ? [
        {
          slide: documentStore.getSlide(input2.id),
          at: options
        }
      ] : []).filter((input2) => input2.slide !== void 0);
      if (readOnly || value.length === 0)
        return !1;
      if (value.length === 1)
        return deleteSlide(value[0].slide.id);
      if (value.length >= slides.length)
        return (0, runtime2.showToast)(LAST_SLIDE_DELETE_MESSAGE), !1;
      if (value.some((input2) => slideHtmlHold2(input2.slide.id) !== void 0))
        return (0, runtime2.showToast)(DAMAGED_SLIDES_DELETE_MESSAGE), !1;
      let values = new Set(value.map((input2) => input2.slide.id)), value2 = slides.map((input2) => input2.id), items = [], flag = !1, callback = () => value.filter((input2) => documentStore.getSlide(input2.slide.id) !== void 0);
      if (undoHistory.exec({
        label: "删除多页幻灯片",
        canDo: () => flag || callback().length < documentStore.getSnapshot().meta.order.length ? !0 : ((0, runtime2.showToast)(LAST_SLIDE_DELETE_MESSAGE), !1),
        canUndo: () => {
          if (!flag)
            return !0;
          let length = items.filter((input2) => documentStore.getSlide(input2.id) === void 0).length;
          return documentStore.getSnapshot().meta.order.length + length <= runtime2.maxDeckSlides ? !0 : ((0, runtime2.showToast)(presentationSlideCapacityMessage(length)), !1);
        },
        do: () => {
          if (flag)
            return;
          documentStore.forgetParked(value.map((input2) => input2.slide.id));
          let value3 = callback();
          if (!value3.some((input2) => slideCapacityAvailable(input2.slide.id))) {
            items = [];
            for (let value4 of value3) {
              let value5 = documentStore.getSlide(value4.slide.id);
              items.push({
                id: value5.id,
                at: value4.at,
                slide: value5,
                assets: documentStore.snapshotAssetsFor(value5.id),
                ob: documentStore.sectionsSnapshot(),
                cover: documentStore.getSnapshot().cover === value5.id
              }), documentStore.removeSlide(value5.id);
            }
            flag = !0;
          }
        },
        undo: () => {
          if (!flag)
            return;
          let value3 = [...items].reverse().filter((input2) => documentStore.getSlide(input2.id) === void 0);
          for (let value4 of value3) {
            let order = documentStore.getSnapshot().meta.order, value5 = value2.slice(0, value4.at).reverse().find((input2) => order.includes(input2)), value6 = value2.slice(value4.at + 1).find((input2) => order.includes(input2));
            documentStore.restoreSlide(value4.slide, value5 !== void 0 ? order.indexOf(value5) + 1 : value6 !== void 0 ? order.indexOf(value6) : value4.at, value4.assets), documentStore.restoreSections(value4.ob), value4.cover && documentStore.getSnapshot().cover === void 0 && documentStore.setCover(value4.id);
          }
          flag = !1;
        }
      }), currentSlideId !== null && values.has(currentSlideId)) {
        let value3 = slides.findIndex((input2) => input2.id === currentSlideId), value4 = slides.slice(value3 + 1).find((input2) => !values.has(input2.id)) ?? slides.slice(0, value3).reverse().find((input2) => !values.has(input2.id));
        setCurrentSlideId(value4 ? value4.id : null), setSelection([]);
      }
      return !0;
    }, moveSlide = (input, options) => {
      let value = slides.findIndex((input2) => input2.id === input);
      if (readOnly || value < 0)
        return;
      let value2 = slides[value - 1]?.id, value3 = slides[value + 1]?.id, value4 = documentStore.sectionsSnapshot();
      undoHistory.exec({
        label: "调整幻灯片顺序",
        do: () => {
          documentStore.arm(value4), documentStore.moveSlide(input, options, {
            joinTop: !0
          });
        },
        undo: () => {
          let value6 = documentStore.getSnapshot().meta.order.filter((input2) => input2 !== input), value7 = value2 !== void 0 ? value6.indexOf(value2) : -1, value8 = value3 !== void 0 ? value6.indexOf(value3) : -1;
          documentStore.moveSlide(input, value7 >= 0 ? value7 + 1 : value8 >= 0 ? value8 : value), documentStore.restoreSections(value4);
        }
      });
    }, commitStructuralChange = runtime2.reactd0.useCallback((input, options) => {
      if (readOnly || documentStore.doc.readOnly())
        return !1;
      let value = documentStore.doc.content(), callback = (input2, options2) => {
        let value4 = (0, runtime2.diffSections)(input2, options2);
        return (0, runtime2.normalizeEmptySectionDescriptions)(options2, [
          ...value4.added.map((input3) => input3.id),
          ...value4.changed.map((input3) => input3.id)
        ]);
      };
      if (!documentStore.applyStructure((input2) => {
        let value4 = options(input2);
        if (value4 !== void 0)
          return callback(input2, value4);
      }))
        return !1;
      let value2 = (0, runtime2.diffSections)(value, documentStore.doc.content()), value3 = (0, runtime2.invertSectionsDiff)(value2);
      return undoHistory.seed({
        label: input,
        do: () => void documentStore.applyStructure((input2) => (0, runtime2.applySectionsDiff)(input2, value2)),
        undo: () => void documentStore.applyStructure((input2) => (0, runtime2.applySectionsDiff)(input2, value3))
      }), !0;
    }, [documentStore, undoHistory, readOnly]), setCoverSlide = (input) => {
      if (readOnly || documentStore.getSlide(input) === void 0 || documentStore.getSnapshot().cover === input)
        return;
      let value = documentStore.getSnapshot().meta.order.indexOf(input) + 1, value2;
      undoHistory.exec({
        label: "设置封面缩略图",
        do: () => {
          value2 = documentStore.getSnapshot().cover, documentStore.setCover(input);
        },
        undo: () => {
          documentStore.getSnapshot().cover === input && documentStore.setCover(value2 !== void 0 && documentStore.getSlide(value2) !== void 0 ? value2 : void 0);
        }
      }), (0, runtime2.showToast)("幻灯片 " + String(value) + " is now the thumbnail");
    }, toggleSlideSkipped = (input) => {
      let value = documentStore.getSlide(input);
      if (!(readOnly || !value)) {
        if (slideHtmlHold2(input) !== void 0) {
          (0, runtime2.showToast)("That slide can’t be edited until its saved content is fixed, so it can’t be skipped yet.");
          return;
        }
        setSlidesSkipped([input], value.skipped !== !0);
      }
    }, setSlidesSkipped = (input, options) => {
      let value = input.filter((input2) => {
        let value2 = documentStore.getSlide(input2);
        return value2 !== void 0 && value2.skipped === !0 !== options;
      });
      if (readOnly || value.length === 0)
        return;
      if (value.some((input2) => slideHtmlHold2(input2) !== void 0)) {
        (0, runtime2.showToast)("One of those slides can’t be edited until its saved content is fixed, so none were changed.");
        return;
      }
      let callback = (input2) => () => {
        for (let value2 of value)
          documentStore.getSlide(value2) === void 0 || slideCapacityAvailable(value2) || documentStore.updateSlide(value2, (input3) => {
            let state = {
              ...input3
            };
            return input2 ? state.skipped = !0 : delete state.skipped, state;
          });
      };
      undoHistory.exec({
        label: (options ? "跳过 " : "取消跳过 ") + (value.length > 1 ? "slides" : "slide"),
        do: callback(options),
        undo: callback(!options)
      });
    }, duplicateSelection = () => {
      let value = getCurrentSlide();
      if (!value || selection.length === 0)
        return;
      let value2 = (0, runtime2.filterValidSelections)(value, selection);
      if (value2.length === 0)
        return;
      stopTextTool(!0);
      let value3 = value2.map((input) => (0, runtime2.selectedNode)(value, input)).filter((input) => input !== void 0), value4 = value3.reduce((input, options) => input + (0, runtime2.countNodeTableCells)(options), 0), value5 = value3.reduce((input, options) => input + (0, runtime2.countNodeEmbeds)(options), 0);
      if (!canAddTableCells(value4) || !canAddFrames(value5) || !canAddStyledNodes(value3))
        return;
      let value6 = value2.filter((input) => input.child === void 0);
      if (value.frames.length + value6.length > runtime2.maxSlideFrames) {
        (0, runtime2.showToast)(SLIDE_FULL_MESSAGE);
        return;
      }
      for (let [value8, value9] of (() => {
        let entries3 = /* @__PURE__ */ new Map();
        for (let value10 of value2)
          value10.child !== void 0 && entries3.set(value10.frameId, (entries3.get(value10.frameId) ?? 0) + 1);
        return entries3;
      })()) {
        let value10 = (0, runtime2.frameById)(value, value8);
        if (value10 !== void 0 && (0, runtime2.isFlowContainer)(value10.node) && value10.node.children.length + value9 > runtime2.maxSlideFrames) {
          (0, runtime2.showToast)("This group is full — remove an element first.");
          return;
        }
      }
      let value7 = value, items = [], entries = /* @__PURE__ */ new Map();
      for (let value8 of (0, runtime2.sortSelectionsInDocumentOrder)(value, value2)) {
        if (value8.child !== void 0)
          continue;
        let value9 = (0, runtime2.frameById)(value7, value8.frameId);
        if (!value9)
          continue;
        let state = {
          ...value9,
          id: (0, runtime2.createModelId)(),
          x: (0, runtime2.moveAxisSpec)(value9.x, 24),
          y: (0, runtime2.moveAxisSpec)(value9.y, 24)
        };
        value7 = (0, runtime2.appendSlideFrame)(value7, state), entries.set(value8.frameId, {
          frameId: state.id
        });
      }
      for (let value8 of value2) {
        let value9 = value8.child === void 0 ? entries.get(value8.frameId) : void 0;
        value9 && items.push(value9);
      }
      let values = new Set(value2.filter((input) => input.child === void 0).map((input) => input.frameId)), entries2 = /* @__PURE__ */ new Map();
      for (let value8 of value2) {
        if (value8.child === void 0 || values.has(value8.frameId) || (0, runtime2.selectedNode)(value, value8)?.kind === "spacer")
          continue;
        let value9 = (0, runtime2.frameById)(value, value8.frameId);
        if (value9 !== void 0 && (0, runtime2.isOverlayNode)(value9.node)) {
          if (value8.child === 0)
            continue;
          let value13 = entries2.get(value8.frameId + ":")?.indices.length ?? 0;
          if (value9.node.layers.length + value13 >= runtime2.maxTextLineSpacing) {
            (0, runtime2.showToast)("This overlay already holds its maximum of " + String(runtime2.maxTextLineSpacing) + " layers.");
            continue;
          }
        }
        let value10 = (0, runtime2.selectionNodePath)(value8).slice(0, -1), value11 = value8.frameId + ":" + value10.join("."), value12 = entries2.get(value11) ?? {
          frameId: value8.frameId,
          parentPath: value10,
          indices: []
        };
        value12.indices.push((0, runtime2.selectionNodePath)(value8)[(0, runtime2.selectionNodePath)(value8).length - 1]), entries2.set(value11, value12);
      }
      for (let { frameId: value8, parentPath: value9, indices: value10 } of entries2.values())
        value10.sort((input, options) => input - options), value10.forEach((input, options) => {
          value7 = (0, runtime2.wrapNodeInContainer)(value7, value8, [
            ...value9,
            input + options
          ]), items.push((0, runtime2.createNodeSelection)(value8, [
            ...value9,
            input + options + 1
          ]));
        });
      value7 !== value && (commitSlideEdit(value, value7, "duplicate"), setSelection(items));
    }, getCopyableSelection = () => {
      let value = getCurrentSlide();
      if (!value)
        return [];
      let value2 = (0, runtime2.filterValidSelections)(value, selection), items = [], current = editorElementRef.current, values = new Set(value2.filter((input) => {
        if (input.child === void 0)
          return !0;
        let value3 = (0, runtime2.frameById)(value, input.frameId);
        return value3 !== void 0 && (0, runtime2.isOverlayNode)(value3.node) && input.child === 0;
      }).map((input) => input.frameId)), values2 = /* @__PURE__ */ new Set();
      for (let value3 of (0, runtime2.sortSelectionsInDocumentOrder)(value, value2)) {
        let value4 = (0, runtime2.frameById)(value, value3.frameId);
        if (!value4)
          continue;
        let value5 = value3.child !== void 0 && (0, runtime2.isOverlayNode)(value4.node) && value3.child === 0;
        if (value3.child !== void 0 && !value5 && values.has(value3.frameId))
          continue;
        if (value3.child === void 0 || value5) {
          if (values2.has(value3.frameId))
            continue;
          values2.add(value3.frameId), items.push({
            unit: value3.child === void 0 ? value3 : {
              frameId: value3.frameId
            },
            frame: value4
          });
          continue;
        }
        let value6 = (0, runtime2.selectedNode)(value, value3);
        if (!value6 || value6.kind === "spacer" || !current)
          continue;
        let element = current.querySelector('[data-frame-id="' + value3.frameId + '"]'), value7 = element instanceof HTMLElement ? element.offsetParent : null, value8 = element?.querySelector('[data-node-path="' + (0, runtime2.selectionNodePath)(value3).join(".") + '"]');
        if (!(value8 instanceof Element) || !(value7 instanceof HTMLElement))
          continue;
        let bounds = value7.getBoundingClientRect();
        if (bounds.width <= 0)
          continue;
        let value9 = bounds.width / runtime2.SLIDE_WIDTH, bounds2 = value8.getBoundingClientRect();
        items.push({
          unit: value3,
          frame: (0, runtime2.createFreeFrameFromNode)(value6, {
            x: (bounds2.left - bounds.left) / value9,
            y: (bounds2.top - bounds.top) / value9,
            w: bounds2.width / value9,
            h: bounds2.height / value9
          })
        });
      }
      return items;
    }, removeUnusedFrameAssets = (input, options, context) => {
      let value = editorZoomApiRef.current?.groupMeasure;
      if (value === void 0)
        return options;
      let callback = (input2) => {
        let value2 = (0, runtime2.frameById)(input, input2.frameId)?.node, value3 = value2 !== void 0 && (0, runtime2.isOverlayNode)(value2) ? value2.layers.findIndex((input3) => input3.node === (0, runtime2.selectedNode)(options, input2)) : -1;
        if (!(value3 < 0))
          return value.rect((0, runtime2.createNodeSelection)(input2.frameId, [value3 + 1]));
      };
      return (0, runtime2.rewriteNestedOverlayPlacements)(options, new Set(context.map((input2) => input2.frameId)), {
        ...value,
        rect: callback
      });
    }, deleteSelection = () => {
      let value = getCurrentSlide();
      if (!value || selection.length === 0)
        return;
      let value2 = (0, runtime2.filterValidSelections)(value, selection);
      if (value2.length === 0)
        return;
      let value3 = value, value4 = value2.filter((input) => input.child !== void 0).sort((input, options) => (0, runtime2.compareNodePaths)((0, runtime2.selectionNodePath)(options), (0, runtime2.selectionNodePath)(input)));
      for (let value5 of value4)
        value3 = (0, runtime2.removeSlideNode)(value3, value5.frameId, (0, runtime2.selectionNodePath)(value5));
      for (let value5 of value2)
        value5.child === void 0 && (value3 = (0, runtime2.removeSlideFrame)(value3, value5.frameId));
      value3 = removeUnusedFrameAssets(value, value3, value4), commitSlideEdit(value, value3, "delete"), setSelection([]);
    }, selectedFrameIds = (input, options) => new Set(options.filter((input2) => {
      if (input2.child === void 0)
        return !0;
      let value = (0, runtime2.frameById)(input, input2.frameId);
      return value !== void 0 && (0, runtime2.isOverlayNode)(value.node) && input2.child === 0;
    }).map((input2) => input2.frameId)), changeSelectionLayerOrder = (input) => {
      let value = getCurrentSlide(), value2 = value ? selectedFrameIds(value, selection) : void 0;
      return !value || value2 === void 0 || value2.size === 0 ? !1 : (commitSlideEdit(value, (0, runtime2.reorderSlideFrames)(value, value2, input), input === "back" ? "send to back" : "bring to front"), !0);
    }, framePasteUnavailableMessage = (0, runtime2.internalPasteOnlyMessage)(), [contextMenu, setContextMenu] = runtime2.reactd0.useState(null), openContextMenu = (input, items) => {
      let current = editorZoomApiRef.current;
      if (current === null || !current.endTextEdit())
        return;
      current.endCrop(), stopTextTool(!0);
      let value = getCurrentSlide();
      if (!value)
        return;
      let value2 = (0, runtime2.groupSelectedUnits)(value, items, current.groupMeasure), value3 = (0, runtime2.ungroupSelectedUnits)(value, items, current.groupMeasure), value4 = selectedFrameIds(value, items), callback = (input2) => {
        if (value4.size === 0)
          return "Only an object placed directly on the slide can move to the front or back";
        let value6 = (0, runtime2.reorderSlideFrames)(value, value4, input2);
        if (value6 === value)
          return "The background stays behind everything";
        if (value6.frames.every((input3, options) => input3 === value.frames[options]))
          return "Already at the " + input2;
      }, value5 = (0, runtime2.getInternalClipboard)()?.kind, state = {
        paste: value5 === runtime2.FRAME_CLIPBOARD_TYPE || value5 === runtime2.SLIDE_CLIPBOARD_TYPE ? void 0 : framePasteUnavailableMessage,
        front: callback("front"),
        back: callback("back"),
        group: "refused" in value2 ? value2.refused : void 0,
        ungroup: "refused" in value3 ? value3.refused : void 0,
        properties: inspectorOpen ? "The Properties panel is already open" : void 0
      };
      setContextMenu((input2) => input2?.at.from === "key" && input.from === "key" ? input2 : {
        at: input,
        objects: items.length,
        refusals: state
      });
    };
    contextMenu !== null && (currentSlideReadOnly || contextMenu.objects > 0 && selection.length === 0) && setContextMenu(null);
    let runContextMenuCommand = (input, options) => {
      switch (input) {
        case "cut": {
          let value = frameClipboardAdapter.onCut();
          value !== void 0 && (0, runtime2.copySelectionForCommand)("cut", runtime2.FRAME_CLIPBOARD_TYPE, value) && value.commit();
          return;
        }
        case "copy": {
          let value = frameClipboardAdapter.onCopy();
          value !== void 0 && (0, runtime2.copySelectionForCommand)("copy", runtime2.FRAME_CLIPBOARD_TYPE, value);
          return;
        }
        case "paste": {
          let value = (0, runtime2.getInternalClipboard)();
          value?.kind === runtime2.FRAME_CLIPBOARD_TYPE ? frameClipboardAdapter.onPaste(value.data) : value?.kind === runtime2.SLIDE_CLIPBOARD_TYPE ? slideClipboardAdapter.onPaste(value.data) : (0, runtime2.showToast)(framePasteUnavailableMessage);
          return;
        }
        case "duplicate":
          return duplicateSelection();
        case "front":
        case "back":
          return void changeSelectionLayerOrder(input);
        case "group":
        case "ungroup":
          return groupOrUngroupSelection(input);
        case "properties":
          return inspectorPointerInvocationRef.current = (0, runtime2.isKeyboardOrPrimaryActivation)(options), setInspectorTab("properties"), setInspectorOpen(!0);
        case "delete":
          return deleteSelection();
        case "fit":
          return editorZoomApiRef.current?.returnToFit();
        case "link":
          return currentSlide === void 0 ? void 0 : copySlideLink(currentSlide.id);
      }
    }, groupOrUngroupSelection = (input) => {
      let value = getCurrentSlide(), value2 = editorZoomApiRef.current?.groupMeasure;
      if (!value || value2 === void 0)
        return;
      let value3 = (input === "group" ? runtime2.groupSelectedUnits : runtime2.ungroupSelectedUnits)(value, selection, value2);
      if ("refused" in value3) {
        (0, runtime2.showToast)(value3.refused);
        return;
      }
      commitSlideEdit(value, value3.slide, input), setSelection(value3.selection), value3.note !== void 0 ? (0, runtime2.showToast)(value3.note) : (0, runtime2.announceLiveMessage)(input === "group" ? "Grouped." : "Ungrouped.");
    }, handleClipboardCommand = (event) => {
      if ((0, runtime2.groupingKeyCommand)(event) === void 0 || presentationStartIndex !== null || (0, runtime2.hasOpenOverlay)() || gridTransitionActiveRef.current || gridLeavingRef.current || textEdit !== null)
        return !1;
      let target = event.target;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
        return !1;
      let value = target instanceof Element && target.closest("[data-slides-comments]") !== null;
      return !readOnly && !currentSlideReadOnly && !insertMenuRecentlyActive && !dragActiveRef.current && !value && getCurrentSlide() !== void 0 && selection.length > 0;
    }, clipboardCommandHandlerRef = runtime2.reactd0.useRef(handleClipboardCommand);
    clipboardCommandHandlerRef.current = handleClipboardCommand;
    let handleClipboardShortcut = runtime2.reactd0.useCallback((input) => clipboardCommandHandlerRef.current(input), []);
    runtime2.reactd0.useEffect(() => {
      let callback = (event) => {
        if (event.defaultPrevented)
          return;
        if (handleClipboardShortcut(event)) {
          event.preventDefault(), event.repeat || groupOrUngroupSelection((0, runtime2.groupingKeyCommand)(event) === "ungroup" ? "ungroup" : "group");
          return;
        }
        if (presentationStartIndex !== null)
          return;
        !readOnly && (0, runtime2.isDuplicateShortcut)(event) && event.preventDefault();
        let value = parseShapeInsertShortcut(event);
        if ((0, runtime2.hasOpenOverlay)() && !(insertMenuOpen && value !== void 0) || gridTransitionActiveRef.current || gridLeavingRef.current || textEdit !== null)
          return;
        let target = event.target;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
          return;
        let value2 = event.metaKey || event.ctrlKey, value3 = editorElementRef.current?.querySelector("[data-slide-surface]") ?? null, value4 = value3 !== null && (value3.contains(target) || target.contains(value3) || target instanceof Element && target.closest("[data-object-proxies]") !== null), value5 = target instanceof Element && target.closest("[data-mc-strip]") !== null, value6 = (0, runtime2.isInspectorFocusTarget)(target) || target instanceof Node && (inspectorRegion()?.contains(target) ?? !1), value7 = value4 || insertGestureActiveRef.current && !value5 && !value6;
        if ((event.key === "c" || event.key === "C") && !value2 && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing && !dragActiveRef.current && !value6 && !value5) {
          let ctl = commentController.ctl;
          if (ctl?.enterMode) {
            event.preventDefault(), commentController.on ? ctl.exitMode?.() : ctl.enterMode();
            return;
          }
        }
        let value8 = getCurrentSlide();
        if (!value8)
          return;
        let value9 = target instanceof Element && target.closest("[data-slides-comments]") !== null;
        if ((selection.length === 0 || currentSlideReadOnly || value9) && !value5 && !value6 && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "PageUp" || event.key === "PageDown")) {
          event.preventDefault(), pageSlide(event.key === "ArrowLeft" || event.key === "PageUp" ? -1 : 1);
          return;
        }
        if (readOnly || currentSlideReadOnly && !insertMenuRecentlyActive || dragActiveRef.current || value9)
          return;
        if (event.key === "Enter" && !event.repeat && !value2 && !event.shiftKey && !event.altKey && !insertMenuRecentlyActive && selection.length === 1 && (target === document.body || target.tabIndex < 0) && !editorHasBlockingOverlay()) {
          let value11 = selection[0], value12 = (0, runtime2.selectedNode)(value8, value11);
          if (value12?.kind === "text" || value12?.kind === "table" && value12.rows.length > 0 && value12.cols > 0) {
            event.preventDefault(), setTextEditState({
              frameId: value11.frameId,
              path: (0, runtime2.selectionNodePath)(value11),
              ...value12.kind === "table" ? {
                cell: {
                  r: 0,
                  c: 0
                }
              } : {},
              caret: "end"
            }), setProtectedEditorSlide(value8.id);
            return;
          }
        }
        if (value2 && event.key.toLowerCase() === "d") {
          if (insertMenuRecentlyActive) {
            event.preventDefault(), severalSlides ? railSeveral.onDuplicateSlides(slideOrderIds.filter((input) => slideSelection.has(input))) : duplicateSlide(value8.id);
            return;
          }
          if (selection.length > 0 && !currentSlideReadOnly) {
            event.preventDefault(), duplicateSelection();
            return;
          }
          !event.shiftKey && !event.altKey && event.preventDefault();
          return;
        }
        if (currentSlideReadOnly)
          return;
        if (value !== void 0 && !value6 && !value5) {
          event.preventDefault(), setInsertMenuOpen(!1), value === "text" ? insertText() : insertShape(value, {
            byKey: insertWasKeyboard()
          });
          return;
        }
        let value10 = event.key.toLowerCase();
        if (value2 && !event.shiftKey && !event.altKey && (value10 === "b" || value10 === "i" || value10 === "u")) {
          let value11 = (0, runtime2.filterValidSelections)(value8, selection);
          if (value11.length === 0 || (0, runtime2.commonSelectedNodeKind)(value8, value11) !== "text")
            return;
          event.preventDefault();
          let value12 = (0, runtime2.selectedNode)(value8, value11[value11.length - 1]);
          if (value12?.kind !== "text")
            return;
          let theme = snapshot.meta.theme, callback2 = (input) => value10 === "i" ? (0, runtime2.nodeIsItalic)(input) : value10 === "u" ? (0, runtime2.nodeIsUnderlined)(input) : (0, runtime2.nodeIsBold)(input, theme), callback3 = (input) => value10 === "i" ? (0, runtime2.toggleNodeItalic)(input) : value10 === "u" ? (0, runtime2.toggleNodeUnderline)(input) : (0, runtime2.toggleNodeBold)(input, theme, (0, runtime2.resolveTypographyEmphasisVariant)(input, currentTypeStyles, deckTypeStyles, theme)), value13 = value10 === "u" ? value11.map((input) => (0, runtime2.selectedNode)(value8, input)).find((input) => input?.kind === "text" && input.style?.textDecorationLine !== "line-through") : void 0, value14 = !callback2(value13?.kind === "text" ? value13 : value12), value15 = value11.reduce((input, options) => (0, runtime2.updateSelectedNode)(input, options, (source) => source.kind !== "text" || callback2(source) === value14 ? source : callback3(source)), value8);
          commitSlideEdit(value8, value15, value10 === "i" ? "italic" : value10 === "u" ? "underline" : "bold");
          return;
        }
        if ((0, runtime2.isContextMenuKey)(event) && value7 && !insertMenuRecentlyActive && !commentController.on) {
          let value11 = editorZoomApiRef.current?.menuPoint();
          if (value11 == null)
            return;
          event.preventDefault(), openContextMenu({
            ...value11,
            from: "key"
          }, selection);
          return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && selection.length > 0 && value7) {
          event.preventDefault(), target instanceof Element && target.closest("[data-object-proxy]") !== null && editorZoomApiRef.current?.focusSlide(), deleteSelection();
          return;
        }
        if ((event.key === "[" || event.key === "]") && !event.metaKey && (!event.ctrlKey || event.altKey) && selection.length > 0 && value7) {
          changeSelectionLayerOrder(event.key === "[" ? "back" : "front") && event.preventDefault();
          return;
        }
        if (event.key.startsWith("Arrow") && selection.length > 0 && value7) {
          event.preventDefault();
          let value11 = event.shiftKey ? 1 : 8, value12 = event.key === "ArrowLeft" ? -value11 : event.key === "ArrowRight" ? value11 : 0, value13 = event.key === "ArrowUp" ? -value11 : event.key === "ArrowDown" ? value11 : 0, values = new Set(selection.filter((input) => input.child === void 0).map((input) => input.frameId));
          if (values.size === 0)
            return;
          let value14 = value8, state = {
            ...value14,
            frames: value14.frames.map((input) => values.has(input.id) ? {
              ...input,
              x: (0, runtime2.moveAxisSpecPreservingSize)(input.x, value12, (0, runtime2.isTextNode)(input.node) ? editorZoomApiRef.current?.measureUnit({
                frameId: input.id
              })?.w : void 0, runtime2.SLIDE_WIDTH),
              y: (0, runtime2.moveAxisSpec)(input.y, value13)
            } : input)
          };
          commitSlideEdit(value14, state, "nudge");
          return;
        }
      };
      return window.addEventListener("keydown", callback), () => window.removeEventListener("keydown", callback);
    }, [
      currentSlide,
      selection,
      presentationStartIndex,
      textEdit,
      insertFrame,
      commitSlideEdit,
      slides,
      currentSlideIndex,
      readOnly,
      currentSlideReadOnly,
      insertMenuOpen,
      snapshot.meta.theme,
      deckTypeStyles,
      inspectorRegion,
      inspectorOpen,
      commentController.ctl,
      commentController.on,
      slideSelection.selected,
      insertMenuRecentlyActive
    ]), runtime2.reactd0.useEffect(() => {
      if (presentationStartIndex !== null || !textToolOn && textEdit === null && selection.length === 0)
        return;
      let callback = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing)
          return;
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        let target = event.target;
        if (!(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) && !(target instanceof Node && (inspectorRegion()?.contains(target) ?? !1)) && !(target === document.body && inspectorHadFocusRef.current && inspectorRegion() !== null) && !editorHasBlockingOverlay(", [data-media-crop]") && !(target instanceof Element && target.closest("[data-link-mode]") !== null)) {
          if (target instanceof Element && target.closest("[data-mc-strip]") !== null) {
            editorZoomApiRef.current?.focusSelection() === !0 && event.preventDefault();
            return;
          }
          if (textEdit === null) {
            if (event.preventDefault(), textToolOnRef.current)
              return stopTextTool();
            if (target instanceof Element && target.closest('[data-object-cursor="keys"]') !== null) {
              editorZoomApiRef.current?.focusSlide(), setSelection([]);
              return;
            }
            if (selection.length > 0 && selection.every((input) => input.child !== void 0)) {
              let items = [], values = /* @__PURE__ */ new Set(), flag = !1;
              for (let value of selection) {
                let value2 = (0, runtime2.parentNodeSelection)(value);
                if (value2 === void 0)
                  continue;
                let current = currentSlideRef.current, value3 = value2.child === void 0 && current !== void 0 ? (0, runtime2.frameById)(current, value2.frameId) : void 0, value4 = value3 !== void 0 && current !== void 0 && (0, runtime2.isPrimaryLayoutFrame)(current, value3) ? value : value2;
                value4 === value2 && (flag = !0);
                let value5 = value4.frameId + ":" + (0, runtime2.selectionNodePath)(value4).join(".");
                values.has(value5) || (values.add(value5), items.push(value4));
              }
              if (flag) {
                setSelection(items);
                return;
              }
            }
            target instanceof Element && target.closest("[data-object-proxy]") !== null && editorZoomApiRef.current?.focusSlide(), setSelection([]);
          }
        }
      };
      return window.addEventListener("keydown", callback, {
        capture: !0
      }), () => window.removeEventListener("keydown", callback, {
        capture: !0
      });
    }, [presentationStartIndex, textEdit, selection, inspectorRegion, textToolOn]);
    let insertTextRef = runtime2.reactd0.useRef(insertText);
    insertTextRef.current = insertText, runtime2.reactd0.useEffect(() => {
      if (!textToolOn)
        return;
      let onKeyDown = (event) => {
        if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || editorHasBlockingOverlay())
          return;
        let target = event.target;
        if (!(target instanceof Element) || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || "isContentEditable" in target && target.isContentEditable === !0)
          return;
        let surface = slideSurface();
        if (surface === null)
          return;
        let onSlide = target === document.body || target === surface || "tabIndex" in target && typeof target.tabIndex == "number" && target.tabIndex < 0 && (surface.contains(target) || target.contains(surface)), onRailOption = insertMenuRecentlyActive && target.getAttribute("role") === "option";
        !onSlide && !onRailOption && target.closest("[data-object-proxies]") === null || (event.preventDefault(), event.stopPropagation(), editorZoomApiRef.current?.endTextEdit() !== !1 && insertTextRef.current());
      };
      return window.addEventListener("keydown", onKeyDown, { capture: !0 }), () => window.removeEventListener("keydown", onKeyDown, { capture: !0 });
    }, [textToolOn, insertMenuRecentlyActive]), runtime2.reactd0.useEffect(() => {
      if (gridOpen || !editingGridSlide || presentationStartIndex !== null || commentController.on || textEdit !== null || selection.length > 0 || inspectorOpen || currentSlide === void 0)
        return;
      let callback = (event) => {
        if (event.key !== "Escape" || event.repeat || event.defaultPrevented || event.isComposing)
          return;
        let target = event.target;
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || editorHasBlockingOverlay() || (event.preventDefault(), returnToGrid());
      };
      return window.addEventListener("keydown", callback), () => window.removeEventListener("keydown", callback);
    }, [
      gridOpen,
      editingGridSlide,
      presentationStartIndex,
      commentController.on,
      textEdit,
      selection.length,
      inspectorOpen,
      currentSlide,
      returnToGrid
    ]), runtime2.reactd0.useEffect(() => {
      if (!severalSlides || presentationStartIndex !== null || commentController.on || inspectorOpen)
        return;
      let callback = (event) => {
        if (event.key !== "Escape" || event.repeat || event.defaultPrevented || event.isComposing)
          return;
        let target = event.target;
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || editorHasBlockingOverlay() || (event.preventDefault(), collapseSlideSelection());
      };
      return window.addEventListener("keydown", callback), () => window.removeEventListener("keydown", callback);
    }, [
      severalSlides,
      presentationStartIndex,
      commentController.on,
      inspectorOpen,
      collapseSlideSelection
    ]), runtime2.reactd0.useLayoutEffect(() => {
      if (!editingGridSlide) {
        gridFollowRef.current = null;
        return;
      }
      presentationStartIndex === null && (followGridEditingSlide(), currentSlide && gridSlideSurround && gridSlideSurround.id !== currentSlide.id && selectGridSlideSurround(currentSlide.id));
    }, [
      editingGridSlide,
      presentationStartIndex,
      currentSlide,
      gridSlideSurround,
      selectGridSlideSurround,
      followGridEditingSlide
    ]);
    let editorSurround = runtime2.reactd0.useMemo(() => editingGridSlide && gridSlideSurround ? {
      seat: gridSlideSurround.rect,
      pick: gridSlideSurround.pick,
      minScale: gridSlideSurround.minScale,
      maxScale: gridSlideSurround.maxScale,
      onViewChange: (input, options) => {
        gridFollowRef.current = {
          id: gridSlideSurround.id,
          view: input,
          rect: options
        }, followGridEditingSlide();
      },
      onOutsideClick: (input, options) => returnToGrid({
        select: gridZoomApiRef.current?.tileAt(input, options) ?? void 0
      }),
      onFit: () => returnToGrid({
        fit: !0
      })
    } : void 0, [
      editingGridSlide,
      gridSlideSurround,
      followGridEditingSlide,
      returnToGrid
    ]), frameClipboardAdapter = {
      kind: runtime2.FRAME_CLIPBOARD_TYPE,
      enabled: presentationStartIndex === null && textEdit === null && !gridOpen,
      onCopy: () => {
        if (insertMenuRecentlyActive || !currentSlide)
          return;
        let value = getCopyableSelection();
        if (value.length === 0)
          return;
        let value2 = value.map((input) => input.frame);
        return {
          data: (0, runtime2.createFramesClipboardPayload)(value2, snapshot.assets),
          text: (0, runtime2.framesClipboardText)(value2)
        };
      },
      onCut: () => {
        let value = getCurrentSlide();
        if (currentSlideHeld && !readOnly && !insertMenuRecentlyActive && selection.length > 0 && (0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE), currentSlideReadOnly || insertMenuRecentlyActive || !value || dragActiveRef.current)
          return;
        let value2 = getCopyableSelection();
        if (value2.length === 0)
          return;
        let value3 = value2.map((input) => input.frame), value4 = value, value5 = value2.map((input) => input.unit);
        return {
          data: (0, runtime2.createFramesClipboardPayload)(value3, snapshot.assets),
          text: (0, runtime2.framesClipboardText)(value3),
          commit: () => {
            let activeElement2 = document.activeElement;
            activeElement2 instanceof Element && activeElement2.closest("[data-object-proxy]") !== null && editorZoomApiRef.current?.focusSlide();
            let value6 = value4, value7 = value5.filter((input) => input.child !== void 0).sort((input, options) => (0, runtime2.compareNodePaths)((0, runtime2.selectionNodePath)(options), (0, runtime2.selectionNodePath)(input)));
            for (let value8 of value7)
              value6 = (0, runtime2.removeSlideNode)(value6, value8.frameId, (0, runtime2.selectionNodePath)(value8));
            for (let value8 of value5)
              value8.child === void 0 && (value6 = (0, runtime2.removeSlideFrame)(value6, value8.frameId));
            value6 = removeUnusedFrameAssets(value4, value6, value7), commitSlideEdit(value4, value6, "cut"), setSelection([]);
          }
        };
      },
      onPaste: (input) => {
        stopTextTool(!0);
        let value = getCurrentSlide();
        if (currentSlideHeld && !readOnly && (0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE), currentSlideReadOnly || !value || dragActiveRef.current)
          return;
        let value2 = (0, runtime2.parsePastedFrames)(input, value, snapshot.assets);
        if ("error" in value2) {
          (0, runtime2.showToast)(value2.error);
          return;
        }
        let value3 = value2.frames.reduce((input2, options) => input2 + (0, runtime2.countNodeTableCells)(options.node), 0);
        if (!canAddTableCells(value3) || !canAddStyledNodes(value2.frames.map((input2) => input2.node)))
          return;
        let value4 = value, state = {
          ...value4,
          frames: [...value4.frames, ...value2.frames]
        };
        undoHistory.exec({
          label: "粘贴",
          do: () => {
            if (slideHtmlHold2(state.id) !== void 0)
              return void canChangeSlide(state);
            for (let [value6, value7] of value2.addAssets)
              documentStore.setAssetEntry(value6, value7);
            documentStore.setSlide(state);
          },
          undo: () => {
            if (canChangeSlide(value4))
              for (let [value6] of value2.addAssets)
                documentStore.removeAssetEntry(value6);
          }
        });
        let value5 = value2.frames[value2.frames.length - 1];
        insertWasKeyboard() && value5 !== void 0 && editorZoomApiRef.current?.landOnCreated(value5.id), setSelection(value2.frames.map((input2) => ({
          frameId: input2.id
        }))), value2.leftClips && (0, runtime2.showToast)(COPIED_VIDEO_OMISSION_MESSAGE);
      },
      onPasteText: (input) => {
        if (currentSlideHeld && !readOnly && (0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE), currentSlideReadOnly || !currentSlide || dragActiveRef.current)
          return !1;
        let value2 = (0, runtime2.defaultBodyTypographyStyle)(deckTypeStyles), state = {
          kind: "text",
          role: "body",
          text: (0, runtime2.truncateUtf16Safely)(input, 2e3),
          ...value2 !== null ? {
            style: {
              fontWeight: value2.fontWeight
            }
          } : {}
        }, state2 = {
          id: (0, runtime2.createModelId)(),
          ...placeInsertedFrame(void 0, 720),
          node: value2 !== null ? (0, runtime2.applyTypographyStyle)(state, value2, snapshot.meta.theme) : state
        };
        return insertFrame(state2, "paste", insertWasKeyboard()), !0;
      },
      onPasteFiles: (input) => {
        if (currentSlideHeld && !readOnly)
          return (0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE), !0;
        let value = input.find(runtime2.isImageFile) ?? input[0];
        return currentSlideReadOnly || !currentSlide || dragActiveRef.current || value === void 0 ? !1 : (insertImageFromInput(value, {
          byKey: insertWasKeyboard()
        }), !0);
      },
      acceptFile: (input) => (0, runtime2.isImageFile)(input) || !1
    };
    (0, runtime2.useArtifactClipboard)(frameClipboardAdapter);
    let slideClipboardAdapter = {
      kind: runtime2.SLIDE_CLIPBOARD_TYPE,
      enabled: presentationStartIndex === null && textEdit === null,
      onCopy: () => {
        if (gridOpen) {
          let value = slides.filter((input) => gridSelection.slides.includes(input.id));
          return value.length > 0 ? {
            data: (0, runtime2.createSlidesClipboardPayload)(value, snapshot.assets),
            text: (0, runtime2.slidesClipboardText)(value)
          } : void 0;
        }
        if (!(!insertMenuRecentlyActive || !currentSlide)) {
          if (severalSlides) {
            let value = slides.filter((input) => slideSelection.has(input.id));
            return refuseHeldSlideCopy(value.map((input) => input.id)) ? void 0 : ((0, runtime2.announceLiveMessage)(String(value.length) + " slides copied"), {
              data: (0, runtime2.createSlidesClipboardPayload)(value, snapshot.assets),
              text: (0, runtime2.slidesClipboardText)(value)
            });
          }
          if (!refuseHeldSlideCopy([currentSlide.id]))
            return {
              data: (0, runtime2.createSlideClipboardPayload)(currentSlide, snapshot.assets),
              text: (0, runtime2.slideClipboardText)(currentSlide)
            };
        }
      },
      onCut: () => {
        if (readOnly || gridOpen || !insertMenuRecentlyActive || !currentSlide || slides.length <= 1)
          return;
        if (severalSlides) {
          let value2 = slides.filter((input) => slideSelection.has(input.id)), ids = value2.map((input) => input.id), refusal = value2.length >= slides.length ? LAST_SLIDE_DELETE_MESSAGE : ids.some((input) => slideHtmlHold2(input) !== void 0) ? DAMAGED_SLIDES_DELETE_MESSAGE : void 0;
          if (refusal !== void 0) {
            (0, runtime2.showToast)(refusal);
            return;
          }
          return {
            data: (0, runtime2.createSlidesClipboardPayload)(value2, snapshot.assets),
            text: (0, runtime2.slidesClipboardText)(value2),
            commit: () => {
              let before = documentStore.getSnapshot().meta.order.length;
              deleteSlides(ids);
              let gone = before - documentStore.getSnapshot().meta.order.length;
              gone > 1 && (0, runtime2.announceLiveMessage)(String(gone) + " slides cut"), refocusRailAfterRemoval(insertMenuRef);
            }
          };
        }
        let value = currentSlide;
        return slideHtmlHold2(value.id) !== void 0 ? void (0, runtime2.showToast)(DAMAGED_SLIDE_ACTION_MESSAGE) : {
          data: (0, runtime2.createSlideClipboardPayload)(value, snapshot.assets),
          text: (0, runtime2.slideClipboardText)(value),
          commit: () => {
            deleteSlide(value.id), refocusRailAfterRemoval(insertMenuRef);
          }
        };
      },
      onPaste: (input) => {
        if (readOnly)
          return;
        if (hidingMovedDeck()) {
          (0, runtime2.showToast)(LOADING_PRESENTATION_PASTE_MESSAGE);
          return;
        }
        let value = (0, runtime2.parsePastedSlides)(input, slides, snapshot.assets);
        if ("error" in value) {
          (0, runtime2.showToast)(value.error);
          return;
        }
        let value2 = gridOpen ? Math.max(currentSlideIndex, slides.findLastIndex((input2) => gridSelection.slides.includes(input2.id))) : insertMenuRecentlyActive && severalSlides ? Math.max(currentSlideIndex, slides.findLastIndex((input2) => slideSelection.has(input2.id))) : currentSlideIndex, value3 = value2 >= 0 ? value2 + 1 : slides.length, entries = new Map(value.addAssets);
        {
          let values2 = /* @__PURE__ */ new Set();
          for (let value4 of value.slides)
            (0, runtime2.collectSlideAssetIds)(value4, values2);
          for (let value4 of values2) {
            let value5 = entries.get(value4) ?? snapshot.assets.get(value4);
            value5 !== void 0 && entries.set(value4, value5);
          }
        }
        let values = /* @__PURE__ */ new Set(), items = [];
        undoHistory.exec({
          label: value.slides.length > 1 ? "粘贴多页幻灯片" : "粘贴幻灯片",
          canDo: () => {
            let length = value.slides.filter((input2) => documentStore.getSlide(input2.id) === void 0).length;
            return length === 0 || documentStore.getSnapshot().meta.order.length + length <= runtime2.maxDeckSlides ? !0 : ((0, runtime2.showToast)(presentationSlideCapacityMessage(length)), !1);
          },
          do: () => {
            if (value.slides.some((input2) => documentStore.getSlide(input2.id) !== void 0 && slideCapacityAvailable(input2.id)))
              return;
            items = items.filter((input2) => documentStore.getSlide(input2.id) !== void 0);
            let value4 = value.slides.filter((input2) => documentStore.getSlide(input2.id) === void 0);
            if (value4.length > 0)
              for (let value6 of showPasteWarnings(entries))
                values.add(value6);
            let value5 = value3;
            for (let value6 of value4)
              items.push({
                id: value6.id,
                ob: documentStore.sectionsSnapshot()
              }), documentStore.insertSlide(value6, value5++);
          },
          undo: () => {
            documentStore.forgetParked(value.slides.map((input2) => input2.id));
            let value4 = value.slides.filter((input2) => documentStore.getSlide(input2.id) !== void 0);
            if (value4.some(({ id }) => slideCapacityAvailable(id)))
              return;
            let entries2 = new Map(items.map((input2) => [input2.id, input2.ob]));
            for (let { id: value6 } of [...value4].reverse()) {
              for (let [value7, value8] of Object.entries(documentStore.snapshotAssetsFor(value6)))
                entries.set(value7, value8);
              documentStore.removeSlideKeepAssets(value6);
              let entry = entries2.get(value6);
              entry && documentStore.restoreSections(entry);
            }
            let value5 = referencedAssetIds();
            for (let value6 of values)
              value5.has(value6) || documentStore.removeAssetEntry(value6);
            values = new Set([...values].filter((input2) => value5.has(input2)));
          }
        }), value.leftClips && (0, runtime2.showToast)(COPIED_VIDEO_OMISSION_MESSAGE), setCurrentSlideId(value.slides[value.slides.length - 1].id), setSelection([]);
        let pasted = railSelectionLive && insertMenuRecentlyActive ? value.slides.flatMap((input2) => documentStore.getSlide(input2.id) !== void 0 ? [input2.id] : []) : [];
        pasted.length > 1 && (severalSlides && rememberDuplicatedSelection(pasted, slideOrderIds.filter((input2) => slideSelection.has(input2))), slideSelection.set(pasted), (0, runtime2.announceLiveMessage)(String(pasted.length) + " slides pasted"));
      }
    };
    (0, runtime2.useArtifactClipboard)(slideClipboardAdapter), runtime2.reactd0.useEffect(() => {
      if (!severalSlides)
        return;
      let callback = (event) => {
        event.target instanceof Node && editorElementRef.current?.contains(event.target) === !0 && collapseSlideSelection();
      };
      return document.addEventListener("pointerdown", callback, !0), () => document.removeEventListener("pointerdown", callback, !0);
    }, [severalSlides, collapseSlideSelection]);
    let editorElementRef = runtime2.reactd0.useRef(null), [topInset, registerEditorElement, sideInset] = (0, runtime2.useToolbarInsets)(), [gridTopInset, registerGridElement] = (0, runtime2.useToolbarInsets)(), railLayout = (0, runtime2.PageOcclusionReporter)({
      band: pageOcclusionBand,
      presenting: presentationStartIndex !== null,
      settle: [
        railOpen,
        notesOpen,
        notesHeight,
        thumbWidth,
        gridOpen,
        editingGridSlide,
        currentSlide === void 0
      ].join(),
      speaksForPage: host === void 0
    }), { stage: setRailSlidesView, canvasView: setRailGridView } = railLayout, gridViewElementRef = runtime2.reactd0.useRef(null), registerGridElementAndRail = runtime2.reactd0.useCallback((input) => {
      gridViewElementRef.current = input, registerGridElement(input), setRailGridView(input);
    }, [registerGridElement, setRailGridView]), findViewStateRef = runtime2.reactd0.useRef({
      slides: snapshot.slides,
      currentId: currentSlideId,
      inGrid: gridOpen && !editingGridSlide
    });
    findViewStateRef.current = {
      slides: snapshot.slides,
      currentId: currentSlideId,
      inGrid: gridOpen && !editingGridSlide
    };
    let findViewSubscribers = runtime2.reactd0.useRef(/* @__PURE__ */ new Set()), findViewGeneration = textEdit !== null;
    runtime2.reactd0.useEffect(() => {
      for (let value of findViewSubscribers.current)
        value();
    }, [
      snapshot.slides,
      currentSlideId,
      gridOpen,
      editingGridSlide,
      findViewGeneration
    ]);
    let findNavigationSequenceRef = runtime2.reactd0.useRef(0), findPainter = runtime2.reactd0.useMemo(() => (0, runtime2.createFindHighlightPainter)({
      slides: () => findViewStateRef.current.slides,
      subscribe: (input) => (findViewSubscribers.current.add(input), () => void findViewSubscribers.current.delete(input)),
      inGrid: () => findViewStateRef.current.inGrid,
      currentId: () => findViewStateRef.current.currentId,
      showSlide: (input) => {
        editorZoomApiRef.current?.endTextEdit(), (0, runtime2.blurEditingTargetForFind)(document, "[data-notes-tray]"), findNavigationSequenceRef.current++, setCurrentSlideId(input), setSelection([]), setTextEditState(null);
      },
      panGridTo: (input) => void gridZoomApiRef.current?.tileRect(input),
      returnToFit: () => editorZoomApiRef.current?.returnToFit(),
      viewport: () => document.querySelector("[data-slides-editor]"),
      surfaces: (input) => {
        let value = input === findViewStateRef.current.currentId ? document.querySelector(ACTIVE_SLIDE_SURFACE_SELECTOR) : null, element = document.querySelector('[data-grid-tile="' + CSS.escape(input) + '"]');
        return [value, element].filter((input2) => input2 !== null);
      }
    }), []), ownsPageFind = host !== void 0;
    runtime2.reactd0.useEffect(() => ownsPageFind ? (0, runtime2.trackSlidesFindScope)(window) : void 0, [ownsPageFind]);
    let findController = (0, runtime2.useArtifactFind)({
      adapter: findPainter,
      enabled: presentationStartIndex === null,
      isOurs: (input) => !ownsPageFind || (0, runtime2.canHandleSlidesFindShortcut)(input),
      ownsStepChord: handleClipboardShortcut,
      viewMoves: () => findNavigationSequenceRef.current,
      restoreFocus: () => editorZoomApiRef.current?.focusSlide()
    }), creationStageRef = runtime2.reactd0.useCallback((input) => {
      editorElementRef.current = input, registerEditorElement(input), setRailSlidesView(input);
    }, [registerEditorElement, setRailSlidesView]), getFittedSlideScale = runtime2.reactd0.useCallback(() => {
      let value = editorElementRef.current?.getBoundingClientRect();
      if (value !== void 0)
        return (0, runtime2.fitSlideEditorViewport)({
          w: value.width,
          h: Math.max(0, value.height - topInset - pageOcclusionBand),
          top: topInset,
          sidePad: sideInset > 0 ? sideInset : void 0
        }).scale;
    }, [topInset, sideInset, pageOcclusionBand]), designPaletteRef = runtime2.reactd0.useRef(EMPTY_EXTRA_EXPORT_FORMATS), designPalette = runtime2.reactd0.useMemo(() => {
      if (liveGestureRef.current)
        return designPaletteRef.current;
      let value = designSystemActive ? EMPTY_EXTRA_EXPORT_FORMATS : (0, runtime2.collectPresentationPalette)(slides);
      return designPaletteRef.current.join() !== value.join() && (designPaletteRef.current = value), designPaletteRef.current;
    }, [slides, gestureGeneration, designSystemActive]), slidePaletteRef = runtime2.reactd0.useRef(EMPTY_EXTRA_EXPORT_FORMATS), slidePalette = runtime2.reactd0.useMemo(() => {
      if (liveGestureRef.current)
        return slidePaletteRef.current;
      let value = designSystemActive && currentSlide !== void 0 ? (0, runtime2.collectPresentationPalette)([currentSlide], 1 / 0) : EMPTY_EXTRA_EXPORT_FORMATS;
      return slidePaletteRef.current.join() !== value.join() && (slidePaletteRef.current = value), slidePaletteRef.current;
    }, [currentSlide, gestureGeneration, designSystemActive]), currentSlideRef = runtime2.reactd0.useRef(currentSlide);
    currentSlideRef.current = currentSlide, runtime2.reactd0.useEffect(() => {
      let callback = (input) => input instanceof Node && (inspectorRegion()?.contains(input) ?? !1), callback2 = (event) => {
        inspectorHadFocusRef.current = callback(event.target), inspectorHadFocusRef.current && (inspectorLastFocusRegionRef.current = inspectorRegion());
      }, callback3 = (event) => {
        callback(event.target) && event.relatedTarget instanceof Node && !callback(event.relatedTarget) && (inspectorHadFocusRef.current = !1);
      }, callback4 = (event) => {
        let value = event.target instanceof Element && event.target.closest(runtime2.OPEN_OVERLAY_SELECTOR) !== null;
        !callback(event.target) && !value && (inspectorHadFocusRef.current = !1);
      };
      return document.addEventListener("focusin", callback2), document.addEventListener("focusout", callback3), document.addEventListener("pointerdown", callback4, !0), () => {
        document.removeEventListener("focusin", callback2), document.removeEventListener("focusout", callback3), document.removeEventListener("pointerdown", callback4, !0);
      };
    }, [inspectorRegion]), inspectorUnasked && !inspectorOpen && setInspectorUnasked(!1);
    let inspectorWasOpenRef = runtime2.reactd0.useRef(inspectorOpen);
    runtime2.reactd0.useEffect(() => {
      let current = inspectorWasOpenRef.current;
      inspectorWasOpenRef.current = inspectorOpen;
      let current2 = inspectorPointerInvocationRef.current;
      if (inspectorPointerInvocationRef.current = !1, inspectorOpen === current)
        return;
      let index4 = 0, callback = (input) => {
        index4 = requestAnimationFrame(() => {
          let activeElement2 = document.activeElement, value = activeElement2 === document.body || activeElement2 === null;
          if (inspectorOpen) {
            if (!current2)
              return;
            let value2 = inspectorCloseButton();
            if (value2 === null) {
              input > 0 && callback(input - 1);
              return;
            }
            value2.focus({
              preventScroll: !0
            });
            return;
          }
          (value || (inspectorLastFocusRegionRef.current?.contains(activeElement2) ?? !1)) && (current2 || inspectorHadFocusRef.current) && editorZoomApiRef.current?.focusSelection() !== !0 && inspectorReturnFocusRef.current?.focus({
            preventScroll: !0
          });
        });
      };
      return callback(4), () => cancelAnimationFrame(index4);
    }, [inspectorOpen, inspectorCloseButton]), (0, runtime2.useRegionKeyboardNavigation)([
      {
        el: () => document.querySelector("header.tb-root")
      },
      {
        el: () => editorElementRef.current,
        home: !0,
        enter: () => editorZoomApiRef.current?.focusSelection() ?? !1,
        fallback: () => editorElementRef.current?.querySelector("[data-slide-surface]") ?? null
      },
      {
        el: () => document.querySelector("[data-slides-strip]")
      },
      {
        el: () => insertMenuRef.current,
        fallback: () => insertMenuRef.current?.querySelector('[role="option"][aria-selected="true"]') ?? null
      },
      {
        el: inspectorRegion,
        fallback: inspectorCloseButton
      },
      (0, runtime2.notificationsFocusRegion)()
    ], () => presentingRef.current || gridTransitionActiveRef.current || gridLeavingRef.current), (0, runtime2.useCanvasFocusResolver)(() => creationControllerRef.current.view.sheet !== "none" ? null : findActiveCommentSlideTarget(currentSlide?.id ?? null));
    let focusRegionNavigatorRef = runtime2.reactd0.useRef(null);
    runtime2.reactd0.useEffect(() => {
      let current = editorElementRef.current;
      if (!current)
        return;
      let value = (0, runtime2.createSlideAnimationEngine)({
        root: current,
        resolveBag: (input) => (0, runtime2.replayClickedNodeAnimation)(currentSlideRef.current, input)
      });
      return focusRegionNavigatorRef.current = value, () => {
        value.dispose(), focusRegionNavigatorRef.current = null;
      };
    }, [currentSlide !== void 0]), runtime2.reactd0.useEffect(() => {
      focusRegionNavigatorRef.current?.refresh();
    }, [currentSlide, snapshot.assets]);
    let deliverExportFile = (input, options, context, value, extra) => {
      if (input.outcome === "saved")
        (0, runtime2.showToast)("已保存 " + context);
      else if (input.outcome === "withheld")
        (0, runtime2.showToast)(runtime2.DOWNLOADS_UNAVAILABLE_MESSAGE);
      else if (input.outcome === "unsupported") {
        if (input.code === "no_shell_save" && ((0, runtime2.downloadBlobInBrowser)(options, context), window.top === window))
          return;
        setExportDelivery({
          blob: options,
          filename: context,
          mime: value,
          kind: extra,
          reason: input.code
        });
      }
    }, extraExportFormatsUnavailableMessage = (items) => "导出说明：" + String(items[0]) + (items.length > 1 ? " (+" + String(items.length - 1) + " 条）" : ""), exportNotesToastRef = runtime2.reactd0.useRef(null), showExportNotes = (items) => {
      if (!extraExportFormats) {
        items.length > 0 && (0, runtime2.showToast)(extraExportFormatsUnavailableMessage(items));
        return;
      }
      let items2 = [...new Set(items)];
      if (items2.length === 0)
        return;
      if (exportNotesToastRef.current !== null && (0, runtime2.closeToast)(exportNotesToastRef.current), items2.length === 1) {
        exportNotesToastRef.current = (0, runtime2.showToast)(extraExportFormatsUnavailableMessage(items2));
        return;
      }
      let value = (0, runtime2.showActionToast)(extraExportFormatsUnavailableMessage(items2), SlidesAppJsx.jsx(runtime2.Button, {
        size: "sm",
        variant: "secondary",
        onClick: () => {
          (0, runtime2.closeToast)(value), setExportNotes((input) => ({
            notes: items2,
            nth: (input?.nth ?? 0) + 1
          }));
        },
        children: "详情"
      }));
      exportNotesToastRef.current = value;
    }, renderPptxFile = async (input, { maxBytes } = {}) => {
      let [{ measureDeck: value2 }, { deckToPptxBlob: value3, pptxFilename: value4 }, { toBasicFonts: value5 }, { measuredAsGoogleSlides: value6, toGoogleSlidesFonts: value7 }, { pageFontSet: value8, toCurrentFonts: value9, usesLinkedGoogleFamily: usesLinkedFamily }, value] = await Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializeDeckMeasurement)(), runtime2.deckMeasurementExports)),
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePptxExport)(), runtime2.pptxGeometryExports)),
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializeFontSubstitution)(), runtime2.fontSubstitutionExports)),
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializeGoogleSlidesFonts)(), runtime2.googleSlidesFontExports)),
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializeCurrentFonts)(), runtime2.currentFontExports)),
        inlineLocalDeckResources(presentableSlides, snapshot.assets)
      ]), value11 = Date.now() + runtime2.fontReadyTimeoutMs, licenceLists = input === "current" && extraExportFormats && usesLinkedFamily(value.slides, snapshot.faces, snapshot.fonts) ? (0, runtime2.loadGoogleFontLicences)({
        dir: runtime2.GOOGLE_FONT_LISTS_DIR,
        deadline: Date.now() + FONT_LICENCE_LISTS_TIMEOUT_MS
      }) : void 0, value12 = input === "current" && extraExportFormats ? await value9(value8(document), value.slides, snapshot.faces, snapshot.fonts, value11 - Date.now()) : {
        slides: value.slides,
        moved: [],
        notes: []
      }, fontEmbedding = licenceLists !== void 0 ? Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => {
          (0, runtime2.initializePptxFontEmbedding)();
        }),
        licenceLists
      ]).then(async ([, lists]) => ({
        embedded: await (0, runtime2.embedGoogleFontsForPptx)(value12.slides, snapshot.faces, snapshot.fonts, lists),
        leaveOutCarried: runtime2.leaveOutCarriedFonts
      })).catch(() => {
      }) : void 0, { swapped: value13, swaps: value14 } = (0, runtime2.createFontSubstitutionTracker)(), value15 = input === "basic" ? value5(value.slides, value13) : input === "google" && !extraExportFormats ? value7(value.slides, snapshot.faces, snapshot.fonts, value13) : value12.slides, value16 = input === "google" && extraExportFormats ? await value6(document, value.slides, snapshot.faces, snapshot.fonts, (input2, options) => (value15 = input2, value2(snapshot.meta.title, input2, value.assets, options)), {
        swapped: value13
      }) : await value2(snapshot.meta.title, value15, value.assets, {
        fontsReadyMs: Math.max(0, value11 - Date.now())
      }), value17 = extraExportFormats && input !== "google", embedding = await fontEmbedding, embedded = embedding?.embedded, pptxOptions = {
        theme: value17,
        titlePlaceholders: value17
      }, { blob: value18, warnings: value19 } = await value3(value16, {
        ...pptxOptions,
        ...embedded !== void 0 && embedded.fonts.length > 0 && {
          embeddedFonts: embedded.fonts,
          description: embedded.licenceText
        }
      });
      embedding !== void 0 && embedded !== void 0 && embedded.fonts.length > 0 && maxBytes !== void 0 && value18.size > maxBytes && (embedded = embedding.leaveOutCarried(embedded), { blob: value18, warnings: value19 } = await value3(value16, pptxOptions));
      let value20 = extraExportFormats ? input === "current" ? [
        ...value12.notes,
        ...embedded?.notes ?? [],
        ...[
          (0, runtime2.presentationFontPortabilityWarning)(value12.slides, embedded?.families.map((input2) => input2.family))
        ].filter((input2) => input2 !== void 0)
      ] : (0, runtime2.formatFontSubstitutionNotes)(value14(), input) : [];
      return {
        blob: value18,
        filename: value4(snapshot.meta.title),
        warnings: [...value20, ...value.warnings, ...value19]
      };
    }, downloadBasicPptx = async ({ blob, filename, warnings }) => {
      let value = await (0, runtime2.saveThroughShell)(blob, filename);
      deliverExportFile(value, blob, filename, runtime2.PPTX_MIME_TYPE, "PPTX"), showExportNotes(warnings);
    }, exportPptx = async (input) => {
      if (!(exporting || exportDialogPendingRef.current || presentableSlides.length === 0)) {
        if (downloadsWithheld2) {
          (0, runtime2.showToast)(runtime2.DOWNLOADS_UNAVAILABLE_MESSAGE);
          return;
        }
        if (await confirmCompleteDeckExport("Download")) {
          setExporting(!0);
          try {
            let value = await exportStateRef.current.renderPptxFile(input);
            await downloadBasicPptx(value);
          } catch (value) {
            (0, runtime2.showToast)(exportFailedMessage("pptx", value instanceof Error ? value.message : String(value)));
          } finally {
            setExporting(!1);
          }
        }
      }
    }, renderPdfFile = async (options, context, value = {}, extra = !1) => {
      let [{ CAPTURE_TIERS: value4, PAGE_W_PT: value5, captureSlidesAsJpegs: value6 }, value2, value3] = await Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePdfCapture)(), runtime2.pdfCaptureExports)),
        extra ? (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializeNotesPages)(), runtime2.notesPageExports)) : void 0,
        inlineLocalDeckResources(presentableSlides, snapshot.assets)
      ]), value7 = (0, runtime2.defaultBodyTypographyStyle)(deckTypeStyles), value8 = value2?.planNotesPages(value3.slides, (input2) => value7 !== null ? (0, runtime2.applyTypographyStyle)(input2, value7, snapshot.meta.theme) : input2);
      return {
        tiers: value4,
        renderAt: async (input2, options2) => {
          let state = {
            packWebFonts: extraExportFormats,
            fontsReadyMs: runtime2.fontReadyTimeoutMs,
            ...extraExportFormats && {
              nameMissingFonts: !0
            },
            ...value,
            ...options2
          }, value9 = value3.slides.length / (value3.slides.length + (value8?.noteSlides.length ?? 0)), value10 = options2 === void 0 || value8 === void 0 ? state : {
            ...state,
            deadline: Date.now() + (options2.deadline - Date.now()) * value9
          }, value11 = await value6(value3.slides, value3.assets, input2, value10), { pages: value12 } = value11, items = [...value3.warnings, ...value11.warnings], copyMs = value11.copyMs;
          if (value2 !== void 0 && value8 !== void 0 && value8.noteSlides.length > 0) {
            let value15 = value2.notesPictureAssets(value3.slides, value11.pages, value8.after), value16 = value8.after.flatMap((input3, options3) => Array.from({
              length: input3
            }, () => options3 + 1)), callback = (input3) => input3.replace(/\bslides? (\d+(?:, \d+)*)/g, (input4, options3) => {
              let value18 = options3.split(", ").map((input5) => String(value16[Number(input5) - 1] ?? "?"));
              return (value18.length === 1 ? "the notes page for slide " : "the notes pages for slides ") + value18.join(", ");
            }), value17;
            try {
              value17 = await value6(value8.noteSlides, new Map([...value3.assets, ...value15]), input2, state);
            } catch (value18) {
              throw value18 instanceof Error ? Error(callback(value18.message), {
                cause: value18
              }) : value18;
            }
            value12 = value2.placeNotesPages(value12, value17.pages, value8.after, value5 / runtime2.SLIDE_WIDTH);
            for (let value18 of value17.warnings.map(callback))
              items.includes(value18) || items.push(value18);
            for (let value18 of value8.cut)
              items.push("slide " + String(value18) + ": its speaker notes run past " + String(value2.NOTES_PAGE.maxPages) + " notes pages, so the last one may be set smaller and not show them all");
            copyMs = (copyMs ?? 0) + (value17.copyMs ?? 0);
          }
          let index4 = 0, index22 = 0;
          for (let value15 of value12)
            index4 += value15.lossless?.zlib.length ?? 0, index22 += value15.lossless?.zlib.length ?? value15.jpeg.length;
          let value13 = index22 > 0 ? 2 - index4 / index22 : 2;
          return {
            blob: await context(value12, value3.slides),
            filename: options,
            warnings: items,
            sizeExponent: value13,
            copyMs
          };
        }
      };
    }, preparePdfRender = async (input = !1) => {
      let [{ PAGE_H_PT: value, PAGE_W_PT: value2, pdfFilename: value3 }, { documentLanguage: value4, jpegPagesToPdf: value5 }] = await Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePdfCapture)(), runtime2.pdfCaptureExports)),
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePdfWriter)(), runtime2.pdfWriterExports))
      ]);
      return renderPdfFile(value3(snapshot.meta.title), (input2) => {
        let value6 = value5(input2.map((input3) => ({
          jpeg: input3.jpeg,
          lossless: input3.lossless,
          widthPt: value2,
          heightPt: value,
          textRuns: input3.textRuns,
          blocks: input3.blocks,
          links: input3.links
        })), extraExportFormats ? {
          title: snapshot.meta.title,
          textEncoding: "unicode",
          tagged: !0,
          outline: !0,
          lang: value4(snapshot.meta.title + `
` + input2.flatMap((input3) => input3.textRuns.map((input4) => input4.text)).join(`
`))
        } : {
          title: snapshot.meta.title,
          textEncoding: "winansi"
        });
        return new Blob([value6.slice().buffer], {
          type: runtime2.PDF_MIME_TYPE
        });
      }, {
        losslessPages: extraExportFormats
      }, input);
    }, preparePptxPicturesRender = async () => {
      let [{ slidePicturesToPptxBlob: value }, { pptxFilename: value2 }] = await Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePicturePptx)(), runtime2.picturePptxExports)),
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePptxExport)(), runtime2.pptxGeometryExports))
      ]);
      return renderPdfFile(value2(snapshot.meta.title), (input, options) => value(snapshot.meta.title, options, input));
    }, renderWithImageBudget = async ({ tiers, renderAt, reducedNote = () => SHELL_EXPORT_IMAGE_REDUCTION_NOTE }, options, context, value) => {
      let callback = async (input) => {
        let value5 = Date.now(), value6 = await renderAt(input, {
          deadline: context,
          maxBytes: options >= MAX_BROWSER_EXPORT_BYTES ? Number.POSITIVE_INFINITY : options,
          ...value !== void 0 && {
            signal: value
          }
        });
        return {
          made: value6,
          tookMs: Math.max(0, Date.now() - value5 - (value6.copyMs ?? 0))
        };
      }, value2 = tiers[0], { made: value3, tookMs: value4 } = await callback(value2), warnings = value3.warnings;
      for (; value3.blob.size > options && Date.now() + value4 < context && value?.aborted !== !0; ) {
        let value5 = value2, value6 = tiers.filter((input) => input.scale < value5.scale);
        if (value6.length === 0)
          break;
        value2 = value6.find((input) => value3.blob.size * (input.scale / value5.scale) ** (value3.sizeExponent ?? 2) <= options) ?? value6[value6.length - 1];
        let value7;
        try {
          ({ made: value7, tookMs: value4 } = await callback(value2));
        } catch {
          break;
        }
        for (let value8 of value7.warnings)
          warnings.includes(value8) || warnings.push(value8);
        value3 = value7, value3.blob.size <= options && warnings.unshift(reducedNote(value2));
      }
      return {
        ...value3,
        warnings
      };
    }, pdfQualityRenderOptions = (input, options) => {
      let value = input.tiers.length - 1;
      return {
        ...input,
        tiers: input.tiers.slice(options === "best" ? 0 : options === "better" ? Math.min(1, value) : value)
      };
    }, renderAndDownload = async ({ tiers, renderAt, reducedNote = () => SHELL_EXPORT_IMAGE_REDUCTION_NOTE }, options, context) => {
      let value2 = await renderAt(tiers[0]), { filename: value3, warnings: value4 } = value2, value5 = await (0, runtime2.saveThroughShell)(value2.blob, value3);
      for (let count = 1; value5.code === "too_large" && count < tiers.length; count++) {
        let value6;
        try {
          value6 = await renderAt(tiers[count]);
        } catch {
          break;
        }
        for (let value7 of value6.warnings)
          value4.includes(value7) || value4.push(value7);
        value5 = await (0, runtime2.saveThroughShell)(value6.blob, value3), value5.outcome === "saved" && value4.unshift(reducedNote(tiers[count]));
      }
      deliverExportFile(value5, value2.blob, value3, options, context), showExportNotes(value4);
    }, downloadPdf = async () => {
      if (exporting || exportDialogPendingRef.current || presentableSlides.length === 0)
        return;
      if (downloadsWithheld2) {
        (0, runtime2.showToast)(runtime2.DOWNLOADS_UNAVAILABLE_MESSAGE);
        return;
      }
      let value;
      if (extraExportFormats) {
        if (value = await askPdfOptions() ?? void 0, value === void 0)
          return;
      } else if (!await confirmCompleteDeckExport("Download"))
        return;
      setExporting(!0);
      try {
        let value2 = await exportStateRef.current.preparePdfRender(value?.notes === !0);
        await renderAndDownload(value === void 0 ? value2 : pdfQualityRenderOptions(value2, value.quality), runtime2.PDF_MIME_TYPE, "PDF");
      } catch (value2) {
        (0, runtime2.showToast)(exportFailedMessage("pdf", value2 instanceof Error ? value2.message : String(value2)));
      } finally {
        setExporting(!1);
      }
    }, getSlideToExport = () => presentationStartIndex !== null ? presentableSlides[presentationCurrentIndex ?? presentationStartIndex] : currentSlide, renderPngFile = async () => {
      let value = getSlideToExport();
      if (value === void 0)
        throw Error((0, runtime2.formatMessage)({
          defaultMessage: "没有可导出的幻灯片",
          id: "lQ6ivkYpK6"
        }));
      let values = /* @__PURE__ */ new Set();
      (0, runtime2.collectSlideAssetIds)(value, values);
      let [{ CAPTURE_TIERS: value3, captureSlideAsPng: value4 }, value2] = await Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializePdfCapture)(), runtime2.pdfCaptureExports)),
        inlineLocalDeckResources([value], new Map([...snapshot.assets].filter(([input]) => values.has(input))))
      ]), value5 = (0, runtime2.slideExportFilename)(snapshot.meta.title, slides.indexOf(value) + 1, "png"), callback = async (input) => {
        let value6 = await value4(value2.slides[0], value2.assets, input.scale, {
          packWebFonts: extraExportFormats,
          fontsReadyMs: runtime2.fontReadyTimeoutMs,
          ...extraExportFormats && {
            nameMissingFonts: !0
          }
        });
        return {
          blob: new Blob([value6.png], {
            type: runtime2.PNG_MIME_TYPE
          }),
          filename: value5,
          warnings: [...value2.warnings, ...value6.warnings]
        };
      }, callback2 = (input) => String(Math.round(runtime2.SLIDE_WIDTH * input)) + "×" + String(Math.round(runtime2.SLIDE_HEIGHT * input));
      return {
        tiers: value3,
        renderAt: callback,
        reducedNote: (input) => "the image was saved at " + callback2(input.scale) + " instead of " + callback2(value3[0].scale) + " to fit the 16 MB export limit"
      };
    }, downloadPng = async () => {
      if (!(exporting || getSlideToExport() === void 0)) {
        if (downloadsWithheld2) {
          (0, runtime2.showToast)(runtime2.DOWNLOADS_UNAVAILABLE_MESSAGE);
          return;
        }
        setExporting(!0);
        try {
          await renderAndDownload(await renderPngFile(), runtime2.PNG_MIME_TYPE, "PNG");
        } catch (value) {
          (0, runtime2.showToast)(exportFailedMessage("png", value instanceof Error ? value.message : String(value)));
        } finally {
          setExporting(!1);
        }
      }
    }, renderHtmlFile = async ({ fit, deadline }) => {
      let [{ htmlFilename: value2, renderDeckHtml: value3 }, value] = await Promise.all([
        (runtime2.loadExportModules?.() ?? Promise.resolve()).then(() => ((0, runtime2.initializeDeckHtml)(), runtime2.deckHtmlExports)),
        inlineLocalDeckResources(presentableSlides, snapshot.assets)
      ]), value4 = await value3(snapshot.meta.title, value.slides, value.assets, {
        importerReady: extraExportFormats,
        inlineWebFonts: extraExportFormats,
        maxBytes: runtime2.MAX_SHELL_DOWNLOAD_BYTES,
        shrinkImages: extraExportFormats && fit,
        deadline,
        fontsReadyMs: runtime2.fontReadyTimeoutMs,
        ...extraExportFormats && {
          nameMissingFonts: !0
        }
      });
      return {
        blob: new Blob([value4.html], {
          type: runtime2.HTML_MIME_TYPE
        }),
        filename: value2(snapshot.meta.title),
        warnings: [
          ...value4.reducedNote === void 0 ? [] : [value4.reducedNote],
          ...value.warnings,
          ...value4.warnings
        ]
      };
    }, downloadHtml = async () => {
      if (!(exporting || exportDialogPendingRef.current || presentableSlides.length === 0)) {
        if (downloadsWithheld2) {
          (0, runtime2.showToast)(runtime2.DOWNLOADS_UNAVAILABLE_MESSAGE);
          return;
        }
        if (await confirmCompleteDeckExport("Download")) {
          setExporting(!0);
          try {
            let value = await exportStateRef.current.renderHtmlFile({
              fit: !1
            }), { blob: value2, filename: value3 } = value, { warnings: value4 } = value, value5 = await (0, runtime2.saveThroughShell)(value2, value3);
            if (value5.code === "too_large" && extraExportFormats) {
              let value6 = await exportStateRef.current.renderHtmlFile({
                fit: !0
              }).catch(() => {
              });
              value6 !== void 0 && value6.blob.size < value2.size && (value5 = await (0, runtime2.saveThroughShell)(value6.blob, value3), value5.outcome === "saved" && (value4 = value6.warnings));
            }
            deliverExportFile(value5, value2, value3, runtime2.HTML_MIME_TYPE, "HTML"), showExportNotes(value4);
          } catch (value) {
            (0, runtime2.showToast)(exportFailedMessage("html", value instanceof Error ? value.message : String(value)));
          } finally {
            setExporting(!1);
          }
        }
      }
    }, exportWarningsRef = runtime2.reactd0.useRef({}), askInteractivePdfOptions = async (input, options, context) => {
      if (await waitForGoogleSlidesReady(), input.signal.aborted)
        throw new runtime2.ExportCancelledError();
      input.signal.addEventListener("abort", options);
      try {
        return await context();
      } finally {
        input.signal.removeEventListener("abort", options);
      }
    }, createExportProducer = (input, options, context) => async (input2) => {
      let value;
      if (input === "pdf" && extraExportFormats && input2.interactive) {
        if (value = await askInteractivePdfOptions(input2, runtime2.dismissPdfExportOptions, askPdfOptions) ?? void 0, value === void 0)
          throw new runtime2.ExportCancelledError();
      } else if (exportFormatSupportsNotes(input) && resolvedAwaitingSlides)
        if (input2.interactive) {
          if (!await askInteractivePdfOptions(input2, runtime2.dismissEditorDialog, () => confirmCompleteDeckExport("Download")))
            throw new runtime2.ExportCancelledError();
        } else
          (0, runtime2.showToast)(formatPresentationBuildProgress(slides.length, slides.length + resolvedAwaitedSlideCount) + "; exporting only " + (presentableSlides.length === 1 ? "that one" : "those " + String(presentableSlides.length)) + ".");
      let value2 = input2.interactive ? (0, runtime2.showToast)(EXPORTING_MESSAGE, 0) : void 0, value3 = extraExportFormats ? input2.signal : void 0, value4;
      try {
        value4 = await context(value, value3);
      } catch (value5) {
        throw value3?.aborted === !0 ? new runtime2.ExportCancelledError() : ((0, runtime2.showToast)(exportFailedMessage(input, value5 instanceof Error ? value5.message : String(value5))), value5);
      } finally {
        value2 !== void 0 && (0, runtime2.closeToast)(value2);
      }
      if (value3?.aborted === !0)
        throw new runtime2.ExportCancelledError();
      return exportWarningsRef.current[input] = value4.warnings, {
        filename: value4.filename,
        data: value4.blob
      };
    }, prepareExportWithNotesOption = (input) => async (input2, options) => {
      let value = Date.now() + GOOGLE_SLIDES_BUILD_TIMEOUT_MS, value2 = await input(input2);
      return input2 === void 0 ? renderWithImageBudget(value2, runtime2.MAX_SHELL_DOWNLOAD_BYTES, value, options) : renderWithImageBudget({
        ...pdfQualityRenderOptions(value2, input2.quality),
        reducedNote: () => BROWSER_EXPORT_IMAGE_REDUCTION_NOTE
      }, MAX_BROWSER_EXPORT_BYTES, value, options);
    }, exportStateRef = runtime2.reactd0.useRef({
      presentable: presentableSlides,
      exporting,
      renderPptxFile,
      preparePdfRender,
      preparePptxPicturesRender,
      renderHtmlFile,
      exportPptx
    });
    exportStateRef.current = {
      presentable: presentableSlides,
      exporting,
      renderPptxFile,
      preparePdfRender,
      preparePptxPicturesRender,
      renderHtmlFile,
      exportPptx
    };
    let exportEntries = (extraExportFormats ? [
      {
        format: "pdf",
        interactive: !0,
        produce: createExportProducer("pdf", "PDF", prepareExportWithNotesOption((input) => exportStateRef.current.preparePdfRender(input?.notes === !0)))
      },
      {
        format: "pptx",
        variant: "current",
        produce: createExportProducer("pptx", "PPTX", () => exportStateRef.current.renderPptxFile("current", {
          maxBytes: runtime2.MAX_SHELL_DOWNLOAD_BYTES
        }))
      },
      {
        format: "pptx",
        variant: "basic",
        produce: createExportProducer("pptx", "PPTX", () => exportStateRef.current.renderPptxFile("basic"))
      },
      {
        format: "pptx",
        variant: "pictures",
        produce: createExportProducer("pptx", "PPTX", prepareExportWithNotesOption(() => exportStateRef.current.preparePptxPicturesRender()))
      },
      {
        format: "png",
        available: getSlideToExport() !== void 0,
        produce: createExportProducer("png", "PNG", prepareExportWithNotesOption(renderPngFile))
      },
      {
        format: "html",
        produce: createExportProducer("html", "网页", () => exportStateRef.current.renderHtmlFile({
          fit: !0,
          deadline: Date.now() + GOOGLE_SLIDES_BUILD_TIMEOUT_MS
        }))
      }
    ] : [
      {
        format: "html",
        produce: createExportProducer("html", "网页", () => exportStateRef.current.renderHtmlFile({
          fit: !0,
          deadline: Date.now() + GOOGLE_SLIDES_BUILD_TIMEOUT_MS
        }))
      },
      {
        format: "pdf",
        produce: createExportProducer("pdf", "PDF", prepareExportWithNotesOption((input) => exportStateRef.current.preparePdfRender(input?.notes === !0)))
      },
      {
        format: "pptx",
        produce: createExportProducer("pptx", "PPTX", () => exportStateRef.current.renderPptxFile("current", {
          maxBytes: runtime2.MAX_SHELL_DOWNLOAD_BYTES
        }))
      }
    ]).map(({ available = presentableSlides.length > 0, ...props }) => ({
      ...props,
      disabled: !available || exporting,
      ...exportFormatSupportsNotes(props.format) && resolvedAwaitingSlides ? {
        interactive: !0
      } : {},
      releaseRequestAfterMs: runtime2.MAX_EXPORT_INLINE_CHARS
    }));
    (0, runtime2.useExportEntries)(downloadsWithheld2 === !0 ? null : exportEntries, {
      onResult: (input) => {
        let value = EXPORT_FORMAT_MIME_AND_EXTENSION[input.format];
        if (input.late) {
          if (!value)
            return;
          let { saved: late, file: late2 } = input.late;
          deliverExportFile(late, late2.data instanceof Blob ? late2.data : new Blob([new Uint8Array(late2.data)]), late2.filename, ...value);
        }
        input.outcome === "delivered" && showExportNotes(exportWarningsRef.current[input.format] ?? []);
      }
    });
    let speakerNotesAvailable = (0, runtime2.slidesHaveSpeakerNotes)(presentableSlides), presentationButtonLabel = (0, runtime2.fullscreenAvailable)() ? "Present full screen" : "Present", startPresentation = (input) => {
      if (presentationStartIndex !== null)
        return;
      let index4 = 0;
      for (let index22 = 0; index22 < slides.length && index22 < currentSlideIndex; index22++) {
        let value2 = slides[index22];
        value2 && value2.skipped !== !0 && index4++;
      }
      let flag = !1, flag2 = !1;
      if (input && speakerNotesSession === null) {
        let value2 = touchLayout ? null : (0, runtime2.openSpeakerNotes)();
        flag2 = value2?.kind === "opened", flag = !flag2, value2 !== null && !flag2 && (0, runtime2.showToast)(SPEAKER_NOTES_POPOUT_FALLBACK_MESSAGE);
      }
      let value = flag2 || navigator.userActivation?.isActive === !1;
      setDockSpeakerNotes(flag), setFullscreenRequest(value ? "next" : (0, runtime2.requestPresentationFullscreen)()), presentingRef.current = !0, setPresentationStartIndex(Math.max(0, Math.min(index4, presentableSlides.length - 1)));
    }, presentationDisabledReason = presentableSlides.length === 0 ? "Every slide is skipped — unskip one to present" : null, toolbarMenus = SlidesAppJsx.jsx("span", {
      "data-slides-present-entry": "",
      className: "contents",
      children: touchLayout ? SlidesAppJsx.jsx(runtime2.ToolbarButton, {
        iconOnly: !0,
        icon: "Play",
        label: "放映",
        tip: presentationDisabledReason ?? presentationButtonLabel + "，从当前页开始" + (speakerNotesAvailable ? "，下方显示演讲者备注" : ""),
        disabled: presentableSlides.length === 0,
        onClick: () => startPresentation(speakerNotesAvailable)
      }) : SlidesAppJsx.jsxs(runtime2.ToolbarPopover, {
        iconOnly: !0,
        icon: "Play",
        label: "放映",
        tip: presentationDisabledReason ?? PRESENT_FROM_CURRENT_LABEL,
        disabled: presentableSlides.length === 0 || presentationStartIndex !== null,
        children: [
          SlidesAppJsx.jsx(runtime2.Menu.Item, {
            icon: "Play",
            onClick: () => startPresentation(!1),
            children: "放映"
          }),
          SlidesAppJsx.jsx(runtime2.Menu.Item, {
            icon: "BookText",
            disabled: !speakerNotesAvailable && speakerNotesSession === null,
            disabledReason: speakerNotesAvailable || speakerNotesSession !== null ? null : "No speaker notes in this presentation yet—add them under a slide (Speaker notes, by the thumbnails)",
            onClick: () => startPresentation(!0),
            children: "带演讲者备注放映"
          })
        ]
      })
    }), refuseHeldSlideCopy = (input) => {
      let held = input.find((input2) => slideHtmlHold2(input2) !== void 0);
      if (held === void 0)
        return !1;
      let index4 = slides.findIndex((input2) => input2.id === held), values = { known: index4 < 0 ? "no" : "yes", n: String(index4 + 1) };
      return (0, runtime2.showToast)(input.length > 1 ? (0, runtime2.formatMessage)({
        defaultMessage: "{known, select, yes {第 {n} 页的已保存内容需要修复，本次未复制任何幻灯片。} other {该页的已保存内容需要修复，本次未复制任何幻灯片。}}",
        id: "9vNpT/nbFN"
      }, values) : (0, runtime2.formatMessage)({
        defaultMessage: "{known, select, yes {第 {n} 页的已保存内容需要修复，暂时无法复制该页及其内容。} other {该页的已保存内容需要修复，暂时无法复制该页及其内容。}}",
        id: "VafBRujuE1"
      }, values)), !0;
    }, slideActions = {
      onAdd: openTemplatePicker,
      onDuplicate: (input) => duplicateSlide(input),
      onCopy: (input) => {
        let value = slides.find((input2) => input2.id === input);
        value && (refuseHeldSlideCopy([input]) || (0, runtime2.showToast)((0, runtime2.copyArtifactToClipboard)(runtime2.SLIDE_CLIPBOARD_TYPE, {
          data: (0, runtime2.createSlideClipboardPayload)(value, snapshot.assets),
          text: (0, runtime2.slideClipboardText)(value)
        }) ? slidesCopiedMessage(1) : (0, runtime2.formatMessage)({
          defaultMessage: "复制幻灯片失败",
          id: "XeWThgEsKZ"
        })));
      },
      onDelete: (input) => void deleteSlide(input),
      onMove: moveSlide,
      onToggleSkip: toggleSlideSkipped,
      ...host === void 0 ? {
        onSetCover: setCoverSlide,
        coverId: snapshot.cover,
        onCopyLink: copySlideLink
      } : {},
      heldSlide: slideHtmlHold2
    }, copySlidesToClipboard = (input) => {
      let value = slides.filter((input2) => input.includes(input2.id));
      if (refuseHeldSlideCopy(input) || value.length === 0)
        return;
      let copied = (0, runtime2.copyArtifactToClipboard)(runtime2.SLIDE_CLIPBOARD_TYPE, {
        data: (0, runtime2.createSlidesClipboardPayload)(value, snapshot.assets),
        text: (0, runtime2.slidesClipboardText)(value)
      });
      (0, runtime2.showToast)(copied ? slidesCopiedMessage(value.length) : (0, runtime2.formatMessage)({
        defaultMessage: "复制多页幻灯片失败",
        id: "YM1ZsDtiFr"
      }));
    }, railGapToOrderIndex = (input) => {
      let order = documentStore.doc.content().order, before = slideOrderIds.slice(0, Math.max(0, input)).reverse().find((input2) => order.includes(input2));
      return before === void 0 ? 0 : order.indexOf(before) + 1;
    }, selectDuplicatedSlides = (input, source) => {
      input.length < 2 || (rememberDuplicatedSelection(input, source), slideSelection.set(input), (0, runtime2.announceLiveMessage)(String(input.length) + " slides duplicated"));
    }, railSeveral = {
      selection: slideSelection,
      quiet: !railSelectionLive,
      onDeleteSlides: (input) => {
        let before = documentStore.getSnapshot().meta.order.length;
        deleteSlides([...input]);
        let gone = before - documentStore.getSnapshot().meta.order.length;
        gone > 1 && (0, runtime2.announceLiveMessage)(String(gone) + " slides deleted");
      },
      onDuplicateSlides: (input) => selectDuplicatedSlides(duplicateSlides([...input]), input),
      onCopySlides: copySlidesToClipboard,
      onSetSlidesSkipped: (input, skipped) => void setSlidesSkipped([...input], skipped),
      onMoveSlides: (input, index4) => {
        if (readOnly || documentStore.doc.readOnly())
          return;
        let target = (0, runtime2.slideMoveDestination)(documentStore.doc.content(), input, railGapToOrderIndex(index4));
        commitStructuralChange("move slides", (deck) => (0, runtime2.moveSlidesToSection)(deck, [...input], target.sectionId, target.index)) && (0, runtime2.announceLiveMessage)(String(input.length) + " slides moved");
      },
      onDuplicateSlidesAt: (input, index4) => selectDuplicatedSlides(duplicateSlides([...input], (0, runtime2.slideMoveDestination)(documentStore.doc.content(), [], railGapToOrderIndex(index4))), input)
    }, stageCanShowSlide = !gridOpen && currentSlide === void 0, creationFitsEmptyStage = creationOnEmptyDeck && creationView.greySlide, showSlideContent = !creationView.greySlide || creationView.fromEmptyDeck;
    runtime2.reactd0.useLayoutEffect(() => {
      let value = stageCanShowSlide ? creationFitsEmptyStage ? getFittedSlideScale() : 1 : void 0;
      value !== void 0 && setToolbarScale(value);
    }, [
      stageCanShowSlide,
      creationFitsEmptyStage,
      getFittedSlideScale,
      setToolbarScale
    ]);
    let fitViewLabel = gridOpen || editingGridSlide ? "Fit all slides" : "Fit the slide", toolbarTrailing = SlidesAppJsx.jsx("span", {
      "data-slides-zoom": "",
      className: "contents",
      children: SlidesAppJsx.jsx(runtime2.ZoomControl, {
        readout: !0,
        subscribeScale: gridOpen ? subscribeGridScale : subscribeEditorScale,
        getScale: () => (gridOpen ? gridZoomApiRef.current?.getScale() : editorZoomApiRef.current?.getScale() ?? (creationFitsEmptyStage ? getFittedSlideScale() : void 0)) ?? 1,
        getLimits: () => gridOpen ? {
          ...gridZoomApiRef.current?.getLimits(),
          minTip: "Every slide is already in view"
        } : {
          ...editorZoomApiRef.current?.getLimits(),
          minTip: editingGridSlide ? "That's as far out as the Canvas view goes" : "Smaller than the slide fits — that's as far out as it goes"
        },
        onPickScale: (input) => gridOpen ? gridZoomApiRef.current?.setScaleTo(input) : editorZoomApiRef.current?.setScaleTo(input),
        onFit: () => gridOpen ? gridZoomApiRef.current?.fitAll() : editorZoomApiRef.current?.returnToFit(),
        onStepZoom: (input) => (gridOpen ? gridZoomApiRef.current : editorZoomApiRef.current)?.stepZoom(input === 1 ? 1.25 : 0.8),
        undo: readOnly ? void 0 : undoHistory,
        zoomRowsDisabled: stageCanShowSlide,
        zoomRowsDisabledTip: "No slide to zoom",
        fitLabel: fitViewLabel,
        tip: (gridOpen ? "缩放画布视图（" : "缩放（") + ZOOM_KEYBOARD_SHORTCUT_LABEL + ")"
      }, gridOpen ? "grid" : "slide")
    }), insertActionTip = (input, options) => gridOpen && !singleSelectedGridSlide ? gridSelection.slides.length === 0 ? "Select a slide to insert onto it" : "Select one slide to insert onto it" : currentSlideReadOnly ? "This slide can’t be edited until its saved content is fixed, so inserting is paused" : gridOpen ? options : input, insertMenuDisabled = gridOpen && !singleSelectedGridSlide || currentSlideReadOnly;
    runtime2.reactd0.useEffect(() => {
      (insertMenuDisabled || modalOpen) && setInsertMenuOpen(!1);
    }, [insertMenuDisabled, modalOpen]);
    let shapeInsertMenuItem = (input) => SlidesAppJsx.jsx(runtime2.ToolbarMenuItem, {
      glyph: SlidesAppJsx.jsx(runtime2.ShapeIcon, {
        shape: input,
        size: "100%"
      }),
      label: runtime2.shapeVariantLabels[input],
      shortcut: gridOpen ? void 0 : getShapeInsertShortcut(input),
      title: gridOpen ? "点击以插入到所选幻灯片" : "点击插入，或拖到幻灯片上",
      draggable: !gridOpen,
      onDragStart: (input2) => input2.dataTransfer.setData("application/x-slides-insert", "shape:" + input),
      onClick: (input2) => {
        setInsertMenuOpen(!1), insertShape(input, {
          byKey: (0, runtime2.isKeyboardOrPrimaryActivation)(input2)
        });
      }
    }, input), toolbarExtras = SlidesAppJsx.jsx(SlidesAppJsx.Fragment, {
      children: SlidesAppJsx.jsx(runtime2.ToolbarWhenVisible, {
        children: modalOpen ? SlidesAppJsx.jsxs(runtime2.ToolbarPopover, {
          iconOnly: !0,
          caret: !0,
          icon: "Add",
          label: "插入",
          tip: insertActionTip("Insert text, an image, a table, a shape or a line", "Insert onto the selected slide"),
          disabled: insertMenuDisabled,
          children: [
            SlidesAppJsx.jsx(runtime2.Menu.Item, {
              icon: runtime2.textFindResultIcon,
              onClick: () => insertText(),
              children: "文本"
            }),
            SlidesAppJsx.jsx(runtime2.Menu.Item, {
              icon: "Image",
              onClick: (input) => clickUploadInput((0, runtime2.isKeyboardOrPrimaryActivation)(input)),
              children: "图片…"
            }),
            null,
            null,
            SlidesAppJsx.jsx(runtime2.Menu.Item, {
              icon: "Table",
              onClick: (input) => insertTable({
                byKey: (0, runtime2.isKeyboardOrPrimaryActivation)(input)
              }),
              children: "表格"
            }),
            SlidesAppJsx.jsx(runtime2.Menu.Separator, {}),
            QUICK_INSERT_SHAPES.map((input) => SlidesAppJsx.jsx(runtime2.Menu.Item, {
              icon: SlidesAppJsx.jsx(runtime2.ShapeIcon, {
                shape: input,
                size: 20
              }),
              onClick: (input2) => insertShape(input, {
                byKey: (0, runtime2.isKeyboardOrPrimaryActivation)(input2)
              }),
              children: runtime2.shapeVariantLabels[input]
            }, input)),
            SlidesAppJsx.jsx(runtime2.Menu.Separator, {}),
            QUICK_INSERT_LINE_SHAPES.map((input) => SlidesAppJsx.jsx(runtime2.Menu.Item, {
              icon: SlidesAppJsx.jsx(runtime2.ShapeIcon, {
                shape: input,
                size: 20
              }),
              onClick: (input2) => insertShape(input, {
                byKey: (0, runtime2.isKeyboardOrPrimaryActivation)(input2)
              }),
              children: runtime2.shapeVariantLabels[input]
            }, input))
          ]
        }) : SlidesAppJsx.jsxs(SlidesAppJsx.Fragment, {
          children: [
            SlidesAppJsx.jsx(runtime2.ToolbarButton, {
              iconOnly: !0,
              glyph: runtime2.textFindResultIcon,
              label: "文本",
              shortcut: gridOpen ? void 0 : TEXT_INSERT_SHORTCUT_KEY,
              ref: textButtonRef,
              pressed: gridOpen || commentPinning ? void 0 : textToolOn,
              tip: insertActionTip(commentPinning ? (0, runtime2.formatMessage)({
                defaultMessage: "添加文本框",
                id: "7bYD9zWd+M"
              }) : textToolOn ? (0, runtime2.formatMessage)({
                defaultMessage: "点击幻灯片上的位置后输入文字，按 Esc 取消",
                id: "EKjM8J/3Gd"
              }) : (0, runtime2.formatMessage)({
                defaultMessage: "添加文本框：点击此按钮，再点击幻灯片上的位置，或直接拖到幻灯片上",
                id: "dExEdQ0mjg"
              }), (0, runtime2.formatMessage)({
                defaultMessage: "在所选幻灯片上添加文本框",
                id: "m9DApAAUwW"
              })),
              descriptionSuffix: gridOpen || commentPinning ? void 0 : ((0, runtime2.isApplePlatform)() ? "Return" : "Enter") + (textToolOn ? " with the slide focused adds a text box in the middle" : " or Space adds one in the middle of the slide"),
              disabled: insertMenuDisabled,
              draggable: !insertMenuDisabled && !gridOpen,
              onDragStart: (input) => input.dataTransfer.setData("application/x-slides-insert", "text"),
              onClick: (input) => textToolOn ? stopTextTool() : gridOpen || commentPinning || (0, runtime2.isKeyboardOrPrimaryActivation)(input) ? insertText() : startTextTool()
            }),
            SlidesAppJsx.jsx(runtime2.ToolbarButton, {
              iconOnly: !0,
              icon: "Image",
              label: "图片",
              tip: insertActionTip("Insert an image…", "Insert an image on the selected slide…"),
              disabled: insertMenuDisabled,
              onClick: (input) => clickUploadInput((0, runtime2.isKeyboardOrPrimaryActivation)(input))
            }),
            null,
            SlidesAppJsx.jsx(runtime2.ToolbarButton, {
              iconOnly: !0,
              icon: "Table",
              label: "表格",
              tip: insertActionTip("Insert a table — click, or drag onto the slide", "Insert a table on the selected slide"),
              disabled: insertMenuDisabled,
              draggable: !insertMenuDisabled && !gridOpen,
              onDragStart: (input) => input.dataTransfer.setData("application/x-slides-insert", "table"),
              onClick: (input) => insertTable({
                byKey: (0, runtime2.isKeyboardOrPrimaryActivation)(input)
              })
            }),
            SlidesAppJsx.jsx("span", {
              className: "relative",
              children: SlidesAppJsx.jsxs(runtime2.PropertyPopup, {
                open: insertMenuOpen,
                onOpen: () => setInsertMenuOpen(!0),
                onClose: () => setInsertMenuOpen(!1),
                trigger: SlidesAppJsx.jsx(runtime2.ToolbarButton, {
                  iconOnly: !0,
                  caret: !0,
                  icon: "Shapes",
                  label: "形状",
                  tip: insertActionTip("Insert a shape, line, or connector — click a row, or drag it onto the slide", "Insert a shape, line, or connector on the selected slide"),
                  disabled: insertMenuDisabled,
                  onClick: (input) => setFocusInsertMenuOnOpen((0, runtime2.isKeyboardOrPrimaryActivation)(input))
                }),
                align: "left",
                "aria-label": "形状",
                className: "min-w-32! p-1",
                focusOnOpen: focusInsertMenuOnOpen,
                children: [
                  QUICK_INSERT_SHAPES.map(shapeInsertMenuItem),
                  SlidesAppJsx.jsx("div", {
                    "aria-hidden": "true",
                    className: "mx-2 my-1 h-px bg-border-line"
                  }),
                  QUICK_INSERT_LINE_SHAPES.map(shapeInsertMenuItem)
                ]
              })
            })
          ]
        })
      })
    }), pdfExportDisabled = extraExportFormats && presentableSlides.length === 0, toolbarExtrasEnd = SlidesAppJsx.jsxs(SlidesAppJsx.Fragment, {
      children: [
        SlidesAppJsx.jsxs(runtime2.ToolbarPopover, {
          iconOnly: !0,
          icon: "Download",
          label: exporting ? EXPORTING_MESSAGE : "下载",
          tip: downloadsWithheld2 ? runtime2.DOWNLOADS_UNAVAILABLE_MESSAGE : exporting ? EXPORTING_MESSAGE : extraExportFormats ? getSlideToExport() === void 0 ? "暂无可导出的内容" : "将文稿下载为 PDF、网页或 PowerPoint（不含跳过的页面），或将当前页保存为图片" : presentableSlides.length === 0 ? "所有页面均被跳过，请先取消跳过至少一页再导出" : "将文稿下载为 PDF、网页或 PowerPoint（不含跳过的页面）",
          disabled: downloadsWithheld2 || (extraExportFormats ? getSlideToExport() === void 0 : presentableSlides.length === 0) || exporting,
          children: [
            SlidesAppJsx.jsx(runtime2.Menu.Item, {
              disabled: pdfExportDisabled,
              disabledReason: ALL_SLIDES_SKIPPED_EXPORT_MESSAGE,
              onClick: () => void downloadPdf(),
              children: "PDF（.pdf）"
            }),
            SlidesAppJsx.jsx(runtime2.Menu.Item, {
              disabled: pdfExportDisabled,
              disabledReason: ALL_SLIDES_SKIPPED_EXPORT_MESSAGE,
              onClick: () => void downloadHtml(),
              children: "网页（.html）"
            }),
            extraExportFormats ? SlidesAppJsx.jsx(runtime2.Menu.Item, {
              onClick: () => void downloadPng(),
              children: "当前页图片（.png）"
            }) : null,
            SlidesAppJsx.jsx(runtime2.Menu.Separator, {}),
            SlidesAppJsx.jsxs(runtime2.Menu.Group, {
              children: [
                SlidesAppJsx.jsx(runtime2.Menu.Item, {
                  disabled: pdfExportDisabled,
                  disabledReason: ALL_SLIDES_SKIPPED_EXPORT_MESSAGE,
                  onClick: () => void exportPptx("current"),
                  children: "PowerPoint，保留当前字体（.pptx）"
                }),
                SlidesAppJsx.jsx(runtime2.Menu.Item, {
                  disabled: pdfExportDisabled,
                  disabledReason: ALL_SLIDES_SKIPPED_EXPORT_MESSAGE,
                  onClick: () => void exportPptx("basic"),
                  children: "PowerPoint，使用通用字体（.pptx）"
                }),
                SlidesAppJsx.jsx(runtime2.Menu.GroupLabel, {
                  children: "通用字体适用于各种电脑"
                })
              ]
            })
          ]
        }),
        toolbarMenus,
        SlidesAppJsx.jsx(runtime2.ToolbarWhenVisible, {
          children: SlidesAppJsx.jsx(runtime2.ArtifactToolbarDivider, {})
        }),
        SlidesAppJsx.jsx(runtime2.ToolbarWhenVisible, {
          children: SlidesAppJsx.jsx(runtime2.ToolbarButton, {
            iconOnly: !0,
            glyph: SlidesAppJsx.jsx(runtime2.Icon, {
              name: "SidebarRight",
              size: "auto",
              className: "max-md:rotate-90"
            }),
            label: "属性",
            tip: gridOpen ? "打开一页幻灯片以编辑属性" : inspectorOpen ? "隐藏属性面板" : "显示属性面板",
            disabled: gridOpen,
            pressed: inspectorOpen && !gridOpen,
            ref: inspectorReturnFocusRef,
            onClick: (input) => {
              inspectorPointerInvocationRef.current = (0, runtime2.isKeyboardOrPrimaryActivation)(input), setInspectorOpen((input2) => !input2);
            }
          })
        })
      ]
    });
    return SlidesAppJsx.jsx(runtime2.slideSnapshotsEnabledContext.Provider, {
      value: !0,
      children: SlidesAppJsx.jsxs(runtime2.ArtifactShell, {
        doc: documentStore.doc,
        undo: undoHistory,
        undoShortcuts: presentationStartIndex === null && !readOnly,
        toolbarExtras,
        toolbarExtrasEnd,
        toolbarTrailing,
        toolbarUndoButtons: !1,
        toolbarTouchTargets: "square",
        toolbarVariant: host ? "docked" : "floating",
        alwaysShowExtras: !0,
        skeleton: SlidesAppJsx.jsx(SlidesAppLoadingSkeleton, {
          doc: documentStore.doc,
          railOpen
        }),
        skeletonFlush: !0,
        leading: host?.leading,
        aboveContent: host?.aboveContent,
        children: [
          SlidesAppJsx.jsx("style", {
            children: runtime2.SLIDES_PRINT_STYLES
          }),
          SlidesAppJsx.jsx(runtime2.HotRestoreRevealGate, {
            box: currentSlide === void 0 ? null : () => (editorElementRef.current?.querySelector("[data-slide-surface]") ?? editorElementRef.current ?? gridViewElementRef.current?.querySelector("[data-grid-surface]"))?.getBoundingClientRect()
          }),
          fontCss !== "" ? SlidesAppJsx.jsx("style", {
            children: fontCss
          }) : null,
          SlidesAppJsx.jsx("span", {
            ref: railLayout.groundProbe,
            "aria-hidden": !0,
            className: "hidden bg-editor-canvas"
          }),
          SlidesAppJsx.jsx("input", {
            ref: imageUploadInputRef,
            type: "file",
            accept: "image/*",
            className: "hidden",
            onChange: (event) => {
              let value = event.target.files?.[0];
              value && insertImageFromInput(value, {
                byKey: uploadInvocationRef.current
              }), event.target.value = "";
            }
          }),
          null,
          SlidesAppJsx.jsxs("div", {
            className: "flex h-full min-h-0 flex-col",
            children: [
              SlidesAppJsx.jsxs("div", {
                className: "relative min-h-0 flex-1",
                onPointerMove: (input) => {
                  lastGridPointerRef.current = (gridOpen || editingGridSlide) && input.pointerType !== "touch" ? {
                    clientX: input.clientX,
                    clientY: input.clientY,
                    at: Date.now()
                  } : null, publishGridPointer(input);
                },
                onWheel: (input) => {
                  (gridOpen || editingGridSlide) && (lastGridPointerRef.current = {
                    clientX: input.clientX,
                    clientY: input.clientY,
                    at: Date.now()
                  });
                },
                onPointerLeave: (input) => {
                  lastGridPointerRef.current = null, (gridOpen || editingGridSlide) && input.pointerType !== "touch" && cursorPublisherRef.current?.clear();
                },
                onPointerDownCapture: (event) => {
                  creationView.sheet !== "none" && currentSlide !== void 0 && isCanvasEditorFocusTarget(event.target) && creationController.stageTouched();
                },
                onKeyDownCapture: (event) => {
                  creationView.sheet !== "none" && currentSlide !== void 0 && isCanvasEditorFocusTarget(event.target) && creationController.stageTouched();
                },
                onFocusCapture: (event) => {
                  creationView.sheet !== "none" && currentSlide !== void 0 && isCanvasEditorFocusTarget(event.target) && creationController.stageTouched();
                },
                children: [
                  SlidesAppJsx.jsx(runtime2.FindBar, {
                    ...findController.bar
                  }),
                  showCommentTargets ? SlidesAppJsx.jsx("div", {
                    className: (0, runtime2.joinClassNames)("absolute inset-0", gridLeaving ? "z-20" : gridOpen ? "z-10" : "z-0"),
                    "data-slides-grid-leaving": gridLeaving ? "" : void 0,
                    children: SlidesAppJsx.jsxs("div", {
                      className: (0, runtime2.joinClassNames)("flex h-full flex-col", gridLeaving && "pointer-events-none"),
                      children: [
                        SlidesAppJsx.jsx("div", {
                          ref: registerGridElementAndRail,
                          className: "min-h-0 flex-1",
                          "aria-busy": presentationBusy && gridOpen ? !0 : void 0,
                          children: SlidesAppJsx.jsx(runtime2.SlideGrid, {
                            topInset: gridTopInset,
                            order: snapshot.meta.order,
                            sections: snapshot.sections,
                            slides: railSlides,
                            assets: snapshot.assets,
                            currentId: currentSlide?.id ?? null,
                            readOnly,
                            zoomApiRef: gridZoomApiRef,
                            onScaleChange: onGridScaleChange,
                            enterFrom: gridEnterFromRectRef.current,
                            startCamera: cameraPreferenceRef.current?.canvas === !0 ? cameraPreferenceRef.current.view : null,
                            unasked: cameraPreferenceRef.current?.canvas === !0,
                            onCamera: saveCanvasCamera,
                            inert: editingGridSlide || gridLeaving && wasEditingWhenGridLeftRef.current,
                            behind: editingGridSlide && currentSlide ? currentSlide.id : null,
                            onSelectionChange: gridOpen && !gridLeaving ? setGridSelection : void 0,
                            notesShown: notesOpen,
                            commentCounts: openCommentCounts,
                            commenting: commentMode && gridOpen,
                            commentLayer: !gridOpen || !commentMode ? void 0 : (input) => SlidesAppJsx.jsx(runtime2.SlideGridCommentLayer, {
                              ...commentController,
                              slides,
                              typeStyles: allTypeStyles,
                              containerRef: input,
                              currentId: currentSlide?.id ?? null,
                              keepsMode: commentModePersistent,
                              topInset: gridTopInset,
                              showSlide: showCommentSlide,
                              settling: commentViewSettling,
                              reveal: commentViewReveal,
                              onRevealed: () => setCommentViewReveal(null)
                            }),
                            peerLayer: touchLayout ? void 0 : (input, options) => SlidesAppJsx.jsx(runtime2.GridPeerCursorLayers, {
                              tiles: options,
                              surfaceOf: scopedSlideKey,
                              glyphScale: input
                            }),
                            onCameraChange: republishGridPointerOnCameraChange,
                            onSelect: (input) => {
                              setCurrentSlideId(input), setSelection([]), setTextEditState(null);
                            },
                            onOpen: handleGridOpenSlide,
                            onClose: closeGridFromButton,
                            onMoveSlidesTo: (items, options, context) => {
                              commitStructuralChange(items.length > 1 ? "move slides" : "move slide", (input) => (0, runtime2.moveSlidesToSection)(input, items, options, context));
                            },
                            ...slideActions,
                            onStartSectionWithSlides: (input, options) => {
                              commitStructuralChange("new section", (input2) => (0, runtime2.moveSlidesIntoNewSection)(input2, input, options));
                            },
                            onMoveSections: (items, options) => {
                              commitStructuralChange(items.length > 1 ? "move sections" : "move section", (input) => (0, runtime2.moveSectionsToGap)(input, items, options));
                            },
                            onDeleteSlides: (input) => void deleteSlides(input),
                            onDuplicateSlides: duplicateSlides,
                            onCopySlides: copySlidesToClipboard,
                            onSetSlidesSkipped: setSlidesSkipped,
                            onSectionFromSlides: (input) => void commitStructuralChange("new section", (input2) => (0, runtime2.createSectionFromSlides)(input2, input)),
                            onSetSectionDescription: (input, options) => void commitStructuralChange("describe section", (input2) => input === null ? input2.order[0] !== void 0 ? (0, runtime2.addSectionAtSlide)(input2, input2.order[0], options) : void 0 : (0, runtime2.renameSection)(input2, input, options)),
                            onRemoveSection: (input) => void commitStructuralChange("remove section", (input2) => (0, runtime2.deleteSection)(input2, input)),
                            onAddSection: (input) => void commitStructuralChange("new section", (input2) => (0, runtime2.appendEmptySection)(input2, input))
                          }, gridMountGeneration)
                        }),
                        gridLeaving ? SlidesAppJsx.jsx("aside", {
                          inert: !0,
                          "aria-hidden": !0,
                          className: "shrink-0 border-t border-border-line bg-panel pb-[var(--sl-safe-b,0px)]",
                          children: SlidesAppJsx.jsx(runtime2.SlideRailToolbar, {
                            readOnly,
                            onAdd: slideActions.onAdd,
                            notesOpen,
                            onToggleNotes: () => {
                            },
                            ...wasEditingWhenGridLeftRef.current ? {} : {
                              notesDisabledReason: (0, runtime2.slidesHaveSpeakerNotes)(slides) ? void 0 : readOnly ? "No speaker notes in this presentation" : "No speaker notes yet — open a slide to add some"
                            },
                            gridOpen: !1,
                            onSetGridOpen: () => {
                            },
                            onCollapse: () => {
                            },
                            collapseDisabledReason: CANVAS_VIEW_NO_THUMBNAILS_MESSAGE
                          })
                        }) : null
                      ]
                    })
                  }) : null,
                  gridOpen ? presentationStartIndex !== null ? SlidesAppJsx.jsx("div", {
                    className: "h-full bg-editor-canvas"
                  }) : null : SlidesAppJsx.jsx("div", {
                    className: "relative z-10 h-full min-h-0",
                    children: !currentSlide && (documentStore.bootReport.htmlErrors ?? 0) > 0 ? SlidesAppJsx.jsxs("div", {
                      className: "flex h-full flex-col items-center justify-center gap-3 bg-editor-canvas p-6 text-center",
                      children: [
                        SlidesAppJsx.jsx("p", {
                          className: "text-sm text-fg-secondary",
                          children: "无法读取此演示文稿的 HTML。"
                        }),
                        SlidesAppJsx.jsxs("p", {
                          className: "max-w-md text-xs text-fg-muted",
                          children: [
                            String(documentStore.bootReport.htmlErrors),
                            " 处结构错误",
                            documentStore.bootReport.htmlErrors === 1 ? "" : "s",
                            documentStore.bootReport.htmlErrorSample !== void 0 ? "，首处：" + documentStore.bootReport.htmlErrorSample : "",
                            "。请修复源文件并重新构建，当前无法保存。"
                          ]
                        })
                      ]
                    }) : !currentSlide && hidingMovedDeck() ? SlidesAppJsx.jsx("div", {
                      className: "h-full bg-editor-canvas",
                      "data-testid": "mc-moved-deck"
                    }) : !currentSlide && !creationOnEmptyDeck ? SlidesAppJsx.jsx(EmptyPresentationView, {
                      readOnly,
                      why: saveMessage,
                      busy: presentationBusy,
                      arriving: showAwaitingPlaceholder,
                      onAdd: () => openTemplatePicker()
                    }) : SlidesAppJsx.jsxs("div", {
                      className: "relative flex h-full min-h-0 flex-col",
                      children: [
                        currentSlide ? SlidesAppJsx.jsxs(SlidesAppJsx.Fragment, {
                          children: [
                            showAwaitingPlaceholder ? SlidesAppJsx.jsx("div", {
                              "data-testid": "slides-arriving-notice",
                              className: "mt-[var(--tb-overlay-h,0px)] shrink-0 px-3.5 py-1.5",
                              children: SlidesAppJsx.jsx(runtime2.Callout, {
                                variant: "neutral",
                                role: "none",
                                children: formatPresentationBuildProgress(slides.length, slides.length + resolvedAwaitedSlideCount) + "."
                              })
                            }) : null,
                            SlidesAppJsx.jsx("div", {
                              role: "status",
                              className: "shrink-0",
                              children: slideErrorMessage !== void 0 && slideHtmlError !== void 0 ? SlidesAppJsx.jsx(runtime2.DamagedSlideNotice, {
                                slideId: currentSlide.id,
                                scope: memoryScope,
                                deckTitle: snapshot.meta.title,
                                reason: slideErrorMessage,
                                diagnostic: slideHtmlError,
                                canAsk: !readOnly,
                                className: (0, runtime2.joinClassNames)(!showAwaitingPlaceholder && "mt-[var(--tb-overlay-h,0px)]", "px-3.5 py-1.5")
                              }, currentSlide.id) : null
                            }),
                            SlidesAppJsx.jsx(runtime2.SlideNavigationAnnouncement, {
                              slideKey: currentSlideId !== null ? currentSlide?.id : void 0,
                              message: () => currentSlideIndex < 0 || presentationStartIndex !== null || document.activeElement?.closest('[role="listbox"]') != null ? null : (0, runtime2.formatPresentationSlideAnnouncement)(currentSlideIndex, slides.length, (0, runtime2.slideTitleSnippet)(currentSlide))
                            }),
                            SlidesAppJsx.jsxs("div", {
                              className: "relative flex min-h-0 flex-1",
                              children: [
                                SlidesAppJsx.jsxs("div", {
                                  ref: creationStageRef,
                                  "data-slides-editor": "",
                                  className: "relative min-w-0 flex-1",
                                  children: [
                                    SlidesAppJsx.jsx(runtime2.SlideCanvasEditor, {
                                      startCamera: cameraPreferenceRef.current?.canvas === !1 ? cameraPreferenceRef.current.view : null,
                                      onCamera: saveSlideCamera,
                                      lookPreview: currentSlide !== void 0 ? pendingLook?.(currentSlide) : void 0,
                                      commentStop: commentController.ctl !== null,
                                      onStageMoved: remeasureCommentsOnStageMove,
                                      onCropStart: () => stopTextTool(!0),
                                      returnTakenHint: textToolOn ? "Text tool on. Press " + ((0, runtime2.isApplePlatform)() ? "Return" : "Enter") + " to add a text box in the middle of the slide, or Escape to turn it off." : void 0,
                                      designColors: designPalette,
                                      slideColors: slidePalette,
                                      pickImage: currentSlideReadOnly ? void 0 : async (input) => (await prepareImageAsset(input)).src,
                                      slide: currentSlide,
                                      slideNumber: slides.indexOf(currentSlide) + 1,
                                      slideName: currentSlideIndex < 0 ? "Slide" : (0, runtime2.formatPresentationSlideAnnouncement)(currentSlideIndex, slides.length, (0, runtime2.slideTitleSnippet)(currentSlide)),
                                      busy: presentationBusy,
                                      assets: snapshot.assets,
                                      pending: pendingUploads.filter((input) => input.slideId === currentSlide.id),
                                      covered: presentationStartIndex !== null,
                                      onPointerNorm: (input, options) => cursorPublisherRef.current?.move(scopedSlideKey(currentSlide.id), input, options),
                                      peerLayer: (input, options) => SlidesAppJsx.jsxs(SlidesAppJsx.Fragment, {
                                        children: [
                                          SlidesAppJsx.jsx(runtime2.SlidePeerSelections, {
                                            hosted: host?.presence !== void 0,
                                            deck: memoryScope === "" ? null : (0, runtime2.frameContextId)(memoryScope),
                                            slideId: currentSlide.id,
                                            measure: options,
                                            scale: 1 / input
                                          }),
                                          SlidesAppJsx.jsx(runtime2.PeerCursors, {
                                            surface: scopedSlideKey(currentSlide.id),
                                            toLocal: (input2, options2) => ({
                                              left: input2 * runtime2.SLIDE_WIDTH,
                                              top: options2 * runtime2.SLIDE_HEIGHT
                                            }),
                                            glyphScale: input
                                          })
                                        ]
                                      }),
                                      deckCellCount: (0, runtime2.countDeckTableCells)(slides),
                                      withinStyleBudget: canAddStyledNodes,
                                      selection,
                                      onSelectionChange: (input) => {
                                        setSelection(input), textEdit && !input.some((input2) => input2.frameId === textEdit.frameId) && setTextEditState(null);
                                      },
                                      onLiveChange,
                                      onGestureEnd,
                                      dragLiveRef: dragActiveRef,
                                      textEdit,
                                      onTextEdit: (input) => {
                                        setTextEditState(input), input !== null && setProtectedEditorSlide(currentSlide.id);
                                      },
                                      onDropImage: dropFilesOnSlide,
                                      onReplaceImage: (input, options, context) => void uploadAndInsertImage(input, options, context),
                                      faces: snapshot.faces,
                                      facesFull: fullFontFaces,
                                      fonts: snapshot.fonts,
                                      typeStyles: currentTypeStyles,
                                      deckTypeStyles,
                                      onDropInsert,
                                      onOpenInspector: (input) => {
                                        if (runtime2.ENABLE_OBJECT_PROPERTIES_MENU) {
                                          let [items, items2] = [
                                            input.currentTarget,
                                            (0, runtime2.isKeyboardOrPrimaryActivation)(input)
                                          ], bounds = items.getBoundingClientRect();
                                          openContextMenu({
                                            x: bounds.left,
                                            y: bounds.bottom + 6,
                                            from: "more",
                                            keyboard: items2
                                          }, selection), items2 && items.isConnected && items.focus({
                                            preventScroll: !0
                                          });
                                          return;
                                        }
                                        inspectorPointerInvocationRef.current = (0, runtime2.isKeyboardOrPrimaryActivation)(input), setInspectorTab("properties"), setInspectorOpen(!0);
                                      },
                                      moreMenu: runtime2.ENABLE_OBJECT_PROPERTIES_MENU ? {
                                        label: "更多操作",
                                        open: contextMenu?.at.from === "more"
                                      } : void 0,
                                      onDeleteSelection: currentSlideReadOnly ? void 0 : deleteSelection,
                                      onMenu: currentSlideReadOnly ? void 0 : openContextMenu,
                                      selectionMenuHidden: inspectorOpen,
                                      onChangeSlide,
                                      presenting: presentationStartIndex !== null,
                                      commenting: commentController.ctl !== null && commentController.on && presentationStartIndex === null,
                                      readOnly: currentSlideReadOnly,
                                      zoomApiRef: editorZoomApiRef,
                                      onScaleChange: setToolbarScale,
                                      bottomInset: pageOcclusionBand,
                                      topInset,
                                      sideInset,
                                      surround: editorSurround,
                                      stageOverlay: SlidesAppJsx.jsxs(SlidesAppJsx.Fragment, {
                                        children: [
                                          SlidesAppJsx.jsx(runtime2.SlideCommentLayer, {
                                            ...commentController,
                                            slide: currentSlide,
                                            slides,
                                            typeStyles: allTypeStyles,
                                            containerRef: editorElementRef,
                                            topInset,
                                            hidden: presentationStartIndex !== null,
                                            keepsMode: commentModePersistent,
                                            remeasureRef: commentRemeasureRef
                                          }),
                                          textToolOn ? SlidesAppJsx.jsx(TextToolLayer, {
                                            overSlide,
                                            startsOverSlide: () => slideSurface()?.matches(":hover") ?? !1,
                                            keeps: (input) => input instanceof Node && (textButtonRef.current?.contains(input) ?? !1),
                                            slideRect: () => slideSurface()?.getBoundingClientRect(),
                                            lineHeight: () => bodyLineHeight() * (slideSurface()?.getBoundingClientRect().width ?? 0) / runtime2.SLIDE_WIDTH,
                                            minWidth: () => MIN_TEXT_INSERT_WIDTH * (slideSurface()?.getBoundingClientRect().width ?? 0) / runtime2.SLIDE_WIDTH,
                                            onPlace: placeTextAt,
                                            onCancel: () => stopTextTool()
                                          }) : null
                                        ]
                                      })
                                    }, editingGridSlide ? "in-place" : "plain"),
                                    SlidesAppJsx.jsx(runtime2.CanvasContextMenu, {
                                      at: contextMenu?.at ?? null,
                                      objects: contextMenu?.objects ?? 0,
                                      fitLabel: fitViewLabel,
                                      copyLink: slideActions.onCopyLink !== void 0,
                                      refusals: contextMenu?.refusals ?? {},
                                      returnFocus: (input) => input !== null && (input.closest("[data-object-proxy]") === null || input.hasAttribute("data-object-cursor")) ? input : (editorZoomApiRef.current?.focusSelection() !== !0 && editorZoomApiRef.current?.focusSlide(), null),
                                      onCommand: runContextMenuCommand,
                                      onClose: () => setContextMenu(null)
                                    }),
                                    !railOpen && !editingGridSlide ? SlidesAppJsx.jsx("div", {
                                      ref: creationRailRef,
                                      "data-slides-pager": "",
                                      className: (0, runtime2.joinClassNames)("pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center [:root[data-mc-presentation=sheet]_&]:hidden", !notesOpen && "pb-[var(--sl-safe-b,0px)]", touchLayout && textEdit !== null && "invisible"),
                                      children: SlidesAppJsx.jsxs(runtime2.Surface, {
                                        elevation: runtime2.PANEL_ELEVATION,
                                        className: "pointer-events-auto flex items-center gap-0.5 rounded-full p-2.25 select-none",
                                        children: [
                                          SlidesAppJsx.jsx(runtime2.Button, {
                                            iconOnly: !0,
                                            variant: "ghost",
                                            size: toolbarButtonSize,
                                            icon: "CaretLeft",
                                            "aria-label": "上一张幻灯片",
                                            tooltip: "上一页（←）",
                                            ...disabledInsertControlProps(currentSlideIndex <= 0),
                                            onClick: () => pageSlide(-1)
                                          }),
                                          SlidesAppJsx.jsxs("span", {
                                            className: "px-1 text-[11px] tabular-nums whitespace-nowrap text-fg-muted pointer-coarse:text-body",
                                            children: [
                                              currentSlideIndex + 1,
                                              " / ",
                                              slides.length
                                            ]
                                          }),
                                          SlidesAppJsx.jsx(runtime2.Button, {
                                            iconOnly: !0,
                                            variant: "ghost",
                                            size: toolbarButtonSize,
                                            icon: "CaretRight",
                                            "aria-label": "下一张幻灯片",
                                            tooltip: "下一页（→）",
                                            ...disabledInsertControlProps(currentSlideIndex >= slides.length - 1),
                                            onClick: () => pageSlide(1)
                                          }),
                                          SlidesAppJsx.jsx("span", {
                                            className: "mx-0.5 h-4 w-px bg-border-line"
                                          }),
                                          SlidesAppJsx.jsx(runtime2.Button, {
                                            iconOnly: !0,
                                            variant: "ghost",
                                            size: toolbarButtonSize,
                                            icon: "BookText",
                                            "aria-label": "演讲者备注",
                                            tooltip: notesOpen ? "隐藏演讲者备注" : "显示演讲者备注",
                                            pressed: notesOpen,
                                            onClick: () => setNotesOpen((input) => !input)
                                          }),
                                          SlidesAppJsx.jsx(runtime2.Button, {
                                            iconOnly: !0,
                                            variant: "ghost",
                                            size: toolbarButtonSize,
                                            icon: "Slides",
                                            "aria-label": SHOW_SLIDE_THUMBNAILS_LABEL,
                                            "data-slides-rail-show": "",
                                            onClick: () => chooseRailOpen(!0)
                                          })
                                        ]
                                      })
                                    }) : null
                                  ]
                                }),
                                SlidesAppJsx.jsx(runtime2.SidePanel, {
                                  id: "slides-inspector",
                                  title: (() => {
                                    if (themeTabShown)
                                      return "Theme";
                                    let value = (0, runtime2.filterValidSelections)(currentSlide, selection);
                                    if (value.length > 1)
                                      return String(value.length) + " selected";
                                    let value2 = value[value.length - 1];
                                    switch (value2 ? (0, runtime2.selectedNode)(currentSlide, value2)?.kind : void 0) {
                                      case "text":
                                        return "Text";
                                      case "img":
                                        return (0, runtime2.selectedNode)(currentSlide, value2)?.kind, "Image";
                                      case "icon":
                                        return "Icon";
                                      case "table":
                                        return "Table";
                                      case "stack":
                                        return "Group";
                                      case "grid":
                                        return "Grid";
                                      case "shape":
                                        return "Shape";
                                      case "html":
                                        return "Embed";
                                      case "spacer":
                                        return "Spacer";
                                      case "overlay":
                                        return "Overlay";
                                      default:
                                        return "Slide";
                                    }
                                  })(),
                                  open: inspectorOpen,
                                  onClose: () => setInspectorOpen(!1),
                                  hideTitle: !0,
                                  wideHeader: !1,
                                  resizeLabel: themeTabEnabled ? "Resize side panel" : "Resize properties panel",
                                  ...themeTabEnabled ? {
                                    tabs: PROPERTY_PANEL_TABS,
                                    tab: inspectorTab,
                                    onTabChange: (input) => setInspectorTab(input === "theme" ? "theme" : "properties")
                                  } : {},
                                  children: SlidesAppJsx.jsx("div", {
                                    ref: inspectorContentRef,
                                    className: "contents",
                                    children: currentSlideReadOnly ? SlidesAppJsx.jsx("p", {
                                      className: "p-3.5 text-xs text-fg-muted",
                                      children: slideErrorMessage !== void 0 ? "请先修复此页已保存的内容，再进行编辑。" : (0, runtime2.formatMessage)({
                                        defaultMessage: "此演示文稿为只读，无法修改属性。",
                                        id: "HJ6NQPAawd"
                                      })
                                    }) : themeTabShown ? SlidesAppJsx.jsx(runtime2.ThemePanel, {
                                      restyle: deckRestyle,
                                      slide: currentSlide ?? void 0,
                                      assets: snapshot.assets,
                                      designColors: designPalette,
                                      faces: snapshot.faces,
                                      facesFull: fullFontFaces,
                                      fonts: snapshot.fonts,
                                      editsAreUndoSteps: textEdit === null
                                    }) : SlidesAppJsx.jsx(runtime2.SelectionInspector, {
                                      editsAreUndoSteps: textEdit === null,
                                      designColors: designPalette,
                                      slideColors: slidePalette,
                                      assets: snapshot.assets,
                                      onReplaceImage: (input, options, context, as) => void uploadAndInsertImage(input, options, context, void 0, as),
                                      onRemoveImages: removeSelectedImages,
                                      onRemoveCover: (input, options) => void removeCoverImage(input, options),
                                      unasked: inspectorUnasked,
                                      slide: currentSlide,
                                      selection,
                                      deckCellCount: (0, runtime2.countDeckTableCells)(slides),
                                      typeStyles: currentTypeStyles,
                                      deckTypeStyles,
                                      faces: snapshot.faces,
                                      facesFull: fullFontFaces,
                                      fonts: snapshot.fonts,
                                      onChange: onChangeSlide,
                                      onLiveChange,
                                      onGestureEnd,
                                      onSelectUnit: (input) => setSelection([
                                        input
                                      ]),
                                      measure: (input) => editorZoomApiRef.current?.measureUnit(input),
                                      pickImage: currentSlideReadOnly ? void 0 : async (input) => (await prepareImageAsset(input)).src
                                    })
                                  })
                                })
                              ]
                            })
                          ]
                        }) : SlidesAppJsx.jsxs("div", {
                          className: "relative flex min-h-0 flex-1",
                          children: [
                            SlidesAppJsx.jsx("div", {
                              ref: creationStageRef,
                              "data-creation-stage": "",
                              className: "relative min-w-0 flex-1 bg-editor-canvas",
                              "aria-busy": presentationBusy && !showSlideContent ? !0 : void 0,
                              children: showSlideContent ? SlidesAppJsx.jsx("div", {
                                className: (0, runtime2.joinClassNames)("absolute inset-0", creationView.toEmptyDeck && "sl-creation-empty", creationView.fromEmptyDeck && "sl-creation-empty-out"),
                                inert: creationView.fromEmptyDeck,
                                children: SlidesAppJsx.jsx(EmptyPresentationView, {
                                  readOnly,
                                  why: saveMessage,
                                  busy: presentationBusy && !creationView.fromEmptyDeck,
                                  arriving: showAwaitingPlaceholder,
                                  onAdd: () => openTemplatePicker(),
                                  still: creationView.fromEmptyDeck
                                })
                              }) : null
                            }),
                            creationView.addSlideOnStage ? SlidesAppJsx.jsx("div", {
                              ref: creationRailRef,
                              className: "pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center pb-[var(--sl-safe-b,0px)] [:root[data-mc-presentation=sheet]_&]:hidden",
                              children: SlidesAppJsx.jsxs(runtime2.Surface, {
                                elevation: runtime2.PANEL_ELEVATION,
                                className: "pointer-events-auto flex items-center gap-0.5 rounded-full p-2.25 select-none",
                                children: [
                                  SlidesAppJsx.jsx(runtime2.Button, {
                                    variant: "ghost",
                                    size: toolbarButtonSize,
                                    onClick: () => openTemplatePicker(),
                                    children: ADD_SLIDE_LABEL
                                  }),
                                  SlidesAppJsx.jsx("span", {
                                    className: "mx-0.5 h-4 w-px bg-border-line"
                                  }),
                                  SlidesAppJsx.jsx(runtime2.Button, {
                                    iconOnly: !0,
                                    variant: "ghost",
                                    size: toolbarButtonSize,
                                    icon: "Slides",
                                    "aria-label": SHOW_SLIDE_THUMBNAILS_LABEL,
                                    "data-slides-rail-show": "",
                                    onClick: () => chooseRailOpen(!0)
                                  })
                                ]
                              })
                            }) : null
                          ]
                        }),
                        SlidesAppJsx.jsxs("div", {
                          className: "contents [:root[data-mc-presentation=sheet]_&]:hidden",
                          children: [
                            notesOpen && currentSlide ? SlidesAppJsx.jsx(runtime2.SpeakerNotesEditor, {
                              slide: currentSlide,
                              height: notesHeight,
                              onResize: setNotesHeight,
                              onResizeStart: () => {
                                notesResizeGeometryRef.current = railGeometryRef.current?.() ?? null;
                              },
                              heightFor: (input, options, context, value) => input + (0, runtime2.clampStageRailResizeDelta)(options, notesResizeGeometryRef.current, context - input, value - input),
                              atScreenBottom: !railOpen && !editingGridSlide,
                              readOnly: currentSlideReadOnly,
                              onLiveChange: notesEditGesture.live,
                              onGestureEnd: notesEditGesture.end,
                              onRelease: () => editorZoomApiRef.current?.focusSlide()
                            }) : null,
                            railOpen && !editingGridSlide && (currentSlide !== void 0 || creationView.cells !== null) ? SlidesAppJsx.jsx("div", {
                              className: "contents",
                              children: SlidesAppJsx.jsx(runtime2.SlideThumbnailRail, {
                                rootRef: insertMenuRef,
                                slides,
                                assets: snapshot.assets,
                                currentId: currentSlide?.id ?? null,
                                readOnly,
                                pending: creationView.cells !== null ? {
                                  cells: creationView.cells,
                                  active: creationView.active,
                                  follow: creationView.place?.on === "cell" ? creationView.place.id : null,
                                  growing: creationView.growing,
                                  growFirst: creationView.fromEmptyDeck && !creationView.sheetIn,
                                  fresh: creationView.fresh,
                                  leaving: creationView.leftover
                                } : void 0,
                                personPaged: onPersonPaged,
                                onSelect: selectRailSlide,
                                ...slideActions,
                                onDuplicateAt: (input, options) => duplicateSlide(input, options),
                                onCollapse: () => chooseRailOpen(!1),
                                onEnterSlide: () => editorZoomApiRef.current?.focusSlide(),
                                gridOpen: !1,
                                onSetGridOpen: setGridOpen,
                                notesOpen,
                                onToggleNotes: () => setNotesOpen((input) => !input),
                                commentCounts: openCommentCounts,
                                peersDeck: memoryScope === "" ? null : (0, runtime2.frameContextId)(memoryScope),
                                look: deferredPendingLook,
                                // "left" with appifact_bottom_toolbar (off locally).
                                placement: "bottom",
                                actionRow: !0,
                                overPage: !1,
                                several: railSeveral,
                                resize: {
                                  canvas: editorElementRef,
                                  thumbW: thumbWidth,
                                  onThumbW: setThumbWidth,
                                  paneH: notesOpen ? (0, runtime2.clampSpeakerNotesEditorHeight)(notesHeight) : 0,
                                  geometry: railGeometryRef
                                }
                              })
                            }) : null
                          ]
                        }),
                        creationView.phase !== "quiet" || creationView.toEmptyDeck ? SlidesAppJsx.jsx(runtime2.SlideCreationOverlay, {
                          view: creationView,
                          stage: editorElementRef,
                          rail: insertMenuRef,
                          // Upstream: "left" with the desktop bottom toolbar
                          // (appifact_bottom_toolbar); off locally, so "bottom".
                          railPlacement: "bottom",
                          insetTop: topInset,
                          insetBottom: pageOcclusionBand,
                          insetSide: sideInset,
                          hidden: editingGridSlide || presentationStartIndex !== null,
                          onFit: creationFitsEmptyStage ? setToolbarScale : void 0
                        }) : null
                      ]
                    })
                  })
                ]
              }),
              (gridOpen || editingGridSlide) && presentationStartIndex === null && !deckEmpty ? SlidesAppJsx.jsx("aside", {
                ref: gridLeavingPanelRef,
                className: "shrink-0 border-t border-border-line bg-panel pb-[var(--sl-safe-b,0px)] [:root[data-mc-presentation=sheet]_&]:pb-0",
                children: SlidesAppJsx.jsx(runtime2.SlideRailToolbar, {
                  readOnly,
                  onAdd: slideActions.onAdd,
                  notesOpen,
                  onToggleNotes: () => setNotesOpen((input) => !input),
                  notesDisabledReason: gridOpen ? (0, runtime2.slidesHaveSpeakerNotes)(slides) ? void 0 : readOnly ? "No speaker notes in this presentation" : "No speaker notes yet — open a slide to add some" : void 0,
                  gridOpen: !0,
                  slideShortcut: gridOpen ? "esc" : void 0,
                  canvasShortcut: editingGridSlide ? "shift+cmd+0" : void 0,
                  onSetGridOpen: setGridOpen,
                  onCollapse: () => chooseRailOpen(!1),
                  collapseDisabledReason: gridOpen ? CANVAS_VIEW_NO_THUMBNAILS_MESSAGE : "Editing among the slides: the Canvas around this slide stands in for the thumbnail strip"
                })
              }) : null
            ]
          }),
          SlidesAppJsx.jsx(runtime2.SlideTemplatePicker, {
            open: templatePickerOpen,
            onClose: () => setTemplatePickerOpen(!1),
            onPick: pickSlideTemplate,
            restyle: templateRestyler,
            returnFocus: templatePickerReturnFocus
          }),
          SlidesAppJsx.jsx(runtime2.ExportDeliveryDialog, {
            delivery: exportDelivery,
            onClose: () => setExportDelivery(null)
          }),
          presentationStartIndex !== null && presentableSlides.length > 0 ? SlidesAppJsx.jsx(runtime2.PresentationView, {
            slides: presentableSlides,
            assets: snapshot.assets,
            fontCss,
            heldSlide: slideHtmlHold2,
            editNotes: readOnly ? void 0 : notesEditGesture,
            remote: phoneRemote,
            startIndex: presentationStartIndex,
            dockNotes: dockSpeakerNotes,
            fullscreenRequest,
            onIndexChange: setPresentationCurrentIndex,
            onExit: (input) => exitPresentation(presentableSlides[input]?.id)
          }) : null,
          SlidesAppJsx.jsx(runtime2.LiveAnnouncer, {}),
          SlidesAppJsx.jsx(PresentationWaitingAnnouncement, {
            waiting: resolvedAwaitingSlides,
            slideCount: slides.length,
            turnBusy: presentationBusy,
            startSaidElsewhere: () => creationControllerRef.current.willCount(),
            onStartSaid: () => creationControllerRef.current.startSaid()
          }),
          SlidesAppJsx.jsx(runtime2.EditorDialogHost, {}),
          exportNotes === null ? null : SlidesAppJsx.jsx(runtime2.ExportNotesDialog, {
            notes: exportNotes.notes,
            onClosed: () => setExportNotes((input) => input?.nth === exportNotes.nth ? null : input)
          }, exportNotes.nth),
          SlidesAppJsx.jsx(runtime2.PdfExportOptionsHost, {
            warning: resolvedAwaitingSlides ? {
              ...incompleteDeckExportConfirmation("Download", presentableSlides.length, slides.length + resolvedAwaitedSlideCount),
              cleared: PRESENTATION_EXPORT_ALL_SLIDES_ARRIVED_MESSAGE
            } : void 0,
            notesAvailable: speakerNotesAvailable
          }),
          null,
          readOnly ? null : SlidesAppJsx.jsx(runtime2.useRemoteChangeAnnouncer, {
            doc: documentStore.doc,
            empty: canShowEmptyCreation,
            items: () => (0, runtime2.createSlideAnnouncementFingerprints)(documentStore.doc.content()),
            words: runtime2.PRESENTATION_CHANGE_ANNOUNCEMENTS,
            onBusy: setPresentationBusy
          }),
          runtime2.reactDOMN3_.createPortal(SlidesAppJsx.jsx("div", {
            className: "slides-print-sheet",
            "data-appifact-content": "",
            children: presentableSlides.map((input) => SlidesAppJsx.jsx("div", {
              className: "slides-print-slide",
              children: SlidesAppJsx.jsx(runtime2.SlideSurface, {
                slide: input,
                assets: snapshot.assets,
                animate: !1
              })
            }, input.id))
          }), document.body)
        ]
      })
    });
  }
  function TextToolLayer({ overSlide, startsOverSlide, keeps, slideRect, lineHeight, minWidth, onPlace, onCancel }) {
    let layerRef = runtime2.reactd0.useRef(null), pressRef = runtime2.reactd0.useRef(null), [crosshair, setCrosshair] = runtime2.reactd0.useState(startsOverSlide), [box, setBox] = runtime2.reactd0.useState(null), propsRef = runtime2.reactd0.useRef({ overSlide, keeps, slideRect, lineHeight, minWidth, onPlace, onCancel });
    return propsRef.current = { overSlide, keeps, slideRect, lineHeight, minWidth, onPlace, onCancel }, runtime2.reactd0.useEffect(() => {
      let layer = layerRef.current;
      if (!layer)
        return;
      let reset = () => {
        pressRef.current = null, setBox(null);
      }, onDown = (event) => {
        if (event.stopPropagation(), event.pointerType === "touch" && event.preventDefault(), event.button !== 0 || (0, runtime2.isMacControlClick)(event))
          return;
        let press = pressRef.current;
        press !== null && press.by === "touch" && event.pointerType === "touch" && press.id !== event.pointerId ? reset() : pressRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, by: event.pointerType };
      }, dragEnd = (press, x) => {
        if (Math.abs(x - press.x) <= (press.by === "touch" ? TEXT_TOOL_TOUCH_DRAG : TEXT_TOOL_MOUSE_DRAG))
          return;
        let rect = propsRef.current.slideRect(), clamped = rect === void 0 ? x : Math.min(Math.max(x, rect.left), rect.right);
        return Math.abs(clamped - press.x) >= propsRef.current.minWidth() ? clamped : void 0;
      }, onMove = (event) => {
        let press = pressRef.current;
        if (!press || press.id !== event.pointerId)
          return;
        if (event.pointerType !== "touch" && !(event.buttons & 1))
          return reset();
        let end = dragEnd(press, event.clientX), rect = propsRef.current.slideRect();
        if (end === void 0 || rect === void 0 || !propsRef.current.overSlide(press.x, press.y))
          return setBox(null);
        let own = layer.getBoundingClientRect(), height2 = propsRef.current.lineHeight();
        setBox({
          left: Math.min(press.x, end) - own.left,
          top: Math.min(Math.max(press.y - height2 / 2, rect.top), rect.bottom - height2) - own.top,
          width: Math.abs(end - press.x),
          height: height2
        });
      }, onUp = (event) => {
        let press = pressRef.current;
        !press || press.id !== event.pointerId || (reset(), propsRef.current.onPlace(press.x, press.y, dragEnd(press, event.clientX)));
      }, onCancelPointer = (event) => {
        pressRef.current?.id === event.pointerId && reset();
      }, onKey = (event) => {
        event.key !== "Escape" || pressRef.current === null || (reset(), !event.defaultPrevented && (event.preventDefault(), event.stopPropagation(), propsRef.current.onCancel()));
      }, onContextMenu = (event) => {
        event.preventDefault(), event.stopPropagation(), !(pressRef.current !== null && pressRef.current.by !== "mouse" && !("pointerType" in event && event.pointerType === "mouse")) && (reset(), propsRef.current.onCancel());
      }, onDownElsewhere = (event) => {
        event.target instanceof Node && layer.contains(event.target) || propsRef.current.keeps(event.target) || propsRef.current.onCancel();
      };
      return layer.addEventListener("pointerdown", onDown), layer.addEventListener("contextmenu", onContextMenu), window.addEventListener("pointerdown", onDownElsewhere, !0), window.addEventListener("pointermove", onMove, !0), window.addEventListener("pointerup", onUp, !0), window.addEventListener("pointercancel", onCancelPointer, !0), window.addEventListener("blur", reset), window.addEventListener("keydown", onKey, !0), () => {
        layer.removeEventListener("pointerdown", onDown), layer.removeEventListener("contextmenu", onContextMenu), window.removeEventListener("pointerdown", onDownElsewhere, !0), window.removeEventListener("pointermove", onMove, !0), window.removeEventListener("pointerup", onUp, !0), window.removeEventListener("pointercancel", onCancelPointer, !0), window.removeEventListener("blur", reset), window.removeEventListener("keydown", onKey, !0);
      };
    }, []), SlidesAppJsx.jsx("div", {
      ref: layerRef,
      "data-slides-text-tool": "",
      className: "absolute inset-0 z-[5] touch-none",
      style: { cursor: crosshair ? "crosshair" : "default" },
      onPointerMove: (event) => setCrosshair(overSlide(event.clientX, event.clientY)),
      children: box !== null ? SlidesAppJsx.jsx("div", {
        "data-slides-text-drag": "",
        "aria-hidden": "true",
        className: "pointer-events-none absolute bg-accent-muted outline-1 -outline-offset-1 outline-fill-accent",
        style: box
      }) : null
    });
  }
  function EmptyPresentationView({ readOnly, why, busy, arriving, onAdd, still = !1 }) {
    return SlidesAppJsx.jsx("div", {
      className: "flex h-full flex-col overflow-y-auto bg-editor-canvas pt-[var(--tb-overlay-h,0px)] text-center",
      children: readOnly ? SlidesAppJsx.jsxs("div", {
        className: "m-auto flex flex-col items-center gap-3 p-6",
        children: [
          SlidesAppJsx.jsx("p", {
            className: "text-sm text-fg-secondary",
            children: (0, runtime2.formatMessage)({
              defaultMessage: "此视图中没有可显示的幻灯片。",
              id: "Zqr18+9+9E"
            })
          }),
          SlidesAppJsx.jsx("p", {
            className: "max-w-sm text-xs text-fg-muted",
            children: why
          })
        ]
      }) : SlidesAppJsx.jsx("div", {
        className: "m-auto p-6",
        children: SlidesAppJsx.jsx(EmptyPresentationStatus, {
          busy: (busy || arriving) && !still,
          arriving,
          onAdd,
          still
        })
      })
    });
  }
  function EmptyPresentationStatus({ busy, arriving, onAdd, still = !1 }) {
    let value = ((0, runtime2.useAgentActivity)() === "working" || arriving) && !still;
    return SlidesAppJsx.jsx(runtime2.AgentWorkingCursor, {
      working: value,
      busy,
      tint: "yellow",
      idle: SlidesAppJsx.jsxs(SlidesAppJsx.Fragment, {
        children: [
          SlidesAppJsx.jsx(runtime2.Icon, {
            name: "Slides",
            customSize: 56,
            className: "text-fg-muted opacity-25"
          }),
          SlidesAppJsx.jsx("p", {
            className: "text-sm text-fg-muted",
            children: (0, runtime2.formatMessage)({
              defaultMessage: "还没有幻灯片。添加一页，或让助手帮你制作。",
              id: "aVjrcahOea"
            })
          })
        ]
      }),
      action: SlidesAppJsx.jsx(runtime2.Button, {
        size: "sm",
        onClick: onAdd,
        children: ADD_SLIDE_LABEL
      })
    });
  }
  function SlidesAppLoadingSkeleton({ doc, railOpen }) {
    return SlidesAppJsx.jsx("div", {
      className: "flex h-full min-h-0",
      children: SlidesAppJsx.jsxs("div", {
        className: "flex min-w-0 flex-1 flex-col",
        children: [
          SlidesAppJsx.jsx("div", {
            className: "relative flex min-h-0 flex-1 items-center justify-center bg-editor-canvas p-6 pt-[calc(1.5rem+var(--tb-overlay-h,0px))]",
            children: SlidesAppJsx.jsx(runtime2.EarlySlideFallback, {
              doc,
              fallback: SlidesAppJsx.jsx("div", {
                className: "mc-shimmer aspect-video w-full max-w-3xl rounded-md"
              })
            })
          }),
          railOpen ? SlidesAppJsx.jsx("div", {
            className: "flex shrink-0 gap-6 border-t border-border-line bg-panel p-3 pl-9",
            children: [0, 1, 2].map((input) => SlidesAppJsx.jsx("div", {
              className: "mc-shimmer aspect-video shrink-0 rounded-sm",
              style: {
                width: runtime2.MIN_RAIL_THUMB_WIDTH
              }
            }, input))
          }) : SlidesAppJsx.jsx("div", {
            className: "h-[calc(3.375rem+var(--sl-safe-b,0px))] shrink-0 bg-editor-canvas pointer-coarse:h-[calc(1.875rem+40px+var(--sl-safe-b,0px))]"
          })
        ]
      })
    });
  }
  function loadImageDimensions(src) {
    return new Promise((input, options) => {
      let value = new Image();
      value.onload = () => input({
        w: value.naturalWidth,
        h: value.naturalHeight
      }), value.onerror = () => options(new ImageReadError("could not read image")), value.src = src;
    });
  }
  function isFrameCaptureMode(document2 = document) {
    return document2.documentElement.hasAttribute("data-frame-capture");
  }
  return bindRuntimeValue(runtime2, "SlidesAppJsx", () => SlidesAppJsx, (value) => {
    SlidesAppJsx = value;
  }), bindRuntimeValue(runtime2, "placeInsertedFrame", () => placeInsertedFrame), bindRuntimeValue(runtime2, "EMPTY_SLIDE_GRID_SELECTION", () => EMPTY_SLIDE_GRID_SELECTION, (value) => {
    EMPTY_SLIDE_GRID_SELECTION = value;
  }), bindRuntimeValue(runtime2, "ZOOM_KEYBOARD_SHORTCUT_LABEL", () => ZOOM_KEYBOARD_SHORTCUT_LABEL, (value) => {
    ZOOM_KEYBOARD_SHORTCUT_LABEL = value;
  }), bindRuntimeValue(runtime2, "QUICK_INSERT_SHAPES", () => QUICK_INSERT_SHAPES, (value) => {
    QUICK_INSERT_SHAPES = value;
  }), bindRuntimeValue(runtime2, "QUICK_INSERT_LINE_SHAPES", () => QUICK_INSERT_LINE_SHAPES, (value) => {
    QUICK_INSERT_LINE_SHAPES = value;
  }), bindRuntimeValue(runtime2, "SHAPE_INSERT_SHORTCUTS", () => SHAPE_INSERT_SHORTCUTS, (value) => {
    SHAPE_INSERT_SHORTCUTS = value;
  }), bindRuntimeValue(runtime2, "getShapeInsertShortcut", () => getShapeInsertShortcut), bindRuntimeValue(runtime2, "TEXT_INSERT_SHORTCUT_KEY", () => TEXT_INSERT_SHORTCUT_KEY, (value) => {
    TEXT_INSERT_SHORTCUT_KEY = value;
  }), bindRuntimeValue(runtime2, "parseShapeInsertShortcut", () => parseShapeInsertShortcut), bindRuntimeValue(runtime2, "disabledInsertControlProps", () => disabledInsertControlProps, (value) => {
    disabledInsertControlProps = value;
  }), bindRuntimeValue(runtime2, "isLocalEmbeddableResource", () => isLocalEmbeddableResource, (value) => {
    isLocalEmbeddableResource = value;
  }), bindRuntimeValue(runtime2, "readEmbeddableImageResource", () => readEmbeddableImageResource), bindRuntimeValue(runtime2, "inlineLocalDeckResources", () => inlineLocalDeckResources), bindRuntimeValue(runtime2, "DAMAGED_SLIDE_ACTION_MESSAGE", () => DAMAGED_SLIDE_ACTION_MESSAGE, (value) => {
    DAMAGED_SLIDE_ACTION_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "LOADING_PRESENTATION_PASTE_MESSAGE", () => LOADING_PRESENTATION_PASTE_MESSAGE, (value) => {
    LOADING_PRESENTATION_PASTE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "presentationCapacityMessage", () => presentationCapacityMessage, (value) => {
    presentationCapacityMessage = value;
  }), bindRuntimeValue(runtime2, "SPEAKER_NOTES_POPOUT_FALLBACK_MESSAGE", () => SPEAKER_NOTES_POPOUT_FALLBACK_MESSAGE, (value) => {
    SPEAKER_NOTES_POPOUT_FALLBACK_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "ALL_SLIDES_SKIPPED_EXPORT_MESSAGE", () => ALL_SLIDES_SKIPPED_EXPORT_MESSAGE, (value) => {
    ALL_SLIDES_SKIPPED_EXPORT_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_BUILDING_MESSAGE", () => PRESENTATION_BUILDING_MESSAGE, (value) => {
    PRESENTATION_BUILDING_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "formatPresentationBuildProgress", () => formatPresentationBuildProgress, (value) => {
    formatPresentationBuildProgress = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_EXPORT_ALL_SLIDES_ARRIVED_MESSAGE", () => PRESENTATION_EXPORT_ALL_SLIDES_ARRIVED_MESSAGE, (value) => {
    PRESENTATION_EXPORT_ALL_SLIDES_ARRIVED_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "incompleteDeckExportConfirmation", () => incompleteDeckExportConfirmation), bindRuntimeValue(runtime2, "PresentationWaitingAnnouncement", () => PresentationWaitingAnnouncement), bindRuntimeValue(runtime2, "EXTRA_EXPORT_FORMATS_META_NAME", () => EXTRA_EXPORT_FORMATS_META_NAME, (value) => {
    EXTRA_EXPORT_FORMATS_META_NAME = value;
  }), bindRuntimeValue(runtime2, "EMPTY_EXTRA_EXPORT_FORMATS", () => EMPTY_EXTRA_EXPORT_FORMATS, (value) => {
    EMPTY_EXTRA_EXPORT_FORMATS = value;
  }), bindRuntimeValue(runtime2, "SHELL_EXPORT_IMAGE_REDUCTION_NOTE", () => SHELL_EXPORT_IMAGE_REDUCTION_NOTE, (value) => {
    SHELL_EXPORT_IMAGE_REDUCTION_NOTE = value;
  }), bindRuntimeValue(runtime2, "GOOGLE_SLIDES_BUILD_TIMEOUT_MS", () => GOOGLE_SLIDES_BUILD_TIMEOUT_MS, (value) => {
    GOOGLE_SLIDES_BUILD_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "MAX_BROWSER_EXPORT_BYTES", () => MAX_BROWSER_EXPORT_BYTES, (value) => {
    MAX_BROWSER_EXPORT_BYTES = value;
  }), bindRuntimeValue(runtime2, "BROWSER_EXPORT_IMAGE_REDUCTION_NOTE", () => BROWSER_EXPORT_IMAGE_REDUCTION_NOTE, (value) => {
    BROWSER_EXPORT_IMAGE_REDUCTION_NOTE = value;
  }), bindRuntimeValue(runtime2, "exportFormatSupportsNotes", () => exportFormatSupportsNotes, (value) => {
    exportFormatSupportsNotes = value;
  }), bindRuntimeValue(runtime2, "EXPORT_FORMAT_MIME_AND_EXTENSION", () => EXPORT_FORMAT_MIME_AND_EXTENSION, (value) => {
    EXPORT_FORMAT_MIME_AND_EXTENSION = value;
  }), bindRuntimeValue(runtime2, "getActiveSlideSurfaceRect", () => getActiveSlideSurfaceRect, (value) => {
    getActiveSlideSurfaceRect = value;
  }), bindRuntimeValue(runtime2, "ACTIVE_SLIDE_SURFACE_SELECTOR", () => ACTIVE_SLIDE_SURFACE_SELECTOR, (value) => {
    ACTIVE_SLIDE_SURFACE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "GRID_COMMENT_SLIDE_TARGET_SELECTOR", () => GRID_COMMENT_SLIDE_TARGET_SELECTOR, (value) => {
    GRID_COMMENT_SLIDE_TARGET_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "findActiveCommentSlideTarget", () => findActiveCommentSlideTarget, (value) => {
    findActiveCommentSlideTarget = value;
  }), bindRuntimeValue(runtime2, "EDITOR_TAB_TARGET_SELECTOR", () => EDITOR_TAB_TARGET_SELECTOR, (value) => {
    EDITOR_TAB_TARGET_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "isCanvasEditorFocusTarget", () => isCanvasEditorFocusTarget, (value) => {
    isCanvasEditorFocusTarget = value;
  }), bindRuntimeValue(runtime2, "ACTIVE_SLIDES_VIEW_SWITCH_SELECTOR", () => ACTIVE_SLIDES_VIEW_SWITCH_SELECTOR, (value) => {
    ACTIVE_SLIDES_VIEW_SWITCH_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "findVisibleSlidesViewSwitch", () => findVisibleSlidesViewSwitch), bindRuntimeValue(runtime2, "VIDEO_UPLOAD_TIMEOUT_MS", () => VIDEO_UPLOAD_TIMEOUT_MS, (value) => {
    VIDEO_UPLOAD_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "ignoreGlobalFileDrop", () => ignoreGlobalFileDrop, (value) => {
    ignoreGlobalFileDrop = value;
  }), bindRuntimeValue(runtime2, "COPIED_VIDEO_OMISSION_MESSAGE", () => COPIED_VIDEO_OMISSION_MESSAGE, (value) => {
    COPIED_VIDEO_OMISSION_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "jpegReplacementUploadInput", () => jpegReplacementUploadInput, (value) => {
    jpegReplacementUploadInput = value;
  }), bindRuntimeValue(runtime2, "editorHasBlockingOverlay", () => editorHasBlockingOverlay, (value) => {
    editorHasBlockingOverlay = value;
  }), bindRuntimeValue(runtime2, "SlidesApp", () => SlidesApp), bindRuntimeValue(runtime2, "EmptyPresentationView", () => EmptyPresentationView), bindRuntimeValue(runtime2, "EmptyPresentationStatus", () => EmptyPresentationStatus), bindRuntimeValue(runtime2, "SlidesAppLoadingSkeleton", () => SlidesAppLoadingSkeleton), bindRuntimeValue(runtime2, "loadImageDimensions", () => loadImageDimensions), bindRuntimeValue(runtime2, "isFrameCaptureMode", () => isFrameCaptureMode), () => {
    (0, runtime2.initializeUiPointerMedia)(), SlidesAppJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), EMPTY_SLIDE_GRID_SELECTION = {
      slides: [],
      slideSections: [],
      sections: [],
      editingSection: null
    }, ZOOM_KEYBOARD_SHORTCUT_LABEL = typeof navigator < "u" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ + / ⌘ − / ⌘ 0" : "Ctrl + / Ctrl − / Ctrl 0", QUICK_INSERT_SHAPES = runtime2.shapeVariants.filter((input) => input !== "line" && input !== "connector"), QUICK_INSERT_LINE_SHAPES = runtime2.shapeVariants.filter((input) => input === "line" || input === "connector"), SHAPE_INSERT_SHORTCUTS = {
      rect: {
        key: "r"
      },
      rounded: {
        key: "r",
        shift: !0
      },
      ellipse: {
        key: "o"
      },
      diamond: {
        key: "d"
      },
      line: {
        key: "l"
      },
      connector: {
        key: "l",
        shift: !0
      }
    }, TEXT_INSERT_SHORTCUT_KEY = "t", disabledInsertControlProps = (disabled2) => ({
      "aria-disabled": disabled2 || void 0,
      tabIndex: disabled2 ? -1 : void 0,
      className: "aria-disabled:[&_[data-cds=Icon]]:opacity-disabled aria-disabled:[&_[data-cds-part=paint]]:bg-transparent!"
    }), isLocalEmbeddableResource = (url) => (0, runtime2.isStoredBlobReference)(url) || runtime2.designSystemImagePathPattern.test(url), AGENT_CURSOR_OFFSET = { left: 48, top: 48 }, AGENT_CURSOR_LABEL = { kind: "name", text: (0, runtime2.literalMessage)("助手") }, DEFAULT_TEXT_INSERT_WIDTH = 800, MIN_TEXT_INSERT_WIDTH = (0, runtime2.minimumNodeResizeSize)({
      kind: "text",
      role: "body",
      text: ""
    }), SVG_TOO_LARGE_KIND = "svg-too-large", UNKNOWN_TYPE_KIND = "unknown-type", DAMAGED_SLIDE_ACTION_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页的已保存内容需要修复，本次未作更改。",
      id: "byGni1ohUd"
    }), LOADING_PRESENTATION_PASTE_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "演示文稿仍在打开，本次未粘贴。请稍后再次粘贴。",
      id: "0djoLmNrUN"
    }), presentationCapacityMessage = (count) => (0, runtime2.formatMessage)({
      defaultMessage: "无法再添加 {count} 页，请先删除部分幻灯片。",
      id: "UoxVcqFBN1"
    }, { n: count, count: String(count) }), SPEAKER_NOTES_POPOUT_FALLBACK_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "备注窗口无法打开，可能被浏览器拦截，已在幻灯片下方显示备注。",
      id: "mVaVtg/zBJ"
    }), ALL_SLIDES_SKIPPED_EXPORT_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "所有幻灯片均被跳过，请先取消跳过至少一页再导出",
      id: "cnUaxiqiBI"
    }), PRESENTATION_BUILDING_MESSAGE = "The agent is still adding slides", formatPresentationBuildProgress = (loadedCount, totalCount) => (0, runtime2.formatMessage)({
      defaultMessage: "助手仍在添加幻灯片，已完成 {here} / {total} 页。",
      id: "I0JprfsYlu"
    }, { here: String(loadedCount), total: String(totalCount) }), PRESENTATION_EXPORT_ALL_SLIDES_ARRIVED_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "所有幻灯片均已就绪，下载将包含全部页面。",
      id: "xyk2fcpYoL"
    }), EXTRA_EXPORT_FORMATS_META_NAME = "appifact_extra_export_formats", EMPTY_EXTRA_EXPORT_FORMATS = [], PROPERTY_PANEL_TABS = [
      { value: "properties", label: "属性" },
      { value: "theme", label: "主题" }
    ], SHELL_EXPORT_IMAGE_REDUCTION_NOTE = (0, runtime2.formatMessage)({
      defaultMessage: "已压缩幻灯片图片，以满足 16 MB 导出限制",
      id: "yLczowIbpj"
    }), GOOGLE_SLIDES_BUILD_TIMEOUT_MS = 55e3, EXPORT_FONT_DEADLINE_MS = 1e4, MAX_BROWSER_EXPORT_BYTES = 209715200, BROWSER_EXPORT_IMAGE_REDUCTION_NOTE = (0, runtime2.formatMessage)({
      defaultMessage: "已压缩幻灯片图片，以使文件小于 200 MB",
      id: "huRd2vURkS"
    }), exportFormatSupportsNotes = (format) => format !== "png", EXPORT_FORMAT_MIME_AND_EXTENSION = {
      pdf: [runtime2.PDF_MIME_TYPE, (0, runtime2.literalMessage)("PDF")],
      pptx: [runtime2.PPTX_MIME_TYPE, (0, runtime2.literalMessage)("PPTX")],
      html: [runtime2.HTML_MIME_TYPE, (0, runtime2.literalMessage)("HTML")],
      png: [runtime2.PNG_MIME_TYPE, (0, runtime2.literalMessage)("PNG")]
    }, getActiveSlideSurfaceRect = () => document.querySelector("[data-slides-editor] [data-slide-surface]")?.getBoundingClientRect(), ACTIVE_SLIDE_SURFACE_SELECTOR = "[data-slides-editor] [data-slide-surface]", GRID_COMMENT_SLIDE_TARGET_SELECTOR = '[data-slides-grid] [data-slides-comment-target="slide"]', findActiveCommentSlideTarget = (slideKey) => {
      let editorTarget = document.querySelector('[data-slides-editor] [data-slides-comment-target="slide"]') ?? document.querySelector(ACTIVE_SLIDE_SURFACE_SELECTOR);
      if (editorTarget)
        return editorTarget;
      let callback = (input) => input.dataset.key === slideKey, items = [
        ...document.querySelectorAll(GRID_COMMENT_SLIDE_TARGET_SELECTOR)
      ], value = items.filter((input) => !input.hasAttribute("data-parked"));
      return value.find(callback) ?? value[0] ?? items.find(callback) ?? items[0] ?? document.querySelector("[data-slides-grid]");
    }, EDITOR_TAB_TARGET_SELECTOR = "[data-slides-editor] [tabindex]", isCanvasEditorFocusTarget = (element) => element instanceof Element && element.closest("[data-slides-editor]") !== null && element.closest("[data-slides-pager], [data-tb-foot]") === null, ACTIVE_SLIDES_VIEW_SWITCH_SELECTOR = '[data-slides-view-switch] [role="radio"][aria-checked="true"]', VIDEO_UPLOAD_TIMEOUT_MS = 3e4, ignoreGlobalFileDrop = () => {
    }, COPIED_VIDEO_OMISSION_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "视频无法复制到其他演示文稿，已跳过。",
      id: "bmIaUBFdH1"
    }), jpegReplacementUploadInput = (input, options) => {
      let { blob, ...value } = options;
      return {
        file: new File([blob], input.name.replace(/\.[^.]*$/, "") + ".jpg", {
          type: "image/jpeg"
        }),
        meta: value
      };
    }, editorHasBlockingOverlay = (extraDialogSelector = "") => {
      let callback = (input) => input !== null && input.closest('[data-cds="Toast"]') !== null;
      return [
        ...document.querySelectorAll(runtime2.OPEN_OVERLAY_SELECTOR + ', [data-mc-pick], [role="dialog"]' + extraDialogSelector)
      ].some((input) => !(0, runtime2.isOverlayClosed)(input) && (!callback(input) || callback(document.activeElement)));
    }, MAX_IMAGES_PLACED_AT_ONCE = 6, INSERT_STAGGER_STEP = 32, UPLOAD_TIMEOUT_PER_FILE_MS = 9e4, FONT_LICENCE_LISTS_TIMEOUT_MS = 1e4, PHONE_REMOTE_FLAG = "slides_phone_remote", RAIL_FOCUSABLE_OPTION_SELECTOR = '[role="option"][tabindex="0"]', LAST_SLIDE_DELETE_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "演示文稿至少保留一页。",
      id: "CQTsAKKG6U"
    }), DAMAGED_SLIDES_DELETE_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "其中一页的已保存内容需要修复，本次未删除任何幻灯片。",
      id: "3j/eoi+E3g"
    }), SLIDE_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页已满，请先移除一个元素。",
      id: "rVJPt03VKF"
    }), TABLE_CELLS_FULL_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此演示文稿的表格单元格数已达上限，请先删除部分单元格。",
      id: "LaV+ulhUKP"
    }), presentationSlideCapacityMessage = (count) => (0, runtime2.formatMessage)({
      defaultMessage: "无法再添加 {count} 页，请先删除部分幻灯片。",
      id: "Ku34vIIngB"
    }, { count }), exportFailedMessage = (format, reason) => (0, runtime2.formatMessage)({
      defaultMessage: "{format, select, pdf {PDF 导出失败：{reason}} pptx {PPTX 导出失败：{reason}} png {PNG 导出失败：{reason}} other {网页导出失败：{reason}}}",
      id: "4GNEY6qO6P"
    }, { format, reason }), slidesCopiedMessage = (count) => (0, runtime2.formatMessage)({
      defaultMessage: "已复制 {count} 页幻灯片",
      id: "v4vhA/w/mA"
    }, { count }), EXPORTING_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "正在导出…",
      id: "rt4uTcGl43"
    }), PRESENT_FROM_CURRENT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "从当前页放映",
      id: "G5pGdpPaZM"
    }), ADD_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "添加幻灯片",
      id: "V8HonhGReX"
    }), SHOW_SLIDE_THUMBNAILS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "显示幻灯片缩略图",
      id: "ypdKDA1W5l"
    }), CANVAS_VIEW_NO_THUMBNAILS_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "当前为画布视图，没有可隐藏的缩略图栏",
      id: "8huQ+J2HCi"
    }), TEXT_INPUT_TYPES = /* @__PURE__ */ new Set([
      "text",
      "search",
      "email",
      "url",
      "tel",
      "password",
      "number"
    ]);
  };
}
export {
  installEditorApp
};
