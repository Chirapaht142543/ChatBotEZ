// admin.js — ตรรกะจัดการหน้ารับส่งแชทหลักสำหรับแอดมิน

const API = location.origin;
let convs = {};        // id -> conversation
let activeId = null;
let activeSubTab = 'reply'; // 'reply' or 'notes'

let convsEl;
let chatEl;
let infoBody;
let searchInput;

// Time formatter to show exact/relative times
function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = nowDate - dDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (diffDays === 1) {
    return 'เมื่อวาน';
  } else if (diffDays === 2) {
    return '2 วันที่แล้ว';
  } else {
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Render Conversation List
function renderConvList() {
  const items = Object.values(convs).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  
  // Update badges & counts
  document.getElementById('convCount').textContent = items.length;
  const totalUnread = items.reduce((s, c) => s + (c.unread || 0), 0);
  document.getElementById('sidebarBadge').textContent = totalUnread;

  // Filter based on active tab
  const activeTabEl = document.querySelector('.chat-tab.active');
  const filter = activeTabEl ? activeTabEl.dataset.tab : 'all';
  
  // Filter based on source
  const activeSourceBtn = document.querySelector('.source-filter-btn.active');
  const sourceFilter = activeSourceBtn ? activeSourceBtn.dataset.source : 'all';
  
  const filtered = items.filter(c => {
    if (sourceFilter !== 'all' && c.source !== sourceFilter) return false;
    
    if (filter === 'waiting') return c.status === 'waiting';
    if (filter === 'responding') return c.mode === 'human' && c.status !== 'closed';
    if (filter === 'closed') return c.status === 'closed';
    return c.status !== 'closed'; // 'all' tab - hide closed chats
  });

  // กรองแชทที่จบแล้วของลูกค้ารายเดียวกันไม่ให้แสดงซ้ำซ้อน (แสดงเฉพาะอันล่าสุด)
  const uniqueFiltered = [];
  const seenClosedCustomers = new Set();
  
  for (const c of filtered) {
    if (c.status === 'closed' && c.customerId) {
      if (seenClosedCustomers.has(c.customerId)) continue;
      seenClosedCustomers.add(c.customerId);
    }
    uniqueFiltered.push(c);
  }

  const query = searchInput.value.toLowerCase();

  convsEl.innerHTML = uniqueFiltered.map(c => {
    const isSearchMatch = c.customerName.toLowerCase().includes(query) || (c.lastMessage || '').toLowerCase().includes(query);
    if (!isSearchMatch) return '';
    
    // Set fallback image
    const avatar = c.avatarUrl || `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(c.customerName)}&background=dfe6f5&color=1e293b`;
    const isOnline = c.id === 'conv_ploy' || c.id === 'conv_pan'; // simulated online users in mockup

    // Source Badge Icon SVG mapping
    let sourceBadge = '';
    if (c.source === 'Facebook') {
      sourceBadge = `<div class="source-badge" style="position:absolute; bottom:-2px; right:-2px; width:16px; height:16px; border-radius:50%; background:#1877f2; display:flex; align-items:center; justify-content:center; border:2px solid #fff;" title="Facebook"><svg viewBox="0 0 24 24" fill="white" width="10" height="10"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg></div>`;
    } else if (c.source === 'Instagram') {
      sourceBadge = `<div class="source-badge" style="position:absolute; bottom:-2px; right:-2px; width:16px; height:16px; border-radius:50%; background:radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%); display:flex; align-items:center; justify-content:center; border:2px solid #fff;" title="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></div>`;
    } else if (c.source === 'LINE Official') {
      sourceBadge = `<div class="source-badge" style="position:absolute; bottom:-2px; right:-2px; width:16px; height:16px; border-radius:50%; background:#00c300; display:flex; align-items:center; justify-content:center; border:2px solid #fff;" title="LINE"><svg viewBox="0 0 24 24" fill="white" width="10" height="10"><path d="M24 10.3c0-5.7-5.4-10.3-12-10.3S0 4.6 0 10.3c0 5.1 4.3 9.4 10.1 10.1l-.7 2.5c-.1.3 0 .6.2.8.1.1.3.2.5.2h.3l2.8-1.6c5.7-.7 10.8-5 10.8-12z"/></svg></div>`;
    } else {
      sourceBadge = `<div class="source-badge" style="position:absolute; bottom:-2px; right:-2px; width:16px; height:16px; border-radius:50%; background:#64748b; display:flex; align-items:center; justify-content:center; border:2px solid #fff;" title="Website"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>`;
    }

    return `
      <div class="conversation-item ${c.id === activeId ? 'active' : ''}" data-id="${c.id}">
        <div class="avatar-container" style="position: relative;">
          <img class="avatar-img" src="${avatar}" alt="${escapeHtml(c.customerName)}" />
          ${isOnline ? `<div class="avatar-online-dot"></div>` : ''}
          ${sourceBadge}
        </div>
        <div class="conversation-meta">
          <div class="conv-name-row">
            <span class="conv-name">${escapeHtml(c.customerName)}</span>
            <span class="conv-time">${c.lastMessageAt ? formatTime(c.lastMessageAt) : ''}</span>
          </div>
          <div class="conv-snippet-row">
            <span class="conv-snippet">${escapeHtml(c.lastMessage || '')}</span>
            ${c.topic ? `<span style="font-size:10px; background:rgba(212,160,23,0.2); color:#d4a017; padding:2px 6px; border-radius:10px; margin-left:4px; white-space:nowrap;">${escapeHtml(c.topic)}</span>` : ''}
            ${c.rating ? `<span style="font-size:10px; background:rgba(255,215,0,0.2); color:#ffd700; padding:2px 6px; border-radius:10px; margin-left:4px; white-space:nowrap;">⭐ ${c.rating.score}</span>` : ''}
            ${c.unread ? `<span class="conv-badge">${c.unread}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  convsEl.querySelectorAll('.conversation-item').forEach(el => {
    el.onclick = () => openConv(el.dataset.id);
  });
}

// Open Conversation
async function openConv(id) {
  activeId = id;
  localStorage.setItem('activeConvId', id);
  const c = convs[id];
  
  if (c.unread > 0) {
    c.unread = 0; // mark as read
    renderConvList();
    fetch(API + `/api/conversations/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unread: 0 })
    }).catch(console.error);
  } else {
    renderConvList();
  }
  
  renderInfo(c);

  const msgs = await (await fetch(API + `/api/conversations/${id}/messages`)).json();
  const avatar = c.avatarUrl || `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(c.customerName)}&background=dfe6f5&color=1e293b`;
  
  chatEl.innerHTML = `
    <div class="chat-window-header">
      <div class="header-user-info">
        <div class="avatar-container">
          <img class="avatar-img" src="${avatar}" alt="${escapeHtml(c.customerName)}" />
          <div class="avatar-online-dot"></div>
        </div>
        <div class="header-user-text">
          <span class="header-user-name">${escapeHtml(c.customerName)}</span>
          <span class="header-user-status">
            <span class="header-user-status-dot"></span>
            ออนไลน์
          </span>
        </div>
      </div>
      <div class="header-actions">
        ${c.status !== 'closed' ? `
        <button class="header-action-btn" id="resolveBtn" title="จบแชท (Resolve)" style="color:#d4a017; font-size:12px; font-weight:600; padding:4px 10px; border:1px solid #d4a017; border-radius:12px; width:auto; height:auto; margin-right:8px;">
          จบแชท
        </button>` : `<span style="color:#ef4444; font-size:12px; font-weight:500; padding:4px 10px; border:1px solid rgba(239,68,68,0.3); border-radius:12px; margin-right:8px; white-space:nowrap; background:rgba(239,68,68,0.05);">จบสนทนาแล้ว</span>`}
        <button class="header-action-btn" title="ดูประวัติแชท" onclick="openHistoryModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><line x1="12" y1="7" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>
        </button>
        <button class="header-action-btn" title="ติดแท็ก">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        </button>
        <button class="header-action-btn ${c.starred ? 'star-active' : ''}" id="starBtn" title="ติดดาว">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>
    </div>
    
    <div class="chat-messages-stream" id="stream"></div>
    
    <div class="chat-compose-area">
      <div class="compose-tabs">
        <div class="compose-tab ${activeSubTab === 'reply' ? 'active' : ''}" id="tabReply">ตอบแชท</div>
        <div class="compose-tab ${activeSubTab === 'notes' ? 'active' : ''}" id="tabNotes">หมายเหตุ</div>
      </div>
      <textarea class="compose-textarea" id="replyTextarea" placeholder="${activeSubTab === 'reply' ? 'พิมพ์ข้อความตอบกลับ...' : 'พิมพ์โน้ตส่วนตัวที่นี่...'}"></textarea>
      
      <div class="compose-footer">
        <div class="compose-actions-left">
          <input type="file" id="hiddenImageInput" accept="image/*" style="display:none" />
          <input type="file" id="hiddenFileInput" style="display:none" />
          <button class="compose-action-btn" id="btnEmoji" type="button" title="อีโมจิ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button class="compose-action-btn" id="btnImage" type="button" title="อัปโหลดรูปภาพ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
          <button class="compose-action-btn" id="btnFile" type="button" title="แนบไฟล์">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <button class="compose-action-btn" id="btnTemplates" type="button" title="ข้อความเทมเพลต">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <button class="compose-action-btn" type="button" title="ส่งอีเมล">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </button>
        </div>
        
        <div class="send-split-btn">
          <button class="send-main-part" id="sendBtn">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            ส่ง
          </button>
          <div class="send-divider-line"></div>
          <button class="send-dropdown-part">
            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
        </div>
      </div>
    </div>`;

  // Render Date separator "วันนี้"
  const streamEl = document.getElementById('stream');
  streamEl.innerHTML = `<div class="date-divider"><span class="date-divider-pill">วันนี้</span></div>`;

  msgs.forEach(addBubble);
  scrollDown();

  // Attach events
  document.getElementById('sendBtn').onclick = handleSend;
  document.getElementById('replyTextarea').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  document.getElementById('tabReply').onclick = () => switchSubTab('reply');
  document.getElementById('tabNotes').onclick = () => switchSubTab('notes');
  document.getElementById('starBtn').onclick = toggleStar;
  
  const resolveBtn = document.getElementById('resolveBtn');
  if (resolveBtn) resolveBtn.onclick = resolveChat;

  // Toolbar events
  document.getElementById('btnEmoji').onclick = (e) => toggleEmojiPicker(e.currentTarget);
  document.getElementById('btnTemplates').onclick = (e) => toggleTemplatesPicker(e.currentTarget);
  document.getElementById('btnImage').onclick = () => document.getElementById('hiddenImageInput').click();
  document.getElementById('btnFile').onclick = () => document.getElementById('hiddenFileInput').click();
  
  document.getElementById('hiddenImageInput').onchange = (e) => handleFileUpload(e, 'image');
  document.getElementById('hiddenFileInput').onchange = (e) => handleFileUpload(e, 'file');
}

function switchSubTab(tab) {
  activeSubTab = tab;
  const tabReply = document.getElementById('tabReply');
  const tabNotes = document.getElementById('tabNotes');
  const textarea = document.getElementById('replyTextarea');
  
  if (tab === 'reply') {
    tabReply.classList.add('active');
    tabNotes.classList.remove('active');
    textarea.placeholder = 'พิมพ์ข้อความตอบกลับ...';
  } else {
    tabReply.classList.remove('active');
    tabNotes.classList.add('active');
    textarea.placeholder = 'พิมพ์โน้ตส่วนตัวที่นี่...';
  }
}

// Add bubble message to the UI
function addBubble(m) {
  const stream = document.getElementById('stream');
  if (!stream || m.conversationId !== activeId) return;

  const isOutbound = m.sender !== 'customer'; // admin or bot goes right

  const row = document.createElement('div');
  row.className = `message-bubble-row ${isOutbound ? 'outbound' : 'inbound'}`;

  const container = document.createElement('div');
  container.className = 'message-bubble-container';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (m.kind === 'image') {
    const img = document.createElement('img');
    img.src = m.mediaUrl || '/backpack.png';
    img.className = 'message-image';
    bubble.appendChild(img);
    
    const cap = document.createElement('div');
    cap.textContent = m.text;
    bubble.appendChild(cap);
  } else if (m.kind === 'file') {
    const fileLink = document.createElement('a');
    fileLink.href = m.mediaUrl;
    fileLink.target = '_blank';
    fileLink.className = 'message-file-link';
    fileLink.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      <span>${escapeHtml(m.text)}</span>
    `;
    bubble.appendChild(fileLink);
  } else {
    bubble.textContent = m.text;
  }

  container.appendChild(bubble);

  // Metadata (time, status, sender name)
  const meta = document.createElement('div');
  meta.className = 'message-meta-row';
  
  let metaStr = formatTime(m.createdAt);
  if (m.sender === 'admin') {
    const name = m.senderName || 'แอดมิน';
    metaStr += ` • ตอบโดย ${name}`;
  } else if (m.sender === 'bot') {
    metaStr += ` • ตอบโดย AI`;
  }
  
  const timeText = document.createTextNode(metaStr);
  meta.appendChild(timeText);

  if (isOutbound) {
    // Add blue double checkmark
    const svgStr = `<svg class="checkmarks-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5L9.5 12.5L6 9M22 5l-7.5 7.5L13 11"/></svg>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, 'image/svg+xml');
    meta.appendChild(doc.documentElement);
  }

  container.appendChild(meta);
  row.appendChild(container);
  stream.appendChild(row);
  scrollDown();
}

function scrollDown() {
  const s = document.getElementById('stream');
  if (s) s.scrollTop = s.scrollHeight;
}

// Toggle Star
async function toggleStar() {
  const c = convs[activeId];
  c.starred = !c.starred;
  const starBtn = document.getElementById('starBtn');
  if (c.starred) {
    starBtn.classList.add('star-active');
  } else {
    starBtn.classList.remove('star-active');
  }
  
  await fetch(API + `/api/conversations/${activeId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ starred: c.starred })
  });
}

// Resolve/Close Chat
function resolveChat() {
  showConfirmDialog({
    title: 'จบการสนทนา',
    message: 'คุณแน่ใจว่าต้องการจบการสนทนานี้ใช่หรือไม่? เมื่อยืนยันระบบจะปิดสถานะการตอบรับของแชทนี้ทันที',
    onConfirm: async () => {
      const c = convs[activeId];
      c.status = 'closed';
      
      await fetch(API + `/api/conversations/${activeId}/close`, {
        method: 'POST'
      });
      
      renderConvList();
      openConv(activeId); // re-render to hide compose area and show 'closed' tag
    }
  });
}

// Send Message / Add Note
async function handleSend() {
  const textarea = document.getElementById('replyTextarea');
  const text = textarea.value.trim();
  if (!text) return;
  textarea.value = '';

  if (activeSubTab === 'reply') {
    // Send standard message to customer
    const userJson = localStorage.getItem('currentUser');
    const currentUser = userJson ? JSON.parse(userJson) : {};
    
    await fetch(API + '/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 
        conversationId: activeId, 
        sender: 'admin', 
        text,
        senderName: currentUser.name ? currentUser.name.split(' ')[0] : 'แอดมิน'
      })
    });
  } else {
    // Add internal note
    const c = convs[activeId];
    if (!c.internalNotes) c.internalNotes = [];
    
    const userJson = localStorage.getItem('currentUser');
    const currentUser = userJson ? JSON.parse(userJson) : {};
    const senderDisplay = currentUser.name ? currentUser.name.split(' ')[0] : 'แอดมิน';

    c.internalNotes.push({
      text,
      date: new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      sender: senderDisplay
    });
    renderInfo(c); // refresh info panel
    
    // บันทึกไปฝั่งเซิร์ฟเวอร์
    await fetch(API + `/api/conversations/${activeId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ internalNotes: c.internalNotes })
    });
  }
}

// Toggle Bot Mode
async function toggleMode() {
  const c = convs[activeId];
  const nextMode = c.mode === 'human' ? 'bot' : 'human';
  
  await fetch(API + `/api/conversations/${activeId}/mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: nextMode })
  });

  c.mode = nextMode;
  renderInfo(c);
  renderConvList();
}

