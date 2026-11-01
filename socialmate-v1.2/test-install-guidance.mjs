import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=fs.readFileSync(path.join(root,'socialmate-v1.2/install-phone-v040.sh'),'utf8');
test('post-install instructions match actual approved UI and consent model',()=>{
  assert.match(script,/Open SocialMate home and tap 开始实时对话/);
  assert.match(script,/separate in-chat cloud-AI consent/);
  assert.match(script,/Tap 停止录音 in the chat toolbar/);
  assert.doesNotMatch(script,/Tap 打开实时英文 ASR 实验页/);
  assert.doesNotMatch(script,/tap 连接并开始识别/);
});
test('installer still protects specific device and preserves application data',()=>{
  assert.match(script,/--serial/);
  assert.match(script,/install -r/);
  assert.doesNotMatch(script,/uninstall\s+app\.socialmate/);
});
