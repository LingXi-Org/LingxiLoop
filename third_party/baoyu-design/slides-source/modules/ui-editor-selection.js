// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiEditorSelection(runtime2) {
  var jsxForUiEditorSelection, SELECTION_METRICS, ALL_SELECTION_HANDLES, CORNER_SELECTION_HANDLES, EDGE_SELECTION_HANDLES, SELECTION_OUTLINE_CLASS, ROTATION_HANDLE_POSITION, initializeUiEditorSelection, reactForUiEditorSelection, jsxForUiEditorSelection2, AlignmentGuides, initializeUiEditorSelection2;
  function equalSelectionPoint(left, right) {
    return left.x === right.x && left.y === right.y;
  }
  function selectionHandlePositions(handles, variant, collaborator) {
    return collaborator !== void 0 ? [] : handles === void 0 ? variant === "selected" ? CORNER_SELECTION_HANDLES : [] : handles === "corners" ? CORNER_SELECTION_HANDLES : handles === "all" ? ALL_SELECTION_HANDLES : handles === "none" ? [] : ALL_SELECTION_HANDLES.filter((input) => handles.some((input2) => equalSelectionPoint(input2, input)));
  }
  function validSelectionScale(scale) {
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }
  function selectionHandleCssPosition(point) {
    return {
      left: point.x === "left" ? "0%" : point.x === "right" ? "100%" : "50%",
      top: point.y === "top" ? "0%" : point.y === "bottom" ? "100%" : "50%"
    };
  }
  function finiteSelectionRotation(rotation) {
    return rotation !== void 0 && Number.isFinite(rotation) ? rotation : 0;
  }
  function selectionRingWidth(variant, collaborator) {
    return collaborator !== void 0 ? SELECTION_METRICS.ringCollaborator : variant === "hover" ? SELECTION_METRICS.ringHover : variant === "member" ? SELECTION_METRICS.ringMember : SELECTION_METRICS.ring;
  }
  function collaboratorSelectionIndex(index4) {
    if (index4 !== void 0 && Number.isInteger(index4) && index4 >= 1 && index4 <= 6)
      return index4;
  }
  function collaboratorSelectionColor(index4) {
    let value = collaboratorSelectionIndex(index4);
    if (value !== void 0)
      return runtime2.designTokens.editor.collaborator[value].cssVar;
  }
  function SelectionOutline({ frame, scale, rotation, stroke, collaborator, variant }) {
    let value = finiteSelectionRotation(rotation), value2 = value === 0 ? "" : `translate(${frame.w / 2}px, ${frame.h / 2}px) rotate(${value}rad) translate(${-frame.w / 2}px, ${-frame.h / 2}px) `, state = {
      position: "absolute",
      left: 0,
      top: 0,
      width: frame.w * scale,
      height: frame.h * scale,
      transformOrigin: "0 0",
      transform: `translate(${frame.x}px, ${frame.y}px) ${value2}scale(${1 / scale})`,
      outlineWidth: stroke,
      outlineStyle: "solid",
      outlineOffset: 0,
      pointerEvents: "none"
    }, value3 = collaboratorSelectionColor(collaborator);
    return value3 !== void 0 ? state.outlineColor = value3 : variant === "component" && (state.outlineColor = runtime2.designTokens.fill.pro.cssVar), state;
  }
  function SelectionGrip({ stroke = SELECTION_METRICS.ring, disabled: disabled2, variant }) {
    let grip = SELECTION_METRICS.grip, value = variant === "component", value2 = value ? runtime2.designTokens.on.pro.cssVar : runtime2.designTokens.on.accent.cssVar, value3 = value ? runtime2.designTokens.fill.pro.cssVar : runtime2.designTokens.fill.accent.cssVar;
    return jsxForUiEditorSelection.jsx("span", {
      "data-selection-grip": "",
      "data-disabled": disabled2 ? "" : void 0,
      className: (0, runtime2.cn)("absolute left-1/2 top-1/2 box-border block -translate-x-1/2 -translate-y-1/2", SELECTION_OUTLINE_CLASS),
      style: {
        width: grip,
        height: grip,
        borderRadius: SELECTION_METRICS.gripRadius,
        backgroundColor: value2,
        outlineStyle: "solid",
        outlineWidth: stroke,
        outlineOffset: -stroke,
        outlineColor: disabled2 ? `color-mix(in srgb, ${value3} calc(${runtime2.designTokens.opacity.disabled.cssVar} * 100%), ${value2})` : value ? value3 : void 0,
        pointerEvents: "none"
      }
    });
  }
  function SelectionLabel({ scale, rotation = 0, at, anchor, variant, children, ...remainingProps }) {
    let value = 1 / scale, value2 = finiteSelectionRotation(rotation), value3 = typeof at.left == "number" && typeof at.top == "number", value4 = value3 ? `translate(${at.left}px, ${at.top}px) ` : "";
    return jsxForUiEditorSelection.jsx("span", {
      ...remainingProps,
      "data-variant": variant,
      className: (0, runtime2.cn)("absolute block whitespace-nowrap rounded-full font-sans text-caption font-medium", variant === "component" ? "bg-fill-pro text-on-pro" : "bg-fill-accent text-on-accent"),
      style: {
        left: value3 ? 0 : at.left,
        top: value3 ? 0 : at.top,
        padding: "0 6px",
        pointerEvents: "none",
        transformOrigin: anchor === "center" ? "50% 50%" : "0 0",
        transform: anchor === "center" ? `${value4}translate(-50%, -50%) rotate(${-value2}rad) scale(${value})` : `${value4}scale(${value})`
      },
      children
    });
  }
  return bindRuntimeValue(runtime2, "equalSelectionPoint", () => equalSelectionPoint), bindRuntimeValue(runtime2, "selectionHandlePositions", () => selectionHandlePositions), bindRuntimeValue(runtime2, "validSelectionScale", () => validSelectionScale), bindRuntimeValue(runtime2, "selectionHandleCssPosition", () => selectionHandleCssPosition), bindRuntimeValue(runtime2, "finiteSelectionRotation", () => finiteSelectionRotation), bindRuntimeValue(runtime2, "selectionRingWidth", () => selectionRingWidth), bindRuntimeValue(runtime2, "collaboratorSelectionIndex", () => collaboratorSelectionIndex), bindRuntimeValue(runtime2, "collaboratorSelectionColor", () => collaboratorSelectionColor), bindRuntimeValue(runtime2, "SelectionOutline", () => SelectionOutline), bindRuntimeValue(runtime2, "SelectionGrip", () => SelectionGrip), bindRuntimeValue(runtime2, "SelectionLabel", () => SelectionLabel), bindRuntimeValue(runtime2, "jsxForUiEditorSelection", () => jsxForUiEditorSelection, (value) => {
    jsxForUiEditorSelection = value;
  }), bindRuntimeValue(runtime2, "SELECTION_METRICS", () => SELECTION_METRICS, (value) => {
    SELECTION_METRICS = value;
  }), bindRuntimeValue(runtime2, "ALL_SELECTION_HANDLES", () => ALL_SELECTION_HANDLES, (value) => {
    ALL_SELECTION_HANDLES = value;
  }), bindRuntimeValue(runtime2, "CORNER_SELECTION_HANDLES", () => CORNER_SELECTION_HANDLES, (value) => {
    CORNER_SELECTION_HANDLES = value;
  }), bindRuntimeValue(runtime2, "EDGE_SELECTION_HANDLES", () => EDGE_SELECTION_HANDLES, (value) => {
    EDGE_SELECTION_HANDLES = value;
  }), bindRuntimeValue(runtime2, "SELECTION_OUTLINE_CLASS", () => SELECTION_OUTLINE_CLASS, (value) => {
    SELECTION_OUTLINE_CLASS = value;
  }), bindRuntimeValue(runtime2, "ROTATION_HANDLE_POSITION", () => ROTATION_HANDLE_POSITION, (value) => {
    ROTATION_HANDLE_POSITION = value;
  }), bindRuntimeValue(runtime2, "initializeUiEditorSelection", () => initializeUiEditorSelection, (value) => {
    initializeUiEditorSelection = value;
  }), bindRuntimeValue(runtime2, "reactForUiEditorSelection", () => reactForUiEditorSelection, (value) => {
    reactForUiEditorSelection = value;
  }), bindRuntimeValue(runtime2, "jsxForUiEditorSelection2", () => jsxForUiEditorSelection2, (value) => {
    jsxForUiEditorSelection2 = value;
  }), bindRuntimeValue(runtime2, "AlignmentGuides", () => AlignmentGuides, (value) => {
    AlignmentGuides = value;
  }), bindRuntimeValue(runtime2, "initializeUiEditorSelection2", () => initializeUiEditorSelection2, (value) => {
    initializeUiEditorSelection2 = value;
  }), () => {
    SELECTION_OUTLINE_CLASS = "outline-fill-accent", initializeUiEditorSelection = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeUiEditorTokens)(), jsxForUiEditorSelection = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SELECTION_METRICS = {
        ring: 2,
        ringHover: 1.5,
        ringMember: 1,
        ringCollaborator: 1.5,
        grip: 12,
        gripRadius: 1,
        guide: 1
      }, ALL_SELECTION_HANDLES = [
        {
          x: "left",
          y: "top"
        },
        {
          x: null,
          y: "top"
        },
        {
          x: "right",
          y: "top"
        },
        {
          x: "right",
          y: null
        },
        {
          x: "right",
          y: "bottom"
        },
        {
          x: null,
          y: "bottom"
        },
        {
          x: "left",
          y: "bottom"
        },
        {
          x: "left",
          y: null
        }
      ], CORNER_SELECTION_HANDLES = ALL_SELECTION_HANDLES.filter((input) => input.x !== null && input.y !== null), EDGE_SELECTION_HANDLES = ALL_SELECTION_HANDLES.filter((input) => input.x === null != (input.y === null)), ROTATION_HANDLE_POSITION = {
        left: "50%",
        top: "calc(100% + 20.5px)"
      };
    }), initializeUiEditorSelection2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), initializeUiEditorSelection(), reactForUiEditorSelection = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiEditorSelection2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), AlignmentGuides = reactForUiEditorSelection.forwardRef(function({ guides, scale = 1, className, style, ...props }, options) {
        let value = validSelectionScale(scale), guide = SELECTION_METRICS.guide, value2 = 1 / value;
        return jsxForUiEditorSelection2.jsx("div", {
          ...props,
          ref: options,
          "data-cds": "AlignmentGuides",
          "aria-hidden": "true",
          className: (0, runtime2.cn)("absolute inset-0", className),
          style: {
            ...style,
            pointerEvents: "none"
          },
          children: guides.map((input, options2) => jsxForUiEditorSelection2.jsxs("span", {
            "data-axis": input.axis,
            children: [
              jsxForUiEditorSelection2.jsx("span", {
                "data-guide-line": "",
                className: "absolute block bg-fill-accent",
                style: input.axis === "x" ? {
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: guide,
                  transformOrigin: "0 0",
                  transform: `translateX(${input.pos}px) scaleX(${value2})`,
                  pointerEvents: "none"
                } : {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: guide,
                  transformOrigin: "0 0",
                  transform: `translateY(${input.pos}px) scaleY(${value2})`,
                  pointerEvents: "none"
                }
              }),
              input.label !== void 0 ? jsxForUiEditorSelection2.jsx(SelectionLabel, {
                "data-guide-label": "",
                scale: value,
                anchor: "start",
                at: input.axis === "x" ? {
                  left: input.pos + 6 / value,
                  top: 8 / value
                } : {
                  left: 8 / value,
                  top: input.pos + 6 / value
                },
                children: input.label
              }) : null
            ]
          }, `${input.axis}-${input.pos}-${options2}`))
        });
      }), AlignmentGuides.displayName = "AlignmentGuides";
    });
  };
}
export {
  installUiEditorSelection
};
