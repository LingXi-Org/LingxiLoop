// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiRemoteChangeAnnouncer(runtime2) {
  var reactsH, REMOTE_CHANGE_WORD_SEPARATOR, REMOTE_CHANGE_HOLD_MS, REMOTE_CHANGE_DELAY_MS, EMPTY_REMOTE_WORDS;
  function createRemoteChangeAnnouncer(options) {
    let flag = !1, flag2 = !1, value, callback = () => /* @__PURE__ */ new Map(), flag3 = !1, flag4 = !1, flag5 = !1, flag6 = !1, flag7 = !1, flag8 = !1, flag9 = !1, entries = /* @__PURE__ */ new Map(), values = /* @__PURE__ */ new Set(), callback2 = () => (flag7 = !1, flag5 = flag4, flag4 || (flag6 = !1), flag4), callback3 = (input) => {
      let value2 = flag && flag3 || flag2 && flag8;
      value2 !== flag4 && (flag4 = value2, options.onBusy(value2)), !(!flag4 || flag5 || flag7 || input && flag6) && (input ? flag6 = !0 : (flag7 = !0, options.after(REMOTE_CHANGE_DELAY_MS, () => flag7 = !1)), options.say(runtime2.CLAUDE_WORKING_LABEL, input, callback2));
    }, callback4 = () => {
      value = void 0;
      let value2 = callback7(callback);
      if (flag2 = !1, entries = value2, callback3(!0), !flag8 || flag9 && callback6(value2) === 0) {
        (flag5 || flag6) && options.hush();
        return;
      }
      let index4 = 0;
      for (let value3 of values)
        value2.has(value3) && index4++;
      options.say(flag9 ? options.words.ready(callback6(value2)) : index4 > 0 ? options.words.updated(index4) : options.words.changed(callback6(value2)), !1);
    }, callback5 = (input) => input.startsWith(REMOTE_CHANGE_WORD_SEPARATOR), callback6 = (input) => {
      let index4 = 0;
      for (let value2 of input.keys())
        callback5(value2) || index4++;
      return index4;
    }, callback7 = (input) => {
      try {
        return input();
      } catch {
        return entries;
      }
    };
    return {
      busy: () => flag4,
      set(input, options2, context) {
        callback = context;
        let value2 = input && value !== void 0;
        value2 && value(), value2 && (value = void 0);
        let value3 = input && !flag2, value4 = input || flag2 ? callback7(callback) : entries;
        value3 && (flag5 = !1, flag6 = !1, flag7 = !1, flag8 = !1, values.clear(), flag9 = callback6(value4) === 0), flag = input, input && (flag2 = !0), flag3 = options2, entries = value4, callback3(!value3), !input && flag2 && value === void 0 && (value = options.after(REMOTE_CHANGE_HOLD_MS, callback4));
      },
      changed(input, options2) {
        if (!flag2)
          return;
        callback = options2;
        let value2 = callback7(callback), flag10 = !1;
        if (input) {
          for (let [value3, value4] of value2)
            (!entries.has(value3) || !Object.is(entries.get(value3), value4)) && (flag10 = !0, callback5(value3) || values.add(value3));
          for (let value3 of entries.keys())
            value2.has(value3) || (flag10 = !0);
          flag10 && (flag8 = !0);
        }
        entries = value2, flag10 && callback3(!1);
      },
      stop() {
        value?.(), value = void 0, flag = !1, flag2 = !1, flag4 = !1;
      }
    };
  }
  function subscribeRemoteDocumentChanges(doc, onChange) {
    let value = doc.loadState?.();
    return doc.subscribe((input) => {
      let value2 = doc.loadState?.(), value3 = value2 !== value;
      value = value2, onChange(input?.remote === !0 && !value3);
    });
  }
  function useRemoteChangeAnnouncer(options) {
    let ref = reactsH.useRef(options);
    ref.current = options;
    let ref2 = reactsH.useRef(null);
    ref2.current ??= createRemoteChangeAnnouncer({
      words: {
        ready: (input) => ref.current.words.ready(input),
        updated: (input) => ref.current.words.updated(input),
        changed: (input) => ref.current.words.changed(input)
      },
      after: (input, options2) => {
        let value = setTimeout(options2, input === REMOTE_CHANGE_HOLD_MS ? EMPTY_REMOTE_WORDS.graceMs ?? input : input);
        return () => clearTimeout(value);
      },
      say: (input, options2, context) => (0, runtime2.announceLiveMessage)(context ? () => context() ? input : null : input, options2 ? {
        ifIdle: !0
      } : {}),
      hush: () => (0, runtime2.announceLiveMessage)("", {
        ifIdle: !0
      }),
      onBusy: (input) => ref.current.onBusy(input)
    });
    let current = ref2.current, { doc, empty } = options, callback = () => ref.current.items();
    return reactsH.useEffect(() => subscribeRemoteDocumentChanges(doc, (input) => current.changed(input, callback)), [doc, current]), reactsH.useEffect(() => runtime2.agentActivityStore.subscribe(() => current.set(runtime2.agentActivityStore.get() === "working", ref.current.empty, callback)), [current]), reactsH.useEffect(() => current.set(runtime2.agentActivityStore.get() === "working", empty, callback), [current, empty]), reactsH.useEffect(() => (ref.current.onBusy(current.busy()), () => {
      current.stop(), ref.current.onBusy(!1);
    }), [current]), null;
  }
  return bindRuntimeValue(runtime2, "reactsH", () => reactsH, (value) => {
    reactsH = value;
  }), bindRuntimeValue(runtime2, "REMOTE_CHANGE_WORD_SEPARATOR", () => REMOTE_CHANGE_WORD_SEPARATOR, (value) => {
    REMOTE_CHANGE_WORD_SEPARATOR = value;
  }), bindRuntimeValue(runtime2, "REMOTE_CHANGE_HOLD_MS", () => REMOTE_CHANGE_HOLD_MS, (value) => {
    REMOTE_CHANGE_HOLD_MS = value;
  }), bindRuntimeValue(runtime2, "REMOTE_CHANGE_DELAY_MS", () => REMOTE_CHANGE_DELAY_MS, (value) => {
    REMOTE_CHANGE_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "createRemoteChangeAnnouncer", () => createRemoteChangeAnnouncer), bindRuntimeValue(runtime2, "subscribeRemoteDocumentChanges", () => subscribeRemoteDocumentChanges), bindRuntimeValue(runtime2, "EMPTY_REMOTE_WORDS", () => EMPTY_REMOTE_WORDS, (value) => {
    EMPTY_REMOTE_WORDS = value;
  }), bindRuntimeValue(runtime2, "useRemoteChangeAnnouncer", () => useRemoteChangeAnnouncer), () => {
    (0, runtime2.initializeAssetStorage)(), (0, runtime2.initializeUiAnnouncements)(), reactsH = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), REMOTE_CHANGE_WORD_SEPARATOR = "\0", REMOTE_CHANGE_HOLD_MS = 2e3, REMOTE_CHANGE_DELAY_MS = 500, EMPTY_REMOTE_WORDS = {};
  };
}
export {
  installUiRemoteChangeAnnouncer
};
