/**
 * EZ BOT — Embeddable Chat Widget
 * วางโค้ดนี้ก่อน </body> บนเว็บไซต์ของคุณ:
 *
 *   <script src="http://YOUR_SERVER/widget.js" data-position="bottom-right" data-color="#d4a017"></script>
 *
 * Options (data attributes):
 *   data-position     : "bottom-right" (default) | "bottom-left"
 *   data-color         : สีหลัก เช่น "#d4a017" (default)
 *   data-greeting      : ข้อความทักทาย เช่น "สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ?"
 *   data-auto-open     : จำนวนวินาทีก่อนเปิดอัตโนมัติ (0 = ไม่เปิด)
 */
(function () {
  'use strict';
  if (window.__ezbot_loaded || window.__happybot_loaded) return;
  window.__ezbot_loaded = true;

  // --- อ่านค่าจาก script tag ---
  var scriptEl = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var SERVER = scriptEl.src.replace(/\/widget\.js.*$/, '');
  var position = scriptEl.getAttribute('data-position') || 'bottom-right';
  var color = scriptEl.getAttribute('data-color') || '#d4a017';
  var greeting = scriptEl.getAttribute('data-greeting') || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ? 💬';
  var autoOpen = parseInt(scriptEl.getAttribute('data-auto-open') || '0', 10);
  var isRight = position !== 'bottom-left';
  
  // โหลดค่าแบบระบุจากโค้ดตั้งค่าโดยตรง
  var customerName = window.ezbot_customer_name || window.happybot_customer_name || scriptEl.getAttribute('data-customer-name') || '';
  var customerEmail = window.ezbot_customer_email || window.happybot_customer_email || scriptEl.getAttribute('data-customer-email') || '';
  var customerPhone = window.ezbot_customer_phone || window.happybot_customer_phone || scriptEl.getAttribute('data-customer-phone') || '';
  var customerAvatar = window.ezbot_customer_avatar || window.happybot_customer_avatar || scriptEl.getAttribute('data-customer-avatar') || '';

  // ระบบตรวจจับดึงข้อมูลผู้ใช้จากหน้าเว็บอัตโนมัติ (Auto-Discovery Scavenger)
  try {
    // 1. พยายามสแกนหาอีเมลในหน้าเว็บ
    if (!customerEmail) {
      // ค้นหาจากลิงก์ mailto:
      var mailtoEl = document.querySelector('a[href^="mailto:"]');
      if (mailtoEl) {
        customerEmail = mailtoEl.href.replace(/^mailto:/i, '').trim();
      }
      
      // ค้นหาจาก elements ที่คลาสหรือไอดีมีคำว่า email
      if (!customerEmail) {
        var emailEl = document.querySelector('[id*="email" i], [class*="email" i]');
        if (emailEl && emailEl.textContent && emailEl.textContent.includes('@')) {
          var emailMatch = emailEl.textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) customerEmail = emailMatch[0];
        }
      }
      
      // ค้นหาข้อความรูปแบบอีเมลที่มีอยู่บนหน้าจอทั้งหมด
      if (!customerEmail && document.body) {
        var bodyText = document.body.innerText || '';
        var globalEmailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (globalEmailMatch) customerEmail = globalEmailMatch[0];
      }
    }

    // 2. พยายามสแกนหาชื่อในหน้าเว็บ
    if (!customerName) {
      var nameEl = document.querySelector('.user-name, .profile-name, #user-name, #profile-name, [class*="profile-name" i]');
      if (nameEl && nameEl.textContent) {
        customerName = nameEl.textContent.replace(/[\n\r]/g, '').trim();
      }
      
      if (!customerName && window.user && typeof window.user === 'object') {
        customerName = window.user.name || window.user.displayName || window.user.username || '';
      }
    }
  } catch (discoveryError) {
    console.warn('EZ BOT Auto-Discovery status:', discoveryError);
  }

  // --- สร้าง Container หลัก ---
  var container = document.createElement('div');
  container.id = 'ezbot-widget';
  container.style.cssText = 'position:fixed;bottom:20px;z-index:2147483647;font-family:-apple-system,"Segoe UI","Sarabun",sans-serif;'
    + (isRight ? 'right:20px;' : 'left:20px;');

  // --- Styles ---
  var style = document.createElement('style');
  style.textContent = [
    '#ezbot-widget *{box-sizing:border-box;margin:0;padding:0}',

    // ปุ่มแชท
    '#hb-fab{',
    '  width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;',
    '  background:linear-gradient(135deg,' + color + ',#b8860b);',
    '  box-shadow:0 6px 24px ' + color + '40;',
    '  display:flex;align-items:center;justify-content:center;',
    '  transition:all .3s cubic-bezier(.4,0,.2,1);position:relative;',
    '}',
    '#hb-fab:hover{transform:scale(1.08);box-shadow:0 8px 30px ' + color + '55}',
    '#hb-fab svg{transition:transform .3s ease}',
    '#hb-fab.open svg{transform:rotate(90deg)}',

    // Bubble ข้อความ
    '#hb-bubble{',
    '  position:absolute;bottom:72px;',
    (isRight ? 'right:0;' : 'left:0;'),
    '  background:#1a1a1a;color:#f0e6d2;font-size:13px;padding:10px 16px;',
    '  border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.35);',
    '  white-space:nowrap;max-width:260px;border:1px solid #2a2520;',
    '  opacity:0;transform:translateY(8px);transition:all .3s ease;pointer-events:none;',
    '}',
    '#hb-bubble.show{opacity:1;transform:translateY(0);pointer-events:auto}',
    '#hb-bubble::after{',
    '  content:"";position:absolute;bottom:-6px;',
    (isRight ? 'right:24px;' : 'left:24px;'),
    '  width:12px;height:12px;background:#1a1a1a;',
    '  transform:rotate(45deg);border-right:1px solid #2a2520;border-bottom:1px solid #2a2520;',
    '}',

    // ปุ่มปิด Bubble
    '#hb-bubble-close{',
    '  position:absolute;top:-6px;',
    (isRight ? 'right:-6px;' : 'left:-6px;'),
    '  width:18px;height:18px;border-radius:50%;background:#333;color:#aaa;',
    '  font-size:11px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;',
    '  transition:all .2s;line-height:1;',
    '}',
    '#hb-bubble-close:hover{background:#555;color:#fff}',

    // Badge แจ้งเตือน
    '#hb-badge{',
    '  position:absolute;top:-4px;right:-4px;',
    '  width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;',
    '  font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;',
    '  border:2px solid #0d0d0d;animation:hbPulse 2s infinite;',
    '}',
    '@keyframes hbPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}',

    // กรอบ iframe
    '#hb-frame-wrap{',
    '  position:absolute;bottom:72px;',
    (isRight ? 'right:0;' : 'left:0;'),
    '  width:380px;height:580px;max-height:calc(100vh - 120px);',
    '  border-radius:16px;overflow:hidden;',
    '  box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 0 1px #2a2520;',
    '  transform:scale(0.85) translateY(20px);opacity:0;',
    '  transition:all .35s cubic-bezier(.4,0,.2,1);pointer-events:none;',
    '  transform-origin:bottom ' + (isRight ? 'right' : 'left') + ';',
    '}',
    '#hb-frame-wrap.open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}',
    '#hb-frame{width:100%;height:100%;border:none;background:#0d0d0d;border-radius:16px}',

    // Responsive มือถือ
    '@media(max-width:440px){',
    '  #hb-frame-wrap{width:calc(100vw - 24px);',
    (isRight ? 'right:-8px;' : 'left:-8px;'),
    '  height:calc(100vh - 100px);bottom:68px;border-radius:14px}',
    '  #hb-frame{border-radius:14px}',
    '}',
  ].join('\n');

  // --- สร้าง DOM ---

  // Bubble ข้อความทักทาย
  var bubble = document.createElement('div');
  bubble.id = 'hb-bubble';
  bubble.textContent = greeting;

  var bubbleClose = document.createElement('button');
  bubbleClose.id = 'hb-bubble-close';
  bubbleClose.innerHTML = '✕';
  bubbleClose.onclick = function (e) {
    e.stopPropagation();
    bubble.classList.remove('show');
    sessionStorage.setItem('hb_bubble_closed', '1');
  };
  bubble.appendChild(bubbleClose);

  // Badge แจ้งเตือน
  var badge = document.createElement('div');
  badge.id = 'hb-badge';

  // ปุ่ม FAB
  var fab = document.createElement('button');
  fab.id = 'hb-fab';
  fab.title = 'เปิดแชท';
  fab.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#0d0d0d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  fab.appendChild(badge);

  // กรอบ iframe
  var frameWrap = document.createElement('div');
  frameWrap.id = 'hb-frame-wrap';

  var iframe = document.createElement('iframe');
  iframe.id = 'hb-frame';
  iframe.title = 'EZ BOT Chat';
  iframe.setAttribute('loading', 'lazy');
  frameWrap.appendChild(iframe);

  // ประกอบ DOM
  container.appendChild(bubble);
  container.appendChild(frameWrap);
  container.appendChild(fab);
  document.head.appendChild(style);
  document.body.appendChild(container);

  // --- Logic เปิด/ปิดแชท ---
  var isOpen = false;
  var iframeLoaded = false;

  function openChat() {
    if (!iframeLoaded) {
      var url = SERVER + '/widget.html';
      var params = [];
      if (customerName) params.push('name=' + encodeURIComponent(customerName));
      if (customerEmail) params.push('email=' + encodeURIComponent(customerEmail));
      if (customerPhone) params.push('phone=' + encodeURIComponent(customerPhone));
      if (customerAvatar) params.push('avatar=' + encodeURIComponent(customerAvatar));
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      iframe.src = url;
      iframeLoaded = true;
    }
    isOpen = true;
    frameWrap.classList.add('open');
    fab.style.display = 'none';
    bubble.classList.remove('show');
    badge.style.display = 'none';
  }

  function closeChat() {
    isOpen = false;
    frameWrap.classList.remove('open');
    fab.style.display = 'flex';
    fab.classList.remove('open');
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#0d0d0d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    fab.appendChild(badge);
  }

  fab.onclick = function () {
    if (isOpen) closeChat(); else openChat();
  };

  // --- แสดง Bubble ทักทาย ---
  if (!sessionStorage.getItem('hb_bubble_closed')) {
    setTimeout(function () {
      if (!isOpen) bubble.classList.add('show');
    }, 2000);
  }

  // --- Auto-open ---
  if (autoOpen > 0) {
    setTimeout(function () {
      if (!isOpen) openChat();
    }, autoOpen * 1000);
  }

  // --- ปิดเมื่อกด Escape ---
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeChat();
  });

  // --- ฟังข้อความสั่งปิด Widget จากใน iframe ---
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'hb-close') {
      closeChat();
    }
  });

})();
