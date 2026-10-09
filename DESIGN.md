---
version: alpha
name: LingxiLoop
description: 保留 Bot 角色感的亲和学习工作台，以稳定的三栏结构、清晰的任务层级和绿色品牌建立一致体验。
colors:
  primary: "{colors.dark-primary}"
  light-background: "oklch(1 0 0)"
  light-foreground: "oklch(0.141 0.005 285.823)"
  light-card: "oklch(1 0 0)"
  light-muted: "oklch(0.967 0.001 286.375)"
  light-muted-foreground: "oklch(0.46 0.016 285.938)"
  light-border: "oklch(0.92 0.004 286.32)"
  light-primary: "oklch(0.527 0.154 150.069)"
  light-primary-foreground: "oklch(0.982 0.018 155.826)"
  light-sidebar: "oklch(0.985 0 0)"
  light-destructive: "oklch(0.577 0.245 27.325)"
  dark-background: "oklch(0.141 0.005 285.823)"
  dark-foreground: "oklch(0.985 0 0)"
  dark-card: "oklch(0.21 0.006 285.885)"
  dark-muted: "oklch(0.274 0.006 286.033)"
  dark-muted-foreground: "oklch(0.705 0.015 286.067)"
  dark-border: "oklch(1 0 0 / 10%)"
  dark-primary: "oklch(0.723 0.219 149.579)"
  dark-primary-foreground: "oklch(0.266 0.065 152.934)"
  dark-sidebar: "oklch(0.21 0.006 285.885)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
typography:
  page-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
  section-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  control:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  conversation:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
  caption:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  metric:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
rounded:
  sm: 6px
  md: 8px
  control: 12px
  card: 16px
  message: 18px
  overlay: 20px
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
    width: 300px
  conversation-avatar:
    size: 40px
    rounded: "{rounded.pill}"
  conversation-column:
    width: 800px
  business-page:
    width: 1200px
    padding: "{spacing.page}"
  page-header:
    height: 64px
    typography: "{typography.page-title}"
---

## Overview

LingxiLoop 是人与 Agent 协同学习的 Web 工作台。视觉方向参考 Akeru 的亲和感：角色头像具有个性，周围的信息保持简洁、稳定和可操作。绿色用于品牌与主要操作，不用大量高饱和底色制造层级。

桌面聊天的功能图标栏、会话列表、主内容三栏职责与顺序固定。学习、资料、邮件与 Agent 模块继续使用当前主内容切换方式；不为了统一外观给每个页面强行加入会话栏。详情按需使用抽屉。默认深色，浅色具有同等完整度。

本文记录实际组件应遵循的规范。使用现有 shadcn、assistant-ui、字体和图标资源，不建立第二套组件库，不改变 Agent 运行时、鉴权或业务数据模型。

## Colors

YAML 中 `light-*` 和 `dark-*` 是对应主题的明确色值，映射到 `src/styles/globals.css` 的 `--background`、`--foreground`、`--card`、`--muted`、`--muted-foreground`、`--border`、`--primary`、`--primary-foreground`、`--sidebar` 与 `--destructive`。

`colors.primary` 指向默认深色主题的 `dark-primary`，供需要单一主色的规范消费者使用。浅色界面使用 `light-primary`；该别名不覆盖 CSS 的明暗主题切换。颜色表同时记录页面、分隔线与状态所需的 CSS token，`components` 只列出代表性组件，不代表未被它引用的颜色未在产品中使用。

内容文字使用 foreground，辅助信息使用 muted-foreground。主按钮、未读标记和当前功能强调使用 primary。危险操作使用 destructive，成功、警告与图表继续使用现有语义变量，不以角色颜色表示权限。

选中会话使用 `color-mix(in srgb, var(--primary) 12%, var(--sidebar))`，文字保持 foreground，并有可见的绿色选中标识。使用 sRGB 混色避免中性底面的 Oklch 色相使浅绿偏色。悬停使用 accent；悬停、选中与键盘焦点必须能区分。工作区外层使用 `color-mix(in oklch, var(--background) 96%, var(--foreground))`。

普通文字对背景至少达到 WCAG AA 的 4.5:1。浅色辅助文字使用更深的中性色。半透明背景按实际合成后的颜色检查，不仅检查源色。不能仅用颜色传达未读、错误、只读或选中状态。

## Typography

