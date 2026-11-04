---
version: alpha
name: LingxiLoop
description: 保留 Bot 角色感的学习工作台，以统一的主栏 + 二级侧栏外壳、shadcn 企业级 SaaS 风格和绿色品牌建立一致体验。
colors:
  primary: "{colors.dark-primary}"
  light-background: "#FFFFFF"
  light-foreground: "#1A1A19"
  light-card: "#FFFFFF"
  light-muted: "#F1F1EE"
  light-muted-foreground: "#6B6B66"
  light-border: "#E7E7E3"
  light-primary: "#1A1A19"
  light-primary-foreground: "#FAFAF8"
  light-sidebar: "#F6F6F4"
  light-brand: "#2E7D5B"
  dark-brand: "#6CC59A"
  light-destructive: "oklch(0.577 0.245 27.325)"
  dark-background: "#141415"
  dark-foreground: "#ECECEA"
  dark-card: "#1C1C1E"
  dark-muted: "#232325"
  dark-muted-foreground: "#9A9A95"
  dark-border: "#262628"
  dark-primary: "#ECECEA"
  dark-primary-foreground: "#141415"
  dark-sidebar: "#0E0E0F"
  dark-destructive: "oklch(0.704 0.191 22.216)"
typography:
  page-title:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.4
  section-title:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  control:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  conversation:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.75
  caption:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  metric:
    fontFamily: "Inter Variable, Noto Sans SC, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
rounded:
  sm: 6px
  md: 8px
  control: 8px
  card: 14px
  message: 18px
  overlay: 18px
  pill: 9999px
spacing:
  unit: 4px
  xs: 8px
  sm: 12px
  md: 16px
  card: 20px
  page: 24px
  lg: 32px
components:
  button-primary-light:
    backgroundColor: "{colors.light-primary}"
    textColor: "{colors.light-primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: 36px
  button-primary-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.dark-primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: 36px
  card-light:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  card-dark:
    backgroundColor: "{colors.dark-card}"
    textColor: "{colors.dark-foreground}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  overlay:
    rounded: "{rounded.overlay}"
    padding: "{spacing.page}"
  navigation-rail:
    width: 64px
  conversation-list:
    width: 280px
  conversation-avatar:
    size: 28px
    rounded: "{rounded.pill}"
  conversation-column:
    width: 700px
  business-page:
    width: 1200px
    padding: "{spacing.page}"
  page-header:
    height: 56px
    typography: "{typography.page-title}"
---

## Overview

LingxiLoop 是人与 Agent 协同学习的 Web 工作台。视觉方向遵循「明理 · 对话页重设计」HTML/PDF：角色头像具有个性，周围的信息保持简洁、稳定和可操作。中性主按钮与绿色品牌强调分开，绿色用于品牌与选中状态，不用大量高饱和底色制造层级。

所有模块共用同一个外壳：64px 图标主栏、可调宽的二级侧栏、带 1px 边框的内容卡。主栏切换模块时二级侧栏保持同一宽度和底色，只替换其中的内容；页面统一使用 PageHeader 与 PageBody，右侧面板统一使用 RightPanel。风格对齐 shadcn 企业级 SaaS：中性底面、细分隔线、克制字号，品牌绿用于未读、选中与状态强调。默认深色，浅色具有同等完整度。

本文记录实际组件应遵循的规范。使用现有 shadcn、assistant-ui、字体和图标资源，不建立第二套组件库，不改变 Agent 运行时、鉴权或业务数据模型。

## Colors

YAML 中 `light-*` 和 `dark-*` 是对应主题的明确色值，映射到 `src/styles/app.css` 的用户端主题（基础控件在 `globals.css`）的 `--background`、`--foreground`、`--card`、`--muted`、`--muted-foreground`、`--border`、`--primary`、`--primary-foreground`、`--sidebar` 与 `--destructive`。

`colors.primary` 指向默认深色主题的 `dark-primary`，供需要单一主色的规范消费者使用。浅色界面使用 `light-primary`；该别名不覆盖 CSS 的明暗主题切换。颜色表同时记录页面、分隔线与状态所需的 CSS token，`components` 只列出代表性组件，不代表未被它引用的颜色未在产品中使用。

