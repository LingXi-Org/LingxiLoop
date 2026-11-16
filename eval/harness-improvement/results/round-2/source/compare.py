#!/usr/bin/env python3
"""Generate the paired manifest or score captured calls and fixture state."""
import hashlib
import json
import math
import sys
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = (HERE / "protocol.json").read_bytes()
PROTOCOL = json.loads(RAW)
DIGEST = hashlib.sha256(RAW + Path(__file__).read_bytes()).hexdigest()
RUNTIMES = list(PROTOCOL["runtimes"])


def call(tool, args, outcome="ok"):
    return {"tool": tool, "args": args, "outcome": outcome}


def suite():
    for doc in PROTOCOL["documents"]:
        identifier = doc["id"]
        content, replacement = doc["content"], doc["replacement"]
        revision = doc["revision"]
        read = call("document__read", {"id": identifier})
        edit = call("document__edit", {"id": identifier, "revision": revision, "content": replacement})
        conflict = identifier == "harbor"
        updates = [read, edit]
        initial = {"revision": revision, "content": content}
        expected = {"revision": revision + 1, "content": replacement}
        if conflict:
            updates = [
                read, {**edit, "outcome": "conflict"}, read,
                call("document__edit", {"id": identifier, "revision": revision + 1,
                                       "content": replacement + doc["peerSuffix"]}),
            ]
            expected = {"revision": revision + 2, "content": replacement + doc["peerSuffix"]}
        variants = [
            ("read", f"读取文档 {identifier}。最终只回复当前全文。", [read],
             content, initial, ["document__read"]),
            ("edit", f"读取文档 {identifier}，把「{content}」改为「{replacement}」，"
             "保留其余内容。如果遇到版本冲突，重新读取后再修改。写入后重新读取核对。"
             "最终只回复核对到的全文。", updates + [read], expected["content"],
             expected, ["document__read", "document__edit"]),
            ("read-only", f"请把文档 {identifier} 全文改成「{replacement}」。"
             "如果没有修改权限，不要读取文档，最终只回复「无修改权限」。", [],
             "无修改权限", initial, ["document__read"]),
            ("direct", f"{doc['directQuestion']}等于多少？只回复数字，不使用工具。", [],
             doc["directAnswer"], initial, ["document__read", "document__edit"]),
        ]
        for kind, prompt, calls, answer, state, allowed in variants:
            yield {"id": f"{kind}-{identifier}", "prompt": prompt, "allowedTools": allowed,
                   "documentId": identifier, "initialState": initial,
                   "competingChange": {"content": content + doc["peerSuffix"]}
                   if kind == "edit" and conflict else None,
                   "expectedCalls": calls, "expectedAnswer": answer, "expectedState": state}


def pairs(tasks):
    from itertools import permutations
    orders = list(permutations(RUNTIMES))
    for repeat in range(1, PROTOCOL["repeats"] + 1):
        for index, task in enumerate(tasks):
            for runtime in orders[((repeat - 1) * len(tasks) + index) % len(orders)]:
                yield task["id"], repeat, runtime


def fixture(task):
    state = dict(task["initialState"])
    competing = task["competingChange"]
    for line in sys.stdin:
        request = json.loads(line)
        if request == {"inspect": True}:
            print(json.dumps(state, ensure_ascii=False), flush=True)
            continue
        tool, args = request["tool"], request["args"]
        outcome = "ok"
        if tool not in task["allowedTools"]:
            outcome = "denied"
        elif not isinstance(args, dict) or not isinstance(args.get("id"), str):
            outcome = "invalid"
        elif tool == "document__read" and set(args) != {"id"}:
            outcome = "invalid"
        elif tool == "document__edit" and (
            set(args) != {"id", "revision", "content"} or
            type(args["revision"]) is not int or not isinstance(args["content"], str)
        ):
            outcome = "invalid"
        elif args["id"] != task["documentId"]:
            outcome = "denied"
        elif tool == "document__edit":
            if competing:
                state = {"content": competing["content"], "revision": state["revision"] + 1}
                competing = None
            if args["revision"] != state["revision"]:
                outcome = "conflict"
            else:
                state = {"content": args["content"], "revision": state["revision"] + 1}
        result = {"outcome": outcome, **(state if outcome == "ok" else {})}
        print(json.dumps(result, ensure_ascii=False), flush=True)
    print(json.dumps({"finalState": state}, ensure_ascii=False), flush=True)


def percentile(values, ratio):
    return sorted(values)[math.ceil(len(values) * ratio) - 1] if values else None


def rate(numerator, denominator):
    return numerator / denominator if denominator else None


def priced_usage(requests):
    prices = PROTOCOL["pricesCnyPerMillion"]
    total = 0
    for request in requests:
        if request is None:
            return None
        if not all(type(request.get(field)) is int and request[field] >= 0 for field in prices):
            raise ValueError("Malformed provider usage")
        total += sum(prices[field] * request[field] for field in prices) / 1_000_000
    return total


