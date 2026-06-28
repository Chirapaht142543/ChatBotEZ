// shared.js — ควบคุมฟังก์ชันแถบเมนูข้าง (Sidebar) และแถบหัวข้อ (Top Header) ของทุกหน้าจอในระบบ

(function() {
  const API = ''; 
  const convs = {}; 
  let activePopover = null;

  let loadPromise = null;

  // 1. Loader สำหรับ HTML components
  function loadComponents() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
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
      setupSidebarCollapse();
      initHeaderInteractivity();
    })();
    return loadPromise;
  }

  // 2. ไฮไลท์เมนูที่กำลังรับชมอยู่
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

  // 3. จัดการการย่อ/ขยายของเมนูข้างพร้อมบันทึกสถานะ
  function setupSidebarCollapse() {
    const toggleBtn = document.querySelector('.menu-toggle-btn');
    const sidebar = document.querySelector('.sidebar');
    if (toggleBtn && sidebar) {
      const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      if (isCollapsed) {
        sidebar.classList.add('collapsed');
      }
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
      };
    }
  }

  // 4. ผูกฟังก์ชันการเปลี่ยนสถานะแอดมิน และการแจ้งเตือน
  async function initHeaderInteractivity() {
    // ดึงประวัติรายการสนทนาทั้งหมดเพื่อตรวจสอบแจ้งเตือนโอนสาย
    try {
      const res = await fetch(API + '/api/conversations');
      if (res.ok) {
        const list = await res.json();
        list.forEach(c => convs[c.id] = c);
      }
    } catch (err) {
      console.error('Failed to pre-fetch conversations for notification badge:', err);
    }

    // ปุ่มเปลี่ยนสถานะแอดมิน
    const statusDropdown = document.querySelector('.agent-status-dropdown');
    if (statusDropdown) {
      statusDropdown.onclick = (e) => {
        e.stopPropagation();
        toggleStatusPicker(statusDropdown);
      };
    }

    // ปุ่มกระดิ่งแจ้งเตือน
    const bell = document.querySelector('.notification-bell');
    if (bell) {
      bell.onclick = (e) => {
        e.stopPropagation();
        toggleNotificationBell(bell);
      };
    }

    // โหลดค่าสถานะแอดมินล่าสุดที่ตั้งไว้
    const savedStatus = localStorage.getItem('agentStatus');
    if (savedStatus) {
      try {
        const { label, color } = JSON.parse(savedStatus);
        changeAgentStatus(label, color);
      } catch (e) {}
    }

    // อัปเดตตัวเลขแจ้งเตือนในกระดิ่ง
    updateNotificationBadge();
  }

  // 5. เมนูเลือกสถานะแอดมิน
  function toggleStatusPicker(btn) {
    if (activePopover && activePopover.dataset.type === 'status') {
      closePopover();
      return;
    }
    closePopover();

    const popover = document.createElement('div');
    popover.className = 'custom-popover status-popover';
    popover.dataset.type = 'status';

    const statuses = [
      { label: 'พร้อมตอบ', color: '#10b981' },
      { label: 'พักเบรก', color: '#f59e0b' },
      { label: 'ออฟไลน์', color: '#64748b' }
    ];

    popover.innerHTML = statuses.map(s => `
      <div class="popover-status-item" id="status-opt-${s.label}">
        <span class="status-dot-indicator" style="background-color: ${s.color};"></span>
        <span>${s.label}</span>
      </div>
    `).join('');

    document.body.appendChild(popover);
    
    // Bind click events manually to avoid inline onclick context issues inside IIFE
    statuses.forEach(s => {
      const opt = popover.querySelector(`#status-opt-${s.label}`);
      if (opt) {
        opt.onclick = () => changeAgentStatus(s.label, s.color);
      }
    });

    positionPopoverHeader(btn, popover);
    activePopover = popover;
  }

  function changeAgentStatus(label, color) {
    const textEl = document.querySelector('.agent-status-dropdown span:not(.agent-status-dot):not(.agent-status-arrow)');
    const dotEl = document.querySelector('.agent-status-dropdown .agent-status-dot');
    if (textEl) textEl.textContent = label;
    if (dotEl) dotEl.style.backgroundColor = color;
    localStorage.setItem('agentStatus', JSON.stringify({ label, color }));
    closePopover();
  }

  // 6. อัปเดตไอคอนกระดิ่งแจ้งเตือนแชทรอแอดมินตอบ
  function updateNotificationBadge() {
    const waitingConvs = Object.values(convs).filter(c => c.status === 'waiting');
    const badge = document.querySelector('.notification-bell .notification-badge');
    if (badge) {
      if (waitingConvs.length === 0) {
        badge.style.display = 'none';
      } else {
        badge.style.display = 'block';
        badge.textContent = waitingConvs.length;
      }
    }
  }

  // 7. เมนูแจ้งเตือนห้องแชทโอนสาย
  function toggleNotificationBell(btn) {
    if (activePopover && activePopover.dataset.type === 'notifications') {
      closePopover();
      return;
    }
    closePopover();

    const popover = document.createElement('div');
    popover.className = 'custom-popover notification-popover';
    popover.dataset.type = 'notifications';

    const waitingConvs = Object.values(convs).filter(c => c.status === 'waiting');
    
    if (waitingConvs.length === 0) {
      popover.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;text-align:center;">ไม่มีการแจ้งเตือนแชทใหม่</div>';
    } else {
      popover.innerHTML = waitingConvs.map(c => `
        <div class="popover-notification-item" id="notif-item-${c.id}" style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; cursor: pointer;">
          <strong style="color: #ef4444; font-size:12.5px;">⚠️ แชทโอนสาย (Handoff)</strong>
          <p style="margin: 4px 0 0 0; font-size: 11.5px; color:#475569;">คุณ <strong>${escapeHtml(c.customerName)}</strong> กำลังรอคุณตอบกลับ</p>
        </div>
      `).join('');

      waitingConvs.forEach(c => {
        const item = popover.querySelector(`#notif-item-${c.id}`);
        if (item) {
          item.onclick = () => selectNotification(c.id);
        }
      });
    }

    updateNotificationBadge();
    document.body.appendChild(popover);
    positionPopoverHeader(btn, popover);
    activePopover = popover;
  }

  function selectNotification(id) {
    closePopover();
    const path = window.location.pathname;
    const isChatPage = path.endsWith('admin.html') || path === '/' || path.endsWith('/');
    if (isChatPage && typeof window.openConv === 'function') {
      window.openConv(id);
    } else {
      window.location.href = `admin.html?convId=${id}`;
    }
  }

  // 8. จัดวางตำแหน่งกล่อง Popover ให้พอดี
  function positionPopoverHeader(btn, popover) {
    const rect = btn.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = `${rect.bottom + 8}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;
    popover.style.zIndex = '9999';
  }

  function closePopover() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  // ปิด popover เมื่อคลิกนอกกล่อง
  window.addEventListener('click', (e) => {
    if (activePopover && !activePopover.contains(e.target) && !e.target.closest('.agent-status-dropdown') && !e.target.closest('.notification-bell')) {
      closePopover();
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose functions globally
  window.loadComponents = loadComponents;
  window.highlightSidebar = highlightSidebar;
  window.setupSidebarCollapse = setupSidebarCollapse;
  window.initHeaderInteractivity = initHeaderInteractivity;

  // Run automatically when DOM is ready to support pages that do not manually invoke it
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => loadComponents());
  } else {
    loadComponents();
  }
})();
