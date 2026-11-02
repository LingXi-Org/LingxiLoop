// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorDamagedSlide(runtime2) {
  var ReactDamagedSlide, DIAGNOSTIC_SLIDE_ID_PATTERN, SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS, DamagedSlideJsx, DAMAGED_SLIDE_MESSAGE, UNREADABLE_SLIDE_MESSAGE, SLIDE_REPAIR_REQUEST_TIMEOUT_MS, VIEW_ONLY_SLIDE_REPAIR_MESSAGE;
  function buildSlideDiagnosticRequest({ slideId, scope }, perspective, readFailed) {
    let quotedId = DIAGNOSTIC_SLIDE_ID_PATTERN.test(slideId) ? "`" + slideId + "`" : null, value = scope !== void 0 && scope !== "" ? "the slide " + (quotedId ?? "on screen") + " of the deck " + (perspective === "I" ? "I have" : "the viewer has") + " open in this page" + (DIAGNOSTIC_SLIDE_ID_PATTERN.test(scope) ? " (deck `" + scope + "`)" : "") : quotedId !== null ? "`slides/" + slideId + "`" : "the slide on screen";
    return readFailed ? perspective + " can’t see or edit one slide of " + (perspective === "I" ? "my Slides deck" : "this deck") + " in the page: the page’s editor failed while reading the document saved for " + value + " (its `html` may still follow every rule of the slide format), so the page shows the slide blank and keeps it read-only. Please read that document and write it back as an update of its `html` with a simpler structure, its elements nested less deeply, while keeping all of the slide’s content and appearance and staying within the slide format’s rules (the Slides instructions for this deck list them). The page has not changed the document, and the slide is editable again as soon as a version the editor can read lands." : perspective + " can’t edit one slide of " + (perspective === "I" ? "my Slides deck" : "this deck") + " in the page: the document saved for " + value + " can’t be read as a slide (its `html` breaks a rule of the slide format, or is missing), so the page shows only what it could read and keeps the slide read-only. The page’s diagnostic comes with this message; a line:col in it counts within that `html` string. Please read that document, fix only that problem while keeping all of the slide’s content and appearance and staying within the slide format’s rules (the Slides instructions for this deck list them), and write it back as an update of its `html`. If one slide cannot hold all of that content within those rules, put what no longer fits on new slides right after this one. The page has not changed the document, and the slide is editable again as soon as a valid one lands.";
  }
  function buildSlideRepairPrompt(context, diagnostic) {
    let deckTitleLine = context.deckTitle !== void 0 && context.deckTitle.trim() !== "" ? `

The deck’s title, from its saved document:
` + (0, runtime2.wrapUntrustedArtifactText)("deck title", (0, runtime2.safeArtifactLabel)(context.deckTitle)) : "";
    return diagnostic === runtime2.SLIDE_READ_FAILED_DIAGNOSTIC ? buildSlideDiagnosticRequest(context, "I", !0) + deckTitleLine : buildSlideDiagnosticRequest(context, "I", !1) + deckTitleLine + `

` + (0, runtime2.wrapUntrustedArtifactText)("diagnostic text from the page (it can quote the slide’s own content)", (0, runtime2.truncateUtf16Safely)(diagnostic, SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS));
  }
  function askAgentToRepairSlide(context, diagnostic, triggerElement) {
    let prompt = buildSlideRepairPrompt(context, diagnostic);
    return triggerElement === null ? (0, runtime2.suggestPromptOrCopy)(prompt) : (0, runtime2.sendOrSuggestToAgent)({
      selection: {
        label: "幻灯片问题",
        text: (0, runtime2.truncateUtf16Safely)(diagnostic, SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS)
      },
      request: buildSlideDiagnosticRequest(context, "The viewer", diagnostic === runtime2.SLIDE_READ_FAILED_DIAGNOSTIC),
      fallbackPrompt: prompt
    }, triggerElement);
  }
  function DamagedSlideNotice({ slideId, scope, deckTitle, reason, diagnostic, canAsk, className }) {
    let ref = ReactDamagedSlide.useRef(null), ref2 = ReactDamagedSlide.useRef(!0), ref3 = ReactDamagedSlide.useRef(0), ref4 = ReactDamagedSlide.useRef(0), [value, value2] = ReactDamagedSlide.useState(!1), [value3, value4] = ReactDamagedSlide.useState(null), callback = ReactDamagedSlide.useCallback(() => {
      let value6 = ++ref4.current;
      (0, runtime2.availableAgentSessionRoom)().then((input) => {
        ref2.current && value6 === ref4.current && (ref.current = input);
      });
    }, []);
    ReactDamagedSlide.useEffect(() => {
      ref2.current = !0, canAsk && callback();
      let value6 = canAsk ? setInterval(callback, SLIDE_REPAIR_REQUEST_TIMEOUT_MS) : void 0;
      return () => {
        ref2.current = !1, ref.current = null, value6 !== void 0 && clearInterval(value6);
      };
    }, [canAsk, callback]), ReactDamagedSlide.useEffect(() => {
      ref3.current++, value2(!1), value4(null);
    }, [slideId, diagnostic]);
    async function value5() {
      if (value)
        return;
      value2(!0);
      let value6 = ++ref3.current, state = {
        slideId,
        ...scope !== void 0 ? {
          scope
        } : {},
        ...deckTitle !== void 0 ? {
          deckTitle
        } : {}
      }, value7 = await askAgentToRepairSlide(state, diagnostic, ref.current);
      (0, runtime2.showToast)((0, runtime2.agentSendResultMessage)(value7)), !(!ref2.current || value6 !== ref3.current) && (value2(!1), value4(value7 === "failed" ? buildSlideRepairPrompt(state, diagnostic) : null), value7 !== "staged" && callback());
    }
    return DamagedSlideJsx.jsxs("div", {
      "data-testid": "slides-held-notice",
      className,
      children: [
        DamagedSlideJsx.jsxs(runtime2.Callout, {
          variant: "warning",
          role: "none",
          actionAlign: "center",
          action: canAsk ? DamagedSlideJsx.jsx(runtime2.Button, {
            variant: "secondary",
            busy: value,
            onPointerEnter: callback,
            onFocus: callback,
            onClick: () => void value5(),
            "data-testid": "slides-held-ask",
            children: "请助手修复"
          }) : void 0,
          children: [
            (diagnostic === runtime2.SLIDE_READ_FAILED_DIAGNOSTIC ? UNREADABLE_SLIDE_MESSAGE : DAMAGED_SLIDE_MESSAGE) + (canAsk ? "" : " " + VIEW_ONLY_SLIDE_REPAIR_MESSAGE),
            diagnostic === runtime2.SLIDE_READ_FAILED_DIAGNOSTIC ? null : DamagedSlideJsx.jsx("span", {
              className: "block select-text break-words text-fg-secondary",
              children: "详情：" + reason
            })
          ]
        }),
        value3 !== null ? DamagedSlideJsx.jsxs("div", {
          className: "mt-1.5 flex flex-col gap-1",
          children: [
            DamagedSlideJsx.jsx("p", {
              className: "text-xs text-fg-muted",
              children: "将以下内容发送给助手："
            }),
            DamagedSlideJsx.jsx("pre", {
              className: "select-text max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-wash-1 p-2 text-[11px] leading-snug text-fg-secondary",
              children: value3
            })
          ]
        }) : null
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ReactDamagedSlide", () => ReactDamagedSlide, (value) => {
    ReactDamagedSlide = value;
  }), bindRuntimeValue(runtime2, "DIAGNOSTIC_SLIDE_ID_PATTERN", () => DIAGNOSTIC_SLIDE_ID_PATTERN, (value) => {
    DIAGNOSTIC_SLIDE_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS", () => SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS, (value) => {
    SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS = value;
  }), bindRuntimeValue(runtime2, "buildSlideDiagnosticRequest", () => buildSlideDiagnosticRequest), bindRuntimeValue(runtime2, "buildSlideRepairPrompt", () => buildSlideRepairPrompt), bindRuntimeValue(runtime2, "askAgentToRepairSlide", () => askAgentToRepairSlide), bindRuntimeValue(runtime2, "UNREADABLE_SLIDE_MESSAGE", () => UNREADABLE_SLIDE_MESSAGE, (value) => {
    UNREADABLE_SLIDE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "DamagedSlideJsx", () => DamagedSlideJsx, (value) => {
    DamagedSlideJsx = value;
  }), bindRuntimeValue(runtime2, "DAMAGED_SLIDE_MESSAGE", () => DAMAGED_SLIDE_MESSAGE, (value) => {
    DAMAGED_SLIDE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "SLIDE_REPAIR_REQUEST_TIMEOUT_MS", () => SLIDE_REPAIR_REQUEST_TIMEOUT_MS, (value) => {
    SLIDE_REPAIR_REQUEST_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "VIEW_ONLY_SLIDE_REPAIR_MESSAGE", () => VIEW_ONLY_SLIDE_REPAIR_MESSAGE, (value) => {
    VIEW_ONLY_SLIDE_REPAIR_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "DamagedSlideNotice", () => DamagedSlideNotice), () => {
    (0, runtime2.initializeUiInputs210)(), ReactDamagedSlide = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), DIAGNOSTIC_SLIDE_ID_PATTERN = /^[\w-]{1,64}$/, SLIDE_DIAGNOSTIC_SELECTION_MAX_CHARS = 600, DamagedSlideJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), DAMAGED_SLIDE_MESSAGE = "This slide can’t be edited right now. Its saved content has a problem, so part of it may be hidden. What was saved is still there.", UNREADABLE_SLIDE_MESSAGE = "This slide can’t be shown or edited, because the editor couldn’t read it. What was saved is still there.", SLIDE_REPAIR_REQUEST_TIMEOUT_MS = 1e4, VIEW_ONLY_SLIDE_REPAIR_MESSAGE = "Someone who can edit this presentation can ask the agent to fix the slide.";
  };
}
export {
  installEditorDamagedSlide
};