// Save notes to contact
async function saveContactNote(text) {
  const c = convs[activeId];
  c.notes = text;
  await fetch(API + `/api/conversations/${activeId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notes: text })
  });
}

// Add tag to customer
function addCustomerTag() {
  showPromptDialog({
    title: 'เพิ่มแท็กสำหรับลูกค้า',
    placeholder: 'ป้อนชื่อแท็กที่ต้องการเพิ่ม...',
    onConfirm: async (tag) => {
      if (!tag) return;
      const c = convs[activeId];
      if (!c.tags) c.tags = [];
      if (!c.tags.includes(tag)) {
        c.tags.push(tag);
        renderInfo(c);
        
        await fetch(API + `/api/conversations/${activeId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tags: c.tags })
        });
      }
    }
  });
}

// Remove tag
async function removeCustomerTag(tag) {
  const c = convs[activeId];
  if (c.tags) {
    c.tags = c.tags.filter(t => t !== tag);
    renderInfo(c);
    
    await fetch(API + `/api/conversations/${activeId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: c.tags })
    });
  }
}

// Render Customer Info Column
function renderInfo(c) {
  // Mock fallback fields for users other than คุณพลอย
  const phone = c.phone || "ไม่ระบุเบอร์โทร";
  const email = c.email || "ไม่ระบุอีเมล";
  const source = c.source || "Web Chat";
  const tags = c.tags || [];
  const notes = c.notes || "";
  const orders = c.orders || [];
  const internalNotes = c.internalNotes || [];
  const avatar = c.avatarUrl || `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(c.customerName)}&background=dfe6f5&color=1e293b`;

  infoBody.innerHTML = `
    <!-- Profile Card -->
    <div class="info-profile-card">
      <img class="info-avatar-img" src="${avatar}" alt="${escapeHtml(c.customerName)}" />
      <span class="info-customer-name">${escapeHtml(c.customerName)}</span>
      <span class="info-customer-status">
        <span class="header-user-status-dot"></span>
        ออนไลน์
      </span>
    </div>
    
    <!-- Rating Info -->
    ${c.rating ? `
    <div class="info-field-group">
      <span class="info-field-label">ผลประเมินจากลูกค้า</span>
      <div style="background:var(--bg-input); padding:12px; border-radius:8px; border:1px solid var(--border); margin-top:8px;">
        <div style="font-size:20px; color:#ffd700; margin-bottom:4px;">${'★'.repeat(c.rating.score)}${'☆'.repeat(5-c.rating.score)} <span style="font-size:14px; color:var(--text);">${c.rating.score}/5</span></div>
        ${c.rating.comment ? `<div style="font-size:13px; color:var(--text-muted); font-style:italic;">"${escapeHtml(c.rating.comment)}"</div>` : ''}
      </div>
    </div>` : ''}

    <!-- Bot Mode Toggle -->
    <div class="info-field-group">
      <span class="info-field-label">โหมดการตอบ</span>
      <div class="bot-mode-card ${c.mode}" onclick="toggleMode()">
        ${c.mode === 'bot' 
          ? `<span>🤖 โหมดบอทอัตโนมัติ</span><span style="font-size:10px;opacity:0.8">กดเพื่อเปลี่ยน</span>` 
          : `<span>🧑 โหมดแอดมินดูแล</span><span style="font-size:10px;opacity:0.8">กดเพื่อเปลี่ยน</span>`
        }
      </div>
    </div>

    <!-- Contact Info -->
    <div class="info-field-group">
      <span class="info-field-label">เบอร์โทร</span>
      <span class="info-field-val">${escapeHtml(phone)}</span>
    </div>
    
    <div class="info-field-group">
      <span class="info-field-label">อีเมล</span>
      <span class="info-field-val">${escapeHtml(email)}</span>
    </div>
    
    <div class="info-field-group">
      <span class="info-field-label">เข้ามาจาก</span>
      <div class="info-field-val source-channel" style="display: flex; align-items: center; gap: 6px;">
        ${source === 'LINE Official' 
          ? `<svg class="source-line-svg" viewBox="0 0 24 24" width="16" height="16" fill="#00c300"><path d="M24 10.3c0-5.7-5.4-10.3-12-10.3S0 4.6 0 10.3c0 5.1 4.3 9.4 10.1 10.1l-.7 2.5c-.1.3 0 .6.2.8.1.1.3.2.5.2h.3l2.8-1.6c5.7-.7 10.8-5 10.8-12zM8.1 13.9H5.7c-.4 0-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7s.7.3.7.7v5.4h1.7c.4 0 .7.3.7.7s-.3.7-.7.7zm4.1-.7c0 .4-.3.7-.7.7s-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7s.7.3.7.7v6.1zm5.7 0c0 .4-.3.7-.7.7h-2.4c-.4 0-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7h2.4c.4 0 .7.3.7.7s-.3.7-.7.7H15v1.9h1.7c.4 0 .7.3.7.7s-.3.7-.7.7H15V12h2.2c.4 0 .7.3.7.7zm4.8-2.6c0 .4-.3.7-.7.7H21v1.9c0 .4-.3.7-.7.7s-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7h2.1c.4 0 .7.3.7.7s-.3.7-.7.7H21V10h1.8c.4 0 .7.3.7.7z"/></svg> LINE Official`
          : source === 'Facebook'
          ? `<svg viewBox="0 0 24 24" fill="#1877f2" width="16" height="16"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg> Facebook`
          : source === 'Instagram'
          ? `<div style="width:16px; height:16px; border-radius:4px; background:radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%); display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></div> Instagram`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Website`
        }
      </div>
    </div>

    <!-- Tags -->
    <div class="info-field-group">
      <div class="info-tag-header">
        <span class="info-field-label">แท็ก</span>
        <button class="btn-add-tag" onclick="addCustomerTag()" title="เพิ่มแท็ก">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="tag-container">
        ${tags.length > 0 
          ? tags.map(t => `
              <span class="tag-pill">
                ${escapeHtml(t)}
                <span class="tag-close" onclick="removeCustomerTag('${escapeHtml(t)}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </span>
              </span>`).join('')
          : '<span style="font-size:12px;color:var(--text-muted);font-style:italic">ไม่มีแท็ก</span>'
        }
      </div>
    </div>

    <!-- Notes -->
    <div class="info-field-group">
      <div class="info-note-header">
        <span class="info-field-label">หมายเหตุ</span>
        <button class="btn-edit-note" title="แก้ไขหมายเหตุ">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
      </div>
      <textarea class="note-textarea" placeholder="เพิ่มหมายเหตุ..." onchange="saveContactNote(this.value)">${escapeHtml(notes)}</textarea>
    </div>

    <!-- Purchase History -->
    <div class="info-field-group">
      <div class="purchase-history-header">
        <span class="info-field-label">ประวัติการสั่งซื้อ</span>
        <a class="view-all-link" href="#">ดูทั้งหมด</a>
      </div>
      <div class="order-list">
        ${orders.length > 0
          ? orders.map(o => `
              <div class="order-item">
                <a class="order-id" href="#">${escapeHtml(o.id)}</a>
                <span class="order-price">${escapeHtml(o.price)}</span>
                <span class="order-date">${escapeHtml(o.date)}</span>
                <span class="order-status">${escapeHtml(o.status)}</span>
              </div>`).join('')
          : '<span style="font-size:12px;color:var(--text-muted);font-style:italic">ไม่มีประวัติการสั่งซื้อ</span>'
        }
      </div>
    </div>

    <!-- Internal Note -->
    <div class="info-field-group">
      <span class="internal-note-title">โน้ตภายใน</span>
      <div id="internalNotesList">
        ${internalNotes.length > 0
          ? internalNotes.map(n => `
              <div class="internal-note-card">
                <div class="internal-note-text">${escapeHtml(n.text)}</div>
                <div class="internal-note-footer">
                  <span>${escapeHtml(n.date)}</span>
                  <span>${escapeHtml(n.sender)}</span>
                </div>
              </div>`).join('')
          : '<span style="font-size:12px;color:var(--text-muted);font-style:italic">ไม่มีโน้ตภายใน</span>'
        }
      </div>
    </div>`;
}

// Initialize Application
async function init() {
  const list = await (await fetch(API + '/api/conversations')).json();
  list.forEach(c => convs[c.id] = c);

  // Restore active tab from localStorage
  const savedTab = localStorage.getItem('activeChatTab') || 'all';
  document.querySelectorAll('.chat-tab').forEach(tab => {
    if (tab.dataset.tab === savedTab) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Restore active source filter from localStorage
  const savedSource = localStorage.getItem('activeSourceFilter') || 'all';
  document.querySelectorAll('.source-filter-btn').forEach(btn => {
    if (btn.dataset.source === savedSource) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderConvList();

  // Auto-open from query parameter, localStorage or default to first loaded conversation
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('convId') || localStorage.getItem('activeConvId');
  if (targetId && convs[targetId]) {
    openConv(targetId);
  } else if (convs['conv_ploy']) {
    openConv('conv_ploy');
  } else if (list.length > 0) {
    openConv(list[0].id);
  }

  // SSE Stream for admins
  const es = new EventSource(API + '/api/admin-stream');
  
  let esConnected = false;
  es.addEventListener('open', () => {
    if (esConnected) {
      // Reconnected after a server restart or network drop -> Reload to sync state
      window.location.reload();
    }
    esConnected = true;
  });

  es.addEventListener('clear_all', () => {
    window.location.reload();
  });
  es.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    const c = convs[m.conversationId];
    if (c) {
      c.lastMessage = m.text;
      c.lastMessageAt = m.createdAt;
      if (m.sender === 'customer' && m.conversationId !== activeId) {
        c.unread = (c.unread || 0) + 1;
      }
    }
    addBubble(m);
    renderConvList();
  });
  
  es.addEventListener('conversation', e => {
    const c = JSON.parse(e.data);
    convs[c.id] = Object.assign(convs[c.id] || {}, c);
    renderConvList();
  });

  es.addEventListener('handoff', e => {
    const { conversationId } = JSON.parse(e.data);
    if (convs[conversationId]) {
      convs[conversationId].mode = 'human';
    }
    renderConvList();
    if (conversationId === activeId) {
      renderInfo(convs[activeId]);
    }
  });
}

async function startApp() {
  // Load components first
  await loadComponents();

  // Initialize DOM elements
  convsEl = document.getElementById('convs');
  chatEl = document.getElementById('chat');
  infoBody = document.getElementById('infoBody');
  searchInput = document.getElementById('search');

  // Search filtering event
  searchInput.addEventListener('input', () => {
    renderConvList();
  });

  // Source filtering event
  document.querySelectorAll('.source-filter-btn').forEach(btn => {
    btn.onclick = (e) => {
      document.querySelectorAll('.source-filter-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      localStorage.setItem('activeSourceFilter', e.currentTarget.dataset.source);
      renderConvList();
    };
  });

  // Category Tabs event
  document.querySelectorAll('.chat-tab').forEach(tab => {
    tab.onclick = (e) => {
      document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
      const clickedTab = e.currentTarget;
      clickedTab.classList.add('active');
      localStorage.setItem('activeChatTab', clickedTab.dataset.tab);
      renderConvList();
    };
  });

  // Initialize Header interactivity (bell, status)
  initHeaderInteractivity();

  // Load saved agent status if any
  const savedStatus = localStorage.getItem('agentStatus');
  if (savedStatus) {
    try {
      const { label, color } = JSON.parse(savedStatus);
      changeAgentStatus(label, color);
    } catch(e) {}
  }

  await init();
}

window.addEventListener('DOMContentLoaded', startApp);

// CSS สำหรับ Popovers และปุ่มแนบไฟล์
const toolbarStyle = document.createElement('style');
toolbarStyle.textContent = `
  .custom-popover {
    background: #fff;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    padding: 12px;
    display: grid;
    box-sizing: border-box;
  }
  .emoji-popover {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    width: 160px;
  }
  .popover-emoji-item {
    font-size: 20px;
    cursor: pointer;
    text-align: center;
    padding: 4px;
    border-radius: 6px;
    transition: background 0.2s;
    user-select: none;
  }
  .popover-emoji-item:hover {
    background: var(--bg-light);
  }
  .templates-popover {
    width: 280px;
    padding: 0 !important;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .popover-templates-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #f8fafc;
    border-bottom: 1px solid var(--border-color);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .popover-templates-header a {
    color: var(--brand-blue);
    text-decoration: none;
    font-size: 11px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 2px;
    transition: color 0.2s;
  }
  .popover-templates-header a:hover {
    color: var(--brand-blue-hover);
  }
  .popover-templates-list {
    max-height: 220px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .popover-templates-list::-webkit-scrollbar {
    width: 6px;
  }
  .popover-templates-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .popover-templates-list::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
  .popover-templates-list::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  .popover-template-item {
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-bottom: none;
    text-align: left;
    border-left: 3px solid transparent;
  }
  .popover-template-item:hover {
    background: rgba(37, 99, 235, 0.05);
    border-left-color: var(--brand-blue);
  }
  .popover-template-item strong {
    font-size: 13px;
    color: var(--text-primary);
    display: block;
    margin-bottom: 2px;
  }
  .popover-template-item p {
    font-size: 11px;
    color: var(--text-secondary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .message-file-link {
    display: flex;
    align-items: center;
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 500;
  }
  .message-file-link:hover {
    text-decoration: underline;
  }
  
  /* Status & Notifications Styles */
  .status-popover, .notification-popover {
    width: 180px;
    gap: 4px;
  }
  .notification-popover {
    width: 280px;
    max-height: 250px;
    overflow-y: auto;
  }
  .popover-status-item, .popover-notification-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s;
    text-align: left;
  }
  .popover-status-item:hover, .popover-notification-item:hover {
    background: var(--bg-light);
  }
  .status-dot-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .popover-notification-item {
    flex-direction: column;
    align-items: flex-start;
    border-bottom: 1px solid #f1f5f9;
  }
  .popover-notification-item strong {
    font-size: 12px;
    color: #ef4444;
  }
  .popover-notification-item p {
    margin: 4px 0 0 0;
    font-size: 11px;
    color: var(--text-secondary);
  }

  /* Custom Confirm Modal Styling */
  .confirm-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .confirm-modal-overlay.active {
    opacity: 1;
    pointer-events: auto;
  }
  .confirm-modal-box {
    background: #fff;
    border-radius: 16px;
    width: 90%;
    max-width: 400px;
    padding: 24px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    transform: scale(0.9);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-align: center;
    border: 1px solid rgba(226, 232, 240, 0.8);
    box-sizing: border-box;
  }
  .confirm-modal-overlay.active .confirm-modal-box {
    transform: scale(1);
  }
  .confirm-modal-icon {
    width: 56px;
    height: 56px;
    background: #fef2f2;
    color: #ef4444;
    border-radius: 50%;
    display: grid;
    place-items: center;
    margin: 0 auto 16px auto;
  }
  .confirm-modal-icon svg {
    width: 28px;
    height: 28px;
  }
  .confirm-modal-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 8px;
  }
  .confirm-modal-message {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 24px;
  }
  .confirm-modal-actions {
    display: flex;
    gap: 12px;
  }
  .confirm-btn {
    flex: 1;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    font-family: inherit;
  }
  .confirm-btn-cancel {
    background: #fff;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }
  .confirm-btn-cancel:hover {
    background: var(--bg-light);
    border-color: #cbd5e1;
  }
  .confirm-btn-ok {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
  }
  .confirm-btn-ok:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.3);
  }
  .confirm-modal-input {
    width: 100%;
    border: 1.5px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13.5px;
    margin-top: 14px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    font-family: inherit;
  }
  .confirm-modal-input:focus {
    border-color: var(--brand-blue);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }
  .confirm-btn-primary {
    background: var(--brand-blue);
    color: #fff;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
  }
  .confirm-btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
  }
`;
document.head.appendChild(toolbarStyle);

let activePopover = null;

function closePopover() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
}

document.addEventListener('click', (e) => {
  if (activePopover && !activePopover.contains(e.target) && !e.target.closest('.compose-action-btn') && !e.target.closest('.agent-status-dropdown') && !e.target.closest('.notification-bell')) {
    closePopover();
  }
});

function positionPopover(btn, popover) {
  const rect = btn.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  popover.style.left = `${rect.left}px`;
  popover.style.zIndex = '9999';
}

function toggleEmojiPicker(btn) {
  if (activePopover && activePopover.dataset.type === 'emoji') {
    closePopover();
    return;
  }
  closePopover();
  
  const popover = document.createElement('div');
  popover.className = 'custom-popover emoji-popover';
  popover.dataset.type = 'emoji';
  
  const emojis = ['😊', '👍', '🙏', '❤️', '😂', '🎉', '👜', '🎮', '💡', '🔥', '✨', '👌'];
  popover.innerHTML = emojis.map(em => `
    <span class="popover-emoji-item" onclick="insertEmoji('${em}')">${em}</span>
  `).join('');
  
  document.body.appendChild(popover);
  positionPopover(btn, popover);
  activePopover = popover;
}

function insertEmoji(em) {
  const textarea = document.getElementById('replyTextarea');
  if (textarea) {
    textarea.value += em;
    textarea.focus();
  }
  closePopover();
}

function toggleTemplatesPicker(btn) {
  if (activePopover && activePopover.dataset.type === 'templates') {
    closePopover();
    return;
  }
  closePopover();
  
  const popover = document.createElement('div');
  popover.className = 'custom-popover templates-popover';
  popover.dataset.type = 'templates';
  
  let templates = [];
  const saved = localStorage.getItem('ezbot_quick_templates');
  if (saved) {
    try {
      templates = JSON.parse(saved);
    } catch(e) {
      templates = [];
    }
  }
  if (!templates || templates.length === 0) {
    templates = [
      { title: 'กล่าวทักทาย', text: 'สวัสดีค่ะ ยินดีให้บริการค่ะ มีข้อสงสัยสอบถามได้เลยนะคะ 😊' },
      { title: 'แจ้งราคาและโปรโมชั่น', text: 'รุ่นนี้ราคา 790 บาทค่ะ ตอนนี้มีโปรส่งฟรีอยู่นะคะ สนใจรับเลยไหมคะ ✨' },
      { title: 'รายละเอียดการจัดส่ง', text: 'จัดส่งด้วย Kerry/Flash ค่ะ ส่งของทุกวันจันทร์-เสาร์ ได้รับใน 1-3 วันค่ะ 📦' },
      { title: 'ขอบคุณลูกค้า', text: 'ขอบคุณมากนะคะที่ไว้วางใจใช้บริการของทางร้านค่ะ 🙏' }
    ];
  }
  
  popover.innerHTML = `
    <div class="popover-templates-header">
      <span>เลือกเทมเพลตข้อความ</span>
      <a href="templates.html" target="_blank">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>จัดการ
      </a>
    </div>
    <div class="popover-templates-list">
      ${templates.map(t => `
        <div class="popover-template-item" onclick="insertTemplate(\`${t.text.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">
          <strong>${t.title}</strong>
          <p>${t.text}</p>
        </div>
      `).join('')}
    </div>
  `;
  
  document.body.appendChild(popover);
  positionPopover(btn, popover);
  activePopover = popover;
}

function insertTemplate(text) {
  const textarea = document.getElementById('replyTextarea');
  if (textarea) {
    textarea.value = text;
    textarea.focus();
  }
  closePopover();
}

async function handleFileUpload(event, kind) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    
    try {
      const res = await fetch(API + '/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, base64 })
      });
      const data = await res.json();
      if (data.success) {
        // Send message with mediaUrl
        const userJson = localStorage.getItem('currentUser');
        const currentUser = userJson ? JSON.parse(userJson) : {};
        const senderName = currentUser.name ? currentUser.name.split(' ')[0] : 'แอดมิน';
        
        await fetch(API + '/api/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeId,
            sender: 'admin',
            text: file.name,
            kind: kind,
            mediaUrl: data.url,
            senderName
          })
        });
      } else {
        alert('อัปโหลดไฟล์ล้มเหลว');
      }
    } catch (err) {
      console.error('File upload error:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดไฟล์');
    }
  };
  reader.readAsDataURL(file);
}

