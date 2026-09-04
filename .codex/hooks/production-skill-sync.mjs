let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input.replace(/^\uFEFF/, ""));

if (!payload.stop_hook_active) {
  console.log(JSON.stringify({
    decision: "block",
    reason: "Before the final response, check whether this turn changed live production. If it did, update the applicable operate-openship-production references without secrets and validate that skill. If it did not, continue without changing it.",
  }));
}
