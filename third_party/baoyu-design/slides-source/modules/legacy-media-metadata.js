// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installMediaVideoLinks(runtime2) {
  var videoProviders, videoProviderLabels, maxVideoLinkStartSeconds, optionalUrlPart, firstRegexGroup, videoProviderSpecs, initializeVideoLinks;
  function isValidVideoProviderId(provider, id) {
    return typeof id == "string" && videoProviderSpecs[provider].id.test(id);
  }
  function videoProviderIdHint(provider) {
    return videoProviderSpecs[provider].idHint;
  }
  function videoProviderKeepsStart(provider) {
    return videoProviderSpecs[provider].keepsStart;
  }
  function rawQueryParameter(query, name) {
    for (let value of query.split("&")) {
      let value2 = value.indexOf("=");
      if (value2 > 0 && value.substring(0, value2) === name)
        return value.substring(value2 + 1);
    }
  }
  function isSupportedVideoProvider(provider) {
    return typeof provider == "string" && videoProviders.includes(provider);
  }
  function normalizeVideoStartSeconds(seconds) {
    let value = typeof seconds == "number" ? seconds : typeof seconds == "string" && /^\d{1,7}(?:\.\d+)?$/.test(seconds.trim()) ? Number(seconds.trim()) : NaN;
    if (!Number.isFinite(value))
      return;
    let value2 = Math.min(Math.floor(value), 86400);
    if (value2 > 0)
      return value2;
  }
  function normalizeVideoLink(link) {
    if (typeof link != "object" || link === null)
      return;
    let { provider: value, id: value2, start: value3 } = link;
    if (!isSupportedVideoProvider(value) || !isValidVideoProviderId(value, value2))
      return;
    let value4 = videoProviderKeepsStart(value) ? normalizeVideoStartSeconds(value3) : void 0;
    return {
      provider: value,
      id: value2,
      ...value4 !== void 0 ? {
        start: value4
      } : {}
    };
  }
  function parseYouTubeTimestamp(timestamp) {
    if (timestamp === void 0 || timestamp === "")
      return;
    let value = /^(?:(\d{1,3})h)?(?:(\d{1,5})m)?(?:(\d{1,7})s?)?$/.exec(timestamp);
    if (value !== null)
      return normalizeVideoStartSeconds(Number(value[1] ?? 0) * 3600 + Number(value[2] ?? 0) * 60 + Number(value[3] ?? 0));
  }
  function parseVideoLinkUrl(url) {
    let value = url.trim();
    if (value.length === 0 || value.length > 2048 || /\s/.test(value))
      return null;
    let value2 = /^(?:(?:https?:)?\/\/)?([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i.exec(value);
    if (value2 === null)
      return null;
    let value3 = (value2[1] ?? "").toLowerCase(), value4 = value2[3] ?? "", value5 = parseYouTubeTimestamp(rawQueryParameter(value4, "t")) ?? parseYouTubeTimestamp(rawQueryParameter(value4, "start")) ?? parseYouTubeTimestamp(rawQueryParameter(value2[4] ?? "", "t"));
    for (let value6 of videoProviders) {
      let value7 = normalizeVideoLink({
        provider: value6,
        id: videoProviderSpecs[value6].read(value3, value2[2] ?? "", value4),
        start: value5
      });
      if (value7 !== void 0)
        return value7;
    }
    return null;
  }
  return bindRuntimeValue(runtime2, "isValidVideoProviderId", () => isValidVideoProviderId), bindRuntimeValue(runtime2, "videoProviderIdHint", () => videoProviderIdHint), bindRuntimeValue(runtime2, "videoProviderKeepsStart", () => videoProviderKeepsStart), bindRuntimeValue(runtime2, "rawQueryParameter", () => rawQueryParameter), bindRuntimeValue(runtime2, "isSupportedVideoProvider", () => isSupportedVideoProvider), bindRuntimeValue(runtime2, "normalizeVideoStartSeconds", () => normalizeVideoStartSeconds), bindRuntimeValue(runtime2, "normalizeVideoLink", () => normalizeVideoLink), bindRuntimeValue(runtime2, "parseYouTubeTimestamp", () => parseYouTubeTimestamp), bindRuntimeValue(runtime2, "parseVideoLinkUrl", () => parseVideoLinkUrl), bindRuntimeValue(runtime2, "videoProviders", () => videoProviders, (value) => {
    videoProviders = value;
  }), bindRuntimeValue(runtime2, "videoProviderLabels", () => videoProviderLabels, (value) => {
    videoProviderLabels = value;
  }), bindRuntimeValue(runtime2, "maxVideoLinkStartSeconds", () => maxVideoLinkStartSeconds, (value) => {
    maxVideoLinkStartSeconds = value;
  }), bindRuntimeValue(runtime2, "optionalUrlPart", () => optionalUrlPart, (value) => {
    optionalUrlPart = value;
  }), bindRuntimeValue(runtime2, "firstRegexGroup", () => firstRegexGroup, (value) => {
    firstRegexGroup = value;
  }), bindRuntimeValue(runtime2, "videoProviderSpecs", () => videoProviderSpecs, (value) => {
    videoProviderSpecs = value;
  }), bindRuntimeValue(runtime2, "initializeVideoLinks", () => initializeVideoLinks, (value) => {
    initializeVideoLinks = value;
  }), () => {
    maxVideoLinkStartSeconds = 86400, optionalUrlPart = (prefix, value, suffix = "") => value === void 0 || value === "" ? "" : prefix + String(value) + suffix, firstRegexGroup = (pattern, text) => pattern.exec(text)?.[1], initializeVideoLinks = (0, runtime2.initializeOnce)(() => {
      videoProviders = ["youtube", "vimeo", "loom", "drive"], videoProviderLabels = {
        youtube: "YouTube",
        vimeo: "Vimeo",
        loom: "Loom",
        drive: "Google Drive"
      }, videoProviderSpecs = {
        youtube: {
          id: /^(?!videoseries$|live_stream$)[A-Za-z0-9_-]{11}$/,
          idHint: "the 11 characters after v= or youtu.be/",
          read: (host, path, query) => {
            if (host === "youtu.be")
              return firstRegexGroup(/^\/([^/]+)\/?$/, path);
            if (/^(?:www\.)?youtube-nocookie\.com$/.test(host))
              return firstRegexGroup(/^\/embed\/([^/]+)\/?$/, path);
            if (/^(?:(?:www|m|music)\.)?youtube\.com$/.test(host))
              return /^\/watch\/?$/.test(path) ? rawQueryParameter(query, "v") : firstRegexGroup(/^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/, path);
          },
          keepsStart: !0
        },
        vimeo: {
          id: /^\d{1,12}(?:\/[0-9a-f]{8,40})?$/,
          idHint: "the number in the link, then a slash and the code after it, or after h=, if the link has one",
          read: (host, path, query) => {
            let value = /^(?:www\.)?vimeo\.com$/.test(host);
            if (!value && host !== "player.vimeo.com")
              return;
            let value2 = (value ? /^\/(?:channels\/[^/]+\/|(?:showcase|album)\/\d+\/video\/|manage\/videos\/)?(\d+)(?:\/([^/]+))?\/?$/ : /^\/video\/(\d+)\/?$/).exec(path);
            return value2?.[1] === void 0 ? void 0 : value2[1] + optionalUrlPart("/", value2[2] ?? rawQueryParameter(query, "h"));
          },
          keepsStart: !0
        },
        loom: {
          id: /^[0-9a-f]{32}$/,
          idHint: "the last 32 characters of the link, before any ?",
          read: (host, path) => /^(?:www\.)?loom\.com$/.test(host) ? firstRegexGroup(/^\/(?:share|embed)\/(?:[^/]*-)?([^/-]+)\/?$/, path) : void 0,
          keepsStart: !0
        },
        drive: {
          id: /^[A-Za-z0-9_-]{20,80}(?:\/[A-Za-z0-9_-]{8,64})?$/,
          idHint: "the characters between /file/d/ and the next slash, then a slash and the resourcekey value if the link has one",
          read: (host, path, query) => {
            let value = host === "drive.google.com" ? firstRegexGroup(/^\/file\/d\/([^/]+)(?:\/[a-z]*)?$/, path) : void 0;
            return value === void 0 ? void 0 : value + optionalUrlPart("/", rawQueryParameter(query, "resourcekey"));
          },
          keepsStart: !1
        }
      };
    });
  };
}
export { installMediaVideoLinks };
