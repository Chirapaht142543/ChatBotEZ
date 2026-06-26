'use strict';

/*
 * bot.js — สมองของบอท
 * --------------------
 * มี 3 ระดับ (ไล่จากง่ายไปฉลาด):
 *   1) rule-based  : จับคู่คำสำคัญ -> ตอบข้อความที่ตั้งไว้   (ทำงานทันที ไม่ต้องต่อเน็ต)
 *   2) AI (LLM)    : ส่งข้อความไปให้โมเดลภาษา แล้วเอาคำตอบมาตอบ (ดูฟังก์ชัน aiReply)
 *   3) human       : ถ้าตอบไม่ได้ -> ส่งต่อให้แอดมินคนจริง
 */

const db = require('./db');

function matchRule(text) {
  const rules = db.getRules();
  const lower = (text || '').toLowerCase();
  for (const rule of rules) {
    if (rule.keywords && rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return rule.reply;
    }
  }
  return null;
}

function wantsHuman(text) {
  const settings = db.getBotSettings();
  const lower = (text || '').toLowerCase();
  const keywords = settings.handoffKeywords || ['แอดมิน', 'คนจริง', 'เจ้าหน้าที่', 'พนักงาน', 'ติดต่อคน'];
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/*
 * aiReply — จุดเสียบโมเดล AI (ทางเลือก)
 * --------------------------------------
 * ค่าเริ่มต้นปิดอยู่ (คืน null) เพื่อให้รันได้โดยไม่ต้องต่อเน็ต/ใส่คีย์
 * วิธีเปิด: ตั้ง environment variable GEMINI_API_KEY (หรือ ANTHROPIC_API_KEY) และเปิดใช้งานในหน้าตั้งค่า AI
 */
async function aiReply(history) {
  const settings = db.getBotSettings();
  if (!settings.aiEnabled) return null; // ตรวจสอบสถานะเปิด/ปิด AI ในระบบตั้งค่า

  const geminiApiKey = process.env.GEMINI_API_KEY || settings.geminiApiKey;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || settings.anthropicApiKey;

  // 1) ใช้ Gemini API เป็นอันดับแรก
  if (geminiApiKey) {
    try {
      // แปลงประวัติเป็นฟอร์แมตของ Gemini และรวมข้อความจากบทบาทเดียวกันที่พิมพ์ติดต่อกัน
      const contents = [];
      for (const m of history) {
        const role = m.sender === 'customer' ? 'user' : 'model';
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += '\n' + m.text;
        } else {
          contents.push({
            role,
            parts: [{ text: m.text }]
          });
        }
      }

      if (contents.length === 0) return null;

      const systemPrompt = settings.aiSystemPrompt || 'คุณเป็นแอดมินร้านค้าออนไลน์ตอบคำถามลูกค้า';
      const model = settings.aiModel || 'gemini-1.5-flash';
      const temp = settings.aiTemperature !== undefined ? parseFloat(settings.aiTemperature) : 0.7;

      const generationConfig = {
        maxOutputTokens: 2000,
        temperature: temp
      };

      // Disable thinking budget for Gemini 2.5/3.x models to prevent response truncation
      if (model.includes('2.5') || model.includes('3')) {
        generationConfig.thinkingConfig = {
          thinkingBudget: 0
        };
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Gemini API error response:', errText);
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text.trim() : null;
    } catch (e) {
      console.error('Gemini aiReply error:', e.message);
    }
  }

  // 2) ใช้ Anthropic Claude เป็นตัวเลือกสำรอง
  if (anthropicApiKey) {
    try {
      const messages = history.map((m) => ({
        role: m.sender === 'customer' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: settings.aiSystemPrompt || 'คุณเป็นแอดมินร้านค้าออนไลน์ตอบคำถามลูกค้า',
          messages,
        }),
      });
      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return text || null;
    } catch (e) {
      console.error('Anthropic aiReply error:', e.message);
      return null;
    }
  }

  return null;
}

/*
 * decideReply — ตัดสินใจว่าบอทจะตอบอะไร
 * คืนค่า { text, handoff } :
 *   text    = ข้อความที่บอทจะตอบ (ถ้ามี)
 *   handoff = true ถ้าควรส่งต่อให้คนจริง
 */
async function decideReply(text, history) {
  // 1) ลูกค้าขอคุยกับคนจริง
  if (wantsHuman(text)) {
    return {
      text: 'รับทราบค่ะ เดี๋ยวแอดมินจะมาดูแลต่อให้นะคะ รอสักครู่ค่ะ 🙏',
      handoff: true,
    };
  }

  // 2) ลองใช้ AI ก่อน (ถ้าเปิดใช้งาน)
  const ai = await aiReply(history);
  if (ai) return { text: ai, handoff: false };

  // 3) ใช้กฎ
  const ruled = matchRule(text);
  if (ruled) return { text: ruled, handoff: false };

  // 4) ตอบไม่ได้ -> ส่งต่อให้คนจริง
  return {
    text: 'ขอบคุณสำหรับข้อความค่ะ ขอส่งต่อให้แอดมินช่วยตอบให้นะคะ รอสักครู่ค่ะ 🙏',
    handoff: true,
  };
}

module.exports = { decideReply };