内容文字使用 foreground，辅助信息使用 muted-foreground。普通主按钮使用 primary；品牌、未读与成功状态使用 brand（浅色 #2E7D5B、深色 #6CC59A）。危险操作使用 destructive，信息与警告使用 info、warning。图表分类使用 --chart-1…5，不以角色颜色表示权限。

用户消息采用中性气泡 --bubble（浅色 #F1F1EE、深色 #232325），助手回复采用开放正文布局。选中会话使用 --accent 中性底，置顶选中使用 brand 描边；悬停和键盘焦点保持可辨。工作区外层和主导航使用 --sidebar。

普通文字对背景至少达到 WCAG AA 的 4.5:1。浅色辅助文字使用更深的中性色。半透明背景按实际合成后的颜色检查，不仅检查源色。不能仅用颜色传达未读、错误、只读或选中状态。

## Typography

Inter Variable、Noto Sans SC 与 JetBrains Mono 均本地加载，许可证随字体保留。页面标题 26px/600（窄屏 20px）；对话头 14px/600；分区标题 16px；聊天正文 15px/1.75；业务正文和控件 14–15px；辅助信息 12–13px。标题与正文共用无衬线字体，代码采用 JetBrains Mono。

时间和统计数字使用等宽数字。长标题允许换行；会话列表名称和预览各占一行并截断，完整名称仍可访问。

## Layout

### 外壳

```
┌────┬──────────────┬─────────────────────────────┬──────────────┐
│主栏│ 二级侧栏      │ PageHeader（56px）           │ RightPanel   │
│64px│ 260–360px    ├─────────────────────────────┤ 头部 56px    │
│    │ 头部 56px     │ PageBody（≤1200px，24/16px） │ 可拖动       │
└────┴──────────────┴─────────────────────────────┴──────────────┘
```

- 主栏（`src/desktop/WorkspaceRail.tsx`）：工作区切换、对话 / 课程 / 演示文稿三个模块、底部账户。外观与尺寸固定。
- 二级侧栏（`src/desktop/DesktopApp.tsx` 中 id 为 `conversations` 的面板）：所有模块共用一个 ResizablePanel。默认 280px，可在 260–360px 之间拖动，宽度存于 `lingxiloop:desktop-layout:sidebar-width:v1`，双击分隔线恢复默认。底色 `--sidebar`。切换模块不重建面板，只替换内容。
- 内容卡：外层 `--workspace-chrome-surface`，内容区 8px 外边距、`rounded-xl border`。28px 顶部标题栏已移除，工作区名称出现在二级侧栏头部和面包屑首段。
- 每栏各自滚动，页面本身不出现横向滚动；主内容至少 320px。

### 模块与二级侧栏内容

| 模块 | `view` 值 | 二级侧栏 | 主内容 |
| --- | --- | --- | --- |
| 对话 | `conversations` | `ConversationsPane`：搜索 + 新建 + 会话列表 | `ChatPane` |
| 课程 | `learning`、`forum`、`course-materials`、`cases`、`courses`、`course-members`、`course-status` | `CourseNav`：课程头部（头像、名称、角色）、课程分组（概览、论坛及其版块、课程资料、案例库）、管理分组（基本资料、成员与邀请、课程状态，仅可管理的教师） | 对应页面 |
| 演示文稿 | `slides` | `DeckNav`：搜索 + 新建 + 全部 / 最近更新列表 | 演示文稿库或编辑器 |

映射在 `src/components/shell/modules.ts`。URL 的 `view` 值保持不变；主栏「课程」回到用户上次所在的课程页，没有课程时进入案例库。

### 二级侧栏规格

组件在 `src/components/shell/SecondaryPane.tsx`。头部 56px，左右 8px（移动端 12px），可放搜索框（`SecondarySearch`，与会话搜索相同的 36px 无边框输入）或模块标题（`SecondaryTitle`）加一个图标操作。分组标题 12px muted，高 32px。导航行 36px（移动端 44px）、`rounded-lg`、14px；悬停 `bg-muted/60`，选中 `bg-muted` 加 500 字重和 `text-sidebar-primary` 图标，并带 `aria-current="page"`；二级子项缩进 36px、13px。

