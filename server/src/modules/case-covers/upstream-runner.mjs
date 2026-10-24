// Trusted bounded subprocess entrypoint. Never eval/import the model figure.
// Parent verifies the vendor hashes before launching this process.
import { assemble } from './vendor/skills/hairline-create/build.mjs';
import { validate } from './vendor/skills/hairline-create/validate.mjs';
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 90_000) process.exit(2);
}
const figure = JSON.parse(input).figure;
if (typeof figure !== 'string' || Buffer.byteLength(figure) > 65_536) process.exit(2);
const html = assemble(figure);
const problems = validate(html);
// Only fixed check identifiers cross the trust boundary; never parser source/error text.
process.stdout.write(JSON.stringify({ html: problems.length ? null : html,
  problems: problems.map(problem => problem.split(':')[0]).slice(0, 32) }));
