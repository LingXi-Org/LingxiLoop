#!/usr/bin/env python3
"""Reproduce timing and cost attribution from metadata; never load secret configuration."""
import collections
import hashlib
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
mode, filename, provenance_file = sys.argv[1:]
capture = json.loads(Path(filename).read_text())
provenance = json.loads(Path(provenance_file).read_text())
protocol = json.loads((ROOT / 'protocol.json').read_text())
score = json.loads(subprocess.check_output([sys.executable, str(ROOT / 'compare.py'), 'score', filename]))

def quantiles(values):
    values = sorted(values)
    return {key: values[math.ceil(len(values) * ratio) - 1] if values else None
            for key, ratio in [('p50', .5), ('p95', .95)]}

def request_union(row):
    spans = sorted((max(0, d['startOffsetMs']), min(row['latencyMs'], d['startOffsetMs'] + d['elapsedMs']))
                   for d in row['requestDiagnostics'] if 'elapsedMs' in d and d['startOffsetMs'] < row['latencyMs'])
    total, end = 0, 0
    for start, stop in spans:
        total += max(0, stop - max(start, end))
        end = max(end, stop)
    return total

out = {'protocolSha256': capture['protocolSha256'], 'mode': capture['mode'], 'metrics': score['metrics'], 'diagnostics': {}}
for runtime in capture['runtimes']:
    rows = [r for r in capture['rows'] if r['runtime'] == runtime]
    samples = [s for s in score['samples'] if s['runtime'] == runtime]
    requests = [d for row in rows for d in row['requestDiagnostics']]
    usages = [u for row in rows for u in row['providerUsage']]
    known = [u for u in usages if u is not None]
    ledger = [d for row in rows for d in row['modelDiagnostics']]
    timings = [d['timing'] for d in ledger if d.get('timing')]
    tokens = {part: sum(u[part] for u in known) for part in protocol['pricesCnyPerMillion']}
    elapsed = sum(r['latencyMs'] for r in rows)
    union = sum(request_union(r) for r in rows)
    incorrect = [s for s in samples if not s['passed']]
    out['diagnostics'][runtime] = {
        'requests': len(usages), 'knownRequests': len(known), 'knownTokens': tokens,
        'knownCostCny': sum(tokens[k] * protocol['pricesCnyPerMillion'][k] for k in tokens) / 1e6,
        'samePayloadAdditionalRequests': sum(sum(n - 1 for n in collections.Counter(d['requestSha256'] for d in r['requestDiagnostics']).values()) for r in rows),
        'meanInitialSystemBytes': statistics.mean(r['requestDiagnostics'][0]['messageBytesByRole'].get('system', 0) for r in rows),
        'meanInitialUserBytes': statistics.mean(r['requestDiagnostics'][0]['messageBytesByRole'].get('user', 0) for r in rows),
        'requestTimingMs': {field: quantiles([r[field] for r in requests if field in r])
                            for field in ['headersMs', 'firstByteMs', 'firstContentMs', 'elapsedMs']},
        'totalLatencyMs': elapsed, 'requestUnionMs': union,
        'requestUnionShare': union / elapsed if elapsed else None,
        'outsideRequestIntervalsMs': elapsed - union,
        'ledgerAttemptCount': len(ledger),
        'ledgerRetries': sum((d.get('attempt') or 1) > 1 for d in ledger),
        'ledgerFailures': dict(collections.Counter(d['failure']['category'] for d in ledger if d.get('failure'))),
        'modelPermitWaitMs': sum(t.get('modelPermitWaitMs', 0) for t in timings),
        'outputCallbackWaitMs': sum(t.get('outputCallbackWaitMs', 0) for t in timings),
        'completedStreamCleanupErrors': sum(d.get('error') == 'AbortError' and d.get('doneMarkerMs') is not None and d.get('usagePresent') is True for d in requests),
        'gatewayErrors': dict(collections.Counter(e for r in rows for e in r['gatewayFailures'])),
        'failedSamples': [{'task':s['task'], 'repeat':s['repeat'], 'status':s['status']} for s in incorrect],
        'longTailSamples': [{
            'task':r['task'], 'repeat':r['repeat'], 'latencyMs':r['latencyMs'],
            'requestUnionMs':request_union(r), 'requests':len(r['providerUsage']),
            'maxFirstContentMs':max((d.get('firstContentMs', 0) for d in r['requestDiagnostics']), default=0),
            'failures':[d['failure'] for d in r['modelDiagnostics'] if d.get('failure')],
        } for r in sorted(rows, key=lambda r:r['latencyMs'], reverse=True)[:5]],
    }

if mode == 'json':
    print(json.dumps(out, indent=2, ensure_ascii=False))
    raise SystemExit
