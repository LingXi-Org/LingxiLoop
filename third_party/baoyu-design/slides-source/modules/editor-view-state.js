// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorViewState(runtime2) {
  var editorViewStateAdapter, deferredEditorViewState, captureEditorViewState, editorViewStateBusy, editorSaveHandoff, HOT_REVEAL_TIMEOUT_MS, hotRestoreRevealed, resolveHotRestoreRevealed, revealAfterHotRestore, HOT_REVEAL_STABLE_READS, HOT_REVEAL_POLL_MS, HOT_REVEAL_PAINT_FALLBACK_MS, ReactHotRestore;
  function isHotRestoreLoad() {
    return globalThis.slidesHost?.hot?.from != null;
  }
  function hideUntilHotRestoreRevealed() {
    let { style } = document.body, show = () => void style.removeProperty("opacity");
    hotRestoreRevealed.then(show), setTimeout(show, HOT_REVEAL_TIMEOUT_MS), style.opacity = "0";
  }
  function hotRestoreViewState(restore, isHot = isHotRestoreLoad) {
    return {
      restore: (value) => {
        try {
          restore(value);
        } finally {
          isHot() ? hideUntilHotRestoreRevealed() : revealAfterHotRestore();
        }
      },
      reveal: hotRestoreRevealed
    };
  }
  function revealOnLoadFailure(document2) {
    document2.subscribeLoad(() => {
      document2.loadState() === "failed" && revealAfterHotRestore();
    });
  }
  function afterNextPaint(callback) {
    let done = !1, run = () => {
      done || (done = !0, callback());
    };
    setTimeout(run, HOT_REVEAL_PAINT_FALLBACK_MS), requestAnimationFrame(() => void setTimeout(run, 0));
  }
  function watchBoxSettled(read, settled) {
    let startedAt = Date.now(), stableReads = 0, lastKey = "", stopped = !1, timer, check = () => {
      if (stopped)
        return;
      let rect = read(), key = rect === void 0 || rect.width === 0 ? "" : [rect.x, rect.y, rect.width, rect.height].join();
      stableReads = key !== "" && key === lastKey ? stableReads + 1 : 1, lastKey = key, stableReads >= HOT_REVEAL_STABLE_READS || Date.now() - startedAt >= HOT_REVEAL_TIMEOUT_MS ? settled() : stableReads === HOT_REVEAL_STABLE_READS - 1 ? afterNextPaint(check) : timer = setTimeout(check, HOT_REVEAL_POLL_MS);
    };
    return timer = setTimeout(check, 0), () => {
      stopped = !0, clearTimeout(timer);
    };
  }
  function HotRestoreRevealGate({ box }) {
    let boxRef = ReactHotRestore.useRef(box);
    boxRef.current = box;
    let absent = box === null;
    return ReactHotRestore.useEffect(() => {
      if (absent)
        return revealAfterHotRestore();
      let stop = watchBoxSettled(() => boxRef.current?.(), revealAfterHotRestore);
      return hotRestoreRevealed.then(stop), stop;
    }, [absent]), null;
  }
  function parseEditorViewState(state) {
    if (typeof state != "object" || state === null)
      return;
    let record = state;
    return {
      presenting: record.presenting === !0,
      slideId: typeof record.slideId == "string" ? record.slideId : null,
      selection: record.selection
    };
  }
  function registerEditorViewStateAdapter(adapter) {
    if (editorViewStateAdapter = adapter, deferredEditorViewState !== void 0) {
      let value = deferredEditorViewState;
      deferredEditorViewState = void 0, adapter.restore(value);
    }
    return () => {
      editorViewStateAdapter === adapter && (editorViewStateAdapter = void 0);
    };
  }
  function restoreEditorViewState(value) {
    let viewState = parseEditorViewState(value);
    viewState !== void 0 && (editorViewStateAdapter !== void 0 ? editorViewStateAdapter.restore(viewState) : deferredEditorViewState = viewState);
  }
  return bindRuntimeValue(runtime2, "editorViewStateAdapter", () => editorViewStateAdapter, (value) => {
    editorViewStateAdapter = value;
  }), bindRuntimeValue(runtime2, "deferredEditorViewState", () => deferredEditorViewState, (value) => {
    deferredEditorViewState = value;
  }), bindRuntimeValue(runtime2, "parseEditorViewState", () => parseEditorViewState), bindRuntimeValue(runtime2, "registerEditorViewStateAdapter", () => registerEditorViewStateAdapter), bindRuntimeValue(runtime2, "captureEditorViewState", () => captureEditorViewState, (value) => {
    captureEditorViewState = value;
  }), bindRuntimeValue(runtime2, "editorViewStateBusy", () => editorViewStateBusy, (value) => {
    editorViewStateBusy = value;
  }), bindRuntimeValue(runtime2, "restoreEditorViewState", () => restoreEditorViewState), bindRuntimeValue(runtime2, "editorSaveHandoff", () => editorSaveHandoff, (value) => {
    editorSaveHandoff = value;
  }), bindRuntimeValue(runtime2, "HOT_REVEAL_TIMEOUT_MS", () => HOT_REVEAL_TIMEOUT_MS, (value) => {
    HOT_REVEAL_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "hotRestoreRevealed", () => hotRestoreRevealed, (value) => {
    hotRestoreRevealed = value;
  }), bindRuntimeValue(runtime2, "revealAfterHotRestore", () => revealAfterHotRestore, (value) => {
    revealAfterHotRestore = value;
  }), bindRuntimeValue(runtime2, "isHotRestoreLoad", () => isHotRestoreLoad), bindRuntimeValue(runtime2, "hideUntilHotRestoreRevealed", () => hideUntilHotRestoreRevealed), bindRuntimeValue(runtime2, "hotRestoreViewState", () => hotRestoreViewState), bindRuntimeValue(runtime2, "revealOnLoadFailure", () => revealOnLoadFailure), bindRuntimeValue(runtime2, "HOT_REVEAL_STABLE_READS", () => HOT_REVEAL_STABLE_READS, (value) => {
    HOT_REVEAL_STABLE_READS = value;
  }), bindRuntimeValue(runtime2, "HOT_REVEAL_POLL_MS", () => HOT_REVEAL_POLL_MS, (value) => {
    HOT_REVEAL_POLL_MS = value;
  }), bindRuntimeValue(runtime2, "HOT_REVEAL_PAINT_FALLBACK_MS", () => HOT_REVEAL_PAINT_FALLBACK_MS, (value) => {
    HOT_REVEAL_PAINT_FALLBACK_MS = value;
  }), bindRuntimeValue(runtime2, "afterNextPaint", () => afterNextPaint), bindRuntimeValue(runtime2, "watchBoxSettled", () => watchBoxSettled), bindRuntimeValue(runtime2, "ReactHotRestore", () => ReactHotRestore, (value) => {
    ReactHotRestore = value;
  }), bindRuntimeValue(runtime2, "HotRestoreRevealGate", () => HotRestoreRevealGate), () => {
    captureEditorViewState = () => editorViewStateAdapter?.snapshot(), editorViewStateBusy = () => editorViewStateAdapter?.busy() === !0 || !1, editorSaveHandoff = (document2) => ({
      unsent: () => document2.dirty(),
      sendNow: () => void document2.save()
    }), ReactHotRestore = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), HOT_REVEAL_TIMEOUT_MS = 4e3, resolveHotRestoreRevealed = () => {
    }, hotRestoreRevealed = new Promise((resolve) => void (resolveHotRestoreRevealed = resolve)), revealAfterHotRestore = () => resolveHotRestoreRevealed(), HOT_REVEAL_STABLE_READS = 3, HOT_REVEAL_POLL_MS = 16, HOT_REVEAL_PAINT_FALLBACK_MS = 100;
  };
}
export {
  installEditorViewState
};