// Header popover functions are now in shared.js

// ==== History Modal ====
async function openHistoryModal() {
  const c = convs[activeId];
  if (!c || !c.customerId) {
    alert("ไม่มีข้อมูลประวัติสำหรับลูกค้ารายนี้");
    return;
  }
  
  document.getElementById('historyModal').classList.add('active');
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">กำลังโหลด...</div>';
  
  try {
    const res = await fetch(API + `/api/customers/${c.customerId}/conversations`);
    const data = await res.json();
    
    if (data.length === 0) {
      historyList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">ไม่พบประวัติการแชท</div>';
      return;
    }
    
    // เรียงจากใหม่ไปเก่า
    data.sort((a,b) => b.createdAt - a.createdAt);
    
    historyList.innerHTML = data.map(hist => {
      const isCurrent = hist.id === activeId;
      return `
        <div class="history-item" ${isCurrent ? 'style="border-color:var(--brand-blue);background:#f8fafc;"' : `onclick="openConv('${hist.id}'); closeHistoryModal();"`}>
          <div class="history-item-header">
            <span class="history-topic">${escapeHtml(hist.topic || 'ไม่มีหัวข้อ')} ${isCurrent ? '<span style="font-size:10px;background:#dbeafe;color:var(--brand-blue);padding:2px 6px;border-radius:10px;margin-left:4px;">ห้องปัจจุบัน</span>' : ''} ${hist.status === 'closed' ? '<span style="font-size:10px;background:rgba(239,68,68,0.1);color:#ef4444;padding:2px 6px;border-radius:10px;margin-left:4px;">จบแล้ว</span>' : ''}</span>
            <span class="history-date">${formatTime(hist.createdAt)}</span>
          </div>
          <div class="history-snippet">${escapeHtml(hist.lastMessage || '(ไม่มีข้อความ)')}</div>
          ${hist.rating ? `<div style="margin-top:8px;font-size:12px;color:#ffd700;">⭐ ${hist.rating.score}/5 <span style="color:var(--text-muted);font-style:italic;">${escapeHtml(hist.rating.comment || '')}</span></div>` : ''}
        </div>
      `;
    }).join('');
    
  } catch (err) {
    historyList.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">เกิดข้อผิดพลาดในการดึงข้อมูล</div>';
  }
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('active');
}

