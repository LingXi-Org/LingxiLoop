// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelSections(runtime2) {
  var sectionIdPattern, isEmptySection, sectionHasDescription, sectionDescriptionFields, normalizeSectionDescription, emptySectionHasNoDescription, sectionDiffFields, initializeSections;
  function normalizeSections(sections) {
    if (typeof sections != "object" || sections === null)
      return;
    let entries = Array.isArray(sections) ? sections.slice(0, 4 * runtime2.maxDeckSections).map((input) => [
      typeof input == "object" && input !== null ? input.id : void 0,
      input
    ]) : Object.entries(sections), sections2 = [], seenIds = /* @__PURE__ */ new Set();
    for (let [value, value2] of entries) {
      if (sections2.length >= runtime2.maxDeckSections)
        break;
      if (typeof value2 != "object" || value2 === null || Array.isArray(value2) || typeof value != "string" || !sectionIdPattern.test(value) || /^__.*__$/.test(value) || seenIds.has(value))
        continue;
      seenIds.add(value);
      let value3 = value2, value4 = normalizeSectionDescription(value3.title, runtime2.maxSectionDescriptionLength), state = {
        id: value,
        ...value4 !== "" ? {
          title: value4
        } : {},
        description: normalizeSectionDescription(value3.description, runtime2.maxSectionDescriptionLength) || value4
      };
      if (value3.start !== void 0 && value3.start !== null) {
        typeof value3.start == "string" && sectionIdPattern.test(value3.start) && sections2.push({
          ...state,
          start: value3.start
        });
        continue;
      }
      if (value3.before !== null && value3.before !== void 0 && typeof value3.before != "string")
        continue;
      let value5 = typeof value3.seq == "number" && Number.isFinite(value3.seq) ? {
        seq: value3.seq
      } : {};
      sections2.push({
        ...state,
        before: typeof value3.before == "string" && sectionIdPattern.test(value3.before) ? value3.before : null,
        ...value5
      });
    }
    return sections2;
  }
  function anchoredSectionsInOrder(sections, slideOrder) {
    if (sections === void 0)
      return [];
    let orderIndices = new Map(slideOrder.map((input, options) => [input, options])), seenStarts = /* @__PURE__ */ new Set();
    return sections.filter((input) => input.start !== void 0 && orderIndices.has(input.start) && !seenStarts.has(input.start) && (seenStarts.add(input.start), !0)).sort((input, options) => orderIndices.get(input.start) - orderIndices.get(options.start));
  }
  function sectionGroups(sections, slideOrder) {
    let anchoredSections = anchoredSectionsInOrder(sections, slideOrder), sectionsByStart = new Map(anchoredSections.map((input) => [
      input.start,
      input
    ])), groups = [];
    for (let value3 of slideOrder) {
      let entry = sectionsByStart.get(value3);
      (entry !== void 0 || groups.length === 0) && groups.push({
        section: entry ?? null,
        ids: []
      }), groups[groups.length - 1].ids.push(value3);
    }
    groups[0] !== void 0 && groups[0].section === null && groups[0].ids.length === 0 && groups.shift();
    let entries = /* @__PURE__ */ new Map();
    groups.forEach((input, options) => input.ids.forEach((input2) => entries.set(input2, options)));
    let value = (sections ?? []).filter(isEmptySection), callback = (input) => typeof input.before == "string" && entries.has(input.before) ? entries.get(input.before) : groups.length, entries2 = /* @__PURE__ */ new Map();
    for (let value3 of value)
      entries2.set(callback(value3), [
        ...entries2.get(callback(value3)) ?? [],
        value3
      ]);
    let items = [];
    for (let index4 = 0; index4 <= groups.length; index4++) {
      for (let value3 of (entries2.get(index4) ?? []).sort((input, options) => (input.seq ?? 0) - (options.seq ?? 0) || (input.id < options.id ? -1 : 1)))
        items.push({
          section: value3,
          ids: []
        });
      index4 < groups.length && items.push(groups[index4]);
    }
    let value2 = items.findIndex((input) => input.section === null);
    return value2 > 0 && items[value2 - 1].ids.length === 0 && items.splice(value2 - 1, 2, {
      section: items[value2 - 1].section,
      ids: items[value2].ids
    }), items;
  }
  function reconcileSectionsWithSlideOrder(sections, slideOrder) {
    if (sections === void 0)
      return;
    let value = sections, values = /* @__PURE__ */ new Set();
    if (value.some((input) => input.start !== void 0 && (values.has(input.start) || (values.add(input.start), !1)))) {
      let values2 = /* @__PURE__ */ new Set();
      value = value.flatMap((input) => input.start === void 0 || !values2.has(input.start) ? (input.start !== void 0 && values2.add(input.start), [input]) : sectionHasDescription(input) ? [
        {
          id: input.id,
          ...sectionDescriptionFields(input),
          before: input.start,
          seq: input.seq ?? 0
        }
      ] : []);
    }
    let value2 = sectionGroups(value, slideOrder).find((input) => input.section !== null && isEmptySection(input.section) && input.ids.length > 0);
    if (value2 === void 0)
      return value;
    let section = value2.section;
    return value.map((input) => input.id === section.id ? {
      id: input.id,
      ...sectionDescriptionFields(input),
      start: value2.ids[0]
    } : input);
  }
  function normalizeEmptySectionDescriptions(deck, preferredSectionIds = []) {
    let sections = deck.sections;
    if (sections === void 0)
      return deck;
    let emptySectionIds = sectionGroups(sections, deck.order).flatMap((input) => input.section !== null && input.ids.length === 0 && emptySectionHasNoDescription(input.section) ? [input.section.id] : []);
    if (emptySectionIds.length <= 1)
      return deck;
    let keptSectionId = preferredSectionIds.find((input) => emptySectionIds.includes(input)) ?? emptySectionIds[0];
    return {
      ...deck,
      sections: sections.filter((input) => input.id === keptSectionId || !emptySectionIds.includes(input.id))
    };
  }
  function removeSlideFromSections(sections, slideOrder, slideId) {
    if (sections === void 0)
      return;
    let slideIndex = slideOrder.indexOf(slideId), nextSlideId = slideIndex >= 0 ? slideOrder[slideIndex + 1] : void 0, replacementBeforeId = (sectionGroups(sections, slideOrder).find((input) => input.ids.includes(slideId))?.ids.filter((input) => input !== slideId) ?? [])[0] ?? nextSlideId ?? null, reanchorEmptySection = (input) => isEmptySection(input) && input.before === slideId ? {
      ...input,
      before: replacementBeforeId
    } : input, startingSection = sections.find((input) => input.start === slideId);
    if (startingSection === void 0)
      return sections.some((input) => input.before === slideId) ? sections.map(reanchorEmptySection) : sections;
    let sectionStarts = new Set(anchoredSectionsInOrder(sections, slideOrder).map((input) => input.start)), canExtendSection = nextSlideId !== void 0 && !sectionStarts.has(nextSlideId), result = [];
    for (let value of sections)
      if (value.start !== slideId)
        result.push(reanchorEmptySection(value));
      else {
        if (!(value === startingSection && canExtendSection) && !sectionHasDescription(value))
          continue;
        {
          let { start: value2, ...value3 } = value;
          result.push(value === startingSection && canExtendSection ? {
            ...value3,
            start: nextSlideId
          } : {
            ...value3,
            before: nextSlideId ?? null,
            seq: 0
          });
        }
      }
    return preserveEmptySectionOrder(result, sections, slideOrder, slideOrder.filter((input) => input !== slideId));
  }
  function preserveEmptySectionOrder(sections, previousSections, previousOrder, slideOrder) {
    let previousGroupIndices = new Map(sectionGroups(previousSections, previousOrder).flatMap((input, options) => input.section !== null ? [[input.section.id, options]] : [])), groups = sectionGroups(sections, slideOrder), result = sections;
    for (let index4 = 0; index4 < groups.length; ) {
      let value = index4;
      for (; value < groups.length && groups[value].section !== null && groups[value].ids.length === 0 && isEmptySection(groups[value].section); )
        value++;
      let value2 = groups.slice(index4, value).map((input) => input.section);
      if (index4 = Math.max(value, index4 + 1), value2.length < 2)
        continue;
      let value3 = [...value2].sort((input, options) => (previousGroupIndices.get(input.id) ?? 1 / 0) - (previousGroupIndices.get(options.id) ?? 1 / 0));
      if (value3.every((input, options) => input.id === value2[options].id))
        continue;
      let value4 = value2.map((input) => input.seq ?? 0).sort((input, options) => input - options);
      for (let count = 1; count < value4.length; count++)
        value4[count] <= value4[count - 1] && (value4[count] = value4[count - 1] + 1);
      let entries = new Map(value3.map((input, options) => [
        input.id,
        value4[options]
      ]));
      result = result.map((input) => entries.has(input.id) ? {
        ...input,
        seq: entries.get(input.id)
      } : input);
    }
    return result;
  }
  function sectionsEqual(sections, otherSections) {
    return JSON.stringify(sections ?? null) === JSON.stringify(otherSections ?? null);
  }
  function firstSlideAfterSectionGroup(groups, groupIndex) {
    for (let value = groupIndex + 1; value < groups.length; value++)
      if (groups[value].ids.length > 0)
        return groups[value].ids[0];
    return null;
  }
  function precedingEmptySectionIds(groups, groupIndex) {
    let items = [];
    for (let value = groupIndex - 1; value >= 0 && groups[value].section !== null && groups[value].ids.length === 0; value--)
      items.push(groups[value].section.id);
    return items;
  }
  function emptySectionRunIds(sections, groups, groupIndex, sectionId) {
    let beforeIds = precedingEmptySectionIds(groups, groupIndex).reverse(), afterIds = [];
    for (let value = groupIndex; value < groups.length && groups[value].section !== null && groups[value].ids.length === 0; value++)
      groups[value].section.id !== sectionId && afterIds.push(groups[value].section.id);
    if (beforeIds.length === 0 && afterIds.length === 0)
      return sections;
    let sequenceBase = Date.now(), sequencesById = new Map([
      ...beforeIds.filter((input) => input !== sectionId),
      sectionId,
      ...afterIds
    ].map((input, options) => [
      input,
      sequenceBase + options
    ]));
    return sections.map((input) => sequencesById.has(input.id) && isEmptySection(input) ? {
      ...input,
      seq: sequencesById.get(input.id)
    } : input);
  }
  function addSectionAtSlide(deck, slideId, description = "", sectionId = (0, runtime2.createModelId)()) {
    let sections = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [], anchoredSections = anchoredSectionsInOrder(sections, deck.order);
    if (!(!deck.order.includes(slideId) || anchoredSections.some((input) => input.start === slideId) || sections.some((input) => input.id === sectionId) || sections.length >= runtime2.maxDeckSections))
      return {
        ...deck,
        sections: [
          ...sections,
          {
            id: sectionId,
            description: (0, runtime2.normalizeDescription)(description, runtime2.maxSectionDescriptionLength),
            start: slideId
          }
        ]
      };
  }
  function addEmptySectionBeforeSlide(deck, beforeSlideId, sectionId = (0, runtime2.createModelId)()) {
    let value = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [];
    if (value.some((input) => input.id === sectionId) || value.length >= runtime2.maxDeckSections)
      return;
    let value2 = deck.order[0] !== void 0 && beforeSlideId === deck.order[0] && !anchoredSectionsInOrder(value, deck.order).some((input) => input.start === beforeSlideId);
    return {
      ...deck,
      sections: [
        ...value,
        value2 ? {
          id: sectionId,
          description: "",
          start: beforeSlideId
        } : {
          id: sectionId,
          description: "",
          before: beforeSlideId,
          seq: Date.now()
        }
      ]
    };
  }
  function addSectionAtGap(deck, gapIndex, sectionId = (0, runtime2.createModelId)()) {
    deck = {
      ...deck,
      sections: reconcileSectionsWithSlideOrder(deck.sections, deck.order)
    };
    let value = sectionGroups(deck.sections, deck.order);
    if (gapIndex < 0 || gapIndex > value.length)
      return;
    let value2 = addEmptySectionBeforeSlide(deck, firstSlideAfterSectionGroup(value, gapIndex - 1), sectionId);
    if (value2 !== void 0)
      return {
        ...value2,
        sections: emptySectionRunIds(value2.sections, value, gapIndex, sectionId)
      };
  }
  function appendEmptySection(deck, sectionId = (0, runtime2.createModelId)()) {
    return deck = {
      ...deck,
      sections: reconcileSectionsWithSlideOrder(deck.sections, deck.order)
    }, addSectionAtGap(deck, sectionGroups(deck.sections, deck.order).length, sectionId);
  }
  function moveSlidesIntoNewSection(deck, selectedSlideIds, gapIndex, sectionId = (0, runtime2.createModelId)(), splitSectionId = (0, runtime2.createModelId)()) {
    let values = new Set(selectedSlideIds), value = deck.order.filter((input) => values.has(input)), value2 = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [];
    if (value.length === 0 || value.length !== values.size || value2.some((input) => input.id === sectionId) || value2.length >= runtime2.maxDeckSections)
      return;
    let value3 = sectionGroups(value2, deck.order);
    if (gapIndex < 0 || gapIndex > value3.length)
      return;
    let value4 = firstSlideAfterSectionGroup(value3, gapIndex - 1);
    for (; value4 !== null && values.has(value4); )
      value4 = deck.order[deck.order.indexOf(value4) + 1] ?? null;
    let value5 = value2, value6 = gapIndex === 0 && value3[0] !== void 0 && value3[0].section === null ? value3[0].ids.find((input) => !values.has(input)) : void 0;
    if (value6 !== void 0) {
      if (value2.length + 1 >= runtime2.maxDeckSections || value2.some((input) => input.id === splitSectionId))
        return;
      value5 = [
        ...value2,
        {
          id: splitSectionId,
          description: "",
          start: value6
        }
      ];
    }
    let { order: value7, sections: value8 } = detachSlidesForSectionMove(deck, value5, value, value4), values2 = new Set(precedingEmptySectionIds(value3, gapIndex)), items = [
      ...value8.map((input) => values2.has(input.id) ? {
        ...input,
        before: value[0]
      } : input),
      {
        id: sectionId,
        description: "",
        start: value[0]
      }
    ];
    return {
      ...deck,
      order: value7,
      sections: reconcileSectionsWithSlideOrder(items, value7)
    };
  }
  function createSectionFromSlides(deck, selectedSlideIds, sectionId = (0, runtime2.createModelId)()) {
    let values = new Set(selectedSlideIds), value = deck.order.filter((input) => values.has(input)), value2 = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [];
    if (value.length === 0 || value.length !== values.size || value2.some((input) => input.id === sectionId))
      return;
    let value3 = sectionGroups(value2, deck.order), value4 = value3.findIndex((input) => input.ids.includes(value[0])), ids = value3[value4].ids, value5 = ids.indexOf(value[0]);
    if (value5 === 0 && value.length === ids.length && ids.every((input) => values.has(input)))
      return;
    let value6 = ids.slice(value5 + 1).filter((input) => !values.has(input)), value7 = value6.length > 0 && !(value5 === 0 && value3[value4].section !== null) ? value6[0] : void 0;
    if (value2.length + (value7 !== void 0 ? 2 : 1) > runtime2.maxDeckSections)
      return;
    let value8 = value6[0] ?? firstSlideAfterSectionGroup(value3, value4);
    for (; value8 !== null && values.has(value8); )
      value8 = deck.order[deck.order.indexOf(value8) + 1] ?? null;
    let { order: value9, sections: value10 } = detachSlidesForSectionMove(deck, value2, value, value8), values2 = new Set(value5 === 0 ? precedingEmptySectionIds(value3, value4) : []), items = [
      ...value10.map((input) => values2.has(input.id) ? {
        ...input,
        before: value[0]
      } : input),
      {
        id: sectionId,
        description: "",
        start: value[0]
      },
      ...value7 !== void 0 ? [
        {
          id: (0, runtime2.createModelId)(),
          description: "",
          start: value7
        }
      ] : []
    ];
    return {
      ...deck,
      order: value9,
      sections: reconcileSectionsWithSlideOrder(items, value9)
    };
  }
  function detachSlidesForSectionMove(deck, sections, slideIds, beforeSlideId) {
    let value = sections, order = deck.order;
    for (let value5 of slideIds)
      value = removeSlideFromSections(value, order, value5), order = order.filter((input) => input !== value5);
    let value2 = order, value3 = beforeSlideId === null ? value2.length : value2.indexOf(beforeSlideId), value4 = value3 < 0 ? value2.length : value3;
    return {
      order: [...value2.slice(0, value4), ...slideIds, ...value2.slice(value4)],
      sections: value ?? []
    };
  }
  function moveSlidesToSection(deck, selectedSlideIds, sectionId, beforeSlideId) {
    let values = new Set(selectedSlideIds), value = deck.order.filter((input) => values.has(input));
    if (value.length === 0 || value.length !== values.size)
      return;
    let value2 = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [], value3 = detachSlidesForSectionMove(deck, value2, value, null), value4 = value3.order.slice(0, value3.order.length - value.length), sections = value3.sections, value5 = sectionId === null ? void 0 : value2.find((input) => input.id === sectionId);
    if (value5 !== void 0 && !sections.some((input) => input.id === sectionId)) {
      let value12 = sectionGroups(value2, deck.order), value13 = firstSlideAfterSectionGroup(value12, value12.findIndex((input) => input.section?.id === sectionId));
      for (; value13 !== null && values.has(value13); )
        value13 = deck.order[deck.order.indexOf(value13) + 1] ?? null;
      sections = preserveEmptySectionOrder([
        ...sections,
        {
          id: value5.id,
          ...sectionDescriptionFields(value5),
          before: value13,
          seq: Date.now()
        }
      ], value2, deck.order, value4);
    }
    let value6 = sectionGroups(sections, value4), value7 = sectionId === null ? value6.findIndex((input) => input.section === null) : value6.findIndex((input) => input.section?.id === sectionId);
    if (value7 < 0 && sectionId !== null)
      return;
    let value8 = value7 < 0 ? [] : value6[value7].ids, value9 = Math.max(0, Math.min(value8.length, beforeSlideId)), value10 = value9 < value8.length ? value8[value9] : value7 < 0 ? value4[0] ?? null : firstSlideAfterSectionGroup(value6, value7), value11 = value10 === null ? value4.length : value4.indexOf(value10), items = [
      ...value4.slice(0, value11),
      ...value,
      ...value4.slice(value11)
    ];
    if (sectionId !== null && value9 === 0) {
      let values2 = new Set(value8.length === 0 ? precedingEmptySectionIds(value6, value7) : []);
      sections = sections.map((input) => input.id === sectionId ? {
        id: input.id,
        ...sectionDescriptionFields(input),
        start: value[0]
      } : values2.has(input.id) ? {
        ...input,
        before: value[0]
      } : input);
    }
    let state = {
      ...deck,
      order: items
    };
    if ((sections.length > 0 || deck.sections !== void 0) && (state.sections = reconcileSectionsWithSlideOrder(sections, items)), !(items.join("\0") === deck.order.join("\0") && (sectionsEqual(deck.sections, state.sections) || deckSectionLayoutsEqual(deck, state))))
      return state;
  }
  function insertSlidesAtSectionTarget(deck, slideIds, target, sectionId = (0, runtime2.createModelId)(), splitSectionId = (0, runtime2.createModelId)()) {
    let values = new Set(slideIds), state = {
      ...deck,
      order: [
        ...deck.order.filter((input) => !values.has(input)),
        ...slideIds
      ]
    };
    if ("gapIndex" in target)
      return moveSlidesIntoNewSection(state, slideIds, target.gapIndex, sectionId, splitSectionId);
    if (!(target.sectionId !== null && !sectionGroups(reconcileSectionsWithSlideOrder(deck.sections, deck.order), deck.order).some((input) => input.section?.id === target.sectionId)))
      return moveSlidesToSection(state, slideIds, target.sectionId, target.index) ?? state;
  }
  function deckSectionLayoutsEqual(deck, otherDeck) {
    let callback = (input) => sectionGroups(reconcileSectionsWithSlideOrder(input.sections, input.order), input.order).map((input2) => (input2.section?.id ?? "") + ":" + (input2.section?.description ?? "") + ":" + input2.ids.join(",")).join("|");
    return callback(deck) === callback(otherDeck);
  }
  function deleteSection(deck, sectionId) {
    let value = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [];
    if (value.some((input) => input.id === sectionId))
      return {
        ...deck,
        sections: reconcileSectionsWithSlideOrder(value.filter((input) => input.id !== sectionId), deck.order)
      };
  }
  function renameSection(deck, sectionId, description) {
    let value = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [], value2 = value.find((input) => input.id === sectionId), value3 = (0, runtime2.normalizeDescription)(description, runtime2.maxSectionDescriptionLength);
    if (value2 === void 0 || value3 === value2.description)
      return;
    let { id: value4, description: value5, title: value6, ...value7 } = value2, state = {
      id: sectionId,
      description: value3,
      ...value7
    };
    return {
      ...deck,
      sections: value.map((input) => input.id === sectionId ? state : input)
    };
  }
  function moveSectionToGap(deck, sectionId, gapIndex) {
    let value = reconcileSectionsWithSlideOrder(deck.sections, deck.order) ?? [], value2 = sectionGroups(value, deck.order), value3 = value2.findIndex((input) => input.section?.id === sectionId);
    if (value3 < 0 || gapIndex < 0 || gapIndex > value2.length || gapIndex === value3 || gapIndex === value3 + 1)
      return;
    let ids = value2[value3].ids;
    if (ids.length > 0 && gapIndex === 0 && value2[0].section === null) {
      if (value.length >= runtime2.maxDeckSections)
        return;
      value = [
        ...value,
        {
          id: (0, runtime2.createModelId)(),
          description: "",
          start: value2[0].ids[0]
        }
      ];
    }
    let value4 = firstSlideAfterSectionGroup(value2, gapIndex - 1);
    for (; value4 !== null && ids.includes(value4); )
      value4 = firstSlideAfterSectionGroup(value2, value2.findIndex((input) => input.ids.includes(value4)));
    if (ids.length === 0) {
      let value10 = value.map((input) => input.id !== sectionId ? input : {
        ...input,
        before: value4,
        seq: Date.now()
      }), value11 = reconcileSectionsWithSlideOrder(emptySectionRunIds(value10, value2, gapIndex, sectionId), deck.order);
      return sectionsEqual(value, value11) ? void 0 : {
        ...deck,
        sections: value11
      };
    }
    let value5 = deck.order.filter((input) => !ids.includes(input)), value6 = value4 === null ? value5.length : value5.indexOf(value4), items = [
      ...value5.slice(0, value6),
      ...ids,
      ...value5.slice(value6)
    ], values = new Set(precedingEmptySectionIds(value2, gapIndex)), values2 = /* @__PURE__ */ new Set();
    for (let value10 = gapIndex; value10 < value2.length && value2[value10].section !== null && value2[value10].ids.length === 0; value10++)
      values2.add(value2[value10].section.id);
    let values3 = new Set(ids), value7 = firstSlideAfterSectionGroup(value2, value3), value8 = value.map((input) => values.has(input.id) ? {
      ...input,
      before: ids[0]
    } : values2.has(input.id) && input.before === ids[0] ? {
      ...input,
      before: value4
    } : isEmptySection(input) && typeof input.before == "string" && values3.has(input.before) ? {
      ...input,
      before: value7
    } : input), value9 = reconcileSectionsWithSlideOrder(value8, items);
    if (!(items.join("\0") === deck.order.join("\0") && sectionsEqual(deck.sections, value9)))
      return sectionsEqual(deck.sections, value9) ? {
        ...deck,
        order: items
      } : {
        ...deck,
        order: items,
        sections: value9
      };
  }
  function moveSectionsToGap(deck, sectionIds, gapIndex) {
    let values = new Set(sectionIds), value = sectionGroups(reconcileSectionsWithSlideOrder(deck.sections, deck.order), deck.order), value2 = value.flatMap((input, options) => input.section !== null && values.has(input.section.id) ? [options] : []), value3 = value2.map((input) => value[input].section.id);
    if (value3.length === 0 || value2[value2.length - 1] - value2[0] === value2.length - 1 && gapIndex >= value2[0] && gapIndex <= value2[value2.length - 1] + 1)
      return;
    let value4 = deck, value5 = gapIndex;
    for (let value6 of value3)
      value4 = moveSectionToGap(value4, value6, value5) ?? value4, value5 = sectionGroups(reconcileSectionsWithSlideOrder(value4.sections, value4.order), value4.order).findIndex((input) => input.section?.id === value6) + 1;
    if (!(value4.order.join("\0") === deck.order.join("\0") && sectionsEqual(deck.sections, value4.sections)))
      return value4;
  }
  function slideMoveDestination(deck, movedIds, gapIndex) {
    let moved = new Set(movedIds), unmoved = (id) => !moved.has(id), before = deck.order.slice(0, Math.max(0, gapIndex)).reverse().find(unmoved), anchor = before ?? deck.order.find(unmoved), group = anchor === void 0 ? void 0 : sectionGroups(reconcileSectionsWithSlideOrder(deck.sections, deck.order), deck.order).find((entry) => entry.ids.includes(anchor));
    return group === void 0 ? {
      sectionId: null,
      index: 0
    } : {
      sectionId: group.section?.id ?? null,
      index: before === void 0 ? 0 : group.ids.filter(unmoved).indexOf(before) + 1
    };
  }
  function moveIdsToIndex(order, movedIds, gapIndex) {
    let moved = new Set(movedIds), rest = order.filter((id) => !moved.has(id)), at = order.slice(0, Math.max(0, gapIndex)).filter((id) => !moved.has(id)).length;
    return [
      ...rest.slice(0, at),
      ...order.filter((id) => moved.has(id)),
      ...rest.slice(at)
    ];
  }
  function diffSections(previousDeck, deck) {
    let previousSections = previousDeck.sections ?? [], sections = deck.sections ?? [], previousById = new Map(previousSections.map((input) => [
      input.id,
      input
    ])), sectionsById = new Map(sections.map((input) => [input.id, input])), changed = [];
    for (let [value, value2] of previousById) {
      let entry = sectionsById.get(value);
      if (entry === void 0)
        continue;
      let state = {}, state2 = {};
      for (let value3 of sectionDiffFields)
        value2[value3] !== entry[value3] && (state[value3] = value2[value3] ?? null, state2[value3] = entry[value3] ?? null);
      Object.keys(state2).length > 0 && changed.push({
        id: value,
        from: state,
        to: state2,
        was: value2,
        now: entry
      });
    }
    return {
      added: sections.filter((input) => !previousById.has(input.id)),
      removed: previousSections.filter((input) => !sectionsById.has(input.id)),
      changed,
      ...previousDeck.order.join("\0") !== deck.order.join("\0") ? {
        order: {
          from: [...previousDeck.order],
          to: [...deck.order]
        }
      } : {}
    };
  }
  function invertSectionsDiff(diff) {
    return {
      added: diff.removed,
      removed: diff.added,
      changed: diff.changed.map((input) => ({
        id: input.id,
        from: input.to,
        to: input.from,
        was: input.now,
        now: input.was
      })),
      ...diff.order !== void 0 ? {
        order: {
          from: diff.order.to,
          to: diff.order.from
        }
      } : {}
    };
  }
  function applySectionFields(section, patch) {
    let state = {
      ...section
    };
    for (let value of sectionDiffFields) {
      if (!(value in patch))
        continue;
      let value2 = patch[value];
      value2 === null && value !== "before" ? delete state[value] : state[value] = value2;
    }
    return "description" in patch && delete state.title, state.start !== void 0 ? (delete state.before, delete state.seq) : "before" in state || (state.before = null), state;
  }
  function applySectionsDiff(deck, diff) {
    let sections = [...deck.sections ?? []], removedIds = new Set(diff.removed.map((input) => input.id));
    sections = sections.filter((input) => !removedIds.has(input.id));
    let sectionsById = new Map(sections.map((input) => [input.id, input])), addedIds = /* @__PURE__ */ new Set();
    for (let value of diff.added)
      !sections.some((input) => input.id === value.id) && sections.length < runtime2.maxDeckSections && (sections.push({
        ...value
      }), addedIds.add(value.id));
    for (let value of diff.changed)
      addedIds.add(value.id), sections.some((input) => input.id === value.id) ? sections = sections.map((input) => input.id === value.id ? applySectionFields(input, value.to) : input) : sections.length < runtime2.maxDeckSections && sections.push({
        ...value.now
      });
    let values = new Set(deck.order);
    sections = sections.flatMap((input) => {
      if (!addedIds.has(input.id) || input.start === void 0)
        return [input];
      let value = input;
      return values.has(input.start) ? sections.some((input2) => input2.id !== input.id && input2.start === input.start && !addedIds.has(input2.id)) && (value = {
        id: input.id,
        ...sectionDescriptionFields(input),
        before: input.start,
        seq: Date.now()
      }) : value = sectionsById.get(input.id) ?? {
        id: input.id,
        ...sectionDescriptionFields(input),
        before: null,
        seq: Date.now()
      }, value !== input && isEmptySection(value) && !sectionHasDescription(value) ? [] : [value];
    });
    let order = deck.order;
    if (diff.order !== void 0) {
      let values2 = new Set(deck.order), value = diff.order.to.filter((input) => values2.has(input));
      deck.order.forEach((input, options) => {
        if (value.includes(input))
          return;
        let value2 = deck.order.slice(0, options).reverse().find((input2) => value.includes(input2));
        value.splice(value2 === void 0 ? 0 : value.indexOf(value2) + 1, 0, input);
      }), order = value;
    }
    let state = {
      ...deck,
      order
    };
    return (sections.length > 0 || deck.sections !== void 0) && (state.sections = reconcileSectionsWithSlideOrder(sections, order)), state;
  }
  return bindRuntimeValue(runtime2, "normalizeSections", () => normalizeSections), bindRuntimeValue(runtime2, "anchoredSectionsInOrder", () => anchoredSectionsInOrder), bindRuntimeValue(runtime2, "sectionGroups", () => sectionGroups), bindRuntimeValue(runtime2, "slideMoveDestination", () => slideMoveDestination), bindRuntimeValue(runtime2, "moveIdsToIndex", () => moveIdsToIndex), bindRuntimeValue(runtime2, "reconcileSectionsWithSlideOrder", () => reconcileSectionsWithSlideOrder), bindRuntimeValue(runtime2, "normalizeEmptySectionDescriptions", () => normalizeEmptySectionDescriptions), bindRuntimeValue(runtime2, "removeSlideFromSections", () => removeSlideFromSections), bindRuntimeValue(runtime2, "preserveEmptySectionOrder", () => preserveEmptySectionOrder), bindRuntimeValue(runtime2, "sectionsEqual", () => sectionsEqual), bindRuntimeValue(runtime2, "firstSlideAfterSectionGroup", () => firstSlideAfterSectionGroup), bindRuntimeValue(runtime2, "precedingEmptySectionIds", () => precedingEmptySectionIds), bindRuntimeValue(runtime2, "emptySectionRunIds", () => emptySectionRunIds), bindRuntimeValue(runtime2, "addSectionAtSlide", () => addSectionAtSlide), bindRuntimeValue(runtime2, "addEmptySectionBeforeSlide", () => addEmptySectionBeforeSlide), bindRuntimeValue(runtime2, "addSectionAtGap", () => addSectionAtGap), bindRuntimeValue(runtime2, "appendEmptySection", () => appendEmptySection), bindRuntimeValue(runtime2, "moveSlidesIntoNewSection", () => moveSlidesIntoNewSection), bindRuntimeValue(runtime2, "createSectionFromSlides", () => createSectionFromSlides), bindRuntimeValue(runtime2, "detachSlidesForSectionMove", () => detachSlidesForSectionMove), bindRuntimeValue(runtime2, "moveSlidesToSection", () => moveSlidesToSection), bindRuntimeValue(runtime2, "insertSlidesAtSectionTarget", () => insertSlidesAtSectionTarget), bindRuntimeValue(runtime2, "deckSectionLayoutsEqual", () => deckSectionLayoutsEqual), bindRuntimeValue(runtime2, "deleteSection", () => deleteSection), bindRuntimeValue(runtime2, "renameSection", () => renameSection), bindRuntimeValue(runtime2, "moveSectionToGap", () => moveSectionToGap), bindRuntimeValue(runtime2, "moveSectionsToGap", () => moveSectionsToGap), bindRuntimeValue(runtime2, "diffSections", () => diffSections), bindRuntimeValue(runtime2, "invertSectionsDiff", () => invertSectionsDiff), bindRuntimeValue(runtime2, "applySectionFields", () => applySectionFields), bindRuntimeValue(runtime2, "applySectionsDiff", () => applySectionsDiff), bindRuntimeValue(runtime2, "sectionIdPattern", () => sectionIdPattern, (value) => {
    sectionIdPattern = value;
  }), bindRuntimeValue(runtime2, "isEmptySection", () => isEmptySection, (value) => {
    isEmptySection = value;
  }), bindRuntimeValue(runtime2, "sectionHasDescription", () => sectionHasDescription, (value) => {
    sectionHasDescription = value;
  }), bindRuntimeValue(runtime2, "sectionDescriptionFields", () => sectionDescriptionFields, (value) => {
    sectionDescriptionFields = value;
  }), bindRuntimeValue(runtime2, "normalizeSectionDescription", () => normalizeSectionDescription, (value) => {
    normalizeSectionDescription = value;
  }), bindRuntimeValue(runtime2, "emptySectionHasNoDescription", () => emptySectionHasNoDescription, (value) => {
    emptySectionHasNoDescription = value;
  }), bindRuntimeValue(runtime2, "sectionDiffFields", () => sectionDiffFields, (value) => {
    sectionDiffFields = value;
  }), bindRuntimeValue(runtime2, "initializeSections", () => initializeSections, (value) => {
    initializeSections = value;
  }), () => {
    isEmptySection = (input) => input.start === void 0, sectionHasDescription = (input) => input.description !== "", sectionDescriptionFields = (input) => input.title !== void 0 ? {
      title: input.title,
      description: input.description
    } : {
      description: input.description
    }, normalizeSectionDescription = (input, options) => (0, runtime2.normalizeDescription)(typeof input == "string" ? input.slice(0, options * 4) : input, options), emptySectionHasNoDescription = (input) => isEmptySection(input) && !sectionHasDescription(input), initializeSections = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), sectionIdPattern = /^[\w-]{1,64}$/, sectionDiffFields = ["description", "start", "before", "seq"];
    });
  };
}
export {
  installModelSections
};
