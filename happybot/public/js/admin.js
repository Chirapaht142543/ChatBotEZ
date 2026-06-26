// Loader for HTML components
async function loadComponents() {
  const elements = document.querySelectorAll('[data-include]');
  const promises = Array.from(elements).map(async (el) => {
    const file = el.getAttribute('data-include');
    try {
      const res = await fetch(file);
      if (res.ok) {
        const text = await res.text();
        const placeholder = document.createElement('div');
        placeholder.innerHTML = text;
        const child = placeholder.firstElementChild;
        el.replaceWith(child);
      } else {
        console.error('Failed to load component:', file);
      }
    } catch (err) {
      console.error('Error loading component:', file, err);
    }
  });
  await Promise.all(promises);
  highlightSidebar();
}

function highlightSidebar() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('.sidebar-menu a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      const isDefaultPage = (currentPath === '/' || currentPath.endsWith('/')) && href === 'admin.html';
      if (currentPath.endsWith(href) || isDefaultPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    }
  });
}

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
  
  const filtered = items.filter(c => {
    if (filter === 'waiting') return c.status === 'waiting';
    if (filter === 'responding') return c.mode === 'human' && c.status !== 'closed';
    if (filter === 'closed') return c.status === 'closed';
    return true; // 'all'
  });

  const query = searchInput.value.toLowerCase();

  convsEl.innerHTML = filtered.map(c => {
    const isSearchMatch = c.customerName.toLowerCase().includes(query) || (c.lastMessage || '').toLowerCase().includes(query);
    if (!isSearchMatch) return '';
    
    // Set fallback image
    const avatar = c.avatarUrl || `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(c.customerName)}&background=dfe6f5&color=1e293b`;
    const isOnline = c.id === 'conv_ploy' || c.id === 'conv_pan'; // simulated online users in mockup

    return `
      <div class="conversation-item ${c.id === activeId ? 'active' : ''}" data-id="${c.id}">
        <div class="avatar-container">
          <img class="avatar-img" src="${avatar}" alt="${escapeHtml(c.customerName)}" />
          ${isOnline ? `<div class="avatar-online-dot"></div>` : ''}
        </div>
        <div class="conversation-meta">
          <div class="conv-name-row">
            <span class="conv-name">${escapeHtml(c.customerName)}</span>
            <span class="conv-time">${c.lastMessageAt ? formatTime(c.lastMessageAt) : ''}</span>
          </div>
          <div class="conv-snippet-row">
            <span class="conv-snippet">${escapeHtml(c.lastMessage || '')}</span>
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
  const c = convs[id];
  c.unread = 0; // mark as read
  renderConvList();
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
        <button class="header-action-btn" title="เมนูเพิ่มเติม">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
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
          <button class="compose-action-btn" title="อีโมจิ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button class="compose-action-btn" title="อัปโหลดรูปภาพ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
          <button class="compose-action-btn" title="แนบไฟล์">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <button class="compose-action-btn" title="ข้อความเทมเพลต">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <button class="compose-action-btn" title="ตำแหน่งที่ตั้ง">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>
          <button class="compose-action-btn" title="ส่งอีเมล">
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
  } else {
    bubble.textContent = m.text;
  }

  container.appendChild(bubble);

  // Metadata (time, status)
  const meta = document.createElement('div');
  meta.className = 'message-meta-row';
  
  const timeText = document.createTextNode(formatTime(m.createdAt));
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
}

// Send Message / Add Note
async function handleSend() {
  const textarea = document.getElementById('replyTextarea');
  const text = textarea.value.trim();
  if (!text) return;
  textarea.value = '';

  if (activeSubTab === 'reply') {
    // Send standard message to customer
    await fetch(API + '/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: activeId, sender: 'admin', text })
    });
  } else {
    // Add internal note
    const c = convs[activeId];
    if (!c.internalNotes) c.internalNotes = [];
    c.internalNotes.push({
      text,
      date: new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      sender: 'แอดมิน'
    });
    renderInfo(c); // refresh info panel
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
function saveContactNote(text) {
  const c = convs[activeId];
  c.notes = text;
  fetch(API + `/api/conversations/${activeId}/mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notes: text }) // backend will save dynamic attributes
  });
}

// Add tag to customer
function addCustomerTag() {
  const tag = prompt("ป้อนชื่อแท็กที่ต้องการเพิ่ม:");
  if (!tag) return;
  const c = convs[activeId];
  if (!c.tags) c.tags = [];
  if (!c.tags.includes(tag)) {
    c.tags.push(tag);
    renderInfo(c);
  }
}

// Remove tag
function removeCustomerTag(tag) {
  const c = convs[activeId];
  if (c.tags) {
    c.tags = c.tags.filter(t => t !== tag);
    renderInfo(c);
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
      <div class="info-field-val source-channel">
        ${source === 'LINE Official' 
          ? `<svg class="source-line-svg" viewBox="0 0 24 24"><path d="M24 10.3c0-5.7-5.4-10.3-12-10.3S0 4.6 0 10.3c0 5.1 4.3 9.4 10.1 10.1l-.7 2.5c-.1.3 0 .6.2.8.1.1.3.2.5.2h.3l2.8-1.6c5.7-.7 10.8-5 10.8-12zM8.1 13.9H5.7c-.4 0-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7s.7.3.7.7v5.4h1.7c.4 0 .7.3.7.7s-.3.7-.7.7zm4.1-.7c0 .4-.3.7-.7.7s-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7s.7.3.7.7v6.1zm5.7 0c0 .4-.3.7-.7.7h-2.4c-.4 0-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7h2.4c.4 0 .7.3.7.7s-.3.7-.7.7H15v1.9h1.7c.4 0 .7.3.7.7s-.3.7-.7.7H15V12h2.2c.4 0 .7.3.7.7zm4.8-2.6c0 .4-.3.7-.7.7H21v1.9c0 .4-.3.7-.7.7s-.7-.3-.7-.7V7.1c0-.4.3-.7.7-.7h2.1c.4 0 .7.3.7.7s-.3.7-.7.7H21V10h1.8c.4 0 .7.3.7.7z"/></svg> LINE Official`
          : source
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
  renderConvList();

  // Auto-open from query parameter or default to conv_ploy
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('convId');
  if (targetId && convs[targetId]) {
    openConv(targetId);
  } else if (convs['conv_ploy']) {
    openConv('conv_ploy');
  }

  // SSE Stream for admins
  const es = new EventSource(API + '/api/admin-stream');
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

  // Category Tabs event
  document.querySelectorAll('.chat-tab').forEach(tab => {
    tab.onclick = (e) => {
      document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      renderConvList();
    };
  });

  await init();
}

window.addEventListener('DOMContentLoaded', startApp);
