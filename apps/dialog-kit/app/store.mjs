/**
 * 运行时存储：会话与记忆落 JSON，测试可注入临时目录。
 */

import fs from 'node:fs';
import path from 'node:path';

export class RuntimeStore {
  constructor({dir}) {
    this.dir = path.resolve(dir);
    fs.mkdirSync(this.dir, {recursive: true});
  }

  fileFor(sessionId) {
    if (!/^s_[A-Za-z0-9_-]{1,64}$/.test(String(sessionId || ''))) {
      throw new Error(`非法会话标识：${sessionId}`);
    }
    return path.join(this.dir, `${sessionId}.json`);
  }

  save(session) {
    const file = this.fileFor(session.sessionId);
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(session, null, 2), 'utf8');
    fs.renameSync(temp, file);
    return session;
  }

  get(sessionId) {
    try {
      return JSON.parse(fs.readFileSync(this.fileFor(sessionId), 'utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
}