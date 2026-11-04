#!/usr/bin/env node
/**
 * T4-1 只读盘点：真实索引与「现在跑一次扫描会收录什么」的差集。
 *
 * 不写真实索引：把 index.json 复制到 os.tmpdir() 再扫描，最后只做 diff。
 * 用法：node t4-1-stale-diff.mjs
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const GW = path.join(ROOT, "socialmate-prototype", "ai-gateway");
const REAL_ROOT = path.join(ROOT, "SocialMate-Data", "LearningArchive");
const {createLearningArchive} = await import(pathToFileURL(path.join(GW, "learning-archive.mjs")).href);

const real = JSON.parse(await fs.readFile(path.join(REAL_ROOT, "index.json"), "utf8"));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "t41-diff-"));
await fs.copyFile(path.join(REAL_ROOT, "index.json"), path.join(tmp, "index.json"));
const store = createLearningArchive({root: tmp, projectRoot: ROOT});
const summary = await store.runScan();
const simulated = JSON.parse(await fs.readFile(path.join(tmp, "index.json"), "utf8"));

const realIds = new Set(real.materials.map((m) => m.materialId));
const fresh = simulated.materials.filter((m) => !realIds.has(m.materialId));

console.log(`== T4-1 stale-diff @ ${new Date().toISOString()}`);
console.log(`真实索引: ${real.materials.length} 条（updatedAt=${real.updatedAt}）`);
console.log(`模拟扫描: scanned=${summary.scanned} indexed=${summary.indexed} unchanged=${summary.unchanged} total=${summary.totalMaterials}`);
console.log(`真实索引里没有的条目: ${fresh.length} 条\n`);

const byKey = new Map();
const byType = new Map();
for (const m of fresh) {
  const key = String(m.originalPathRef).split(":")[0];
  byKey.set(key, (byKey.get(key) || 0) + 1);
  byType.set(m.sourceType, (byType.get(m.sourceType) || 0) + 1);
}
console.log("按来源根目录:", JSON.stringify(Object.fromEntries(byKey)));
console.log("按 sourceType:", JSON.stringify(Object.fromEntries(byType)));
console.log("\n明细:");
for (const m of fresh) {
  console.log(`  ${m.sourceType.padEnd(16)} v${m.version} ${m.originalPathRef}`);
}

// 反向检查：真实索引里有、但本次扫描没覆盖到的（文件被移走/改名）
const simIds = new Set(simulated.materials.map((m) => m.materialId));
const lost = real.materials.filter((m) => !simIds.has(m.materialId));
console.log(`\n真实索引有、本次扫描未再产出: ${lost.length} 条`);
for (const m of lost) console.log(`  ${m.sourceType} ${m.originalPathRef}`);

await fs.rm(tmp, {recursive: true, force: true});
