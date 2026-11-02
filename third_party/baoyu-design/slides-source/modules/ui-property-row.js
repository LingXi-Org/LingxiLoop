// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyRow(runtime2) {
  var PROPERTY_ROW_INTERACTIVE_SELECTOR, initializeUiPropertyRow, reactForUiPropertyRow, jsxForUiPropertyRow, initializeUiPropertyRow2, reactForUiPropertyRow2, jsxForUiPropertyRow2, PROPERTY_INPUT_SURFACE_CLASS, PROPERTY_INPUT_CLASS, PROPERTY_PLACEHOLDER_CLASS, COLOR_SWATCH_CLASS, FieldButton, PROPERTY_SECTION_GUTTER_CLASS, PROPERTY_ACTIONS_CLASS, mixedSectionCollapseWarningShown, untitledSectionCollapseWarningShown, initializeUiPropertyRow3;
  function propertyRowPressShouldIgnore(row, target) {
    if (target.closest(PROPERTY_ROW_INTERACTIVE_SELECTOR) || target.closest('[data-kit="row-trailing"]') || target.closest("[data-mc-scrim], [data-base-ui-inert]"))
      return !0;
    let ancestor = target.closest(runtime2.OPEN_OVERLAY_SELECTOR);
    return ancestor !== null && !ancestor.contains(row);
  }
  function PropertySectionActions({ section, "aria-label": ariaLabel, items, align: align2 = "end", disabled: disabled2, open: open4, onOpenChange, defaultOpen = !1, "data-testid": dataTestid }) {
    let [value, value2] = reactForUiPropertyRow.useState(defaultOpen), value3 = open4 !== void 0;
    if ((0, runtime2.usePopupOpenFocus)((value3 ? open4 : value) === !0 && items.length > 0), items.length === 0)
      return !value3 && value && value2(!1), null;
    let value4 = ariaLabel ?? (section !== void 0 && section !== "" ? (0, runtime2.addToSectionLabel)(section) : runtime2.ADD_LABEL), value5 = jsxForUiPropertyRow.jsx(runtime2.Menu, {
      iconOnly: !0,
      icon: "Add",
      variant: "ghost",
      "aria-label": value4,
      tooltip: value4,
      disabled: disabled2,
      align: align2,
      open: value3 ? open4 : value,
      onOpenChange: (input) => {
        value3 || value2(input), onOpenChange?.(input);
      },
      items: items.map((input) => {
        let value6 = input.disabledReason !== void 0 && input.disabledReason !== "";
        return {
          label: input.label,
          onSelect: input.onSelect,
          disabled: input.disabled === !0 || value6,
          disabledReason: value6 ? input.disabledReason : void 0,
          description: input.description
        };
      })
    });
    return dataTestid === void 0 ? value5 : jsxForUiPropertyRow.jsx("span", {
      "data-testid": dataTestid,
      className: "inline-flex",
      children: value5
    });
  }
  function PropertyColorPreview({ background, className, children, ...remainingProps }) {
    return jsxForUiPropertyRow2.jsxs("span", {
      "aria-hidden": "true",
      ...remainingProps,
      className: (0, runtime2.joinClassNames)(COLOR_SWATCH_CLASS, className),
      children: [
        background !== void 0 ? jsxForUiPropertyRow2.jsx("span", {
          className: "absolute inset-0",
          style: {
            background
          }
        }) : null,
        children
      ]
    });
  }
  function PropertyRow({ label, children, onReset, resetLabel, description, onPress, disabled: disabled2, title, labelProps, actions, actionsLabel = runtime2.MORE_ACTIONS_LABEL, defaultActionsOpen = !1, trailing, className, ...remainingProps }) {
    let value = typeof label == "string" ? label : void 0, ref = reactForUiPropertyRow2.useRef(null), value2 = reactForUiPropertyRow2.useId(), ref2 = reactForUiPropertyRow2.useRef(!1);
    reactForUiPropertyRow2.useLayoutEffect(() => {
      if (!description && !ref2.current)
        return;
      let current = ref.current;
      if (!current)
        return;
      let value6 = current.querySelectorAll('input:not([type="hidden"]), textarea, select, [role="combobox"], [role="radiogroup"], [role="switch"], button[aria-haspopup], button[aria-expanded]');
      for (let value7 of value6) {
        let value8 = (value7.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((input) => input && input !== value2);
        description && value8.push(value2), value8.length > 0 ? value7.setAttribute("aria-describedby", value8.join(" ")) : value7.removeAttribute("aria-describedby");
      }
      ref2.current = !!description;
    });
    let [value3, value4] = reactForUiPropertyRow2.useState(defaultActionsOpen), value5 = actions !== void 0 && actions.length > 0 ? actions : void 0;
    value5 === void 0 && value3 && value4(!1), (0, runtime2.usePopupOpenFocus)(value3 && value5 !== void 0);
    let ref3 = reactForUiPropertyRow2.useRef(!1);
    return jsxForUiPropertyRow2.jsxs("div", {
      "data-property-row": "",
      ...remainingProps,
      title,
      onClick: onPress && !disabled2 ? (event) => {
        propertyRowPressShouldIgnore(event.currentTarget, event.target) || onPress(event.currentTarget);
      } : void 0,
      className: (0, runtime2.joinClassNames)("group/row grid min-w-0 shrink-0 items-center gap-x-sm py-px", PROPERTY_SECTION_GUTTER_CLASS, label !== void 0 ? "grid-cols-[var(--pp-label-w,80px)_minmax(0,1fr)] pointer-coarse:grid-cols-[calc(var(--pp-label-w,80px)*13/12)_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]", "min-h-[var(--prop-row-h,32px)] pointer-coarse:min-h-[var(--prop-row-h,40px)]", disabled2 && "cursor-not-allowed", className),
      children: [
        label !== void 0 && jsxForUiPropertyRow2.jsxs("div", {
          className: (0, runtime2.joinClassNames)("flex min-w-0 items-center", disabled2 && "opacity-50"),
          children: [
            jsxForUiPropertyRow2.jsx("span", {
              title: title === void 0 ? value : void 0,
              ...labelProps,
              className: (0, runtime2.joinClassNames)("min-w-0 truncate text-footnote text-muted select-none", labelProps?.className),
              children: label
            }),
            onReset && !disabled2 && jsxForUiPropertyRow2.jsx("span", {
              className: (0, runtime2.joinClassNames)("flex w-0 shrink-0 overflow-hidden", "focus-within:w-auto focus-within:overflow-visible", "group-hover/row:w-auto group-hover/row:overflow-visible", "pointer-coarse:w-auto pointer-coarse:overflow-visible"),
              children: jsxForUiPropertyRow2.jsx(runtime2.Button, {
                variant: "ghost",
                size: "xs",
                iconOnly: !0,
                icon: "ArrowCounterClockwise",
                "aria-label": resetLabel ?? (value ? runtime2.RESET_LABEL + " " + value : runtime2.RESET_LABEL),
                tooltipSide: "left",
                disabled: disabled2,
                onPointerDown: (input) => {
                  ref3.current = input.pointerType === "touch";
                },
                onClick: (input) => {
                  let value6 = input.currentTarget.closest("[data-property-row]")?.querySelector('input, button:not([data-kit="row-reset"]), [tabindex="0"]'), current = ref3.current;
                  ref3.current = !1;
                  let value7 = value6?.matches("input, textarea, [contenteditable]") ?? !1;
                  value6 && !(current && value7) && value6.focus(), onReset();
                },
                "data-kit": "row-reset",
                className: "ml-xs shrink-0"
              })
            })
          ]
        }),
        jsxForUiPropertyRow2.jsxs("div", {
          ref,
          className: (0, runtime2.joinClassNames)("flex min-w-0 items-center gap-2", trailing === void 0 && "pr-[calc(var(--pp-iconcol,-4px)+4px)] pointer-coarse:pr-[calc(var(--pp-iconcol,-8px)+8px)]"),
          children: [
            children,
            description ? jsxForUiPropertyRow2.jsx("span", {
              id: value2,
              hidden: !0,
              "data-kit": "row-description",
              children: description
            }) : null,
            value5 !== void 0 ? jsxForUiPropertyRow2.jsx(runtime2.Menu, {
              iconOnly: !0,
              icon: "DotsHorizontal",
              variant: "ghost",
              "aria-label": actionsLabel,
              tooltip: actionsLabel,
              align: "end",
              disabled: disabled2,
              open: value3,
              onOpenChange: value4,
              items: value5.map((input) => ({
                label: input.label,
                onSelect: input.onSelect,
                variant: input.variant,
                disabled: input.disabled,
                separatorBefore: input.separatorBefore
              })),
              className: "-ml-1 pointer-coarse:ml-0 shrink-0"
            }) : null,
            trailing !== void 0 ? jsxForUiPropertyRow2.jsx("span", {
              "data-kit": "row-trailing",
              className: (0, runtime2.joinClassNames)("-ml-1 pointer-coarse:ml-0 flex w-[var(--pp-iconcol,auto)] shrink-0 items-center justify-center", PROPERTY_ACTIONS_CLASS),
              children: trailing
            }) : null
          ]
        })
      ]
    });
  }
  function PropertySectionHeader({ title, actions, collapsed, onToggle, summary, subsection, className }) {
    let value = onToggle !== void 0, headingTag = subsection && summary !== void 0 ? "h4" : "h3", summaryElement = summary !== void 0 ? jsxForUiPropertyRow2.jsx("span", {
      "aria-hidden": "true",
      "data-section-summary": "",
      className: (0, runtime2.joinClassNames)("-my-1 flex min-w-0 flex-1 items-center justify-end overflow-hidden p-0.5 font-normal transition-opacity duration-normal motion-reduce:transition-none", collapsed ? "opacity-100" : "pointer-events-none opacity-0"),
      children: summary
    }) : null, value2 = (0, runtime2.joinClassNames)("flex min-w-0 shrink-0 items-center gap-xs select-none", PROPERTY_SECTION_GUTTER_CLASS, subsection ? (0, runtime2.joinClassNames)("text-footnote font-semibold text-secondary", summary !== void 0 ? "min-h-9 py-1 pointer-coarse:min-h-10" : "pt-2 pb-1") : "min-h-10 border-t border-alpha-2 py-2 text-body-semibold text-primary first:border-t-0", className), value3 = value ? jsxForUiPropertyRow2.jsx("span", {
      "aria-hidden": "true",
      className: "-my-1 flex size-control shrink-0 items-center justify-center",
      children: jsxForUiPropertyRow2.jsx(runtime2.KitIcon, {
        name: "CaretRight",
        size: 16,
        className: (0, runtime2.joinClassNames)("text-secondary transition-transform duration-fast", !collapsed && "rotate-90")
      })
    }) : null;
    return value && !actions ? jsxForUiPropertyRow2.jsx(headingTag, {
      className: "contents",
      children: jsxForUiPropertyRow2.jsxs("button", {
        type: "button",
        "aria-expanded": !collapsed,
        onClick: onToggle,
        className: (0, runtime2.joinClassNames)(value2, "w-full cursor-default text-left outline-none focus-visible:outline-hidden focus-visible:shadow-focus"),
        children: [
          jsxForUiPropertyRow2.jsx("span", {
            className: (0, runtime2.joinClassNames)("min-w-0 truncate", summaryElement === null ? "flex-1" : "shrink-0 pr-2"),
            children: title
          }),
          summaryElement,
          value3
        ]
      })
    }) : jsxForUiPropertyRow2.jsxs("div", {
      onClick: value ? (event) => {
        propertyRowPressShouldIgnore(event.currentTarget, event.target) || onToggle();
      } : void 0,
      className: (0, runtime2.joinClassNames)(value2, value && "cursor-default"),
      children: [
        jsxForUiPropertyRow2.jsx(headingTag, {
          className: "contents",
          children: value ? jsxForUiPropertyRow2.jsx("button", {
            type: "button",
            "aria-expanded": !collapsed,
            onClick: (input) => {
              input.stopPropagation(), onToggle();
            },
            className: "-my-1 min-w-0 flex-1 cursor-default truncate rounded-sm py-1 text-left text-inherit outline-none focus-visible:outline-hidden focus-visible:shadow-focus",
            children: title
          }) : jsxForUiPropertyRow2.jsx("span", {
            className: "min-w-0 flex-1 truncate",
            children: title
          })
        }),
        actions ? jsxForUiPropertyRow2.jsx("span", {
          className: (0, runtime2.joinClassNames)("-my-1 flex shrink-0 items-center gap-0.5", PROPERTY_ACTIONS_CLASS),
          onClick: value ? (input) => input.stopPropagation() : void 0,
          children: actions
        }) : null,
        value3
      ]
    });
  }
  function warnMixedSectionCollapseControl() {
    mixedSectionCollapseWarningShown || (mixedSectionCollapseWarningShown = !0, console.error("PropertySection: pass either collapsed/onToggle (controlled) or collapsible/defaultOpen (uncontrolled), not both — collapsed wins."));
  }
  function warnUntitledCollapsibleSection() {
    untitledSectionCollapseWarningShown || (untitledSectionCollapseWarningShown = !0, console.error("PropertySection: collapsible needs a title (the header is the toggle) — ignored on a title-less section."));
  }
  function PropertySection({ title, addItems, addLabel, defaultAddOpen, actions, action, collapsed, onToggle, summary, collapsible = !1, defaultOpen = !1, subsection, iconColumn = !1, children, className, "data-testid": dataTestid }) {
    let value = reactForUiPropertyRow2.Children.toArray(children).length > 0, [value2, value3] = reactForUiPropertyRow2.useState(defaultOpen), value4 = collapsed !== void 0;
    value4 && collapsible && warnMixedSectionCollapseControl(), collapsible && title === void 0 && warnUntitledCollapsibleSection();
    let value5 = !value4 && !!collapsible && title !== void 0, value6 = value4 ? collapsed : value5 ? !value2 : void 0, value7 = value5 ? () => {
      value3((input) => !input), onToggle?.();
    } : onToggle, value8 = value6 !== !0, value9 = typeof title == "string" ? title : void 0, value10 = actions ?? action, value11 = value10 != null && value10 !== !1, value12 = addItems !== void 0 && addItems.length > 0 ? jsxForUiPropertyRow2.jsx(PropertySectionActions, {
      section: value9,
      "aria-label": addLabel,
      items: addItems,
      defaultOpen: defaultAddOpen
    }) : null, value13 = value12 !== null || value11 ? jsxForUiPropertyRow2.jsxs(jsxForUiPropertyRow2.Fragment, {
      children: [value12, value11 ? value10 : null]
    }) : void 0, value14 = (0, runtime2.joinClassNames)("flex min-w-0 shrink-0 flex-col", !subsection && "border-alpha-2 [&:not(:first-child)]:border-t", title === void 0 && !subsection && "[&:not(:first-child)]:pt-2", iconColumn && "[--pp-iconcol:var(--cds-h-control)]", className), value15 = title !== void 0 ? jsxForUiPropertyRow2.jsx(PropertySectionHeader, {
      title,
      actions: value13,
      collapsed: value6,
      onToggle: value7,
      summary,
      subsection
    }) : null, value16 = jsxForUiPropertyRow2.jsx("div", {
      className: "flex min-w-0 flex-col pb-2",
      children
    });
    return value6 !== void 0 ? jsxForUiPropertyRow2.jsxs(runtime2.Collapsible.Root, {
      open: value8,
      "data-testid": dataTestid,
      className: value14,
      children: [
        value15,
        value ? jsxForUiPropertyRow2.jsx(runtime2.Collapsible.Panel, {
          children: value16
        }) : null
      ]
    }) : jsxForUiPropertyRow2.jsxs("div", {
      "data-testid": dataTestid,
      className: value14,
      children: [value15, value ? value16 : null]
    });
  }
  return bindRuntimeValue(runtime2, "propertyRowPressShouldIgnore", () => propertyRowPressShouldIgnore), bindRuntimeValue(runtime2, "PROPERTY_ROW_INTERACTIVE_SELECTOR", () => PROPERTY_ROW_INTERACTIVE_SELECTOR, (value) => {
    PROPERTY_ROW_INTERACTIVE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyRow", () => initializeUiPropertyRow, (value) => {
    initializeUiPropertyRow = value;
  }), bindRuntimeValue(runtime2, "PropertySectionActions", () => PropertySectionActions), bindRuntimeValue(runtime2, "reactForUiPropertyRow", () => reactForUiPropertyRow, (value) => {
    reactForUiPropertyRow = value;
  }), bindRuntimeValue(runtime2, "jsxForUiPropertyRow", () => jsxForUiPropertyRow, (value) => {
    jsxForUiPropertyRow = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyRow2", () => initializeUiPropertyRow2, (value) => {
    initializeUiPropertyRow2 = value;
  }), bindRuntimeValue(runtime2, "PropertyColorPreview", () => PropertyColorPreview), bindRuntimeValue(runtime2, "PropertyRow", () => PropertyRow), bindRuntimeValue(runtime2, "PropertySectionHeader", () => PropertySectionHeader), bindRuntimeValue(runtime2, "warnMixedSectionCollapseControl", () => warnMixedSectionCollapseControl), bindRuntimeValue(runtime2, "warnUntitledCollapsibleSection", () => warnUntitledCollapsibleSection), bindRuntimeValue(runtime2, "PropertySection", () => PropertySection), bindRuntimeValue(runtime2, "reactForUiPropertyRow2", () => reactForUiPropertyRow2, (value) => {
    reactForUiPropertyRow2 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiPropertyRow2", () => jsxForUiPropertyRow2, (value) => {
    jsxForUiPropertyRow2 = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_INPUT_SURFACE_CLASS", () => PROPERTY_INPUT_SURFACE_CLASS, (value) => {
    PROPERTY_INPUT_SURFACE_CLASS = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_INPUT_CLASS", () => PROPERTY_INPUT_CLASS, (value) => {
    PROPERTY_INPUT_CLASS = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_PLACEHOLDER_CLASS", () => PROPERTY_PLACEHOLDER_CLASS, (value) => {
    PROPERTY_PLACEHOLDER_CLASS = value;
  }), bindRuntimeValue(runtime2, "COLOR_SWATCH_CLASS", () => COLOR_SWATCH_CLASS, (value) => {
    COLOR_SWATCH_CLASS = value;
  }), bindRuntimeValue(runtime2, "FieldButton", () => FieldButton, (value) => {
    FieldButton = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_SECTION_GUTTER_CLASS", () => PROPERTY_SECTION_GUTTER_CLASS, (value) => {
    PROPERTY_SECTION_GUTTER_CLASS = value;
  }), bindRuntimeValue(runtime2, "PROPERTY_ACTIONS_CLASS", () => PROPERTY_ACTIONS_CLASS, (value) => {
    PROPERTY_ACTIONS_CLASS = value;
  }), bindRuntimeValue(runtime2, "mixedSectionCollapseWarningShown", () => mixedSectionCollapseWarningShown, (value) => {
    mixedSectionCollapseWarningShown = value;
  }), bindRuntimeValue(runtime2, "untitledSectionCollapseWarningShown", () => untitledSectionCollapseWarningShown, (value) => {
    untitledSectionCollapseWarningShown = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyRow3", () => initializeUiPropertyRow3, (value) => {
    initializeUiPropertyRow3 = value;
  }), () => {
    PROPERTY_ROW_INTERACTIVE_SELECTOR = 'button,input,select,textarea,label,[role="slider"],[role="switch"],[role="radio"],[role="checkbox"],[role="menuitem"]', initializeUiPropertyRow = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiPropertyFocus)();
    }), initializeUiPropertyRow2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiPropertyLabels)(), reactForUiPropertyRow = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiPropertyRow = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), PROPERTY_INPUT_SURFACE_CLASS = "rounded bg-fill-field text-primary shadow-field-ring outline-none transition duration-fast placeholder:text-muted enabled:hover:shadow-field-hover focus-visible:outline-hidden focus-visible:shadow-focus aria-expanded:shadow-field-hover disabled:opacity-50", COLOR_SWATCH_CLASS = "relative inline-block h-4 w-4 shrink-0 overflow-hidden rounded-[4px] shadow-card-ring bg-[repeating-conic-gradient(var(--cds-alpha-2)_0_25%,transparent_0_50%)] bg-[length:8px_8px]", PROPERTY_SECTION_GUTTER_CLASS = "pl-[var(--pp-gutter-l,var(--cds-pad-lg))] pr-[var(--pp-gutter-r,var(--cds-pad-md))]", PROPERTY_ACTIONS_CLASS = "[&_[data-cds=Button][aria-label]:not([aria-pressed=true])]:text-secondary", mixedSectionCollapseWarningShown = !1, untitledSectionCollapseWarningShown = !1, initializeUiPropertyRow3 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyIcons)(), initializeUiPropertyRow(), (0, runtime2.initializeUiPropertyPopover2)(), initializeUiPropertyRow2(), (0, runtime2.initializeUiPropertyLabels)(), reactForUiPropertyRow2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiPropertyRow2 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PROPERTY_INPUT_CLASS = (0, runtime2.joinClassNames)("h-control min-w-0 px-md text-body pointer-coarse:h-10", PROPERTY_INPUT_SURFACE_CLASS), PROPERTY_PLACEHOLDER_CLASS = (0, runtime2.joinClassNames)("flex h-control min-w-0 items-center gap-sm pr-md pl-1 text-left text-body pointer-coarse:h-10", PROPERTY_INPUT_SURFACE_CLASS), FieldButton = reactForUiPropertyRow2.forwardRef(function({ chip, children, caption, muted, trailing, className, type = "button", ...props }, options) {
        return jsxForUiPropertyRow2.jsxs("button", {
          ...props,
          ref: options,
          type,
          className: (0, runtime2.joinClassNames)(chip != null ? PROPERTY_PLACEHOLDER_CLASS : (0, runtime2.joinClassNames)(PROPERTY_INPUT_CLASS, "flex items-center gap-sm text-left"), "flex-1", className),
          children: [
            chip,
            jsxForUiPropertyRow2.jsx("span", {
              className: (0, runtime2.joinClassNames)("min-w-0 flex-1 truncate", muted && "text-muted"),
              children
            }),
            caption != null ? jsxForUiPropertyRow2.jsx("span", {
              className: "text-caption text-muted",
              children: caption
            }) : null,
            trailing
          ]
        });
      });
    });
  };
}
export {
  installUiPropertyRow
};
