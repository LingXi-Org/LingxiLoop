// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiSidePanels(runtime2) {
  var reactl0, reactDOMip, reactb20, jsxf1, PANEL_HEADER_CLASS, jsxe5, PanelIconButton, SidePanelContext, SidePanelHostContext, PANEL_STORAGE_PREFIX, isFinitePanelNumber, isPanelDockMode, isPanelPosition, MIN_PANEL_WIDTH, NON_TEXT_INPUT_TYPES, approximatelyEqualPanelSize, MIN_PANEL_HEIGHT, PANEL_SHEET_MAX_HEIGHT, IFRAME_POINTER_LOCK_CLASS, activeIframePointerLocks, COARSE_PANEL_WIDTH, jsxaZ;
  function PanelHeaderContent({ tabs, activateOnFocus, tabsLabel, title, onClose, closeLabel = runtime2.DEFAULT_CLOSE_LABEL, trailing }) {
    let value = tabs !== void 0 && tabs.length > 0;
    return jsxf1.jsxs(jsxf1.Fragment, {
      children: [
        value ? jsxf1.jsx(runtime2.Tabs.List, {
          "aria-label": tabsLabel,
          activateOnFocus,
          className: "min-w-0 flex-1",
          children: tabs.map((input) => jsxf1.jsx(runtime2.Tabs.Tab, {
            value: input.value,
            onClick: input.onClick,
            "data-testid": input["data-testid"],
            children: input.label
          }, input.value))
        }) : title != null && title !== !1 ? jsxf1.jsx("span", {
          className: "min-w-0 flex-1 truncate pl-[calc(var(--pp-gutter-l,var(--cds-pad-lg))-var(--cds-pad-sm))] text-body-semibold text-primary",
          children: title
        }) : jsxf1.jsx("span", {
          "aria-hidden": "true",
          className: "flex-1"
        }),
        trailing,
        onClose !== void 0 ? jsxf1.jsx(runtime2.Button, {
          variant: "ghost",
          iconOnly: !0,
          icon: jsxf1.jsx(runtime2.Icon, {
            name: "X",
            size: "sm",
            className: "text-secondary"
          }),
          "aria-label": closeLabel,
          onClick: onClose,
          className: "relative shrink-0"
        }) : null
      ]
    });
  }
  function usePanelHeaderTab(props) {
    let [value, value2] = reactb20.useState(props.tabs?.[0]?.value ?? "");
    return [
      props.tab ?? value,
      (input) => {
        value2(input), props.onTabChange?.(input);
      }
    ];
  }
  function PanelHeader(props) {
    let { tabs, className, "data-testid": value } = props, [value2, value3] = usePanelHeaderTab(props);
    return tabs !== void 0 && tabs.length > 0 ? jsxf1.jsx(runtime2.Tabs.Root, {
      value: value2,
      onValueChange: (input) => value3(input),
      "data-kit": "panel-header",
      "data-testid": value,
      className: (0, runtime2.joinClassNames)(PANEL_HEADER_CLASS, className),
      children: jsxf1.jsx(PanelHeaderContent, {
        ...props
      })
    }) : jsxf1.jsx("div", {
      "data-kit": "panel-header",
      "data-testid": value,
      className: (0, runtime2.joinClassNames)(PANEL_HEADER_CLASS, className),
      children: jsxf1.jsx(PanelHeaderContent, {
        ...props
      })
    });
  }
  function SidePanelProvider({ children }) {
    let [value, value2] = reactl0.useState(null), [value3, value4] = reactl0.useState(null), [value5, value6] = reactl0.useState(null), [value7, value8] = reactl0.useState(null), [value9, value10] = reactl0.useState(!1), ref = reactl0.useRef(null), callback = reactl0.useCallback((input) => {
      let current = ref.current;
      current && current.id !== input.id && current.onClose(), ref.current = input, value2(input);
    }, []), callback2 = reactl0.useCallback((input) => {
      ref.current?.id === input && (ref.current = null, value2(null));
    }, []), callback3 = reactl0.useCallback((input) => value10(input), []);
    return jsxe5.jsx(SidePanelContext.Provider, {
      value: {
        activeId: value?.id ?? null,
        hostEl: value3,
        leadingEl: value5,
        trailingEl: value7,
        openPanel: callback,
        closePanel: callback2,
        setPanelHidden: callback3
      },
      children: jsxe5.jsx(SidePanelHostContext.Provider, {
        value: {
          meta: value,
          hidden: value9,
          setHostEl: value4,
          setLeadingEl: value6,
          setTrailingEl: value8
        },
        children
      })
    });
  }
  function useSidePanel() {
    let value = reactl0.useContext(SidePanelContext);
    if (!value)
      throw Error("useSidePanel requires a SidePanelProvider (PanedLayout)");
    return value;
  }
  function SidePanel({ id, title, open: open4, onClose, narrow = "sheet", wide = "push", detachable = !1, tabs, tab, onTabChange, tabsLabel, hideTitle, wideHeader, sheetFitsContent, closeInset, resizeLabel, leading, trailing, children }) {
    let { activeId, hostEl, leadingEl, trailingEl, openPanel, closePanel } = useSidePanel(), ref = reactl0.useRef(onClose);
    ref.current = onClose;
    let ref2 = reactl0.useRef(tabs);
    ref2.current = tabs;
    let ref3 = reactl0.useRef(onTabChange);
    ref3.current = onTabChange;
    let value = tabs?.map((input) => input.value + "\0" + input.label).join("");
    if (reactl0.useEffect(() => {
      if (open4) {
        let current = ref2.current;
        return openPanel({
          id,
          title,
          narrow,
          wide,
          detachable,
          hideTitle,
          wideHeader,
          sheetFitsContent,
          closeInset,
          resizeLabel,
          onClose: () => ref.current(),
          ...current !== void 0 && current.length > 0 ? {
            tabs: current.map((input, options) => ({
              ...input,
              onClick: () => ref2.current?.[options]?.onClick?.()
            })),
            tab,
            tabsLabel,
            onTabChange: (input) => ref3.current?.(input)
          } : {}
        }), () => closePanel(id);
      }
      closePanel(id);
    }, [
      open4,
      id,
      title,
      narrow,
      wide,
      detachable,
      hideTitle,
      wideHeader,
      sheetFitsContent,
      closeInset,
      resizeLabel,
      value,
      tab,
      tabsLabel,
      openPanel,
      closePanel
    ]), !open4 || activeId !== id || !hostEl)
      return null;
    let callback = (input, options) => options && input !== void 0 && input !== null && input !== !1 ? reactDOMip.createPortal(jsxe5.jsx(runtime2.CdsRoot, {
      density: runtime2.defaultDensity,
      className: "contents",
      children: input
    }), options) : null;
    return jsxe5.jsxs(jsxe5.Fragment, {
      children: [
        callback(leading, leadingEl),
        callback(trailing, trailingEl),
        reactDOMip.createPortal(jsxe5.jsx(runtime2.CdsRoot, {
          density: "compact",
          className: "contents",
          children
        }), hostEl)
      ]
    });
  }
  function readPanelPreference(key, validate) {
    try {
      let value = localStorage.getItem(PANEL_STORAGE_PREFIX + key);
      if (value === null)
        return;
      let value2 = JSON.parse(value);
      if (validate(value2))
        return value2;
    } catch {
    }
  }
  function writePanelPreference(key, value) {
    try {
      localStorage.setItem(PANEL_STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
    }
  }
  function maximumPanelWidth() {
    return Math.max(MIN_PANEL_WIDTH, Math.min(560, window.innerWidth - 120));
  }
  function clampPanelWidth(width) {
    return Math.max(MIN_PANEL_WIDTH, Math.min(maximumPanelWidth(), Math.round(width)));
  }
  function maximumPanelHeight(height2 = window.innerHeight) {
    return Math.round(height2 * 0.85);
  }
  function minimumPanelHeight(inset, height2 = window.innerHeight) {
    return Math.max(MIN_PANEL_HEIGHT, Math.min(MIN_PANEL_HEIGHT + inset, Math.round(height2 / 2)));
  }
  function clampPanelHeight(height2, inset = 0) {
    return Math.max(minimumPanelHeight(inset), Math.min(maximumPanelHeight(), Math.round(height2)));
  }
  function panelBottomPadding(element) {
    let value = element?.ownerDocument.defaultView?.getComputedStyle?.(element);
    return Math.round(parseFloat(value?.paddingBottom ?? "") || 0);
  }
  function defaultFloatingPanelTop(element) {
    let value = element?.closest("[data-mc-paned]")?.querySelector("header.tb-root"), value2 = value && value.offsetParent !== null ? value.getBoundingClientRect().bottom : 40;
    return Math.round(value2 + 12);
  }
  function clampFloatingPanelPosition(position, element, width) {
    let value = width ?? element?.offsetWidth ?? 0, value2 = element?.offsetHeight ?? 0;
    return {
      x: Math.max(0, Math.min(position.x, window.innerWidth - Math.max(value, 48))),
      y: Math.max(0, Math.min(position.y, window.innerHeight - Math.max(value2, 40)))
    };
  }
  function beginPanelPointerGesture(event, onMove, onDone, pointerMode = "touch") {
    let callback = () => {
    };
    if (pointerMode === "touch" && event.pointerType === "mouse" || !event.isPrimary || event.button !== 0)
      return callback;
    event.preventDefault();
    let { currentTarget, pointerId } = event;
    currentTarget.setPointerCapture?.(pointerId);
    let callback2 = (input) => onMove === "x" ? input.clientX : input.clientY, value = callback2(event), value2 = "pointer:" + pointerId, flag = !1, flag2 = !1;
    onDone.onResizeStart(value2);
    let callback3 = (input) => {
      if (input.pointerId !== pointerId)
        return;
      let value3 = callback2(input) - value;
      Math.abs(value3) > 3 && (flag = !0), onDone.onResize(value3, value2);
    }, callback4 = (input) => {
      flag2 || (flag2 = !0, window.removeEventListener("pointermove", callback3), window.removeEventListener("pointerup", callback5), window.removeEventListener("pointercancel", callback5), currentTarget.removeEventListener("lostpointercapture", callback5), onDone.onResizeEnd(flag, value2, input));
    }, callback5 = (input) => {
      input.pointerId === pointerId && callback4();
    };
    return window.addEventListener("pointermove", callback3), window.addEventListener("pointerup", callback5), window.addEventListener("pointercancel", callback5), currentTarget.addEventListener("lostpointercapture", callback5), callback4;
  }
  function holdIframePointerLock() {
    activeIframePointerLocks++ === 0 && document.documentElement.classList.add(IFRAME_POINTER_LOCK_CLASS);
    let flag = !1;
    return () => {
      flag || (flag = !0, --activeIframePointerLocks === 0 && document.documentElement.classList.remove(IFRAME_POINTER_LOCK_CLASS));
    };
  }
  function wrapPanelResizeGestures(gesture) {
    let entries = /* @__PURE__ */ new Map(), callback = (input) => typeof input == "string" ? input : "cds";
    return {
      onResizeStart: (input) => {
        let value = callback(input);
        entries.get(value)?.(), entries.set(value, holdIframePointerLock()), gesture.onResizeStart(value);
      },
      onResize: gesture.onResize,
      onResizeEnd: (input, options, context) => {
        let value = callback(options);
        entries.get(value)?.(), entries.delete(value), gesture.onResizeEnd(input, value, context);
      }
    };
  }
  function usePanelWidth(initialWidth = 304, onResize) {
    let [value] = reactl0.useState(() => typeof matchMedia == "function" && matchMedia(runtime2.COARSE_POINTER_QUERY).matches ? Math.max(initialWidth, COARSE_PANEL_WIDTH) : initialWidth), [value2, value3] = reactl0.useState(() => readPanelPreference("width", isFinitePanelNumber) ?? value), [value4, value5] = reactl0.useState(maximumPanelWidth);
    reactl0.useLayoutEffect(() => {
      let callback = () => {
        value5(maximumPanelWidth()), value3((input) => clampPanelWidth(input));
      };
      return callback(), window.addEventListener("resize", callback), () => window.removeEventListener("resize", callback);
    }, []);
    let ref = reactl0.useRef(value2), ref2 = reactl0.useRef(onResize);
    reactl0.useLayoutEffect(() => {
      ref.current = value2, ref2.current = onResize;
    });
    let ref3 = reactl0.useRef(value2), memo4 = reactl0.useMemo(() => ({
      onResizeStart: () => {
        ref3.current = ref.current;
      },
      onResize: (input) => {
        let value6 = clampPanelWidth(ref3.current - input);
        value3(value6), ref2.current?.(value6, ref3.current);
      },
      onResizeEnd: () => {
        value3((input) => (writePanelPreference("width", input), input));
      }
    }), []);
    return {
      width: value2,
      min: MIN_PANEL_WIDTH,
      max: value4,
      defaultWidth: value,
      gesture: memo4
    };
  }
  function PanelWidthResizeHandle({ width, min: min2, max: max2, defaultWidth, gesture, label = "调整面板大小", className }) {
    let callback = (input) => () => {
      gesture.onResizeStart("keys"), gesture.onResize(width - input, "keys"), gesture.onResizeEnd(!0, "keys");
    };
    return jsxe5.jsx(PanelResizeHandle, {
      side: "inline-start",
      name: "panel",
      label,
      now: width,
      min: min2,
      max: max2,
      valueText: String(width) + " pixels wide",
      gesture,
      onHome: callback(min2),
      onEnd: callback(max2),
      onReset: callback(defaultWidth),
      className: (0, runtime2.joinClassNames)("[&:not(:focus-visible)>[data-cds-part=resize-pill]]:opacity-0", className)
    });
  }
  function PanelResizeHandle({ name, label, now, min: min2, max: max2, valueText, side: side2 = "top", gesture, disabled: disabled2 = !1, unavailableTip, onHome, onEnd, onReset, className, grabClassName = "justify-center pointer-coarse:flex", grabTargetClassName }) {
    let value = side2 === "inline-start", ref = reactl0.useRef(gesture);
    ref.current = gesture;
    let ref2 = reactl0.useRef(disabled2);
    ref2.current = disabled2;
    let [value2, value3] = reactl0.useState(!1), [value4, value5] = reactl0.useState(!1), [value6, value7] = reactl0.useState(!1), value8 = reactl0.useId(), ref3 = reactl0.useRef(null), ref4 = reactl0.useRef(null);
    reactl0.useEffect(() => () => ref4.current?.(!0), []);
    let ref5 = reactl0.useRef([!1, !1]), memo4 = reactl0.useMemo(() => ({
      onResizeStart: (input = "keys") => {
        ref2.current || (ref3.current === input && (ref4.current ? ref4.current() : (ref3.current = null, ref.current.onResizeEnd(!0, input))), ref3.current === null && (ref3.current = input, value3(!0), ref.current.onResizeStart(input)));
      },
      onResize: (input, options = "keys") => {
        ref3.current === options && ref.current.onResize(input, options);
      },
      onResizeEnd: (input, options = "keys", context) => {
        ref3.current === options && (ref3.current = null, ref4.current = null, value3(!1), options !== "keys" && (ref5.current = [ref5.current[1], input]), ref.current.onResizeEnd(input, options, context));
      }
    }), []), callback = (event, options) => {
      let value12 = "pointer:" + event.pointerId;
      if (ref2.current || ref3.current !== null && ref3.current !== value12) {
        event.isPrimary && event.button === 0 && !(options === "touch" && event.pointerType === "mouse") && event.preventDefault();
        return;
      }
      let value13 = beginPanelPointerGesture(event, value ? "x" : "y", memo4, options);
      ref3.current === value12 && (ref4.current = value13);
    }, callback2 = (input) => {
      !disabled2 && ref3.current === null && input?.();
    }, value9 = disabled2 ? unavailableTip : void 0;
    reactl0.useEffect(() => {
      disabled2 || value7(!1);
    }, [disabled2]);
    let value10 = value9 !== void 0 && value4 && !value6, value11 = jsxe5.jsx(runtime2.ResizeHandle, {
      side: side2,
      "aria-label": label,
      "aria-valuenow": now,
      "aria-valuemin": min2,
      "aria-valuemax": max2,
      "aria-valuetext": valueText,
      "aria-disabled": disabled2 || void 0,
      "aria-describedby": value9 !== void 0 ? value8 : void 0,
      "data-kit": name + "-resize",
      onResizeStart: memo4.onResizeStart,
      onResize: memo4.onResize,
      onResizeEnd: memo4.onResizeEnd,
      onPointerDown: (input) => callback(input, "all"),
      onFocus: () => {
        value5(!0), value7(!1);
      },
      onBlur: () => value5(!1),
      onDoubleClick: () => {
        !ref5.current[0] && !ref5.current[1] && callback2(onReset);
      },
      onKeyDown: (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.key !== "Home" && event.key !== "End")
          return;
        let value12 = disabled2 ? void 0 : event.key === "Home" ? onHome : onEnd;
        value12 && (event.preventDefault(), callback2(value12));
      },
      className: (0, runtime2.joinClassNames)("z-10 touch-none [--cds-ring-outer:1px] [--cds-ring-inner:0px]", value2 && "[--cds-resize-pill-force:1]", disabled2 ? "pointer-events-none pointer-coarse:[--cds-resize-pill-force:0.2]" : !value && !value2 && "pointer-coarse:[--cds-resize-pill-force:0.5] [&:hover:not(:focus-visible)>[data-cds-part=resize-pill]]:opacity-50", !value && "[&:not(:focus-visible)>[data-cds-part=resize-pill]]:top-[calc(50%+6px)]", className)
    });
    return jsxe5.jsxs(jsxe5.Fragment, {
      children: [
        disabled2 ? null : jsxe5.jsx("div", {
          "data-kit": name + "-grab",
          onPointerDown: (input) => callback(input, value ? "all" : "touch"),
          "aria-hidden": "true",
          className: (0, runtime2.joinClassNames)("absolute z-10 hidden touch-none", value ? "inset-y-0 left-0 w-0 flex-col items-center" : "inset-x-0 top-0 h-0 items-start", grabClassName),
          children: jsxe5.jsx("span", {
            className: (0, runtime2.joinClassNames)(value ? "h-full w-10 cursor-col-resize" : "h-10 w-24", grabTargetClassName)
          })
        }),
        jsxe5.jsx(runtime2.Tooltip, {
          content: value9 ?? "",
          side: value ? "left" : "top",
          open: value10,
          hoverable: !0,
          onOpenChange: (input) => {
            !input && value10 && value7(!0);
          },
          children: value11
        }),
        value9 !== void 0 ? jsxe5.jsxs(jsxe5.Fragment, {
          children: [
            jsxe5.jsx("span", {
              id: value8,
              hidden: !0,
              children: value9
            }),
            jsxe5.jsx(runtime2.TooltipWrapper, {
              tip: value9,
              side: value ? "left" : "top",
              className: value ? "absolute! inset-y-0 -left-1.5 z-10 w-3 cursor-default" : "absolute! inset-x-0 -top-1.5 z-10 h-3 cursor-default",
              children: jsxe5.jsx("span", {
                className: "size-full"
              })
            })
          ]
        }) : null
      ]
    });
  }
  function SidePanelHost() {
    let value = reactl0.useContext(SidePanelHostContext);
    if (!value)
      throw Error("SidePanelHost requires a SidePanelProvider");
    let { meta, hidden, setHostEl, setLeadingEl, setTrailingEl } = value, [value2, value3] = reactl0.useState(() => {
      let value28 = readPanelPreference("sheetH", isFinitePanelNumber) ?? 0;
      return value28 > 0 ? clampPanelHeight(value28) : 0;
    }), [value4, value5] = reactl0.useState(() => window.innerHeight), [value6, value7] = reactl0.useState(0), value8 = value2 > 0 ? Math.max(value2, minimumPanelHeight(value6, value4)) : 0, [value9, value10] = reactl0.useState(() => readPanelPreference("mode", isPanelDockMode) ?? "docked"), value11 = meta?.detachable === !0, value12 = value11 ? value9 : "docked", [value13, value14] = reactl0.useState(() => readPanelPreference("pos", isPanelPosition)), ref = reactl0.useRef(null), [value15, value16] = reactl0.useState(!1), ref2 = reactl0.useRef(void 0), value17 = usePanelWidth(304, (input, options) => {
      let current = ref2.current;
      value12 === "floating" && current && value14(clampFloatingPanelPosition({
        x: current.x + (options - input),
        y: current.y
      }, ref.current, input));
    }), { width, gesture } = value17, memo4 = reactl0.useMemo(() => ({
      ...gesture,
      onResizeStart: (input) => {
        ref2.current = value13, gesture.onResizeStart(input);
      },
      onResizeEnd: (input, options, context) => {
        gesture.onResizeEnd(input, options, context), value12 === "floating" && value14((input2) => (input2 && writePanelPreference("pos", input2), input2));
      }
    }), [gesture, value13, value12]), ref3 = reactl0.useRef(0), ref4 = reactl0.useRef(0), memo22 = reactl0.useMemo(() => wrapPanelResizeGestures({
      onResizeStart: () => {
        ref3.current = ref.current?.offsetHeight ?? Math.round(window.innerHeight / 2), ref4.current = panelBottomPadding(ref.current), value7(ref4.current);
      },
      onResize: (input) => value3(clampPanelHeight(ref3.current - input, ref4.current)),
      onResizeEnd: () => {
        value3((input) => {
          let value28 = input > 0 && input === minimumPanelHeight(ref4.current) ? MIN_PANEL_HEIGHT : input;
          return value28 > 0 && writePanelPreference("sheetH", value28), value28;
        });
      }
    }), []), [value18, value19] = reactl0.useState(() => !window.matchMedia("(min-width: 48rem)").matches);
    reactl0.useEffect(() => {
      let value28 = window.matchMedia("(min-width: 48rem)"), callback5 = () => value19(!value28.matches);
      return value28.addEventListener("change", callback5), () => value28.removeEventListener("change", callback5);
    }, []), reactl0.useLayoutEffect(() => {
      let documentElement = document.documentElement;
      if (!meta || hidden) {
        documentElement.removeAttribute("data-mc-presentation"), documentElement.style.removeProperty("--mc-sheet-h");
        return;
      }
      let value28 = value12 === "floating" ? "floating" : value18 ? meta.narrow === "sheet" ? "sheet" : "overlay" : meta.wide === "overlay" ? "overlay" : "docked";
      documentElement.getAttribute("data-mc-presentation") !== value28 && documentElement.setAttribute("data-mc-presentation", value28), value28 === "sheet" && meta.sheetFitsContent !== !0 ? documentElement.style.setProperty("--mc-sheet-h", value8 > 0 ? `${value8}px` : PANEL_SHEET_MAX_HEIGHT) : documentElement.style.removeProperty("--mc-sheet-h");
    }, [meta, hidden, value12, value18, value8]), reactl0.useLayoutEffect(() => () => {
      let documentElement = document.documentElement;
      documentElement.removeAttribute("data-mc-presentation"), documentElement.style.removeProperty("--mc-sheet-h");
    }, []);
    let [value20, value21] = reactl0.useState(!1), ref5 = reactl0.useRef(null), ref6 = reactl0.useRef(0), ref7 = reactl0.useRef(null), callback = reactl0.useCallback(() => {
      if (ref6.current)
        return;
      let value28 = ref5.current?.ownerDocument.defaultView;
      value28 && (ref6.current = value28.requestAnimationFrame(() => {
        ref6.current = 0;
        let current = ref5.current, value29 = current ? current.scrollTop > 0 : !1;
        if (current && !value29)
          for (let value30 of current.querySelectorAll("*")) {
            let tagName = value30.tagName;
            if (!(tagName === "TEXTAREA" || tagName === "INPUT" || tagName === "SELECT") && value30.scrollTop > 0 && value30.closest(runtime2.OPEN_OVERLAY_SELECTOR) === null) {
              value29 = approximatelyEqualPanelSize(value30.getBoundingClientRect().top, current.getBoundingClientRect().top);
              break;
            }
          }
        value21(value29);
      }));
    }, []), callback2 = reactl0.useCallback((input) => {
      let current = ref5.current;
      current && (current.removeEventListener("scroll", callback, !0), ref6.current && (current.ownerDocument.defaultView?.cancelAnimationFrame(ref6.current), ref6.current = 0)), ref7.current?.disconnect(), ref7.current = null, ref5.current = input;
      let value28 = input?.ownerDocument.defaultView;
      if (input && value28) {
        input.addEventListener("scroll", callback, !0);
        let value29 = new value28.MutationObserver(callback);
        value29.observe(input, {
          childList: !0,
          subtree: !0
        }), ref7.current = value29;
      }
      value21(!1), setHostEl(input);
    }, [setHostEl, callback]);
    reactl0.useLayoutEffect(() => {
      let callback5 = () => {
        value5(window.innerHeight), value14((input) => input && clampFloatingPanelPosition(input, ref.current)), value3((input) => input > 0 ? clampPanelHeight(input) : input);
      };
      return callback5(), window.addEventListener("resize", callback5), () => window.removeEventListener("resize", callback5);
    }, []), reactl0.useLayoutEffect(() => value7(panelBottomPadding(ref.current)), [meta, hidden, value12, value18, value4]);
    let callback3 = reactl0.useCallback((event) => {
      let target = event.target;
      if (target && typeof target.closest == "function" && target.closest("button, a, input, select, textarea") || meta?.narrow === "sheet" && !window.matchMedia("(min-width: 48rem)").matches || !value11)
        return;
      event.preventDefault();
      let value28 = ref.current?.getBoundingClientRect(), value29 = value28 ? event.clientX - value28.left : 24, value30 = value28 ? event.clientY - value28.top : 16, clientX = event.clientX, clientY = event.clientY, value31 = value12 === "floating";
      value16(!0);
      let callback5 = (input) => {
        if (!value31) {
          if (Math.abs(input.clientX - clientX) + Math.abs(input.clientY - clientY) < 8)
            return;
          value31 = !0, value10("floating"), writePanelPreference("mode", "floating");
        }
        let value32 = clampFloatingPanelPosition({
          x: input.clientX - value29,
          y: input.clientY - value30
        }, ref.current);
        value14(value32);
      }, callback6 = (input) => {
        if (window.removeEventListener("pointermove", callback5), window.removeEventListener("pointerup", callback6), window.removeEventListener("pointercancel", callback6), value16(!1), value31) {
          let value32 = clampFloatingPanelPosition({
            x: input.clientX - value29,
            y: input.clientY - value30
          }, ref.current);
          value14(value32), writePanelPreference("pos", value32);
        }
      };
      window.addEventListener("pointermove", callback5), window.addEventListener("pointerup", callback6), window.addEventListener("pointercancel", callback6);
    }, [value12, meta?.narrow, value11]), callback4 = reactl0.useCallback(() => {
      value10("docked"), writePanelPreference("mode", "docked");
    }, []);
    if (reactl0.useEffect(() => {
      if (!meta)
        return;
      let callback5 = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229 || (0, runtime2.hasOpenOverlay)())
          return;
        let target = event.target;
        if (target && ref.current?.contains(target) === !0 && ((target.tagName === "TEXTAREA" || target.tagName === "INPUT" && !NON_TEXT_INPUT_TYPES.test(target.getAttribute("type") ?? "")) && !(0, runtime2.isKitField)(target) && typeof target.value == "string" && target.value.length > 0 || target.isContentEditable === !0 && (target.textContent ?? "") !== "")) {
          target.blur?.();
          return;
        }
        event.preventDefault(), meta.onClose();
      };
      return window.addEventListener("keydown", callback5), () => window.removeEventListener("keydown", callback5);
    }, [meta]), !meta)
      return null;
    let value22 = value12 === "floating", value23 = meta.sheetFitsContent === !0, value24 = value8 > 0 ? value8 : Math.min(Math.round(value4 / 2), 384 + value6), state = {
      "--mc-side-w": `${width}px`,
      ...value8 > 0 && !value23 ? {
        "--mc-sheet-h": `${value8}px`
      } : {}
    }, value25 = meta.tabs !== void 0 && meta.tabs.length > 0 ? meta.tabs : void 0, value26 = value25 !== void 0, value27 = value25 !== void 0 ? jsxe5.jsx("div", {
      onPointerDown: callback3,
      className: (0, runtime2.joinClassNames)("shrink-0 touch-none select-none border-b border-border-line", value11 && (value15 ? "cursor-grabbing" : "cursor-grab")),
      children: jsxe5.jsx(runtime2.CdsRoot, {
        density: "compact",
        className: "contents",
        children: jsxe5.jsx(PanelHeader, {
          tabs: value25,
          tab: meta.tab ?? value25[0]?.value,
          onTabChange: meta.onTabChange,
          tabsLabel: meta.tabsLabel ?? "Panel view",
          trailing: value22 ? jsxe5.jsx(runtime2.Button, {
            iconOnly: !0,
            variant: "ghost",
            icon: "SidebarRight",
            "aria-label": "固定面板",
            tooltip: "固定回侧边栏",
            className: "relative shrink-0",
            onClick: callback4
          }) : void 0,
          onClose: () => meta.onClose(),
          closeLabel: "关闭面板"
        }, meta.id)
      })
    }) : jsxe5.jsxs("div", {
      "data-kit": "panel-header",
      onPointerDown: callback3,
      className: (0, runtime2.joinClassNames)("flex h-[38px] shrink-0 touch-none items-center gap-1.5 px-3", "pointer-coarse:gap-4", "select-none border-b transition-colors", value20 ? "border-border-line" : "border-transparent", meta.wideHeader === !1 && !value11 && "md:hidden", value11 && (value15 ? "cursor-grabbing" : "cursor-grab")),
      children: [
        jsxe5.jsx("span", {
          ref: setLeadingEl,
          className: "-ml-[5px] flex shrink-0 items-center empty:hidden"
        }),
        jsxe5.jsx("span", {
          className: "min-w-0 flex-1 truncate text-body-semibold",
          children: meta.hideTitle === !0 ? null : meta.title
        }),
        jsxe5.jsx("span", {
          ref: setTrailingEl,
          className: "relative z-20 flex shrink-0 items-center gap-1.5 pointer-coarse:gap-4 empty:hidden"
        }),
        value22 ? jsxe5.jsx(PanelIconButton, {
          icon: "SidebarRight",
          "aria-label": "固定面板",
          tooltip: "固定回侧边栏",
          onClick: callback4
        }) : null,
        jsxe5.jsx(PanelIconButton, {
          icon: "X",
          "aria-label": "关闭面板",
          className: meta.closeInset === "shell" ? void 0 : "-mr-[5px]",
          onClick: () => meta.onClose()
        })
      ]
    });
    return jsxe5.jsxs("div", {
      ref,
      role: value22 ? "dialog" : "complementary",
      "aria-label": meta.title,
      style: {
        ...value22 ? {
          position: "fixed",
          width,
          ...value13 ? {
            left: value13.x,
            top: value13.y
          } : {
            right: 12,
            top: defaultFloatingPanelTop(ref.current)
          }
        } : state,
        ...hidden ? {
          display: "none"
        } : {}
      },
      className: (0, runtime2.joinClassNames)("z-panel flex min-h-0 flex-col", value22 ? "max-h-[min(75dvh,42rem)] rounded-lg border border-border-line bg-panel shadow-xl" : (0, runtime2.joinClassNames)("bg-surface-panel", "relative w-[var(--mc-side-w)] shrink-0 border-l border-border-line pb-[var(--mc-foot-inset,0px)]", meta.wide === "overlay" && "md:absolute md:top-[var(--tb-row-h,0px)] md:right-0 md:bottom-0 md:shadow-xl", meta.narrow === "sheet" ? (0, runtime2.joinClassNames)("max-md:relative max-md:z-sheet", value23 ? "max-md:max-h-[85dvh]" : "max-md:h-[var(--mc-sheet-h,min(50dvh,calc(24rem_+_var(--mc-foot-inset,0px))))]", "max-md:w-full max-md:shrink-0", "max-md:border-t max-md:border-l-0 max-md:border-border-line") : "max-md:absolute max-md:top-[var(--tb-row-h,0px)] max-md:right-0 max-md:bottom-0 max-md:shadow-xl")),
      children: [
        !value22 && meta.narrow === "sheet" && !value23 ? jsxe5.jsx(PanelResizeHandle, {
          name: "sheet",
          label: "调整面板大小",
          now: value24,
          valueText: String(value24) + " pixels tall",
          min: minimumPanelHeight(value6, value4),
          max: maximumPanelHeight(value4),
          gesture: memo22,
          className: "hidden max-md:block",
          grabClassName: (0, runtime2.joinClassNames)("max-md:pointer-coarse:flex pointer-coarse:right-14", value26 ? "justify-end" : "justify-center"),
          grabTargetClassName: value26 ? void 0 : "ml-14"
        }) : null,
        value27,
        jsxe5.jsxs("div", {
          className: "relative flex min-h-0 flex-1 flex-col",
          children: [
            jsxe5.jsx("div", {
              ref: callback2,
              className: "flex min-h-0 flex-1 flex-col overflow-hidden"
            }),
            value18 && meta.narrow === "sheet" ? null : jsxe5.jsx(PanelWidthResizeHandle, {
              ...value17,
              gesture: memo4,
              label: meta.resizeLabel
            })
          ]
        })
      ]
    });
  }
  function PanedLayout({ toolbar, leading, toolbarVariant = "docked", children }) {
    let value = leading == null ? null : jsxaZ.jsx("div", {
      "data-mc-chrome": "",
      className: "contents",
      children: leading
    }), value2 = jsxaZ.jsx("main", {
      "data-appifact-main": "",
      className: "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
      children
    });
    return jsxaZ.jsx(SidePanelProvider, {
      children: toolbarVariant === "floating" ? jsxaZ.jsxs("div", {
        "data-mc-paned": "",
        className: "relative flex h-dvh overflow-hidden max-md:flex-col",
        children: [
          jsxaZ.jsxs("div", {
            className: "flex min-h-0 min-w-0 flex-1",
            children: [
              value,
              jsxaZ.jsxs("div", {
                className: "relative flex min-h-0 min-w-0 flex-1 flex-col",
                children: [toolbar, value2]
              })
            ]
          }),
          jsxaZ.jsx(SidePanelHost, {})
        ]
      }) : jsxaZ.jsxs("div", {
        "data-mc-paned": "",
        className: "flex h-dvh overflow-hidden",
        children: [
          value,
          jsxaZ.jsxs("div", {
            className: "flex min-h-0 min-w-0 flex-1 flex-col",
            children: [
              toolbar,
              jsxaZ.jsxs("div", {
                className: "relative flex min-h-0 flex-1 max-md:flex-col",
                children: [value2, jsxaZ.jsx(SidePanelHost, {})]
              })
            ]
          })
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "reactl0", () => reactl0, (value) => {
    reactl0 = value;
  }), bindRuntimeValue(runtime2, "reactDOMip", () => reactDOMip, (value) => {
    reactDOMip = value;
  }), bindRuntimeValue(runtime2, "reactb20", () => reactb20, (value) => {
    reactb20 = value;
  }), bindRuntimeValue(runtime2, "jsxf1", () => jsxf1, (value) => {
    jsxf1 = value;
  }), bindRuntimeValue(runtime2, "PANEL_HEADER_CLASS", () => PANEL_HEADER_CLASS, (value) => {
    PANEL_HEADER_CLASS = value;
  }), bindRuntimeValue(runtime2, "PanelHeaderContent", () => PanelHeaderContent), bindRuntimeValue(runtime2, "usePanelHeaderTab", () => usePanelHeaderTab), bindRuntimeValue(runtime2, "PanelHeader", () => PanelHeader), bindRuntimeValue(runtime2, "jsxe5", () => jsxe5, (value) => {
    jsxe5 = value;
  }), bindRuntimeValue(runtime2, "PanelIconButton", () => PanelIconButton, (value) => {
    PanelIconButton = value;
  }), bindRuntimeValue(runtime2, "SidePanelContext", () => SidePanelContext, (value) => {
    SidePanelContext = value;
  }), bindRuntimeValue(runtime2, "SidePanelHostContext", () => SidePanelHostContext, (value) => {
    SidePanelHostContext = value;
  }), bindRuntimeValue(runtime2, "SidePanelProvider", () => SidePanelProvider), bindRuntimeValue(runtime2, "useSidePanel", () => useSidePanel), bindRuntimeValue(runtime2, "SidePanel", () => SidePanel), bindRuntimeValue(runtime2, "PANEL_STORAGE_PREFIX", () => PANEL_STORAGE_PREFIX, (value) => {
    PANEL_STORAGE_PREFIX = value;
  }), bindRuntimeValue(runtime2, "readPanelPreference", () => readPanelPreference), bindRuntimeValue(runtime2, "writePanelPreference", () => writePanelPreference), bindRuntimeValue(runtime2, "isFinitePanelNumber", () => isFinitePanelNumber, (value) => {
    isFinitePanelNumber = value;
  }), bindRuntimeValue(runtime2, "isPanelDockMode", () => isPanelDockMode, (value) => {
    isPanelDockMode = value;
  }), bindRuntimeValue(runtime2, "isPanelPosition", () => isPanelPosition, (value) => {
    isPanelPosition = value;
  }), bindRuntimeValue(runtime2, "MIN_PANEL_WIDTH", () => MIN_PANEL_WIDTH, (value) => {
    MIN_PANEL_WIDTH = value;
  }), bindRuntimeValue(runtime2, "NON_TEXT_INPUT_TYPES", () => NON_TEXT_INPUT_TYPES, (value) => {
    NON_TEXT_INPUT_TYPES = value;
  }), bindRuntimeValue(runtime2, "maximumPanelWidth", () => maximumPanelWidth), bindRuntimeValue(runtime2, "clampPanelWidth", () => clampPanelWidth), bindRuntimeValue(runtime2, "approximatelyEqualPanelSize", () => approximatelyEqualPanelSize, (value) => {
    approximatelyEqualPanelSize = value;
  }), bindRuntimeValue(runtime2, "MIN_PANEL_HEIGHT", () => MIN_PANEL_HEIGHT, (value) => {
    MIN_PANEL_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "PANEL_SHEET_MAX_HEIGHT", () => PANEL_SHEET_MAX_HEIGHT, (value) => {
    PANEL_SHEET_MAX_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "maximumPanelHeight", () => maximumPanelHeight), bindRuntimeValue(runtime2, "minimumPanelHeight", () => minimumPanelHeight), bindRuntimeValue(runtime2, "clampPanelHeight", () => clampPanelHeight), bindRuntimeValue(runtime2, "panelBottomPadding", () => panelBottomPadding), bindRuntimeValue(runtime2, "defaultFloatingPanelTop", () => defaultFloatingPanelTop), bindRuntimeValue(runtime2, "clampFloatingPanelPosition", () => clampFloatingPanelPosition), bindRuntimeValue(runtime2, "beginPanelPointerGesture", () => beginPanelPointerGesture), bindRuntimeValue(runtime2, "IFRAME_POINTER_LOCK_CLASS", () => IFRAME_POINTER_LOCK_CLASS, (value) => {
    IFRAME_POINTER_LOCK_CLASS = value;
  }), bindRuntimeValue(runtime2, "activeIframePointerLocks", () => activeIframePointerLocks, (value) => {
    activeIframePointerLocks = value;
  }), bindRuntimeValue(runtime2, "holdIframePointerLock", () => holdIframePointerLock), bindRuntimeValue(runtime2, "wrapPanelResizeGestures", () => wrapPanelResizeGestures), bindRuntimeValue(runtime2, "COARSE_PANEL_WIDTH", () => COARSE_PANEL_WIDTH, (value) => {
    COARSE_PANEL_WIDTH = value;
  }), bindRuntimeValue(runtime2, "usePanelWidth", () => usePanelWidth), bindRuntimeValue(runtime2, "PanelWidthResizeHandle", () => PanelWidthResizeHandle), bindRuntimeValue(runtime2, "PanelResizeHandle", () => PanelResizeHandle), bindRuntimeValue(runtime2, "SidePanelHost", () => SidePanelHost), bindRuntimeValue(runtime2, "jsxaZ", () => jsxaZ, (value) => {
    jsxaZ = value;
  }), bindRuntimeValue(runtime2, "PanedLayout", () => PanedLayout), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPointerMedia)(), (0, runtime2.initializeUiPropertyFocus)(), reactl0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMip = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyLabels)(), reactb20 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxf1 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PANEL_HEADER_CLASS = "flex min-w-0 shrink-0 items-center gap-xs py-md pr-sm pl-sm", (0, runtime2.initializeTooltipWrapper)(), jsxe5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PanelIconButton = reactl0.forwardRef(function(input, options) {
      return jsxe5.jsx(runtime2.Button, {
        ref: options,
        iconOnly: !0,
        size: "xs",
        variant: "ghost",
        ...input
      });
    }), SidePanelContext = reactl0.createContext(null), SidePanelHostContext = reactl0.createContext(null), PANEL_STORAGE_PREFIX = "mc-side/", isFinitePanelNumber = (value) => typeof value == "number" && Number.isFinite(value), isPanelDockMode = (value) => value === "docked" || value === "floating", isPanelPosition = (value) => typeof value == "object" && value !== null && Number.isFinite(value.x) && Number.isFinite(value.y), MIN_PANEL_WIDTH = 285, NON_TEXT_INPUT_TYPES = /^(checkbox|radio|range|button|submit|reset|image|color)$/i, approximatelyEqualPanelSize = (left, right) => Math.abs(left - right) < 1, MIN_PANEL_HEIGHT = 160, PANEL_SHEET_MAX_HEIGHT = "min(50dvh, calc(24rem + var(--mc-foot-inset, 0px)))", IFRAME_POINTER_LOCK_CLASS = "[&_iframe]:pointer-events-none!", activeIframePointerLocks = 0, COARSE_PANEL_WIDTH = 376, jsxaZ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiSidePanels
};
