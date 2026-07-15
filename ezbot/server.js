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
const facebook = require('./facebook');

const PORT = process.env.PORT || 8080;
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
  
  // ถ้าเป็นข้อความจากแอดมิน หรือระบบบรอดแคสต์ ให้ส่งออกไปยัง API ภายนอกด้วย
  if (msg.sender === 'admin' || msg.senderName === 'ระบบบรอดแคสต์') {
    sendExternalMessage(conversationId, msg.text, msg.mediaUrl).catch(err => {
      console.error('Error sending external message:', err);
    });
  }
}

// ส่งข้อความ (และรูปภาพ) ไปหา API ภายนอก (LINE หรือ Facebook) เมื่อมีการส่งข้อความออก
async function sendExternalMessage(conversationId, text, mediaUrl) {
  const settings = db.getBotSettings();
  const mediaAbs = db.absoluteMediaUrl(mediaUrl);
  if (conversationId.startsWith('line_')) {
    const lineToken = settings.lineChannelToken || process.env.LINE_TOKEN;
    if (lineToken) {
      const lineUserId = conversationId.replace('line_', '');
      const messages = [];
      if (text) messages.push({ type: 'text', text });
      if (mediaAbs) messages.push({ type: 'image', originalContentUrl: mediaAbs, previewImageUrl: mediaAbs });
      if (messages.length === 0) return;
      try {
        await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${lineToken}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages,
          }),
        });
      } catch (err) {
        console.error('Failed to push message to LINE:', err);
      }
    }
  } else if (conversationId.startsWith('facebook_')) {
    const fbToken = settings.facebookPageToken;
    if (fbToken) {
      const fbPsid = conversationId.replace('facebook_', '');
      // Facebook Send API ส่งได้ทีละหนึ่ง message → ส่ง text ก่อน แล้วตามด้วยรูป
      const sendFb = async (message) => {
        try {
          await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${fbToken}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              recipient: { id: fbPsid },
              message,
            }),
          });
        } catch (err) {
          console.error('Failed to push message to Facebook:', err);
        }
      };
      if (text) await sendFb({ text });
      if (mediaAbs) await sendFb({ attachment: { type: 'image', payload: { url: mediaAbs, is_reusable: true } } });
    }
  }
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
async function handleCustomerMessage(conv, text, kind) {
  // ถ้าอยู่โหมดคนตอบ (human) บอทไม่ตอบ แค่แจ้งแอดมิน
  if (conv.mode === 'human') return;

  // หากส่งรูปภาพมา และไม่ได้เปิดใช้งาน AI หรือช่องทางนี้ปิดใช้งานวิเคราะห์รูปภาพ ให้โอนย้ายให้แอดมินคนตอบแทนทันที
  const settings = db.getBotSettings();
  const source = conv ? (conv.source || 'Web Chat') : 'Web Chat';
  let channelKey = 'web';
  if (source === 'LINE Official' || source === 'LINE OA' || source === 'line') {
    channelKey = 'line';
  } else if (source === 'Facebook Page' || source === 'Facebook Messenger' || source === 'facebook') {
    channelKey = 'facebook';
  }
  const channelConfig = (settings.channels && settings.channels[channelKey]) ? settings.channels[channelKey] : {};
  const isVisionEnabled = (channelConfig.visionEnabled !== undefined) ? channelConfig.visionEnabled : true;

  if (kind === 'image' && (!settings.aiEnabled || !isVisionEnabled)) {
    db.updateConversation(conv.id, { mode: 'human', status: 'waiting' });
    broadcastToAdmins('handoff', { conversationId: conv.id });
    
    // ตอบข้อความแจ้งเตือนอัตโนมัติของบอท
    await new Promise((r) => setTimeout(r, 400));
    const botMsg = db.addMessage(conv.id, { sender: 'bot', text: 'ได้รับรูปภาพเรียบร้อยแล้วค่ะ แอดมินกำลังตรวจสอบความถูกต้องให้นะคะ รอสักครู่ค่ะ 🙏' });
    emitMessage(conv.id, botMsg);
    return;
  }

  const history = db.getMessages(conv.id).slice(-12); // ส่ง 12 ข้อความล่าสุดเป็นบริบท
  const decision = await bot.decideReply(text, history, conv);

  if (decision.handoff) {
    db.updateConversation(conv.id, { mode: 'human', status: 'waiting' });
    broadcastToAdmins('handoff', { conversationId: conv.id });
  }

  if (decision.text) {
    // หน่วงเล็กน้อยให้เหมือนคนพิมพ์
    await new Promise((r) => setTimeout(r, 400));
    const botMsg = db.addMessage(conv.id, { 
      sender: 'bot', 
      text: decision.text,
      kind: decision.kind || 'text',
      mediaUrl: decision.mediaUrl || null
    });
    emitMessage(conv.id, botMsg);
  }
}

