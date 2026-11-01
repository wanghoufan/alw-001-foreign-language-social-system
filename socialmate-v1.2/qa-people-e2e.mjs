/**
 * 多人档案端到端 QA（可重复运行，不触碰真实数据）。
 *
 * 做什么：
 * 1. 在临时目录里用 `SocialMate-Data/People/_template` 建 3 个虚构人物（含人工写过的条目）；
 * 2. 起一套隔离归档 + 网关（独立端口、独立令牌、独立 Profile/People/归档目录）；
 * 3. 写入 2 个虚构会话，走真实 HTTP 接口：本地复盘 → 确认写入 → 新建第 4 个人物 → 重复保存 → 越权/非法输入；
 * 4. 断言：只写目标人物、其它档案字节不变、权限 0600/0700、重复不新增、回滚不留空档案；
 * 5. 拆除进程并打印 PASS/FAIL 摘要。退出码 0=全过。
 *
 * 用法：node socialmate-v1.2/qa-people-e2e.mjs [--keep]
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GATEWAY = path.join(ROOT, "socialmate-prototype", "ai-gateway");
const TEMPLATE = path.join(ROOT, "SocialMate-Data", "People", "_template", "00-profile.md");

const ARCHIVE_PORT = Number(process.env.QA_ARCHIVE_PORT || 8789);
const GATEWAY_PORT = Number(process.env.QA_GATEWAY_PORT || 8799);
const TOKEN = crypto.randomBytes(24).toString("hex");
const KEEP = process.argv.includes("--keep");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => checks.push({name, ok: true}))
    .catch((error) => {
      checks.push({name, ok: false, error: error.message});
      throw error;
    });
}

async function waitFor(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    if (Date.now() > deadline) throw new Error("服务未就绪：" + url);
    await sleep(120);
  }
}

async function makePeople(root) {
  const template = await fs.readFile(TEMPLATE, "utf8");
  const people = {
    "Ann-Lee": {name: "Ann Lee", human: "- 人工写入：每周晨跑。", section: "# 兴趣"},
    "Bea-Santos": {name: "Bea Santos", human: "- 人工写入：在咖啡店工作。", section: "# 工作 / 学习"},
    "Cheng-Yu": {name: "Cheng Yu", human: "- 人工写入：喜欢海南菜。", section: "# 已确认偏好"},
  };
  await fs.mkdir(path.join(root, "_template"), {recursive: true});
  await fs.writeFile(path.join(root, "_template", "00-profile.md"), template, "utf8");
  for (const [slug, info] of Object.entries(people)) {
    const dir = path.join(root, slug);
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
    const body = template.replace(/^name:.*$/m, `name: ${info.name}`)
      .replace(info.section, `${info.section}\n\n${info.human}`);
    await fs.writeFile(path.join(dir, "00-profile.md"), body, {encoding: "utf8", mode: 0o600});
  }
  return Object.keys(people);
}

function seedSession(sessionId, texts) {
  const base = Date.parse("2026-11-01T12:00:00.000Z");
  return {
    sessionId,
    startedAt: new Date(base).toISOString(),
    endedAt: new Date(base + texts.length * 5000).toISOString(),
    appVersion: "0.5.4-qa-synthetic",
    consent: {recording: true, retention: true, cloudAi: false},
    revision: 1,
    segments: texts.map((text, index) => ({
      eventId: `e${index + 1}`,
      startMs: index * 5000,
      endMs: index * 5000 + 4200,
      receivedAt: new Date(base + index * 5000 + 4200).toISOString(),
      speakerId: `spk_${index % 3}`,
      track: "mix",
      provider: "synthetic",
      mock: true,
      final: true,
      textOriginal: text,
    })),
  };
}

async function main() {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "sm-people-qa-"));
  const dirs = {
    work,
    archive: path.join(work, "archive"),
    profile: path.join(work, "profile"),
    people: path.join(work, "people"),
  };
  for (const key of ["archive", "people"]) await fs.mkdir(dirs[key], {recursive: true, mode: 0o700});
  const slugs = await makePeople(dirs.people);
  const children = [];

  const cleanup = async () => {
    for (const child of children) child.kill();
    if (!KEEP) await fs.rm(work, {recursive: true, force: true});
  };

  try {
    children.push(spawn(process.execPath, ["archive-receiver.mjs"], {
      cwd: GATEWAY,
      env: {...process.env, SM_ARCHIVE_PORT: String(ARCHIVE_PORT), SM_ARCHIVE_TOKEN: TOKEN,
        SM_CONVERSATION_DIR: dirs.archive},
      stdio: "ignore",
    }));
    await waitFor(`http://127.0.0.1:${ARCHIVE_PORT}/health`);

    children.push(spawn(process.execPath, ["server.mjs"], {
      cwd: GATEWAY,
      env: {...process.env, SM_ARCHIVE_PORT: String(ARCHIVE_PORT), SOCIALMATE_AI_PORT: String(GATEWAY_PORT),
        SM_PROFILE_DIR: dirs.profile, SM_PEOPLE_DIR: dirs.people},
      stdio: "ignore",
    }));
    await waitFor(`http://127.0.0.1:${GATEWAY_PORT}/api/asr/status`);

    const sessionA = "sess_qa20261101T120000_multiA";
    const sessionB = "sess_qa20261101T121000_multiB";
    const post = (p, body) => fetch(`http://127.0.0.1:${ARCHIVE_PORT}${p}`, {
      method: "POST", headers: {"Content-Type": "application/json", "x-archive-token": TOKEN},
      body: JSON.stringify(body),
    });
    for (const [id, texts] of [
      [sessionA, ["I usually go hiking on Sunday mornings.", "I work at a small cafe near the sea.",
        "I love Hainan chicken rice."]],
      [sessionB, ["My sister lives in Sanya.", "I want to visit the volcano park next month."]],
    ]) {
      const res = await post("/api/archive/session", seedSession(id, texts));
      assert.ok([200, 201].includes(res.status), "归档写入失败（HTTP " + res.status + "）");
    }

    const api = (p, body) => fetch(`http://127.0.0.1:${GATEWAY_PORT}${p}`, {
      method: body ? "POST" : "GET",
      headers: {"Content-Type": "application/json", "x-archive-token": TOKEN},
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (res) => ({status: res.status, data: await res.json().catch(() => null)}));

    // 写入接口有 400ms 最小间隔的限流（单人防连点），QA 里按真实节奏间隔调用。
    const applyReview = async (body) => {
      await sleep(450);
      return api("/v12/api/review/apply", body);
    };

    const readPeople = async (slug) => fs.readFile(path.join(dirs.people, slug, "00-profile.md"), "utf8");
    const snapshot = async () => Object.fromEntries(await Promise.all(slugs.map(async (s) => [s, await readPeople(s)])));
    const before = await snapshot();

    await check("人物主档列表返回 3 个虚构人物", async () => {
      const {data} = await api("/v12/api/people");
      assert.deepEqual(data.people.map((p) => p.slug), slugs);
    });

    await check("复盘页含「新建人物」且不会把哨兵值 __new__ 当目录标识提交", async () => {
      const html = await (await fetch(`http://127.0.0.1:${GATEWAY_PORT}/v12/history`)).text();
      assert.ok(html.includes('value = "__new__"') || html.includes('"__new__"'), "缺少新建人物选项");
      assert.ok(html.includes("r.newSlug.value.trim()"), "提交时必须用用户填写的标识，而不是下拉哨兵值");
      assert.ok(!/peopleSlug:\s*r\.personSelect\.value/.test(html), "不能直接把 personSelect.value 当 peopleSlug");
    });

    await check("本地复盘 0 次外部请求", async () => {
      const {status, data} = await api("/v12/api/review", {sessionId: sessionA, mode: "local"});
      assert.ok(data?.review, `复盘接口返回异常：HTTP ${status} ${JSON.stringify(data)}`);
      assert.equal(data.review.aiUsed, false);
      assert.equal(data.review.stats.aiRequests, 0);
      assert.ok(data.review.items.length >= 3);
    });

    let applied;
    await check("三条事实分别写入三个人物", async () => {
      const res = await applyReview({
        confirm: true, sessionId: sessionA,
        items: [
          {kind: "person", peopleSlug: slugs[0], section: "interest", text: "She goes hiking on Sunday mornings.", segmentIndex: 0},
          {kind: "person", peopleSlug: slugs[1], section: "work", text: "She works at a small cafe near the sea.", segmentIndex: 1},
          {kind: "person", peopleSlug: slugs[2], section: "preference", text: "She loves Hainan chicken rice.", segmentIndex: 2},
          {kind: "self", text: "I usually go hiking on Sunday mornings.", segmentIndex: 0},
        ],
      });
      assert.equal(res.status, 200);
      applied = res.data;
      assert.equal(applied.people.added.length, 3);
      assert.equal(applied.added.stories, 1);
    });

    await check("每个档案只多出自己那一条，人工条目与 front matter 保留", async () => {
      const after = await snapshot();
      const expected = [
        ["She goes hiking on Sunday mornings.", "She works at a small cafe", "She loves Hainan chicken rice."],
        ["人工写入：每周晨跑。", "人工写入：在咖啡店工作。", "人工写入：喜欢海南菜。"],
      ];
      for (let i = 0; i < slugs.length; i += 1) {
        const text = after[slugs[i]];
        assert.ok(text.includes(expected[0][i]), `${slugs[i]} 缺少自己的事实`);
        assert.ok(text.includes(expected[1][i]), `${slugs[i]} 丢了人工条目`);
        for (let j = 0; j < expected[0].length; j += 1) {
          if (i !== j) assert.ok(!text.includes(expected[0][j]), `${slugs[i]} 混入了 ${slugs[j]} 的事实`);
        }
        assert.ok(text.startsWith(before[slugs[i]].slice(0, 40)), `${slugs[i]} front matter 被改动`);
      }
    });

    await check("权限：主档 0600、目录 0700、本机档案 0600、临时目录 0700", async () => {
      for (const slug of slugs) {
        const file = path.join(dirs.people, slug, "00-profile.md");
        assert.equal(((await fs.stat(file)).mode & 0o777).toString(8), "600", slug);
        assert.equal(((await fs.stat(path.dirname(file))).mode & 0o777).toString(8), "700", slug + " dir");
      }
      for (const name of ["current.json", "current.md"]) {
        assert.equal(((await fs.stat(path.join(dirs.profile, name))).mode & 0o777).toString(8), "600", name);
      }
      assert.equal(((await fs.stat(dirs.profile)).mode & 0o777).toString(8), "700");
    });

    await check("重复保存不新增、文件字节不变", async () => {
      const beforeDup = await snapshot();
      const res = await applyReview({
        confirm: true, sessionId: sessionA,
        items: [{kind: "person", peopleSlug: slugs[0], section: "interest",
          text: "She goes hiking on Sunday mornings.", segmentIndex: 0}],
      });
      assert.equal(res.data.unchanged, true);
      assert.equal(res.data.skipped[0].reason, "DUPLICATE");
      assert.deepEqual(await snapshot(), beforeDup);
    });

    await check("显式新建第 4 个人物并写入事实", async () => {
      const res = await applyReview({
        confirm: true, sessionId: sessionB,
        items: [{kind: "person", createPerson: true, peopleSlug: "Dee-Wong", personName: "Dee Wong",
          section: "plan", text: "She wants to visit the volcano park next month.", segmentIndex: 1}],
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.data.people.created, ["Dee-Wong"]);
      const md = await readPeople("Dee-Wong");
      assert.match(md, /^name: Dee Wong$/m);
      assert.ok(md.includes("volcano park"));
      assert.equal(((await fs.stat(path.join(dirs.people, "Dee-Wong", "00-profile.md"))).mode & 0o777).toString(8), "600");
      const list = await api("/v12/api/people");
      assert.equal(list.data.people.length, 4, "新建后列表应为 4 人");
    });

    await check("越权与非法输入被拒：无令牌 401 / 段号越界 / 未选人", async () => {
      const noToken = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/v12/api/review/apply`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({confirm: true, sessionId: sessionA, items: [{kind: "self", text: "x", segmentIndex: 0}]}),
      });
      assert.equal(noToken.status, 401);
      const badSeg = await applyReview({confirm: true, sessionId: sessionA,
        items: [{kind: "person", peopleSlug: slugs[0], section: "interest", text: "编造的事实", segmentIndex: 99}]});
      assert.equal(badSeg.data.unchanged, true);
      assert.equal(badSeg.data.skipped[0].reason, "SEGMENT_NOT_FOUND");
      const noPerson = await applyReview({confirm: true, sessionId: sessionA,
        items: [{kind: "person", personName: "Anna", text: "She likes tea.", segmentIndex: 2}]});
      assert.equal(noPerson.data.skipped[0].reason, "PERSON_NOT_SELECTED");
    });

    await check("四个人物档案都有实际内容（无孤立空目录）", async () => {
      const entries = await fs.readdir(dirs.people, {withFileTypes: true});
      const withContent = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === "_template") continue;
        const text = await fs.readFile(path.join(dirs.people, entry.name, "00-profile.md"), "utf8");
        if (text.includes("sm-src:")) withContent.push(entry.name);
      }
      assert.deepEqual(withContent.sort(), [...slugs, "Dee-Wong"].sort());
    });

    const failed = checks.filter((c) => !c.ok);
    for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} · ${item.name}${item.ok ? "" : " → " + item.error}`);
    console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
    if (KEEP) console.log("保留临时目录：" + work);
    return failed.length === 0 ? 0 : 1;
  } finally {
    await cleanup();
  }
}

main().then((code) => process.exit(code)).catch(async (error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
