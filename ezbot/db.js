'use strict';

/*
 * db.js — ชั้นเก็บข้อมูลด้วย SQLite (embedded)
 * -------------------------------------------------
 * ใช้ node:sqlite ที่มีมากับ Node.js (>=22.5) จึงยังคง "zero-dependency"
 * - ทนทานต่อไฟดับ/เซิร์ฟเวอร์ปิดกลางคัน (WAL + เขียนแบบ atomic ในตัว)
 * - ไม่โหลดข้อความทั้งหมดขึ้น RAM (query เฉพาะที่ต้องใช้)
 * - โครงสร้างข้อมูล/สัญญาฟังก์ชันด้านนอกเหมือนเดิมทุกอย่าง (bot.js/server.js ไม่ต้องแก้)
 *
 * ตาราง:
 *   conversations(id, customerId, lastMessageAt, data JSON)
 *   messages(id, conversationId, createdAt, data JSON)
 *   kv(key, value JSON)  — เก็บค่าเดี่ยว: rules, settings, users, broadcasts, products, seq
 *
 * ครั้งแรกที่รัน ถ้ามีไฟล์ store.json เดิมจะย้ายข้อมูลเข้ามาให้อัตโนมัติ
 */

const fs = require('fs');
const path = require('path');

// ซ่อนเฉพาะ ExperimentalWarning ของ node:sqlite (เป็นฟีเจอร์ทดลองแต่เสถียรพอใช้งานจริง)
// โดยยังปล่อย warning อื่นๆ ผ่านตามปกติ — ต้องทำก่อน require('node:sqlite')
const _emitWarning = process.emitWarning.bind(process);
process.emitWarning = function (warning, ...args) {
  const type = (args[0] && typeof args[0] === 'object') ? args[0].type : args[0];
  if (type === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
  return _emitWarning(warning, ...args);
};

const { DatabaseSync } = require('node:sqlite');

// ตำแหน่งที่เก็บข้อมูล — override ได้ผ่าน env EZBOT_DATA_DIR (เช่นชี้ไป volume บน VPS)
const DATA_DIR = process.env.EZBOT_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ezbot.db');
const LEGACY_JSON = path.join(DATA_DIR, 'store.json');

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
  aiSystemPrompt: `คุณคือ AI ผู้ช่วยแอดมินประจำร้านเติมเกม หน้าที่ของคุณคือการให้บริการลูกค้าด้วยความสุภาพ รวดเร็ว แม่นยำ และจัดการออเดอร์เติมเกมอัตโนมัติตามกระบวนการที่กำหนด

**เงื่อนไขและประเภทออเดอร์ (Business Logic & Order Types)**
ระบบรองรับออเดอร์ 2 ประเภทหลัก:
1. [Instant] เติมเกมแบบเข้าทันที: เมื่อตรวจสอบเงินและ UID สำเร็จ ระบบจะส่งข้อมูลผ่าน API เพื่อเติมเงินอัตโนมัติ
2. [Pre-Order] เติมเกมแบบพรีออเดอร์: เมื่อตรวจสอบเงินและ UID สำเร็จ ระบบจะบันทึกออเดอร์ไว้ เพื่อรอให้แอดมินดำเนินการอัปเดตสถานะแบบแมนนวล
3. [Other] ประเภทอื่นๆ: สำหรับบริการอนาคต

**ขั้นตอนการทำงาน (Workflow)**
1. รับความต้องการ: สอบถามลูกค้าว่าต้องการเติมเกมอะไร แพ็กเกจไหน และเป็นบริการแบบ Instant หรือ Pre-Order
2. ขอข้อมูลตัวละคร: ขอ UID / ID เกม และ Server (ถ้ามี) จากลูกค้า
3. แจ้งยอดและรอชำระเงิน: สรุปยอดเงิน แจ้งช่องทางการชำระเงิน และรอให้ลูกค้าส่งหลักฐานการโอนเงิน (สลิป)
4. ตรวจสอบ (Verification):
   - ตรวจสอบความถูกต้องของสลิปชำระเงิน (แจ้งเตือนให้ระบบหลังบ้านตรวจสอบยอด)
   - ตรวจสอบรูปแบบของ UID / ID เกม ว่าครบถ้วนหรือไม่
5. สร้างออเดอร์ (Order Execution): เมื่อการชำระเงินและข้อมูล UID ถูกต้อง ให้สรุปผลให้ลูกค้าทราบ และสร้าง Payload เพื่อส่งต่อให้ระบบหลังบ้าน

**System Action Responses (การส่งออกข้อมูลเพื่อเชื่อมต่อ API)**
เมื่อถึงขั้นตอนที่ 5 (ชำระเงินและข้อมูลครบถ้วน) ให้คุณตอบกลับลูกค้าเพื่อคอนเฟิร์ม และแนบ Data Block ในรูปแบบ JSON ไว้ท้ายข้อความ โดยห้ามดัดแปลงฟอร์แมต ดังนี้:

{
  "event": "order_confirmed",
  "customer_info": {
    "game_name": "[ชื่อเกม]",
    "uid": "[UID หรือ ID เกม]",
    "server": "[ชื่อเซิฟเวอร์ ถ้ามี]"
  },
  "order_details": {
    "package_name": "[ชื่อแพ็กเกจ]",
    "price": [ราคา ตัวเลข],
    "order_type": "[instant หรือ pre_order หรือ custom]"
  },
  "payment_status": "verified"
}

**กฎข้อบังคับ (Rules)**
- ห้ามสร้างออเดอร์ (Generate JSON) จนกว่าลูกค้าจะให้ข้อมูล UID ครบและส่งหลักฐานการชำระเงินแล้ว
- ถ้าเป็นออเดอร์ "Instant" ให้บอกลูกค้าว่า "ระบบกำลังดำเนินการเติมเข้าตัวละครอัตโนมัติ กรุณารอสักครู่"
- ถ้าเป็นออเดอร์ "Pre-Order" ให้บอกลูกค้าว่า "ระบบได้รับออเดอร์เรียบร้อยแล้ว แอดมินจะดำเนินการตามคิวและอัปเดตให้ทราบอีกครั้ง"
- ใช้ภาษาที่เป็นกันเอง สุภาพ และเข้าใจง่าย`,
  aiProductPrompt: '',
  aiPromotionPrompt: '',
  handoffKeywords: ['แอดมิน', 'คนจริง', 'เจ้าหน้าที่', 'พนักงาน', 'ติดต่อคน'],
  facebookVerifyToken: '',
  facebookPageToken: '',
  facebookAppSecret: '',
  facebookPageId: '',
  // URL สาธารณะของระบบ (เช่น https://example.com/ezbot) ใช้แปลง path รูปภาพให้เป็น absolute
  // เพื่อส่งรูป (เช่น ตารางราคา) ไปยัง LINE / Facebook ได้
  publicUrl: '',
  channels: {
    web: {
      name: 'เว็บไซต์ (Web Widget)',
      enabled: true,
      systemPrompt: '',
      productPrompt: '',
      promotionPrompt: ''
    },
    facebook: {
      name: 'Facebook Page',
      enabled: true,
      systemPrompt: '',
      productPrompt: '',
      promotionPrompt: ''
    },
    line: {
      name: 'LINE OA',
      enabled: true,
      systemPrompt: '',
      productPrompt: '',
      promotionPrompt: ''
    }
  }
};

