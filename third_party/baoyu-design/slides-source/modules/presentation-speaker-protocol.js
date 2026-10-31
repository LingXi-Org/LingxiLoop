// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationSpeakerProtocol(runtime2) {
  var SPEAKER_NOTES_POPOUT_KEY, SPEAKER_MESSAGE_TITLE_MAX_CHARS, SPEAKER_NOTES_ID_PATTERN;
  function speakerPortLink(port) {
    return {
      post: (message) => port.postMessage(message),
      listen(handler) {
        return port.onmessage = (event) => handler(event.data), () => {
          port.onmessage = null;
        };
      }
    };
  }
  function inertPresentationSiblings(stage) {
    let made = [];
    for (let child of Array.from(stage.ownerDocument.body.children))
      child === stage || child.tagName === "SCRIPT" || child.hasAttribute("inert") || child.hasAttribute("data-base-ui-portal") && child.querySelector('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [data-cds="Toast"]') !== null || (child.setAttribute("inert", ""), made.push(child));
    return () => {
      for (let child of made)
        child.removeAttribute("inert");
    };
  }
  bindRuntimeValue(runtime2, "speakerPortLink", () => speakerPortLink), bindRuntimeValue(runtime2, "inertPresentationSiblings", () => inertPresentationSiblings);
  function parseBoundedInteger(value, min2, max2) {
    return typeof value == "number" && Number.isInteger(value) && value >= min2 && value <= max2 ? value : null;
  }
  function parseSpeakerSlideMessage(value) {
    let message = typeof value == "object" && value !== null ? value : null;
    if (message === null || message.type !== "slide")
      return null;
    let count = parseBoundedInteger(message.count, 1, 1e4);
    if (count === null)
      return null;
    let index4 = parseBoundedInteger(message.index, 0, count - 1);
    if (index4 === null || typeof message.notes != "string")
      return null;
    let state = {
      type: "slide",
      index: index4,
      count,
      notes: (0, runtime2.truncateUtf16Safely)(message.notes, runtime2.maxSlideNotesLength)
    };
    typeof message.next == "string" && message.next.trim() !== "" && (state.next = (0, runtime2.truncateUtf16Safely)(message.next, SPEAKER_MESSAGE_TITLE_MAX_CHARS));
    let value2 = parseBoundedInteger(message.since, 0, Number.MAX_SAFE_INTEGER);
    value2 !== null && (state.since = value2);
    let value3 = parseBoundedInteger(message.step, 0, runtime2.maxBuildOrder);
    return value3 !== null && (state.step = value3), typeof message.canPrev == "boolean" && (state.canPrev = message.canPrev), typeof message.canNext == "boolean" && (state.canNext = message.canNext), state;
  }
  function parseSpeakerExitMessage(value) {
    let message = typeof value == "object" && value !== null ? value : null;
    return message !== null && message.type === "exit" ? {
      type: "exit"
    } : null;
  }
  function parseSpeakerJumpMessage(value) {
    let message = typeof value == "object" && value !== null ? value : null;
    if (message === null || message.type !== "jump")
      return null;
    let index4 = parseBoundedInteger(message.index, 0, 9999);
    return index4 === null ? null : {
      type: "jump",
      index: index4
    };
  }
  function parseSpeakerNotesMessage(value) {
    let message = typeof value == "object" && value !== null ? value : null;
    return message === null || message.type !== "notes" || typeof message.text != "string" || typeof message.id != "string" || !SPEAKER_NOTES_ID_PATTERN.test(message.id) ? null : {
      type: "notes",
      id: message.id,
      text: (0, runtime2.truncateUtf16Safely)(message.text, runtime2.maxSlideNotesLength)
    };
  }
  function parseSpeakerNotesEndMessage(value) {
    let message = typeof value == "object" && value !== null ? value : null;
    return message !== null && message.type === "notes-end" ? {
      type: "notes-end"
    } : null;
  }
  function parseSpeakerNavigateMessage(value) {
    let message = typeof value == "object" && value !== null ? value : null;
    return message === null || message.type !== "nav" ? null : message.delta === 1 || message.delta === -1 ? {
      type: "nav",
      delta: message.delta
    } : null;
  }
  return bindRuntimeValue(runtime2, "SPEAKER_NOTES_POPOUT_KEY", () => SPEAKER_NOTES_POPOUT_KEY, (value) => {
    SPEAKER_NOTES_POPOUT_KEY = value;
  }), bindRuntimeValue(runtime2, "SPEAKER_MESSAGE_TITLE_MAX_CHARS", () => SPEAKER_MESSAGE_TITLE_MAX_CHARS, (value) => {
    SPEAKER_MESSAGE_TITLE_MAX_CHARS = value;
  }), bindRuntimeValue(runtime2, "parseBoundedInteger", () => parseBoundedInteger), bindRuntimeValue(runtime2, "parseSpeakerSlideMessage", () => parseSpeakerSlideMessage), bindRuntimeValue(runtime2, "parseSpeakerExitMessage", () => parseSpeakerExitMessage), bindRuntimeValue(runtime2, "parseSpeakerJumpMessage", () => parseSpeakerJumpMessage), bindRuntimeValue(runtime2, "SPEAKER_NOTES_ID_PATTERN", () => SPEAKER_NOTES_ID_PATTERN, (value) => {
    SPEAKER_NOTES_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "parseSpeakerNotesMessage", () => parseSpeakerNotesMessage), bindRuntimeValue(runtime2, "parseSpeakerNotesEndMessage", () => parseSpeakerNotesEndMessage), bindRuntimeValue(runtime2, "parseSpeakerNavigateMessage", () => parseSpeakerNavigateMessage), () => {
    (0, runtime2.initializeBuildEffects)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeEmbeddedPlayerSupport)(), (0, runtime2.initializeBuildEffects)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSlideRenderer)(), SPEAKER_NOTES_POPOUT_KEY = "speaker-notes", SPEAKER_MESSAGE_TITLE_MAX_CHARS = 120, SPEAKER_NOTES_ID_PATTERN = /^[\w-]{1,64}$/;
  };
}
export {
  installPresentationSpeakerProtocol
};
