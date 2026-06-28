// auto-reply.js — การควบคุมระบบหน้ากำหนดกฎบอทตอบกลับอัตโนมัติ

// 2. ตัวแปรเก็บข้อมูลในหน่วยความจำ (State)
const API = location.origin;
let inMemoryRules = [];
let handoffKeywords = [];
let modalKeywords = [];

// DOM Elements สำหรับหน้าจอหลัก
let rulesGridEl;
let searchInputEl;
let aiToggleEl;
let systemPromptEl;
let productPromptEl;
let promotionPromptEl;
let saveStatusEl;
let activeTab = 'rules';

// 3. จัดการแท็บเมนูการตั้งค่า
// 3. จัดการแท็บเมนูการตั้งค่า (เอาออกเนื่องจากปรับเป็นหน้าเดี่ยวแล้ว)
function setupTabs() {}

// 4. ดึงข้อมูลกฎการตอบกลับจากเซิร์ฟเวอร์
async function fetchRules() {
  try {
    const res = await fetch(API + '/api/bot/rules');
    if (res.ok) {
      inMemoryRules = await res.json();
      renderRulesList(inMemoryRules);
    } else {
      console.error('Failed to fetch rules');
    }
  } catch (err) {
    console.error('Error fetching rules:', err);
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// 5. แสดงผลการ์ดกฎการตอบกลับ
function renderRulesList(rules) {
  if (!rulesGridEl) return;
  
  if (rules.length === 0) {
    rulesGridEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="empty-state-title">ไม่พบลักษณะคีย์เวิร์ด</span>
        <span class="empty-state-desc">ยังไม่มีกฎตอบกลับ หรือผลลัพธ์ไม่ตรงกับที่คุณค้นหา ลองเพิ่มกฎใหม่</span>
      </div>`;
    return;
  }

  rulesGridEl.innerHTML = rules.map(rule => {
    const keywordTags = (rule.keywords || []).map(k => `
      <span class="rule-tag">${escapeHtml(k)}</span>
    `).join('');
    
    return `
      <div class="rule-card" data-id="${rule.id}">
        <div class="rule-card-header">
          <div class="rule-tags-container">
            ${keywordTags}
          </div>
          <div class="rule-actions">
            <button class="rule-action-btn edit" onclick="openEditRuleModal('${rule.id}')" title="แก้ไข">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="rule-action-btn delete" onclick="deleteRule('${rule.id}')" title="ลบ">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="rule-response-text">${escapeHtml(rule.reply || '')}</div>
      </div>
    `;
  }).join('');
}

// 6. ค้นหาคำสำคัญและข้อความตอบกลับแบบเรียลไทม์
function setupSearch() {
  if (!searchInputEl) return;
  searchInputEl.oninput = () => {
    const query = searchInputEl.value.toLowerCase().trim();
    if (!query) {
      renderRulesList(inMemoryRules);
      return;
    }
    const filtered = inMemoryRules.filter(rule => {
      const matchKeyword = (rule.keywords || []).some(k => k.toLowerCase().includes(query));
      const matchReply = (rule.reply || '').toLowerCase().includes(query);
      return matchKeyword || matchReply;
    });
    renderRulesList(filtered);
  };
}

// 7. จัดการข้อมูลการตั้งค่าบอทและ AI
async function fetchSettings() {
  try {
    const res = await fetch(API + '/api/bot/settings');
    if (res.ok) {
      const settings = await res.json();
      
      // อัปเดต UI เปิด/ปิด AI และ System Prompt
      if (aiToggleEl) aiToggleEl.checked = !!settings.aiEnabled;
      if (systemPromptEl) systemPromptEl.value = settings.aiSystemPrompt || '';
      if (productPromptEl) productPromptEl.value = settings.aiProductPrompt || '';
      if (promotionPromptEl) promotionPromptEl.value = settings.aiPromotionPrompt || '';
      
      // อัปเดตคีย์เวิร์ด Handoff
      handoffKeywords = settings.handoffKeywords || [];
      renderHandoffTags();
      
      // ตรวจสอบเช็ค API Key ของ Gemini และ Claude
      const apiKeyStatusEl = document.getElementById('apiKeyStatus');
      const statusTitleEl = document.getElementById('statusTitle');
      const statusDescEl = document.getElementById('statusDesc');
      
      if (apiKeyStatusEl) {
        if (settings.hasGeminiKey) {
          apiKeyStatusEl.className = 'api-key-status configured';
          statusTitleEl.textContent = ' Gemini AI พร้อมทำงานแล้ว (เชื่อมต่อคีย์สำเร็จ)';
          statusDescEl.textContent = 'พบ GEMINI_API_KEY ในตัวแปรสภาพแวดล้อม (Environment Key) บอทจะใช้ Gemini 2.5 Flash เพื่อประมวลผลข้อความและตอบกลับลูกค้า';
        } else if (settings.hasClaudeKey) {
          apiKeyStatusEl.className = 'api-key-status configured';
          statusTitleEl.textContent = ' Claude AI พร้อมทำงานแล้ว (เชื่อมต่อคีย์สำเร็จ)';
          statusDescEl.textContent = 'พบ ANTHROPIC_API_KEY ในตัวแปรสภาพแวดล้อม (Environment Key) บอทจะใช้ Claude AI เพื่อประมวลผลข้อความและตอบกลับลูกค้า';
        } else {
          apiKeyStatusEl.className = 'api-key-status missing';
          statusTitleEl.textContent = '⚠️ ไม่พบการกำหนดคีย์ API ของ Gemini หรือ Claude';
          statusDescEl.textContent = 'กรุณาตั้งค่า GEMINI_API_KEY (แนะนำ) หรือ ANTHROPIC_API_KEY ในสภาพแวดล้อมเซิร์ฟเวอร์เพื่อให้ฟีเจอร์ AI ทำงานได้';
        }
      }
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

// 8. บันทึกการตั้งค่า AI และ Handoff
async function saveAllSettings() {
  const payload = {
    aiEnabled: aiToggleEl ? aiToggleEl.checked : false,
    handoffKeywords: handoffKeywords
  };
  
  if (systemPromptEl) payload.aiSystemPrompt = systemPromptEl.value;
  if (productPromptEl) payload.aiProductPrompt = productPromptEl.value;
  if (promotionPromptEl) payload.aiPromotionPrompt = promotionPromptEl.value;
  
  try {
    const res = await fetch(API + '/api/bot/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      showSaveStatus('บันทึกการตั้งค่าทั้งหมดสำเร็จ!');
    } else {
      showSaveStatus('เกิดข้อผิดพลาดในการบันทึก!', true);
    }
  } catch (err) {
    console.error('Error saving settings:', err);
    showSaveStatus('เกิดข้อผิดพลาดในการบันทึกข้อมูล!', true);
  }
}

function showSaveStatus(text, isError = false) {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = text;
  saveStatusEl.style.color = isError ? '#ef4444' : '#22c55e';
  saveStatusEl.classList.add('visible');
  
  setTimeout(() => {
    saveStatusEl.classList.remove('visible');
  }, 3000);
}

// 9. จัดการ Keyword tag-inputs สำหรับหน้า Modal และการตั้งค่า Handoff
function setupTagInput(containerId, inputId, getTagsCallback, setTagsCallback) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  if (!container || !input) return;

  // คลิกตัวคอนเทนเนอร์ให้เคอร์เซอร์ไปโฟกัสที่อินพุต
  container.onclick = (e) => {
    if (e.target === container || e.target.classList.contains('tag-input-container')) {
      input.focus();
    }
  };

  input.onkeydown = (e) => {
    const val = input.value.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      
      // คั่นคำซ้ำ
      const tags = getTagsCallback();
      if (!tags.includes(val)) {
        tags.push(val);
        setTagsCallback(tags);
      }
      input.value = '';
    } else if (e.key === 'Backspace' && !val) {
      const tags = getTagsCallback();
      if (tags.length > 0) {
        tags.pop();
        setTagsCallback(tags);
      }
    }
  };
  
  // ซัพพอร์ตการแยกคำเวลาผู้ใช้คัดลอกข้อความมาวางคั่นด้วยจุลภาค
  input.oninput = () => {
    const val = input.value;
    if (val.includes(',')) {
      const parts = val.split(',').map(p => p.trim()).filter(p => p);
      const tags = getTagsCallback();
      parts.forEach(part => {
        if (!tags.includes(part)) {
          tags.push(part);
        }
      });
      setTagsCallback(tags);
      input.value = '';
    }
  };
}

// วาดคำสำคัญในช่อง Handoff
function renderHandoffTags() {
  const container = document.getElementById('handoffTagContainer');
  const input = document.getElementById('handoffKeywordInput');
  if (!container || !input) return;
  
  // ลบอันเก่าทั้งหมด ยกเว้นกล่องอินพุต
  container.querySelectorAll('.tag-chip').forEach(el => el.remove());
  
  handoffKeywords.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `
      ${escapeHtml(tag)}
      <span class="tag-chip-close" onclick="removeHandoffTag('${tag}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    `;
    container.insertBefore(chip, input);
  });
}

function removeHandoffTag(tag) {
  handoffKeywords = handoffKeywords.filter(t => t !== tag);
  renderHandoffTags();
}

// วาดคำสำคัญในช่อง Modal ตอนเพิ่ม/แก้ไข
function renderModalTags() {
  const container = document.getElementById('modalKeywordsContainer');
  const input = document.getElementById('modalKeywordInput');
  if (!container || !input) return;
  
  container.querySelectorAll('.tag-chip').forEach(el => el.remove());
  
  modalKeywords.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `
      ${escapeHtml(tag)}
      <span class="tag-chip-close" onclick="removeModalTag('${tag}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    `;
    container.insertBefore(chip, input);
  });
}

