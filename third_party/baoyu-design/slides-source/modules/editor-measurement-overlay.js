// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorMeasurementOverlay(runtime2) {
  var jsxlH;
  function measureDistances(selected, reference, scale) {
    let state = {
      lines: [],
      labels: []
    }, value = scale > 0 && isFinite(scale) ? scale : 1, count = 0.01, callback = (input, options) => options.l <= input.l + 0.01 && options.t <= input.t + 0.01 && options.r >= input.r - 0.01 && options.b >= input.b - 0.01;
    if (callback(reference, selected)) {
      let value7 = selected;
      selected = reference, reference = value7;
    }
    let value2 = callback(selected, reference), callback2 = (input, options, context, value7) => {
      let value8 = Math.max(input, context), value9 = Math.min(options, value7);
      return value9 > value8 ? (value8 + value9) / 2 : null;
    }, callback3 = (input, options, context, value7, extra, detail) => {
      let value8 = Math.round(Math.abs(context - options) / value);
      if (value8 < 1)
        return;
      let value9 = String(value8);
      input === "x" ? (state.lines.push({
        x1: Math.min(options, context),
        y1: value7,
        x2: Math.max(options, context),
        y2: value7
      }), state.labels.push({
        x: (options + context) / 2,
        y: value7,
        text: value9,
        axis: input
      }), value7 < extra ? state.lines.push({
        x1: context,
        y1: value7,
        x2: context,
        y2: extra,
        ext: 1
      }) : value7 > detail && state.lines.push({
        x1: context,
        y1: detail,
        x2: context,
        y2: value7,
        ext: 1
      })) : (state.lines.push({
        x1: value7,
        y1: Math.min(options, context),
        x2: value7,
        y2: Math.max(options, context)
      }), state.labels.push({
        x: value7,
        y: (options + context) / 2,
        text: value9,
        axis: input
      }), value7 < extra ? state.lines.push({
        x1: value7,
        y1: context,
        x2: extra,
        y2: context,
        ext: 1
      }) : value7 > detail && state.lines.push({
        x1: detail,
        y1: context,
        x2: value7,
        y2: context,
        ext: 1
      }));
    }, value3 = callback2(selected.t, selected.b, reference.t, reference.b), value4 = value3 ?? (selected.t + selected.b) / 2, value5 = callback2(selected.l, selected.r, reference.l, reference.r), value6 = value5 ?? (selected.l + selected.r) / 2;
    return value2 ? (callback3("x", selected.l, reference.l, value4, reference.t, reference.b), callback3("x", selected.r, reference.r, value4, reference.t, reference.b), callback3("y", selected.t, reference.t, value6, reference.l, reference.r), callback3("y", selected.b, reference.b, value6, reference.l, reference.r), state) : (reference.r <= selected.l ? callback3("x", selected.l, reference.r, value4, reference.t, reference.b) : reference.l >= selected.r && callback3("x", selected.r, reference.l, value4, reference.t, reference.b), reference.b <= selected.t ? callback3("y", selected.t, reference.b, value6, reference.l, reference.r) : reference.t >= selected.b && callback3("y", selected.b, reference.t, value6, reference.l, reference.r), state);
  }
  function MeasureOverlay({ m, scale }) {
    return jsxlH.jsxs(jsxlH.Fragment, {
      children: [
        jsxlH.jsx("svg", {
          "data-testid": "measure-overlay",
          "aria-hidden": "true",
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none"
          },
          width: 1,
          height: 1,
          children: m.lines.map((input, options) => jsxlH.jsx("line", {
            x1: input.x1,
            y1: input.y1,
            x2: input.x2,
            y2: input.y2,
            style: {
              stroke: "var(--t-measure)",
              strokeWidth: 1 / scale,
              strokeDasharray: input.ext ? String(3 / scale) + " " + String(3 / scale) : void 0,
              opacity: input.ext ? 0.6 : 1
            }
          }, "ml" + String(options)))
        }),
        m.labels.map((input, options) => jsxlH.jsx("div", {
          "data-testid": "measure-label",
          "aria-hidden": "true",
          style: {
            position: "absolute",
            left: input.x,
            top: input.y,
            transform: input.axis === "x" ? "translate(-50%, " + String(5 / scale) + "px)" : "translate(" + String(5 / scale) + "px, -50%)",
            background: "var(--t-measure)",
            color: "#FFFFFF",
            fontFamily: "system-ui, sans-serif",
            fontSize: 11 / scale,
            lineHeight: 1.4,
            fontVariantNumeric: "tabular-nums",
            padding: String(1 / scale) + "px " + String(5 / scale) + "px",
            borderRadius: 4 / scale,
            whiteSpace: "nowrap",
            pointerEvents: "none"
          },
          children: input.text
        }, "mt" + String(options)))
      ]
    });
  }
  return bindRuntimeValue(runtime2, "measureDistances", () => measureDistances), bindRuntimeValue(runtime2, "jsxlH", () => jsxlH, (value) => {
    jsxlH = value;
  }), bindRuntimeValue(runtime2, "MeasureOverlay", () => MeasureOverlay), () => {
    (0, runtime2.initializeImageCrop)(), jsxlH = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installEditorMeasurementOverlay
};
