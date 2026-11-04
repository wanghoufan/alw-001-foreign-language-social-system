/**
 * N05 V1.1 · S2/S3/S5 后端验收（verify-n05-backend）。
 *
 * 真跑：随机端口起真实 createHandler，注入假归档 + 假 AI + 宽松限流；
 * 人物目录、PlaceNotes、ManualFactBatches 全部指向临时工作区，绝不碰真实档案。
 * 同时前后比对真实 People/115 源/公开 PWA 的 sha，证明「零改动」。
 *
 * 运行：node verify-n05-backend.mjs
 * 退出码：0 全通过；1 有 FAIL。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const TOKEN = "sm-n05-verify-token-0123456789";
const REAL_PEOPLE = path.join(REPO_ROOT, "SocialMate-Data", "People");
const REAL_PLACES = path.join(REPO_ROOT, "socialmate-v1.2", "source", "places-115.json");
const PROTECTED = [
  REAL_PLACES,
  path.join(REPO_ROOT, "socialmate-prototype", "public-share.html"),
  path.join(REPO_ROOT, "socialmate-prototype", "public-share.js"),
  path.join(REPO_ROOT, "socialmate-prototype", "sw.js"),
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fileSha(file) {
  try {
    return sha256(await fs.readFile(file));
  } catch {
    return null;
  }
}

async function dirDigest(dir) {
  const files = [];
  async function walk(current, base) {
    let entries = [];
    try {
      entries = await fs.readdir(current, {withFileTypes: true});
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".DS_Store") continue;
      const full = path.join(current, entry.name);
      const rel = path.join(base, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else files.push(`${rel}\u0000${sha256(await fs.readFile(full))}`);
    }
  }
  await walk(dir, "");
  return {digest: sha256(files.sort().join("\n")), files: files.length};
}

function call(port, pathname, {method = "GET", headers = {}, body = null} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({
      host: "127.0.0.1", port, path: pathname, method,
      headers: {
        ...(payload ? {"content-type": "application/json", "content-length": payload.length} : {}),
        ...headers,
      },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({status: res.statusCode, json, text: data});
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function fakeArchive() {
  return {
    async get(_pathname, token) {
      if (token !== TOKEN) return {status: 401, body: "{}"};
      return {status: 404, body: "{}"};
    },
    async proxy(_req, res) {
      res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
      res.end("{}");
    },
  };
}

const PROFILE = (name, country) => [
  "---", `name: ${name}`, `country: ${country}`, "city:", "languages: []",
  "status_in_hainan:", "occupation:", "relationship_stage: new_contact",
  "first_met:", "last_contact:", "contact_channels: []", "tags: []", "---", "",
  "# 基本情况", "", `- 对方来自${country}。<!--sm-src:1111111111111111-->`, "",
  "# 兴趣", "", "# 海南生活", "", "# 工作 / 学习", "",
  "# 共同点", "", "# 对方近期计划", "", "# 已确认偏好", "",
  "# 不宜重复询问", "", "# 后续可以继续的话题", "",
].join("\n");

const MOCK_FACTS = [
  {subject: "对方", attribute: "country", value: "美国", quote: "他说他来自美国。", group: "basic", confidence: 0.95},
  {subject: "对方", attribute: "interest", value: "喜欢在龙兴路拍街景", quote: "我喜欢在龙兴路拍街景。", group: "interest", confidence: 0.86},
  {subject: "对方", attribute: "country", value: "英国", quote: "他下个月要去英国读书。", group: "plan", confidence: 0.72},
];

const MOCK_RAW = "他说他来自美国。我喜欢在龙兴路拍街景。他下个月要去英国读书。";

function paragraphSet() {
  const topics = [
    ["今天去了龙兴路。街道很短但咖啡馆很多！我点了一杯拿铁。坐在门口看人来人往。"],
    ["下午光线特别好。我拍了很多照片。还买了一个小摆件。老板说这是手工做的。"],
    ["第二次来这条街。这次带了一个朋友。我们先喝了咖啡。然后慢慢逛小店。"],
    ["朋友很喜欢这里的绿植。她说门头特别上镜。我们坐在外面聊天。一直待到太阳落山。"],
    ["路上遇到一只猫。它趴在咖啡馆门口。我摸了摸它的头。它一点都不怕人。"],
    ["晚饭在附近解决。我们吃了一碗海南粉。味道比想象中清爽。价格也不贵。"],
    ["老板推荐了隔壁的甜品店。我们点了椰子冻。口感很嫩。甜度刚刚好。"],
    ["回程的时候下起小雨。我们躲进一家书店。店里放着轻音乐。我翻了两本摄影集。"],
    ["书店老板很健谈。他说这条街周末最热闹。平时反而更适合散步。我记下了这个建议。"],
    ["下次想傍晚再来。那时候光线应该更柔和。我打算带相机。也许多拍几组人像。"],
  ];
  return topics.map(([text], index) => `【${index + 1}】${text}`).join("\n\n");
}

const checks = [];
function record(name, pass, detail) {
  checks.push({name, pass: Boolean(pass), detail});
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, "-");
  const workspace = path.join(HERE, ".local", "verify-n05-backend", stamp);
  const dirs = {
    people: path.join(workspace, "People"),
    notes: path.join(workspace, "PlaceNotes"),
    batches: path.join(workspace, "ManualFactBatches"),
    budget: path.join(workspace, "ai-budget.json"),
  };
  for (const dir of [dirs.people, dirs.notes, dirs.batches]) {
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
  }
  await fs.mkdir(path.join(dirs.people, "verify-a"), {recursive: true, mode: 0o700});
  await fs.mkdir(path.join(dirs.people, "verify-b"), {recursive: true, mode: 0o700});
  const profileA = path.join(dirs.people, "verify-a", "00-profile.md");
  const profileB = path.join(dirs.people, "verify-b", "00-profile.md");
  await fs.writeFile(profileA, PROFILE("Verify A", "美国"), {encoding: "utf8", mode: 0o600});
  await fs.writeFile(profileB, PROFILE("Verify B", "加拿大"), {encoding: "utf8", mode: 0o600});
  await fs.writeFile(dirs.budget, JSON.stringify({spentCny: 0, calls: 0}), "utf8");

  const realPeopleBefore = await dirDigest(REAL_PEOPLE);
  const protectedBefore = {};
  for (const file of PROTECTED) protectedBefore[file] = await fileSha(file);

  process.env.SM_AI_NO_LISTEN = "1";
  process.env.SM_PEOPLE_DIR = dirs.people;
  process.env.SM_PLACE_NOTES_DIR = dirs.notes;
  process.env.SM_MANUAL_FACTS_DIR = dirs.batches;
  process.env.SM_PLACES_FILE = REAL_PLACES;
  process.env.DEEPSEEK_BUDGET_FILE = dirs.budget;
  process.env.DEEPSEEK_BUDGET_CNY = "1";

  const {createHandler} = await import("./server.mjs");
  const aiExtract = async ({rawInput}) => {
    if (rawInput.includes("__TIMEOUT__")) {
      throw Object.assign(new Error("stub timeout"), {status: 503, code: "AI_UNAVAILABLE", reason: "PROVIDER_TIMEOUT"});
    }
    return {
      facts: MOCK_FACTS,
      usage: {prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 180, completion_tokens: 120},
      model: "deepseek-flash-stub",
      latencyMs: 3,
      estimatedCostCny: 0.0013,
    };
  };
  const aiMatch = async () => ({
    candidates: [{placeId: 1, confidence: 0.93, reason: "原文提到龙兴路", name: "龙兴路"}],
    model: "deepseek-flash-stub",
  });

  const server = http.createServer(createHandler({
    archive: fakeArchive(),
    rateLimit: () => ({ok: true}),
    aiExtract,
    aiMatch,
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  async function api(pathname, {method = "GET", body = null, token = TOKEN, ticket = false,
    sendOrigin = true, headers = {}} = {}) {
    const merged = {...headers};
    if (token) merged["x-archive-token"] = token;
    if (sendOrigin) merged.origin = origin;
    if (ticket) {
      const got = await call(port, "/v12/api/demo/write-ticket", {headers: merged});
      if (got.json?.ticket) merged["x-sm-write"] = got.json.ticket;
    }
    return call(port, pathname, {method, headers: merged, body});
  }

  try {
    /* ---------- ① 3 条事实：重复/新增/矛盾 ---------- */
    const beforeA = await fileSha(profileA);
    const draft = await api("/v12/api/people/verify-a/facts/draft", {
      method: "POST", ticket: true,
      body: {rawInput: MOCK_RAW, source: "manual_text", batchId: "batch-verify-0001", aiConsent: true, confirm: true},
    });
    const afterDraftA = await fileSha(profileA);
    record("①-a 草稿生成成功且未写入人物主档",
      draft.status === 200 && draft.json?.facts?.length === 3 && afterDraftA === beforeA,
      `status=${draft.status} facts=${draft.json?.facts?.length} profileUnchanged=${afterDraftA === beforeA}`);
    const duplicate = draft.json.facts.find((fact) => fact.duplicateOf);
    const conflict = draft.json.facts.find((fact) => fact.conflict);
    record("①-b 重复候选可识别、矛盾候选带选项",
      Boolean(duplicate) && Boolean(conflict)
        && conflict.conflict.options.join(",") === "append,replace,cancel",
      `duplicate=${duplicate?.action} conflictWith=${conflict?.conflict?.with?.type}`);

    const confirmBody = {
      draftId: draft.json.draftId,
      idempotencyKey: "idem-verify-0001",
      confirm: true,
      items: [{factId: conflict.factId, action: "append"}],
    };
    const confirmed = await api("/v12/api/people/verify-a/facts/confirm", {method: "POST", ticket: true, body: confirmBody});
    const afterConfirmA = await fileSha(profileA);
    record("①-c 确认只写目标主档（重复跳过、新增+矛盾追加）",
      confirmed.status === 200 && confirmed.json.written === 2 && afterConfirmA !== beforeA,
      `status=${confirmed.status} written=${confirmed.json?.written} skipped=${(confirmed.json?.pending || []).length}`);
    record("①-d 确认响应带来源/批次/摘录且不含伪造会话号",
      confirmed.json?.source === "manual_text"
        && confirmed.json?.batchId === "batch-verify-0001"
        && typeof confirmed.json?.sourceExcerpt === "string"
        && !JSON.stringify(confirmed.json).includes("segmentIndex"),
      `source=${confirmed.json?.source} batch=${confirmed.json?.batchId}`);
    record("①-e 确认后已按已确认事实重算定制话题",
      confirmed.json?.prepRecalculated === true && Array.isArray(confirmed.json?.prep?.items)
        && confirmed.json.prep.items.length > 0,
      `prepItems=${confirmed.json?.prep?.items?.length}`);

    const replay = await api("/v12/api/people/verify-a/facts/confirm", {method: "POST", ticket: true, body: confirmBody});
    record("①-f 幂等键重放不产生第二条写入",
      replay.status === 200 && replay.json.alreadyApplied === true && replay.json.written === 0
        && (await fileSha(profileA)) === afterConfirmA,
      `alreadyApplied=${replay.json?.alreadyApplied} written=${replay.json?.written}`);

    const factKeys = (confirmed.json.added || []).map((item) => item.key);
    const revoked = await api("/v12/api/people/verify-a/facts/revoke-manual", {
      method: "POST", ticket: true,
      body: {factKeys, confirm: true},
    });
    const afterRevokeA = await fileSha(profileA);
    record("①-g 撤回按备份逐字节还原",
      revoked.status === 200 && revoked.json.restoredFromBackup === true
        && revoked.json.byteIdentical === true && afterRevokeA === beforeA,
      `restored=${revoked.json?.restoredFromBackup} byteIdentical=${revoked.json?.byteIdentical} shaRestored=${afterRevokeA === beforeA}`);

    /* ---------- ② 错误人物 0 写入（他人 sha 不变） ---------- */
    const draft2 = await api("/v12/api/people/verify-a/facts/draft", {
      method: "POST", ticket: true,
      body: {rawInput: MOCK_RAW, source: "manual_text", batchId: "batch-verify-0002", aiConsent: true, confirm: true},
    });
    const beforeB = await fileSha(profileB);
    const beforeA2 = await fileSha(profileA);
    const wrongPerson = await api("/v12/api/people/verify-b/facts/confirm", {
      method: "POST", ticket: true,
      body: {draftId: draft2.json.draftId, idempotencyKey: "idem-verify-0002", confirm: true},
    });
    record("② 错误人物确认被拒且双方主档零写入",
      wrongPerson.status === 403 && wrongPerson.json.code === "DRAFT_PERSON_MISMATCH"
        && (await fileSha(profileB)) === beforeB && (await fileSha(profileA)) === beforeA2,
      `status=${wrongPerson.status} code=${wrongPerson.json?.code}`);

    /* ---------- AI 不可用退化（不伪装 AI 理解） ---------- */
    const degraded = await api("/v12/api/people/verify-a/facts/draft", {
      method: "POST", ticket: true,
      body: {rawInput: `__TIMEOUT__${MOCK_RAW}`, source: "manual_voice",
        batchId: "batch-verify-0003", aiConsent: true, confirm: true},
    });
    record("附 AI_UNAVAILABLE 时返回手工切句且 aiInterpreted=false",
      degraded.status === 503 && degraded.json.code === "AI_UNAVAILABLE"
        && degraded.json.aiInterpreted === false
        && Array.isArray(degraded.json.manualFallback) && degraded.json.manualFallback.length > 0,
      `status=${degraded.status} code=${degraded.json?.code} fallback=${degraded.json?.manualFallback?.length}`);

    /* ---------- ③ + ④ 10 段/40 句粘贴 → 分段 ---------- */
    const rawInput = paragraphSet();
    const founded = await api("/v12/api/places/1/records", {
      method: "POST", ticket: true,
      body: {rawInput, source: "external_ai_paste", confirm: true,
        enVariants: {0: ["I went to Longxing Road today."], 1: ["The afternoon light was great."]}},
    });
    const rec = founded.json?.record;
    const spanChecks = (rec?.blocks || []).every((block) => rawInput.slice(
      block.sourceSpan.start, block.sourceSpan.end) === block.sourceText
      && block.cnSentences.join("") === block.sourceText);
    record("④-a 分段句数守恒且逐字可回查",
      founded.status === 200 && rec?.blocks?.length >= 8
        && founded.json.stats.sentenceCount === 40 && founded.json.stats.lostSentences === 0
        && founded.json.stats.reassembled === true && spanChecks,
      `blocks=${rec?.blocks?.length} sentences=${founded.json?.stats?.sentenceCount} reassembled=${founded.json?.stats?.reassembled}`);
    record("④-b enVariants 接受 1–2 种说法，缺失块明确标记待翻译",
      rec?.blocks?.[0]?.enVariants?.length === 1
        && rec.blocks.some((block) => block.needsTranslation === true && block.enVariants.length === 0),
      `block0En=${rec?.blocks?.[0]?.enVariants?.length}`);

    const recordFile = path.join(dirs.notes, "1", "records", `${rec.recordId}.json`);
    const second = await api("/v12/api/places/1/records", {
      method: "POST", ticket: true,
      body: {rawInput: "第二条记录：傍晚又去了一次。光线比下午柔和。", source: "manual_text", confirm: true},
    });
    const detail = await api("/v12/api/places/1");
    const protectedAfter = {};
    for (const file of PROTECTED) protectedAfter[file] = await fileSha(file);
    const protectedUnchanged = PROTECTED.every((file) => protectedAfter[file] === protectedBefore[file]);
    record("③ 两条私有记录写入后 115 源/公开 PWA 字节不变",
      second.status === 200 && detail.json?.records?.length === 2 && protectedUnchanged,
      `records=${detail.json?.records?.length} protectedUnchanged=${protectedUnchanged}`);
    record("③-b 地点详情只读原介绍（id=1 龙兴路）且记录按时间倒序",
      detail.json?.place?.id === 1 && detail.json.place.name === "龙兴路"
        && detail.json.records.length === 2
        && String(detail.json.records[0].createdAt) >= String(detail.json.records[1].createdAt),
      `place=${detail.json?.place?.name} order=${detail.json?.records?.map((item) => item.createdAt).join(" >= ")}`);

    /* ---------- 源文 XSS：原文逐字保留，展示副本转义 ---------- */
    const xssInput = "<script>alert(1)</script> 傍晚的光很好。";
    const xss = await api("/v12/api/places/1/records", {
      method: "POST", ticket: true,
      body: {rawInput: xssInput, source: "manual_text", confirm: true},
    });
    const xssDetail = await api("/v12/api/places/1");
    const xssRecord = (xssDetail.json?.records || []).find((item) => item.rawInput === xssInput);
    record("附 源文逐字保留且 HTML 安全副本已转义",
      xss.status === 200 && xss.json.record.rawInput === xssInput
        && xss.json.rawHtmlSafe.includes("&lt;script&gt;")
        && !xss.json.rawHtmlSafe.includes("<script>")
        && Boolean(xssRecord) && xssRecord.rawHtmlSafe.includes("&lt;script&gt;"),
      `storedRaw=${Boolean(xssRecord)} escaped=${xss.json?.rawHtmlSafe?.slice(0, 24)}`);

    /* ---------- ⑤ 同段两份复盘并存、旧记录字节不变 ---------- */
    const recordShaBefore = await fileSha(recordFile);
    const block = rec.blocks[0];
    const practice1 = await api(`/v12/api/places/1/records/${rec.recordId}/blocks/${block.blockId}/practice`, {
      method: "POST", ticket: true,
      body: {contentRevision: rec.revision, rawReport: "第一轮：固定词组没记住，需要重练。",
        weakPhrases: ["take a stroll", "photogenic"], practiceTime: "2026-11-02T10:00:00.000Z",
        status: "confirmed", confirm: true},
    });
    const practice2 = await api(`/v12/api/places/1/records/${rec.recordId}/blocks/${block.blockId}/practice`, {
      method: "POST", ticket: true,
      body: {contentRevision: rec.revision, rawReport: "第二轮：photogenic 还是不顺。",
        weakPhrases: ["photogenic"], practiceTime: "2026-11-02T11:00:00.000Z",
        status: "confirmed", confirm: true},
    });
    const recordShaAfter = await fileSha(recordFile);
    const weak = await api("/v12/api/places/1/practice/weak");
    const aggregateBlock = (weak.json?.blocks || []).find((item) => item.blockId === block.blockId);
    const reportDir = path.join(dirs.notes, "1", "practice", block.blockId);
    const reportFiles = await fs.readdir(reportDir).catch(() => []);
    record("⑤ 同段两份复盘独立并存，旧记录字节不变",
      practice1.status === 200 && practice2.status === 200
        && practice1.json.report.reportId !== practice2.json.report.reportId
        && reportFiles.filter((name) => name.endsWith(".json")).length === 2
        && recordShaBefore === recordShaAfter,
      `reports=${reportFiles.length} recordByteIdentical=${recordShaBefore === recordShaAfter}`);
    record("⑤-b 弱项聚合按段计数且不自动判定掌握",
      aggregateBlock?.practiceCount === 2
        && aggregateBlock.weakPhrases.some((item) => item.phrase === "photogenic" && item.count === 2)
        && weak.json.autoMastery === false,
      `practiceCount=${aggregateBlock?.practiceCount} top=${weak.json?.topWeakPhrases?.[0]?.phrase}`);

    /* ---------- ⑦ revision 冲突 409 且原稿不丢 ---------- */
    const recordShaBeforeConflict = await fileSha(recordFile);
    const conflict409 = await api("/v12/api/places/1/records", {
      method: "POST", ticket: true,
      body: {recordId: rec.recordId, revision: 99, rawInput: "冲突态试写：不应覆盖原稿。",
        source: "manual_text", confirm: true},
    });
    const recordShaAfterConflict = await fileSha(recordFile);
    record("⑦ revision 冲突返回 409 并保留客户端稿件",
      conflict409.status === 409 && conflict409.json.code === "REVISION_CONFLICT"
        && conflict409.json.keptDraft?.rawInput?.startsWith("冲突态试写")
        && recordShaBeforeConflict === recordShaAfterConflict,
      `status=${conflict409.status} code=${conflict409.json?.code} originalKept=${recordShaBeforeConflict === recordShaAfterConflict}`);

    /* ---------- ⑥ 无票 / 跨源 / 未授权 ---------- */
    const noTicket = await api("/v12/api/places/1/records", {
      method: "POST", body: {rawInput: "无票写入测试", source: "manual_text", confirm: true},
    });
    const crossOrigin = await api("/v12/api/places/1/records", {
      method: "POST", ticket: true, sendOrigin: false,
      headers: {origin: "https://evil.example"},
      body: {rawInput: "跨源写入测试", source: "manual_text", confirm: true},
    });
    const noToken = await api("/v12/api/places/1/records", {
      method: "POST", ticket: true, token: null,
      body: {rawInput: "无令牌写入测试", source: "manual_text", confirm: true},
    });
    record("⑥ 无票 403 / 跨源 403 / 未授权 401",
      noTicket.status === 403 && noTicket.json.code === "WRITE_TICKET_REQUIRED"
        && crossOrigin.status === 403 && crossOrigin.json.code === "ORIGIN_REJECTED"
        && noToken.status === 401 && noToken.json.code === "TOKEN_REQUIRED",
      `noTicket=${noTicket.status}/${noTicket.json?.code} cross=${crossOrigin.status}/${crossOrigin.json?.code} noToken=${noToken.status}/${noToken.json?.code}`);

    /* ---------- 地点匹配：本地优先、不自动绑定 ---------- */
    const localMatch = await api("/v12/api/places/match", {
      method: "POST", body: {text: "龙兴路", aiConsent: false},
    });
    const aiMatchResult = await api("/v12/api/places/match", {
      method: "POST", body: {text: "那条有很多咖啡馆的小街", aiConsent: true},
    });
    record("附 地点匹配先本地后 AI top3，且一律需人工确认",
      localMatch.json?.source === "local" && localMatch.json.candidates[0].placeId === 1
        && aiMatchResult.json?.requiresConfirmation === true
        && aiMatchResult.json.candidates[0].placeId === 1,
      `local=${localMatch.json?.candidates?.[0]?.placeId} ai=${aiMatchResult.json?.source}`);

    /* ---------- 未归属草稿：不新增公开地点 ---------- */
    const unassigned = await api("/v12/api/places/unassigned/records", {
      method: "POST", ticket: true,
      body: {rawInput: "一个不在 115 里的小店。", source: "manual_text", confirm: true},
    });
    const unassignedList = await api("/v12/api/places/unassigned");
    record("附 非 115 地点只存未归属草稿",
      unassigned.status === 200 && unassigned.json.record.placeId === null
        && unassignedList.json.count === 1,
      `placeId=${unassigned.json?.record?.placeId} count=${unassignedList.json?.count}`);

    /* ---------- 真实数据零改动 ---------- */
    const realPeopleAfter = await dirDigest(REAL_PEOPLE);
    record("真实 People 目录 sha 前后一致",
      realPeopleAfter.digest === realPeopleBefore.digest,
      `files=${realPeopleAfter.files} digest=${realPeopleAfter.digest.slice(0, 16)}`);
    const protectedFinal = {};
    for (const file of PROTECTED) protectedFinal[file] = await fileSha(file);
    record("115 源 / public-share / sw.js 全程 sha 不变",
      PROTECTED.every((file) => protectedFinal[file] === protectedBefore[file]),
      `checked=${PROTECTED.length}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = checks.filter((item) => !item.pass);
  const summary = {
    ok: failed.length === 0,
    task: "ALW001-N05-V1.1-S2S3S5-backend",
    startedAt,
    finishedAt: new Date().toISOString(),
    port,
    ai: {mode: "injected-stub", realDeepSeekCalls: 0, note: "verify 用注入桩，不产生真实费用"},
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
    sampleDataPath: workspace,
    realPeopleDigest: (await dirDigest(REAL_PEOPLE)).digest,
    protectedFiles: PROTECTED.map((file) => ({file: path.relative(REPO_ROOT, file),
      sha256: protectedBefore[file]})),
  };
  const outFile = path.join(HERE, ".local", "verify-n05-backend.json");
  await fs.mkdir(path.dirname(outFile), {recursive: true});
  await fs.writeFile(outFile, JSON.stringify(summary, null, 2), "utf8");
  console.log("\n" + JSON.stringify({ok: summary.ok, total: summary.total, passed: summary.passed,
    failed: summary.failed, sampleDataPath: summary.sampleDataPath, json: outFile}, null, 2));
  return summary.ok ? 0 : 1;
}

main().then((code) => { process.exit(code); }).catch((error) => {
  console.error("VERIFY_FATAL", error);
  process.exit(1);
});