function removeModalTag(tag) {
  modalKeywords = modalKeywords.filter(t => t !== tag);
  renderModalTags();
}

// 10. จัดการ Modal เปิด/ปิด กล่องเพิ่มกฎ
const modalEl = document.getElementById('ruleModal');
const editRuleIdInput = document.getElementById('editRuleId');
const modalReplyTextEl = document.getElementById('modalReplyText');

function openModal(isEdit = false) {
  if (!modalEl) return;
  document.getElementById('modalTitle').textContent = isEdit ? 'แก้ไขกฎการตอบกลับ' : 'เพิ่มกฎการตอบกลับ';
  modalEl.classList.add('open');
}

function closeModal() {
  if (!modalEl) return;
  modalEl.classList.remove('open');
  // รีเซ็ตค่า
  editRuleIdInput.value = '';
  modalReplyTextEl.value = '';
  modalKeywords = [];
  document.getElementById('modalKeywordInput').value = '';
  renderModalTags();
}

function openAddRuleModal() {
  closeModal();
  openModal(false);
}

window.openEditRuleModal = function(id) {
  const rule = inMemoryRules.find(r => r.id === id);
  if (!rule) return;
  
  closeModal();
  editRuleIdInput.value = rule.id;
  modalReplyTextEl.value = rule.reply || '';
  modalKeywords = [...(rule.keywords || [])];
  renderModalTags();
  
  openModal(true);
};