const DEFAULT_PRODUCTS = [
  {
    id: 'prod_1',
    name: 'Genshin Impact',
    aliases: ['genshin', 'เกนชิน', 'เกนชินอิมแพกต์', 'เกนชินอิมแพค'],
    orderType: 'instant',
    packages: [
      { name: '60 Genesis Crystals', price: 29 },
      { name: '300+30 Genesis Crystals', price: 149 },
      { name: '980+110 Genesis Crystals', price: 489 },
      { name: 'Welkin Moon (30 วัน)', price: 149 }
    ]
  },
  {
    id: 'prod_2',
    name: 'Valorant',
    aliases: ['valorant', 'วาโล', 'วาโลแรนท์', 'วาโลแรน'],
    orderType: 'pre_order',
    packages: [
      { name: '375 VP', price: 99 },
      { name: '750 VP', price: 189 },
      { name: '1650 VP', price: 399 },
      { name: '3400 VP', price: 799 }
    ]
  },
  {
    id: 'prod_3',
    name: 'RoV',
    aliases: ['rov', 'อาโอวี', 'ro v'],
    orderType: 'instant',
    packages: [
      { name: '10 คูปอง', price: 9 },
      { name: '100 คูปอง', price: 89 },
      { name: '500 คูปอง', price: 429 }
    ]
  }
];

const DEFAULT_USERS = [
  { id: 1, name: 'แอดมินรวิภา (เจ้าของร้าน)', email: 'rawipa@happyshop.com', password: '123', role: 'Owner', online: true, avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150' },
  { id: 2, name: 'น้องพลอย (ผู้จัดการ)', email: 'ploy.admin@happyshop.com', password: '123', role: 'Manager', online: true, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
  { id: 3, name: 'น้องป่าน (แอดมิน)', email: 'pan.support@happyshop.com', password: '123', role: 'Agent', online: false, avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150' }
];

// ---------- เปิดการเชื่อมต่อฐานข้อมูลและสร้างตาราง ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    customerId    TEXT,
    lastMessageAt INTEGER,
    data          TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id             TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    createdAt      INTEGER,
    data           TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversationId, createdAt);
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ---------- ตัวช่วยอ่าน/เขียนค่าเดี่ยว (singleton) ในตาราง kv ----------
function kvGet(key) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : undefined;
}

function kvSet(key, value) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
  return value;
}

