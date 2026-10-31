#!/usr/bin/env node
/**
 * CLI: node bin/suggest.js "personality quiz" [limit]
 * Deterministic retrieval from V1.4 + Hainan 115 + confirmed stories. No LLM.
 */
import { createContentService } from '../src/content/service.js';

const args = process.argv.slice(2);
let limit = 3;
const last = args[args.length - 1];
if (last && /^\d+$/.test(last)) {
  limit = Number(last);
  args.pop();
}

const query = args.join(' ').trim();
if (!query) {
  console.error('用法：node bin/suggest.js "<英文或中文话题>" [1-3]');
  process.exitCode = 1;
} else {
  const service = createContentService();
  const result = service.suggest(query, limit);
  console.log(JSON.stringify({ info: service.info(), ...result }, null, 2));
}
