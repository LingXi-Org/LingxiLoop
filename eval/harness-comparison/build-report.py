#!/usr/bin/env python3
"""Render a reproducible interpretation without changing the frozen scorer."""
import hashlib
import json
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
capture_path = Path(sys.argv[1]).resolve()
provenance_path = Path(sys.argv[2]).resolve()
capture = json.loads(capture_path.read_text())
provenance = json.loads(provenance_path.read_text())
assert capture['mode'] == 'live', 'A final report requires real-model observations'
scored = json.loads(subprocess.check_output([
    sys.executable, str(ROOT / 'compare.py'), 'score', str(capture_path)], text=True))
summary = subprocess.check_output([
    sys.executable, str(ROOT / 'compare.py'), 'report', str(capture_path)], text=True)
samples = scored['samples']
runtimes = list(scored['metrics'])
print(summary)
prices = json.loads((ROOT / 'protocol.json').read_text())['pricesCnyPerMillion']
known_costs = {}
for runtime in runtimes:
    usages = [usage for row in capture['rows'] if row['runtime'] == runtime for usage in row['providerUsage']]
    known_costs[runtime] = sum(sum(prices[key] * usage[key] for key in prices) / 1_000_000
                               for usage in usages if usage is not None)
print('已知请求的归一化成本（包含用量不完整样本中的已知请求）：\n')
for runtime in runtimes:
    usages = [usage for row in capture['rows'] if row['runtime'] == runtime for usage in row['providerUsage']]
    missing = sum(usage is None for usage in usages)
    qualifier = f'；{missing} 次请求用量缺失，此值仅为下界' if missing else '；请求用量完整'
    print(f'- {runtime}：**¥{known_costs[runtime]:.6f}**{qualifier}。')
print('\n表中的成本覆盖率按完整样本统计，上述补充按请求统计，两者分母不同。\n')
print('## 执行来源与复现\n')
run_id = provenance.get('actionsRunId')
print(f"- 运行：[GitHub Actions {run_id}](https://github.com/LingXi-Org/LingxiLoop/actions/runs/{run_id})。")
print(f"- 评估提交：`{provenance.get('evaluationCommit')}`；版本预检时间：`{provenance['checkedAt']}`。")
print(f"- 生产提交：`{provenance['productionCommit']}`；LingxiOS `{provenance['runtimeVersion']}`；DeepSeek Harness `0.2.2-rc.3`。")
print(f"- 执行平台：`{provenance['platform']}/{provenance['architecture']}`，Node `{provenance['node']}`；独立 PostgreSQL 16.13。")
print(f"- 模型：`{capture['model']['id']}`；路由：`{capture['model']['baseUrl']}`。")
print(f"- 原始采集 SHA-256：`{hashlib.sha256(capture_path.read_bytes()).hexdigest()}`。\n")
print('下载该运行的 `harness-comparison-*` 工件。评分器及采集代码使用上述评估提交；详细报告渲染器使用本目录的 `build-report.py`。')
print(f"渲染器 SHA-256：`{hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}`。复核命令：\n")
print('```sh\npython3 compare.py score live.json\npython3 compare.py report live.json\npython3 build-report.py live.json provenance.json\n```\n')
print('重新采集使用 README 的 Sigillo / Actions 入口；无需复制密钥。每次运行保存新文件，不覆盖旧样本。\n')
print('## 任务与配对结果\n')
print('| 任务 | LingxiOS 通过 | DeepSeek Harness 通过 |\n| --- | ---: | ---: |')
tasks = list(dict.fromkeys(row['task'] for row in samples))
for task in tasks:
    counts = [sum(row['passed'] for row in samples if row['task'] == task and row['runtime'] == runtime)
              for runtime in runtimes]
    print(f"| {task} | {counts[0]}/3 | {counts[1]}/3 |")
indexed = {(row['task'], row['repeat'], row['runtime']): row for row in samples}
pairs = [(indexed[task, repeat, runtimes[0]], indexed[task, repeat, runtimes[1]])
         for task in tasks for repeat in (1, 2, 3)]
