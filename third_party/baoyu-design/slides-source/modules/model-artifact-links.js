// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelArtifactLinks(runtime2) {
  var artifactAddressHosts, artifactShareKeyPattern, artifactAddressPathPattern, maxBase58ArtifactId, artifactLinkLimits, artifactLinkCardSize, visibleTitleCharacterPattern, artifactTypeLabels, initializeArtifactAddresses, React264, emptyArtifactAnswers, artifactAnswers, artifactAnswerSources, artifactAnswerListeners, initializeArtifactMetadata;
  const base58ArtifactIdInRange = (id) => [...id].reduce((total, character) => total * BigInt(58) + BigInt("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".indexOf(character)), BigInt(0)) <= maxBase58ArtifactId, isArtifactLinkType = (input) => typeof input == "string" && Object.hasOwn(artifactTypeLabels, input), artifactLinkTypeLabel = (link, answer) => {
    let kind = answer?.type ?? link.kind;
    return (kind === void 0 ? void 0 : artifactTypeLabels[kind]) ?? "Artifact";
  }, stripArtifactAddressQuery = (href) => href.split("?")[0] ?? href, artifactLinkQuietLabel = (link, answer) => (answer?.title ?? link.title) === void 0 ? stripArtifactAddressQuery(link.href).replace("https://", "") : artifactLinkTypeLabel(link, answer), isArtifactMetadataCapability = (input) => (0, runtime2.capabilityHasMethod)("metadata")(input) && "metadata" in input, publishArtifactAnswers = (answers, source = artifactAnswerSources, replace = !0) => {
    replace && artifactAnswerSources.delete(source), answers.size > 0 ? artifactAnswerSources.set(source, answers) : artifactAnswerSources.delete(source), artifactAnswers = new Map([...artifactAnswerSources.values()].flatMap((entry) => [...entry])), artifactAnswerListeners.forEach((listener) => listener());
  }, subscribeArtifactAnswers = (listener) => (artifactAnswerListeners.add(listener), () => void artifactAnswerListeners.delete(listener)), useArtifactAnswer = (href) => React264.useSyncExternalStore(subscribeArtifactAnswers, () => artifactAnswers, () => artifactAnswers).get(href);
  function normalizeArtifactAddressUrl(input) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return null;
    let shareKey = url.search.startsWith("?sk=") && artifactShareKeyPattern.test(url.search.slice(4)) ? url.search.slice(4) : null;
    if (url.search !== "" && shareKey === null || url.hash !== "" || url.port !== "" || url.username !== "" || url.password !== "")
      return null;
    let host = url.hostname.replace(/\.+$/, "").toLowerCase();
    if (!artifactAddressHosts.includes(host))
      return null;
    let match = artifactAddressPathPattern.exec(url.pathname);
    return match === null || match[1] !== void 0 && !base58ArtifactIdInRange(match[1]) ? null : "https://" + host + url.pathname + (shareKey === null ? "" : "?sk=" + shareKey);
  }
  function parseArtifactAddress(input) {
    if (typeof input != "string" || input.length > artifactLinkLimits.href || /[\s\p{Cc}]/u.test(input))
      return;
    let [base = "", ...queryParts] = (input.split("#")[0] ?? "").split("?"), [shareParam = "", ...extraShareParams] = queryParts.join("?").split("&").filter((part) => part.startsWith("sk=")), normalized = normalizeArtifactAddressUrl(base + (extraShareParams.length === 0 && artifactShareKeyPattern.test(shareParam.slice(3)) ? "?" + shareParam : ""));
    return normalized !== null && normalized.length <= artifactLinkLimits.href ? normalized : void 0;
  }
  function sanitizeArtifactTitle(input) {
    if (typeof input != "string")
      return "";
    let title = input.replace(/\s+/g, " ").replace(/(?![\u200C\u200D\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}]/gu, "").replace(/ +/g, " ").trim();
    return visibleTitleCharacterPattern.test(title) ? [...title].slice(0, artifactLinkLimits.title).join("") : "";
  }
  function artifactMetadataAnswers(hrefs, reply) {
    let answers = /* @__PURE__ */ new Map();
    for (let href of hrefs) {
      let entry = reply[href], title = sanitizeArtifactTitle(entry?.title);
      title !== "" && answers.set(href, {
        title,
        type: isArtifactLinkType(entry?.type) ? entry.type : null
      });
    }
    return answers;
  }
  function createArtifactMetadataPoller(loadCapability, onAnswers, now = Date.now) {
    let removed = !1, generation = 0, lastFetchAt = 0, key = "", answers = emptyArtifactAnswers, fetchAnswers = async () => {
      let current = ++generation, hrefs = key.split(`
`);
      lastFetchAt = now();
      try {
        let capability = await loadCapability();
        if (capability === null || current !== generation)
          return;
        let fresh = artifactMetadataAnswers(hrefs, await capability.metadata(hrefs));
        if (current !== generation)
          return;
        fresh.size === 0 && (lastFetchAt = 0), answers = fresh.size > 0 ? fresh : new Map([...answers].filter(([href]) => hrefs.includes(href))), onAnswers(answers, fresh.size > 0);
      } catch (error) {
        typeof error == "object" && error !== null && "code" in error && error.code === "capability_removed" && (removed = !0);
      }
    };
    return {
      links(hrefs) {
        let next = [...new Set(hrefs)].sort().slice(0, 200).join(`
`);
        next !== key && (key = next, generation = generation + 1, key === "" ? onAnswers(answers = emptyArtifactAnswers, !0) : removed || fetchAnswers());
      },
      cameBack() {
        !removed && key !== "" && now() - lastFetchAt >= 6e4 && fetchAnswers();
      }
    };
  }
  function useArtifactLinkMetadata(hrefs) {
    let poller = React264.useRef(null);
    poller.current ??= createArtifactMetadataPoller(() => (0, runtime2.getOrLoadHostCapability)("artifact", isArtifactMetadataCapability), (answers, replace) => publishArtifactAnswers(answers, poller, replace)), React264.useEffect(() => poller.current?.links(hrefs), [hrefs]), React264.useEffect(() => () => poller.current?.links([]), []), React264.useEffect(() => {
      let onVisibilityChange = () => void (document.visibilityState === "visible" && poller.current?.cameBack());
      return document.addEventListener("visibilitychange", onVisibilityChange), () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }, []);
  }
  return bindRuntimeValue(runtime2, "normalizeArtifactAddressUrl", () => normalizeArtifactAddressUrl), bindRuntimeValue(runtime2, "parseArtifactAddress", () => parseArtifactAddress), bindRuntimeValue(runtime2, "sanitizeArtifactTitle", () => sanitizeArtifactTitle), bindRuntimeValue(runtime2, "artifactLinkLimits", () => artifactLinkLimits, (value) => {
    artifactLinkLimits = value;
  }), bindRuntimeValue(runtime2, "isArtifactLinkType", () => isArtifactLinkType), bindRuntimeValue(runtime2, "artifactLinkCardSize", () => artifactLinkCardSize, (value) => {
    artifactLinkCardSize = value;
  }), bindRuntimeValue(runtime2, "artifactTypeLabels", () => artifactTypeLabels, (value) => {
    artifactTypeLabels = value;
  }), bindRuntimeValue(runtime2, "artifactLinkTypeLabel", () => artifactLinkTypeLabel), bindRuntimeValue(runtime2, "stripArtifactAddressQuery", () => stripArtifactAddressQuery), bindRuntimeValue(runtime2, "artifactLinkQuietLabel", () => artifactLinkQuietLabel), bindRuntimeValue(runtime2, "initializeArtifactAddresses", () => initializeArtifactAddresses, (value) => {
    initializeArtifactAddresses = value;
  }), bindRuntimeValue(runtime2, "artifactMetadataAnswers", () => artifactMetadataAnswers), bindRuntimeValue(runtime2, "createArtifactMetadataPoller", () => createArtifactMetadataPoller), bindRuntimeValue(runtime2, "useArtifactLinkMetadata", () => useArtifactLinkMetadata), bindRuntimeValue(runtime2, "useArtifactAnswer", () => useArtifactAnswer), bindRuntimeValue(runtime2, "initializeArtifactMetadata", () => initializeArtifactMetadata, (value) => {
    initializeArtifactMetadata = value;
  }), () => {
    initializeArtifactAddresses = (0, runtime2.initializeOnce)(() => {
      artifactAddressHosts = [
        "claude.ai",
        "www.claude.ai",
        "preview.claude.ai",
        "claude-ai.staging.ant.dev"
      ], artifactShareKeyPattern = /^[A-Za-z0-9_-]{16,64}$/, artifactAddressPathPattern = /^\/(?:code\/)?artifact\/(?:[A-Za-z0-9_-]*-)?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|([1-9A-HJ-NP-Za-km-z]{22}))$/, maxBase58ArtifactId = (BigInt(1) << BigInt(128)) - BigInt(1), artifactLinkLimits = {
        href: 512,
        title: 120
      }, artifactLinkCardSize = {
        w: 320,
        h: 56
      }, visibleTitleCharacterPattern = /[\p{L}\p{N}\p{S}\p{P}]/u, artifactTypeLabels = {
        slides: "Slide deck",
        motion: "Motion",
        doc: "Doc",
        design: "Design",
        dashboard: "Dashboard"
      };
    }), initializeArtifactMetadata = (0, runtime2.initializeOnce)(() => {
      initializeArtifactAddresses(), React264 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), emptyArtifactAnswers = /* @__PURE__ */ new Map(), artifactAnswers = emptyArtifactAnswers, artifactAnswerSources = /* @__PURE__ */ new Map(), artifactAnswerListeners = /* @__PURE__ */ new Set();
    });
  };
}
export {
  installModelArtifactLinks
};
