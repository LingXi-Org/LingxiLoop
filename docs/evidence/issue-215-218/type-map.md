# Public task mapping

Inventory: 79 product registrations, plus 18 runtime built-ins. Canonical and known `__` aliases share dispatch. Unknown names retain a safe official ToolCall.

| Action | Chinese title | Actual component integration |
| --- | --- | --- |
| `canvas.add_comment` | 评论画布 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.append_content` | 补充画布内容 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.available_agents` | 查找画布助手 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.create_frame` | 创建画布内容 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.current` | 查看协作画布 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.delete_frame` | 删除画布内容 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.start_workspace` | 启动画布协作 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.stop_assignment` | 停止协作分工 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.stop_workspace` | 停止画布协作 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.submit_report` | 提交协作报告 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.submit_verification` | 提交协作核验 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `canvas.update_frame` | 更新画布内容 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `catalog.discover` | 查找可用工具 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.ack` | 更新已读状态 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.add_member` | 添加对话成员 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.ask` | 补充信息 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.history` | 阅读对话历史 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.inbox` | 查看未读消息 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.list_mutes` | 查看静音设置 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.metadata` | 查看当前对话 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.react` | 回应消息 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.recommend` | 提出学习建议 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.rename` | 重命名对话 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.report_progress` | 整理任务说明 | RunActivity + Message primitives / Reasoning / AgentPlan |
| `chat.search` | 搜索对话内容 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.send` | 发送消息 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.set_muted` | 调整对话静音 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `chat.set_topic` | 更新对话主题 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `directory.participants` | 查找工作区成员 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `directory.self` | 查看助手身份 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `directory.statuses` | 查看助手状态 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.create` | 创建文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.delete` | 删除文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.edit` | 更新文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.list` | 查找文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.read` | 阅读文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.recent` | 查看最近文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `documents.rename` | 重命名文档 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `files.create` | 生成文件 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `files.list` | 查看附件 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `files.read` | 阅读附件 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `knowledge.add_file` | 添加文件资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.add_text` | 添加文字资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.add_url` | 添加网页资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.check_source` | 核对课程资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.delete_source` | 删除课程资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.list_sources` | 查看课程资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.read_source` | 阅读课程原文 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.retry_ingestion` | 重试资料处理 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.search` | 检索课程资料 | ToolCall; retrieval progress for search/read_source/list_sources |
| `knowledge.set_source_enabled` | 调整资料可用状态 | ToolCall; retrieval progress for search/read_source/list_sources |
| `learning.assess_homework` | 评阅作业 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `learning.get_assignment` | 阅读作业要求 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `learning.get_homework` | 查看作业状态 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `learning.list_assignments` | 查看作业列表 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `learning.list_submissions` | 查看作业提交 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `learning.submit_assignment` | 提交作业答案 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `memory.apply` | 保存记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.doctor` | 检查记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.forget` | 忘记记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.history` | 查看记忆历史 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.list` | 查看记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.read` | 读取记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.reflect` | 整理记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.restore` | 恢复记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `memory.search` | 搜索记忆 | ToolCall + MemoryChips (authorized successful summaries) |
| `polls.close` | 结束投票 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `polls.create` | 创建投票 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `polls.show` | 查看投票 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `polls.vote` | 提交投票 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.approve_outline` | 确认演示大纲 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.cancel` | 取消演示制作 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.create` | 创建演示文稿 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.get` | 查看演示文稿 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.retry` | 重试演示制作 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.revise` | 修改演示文稿 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `presentations.revise_outline` | 修改演示大纲 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `research.read` | 阅读网页 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `research.search` | 查找资料 | ToolCall + WebSearch + existing linked source cards |
| `response.upgrade` | 准备完整答复 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `routines.activate` | 启用定时任务 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `routines.create` | 创建定时任务 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `routines.list` | 查看定时任务 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `routines.pause` | 暂停定时任务 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.ask` | 补充信息 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.check_receipt` | 核对操作结果 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.check_resource` | 检查最新内容 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.contract` | 制定任务计划 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.inspect` | 核对执行结果 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.read_attachment` | 回查请求附件 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `task.read_evidence` | 回查引用依据 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `teacher.draft_homework` | 拟定作业 | ToolCall + existing HomeworkDraftTool |
| `teacher.homework_overview` | 查看班级作业概况 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `visualize.export` | 导出可视化 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `visualize.read` | 读取可视化 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `visualize.read_reference` | 查看可视化参考 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |
| `visualize.save` | 保存可视化 | ToolCall (full official disclosure, input/result and state); no matching authorized specialized payload |

The runtime public host-action events expose statuses/allowlisted fields, not full private results. No scores, diff hunks, file trees, Python code, collaborator identities or schedules are synthesized to fill a specialized demo. Where those payloads are absent, the complete official ToolCall remains the applicable element. Product-specific rich cards stay intact. This is a capability boundary, not a claim that every tool has a specialized visual result.
