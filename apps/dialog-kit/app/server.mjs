/**
 * 极简 HTTP 服务：同源 API + 静态教学台。
 * 只绑回环地址，默认端口 4190，无任何外部依赖。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ApiError, STAGE_LABELS, ACTION_LABELS, ENTITY_TYPE_LABELS, RELATION_TYPE_LABELS, isPlainObject} from './models.mjs';
import {DialogService} from './service.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(HERE, 'static');
const DEFAULT_DATA_DIR = path.join(HERE, '..', 'data', 'runtime');
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'BODY_TOO_LARGE', '请求体超过 64KB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ApiError(422, 'INVALID_JSON', '请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function assertBody(body) {
  if (!isPlainObject(body)) throw new ApiError(422, 'INVALID_BODY', '请求体必须是 JSON 对象');
  return body;
}

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(STATIC_DIR, relative);
  if (!file.startsWith(STATIC_DIR + path.sep)) {
    return sendJson(res, 400, {ok: false, code: 'INVALID_PATH', message: '非法静态路径'});
  }
  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    return sendJson(res, 404, {ok: false, code: 'NOT_FOUND', message: '页面不存在'});
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function createApp(options = {}) {
  const service = new DialogService({
    dataDir: options.dataDir || DEFAULT_DATA_DIR,
    now: options.now,
    idFactory: options.idFactory,
    samples: options.samples,
  });

  async function handle(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const route = url.pathname;

      if (route === '/api/health') {
        return sendJson(res, 200, {ok: true, service: 'dialog-kit'});
      }

      if (route === '/api/dialog/samples' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          samples: service.samplesPayload(),
          agents: service.agentsPayload(),
          labels: {stages: STAGE_LABELS, actions: ACTION_LABELS},
        });
      }

      if (route === '/api/dialog/session' && req.method === 'POST') {
        const body = assertBody(await readJson(req));
        const session = service.createSession({sampleId: body.sampleId, route: body.route});
        return sendJson(res, 200, {ok: true, session});
      }

      if (route === '/api/dialog/session' && req.method === 'GET') {
        const sessionId = url.searchParams.get('sessionId') || url.searchParams.get('id');
        const session = service.getSession(sessionId);
        return sendJson(res, 200, {ok: true, session, guide: service.stageGuide(session)});
      }

      if (route === '/api/dialog/turn' && req.method === 'POST') {
        const body = assertBody(await readJson(req));
        const result = service.submitTurn({
          sessionId: body.sessionId,
          actorId: body.actorId || body.actor,
          audienceId: body.audienceId || body.audience,
          content: body.content,
          score: body.score,
          confidence: body.confidence,
          stage: body.stage,
        });
        return sendJson(res, 200, {
          ok: true,
          event: result.event,
          session: result.session,
          guide: service.stageGuide(result.session),
          labels: {
            stage: STAGE_LABELS[service.currentStage(result.session)],
            actions: ACTION_LABELS,
            entityTypes: ENTITY_TYPE_LABELS,
            relationTypes: RELATION_TYPE_LABELS,
          },
        });
      }

      if (route === '/api/dialog/advance' && req.method === 'POST') {
        const body = assertBody(await readJson(req));
        const result = service.advance(body.sessionId);
        return sendJson(res, 200, {
          ok: true,
          session: result.session,
          guide: result.guide,
          stageLabel: STAGE_LABELS[service.currentStage(result.session)],
        });
      }

      if (route === '/api/dialog/rewind' && req.method === 'POST') {
        const body = assertBody(await readJson(req));
        const result = service.rewind(body.sessionId);
        return sendJson(res, 200, {
          ok: true,
          session: result.session,
          guide: result.guide,
          stageLabel: STAGE_LABELS[service.currentStage(result.session)],
          canContinue: true,
        });
      }

      if (route === '/api/dialog/route' && req.method === 'POST') {
        const body = assertBody(await readJson(req));
        const session = service.switchRoute(body.sessionId, body.route);
        return sendJson(res, 200, {
          ok: true,
          session,
          guide: service.stageGuide(session),
          stageLabel: STAGE_LABELS[service.currentStage(session)],
        });
      }

      if (route === '/api/dialog/confirm' && req.method === 'POST') {
        const body = assertBody(await readJson(req));
        const result = service.confirm({
          sessionId: body.sessionId,
          suggestionId: body.suggestionId,
          accepted: body.accepted,
        });
        return sendJson(res, 200, {ok: true, ...result});
      }

      if (route === '/api/memory/suggestions' && req.method === 'GET') {
        const sessionId = url.searchParams.get('sessionId');
        return sendJson(res, 200, {
          ok: true,
          sessionId,
          suggestions: service.memorySuggestions(sessionId),
        });
      }

      if (req.method === 'GET') return serveStatic(res, route);
      return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: '不支持的请求方法'});
    } catch (error) {
      if (error instanceof ApiError) {
        return sendJson(res, error.status, {ok: false, code: error.code, message: error.message});
      }
      return sendJson(res, 500, {ok: false, code: 'INTERNAL_ERROR', message: '服务内部错误'});
    }
  }

  return {handle, service};
}

export function startServer({port = Number(process.env.PORT) || 4190, host = '127.0.0.1', ...options} = {}) {
  const app = createApp(options);
  const server = http.createServer((req, res) => {
    app.handle(req, res);
  });
  server.listen(port, host, () => {
    const actual = server.address().port;
    process.stdout.write(`四路口对话教学已启动：http://${host}:${actual}\n`);
  });
  return {server, service: app.service};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}