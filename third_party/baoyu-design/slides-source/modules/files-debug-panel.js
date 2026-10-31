// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesDebugPanel(runtime2) {
  var FILES_DEBUG_REFRESH_MS, FILES_DEBUG_EVENT_STAGGER_MS, FILES_DEBUG_VIEW_REFRESH_MS, FILES_DEBUG_PANEL_DEFAULT_SIZE, FILES_DEBUG_PANEL_MIN_SIZE, FILES_DEBUG_TOGGLE_SHORTCUT, createFilesDebugTabId, formatFilesDebugTimestamp, escapeFilesDebugHtml;
  function fileInputDebugText(input) {
    if (input === null)
      return "";
    let content = typeof input == "object" && !(typeof Blob < "u" && input instanceof Blob) ? input.content : input;
    return typeof content == "string" ? content : "";
  }
  function filesDebugEnabled(getStorage = () => globalThis.localStorage) {
    try {
      return getStorage()?.getItem("appifact-files-debug") === "1";
    } catch {
      return !1;
    }
  }
  function sortedSampleQuantile(sortedSamples, quantile) {
    return sortedSamples.length === 0 ? NaN : sortedSamples[Math.min(sortedSamples.length - 1, Math.floor((sortedSamples.length - 1) * quantile + 0.5))];
  }
  function filesDebugEventLevel(event) {
    let type = event.type;
    if (type === "hot-restart" || type === "save-conflict" || type === "save-error" || type === "publish-raw-error" || type === "restart-asked")
      return "error";
    if (type === "read") {
      let value = event.data?.status ?? 200;
      return value === 0 || value >= 400 ? "error" : "boot";
    }
    return type === "reconcile" ? event.data?.ok === !1 ? "error" : "hot" : type.startsWith("hot-") || type === "apply" || type === "visible" || type === "board-remote" || type === "reveal-held" || type === "reconcile-choice" ? "hot" : type.startsWith("save-") || type === "notice" ? "save" : type.startsWith("boot") || type === "listing-retried" ? "boot" : type.startsWith("peer-") || type === "visibility" ? "room" : "other";
  }
  function createFilesDebugPanel(input) {
    let value = "hotdbg/" + input.product + "/", value2 = (() => {
      try {
        return typeof sessionStorage > "u" ? null : sessionStorage;
      } catch {
        return null;
      }
    })(), callback = (input2, options) => {
      try {
        let value62 = value2?.getItem(value + input2);
        return value62 == null ? options : JSON.parse(value62);
      } catch {
        return options;
      }
    }, callback2 = (input2, options) => {
      try {
        options === null ? value2?.removeItem(value + input2) : value2?.setItem(value + input2, JSON.stringify(options));
      } catch {
      }
    }, callback3 = () => typeof performance < "u" ? performance.now() : Date.now(), value3 = input.hot ?? null, value4 = callback("tab", "") || createFilesDebugTabId();
    callback2("tab", value4);
    let value5 = input.bootStartedAt ?? callback3(), value6 = callback("log", []), entries = /* @__PURE__ */ new Map(), entries2 = /* @__PURE__ */ new Map(), items = [], entries3 = /* @__PURE__ */ new Map(), index4 = 0, flag = !1, state = {}, state2 = {
      conflict: 0,
      rate: 0,
      other: 0
    }, value7, items2 = [], value8 = callback("crumb", null), value9 = callback("seen", !1), flag2 = !1, value10;
    try {
      value10 = value3?.from, flag2 = value10 != null;
    } catch {
    }
    let value11 = (() => {
      let value62 = value10?.note;
      if (typeof value62 == "string")
        return value62;
    })(), value12;
    value8?.phase === "hot-restart" ? value12 = "hot restart: " + (value8.reason ?? "asked by this page") : value8?.phase === "publishing" ? value12 = "reloaded during a publish of " + (value8.paths ?? []).join(", ") + " (likely a conflict: the shell reboots the tab that lost)" : flag2 ? value12 = "hot restart by the shell" + (value11 !== void 0 ? " (note: " + value11 + ")" : " (no reason recorded here: no accept handler was registered in time, or the kernel restarted on its own)") : value9 ? value12 = "plain reload" : value12 = "first load";
    let value13 = value8?.phase === "hot-restart" ? "hot restart: " + (value8.reason ?? "?") : value8?.phase === "publishing" ? "during a publish" : flag2 ? "hot restart by the shell" : value9 ? "plain reload" : "first load", value14 = callback("reasons", {});
    value14[value13] = (value14[value13] ?? 0) + 1, callback2("reasons", value14);
    let value15 = callback("reloads", []);
    value15.push({
      t: Date.now(),
      reason: value12
    }), value15.length > 60 && value15.splice(0, value15.length - 60), callback2("reloads", value15), callback2("crumb", null), callback2("seen", !0);
    let entries4 = /* @__PURE__ */ new Map();
    function value16(input2, options) {
      return entries4.has(input2) || entries4.set(input2, {
        label: options,
        on: callback("opt/" + input2, !0)
      }), () => entries4.get(input2)?.on ?? !0;
    }
    let value17, flag3 = !1, callback4 = () => {
      !flag3 || value17 !== void 0 || (value17 = setTimeout(() => {
        value17 = void 0, flag3 && callback2("log", value6.slice(-FILES_DEBUG_EVENT_STAGGER_MS));
      }, 250));
    };
    function value18(input2, options) {
      value6.push({
        t: Date.now(),
        type: input2,
        ...options !== void 0 ? {
          data: options
        } : {}
      }), value6.length > FILES_DEBUG_REFRESH_MS && value6.splice(0, value6.length - FILES_DEBUG_REFRESH_MS), callback4(), value44("events");
    }
    function value19(input2, options) {
      if (!Number.isFinite(options))
        return;
      let value62 = entries2.get(input2) ?? [];
      value62.push(Math.round(options)), value62.length > 300 && value62.shift(), entries2.set(input2, value62), value44("timing");
    }
    let callback5 = () => typeof document < "u" && document.visibilityState !== "visible", value20 = callback5() ? Date.now() : void 0;
    typeof document < "u" && document.addEventListener("visibilitychange", () => {
      value20 = callback5() ? Date.now() : void 0, value18("visibility", {
        state: document.visibilityState
      });
    });
    let value21 = "hotdbg-" + input.product, value22 = callback("pings", []), callback6 = () => {
      value22 = value22.filter((input2) => Date.now() - input2.recvAt < 6e4).slice(-40), callback2("pings", value22);
    };
    function value23(input2) {
      let value62 = input2?.data ?? input2;
      if (value62 === null || typeof value62 != "object" || typeof value62.tab != "string" || value62.tab === value4 || typeof value62.n != "number" || typeof value62.at != "number")
        return;
      let state4 = {
        tab: value62.tab,
        n: value62.n,
        phase: value62.phase === "saved" ? "saved" : "saving",
        ...typeof value62.version == "string" ? {
          version: value62.version
        } : {},
        at: value62.at,
        recvAt: Date.now(),
        ...Array.isArray(value62.paths) ? {
          paths: value62.paths
        } : {}
      };
      value22.push(state4), callback6(), value19("room ping", Math.max(0, state4.recvAt - state4.at)), value18("peer-" + state4.phase, {
        from: state4.tab,
        n: state4.n,
        ...state4.version !== void 0 ? {
          version: state4.version
        } : {},
        ...state4.paths !== void 0 ? {
          paths: state4.paths
        } : {},
        skewedMs: state4.recvAt - state4.at
      }), value43();
    }
    let value24 = null, flag4 = !1;
    input.room !== !1 && (0, runtime2.cachedHostRoom)().then((input2) => {
      if (value24 = input2, entries.set("room", value24 === null ? "off" : "connected"), value44("header"), value24 === null)
        return;
      try {
        value24.on?.(value21, value23, () => {
        });
      } catch {
      }
      let entries6 = /* @__PURE__ */ new Map();
      try {
        value24.onPeers?.((input3) => {
          for (let value62 of input3.peers) {
            let value63 = value62, value64 = value63?.presence?.hotdbg;
            if (value63 === null || value63.sameTab === !0 || value64 === void 0 || typeof value64.tab != "string" || typeof value64.n != "number")
              continue;
            let value65 = value64.tab + "/" + String(value64.phase);
            (entries6.get(value65) ?? -1) >= value64.n || (entries6.set(value65, value64.n), value22.some((input4) => input4.tab === value64.tab && input4.n === value64.n && input4.phase === (value64.phase === "saved" ? "saved" : "saving")) || value23(value64));
          }
        });
      } catch {
      }
    }, () => {
    });
    function value25(input2) {
      let state4 = {
        tab: value4,
        at: Date.now(),
        ...input2
      }, value62 = value24;
      if (value62 === null)
        return;
      let callback12 = () => {
        flag4 = !0;
        try {
          value62.presence?.({
            hotdbg: state4
          })?.catch?.(() => {
          });
        } catch {
        }
      };
      if (flag4 || typeof value62.emit != "function")
        return callback12();
      try {
        value62.emit(value21, state4).catch(callback12);
      } catch {
        callback12();
      }
    }
    let value26 = callback("saveN", 0), entries5 = /* @__PURE__ */ new Map(), callback7 = (input2) => {
      try {
        return JSON.parse(JSON.stringify(input2, (input3, items4) => typeof items4 == "string" && items4.length > 300 ? items4.slice(0, 300) + "…" : items4));
      } catch {
        return String(input2);
      }
    };
    function value27(input2, options) {
      return value26 += 1, callback2("saveN", value26), entries5.set(value26, {
        t: callback3(),
        paths: [...input2],
        bytes: options
      }), callback2("crumb", {
        phase: "publishing",
        paths: flag3 ? [...input2] : [],
        at: Date.now()
      }), value25({
        n: value26,
        phase: "saving",
        paths: [...input2]
      }), value18("save-flush", {
        n: value26,
        paths: input2,
        bytes: options
      }), value44("queue"), value26;
    }
    function value28(input2, options) {
      let entry = entries5.get(input2);
      entries5.delete(input2), entries5.size === 0 && callback2("crumb", null);
      let value62 = entry !== void 0 ? callback3() - entry.t : NaN;
      if (options.ok) {
        if (value19("publish call", value62), value7 = {
          n: input2,
          ms: Math.round(value62),
          ...options.version !== void 0 ? {
            version: options.version
          } : {},
          at: Date.now()
        }, options.version !== void 0) {
          entries.set("on version", options.version);
          for (let value63 of entry?.paths ?? [])
            entries3.set(value63, options.version);
          value25({
            n: input2,
            phase: "saved",
            version: options.version,
            ...entry !== void 0 ? {
              paths: entry.paths
            } : {}
          });
        }
        value18("save-ok", {
          n: input2,
          ms: Math.round(value62),
          version: options.version
        });
      } else
        options.code === "conflict" ? state2.conflict += 1 : options.code === "rate_limited" ? state2.rate += 1 : state2.other += 1, items2.push({
          t: Date.now(),
          n: input2,
          ...options.code !== void 0 ? {
            code: options.code
          } : {},
          ...options.raw !== void 0 ? {
            raw: callback7(options.raw)
          } : {}
        }), items2.length > 30 && items2.shift(), value18(options.code === "conflict" ? "save-conflict" : "save-error", {
          n: input2,
          ms: Math.round(value62),
          code: options.code,
          ...options.raw !== void 0 ? {
            raw: callback7(options.raw)
          } : {}
        });
      value44("queue"), value44("header"), value43();
    }
    function value29(input2, options) {
      let value62 = Date.now(), value63 = value20 !== void 0, value64 = value22.findIndex((input3) => input3.phase === "saved" && input3.version === input2), value65 = value64 >= 0 ? value22[value64].recvAt : options === "restarted" ? value62 : -1;
      if (value65 < 0)
        return;
      let value66 = value22.filter((input3) => input3.recvAt <= value65);
      value22 = value22.filter((input3) => input3.recvAt > value65), callback6();
      let entries6 = /* @__PURE__ */ new Map();
      for (let value67 of value66) {
        let value68 = value67.tab + "#" + String(value67.n), value69 = entries6.get(value68) ?? {};
        value69[value67.phase] = value67, entries6.set(value68, value69);
      }
      for (let value67 of entries6.values()) {
        let value68 = value67.saving ?? value67.saved;
        if (value68 === void 0)
          continue;
        if (value63) {
          index4 += 1;
          continue;
        }
        let value69 = value62 - value68.recvAt;
        value19(options === "adopted" ? "save → visible, adopted" : "save → visible, restarted", value69), items.push({
          how: options,
          ms: value69
        }), items.length > 60 && items.shift(), value67.saved !== void 0 && value19("saved-ping → visible", value62 - value67.saved.recvAt);
      }
      value18("visible", {
        version: input2,
        how: options,
        saves: entries6.size,
        hidden: value63
      }), value43();
    }
    function value30(input2) {
      if (input2.type === "update" && (entries.set("hot shape", input2.shape === "calls" ? "three calls" : "string verdicts"), entries.set("live seen", input2.to + (input2.toSeq !== void 0 ? " · seq " + String(input2.toSeq) : "")), input2.decision === "adopt" && (entries.set("on version", input2.to + (input2.toSeq !== void 0 ? " · seq " + String(input2.toSeq) : "")), flag = !1), input2.decision === "restart" && (flag = !0)), input2.type === "restart" && (flag = !0), input2.type === "applied") {
        flag = !1, input2.grantLagMs !== void 0 && value19("adopt → first 200 (grant lag)", input2.grantLagMs);
        for (let value62 of input2.paths ?? [])
          entries3.set(value62, input2.to);
        value44("files");
      }
      value18("hot-" + input2.type, input2), value44("header"), value43();
    }
    function value31(input2) {
      callback2("crumb", {
        phase: "hot-restart",
        reason: input2,
        at: Date.now()
      }), value18("restart-asked", {
        reason: input2
      }), flag3 && callback2("log", value6.slice(-FILES_DEBUG_EVENT_STAGGER_MS));
    }
    let items3 = [];
    function value32(input2) {
      let value62 = Math.round(callback3() - value5);
      items3.push({
        name: input2,
        ms: value62
      }), (input2 === "first artboard painted" || input2 === "first paint") && value19("boot → first paint", value62), input2 === "all painted" && value19("boot → all painted", value62), value18("boot-phase", {
        name: input2,
        ms: value62
      }), value44("timing");
    }
    function value33(input2, options, context, value62) {
      value18("read", {
        path: input2,
        ms: Math.round(options),
        status: context,
        ...value62 ? {
          fresh: !0
        } : {}
      });
    }
    let value34 = callback("ui", {}), state3 = {
      open: value34.open === !0,
      side: value34.side === "right" ? "right" : "bottom",
      size: {
        ...FILES_DEBUG_PANEL_DEFAULT_SIZE,
        ...value34.size ?? {}
      },
      tab: value34.tab ?? "events",
      kinds: {
        hot: !0,
        save: !0,
        boot: !0,
        room: !0,
        error: !0,
        other: !0,
        ...value34.kinds ?? {}
      },
      text: typeof value34.text == "string" ? value34.text : "",
      paused: !1
    };
    value34.open === void 0 && callback("open", !1) && (state3.open = !0);
    let callback8 = () => callback2("ui", state3);
    flag3 = state3.open, flag3 || callback2("log", null);
    let value35 = null, value36 = null, value37 = null, value38 = null, value39 = null, value40 = null, value41 = null, value42 = null, values = /* @__PURE__ */ new Set(), values2 = /* @__PURE__ */ new Set(), index22 = 0, text = "ok";
    function value43() {
      let value62 = Date.now(), value63 = value22.some((input2) => input2.phase === "saved" && value62 - input2.recvAt < 15e3) || items2.some((input2) => value62 - input2.t < 1e4), value64 = flag ? "bad" : value63 ? "behind" : "ok";
      value64 !== text && (text = value64, value38 && (value38.dataset.status = text), value44("header"));
    }
    function value44(input2) {
      !state3.open || value36 === null || (values2.add(input2), !(index22 !== 0 || typeof requestAnimationFrame != "function") && (index22 = requestAnimationFrame(() => {
        index22 = 0, value45();
      })));
    }
    function value45() {
      if (!state3.open || value39 === null) {
        values2.clear();
        return;
      }
      values2.has("header") && value49();
      let tab = state3.tab;
      tab === "events" && values2.has("events") && !state3.paused && value51(), tab === "timing" && values2.has("timing") && value53(), tab === "files" && (values2.has("files") || values2.has("queue")) && value53(), tab === "queue" && (values2.has("queue") || values2.has("events")) && value53(), values2.clear();
    }
    let callback9 = (input2, options) => {
      if (typeof document > "u")
        return;
      value42 === null && (value42 = document.createElement("style"), value42.setAttribute("data-hot-debug-room", ""), value42.textContent = ":root{--hotdbg-b:0px;--hotdbg-r:0px}html[data-hotdbg-open] .h-screen{height:calc(100vh - var(--hotdbg-b))!important}html[data-hotdbg-open] .h-dvh{height:calc(100dvh - var(--hotdbg-b))!important}html[data-hotdbg-open] .w-screen{width:calc(100vw - var(--hotdbg-r))!important}", document.head.appendChild(value42));
      let documentElement = document.documentElement;
      input2 === null ? documentElement.removeAttribute("data-hotdbg-open") : documentElement.setAttribute("data-hotdbg-open", input2), documentElement.style.setProperty("--hotdbg-b", input2 === "bottom" ? String(options) + "px" : "0px"), documentElement.style.setProperty("--hotdbg-r", input2 === "right" ? String(options) + "px" : "0px");
      try {
        window.dispatchEvent(new Event("resize"));
      } catch {
      }
    }, value46 = input.makeRoom ?? callback9, value47 = `
    :host{all:initial}
    *{box-sizing:border-box}
    .t-dark{--bg:#17181a;--bg2:#1e2023;--fg:#e6e6e3;--mut:#8b9098;--line:#ffffff14;--acc:#6fcfb0;--warn:#f0b35a;--bad:#f07a7a;--sel:#ffffff0d}
    .t-light{--bg:#fbfaf7;--bg2:#f1efea;--fg:#1b1b19;--mut:#6d6f73;--line:#0000001a;--acc:#1f8f6d;--warn:#a96a00;--bad:#c23c3c;--sel:#0000000a}
    .chip{position:fixed;left:10px;bottom:10px;z-index:2147483001;display:flex;align-items:center;gap:6px;font:500 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:5px 9px;cursor:pointer;pointer-events:auto;user-select:none;box-shadow:0 1px 6px #0003}
    .chip[data-open="1"]{display:none}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
    [data-status="behind"] .dot{background:var(--warn)}
    [data-status="bad"] .dot{background:var(--bad)}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .panel{position:fixed;z-index:2147483000;background:var(--bg);color:var(--fg);font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto;display:flex;flex-direction:column;outline:none}
    .panel.bottom{left:0;right:0;bottom:0;border-top:1px solid var(--line)}
    .panel.right{top:0;right:0;bottom:0;border-left:1px solid var(--line)}
    .grip{position:absolute;z-index:2}
    .bottom .grip{left:0;right:0;top:-3px;height:7px;cursor:ns-resize}
    .right .grip{top:0;bottom:0;left:-3px;width:7px;cursor:ew-resize}
    .grip:hover,.grip.on{background:color-mix(in srgb,var(--acc) 40%,transparent)}
    .shield{position:fixed;inset:0;z-index:2147483002;pointer-events:auto}
    .bar{display:flex;align-items:center;gap:10px;padding:0 8px;height:30px;flex:none;border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden}
    .bar .k{color:var(--mut);margin-right:-6px}
    .bar .sp{flex:1}
    .bar .v{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis}
    .ib{all:unset;cursor:pointer;color:var(--mut);padding:3px 6px;border-radius:5px;font:inherit;flex:none}
    .ib:hover{color:var(--fg);background:var(--sel)}
    .tabs{display:flex;gap:2px;padding:0 6px;height:28px;flex:none;border-bottom:1px solid var(--line);align-items:stretch}
    .tab{all:unset;cursor:pointer;padding:0 9px;color:var(--mut);display:flex;align-items:center;border-bottom:2px solid transparent;font:inherit}
    .tab:hover{color:var(--fg)}
    .tab[aria-selected="true"]{color:var(--fg);border-bottom-color:var(--acc)}
    .body{flex:1;min-height:0;overflow:auto;padding:0}
    .tools{display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:1;flex-wrap:wrap}
    .fchip{all:unset;cursor:pointer;padding:1px 8px;border-radius:999px;color:var(--mut);border:1px solid var(--line);font-size:11px}
    .fchip[aria-pressed="true"]{color:var(--fg);background:var(--sel);border-color:transparent}
    input[type=text]{all:unset;flex:1;min-width:120px;padding:2px 8px;border:1px solid var(--line);border-radius:6px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--fg)}
    .row{display:grid;grid-template-columns:86px 120px 1fr;gap:8px;padding:2px 8px;cursor:default;align-items:baseline}
    .row:hover{background:var(--sel)}
    .row .t{color:var(--mut);font:11px ui-monospace,SFMono-Regular,Menlo,monospace}
    .row .ty{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--acc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .row.error .ty{color:var(--bad)} .row.warn .ty{color:var(--warn)}
    .row .s{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
    .raw{margin:0 8px 4px 102px;padding:6px 8px;background:var(--bg2);border-radius:6px;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;user-select:text}
    .pad{padding:8px 10px}
    h4{margin:12px 0 4px;font:600 10px/1 system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
    h4:first-child{margin-top:2px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th{color:var(--mut);font-weight:400;text-align:right;padding:2px 10px 2px 0}
    td{padding:2px 10px 2px 0;text-align:right;white-space:nowrap;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}
    td:first-child,th:first-child{text-align:left;font-family:inherit;font-size:12px}
    table.l td,table.l th{text-align:left;white-space:normal}
    tr:hover td{background:var(--sel)}
    .wf{display:grid;grid-template-columns:minmax(120px,240px) 1fr 60px;gap:8px;align-items:center;padding:1px 0;font-size:12px}
    .wf .barx{height:8px;border-radius:2px;background:color-mix(in srgb,var(--acc) 65%,transparent)}
    .wf .ms{font:11px ui-monospace,monospace;color:var(--mut);text-align:right}
    .spark{display:flex;align-items:flex-end;gap:2px;height:44px;padding:2px 0}
    .spark i{display:block;width:6px;border-radius:1px;background:var(--acc)}
    .spark i.r{background:var(--bad)}
    .mut{color:var(--mut)}
    .st{display:inline-block;padding:0 6px;border-radius:999px;font-size:10px;background:var(--sel);margin-right:4px}
    .st.b{color:var(--bad)} .st.w{color:var(--warn)}
    label{display:block;padding:1px 0}
    textarea{width:100%;height:120px;background:var(--bg2);color:var(--fg);border:0;font:10px/1.3 ui-monospace,monospace;padding:6px}
  `, callback10 = (input2, options, context) => {
      let value62 = document.createElement(input2);
      return options !== void 0 && (value62.className = options), context !== void 0 && (value62.textContent = context), value62;
    }, callback11 = () => {
      let value62 = document.documentElement.getAttribute("data-theme") ?? document.documentElement.getAttribute("data-mode");
      if (value62 === "dark" || value62 === "light")
        return value62;
      try {
        return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch {
        return "dark";
      }
    };
    function value48(input2) {
      let value62 = input2.data ?? {}, callback12 = (input3) => {
        try {
          return JSON.stringify(input3);
        } catch {
          return String(input3);
        }
      };
      switch (input2.type) {
        case "hot-update": {
          let changed = value62.changed, value63 = changed === null ? "changed: null" : changed.map((input3) => input3.path + (input3.klass === "code" ? " [CODE]" : "")).join(", ");
          return {
            cls: value62.decision === "restart" ? "error" : value62.decision === "defer" ? "warn" : "",
            text: `${String(value62.decision).toUpperCase()} · ${escapeFilesDebugHtml(String(value62.from))} → ${escapeFilesDebugHtml(String(value62.to))}${value62.toSeq !== void 0 ? " seq " + String(value62.toSeq) : ""} · required ${String(value62.required)} · ${value63} · ${String(value62.why ?? "")}${value62.early === !0 ? " (early handler)" : ""}`
          };
        }
        case "hot-fetch":
          return {
            cls: value62.ok === !0 ? "" : "warn",
            text: `${String(value62.path)} · try ${String(value62.attempt)} → ${value62.ok === !0 ? "200" : String(value62.status ?? "failed")} at +${String(value62.msAfterAdopt)} ms after adopt`
          };
        case "hot-pending":
          return {
            cls: "warn",
            text: `still refused ${String(value62.msAfterAdopt)} ms after adopt: old content stays, retrying slowly · ${callback12(value62.paths)}`
          };
        case "hot-applied":
          return {
            cls: "",
            text: `${String(value62.applied)}/${String(value62.rows)} rows in ${String(value62.ms)} ms · grant lag ${String(value62.grantLagMs ?? "—")} ms · retries ${String(value62.retries)} · ${callback12(value62.paths ?? [])}`
          };
        case "hot-restart":
          return {
            cls: "error",
            text: `restart asked: ${String(value62.reason)}${value62.error !== void 0 ? " · " + String(value62.error) : ""}`
          };
        case "hot-deferred":
          return {
            cls: "warn",
            text: `deferred (${String(value62.reason)})`
          };
        case "hot-reveal":
          return {
            cls: value62.timedOut === !0 ? "warn" : "",
            text: `restarted realm shown after holding the reveal ${String(value62.heldMs)} ms${value62.timedOut === !0 ? " (the hold ran out before the editor painted)" : ""}${value62.carried === !0 ? " · view carried" : ""}`
          };
        case "reconcile": {
          let { regions: value63, guard: value64 } = value62, value65 = value62.overlapList ?? [];
          return {
            cls: value62.ok === !0 ? Number(value62.overlaps) > 0 ? "warn" : "" : "error",
            text: `${String(value62.file)} · ${String(value62.trigger)} · ${value62.ok === !0 ? "FOLDED" : "NOT merged: " + String(value62.why ?? "")}${value63 !== void 0 ? ` · template ${value63.template}, script ${value63.script}, outer ${value63.outer}` : ""} · ${String(value62.applied)} of mine re-applied · ${String(value62.overlaps)} overlaps${value65.length > 0 ? " (" + value65.map((input3) => `${input3.name}: mine ${String(input3.to)} over theirs ${String(input3.theirs)}`).join("; ") + ")" : ""}${value64 !== void 0 ? ` · same tree: theirs ${String(value64.baseTheirs)}, mine ${String(value64.baseMine)}` : ""} · ${String(value62.ms)} ms`
          };
        }
        case "reconcile-choice":
          return {
            cls: "",
            text: `${String(value62.file)} · the person chose: ${String(value62.choice)}`
          };
        case "board-remote":
          return {
            cls: "",
            text: `${String(value62.file)} · ${String(value62.how)}${value62.why !== void 0 ? " · " + String(value62.why) : ""}${value62.ms !== void 0 ? " · " + String(value62.ms) + " ms" : ""}`
          };
        case "save-flush":
          return {
            cls: "",
            text: `#${String(value62.n)} ${callback12(value62.paths)} · ${String(value62.bytes)} B`
          };
        case "save-ok":
          return {
            cls: "",
            text: `#${String(value62.n)} published in ${String(value62.ms)} ms → ${escapeFilesDebugHtml(String(value62.version))}`
          };
        case "save-conflict":
        case "save-error":
          return {
            cls: "error",
            text: `#${String(value62.n)} ${String(value62.code)} after ${String(value62.ms)} ms · ${callback12(value62.raw ?? "")}`
          };
        case "boot":
          return {
            cls: "",
            text: String(value62.reason)
          };
        case "boot-phase":
          return {
            cls: "",
            text: `${String(value62.name)} at +${String(value62.ms)} ms`
          };
        case "read":
          return {
            cls: Number(value62.status) >= 400 || value62.status === 0 ? "warn" : "",
            text: `${String(value62.path)} · ${String(value62.status)} in ${String(value62.ms)} ms${value62.fresh === !0 ? " (no-store)" : ""}`
          };
        case "peer-saving":
        case "peer-saved":
          return {
            cls: "",
            text: `${String(value62.from)} #${String(value62.n)}${value62.version !== void 0 ? " → " + escapeFilesDebugHtml(String(value62.version)) : ""} ${callback12(value62.paths ?? [])}`
          };
        default:
          return {
            cls: "",
            text: callback12(value62)
          };
      }
    }
    function value49() {
      let value62 = value39?.querySelector(".bar");
      if (!value62)
        return;
      value62.setAttribute("data-status", text);
      let callback12 = (input2, options) => {
        let element = value62.querySelector('[data-f="' + input2 + '"]');
        element && element.textContent !== options && (element.textContent = options);
      };
      callback12("tab", value4), callback12("ver", entries.get("on version") ?? "—"), callback12("hot", value3 === null ? "absent" : entries.get("hot shape") ?? "present"), callback12("status", text === "ok" ? "level with live" : text === "behind" ? "behind live" : "last update restarted");
    }
    function value50() {
      let value62 = state3.text.trim().toLowerCase(), items4 = [];
      for (let value63 = value6.length - 1; value63 >= 0 && items4.length < FILES_DEBUG_VIEW_REFRESH_MS; value63--) {
        let value64 = value6[value63];
        if (state3.kinds[filesDebugEventLevel(value64)]) {
          if (value62 !== "") {
            let type = value64.type;
            try {
              type += " " + JSON.stringify(value64.data ?? "");
            } catch {
            }
            if (!type.toLowerCase().includes(value62))
              continue;
          }
          items4.push(value64);
        }
      }
      return items4;
    }
    function value51() {
      if (value41 === null)
        return;
      let value62 = value50(), value63 = document.createDocumentFragment();
      for (let value64 of value62) {
        let value65 = value48(value64), value66 = filesDebugEventLevel(value64), value67 = callback10("div", "row " + (value66 === "error" ? "error" : value65.cls));
        if (value67.append(callback10("span", "t", formatFilesDebugTimestamp(value64.t)), callback10("span", "ty", value64.type), callback10("span", "s", value65.text)), value67.title = "click for the raw event", value67.addEventListener("click", () => {
          values.has(value64) ? values.delete(value64) : values.add(value64), value51();
        }), value63.append(value67), values.has(value64)) {
          let text2 = "";
          try {
            text2 = JSON.stringify(value64.data ?? {}, null, 1);
          } catch {
            text2 = String(value64.data);
          }
          value63.append(callback10("div", "raw", text2));
        }
      }
      value62.length === 0 && value63.append(callback10("div", "pad mut", value6.length === 0 ? "Nothing logged yet." : "No event matches the filters.")), value41.replaceChildren(value63);
    }
    function value52(input2, options, context) {
      let value62 = callback10("table", context);
      if (input2.some((input3) => input3 !== "")) {
        let value63 = callback10("tr");
        for (let value64 of input2)
          value63.append(callback10("th", void 0, value64));
        value62.append(value63);
      }
      for (let value63 of options) {
        let value64 = callback10("tr");
        for (let value65 of value63)
          value64.append(callback10("td", void 0, String(value65)));
        value62.append(value64);
      }
      return value62;
    }
    function value53() {
      if (value40 === null)
        return;
      let value62 = value40;
      if (value41 = null, value62.replaceChildren(), state3.tab === "events") {
        let value64 = callback10("div", "tools");
        for (let value67 of [
          "hot",
          "save",
          "boot",
          "room",
          "error",
          "other"
        ]) {
          let value68 = callback10("button", "fchip", value67);
          value68.setAttribute("aria-pressed", String(state3.kinds[value67])), value68.addEventListener("click", () => {
            state3.kinds[value67] = !state3.kinds[value67], value68.setAttribute("aria-pressed", String(state3.kinds[value67])), callback8(), value51();
          }), value64.append(value68);
        }
        let value65 = callback10("input");
        value65.type = "text", value65.placeholder = "filter (path, version, reason…)", value65.value = state3.text, value65.addEventListener("input", () => {
          state3.text = value65.value, callback8(), value51();
        });
        let value66 = callback10("button", "fchip", state3.paused ? "paused" : "live");
        value66.setAttribute("aria-pressed", String(!state3.paused)), value66.title = "pause the list (events keep being recorded)", value66.addEventListener("click", () => {
          state3.paused = !state3.paused, value66.textContent = state3.paused ? "paused" : "live", value66.setAttribute("aria-pressed", String(!state3.paused)), state3.paused || value51();
        }), value64.append(value65, value66, callback10("span", "mut", `newest first · ${String(FILES_DEBUG_VIEW_REFRESH_MS)} drawn at most · ${String(FILES_DEBUG_REFRESH_MS)} kept`)), value41 = callback10("div"), value62.append(value64, value41), value51();
        return;
      }
      let value63 = callback10("div", "pad");
      if (value62.append(value63), state3.tab === "timing") {
        value63.append(callback10("h4", void 0, "timing · ms"));
        let value64 = [...entries2.entries()].map(([input2, input3]) => {
          let value68 = [...input3].sort((input4, options) => input4 - options);
          return [
            input2,
            sortedSampleQuantile(value68, 0.5),
            sortedSampleQuantile(value68, 0.95),
            value68[value68.length - 1],
            value68.length
          ];
        });
        value63.append(value64.length > 0 ? value52(["", "p50", "p95", "max", "n"], value64) : callback10("div", "mut", "No samples yet. Save in another tab and watch this one.")), index4 > 0 && value63.append(callback10("div", "mut", `${String(index4)} samples taken while this tab was hidden were left out.`)), value63.append(callback10("h4", void 0, "save → visible, newest on the right · green adopted, red restarted"));
        let value65 = callback10("div", "spark"), value66 = Math.max(1, ...items.map((input2) => input2.ms));
        for (let value68 of items) {
          let value69 = callback10("i", value68.how === "restarted" ? "r" : "");
          value69.style.height = String(Math.max(2, Math.round(value68.ms / value66 * 40))) + "px", value69.title = value68.how + " · " + String(value68.ms) + " ms", value65.append(value69);
        }
        value63.append(items.length > 0 ? value65 : callback10("div", "mut", "—")), value63.append(callback10("h4", void 0, "boot, from the entry module"));
        let value67 = Math.max(1, ...items3.map((input2) => input2.ms));
        for (let value68 of items3) {
          let value69 = callback10("div", "wf"), value70 = callback10("div"), value71 = callback10("div", "barx");
          value71.style.width = String(Math.max(1, Math.round(value68.ms / value67 * 100))) + "%", value70.append(value71), value69.append(callback10("span", void 0, value68.name), value70, callback10("span", "ms", "+" + String(value68.ms))), value63.append(value69);
        }
        if (items3.length === 0 && value63.append(callback10("div", "mut", "—")), entries4.size > 0) {
          value63.append(callback10("h4", void 0, "options"));
          for (let [value68, value69] of entries4) {
            let value70 = callback10("label"), value71 = callback10("input");
            value71.type = "checkbox", value71.checked = value69.on, value71.addEventListener("change", () => {
              value69.on = value71.checked, callback2("opt/" + value68, value69.on), value18("option", {
                key: value68,
                on: value69.on
              });
            }), value70.append(value71, document.createTextNode(" " + value69.label)), value63.append(value70);
          }
        }
        return;
      }
      if (state3.tab === "files") {
        let items4 = [];
        try {
          items4 = state.files?.() ?? [];
        } catch {
          items4 = [];
        }
        if (value63.append(callback10("h4", void 0, `files this tab knows · ${String(items4.length)}`)), items4.length === 0) {
          value63.append(callback10("div", "mut", state.files === void 0 ? "This editor did not provide its file list." : "No files."));
          return;
        }
        let value64 = callback10("table", "l"), value65 = callback10("tr");
        for (let value66 of [
          "path",
          "state",
          "on screen",
          "live",
          "size",
          "last changed at"
        ])
          value65.append(callback10("th", void 0, value66));
        value64.append(value65);
        for (let value66 of [...items4].sort((input2, options) => input2.path < options.path ? -1 : 1)) {
          let value67 = callback10("tr"), value68 = callback10("td");
          for (let value69 of (value66.state ?? "").split(" ").filter(Boolean))
            value68.append(callback10("span", "st" + (value69 === "conflicted" ? " b" : value69 === "behind" || value69 === "held" ? " w" : ""), value69));
          value67.append(callback10("td", void 0, value66.path), value68, callback10("td", void 0, (value66.sha ?? "—").slice(0, 10)), callback10("td", void 0, value66.liveSha === void 0 ? "" : (value66.liveSha ?? "removed").slice(0, 10)), callback10("td", void 0, value66.size !== void 0 ? String(value66.size) : ""), callback10("td", void 0, escapeFilesDebugHtml(entries3.get(value66.path)))), value64.append(value67);
        }
        value63.append(value64);
        return;
      }
      if (state3.tab === "queue") {
        let value64;
        try {
          value64 = state.queue?.();
        } catch {
          value64 = void 0;
        }
        value63.append(callback10("h4", void 0, "now")), value63.append(value52(["", ""], [
          [
            "dirty",
            value64 === void 0 ? "(not provided)" : value64.dirty.length === 0 ? "none" : value64.dirty.join(", ")
          ],
          [
            "in flight",
            entries5.size > 0 ? [...entries5.values()].map((input2) => input2.paths.join(", ")).join(" | ") : value64?.inFlight === !0 ? "yes" : "no"
          ],
          [
            "conflicted",
            value64?.conflicted !== void 0 && value64.conflicted.length > 0 ? value64.conflicted.join(", ") : "none"
          ],
          [
            "last publish",
            value7 === void 0 ? "—" : `#${String(value7.n)} · ${String(value7.ms)} ms → ${escapeFilesDebugHtml(value7.version)} · ${formatFilesDebugTimestamp(value7.at)}`
          ],
          ["queue says", value64?.lastError ?? "ok"],
          ["publishes", String(value26)],
          [
            "errors",
            `409 conflict ×${String(state2.conflict)} · 429 rate limit ×${String(state2.rate)} · other ×${String(state2.other)}`
          ],
          [
            "catch-up waits",
            value64?.note ?? "this editor does not wait for a newer version before saving yet"
          ]
        ], "l")), value63.append(callback10("h4", void 0, "publish errors, newest first")), items2.length === 0 && value63.append(callback10("div", "mut", "none"));
        for (let value65 of [...items2].reverse()) {
          let text2 = "";
          try {
            text2 = JSON.stringify(value65.raw ?? {}, null, 1);
          } catch {
            text2 = String(value65.raw);
          }
          let value66 = callback10("div", "raw", text2);
          value66.style.marginLeft = "0", value63.append(callback10("div", "mut", `${formatFilesDebugTimestamp(value65.t)} · #${String(value65.n)} · ${String(value65.code)}`), value66);
        }
        return;
      }
      value63.append(callback10("h4", void 0, "this tab last loaded because")), value63.append(callback10("div", void 0, value12)), value63.append(callback10("h4", void 0, "counts by reason")), value63.append(value52(["reason", "times"], Object.entries(value14).sort((input2, options) => options[1] - input2[1]).map(([input2, input3]) => [
        input2,
        input3
      ]))), value63.append(callback10("h4", void 0, "history, newest first")), value63.append(value52(["when", "reason"], [...value15].reverse().map((input2) => [
        formatFilesDebugTimestamp(input2.t),
        input2.reason
      ]), "l"));
    }
    function value54(input2, options) {
      let value62 = Math.round((input2 === "bottom" ? window.innerHeight : window.innerWidth) * 0.8);
      return Math.max(FILES_DEBUG_PANEL_MIN_SIZE[input2], Math.min(value62, Math.round(options)));
    }
    function value55() {
      if (value39 === null || value37 === null)
        return;
      value37.className = "t-" + callback11(), value39.className = "panel " + state3.side;
      let value62 = value54(state3.side, state3.size[state3.side]);
      state3.side === "bottom" ? (value39.style.height = String(value62) + "px", value39.style.width = "") : (value39.style.width = String(value62) + "px", value39.style.height = ""), value46(state3.open ? state3.side : null, state3.open ? value62 : 0);
    }
    function value56() {
      value39?.querySelectorAll(".tab").forEach((element) => element.setAttribute("aria-selected", String(element.getAttribute("data-tab") === state3.tab)));
    }
    function value57(input2) {
      state3.open = input2, flag3 = input2, input2 ? callback4() : callback2("log", null), callback8(), value38 && (value38.dataset.open = input2 ? "1" : "0"), value39 && (value39.style.display = input2 ? "flex" : "none"), input2 ? (value55(), value49(), value56(), value53()) : value46(null, 0);
    }
    function value58() {
      if (value36 === null)
        return;
      value37 = callback10("div", "t-" + callback11());
      let value62 = value37;
      value38 = callback10("div", "chip"), value38.dataset.status = text, value38.dataset.open = "0", value38.title = "hot-reload debug panel (" + FILES_DEBUG_TOGGLE_SHORTCUT + ")", value38.append(callback10("span", "dot"), callback10("span", void 0, "hot"), callback10("span", "mono", value4)), value38.addEventListener("click", () => value57(!0)), value39 = callback10("div", "panel " + state3.side), value39.style.display = "none", value39.tabIndex = -1;
      let value63 = callback10("div", "grip");
      value63.title = "drag to resize · double-click to reset", value63.addEventListener("dblclick", () => {
        state3.size[state3.side] = FILES_DEBUG_PANEL_DEFAULT_SIZE[state3.side], callback8(), value55();
      }), value63.addEventListener("pointerdown", (event) => {
        event.preventDefault(), value63.classList.add("on");
        let value70 = callback10("div", "shield");
        value70.style.cursor = state3.side === "bottom" ? "ns-resize" : "ew-resize", value62.append(value70);
        let callback14 = (input2) => {
          state3.size[state3.side] = value54(state3.side, state3.side === "bottom" ? window.innerHeight - input2.clientY : window.innerWidth - input2.clientX), value55();
        }, callback15 = () => {
          value70.remove(), value63.classList.remove("on"), window.removeEventListener("pointermove", callback14, !0), window.removeEventListener("pointerup", callback15, !0), window.removeEventListener("pointercancel", callback15, !0), callback8();
        };
        window.addEventListener("pointermove", callback14, !0), window.addEventListener("pointerup", callback15, !0), window.addEventListener("pointercancel", callback15, !0);
      });
      let value64 = callback10("div", "bar");
      value64.setAttribute("data-status", text);
      let callback12 = (input2, options) => {
        value64.append(callback10("span", "k", input2));
        let value70 = callback10("span", "v");
        value70.setAttribute("data-f", options), value64.append(value70);
      };
      value64.append(callback10("span", "dot"));
      let value65 = callback10("span");
      value65.setAttribute("data-f", "status"), value64.append(value65), callback12("tab", "tab"), callback12("version", "ver"), callback12("slidesHost.hot", "hot"), value64.append(callback10("span", "sp"));
      let callback13 = (input2, options, context) => {
        let value70 = callback10("button", "ib", input2);
        value70.title = options, value70.addEventListener("click", context), value64.append(value70);
      };
      callback13("dock ⇄", "dock to the other side (bottom / right)", () => {
        state3.side = state3.side === "bottom" ? "right" : "bottom", callback8(), value55();
      }), callback13("clear", "clear the log", () => {
        value6.length = 0, values.clear(), callback2("log", value6), value53();
      }), callback13("copy log", "copy the whole log as JSON", () => {
        let value70 = value59(), flag6 = !1;
        try {
          navigator.clipboard?.writeText(value70).then(() => {
            flag6 = !0;
          }, () => {
          });
        } catch {
        }
        setTimeout(() => {
          if (flag6 || value40 === null)
            return;
          value40.querySelector("textarea")?.remove();
          let value71 = callback10("textarea");
          value71.readOnly = !0, value71.value = value70, value40.prepend(value71);
        }, 200);
      }), callback13("✕", "close (Esc while the panel has focus, or " + FILES_DEBUG_TOGGLE_SHORTCUT + ")", () => value57(!1));
      let value66 = callback10("div", "tabs");
      for (let [value70, value71] of [
        ["events", "Events"],
        ["timing", "Timing"],
        ["files", "Files"],
        ["queue", "Save queue"],
        ["reloads", "Reloads"]
      ]) {
        let value72 = callback10("button", "tab", value71);
        value72.setAttribute("data-tab", value70), value72.addEventListener("click", () => {
          state3.tab = value70, callback8(), value56(), value53();
        }), value66.append(value72);
      }
      value40 = callback10("div", "body"), value39.append(value63, value64, value66, value40), value39.addEventListener("keydown", (input2) => {
        input2.key === "Escape" && (input2.stopPropagation(), value57(!1));
      }), value62.append(value38, value39);
      let value67 = callback10("style");
      value67.textContent = value47, value36.replaceChildren(value67, value62), state3.open && value57(!0);
      try {
        new MutationObserver(() => {
          value37 && (value37.className = "t-" + callback11());
        }).observe(document.documentElement, {
          attributes: !0,
          attributeFilter: ["data-theme", "data-mode"]
        });
      } catch {
      }
      let { innerWidth: value68, innerHeight: value69 } = window;
      window.addEventListener("resize", () => {
        !state3.open || window.innerWidth === value68 && window.innerHeight === value69 || (value68 = window.innerWidth, value69 = window.innerHeight, value55());
      }), setInterval(value43, 3e3);
    }
    function value59() {
      let state4 = {};
      for (let [value64, value65] of entries2) {
        let value66 = [...value65].sort((input2, options) => input2 - options);
        state4[value64] = {
          p50: sortedSampleQuantile(value66, 0.5),
          p95: sortedSampleQuantile(value66, 0.95),
          max: value66[value66.length - 1],
          n: value66.length
        };
      }
      let value62, value63;
      try {
        value62 = state.files?.();
      } catch {
      }
      try {
        value63 = state.queue?.();
      } catch {
      }
      return JSON.stringify({
        tab: value4,
        reloadReason: value12,
        reasons: value14,
        reloads: value15,
        fields: Object.fromEntries(entries),
        stats: state4,
        excludedHidden: index4,
        phases: items3,
        counters: state2,
        publishErrors: items2,
        series: items,
        files: value62,
        queue: value63,
        log: value6
      }, null, 1);
    }
    let flag5 = !1;
    function value60() {
      if (flag5 || typeof window > "u")
        return;
      flag5 = !0;
      let callback12 = (input2) => {
        try {
          return value39 !== null && input2.composedPath().includes(value39);
        } catch {
          return !1;
        }
      };
      window.addEventListener("keydown", (event) => {
        if (event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "`" || event.code === "Backquote")) {
          event.preventDefault(), event.stopImmediatePropagation(), value57(!state3.open);
          return;
        }
        callback12(event) && (event.stopImmediatePropagation(), event.key === "Escape" && value57(!1));
      }, !0);
      for (let value62 of [
        "keyup",
        "keypress",
        "copy",
        "cut",
        "paste",
        "wheel",
        "contextmenu"
      ])
        window.addEventListener(value62, (input2) => {
          callback12(input2) && input2.stopImmediatePropagation();
        }, !0);
    }
    function value61(input2) {
      if (input2 !== "files" || typeof document > "u" || value35 !== null)
        return;
      value60();
      let callback12 = () => {
        value35 === null && (value35 = document.createElement("div"), value35.setAttribute("data-hot-debug", ""), value35.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none", value36 = value35.attachShadow({
          mode: "open"
        }), (document.body ?? document.documentElement).appendChild(value35), value58());
      };
      document.body !== null ? callback12() : document.addEventListener("DOMContentLoaded", callback12, {
        once: !0
      });
    }
    return value18("boot", {
      reason: value12,
      viaHot: flag2,
      ...value10 != null ? {
        hotFrom: value10
      } : {},
      ...value8 !== null ? {
        crumb: value8
      } : {}
    }), {
      tab: value4,
      reloadReason: value12,
      field(input2, options) {
        entries.set(input2, options), value44("header");
      },
      event: value18,
      hotEvent: value30,
      beforeRestart: value31,
      saveStart: value27,
      saveEnd: value28,
      phase: value32,
      read: value33,
      visible: value29,
      sample: value19,
      mount: value61,
      exportJson: value59,
      option: value16,
      provide(input2) {
        state = {
          ...state,
          ...input2
        }, value44("files"), value44("queue");
      }
    };
  }
  function instrumentFilesPort(port, debug) {
    let value = Object.create(port);
    return value.publish = async (input, options) => {
      let value2;
      try {
        value2 = debug.saveStart(Object.keys(input), Object.values(input).reduce((input2, options2) => input2 + (0, runtime2.filePublishEncodedBytes)(options2), 0));
      } catch {
      }
      let value3 = await port.publish(input, options);
      try {
        value2 !== void 0 && debug.saveEnd(value2, value3.ok ? {
          ok: !0,
          version: value3.version
        } : {
          ok: !1,
          code: value3.code,
          raw: value3
        });
      } catch {
      }
      return value3;
    }, value;
  }
  function createNoopFilesDebugger() {
    let callback = () => {
    };
    return {
      tab: "",
      reloadReason: "",
      field: callback,
      event: callback,
      hotEvent: callback,
      beforeRestart: callback,
      saveStart: () => 0,
      saveEnd: callback,
      phase: callback,
      read: callback,
      visible: callback,
      sample: callback,
      mount: callback,
      exportJson: () => "{}",
      option: () => () => !0,
      provide: callback
    };
  }
  function createFilesDebugger(options) {
    return filesDebugEnabled() ? createFilesDebugPanel(options) : createNoopFilesDebugger();
  }
  return bindRuntimeValue(runtime2, "fileInputDebugText", () => fileInputDebugText), bindRuntimeValue(runtime2, "filesDebugEnabled", () => filesDebugEnabled), bindRuntimeValue(runtime2, "FILES_DEBUG_REFRESH_MS", () => FILES_DEBUG_REFRESH_MS, (value) => {
    FILES_DEBUG_REFRESH_MS = value;
  }), bindRuntimeValue(runtime2, "FILES_DEBUG_EVENT_STAGGER_MS", () => FILES_DEBUG_EVENT_STAGGER_MS, (value) => {
    FILES_DEBUG_EVENT_STAGGER_MS = value;
  }), bindRuntimeValue(runtime2, "FILES_DEBUG_VIEW_REFRESH_MS", () => FILES_DEBUG_VIEW_REFRESH_MS, (value) => {
    FILES_DEBUG_VIEW_REFRESH_MS = value;
  }), bindRuntimeValue(runtime2, "FILES_DEBUG_PANEL_DEFAULT_SIZE", () => FILES_DEBUG_PANEL_DEFAULT_SIZE, (value) => {
    FILES_DEBUG_PANEL_DEFAULT_SIZE = value;
  }), bindRuntimeValue(runtime2, "FILES_DEBUG_PANEL_MIN_SIZE", () => FILES_DEBUG_PANEL_MIN_SIZE, (value) => {
    FILES_DEBUG_PANEL_MIN_SIZE = value;
  }), bindRuntimeValue(runtime2, "FILES_DEBUG_TOGGLE_SHORTCUT", () => FILES_DEBUG_TOGGLE_SHORTCUT, (value) => {
    FILES_DEBUG_TOGGLE_SHORTCUT = value;
  }), bindRuntimeValue(runtime2, "createFilesDebugTabId", () => createFilesDebugTabId, (value) => {
    createFilesDebugTabId = value;
  }), bindRuntimeValue(runtime2, "formatFilesDebugTimestamp", () => formatFilesDebugTimestamp, (value) => {
    formatFilesDebugTimestamp = value;
  }), bindRuntimeValue(runtime2, "escapeFilesDebugHtml", () => escapeFilesDebugHtml, (value) => {
    escapeFilesDebugHtml = value;
  }), bindRuntimeValue(runtime2, "sortedSampleQuantile", () => sortedSampleQuantile), bindRuntimeValue(runtime2, "filesDebugEventLevel", () => filesDebugEventLevel), bindRuntimeValue(runtime2, "createFilesDebugPanel", () => createFilesDebugPanel), bindRuntimeValue(runtime2, "instrumentFilesPort", () => instrumentFilesPort), bindRuntimeValue(runtime2, "createNoopFilesDebugger", () => createNoopFilesDebugger), bindRuntimeValue(runtime2, "createFilesDebugger", () => createFilesDebugger), () => {
    FILES_DEBUG_REFRESH_MS = 1500, FILES_DEBUG_EVENT_STAGGER_MS = 150, FILES_DEBUG_VIEW_REFRESH_MS = 250, FILES_DEBUG_PANEL_DEFAULT_SIZE = {
      bottom: 300,
      right: 440
    }, FILES_DEBUG_PANEL_MIN_SIZE = {
      bottom: 140,
      right: 300
    }, FILES_DEBUG_TOGGLE_SHORTCUT = "Ctrl+`", createFilesDebugTabId = () => Math.random().toString(36).slice(2, 6), formatFilesDebugTimestamp = (input) => new Date(input).toISOString().slice(11, 23), escapeFilesDebugHtml = (items) => items == null || items === "" ? "—" : items.length > 18 ? items.slice(0, 10) + "…" + items.slice(-4) : items;
  };
}
export {
  installFilesDebugPanel
};
