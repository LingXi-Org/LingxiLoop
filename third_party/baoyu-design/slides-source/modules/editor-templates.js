// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorTemplates(runtime2) {
  var ReactSlideTemplates, leadingTemplatePlacement, centeredTemplatePlacement, SLIDE_TEMPLATES, SlideTemplatesJsx;
  function createTemplateFrame(input, options, context) {
    return {
      id: (0, runtime2.createModelId)(),
      x: options,
      y: context,
      node: input
    };
  }
  function createTemplateSlide(input, options) {
    return {
      v: 1,
      id: (0, runtime2.createModelId)(),
      bg: input,
      frames: options
    };
  }
  function createTemplateTextNode(input) {
    return {
      kind: "text",
      ...input,
      style: {
        fontFamily: "helvetica"
      }
    };
  }
  function SlideTemplatePicker({ open: open4, onClose, onPick, restyle, returnFocus }) {
    let memo4 = ReactSlideTemplates.useMemo(() => restyle ? SLIDE_TEMPLATES.map((input) => ({
      t: input,
      sample: restyle(input.make())
    })) : void 0, [restyle]), memo22 = ReactSlideTemplates.useMemo(() => SLIDE_TEMPLATES.map((input) => ({
      t: input,
      sample: input.make()
    })), []), ref = ReactSlideTemplates.useRef(memo4 ?? memo22);
    memo4 !== void 0 && (ref.current = memo4);
    let current = ref.current, memo32 = ReactSlideTemplates.useMemo(() => /* @__PURE__ */ new Map(), []), firstButton = ReactSlideTemplates.useRef(null), pick = (template) => {
      open4 && (onPick(template.make()), onClose());
    }, onGridKeyDown = (event) => {
      if (event.repeat && (event.key === (0, runtime2.literalMessage)("Enter") || event.key === " ")) {
        event.preventDefault();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      let buttons = [
        ...event.currentTarget.querySelectorAll(":scope > button")
      ], active = event.currentTarget.ownerDocument.activeElement, index4 = buttons.findIndex((button) => button === active);
      if (index4 < 0)
        return;
      let columns = buttons.filter((button) => button.offsetTop === buttons[0]?.offsetTop).length, target = (/* @__PURE__ */ new Map([
        ["ArrowLeft", index4 - 1],
        ["ArrowRight", index4 + 1],
        ["ArrowUp", index4 - columns],
        ["ArrowDown", index4 + columns],
        [(0, runtime2.literalMessage)("Home"), 0],
        [(0, runtime2.literalMessage)("End"), buttons.length - 1]
      ])).get(event.key);
      target !== void 0 && (event.preventDefault(), buttons[target]?.focus());
    };
    return SlideTemplatesJsx.jsx(runtime2.DialogComponents.Root, {
      open: open4,
      onOpenChange: (input) => {
        input || onClose();
      },
      children: SlideTemplatesJsx.jsxs(runtime2.DialogComponents.Popup, {
        size: "md",
        initialFocus: firstButton,
        finalFocus: returnFocus ? () => returnFocus() ?? !1 : void 0,
        children: [
          SlideTemplatesJsx.jsx(runtime2.DialogComponents.Header, {
            showClose: !0,
            children: (0, runtime2.formatMessage)({
              defaultMessage: "新建幻灯片",
              id: "aUgWbN6aYt"
            })
          }),
          SlideTemplatesJsx.jsx("div", {
            role: "group",
            "aria-label": "布局",
            onKeyDown: onGridKeyDown,
            className: "mt-3 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pb-1 text-sm [scrollbar-gutter:stable]",
            children: current.map(({ t, sample }, index4) => SlideTemplatesJsx.jsxs("button", {
              ref: index4 === 0 ? firstButton : void 0,
              type: "button",
              className: "group flex flex-col gap-1 rounded-md p-1 text-left outline-none -outline-offset-2 hover:bg-bg-warm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-app-accent" + (index4 === 0 ? " focus:outline-2 focus:outline-solid focus:outline-app-accent" : ""),
              onClick: () => pick(t),
              children: [
                SlideTemplatesJsx.jsx(SlideTemplatePreview, {
                  slide: sample,
                  assets: memo32
                }),
                SlideTemplatesJsx.jsx("span", {
                  className: "px-0.5 text-xs text-fg-secondary",
                  children: t.name
                })
              ]
            }, t.id))
          })
        ]
      })
    });
  }
  function SlideTemplatePreview({ slide, assets }) {
    let ref = ReactSlideTemplates.useRef(null), [value, value2] = ReactSlideTemplates.useState(176);
    return ReactSlideTemplates.useLayoutEffect(() => {
      let current = ref.current;
      if (!current || (current.clientWidth > 0 && value2(current.clientWidth), typeof ResizeObserver > "u"))
        return;
      let observer = new ResizeObserver(([input]) => {
        input && input.contentRect.width > 0 && value2(input.contentRect.width);
      });
      return observer.observe(current), () => observer.disconnect();
    }, []), SlideTemplatesJsx.jsx("span", {
      ref,
      "aria-hidden": "true",
      "data-appifact-content": "",
      className: "block overflow-hidden rounded-sm border border-border-line group-hover:border-border-strong",
      children: SlideTemplatesJsx.jsx(runtime2.SlideCanvas, {
        slide,
        assets,
        width: value,
        animate: !1,
        editorChrome: !0,
        structure: !1
      })
    });
  }
  return bindRuntimeValue(runtime2, "ReactSlideTemplates", () => ReactSlideTemplates, (value) => {
    ReactSlideTemplates = value;
  }), bindRuntimeValue(runtime2, "createTemplateFrame", () => createTemplateFrame), bindRuntimeValue(runtime2, "createTemplateSlide", () => createTemplateSlide), bindRuntimeValue(runtime2, "createTemplateTextNode", () => createTemplateTextNode), bindRuntimeValue(runtime2, "leadingTemplatePlacement", () => leadingTemplatePlacement, (value) => {
    leadingTemplatePlacement = value;
  }), bindRuntimeValue(runtime2, "centeredTemplatePlacement", () => centeredTemplatePlacement, (value) => {
    centeredTemplatePlacement = value;
  }), bindRuntimeValue(runtime2, "SLIDE_TEMPLATES", () => SLIDE_TEMPLATES, (value) => {
    SLIDE_TEMPLATES = value;
  }), bindRuntimeValue(runtime2, "SlideTemplatesJsx", () => SlideTemplatesJsx, (value) => {
    SlideTemplatesJsx = value;
  }), bindRuntimeValue(runtime2, "SlideTemplatePicker", () => SlideTemplatePicker), bindRuntimeValue(runtime2, "SlideTemplatePreview", () => SlideTemplatePreview), () => {
    (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeDesignSystemsStore)(), (0, runtime2.initializeTypographyInference)(), (0, runtime2.initializeUiInputs210)(), ReactSlideTemplates = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideModel)(), leadingTemplatePlacement = (input, options) => ({
      anchor: "leading",
      margin: input,
      offset: 0,
      ...options !== void 0 ? {
        size: options
      } : {}
    }), centeredTemplatePlacement = (input = 0, options) => ({
      anchor: "center",
      margin: 0,
      offset: input,
      ...options !== void 0 ? {
        size: options
      } : {}
    }), SLIDE_TEMPLATES = [
      {
        id: "blank",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "空白",
          id: "ol2xJ9wJ4u"
        }),
        make: () => createTemplateSlide("white", [])
      },
      {
        id: "title",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "标题",
          id: "HTdoMuCsdr"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame({
            kind: "stack",
            dir: "v",
            align: "stretch",
            gap: 40,
            children: [
              createTemplateTextNode({
                role: "display",
                text: (0, runtime2.untranslatedMessage)("演示文稿标题")
              }),
              createTemplateTextNode({
                role: "lead",
                text: (0, runtime2.untranslatedMessage)("用一句话介绍这份演示文稿。"),
                color: "text-secondary"
              })
            ]
          }, leadingTemplatePlacement(128, 1500), centeredTemplatePlacement())
        ])
      },
      {
        id: "section",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "章节",
          id: "dLQStp6lq4"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame({
            kind: "stack",
            dir: "v",
            align: "stretch",
            gap: 32,
            children: [
              createTemplateTextNode({
                role: "eyebrow",
                text: (0, runtime2.untranslatedMessage)("第 01 章"),
                color: "text-tertiary"
              }),
              createTemplateTextNode({
                role: "h1",
                text: (0, runtime2.untranslatedMessage)("章节标题")
              })
            ]
          }, leadingTemplatePlacement(128, 1500), centeredTemplatePlacement())
        ])
      },
      {
        id: "title-body",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "标题与正文",
          id: "18QDoA6X+x"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame(createTemplateTextNode({
            role: "h2",
            text: (0, runtime2.untranslatedMessage)("Heading")
          }), leadingTemplatePlacement(128, 1664), leadingTemplatePlacement(112)),
          createTemplateFrame(createTemplateTextNode({
            role: "body",
            text: (0, runtime2.untranslatedMessage)("在此填写正文，双击文字即可编辑。")
          }), leadingTemplatePlacement(128, 1200), leadingTemplatePlacement(340))
        ])
      },
      {
        id: "bullets",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "项目列表",
          id: "57dAaNSsbv"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame(createTemplateTextNode({
            role: "h2",
            text: (0, runtime2.untranslatedMessage)("要点")
          }), leadingTemplatePlacement(128, 1664), leadingTemplatePlacement(112)),
          createTemplateFrame({
            kind: "stack",
            dir: "v",
            align: "stretch",
            gap: 48,
            children: [
              createTemplateTextNode({
                role: "lead",
                text: (0, runtime2.untranslatedMessage)("•  第一个要点")
              }),
              createTemplateTextNode({
                role: "lead",
                text: (0, runtime2.untranslatedMessage)("•  第二个要点")
              }),
              createTemplateTextNode({
                role: "lead",
                text: (0, runtime2.untranslatedMessage)("•  第三个要点")
              })
            ]
          }, leadingTemplatePlacement(128, 1400), leadingTemplatePlacement(360))
        ])
      },
      {
        id: "two-col",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "双栏",
          id: "PhVCwREVSl"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame(createTemplateTextNode({
            role: "h2",
            text: (0, runtime2.untranslatedMessage)("Compare")
          }), leadingTemplatePlacement(128, 1664), leadingTemplatePlacement(112)),
          createTemplateFrame({
            kind: "stack",
            dir: "v",
            align: "stretch",
            gap: 24,
            children: [
              createTemplateTextNode({
                role: "h3",
                text: (0, runtime2.untranslatedMessage)("Left")
              }),
              createTemplateTextNode({
                role: "body",
                text: (0, runtime2.untranslatedMessage)("左栏正文。")
              })
            ]
          }, leadingTemplatePlacement(128, 760), leadingTemplatePlacement(360)),
          createTemplateFrame({
            kind: "stack",
            dir: "v",
            align: "stretch",
            gap: 24,
            children: [
              createTemplateTextNode({
                role: "h3",
                text: (0, runtime2.untranslatedMessage)("Right")
              }),
              createTemplateTextNode({
                role: "body",
                text: (0, runtime2.untranslatedMessage)("右栏正文。")
              })
            ]
          }, {
            anchor: "trailing",
            margin: 128,
            offset: 0,
            size: 760
          }, leadingTemplatePlacement(360))
        ])
      },
      {
        id: "table",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "表格",
          id: "mLL8XY8yDB"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame(createTemplateTextNode({
            role: "h2",
            text: (0, runtime2.untranslatedMessage)("Summary")
          }), leadingTemplatePlacement(128, 1664), leadingTemplatePlacement(112)),
          createTemplateFrame({
            kind: "table",
            cols: 3,
            header: !0,
            rows: [
              [
                (0, runtime2.untranslatedMessage)("Item"),
                (0, runtime2.untranslatedMessage)("Status"),
                (0, runtime2.untranslatedMessage)("Owner")
              ],
              ["", "", ""],
              ["", "", ""],
              ["", "", ""]
            ]
          }, leadingTemplatePlacement(128, 1664), leadingTemplatePlacement(320))
        ])
      },
      {
        id: "quote",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "引用",
          id: "EKKBm2GGDa"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame(createTemplateTextNode({
            role: "h2",
            text: (0, runtime2.untranslatedMessage)("“值得用一整页展示的一句话。”"),
            align: "center"
          }), centeredTemplatePlacement(0, 1500), centeredTemplatePlacement(-40)),
          createTemplateFrame(createTemplateTextNode({
            role: "caption",
            text: (0, runtime2.untranslatedMessage)("—— 引用来源"),
            align: "center",
            color: "text-secondary"
          }), centeredTemplatePlacement(0, 800), centeredTemplatePlacement(220))
        ])
      },
      {
        id: "image-caption",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "图片与说明",
          id: "DOtMcMOvrX"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame({
            kind: "img",
            alt: (0, runtime2.untranslatedMessage)("将图片拖到这里"),
            fit: "cover",
            style: {
              borderRadius: 16
            }
          }, centeredTemplatePlacement(0, 1100), leadingTemplatePlacement(120, 700)),
          createTemplateFrame(createTemplateTextNode({
            role: "caption",
            text: (0, runtime2.untranslatedMessage)("图片说明。"),
            align: "center",
            color: "text-tertiary"
          }), centeredTemplatePlacement(0, 1100), leadingTemplatePlacement(860))
        ])
      },
      {
        id: "closing",
        name: (0, runtime2.formatMessage)({
          defaultMessage: "结束页",
          id: "BikB7EOSp3"
        }),
        make: () => createTemplateSlide("white", [
          createTemplateFrame(createTemplateTextNode({
            role: "display",
            text: (0, runtime2.untranslatedMessage)("谢谢")
          }), leadingTemplatePlacement(128, 1500), centeredTemplatePlacement(-40))
        ])
      }
    ], (0, runtime2.initializeSlideRenderer)(), SlideTemplatesJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installEditorTemplates
};
