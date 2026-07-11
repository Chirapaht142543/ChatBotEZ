document.addEventListener('DOMContentLoaded', () => {
    const pathParts = window.location.pathname.split('/');
  const API = pathParts.length > 2 && pathParts[1] === 'ezbot' ? '/' + pathParts[1] : ''; // Relative to server
  let botSettings = null;
  let activeChannel = 'web'; // Default active channel: 'web' | 'facebook' | 'line'

  // DOM Elements
  const promptsPanel = document.getElementById('promptsPanel');
  const channelTabs = document.querySelectorAll('.channel-tab');
  const globalAiToggle = document.getElementById('globalAiToggle');
  const channelEnabledCheckbox = document.getElementById('channelEnabledCheckbox');
  const channelSystemPrompt = document.getElementById('channelSystemPrompt');
  const channelProductPrompt = document.getElementById('channelProductPrompt');
  const channelPromotionPrompt = document.getElementById('channelPromotionPrompt');
  
  const btnSavePrompts = document.getElementById('btnSavePrompts');
  const saveToast = document.getElementById('saveToast');

  // Initialize
  async function init() {
    setupTabEvents();
    setupSaveEvent();
    await fetchSettings();
    applyPanelTheme();
    loadChannelData();
  }

  // Fetch settings from API
  async function fetchSettings() {
    try {
      const res = await fetch(API + '/api/bot/settings');
      const data = await res.json();
      botSettings = data;

      // Ensure channel structure exists in loaded settings
      if (!botSettings.channels) {
        botSettings.channels = {
          web: { enabled: true, systemPrompt: '', productPrompt: '', promotionPrompt: '' },
          facebook: { enabled: true, systemPrompt: '', productPrompt: '', promotionPrompt: '' },
          line: { enabled: true, systemPrompt: '', productPrompt: '', promotionPrompt: '' }
        };
      }

      // Load global AI enabled check
      if (globalAiToggle) {
        globalAiToggle.checked = !!botSettings.aiEnabled;
      }

      // Update API Key status card
      const card = document.getElementById('apiKeyStatusCard');
      const title = document.getElementById('statusTitle');
      const desc = document.getElementById('statusDesc');

      if (card && title && desc) {
        if (botSettings.hasGeminiKey) {
          card.className = 'api-status-card configured';
          title.innerHTML = '✨ Gemini AI พร้อมทำงานแล้ว (เชื่อมต่อคีย์สำเร็จ)';
          desc.textContent = 'พบ GEMINI_API_KEY ในตัวแปรสภาพแวดล้อม (Environment Key) บอทจะใช้ Gemini 2.5 Flash เพื่อประมวลผลและตอบแชทลูกค้า';
        } else if (botSettings.hasClaudeKey) {
          card.className = 'api-status-card configured';
          title.innerHTML = '✨ Claude AI พร้อมทำงานแล้ว (เชื่อมต่อคีย์สำเร็จ)';
          desc.textContent = 'พบ ANTHROPIC_API_KEY ในตัวแปรสภาพแวดล้อม (Environment Key) บอทจะใช้ Claude AI เพื่อประมวลผลและตอบแชทลูกค้า';
        } else {
          card.className = 'api-status-card missing';
          title.innerHTML = '⚠️ ไม่พบการกำหนดคีย์ API ของ Gemini หรือ Claude';
          desc.textContent = 'กรุณาตั้งค่า GEMINI_API_KEY (แนะนำ) หรือ ANTHROPIC_API_KEY ในสภาพแวดล้อมเซิร์ฟเวอร์เพื่อให้ฟีเจอร์ AI ทำงานได้';
        }
      }

    } catch (err) {
      console.error('Failed to load bot settings:', err);
    }
  }

  // Set up tab click handlers
  function setupTabEvents() {
    channelTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const clickedTab = e.currentTarget;
        const targetChannel = clickedTab.getAttribute('data-channel');
        
        if (targetChannel === activeChannel) return;

        // 1. Save current form values to outgoing channel settings
        saveCurrentFormToMemory();

        // 2. Change active tab styling
        channelTabs.forEach(t => t.classList.remove('active'));
        clickedTab.classList.add('active');

        // 3. Update active channel and change panel theme class
        activeChannel = targetChannel;
        applyPanelTheme();

        // 4. Load incoming channel data into form inputs
        loadChannelData();
      });
    });
  }

  // Apply panel color scheme based on active channel
  function applyPanelTheme() {
    promptsPanel.className = `prompts-panel ${activeChannel}`;
  }

  // Save current form inputs into local memory object
  function saveCurrentFormToMemory() {
    if (!botSettings || !botSettings.channels) return;
    
    // Save global settings values first
    if (globalAiToggle) {
      botSettings.aiEnabled = globalAiToggle.checked;
    }

    if (!botSettings.channels[activeChannel]) {
      botSettings.channels[activeChannel] = {};
    }

    botSettings.channels[activeChannel].enabled = channelEnabledCheckbox.checked;
    botSettings.channels[activeChannel].systemPrompt = channelSystemPrompt.value;
    botSettings.channels[activeChannel].productPrompt = channelProductPrompt.value;
    botSettings.channels[activeChannel].promotionPrompt = channelPromotionPrompt.value;
  }

  // Load active channel settings into form inputs
  function loadChannelData() {
    if (!botSettings || !botSettings.channels || !botSettings.channels[activeChannel]) return;

    const data = botSettings.channels[activeChannel];
    
    channelEnabledCheckbox.checked = (data.enabled !== undefined) ? data.enabled : true;
    channelSystemPrompt.value = data.systemPrompt || '';
    channelProductPrompt.value = data.productPrompt || '';
    channelPromotionPrompt.value = data.promotionPrompt || '';
  }

  // Save Settings to Backend API
  function setupSaveEvent() {
    btnSavePrompts.addEventListener('click', async () => {
      if (!botSettings) return;

      // 1. Save active form inputs to memory first
      saveCurrentFormToMemory();

      try {
        btnSavePrompts.disabled = true;
        btnSavePrompts.innerHTML = `
          <svg class="tab-icon spinning" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
          กำลังบันทึก...
        `;

        // 2. Post settings to server
        const res = await fetch(API + '/api/bot/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(botSettings)
        });

        if (res.ok) {
          // Show toast alert
          saveToast.classList.add('show');
          setTimeout(() => {
            saveToast.classList.remove('show');
          }, 3000);
        } else {
          alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        }

      } catch (err) {
        console.error('Failed to save channel prompts:', err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        btnSavePrompts.disabled = false;
        btnSavePrompts.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          บันทึกการตั้งค่าทั้งหมด
        `;
      }
    });
  }

  init();
});
