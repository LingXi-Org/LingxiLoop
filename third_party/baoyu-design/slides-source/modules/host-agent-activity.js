// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostAgentActivity(runtime2) {
  var reactql0, CLAUDE_ACTIVITY_REQUEST_MESSAGE, CLAUDE_ACTIVITY_MESSAGE, agentActivityBridge, agentActivityStore;
  function createAgentActivityBridge(options) {
    let parentWindow = options.parentWindow, values = /* @__PURE__ */ new Set(), text = "unknown", flag = !1, callback = (input) => {
      if (input !== text) {
        text = input;
        for (let value of [...values])
          try {
            value();
          } catch {
          }
      }
    }, callback2 = (dataset) => {
      if (parentWindow === null || dataset.source !== parentWindow)
        return;
      let data = dataset.data;
      typeof data != "object" || data === null || data[CLAUDE_ACTIVITY_MESSAGE] !== !0 || (data.working === !0 ? callback("working") : data.working === !1 && callback("idle"));
    }, callback3 = () => {
      if (!(flag || parentWindow === null)) {
        flag = !0;
        try {
          options.ownWindow.addEventListener("message", callback2), parentWindow.postMessage({
            [CLAUDE_ACTIVITY_REQUEST_MESSAGE]: !0
          }, "*");
        } catch {
        }
      }
    };
    return {
      get: () => text,
      subscribe(input) {
        return values.add(input), callback3(), () => {
          values.delete(input);
        };
      },
      dispose() {
        flag && options.ownWindow.removeEventListener("message", callback2), flag = !1, values.clear(), text = "unknown";
      }
    };
  }
  function getAgentActivityBridge() {
    return agentActivityBridge === null && (agentActivityBridge = createAgentActivityBridge({
      ownWindow: window,
      parentWindow: window.parent !== window ? window.parent : null
    })), agentActivityBridge;
  }
  function useAgentActivity() {
    return reactql0.useSyncExternalStore(agentActivityStore.subscribe, agentActivityStore.get, () => "unknown");
  }
  return bindRuntimeValue(runtime2, "reactql0", () => reactql0, (value) => {
    reactql0 = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_ACTIVITY_REQUEST_MESSAGE", () => CLAUDE_ACTIVITY_REQUEST_MESSAGE, (value) => {
    CLAUDE_ACTIVITY_REQUEST_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "CLAUDE_ACTIVITY_MESSAGE", () => CLAUDE_ACTIVITY_MESSAGE, (value) => {
    CLAUDE_ACTIVITY_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "createAgentActivityBridge", () => createAgentActivityBridge), bindRuntimeValue(runtime2, "agentActivityBridge", () => agentActivityBridge, (value) => {
    agentActivityBridge = value;
  }), bindRuntimeValue(runtime2, "getAgentActivityBridge", () => getAgentActivityBridge), bindRuntimeValue(runtime2, "agentActivityStore", () => agentActivityStore, (value) => {
    agentActivityStore = value;
  }), bindRuntimeValue(runtime2, "useAgentActivity", () => useAgentActivity), () => {
    reactql0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), CLAUDE_ACTIVITY_REQUEST_MESSAGE = "__frame_claude_activity_ask", CLAUDE_ACTIVITY_MESSAGE = "__frame_claude_activity", agentActivityBridge = null, agentActivityStore = {
      get: () => getAgentActivityBridge().get(),
      subscribe: (input) => getAgentActivityBridge().subscribe(input)
    };
  };
}
export {
  installHostAgentActivity
};