### 页头与页面主体

组件在 `src/components/shell/PageHeader.tsx`。

- `PageHeader`：最小高度 56px，左右 24px（移动端 12px），底部 `--im-divider-weak` 分隔线，底色 `--background`，与对话头一致。结构为「可选返回按钮 → 面包屑（14px muted，以 `/` 分隔，可点击段落回到上级）→ 标题（Inter 26px/600）→ 末端操作」。末端最多一个主按钮，其余用 outline 或 ghost；窄屏时主按钮收为 44px 图标按钮，文字保留为可访问名称。移动端在没有返回按钮时自动出现「打开导航」按钮，以 Sheet 打开二级侧栏。
- `PageLayout`：页头固定，只有主体滚动。
- `PageBody`：最大 1200px（阅读型页面 800px），内边距 24px，移动端 16px。
- `PageToolbar`：主体顶部的搜索、筛选、排序与视图切换，间距 8px，底部 16px。分类用 `secondary`/`ghost` 小按钮或 shadcn Tabs，不再用 18px 下划线大标签。

### 右侧面板

组件在 `src/components/shell/RightPanel.tsx`。画板（`DesignWorkspace`）、成员资料、回复串、文档预览，以及演示文稿工作区（`SlidesWorkspace`：左侧「演示文稿助手」对话用 PageHeader，右侧编辑器用 RightPanelHeader，与对话 + 画板完全同构）使用同一规格：头部 56px，与左侧 PageHeader 对齐；可选 12px 眉题加 14px/600 标题；末端为唯一的关闭按钮 `PanelCloseButton`（ghost、36px、移动端 44px、`Cancel01Icon`，返回场景用 `ArrowLeft01Icon`）。与主内容之间使用 `desktop-panel-resize-handle` 分隔线（悬停时显示绿色握把）。画板默认 min(620px, 50%)，可在 35–65% 之间拖动；演示文稿工作区中对话默认 40%、编辑器默认 60%（编辑器至少 35%）；容器窄于 720px 时改为覆盖在右侧的非模态面板。

### 内容宽度与移动端

消息正文最大 700px（外层含两侧 28px 留白为 756px）。Composer 按用户要求保留原布局、960px 外列、20px 圆角及工具排列，只移除整框聚焦高光；保留文字选择和按钮键盘焦点。代码、表格、工具结果和附件在自身容器内处理溢出，不撑开整页。

768px 以下：对话保留列表与聊天切换；其他模块直接显示页面，二级侧栏通过页头的导航按钮以左侧 Sheet 打开，选择后自动关闭。打开会话同时更新选中状态和可见页面，返回列表清除会话目标；刷新和浏览器前进后退能恢复同一状态。主要触控目标至少 44px，保留安全区。

### 页面优先级

- 学生概览：下一步学习、待完成事项优先；成长展示与统计分析随后出现。
- 教师概览：待审核和需跟进事项优先；成长与趋势图在后。现有详情、评价和分析入口仍可达。
- 资料：紧凑范围选择器配合真实文件列表，默认公共资料；个人资料和教师查看范围遵循原权限。
- 邮件：有可见页面标题，列表与阅读内容分工清楚，主要写信入口稳定。
- Agent：角色、用途和可执行动作就近呈现，资料详情作为次级操作。

## Elevation & Depth

普通内容卡使用 1px 语义边框和无阴影底面，悬停时只把边框加深到 `foreground` 20%。列表放在一个带边框的容器里，行之间用 `divide-y` 分隔，不给每行再套一张卡。浮层、菜单和抽屉沿用现有克制阴影，表达覆盖关系。不使用渐变、毛玻璃（`backdrop-blur`）、彩色阴影、放射状光晕背景或内联 `style` 颜色。

避免同一内容同时叠加边框、ring 和明显阴影。卡片悬停不整体上浮；可操作性通过颜色和焦点表达。页面加载骨架与最终布局保持相同的主要尺寸，避免完成加载时大幅跳动。

## Shapes