// บันทึกแถวบทสนทนา (sync คอลัมน์ที่ใช้ query ให้ตรงกับ data เสมอ)
function saveConversationRow(conv) {
  db.prepare('INSERT OR REPLACE INTO conversations (id, customerId, lastMessageAt, data) VALUES (?, ?, ?, ?)')
    .run(conv.id, conv.customerId || '', conv.lastMessageAt || 0, JSON.stringify(conv));
  return conv;
}

// ---------- ย้ายข้อมูลจาก store.json เดิม (ทำครั้งเดียว) ----------
function migrateFromJsonOnce() {
  if (kvGet('_migrated')) return;
  try {
    if (fs.existsSync(LEGACY_JSON)) {
      const old = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
      for (const conv of Object.values(old.conversations || {})) {
        saveConversationRow(conv);
      }
      const insMsg = db.prepare('INSERT OR REPLACE INTO messages (id, conversationId, createdAt, data) VALUES (?, ?, ?, ?)');
      for (const [cid, list] of Object.entries(old.messages || {})) {
        for (const m of list || []) insMsg.run(m.id, cid, m.createdAt || 0, JSON.stringify(m));
      }
      if (old.rules) kvSet('rules', old.rules);
      if (old.settings) kvSet('settings', old.settings);
      if (old.users) kvSet('users', old.users);
      if (old.broadcasts) kvSet('broadcasts', old.broadcasts);
      if (old.products) kvSet('products', old.products);
      kvSet('seq', old.seq || 0);
      // สำรองไฟล์เดิมไว้ (ไม่ลบทิ้ง) เผื่อต้องย้อนกลับ
      try { fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated'); } catch (_) {}
      console.log('db: ย้ายข้อมูลจาก store.json -> ezbot.db เรียบร้อย');
    }
  } catch (e) {
    console.error('db: ย้ายข้อมูลจาก store.json ล้มเหลว:', e);
  }
  kvSet('_migrated', true);
}
migrateFromJsonOnce();

// ---------- ตัวนับ id แบบเพิ่มขึ้นเรื่อยๆ (คงรูปแบบเดิม) ----------
function nextId(prefix) {
  const seq = (kvGet('seq') || 0) + 1;
  kvSet('seq', seq);
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

// ---------- บทสนทนา (conversation) ----------

function listConversations() {
  const rows = db.prepare('SELECT data FROM conversations ORDER BY lastMessageAt DESC').all();
  return rows.map(r => JSON.parse(r.data));
}

function getConversation(id) {
  const row = db.prepare('SELECT data FROM conversations WHERE id = ?').get(id);
  return row ? JSON.parse(row.data) : null;
}

function createConversation({ id, customerName, email, phone, avatarUrl, topic, customerId, source }) {
  const convId = id || nextId('conv');
  const existing = getConversation(convId);
  if (existing) {
    // อัปเดตข้อมูลหากมีการส่งมาเพิ่มเติม
    if (customerName) existing.customerName = customerName;
    if (email) existing.email = email;
    if (phone) existing.phone = phone;
    if (avatarUrl) existing.avatarUrl = avatarUrl;
    if (topic) existing.topic = topic;
    if (customerId) existing.customerId = customerId;
    if (source) existing.source = source;
    return saveConversationRow(existing);
  }
  const now = Date.now();
  const conv = {
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
    createdAt: now,
    lastMessage: '',
    lastMessageAt: now,
  };
  return saveConversationRow(conv);
}

function updateConversation(id, patch) {
  const conv = getConversation(id);
  if (!conv) return null;
  Object.assign(conv, patch);
  return saveConversationRow(conv);
}

function clearAllData() {
  db.exec('DELETE FROM conversations; DELETE FROM messages;');
}

// ---------- ข้อความ (message) ----------

function getMessages(conversationId) {
  const rows = db.prepare('SELECT data FROM messages WHERE conversationId = ? ORDER BY createdAt ASC, rowid ASC').all(conversationId);
  return rows.map(r => JSON.parse(r.data));
}

function addMessage(conversationId, { sender, text, kind, senderName, mediaUrl }) {
  const conv = getConversation(conversationId);
  if (!conv) return null;
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
  db.prepare('INSERT INTO messages (id, conversationId, createdAt, data) VALUES (?, ?, ?, ?)')
    .run(msg.id, conversationId, msg.createdAt, JSON.stringify(msg));

  conv.lastMessage = kind === 'image' ? '[รูปภาพ]' : kind === 'file' ? '[ไฟล์แนบ]' : text;
  conv.lastMessageAt = msg.createdAt;
  if (sender === 'customer') conv.unread = (conv.unread || 0) + 1;
  saveConversationRow(conv);
  return msg;
}

// ---------- กฎบอท (bot rules) ----------
function getRules() {
  let rules = kvGet('rules');
  if (!rules) { rules = JSON.parse(JSON.stringify(DEFAULT_RULES)); kvSet('rules', rules); }
  return rules;
}

function saveRules(rules) {
  return kvSet('rules', rules);
}

// ---------- ตั้งค่าบอท (bot settings) ----------
function getBotSettings() {
  let settings = kvGet('settings');
  if (!settings) {
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    kvSet('settings', settings);
    return settings;
  }
  // เติมคีย์ที่ยังไม่มีจากค่าเริ่มต้น (รองรับกรณีเพิ่มฟีเจอร์/ฟิลด์ใหม่ภายหลัง)
  let changed = false;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (settings[key] === undefined) { settings[key] = DEFAULT_SETTINGS[key]; changed = true; }
  }
  if (changed) kvSet('settings', settings);
  return settings;
}

function saveBotSettings(settings) {
  const merged = Object.assign(getBotSettings(), settings);
  return kvSet('settings', merged);
}

// แปลง path รูปภาพภายใน (เช่น /uploads/xxx.jpg) ให้เป็น URL แบบ absolute
// โดยอ้างอิงค่า publicUrl ในหน้า Settings — จำเป็นสำหรับส่งรูปไป LINE / Facebook
// (คืน null หากไม่ได้ตั้งค่า publicUrl หรือไม่มี mediaUrl)
function absoluteMediaUrl(mediaUrl) {
  if (!mediaUrl) return null;
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl; // เป็น absolute อยู่แล้ว
  const base = ((getBotSettings().publicUrl) || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return base + (mediaUrl.startsWith('/') ? mediaUrl : '/' + mediaUrl);
}

// ---------- ผู้ใช้งาน (Users) ----------
function getUsers() {
  let users = kvGet('users');
  if (!users) {
    users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    kvSet('users', users);
    return users;
  }
  // เติมรหัสผ่านเริ่มต้นให้ผู้ใช้ที่ยังไม่มี (คงพฤติกรรมเดิม)
  let changed = false;
  users.forEach(u => { if (!u.password) { u.password = '123'; changed = true; } });
  if (changed) kvSet('users', users);
  return users;
}

function saveUsers(users) {
  return kvSet('users', users);
}

// ---------- บรอดแคสต์ (Broadcasts) ----------
function getBroadcasts() {
  return kvGet('broadcasts') || [];
}

function addBroadcast(broadcast) {
  const broadcasts = getBroadcasts();
  const newBc = {
    id: nextId('bc'),
    campaignName: broadcast.campaignName,
    audience: broadcast.audience,
    text: broadcast.text,
    mediaUrl: broadcast.mediaUrl || null,
    sendTime: broadcast.sendTime || 'now',
    scheduleTime: broadcast.scheduleTime || null,
    status: broadcast.status || 'draft', // 'sent' | 'scheduled' | 'draft'
    recipientsCount: broadcast.recipientsCount || 0,
    createdAt: Date.now(),
  };
  broadcasts.push(newBc);
  kvSet('broadcasts', broadcasts);
  return newBc;
}

// ---------- สินค้า (Products) ----------
function getProducts() {
  let products = kvGet('products');
  if (!products) { products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)); kvSet('products', products); }
  return products;
}

// บันทึกรายการสินค้า
function saveProducts(products) {
  return kvSet('products', products);
}

// ---------- ปิดฐานข้อมูลอย่างเรียบร้อย (checkpoint WAL เข้าไฟล์หลัก) ----------
let closed = false;
function close() {
  if (closed) return;
  closed = true;
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}
  try { db.close(); } catch (_) {}
}
process.on('exit', close);
process.on('SIGINT', () => { close(); process.exit(0); });
process.on('SIGTERM', () => { close(); process.exit(0); });

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  clearAllData,
  getMessages,
  addMessage,
  getRules,
  saveRules,
  getBotSettings,
  saveBotSettings,
  absoluteMediaUrl,
  getUsers,
  saveUsers,
  getBroadcasts,
  addBroadcast,
  getProducts,
  saveProducts,
  close,
};
