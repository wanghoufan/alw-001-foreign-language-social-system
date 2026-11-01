import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const live=fs.readFileSync(path.join(root,'socialmate-prototype/ai-gateway/live-server.mjs'),'utf8');
const control=fs.readFileSync(path.join(root,'socialmate-v1.2/service-v040.sh'),'utf8');
test('combined service refuses disabled TLS validation even when supplied by Node env files',()=>{
  assert.match(live,/process\.env\.NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(live,/process\.exit\(78\)/);
  assert.match(live,/await import\("\.\/live-asr-hub\.mjs"\)/);
  assert.match(live,/await import\("\.\.\/\.\.\/android-poc\/asr-bridge\/src\/server\.js"\)/);
  assert.ok(live.indexOf('process.env.NODE_TLS_REJECT_UNAUTHORIZED') < live.indexOf('await import('), 'guard precedes application module evaluation');
});
test('shell start strips unsafe inherited TLS override and keeps verification on',()=>{
  assert.match(control,/NODE_TLS_REJECT_UNAUTHORIZED:-/);
  assert.match(control,/unset NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.doesNotMatch(control,/NODE_TLS_REJECT_UNAUTHORIZED=1/);
});
