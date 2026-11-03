// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarFold(runtime2) {
  var reactToolbarFold, reactDOMToolbarFold, jsxToolbarFold, ToolbarFoldContext, FOLD_CARD_GAP, FOLD_CARD_MARGIN, foldCellHosts, FOLD_SLOT_STYLE;
  function ToolbarFoldCell({
    children
  }) {
    let fold = reactToolbarFold.useContext(ToolbarFoldContext), slotRef = reactToolbarFold.useRef(null), [host] = reactToolbarFold.useState(() => {
      let element = document.createElement("span");
      return element.style.display = "contents", element;
    });
    return reactToolbarFold.useLayoutEffect(() => {
      let slot = slotRef.current;
      if (slot !== null)
        return foldCellHosts.set(slot, host), slot.append(host), fold?.cellsChanged(), () => {
          host.remove(), fold?.cellsChanged();
        };
    }, [fold?.cellsChanged, host]), jsxToolbarFold.jsx("span", {
      ref: slotRef,
      "data-mc-slot": "",
      style: FOLD_SLOT_STYLE,
      children: reactDOMToolbarFold.createPortal(children, host)
    });
  }
  function foldCells(row) {
    return Array.from(row.querySelectorAll("[data-mc-slot]")).flatMap((slot) => {
      let host = foldCellHosts.get(slot);
      return host === void 0 ? [] : [
        {
          slot,
          host
        }
      ];
    });
  }
  function markToolbarFoldGroups(row) {
    let groupsOf = (parent) => Array.from(parent.children).flatMap((child) => !child.hasAttribute("data-mc-group") && child.querySelector("[data-mc-group]") !== null ? groupsOf(child) : [child]), groups = groupsOf(row), isDivider = (element) => element.hasAttribute("data-mc-divider"), hasContent = (element) => {
      if (element.hasAttribute("data-mc-fold-more"))
        return row.closest('[data-mc-fold="on"]') !== null;
      let slots = element.querySelectorAll("[data-mc-slot]");
      return slots.length === 0 || Array.from(slots).some((slot) => slot.childElementCount > 0);
    }, seenContent = !1, pendingDivider = null;
    for (let group of groups)
      group.setAttribute("data-mc-gone", ""), isDivider(group) ? pendingDivider ??= seenContent ? group : null : hasContent(group) && (group.removeAttribute("data-mc-gone"), pendingDivider?.removeAttribute("data-mc-gone"), pendingDivider = null, seenContent = !0);
    let shown = groups.filter((group) => !group.hasAttribute("data-mc-gone"));
    shown.forEach((group, index4) => {
      let filled = Array.from(group.querySelectorAll("[data-mc-slot]")).filter((slot) => slot.childElementCount > 0), edgeKind = (neighbour) => neighbour === void 0 ? "edge" : isDivider(neighbour) ? "divider" : "gap";
      filled.at(0)?.setAttribute("data-mc-hit-start", edgeKind(shown[index4 - 1])), filled.at(-1)?.setAttribute("data-mc-hit-end", edgeKind(shown[index4 + 1]));
    });
  }
  function layoutToolbarFold(strip, row, card) {
    let maxWidth = parseFloat(getComputedStyle(strip).maxWidth), cells = foldCells(row);
    for (let { slot, host } of cells)
      host.parentElement !== slot && slot.append(host);
    let clearHitEdges = () => {
      for (let element of Array.from(row.querySelectorAll("[data-mc-hit-start], [data-mc-hit-end]")))
        element.removeAttribute("data-mc-hit-start"), element.removeAttribute("data-mc-hit-end");
    };
    clearHitEdges();
    for (let element of Array.from(row.querySelectorAll("[data-mc-gone]")))
      element.removeAttribute("data-mc-gone");
    strip.setAttribute("data-mc-fold", "off"), strip.setAttribute("data-mc-fold-measuring", "");
    let width = () => strip.getBoundingClientRect().width;
    if (!(maxWidth > 0) || width() <= maxWidth || width() === 0)
      return markToolbarFoldGroups(row), strip.removeAttribute("data-mc-fold-measuring"), !1;
    strip.setAttribute("data-mc-fold", "on");
    let moreCell = cells.find(({ host }) => host.querySelector("[data-mc-more]") !== null);
    moreCell !== void 0 && card.append(moreCell.host), clearHitEdges(), markToolbarFoldGroups(row);
    for (let index4 = cells.length - 1; index4 >= 0 && width() > maxWidth; index4--) {
      let { slot, host } = cells[index4];
      host === moreCell?.host || slot.closest("[data-mc-tail]") !== null || host.querySelector("[data-mc-keep]") !== null || (card.prepend(host), clearHitEdges(), markToolbarFoldGroups(row));
    }
    return strip.removeAttribute("data-mc-fold-measuring"), card.childElementCount > 0 ? !0 : (strip.setAttribute("data-mc-fold", "off"), clearHitEdges(), markToolbarFoldGroups(row), !1);
  }
  function placeToolbarFoldCard(strip, card, side2, band) {
    let stripBox = strip.getBoundingClientRect(), cardBox = card.getBoundingClientRect(), needed = cardBox.height + FOLD_CARD_GAP + FOLD_CARD_MARGIN, room = {
      above: stripBox.top - Math.max(band?.top ?? 0, parseFloat(getComputedStyle(strip).getPropertyValue("--tb-overlay-h")) || 0),
      below: (band?.bottom ?? window.innerHeight) - stripBox.bottom
    }, other = side2 === "above" ? "below" : "above";
    card.setAttribute("data-mc-fold-side", room[side2] >= needed || room[side2] >= room[other] ? side2 : other), card.style.right = cardBox.width > stripBox.right - FOLD_CARD_MARGIN ? String(stripBox.right - FOLD_CARD_MARGIN - cardBox.width) + "px" : "";
  }
  function whenToolbarFoldIdle(strip, card, callback) {
    let isFoldFocus = (element) => element !== null && strip.contains(element) && (card.contains(element) ? !card.hidden : element.closest("[data-mc-slot], [data-mc-fold-more]") !== null), busy = () => (0, runtime2.hasOpenOverlay)() || isFoldFocus(document.activeElement);
    if (!busy())
      return callback(), () => {
      };
    let timer = setInterval(() => {
      busy() || (clearInterval(timer), callback());
    }, 200);
    return () => clearInterval(timer);
  }
  return bindRuntimeValue(runtime2, "reactToolbarFold", () => reactToolbarFold, (value) => {
    reactToolbarFold = value;
  }), bindRuntimeValue(runtime2, "reactDOMToolbarFold", () => reactDOMToolbarFold, (value) => {
    reactDOMToolbarFold = value;
  }), bindRuntimeValue(runtime2, "jsxToolbarFold", () => jsxToolbarFold, (value) => {
    jsxToolbarFold = value;
  }), bindRuntimeValue(runtime2, "ToolbarFoldContext", () => ToolbarFoldContext, (value) => {
    ToolbarFoldContext = value;
  }), bindRuntimeValue(runtime2, "FOLD_CARD_GAP", () => FOLD_CARD_GAP, (value) => {
    FOLD_CARD_GAP = value;
  }), bindRuntimeValue(runtime2, "FOLD_CARD_MARGIN", () => FOLD_CARD_MARGIN, (value) => {
    FOLD_CARD_MARGIN = value;
  }), bindRuntimeValue(runtime2, "foldCellHosts", () => foldCellHosts, (value) => {
    foldCellHosts = value;
  }), bindRuntimeValue(runtime2, "FOLD_SLOT_STYLE", () => FOLD_SLOT_STYLE, (value) => {
    FOLD_SLOT_STYLE = value;
  }), bindRuntimeValue(runtime2, "ToolbarFoldCell", () => ToolbarFoldCell), bindRuntimeValue(runtime2, "foldCells", () => foldCells), bindRuntimeValue(runtime2, "markToolbarFoldGroups", () => markToolbarFoldGroups), bindRuntimeValue(runtime2, "layoutToolbarFold", () => layoutToolbarFold), bindRuntimeValue(runtime2, "placeToolbarFoldCard", () => placeToolbarFoldCard), bindRuntimeValue(runtime2, "whenToolbarFoldIdle", () => whenToolbarFoldIdle), () => {
    reactToolbarFold = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMToolbarFold = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), jsxToolbarFold = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ToolbarFoldContext = reactToolbarFold.createContext(null), FOLD_CARD_GAP = 8, FOLD_CARD_MARGIN = 8, foldCellHosts = /* @__PURE__ */ new WeakMap(), FOLD_SLOT_STYLE = {
      display: "contents"
    };
  };
}
export {
  installUiToolbarFold
};
