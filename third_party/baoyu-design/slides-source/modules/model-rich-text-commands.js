// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelRichTextCommands(runtime2) {
  var executingRichTextCommand, isExecutingRichTextCommand;
  function executeRichTextCommand(command, value) {
    executingRichTextCommand = !0;
    try {
      return document.execCommand("styleWithCSS", !1, "false"), document.execCommand(command, !1, value);
    } finally {
      executingRichTextCommand = !1;
    }
  }
  return bindRuntimeValue(runtime2, "executeRichTextCommand", () => executeRichTextCommand), bindRuntimeValue(runtime2, "executingRichTextCommand", () => executingRichTextCommand, (value) => {
    executingRichTextCommand = value;
  }), bindRuntimeValue(runtime2, "isExecutingRichTextCommand", () => isExecutingRichTextCommand, (value) => {
    isExecutingRichTextCommand = value;
  }), () => {
    executingRichTextCommand = !1, isExecutingRichTextCommand = () => executingRichTextCommand;
  };
}
export {
  installModelRichTextCommands
};
