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
const fs = require('fs');
const path = require('path');

// Levenshtein distance to find closest match for fuzzy lookup
function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Clean name by removing prefixes and suffixes
function cleanGameName(text) {
  let query = (text || '').toLowerCase().trim();
  
  // Clean prefixes
  const prefixes = [
    'สนใจเติม', 'เติมเกม', 'ขอราคา', 'ราคา', 'เติม', 
    'มีเกม', 'อยากเติม', 'ขอราคาสินค้า', 'อยากได้', 'เกม',
    'ขอราคาเกม', 'เติมเเกม'
  ];
  for (const prefix of prefixes) {
    if (query.startsWith(prefix)) {
      query = query.substring(prefix.length).trim();
      break;
    }
  }
  
  // Clean suffixes
  const suffixes = [
    'หน่อยครับ', 'หน่อยค่ะ', 'ด้วยครับ', 'ด้วยค่ะ', 
    'หน่อย', 'ครับ', 'ค่ะ', 'จ้า', 'นะ', 'นะค่ะ', 
    'ด้วย', 'นะคะ', 'ละ', 'ไหม'
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (query.endsWith(suffix)) {
        query = query.substring(0, query.length - suffix.length).trim();
        changed = true;
      }
    }
  }
  
  return query;
}

// Find closest product in database
function findClosestProduct(text) {
  const query = cleanGameName(text);
  if (!query) return null;

  const products = db.getProducts();
  let bestMatch = null;
  let minDistance = 999;
  
  for (const product of products) {
    const candidates = [product.name.toLowerCase(), ...(product.aliases || []).map(a => a.toLowerCase())];
    for (const cand of candidates) {
      if (query.includes(cand) || cand.includes(query)) {
        return product;
      }
      
      const dist = getLevenshteinDistance(query, cand);
      const maxAllowedDist = Math.max(1, Math.floor(cand.length * 0.4)); // e.g. 40% edit distance threshold
      if (dist <= maxAllowedDist && dist < minDistance) {
        minDistance = dist;
        bestMatch = product;
      }
    }
  }
  return bestMatch;
}

// Check if query is about a game and return formatted packages
function matchProductQuery(text) {
  const lower = (text || '').toLowerCase().trim();
  const products = db.getProducts();
  
  // Check if they say game names or aliases directly or with query words
  for (const product of products) {
    const matchName = product.name.toLowerCase();
    const matchAliases = (product.aliases || []).map(a => a.toLowerCase());
    
    const foundAlias = matchAliases.some(alias => lower.includes(alias)) || lower.includes(matchName);
    
    if (foundAlias) {
      const isPriceQuery = ['ราคา', 'เติม', 'เท่าไหร่', 'เท่าไร', 'กี่บาท', 'แพ็ค', 'แพ็ก', 'แพ็กเกจ', 'สนใจ', 'ขอ', 'มี', 'เปย์'].some(k => lower.includes(k));
      const isDirectName = lower.trim() === matchName || matchAliases.some(alias => lower.trim() === alias);
      
      if (isPriceQuery || isDirectName) {
        return formatProductReply(product);
      }
    }
  }
  
  // Fuzzy fallback
  const isAsking = ['ราคา', 'เติม', 'ขอราคา', 'มีเกม'].some(k => lower.includes(k));
  if (isAsking) {
    const closest = findClosestProduct(text);
    if (closest) {
      return formatProductReply(closest);
    }
  }
  
  return null;
}

// Format the response template as requested
function formatProductReply(product) {
  const typeStr = product.orderType === 'instant' ? 'เข้าทันที' : 'พรีออเดอร์';
  let reply = `🎮 **${product.name}** (${typeStr})\n`;
  product.packages.forEach(pkg => {
    reply += `- ${pkg.name} : ${pkg.price} บาท\n`;
  });
  reply += `\nสนใจแพ็กเกจไหน พิมพ์ชื่อแพ็กเกจ หรือบอกราคาที่ต้องการ พร้อมส่ง UID / ID เกม มาได้เลยครับ!`;
  
  if (product.imageUrl) {
    return {
      text: reply,
      kind: 'image',
      mediaUrl: product.imageUrl
    };
  }
  return {
    text: reply,
    kind: 'text'
  };
}

