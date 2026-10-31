// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorFind(runtime2) {
  var SLIDES_FIND_SCOPE_SELECTOR, isSlidesFindScopeTarget, lastInteractionWasInSlidesFindScope, waitForFindHighlightFrame;
  function countNodeFindMatches(node, query) {
    return node.kind === "text" ? node.text.split(`
`).reduce((input, options) => input + (0, runtime2.findTextOffsets)(options, query).length, 0) : node.kind === "table" ? node.rows.reduce((input, options) => input + options.reduce((input2, options2) => input2 + (0, runtime2.findTextOffsets)(options2, query).length, 0), 0) : 0;
  }
  function collectPresentationFindMatches(slides, query) {
    let matches = [];
    if (query === "")
      return matches;
    let addNodeMatches = (input, options, context, value) => {
      let value2 = countNodeFindMatches(context, query);
      for (let index4 = 0; index4 < value2; index4++)
        matches.push({
          key: [input, options, value, index4].join("|"),
          slideId: input,
          frameId: options,
          path: value,
          nth: index4
        });
      (0, runtime2.nodeChildren)(context)?.forEach((input2, options2) => addNodeMatches(input, options, input2, value === "" ? String(options2) : value + "." + String(options2)));
    };
    for (let value of slides)
      for (let value2 of value.frames)
        addNodeMatches(value.id, value2.id, value2.node, "");
    return matches;
  }
  function trackSlidesFindScope(document2) {
    let listener = (event) => {
      let target = event.target;
      target === null || typeof target.closest != "function" || target.closest(runtime2.OPEN_OVERLAY_SELECTOR) !== null || (lastInteractionWasInSlidesFindScope = isSlidesFindScopeTarget(target));
    };
    return document2.addEventListener("pointerdown", listener, !0), document2.addEventListener("keydown", listener, !0), () => {
      document2.removeEventListener("pointerdown", listener, !0), document2.removeEventListener("keydown", listener, !0);
    };
  }
  function canHandleSlidesFindShortcut(target) {
    let element = target;
    return element === null || typeof element.closest != "function" || isSlidesFindScopeTarget(element) ? !0 : element.closest(runtime2.OPEN_OVERLAY_SELECTOR) !== null && lastInteractionWasInSlidesFindScope;
  }
  function createFindHighlightPainter(host) {
    let text = "", callback = (element, options, context) => {
      let value = options.frameId + "|" + options.path, entry = context.get(value);
      if (entry === void 0) {
        let element2 = element.querySelector('[data-frame-id="' + CSS.escape(options.frameId) + '"]'), value2 = element2?.matches('[data-node-path="' + options.path + '"]') ? element2 : element2?.querySelector('[data-node-path="' + options.path + '"]');
        entry = value2 ? (0, runtime2.findDomTextRanges)(value2, text) : [], context.set(value, entry);
      }
      return entry;
    }, callback2 = (input) => {
      for (let value of host.surfaces(input.slideId)) {
        let value2 = callback(value, input, /* @__PURE__ */ new Map())[input.nth];
        if (value2 !== void 0)
          return value2;
      }
    };
    return {
      search(input) {
        return text = input, collectPresentationFindMatches(host.slides(), input);
      },
      async reveal(input, options) {
        if (host.inGrid() ? host.panGridTo(input.slideId) : host.currentId() !== input.slideId && host.showSlide(input.slideId), await waitForFindHighlightFrame(), await waitForFindHighlightFrame(), options.aborted || host.inGrid())
          return;
        let value = callback2(input), value2 = value === void 0 ? null : (0, runtime2.findRangeRectangle)(value), value3 = host.viewport()?.getBoundingClientRect();
        !value2 || !value3 || (value2.right < value3.left || value2.left > value3.right || value2.bottom < value3.top || value2.top > value3.bottom) && (host.returnToFit(), await waitForFindHighlightFrame());
      },
      paint(input, options) {
        let items = [], value = null, entries = /* @__PURE__ */ new Map();
        input.forEach((input2, options2) => {
          for (let value2 of host.surfaces(input2.slideId)) {
            let entry = entries.get(value2);
            entry === void 0 && entries.set(value2, entry = /* @__PURE__ */ new Map());
            let value3 = callback(value2, input2, entry)[input2.nth];
            value3 !== void 0 && (items.push(value3), options2 === options && value === null && (value = value3));
          }
        }), (0, runtime2.setFindHighlights)(document, items, value);
      },
      clear() {
        text = "", (0, runtime2.clearFindHighlights)(document);
      },
      subscribe: (input) => host.subscribe(input),
      describe(input) {
        let value = host.slides().findIndex((input2) => input2.id === input.slideId);
        if (value !== -1)
          return "幻灯片 " + String(value + 1);
      }
    };
  }
  return bindRuntimeValue(runtime2, "countNodeFindMatches", () => countNodeFindMatches), bindRuntimeValue(runtime2, "collectPresentationFindMatches", () => collectPresentationFindMatches), bindRuntimeValue(runtime2, "SLIDES_FIND_SCOPE_SELECTOR", () => SLIDES_FIND_SCOPE_SELECTOR, (value) => {
    SLIDES_FIND_SCOPE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "isSlidesFindScopeTarget", () => isSlidesFindScopeTarget, (value) => {
    isSlidesFindScopeTarget = value;
  }), bindRuntimeValue(runtime2, "lastInteractionWasInSlidesFindScope", () => lastInteractionWasInSlidesFindScope, (value) => {
    lastInteractionWasInSlidesFindScope = value;
  }), bindRuntimeValue(runtime2, "trackSlidesFindScope", () => trackSlidesFindScope), bindRuntimeValue(runtime2, "canHandleSlidesFindShortcut", () => canHandleSlidesFindShortcut), bindRuntimeValue(runtime2, "waitForFindHighlightFrame", () => waitForFindHighlightFrame, (value) => {
    waitForFindHighlightFrame = value;
  }), bindRuntimeValue(runtime2, "createFindHighlightPainter", () => createFindHighlightPainter), () => {
    (0, runtime2.initializeSections)(), (0, runtime2.initializeUiPropertyFocus)(), (0, runtime2.initializeSlideModel)(), SLIDES_FIND_SCOPE_SELECTOR = '[data-appifact-content], .tb-root, [role="complementary"]', isSlidesFindScopeTarget = (element) => element === element.ownerDocument.body || element.closest(SLIDES_FIND_SCOPE_SELECTOR) !== null, lastInteractionWasInSlidesFindScope = !0, waitForFindHighlightFrame = () => new Promise((input) => requestAnimationFrame(() => input()));
  };
}
export {
  installEditorFind
};
