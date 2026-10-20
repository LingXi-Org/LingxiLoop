# 窄恢复 v2 独立执行前审查

结论：**可执行；未发现阻断本次固定三步恢复的 P1/P2。** 这是源码及本地实际证据审查，不表示已执行或已恢复成功。

对象 `/tmp/lingxi-358-production/continue-host-target-recovery-v2.mjs` SHA256 `f9eaa6da458de1739ef458a3c1c549dd4934e8980b8bea7df4bb46d4fe960c37`。原v1审查和执行补充保留不改；v2只改独占输出文件、前次验证失败确认及目标ImageId鉴定，原三步/13-48/停止原容器/保留WebA/未知失败停止合同不变。

已核对 v1 receipt `maintenance-host-continuation.json` SHA256 `8891fdd6c6ce5bf85e650772e74c0a6dc8d490356d3eb16983748b49d4e9a54f`：complete=false，最后failed，无任何komodo execute事件。v2将其SHA写入新的continuation证据，要求旧v1进程不存在，使用独占`maintenance-host-continuation-v2.json`。原维护记录仍绑定SHA `1abf04ec0bd4bf9af1f4883a33189d70f65764c787f6e674c0de2c36f6f623fa`；原WebB失败、WebA成功和migration成功终态仍由driver重新读取。

v1的具体错误已修正：OCI config digest `019d5728...` 不是这两台daemon实际返回的ImageId。v2的qualifiedImages保留普通ops.verifyImages，并按宿主保存实际InspectImage.Id；同时要求它等于本次已观测的697d5a... index，Descriptor/index mediaType、精确仓库RepoDigest、linux/amd64、完整RootFS层序列及声明source均与已审计镜像一致；后续每步要求宿主Id稳定，容器c.Image比较对应宿主map。这里的Id等于index只适用于已验证的这两台daemon，不应推广成通用Docker语义。

本地交叉验证的证据：

| 文件 | SHA256 |
|---|---|
| final-image-audit-result-d107/receipt.json | `c78239a71b4d76f046a345413c40cda46738fe182add06abf5e0cef5e4a8e013` |
| host-target-image-identities.json | `cd911f3ab2b62576d16ed0c2cae83cbbba6bea2ffc9a39060f569d6f3882b1ae` |
| host-continuation-preflight-state.json | `485ddbdd322c32583ee2b8e72c12b533c98a59d6cc7b06d4a57035eac552e651` |

已实际执行离线断言：审计passed/source d107/index697/config019/layerCount22与plan一致；两宿主ImageId、Descriptor、RepoDigests、OS/arch、声明source与全部22个diffID按序完全匹配；WebA容器 `56dd3a69e18befd03751747e50714644d40bf3c2fa460759faa91aefed3259ca` 的imageId等于该宿主值、healthy、restartCount0。`node --check`通过。整个检查没有生产API调用。

失败模型复核：

- 前次进程活跃、v1有execute、镜像/层/平台漂移、host/config漂移、三旧容器未停或13/48不一致：不允许部署。
- WebB、WorkerA、WorkerB按固定顺序逐步部署；每步实际终态和健康/身份通过才前进。WebA没有显式重新部署。
- 未改变普通维护引擎；没有增加stop、显式migration、backup、配置或Git操作。RefreshStackCache及只读state oneoff仍会发生。
- 任何失败/未知结果停止，无自动重试；新输出文件独占创建防止同一路径重复启动。只有唯一生产执行者可推进，文件wx不是分布式锁。

继承v1审查限制：镜像HEAD/缓存不保证之后Compose Pull成功；depends_on可能运行db-migrate，即使无新schema迁移，仍可能执行既有ensureEducationPlan幂等事务。后续必须用三个部署精确终态、两Web/两Worker实际身份和健康、最终13/48及HTTPS核验恢复结果。宿主隐含凭据状态没有由本审查独立检查。

本次没有审查者发起而被拒绝、pending或结果不确定的生产动作。该报告不替代执行时fresh gates，也不将v1静态通过表述成v1实际恢复成功。
