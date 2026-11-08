# 原生编辑器实现与清理记录

参考：baoyu-design v2.8.0，提交 `016b39d7fdcc30bfacee31ea5541498ac53921c6`；性能基线 `72162f58`。产品身份与自有界面文字为中文 LingxiLoop。

有效的源码定位、资源哈希、运行样本与布局基准已迁至 [`scripts/fixtures/native-editors`](../../../scripts/fixtures/native-editors)。第三方来源、MIT 与字体许可见仓库 `THIRD_PARTY_NOTICES.md` 及 `third_party/baoyu-design/`；不分发上游编辑器及受限图标字体。

本次删除开发期间的重复截图、日志、逐轮审查草稿与无产品消费者的取证入口。原始记录仍可在 [清理前提交 57b583ad](https://github.com/LingXi-Org/LingxiLoop/tree/57b583ad7dfc7b2d45c1b7951820a26b4d5e1c32/docs/evidence/issue-707) 复查；其中的历史通过项不代表最终候选提交已通过。

## 验收边界

完整一比一还原任务仍由 [问题 707](https://github.com/LingXi-Org/LingxiLoop/issues/707) 跟踪，未完成，不以本次代码清理或合并宣称通过。

- 历史整界面像素差异为 2.27%—9.61%，未达到 0.5% 门槛；触摸布局也有已知位置差异。
- 历史静态脚本体积相对基线增长约 8.31%，不能据此宣称实际传输、启动、内存或输入反馈门槛通过。十组交替 AB/BA 性能验收尚未通过。
- 用户允许跳过真实授权环境的评论与智能体验收；权限、租户隔离及持久化的产品检查仍需执行。
- 清理后的实际检查、独立审查和发布结果记入本次关联 PR；保留失败和未验证项。
