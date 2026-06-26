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

// โครงสร้างเริ่มต้น
const DEFAULT_DATA = { conversations: {}, messages: {}, seq: 0 };

let cache = null;       // เก็บข้อมูลในหน่วยความจำ
let writeTimer = null;  // หน่วงการเขียนไฟล์ (debounce) กันเขียนถี่เกินไป

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch (e) {
    cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
    flushNow();
  }
  return cache;
}

function flushNow() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
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

function createConversation({ id, customerName }) {
  const d = load();
  const convId = id || nextId('conv');
  if (d.conversations[convId]) return d.conversations[convId];
  d.conversations[convId] = {
    id: convId,
    customerName: customerName || 'ลูกค้าใหม่',
    mode: 'bot',            // 'bot' = บอทตอบ, 'human' = แอดมินตอบเอง
    status: 'open',         // open | waiting | closed
    unread: 0,
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

// ---------- ข้อความ (message) ----------

function getMessages(conversationId) {
  return load().messages[conversationId] || [];
}

function addMessage(conversationId, { sender, text, kind }) {
  const d = load();
  if (!d.conversations[conversationId]) return null;
  const msg = {
    id: nextId('msg'),
    conversationId,
    sender,                 // 'customer' | 'admin' | 'bot'
    kind: kind || 'text',
    text,
    createdAt: Date.now(),
  };
  d.messages[conversationId].push(msg);

  const conv = d.conversations[conversationId];
  conv.lastMessage = text;
  conv.lastMessageAt = msg.createdAt;
  if (sender === 'customer') conv.unread += 1;
  scheduleWrite();
  return msg;
}

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  getMessages,
  addMessage,
};
