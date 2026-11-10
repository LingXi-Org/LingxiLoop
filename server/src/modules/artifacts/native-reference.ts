/** Generated from the accepted operation schema so Agent guidance cannot drift from validation. */
export function nativeModelReference(kind: 'design' | 'slides') {
  return `# Native ${kind} model\n\n`
    + '## 原生编辑流程\n\n先读取read_document和目标read_page。将观察到的document.seq作为baseSeq，与operations一起传给prepare_ops；原始文件尚未转换时另传sourceVersion。准备只读，不保存。服务端读取指定历史快照，用共享prepareBatch生成精确字段前置条件；不存在的历史不会回退当前状态。\n'
    + 'prepare_ops返回planId。apply_ops只传planId，禁止复制、编造或修改预期版本。提交重新检查当前写权限，按存下的批次执行原生CAS和共享撤销历史。独立字段仍可合并；冲突不会覆盖当前作者。冲突后重新读取目标，再准备新计划；未知结果只重试原planId，保持operationId及payload不变。最后运行check，零问题后才声明完成。\n'
    + '操作的完整JSON结构以prepare_ops的当前工具参数为准。不要使用旧文件写入接口，也不要把准备成功当成保存成功。\n\n'
    + 'Document contains schemaVersion, id, kind, title, seq, themeId, themes, assets, pageOrder, pages and versions. '
    + 'read_document returns page, theme and asset summaries plus the pinned document sequence; it omits original theme payloads and asset URLs. tokenPreview is partial and must not replace a full theme. read_page returns full nodes and scoped versions. Pass version=pageVersions[pageId] and atSeq=document.seq from the summary for a consistent snapshot, and prepare operations against that same baseSeq; the host owns per-field counters. typographyRole 为可选的来源排版角色；修改字号时应保留它和富文本结构。 Full theme data remains in project/document.json accessible through read_file. A Page has id/title, x/y/width/height, background, notes, skip, transition, nodeOrder and nodes. '
    + 'A Node always has id/type, x/y/width/height/rotation, parentId (null or group ID) and style. '
    + 'Types: text (text or richText), image (assetId/crop), shape (shape), line (points), table (cells), svg (validated inert svg), math (TeX source), group (layout), embed (isolated source), note (editable text), drawing (local points), video (assetId and posterAssetId). Optional scope=canvas places a node outside an artboard; canvas annotations are omitted from page exports. Optional flipX/flipY mirror a node. Style supports structured gradient/shadow, borderStyle and letterSpacing. Page section and layoutGuides are optional. '
    + 'Executable source belongs only to an embed; legacy originals are immutable. IDs contain letters, digits, hyphen and underscore. nodeOrder lists every node exactly once. pageOrder lists boards/slides only. '
    + '设计稿的 canvasPages 列出独立画布页面及名称；省略时使用 canvas-page-1。画板的 canvasPageId 表示归属，省略时也属于 canvas-page-1。'
    + '每个画布页面可用 contentId 引用 pages 中独立的无边界内容体；其 x/y/width/height 均为 0，不列入 pageOrder。画布便签、文字和绘图使用该内容体内的普通节点及世界坐标，不能挂在画板上。'
    + '独立画布便签使用文本自然高度；保存的 height 只用于初始视区估算。浏览器以实际字体、折行及制表符测量呈现与选择边界，纯查看不写回稿件。'
    + '画布标题使用 text 节点及可选 textSizing=content，width 表示内容宽度上限（默认2000），按内容测量宽高；未设置该字段的旧文字保持固定尺寸。style.paddingX/paddingY 分别表示横纵内边距，未设置时沿用 padding。新建标题字号24、常规字重；便签字号14、宽240。字号改变时使用来源对应行高、内边距和字距。'
    + '绘图节点可选 path={d,width,height}；d 仅含有限的 M/L/C 局部路径指令，字符不超过24000，局部坐标不超过8000，逻辑宽高为2至8000。节点宽高缩放时保留 path 的逻辑坐标；旧 points 绘图继续读取。描边沿用 style.stroke 和 style.strokeWidth。'
    + '首次创建内容体时，在同一批次 document.patch 设置 canvasPages.contentId 并 page.insert 插入内容体；删除内容体时必须同批移除对应引用。保存、read_page 和节点操作沿用普通页面路径。\n\n'
}
