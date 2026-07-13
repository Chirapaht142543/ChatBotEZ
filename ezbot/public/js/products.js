document.addEventListener('DOMContentLoaded', () => {
  const pathParts = window.location.pathname.split('/');
  const API = location.origin + (pathParts.length > 2 && pathParts[1] === 'ezbot' ? '/' + pathParts[1] : '');

  // State
  let products = [];
  let currentEditId = null;

  // DOM Elements
  const productsGrid = document.getElementById('productsGrid');
  const searchInput = document.getElementById('searchInput');
  const btnAddProduct = document.getElementById('btnAddProduct');
  const productModal = document.getElementById('productModal');
  const modalClose = document.getElementById('modalClose');
  const productForm = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  const inputName = document.getElementById('inputName');
  const inputAliases = document.getElementById('inputAliases');
  const selectOrderType = document.getElementById('selectOrderType');
  const packagesInputContainer = document.getElementById('packagesInputContainer');
  const btnAddPkgRow = document.getElementById('btnAddPkgRow');
  const btnCancel = document.getElementById('btnCancel');
  
  // Image Upload Elements
  const btnUploadImage = document.getElementById('btnUploadImage');
  const btnDeleteImage = document.getElementById('btnDeleteImage');
  const productImageInput = document.getElementById('productImageInput');
  const previewImage = document.getElementById('previewImage');
  const previewPlaceholder = document.getElementById('previewPlaceholder');
  let uploadedImageUrl = null;

  // Initialize
  async function init() {
    await fetchProducts();
    // Load components in shared.js just in case
    if (typeof window.loadComponents === 'function') {
      window.loadComponents();
    }
  }

  // Fetch Products from API
  async function fetchProducts() {
    try {
      const res = await fetch(API + '/api/products');
      if (res.ok) {
        products = await res.json();
        renderProducts();
      }
    } catch (e) {
      console.error('Failed to fetch products:', e);
      showToast('ไม่สามารถดึงข้อมูลสินค้าได้');
    }
  }

  // Render Grid
  function renderProducts(filtered = products) {
    productsGrid.innerHTML = '';
    
    if (filtered.length === 0) {
      productsGrid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
          <h3>ไม่พบสินค้าหรือราคาเกม</h3>
          <p>ลองค้นหาคำอื่น หรือกดปุ่มเพิ่มสินค้าใหม่ด้านขวาบน</p>
        </div>
      `;
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card';
      
      const badgeClass = p.orderType === 'instant' ? 'instant' : 'pre_order';
      const badgeText = p.orderType === 'instant' ? 'เข้าทันที (Instant)' : 'พรีออเดอร์ (Pre-Order)';
      const aliasText = p.aliases && p.aliases.length > 0 ? p.aliases.join(', ') : '-';
      
      let imageHTML = '';
      if (p.imageUrl) {
        imageHTML = `<div class="product-image-banner" style="width: 100%; height: 140px; border-radius: 12px; background: url('${API + p.imageUrl}') center/cover no-repeat; margin-bottom: 12px; border: 1px solid rgba(226, 232, 240, 0.8);"></div>`;
      }
      
      let packagesHTML = '';
      if (p.packages && p.packages.length > 0) {
        p.packages.forEach(pkg => {
          packagesHTML += `
            <div class="package-item">
              <span class="package-item-name">${escapeHTML(pkg.name)}</span>
              <span class="package-item-price">${pkg.price.toLocaleString()} บาท</span>
            </div>
          `;
        });
      } else {
        packagesHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px 0;">ไม่มีแพ็กเกจในระบบ</div>';
      }

      card.innerHTML = `
        ${imageHTML}
        <div class="product-card-header">
          <div>
            <h4 class="product-card-title">🎮 ${escapeHTML(p.name)}</h4>
            <span class="product-badge ${badgeClass}">${badgeText}</span>
          </div>
        </div>
        <div class="product-aliases">
          <strong>คำค้นหา:</strong> ${escapeHTML(aliasText)}
        </div>
        <div class="packages-list-header">แพ็กเกจราคา</div>
        <div class="packages-container">
          ${packagesHTML}
        </div>
        <div class="product-card-actions">
          <button class="action-btn-circle edit" title="แก้ไข">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn-circle delete" title="ลบ">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
      
      // Bind actions
      card.querySelector('.edit').onclick = () => openEditModal(p);
      card.querySelector('.delete').onclick = () => deleteProduct(p.id, p.name);

      productsGrid.appendChild(card);
    });
  }

  // Add Dynamic Package Row in Modal
  function addPackageRow(name = '', price = '') {
    const row = document.createElement('div');
    row.className = 'pkg-input-row';
    row.innerHTML = `
      <input type="text" class="form-control pkg-name" placeholder="ชื่อแพ็กเกจ (เช่น 300 คูปอง)" value="${escapeHTML(name)}" required>
      <input type="number" class="form-control price-input pkg-price" placeholder="ราคา (บาท)" value="${price}" required min="0" step="any">
      <button type="button" class="btn-remove-pkg">&times;</button>
    `;
    
    row.querySelector('.btn-remove-pkg').onclick = () => {
      row.remove();
    };
    
    packagesInputContainer.appendChild(row);
  }

  // Modal Control
  function openAddModal() {
    currentEditId = null;
    modalTitle.textContent = 'เพิ่มสินค้าและราคาใหม่';
    productForm.reset();
    packagesInputContainer.innerHTML = '';
    // Add one default empty row
    addPackageRow();
    
    // Clear Image Upload Form
    uploadedImageUrl = null;
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    btnDeleteImage.style.display = 'none';
    if (productImageInput) productImageInput.value = '';
    
    productModal.classList.add('active');
    inputName.focus();
  }

  function openEditModal(product) {
    currentEditId = product.id;
    modalTitle.textContent = `แก้ไขข้อมูลสินค้า: ${product.name}`;
    inputName.value = product.name;
    inputAliases.value = product.aliases ? product.aliases.join(', ') : '';
    selectOrderType.value = product.orderType || 'instant';
    
    // Load existing image if any
    uploadedImageUrl = product.imageUrl || null;
    if (uploadedImageUrl) {
      previewImage.src = API + uploadedImageUrl;
      previewImage.style.display = 'block';
      previewPlaceholder.style.display = 'none';
      btnDeleteImage.style.display = 'inline-block';
    } else {
      previewImage.src = '';
      previewImage.style.display = 'none';
      previewPlaceholder.style.display = 'block';
      btnDeleteImage.style.display = 'none';
    }
    if (productImageInput) productImageInput.value = '';
    
    packagesInputContainer.innerHTML = '';
    if (product.packages && product.packages.length > 0) {
      product.packages.forEach(pkg => {
        addPackageRow(pkg.name, pkg.price);
      });
    } else {
      addPackageRow();
    }
    
    productModal.classList.add('active');
    inputName.focus();
  }

  function closeModal() {
    productModal.classList.remove('active');
  }

  // Submit Handler
  productForm.onsubmit = async (e) => {
    e.preventDefault();
    
    const name = inputName.value.trim();
    const aliases = inputAliases.value.split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);
    const orderType = selectOrderType.value;
    
    // Collect packages
    const pkgRows = packagesInputContainer.querySelectorAll('.pkg-input-row');
    const packages = [];
    pkgRows.forEach(row => {
      const pName = row.querySelector('.pkg-name').value.trim();
      const pPrice = parseFloat(row.querySelector('.pkg-price').value);
      if (pName && !isNaN(pPrice)) {
        packages.push({ name: pName, price: pPrice });
      }
    });

    if (packages.length === 0) {
      alert('กรุณาเพิ่มอย่างน้อย 1 แพ็กเกจ');
      return;
    }

    const payload = {
      id: currentEditId,
      name,
      aliases,
      orderType,
      imageUrl: uploadedImageUrl,
      packages
    };

    try {
      const res = await fetch(API + '/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(currentEditId ? 'แก้ไขข้อมูลสินค้าสำเร็จ' : 'เพิ่มสินค้าใหม่สำเร็จ');
        closeModal();
        fetchProducts();
      } else {
        showToast('ไม่สามารถบันทึกข้อมูลได้');
      }
    } catch (err) {
      console.error('Submit error:', err);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  };

  // Delete Handler
  async function deleteProduct(id, name) {
    if (confirm(`คุณแน่ใจว่าต้องการลบสินค้า "${name}" ใช่หรือไม่?`)) {
      try {
        const res = await fetch(`${API}/api/products/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          showToast(`ลบสินค้า "${name}" เรียบร้อยแล้ว`);
          fetchProducts();
        } else {
          showToast('ไม่สามารถลบสินค้าได้');
        }
      } catch (err) {
        console.error('Delete error:', err);
        showToast('เกิดข้อผิดพลาดในการลบสินค้า');
      }
    }
  }

  // Search Filter
  searchInput.oninput = (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderProducts();
      return;
    }
    
    const filtered = products.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(query);
      const aliasMatch = p.aliases && p.aliases.some(alias => alias.toLowerCase().includes(query));
      return nameMatch || aliasMatch;
    });
    
    renderProducts(filtered);
  };

  // HTML escape helper
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Bind Events
  btnAddProduct.onclick = openAddModal;
  modalClose.onclick = closeModal;
  btnCancel.onclick = closeModal;
  btnAddPkgRow.onclick = () => addPackageRow();

  productModal.onclick = (e) => {
    if (e.target === productModal) closeModal();
  };

  // Image Upload Click Actions
  if (btnUploadImage && productImageInput) {
    btnUploadImage.onclick = () => productImageInput.click();
  }

  if (productImageInput) {
    productImageInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        try {
          const res = await fetch(API + '/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: file.name, base64 })
          });
          
          if (res.ok) {
            const data = await res.json();
            uploadedImageUrl = data.url;
            previewImage.src = API + data.url;
            previewImage.style.display = 'block';
            previewPlaceholder.style.display = 'none';
            btnDeleteImage.style.display = 'inline-block';
            showToast('อัปโหลดรูปภาพสำเร็จ');
          } else {
            showToast('อัปโหลดรูปภาพไม่สำเร็จ');
          }
        } catch (err) {
          console.error('Image upload error:', err);
          showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        }
      };
      reader.readAsDataURL(file);
    };
  }

  if (btnDeleteImage) {
    btnDeleteImage.onclick = () => {
      uploadedImageUrl = null;
      previewImage.src = '';
      previewImage.style.display = 'none';
      previewPlaceholder.style.display = 'block';
      btnDeleteImage.style.display = 'none';
      if (productImageInput) productImageInput.value = '';
      showToast('ลบรูปภาพเรียบร้อย');
    };
  }

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