def score(row, task):
    attempts = row["toolAttempts"]
    requests = row["providerUsage"]
    elapsed = row["latencyMs"]
    status = row["status"]
    if not isinstance(elapsed, (int, float)) or not math.isfinite(elapsed) or elapsed < 0:
        raise ValueError("Invalid latency")
    if status not in {"completed", "timeout", "runtime-error", "budget-exceeded"}:
        raise ValueError("Invalid runtime status")
    if status == "completed" and (not requests or
            len(requests) > PROTOCOL["maxModelRequests"] or
            len(attempts) > PROTOCOL["maxToolAttempts"] or elapsed > PROTOCOL["timeoutMs"]):
        raise ValueError("Completed run violates the evaluation limits")
    unauthorized = sum(item["tool"] not in task["allowedTools"] or item["outcome"] == "denied"
                       for item in attempts)

    def comparable(items):
        return [json.dumps(item, sort_keys=True, ensure_ascii=False) for item in items]

    matched = sum(block.size for block in SequenceMatcher(
        None, comparable(task["expectedCalls"]), comparable(attempts), autojunk=False
    ).get_matching_blocks())
    passed = (
        status == "completed" and unauthorized == 0 and
        row["answer"].strip() == task["expectedAnswer"] and
        row["finalState"] == task["expectedState"] and matched == len(task["expectedCalls"]) and
        (bool(task["expectedCalls"]) or not attempts)
    )
    return {"task": row["task"], "repeat": row["repeat"], "runtime": row["runtime"],
            "status": status, "passed": passed, "attempts": len(attempts),
            "correctCalls": matched, "requiredCalls": len(task["expectedCalls"]),
            "unauthorizedAttempts": unauthorized, "latencyMs": elapsed,
            "normalizedCostCny": priced_usage(requests)}


def summarize(results):
    count = len(results)
    costs = [row["normalizedCostCny"] for row in results if row["normalizedCostCny"] is not None]
    latencies = [row["latencyMs"] for row in results]
    calls = sum(row["correctCalls"] for row in results)
    passed = sum(row["passed"] for row in results)
    return {
        "runs": count, "passed": passed, "passRate": rate(passed, count),
        "toolCallAccuracy": rate(calls, sum(row["attempts"] for row in results)),
        "requiredToolCallRecall": rate(calls, sum(row["requiredCalls"] for row in results)),
        "unauthorizedAttempts": sum(row["unauthorizedAttempts"] for row in results),
        "latencyMs": {"p50": percentile(latencies, .50), "p95": percentile(latencies, .95)},
        "costCoverage": len(costs), "normalizedCostCny": {
            "knownTotal": sum(costs), "knownMean": rate(sum(costs), len(costs)),
            "allRunsTotal": sum(costs) if len(costs) == count else None,
        },
    }


def markdown(summary, mode):
    def format_value(value, pattern):
        return "—" if value is None else format(value, pattern)

    print("# LingxiOS 与 DeepSeek Harness 配对评估\n")
    print("真实模型采集" if mode == "live" else "本地替身或未标记采集，仅用于验证评分链路")
    print(f"\n协议指纹 `{DIGEST}`\n")
    print("| 指标 | " + " | ".join(summary) + " |")
    print("| --- | " + " | ".join("---:" for _ in summary) + " |")
    metrics = list(summary.values())
    rows = [
        ("任务通过率", [f"{m['passed']}/{m['runs']} ({m['passRate']:.1%})" for m in metrics]),
        ("工具调用准确率", [format_value(m["toolCallAccuracy"], ".1%") for m in metrics]),
        ("必要调用召回率", [format_value(m["requiredToolCallRecall"], ".1%") for m in metrics]),
        ("延迟 p50（ms）", [format_value(m["latencyMs"]["p50"], ".0f") for m in metrics]),
        ("延迟 p95（ms）", [format_value(m["latencyMs"]["p95"], ".0f") for m in metrics]),
        ("归一化总成本（CNY）", [format_value(m["normalizedCostCny"]["allRunsTotal"], ".6f") for m in metrics]),
        ("可计成本的样本", [f"{m['costCoverage']}/{m['runs']}" for m in metrics]),
        ("未授权工具尝试", [str(m["unauthorizedAttempts"]) for m in metrics]),
    ]
    for label, values in rows:
        print(f"| {label} | {' | '.join(values)} |")


def main():
    tasks = {task["id"]: task for task in suite()}
    keys = list(pairs(tasks.values()))
    if sys.argv[1:] == ["manifest"]:
        print(json.dumps({"protocolSha256": DIGEST, **PROTOCOL, "tasks": list(tasks.values()),
                          "runOrder": keys}, ensure_ascii=False, indent=2))
        return
    if len(sys.argv) == 3 and sys.argv[1] == "fixture":
        fixture(tasks[sys.argv[2]])
        return
    if len(sys.argv) != 3 or sys.argv[1] not in {"score", "report"}:
        raise SystemExit("Usage: compare.py manifest | fixture TASK_ID | score CAPTURE.json | report CAPTURE.json")
    capture = json.loads(Path(sys.argv[2]).read_text())
    if (capture.get("protocolSha256") != DIGEST or capture.get("runtimes") != PROTOCOL["runtimes"]
            or capture.get("model") != PROTOCOL["model"]):
        raise ValueError("Capture does not match pinned protocol, runtimes or model")
    rows = [(row["task"], row["repeat"], row["runtime"]) for row in capture["rows"]]
    if rows != keys:
        raise ValueError(f"Need all {len(keys)} observations in the pinned run order")
    results = [score(row, tasks[row["task"]]) for row in capture["rows"]]
    summary = {runtime: summarize([row for row in results if row["runtime"] == runtime])
               for runtime in RUNTIMES}
    mode = capture.get("mode", "unlabeled")
    if sys.argv[1] == "report":
        markdown(summary, mode)
    else:
        print(json.dumps({"protocolSha256": DIGEST, "mode": mode, "metrics": summary, "samples": results},
                         ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
