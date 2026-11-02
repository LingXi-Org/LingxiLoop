// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportRenderedSemantics(runtime2) {
  function inspectRenderedSemantics(styleOf, root, width, height2, options) {
    let state = {
      SCRIPT: 1,
      STYLE: 1,
      NOSCRIPT: 1,
      TEMPLATE: 1,
      IFRAME: 1,
      HEAD: 1
    }, count = 4e3, count2 = 64, count3 = 500, count4 = 2048, count5 = 2, text = "http://www.w3.org/1999/xlink", value = options && options.skipAttrs || [], bounds = root.getBoundingClientRect(), value2 = root.offsetWidth || 0, value3 = root.offsetHeight || 0, value4 = value2 > 0 && bounds.width > 0 ? bounds.width / value2 : 1, value5 = width || value2 || bounds.width / value4, value6 = height2 || value3 || bounds.height / value4, value7 = bounds.top - (options && options.dy || 0) * value4, items = [], flag = !1, callback = (input) => {
      if (input.parentElement)
        return input.parentElement;
      let parentNode = input.parentNode;
      return parentNode !== null && parentNode.nodeType === 11 && parentNode.host || null;
    }, callback2 = (input) => {
      if (state[input.tagName.toUpperCase()] === 1)
        return !0;
      for (let index4 = 0; index4 < value.length; index4++)
        if (input.hasAttribute(value[index4]))
          return !0;
      return !1;
    }, entries = /* @__PURE__ */ new Map(), callback3 = (input) => {
      let entry = entries.get(input);
      if (entry !== void 0)
        return entry;
      let value8 = input === root ? null : callback(input), value9 = parseFloat(styleOf(input).opacity) <= 0 || value8 !== null && callback3(value8);
      return entries.set(input, value9), value9;
    }, entries2 = /* @__PURE__ */ new Map(), callback4 = (input) => {
      let entry = entries2.get(input);
      if (entry !== void 0)
        return entry;
      let style = input.style, value8 = style ? style.visibility : "", value9 = input === root ? null : callback(input), value10 = value8 === "hidden" || value8 === "collapse" || value8 !== "visible" && value9 !== null && callback4(value9);
      return entries2.set(input, value10), value10;
    }, callback5 = (input) => {
      let display = styleOf(input).display;
      return display === "contents" || typeof input.checkVisibility != "function" ? display === "none" : !input.checkVisibility();
    }, callback6 = (input) => options && options.inlineVisibility ? callback4(input) : /^(hidden|collapse)$/.test(styleOf(input).visibility), callback7 = (input) => {
      let position = styleOf(input).position, value8 = callback(input);
      if (position !== "absolute" && position !== "fixed")
        return value8;
      let callback12 = (input2) => input2 === void 0 || input2 === "" || input2 === "none" || input2 === "normal" || input2 === "auto";
      for (; value8 !== null && value8 !== root; ) {
        let value9 = styleOf(value8);
        if (position === "absolute" && value9.position !== "static" || !callback12(value9.transform) || !callback12(value9.translate) || !callback12(value9.rotate) || !callback12(value9.scale) || !callback12(value9.perspective) || !callback12(value9.filter) || !callback12(value9.backdropFilter) || !callback12(value9.contain) || /transform|perspective|filter|translate|rotate|scale|contain/.test(value9.willChange || ""))
          return value8;
        value8 = callback(value8);
      }
      return position === "fixed" ? null : value8;
    }, entries3 = /* @__PURE__ */ new Map(), callback8 = (input) => {
      if (input === root)
        return null;
      if (entries3.has(input))
        return entries3.get(input);
      let value8 = callback7(input), value9 = value8 !== null ? callback8(value8) : null;
      if (value8 !== null && value8 !== root) {
        let value10 = styleOf(value8), value11 = /^(hidden|clip|scroll|auto)$/.test(value10.overflowX), value12 = /^(hidden|clip|scroll|auto)$/.test(value10.overflowY);
        if (value11 || value12) {
          let bounds2 = value8.getBoundingClientRect(), state2 = {
            l: value11 ? bounds2.left + (parseFloat(value10.borderLeftWidth) || 0) : -1 / 0,
            t: value12 ? bounds2.top + (parseFloat(value10.borderTopWidth) || 0) : -1 / 0,
            r: value11 ? bounds2.right - (parseFloat(value10.borderRightWidth) || 0) : 1 / 0,
            b: value12 ? bounds2.bottom - (parseFloat(value10.borderBottomWidth) || 0) : 1 / 0
          };
          value9 = value9 === null ? state2 : {
            l: Math.max(value9.l, state2.l),
            t: Math.max(value9.t, state2.t),
            r: Math.min(value9.r, state2.r),
            b: Math.min(value9.b, state2.b)
          };
        }
      }
      return entries3.set(input, value9), value9;
    }, callback9 = (input) => {
      if (input.shadowRoot)
        return input.shadowRoot.childNodes;
      if (input.tagName.toUpperCase() === "SLOT") {
        let value8 = input.assignedNodes({
          flatten: !0
        });
        if (value8.length)
          return value8;
      }
      return input.childNodes;
    }, callback10 = (input, options2) => {
      let items2 = [], index4 = 0, callback12 = (input2) => {
        if (++index4 > 500 || callback3(input2) || callback5(input2))
          return;
        let value9 = callback8(input2), value10 = callback6(input2) ? [] : input2.getClientRects();
        for (let index22 = 0; index22 < value10.length; index22++) {
          let value12 = value10[index22], left = value12.left, top = value12.top, right = value12.right, bottom = value12.bottom;
          value9 !== null && (left = Math.max(left, value9.l), top = Math.max(top, value9.t), right = Math.min(right, value9.r), bottom = Math.min(bottom, value9.b));
          let state2 = {
            l: Math.max(0, (left - bounds.left) / value4),
            t: Math.max(0, (top - value7) / value4),
            r: Math.min(value5, (right - bounds.left) / value4),
            b: Math.min(value6, (bottom - value7) / value4)
          };
          state2.r - state2.l >= 2 && state2.b - state2.t >= 2 && items2.push(state2);
        }
        let value11 = callback9(input2);
        for (let index22 = 0; index22 < value11.length; index22++) {
          let value12 = value11[index22];
          value12 && value12.nodeType === 1 && !callback2(value12) && callback12(value12);
        }
      };
      callback12(input), items2.sort((input2, options3) => (options3.r - options3.l) * (options3.b - options3.t) - (input2.r - input2.l) * (input2.b - input2.t));
      let items3 = [];
      for (let value9 of items2) {
        if (items3.length >= 64)
          break;
        let flag2 = !1;
        for (let value10 of items3)
          if (value9.l >= value10.l - 0.5 && value9.t >= value10.t - 0.5 && value9.r <= value10.r + 0.5 && value9.b <= value10.b + 0.5) {
            flag2 = !0;
            break;
          }
        flag2 || items3.push(value9);
      }
      items3.sort((input2, options3) => input2.t - options3.t || input2.l - options3.l);
      let items4 = [];
      for (let value9 of items3) {
        let value10 = items4[items4.length - 1];
        value10 && Math.abs(value10.t - value9.t) < 1 && Math.abs(value10.b - value9.b) < 1 && value9.l <= value10.r + 1 && value9.r >= value10.l - 1 ? (value10.l = Math.min(value10.l, value9.l), value10.t = Math.min(value10.t, value9.t), value10.r = Math.max(value10.r, value9.r), value10.b = Math.max(value10.b, value9.b)) : items4.push(value9);
      }
      let value8 = items4.length > 0 && items.length < 4e3 && options && options.anchorId ? options.anchorId(input) : void 0;
      for (let value9 of items4) {
        if (items.length >= 4e3) {
          flag = !0;
          return;
        }
        items.push(value8 === void 0 ? {
          u: options2,
          x: value9.l,
          y: value9.t,
          w: value9.r - value9.l,
          h: value9.b - value9.t
        } : {
          u: options2,
          x: value9.l,
          y: value9.t,
          w: value9.r - value9.l,
          h: value9.b - value9.t,
          a: value8
        });
      }
    }, callback11 = (element) => {
      if (flag || callback2(element) || element !== root && callback5(element))
        return;
      if (element.localName.toLowerCase() === "a") {
        let value9 = options && options.hrefOf ? options.hrefOf(element) : element.getAttribute("href") || element.getAttributeNS("http://www.w3.org/1999/xlink", "href"), value10 = typeof value9 == "string" ? value9.trim() : "";
        if (value10 !== "" && value10.length <= 2048 && /^(?:https?:\/\/|mailto:)/i.test(value10)) {
          callback10(element, value10);
          return;
        }
      }
      let value8 = callback9(element);
      for (let index4 = 0; index4 < value8.length; index4++) {
        let value9 = value8[index4];
        value9 && value9.nodeType === 1 && callback11(value9);
      }
    };
    return callback11(root), {
      links: items,
      truncated: flag
    };
  }
  return bindRuntimeValue(runtime2, "inspectRenderedSemantics", () => inspectRenderedSemantics), () => {
  };
}
export {
  installExportRenderedSemantics
};
