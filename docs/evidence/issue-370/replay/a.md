# Replay A：Canvas musl 裁剪候选验证

回放目录：`/tmp/lingxi370-replay-a`。固定提交与实际 HEAD 均为 `fe61654b76c6cc47f70351ad04f2c4819d9111b8`。

任务：评估现有候选是否从 Debian/glibc 服务端镜像删除未使用的 musl Canvas 二进制，同时保留 GNU Canvas 绑定和正式 runtime PDF 支持。只读源码，允许临时验证文件；未安装依赖、联网、修改源码或接触生产，未调用其他 agent。

## 最终判断

候选实现符合维护任务的预期范围，未发现需要修改的明确源码缺陷；建议在精确候选镜像验证通过后，再认定任务完成。

删除仅位于生产依赖阶段，目标仅为 musl `.node` 文件；GNU 二进制、元数据、许可证和 PDF.js 解析资源保留。平台、版本、布局及三个文件哈希均在删除前校验。最终镜像检查要求 musl 文件缺席、GNU 模块实际加载并生成 PNG。

本次通过：两个脚本语法、提交差异空白、三种拒绝路径及文件保留、Canvas 锁版本与正式 runtime 版本一致性。源码审阅确认 Docker 构建上下文与调用连接。

## 六次回放工具调用

每次均为一次 `functions.exec`，内部一次 `exec_command`，工作目录均为回放目录。以下为实际运行命令。部分批次使用分号串接，整个批次退出码不代表每个子命令结果；调用 6 使用 `&&` 明确复核语法和差异检查通过。

### 1. 读取工作区规则

```bash
cat AGENTS.md
```

结果：退出 0；读取规则，包括按最小所属范围检查、不得将未运行检查报告通过、隔离验证前列出失败模式等。

### 2. 确认快照并阅读全部六文件差异

```bash
git status --short; git rev-parse HEAD; git show --stat --oneline fe61654b76c6cc47f70351ad04f2c4819d9111b8; git show --format=fuller --no-ext-diff fe61654b76c6cc47f70351ad04f2c4819d9111b8 --
```

结果：退出 0；工作树干净，HEAD 精确匹配；六文件、146 行新增。阅读失败模型、README、裁剪脚本、Dockerfile、dockerignore 和 packaged startup 变更。

### 3. 检查构建与启动消费者、锁和工具环境

```bash
cat server/docker/lingxiloop-server.Dockerfile; cat server/scripts/check-packaged-startup.mjs; rg -n 'canvas-linux-x64-musl|@napi-rs/canvas|document-worker|triangle-reference|check-packaged-startup|server:.*test' package.json server/package.json server/package-lock.json scripts server/src e2e/homework .github/workflows; node --version; command -v docker; ls -ld node_modules server/node_modules 2>/dev/null
```

结果：批次退出 2，末尾依赖目录检查无目录输出；Node 为 `v24.19.0`，Docker 可执行文件存在。看到生产依赖裁剪与最终阶段启动检查连接、Canvas 锁版本及 PDF 夹具引用。未安装本地依赖。

### 4. 语法检查、差异检查、可用镜像及 PDF 裁剪消费者审阅

```bash
node --check scripts/prune-glibc-canvas-runtime.mjs; node --check server/scripts/check-packaged-startup.mjs; git diff-tree --check fe61654b^ fe61654b; docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}'; cat scripts/prune-pdfjs-server-runtime.mjs; rg -n 'lingxios|extract|pdf|document' server/src/services/homework* server/src/*document* server/package.json .github/workflows/ci.yml 2>/dev/null
```

结果：两个语法检查与差异检查无错误输出，随后调用 6 明确复核。Docker 仅列出 MinIO、WuKongIM、PostgreSQL、Redis 镜像，没有服务器候选镜像。审阅现有 PDF.js 裁剪脚本：正式 document-worker 直接消费者、保留解析入口及 CMaps/fonts/WASM 等资源。批次退出 2，末尾包含不存在的搜索路径；不将其报告为全批次通过。