// บันทึกกฎบอทส่งไปเก็บที่หลังบ้าน
async function saveRuleFromModal() {
  const id = editRuleIdInput.value.trim();
  const replyText = modalReplyTextEl.value.trim();
  
  if (modalKeywords.length === 0) {
    alert('กรุณาป้อนคีย์เวิร์ด (คำสำคัญ) อย่างน้อย 1 คำ');
    return;
  }
  if (!replyText) {
    alert('กรุณาป้อนข้อความตอบกลับลูกค้า');
    return;
  }
  
  let updatedRules = [...inMemoryRules];
  if (id) {
    // โหมดแก้ไข
    updatedRules = updatedRules.map(r => {
      if (r.id === id) {
        return Object.assign({}, r, { keywords: modalKeywords, reply: replyText });
      }
      return r;
    });
  } else {
    // โหมดสร้างใหม่
    const newRule = {
      id: 'rule_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      keywords: modalKeywords,
      reply: replyText
    };
    updatedRules.push(newRule);
  }
  
  try {
    const res = await fetch(API + '/api/bot/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rules: updatedRules })
    });
    
    if (res.ok) {
      closeModal();
      await fetchRules();
    } else {
      alert('เกิดข้อผิดพลาดในการบันทึกกฎ!');
    }
  } catch (err) {
    console.error('Error saving rule:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์!');
  }
}

// ลบกฎการตอบกลับ
window.deleteRule = async function(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบกฎการตอบกลับนี้?')) return;
  
  const updatedRules = inMemoryRules.filter(r => r.id !== id);
  try {
    const res = await fetch(API + '/api/bot/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rules: updatedRules })
    });
    
    if (res.ok) {
      await fetchRules();
    } else {
      alert('ไม่สามารถลบกฎได้!');
    }
  } catch (err) {
    console.error('Error deleting rule:', err);
  }
};

// 11. เริ่มต้นหน้าเว็บเมื่อโหลด DOM เสร็จสิ้น
async function init() {
  await loadComponents();

  // ผูกตัวแปร DOM Elements
  rulesGridEl = document.getElementById('rulesGrid');
  searchInputEl = document.getElementById('rulesSearch');
  aiToggleEl = document.getElementById('aiToggle');
  systemPromptEl = document.getElementById('systemPrompt');
  productPromptEl = document.getElementById('productPrompt');
  promotionPromptEl = document.getElementById('promotionPrompt');
  saveStatusEl = document.getElementById('saveStatus');

  // ตรวจจับปุ่มกด Modal และการบันทึก
  document.getElementById('btnAddRule').onclick = openAddRuleModal;
  document.getElementById('btnModalClose').onclick = closeModal;
  document.getElementById('btnModalCancel').onclick = closeModal;
  document.getElementById('btnModalSave').onclick = saveRuleFromModal;
  
  // ปล่อยให้คลิก Backdrop เพื่อปิด
  modalEl.onclick = (e) => {
    if (e.target === modalEl) closeModal();
  };

  // ดำเนินการตั้งค่าแท็กอินพุต
  setupTagInput('handoffTagContainer', 'handoffKeywordInput', () => handoffKeywords, (tags) => {
    handoffKeywords = tags;
    renderHandoffTags();
  });
  
  setupTagInput('modalKeywordsContainer', 'modalKeywordInput', () => modalKeywords, (tags) => {
    modalKeywords = tags;
    renderModalTags();
  });

  // บันทึกการตั้งค่าภาพรวม
  document.getElementById('btnSaveSettings').onclick = saveAllSettings;

  // ตั้งค่าปุ่มกดค้นหา (ลบฟังก์ชันแท็บออกแล้ว)
  setupSearch();

  // ดึงข้อมูลหลักจากเซิร์ฟเวอร์
  await fetchRules();
  await fetchSettings();
}

window.addEventListener('DOMContentLoaded', init);
