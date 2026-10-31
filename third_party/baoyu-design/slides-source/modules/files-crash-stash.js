// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesCrashStash(runtime2) {
  var CRASH_STASH_MAX_AGE_MS, CRASH_STASH_RETENTION_LABEL, CRASH_STASH_MAX_ENTRIES, CRASH_STASH_MAX_ARTIFACT_CHARS, CRASH_STASH_MAX_TOTAL_CHARS, crashStashIdentityKey, crashStashEntrySize, stripArtifactScopeFragment, isCrashStashEntry, CRASH_STASH_DATABASE_NAME, CRASH_STASH_OBJECT_STORE, FRAME_SCOPE_PATH_PATTERN, CRASH_STASH_TAB_LOCK_PREFIX, getNavigatorLocks;
  function createCrashStashKit(storage, artifactId, viewerId, tabId, now, liveTabs) {
    let value = crashStashIdentityKey(artifactId, viewerId, tabId), items = [], callback = async (input, options) => {
      try {
        return await options();
      } catch {
        return input;
      }
    }, callback2 = (input) => stripArtifactScopeFragment(input.artifactId) === stripArtifactScopeFragment(artifactId), callback3 = async () => {
      let items2 = [];
      for (let value2 of await storage.all()) {
        if (!isCrashStashEntry(value2) || now() - value2.createdAt > CRASH_STASH_MAX_AGE_MS) {
          typeof value2?.key == "string" && await storage.delete(value2.key);
          continue;
        }
        items2.push(value2);
      }
      return items2;
    }, callback4 = async () => {
      let values = new Set(await liveTabs().catch(() => /* @__PURE__ */ new Set()));
      return values.delete(tabId), values;
    };
    return {
      put: (items2, options) => callback(!1, async () => {
        if (viewerId === "")
          return !1;
        if (items2.length === 0)
          return await storage.delete(value), !0;
        let items3 = [], index4 = 0;
        for (let value7 of items2)
          items3.length >= CRASH_STASH_MAX_ENTRIES || index4 + crashStashEntrySize(value7) > CRASH_STASH_MAX_ARTIFACT_CHARS || (items3.push({
            path: value7.path,
            text: value7.text,
            base: value7.base
          }), index4 += crashStashEntrySize(value7));
        let value2 = await callback3(), value3 = await callback4(), value4 = value2.filter((input) => input.key !== value), value5 = index4 + value4.reduce((input, options2) => input + options2.chars, 0);
        for (let value7 of value4.filter((input) => !value3.has(input.tabId)).sort((input, options2) => input.at - options2.at)) {
          if (value5 <= CRASH_STASH_MAX_TOTAL_CHARS)
            break;
          await storage.delete(value7.key), value5 -= value7.chars;
        }
        if (value5 > CRASH_STASH_MAX_TOTAL_CHARS)
          return !1;
        let value6 = value2.find((input) => input.key === value)?.createdAt ?? now();
        return await storage.put({
          key: value,
          artifactId,
          viewerId,
          tabId,
          createdAt: value6,
          at: now(),
          version: options,
          edits: items3,
          chars: index4
        }), items3.length === items2.length;
      }),
      read: () => callback(void 0, async () => {
        if (viewerId === "")
          return;
        let value2 = await callback4(), value3 = (await callback3()).filter((input) => input.artifactId === artifactId && input.viewerId === viewerId && !value2.has(input.tabId)).sort((input, options) => input.at - options.at);
        items = value3.map((input) => ({
          key: input.key,
          at: input.at
        }));
        let entries = /* @__PURE__ */ new Map();
        for (let value5 of value3)
          for (let value6 of value5.edits)
            entries.set(value6.path, value6);
        if (entries.size === 0)
          return;
        let value4 = value3[value3.length - 1];
        return {
          createdAt: Math.min(...value3.map((input) => input.createdAt)),
          at: value4.at,
          version: value4.version,
          edits: [...entries.values()]
        };
      }),
      clear: () => callback(void 0, () => storage.delete(value)),
      clearOffered: () => callback(void 0, async () => {
        let value2 = items;
        items = [];
        let entries = new Map((await storage.all()).map((input) => [
          input.key,
          input.at
        ]));
        for (let value3 of value2)
          entries.get(value3.key) === value3.at && await storage.delete(value3.key);
      }),
      clearArtifact: () => callback(void 0, async () => {
        for (let value2 of await storage.all())
          typeof value2?.artifactId == "string" && callback2(value2) && await storage.delete(value2.key);
      }),
      purgeOtherViewers: () => callback(void 0, async () => {
        for (let value2 of await callback3())
          viewerId !== "" && callback2(value2) && value2.viewerId !== viewerId && await storage.delete(value2.key);
      })
    };
  }
  function awaitIndexedDbRequest(request) {
    return new Promise((input, options) => {
      request.onsuccess = () => input(request.result), request.onerror = () => options(request.error ?? Error("indexedDB request failed"));
    });
  }
  function createIndexedDbCrashStashStorage(indexedDb) {
    let value, callback = () => (value ??= new Promise((input, options) => {
      let value2 = indexedDb.open(CRASH_STASH_DATABASE_NAME, 1);
      value2.onupgradeneeded = () => {
        value2.result.createObjectStore(CRASH_STASH_OBJECT_STORE, {
          keyPath: "key"
        });
      }, value2.onsuccess = () => input(value2.result), value2.onerror = () => options(value2.error ?? Error("indexedDB open failed")), value2.onblocked = () => options(Error("indexedDB open blocked"));
    }), value.catch(() => {
      value = void 0;
    }), value), callback2 = async (input) => {
      let value2 = (await callback()).transaction(CRASH_STASH_OBJECT_STORE, "readwrite"), promise = new Promise((input2, options) => {
        value2.oncomplete = () => input2(), value2.onerror = () => options(value2.error ?? Error("indexedDB transaction failed")), value2.onabort = () => options(value2.error ?? Error("indexedDB transaction aborted"));
      });
      await Promise.all([
        awaitIndexedDbRequest(input(value2.objectStore(CRASH_STASH_OBJECT_STORE))),
        promise
      ]);
    };
    return {
      all: async () => awaitIndexedDbRequest((await callback()).transaction(CRASH_STASH_OBJECT_STORE, "readonly").objectStore(CRASH_STASH_OBJECT_STORE).getAll()),
      put: (input) => callback2((input2) => input2.put(input)),
      delete: (input) => callback2((input2) => input2.delete(input))
    };
  }
  function artifactPathWithoutFrameScope(location2 = globalThis.location) {
    return (location2?.pathname ?? "").replace(FRAME_SCOPE_PATH_PATTERN, "$1");
  }
  function claimCrashStashTabLock(tabId) {
    let locks = getNavigatorLocks();
    return locks === void 0 ? () => Promise.resolve(/* @__PURE__ */ new Set()) : (locks.request(CRASH_STASH_TAB_LOCK_PREFIX + tabId, () => new Promise(() => {
    })).catch(() => {
    }), async () => new Set(((await locks.query()).held ?? []).map((input) => input.name ?? "").filter((input) => input.startsWith(CRASH_STASH_TAB_LOCK_PREFIX)).map((input) => input.slice(CRASH_STASH_TAB_LOCK_PREFIX.length))));
  }
  function createIndexedDbCrashStashKit(options) {
    let indexedDb;
    try {
      indexedDb = options.indexedDB ?? globalThis.indexedDB;
    } catch {
      indexedDb = void 0;
    }
    if (indexedDb === void 0 || typeof options.viewerId != "string")
      return null;
    let tabId = options.tabId ?? crypto.randomUUID();
    return createCrashStashKit(createIndexedDbCrashStashStorage(indexedDb), options.artifactId ?? artifactPathWithoutFrameScope(), options.viewerId, tabId, options.now ?? Date.now, options.liveTabs ?? claimCrashStashTabLock(tabId));
  }
  async function createCurrentArtifactCrashStash(scope = "") {
    let value = await (0, runtime2.currentUserId)() ?? "", value2 = createIndexedDbCrashStashKit({
      viewerId: value,
      artifactId: artifactPathWithoutFrameScope() + (scope === "" ? "" : "#" + scope)
    });
    return await value2?.purgeOtherViewers(), value2;
  }
  return bindRuntimeValue(runtime2, "CRASH_STASH_MAX_AGE_MS", () => CRASH_STASH_MAX_AGE_MS, (value) => {
    CRASH_STASH_MAX_AGE_MS = value;
  }), bindRuntimeValue(runtime2, "CRASH_STASH_RETENTION_LABEL", () => CRASH_STASH_RETENTION_LABEL, (value) => {
    CRASH_STASH_RETENTION_LABEL = value;
  }), bindRuntimeValue(runtime2, "CRASH_STASH_MAX_ENTRIES", () => CRASH_STASH_MAX_ENTRIES, (value) => {
    CRASH_STASH_MAX_ENTRIES = value;
  }), bindRuntimeValue(runtime2, "CRASH_STASH_MAX_ARTIFACT_CHARS", () => CRASH_STASH_MAX_ARTIFACT_CHARS, (value) => {
    CRASH_STASH_MAX_ARTIFACT_CHARS = value;
  }), bindRuntimeValue(runtime2, "CRASH_STASH_MAX_TOTAL_CHARS", () => CRASH_STASH_MAX_TOTAL_CHARS, (value) => {
    CRASH_STASH_MAX_TOTAL_CHARS = value;
  }), bindRuntimeValue(runtime2, "crashStashIdentityKey", () => crashStashIdentityKey, (value) => {
    crashStashIdentityKey = value;
  }), bindRuntimeValue(runtime2, "crashStashEntrySize", () => crashStashEntrySize, (value) => {
    crashStashEntrySize = value;
  }), bindRuntimeValue(runtime2, "stripArtifactScopeFragment", () => stripArtifactScopeFragment, (value) => {
    stripArtifactScopeFragment = value;
  }), bindRuntimeValue(runtime2, "isCrashStashEntry", () => isCrashStashEntry, (value) => {
    isCrashStashEntry = value;
  }), bindRuntimeValue(runtime2, "createCrashStashKit", () => createCrashStashKit), bindRuntimeValue(runtime2, "CRASH_STASH_DATABASE_NAME", () => CRASH_STASH_DATABASE_NAME, (value) => {
    CRASH_STASH_DATABASE_NAME = value;
  }), bindRuntimeValue(runtime2, "CRASH_STASH_OBJECT_STORE", () => CRASH_STASH_OBJECT_STORE, (value) => {
    CRASH_STASH_OBJECT_STORE = value;
  }), bindRuntimeValue(runtime2, "awaitIndexedDbRequest", () => awaitIndexedDbRequest), bindRuntimeValue(runtime2, "createIndexedDbCrashStashStorage", () => createIndexedDbCrashStashStorage), bindRuntimeValue(runtime2, "FRAME_SCOPE_PATH_PATTERN", () => FRAME_SCOPE_PATH_PATTERN, (value) => {
    FRAME_SCOPE_PATH_PATTERN = value;
  }), bindRuntimeValue(runtime2, "artifactPathWithoutFrameScope", () => artifactPathWithoutFrameScope), bindRuntimeValue(runtime2, "CRASH_STASH_TAB_LOCK_PREFIX", () => CRASH_STASH_TAB_LOCK_PREFIX, (value) => {
    CRASH_STASH_TAB_LOCK_PREFIX = value;
  }), bindRuntimeValue(runtime2, "getNavigatorLocks", () => getNavigatorLocks, (value) => {
    getNavigatorLocks = value;
  }), bindRuntimeValue(runtime2, "claimCrashStashTabLock", () => claimCrashStashTabLock), bindRuntimeValue(runtime2, "createIndexedDbCrashStashKit", () => createIndexedDbCrashStashKit), bindRuntimeValue(runtime2, "createCurrentArtifactCrashStash", () => createCurrentArtifactCrashStash), () => {
    CRASH_STASH_MAX_AGE_MS = 2592e5, CRASH_STASH_RETENTION_LABEL = "3 days", CRASH_STASH_MAX_ENTRIES = 64, CRASH_STASH_MAX_ARTIFACT_CHARS = 1e6, CRASH_STASH_MAX_TOTAL_CHARS = 2e6, crashStashIdentityKey = (artifactId, viewerId, tabId) => [artifactId, viewerId, tabId].join("\0"), crashStashEntrySize = (entry) => entry.path.length + (entry.text?.length ?? 0), stripArtifactScopeFragment = (artifactId) => artifactId.split("#")[0], isCrashStashEntry = (entry) => typeof entry?.key == "string" && typeof entry.artifactId == "string" && typeof entry.viewerId == "string" && Number.isFinite(entry.createdAt) && Number.isFinite(entry.at) && Number.isFinite(entry.chars) && entry.chars >= 0 && Array.isArray(entry.edits) && entry.edits.every((input) => typeof input?.path == "string" && (typeof input.text == "string" || input.text === null) && (typeof input.base == "string" || input.base === null)), CRASH_STASH_DATABASE_NAME = "appifact-crash-stash", CRASH_STASH_OBJECT_STORE = "entries", FRAME_SCOPE_PATH_PATTERN = /(^|\/)_f\/[^/]+\//, CRASH_STASH_TAB_LOCK_PREFIX = "appifact-stash-tab:", getNavigatorLocks = () => {
      try {
        return globalThis.navigator?.locks;
      } catch {
        return;
      }
    };
  };
}
export {
  installFilesCrashStash
};
