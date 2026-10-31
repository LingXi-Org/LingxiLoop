// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationPopouts(runtime2) {
  var ReactSpeakerNotes, SpeakerNotesReactRoot, openPopoutViews, popoutOpening, popoutPagehideCleanup;
  function normalizePopoutWindowDimension(requested, fallback) {
    return Math.max(100, Math.round(requested ?? fallback));
  }
  function escapePopoutHtml(text) {
    return text.replace(/[&<>"']/g, (input) => "&#" + String(input.charCodeAt(0)) + ";");
  }
  function buildPopoutDocumentHtml(title) {
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapePopoutHtml(title) + "</title><style>html,body{margin:0;height:100%}</style><script>setInterval(function(){if(!window.opener||window.opener.closed)window.close()},1000)<\/script></head><body></body></html>";
  }
  function collectPopoutStyles(document2) {
    let css = [];
    for (let value of Array.from(document2.head.querySelectorAll('style,link[rel~="stylesheet"]'))) {
      if (value.tagName === "STYLE") {
        value.textContent && css.push(value.textContent);
        continue;
      }
      try {
        let value2 = value.sheet?.cssRules;
        value2 && css.push(Array.from(value2, (input) => input.cssText).join(`
`));
      } catch {
      }
    }
    return css;
  }
  function installPopoutPagehideCleanup() {
    if (popoutPagehideCleanup !== null)
      return;
    let callback = () => {
      for (let value of Array.from(openPopoutViews.values()))
        value.close();
    };
    window.addEventListener("pagehide", callback), popoutPagehideCleanup = () => window.removeEventListener("pagehide", callback);
  }
  function isPopoutViewAlive(view) {
    try {
      return !view.win.closed && view.win.document === view.root.ownerDocument;
    } catch {
      return !1;
    }
  }
  function focusPopoutWindow(window2) {
    if (!(0, runtime2.isFullscreenOrEntering)())
      try {
        window2.focus();
      } catch {
      }
  }
  function openPopoutView(key, options = {}) {
    let existingView = openPopoutViews.get(key);
    if (existingView !== void 0) {
      if (isPopoutViewAlive(existingView))
        return focusPopoutWindow(existingView.win), {
          kind: "opened",
          view: existingView,
          reused: !0
        };
      existingView.close();
    }
    if (popoutOpening || typeof window > "u" || typeof window.open != "function")
      return {
        kind: "unavailable"
      };
    let value;
    try {
      value = window.open("about:blank", "appifact-popup-" + key, options.tab === !0 ? "" : "popup=1,width=" + String(normalizePopoutWindowDimension(options.width, 480)) + ",height=" + String(normalizePopoutWindowDimension(options.height, 320)));
    } catch (value7) {
      return value7?.name === "InvalidAccessError" ? (popoutOpening = !0, {
        kind: "unavailable"
      }) : {
        kind: "blocked"
      };
    }
    if (value == null)
      return {
        kind: "blocked"
      };
    let value2 = value, value3;
    try {
      if (value3 = value2.document, value3.open(), value3.write(buildPopoutDocumentHtml(options.title ?? key)), value3.close(), value2.location.search !== "" && (value2.history.replaceState(null, "", value2.location.pathname), value2.location.search !== ""))
        throw Error("popup kept its query");
    } catch {
      try {
        value2.close();
      } catch {
      }
      return {
        kind: "blocked"
      };
    }
    for (let value7 of [
      "lang",
      "data-theme",
      runtime2.pinnedColorModeAttribute
    ]) {
      let attribute = document.documentElement.getAttribute(value7);
      attribute !== null && value3.documentElement.setAttribute(value7, attribute);
    }
    (0, runtime2.initializeDocumentColorMode)(value3);
    for (let value7 of [
      ...collectPopoutStyles(document),
      options.css ?? ""
    ]) {
      if (value7 === "")
        continue;
      let value8 = value3.createElement("style");
      value8.textContent = value7, value3.head.appendChild(value8);
    }
    let value4 = value3.createElement("div");
    value4.id = "popup-root", value3.body.appendChild(value4);
    let { port1, port2 } = new MessageChannel(), value5, promise = new Promise((input) => {
      value5 = input;
    }), flag = !1, callback = (input) => {
      if (!flag) {
        flag = !0, openPopoutViews.get(key) === state && openPopoutViews.delete(key), clearInterval(value6);
        try {
          value2.removeEventListener("pagehide", callback3);
        } catch {
        }
        if (port1.close(), port2.close(), input && !value2.closed)
          try {
            value2.close();
          } catch {
          }
        value5();
      }
    }, callback2 = () => {
      isPopoutViewAlive(state) || callback(!0);
    }, callback3 = () => {
      setTimeout(callback2, 0);
    };
    value2.addEventListener("pagehide", callback3);
    let value6 = setInterval(callback2, 1e3), state = {
      win: value2,
      root: value4,
      port: port1,
      peer: port2,
      closed: promise,
      close: () => callback(!0)
    };
    return openPopoutViews.set(key, state), installPopoutPagehideCleanup(), focusPopoutWindow(value2), {
      kind: "opened",
      view: state
    };
  }
  return bindRuntimeValue(runtime2, "ReactSpeakerNotes", () => ReactSpeakerNotes, (value) => {
    ReactSpeakerNotes = value;
  }), bindRuntimeValue(runtime2, "SpeakerNotesReactRoot", () => SpeakerNotesReactRoot, (value) => {
    SpeakerNotesReactRoot = value;
  }), bindRuntimeValue(runtime2, "openPopoutViews", () => openPopoutViews, (value) => {
    openPopoutViews = value;
  }), bindRuntimeValue(runtime2, "popoutOpening", () => popoutOpening, (value) => {
    popoutOpening = value;
  }), bindRuntimeValue(runtime2, "popoutPagehideCleanup", () => popoutPagehideCleanup, (value) => {
    popoutPagehideCleanup = value;
  }), bindRuntimeValue(runtime2, "normalizePopoutWindowDimension", () => normalizePopoutWindowDimension), bindRuntimeValue(runtime2, "escapePopoutHtml", () => escapePopoutHtml), bindRuntimeValue(runtime2, "buildPopoutDocumentHtml", () => buildPopoutDocumentHtml), bindRuntimeValue(runtime2, "collectPopoutStyles", () => collectPopoutStyles), bindRuntimeValue(runtime2, "installPopoutPagehideCleanup", () => installPopoutPagehideCleanup), bindRuntimeValue(runtime2, "isPopoutViewAlive", () => isPopoutViewAlive), bindRuntimeValue(runtime2, "focusPopoutWindow", () => focusPopoutWindow), bindRuntimeValue(runtime2, "openPopoutView", () => openPopoutView), () => {
    ReactSpeakerNotes = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SpeakerNotesReactRoot = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomClientNamespace)(), 1), openPopoutViews = /* @__PURE__ */ new Map(), popoutOpening = !1, popoutPagehideCleanup = null;
  };
}
export {
  installPresentationPopouts
};
