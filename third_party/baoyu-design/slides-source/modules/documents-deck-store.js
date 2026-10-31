// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsDeckStore(runtime2) {
  var artifactDocumentOptions, artifactDocumentFactory, SlidesDocumentStore;
  function deckOrderAndSections(content) {
    return {
      order: content.order,
      ...content.sections !== void 0 ? {
        sections: content.sections
      } : {}
    };
  }
  function buildDeckExportContent(content, orderState) {
    return {
      theme: content.theme,
      ...content.format !== void 0 ? {
        format: content.format
      } : {},
      ...orderState.sections !== void 0 ? {
        sections: orderState.sections
      } : {},
      ...content.cover !== void 0 && orderState.order.includes(content.cover) ? {
        cover: content.cover
      } : {},
      order: orderState.order,
      slides: content.slides,
      assets: content.assets,
      ...content.fonts !== void 0 ? {
        fonts: content.fonts
      } : {},
      ...content.faces !== void 0 ? {
        faces: content.faces
      } : {},
      ...content.lists !== void 0 ? {
        lists: content.lists
      } : {},
      ...content.style !== void 0 ? {
        style: content.style
      } : {}
    };
  }
  function jsonValuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function moveSectionStartBeforeInsertedSlide(sections, order, insertedId) {
    return sections === void 0 || order[0] !== insertedId || order[1] === void 0 || sections.some((input) => input.start === insertedId) || !sections.some((input) => input.start === order[1]) ? sections : sections.map((input) => input.start === order[1] ? {
      ...input,
      start: insertedId
    } : input);
  }
  function removeDeckCoverIfMatches(content, slideId) {
    if (content.cover !== slideId)
      return content;
    let { cover, ...value } = content;
    return value;
  }
  function setDeckSections(content, sections) {
    if (sections === content.sections)
      return content;
    let state = {
      ...content
    };
    return sections === void 0 ? delete state.sections : state.sections = sections, state;
  }
  function configureArtifactDocument(options) {
    artifactDocumentOptions = options;
  }
  function configureArtifactDocumentFactory(factory) {
    artifactDocumentFactory = factory;
  }
  function createSlidesArtifactDocumentOptions(bootReport) {
    return {
      parseContent: (input) => {
        if (!(0, runtime2.looksLikeSlideHtml)(input))
          return (0, runtime2.normalizeDeck)(input, bootReport);
        let value = (0, runtime2.compileSlideHtml)(input);
        return bootReport && (bootReport.htmlErrors = value.errors.length, bootReport.htmlWarnings = value.warnings.length + value.unsupported.length, value.errors[0] !== void 0 && (bootReport.htmlErrorSample = (0, runtime2.formatCompileDiagnostic)(value.errors[0]))), (0, runtime2.normalizeDeck)(value.content, bootReport);
      },
      serializeContent: (input, options) => input.format === "html" ? (0, runtime2.serializeDeckHtml)(input, options) : input,
      contentHold: describeInvalidDeckHtml,
      initialContent: (0, runtime2.normalizeDeck)({
        format: "html",
        theme: "neutral",
        order: [],
        slides: {}
      }),
      defaultTitle: (0, runtime2.untranslatedMessage)("Untitled")
    };
  }
  function describeInvalidDeckHtml(content) {
    if (!(0, runtime2.looksLikeSlideHtml)(content))
      return;
    let parsed = (0, runtime2.compileSlideHtml)(content);
    if (parsed.errors.length !== 0)
      return (0, runtime2.formatMessage)({
        defaultMessage: "演示文稿的 HTML 有 {n} 处结构错误（首处：{first}）。当前尽量展示可读内容，无法保存，请修复源文件并重新构建。",
        id: "CLeKTs+iYC"
      }, {
        n: parsed.errors.length,
        first: (0, runtime2.formatCompileDiagnostic)(parsed.errors[0])
      });
  }
  return bindRuntimeValue(runtime2, "deckOrderAndSections", () => deckOrderAndSections), bindRuntimeValue(runtime2, "buildDeckExportContent", () => buildDeckExportContent), bindRuntimeValue(runtime2, "jsonValuesEqual", () => jsonValuesEqual), bindRuntimeValue(runtime2, "moveSectionStartBeforeInsertedSlide", () => moveSectionStartBeforeInsertedSlide), bindRuntimeValue(runtime2, "removeDeckCoverIfMatches", () => removeDeckCoverIfMatches), bindRuntimeValue(runtime2, "setDeckSections", () => setDeckSections), bindRuntimeValue(runtime2, "artifactDocumentOptions", () => artifactDocumentOptions, (value) => {
    artifactDocumentOptions = value;
  }), bindRuntimeValue(runtime2, "configureArtifactDocument", () => configureArtifactDocument), bindRuntimeValue(runtime2, "artifactDocumentFactory", () => artifactDocumentFactory, (value) => {
    artifactDocumentFactory = value;
  }), bindRuntimeValue(runtime2, "configureArtifactDocumentFactory", () => configureArtifactDocumentFactory), bindRuntimeValue(runtime2, "createSlidesArtifactDocumentOptions", () => createSlidesArtifactDocumentOptions), bindRuntimeValue(runtime2, "describeInvalidDeckHtml", () => describeInvalidDeckHtml), bindRuntimeValue(runtime2, "SlidesDocumentStore", () => SlidesDocumentStore, (value) => {
    SlidesDocumentStore = value;
  }), () => {
    (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeHtmlWriter)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeTypographyInference)(), artifactDocumentOptions = {}, SlidesDocumentStore = class {
      doc;
      bootReport = {
        droppedStyles: 0
      };
      listeners = /* @__PURE__ */ new Set();
      snapshot;
      added = /* @__PURE__ */ new Map();
      limbo = [];
      awaited = !1;
      /** Set by `setLook` until the next snapshot, so typography inference is redone from the new look. */
      restyled = !1;
      now;
      constructor(input, options = Date.now) {
        this.now = options, this.doc = input ?? artifactDocumentFactory?.(createSlidesArtifactDocumentOptions(this.bootReport)) ?? (0, runtime2.createArtifactDocument)({
          ...createSlidesArtifactDocumentOptions(this.bootReport),
          ...artifactDocumentOptions
        }), this.snapshot = this.buildSnapshot(), this.doc.subscribe((input2) => this.bump(input2?.remote === !0));
      }
      getSnapshot() {
        return this.snapshot;
      }
      subscribe(input) {
        return this.listeners.add(input), () => this.listeners.delete(input);
      }
      content() {
        return this.doc.content();
      }
      buildSnapshot(input = !0) {
        let value = this.content();
        (0, runtime2.setRenderingTheme)(value.theme);
        let items = [];
        for (let value2 of value.order) {
          let value3 = value.slides[value2];
          value3 && items.push(value3);
        }
        return {
          meta: {
            v: 1,
            title: this.doc.title(),
            theme: value.theme,
            order: value.order
          },
          slides: items,
          baseline: this.nextBaseline(items, value.theme, input),
          assets: new Map(Object.entries(value.assets)),
          ...value.fonts !== void 0 ? {
            fonts: value.fonts
          } : {},
          ...value.faces !== void 0 ? {
            faces: value.faces
          } : {},
          ...value.format !== void 0 ? {
            format: value.format
          } : {},
          ...value.sections !== void 0 ? {
            sections: value.sections
          } : {},
          ...value.cover !== void 0 ? {
            cover: value.cover
          } : {},
          ...value.style !== void 0 ? {
            style: value.style
          } : {}
        };
      }
      nextBaseline(input, options, context) {
        let snapshot = this.snapshot;
        if (snapshot === void 0 || this.restyled)
          return input;
        if (!context)
          return snapshot.baseline;
        let callback = (input2) => (0, runtime2.typographyStylesSignature)((0, runtime2.inferDeckTypographyStyles)(input2, options), options);
        return callback(input) === callback(snapshot.slides) ? snapshot.baseline : input;
      }
      bump(input = !1) {
        let snapshot = this.snapshot;
        if (this.snapshot = this.buildSnapshot(input), this.restyled = !1, !(input && this.putBackAdded(snapshot)))
          for (let value of this.listeners)
            value();
      }
      putBackAdded(input) {
        let awaited = this.awaited;
        if (this.awaited = (0, runtime2.getSlideDocumentCodec)(this.doc).awaitingSlides(), this.added.size === 0 || this.doc.readOnly())
          return !1;
        let value = (0, runtime2.preserveRecentlyRemovedSlides)({
          added: this.added,
          now: this.now(),
          before: {
            order: input.meta.order,
            slides: input.slides
          },
          order: this.snapshot.meta.order,
          awaiting: this.awaited,
          wasAwaiting: awaited,
          limbo: this.limbo
        });
        if (this.limbo = value.limbo, value.back.length === 0)
          return !1;
        let snapshot = this.snapshot;
        return this.doc.updateContent((input2) => {
          let value2 = value.back.filter((input3) => !input2.order.includes(input3.id)).slice(0, Math.max(0, runtime2.maxDeckSlides - input2.order.length));
          if (value2.length === 0)
            return input2;
          for (let value3 of value2)
            this.added.delete(value3.id);
          return {
            ...input2,
            order: [
              ...input2.order,
              ...value2.map((input3) => input3.id)
            ],
            slides: {
              ...input2.slides,
              ...Object.fromEntries(value2.map((input3) => [
                input3.id,
                (0, runtime2.setDeckListStyle)(input3, input2.lists)
              ]))
            }
          };
        }, {
          auto: !0
        }), this.snapshot === snapshot ? !1 : (queueMicrotask(() => void this.doc.save()), !0);
      }
      forgetParked(input) {
        this.limbo = this.limbo.filter((input2) => !input.includes(input2.slide.id));
      }
      getSlide(input) {
        return this.content().slides[input];
      }
      setSlide(input) {
        Object.hasOwn(this.content().slides, input.id) && this.doc.updateContent((input2) => ({
          ...input2,
          slides: {
            ...input2.slides,
            [input.id]: (0, runtime2.setDeckListStyle)(input, input2.lists)
          }
        }));
      }
      updateSlide(input, options) {
        let value = this.getSlide(input);
        value && this.setSlide(options(value));
      }
      setLook(slides, style, faces) {
        this.restyled = !0, this.doc.updateContent((input) => {
          let { style: value, faces: value2, ...value3 } = input, entries = {
            ...input.slides
          };
          for (let value4 of slides)
            Object.hasOwn(entries, value4.id) && (entries[value4.id] = (0, runtime2.setDeckListStyle)(value4, input.lists));
          return {
            ...value3,
            slides: entries,
            ...faces.length > 0 ? {
              faces: [...faces]
            } : {},
            ...style !== void 0 ? {
              style
            } : {}
          };
        });
      }
      setFaces(items) {
        this.doc.updateContent((input) => {
          let { faces: value, ...value2 } = input;
          return items !== void 0 && items.length > 0 ? {
            ...value2,
            faces: [...items]
          } : value2;
        });
      }
      insertSlide(input, options, context = {}) {
        this.content().order.length >= runtime2.maxDeckSlides || (this.added.set(input.id, this.now()), this.doc.updateContent((input2) => {
          let value = input2.order.filter((input3) => input3 !== input.id);
          value.splice(Math.max(0, Math.min(value.length, options)), 0, input.id);
          let value2 = context.joinTop === !0 ? moveSectionStartBeforeInsertedSlide(input2.sections, value, input.id) : input2.sections;
          return this.seal(setDeckSections({
            ...input2,
            order: value,
            slides: {
              ...input2.slides,
              [input.id]: (0, runtime2.setDeckListStyle)(input, input2.lists)
            }
          }, value2));
        }));
      }
      removeSlide(input) {
        this.forgetParked([input]), Object.hasOwn(this.content().slides, input) && this.doc.updateContent((input2) => {
          let state = {
            ...input2.slides
          };
          delete state[input];
          let value = input2.order.filter((input3) => input3 !== input);
          return this.seal(setDeckSections({
            ...removeDeckCoverIfMatches(input2, input),
            order: value,
            slides: state,
            assets: (0, runtime2.filterReferencedDeckAssets)(state, value, input2.assets)
          }, (0, runtime2.reconcileSectionsWithSlideOrder)((0, runtime2.removeSlideFromSections)(input2.sections, input2.order, input), value)));
        });
      }
      removeSlideKeepAssets(input) {
        this.forgetParked([input]), Object.hasOwn(this.content().slides, input) && this.doc.updateContent((input2) => {
          let state = {
            ...input2.slides
          };
          delete state[input];
          let value = input2.order.filter((input3) => input3 !== input);
          return this.seal(setDeckSections({
            ...removeDeckCoverIfMatches(input2, input),
            order: value,
            slides: state
          }, (0, runtime2.reconcileSectionsWithSlideOrder)((0, runtime2.removeSlideFromSections)(input2.sections, input2.order, input), value)));
        });
      }
      setCover(input) {
        let value = this.content();
        value.cover === input || input !== void 0 && !value.order.includes(input) || this.doc.updateContent((input2) => {
          let { cover: value2, ...value3 } = input2;
          return input !== void 0 && input2.order.includes(input) ? {
            ...value3,
            cover: input
          } : value3;
        });
      }
      moveSlide(input, options, context = {}) {
        let order = this.content().order, value = order.indexOf(input);
        value < 0 || Math.max(0, Math.min(order.length - 1, options)) !== value && this.doc.updateContent((input2) => {
          let items = [...input2.order];
          items.splice(value, 1), items.splice(Math.max(0, Math.min(items.length, options)), 0, input);
          let value2 = (0, runtime2.reconcileSectionsWithSlideOrder)((0, runtime2.removeSlideFromSections)(input2.sections, input2.order, input), items);
          return this.seal(setDeckSections({
            ...input2,
            order: items
          }, context.joinTop === !0 ? moveSectionStartBeforeInsertedSlide(value2, items, input) : value2));
        });
      }
      snapshotAssetsFor(input) {
        let value = this.content(), value2 = value.slides[input];
        if (!value2)
          return {};
        let values = /* @__PURE__ */ new Set();
        (0, runtime2.collectSlideAssetIds)(value2, values);
        let state = {};
        for (let value3 of values) {
          let value4 = value.assets[value3];
          value4 !== void 0 && (state[value3] = value4);
        }
        return state;
      }
      restoreSlide(input, options, context) {
        this.doc.updateContent((input2) => {
          let value = input2.order.filter((input3) => input3 !== input.id);
          return value.splice(Math.max(0, Math.min(value.length, options)), 0, input.id), {
            ...input2,
            order: value,
            slides: {
              ...input2.slides,
              [input.id]: (0, runtime2.setDeckListStyle)(input, input2.lists)
            },
            assets: {
              ...input2.assets,
              ...context
            }
          };
        });
      }
      insertSlides(items, options) {
        let value = this.content();
        if (items.length === 0 || value.order.length + items.length > runtime2.maxDeckSlides || items.some((input) => Object.hasOwn(value.slides, input.id)))
          return !1;
        let value2 = Object.fromEntries(items.map((input) => [
          input.id,
          (0, runtime2.setDeckListStyle)(input, value.lists)
        ])), value3 = options({
          ...value,
          slides: {
            ...value.slides,
            ...value2
          }
        });
        if (value3 === void 0 || !items.every((input) => value3.order.includes(input.id)))
          return !1;
        for (let value4 of items)
          this.added.set(value4.id, this.now());
        return this.doc.updateContent((input) => this.seal(buildDeckExportContent({
          ...input,
          slides: {
            ...input.slides,
            ...value2
          }
        }, deckOrderAndSections(value3)))), !0;
      }
      applyStructure(input) {
        let value = this.content(), value2 = input(value);
        if (value2 === void 0)
          return !1;
        let value3 = deckOrderAndSections(value2);
        return jsonValuesEqual(deckOrderAndSections(value), value3) ? !1 : (this.doc.updateContent((input2) => buildDeckExportContent(input2, value3)), !0);
      }
      sectionsSnapshot() {
        return this.arm({});
      }
      arm(input) {
        return input.sections = this.content().sections, input.after = void 0, input.sealed = !1, this.armed = input, queueMicrotask(() => {
          this.armed === input && (this.armed = void 0);
        }), input;
      }
      armed;
      seal(input) {
        return this.armed !== void 0 && (this.armed.after = input.sections, this.armed.sealed = !0, this.armed = void 0), input;
      }
      restoreSections(input) {
        if (input.sealed !== !0)
          return;
        let value = this.content(), value2 = (0, runtime2.diffSections)({
          ...value,
          sections: input.after ?? []
        }, {
          ...value,
          sections: input.sections ?? []
        });
        value2.added.length === 0 && value2.changed.length === 0 && value2.removed.length === 0 || this.doc.updateContent((input2) => (0, runtime2.applySectionsDiff)(input2, value2));
      }
      prepareAsset(input) {
        if (!(0, runtime2.isAllowedImageSource)(input))
          throw Error("assets must be raster or SVG data: URIs");
        if (Object.keys(this.content().assets).length >= runtime2.maxDeckAssets)
          throw Error("asset limit reached (" + String(runtime2.maxDeckAssets) + ")");
        return (0, runtime2.createModelId)();
      }
      setAssetEntry(input, options) {
        this.doc.updateContent((input2) => ({
          ...input2,
          assets: {
            ...input2.assets,
            [input]: options
          }
        }));
      }
      removeAssetEntry(input) {
        this.doc.updateContent((input2) => {
          if (!Object.hasOwn(input2.assets, input))
            return input2;
          let state = {
            ...input2.assets
          };
          return delete state[input], {
            ...input2,
            assets: state
          };
        });
      }
      getAsset(input) {
        return this.content().assets[input];
      }
    };
  };
}
export {
  installDocumentsDeckStore
};
