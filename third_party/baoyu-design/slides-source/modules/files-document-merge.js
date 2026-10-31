// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesDocumentMerge(runtime2) {
  var FILE_MIGRATION_MARKER_FIELDS, isMergeObject, isStringArray, ownMergeProperty, cloneMergeValue;
  function deepCloneMergeValue(value, depth = 0) {
    if (depth > 200 && typeof value == "object")
      return cloneMergeValue(value);
    if (Array.isArray(value)) {
      let items = Array(value.length);
      for (let index4 = 0; index4 < value.length; index4++)
        items[index4] = value[index4] === void 0 ? null : deepCloneMergeValue(value[index4], depth + 1);
      return items;
    }
    if (isMergeObject(value)) {
      let copy = {};
      for (let key of Object.keys(value))
        value[key] !== void 0 && setMergePropertySafely(copy, key, deepCloneMergeValue(value[key], depth + 1));
      return copy;
    }
    return typeof value == "number" ? Number.isFinite(value) ? value + 0 : null : value;
  }
  var LEAF_MERGE_SCHEMA, MAX_MERGE_KEYED_LIST_ITEMS;
  function fileInputText(input) {
    if (input === null)
      return null;
    let content = typeof input == "object" && !(typeof Blob < "u" && input instanceof Blob) ? input.content : input;
    if (typeof content == "string")
      return content;
  }
  function preserveFileMigrationMarkers(index4, ...sources) {
    if (!isMergeObject(index4))
      return index4;
    let updatedIndex = index4;
    for (let value of FILE_MIGRATION_MARKER_FIELDS) {
      if (isMergeObject(updatedIndex[value]))
        continue;
      let value2 = sources.find((input) => isMergeObject(input) && isMergeObject(input[value]));
      value2 !== void 0 && (updatedIndex = {
        ...updatedIndex,
        [value]: cloneMergeValue(value2[value])
      });
    }
    return updatedIndex;
  }
  function setMergePropertySafely(object, key, value) {
    key === "__proto__" ? Object.defineProperty(object, key, {
      value,
      enumerable: !0,
      writable: !0,
      configurable: !0
    }) : object[key] = value;
  }
  function mergeValuesEqual(left, right) {
    if (left === right)
      return !0;
    if (Array.isArray(left))
      return Array.isArray(right) && left.length === right.length && left.every((input, options) => mergeValuesEqual(input, right[options]));
    if (isMergeObject(left)) {
      if (!isMergeObject(right))
        return !1;
      let value = Object.keys(left).filter((input) => left[input] !== void 0), value2 = Object.keys(right).filter((input) => right[input] !== void 0);
      return value.length === value2.length && value.every((input) => Object.hasOwn(right, input) && mergeValuesEqual(left[input], right[input]));
    }
    return !1;
  }
  function resolveChildMergeSchema(schema, key, ...values) {
    if (schema?.kind === "map") {
      let value = schema.keys !== void 0 && Object.hasOwn(schema.keys, key) ? schema.keys[key] : void 0;
      if (value)
        return value;
      if (schema.of)
        return schema.of;
    }
    let presentValues = values.filter((input) => input !== void 0);
    return presentValues.length > 0 && presentValues.every(isMergeObject) ? {
      kind: "map"
    } : presentValues.length > 0 && presentValues.every(isStringArray) ? {
      kind: "list"
    } : LEAF_MERGE_SCHEMA;
  }
  function mergeLeafValue(base, mine, theirs, path, options) {
    return mergeValuesEqual(mine, base) ? theirs : mergeValuesEqual(theirs, base) || mergeValuesEqual(mine, theirs) ? mine : (options.conflicts?.push(path), theirs);
  }
  function uniqueMergeList(items) {
    let seen = /* @__PURE__ */ new Set();
    return items.filter((input) => seen.has(input) ? !1 : (seen.add(input), !0));
  }
  function mergeOrderedStringList(base, mine, theirs, externalMembers) {
    let baseOrder = uniqueMergeList(base), mineOrder = uniqueMergeList(mine), theirOrder = uniqueMergeList(theirs), mergedOrder;
    if (mergeValuesEqual(theirOrder, baseOrder))
      mergedOrder = [...mineOrder];
    else if (mergeValuesEqual(mineOrder, baseOrder))
      mergedOrder = [...theirOrder];
    else {
      let values = new Set(baseOrder), values2 = new Set(theirOrder), values3 = new Set(mineOrder), value = mergeValuesEqual(theirOrder.filter((input) => values.has(input)), baseOrder.filter((input) => values2.has(input))), value2 = mergeValuesEqual(mineOrder.filter((input) => values.has(input)), baseOrder.filter((input) => values3.has(input))), value3 = value && !value2, [value4, value5] = value3 ? [mineOrder, theirOrder] : [theirOrder, mineOrder], values4 = new Set(value5), values5 = new Set(value4);
      mergedOrder = value4.filter((input) => !(values.has(input) && !values4.has(input))), value5.forEach((input, options) => {
        if (values.has(input) || values5.has(input))
          return;
        let value6 = (value3 || !value) && value5.slice(options + 1).every((input2) => !values.has(input2)), value7 = value6 ? mergedOrder.length : 0;
        for (let value8 = options - 1; !value6 && value8 >= 0; value8--) {
          let value9 = mergedOrder.indexOf(value5[value8]);
          if (value9 >= 0) {
            value7 = value9 + 1;
            break;
          }
        }
        mergedOrder.splice(value7, 0, input);
      });
    }
    if (externalMembers !== void 0) {
      let value = externalMembers instanceof Set ? externalMembers : new Set(externalMembers);
      mergedOrder = mergedOrder.filter((input) => value.has(input));
      let values = new Set(mergedOrder);
      for (let value2 of value)
        values.has(value2) || mergedOrder.push(value2);
    }
    return mergedOrder;
  }
  function keyedListToMergeObject(value, idKey) {
    let items = Array.isArray(value) ? value : isMergeObject(value) ? Object.keys(value).filter((input) => Object.hasOwn(value, input)).map((input) => value[input]) : [], byId = /* @__PURE__ */ Object.create(null);
    for (let value2 of items)
      isMergeObject(value2) && typeof value2[idKey] == "string" && value2[idKey] !== "" && Object.keys(byId).length < MAX_MERGE_KEYED_LIST_ITEMS && (byId[value2[idKey]] = value2);
    return byId;
  }
  function mergeObjectValues(base, mine, theirs, schema, path, options) {
    let merged = {}, keys = uniqueMergeList([...Object.keys(theirs), ...Object.keys(mine)]), deletedPaths = [];
    for (let value of keys) {
      let [items, items2, items3] = [
        ownMergeProperty(base, value),
        ownMergeProperty(mine, value),
        ownMergeProperty(theirs, value)
      ], value2 = items !== void 0, value3 = items2 !== void 0, value4 = items3 !== void 0;
      if (value2 && (!value3 || !value4))
        continue;
      if (!value3) {
        setMergePropertySafely(merged, value, deepCloneMergeValue(items3));
        continue;
      }
      if (!value4) {
        setMergePropertySafely(merged, value, deepCloneMergeValue(items2));
        continue;
      }
      let value5 = resolveChildMergeSchema(schema, value, items, items2, items3), value6 = path === "" ? value : path + "/" + value;
      if (value5.kind === "map" && value5.of?.kind === "leaf" && value5.keys === void 0 && isMergeObject(items3) && mergeValuesEqual(items2, items))
        setMergePropertySafely(merged, value, deepCloneMergeValue(items3));
      else if (value5.kind === "map" && isMergeObject(items2) && isMergeObject(items3))
        setMergePropertySafely(merged, value, mergeObjectValues(isMergeObject(items) ? items : void 0, items2, items3, value5, value6, options));
      else if (value5.kind === "records") {
        let value7 = mergeObjectValues(keyedListToMergeObject(items, value5.by), keyedListToMergeObject(items2, value5.by), keyedListToMergeObject(items3, value5.by), {
          kind: "map",
          of: LEAF_MERGE_SCHEMA
        }, value6, options);
        setMergePropertySafely(merged, value, Object.keys(value7).slice(0, MAX_MERGE_KEYED_LIST_ITEMS).map((input) => value7[input]));
      } else
        value5.kind === "list" && isStringArray(items2) && isStringArray(items3) ? (setMergePropertySafely(merged, value, mergeOrderedStringList(isStringArray(items) ? items : [], items2, items3)), deletedPaths.push({
          key: value,
          schema: value5
        })) : setMergePropertySafely(merged, value, cloneMergeValue(mergeLeafValue(items, items2, items3, value6, options)));
    }
    for (let { key: value, schema: value2 } of deletedPaths) {
      let value3 = path === "" ? value : path + "/" + value, value4 = value2.membersOf !== void 0 ? ownMergeProperty(merged, value2.membersOf) : void 0, value5 = isMergeObject(value4) ? new Set(Object.keys(value4)) : options.externalMembers?.(value3), value6 = ownMergeProperty(merged, value);
      value5 !== void 0 && setMergePropertySafely(merged, value, mergeOrderedStringList(value6, value6, value6, value5));
    }
    return merged;
  }
  function mergeDocumentValues(base, mine, theirs, schema, options = {}) {
    return schema.kind === "map" && isMergeObject(mine) && isMergeObject(theirs) ? mergeObjectValues(isMergeObject(base) ? base : void 0, mine, theirs, schema, "", options) : schema.kind === "list" && isStringArray(mine) && isStringArray(theirs) ? mergeOrderedStringList(isStringArray(base) ? base : [], mine, theirs, options.externalMembers?.("")) : cloneMergeValue(mergeLeafValue(base, mine, theirs, "", options));
  }
  return bindRuntimeValue(runtime2, "fileInputText", () => fileInputText), bindRuntimeValue(runtime2, "FILE_MIGRATION_MARKER_FIELDS", () => FILE_MIGRATION_MARKER_FIELDS, (value) => {
    FILE_MIGRATION_MARKER_FIELDS = value;
  }), bindRuntimeValue(runtime2, "preserveFileMigrationMarkers", () => preserveFileMigrationMarkers), bindRuntimeValue(runtime2, "isMergeObject", () => isMergeObject, (value) => {
    isMergeObject = value;
  }), bindRuntimeValue(runtime2, "isStringArray", () => isStringArray, (value) => {
    isStringArray = value;
  }), bindRuntimeValue(runtime2, "ownMergeProperty", () => ownMergeProperty, (value) => {
    ownMergeProperty = value;
  }), bindRuntimeValue(runtime2, "setMergePropertySafely", () => setMergePropertySafely), bindRuntimeValue(runtime2, "mergeValuesEqual", () => mergeValuesEqual), bindRuntimeValue(runtime2, "cloneMergeValue", () => cloneMergeValue, (value) => {
    cloneMergeValue = value;
  }), bindRuntimeValue(runtime2, "deepCloneMergeValue", () => deepCloneMergeValue), bindRuntimeValue(runtime2, "LEAF_MERGE_SCHEMA", () => LEAF_MERGE_SCHEMA, (value) => {
    LEAF_MERGE_SCHEMA = value;
  }), bindRuntimeValue(runtime2, "resolveChildMergeSchema", () => resolveChildMergeSchema), bindRuntimeValue(runtime2, "mergeLeafValue", () => mergeLeafValue), bindRuntimeValue(runtime2, "uniqueMergeList", () => uniqueMergeList), bindRuntimeValue(runtime2, "mergeOrderedStringList", () => mergeOrderedStringList), bindRuntimeValue(runtime2, "MAX_MERGE_KEYED_LIST_ITEMS", () => MAX_MERGE_KEYED_LIST_ITEMS, (value) => {
    MAX_MERGE_KEYED_LIST_ITEMS = value;
  }), bindRuntimeValue(runtime2, "keyedListToMergeObject", () => keyedListToMergeObject), bindRuntimeValue(runtime2, "mergeObjectValues", () => mergeObjectValues), bindRuntimeValue(runtime2, "mergeDocumentValues", () => mergeDocumentValues), () => {
    FILE_MIGRATION_MARKER_FIELDS = ["convertedFrom", "createdOnFiles"], isMergeObject = (value) => typeof value == "object" && value !== null && !Array.isArray(value), isStringArray = (value) => Array.isArray(value) && value.every((input) => typeof input == "string"), ownMergeProperty = (object, key) => object !== void 0 && Object.hasOwn(object, key) ? object[key] : void 0, cloneMergeValue = (value) => value === void 0 ? value : JSON.parse(JSON.stringify(value)), LEAF_MERGE_SCHEMA = {
      kind: "leaf"
    }, MAX_MERGE_KEYED_LIST_ITEMS = 64;
  };
}
export {
  installFilesDocumentMerge
};
