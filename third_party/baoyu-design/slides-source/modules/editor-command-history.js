// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorCommandHistory(runtime2) {
  var artifactFeedbackHandler;
  function createCommandHistory(maxEntries = 200) {
    let items = [], items2 = [], values = /* @__PURE__ */ new Set();
    function value() {
      for (let value2 of values)
        value2();
    }
    return {
      exec(input) {
        input.canDo?.() !== !1 && (input.do(), items.push(input), items.length > maxEntries && items.shift(), items2.length = 0, value());
      },
      seed(input) {
        items.push(input), items.length > maxEntries && items.shift(), items2.length = 0, value();
      },
      undo() {
        let value2 = items[items.length - 1];
        value2 && value2.canUndo?.() !== !1 && (items.pop(), value2.undo(), items2.push(value2), value());
      },
      redo() {
        let value2 = items2[items2.length - 1];
        value2 && value2.canDo?.() !== !1 && (items2.pop(), value2.do(), items.push(value2), value());
      },
      canUndo: () => items.length > 0,
      canRedo: () => items2.length > 0,
      redoDepth: () => items2.length,
      clear() {
        items.length === 0 && items2.length === 0 || (items.length = 0, items2.length = 0, value());
      },
      above: (command) => ((index4) => index4 < 0 ? void 0 : items.slice(index4 + 1))(items.lastIndexOf(command)),
      waiting: () => [...items2],
      drop(command) {
        return items[items.length - 1] !== command || items2.length > 0 ? !1 : (items.pop(), value(), !0);
      },
      subscribe(input) {
        return values.add(input), () => values.delete(input);
      }
    };
  }
  function setArtifactFeedbackHandler(handler) {
    artifactFeedbackHandler = handler;
  }
  function reportArtifactFeedback(message, detail) {
    try {
      artifactFeedbackHandler?.(message, detail);
    } catch {
    }
  }
  return bindRuntimeValue(runtime2, "createCommandHistory", () => createCommandHistory), bindRuntimeValue(runtime2, "artifactFeedbackHandler", () => artifactFeedbackHandler, (value) => {
    artifactFeedbackHandler = value;
  }), bindRuntimeValue(runtime2, "setArtifactFeedbackHandler", () => setArtifactFeedbackHandler), bindRuntimeValue(runtime2, "reportArtifactFeedback", () => reportArtifactFeedback), () => {
    (0, runtime2.initializeVideoLinks)();
  };
}
export {
  installEditorCommandHistory
};
