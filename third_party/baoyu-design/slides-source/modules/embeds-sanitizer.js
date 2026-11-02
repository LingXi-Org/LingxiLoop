// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEmbedsSanitizer(runtime2) {
  var unsafeEmbedElementNames, containsShadowRootMarkup, serializeElementOpenTag, embedSharedRootBootstrapScript, embedSandboxIsolationScript, embedSandboxDiagnosticsScript, initializeEmbedSanitizer;
  function findUnsafeEmbedElement(root) {
    if (root == null)
      return null;
    for (let value of Array.from(root.children ?? [])) {
      let localName = value.localName;
      if (unsafeEmbedElementNames.has(localName))
        return localName;
      if (localName === "template") {
        let value3 = findUnsafeEmbedElement(value.content);
        if (value3 != null)
          return value3;
      }
      let value2 = findUnsafeEmbedElement(value);
      if (value2 != null)
        return value2;
    }
    return null;
  }
  function inspectEmbedMarkup(html) {
    if (typeof DOMParser > "u")
      return null;
    if (/<\s*(?:\/\s*)?noscript/i.test(html))
      return "unscannable-noscript";
    try {
      let value = new DOMParser().parseFromString(html, "text/html");
      return findUnsafeEmbedElement(value);
    } catch {
      return "unscannable-document";
    }
  }
  function containsDeclarativeShadowRoot(html) {
    if (typeof DOMParser > "u")
      return !1;
    let callback = (input) => Array.from(input.querySelectorAll("template")).some((input2) => input2.hasAttribute("shadowroot") || callback(input2.content));
    try {
      return callback(new DOMParser().parseFromString(html, "text/html"));
    } catch {
      return !0;
    }
  }
  function removeUnsafeEmbedElements(root) {
    if (root != null)
      for (let value of Array.from(root.children ?? [])) {
        if (unsafeEmbedElementNames.has(value.localName) || value.localName === "noscript") {
          value.remove();
          continue;
        }
        value.localName === "template" && (value.removeAttribute("shadowrootmode"), value.removeAttribute("shadowroot"), removeUnsafeEmbedElements(value.content)), removeUnsafeEmbedElements(value);
      }
  }
  function sanitizeEmbedMarkup(html) {
    try {
      let value = new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
      return removeUnsafeEmbedElements(value.body), serializeElementOpenTag(value.documentElement) + serializeElementOpenTag(value.body) + value.body.innerHTML;
    } catch {
      return "";
    }
  }
  return bindRuntimeValue(runtime2, "findUnsafeEmbedElement", () => findUnsafeEmbedElement), bindRuntimeValue(runtime2, "inspectEmbedMarkup", () => inspectEmbedMarkup), bindRuntimeValue(runtime2, "containsDeclarativeShadowRoot", () => containsDeclarativeShadowRoot), bindRuntimeValue(runtime2, "removeUnsafeEmbedElements", () => removeUnsafeEmbedElements), bindRuntimeValue(runtime2, "sanitizeEmbedMarkup", () => sanitizeEmbedMarkup), bindRuntimeValue(runtime2, "unsafeEmbedElementNames", () => unsafeEmbedElementNames, (value) => {
    unsafeEmbedElementNames = value;
  }), bindRuntimeValue(runtime2, "containsShadowRootMarkup", () => containsShadowRootMarkup, (value) => {
    containsShadowRootMarkup = value;
  }), bindRuntimeValue(runtime2, "serializeElementOpenTag", () => serializeElementOpenTag, (value) => {
    serializeElementOpenTag = value;
  }), bindRuntimeValue(runtime2, "embedSharedRootBootstrapScript", () => embedSharedRootBootstrapScript, (value) => {
    embedSharedRootBootstrapScript = value;
  }), bindRuntimeValue(runtime2, "embedSandboxIsolationScript", () => embedSandboxIsolationScript, (value) => {
    embedSandboxIsolationScript = value;
  }), bindRuntimeValue(runtime2, "embedSandboxDiagnosticsScript", () => embedSandboxDiagnosticsScript, (value) => {
    embedSandboxDiagnosticsScript = value;
  }), bindRuntimeValue(runtime2, "initializeEmbedSanitizer", () => initializeEmbedSanitizer, (value) => {
    initializeEmbedSanitizer = value;
  }), () => {
    containsShadowRootMarkup = (input) => /shadowrootmode/i.test(input) || containsDeclarativeShadowRoot(input), serializeElementOpenTag = (input) => "<" + input.localName + Array.from(input.attributes, (input2) => " " + input2.name + '="' + input2.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '"').join("") + ">", embedSharedRootBootstrapScript = "(function(){try{delete window.RTCPeerConnection;}catch(e){}try{delete window.webkitRTCPeerConnection;}catch(e){}try{window.RTCPeerConnection=undefined;}catch(e){}try{window.webkitRTCPeerConnection=undefined;}catch(e){}})();", initializeEmbedSanitizer = (0, runtime2.initializeOnce)(() => {
      unsafeEmbedElementNames = /* @__PURE__ */ new Set([
        "iframe",
        "frame",
        "frameset",
        "object",
        "embed",
        "portal",
        "fencedframe"
      ]), embedSandboxIsolationScript = String.raw`
(function (shareRoots) {
  'use strict';
  var gopd = Object.getOwnPropertyDescriptor;
  var defp = Object.defineProperty;
  /* Every enforcement invocation is UNCURRIED through a Reflect.apply
   * captured at t=0. A captured native held as a reference but invoked
   * via .call/.apply resolves Function.prototype.call at CALL TIME -
   * authored code that poisons it (or poisons it selectively, delegating
   * for everything except the captured functions) would blind the scan,
   * the disarm, and the observer at once while native inserts kept
   * working. applyF is a held function VALUE; later mutation of
   * Reflect.apply cannot touch it. */
  var applyF = Reflect.apply;
  var DOC = document;
  var NP = Node.prototype;
  var EP = Element.prototype;
  var DP = Document.prototype;
  var FP = DocumentFragment.prototype;
  var CP = CharacterData.prototype;
  var TP = DocumentType.prototype;
  var SP = typeof ShadowRoot === 'undefined' ? null : ShadowRoot.prototype;
  var RP = typeof Range === 'undefined' ? null : Range.prototype;

  /* template rides in the selector so the scan recurses into (inert)
   * template content and strips frames there eagerly - they would
   * otherwise materialize when the content is later cloned in. */
  var SEL = 'iframe,frame,frameset,object,embed,portal,fencedframe,template';

  /* t=0 capture: everything the enforcement path touches. Authored code
   * runs after this script and may poison any prototype; the closures
   * below must stay correct regardless (e.g. a poisoned
   * NodeList.prototype.length getter must not hide a frame). */
  var qsaByType = { 1: EP.querySelectorAll, 9: DP.querySelectorAll, 11: FP.querySelectorAll };
  var matchesFn = EP.matches;
  var removeFn = EP.remove;
  var getNodeType = gopd(NP, 'nodeType').get;
  var getParent = gopd(NP, 'parentNode').get;
  var getLocalName = gopd(EP, 'localName').get;
  var getTplContent = typeof HTMLTemplateElement === 'undefined' ? null : gopd(HTMLTemplateElement.prototype, 'content').get;
  var getListLen = gopd(NodeList.prototype, 'length').get;
  var listItem = NodeList.prototype.item;
  var getIframeWin = typeof HTMLIFrameElement === 'undefined' ? null : gopd(HTMLIFrameElement.prototype, 'contentWindow').get;
  var getObjectWin = typeof HTMLObjectElement === 'undefined' ? null : gopd(HTMLObjectElement.prototype, 'contentWindow').get;
  var getFrameWin = typeof HTMLFrameElement === 'undefined' ? null : gopd(HTMLFrameElement.prototype, 'contentWindow').get;
  var getRangeCac = RP ? gopd(RP, 'commonAncestorContainer').get : null;
  var moObserve = typeof MutationObserver === 'undefined' ? null : MutationObserver.prototype.observe;
  var getAddedNodes = typeof MutationRecord === 'undefined' ? null : gopd(MutationRecord.prototype, 'addedNodes').get;
  var report = console.error.bind(console);
  var roots = new WeakMap();
  var rootsGet = WeakMap.prototype.get;
  var rootsSet = WeakMap.prototype.set;

  var clobberRealm = function (w) {
    if (!w) return;
    try { delete w.RTCPeerConnection; } catch (e) {}
    try { delete w.webkitRTCPeerConnection; } catch (e) {}
    try { w.RTCPeerConnection = undefined; } catch (e) {}
    try { w.webkitRTCPeerConnection = undefined; } catch (e) {}
  };

  var disarm = function (el) {
    var name = '?';
    try { name = applyF(getLocalName, el, []); } catch (e) {}
    try {
      var g = name === 'iframe' ? getIframeWin : name === 'object' ? getObjectWin : name === 'frame' ? getFrameWin : null;
      if (g) clobberRealm(applyF(g, el, []));
    } catch (e) {}
    try { applyF(removeFn, el, []); } catch (e) {}
    try { report('[design sandbox] removed a nested browsing-context element (' + name + '); frames are not supported in design previews'); } catch (e) {}
  };

  var scan = function (root) {
    if (root == null) return;
    var nt;
    try { nt = applyF(getNodeType, root, []); } catch (e) { return; }
    if (nt !== 1 && nt !== 9 && nt !== 11) {
      /* text/comment/doctype - scan the containing parent instead */
      var p = null;
      try { p = applyF(getParent, root, []); } catch (e) {}
      if (p != null && p !== root) scan(p);
      return;
    }
    if (nt === 1) {
      var selfName = null;
      try { if (applyF(matchesFn, root, [SEL])) selfName = applyF(getLocalName, root, []); } catch (e) {}
      if (selfName === 'template') {
        if (getTplContent) { try { scan(applyF(getTplContent, root, [])); } catch (e) {} }
      } else if (selfName != null) {
        disarm(root);
        return;
      }
    }
    var list;
    try { list = applyF(qsaByType[nt], root, [SEL]); } catch (e) { return; }
    var n = 0;
    try { n = applyF(getListLen, list, []); } catch (e) { return; }
    for (var i = 0; i < n; i += 1) {
      var el = null;
      try { el = applyF(listItem, list, [i]); } catch (e) { continue; }
      if (el == null) continue;
      var name = null;
      try { name = applyF(getLocalName, el, []); } catch (e) {}
      if (name === 'template') {
        if (getTplContent) { try { scan(applyF(getTplContent, el, [])); } catch (e) {} }
      } else {
        disarm(el);
      }
    }
  };

  /* Backstop: catches insertion paths not enumerated below - async (a
   * microtask late), so it narrows an unknown path to a race instead of
   * an open channel. Observing the Document NODE survives document.open.
   * attachShadow is wrapped so shadow roots (closed ones included) get
   * the same observer - and since declarative shadow-root creation is
   * blocked below, attachShadow-created roots are ALL of them. */
  var observeRoot = function (t) {};
  try {
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i += 1) {
        var added = null;
        try { added = getAddedNodes ? applyF(getAddedNodes, records[i], []) : records[i].addedNodes; } catch (e) { continue; }
        var m = 0;
        try { m = applyF(getListLen, added, []); } catch (e) { continue; }
        for (var j = 0; j < m; j += 1) {
          var node = null;
          try { node = applyF(listItem, added, [j]); } catch (e) { continue; }
          if (node != null) scan(node);
        }
      }
    });
    observeRoot = function (t) { try { applyF(moObserve, mo, [t, { childList: true, subtree: true }]); } catch (e) {} };
    observeRoot(DOC);
  } catch (e) {}

  var wrapScanThis = function (fn) {
    return function () {
      var r = applyF(fn, this, arguments);
      scan(this);
      return r;
    };
  };
  /* ChildNode methods insert SIBLINGS (and replaceWith/outerHTML detach
   * 'this'), so the parent is captured before the native runs. */
  var wrapScanParentThis = function (fn) {
    return function () {
      var p = null;
      try { p = applyF(getParent, this, []); } catch (e) {}
      var r = applyF(fn, this, arguments);
      if (p != null) scan(p);
      scan(this);
      return r;
    };
  };
  var wrapScanRange = function (fn) {
    return function () {
      var c = null;
      try { c = getRangeCac ? applyF(getRangeCac, this, []) : null; } catch (e) {}
      var r = applyF(fn, this, arguments);
      if (c != null) scan(c);
      scan(DOC);
      return r;
    };
  };
  var wrapAttachShadow = function (fn) {
    return function () {
      var root = applyF(fn, this, arguments);
      try { observeRoot(root); } catch (e) {}
      try { applyF(rootsSet, roots, [this, root]); } catch (e) {}
      return root;
    };
  };

  var harden = function (proto, name, makeWrapper, accessor) {
    if (proto == null) return;
    var d = gopd(proto, name);
    if (d == null || d.configurable !== true) return;
    var nd;
    if (accessor) {
      if (typeof d.set !== 'function') return;
      nd = { get: d.get, set: makeWrapper(d.set), enumerable: d.enumerable, configurable: false };
    } else {
      if (typeof d.value !== 'function') return;
      nd = { value: makeWrapper(d.value), writable: false, enumerable: d.enumerable, configurable: false };
    }
    try { defp(proto, name, nd); return true; } catch (e) { report('[design sandbox] could not harden ' + name); }
  };

  /* Hard blocks: surfaces that cannot be made scannable.
   * - document.write/writeln append to the parser INPUT STREAM, not the
   *   tree - a post-call scan sees nothing, the parser materializes the
   *   written iframe with no JS hook, and a written script tag grabs
   *   the child realm before the observer's microtask. Chunked
   *   split-tag writes defeat per-call parsing of the argument, so
   *   blocking is the only winning move.
   * - setHTMLUnsafe / Document.parseHTMLUnsafe instantiate DECLARATIVE
   *   shadow roots, which never pass through attachShadow (so they are
   *   never observed) and which no scan can pierce when closed. With
   *   declarative creation blocked, every shadow root in the realm came
   *   from the wrapped attachShadow and is observed.
   * No legitimate design uses any of these. */
  var hardBlock = function (owner, name, label) {
    if (owner == null) return;
    var d = gopd(owner, name);
    if (d == null || d.configurable !== true || typeof d.value !== 'function') return;
    var blocked = function () {
      try { report('[design sandbox] ' + label + ' is disabled in design previews'); } catch (e) {}
      throw new TypeError(label + ' is not supported in the design preview sandbox');
    };
    try { defp(owner, name, { value: blocked, writable: false, enumerable: d.enumerable, configurable: false }); } catch (e) { report('[design sandbox] could not harden ' + name); }
  };
  hardBlock(DP, 'write', 'document.write');
  hardBlock(DP, 'writeln', 'document.writeln');
  hardBlock(EP, 'setHTMLUnsafe', 'setHTMLUnsafe');
  hardBlock(EP, 'setInnerHTML', 'setInnerHTML');
  if (SP) hardBlock(SP, 'setHTMLUnsafe', 'setHTMLUnsafe');
  if (SP) hardBlock(SP, 'setInnerHTML', 'setInnerHTML');
  hardBlock(typeof Document === 'undefined' ? null : Document, 'parseHTMLUnsafe', 'Document.parseHTMLUnsafe');
  /* The Sanitizer API's safe sinks strip frame elements themselves, but
   * they still INSTANTIATE declarative shadow roots - which never pass
   * through attachShadow and so would never be observed. Same rationale,
   * same block. */
  hardBlock(EP, 'setHTML', 'setHTML');
  if (SP) hardBlock(SP, 'setHTML', 'setHTML');
  hardBlock(typeof Document === 'undefined' ? null : Document, 'parseHTML', 'Document.parseHTML');
  /* Legacy declarative-shadow opt-in on DOMParser: force the two-arg
   * form so an options bag (includeShadowRoots) can never reach the
   * native. The parsed document stays fully inert either way. */
  if (typeof DOMParser !== 'undefined') {
    harden(DOMParser.prototype, 'parseFromString', function (fn) {
      return function () {
        return applyF(fn, this, [arguments[0], arguments[1]]);
      };
    });
  }

  /* A Trusted Types 'default' policy is realm-global: once registered (and
   * enforcement switched on - a page may tighten its CSP with a <meta>),
   * every string reaching a sink passes through it first, the two-phase
   * bootloader's remaining document.write chunks included. No design needs
   * one; named policies stay available. The name is coerced once and the
   * coerced value is what the native sees. */
  if (typeof TrustedTypePolicyFactory !== 'undefined') {
    harden(TrustedTypePolicyFactory.prototype, 'createPolicy', function (fn) {
      return function () {
        var n = '' + arguments[0];
        if (n === 'default') {
          try { report('[design sandbox] a Trusted Types default policy is disabled in design previews'); } catch (e) {}
          throw new TypeError('a Trusted Types default policy is not supported in the design preview sandbox');
        }
        arguments[0] = n;
        return applyF(fn, this, arguments);
      };
    });
  }

  harden(NP, 'appendChild', wrapScanThis);
  harden(NP, 'insertBefore', wrapScanThis);
  harden(NP, 'replaceChild', wrapScanThis);
  var parentNodeProtos = [EP, DP, FP];
  for (var pi = 0; pi < parentNodeProtos.length; pi += 1) {
    harden(parentNodeProtos[pi], 'append', wrapScanThis);
    harden(parentNodeProtos[pi], 'prepend', wrapScanThis);
    harden(parentNodeProtos[pi], 'replaceChildren', wrapScanThis);
    harden(parentNodeProtos[pi], 'moveBefore', wrapScanThis);
  }
  harden(NP, 'moveBefore', wrapScanThis);
  var childNodeProtos = [EP, CP, TP];
  for (var ci = 0; ci < childNodeProtos.length; ci += 1) {
    harden(childNodeProtos[ci], 'before', wrapScanParentThis);
    harden(childNodeProtos[ci], 'after', wrapScanParentThis);
    harden(childNodeProtos[ci], 'replaceWith', wrapScanParentThis);
  }
  harden(EP, 'insertAdjacentElement', wrapScanParentThis);
  harden(EP, 'insertAdjacentHTML', wrapScanParentThis);
  harden(EP, 'innerHTML', wrapScanThis, true);
  harden(EP, 'outerHTML', wrapScanParentThis, true);
  if (SP) harden(SP, 'innerHTML', wrapScanThis, true);
  /* document.body = ... runs the spec's replace-body algorithm through
   * no insertion wrapper (2026-07-29 hunt finding: DOMParser-built
   * subtree + adoptNode + the body setter connects frames with only
   * the async observer watching). The setter is an accessor on
   * Document.prototype; scan the document after the native runs. */
  harden(DP, 'body', wrapScanThis, true);
  /* document.open was previously wrapped-scannable (the observer
   * survives it), but the native RUNS and strips every window/document
   * event listener - the bridge's message listener and the pagehide
   * tripwire included - and its 3-argument form aliases window.open
   * (a self-navigation vector). No legitimate design uses either form;
   * block them outright like document.write. document.close ends the
   * two-phase bootloader's script-created parser early (BOOT_SRCDOC: the
   * one script-created parser a preview ever has), so it goes with them. */
  hardBlock(DP, 'open', 'document.open');
  hardBlock(DP, 'close', 'document.close');
  harden(DP, 'execCommand', wrapScanThis);
  if (RP) {
    harden(RP, 'insertNode', wrapScanRange);
    harden(RP, 'surroundContents', wrapScanRange);
  }
  /* For the embed runtime (runtime.ts), the next script, which takes this and deletes it before author script runs. Shared only by
   * the run that wrapped attachShadow: a copy of this script that author script runs later cannot wrap it again, so it shares nothing. */
  if (harden(EP, 'attachShadow', wrapAttachShadow) && shareRoots) {
    try { defp(window, '__appifactShadowRootOf', { value: function (host) { return applyF(rootsGet, roots, [host]); }, configurable: true }); } catch (e) {}
  }

  /* The guard's liveness handshake (previewGuard.ts) depends on two
   * slots authored code must not be able to trap: a poisoned
   * MessagePort.prototype.postMessage hands over the bridge's port at
   * pong time, and a trapping MessageEvent.prototype.data getter leaks
   * it as ev.target at ping time. The bridge uncurries its own path;
   * this freeze closes the slots for everything else in the realm. */
  var freezeSlot = function (proto, name) {
    if (proto == null) return;
    var d = gopd(proto, name);
    if (d == null || d.configurable !== true) return;
    d.configurable = false;
    if ('writable' in d) d.writable = false;
    try { defp(proto, name, d); } catch (e) { report('[design sandbox] could not freeze ' + name); }
  };
  freezeSlot(typeof MessagePort === 'undefined' ? null : MessagePort.prototype, 'postMessage');
  freezeSlot(typeof MessageEvent === 'undefined' ? null : MessageEvent.prototype, 'data');

  scan(DOC);
})();
`, embedSandboxDiagnosticsScript = embedSandboxIsolationScript.replace(/\}\)\(\);\s*$/, `})(true);
`);
    });
  };
}
export {
  installEmbedsSanitizer
};
