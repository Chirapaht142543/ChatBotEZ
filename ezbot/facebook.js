'use strict';

const crypto = require('crypto');

// ตรวจสอบลายเซ็น (Signature Verification) จาก Facebook เพื่อความปลอดภัย
function verifySignature(body, signature, secret) {
  if (!signature) return false;
  try {
    const parts = signature.split('=');
    if (parts[0] !== 'sha256') return false;
    const expectedSignature = parts[1];
    
    const actualSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
      
    return expectedSignature === actualSignature;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// ฟังก์ชันกลางสำหรับยิง Send API ของ Facebook (หนึ่ง message ต่อหนึ่งครั้ง)
async function sendFacebookMessage(recipientId, message, token) {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Facebook Send API error:', errData);
    }
  } catch (err) {
    console.error('Facebook Send API network error:', err);
  }
}

// ส่งข้อความ (text) ตอบกลับไปยังลูกค้าบน Facebook Messenger
async function sendToFacebook(recipientId, text, token) {
  return sendFacebookMessage(recipientId, { text }, token);
}

// ส่งรูปภาพตอบกลับไปยังลูกค้าบน Facebook Messenger (imageUrl ต้องเป็น absolute URL)
async function sendFacebookImage(recipientId, imageUrl, token) {
  return sendFacebookMessage(
    recipientId,
    { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } },
    token
  );
}

// ดึงห้องสนทนาของลูกค้า Facebook — ถ้ายังไม่มีให้สร้างใหม่ (พร้อมดึงโปรไฟล์)
async function ensureConversation(deps, senderId, token) {
  const convId = 'facebook_' + senderId;
  const existing = deps.db.getConversation(convId);
  if (existing) return existing;

  let customerName = 'ลูกค้า Facebook';
  let avatarUrl = '';

  // พยายามดึงข้อมูลโปรไฟล์ของลูกค้าจาก Facebook Graph API
  try {
    const profileRes = await fetch(`https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${token}`);
    if (profileRes.ok) {
      const profile = await profileRes.json();
      customerName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'ลูกค้า Facebook';
      avatarUrl = profile.profile_pic || '';
    }
  } catch (err) {
    console.error('Error fetching Facebook user profile:', err);
  }

  return deps.db.createConversation({
    id: convId,
    customerName,
    avatarUrl,
    source: 'facebook',
  });
}

/*
 * attach — ติดตั้ง Webhook Endpoint ของ Facebook
 * deps = { db, emitMessage, handleCustomerMessage }
 */
function attach(deps) {
  // คืนฟังก์ชัน handler สำหรับใช้ใน server.js เมื่อเจอเส้นทาง POST /webhook/facebook
  return async function facebookWebhook(req, res, rawBody) {
    const settings = deps.db.getBotSettings();
    const token = settings.facebookPageToken;
    const secret = settings.facebookAppSecret;

    if (!token) {
      res.writeHead(503);
      return res.end('Facebook Page Access Token not configured');
    }

    // ตรวจสอบความถูกต้องของ Signature (ถ้าหากมีการตั้งค่า App Secret ไว้)
    if (secret) {
      const signature = req.headers['x-hub-signature-256'];
      if (!verifySignature(rawBody, signature, secret)) {
        res.writeHead(401);
        return res.end('bad signature');
      }
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      res.writeHead(400);
      return res.end('Invalid JSON');
    }

    // Facebook Webhook สำหรับ Messenger ส่งข้อมูลในรูปของ entries/messaging
    if (payload.object === 'page') {
      for (const entry of payload.entry || []) {
        for (const ev of entry.messaging || []) {
          // ข้ามอีเวนต์ที่ไม่ใช่ข้อความ หรือเป็น echo ของข้อความที่บอทส่งเอง
          if (!ev.message || ev.message.is_echo) continue;

          const senderId = ev.sender.id;
          const convId = 'facebook_' + senderId;

          // ---- กรณีเป็นไฟล์แนบ (รูปภาพ / สติกเกอร์ / ไฟล์) ----
          // บอทวิเคราะห์ไฟล์เองไม่ได้ในช่องทางนี้ → บันทึกไว้แล้วส่งต่อให้แอดมิน
          if (ev.message.attachments && ev.message.attachments.length) {
            const conv = await ensureConversation(deps, senderId, token);
            const att = ev.message.attachments[0];
            const mediaUrl = (att.payload && att.payload.url) ? att.payload.url : '';
            const kind = att.type === 'image' ? 'image' : 'file';
            const label = att.type === 'image' ? '[ลูกค้าส่งรูปภาพ]' : '[ลูกค้าส่งไฟล์แนบ]';

            const msg = deps.db.addMessage(convId, { sender: 'customer', text: label, kind, mediaUrl });
            deps.emitMessage(convId, msg);

            if (conv.mode !== 'human') {
              deps.db.updateConversation(convId, { mode: 'human', status: 'waiting' });
              if (typeof deps.broadcastToAdmins === 'function') {
                deps.broadcastToAdmins('handoff', { conversationId: convId });
              }
              const replyText = 'ได้รับไฟล์เรียบร้อยแล้วค่ะ แอดมินกำลังตรวจสอบให้นะคะ รอสักครู่ค่ะ 🙏';
              const botMsg = deps.db.addMessage(convId, { sender: 'bot', text: replyText });
              deps.emitMessage(convId, botMsg);
              await sendToFacebook(senderId, replyText, token);
            }
            continue;
          }

          // ---- กรณีเป็นข้อความตัวอักษร (Text Message) ----
          if (ev.message.text) {
            const conv = await ensureConversation(deps, senderId, token);
            const text = ev.message.text;
            const msg = deps.db.addMessage(convId, { sender: 'customer', text });
            deps.emitMessage(convId, msg);

            // ส่งข้อมูลให้ AI ประมวลผลและตอบกลับแบบ Auto-Reply (กรณีไม่ได้แฮนด์ออฟให้แอดมินอยู่)
            if (conv.mode !== 'human') {
              const bot = require('./bot');
              const history = deps.db.getMessages(convId).slice(-12);
              const decision = await bot.decideReply(text, history, conv);

              if (decision.handoff) {
                deps.db.updateConversation(convId, { mode: 'human', status: 'waiting' });
                // บรอดแคสต์เหตุการณ์หาแอดมินเพื่อเตือน
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

                if (decision.text) await sendToFacebook(senderId, decision.text, token);
                const imageAbs = deps.db.absoluteMediaUrl(decision.mediaUrl);
                if (imageAbs) await sendFacebookImage(senderId, imageAbs, token);
              }
            }
          }
        }
      }
    }

    res.writeHead(200);
    res.end('EVENT_RECEIVED');
  };
}

module.exports = { attach, verifySignature, sendToFacebook };
