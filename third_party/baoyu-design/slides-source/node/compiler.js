// Reconstructed from JimLiu/baoyu-design c15e76e, MIT.
// Published node/compiler.cjs preserves the named module implementation.
import libraries from '../vendor/node-dependencies.cjs'
const { React263, ReactDOM15, jsxRuntime, ReactDOMClient, index_parts_exports, index_parts_exports2, index_parts_exports3, index_parts_exports4, index_parts_exports5, index_parts_exports6, index_parts_exports7, index_parts_exports8, index_parts_exports9, index_parts_exports10, index_parts_exports11, index_parts_exports12, RadioGroup, Button, useRender, mergeProps, LabelableProvider, index_parts_exports13, index_parts_exports14, index_parts_exports15, index_parts_exports16, Menubar, DirectionProvider, useDirection, index_parts_exports17, createChangeEventDetails, createGenericEventDetails, useFieldRootContext, useLabelableContext, cva, clsx, extendTailwindMerge, validators, import_pptxgenjs, init_woff2_decoder, woff2_decoder_exports } = libraries
function installLibraries(runtime2) {
  runtime2.loadReactNamespace = () => React263;
  runtime2.loadReactDomNamespace = () => ReactDOM15;
  runtime2.loadJsxNamespace = () => jsxRuntime;
  runtime2.loadReactDomClientNamespace = () => ReactDOMClient;
  runtime2.baseMenu = index_parts_exports;
  runtime2.baseContextMenu = index_parts_exports2;
  runtime2.basePopover = index_parts_exports3;
  runtime2.baseCombobox = index_parts_exports4;
  runtime2.baseTooltip = index_parts_exports5;
  runtime2.baseCollapsible = index_parts_exports6;
  runtime2.baseField = index_parts_exports7;
  runtime2.baseDialog = index_parts_exports8;
  runtime2.baseAlertDialog = index_parts_exports9;
  runtime2.baseRadio = index_parts_exports10;
  runtime2.baseTabs = index_parts_exports11;
  runtime2.baseToast = index_parts_exports12;
  runtime2.baseRadioGroup = RadioGroup;
  runtime2.baseButton = Button;
  runtime2.baseUseRender = useRender;
  runtime2.baseMergeProps = mergeProps;
  runtime2.baseLabelableProvider = LabelableProvider;
  runtime2.baseCheckbox = index_parts_exports13;
  runtime2.baseSwitch = index_parts_exports14;
  runtime2.baseNumberField = index_parts_exports15;
  runtime2.baseFieldsetRoot = index_parts_exports16.Root;
  runtime2.baseMenubar = Menubar;
  runtime2.baseDirectionProvider = DirectionProvider;
  runtime2.baseUseDirection = useDirection;
  runtime2.basePreviewCard = index_parts_exports17;
  runtime2.baseCreateChangeEventDetails = createChangeEventDetails;
  runtime2.baseCreateGenericEventDetails = createGenericEventDetails;
  runtime2.baseUseFieldRootContext = useFieldRootContext;
  runtime2.baseUseLabelableContext = useLabelableContext;
  runtime2.cva = cva;
  runtime2.clsx = clsx;
  runtime2.extendTailwindMerge = extendTailwindMerge;
  runtime2.validators = validators;
  runtime2.PptxPresentation = import_pptxgenjs.default;
  runtime2.PPTX_EMU = 914400;
  runtime2.initializeNpmDependency = () => {
  };
  runtime2.decompressWoff2 = async (bytes) => (await Promise.resolve().then(() => (init_woff2_decoder(), woff2_decoder_exports))).default(bytes);
}
import { installModuleInterop } from '../modules/module-interop.js'
import { installEnvironmentI18n } from '../modules/environment-i18n.js'
import { installUiFoundation } from '../modules/ui-foundation.js'
import { installUiInteractions } from '../modules/ui-interactions.js'
import { installUiOverlays } from '../modules/ui-overlays.js'
import { installUiEditorTokens } from '../modules/ui-editor-tokens.js'
import { installUiEditorSelection } from '../modules/ui-editor-selection.js'
import { installUiAvatars } from '../modules/ui-avatars.js'
import { installUiAvatarStack } from '../modules/ui-avatar-stack.js'
import { installUiDisclosure } from '../modules/ui-disclosure.js'
import { installUiMenu } from '../modules/ui-menu.js'
import { installUiInputs } from '../modules/ui-inputs.js'
import { installUiDialog } from '../modules/ui-dialog.js'
import { installUiTabs } from '../modules/ui-tabs.js'
import { installUiDialog2 } from '../modules/ui-dialog2.js'
import { installUiTable } from '../modules/ui-table.js'
import { installUiScrollPager } from '../modules/ui-scroll-pager.js'
import { installUiTabs2 } from '../modules/ui-tabs2.js'
import { installUiToast } from '../modules/ui-toast.js'
import { installUiPreviewCard } from '../modules/ui-preview-card.js'
import { installUiPulse } from '../modules/ui-pulse.js'
import { installUiInputs2 } from '../modules/ui-inputs2.js'
import { installUiPropertyFocus } from '../modules/ui-property-focus.js'
import { installUiPropertyIcons } from '../modules/ui-property-icons.js'
import { installUiAnnouncements } from '../modules/ui-announcements.js'
import { installUiContrast } from '../modules/ui-contrast.js'
import { installUiPropertyLabels } from '../modules/ui-property-labels.js'
import { installUiContrastControls } from '../modules/ui-contrast-controls.js'
import { installUiKitFieldUndo } from '../modules/ui-kit-field-undo.js'
import { installUiColorPicker } from '../modules/ui-color-picker.js'
import { installEditorShapeIconPaths } from '../modules/editor-shape-icon-paths.js'
import { installUiInspectorIcons } from '../modules/ui-inspector-icons.js'
import { installUiNumberControls } from '../modules/ui-number-controls.js'
import { installUiPropertyRow } from '../modules/ui-property-row.js'
import { installUiScrimPressThrough } from '../modules/ui-scrim-press-through.js'
import { installUiPropertyPopover } from '../modules/ui-property-popover.js'
import { installUiPropertySearch } from '../modules/ui-property-search.js'
import { installUiPointerMedia } from '../modules/ui-pointer-media.js'
import { installUiSelect } from '../modules/ui-select.js'
import { installUiGradientEditor } from '../modules/ui-gradient-editor.js'
import { installUiTooltipWrapper } from '../modules/ui-tooltip-wrapper.js'
import { installUiIconButton } from '../modules/ui-icon-button.js'
import { installUiColorSelect } from '../modules/ui-color-select.js'
import { installEnvironmentColorMode } from '../modules/environment-color-mode.js'
import { installEnvironmentPlatformShortcuts } from '../modules/environment-platform-shortcuts.js'
import { installMediaImageCrop } from '../modules/media-image-crop.js'
import { installMediaImageDownsampling } from '../modules/media-image-downsampling.js'
import { installEnvironmentLinks } from '../modules/environment-links.js'
import { installEnvironmentHostCapabilities } from '../modules/environment-host-capabilities.js'
import { installEnvironmentCompiledPage } from '../modules/environment-compiled-page.js'
import { installEnvironmentEmulator } from '../modules/environment-emulator.js'
import { installMediaAssets } from '../modules/media-assets.js'
import { installMediaVideoLinks } from '../modules/legacy-media-metadata.js'
import { installModelSections } from '../modules/model-sections.js'
import { installModelTypeScales } from '../modules/model-type-scales.js'
import { installModelStyleSchema } from '../modules/model-style-schema.js'
import { installModelArtifactLinks } from '../modules/model-artifact-links.js'
import { installModelDeck } from '../modules/model-deck.js'
import { installDesignSystemTokens } from '../modules/design-system-tokens.js'
import { installDesignSystemStore } from '../modules/design-system-store.js'
import { installCompilerCssValues } from '../modules/compiler-css-values.js'
import { installCompilerHtml } from '../modules/compiler-html.js'
import { installModelTypography } from '../modules/model-typography.js'
import { installModelGeometry } from '../modules/model-geometry.js'
import { installModelRichTextDom } from '../modules/model-rich-text-dom.js'
import { installSerializationHtml } from '../modules/serialization-html.js'
import { installModelEditing } from '../modules/model-editing.js'
import { installModelSelection } from '../modules/model-selection.js'
import { installFontsCatalog } from '../modules/fonts-catalog.js'
import { installFontsVariants } from '../modules/fonts-variants.js'
import { installRenderingTheme } from '../modules/rendering-theme.js'
import { installRenderingArtifactLinkCards } from '../modules/rendering-artifact-link-cards.js'
import { installModelNavigation } from '../modules/model-navigation.js'
import { installModelRichTextCommands } from '../modules/model-rich-text-commands.js'
import { installEmbedsSanitizer } from '../modules/embeds-sanitizer.js'
import { installEmbedsRuntimeBridge } from '../modules/embeds-runtime-bridge.js'
import { installEmbedsDocument } from '../modules/embeds-document.js'
import { installEmbedsFrameHost } from '../modules/embeds-frame-host.js'
import { installEmbedsReactFrame } from '../modules/embeds-react-frame.js'
import { installRenderingIconFont } from '../modules/rendering-icon-font.js'
import { installMediaPlaybackTurn } from '../modules/media-playback-turn.js'
import { installRenderingArtifactLinkCardViews } from '../modules/rendering-artifact-link-card-views.js'
import { installRenderingSlideSnapshots } from '../modules/rendering-slide-snapshots.js'
import { installRenderingSlides } from '../modules/rendering-slides.js'
import { installFontsFetch } from '../modules/fonts-fetch.js'
import { installPresentationBuildEffects } from '../modules/presentation-build-effects.js'
import { installFontsReadiness } from '../modules/fonts-readiness.js'
import { installFontsGoogleFontLicences } from '../modules/fonts-google-font-licences.js'
import { installExportFilenames } from '../modules/export-filenames.js'
import { installExportEmbedCapture } from '../modules/export-embed-capture.js'
import { installExportReactCapture } from '../modules/export-react-capture.js'
import { installExportFontTables } from '../modules/export-font-tables.js'
import { installExportPptx } from '../modules/export-pptx.js'
import { installExportPdfWriter } from '../modules/export-pdf-writer.js'
import { installExportRenderedSemantics } from '../modules/export-rendered-semantics.js'
import { installFontsFaceParser } from '../modules/fonts-face-parser.js'
import { installFontsInlining } from '../modules/fonts-inlining.js'
import { installExportPdfCapture } from '../modules/export-pdf-capture.js'
import { installExportPng } from '../modules/export-png.js'
import { installExportBackground } from '../modules/export-background.js'
import { installExportBackgroundPicturesTail } from '../modules/export-background-pictures-tail.js'
import { installExportDeckMeasurement } from '../modules/export-deck-measurement.js'
import { installExportFontSubstitution } from '../modules/export-font-substitution.js'
import { installExportGoogleFontCatalog } from '../modules/export-google-font-catalog.js'
import { installExportGoogleSlidesFonts } from '../modules/export-google-slides-fonts.js'
import { installExportCurrentFonts } from '../modules/export-current-fonts.js'
import { installExportPptxFontEmbedding } from '../modules/export-pptx-font-embedding.js'
import { installExportNotesPages } from '../modules/export-notes-pages.js'
import { installExportPicturePptx } from '../modules/export-picture-pptx.js'
import { installExportPageRuntime } from '../modules/export-page-runtime.js'
import { installExportImageShrinking } from '../modules/export-image-shrinking.js'
import { installExportDeckHtml } from '../modules/export-deck-html.js'
import { installHostHotReload } from '../modules/host-hot-reload.js'
import { installHostFeatureFlags } from '../modules/host-feature-flags.js'
import { installHostAgentActivity } from '../modules/host-agent-activity.js'
import { installUiEditorBootstrapImports } from '../modules/ui-editor-bootstrap-imports.js'
import { installHostFrameBridge } from '../modules/host-frame-bridge.js'
import { installHostFrameComposer } from '../modules/host-frame-composer.js'
import { installUiUndoKeys } from '../modules/ui-undo-keys.js'
import { installUiCollaboratorTints } from '../modules/ui-collaborator-tints.js'
import { installUiViewportGestures } from '../modules/ui-viewport-gestures.js'
import { installUiDesignProvider } from '../modules/ui-design-provider.js'
import { installUiCommitTextInput } from '../modules/ui-commit-text-input.js'
import { installUiSidePanels } from '../modules/ui-side-panels.js'
import { installUiContextMenuPopup } from '../modules/ui-context-menu-popup.js'
import { installUiCanvasFocus } from '../modules/ui-canvas-focus.js'
import { installUiPropertyRows } from '../modules/ui-property-rows.js'
import { installUiSegmentedProperty } from '../modules/ui-segmented-property.js'
import { installUiSidesProperty } from '../modules/ui-sides-property.js'
import { installEditorHitTesting } from '../modules/editor-hit-testing.js'
import { installEditorMediaCropOverlay } from '../modules/editor-media-crop-overlay.js'
import { installEditorMeasurementOverlay } from '../modules/editor-measurement-overlay.js'
import { installEditorDragGeometry } from '../modules/editor-drag-geometry.js'
import { installUiToolbarControls } from '../modules/ui-toolbar-controls.js'
import { installUiToolbarTabs } from '../modules/ui-toolbar-tabs.js'
import { installUiArtifactLoadBoundary } from '../modules/ui-artifact-load-boundary.js'
import { installUiAgentCursor } from '../modules/ui-agent-cursor.js'
import { installUiFileDrop } from '../modules/ui-file-drop.js'
import { installUiToasts } from '../modules/ui-toasts.js'
import { installUiToolbarPopover } from '../modules/ui-toolbar-popover.js'
import { installUiPropertyPopover2 } from '../modules/ui-property-popover2.js'
import { installUiArtifactToolbar } from '../modules/ui-artifact-toolbar.js'
import { installUiToolbarFoot } from '../modules/ui-toolbar-foot.js'
import { installUiArtifactShell } from '../modules/ui-artifact-shell.js'
import { installHostArtifactText } from '../modules/host-artifact-text.js'
import { installHostClipboardText } from '../modules/host-clipboard-text.js'
import { installHostRoomPresence } from '../modules/host-room-presence.js'
import { installEditorFrameComments } from '../modules/editor-frame-comments.js'
import { installHostAgentSession } from '../modules/host-agent-session.js'
import { installHostHandoffPreference } from '../modules/host-handoff-preference.js'
import { installHostBusyHolds } from '../modules/host-busy-holds.js'
import { installHostArtifactClipboard } from '../modules/host-artifact-clipboard.js'
import { installModelComments } from '../modules/model-comments.js'
import { installHostArtifactEditCount } from '../modules/host-artifact-edit-count.js'
import { installHostArtifactPresence } from '../modules/host-artifact-presence.js'
import { installHostUserApi } from '../modules/host-user-api.js'
import { installUiPeerCursors } from '../modules/ui-peer-cursors.js'
import { installUiRemoteChangeAnnouncer } from '../modules/ui-remote-change-announcer.js'
import { installMediaEmbeddedPlayerSupport } from '../modules/media-embedded-player-support.js'
import { installEditorCommandHistory } from '../modules/editor-command-history.js'
import { installModelDeckMetadata } from '../modules/model-deck-metadata.js'
import { installEditorDeckCommandHistory } from '../modules/editor-deck-command-history.js'
import { installEditorSlideGestureHistory } from '../modules/editor-slide-gesture-history.js'
import { installDesignSystemColorAnalysis } from '../modules/design-system-color-analysis.js'
import { installUiZoomControl } from '../modules/ui-zoom-control.js'
import { installUiFindBar } from '../modules/ui-find-bar.js'
import { installDesignSystemThemeLooks } from '../modules/design-system-theme-looks.js'
import { installUiArtifactFind } from '../modules/ui-artifact-find.js'
import { installEditorDomTextSearch } from '../modules/editor-dom-text-search.js'
import { installUiFindHighlights } from '../modules/ui-find-highlights.js'
import { installUiFindResultIcons } from '../modules/ui-find-result-icons.js'
import { installModelArtifactStoreRecords } from '../modules/model-artifact-store-records.js'
import { installEditorFontFaceChoices } from '../modules/editor-font-face-choices.js'
import { installEditorGestureCursor } from '../modules/editor-gesture-cursor.js'
import { installEditorSlideGeneration } from '../modules/editor-slide-generation.js'
import { installUiSessionProperties } from '../modules/ui-session-properties.js'
import { installUiStyleInspector } from '../modules/ui-style-inspector.js'
import { installUiBoxQuickPanels } from '../modules/ui-box-quick-panels.js'
import { installUiBoxStyleToolbar } from '../modules/ui-box-style-toolbar.js'
import { installUiSelectionActions } from '../modules/ui-selection-actions.js'
import { installUiEditContextMenu } from '../modules/ui-edit-context-menu.js'
import { installUiRovingFocus } from '../modules/ui-roving-focus.js'
import { installUiScrollbarOverlay } from '../modules/ui-scrollbar-overlay.js'
import { installEditorChildSizeModes } from '../modules/editor-child-size-modes.js'
import { installUiInputActivation } from '../modules/ui-input-activation.js'
import { installEditorContrastBackgrounds } from '../modules/editor-contrast-backgrounds.js'
import { installUiSelectionInspector } from '../modules/ui-selection-inspector.js'
import { installEditorMediaCropSession } from '../modules/editor-media-crop-session.js'
import { installEditorGrouping } from '../modules/editor-grouping.js'
import { installLayoutSelectionGroups } from '../modules/layout-selection-groups.js'
import { installLayoutSnapping } from '../modules/layout-snapping.js'
import { installCreationTiming } from '../modules/creation-timing.js'
import { installCollaborationSlidePresence } from '../modules/collaboration-slide-presence.js'
import { installEditorSlideSelection } from '../modules/editor-slide-selection.js'
import { installEditorSlideRailMarquee } from '../modules/editor-slide-rail-marquee.js'
import { installEditorSlideRailLayout } from '../modules/editor-slide-rail-layout.js'
import { installEditorSlideMessages } from '../modules/editor-slide-messages.js'
import { installEditorSlideRail } from '../modules/editor-slide-rail.js'
import { installEditorSlideGrid } from '../modules/editor-slide-grid.js'
import { installBridgeFrameViewport } from '../modules/bridge-frame-viewport.js'
import { installCommentsCapability } from '../modules/comments-capability.js'
import { installCommentsAnchors } from '../modules/comments-anchors.js'
import { installCommentsComposer } from '../modules/comments-composer.js'
import { installCommentsLabels } from '../modules/comments-labels.js'
import { installEditorTouchLongPress } from '../modules/editor-touch-long-press.js'
import { installEditorCanvas } from '../modules/editor-canvas.js'
import { installEditorSpeakerNotes } from '../modules/editor-speaker-notes.js'
import { installEditorShapeIcons } from '../modules/editor-shape-icons.js'
import { installEditorDamagedSlide } from '../modules/editor-damaged-slide.js'
import { installEditorPalette } from '../modules/editor-palette.js'
import { installEditorContextMenu } from '../modules/editor-context-menu.js'
import { installEditorClipboard } from '../modules/editor-clipboard.js'
import { installPresentationFullscreen } from '../modules/presentation-fullscreen.js'
import { installPresentationSlideIndex } from '../modules/presentation-slide-index.js'
import { installPresentationAnnouncements } from '../modules/presentation-announcements.js'
import { installPresentationSpeakerProtocol } from '../modules/presentation-speaker-protocol.js'
import { installPresentationPhoneRemote } from '../modules/presentation-phone-remote.js'
import { installPresentationPopouts } from '../modules/presentation-popouts.js'
import { installDocumentsJsonRecords } from '../modules/documents-json-records.js'
import { installDocumentsCommentRecords } from '../modules/documents-comment-records.js'
import { installDocumentsMigrationMarkers } from '../modules/documents-migration-markers.js'
import { installDocumentsSlideCodec } from '../modules/documents-slide-codec.js'
import { installPresentationSpeakerPanel } from '../modules/presentation-speaker-panel.js'
import { installPresentationSpeakerSession } from '../modules/presentation-speaker-session.js'
import { installPresentationAnimationEngine } from '../modules/presentation-animation-engine.js'
import { installDesignSystemThemePanel } from '../modules/design-system-theme-panel.js'
import { installPresentationPlayer } from '../modules/presentation-player.js'
import { installCreationOverlay } from '../modules/creation-overlay.js'
import { installEditorSlideTicks } from '../modules/editor-slide-ticks.js'
import { installCreationController } from '../modules/creation-controller.js'
import { installEditorEarlySlide } from '../modules/editor-early-slide.js'
import { installEditorFocusRegions } from '../modules/editor-focus-regions.js'
import { installEditorFind } from '../modules/editor-find.js'
import { installEditorChangeAnnouncements } from '../modules/editor-change-announcements.js'
import { installCommentsAreaSelection } from '../modules/comments-area-selection.js'
import { installCommentsAreaGeometry } from '../modules/comments-area-geometry.js'
import { installCommentsPinGeometry } from '../modules/comments-pin-geometry.js'
import { installCommentsHitTesting } from '../modules/comments-hit-testing.js'
import { installCommentsPin } from '../modules/comments-pin.js'
import { installCommentsHighlights } from '../modules/comments-highlights.js'
import { installCommentsPinOcclusion } from '../modules/comments-pin-occlusion.js'
import { installDesignSystemDeckRestyle } from '../modules/design-system-deck-restyle.js'
import { installCommentsKeyboard } from '../modules/comments-keyboard.js'
import { installCommentsSlideLayer } from '../modules/comments-slide-layer.js'
import { installCommentsGridLayer } from '../modules/comments-grid-layer.js'
import { installEditorGridNotesClick } from '../modules/editor-grid-notes-click.js'
import { installCollaborationGridCursors } from '../modules/collaboration-grid-cursors.js'
import { installCollaborationSelectionRings } from '../modules/collaboration-selection-rings.js'
import { installCollaborationSlideSelection } from '../modules/collaboration-slide-selection.js'
import { installDeliveryShellDownloads } from '../modules/delivery-shell-downloads.js'
import { installDeliveryProvider } from '../modules/delivery-provider.js'
import { installDeliveryLabels } from '../modules/delivery-labels.js'
import { installDeliveryBrowserDownload } from '../modules/delivery-browser-download.js'
import { installDeliveryPdfOptions } from '../modules/delivery-pdf-options.js'
import { installDeliveryNotesDialog } from '../modules/delivery-notes-dialog.js'
import { installDeliveryFontSubstitution } from '../modules/delivery-font-substitution.js'
import { installBridgePageOcclusion } from '../modules/bridge-page-occlusion.js'
import { installEditorDialogs } from '../modules/editor-dialogs.js'
import { installDocumentsEditProtection } from '../modules/documents-edit-protection.js'
import { installEditorViewState } from '../modules/editor-view-state.js'
import { installDocumentsSelfPublish } from '../modules/documents-self-publish.js'
import { installDocumentsArtifactDocument } from '../modules/documents-artifact-document.js'
import { installDocumentsRemovedSlides } from '../modules/documents-removed-slides.js'
import { installDocumentsDeckStore } from '../modules/documents-deck-store.js'
import { installDocumentsAssetUndo } from '../modules/documents-asset-undo.js'
import { installEditorCurrentSlide } from '../modules/editor-current-slide.js'
import { installBridgePlaceLinks } from '../modules/bridge-place-links.js'
import { installEditorTemplates } from '../modules/editor-templates.js'
import { installEditorTemplateRestyling } from '../modules/editor-template-restyling.js'
import { installDeliveryDialog } from '../modules/delivery-dialog.js'
import { installEditorApp } from '../modules/editor-app.js'
import { installDocumentsWriteAccess } from '../modules/documents-write-access.js'
import { installBootThumbnailCapture } from '../modules/boot-thumbnail-capture.js'
import { installBootStateFile } from '../modules/boot-state-file.js'
import { installBootLegacyHtml } from '../modules/boot-legacy-html.js'
import { installEditorThumbnailApp } from '../modules/editor-thumbnail-app.js'
import { installEditorCoverTitle } from '../modules/editor-cover-title.js'
import { installDocumentsStashRecoveryMessage } from '../modules/documents-stash-recovery-message.js'
import { installFilesSlideCodec } from '../modules/files-slide-codec.js'
import { installDesignSystemSystemFonts } from '../modules/design-system-system-fonts.js'
import { installDesignSystemSlideStyles } from '../modules/design-system-slide-styles.js'
import { installFilesCrashStash } from '../modules/files-crash-stash.js'
import { installFilesUnsavedSlides } from '../modules/files-unsaved-slides.js'
import { installFilesUnloadFlush } from '../modules/files-unload-flush.js'
import { installFilesSyncErrorNotifier } from '../modules/files-sync-error-notifier.js'
import { installFilesDesignSystems } from '../modules/files-design-systems.js'
import { installDesignSystemRestyle } from '../modules/design-system-restyle.js'
import { installFilesProjectPaths } from '../modules/files-project-paths.js'
import { installFilesSha256 } from '../modules/files-sha256.js'
import { installFilesPublishInputs } from '../modules/files-publish-inputs.js'
import { installFilesReadRetries } from '../modules/files-read-retries.js'
import { installFilesHotUpdates } from '../modules/files-hot-updates.js'
import { installFilesBootReader } from '../modules/files-boot-reader.js'
import { installFilesSequenceMerge } from '../modules/files-sequence-merge.js'
import { installFilesBrowserPort } from '../modules/files-browser-port.js'
import { installFilesDocumentMerge } from '../modules/files-document-merge.js'
import { installFilesIndexStore } from '../modules/files-index-store.js'
import { installFilesBootRecovery } from '../modules/files-boot-recovery.js'
import { installFilesSaveQueue } from '../modules/files-save-queue.js'
import { installFilesDebugPanel } from '../modules/files-debug-panel.js'
import { installFilesSlideOrderMerge } from '../modules/files-slide-order-merge.js'
import { installFilesSlidesDocument } from '../modules/files-slides-document.js'
import { installFilesEarlySlides } from '../modules/files-early-slides.js'
import { installBootstrap } from '../modules/bootstrap.js'
function createSlidesRuntime(options = {}) {
  const runtime2 = /* @__PURE__ */ Object.create(null);
  installLibraries(runtime2);
  const initializers = [
    installModuleInterop(runtime2),
    // Upstream runs the i18n setup eagerly at load (no lazy wrapper); messages are formatted from module inits on, so it
    // installs first.
    installEnvironmentI18n(runtime2),
    installUiFoundation(runtime2),
    installUiInteractions(runtime2),
    installUiOverlays(runtime2),
    installUiEditorTokens(runtime2),
    installUiEditorSelection(runtime2),
    installUiAvatars(runtime2),
    installUiAvatarStack(runtime2),
    installUiDisclosure(runtime2),
    installUiMenu(runtime2),
    installUiInputs(runtime2),
    installUiDialog(runtime2),
    installUiTabs(runtime2),
    installUiDialog2(runtime2),
    installUiTable(runtime2),
    installUiScrollPager(runtime2),
    installUiTabs2(runtime2),
    installUiToast(runtime2),
    installUiPreviewCard(runtime2),
    installUiPulse(runtime2),
    installUiInputs2(runtime2),
    installUiPropertyFocus(runtime2),
    installUiPropertyIcons(runtime2),
    installUiAnnouncements(runtime2),
    installUiContrast(runtime2),
    installUiPropertyLabels(runtime2),
    installUiContrastControls(runtime2),
    installUiKitFieldUndo(runtime2),
    installUiColorPicker(runtime2),
    installEditorShapeIconPaths(runtime2),
    installUiInspectorIcons(runtime2),
    installUiNumberControls(runtime2),
    installUiPropertyRow(runtime2),
    installUiScrimPressThrough(runtime2),
    installUiPropertyPopover(runtime2),
    installUiPropertySearch(runtime2),
    installUiPointerMedia(runtime2),
    installUiSelect(runtime2),
    installUiGradientEditor(runtime2),
    installUiTooltipWrapper(runtime2),
    installUiIconButton(runtime2),
    installUiColorSelect(runtime2),
    installEnvironmentColorMode(runtime2),
    installEnvironmentPlatformShortcuts(runtime2),
    installMediaImageCrop(runtime2),
    installMediaImageDownsampling(runtime2),
    installEnvironmentLinks(runtime2),
    installEnvironmentHostCapabilities(runtime2),
    installEnvironmentCompiledPage(runtime2),
    installEnvironmentEmulator(runtime2),
    installMediaAssets(runtime2),
    installMediaVideoLinks(runtime2),
    installMediaEmbeddedPlayerSupport(runtime2),
    installModelSections(runtime2),
    installModelTypeScales(runtime2),
    installModelStyleSchema(runtime2),
    installModelArtifactLinks(runtime2),
    installModelDeck(runtime2),
    installDesignSystemTokens(runtime2),
    installDesignSystemStore(runtime2),
    installCompilerCssValues(runtime2),
    installCompilerHtml(runtime2),
    installModelTypography(runtime2),
    installModelGeometry(runtime2),
    installModelRichTextDom(runtime2),
    installSerializationHtml(runtime2),
    installModelEditing(runtime2),
    installModelSelection(runtime2),
    installFontsCatalog(runtime2),
    installFontsVariants(runtime2),
    installRenderingTheme(runtime2),
    installRenderingArtifactLinkCards(runtime2),
    installModelNavigation(runtime2),
    installModelRichTextCommands(runtime2),
    installEmbedsSanitizer(runtime2),
    installEmbedsRuntimeBridge(runtime2),
    installEmbedsDocument(runtime2),
    installEmbedsFrameHost(runtime2),
    installEmbedsReactFrame(runtime2),
    installRenderingIconFont(runtime2),
    installMediaPlaybackTurn(runtime2),
    installRenderingArtifactLinkCardViews(runtime2),
    installRenderingSlideSnapshots(runtime2),
    installRenderingSlides(runtime2),
    installFontsFetch(runtime2),
    installPresentationBuildEffects(runtime2),
    installFontsReadiness(runtime2),
    installFontsGoogleFontLicences(runtime2),
    installExportFilenames(runtime2),
    installExportEmbedCapture(runtime2),
    installExportReactCapture(runtime2),
    installExportFontTables(runtime2),
    installExportPptx(runtime2),
    installExportPdfWriter(runtime2),
    installExportRenderedSemantics(runtime2),
    installFontsFaceParser(runtime2),
    installFontsInlining(runtime2),
    installExportPdfCapture(runtime2),
    installExportPng(runtime2),
    installExportBackground(runtime2),
    installExportBackgroundPicturesTail(runtime2),
    installExportDeckMeasurement(runtime2),
    installExportFontSubstitution(runtime2),
    installExportGoogleFontCatalog(runtime2),
    installExportGoogleSlidesFonts(runtime2),
    installExportCurrentFonts(runtime2),
    installExportPptxFontEmbedding(runtime2),
    installExportNotesPages(runtime2),
    installExportPicturePptx(runtime2),
    installExportPageRuntime(runtime2),
    installExportImageShrinking(runtime2),
    installExportDeckHtml(runtime2),
    installHostHotReload(runtime2),
    installHostFeatureFlags(runtime2),
    installHostAgentActivity(runtime2),
    installUiEditorBootstrapImports(runtime2),
    installHostFrameBridge(runtime2),
    installHostFrameComposer(runtime2),
    installUiUndoKeys(runtime2),
    installUiCollaboratorTints(runtime2),
    installUiViewportGestures(runtime2),
    installUiDesignProvider(runtime2),
    installUiCommitTextInput(runtime2),
    installUiSidePanels(runtime2),
    installUiContextMenuPopup(runtime2),
    installUiCanvasFocus(runtime2),
    installUiPropertyRows(runtime2),
    installUiSegmentedProperty(runtime2),
    installUiSidesProperty(runtime2),
    installEditorHitTesting(runtime2),
    installEditorMediaCropOverlay(runtime2),
    installEditorMeasurementOverlay(runtime2),
    installEditorDragGeometry(runtime2),
    installUiToolbarControls(runtime2),
    installUiToolbarTabs(runtime2),
    installUiArtifactLoadBoundary(runtime2),
    installUiAgentCursor(runtime2),
    installUiFileDrop(runtime2),
    installUiToasts(runtime2),
    installUiToolbarPopover(runtime2),
    installUiPropertyPopover2(runtime2),
    installUiArtifactToolbar(runtime2),
    installUiToolbarFoot(runtime2),
    installUiArtifactShell(runtime2),
    installHostArtifactText(runtime2),
    installHostClipboardText(runtime2),
    installHostRoomPresence(runtime2),
    installEditorFrameComments(runtime2),
    installHostAgentSession(runtime2),
    installHostHandoffPreference(runtime2),
    installHostBusyHolds(runtime2),
    installHostArtifactClipboard(runtime2),
    installModelComments(runtime2),
    installHostArtifactEditCount(runtime2),
    installHostArtifactPresence(runtime2),
    installHostUserApi(runtime2),
    installUiPeerCursors(runtime2),
    installUiRemoteChangeAnnouncer(runtime2),
    installEditorCommandHistory(runtime2),
    installModelDeckMetadata(runtime2),
    installEditorDeckCommandHistory(runtime2),
    installEditorSlideGestureHistory(runtime2),
    installDesignSystemColorAnalysis(runtime2),
    installUiZoomControl(runtime2),
    installUiFindBar(runtime2),
    installDesignSystemThemeLooks(runtime2),
    installUiArtifactFind(runtime2),
    installEditorDomTextSearch(runtime2),
    installUiFindHighlights(runtime2),
    installUiFindResultIcons(runtime2),
    installModelArtifactStoreRecords(runtime2),
    installEditorFontFaceChoices(runtime2),
    installEditorGestureCursor(runtime2),
    installEditorSlideGeneration(runtime2),
    installUiSessionProperties(runtime2),
    installUiStyleInspector(runtime2),
    installUiBoxQuickPanels(runtime2),
    installUiBoxStyleToolbar(runtime2),
    installUiSelectionActions(runtime2),
    installUiEditContextMenu(runtime2),
    installUiRovingFocus(runtime2),
    installUiScrollbarOverlay(runtime2),
    installEditorChildSizeModes(runtime2),
    installUiInputActivation(runtime2),
    installEditorContrastBackgrounds(runtime2),
    installUiSelectionInspector(runtime2),
    installEditorMediaCropSession(runtime2),
    installEditorGrouping(runtime2),
    installLayoutSelectionGroups(runtime2),
    installLayoutSnapping(runtime2),
    installCreationTiming(runtime2),
    installCollaborationSlidePresence(runtime2),
    installEditorSlideSelection(runtime2),
    installEditorSlideRailMarquee(runtime2),
    installEditorSlideRailLayout(runtime2),
    installEditorSlideMessages(runtime2),
    installEditorSlideRail(runtime2),
    installEditorSlideGrid(runtime2),
    installBridgeFrameViewport(runtime2),
    installCommentsCapability(runtime2),
    installCommentsAnchors(runtime2),
    installCommentsComposer(runtime2),
    installCommentsLabels(runtime2),
    installEditorTouchLongPress(runtime2),
    installEditorCanvas(runtime2),
    installEditorSpeakerNotes(runtime2),
    installEditorShapeIcons(runtime2),
    installEditorDamagedSlide(runtime2),
    installEditorPalette(runtime2),
    installEditorContextMenu(runtime2),
    installEditorClipboard(runtime2),
    installPresentationFullscreen(runtime2),
    installPresentationSlideIndex(runtime2),
    installPresentationAnnouncements(runtime2),
    installPresentationSpeakerProtocol(runtime2),
    installPresentationPhoneRemote(runtime2),
    installPresentationPopouts(runtime2),
    installDocumentsJsonRecords(runtime2),
    installDocumentsCommentRecords(runtime2),
    installDocumentsMigrationMarkers(runtime2),
    installDocumentsSlideCodec(runtime2),
    installPresentationSpeakerPanel(runtime2),
    installPresentationSpeakerSession(runtime2),
    installPresentationAnimationEngine(runtime2),
    installDesignSystemThemePanel(runtime2),
    installPresentationPlayer(runtime2),
    installCreationOverlay(runtime2),
    installEditorSlideTicks(runtime2),
    installCreationController(runtime2),
    installEditorEarlySlide(runtime2),
    installEditorFocusRegions(runtime2),
    installEditorFind(runtime2),
    installEditorChangeAnnouncements(runtime2),
    installCommentsAreaSelection(runtime2),
    installCommentsAreaGeometry(runtime2),
    installCommentsPinGeometry(runtime2),
    installCommentsHitTesting(runtime2),
    installCommentsPin(runtime2),
    installCommentsHighlights(runtime2),
    installCommentsPinOcclusion(runtime2),
    installDesignSystemDeckRestyle(runtime2),
    installCommentsKeyboard(runtime2),
    installCommentsSlideLayer(runtime2),
    installCommentsGridLayer(runtime2),
    installEditorGridNotesClick(runtime2),
    installCollaborationGridCursors(runtime2),
    installCollaborationSelectionRings(runtime2),
    installCollaborationSlideSelection(runtime2),
    installDeliveryShellDownloads(runtime2),
    installDeliveryProvider(runtime2),
    installDeliveryLabels(runtime2),
    installDeliveryBrowserDownload(runtime2),
    installDeliveryPdfOptions(runtime2),
    installDeliveryNotesDialog(runtime2),
    installDeliveryFontSubstitution(runtime2),
    installBridgePageOcclusion(runtime2),
    installEditorDialogs(runtime2),
    installDocumentsEditProtection(runtime2),
    installEditorViewState(runtime2),
    installDocumentsSelfPublish(runtime2),
    installDocumentsArtifactDocument(runtime2),
    installDocumentsRemovedSlides(runtime2),
    installDocumentsDeckStore(runtime2),
    installDocumentsAssetUndo(runtime2),
    installEditorCurrentSlide(runtime2),
    installBridgePlaceLinks(runtime2),
    installEditorTemplates(runtime2),
    installEditorTemplateRestyling(runtime2),
    installDeliveryDialog(runtime2),
    installEditorApp(runtime2),
    installDocumentsWriteAccess(runtime2),
    installBootThumbnailCapture(runtime2),
    installBootStateFile(runtime2),
    installBootLegacyHtml(runtime2),
    installEditorThumbnailApp(runtime2),
    installEditorCoverTitle(runtime2),
    installDocumentsStashRecoveryMessage(runtime2),
    installFilesSlideCodec(runtime2),
    installDesignSystemSystemFonts(runtime2),
    installDesignSystemSlideStyles(runtime2),
    installFilesCrashStash(runtime2),
    installFilesUnsavedSlides(runtime2),
    installFilesUnloadFlush(runtime2),
    installFilesSyncErrorNotifier(runtime2),
    installFilesDesignSystems(runtime2),
    installDesignSystemRestyle(runtime2),
    installFilesProjectPaths(runtime2),
    installFilesSha256(runtime2),
    installFilesPublishInputs(runtime2),
    installFilesReadRetries(runtime2),
    installFilesHotUpdates(runtime2),
    installFilesBootReader(runtime2),
    installFilesSequenceMerge(runtime2),
    installFilesBrowserPort(runtime2),
    installFilesDocumentMerge(runtime2),
    installFilesIndexStore(runtime2),
    installFilesBootRecovery(runtime2),
    installFilesSaveQueue(runtime2),
    installFilesDebugPanel(runtime2),
    installFilesSlideOrderMerge(runtime2),
    installFilesSlidesDocument(runtime2),
    installFilesEarlySlides(runtime2),
    installBootstrap(runtime2)
  ];
  for (let index4 = 0; index4 < initializers.length; index4++) {
    if (options.boot === false && index4 === initializers.length - 1) continue;
    initializers[index4]();
  }
  return runtime2;
}
export const runtime = createSlidesRuntime({boot:false})
