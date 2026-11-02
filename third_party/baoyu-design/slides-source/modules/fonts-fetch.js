// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsFetch(runtime2) {
  var googleFontsImportRegex, googleFontFileUrlRegex, resourceFetchTimeoutMs, resourceFetchRetryBudgetMs, defaultResourceFetchRetryDelayMs, minimumResourceFetchRetryMs, resourceFetchRetryDelayMs, ResourceFetchError, retryableHttpStatuses, fetchErrorStatus, isNonRetryableFetchStatus, isNonRetryableFetchError, warmedStylesheets, warmingStylesheets, stylesheetWarmingStarted = !1, unwarmedStylesheets, googleFontFaceSheetPattern, defaultStylesheetWarmingSchedule, stylesheetWarmingSchedule, maxPrefetchedFontFiles, maxPrefetchedFontBytes, prefetchedFontFiles, prefetchedFontBytes = 0, keepPrefetchedFontDataUrls = !1, prefetchedFontDataUrls, cachedFontStylesheet, fontStylesheetSettled, fetchFontDataUrl, initializeFontFetching;
  function googleFontImports(css) {
    let hrefs = [
      ...new Set([...css.matchAll(googleFontsImportRegex)].map((input) => input[2]))
    ];
    return {
      hrefs,
      optional: new Set(hrefs.flatMap((input) => (0, runtime2.optionalGoogleFontStylesheetUrls)(input, runtime2.defaultGoogleFontWeights)))
    };
  }
  function documentFontSet() {
    return document.documentElement?.offsetHeight, document.fonts;
  }
  function googleFontVariantAvailable(href, includeLoading = !1) {
    let match = /[?&]family=([^:&]+):ital,wght@([01]),([\d.]+)&/.exec(href);
    if (!match || typeof document > "u" || !("fonts" in document))
      return !0;
    let family = match[1].replace(/\+/g, " ").toLowerCase(), style = match[2] === "1" ? "italic" : "normal", value = match[3].replace("..", " ");
    for (let value2 of documentFontSet())
      if ((includeLoading ? value2.status === "loaded" : value2.status !== "unloaded" && value2.status !== "error") && value2.style === style && value2.weight === value && value2.family.replace(/["']/g, "").toLowerCase() === family)
        return !0;
    return !1;
  }
  function fetchFailureKind(error) {
    return fetchErrorStatus(error) !== void 0 ? "status" : typeof error == "object" && error !== null && "name" in error && error.name === "AbortError" ? "timeout" : "network";
  }
  async function fetchWithSingleRetry(fetchWithTimeout, timeoutMs, retry) {
    let startedAt = Date.now();
    try {
      return await fetchWithTimeout(timeoutMs);
    } catch (error) {
      let remaining = resourceFetchRetryBudgetMs - (Date.now() - startedAt);
      if (!retry || isNonRetryableFetchError(error) || Math.min(timeoutMs, remaining) < minimumResourceFetchRetryMs)
        throw error;
      let delay = Math.min(resourceFetchRetryDelayMs, remaining - minimumResourceFetchRetryMs);
      return await new Promise((resolve) => {
        setTimeout(resolve, delay);
      }), fetchWithTimeout(Math.min(timeoutMs, remaining - delay), error);
    }
  }
  async function fetchResourceWithTimeout(url, timeoutMs, options, decode, previousError) {
    let controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let state = {
        signal: controller.signal,
        credentials: options.credentials ?? "omit"
      }, cache2 = options.cache === "force-cache" && fetchErrorStatus(previousError) !== void 0 ? "reload" : options.cache, value = await fetch(url, {
        ...state,
        ...cache2 !== void 0 && {
          cache: cache2
        }
      });
      if (!value.ok && cache2 === "force-cache" && (isNonRetryableFetchStatus(value.status) || options.retry !== !0 || previousError !== void 0) && (value = await fetch(url, {
        ...state,
        cache: "reload"
      })), !value.ok)
        throw new ResourceFetchError(value.status);
      return await decode(value);
    } finally {
      clearTimeout(timeout);
    }
  }
  function fetchResourceText(url, timeoutMs = resourceFetchTimeoutMs, options = {}) {
    return fetchWithSingleRetry((input, previousError) => fetchResourceWithTimeout(url, input, options, (input2) => input2.text(), previousError), timeoutMs, options.retry === !0);
  }
  function fetchResourceDataUrl(url, timeoutMs = resourceFetchTimeoutMs, options = {}) {
    return fetchWithSingleRetry((input, previousError) => fetchResourceWithTimeout(url, input, options, async (input2) => readBlobAsDataUrl(await input2.blob()), previousError), timeoutMs, options.retry === !0);
  }
  function warmFontStylesheets(hrefs) {
    return stylesheetWarmingStarted = !0, Promise.all(hrefs.map((href) => {
      if (warmedStylesheets.has(href) || unwarmedStylesheets.has(href))
        return;
      let pending = warmingStylesheets.get(href);
      return pending === void 0 && (pending = warmFontStylesheet(href).finally(() => {
        warmingStylesheets.delete(href);
      }), warmingStylesheets.set(href, pending)), pending;
    })).then(() => {
    });
  }
  async function warmFontStylesheet(href) {
    let startedAt = Date.now();
    for (let offset4 of stylesheetWarmingSchedule) {
      let wait = startedAt + offset4 - Date.now();
      if (wait > 0 && await new Promise((resolve) => {
        setTimeout(resolve, wait);
      }), warmedStylesheets.has(href))
        return;
      try {
        let css = await fetchResourceWithTimeout(href, resourceFetchTimeoutMs, {
          cache: "no-store"
        }, (input) => input.text());
        if (!googleFontFaceSheetPattern.test(css))
          break;
        warmedStylesheets.set(href, css);
        return;
      } catch (error) {
        if (isNonRetryableFetchError(error))
          break;
      }
    }
    unwarmedStylesheets.add(href);
  }
  async function prefetchFontFiles(urls) {
    for (let url of urls)
      if (!prefetchedFontFiles.has(url)) {
        if (prefetchedFontFiles.size >= maxPrefetchedFontFiles || prefetchedFontBytes >= maxPrefetchedFontBytes)
          return;
        prefetchedFontFiles.add(url);
        try {
          let blob = await fetchResourceWithTimeout(url, resourceFetchTimeoutMs, {
            cache: "force-cache"
          }, (input) => input.blob());
          prefetchedFontBytes += blob.size, keepPrefetchedFontDataUrls && prefetchedFontDataUrls.set(url, await readBlobAsDataUrl(blob));
        } catch (error) {
          if (isNonRetryableFetchError(error))
            continue;
          prefetchedFontFiles.delete(url);
          return;
        }
      }
  }
  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = () => resolve(String(reader.result)), reader.onerror = () => reject(Error("read failed")), reader.readAsDataURL(blob);
    });
  }
  async function fetchFontStylesheet(href) {
    let warmed = warmedStylesheets.get(href);
    if (warmed !== void 0)
      return warmed;
    if (!stylesheetWarmingStarted)
      return fetchResourceText(href, resourceFetchTimeoutMs, {
        retry: !0
      });
    let css = await fetchResourceText(href, resourceFetchTimeoutMs, unwarmedStylesheets.has(href) ? {
      retry: !0
    } : {
      retry: !0,
      cache: "no-store"
    });
    return googleFontFaceSheetPattern.test(css) && warmedStylesheets.set(href, css), css;
  }
  return bindRuntimeValue(runtime2, "googleFontImports", () => googleFontImports), bindRuntimeValue(runtime2, "documentFontSet", () => documentFontSet), bindRuntimeValue(runtime2, "googleFontVariantAvailable", () => googleFontVariantAvailable), bindRuntimeValue(runtime2, "fetchFailureKind", () => fetchFailureKind), bindRuntimeValue(runtime2, "fetchWithSingleRetry", () => fetchWithSingleRetry), bindRuntimeValue(runtime2, "fetchResourceWithTimeout", () => fetchResourceWithTimeout), bindRuntimeValue(runtime2, "fetchResourceText", () => fetchResourceText), bindRuntimeValue(runtime2, "fetchResourceDataUrl", () => fetchResourceDataUrl), bindRuntimeValue(runtime2, "readBlobAsDataUrl", () => readBlobAsDataUrl), bindRuntimeValue(runtime2, "warmFontStylesheets", () => warmFontStylesheets), bindRuntimeValue(runtime2, "prefetchFontFiles", () => prefetchFontFiles), bindRuntimeValue(runtime2, "fetchFontStylesheet", () => fetchFontStylesheet), bindRuntimeValue(runtime2, "googleFontsImportRegex", () => googleFontsImportRegex, (value) => {
    googleFontsImportRegex = value;
  }), bindRuntimeValue(runtime2, "googleFontFileUrlRegex", () => googleFontFileUrlRegex, (value) => {
    googleFontFileUrlRegex = value;
  }), bindRuntimeValue(runtime2, "resourceFetchTimeoutMs", () => resourceFetchTimeoutMs, (value) => {
    resourceFetchTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "resourceFetchRetryBudgetMs", () => resourceFetchRetryBudgetMs, (value) => {
    resourceFetchRetryBudgetMs = value;
  }), bindRuntimeValue(runtime2, "resourceFetchRetryDelayMs", () => resourceFetchRetryDelayMs, (value) => {
    resourceFetchRetryDelayMs = value;
  }), bindRuntimeValue(runtime2, "minimumResourceFetchRetryMs", () => minimumResourceFetchRetryMs, (value) => {
    minimumResourceFetchRetryMs = value;
  }), bindRuntimeValue(runtime2, "ResourceFetchError", () => ResourceFetchError, (value) => {
    ResourceFetchError = value;
  }), bindRuntimeValue(runtime2, "retryableHttpStatuses", () => retryableHttpStatuses, (value) => {
    retryableHttpStatuses = value;
  }), bindRuntimeValue(runtime2, "fetchErrorStatus", () => fetchErrorStatus, (value) => {
    fetchErrorStatus = value;
  }), bindRuntimeValue(runtime2, "isNonRetryableFetchStatus", () => isNonRetryableFetchStatus, (value) => {
    isNonRetryableFetchStatus = value;
  }), bindRuntimeValue(runtime2, "isNonRetryableFetchError", () => isNonRetryableFetchError, (value) => {
    isNonRetryableFetchError = value;
  }), bindRuntimeValue(runtime2, "cachedFontStylesheet", () => cachedFontStylesheet, (value) => {
    cachedFontStylesheet = value;
  }), bindRuntimeValue(runtime2, "fontStylesheetSettled", () => fontStylesheetSettled, (value) => {
    fontStylesheetSettled = value;
  }), bindRuntimeValue(runtime2, "fetchFontDataUrl", () => fetchFontDataUrl, (value) => {
    fetchFontDataUrl = value;
  }), bindRuntimeValue(runtime2, "initializeFontFetching", () => initializeFontFetching, (value) => {
    initializeFontFetching = value;
  }), () => {
    resourceFetchTimeoutMs = 8e3, resourceFetchRetryBudgetMs = 12e3, defaultResourceFetchRetryDelayMs = 1500, minimumResourceFetchRetryMs = 2e3, fetchErrorStatus = (state) => typeof state == "object" && state !== null && "status" in state && typeof state.status == "number" ? state.status : void 0, isNonRetryableFetchStatus = (status) => status >= 400 && status < 500 && !retryableHttpStatuses.has(status), isNonRetryableFetchError = (state) => {
      let status = fetchErrorStatus(state);
      return status !== void 0 && isNonRetryableFetchStatus(status);
    }, stylesheetWarmingStarted = !1, maxPrefetchedFontFiles = 16, maxPrefetchedFontBytes = 2097152, prefetchedFontBytes = 0, keepPrefetchedFontDataUrls = !1, cachedFontStylesheet = (href) => warmedStylesheets.get(href), fontStylesheetSettled = (href) => warmedStylesheets.has(href) || unwarmedStylesheets.has(href), fetchFontDataUrl = (input) => {
      let prefetched = keepPrefetchedFontDataUrls ? prefetchedFontDataUrls.get(input) : void 0;
      return prefetched !== void 0 ? Promise.resolve(prefetched) : fetchResourceDataUrl(input, resourceFetchTimeoutMs, {
        retry: !0,
        cache: "force-cache"
      });
    }, initializeFontFetching = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeFontCatalog)(), googleFontsImportRegex = /@import url\((["']?)(https:\/\/fonts\.googleapis\.com\/[^"')\s]+)\1\);?/g, googleFontFileUrlRegex = /url\((["']?)(https:\/\/fonts\.gstatic\.com\/[^"')\s]+)\1\)/g, resourceFetchRetryDelayMs = defaultResourceFetchRetryDelayMs, ResourceFetchError = class extends Error {
        status;
        constructor(input) {
          super("fetch " + String(input)), this.status = input;
        }
      }, retryableHttpStatuses = /* @__PURE__ */ new Set([408, 425, 429]), warmedStylesheets = /* @__PURE__ */ new Map(), warmingStylesheets = /* @__PURE__ */ new Map(), unwarmedStylesheets = /* @__PURE__ */ new Set(), googleFontFaceSheetPattern = /@font-face\s*\{[^}]*https:\/\/fonts\.gstatic\.com\//i, defaultStylesheetWarmingSchedule = [0, 2e3, 1e4, 3e4], stylesheetWarmingSchedule = defaultStylesheetWarmingSchedule, prefetchedFontFiles = /* @__PURE__ */ new Set(), prefetchedFontDataUrls = /* @__PURE__ */ new Map();
    });
  };
}
export {
  installFontsFetch
};
