import fs from 'node:fs/promises';
const port = Number(process.argv[2] || 9224);
const out = process.argv[3];
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((x) => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, {once: true}));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
    ws.send(JSON.stringify({id: i, method, params}));
});
await send('Page.enable');
const shot = await send('Page.captureScreenshot', {format: 'png'});
await fs.writeFile(out, Buffer.from(shot.data, 'base64'));
ws.close();
console.log(out);