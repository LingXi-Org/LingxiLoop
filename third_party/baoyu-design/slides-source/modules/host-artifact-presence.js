// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostArtifactPresence(runtime2) {
  var MAX_PRESENCE_BYTES, MAX_PRESENCE_FIELDS, MAX_PRESENCE_OBJECTS, MAX_PRESENCE_LABEL_LENGTH, MAX_PRESENCE_TEXT_LENGTH, MAX_PRESENCE_ID_LENGTH, PRESENCE_FIELD_PATTERN, RESERVED_PRESENCE_FIELDS, PRESENCE_ID_PATTERN, UNSAFE_PRESENCE_ID_CHARACTERS, UNSAFE_PRESENCE_LABEL_CHARACTERS, EMPTY_PRESENCE_LABEL_PATTERN, EMOJI_PRESENCE_LABEL_PATTERN;
  function isValidPresenceId(id) {
    if (typeof id != "string" || id.length > MAX_PRESENCE_ID_LENGTH || !PRESENCE_ID_PATTERN.test(id))
      return !1;
    try {
      return !UNSAFE_PRESENCE_ID_CHARACTERS.test(decodeURIComponent(id).normalize("NFKD"));
    } catch {
      return !1;
    }
  }
  function normalizePresenceGlyph(glyph) {
    let value = glyph.normalize("NFKD");
    return [...value].length === 1 ? value : glyph;
  }
  function isEmojiTagCodepoint(codepoint) {
    return codepoint !== void 0 && codepoint >= 917536 && codepoint <= 917631;
  }
  function isDisallowedPresenceCodepoint(codepoint) {
    return codepoint >= 55296 && codepoint <= 57343 || (codepoint & 65534) === 65534 || codepoint >= 64976 && codepoint <= 65007 || codepoint >= 65520 && codepoint <= 65528 || codepoint >= 917504 && codepoint <= 921599;
  }
  function sanitizePresenceLabel(text, maxLength = MAX_PRESENCE_LABEL_LENGTH) {
    let text2 = "", index4 = 0, flag = !1, callback = (input, options) => {
      let value = input.codePointAt(0) ?? 0;
      return value <= 32 || value >= 127 && value <= 160 || /\s/u.test(input) ? (flag = text2 !== "", !1) : isDisallowedPresenceCodepoint(value) || UNSAFE_PRESENCE_LABEL_CHARACTERS.test(input) ? !1 : UNSAFE_PRESENCE_LABEL_CHARACTERS.test(normalizePresenceGlyph(input)) || isEmojiTagCodepoint(options.codePointAt(0)) && EMOJI_PRESENCE_LABEL_PATTERN.test(input) ? (flag = text2 !== "", !1) : (flag && (text2 += " ", index4 += 1, flag = !1), text2 += input, index4 += 1, index4 > maxLength);
    }, text3 = "";
    for (let value of text.normalize("NFC")) {
      if (text3 !== "" && callback(text3, value)) {
        text3 = "";
        break;
      }
      text3 = value;
    }
    return text3 !== "" && callback(text3, ""), EMPTY_PRESENCE_LABEL_PATTERN.test(text2) ? "" : index4 <= maxLength ? text2 : [...text2].slice(0, maxLength - 1).join("").trimEnd() + "…";
  }
  function normalizePresenceObjects(objects) {
    return objects.filter((input) => typeof input == "object" && input !== null && isValidPresenceId(input.id)).slice(-MAX_PRESENCE_OBJECTS).map(({ id, kind, label }) => {
      let state = {
        id
      };
      isValidPresenceId(kind) && (state.kind = kind);
      let value = typeof label == "string" ? sanitizePresenceLabel(label) : "";
      return value !== "" && (state.label = value), state;
    });
  }
  function normalizePresenceRect(value) {
    let keys = Object.keys(value).sort().join(), values = Object.values(value);
    if ((keys === "x,y" || keys === "h,w,x,y") && values.every((item) => Number.isSafeInteger(item))) {
      let rect = {};
      for (let [key, item] of Object.entries(value))
        typeof item == "number" && (rect[key] = item);
      return rect;
    }
  }
  function normalizePresenceFields(fields) {
    let state = {}, state2 = {};
    for (let value of Object.keys(fields)) {
      if (!PRESENCE_FIELD_PATTERN.test(value) || value === "prototype" || value in Object.prototype || RESERVED_PRESENCE_FIELDS.includes(value))
        continue;
      let value2 = fields[value];
      if (typeof value2 == "boolean" || value2 === null)
        state[value] = state2[value] = value2;
      else if (typeof value2 == "number")
        state[value] = state2[value] = Number.isSafeInteger(value2) ? value2 : null;
      else if (Array.isArray(value2)) {
        let value3 = value2;
        value3.some((input) => typeof input == "object" && input !== null) ? state[value] = normalizePresenceObjects(value3) : state[value] = state2[value] = value3.filter(isValidPresenceId).slice(-MAX_PRESENCE_FIELDS);
      } else if (typeof value2 == "object") {
        let rect = normalizePresenceRect(value2), value3 = "text" in value2 && typeof value2.text == "string" ? sanitizePresenceLabel(value2.text) : "";
        rect !== void 0 ? state[value] = state2[value] = rect : value3 !== "" && (state[value] = value3);
      } else
        state[value] = state2[value] = isValidPresenceId(value2) ? value2 : null;
    }
    return {
      full: state,
      lean: state2
    };
  }
  function createArtifactPresence() {
    let disabled2 = !(0, runtime2.hasHostRoomApi)(), pendingContext = null, fullContextJson = "", leanContextJson = "", publishedJson = "", publishing = !1, sizeWarningLogged = !1, disposed = !1, timer, retryPending = !1, unsubscribeEdits = () => {
    };
    disabled2 || (unsubscribeEdits = (0, runtime2.subscribeArtifactEdits)(() => void publish()));
    function withEditCount(input) {
      let value = (0, runtime2.getArtifactEditCount)();
      return value > 0 ? {
        ...input,
        edits: value
      } : input;
    }
    let fitsContextLimit = (input) => new TextEncoder().encode(input).length <= MAX_PRESENCE_BYTES;
    function choosePublishContext(input) {
      for (let value of [
        withEditCount(input.full),
        withEditCount(input.lean),
        input.lean
      ]) {
        let value2 = JSON.stringify(value);
        if (fitsContextLimit(value2))
          return {
            view: value,
            json: value2
          };
      }
      return {
        view: null,
        json: ""
      };
    }
    function schedulePublish() {
      clearTimeout(timer), timer = setTimeout(() => void publish(), MAX_PRESENCE_TEXT_LENGTH);
    }
    async function publish() {
      if (clearTimeout(timer), timer = void 0, disabled2 || publishing || pendingContext === null)
        return;
      publishing = !0;
      let { view: value, json: value2 } = choosePublishContext(pendingContext);
      value === null && !sizeWarningLogged && (sizeWarningLogged = !0, console.warn("appifact presence: context over 3 KiB — cleared, not published"));
      let value3 = JSON.stringify(withEditCount(pendingContext.full)), value4 = leanContextJson, value5 = (0, runtime2.getArtifactEditCount)();
      try {
        if (value2 === publishedJson)
          return;
        let value6 = await (0, runtime2.reportRoomPresence)({
          context: value
        });
        value6 === "off" && (disabled2 = !0, unsubscribeEdits(), !disposed && publishedJson !== "" && (0, runtime2.reportRoomPresence)({
          context: null
        })), value6 === "ok" && (publishedJson = value2), retryPending = value6 === "retry";
      } finally {
        publishing = !1, pendingContext !== null && JSON.stringify(withEditCount(pendingContext.full)) !== value3 && (leanContextJson === value4 && (0, runtime2.getArtifactEditCount)() === value5 ? timer === void 0 && schedulePublish() : publish());
      }
    }
    return {
      report(input) {
        if (runtime2.reportNativeEditorContext?.(input), disabled2)
          return;
        let value = normalizePresenceFields(input), value2 = JSON.stringify(value.full);
        if (value2 === fullContextJson) {
          retryPending && timer === void 0 && publish();
          return;
        }
        let value3 = JSON.stringify(value.lean), value4 = !retryPending && pendingContext !== null && value3 === leanContextJson;
        pendingContext = value, fullContextJson = value2, leanContextJson = value3, value4 ? schedulePublish() : publish();
      },
      dispose() {
        clearTimeout(timer), unsubscribeEdits(), !disabled2 && (publishedJson !== "" || publishing) && (0, runtime2.reportRoomPresence)({
          context: null
        }), pendingContext = null, disabled2 = disposed = !0;
      }
    };
  }
  return bindRuntimeValue(runtime2, "MAX_PRESENCE_BYTES", () => MAX_PRESENCE_BYTES, (value) => {
    MAX_PRESENCE_BYTES = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_FIELDS", () => MAX_PRESENCE_FIELDS, (value) => {
    MAX_PRESENCE_FIELDS = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_OBJECTS", () => MAX_PRESENCE_OBJECTS, (value) => {
    MAX_PRESENCE_OBJECTS = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_LABEL_LENGTH", () => MAX_PRESENCE_LABEL_LENGTH, (value) => {
    MAX_PRESENCE_LABEL_LENGTH = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_TEXT_LENGTH", () => MAX_PRESENCE_TEXT_LENGTH, (value) => {
    MAX_PRESENCE_TEXT_LENGTH = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_ID_LENGTH", () => MAX_PRESENCE_ID_LENGTH, (value) => {
    MAX_PRESENCE_ID_LENGTH = value;
  }), bindRuntimeValue(runtime2, "PRESENCE_FIELD_PATTERN", () => PRESENCE_FIELD_PATTERN, (value) => {
    PRESENCE_FIELD_PATTERN = value;
  }), bindRuntimeValue(runtime2, "RESERVED_PRESENCE_FIELDS", () => RESERVED_PRESENCE_FIELDS, (value) => {
    RESERVED_PRESENCE_FIELDS = value;
  }), bindRuntimeValue(runtime2, "PRESENCE_ID_PATTERN", () => PRESENCE_ID_PATTERN, (value) => {
    PRESENCE_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "UNSAFE_PRESENCE_ID_CHARACTERS", () => UNSAFE_PRESENCE_ID_CHARACTERS, (value) => {
    UNSAFE_PRESENCE_ID_CHARACTERS = value;
  }), bindRuntimeValue(runtime2, "isValidPresenceId", () => isValidPresenceId), bindRuntimeValue(runtime2, "UNSAFE_PRESENCE_LABEL_CHARACTERS", () => UNSAFE_PRESENCE_LABEL_CHARACTERS, (value) => {
    UNSAFE_PRESENCE_LABEL_CHARACTERS = value;
  }), bindRuntimeValue(runtime2, "EMPTY_PRESENCE_LABEL_PATTERN", () => EMPTY_PRESENCE_LABEL_PATTERN, (value) => {
    EMPTY_PRESENCE_LABEL_PATTERN = value;
  }), bindRuntimeValue(runtime2, "EMOJI_PRESENCE_LABEL_PATTERN", () => EMOJI_PRESENCE_LABEL_PATTERN, (value) => {
    EMOJI_PRESENCE_LABEL_PATTERN = value;
  }), bindRuntimeValue(runtime2, "normalizePresenceGlyph", () => normalizePresenceGlyph), bindRuntimeValue(runtime2, "isEmojiTagCodepoint", () => isEmojiTagCodepoint), bindRuntimeValue(runtime2, "isDisallowedPresenceCodepoint", () => isDisallowedPresenceCodepoint), bindRuntimeValue(runtime2, "sanitizePresenceLabel", () => sanitizePresenceLabel), bindRuntimeValue(runtime2, "normalizePresenceObjects", () => normalizePresenceObjects), bindRuntimeValue(runtime2, "normalizePresenceFields", () => normalizePresenceFields), bindRuntimeValue(runtime2, "createArtifactPresence", () => createArtifactPresence), () => {
    MAX_PRESENCE_BYTES = 3072, MAX_PRESENCE_FIELDS = 20, MAX_PRESENCE_OBJECTS = 5, MAX_PRESENCE_LABEL_LENGTH = 60, MAX_PRESENCE_TEXT_LENGTH = 400, MAX_PRESENCE_ID_LENGTH = 256, PRESENCE_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/, RESERVED_PRESENCE_FIELDS = ["edits"], PRESENCE_ID_PATTERN = /^(?:[A-Za-z0-9_./#:@+!~*'()-]|%[0-9A-Fa-f]{2})*$/, UNSAFE_PRESENCE_ID_CHARACTERS = /[\p{Cc}\p{Co}\p{Cs}]|[^\P{Cf}\u200C\u200D]|["`<>\\\p{Zl}\p{Zp}]/u, UNSAFE_PRESENCE_LABEL_CHARACTERS = /[<>"`\\]|[^\P{Cf}\u200C\u200D]|[\p{Co}\u034F\u115F\u1160\u17B4\u17B5\u2065\u2800\u3164\uFFA0\uFFFC\uFFFD\u{16FE4}\u{1D159}]/u, EMPTY_PRESENCE_LABEL_PATTERN = /^[ \u200C\u200D\p{Variation_Selector}]*$/u, EMOJI_PRESENCE_LABEL_PATTERN = /\p{Extended_Pictographic}/u;
  };
}
export {
  installHostArtifactPresence
};
