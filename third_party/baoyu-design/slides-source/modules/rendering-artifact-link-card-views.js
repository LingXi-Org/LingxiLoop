// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installRenderingArtifactLinkCardViews(runtime2) {
  var ArtifactCardGlyphJsx, changedArtifactCardValue, artifactCardGlyphs, artifactTypeIcons, artifactTypeIconName, initializeArtifactCardGlyphs, ArtifactCardViewReact, ArtifactCardViewJsx, artifactLinkCardContext, artifactCardTextStyle, artifactCardIconSvgStyle, initializeArtifactLinkCardViews;
  function ArtifactCardWords({ stored, live, hold, className, style }) {
    let words = changedArtifactCardValue(stored, live);
    return ArtifactCardGlyphJsx.jsx("span", {
      className,
      style,
      "data-local-words": words,
      "data-local-hold": words !== void 0 && hold === !0 ? "" : void 0,
      children: ArtifactCardGlyphJsx.jsx("span", {
        inert: words !== void 0 || void 0,
        children: stored
      })
    });
  }
  function ArtifactCardGlyph({ stored, live, size: size4 }) {
    return ArtifactCardGlyphJsx.jsx(runtime2.Icon, {
      name: artifactTypeIconName(stored),
      customSize: size4,
      className: "shrink-0",
      "data-local-glyph": changedArtifactCardValue(artifactCardGlyphs[artifactTypeIconName(stored)], artifactCardGlyphs[artifactTypeIconName(live)])
    });
  }
  function ArtifactLinkCardProvider({ card, editing, children }) {
    let parts = ArtifactCardViewReact.useMemo(() => (0, runtime2.readArtifactLinkCard)(card), [card]), answer = (0, runtime2.useArtifactAnswer)(card.artifact ?? ""), value = ArtifactCardViewReact.useMemo(() => parts !== void 0 ? { ...parts, answer, editing } : void 0, [parts, answer, editing]);
    return ArtifactCardViewJsx.jsx(artifactLinkCardContext.Provider, {
      value,
      children
    });
  }
  function useArtifactCardLiveText(node, linksOn) {
    let card = ArtifactCardViewReact.useContext(artifactLinkCardContext);
    if (!(!linksOn || card?.answer === void 0))
      return node === card.title ? { live: card.answer.title, title: !0 } : node === card.quiet ? {
        live: (0, runtime2.artifactLinkQuietLabel)({ href: card.href }, card.answer),
        title: !1
      } : void 0;
  }
  function useIsArtifactCardText(node) {
    let card = ArtifactCardViewReact.useContext(artifactLinkCardContext);
    return card !== void 0 && (node === card.title || node === card.quiet);
  }
  function ArtifactCardText({ stored, live, title }) {
    let card = ArtifactCardViewReact.useContext(artifactLinkCardContext), grounded = title && card?.ground !== void 0 && !card.editing, style = {
      ...artifactCardTextStyle,
      ...title ? { textDecoration: "underline" } : {},
      ...grounded ? { "--card-ground": card?.ground } : {}
    };
    return ArtifactCardViewJsx.jsx(ArtifactCardWords, {
      hold: !0,
      stored,
      live,
      className: grounded ? "slides-card-title" : void 0,
      style
    });
  }
  function useArtifactCardIcon(node, linksOn) {
    let card = ArtifactCardViewReact.useContext(artifactLinkCardContext);
    return linksOn && card?.answer !== void 0 && node === card.icon ? { kind: card.answer.type ?? void 0 } : void 0;
  }
  function ArtifactCardIcon({ kind, color, px, marks, style, children }) {
    let iconStyle = {
      ...style,
      position: "relative",
      display: "grid",
      placeItems: "center",
      color,
      "--drawn-ink": color
    };
    return ArtifactCardViewJsx.jsxs("span", {
      ...marks,
      style: iconStyle,
      children: [
        children,
        ArtifactCardViewJsx.jsx(ArtifactCardGlyph, {
          stored: void 0,
          live: kind,
          size: Math.round(px * 0.9)
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ArtifactCardGlyphJsx", () => ArtifactCardGlyphJsx, (value) => {
    ArtifactCardGlyphJsx = value;
  }), bindRuntimeValue(runtime2, "changedArtifactCardValue", () => changedArtifactCardValue, (value) => {
    changedArtifactCardValue = value;
  }), bindRuntimeValue(runtime2, "artifactCardGlyphs", () => artifactCardGlyphs, (value) => {
    artifactCardGlyphs = value;
  }), bindRuntimeValue(runtime2, "artifactTypeIcons", () => artifactTypeIcons, (value) => {
    artifactTypeIcons = value;
  }), bindRuntimeValue(runtime2, "artifactTypeIconName", () => artifactTypeIconName, (value) => {
    artifactTypeIconName = value;
  }), bindRuntimeValue(runtime2, "ArtifactCardWords", () => ArtifactCardWords), bindRuntimeValue(runtime2, "ArtifactCardGlyph", () => ArtifactCardGlyph), bindRuntimeValue(runtime2, "initializeArtifactCardGlyphs", () => initializeArtifactCardGlyphs, (value) => {
    initializeArtifactCardGlyphs = value;
  }), bindRuntimeValue(runtime2, "ArtifactCardViewReact", () => ArtifactCardViewReact, (value) => {
    ArtifactCardViewReact = value;
  }), bindRuntimeValue(runtime2, "ArtifactCardViewJsx", () => ArtifactCardViewJsx, (value) => {
    ArtifactCardViewJsx = value;
  }), bindRuntimeValue(runtime2, "artifactLinkCardContext", () => artifactLinkCardContext, (value) => {
    artifactLinkCardContext = value;
  }), bindRuntimeValue(runtime2, "artifactCardTextStyle", () => artifactCardTextStyle, (value) => {
    artifactCardTextStyle = value;
  }), bindRuntimeValue(runtime2, "artifactCardIconSvgStyle", () => artifactCardIconSvgStyle, (value) => {
    artifactCardIconSvgStyle = value;
  }), bindRuntimeValue(runtime2, "ArtifactLinkCardProvider", () => ArtifactLinkCardProvider), bindRuntimeValue(runtime2, "useArtifactCardLiveText", () => useArtifactCardLiveText), bindRuntimeValue(runtime2, "useIsArtifactCardText", () => useIsArtifactCardText), bindRuntimeValue(runtime2, "ArtifactCardText", () => ArtifactCardText), bindRuntimeValue(runtime2, "useArtifactCardIcon", () => useArtifactCardIcon), bindRuntimeValue(runtime2, "ArtifactCardIcon", () => ArtifactCardIcon), bindRuntimeValue(runtime2, "initializeArtifactLinkCardViews", () => initializeArtifactLinkCardViews, (value) => {
    initializeArtifactLinkCardViews = value;
  }), () => {
    changedArtifactCardValue = (stored, live) => live === stored ? void 0 : live, artifactTypeIconName = (type) => (type === void 0 ? void 0 : artifactTypeIcons[type]) ?? "Artifacts", initializeArtifactCardGlyphs = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIcons)(), ArtifactCardGlyphJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), artifactCardGlyphs = {
        Artifacts: "",
        Slides: "",
        PlayCircle: "",
        Note: "",
        Palette: "",
        ChartLine: "",
        Shapes: ""
      }, artifactTypeIcons = {
        slides: "Slides",
        motion: "PlayCircle",
        doc: "Note",
        design: "Palette",
        dashboard: "ChartLine"
      };
    }), initializeArtifactLinkCardViews = (0, runtime2.initializeOnce)(() => {
      initializeArtifactCardGlyphs(), (0, runtime2.initializeArtifactAddresses)(), (0, runtime2.initializeArtifactMetadata)(), (0, runtime2.initializeArtifactLinkCards)(), ArtifactCardViewReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ArtifactCardViewJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), artifactLinkCardContext = ArtifactCardViewReact.createContext(void 0), artifactCardTextStyle = { display: "block" }, artifactCardIconSvgStyle = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%"
      };
    });
  };
}
export {
  installRenderingArtifactLinkCardViews
};
