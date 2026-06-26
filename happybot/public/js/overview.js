// overview.js — ตรรกะควบคุมแดชบอร์ดภาพรวม

// Loader สำหรับโหลด HTML Components
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

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' น.';
  } else if (diffDays === 1) {
    return 'เมื่อวาน';
  } else {
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function fetchStats() {
  try {
    const response = await fetch(API + '/api/conversations');
    const conversations = await response.json();
    
    // 1. คำนวณค่าสถิติหลัก
    const totalChats = conversations.length;
    const waitingChats = conversations.filter(c => c.status === 'waiting').length;
    const botChats = conversations.filter(c => c.mode === 'bot').length;
    const botRate = totalChats > 0 ? Math.round((botChats / totalChats) * 100) : 0;
    
    // อัปเดต UI ในการ์ดสถิติ
    document.getElementById('statTotal').textContent = totalChats;
    document.getElementById('statWaiting').textContent = waitingChats;
    document.getElementById('statBotRate').textContent = botRate + '%';
    
    // อัปเดตตัวเลขการแจ้งเตือนของหน้าห้องแชทใน Sidebar (sidebarBadge)
    const sidebarBadge = document.getElementById('sidebarBadge');
    if (sidebarBadge) {
      const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
      sidebarBadge.textContent = totalUnread;
    }

    // 2. แสดงตารางประวัติกิจกรรมล่าสุด (5 รายการล่าสุด เรียงตามเวลา)
    const sortedConvs = [...conversations].sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    const recentConvs = sortedConvs.slice(0, 5);
    
    const activityListEl = document.getElementById('activityList');
    if (recentConvs.length === 0) {
      activityListEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">ไม่มีกิจกรรมล่าสุด</div>';
      return;
    }

    activityListEl.innerHTML = recentConvs.map(c => {
      const avatar = c.avatarUrl || `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(c.customerName)}&background=dfe6f5&color=1e293b`;
      
      // กำหนดสถานะและสไตล์ป้ายของแถบกิจกรรม
      let statusLabel = '🤖 บอททำงาน';
      let statusClass = 'status-bot';
      
      if (c.status === 'closed') {
        statusLabel = '📦 ปิดการสนทนา';
        statusClass = 'status-closed';
      } else if (c.status === 'waiting') {
        statusLabel = '🚨 รอแอดมิน';
        statusClass = 'status-waiting';
      } else if (c.mode === 'human') {
        statusLabel = '🧑 แอดมินดูแล';
        statusClass = 'status-human';
      }

      return `
        <div class="activity-item" style="cursor: pointer;" onclick="location.href='admin.html?convId=${c.id}'">
          <img class="activity-avatar" src="${avatar}" alt="${escapeHtml(c.customerName)}" />
          <div class="activity-details">
            <span class="activity-text">${escapeHtml(c.customerName)}</span>
            <span class="activity-snippet">${escapeHtml(c.lastMessage || 'ไม่มีข้อความใหม่')}</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span class="activity-time">${formatTime(c.lastMessageAt)}</span>
            <span class="activity-status ${statusClass}">${statusLabel}</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error fetching statistics:', error);
    document.getElementById('activityList').innerHTML = '<div style="text-align:center;padding:20px;color:red">ไม่สามารถเชื่อมต่อข้อมูลสถิติได้</div>';
  }
}

async function startApp() {
  // โหลดหน้าโครงสร้าง Sidebar & Header ก่อน
  await loadComponents();
  
  // โหลดข้อมูลสถิติมารายงานผล
  await fetchStats();
  
  // ตรวจจับข้อความเรียลไทม์ผ่าน SSE เพื่อคอยรีเฟรชสถิติโดยไม่ต้องโหลดหน้าซ้ำ
  const es = new EventSource(API + '/api/admin-stream');
  es.addEventListener('message', () => {
    fetchStats();
  });
  es.addEventListener('conversation', () => {
    fetchStats();
  });
  es.addEventListener('handoff', () => {
    fetchStats();
  });
}

window.addEventListener('DOMContentLoaded', startApp);
