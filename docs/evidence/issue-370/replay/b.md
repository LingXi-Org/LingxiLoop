# 有界历史维护任务回放 B

- 工作目录：`/tmp/lingxi370-replay-b`
- 固定提交：`fe61654b76c6cc47f70351ad04f2c4819d9111b8`
- 任务：移除 Debian/glibc 服务端镜像不使用的 musl Canvas 二进制，保留 GNU Canvas 绑定及正式运行时 PDF 支持。
- 范围：六个变更文件及消费者；只读源码，临时验证夹具例外；未安装依赖、构建/发布镜像、访问生产、联网调用模型、提交或修改源码。
- 回放工具调用：6 次 `functions.exec`，每次内含 1 次 `exec_command`。本次证据整理调用另计，不属于这 6 次。
- 回放起止时刻、端到端总时长：未测，已有输出不提供绝对时间。
- Tokens／费用：不可用，不估算。

## 1. 读取工作区说明

实际命令：

```bash
cat AGENTS.md
```

结果：退出 0。读取产品约束、测试和交付要求。此次父任务的只读验证边界优先，不沿用文件中其他发布任务的授权。

工具输出时长：外层 0.7 秒；`exec_command.wall_time_seconds` 为 0.000034842 秒。两者不是端到端回放时长。

## 2. 确认快照并查看完整提交

实际命令：

```bash
git status --short && git rev-parse HEAD && git show --stat --oneline fe61654b76c6cc47f70351ad04f2c4819d9111b8 && git show --format=fuller --no-ext-diff fe61654b76c6cc47f70351ad04f2c4819d9111b8
```

结果：退出 0，HEAD 与固定提交一致。六个变更文件、146 行新增。开始时已有 ` M AGENTS.md`，未修改它。

工具输出时长：外层 1.4 秒；子命令 0.604916038 秒。

## 3. 检查 Docker 接线、最终包检查及消费者／执行器可用性

实际命令：

```bash
sed -n '1,240p' server/docker/lingxiloop-server.Dockerfile; cat server/docker/lingxiloop-server.Dockerfile.dockerignore; sed -n '1,260p' server/scripts/check-packaged-startup.mjs; rg -n 'canvas|pdfjs|document-worker|check-packaged-startup|packaged' server/package.json server/package-lock.json package.json scripts/prune-pdfjs-server-runtime.mjs server/src .github/workflows; command -v node; command -v docker; ls -d node_modules/@napi-rs/* server/node_modules/@napi-rs/* 2>/dev/null
```

结果：综合命令退出 2，最后的依赖目录 glob 无匹配。Node、Docker 命令均存在；Dockerfile、dockerignore 及最终包检查的关键内容已读。消费者搜索过宽，混入业务画布引用，输出被截断；后续调用 4 和 6 改用精确搜索补足相关证据。未把此综合命令报告为测试通过。

工具输出时长：外层 1.1 秒；子命令输出记录为 0 秒，不据此推断真实执行耗时。

## 4. 语法、提交空白检查和精确依赖／消费者审查

实际命令：

```bash
node --version; node --check scripts/prune-glibc-canvas-runtime.mjs; node --check server/scripts/check-packaged-startup.mjs; git diff-tree --check fe61654b^ fe61654b; node -e 'const fs=require("fs");for(const p of ["node_modules","server/node_modules","node_modules/@napi-rs/canvas","server/node_modules/@napi-rs/canvas"]) console.log(p,fs.existsSync(p));for(const p of ["package.json","server/package.json","server/package-lock.json"]){const v=JSON.parse(fs.readFileSync(p));console.log(p,JSON.stringify({runtime:v.dependencies?.["@lyyzka/lingxios"],canvas:v.packages?.["node_modules/@napi-rs/canvas"],gnu:v.packages?.["node_modules/@napi-rs/canvas-linux-x64-gnu"],musl:v.packages?.["node_modules/@napi-rs/canvas-linux-x64-musl"],pdf:v.packages?.["node_modules/pdfjs-dist"]}));}' ; sed -n '1,160p' scripts/prune-pdfjs-server-runtime.mjs; rg -n '@napi-rs/canvas|pdfjs-dist|document-worker|parseDocument|extractDocument' server/src server/scripts package.json server/package.json .github/workflows/ci.yml --glob '!*.sql' --glob '!package-lock.json'
```

结果：综合命令退出 0。两个 `node --check` 及 `git diff-tree --check` 未输出错误。Node 为 v24.19.0；根和 server 的 node_modules 均不存在。根／server manifest 的正式运行时均为 3.5.8；server 锁文件中的 Canvas、GNU、musl 均为 1.0.8，PDF.js 为 6.3.289。附件、研究和作业消费者使用正式运行时 `extractDocumentText`。现有 PDF.js 裁剪脚本保留解析器、worker、CMaps、字体和 WASM，并审查正式 document-worker 消费者。

工具输出时长：外层 0.9 秒；子命令 0.061454447 秒。

## 5. 临时夹具执行真实脚本的拒绝路径

隔离验证失败模型：版本、布局或 loader 不匹配时应在删除前失败；非法调用不应访问或修改依赖。没有模拟成功的原生加载，也没有绕过硬编码哈希。

实际命令：