both = sum(a['passed'] and b['passed'] for a, b in pairs)
only_a = sum(a['passed'] and not b['passed'] for a, b in pairs)
only_b = sum(b['passed'] and not a['passed'] for a, b in pairs)
neither = len(pairs) - both - only_a - only_b
delta = statistics.median(a['latencyMs'] - b['latencyMs'] for a, b in pairs)
print(f'\n36 对样本中：双方通过 {both} 对，仅 LingxiOS 通过 {only_a} 对，仅 DeepSeek Harness 通过 {only_b} 对，双方未通过 {neither} 对。')
print(f'配对延迟差（LingxiOS 减 DeepSeek Harness）的中位数为 {delta:.1f} ms；正数表示 LingxiOS 较慢。\n')
print('## 工具、用量与失败\n')
manifest = json.loads(subprocess.check_output([sys.executable, str(ROOT / 'compare.py'), 'manifest'], text=True))
oracles = {task['id']: task for task in manifest['tasks']}
correct_answers = sum(row['answer'].strip() == oracles[row['task']]['expectedAnswer'] for row in capture['rows'])
correct_states = sum(row['finalState'] == oracles[row['task']]['expectedState'] for row in capture['rows'])
print(f"最终回答与文档终态分别正确 {correct_answers}/72、{correct_states}/72；任务通过率还要求遵守工具调用约束。\n")
for runtime in runtimes:
    rows = [row for row in samples if row['runtime'] == runtime]
    captured = [row for row in capture['rows'] if row['runtime'] == runtime]
    attempts = sum(row['attempts'] for row in rows)
    correct = sum(row['correctCalls'] for row in rows)
    required = sum(row['requiredCalls'] for row in rows)
    requests = [usage for row in captured for usage in row['providerUsage']]
    known = [usage for usage in requests if usage is not None]
    tokens = {part: sum(usage[part] for usage in known) for part in ('cacheHit', 'cacheMiss', 'output')}
    failures = [f"{row['task']}#{row['repeat']} ({row['status']})" for row in rows if not row['passed']]
    print(f"- **{runtime}**：工具正确 {correct}/{attempts}，必要调用覆盖 {correct}/{required}；模型请求 {len(requests)}，用量已知 {len(known)}。")
    print(f"  已知 token：缓存命中 {tokens['cacheHit']}，未命中 {tokens['cacheMiss']}，输出 {tokens['output']}。终态计数：`{dict(Counter(row['status'] for row in rows))}`。")
    print('  未通过样本：' + ('；'.join(failures) if failures else '无') + '。')
    unnecessary_reads = sum(not row['passed'] and row['task'].startswith('read-only-') for row in rows)
    missing_readback = sum(not sample['passed'] and row['task'].startswith('edit-') and
                          row['finalState'] == oracles[row['task']]['expectedState'] and
                          row['toolAttempts'] == oracles[row['task']]['expectedCalls'][:-1]
                          for row, sample in zip(captured, rows))
    print(f'  失败归类：只读拒绝场景多余读取 {unnecessary_reads} 次，修改后漏做显式读回 {missing_readback} 次。')
gateway_failures = Counter(error for row in capture['rows'] for error in row['gatewayFailures'])
completed = sum(row['status'] == 'completed' for row in capture['rows'])
print(f'\n网关异常计数：`{dict(gateway_failures)}`；运行时完成 {completed}/72。AbortError 仅表示流被中断，不能单凭该标签推断服务故障或账单金额。缺失用量保留为 null，不通过补跑替换原始样本。')
print('\n## 解释边界\n')
print('这是生产发布的 LingxiOS 包与 DeepSeek Harness 的运行循环对照，使用相同的合成文档工具；没有接入生产业务数据库，也没有评估浏览器、终端、记忆、委派或真实业务全流程。')
print('12 个任务各重复 3 次，包括读取、修改与读回、可重现版本冲突、权限拒绝、直接回答。重复样本并非 36 个独立任务，结果仅说明该任务集合上的表现，不据此宣称全面优越或统计显著。')
print('任务通过要求正确终态、精确最终答案和必要工具调用；工具准确率另对名称、参数、结果和顺序评分，重复调用计入分母。超时与失败保留在通过率和延迟分母中。')
print('双方固定 temperature=0、关闭思考与并行调用、最多 1536 输出 token、每样本 90 秒及 8 次模型/工具预算，按配对交替先后顺序执行。网关统一模型可见的工具 schema，运行时原生提示词和循环行为仍然不同。')
print('延迟从运行时已初始化后的任务提交开始，到终态为止，包含模型与工具；不包含进程初始化、依赖安装和清理。p95 采用 nearest-rank，包含失败样本。供应商缓存和外部负载仍可能影响结果。')
print('成本按 [SiliconFlow 公开价格](https://www.siliconflow.cn/pricing) 的人民币常规时段价归一化：每百万缓存命中/未命中/输出 token 分别为 0.04/2/8 元。它不是账户账单；折扣、峰谷时段及未返回用量的请求可能导致差异。用量缺失时全量成本不报告为零。')
print('原方案选择官方 DeepSeek 接口，但既有 Sigillo 凭据实际属于 SiliconFlow。首次真实调用前已重新冻结 v2 协议；旧方案没有真实样本混入。供应商模型别名未暴露不可变权重版本，因此不能保证未来重跑使用完全相同的权重。')