控件圆角 8px，列表行 10px，内容卡 14px，浮层 18px。头像、未读点和小型状态标记保持圆形；短标签可用胶囊形。消息气泡保持 18px 外角以及现有连续消息分组的小内角，不改变消息语义。

CSS 的 `--radius` 为 8px；Tailwind 的 `rounded-lg` 是 8px、`rounded-xl` 是 14px、`rounded-2xl` 是 18px。使用这些角色对应值，不套用 Tailwind 默认圆角刻度；消息 18px 外角使用明确的组件值。

使用 4px 间距基准。常用间距为 8、12、16、20、24、32px。圆角与间距按组件职责选择，不随页面任意更换。

## Components

### 列表与卡片页面

- 课程概览（参考 shadcn dashboard-01）：顶部一行「教学概况/学习概况」小标题与刷新按钮；4 张 KPI 卡（12–14px 标签、24–30px 等宽数字、右上角提示徽标、底部一句说明和进入箭头）；中间为「作业状态分布」柱状图卡（约 60%）与「待审核/即将截止」列表卡（约 40%）；底部为「最近提交/我的作业」数据表（表头 muted 底，状态用 success/warning/destructive 描边徽标，行尾「查看」）。不再用整卡点击弹出对话框。
- 论坛列表（参考 GitHub Discussions、Linear）：帖子放在带边框的容器中，以分隔行展示。每行依次为：版块徽标、头像、作者、相对时间、行尾菜单；15px 标题；13px 两行摘要；12px 元信息行（截止时间、已关闭、#标签、引用资料、表情回应胶囊、评论数），作业在行尾放 outline「提交作业/查看提交」按钮。行悬停时用 muted 40% 底色。工具条上的筛选、排序、显示设置使用 outline 按钮。
- 论坛版块（二级侧栏「论坛」下一级）：参考 shadcn SidebarMenuSub，缩进 20px，左侧有一条导引线，行高 32px、13px；选中项文字加深，导引线上有 2px 绿色标记。
- 论坛详情（参考 issue 页）：顶部工具条为左侧 ghost「返回论坛」，右侧为操作菜单与主按钮。主体两栏：左侧依次为状态徽标、26px 标题、作者头像与时间、正文，以及「提交与验收」「讨论 N」两个分区，各有 14px 分区标题；右侧 260px 粘性「内容属性」卡（作者、版块、发布、更新、截止（逾期标红）、状态、标签、评论），卡底放跳转到提交区的按钮。容器窄于 880px 时属性卡移到正文下方。
- 案例详情（参考博客/文档文章页）：顺序为绿色 13px 分类眉题、26px 标题、16px 摘要、元信息行（作者头像与名称、日期、仅管理者可见的状态徽标、标签徽标）、16:9 头图、32px 分隔后的 16px 正文，阅读宽度 800px。
- 案例库列表：分类按钮组 + 搜索框，卡片网格（16:9 封面、12px 元信息、15px 标题、13px 摘要）。
- 演示文稿库（参考 Vercel 项目面板与 Google Slides 首页）：分为「开始」和「演示文稿 N」两个分区。「开始」有「空白演示文稿」（虚线卡）和「让助手制作」（进入对话）两张快捷卡。「演示文稿」上方工具条为搜索、排序、网格/列表切换；网格卡顶部是 muted 底上的 16:9 白色缩略页（主色短线、标题、两条占位线，悬停上移 2px，减少动态效果时不移动），底部为名称、更新时间、「对话」来源徽标和「⋯」菜单；列表视图为 shadcn 数据表（名称、来源、更新时间、操作）。空态使用带虚线边框的 shadcn `Empty`。
- 课程资料：shadcn Tabs 切换公共资料与我的资料，下方是 Studio Admin 文件管理工具栏和文件表格。
- 设置类页面：二级侧栏承担分区导航，页面内不再重复 Tabs 列表。

### 公共控件与状态

每个操作区至多一个主要按钮；次级动作使用 outline 或 ghost，危险操作使用 destructive。保留禁用、提交中、失败重试、空态、加载及键盘焦点状态。浮层有可访问标题，关闭后焦点回到触发按钮；所有纯图标动作有语义标签。

角色状态动画可以保留。遵守 `prefers-reduced-motion`，减少位移、持续动画和页面入场效果；不为装饰增加新的动效库。

