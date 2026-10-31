// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiInspectorIcons(runtime2) {
  var reactForUiInspectorIcons, propertyIconPath, TEXT_ALIGN_LEFT_ICON, TEXT_ALIGN_CENTER_ICON, TEXT_ALIGN_RIGHT_ICON, TEXT_ALIGN_JUSTIFY_ICON, LINE_HEIGHT_ICON, BORDER_WEIGHT_ICON, BORDER_SIDES_ICON, CORNER_RADIUS_ICON, INDIVIDUAL_CORNERS_ICON, CROP_ICON, SPACING_ICON, BORDER_SOLID_ICON, BORDER_DASHED_ICON, BORDER_DOTTED_ICON, TABLE_ROWS_ICON, TABLE_COLUMNS_ICON, FILL_SOLID_ICON, FILL_GRADIENT_ICON, ANGLE_ICON, FILL_MODE_ICONS, PROPERTY_ICONS_BY_SHAPE_KEY, initializeUiInspectorIcons;
  function fillModeOption(mode, tooltip, disabled2) {
    let state = {
      value: mode,
      tooltip,
      ...disabled2 !== void 0 ? {
        disabled: disabled2
      } : {}
    };
    if (mode === "image")
      return {
        ...state,
        icon: "Image"
      };
    let value = FILL_MODE_ICONS[mode];
    return value === void 0 ? {
      ...state,
      label: tooltip
    } : {
      ...state,
      label: reactForUiInspectorIcons.createElement(reactForUiInspectorIcons.Fragment, null, reactForUiInspectorIcons.createElement(PropertyIcon, {
        icon: value
      }), reactForUiInspectorIcons.createElement("span", {
        className: "sr-only"
      }, tooltip))
    };
  }
  function PropertyIcon({ icon, className }) {
    let value = className ?? "shrink-0", value2 = (0, runtime2.useDensity)() === "comfortable";
    if (typeof icon == "string")
      return reactForUiInspectorIcons.createElement(runtime2.Icon, {
        name: icon,
        size: "auto",
        className: value
      });
    let value3 = reactForUiInspectorIcons.createElement(runtime2.Icon, {
      customIcon: icon,
      size: "auto",
      className: value
    }), value4 = runtime2.SHAPE_DRAWN_ICON_NAMES.find((name) => !(0, runtime2.isShapeIconFilledAlias)(name) && PROPERTY_ICONS_BY_SHAPE_KEY[name] === icon), value5 = value4 === void 0 ? void 0 : runtime2.SHAPE_ICON_PATHS.icons[value4], value6 = icon === FILL_SOLID_ICON && runtime2.SHAPE_ICON_PATHS.icons.fillGradient !== void 0, value7 = (() => {
      if (value6)
        return reactForUiInspectorIcons.createElement(runtime2.Icon, {
          name: "StopFilled",
          size: "auto",
          className: value
        });
      if (value4 === void 0 || value5 === void 0)
        return;
      let value8 = value2 ? value5.fill20 : value5.fill16, value9 = {
        d: value2 ? value5.d20 : value5.d16,
        strokeWidth: runtime2.SHAPE_ICON_PATHS.stroke
      }, customIcon = {
        name: value4,
        viewBox: value2 ? 20 : 16,
        paths: value8 === void 0 ? [value9] : [value8, value9]
      };
      return reactForUiInspectorIcons.createElement(runtime2.Icon, {
        customIcon,
        size: "auto",
        className: value
      });
    })();
    return value7 === void 0 ? value3 : reactForUiInspectorIcons.createElement(reactForUiInspectorIcons.Fragment, null, reactForUiInspectorIcons.createElement("span", {
      className: "contents [[data-cds-fizzy-lake~=icons]_&]:hidden"
    }, value3), reactForUiInspectorIcons.createElement("span", {
      className: "hidden [[data-cds-fizzy-lake~=icons]_&]:contents"
    }, value7));
  }
  return bindRuntimeValue(runtime2, "fillModeOption", () => fillModeOption), bindRuntimeValue(runtime2, "PropertyIcon", () => PropertyIcon), bindRuntimeValue(runtime2, "reactForUiInspectorIcons", () => reactForUiInspectorIcons, (value) => {
    reactForUiInspectorIcons = value;
  }), bindRuntimeValue(runtime2, "propertyIconPath", () => propertyIconPath, (value) => {
    propertyIconPath = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGN_LEFT_ICON", () => TEXT_ALIGN_LEFT_ICON, (value) => {
    TEXT_ALIGN_LEFT_ICON = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGN_CENTER_ICON", () => TEXT_ALIGN_CENTER_ICON, (value) => {
    TEXT_ALIGN_CENTER_ICON = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGN_RIGHT_ICON", () => TEXT_ALIGN_RIGHT_ICON, (value) => {
    TEXT_ALIGN_RIGHT_ICON = value;
  }), bindRuntimeValue(runtime2, "TEXT_ALIGN_JUSTIFY_ICON", () => TEXT_ALIGN_JUSTIFY_ICON, (value) => {
    TEXT_ALIGN_JUSTIFY_ICON = value;
  }), bindRuntimeValue(runtime2, "LINE_HEIGHT_ICON", () => LINE_HEIGHT_ICON, (value) => {
    LINE_HEIGHT_ICON = value;
  }), bindRuntimeValue(runtime2, "BORDER_WEIGHT_ICON", () => BORDER_WEIGHT_ICON, (value) => {
    BORDER_WEIGHT_ICON = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDES_ICON", () => BORDER_SIDES_ICON, (value) => {
    BORDER_SIDES_ICON = value;
  }), bindRuntimeValue(runtime2, "CORNER_RADIUS_ICON", () => CORNER_RADIUS_ICON, (value) => {
    CORNER_RADIUS_ICON = value;
  }), bindRuntimeValue(runtime2, "INDIVIDUAL_CORNERS_ICON", () => INDIVIDUAL_CORNERS_ICON, (value) => {
    INDIVIDUAL_CORNERS_ICON = value;
  }), bindRuntimeValue(runtime2, "CROP_ICON", () => CROP_ICON, (value) => {
    CROP_ICON = value;
  }), bindRuntimeValue(runtime2, "SPACING_ICON", () => SPACING_ICON, (value) => {
    SPACING_ICON = value;
  }), bindRuntimeValue(runtime2, "BORDER_SOLID_ICON", () => BORDER_SOLID_ICON, (value) => {
    BORDER_SOLID_ICON = value;
  }), bindRuntimeValue(runtime2, "BORDER_DASHED_ICON", () => BORDER_DASHED_ICON, (value) => {
    BORDER_DASHED_ICON = value;
  }), bindRuntimeValue(runtime2, "BORDER_DOTTED_ICON", () => BORDER_DOTTED_ICON, (value) => {
    BORDER_DOTTED_ICON = value;
  }), bindRuntimeValue(runtime2, "TABLE_ROWS_ICON", () => TABLE_ROWS_ICON, (value) => {
    TABLE_ROWS_ICON = value;
  }), bindRuntimeValue(runtime2, "TABLE_COLUMNS_ICON", () => TABLE_COLUMNS_ICON, (value) => {
    TABLE_COLUMNS_ICON = value;
  }), bindRuntimeValue(runtime2, "FILL_SOLID_ICON", () => FILL_SOLID_ICON, (value) => {
    FILL_SOLID_ICON = value;
  }), bindRuntimeValue(runtime2, "FILL_GRADIENT_ICON", () => FILL_GRADIENT_ICON, (value) => {
    FILL_GRADIENT_ICON = value;
  }), bindRuntimeValue(runtime2, "ANGLE_ICON", () => ANGLE_ICON, (value) => {
    ANGLE_ICON = value;
  }), bindRuntimeValue(runtime2, "FILL_MODE_ICONS", () => FILL_MODE_ICONS, (value) => {
    FILL_MODE_ICONS = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_ICONS_BY_SHAPE_KEY", () => PROPERTY_ICONS_BY_SHAPE_KEY, (value) => {
    PROPERTY_ICONS_BY_SHAPE_KEY = value;
  }), bindRuntimeValue(runtime2, "initializeUiInspectorIcons", () => initializeUiInspectorIcons, (value) => {
    initializeUiInspectorIcons = value;
  }), () => {
    propertyIconPath = (d, strokeWidth = 1) => ({
      d,
      strokeWidth
    }), TEXT_ALIGN_LEFT_ICON = "TextAlignLeft", TEXT_ALIGN_CENTER_ICON = "TextAlignCenter", TEXT_ALIGN_RIGHT_ICON = "TextAlignRight", TEXT_ALIGN_JUSTIFY_ICON = "TextAlignJustify", LINE_HEIGHT_ICON = "LineHeight", CROP_ICON = "Crop", initializeUiInspectorIcons = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeShapeIconPaths)(), (0, runtime2.initializeShapeIconNames)(), reactForUiInspectorIcons = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), BORDER_WEIGHT_ICON = {
        name: "BorderWeight",
        viewBox: 16,
        paths: [
          propertyIconPath("M3.2 3H12.8"),
          propertyIconPath("M3.2 8H12.8", 1.5),
          propertyIconPath("M3.2 13H12.8", 2)
        ]
      }, BORDER_SIDES_ICON = {
        name: "BorderSides",
        viewBox: 16,
        paths: [
          propertyIconPath("M5.327 2.655H10.673M5.327 13.345H10.673M2.655 5.328V10.673M13.345 5.328V10.673")
        ]
      }, CORNER_RADIUS_ICON = {
        name: "CornerCurve",
        viewBox: 16,
        paths: [propertyIconPath("M3 14V9C3 5.686 5.686 3 9 3H14")]
      }, INDIVIDUAL_CORNERS_ICON = {
        name: "BorderCorners",
        viewBox: 16,
        paths: [
          propertyIconPath("M2.739 5.826V4.739C2.739 3.634 3.634 2.739 4.739 2.739H5.826M10.174 2.739H11.261C12.366 2.739 13.261 3.634 13.261 4.739V5.826M13.261 10.174V11.261C13.261 12.366 12.366 13.261 11.261 13.261H10.174M5.826 13.261H4.739C3.634 13.261 2.739 12.366 2.739 11.261V10.174")
        ]
      }, SPACING_ICON = {
        name: "Spacing",
        viewBox: 16,
        paths: [
          propertyIconPath("M2 4V3C2 2.448 2.448 2 3 2H4M12 2H13C13.552 2 14 2.448 14 3V4M14 12V13C14 13.552 13.552 14 13 14H12M2 12V13C2 13.552 2.448 14 3 14H4M7 2H9M7 14H9M2 7V9M14 7V9"),
          propertyIconPath("M6 5.6H10C10.221 5.6 10.4 5.779 10.4 6V10C10.4 10.221 10.221 10.4 10 10.4H6C5.779 10.4 5.6 10.221 5.6 10V6C5.6 5.779 5.779 5.6 6 5.6Z")
        ]
      }, BORDER_SOLID_ICON = {
        name: "StrokeSolid",
        viewBox: 16,
        paths: [propertyIconPath("M2 8H14", 1.5)]
      }, BORDER_DASHED_ICON = {
        name: "StrokeDashed",
        viewBox: 16,
        paths: [propertyIconPath("M1.5 8H4.5M6.5 8H9.5M11.5 8H14.5", 1.5)]
      }, BORDER_DOTTED_ICON = {
        name: "StrokeDotted",
        viewBox: 16,
        paths: [
          propertyIconPath("M2 8H2.01M5 8H5.01M8 8H8.01M11 8H11.01M14 8H14.01", 1.5)
        ]
      }, TABLE_ROWS_ICON = {
        name: "TableRows",
        viewBox: 16,
        paths: [
          propertyIconPath("M3.865 4H12.135M3.865 8H12.135M3.865 12H12.135")
        ]
      }, TABLE_COLUMNS_ICON = {
        name: "TableColumns",
        viewBox: 16,
        paths: [
          propertyIconPath("M4 3.865V12.135M8 3.865V12.135M12 3.865V12.135")
        ]
      }, FILL_SOLID_ICON = {
        name: "FillSolid",
        viewBox: 16,
        paths: [
          "M4.25 3H11.75C12.44 3 13 3.56 13 4.25V11.75C13 12.44 12.44 13 11.75 13H4.25C3.56 13 3 12.44 3 11.75V4.25C3 3.56 3.56 3 4.25 3Z"
        ]
      }, FILL_GRADIENT_ICON = {
        name: "GradedFill",
        viewBox: 16,
        paths: [
          propertyIconPath("M4.25 3.5H11.75C12.164 3.5 12.5 3.836 12.5 4.25V11.75C12.5 12.164 12.164 12.5 11.75 12.5H4.25C3.836 12.5 3.5 12.164 3.5 11.75V4.25C3.5 3.836 3.836 3.5 4.25 3.5Z"),
          "M12 6V11.75C12 11.888 11.888 12 11.75 12H6L12 6Z",
          "M10.2 4L4 10.2V8.5L8.5 4H10.2Z"
        ]
      }, ANGLE_ICON = {
        name: "Angle",
        viewBox: 16,
        paths: [
          propertyIconPath("M3.5 8A4.5 4.5 0 0 1 12.5 8A4.5 4.5 0 0 1 3.5 8ZM8 8L11.2 4.8")
        ]
      }, FILL_MODE_ICONS = {
        color: FILL_SOLID_ICON,
        gradient: FILL_GRADIENT_ICON
      }, PROPERTY_ICONS_BY_SHAPE_KEY = {
        sideEach: BORDER_SIDES_ICON,
        cornerEach: INDIVIDUAL_CORNERS_ICON,
        borderSolid: BORDER_SOLID_ICON,
        borderDashed: BORDER_DASHED_ICON,
        borderDotted: BORDER_DOTTED_ICON,
        lineWeight: BORDER_WEIGHT_ICON,
        cornerRadius: CORNER_RADIUS_ICON,
        spacing: SPACING_ICON,
        rows: TABLE_ROWS_ICON,
        columns: TABLE_COLUMNS_ICON,
        fillGradient: FILL_GRADIENT_ICON,
        angle: ANGLE_ICON
      };
    });
  };
}
export {
  installUiInspectorIcons
};
