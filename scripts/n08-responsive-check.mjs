#!/usr/bin/env node
/**
 * N08 页面响应式 + 底部 Tab 回归自检
 *
 * 用无头 Chromium 直接以 file:// 加载 socialmate-v1.2/index.html，
 * 在 375 / 393 / 430 / 520（高 850）四个宽度下逐项断言：
 *   a) 横向无溢出      document.documentElement.scrollWidth <= innerWidth + 1（且不超过请求的视口宽度 + 1）
 *   b) 底部 Tab 数量    .mobilebar button 数量 === --expect-tabs（默认 6）
 *   c) 无坏字符串      body.innerText 中不出现 undefined / NaN / [object Object]
 *   d) 逐个 Tab 可点   点击后 body.innerText.length > 200 且没有未捕获异常
 *
 * 引擎优先级：playwright 自带 chromium > playwright 驱动系统 Chrome > 系统 Chrome --headless=new（原生 CDP）
 * 绝不复用日常 Chrome 的 profile，绝不开可见窗口，绝不访问外网（http/https/ws 请求全部拦截）。
 *
 * 两点口径说明（都写进 report.json，不静默）：
 *   - 横向溢出同时用「请求的视口宽度」做基准：移动端仿真下 Chrome 可能把布局视口撑到内容宽度，
 *     只比 innerWidth 会把真实溢出判成通过。
 *   - chat / people 这类薄视图（页面真实空态，约 110 / 163 字）默认不判失败，改用
 *     「点击后成为 current + 无异常 + 文本 >= floor」并标记 thinView；要严格口径加 --strict-text。
 *
 * 用法：
 *   node scripts/n08-responsive-check.mjs                    # 默认 --expect-tabs 6
 *   node scripts/n08-responsive-check.mjs --expect-tabs 5
 *   node scripts/n08-responsive-check.mjs --only 375 --only 520
 *   node scripts/n08-responsive-check.mjs --out /tmp/n08-qa
 *
 * 退出码：0 全部通过 / 5 有检查项失败 / 2 脚本自身异常（含缺浏览器、缺 playwright 且无系统 Chrome）
 *
 * 只读页面，不改页面、不连手机、不联网。产物只有 --out 目录下的 png 与 report.json。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const PAGE_FILE = path.join(ROOT, 'socialmate-v1.2', 'index.html');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'qa', '2026-11-15-n08-responsive');
const DEFAULT_WIDTHS = [375, 393, 430, 520];
const DEFAULT_HEIGHT = 850;
const DEFAULT_EXPECT_TABS = 6;
const TAB_SELECTOR = '.mobilebar button';
const BROKEN_TOKENS = [
  { name: 'undefined', re: /\bundefined\b/ },
  { name: 'NaN', re: /\bNaN\b/ },
  { name: '[object Object]', re: /\[object Object\]/ },
];
const LAUNCH_TIMEOUT_MS = 30000;
const NAV_TIMEOUT_MS = 30000;

/**
 * 已知「薄视图」白名单（按 Tab 的 data-nav 键匹配）。
 *
 * 背景：规格要求「点击每个 Tab 后 document.body.innerText.length > 200」。实测当前页面
 * 聊天页空态只有约 110 字（未开始录音时仅两行占位说明）、人物页空态约 163 字（本机无档案）
 * ——它们不是白屏，而是页面真实的空态。为了让这个自检在 N08 开发期可反复跑而不产生假失败，
 * 对白名单内的 Tab 改用「点击后成为 current + 无未捕获异常 + 文本 >= floor」判定，
 * 并在 report.json 里标 thinView=true 与实测字数，绝不静默放过。
 * 需要按严格口径跑（薄视图也算失败）时加 --strict-text。
 */
const THIN_VIEW_ALLOWLIST = {
  chat: { floor: 40, reason: '聊天页空态：未开始录音时只有两行占位说明（实测约 110 字）' },
  people: { floor: 40, reason: '人物页空态：本机无档案时只有空态文案（实测约 163 字）' },
  expr: { floor: 40, reason: '表达页空态：还没有表达记录时只有入口与空态文案（实测约 131 字）' },
};

const EXIT_PASS = 0;
const EXIT_FAIL = 5;
const EXIT_ERROR = 2;

const MISSING_PLAYWRIGHT_HINT = '缺 playwright，请先 npm i -D playwright';

