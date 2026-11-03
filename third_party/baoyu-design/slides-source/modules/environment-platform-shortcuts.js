// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentPlatformShortcuts(runtime2) {
  let KEY_NAME_MESSAGES, shortcutKeyName;
  function isApplePlatform() {
    return typeof navigator > "u" ? !1 : /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  }
  function formatCommandShortcut(key, { shift: shift4 = !1 } = {}) {
    return isApplePlatform() ? (shift4 ? "⇧⌘" : "⌘") + key : shortcutKeyName("ctrl") + "+" + (shift4 ? shortcutKeyName("shift") + "+" : "") + key;
  }
  function isDuplicateShortcut(event) {
    return (event.key === "d" || event.key === "D") && !event.shiftKey && !event.altKey && (isApplePlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey);
  }
  return bindRuntimeValue(runtime2, "KEY_NAME_MESSAGES", () => KEY_NAME_MESSAGES, (value) => {
    KEY_NAME_MESSAGES = value;
  }), bindRuntimeValue(runtime2, "shortcutKeyName", () => shortcutKeyName, (value) => {
    shortcutKeyName = value;
  }), bindRuntimeValue(runtime2, "isApplePlatform", () => isApplePlatform), bindRuntimeValue(runtime2, "formatCommandShortcut", () => formatCommandShortcut), bindRuntimeValue(runtime2, "isDuplicateShortcut", () => isDuplicateShortcut), () => {
    KEY_NAME_MESSAGES = {
      command: () => (0, runtime2.formatMessage)({
        defaultMessage: "Command",
        id: "pVcvMtkcr9"
      }),
      control: () => (0, runtime2.formatMessage)({
        defaultMessage: "Control",
        id: "0o/pkuyTAo"
      }),
      ctrl: () => (0, runtime2.formatMessage)({
        defaultMessage: "Ctrl",
        id: "zN49J5iGSB"
      }),
      option: () => (0, runtime2.formatMessage)({
        defaultMessage: "Option",
        id: "JGGKvB3xx3"
      }),
      alt: () => (0, runtime2.formatMessage)({
        defaultMessage: "Alt",
        id: "swBNroG1JT"
      }),
      shift: () => (0, runtime2.formatMessage)({
        defaultMessage: "Shift",
        id: "C+F5YQPqnR"
      }),
      escape: () => (0, runtime2.formatMessage)({
        defaultMessage: "Esc",
        id: "PQTy77HOoI"
      }),
      return: () => (0, runtime2.formatMessage)({
        defaultMessage: "Return",
        id: "/0EpuOzilp"
      }),
      enter: () => (0, runtime2.formatMessage)({
        defaultMessage: "Enter",
        id: "PK9bgPl6M2"
      }),
      delete: () => (0, runtime2.formatMessage)({
        defaultMessage: "删除",
        id: "2Nlo+iwNry"
      }),
      backspace: () => (0, runtime2.formatMessage)({
        defaultMessage: "Backspace",
        id: "q4L23Bsys3"
      }),
      space: () => (0, runtime2.formatMessage)({
        defaultMessage: "空格",
        id: "PXLJLpfmif"
      }),
      tab: () => (0, runtime2.formatMessage)({
        defaultMessage: "Tab",
        id: "Kqzzr29frL"
      }),
      up: () => (0, runtime2.formatMessage)({
        defaultMessage: "上箭头",
        id: "PG1fB7RTtv"
      }),
      down: () => (0, runtime2.formatMessage)({
        defaultMessage: "下箭头",
        id: "d+lnMJr2yk"
      }),
      left: () => (0, runtime2.formatMessage)({
        defaultMessage: "左箭头",
        id: "kBm9zai0M0"
      }),
      right: () => (0, runtime2.formatMessage)({
        defaultMessage: "右箭头",
        id: "uHZ99F8Qy4"
      }),
      pageUp: () => (0, runtime2.formatMessage)({
        defaultMessage: "Page Up",
        id: "wOmYWz0Ygk"
      }),
      pageDown: () => (0, runtime2.formatMessage)({
        defaultMessage: "Page Down",
        id: "Mc0+z7uRx8"
      }),
      backslash: () => (0, runtime2.formatMessage)({
        defaultMessage: "反斜杠",
        id: "WMpbLQocvj"
      }),
      slash: () => (0, runtime2.formatMessage)({
        defaultMessage: "斜杠",
        id: "R5MQRhYR+C"
      }),
      minus: () => (0, runtime2.formatMessage)({
        defaultMessage: "减号",
        id: "xvoRoBgERI"
      }),
      equals: () => (0, runtime2.formatMessage)({
        defaultMessage: "等号",
        id: "Z/jgt8/XIZ"
      }),
      comma: () => (0, runtime2.formatMessage)({
        defaultMessage: "逗号",
        id: "gOML5yFLS2"
      }),
      period: () => (0, runtime2.formatMessage)({
        defaultMessage: "句号",
        id: "SdqINwftMh"
      }),
      semicolon: () => (0, runtime2.formatMessage)({
        defaultMessage: "分号",
        id: "N/p8yWU4PB"
      }),
      apostrophe: () => (0, runtime2.formatMessage)({
        defaultMessage: "撇号",
        id: "7bv/SwFH2S"
      }),
      backtick: () => (0, runtime2.formatMessage)({
        defaultMessage: "反引号",
        id: "MVFEaYbSFc"
      }),
      leftBracket: () => (0, runtime2.formatMessage)({
        defaultMessage: "左方括号",
        id: "R6gWwwgzXo"
      }),
      rightBracket: () => (0, runtime2.formatMessage)({
        defaultMessage: "右方括号",
        id: "pTmwwPk1zG"
      })
    }, shortcutKeyName = (key) => KEY_NAME_MESSAGES[key]();
  };
}
export {
  installEnvironmentPlatformShortcuts
};
