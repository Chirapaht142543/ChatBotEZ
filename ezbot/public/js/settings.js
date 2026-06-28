// settings.js — ควบคุมฟังก์ชันทั้งหมดบนหน้าจอตั้งค่าของ EZ BOT

const API = location.origin;


// ข้อมูลทีมแอดมินสำหรับจำลองการทำงานดึงจาก API
let teamMembers = [];

// อัปเดตตัวเลขแจ้งเตือนแชทค้างใน Sidebar (ใช้เพื่อความสมบูรณ์แบบ)
async function updateSidebarBadgeCount() {
  try {
    const res = await fetch(API + '/api/conversations');
    if (res.ok) {
      const list = await res.json();
      const unreadCount = list.reduce((sum, c) => sum + (c.unread || 0), 0);
      const badge = document.getElementById('sidebarBadge');
      if (badge) {
        badge.textContent = unreadCount;
      }
    }
  } catch (err) {
    console.error('Error fetching unread badge:', err);
  }
}

// จัดการสลับแท็บเมนูตั้งค่า
function initTabNavigation() {
  const navItems = document.querySelectorAll('.settings-nav-item');
  const panels = document.querySelectorAll('.settings-panel');

  navItems.forEach(item => {
    item.onclick = () => {
      // เอาคลาส Active ออกจากปุ่มเดิม
      navItems.forEach(nav => nav.classList.remove('active'));
      // ใส่คลาส Active ให้ปุ่มที่คลิก
      item.classList.add('active');

      // ซ่อนแผงตั้งค่าเดิมทั้งหมด
      panels.forEach(p => p.classList.remove('active'));
      
      // แสดงแผงตั้งค่าที่สัมพันธ์กับ data-tab
      const targetTab = item.dataset.tab;
      const targetPanel = document.getElementById(`${targetTab}Panel`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    };
  });
}

// ดึงข้อมูลการตั้งค่าจากเซิร์ฟเวอร์
async function fetchSettings() {
  try {
    const res = await fetch(API + '/api/bot/settings');
    if (res.ok) {
      const settings = await res.json();
      
      // การตั้งค่าทั่วไป (ร้านค้า)
      document.getElementById('shopName').value = settings.shopName || '';
      document.getElementById('shopPhone').value = settings.shopPhone || '';
      document.getElementById('shopEmail').value = settings.shopEmail || '';
      document.getElementById('shopCurrency').value = settings.shopCurrency || 'THB';
      document.getElementById('welcomeMessage').value = settings.welcomeMessage || '';

      // การตั้งค่า AI
      document.getElementById('aiEnabled').checked = !!settings.aiEnabled;
      document.getElementById('geminiApiKey').value = settings.geminiApiKey || '';
      document.getElementById('aiModel').value = settings.aiModel || 'gemini-2.5-flash';
      document.getElementById('aiTemperature').value = settings.aiTemperature !== undefined ? settings.aiTemperature : 0.4;
      document.getElementById('tempVal').textContent = document.getElementById('aiTemperature').value;


      // บันทึกการเชื่อมต่อ LINE
      document.getElementById('lineChannelToken').value = settings.lineChannelToken || '';
      document.getElementById('lineChannelSecret').value = settings.lineChannelSecret || '';

      // การตั้งค่าเว็บไซต์
      document.getElementById('websiteUrl').value = settings.websiteUrl || '';
      document.getElementById('allowedDomains').value = settings.allowedDomains || '';
      document.getElementById('widgetPosition').value = settings.widgetPosition || 'bottom-right';
      document.getElementById('widgetColor').value = settings.widgetColor || '#2563eb';
      document.getElementById('widgetColorText').value = settings.widgetColor || '#2563eb';
      document.getElementById('widgetAutoOpen').value = settings.widgetAutoOpen || 0;
      document.getElementById('widgetGreeting').value = settings.widgetGreeting || '';
      updateWidgetPreview();
      updateEmbedCode();

      // การแจ้งเตือน
      document.getElementById('notifySound').checked = settings.notifySound !== false;
      document.getElementById('notifyDesktop').checked = !!settings.notifyDesktop;
      document.getElementById('notifyEmail').checked = !!settings.notifyEmail;

      // ปรับปรุงกล่องสถานะคีย์ API
      updateKeyStatusBox(settings.hasGeminiKey || !!settings.geminiApiKey);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// อัปเดตกล่องแสดงผลสถานะ API Key
function updateKeyStatusBox(hasKey) {
  const box = document.getElementById('keyStatusBox');
  const title = document.getElementById('keyStatusTitle');
  const desc = document.getElementById('keyStatusDesc');
  
  if (hasKey) {
    box.className = 'status-box success';
    box.querySelector('.status-icon').textContent = '⚡';
    title.textContent = 'เชื่อมต่อ Gemini AI Key พร้อมใช้งานเรียบร้อย';
    desc.textContent = 'พบบัญชี API Key บนเซิร์ฟเวอร์เรียบร้อยแล้ว บอทของคุณพร้อมใช้พลังของ AI ในการวิเคราะห์ตอบคำถามระดับแอดมินอัจฉริยะ';
  } else {
    box.className = 'status-box warning';
    box.querySelector('.status-icon').textContent = '⚠️';
    title.textContent = 'ยังไม่พบ Gemini API Key ในระบบ';
    desc.textContent = 'บอทจะทำงานโดยการตอบข้อมูลตามกฎข้อความ (Keywords) ด้านซ้ายแทน กรุณากรอกคีย์ด้านล่างเพื่อปลดล็อกฟีเจอร์ AI ตอบแชท';
  }
}



// จัดการการแสดงผลของ API Key (แสดง/ซ่อนคีย์)
function initApiKeyToggle() {
  const toggleBtn = document.getElementById('toggleKeyVisibility');
  const keyInput = document.getElementById('geminiApiKey');

  toggleBtn.onclick = () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      toggleBtn.textContent = '🙈';
    } else {
      keyInput.type = 'password';
      toggleBtn.textContent = '👁️';
    }
  };
}

// จัดการคัดลอกลิงก์ Webhook
function initWebhookCopy() {
  const copyBtn = document.getElementById('btnCopyWebhook');
  const webhookInput = document.getElementById('lineWebhookUrl');

  // ตั้งค่า URL แนะนำตามโดเมนปัจจุบัน
  webhookInput.value = `${window.location.origin}/webhook/line`;

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(webhookInput.value);
      copyBtn.textContent = 'คัดลอกแล้ว!';
      copyBtn.classList.add('btn-primary');
      setTimeout(() => {
        copyBtn.textContent = 'คัดลอกลิงก์';
        copyBtn.classList.remove('btn-primary');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy webhook URL:', err);
    }
  };
}

// ปรับค่า Temperature แสดงผลสด
function initTemperatureSlider() {
  const slider = document.getElementById('aiTemperature');
  const valDisplay = document.getElementById('tempVal');
  slider.oninput = () => {
    valDisplay.textContent = slider.value;
  };
}

// เรนเดอร์การ์ดทีมงานจำลอง
function renderTeamMembers() {
  const listEl = document.getElementById('teamList');
  listEl.innerHTML = teamMembers.map(member => `
    <div class="team-card" data-id="${member.id}">
      <div class="team-avatar-wrapper">
        <img class="team-avatar" src="${member.avatar}" alt="${escapeHtml(member.name)}" />
        <span class="team-status-dot ${member.online ? 'online' : 'offline'}"></span>
      </div>
      <div class="team-info">
        <div class="team-name">${escapeHtml(member.name)}</div>
        <div class="team-email">${escapeHtml(member.email)}</div>
        ${member.role === 'Owner' ? `
          <span class="team-badge owner">เจ้าของร้าน</span>
        ` : `
          <select class="form-select team-role-select" data-id="${member.id}" style="width: auto; padding: 2px 8px; font-size: 12px; height: 28px; margin-top: 4px;">
            <option value="Agent" ${member.role === 'Agent' ? 'selected' : ''}>แอดมิน</option>
            <option value="Manager" ${member.role === 'Manager' ? 'selected' : ''}>ผู้จัดการ</option>
            <option value="Owner" ${member.role === 'Owner' ? 'selected' : ''}>เจ้าของร้าน</option>
          </select>
        `}
      </div>
      ${member.role !== 'Owner' ? `
        <button type="button" class="btn-remove-member" title="ลบสมาชิก" data-id="${member.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      ` : ''}
    </div>
  `).join('');

  // มอบหมายฟังก์ชันเปลี่ยนบทบาทสมาชิก
  listEl.querySelectorAll('.team-role-select').forEach(select => {
    select.onchange = (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const newRole = e.currentTarget.value;
      const originalList = [...teamMembers];
      
      // อัปเดตข้อมูลในอาร์เรย์
      teamMembers = teamMembers.map(m => {
        if (m.id === id) {
          return { ...m, role: newRole };
        }
        return m;
      });
      
      // บันทึกไปฝั่งเซิร์ฟเวอร์
      fetch(API + '/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ users: teamMembers })
      }).then(res => {
        if (res.ok) {
          renderTeamMembers();
          showToast('เปลี่ยนบทบาทสำเร็จ!', 'อัปเดตสิทธิ์การใช้งานของสมาชิกทีมเรียบร้อย');
        } else {
          teamMembers = originalList;
          renderTeamMembers();
          alert('เกิดข้อผิดพลาดในการเปลี่ยนบทบาทบนเซิร์ฟเวอร์');
        }
      }).catch(err => {
        teamMembers = originalList;
        renderTeamMembers();
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อเปลี่ยนบทบาท');
      });
    };
  });

  // มอบหมายฟังก์ชันลบสมาชิก
  listEl.querySelectorAll('.btn-remove-member').forEach(btn => {
    btn.onclick = (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสมาชิกทีมรายนี้ออกจากระบบ?')) {
        const originalList = [...teamMembers];
        teamMembers = teamMembers.filter(m => m.id !== id);
        renderTeamMembers();
        
        fetch(API + '/api/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ users: teamMembers })
        }).then(res => {
          if (res.ok) {
            showToast('ลบสมาชิกสำเร็จ!', 'ลบสมาชิกแอดมินออกจากทีมสำเร็จเรียบร้อย');
          } else {
            teamMembers = originalList;
            renderTeamMembers();
            alert('เกิดข้อผิดพลาดในการลบสมาชิกจากเซิร์ฟเวอร์');
          }
        }).catch(err => {
          teamMembers = originalList;
          renderTeamMembers();
          alert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อลบสมาชิก');
        });
      }
    };
  });
}

// เชิญสมาชิกใหม่เข้าร่วมทีม
function initInviteMember() {
  const btn = document.getElementById('btnInviteMember');
  btn.onclick = () => {
    const emailInput = document.getElementById('newMemberEmail');
    const passwordInput = document.getElementById('newMemberPassword');
    const roleSelect = document.getElementById('newMemberRole');
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email) {
      alert('กรุณากรอกอีเมลของทีมงานที่ต้องการเชิญ');
      return;
    }
    if (!password) {
      alert('กรุณากำหนดรหัสผ่านสำหรับสมาชิกใหม่');
      return;
    }

    // สร้างข้อมูลสมาชิกใหม่เพื่อเพิ่มเข้าไป
    const name = email.split('@')[0];
    const newMember = {
      id: Date.now(),
      name: `คุณ${name} (รอตอบรับ)`,
      email: email,
      role: roleSelect.value,
      online: false,
      password: password,
      avatar: `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f1f5f9&color=1e293b`
    };

    const originalList = [...teamMembers];
    teamMembers.push(newMember);
    renderTeamMembers();

    fetch(API + '/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ users: teamMembers })
    }).then(res => {
      if (res.ok) {
        emailInput.value = '';
        passwordInput.value = '';
        showToast('ส่งคำเชิญแล้ว!', `ส่งรายละเอียดการรับสิทธิ์ไปที่ ${email} สำเร็จ`);
      } else {
        teamMembers = originalList;
        renderTeamMembers();
        alert('ไม่สามารถเพิ่มสมาชิกทีมไปยังเซิร์ฟเวอร์ได้');
      }
    }).catch(err => {
      teamMembers = originalList;
      renderTeamMembers();
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์เพื่อเพิ่มสมาชิก');
    });
  };
}

// บันทึกฟอร์มตั้งค่า
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const saveBtn = document.getElementById('btnSaveAllSettings');
  const statusMsg = document.getElementById('saveStatusMsg');
  
  // ปิดปุ่มชั่วคราวเพื่อกันการกดซ้ำ
  saveBtn.disabled = true;
  statusMsg.textContent = 'กำลังบันทึกข้อมูล...';
  statusMsg.classList.add('active');

  const payload = {
    // ข้อมูลทั่วไป
    shopName: document.getElementById('shopName').value.trim(),
    shopPhone: document.getElementById('shopPhone').value.trim(),
    shopEmail: document.getElementById('shopEmail').value.trim(),
    shopCurrency: document.getElementById('shopCurrency').value,
    welcomeMessage: document.getElementById('welcomeMessage').value.trim(),

    // AI
    aiEnabled: document.getElementById('aiEnabled').checked,
    geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
    aiModel: document.getElementById('aiModel').value,
    aiTemperature: parseFloat(document.getElementById('aiTemperature').value),


    // LINE Connection
    lineChannelToken: document.getElementById('lineChannelToken').value.trim(),
    lineChannelSecret: document.getElementById('lineChannelSecret').value.trim(),

    // Website Connection
    websiteUrl: document.getElementById('websiteUrl').value.trim(),
    allowedDomains: document.getElementById('allowedDomains').value.trim(),
    widgetPosition: document.getElementById('widgetPosition').value,
    widgetColor: document.getElementById('widgetColor').value,
    widgetAutoOpen: parseInt(document.getElementById('widgetAutoOpen').value) || 0,
    widgetGreeting: document.getElementById('widgetGreeting').value.trim(),

    // Notifications
    notifySound: document.getElementById('notifySound').checked,
    notifyDesktop: document.getElementById('notifyDesktop').checked,
    notifyEmail: document.getElementById('notifyEmail').checked,
  };

  try {
    const res = await fetch(API + '/api/bot/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      showToast('บันทึกสำเร็จ!', 'การตั้งค่าระบบถูกจัดเก็บเรียบร้อยแล้ว');
      statusMsg.textContent = '✓ บันทึกสำเร็จ';
      
      // อัปเดตกล่องความพร้อมของ API Key อีกรอบ
      updateKeyStatusBox(data.settings.hasGeminiKey || !!payload.geminiApiKey);
    } else {
      throw new Error('Server returned non-OK status');
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
    statusMsg.textContent = '❌ เกิดข้อผิดพลาดในการบันทึก';
    alert('ไม่สามารถบันทึกข้อมูลการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง');
  } finally {
    saveBtn.disabled = false;
    setTimeout(() => {
      statusMsg.classList.remove('active');
    }, 3000);
  }
}

// แสดง Toast Notification สำเร็จ
function showToast(titleText, descText) {
  const toast = document.getElementById('settingsToast');
  toast.querySelector('strong').textContent = titleText;
  toast.querySelector('p').textContent = descText;
  
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// ล้างอักษร HTML เพื่อความปลอดภัย
function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---- Website Connection Functions ----

// คัดลอก Embed Code
function initEmbedCopy() {
  const btn = document.getElementById('btnCopyEmbed');
  btn.onclick = async () => {
    const code = document.getElementById('embedCodeBlock').textContent;
    try {
      await navigator.clipboard.writeText(code);
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><polyline points="20 6 9 17 4 12"/></svg> คัดลอกแล้ว!`;
      setTimeout(() => {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> คัดลอกโค้ด`;
      }, 2500);
    } catch (err) {
      console.error('Failed to copy embed code:', err);
    }
  };
}

// Sync Color Picker กับ Text Input
function initColorPicker() {
  const colorInput = document.getElementById('widgetColor');
  const textInput = document.getElementById('widgetColorText');

  colorInput.oninput = () => {
    textInput.value = colorInput.value;
    updateWidgetPreview();
    updateEmbedCode();
  };

  textInput.oninput = () => {
    const val = textInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      colorInput.value = val;
      updateWidgetPreview();
      updateEmbedCode();
    }
  };
}

// อัปเดต Widget Preview แบบเรียลไทม์
function updateWidgetPreview() {
  const color = document.getElementById('widgetColor').value;
  const greeting = document.getElementById('widgetGreeting').value || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ? 💬';
  const position = document.getElementById('widgetPosition').value;
  const previewBtn = document.getElementById('widgetPreviewBtn');
  const previewBubble = document.getElementById('widgetPreviewBubble');
  const previewBox = document.getElementById('widgetPreviewBox');

  previewBtn.style.backgroundColor = color;
  previewBtn.style.boxShadow = `0 6px 20px ${color}59`;
  previewBubble.textContent = greeting;

  if (position === 'bottom-left') {
    previewBox.style.justifyContent = 'flex-start';
    previewBubble.style.right = 'auto';
    previewBubble.style.left = '20px';
    previewBubble.style.setProperty('--arrow-right', 'auto');
    previewBubble.style.setProperty('--arrow-left', '24px');
  } else {
    previewBox.style.justifyContent = 'flex-end';
    previewBubble.style.left = 'auto';
    previewBubble.style.right = '20px';
  }
}

// อัปเดต Embed Code ตามค่าที่ตั้ง
function updateEmbedCode() {
  const color = document.getElementById('widgetColor').value;
  const position = document.getElementById('widgetPosition').value;
  const greeting = document.getElementById('widgetGreeting').value || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ? 💬';
  const autoOpen = document.getElementById('widgetAutoOpen').value || '0';
  const origin = window.location.origin;

  let attrs = `src="${origin}/widget.js" data-color="${color}" data-position="${position}"`;
  if (greeting) attrs += ` data-greeting="${greeting}"`;
  if (autoOpen && autoOpen !== '0') attrs += ` data-auto-open="${autoOpen}"`;

  const code = `<!-- EZ BOT Chat Widget -->\n<script ${attrs}><\/script>`;

  const block = document.getElementById('embedCodeBlock');
  block.textContent = code;
}

// ผูก event สำหรับ widget settings fields
function initWidgetSettings() {
  const fields = ['widgetPosition', 'widgetGreeting'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        updateWidgetPreview();
        updateEmbedCode();
      });
    }
  });
}

// เริ่มต้นแอปพลิเคชัน
async function startApp() {
  await loadComponents();
  
  // Fetch users from API
  try {
    const res = await fetch('/api/users');
    if (res.ok) teamMembers = await res.json();
  } catch (err) {
    console.error('Failed to load users', err);
  }
  
  // ตั้งค่า Events
  initTabNavigation();

  initApiKeyToggle();
  initWebhookCopy();
  initTemperatureSlider();
  initEmbedCopy();
  initColorPicker();
  initWidgetSettings();
  renderTeamMembers();
  initInviteMember();

  // ดึงข้อมูลและฟิลด์ฟอร์มเริ่มต้น
  await fetchSettings();

  // ผูกฟังก์ชันส่งฟอร์มหลัก
  document.getElementById('settingsForm').onsubmit = handleFormSubmit;
}

window.addEventListener('DOMContentLoaded', startApp);