// Catch unsupported games
function matchUnsupportedProductQuery(text) {
  const lower = (text || '').toLowerCase().trim();
  
  const patterns = [
    /เติม\s*([a-zA-Z0-9ก-๙\s]+)/,
    /ราคา\s*([a-zA-Z0-9ก-๙\s]+)/,
    /ขอราคา\s*([a-zA-Z0-9ก-๙\s]+)/,
    /สนใจเติม\s*([a-zA-Z0-9ก-๙\s]+)/
  ];
  
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const rawName = match[1].trim();
      const gameName = cleanGameName(rawName);
      
      const commonWords = ['เกม', 'บัตร', 'เงิน', 'โค้ด', 'รหัส', 'ของ', 'ร้าน', 'แอดมิน', 'คนจริง', 'เจ้าหน้าที่', 'พนักงาน'];
      if (commonWords.includes(gameName) || gameName.length <= 1 || /^\d+$/.test(gameName)) {
        continue;
      }
      
      const product = findClosestProduct(gameName);
      if (!product) {
        const displayGameName = gameName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return `ขออภัยครับ ตอนนี้ทางร้านยังไม่มีบริการเติมเกม ${displayGameName} ครับ สนใจเป็นเกมอื่นแทนไหมครับ?`;
      }
    }
  }
  return null;
}

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
async function aiReply(history, conv) {
  const settings = db.getBotSettings();
  if (!settings.aiEnabled) return null; // ตรวจสอบสถานะเปิด/ปิด AI ในระบบตั้งค่า

  // แปลงความสัมพันธ์ของ source/channel เพื่อเลือก Prompt ที่เกี่ยวข้อง
  const source = conv ? (conv.source || 'Web Chat') : 'Web Chat';
  let channelKey = 'web';
  if (source === 'LINE Official' || source === 'LINE OA' || source === 'line') {
    channelKey = 'line';
  } else if (source === 'Facebook Page' || source === 'Facebook Messenger' || source === 'facebook') {
    channelKey = 'facebook';
  }

  // ดึงคอนฟิกของช่องทางนั้นๆ
  const channelConfig = (settings.channels && settings.channels[channelKey]) ? settings.channels[channelKey] : {};
  
  // ตรวจสอบว่าเปิดบอทเฉพาะของช่องทางนี้หรือไม่
  const isChannelEnabled = (channelConfig.enabled !== undefined) ? channelConfig.enabled : true;
  if (!isChannelEnabled) return null;

  const geminiApiKey = process.env.GEMINI_API_KEY || settings.geminiApiKey;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || settings.anthropicApiKey;

  const baseSystemPrompt = channelConfig.systemPrompt || settings.aiSystemPrompt || 'คุณเป็นแอดมินร้านค้าออนไลน์ตอบคำถามลูกค้า';
  const productPrompt = channelConfig.productPrompt || settings.aiProductPrompt || '';
  const promotionPrompt = channelConfig.promotionPrompt || settings.aiPromotionPrompt || '';

  let systemPrompt = baseSystemPrompt;
  if (productPrompt.trim()) {
    systemPrompt += '\n\n[ข้อมูลสินค้า / Product Information]\n' + productPrompt.trim();
  }
  if (promotionPrompt.trim()) {
    systemPrompt += '\n\n[โปรโมชั่น / Promotion Details]\n' + promotionPrompt.trim();
  }

  // ดึงข้อมูลสินค้าจาก Database มาต่อท้าย System Prompt ของ AI
  const products = db.getProducts();
  let dbProductPrompt = '\n\n[ฐานข้อมูลสินค้าเกมที่อัปเดตล่าสุด / Latest Game Product Database]\n';
  dbProductPrompt += 'คุณมีหน้าที่ให้ข้อมูลราคาเกมที่อัปเดตล่าสุดแก่ลูกค้า โดยอ้างอิงจากฐานข้อมูลสินค้าต่อไปนี้เท่านั้น:\n';
  products.forEach(p => {
    const typeStr = p.orderType === 'instant' ? 'เข้าทันที' : 'พรีออเดอร์';
    dbProductPrompt += `- เกม: ${p.name} (ประเภทออเดอร์: ${typeStr})\n`;
    if (p.aliases && p.aliases.length > 0) {
      dbProductPrompt += `  คำค้นหา/ตัวย่อใกล้เคียง: ${p.aliases.join(', ')}\n`;
    }
    dbProductPrompt += `  แพ็กเกจที่มีในระบบ:\n`;
    p.packages.forEach(pkg => {
      dbProductPrompt += `    * ${pkg.name} : ${pkg.price} บาท\n`;
    });
  });

  dbProductPrompt += `\n**ข้อบังคับในการตอบกลับเรื่องราคาสินค้า:**
1. เมื่อลูกค้าถามถึงเกม (เช่น "สนใจเติม Genshin" หรือ "ขอราคา Valorant หน่อย") ให้คุณค้นหาข้อมูลเกมนั้น และสรุปแพ็กเกจทั้งหมดส่งให้ลูกค้า
2. หากลูกค้าพิมพ์ชื่อเกมผิด ให้พยายามคาดเดาชื่อเกมที่ใกล้เคียงที่สุดในฐานข้อมูล
3. ห้ามคิดราคาหรือสร้างแพ็กเกจขึ้นมาเองเด็ดขาด ต้องอ้างอิงจากข้อมูลที่มีเท่านั้น
4. หากลูกค้าถามหาเกมที่ไม่มีในฐานข้อมูล ให้ตอบว่า "ขออภัยครับ ตอนนี้ทางร้านยังไม่มีบริการเติมเกม [ชื่อเกมที่ลูกค้าถาม] ครับ สนใจเป็นเกมอื่นแทนไหมครับ?"
5. ให้แสดงผลในรูปแบบที่อ่านง่าย เป็นระเบียบ ตามเทมเพลตนี้เท่านั้น:

🎮 **[ชื่อเกม]** ([ประเภทออเดอร์: เข้าทันที / พรีออเดอร์])
- [ชื่อแพ็กเกจ 1] : [ราคา] บาท
- [ชื่อแพ็กเกจ 2] : [ราคา] บาท

สนใจแพ็กเกจไหน พิมพ์ชื่อแพ็กเกจ หรือบอกราคาที่ต้องการ พร้อมส่ง UID / ID เกม มาได้เลยครับ!

\n[ความสามารถในการวิเคราะห์รูปภาพ / Vision Capability Guide]
ลูกค้าสามารถส่งรูปภาพเข้ามาในแชทได้ โดยคุณ (AI) จะมองเห็นรูปภาพเหล่านั้นในประวัติการสนทนา:
1. หากลูกค้าส่ง "สลิปโอนเงิน / ใบเสร็จธนาคาร" เข้ามา:
   - ตรวจสอบชื่อบัญชีปลายทาง ยอดเงิน วันและเวลา
   - ยืนยันยอดเงินที่ได้รับกับลูกค้าอย่างสุภาพ เช่น "ได้รับยอดเงินโอน 99 บาทเรียบร้อยค่ะ"
   - สร้าง JSON ยืนยันคำสั่งซื้อตามรูปแบบข้อมูลที่ระบุไว้
2. หากลูกค้าส่ง "รูปภาพทั่วไป / รูปหน้าจอขัดข้อง / สกรีนช็อตในเกม" เข้ามา:
   - ให้วิเคราะห์รูปภาพนั้นอย่างละเอียดเพื่อระบุปัญหาหรือเนื้อหาในภาพ
   - ตอบคำถามและแนะนำทางแก้ไขปัญหาทางเทคนิคให้กับลูกค้าโดยตรงตามรูปภาพนั้น
   - พูดคุยอย่างเป็นกันเองและสุภาพที่สุด;`;

  systemPrompt += dbProductPrompt;

  // 1) ใช้ Gemini API เป็นอันดับแรก
  if (geminiApiKey) {
    try {
      // แปลงประวัติเป็นฟอร์แมตของ Gemini และรวมข้อความจากบทบาทเดียวกันที่พิมพ์ติดต่อกัน
      const contents = [];
      for (const m of history) {
        const role = m.sender === 'customer' ? 'user' : 'model';
        
        let part = null;
        if (m.kind === 'image' && m.mediaUrl) {
          try {
            const localPath = path.join(__dirname, 'public', m.mediaUrl);
            if (fs.existsSync(localPath)) {
              const fileData = fs.readFileSync(localPath);
              const base64Data = fileData.toString('base64');
              
              let mimeType = 'image/jpeg';
              if (m.mediaUrl.endsWith('.png')) mimeType = 'image/png';
              else if (m.mediaUrl.endsWith('.webp')) mimeType = 'image/webp';
              else if (m.mediaUrl.endsWith('.gif')) mimeType = 'image/gif';
              
              part = {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              };
            }
          } catch (e) {
            console.error('Error reading image for Gemini Vision:', e.message);
          }
        }
        
        const textPart = { text: m.text || '' };
        const parts = part ? [textPart, part] : [textPart];

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts.push(...parts);
        } else {
          contents.push({
            role,
            parts: parts
          });
        }
      }

      if (contents.length === 0) return null;

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
          system: systemPrompt,
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

function isPriceInquiry(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  
  // If it's a file path or filename, it's not a price inquiry
  if (/\.(png|jpe?g|gif|webp)$/i.test(lower)) return false;
  
  const priceKeywords = [
    'ราคา', 'กี่บาท', 'เท่าไหร่', 'เท่าไร', 'เติม', 'topup', 'top-up', 'rate', 'เรท',
    'แพ็ก', 'แพค', 'package', 'บัตร', 'มีเกม', 'เติมเกม', 'ขอราคา', 'วาโล', 'rov', 'genshin'
  ];
  
  const hasPriceKeyword = priceKeywords.some(k => lower.includes(k));
  
  const products = db.getProducts();
  const isDirectGameName = products.some(p => {
    const cleanName = p.name.toLowerCase();
    const matchesName = lower === cleanName;
    const matchesAlias = p.aliases && p.aliases.some(alias => lower === alias.toLowerCase());
    return matchesName || matchesAlias;
  });
  
  return hasPriceKeyword || isDirectGameName;
}

/*
 * decideReply — ตัดสินใจว่าบอทจะตอบอะไร
 * คืนค่า { text, handoff } :
 *   text    = ข้อความที่บอทจะตอบ (ถ้ามี)
 *   handoff = true ถ้าควรส่งต่อให้คนจริง
 */
async function decideReply(text, history, conv) {
  // 1) ลูกค้าขอคุยกับคนจริง
  if (wantsHuman(text)) {
    return {
      text: 'รับทราบค่ะ เดี๋ยวแอดมินจะมาดูแลต่อให้นะคะ รอสักครู่ค่ะ 🙏',
      handoff: true,
    };
  }

  // 2) ลองใช้ AI ก่อน (ถ้าเปิดใช้งาน)
  const ai = await aiReply(history, conv);
  if (ai) {
    const products = db.getProducts();
    let matchedProduct = null;
    for (const p of products) {
      if (p.imageUrl) {
        if (ai.toLowerCase().includes(p.name.toLowerCase()) || 
            (p.aliases && p.aliases.some(alias => ai.toLowerCase().includes(alias.toLowerCase())))) {
          matchedProduct = p;
          break;
        }
      }
    }
    
    if (matchedProduct && isPriceInquiry(text)) {
      return {
        text: ai,
        handoff: false,
        kind: 'image',
        mediaUrl: matchedProduct.imageUrl
      };
    }
    return { text: ai, handoff: false };
  }

  // 2.5) ตรวจสอบราคาสินค้าจากฐานข้อมูล (Rule-based Product Fallback)
  const productReply = matchProductQuery(text);
  if (productReply) {
    return { 
      text: productReply.text, 
      kind: productReply.kind,
      mediaUrl: productReply.mediaUrl,
      handoff: false 
    };
  }

  const unsupportedReply = matchUnsupportedProductQuery(text);
  if (unsupportedReply) return { text: unsupportedReply, handoff: false };

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
