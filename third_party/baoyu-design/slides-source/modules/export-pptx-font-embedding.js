// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPptxFontEmbedding(runtime2) {
  var embeddingDeadlineMs, embeddingBudgetBytes, embeddedFontStyle, subfamilyNames, cleanFontName, reservesFontName, pptxFontNoticePreamble, missingFamiliesNote, uprightFaces, italicFaces, sameBytes, fetchFontText, fetchFontBytes, initializePptxFontEmbedding;
  function outcomeReason(outcome, single, afterOthers = !1) {
    switch (outcome) {
      case "heldBack":
        return "for licensing reasons";
      case "noLists":
        return (single ? "its license" : "their licenses") + " could not be checked, which exporting again may fix";
      case "budget":
        return afterOthers ? "there was no room left for " + (single ? "it" : "them") + " after the fonts used by more of the text went in" : (single ? "it" : "they") + " would make the file too large";
      case "send":
        return "with " + (single ? "it" : "them") + ` inside, the file would be too large to export this way; "PowerPoint, current fonts" in the deck's Download menu keeps ` + (single ? "it" : "them");
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
  function familyOutcomeNotes(entries) {
    let groups = /* @__PURE__ */ new Map();
    for (let { family, outcome, afterOthers = !1 } of entries) {
      let key = outcome + (afterOthers ? "+" : ""), group = groups.get(key) ?? {
        outcome,
        afterOthers,
        families: []
      };
      group.families.push(family), groups.set(key, group);
    }
    return [...groups.values()].map((group) => missingFamiliesNote(group.families, outcomeReason(group.outcome, group.families.length === 1, group.afterOthers) ?? ""));
  }
  function embeddingFaceStyles(family, italicUsed) {
    let known = (0, runtime2.knownFontVariants)(family), styles = [
      ...uprightFaces,
      ...italicUsed ? italicFaces : []
    ].filter((style) => known === void 0 || known.some((variant) => variant.weight === style.weight && variant.italic === style.italic));
    return styles.length > 0 ? styles : [...uprightFaces];
  }
  function deckFontFamilyUse(slides) {
    let uses = /* @__PURE__ */ new Map(), visit = (node) => {
      for (let child of (0, runtime2.nodeChildren)(node) ?? [])
        visit(child);
      if (node.kind !== "text" && node.kind !== "table")
        return;
      let family = node.style?.fontFamily;
      if (typeof family != "object")
        return;
      let italic = node.style?.fontStyle === "italic" || node.kind === "text" && (node.marks ?? []).some((mark) => mark.italic === !0), key = family.family.toLowerCase(), previous = uses.get(key);
      uses.set(key, {
        fallback: previous?.fallback ?? family.fallback,
        italic: (previous?.italic ?? !1) || italic
      });
    };
    for (let slide of slides)
      for (let frame of slide.frames)
        visit(frame.node);
    return uses;
  }
  function fsTypeAllowsEmbedding(fsType) {
    return fsType & 512 ? !1 : fsType & 8 ? !0 : (fsType & 6) === 0;
  }
  function pickUnicodeBlock(faces, codePoints) {
    let covers = (face, codePoint) => face.ranges.some(([first, last]) => codePoint >= first && codePoint <= last), withFiles = faces.filter((face) => face.files[0] !== void 0), wanted = [...codePoints].filter((codePoint) => withFiles.some((face) => covers(face, codePoint))), best;
    for (let face of withFiles) {
      let covered = wanted.filter((codePoint) => covers(face, codePoint)).length;
      (best === void 0 || covered > best.covered) && (best = {
        block: face,
        covered
      });
    }
    return best === void 0 ? void 0 : {
      block: best.block,
      partial: best.covered < wanted.length
    };
  }
  async function unpackWoff2(bytes) {
    let decompress = runtime2.decompressWoff2;
    if (decompress === void 0) {
      let error = Error("woff2 decoder did not start: not installed");
      throw error.name = "DecoderNotStarted", error;
    }
    return decompress(bytes);
  }
  async function fetchGoogleFontResource(url, signal) {
    let response = await fetch(url, {
      signal,
      credentials: "omit"
    });
    if (!response.ok)
      throw Object.assign(Error("fetch " + String(response.status)), {
        status: response.status
      });
    return response;
  }
  async function embedGoogleFontsForPptx(slides, faces, fonts, lists, options = {}) {
    let linked = (0, runtime2.carriedFontFamilyMap)(faces, fonts), requests = [
      ...(0, runtime2.collectGoogleSlidesFontRequests)(slides, linked).values()
    ], empty = {
      fonts: [],
      notes: [],
      licenceText: "",
      requested: !1,
      failures: {}
    };
    if (requests.length === 0)
      return {
        ...empty,
        families: []
      };
    if (lists === null) {
      let families = requests.map((request) => ({
        family: request.family,
        outcome: "noLists"
      }));
      return {
        ...empty,
        families,
        notes: familyOutcomeNotes(families)
      };
    }
    let heldBack = requests.filter((request) => lists.cleared(request.family) === void 0).map((request) => ({
      family: request.family,
      outcome: "heldBack"
    })), cleared = requests.flatMap((request) => {
      let google = lists.cleared(request.family);
      return google === void 0 ? [] : [
        {
          ...request,
          google
        }
      ];
    });
    if (cleared.length === 0)
      return {
        ...empty,
        families: heldBack,
        notes: familyOutcomeNotes(heldBack)
      };
    let uses = deckFontFamilyUse(slides), overall = new AbortController(), overallTimer = setTimeout(() => overall.abort(), options.deadlineMs ?? embeddingDeadlineMs), withTimeout = async (run) => {
      let one = new AbortController(), timer = setTimeout(() => one.abort(), runtime2.resourceFetchTimeoutMs), abortOne = () => one.abort();
      overall.signal.addEventListener("abort", abortOne);
      try {
        if (overall.signal.aborted)
          throw Error("deadline");
        return await run(one.signal);
      } finally {
        clearTimeout(timer), overall.signal.removeEventListener("abort", abortOne);
      }
    }, getText = (url) => withTimeout((signal) => (options.fetchText ?? fetchFontText)(url, signal)), getBytes = (url) => withTimeout((signal) => (options.fetchBytes ?? fetchFontBytes)(url, signal)), unpack = options.unpackWoff2 ?? unpackWoff2, budget = options.budget ?? embeddingBudgetBytes, deadline = new Promise((resolve) => {
      overall.signal.addEventListener("abort", () => resolve("deadline"));
    }), fetchFace = async (request, face) => {
      let stage = "sheet";
      try {
        let picked = pickUnicodeBlock((0, runtime2.parseFontFaceDeclarations)(await getText((0, runtime2.googleFontStylesheetUrl)(request.google, face))), request.codePoints);
        if (picked === void 0)
          return {
            face,
            failed: "fetch",
            fetch: {
              sheet: !0,
              network: !0
            }
          };
        stage = "file";
        let data = await getBytes(picked.block.files[0]), packed = (0, runtime2.readFontTables)(data);
        if (packed.flavor === "woff2") {
          if ((packed.extent ?? 0) > budget)
            return {
              face,
              failed: "budget"
            };
          try {
            data = await unpack(data);
          } catch (error) {
            return {
              face,
              failed: error instanceof Error && error.name === "DecoderNotStarted" ? "decoder" : "unpack"
            };
          }
        }
        let info = (0, runtime2.readFontTables)(data);
        return info.flavor !== "truetype" || !info.tables.includes("glyf") || info.os2 === void 0 ? {
          face,
          failed: "format"
        } : (info.extent !== void 0 && info.extent < data.byteLength && (data = data.subarray(0, info.extent)), info.tables.includes("fvar") ? {
          face,
          failed: "variable"
        } : fsTypeAllowsEmbedding(info.os2.fsType) ? {
          face,
          data,
          partial: picked.partial,
          names: info.names
        } : {
          face,
          failed: "licence"
        });
      } catch (error) {
        if (stage === "sheet" && (face.weight !== 400 || face.italic) && (0, runtime2.isNonRetryableFetchError)(error))
          return {
            face,
            absent: !0
          };
        let failures2 = {};
        return overall.signal.aborted ? failures2.deadline = !0 : failures2[stage] = failures2[(0, runtime2.fetchFailureKind)(error)] = !0, {
          face,
          failed: "fetch",
          fetch: failures2
        };
      }
    }, results = await Promise.all(cleared.map(async (request) => ({
      use: request,
      got: await Promise.all(embeddingFaceStyles(request.family, uses.get(request.family.toLowerCase())?.italic === !0).map(async (face) => {
        let result = await Promise.race([
          fetchFace(request, face),
          deadline
        ]);
        return result === "deadline" ? {
          face,
          failed: "fetch",
          fetch: {
            deadline: !0
          }
        } : result;
      }))
    })));
    clearTimeout(overallTimer), results.sort((left, right) => right.use.text.length - left.use.text.length);
    let carriedFonts = [], outcomes = [], missing2 = [], notes = [], failures = {}, used = 0;
    for (let { use, got } of results) {
      let faces2 = [];
      for (let attempt of got)
        "data" in attempt && !faces2.some((face) => sameBytes(face.data, attempt.data)) && faces2.push(attempt);
      let size4 = faces2.reduce((sum, face) => sum + face.data.byteLength, 0), failed = got.flatMap((attempt) => "failed" in attempt ? [attempt.failed] : []);
      if (faces2.length === 0 || used + size4 > budget) {
        let outcome = faces2.length > 0 ? "budget" : ["budget", "licence", "variable", "format", "decoder", "unpack"].find((input) => failed.includes(input)) ?? "fetch";
        if (missing2.push({
          family: use.family,
          outcome,
          afterOthers: outcome === "budget" && used > 0
        }), outcomes.push({
          family: use.family,
          outcome
        }), outcome === "fetch")
          for (let attempt of got)
            "fetch" in attempt && Object.assign(failures, attempt.fetch);
        continue;
      }
      used += size4, outcomes.push({
        family: use.family,
        outcome: "carried"
      });
      let otherNames = [];
      for (let face of faces2) {
        let style = embeddedFontStyle(face.face), matches = (face.names.family ?? "").toLowerCase() === use.family.toLowerCase() && (face.names.subfamily ?? "").toLowerCase() === subfamilyNames[style].toLowerCase(), data = face.data;
        matches || (reservesFontName(face.names) || (data = (0, runtime2.renameFontFace)(face.data, use.family, subfamilyNames[style], {
          bold: style === "bold" || style === "boldItalic",
          italic: style === "italic" || style === "boldItalic"
        })), data === face.data && otherNames.push(cleanFontName(face.names.full ?? face.names.family ?? ""))), carriedFonts.push({
          typeface: use.family,
          style,
          fallback: uses.get(use.family.toLowerCase())?.fallback ?? "sans",
          data
        });
      }
      faces2.some((face) => face.partial) && notes.push("this file carries the font " + use.family + " for only some of the deck's characters; on a computer without " + use.family + " installed the rest show in a substitute font"), failed.length > 0 && notes.push("not every style of the font " + use.family + " is inside this file; on a computer without " + use.family + " installed, some of its text (bold or italic, say) may show in a substitute font");
      let names = [...new Set(otherNames.filter((name) => name !== ""))];
      names.length > 0 && notes.push("the font " + use.family + ' is inside this file under another name ("' + names[0] + '"), so PowerPoint may not use it for text set in ' + use.family + "; that text then shows in a substitute font");
    }
    let carriedGoogle = results.flatMap(({ use }) => outcomes.some((outcome) => outcome.family === use.family && outcome.outcome === "carried") ? [use.google] : []);
    return {
      fonts: carriedFonts,
      families: [...outcomes, ...heldBack],
      notes: [...familyOutcomeNotes([...missing2, ...heldBack]), ...notes],
      licenceText: (0, runtime2.googleFontNoticeText)(pptxFontNoticePreamble, lists.noticesOf(carriedGoogle)),
      requested: !0,
      failures
    };
  }
  function leaveOutCarriedFonts(embedding) {
    return embedding.families.some((family) => family.outcome === "carried") ? {
      ...embedding,
      fonts: [],
      families: embedding.families.map((family) => family.outcome === "carried" ? {
        ...family,
        outcome: "budget"
      } : family),
      notes: familyOutcomeNotes(embedding.families.map((family) => ({
        family: family.family,
        outcome: family.outcome === "carried" ? "send" : family.outcome
      }))),
      licenceText: ""
    } : embedding;
  }
  return bindRuntimeValue(runtime2, "embedGoogleFontsForPptx", () => embedGoogleFontsForPptx), bindRuntimeValue(runtime2, "leaveOutCarriedFonts", () => leaveOutCarriedFonts), bindRuntimeValue(runtime2, "pptxFontNoticePreamble", () => pptxFontNoticePreamble, (value) => {
    pptxFontNoticePreamble = value;
  }), bindRuntimeValue(runtime2, "initializePptxFontEmbedding", () => initializePptxFontEmbedding, (value) => {
    initializePptxFontEmbedding = value;
  }), () => {
    embeddingDeadlineMs = 1e4, embeddingBudgetBytes = 4194304, embeddedFontStyle = (face) => face.weight >= 600 ? face.italic ? "boldItalic" : "bold" : face.italic ? "italic" : "regular", cleanFontName = (name) => name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 80), reservesFontName = (names) => /with\s+reserved\s+font\s+names?/i.test((names.copyright ?? "") + " " + (names.licence ?? "")), missingFamiliesNote = (families, reason) => families.length === 1 ? "the font " + families[0] + " is not inside this file (" + reason + "); on a computer without " + families[0] + " installed its text shows in a substitute font" : "the fonts " + (0, runtime2.formatFontNameList)(families) + " are not inside this file (" + reason + "); on a computer without them installed their text shows in a substitute font", sameBytes = (left, right) => left.byteLength === right.byteLength && left.every((value, index4) => value === right[index4]), fetchFontText = async (url, signal) => (await fetchGoogleFontResource(url, signal)).text(), fetchFontBytes = async (url, signal) => new Uint8Array(await (await fetchGoogleFontResource(url, signal)).arrayBuffer()), initializePptxFontEmbedding = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeFontVariants)(), (0, runtime2.initializeGoogleFontLicences)(), (0, runtime2.initializeFontFetching)(), (0, runtime2.initializeFontFaceParser)(), (0, runtime2.initializeFontTables)(), (0, runtime2.initializeGoogleSlidesFonts)(), subfamilyNames = {
        regular: "Regular",
        bold: "Bold",
        italic: "Italic",
        boldItalic: "粗斜体"
      }, pptxFontNoticePreamble = "The font files embedded in this presentation (stored inside it under ppt/fonts/) are files Google Fonts served when the presentation was exported, unpacked from WOFF2 to TrueType and wrapped as Embedded OpenType, the form PowerPoint reads. A file that named another cut of its family, unless it reserves that name, was also changed where it could be, so that PowerPoint matches it to this presentation’s text: its family and style names and the weight and style it declares were rewritten, and any digital signature, which no longer matched, was removed. Google Fonts serves each family in parts, one file per range of characters, so these may not be a family’s complete files. Each family’s copyright lines and license follow, and each family stays under its own license; if you pass this file on, keep these notices with it.", uprightFaces = [
        {
          weight: 400,
          italic: !1
        },
        {
          weight: 700,
          italic: !1
        }
      ], italicFaces = [
        {
          weight: 400,
          italic: !0
        },
        {
          weight: 700,
          italic: !0
        }
      ];
    });
  };
}
export {
  installExportPptxFontEmbedding
};
