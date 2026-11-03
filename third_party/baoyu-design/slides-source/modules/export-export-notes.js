// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportExportNotes(runtime2) {
  var joinFontNames, formatFontFamilyList, formatFontNameList, slideSuffix, altTextSuffix, exportTargetSuffix, exportPageLabel, EXPORT_NOTE_SAYS, exportNote, exportNoteText, hasExportNote, uniqueExportNotes, initializeExportNotes;
  function outcomeReason(outcome, single, afterOthers) {
    switch (outcome) {
      case "heldBack":
        return "for licensing reasons";
      case "noLists":
        return (single ? "its license" : "their licenses") + " could not be checked, which exporting again may fix";
      case "budget":
        return afterOthers ? "there was no room left for " + (single ? "it" : "them") + " after the fonts used by more of the text went in" : (single ? "it" : "they") + " would make the file too large";
      case "send":
        return "with " + (single ? "it" : "them") + " inside, the file would be too large to export this way; “PowerPoint, current fonts” in the deck’s Download menu keeps " + (single ? "it" : "them");
      case "licence":
        return (single ? "its license does" : "their licenses do") + " not allow embedding";
      case "variable":
        return "Google Fonts serves " + (single ? "it as a variable font" : "them as variable fonts") + ", which this file cannot include";
      case "format":
        return (single ? "it is" : "they are") + " not in a format PowerPoint embeds";
      case "unpack":
        return (single ? "its file" : "their files") + " could not be read";
      case "decoder":
        return "this page could not start its font unpacker, which reloading the page may fix";
      case "fetch":
        return (single ? "it" : "they") + " could not be downloaded from Google Fonts";
    }
  }
  function remapNotesPageNote(note, slideNumbers) {
    if (note.code !== "text_past_limit" && note.code !== "text_unread")
      return note;
    let slide = slideNumbers[note.slide - 1];
    if (slide === void 0)
      throw Error("speaker-notes page " + String(note.slide) + " belongs to no slide");
    return exportNote(note.code, {
      slide,
      notesPage: !0
    });
  }
  return bindRuntimeValue(runtime2, "outcomeReason", () => outcomeReason), bindRuntimeValue(runtime2, "remapNotesPageNote", () => remapNotesPageNote), bindRuntimeValue(runtime2, "joinFontNames", () => joinFontNames, (value) => {
    joinFontNames = value;
  }), bindRuntimeValue(runtime2, "formatFontFamilyList", () => formatFontFamilyList, (value) => {
    formatFontFamilyList = value;
  }), bindRuntimeValue(runtime2, "formatFontNameList", () => formatFontNameList, (value) => {
    formatFontNameList = value;
  }), bindRuntimeValue(runtime2, "slideSuffix", () => slideSuffix, (value) => {
    slideSuffix = value;
  }), bindRuntimeValue(runtime2, "altTextSuffix", () => altTextSuffix, (value) => {
    altTextSuffix = value;
  }), bindRuntimeValue(runtime2, "exportTargetSuffix", () => exportTargetSuffix, (value) => {
    exportTargetSuffix = value;
  }), bindRuntimeValue(runtime2, "exportPageLabel", () => exportPageLabel, (value) => {
    exportPageLabel = value;
  }), bindRuntimeValue(runtime2, "EXPORT_NOTE_SAYS", () => EXPORT_NOTE_SAYS, (value) => {
    EXPORT_NOTE_SAYS = value;
  }), bindRuntimeValue(runtime2, "exportNote", () => exportNote, (value) => {
    exportNote = value;
  }), bindRuntimeValue(runtime2, "exportNoteText", () => exportNoteText, (value) => {
    exportNoteText = value;
  }), bindRuntimeValue(runtime2, "hasExportNote", () => hasExportNote, (value) => {
    hasExportNote = value;
  }), bindRuntimeValue(runtime2, "uniqueExportNotes", () => uniqueExportNotes, (value) => {
    uniqueExportNotes = value;
  }), bindRuntimeValue(runtime2, "initializeExportNotes", () => initializeExportNotes, (value) => {
    initializeExportNotes = value;
  }), () => {
    joinFontNames = (names) => names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + String(names[names.length - 1]), formatFontFamilyList = (families) => (families.length === 1 ? "the font " : "the fonts ") + joinFontNames(families), formatFontNameList = (families) => {
      let shown = families.length > 4 ? [
        ...families.slice(0, 3),
        String(families.length - 4 + 1) + " others"
      ] : families;
      return shown.length === 1 ? String(shown[0]) : shown.slice(0, -1).join(", ") + " and " + String(shown[shown.length - 1]);
    }, slideSuffix = (slide) => " (slide " + String(slide) + ")", altTextSuffix = (alt) => ": " + (alt || "（无替代文字）"), exportTargetSuffix = (target) => target.what === "box" ? slideSuffix(target.slide) : altTextSuffix(target.alt), exportPageLabel = (page) => (page.notesPage === !0 ? "the notes page for slide " : "slide ") + String(page.slide), exportNote = (code, ...[args]) => {
      let noteArgs = args ?? {};
      return {
        code,
        ...noteArgs,
        says: EXPORT_NOTE_SAYS[code](noteArgs)
      };
    }, exportNoteText = (note) => typeof note == "string" ? note : "thrown" in note ? note.says + ": " + note.thrown : note.says, hasExportNote = (notes, note) => notes.some((entry) => exportNoteText(entry) === exportNoteText(note)), uniqueExportNotes = (notes) => notes.filter((note, index4) => notes.findIndex((other) => exportNoteText(other) === exportNoteText(note)) === index4), initializeExportNotes = (0, runtime2.initializeOnce)(() => {
      EXPORT_NOTE_SAYS = {
        fonts_unavailable: () => "无法获取某个网页字体；部分文字使用后备字体",
        fonts_over_budget_drawn: () => "幻灯片使用的网页字体过大，无法完整包含；部分文字使用后备字体",
        linked_font_unfetched: () => "无法获取某个链接的网页字体；相关文字将以后备字体导出",
        typeface_file_unfetched: () => "无法获取某个字体文件；相关文字将以后备字体导出",
        image_undecoded: () => "某张图片解码失败，在导出文件中可能显示为空白",
        embed_placeholder: () => "某个网页嵌入无法渲染，已导出为占位图",
        fonts_not_packed: () => "某个网页字体无法包含在文件中；相关文字仅在联网时保留该字体",
        fonts_over_budget_linked: () => "部分网页字体过大，无法包含在文件中；相关文字仅在联网时保留这些字体",
        fonts_late: ({ families, how }) => {
          let someText = "some of " + (families.length === 1 ? "its" : "their") + "文字";
          return formatFontFamilyList(families) + " did not load in time" + (how === "drawn" ? ", so " + someText + " may be drawn in a substitute font or not fit its box" : "; " + someText + " was sized with a substitute font and may not fit its box exactly");
        },
        fonts_missing: ({ families, how }) => {
          let single = families.length === 1, theirText = (single ? "its" : "their") + "文字";
          return formatFontFamilyList(families) + (single ? " was" : " were") + " not available" + (how === "drawn" ? ", so " + theirText + " is drawn in a substitute font and may not fit its box" : "; " + theirText + " was sized with a substitute font and may not fit its box exactly");
        },
        text_past_limit: (page) => exportPageLabel(page) + ": text past 50,000 characters is in the image only and can’t be selected, copied or searched.",
        text_unread: (page) => exportPageLabel(page) + ": its text could not be read, so that slide is an image only; nothing on it can be selected, copied or searched.",
        pictures_reduced: ({ n, mb }) => String(n) + (n === 1 ? " picture was" : " pictures were") + " reduced to fit the " + String(mb) + " MB export limit",
        text_image_fill_plain: ({ slide }) => "image-filled text exported in its plain colour (PowerPoint text takes no picture fill here)" + slideSuffix(slide),
        text_gradient_plain: ({ slide }) => "text gradient exported in its plain colour (a stop color is not converted by the PPTX export)" + slideSuffix(slide),
        text_gradient_radial: ({ slide }) => "radial text gradient exported as a linear ramp (PowerPoint text gradients are linear)" + slideSuffix(slide),
        text_gradient_repeating: ({ slide }) => "repeating text gradient exported as one stretched ramp (PPTX gradients do not repeat)" + slideSuffix(slide),
        text_gradient_runs: ({ slide }) => "gradient text with styled spans or list lines: PowerPoint restarts the ramp in each run, so it reads slightly differently there" + slideSuffix(slide),
        title_plain_box: ({ slide }) => "a title laid over its box as a plain text box instead" + slideSuffix(slide),
        text_and_box_apart: ({ slide }) => "a text and its box exported as two objects, not one" + slideSuffix(slide),
        text_not_written: ({ slide }) => "a text box could not be written to the file and is missing from it" + slideSuffix(slide),
        image_missing_asset: ({ alt }) => "image skipped (missing asset)" + altTextSuffix(alt),
        svg_unrasterized: ({ alt }) => "SVG image skipped (could not rasterize for PowerPoint)" + altTextSuffix(alt),
        image_fit_stretched: ({ fit, alt }) => fit + " exported as stretch — natural dimensions unavailable" + altTextSuffix(alt),
        picture_border_straight: ({ alt }) => "a border that is not the same on all four sides of a picture with rounded or clipped corners exported as straight lines" + altTextSuffix(alt),
        image_not_written: ({ alt }) => "a picture could not be written to the file and is missing from it" + altTextSuffix(alt),
        picture_border_not_written: ({ alt }) => "the border of a picture could not be written to the file" + altTextSuffix(alt),
        border_currentcolor: (target) => target.what + " border skipped (currentcolor is not converted by the PPTX export)" + exportTargetSuffix(target),
        border_color: (target) => target.what + " border skipped (color “" + target.color + "” is not converted by the PPTX export)" + exportTargetSuffix(target),
        border_double: (target) => "double border exported as solid (PPTX lines have no double style)" + exportTargetSuffix(target),
        shadow_inset: (target) => "inset " + target.what + " shadow skipped (PPTX shapes carry outer shadows only)" + exportTargetSuffix(target),
        shadow_color: (target) => target.what + " shadow skipped (color “" + target.color + "” is not converted by the PPTX export)" + exportTargetSuffix(target),
        box_blend: ({ blend, slide }) => "box paint skipped (mix-blend-mode " + blend + " has no PowerPoint equivalent)" + slideSuffix(slide),
        box_gradient_repeating: ({ slide }) => "repeating box gradient exported as one stretched ramp (PPTX gradients do not repeat)" + slideSuffix(slide),
        box_gradient_extent: ({ extent, slide }) => "a radial gradient’s " + extent + " size is not kept in PowerPoint" + slideSuffix(slide),
        box_gradient_skipped: ({ slide }) => "box gradient skipped (a stop color is not converted by the PPTX export)" + slideSuffix(slide),
        box_fill_color: ({ color, slide }) => "box fill skipped (color “" + color + "” is not converted by the PPTX export)" + slideSuffix(slide),
        box_shadow_nothing: ({ slide }) => "box shadow skipped (no fill or outline to cast it)" + slideSuffix(slide),
        box_border_straight: ({ slide }) => "a dashed or dotted border that is not the same on all four sides of a box with rounded or clipped corners exported as straight lines" + slideSuffix(slide),
        box_not_written: ({ slide }) => "a box could not be written to the file" + slideSuffix(slide),
        box_border_not_written: ({ slide }) => "the border of a box could not be written to the file" + slideSuffix(slide),
        table_empty: () => "已跳过表格（截断后没有行）",
        table_rotated: () => "旋转的表格已按未旋转导出（PPTX 表格不支持旋转）",
        table_negative: () => "位于负坐标的表格已导出并限制在幻灯片边缘",
        table_not_written: ({ slide }) => "a table could not be written to the file and is missing from it" + slideSuffix(slide),
        font_left_out: ({ families, why, afterOthers = !1 }) => {
          let reason = outcomeReason(why, families.length === 1, afterOthers);
          return families.length === 1 ? "the font " + families[0] + " is not inside this file (" + reason + "); on a computer without " + families[0] + " installed its text shows in a substitute font" : "the fonts " + formatFontNameList(families) + " are not inside this file (" + reason + "); on a computer without them installed their text shows in a substitute font";
        },
        font_partly_carried: ({ family }) => "this file carries the font " + family + " for only some of the deck’s characters; on a computer without " + family + " installed the rest show in a substitute font",
        font_styles_missing: ({ family }) => "not every style of the font " + family + " is inside this file; on a computer without " + family + " installed, some of its text (bold or italic, say) may show in a substitute font",
        font_other_name: ({ family, name }) => "the font " + family + " is inside this file under another name (“" + name + "”), so PowerPoint may not use it for text set in " + family + "; that text then shows in a substitute font",
        font_swapped: ({ family, standIn, reader }) => reader === "google" ? "Google Slides does not have the font " + family + ", so it shows " + standIn + " instead" : family + " is not on every computer, so this file uses " + standIn + " instead",
        fonts_not_everywhere: ({ families }) => {
          let single = families.length === 1;
          return "not every computer has the font" + (single ? " " : "s ") + formatFontNameList(families) + ", so this file can look different on a computer without " + (single ? "it" : "them") + "; the basic-fonts PowerPoint and the PDF look the same everywhere";
        },
        fonts_unloaded: ({ standIns }) => {
          let families = standIns.map(([family]) => family), faces = [
            ...new Set(standIns.flatMap(([, standInFaces]) => standInFaces))
          ], pairs = standIns.map(([family, standInFaces]) => family + " with " + joinFontNames(standInFaces)), replacement = families.length === 1 || faces.length === 1 ? "uses " + joinFontNames(faces) + " instead" : "replaces " + pairs.slice(0, -1).join(", ") + ", and " + String(pairs[pairs.length - 1]);
          return (families.length === 1 ? "the font " : "the fonts ") + joinFontNames(families) + " did not load on this page, so this file " + replacement + "; to retry, export again in a moment or reload the page";
        },
        backdrops_smaller: ({ scale }) => "slide backgrounds saved at " + scale + " resolution to keep the file small",
        backdrops_missed: ({ slides }) => {
          let several = slides.length > 1, slideList = slides.slice(0, 3).join(", ") + (slides.length > 3 ? " and " + String(slides.length - 3) + " more" : "");
          return "the gradient background" + (several ? "s on slides " : " on slide ") + slideList + (several ? " were not saved as pictures, so they" : " was not saved as a picture, so it") + " may look different in the file";
        },
        fonts_held_back: ({ families }) => formatFontFamilyList(families) + (families.length === 1 ? " is" : " are") + " not included in the file, for licensing reasons; " + (families.length === 1 ? "its text keeps that typeface" : "their text keeps those typefaces") + " only while online",
        fonts_license_check: ({ families }) => formatFontFamilyList(families) + (families.length === 1 ? " is" : " are") + " inside this file; check " + (families.length === 1 ? "its license" : "their licenses") + " before you pass the file on",
        font_only_deck_characters: ({ family }) => "the font " + family + " in this file has only the characters this deck uses; text added later may show in a substitute font"
      };
    });
  };
}
export {
  installExportExportNotes
};