// Custom Confirm Dialog function
function showConfirmDialog({ title, message, onConfirm }) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';
  
  overlay.innerHTML = `
    <div class="confirm-modal-box">
      <div class="confirm-modal-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="confirm-modal-title">${title}</div>
      <div class="confirm-modal-message">${message}</div>
      <div class="confirm-modal-actions">
        <button class="confirm-btn confirm-btn-cancel" id="confirmBtnCancel">ยกเลิก</button>
        <button class="confirm-btn confirm-btn-ok" id="confirmBtnOk">ยืนยัน</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Show animation
  setTimeout(() => overlay.classList.add('active'), 10);
  
  // Event handlers
  const closeDialog = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 250);
  };
  
  overlay.querySelector('#confirmBtnCancel').onclick = closeDialog;
  
  overlay.querySelector('#confirmBtnOk').onclick = () => {
    closeDialog();
    if (onConfirm) onConfirm();
  };
  
  // Close on overlay backdrop click
  overlay.onclick = (e) => {
    if (e.target === overlay) closeDialog();
  };
}

// Custom Prompt Dialog function
function showPromptDialog({ title, placeholder, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';
  
  overlay.innerHTML = `
    <div class="confirm-modal-box">
      <div class="confirm-modal-icon" style="background: #eff6ff; color: var(--brand-blue);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </div>
      <div class="confirm-modal-title" style="margin-bottom: 4px;">${title}</div>
      <input type="text" class="confirm-modal-input" id="promptInput" placeholder="${placeholder || ''}" autocomplete="off" />
      <div class="confirm-modal-actions" style="margin-top: 20px;">
        <button class="confirm-btn confirm-btn-cancel" id="promptBtnCancel">ยกเลิก</button>
        <button class="confirm-btn confirm-btn-primary" id="promptBtnOk">ตกลง</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const input = overlay.querySelector('#promptInput');
  setTimeout(() => {
    overlay.classList.add('active');
    input.focus();
  }, 10);
  
  const closeDialog = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 250);
  };
  
  overlay.querySelector('#promptBtnCancel').onclick = closeDialog;
  
  const submitValue = () => {
    const val = input.value.trim();
    if (val) {
      closeDialog();
      if (onConfirm) onConfirm(val);
    } else {
      input.focus();
    }
  };

  overlay.querySelector('#promptBtnOk').onclick = submitValue;
  
  // Submit on enter key
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      submitValue();
    } else if (e.key === 'Escape') {
      closeDialog();
    }
  };
  
  overlay.onclick = (e) => {
    if (e.target === overlay) closeDialog();
  };
}
