'use strict';

/*
 * bot.js — สมองของบอท
 * --------------------
 * มี 3 ระดับ (ไล่จากง่ายไปฉลาด):
 *   1) rule-based  : จับคู่คำสำคัญ -> ตอบข้อความที่ตั้งไว้   (ทำงานทันที ไม่ต้องต่อเน็ต)
 *   2) AI (LLM)    : ส่งข้อความไปให้โมเดลภาษา แล้วเอาคำตอบมาตอบ (ดูฟังก์ชัน aiReply)
 *   3) human       : ถ้าตอบไม่ได้ -> ส่งต่อให้แอดมินคนจริง
 */

// ----- ฐานความรู้แบบกฎ: ปรับ/เพิ่มได้ตามร้านของคุณ -----
const RULES = [
  {
    keywords: ['สวัสดี', 'หวัดดี', 'ดีครับ', 'ดีค่ะ', 'hello', 'hi'],
    reply: 'สวัสดีค่ะ 😊 ยินดีให้บริการนะคะ สอบถามเรื่องไหนเป็นพิเศษ แจ้งได้เลยค่ะ',
  },
  {
    keywords: ['ราคา', 'เท่าไหร่', 'เท่าไร', 'กี่บาท'],
    reply: 'รบกวนแจ้งชื่อรุ่นสินค้าที่สนใจได้เลยค่ะ เดี๋ยวแจ้งราคาให้นะคะ 🙏',
  },
  {
    keywords: ['ส่ง', 'จัดส่ง', 'ค่าส่ง', 'ขนส่ง', 'กี่วัน'],
    reply: 'จัดส่งทั่วประเทศค่ะ ค่าส่งเริ่มต้น 40 บาท สั่งครบ 1,000 บาท ส่งฟรี ปกติได้รับภายใน 2-3 วันทำการค่ะ',
  },
  {
    keywords: ['กระเป๋า', 'โน้ตบุ๊ก', 'โน๊ตบุ๊ค', 'laptop', 'ขวดน้ำ'],
    reply: 'รุ่นนี้ใส่โน้ตบุ๊ก 15.6 นิ้วได้ค่ะ มีช่องใส่ขวดน้ำด้านข้าง 2 ช่อง วัสดุกันน้ำค่ะ 👜',
  },
  {
    keywords: ['คืนสินค้า', 'คืนเงิน', 'เปลี่ยนสินค้า', 'รับประกัน'],
    reply: 'สินค้าเปลี่ยน/คืนได้ภายใน 7 วันค่ะ โดยสินค้าต้องอยู่ในสภาพสมบูรณ์ รบกวนแจ้งเลขคำสั่งซื้อด้วยนะคะ',
  },
  {
    keywords: ['ใบกำกับภาษี', 'ใบเสร็จ', 'vat'],
    reply: 'ออกใบกำกับภาษีเต็มรูปได้ค่ะ รบกวนแจ้งชื่อ-ที่อยู่ และเลขผู้เสียภาษีด้วยนะคะ',
  },
  {
    keywords: ['ขอบคุณ', 'ขอบใจ', 'thank'],
    reply: 'ยินดีค่ะ 🙏 หากต้องการสอบถามเพิ่มเติม แจ้งได้ตลอดเลยนะคะ',
  },
];

// คำที่บ่งบอกว่าลูกค้าต้องการคุยกับคนจริง -> ส่งต่อทันที
const HANDOFF_KEYWORDS = ['แอดมิน', 'คนจริง', 'เจ้าหน้าที่', 'พนักงาน', 'ติดต่อคน'];

function matchRule(text) {
  const lower = (text || '').toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return rule.reply;
    }
  }
  return null;
}

function wantsHuman(text) {
  const lower = (text || '').toLowerCase();
  return HANDOFF_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

/*
 * aiReply — จุดเสียบโมเดล AI (ทางเลือก)
 * --------------------------------------
 * ค่าเริ่มต้นปิดอยู่ (คืน null) เพื่อให้รันได้โดยไม่ต้องต่อเน็ต/ใส่คีย์
 * วิธีเปิด: ตั้ง environment variable ANTHROPIC_API_KEY แล้วปลดคอมเมนต์ด้านล่าง
 */
async function aiReply(history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // ไม่ได้ตั้งคีย์ -> ข้ามไปใช้ rule-based/handoff

  try {
    const messages = history.map((m) => ({
      role: m.sender === 'customer' ? 'user' : 'assistant',
      content: m.text,
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system:
          'คุณเป็นแอดมินร้านขายกระเป๋าและของใช้ออนไลน์ ตอบลูกค้าด้วยภาษาไทยที่สุภาพ ' +
          'กระชับ เป็นกันเอง ลงท้ายด้วย "ค่ะ" ถ้าไม่แน่ใจหรือเป็นเรื่องเฉพาะคำสั่งซื้อ ' +
          'ให้บอกว่าจะให้แอดมินช่วยตรวจสอบให้นะคะ',
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
    console.error('aiReply error:', e.message);
    return null;
  }
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
