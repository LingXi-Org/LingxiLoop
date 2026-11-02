// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesUnsavedSlides(runtime2) {
  var UNSAVED_SLIDE_STASH_PREFIX, KEPT_SLIDE_STASH_PREFIX, MAX_SLIDE_STASH_ENTRIES, MAX_SLIDE_STASH_ENTRY_CHARS, MAX_SLIDE_STASH_ARTIFACT_CHARS, MAX_SLIDE_STASH_TOTAL_CHARS, isSlideStashStorageKey;
  function createUnsavedSlideStash(options) {
    let now = options.now ?? (() => Date.now()), unsavedPrefix = UNSAVED_SLIDE_STASH_PREFIX + options.artifactKey + "/", keptPrefix = KEPT_SLIDE_STASH_PREFIX + options.artifactKey + "/", caps = {
      entries: MAX_SLIDE_STASH_ENTRIES,
      entryChars: MAX_SLIDE_STASH_ENTRY_CHARS,
      artifactChars: MAX_SLIDE_STASH_ARTIFACT_CHARS,
      totalChars: MAX_SLIDE_STASH_TOTAL_CHARS,
      ...options.caps
    }, value = options.maxAgeMs ?? runtime2.CRASH_STASH_MAX_AGE_MS, callback = (input) => {
      try {
        return options.storage.getItem(input);
      } catch {
        return null;
      }
    }, callback2 = (input) => {
      try {
        options.storage.removeItem(input);
      } catch {
      }
    }, callback3 = () => {
      let items = [];
      try {
        for (let index4 = 0; index4 < options.storage.length; index4++) {
          let value5 = options.storage.key(index4);
          value5 !== null && items.push(value5);
        }
      } catch {
      }
      return items;
    }, callback4 = (input) => input.startsWith(unsavedPrefix) || input.startsWith(keptPrefix), callback5 = (input) => {
      if (input !== null)
        try {
          let value5 = JSON.parse(input);
          return typeof value5 == "object" && value5 !== null && !Array.isArray(value5) ? value5 : void 0;
        } catch {
          return;
        }
    }, callback6 = (input) => {
      if (typeof input.at == "number")
        return {
          at: input.at,
          createdAt: typeof input.createdAt == "number" ? input.createdAt : input.at
        };
    }, callback7 = (input, options2) => {
      let value5 = callback5(options2), value6 = value5 === void 0 ? void 0 : callback6(value5);
      if (!(value5 === void 0 || value6 === void 0 || typeof value5.html != "string"))
        return {
          slideId: input,
          base: typeof value5.base == "string" ? value5.base : null,
          html: value5.html,
          ...typeof value5.after == "string" || value5.after === null ? {
            after: value5.after
          } : {},
          ...value6
        };
    }, callback8 = (input, options2) => {
      let value5 = callback5(options2), value6 = value5 === void 0 ? void 0 : callback6(value5);
      if (!(value5 === void 0 || value6 === void 0 || typeof value5.html != "string") && !(value5.why !== "theirs-chosen" && value5.why !== "mine-chosen" && value5.why !== "overwritten"))
        return {
          slideId: input,
          html: value5.html,
          why: value5.why,
          ...value6
        };
    }, callback9 = (input) => now() - input.createdAt > value;
    function value2(items, items2) {
      let value5 = items.length + items2.length;
      if (value5 > caps.entryChars)
        return !1;
      let items3 = [], index4 = 0, index22 = 0, index32 = 0;
      for (let value6 of callback3()) {
        if (!isSlideStashStorageKey(value6) || value6 === items)
          continue;
        let value7 = callback(value6);
        if (value7 === null)
          continue;
        let value8 = value6.length + value7.length, value9 = callback5(value7), value10 = value9 !== void 0 && typeof value9.at == "number" ? value9.at : 0, value11 = callback4(value6);
        items3.push({
          k: value6,
          chars: value8,
          at: value10,
          own: value11
        }), index4 += value8, value11 && (index22 += value8, index32 += 1);
      }
      items3.sort((input, options2) => input.at - options2.at);
      for (let value6 of items3) {
        let value7 = value6.own && (index32 + 1 > caps.entries || index22 + value5 > caps.artifactChars), value8 = index4 + value5 > caps.totalChars;
        !value7 && !value8 || (callback2(value6.k), index4 -= value6.chars, value6.own && (index22 -= value6.chars, index32 -= 1));
      }
      return index32 + 1 <= caps.entries && index22 + value5 <= caps.artifactChars && index4 + value5 <= caps.totalChars;
    }
    function value3(input, options2) {
      let value5 = JSON.stringify(options2);
      if (!value2(input, value5))
        return !1;
      try {
        return options.storage.setItem(input, value5), !0;
      } catch {
        return !1;
      }
    }
    function value4(items, options2) {
      let items2 = [];
      for (let value5 of callback3()) {
        if (!value5.startsWith(items))
          continue;
        let value6 = options2(value5.slice(items.length), callback(value5));
        value6 === void 0 || callback9(value6) ? callback2(value5) : items2.push(value6);
      }
      return items2;
    }
    return {
      kind: options.kind ?? "storage",
      durable: () => options.storage.durable?.() ?? !0,
      write(input, options2, context, after) {
        let value5 = unsavedPrefix + input, value6 = now(), value7 = callback7(input, callback(value5));
        return value3(value5, {
          v: 2,
          base: options2,
          html: context,
          after,
          at: value6,
          createdAt: value7 !== void 0 && !callback9(value7) ? value7.createdAt : value6
        });
      },
      read(input) {
        let value5 = unsavedPrefix + input, value6 = callback7(input, callback(value5));
        if (value6 !== void 0 && callback9(value6)) {
          callback2(value5);
          return;
        }
        return value6;
      },
      clear: (input) => callback2(unsavedPrefix + input),
      all: () => value4(unsavedPrefix, callback7).sort((input, options2) => input.at - options2.at),
      keep(input, options2, context) {
        let value5 = now();
        return value3(keptPrefix + input, {
          v: 2,
          html: options2,
          why: context,
          at: value5,
          createdAt: value5
        });
      },
      readKept(input) {
        let value5 = keptPrefix + input, value6 = callback8(input, callback(value5));
        if (value6 !== void 0 && callback9(value6)) {
          callback2(value5);
          return;
        }
        return value6;
      },
      dropKept: (input) => callback2(keptPrefix + input),
      kept: () => value4(keptPrefix, callback8).sort((input, options2) => input.at - options2.at),
      purge() {
        let value5 = callback3().filter(callback4);
        for (let value6 of value5)
          callback2(value6);
        try {
          options.storage.purge?.();
        } catch {
        }
        return value5.length;
      }
    };
  }
  function createCrashStashStorageAdapter(kit, version2) {
    let entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map(), flag = !1, value = Promise.resolve(), flag2 = !1, flag3 = !0, callback = async () => (flag3 = await kit.put([...entries].map(([input, input2]) => ({
      path: input,
      text: input2,
      base: null
    })), version2()), flag3), callback2 = () => {
      flag2 || (flag2 = !0, queueMicrotask(() => {
        flag2 = !1, value = value.then(callback);
      }));
    }, callback3 = (input) => {
      if (!(!entries2.delete(input) || flag)) {
        flag = !0;
        for (let [value2, value3] of entries2)
          entries.has(value2) || entries.set(value2, value3);
        entries2.clear(), value = value.then(callback).then((input2) => input2 ? kit.clearOffered() : void 0);
      }
    }, callback4 = () => [
      .../* @__PURE__ */ new Set([...entries.keys(), ...entries2.keys()])
    ];
    return {
      async ready() {
        let value2 = await kit.read();
        for (let value3 of value2?.edits ?? [])
          value3.text !== null && !entries.has(value3.path) && entries2.set(value3.path, value3.text);
      },
      get length() {
        return callback4().length;
      },
      key: (input) => callback4()[input] ?? null,
      getItem: (input) => entries.get(input) ?? entries2.get(input) ?? null,
      setItem(input, options) {
        callback3(input), entries.set(input, options), callback2();
      },
      removeItem(input) {
        callback3(input), entries.delete(input) && callback2();
      },
      purge() {
        entries.clear(), entries2.clear(), value = value.then(() => kit.clearArtifact());
      },
      durable: () => flag3
    };
  }
  async function createPersistentUnsavedSlideStash(options = {}) {
    let kit = options.kit === void 0 ? await (0, runtime2.createCurrentArtifactCrashStash)("slides") : options.kit;
    if (kit === null)
      return;
    let storage = createCrashStashStorageAdapter(kit, options.version ?? (() => ""));
    return await storage.ready(), createUnsavedSlideStash({
      storage,
      artifactKey: (0, runtime2.artifactPathWithoutFrameScope)(),
      kind: "this browser (IndexedDB)",
      ...options.now !== void 0 ? {
        now: options.now
      } : {}
    });
  }
  return bindRuntimeValue(runtime2, "UNSAVED_SLIDE_STASH_PREFIX", () => UNSAVED_SLIDE_STASH_PREFIX, (value) => {
    UNSAVED_SLIDE_STASH_PREFIX = value;
  }), bindRuntimeValue(runtime2, "KEPT_SLIDE_STASH_PREFIX", () => KEPT_SLIDE_STASH_PREFIX, (value) => {
    KEPT_SLIDE_STASH_PREFIX = value;
  }), bindRuntimeValue(runtime2, "MAX_SLIDE_STASH_ENTRIES", () => MAX_SLIDE_STASH_ENTRIES, (value) => {
    MAX_SLIDE_STASH_ENTRIES = value;
  }), bindRuntimeValue(runtime2, "MAX_SLIDE_STASH_ENTRY_CHARS", () => MAX_SLIDE_STASH_ENTRY_CHARS, (value) => {
    MAX_SLIDE_STASH_ENTRY_CHARS = value;
  }), bindRuntimeValue(runtime2, "MAX_SLIDE_STASH_ARTIFACT_CHARS", () => MAX_SLIDE_STASH_ARTIFACT_CHARS, (value) => {
    MAX_SLIDE_STASH_ARTIFACT_CHARS = value;
  }), bindRuntimeValue(runtime2, "MAX_SLIDE_STASH_TOTAL_CHARS", () => MAX_SLIDE_STASH_TOTAL_CHARS, (value) => {
    MAX_SLIDE_STASH_TOTAL_CHARS = value;
  }), bindRuntimeValue(runtime2, "isSlideStashStorageKey", () => isSlideStashStorageKey, (value) => {
    isSlideStashStorageKey = value;
  }), bindRuntimeValue(runtime2, "createUnsavedSlideStash", () => createUnsavedSlideStash), bindRuntimeValue(runtime2, "createCrashStashStorageAdapter", () => createCrashStashStorageAdapter), bindRuntimeValue(runtime2, "createPersistentUnsavedSlideStash", () => createPersistentUnsavedSlideStash), () => {
    UNSAVED_SLIDE_STASH_PREFIX = "slides-unsaved/", KEPT_SLIDE_STASH_PREFIX = "slides-kept/", MAX_SLIDE_STASH_ENTRIES = runtime2.CRASH_STASH_MAX_ENTRIES, MAX_SLIDE_STASH_ENTRY_CHARS = 262144, MAX_SLIDE_STASH_ARTIFACT_CHARS = runtime2.CRASH_STASH_MAX_ARTIFACT_CHARS, MAX_SLIDE_STASH_TOTAL_CHARS = runtime2.CRASH_STASH_MAX_TOTAL_CHARS, isSlideStashStorageKey = (key) => key.startsWith(UNSAVED_SLIDE_STASH_PREFIX) || key.startsWith(KEPT_SLIDE_STASH_PREFIX);
  };
}
export {
  installFilesUnsavedSlides
};
