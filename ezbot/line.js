'use strict';

/*
 * line.js — ตัวเชื่อม LINE Official Account (ขั้นตอนที่ 6)
 * ------------------------------------------------------
 * โมดูลนี้ "พร้อมใช้งานจริง" แต่ต้องมี 3 อย่างก่อน:
 *   1) บัญชี LINE Official Account + เปิด Messaging API (จาก LINE Developers Console)
 *   2) ค่า Channel access token และ Channel secret
 *   3) เซิร์ฟเวอร์ที่เข้าถึงได้จากภายนอก (public URL) เพื่อตั้งเป็น Webhook
 *
 * วิธีเปิดใช้งาน:
 *   - ตั้ง environment variables: LINE_TOKEN, LINE_SECRET
 *   - ใน server.js เพิ่ม:  require('./line').attach(server, { db, emitMessage, handleCustomerMessage });
 *   - นำ public URL ของคุณ + path "/webhook/line" ไปใส่ในช่อง Webhook URL ของ LINE
 *
 * หมายเหตุ: โค้ดนี้ต้องการการเชื่อมต่ออินเทอร์เน็ตและคีย์จริง จึงรันไม่ได้ในแซนด์บ็อกซ์นี้
 */

const crypto = require('crypto');

// ตรวจลายเซ็นว่า request มาจาก LINE จริง (ความปลอดภัยสำคัญมาก ห้ามข้าม)
function verifySignature(body, signature, secret) {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return hash === signature;
}

// ส่งข้อความตอบกลับไปยังผู้ใช้ LINE (รองรับทั้งข้อความและรูปภาพ)
// mediaUrl ต้องเป็น URL แบบ absolute (https) เท่านั้น
async function replyToLine(replyToken, text, token, mediaUrl) {
  const messages = [];
  if (text) messages.push({ type: 'text', text });
  if (mediaUrl) messages.push({ type: 'image', originalContentUrl: mediaUrl, previewImageUrl: mediaUrl });
  if (messages.length === 0) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });
}

/*
 * attach — ติด webhook endpoint เข้ากับเซิร์ฟเวอร์
 * deps = { db, emitMessage, handleCustomerMessage }
 *   handleCustomerMessage(conv, text) -> ให้บอทพิจารณาตอบ (ใช้ตัวเดียวกับใน server.js)
 */
function attach(deps) {
  const TOKEN = process.env.LINE_TOKEN;
  const SECRET = process.env.LINE_SECRET;

  // คืนฟังก์ชัน handler ให้ server.js เรียกเมื่อเจอ path /webhook/line
  return async function lineWebhook(req, res, rawBody) {
    if (!TOKEN || !SECRET) {
      res.writeHead(503);
      return res.end('LINE not configured');
    }
    const signature = req.headers['x-line-signature'];
    if (!verifySignature(rawBody, signature, SECRET)) {
      res.writeHead(401);
      return res.end('bad signature');
    }

    const payload = JSON.parse(rawBody);
    for (const ev of payload.events || []) {
      if (ev.type === 'message' && ev.message.type === 'text') {
        const lineUserId = ev.source.userId;
        const convId = 'line_' + lineUserId; // หนึ่งผู้ใช้ LINE = หนึ่งห้องสนทนา

        let conv = deps.db.getConversation(convId);
        if (!conv) conv = deps.db.createConversation({ id: convId, customerName: 'ลูกค้า LINE', source: 'line' });

        const text = ev.message.text;
        const msg = deps.db.addMessage(convId, { sender: 'customer', text });
        deps.emitMessage(convId, msg);

        // ให้บอทตัดสินใจตอบ แล้วส่งกลับเข้า LINE
        if (conv.mode !== 'human') {
          const bot = require('./bot');
          const history = deps.db.getMessages(convId).slice(-12);
          const decision = await bot.decideReply(text, history, conv);

          if (decision.handoff) {
            deps.db.updateConversation(convId, { mode: 'human', status: 'waiting' });
            if (typeof deps.broadcastToAdmins === 'function') {
              deps.broadcastToAdmins('handoff', { conversationId: convId });
            }
          }

          if (decision.text || decision.mediaUrl) {
            const botMsg = deps.db.addMessage(convId, {
              sender: 'bot',
              text: decision.text,
              kind: decision.kind || 'text',
              mediaUrl: decision.mediaUrl || null,
            });
            deps.emitMessage(convId, botMsg);
            const mediaAbs = deps.db.absoluteMediaUrl(decision.mediaUrl);
            await replyToLine(ev.replyToken, decision.text, TOKEN, mediaAbs);
          }
        }
      }
    }
    res.writeHead(200);
    res.end('OK');
  };
}

module.exports = { attach, verifySignature, replyToLine };