沿用已安装的 Inter Variable 正文和 Geist Variable 标题，中文由系统无衬线字体回退。页面标题 20px，分区标题和聊天正文 16px，业务正文及控件 14px，辅助信息 12px，统计数字 24px。可见状态文字不使用 8px、9px 等微型字号。

默认行高对应现有 Tailwind 字级：页面标题 28px、分区标题 24px、业务正文与控件 20px、辅助信息 16px、统计数字 32px。正文为 400 字重，按钮为 500，标题与统计数字为 600；多行说明可按所在组件使用更宽松的行高。

聊天正文行高 1.65。时间和统计数字使用等宽数字。长标题允许适当换行；会话列表名称与预览各占一行并截断，完整名称可通过可访问名称或详情读取。

## Layout

桌面功能栏宽 64px。会话栏默认 300px，可在 260–360px 之间拖动；保留已保存的用户宽度并限制在有效区间，双击分隔线恢复默认。聊天主栏保留至少 320px。三栏各自滚动，页面本身不出现横向滚动。

消息行和输入框使用同一条最大 800px 的居中内容列；该宽度包含消息头像与间距。窄屏按剩余可用宽度收缩。代码、表格、工具结果和附件在自身容器内处理溢出，不撑开整页。普通业务内容最大 1200px；桌面页面内边距 24px、移动端 16px。

桌面标题区域最小高度 64px；标题在左，当前页面主操作在右，局部导航位于标题之后。工作区名称是范围信息，页面标题是当前任务，两者不使用同样的强调。工具栏窄时换行，不裁掉主要操作。

768px 以下沿用移动端列表与聊天切换。打开会话同时更新选中状态和可见页面，返回列表清除会话目标；刷新和浏览器前进后退能恢复同一状态。主要触控目标至少 44px，保留安全区。

### 页面优先级

- 学生概览：下一步学习、待完成事项优先；成长展示与统计分析随后出现。
- 教师概览：待审核和需跟进事项优先；成长与趋势图在后。现有详情、评价和分析入口仍可达。
- 资料：紧凑范围选择器配合真实文件列表，默认公共资料；个人资料和教师查看范围遵循原权限。
- 邮件：有可见页面标题，列表与阅读内容分工清楚，主要写信入口稳定。
- Agent：角色、用途和可执行动作就近呈现，资料详情作为次级操作。

## Elevation & Depth

普通内容卡使用 1px 语义边框和无阴影底面。列表通过间距、背景和选中状态分组，不给每行再套一张卡。浮层、菜单和抽屉沿用现有克制阴影，表达覆盖关系。

避免同一内容同时叠加边框、ring 和明显阴影。卡片悬停不整体上浮；可操作性通过颜色和焦点表达。页面加载骨架与最终布局保持相同的主要尺寸，避免完成加载时大幅跳动。

## Shapes

控件圆角 12px，内容卡 16px，浮层 20px。头像、未读点和小型状态标记保持圆形；短标签可用胶囊形。消息气泡保持 18px 外角以及现有连续消息分组的小内角，不改变消息语义。

CSS 的 `--radius` 为 12px；当前 Tailwind 映射中 `rounded-lg` 是 12px、`rounded-xl` 是 16px、`rounded-2xl` 是 20px。使用这些角色对应值，不套用 Tailwind 默认圆角刻度；消息 18px 外角使用明确的组件值。

使用 4px 间距基准。常用间距为 8、12、16、20、24、32px。圆角与间距按组件职责选择，不随页面任意更换。

## Components

### 公共控件与状态

每个操作区至多一个主要按钮；次级动作使用 outline 或 ghost，危险操作使用 destructive。保留禁用、提交中、失败重试、空态、加载及键盘焦点状态。浮层有可访问标题，关闭后焦点回到触发按钮；所有纯图标动作有语义标签。

角色状态动画可以保留。遵守 `prefers-reduced-motion`，减少位移、持续动画和页面入场效果；不为装饰增加新的动效库。

### 会话与消息

列表头像 40px。首行是名称和时间，第二行是预览或正在输入状态。删除与未读徽标重复的新消息文字，角色说明放在资料中。置顶、静音和未读继续有清楚的图标或数量及可访问描述。

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
- 不绕过官方 E2E 引擎的凭据截图保护；视觉图片来自无凭据合成 fixture，真实流程另用脱敏报告验证。

格式依据：[Google Labs DESIGN.md alpha](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)。规范与实际 CSS、生产组件及验收产物一起更新。