```bash
node --input-type=module <<'NODE'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
// Failure model for isolated checks: changed version/layout/loader must fail
// before deletion; invalid invocation must fail without touching dependencies.
const dir=mkdtempSync(join(tmpdir(),'canvas-review-b-'));
const script=resolve('scripts/prune-glibc-canvas-runtime.mjs');
let passes=0;
try {
  for (const mode of ['version','layout','loader']) {
    const root=join(dir,mode,'node_modules');
    for(const name of ['canvas','canvas-linux-x64-gnu','canvas-linux-x64-musl']) {
      const p=join(root,'@napi-rs',name);mkdirSync(p,{recursive:true});
      writeFileSync(join(p,'package.json'),JSON.stringify({name:'@napi-rs/'+name,version:mode==='version'&&name==='canvas-linux-x64-musl'?'1.0.9':'1.0.8'}));
      writeFileSync(join(p,'README.md'),'fixture');
    }
    const base=join(root,'@napi-rs');
    writeFileSync(join(base,'canvas','LICENSE'),'fixture');
    writeFileSync(join(base,'canvas','js-binding.js'),'changed loader');
    writeFileSync(join(base,'canvas-linux-x64-gnu','skia.linux-x64-gnu.node'),'gnu-sentinel');
    const musl=join(base,'canvas-linux-x64-musl','skia.linux-x64-musl.node');
    writeFileSync(musl,'musl-sentinel');
    if(mode==='layout')writeFileSync(join(base,'canvas-linux-x64-musl','extra.txt'),'unexpected');
    const r=spawnSync(process.execPath,[script,root,'--apply'],{encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,new RegExp({version:'Canvas package changed',layout:'musl package layout changed',loader:'Canvas libc loader changed'}[mode]));
    assert.equal(readFileSync(musl,'utf8'),'musl-sentinel');
    assert.equal(readFileSync(join(base,'canvas-linux-x64-gnu','skia.linux-x64-gnu.node'),'utf8'),'gnu-sentinel');
    console.log(`PASS ${mode} mismatch: refused --apply; GNU/musl untouched`);passes++;
  }
  for(const args of [[],[join(dir,'missing'),'--invalid']]) {
    const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,/Usage:/);passes++;
  }
  console.log(`PASS ${passes} isolated real-script rejection checks; node=${process.version}; glibc=${process.report.getReport().header.glibcVersionRuntime}`);
} finally {rmSync(dir,{recursive:true,force:true});}
NODE
nl -ba scripts/prune-glibc-canvas-runtime.mjs | sed -n '20,70p'; nl -ba server/scripts/check-packaged-startup.mjs | sed -n '7,42p'; git status --short
```

结果：退出 0，五项断言检查通过。

```text
PASS version mismatch: refused --apply; GNU/musl untouched
PASS layout mismatch: refused --apply; GNU/musl untouched
PASS loader mismatch: refused --apply; GNU/musl untouched
PASS 5 isolated real-script rejection checks; node=v24.19.0; glibc=2.41
```

三个 `--apply` 子进程均退出 1，错误匹配预期拒绝原因，GNU 和 musl 哨兵内容不变。临时夹具由 finally 清理。状态仍仅有原来的 ` M AGENTS.md`。

工具输出时长：外层 1.1 秒；子命令 0.359900926 秒。

## 6. 核对平台、PDF 产品消费者及文档证据边界

实际命令：

```bash
rg -n -C 3 'lingxiloop-server.Dockerfile|platforms:|linux/amd64|check-packaged-startup|extractDocumentText|triangle-reference.pdf' .github/workflows server/src/__tests__/attachments.test.ts server/src/agent-runtime/attachments.ts server/src/modules/research/index.ts server/src/modules/learning/homework-effects.ts; nl -ba server/docker/lingxiloop-server.Dockerfile | sed -n '25,49p'; nl -ba docs/evidence/issue-229-canvas-trim/README.md | sed -n '23,38p'
```

结果：综合命令退出 0，但 rg 报告指定的 `server/src/__tests__/attachments.test.ts` 不存在；未运行该测试，也不将其视为通过。其余读取成功，CI 平台为 linux/amd64，三个 PDF 消费者仍调用正式运行时。文档明确历史镜像仅作原生库替代验证，未构建此候选完整镜像；文档还记录旧本地依赖 3.5.2 导致此前源码检查 8 pass、1 fail，要求精确分支干净依赖 CI。本次不将历史文档的测试声明当作新运行结果。

工具输出时长：外层 1.2 秒；子命令 0.356621493 秒。

## 最终判断和剩余限制

建议：实现层面满足任务，可保留候选；正式验收应等待固定提交的完整镜像构建及真实 PDF 回归。本次没有发现明确的功能缺陷，不能据此宣称最终镜像已经验证。

1. 新脚本先检查 Linux/x64/glibc、版本、布局和三个哈希，只删除 musl `.node` 文件。生产依赖阶段接线完整，dockerignore 已放行脚本，GNU 绑定和许可证保留。
2. 最终包检查要求 musl 文件不存在、GNU 和许可证存在，并实际绘制 PNG、核对加载 GNU 原生模块。PDF.js 资源检查及产品正式运行时调用保留。
3. 当前目录无依赖，执行器为 Node 24.19.0／glibc 2.41，而目标为 Node 22 Bookworm。因此未运行成功删除、真实 Canvas 加载、完整 packaged startup、正式运行时 PDF 提取，也未实测三个硬编码哈希。
4. 文档记录的历史 Canvas/PDF 对比不能代替固定候选最终镜像的验证。本次未复现其测试。建议在该提交构建的镜像内用 `extractDocumentText` 处理固定 PDF，比对裁剪前后结果；最终检查目前仅覆盖 PNG 和 PDF 资源存在性。
5. 版本、平台或包布局变化会主动阻断构建，需要重新审计。实际 OCI／完整镜像节省字节尚未验证。

未完成验证的原因是依赖缺失和此次禁止安装的任务范围，没有权限拒绝、待审批或结果不确定的外部操作。未读取兄弟目录、新于快照的代码或其他 agent 输出。未调用其他 agent。证据整理阶段不重跑验证，只写本文件。
