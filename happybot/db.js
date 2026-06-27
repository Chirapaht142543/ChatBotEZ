'use strict';

/*
 * db.js — ชั้นเก็บข้อมูลแบบง่าย ใช้ไฟล์ JSON 1 ไฟล์
 * -------------------------------------------------
 * จุดประสงค์: ให้รันได้ทันทีโดยไม่ต้องติดตั้งฐานข้อมูล
 * เมื่อระบบโตขึ้นให้เปลี่ยนไปใช้ PostgreSQL / MongoDB / SQLite
 * โดยแก้แค่ฟังก์ชันในไฟล์นี้ (โครงสร้างข้อมูลด้านนอกเหมือนเดิม)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// โครงสร้างกฎการตอบกลับและค่าตั้งต้นสำหรับบอท
const DEFAULT_RULES = [
  {
    id: 'rule_1',
    keywords: ['สวัสดี', 'หวัดดี', 'ดีครับ', 'ดีค่ะ', 'hello', 'hi'],
    reply: 'สวัสดีค่ะ 😊 ยินดีให้บริการนะคะ สอบถามเรื่องไหนเป็นพิเศษ แจ้งได้เลยค่ะ'
  },
  {
    id: 'rule_2',
    keywords: ['ราคา', 'เท่าไหร่', 'เท่าไร', 'กี่บาท'],
    reply: 'รบกวนแจ้งชื่อรุ่นสินค้าที่สนใจได้เลยค่ะ เดี๋ยวแจ้งราคาให้นะคะ 🙏'
  },
  {
    id: 'rule_3',
    keywords: ['ส่ง', 'จัดส่ง', 'ค่าส่ง', 'ขนส่ง', 'กี่วัน'],
    reply: 'จัดส่งทั่วประเทศค่ะ ค่าส่งเริ่มต้น 40 บาท สั่งครบ 1,000 บาท ส่งฟรี ปกติได้รับภายใน 2-3 วันทำการค่ะ'
  },
  {
    id: 'rule_4',
    keywords: ['กระเป๋า', 'โน้ตบุ๊ก', 'โน๊ตบุ๊ค', 'laptop', 'ขวดน้ำ'],
    reply: 'รุ่นนี้ใส่โน้ตบุ๊ก 15.6 นิ้วได้ค่ะ มีช่องใส่ขวดน้ำด้านข้าง 2 ช่อง วัสดุกันน้ำค่ะ 👜'
  },
  {
    id: 'rule_5',
    keywords: ['คืนสินค้า', 'คืนเงิน', 'เปลี่ยนสินค้า', 'รับประกัน'],
    reply: 'สินค้าเปลี่ยน/คืนได้ภายใน 7 วันค่ะ โดยสินค้าต้องอยู่ในสภาพสมบูรณ์ รบกวนแจ้งเลขคำสั่งซื้อด้วยนะคะ'
  },
  {
    id: 'rule_6',
    keywords: ['ใบกำกับภาษี', 'ใบเสร็จ', 'vat'],
    reply: 'ออกใบกำกับภาษีเต็มรูปได้ค่ะ รบกวนแจ้งชื่อ-ที่อยู่ และเลขผู้เสียภาษีด้วยนะคะ'
  },
  {
    id: 'rule_7',
    keywords: ['ขอบคุณ', 'ขอบใจ', 'thank'],
    reply: 'ยินดีค่ะ 🙏 หากต้องการสอบถามเพิ่มเติม แจ้งได้ตลอดเลยนะคะ'
  }
];

const DEFAULT_SETTINGS = {
  aiEnabled: false,
  aiSystemPrompt: 'คุณเป็นแอดมินร้านขายกระเป๋าและของใช้ออนไลน์ ตอบลูกค้าด้วยภาษาไทยที่สุภาพ กระชับ เป็นกันเอง ลงท้ายด้วย "ค่ะ" ถ้าไม่แน่ใจหรือเป็นเรื่องเฉพาะคำสั่งซื้อ ให้บอกว่าจะให้แอดมินช่วยตรวจสอบให้นะคะ',
  aiProductPrompt: '',
  aiPromotionPrompt: '',
  handoffKeywords: ['แอดมิน', 'คนจริง', 'เจ้าหน้าที่', 'พนักงาน', 'ติดต่อคน'],
  channels: {
    web: {
      name: 'เว็บไซต์ (Web Widget)',
      enabled: true,
      systemPrompt: 'คุณเป็นแอดมินร้านกระเป๋าออนไลน์ ให้บริการข้อมูลแชทบนหน้าเว็บไซต์โดยตรง ตอบด้วยความสุภาพ รวดเร็ว และกระชับ ลงท้ายด้วย "ค่ะ"',
      productPrompt: '',
      promotionPrompt: ''
    },
    facebook: {
      name: 'Facebook Page',
      enabled: true,
      systemPrompt: 'คุณเป็นแอดมินเพจ Facebook ตอบสไตล์เป็นกันเอง น่ารัก สนุกสนาน คอยปิดการขาย มีความตื่นเต้น และใช้ Emoji ประกอบในการคุย ลงท้ายด้วย "จ้า"',
      productPrompt: '',
      promotionPrompt: ''
    },
    line: {
      name: 'LINE OA',
      enabled: true,
      systemPrompt: 'คุณเป็นแอดมินระบบ LINE Official Account ตอบอย่างเป็นระเบียบ มีการตอบกลับทีละหัวข้อ สุภาพ มีความเป็นทางการและลงท้ายด้วย "ครับ/ค่ะ"',
      productPrompt: '',
      promotionPrompt: ''
    }
  }
};

const DEFAULT_USERS = [
  { id: 1, name: 'แอดมินรวิภา (เจ้าของร้าน)', email: 'rawipa@happyshop.com', password: '123', role: 'Owner', online: true, avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150' },
  { id: 2, name: 'น้องพลอย (ผู้จัดการ)', email: 'ploy.admin@happyshop.com', password: '123', role: 'Manager', online: true, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
  { id: 3, name: 'น้องป่าน (แอดมิน)', email: 'pan.support@happyshop.com', password: '123', role: 'Agent', online: false, avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150' }
];

const DEFAULT_DATA = { conversations: {}, messages: {}, seq: 0, rules: DEFAULT_RULES, settings: DEFAULT_SETTINGS, users: DEFAULT_USERS };

let cache = null;       // เก็บข้อมูลในหน่วยความจำ
let writeTimer = null;  // หน่วงการเขียนไฟล์ (debounce) กันเขียนถี่เกินไป

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    cache = JSON.parse(raw);
    // ตรวจสอบโครงสร้างว่ามีข้อมูลครบหรือไม่
    if (!cache.rules) {
      cache.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
    }
    if (!cache.settings) {
      cache.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    } else {
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (cache.settings[key] === undefined) {
          cache.settings[key] = DEFAULT_SETTINGS[key];
        }
      });
    }
    if (!cache.users) {
      cache.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    } else {
      cache.users.forEach(u => {
        if (!u.password) u.password = '123';
      });
    }
  } catch (e) {
    cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
    flushNow();
  }
  return cache;
}

function flushNow() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// เขียนแบบหน่วงเวลา เพื่อรวมหลายการเปลี่ยนแปลงในครั้งเดียว
function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushNow();
  }, 200);
}

function nextId(prefix) {
  const d = load();
  d.seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${d.seq}`;
}

// ---------- บทสนทนา (conversation) ----------

function listConversations() {
  const d = load();
  return Object.values(d.conversations).sort(
    (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
  );
}

function getConversation(id) {
  return load().conversations[id] || null;
}

function createConversation({ id, customerName, email, phone, avatarUrl, topic, customerId, source }) {
  const d = load();
  const convId = id || nextId('conv');
  if (d.conversations[convId]) {
    // อัปเดตข้อมูลหากมีการส่งมาเพิ่มเติม
    if (customerName) d.conversations[convId].customerName = customerName;
    if (email) d.conversations[convId].email = email;
    if (phone) d.conversations[convId].phone = phone;
    if (avatarUrl) d.conversations[convId].avatarUrl = avatarUrl;
    if (topic) d.conversations[convId].topic = topic;
    if (customerId) d.conversations[convId].customerId = customerId;
    if (source) d.conversations[convId].source = source;
    scheduleWrite();
    return d.conversations[convId];
  }
  d.conversations[convId] = {
    id: convId,
    customerId: customerId || '',
    customerName: customerName || 'ลูกค้าใหม่',
    email: email || '',
    phone: phone || '',
    avatarUrl: avatarUrl || '',
    topic: topic || '',
    source: source || 'Web Chat',
    rating: null,
    mode: 'bot',            // 'bot' = บอทตอบ, 'human' = แอดมินตอบเอง
    status: 'open',         // open | waiting | closed
    unread: 0,
    tags: [],
    starred: false,
    notes: '',
    internalNotes: [],
    createdAt: Date.now(),
    lastMessage: '',
    lastMessageAt: Date.now(),
  };
  d.messages[convId] = [];
  scheduleWrite();
  return d.conversations[convId];
}

function updateConversation(id, patch) {
  const d = load();
  const conv = d.conversations[id];
  if (!conv) return null;
  Object.assign(conv, patch);
  scheduleWrite();
  return conv;
}

function clearAllData() {
  const d = load();
  d.conversations = {};
  d.messages = {};
  flushNow();
}

// ---------- ข้อความ (message) ----------

function getMessages(conversationId) {
  return load().messages[conversationId] || [];
}

function addMessage(conversationId, { sender, text, kind, senderName, mediaUrl }) {
  const d = load();
  if (!d.conversations[conversationId]) return null;
  const msg = {
    id: nextId('msg'),
    conversationId,
    sender,                 // 'customer' | 'admin' | 'bot'
    senderName: senderName || null,
    kind: kind || 'text',
    mediaUrl: mediaUrl || null,
    text,
    createdAt: Date.now(),
  };
  d.messages[conversationId].push(msg);

  const conv = d.conversations[conversationId];
  conv.lastMessage = kind === 'image' ? '[รูปภาพ]' : kind === 'file' ? '[ไฟล์แนบ]' : text;
  conv.lastMessageAt = msg.createdAt;
  if (sender === 'customer') conv.unread += 1;
  scheduleWrite();
  return msg;
}

// ---------- กฎบอท (bot rules) ----------
function getRules() {
  return load().rules || [];
}

function saveRules(rules) {
  const d = load();
  d.rules = rules;
  scheduleWrite();
  return d.rules;
}

// ---------- ตั้งค่าบอท (bot settings) ----------
function getBotSettings() {
  return load().settings || {};
}

function saveBotSettings(settings) {
  const d = load();
  d.settings = Object.assign(d.settings || {}, settings);
  scheduleWrite();
  return d.settings;
}

// ---------- ผู้ใช้งาน (Users) ----------
function getUsers() {
  return load().users || [];
}

function saveUsers(users) {
  const d = load();
  d.users = users;
  scheduleWrite();
  return d.users;
}

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  getMessages,
  addMessage,
  getRules,
  saveRules,
  getBotSettings,
  saveBotSettings,
  getUsers,
  saveUsers,
};
