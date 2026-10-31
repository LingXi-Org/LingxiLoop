// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installMediaEmbeddedPlayerSupport(runtime2) {
  var embeddedPlayerSupportCache, initializeEmbeddedPlayerSupport;
  function pageAllowsEmbed(timingName, key, directive, url) {
    let value = timingName + " " + key, entry = embeddedPlayerSupportCache.get(value);
    if (entry !== void 0)
      return entry;
    let value2 = serverTimingAllows(timingName, key), value3 = value2 === !0 || pageCspAllows(directive, url);
    return (value3 || value2 !== void 0 || typeof document < "u" && document.readyState === "complete") && embeddedPlayerSupportCache.set(value, value3), value3;
  }
  function serverTimingAllows(name, token) {
    try {
      let value = performance.getEntriesByType("navigation")[0];
      return value === void 0 ? void 0 : (value.serverTiming ?? []).some((input) => input.name === name && input.description.split(/\s+/).includes(token));
    } catch {
      return;
    }
  }
  function pageCspAllows(directive, url) {
    try {
      let value = Array.from(document.head.querySelectorAll("meta[http-equiv]")).filter((element) => (element.getAttribute("http-equiv") ?? "").toLowerCase() === "content-security-policy").map((element) => element.getAttribute("content") ?? "");
      return value.length > 0 && value.every((input) => !input.includes(",") && cspAllows(input, directive, url));
    } catch {
      return !1;
    }
  }
  function cspAllows(policy, directive, url) {
    let entries = /* @__PURE__ */ new Map();
    for (let value3 of policy.split(";")) {
      let [value4, ...value5] = value3.split(/[\t\n\f\r ]+/).filter((input) => input !== "");
      value4 !== void 0 && value4 !== "" && !entries.has(value4.toLowerCase()) && entries.set(value4.toLowerCase(), value5);
    }
    let value = entries.get(directive) ?? (directive === "frame-src" ? entries.get("child-src") : void 0) ?? entries.get("default-src");
    if (value === void 0)
      return !1;
    let value2 = new URL(url);
    return value.some((input) => {
      if (input === "*" || input.toLowerCase() === "https:")
        return !0;
      let value3 = /^https:\/\/(\*\.)?([a-z0-9.-]+)(\/[^?#]*)?$/i.exec(input);
      if (value3 === null)
        return !1;
      let value4 = (value3[2] ?? "").toLowerCase();
      if (value3[1] === void 0 ? value2.hostname !== value4 : !value2.hostname.endsWith("." + value4))
        return !1;
      let value5 = value3[3];
      return value5 === void 0 || (value5.endsWith("/") ? value2.pathname.startsWith(value5) : value2.pathname === value5);
    });
  }
  return bindRuntimeValue(runtime2, "embeddedPlayerSupportCache", () => embeddedPlayerSupportCache, (value) => {
    embeddedPlayerSupportCache = value;
  }), bindRuntimeValue(runtime2, "pageAllowsEmbed", () => pageAllowsEmbed), bindRuntimeValue(runtime2, "serverTimingAllows", () => serverTimingAllows), bindRuntimeValue(runtime2, "pageCspAllows", () => pageCspAllows), bindRuntimeValue(runtime2, "cspAllows", () => cspAllows), bindRuntimeValue(runtime2, "initializeEmbeddedPlayerSupport", () => initializeEmbeddedPlayerSupport, (value) => {
    initializeEmbeddedPlayerSupport = value;
  }), () => {
    initializeEmbeddedPlayerSupport = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeVideoLinks)(), embeddedPlayerSupportCache = /* @__PURE__ */ new Map();
    });
  };
}
export { installMediaEmbeddedPlayerSupport };
