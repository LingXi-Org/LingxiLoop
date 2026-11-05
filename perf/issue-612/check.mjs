const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const base = process.env.ORIGIN ?? "http://127.0.0.1:4291", out = process.env.RESULTS_DIR ?? ".codex-tmp/issue-612/regression", project = process.env.PERF_PROJECT_DIR ?? ".codex-tmp/issue-612/original/project";
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
await mkdir(out, { recursive: true });
const { createHash } = await import("node:crypto");
const expected = { "canvas.json": "9ea199d03f506b9528681361118e5b9cd0e34ba2c7bceb5dc6d999ae7a5c84e3", "Roadmap.dc.html": "5260ac66ada5f34423a7bfddf313a33f2d9d2c29c090c61275ed5c78bf34bfdb" };
for (const [file, hash] of Object.entries(expected)) assert.equal(createHash("sha256").update(await readFile(project + "/" + file)).digest("hex"), hash);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1215 } });
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
const report = [];
const api = async (path, data2) => {
  const r = await fetch(base + path, data2 ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data2) } : void 0);
  assert.equal(r.status, 200);
  return r.json();
};
const wait = async (f) => {
  let last;
  for (let i = 0; i < 150; i++) {
    try {
      last = await f();
      if (last) return last;
    } catch {
    }
    await page.waitForTimeout(100);
  }
  throw Error("timeout " + String(last));
};
const guest = () => page.frames().find((f) => f.url() === "about:srcdoc");
const editor = () => page.frames().find((f) => f.url().includes("/artifact-editor/design/"));
const data = async () => guest().evaluate(() => ({ inner: { w: innerWidth, h: innerHeight }, scroll: { w: document.scrollingElement.clientWidth, sw: document.scrollingElement.scrollWidth, h: document.scrollingElement.clientHeight, sh: document.scrollingElement.scrollHeight }, rootHeight: document.querySelector(".sc-host > [data-dc-tpl]")?.getBoundingClientRect().height, font: getComputedStyle(document.querySelector("h1")).fontSize, math: document.querySelectorAll(".katex").length, mathFonts: document.fonts.status, overflow: getComputedStyle(document.documentElement).overflow, bodyOverflow: getComputedStyle(document.body).overflow }));
const saved = async () => {
  const docs2 = await api("/__fixture/documents");
  return Object.values(docs2)[0];
};
const geometry = async () => JSON.parse((await saved())["project/canvas.json"]);
await api("/__fixture/reset", {});
await page.goto(base);
await page.click("#open");
await wait(async () => {
  const d2 = await data();
  return d2.math === 2 && d2.mathFonts === "loaded" && (process.argv.includes("--baseline") || d2.inner.h >= 1700);
});
if (process.argv.includes("--baseline")) {
  const before = await data();
  assert(before.scroll.sh > before.scroll.h);
  await page.screenshot({ path: out + "/before.png" });
  await writeFile(out + "/before.json", JSON.stringify({ browser: browser.version(), sourceHashes: expected, measurement: before }, null, 2));
  await browser.close();
  process.exit(0);
}
report.push({ case: "raw-original", ...await data() });
assert.equal((await saved())["project/Roadmap.dc.html"], await readFile(project + "/Roadmap.dc.html", "utf8"));
const firstGuest = guest();
await page.evaluate(() => window.keptFrame = document.querySelector("[data-artifact-editor] iframe"));
await page.click("#close");
await page.click("#open");
assert(await page.evaluate(() => window.keptFrame === document.querySelector("[data-artifact-editor] iframe")));
assert.equal(guest(), firstGuest);
report.push({ case: "retained-reopen", ...await data() });
await page.setViewportSize({ width: 768, height: 1215 });
await page.waitForTimeout(600);
let d = await data();
assert.equal(d.scroll.sh, d.scroll.h);
assert.equal(d.scroll.sw, d.scroll.w);
report.push({ case: "narrow-768", ...d });
await page.setViewportSize({ width: 1800, height: 1215 });
await page.waitForTimeout(400);
await guest().evaluate(() => {
  const p = document.createElement("p");
  p.id = "async-append";
  p.textContent = "Async content ".repeat(600);
  document.querySelector(".sc-host > [data-dc-tpl]").append(p);
});
await wait(async () => {
  const d2 = await data();
  return d2.inner.h > 1850 && d2.scroll.sh === d2.scroll.h;
});
report.push({ case: "async-content-growth", ...await data() });
await guest().locator("#async-append").evaluate((e) => e.remove());
await wait(async () => {
  const d2 = await data();
  return d2.inner.h < 1800 && d2.scroll.sh === d2.scroll.h;
});
report.push({ case: "async-content-removal", ...await data() });
await wait(async () => {
  try {
    await guest().locator("h1").dblclick({ timeout: 900 });
    return await guest().locator("h1[contenteditable=true]").count() === 1;
  } catch {
    return false;
  }
});
await guest().locator("h1[contenteditable=true]").fill("Edited flow page title");
await page.keyboard.press("Escape");
await wait(async () => (await saved())["project/Roadmap.dc.html"].includes("Edited flow page title"));
report.push({ case: "real-text-edit-saved", geometry: (await geometry()).boards });
await page.reload();
await page.click("#open");
await wait(async () => await guest()?.locator("h1").textContent() === "Edited flow page title");
await wait(async () => {
  const d2 = await data();
  return d2.scroll.sh === d2.scroll.h;
});
report.push({ case: "saved-refresh", ...await data() });
await editor().locator("[data-mega-chrome=expand]").first().click({ force: true });
await page.waitForTimeout(500);
d = await data();
assert.equal(d.scroll.sh, d.scroll.h);
report.push({ case: "full-window", ...d });
await editor().getByRole("button", { name: "返回画布", exact: true }).click();
await page.waitForTimeout(400);
await page.click("#switch");
await page.click("#open");
await wait(async () => {
  const d2 = await data();
  return d2.math === 2 && d2.scroll.sh === d2.scroll.h;
});
assert.notEqual(await guest().locator("h1").textContent(), "Edited flow page title");
report.push({ case: "conversation-isolation", passed: true });
await page.screenshot({ path: out + "/original-final.png" });
const original = JSON.parse(await readFile(project + "/canvas.json", "utf8"));
original.boards["Neighbor.dc.html"] = { x: 0, y: 1300, w: 400, h: 200, title: "Independent neighbor" };
original.order.push("Neighbor.dc.html");
original.notes = { arrow: { kind: "arrow", x: 0, y: 1260, x2: 200, y2: 1280 } };
const fixed = '<!doctype html><html><head><script src="./support.js"><\/script></head><body><x-dc><div style="width:400px;height:200px"><h1>Fixed neighbor</h1></div></x-dc><script type="text/x-dc" data-dc-script>class Component extends DCLogic{renderVals(){return {}}}<\/script></body></html>';
await api("/__fixture/content", { files: { "project/canvas.json": JSON.stringify(original), "project/Neighbor.dc.html": fixed } });
const second = await browser.newPage({ viewport: { width: 1800, height: 1215 } });
await second.route("**/api/artifacts/board-a/editor-grant", (route) => route.continue({ url: base + "/api/artifacts/board-multi/editor-grant" }));
await second.goto(base);
await second.click("#open");
await wait(async () => {
  const docs2 = await api("/__fixture/documents");
  const all = Object.values(docs2).map((d2) => JSON.parse(d2["project/canvas.json"]));
  return all.find((g) => g.boards["Neighbor.dc.html"] && g.boards["Roadmap.dc.html"].h > 1600);
});
const docs = await api("/__fixture/documents");
const multi = Object.values(docs).map((d2) => JSON.parse(d2["project/canvas.json"])).find((g) => g.boards["Neighbor.dc.html"]);
const delta = multi.boards["Roadmap.dc.html"].h - 1180;
assert(delta > 0);
assert.equal(multi.boards["Neighbor.dc.html"].y, 1300 + delta);
assert.equal(multi.notes.arrow.y, 1260 + delta);
assert.equal(multi.notes.arrow.y2, 1280 + delta);
assert.equal(multi.boards["Neighbor.dc.html"].h, 200);
report.push({ case: "neighbor-and-arrow-model-reflow", delta, geometry: multi.boards, arrow: multi.notes.arrow });
await second.screenshot({ path: out + "/multi-original.png" });
const controlSource = await readFile("perf/issue-612/flow.dc.html", "utf8");
const controlCanvas = { v: 3, title: "Public flow control", launch: { view: "canvas" }, boards: { "Flow.dc.html": { x: 0, y: 0, w: 640, h: 240 } }, order: ["Flow.dc.html"], notes: {}, pages: [], designSystems: [] };
await api("/__fixture/content", { replaceFiles: true, files: { "project/canvas.json": JSON.stringify(controlCanvas), "project/Flow.dc.html": controlSource } });
const control = await browser.newPage({ viewport: { width: 1400, height: 1e3 } });
await control.route("**/api/artifacts/board-a/editor-grant", (route) => route.continue({ url: base + "/api/artifacts/board-control/editor-grant" }));
await control.goto(base);
await control.click("#open");
await wait(async () => {
  const docs2 = await api("/__fixture/documents");
  const g = docs2["board-control"] && JSON.parse(docs2["board-control"]["project/canvas.json"]);
  return g?.boards["Flow.dc.html"].h > 600;
});
let controlGuest = control.frames().find((f) => f.url() === "about:srcdoc");
const types = await controlGuest.evaluate(() => ({ text: document.querySelectorAll("p").length, images: document.querySelector("img").complete && document.querySelector("img").naturalWidth, code: document.querySelectorAll("pre").length, table: document.querySelectorAll("table").length, math: document.querySelectorAll(".katex").length, height: innerHeight, content: document.scrollingElement.scrollHeight }));
assert(types.images && types.text && types.code && types.table && types.math === 2);
assert.equal(types.height, types.content);
report.push({ case: "public-block-types", ...types });
await control.screenshot({ path: out + "/public-control-after.png" });
await control.setViewportSize({ width: 390, height: 1e3 });
await control.waitForTimeout(400);
assert.equal(await controlGuest.evaluate(() => document.scrollingElement.scrollHeight), types.height);
await control.screenshot({ path: out + "/public-control-narrow.png" });
const controlEditor = control.frames().find(f => f.url().includes('/artifact-editor/design/'));
const beforePan = await controlEditor.locator('[data-mega-world]').getAttribute('style');
await control.mouse.move(15, 650); await control.mouse.wheel(150, 600); await control.waitForTimeout(450);
const afterPan = await controlEditor.locator('[data-mega-world]').getAttribute('style');
assert.notEqual(afterPan,beforePan);
const endBox = await controlGuest.locator('p').last().boundingBox();
assert(endBox && endBox.y < 1000 && endBox.y + endBox.height > 150);
assert.equal(await controlGuest.evaluate(()=>document.scrollingElement.scrollTop),0);
report.push({case:'outer-canvas-reading-pan',endVisible:true,guestScrollTop:0});
await control.screenshot({path:out+'/public-control-bottom.png'});


