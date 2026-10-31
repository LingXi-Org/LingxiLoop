// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiStyleInspector(runtime2) {
  var reactL9, jsxTJ, MAX_INLINE_ENUM_CHOICES, MAX_INLINE_ENUM_LABEL_LENGTH, enumChoicesFitInline, STYLE_GROUP_ORDER, HIDDEN_STYLE_PROPERTY_KEYS, STYLE_SHORTHAND_LONGHANDS, STYLE_LENGTH_UNITS, MAX_STYLE_LENGTH_PX, MIN_STYLE_PERCENT, MAX_STYLE_PERCENT, SHADOW_FIELDS, SHADOW_SPREAD_FIELD, FILTER_FIELDS, FILTER_PERCENT_FIELDS, TRANSFORM_FIELDS, MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS, STYLE_PROPERTY_LABELS, BLUR_EFFECT_LABELS, STYLE_ENUM_VALUE_LABELS, MAX_STYLE_EFFECT_ADD_CHOICES, INNER_TEXT_SHADOW_DISABLED_REASON, SHAPE_SHADOW_DISABLED_REASON, STYLE_EFFECT_KEYS, MIXED_STYLE_CHOICE, SHADOW_EDITOR_BOUNDS;
  function propertyValidatorKind(validator) {
    let kind = validator.kind;
    return typeof kind == "string" ? kind : "";
  }
  function propertyValidatorNumber(validator, key, fallback) {
    let value = validator[key];
    return typeof value == "number" && Number.isFinite(value) ? value : fallback;
  }
  function propertyValidatorStringArray(validator, key) {
    let value = validator[key];
    return Array.isArray(value) ? value.filter((input) => typeof input == "string") : [];
  }
  function stylePropertyValidator(property, kind) {
    let value = runtime2.stylePropertyRegistry[property];
    return kind === "slides-shape" && value.shapeValue !== void 0 ? value.shapeValue : kind.startsWith("slides-") && value.slidesValue !== void 0 ? value.slidesValue : value.value;
  }
  function stylePropertyRowModel(validator, coarse) {
    let value = propertyValidatorKind(validator);
    switch (value) {
      case "len":
      case "num": {
        let value2 = propertyValidatorNumber(validator, "lo", 0), value3 = propertyValidatorNumber(validator, "hi", 1e3);
        return value === "num" && value2 === 0 && value3 === 1 ? {
          row: "slider",
          min: value2,
          max: value3,
          step: 0.01
        } : {
          row: "number",
          min: value2,
          max: value3,
          step: value === "len" ? 1 : 0.1
        };
      }
      case "int":
        return {
          row: "number",
          min: propertyValidatorNumber(validator, "lo", 0),
          max: propertyValidatorNumber(validator, "hi", 1e3),
          step: propertyValidatorNumber(validator, "step", 1)
        };
      case "enum": {
        let value2 = propertyValidatorStringArray(validator, "values");
        return value2.length <= MAX_INLINE_ENUM_CHOICES && !coarse && enumChoicesFitInline(value2) ? {
          row: "segmented",
          options: value2
        } : {
          row: "select",
          options: value2
        };
      }
      case "color":
        return {
          row: "color"
        };
      case "fontFamily":
        return {
          row: "select",
          options: ["sans", "serif", "mono", "helvetica"]
        };
      case "str":
        return {
          row: "text"
        };
      case "size":
        return {
          row: "size"
        };
      case "shadow":
      case "gradient":
      case "filter":
      case "transform":
        return {
          row: "compound",
          shape: value
        };
      default:
        return {
          row: "deferred"
        };
    }
  }
  function stylePropertyGroup(property) {
    return /shadow|filter|blend/i.test(property) || property === "transform" ? "Effects" : property === "color" || /^(font|line|letter|text|white|word)/.test(property) ? "Typography" : /^(background|opacity)/.test(property) ? "Color & fill" : /^(padding|margin|gap)/.test(property) ? "Spacing" : /^(border|outline|radius)/.test(property) ? "Border" : /(width|height)$/i.test(property) ? "Size" : "Layout";
  }
  function stylePropertyGroups(kind, coarse) {
    let entries = /* @__PURE__ */ new Map();
    for (let value of runtime2.stylePropertyNames) {
      if (HIDDEN_STYLE_PROPERTY_KEYS.has(value) || !(0, runtime2.stylePropertyAppliesToNode)(value, kind))
        continue;
      let value2 = stylePropertyRowModel(stylePropertyValidator(value, kind), coarse);
      if (value2.row === "deferred")
        continue;
      let value3 = stylePropertyGroup(value), entry = entries.get(value3);
      entry ? entry.push({
        key: value,
        model: value2
      }) : entries.set(value3, [
        {
          key: value,
          model: value2
        }
      ]);
    }
    return STYLE_GROUP_ORDER.flatMap((input) => {
      let entry = entries.get(input);
      return entry ? [
        {
          group: input,
          rows: entry
        }
      ] : [];
    });
  }
  function setStyleProperty(bag, key, value) {
    return {
      ...bag,
      [key]: value
    };
  }
  function deleteStyleProperty(bag, key) {
    if (bag === void 0)
      return;
    let { [key]: J, ...remainingProps } = bag;
    if (Object.keys(remainingProps).length !== 0)
      return remainingProps;
  }
  function setStyleShorthand(bag, key, value) {
    let value2 = bag;
    for (let value3 of STYLE_SHORTHAND_LONGHANDS[key] ?? [])
      value2 = deleteStyleProperty(value2, value3);
    return value === void 0 ? deleteStyleProperty(value2, key) : setStyleProperty(value2, key, value);
  }
  function styleShorthandPatch(key, value) {
    let state = {};
    for (let value2 of STYLE_SHORTHAND_LONGHANDS[key] ?? [])
      state[value2] = void 0;
    return state[key] = value, state;
  }
  function normalizeNegativeZero(value) {
    return value === 0 ? 0 : value;
  }
  function clampValidatorNumber(validator, value) {
    let value2 = propertyValidatorKind(validator), value3 = propertyValidatorNumber(validator, "lo", -1e9), value4 = propertyValidatorNumber(validator, "hi", 1e9), value5 = Number.isFinite(value) ? value : value3;
    if (value2 === "int") {
      let value6 = Math.max(1e-9, propertyValidatorNumber(validator, "step", 1));
      value5 = Math.round(value5 / value6) * value6;
    }
    return value5 = Math.min(value4, Math.max(value3, value5)), value2 === "len" ? value5 = Math.round(value5 * 10) / 10 : value2 === "num" && (value5 = Math.round(value5 * 1e4) / 1e4), normalizeNegativeZero(value5);
  }
  function clampStyleNumber(value, min2, max2) {
    let value2 = Number.isFinite(value) ? value : min2;
    return normalizeNegativeZero(Math.round(Math.min(max2, Math.max(min2, value2)) * 1e4) / 1e4);
  }
  function numericValidator(kind, min2, max2) {
    return {
      kind,
      lo: min2,
      hi: max2
    };
  }
  function styleLengthValue(unit, value) {
    return unit === "%" ? {
      pct: clampValidatorNumber(numericValidator("num", MIN_STYLE_PERCENT, MAX_STYLE_PERCENT), value)
    } : {
      px: clampValidatorNumber(numericValidator("len", 0, MAX_STYLE_LENGTH_PX), value)
    };
  }
  function styleFieldDescriptor(bounds, field, label, kind, step, unit) {
    let value = bounds[field];
    if (value === void 0)
      throw Error(`style panel: no validator range for field ${field}`);
    return unit === void 0 ? {
      field,
      label,
      min: value.min,
      max: value.max,
      step,
      kind
    } : {
      field,
      label,
      min: value.min,
      max: value.max,
      step,
      unit,
      kind
    };
  }
  function clampStyleField(field, value) {
    return clampValidatorNumber(numericValidator(field.kind, field.min, field.max), value);
  }
  function defaultStylePropertyValue(property, kind) {
    let value = stylePropertyValidator(property, kind);
    switch (propertyValidatorKind(value)) {
      case "len":
      case "num":
      case "int": {
        let value2 = propertyValidatorNumber(value, "lo", 0), value3 = propertyValidatorNumber(value, "hi", 100);
        return clampValidatorNumber(value, value2 + (value3 - value2) / 2);
      }
      case "enum":
        return propertyValidatorStringArray(value, "values")[0];
      case "color":
        return "#445566";
      case "fontFamily":
        return "sans";
      case "str":
        return "sample";
      case "size":
        return {
          px: 240
        };
      case "shadow":
        return [defaultShadowValue(property, !1)];
      case "gradient":
        return {
          angle: 180,
          stops: [
            {
              color: "#ffffff",
              pos: 0
            },
            {
              color: "#000000",
              pos: 100
            }
          ]
        };
      case "filter":
        return {
          blur: 0
        };
      case "transform":
        return {
          rotate: 0
        };
      default:
        return;
    }
  }
  function defaultShadowValue(property, inset) {
    return property !== "boxShadow" ? {
      x: 0,
      y: 1,
      blur: 3,
      color: "#00000033"
    } : inset ? {
      x: 0,
      y: 1,
      blur: 2,
      spread: 0,
      inset: !0,
      color: "#00000033"
    } : {
      x: 0,
      y: 2,
      blur: 8,
      spread: 0,
      color: "#00000033"
    };
  }
  function ownStyleProperty(bag, key) {
    if (bag !== void 0 && Object.hasOwn(bag, key))
      return bag[key];
  }
  function finiteStyleNumber(value) {
    if (typeof value == "number" && Number.isFinite(value))
      return value;
  }
  function styleStringValue(value) {
    if (typeof value == "string")
      return value;
  }
  function styleRecordValue(value) {
    if (value !== null && typeof value == "object" && !Array.isArray(value))
      return value;
  }
  function styleEffectRecords(value) {
    return (Array.isArray(value) ? value : value === void 0 ? [] : [value]).flatMap((input) => styleRecordValue(input) !== void 0 ? [input] : []);
  }
  function styleEffectLabel(key, value) {
    return key === "boxShadow" && styleRecordValue(value)?.inset === !0 ? "内阴影" : stylePropertyLabel(key);
  }
  function stylePropertyLabel(key) {
    let value = Object.hasOwn(STYLE_PROPERTY_LABELS, key) ? STYLE_PROPERTY_LABELS[key] : void 0;
    if (value !== void 0)
      return value;
    let value2 = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return value2.charAt(0).toUpperCase() + value2.slice(1);
  }
  function styleEnumValueLabel(value) {
    let value2 = Object.hasOwn(STYLE_ENUM_VALUE_LABELS, value) ? STYLE_ENUM_VALUE_LABELS[value] : void 0;
    if (value2 !== void 0)
      return value2;
    let value3 = value.replace(/-/g, " ");
    return value3.charAt(0).toUpperCase() + value3.slice(1);
  }
  function styleEnumOptions(values) {
    return values.map((input) => ({
      value: input,
      label: styleEnumValueLabel(input)
    }));
  }
  function styleValuesEqual(left, right) {
    if (left === right)
      return !0;
    if (left === null || right === null || typeof left != "object" || typeof right != "object")
      return !1;
    let value = Array.isArray(left);
    if (value !== Array.isArray(right))
      return !1;
    if (value) {
      let value5 = left, value6 = right;
      return value5.length === value6.length && value5.every((input, options) => styleValuesEqual(input, value6[options]));
    }
    let value2 = left, value3 = right, value4 = Object.keys(value2);
    return value4.length === Object.keys(value3).length && value4.every((input) => Object.hasOwn(value3, input) && styleValuesEqual(value2[input], value3[input]));
  }
  function changedStyleProperty(bag, key, value) {
    let value2 = setStyleShorthand(bag, key, value);
    if (!styleValuesEqual(value2, bag))
      return {
        next: value2
      };
  }
  function createStyleEditor({ kind: options, bag, onCommit, onLive, onLiveEnd, disabled: disabled2 = !1, disabledKeys, swatches, clearKeys, mixedKeys, unifiedColorPopover = !1 }) {
    return {
      kind: options,
      bag,
      disabled: disabled2,
      disabledKeys,
      swatches,
      clearKeys,
      mixedKeys,
      unifiedColorPopover,
      clear: (input) => {
        let value = bag, state = {};
        for (let value2 of input)
          value = setStyleShorthand(value, value2, void 0), state = {
            ...state,
            ...styleShorthandPatch(value2, void 0)
          };
        (!styleValuesEqual(value, bag) || input.some((input2) => mixedKeys?.has(input2))) && onCommit(value, state);
      },
      commit: (input, options2) => {
        let value = changedStyleProperty(bag, input, options2);
        value ? onCommit(value.next, styleShorthandPatch(input, options2)) : mixedKeys?.has(input) && onCommit(bag, styleShorthandPatch(input, options2));
      },
      live: onLive ? (input, options2) => onLive(setStyleShorthand(bag, input, options2), styleShorthandPatch(input, options2)) : void 0,
      liveEnd: onLiveEnd
    };
  }
  function StyleInspector(props) {
    let { kind, nested = !1, effectsLifted = !1, hiddenKeys, onlyKeys } = props, value = (0, runtime2.useCoarsePointer)(), memo4 = reactL9.useMemo(() => {
      let value4 = stylePropertyGroups(kind, value);
      return hiddenKeys === void 0 || hiddenKeys.size === 0 ? value4 : value4.map((input) => ({
        group: input.group,
        rows: input.rows.filter((input2) => !hiddenKeys.has(input2.key))
      })).filter((input) => input.rows.length > 0);
    }, [kind, value, hiddenKeys]), [value2, value3] = reactL9.useState(void 0), state = {
      ...createStyleEditor(props),
      openEditor: value2,
      setOpenEditor: value3
    };
    if (onlyKeys !== void 0) {
      let entries = new Map(memo4.flatMap((input) => input.rows).map((input) => [
        input.key,
        input
      ])), value4 = onlyKeys.map((input) => entries.get(input)).filter((input) => input !== void 0);
      return value4.length === 0 ? null : jsxTJ.jsx(jsxTJ.Fragment, {
        children: value4.map(({ key, model }) => jsxTJ.jsx(StylePropertyRow, {
          propKey: key,
          model,
          ed: state
        }, key))
      });
    }
    return memo4.length === 0 ? null : jsxTJ.jsx(jsxTJ.Fragment, {
      children: memo4.map((input) => {
        if (input.group !== "Effects")
          return jsxTJ.jsx(runtime2.PropertySection, {
            title: input.group,
            subsection: nested,
            children: input.rows.map(({ key, model }) => jsxTJ.jsx(StylePropertyRow, {
              propKey: key,
              model,
              ed: state
            }, key))
          }, input.group);
        let value4 = input.rows.filter((input2) => input2.key !== "boxShadow").map(({ key, model }) => jsxTJ.jsx(StylePropertyRow, {
          propKey: key,
          model,
          ed: state
        }, key));
        return effectsLifted ? jsxTJ.jsx(runtime2.PropertySection, {
          title: input.group,
          subsection: nested,
          children: value4
        }, input.group) : jsxTJ.jsx(StyleEffectsInspector, {
          ...props,
          subsection: nested,
          blurRows: !1,
          openEditor: value2,
          setOpenEditor: value3,
          children: value4
        }, input.group);
      })
    });
  }
  function styleEffectAddItems(kind, bag, commit, shadowTarget = "box", canInset, mixed = !1, dropShadowReason = SHAPE_SHADOW_DISABLED_REASON) {
    let items = [], value = shadowStyleKey(kind, shadowTarget);
    if ((0, runtime2.stylePropertyAppliesToNode)(value, kind)) {
      let value2 = styleEffectRecords(ownStyleProperty(bag, value)), value3 = value2.length >= runtime2.maxShadowCount ? {
        disabledReason: `最多 ${runtime2.maxShadowCount} / 每个元素`
      } : {}, callback = (input) => () => commit(value, [...value2, defaultShadowValue(value, input)]), value4 = canInset ?? (value2.length >= runtime2.maxShadowCount ? `最多 ${runtime2.maxShadowCount} / 每个元素` : void 0);
      items.push(value4 !== void 0 ? {
        label: "外阴影",
        onSelect: () => {
        },
        disabledReason: value4
      } : {
        label: "外阴影",
        onSelect: callback(!1)
      }), items.push(value === "textShadow" ? {
        label: "内阴影",
        onSelect: () => {
        },
        disabledReason: mixed ? dropShadowReason : INNER_TEXT_SHADOW_DISABLED_REASON
      } : {
        label: "内阴影",
        onSelect: callback(!0),
        ...value3,
        ...mixed ? {
          disabledReason: dropShadowReason
        } : {}
      });
    }
    for (let value2 of ["filter", "backdropFilter"]) {
      let value3 = styleRecordValue(ownStyleProperty(bag, value2));
      !(0, runtime2.stylePropertyAppliesToNode)(value2, kind) || value3?.blur !== void 0 || items.push({
        label: BLUR_EFFECT_LABELS[value2] ?? stylePropertyLabel(value2),
        onSelect: () => commit(value2, setRecordField(value3, "blur", MAX_STYLE_EFFECT_ADD_CHOICES)),
        ...mixed && value2 === "backdropFilter" ? {
          disabledReason: dropShadowReason
        } : {}
      });
    }
    return items;
  }
  function shadowStyleKey(kind, target) {
    return target === "text" && (0, runtime2.stylePropertyAppliesToNode)("textShadow", kind) ? "textShadow" : "boxShadow";
  }
  function StyleEffectsInspector(props) {
    let { kind, bag, subsection, blurRows = !0, children, shadowTarget = "box", dropShadowDisabledReason } = props, value = reactL9.useState(void 0), [value2, value3] = props.setOpenEditor !== void 0 ? [props.openEditor, props.setOpenEditor] : value, state = {
      ...createStyleEditor(props),
      openEditor: value2,
      setOpenEditor: value3
    }, items = [
      ...styleEffectAddItems(kind, bag, (input, items2) => {
        Array.isArray(items2) && value3({
          key: input,
          index: items2.length - 1
        }), state.commit(input, items2);
      }, shadowTarget, dropShadowDisabledReason, props.silhouette, props.silhouetteReason),
      ...props.addItems ?? []
    ];
    if (items.length === 0 && bag === void 0 && children === void 0 && !STYLE_EFFECT_KEYS.some((input) => (0, runtime2.stylePropertyAppliesToNode)(input, kind)))
      return null;
    let value4 = shadowStyleKey(kind, shadowTarget) === "textShadow" ? ["boxShadow", "textShadow"] : ["boxShadow"], callback = (input, options) => shadowTarget !== "text" ? styleEffectLabel(input, options) : input === "textShadow" ? "外阴影" : input === "boxShadow" ? styleRecordValue(options)?.inset === !0 ? "内阴影" : "阴影" : styleEffectLabel(input, options);
    return jsxTJ.jsxs(runtime2.PropertySection, {
      title: "效果",
      subsection,
      iconColumn: !0,
      actions: jsxTJ.jsx(runtime2.PropertySectionActions, {
        section: "Effects",
        items,
        disabled: state.disabled
      }),
      children: [
        value4.flatMap((input) => {
          let value5 = styleEffectRecords(ownStyleProperty(bag, input));
          return value5.map((input2, options) => jsxTJ.jsx(ShadowStyleRow, {
            propKey: input,
            list: value5,
            index: options,
            rec: input2,
            ed: state,
            label: callback(input, input2)
          }, input + String(options)));
        }),
        blurRows && ["filter", "backdropFilter"].map((input) => {
          let value5 = styleRecordValue(ownStyleProperty(bag, input));
          return value5?.blur !== void 0 && (0, runtime2.stylePropertyAppliesToNode)(input, kind) ? jsxTJ.jsx(BlurStyleRow, {
            label: BLUR_EFFECT_LABELS[input] ?? stylePropertyLabel(input),
            propKey: input,
            rec: value5,
            ed: state
          }, input) : null;
        }),
        children
      ]
    });
  }
  function StylePropertyRow({ propKey, model, ed: ed2 }) {
    let value = ownStyleProperty(ed2.bag, propKey), value2 = ed2.disabledKeys?.get(propKey), value3 = value2 !== void 0 ? {
      ...ed2,
      disabled: !0,
      whyDisabled: value2
    } : ed2, value4 = value !== void 0 && !value3.disabled ? () => ed2.commit(propKey, void 0) : void 0;
    return jsxTJ.jsx(StyleValueRow, {
      propKey,
      model,
      value,
      ed: value3,
      onReset: value4
    });
  }
  function styleScrubProps(editor, key, convert) {
    let { live, liveEnd } = editor;
    return !live || !liveEnd ? {} : {
      onScrub: (input) => live(key, convert(input)),
      onScrubEnd: liveEnd
    };
  }
  function styleLiveColorProps(editor, key, convert) {
    let { live, liveEnd } = editor;
    return !live || !liveEnd ? {} : {
      onLive: (input) => live(key, convert(input)),
      onLiveEnd: () => liveEnd()
    };
  }
  function validatedColorLiveProps(editor, onChange) {
    let { liveEnd } = editor;
    return !onChange || !liveEnd ? {} : {
      onLive: (input) => {
        let value = validatedStyleColor(input);
        value !== void 0 && onChange(value);
      },
      onLiveEnd: () => liveEnd()
    };
  }
  function StyleValueRow({ propKey, model, value, ed: ed2, onReset }) {
    let value2 = stylePropertyLabel(propKey), value3 = ed2.mixedKeys?.has(propKey) === !0;
    switch (model.row) {
      case "number": {
        let value4 = stylePropertyValidator(propKey, ed2.kind);
        return jsxTJ.jsx(runtime2.NumberPropertyRow, {
          label: value2,
          title: ed2.whyDisabled,
          onReset,
          value: value3 ? void 0 : finiteStyleNumber(value),
          mixed: value3,
          emptyStepFrom: value3 ? null : void 0,
          hint: "default",
          clearable: !0,
          min: model.min,
          max: model.max,
          step: model.step,
          onValue: (input) => ed2.commit(propKey, input === void 0 ? void 0 : clampValidatorNumber(value4, input)),
          unit: propertyValidatorKind(value4) === "len" ? "px" : void 0,
          disabled: ed2.disabled,
          ...styleScrubProps(ed2, propKey, (input) => clampValidatorNumber(value4, input))
        });
      }
      case "slider": {
        let value4 = stylePropertyValidator(propKey, ed2.kind);
        return jsxTJ.jsx(runtime2.SliderPropertyRow, {
          label: value2,
          title: ed2.whyDisabled,
          onReset,
          value: finiteStyleNumber(value) ?? model.max,
          mixed: value3,
          min: model.min,
          max: model.max,
          step: model.step,
          disabled: ed2.disabled,
          onValue: (input) => ed2.commit(propKey, clampValidatorNumber(value4, input)),
          ...styleLiveColorProps(ed2, propKey, (input) => clampValidatorNumber(value4, input))
        });
      }
      case "segmented":
        return jsxTJ.jsx(runtime2.ChoicePropertyRow, {
          label: value2,
          title: ed2.whyDisabled,
          onReset,
          value: value3 ? "" : styleStringValue(value) ?? "",
          options: styleEnumOptions(model.options),
          disabled: ed2.disabled,
          onChange: (input) => ed2.commit(propKey, input)
        });
      case "select":
        return jsxTJ.jsx(runtime2.SelectPropertyRow, {
          label: value2,
          title: ed2.whyDisabled,
          onReset,
          value: value3 ? MIXED_STYLE_CHOICE : styleStringValue(value) ?? "",
          placeholder: value3 ? runtime2.MIXED_LABEL : void 0,
          options: [
            {
              value: "",
              label: "默认"
            },
            ...styleEnumOptions(model.options)
          ],
          disabled: ed2.disabled,
          onChange: (input) => ed2.commit(propKey, input === "" ? void 0 : input)
        });
      case "color":
        return jsxTJ.jsx(runtime2.ColorTextPropertyRow, {
          label: value2,
          title: ed2.whyDisabled,
          onReset,
          value: styleStringValue(value),
          mixed: value3,
          disabled: ed2.disabled,
          swatches: ed2.swatches,
          popoverTitle: ed2.unifiedColorPopover ? runtime2.COLOR_LABEL : void 0,
          ...ed2.unifiedColorPopover && propKey === "backgroundColor" ? {
            allowNone: !0,
            onNone: () => ed2.clear([propKey, ...ed2.clearKeys?.[propKey] ?? []]),
            isNone: !value3 && [propKey, ...ed2.clearKeys?.[propKey] ?? []].every((input) => ownStyleProperty(ed2.bag, input) === void 0 && ed2.mixedKeys?.has(input) !== !0)
          } : {},
          trailing: StyleRemoveShorthandButton(ed2, propKey, value2),
          onChange: (input) => {
            if (input === void 0) {
              ed2.commit(propKey, void 0);
              return;
            }
            let value4 = validatedStyleColor(input);
            value4 !== void 0 && ed2.commit(propKey, value4);
          },
          ...validatedColorLiveProps(ed2, ed2.live ? (input) => ed2.live?.(propKey, input) : void 0)
        });
      case "text":
        return jsxTJ.jsx(StyleColorTextRow, {
          label: value2,
          value: styleStringValue(value),
          propKey,
          ed: ed2,
          onReset
        });
      case "size":
        return jsxTJ.jsx(StyleLengthRow, {
          label: value2,
          value,
          propKey,
          ed: ed2,
          onReset
        });
      case "compound":
        return jsxTJ.jsx(StyleRecordRow, {
          label: value2,
          shape: model.shape,
          value,
          propKey,
          ed: ed2,
          onReset
        });
      default:
        return null;
    }
  }
  function StyleRemoveShorthandButton(input, options, context) {
    let value = input.clearKeys?.[options];
    if (value === void 0)
      return;
    let items = [options, ...value];
    if (items.some((input2) => ownStyleProperty(input.bag, input2) !== void 0 || input.mixedKeys?.has(input2) === !0))
      return jsxTJ.jsx(runtime2.RemovePropertyButton, {
        label: context,
        disabled: input.disabled,
        onClick: () => input.clear(items)
      });
  }
  function validatedStyleColor(color) {
    let value = (0, runtime2.normalizeCssColor)(color);
    if (typeof value == "string")
      return value;
    if (value === !0)
      return color.trim().toLowerCase();
  }
  function StyleColorTextRow({ label, value, propKey, ed: ed2, onReset }) {
    return jsxTJ.jsx(runtime2.InspectorPropertyRow, {
      label,
      onReset,
      title: ed2.whyDisabled,
      onPress: (element) => element.querySelector("input")?.focus(),
      children: jsxTJ.jsx(runtime2.TextInput, {
        "aria-label": label,
        defaultValue: value ?? "",
        placeholder: "默认",
        disabled: ed2.disabled,
        onBlur: (input) => {
          let value2 = input.currentTarget.value.trim();
          ed2.commit(propKey, value2 === "" ? void 0 : value2);
        },
        onKeyDown: (input) => {
          input.key === "Enter" && input.currentTarget.blur(), input.key === "Escape" && (input.currentTarget.value = value ?? "", input.currentTarget.blur()), input.stopPropagation();
        }
      }, value ?? "")
    });
  }
  function StyleLengthRow({ label, value, propKey, ed: ed2, onReset }) {
    let value2 = styleRecordValue(value), value3 = value2 ? finiteStyleNumber(value2.pct) : void 0, value4 = value2 ? finiteStyleNumber(value2.px) : void 0, value5 = value3 !== void 0 ? "%" : "px", value6 = value3 ?? value4, value7 = value5 === "%" ? MIN_STYLE_PERCENT : 0, value8 = value5 === "%" ? MAX_STYLE_PERCENT : MAX_STYLE_LENGTH_PX;
    return jsxTJ.jsx(runtime2.NumberPropertyRow, {
      label,
      title: ed2.whyDisabled,
      onReset,
      value: value6,
      placeholder: "自动",
      clearable: !0,
      min: value7,
      max: value8,
      step: 1,
      unit: value5,
      units: STYLE_LENGTH_UNITS,
      onUnit: (input) => {
        value6 !== void 0 && ed2.commit(propKey, styleLengthValue(input, value6));
      },
      disabled: ed2.disabled,
      onValue: (input) => ed2.commit(propKey, input === void 0 ? void 0 : styleLengthValue(value5, input)),
      ...styleScrubProps(ed2, propKey, (input) => styleLengthValue(value5, input))
    });
  }
  function setRecordField(record, field, value) {
    if (value !== void 0)
      return {
        ...record,
        [field]: value
      };
    let { [field]: J, ...remainingProps } = record ?? {};
    if (Object.keys(remainingProps).length !== 0)
      return remainingProps;
  }
  function StyleRecordRow({ label, shape, value, propKey, ed: ed2, onReset }) {
    let value2 = styleRecordValue(value), callback = (input, options) => ed2.commit(propKey, setRecordField(value2, input, options)), callback2 = (input) => ed2.live && ed2.liveEnd ? (input2) => ed2.live?.(propKey, setRecordField(value2, input, input2)) : void 0;
    if (shape === "shadow") {
      let value4 = styleEffectRecords(value);
      return jsxTJ.jsx(reactL9.Fragment, {
        children: (value4.length > 0 ? value4 : [void 0]).map((input, options) => jsxTJ.jsx(ShadowStyleRow, {
          propKey,
          list: value4,
          index: options,
          rec: input,
          ed: ed2
        }, options))
      });
    }
    if (shape === "filter" || shape === "transform")
      return jsxTJ.jsx(NestedStylePopoverRow, {
        label,
        fields: shape === "filter" ? FILTER_FIELDS : TRANSFORM_FIELDS,
        propKey,
        rec: value2,
        ed: ed2,
        setField: callback,
        liveField: callback2
      });
    let value3 = value2 !== void 0;
    return jsxTJ.jsxs(reactL9.Fragment, {
      children: [
        jsxTJ.jsx(runtime2.TogglePropertyRow, {
          label,
          title: ed2.whyDisabled,
          onReset,
          checked: value3,
          disabled: ed2.disabled,
          onChange: (input) => ed2.commit(propKey, input ? defaultStylePropertyValue(propKey, ed2.kind) : void 0)
        }),
        value3 && jsxTJ.jsx("div", {
          className: "ml-3.5 flex flex-col border-l border-alpha-2 [--pp-label-w:66px]",
          children: jsxTJ.jsx(GradientStopsStyleEditor, {
            rec: value2,
            propKey,
            ed: ed2
          })
        })
      ]
    });
  }
  function useNestedStyleEditor(key, editor, index4 = 0) {
    let [value, value2] = reactL9.useState(void 0), value3 = editor.setOpenEditor !== void 0 ? editor.openEditor : value, value4 = editor.setOpenEditor ?? value2, value5 = value3?.key === key && value3.index === index4, [value6, value7] = reactL9.useState(!1), callback = (input) => value4((input2) => input ? {
      key,
      index: index4
    } : input2?.key === key && input2.index === index4 ? void 0 : input2), callback2 = () => value4((input) => input?.key !== key ? input : input.index === index4 ? void 0 : input.index > index4 ? {
      key,
      index: input.index - 1
    } : input), ref = reactL9.useRef(null);
    return {
      open: value5,
      setOpen: callback,
      removed: callback2,
      byKeyboard: value6,
      setByKeyboard: value7,
      wrapRef: ref,
      anchor: () => ref.current?.closest("[data-property-row]") ?? null
    };
  }
  function NestedStyleNumberRows({ fields, rec, setField, liveField, ed: ed2 }) {
    return jsxTJ.jsx(reactL9.Fragment, {
      children: fields.map((input) => {
        let value = liveField(input.field);
        return jsxTJ.jsx(runtime2.NumberPropertyRow, {
          label: input.label,
          value: finiteStyleNumber(rec[input.field]),
          placeholder: FILTER_PERCENT_FIELDS.has(input.field) ? "1" : "0",
          clearable: !0,
          min: input.min,
          max: input.max,
          step: input.step,
          unit: input.unit,
          disabled: ed2.disabled,
          onValue: (input2) => setField(input.field, input2 === void 0 ? void 0 : clampStyleField(input, input2)),
          ...value && ed2.liveEnd ? {
            onScrub: (input2) => value(clampStyleField(input, input2)),
            onScrubEnd: ed2.liveEnd
          } : {}
        }, input.field);
      })
    });
  }
  function normalizedShadowRecord(record, withSpread) {
    return {
      x: finiteStyleNumber(record.x) ?? 0,
      y: finiteStyleNumber(record.y) ?? 0,
      blur: finiteStyleNumber(record.blur) ?? 0,
      ...withSpread ? {
        spread: finiteStyleNumber(record.spread) ?? 0
      } : {},
      color: styleStringValue(record.color) ?? "#000000"
    };
  }
  function validatedShadowRecord(record, previous, withSpread, blurField) {
    let [value, value2, value3] = SHADOW_FIELDS, state = {
      x: clampStyleField(value, record.x),
      y: clampStyleField(value2, record.y),
      blur: clampStyleField(blurField ?? value3, record.blur),
      color: validatedStyleColor(record.color) ?? previous?.color ?? "#000000"
    };
    return withSpread && (state.spread = clampStyleField(SHADOW_SPREAD_FIELD, record.spread ?? 0)), previous?.inset === !0 && (state.inset = !0), state;
  }
  function ShadowStyleRow({ propKey, list, index: index4, rec, ed: ed2, label }) {
    let { open: open4, setOpen, removed, byKeyboard, setByKeyboard, wrapRef, anchor } = useNestedStyleEditor(propKey, ed2, index4), value = propKey === "boxShadow", value2 = label ?? styleEffectLabel(propKey, rec), value3 = rec !== void 0 ? normalizedShadowRecord(rec, value) : void 0, value4 = styleFieldDescriptor((0, runtime2.shadowSchemaBounds)(stylePropertyValidator(propKey, ed2.kind)), "blur", "Blur", "len", 1, "px"), value5 = value4.max === SHADOW_EDITOR_BOUNDS.blur?.max ? SHADOW_EDITOR_BOUNDS : {
      ...SHADOW_EDITOR_BOUNDS,
      blur: {
        min: value4.min,
        max: value4.max,
        step: value4.step
      }
    }, callback = (input) => {
      let value6 = input === void 0 ? list.filter((input2, options) => options !== index4) : list.map((input2, options) => options === index4 ? input : input2);
      if (value6.length !== 0)
        return value6;
    }, live = ed2.live;
    return jsxTJ.jsx(runtime2.InspectorPropertyRow, {
      label: value2,
      disabled: ed2.disabled,
      title: ed2.whyDisabled,
      trailing: jsxTJ.jsx(runtime2.RemovePropertyButton, {
        label: value2,
        disabled: ed2.disabled || rec === void 0,
        onClick: () => {
          removed(), ed2.commit(propKey, callback(void 0));
        }
      }),
      children: jsxTJ.jsx("span", {
        ref: wrapRef,
        className: "relative flex min-w-0 flex-1",
        children: jsxTJ.jsx(runtime2.PropertyPopover, {
          open: open4 && rec !== void 0,
          onOpenChange: setOpen,
          trigger: jsxTJ.jsx(runtime2.PropertyPopoverTrigger, {
            label: value2,
            color: value3?.color ?? null,
            text: value3 !== void 0 ? `${value3.x}, ${value3.y} · ${value3.blur}px` : "None",
            disabled: ed2.disabled,
            onClick: (input) => {
              rec === void 0 && ed2.commit(propKey, defaultStylePropertyValue(propKey, ed2.kind)), setByKeyboard(input.detail === 0);
            }
          }),
          anchor,
          focusOnOpen: byKeyboard,
          children: jsxTJ.jsx(runtime2.ShadowPropertyEditor, {
            title: value2,
            value: value3 ?? normalizedShadowRecord({}, value),
            spread: value,
            bounds: value5,
            disabled: ed2.disabled,
            swatches: ed2.swatches,
            unifiedPopover: ed2.unifiedColorPopover,
            onChange: (input) => ed2.commit(propKey, callback(validatedShadowRecord(input, rec, value, value4))),
            ...live && ed2.liveEnd ? {
              onLive: (input) => live(propKey, callback(validatedShadowRecord(input, rec, value, value4))),
              onLiveEnd: ed2.liveEnd
            } : {},
            onClose: () => setOpen(!1)
          })
        })
      })
    });
  }
  function BlurStyleRow({ label, propKey, rec, ed: ed2 }) {
    let value = FILTER_FIELDS.find((input) => input.field === "blur"), callback = (input) => setRecordField(rec, value.field, input), live = ed2.live;
    return jsxTJ.jsx(runtime2.NumberPropertyRow, {
      label,
      value: finiteStyleNumber(rec[value.field]),
      placeholder: "0",
      min: value.min,
      max: value.max,
      step: value.step,
      unit: value.unit,
      disabled: ed2.disabled,
      onValue: (input) => input !== void 0 && ed2.commit(propKey, callback(clampStyleField(value, input))),
      ...live && ed2.liveEnd ? {
        onScrub: (input) => live(propKey, callback(clampStyleField(value, input))),
        onScrubEnd: ed2.liveEnd
      } : {},
      trailing: jsxTJ.jsx(runtime2.RemovePropertyButton, {
        label,
        disabled: ed2.disabled,
        onClick: () => ed2.commit(propKey, callback(void 0))
      })
    });
  }
  function nestedStyleSummary(fields, record) {
    let value = fields.flatMap((input) => {
      let value2 = finiteStyleNumber(record[input.field]);
      return value2 === void 0 ? [] : [`${input.label} ${value2}${input.unit ?? ""}`];
    });
    return value.length > 0 ? value.join(" · ") : "None";
  }
  function NestedStylePopoverRow({ label, fields, propKey, rec, ed: ed2, setField, liveField }) {
    let { open: open4, setOpen, byKeyboard, setByKeyboard, wrapRef, anchor } = useNestedStyleEditor(propKey, ed2);
    return jsxTJ.jsx(runtime2.InspectorPropertyRow, {
      label,
      disabled: ed2.disabled,
      title: ed2.whyDisabled,
      trailing: jsxTJ.jsx(runtime2.RemovePropertyButton, {
        label,
        disabled: ed2.disabled || rec === void 0,
        onClick: () => {
          setOpen(!1), ed2.commit(propKey, void 0);
        }
      }),
      children: jsxTJ.jsx("span", {
        ref: wrapRef,
        className: "relative flex min-w-0 flex-1",
        children: jsxTJ.jsx(runtime2.PropertyPopover, {
          open: open4 && rec !== void 0,
          onOpenChange: setOpen,
          trigger: jsxTJ.jsx(runtime2.PropertyPopoverTrigger, {
            label,
            text: rec !== void 0 ? nestedStyleSummary(fields, rec) : "None",
            disabled: ed2.disabled,
            onClick: (input) => {
              rec === void 0 && ed2.commit(propKey, defaultStylePropertyValue(propKey, ed2.kind)), setByKeyboard(input.detail === 0);
            }
          }),
          anchor,
          focusOnOpen: byKeyboard,
          children: jsxTJ.jsx(runtime2.PropertyPopoverPanel, {
            title: label,
            labelWidth: "4.5rem",
            onClose: () => setOpen(!1),
            children: rec !== void 0 && jsxTJ.jsx(NestedStyleNumberRows, {
              fields,
              rec,
              setField,
              liveField,
              ed: ed2
            })
          })
        })
      })
    });
  }
  function gradientStopRecords(record) {
    return (Array.isArray(record.stops) ? record.stops : []).flatMap((input) => {
      let value = styleRecordValue(input), value2 = value ? styleStringValue(value.color) : void 0, value3 = value ? finiteStyleNumber(value.pos) : void 0;
      return value2 !== void 0 && value3 !== void 0 ? [
        {
          color: value2,
          pos: value3
        }
      ] : [];
    });
  }
  function sortedGradientStops(stops) {
    return [...stops].sort((input, options) => input.pos - options.pos);
  }
  function GradientPickerStyleEditor({ rec, propKey, ed: ed2 }) {
    let value = gradientStopRecords(rec), [value2, value3] = reactL9.useState(0), value4 = Math.min(value2, Math.max(0, value.length - 1)), callback = (input) => {
      let value7 = (0, runtime2.normalizeGradientStopPositions)(input);
      return input.map((input2, options) => ({
        color: input2.color,
        pos: clampStyleNumber(input2.pos ?? value7[options], 0, 100)
      }));
    }, callback2 = (input) => ed2.commit(propKey, {
      ...rec,
      stops: sortedGradientStops(callback(input))
    }), value5 = ed2.live && ed2.liveEnd ? (input) => ed2.live?.(propKey, {
      ...rec,
      stops: callback(input)
    }) : void 0, value6 = rec.radial === !0;
    return jsxTJ.jsx(runtime2.GradientEditor, {
      testid: "sp-gradient",
      radial: value6,
      onRadial: (input) => {
        let { radial: value7, ...value8 } = rec;
        ed2.commit(propKey, input ? {
          ...value8,
          radial: !0
        } : value8);
      },
      angle: finiteStyleNumber(rec.angle),
      onAngle: (input) => ed2.commit(propKey, {
        ...rec,
        angle: input === void 0 ? void 0 : clampStyleNumber(input, 0, 360)
      }),
      ...ed2.live && ed2.liveEnd ? {
        onAngleScrub: (input) => ed2.live?.(propKey, {
          ...rec,
          angle: clampStyleNumber(input, 0, 360)
        }),
        onAngleScrubEnd: ed2.liveEnd
      } : {},
      stops: value,
      selected: value4,
      onSelect: value3,
      onStops: callback2,
      ...value5 ? {
        onStopsLive: value5,
        onLiveEnd: ed2.liveEnd
      } : {},
      minStops: MIN_GRADIENT_STOPS,
      maxStops: MAX_GRADIENT_STOPS,
      disabled: ed2.disabled,
      renderStopPicker: (input) => jsxTJ.jsx(runtime2.ColorPicker, {
        value: value[input]?.color ?? "#000000",
        onChange: (input2) => {
          let value7 = validatedStyleColor(input2);
          if (value7 === void 0)
            return;
          let value8 = value.map((input3, options) => options === input ? {
            ...input3,
            color: value7
          } : input3);
          value5 ? value5(value8) : callback2(value8);
        },
        ...value5 ? {
          onPickEnd: (input2) => {
            ed2.liveEnd?.();
            let value7 = validatedStyleColor(input2);
            value7 !== void 0 && callback2(value.map((input3, options) => options === input ? {
              ...input3,
              color: value7
            } : input3));
          }
        } : {}
      })
    });
  }
  function GradientStopsStyleEditor({ rec, propKey, ed: ed2 }) {
    let value = gradientStopRecords(rec), callback = (input) => ed2.commit(propKey, {
      ...rec,
      stops: sortedGradientStops(input)
    }), value2 = ed2.live && ed2.liveEnd ? (input) => ed2.live?.(propKey, {
      ...rec,
      stops: input
    }) : void 0, callback2 = (input, options) => value.map((input2, options2) => options2 === input ? {
      ...input2,
      ...options
    } : input2), value3 = rec.radial === !0;
    return jsxTJ.jsxs(reactL9.Fragment, {
      children: [
        jsxTJ.jsx(runtime2.TogglePropertyRow, {
          label: "径向",
          checked: value3,
          disabled: ed2.disabled,
          onChange: (input) => {
            let { radial: value4, ...value5 } = rec;
            ed2.commit(propKey, input ? {
              ...value5,
              radial: !0
            } : value5);
          }
        }),
        jsxTJ.jsx(runtime2.NumberPropertyRow, {
          label: "角度",
          value: finiteStyleNumber(rec.angle),
          placeholder: "180",
          clearable: !0,
          min: 0,
          max: 360,
          step: 1,
          unit: "°",
          disabled: ed2.disabled || value3,
          onValue: (input) => ed2.commit(propKey, {
            ...rec,
            angle: input === void 0 ? void 0 : clampStyleNumber(input, 0, 360)
          }),
          ...styleScrubProps(ed2, propKey, (input) => ({
            ...rec,
            angle: clampStyleNumber(input, 0, 360)
          }))
        }),
        value.map((input, options) => jsxTJ.jsxs(reactL9.Fragment, {
          children: [
            jsxTJ.jsx(runtime2.ColorTextPropertyRow, {
              label: "色标 " + String(options + 1),
              value: input.color,
              disabled: ed2.disabled,
              popoverTitle: ed2.unifiedColorPopover ? runtime2.COLOR_LABEL : void 0,
              onChange: (input2) => {
                if (input2 === void 0)
                  return;
                let value4 = validatedStyleColor(input2);
                value4 !== void 0 && callback(callback2(options, {
                  color: value4
                }));
              },
              ...validatedColorLiveProps(ed2, value2 ? (input2) => value2(callback2(options, {
                color: input2
              })) : void 0)
            }),
            jsxTJ.jsx(runtime2.NumberPropertyRow, {
              label: "位置 " + String(options + 1),
              value: input.pos,
              min: 0,
              max: 100,
              step: 1,
              unit: "%",
              disabled: ed2.disabled,
              onValue: (input2) => callback(callback2(options, {
                pos: clampStyleNumber(input2 ?? 0, 0, 100)
              })),
              ...value2 && ed2.liveEnd ? {
                onScrub: (input2) => value2(callback2(options, {
                  pos: clampStyleNumber(input2, 0, 100)
                })),
                onScrubEnd: () => {
                  ed2.liveEnd?.(), callback(value);
                }
              } : {}
            }),
            value.length > MIN_GRADIENT_STOPS && jsxTJ.jsx(runtime2.InspectorPropertyRow, {
              label: "色标 " + String(options + 1),
              children: jsxTJ.jsx(runtime2.Button, {
                variant: "ghost",
                size: "sm",
                disabled: ed2.disabled,
                onClick: () => callback(value.filter((input2, options2) => options2 !== options)),
                children: "移除色标"
              })
            })
          ]
        }, String(options))),
        value.length < MAX_GRADIENT_STOPS && jsxTJ.jsx(runtime2.InspectorPropertyRow, {
          label: "色标",
          children: jsxTJ.jsx(runtime2.Button, {
            variant: "ghost",
            size: "sm",
            icon: "Add",
            disabled: ed2.disabled,
            onClick: () => {
              let value4 = value[value.length - 1] ?? {
                color: "#000000",
                pos: 100
              }, value5 = value[value.length - 2] ?? {
                color: "#ffffff",
                pos: 0
              };
              callback([
                ...value,
                {
                  color: value4.color,
                  pos: clampStyleNumber((value4.pos + value5.pos) / 2 + 25, 0, 100)
                }
              ]);
            },
            children: "添加色标"
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactL9", () => reactL9, (value) => {
    reactL9 = value;
  }), bindRuntimeValue(runtime2, "jsxTJ", () => jsxTJ, (value) => {
    jsxTJ = value;
  }), bindRuntimeValue(runtime2, "propertyValidatorKind", () => propertyValidatorKind), bindRuntimeValue(runtime2, "propertyValidatorNumber", () => propertyValidatorNumber), bindRuntimeValue(runtime2, "propertyValidatorStringArray", () => propertyValidatorStringArray), bindRuntimeValue(runtime2, "stylePropertyValidator", () => stylePropertyValidator), bindRuntimeValue(runtime2, "MAX_INLINE_ENUM_CHOICES", () => MAX_INLINE_ENUM_CHOICES, (value) => {
    MAX_INLINE_ENUM_CHOICES = value;
  }), bindRuntimeValue(runtime2, "MAX_INLINE_ENUM_LABEL_LENGTH", () => MAX_INLINE_ENUM_LABEL_LENGTH, (value) => {
    MAX_INLINE_ENUM_LABEL_LENGTH = value;
  }), bindRuntimeValue(runtime2, "enumChoicesFitInline", () => enumChoicesFitInline, (value) => {
    enumChoicesFitInline = value;
  }), bindRuntimeValue(runtime2, "stylePropertyRowModel", () => stylePropertyRowModel), bindRuntimeValue(runtime2, "STYLE_GROUP_ORDER", () => STYLE_GROUP_ORDER, (value) => {
    STYLE_GROUP_ORDER = value;
  }), bindRuntimeValue(runtime2, "stylePropertyGroup", () => stylePropertyGroup), bindRuntimeValue(runtime2, "HIDDEN_STYLE_PROPERTY_KEYS", () => HIDDEN_STYLE_PROPERTY_KEYS, (value) => {
    HIDDEN_STYLE_PROPERTY_KEYS = value;
  }), bindRuntimeValue(runtime2, "stylePropertyGroups", () => stylePropertyGroups), bindRuntimeValue(runtime2, "setStyleProperty", () => setStyleProperty), bindRuntimeValue(runtime2, "deleteStyleProperty", () => deleteStyleProperty), bindRuntimeValue(runtime2, "STYLE_SHORTHAND_LONGHANDS", () => STYLE_SHORTHAND_LONGHANDS, (value) => {
    STYLE_SHORTHAND_LONGHANDS = value;
  }), bindRuntimeValue(runtime2, "setStyleShorthand", () => setStyleShorthand), bindRuntimeValue(runtime2, "styleShorthandPatch", () => styleShorthandPatch), bindRuntimeValue(runtime2, "normalizeNegativeZero", () => normalizeNegativeZero), bindRuntimeValue(runtime2, "clampValidatorNumber", () => clampValidatorNumber), bindRuntimeValue(runtime2, "clampStyleNumber", () => clampStyleNumber), bindRuntimeValue(runtime2, "numericValidator", () => numericValidator), bindRuntimeValue(runtime2, "STYLE_LENGTH_UNITS", () => STYLE_LENGTH_UNITS, (value) => {
    STYLE_LENGTH_UNITS = value;
  }), bindRuntimeValue(runtime2, "MAX_STYLE_LENGTH_PX", () => MAX_STYLE_LENGTH_PX, (value) => {
    MAX_STYLE_LENGTH_PX = value;
  }), bindRuntimeValue(runtime2, "MIN_STYLE_PERCENT", () => MIN_STYLE_PERCENT, (value) => {
    MIN_STYLE_PERCENT = value;
  }), bindRuntimeValue(runtime2, "MAX_STYLE_PERCENT", () => MAX_STYLE_PERCENT, (value) => {
    MAX_STYLE_PERCENT = value;
  }), bindRuntimeValue(runtime2, "styleLengthValue", () => styleLengthValue), bindRuntimeValue(runtime2, "styleFieldDescriptor", () => styleFieldDescriptor), bindRuntimeValue(runtime2, "SHADOW_FIELDS", () => SHADOW_FIELDS, (value) => {
    SHADOW_FIELDS = value;
  }), bindRuntimeValue(runtime2, "SHADOW_SPREAD_FIELD", () => SHADOW_SPREAD_FIELD, (value) => {
    SHADOW_SPREAD_FIELD = value;
  }), bindRuntimeValue(runtime2, "FILTER_FIELDS", () => FILTER_FIELDS, (value) => {
    FILTER_FIELDS = value;
  }), bindRuntimeValue(runtime2, "FILTER_PERCENT_FIELDS", () => FILTER_PERCENT_FIELDS, (value) => {
    FILTER_PERCENT_FIELDS = value;
  }), bindRuntimeValue(runtime2, "TRANSFORM_FIELDS", () => TRANSFORM_FIELDS, (value) => {
    TRANSFORM_FIELDS = value;
  }), bindRuntimeValue(runtime2, "MIN_GRADIENT_STOPS", () => MIN_GRADIENT_STOPS, (value) => {
    MIN_GRADIENT_STOPS = value;
  }), bindRuntimeValue(runtime2, "MAX_GRADIENT_STOPS", () => MAX_GRADIENT_STOPS, (value) => {
    MAX_GRADIENT_STOPS = value;
  }), bindRuntimeValue(runtime2, "clampStyleField", () => clampStyleField), bindRuntimeValue(runtime2, "defaultStylePropertyValue", () => defaultStylePropertyValue), bindRuntimeValue(runtime2, "defaultShadowValue", () => defaultShadowValue), bindRuntimeValue(runtime2, "ownStyleProperty", () => ownStyleProperty), bindRuntimeValue(runtime2, "finiteStyleNumber", () => finiteStyleNumber), bindRuntimeValue(runtime2, "styleStringValue", () => styleStringValue), bindRuntimeValue(runtime2, "styleRecordValue", () => styleRecordValue), bindRuntimeValue(runtime2, "styleEffectRecords", () => styleEffectRecords), bindRuntimeValue(runtime2, "STYLE_PROPERTY_LABELS", () => STYLE_PROPERTY_LABELS, (value) => {
    STYLE_PROPERTY_LABELS = value;
  }), bindRuntimeValue(runtime2, "BLUR_EFFECT_LABELS", () => BLUR_EFFECT_LABELS, (value) => {
    BLUR_EFFECT_LABELS = value;
  }), bindRuntimeValue(runtime2, "styleEffectLabel", () => styleEffectLabel), bindRuntimeValue(runtime2, "stylePropertyLabel", () => stylePropertyLabel), bindRuntimeValue(runtime2, "STYLE_ENUM_VALUE_LABELS", () => STYLE_ENUM_VALUE_LABELS, (value) => {
    STYLE_ENUM_VALUE_LABELS = value;
  }), bindRuntimeValue(runtime2, "styleEnumValueLabel", () => styleEnumValueLabel), bindRuntimeValue(runtime2, "styleEnumOptions", () => styleEnumOptions), bindRuntimeValue(runtime2, "styleValuesEqual", () => styleValuesEqual), bindRuntimeValue(runtime2, "changedStyleProperty", () => changedStyleProperty), bindRuntimeValue(runtime2, "createStyleEditor", () => createStyleEditor), bindRuntimeValue(runtime2, "StyleInspector", () => StyleInspector), bindRuntimeValue(runtime2, "MAX_STYLE_EFFECT_ADD_CHOICES", () => MAX_STYLE_EFFECT_ADD_CHOICES, (value) => {
    MAX_STYLE_EFFECT_ADD_CHOICES = value;
  }), bindRuntimeValue(runtime2, "INNER_TEXT_SHADOW_DISABLED_REASON", () => INNER_TEXT_SHADOW_DISABLED_REASON, (value) => {
    INNER_TEXT_SHADOW_DISABLED_REASON = value;
  }), bindRuntimeValue(runtime2, "SHAPE_SHADOW_DISABLED_REASON", () => SHAPE_SHADOW_DISABLED_REASON, (value) => {
    SHAPE_SHADOW_DISABLED_REASON = value;
  }), bindRuntimeValue(runtime2, "styleEffectAddItems", () => styleEffectAddItems), bindRuntimeValue(runtime2, "shadowStyleKey", () => shadowStyleKey), bindRuntimeValue(runtime2, "STYLE_EFFECT_KEYS", () => STYLE_EFFECT_KEYS, (value) => {
    STYLE_EFFECT_KEYS = value;
  }), bindRuntimeValue(runtime2, "StyleEffectsInspector", () => StyleEffectsInspector), bindRuntimeValue(runtime2, "StylePropertyRow", () => StylePropertyRow), bindRuntimeValue(runtime2, "styleScrubProps", () => styleScrubProps), bindRuntimeValue(runtime2, "styleLiveColorProps", () => styleLiveColorProps), bindRuntimeValue(runtime2, "validatedColorLiveProps", () => validatedColorLiveProps), bindRuntimeValue(runtime2, "StyleValueRow", () => StyleValueRow), bindRuntimeValue(runtime2, "MIXED_STYLE_CHOICE", () => MIXED_STYLE_CHOICE, (value) => {
    MIXED_STYLE_CHOICE = value;
  }), bindRuntimeValue(runtime2, "StyleRemoveShorthandButton", () => StyleRemoveShorthandButton), bindRuntimeValue(runtime2, "validatedStyleColor", () => validatedStyleColor), bindRuntimeValue(runtime2, "StyleColorTextRow", () => StyleColorTextRow), bindRuntimeValue(runtime2, "StyleLengthRow", () => StyleLengthRow), bindRuntimeValue(runtime2, "setRecordField", () => setRecordField), bindRuntimeValue(runtime2, "StyleRecordRow", () => StyleRecordRow), bindRuntimeValue(runtime2, "useNestedStyleEditor", () => useNestedStyleEditor), bindRuntimeValue(runtime2, "NestedStyleNumberRows", () => NestedStyleNumberRows), bindRuntimeValue(runtime2, "SHADOW_EDITOR_BOUNDS", () => SHADOW_EDITOR_BOUNDS, (value) => {
    SHADOW_EDITOR_BOUNDS = value;
  }), bindRuntimeValue(runtime2, "normalizedShadowRecord", () => normalizedShadowRecord), bindRuntimeValue(runtime2, "validatedShadowRecord", () => validatedShadowRecord), bindRuntimeValue(runtime2, "ShadowStyleRow", () => ShadowStyleRow), bindRuntimeValue(runtime2, "BlurStyleRow", () => BlurStyleRow), bindRuntimeValue(runtime2, "nestedStyleSummary", () => nestedStyleSummary), bindRuntimeValue(runtime2, "NestedStylePopoverRow", () => NestedStylePopoverRow), bindRuntimeValue(runtime2, "gradientStopRecords", () => gradientStopRecords), bindRuntimeValue(runtime2, "sortedGradientStops", () => sortedGradientStops), bindRuntimeValue(runtime2, "GradientPickerStyleEditor", () => GradientPickerStyleEditor), bindRuntimeValue(runtime2, "GradientStopsStyleEditor", () => GradientStopsStyleEditor), () => {
    (0, runtime2.initializeTypographyInference)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeUiPointerMedia)(), (0, runtime2.initializeUiPropertyLabels)(), (0, runtime2.initializeUiInputs210)(), reactL9 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeStyleSchema)(), jsxTJ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MAX_INLINE_ENUM_CHOICES = 4, MAX_INLINE_ENUM_LABEL_LENGTH = 20, enumChoicesFitInline = (values) => values.reduce((input, options) => input + styleEnumValueLabel(options).length, 0) <= MAX_INLINE_ENUM_LABEL_LENGTH, STYLE_GROUP_ORDER = [
      "Typography",
      "Color & fill",
      "Spacing",
      "Border",
      "Size",
      "Layout",
      "Effects"
    ], HIDDEN_STYLE_PROPERTY_KEYS = /* @__PURE__ */ new Set([
      "visibility",
      "pointerEvents",
      "borderSides",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius"
    ]), STYLE_SHORTHAND_LONGHANDS = {
      borderWidth: [
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth"
      ],
      borderRadius: [
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderBottomRightRadius",
        "borderBottomLeftRadius"
      ]
    }, STYLE_LENGTH_UNITS = ["px", "%"], MAX_STYLE_LENGTH_PX = 4e3, MIN_STYLE_PERCENT = 1, MAX_STYLE_PERCENT = 100, SHADOW_FIELDS = [
      styleFieldDescriptor(runtime2.defaultShadowBounds, "x", "X", "len", 1, "px"),
      styleFieldDescriptor(runtime2.defaultShadowBounds, "y", "Y", "len", 1, "px"),
      styleFieldDescriptor(runtime2.defaultShadowBounds, "blur", "Blur", "len", 1, "px")
    ], SHADOW_SPREAD_FIELD = styleFieldDescriptor(runtime2.defaultShadowBounds, "spread", "Spread", "len", 1, "px"), FILTER_FIELDS = [
      styleFieldDescriptor(runtime2.filterBounds, "blur", "Blur", "len", 0.5, "px"),
      styleFieldDescriptor(runtime2.filterBounds, "brightness", "Brightness", "num", 0.05),
      styleFieldDescriptor(runtime2.filterBounds, "contrast", "Contrast", "num", 0.05),
      styleFieldDescriptor(runtime2.filterBounds, "saturate", "Saturate", "num", 0.05),
      styleFieldDescriptor(runtime2.filterBounds, "grayscale", "Grayscale", "num", 0.05),
      styleFieldDescriptor(runtime2.filterBounds, "sepia", "Sepia", "num", 0.05),
      styleFieldDescriptor(runtime2.filterBounds, "invert", "Invert", "num", 0.05),
      styleFieldDescriptor(runtime2.filterBounds, "hueRotate", "Hue", "num", 1, "°")
    ], FILTER_PERCENT_FIELDS = /* @__PURE__ */ new Set([
      "brightness",
      "contrast",
      "saturate",
      "scale"
    ]), TRANSFORM_FIELDS = [
      styleFieldDescriptor(runtime2.transformBounds, "translateX", "水平位移", "len", 1, "px"),
      styleFieldDescriptor(runtime2.transformBounds, "translateY", "垂直位移", "len", 1, "px"),
      styleFieldDescriptor(runtime2.transformBounds, "scale", "Scale", "num", 0.05),
      styleFieldDescriptor(runtime2.transformBounds, "rotate", "Rotate", "num", 1, "°"),
      styleFieldDescriptor(runtime2.transformBounds, "skewX", "水平倾斜", "num", 1, "°"),
      styleFieldDescriptor(runtime2.transformBounds, "skewY", "垂直倾斜", "num", 1, "°")
    ], MIN_GRADIENT_STOPS = 2, MAX_GRADIENT_STOPS = 8, STYLE_PROPERTY_LABELS = {
      textAlign: "Align",
      textDecorationLine: "Decoration",
      textDecorationStyle: "线条样式",
      textDecorationColor: "线条颜色",
      textTransform: "Case",
      fontFamily: "Family",
      fontVariantNumeric: "Numerals",
      letterSpacing: "字间距",
      textStrokeWidth: "描边宽度",
      textStrokeColor: "描边颜色",
      backgroundColor: "Background",
      backgroundGradient: "Gradient",
      boxShadow: "外阴影",
      backdropFilter: "Backdrop",
      mixBlendMode: "混合模式"
    }, BLUR_EFFECT_LABELS = {
      filter: "图层模糊",
      backdropFilter: "背景模糊"
    }, STYLE_ENUM_VALUE_LABELS = {
      "line-through": "Strikethrough",
      "tabular-nums": "等宽数字"
    }, MAX_STYLE_EFFECT_ADD_CHOICES = 4, INNER_TEXT_SHADOW_DISABLED_REASON = "文字需要填充或边框才能使用内阴影", SHAPE_SHADOW_DISABLED_REASON = "不适用于菱形或箭头形状", STYLE_EFFECT_KEYS = ["boxShadow", "filter", "backdropFilter"], MIXED_STYLE_CHOICE = "\0mixed", SHADOW_EDITOR_BOUNDS = Object.fromEntries([...SHADOW_FIELDS, SHADOW_SPREAD_FIELD].map((input) => [
      input.field,
      {
        min: input.min,
        max: input.max,
        step: input.step
      }
    ]));
  };
}
export {
  installUiStyleInspector
};