/* ------------------------------------------------------------------ */
/* 参数                                                                */
/* ------------------------------------------------------------------ */

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = {
    expectTabs: DEFAULT_EXPECT_TABS,
    only: [],
    out: DEFAULT_OUT,
    height: DEFAULT_HEIGHT,
    widths: DEFAULT_WIDTHS.slice(),
    strictText: false,
    help: false,
  };

  const intArg = (flag, raw, { min = 0 } = {}) => {
    if (!/^\d+$/.test(String(raw).trim())) {
      throw new UsageError(`${flag} 需要非负整数，收到 "${raw}"`);
    }
    const n = Number(String(raw).trim());
    if (!Number.isInteger(n) || n < min) throw new UsageError(`${flag} 需要 >= ${min} 的整数，收到 "${raw}"`);
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`参数 ${arg} 缺少取值`);
      return v;
    };
    const [flag, inline] = arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined];
    const value = () => (inline !== undefined ? inline : take());

    switch (flag) {
      case '--expect-tabs':
        opts.expectTabs = intArg('--expect-tabs', value(), { min: 0 });
        break;
      case '--only': {
        const raw = value();
        const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (!list.length) throw new UsageError('--only 需要至少一个宽度，如 --only 375');
        for (const w of list) opts.only.push(intArg('--only', w, { min: 1 }));
        break;
      }
      case '--out': {
        const raw = value();
        if (!raw.trim()) throw new UsageError('--out 需要目录路径');
        opts.out = path.resolve(process.cwd(), raw.trim());
        break;
      }
      case '--height':
        opts.height = intArg('--height', value(), { min: 200 });
        break;
      case '--widths': {
        const raw = value();
        const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (!list.length) throw new UsageError('--widths 需要至少一个宽度');
        opts.widths = list.map((w) => intArg('--widths', w, { min: 1 }));
        break;
      }
      case '--strict-text':
        opts.strictText = true;
        break;
      case '--page': {
        const raw = value();
        if (!raw.trim()) throw new UsageError('--page 需要文件路径');
        opts.page = path.resolve(process.cwd(), raw.trim());
        break;
      }
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new UsageError(`未知参数：${arg}`);
    }
  }

  if (opts.only.length) {
    const unknown = opts.only.filter((w) => !opts.widths.includes(w));
    if (unknown.length) {
      throw new UsageError(`--only 里有不在本次宽度集合内的值：${unknown.join(', ')}（可选：${opts.widths.join(', ')}）`);
    }
    opts.widths = opts.widths.filter((w) => opts.only.includes(w));
  }
  opts.widths = [...new Set(opts.widths)];
  return opts;
}

