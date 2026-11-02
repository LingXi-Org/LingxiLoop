// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostAgentSession(runtime2) {
  var SEND_TO_AGENT_METHOD, CAN_SEND_TO_AGENT_METHOD, CLAUDE_SELECTION_TEXT_MAX, CLAUDE_SELECTION_LABEL_MAX, CLAUDE_REQUEST_MAX, CLAUDE_PAYLOAD_MAX, CLAUDE_SEND_TIMEOUT_MS, AgentRequestTimeoutError, UNSAFE_CLAUDE_REQUEST_CHARACTERS, sanitizeAgentRequest, selectionTruncationNote, SELECTION_TRUNCATION_NOTE_PATTERN, SELECTION_TRUNCATION_NOTE_RESERVE, agentPayloadLength, jsxKd;
  function objectProperty(value, key) {
    if (typeof value == "object" && value !== null)
      return value[key];
  }
  function resolvePromptSuggestion(environment = globalThis) {
    let value = objectProperty(objectProperty(environment, "slidesHost"), "chat"), value2 = objectProperty(value, "suggestPrompt");
    if (typeof value2 == "function")
      return async (input) => {
        await value2.call(value, input);
      };
  }
  function withAgentRequestTimeout(promise, timeoutMs) {
    return new Promise((input, options) => {
      let value = setTimeout(() => options(new AgentRequestTimeoutError("timeout")), timeoutMs);
      promise.then((input2) => (clearTimeout(value), input(input2)), (input2) => (clearTimeout(value), options(input2)));
    });
  }
  function fitAgentPayload(payload) {
    let value = payload;
    for (let index4 = 0; index4 < 8 && value.selectedText !== void 0; index4++) {
      let value2 = agentPayloadLength(value) - CLAUDE_PAYLOAD_MAX;
      if (value2 <= 0)
        break;
      let { selectedText: value3, ...value4 } = value, value5 = value3.replace(SELECTION_TRUNCATION_NOTE_PATTERN, ""), value6 = agentPayloadLength(value5) / Math.max(1, value5.length), value7 = value5.length - Math.ceil((value2 + SELECTION_TRUNCATION_NOTE_RESERVE) / Math.max(1, value6)), value8 = value7 > 0 ? (0, runtime2.truncateUtf16Safely)(value5, value7) : "";
      value = value8.length > 0 ? {
        ...value4,
        selectedText: value8 + selectionTruncationNote(value8.length)
      } : value4;
    }
    return value;
  }
  function roomWithSendCapability(room) {
    return typeof objectProperty(room, SEND_TO_AGENT_METHOD) == "function" ? room : null;
  }
  function availableAgentSessionRoom(options = {}) {
    return resolveAgentSessionCapability(options, (input, options2) => options2 === "available" ? input : null);
  }
  async function resolveAgentSessionCapability(options, resolveResult) {
    try {
      let value = options.resolveRoom ?? runtime2.resolveHostRoom, value2 = roomWithSendCapability(await value());
      if (!value2)
        return null;
      let value3 = value2[CAN_SEND_TO_AGENT_METHOD];
      return typeof value3 != "function" ? null : resolveResult(value2, await value3.call(value2));
    } catch {
      return null;
    }
  }
  async function sendOrSuggestToAgent(options, room, environment = globalThis, copyText = runtime2.copyTextToClipboard) {
    let value = await trySendToAgentSession(options, room, (input) => !(options.deliver === "send" && input === "rate_limited"));
    return value !== null ? value === "started" ? "staged" : value : suggestPromptOrCopy(options.fallbackPrompt, environment, copyText);
  }
  function callSendToAgent(room, payload, options) {
    let roomOptions = {
      ...options.deliver === "send" ? {
        deliver: options.deliver,
        ...options.onStatus ? { onStatus: options.onStatus } : {}
      } : {},
      ...options.attachPresence === !1 ? { attachPresence: !1 } : {}
    };
    return Object.keys(roomOptions).length === 0 ? room[SEND_TO_AGENT_METHOD](payload) : room[SEND_TO_AGENT_METHOD](payload, roomOptions);
  }
  function isAgentSessionDestination(result) {
    let value = objectProperty(result, "to");
    return value === "session" || value === "new";
  }
  async function trySendToAgentSession(options, room, acceptStatus) {
    let value = sanitizeAgentRequest(options.request, Number.MAX_SAFE_INTEGER);
    if (room && value.length <= CLAUDE_REQUEST_MAX) {
      let value2 = null;
      try {
        let value3 = options.selection?.label?.trim(), value4 = options.selection ? sanitizeAgentRequest(options.selection.text, Number.MAX_SAFE_INTEGER) : "", value5 = value4.length <= CLAUDE_SELECTION_TEXT_MAX ? value4 : (0, runtime2.truncateUtf16Safely)(value4, CLAUDE_SELECTION_TEXT_MAX) + selectionTruncationNote((0, runtime2.truncateUtf16Safely)(value4, CLAUDE_SELECTION_TEXT_MAX).length), value6 = fitAgentPayload({
          ...value3 ? {
            label: sanitizeAgentRequest(value3, CLAUDE_SELECTION_LABEL_MAX)
          } : {},
          ...value4.trim() !== "" ? {
            selectedText: value5
          } : {},
          request: value
        });
        value2 = value4.trim() === "" || value6.selectedText !== void 0 ? callSendToAgent(room, value6, options) : null;
      } catch {
        value2 = null;
      }
      if (value2)
        try {
          let value3 = await withAgentRequestTimeout(value2, CLAUDE_SEND_TIMEOUT_MS);
          return options.deliver === "send" && isAgentSessionDestination(value3) ? "started" : "staged";
        } catch (value3) {
          if (value3 instanceof AgentRequestTimeoutError || !acceptStatus(objectProperty(value3, "code")))
            return "unanswered";
        }
    }
    return null;
  }
  async function suggestPromptOrCopy(prompt, environment = globalThis, copyText = runtime2.copyTextToClipboard) {
    let value = resolvePromptSuggestion(environment);
    if (value)
      try {
        return await value(prompt), "staged";
      } catch {
      }
    return await copyText(prompt) ? "copied" : "failed";
  }
  function agentSendResultMessage(result, suffix = "") {
    switch (result) {
      case "staged":
      case "waiting":
        return "Added to your message to the agent. Send it when you're ready." + suffix;
      case "unanswered":
        return "Couldn't reach the agent just now. Try again in a moment.";
      case "sent":
        return "Sent to the agent." + suffix;
      case "started":
        return "Sending to the agent…" + suffix;
      case "copied":
        return "Prompt copied. Paste it to the agent." + suffix;
      case "failed":
        return "Couldn't copy the prompt. Try again, or copy the text yourself.";
    }
  }
  return bindRuntimeValue(runtime2, "objectProperty", () => objectProperty), bindRuntimeValue(runtime2, "resolvePromptSuggestion", () => resolvePromptSuggestion), bindRuntimeValue(runtime2, "SEND_TO_AGENT_METHOD", () => SEND_TO_AGENT_METHOD, (value) => {
    SEND_TO_AGENT_METHOD = value;
  }), bindRuntimeValue(runtime2, "CAN_SEND_TO_AGENT_METHOD", () => CAN_SEND_TO_AGENT_METHOD, (value) => {
    CAN_SEND_TO_AGENT_METHOD = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_SELECTION_TEXT_MAX", () => CLAUDE_SELECTION_TEXT_MAX, (value) => {
    CLAUDE_SELECTION_TEXT_MAX = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_SELECTION_LABEL_MAX", () => CLAUDE_SELECTION_LABEL_MAX, (value) => {
    CLAUDE_SELECTION_LABEL_MAX = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_REQUEST_MAX", () => CLAUDE_REQUEST_MAX, (value) => {
    CLAUDE_REQUEST_MAX = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_PAYLOAD_MAX", () => CLAUDE_PAYLOAD_MAX, (value) => {
    CLAUDE_PAYLOAD_MAX = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_SEND_TIMEOUT_MS", () => CLAUDE_SEND_TIMEOUT_MS, (value) => {
    CLAUDE_SEND_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "AgentRequestTimeoutError", () => AgentRequestTimeoutError, (value) => {
    AgentRequestTimeoutError = value;
  }), bindRuntimeValue(runtime2, "withAgentRequestTimeout", () => withAgentRequestTimeout), bindRuntimeValue(runtime2, "UNSAFE_CLAUDE_REQUEST_CHARACTERS", () => UNSAFE_CLAUDE_REQUEST_CHARACTERS, (value) => {
    UNSAFE_CLAUDE_REQUEST_CHARACTERS = value;
  }), bindRuntimeValue(runtime2, "sanitizeAgentRequest", () => sanitizeAgentRequest, (value) => {
    sanitizeAgentRequest = value;
  }), bindRuntimeValue(runtime2, "selectionTruncationNote", () => selectionTruncationNote, (value) => {
    selectionTruncationNote = value;
  }), bindRuntimeValue(runtime2, "SELECTION_TRUNCATION_NOTE_PATTERN", () => SELECTION_TRUNCATION_NOTE_PATTERN, (value) => {
    SELECTION_TRUNCATION_NOTE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "SELECTION_TRUNCATION_NOTE_RESERVE", () => SELECTION_TRUNCATION_NOTE_RESERVE, (value) => {
    SELECTION_TRUNCATION_NOTE_RESERVE = value;
  }), bindRuntimeValue(runtime2, "agentPayloadLength", () => agentPayloadLength, (value) => {
    agentPayloadLength = value;
  }), bindRuntimeValue(runtime2, "fitAgentPayload", () => fitAgentPayload), bindRuntimeValue(runtime2, "roomWithSendCapability", () => roomWithSendCapability), bindRuntimeValue(runtime2, "availableAgentSessionRoom", () => availableAgentSessionRoom), bindRuntimeValue(runtime2, "resolveAgentSessionCapability", () => resolveAgentSessionCapability), bindRuntimeValue(runtime2, "sendOrSuggestToAgent", () => sendOrSuggestToAgent), bindRuntimeValue(runtime2, "callSendToAgent", () => callSendToAgent), bindRuntimeValue(runtime2, "isAgentSessionDestination", () => isAgentSessionDestination), bindRuntimeValue(runtime2, "trySendToAgentSession", () => trySendToAgentSession), bindRuntimeValue(runtime2, "suggestPromptOrCopy", () => suggestPromptOrCopy), bindRuntimeValue(runtime2, "jsxKd", () => jsxKd, (value) => {
    jsxKd = value;
  }), bindRuntimeValue(runtime2, "agentSendResultMessage", () => agentSendResultMessage), () => {
    SEND_TO_AGENT_METHOD = "sendToAgentSession", CAN_SEND_TO_AGENT_METHOD = "canSendToAgentSession", CLAUDE_SELECTION_TEXT_MAX = 1800, CLAUDE_SELECTION_LABEL_MAX = 120, CLAUDE_REQUEST_MAX = 2e3, CLAUDE_PAYLOAD_MAX = 4e3, CLAUDE_SEND_TIMEOUT_MS = 4e3, AgentRequestTimeoutError = class extends Error {
    }, UNSAFE_CLAUDE_REQUEST_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF0-\uFFF8\uFFFD\u{16FE4}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E00FF}\u{E01F0}-\u{E0FFF}]|(?![\u200C\u200D])\p{Cf}|\p{Co}|\p{Noncharacter_Code_Point}|[\uD800-\uDFFF]/gu, sanitizeAgentRequest = (text, maxLength) => (0, runtime2.truncateUtf16Safely)(text.replace(UNSAFE_CLAUDE_REQUEST_CHARACTERS, ""), maxLength), selectionTruncationNote = (length) => `
[selection truncated here at ` + String(length) + " characters]", SELECTION_TRUNCATION_NOTE_PATTERN = /\n\[selection truncated here at \d+ characters\]$/, SELECTION_TRUNCATION_NOTE_RESERVE = selectionTruncationNote(99999).length, agentPayloadLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length, jsxKd = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installHostAgentSession
};
