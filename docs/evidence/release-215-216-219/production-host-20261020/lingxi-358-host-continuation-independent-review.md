# LingxiLoop 3.5.8 窄恢复 driver 执行前独立审查

结论：**可执行；未发现阻断本次窄恢复的 P1/P2。** 仅涵盖由唯一生产执行者运行已有三步 continuation 的执行前检查；不宣称恢复已成功，也不要求重新停服、备份或迁移。

审查对象 `/tmp/lingxi-358-production/continue-host-target-recovery.mjs`，SHA256 `1783c96223049f164f446e0ed0d4d4729a3f5aeed1c6c4eea1dd520822dea49a`。导入维护工具工作树 HEAD `16313a843aa824050e7cfb88f66db80193a88492`，检查时 clean。审查只读取本地文件、官方 Komodo 2.3.3 已缓存源码和仓库代码，运行 `node --check` 及本地证据断言；未运行 driver、未请求生产 API、未访问凭据。

## 精确失败边界

原维护记录 `maintenance-host-execution.json` SHA256 `1abf04ec0bd4bf9af1f4883a33189d70f65764c787f6e674c0de2c36f6f623fa`。唯一失败为 Web B DeployStackService `6ad778a1e06d5e1f79836ea6`；原日志最后是 recovery/failed/fix-forward；唯一 recovery/healthy 是 Web A 的 lingxiloop。迁移 `6ad77847e06d5e1f79836e91` 已成功，维护新鲜 state 与 plan 的 runtime3.5.8/native13/product48/protocol/schemaHash/全部48迁移一致；Web A 部署 `6ad7786be06d5e1f79836e99` 已成功。

`host-web-b-deploy-failure.json` SHA256 `356599f888ba6c129153dea581457118898b60fe4b772722a2434a86c69ffc56` 显示 Web B Complete/false；失败阶段是 Compose Pull（522 / failed to resolve），前面阶段成功，没有 Compose Up。官方 periphery-compose.rs 在 pull 失败后立即返回，尚未执行 compose down/up。driver 在新部署前会重新读取上述三个精确终态，不依赖旧接受回执。

已有 public mirror HEAD 在14:22:29 UTC为HTTP200，精确index digest `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`。driver要求该记录小于15分钟且与plan匹配。这支持一次经过前置校验的恢复尝试，不保证生产节点随后拉取必成功。

## 审查的失败模型及控制

1. 旧engine或重复continuation并发：先pgrep核查原维护进程不存在；continuation输出以`flag:'wx'`独占创建，同一路径重复运行在任何网络操作之前失败。唯一执行者及fresh action-state仍是并发控制的一部分，不是分布式锁。
2. 误读其他失败或未知结果：限定planHash、原末尾状态、唯一失败update ID、唯一已恢复服务；重新读取WebB failure、WebA success、migration success的精确operation/target/Complete/success。任何不符停止。原receipt SHA在输出动态记录，本报告另行固定其实际SHA，不把动态计算称为硬编码完整性断言。
3. 旧worker在schema13上运行：初始除WebA外三服务必须是原ID/imageId/source、stopped、pid0、不重启且restartCount不变；不重新启动任何旧writer。
4. WebA被覆盖或健康变化：先固定WebA d107目标及精确imageId `sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b`、healthy/running/restartCount0；后续反复检查已完成容器ID/imageId/source/健康/restartCount保持一致。WebA不在显式部署列表。
5. 文件、配置、镜像或数据库漂移：每步assertIdle刷新三栈实际host hash和配置，verifyImages验证两节点index及ImageId，state先经过只读/完整可见性校验，再逐字段匹配13/48和全inventory；deploy前再次验证目标栈host source。guard继续要求空Git/registry账户、无自动更新/销毁/额外args/hooks、固定目录与公共模板。
6. 动作扩大或失败后重试：部署顺序固定WebB/lingxiloop → WebA/worker → WebB/worker。每步精确terminal、verifyHealthy、身份校验完成后才继续；异常记录failed或uncertain并exit1，没有循环重试/回滚/启动旧服务。没有显式调用stop/pull/migrate/backup/config/Git；只读state oneoff和host cache refresh属于前置检查。
7. 泄密：只输出版本、迁移校验和、容器身份、精确更新ID和状态，不输出原始API/环境/日志，也不输出捕获的原始错误。没有新增凭据、镜像源或TLS变化。宿主既有credential helper状态仍不属于本审查独立验证范围。

## Compose 依赖的实际边界

Compose up仍会使用既有depends_on：Worker依赖Web，Web依赖db-migrate。官方调用无显式force-recreate，guard要求extra_args为空。仍须保留已完成容器身份后置检查，不能声称Compose绝不处理依赖。

已安装13/48且迁移清单匹配时，既有db:migrate不应应用新schema迁移；但它仍取得迁移锁、检查runtime并执行ensureEducationPlan幂等事务。准确表述为“无显式迁移调用、无新schema迁移”，不能描述为“完全不执行迁移程序”或“整个部署只读”。这在现有部署依赖的恢复范围内，不构成新增阻断。

缓存镜像和成功HEAD不能消除Compose Pull / pull_policy:always网络依赖。再次失败时driver停止；先查实际终态和已完成服务库存，再评估下一次恢复，不自动重跑本脚本或原维护引擎。

## 验证与交付

- `node --check /tmp/lingxi-358-production/continue-host-target-recovery.mjs`通过。
- 本地断言固定driver/prior SHA、唯一失败/健康服务边界、ComposePull失败且无ComposeUp、精确mirror digest、迁移后13/48 inventory均通过。
- 机器摘要：`/tmp/lingxi-358-host-continuation-review.json`，记录输入哈希及限制。
- 未执行生产恢复或模拟外部API成功；实际完成仍需后续三个DeployStackService终态、两Web/两Worker身份健康、最终13/48及HTTPS证据。
- 没有本审查发起而被拒绝、pending或结果不确定的生产动作。
