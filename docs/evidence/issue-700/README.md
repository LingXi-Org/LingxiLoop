# Issue #700

Reference: open-claude-ui `2d56ab417f888e8c77f5d5090f53c1f65a05ab0b` (MIT). Chat message/composer metrics and font fallbacks follow its components; brand controls retain LingxiLoop tokens. Own avatars are hidden. Forum, homework, case and preview typography have purpose-scoped ownership shared by their document engines.

ZCode/Visualize source, tools, skill, prompts, callbacks, delivery policies, assets, dependency and build paths are retired. Applied migrations and stored history are untouched. Archived assistant references show a notice; user text and fenced examples remain literal. Existing artifact verification and questionnaire authorization remain active.

Code blocks use react-syntax-highlighter 16.1.2 PrismAsyncLight, with asynchronous grammar loading and upstream One Light/One Dark themes. Streamdown supplies copy/download controls. Chat, forum Markdown, homework Markdown and case Markdown use this component; native documents retain their own engine with shared typography. Browser checks confirmed light `#f6f8fa` and dark `#0d0d0c` backgrounds. This is source rendering, not an executable editor.

Validation:

- Web smoke: 167 passed; server smoke: 184 passed.
- Final code/Markdown/Mermaid/message regressions: 51 passed.
- Retired-reference regressions: 5 passed; homework/history checks: 8 passed.
- Web/server typechecks, web production build, scoped lint and generated dependency profile check passed. Build retains existing chunk-size warnings.
- Browser fixture: Chinese typing, Shift+Enter, local submit, hidden own avatar, message/composer edges, light/dark code backgrounds, and a 390px container without horizontal overflow. Screenshots and computed typography are adjacent. Fixture submissions never call product APIs.
- Editor packaging snapshot: 41/42 passed; remaining Slides input-path assertion differs because snapshot dependencies are a junction. Root packaging is affected by an ancestor Plug'n'Play file. No product guard was weakened.
- Packaging contracts: 38/39 passed; retained-editor shell test cannot find Node through local WSL. Docker daemon and isolated database/Redis unavailable, so Docker image and DB integrations were not run. Physical Chinese IME and live provider calls were not tested.

No deployment or merge is included. Reverting the source commit restores the prior implementation without changing durable data; rebuilding is required for its deleted runtime assets.
