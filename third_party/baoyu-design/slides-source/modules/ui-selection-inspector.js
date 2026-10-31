// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiSelectionInspector(runtime2) {
  var jsxq_, TABLE_HEIGHT_REASON, TEXT_SHADOW_FILL_REASON, LINE_DASH_REASON, ZERO_SIDE_PLACEHOLDERS, SIDE_INDEXES, EMPTY_SIDE_VALUES, anchorSizePatch, STACK_CHILD_ALIGN_OPTIONS, GRID_CHILD_ALIGN_OPTIONS, PROPERTY_ROW_FOCUS_SELECTOR, CONNECTOR_END_CHOICES, CONNECTOR_ARROW_OPTIONS, CONNECTOR_ROUTE_OPTIONS, CONNECTOR_STROKE_OPTIONS, CONNECTOR_DIRECTION_OPTIONS, slideTransitionLabels, SLIDE_TRANSITION_OPTIONS, START_LABEL, END_LABEL, STRETCH_LABEL, FILL_COLOR_LABEL, FILL_GRADIENT_LABEL, FILL_IMAGE_LABEL, SOLID_LABEL, DASHED_LABEL, TEXT_COLOR_LABEL, COVER_LABEL, CONTAIN_LABEL, RADIAL_LABEL, LINEAR_LABEL, COLUMNS_LABEL, PADDING_LABEL, APPEARANCE_LABEL, BACKGROUND_LABEL, STROKE_WIDTH_LABEL, SIZE_WIDTH_LABEL, SIZE_HEIGHT_LABEL, MIN_WIDTH_LABEL, MAX_WIDTH_LABEL, MIN_HEIGHT_LABEL, MAX_HEIGHT_LABEL, AUTO_LABEL, EMPHASIS_LABEL, LIST_LABEL, CASE_LABEL, NONE_LABEL, FONT_LABEL, WEIGHT_LABEL, FONT_SIZE_LABEL, SPACING_LABEL, SPACING_TITLE, LINE_HEIGHT_LABEL, LETTER_SPACING_LABEL, SEARCH_FONTS_LABEL, STYLE_DEFAULT_LABEL, SYSTEM_FONT_LABEL, CONNECTOR_DIRECTION_ARROW_ICONS, CONNECTOR_DIRECTION_ICON_CHOICES, CONNECTOR_DIRECTION_GLYPH_CHOICES, lastPropertyInput, MEDIA_SOURCE_KINDS, isNonConnectorShape, isDecorativePolygonShape, normalizedHexRgba, isDefaultShapeFill;
  function isTransparentStyleColor(color) {
    let value = color.trim().toLowerCase();
    return value === "transparent" || /^(?:rgb|hsl)a?\([^,)]+,[^,)]+,[^,)]+,\s*(?:0+(?:\.0+)?|\.0+)%?\s*\)$/.test(value) || /^(?:rgb|hsl)a?\([^/)]+\/\s*(?:0+(?:\.0+)?|\.0+)%?\s*\)$/.test(value) || /^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(value);
  }
  function GridTracksPropertyRows({ label, tracks, onChange }) {
    let callback = (input) => input === "auto" ? {
      fr: 1
    } : "fr" in input ? {
      px: 240
    } : "auto", callback2 = (input) => input === "auto" ? (0, runtime2.literalMessage)("auto") : "fr" in input ? String(input.fr) + (0, runtime2.literalMessage)("fr") : String(input.px) + (0, runtime2.literalMessage)("px");
    return jsxq_.jsx(runtime2.PropertyRow, {
      label,
      children: jsxq_.jsxs("span", {
        className: "flex min-w-0 flex-wrap items-center gap-1 py-0.5",
        children: [
          tracks.map((input, options) => jsxq_.jsx(runtime2.Button, {
            variant: "secondary",
            title: (0, runtime2.formatMessage)({
              defaultMessage: "点击切换：弹性分配、固定 240 像素、适应内容",
              id: "I2zaRe8HvP"
            }),
            onClick: () => onChange(tracks.map((input2, options2) => options2 === options ? callback(input2) : input2)),
            children: callback2(input)
          }, options)),
          jsxq_.jsx(runtime2.Button, {
            variant: "ghost",
            iconOnly: !0,
            icon: "Add",
            "aria-label": (0, runtime2.formatMessage)({ defaultMessage: "添加弹性列", id: "MZb8VBSY6F" }),
            disabled: tracks.length >= runtime2.maxGridTracks,
            onClick: () => onChange([
              ...tracks,
              {
                fr: 1
              }
            ])
          }),
          jsxq_.jsx(runtime2.Button, {
            variant: "ghost",
            iconOnly: !0,
            icon: "Minus",
            "data-kit": "row-remove",
            "aria-label": (0, runtime2.formatMessage)({ defaultMessage: "移除最后一列", id: "HhR7V78x5Y" }),
            disabled: tracks.length <= 1,
            onClick: () => onChange(tracks.slice(0, -1))
          })
        ]
      })
    });
  }
  function imagePropertyLabel(node, source) {
    let value = node.alt.trim();
    if ((0, runtime2.looksLikeMediaFilename)(value))
      return value;
    let value2 = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(source)?.[1];
    return value2 !== void 0 ? (0, runtime2.formatMessage)({ defaultMessage: "{format} 图片", id: "hL+FfToPQ3" }, {
      format: value2 === "svg+xml" ? (0, runtime2.literalMessage)("SVG") : value2 === "jpeg" ? (0, runtime2.literalMessage)("JPEG") : value2.toUpperCase()
    }) : (0, runtime2.formatMessage)({ defaultMessage: "图片", id: "EQDmqYJjPu" });
  }
  function focusPropertyRowControl(event) {
    event.currentTarget.closest("[data-property-row]")?.querySelector('input, button:not([data-kit="row-reset"]), [tabindex="0"]')?.focus(), (0, runtime2.suppressEnterClicksUntilRelease)();
  }
  function propertyFocusTargets(root, withInputs, withRadios = !1) {
    return [
      ...root.querySelectorAll(withRadios ? PROPERTY_ROW_FOCUS_SELECTOR + ', [role="radio"][tabindex="0"]:not([aria-disabled="true"]):not([data-disabled])' : PROPERTY_ROW_FOCUS_SELECTOR)
    ].filter((input) => !input.disabled && (withInputs || input.tagName !== "INPUT"));
  }
  function adjacentPropertyRowControl(element, withInputs) {
    let pick = (row) => {
      let targets = propertyFocusTargets(row, withInputs);
      return targets.find((input) => input.tagName === "BUTTON") ?? targets[0];
    };
    for (let parent = element.parentElement; parent !== null; parent = parent.matches('[data-slides="properties"]') ? null : parent.parentElement) {
      let rows = [...parent.querySelectorAll("[data-property-row]")].filter((row2) => !element.contains(row2) && !row2.contains(element) && pick(row2) !== void 0), before = rows.filter((row2) => (element.compareDocumentPosition(row2) & element.DOCUMENT_POSITION_PRECEDING) !== 0), row = before[before.length - 1] ?? rows[0];
      if (row !== void 0)
        return pick(row);
      let loose = propertyFocusTargets(parent, !1).find((input) => !element.contains(input) && input.closest("[data-property-row]") === null);
      if (loose !== void 0)
        return loose;
    }
  }
  function suppressRepeatedKeyAfterRemoval() {
    let callback = (event) => {
      event.repeat ? (event.preventDefault(), event.stopPropagation()) : window.removeEventListener("keydown", callback, !0);
    };
    window.addEventListener("keydown", callback, !0);
  }
  function focusAfterPropertyRemoval(element, mode) {
    let row = element.closest("[data-property-row]"), fallback = adjacentPropertyRowControl(row ?? element, mode === "key"), done = !1, attempt = () => {
      let emptied = element.childElementCount === 0 && !element.matches('button, input, [role="radio"]');
      if (done || element.isConnected && !element.matches(":disabled") && !emptied)
        return;
      let doc = element.ownerDocument;
      if (doc.hasFocus() && (done = !0, !(doc.activeElement !== doc.body && doc.activeElement !== element))) {
        for (let target of [
          row?.isConnected === !0 ? propertyFocusTargets(row, mode === "key" || mode === "mouse", !0)[0] : void 0,
          fallback
        ])
          if (target?.focus(), !(target === void 0 || doc.activeElement !== target)) {
            mode !== "undo" && suppressRepeatedKeyAfterRemoval();
            return;
          }
      }
    };
    requestAnimationFrame(attempt), setTimeout(attempt, 50);
  }
  function propertyRemovalMouseHandler(event) {
    focusAfterPropertyRemoval(event.currentTarget, lastPropertyInput);
  }
  function notePropertyPointer(event) {
    lastPropertyInput = event.pointerType === "mouse" ? "mouse" : "tap";
  }
  function propertiesClickCapture(event) {
    let target = event.target.closest('button, [role="radio"]');
    target !== null && event.currentTarget.contains(target) && focusAfterPropertyRemoval(target, lastPropertyInput);
  }
  function propertyRemovalKeyHandler(event) {
    let target = event.target;
    (event.key.startsWith("Arrow") && target.matches('[role="radio"]') || (event.key === "Enter" || event.key === "Tab") && target.matches("input")) && focusAfterPropertyRemoval(event.currentTarget, "key");
  }
  function propertiesKeyDownCapture(event) {
    event.repeat || (lastPropertyInput = "key");
    let target = event.target;
    (0, runtime2.undoRedoKeyCommand)(event.nativeEvent) !== void 0 && event.currentTarget.contains(target) && !target.matches("input, textarea, select") && !target.isContentEditable && focusAfterPropertyRemoval(target, "undo");
  }
  function MediaSourcePropertyRow({ testid, kind, src, name, mixed = !1, empty = !1, onPick, onPress, offReason, onRemove }) {
    let { label, tip, off, accept } = MEDIA_SOURCE_KINDS[kind], ref = runtime2.reactw8.useRef(null), press = onPress ?? (() => ref.current?.click()), reason = mixed ? "请选择一张图片进行替换" : onPick === void 0 && onPress === void 0 ? offReason ?? off : void 0, text = mixed ? "Mixed" : empty ? "添加图片…" : name;
    return jsxq_.jsxs(runtime2.PropertyRow, {
      label,
      trailing: empty ? jsxq_.jsx(runtime2.Button, {
        variant: "ghost",
        iconOnly: !0,
        icon: "Upload",
        "aria-label": "上传图片…",
        tooltip: "上传图片…",
        disabledReason: reason,
        disabled: reason !== void 0,
        onClick: press,
        className: "shrink-0"
      }) : onRemove !== void 0 ? jsxq_.jsx("span", {
        className: "contents",
        onClickCapture: focusPropertyRowControl,
        children: jsxq_.jsx(runtime2.RemovePropertyButton, {
          label,
          verb: kind === "cover" ? "Reset" : void 0,
          onClick: onRemove
        })
      }) : void 0,
      onPress: (element) => element.querySelector("button")?.focus(),
      children: [
        jsxq_.jsx(runtime2.DisabledReasonTooltip, {
          reason,
          wrapperClassName: "flex min-w-0 flex-1",
          children: jsxq_.jsx(runtime2.FieldButton, {
            "data-testid": testid + "-" + kind + "-source",
            "aria-label": label + ": " + (empty ? "none" : text),
            title: reason === void 0 && !empty ? tip : void 0,
            className: "min-w-0",
            disabled: reason !== void 0,
            onClick: press,
            chip: empty || kind === "clip" || kind === "link" ? void 0 : jsxq_.jsx(runtime2.PropertyColorPreview, {
              children: !mixed && src !== void 0 ? jsxq_.jsx("img", {
                alt: "",
                src,
                draggable: !1,
                className: "absolute inset-0 h-full w-full object-cover"
              }) : null
            }),
            muted: mixed || empty,
            children: text
          })
        }),
        onPick !== void 0 && accept !== void 0 && !mixed ? jsxq_.jsx("input", {
          ref,
          "data-testid": testid + "-" + kind + "-file",
          type: "file",
          accept,
          className: "hidden",
          onChange: (input) => {
            let file = input.currentTarget.files?.[0];
            input.currentTarget.value = "", file && onPick(file);
          }
        }) : null
      ]
    });
  }
  function FillPropertyRow({ label, value, effective, swatches, clearLabel, onPick, onLivePick, onPickEnd, trailing, mixed, onReset, chip, headerTabs, panel, allowNone, isNone, noneDisabledReason, onNone, readsContrast, contrast, editsAreUndoSteps }) {
    let value2 = (value !== void 0 ? (0, runtime2.resolveSlideColor)(value) : void 0) ?? effective, value3 = contrast !== void 0 && value2 !== void 0 && chip === void 0 && mixed !== !0 ? (0, runtime2.colorContrastResults)(value2, contrast) : void 0, value4 = jsxq_.jsx(runtime2.ColorTextPropertyRow, {
      label,
      mixed,
      editsAreUndoSteps,
      onReset,
      chip,
      headerTabs,
      panel,
      allowNone,
      isNone,
      noneDisabledReason,
      onNone,
      contrast,
      value: value === void 0 ? void 0 : (0, runtime2.resolveSlideColor)(value),
      placeholder: effective,
      swatches,
      clearLabel,
      trailing,
      popoverTitle: runtime2.COLOR_LABEL,
      onChange: (input) => {
        if (input === void 0) {
          onPick(void 0);
          return;
        }
        let value5 = (0, runtime2.slideColorOrUndefined)(input);
        value5 !== void 0 && onPick(value5);
      },
      onLive: (input) => {
        let value5 = (0, runtime2.slideColorOrUndefined)(input);
        value5 !== void 0 && onLivePick(value5);
      },
      onLiveEnd: () => onPickEnd()
    });
    return readsContrast !== !0 ? value4 : jsxq_.jsxs("div", {
      "data-slides": "contrast-row",
      children: [
        value4,
        value3 !== void 0 && value2 !== void 0 ? jsxq_.jsx(runtime2.PropertyRow, {
          label: "",
          className: "-mt-0.5 pb-1 [--prop-row-h:0px]",
          children: jsxq_.jsx(runtime2.ContrastLockup, {
            fg: value2,
            results: value3
          })
        }) : null
      ]
    });
  }
  function useFillEditor(options) {
    let [value, value2] = runtime2.reactw8.useState(null), [value3, value4] = runtime2.reactw8.useState(!1), ref = runtime2.reactw8.useRef(null), ref2 = runtime2.reactw8.useRef({
      updateNodes: options?.updateNodes,
      mounted: !1
    });
    if (ref2.current.updateNodes = options?.updateNodes, runtime2.reactw8.useEffect(() => (ref2.current.mounted = !0, () => void (ref2.current.mounted = !1)), []), options === void 0)
      return {};
    let { node, slideBg, swatches, fillMixed, updateNodes, liveUpdateNodes, end, pickImage } = options, value5 = fillMixed ? void 0 : node.fill, callback = (input) => (source) => source.kind === "text" ? input(source) : source, callback2 = (input) => updateNodes(callback((input2) => (0, runtime2.setTextFill)(input2, input))), callback3 = (input) => liveUpdateNodes(callback((input2) => (0, runtime2.setTextFill)(input2, input))), value6 = value5?.kind === "gradient" ? value5.gradient : void 0, state = {
      kind: "slides-text",
      bag: void 0,
      disabled: !1,
      swatches,
      clearKeys: void 0,
      mixedKeys: void 0,
      unifiedColorPopover: !0,
      clear: () => callback2(void 0),
      commit: (input, options2) => callback2(options2 === void 0 ? void 0 : {
        kind: "gradient",
        gradient: options2
      }),
      live: (input, options2) => callback3({
        kind: "gradient",
        gradient: options2
      }),
      liveEnd: end
    }, callback4 = (input) => {
      pickImage !== void 0 && (value4(!0), pickImage(input).then((input2) => {
        if (!ref2.current.mounted || ref2.current.updateNodes === void 0) {
          input2 !== void 0 && (0, runtime2.showToast)((0, runtime2.formatMessage)({ defaultMessage: "图片加载期间文字已更改，请重新选择文字和图片。", id: "S5SbLHHbjZ" }));
          return;
        }
        if (value4(!1), input2 !== void 0) {
          if (!(0, runtime2.isRenderableImageSource)(input2)) {
            (0, runtime2.showToast)((0, runtime2.formatMessage)({ defaultMessage: "此图片无法用于填充文字，请先上传，或压缩为较小的 PNG/JPEG 图片。", id: "Yrq04FoMbW" }));
            return;
          }
          value2(null), ref2.current.updateNodes(callback((input3) => (0, runtime2.setTextFill)(input3, {
            kind: "image",
            src: input2,
            ...input3.fill?.kind === "image" && input3.fill.size !== void 0 ? {
              size: input3.fill.size
            } : {}
          })));
        }
      }, (input2) => {
        ref2.current.mounted && value4(!1), (0, runtime2.showToast)((0, runtime2.formatMessage)({ defaultMessage: "添加图片失败：{reason}", id: "p2BejcXS+1" }, { reason: input2 instanceof Error ? input2.message : String(input2) }));
      }));
    }, value7 = value ?? value5?.kind ?? "color";
    return fillMixed ? {} : {
      kind: {
        value: value7,
        label: "填充类型",
        options: [
          {
            value: "color",
            label: FILL_COLOR_LABEL
          },
          {
            value: "gradient",
            label: FILL_GRADIENT_LABEL
          },
          {
            value: "image",
            label: FILL_IMAGE_LABEL
          }
        ],
        onChange: (input) => {
          value2(input === "image" && value5?.kind !== "image" ? "image" : null), input === "color" && value5 !== void 0 && callback2(void 0), input === "gradient" && value6 === void 0 && callback2({
            kind: "gradient",
            gradient: defaultFillGradient((0, runtime2.resolveSlideColor)(node.color), slideBg)
          });
        }
      },
      face: value7 === "gradient" && value6 !== void 0 ? jsxq_.jsx("div", {
        "data-testid": "sl-text-gradient-panel",
        children: jsxq_.jsx(runtime2.GradientPickerStyleEditor, {
          rec: value6,
          propKey: "backgroundGradient",
          ed: state
        })
      }) : value7 === "image" ? jsxq_.jsxs("div", {
        className: "flex flex-col",
        "data-testid": "sl-text-image-panel",
        children: [
          jsxq_.jsx(runtime2.PropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "图片", id: "liKHyCUvte" }),
            children: jsxq_.jsxs("div", {
              className: "flex min-w-0 flex-1 items-center gap-2",
              children: [
                jsxq_.jsx(runtime2.PropertyColorPreview, {
                  className: "h-8 w-8 shrink-0",
                  children: value5?.kind === "image" ? jsxq_.jsx("img", {
                    src: value5.src,
                    alt: "",
                    className: "absolute inset-0 h-full w-full object-cover"
                  }) : null
                }),
                jsxq_.jsx(runtime2.Button, {
                  variant: "secondary",
                  disabled: pickImage === void 0 || value3,
                  title: pickImage === void 0 ? (0, runtime2.formatMessage)({ defaultMessage: "当前视图不支持添加图片", id: "+I7G/PK4ww" }) : void 0,
                  onClick: () => ref.current?.click(),
                  children: value3 ? (0, runtime2.formatMessage)({ defaultMessage: "正在加载…", id: "R9lO4+Qqqs" }) : value5?.kind === "image" ? (0, runtime2.formatMessage)({ defaultMessage: "替换…", id: "wfL2e8x4pC" }) : (0, runtime2.formatMessage)({ defaultMessage: "选择图片…", id: "378zI5e83/" })
                }),
                jsxq_.jsx("input", {
                  ref,
                  type: "file",
                  accept: "image/*",
                  className: "hidden",
                  onChange: (input) => {
                    let value8 = input.currentTarget.files?.[0];
                    input.currentTarget.value = "", value8 && callback4(value8);
                  }
                })
              ]
            })
          }),
          jsxq_.jsx(runtime2.ChoicePropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "尺寸", id: "itWSquQBZ5" }),
            value: value5?.kind === "image" ? value5.size ?? "cover" : "cover",
            disabled: value5?.kind !== "image",
            title: value5?.kind !== "image" ? (0, runtime2.formatMessage)({ defaultMessage: "请先选择图片", id: "c/ej7FZAxQ" }) : void 0,
            options: [
              {
                value: "cover",
                label: COVER_LABEL
              },
              {
                value: "contain",
                label: CONTAIN_LABEL
              }
            ],
            onChange: (input) => {
              value5?.kind === "image" && callback2({
                kind: "image",
                src: value5.src,
                ...input === "contain" ? {
                  size: "contain"
                } : {}
              });
            }
          })
        ]
      }) : null
    };
  }
  function TextFillPropertyRow({ colorMixed, editsAreUndoSteps, ...remainingProps }) {
    let { node, slideBg, swatches, fillMixed, updateNodes, liveUpdateNodes, end, contrast } = remainingProps, value = fillMixed ? void 0 : node.fill, value2 = useFillEditor(remainingProps), callback = (input) => (source) => source.kind === "text" ? input(source) : source, callback2 = (input, options) => {
      let { color: value4, ...value5 } = (0, runtime2.setTextFill)(input, void 0);
      return options === void 0 ? value5 : {
        ...value5,
        color: options
      };
    }, value3 = (0, runtime2.textFillCssImage)(value);
    return jsxq_.jsx(FillPropertyRow, {
      editsAreUndoSteps,
      label: TEXT_COLOR_LABEL,
      value: node.color,
      mixed: colorMixed || fillMixed,
      effective: (0, runtime2.slideTextColor)(slideBg),
      swatches,
      readsContrast: !0,
      contrast,
      clearLabel: (0, runtime2.formatMessage)({ defaultMessage: "主题默认", id: "gH9y7vOehZ" }),
      onPick: (input) => updateNodes(callback((input2) => callback2(input2, input))),
      onLivePick: (input) => liveUpdateNodes(callback((input2) => callback2(input2, input))),
      onPickEnd: end,
      onReset: value !== void 0 || node.color !== void 0 ? () => updateNodes(callback((input) => callback2(input, void 0))) : void 0,
      chip: value3 !== void 0 && value !== void 0 ? {
        css: value3,
        text: value.kind === "image" ? FILL_IMAGE_LABEL : value.gradient.radial === !0 ? RADIAL_LABEL : LINEAR_LABEL
      } : void 0,
      headerTabs: value2.kind,
      panel: value2.face
    });
  }
  function defaultFillGradient(color, slideBg) {
    let value = (0, runtime2.stripHexAlpha)(color ?? (0, runtime2.slideTextColor)(slideBg)), value2 = runtime2.renderingNamedColors.clay ?? "#d97757", value3 = value.toLowerCase() === value2.toLowerCase() ? "#ffffff" : value2;
    return {
      angle: 90,
      stops: [
        {
          color: value,
          pos: 0
        },
        {
          color: mixHexColors(value, value3, 0.6),
          pos: 100
        }
      ]
    };
  }
  function mixHexColors(from, to2, amount) {
    let callback = (input, options) => parseInt(input.slice(1 + options * 2, 3 + options * 2), 16);
    return "#" + [0, 1, 2].map((input) => Math.round(callback(from, input) + (callback(to2, input) - callback(from, input)) * amount).toString(16).padStart(2, "0")).join("");
  }
  function ConnectorEndsPropertyRows({ node, selKey, mixedOf, updateNodes }) {
    return jsxq_.jsx(jsxq_.Fragment, {
      children: CONNECTOR_END_CHOICES.map(({ which, label }) => {
        let value = mixedOf((source) => source.kind === "shape" && source.shape === "connector" ? (0, runtime2.connectorArrowHeads)(source)[which] : null);
        return jsxq_.jsx(runtime2.SegmentedPropertyRow, {
          label,
          "data-testid": "sl-connector-head-" + which,
          options: CONNECTOR_ARROW_OPTIONS.map((input) => ({
            ...input,
            tooltip: (0, runtime2.formatMessage)({ defaultMessage: "{end}：{option}", id: "wb6x5wV/bE" }, { end: label, option: input.label })
          })),
          value: value ? void 0 : (0, runtime2.connectorArrowHeads)(node)[which],
          mixed: value,
          onChange: (input) => updateNodes((source) => source.kind === "shape" && source.shape === "connector" ? (0, runtime2.setConnectorArrowHeads)(source, {
            ...(0, runtime2.connectorArrowHeads)(source),
            [which]: input
          }) : source)
        }, selKey + ":connector-head-" + which);
      })
    });
  }
  function ConnectorDirectionPropertyRow({ value, onChange }) {
    let options = (0, runtime2.useExperimentalIconParts)().includes("icons") ? CONNECTOR_DIRECTION_ICON_CHOICES : CONNECTOR_DIRECTION_GLYPH_CHOICES;
    return jsxq_.jsx(runtime2.SegmentedPropertyRow, {
      label: (0, runtime2.formatMessage)({ defaultMessage: "方向", id: "gPl5n5mDxO" }),
      "data-testid": "sl-connector-direction",
      options,
      value,
      onChange,
      dir: "ltr"
    });
  }
  function TextResizePropertyRow({ nodes, updateNodes }) {
    let value = nodes.filter((input) => input?.kind === "text" || input?.kind === "table").map((input) => input.fit ?? runtime2.defaultTextFit);
    if (value.length === 0)
      return null;
    let value2 = value.some((input) => input !== value[0]);
    return jsxq_.jsx(runtime2.SelectPropertyRow, {
      label: (0, runtime2.formatMessage)({ defaultMessage: "调整大小", id: "6OLcYUujxH" }),
      title: (0, runtime2.formatMessage)({ defaultMessage: "内容超出幻灯片时，选择缩小文字以适应文本框、保持字号，或扩大文本框以防被所在列压缩", id: "9wGNghNWMP" }),
      options: [
        {
          value: "shrink",
          label: (0, runtime2.formatMessage)({ defaultMessage: "缩小文字以适应", id: "IFiexek+VK" })
        },
        {
          value: "none",
          label: (0, runtime2.formatMessage)({ defaultMessage: "保持文字大小", id: "IEG72u2Y3m" })
        },
        {
          value: "grow",
          label: (0, runtime2.formatMessage)({ defaultMessage: "扩大文本框以适应文字", id: "P2SUuqW9Z1" })
        }
      ],
      value: value2 ? "" : value[0],
      placeholder: (0, runtime2.untranslatedMessage)("混合"),
      onChange: (input) => updateNodes((source) => source.kind !== "text" && source.kind !== "table" || input === "" ? source : {
        ...source,
        fit: input
      })
    });
  }
  function SelectionInspector({ slide, selection, onChange, onLiveChange, onGestureEnd, deckCellCount, typeStyles, deckTypeStyles, faces, facesFull, fonts, measure, designColors, slideColors, assets, onReplaceImage, onRemoveImages, onRemoveCover, onChangeVideoLink, pickImage, editsAreUndoSteps, unasked }) {
    let value = (0, runtime2.useDeckColorChoices)(designColors, slideColors), [, value2] = runtime2.reactw8.useState(0), value3 = (0, runtime2.filterValidSelections)(slide, selection), value4 = value3.length > 0 ? value3[value3.length - 1] : void 0, value5 = value4 ? (0, runtime2.selectedNode)(slide, value4) : void 0, value6 = value3.length === 1, callback = (input) => {
      if (value3.length < 2)
        return !1;
      let value42 = value4 !== void 0 ? (0, runtime2.selectedNode)(slide, value4) : void 0;
      if (value42 === void 0)
        return !1;
      let value43 = input(value42);
      return value3.some((input2) => {
        let value44 = (0, runtime2.selectedNode)(slide, input2);
        return value44 !== void 0 && !(0, runtime2.styleValuesEqual)(input(value44), value43);
      });
    }, value7 = (0, runtime2.commonSelectedNodeKind)(slide, value3), value8 = value6 && value4 !== void 0 && value4.child !== void 0 ? (() => {
      let value42 = (0, runtime2.frameById)(slide, value4.frameId), value43 = (0, runtime2.parentNodeSelection)(value4), value44 = value43 !== void 0 ? (0, runtime2.selectedNode)(slide, value43) : void 0;
      if (value42 !== void 0 && value44 !== void 0 && (0, runtime2.isFlowContainer)(value44))
        return {
          ...value42,
          node: value44
        };
    })() : void 0, value9 = value6 && value4 !== void 0 && value4.child !== void 0 && value4.path === void 0 ? (() => {
      let value42 = (0, runtime2.frameById)(slide, value4.frameId);
      if (value42 !== void 0 && value42.node.kind === "overlay")
        return value42;
    })() : void 0, value10 = value9 !== void 0 && value4?.child !== void 0 && value4.child >= 1 ? value4.child - 1 : void 0, callback2 = (input, options) => {
      value9 === void 0 || value10 === void 0 || onChange((0, runtime2.updateSlideFrame)(slide, value9.id, (input2) => {
        if (input2.node.kind !== "overlay")
          return input2;
        let value42 = input2.node.layers[value10];
        if (!value42)
          return input2;
        let items4 = [...input2.node.layers], state = {
          ...value42,
          [input]: options(value42[input])
        }, callback27 = (input3) => input3.anchor !== "fill" && input3.size === void 0;
        return callback27(state[input]) && !callback27(value42[input]) && (state.node = (0, runtime2.resetImageDimensions)(state.node, input === "x", input === "y", assets ?? /* @__PURE__ */ new Map())), items4[value10] = state, {
          ...input2,
          node: {
            ...input2.node,
            layers: items4
          }
        };
      }));
    }, callback3 = (input, options) => {
      let state = {
        ...input.place,
        ...options
      };
      for (let value42 of Object.keys(state))
        state[value42] === void 0 && delete state[value42];
      let state2 = {
        ...input
      };
      return Object.keys(state).length === 0 ? delete state2.place : state2.place = state, state2;
    }, callback4 = (input) => callback13((input2) => callback3(input2, input)), callback5 = (input) => callback14((input2) => callback3(input2, input)), ref = runtime2.reactw8.useRef(null), ref2 = runtime2.reactw8.useRef(null), ref3 = runtime2.reactw8.useRef(null), ref4 = runtime2.reactw8.useRef(!1), ref5 = runtime2.reactw8.useRef(onLiveChange);
    ref5.current = onLiveChange, runtime2.reactw8.useEffect(() => (ref4.current = !1, () => {
      ref4.current = !0;
      let current = ref.current;
      ref.current = null, ref2.current = null, ref3.current = null, current !== null && ref5.current(current);
    }), []);
    let callback6 = (input) => {
      ref4.current || (ref.current === null && (ref.current = slide), ref3.current = input, onLiveChange(input));
    }, callback7 = () => {
      if (ref4.current)
        return;
      let current = ref.current;
      ref.current = null, ref2.current = null, ref3.current = null, current !== null && onGestureEnd(current);
    }, [value11, value12] = runtime2.reactw8.useState(!1);
    runtime2.reactw8.useEffect(() => {
      unasked || document.activeElement !== document.body && document.activeElement !== null || document.querySelector('[data-kit="panel-header"] button')?.focus({
        preventScroll: !0
      });
    }, []);
    let value13 = (0, runtime2.selectionsKey)(value3), [value14, value15] = runtime2.reactw8.useState({
      sel: "",
      keys: /* @__PURE__ */ new Set()
    }), callback8 = (input) => value14.sel === value13 && value14.keys.has(input), callback9 = (input) => value15((input2) => ({
      sel: value13,
      keys: /* @__PURE__ */ new Set([
        ...input2.sel === value13 ? input2.keys : [],
        input
      ])
    })), value16 = value4 !== void 0 ? value4.frameId + ":" + (0, runtime2.selectionNodePath)(value4).join(".") : "", [value17, value18] = runtime2.reactw8.useState(void 0);
    runtime2.reactw8.useLayoutEffect(() => {
      let value42 = value4 !== void 0 ? measure?.(value4) : void 0;
      value18((input) => input?.w === value42?.w && input?.h === value42?.h ? input : value42);
    }, [measure, value16, slide]);
    let callback11 = (input) => {
      let value42 = input.style ?? {}, callback27 = (input2) => typeof input2 == "number" ? input2 : void 0;
      return [
        callback27(value42.paddingTop),
        callback27(value42.paddingRight),
        callback27(value42.paddingBottom),
        callback27(value42.paddingLeft)
      ];
    }, items = [
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft"
    ], callback12 = (source, options, context) => {
      if (source.kind !== "stack" && source.kind !== "grid" && source.kind !== "overlay")
        return null;
      let value42 = callback11(source), value43 = source.kind === "overlay" ? void 0 : source.gap, value44 = callback((source2) => source2.kind === "stack" ? source2.dir : null), value45 = source.kind !== "overlay" && (0, runtime2.effectiveRowGap)(source) !== source.gap || callback((source2) => source2.kind === "stack" || source2.kind === "grid" ? [source2.gap, (0, runtime2.effectiveRowGap)(source2)] : null), withGap = (source2, gap) => {
        if (source2.kind !== "stack" && source2.kind !== "grid")
          return source2;
        let { rowGap: _rowGap, ...rest } = source2;
        return {
          ...rest,
          gap
        };
      }, value46 = callback((source2) => source2.kind === "stack" ? source2.justify ?? "start" : null), value47 = callback((source2) => source2.kind === "stack" ? source2.align : null), value48 = callback((source2) => source2.kind === "stack" ? source2.wrap === !0 : null), value49 = callback((input) => callback11(input)), value50 = callback((source2) => source2.kind === "grid" ? source2.columns : null), value51 = source.kind === "stack" && (source.justify === "between" || source.justify === "around" || source.justify === "evenly"), callback27 = (input, options2 = !1) => (options2 ? context : options)((source2) => source2.kind === "stack" || source2.kind === "grid" || source2.kind === "overlay" ? (0, runtime2.patchNodeStyle)(source2, Object.fromEntries(input.map((input2) => [
        items[input2.side],
        input2.value
      ]))) : source2);
      return jsxq_.jsxs(jsxq_.Fragment, {
        children: [
          jsxq_.jsx(runtime2.SelectPropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "布局", id: "S5qTK8c2P4" }),
            title: (0, runtime2.formatMessage)({ defaultMessage: "暂不支持在堆叠、网格和分层布局之间转换", id: "pTmcTI0nj9" }),
            options: [
              {
                value: "overlay",
                label: (0, runtime2.formatMessage)({ defaultMessage: "分层", id: "NonAZJo9ls" }),
                disabled: source.kind !== "overlay"
              },
              {
                value: "stack",
                label: (0, runtime2.formatMessage)({ defaultMessage: "堆叠", id: "8SlaVp4Sn0" }),
                disabled: source.kind !== "stack"
              },
              {
                value: "grid",
                label: (0, runtime2.formatMessage)({ defaultMessage: "网格", id: "8skuwjAgBV" }),
                disabled: source.kind !== "grid"
              }
            ],
            value: source.kind,
            onChange: () => {
            }
          }),
          source.kind === "stack" ? jsxq_.jsx(runtime2.SegmentedPropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "方向", id: "TvEdHjas0x" }),
            "data-testid": "sl-direction",
            options: [
              {
                value: "h",
                label: (0, runtime2.formatMessage)({ defaultMessage: "水平", id: "7G8UM7T9za" }),
                icon: "ArrowRight"
              },
              {
                value: "v",
                label: (0, runtime2.formatMessage)({ defaultMessage: "垂直", id: "zxzO/2Y5jA" }),
                icon: "ArrowDown"
              }
            ],
            value: source.dir,
            mixed: value44,
            onChange: (input) => options((source2) => {
              if (source2.kind !== "stack")
                return source2;
              let state = {
                ...source2,
                dir: input
              };
              return input === "v" && (delete state.wrap, delete state.rowGap), state;
            }),
            trailing: jsxq_.jsx(runtime2.Button, {
              variant: "ghost",
              iconOnly: !0,
              icon: "ArrowReturn",
              "aria-label": "换行",
              tooltip: value48 ? (0, runtime2.formatMessage)({ defaultMessage: "所选对象的换行设置不同，点击全部开启", id: "pRDRwzVqkd" }) : source.dir === "h" ? source.wrap === !0 ? (0, runtime2.formatMessage)({ defaultMessage: "子元素已换行，点击改为单行", id: "c0WYUtCu1p" }) : (0, runtime2.formatMessage)({ defaultMessage: "允许子元素换行", id: "fpdW7BANRi" }) : (0, runtime2.formatMessage)({ defaultMessage: "换行适用于水平堆叠布局", id: "1f4WvFMp/d" }),
              pressed: source.wrap === !0 && !value48,
              disabled: source.dir !== "h" || value44,
              "data-testid": "sl-wrap-toggle",
              onClick: () => options((source2) => {
                if (source2.kind !== "stack" || source2.dir !== "h")
                  return source2;
                let state = {
                  ...source2
                };
                return source.wrap === !0 && !value48 ? (delete state.wrap, delete state.rowGap) : state.wrap = !0, state;
              })
            })
          }) : null,
          source.kind === "grid" ? value50 ? jsxq_.jsx(runtime2.PropertyRow, {
            label: COLUMNS_LABEL,
            title: (0, runtime2.formatMessage)({ defaultMessage: "所选网格的列设置不同，请选择一个网格进行编辑", id: "2MXxhMQozK" }),
            children: jsxq_.jsx("span", {
              className: "text-footnote text-muted",
              children: runtime2.MIXED_LABEL
            })
          }) : jsxq_.jsx(GridTracksPropertyRows, {
            label: COLUMNS_LABEL,
            tracks: source.columns,
            onChange: (input) => options((source2) => source2.kind === "grid" ? {
              ...source2,
              columns: input
            } : source2)
          }) : null,
          source.kind === "stack" ? jsxq_.jsx(runtime2.PropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "对齐", id: "NJRRq+KYzu" }),
            "data-testid": "sl-alignment",
            trailing: jsxq_.jsx(runtime2.Button, {
              variant: "ghost",
              iconOnly: !0,
              icon: jsxq_.jsx(runtime2.PropertyIcon, {
                icon: runtime2.DEFAULT_JUSTIFY_ICON
              }),
              "aria-label": "分布",
              tooltip: value46 ? (0, runtime2.formatMessage)({ defaultMessage: "所选对象的分布设置不同，点击统一分布", id: "AtSkGl/0xL" }) : value51 ? (0, runtime2.formatMessage)({ defaultMessage: "两端分布，点击改为紧密排列", id: "kqtOEJJFCQ" }) : (0, runtime2.formatMessage)({ defaultMessage: "两端分布，需要主轴有剩余空间", id: "jmUQwLQsmj" }),
              pressed: value51 && !value46,
              "data-testid": "sl-distribute",
              className: source.dir === "v" ? "shrink-0 rotate-90" : "shrink-0",
              onClick: () => options((source2) => {
                if (source2.kind !== "stack")
                  return source2;
                let state = {
                  ...source2
                };
                return value51 && !value46 ? delete state.justify : state.justify = "between", state;
              })
            }),
            onReset: source.justify !== void 0 || source.align !== "stretch" ? () => options((source2) => {
              if (source2.kind !== "stack")
                return source2;
              let state = {
                ...source2,
                align: "stretch"
              };
              return delete state.justify, state;
            }) : void 0,
            children: jsxq_.jsx("div", {
              className: "flex min-w-0 flex-1 flex-wrap items-center gap-2",
              children: source.kind === "stack" ? jsxq_.jsxs(jsxq_.Fragment, {
                children: [
                  jsxq_.jsx("span", {
                    className: "min-w-[calc(var(--cds-h-control)*3)] flex-1",
                    title: source.justify !== void 0 && source.justify !== "start" && source.justify !== "center" && source.justify !== "end" ? (0, runtime2.formatMessage)({ defaultMessage: "自动计算，由分布设置决定此轴", id: "Rm1XXvWu5N" }) : void 0,
                    children: jsxq_.jsx(runtime2.SegmentedPropertyControl, {
                      label: "两端对齐",
                      "data-testid": "sl-justify",
                      compact: !0,
                      vertical: source.dir === "v",
                      options: [
                        {
                          value: "start",
                          label: (0, runtime2.formatMessage)({ defaultMessage: "主轴起点对齐", id: "p2hcfcRv2x" }),
                          glyph: runtime2.JUSTIFY_ICONS.start
                        },
                        {
                          value: "center",
                          label: (0, runtime2.formatMessage)({ defaultMessage: "主轴居中对齐", id: "J4T6GkpgUT" }),
                          glyph: runtime2.JUSTIFY_ICONS.center
                        },
                        {
                          value: "end",
                          label: (0, runtime2.formatMessage)({ defaultMessage: "主轴终点对齐", id: "/vBdklTsgH" }),
                          glyph: runtime2.JUSTIFY_ICONS.end
                        }
                      ],
                      value: source.justify === "center" || source.justify === "end" ? source.justify : void 0,
                      inherited: !value46 && (source.justify === void 0 || source.justify === "start") ? "start" : void 0,
                      mixed: value46,
                      disabled: value51 && !value46,
                      onChange: (input) => options((source2) => {
                        if (source2.kind !== "stack")
                          return source2;
                        let state = {
                          ...source2
                        };
                        return input === "start" ? delete state.justify : state.justify = input, state;
                      })
                    })
                  }),
                  jsxq_.jsx("span", {
                    className: "min-w-[calc(var(--cds-h-control)*3)] flex-1",
                    children: jsxq_.jsx(runtime2.SegmentedPropertyControl, {
                      label: "对齐",
                      "data-testid": "sl-align",
                      compact: !0,
                      vertical: source.dir === "v",
                      options: [
                        {
                          value: "start",
                          label: (0, runtime2.formatMessage)({ defaultMessage: "交叉轴起点对齐", id: "6B8Gdtuugg" }),
                          glyph: runtime2.ALIGN_ICONS.start
                        },
                        {
                          value: "center",
                          label: (0, runtime2.formatMessage)({ defaultMessage: "交叉轴居中对齐", id: "tbCDeZzFCr" }),
                          glyph: runtime2.ALIGN_ICONS.center
                        },
                        {
                          value: "end",
                          label: (0, runtime2.formatMessage)({ defaultMessage: "交叉轴终点对齐", id: "zbNwq5wfer" }),
                          glyph: runtime2.ALIGN_ICONS.end
                        }
                      ],
                      value: source.align === "start" || source.align === "center" || source.align === "end" ? source.align : void 0,
                      mixed: value47,
                      onChange: (input) => options((source2) => source2.kind === "stack" ? {
                        ...source2,
                        align: input
                      } : source2)
                    })
                  })
                ]
              }) : null
            })
          }) : null,
          value43 !== void 0 ? jsxq_.jsx(runtime2.NumberPropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "间隙", id: "Lgu1iQOts9" }),
            value: value45 ? void 0 : value43,
            mixed: value45,
            min: 0,
            max: 512,
            onValue: (input) => options((source2) => withGap(source2, input ?? 0)),
            onScrub: (input) => context((source2) => withGap(source2, input)),
            onScrubEnd: callback7
          }) : null,
          jsxq_.jsx(runtime2.SidesPropertyRow, {
            label: PADDING_LABEL,
            "data-testid": "sl-container-padding",
            values: value42,
            placeholders: ZERO_SIDE_PLACEHOLDERS,
            min: 0,
            max: 256,
            mixed: value49,
            onSides: (input) => callback27(input),
            onScrubSides: (input) => callback27(input, !0),
            onScrubEnd: callback7,
            onReset: value42.some((input) => input !== void 0) ? () => callback27(EMPTY_SIDE_VALUES) : void 0
          })
        ]
      });
    };
    if (value5 === void 0)
      return jsxq_.jsxs("div", {
        className: "flex h-full flex-col overflow-y-auto pb-1 [--pp-label-w:72px] " + runtime2.HIDDEN_NATIVE_SCROLLBAR_CLASS,
        children: [
          jsxq_.jsx(runtime2.PropertySection, {
            title: (0, runtime2.formatMessage)({ defaultMessage: "幻灯片", id: "wKo+QURBXE" }),
            children: jsxq_.jsx(runtime2.SelectPropertyRow, {
              label: (0, runtime2.formatMessage)({ defaultMessage: "切换效果", id: "n8kc4QqjOC" }),
              title: (0, runtime2.formatMessage)({ defaultMessage: "放映时从此页切换到下一页的方式", id: "HdonY4q0+o" }),
              options: SLIDE_TRANSITION_OPTIONS,
              value: slide.transition ?? "none",
              onChange: (input) => {
                let state = {
                  ...slide
                };
                input === "none" ? delete state.transition : state.transition = input, onChange(state);
              }
            })
          }),
          jsxq_.jsx(runtime2.PropertySection, {
            title: APPEARANCE_LABEL,
            children: jsxq_.jsx(FillPropertyRow, {
              editsAreUndoSteps,
              label: BACKGROUND_LABEL,
              value: slide.bg,
              swatches: value.rows,
              onPick: (input) => {
                input !== void 0 && onChange({
                  ...slide,
                  bg: input
                });
              },
              onLivePick: (input) => callback6({
                ...slide,
                bg: input
              }),
              onPickEnd: callback7
            })
          }),
          slide.transition === "magic" ? jsxq_.jsx("p", {
            className: "mt-2 shrink-0 pr-md pl-lg text-footnote text-muted",
            children: (0, runtime2.formatMessage)({ defaultMessage: "平滑移动会将两页共有的元素移动到新位置。先复制幻灯片，再移动或调整元素大小，复制后的元素会保留用于匹配的标识。", id: "dfZZm03iWA" })
          }) : null,
          jsxq_.jsx(runtime2.ScrollbarOverlay, {})
        ]
      });
    let callback13 = (input, options) => onChange(value3.reduce((input2, options2) => (0, runtime2.updateSelectedNode)(input2, options2, input), slide), options), callback14 = (input) => callback6(value3.reduce((input2, options) => (0, runtime2.updateSelectedNode)(input2, options, input), slide)), value19 = value5, value20, value21 = value7 === "shape" && value4 !== void 0 && value3.every((input) => {
      let value42 = (0, runtime2.selectedNode)(slide, input);
      return value42?.kind === "shape" && value42.shape === "line";
    }) && (0, runtime2.nodeThicknessIsWritable)(slide, value4.frameId, (0, runtime2.selectionNodePath)(value4)), value22 = value21 ? value3.map((input) => (0, runtime2.nodeThickness)(slide, input.frameId, (0, runtime2.selectionNodePath)(input))) : [], value23 = value22[value22.length - 1], value24 = value22.some((input) => input !== value23), value25 = value21 && value17?.w !== void 0 && value17.h !== void 0 ? Math.round(Math.min(value17.w, value17.h)) : void 0, value26 = value19.kind === "img" ? value19.asset !== void 0 ? assets?.get(value19.asset) : value19.src : void 0, hasCustomCover = value19.kind === "img" && (0, runtime2.imageHasPoster)(value19) && !0, callback15 = (input, options) => (ref.current && (0, runtime2.selectedNode)(ref.current, input)) ?? options, callback16 = (input) => callback6(value3.reduce((input2, options) => (0, runtime2.updateSelectedNode)(input2, options, (input3) => input(input3, callback15(options, input3))), slide)), callback17 = (input) => {
      if (value19.kind !== "table" || !value6)
        return;
      ref2.current === null && (ref2.current = value19);
      let current = ref2.current;
      callback14(() => input(current));
    }, value27 = runtime2.maxTableColumns, value28 = runtime2.maxTableRows;
    if (value19.kind === "table") {
      let value42 = (0, runtime2.countNodeTableCells)(value19), value43 = (0, runtime2.countSlideTableCells)(slide), value44 = deckCellCount !== void 0 && Number.isFinite(deckCellCount) ? deckCellCount : value43, value45 = value43 - value42, value46 = value44 - value42, value47 = Math.max(0, Math.min(runtime2.maxSlideTableCells - value45, runtime2.maxDeckTableCells - value46));
      value27 = Math.max(value19.cols, Math.min(runtime2.maxTableColumns, Math.floor(value47 / Math.max(1, value19.rows.length)))), value28 = Math.max(value19.rows.length, Math.min(runtime2.maxTableRows, Math.floor(value47 / value19.cols)));
    }
    let callback18 = (source) => source.kind === "text" || source.kind === "stack" || source.kind === "grid" || source.kind === "overlay" || source.kind === "table", callback19 = (input, options = !1) => (options ? callback14 : callback13)((input2) => callback18(input2) ? (0, runtime2.patchNodeStyle)(input2, Object.fromEntries(input.map((input3) => [
      items[input3.side],
      input3.value
    ]))) : input2), value29 = value3.some((input) => {
      let value42 = (0, runtime2.selectedNode)(slide, input);
      return value42 !== void 0 && callback11(value42).some((input2, options) => input2 !== callback11(value19)[options]);
    }), value30 = value20 === "slides-text" || value20 === "slides-stack" || value20 === "slides-table" ? jsxq_.jsx(runtime2.SidesPropertyRow, {
      label: PADDING_LABEL,
      "data-testid": "sl-padding",
      values: callback11(value19),
      placeholders: (0, runtime2.textListGutter)(value19, slide.lists) !== void 0 ? ["0", "0", "0", String(runtime2.defaultListGutter)] : ZERO_SIDE_PLACEHOLDERS,
      min: 0,
      max: 256,
      mixed: value29,
      onSides: (input) => callback19(input),
      onScrubSides: (input) => callback19(input, !0),
      onScrubEnd: callback7,
      onReset: callback11(value19).some((input) => input !== void 0) ? () => callback19(EMPTY_SIDE_VALUES) : void 0
    }) : null, value31 = (() => {
      let values2 = /* @__PURE__ */ new Set();
      if (value3.length < 2)
        return values2;
      let value42 = value3.map((input) => (0, runtime2.selectedNode)(slide, input)?.style ?? {}), values3 = new Set(value42.flatMap((input) => Object.keys(input)));
      for (let value43 of values3)
        value42.some((input) => !(0, runtime2.styleValuesEqual)(input[value43] ?? null, value42[0][value43] ?? null)) && values2.add(value43);
      return values2;
    })(), callback20 = (input, options) => value20 !== void 0 ? jsxq_.jsx(runtime2.StyleInspector, {
      kind: value20,
      bag: value19.style,
      swatches: value.rows,
      clearKeys: {
        backgroundColor: ["backgroundGradient"]
      },
      mixedKeys: value31,
      onlyKeys: options,
      onCommit: (input2, options2) => callback13((input3) => input3),
      onLive: (input2, options2) => callback14((input3) => input3),
      onLiveEnd: callback7
    }, value13 + ":appearance" + input) : null, items2 = [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius"
    ], callback21 = (source) => {
      let value42;
      return value42 === "slides-text" || value42 === "slides-stack" || value42 === "slides-table" || value42 === "slides-img" || value42 === "slides-shape" && source.kind === "shape" && source.shape === "rect";
    }, callback22 = (input) => {
      let style = input.style, value42 = typeof style?.borderRadius == "number" ? style.borderRadius : void 0, callback27 = (input2) => typeof style?.[input2] == "number" ? style[input2] : value42;
      return [
        callback27(items2[0]),
        callback27(items2[1]),
        callback27(items2[2]),
        callback27(items2[3])
      ];
    }, callback23 = (items4, options = !1) => (options ? callback14 : callback13)((input) => {
      if (!callback21(input))
        return input;
      if (items4.length === 4 && items4.every((input2) => input2.value === items4[0].value)) {
        let value43 = items4[0].value ?? 0;
        return (0, runtime2.patchNodeStyle)(input, (0, runtime2.borderRadiusPatch)({
          tl: value43,
          tr: value43,
          br: value43,
          bl: value43
        }));
      }
      let value42 = (0, runtime2.borderRadiiByCorner)(input.style), items5 = [value42.tl, value42.tr, value42.br, value42.bl];
      for (let value43 of items4)
        items5[value43.side] = value43.value ?? 0;
      return (0, runtime2.patchNodeStyle)(input, (0, runtime2.borderRadiusPatch)({
        tl: items5[0],
        tr: items5[1],
        br: items5[2],
        bl: items5[3]
      }));
    }), value32 = value3.some((input) => {
      let value42 = (0, runtime2.selectedNode)(slide, input);
      return value42 !== void 0 && callback22(value42).some((input2, options) => input2 !== callback22(value19)[options]);
    }), value33 = value20 !== void 0 && callback21(value19) ? jsxq_.jsx(runtime2.CornersPropertyRow, {
      label: (0, runtime2.formatMessage)({ defaultMessage: "半径", id: "1tsbkW75J5" }),
      "data-testid": "sl-radius",
      values: callback22(value19),
      placeholders: ZERO_SIDE_PLACEHOLDERS,
      min: 0,
      max: 256,
      mixed: value32,
      onSides: (input) => callback23(input),
      onScrubSides: (input) => callback23(input, !0),
      onScrubEnd: callback7,
      onReset: callback22(value19).some((input) => input !== void 0) ? () => callback23(EMPTY_SIDE_VALUES) : void 0
    }, value13 + ":radius") : null, items3 = [
      {
        value: "none",
        label: (0, runtime2.formatMessage)({ defaultMessage: "无", id: "2ZaRAAJpeJ" }),
        icon: "Prohibit"
      },
      {
        value: "solid",
        label: SOLID_LABEL,
        glyph: runtime2.BORDER_SOLID_ICON
      },
      {
        value: "dashed",
        label: DASHED_LABEL,
        glyph: runtime2.BORDER_DASHED_ICON
      },
      {
        value: "dotted",
        label: (0, runtime2.formatMessage)({ defaultMessage: "点线", id: "a8uD10PjN2" }),
        glyph: runtime2.BORDER_DOTTED_ICON
      }
    ], text = "#141413", value34 = (() => {
      if (value20 === void 0)
        return null;
      let style = value19.style, value42 = (0, runtime2.borderWidthsBySide)(style), items4 = [
        value42.top,
        value42.right,
        value42.bottom,
        value42.left
      ], value43 = items4.some((input) => input > 0), value44 = style?.borderStyle, value45 = !value43 || value44 === void 0 || value44 === "none" ? "none" : value44 === "double" ? "solid" : value44, value46 = value44 !== void 0, callback27 = (input) => !1, callback28 = (input) => callback13((source) => {
        if (!callback27(source) || source.kind === "shape" && source.shape === "line" && input !== "none" && input !== "solid")
          return source;
        if (input === "none")
          return (0, runtime2.ensureShapeFill)((0, runtime2.patchNodeStyle)(source, {
            ...runtime2.BORDER_STYLE_CLEAR_PATCH
          }));
        let style2 = source.style, value49 = (0, runtime2.borderWidthsBySide)(style2), value50 = style2?.borderStyle !== void 0 && style2.borderStyle !== "none" && (value49.top > 0 || value49.right > 0 || value49.bottom > 0 || value49.left > 0);
        return (0, runtime2.patchNodeStyle)(source, {
          borderStyle: input,
          ...!value50 && (style2?.borderWidth ?? 0) === 0 && !(0, runtime2.hasPerSideBorderWidths)(style2) ? {
            borderWidth: 1
          } : {},
          ...style2?.borderColor === void 0 ? {
            borderColor: text
          } : {}
        });
      }), items5 = ["top", "right", "bottom", "left"], callback29 = (input, options) => {
        let state = {
          ...(0, runtime2.borderWidthsBySide)(input)
        };
        for (let value49 of options)
          state[items5[value49.side]] = value49.value ?? 0;
        return state;
      }, callback30 = (items6) => items6.length === 4 && items6.every((input) => input.value === items6[0].value), callback31 = (input) => callback30(input) ? (input[0].value ?? 0) === 0 : !isNonConnectorShape(value19) && Object.values(callback29(style, input)).every((input2) => input2 === 0), callback32 = (input) => input > 0 && input < 1 ? input : 1, callback33 = (input, options = !1) => (options ? callback14 : callback13)((input2) => {
        if (!callback27(input2))
          return input2;
        let style2 = input2.style;
        if (callback30(input)) {
          let value50 = input[0].value ?? 0;
          return value50 === 0 && !options ? (0, runtime2.ensureShapeFill)((0, runtime2.patchNodeStyle)(input2, {
            ...runtime2.BORDER_STYLE_CLEAR_PATCH
          })) : (0, runtime2.ensureShapeFill)((0, runtime2.patchNodeStyle)(input2, (0, runtime2.normalizedBorderPatch)((0, runtime2.ensureVisibleBorderStyle)(style2, (0, runtime2.setBorderWidthsPreservingSides)(style2, options && value50 === 0 ? callback32(Math.max(...Object.values((0, runtime2.borderWidthsBySide)(style2)))) : value50), text))));
        }
        if (isNonConnectorShape(input2))
          return input2;
        let value49 = callback29(style2, input);
        if (options && Object.values(value49).every((input3) => input3 === 0))
          for (let value50 of input)
            value49[items5[value50.side]] = callback32((0, runtime2.borderWidthsBySide)(style2)[items5[value50.side]]);
        return (0, runtime2.ensureShapeFill)((0, runtime2.patchNodeStyle)(input2, (0, runtime2.normalizedBorderPatch)((0, runtime2.ensureVisibleBorderStyle)(style2, (0, runtime2.borderPatchFromWidths)(value49), text))));
      }), callback34 = (input) => {
        let value49 = (0, runtime2.borderWidthsBySide)(input.style), value50 = input.style?.borderStyle;
        return !(value49.top > 0 || value49.right > 0 || value49.bottom > 0 || value49.left > 0) || value50 === void 0 || value50 === "none" ? "none" : value50 === "double" ? "solid" : value50;
      }, value47 = callback((input) => callback34(input)), value48 = callback((input) => {
        let value49 = (0, runtime2.borderWidthsBySide)(input.style);
        return [value49.top, value49.right, value49.bottom, value49.left];
      });
      return jsxq_.jsxs(jsxq_.Fragment, {
        children: [
          jsxq_.jsx(runtime2.SegmentedPropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "边框", id: "DfO2Fpaov9" }),
            "data-testid": "sl-border-style",
            options: value19.kind === "shape" && value19.shape === "line" ? items3.map((input) => input.value === "dashed" || input.value === "dotted" ? {
              ...input,
              whyDisabled: LINE_DASH_REASON
            } : input) : items3,
            value: value47 ? void 0 : value45,
            mixed: value47,
            title: value46 ? void 0 : (0, runtime2.formatMessage)({ defaultMessage: "无边框", id: "Zjodgf0+ii" }),
            onChange: callback28,
            onReset: value46 ? () => callback28("none") : void 0
          }, value13 + ":border-style"),
          value45 !== "none" ? jsxq_.jsxs(jsxq_.Fragment, {
            children: [
              jsxq_.jsx(runtime2.ColorTextPropertyRow, {
                label: TEXT_COLOR_LABEL,
                editsAreUndoSteps,
                value: style?.borderColor,
                mixed: callback((input) => input.style?.borderColor ?? null),
                swatches: value.rows,
                popoverTitle: runtime2.COLOR_LABEL,
                onChange: (input) => {
                  input !== void 0 && callback13((input2) => callback27(input2) ? (0, runtime2.patchNodeStyle)(input2, (0, runtime2.borderColorPatch)(input2.style, input)) : input2);
                },
                onLive: (input) => callback14((input2) => callback27(input2) ? (0, runtime2.patchNodeStyle)(input2, (0, runtime2.borderColorPatch)(input2.style, input)) : input2),
                onLiveEnd: callback7,
                onReset: style?.borderColor !== void 0 && style.borderColor.toLowerCase() !== text ? () => callback13((input) => callback27(input) ? (0, runtime2.patchNodeStyle)(input, (0, runtime2.borderColorPatch)(input.style, text)) : input) : void 0
              }, value13 + ":border-color"),
              jsxq_.jsx(runtime2.SidesPropertyRow, {
                label: STROKE_WIDTH_LABEL,
                "data-testid": "sl-border-width",
                values: items4,
                min: 0,
                max: isNonConnectorShape(value19) ? runtime2.maxShapeStrokeWidth : 16,
                mixed: value48,
                toggleDisabledReason: isNonConnectorShape(value19) ? runtime2.SHAPE_BORDER_SIDES_REASON : void 0,
                onSides: (input) => callback33(input),
                onScrubSides: (input) => callback33(input, !0),
                onScrubEnd: (items6) => {
                  ref4.current || (callback7(), items6.length > 0 && callback31(items6) && callback33(items6));
                },
                onReset: (0, runtime2.hasPerSideBorderWidths)(style) || style?.borderWidth !== void 0 && style.borderWidth !== 1 || style?.borderSides !== void 0 ? () => callback13((input) => callback27(input) ? (0, runtime2.patchNodeStyle)(input, (0, runtime2.normalizedBorderPatch)((0, runtime2.ensureVisibleBorderStyle)(input.style, (0, runtime2.borderPatchFromWidths)({
                  top: 1,
                  right: 1,
                  bottom: 1,
                  left: 1
                }), text))) : input) : void 0
              }, value13 + ":border-width")
            ]
          }) : null
        ]
      });
    })(), value35 = (() => {
      if (value20 === void 0)
        return null;
      let style = value19.style, value42 = style?.backgroundGradient, value43 = value42 !== void 0 ? (0, runtime2.styleBagToCss)({
        backgroundGradient: value42
      }, "slides-stack").backgroundImage : void 0, value44 = (0, runtime2.stylePropertyAppliesToNode)("backgroundGradient", value20), callback27 = (input, options) => {
        let value51;
        return value51 !== void 0 && Object.keys(options).every((input2) => options[input2] === void 0 || (0, runtime2.stylePropertyAppliesToNode)(input2, value51));
      }, callback28 = (input) => callback13((input2) => callback27(input2, input) ? (0, runtime2.patchNodeStyle)(input2, input) : input2), callback29 = (input) => callback14((input2) => callback27(input2, input) ? (0, runtime2.patchNodeStyle)(input2, input) : input2), value45 = (0, runtime2.createStyleEditor)({
        kind: value20,
        bag: style,
        swatches: value.rows,
        unifiedColorPopover: !0,
        onCommit: (input, options) => callback28(options),
        onLive: (input, options) => callback29(options),
        onLiveEnd: callback7
      }), value46 = style?.backgroundColor !== void 0 || value42 !== void 0, value47 = callback((input) => [
        input.style?.backgroundColor ?? null,
        input.style?.backgroundGradient ?? null
      ]), value48 = isNonConnectorShape(value19), callback30 = () => callback13((input) => callback27(input, {
        backgroundColor: void 0
      }) ? (0, runtime2.updateNodeShapeStyle)(input, {
        backgroundColor: void 0,
        backgroundGradient: void 0
      }) : input), callback31 = () => callback13((input) => callback27(input, {
        backgroundColor: void 0
      }) ? (0, runtime2.ensureShapeFill)((0, runtime2.patchNodeStyle)(input, {
        backgroundColor: void 0,
        backgroundGradient: void 0
      })) : input), value49 = !value48 || value3.some((input) => {
        let value51 = (0, runtime2.selectedNode)(slide, input);
        return value51 !== void 0 && isNonConnectorShape(value51) && value51.style?.backgroundColor !== void 0 && (0, runtime2.shapeHasOutline)(value51.style);
      }), value50 = value48 && value3.every((input) => {
        let value51 = (0, runtime2.selectedNode)(slide, input);
        return value51 === void 0 || !isNonConnectorShape(value51) || ((0, runtime2.shapeHasOutline)(value51.style) ? value51.style?.backgroundColor === void 0 : isDefaultShapeFill(value51.style?.backgroundColor));
      });
      return jsxq_.jsx(runtime2.ColorTextPropertyRow, {
        label: BACKGROUND_LABEL,
        editsAreUndoSteps,
        value: style?.backgroundColor,
        mixed: value47,
        swatches: value.rows,
        clearLabel: value50 && style?.backgroundColor !== void 0 ? void 0 : (0, runtime2.formatMessage)({ defaultMessage: "无", id: "L6CQbVSPFA" }),
        noneDisabledReason: value49 || !value46 && !value47 ? void 0 : runtime2.BORDER_REQUIRED_REASON,
        onNone: value48 ? callback30 : void 0,
        popoverTitle: runtime2.COLOR_LABEL,
        allowNone: !0,
        isNone: !value46 && !value47,
        chip: !value47 && typeof value43 == "string" ? {
          css: value43,
          text: value42.radial === !0 ? RADIAL_LABEL : LINEAR_LABEL
        } : void 0,
        ...value44 && !value47 ? {
          headerTabs: {
            value: !value47 && value42 !== void 0 ? "gradient" : "color",
            options: [
              {
                value: "color",
                label: FILL_COLOR_LABEL
              },
              {
                value: "gradient",
                label: FILL_GRADIENT_LABEL
              }
            ],
            onChange: (input) => {
              input === "gradient" && value42 === void 0 && callback28({
                backgroundGradient: (0, runtime2.defaultStylePropertyValue)("backgroundGradient", value20)
              }), input === "color" && value42 !== void 0 && callback28({
                backgroundGradient: void 0
              });
            }
          },
          panel: value42 !== void 0 ? jsxq_.jsx("div", {
            "data-testid": "sl-fill-gradient-panel",
            children: jsxq_.jsx(runtime2.GradientPickerStyleEditor, {
              rec: value42,
              propKey: "backgroundGradient",
              ed: value45
            })
          }) : null
        } : {},
        onChange: (input) => {
          input === void 0 ? callback30() : callback28({
            backgroundColor: input,
            backgroundGradient: void 0
          });
        },
        onLive: (input) => callback29({
          backgroundColor: input,
          backgroundGradient: void 0
        }),
        onLiveEnd: callback7,
        onReset: value48 ? value50 ? void 0 : callback31 : value46 ? callback30 : void 0,
        trailing: value46 ? jsxq_.jsx("span", {
          className: "contents",
          onClickCapture: value49 ? focusPropertyRowControl : void 0,
          children: jsxq_.jsx(runtime2.RemovePropertyButton, {
            label: "背景",
            disabled: !value49,
            disabledReason: runtime2.BORDER_REQUIRED_REASON,
            onClick: callback30
          })
        }) : void 0
      }, value13 + ":fill");
    })(), value36 = value20 !== void 0 ? jsxq_.jsxs(jsxq_.Fragment, {
      children: [
        value35,
        callback20("", ["opacity"]),
        value33,
        value34
      ]
    }) : null, callback24 = (input) => {
      let value42 = input.style?.backgroundColor, value43 = (0, runtime2.borderWidthsBySide)(input.style);
      return value42 !== void 0 && !isTransparentStyleColor(value42) || input.style?.backgroundGradient !== void 0 || value43.top > 0 || value43.right > 0 || value43.bottom > 0 || value43.left > 0;
    }, callback25 = (source) => source.kind === "text" && !callback24(source), callback26 = (source) => source.kind === "text" && source.fill !== void 0, value37 = callback25(value19) && !callback(callback25) ? "text" : "box", value38 = value37 === "text" && (callback26(value19) || callback(callback26)) ? TEXT_SHADOW_FILL_REASON : void 0, values = /* @__PURE__ */ new Set([
      ...value19.kind === "text" ? [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "textDecorationLine"
      ] : [],
      ...value19.kind === "table" ? ["textAlign"] : [],
      "backgroundColor",
      "backgroundGradient",
      "opacity",
      "borderRadius",
      "borderWidth",
      "borderColor",
      "borderStyle",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "cursor",
      ...value37 === "text" ? ["textShadow"] : []
    ]), value39 = value19.kind === "text" && value19.fill !== void 0 ? /* @__PURE__ */ new Map([["textShadow", TEXT_SHADOW_FILL_REASON]]) : void 0, value40 = value8 !== void 0 && value4 !== void 0 && (0, runtime2.selectionNodePath)(value4).length === 1 && (0, runtime2.isPrimaryLayoutFrame)(slide, value8), value41 = value8 !== void 0 && (!value40 || value8.node.kind === "grid") ? (() => {
      let value42 = !value40, node = value8.node;
      if (!(0, runtime2.isFlowContainer)(node))
        return;
      let place = value5.place, value43 = node.kind === "grid", value44 = node.kind === "grid" ? {
        kind: "grid",
        alignItems: node.alignItems,
        justifyItems: node.justifyItems
      } : {
        kind: "stack",
        dir: node.dir,
        align: node.align
      }, value45 = (0, runtime2.childSizeMode)(value5, value44, "w"), value46 = (0, runtime2.childSizeMode)(value5, value44, "h"), value47 = (0, runtime2.childSizeModeOptions)(value5, value44, "w").length > 0, callback27 = (input) => value47 && !(0, runtime2.isMediaSizeNode)(value5) && (input === "w" ? value45 : value46).mode === "fixed", items4 = ["minW", "maxW", "minH", "maxH"], items5 = [
        ...callback27("w") ? [] : [
          {
            key: "minW",
            label: MIN_WIDTH_LABEL,
            authored: place?.minW !== void 0
          },
          {
            key: "maxW",
            label: MAX_WIDTH_LABEL,
            authored: place?.maxW !== void 0
          }
        ],
        ...callback27("h") ? [] : [
          {
            key: "minH",
            label: MIN_HEIGHT_LABEL,
            authored: place?.minH !== void 0
          },
          {
            key: "maxH",
            label: MAX_HEIGHT_LABEL,
            authored: place?.maxH !== void 0
          }
        ]
      ], callback28 = (input) => items5.some((input2) => input2.key === input && (input2.authored || callback8("layout:" + input))), callback29 = (input, options) => {
        let value49 = (0, runtime2.childSizeModeOptions)(value5, value44, input);
        if (value49.length === 0)
          return null;
        let value50 = input === "w" ? value45 : value46, value51 = value17 !== void 0 ? input === "w" ? value17.w : value17.h : void 0, [value52, value53] = (0, runtime2.dimensionLimitKeys)(input);
        return jsxq_.jsx(runtime2.NumberPropertyRow, {
          label: options,
          value: value50.mode === "fixed" ? value50.value : void 0,
          min: 1,
          max: 4096,
          step: 8,
          unit: value50.mode === "fixed" ? (0, runtime2.literalMessage)("px") : void 0,
          clearable: value49.some((input2) => input2.value === "hug"),
          placeholder: value51 !== void 0 ? String(value51) : AUTO_LABEL,
          emptyStepFrom: value51,
          title: (0, runtime2.formatMessage)({
            defaultMessage: "{label}：适应内容会随内容调整尺寸；固定使用指定尺寸；填充占用组合分配的空间。",
            id: "zxUhR81GlB"
          }, { label: options }),
          onReset: (0, runtime2.canResetChildSizeMode)(value5, value44, input) ? () => callback13((input2) => (0, runtime2.resetChildSizeMode)(input2, value44, input)) : void 0,
          onValue: (input2) => callback13((input3) => input2 === void 0 ? (0, runtime2.updateChildSizeMode)(input3, value44, input, "hug") : (0, runtime2.updateChildSizeMode)(input3, value44, input, "fixed", input2)),
          onScrub: (input2) => callback14((input3) => (0, runtime2.updateChildSizeMode)(input3, value44, input, "fixed", input2)),
          onScrubEnd: callback7,
          adornment: jsxq_.jsx(runtime2.Select, {
            compact: !0,
            align: "end",
            "aria-label": options + "模式",
            items: value49,
            value: value50.mode,
            disabled: value49.length < 2,
            onChange: (input2) => {
              if (input2 === value50.mode)
                return;
              if (input2 !== "fixed") {
                callback13((input3) => (0, runtime2.updateChildSizeMode)(input3, value44, input, input2));
                return;
              }
              let value54 = value4 !== void 0 ? measure?.(value4) : void 0, value55 = (value54 !== void 0 ? input === "w" ? value54.w : value54.h : void 0) ?? place?.[value53] ?? place?.[value52];
              value55 !== void 0 && callback13((input3) => (0, runtime2.updateChildSizeMode)(input3, value44, input, "fixed", value55));
            }
          })
        });
      }, value48 = value42 ? items5.filter((input) => !callback28(input.key) && (value47 || !items4.includes(input.key))).map((input) => ({
        label: input.label,
        onSelect: () => callback9("layout:" + input.key)
      })) : [];
      if (!(!(value42 && (value47 || (0, runtime2.childSizeModeOptions)(value5, value44, "h").length > 0) || items4.some((input) => value42 && callback28(input)) || value43) && value48.length === 0))
        return {
          addItems: value48,
          rows: jsxq_.jsxs(jsxq_.Fragment, {
            children: [
              value42 ? callback29("w", SIZE_WIDTH_LABEL) : null,
              value42 ? callback29("h", SIZE_HEIGHT_LABEL) : null,
              value42 && callback28("minW") ? jsxq_.jsx("div", {
                className: "contents",
                onKeyDownCapture: propertyRemovalKeyHandler,
                children: jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: MIN_WIDTH_LABEL,
                  value: value5.place?.minW,
                  min: 0,
                  max: 4096,
                  step: 8,
                  clearable: !0,
                  placeholder: "0",
                  onReset: place?.minW !== void 0 ? () => callback4({
                    minW: void 0
                  }) : void 0,
                  onValue: (input) => callback4({
                    minW: input
                  }),
                  onScrub: (input) => callback5({
                    minW: input
                  }),
                  onScrubEnd: callback7
                })
              }) : null,
              value42 && callback28("maxW") ? jsxq_.jsx("div", {
                className: "contents",
                onKeyDownCapture: propertyRemovalKeyHandler,
                children: jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: MAX_WIDTH_LABEL,
                  value: value5.place?.maxW,
                  min: 1,
                  max: 4096,
                  step: 8,
                  clearable: !0,
                  hint: "—",
                  onReset: place?.maxW !== void 0 ? () => callback4({
                    maxW: void 0
                  }) : void 0,
                  onValue: (input) => callback4({
                    maxW: input
                  }),
                  onScrub: (input) => callback5({
                    maxW: input
                  }),
                  onScrubEnd: callback7
                })
              }) : null,
              value42 && callback28("minH") ? jsxq_.jsx("div", {
                className: "contents",
                onKeyDownCapture: propertyRemovalKeyHandler,
                children: jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: MIN_HEIGHT_LABEL,
                  value: value5.place?.minH,
                  min: 0,
                  max: 4096,
                  step: 8,
                  clearable: !0,
                  placeholder: "0",
                  onReset: place?.minH !== void 0 ? () => callback4({
                    minH: void 0
                  }) : void 0,
                  onValue: (input) => callback4({
                    minH: input
                  }),
                  onScrub: (input) => callback5({
                    minH: input
                  }),
                  onScrubEnd: callback7
                })
              }) : null,
              value42 && callback28("maxH") ? jsxq_.jsx("div", {
                className: "contents",
                onKeyDownCapture: propertyRemovalKeyHandler,
                children: jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: MAX_HEIGHT_LABEL,
                  value: value5.place?.maxH,
                  min: 1,
                  max: 4096,
                  step: 8,
                  clearable: !0,
                  hint: "—",
                  onReset: place?.maxH !== void 0 ? () => callback4({
                    maxH: void 0
                  }) : void 0,
                  onValue: (input) => callback4({
                    maxH: input
                  }),
                  onScrub: (input) => callback5({
                    maxH: input
                  }),
                  onScrubEnd: callback7
                })
              }) : null,
              value43 ? jsxq_.jsxs(jsxq_.Fragment, {
                children: [
                  jsxq_.jsx(runtime2.NumberPropertyRow, {
                    label: (0, runtime2.formatMessage)({ defaultMessage: "跨列数", id: "uYEZeSgceP" }),
                    title: (0, runtime2.formatMessage)({ defaultMessage: "此元素占用的网格列数，按行自动排列。", id: "eZbfh9vBFT" }),
                    value: value5.place?.colSpan,
                    min: 1,
                    max: value8.node.kind === "grid" ? value8.node.columns.length : runtime2.maxGridTracks,
                    step: 1,
                    clearable: !0,
                    placeholder: "1",
                    onValue: (input) => callback4({
                      colSpan: input === void 0 ? void 0 : Math.round(input)
                    }),
                    onScrub: (input) => callback5({
                      colSpan: Math.round(input)
                    }),
                    onScrubEnd: callback7
                  }),
                  jsxq_.jsx(runtime2.NumberPropertyRow, {
                    label: (0, runtime2.formatMessage)({ defaultMessage: "跨行数", id: "z5ij+ZO6JX" }),
                    value: value5.place?.rowSpan,
                    min: 1,
                    max: runtime2.maxGridTracks,
                    step: 1,
                    clearable: !0,
                    placeholder: "1",
                    onValue: (input) => callback4({
                      rowSpan: input === void 0 ? void 0 : Math.round(input)
                    }),
                    onScrub: (input) => callback5({
                      rowSpan: Math.round(input)
                    }),
                    onScrubEnd: callback7
                  })
                ]
              }) : null
            ]
          })
        };
    })() : void 0;
    return jsxq_.jsxs("div", {
      className: "flex h-full flex-col overflow-y-auto pb-1 [--pp-label-w:72px] " + runtime2.HIDDEN_NATIVE_SCROLLBAR_CLASS,
      "data-slides": "properties",
      onPointerDownCapture: notePropertyPointer,
      onClickCapture: propertiesClickCapture,
      onKeyDownCapture: propertiesKeyDownCapture,
      children: [
        value7 === void 0 ? jsxq_.jsx("p", {
          className: "mt-2 shrink-0 pr-md pl-lg text-footnote text-muted",
          children: (0, runtime2.formatMessage)({
            defaultMessage: "已选择 {count} 个不同类型的对象。请选择同一类型的对象进行批量编辑。",
            id: "1C0H+p/x1P"
          }, { n: value3.length, count: String(value3.length) })
        }) : !value6 && value20 === void 0 && !(0, runtime2.isFlowContainer)(value19) && value19.kind !== "overlay" && value19.kind !== "shape" && value19.kind !== "spacer" ? jsxq_.jsx("p", {
          className: "mt-2 shrink-0 pr-md pl-lg text-footnote text-muted",
          children: (0, runtime2.formatMessage)({
            defaultMessage: "已选择 {count} 个对象，没有可共同编辑的属性。请选择其中一个。",
            id: "TKP0OfYwyE"
          }, { n: value3.length, count: String(value3.length) })
        }) : null,
        value41 !== void 0 || value9 !== void 0 && value10 !== void 0 ? jsxq_.jsxs(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({ defaultMessage: "尺寸", id: "PyBoUM8SXm" }),
          actions: value41 !== void 0 && value41.addItems.length > 0 ? jsxq_.jsx("span", {
            className: "contents",
            onClickCapture: propertyRemovalMouseHandler,
            children: jsxq_.jsx(runtime2.PropertySectionActions, {
              "aria-label": (0, runtime2.formatMessage)({ defaultMessage: "添加尺寸属性", id: "k+jjL9J2pY" }),
              items: value41.addItems
            })
          }) : void 0,
          children: [
            value9 !== void 0 && value10 !== void 0 && value9.node.kind === "overlay" ? (() => {
              let value42 = value9.node.layers[value10];
              return value42 ? ["x", "y"].map((input) => value42[input].anchor === "fill" || input === "y" && value42.node.kind === "table" ? null : jsxq_.jsx(runtime2.NumberPropertyRow, {
                label: input === "x" ? SIZE_WIDTH_LABEL : SIZE_HEIGHT_LABEL,
                value: value42[input].size,
                min: 1,
                max: 4096,
                step: 8,
                clearable: !0,
                placeholder: AUTO_LABEL,
                onReset: value42[input].size !== void 0 ? () => callback2(input, anchorSizePatch(void 0)) : void 0,
                onValue: (input2) => callback2(input, anchorSizePatch(input2))
              }, input)) : null;
            })() : null,
            value41?.rows
          ]
        }) : null,
        value7 !== void 0 && ((0, runtime2.isFlowContainer)(value19) || value19.kind === "overlay" || value30 !== null) ? jsxq_.jsxs(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({ defaultMessage: "布局", id: "WXtBW2wEq9" }),
          iconColumn: !0,
          children: [
            !(0, runtime2.isFlowContainer)(value19) && value19.kind !== "overlay" ? value30 : null,
            callback12(value19, callback13, callback14)
          ]
        }) : null,
        value19.kind === "img" && value7 === "img" ? jsxq_.jsx(jsxq_.Fragment, {
          children: jsxq_.jsxs(runtime2.PropertySection, {
            title: (0, runtime2.formatMessage)({ defaultMessage: "图片", id: "XScQaEl5Jm" }),
            iconColumn: !0,
            children: [
              jsxq_.jsx(MediaSourcePropertyRow, {
                testid: "sl",
                kind: "image",
                src: value26,
                name: imagePropertyLabel(value19, value26 ?? ""),
                mixed: !value6,
                empty: !value3.some((input) => {
                  let value42 = (0, runtime2.selectedNode)(slide, input);
                  return value42?.kind === "img" && (0, runtime2.imageHasMedia)(value42);
                }),
                onPick: onReplaceImage !== void 0 && value4 !== void 0 && !(value6 && !1) ? (input) => onReplaceImage(value4.frameId, (0, runtime2.selectionNodePath)(value4), input, void 0) : void 0,
                onPress: void 0,
                onRemove: () => onRemoveImages !== void 0 ? onRemoveImages(value3.map((input) => ({
                  frameId: input.frameId,
                  path: (0, runtime2.selectionNodePath)(input)
                }))) : callback13((source) => source.kind === "img" ? (0, runtime2.clearImageMedia)(source) : source)
              }, value13 + ":image"),
              null,
              jsxq_.jsx(runtime2.ChoicePropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "适配", id: "Dyrg0ZgvmZ" }),
                options: [
                  {
                    value: "cover",
                    label: COVER_LABEL
                  },
                  {
                    value: "contain",
                    label: CONTAIN_LABEL
                  }
                ],
                value: value19.fit,
                onChange: (input) => callback13((source) => source.kind === "img" ? (0, runtime2.setImageFit)(source, input) : source)
              }),
              null,
              null,
              null,
              jsxq_.jsx(runtime2.PropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "替代文本", id: "emJyC1LcuX" }),
                children: jsxq_.jsx(runtime2.TextInput, {
                  value: value19.alt,
                  "aria-label": "替代文本",
                  onChange: (event) => callback13((source) => source.kind === "img" ? {
                    ...source,
                    alt: event.target.value
                  } : source)
                })
              })
            ]
          })
        }) : null,
        value19.kind === "icon" && value7 === "icon" ? jsxq_.jsx(jsxq_.Fragment, {
          children: jsxq_.jsxs(runtime2.PropertySection, {
            title: (0, runtime2.formatMessage)({ defaultMessage: "图标", id: "3zpPqnDV4q" }),
            children: [
              jsxq_.jsx(runtime2.SelectPropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "符号", id: "9DM3b83EN1" }),
                options: runtime2.slideIconNames.map((input) => ({
                  value: input,
                  label: input.charAt(0) + input.slice(1).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
                })),
                value: value19.icon,
                onChange: (input) => callback13((source) => source.kind === "icon" ? {
                  ...source,
                  icon: input
                } : source)
              }),
              jsxq_.jsx(FillPropertyRow, {
                editsAreUndoSteps,
                label: TEXT_COLOR_LABEL,
                value: value19.color,
                mixed: callback((source) => source.kind === "icon" || source.kind === "text" ? source.color ?? null : null),
                effective: (0, runtime2.slideTextColor)(slide.bg),
                swatches: value.rows,
                readsContrast: !0,
                contrast: (0, runtime2.selectionContrastBackground)(slide, value3, (0, runtime2.getRenderingTheme)()),
                clearLabel: (0, runtime2.formatMessage)({ defaultMessage: "主题默认", id: "gH9y7vOehZ" }),
                onPick: (input) => callback13((source) => {
                  if (source.kind !== "text" && source.kind !== "icon")
                    return source;
                  let state = {
                    ...source
                  };
                  return input === void 0 ? delete state.color : state.color = input, state;
                }),
                onLivePick: (input) => callback14((source) => source.kind === "text" || source.kind === "icon" ? {
                  ...source,
                  color: input
                } : source),
                onPickEnd: callback7
              })
            ]
          })
        }) : null,
        value19.kind === "shape" && value7 === "shape" && value19.shape === "connector" ? jsxq_.jsxs(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({ defaultMessage: "连接线", id: "1Xq9oZ13DQ" }),
          iconColumn: !0,
          children: [
            jsxq_.jsx(ConnectorDirectionPropertyRow, {
              value: value19.from ?? "tl",
              onChange: (input) => callback13((source) => {
                if (source.kind !== "shape" || source.shape !== "connector")
                  return source;
                let state = {
                  ...source
                };
                return input === "tl" ? delete state.from : state.from = input, state;
              })
            }),
            jsxq_.jsx(ConnectorEndsPropertyRows, {
              node: value19,
              selKey: value13,
              mixedOf: callback,
              updateNodes: callback13
            }),
            jsxq_.jsx(runtime2.SelectPropertyRow, {
              label: (0, runtime2.formatMessage)({ defaultMessage: "路径", id: "CpBQe9V8wB" }),
              options: CONNECTOR_ROUTE_OPTIONS,
              value: value19.route ?? "straight",
              onChange: (input) => callback13((source) => {
                if (source.kind !== "shape" || source.shape !== "connector")
                  return source;
                let state = {
                  ...source
                };
                return input === "straight" ? delete state.route : state.route = input, state;
              })
            }),
            jsxq_.jsx(runtime2.ChoicePropertyRow, {
              label: (0, runtime2.formatMessage)({ defaultMessage: "样式", id: "tocaWC7gAv" }),
              options: CONNECTOR_STROKE_OPTIONS,
              value: value19.dashed === !0 ? "dashed" : "solid",
              onChange: (input) => callback13((source) => {
                if (source.kind !== "shape" || source.shape !== "connector")
                  return source;
                let state = {
                  ...source
                };
                return input === "dashed" ? state.dashed = !0 : delete state.dashed, state;
              })
            })
          ]
        }) : null,
        value19.kind === "table" && value7 === "table" && value6 ? jsxq_.jsx(jsxq_.Fragment, {
          children: jsxq_.jsxs(runtime2.PropertySection, {
            title: (0, runtime2.formatMessage)({ defaultMessage: "表格", id: "dEQ1GW7Rou" }),
            children: [
              jsxq_.jsx(runtime2.NumberPropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "列", id: "IANQli0BwK" }),
                value: value19.cols,
                min: 1,
                max: value27,
                onValue: (input) => callback13((source) => source.kind === "table" ? (0, runtime2.resizeTable)(source, source.rows.length, input ?? source.cols) : source),
                onScrub: (input) => callback17((input2) => (0, runtime2.resizeTable)(input2, input2.rows.length, input ?? input2.cols)),
                onScrubEnd: callback7
              }),
              jsxq_.jsx(runtime2.NumberPropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "行", id: "b0KkAH9dv4" }),
                value: value19.rows.length,
                min: 1,
                max: value28,
                onValue: (input) => callback13((source) => source.kind === "table" ? (0, runtime2.resizeTable)(source, input ?? source.rows.length, source.cols) : source),
                onScrub: (input) => callback17((input2) => (0, runtime2.resizeTable)(input2, input ?? input2.rows.length, input2.cols)),
                onScrubEnd: callback7
              }),
              jsxq_.jsx(TextResizePropertyRow, {
                nodes: value3.map((input) => (0, runtime2.selectedNode)(slide, input)),
                updateNodes: callback13
              }),
              jsxq_.jsx(runtime2.SelectPropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "单元格类型", id: "EUi+knwKle" }),
                options: [
                  {
                    value: "default",
                    label: (0, runtime2.formatMessage)({ defaultMessage: "默认（正文）", id: "pzGC2ZHcrZ" })
                  },
                  ...runtime2.textRoles.map((input) => ({
                    value: input,
                    label: runtime2.textRoleLabels[input]
                  }))
                ],
                value: value19.role ?? "default",
                onChange: (input) => {
                  callback13((source) => {
                    if (source.kind !== "table")
                      return source;
                    let state = {
                      ...source
                    };
                    return input === "default" ? delete state.role : state.role = input, state;
                  });
                }
              }),
              jsxq_.jsxs("div", {
                className: "flex flex-col gap-1 py-1 pr-md pl-lg",
                children: [
                  jsxq_.jsx("div", {
                    className: "text-footnote text-muted",
                    children: (0, runtime2.formatMessage)({ defaultMessage: "列宽", id: "dv0pZ80J0K" })
                  }),
                  jsxq_.jsx("div", {
                    className: "grid grid-cols-2 gap-2",
                    children: Array.from({
                      length: value19.cols
                    }, (input, options) => jsxq_.jsx(runtime2.PropertyNumberInput, {
                      prefix: (0, runtime2.formatMessage)({ defaultMessage: "第 {column} 列", id: "yXMheT0PBB" }, { column: String(options + 1) }),
                      steppers: !1,
                      value: value19.colWidths?.[options],
                      min: 1,
                      max: 100,
                      placeholder: AUTO_LABEL,
                      onValue: (input2) => {
                        input2 !== void 0 && callback13((source) => source.kind === "table" ? (0, runtime2.setTableColumnWidth)(source, options, input2) : source);
                      },
                      onScrub: (input2) => {
                        input2 !== void 0 && callback14((source) => source.kind === "table" ? (0, runtime2.setTableColumnWidth)(source, options, input2) : source);
                      },
                      onScrubEnd: callback7
                    }, options))
                  })
                ]
              }),
              jsxq_.jsx(runtime2.PropertyRow, {
                label: (0, runtime2.formatMessage)({ defaultMessage: "标题行", id: "simB7abwl3" }),
                onPress: (element) => element.querySelector('[role="checkbox"]')?.click(),
                children: jsxq_.jsx(runtime2.Checkbox, {
                  checked: value19.header,
                  "aria-label": "标题行",
                  onCheckedChange: (input) => callback13((source) => source.kind === "table" ? {
                    ...source,
                    header: input === !0
                  } : source)
                })
              })
            ]
          })
        }) : null,
        value19.kind === "html" && value7 === "html" && value6 ? jsxq_.jsxs(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({ defaultMessage: "嵌入内容", id: "b5kSkQBPhm" }),
          children: [
            jsxq_.jsx("p", {
              className: "shrink-0 pr-md pl-lg text-footnote text-muted",
              children: (0, runtime2.formatMessage)({
                defaultMessage: "此嵌入内容由助手编写，请在对话中让助手修改。",
                id: "q6IGBEBUSf"
              })
            }),
            jsxq_.jsx("p", {
              className: "mt-1.5 shrink-0 pr-md pl-lg text-footnote text-muted",
              children: runtime2.allowEmbedScripts ? (0, runtime2.formatMessage)({ defaultMessage: "嵌入内容仅用于展示，与编辑器隔离。脚本在沙箱中运行，无法读取演示文稿。使用未知代码前请查看安全说明。此内容不会导出到 PowerPoint。", id: "aK6zMEz61n" }) : (0, runtime2.formatMessage)({ defaultMessage: "嵌入内容仅用于展示：不运行脚本、不加载网络资源，样式和 data: 图片必须内嵌，也不接收点击或按键。动画请使用 CSS。此内容不会导出到 PowerPoint。", id: "6jPSl+70oA" })
            })
          ]
        }) : null,
        value19.kind === "spacer" && value7 === "spacer" ? jsxq_.jsx("p", {
          className: "mt-2 shrink-0 pr-md pl-lg text-footnote text-muted",
          children: (0, runtime2.formatMessage)({ defaultMessage: "间隔元素是组合中的空白弹性空间，可在画布上调整大小，没有其他属性。", id: "toJeRRT/0a" })
        }) : null,
        value19.kind === "shape" && value7 === "shape" && value19.shape === "connector" ? jsxq_.jsxs(runtime2.PropertySection, {
          title: APPEARANCE_LABEL,
          iconColumn: !0,
          children: [
            jsxq_.jsx(runtime2.SegmentedPropertyRow, {
              label: (0, runtime2.formatMessage)({ defaultMessage: "线条", id: "EXnCIIdfP1" }),
              "data-testid": "sl-border-style",
              options: items3.map((input) => input.value === "none" ? {
                ...input,
                whyDisabled: (0, runtime2.formatMessage)({ defaultMessage: "线条始终显示", id: "wlKgXXfntM" })
              } : input.value === "dotted" ? {
                ...input,
                whyDisabled: (0, runtime2.formatMessage)({ defaultMessage: "线条可使用实线或虚线", id: "1nk4uT+iBw" })
              } : input),
              value: callback((source) => source.kind === "shape" && source.shape === "connector" ? source.dashed === !0 : null) ? void 0 : value19.dashed === !0 ? "dashed" : "solid",
              mixed: callback((source) => source.kind === "shape" && source.shape === "connector" ? source.dashed === !0 : null),
              onChange: (input) => callback13((source) => {
                if (source.kind !== "shape" || source.shape !== "connector" || input === "none" || input === "dotted")
                  return source;
                let state = {
                  ...source
                };
                return input === "dashed" ? state.dashed = !0 : delete state.dashed, state;
              })
            }, value13 + ":connector-line"),
            jsxq_.jsx(FillPropertyRow, {
              editsAreUndoSteps,
              label: TEXT_COLOR_LABEL,
              value: value19.stroke,
              mixed: callback((source) => source.kind === "shape" && source.shape === "connector" ? source.stroke ?? null : null),
              swatches: value.rows,
              onPick: (input) => callback13((source) => source.kind === "shape" && source.shape === "connector" && input !== void 0 ? {
                ...source,
                stroke: input
              } : source),
              onLivePick: (input) => callback14((source) => source.kind === "shape" && source.shape === "connector" && input !== void 0 ? {
                ...source,
                stroke: input
              } : source),
              onPickEnd: callback7
            }),
            jsxq_.jsx(runtime2.NumberPropertyRow, {
              label: STROKE_WIDTH_LABEL,
              value: callback((source) => source.kind === "shape" && source.shape === "connector" ? source.strokeWidth ?? null : null) ? void 0 : value19.strokeWidth,
              mixed: callback((source) => source.kind === "shape" && source.shape === "connector" ? source.strokeWidth ?? null : null),
              min: 1,
              max: runtime2.maxShapeStrokeWidth,
              placeholder: String(runtime2.defaultShapeStrokeWidth),
              onValue: (input) => callback13((source) => source.kind === "shape" && source.shape === "connector" ? {
                ...source,
                strokeWidth: input === void 0 || input === 0 ? runtime2.defaultShapeStrokeWidth : input
              } : source),
              onScrub: (input) => callback14((source) => source.kind === "shape" && source.shape === "connector" ? {
                ...source,
                strokeWidth: Math.max(1, input)
              } : source),
              onScrubEnd: callback7
            })
          ]
        }) : null,
        value20 !== void 0 && value19.kind !== "text" && value7 !== void 0 ? jsxq_.jsxs(runtime2.PropertySection, {
          title: APPEARANCE_LABEL,
          iconColumn: !0,
          children: [
            value21 ? jsxq_.jsx(runtime2.NumberPropertyRow, {
              label: (0, runtime2.formatMessage)({ defaultMessage: "粗细", id: "QkA3uWsjjs" }),
              value: value24 ? void 0 : value23,
              mixed: value24,
              min: 1,
              max: 4096,
              smallStep: 1,
              unit: (0, runtime2.literalMessage)("px"),
              placeholder: value23 === void 0 && value25 !== void 0 ? String(value25) : void 0,
              emptyStepFrom: value25,
              onValue: (input) => {
                input !== void 0 && onChange(value3.reduce((input2, options) => (0, runtime2.setNodeThickness)(input2, options.frameId, (0, runtime2.selectionNodePath)(options), input), slide));
              },
              onScrub: (input) => callback6(value3.reduce((input2, options) => (0, runtime2.setNodeThickness)(input2, options.frameId, (0, runtime2.selectionNodePath)(options), input), slide)),
              onScrubEnd: callback7
            }) : null,
            value36
          ]
        }) : null,
        value19.kind === "text" && value7 === "text" ? jsxq_.jsx(jsxq_.Fragment, {
          children: (() => {
            let value42 = (0, runtime2.getRenderingTheme)(), value43 = typeStyles ?? runtime2.emptyTypographyStyles, value44 = deckTypeStyles ?? runtime2.emptyTypographyStyles, value45 = value3.map((input) => (0, runtime2.selectedNode)(slide, input)).filter((input) => input?.kind === "text"), { style: value46, mixed: value47 } = (0, runtime2.matchingTypographyNodes)(value19, value45, value43, value42), value48 = value42 === "neutral", callback27 = (input) => (0, runtime2.resolveNodeTypographyStyle)(input, value43, value44, value42, !0), value49 = !value47 && value46 !== null, value50 = value47 ? void 0 : callback27(value19), value51 = value47 ? void 0 : value46?.name ?? (value50 === void 0 ? (0, runtime2.nodeTypographyLabel)(value19, value42) : value43.includes(value50) ? value50.name : "演示文稿的" + value50.name.toLowerCase() + "文字"), value52 = value47 ? void 0 : value46 === null && value50 !== void 0 && !value43.includes(value50) ? (0, runtime2.formatMessage)({ defaultMessage: "来自演示文稿的“{style}”文字样式", id: "Thf3cWx1LE" }, { style: value50.name.toLowerCase() }) : (0, runtime2.formatMessage)({ defaultMessage: "来自“{style}”", id: "c/ltsU3EuV" }, {
              style: value46?.name ?? (value50 === void 0 ? (0, runtime2.nodeTypographyLabel)(value19, value42) : value50.name)
            }), value53 = value51 !== void 0 ? "继承自" + value51 : void 0, value54 = (0, runtime2.nodeTypographyCombo)(value19, value42), style = value19.style, callback28 = (source, options) => {
              if (source.kind !== "text")
                return source;
              let value63 = callback27(source);
              if (options === "fontWeight") {
                let value64 = value63?.fontWeight;
                return (0, runtime2.patchNodeStyle)(source, {
                  fontWeight: value64 === void 0 || value64 === (0, runtime2.typeScaleForRole)(source.role, value42).fontWeight ? void 0 : value64,
                  fontStyle: value63?.italic ? "italic" : void 0
                });
              }
              return (0, runtime2.patchNodeStyle)(source, {
                fontFamily: value63?.fontFamily
              });
            }, comboKey = (source) => {
              let combo = (0, runtime2.nodeTypographyCombo)(source, value42);
              return [
                (0, runtime2.typographyFontKey)(combo.fontFamily, source.role, value42),
                combo.fontSize,
                combo.fontWeight,
                combo.italic,
                combo.lineHeight,
                combo.letterSpacing
              ].join("|");
            }, changesCombo = (patch) => value45.some((node) => {
              let next = patch(node);
              return next.kind === "text" && comboKey(node) !== comboKey(next);
            }), spacingReset = (source) => {
              if (source.kind !== "text")
                return source;
              let typography = callback27(source), lineHeight = typography?.lineHeight, letterSpacing = typography?.letterSpacing;
              return (0, runtime2.patchNodeStyle)(source, {
                lineHeight: lineHeight === (0, runtime2.typeScaleForRole)(source.role, value42).lineHeight ? void 0 : lineHeight,
                letterSpacing: letterSpacing === void 0 || letterSpacing === 0 ? void 0 : letterSpacing
              });
            }, callback29 = (input, options, context, value63, extra, detail) => {
              let callback31 = (source) => {
                if (source.kind !== "text")
                  return source;
                let value64 = callback27(source)?.[input], value65 = input === "letterSpacing" ? 0 : (0, runtime2.typeScaleForRole)(source.role, value42)[input];
                return (0, runtime2.patchNodeStyle)(source, {
                  [input]: value64 === void 0 || value64 === value65 ? void 0 : value64
                });
              };
              return jsxq_.jsx(runtime2.NumberPropertyRow, {
                label: options,
                value: callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42)[input] ?? null : null) ? void 0 : style?.[input],
                mixed: callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42)[input] ?? null : null),
                placeholder: String(value54[input]),
                title: style?.[input] === void 0 ? value52 : void 0,
                description: style?.[input] === void 0 && !callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42)[input] ?? null : null) ? value53 : void 0,
                min: context,
                max: value63,
                step: extra,
                unit: detail,
                clearable: !0,
                onReset: style?.[input] !== void 0 && changesCombo(callback31) ? () => callback13(callback31) : void 0,
                onValue: (input2) => callback13(input2 === void 0 ? callback31 : (source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                  [input]: input2
                }) : source),
                onScrub: (input2) => callback14((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                  [input]: input2
                }) : source),
                onScrubEnd: callback7
              }, input);
            }, value55 = (0, runtime2.fontFamilyChoiceValue)(style?.fontFamily, faces), fontFamily = value54.fontFamily, value56 = fontFamily === void 0 ? value48 ? SYSTEM_FONT_LABEL : STYLE_DEFAULT_LABEL : typeof fontFamily == "string" ? {
              sans: (0, runtime2.formatMessage)({ defaultMessage: "无衬线字体", id: "iG5uxeDWAG" }),
              serif: (0, runtime2.formatMessage)({ defaultMessage: "衬线字体", id: "ZitJ/exOJE" }),
              mono: (0, runtime2.formatMessage)({ defaultMessage: "等宽字体", id: "ASQQ5ydSuZ" }),
              helvetica: (0, runtime2.literalMessage)("Helvetica")
            }[fontFamily] ?? fontFamily : fontFamily.family, value57 = style?.fontWeight !== void 0 || style?.fontStyle !== void 0, value58 = style?.textDecorationLine, value59 = callback((source) => source.kind === "text" ? source.style?.textDecorationLine ?? null : null), value60 = value19.lineLists !== void 0 || callback((source) => source.kind === "text" ? source.lineLists !== void 0 ? "mixed" : source.list ?? "none" : null), value61 = callback((source) => source.kind === "text" ? (0, runtime2.typographyFontKey)(source.style?.fontFamily, source.role, value42) : null), value62 = callback((source) => source.kind === "text" ? (0, runtime2.fontVariantKey)((0, runtime2.nodeTypographyCombo)(source, value42).fontWeight, (0, runtime2.nodeTypographyCombo)(source, value42).italic) : null), callback30 = (input) => callback13((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, !value59 && value58 === input ? {
              textDecorationLine: void 0,
              textDecorationStyle: void 0,
              textDecorationColor: void 0
            } : {
              textDecorationLine: input
            }) : source);
            return jsxq_.jsxs(runtime2.PropertySection, {
              title: value3.length > 1 ? (0, runtime2.formatMessage)({ defaultMessage: "{count} 个文本", id: "R7VlOt+gTe" }, { n: value45.length, count: String(value45.length) }) : (0, runtime2.formatMessage)({ defaultMessage: "文本", id: "JoP4Xry4V+" }),
              iconColumn: !0,
              actions: jsxq_.jsx("span", {
                className: "contents",
                onClickCapture: propertyRemovalMouseHandler,
                children: jsxq_.jsx(runtime2.PropertySectionActions, {
                  "aria-label": (0, runtime2.formatMessage)({ defaultMessage: "添加文本属性", id: "sj1tRwj14k" }),
                  items: [
                    {
                      key: "emphasis",
                      label: EMPHASIS_LABEL,
                      authored: value58 !== void 0 || value59
                    },
                    {
                      key: "list",
                      label: LIST_LABEL,
                      authored: value19.list !== void 0 || value60
                    },
                    {
                      key: "textTransform",
                      label: CASE_LABEL,
                      authored: style?.textTransform !== void 0
                    }
                  ].filter((input) => !input.authored && !callback8("text:" + input.key)).map((input) => ({
                    label: input.label,
                    onSelect: () => callback9("text:" + input.key)
                  }))
                })
              }),
              children: [
                jsxq_.jsx(runtime2.SelectPropertyRow, {
                  label: (0, runtime2.formatMessage)({ defaultMessage: "文字样式", id: "6vfom2flMn" }),
                  options: value43.map((input) => ({
                    value: input.id,
                    label: input.name,
                    labelStyle: (0, runtime2.typographyStyleCss)(input),
                    hint: input.hint,
                    ...input.title !== void 0 ? {
                      title: input.title
                    } : {},
                    ...input.group !== void 0 ? {
                      group: input.group
                    } : {},
                    ...input.subgroup !== void 0 ? {
                      subgroup: input.subgroup
                    } : {}
                  })),
                  value: value49 && value46 !== null ? value46.id : "",
                  icon: value49 ? "TextAa" : void 0,
                  placeholder: value47 ? (0, runtime2.untranslatedMessage)("混合") : value49 ? "" : (0, runtime2.formatMessage)({ defaultMessage: "自定义", id: "3UJQ5YFFqk" }),
                  disabled: value43.length === 0,
                  title: value43.length === 0 ? value.systems > 0 ? (0, runtime2.formatMessage)({ defaultMessage: "此演示文稿的设计系统中没有文字样式", id: "lt+uSqt7if" }) : (0, runtime2.formatMessage)({ defaultMessage: "此演示文稿没有文字样式", id: "ExZb82Ktmo" }) : !value49 && !value47 ? (0, runtime2.formatMessage)({ defaultMessage: "自定义 · {style}", id: "9SyqjJ6sdv" }, { style: (0, runtime2.nodeTypographyLabel)(value19, value42) }) : void 0,
                  onChange: (input) => {
                    let value63 = value43.find((input2) => input2.id === input);
                    value63 !== void 0 && callback13((source) => source.kind === "text" ? (0, runtime2.clearTypographyOverrides)(source, value63, value42) : source);
                  }
                }),
                jsxq_.jsxs(jsxq_.Fragment, {
                  children: [
                    jsxq_.jsx(runtime2.SelectPropertyRow, {
                      label: FONT_LABEL,
                      options: [
                        ...value48 ? value55 === "" ? [
                          {
                            value: "",
                            label: SYSTEM_FONT_LABEL
                          }
                        ] : [] : [
                          {
                            value: "",
                            label: STYLE_DEFAULT_LABEL
                          }
                        ],
                        ...(0, runtime2.fontFamilyOptions)(faces, style?.fontFamily, facesFull)
                      ],
                      searchable: !0,
                      searchLabel: SEARCH_FONTS_LABEL,
                      onOpenChange: (input) => input && (0, runtime2.ensureGoogleFonts)(runtime2.fontFamilyChoices),
                      value: value61 ? "\0mixed" : value55,
                      placeholder: value61 ? (0, runtime2.untranslatedMessage)("混合") : value56,
                      title: value55 === "" ? value52 : void 0,
                      description: value55 === "" && !value61 ? value53 : void 0,
                      onReset: style?.fontFamily !== void 0 && changesCombo((input) => callback28(input, "fontFamily")) ? () => callback13((input) => callback28(input, "fontFamily")) : void 0,
                      onChange: (input) => {
                        let value63 = (0, runtime2.fontFamilyPatchFromChoice)(input, faces, style?.fontFamily);
                        callback13((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                          fontFamily: value63.fontFamily
                        }) : source, value63.face);
                      }
                    }),
                    jsxq_.jsx(runtime2.SelectPropertyRow, {
                      label: WEIGHT_LABEL,
                      options: (0, runtime2.fontVariantChoices)((0, runtime2.resolvedFontVariants)(style?.fontFamily, value19.role, fonts), {
                        weight: value54.fontWeight,
                        italic: value54.italic
                      }),
                      value: value62 ? "\0mixed" : value57 ? (0, runtime2.fontVariantKey)(value54.fontWeight, value54.italic) : "",
                      placeholder: value62 ? (0, runtime2.untranslatedMessage)("混合") : (0, runtime2.fontVariantLabel)(value54.fontWeight, value54.italic),
                      title: value57 ? void 0 : value52,
                      description: !value57 && !value62 ? value53 : void 0,
                      onOpenChange: (input) => input && value2((input2) => input2 + 1),
                      onReset: value57 && changesCombo((input) => callback28(input, "fontWeight")) ? () => callback13((input) => callback28(input, "fontWeight")) : void 0,
                      onChange: (input) => {
                        let value63 = (0, runtime2.parseFontVariantKey)(input);
                        value63 !== void 0 && callback13((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                          fontWeight: value63.weight === Math.round((0, runtime2.typeScaleForRole)(source.role, value42).fontWeight / 100) * 100 ? void 0 : value63.weight,
                          fontStyle: value63.italic ? "italic" : void 0
                        }) : source);
                      }
                    }),
                    callback29("fontSize", FONT_SIZE_LABEL, 8, 400, void 0, (0, runtime2.literalMessage)("px")),
                    jsxq_.jsx(runtime2.PropertyRow, {
                      label: SPACING_LABEL,
                      resetLabel: (0, runtime2.formatMessage)({ defaultMessage: "重置间距", id: "OdlrWeYwYv" }),
                      "data-testid": "sl-text-spacing",
                      title: style?.lineHeight === void 0 && style?.letterSpacing === void 0 && value52 ? (0, runtime2.formatMessage)({ defaultMessage: "行高 · 字间距 · {origin}", id: "J/1uhjhyTu" }, { origin: value52 }) : SPACING_TITLE,
                      description: style?.lineHeight === void 0 && style?.letterSpacing === void 0 && !callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42).lineHeight ?? null : null) && !callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42).letterSpacing ?? null : null) ? value53 : void 0,
                      onReset: (style?.lineHeight !== void 0 || style?.letterSpacing !== void 0) && changesCombo(spacingReset) ? () => callback13(spacingReset) : void 0,
                      onPress: (element) => element.querySelector("input")?.focus(),
                      children: jsxq_.jsxs("div", {
                        className: "grid min-w-0 flex-1 grid-cols-2 gap-2",
                        children: [
                          jsxq_.jsx(runtime2.PropertyNumberInput, {
                            "aria-label": "行高",
                            title: LINE_HEIGHT_LABEL,
                            prefix: jsxq_.jsx(runtime2.PropertyIcon, {
                              icon: runtime2.LINE_HEIGHT_ICON
                            }),
                            mixed: callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42).lineHeight : null),
                            value: callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42).lineHeight : null) ? void 0 : style?.lineHeight,
                            placeholder: String(value54.lineHeight),
                            min: 0.5,
                            max: 4,
                            step: 0.05,
                            clearable: !0,
                            steppers: !1,
                            onValue: (input) => callback13((source) => {
                              if (source.kind !== "text")
                                return source;
                              if (input !== void 0)
                                return (0, runtime2.patchNodeStyle)(source, {
                                  lineHeight: input
                                });
                              let value63 = callback27(source)?.lineHeight;
                              return (0, runtime2.patchNodeStyle)(source, {
                                lineHeight: value63 === (0, runtime2.typeScaleForRole)(source.role, value42).lineHeight ? void 0 : value63
                              });
                            }),
                            onScrub: (input) => callback14((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                              lineHeight: input
                            }) : source),
                            onScrubEnd: callback7
                          }),
                          jsxq_.jsx(runtime2.PropertyNumberInput, {
                            "aria-label": "字间距",
                            title: LETTER_SPACING_LABEL,
                            prefix: jsxq_.jsx(runtime2.PropertyIcon, {
                              icon: "LetterSpacing"
                            }),
                            mixed: callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42).letterSpacing : null),
                            value: callback((source) => source.kind === "text" ? (0, runtime2.nodeTypographyCombo)(source, value42).letterSpacing : null) ? void 0 : style?.letterSpacing,
                            placeholder: String(value54.letterSpacing),
                            min: -24,
                            max: 32,
                            step: 0.5,
                            clearable: !0,
                            steppers: !1,
                            onValue: (input) => callback13((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                              letterSpacing: input
                            }) : source),
                            onScrub: (input) => callback14((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                              letterSpacing: input
                            }) : source),
                            onScrubEnd: callback7
                          })
                        ]
                      })
                    })
                  ]
                }),
                jsxq_.jsx(TextFillPropertyRow, {
                  editsAreUndoSteps,
                  node: value19,
                  slideBg: slide.bg,
                  swatches: value.rows,
                  contrast: (0, runtime2.selectionContrastBackground)(slide, value3, value42, runtime2.TEXT_CONTRAST_NODE_KINDS),
                  colorMixed: callback((source) => source.kind === "text" ? source.color ?? null : null),
                  fillMixed: callback((source) => source.kind === "text" ? JSON.stringify(source.fill ?? null) : null),
                  updateNodes: callback13,
                  liveUpdateNodes: callback14,
                  end: callback7,
                  pickImage
                }, value13 + ":textfill"),
                value58 !== void 0 || value59 || callback8("text:emphasis") ? jsxq_.jsxs(runtime2.PropertyRow, {
                  label: EMPHASIS_LABEL,
                  children: [
                    jsxq_.jsxs(runtime2.ButtonGroup, {
                      "aria-label": "强调",
                      variant: "joined",
                      buttonVariant: "secondary",
                      children: [
                        jsxq_.jsx(runtime2.Button, {
                          iconOnly: !0,
                          icon: "TextUnderline",
                          "aria-label": (0, runtime2.formatMessage)({ defaultMessage: "下划线", id: "jIuU6pEl+2" }),
                          pressed: !value59 && value58 === "underline",
                          onClick: () => callback30("underline")
                        }),
                        jsxq_.jsx(runtime2.Button, {
                          iconOnly: !0,
                          icon: jsxq_.jsx("span", {
                            "aria-hidden": !0,
                            style: {
                              fontSize: 13,
                              lineHeight: 1,
                              textDecoration: "line-through"
                            },
                            children: "S"
                          }),
                          "aria-label": (0, runtime2.formatMessage)({ defaultMessage: "删除线", id: "GI1wfjbnkK" }),
                          pressed: !value59 && value58 === "line-through",
                          onClick: () => callback30("line-through")
                        })
                      ]
                    }),
                    value59 ? jsxq_.jsx("span", {
                      className: "ml-2 self-center text-caption text-muted",
                      children: (0, runtime2.formatMessage)({ defaultMessage: "混合", id: "e2pe43ONwH" })
                    }) : null
                  ]
                }) : null,
                value19.list !== void 0 || value60 || callback8("text:list") ? jsxq_.jsx("div", {
                  className: "contents",
                  onKeyDownCapture: propertyRemovalKeyHandler,
                  children: jsxq_.jsx(runtime2.SegmentedPropertyRow, {
                    label: LIST_LABEL,
                    "data-testid": "sl-text-list",
                    mixed: value60,
                    options: runtime2.TEXT_LIST_OPTIONS,
                    value: value19.list ?? "none",
                    onReset: value19.list !== void 0 || value60 ? () => callback13((source) => source.kind === "text" ? (0, runtime2.setNodeList)(source, void 0, slide.lists) : source) : void 0,
                    onChange: (input) => callback13((source) => source.kind === "text" ? (0, runtime2.setNodeList)(source, input === "none" ? void 0 : input, slide.lists) : source)
                  })
                }) : null,
                jsxq_.jsx(runtime2.SegmentedPropertyRow, {
                  label: (0, runtime2.formatMessage)({ defaultMessage: "对齐", id: "url0ccWxBv" }),
                  mixed: callback((source) => source.kind === "text" ? source.align ?? "start" : null),
                  options: [
                    {
                      value: "start",
                      label: runtime2.TEXT_ALIGNMENT_LABELS.start,
                      glyph: runtime2.TEXT_ALIGN_LEFT_ICON
                    },
                    {
                      value: "center",
                      label: runtime2.TEXT_ALIGNMENT_LABELS.center,
                      glyph: runtime2.TEXT_ALIGN_CENTER_ICON
                    },
                    {
                      value: "end",
                      label: runtime2.TEXT_ALIGNMENT_LABELS.end,
                      glyph: runtime2.TEXT_ALIGN_RIGHT_ICON
                    },
                    {
                      value: "justify",
                      label: runtime2.TEXT_ALIGNMENT_LABELS.justify,
                      glyph: runtime2.TEXT_ALIGN_JUSTIFY_ICON
                    }
                  ],
                  value: value19.align,
                  inherited: "start",
                  onReset: value19.align !== void 0 ? () => callback13((source) => {
                    if (source.kind !== "text")
                      return source;
                    let state = {
                      ...source
                    };
                    return delete state.align, state;
                  }) : void 0,
                  onChange: (input) => callback13((source) => {
                    if (source.kind !== "text")
                      return source;
                    let state = {
                      ...source
                    };
                    return input === "start" ? delete state.align : state.align = input, state;
                  })
                }),
                style?.textTransform !== void 0 || callback8("text:textTransform") ? jsxq_.jsx("div", {
                  className: "contents",
                  onClickCapture: propertyRemovalMouseHandler,
                  children: jsxq_.jsx(runtime2.SelectPropertyRow, {
                    label: CASE_LABEL,
                    options: [
                      {
                        value: "none",
                        label: NONE_LABEL
                      },
                      {
                        value: "uppercase",
                        label: (0, runtime2.formatMessage)({ defaultMessage: "大写", id: "nQIWgKsfFv" })
                      },
                      {
                        value: "lowercase",
                        label: (0, runtime2.formatMessage)({ defaultMessage: "小写", id: "xLOGYh2373" })
                      },
                      {
                        value: "capitalize",
                        label: (0, runtime2.formatMessage)({ defaultMessage: "首字母大写", id: "85xztdGI7n" })
                      }
                    ],
                    value: style?.textTransform ?? "",
                    placeholder: NONE_LABEL,
                    onReset: style?.textTransform !== void 0 ? () => callback13((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                      textTransform: void 0
                    }) : source) : void 0,
                    onChange: (input) => callback13((source) => source.kind === "text" ? (0, runtime2.patchNodeStyle)(source, {
                      textTransform: input === "none" ? void 0 : input
                    }) : source)
                  })
                }) : null,
                jsxq_.jsx(TextResizePropertyRow, {
                  nodes: value3.map((input) => (0, runtime2.selectedNode)(slide, input)),
                  updateNodes: callback13
                })
              ]
            });
          })()
        }) : null,
        value19.kind === "text" && value7 === "text" && value20 !== void 0 ? jsxq_.jsx(runtime2.PropertySection, {
          title: APPEARANCE_LABEL,
          iconColumn: !0,
          children: value36
        }) : null,
        value20 !== void 0 ? jsxq_.jsx(runtime2.StyleEffectsInspector, {
          kind: value20,
          bag: value19.style,
          shadowTarget: value37,
          dropShadowDisabledReason: value38,
          swatches: value.rows,
          mixedKeys: value31,
          unifiedColorPopover: !0,
          silhouette: value3.some((input) => {
            let value42 = (0, runtime2.selectedNode)(slide, input);
            return value42 !== void 0 && isDecorativePolygonShape(value42);
          }),
          onCommit: (input, options) => callback13((input2) => input2),
          onLive: (input, options) => callback14((input2) => input2),
          onLiveEnd: callback7
        }, value13) : null,
        value20 !== void 0 || value8 !== void 0 ? jsxq_.jsxs(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({ defaultMessage: "高级", id: "3c34nt+Olq" }),
          collapsed: !value11,
          onToggle: () => value12((input) => !input),
          children: [
            value8 !== void 0 ? jsxq_.jsxs(runtime2.PropertySection, {
              title: (0, runtime2.formatMessage)({ defaultMessage: "尺寸设置", id: "+7KPuWAm/q" }),
              subsection: !0,
              children: [
                value5.place?.alignSelf !== void 0 ? jsxq_.jsx("div", {
                  className: "contents",
                  onClickCapture: propertyRemovalMouseHandler,
                  children: jsxq_.jsx(runtime2.SelectPropertyRow, {
                    label: (0, runtime2.formatMessage)({ defaultMessage: "自身交叉轴对齐", id: "UhUBegNI4T" }),
                    options: STACK_CHILD_ALIGN_OPTIONS,
                    value: value5.place.alignSelf,
                    onReset: () => callback4({
                      alignSelf: void 0
                    }),
                    onChange: (input) => callback4({
                      alignSelf: input === "auto" ? void 0 : input
                    })
                  })
                }) : null,
                value5.place?.justifySelf !== void 0 ? jsxq_.jsx("div", {
                  className: "contents",
                  onClickCapture: propertyRemovalMouseHandler,
                  children: jsxq_.jsx(runtime2.SelectPropertyRow, {
                    label: (0, runtime2.formatMessage)({ defaultMessage: "自身主轴对齐", id: "a4ft9xwxnx" }),
                    options: GRID_CHILD_ALIGN_OPTIONS,
                    value: value5.place.justifySelf,
                    onReset: () => callback4({
                      justifySelf: void 0
                    }),
                    onChange: (input) => callback4({
                      justifySelf: input === "auto" ? void 0 : input
                    })
                  })
                }) : null,
                jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: (0, runtime2.formatMessage)({ defaultMessage: "伸展比例", id: "feH33hJv0u" }),
                  title: (0, runtime2.formatMessage)({
                    defaultMessage: "沿组合方向分配剩余空间的比例。所有同级元素设为伸展 1、基准 0 时，各列等宽。",
                    id: "SW5UOmYqda"
                  }),
                  value: value5.place?.grow,
                  min: 0,
                  max: runtime2.maxFlexFactor,
                  step: 1,
                  clearable: !0,
                  placeholder: "0",
                  onValue: (input) => callback4({
                    grow: input
                  }),
                  onScrub: (input) => callback5({
                    grow: input
                  }),
                  onScrubEnd: callback7
                }),
                jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: (0, runtime2.formatMessage)({ defaultMessage: "收缩比例", id: "QRlTGqUYUC" }),
                  title: (0, runtime2.formatMessage)({ defaultMessage: "组合溢出时，此元素让出空间的比例（CSS 默认值为 1）。", id: "3Iz72oQ4J5" }),
                  value: value5.place?.shrink,
                  min: 0,
                  max: runtime2.maxFlexFactor,
                  step: 1,
                  clearable: !0,
                  placeholder: "1",
                  onValue: (input) => callback4({
                    shrink: input
                  }),
                  onScrub: (input) => callback5({
                    shrink: input
                  }),
                  onScrubEnd: callback7
                }),
                jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: (0, runtime2.formatMessage)({ defaultMessage: "基准尺寸", id: "1w4OY4RA+k" }),
                  title: (0, runtime2.formatMessage)({ defaultMessage: "伸展或收缩前的主轴尺寸，单位为设计像素；留空则根据内容确定。", id: "5crKpaIQbS" }),
                  value: value5.place?.basis,
                  min: 0,
                  max: 4096,
                  step: 8,
                  clearable: !0,
                  placeholder: AUTO_LABEL,
                  onValue: (input) => callback4({
                    basis: input
                  }),
                  onScrub: (input) => callback5({
                    basis: input
                  }),
                  onScrubEnd: callback7
                }),
                jsxq_.jsx(runtime2.NumberPropertyRow, {
                  label: (0, runtime2.formatMessage)({ defaultMessage: "宽高比", id: "2PzjbxuFjV" }),
                  title: value5.kind === "table" ? TABLE_HEIGHT_REASON : (0, runtime2.formatMessage)({ defaultMessage: "此元素保持的宽高比，例如 16:9 对应 1.78；留空则自由调整。", id: "4wjWPaE530" }),
                  disabled: value5.kind === "table",
                  value: value5.place?.aspect,
                  min: 0.05,
                  max: 20,
                  step: 0.1,
                  clearable: !0,
                  placeholder: AUTO_LABEL,
                  onValue: (input) => callback4({
                    aspect: input
                  }),
                  onScrub: (input) => callback5({
                    aspect: input
                  }),
                  onScrubEnd: callback7
                })
              ]
            }) : null,
            value20 !== void 0 ? jsxq_.jsx(runtime2.StyleInspector, {
              kind: value20,
              nested: !0,
              effectsLifted: !0,
              hiddenKeys: values,
              disabledKeys: value39,
              bag: value19.style,
              swatches: value.rows,
              mixedKeys: value31,
              unifiedColorPopover: !0,
              onCommit: (input, options) => callback13((input2) => input2),
              onLive: (input, options) => callback14((input2) => input2),
              onLiveEnd: callback7
            }, value13) : null
          ]
        }) : null,
        jsxq_.jsx(runtime2.ScrollbarOverlay, {})
      ]
    });
  }
  return bindRuntimeValue(runtime2, "jsxq_", () => jsxq_, (value) => {
    jsxq_ = value;
  }), bindRuntimeValue(runtime2, "TABLE_HEIGHT_REASON", () => TABLE_HEIGHT_REASON, (value) => {
    TABLE_HEIGHT_REASON = value;
  }), bindRuntimeValue(runtime2, "TEXT_SHADOW_FILL_REASON", () => TEXT_SHADOW_FILL_REASON, (value) => {
    TEXT_SHADOW_FILL_REASON = value;
  }), bindRuntimeValue(runtime2, "isTransparentStyleColor", () => isTransparentStyleColor), bindRuntimeValue(runtime2, "LINE_DASH_REASON", () => LINE_DASH_REASON, (value) => {
    LINE_DASH_REASON = value;
  }), bindRuntimeValue(runtime2, "ZERO_SIDE_PLACEHOLDERS", () => ZERO_SIDE_PLACEHOLDERS, (value) => {
    ZERO_SIDE_PLACEHOLDERS = value;
  }), bindRuntimeValue(runtime2, "SIDE_INDEXES", () => SIDE_INDEXES, (value) => {
    SIDE_INDEXES = value;
  }), bindRuntimeValue(runtime2, "EMPTY_SIDE_VALUES", () => EMPTY_SIDE_VALUES, (value) => {
    EMPTY_SIDE_VALUES = value;
  }), bindRuntimeValue(runtime2, "anchorSizePatch", () => anchorSizePatch, (value) => {
    anchorSizePatch = value;
  }), bindRuntimeValue(runtime2, "STACK_CHILD_ALIGN_OPTIONS", () => STACK_CHILD_ALIGN_OPTIONS, (value) => {
    STACK_CHILD_ALIGN_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "GRID_CHILD_ALIGN_OPTIONS", () => GRID_CHILD_ALIGN_OPTIONS, (value) => {
    GRID_CHILD_ALIGN_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "GridTracksPropertyRows", () => GridTracksPropertyRows), bindRuntimeValue(runtime2, "imagePropertyLabel", () => imagePropertyLabel), bindRuntimeValue(runtime2, "focusPropertyRowControl", () => focusPropertyRowControl), bindRuntimeValue(runtime2, "PROPERTY_ROW_FOCUS_SELECTOR", () => PROPERTY_ROW_FOCUS_SELECTOR, (value) => {
    PROPERTY_ROW_FOCUS_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "adjacentPropertyRowControl", () => adjacentPropertyRowControl), bindRuntimeValue(runtime2, "suppressRepeatedKeyAfterRemoval", () => suppressRepeatedKeyAfterRemoval), bindRuntimeValue(runtime2, "focusAfterPropertyRemoval", () => focusAfterPropertyRemoval), bindRuntimeValue(runtime2, "propertyRemovalMouseHandler", () => propertyRemovalMouseHandler), bindRuntimeValue(runtime2, "propertyRemovalKeyHandler", () => propertyRemovalKeyHandler), bindRuntimeValue(runtime2, "MediaSourcePropertyRow", () => MediaSourcePropertyRow), bindRuntimeValue(runtime2, "CONNECTOR_END_CHOICES", () => CONNECTOR_END_CHOICES, (value) => {
    CONNECTOR_END_CHOICES = value;
  }), bindRuntimeValue(runtime2, "CONNECTOR_ARROW_OPTIONS", () => CONNECTOR_ARROW_OPTIONS, (value) => {
    CONNECTOR_ARROW_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "CONNECTOR_ROUTE_OPTIONS", () => CONNECTOR_ROUTE_OPTIONS, (value) => {
    CONNECTOR_ROUTE_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "CONNECTOR_STROKE_OPTIONS", () => CONNECTOR_STROKE_OPTIONS, (value) => {
    CONNECTOR_STROKE_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "CONNECTOR_DIRECTION_OPTIONS", () => CONNECTOR_DIRECTION_OPTIONS, (value) => {
    CONNECTOR_DIRECTION_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "slideTransitionLabels", () => slideTransitionLabels), bindRuntimeValue(runtime2, "SLIDE_TRANSITION_OPTIONS", () => SLIDE_TRANSITION_OPTIONS, (value) => {
    SLIDE_TRANSITION_OPTIONS = value;
  }), bindRuntimeValue(runtime2, "FillPropertyRow", () => FillPropertyRow), bindRuntimeValue(runtime2, "useFillEditor", () => useFillEditor), bindRuntimeValue(runtime2, "TextFillPropertyRow", () => TextFillPropertyRow), bindRuntimeValue(runtime2, "defaultFillGradient", () => defaultFillGradient), bindRuntimeValue(runtime2, "mixHexColors", () => mixHexColors), bindRuntimeValue(runtime2, "ConnectorEndsPropertyRows", () => ConnectorEndsPropertyRows), bindRuntimeValue(runtime2, "TextResizePropertyRow", () => TextResizePropertyRow), bindRuntimeValue(runtime2, "isNonConnectorShape", () => isNonConnectorShape, (value) => {
    isNonConnectorShape = value;
  }), bindRuntimeValue(runtime2, "isDecorativePolygonShape", () => isDecorativePolygonShape, (value) => {
    isDecorativePolygonShape = value;
  }), bindRuntimeValue(runtime2, "normalizedHexRgba", () => normalizedHexRgba, (value) => {
    normalizedHexRgba = value;
  }), bindRuntimeValue(runtime2, "isDefaultShapeFill", () => isDefaultShapeFill, (value) => {
    isDefaultShapeFill = value;
  }), bindRuntimeValue(runtime2, "SelectionInspector", () => SelectionInspector), () => {
    (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeStyleSchema)(), jsxq_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TABLE_HEIGHT_REASON = (0, runtime2.formatMessage)({ defaultMessage: "表格高度由各行决定", id: "zCu8YUUcKu" }), TEXT_SHADOW_FILL_REASON = (0, runtime2.formatMessage)({ defaultMessage: "阴影会覆盖渐变或图片文字，请先将文字颜色改为纯色", id: "Hv+08uK1ac" }), LINE_DASH_REASON = (0, runtime2.formatMessage)({ defaultMessage: "线条为实线，连接线可使用虚线", id: "utBm9bGLeq" }), ZERO_SIDE_PLACEHOLDERS = ["0", "0", "0", "0"], SIDE_INDEXES = [0, 1, 2, 3], EMPTY_SIDE_VALUES = SIDE_INDEXES.map((input) => ({
      side: input,
      value: void 0
    })), START_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "开始", id: "UG/KpW7dUe" }), END_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "终点", id: "9JMLASnNUR" }), STRETCH_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "拉伸", id: "g3uS42cJ93" }), FILL_COLOR_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "颜色", id: "aO2sd/ASsJ" }), FILL_GRADIENT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "渐变", id: "LUSKhaHwto" }), FILL_IMAGE_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "图片", id: "nboRLjzNa6" }), SOLID_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "实线", id: "iCYC9mSzFf" }), DASHED_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "虚线", id: "cJEcXcTL8Y" }), TEXT_COLOR_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "颜色", id: "xnhFHhDoUA" }), COVER_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "覆盖", id: "Im0bbVAXaS" }), CONTAIN_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "完整显示", id: "aPBlQtePo5" }), RADIAL_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "径向", id: "rgC7JLM5tB" }), LINEAR_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "线性", id: "bX8TwQu4kw" }), COLUMNS_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "列", id: "NFqT/+7+bt" }), PADDING_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "内边距", id: "74/o0QNJOA" }), APPEARANCE_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "外观", id: "56s4qpIKQ7" }), BACKGROUND_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "背景", id: "/Q0PdFz/4u" }), STROKE_WIDTH_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "宽度", id: "8rzIwZ0J39" }), SIZE_WIDTH_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "宽度", id: "hJhfyc+uAo" }), SIZE_HEIGHT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "高度", id: "G6WBGd60by" }), MIN_WIDTH_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "最小宽度", id: "bVAI/S+p5k" }), MAX_WIDTH_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "最大宽度", id: "W3Bhyrk/20" }), MIN_HEIGHT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "最小高度", id: "OsQ7/AHILY" }), MAX_HEIGHT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "最大高度", id: "xvmjas9ecG" }), AUTO_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "自动", id: "2WaITb6OQR" }), EMPHASIS_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "强调", id: "Teyf8eM+GA" }), LIST_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "列表", id: "iJ3Kzrro9L" }), CASE_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "大小写", id: "xCKX1r+USd" }), NONE_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "无", id: "bQR7z2mqdf" }), FONT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "字体", id: "5iolZFVZ1k" }), WEIGHT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "字重", id: "CeGDuVs6HD" }), FONT_SIZE_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "尺寸", id: "s0EoMNYk84" }), SPACING_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "间距", id: "gEwgl8OUVX" }), SPACING_TITLE = (0, runtime2.formatMessage)({ defaultMessage: "行高 · 字间距", id: "veoPon18W4" }), LINE_HEIGHT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "行高", id: "vWv0iqiJz6" }), LETTER_SPACING_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "字间距（像素）", id: "dADReMJKg2" }), SEARCH_FONTS_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "搜索字体", id: "oy9MnyB2Y4" }), STYLE_DEFAULT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "样式默认", id: "AFst2NiWrl" }), SYSTEM_FONT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "系统字体", id: "K2Lx/k3SeI" }), anchorSizePatch = (size4) => (input) => {
      let state = {
        ...input
      };
      return delete state.sizePct, size4 === void 0 ? delete state.size : state.size = size4, state;
    }, STACK_CHILD_ALIGN_OPTIONS = [
      { value: "auto", label: (0, runtime2.formatMessage)({ defaultMessage: "自动（组合）", id: "9JtaC6Bdv2" }) },
      { value: "start", label: START_LABEL },
      { value: "center", label: (0, runtime2.formatMessage)({ defaultMessage: "垂直居中", id: "35BWFKVxDY" }) },
      { value: "end", label: END_LABEL },
      { value: "stretch", label: STRETCH_LABEL },
      { value: "baseline", label: (0, runtime2.formatMessage)({ defaultMessage: "基线", id: "uOKiUwtt/e" }) }
    ], GRID_CHILD_ALIGN_OPTIONS = [
      { value: "auto", label: (0, runtime2.formatMessage)({ defaultMessage: "自动（网格）", id: "EvA94euTOf" }) },
      { value: "start", label: START_LABEL },
      { value: "center", label: (0, runtime2.formatMessage)({ defaultMessage: "居中", id: "lzVYYpt34l" }) },
      { value: "end", label: END_LABEL },
      { value: "stretch", label: STRETCH_LABEL }
    ], PROPERTY_ROW_FOCUS_SELECTOR = 'input:not([tabindex="-1"]):not([type="file"]):not([type="hidden"]), button:not([tabindex="-1"]):not([data-kit="row-reset"]):not([data-kit="row-remove"]):not([aria-label^="Remove "])', lastPropertyInput = "key", MEDIA_SOURCE_KINDS = {
      image: {
        label: "图片",
        tip: "替换图片…",
        off: "此处不支持替换图片",
        accept: "image/*"
      },
      clip: {
        label: "视频",
        tip: "替换视频",
        off: "此处不支持更换视频。",
        accept: ""
      },
      clipOrPicture: {
        label: "视频",
        tip: "替换视频…",
        off: "此处不支持替换图片",
        accept: "image/*"
      },
      link: {
        label: "视频",
        tip: "更改视频链接",
        off: "此处不支持更换视频。",
        accept: void 0
      },
      cover: {
        label: "封面图片",
        tip: "设置封面图片",
        off: "此处不支持设置封面图片。",
        accept: "image/*"
      }
    }, CONNECTOR_END_CHOICES = [
      { which: "start", label: (0, runtime2.formatMessage)({ defaultMessage: "开始", id: "oa8zqqDuTS" }) },
      { which: "end", label: (0, runtime2.formatMessage)({ defaultMessage: "终点", id: "6+5L2b4h7o" }) }
    ], CONNECTOR_ARROW_OPTIONS = [
      { value: "none", label: (0, runtime2.formatMessage)({ defaultMessage: "无", id: "3C8ZpjRF6v" }) },
      { value: "open", label: (0, runtime2.formatMessage)({ defaultMessage: "空心", id: "MMv5F6IAHz" }) },
      { value: "filled", label: (0, runtime2.formatMessage)({ defaultMessage: "实心", id: "MSEJAaO2LL" }) }
    ], CONNECTOR_ROUTE_OPTIONS = [
      { value: "straight", label: (0, runtime2.formatMessage)({ defaultMessage: "直线", id: "nPkLxZN5Bc" }) },
      { value: "elbow", label: (0, runtime2.formatMessage)({ defaultMessage: "折线", id: "GcgZH0/9gq" }) },
      { value: "hv", label: (0, runtime2.formatMessage)({ defaultMessage: "先水平后垂直", id: "iKzEHlzf1F" }) },
      { value: "vh", label: (0, runtime2.formatMessage)({ defaultMessage: "先垂直后水平", id: "ogcIotOsXv" }) }
    ], CONNECTOR_STROKE_OPTIONS = [
      { value: "solid", label: SOLID_LABEL },
      { value: "dashed", label: DASHED_LABEL }
    ], CONNECTOR_DIRECTION_OPTIONS = [
      { value: "tl", label: (0, runtime2.formatMessage)({ defaultMessage: "右下", id: "MsuXMr+bH9" }) },
      { value: "tr", label: (0, runtime2.formatMessage)({ defaultMessage: "左下", id: "XuS/G03Wfu" }) },
      { value: "bl", label: (0, runtime2.formatMessage)({ defaultMessage: "右上", id: "8BVQdRwu82" }) },
      { value: "br", label: (0, runtime2.formatMessage)({ defaultMessage: "左上", id: "9dHE03BXTU" }) }
    ], CONNECTOR_DIRECTION_ARROW_ICONS = {
      tl: "ArrowDownRight",
      tr: "ArrowDownLeft",
      bl: "ArrowUpRight",
      br: "ArrowUpLeft"
    }, CONNECTOR_DIRECTION_ICON_CHOICES = CONNECTOR_DIRECTION_OPTIONS.map((input) => ({
      ...input,
      glyph: CONNECTOR_DIRECTION_ARROW_ICONS[input.value]
    })), CONNECTOR_DIRECTION_GLYPH_CHOICES = CONNECTOR_DIRECTION_OPTIONS.map((input) => ({
      ...input,
      glyph: runtime2.CONNECTOR_DIRECTION_ICONS[input.value]
    })), slideTransitionLabels = {
      none: (0, runtime2.formatMessage)({ defaultMessage: "无", id: "wbsz2IBh/T" }),
      fade: (0, runtime2.formatMessage)({ defaultMessage: "淡入淡出", id: "V1aLz47s93" }),
      push: (0, runtime2.formatMessage)({ defaultMessage: "推入", id: "xpi3EeZyLQ" }),
      magic: (0, runtime2.formatMessage)({ defaultMessage: "平滑移动", id: "m9VFaJ6qHs" })
    }, SLIDE_TRANSITION_OPTIONS = [
      {
        value: "none",
        label: slideTransitionLabels.none
      },
      ...runtime2.slideTransitionValues.map((input) => ({
        value: input,
        label: slideTransitionLabels[input]
      }))
    ], isNonConnectorShape = (node) => node.kind === "shape" && node.shape !== "connector", isDecorativePolygonShape = (node) => node.kind === "shape" && node.shape !== "connector" && node.shape !== "rect" && node.shape !== "ellipse" && node.shape !== "line", normalizedHexRgba = (hex) => {
      let value = hex.slice(1).toLowerCase();
      return (value.length === 3 || value.length === 4) && (value = [...value].map((input) => input + input).join("")), value.length === 6 ? value + "ff" : value;
    }, isDefaultShapeFill = (color) => {
      let value = (0, runtime2.resolveSlideColor)(color);
      return value !== void 0 && normalizedHexRgba(value) === normalizedHexRgba((0, runtime2.themeAccentColor)());
    };
  };
}
export {
  installUiSelectionInspector
};