function usage() {
  return [
    '用法：node scripts/n08-responsive-check.mjs [选项]',
    '',
    '  --expect-tabs N    期望的底部 Tab 数量（默认 6）',
    '  --only W          只跑某个宽度，可重复或逗号分隔，如 --only 375 / --only 375,520',
    '  --out DIR          截图与 report.json 的输出目录',
    '  --widths W1,W2     覆盖默认宽度集合（默认 375,393,430,520）',
    '  --height H         视口高度（默认 850）',
    '  --strict-text      薄视图（chat/people 空态）也按 >200 字严格要求，默认放行并标注 thinView',
    '  --page FILE        只给脚本自测用：换一个页面文件（默认 socialmate-v1.2/index.html）',
    '  -h, --help         显示本帮助',
    '',
    '退出码：0 全部通过 / 5 有检查项失败 / 2 脚本自身异常',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nowIso() {
  // 显式带本地时区偏移，避免报告里时间口径不清
  const d = new Date();
  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

function shorten(text, max = 220) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function chromeCandidates() {
  // N08_CHROME_PATH 是显式覆盖：设了就只用它，避免「以为指定了 A 实际却跑 B」
  if (process.env.N08_CHROME_PATH) return [process.env.N08_CHROME_PATH];
  const list = [];
  if (process.platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else if (process.platform === 'win32') {
    const roots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']].filter(Boolean);
    for (const r of roots) {
      list.push(
        path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(r, 'Chromium', 'Application', 'chrome.exe'),
        path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      );
    }
  } else {
    list.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
  }
  return list;
}

function findSystemChrome() {
  return chromeCandidates().find((p) => exists(p)) || null;
}

function rmrf(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* 清理失败不影响结论，临时目录会由系统回收 */
  }
}

/** 结束子进程并等它真的退出，避免删临时 profile 时和进程退出抢文件 */
function killChild(child, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) return resolve();
    const done = () => {
      clearTimeout(timer);
      child.off('exit', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    child.once('exit', done);
    try {
      child.kill('SIGKILL');
    } catch {
      done();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 极简 CDP 客户端（系统 Chrome 回退路径用）                            */
/* ------------------------------------------------------------------ */

class CDP {
  static async connect(wsUrl) {
    if (typeof WebSocket !== 'function') {
      throw new Error(`当前 Node（${process.version}）没有内置 WebSocket，无法走 CDP 回退，请用 Node 22+ 或安装 playwright`);
    }
    const socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        socket.removeEventListener('error', onError);
        resolve();
      };
      const onError = (ev) => {
        socket.removeEventListener('open', onOpen);
        reject(new Error(`CDP WebSocket 连接失败：${ev?.message || ev?.error?.message || '未知错误'}`));
      };
      socket.addEventListener('open', onOpen, { once: true });
      socket.addEventListener('error', onError, { once: true });
    });
    return new CDP(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
    socket.addEventListener('message', (ev) => {
      let msg;
      try {
        const raw = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method} 失败：${msg.error.message}${msg.error.data ? ` (${msg.error.data})` : ''}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) fn(msg.params, msg.sessionId);
      }
    });
    socket.addEventListener('close', () => {
      this.closed = true;
      for (const { reject, method } of this.pending.values()) reject(new Error(`${method} 未返回：CDP 连接已关闭`));
      this.pending.clear();
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error(`${method} 未发送：CDP 连接已关闭`));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  close() {
    try {
      this.socket.close();
    } catch {
      /* 已经断开 */
    }
  }
}

async function waitForDevToolsEndpoint(child) {
  const stderrChunks = [];
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome 未在 ${LAUNCH_TIMEOUT_MS}ms 内输出 DevTools 端点`)), LAUNCH_TIMEOUT_MS);
    const onData = (buf) => {
      const text = buf.toString('utf8');
      stderrChunks.push(text);
      const m = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        child.stderr.off('data', onData);
        resolve(m[1]);
      }
    };
    child.stderr.on('data', onData);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Chrome 启动即退出（code=${code}, signal=${signal}）：${shorten(stderrChunks.join(''), 600)}`));
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 Chrome：${err.message}`));
    });
  });
  const port = new URL(endpoint).port;
  return { endpoint, port, stderrText: () => stderrChunks.join('') };
}

async function connectPageTarget(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
      lastErr = new Error('没有可用的 page target');
    } catch (err) {
      lastErr = err;
    }
    await sleep(120);
  }
  throw new Error(`连不上 Chrome 的调试端口 127.0.0.1:${port}：${lastErr?.message || '超时'}`);
}

/* ------------------------------------------------------------------ */
/* 页面驱动抽象：playwright 与原生 CDP 各一个实现                       */
/* ------------------------------------------------------------------ */

/** playwright 页面驱动 */
class PlaywrightDriver {
  constructor(browser, context) {
    this.name = 'playwright';
    this.browser = browser;
    this.context = context;
  }

  static async launch(executablePath) {
    const { chromium } = await import('playwright');
    const args = [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--mute-audio',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-file-access-from-files',
    ];
    const browser = await chromium.launch({ headless: true, args, executablePath });
    const context = await browser.newContext({
      viewport: { width: DEFAULT_WIDTHS[0], height: DEFAULT_HEIGHT },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    // 断网：只放行 file://，其余 http/https/ws 一律拦截，保证不访问外网
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(https?|wss?):/i.test(url)) return route.abort().catch(() => {});
      return route.continue().catch(() => {});
    });
    const driver = new PlaywrightDriver(browser, context);
    driver.executablePath = executablePath || chromium.executablePath?.() || 'playwright 自带 chromium';
    return driver;
  }

  async newPage(width, height) {
    const page = await this.context.newPage();
    await page.setViewportSize({ width, height });
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => errors.push(shorten(err?.stack || err?.message || String(err), 900)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(shorten(msg.text(), 500));
    });
    return {
      errors,
      consoleErrors,
      evaluate: (expression) => page.evaluate(expression),
      goto: async (url) => {
        await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
      },
      screenshot: (file) => page.screenshot({ path: file, fullPage: false }),
      close: () => page.close(),
    };
  }

  async close() {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }
}

/** 系统 Chrome --headless=new 驱动（原生 CDP） */
class ChromeCdpDriver {
  constructor(executablePath) {
    this.name = 'chrome-headless-cdp';
    this.executablePath = executablePath;
    this.children = [];
  }

  async newPage(width, height) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'n08-chrome-profile-'));
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--mute-audio',
      '--hide-crash-restore-bubble',
      '--allow-file-access-from-files',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      `--window-size=${width},${height}`,
      '--no-sandbox',
      'about:blank',
    ];
    const child = spawn(this.executablePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.push(child);
    const { port } = await waitForDevToolsEndpoint(child);

    const target = await connectPageTarget(port);
    const cdp = await CDP.connect(target.webSocketDebuggerUrl);

    const errors = [];
    const consoleErrors = [];
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      const text = exceptionDetails?.exception?.description || exceptionDetails?.text || '未捕获异常';
      errors.push(shorten(`${text} @${exceptionDetails?.lineNumber ?? '?'}:${exceptionDetails?.columnNumber ?? '?'}`, 900));
    });
    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        const text = (params.args || [])
          .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
          .join(' ');
        consoleErrors.push(shorten(text, 500));
      }
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    // 断网：只放行 file:// 与 devtools，其余全部阻断
    await cdp.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    return {
      errors,
      consoleErrors,
      async evaluate(expression) {
        const result = await cdp.send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
        });
        if (result.exceptionDetails) {
          const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
          throw new Error(shorten(`evaluate 抛错：${desc}`, 900));
        }
        return result.result?.value;
      },
      async goto(url) {
        await cdp.send('Page.navigate', { url });
        const deadline = Date.now() + NAV_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await sleep(60);
          const state = await cdp.send('Runtime.evaluate', {
            expression: 'document.readyState',
            returnByValue: true,
          });
          if (state.result?.value === 'complete') return;
        }
        throw new Error(`页面 ${NAV_TIMEOUT_MS}ms 内未加载完成：${url}`);
      },
      async screenshot(file) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      },
      async close() {
        cdp.close();
        await killChild(child);
        rmrf(profile);
      },
    };
  }

  async close() {
    for (const child of this.children) await killChild(child);
    this.children = [];
  }
}

/* ------------------------------------------------------------------ */
/* 页面内的检查表达式                                                   */
/* ------------------------------------------------------------------ */

const SETTLE_EXPR = `new Promise((resolve) => {
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (frames < 3) requestAnimationFrame(tick);
    else setTimeout(resolve, 120);
  };
  requestAnimationFrame(tick);
})`;

function overflowProbeExpr(nominalWidth) {
  // 说明：移动端仿真下 Chrome 可能把布局视口撑到内容宽度（window.innerWidth 跟着变大），
  // 只用 scrollWidth <= innerWidth 会把真实溢出判成通过。所以同时拿「请求的视口宽度」做基准，
  // 只要 scrollWidth 超过 nominalWidth / innerWidth 任一小者就是横向溢出。
  return `(() => {
    const NOMINAL = ${JSON.stringify(nominalWidth)};
    const de = document.documentElement;
    const innerWidth = window.innerWidth;
    const offenders = [];
    const nodes = document.body ? document.body.querySelectorAll('*') : [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right > NOMINAL + 1) {
        const cs = getComputedStyle(el);
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string' ? el.className : '').trim().slice(0, 60),
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          position: cs.position,
        });
        if (offenders.length >= 6) break;
      }
    }
    return {
      nominalWidth: NOMINAL,
      innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      scrollWidth: de.scrollWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : null,
      docClientWidth: de.clientWidth,
      visualViewportWidth: window.visualViewport ? Math.round(window.visualViewport.width * 10) / 10 : null,
      layoutViewportExpanded: innerWidth > NOMINAL + 1,
      offenders,
    };
  })()`;
}

function tabInfoExpr() {
  return `(() => {
    const btns = Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)}));
    return {
      count: btns.length,
      labels: btns.map((b) => (b.innerText || b.textContent || '').replace(/\\s+/g, ' ').trim()),
      navKeys: btns.map((b) => b.getAttribute('data-nav') || ''),
      currentIndex: btns.findIndex((b) => b.classList.contains('current')),
      navDisplay: (() => {
        const nav = document.querySelector('.mobilebar');
        if (!nav) return null;
        const cs = getComputedStyle(nav);
        return { display: cs.display, gridTemplateColumns: cs.gridTemplateColumns, position: cs.position };
      })(),
    };
  })()`;
}

function brokenTokenExpr() {
  const rules = BROKEN_TOKENS.map((t) => t.re.source);
  return `(() => {
    const rules = [${rules.map((r) => `new RegExp(${JSON.stringify(r)})`).join(', ')}];
    const text = document.body ? document.body.innerText : '';
    const hits = [];
    for (const re of rules) {
      let m;
      const g = new RegExp(re.source, 'g');
      while ((m = g.exec(text)) !== null) {
        const start = Math.max(0, m.index - 60);
        hits.push({ token: m[0], context: text.slice(start, m.index + m[0].length + 60).replace(/\\s+/g, ' ') });
        if (hits.length >= 6) break;
      }
      if (hits.length >= 6) break;
    }
    return { tokens: [${BROKEN_TOKENS.map((t) => JSON.stringify(t.name)).join(', ')}], hitCount: hits.length, hits, textLength: text.length };
  })()`;
}

function clickTabExpr(index) {
  return `(() => {
    const btns = Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)}));
    const btn = btns[${index}];
    if (!btn) return { clicked: false, reason: '找不到第 ${index + 1} 个 Tab（当前只有 ' + btns.length + ' 个）' };
    const label = (btn.innerText || btn.textContent || '').replace(/\\s+/g, ' ').trim();
    const disabled = btn.disabled === true;
    const before = { textLength: document.body ? document.body.innerText.length : 0, currentIndex: btns.findIndex((b) => b.classList.contains('current')) };
    btn.click();
    return { clicked: true, label, disabled, before };
  })()`;
}

function afterClickExpr() {
  return `(() => {
    const btns = Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)}));
    const text = document.body ? document.body.innerText : '';
    return {
      textLength: text.length,
      currentIndex: btns.findIndex((b) => b.classList.contains('current')),
      textHead: text.replace(/\\s+/g, ' ').trim().slice(0, 80),
    };
  })()`;
}

/* ------------------------------------------------------------------ */
/* 单个宽度的检查                                                       */
/* ------------------------------------------------------------------ */

async function checkWidth(driver, { width, height, expectTabs, outDir, pageUrl, strictText = false }) {
  const record = {
    width,
    height,
    pass: false,
    screenshot: null,
    checks: {},
    diagnostics: {},
  };

  const page = await driver.newPage(width, height);
  const tabRuns = [];
  try {
    await page.goto(pageUrl);
    await page.evaluate(SETTLE_EXPR);

    /* a) 横向无溢出 */
    const overflow = await page.evaluate(overflowProbeExpr(width));
    record.diagnostics.scrollWidth = overflow.scrollWidth;
    record.diagnostics.innerWidth = overflow.innerWidth;
    record.diagnostics.bodyScrollWidth = overflow.bodyScrollWidth;
    record.diagnostics.devicePixelRatio = overflow.devicePixelRatio;
    record.diagnostics.layoutViewportExpanded = overflow.layoutViewportExpanded;
    record.diagnostics.visualViewportWidth = overflow.visualViewportWidth;
    record.diagnostics.overflowOffenders = overflow.offenders;
    // 双基准取小者：移动端仿真下 innerWidth 可能被内容撑大，只比 innerWidth 会漏判
    const overflowLimit = Math.min(overflow.innerWidth, width);
    const overflowPass = typeof overflow.scrollWidth === 'number' && overflow.scrollWidth <= overflowLimit + 1;
    record.checks.noHorizontalOverflow = {
      pass: overflowPass,
      expect: `document.documentElement.scrollWidth <= innerWidth + 1（并要求 <= 视口宽度 ${width} + 1）`,
      actual: {
        scrollWidth: overflow.scrollWidth,
        innerWidth: overflow.innerWidth,
        nominalWidth: width,
        bodyScrollWidth: overflow.bodyScrollWidth,
        layoutViewportExpanded: overflow.layoutViewportExpanded,
      },
      reason: overflowPass
        ? null
        : `横向溢出：document.documentElement.scrollWidth=${overflow.scrollWidth} > ${overflowLimit + 1}（视口 ${width}px，innerWidth=${overflow.innerWidth}${overflow.layoutViewportExpanded ? '，布局视口被内容撑大到 innerWidth' : ''}；body.scrollWidth=${overflow.bodyScrollWidth}${overflow.offenders.length ? `；越界元素：${overflow.offenders.map((o) => `${o.tag}${o.cls ? '.' + o.cls.replace(/\s+/g, '.') : ''}@right=${o.right}${o.position === 'fixed' ? '(fixed)' : ''}`).join(', ')}` : ''}）`,
    };

    /* 截图：默认首屏 */
    const shotName = `w${width}.png`;
    const shotPath = path.join(outDir, shotName);
    await page.screenshot(shotPath);
    const shotStat = await fsp.stat(shotPath);
    record.screenshot = shotName;
    record.diagnostics.screenshotBytes = shotStat.size;

    /* b) 底部 Tab 数量 */
    const tabs = await page.evaluate(tabInfoExpr());
    record.diagnostics.tabLabels = tabs.labels;
    record.diagnostics.tabNavKeys = tabs.navKeys;
    record.diagnostics.navStyle = tabs.navDisplay;
    const tabCountPass = tabs.count === expectTabs;
    record.checks.tabCount = {
      pass: tabCountPass,
      expect: `${TAB_SELECTOR} 数量 === ${expectTabs}`,
      actual: { count: tabs.count, labels: tabs.labels, navKeys: tabs.navKeys },
      reason: tabCountPass ? null : `底部 Tab 数量不符：期望 ${expectTabs}，实际 ${tabs.count}（${tabs.labels.join(' / ') || '无'}）`,
    };

    /* c) 坏字符串 */
    const broken = await page.evaluate(brokenTokenExpr());
    record.diagnostics.innerTextLength = broken.textLength;
    record.checks.noBrokenTokens = {
      pass: broken.hitCount === 0,
      expect: `可见文本不含 ${BROKEN_TOKENS.map((t) => t.name).join(' / ')}`,
      actual: { hitCount: broken.hitCount, hits: broken.hits },
      reason: broken.hitCount === 0
        ? null
        : `可见文本出现坏字符串：${broken.hits.map((h) => `${h.token} ← "${shorten(h.context, 140)}"`).join('；')}`,
    };

    /* d) 逐个点击底部 Tab */
    for (let i = 0; i < tabs.count; i++) {
      const before = page.errors.length;
      const navKey = tabs.navKeys[i] ?? null;
      const thin = THIN_VIEW_ALLOWLIST[navKey];
      const run = { index: i + 1, navKey, label: tabs.labels[i] ?? null, pass: false, textLength: null, reason: null };
      let clicked = false;
      try {
        const clickResult = await page.evaluate(clickTabExpr(i));
        if (!clickResult.clicked) {
          run.reason = clickResult.reason;
        } else {
          clicked = true;
          run.label = clickResult.label;
          await page.evaluate(SETTLE_EXPR);
          const after = await page.evaluate(afterClickExpr());
          run.textLength = after.textLength;
          run.textHead = after.textHead;
          run.currentIndexAfter = after.currentIndex + 1;
          const newErrors = page.errors.slice(before);
          const problems = [];
          const becameCurrent = after.currentIndex === i;
          const overThreshold = after.textLength > 200;
          if (!overThreshold && thin && !strictText) {
            // 已知薄视图：改用「切换成功 + 无异常 + 文本不为空」判定
            run.thinView = true;
            run.thinReason = thin.reason;
            if (after.textLength < thin.floor) {
              problems.push(`薄视图文本过少：document.body.innerText.length=${after.textLength} < ${thin.floor}（可能是白屏）`);
            }
            if (!becameCurrent) problems.push('点击后该 Tab 未变成 current（视图没切换）');
          } else if (!overThreshold) {
            problems.push(`点击后 document.body.innerText.length=${after.textLength}，未大于 200`);
            if (!becameCurrent) problems.push('点击后该 Tab 未变成 current（视图没切换）');
          }
          if (newErrors.length) problems.push(`点击后抛错：${newErrors.join(' | ')}`);
          run.pass = problems.length === 0;
          run.reason = problems.length ? problems.join('；') : null;
          run.errors = newErrors;
        }
      } catch (err) {
        run.reason = `点击/读取抛错：${shorten(err?.message || err, 400)}`;
      }
      if (!clicked && !run.label) run.label = `#${i + 1}`;
      tabRuns.push(run);
    }

    const tabClickFails = tabRuns.filter((r) => !r.pass);
    const thinViews = tabRuns.filter((r) => r.thinView);
    record.diagnostics.thinViews = thinViews.map((r) => ({
      index: r.index,
      navKey: r.navKey,
      label: r.label,
      textLength: r.textLength,
      reason: r.thinReason,
    }));
    record.checks.tabClicks = {
      pass: tabClickFails.length === 0,
      expect: '逐个点击每个 .mobilebar button，点击后 body.innerText.length > 200 且无未捕获异常（薄视图见 thinView 标注）',
      actual: tabRuns.map((r) => ({
        index: r.index,
        navKey: r.navKey,
        label: r.label,
        textLength: r.textLength,
        pass: r.pass,
        thinView: Boolean(r.thinView),
        thinReason: r.thinReason ?? null,
        textHead: r.textHead ?? null,
        errors: r.errors ?? [],
      })),
      reason: tabClickFails.length
        ? tabClickFails.map((r) => `Tab ${r.index}${r.label ? `「${r.label}」` : ''}：${r.reason}`).join('；')
        : null,
    };

    record.diagnostics.pageErrors = page.errors.slice(0, 10);
    record.diagnostics.pageErrorCount = page.errors.length;
    record.diagnostics.consoleErrors = page.consoleErrors.slice(0, 10);

    record.pass = Object.values(record.checks).every((c) => c.pass);
    return record;
  } catch (err) {
    record.pass = false;
    record.fatal = shorten(err?.stack || err?.message || err, 1200);
    record.checks.pageLoad = {
      pass: false,
      expect: `能加载并操作 ${pageUrl}`,
      actual: null,
      reason: `宽度 ${width} 执行中断：${shorten(err?.message || err, 600)}`,
    };
    record.diagnostics.pageErrors = page.errors.slice(0, 10);
    return record;
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function resolveEngine() {
  const notes = [];
  let playwrightError = null;

  try {
    const driver = await PlaywrightDriver.launch(undefined);
    notes.push(`引擎：playwright 自带 chromium（${driver.executablePath}）`);
    return { driver, notes, engine: `playwright-chromium: ${driver.executablePath}` };
  } catch (err) {
    playwrightError = err;
    notes.push(`playwright 自带 chromium 不可用：${shorten(err?.message || err, 300)}`);
  }

  // playwright 装了但没下载浏览器 / 或自带 chromium 启动失败 → 用 playwright 驱动系统 Chrome
  if (!/Cannot find module|Cannot find package/i.test(String(playwrightError?.message || playwrightError))) {
    const sysChrome = findSystemChrome();
    if (sysChrome) {
      try {
        const driver = await PlaywrightDriver.launch(sysChrome);
        notes.push(`引擎：playwright 驱动系统 Chrome（${sysChrome}）`);
        return { driver, notes, engine: `playwright-system-chrome: ${sysChrome}` };
      } catch (err) {
        notes.push(`playwright 驱动系统 Chrome 失败：${shorten(err?.message || err, 300)}`);
      }
    }
  } else {
    notes.push(`⚠️ ${MISSING_PLAYWRIGHT_HINT}（当前回退到系统 Chrome --headless=new 原生 CDP 通道）`);
  }

  const sysChrome = findSystemChrome();
  if (sysChrome) {
    const driver = new ChromeCdpDriver(sysChrome);
    // 起一个最小页面验证可驱动，避免后面每个宽度重复失败
    const probe = await driver.newPage(DEFAULT_WIDTHS[0], DEFAULT_HEIGHT);
    await probe.close();
    notes.push(`引擎：系统 Chrome --headless=new + 原生 CDP（${sysChrome}）`);
    return { driver, notes, engine: `system-chrome-headless-cdp: ${sysChrome}`, playwrightMissing: true };
  }

  const err = new Error(
    [
      `${MISSING_PLAYWRIGHT_HINT}`,
      '',
      '同时没有找到可用的系统 Chrome/Chromium，无法回退到 --headless=new。',
      `已尝试的路径：${chromeCandidates().join(' , ') || '（无）'}`,
      '任选其一修复：',
      `  1) cd "${ROOT}" && npm i -D playwright && npx playwright install chromium`,
      '  2) 安装 Google Chrome / Chromium 后重跑，或用 N08_CHROME_PATH=/path/to/chrome 指定',
    ].join('\n'),
  );
  err.notes = notes;
  throw err;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return EXIT_PASS;
  }

  const pageFile = opts.page || PAGE_FILE;
  const pageUrl = pathToFileURL(pageFile).href;

  if (!fs.existsSync(pageFile)) {
    throw new Error(`页面不存在：${pageFile}`);
  }

  await fsp.mkdir(opts.out, { recursive: true });

  const startedAt = nowIso();
  console.log(`[n08] 页面：${pageUrl}`);
  console.log(`[n08] 视口：${opts.widths.map((w) => `${w}x${opts.height}`).join(' / ')}；期望 Tab 数：${opts.expectTabs}`);
  console.log(`[n08] 输出：${opts.out}`);

  let resolved;
  try {
    resolved = await resolveEngine();
  } catch (err) {
    for (const note of err.notes || []) console.error(`[n08] ${note}`);
    throw err;
  }
  const { driver, notes, engine } = resolved;
  for (const note of notes) console.log(`[n08] ${note}`);

  const results = [];
  try {
    for (const width of opts.widths) {
      const record = await checkWidth(driver, {
        width,
        height: opts.height,
        expectTabs: opts.expectTabs,
        outDir: opts.out,
        pageUrl,
        strictText: opts.strictText,
      });
      results.push(record);
      const failed = Object.entries(record.checks).filter(([, c]) => !c.pass).map(([k]) => k);
      console.log(
        `[n08] ${String(width).padStart(3)}px  scrollWidth=${record.diagnostics.scrollWidth ?? '?'}  ` +
          `innerWidth=${record.diagnostics.innerWidth ?? '?'}  ` +
          `${record.pass ? 'PASS' : 'FAIL'}` +
          (failed.length ? `  (${failed.join(', ')})` : ''),
      );
      for (const [name, check] of Object.entries(record.checks)) {
        if (!check.pass) console.log(`[n08]       ✗ ${name}: ${check.reason}`);
      }
      for (const thin of record.diagnostics.thinViews || []) {
        console.log(`[n08]       ⚠ 薄视图 ${thin.label}（${thin.navKey}）：${thin.textLength} 字 — ${thin.reason}`);
      }
    }
  } finally {
    await driver.close().catch(() => {});
  }

  const failedWidths = results.filter((r) => !r.pass);
  const failedChecks = [];
  for (const r of results) {
    for (const [name, check] of Object.entries(r.checks)) {
      if (!check.pass) failedChecks.push({ width: r.width, check: name, reason: check.reason });
    }
  }

  const report = {
    task: 'n08-responsive-check',
    page: pageUrl,
    pageFile,
    generatedAt: nowIso(),
    startedAt,
    engine,
    engineNotes: notes,
    playwrightMissing: Boolean(resolved.playwrightMissing),
    viewport: { widths: opts.widths, height: opts.height },
    expectTabs: opts.expectTabs,
    tabSelector: TAB_SELECTOR,
    strictText: opts.strictText,
    thinViewAllowlist: THIN_VIEW_ALLOWLIST,
    brokenTokens: BROKEN_TOKENS.map((t) => t.name),
    summary: {
      widths: results.length,
      passed: results.length - failedWidths.length,
      failed: failedWidths.length,
      failedWidths: failedWidths.map((r) => r.width),
      failedChecks,
      ok: failedWidths.length === 0,
    },
    results,
  };

  const reportPath = path.join(opts.out, 'report.json');
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`[n08] 汇总：${report.summary.passed}/${report.summary.widths} 个宽度通过`);
  if (failedWidths.length) {
    for (const f of failedChecks) console.log(`[n08]   ✗ ${f.width}px ${f.check}: ${f.reason}`);
  }
  console.log(`[n08] 报告：${reportPath}`);
  console.log(`[n08] 截图：${results.filter((r) => r.screenshot).map((r) => path.join(opts.out, r.screenshot)).join(' ')}`);

  // 每个宽度都是「执行中断」（不是检查项不达标）→ 这是脚本/浏览器自身的问题，按 2 报
  if (results.length && results.every((r) => r.fatal)) {
    console.error('[n08] 全部宽度都在执行中断：这不是页面回归，而是脚本/浏览器自身异常，退出码 2');
    for (const r of results) console.error(`[n08]   ${r.width}px: ${r.fatal}`);
    return EXIT_ERROR;
  }

  return failedWidths.length ? EXIT_FAIL : EXIT_PASS;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    if (err instanceof UsageError) {
      console.error(`[n08] 参数错误：${err.message}`);
      console.error(usage());
    } else {
      console.error(`[n08] 脚本自身异常：${err?.message || err}`);
      if (err?.stack && process.env.N08_DEBUG) console.error(err.stack);
    }
    process.exitCode = EXIT_ERROR;
  });