### 会话与消息

列表头像 28px、对话头 22px；保留现有头像素材与回退。两人叠放，三人成簇，更多成员显示两张头像及剩余人数。置顶 1–2 个双列 84px 卡，3–4 个双列 72px 卡，5–8 个四列；超过八个显示七项和“更多”，通过 Dialog 查看全部。置顶卡支持原有上下文菜单与未读/静音状态。

打开画板自动折叠会话栏，关闭画板恢复；可手动切换，面板保持挂载。画板宿主样式由 `third_party/baoyu-design/host/design-theme.css` 接入构建，点阵底与纸面采用明暗语义色，用户创作内容保留自身样式。

首行是名称和时间，第二行是预览或正在输入状态。删除与未读徽标重复的新消息文字，角色说明放在资料中。置顶、静音和未读继续有清楚的图标或数量及可访问描述。

正文、引用、代码、附件、工具、生成内容、运行状态与输入框保持现有 assistant-ui 语义和能力。布局调整不能破坏流式输出、停止、失败重试、复制、回复及手机长按操作。

### Agent 与空态

普通 Agent 的“开始对话”复用现有会话创建接口，由后端确定学习线程；仅在目标会话成功进入当前项目列表后打开。资料页与卡片使用同一操作。创建完成但列表刷新失败时，只重试刷新，不重新创建。

受管教师 Agent 使用“打开教学工作台”，进入当前用户可管理的所属课程。只读空间优先查看已有会话；不能创建时提供切换空间入口。异步操作期间身份或项目改变后，旧请求不能导航或回写当前界面。

无会话提供新建入口；有会话但未选中时提供最近对话。无空间时打开已有选择器；教师可使用现有新建课程入口，学生显示邀请加入说明和刷新入口。文案只描述已实现的下一步，不放不可用的加入按钮。

### Web 地址与历史

模块地址为 `/?project=<projectId>&view=<ViewKey>`；会话地址增加 `&conversation=<conversationId>`。沿用现有模块值，只有聊天模块接受会话参数。搜索、草稿、设置和临时详情不写入地址。

显式导航地址优先于缓存和默认会话。认证、项目权限和目标列表加载成功后恢复；显式聊天地址不含会话 ID 时保持列表状态。用户导航增加一个历史项，默认选择和地址规范化替换历史项，前进后退恢复时不重复记录。

失效或不可访问对象有安全的错误反馈，网络失败保留目的地供重试。登录保留校验后的内部返回地址；邀请和密码重置独立处理。地址参数不是租户或项目授权依据。

## Do's and Don'ts

- 先用间距与文字建立主次，再使用边框或背景。
- 保持相同职责组件的圆角、间距和状态一致。
- 先显示用户能处理的对象，再展示统计。
- 保留人物和 Bot 的特色，让周边文字与徽标保持克制。
- 同时验收明暗主题、键盘、减少动态效果和移动端。
- 不以大图标空卡替代真实内容列表，不为简单分类占据整屏。
- 不用微小文字、重复状态标签或整片高饱和绿色制造强调。
- 不以视觉调整改变权限、消息协议、运行时、资料可见性或提交语义。
- 新页面先用 `PageHeader`、`PageBody`、`SecondaryPane`、`RightPanel`，不自建页头、关闭按钮或侧栏。
- 不使用渐变、毛玻璃、彩色阴影、内联颜色、`font-display` 斜体或 `×` 字符作为关闭图标。
- 不写调色板色值（`blue-500` 等），状态色用 `success`、`info`、`warning`、`destructive`。
- 不绕过官方 E2E 引擎的凭据截图保护；视觉图片来自无凭据合成 fixture，真实流程另用脱敏报告验证。

外壳结构参考 [shadcn/ui](https://github.com/shadcn-ui/ui) 的 sidebar-09（嵌套侧栏）、sidebar-15（左右双侧栏）与 dashboard-01（site-header、卡片和数据表），出处见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md#shadcnui-blocks-layout-patterns)。

格式依据：[Google Labs DESIGN.md alpha](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)。规范与实际 CSS、生产组件及验收产物一起更新。
