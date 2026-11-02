// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiTabs2(runtime2) {
  var reactuP, tabsOverflowContext, STASHED_TAB_ATTRIBUTE, TABS_MENU_TRIGGER_ID, TABS_MENU_LABEL_ID, initializeUiTabs22, reactm3, jsxg3, TAB_SELECTOR, TAB_TEXT_EXCLUDED_SELECTOR, initializeUiTabs222, reacti6, jsxForUiTabs22, TAB_LIST_CLASS, TAB_EDGE_RADIUS_CLASS, TAB_SELECTED_CLASS, TAB_INACTIVE_CLASS, TAB_UNDERLINE_CLASS, TABS_OVERFLOW_RECHECK_MS, TAB_ACTIVE_SELECTOR, TabsList3, TAB_CLOSE_BUTTON_CLASS, TAB_ACTIVE_HOVER_CLASS, TAB_CLOSE_BUTTON_HOVER_CLASS, TabsTab3, TabsPanel3, TabsRoot3, Tabs, initializeUiTabs23;
  function useTabsOverflow() {
    return reactuP.useContext(tabsOverflowContext);
  }
  function extractVisibleElementText(input, options) {
    let text = "", callback = (input2) => {
      if (input2.nodeType === Node.TEXT_NODE)
        text += input2.nodeValue ?? "";
      else if (input2.nodeType === Node.ELEMENT_NODE) {
        if (input2 !== input && (input2.matches(options) || getComputedStyle(input2).display === "none"))
          return;
        text += " ", input2.childNodes.forEach(callback), text += " ";
      }
    };
    return callback(input), text.replace(/\s+/g, " ").trim();
  }
  function getTabLabelText(element) {
    let value = extractVisibleElementText(element, TAB_TEXT_EXCLUDED_SELECTOR);
    return value !== "" ? value : (element.getAttribute("aria-label") ?? "").trim();
  }
  function getTabScreenReaderText(input) {
    let text = "";
    return input.querySelectorAll(".sr-only").forEach((input2) => {
      input2.closest("[data-cds-disabled-reason]") === null && (text += ` ${extractVisibleElementText(input2, '[aria-hidden="true"], [hidden]')}`);
    }), text.trim();
  }
  function sortConnectedTabsByDocumentOrder(input) {
    return [...input.entries()].filter(([, input2]) => input2.isConnected).sort(([, input2], [, options]) => input2.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).map(([input2, input3]) => createTabMenuItem(input2, input3));
  }
  function collectTabValues(input, options) {
    if (input === null)
      return [];
    let entries = /* @__PURE__ */ new Map();
    options.forEach((input2, options2) => entries.set(input2, options2));
    let items = [];
    return input.querySelectorAll(TAB_SELECTOR).forEach((input2) => {
      entries.has(input2) && items.push(createTabMenuItem(entries.get(input2), input2));
    }), items;
  }
  function createTabMenuItem(input, element) {
    let value = element.querySelector("[data-cds-disabled-reason]")?.textContent?.trim();
    return {
      value: input,
      text: getTabLabelText(element),
      srText: getTabScreenReaderText(element),
      disabled: element.getAttribute("aria-disabled") === "true" || element.hasAttribute("data-disabled"),
      reason: value === void 0 || value === "" ? void 0 : value
    };
  }
  function areTabMenuItemsEqual(items, items2) {
    return items.length === items2.length && items.every((input, options) => Object.is(input.value, items2[options].value) && input.text === items2[options].text && input.srText === items2[options].srText && input.disabled === items2[options].disabled && input.reason === items2[options].reason);
  }
  function TabsListMenu({ size: size4, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, listRef, triggerHadFocusRef }) {
    let value = useTabsOverflow(), ref = reactm3.useRef(null), value2 = reactm3.useId(), value3 = reactm3.useId(), [value4, value5] = reactm3.useState(() => sortConnectedTabsByDocumentOrder(value?.tabs() ?? /* @__PURE__ */ new Map())), callback = reactm3.useCallback(() => {
      let value8 = collectTabValues(listRef.current, value?.tabs() ?? /* @__PURE__ */ new Map());
      value5((input) => areTabMenuItemsEqual(input, value8) ? input : value8);
    }, [listRef, value]);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      callback();
      let current = listRef.current;
      if (current === null || typeof MutationObserver > "u")
        return;
      let value8 = (0, runtime2.createSafeMutationObserver)(MutationObserver, callback);
      return value8.observe(current, {
        subtree: !0,
        childList: !0,
        characterData: !0,
        attributes: !0,
        attributeFilter: ["aria-disabled", "data-disabled", "aria-label"]
      }), () => value8.disconnect();
    }, [callback, listRef]), reactm3.useEffect(callback, [callback]), (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = listRef.current, value8 = current?.ownerDocument.activeElement ?? null;
      return current !== null && value8 !== null && current.contains(value8) && ref.current?.focus(), () => {
        let current2 = ref.current, value9 = current2?.ownerDocument.activeElement ?? null, value10 = current2?.getAttribute("aria-controls") ?? null, value11 = value10 === null ? null : current2.ownerDocument.getElementById(value10);
        triggerHadFocusRef.current = current2 !== null && value9 !== null && (value9 === current2 || value11 !== null && value11.contains(value9));
      };
    }, [listRef, triggerHadFocusRef]);
    let value6 = value4.find((input) => value !== null && Object.is(input.value, value.value)), value7 = [
      ariaLabelledby ?? (ariaLabel !== void 0 ? value2 : void 0),
      value6 !== void 0 ? value3 : void 0
    ].filter(Boolean).join(" ");
    return jsxg3.jsxs(runtime2.Menu.Root, {
      sheetTitle: ariaLabel,
      children: [
        jsxg3.jsxs(runtime2.Menu.TriggerButton, {
          ref,
          variant: "secondary",
          size: size4,
          "aria-labelledby": value7 === "" ? void 0 : value7,
          "data-cds-part": TABS_MENU_TRIGGER_ID,
          className: "max-w-full min-w-0",
          children: [
            ariaLabel !== void 0 && ariaLabelledby === void 0 ? jsxg3.jsx("span", {
              id: value2,
              className: "sr-only",
              children: ariaLabel
            }) : null,
            value6 !== void 0 ? jsxg3.jsx("span", {
              id: value3,
              "data-cds-part": TABS_MENU_LABEL_ID,
              className: "max-w-40 min-w-0 truncate",
              children: value6.text
            }) : ariaLabel !== void 0 ? jsxg3.jsx("span", {
              "aria-hidden": !0,
              "data-cds-part": TABS_MENU_LABEL_ID,
              className: "max-w-40 min-w-0 truncate",
              children: ariaLabel
            }) : null
          ]
        }),
        jsxg3.jsx(runtime2.Menu.Popup, {
          children: jsxg3.jsx(runtime2.Menu.Group, {
            "aria-label": ariaLabelledby === void 0 ? ariaLabel : void 0,
            "aria-labelledby": ariaLabelledby,
            children: value4.map((input, options) => jsxg3.jsxs(runtime2.Menu.Item, {
              checkedRole: "radio",
              checked: input === value6,
              disabled: input.disabled,
              disabledReason: input.reason,
              onClick: () => value?.activate(input.value),
              children: [
                input.text,
                input.srText !== "" ? jsxg3.jsxs("span", {
                  className: "sr-only",
                  children: [" ", input.srText]
                }) : null
              ]
            }, `${String(input.value)}:${options}`))
          })
        })
      ]
    });
  }
  function debugTabListOverflow(input, options) {
  }
  function resetAncestorHorizontalScroll(input, options, skip) {
    for (let value = input; value !== null && value !== options; value = value.parentElement) {
      let { overflowX: value2 } = getComputedStyle(value);
      if ((value2 === "auto" || value2 === "scroll") && value !== skip)
        return !0;
    }
    return !1;
  }
  function canTabsOverflowInline(input, options) {
    if (getComputedStyle(input).display === "contents")
      return !0;
    for (let value of Array.from(input.children)) {
      if (value === options || value.contains(options) || !(0, runtime2.isHtmlElement)(value) || value.getAttribute("data-cds-part") === "tabs-menu-trigger")
        continue;
      let value2 = getComputedStyle(value);
      if (value2.display !== "none" && value2.position !== "absolute" && value2.position !== "fixed")
        return !0;
    }
    return !1;
  }
  function canTabsCollapseIntoMenu(list, tabs, scroller) {
    let parent = tabs.parentElement;
    return tabs.getAttribute("data-orientation") !== "vertical" && !canTabsOverflowInline(tabs, list) && !resetAncestorHorizontalScroll(list, tabs, scroller) && parent !== null && (0, runtime2.isUnwrappedHorizontalFlex)(parent);
  }
  function getLayoutParent(element) {
    let parent = element.parentElement;
    for (; parent !== null && getComputedStyle(parent).display === "contents"; )
      parent = parent.parentElement;
    return parent;
  }
  function tabStripFitsWithRoom(list) {
    let { firstElementChild: first, lastElementChild: last } = list;
    if (!(0, runtime2.isHtmlElement)(first) || !(0, runtime2.isHtmlElement)(last))
      return first === null;
    let { offsetLeft: firstLeft, offsetWidth: firstWidth } = first, { offsetLeft: lastLeft, offsetWidth: lastWidth } = last, span = Math.max(firstLeft + firstWidth, lastLeft + lastWidth) - Math.min(firstLeft, lastLeft);
    return firstWidth > 0 && lastWidth > 0 && span + 64 <= list.clientWidth;
  }
  function useTabsPagerMode(listRef, frameRef, scrollerRef, collapsed, className, value, reveal) {
    let [mode, setMode] = reacti6.useState(!1), flipsRef = reacti6.useRef({
      flips: 0,
      at: 0
    });
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      const list = listRef.current, frame = frameRef.current, scroller = scrollerRef.current, tabs = list?.closest('[data-cds="Tabs"]') ?? null;
      if (list === null || frame === null || tabs === null)
        return;
      let ObserverConstructor = (0, runtime2.getResizeObserverConstructor)(list);
      if (ObserverConstructor === void 0)
        return;
      let lastSizes = "", check = () => {
        if (!mode && tabStripFitsWithRoom(list))
          return;
        if (collapsed || tabs.getAttribute("data-orientation") === "vertical" || !(0, runtime2.isUnwrappedHorizontalFlex)(list) || resetAncestorHorizontalScroll(list, tabs, scroller) || !mode && !["none", ""].includes(getComputedStyle(list).maxWidth) || canTabsCollapseIntoMenu(list, tabs, scroller)) {
          setMode(!1);
          return;
        }
        let style = getComputedStyle(list), contentWidth = (0, runtime2.measureTabStripContents)(list) + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0), roomWidth = mode ? frame.getBoundingClientRect().width - (Number.parseFloat(style.marginLeft) || 0) - (Number.parseFloat(style.marginRight) || 0) : list.getBoundingClientRect().width;
        if (contentWidth <= 0 || roomWidth <= 0) {
          lastSizes = "";
          return;
        }
        let overflows = mode ? contentWidth - roomWidth > -1 : contentWidth - roomWidth > 0.5;
        if ((mode || overflows) && (0, runtime2.isCdsLayoutDebugEnabled)()) {
          setMode(!1);
          return;
        }
        if (overflows) {
          let parent = getLayoutParent(frame);
          setMode(parent !== null && (0, runtime2.isUnwrappedHorizontalFlex)(parent) ? "row" : "block");
          let sizes = `${contentWidth} ${roomWidth}`, target = list.querySelector(":focus") ?? list.querySelector(TAB_ACTIVE_SELECTOR);
          mode && target && sizes !== lastSizes && reveal(target, lastSizes !== ""), lastSizes = sizes;
          return;
        }
        if (mode) {
          let flips = flipsRef.current, now = Date.now();
          flips.flips = now - flips.at > TABS_OVERFLOW_RECHECK_MS ? 0 : flips.flips + 1, flips.at = now, flips.flips < 3 && setMode(!1);
        }
      }, resizeObserver = (0, runtime2.createSafeResizeObserver)(ObserverConstructor, check), observeAll = () => {
        resizeObserver.disconnect(), resizeObserver.observe(mode ? frame : list);
        for (let child of Array.from(list.children))
          resizeObserver.observe(child);
      };
      check(), observeAll();
      let childObserver = typeof MutationObserver > "u" ? null : (0, runtime2.createSafeMutationObserver)(MutationObserver, observeAll);
      return childObserver?.observe(list, {
        childList: !0
      }), () => {
        resizeObserver.disconnect(), childObserver?.disconnect();
      };
    }, [className, collapsed, frameRef, listRef, mode, reveal, scrollerRef, value]), mode;
  }
  function useTabsOverflowMenu(input, scrollerRef, options, context, value) {
    let [value2, value3] = reacti6.useState(!1), ref = reacti6.useRef(/* @__PURE__ */ new Map()), ref2 = reacti6.useRef(0), ref3 = reacti6.useRef(NaN), ref4 = reacti6.useRef(context), ref5 = reacti6.useRef(value);
    return (0, runtime2.useIsomorphicLayoutEffect)(() => {
      let current = input.current, value4 = current?.closest('[data-cds="Tabs"]') ?? null, value5 = value4?.parentElement ?? null;
      if (current === null || value4 === null || value5 === null)
        return;
      let value6 = (0, runtime2.getResizeObserverConstructor)(value5);
      if (value6 === void 0)
        return;
      let value7 = ref4.current !== context || ref5.current !== value;
      ref4.current = context, ref5.current = value;
      let value8, callback = (input2, options2, context2) => {
        let value12 = Date.now(), current2 = ref.current;
        value12 - ref2.current > TABS_OVERFLOW_RECHECK_MS && current2.clear();
        let value13 = Math.round(options2), value14 = current2.get(value13) ?? 0;
        if (!input2 && !context2 && value14 >= 2) {
          ref3.current !== value13 && (ref3.current = value13, clearTimeout(value8), value8 = setTimeout(() => callback3(!1), 550));
          return;
        }
        value13 !== ref3.current && (ref3.current = NaN), input2 || current2.set(value13, value14 + 1), ref2.current = value12, value3(input2);
      }, callback2 = () => !canTabsCollapseIntoMenu(current, value4, scrollerRef.current), callback3 = (input2) => {
        if (callback2()) {
          value2 && value3(!1);
          return;
        }
        let value12 = (0, runtime2.getInnerElementWidth)(value5);
        if (value12 <= 0)
          return;
        let value13 = (0, runtime2.measureTabStripContents)(current);
        if (value13 <= 0)
          return;
        let value14 = getComputedStyle(current), value15 = getComputedStyle(value4), value16 = value13 + (Number.parseFloat(value14.marginLeft) || 0) + (Number.parseFloat(value14.marginRight) || 0) + (Number.parseFloat(value15.paddingLeft) || 0) + (Number.parseFloat(value15.paddingRight) || 0) + (Number.parseFloat(value15.borderLeftWidth) || 0) + (Number.parseFloat(value15.borderRightWidth) || 0), value17 = (0, runtime2.getTabOverflowWidth)(value5, value4, value16);
        if (value2) {
          !context && value12 >= value17 + (value ? 0 : 64) && callback(!1, value12, input2);
          return;
        }
        value12 + 0.5 < value17 && callback(!0, value12, input2);
      };
      callback3(value7);
      let value9 = (0, runtime2.createSafeResizeObserver)(value6, () => callback3(!1));
      value9.observe(value5), value9.observe(current);
      let value10 = typeof MutationObserver > "u" ? null : (0, runtime2.createSafeMutationObserver)(MutationObserver, () => callback3(!0));
      value10?.observe(current, {
        childList: !0,
        subtree: !0,
        characterData: !0
      });
      let value11 = typeof MutationObserver > "u" ? null : (0, runtime2.createSafeMutationObserver)(MutationObserver, () => callback3(!1));
      return value11?.observe(value5, {
        childList: !0
      }), () => {
        clearTimeout(value8), value9.disconnect(), value10?.disconnect(), value11?.disconnect();
      };
    }, [value2, value, context, options, input, scrollerRef]), value2;
  }
  return bindRuntimeValue(runtime2, "useTabsOverflow", () => useTabsOverflow), bindRuntimeValue(runtime2, "reactuP", () => reactuP, (value) => {
    reactuP = value;
  }), bindRuntimeValue(runtime2, "tabsOverflowContext", () => tabsOverflowContext, (value) => {
    tabsOverflowContext = value;
  }), bindRuntimeValue(runtime2, "STASHED_TAB_ATTRIBUTE", () => STASHED_TAB_ATTRIBUTE, (value) => {
    STASHED_TAB_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "TABS_MENU_TRIGGER_ID", () => TABS_MENU_TRIGGER_ID, (value) => {
    TABS_MENU_TRIGGER_ID = value;
  }), bindRuntimeValue(runtime2, "TABS_MENU_LABEL_ID", () => TABS_MENU_LABEL_ID, (value) => {
    TABS_MENU_LABEL_ID = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs22", () => initializeUiTabs22, (value) => {
    initializeUiTabs22 = value;
  }), bindRuntimeValue(runtime2, "extractVisibleElementText", () => extractVisibleElementText), bindRuntimeValue(runtime2, "getTabLabelText", () => getTabLabelText), bindRuntimeValue(runtime2, "getTabScreenReaderText", () => getTabScreenReaderText), bindRuntimeValue(runtime2, "sortConnectedTabsByDocumentOrder", () => sortConnectedTabsByDocumentOrder), bindRuntimeValue(runtime2, "collectTabValues", () => collectTabValues), bindRuntimeValue(runtime2, "createTabMenuItem", () => createTabMenuItem), bindRuntimeValue(runtime2, "areTabMenuItemsEqual", () => areTabMenuItemsEqual), bindRuntimeValue(runtime2, "TabsListMenu", () => TabsListMenu), bindRuntimeValue(runtime2, "reactm3", () => reactm3, (value) => {
    reactm3 = value;
  }), bindRuntimeValue(runtime2, "jsxg3", () => jsxg3, (value) => {
    jsxg3 = value;
  }), bindRuntimeValue(runtime2, "TAB_SELECTOR", () => TAB_SELECTOR, (value) => {
    TAB_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "TAB_TEXT_EXCLUDED_SELECTOR", () => TAB_TEXT_EXCLUDED_SELECTOR, (value) => {
    TAB_TEXT_EXCLUDED_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs222", () => initializeUiTabs222, (value) => {
    initializeUiTabs222 = value;
  }), bindRuntimeValue(runtime2, "debugTabListOverflow", () => debugTabListOverflow), bindRuntimeValue(runtime2, "resetAncestorHorizontalScroll", () => resetAncestorHorizontalScroll), bindRuntimeValue(runtime2, "canTabsOverflowInline", () => canTabsOverflowInline), bindRuntimeValue(runtime2, "useTabsOverflowMenu", () => useTabsOverflowMenu), bindRuntimeValue(runtime2, "reacti6", () => reacti6, (value) => {
    reacti6 = value;
  }), bindRuntimeValue(runtime2, "jsxForUiTabs22", () => jsxForUiTabs22, (value) => {
    jsxForUiTabs22 = value;
  }), bindRuntimeValue(runtime2, "TAB_LIST_CLASS", () => TAB_LIST_CLASS, (value) => {
    TAB_LIST_CLASS = value;
  }), bindRuntimeValue(runtime2, "TAB_EDGE_RADIUS_CLASS", () => TAB_EDGE_RADIUS_CLASS, (value) => {
    TAB_EDGE_RADIUS_CLASS = value;
  }), bindRuntimeValue(runtime2, "TAB_SELECTED_CLASS", () => TAB_SELECTED_CLASS, (value) => {
    TAB_SELECTED_CLASS = value;
  }), bindRuntimeValue(runtime2, "TAB_INACTIVE_CLASS", () => TAB_INACTIVE_CLASS, (value) => {
    TAB_INACTIVE_CLASS = value;
  }), bindRuntimeValue(runtime2, "TAB_UNDERLINE_CLASS", () => TAB_UNDERLINE_CLASS, (value) => {
    TAB_UNDERLINE_CLASS = value;
  }), bindRuntimeValue(runtime2, "TABS_OVERFLOW_RECHECK_MS", () => TABS_OVERFLOW_RECHECK_MS, (value) => {
    TABS_OVERFLOW_RECHECK_MS = value;
  }), bindRuntimeValue(runtime2, "TAB_ACTIVE_SELECTOR", () => TAB_ACTIVE_SELECTOR, (value) => {
    TAB_ACTIVE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "TabsList", () => TabsList3, (value) => {
    TabsList3 = value;
  }), bindRuntimeValue(runtime2, "TAB_CLOSE_BUTTON_CLASS", () => TAB_CLOSE_BUTTON_CLASS, (value) => {
    TAB_CLOSE_BUTTON_CLASS = value;
  }), bindRuntimeValue(runtime2, "TAB_ACTIVE_HOVER_CLASS", () => TAB_ACTIVE_HOVER_CLASS, (value) => {
    TAB_ACTIVE_HOVER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TAB_CLOSE_BUTTON_HOVER_CLASS", () => TAB_CLOSE_BUTTON_HOVER_CLASS, (value) => {
    TAB_CLOSE_BUTTON_HOVER_CLASS = value;
  }), bindRuntimeValue(runtime2, "TabsTab", () => TabsTab3, (value) => {
    TabsTab3 = value;
  }), bindRuntimeValue(runtime2, "TabsPanel", () => TabsPanel3, (value) => {
    TabsPanel3 = value;
  }), bindRuntimeValue(runtime2, "TabsRoot", () => TabsRoot3, (value) => {
    TabsRoot3 = value;
  }), bindRuntimeValue(runtime2, "Tabs", () => Tabs, (value) => {
    Tabs = value;
  }), bindRuntimeValue(runtime2, "initializeUiTabs23", () => initializeUiTabs23, (value) => {
    initializeUiTabs23 = value;
  }), () => {
    STASHED_TAB_ATTRIBUTE = "data-cds-stashed", TABS_MENU_TRIGGER_ID = "tabs-menu-trigger", TABS_MENU_LABEL_ID = "tabs-menu-label", initializeUiTabs22 = (0, runtime2.initializeOnce)(() => {
      reactuP = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), tabsOverflowContext = reactuP.createContext(null);
    }), TAB_SELECTOR = '[role="tab"]', TAB_TEXT_EXCLUDED_SELECTOR = '[aria-hidden="true"], [hidden], [data-cds-disabled-reason], [role="img"], svg, .sr-only', initializeUiTabs222 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeUiMenu9)(), initializeUiTabs22(), reactm3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxg3 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TabsListMenu.displayName = "Tabs.ListMenu";
    }), TAB_LIST_CLASS = "flex items-center font-sans", TAB_EDGE_RADIUS_CLASS = "data-[orientation=horizontal]:[&>[role=tab]:first-child]:before:start-0 data-[orientation=horizontal]:[&>:first-child>[data-orientation][role=tab]:first-child]:before:start-0 data-[orientation=horizontal]:[&>:first-child>:first-child>[data-orientation][role=tab]:first-child]:before:start-0", TAB_SELECTED_CLASS = "data-[orientation=horizontal]:[&>[role=tab]:last-child]:before:end-0 data-[orientation=horizontal]:[&>:last-child>[data-orientation][role=tab]:last-child]:before:end-0 data-[orientation=horizontal]:[&>:last-child>:last-child>[data-orientation][role=tab]:last-child]:before:end-0", TAB_INACTIVE_CLASS = "-ml-pad-md [&:where(:root[dir=rtl]_:dir(rtl))]:me-0 [&:where(:root[dir=rtl]_:dir(rtl))]:-ms-pad-md", TAB_UNDERLINE_CLASS = "invisible absolute size-0 min-h-0 min-w-0 max-w-none overflow-hidden", TABS_OVERFLOW_RECHECK_MS = 500, TAB_ACTIVE_SELECTOR = '[role="tab"][aria-selected="true"]', TAB_CLOSE_BUTTON_CLASS = "relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 rounded-none h-control px-md cds-reset whitespace-nowrap select-none outline-none focus-visible:outline-hidden bg-transparent text-body font-medium font-control text-muted before:absolute before:inset-y-0 before:inset-x-px before:rounded before:-z-[1] before:transition-shadow before:duration-fast [&:not([data-active]):not([data-disabled])]:hover:text-secondary [&:not([data-active]):not([data-disabled])]:hover:before:bg-fill-ghost-hover data-[active]:text-primary data-[active]:before:bg-fill-ghost-hover focus-visible:before:shadow-focus data-[disabled]:opacity-disabled data-[disabled]:pointer-events-none", TAB_ACTIVE_HOVER_CLASS = "stacks:[&[data-active]:not([data-disabled])]:hover:before:layers-1-fill-ghost-hover", TAB_CLOSE_BUTTON_HOVER_CLASS = "data-[disabled]:pointer-events-auto", initializeUiTabs23 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSafeObservers)(), (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeCdsRoot)(), (0, runtime2.initializeResizeObserverAccess)(), (0, runtime2.initializeUiDisclosure)(), (0, runtime2.initializeElementNamespaces)(), (0, runtime2.initializeMergedRefs)(), (0, runtime2.initializeDisabledReason)(), (0, runtime2.initializeTooltip)(), (0, runtime2.initializeUiDisclosure6)(), (0, runtime2.initializeInertProps)(), (0, runtime2.initializeUiTabs)(), (0, runtime2.initializeUiScrollPager)(), initializeUiTabs22(), initializeUiTabs222(), (0, runtime2.initializeNpmDependency)(), reacti6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiTabs22 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TabsList3 = reacti6.forwardRef(({ className, flush, size: size4, activateOnFocus = !0, ...props }, options) => {
        let ref = reacti6.useRef(null), value = (0, runtime2.useMergedRefs)(options, ref), value2 = (0, runtime2.useCompactable)(), pager = (0, runtime2.useScrollPager)(), { reveal, scrollerRef } = pager, frameRef = reacti6.useRef(null), value3 = useTabsOverflowMenu(ref, scrollerRef, props["aria-label"] ?? props["aria-labelledby"], value2.compact, value2.exactFit === !0), overflow = useTabsOverflow(), value4 = overflow?.setCollapsed, pagerMode = useTabsPagerMode(ref, frameRef, scrollerRef, value3, typeof className == "string" ? className : void 0, overflow?.value, reveal);
        (0, runtime2.useIsomorphicLayoutEffect)(() => (value4?.(value3), () => value4?.(!1)), [value3, value4]);
        let ref2 = reacti6.useRef(!1);
        return (0, runtime2.useIsomorphicLayoutEffect)(() => {
          !value3 && ref2.current && (ref2.current = !1, ref.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus());
        }, [value3]), jsxForUiTabs22.jsxs(jsxForUiTabs22.Fragment, {
          children: [
            jsxForUiTabs22.jsx(runtime2.ScrollPagerFrame, {
              ref: frameRef,
              pager,
              active: pagerMode !== !1,
              sparing: !0,
              size: size4,
              className: (0, runtime2.cn)(pagerMode && flush ? TAB_INACTIVE_CLASS : "", pagerMode === "row" ? "flex-1" : ""),
              children: jsxForUiTabs22.jsx(runtime2.baseTabs.List, {
                ref: value,
                activateOnFocus,
                ...props,
                ...(0, runtime2.getControlSizeAttributes)(size4),
                ...(0, runtime2.getInertProps)(value3),
                ...value3 ? {
                  [STASHED_TAB_ATTRIBUTE]: ""
                } : null,
                className: (0, runtime2.cn)(TAB_LIST_CLASS, TAB_EDGE_RADIUS_CLASS, TAB_SELECTED_CLASS, flush && !pagerMode ? TAB_INACTIVE_CLASS : "", className, pagerMode ? runtime2.PAGER_CONTENT_CLASS : "", value3 && TAB_UNDERLINE_CLASS)
              })
            }),
            value3 ? jsxForUiTabs22.jsx(TabsListMenu, {
              size: size4,
              "aria-label": props["aria-label"],
              "aria-labelledby": props["aria-labelledby"],
              listRef: ref,
              triggerHadFocusRef: ref2
            }) : null
          ]
        });
      }), TabsList3.displayName = "Tabs.List", TabsTab3 = reacti6.forwardRef(({ className, children, disabledReason, disabledReasonSide, "aria-describedby": ariaDescribedby, ...props }, options) => {
        let value = reacti6.useId(), value2 = !!props.disabled && (0, runtime2.hasDisabledReason)(disabledReason), value3 = useTabsOverflow()?.registerTab, { value: value4 } = props, ref = reacti6.useRef(null), callback = reacti6.useCallback((input) => {
          value3?.(value4, input, ref.current), ref.current = input;
        }, [value3, value4]), value5 = (0, runtime2.useMergedRefs)(options, callback), value6 = jsxForUiTabs22.jsxs(runtime2.baseTabs.Tab, {
          ref: value5,
          ...props,
          "aria-describedby": value2 ? [ariaDescribedby, value].filter(Boolean).join(" ") : ariaDescribedby,
          className: (0, runtime2.cn)(TAB_CLOSE_BUTTON_CLASS, TAB_ACTIVE_HOVER_CLASS, value2 ? TAB_CLOSE_BUTTON_HOVER_CLASS : void 0, className),
          onMouseDown: (0, runtime2.withRepeatedClickSelectionPrevention)(props.onMouseDown),
          children: [
            children,
            disabledReason !== void 0 && jsxForUiTabs22.jsx(runtime2.DisabledReasonAnnouncement, {
              id: value,
              reason: value2 ? disabledReason : void 0
            })
          ]
        });
        return disabledReason === void 0 ? value6 : jsxForUiTabs22.jsx(runtime2.Tooltip, {
          content: value2 ? disabledReason : void 0,
          side: disabledReasonSide,
          multiline: !0,
          hoverable: !1,
          closeOnClick: !1,
          openOnHandedBackFocus: !0,
          children: value6
        });
      }), TabsTab3.displayName = "Tabs.Tab", TabsPanel3 = reacti6.forwardRef(({ className, ...props }, options) => jsxForUiTabs22.jsx(runtime2.baseTabs.Panel, {
        ref: options,
        ...props,
        className: (0, runtime2.cn)("cds-reset outline-none focus-visible:outline-hidden", className)
      })), TabsPanel3.displayName = "Tabs.Panel", TabsRoot3 = reacti6.forwardRef((input, options) => {
        let { value, defaultValue: value2, onValueChange: value3 } = input, [value4, value5] = reacti6.useState(value2 === void 0 ? 0 : value2), value6 = value === void 0 ? value4 : value, callback = reacti6.useCallback((input2, options2) => {
          value3?.(input2, options2), options2.isCanceled || value5(input2);
        }, [value3]), ref = reacti6.useRef(/* @__PURE__ */ new Map()), callback2 = reacti6.useCallback((input2, options2, context) => {
          if (options2 === null) {
            ref.current.get(input2) === context && ref.current.delete(input2);
            return;
          }
          ref.current.set(input2, options2);
        }, []), callback3 = reacti6.useCallback(() => ref.current, []), callback4 = reacti6.useCallback((input2) => {
          ref.current.get(input2)?.click();
        }, []), [value7, value8] = reacti6.useState(!1), memo4 = reacti6.useMemo(() => ({
          value: value6,
          registerTab: callback2,
          tabs: callback3,
          activate: callback4,
          setCollapsed: value8
        }), [value6, callback2, callback3, callback4]), className = input.className;
        return jsxForUiTabs22.jsx(tabsOverflowContext.Provider, {
          value: memo4,
          children: jsxForUiTabs22.jsx(runtime2.baseTabs.Root, {
            ref: options,
            "data-cds": "Tabs",
            "data-collapsed": value7 ? "" : void 0,
            ...input,
            className: typeof className == "function" ? (input2) => (0, runtime2.cn)(value7 && "min-w-0 max-w-full", className(input2)) : (0, runtime2.cn)(value7 && "min-w-0 max-w-full", className),
            onValueChange: callback
          })
        });
      }), TabsRoot3.displayName = "Tabs.Root", Tabs = {
        Root: TabsRoot3,
        List: TabsList3,
        Tab: TabsTab3,
        Panel: TabsPanel3
      };
    });
  };
}
export {
  installUiTabs2
};
