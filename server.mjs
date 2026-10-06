import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(process.env.SOCIALMATE_DATA_DIR || path.join(ROOT, 'SocialMate-Data'));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 1024 * 1024;

const send = (res, status, value, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
};
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isProfile = (rel) => /^People\/[^/]+\/00-profile\.md$/u.test(rel);
const isInteraction = (rel) => /^People\/[^/]+\/\d{4}-\d{2}-\d{2}-[\p{L}\p{N}_-]+\.md$/u.test(rel);
const yamlQuote = (value) => JSON.stringify(String(value).trim());
async function body(req) {
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > MAX_BODY) throw new Error('请求体过大'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function safePath(rel) {
  if (typeof rel !== 'string' || rel.includes('\\') || rel.startsWith('/') || rel.split('/').some((x) => !x || x === '.' || x === '..')) throw new Error('无效路径');
  const full = path.resolve(DATA_DIR, rel);
  if (!full.startsWith(DATA_DIR + path.sep)) throw new Error('路径越界');
  return full;
}
async function walk(dir, prefix = '') {
  let entries; try { entries = await fs.readdir(path.join(DATA_DIR, dir), { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    const rel = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), rel));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}

export async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, host: HOST, dataDir: DATA_DIR });
    if (req.method === 'GET' && url.pathname === '/api/files') {
      const files = await walk('');
      return send(res, 200, { files, people: files.filter((f) => f.startsWith('People/') && !f.startsWith('People/_template/') && f.endsWith('/00-profile.md')), topics: files.filter((f) => f.startsWith('Topics/')) });
    }
    if (req.method === 'POST' && url.pathname === '/api/people') {
      const input = await body(req);
      const name = String(input.name || '').trim();
      if (!name || name.length > 80) return send(res, 400, { error: '姓名为必填项（最多 80 字）' });
      const slugBase = name.normalize('NFKC').replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48) || `person-${Date.now()}`;
      const allowedStages = ['new_contact', 'acquaintance', 'friend', 'regular_contact'];
      const stage = allowedStages.includes(input.relationship_stage) ? input.relationship_stage : 'new_contact';
      const list = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20);
      const languages = list(input.languages); const tags = list(input.interests);
      const city = String(input.city || '').trim().slice(0, 100); const country = String(input.country || '').trim().slice(0, 100);
      let slug = slugBase; let rel = `People/${slug}/00-profile.md`;
      for (let n = 2; await fs.access(safePath(rel)).then(() => true, () => false); n++) { slug = `${slugBase}-${n}`; rel = `People/${slug}/00-profile.md`; }
      const contactDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const content = `---\nname: ${yamlQuote(name)}\ncountry: ${yamlQuote(country)}\ncity: ${yamlQuote(city)}\nlanguages: [${languages.map(yamlQuote).join(', ')}]\nstatus_in_hainan: ""\noccupation: ""\nrelationship_stage: ${stage}\nfirst_met: "${contactDate}"\nlast_contact: "${contactDate}"\ncontact_channels: []\ntags: [${tags.map(yamlQuote).join(', ')}]\n---\n\n# 基本情况\n\n# 兴趣\n\n${tags.map((tag) => `- ${tag}`).join('\n')}\n\n# 海南生活\n\n# 工作 / 学习\n\n# 共同点\n\n# 对方近期计划\n\n# 已确认偏好\n\n# 不宜重复询问\n\n# 后续可以继续的话题\n`;
      const folder = safePath(`People/${slug}`); await fs.mkdir(folder, { recursive: true });
      try { await fs.writeFile(safePath(rel), content, { encoding: 'utf8', flag: 'wx' }); }
      catch (err) { if (err.code === 'EEXIST') return send(res, 409, { error: '同名人物已存在' }); throw err; }
      return send(res, 201, { path: rel, content });
    }
    if (req.method === 'GET' && url.pathname === '/api/read') {
      const rel = url.searchParams.get('path'); const content = await fs.readFile(safePath(rel), 'utf8');
      return send(res, 200, { path: rel, content, hash: hash(content) });
    }
    if (req.method === 'POST' && url.pathname === '/api/preview') {
      const input = await body(req); const full = safePath(input.path);
      const profile = isProfile(input.path); const interaction = isInteraction(input.path);
      if (!profile && !interaction) return send(res, 400, { error: '仅允许预览人物主档或新互动记录' });
      if (interaction && !(await fs.stat(path.dirname(full)).then(() => true, () => false))) return send(res, 404, { error: '请先创建人物档案' });
      const current = await fs.readFile(full, 'utf8').catch((err) => err.code === 'ENOENT' && interaction ? null : Promise.reject(err));
      if (interaction && current !== null) return send(res, 409, { error: '互动记录已存在，不能覆盖' });
      if (typeof input.content !== 'string') return send(res, 400, { error: 'content 必须是文本' });
      const baseHash = current === null ? 'NEW' : hash(current);
      return send(res, 200, { path: input.path, before: current || '', after: input.content, baseHash, changeId: hash(`${input.path}\0${baseHash}\0${input.content}`) });
    }
    if (req.method === 'POST' && url.pathname === '/api/apply') {
      const input = await body(req); const full = safePath(input.path);
      const profile = isProfile(input.path); const interaction = isInteraction(input.path);
      if (!profile && !interaction) return send(res, 400, { error: '仅允许更新人物主档或创建新互动记录' });
      if (typeof input.content !== 'string' || typeof input.baseHash !== 'string' || typeof input.changeId !== 'string') return send(res, 400, { error: '确认参数不完整' });
      const wantedId = hash(`${input.path}\0${input.baseHash}\0${input.content}`);
      if (input.changeId !== wantedId) return send(res, 409, { error: '确认内容与预览内容不一致，请重新预览' });
      if (interaction) {
        if (!(await fs.stat(path.dirname(full)).then(() => true, () => false))) return send(res, 404, { error: '人物档案不存在' });
        if (input.baseHash !== 'NEW' || await fs.stat(full).then(() => true, () => false)) return send(res, 409, { error: '互动记录已存在或状态已变化，不能覆盖' });
        await fs.writeFile(full, input.content, { encoding: 'utf8', flag: 'wx' });
      } else {
        const current = await fs.readFile(full, 'utf8'); const currentHash = hash(current);
        if (input.baseHash !== currentHash) return send(res, 409, { error: '主档在预览后已变化，请重新预览' });
        const tmp = `${full}.${crypto.randomUUID()}.tmp`;
        await fs.writeFile(tmp, input.content, 'utf8'); await fs.rename(tmp, full);
      }
      return send(res, 200, { ok: true, path: input.path, hash: hash(input.content) });
    }
    if (req.method === 'GET' && url.pathname === '/') {
      const html = await fs.readFile(path.join(ROOT, 'public', 'index.html'), 'utf8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/styles.css') {
      const css = await fs.readFile(path.join(ROOT, 'public', 'styles.css'), 'utf8');
      return send(res, 200, css, 'text/css; charset=utf-8');
    }
    return send(res, 404, { error: '未找到' });
  } catch (err) { return send(res, 400, { error: err.message || '请求失败' }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  http.createServer((req, res) => { handle(req, res); }).listen(PORT, HOST, () => console.log(`SocialMate: http://${HOST}:${PORT} (data: ${DATA_DIR})`));
}
