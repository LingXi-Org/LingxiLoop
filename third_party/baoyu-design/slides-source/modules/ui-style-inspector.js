// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiStyleInspector(runtime2) {
  var reactL9, jsxTJ, MAX_INLINE_ENUM_CHOICES, MAX_INLINE_ENUM_WIDTH, INLINE_ENUM_OPTION_PADDING, enumLabelWidth, enumChoicesFitInline, STYLE_GROUP_ORDER, STYLE_GROUP_TITLES, HIDDEN_STYLE_PROPERTY_KEYS, STYLE_SHORTHAND_LONGHANDS, STYLE_LENGTH_UNITS, MAX_STYLE_LENGTH_PX, MIN_STYLE_PERCENT, MAX_STYLE_PERCENT, SHADOW_FIELDS, SHADOW_SPREAD_FIELD, FILTER_FIELDS, FILTER_PERCENT_FIELDS, TRANSFORM_FIELDS, MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS, STYLE_EFFECT_WORDS, STYLE_PROPERTY_LABELS, BLUR_EFFECT_WORDS, STYLE_ENUM_VALUE_LABELS_BY_KEY, STYLE_ENUM_VALUE_LABELS, MAX_STYLE_EFFECT_ADD_CHOICES, INNER_TEXT_SHADOW_DISABLED_REASON, SHAPE_SHADOW_DISABLED_REASON, STYLE_EFFECT_KEYS, MIXED_STYLE_CHOICE, SHADOW_EDITOR_BOUNDS, NESTED_STYLE_REMOVE_LABELS, STYLE_COLOR_REMOVE_LABELS;
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
  function stylePropertyRowModel(validator, coarse, key) {
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
        let value2 = propertyValidatorStringArray(validator, "values"), shown = styleEnumOptions(value2, key);
        return value2.length <= MAX_INLINE_ENUM_CHOICES && !coarse && enumChoicesFitInline(shown) ? {
          row: "segmented",
          options: value2,
          shown
        } : {
          row: "select",
          options: value2,
          shown
        };
      }
      case "color":
        return {
          row: "color"
        };
      case "fontFamily": {
        let value2 = ["sans", "serif", "mono", "helvetica"];
        return {
          row: "select",
          options: value2,
          shown: styleEnumOptions(value2, key)
        };
      }
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
    return /shadow|filter|blend/i.test(property) || property === "transform" ? "Effects" : property === "color" || /^(font|line|letter|text|white|word)/.test(property) ? "Typography" : /^(background|opacity)/.test(property) ? "颜色和填充" : /^(padding|margin|gap)/.test(property) ? "Spacing" : /^(border|outline|radius)/.test(property) ? "Border" : /(width|height)$/i.test(property) ? "Size" : "Layout";
  }
  function stylePropertyGroups(kind, coarse) {
    let entries = /* @__PURE__ */ new Map();
    for (let value of runtime2.stylePropertyNames) {
      if (HIDDEN_STYLE_PROPERTY_KEYS.has(value) || !(0, runtime2.stylePropertyAppliesToNode)(value, kind))
        continue;
      let value2 = stylePropertyRowModel(stylePropertyValidator(value, kind), coarse, value);
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
  function styleFieldDescriptor(bounds, field, kind, step, unit) {
    let value = bounds[field];
    if (value === void 0)
      throw Error(`style panel: no validator range for field ${field}`);
    return unit === void 0 ? {
      field,
      min: value.min,
      max: value.max,
      step,
      kind
    } : {
      field,
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
  function shadowEffectWords(key, value) {
    if ( key === "boxShadow")
      return styleRecordValue(value)?.inset === !0 ? STYLE_EFFECT_WORDS.inner : STYLE_EFFECT_WORDS.drop;
    if (key === "textShadow")
      return STYLE_EFFECT_WORDS.text;
    throw Error(`style panel: no words for the shadow key ${key}`);
  }
  function stylePropertyLabel(key) {
    let value = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  function styleKeyLabel(key) {
    return ( Object.hasOwn(STYLE_PROPERTY_LABELS, key) ? STYLE_PROPERTY_LABELS[key] : void 0) ?? stylePropertyLabel(key);
  }
  function styleKeyedEnumValueLabel (value, key) {
    let labels = key !== void 0 && Object.hasOwn(STYLE_ENUM_VALUE_LABELS_BY_KEY, key) ? STYLE_ENUM_VALUE_LABELS_BY_KEY[key] : void 0;
    return labels !== void 0 && Object.hasOwn(labels, value) ? labels[value] : void 0;
  }
  function styleEnumValueLabel(value, key) {
    let value2 = styleKeyedEnumValueLabel(value, key);
    if (value2 !== void 0)
      return value2;
    let value3 = Object.hasOwn(STYLE_ENUM_VALUE_LABELS, value) ? STYLE_ENUM_VALUE_LABELS[value] : void 0;
    if (value3 !== void 0)
      return value3;
    let value4 = value.replace(/-/g, " ");
    return value4.charAt(0).toUpperCase() + value4.slice(1);
  }
  function styleEnumOptions(values, key) {
    return values.map((input) => ({
      value: input,
      label: styleEnumValueLabel(input, key)
    }));
  }
  function styleDefaultHint() {
    return (0, runtime2.formatMessage)({
      defaultMessage: "默认",
      id: "6MzqzU/AXB"
    });
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
            title: STYLE_GROUP_TITLES[ input.group],
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
          title: STYLE_GROUP_TITLES[ input.group],
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
      let value2 = styleEffectRecords(ownStyleProperty(bag, value)), maxReason = (0, runtime2.formatMessage)({
        defaultMessage: "每个元素最多 {count} 个",
        id: "RxKT669wy4"
      }, {
        n: runtime2.maxShadowCount,
        count: String(runtime2.maxShadowCount)
      }), value3 = value2.length >= runtime2.maxShadowCount ? {
        disabled: !0,
        disabledReason: maxReason
      } : {}, callback = (input) => () => commit(value, [...value2, defaultShadowValue(value, input)]), value4 = canInset ?? (value2.length >= runtime2.maxShadowCount ? maxReason : void 0);
      items.push(value4 !== void 0 ? {
        label: STYLE_EFFECT_WORDS.drop.label,
        onSelect: () => {
        },
        disabled: !0,
        disabledReason: value4
      } : {
        label: STYLE_EFFECT_WORDS.drop.label,
        onSelect: callback(!1)
      }), items.push(value === "textShadow" ? {
        label: STYLE_EFFECT_WORDS.inner.label,
        onSelect: () => {
        },
        disabled: !0,
        disabledReason: mixed ? dropShadowReason : INNER_TEXT_SHADOW_DISABLED_REASON
      } : {
        label: STYLE_EFFECT_WORDS.inner.label,
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
        label: BLUR_EFFECT_WORDS[value2].label,
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
    let value4 = shadowStyleKey(kind, shadowTarget) === "textShadow" ? ["boxShadow", "textShadow"] : ["boxShadow"], callback = (input, options) => shadowTarget !== "text" ? shadowEffectWords(input, options) : input === "textShadow" ? STYLE_EFFECT_WORDS.drop : input === "boxShadow" ? styleRecordValue(options)?.inset === !0 ? STYLE_EFFECT_WORDS.inner : STYLE_EFFECT_WORDS.box : shadowEffectWords(input, options);
    return jsxTJ.jsxs(runtime2.PropertySection, {
      title: STYLE_GROUP_TITLES.Effects,
      subsection,
      iconColumn: !0,
      actions: jsxTJ.jsx(runtime2.PropertySectionActions, {
        "aria-label": (0, runtime2.formatMessage)({
          defaultMessage: "添加到效果",
          id: "Fe6Kkszb1D"
        }),
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
            words: callback(input, input2)
          }, input + String(options)));
        }),
        blurRows && ["filter", "backdropFilter"].map((input) => {
          let value5 = styleRecordValue(ownStyleProperty(bag, input));
          return value5?.blur !== void 0 && (0, runtime2.stylePropertyAppliesToNode)(input, kind) ? jsxTJ.jsx(BlurStyleRow, {
            words: BLUR_EFFECT_WORDS[input],
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
    let value2 = styleKeyLabel(propKey), value3 = ed2.mixedKeys?.has(propKey) === !0;
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
          hint: styleDefaultHint(),
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
          options:model.shown,
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
          mutedPlaceholder: value3,
          options: [
            {
              value: "",
              label: (0, runtime2.formatMessage)({
                defaultMessage: "默认",
                id: "GBtNOyRjWe"
              })
            },
            ...model.shown
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
          trailing: StyleRemoveShorthandButton(ed2, propKey),
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
  function requiredRemoveName(names, key) {
    let value = names[key];
    if (value === void 0)
      throw Error(`style panel: no name for the minus button of ${key}`);
    return value;
  }
  function StyleRemoveShorthandButton(input, options) {
    let value = input.clearKeys?.[options];
    if (value === void 0)
      return;
    let items = [options, ...value];
    if (items.some((input2) => ownStyleProperty(input.bag, input2) !== void 0 || input.mixedKeys?.has(input2) === !0))
      return jsxTJ.jsx(runtime2.RemovePropertyButton, {
        name: requiredRemoveName(STYLE_COLOR_REMOVE_LABELS, options),
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
        placeholder: styleDefaultHint(),
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
      placeholder: (0, runtime2.formatMessage)({
        defaultMessage: "自动",
        id: "7vYVnNC2kc"
      }),
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
          label: input.label(),
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
  function shadowSummary(shadow) {
    return (0, runtime2.formatMessage)({ defaultMessage: "{x}, {y} · {blur}px", id: "6/5yrEPsLg" }, {
      x: String(shadow.x),
      y: String(shadow.y),
      blur: String(shadow.blur)
    });
  }
  function ShadowStyleRow({ propKey, list, index: index4, rec, ed: ed2,
    words }) {
    let { open: open4, setOpen, removed, byKeyboard, setByKeyboard, wrapRef, anchor } = useNestedStyleEditor(propKey, ed2, index4), value = propKey === "boxShadow", { label: value2, remove: removeName } = words ?? shadowEffectWords(propKey, rec), value3 = rec !== void 0 ? normalizedShadowRecord(rec, value) : void 0, value4 = styleFieldDescriptor((0, runtime2.shadowSchemaBounds)(stylePropertyValidator(propKey, ed2.kind)), "blur", "len", 1, "px"), value5 = value4.max === SHADOW_EDITOR_BOUNDS.blur?.max ? SHADOW_EDITOR_BOUNDS : {
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
        name: removeName,
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
            text: value3 !== void 0 ? shadowSummary(value3) : (0, runtime2.formatMessage)({
              defaultMessage : "无",
              id: "ZkF/z0lteb"
            }),
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
  function BlurStyleRow({
    words: { label, remove: removeName }, propKey, rec, ed: ed2 }) {
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
        name: removeName,
        disabled: ed2.disabled,
        onClick: () => ed2.commit(propKey, callback(void 0))
      })
    });
  }
  function styleNoneLabel() {
    return (0, runtime2.formatMessage)({
      defaultMessage: "无",
      id: "jog26oOR/X"
    });
  }
  function nestedStyleSummary(fields, record) {
    let value = fields.flatMap((input) => {
      let value2 = finiteStyleNumber(record[input.field]);
      return value2 === void 0 ? [] : [
        (0, runtime2.formatMessage)({ defaultMessage: "{label} {amount}", id: "E7Ti+CBQVm" }, {
          label:input.label(),
          amount: String(value2) + (input.unit ?? "")
        })];
    });
    return value.length > 0 ? value.join(" · ") : styleNoneLabel();
  }
  function NestedStylePopoverRow({ label, fields, propKey, rec, ed: ed2, setField, liveField }) {
    let { open: open4, setOpen, byKeyboard, setByKeyboard, wrapRef, anchor } = useNestedStyleEditor(propKey, ed2), removeName = requiredRemoveName(NESTED_STYLE_REMOVE_LABELS, propKey);
    return jsxTJ.jsx(runtime2.InspectorPropertyRow, {
      label,
      disabled: ed2.disabled,
      title: ed2.whyDisabled,
      trailing: jsxTJ.jsx(runtime2.RemovePropertyButton, {
        name: removeName,
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
            text: rec !== void 0 ? nestedStyleSummary(fields, rec) : styleNoneLabel(),
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
    } : input2), value3 = rec.radial === !0, stopLabel = (index4) => (0, runtime2.formatMessage)({ defaultMessage: "色标 {n}", id: "hftOcXqRcC" }, { n: String(index4 + 1) });
    return jsxTJ.jsxs(reactL9.Fragment, {
      children: [
        jsxTJ.jsx(runtime2.TogglePropertyRow, {
          label: (0, runtime2.formatMessage)({
            defaultMessage: "径向",
            id: "VX+W6hB1F+"
          }),
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
          label: (0, runtime2.formatMessage)({
            defaultMessage: "角度",
            id: "7aZE5V71r0"
          }),
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
              label: stopLabel(options),
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
              label: (0, runtime2.formatMessage)({ defaultMessage: "位置 {n}", id: "SabruP7ZaA" }, { n: String(options + 1) }),
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
              label: stopLabel(options),
              children: jsxTJ.jsx(runtime2.Button, {
                variant: "ghost",
                size: "sm",
                disabled: ed2.disabled,
                onClick: () => callback(value.filter((input2, options2) => options2 !== options)),
                children: (0, runtime2.formatMessage)({
                  defaultMessage: "移除色标",
                  id: "FFU419aM//"
                })
              })
            })
          ]
        }, String(options))),
        value.length < MAX_GRADIENT_STOPS && jsxTJ.jsx(runtime2.InspectorPropertyRow, {
          label: (0, runtime2.formatMessage)({
            defaultMessage: "色标",
            id: "e/a9NHAmuE"
          }),
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
            children: (0, runtime2.formatMessage)({
              defaultMessage: "添加色标",
              id: "JCQSIxApp6"
            })
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
  }), bindRuntimeValue(runtime2, "MAX_INLINE_ENUM_WIDTH", () => MAX_INLINE_ENUM_WIDTH, (value) => {
    MAX_INLINE_ENUM_WIDTH = value;
  }), bindRuntimeValue(runtime2, "INLINE_ENUM_OPTION_PADDING", () => INLINE_ENUM_OPTION_PADDING, (value) => {
    INLINE_ENUM_OPTION_PADDING = value;
  }), bindRuntimeValue(runtime2, "enumLabelWidth", () => enumLabelWidth, (value) => {
    enumLabelWidth = value;
  }), bindRuntimeValue(runtime2, "enumChoicesFitInline", () => enumChoicesFitInline, (value) => {
    enumChoicesFitInline = value;
  }), bindRuntimeValue(runtime2, "stylePropertyRowModel", () => stylePropertyRowModel), bindRuntimeValue(runtime2, "STYLE_GROUP_ORDER", () => STYLE_GROUP_ORDER, (value) => {
    STYLE_GROUP_ORDER = value;
  }), bindRuntimeValue(runtime2, "STYLE_GROUP_TITLES", () => STYLE_GROUP_TITLES, (value) => {
    STYLE_GROUP_TITLES = value;
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
  }), bindRuntimeValue(runtime2, "clampStyleField", () => clampStyleField), bindRuntimeValue(runtime2, "defaultStylePropertyValue", () => defaultStylePropertyValue), bindRuntimeValue(runtime2, "defaultShadowValue", () => defaultShadowValue), bindRuntimeValue(runtime2, "ownStyleProperty", () => ownStyleProperty), bindRuntimeValue(runtime2, "finiteStyleNumber", () => finiteStyleNumber), bindRuntimeValue(runtime2, "styleStringValue", () => styleStringValue), bindRuntimeValue(runtime2, "styleRecordValue", () => styleRecordValue), bindRuntimeValue(runtime2, "styleEffectRecords", () => styleEffectRecords), bindRuntimeValue(runtime2, "STYLE_EFFECT_WORDS", () => STYLE_EFFECT_WORDS, (value) => {
    STYLE_EFFECT_WORDS = value;
  }), bindRuntimeValue(runtime2, "STYLE_PROPERTY_LABELS", () => STYLE_PROPERTY_LABELS, (value) => {
    STYLE_PROPERTY_LABELS = value;
  }), bindRuntimeValue(runtime2, "BLUR_EFFECT_WORDS", () => BLUR_EFFECT_WORDS, (value) => {
    BLUR_EFFECT_WORDS = value;
  }), bindRuntimeValue(runtime2, "shadowEffectWords", () => shadowEffectWords), bindRuntimeValue(runtime2, "stylePropertyLabel", () => stylePropertyLabel), bindRuntimeValue(runtime2, "styleKeyLabel", () => styleKeyLabel), bindRuntimeValue(runtime2, "STYLE_ENUM_VALUE_LABELS_BY_KEY", () => STYLE_ENUM_VALUE_LABELS_BY_KEY, (value) => {
    STYLE_ENUM_VALUE_LABELS_BY_KEY = value;
  }), bindRuntimeValue(runtime2, "styleKeyedEnumValueLabel", () => styleKeyedEnumValueLabel), bindRuntimeValue(runtime2, "STYLE_ENUM_VALUE_LABELS", () => STYLE_ENUM_VALUE_LABELS, (value) => {
    STYLE_ENUM_VALUE_LABELS = value;
  }), bindRuntimeValue(runtime2, "styleEnumValueLabel", () => styleEnumValueLabel), bindRuntimeValue(runtime2, "styleEnumOptions", () => styleEnumOptions), bindRuntimeValue(runtime2, "styleDefaultHint", () => styleDefaultHint), bindRuntimeValue(runtime2, "styleValuesEqual", () => styleValuesEqual), bindRuntimeValue(runtime2, "changedStyleProperty", () => changedStyleProperty), bindRuntimeValue(runtime2, "createStyleEditor", () => createStyleEditor), bindRuntimeValue(runtime2, "StyleInspector", () => StyleInspector), bindRuntimeValue(runtime2, "MAX_STYLE_EFFECT_ADD_CHOICES", () => MAX_STYLE_EFFECT_ADD_CHOICES, (value) => {
    MAX_STYLE_EFFECT_ADD_CHOICES = value;
  }), bindRuntimeValue(runtime2, "INNER_TEXT_SHADOW_DISABLED_REASON", () => INNER_TEXT_SHADOW_DISABLED_REASON, (value) => {
    INNER_TEXT_SHADOW_DISABLED_REASON = value;
  }), bindRuntimeValue(runtime2, "SHAPE_SHADOW_DISABLED_REASON", () => SHAPE_SHADOW_DISABLED_REASON, (value) => {
    SHAPE_SHADOW_DISABLED_REASON = value;
  }), bindRuntimeValue(runtime2, "styleEffectAddItems", () => styleEffectAddItems), bindRuntimeValue(runtime2, "shadowStyleKey", () => shadowStyleKey), bindRuntimeValue(runtime2, "STYLE_EFFECT_KEYS", () => STYLE_EFFECT_KEYS, (value) => {
    STYLE_EFFECT_KEYS = value;
  }), bindRuntimeValue(runtime2, "StyleEffectsInspector", () => StyleEffectsInspector), bindRuntimeValue(runtime2, "StylePropertyRow", () => StylePropertyRow), bindRuntimeValue(runtime2, "styleScrubProps", () => styleScrubProps), bindRuntimeValue(runtime2, "styleLiveColorProps", () => styleLiveColorProps), bindRuntimeValue(runtime2, "validatedColorLiveProps", () => validatedColorLiveProps), bindRuntimeValue(runtime2, "StyleValueRow", () => StyleValueRow), bindRuntimeValue(runtime2, "MIXED_STYLE_CHOICE", () => MIXED_STYLE_CHOICE, (value) => {
    MIXED_STYLE_CHOICE = value;
  }), bindRuntimeValue(runtime2, "requiredRemoveName", () => requiredRemoveName), bindRuntimeValue(runtime2, "StyleRemoveShorthandButton", () => StyleRemoveShorthandButton), bindRuntimeValue(runtime2, "validatedStyleColor", () => validatedStyleColor), bindRuntimeValue(runtime2, "StyleColorTextRow", () => StyleColorTextRow), bindRuntimeValue(runtime2, "StyleLengthRow", () => StyleLengthRow), bindRuntimeValue(runtime2, "setRecordField", () => setRecordField), bindRuntimeValue(runtime2, "StyleRecordRow", () => StyleRecordRow), bindRuntimeValue(runtime2, "useNestedStyleEditor", () => useNestedStyleEditor), bindRuntimeValue(runtime2, "NestedStyleNumberRows", () => NestedStyleNumberRows), bindRuntimeValue(runtime2, "SHADOW_EDITOR_BOUNDS", () => SHADOW_EDITOR_BOUNDS, (value) => {
    SHADOW_EDITOR_BOUNDS = value;
  }), bindRuntimeValue(runtime2, "NESTED_STYLE_REMOVE_LABELS", () => NESTED_STYLE_REMOVE_LABELS, (value) => {
    NESTED_STYLE_REMOVE_LABELS = value;
  }), bindRuntimeValue(runtime2, "STYLE_COLOR_REMOVE_LABELS", () => STYLE_COLOR_REMOVE_LABELS, (value) => {
    STYLE_COLOR_REMOVE_LABELS = value;
  }), bindRuntimeValue(runtime2, "normalizedShadowRecord", () => normalizedShadowRecord), bindRuntimeValue(runtime2, "validatedShadowRecord", () => validatedShadowRecord), bindRuntimeValue(runtime2, "shadowSummary", () => shadowSummary), bindRuntimeValue(runtime2, "ShadowStyleRow", () => ShadowStyleRow), bindRuntimeValue(runtime2, "BlurStyleRow", () => BlurStyleRow), bindRuntimeValue(runtime2, "styleNoneLabel", () => styleNoneLabel), bindRuntimeValue(runtime2, "nestedStyleSummary", () => nestedStyleSummary), bindRuntimeValue(runtime2, "NestedStylePopoverRow", () => NestedStylePopoverRow), bindRuntimeValue(runtime2, "gradientStopRecords", () => gradientStopRecords), bindRuntimeValue(runtime2, "sortedGradientStops", () => sortedGradientStops), bindRuntimeValue(runtime2, "GradientPickerStyleEditor", () => GradientPickerStyleEditor), bindRuntimeValue(runtime2, "GradientStopsStyleEditor", () => GradientStopsStyleEditor), () => {
    (0, runtime2.initializeTypographyInference)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeUiPointerMedia)(), (0, runtime2.initializeUiPropertyLabels)(), (0, runtime2.initializeUiInputs210)(), reactL9 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeStyleSchema)(), jsxTJ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MAX_INLINE_ENUM_CHOICES = 4, MAX_INLINE_ENUM_WIDTH = 24, INLINE_ENUM_OPTION_PADDING = 2, enumLabelWidth = (label) => [...label].reduce((width, char) => width + (char > "⃿" ? 2 : 1), 0), enumChoicesFitInline =(options) => options.length * (Math.max(0, ...options.map((input) => enumLabelWidth(input.label))) + INLINE_ENUM_OPTION_PADDING) <= MAX_INLINE_ENUM_WIDTH, STYLE_GROUP_ORDER = [
      "Typography",
      "颜色和填充",
      "Spacing",
      "Border",
      "Size",
      "Layout",
      "Effects"
    ], STYLE_GROUP_TITLES = {
      Typography: (0, runtime2.formatMessage)({
        defaultMessage: "文字排版",
        id: "s5o+8jswMy"
      }),
      "颜色和填充": (0, runtime2.formatMessage)({
        defaultMessage: "颜色和填充",
        id: "RvI0F4v5Q5"
      }),
      Spacing: (0, runtime2.formatMessage)({
        defaultMessage: "间距",
        id: "imNFOfwAjY"
      }),
      Border: (0, runtime2.formatMessage)({
        defaultMessage: "边框",
        id: "p9ph8mm/St"
      }),
      Size: (0, runtime2.formatMessage)({
        defaultMessage: "尺寸",
        id: "B4cst4Y1NJ"
      }),
      Layout: (0, runtime2.formatMessage)({
        defaultMessage: "布局",
        id: "p4lM2O85Ev"
      }),
      Effects: (0, runtime2.formatMessage)({
        defaultMessage: "效果",
        id: "rx3l3CQBCQ"
      })
    }, HIDDEN_STYLE_PROPERTY_KEYS = /* @__PURE__ */ new Set([
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
      styleFieldDescriptor(runtime2.defaultShadowBounds, "x", "len", 1, "px"),
      styleFieldDescriptor(runtime2.defaultShadowBounds, "y", "len", 1, "px"),
      styleFieldDescriptor(runtime2.defaultShadowBounds, "blur", "len", 1, "px")
    ], SHADOW_SPREAD_FIELD = styleFieldDescriptor(runtime2.defaultShadowBounds, "spread", "len", 1, "px"), FILTER_FIELDS = [
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "blur", "len", 0.5, "px"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "模糊",
          id: "4k3w761/Zs"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "brightness", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "亮度",
          id: "HmpcfYS/lF"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "contrast", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "对比度",
          id: "R9oGwv0l1l"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "saturate", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "饱和度",
          id: "lB1TdImiVU"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "grayscale", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "灰度",
          id: "Jqtly7QD9T"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "sepia", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "褐色",
          id: "YYgtUTC9IC"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "invert", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "反相",
          id: "SnZa+XJFdn"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.filterBounds, "hueRotate", "num", 1, "°"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "色相",
          id: "6j850vIz4E"
        })
      }
    ], FILTER_PERCENT_FIELDS = /* @__PURE__ */ new Set([
      "brightness",
      "contrast",
      "saturate",
      "scale"
    ]), TRANSFORM_FIELDS = [
      {
        ...
      styleFieldDescriptor(runtime2.transformBounds, "translateX", "len", 1, "px"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "水平位移",
          id: "1l6XRoETiQ"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.transformBounds, "translateY", "len", 1, "px"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "垂直位移",
          id: "aJDePAZHIr"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.transformBounds, "scale", "num", 0.05),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "缩放",
          id: "KLWAhOWjVi"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.transformBounds, "rotate", "num", 1, "°"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "旋转",
          id: "//VxH8Vt+X"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.transformBounds, "skewX", "num", 1, "°"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "水平倾斜",
          id: "xIRFZQan16"
        })
      },
      {
        ...
      styleFieldDescriptor(runtime2.transformBounds, "skewY", "num", 1, "°"),
        label: () => (0, runtime2.formatMessage)({
          defaultMessage: "垂直倾斜",
          id: "H6YiHzVkY/"
        })
      }
    ], MIN_GRADIENT_STOPS = 2, MAX_GRADIENT_STOPS = 8, STYLE_EFFECT_WORDS = {
      drop: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "外阴影",
          id: "U8dN7QNlx2"
        }),
        remove: (0, runtime2.formatMessage)({
          defaultMessage: "移除投影",
          id: "2UY4FnFF7z"
        })
      },
      inner: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "内阴影",
          id: "srYGrIDvY/"
        }),
        remove: (0, runtime2.formatMessage)({
          defaultMessage: "移除内阴影",
          id: "tSEjhX8Gn8"
        })
      },
      box: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "阴影",
          id: "07j/bFcVrF"
        }),
        remove: (0, runtime2.formatMessage)({
          defaultMessage: "移除盒阴影",
          id: "FeVzzjcckn"
        })
      },
      text: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "文字阴影",
          id: "ZOJsoI7Q7/"
        }),
        remove: (0, runtime2.formatMessage)({
          defaultMessage: "移除文字阴影",
          id: "3J9SbzAHgS"
        })
      },
      layerBlur: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "图层模糊",
          id: "nBxUIVWgTO"
        }),
        remove: (0, runtime2.formatMessage)({
          defaultMessage: "移除图层模糊",
          id: "hjEPiC8W3T"
        })
      },
      backgroundBlur: {
        label: (0, runtime2.formatMessage)({
          defaultMessage: "背景模糊",
          id: "8ZRaGenY/n"
        }),
        remove: (0, runtime2.formatMessage)({
          defaultMessage: "移除背景模糊",
          id: "bdkpthBEAr"
        })
      }
    }, STYLE_PROPERTY_LABELS = {
      fontSize: (0, runtime2.formatMessage)({
        defaultMessage: "字号",
        id: "gabBvBD+Ag"
      }),
      fontWeight: (0, runtime2.formatMessage)({
        defaultMessage: "字重",
        id: "zD2ywbi1/o"
      }),
      fontStyle: (0, runtime2.formatMessage)({
        defaultMessage: "字体样式",
        id: "pL04p2WYFS"
      }),
      lineHeight: (0, runtime2.formatMessage)({
        defaultMessage: "行高",
        id: "oPs5ol2qGa"
      }),
      letterSpacing: (0, runtime2.formatMessage)({
        defaultMessage: "字间距",
        id: "eG5H2nwjXB"
      }),
      textAlign: (0, runtime2.formatMessage)({
        defaultMessage: "对齐",
        id: "c0usoACs2h"
      }),
      textTransform: (0, runtime2.formatMessage)({
        defaultMessage: "大小写",
        id: "aClNmM6cVn"
      }),
      textDecorationLine: (0, runtime2.formatMessage)({
        defaultMessage: "装饰",
        id: "ABTqLg0N3l"
      }),
      textDecorationStyle: (0, runtime2.formatMessage)({
        defaultMessage: "线条样式",
        id: "2FBmc0aP3H"
      }),
      textDecorationColor: (0, runtime2.formatMessage)({
        defaultMessage: "线条颜色",
        id: "uqxZmY9+uU"
      }),
      fontFamily: (0, runtime2.formatMessage)({
        defaultMessage: "字体系列",
        id: "umRZP69+1L"
      }),
      fontVariantNumeric: (0, runtime2.formatMessage)({
        defaultMessage: "数字样式",
        id: "azd6apVbkx"
      }),
      color: (0, runtime2.formatMessage)({
        defaultMessage: "颜色",
        id: "4yvCHzKVOV"
      }),
      textStrokeWidth: (0, runtime2.formatMessage)({
        defaultMessage: "描边宽度",
        id: "zDndIYMz2M"
      }),
      textStrokeColor: (0, runtime2.formatMessage)({
        defaultMessage: "描边颜色",
        id: "/COkqdR408"
      }),
      backgroundColor: (0, runtime2.formatMessage)({
        defaultMessage: "背景",
        id: "2PbQqRk6EL"
      }),
      backgroundGradient: (0, runtime2.formatMessage)({
        defaultMessage: "渐变",
        id: "Q/W8s4ArFf"
      }),
      opacity: (0, runtime2.formatMessage)({
        defaultMessage: "不透明度",
        id: "GqOam3/Hyq"
      }),
      marginTop: (0, runtime2.formatMessage)({
        defaultMessage: "上外边距",
        id: "ltQly6Mc3p"
      }),
      marginRight: (0, runtime2.formatMessage)({
        defaultMessage: "右外边距",
        id: "0K6uV9bZL9"
      }),
      marginBottom: (0, runtime2.formatMessage)({
        defaultMessage: "下外边距",
        id: "FpBNivRK6d"
      }),
      marginLeft: (0, runtime2.formatMessage)({
        defaultMessage: "左外边距",
        id: "wcLPWEdidL"
      }),
      paddingTop: (0, runtime2.formatMessage)({
        defaultMessage: "上内边距",
        id: "h6HcLIUMBe"
      }),
      paddingRight: (0, runtime2.formatMessage)({
        defaultMessage: "右内边距",
        id: "GjHKv2fkjy"
      }),
      paddingBottom: (0, runtime2.formatMessage)({
        defaultMessage: "下内边距",
        id: "bQf44OOXfe"
      }),
      paddingLeft: (0, runtime2.formatMessage)({
        defaultMessage: "左内边距",
        id: "KP35nvMDhm"
      }),
      borderWidth: (0, runtime2.formatMessage)({
        defaultMessage: "边框宽度",
        id: "maDBuVtSle"
      }),
      borderStyle: (0, runtime2.formatMessage)({
        defaultMessage: "边框样式",
        id: "nS+V9QLOcK"
      }),
      borderColor: (0, runtime2.formatMessage)({
        defaultMessage: "边框颜色",
        id: "yJbVpj9Iym"
      }),
      borderRadius: (0, runtime2.formatMessage)({
        defaultMessage: "圆角半径",
        id: "wv4NnplSDg"
      }),
      width: (0, runtime2.formatMessage)({
        defaultMessage: "宽度",
        id: "DVpZzdLNsZ"
      }),
      height: (0, runtime2.formatMessage)({
        defaultMessage: "高度",
        id: "8I/1n02az2"
      }),
      minWidth: (0, runtime2.formatMessage)({
        defaultMessage: "最小宽度",
        id: "pqtBgCH5x2"
      }),
      minHeight: (0, runtime2.formatMessage)({
        defaultMessage: "最小高度",
        id: "LMMwWSeN9j"
      }),
      maxWidth: (0, runtime2.formatMessage)({
        defaultMessage: "最大宽度",
        id: "FZuDoUOWh6"
      }),
      maxHeight: (0, runtime2.formatMessage)({
        defaultMessage: "最大高度",
        id: "bKrNUIddHl"
      }),
      position: (0, runtime2.formatMessage)({
        defaultMessage: "定位",
        id: "k8tSASUuBX"
      }),
      top: (0, runtime2.formatMessage)({
        defaultMessage: "上",
        id: "TOR9FXtMVi"
      }),
      right: (0, runtime2.formatMessage)({
        defaultMessage: "右对齐",
        id: "Zmc0rK5P5J"
      }),
      bottom: (0, runtime2.formatMessage)({
        defaultMessage: "下",
        id: "cEXaS8efn7"
      }),
      left: (0, runtime2.formatMessage)({
        defaultMessage: "左对齐",
        id: "srEt3GDBhV"
      }),
      zIndex: (0, runtime2.formatMessage)({
        defaultMessage: "层级",
        id: "DbDWiXonYD"
      }),
      float: (0, runtime2.formatMessage)({
        defaultMessage: "浮动",
        id: "ORh9iT0NKg"
      }),
      display: (0, runtime2.formatMessage)({
        defaultMessage: "大标题",
        id: "/E/XUnURYm"
      }),
      overflow: (0, runtime2.formatMessage)({
        defaultMessage: "溢出",
        id: "hHDqd/eCmh"
      }),
      cursor: (0, runtime2.formatMessage)({
        defaultMessage: "光标",
        id: "0DyvCbgnOD"
      }),
      boxShadow: STYLE_EFFECT_WORDS.drop.label,
      textShadow: STYLE_EFFECT_WORDS.text.label,
      filter: (0, runtime2.formatMessage)({
        defaultMessage: "滤镜",
        id: "+KGT/pMuLo"
      }),
      backdropFilter: (0, runtime2.formatMessage)({
        defaultMessage: "背景滤镜",
        id: "YMRfu9k/xc"
      }),
      transform: (0, runtime2.formatMessage)({
        defaultMessage: "变换",
        id: "Gvihejdw8d"
      }),
      mixBlendMode: (0, runtime2.formatMessage)({
        defaultMessage: "混合模式",
        id: "ed00K2OLkp"
      })
    }, BLUR_EFFECT_WORDS = {
      filter: STYLE_EFFECT_WORDS.layerBlur,
      backdropFilter: STYLE_EFFECT_WORDS.backgroundBlur
    }, STYLE_ENUM_VALUE_LABELS_BY_KEY = {
      fontStyle: {
        normal: (0, runtime2.formatMessage)({
          defaultMessage: "常规",
          id: "XxHnktbl7a"
        }),
        italic: (0, runtime2.formatMessage)({
          defaultMessage: "斜体",
          id: "87FTzbxruS"
        })
      },
      textAlign: {
        left: (0, runtime2.formatMessage)({
          defaultMessage: "左对齐",
          id: "DoL4iwHMay"
        }),
        center: (0, runtime2.formatMessage)({
          defaultMessage: "居中",
          id: "0yn/aHMVK4"
        }),
        right: (0, runtime2.formatMessage)({
          defaultMessage: "右对齐",
          id: "KakyPkVHVF"
        }),
        justify: (0, runtime2.formatMessage)({
          defaultMessage: "两端对齐",
          id: "pb/jSgMkeL"
        })
      },
      textTransform: {
        none: (0, runtime2.formatMessage)({
          defaultMessage: "无",
          id: "fDjbYfx5cB"
        }),
        uppercase: (0, runtime2.formatMessage)({
          defaultMessage: "大写",
          id: "Kc32R3q9SY"
        }),
        lowercase: (0, runtime2.formatMessage)({
          defaultMessage: "小写",
          id: "WBiWzQU8pV"
        }),
        capitalize: (0, runtime2.formatMessage)({
          defaultMessage: "首字母大写",
          id: "jVz2slbm+O"
        })
      },
      textDecorationLine: {
        none: (0, runtime2.formatMessage)({
          defaultMessage: "无",
          id: "NBLt1R/dJq"
        }),
        underline: (0, runtime2.formatMessage)({
          defaultMessage: "下划线",
          id: "pGs9QTbZR3"
        }),
      "line-through": (0, runtime2.formatMessage)({
          defaultMessage: "删除线",
          id: "fFZy1v1iP/"
        })
      },
      textDecorationStyle: {
        solid: (0, runtime2.formatMessage)({
          defaultMessage: "实线",
          id: "6e7NUeFV50"
        }),
        double: (0, runtime2.formatMessage)({
          defaultMessage: "双线",
          id: "BBKFpxzGe5"
        }),
        dotted: (0, runtime2.formatMessage)({
          defaultMessage: "点线",
          id: "B8lyaQZPUG"
        }),
        dashed: (0, runtime2.formatMessage)({
          defaultMessage: "虚线",
          id: "/mEa3RTWrL"
        }),
        wavy: (0, runtime2.formatMessage)({
          defaultMessage: "波浪线",
          id: "NgUHY/IIUp"
        })
      },
      fontFamily: {
        sans: (0, runtime2.formatMessage)({
          defaultMessage: "无衬线",
          id: "k9RawDDjZE"
        }),
        serif: (0, runtime2.formatMessage)({
          defaultMessage: "衬线字体",
          id: "+ys0N9ukBl"
        }),
        mono: (0, runtime2.formatMessage)({
          defaultMessage: "等宽",
          id: "PWo4u1eHK2"
        }),
        helvetica: (0, runtime2.literalMessage)("Helvetica")
      },
      fontVariantNumeric: {
        normal: (0, runtime2.formatMessage)({
          defaultMessage: "常规",
          id: "uiAaPwBBq/"
        }),
      "tabular-nums": (0, runtime2.formatMessage)({
          defaultMessage: "等宽数字",
          id: "V7lcWrRf2a"
        })
      },
      borderStyle: {
        none: (0, runtime2.formatMessage)({
          defaultMessage: "无",
          id: "iPI5Cwh+4n"
        }),
        solid: (0, runtime2.formatMessage)({
          defaultMessage: "实线",
          id: "7i+Kr3Hlxl"
        }),
        dashed: (0, runtime2.formatMessage)({
          defaultMessage: "虚线",
          id: "X/zn9OqX0j"
        }),
        dotted: (0, runtime2.formatMessage)({
          defaultMessage: "点线",
          id: "cDPdmMcUqr"
        }),
        double: (0, runtime2.formatMessage)({
          defaultMessage: "双线",
          id: "EXVJgGCIMQ"
        })
      },
      position: {
        static: (0, runtime2.formatMessage)({
          defaultMessage: "静态",
          id: "g74N7k/9UM"
        }),
        relative: (0, runtime2.formatMessage)({
          defaultMessage: "相对",
          id: "Dr/fR6G/dZ"
        }),
        absolute: (0, runtime2.formatMessage)({
          defaultMessage: "绝对",
          id: "ZloStpoPac"
        }),
        sticky: (0, runtime2.formatMessage)({
          defaultMessage: "粘性",
          id: "ZaWAadpc2O"
        }),
        fixed: (0, runtime2.formatMessage)({
          defaultMessage: "固定",
          id: "TaDu6Je2bB"
        })
      },
      float: {
        none: (0, runtime2.formatMessage)({
          defaultMessage: "无",
          id: "XSFpqywfDH"
        }),
        left: (0, runtime2.formatMessage)({
          defaultMessage: "左对齐",
          id: "2CIUMSswUx"
        }),
        right: (0, runtime2.formatMessage)({
          defaultMessage: "右对齐",
          id: "P4FdMa3Za0"
        })
      },
      display: {
        block: (0, runtime2.formatMessage)({
          defaultMessage: "块级",
          id: "Z1RAiRGNpd"
        }),
        "inline-block": (0, runtime2.formatMessage)({
          defaultMessage: "行内块",
          id: "KjzLFYlzkE"
        }),
        flex: (0, runtime2.formatMessage)({
          defaultMessage: "弹性",
          id: "SvxWKE6fsk"
        }),
        grid: (0, runtime2.formatMessage)({
          defaultMessage: "网格",
          id: "QsEiCdQj1b"
        }),
        none: (0, runtime2.formatMessage)({
          defaultMessage: "无",
          id: "Dk1g9qDv8L"
        })
      },
      overflow: {
        visible: (0, runtime2.formatMessage)({
          defaultMessage: "可见",
          id: "bYZ70ZZGoX"
        }),
        hidden: (0, runtime2.formatMessage)({
          defaultMessage: "隐藏",
          id: "BCD6i82Lpz"
        }),
        clip: (0, runtime2.formatMessage)({
          defaultMessage: "裁剪",
          id: "pA/HbFzmWr"
        }),
        auto: (0, runtime2.formatMessage)({
          defaultMessage: "自动",
          id: "/jSItOxBFN"
        }),
        scroll: (0, runtime2.formatMessage)({
          defaultMessage: "滚动",
          id: "iOwsVEx/TJ"
        })
      },
      cursor: {
        default: (0, runtime2.formatMessage)({
          defaultMessage: "默认",
          id: "rzrQPNAYuO"
        }),
        pointer: (0, runtime2.formatMessage)({
          defaultMessage: "指针",
          id: "8YJ+SknYp5"
        }),
        text: (0, runtime2.formatMessage)({
          defaultMessage: "文本",
          id: "WpiMxDnasZ"
        }),
        move: (0, runtime2.formatMessage)({
          defaultMessage: "移动",
          id: "gy8Ct4jR6p"
        }),
        grab: (0, runtime2.formatMessage)({
          defaultMessage: "抓取",
          id: "Gz/tIBzcca"
        }),
        grabbing: (0, runtime2.formatMessage)({
          defaultMessage: "抓取中",
          id: "aAKAl9HRjD"
        }),
        crosshair: (0, runtime2.formatMessage)({
          defaultMessage: "十字准线",
          id: "i021aOV9Ui"
        }),
        "not-allowed": (0, runtime2.formatMessage)({
          defaultMessage: "禁止",
          id: "qf68TBcsP5"
        }),
        "zoom-in": (0, runtime2.formatMessage)({
          defaultMessage: "放大",
          id: "E0jzD3igRK"
        }),
        "zoom-out": (0, runtime2.formatMessage)({
          defaultMessage: "缩小",
          id: "bdd9jXeBPf"
        }),
        help: (0, runtime2.formatMessage)({
          defaultMessage: "帮助",
          id: "09mqiHs0n1"
        }),
        wait: (0, runtime2.formatMessage)({
          defaultMessage: "等待",
          id: "vnBoICFSDQ"
        })
      },
      mixBlendMode: {
        normal: (0, runtime2.formatMessage)({
          defaultMessage: "常规",
          id: "BP6B02m3DT"
        }),
        multiply: (0, runtime2.formatMessage)({
          defaultMessage: "正片叠底",
          id: "B7cGRMw3dy"
        }),
        screen: (0, runtime2.formatMessage)({
          defaultMessage: "滤色",
          id: "2XZKRcfHGX"
        }),
        overlay: (0, runtime2.formatMessage)({
          defaultMessage: "叠加",
          id: "zXmdvYioZ6"
        }),
        darken: (0, runtime2.formatMessage)({
          defaultMessage: "变暗",
          id: "5dX6hxfFkg"
        }),
        lighten: (0, runtime2.formatMessage)({
          defaultMessage: "变亮",
          id: "s001BOMfCx"
        })
      }
    }, STYLE_ENUM_VALUE_LABELS = {
      "line-through": STYLE_ENUM_VALUE_LABELS_BY_KEY.textDecorationLine?.["line-through"],
      "tabular-nums": STYLE_ENUM_VALUE_LABELS_BY_KEY.fontVariantNumeric?.["tabular-nums"]
    }, MAX_STYLE_EFFECT_ADD_CHOICES = 4, INNER_TEXT_SHADOW_DISABLED_REASON = (0, runtime2.formatMessage)({
      defaultMessage: "文字需要填充或边框才能使用内阴影",
      id: "G7n3Cnlf3m"
    }), SHAPE_SHADOW_DISABLED_REASON = (0, runtime2.formatMessage)({
      defaultMessage: "不适用于菱形或箭头形状",
      id: "bhdy+2ToPH"
    }), STYLE_EFFECT_KEYS = ["boxShadow", "filter", "backdropFilter"], MIXED_STYLE_CHOICE = "\0mixed", SHADOW_EDITOR_BOUNDS = Object.fromEntries([...SHADOW_FIELDS, SHADOW_SPREAD_FIELD].map((input) => [
      input.field,
      {
        min: input.min,
        max: input.max,
        step: input.step
      }
    ])), NESTED_STYLE_REMOVE_LABELS = {
      filter: (0, runtime2.formatMessage)({
        defaultMessage: "移除滤镜",
        id: "WtS3NdxhrP"
      }),
      backdropFilter: (0, runtime2.formatMessage)({
        defaultMessage: "移除背景滤镜",
        id: "ZkqyApczFz"
      }),
      transform: (0, runtime2.formatMessage)({
        defaultMessage: "移除变换",
        id: "c3eaPXaB9v"
      })
    }, STYLE_COLOR_REMOVE_LABELS = {
      textDecorationColor: (0, runtime2.formatMessage)({
        defaultMessage: "移除线条颜色",
        id: "1X223o6MAT"
      }),
      color: (0, runtime2.formatMessage)({
        defaultMessage: "移除颜色",
        id: "lSd5VhjgAb"
      }),
      textStrokeColor: (0, runtime2.formatMessage)({
        defaultMessage: "移除描边颜色",
        id: "pEoDpK6S+2"
      }),
      backgroundColor: (0, runtime2.formatMessage)({
        defaultMessage: "移除背景",
        id: "+0t+FyZRCt"
      }),
      borderColor: (0, runtime2.formatMessage)({
        defaultMessage: "移除边框颜色",
        id: "bGKsBORSBk"
      })
    };
  };
}
export {
  installUiStyleInspector
};