### 5. 临时夹具验证拒绝路径、核对版本及构建上下文

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/prune-glibc-canvas-runtime.mjs');
const temp=mkdtempSync(join(tmpdir(),'canvas-review-'));
try {
 const root=join(temp,'node_modules');
 for(const name of ['canvas','canvas-linux-x64-gnu','canvas-linux-x64-musl']) {
  const dir=join(root,'@napi-rs',name); mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'package.json'),JSON.stringify({version:name==='canvas-linux-x64-musl'?'1.0.9':'1.0.8'}));
 }
 const binary=join(root,'@napi-rs/canvas-linux-x64-musl/skia.linux-x64-musl.node'); writeFileSync(binary,'sentinel');
 let result=spawnSync(process.execPath,[script,root,'--apply'],{encoding:'utf8'});
 assert.equal(result.status,1); assert.match(result.stderr,/Canvas package changed/); assert.equal(readFileSync(binary,'utf8'),'sentinel');
 console.log('PASS changed version rejects --apply and preserves target');
 writeFileSync(join(root,'@napi-rs/canvas-linux-x64-musl/package.json'),JSON.stringify({version:'1.0.8'}));
 result=spawnSync(process.execPath,[script,root,'--apply'],{encoding:'utf8'});
 assert.equal(result.status,1); assert.match(result.stderr,/musl package layout changed/); assert.ok(existsSync(binary));
 console.log('PASS changed layout rejects --apply and preserves target');
 result=spawnSync(process.execPath,[script,root,'--invalid'],{encoding:'utf8'});
 assert.equal(result.status,1); assert.match(result.stderr,/Usage:/); assert.ok(existsSync(binary));
 console.log('PASS invalid action rejects and preserves target');
 const lock=JSON.parse(readFileSync('server/package-lock.json','utf8'));
 for(const name of ['canvas','canvas-linux-x64-gnu','canvas-linux-x64-musl']) assert.equal(lock.packages[`node_modules/@napi-rs/${name}`].version,'1.0.8');
 const rootPackage=JSON.parse(readFileSync('package.json','utf8')); const server=JSON.parse(readFileSync('server/package.json','utf8'));
 assert.equal(rootPackage.dependencies['@lyyzka/lingxios'],'3.5.8'); assert.equal(server.dependencies['@lyyzka/lingxios'],'3.5.8');
 console.log('PASS locked Canvas versions and formal runtime 3.5.8 match guards');
} finally { rmSync(temp,{recursive:true,force:true}); }
NODE
rg -n 'document|extractPdf|prepare.*attach|lingxios' server/src/lingxios* server/src/homework* server/src/services/homework* 2>/dev/null
sed -n '340,395p' .github/workflows/ci.yml
cat server/docker/lingxiloop-server.Dockerfile.dockerignore
```

结果：退出 0；输出四行 PASS。前三项分别确认错误版本、错误布局、非法动作拒绝且目标仍在；第四项确认 Canvas `1.0.8` 和根/服务端正式 LingxiOS `3.5.8`。临时目录在 finally 中清理。dockerignore 明确允许新裁剪脚本；CI 的原生 documents 检查存在，但本次未执行。

### 6. 明确复核通过状态、环境与源码定位

```bash
node --check scripts/prune-glibc-canvas-runtime.mjs && node --check server/scripts/check-packaged-startup.mjs && git diff-tree --check fe61654b^ fe61654b && git status --short && node --input-type=module -e 'console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,glibc:process.report.getReport().header.glibcVersionRuntime}))'; rg -n 'prepareDocument|extractDocument|document-worker|documentParser|parseDocument|@lyyzka/lingxios' server/src/homework server/src/services server/src/agents server/src/lib 2>/dev/null | head -60; nl -ba scripts/prune-glibc-canvas-runtime.mjs | tail -48; nl -ba server/scripts/check-packaged-startup.mjs | head -45
```

结果：退出 0；`&&` 链完整运行至环境输出，两个脚本语法和差异检查通过，工作树仍干净；环境为 Linux x64、glibc `2.41`、Node `v24.19.0`。定位裁剪脚本第 24–51 行的保护/渲染检查、第 60–63 行唯一删除，以及启动检查第 10–24 行的最终镜像断言。

## 时间、计数与费用

回放起止绝对时间及端到端时长：未测，已有输出不提供。

| 调用 | functions.exec 显示 Wall time（秒） | exec_command 返回 wall_time_seconds |
| --- | ---: | ---: |
| 1 | 0.7 | 0.000037186 |
| 2 | 0.8 | 0.017086357 |
| 3 | 0.8 | 0 |
| 4 | 0.8 | 0 |
| 5 | 1.0 | 0.179147596 |
| 6 | 0.8 | 0.002618589 |

这些是各工具返回的耗时字段，不是完整回放时间；不据此推算完整时长。回放工具计数为 6 次 functions.exec / 6 次 exec_command。tokens 与费用未由工具提供，均不可用；输出中的 original_token_count 不代表模型总 tokens。

本文件整理发生在回放结束后，其读取与写入工具调用单独计数，不计入上述 6 次。

## 剩余风险和阻塞

- 未来平台、版本、布局或二进制/loader 哈希变化会主动使构建失败，需要重新审核；当前实现限定 Linux x64/glibc。
- 成功删除、真实 Canvas 绘制、完整 packaged startup、正式 runtime PDF 前后对比及完整候选构建未执行：缺少本地 node_modules 和候选服务器镜像，且环境 Node 24 与目标 Node 22 不同。本轮禁止安装，未尝试这些动作；这是环境材料不足，未发生权限拒绝或不确定执行。
- README 中历史镜像的原生/PDF 检查为既有文档证据，本次未复现，不能替代精确候选镜像验证。最终 startup 检查也不执行真实 PDF 转换。
- 建议后续在精确候选的干净构建镜像中验证 GNU Canvas 渲染、LingxiOS 3.5.8 PDF 夹具前后输出一致，并保留结果。镜像压缩收益尚无本次实测。
