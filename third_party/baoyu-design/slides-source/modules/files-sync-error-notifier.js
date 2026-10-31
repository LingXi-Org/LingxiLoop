// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSyncErrorNotifier(runtime2) {
  function createDelayedSyncErrorNotifier(options) {
    let timers = options.timers ?? {
      setTimeout: (input, options2) => setTimeout(input, options2),
      clearTimeout: (input) => clearTimeout(input)
    }, timer, cancel = () => {
      timer !== void 0 && timers.clearTimeout(timer), timer = void 0;
    }, show = (input) => {
      cancel(), timer = timers.setTimeout(() => {
        timer = void 0, options.show();
      }, input);
    };
    return (input) => {
      input === "save-trouble" ? timer === void 0 && show(3e3) : input === "save-stuck" ? show(0) : input === "save-recovered" && (cancel(), options.hide());
    };
  }
  return bindRuntimeValue(runtime2, "createDelayedSyncErrorNotifier", () => createDelayedSyncErrorNotifier), () => {
  };
}
export {
  installFilesSyncErrorNotifier
};