// สร้าง handler ของ LINE (ใช้เมื่อมีการตั้งค่า LINE_TOKEN/LINE_SECRET)
const lineWebhook = line.attach({ db, emitMessage, handleCustomerMessage, broadcastToAdmins });

// สร้าง handler ของ Facebook
const facebookWebhook = facebook.attach({ db, emitMessage, handleCustomerMessage, broadcastToAdmins });

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

  // ===== Webhook ของ Facebook (GET) — ยืนยันการเชื่อมต่อ Webhook =====
  if (pathname === '/webhook/facebook' && req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const settings = db.getBotSettings();
    const expectedToken = settings.facebookVerifyToken;

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('Facebook webhook verified!');
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(challenge);
    } else {
      console.warn('Facebook webhook verification failed. Token mismatch.');
      res.writeHead(403);
      res.end('Forbidden');
    }
    return;
  }

  // ===== Webhook ของ Facebook (POST) — รับข้อความเข้ามา =====
  if (pathname === '/webhook/facebook' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => facebookWebhook(req, res, raw).catch((e) => {
      console.error('facebook webhook error:', e);
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
      'x-accel-buffering': 'no'
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
      'x-accel-buffering': 'no'
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
      customerId: body.customerId,
      customerName: body.customerName,
      email: body.email,
      phone: body.phone,
      avatarUrl: body.avatarUrl,
      topic: body.topic,
      source: body.source,
    });
    broadcastToAdmins('conversation', conv);
    return sendJson(res, 200, conv);
  }

  // ===== ดึงประวัติแชทของลูกค้า 1 คน =====
  const customerHistoryMatch = pathname.match(/^\/api\/customers\/([^/]+)\/conversations$/);
  if (customerHistoryMatch && req.method === 'GET') {
    const customerId = decodeURIComponent(customerHistoryMatch[1]);
    const allConvs = db.listConversations();
    const customerConvs = allConvs.filter(c => c.customerId === customerId);
    return sendJson(res, 200, customerConvs);
  }

  // ===== รายการบทสนทนาทั้งหมด (แอดมิน) =====
  if (pathname === '/api/conversations' && req.method === 'GET') {
    return sendJson(res, 200, db.listConversations());
  }

  // ===== เคลียร์ข้อมูลทั้งหมด (ใช้ชั่วคราว) =====
  if (pathname === '/api/clear-all' && req.method === 'POST') {
    db.clearAllData();
    broadcastToAdmins('clear_all', {});
    for (const [cid, set] of convClients.entries()) {
      for (const res of set) sseSend(res, 'clear_all', {});
    }
    return sendJson(res, 200, { success: true });
  }

  // ===== ดึงข้อความในห้องหนึ่ง =====
  const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgMatch && req.method === 'GET') {
    const cid = decodeURIComponent(msgMatch[1]);
    return sendJson(res, 200, db.getMessages(cid));
  }
  // ===== ดึงประวัติออเดอร์และประวัติเติมเงินภายนอกจาก Next.js (สำหรับแอดมินดูแถบขวา) =====
  const extOrdersMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/external-orders$/);
  if (extOrdersMatch && req.method === 'GET') {
    const cid = decodeURIComponent(extOrdersMatch[1]);
    const conv = db.getConversation(cid);
    if (!conv) return sendJson(res, 404, { error: 'not found' });

    const internalSecret = process.env.EZBOT_INTERNAL_SECRET || 'fallback_default_secret_key';
    const mainSiteUrl = process.env.MAIN_SITE_URL || 'http://127.0.0.1:3000';

    try {
      const queryRes = await fetch(`${mainSiteUrl}/api/internal/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${internalSecret}`
        },
        body: JSON.stringify({
          queryType: 'orders_by_customer',
          email: conv.email || '',
          phone: conv.phone || ''
        })
      });

      if (!queryRes.ok) {
        const errText = await queryRes.text();
        console.error('Next.js query error response:', errText);
        return sendJson(res, queryRes.status, { error: 'Failed to query database' });
      }

      const queryData = await queryRes.json();
      return sendJson(res, 200, { success: true, orders: queryData.orders || [] });
    } catch (err) {
      console.error('Error fetching external orders:', err.message);
      return sendJson(res, 500, { success: false, error: 'Internal server error' });
    }
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

  // ===== จบการสนทนา =====
  const closeMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/close$/);
  if (closeMatch && req.method === 'POST') {
    const cid = decodeURIComponent(closeMatch[1]);
    const conv = db.updateConversation(cid, {
      status: 'closed',
    });
    if (!conv) return sendJson(res, 404, { error: 'not found' });
    
    // ส่งข้อความแจ้งให้ลูกค้าทราบในแชทว่าจบสนทนาแล้ว
    const sysMsg = db.addMessage(cid, { sender: 'bot', text: 'แอดมินได้จบการสนทนานี้แล้ว รบกวนให้คะแนนความพึงพอใจด้วยนะคะ 🌟' });
    broadcastToConversation(cid, 'message', sysMsg);
    
    broadcastToAdmins('conversation', conv);
    broadcastToConversation(cid, 'status_changed', { status: 'closed' });
    return sendJson(res, 200, conv);
  }

  // ===== เปิดการสนทนาใหม่/Reopen =====
  const reopenMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/reopen$/);
  if (reopenMatch && req.method === 'POST') {
    const cid = decodeURIComponent(reopenMatch[1]);
    const conv = db.updateConversation(cid, {
      status: 'open',
      rating: null
    });
    if (!conv) return sendJson(res, 404, { error: 'not found' });
    
    broadcastToAdmins('conversation', conv);
    broadcastToConversation(cid, 'status_changed', { status: 'open' });
    return sendJson(res, 200, conv);
  }


  // ===== ประเมินความพึงพอใจ =====
  const ratingMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/rating$/);
  if (ratingMatch && req.method === 'POST') {
    const cid = decodeURIComponent(ratingMatch[1]);
    const body = await readJson(req);
    const conv = db.updateConversation(cid, {
      rating: { score: body.score, comment: body.comment || '' },
    });
    if (!conv) return sendJson(res, 404, { error: 'not found' });
    broadcastToAdmins('conversation', conv);
    return sendJson(res, 200, conv);
  }

  // ===== อัปเดตข้อมูลบทสนทนาแบบครอบคลุม (ติดดาว, แท็ก, โน้ต) =====
  const convUpdateMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (convUpdateMatch && req.method === 'POST') {
    const cid = decodeURIComponent(convUpdateMatch[1]);
    const body = await readJson(req);
    const conv = db.updateConversation(cid, body);
    if (!conv) return sendJson(res, 404, { error: 'not found' });
    broadcastToAdmins('conversation', conv);
    return sendJson(res, 200, conv);
  }

  // ===== อัปโหลดไฟล์แบบ Zero-Dependency =====
  if (pathname === '/api/upload' && req.method === 'POST') {
    const body = await readJson(req);
    const { filename, base64 } = body;
    if (!filename || !base64) {
      return sendJson(res, 400, { error: 'filename and base64 required' });
    }
    
    try {
      const cleanName = path.basename(filename);
      const uploadDir = path.join(PUBLIC_DIR, 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(path.join(uploadDir, cleanName), buffer);
      
      return sendJson(res, 200, { success: true, url: `/uploads/${cleanName}` });
    } catch (err) {
      console.error('Upload error:', err);
      return sendJson(res, 500, { error: 'Failed to save uploaded file' });
    }
  }

  // ===== ส่งข้อความ (ทั้งลูกค้าและแอดมิน) =====
  if (pathname === '/api/messages' && req.method === 'POST') {
    const body = await readJson(req);
    const { conversationId, sender, text } = body;
    if (!conversationId || !sender || (!text && !body.mediaUrl)) {
      return sendJson(res, 400, { error: 'conversationId, sender, and text/mediaUrl required' });
    }
    let conv = db.getConversation(conversationId);
    if (!conv || (sender === 'customer' && (body.customerName || body.email || body.phone || body.avatarUrl))) {
      conv = db.createConversation({
        id: conversationId,
        customerName: body.customerName,
        email: body.email,
        phone: body.phone,
        avatarUrl: body.avatarUrl,
        source: body.source,
      });
    }

    if (sender === 'admin') db.updateConversation(conversationId, { unread: 0 });

    // ถ้าห้องแชทถูกปิดอยู่ แต่ลูกค้าส่งข้อความเข้ามาใหม่ ให้เปิดห้องแชทและบรอดแคสต์สถานะ open อัตโนมัติ
    if (conv && sender === 'customer' && conv.status === 'closed') {
      conv = db.updateConversation(conversationId, { status: 'open', rating: null });
      broadcastToConversation(conversationId, 'status_changed', { status: 'open' });
      broadcastToAdmins('conversation', conv);
    }

    const msg = db.addMessage(conversationId, { 
      sender, 
      text, 
      kind: body.kind, 
      mediaUrl: body.mediaUrl,
      senderName: body.senderName 
    });
    emitMessage(conversationId, msg);

    // ลูกค้าส่งมา -> ให้บอทพิจารณาตอบ (ไม่บล็อกการตอบกลับ HTTP)
    if (sender === 'customer') {
      handleCustomerMessage(db.getConversation(conversationId), text, body.kind).catch((e) =>
        console.error('bot error:', e)
      );
    }
    return sendJson(res, 200, msg);
  }

  // ===== จัดการบรอดแคสต์ (Broadcasts) =====
  if (pathname === '/api/broadcasts' && req.method === 'GET') {
    return sendJson(res, 200, db.getBroadcasts());
  }

  if (pathname === '/api/broadcasts' && req.method === 'POST') {
    const body = await readJson(req);
    const { campaignName, audience, text, mediaUrl, sendTime } = body;
    if (!campaignName || !audience || !text) {
      return sendJson(res, 400, { error: 'campaignName, audience, and text are required' });
    }

    // กรองกลุ่มเป้าหมายเพื่อคำนวณจำนวนผู้รับล่วงหน้า
    const conversations = db.listConversations();
    const targets = conversations.filter(c => {
      if (audience === 'all') return true;
      if (audience === 'active') return c.status !== 'closed';
      if (audience === 'vip') {
        const hasVipTag = c.tags && c.tags.some(t => t.toLowerCase() === 'vip');
        return c.starred || hasVipTag;
      }
      return true;
    });

    const broadcast = {
      campaignName,
      audience,
      text,
      mediaUrl: mediaUrl || null,
      sendTime: sendTime || 'now',
      status: sendTime === 'now' ? 'sent' : 'scheduled',
      scheduleTime: body.scheduleTime || null,
      recipientsCount: targets.length
    };

    const newBc = db.addBroadcast(broadcast);

    // ถ้าต้องการส่งทันที (now)
    if (newBc.status === 'sent') {
      // ส่งข้อความไปหาทีละคน
      for (const c of targets) {
        const msg = db.addMessage(c.id, {
          sender: 'bot',
          senderName: 'ระบบบรอดแคสต์',
          text,
          kind: mediaUrl ? 'image' : 'text',
          mediaUrl: mediaUrl || null
        });
        
        if (msg) {
          emitMessage(c.id, msg);
        }
      }
    }

    return sendJson(res, 200, newBc);
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

  // ===== จัดการสินค้าและราคา (Products) =====
  if (pathname === '/api/products' && req.method === 'GET') {
    return sendJson(res, 200, db.getProducts());
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    const body = await readJson(req);
    if (Array.isArray(body)) {
      const updated = db.saveProducts(body);
      return sendJson(res, 200, { success: true, products: updated });
    } else {
      const products = db.getProducts();
      if (!body.id) {
        body.id = 'prod_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000);
        products.push(body);
      } else {
        const idx = products.findIndex(p => p.id === body.id);
        if (idx !== -1) {
          products[idx] = body;
        } else {
          products.push(body);
        }
      }
      db.saveProducts(products);
      return sendJson(res, 200, { success: true, product: body });
    }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    const parts = pathname.split('/');
    const id = parts[parts.length - 1];
    const products = db.getProducts();
    const filtered = products.filter(p => p.id !== id);
    db.saveProducts(filtered);
    return sendJson(res, 200, { success: true });
  }

  // ===== จัดการผู้ใช้งาน (Users) =====
  if (pathname === '/api/users' && req.method === 'GET') {
    return sendJson(res, 200, db.getUsers().map(u => {
      const { password, ...safeUser } = u;
      return safeUser;
    }));
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    const body = await readJson(req);
    if (!Array.isArray(body.users)) {
      return sendJson(res, 400, { error: 'users array required' });
    }
    // ดึงค่าผู้ใช้ปัจจุบันเพื่อไม่ให้ลบรหัสผ่านของคนเก่าทิ้ง
    const currentUsers = db.getUsers();
    const updatedUsers = body.users.map(u => {
      const existing = currentUsers.find(cu => cu.id === u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        online: u.online ?? false,
        avatar: u.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
        password: u.password || (existing ? existing.password : '123')
      };
    });
    const saved = db.saveUsers(updatedUsers);
    return sendJson(res, 200, { success: true, users: saved.map(u => {
      const { password, ...safeUser } = u;
      return safeUser;
    }) });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readJson(req);
    const users = db.getUsers();
    const user = users.find(u => u.email === body.email && u.password === body.password);
    if (user) {
      const { password, ...safeUser } = user;
      return sendJson(res, 200, { success: true, user: safeUser });
    } else {
      return sendJson(res, 401, { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
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

// ดึงข้อมูลสินค้าและราคาอัตโนมัติจาก Next.js
async function syncProducts() {
  const internalSecret = process.env.EZBOT_INTERNAL_SECRET || 'fallback_default_secret_key';
  const mainSiteUrl = process.env.MAIN_SITE_URL || 'http://127.0.0.1:3000';

  try {
    const res = await fetch(`${mainSiteUrl}/api/internal/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalSecret}`
      },
      body: JSON.stringify({ queryType: 'products_sync' })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.products) {
        db.saveProducts(data.products);
        console.log(`[Sync] ทำการดึงรายการสินค้า ${data.products.length} เกมจากระบบหลักเรียบร้อยแล้ว`);
      }
    } else {
      console.warn(`[Sync] ดึงข้อมูลสินค้าไม่สำเร็จ: สถานะ HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[Sync] เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า: ${err.message}`);
  }
}

// อัปเดตข้อมูลทุกๆ 5 นาที
setInterval(syncProducts, 5 * 60 * 1000);
// รันอัปเดตครั้งแรกหลังรันเซิร์ฟเวอร์ไปแล้ว 5 วินาที
setTimeout(syncProducts, 5000);

server.listen(PORT, () => {
  console.log(`\n  EZ BOT ทำงานที่ http://localhost:${PORT}`);
  console.log(`  - หน้าแอดมิน:  http://localhost:${PORT}/admin.html`);
  console.log(`  - แชทลูกค้า:   http://localhost:${PORT}/widget.html\n`);
});
