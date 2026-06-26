'use strict';

/*
 * server.js — เซิร์ฟเวอร์หลัก (ไม่ใช้ dependency ภายนอก)
 * ----------------------------------------------------
 * - เสิร์ฟไฟล์หน้าเว็บใน public/
 * - REST API สำหรับส่ง/ดึงข้อความและบทสนทนา
 * - เรียลไทม์ด้วย SSE (Server-Sent Events): เซิร์ฟเวอร์ push ข้อความให้ client
 * - ผูกกับ db.js (เก็บข้อมูล) และ bot.js (สมองบอท)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const bot = require('./bot');
const line = require('./line');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- จัดการการเชื่อมต่อ SSE ----------
// ผู้ฟังของแต่ละบทสนทนา (สำหรับ widget) และผู้ฟังฝั่งแอดมิน (เห็นทุกห้อง)
const convClients = new Map(); // conversationId -> Set<res>
const adminClients = new Set();

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastToConversation(conversationId, event, data) {
  const set = convClients.get(conversationId);
  if (set) for (const res of set) sseSend(res, event, data);
}

function broadcastToAdmins(event, data) {
  for (const res of adminClients) sseSend(res, event, data);
}

// เมื่อมีข้อความใหม่ แจ้งทั้งห้องนั้นและแอดมินทุกคน
function emitMessage(conversationId, msg) {
  broadcastToConversation(conversationId, 'message', msg);
  broadcastToAdmins('message', msg);
}

// ---------- ตัวช่วยอ่าน body แบบ JSON ----------
function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const body = buffer.toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------- ตรรกะเมื่อมีข้อความจากลูกค้า: ให้บอทตอบ ----------
async function handleCustomerMessage(conv, text) {
  // ถ้าอยู่โหมดคนตอบ (human) บอทไม่ตอบ แค่แจ้งแอดมิน
  if (conv.mode === 'human') return;

  const history = db.getMessages(conv.id).slice(-12); // ส่ง 12 ข้อความล่าสุดเป็นบริบท
  const decision = await bot.decideReply(text, history);

  if (decision.handoff) {
    db.updateConversation(conv.id, { mode: 'human', status: 'waiting' });
    broadcastToAdmins('handoff', { conversationId: conv.id });
  }

  if (decision.text) {
    // หน่วงเล็กน้อยให้เหมือนคนพิมพ์
    await new Promise((r) => setTimeout(r, 400));
    const botMsg = db.addMessage(conv.id, { sender: 'bot', text: decision.text });
    emitMessage(conv.id, botMsg);
  }
}

// สร้าง handler ของ LINE (ใช้เมื่อมีการตั้งค่า LINE_TOKEN/LINE_SECRET)
const lineWebhook = line.attach({ db, emitMessage, handleCustomerMessage });

// ---------- เราเตอร์หลัก ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // ===== CORS: อนุญาตให้เว็บภายนอกเรียก API ได้ (สำหรับ Widget iframe) =====
  if (pathname.startsWith('/api/')) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ===== Webhook ของ LINE (ขั้นตอนที่ 6) — ต้องอ่าน raw body เพื่อตรวจลายเซ็น =====
  if (pathname === '/webhook/line' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => lineWebhook(req, res, raw).catch((e) => {
      console.error('line webhook error:', e);
      res.writeHead(500); res.end('error');
    }));
    return;
  }

  // ===== SSE: สตรีมของบทสนทนาหนึ่งห้อง (ใช้โดย widget) =====
  if (pathname === '/api/stream' && req.method === 'GET') {
    const cid = url.searchParams.get('conversationId');
    if (!cid) return sendJson(res, 400, { error: 'conversationId required' });
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    if (!convClients.has(cid)) convClients.set(cid, new Set());
    convClients.get(cid).add(res);
    req.on('close', () => convClients.get(cid)?.delete(res));
    return;
  }

  // ===== SSE: สตรีมฝั่งแอดมิน (เห็นทุกห้อง) =====
  if (pathname === '/api/admin-stream' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    adminClients.add(res);
    req.on('close', () => adminClients.delete(res));
    return;
  }

  // ===== สร้าง/ดึงบทสนทนา (widget เรียกตอนเปิดแชท) =====
  if (pathname === '/api/conversations' && req.method === 'POST') {
    const body = await readJson(req);
    const conv = db.createConversation({
      id: body.conversationId,
      customerName: body.customerName,
      email: body.email,
      phone: body.phone,
      avatarUrl: body.avatarUrl,
    });
    broadcastToAdmins('conversation', conv);
    return sendJson(res, 200, conv);
  }

  // ===== รายการบทสนทนาทั้งหมด (แอดมิน) =====
  if (pathname === '/api/conversations' && req.method === 'GET') {
    return sendJson(res, 200, db.listConversations());
  }

  // ===== ดึงข้อความในห้องหนึ่ง =====
  const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgMatch && req.method === 'GET') {
    const cid = decodeURIComponent(msgMatch[1]);
    return sendJson(res, 200, db.getMessages(cid));
  }

  // ===== สลับโหมด บอท <-> คน =====
  const modeMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/mode$/);
  if (modeMatch && req.method === 'POST') {
    const cid = decodeURIComponent(modeMatch[1]);
    const body = await readJson(req);
    const conv = db.updateConversation(cid, {
      mode: body.mode === 'human' ? 'human' : 'bot',
      status: 'open',
    });
    if (!conv) return sendJson(res, 404, { error: 'not found' });
    broadcastToAdmins('conversation', conv);
    return sendJson(res, 200, conv);
  }

  // ===== ส่งข้อความ (ทั้งลูกค้าและแอดมิน) =====
  if (pathname === '/api/messages' && req.method === 'POST') {
    const body = await readJson(req);
    const { conversationId, sender, text } = body;
    if (!conversationId || !sender || !text) {
      return sendJson(res, 400, { error: 'conversationId, sender, text required' });
    }
    let conv = db.getConversation(conversationId);
    if (!conv || (sender === 'customer' && (body.customerName || body.email || body.phone || body.avatarUrl))) {
      conv = db.createConversation({
        id: conversationId,
        customerName: body.customerName,
        email: body.email,
        phone: body.phone,
        avatarUrl: body.avatarUrl,
      });
    }

    if (sender === 'admin') db.updateConversation(conversationId, { unread: 0 });

    const msg = db.addMessage(conversationId, { sender, text });
    emitMessage(conversationId, msg);

    // ลูกค้าส่งมา -> ให้บอทพิจารณาตอบ (ไม่บล็อกการตอบกลับ HTTP)
    if (sender === 'customer') {
      handleCustomerMessage(db.getConversation(conversationId), text).catch((e) =>
        console.error('bot error:', e)
      );
    }
    return sendJson(res, 200, msg);
  }

  // ===== จัดการคีย์เวิร์ดบทสนทนาอัตโนมัติ (Rules) =====
  if (pathname === '/api/bot/rules' && req.method === 'GET') {
    return sendJson(res, 200, db.getRules());
  }

  if (pathname === '/api/bot/rules' && req.method === 'POST') {
    const body = await readJson(req);
    if (!Array.isArray(body.rules)) {
      return sendJson(res, 400, { error: 'rules array required' });
    }
    const updated = db.saveRules(body.rules);
    return sendJson(res, 200, { success: true, rules: updated });
  }

  // ===== จัดการตั้งค่า AI / Handoff (Settings) =====
  if (pathname === '/api/bot/settings' && req.method === 'GET') {
    const settings = db.getBotSettings();
    const hasGeminiKey = !!process.env.GEMINI_API_KEY || !!settings.geminiApiKey;
    const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY || !!settings.anthropicApiKey;
    const hasApiKey = hasGeminiKey || hasClaudeKey;
    return sendJson(res, 200, Object.assign({}, settings, { hasApiKey, hasGeminiKey, hasClaudeKey }));
  }

  if (pathname === '/api/bot/settings' && req.method === 'POST') {
    const body = await readJson(req);
    const updated = db.saveBotSettings(body);
    return sendJson(res, 200, { success: true, settings: updated });
  }

  // ===== เสิร์ฟไฟล์หน้าเว็บ =====
  let filePath =
    pathname === '/' ? '/admin.html' : decodeURIComponent(pathname);
  const full = path.join(PUBLIC_DIR, filePath);
  if (!full.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });

  fs.readFile(full, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    const ext = path.extname(full);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
    const headers = { 'content-type': (types[ext] || 'text/plain') + '; charset=utf-8' };

    // อนุญาตให้เว็บภายนอกโหลด widget.js และ widget.html ข้าม domain ได้
    const basename = path.basename(full);
    if (basename === 'widget.js' || basename === 'widget.html') {
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

// ส่ง ping เป็นระยะ กันการเชื่อมต่อ SSE หลุด
setInterval(() => {
  const ping = () => {};
  for (const set of convClients.values()) for (const r of set) r.write(': ping\n\n');
  for (const r of adminClients) r.write(': ping\n\n');
  ping();
}, 25000);

server.listen(PORT, () => {
  console.log(`\n  HappyBot ทำงานที่ http://localhost:${PORT}`);
  console.log(`  - หน้าแอดมิน:  http://localhost:${PORT}/admin.html`);
  console.log(`  - แชทลูกค้า:   http://localhost:${PORT}/widget.html\n`);
});
