// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideSelection(runtime2) {
  var ReactSlideSelection, PLAIN_SELECTION_MODIFIERS, EMPTY_SLIDE_SELECTION, singleSlideSelection;
  function hasToggleModifier(modifiers) {
    return modifiers.metaKey || modifiers.ctrlKey || modifiers.altKey;
  }
  function slideSelectionRange(order, from, to) {
    let fromIndex = order.indexOf(from), toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0)
      return [to];
    let range = order.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
    return fromIndex <= toIndex ? range : range.reverse();
  }
  function nextSlideSelection(state, order, id, modifiers) {
    let without = () => {
      let selected = state.selected.filter((other) => other !== id), at = order.indexOf(id), nearest = selected.reduce((best, other) => best === null || Math.abs(order.indexOf(other) - at) < Math.abs(order.indexOf(best) - at) ? other : best, null);
      return {
        selected,
        anchor: state.anchor === id ? nearest ?? state.anchor : state.anchor,
        focus: state.focus === id ? selected.at(-1) ?? state.focus : state.focus
      };
    };
    return modifiers.shiftKey && state.selected.length > 1 && state.selected.includes(id) ? without() : modifiers.shiftKey && state.anchor !== null && order.includes(state.anchor) ? {
      selected: slideSelectionRange(order, state.anchor, id),
      anchor: state.anchor,
      focus: id
    } : hasToggleModifier(modifiers) ? state.selected.includes(id) ? without() : {
      selected: [...state.selected, id],
      anchor: id,
      focus: id
    } : singleSlideSelection(id);
  }
  function slidesInSweep(spans, from, to) {
    let low = Math.min(from, to), high = Math.max(from, to);
    return spans.filter((span) => low <= span.end && span.start <= high).map((span) => span.id);
  }
  function mergeSweptSelection(previous, swept, additive) {
    return additive ? [...previous, ...swept.filter((id) => !previous.includes(id))] : [...swept];
  }
  function extendSlideSelection(state, order, id) {
    let anchor = state.anchor !== null && order.includes(state.anchor) ? state.anchor : id;
    return {
      selected: slideSelectionRange(order, anchor, id),
      anchor,
      focus: id
    };
  }
  function pruneSlideSelection(state, order) {
    let present = new Set(order), selected = state.selected.filter((id) => present.has(id)), anchor = state.anchor !== null && present.has(state.anchor) ? state.anchor : selected.at(-1) ?? null, focus = state.focus !== null && present.has(state.focus) ? state.focus : anchor;
    return selected.length === state.selected.length && anchor === state.anchor && focus === state.focus ? state : {
      selected,
      anchor,
      focus
    };
  }
  function resolveSlideSelectionClick(state, order, id, modifiers, currentId) {
    let next = nextSlideSelection(state, order, id, modifiers);
    if (state.selected.includes(id) && !next.selected.includes(id)) {
      let last = next.selected.at(-1);
      return id === currentId && last !== void 0 ? {
        state: {
          ...next,
          anchor: last,
          focus: last
        },
        kind: "toggle",
        primary: last
      } : {
        state: next,
        kind: "toggle"
      };
    }
    if (modifiers.shiftKey && state.anchor !== null && order.includes(state.anchor))
      return {
        state: next,
        kind: "range"
      };
    let kind = hasToggleModifier(modifiers) ? "toggle" : "only";
    return id === currentId ? {
      state: next,
      kind
    } : {
      state: next,
      kind,
      primary: id
    };
  }
  function syncSlideSelection(state, order, currentId, stageMoved) {
    let pruned = pruneSlideSelection(state, order);
    return currentId === null || !order.includes(currentId) ? pruned : pruned.selected.includes(currentId) ? stageMoved && (pruned.anchor !== currentId || pruned.focus !== currentId) ? {
      ...pruned,
      anchor: currentId,
      focus: currentId
    } : pruned : singleSlideSelection(currentId);
  }
  function useSlideSelection({ order, currentId, onSelect }) {
    let [held, setHeld] = ReactSlideSelection.useState(() => ({
      s: currentId === null ? EMPTY_SLIDE_SELECTION : singleSlideSelection(currentId),
      stage: currentId
    })), state = ReactSlideSelection.useMemo(() => syncSlideSelection(held.s, order, currentId, held.stage !== currentId), [held, order, currentId]);
    (state !== held.s || held.stage !== currentId) && setHeld({
      s: state,
      stage: currentId
    });
    let latest = ReactSlideSelection.useRef({
      s: state,
      order,
      currentId,
      onSelect
    });
    latest.current = {
      s: state,
      order,
      currentId,
      onSelect
    };
    let commit = ReactSlideSelection.useCallback((next, primary) => {
      setHeld((previous) => ({
        s: next,
        stage: primary ?? previous.stage
      })), primary !== void 0 && primary !== latest.current.currentId && latest.current.onSelect(primary);
    }, []), selectedSet = ReactSlideSelection.useMemo(() => new Set(state.selected), [state.selected]), has = ReactSlideSelection.useCallback((id) => selectedSet.has(id), [selectedSet]), click = ReactSlideSelection.useCallback((id, modifiers) => {
      let now = latest.current, result = resolveSlideSelectionClick(now.s, now.order, id, modifiers, now.currentId);
      result.state.selected.length !== 0 && commit(result.state, result.primary ?? (result.kind === "range" ? id : void 0));
    }, [commit]), extend = ReactSlideSelection.useCallback((id) => commit(extendSlideSelection(latest.current.s, latest.current.order, id), id), [commit]), all = ReactSlideSelection.useCallback(() => {
      let now = latest.current;
      now.order.length > 0 && commit({
        selected: [...now.order],
        anchor: now.s.anchor ?? now.order[0] ?? null,
        focus: now.s.focus
      });
    }, [commit]), promote = ReactSlideSelection.useCallback((id) => {
      latest.current.s.selected.includes(id) && commit({
        ...latest.current.s,
        anchor: id,
        focus: id
      }, id);
    }, [commit]), collapse = ReactSlideSelection.useCallback(() => {
      let id = latest.current.currentId;
      id !== null && commit(singleSlideSelection(id));
    }, [commit]), set = ReactSlideSelection.useCallback((ids) => {
      let last = ids.at(-1);
      last !== void 0 && commit({
        selected: [...ids],
        anchor: last,
        focus: last
      });
    }, [commit]), take = ReactSlideSelection.useCallback((ids, anchor, focus) => {
      ids.includes(anchor) && ids.includes(focus) && commit({
        selected: [...ids.filter((id) => id !== focus), focus],
        anchor,
        focus
      }, focus);
    }, [commit]);
    return {
      ...state,
      has,
      click,
      extend,
      all,
      promote,
      collapse,
      set,
      take
    };
  }
  return bindRuntimeValue(runtime2, "PLAIN_SELECTION_MODIFIERS", () => PLAIN_SELECTION_MODIFIERS, (value) => {
    PLAIN_SELECTION_MODIFIERS = value;
  }), bindRuntimeValue(runtime2, "hasToggleModifier", () => hasToggleModifier), bindRuntimeValue(runtime2, "slideSelectionRange", () => slideSelectionRange), bindRuntimeValue(runtime2, "slidesInSweep", () => slidesInSweep), bindRuntimeValue(runtime2, "mergeSweptSelection", () => mergeSweptSelection), bindRuntimeValue(runtime2, "resolveSlideSelectionClick", () => resolveSlideSelectionClick), bindRuntimeValue(runtime2, "useSlideSelection", () => useSlideSelection), () => {
    ReactSlideSelection = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PLAIN_SELECTION_MODIFIERS = {
      shiftKey: !1,
      metaKey: !1,
      ctrlKey: !1,
      altKey: !1
    }, EMPTY_SLIDE_SELECTION = {
      selected: [],
      anchor: null,
      focus: null
    }, singleSlideSelection = (id) => ({
      selected: [id],
      anchor: id,
      focus: id
    });
  };
}
export {
  installEditorSlideSelection
};
