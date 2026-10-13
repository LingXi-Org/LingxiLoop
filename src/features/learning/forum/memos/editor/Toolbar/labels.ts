const labels: Record<string, string> = {
  'editor.format.bold': '加粗', 'editor.format.italic': '斜体', 'editor.format.strikethrough': '删除线',
  'editor.format.code': '行内代码', 'editor.format.code-block': '代码块',
  'editor.format.bullet-list': '无序列表', 'editor.format.ordered-list': '有序列表', 'editor.format.task-list': '任务列表',
  'editor.format.paragraph': '正文', 'editor.format.heading': '标题级别', 'editor.format.heading-1': '一级标题',
  'editor.format.heading-2': '二级标题', 'editor.format.heading-3': '三级标题',
  'editor.format.more': '更多格式', 'editor.format.link': '链接', 'editor.exit-focus-mode': '退出专注模式', 'common.close': '关闭',
}
export const formatLabel = (key: string) => labels[key] ?? key
