// Zone 13 online server: serves index.html and relays player state between everyone in the same room.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, MAX_PER_ROOM = 24, rooms = new Map();
let nid = 1;
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); return res.end('index.html not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const send = (w, o) => { if (w.readyState === 1) w.send(JSON.stringify(o)); };
wss.on('connection', (ws, req) => {
  const name = (new URL(req.url, 'http://x').searchParams.get('room') || 'main').replace(/[^\w-]/g, '').slice(0, 24) || 'main';
  let room = rooms.get(name);
  if (!room) { room = new Map(); rooms.set(name, room); }
  if (room.size >= MAX_PER_ROOM) { ws.close(1013, 'room full'); return; }
  const id = (nid++).toString(36) + Math.random().toString(36).slice(2, 6);
  ws.alive = true; ws.last = 0; ws.state = {};
  ws.on('pong', () => { ws.alive = true; });
  send(ws, { t: 'hi', id: id, peers: [...room].map(([k, w]) => [k, w.state]) });
  for (const w of room.values()) send(w, { t: 'j', id: id });
  room.set(id, ws);
  ws.on('message', raw => {
    const now = Date.now();
    if (now - ws.last < 40) return;
    ws.last = now;
    let o;
    try { o = JSON.parse(raw); } catch (e) { return; }
    if (!o || o.t !== 'p' || !o.d || typeof o.d !== 'object' || Array.isArray(o.d)) return;
    ws.state = o.d;
    for (const [k, w] of room) if (k !== id) send(w, { t: 'p', id: id, d: o.d });
  });
  ws.on('close', () => {
    room.delete(id);
    if (!room.size) rooms.delete(name);
    for (const w of room.values()) send(w, { t: 'l', id: id });
  });
  ws.on('error', () => {});
});
setInterval(() => {
  for (const room of rooms.values()) for (const w of room.values()) {
    if (!w.alive) { w.terminate(); continue; }
    w.alive = false; w.ping();
  }
}, 30000);
server.listen(PORT, () => console.log('Zone 13 online server on port ' + PORT));
