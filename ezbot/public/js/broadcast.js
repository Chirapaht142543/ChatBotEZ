document.addEventListener('DOMContentLoaded', () => {
  const pathParts = window.location.pathname.split('/');
  const API = location.origin + (pathParts.length > 2 && pathParts[1] === 'ezbot' ? '/' + pathParts[1] : '');

  // Elements
  const btnNewBroadcast = document.getElementById('btnNewBroadcast');
  const btnCancel = document.getElementById('btnCancel');
  const formCompose = document.getElementById('formCompose');
  const viewHistory = document.getElementById('viewHistory');
  const viewCompose = document.getElementById('viewCompose');
  const inputMessage = document.getElementById('inputMessage');
  const mockupText = document.getElementById('mockupText');
  const mockupImage = document.getElementById('mockupImage');
  const mockupBubble = document.getElementById('mockupBubble');
  const imageUploadArea = document.getElementById('imageUploadArea');
  const imageInput = document.getElementById('imageInput');
  const uploadText = document.getElementById('uploadText');

  // Form Fields
  const inputCampaignName = document.getElementById('inputCampaignName');
  const selectAudience = document.getElementById('selectAudience');
  const selectSendTime = document.getElementById('selectSendTime');

  // Stats Card Elements
  const statSentCount = document.getElementById('statSentCount');
  const statAudienceCount = document.getElementById('statAudienceCount');
  const statScheduledCount = document.getElementById('statScheduledCount');

  // State
  let uploadedImageUrl = null;
  let conversations = [];

  // Toggle Views
  function showComposeView() {
    viewHistory.style.display = 'none';
    viewCompose.style.display = 'block';
    loadAudienceOptions();
  }

  function showHistoryView() {
    viewCompose.style.display = 'none';
    viewHistory.style.display = 'block';
    fetchBroadcasts();
  }

  if (btnNewBroadcast) btnNewBroadcast.addEventListener('click', showComposeView);
  if (btnCancel) {
    btnCancel.addEventListener('click', (e) => {
      e.preventDefault();
      resetComposeForm();
      showHistoryView();
    });
  }

  // Load actual audience counts into the select options
  async function loadAudienceOptions() {
    try {
      const res = await fetch(API + '/api/conversations');
      conversations = await res.json();
      
      const allCount = conversations.length;
      const activeCount = conversations.filter(c => c.status !== 'closed').length;
      const vipCount = conversations.filter(c => {
        const hasVipTag = c.tags && c.tags.some(t => t.toLowerCase() === 'vip');
        return c.starred || hasVipTag;
      }).length;

      // Update options text
      selectAudience.options[0].textContent = `ลูกค้าทั้งหมด (${allCount} คน)`;
      selectAudience.options[1].textContent = `ลูกค้าที่มีความเคลื่อนไหว (${activeCount} คน)`;
      selectAudience.options[2].textContent = `ลูกค้า VIP (${vipCount} คน)`;
    } catch (err) {
      console.error('Failed to load audience count:', err);
    }
  }

  // Live Message Text Preview
  if (inputMessage && mockupText) {
    inputMessage.addEventListener('input', (e) => {
      const text = e.target.value;
      if (text.trim() === '') {
        mockupText.textContent = 'พิมพ์ข้อความที่นี่...';
        mockupText.style.color = '#94a3b8';
      } else {
        mockupText.textContent = text;
        mockupText.style.color = '#111';
      }
    });
  }

  // Handle clicking image upload area
  if (imageUploadArea && imageInput) {
    imageUploadArea.addEventListener('click', () => {
      imageInput.click();
    });
  }

  // Handle image file selection & upload
  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Show temporary loading state
      if (uploadText) uploadText.textContent = 'กำลังอัปโหลด...';

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
            uploadedImageUrl = data.url;
            // Update preview upload area
            if (uploadText) uploadText.textContent = `อัปโหลดแล้ว: ${file.name}`;
            if (imageUploadArea) {
              imageUploadArea.style.borderColor = 'var(--online-green)';
              imageUploadArea.style.background = '#f0fdf4';
            }
            // Update mockup preview
            if (mockupImage) {
              mockupImage.src = API + data.url;
              mockupImage.style.display = 'block';
            }
          } else {
            alert('อัปโหลดรูปภาพล้มเหลว');
            resetUploadArea();
          }
        } catch (err) {
          console.error('Image upload error:', err);
          alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
          resetUploadArea();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function resetUploadArea() {
    uploadedImageUrl = null;
    if (uploadText) uploadText.textContent = 'คลิกหรือลากไฟล์ภาพมาที่นี่';
    if (imageUploadArea) {
      imageUploadArea.style.borderColor = 'var(--border-color)';
      imageUploadArea.style.background = '';
    }
    if (mockupImage) {
      mockupImage.src = '';
      mockupImage.style.display = 'none';
    }
  }

  function resetComposeForm() {
    if (formCompose) formCompose.reset();
    resetUploadArea();
    if (mockupText) {
      mockupText.textContent = 'พิมพ์ข้อความที่นี่...';
      mockupText.style.color = '#94a3b8';
    }
  }

  // Submit Broadcast Campaign
  if (formCompose) {
    formCompose.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const campaignName = inputCampaignName.value.trim();
      const audience = selectAudience.value;
      const text = inputMessage.value.trim();
      const sendTime = selectSendTime.value;

      if (!campaignName || !text) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
      }

      const payload = {
        campaignName,
        audience,
        text,
        mediaUrl: uploadedImageUrl,
        sendTime
      };

      try {
        const res = await fetch(API + '/api/broadcasts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast(sendTime === 'now' ? 'ส่งบรอดแคสต์สำเร็จเรียบร้อยแล้ว!' : 'ตั้งเวลาบรอดแคสต์เรียบร้อยแล้ว!');
          resetComposeForm();
          setTimeout(() => {
            showHistoryView();
          }, 1500);
        } else {
          const errData = await res.json();
          alert('เกิดข้อผิดพลาด: ' + (errData.error || 'ไม่สามารถส่งบรอดแคสต์ได้'));
        }
      } catch (err) {
        console.error('Failed to submit broadcast:', err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      }
    });
  }

  // Fetch Broadcasts and Render Table + Stats
  async function fetchBroadcasts() {
    try {
      // 1. Fetch campaigns
      const resBc = await fetch(API + '/api/broadcasts');
      const broadcasts = await resBc.json();

      // 2. Fetch conversations to calculate overall stats dynamically
      const resConv = await fetch(API + '/api/conversations');
      const conversations = await resConv.json();

      // Calculate Stats
      const totalSent = broadcasts.filter(b => b.status === 'sent').reduce((sum, b) => sum + (b.recipientsCount || 0), 0);
      const uniqueAudience = conversations.length;
      const totalScheduled = broadcasts.filter(b => b.status === 'scheduled').length;

      // Update Stats UI
      if (statSentCount) statSentCount.textContent = totalSent.toLocaleString();
      if (statAudienceCount) statAudienceCount.textContent = uniqueAudience.toLocaleString();
      if (statScheduledCount) statScheduledCount.textContent = totalScheduled.toLocaleString();

      // Update Sidebar counter badge if it exists
      const sidebarBadge = document.getElementById('sidebarBadge');
      if (sidebarBadge) {
        const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
        sidebarBadge.textContent = totalUnread;
      }

      // Render Table
      const listEl = document.getElementById('broadcastList');
      if (!listEl) return;

      if (broadcasts.length === 0) {
        listEl.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 30px;">
              ยังไม่มีแคมเปญบรอดแคสต์
            </td>
          </tr>
        `;
        return;
      }

      // Sort by createdAt descending
      broadcasts.sort((a, b) => b.createdAt - a.createdAt);

      listEl.innerHTML = broadcasts.map(b => {
        let statusBadge = '';
        if (b.status === 'sent') {
          statusBadge = '<span class="status-badge sent">ส่งแล้ว (Sent)</span>';
        } else if (b.status === 'scheduled') {
          statusBadge = '<span class="status-badge scheduled">รอส่ง (Scheduled)</span>';
        } else {
          statusBadge = '<span class="status-badge draft">แบบร่าง (Draft)</span>';
        }

        const dateStr = new Date(b.createdAt).toLocaleString('th-TH', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) + ' น.';

        let audienceText = '';
        if (b.audience === 'all') audienceText = 'ลูกค้าทั้งหมด';
        else if (b.audience === 'active') audienceText = 'ลูกค้าที่มีความเคลื่อนไหว';
        else if (b.audience === 'vip') audienceText = 'ลูกค้า VIP';

        const previewText = b.mediaUrl ? `📷 [รูปภาพ] ${b.text}` : b.text;

        return `
          <tr>
            <td>
              <span class="campaign-name">${escapeHtml(b.campaignName)}</span>
              <div class="campaign-preview" title="${escapeHtml(previewText)}">${escapeHtml(previewText)}</div>
            </td>
            <td>${audienceText} (${b.recipientsCount || 0} คน)</td>
            <td>${dateStr}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Failed to load broadcasts list:', err);
    }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // Toast Notification
  function showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // Load components and fetch data on startup
  async function startApp() {
    await loadComponents();
    await fetchBroadcasts();
  }

  startApp();
});
