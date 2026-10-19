# Upstream Web color inheritance review

Read-only source review on 2026-10-19. Every upstream reference below is pinned to `zai-org/ZCode@0a1fc56d279fd1001f78387bd81aec1c26767411`. This review explains the missing host input in the first isolated component screenshot baseline; it is not a claim that corrected browser screenshots have already passed.

## Web entry establishes inherited foreground

The production Web entry [packages/web/index.html, lines 119–132](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/web/index.html#L119) assigns `body`:

```css
color: var(--zcode-bootstrap-fg, var(--color-foreground, #e2e8f0));
```

The light bootstrap selector changes only the last fallback to `#334155`. In a normal cold start without a navigation snapshot, `--zcode-bootstrap-fg` is absent, so the body inherits the active `--color-foreground` theme token. Merely importing `packages/ui/src/styles.css` and mounting a GenUiCard does not reproduce this entry rule.

[Lines 45–86](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/web/index.html#L45) optionally restore a session-storage navigation snapshot. Lines 63–70 set `--zcode-bootstrap-fg` to the saved foreground or a fallback. Searching the pinned packages finds no removal of this property: if present, that inline property continues to take precedence in the body declaration. The ordinary cold-start baseline must explicitly state that it has no bootstrap snapshot; it must not model an invented cleanup lifecycle.

For the mobile chat branch there is also a closer explicit override: [WebRemoteControlMobileShell.tsx, lines 165–175](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/WebRemoteControlMobileShell.tsx#L165) puts `text-foreground` on the actual chat section.

The same Web entry, lines 122–127, gives the body `font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. The inspected chat ancestor chain below contains no `font-sans`/inline `fontFamily` override, and the upstream stylesheet contains no replacement global `font-family` rule. The host fixture and scoped host must also preserve this Web font stack; forcing `ui-sans-serif` independently would be another missing entry input. The guest iframe's separately derived original `--font-sans` protocol token is a different contract and must remain unchanged.

## Tokens and browser color scheme

The original [styles.css](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/styles.css) declares these foreground mappings:

| Theme selector | Source line | `--color-foreground` |
| --- | --- | --- |
| Base `@theme` | 272 | `var(--color-neutral-700)` |
| `.dark` | 445 | `var(--color-neutral-200)` |
| `.theme-zai-light` | 609 | `var(--color-neutral-800)` |
| `.theme-zai-dark` | 773 | `var(--color-neutral-300)` |

[useTheme.ts, lines 21–24 and 58–69](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/useTheme.ts#L58) normalizes light/dark preferences to Zai themes and applies both the resolved `dark` class and the matching `theme-zai-*` class. The default preference is `zai-dark` (lines 83–86). A matrix exercising only the legacy base/`.dark` tokens is useful but must not be labelled a complete reproduction of the default Web theme.

The Web entry [lines 36–42](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/web/index.html#L36) sets `data-zcode-browser-theme-surface`, `documentElement.style.colorScheme` and the `color-scheme` meta value. [useTheme.ts, lines 37–50](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/useTheme.ts#L37) keeps those values synchronized when that Web marker is present. Native controls can depend on this browser input independently of Tailwind's `dark` class.

## Component ancestry and the missing baseline input

The inspected desktop/wide component chain is RootShell → RootWorkspaceContent → App → WorkspaceShellLayout → SessionPane → ConversationTimeline → ConversationTurnGroup/ConversationTurnRow → ConversationRowView → GenUiMessageResponse → GenUiCard. RootShell's wrapper (line 11), WorkspaceShellLayout's shell/content wrappers (lines 2204–2212 and 2305–2312), SessionPane's wrapper (lines 5625–5644), and ConversationRowView's assistant wrapper (lines 1693–1700) do not set a foreground color. [GenUiMessageResponse.tsx, lines 40–50](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/gen-ui/components/GenUiMessageResponse.tsx#L40) renders GenUiCard directly, not inside MessageResponse's text wrapper.

[GenUiCard.tsx, lines 187–214](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/gen-ui/components/GenUiCard.tsx#L187) places the inline TweakPanel below the page. [TweakPanel.tsx, lines 19–29](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/gen-ui/components/TweakPanel.tsx#L19) supplies layout/font-size classes but no foreground on the panel, fieldset, legend, label or label span. These inherit the host foreground. Thus black text in a dark bare-component fixture is not evidence for matching the real Web host.

The Desktop HTML entry does not contain the Web body's foreground rule. No desktop ancestor foreground was found in the chain above. This review does not invent one or assert desktop/Web equivalence.

## Minimal correction and remaining verification

The independent reference harness must apply the original Web cold-start foreground and browser color-scheme inputs, with explicit theme selection. The scoped product host must preserve equivalent semantic foreground rather than resetting it to `initial`; setting its boundary to `color: var(--color-foreground)` reproduces the no-snapshot Web inheritance without depending on LingxiLoop's unrelated page text color. Existing explicit component colors remain responsible for their own text.

Frontend and E2E owners were given these sources before changing their implementation/harness. The earlier zero-difference claim from a fixture missing Web host foreground cannot establish Web equivalence. Corrected screenshots/computed-style evidence must record both foreground and color scheme and distinguish legacy-token cases from the default Zai themes. Source/diff hashes remain pending the owners' final changes.
