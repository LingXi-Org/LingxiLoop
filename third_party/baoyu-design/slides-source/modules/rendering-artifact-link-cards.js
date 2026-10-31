// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installRenderingArtifactLinkCards(runtime2) {
  var lightPalette, darkPalette, metrics, initializeArtifactLinkCards;
  const CARD_TITLE = "Artifact", CARD_ICON = "Link", hasNoBackground = (node) => node.style?.backgroundColor === void 0 && node.style?.backgroundGradient === void 0, hasStockText = (node, fontSize) => node.style?.fontSize === fontSize && node.style.lineHeight === metrics.line && hasNoBackground(node), textWordsElementId = (prefix, frameId, path) => prefix + ":words:" + frameId + ":" + path;
  function shortArtifactAddress(href) {
    let address = (href.split("?")[0] ?? href).replace("https://", "");
    return address.length <= 36 ? address : address.slice(0, address.indexOf("/artifact/") + 10) + "…" + address.slice(-8);
  }
  function createArtifactLinkCard(href, slideBackground, linkSuffix = "") {
    let palette = (0, runtime2.slideTextColor)(slideBackground) === lightPalette.ink ? lightPalette : darkPalette, text = (value, color, fontSize, fontWeight) => ({
      kind: "text",
      role: "body",
      text: value,
      color,
      style: { fontSize, fontWeight, lineHeight: metrics.line }
    });
    return {
      kind: "stack",
      dir: "h",
      align: "center",
      gap: 20,
      group: !0,
      artifact: href,
      style: {
        backgroundColor: palette.fill,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: palette.line,
        borderRadius: 24,
        paddingTop: 18,
        paddingRight: 22,
        paddingBottom: 18,
        paddingLeft: 18
      },
      children: [
        {
          kind: "stack",
          dir: "v",
          align: "center",
          justify: "center",
          gap: 0,
          place: { shrink: 0, minW: 72, minH: 72 },
          style: { backgroundColor: palette.tile, borderRadius: 20 },
          children: [
            { kind: "icon", icon: CARD_ICON, color: palette.icon, w: 44, h: 44 }
          ]
        },
        {
          kind: "stack",
          dir: "v",
          align: "stretch",
          justify: "center",
          gap: metrics.gap,
          place: { grow: 1, basis: 0 },
          children: [
            {
              ...text(CARD_TITLE, palette.ink, metrics.title, 600),
              marks: [
                { start: 0, end: CARD_TITLE.length, href: href + linkSuffix }
              ]
            },
            text(shortArtifactAddress(href), palette.quiet, metrics.second, 400)
          ]
        },
        {
          ...text("↗︎", palette.quiet, 32, 400),
          place: { shrink: 0 }
        }
      ]
    };
  }
  function isPlainOneLineText(node) {
    if (node?.kind !== "text" || node.list !== void 0 || node.lineLists !== void 0 || node.text.includes(`
`))
      return !1;
    let [first, ...rest] = (0, runtime2.textLinesAsRuns)(node)[0] ?? [];
    return first !== void 0 && rest.every((run) => run.bold === first.bold && run.italic === first.italic && run.underline === first.underline && run.color === first.color && run.href === first.href);
  }
  function readArtifactLinkCard(node) {
    let href = node.artifact;
    if (href === void 0 || node.group !== !0)
      return;
    let childrenOf = (child) => child !== node && child.kind === "stack" && child.artifact !== void 0 ? [] : (0, runtime2.nodeChildren)(child) ?? [], findTitle = (parent2) => {
      for (let [index5, child] of childrenOf(parent2).entries()) {
        let hit = child.kind === "text" && (0, runtime2.parseArtifactAddress)((0, runtime2.nodeUniformLink)(child)) === href ? [parent2, index5] : findTitle(child);
        if (hit !== void 0)
          return hit;
      }
    }, found = findTitle(node);
    if (found === void 0)
      return;
    let [parent, index4] = found, [title, second] = childrenOf(parent).slice(index4);
    if (!isPlainOneLineText(title) || title.text !== CARD_TITLE)
      return;
    let quiet = isPlainOneLineText(second) && second.text === shortArtifactAddress(href) && !(second.marks ?? []).some((mark) => mark.href !== void 0) ? second : void 0, findIcon = (child) => child.kind === "icon" ? child : childrenOf(child).map(findIcon).find((icon2) => icon2 !== void 0), icon = findIcon(node), ground = node.style?.backgroundGradient === void 0 ? (0, runtime2.resolveSlideColor)(node.style?.backgroundColor) : void 0, stock = quiet !== void 0 && childrenOf(parent).length === index4 + 2 && parent.kind === "stack" && parent.dir === "v" && parent.gap === metrics.gap && hasNoBackground(parent) && hasStockText(title, metrics.title) && hasStockText(quiet, metrics.second);
    return {
      href,
      title,
      ...quiet !== void 0 ? { quiet } : {},
      ...icon?.icon === CARD_ICON ? { icon } : {},
      ...stock && ground !== void 0 && /^#[0-9a-f]{6}$/i.test(ground) ? { ground } : {}
    };
  }
  function visitArtifactStacks(node, visit) {
    node.kind === "stack" && node.artifact !== void 0 && visit(node);
    for (let child of (0, runtime2.nodeChildren)(node) ?? [])
      visitArtifactStacks(child, visit);
  }
  function artifactLinkCardTextNodes(slide) {
    let nodes = /* @__PURE__ */ new Set(), visit = (stack) => {
      let card = readArtifactLinkCard(stack);
      for (let text of [card?.title, card?.quiet])
        text !== void 0 && nodes.add(text);
    };
    for (let frame of slide.frames)
      visitArtifactStacks(frame.node, visit);
    return nodes;
  }
  function deckArtifactLinkHrefs(slides) {
    let hrefs = /* @__PURE__ */ new Set(), visit = (stack) => {
      let card = readArtifactLinkCard(stack);
      card !== void 0 && hrefs.add(card.href);
    };
    for (let slide of slides)
      for (let frame of slide.frames)
        visitArtifactStacks(frame.node, visit);
    return [...hrefs].sort();
  }
  const initialize = () => {
    (0, runtime2.initializeArtifactAddresses)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeRichTextDom)(), (0, runtime2.initializeRenderingTheme)(), lightPalette = {
      fill: "#FFFFFF",
      line: "#E3E1D8",
      tile: "#F0EEE6",
      icon: "#5E5D59",
      ink: "#141413",
      quiet: "#5E5D59"
    }, darkPalette = {
      fill: "#262624",
      line: "#3D3D3A",
      tile: "#3D3D3A",
      icon: "#C2C0B6",
      ink: "#FAF9F5",
      quiet: "#C2C0B6"
    }, metrics = { title: 28, second: 24, line: 1.25, gap: 2 };
  };
  return bindRuntimeValue(runtime2, "initializeArtifactLinkCards", () => initializeArtifactLinkCards, (value) => {
    initializeArtifactLinkCards = value;
  }), bindRuntimeValue(runtime2, "createArtifactLinkCard", () => createArtifactLinkCard), bindRuntimeValue(runtime2, "readArtifactLinkCard", () => readArtifactLinkCard), bindRuntimeValue(runtime2, "artifactLinkCardTextNodes", () => artifactLinkCardTextNodes), bindRuntimeValue(runtime2, "deckArtifactLinkHrefs", () => deckArtifactLinkHrefs), bindRuntimeValue(runtime2, "ARTIFACT_LINK_CARD_WIDTH", () => 640), bindRuntimeValue(runtime2, "ARTIFACT_LINK_CARD_HEIGHT", () => 112), bindRuntimeValue(runtime2, "textWordsElementId", () => textWordsElementId), () => {
    initializeArtifactLinkCards = (0, runtime2.initializeOnce)(initialize);
  };
}
export {
  installRenderingArtifactLinkCards
};
