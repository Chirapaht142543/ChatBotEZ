// auth.js - ควบคุมการตรวจสอบสิทธิ์การใช้งาน (Roles) ของทุกหน้า

(function checkAuth() {
  const currentPath = window.location.pathname;
  // ยกเว้นหน้า login และหน้าของลูกค้า (widget)
  if (currentPath.includes('login.html') || currentPath.includes('widget.html') || currentPath.includes('test-embed.html')) {
    return;
  }

  const userJson = localStorage.getItem('currentUser');
  if (!userJson) {
    window.location.href = 'login.html';
    return;
  }
})();

function applyRolePermissions() {
  const userJson = localStorage.getItem('currentUser');
  if (!userJson) return;
  const user = JSON.parse(userJson);

  // Update Header UI
  const nameEl = document.querySelector('.admin-name');
  const roleEl = document.querySelector('.admin-role');
  const avatarEl = document.querySelector('.admin-avatar');
  
  if (nameEl) nameEl.textContent = user.name.split(' ')[0];
  if (avatarEl) avatarEl.src = user.avatar;
  
  if (roleEl) {
    if (user.role === 'Owner') roleEl.textContent = 'เจ้าของร้าน';
    else if (user.role === 'Manager') roleEl.textContent = 'ผู้จัดการ';
    else roleEl.textContent = 'แอดมิน';
  }

  // Hide restricted menus for Agent
  if (user.role === 'Agent') {
    const settingsLink = document.querySelector('.sidebar-menu a[href="settings.html"]');
    if (settingsLink) settingsLink.parentElement.style.display = 'none';
    
    const broadcastLink = document.querySelector('.sidebar-menu a[href="broadcast.html"]');
    if (broadcastLink) broadcastLink.parentElement.style.display = 'none';

    // If current page is restricted, redirect to admin.html
    const currentPath = window.location.pathname;
    if (currentPath.endsWith('settings.html') || currentPath.endsWith('broadcast.html')) {
      window.location.href = '/admin.html';
    }
  }
}

// ตรวจสอบหลังจาก components โหลดเสร็จ เพื่อให้แน่ใจว่า sidebar และ header มีอยู่ใน DOM
window.addEventListener('DOMContentLoaded', () => {
  // รอดักจับ loadComponents() ถ้าหน้าไหนใช้ function นี้ (เพราะใช้เวลาโหลด HTML component)
  // หรือใช้วิธีดักจับแบบง่าย ๆ คือหน่วงเวลาเล็กน้อย หรือพยายามดึง element เรื่อย ๆ
  
  // เนื่องจากในโครงสร้างโปรเจ็กต์นี้ เราเรียก loadComponents() แล้วถึงจะได้ DOM
  // เราจึงสร้างตัวตรวจสอบ DOM เป็นระยะ
  let checkInterval = setInterval(() => {
    const sidebar = document.querySelector('.sidebar-menu');
    if (sidebar) {
      clearInterval(checkInterval);
      applyRolePermissions();
    }
  }, 100);

  // เลิกเช็คถ้าเกิน 3 วิ (แปลว่าหน้าไม่มี sidebar)
  setTimeout(() => clearInterval(checkInterval), 3000);
});