assert mode == 'report'
assert capture['mode'] == 'live', 'Do not label substitute observations as real-model evidence'
print('# LingxiOS 修复候选与同期基线对照\n')
print(f"运行：[Actions {provenance['actionsRunId']}](https://github.com/LingXi-Org/LingxiLoop/actions/runs/{provenance['actionsRunId']})；评估提交 `{provenance['evaluationCommit']}`。\n")
print('模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。\n')
print(subprocess.check_output([sys.executable, str(ROOT / 'compare.py'), 'report', filename], text=True).split('\n', 2)[2])
print('## 用量和成本归因\n')
print('| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |\n| --- | ---: | ---: | ---: |')
keys = list(out['diagnostics'])
ds = list(out['diagnostics'].values())
for label, values in [
    ('请求数', [d['requests'] for d in ds]),
    ('有用量的请求', [f"{d['knownRequests']}/{d['requests']}" for d in ds]),
    ('输入 token（已知，含缓存）', [d['knownTokens']['cacheHit'] + d['knownTokens']['cacheMiss'] for d in ds]),
    ('缓存命中 token', [d['knownTokens']['cacheHit'] for d in ds]),
    ('输出 token（已知）', [d['knownTokens']['output'] for d in ds]),
    ('已知请求归一化成本 CNY', [f"{'≥' if d['knownRequests'] < d['requests'] else ''}{d['knownCostCny']:.6f}" for d in ds]),
    ('首请求平均 system 字节', [f"{d['meanInitialSystemBytes']:.1f}" for d in ds]),
    ('首请求平均 user 字节', [f"{d['meanInitialUserBytes']:.1f}" for d in ds]),
    ('相同请求体的额外发送', [d['samePayloadAdditionalRequests'] for d in ds]),
]:
    print('| ' + label + ' | ' + ' | '.join(map(str, values)) + ' |')
print('\n成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。\n')
print('## 长尾延迟诊断\n')
for runtime, d in out['diagnostics'].items():
    first = d['requestTimingMs']['firstContentMs']; headers = d['requestTimingMs']['headersMs']
    print(f"- **{runtime}**：样本总耗时 {d['totalLatencyMs']/1000:.3f} 秒；模型请求区间并集占 {d['requestUnionShare']:.1%}，区间外共 {d['outsideRequestIntervalsMs']/1000:.3f} 秒。")
    print(f"  单请求响应头 p50/p95：{headers['p50']:.1f}/{headers['p95']:.1f} ms；首次内容 p50/p95：{first['p50']:.1f}/{first['p95']:.1f} ms。")
    print(f"  原生 ledger 重试 {d['ledgerRetries']} 次，失败分类 `{d['ledgerFailures']}`；网关异常 `{d['gatewayErrors']}`。")
    print(f"  其中已收到结束标记及完整用量后的连接收尾 AbortError：{d['completedStreamCleanupErrors']} 次；不计为模型失败。")
    print(f"  原生模型配额等待累计 {d['modelPermitWaitMs']:.1f} ms，输出回调等待累计 {d['outputCallbackWaitMs']:.1f} ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。")
print('\n请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。\n')
print('| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |\n| --- | --- | ---: | ---: | ---: | --- |')
for runtime, d in out['diagnostics'].items():
    for r in d['longTailSamples']:
        failure = ', '.join(f.get('category', 'unknown') for f in r['failures']) or '—'
        print(f"| {runtime} | {r['task']} #{r['repeat']} | {r['latencyMs']} | {r['requestUnionMs']:.1f} | {r['requests']} | {failure} |")
print('\n## 逐任务结果\n')
print('| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |\n| --- | ---: | ---: | ---: |')
for task in dict.fromkeys(s['task'] for s in score['samples']):
    counts = [sum(s['passed'] for s in score['samples'] if s['task'] == task and s['runtime'] == runtime) for runtime in keys]
    print('| ' + task + ' | ' + ' | '.join(f'{n}/3' for n in counts) + ' |')
print('\n未通过样本：\n')
for runtime, d in out['diagnostics'].items():
    print(f"- {runtime}：" + ('；'.join(f"{r['task']} #{r['repeat']} ({r['status']})" for r in d['failedSamples']) or '无') + '。')
print('\n## 修复与复现\n')
print('`lingxios.patch` 修改通用执行提示词和当前请求的呈现：动作前检查禁止条件与条件分支；精简重复规则并将运行时授权明确为完整 allowlist，能力从目录与授权判断，不通过读取内容探测缺失的写权限；回执和 verifier 不替代显式写后读回。当前人类请求以带来源的原文 user 消息呈现，其他信任级别仍保留数据封装。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。')
print(f"\n原始采集 SHA-256：`{hashlib.sha256(Path(filename).read_bytes()).hexdigest()}`。协议摘要：`{capture['protocolSha256']}`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。\n")
round_path = 'results/' + Path(filename).parent.name
print(f'```sh\npython3 {round_path}/source/compare.py score {round_path}/live.json\npython3 {round_path}/source/diagnose.py json {round_path}/live.json {round_path}/provenance.json\npython3 {round_path}/source/diagnose.py report {round_path}/live.json {round_path}/provenance.json\n```\n')
print('结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。')
