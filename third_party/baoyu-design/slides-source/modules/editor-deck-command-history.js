// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorDeckCommandHistory(runtime2) {
  function createDeckCommandHistory(store, readSlides, onFeedback, options = {}) {
    let callback = (input, options2) => {
      try {
        onFeedback?.(input, options2);
      } catch {
      }
    }, callback2 = () => {
      try {
        return options.tokens?.();
      } catch {
        return;
      }
    };
    function value(input, options2) {
      let flag = !1, flag2 = !1, index4 = 0, entries = /* @__PURE__ */ new Map(), value2 = null, state = {
        label: input.label
      }, callback3 = () => {
        let value3 = callback2();
        if (flag = !0, value2 = null, value3 === void 0)
          return void (state = {
            label: input.label
          });
        let value4 = value3.takeTouched(), value5 = value4.paths.flatMap((input2) => (0, runtime2.slideIdFromFilePath)(input2) ?? []), value6 = value4.structural ? [] : value5.filter((input2) => entries.has(input2) && value3.slideRev(input2) !== entries.get(input2) && value3.clashLocal(input2));
        for (let value7 of value5)
          entries.set(value7, value3.slideRev(value7));
        flag2 = flag2 || value4.structural, index4 = value3.structureRev(), state = {
          label: input.label,
          paths: value4.paths,
          index: value4.index,
          structural: value4.structural,
          ...value6.length > 0 ? {
            parked: value6
          } : {}
        };
      }, callback4 = (input2) => {
        let value3 = callback2();
        if (value3 === void 0 || !flag || !flag2)
          return !0;
        let value4 = [...entries].filter(([input3, input4]) => value3.slideRev(input3) !== input4).map(([input3]) => input3), value5 = value3.structureRev();
        if (value5 === index4 && value4.length === 0)
          return !0;
        let value6 = String(value5) + "|" + value4.map((input3) => input3 + ":" + String(value3.slideRev(input3))).join(",");
        if (value2 === value6)
          return !0;
        value2 = value6;
        let value7 = (value5 !== index4 ? "the slide list changed remotely (structure rev " + String(index4) + " → " + String(value5) + ")" : "") + (value4.length > 0 ? (value5 !== index4 ? "; " : "") + "slides changed remotely: " + value4.join(", ") : "");
        return callback("declined", {
          label: input.label,
          declined: input2 + " would run over " + value7
        }), options.tell?.((0, runtime2.conflictingUndoMessage)(input2)), !1;
      }, state2 = {
        ...input.label !== void 0 ? {
          label: input.label
        } : {},
        canDo: () => input.canDo?.() !== !1 && callback4("redo"),
        canUndo: () => input.canUndo?.() !== !1 && callback4("undo"),
        do() {
          callback2()?.takeTouched(), input.do(), callback3();
        },
        undo() {
          callback2()?.takeTouched(), input.undo(), callback3();
        }
      };
      return options2 && callback3(), {
        cmd: state2,
        last: () => state,
        didRun: () => flag
      };
    }
    let items = [], items2 = [];
    return {
      exec(input) {
        let value2 = value(input, !1);
        store.exec(value2.cmd), value2.didRun() && (items.push(value2), items2.length = 0, callback("do", value2.last()));
      },
      seed(input) {
        let value2 = value(input, !0);
        store.seed(value2.cmd), items.push(value2), items2.length = 0;
      },
      undo() {
        let value2 = store.redoDepth();
        if (store.undo(), store.redoDepth() === value2)
          return;
        let value3 = items.pop();
        value3 !== void 0 && items2.push(value3), readSlides("undo"), callback("undo", value3?.last() ?? {
          label: void 0
        });
      },
      redo() {
        let value2 = store.redoDepth();
        if (store.redo(), store.redoDepth() === value2)
          return;
        let value3 = items2.pop();
        value3 !== void 0 && items.push(value3), readSlides("redo"), callback("redo", value3?.last() ?? {
          label: void 0
        });
      },
      canUndo: () => store.canUndo(),
      canRedo: () => store.canRedo(),
      redoDepth: () => store.redoDepth(),
      clear() {
        store.clear(), items.length = 0, items2.length = 0;
      },
      subscribe: (input) => store.subscribe(input)
    };
  }
  return bindRuntimeValue(runtime2, "createDeckCommandHistory", () => createDeckCommandHistory), () => {
  };
}
export {
  installEditorDeckCommandHistory
};
