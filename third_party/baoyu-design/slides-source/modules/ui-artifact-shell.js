// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiArtifactShell(runtime2) {
  var jsxS6, NARROW_TOUCH_QUERY, ArtifactErrorBoundary;
  function LocalStashRecoveryOffer({ doc, undo }) {
    let value = doc.stashOffer(), ref = runtime2.reactd3.useRef(null);
    value && ref.current?.at !== value.at && (ref.current = {
      at: value.at,
      mins: Math.max(1, Math.round((Date.now() - value.at) / 6e4))
    });
    let value2 = value ? ref.current?.mins ?? 1 : 0;
    return jsxS6.jsx("div", {
      "data-mc-chrome": "",
      role: "status",
      className: "shrink-0",
      children: value ? jsxS6.jsx("div", {
        className: "px-md pt-md",
        children: jsxS6.jsxs(runtime2.Callout, {
          variant: "warning",
          role: "none",
          action: jsxS6.jsxs(jsxS6.Fragment, {
            children: [
              jsxS6.jsx(runtime2.Button, {
                variant: "secondary",
                onClick: () => {
                  let value3 = doc.restoreStash();
                  value3 && undo && undo.seed(value3);
                },
                children: "恢复"
              }),
              jsxS6.jsx(runtime2.Button, {
                variant: "ghost",
                onClick: () => {
                  let value3 = !undo || undo.redoDepth() <= 1;
                  doc.discardStash(), undo && value3 && undo.clear();
                },
                children: "放弃"
              })
            ]
          }),
          children: [
            "发现约 ",
            value2,
            " 分钟",
            value2 === 1 ? "" : "s",
            "前未保存的更改，来自上次刷新之前（可能是其他位置的保存或关闭了此标签页）。",
            " ",
            doc.readOnly() ? "恢复后可继续编辑，当前视图无法发布。" : doc.saveMode() === "auto" ? "恢复会覆盖当前版本并自动保存，可通过撤销还原。" : "恢复后点击保存即可发布。"
          ]
        })
      }) : null
    });
  }
  function ArtifactShell({ children, doc, undo, toolbarExtras, toolbarExtrasEnd, toolbarPinned, toolbarAfterUndo, toolbarQuietReadOnlyReason, toolbarLeading, toolbarTrailing, toolbarUndoButtons, toolbarLeadingFlat, toolbarDensity, toolbarTouchTargets, toolbarFoot, alwaysShowExtras, undoShortcuts = !0, tabs, tab, onTabChange, aboveContent, skeleton, skeletonFlush, leading, hideToolbar = !1, toolbarVariant = "docked" }) {
    let [, value] = runtime2.reactd3.useState(0), [value2, value3] = runtime2.reactd3.useState(doc.saveState());
    runtime2.reactd3.useEffect(() => {
      let value11 = doc.subscribe(() => value((input) => input + 1)), value12 = doc.subscribeSave(value3);
      return value3(doc.saveState()), () => {
        value11(), value12();
      };
    }, [doc]), runtime2.reactd3.useEffect(() => {
      let callback2 = (event) => {
        event.defaultPrevented || (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s" && (event.preventDefault(), doc.save());
      };
      return window.addEventListener("keydown", callback2), () => window.removeEventListener("keydown", callback2);
    }, [doc]), (0, runtime2.useUndoKeys)(undo, undoShortcuts);
    let value4 = doc.readOnly(), value5 = doc.title(), value6 = "loadState" in doc || doc.saveMode() === "auto", status = doc.saveState().status, value7 = status === "readonly" && toolbarQuietReadOnlyReason !== void 0 && doc.saveState().message === toolbarQuietReadOnlyReason;
    (0, runtime2.useHostSaveState)(!value7 && (value6 || status === "readonly") ? status : null, () => void doc.save()), runtime2.reactd3.useEffect(() => {
      value5 !== "" && (document.title = value5);
    }, [value5]);
    let value8 = value2.status === "loading" && !value4, callback = (input) => value8 && input != null ? jsxS6.jsx("fieldset", {
      disabled: !0,
      "aria-busy": "true",
      title: "正在加载最新内容…",
      className: "contents",
      children: input
    }) : input, value9 = tabs !== void 0 && tabs.length > 0 && tab !== void 0 && onTabChange ? jsxS6.jsx(runtime2.ToolbarTabs, {
      tabs,
      value: tab,
      onChange: onTabChange,
      label: "编辑器模式"
    }) : null, value10 = toolbarVariant === "floating" && value9 === null, footShown = toolbarFoot !== void 0 && !hideToolbar && (!value4 || toolbarFoot.showWhileReadOnly === !0), chat = (0, runtime2.useFrameChat)(), chatShown = chat.shown && footShown && !value4, sheetOpen = (0, runtime2.usePresentationSheetOpen)(), chatButtonShown = sheetOpen ? !1 : chatShown, chatSlotShown = (0, runtime2.useHostOffersChatToggle)() && footShown && !value4 && !chat.heard, commentWord = (0, runtime2.useCommentButtonShown)() && !value4, footBare = toolbarFoot?.controls === null && toolbarFoot.lastTool === void 0 && !commentWord, [footElement, setFootElement] = runtime2.reactd3.useState(null);
    (0, runtime2.usePlaceChatSlot)(footElement, chatSlotShown), (0, runtime2.usePlaceChatSlot)(footElement, chat.heard && footShown && !value4);
    let narrowTouch = (0, runtime2.useMediaQuery)(NARROW_TOUCH_QUERY), chatMayCome = (0, runtime2.useHostMayOfferChatToggle)(toolbarFoot?.chatWhenNarrow !== !0 || !narrowTouch) && !value4, chatReleaseAt = (0, runtime2.useFrameChatReleaseAt)(), footReveal = (0, runtime2.useFootToolbarReveal)({
      shown: footShown,
      chatMayCome,
      slotReported: (chatSlotShown || chatShown) && footElement !== null,
      ...chatReleaseAt !== null && {
        releaseBy: Math.max(runtime2.FOOT_REVEAL_RELEASE_MS, chatReleaseAt)
      }
    }), footRow = footShown && !(footBare && !chatMayCome && !chatShown && !chatSlotShown && chatReleaseAt === null), footContent = toolbarFoot?.liveWhileLoading === !0 ? (input) => input : callback;
    return jsxS6.jsx(runtime2.AppDesignProvider, {
      children: jsxS6.jsxs(ArtifactErrorBoundary, {
        children: [
          jsxS6.jsxs(runtime2.PanedLayout, {
            leading,
            toolbarVariant: value10 ? "floating" : "docked",
            toolbar: jsxS6.jsxs(jsxS6.Fragment, {
              children: [
                hideToolbar ? null : jsxS6.jsx(runtime2.ArtifactToolbar, {
                  title: doc.title(),
                  saveState: value2,
                  saveMode: doc.saveMode(),
                  syncDot: value6,
                  onSave: () => void doc.save(),
                  undo,
                  extrasEnd: !value4 || alwaysShowExtras ? callback(toolbarExtrasEnd) : null,
                  pinned: !value4 || alwaysShowExtras ? callback(toolbarPinned) : null,
                  afterUndo: toolbarAfterUndo,
                  ...toolbarQuietReadOnlyReason !== void 0 ? {
                    quietReadOnlyReason: toolbarQuietReadOnlyReason
                  } : {},
                  leading: toolbarLeading,
                  trailing: toolbarTrailing,
                  undoButtons: toolbarUndoButtons,
                  leadingFlat: toolbarLeadingFlat,
                  density: toolbarDensity,
                  touchTargets: toolbarTouchTargets,
                  readOnly: value4,
                  variant: value10 ? "floating" : "docked",
                  children: !value4 || alwaysShowExtras ? callback(toolbarExtras) : null
                }),
                value9
              ]
            }),
            children: [
              value10 ? jsxS6.jsxs("div", {
                "data-tb-overlay-clear": "",
                className: "flex shrink-0 flex-col",
                children: [
                  jsxS6.jsx(LocalStashRecoveryOffer, {
                    doc,
                    undo
                  }),
                  jsxS6.jsx("div", {
                    "data-tb-clear-above": "",
                    className: "flex shrink-0 flex-col",
                    children: aboveContent
                  })
                ]
              }) : jsxS6.jsxs(jsxS6.Fragment, {
                children: [
                  jsxS6.jsx(LocalStashRecoveryOffer, {
                    doc,
                    undo
                  }),
                  aboveContent
                ]
              }),
              jsxS6.jsx("div", {
                "data-appifact-content": "",
                className: "isolate min-h-0 min-w-0 flex-1 overflow-auto",
                style: {
                  contain: "paint"
                },
                children: jsxS6.jsx(runtime2.ArtifactLoadBoundary, {
                  doc,
                  skeleton,
                  skeletonFlush,
                  children
                })
              }),
              footRow && toolbarFoot !== void 0 ? jsxS6.jsx("div", {
                "data-tb-foot-row": "",
                "data-uncommentable": toolbarFoot.uncommentable === !0 ? "" : void 0,
                inert: footReveal.held,
                className: (0, runtime2.joinClassNames)("flex shrink-0 justify-center px-2 pt-2", runtime2.FOOT_TOOLBAR_PAD_CLASS, runtime2.FOOT_TOOLBAR_SHEET_PAD_CLASS, footReveal.className),
                children: jsxS6.jsxs(runtime2.FloatingToolbar, {
                  ref: setFootElement,
                  label: toolbarFoot.label,
                  density: "comfortable",
                  atFoot: !0,
                  "data-tb-foot": "",
                  className: (0, runtime2.joinClassNames)("flex max-w-full items-center gap-0.5 p-1 pointer-coarse:p-xs", footBare && "min-h-[calc(var(--cds-h-control)+0.5rem)] pointer-coarse:min-h-[calc(var(--cds-h-control)+2*var(--cds-pad-xs))]", footBare && !chatButtonShown && (!chatSlotShown || sheetOpen) && "invisible"),
                  children: [
                    jsxS6.jsxs(runtime2.ToolbarQuietContext.Provider, {
                      value: value4,
                      children: [
                        footContent(toolbarFoot.controls),
                        jsxS6.jsx(runtime2.ToolbarCommentTools, {
                          lastTool: footContent(toolbarFoot.lastTool),
                          onScreen: !footReveal.held
                        })
                      ]
                    }),
                    chatButtonShown ? jsxS6.jsx(runtime2.ChatToolbarGroup, {
                      chat,
                      onScreen: !footReveal.held,
                      joins: footReveal.joins,
                      divider: !footBare,
                      word: commentWord
                    }) : null,
                    chatSlotShown ? jsxS6.jsxs("span", {
                      className: "contents [:root[data-mc-presentation=sheet]_&]:hidden",
                      children: [
                        footBare ? null : jsxS6.jsx(runtime2.ArtifactToolbarDivider, {}),
                        jsxS6.jsx(runtime2.ChatToggleSlot, {
                          word: commentWord
                        })
                      ]
                    }) : null
                  ]
                })
              }) : null
            ]
          }),
          jsxS6.jsx(runtime2.useToastBridge, {})
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "jsxS6", () => jsxS6, (value) => {
    jsxS6 = value;
  }), bindRuntimeValue(runtime2, "NARROW_TOUCH_QUERY", () => NARROW_TOUCH_QUERY, (value) => {
    NARROW_TOUCH_QUERY = value;
  }), bindRuntimeValue(runtime2, "ArtifactErrorBoundary", () => ArtifactErrorBoundary, (value) => {
    ArtifactErrorBoundary = value;
  }), bindRuntimeValue(runtime2, "LocalStashRecoveryOffer", () => LocalStashRecoveryOffer), bindRuntimeValue(runtime2, "ArtifactShell", () => ArtifactShell), () => {
    jsxS6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), NARROW_TOUCH_QUERY = "(pointer: coarse) and (max-width: 767px)", ArtifactErrorBoundary = class extends runtime2.reactd3.Component {
      state = {};
      static getDerivedStateFromError(input) {
        return {
          error: input instanceof Error ? input.message : String(input)
        };
      }
      componentDidCatch(input) {
        try {
          typeof reportError == "function" && reportError(input);
        } catch {
        }
      }
      render() {
        return this.state.error !== void 0 ? jsxS6.jsxs("div", {
          className: "m-6 rounded-lg border border-border-line bg-panel p-4 text-sm",
          children: [
            jsxS6.jsx("p", {
              className: "font-semibold",
              children: "演示文稿暂时无法显示。"
            }),
            jsxS6.jsx("p", {
              className: "mt-1 text-fg-muted",
              children: this.state.error
            }),
            jsxS6.jsx("p", {
              className: "mt-2 text-fg-muted",
              children: "请刷新页面重试；若问题仍然存在，请联系管理员。"
            })
          ]
        }) : this.props.children;
      }
    };
  };
}
export {
  installUiArtifactShell
};
