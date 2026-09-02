const baseUrl = process.env.UPTIME_KUMA_BASE_URL ?? "https://uptime.lingxilearn.cn";
const apiKey = process.env.UPTIME_KUMA_API_KEY;

function summarize(text) {
  const values = [...text.matchAll(/^monitor_status\{[^\n]*\}\s+([01](?:\.0+)?)$/gm)].map(
    (match) => Number(match[1]),
  );
  return { series: values.length, up: values.filter(Boolean).length, down: values.filter((value) => !value).length };
}

if (process.argv.includes("--self-test")) {
  const result = summarize('monitor_status{monitor_name="a"} 1\nmonitor_status{monitor_name="b"} 0\n');
  if (JSON.stringify(result) !== JSON.stringify({ series: 2, up: 1, down: 1 })) process.exit(1);
  console.log("self-test ok");
  process.exit(0);
}

if (!apiKey) throw new Error("UPTIME_KUMA_API_KEY is required");
const url = new URL("/metrics", baseUrl);
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("Refusing to send the API key over plaintext HTTP");
}

const response = await fetch(url, {
  headers: { Authorization: `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}` },
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`Uptime Kuma metrics returned HTTP ${response.status}`);
const summary = summarize(await response.text());
console.log(JSON.stringify({ baseUrl: url.origin, ...summary }));
if (!summary.series || summary.down) process.exitCode = 1;
