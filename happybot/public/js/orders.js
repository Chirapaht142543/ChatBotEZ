// orders.js — ตรรกะจัดการและควบคุมหน้าคำสั่งซื้อ

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
let allOrders = [];     // เก็บรายการคำสั่งซื้อทั้งหมดที่ดึงมา
let activeFilter = 'all'; // 'all' | 'instock' | 'preorder'

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ล้างรูปแบบราคาดึงมาเป็นตัวเลขเพื่อคำนวณผลรวม
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  return Number(priceStr.replace(/[^0-9]/g, ''));
}

function formatRevenue(value) {
  return '฿' + value.toLocaleString('th-TH');
}

async function fetchAndRenderOrders() {
  try {
    const response = await fetch(API + '/api/conversations');
    const conversations = await response.json();
    
    // รวบรวมออร์เดอร์ของลูกค้าทุกคนมาเป็น Array เดียวกัน
    allOrders = [];
    conversations.forEach(c => {
      if (c.orders && Array.isArray(c.orders)) {
        c.orders.forEach(o => {
          allOrders.push({
            ...o,
            customerName: c.customerName,
            customerAvatar: c.avatarUrl,
            conversationId: c.id
          });
        });
      }
    });

    // อัปเดตตัวเลขแจ้งเตือนใน Sidebar (เหมือนกับหน้าอื่น)
    const sidebarBadge = document.getElementById('sidebarBadge');
    if (sidebarBadge) {
      const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
      sidebarBadge.textContent = totalUnread;
    }

    calculateMetrics();
    renderOrdersTable();

  } catch (error) {
    console.error('Error fetching orders:', error);
    document.getElementById('ordersBody').innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: red; padding: 30px;">
          เกิดข้อผิดพลาดในการโหลดข้อมูลคำสั่งซื้อ
        </td>
      </tr>
    `;
  }
}

// คำนวณค่าแดชบอร์ดสถิติด้านบน
function calculateMetrics() {
  const total = allOrders.length;
  const instock = allOrders.filter(o => o.type === 'instock').length;
  const preorder = allOrders.filter(o => o.type === 'preorder').length;
  
  const totalRevenue = allOrders.reduce((sum, o) => sum + parsePrice(o.price), 0);

  document.getElementById('orderTotal').textContent = total;
  document.getElementById('orderInstock').textContent = instock;
  document.getElementById('orderPreorder').textContent = preorder;
  document.getElementById('orderRevenue').textContent = formatRevenue(totalRevenue);
}

// เรนเดอร์ตารางสั่งซื้อพร้อมตัวกรองและการค้นหา
function renderOrdersTable() {
  const query = document.getElementById('orderSearch').value.toLowerCase().trim();
  
  // 1. กรองตามประเภท (Tabs)
  let filtered = allOrders;
  if (activeFilter === 'instock') {
    filtered = allOrders.filter(o => o.type === 'instock');
  } else if (activeFilter === 'preorder') {
    filtered = allOrders.filter(o => o.type === 'preorder');
  }

  // 2. กรองตามกล่องค้นหา (Search)
  if (query) {
    filtered = filtered.filter(o => 
      o.id.toLowerCase().includes(query) ||
      o.customerName.toLowerCase().includes(query) ||
      (o.productName || '').toLowerCase().includes(query)
    );
  }

  const tbody = document.getElementById('ordersBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
          ไม่พบรายการคำสั่งซื้อที่ค้นหา
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const avatar = o.customerAvatar || `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(o.customerName)}&background=dfe6f5&color=1e293b`;
    
    // กำหนดป้ายแสดงประเภทออร์เดอร์
    const typeLabel = o.type === 'preorder' ? 'พรีออเดอร์' : 'เข้าทันที';
    const typeClass = o.type === 'preorder' ? 'preorder' : 'instock';

    // กำหนดป้ายสถานะจัดส่ง
    let statusLabel = o.status;
    let statusClass = 'waiting';
    if (o.status === 'จัดส่งแล้ว') {
      statusClass = 'shipped';
    } else if (o.status === 'ชำระเงินแล้ว') {
      statusClass = 'paid';
    } else if (o.status === 'ยกเลิก') {
      statusClass = 'cancelled';
    }

    return `
      <tr>
        <td style="font-weight: 600; color: var(--brand-blue);">${escapeHtml(o.id)}</td>
        <td>
          <div class="customer-cell">
            <img class="customer-avatar" src="${avatar}" alt="${escapeHtml(o.customerName)}" />
            <span class="customer-name">${escapeHtml(o.customerName)}</span>
          </div>
        </td>
        <td>${escapeHtml(o.productName || 'กระเป๋าเป้สะพายหลัง (Mockup)')}</td>
        <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
        <td style="font-weight: 700; color: var(--text-primary);">${escapeHtml(o.price)}</td>
        <td style="color: var(--text-secondary);">${escapeHtml(o.date)}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
        <td>
          <button class="btn-action" onclick="location.href='admin.html?convId=${o.conversationId}'">ดูแชท</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function startApp() {
  await loadComponents();
  await fetchAndRenderOrders();

  // ตั้งค่าตัวเลือกแท็บสลับข้อมูล (Tabs event listeners)
  document.querySelectorAll('.order-tab').forEach(btn => {
    btn.onclick = (e) => {
      document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
      const activeBtn = e.currentTarget;
      activeBtn.classList.add('active');
      activeFilter = activeBtn.dataset.filter;
      renderOrdersTable();
    };
  });

  // ตั้งค่าป้อนกล่องค้นหา (Search event listener)
  document.getElementById('orderSearch').addEventListener('input', () => {
    renderOrdersTable();
  });

  // ดึงข้อมูลผ่าน SSE อัตโนมัติเมื่อเกิดการเปลี่ยนแปลง
  const es = new EventSource(API + '/api/admin-stream');
  const updateEvent = () => fetchAndRenderOrders();
  es.addEventListener('message', updateEvent);
  es.addEventListener('conversation', updateEvent);
  es.addEventListener('handoff', updateEvent);
}

window.addEventListener('DOMContentLoaded', startApp);
