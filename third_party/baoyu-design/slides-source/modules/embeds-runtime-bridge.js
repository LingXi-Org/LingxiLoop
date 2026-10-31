// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEmbedsRuntimeBridge(runtime2) {
  var defaultEmbedRuntimeScript, interactiveEmbedRuntimeScript, initializeEmbedRuntimeScript;
  function embedRuntimeBridge(interactive, saved, keepsSaves) {
    var count = 1, parent = window.parent, items = [], items2 = [], items3 = [], value = null, value2 = null, state = {
      t: 0,
      playing: !1,
      selected: !1,
      props: {}
    }, value3 = null;
    try {
      typeof saved == "string" && (value3 = JSON.parse(saved));
    } catch {
      value3 = null;
    }
    var items4 = [], index4 = 0;
    function value4(input, options) {
      try {
        parent.postMessage(input, "*", options ?? []);
      } catch {
      }
    }
    if (interactive === !0) {
      var value5 = new MessageChannel(), value6 = value5.port1.postMessage.bind(value5.port1);
      value4({
        type: "appifact-embed:port"
      }, [value5.port2]);
      var value7 = window, __appifactShadowRootOf = value7.__appifactShadowRootOf;
      delete value7.__appifactShadowRootOf;
      var value8 = window.setTimeout.bind(window), apply = Reflect.apply, callback = function(input, options) {
        var value26 = Object.getOwnPropertyDescriptor(input, options);
        return value26 && value26.get ? value26.get : function() {
          return this[options];
        };
      }, value9 = callback(KeyboardEvent.prototype, "key"), value10 = callback(KeyboardEvent.prototype, "repeat"), value11 = callback(KeyboardEvent.prototype, "isComposing"), value12 = callback(Event.prototype, "defaultPrevented"), value13 = callback(MouseEvent.prototype, "ctrlKey"), value14 = callback(MouseEvent.prototype, "metaKey"), value15 = callback(MouseEvent.prototype, "clientX"), value16 = callback(MouseEvent.prototype, "clientY"), value17 = callback(WheelEvent.prototype, "deltaX"), value18 = callback(WheelEvent.prototype, "deltaY"), value19 = callback(WheelEvent.prototype, "deltaMode"), value20 = callback(Element.prototype, "shadowRoot"), value21 = callback(typeof ShadowRoot > "u" ? {} : ShadowRoot.prototype, "activeElement"), callback2 = function() {
        for (var activeElement2 = document.activeElement, value26 = activeElement2 && (apply(value20, activeElement2, []) || __appifactShadowRootOf && __appifactShadowRootOf(activeElement2)); value26 && apply(value21, value26, []); )
          activeElement2 = apply(value21, value26, []), value26 = apply(value20, activeElement2, []) || __appifactShadowRootOf && __appifactShadowRootOf(activeElement2);
        if (!activeElement2)
          return !1;
        if (document.designMode === "on" || /^(textbox|searchbox|combobox|spinbutton)$/.test(activeElement2.getAttribute("role") || "") || activeElement2.tagName === "TEXTAREA" || activeElement2.tagName === "SELECT")
          return !0;
        if (activeElement2.tagName === "INPUT") {
          var type = activeElement2.type;
          return !/^(button|checkbox|radio|range|submit|reset|color|file|image)$/.test(type);
        }
        return activeElement2.isContentEditable === !0;
      }, callback3 = function(input) {
        for (var value26 = apply(value17, input, []), value27 = apply(value18, input, []), value28 = Math.abs(value27) >= Math.abs(value26), value29 = input.composedPath ? input.composedPath() : [], index42 = 0; index42 < value29.length; index42++) {
          var value30 = value29[index42];
          if (!(!value30 || value30.nodeType !== 1)) {
            var value31 = getComputedStyle(value30), value32 = value28 ? value31.overflowY : value31.overflowX;
            if (!(value32 !== "auto" && value32 !== "scroll")) {
              var value33 = value28 ? value27 : value26, value34 = value28 ? value30.scrollTop : value30.scrollLeft, value35 = value28 ? value30.scrollHeight - value30.clientHeight : value30.scrollWidth - value30.clientWidth;
              if (value33 > 0 ? value34 < value35 - 1 : value34 > 1)
                return !0;
            }
          }
        }
        return !1;
      }, callback4 = function(input, options) {
        var value26 = apply(value19, input, []), value27 = value26 === 1 ? 16 : value26 === 2 ? window.innerHeight : 1;
        value6({
          kind: "wheel",
          dx: apply(value17, input, []) * value27,
          dy: apply(value18, input, []) * value27,
          pinch: options,
          x: Number(apply(value15, input, [])) || 0,
          y: Number(apply(value16, input, [])) || 0
        });
      }, callback5 = function(input) {
        value8(function() {
          apply(value12, input, []) === !0 && value6({
            kind: "press",
            cancelled: !0
          });
        }, 0);
      };
      window.addEventListener("pointerdown", function(input) {
        input.isTrusted && (value6({
          kind: "press"
        }), callback5(input));
      }, !0), window.addEventListener("mousedown", function(input) {
        input.isTrusted && callback5(input);
      }, !0), window.addEventListener("keydown", function(input) {
        if (!(!input.isTrusted || apply(value10, input, []) === !0 || apply(value11, input, []) === !0)) {
          var value26 = apply(value9, input, []);
          value26 === "Escape" ? value6({
            kind: "key",
            key: "Escape"
          }) : (value26 === "Delete" || value26 === "Backspace") && !callback2() && value8(function() {
            apply(value12, input, []) !== !0 && value6({
              kind: "key",
              key: "Delete"
            });
          }, 0);
        }
      }, !0);
      var value22 = callback(Event.prototype, "timeStamp"), index22 = 0, value23 = -1 / 0, flag = !1, index32 = 0;
      window.addEventListener("wheel", function(event) {
        if (event.isTrusted) {
          var value26 = apply(value22, event, []);
          if (value26 - value23 > 200 && (index22 = 0), value23 = value26, apply(value13, event, []) === !0 || apply(value14, event, []) === !0) {
            index22 = 0, flag = !1, event.preventDefault(), event.stopPropagation(), callback4(event, !0);
            return;
          }
          var value27 = index22 === 0;
          if (value27) {
            if (apply(value17, event, []) === 0 && apply(value18, event, []) === 0)
              return;
            index22 = callback3(event) ? 1 : 2, index32 += 1, flag = index22 === 2;
          }
          if (index22 === 2) {
            if (!value27 && !flag && callback3(event)) {
              event.preventDefault(), callback4(event, !1);
              return;
            }
            var value28 = index32;
            value8(function() {
              var value29 = apply(value12, event, []) === !0;
              value27 && value28 === index32 && (flag = !1, value29 && (index22 = 1)), value29 || callback4(event, !1);
            }, 0);
          }
        }
      }, {
        capture: !0,
        passive: !1
      });
      var callback6 = function(event) {
        for (var value26 = event.composedPath ? event.composedPath() : [], index42 = 0; index42 < value26.length; index42++) {
          var value27 = value26[index42], value28 = value27 && value27.nodeType === 1 ? value27.localName : "";
          if (!(value28 !== "a" && value28 !== "area" || !(value27.hasAttribute("href") || value27.hasAttribute("xlink:href")))) {
            event.preventDefault();
            var value29 = value27.getAttribute("href") || "", value30 = value29.charAt(0) === "#" && value29.length > 1 ? document.getElementById(value29.slice(1)) : null;
            value30 && value30.scrollIntoView();
            return;
          }
        }
      };
      window.addEventListener("click", callback6, !0), window.addEventListener("auxclick", callback6, !0);
    }
    var callback7 = function() {
      value4({
        type: "appifact-embed:navigating"
      });
    };
    window.addEventListener("beforeunload", callback7, !0), window.addEventListener("pagehide", function(input) {
      input && input.persisted === !0 || callback7();
    }, !0);
    function value24(input, options) {
      return new Promise(function(input2, options2) {
        for (var value26 = document.documentElement.cloneNode(!0), value27 = value26.querySelectorAll("script"), index42 = 0; index42 < value27.length; index42++) {
          var value28 = value27[index42];
          value28 && value28.parentNode && value28.parentNode.removeChild(value28);
        }
        for (var value29 = document.querySelectorAll("canvas"), value30 = value26.querySelectorAll("canvas"), items5 = [
          "position",
          "top",
          "right",
          "bottom",
          "left",
          "display",
          "margin",
          "transform",
          "transformOrigin",
          "zIndex",
          "opacity",
          "borderRadius",
          "boxSizing",
          "verticalAlign"
        ], index5 = 0; index5 < value30.length; index5++) {
          var value31 = value29[index5], value32 = value30[index5];
          if (!(!value31 || !value32 || !value32.parentNode) && !(value31.width === 0 || value31.height === 0))
            try {
              var value33 = document.createElement("img");
              value33.src = value31.toDataURL("image/png"), value33.className = value32.className, value32.id && (value33.id = value32.id);
              var attribute = value32.getAttribute("style");
              attribute && value33.setAttribute("style", attribute);
              for (var value34 = getComputedStyle(value31), index6 = 0; index6 < items5.length; index6++) {
                var value35 = items5[index6];
                value33.style[value35] = value34.getPropertyValue(value35.replace(/[A-Z]/g, function(input3) {
                  return "-" + input3.toLowerCase();
                }));
              }
              value33.style.width = value31.offsetWidth + "px", value33.style.height = value31.offsetHeight + "px", value32.parentNode.replaceChild(value33, value32);
            } catch {
            }
        }
        var value36 = Math.max(1, document.documentElement.clientWidth || input), value37 = Math.max(1, document.documentElement.clientHeight || options);
        value26.style.width = value36 + "px", value26.style.height = value37 + "px";
        var element = value26.querySelector("body");
        element instanceof HTMLElement && (element.style.width = value36 + "px", element.style.height = value37 + "px");
        var value38 = new XMLSerializer().serializeToString(value26), value39 = '<svg xmlns="http://www.w3.org/2000/svg" width="' + value36 + '" height="' + value37 + '"><foreignObject width="100%" height="100%">' + value38 + "</foreignObject></svg>", value40 = new Image();
        value40.onload = function() {
          var value41 = document.createElement("canvas");
          value41.width = input, value41.height = options;
          var value42 = value41.getContext("2d");
          if (value42 === null) {
            options2(Error("no 2d context"));
            return;
          }
          value42.drawImage(value40, 0, 0, input, options), input2(value41);
        }, value40.onerror = function() {
          options2(Error("snapshot decode failed"));
        }, value40.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(value39);
      });
    }
    function value25(input, options, context, value26, extra) {
      var callback9 = function(input2) {
        try {
          var value32 = input2.getContext("2d");
          if (value32 === null)
            throw Error("no 2d context");
          var value33 = value32.getImageData(0, 0, value26, extra), buffer = value33.data.buffer;
          value4({
            type: "appifact-embed:frame",
            seq: input,
            width: value26,
            height: extra,
            pixels: buffer
          }, [buffer]);
        } catch (value34) {
          callback10(String(value34).slice(0, 200));
        }
      }, callback10 = function(input2) {
        value4({
          type: "appifact-embed:frame-error",
          seq: input,
          reason: input2
        });
      };
      try {
        for (var state2 = {
          t: options,
          playing: !1,
          selected: state.selected,
          props: context,
          exporting: !0,
          pixelWidth: value26,
          pixelHeight: extra
        }, index42 = 0; index42 < items.length; index42++)
          try {
            var value27 = items[index42];
            value27 && value27(state2);
          } catch {
          }
        if (value !== null) {
          var value28 = document.createElement("canvas");
          value28.width = value26, value28.height = extra;
          var value29 = value28.getContext("2d");
          if (value29 === null) {
            callback10("no 2d context");
            return;
          }
          value({
            ctx: value29,
            t: options,
            props: context,
            width: value26,
            height: extra
          }), callback9(value28);
        } else if (value2 !== null) {
          var value30 = document.createElement("canvas");
          value30.width = value26, value30.height = extra;
          var value31 = value30.getContext("2d");
          if (value31 === null) {
            callback10("no 2d context");
            return;
          }
          value31.drawImage(value2, 0, 0, value26, extra), callback9(value30);
        } else
          value24(value26, extra).then(callback9, function(input2) {
            callback10(String(input2).slice(0, 200));
          });
      } catch (value32) {
        callback10(String(value32).slice(0, 200));
      }
    }
    window.addEventListener("message", function(dataset) {
      if (dataset.source === parent) {
        var data = dataset.data;
        if (!(typeof data != "object" || data === null)) {
          if (data.type === "appifact-embed:update") {
            var selected = state.selected, state2 = {
              t: typeof data.t == "number" ? data.t : 0,
              playing: data.playing === !0,
              selected: data.selected === !0,
              props: typeof data.props == "object" && data.props !== null ? data.props : {}
            };
            state = state2;
            for (var index42 = 0; index42 < items.length; index42++)
              try {
                var value26 = items[index42];
                value26 && value26(state2);
              } catch {
              }
            if (state2.selected !== selected)
              for (var index5 = 0; index5 < items3.length; index5++)
                try {
                  var value27 = items3[index5];
                  value27 && value27(state2.selected);
                } catch {
                }
          } else if (data.type === "appifact-embed:selected") {
            var value28 = data.selected === !0;
            state.selected = value28;
            for (var index6 = 0; index6 < items3.length; index6++)
              try {
                var value29 = items3[index6];
                value29 && value29(value28);
              } catch {
              }
          } else if (data.type === "appifact-embed:gesture") {
            var gesture = data.gesture;
            if (typeof gesture != "object" || gesture === null)
              return;
            for (var state3 = {
              kind: typeof gesture.kind == "string" ? gesture.kind : "",
              x: typeof gesture.x == "number" ? gesture.x : 0,
              y: typeof gesture.y == "number" ? gesture.y : 0,
              id: typeof gesture.id == "number" ? gesture.id : 0
            }, index7 = 0; index7 < items2.length; index7++)
              try {
                var value30 = items2[index7];
                value30 && value30(state3);
              } catch {
              }
          } else if (data.type === "appifact-embed:state") {
            if (typeof data.state != "string")
              return;
            index4 += 1;
            try {
              value3 = JSON.parse(data.state);
            } catch {
              return;
            }
            for (var index8 = 0; index8 < items4.length; index8++)
              try {
                var value31 = items4[index8];
                value31 && value31(value3);
              } catch {
              }
          } else if (data.type === "appifact-embed:render") {
            var value32 = typeof data.seq == "number" ? data.seq : -1, value33 = typeof data.width == "number" ? Math.floor(data.width) : 0, value34 = typeof data.height == "number" ? Math.floor(data.height) : 0;
            if (value32 < 0 || value33 < 1 || value34 < 1 || value33 > 8192 || value34 > 8192)
              return;
            value25(value32, typeof data.t == "number" ? data.t : 0, typeof data.props == "object" && data.props !== null ? data.props : {}, value33, value34);
          }
        }
      }
    }), window.appifactEmbed = {
      version: count,
      onUpdate: function(input) {
        items.push(input);
        try {
          input(state);
        } catch {
        }
      },
      onGesture: function(input) {
        items2.push(input);
      },
      onSelect: function(input) {
        items3.push(input);
      },
      onRender: function(input) {
        value = input;
      },
      registerCanvas: function(input) {
        value2 = input;
      },
      props: function() {
        return state.props;
      },
      time: function() {
        return state.t;
      },
      load: function() {
        return value3;
      },
      save: function(input) {
        var value26;
        if (keepsSaves !== !0)
          return !1;
        try {
          if (value26 = JSON.stringify(input), typeof value26 != "string" || value26.length > 16384)
            return !1;
          value3 = JSON.parse(value26);
        } catch {
          return !1;
        }
        return value4({
          type: "appifact-embed:save",
          state: value26,
          applied: index4
        }), !0;
      },
      onLoad: function(input) {
        items4.push(input);
      }
    };
    var callback8 = function() {
      value4({
        type: "appifact-embed:ready",
        version: count
      });
    };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", callback8) : callback8();
  }
  function embedRuntimeBootstrapScript(interactive, saved, keepsSaves) {
    let value = saved === void 0 ? "undefined" : JSON.stringify(saved).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    return "(" + embedRuntimeBridge.toString() + ")(" + String(interactive) + "," + value + "," + String(keepsSaves) + ");";
  }
  return bindRuntimeValue(runtime2, "embedRuntimeBridge", () => embedRuntimeBridge), bindRuntimeValue(runtime2, "embedRuntimeBootstrapScript", () => embedRuntimeBootstrapScript), bindRuntimeValue(runtime2, "defaultEmbedRuntimeScript", () => defaultEmbedRuntimeScript, (value) => {
    defaultEmbedRuntimeScript = value;
  }), bindRuntimeValue(runtime2, "interactiveEmbedRuntimeScript", () => interactiveEmbedRuntimeScript, (value) => {
    interactiveEmbedRuntimeScript = value;
  }), bindRuntimeValue(runtime2, "initializeEmbedRuntimeScript", () => initializeEmbedRuntimeScript, (value) => {
    initializeEmbedRuntimeScript = value;
  }), () => {
    initializeEmbedRuntimeScript = (0, runtime2.initializeOnce)(() => {
      defaultEmbedRuntimeScript = "(" + embedRuntimeBridge.toString() + ")();", interactiveEmbedRuntimeScript = "(" + embedRuntimeBridge.toString() + ")(true);";
    });
  };
}
export {
  installEmbedsRuntimeBridge
};
