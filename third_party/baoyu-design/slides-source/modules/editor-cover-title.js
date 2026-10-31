// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorCoverTitle(runtime2) {
  var ReactCoverTitle, UNTITLED_DECK_TITLE, TITLE_INVISIBLE_CHARACTERS, TITLE_KEPT_FORMAT_CHARACTERS, templateSampleTexts, COVER_TITLE_HOST;
  function coverSlideIdOf(content) {
    return (0, runtime2.chooseThumbnailCoverSlide)(content.order.flatMap((slideId) => {
      let slide = content.slides[slideId];
      return slide === void 0 ? [] : [slide];
    }), content.cover)?.id;
  }
  function collapseTitleWhitespace(text) {
    return text.trim().replace(/\s+/g, " ");
  }
  function normalizeCoverTitleWords(text) {
    return (0, runtime2.normalizeTitleInput)(collapseTitleWhitespace([...text ?? ""].filter((character) => TITLE_KEPT_FORMAT_CHARACTERS.test(character) || !TITLE_INVISIBLE_CHARACTERS.test(character)).join("")));
  }
  function nodeTextRuns(node) {
    return node.kind === "text" ? [collapseTitleWhitespace(node.text)] : ((0, runtime2.nodeChildren)(node) ?? []).flatMap(nodeTextRuns);
  }
  function isTemplateSampleText(text) {
    return templateSampleTexts ??= /* @__PURE__ */ new Set([
      ...runtime2.SLIDE_TEMPLATES.flatMap((template) => template.make().frames.flatMap((frame) => nodeTextRuns(frame.node))),
      "Text"
    ]), templateSampleTexts.has(text);
  }
  function createCoverTitleFollower(doc, host) {
    let disposed = !1, editingSession, attempt = 0, applied;
    function coverSlide(slideId) {
      let content = doc.content();
      return coverSlideIdOf(content) !== slideId ? void 0 : content.slides[slideId];
    }
    function revert() {
      applied !== void 0 && doc.index.get().title === applied.title && (doc.setTitle(UNTITLED_DECK_TITLE), doc.commit("cover title")), applied = void 0;
    }
    function revertIfWordsLeft(slide) {
      applied?.left === !0 && (slide === void 0 || normalizeCoverTitleWords((0, runtime2.slideTitleTextAt)(slide)?.text) !== applied.words) && revert();
    }
    function finish(session) {
      if (doc.readOnly())
        return;
      let slide = coverSlide(session.slide);
      if (slide === void 0 || doc.slideRev(session.slide) !== session.rev || session.at !== void 0 && (0, runtime2.slideTextAtPath)(slide, session.at) === void 0)
        return revertIfWordsLeft(slide);
      let words = normalizeCoverTitleWords((0, runtime2.slideTitleTextAt)(slide)?.text), before = new Set(session.then.frames.flatMap((frame) => nodeTextRuns(frame.node)).map(normalizeCoverTitleWords));
      if (words === "" || before.has(words) || isTemplateSampleText(words))
        return revertIfWordsLeft(slide);
      let current = ++attempt, stillSays = () => {
        let latest = coverSlide(session.slide);
        return latest !== void 0 && normalizeCoverTitleWords((0, runtime2.slideTitleTextAt)(latest)?.text) === words;
      };
      host.isOwner().catch(() => !1).then((owner) => {
        if (disposed || current !== attempt)
          return;
        if (!owner || !stillSays())
          return revert();
        let title = doc.index.get().title ?? "";
        (title === "" || title === UNTITLED_DECK_TITLE || title === applied?.title) && (doc.setTitle(words), applied = { title: doc.index.get().title ?? words, words }), doc.commit("cover title");
        let announce = () => {
          if (!(disposed || current !== attempt)) {
            if (!stillSays())
              return revert();
            if (doc.saveState().status === "error") {
              applied !== void 0 && (applied.left = !0);
              return;
            }
            applied = void 0, host.post({
              __frame_title_from_content: !0,
              title: words,
              ifUnnamed: UNTITLED_DECK_TITLE
            });
          }
        };
        doc.settle().then(announce, () => {
        });
      });
    }
    return {
      editing(slideId) {
        if (slideId === (editingSession?.slide ?? null))
          return;
        let ended = editingSession;
        if (editingSession = void 0, ended !== void 0 && finish(ended), slideId === null)
          return;
        let content = doc.content(), slide = coverSlideIdOf(content) !== slideId ? void 0 : content.slides[slideId];
        if (slide === void 0)
          return;
        let heading = (0, runtime2.slideTitleTextAt)(slide);
        editingSession = {
          slide: slideId,
          then: slide,
          at: heading?.at,
          rev: doc.slideRev(slideId)
        };
      },
      dispose() {
        disposed = !0;
      }
    };
  }
  function hasFilesMembers(doc) {
    return doc.index !== void 0 && doc.settle !== void 0 && doc.commit !== void 0 && doc.slideRev !== void 0;
  }
  function useCoverTitleFromContent(doc, editingSlideId) {
    let followerRef = ReactCoverTitle.useRef(null);
    ReactCoverTitle.useEffect(() => {
      if (!hasFilesMembers(doc))
        return;
      let follower = createCoverTitleFollower(doc, COVER_TITLE_HOST);
      return followerRef.current = follower, () => {
        follower.dispose(), followerRef.current = null;
      };
    }, [doc]), ReactCoverTitle.useEffect(() => followerRef.current?.editing(editingSlideId), [editingSlideId]);
  }
  return bindRuntimeValue(runtime2, "ReactCoverTitle", () => ReactCoverTitle, (value) => {
    ReactCoverTitle = value;
  }), bindRuntimeValue(runtime2, "UNTITLED_DECK_TITLE", () => UNTITLED_DECK_TITLE), bindRuntimeValue(runtime2, "coverSlideIdOf", () => coverSlideIdOf), bindRuntimeValue(runtime2, "collapseTitleWhitespace", () => collapseTitleWhitespace), bindRuntimeValue(runtime2, "normalizeCoverTitleWords", () => normalizeCoverTitleWords), bindRuntimeValue(runtime2, "nodeTextRuns", () => nodeTextRuns), bindRuntimeValue(runtime2, "isTemplateSampleText", () => isTemplateSampleText), bindRuntimeValue(runtime2, "createCoverTitleFollower", () => createCoverTitleFollower), bindRuntimeValue(runtime2, "COVER_TITLE_HOST", () => COVER_TITLE_HOST), bindRuntimeValue(runtime2, "useCoverTitleFromContent", () => useCoverTitleFromContent), () => {
    ReactCoverTitle = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), UNTITLED_DECK_TITLE = "Untitled", TITLE_INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Noncharacter_Code_Point}\u2028\u2029\ufffd\ufff0-\ufff8\u{e0000}-\u{e00ff}\u{e01f0}-\u{e0fff}\u034f\u115f\u1160\u17b4\u17b5\u2065\u2800\u3164\uffa0\ufffc\u{16fe4}\u{1d159}]/u, TITLE_KEPT_FORMAT_CHARACTERS = /[\u200c\u200d\u200e\u200f\u061c]/, COVER_TITLE_HOST = {
      isOwner: runtime2.currentUserIsOwner,
      post: (message) => (0, runtime2.postToHost)(message)
    };
  };
}
export {
  installEditorCoverTitle
};
