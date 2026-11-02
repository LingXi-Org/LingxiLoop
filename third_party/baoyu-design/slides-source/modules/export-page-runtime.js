// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPageRuntime(runtime2) {
  function deckPageRuntime(config) {
    var value = document, documentElement = value.documentElement;
    documentElement.classList.add("deck-js");
    var count = 1;
    function value2() {
      var value4 = Math.min(documentElement.clientWidth / config.w, documentElement.clientHeight / config.h);
      count = value4 > 0 ? value4 : 1, documentElement.style.setProperty("--deck-s", String(count));
    }
    value2();
    function value3() {
      var value4 = Array.prototype.slice.call(value.querySelectorAll(".deck-slide")), length = value4.length;
      if (length === 0)
        return;
      var value5 = value4.map(function(element2) {
        return element2.querySelector(".deck-scaler > *") || element2;
      }), element = value.querySelector(".deck-pager"), value6 = typeof window.matchMedia == "function" ? window.matchMedia("(max-aspect-ratio: 1/1)") : null, state = {
        index: 0,
        step: 0
      }, flag = !1, items = [], index4 = 0, index22 = 0, index32 = 0, value7 = null, items2 = [], flag2 = !1, flag3 = !0, value8 = -1, flag4 = !1;
      function value9() {
        return typeof window.matchMedia == "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
      function value10(input) {
        return config.slides[input] ? config.slides[input].steps.length - 1 : 0;
      }
      function value11(input, options) {
        return value5[input].querySelector('[data-frame-id="' + options.replace(/["\\]/g, "") + '"]');
      }
      function value12(input) {
        return Array.prototype.slice.call(value5[input].querySelectorAll("[data-frame-id]"));
      }
      function value13(input) {
        try {
          window.history.replaceState(null, "", "#" + String(input + 1));
        } catch {
        }
      }
      function value14(input) {
        element !== null && (element.textContent = String(input + 1) + " / " + String(length), element.setAttribute("data-on", ""), clearTimeout(index22), index22 = window.setTimeout(function() {
          element !== null && element.removeAttribute("data-on");
        }, 1600));
      }
      function value15() {
        for (var scrollTop = documentElement.scrollTop, index9 = 0, count2 = 1; count2 < length; count2++)
          Math.abs(value4[count2].offsetTop - scrollTop) < Math.abs(value4[index9].offsetTop - scrollTop) && (index9 = count2);
        return index9;
      }
      function value16(input) {
        input = Math.max(0, Math.min(length - 1, input)), state = {
          index: input,
          step: 0
        }, value4[input].scrollIntoView(), value13(input), value14(input);
      }
      function value17(input, options) {
        for (var value37 = config.slides[input], value38 = value37 && value37.steps[options] ? value37.steps[options].hidden : [], value39 = value12(input), index9 = 0; index9 < value39.length; index9++) {
          var value40 = value39[index9].getAttribute("data-frame-id") || "";
          value38.indexOf(value40) >= 0 ? value39[index9].setAttribute("data-build-hidden", "") : value39[index9].removeAttribute("data-build-hidden");
        }
      }
      function value18() {
        for (var index9 = 0; index9 < items.length; index9++)
          items[index9].cancel();
        items = [];
      }
      function value19(input, options) {
        for (var value37 = config.slides[input], value38 = value37 && value37.steps[options] ? value37.steps[options].events : [], index9 = 0; index9 < value38.length; index9++) {
          var value39 = value38[index9], value40 = value11(input, value39.id), value41 = config.effects[value39.effect];
          if (!(value40 === null || value41 === void 0 || typeof value40.animate != "function")) {
            var value42 = value40.style.transform !== "" && value40.style.transform !== "none" ? value40.style.transform : "", state2 = {
              transform: (value42 + " " + value41.transform).trim() || "none",
              opacity: 0
            }, state3 = {
              transform: value42 === "" ? "none" : value42,
              opacity: 1
            };
            if (value40.removeAttribute("data-build-hidden"), value39.dir === "in")
              items.push(value40.animate([state2, state3], {
                duration: config.buildMs,
                easing: value41.easing,
                fill: "none"
              }));
            else {
              var value43 = value40.animate([state3, state2], {
                duration: config.buildMs,
                easing: config.exitEasing,
                fill: "none"
              });
              (function(input2, options2) {
                options2.finished.then(function() {
                  input2.setAttribute("data-build-hidden", "");
                }, function() {
                });
              })(value40, value43), items.push(value43);
            }
          }
        }
      }
      var text = "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;pointer-events:none;background:transparent", text2 = "position:absolute;inset:0;box-sizing:border-box;align-items:center;justify-content:center;text-align:center;background:rgba(115,114,108,0.12);border:2px dashed rgba(115,114,108,0.4);color:#73726C;font:24px system-ui,sans-serif";
      function value20(input, options) {
        input.iframe.parentNode !== null && input.iframe.parentNode.removeChild(input.iframe), input.host.setAttribute("data-embed-dead", "");
        var value37 = value.createElement("div");
        value37.setAttribute("data-embed-dead-label", ""), value37.setAttribute("style", text2), value37.textContent = options, input.host.appendChild(value37);
      }
      function value21(input) {
        flag2 = !0;
        var value37 = items2;
        items2 = [];
        for (var index9 = 0; index9 < value37.length; index9++)
          value20(value37[index9], input);
      }
      function value22() {
        var value37 = items2;
        items2 = [];
        for (var index9 = 0; index9 < value37.length; index9++) {
          value37[index9].iframe.parentNode !== null && value37[index9].iframe.parentNode.removeChild(value37[index9].iframe);
          var element2 = value37[index9].host.querySelector("[data-embed-under]");
          element2 !== null && element2.removeAttribute("data-embed-under");
        }
      }
      function value23(input) {
        if (!(!config.live || flag2))
          for (var value37 = config.slides[input] ? config.slides[input].embeds : [], index9 = 0; index9 < value37.length; index9++) {
            var value38 = value11(input, value37[index9].id);
            if (!(value38 === null || value38.hasAttribute("data-embed-dead"))) {
              var firstElementChild = value38.firstElementChild;
              firstElementChild !== null && (firstElementChild.setAttribute("data-embed-under", ""), firstElementChild.setAttribute("data-embed-pic", ""));
              var value39 = value.createElement("iframe");
              value39.setAttribute("sandbox", "allow-scripts"), value39.setAttribute("inert", ""), value39.setAttribute("tabindex", "-1"), value39.setAttribute("referrerpolicy", "no-referrer"), value39.setAttribute("title", "嵌入网页内容（沙箱隔离）"), value39.setAttribute("style", text);
              var state2 = {
                iframe: value39,
                host: value38
              };
              (function(input2) {
                var index10 = 0;
                input2.iframe.addEventListener("load", function() {
                  index10 += 1, index10 > 1 && (items2 = items2.filter(function(input3) {
                    return input3 !== input2;
                  }), value20(input2, "Web embed disabled. It navigated away from its content."));
                });
              })(state2), value39.srcdoc = value37[index9].srcdoc, items2.push(state2), value38.appendChild(value39);
            }
          }
      }
      function value24() {
        flag4 = !0;
      }
      window.addEventListener("beforeunload", value24), window.addEventListener("pagehide", value24), window.addEventListener("pageshow", function(input) {
        flag4 = !1, input.persisted && flag && (value22(), value23(state.index));
      }), window.addEventListener("message", function(dataset) {
        if (!flag4) {
          for (var value37 = null, index9 = 0; index9 < items2.length; index9++)
            dataset.source !== null && items2[index9].iframe.contentWindow === dataset.source && (value37 = items2[index9]);
          if (!(value37 === null || dataset.origin !== "null")) {
            var data = dataset.data;
            typeof data != "object" || data === null || (data.type === "appifact-embed:navigating" ? (items2 = items2.filter(function(input) {
              return input !== value37;
            }), value20(value37, "Web embed disabled. It navigated away from its content.")) : data.type === "appifact-embed:ready" && value37.iframe.contentWindow !== null && value37.iframe.contentWindow.postMessage({
              type: "appifact-embed:update",
              t: 0,
              playing: !1,
              selected: !1,
              props: {}
            }, "*"));
          }
        }
      }), window.addEventListener("blur", function() {
        window.setTimeout(function() {
          var activeElement2 = value.activeElement;
          items2.length > 0 && (value.hasFocus() || activeElement2 !== null && activeElement2.tagName === "IFRAME") && (value21("Web embed disabled. It tried to take keyboard focus."), activeElement2 !== null && activeElement2.tagName === "IFRAME" && activeElement2.blur(), window.focus());
        }, 0);
      });
      function value25(input, options) {
        var bounds = input.getBoundingClientRect();
        return {
          x: (bounds.left - options.left) / count,
          y: (bounds.top - options.top) / count,
          w: bounds.width / count,
          h: bounds.height / count
        };
      }
      function value26(input) {
        return {
          left: String(input.x) + "px",
          top: String(input.y) + "px",
          right: "自动",
          bottom: "自动",
          width: String(input.w) + "px",
          height: String(input.h) + "px",
          transform: "none"
        };
      }
      function value27(input, options) {
        return Math.abs(input.x - options.x) < 0.5 && Math.abs(input.y - options.y) < 0.5 && Math.abs(input.w - options.w) < 0.5 && Math.abs(input.h - options.h) < 0.5;
      }
      function value28(input) {
        return (config.slides[input] ? config.slides[input].embeds : []).map(function(input2) {
          return input2.id;
        });
      }
      function value29(input, options, context, value37) {
        var value38 = value4[context.index], value39 = value5[context.index], value40 = value5[value37.index], value41 = config.transMs[input] || 0, state2 = {
          duration: value41,
          easing: config.transEase,
          fill: "forwards"
        }, items3 = [], value42 = null, items4 = [], background = value39.style.background;
        value38.removeAttribute("data-off"), value38.setAttribute("data-leaving", "");
        for (var value43 = config.slides[context.index].steps[context.step] ? config.slides[context.index].steps[context.step].hidden : [], value44 = config.slides[value37.index].steps[value37.step] ? config.slides[value37.index].steps[value37.step].hidden : [], value45 = value28(context.index), value46 = value12(context.index), index9 = 0; index9 < value46.length; index9++) {
          var value47 = value46[index9].getAttribute("data-frame-id") || "";
          value45.indexOf(value47) >= 0 && (value46[index9].setAttribute("data-magic-hidden", ""), items4.push(value46[index9]));
        }
        var value48 = typeof value38.animate == "function";
        if (value48 && input === "fade")
          items3.push(value38.animate([
            {
              opacity: 1
            },
            {
              opacity: 0
            }
          ], state2));
        else if (value48 && input === "push") {
          var value49 = options ? -config.w : config.w;
          items3.push(value39.animate([
            {
              transform: "translateX(0px)"
            },
            {
              transform: "translateX(" + String(-value49) + "px)"
            }
          ], state2)), items3.push(value40.animate([
            {
              transform: "translateX(" + String(value49) + "px)"
            },
            {
              transform: "translateX(0px)"
            }
          ], state2));
        } else if (value48) {
          value39.style.background = "transparent", config.slides[context.index].bg !== config.slides[value37.index].bg && (value42 = value.createElement("div"), value42.setAttribute("style", "position:absolute;inset:0;background:" + config.slides[context.index].bg), value40.insertBefore(value42, value40.firstChild), items3.push(value42.animate([
            {
              opacity: 1
            },
            {
              opacity: 0
            }
          ], state2)));
          for (var bounds = value39.getBoundingClientRect(), bounds2 = value40.getBoundingClientRect(), items5 = [], index10 = 0; index10 < value46.length; index10++) {
            var value50 = value46[index10], value51 = value50.getAttribute("data-frame-id") || "";
            if (!(value43.indexOf(value51) >= 0)) {
              var value52 = value44.indexOf(value51) >= 0 ? null : value11(value37.index, value51);
              if (value52 === null) {
                value45.indexOf(value51) < 0 && items3.push(value50.animate([
                  {
                    opacity: 1
                  },
                  {
                    opacity: 0
                  }
                ], state2));
                continue;
              }
              items5.push(value51), value50.setAttribute("data-magic-hidden", ""), items4.push(value50);
              var value53 = value25(value50, bounds), value54 = value25(value52, bounds2);
              value27(value53, value54) || items3.push(value52.animate([value26(value53), value26(value54)], state2));
            }
          }
          for (var value55 = value12(value37.index), index11 = 0; index11 < value55.length; index11++) {
            var value56 = value55[index11].getAttribute("data-frame-id") || "";
            items5.indexOf(value56) >= 0 || value44.indexOf(value56) >= 0 || items3.push(value55[index11].animate([
              {
                opacity: 0
              },
              {
                opacity: 1
              }
            ], state2));
          }
        }
        var flag6 = !1;
        function value57() {
          if (!flag6) {
            flag6 = !0, clearTimeout(value58), value7 = null, value38.setAttribute("data-off", ""), value38.removeAttribute("data-leaving");
            for (var index12 = 0; index12 < items3.length; index12++)
              items3[index12].cancel();
            value42 !== null && value42.parentNode !== null && value42.parentNode.removeChild(value42), value39.style.background = background;
            for (var index13 = 0; index13 < items4.length; index13++)
              items4[index13].removeAttribute("data-magic-hidden");
          }
        }
        var value58 = window.setTimeout(value57, value41 + 250);
        Promise.all(items3.map(function(input2) {
          return input2.finished.then(function() {
            return null;
          }, function() {
            return null;
          });
        })).then(value57), value7 = {
          cleanup: value57
        };
      }
      function value30(input, source) {
        var value37 = state;
        if (state = input, value18(), clearTimeout(index4), input.index !== value37.index) {
          value22();
          for (var index9 = 0; index9 < length; index9++)
            index9 === input.index ? (value4[index9].removeAttribute("data-off"), value4[index9].removeAttribute("aria-hidden"), value4[index9].removeAttribute("inert")) : (value4[index9].setAttribute("data-off", ""), value4[index9].setAttribute("aria-hidden", "true"), value4[index9].setAttribute("inert", ""));
          value37.index >= 0 && value37.index < length && value17(value37.index, value37.step), value17(input.index, input.step), source.kind !== void 0 && source.from !== void 0 && value29(source.kind, source.back === !0, source.from, input), value23(input.index), value37.index >= 0 && value13(input.index), value14(input.index);
        } else
          value17(input.index, input.step), input.step === value37.step + 1 && !value9() && value19(input.index, input.step);
        var value38 = input.index === value37.index && input.step < value37.step, value39 = input.step + 1, value40 = config.slides[input.index];
        if (!value38 && value40 !== void 0 && value39 <= value10(input.index) && value40.steps[value39].auto) {
          var value41 = input.index === value37.index ? config.buildMs + 140 : 600, value42 = input;
          index4 = window.setTimeout(function() {
            flag && state.index === value42.index && state.step === value42.step && value30({
              index: value42.index,
              step: value39
            }, {});
          }, value41);
        }
      }
      function value31(input) {
        if (!flag) {
          value16(value15() + (input > 0 ? 1 : -1));
          return;
        }
        value7 !== null && value7.cleanup();
        var value37 = state;
        if (input > 0) {
          if (value37.step < value10(value37.index)) {
            value30({
              index: value37.index,
              step: value37.step + 1
            }, {});
            return;
          }
          if (value37.index >= length - 1)
            return;
          var value38 = config.slides[value37.index] ? config.slides[value37.index].transition : void 0;
          value30({
            index: value37.index + 1,
            step: 0
          }, value38 !== void 0 && !value9() ? {
            kind: value38,
            back: !1,
            from: value37
          } : {});
        } else {
          if (value37.step > 0) {
            value30({
              index: value37.index,
              step: value37.step - 1
            }, {});
            return;
          }
          if (value37.index <= 0)
            return;
          var value39 = config.slides[value37.index - 1] ? config.slides[value37.index - 1].transition : void 0;
          value30({
            index: value37.index - 1,
            step: value10(value37.index - 1)
          }, value39 !== void 0 && !value9() ? {
            kind: value39,
            back: !0,
            from: value37
          } : {});
        }
      }
      function value32(input) {
        if (input = Math.max(0, Math.min(length - 1, input)), !flag) {
          value16(input);
          return;
        }
        if (value7 !== null && value7.cleanup(), state.index === input && state.step === 0) {
          value14(input);
          return;
        }
        value30({
          index: input,
          step: 0
        }, {});
      }
      function value33(input) {
        if (input !== flag)
          if (flag = input, input) {
            var value37 = flag3 || state.index < 0 ? value15() : state.index;
            documentElement.classList.add("deck-stage"), documentElement.scrollTop = 0, state = {
              index: -1,
              step: 0
            }, value30({
              index: value37,
              step: 0
            }, {});
          } else {
            value7 !== null && value7.cleanup(), value18(), clearTimeout(index4), value22();
            for (var index9 = 0; index9 < length; index9++) {
              value4[index9].removeAttribute("data-off"), value4[index9].removeAttribute("aria-hidden");
              for (var value38 = value12(index9), index10 = 0; index10 < value38.length; index10++)
                value38[index10].removeAttribute("data-build-hidden");
            }
            for (var index11 = 0; index11 < length; index11++)
              value4[index11].removeAttribute("inert");
            documentElement.classList.remove("deck-stage"), value4[Math.max(0, state.index)].scrollIntoView(), value8 = documentElement.scrollTop, flag3 = !1;
          }
      }
      function value34() {
        value2(), value33(value6 === null || !value6.matches);
      }
      window.addEventListener("resize", value34), window.addEventListener("beforeprint", function() {
        value22();
      }), window.addEventListener("afterprint", function() {
        flag && value23(state.index);
      }), window.addEventListener("scroll", function() {
        if (!flag) {
          var value37 = value15();
          Math.abs(documentElement.scrollTop - value8) > 2 && (flag3 = !0), value14(value37), clearTimeout(index32), index32 = window.setTimeout(function() {
            value13(value37);
          }, 150);
        }
      }, {
        passive: !0
      });
      var index42 = 0, index5 = 0, flag5 = !1;
      window.addEventListener("wheel", function(event) {
        event.ctrlKey || !flag || Math.abs(event.deltaX) > Math.abs(event.deltaY) || (event.preventDefault(), clearTimeout(index5), index5 = window.setTimeout(function() {
          flag5 = !1, index42 = 0;
        }, 250), !flag5 && (index42 += event.deltaMode ? event.deltaY > 0 ? 60 : event.deltaY < 0 ? -60 : 0 : event.deltaY, Math.abs(index42) >= 60 && (flag5 = !0, value31(index42 > 0 ? 1 : -1), index42 = 0)));
      }, {
        passive: !1
      }), value.addEventListener("click", function(event) {
        var target = event.target, value37 = value.getSelection();
        event.button !== 0 || !flag || target === null || target.closest("a,[data-text-path],[data-cell]") !== null || value37 !== null && String(value37) !== "" || value31(event.clientX < documentElement.clientWidth / 2 ? -1 : 1);
      });
      var index6 = 0, index7 = 0, index8 = 0;
      value.addEventListener("touchstart", function(input) {
        if (input.touches.length !== 1) {
          index8 = 0;
          return;
        }
        index6 = input.touches[0].clientX, index7 = input.touches[0].clientY, index8 = Date.now();
      }, {
        passive: !0
      }), value.addEventListener("touchcancel", function() {
        index8 = 0;
      }), value.addEventListener("touchend", function(input) {
        if (!(!flag || input.changedTouches.length !== 1)) {
          var value37 = input.changedTouches[0].clientX - index6, value38 = input.changedTouches[0].clientY - index7;
          Date.now() - index8 > 700 || Math.abs(value37) < 40 || Math.abs(value37) < Math.abs(value38) * 1.2 || value31(value37 < 0 ? 1 : -1);
        }
      }, {
        passive: !0
      }), window.addEventListener("keydown", function(event) {
        if (!(event.metaKey || event.ctrlKey || event.altKey)) {
          var key = event.key;
          key === " " && event.shiftKey || key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp" ? (event.preventDefault(), value31(-1)) : key === "ArrowRight" || key === "ArrowDown" || key === "PageDown" || key === " " ? (event.preventDefault(), value31(1)) : key === "Home" ? (event.preventDefault(), value32(0)) : key === "End" ? (event.preventDefault(), value32(length - 1)) : /^[1-9]$/.test(key) && Number(key) <= length ? value32(Number(key) - 1) : (key === "f" || key === "F") && (value.fullscreenElement ? value.exitFullscreen() : documentElement.requestFullscreen && documentElement.requestFullscreen());
        }
      }), window.addEventListener("hashchange", function() {
        var value37 = /^#(\d+)$/.exec(window.location.hash);
        value37 !== null && Number(value37[1]) - 1 !== state.index && value32(Number(value37[1]) - 1);
      });
      var value35 = /^#(\d+)$/.exec(window.location.hash), value36 = value35 !== null ? Math.max(0, Math.min(length - 1, Number(value35[1]) - 1)) : 0;
      value34(), flag ? value36 !== state.index ? value32(value36) : value14(value36) : value35 !== null ? value16(value36) : value14(value15());
    }
    value.readyState === "loading" ? value.addEventListener("DOMContentLoaded", value3) : value3();
  }
  function deckPageRuntimeSource() {
    return deckPageRuntime.toString();
  }
  return bindRuntimeValue(runtime2, "deckPageRuntime", () => deckPageRuntime), bindRuntimeValue(runtime2, "deckPageRuntimeSource", () => deckPageRuntimeSource), () => {
  };
}
export {
  installExportPageRuntime
};
