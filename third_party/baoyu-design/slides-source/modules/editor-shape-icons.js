// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorShapeIcons(runtime2) {
  var ShapeIconJsx;
  function ShapeIcon({ shape, size: size4 = 26 }) {
    let state = {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 5.6,
      strokeLinejoin: "round"
    }, value = runtime2.SHAPE_ICON_PATHS.icons[shape], value2 = ShapeIconJsx.jsx("svg", {
      viewBox: "-6 -6 112 112",
      width: size4,
      height: size4,
      "aria-hidden": !0,
      className: value === void 0 ? void 0 : "sl-shape-mark",
      children: shape === "rect" ? ShapeIconJsx.jsx("rect", {
        x: "4",
        y: "18",
        width: "92",
        height: "64",
        ...state
      }) : shape === "rounded" ? ShapeIconJsx.jsx("rect", {
        x: "4",
        y: "18",
        width: "92",
        height: "64",
        rx: "18",
        ...state
      }) : shape === "ellipse" ? ShapeIconJsx.jsx("ellipse", {
        cx: "50",
        cy: "50",
        rx: "46",
        ry: "34",
        ...state
      }) : shape === "line" ? ShapeIconJsx.jsx("line", {
        x1: "4",
        y1: "50",
        x2: "96",
        y2: "50",
        ...state,
        strokeWidth: 7.2
      }) : shape === "connector" ? ShapeIconJsx.jsx("path", {
        d: "M4 82 L96 18 M66 16 L96 18 L90 46",
        ...state,
        strokeWidth: 7.2,
        strokeLinecap: "round"
      }) : ShapeIconJsx.jsx("polygon", {
        points: runtime2.shapeClipPaths[shape],
        ...state
      })
    });
    if (value === void 0)
      return value2;
    let callback = (input, options) => {
      let fill = input === 16 ? value.fill16 : value.fill20;
      return ShapeIconJsx.jsxs("svg", {
        viewBox: "0 0 " + String(input) + " " + String(input),
        width: size4,
        height: size4,
        fill: "none",
        "aria-hidden": !0,
        className: "sl-shape-drawing" + options,
        style: {
          display: "none"
        },
        children: [
          fill !== void 0 && ShapeIconJsx.jsx("path", {
            d: fill,
            fill: "currentColor"
          }),
          ShapeIconJsx.jsx("path", {
            d: input === 16 ? value.d16 : value.d20,
            stroke: "currentColor",
            strokeWidth: runtime2.SHAPE_ICON_PATHS.stroke,
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        ]
      });
    };
    return ShapeIconJsx.jsxs(ShapeIconJsx.Fragment, {
      children: [
        value2,
        typeof size4 != "number" ? ShapeIconJsx.jsxs(ShapeIconJsx.Fragment, {
          children: [
            callback(16, " sl-shape-fine"),
            callback(20, " sl-shape-coarse")
          ]
        }) : callback(size4 > 18 ? 20 : 16, "")
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ShapeIconJsx", () => ShapeIconJsx, (value) => {
    ShapeIconJsx = value;
  }), bindRuntimeValue(runtime2, "ShapeIcon", () => ShapeIcon), () => {
    (0, runtime2.initializeShapeIconPaths)(), (0, runtime2.initializeSlideRenderer)(), ShapeIconJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installEditorShapeIcons
};
