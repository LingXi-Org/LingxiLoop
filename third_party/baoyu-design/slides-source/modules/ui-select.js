// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiSelect(runtime2) {
  var SelectReact, SelectJsx, selectTriggerClasses, selectRowSizes, initializeSelect;
  function SelectOptionRow({ disabledReason, className, rowSize = "md", hint, children, ...props }) {
    let value = selectRowSizes[rowSize], value2 = hint !== void 0 && hint !== "" ? SelectJsx.jsxs("span", {
      className: "flex min-w-0 flex-1 items-center gap-1.5",
      children: [
        SelectJsx.jsx("span", {
          className: "min-w-0 truncate",
          children
        }),
        SelectJsx.jsx("span", {
          className: "shrink-0 text-footnote text-muted",
          children: hint
        })
      ]
    }) : children, value3 = typeof className == "function" ? (input) => (0, runtime2.joinClassNames)(value, className(input)) : (0, runtime2.joinClassNames)(value, className), value4 = disabledReason !== void 0 && disabledReason !== "";
    return SelectJsx.jsx(runtime2.Menu.Item, {
      ...props,
      className: value3,
      disabled: props.disabled === !0 || value4,
      disabledReason: value4 ? disabledReason : void 0,
      children: value2
    });
  }
  function Select({ items, value, onChange, "aria-label": ariaLabel, placeholder, hint, icon, compact = !1, disabled: disabled2, title, align: align2, popupAttrs, defaultOpen, searchable = !1, searchLabel = "Search…", onOpenChange, quietCaptions = !1, className, "data-testid": dataTestid }) {
    let value2 = value === null ? void 0 : items.find((input) => input.value === value), value3 = value2?.icon ?? icon, value4 = items.some((input) => input.icon != null), value5 = value2?.label ?? placeholder ?? (value !== null && value !== "" ? String(value) : void 0), value6 = value5 ?? hint ?? "", [value7, value8] = SelectReact.useState(""), [open4, setOpen] = SelectReact.useState(defaultOpen === !0), collisionPadding = (0, runtime2.useFootInsetCollisionPadding)(open4);
    (0, runtime2.usePopupOpenFocus)(open4);
    let ref = SelectReact.useRef(null), actionsRef = SelectReact.useRef(null), value9 = (0, runtime2.useCoarsePointer)(), value10 = searchable ? value7.trim().toLowerCase() : "", value11 = value10 === "" ? items : items.filter((input) => input.label.toLowerCase().includes(value10)), callback = (input) => Array.from(input.closest('[role="menu"]')?.querySelectorAll('[role^="menuitem"]') ?? []), callback2 = (event) => {
      let current = ref.current, value12 = event.getModifierState("AltGraph");
      !current || event.target.closest("input") || event.nativeEvent.isComposing || event.keyCode === 229 || event.key.length !== 1 || event.key === " " || (event.ctrlKey || event.altKey) && !value12 || event.metaKey || (event.preventDefault(), event.stopPropagation(), event.preventBaseUIHandler(), current.focus({
        preventScroll: !0
      }), value8(current.value + event.key));
    }, callback3 = (event) => {
      let target = event.target;
      target instanceof (target.ownerDocument.defaultView ?? window).HTMLInputElement || target === event.currentTarget || target.classList.contains("overflow-y-auto") && event.nativeEvent.offsetX >= target.clientWidth || event.preventDefault();
    };
    return SelectJsx.jsxs(runtime2.Menu.Root, {
      actionsRef,
      disabled: disabled2,
      defaultOpen,
      onOpenChange: (input) => {
        setOpen(input), input || value8(""), onOpenChange?.(input);
      },
      children: [
        SelectJsx.jsx(runtime2.Menu.Trigger, {
          disabled: disabled2,
          render: SelectJsx.jsxs("button", {
            type: "button",
            "data-kit": "PropertySelect",
            "data-testid": dataTestid,
            "aria-label": value6 === "" ? ariaLabel : ariaLabel + ": " + value6,
            title,
            className: (0, runtime2.joinClassNames)(selectTriggerClasses, compact ? "w-[4.5rem] shrink-0" : "w-full flex-1", className),
            children: [
              value3 != null ? SelectJsx.jsx(runtime2.KitIcon, {
                name: value3,
                size: 13,
                className: value2?.icon != null ? "text-primary" : "text-muted"
              }) : null,
              SelectJsx.jsx("span", {
                className: (0, runtime2.joinClassNames)("min-w-0 flex-1 truncate", value5 === void 0 && "text-muted", value2 === void 0 && value6 === "Mixed" && "text-muted"),
                children: value6
              }),
              SelectJsx.jsx(runtime2.KitIcon, {
                name: "CaretDown",
                size: 16,
                className: "mr-0.5 shrink-0 text-muted transition-colors group-enabled/select:group-hover/select:text-secondary"
              })
            ]
          })
        }),
        SelectJsx.jsxs(runtime2.Menu.Popup, {
          ...popupAttrs,
          align: align2 ?? (value4 ? "end" : "start"),
          collisionPadding,
          className: (0, runtime2.joinClassNames)(value4 ? "w-[calc(var(--anchor-width)+1.375rem)]" : "w-[var(--anchor-width)]", "max-w-none min-w-[12rem] [&_.scroll-fade-y]:[scrollbar-width:none]", searchable && "[&_.scroll-fade-y]:[--cds-scroll-fade-size:0px]"),
          ...searchable ? {
            stableWhileOpen: !0,
            collisionAvoidance: {
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none"
            },
            maxVisibleItems: 10.5,
            onKeyDown: callback2,
            onMouseDown: callback3,
            header: SelectJsx.jsx("div", {
              className: "m-1 mb-2",
              children: SelectJsx.jsx(runtime2.TextInput, {
                ref,
                value: value7,
                onChange: (event) => value8(event.target.value),
                onKeyDown: (event) => {
                  if (event.nativeEvent.isComposing) {
                    event.stopPropagation();
                    return;
                  }
                  let value12 = callback(event.currentTarget), value13 = event.key === "ArrowDown" ? value12[0] : event.key === "ArrowUp" ? value12[value12.length - 1] : void 0;
                  if (value13 !== void 0 || event.key === "Enter") {
                    if (event.preventDefault(), event.stopPropagation(), value13 !== void 0)
                      value13.focus();
                    else if (value10 !== "" && !event.repeat) {
                      let enabled = value11.filter((input) => input.disabled !== !0), pick = enabled[(0, runtime2.optionTypeaheadMatch)(value10, enabled.map((input) => input.label))];
                      pick !== void 0 && (pick.value !== value && onChange(pick.value), actionsRef.current?.close?.());
                    }
                    return;
                  }
                  event.key === "Escape" ? event.preventDefault() : event.key !== "Tab" && event.stopPropagation();
                },
                slotStart: SelectJsx.jsx(runtime2.KitIcon, {
                  name: "Search",
                  size: 14,
                  className: "text-muted"
                }),
                placeholder: searchLabel,
                "aria-label": searchLabel,
                autoComplete: "off",
                spellCheck: !1,
                clearable: !0,
                onClear: () => value8(""),
                autoFocus: !value9,
                tabIndex: value9 ? -1 : void 0,
                "data-kit": "list-search",
                className: "w-full"
              })
            })
          } : {},
          children: [
            groupAdjacentSelectOptions(value11).map((input, options, context) => {
              let { group: value12, subgroup: value13 } = input[0];
              return SelectJsx.jsxs(SelectReact.Fragment, {
                children: [
                  value12 !== void 0 && value12 !== context[options - 1]?.[0]?.group ? SelectJsx.jsxs(SelectJsx.Fragment, {
                    children: [
                      options > 0 ? SelectJsx.jsx(runtime2.Menu.Separator, {}) : null,
                      SelectJsx.jsx(runtime2.ColorPickerHeader, {
                        text: value12,
                        title: !0,
                        quiet: quietCaptions
                      })
                    ]
                  }) : null,
                  SelectJsx.jsxs(runtime2.Menu.Group, {
                    "aria-label": value12 !== void 0 && value13 !== void 0 ? value12 + " · " + value13 : value12,
                    children: [
                      value13 !== void 0 ? SelectJsx.jsx(runtime2.ColorPickerHeader, {
                        text: value13
                      }) : null,
                      input.map((input2) => SelectJsx.jsxs(SelectJsx.Fragment, {
                        children: [
                          input2.separatorBefore === !0 ? SelectJsx.jsx(runtime2.Menu.Separator, {}) : null,
                          SelectJsx.jsx(SelectOptionRow, {
                            checked: input2.value === value,
                            checkedRole: "radio",
                            label: input2.label,
                            icon: input2.icon,
                            disabled: input2.disabled,
                            title: input2.title,
                            disabledReason: input2.disabled === !0 ? input2.title : void 0,
                            hint: input2.hint,
                            rowSize: input2.labelStyle !== void 0 ? "lg" : "md",
                            onClick: () => {
                              input2.value !== value && onChange(input2.value);
                            },
                            children: input2.labelStyle !== void 0 ? SelectJsx.jsx("span", {
                              className: "truncate leading-tight [font-variation-settings:normal]",
                              style: input2.labelStyle,
                              children: input2.label
                            }) : input2.label
                          })
                        ]
                      }, input2.value))
                    ]
                  })
                ]
              }, (value12 ?? "") + ":" + (value13 ?? "") + ":" + input[0].value);
            }),
            searchable && value11.length === 0 ? SelectJsx.jsx(runtime2.Menu.Item, {
              disabled: !0,
              children: "无匹配项"
            }) : null
          ]
        })
      ]
    });
  }
  function groupAdjacentSelectOptions(options) {
    let items = [];
    for (let value of options) {
      let value2 = items[items.length - 1];
      value2 !== void 0 && value2[0].group === value.group && value2[0].subgroup === value.subgroup ? value2.push(value) : items.push([value]);
    }
    return items;
  }
  return bindRuntimeValue(runtime2, "SelectOptionRow", () => SelectOptionRow), bindRuntimeValue(runtime2, "Select", () => Select), bindRuntimeValue(runtime2, "groupAdjacentSelectOptions", () => groupAdjacentSelectOptions), bindRuntimeValue(runtime2, "SelectReact", () => SelectReact, (value) => {
    SelectReact = value;
  }), bindRuntimeValue(runtime2, "SelectJsx", () => SelectJsx, (value) => {
    SelectJsx = value;
  }), bindRuntimeValue(runtime2, "selectTriggerClasses", () => selectTriggerClasses, (value) => {
    selectTriggerClasses = value;
  }), bindRuntimeValue(runtime2, "selectRowSizes", () => selectRowSizes, (value) => {
    selectRowSizes = value;
  }), bindRuntimeValue(runtime2, "initializeSelect", () => initializeSelect, (value) => {
    initializeSelect = value;
  }), () => {
    initializeSelect = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeFrameFootInset)(), (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeUiPropertySearch)(), (0, runtime2.initializeUiPointerMedia)(), SelectReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SelectJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), selectTriggerClasses = (0, runtime2.joinClassNames)("group/select flex h-control min-w-0 items-center gap-1.5 border-0 pl-md pr-sm text-left font-sans text-body enabled:cursor-default pointer-coarse:h-10", runtime2.PROPERTY_INPUT_SURFACE_CLASS), selectRowSizes = {
        md: "min-h-6",
        lg: "min-h-7"
      };
    });
  };
}
export {
  installUiSelect
};
