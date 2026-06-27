document.addEventListener('DOMContentLoaded', () => {
  // Constants
  const STORAGE_KEY = 'happybot_quick_templates';
  const defaultTemplates = [
    { id: '1', title: 'กล่าวทักทาย', text: 'สวัสดีค่ะ ยินดีให้บริการค่ะ มีข้อสงสัยสอบถามได้เลยนะคะ 😊' },
    { id: '2', title: 'แจ้งราคาและโปรโมชั่น', text: 'รุ่นนี้ราคา 790 บาทค่ะ ตอนนี้มีโปรส่งฟรีอยู่นะคะ สนใจรับเลยไหมคะ ✨' },
    { id: '3', title: 'รายละเอียดการจัดส่ง', text: 'จัดส่งด้วย Kerry/Flash ค่ะ ส่งของทุกวันจันทร์-เสาร์ ได้รับใน 1-3 วันค่ะ 📦' },
    { id: '4', title: 'ขอบคุณลูกค้า', text: 'ขอบคุณมากนะคะที่ไว้วางใจใช้บริการของทางร้านค่ะ 🙏' }
  ];

  // State
  let templates = [];
  let currentEditId = null;

  // DOM Elements
  const templatesGrid = document.getElementById('templatesGrid');
  const searchInput = document.getElementById('searchInput');
  const btnAddTemplate = document.getElementById('btnAddTemplate');
  const templateModal = document.getElementById('templateModal');
  const modalClose = document.getElementById('modalClose');
  const templateForm = document.getElementById('templateForm');
  const modalTitle = document.getElementById('modalTitle');
  const inputTitle = document.getElementById('inputTitle');
  const inputText = document.getElementById('inputText');
  const btnCancel = document.getElementById('btnCancel');
  const charCounter = document.getElementById('charCounter');

  // Initialize
  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        templates = JSON.parse(saved);
      } catch (e) {
        templates = defaultTemplates;
      }
    } else {
      templates = defaultTemplates;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    }
    renderTemplates();
  }

  // Save to Storage
  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }

  // Render Grid
  function renderTemplates(filtered = templates) {
    templatesGrid.innerHTML = '';
    
    if (filtered.length === 0) {
      templatesGrid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <h3>ไม่พบเทมเพลตข้อความ</h3>
          <p>ลองค้นหาคำอื่น หรือเพิ่มเทมเพลตใหม่สำหรับใช้ตอบคำถามลูกค้า</p>
        </div>
      `;
      return;
    }

    filtered.forEach(t => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-card-header">
          <h4 class="template-card-title">${escapeHTML(t.title)}</h4>
        </div>
        <div class="template-card-body">${escapeHTML(t.text)}</div>
        <div class="template-card-actions">
          <button class="action-btn-circle edit" data-id="${t.id}" title="แก้ไข">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn-circle delete" data-id="${t.id}" title="ลบ">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
      
      // Event listeners
      card.querySelector('.edit').onclick = () => openEditModal(t.id);
      card.querySelector('.delete').onclick = () => deleteTemplate(t.id);

      templatesGrid.appendChild(card);
    });
  }

  // Helpers
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Modals Toggle
  function openAddModal() {
    currentEditId = null;
    modalTitle.textContent = 'เพิ่มเทมเพลตข้อความใหม่';
    templateForm.reset();
    updateCharCounter();
    templateModal.classList.add('active');
    inputTitle.focus();
  }

  function openEditModal(id) {
    const t = templates.find(item => item.id === id);
    if (!t) return;
    currentEditId = id;
    modalTitle.textContent = 'แก้ไขเทมเพลตข้อความ';
    inputTitle.value = t.title;
    inputText.value = t.text;
    updateCharCounter();
    templateModal.classList.add('active');
    inputTitle.focus();
  }

  function closeModal() {
    templateModal.classList.remove('active');
  }

  // Submit Handler
  templateForm.onsubmit = (e) => {
    e.preventDefault();
    const title = inputTitle.value.trim();
    const text = inputText.value.trim();

    if (!title || !text) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (currentEditId) {
      // Edit mode
      const idx = templates.findIndex(item => item.id === currentEditId);
      if (idx !== -1) {
        templates[idx].title = title;
        templates[idx].text = text;
        showToast('แก้ไขเทมเพลตเรียบร้อยแล้ว');
      }
    } else {
      // Add mode
      const newTemplate = {
        id: Date.now().toString(),
        title: title,
        text: text
      };
      templates.unshift(newTemplate);
      showToast('เพิ่มเทมเพลตใหม่เรียบร้อยแล้ว');
    }

    saveToStorage();
    renderTemplates();
    closeModal();
  };

  // Delete Handler
  function deleteTemplate(id) {
    if (confirm('คุณแน่ใจว่าต้องการลบเทมเพลตข้อความนี้ใช่หรือไม่?')) {
      templates = templates.filter(item => item.id !== id);
      saveToStorage();
      renderTemplates();
      showToast('ลบเทมเพลตข้อความเรียบร้อยแล้ว');
    }
  }

  // Search filter
  searchInput.oninput = (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = templates.filter(t => 
      t.title.toLowerCase().includes(query) || 
      t.text.toLowerCase().includes(query)
    );
    renderTemplates(filtered);
  };

  // Character Counter
  function updateCharCounter() {
    const count = inputText.value.length;
    charCounter.textContent = `${count} ตัวอักษร`;
  }

  inputText.oninput = updateCharCounter;

  // Bind Open/Close Events
  btnAddTemplate.onclick = openAddModal;
  modalClose.onclick = closeModal;
  btnCancel.onclick = closeModal;

  // Close on backdrop click
  templateModal.onclick = (e) => {
    if (e.target === templateModal) closeModal();
  };

  // Run initialization
  init();
});

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