let multiGuest;
for (const frame of second.frames()) {
  try { if (await frame.evaluate(()=>window.__dcRootPath === 'Roadmap.dc.html')) multiGuest = frame; } catch {}
}
assert(multiGuest);
const append = () => { const p = document.createElement('p'); p.id='repeat-flow'; p.textContent='Growing content '.repeat(600); document.querySelector('.sc-host > [data-dc-tpl]').append(p); };
const multiGeometry = async () => JSON.parse((await api('/__fixture/documents'))['board-multi']['project/canvas.json']);
await multiGuest.evaluate(append);
await wait(async () => (await multiGeometry()).boards['Roadmap.dc.html'].h > 1900);
const firstExpansion = await multiGeometry();
await multiGuest.locator('#repeat-flow').evaluate(e => e.remove());
await wait(async () => (await multiGeometry()).boards['Roadmap.dc.html'].h < 1800);
await multiGuest.evaluate(append);
await wait(async () => (await multiGeometry()).boards['Roadmap.dc.html'].h > 1900);
const secondExpansion = await multiGeometry();
assert.equal(secondExpansion.boards['Neighbor.dc.html'].y,firstExpansion.boards['Neighbor.dc.html'].y);
assert.equal(secondExpansion.notes.arrow.y,firstExpansion.notes.arrow.y);
report.push({case:'repeated-async-content-no-row-drift',neighborY:firstExpansion.boards['Neighbor.dc.html'].y,repeatNeighborY:secondExpansion.boards['Neighbor.dc.html'].y});
assert.deepEqual(failures, []);
await writeFile(out + "/results.json", JSON.stringify({ browser: browser.version(), sourceHashes: expected, scope: "Original hash-verified files in a synthetic authenticated API fixture. No production artwork writes.", failures, report }, (key, value) => key === "title" ? void 0 : value, 2));
console.log(JSON.stringify(report));
await browser.close();
