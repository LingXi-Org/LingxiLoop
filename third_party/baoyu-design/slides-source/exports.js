// Complete export pipeline, loaded on first export. Reuses the live editor runtime.
import { installExportEmbedCapture } from './modules/export-embed-capture.js'
import { installExportReactCapture } from './modules/export-react-capture.js'
import { installExportFontTables } from './modules/export-font-tables.js'
import { installExportPptx } from './modules/export-pptx.js'
import { installExportPdfWriter } from './modules/export-pdf-writer.js'
import { installExportRenderedSemantics } from './modules/export-rendered-semantics.js'
import { installExportPdfCapture } from './modules/export-pdf-capture.js'
import { installExportPng } from './modules/export-png.js'
import { installExportBackground } from './modules/export-background.js'
import { installExportBackgroundPicturesTail } from './modules/export-background-pictures-tail.js'
import { installExportDeckMeasurement } from './modules/export-deck-measurement.js'
import { installExportFontSubstitution } from './modules/export-font-substitution.js'
import { installExportGoogleFontCatalog } from './modules/export-google-font-catalog.js'
import { installExportGoogleSlidesFonts } from './modules/export-google-slides-fonts.js'
import { installExportCurrentFonts } from './modules/export-current-fonts.js'
import { installExportPptxFontEmbedding } from './modules/export-pptx-font-embedding.js'
import { installExportNotesPages } from './modules/export-notes-pages.js'
import { installExportPicturePptx } from './modules/export-picture-pptx.js'
import { installExportPageRuntime } from './modules/export-page-runtime.js'
import { installExportImageShrinking } from './modules/export-image-shrinking.js'
import { installExportDeckHtml } from './modules/export-deck-html.js'

export function installExportModules(runtime) {
  const initializers = [
    installExportEmbedCapture(runtime),
    installExportReactCapture(runtime),
    installExportFontTables(runtime),
    installExportPptx(runtime),
    installExportPdfWriter(runtime),
    installExportRenderedSemantics(runtime),
    installExportPdfCapture(runtime),
    installExportPng(runtime),
    installExportBackground(runtime),
    installExportBackgroundPicturesTail(runtime),
    installExportDeckMeasurement(runtime),
    installExportFontSubstitution(runtime),
    installExportGoogleFontCatalog(runtime),
    installExportGoogleSlidesFonts(runtime),
    installExportCurrentFonts(runtime),
    installExportPptxFontEmbedding(runtime),
    installExportNotesPages(runtime),
    installExportPicturePptx(runtime),
    installExportPageRuntime(runtime),
    installExportImageShrinking(runtime),
    installExportDeckHtml(runtime),
  ]
  for (const initialize of initializers) initialize()
}
