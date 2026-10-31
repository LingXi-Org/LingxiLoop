// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemThemeLooks(runtime2) {
  var reactForThemeLooks, jsxForThemeLooks, LookTile;
  const GENERIC_LABELS = {
    sans: "Sans-serif",
    serif: "Serif",
    mono: "Monospace"
  }, NO_FORCED_COLORS = "forced-color-adjust-none", [MIN_PREVIEW_SIZE, MAX_PREVIEW_SIZE] = [12, 20], SECTION_MEMORY_KEY = "appifact-theme-sections:", [PEEK_DELAY, PEEK_MOVE_DELAY, PEEK_END_DELAY] = [120, 40, 90], frameQueue = [];
  let frameRequest = 0;
  const lookFaceLabel = (face) => face === void 0 ? void 0 : face.name === "" || /^(ui-|system-ui$|-apple-|sans-serif$|serif$|monospace$)/i.test(face.name) ? GENERIC_LABELS[face.generic] : face.name;
  function lookTheme(theme) {
    let best = (role) => [...(0, runtime2.themeColorsWithRole)(theme, role)].sort((a, b) => a.rank - b.rank)[0]?.value, ground = (0, runtime2.flattenColorOn)(best("background") ?? (theme.dark ? "#141414" : "#ffffff"), theme.dark ? "#000000" : "#ffffff"), flat = (color) => color !== void 0 ? (0, runtime2.flattenColorOn)(color, ground) : void 0, ink = flat(best("text")) ?? (theme.dark ? "#ffffff" : "#141414"), accent = flat(best("accent")) ?? ink;
    return {
      id: theme.id,
      name: theme.name,
      ground,
      ink,
      accent,
      surface: flat(best("surface")) ?? (0, runtime2.mixThemeHexColors)(ground, ink, 0.06),
      muted: flat(best("muted")) ?? (0, runtime2.mixThemeHexColors)(ink, ground, 0.4)
    };
  }
  const letterSpacingEm = (look) => String(Math.round(look.letterSpacing / look.fontSize * 1e3) / 1e3) + "em", uniqueLabels = (faces) => faces.map(lookFaceLabel).filter((label, index4, labels) => label !== void 0 && labels.indexOf(label) === index4);
  function systemLook(system, familyCss) {
    let heading = system.ladder.h1 ?? system.headings[0];
    return {
      key: system.key,
      title: system.title,
      heading: {
        fontFamily: familyCss(system.families.heading),
        ...heading !== void 0 ? {
          fontWeight: heading.fontWeight,
          fontStyle: heading.italic ? "italic" : "normal",
          letterSpacing: letterSpacingEm(heading)
        } : {}
      },
      faces: uniqueLabels([system.families.heading, system.families.body]).join(" · "),
      themes: system.themes.map(lookTheme)
    };
  }
  function customLook(key, title, colors, text, familyCss) {
    let ground = colors.background ?? "#ffffff", ink = colors.text ?? ((0, runtime2.isDarkColor)(ground) ? "#ffffff" : "#141414"), [heading, body] = [
      runtime2.TYPE_LADDER_ROLES.filter(runtime2.isHeadingLadderRole).map((role) => text[role]).find((look) => look !== void 0),
      text.body
    ], theme = {
      id: "",
      name: "",
      ground,
      ink,
      accent: colors.accent ?? ink,
      surface: colors.surface ?? (0, runtime2.mixThemeHexColors)(ground, ink, 0.06),
      muted: colors.muted ?? (0, runtime2.mixThemeHexColors)(ink, ground, 0.4)
    };
    return {
      key,
      title,
      heading: heading !== void 0 ? {
        fontFamily: familyCss(heading.family),
        fontWeight: heading.fontWeight,
        fontStyle: heading.italic ? "italic" : "normal",
        letterSpacing: letterSpacingEm(heading)
      } : {},
      faces: uniqueLabels([heading?.family, body?.family]).join(" · "),
      themes: [theme]
    };
  }
  function SwatchStrip({ colors, max: max2 = 6, warn }) {
    warn !== void 0 && (max2 = Math.ceil(max2 / 2));
    let more = colors.length - max2;
    return jsxForThemeLooks.jsxs("span", {
      className: (0, runtime2.joinClassNames)("flex items-center gap-0.5", warn !== void 0 && "min-w-0 overflow-hidden py-0.5"),
      children: [
        warn !== void 0 ? jsxForThemeLooks.jsxs("span", {
          className: "mr-1.5 flex shrink-0 items-center gap-1 whitespace-nowrap text-footnote text-warning",
          children: [
            jsxForThemeLooks.jsx(runtime2.KitIcon, { name: "Warning", size: 14 }),
            warn
          ]
        }) : null,
        colors.slice(0, max2).map((color, index4) => jsxForThemeLooks.jsx(runtime2.ColorChip, { hex: color, className: NO_FORCED_COLORS }, String(index4) + color)),
        more > 0 ? jsxForThemeLooks.jsxs("span", {
          className: "pl-1.5 text-footnote text-muted tabular-nums",
          children: ["+", more]
        }) : null
      ]
    });
  }
  function previewFontSizes(sizes) {
    let logs = sizes.map((size4) => Math.log(Math.max(1, size4))), [min2, max2] = [Math.min(...logs), Math.max(...logs)];
    return logs.map((value) => max2 === min2 ? 14 : Math.round((MIN_PREVIEW_SIZE + (value - min2) / (max2 - min2) * (MAX_PREVIEW_SIZE - MIN_PREVIEW_SIZE)) * 2) / 2);
  }
  function useSectionMemory(scope) {
    let [openIds, setOpenIds] = reactForThemeLooks.useState(() => {
      try {
        let stored = JSON.parse(localStorage.getItem(SECTION_MEMORY_KEY + scope) ?? "[]");
        return Array.isArray(stored) ? stored.filter((id) => typeof id == "string").slice(0, 16) : [];
      } catch {
        return [];
      }
    });
    return {
      open: (id) => openIds.includes(id),
      toggle: (id) => {
        let next = openIds.includes(id) ? openIds.filter((open4) => open4 !== id) : [...openIds, id];
        setOpenIds(next);
        try {
          localStorage.setItem(SECTION_MEMORY_KEY + scope, JSON.stringify(next));
        } catch {
        }
      }
    };
  }
  function LookSwatch({ look, theme }) {
    return jsxForThemeLooks.jsxs("span", {
      className: (0, runtime2.joinClassNames)("relative flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md text-[15px] leading-none shadow-card-ring", NO_FORCED_COLORS),
      style: { background: theme.ground, color: theme.ink },
      children: [
        jsxForThemeLooks.jsx("span", { style: look.heading, children: "Aa" }),
        jsxForThemeLooks.jsx("span", {
          className: "absolute right-1 bottom-1 size-1.5 rounded-full",
          style: { background: theme.accent }
        })
      ]
    });
  }
  function LookSketch({ look, theme }) {
    return jsxForThemeLooks.jsxs("span", {
      className: "absolute inset-0 flex flex-col justify-center gap-[6%] px-[10%]",
      style: { color: theme.ink },
      children: [
        jsxForThemeLooks.jsx("span", {
          className: "h-[3px] w-[18%] rounded-full",
          style: { background: theme.accent }
        }),
        jsxForThemeLooks.jsx("span", {
          className: "truncate text-[13px] leading-4",
          style: look.heading,
          children: look.title
        }),
        jsxForThemeLooks.jsx("span", {
          className: "h-[3px] w-[70%] rounded-full opacity-60",
          style: { background: theme.muted }
        }),
        jsxForThemeLooks.jsx("span", {
          className: "h-[3px] w-[48%] rounded-full opacity-60",
          style: { background: theme.muted }
        })
      ]
    });
  }
  function queueFrameTask(win, task) {
    let run = () => {
      frameQueue.shift()?.(), frameRequest = frameQueue.length > 0 ? win.requestAnimationFrame(run) : 0;
    };
    return frameQueue.push(task), frameRequest === 0 && (frameRequest = win.requestAnimationFrame(run)), () => void (frameQueue.includes(task) && frameQueue.splice(frameQueue.indexOf(task), 1));
  }
  function LookPreview({ look, theme, choice, draw }) {
    let ref = reactForThemeLooks.useRef(null), [width, setWidth] = reactForThemeLooks.useState(0), [shownDraw, setShownDraw] = reactForThemeLooks.useState(void 0), drawRef = reactForThemeLooks.useRef(draw), pending = reactForThemeLooks.useRef(void 0), cancel = reactForThemeLooks.useCallback(() => {
      pending.current?.(), pending.current = void 0;
    }, []);
    reactForThemeLooks.useEffect(() => {
      drawRef.current = draw;
      let element = ref.current, win = element?.ownerDocument.defaultView;
      if (draw === void 0) {
        cancel(), setShownDraw(void 0);
        return;
      }
      if (element == null || win == null || pending.current !== void 0)
        return;
      let schedule = () => queueFrameTask(win, () => {
        pending.current = void 0, setShownDraw(() => drawRef.current);
      });
      if (win.IntersectionObserver === void 0) {
        pending.current = schedule();
        return;
      }
      let observer = new win.IntersectionObserver((entries) => {
        entries.some((entry) => entry.isIntersecting) && (observer.disconnect(), pending.current = schedule());
      });
      observer.observe(element), pending.current = () => observer.disconnect();
    }, [draw, cancel]), reactForThemeLooks.useEffect(() => cancel, [cancel]), reactForThemeLooks.useLayoutEffect(() => {
      let element = ref.current;
      if (element === null || (setWidth(element.clientWidth), typeof ResizeObserver > "u"))
        return;
      let observer = new ResizeObserver(() => setWidth(element.clientWidth));
      return observer.observe(element), () => observer.disconnect();
    }, []);
    let preview = reactForThemeLooks.useMemo(() => shownDraw !== void 0 && width > 0 ? shownDraw(choice, width) : null, [shownDraw, choice, width]);
    return jsxForThemeLooks.jsx("span", {
      ref,
      "aria-hidden": "true",
      className: (0, runtime2.joinClassNames)("relative block aspect-video w-full overflow-hidden rounded-md shadow-card-ring", NO_FORCED_COLORS),
      style: { background: theme.ground },
      children: preview ?? jsxForThemeLooks.jsx(LookSketch, { look, theme })
    });
  }
  function usePeekTimer(onPeek) {
    let timer = reactForThemeLooks.useRef(void 0), peeking = reactForThemeLooks.useRef(!1), onPeekRef = reactForThemeLooks.useRef(onPeek);
    reactForThemeLooks.useEffect(() => void (onPeekRef.current = onPeek));
    let end = reactForThemeLooks.useCallback(() => {
      clearTimeout(timer.current), peeking.current && onPeekRef.current?.(void 0), peeking.current = !1;
    }, []);
    return reactForThemeLooks.useEffect(() => end, [end]), {
      peek: reactForThemeLooks.useCallback((choice) => {
        clearTimeout(timer.current), !(choice === void 0 && !peeking.current) && (timer.current = setTimeout(() => {
          peeking.current = choice !== void 0, onPeekRef.current?.(choice);
        }, choice === void 0 ? PEEK_END_DELAY : peeking.current ? PEEK_MOVE_DELAY : PEEK_DELAY));
      }, []),
      end
    };
  }
  const tileLabel = (look, theme) => look.title + (look.themes.length > 1 ? ", " + theme.name : "");
  function LookTileView({ look, theme, pressed: pressed3, tabStop, peek, draw, onPress }) {
    let choice = reactForThemeLooks.useMemo(() => ({
      key: look.key,
      ...theme.id !== "" ? { theme: theme.id } : {}
    }), [look.key, theme.id]);
    return jsxForThemeLooks.jsxs("button", {
      type: "button",
      "aria-pressed": pressed3,
      "aria-label": tileLabel(look, theme),
      tabIndex: tabStop ? 0 : -1,
      "data-look": look.key + (theme.id !== "" ? "/" + theme.id : ""),
      onPointerEnter: (event) => void (event.pointerType !== "touch" && peek(pressed3 ? void 0 : choice)),
      onPointerLeave: () => peek(void 0),
      onFocus: (event) => void (event.currentTarget.matches(":focus-visible") && peek(pressed3 ? void 0 : choice)),
      onBlur: () => peek(void 0),
      onClick: (event) => onPress(choice, pressed3, event.detail === 0),
      className: "group/tile flex min-w-0 cursor-default flex-col gap-1.5 rounded-lg text-left outline-offset-4 outline-app-accent transition-transform duration-fast focus-visible:outline-2 active:scale-[0.98] motion-reduce:transition-none forced-colors:outline-[Highlight]",
      children: [
        jsxForThemeLooks.jsxs("span", {
          className: (0, runtime2.joinClassNames)("relative block rounded-md outline-solid outline-2 outline-offset-2 transition-[outline-color] duration-fast", pressed3 ? "outline-fill-accent forced-colors:outline-[CanvasText]" : "outline-transparent group-hover/tile:outline-border-strong forced-colors:outline-[Canvas]"),
          children: [
            jsxForThemeLooks.jsx(LookPreview, { look, theme, choice, draw }),
            pressed3 ? jsxForThemeLooks.jsx("span", {
              className: "absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-fill-accent text-on-accent",
              children: jsxForThemeLooks.jsx(runtime2.KitIcon, {
                name: "Check",
                size: 12
              })
            }) : null
          ]
        }),
        look.themes.length > 1 ? jsxForThemeLooks.jsx("span", {
          className: (0, runtime2.joinClassNames)("truncate px-0.5 text-footnote", pressed3 ? "text-primary" : "text-secondary"),
          children: theme.name
        }) : null
      ]
    });
  }
  function tileInDirection(gallery, from, key) {
    let [dx, dy] = key === "ArrowRight" ? [1, 0] : key === "ArrowLeft" ? [-1, 0] : key === "ArrowDown" ? [0, 1] : key === "ArrowUp" ? [0, -1] : [0, 0], centre = (element) => ((box) => [box.left + box.width / 2, box.top + box.height / 2])(element.getBoundingClientRect()), [x, y] = centre(from);
    return Array.from(gallery.querySelectorAll("[data-look]")).map((tile) => ({
      tile,
      along: (centre(tile)[0] - x) * dx + (centre(tile)[1] - y) * dy,
      off: Math.abs((centre(tile)[0] - x) * dy) + Math.abs((centre(tile)[1] - y) * dx)
    })).filter((entry) => entry.along > 1 && (dx === 0 || entry.off < 8)).sort((a, b) => a.along + a.off * 2 - (b.along + b.off * 2))[0]?.tile;
  }
  function LookGallery({ looks, pressed: pressed3, peek, draw, onPress }) {
    let ref = reactForThemeLooks.useRef(null);
    reactForThemeLooks.useLayoutEffect(() => {
      ref.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" });
    }, []);
    let anyPressed = looks.some((look) => look.themes.some((theme) => pressed3(look, theme)));
    return jsxForThemeLooks.jsxs("div", {
      ref,
      "data-look-gallery": "",
      className: (0, runtime2.joinClassNames)("max-h-[min(70vh,640px)] w-[400px] max-w-full overflow-y-auto", runtime2.HIDDEN_NATIVE_SCROLLBAR_CLASS),
      children: [
        jsxForThemeLooks.jsx("div", {
          role: "group",
          "aria-label": "设计系统与主题",
          "aria-description": "使用方向键切换样式。",
          className: "flex flex-col gap-4 p-3.5",
          onKeyDown: (event) => {
            event.key.startsWith("Arrow") && (event.preventDefault(), event.target instanceof Element && tileInDirection(event.currentTarget, event.target, event.key)?.focus());
          },
          children: looks.map((look, index4) => jsxForThemeLooks.jsxs("div", {
            className: "flex flex-col gap-2",
            children: [
              jsxForThemeLooks.jsxs("div", {
                className: "flex items-baseline gap-2 px-0.5",
                children: [
                  jsxForThemeLooks.jsx("span", {
                    className: "shrink-0 text-[16px] leading-5 text-primary",
                    style: look.heading,
                    children: look.title
                  }),
                  jsxForThemeLooks.jsx("span", {
                    className: "min-w-0 flex-1 truncate text-right text-footnote text-muted",
                    children: look.faces
                  })
                ]
              }),
              jsxForThemeLooks.jsx("div", {
                className: "grid grid-cols-2 gap-x-3 gap-y-2.5",
                children: look.themes.map((theme) => jsxForThemeLooks.jsx(LookTile, {
                  look,
                  theme,
                  pressed: pressed3(look, theme),
                  tabStop: anyPressed ? pressed3(look, theme) : index4 === 0 && theme === look.themes[0],
                  peek,
                  draw,
                  onPress
                }, theme.id))
              })
            ]
          }, look.key))
        }),
        jsxForThemeLooks.jsx(runtime2.ScrollbarOverlay, {})
      ]
    });
  }
  function ThemeLookPicker({ looks, current, onPick, onPeek, draw, placeholder = "", disabledReason, editsAreUndoSteps = !1 }) {
    let { peek, end } = usePeekTimer(onPeek), [opened, setOpened] = reactForThemeLooks.useState(!1), ref = reactForThemeLooks.useRef(null), touch = reactForThemeLooks.useRef(!1), look = looks.find((entry) => entry.key === current?.key), theme = look?.themes.find((entry) => entry.id === current?.theme), shown = theme ?? look?.themes[0], disabled2 = disabledReason !== void 0, reasonId = reactForThemeLooks.useId(), close = reactForThemeLooks.useCallback((refocus = !1) => {
      end(), setOpened(!1), (refocus || document.activeElement?.closest("[data-look-gallery]") != null) && ref.current?.querySelector("button")?.focus({ preventScroll: !0 });
    }, [end]);
    reactForThemeLooks.useEffect(() => {
      disabled2 && close();
    }, [disabled2, close]);
    let onPickRef = reactForThemeLooks.useRef(onPick);
    reactForThemeLooks.useEffect(() => void (onPickRef.current = onPick));
    let press = reactForThemeLooks.useCallback((choice, pressed3, keyboard2) => {
      pressed3 || onPickRef.current(choice), (keyboard2 || !touch.current) && close(!0);
    }, [close]), renderTrigger = ({ "aria-haspopup": hasPopup, "aria-expanded": expanded, "aria-controls": controls, ...props }) => {
      let button = jsxForThemeLooks.jsxs("button", {
        ...props,
        ...disabled2 ? {} : {
          "aria-haspopup": hasPopup,
          "aria-expanded": expanded,
          "aria-controls": controls
        },
        type: "button",
        "aria-label": "设计系统：" + (look === void 0 ? placeholder : look.title + (look.themes.length > 1 ? ", " + (theme?.name ?? placeholder) : "")),
        "aria-disabled": disabled2,
        "aria-describedby": disabled2 ? reasonId : void 0,
        onClick: (event) => {
          !disabled2 && opened === !1 && setOpened(event.detail === 0 ? "keyboard" : "pointer"), props.onClick?.(event);
        },
        className: (0, runtime2.joinClassNames)("flex h-12 cursor-default items-center gap-2.5 rounded-lg text-left", disabled2 ? "-mx-1.5 w-[calc(100%+0.75rem)] px-1.5 outline-none focus-visible:outline-hidden focus-visible:shadow-focus" : (0, runtime2.joinClassNames)(runtime2.PROPERTY_INPUT_SURFACE_CLASS, "w-full pr-2 pl-1.5")),
        children: [
          look !== void 0 && shown !== void 0 ? jsxForThemeLooks.jsxs(jsxForThemeLooks.Fragment, {
            children: [
              jsxForThemeLooks.jsx(LookSwatch, { look, theme: shown }),
              jsxForThemeLooks.jsxs("span", {
                className: "flex min-w-0 flex-1 flex-col",
                children: [
                  jsxForThemeLooks.jsx("span", {
                    className: "truncate text-[15px] leading-5 text-primary",
                    style: look.heading,
                    children: look.title
                  }),
                  jsxForThemeLooks.jsx("span", {
                    className: "truncate text-footnote text-muted",
                    children: look.themes.length < 2 ? look.faces : theme !== void 0 ? shown.name : placeholder
                  })
                ]
              }),
              jsxForThemeLooks.jsx(SwatchStrip, {
                colors: [shown.surface, shown.muted, shown.accent, shown.ink]
              })
            ]
          }) : jsxForThemeLooks.jsxs(jsxForThemeLooks.Fragment, {
            children: [
              jsxForThemeLooks.jsx("span", {
                className: "h-9 w-12 shrink-0 rounded-md border border-dashed border-alpha-3"
              }),
              jsxForThemeLooks.jsx("span", {
                className: "min-w-0 flex-1 truncate text-body text-muted",
                children: placeholder
              })
            ]
          }),
          disabled2 ? null : jsxForThemeLooks.jsx(runtime2.KitIcon, {
            name: "CaretDown",
            size: 16,
            className: "shrink-0 text-secondary"
          })
        ]
      });
      return disabled2 ? jsxForThemeLooks.jsx(runtime2.TooltipWrapper, {
        tip: disabledReason,
        side: "left",
        className: "w-full",
        children: button
      }) : button;
    };
    return jsxForThemeLooks.jsxs("div", {
      ref,
      className: (0, runtime2.joinClassNames)("relative pb-2", runtime2.PROPERTY_SECTION_GUTTER_CLASS),
      children: [
        disabled2 ? jsxForThemeLooks.jsx("span", {
          id: reasonId,
          hidden: !0,
          children: disabledReason
        }) : null,
        jsxForThemeLooks.jsx(runtime2.PropertyPopup, {
          open: opened !== !1 && !disabled2,
          onOpen: () => {
          },
          onClose: () => close(),
          side: "left",
          maxWidth: "416px",
          padding: "none",
          "aria-label": "设计系统",
          editsAreUndoSteps,
          focusOnOpen: opened === "keyboard",
          // PropertyPopup hands the trigger to Base UI's `render`, which also takes a render function.
          trigger: renderTrigger,
          children: jsxForThemeLooks.jsx("div", {
            onPointerDownCapture: (event) => void (touch.current = event.pointerType === "touch"),
            children: jsxForThemeLooks.jsx(LookGallery, {
              looks,
              pressed: (entry, entryTheme) => entry === look && (entryTheme === theme || entry.themes.length < 2),
              peek,
              draw,
              onPress: press
            })
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactForThemeLooks", () => reactForThemeLooks), bindRuntimeValue(runtime2, "jsxForThemeLooks", () => jsxForThemeLooks), bindRuntimeValue(runtime2, "lookFaceLabel", () => lookFaceLabel), bindRuntimeValue(runtime2, "letterSpacingEm", () => letterSpacingEm), bindRuntimeValue(runtime2, "systemLook", () => systemLook), bindRuntimeValue(runtime2, "customLook", () => customLook), bindRuntimeValue(runtime2, "SwatchStrip", () => SwatchStrip), bindRuntimeValue(runtime2, "previewFontSizes", () => previewFontSizes), bindRuntimeValue(runtime2, "useSectionMemory", () => useSectionMemory), bindRuntimeValue(runtime2, "ThemeLookPicker", () => ThemeLookPicker), () => {
    reactForThemeLooks = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForThemeLooks = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), LookTile = reactForThemeLooks.memo(LookTileView);
  };
}
export {
  installDesignSystemThemeLooks
};
