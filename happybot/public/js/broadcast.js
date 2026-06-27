document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const btnNewBroadcast = document.getElementById('btnNewBroadcast');
  const btnCancel = document.getElementById('btnCancel');
  const formCompose = document.getElementById('formCompose');
  const viewHistory = document.getElementById('viewHistory');
  const viewCompose = document.getElementById('viewCompose');
  const inputMessage = document.getElementById('inputMessage');
  const mockupText = document.getElementById('mockupText');
  
  // Toggle Views
  function showComposeView() {
    viewHistory.style.display = 'none';
    viewCompose.style.display = 'block';
  }

  function showHistoryView() {
    viewCompose.style.display = 'none';
    viewHistory.style.display = 'block';
  }

  if (btnNewBroadcast) {
    btnNewBroadcast.addEventListener('click', showComposeView);
  }

  if (btnCancel) {
    btnCancel.addEventListener('click', (e) => {
      e.preventDefault();
      showHistoryView();
    });
  }

  // Live Preview Logic
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

  // Handle Submit Mock
  if (formCompose) {
    formCompose.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Check validation
      if (!inputMessage.value.trim()) {
        alert('กรุณากรอกข้อความบรอดแคสต์');
        return;
      }
      
      showToast('บรอดแคสต์ถูกตั้งเวลาส่งเรียบร้อยแล้ว');
      
      // Reset form and go back to history after a short delay
      setTimeout(() => {
        formCompose.reset();
        mockupText.textContent = 'พิมพ์ข้อความที่นี่...';
        mockupText.style.color = '#94a3b8';
        showHistoryView();
      }, 1500);
    });
  }
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
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
