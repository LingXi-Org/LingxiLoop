# v1 continuation 执行结果补充

本文件补充、不改写已封存的静态审查（报告SHA c420e0d71df3872428656b2e69b43d2cf5fc528ae8d892f2e04586b8cdfd810b）。v1 driver SHA 1783c96223049f164f446e0ed0d4d4729a3f5aeed1c6c4eea1dd520822dea49a 实际执行于14:25:28–14:25:56 UTC，在任何 Komodo execute 之前 fail-closed。此前静态审查未核验硬编码 ImageId 的实时来源，因此不能作为该值已确认或v1恢复完成的证据。

本地读取 `maintenance-host-continuation.json` SHA 8891fdd6c6ce5bf85e650772e74c0a6dc8d490356d3eb16983748b49d4e9a54f：complete=false，仅三条 host-source verified 和 continuation failed，无komodo submitting/pending/complete，也无部署/迁移提交证据。host cache refresh和只读请求已发生，因此只可称“未提交服务执行动作”，不能称完全无写API调用。

14:26:17 只读容器回执 `host-continuation-preflight-state.json` SHA 485ddbdd322c32583ee2b8e72c12b533c98a59d6cc7b06d4a57035eac552e651 显示 WebA d107、healthy、restartCount0、容器ID56dd3a69...；其实际ImageId为sha256:697d5a...。其余三旧容器精确原ID且stopped/pid0。14:26:58 两宿主镜像回执 `host-target-image-identities.json` SHA cd911f3ab2b62576d16ed0c2cae83cbbba6bea2ffc9a39060f569d6f3882b1ae 显示两侧 InspectImage.Id同为697d5a...，RepoDigests精确匹配plan index，两侧linux/amd64及RootFS一致，声明source d107。

v1硬编码019d5728...与这些实际ImageId不符，因此检查拒绝推进，未损伤已运行WebA。v2须按每宿主实际、已验证精确RepoDigest的InspectImage.Id建基线，并保持普通维护引擎已有ImageId稳定性检查；不得用OCI config digest代替daemon ImageId，也不得简单去掉容器镜像身份验证。

本审查仍只读取本地证据，没有生产API请求。v2尚待独立审查，v1历史回执和driver保留。
