// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesBrowserPort(runtime2) {
  var FILE_LISTING_PATH, supportsFilesPublish, FILE_PUBLISH_WRITE_REVOKED_CODES, FILE_PUBLISH_ERROR_CODE_MAP, FILE_SHA256_PATTERN, normalizeFileSha256, FILE_SCOPE_PATH_PATTERN, FILE_FETCH_TIMEOUT_MS, fileTextDecoder;
  async function getFilesPublishCapability() {
    return await (0, runtime2.getOrLoadHostCapability)("artifact", supportsFilesPublish) ?? await (0, runtime2.getOrLoadHostCapability)("self", supportsFilesPublish);
  }
  function parseFileShaListing(value) {
    if (!Array.isArray(value))
      return;
    let entries = [];
    for (let value2 of value) {
      let value3 = normalizeFileSha256(value2?.sha256);
      if (typeof value2?.path != "string" || value3 === void 0)
        return;
      entries.push({
        path: value2.path,
        sha256: value3
      });
    }
    return entries;
  }
  function parseFilePublishConflicts(value) {
    if (!Array.isArray(value))
      return;
    let conflicts = [];
    for (let value2 of value) {
      let value3 = normalizeFileSha256("actual" in (value2 ?? {}) ? value2.actual : value2?.liveSha);
      if (typeof value2?.path != "string" || value3 === void 0)
        return;
      let value4 = normalizeFileSha256(value2.expected);
      conflicts.push({
        path: value2.path,
        liveSha: value3,
        ...value4 !== void 0 ? {
          expected: value4
        } : {}
      });
    }
    return conflicts;
  }
  function normalizeFilesPublishError(error) {
    let record = typeof error == "object" && error !== null ? error : {}, code = (typeof record.code == "string" ? FILE_PUBLISH_ERROR_CODE_MAP[record.code] : void 0) ?? "upstream_error", retryAfterMs = typeof record.retryAfterMs == "number" ? record.retryAfterMs : typeof record.retry_after_ms == "number" ? record.retry_after_ms : void 0, value = parseFilePublishConflicts(record.paths), value2 = parseFileShaListing(record.changed);
    return {
      ok: !1,
      code,
      ...typeof record.live == "string" ? {
        live: record.live
      } : {},
      ...retryAfterMs !== void 0 ? {
        retryAfterMs
      } : {},
      ...value !== void 0 ? {
        paths: value
      } : {},
      ...value2 !== void 0 ? {
        changed: value2
      } : {}
    };
  }
  function createBrowserFilesPort(options = {}) {
    let fetchFile = options.fetch ?? ((input) => globalThis.fetch(input)), fetchFresh = options.fetchFresh ?? fetchFile, freshReads = !1, now = () => globalThis.performance?.now() ?? Date.now(), fetchWithReadTelemetry = async (input) => {
      let value = freshReads, value2 = now();
      try {
        let value3 = await (value ? fetchFresh : fetchFile)(input);
        try {
          options.onRead?.(input, now() - value2, value3.status, value);
        } catch {
        }
        return value3;
      } catch (value3) {
        try {
          options.onRead?.(input, now() - value2, 0, value);
        } catch {
        }
        throw value3;
      }
    }, resolvePublishCapability = options.resolveNs ?? getFilesPublishCapability, pageLocation = options.location ?? globalThis.location, version2 = options.bootVersion ?? {
      version: FILE_SCOPE_PATH_PATTERN.exec(pageLocation?.pathname ?? "")?.[1] ?? ""
    }, canWrite = options.canWrite ?? !0, bootFiles = options.bootFiles, bootNarrowed = options.bootNarrowed === !0, listingNarrowed = !1, listingCache, heldFileShas = /* @__PURE__ */ new Map(), publishedFileOverrides = /* @__PURE__ */ new Map(), ownPublishedVersions = /* @__PURE__ */ new Set(), publishGeneration = 0, maxRetainedVersions = 64, publishGenerationByVersion = /* @__PURE__ */ new Map(), lastPublishedGenerationByPath = /* @__PURE__ */ new Map(), fileReadCache = /* @__PURE__ */ new Map(), remoteChangeSubscribers = /* @__PURE__ */ new Set(), listingEntryDiffers = (input) => {
      let entry = publishedFileOverrides.get(input.path);
      return entry !== void 0 && !locallyDeletedPaths.has(input.path) && (entry === null ? null : entry.sha256) !== input.sha256;
    }, parseListingEntry = (input, options2) => typeof options2?.sha256 == "string" ? {
      sha256: options2.sha256,
      size: typeof options2.size == "number" ? options2.size : 0,
      contentType: typeof options2.contentType == "string" ? options2.contentType : (0, runtime2.fileMimeTypeFromPath)(input) ?? "application/octet-stream"
    } : void 0;
    async function fetchListing() {
      let entries = /* @__PURE__ */ new Map();
      if (bootFiles !== void 0) {
        let value3 = bootNarrowed, value4 = Array.isArray(bootFiles) ? bootFiles.map((input) => [
          input.path,
          input
        ]) : Object.entries(bootFiles);
        for (let [value5, value6] of value4) {
          let value7 = parseListingEntry(value5, value6);
          value7 && entries.set(value5, value7);
        }
        return {
          files: entries,
          narrowed: value3
        };
      }
      let value = await fetchWithReadTelemetry(FILE_LISTING_PATH);
      if (!value.ok)
        throw {
          code: value.status === 404 ? "not_found" : "http",
          status: value.status,
          message: FILE_LISTING_PATH + ": HTTP " + String(value.status)
        };
      let value2 = await value.json();
      if (value2 === null || typeof value2 != "object" || value2.files === null || typeof value2.files != "object" || Array.isArray(value2.files))
        throw {
          code: "http",
          status: value.status,
          malformed: !0,
          message: FILE_LISTING_PATH + ": no files object"
        };
      typeof value2.ver == "string" && version2.version === "" && (version2 = {
        version: value2.ver
      });
      let files = value2.files;
      for (let [value3, value4] of Object.entries(files)) {
        let value5 = parseListingEntry(value3, value4);
        value5 && entries.set(value3, value5);
      }
      return {
        files: entries,
        narrowed: value2.narrowed === !0
      };
    }
    function overlayPublishedFiles(input) {
      for (let [value, value2] of publishedFileOverrides)
        value2 === null ? input.delete(value) : input.set(value, {
          sha256: value2.sha256,
          size: value2.bytes.length,
          contentType: value2.contentType
        });
    }
    async function readListing(input = !1) {
      let value = listingGeneration;
      input && canWrite && bootNarrowed && (bootFiles = void 0, bootNarrowed = !1);
      let value2 = await fetchListing();
      if (input && canWrite && value2.narrowed)
        throw {
          code: "http",
          status: 403,
          narrowed: !0,
          message: FILE_LISTING_PATH + ": marked as narrowed"
        };
      let value3 = Object.defineProperty(value2.files, "narrowed", {
        value: value2.narrowed
      });
      return overlayPublishedFiles(value3), value === listingGeneration && !(canWrite && value2.narrowed && listingCache !== void 0 && !listingNarrowed) && (listingCache = value3, listingNarrowed = value2.narrowed, listingCacheGeneration = listingGeneration), value3;
    }
    let listingReadPromise, lastUnavailableListingGeneration = -1;
    function ensureListing() {
      let value = listingGeneration;
      if (!canWrite && lastUnavailableListingGeneration === value)
        return Promise.resolve(void 0);
      if (listingReadPromise?.at === value)
        return listingReadPromise.p;
      let state = {
        at: value,
        p: readListing().catch((input) => {
          let value2 = input?.status;
          !canWrite && (value2 === 401 || value2 === 403) && (lastUnavailableListingGeneration = value);
        }).finally(() => {
          listingReadPromise === state && (listingReadPromise = void 0);
        })
      };
      return listingReadPromise = state, state.p;
    }
    let currentFrameVersion = () => FILE_SCOPE_PATH_PATTERN.exec(pageLocation?.pathname ?? "")?.[1];
    function checkReadRedirect(input, options2, context) {
      if (input.redirected !== !0 || !freshReads || !canWrite || context === void 0)
        return;
      let value;
      try {
        value = FILE_SCOPE_PATH_PATTERN.exec(new URL(input.url ?? "", "https://page.invalid").pathname)?.[1];
      } catch {
        value = void 0;
      }
      if (value !== void 0 && value !== context)
        throw {
          code: "redirected",
          status: 403,
          redirectedTo: input.url,
          message: options2 + ": answered by a redirect to /_f/" + value + "/, not the version this page addresses (/_f/" + context + "/); asked for again"
        };
    }
    async function readFileBytes(input, options2 = !1) {
      let entry = publishedFileOverrides.get(input);
      if (entry === null)
        throw {
          code: "not_found",
          status: 404,
          message: input + ": deleted by this tab"
        };
      if (entry !== void 0)
        return heldFileShas.set(input, entry.sha256), {
          bytes: entry.bytes,
          sha256: entry.sha256,
          contentType: entry.contentType,
          raw: !1
        };
      let entry2 = fileReadCache.get(input);
      if (entry2 !== void 0 && (listingCache?.get(input)?.sha256 ?? entry2.sha256) === entry2.sha256)
        return {
          ...entry2,
          raw: !0
        };
      let value = currentFrameVersion(), [value2, value3] = await Promise.all([
        fetchWithReadTelemetry((0, runtime2.encodeFileUrlPath)(input)),
        listingCache !== void 0 ? Promise.resolve(listingCache) : ensureListing()
      ]);
      if (options2 || checkReadRedirect(value2, input, value), !value2.ok)
        throw {
          code: value2.status === 404 ? "not_found" : "http",
          status: value2.status,
          message: input + ": HTTP " + String(value2.status)
        };
      let value4 = new Uint8Array(await value2.arrayBuffer()), value5 = value3?.get(input), value6 = value5?.sha256 ?? "", value7 = value5?.contentType ?? value2.headers?.get("content-type")?.split(";")[0]?.trim() ?? (0, runtime2.fileMimeTypeFromPath)(input) ?? "application/octet-stream";
      return {
        bytes: value4,
        sha256: value6,
        contentType: value7,
        raw: !0
      };
    }
    let publishSupportsDelete = !1, locallyDeletedPaths = /* @__PURE__ */ new Set(), publishChain = Promise.resolve(), listingGeneration = 0, listingCacheGeneration = 0, remoteVersionGeneration = 0, hotChangeGeneration = 0;
    function enqueuePublish(input, options2) {
      let value = remoteVersionGeneration, value2 = publishChain.then(() => publish(input, options2, value));
      return publishChain = value2.catch(() => {
      }), value2;
    }
    async function publish(input, options2, context) {
      if (canWrite && (listingCache === void 0 || listingNarrowed) && await Promise.race([
        readListing().catch(() => {
        }),
        new Promise((input2) => void setTimeout(input2, FILE_FETCH_TIMEOUT_MS))
      ]), !canWrite || listingNarrowed)
        return {
          ok: !1,
          code: "not_writer"
        };
      let value = (0, runtime2.validateFilePublishBatch)(input);
      if (value)
        return value;
      if (context !== remoteVersionGeneration && options2?.ifMatch !== void 0)
        return {
          ok: !1,
          code: "conflict",
          live: version2.version
        };
      let value2 = await resolvePublishCapability();
      if (value2 === null)
        return canWrite = !1, {
          ok: !1,
          code: "capability_disabled"
        };
      let value3 = Object.keys(input).flatMap((input2) => {
        let entry = publishedFileOverrides.get(input2), value12 = options2?.ifMatch !== void 0 && Object.hasOwn(options2.ifMatch, input2) ? options2.ifMatch[input2] : void 0, value13 = entry === void 0 ? void 0 : entry === null ? null : entry.sha256;
        return value12 === void 0 || value13 === void 0 || locallyDeletedPaths.has(input2) || value12 === value13 ? [] : [
          {
            path: input2,
            liveSha: value13,
            expected: value12
          }
        ];
      });
      if (value3.length > 0)
        return {
          ok: !1,
          code: "conflict",
          live: version2.version,
          paths: value3
        };
      let state = {};
      for (let [value12, value13] of Object.entries(input))
        state[value12] = (0, runtime2.normalizeFilePublishInput)(value12, value13);
      let state2 = {}, items = [], value4 = options.preconditions === void 0 ? {
        writes: !0,
        deletes: !0
      } : options.preconditions === !1 ? {} : options.preconditions, value5 = value4.writes === !0, value6 = value5 && value4.deletes === !0;
      for (let [value12, value13] of Object.entries(state)) {
        let value14 = options2?.ifMatch !== void 0 && Object.hasOwn(options2.ifMatch, value12) ? options2.ifMatch[value12] : void 0, value15 = value14;
        typeof value15 == "string" && locallyDeletedPaths.has(value12) && publishedFileOverrides.get(value12)?.sha256 === value15 && (value15 = void 0), typeof value15 == "string" && !FILE_SHA256_PATTERN.test(value15) && (value15 = void 0), value13 !== null ? state2[value12] = value5 && value15 !== void 0 ? {
          ...value13,
          ifMatch: value15
        } : value13 : state2[value12] = value6 && publishSupportsDelete && typeof value15 == "string" ? {
          delete: !0,
          ifMatch: value15
        } : null;
        let value16 = state2[value12];
        value14 !== void 0 && (value16 == null || !("ifMatch" in value16)) && items.push(value12);
      }
      let entries = /* @__PURE__ */ new Map();
      for (let [value12, value13] of Object.entries(state))
        if (value13 !== null) {
          let value14 = await (0, runtime2.fileContentBytes)(value13.content);
          entries.set(value12, {
            bytes: value14,
            hash: await (0, runtime2.sha256)(value14)
          });
        }
      if (context !== remoteVersionGeneration && options2?.ifMatch !== void 0)
        return {
          ok: !1,
          code: "conflict",
          live: version2.version
        };
      let version22 = version2.version, value7 = hotChangeGeneration, value8;
      try {
        value8 = await value2.publish(state2);
      } catch (value12) {
        try {
          options.onPublishError?.(value12);
        } catch {
        }
        let value13 = normalizeFilesPublishError(value12);
        return FILE_PUBLISH_WRITE_REVOKED_CODES.has(value13.code) && (canWrite = !1), value13;
      }
      let state3 = {}, value9 = hotChangeGeneration !== value7, items2 = [];
      for (let [value12, value13] of Object.entries(state)) {
        if (value13 === null) {
          heldFileShas.set(value12, null), value9 || (publishedFileOverrides.set(value12, null), listingCache?.delete(value12), locallyDeletedPaths.delete(value12));
          continue;
        }
        let { bytes: entry, hash: entry2 } = entries.get(value12), value14 = value8.shas?.[value12], value15 = value14 ?? entry2;
        value14 === void 0 && items2.push(value12), state3[value12] = value15, heldFileShas.set(value12, value15), !value9 && (value14 === void 0 && (0, runtime2.fileContentContainsRuntimeMarkers)(value13) ? locallyDeletedPaths.add(value12) : locallyDeletedPaths.delete(value12), publishedFileOverrides.set(value12, {
          sha256: value15,
          bytes: entry,
          contentType: value13.contentType
        }), listingCache?.set(value12, {
          sha256: value15,
          size: entry.length,
          contentType: value13.contentType
        }));
      }
      bootFiles = void 0, value9 || (version2 = {
        version: value8.version,
        ...typeof value8.seq == "number" ? {
          seq: value8.seq
        } : {}
      });
      let value10 = value8.shas !== void 0 && value8.shas !== null && typeof value8.shas == "object" && !Array.isArray(value8.shas);
      value10 && (publishSupportsDelete = !0);
      let value11 = parseFileShaListing(value8.changed);
      !(value11 !== void 0 ? value11.length > 0 : value10 && items.length === 0) && !value9 && value8.unchanged !== !0 && value8.version !== version22 && ownPublishedVersions.add(value8.version), publishGeneration += 1, value8.unchanged !== !0 && value8.version !== version22 && (publishGenerationByVersion.set(value8.version, publishGeneration), publishGenerationByVersion.size > maxRetainedVersions && publishGenerationByVersion.delete(publishGenerationByVersion.keys().next().value));
      for (let value12 of Object.keys(state))
        lastPublishedGenerationByPath.set(value12, publishGeneration);
      return {
        ok: !0,
        version: value8.version,
        ...typeof value8.seq == "number" ? {
          seq: value8.seq
        } : {},
        shas: state3,
        ...items2.length > 0 ? {
          computed: items2
        } : {},
        ...value8.unchanged === !0 ? {
          unchanged: !0
        } : {},
        ...value10 && items.length === 0 ? {
          preconditionsChecked: !0
        } : {},
        ...value10 && items.length > 0 ? {
          unguarded: items
        } : {},
        ...value11 !== void 0 ? {
          changed: value11
        } : {}
      };
    }
    async function readFileText(input, options2) {
      let value = await readFileBytes(input, options2), value2 = fileTextDecoder.decode(value.bytes);
      value.raw && (0, runtime2.isHtmlFilePath)(input) && (value2 = (0, runtime2.stripFrameRuntimeBlock)(value2));
      let value3 = value.sha256 !== "" ? value.sha256 : await (0, runtime2.sha256)(value2);
      return heldFileShas.set(input, value3), {
        text: value2,
        sha256: value3
      };
    }
    let listingToFiles = (input) => {
      let value = [...input].sort(([input2], [options2]) => input2 < options2 ? -1 : 1).map(([input2, input3]) => ({
        path: input2,
        ...input3,
        ...locallyDeletedPaths.has(input2) && publishedFileOverrides.get(input2)?.sha256 === input3.sha256 ? {
          provisional: !0
        } : {}
      }));
      return Object.defineProperty(value, "narrowed", {
        value: input.narrowed === !0
      });
    };
    return {
      get canWrite() {
        return canWrite && !listingNarrowed;
      },
      get narrowed() {
        return listingNarrowed;
      },
      get mayWrite() {
        return canWrite;
      },
      forgetBootListing() {
        bootFiles = void 0, bootNarrowed = !1;
      },
      async listUnlessNarrowed() {
        return listingToFiles(await readListing(!0));
      },
      version: () => version2,
      async list() {
        return listingToFiles(await readListing());
      },
      async readBytes(input) {
        let value = await readFileBytes(input), value2 = value.sha256 !== "" ? value.sha256 : await (0, runtime2.sha256)(value.bytes);
        return heldFileShas.set(input, value2), {
          bytes: value.bytes,
          sha256: value2,
          contentType: value.contentType
        };
      },
      async peekBytes(input) {
        let callback = () => {
          let entry2 = publishedFileOverrides.get(input);
          if (entry2 === null)
            throw {
              code: "not_found",
              status: 404,
              message: input + ": deleted by this tab"
            };
          if (entry2 !== void 0)
            return {
              bytes: entry2.bytes.slice(),
              ...locallyDeletedPaths.has(input) ? {} : {
                sha256: entry2.sha256
              },
              contentType: entry2.contentType
            };
        }, value = callback();
        if (value !== void 0)
          return value;
        let entry = fileReadCache.get(input);
        if (entry !== void 0 && (listingCache?.get(input)?.sha256 ?? entry.sha256) === entry.sha256)
          return {
            bytes: entry.bytes.slice(),
            sha256: entry.sha256,
            contentType: entry.contentType
          };
        let value2 = listingGeneration, value3 = listingCache?.get(input)?.sha256, value4 = currentFrameVersion(), value5 = await fetchWithReadTelemetry((0, runtime2.encodeFileUrlPath)(input));
        if (checkReadRedirect(value5, input, value4), !value5.ok)
          throw {
            code: value5.status === 404 ? "not_found" : "http",
            status: value5.status,
            message: input + ": HTTP " + String(value5.status)
          };
        let value6 = new Uint8Array(await value5.arrayBuffer()), value7 = callback();
        if (value7 !== void 0)
          return value7;
        let value8 = listingCache?.get(input), value9 = value2 === listingGeneration && listingCacheGeneration === listingGeneration && value8?.sha256 === value3 && value3 !== "" ? value3 : void 0;
        return {
          bytes: value6,
          ...value9 !== void 0 ? {
            sha256: value9
          } : {},
          contentType: value8?.contentType ?? value5.headers?.get("content-type")?.split(";")[0]?.trim() ?? (0, runtime2.fileMimeTypeFromPath)(input) ?? "application/octet-stream"
        };
      },
      peekRows: () => listingCache === void 0 ? void 0 : listingToFiles(listingCache),
      readText: (input) => readFileText(input, !1),
      readTextUnchecked: (input) => readFileText(input, !0),
      publish: enqueuePublish,
      onRemoteChange(input) {
        return remoteChangeSubscribers.add(input), () => void remoteChangeSubscribers.delete(input);
      },
      liveSha: (input) => {
        if (listingCache === void 0)
          return publishedFileOverrides.get(input)?.sha256;
        let value = listingCache.get(input)?.sha256;
        if (value !== "")
          return value ?? (listingNarrowed ? void 0 : null);
      },
      heldSha: (input) => heldFileShas.get(input),
      olderThanMyWrite: (input, options2) => {
        let entry = publishGenerationByVersion.get(input), entry2 = lastPublishedGenerationByPath.get(options2);
        return entry !== void 0 && entry2 !== void 0 && entry2 > entry;
      },
      wroteSinceAdopt: (input) => publishedFileOverrides.get(input) !== void 0 && publishedFileOverrides.get(input) !== null,
      knownListing: () => new Map([...listingCache ?? []].map(([input, input2]) => [
        input,
        input2.sha256
      ])),
      primeRead(input, options2) {
        publishedFileOverrides.has(input) || (fileReadCache.set(input, options2), listingCache !== void 0 && options2.sha256 !== "" && listingCache.set(input, {
          sha256: options2.sha256,
          size: options2.bytes.length,
          contentType: options2.contentType
        }));
      },
      noteIncoming(input) {
        for (let value of input)
          if (!listingEntryDiffers(value)) {
            if (value.sha256 === null) {
              heldFileShas.delete(value.path), fileReadCache.delete(value.path), listingCache?.delete(value.path);
              continue;
            }
            if (listingCache !== void 0) {
              let entry = listingCache.get(value.path);
              entry?.sha256 !== value.sha256 && listingCache.set(value.path, {
                sha256: value.sha256,
                size: 0,
                contentType: entry?.contentType ?? (0, runtime2.fileMimeTypeFromPath)(value.path) ?? "application/octet-stream"
              });
            }
          }
        listingCacheGeneration = listingGeneration;
      },
      noteAdopted(input) {
        if (freshReads = !0, listingGeneration += 1, ownPublishedVersions.has(input.version) && listingCacheGeneration === listingGeneration - 1 && (listingCacheGeneration = listingGeneration), fileReadCache.clear(), bootFiles = void 0, !ownPublishedVersions.has(input.version)) {
          let entry = publishGenerationByVersion.get(input.version);
          for (let [value, value2] of [...publishedFileOverrides])
            entry !== void 0 && (lastPublishedGenerationByPath.get(value) ?? 0) > entry || (listingCache !== void 0 && value2 !== null && listingCache.set(value, {
              sha256: "",
              size: listingCache.get(value)?.size ?? 0,
              contentType: listingCache.get(value)?.contentType ?? (0, runtime2.fileMimeTypeFromPath)(value) ?? "application/octet-stream"
            }), publishedFileOverrides.delete(value), locallyDeletedPaths.delete(value));
          if (entry !== void 0 && listingCache !== void 0)
            for (let [value, value2] of lastPublishedGenerationByPath)
              value2 >= entry && !publishedFileOverrides.has(value) && listingCache.has(value) && listingCache.set(value, {
                sha256: "",
                size: listingCache.get(value)?.size ?? 0,
                contentType: listingCache.get(value)?.contentType ?? (0, runtime2.fileMimeTypeFromPath)(value) ?? "application/octet-stream"
              });
          for (let value of [...ownPublishedVersions])
            (entry === void 0 || (publishGenerationByVersion.get(value) ?? 0) <= entry) && ownPublishedVersions.delete(value);
          remoteVersionGeneration += 1, entry === void 0 && (hotChangeGeneration += 1);
        }
        version2 = input;
      },
      noteRemote(input) {
        let value = input.changed.filter((input2) => listingEntryDiffers(input2) === !1);
        for (let value3 of value)
          if (listingCache !== void 0)
            if (value3.sha256 === null)
              listingCache.delete(value3.path);
            else {
              let entry = listingCache.get(value3.path);
              listingCache.set(value3.path, {
                sha256: value3.sha256,
                size: entry?.sha256 === value3.sha256 ? entry.size : 0,
                contentType: entry?.contentType ?? (0, runtime2.fileMimeTypeFromPath)(value3.path) ?? "application/octet-stream"
              });
            }
        let value2 = value.length === input.changed.length ? input : {
          ...input,
          changed: value
        };
        for (let value3 of [...remoteChangeSubscribers])
          try {
            value3(value2);
          } catch {
          }
      }
    };
  }
  return bindRuntimeValue(runtime2, "FILE_LISTING_PATH", () => FILE_LISTING_PATH, (value) => {
    FILE_LISTING_PATH = value;
  }), bindRuntimeValue(runtime2, "supportsFilesPublish", () => supportsFilesPublish, (value) => {
    supportsFilesPublish = value;
  }), bindRuntimeValue(runtime2, "getFilesPublishCapability", () => getFilesPublishCapability), bindRuntimeValue(runtime2, "FILE_PUBLISH_WRITE_REVOKED_CODES", () => FILE_PUBLISH_WRITE_REVOKED_CODES, (value) => {
    FILE_PUBLISH_WRITE_REVOKED_CODES = value;
  }), bindRuntimeValue(runtime2, "FILE_PUBLISH_ERROR_CODE_MAP", () => FILE_PUBLISH_ERROR_CODE_MAP, (value) => {
    FILE_PUBLISH_ERROR_CODE_MAP = value;
  }), bindRuntimeValue(runtime2, "FILE_SHA256_PATTERN", () => FILE_SHA256_PATTERN, (value) => {
    FILE_SHA256_PATTERN = value;
  }), bindRuntimeValue(runtime2, "normalizeFileSha256", () => normalizeFileSha256, (value) => {
    normalizeFileSha256 = value;
  }), bindRuntimeValue(runtime2, "parseFileShaListing", () => parseFileShaListing), bindRuntimeValue(runtime2, "parseFilePublishConflicts", () => parseFilePublishConflicts), bindRuntimeValue(runtime2, "normalizeFilesPublishError", () => normalizeFilesPublishError), bindRuntimeValue(runtime2, "FILE_SCOPE_PATH_PATTERN", () => FILE_SCOPE_PATH_PATTERN, (value) => {
    FILE_SCOPE_PATH_PATTERN = value;
  }), bindRuntimeValue(runtime2, "FILE_FETCH_TIMEOUT_MS", () => FILE_FETCH_TIMEOUT_MS, (value) => {
    FILE_FETCH_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "fileTextDecoder", () => fileTextDecoder, (value) => {
    fileTextDecoder = value;
  }), bindRuntimeValue(runtime2, "createBrowserFilesPort", () => createBrowserFilesPort), () => {
    FILE_LISTING_PATH = "_files.json", supportsFilesPublish = (0, runtime2.capabilityHasMethod)("publish"), FILE_PUBLISH_WRITE_REVOKED_CODES = /* @__PURE__ */ new Set([
      "not_writer",
      "not_declared",
      "capability_disabled"
    ]), FILE_PUBLISH_ERROR_CODE_MAP = {
      conflict: "conflict",
      rate_limited: "rate_limited",
      too_large: "too_large",
      not_writer: "not_writer",
      not_declared: "not_declared",
      invalid_content: "invalid_content",
      read_only_path: "read_only_path",
      capability_disabled: "capability_disabled",
      upstream_error: "upstream_error",
      not_granted: "capability_disabled",
      consent_required: "capability_disabled",
      capability_removed: "capability_disabled",
      transform_error: "invalid_content"
    }, FILE_SHA256_PATTERN = /^[0-9a-f]{64}$/, normalizeFileSha256 = (input) => input === null ? null : typeof input == "string" && FILE_SHA256_PATTERN.test(input) ? input : void 0, FILE_SCOPE_PATH_PATTERN = /\/_f\/([^/]+)\//, FILE_FETCH_TIMEOUT_MS = 1e4, fileTextDecoder = new TextDecoder();
  };
}
export {
  installFilesBrowserPort
};
