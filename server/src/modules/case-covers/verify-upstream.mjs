// One-action source qualification. No install, network, browser, or model calls.
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const vendor = new URL('./vendor/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', vendor), 'utf8'));
for (const [file, hash] of Object.entries(manifest.files)) {
  if (createHash('sha256').update(readFileSync(new URL(file, vendor))).digest('hex') !== hash) throw Error('source integrity');
}
const dir = mkdtempSync(join(tmpdir(), 'case-cover-audit-'));
try {
  for (const name of ['riffle', 'terrain']) {
    const figure = readFileSync(new URL(`skills/hairline-create/examples/${name}.js`, vendor), 'utf8');
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./upstream-runner.mjs', import.meta.url))], {
      input: JSON.stringify({ figure }), encoding: 'utf8', timeout: 6000, killSignal: 'SIGKILL', maxBuffer: 512000,
      cwd: dir, env: { PATH: dirname(process.execPath), TMPDIR: dir },
    });
    if (child.status !== 0) throw Error(`${name}: qualification subprocess failed`);
    const result = JSON.parse(child.stdout);
    if (result.problems.length || !result.html) throw Error(`${name}: ${result.problems.join(',')}`);
    console.log(JSON.stringify({ name, upstream: manifest.commit, fullTemplateValidated: true,
      htmlSha256: createHash('sha256').update(result.html).digest('hex'), browserExecuted: false }));
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
