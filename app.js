const API_BASE_URL = 'https://mygrocery-api.zhuqingmo.workers.dev';

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (!config) config = {};
  if (!config.headers) config.headers = {};
  
  const token = localStorage.getItem('mygrocery_token');
  // Only intercept API calls to our worker
  if (token && typeof resource === 'string' && resource.startsWith(API_BASE_URL)) {
    config.headers['Authorization'] = 'Basic ' + token;
  }
  return originalFetch.call(window, resource, config);
};

let customLocations = [];
let customCategories = [];

function getAllCategories() {
  return [...CATEGORIES, ...customCategories];
}

function getAllLocations() {
  return [...['fridge', 'freezer', 'pantry'], ...customLocations.map(l => l.toLowerCase())];
}

async function checkAuth() {
  const name = localStorage.getItem('mygrocery_name');
  if(name) { const hhName = document.querySelector('#main-header h1.title'); if(hhName) hhName.textContent = name; }
  const token = localStorage.getItem('mygrocery_token');
  if (token) {
    document.getElementById('view-auth').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    try {
      const res = await window.fetch(API_BASE_URL + '/api/preferences');
      if (res.ok) {
        const data = await res.json();
        customLocations = data.preferences.locations || [];
        customCategories = data.preferences.categories || [];
      }
    } catch(e) {}
    
    if (typeof renderDynamicUI === 'function') renderDynamicUI();
    switchView('inventory');
  } else {
    document.getElementById('view-auth').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
  }
}

function setupAuthEvents() {
  document.getElementById('toggle-pass').addEventListener('click', (e) => {
    e.preventDefault();
    const passInput = document.getElementById('auth-pass');
    const toggleBtn = document.getElementById('toggle-pass');
    
    if (passInput.getAttribute('type') === 'password') {
      passInput.setAttribute('type', 'text');
      toggleBtn.textContent = '🙈';
    } else {
      passInput.setAttribute('type', 'password');
      toggleBtn.textContent = '👁️';
    }
  });

  document.getElementById('header-title').addEventListener('click', () => {
    const name = localStorage.getItem('mygrocery_name') || 'Household';
    document.getElementById('account-household-name').textContent = name;
    document.getElementById('modal-account').style.display = 'flex';
  });

  document.getElementById('btn-close-account').addEventListener('click', () => {
    document.getElementById('modal-account').style.display = 'none';
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('mygrocery_token');
    localStorage.removeItem('mygrocery_name');
    document.getElementById('modal-account').style.display = 'none';
    checkAuth();
  });

  document.getElementById('btn-change-pass').addEventListener('click', async () => {
    const oldPass = document.getElementById('old-password').value.trim();
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    if (!oldPass) return showToast('Please enter your current password', 'error');
    if (!newPass) return showToast('Please enter a new password', 'error');
    if (newPass !== confirmPass) return showToast('Passwords do not match', 'error');
    if (newPass.length < 4) return showToast('Password must be at least 4 characters', 'error');

    // Verify old password matches what's stored
    const token = localStorage.getItem('mygrocery_token');
    const currentPass = atob(token).split(':')[1];
    if (oldPass !== currentPass) return showToast('Current password is incorrect', 'error');

    try {
      const res = await window.fetch(API_BASE_URL + '/api/households/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPass })
      });
      if (!res.ok) throw new Error('Failed to change password');

      // Update stored token with new password
      const oldToken = localStorage.getItem('mygrocery_token');
      const householdId = atob(oldToken).split(':')[0];
      const newToken = btoa(householdId + ':' + newPass);
      localStorage.setItem('mygrocery_token', newToken);

      document.getElementById('modal-account').style.display = 'none';
      showToast('Password updated!');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
  document.getElementById('btn-login').addEventListener('click', async () => {
    const name = document.getElementById('auth-name').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!name || !pass) return showToast('Name and password required', 'error');

    try {
      const res = await originalFetch.call(window, API_BASE_URL + '/api/households/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: pass })
      });
      if (!res.ok) throw new Error('Invalid login');
      const data = await res.json();
      const token = btoa(data.id + ':' + pass);
      localStorage.setItem('mygrocery_token', token);
      localStorage.setItem('mygrocery_name', data.name);
      checkAuth();
      showToast('Welcome back, ' + data.name + '!');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

const CATEGORIES = [
  { name: 'Dairy', emoji: '🥛', color: '#42A5F5' },
  { name: 'Meat & Fish', emoji: '🥩', color: '#EF5350' },
  { name: 'Produce', emoji: '🥬', color: '#66BB6A' },
  { name: 'Dish', emoji: '🍲', color: '#8D6E63' },
  { name: 'Bakery & Grains', emoji: '🍞', color: '#FFA726' },
  { name: 'Frozen', emoji: '🧊', color: '#26C6DA' },
  { name: 'Canned & Jarred', emoji: '🥫', color: '#FF7043' },
  { name: 'Beverages', emoji: '🥤', color: '#AB47BC' },
  { name: 'Snacks', emoji: '🍪', color: '#EC407A' },
  { name: 'Condiments', emoji: '🧂', color: '#FFEE58' },
  { name: 'Other', emoji: '📦', color: '#BDBDBD' }
];

let state = {
  currentView: 'inventory',
  currentLocation: 'fridge',
  currentCategory: 'All',
  currentSort: 'expiry_asc',
  searchQuery: '',
  items: [],
  recentLogs: [],
  editingItem: null,
  html5Qrcode: null
};

// =======================
// API Service
// =======================
async function fetchItems(location, category, search, sort) {
  try {
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (category && category !== 'All') params.set('category', category);
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    const response = await fetch(`${API_BASE_URL}/api/items?${params.toString()}`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error fetching items:', error);
    showToast('Failed to fetch items', 'error');
    return [];
  }
}

async function fetchItem(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items/${id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error fetching item:', error);
    return null;
  }
}

async function createItem(data) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error creating item:', error);
    throw error;
  }
}

async function updateItem(id, data) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error updating item:', error);
    throw error;
  }
}

async function logItemActivity(id, reason, amount) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items/${id}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: reason, amount })
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error logging item:', error);
    throw error;
  }
}

async function lookupBarcode(barcode) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/lookup/${barcode}`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error looking up barcode:', error);
    return { found: false };
  }
}

async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error fetching stats:', error);
    return null;
  }
}

async function fetchExpiring() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/expiring`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error fetching expiring items:', error);
    return [];
  }
}

// =======================
// Scanner Module
// =======================
function initScanner() {
  if (!state.html5Qrcode) {
    state.html5Qrcode = new Html5Qrcode("scanner-container");
  }
}

async function startScanning() {
  const modal = document.getElementById('modal-scanner');
  modal.style.display = 'flex';
  initScanner();

  try {
    await state.html5Qrcode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      (errorMessage) => { /* Ignore regular scan failures */ }
    );
  } catch (err) {
    console.error('Error starting scanner:', err);
    showToast('Could not start camera. Try "Take Photo" instead.', 'error');
  }
}

async function stopScanning() {
  if (state.html5Qrcode && state.html5Qrcode.isScanning) {
    try {
      await state.html5Qrcode.stop();
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
  }
  document.getElementById('modal-scanner').style.display = 'none';
}

function openScanner() {
  document.getElementById('modal-scanner').style.display = 'flex';
  initScanner();
  startScanning();
}

function stopScannerAndClose() {
  stopScanning();
  document.getElementById('modal-scanner').style.display = 'none';
}

async function onScanSuccess(decodedText) {
  await stopScanning();
  showToast('Barcode scanned! Looking up product...');
  state.scannedBarcode = decodedText;

  const productInfo = await lookupBarcode(decodedText);
  if (productInfo && productInfo.found) {
    showToast(`Found: ${productInfo.name}`);
    openItemForm(null, productInfo);
  } else {
    showToast('Product not found in database. Please enter details.', 'error');
    openItemForm(null, null);
  }
}

async function handlePhotoFallback(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const decodedText = await Html5Qrcode.scanFile(file, true);
    await stopScanning();
    showToast('Barcode scanned! Looking up product...');
    state.scannedBarcode = decodedText;
    const productInfo = await lookupBarcode(decodedText);
    if (productInfo && productInfo.found) {
      showToast(`Found: ${productInfo.name}`);
      openItemForm(null, productInfo);
    } else {
      showToast('Product not found in database. Please enter details.', 'error');
      openItemForm(null, null);
    }
  } catch (err) {
    console.error('Error scanning file:', err);
    showToast('Could not read barcode from image. Enter manually.', 'error');
    await stopScanning();
    openItemForm();
  }
  event.target.value = '';
}

function closeItemForm() {
  document.getElementById('modal-item-form').style.display = 'none';
  state.editingItem = null;
  state.scannedBarcode = null;
  
  // reset inputs
  document.getElementById('item-name').value = '';
}

// =======================
// UI Helpers
// =======================
function getCategoryColor(categoryName) {
  const cat = getAllCategories().find(c => c.name === categoryName);
  return cat ? cat.color : '#BDBDBD';
}

function getExpiryStatus(expiryDateStr) {
  if (!expiryDateStr) return { status: 'none', daysLeft: null, text: 'No expiry set' };

  const expiry = new Date(expiryDateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = expiry - today;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { status: 'expired', daysLeft, text: `Expired ${Math.abs(daysLeft)}d ago` };
  if (daysLeft === 0) return { status: 'urgent', daysLeft, text: 'Expires today!' };
  if (daysLeft <= 3) return { status: 'urgent', daysLeft, text: `${daysLeft} day${daysLeft > 1 ? 's' : ''} left` };
  if (daysLeft <= 7) return { status: 'warning', daysLeft, text: `${daysLeft} days left` };
  return { status: 'fresh', daysLeft, text: `${daysLeft} days left` };
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  // Example: "Sep 5, 2026, 7:35 PM"
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =======================
// Render Functions
// =======================
function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  container.innerHTML = '';

  const allChip = document.createElement('div');
  allChip.className = `chip ${state.currentCategory === 'All' ? 'active' : ''}`;
  allChip.textContent = 'All';
  allChip.onclick = () => {
    state.currentCategory = 'All';
    renderCategoryChips();
    renderInventory();
  };
  container.appendChild(allChip);

  getAllCategories().forEach(cat => {
    const chip = document.createElement('div');
    chip.className = `chip ${state.currentCategory === cat.name ? 'active' : ''}`;
    chip.textContent = `${cat.emoji} ${cat.name}`;
    chip.onclick = () => {
      state.currentCategory = cat.name;
      renderCategoryChips();
      renderInventory();
    };
    container.appendChild(chip);
  });
}

function getCategoryEmoji(categoryName) {
  const cat = getAllCategories().find(c => c.name === categoryName);
  return cat ? cat.emoji : '📦';
}

function createItemCard(item) {
  const expiryInfo = getExpiryStatus(item.expiry_date);
  const catColor = getCategoryColor(item.category || 'Other');
  const catEmoji = getCategoryEmoji(item.category || 'Other');
  const safeName = escapeHtml(item.name);

  const card = document.createElement('div');
  card.className = `item-card ${expiryInfo.status}`;
  card.dataset.id = item.id;

  const displayUnit = item.unit || 'pcs';
  const addedText = formatDateTime(item.date_added);
  
  const thumbnailHtml = item.image_url 
    ? `<img src="${item.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
    : `<span style="font-size: 24px;">${catEmoji}</span>`;

  card.innerHTML = `
    <div style="display: flex; flex-direction: row; align-items: center; width: 100%;">
      <div class="item-thumbnail" style="width: 48px; height: 48px; min-width: 48px; border-radius: 6px; overflow: hidden; margin-right: 12px; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
        ${thumbnailHtml}
      </div>
      <div class="item-info" style="flex: 1; min-width: 0;">
        <div class="item-header">
          <span class="item-name">${safeName}</span>
          <span class="item-category-pill" style="background-color: ${catColor}">${escapeHtml(item.category || 'Other')}</span>
        </div>
        <div class="item-details">
          <span class="item-qty">Qty: ${item.quantity} ${displayUnit} · ${item.location}</span>
          <span class="item-expiry-text ${expiryInfo.status}">${expiryInfo.text}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-light); margin-top: 6px;">
          Added: ${addedText}
        </div>
      </div>
      <div class="item-actions" style="margin-left: 8px;">
        <button class="icon-btn edit" title="Edit">✏️</button>
        <button class="icon-btn delete" title="Log Activity">📝</button>
      </div>
    </div>
  `;

  // Edit button
  card.querySelector('.icon-btn.edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openItemForm(item.id);
  });

  // Log Activity button
  card.querySelector('.icon-btn.delete').addEventListener('click', (e) => {
    e.stopPropagation();
    openLogModal(item.id, item.name, item.quantity, item.unit);
  });

  return card;
}

async function renderInventory() {
  const listContainer = document.getElementById('inventory-list');
  const emptyState = document.getElementById('inventory-empty');

  listContainer.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  state.items = await fetchItems(state.currentLocation, state.currentCategory, state.searchQuery, state.currentSort);

  listContainer.innerHTML = '';

  if (state.items.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    state.items.forEach(item => {
      listContainer.appendChild(createItemCard(item));
    });
  }

  document.getElementById('header-location').textContent =
    state.currentLocation.charAt(0).toUpperCase() + state.currentLocation.slice(1);
}

async function renderExpiring() {
  const items = await fetchExpiring();

  const expired = [];
  const next3 = [];
  const next7 = [];

  items.forEach(item => {
    const info = getExpiryStatus(item.expiry_date);
    if (info.status === 'expired') expired.push(item);
    else if (info.daysLeft >= 0 && info.daysLeft <= 3) next3.push(item);
    else if (info.daysLeft > 3 && info.daysLeft <= 7) next7.push(item);
  });

  const expiredSection = document.getElementById('expiring-expired');
  const next3Section = document.getElementById('expiring-next-3');
  const next7Section = document.getElementById('expiring-next-7');
  const emptyState = document.getElementById('expiring-empty');

  [expiredSection, next3Section, next7Section].forEach(s => {
    s.querySelector('.items-list').innerHTML = '';
  });

  expired.forEach(item => expiredSection.querySelector('.items-list').appendChild(createItemCard(item)));
  next3.forEach(item => next3Section.querySelector('.items-list').appendChild(createItemCard(item)));
  next7.forEach(item => next7Section.querySelector('.items-list').appendChild(createItemCard(item)));

  expiredSection.style.display = expired.length ? 'block' : 'none';
  next3Section.style.display = next3.length ? 'block' : 'none';
  next7Section.style.display = next7.length ? 'block' : 'none';

  emptyState.style.display = (expired.length === 0 && next3.length === 0 && next7.length === 0) ? 'block' : 'none';
}

async function renderStats() {
  const stats = await fetchStats();
  if (!stats) return;

  const totalCostConsumed = stats.total_cost_consumed || 0;
  const totalCostWasted = stats.total_cost_wasted || 0;
  const totalPctConsumed = stats.total_pct_consumed || 0;
  const totalPctWasted = stats.total_pct_wasted || 0;

  // Always use percentage for the Waste % so items without a cost (like Dishes) are counted!
  let wastePercent = 0;
  let consumePercent = 0;
  const totalPct = totalPctConsumed + totalPctWasted;
  
  if (totalPct > 0) {
    wastePercent = Math.round((totalPctWasted / totalPct) * 100);
    consumePercent = Math.round((totalPctConsumed / totalPct) * 100);
  }

  document.getElementById('stat-consumed').textContent = '$' + totalCostConsumed.toFixed(2);
  document.getElementById('stat-wasted').textContent = '$' + totalCostWasted.toFixed(2);
  document.getElementById('stat-pct-consumed').textContent = consumePercent + '%';
  document.getElementById('stat-pct-wasted').textContent = wastePercent + '%';

  const chart = document.getElementById('stats-chart');
  chart.innerHTML = '';

  const months = stats.by_month || [];
  if (months.length > 0) {
    // Always use percentages for chart heights so $0 items are tracked visually
    const maxVal = Math.max(...months.map(m => Math.max(m.consumed_pct, m.wasted_pct, 1)));

    months.forEach(month => {
      let cVal = month.consumed_pct;
      let wVal = month.wasted_pct;

      const consumedHeight = (cVal / maxVal) * 100;
      const wastedHeight = (wVal / maxVal) * 100;
      
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthIdx = parseInt(month.month.split('-')[1], 10) - 1;
      const label = monthNames[monthIdx] || month.month;

      const col = document.createElement('div');
      col.className = 'chart-column';
      col.innerHTML = `
        <div class="chart-bar-group">
          <div class="chart-bar consumed" style="height: ${consumedHeight}%" title="Consumed % Volume"></div>
          <div class="chart-bar wasted" style="height: ${wastedHeight}%" title="Wasted % Volume"></div>
        </div>
        <div class="chart-label">${label}</div>
      `;
      chart.appendChild(col);
    });
  } else {
    chart.innerHTML = '<div class="empty-state"><p>No data yet</p></div>';
  }

  const catList = document.getElementById('stats-category-list');
  if (catList) {
    catList.innerHTML = '';
    if (stats.by_category && stats.by_category.length > 0) {
      const maxVal = Math.max(...stats.by_category.map(c => c.sum_pct || 0));

      stats.by_category.forEach(cat => {
        const val = cat.sum_pct || 0;
        if (val <= 0) return;
        
        const pct = (val / maxVal) * 100;
        const catColor = getCategoryColor(cat.category);
        const catEmoji = getCategoryEmoji(cat.category);
        const displayVal = cat.sum_cost > 0 ? `$${cat.sum_cost.toFixed(2)} (${Math.round(val)}%)` : `${Math.round(val)}%`;
        
        const row = document.createElement('div');
        row.style.marginBottom = '12px';
        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
            <span>${catEmoji} ${cat.category}</span>
            <span style="font-weight: bold; color: var(--danger-color);">${displayVal}</span>
          </div>
          <div style="width: 100%; background: #e0e0e0; border-radius: 4px; height: 8px; overflow: hidden;">
            <div style="width: ${pct}%; background: ${catColor}; height: 100%; border-radius: 4px;"></div>
          </div>
        `;
        catList.appendChild(row);
      });
    } else {
      catList.innerHTML = '<div class="empty-state" style="padding: 16px 0;"><p>No waste data yet</p></div>';
    }
  }

  const historyList = document.getElementById('stats-history-list');
  if (historyList) {
    state.recentLogs = stats.recent_logs || [];
    renderHistory();
  }
}

function renderHistory() {
  const historyList = document.getElementById('stats-history-list');
  if (!historyList) return;
  
  historyList.innerHTML = '';
  
  const filterType = document.getElementById('history-filter-type').value;
  const filterCategory = document.getElementById('history-filter-category').value;
  
  const filteredLogs = state.recentLogs.filter(log => {
    if (filterType !== 'all' && log.reason !== filterType) return false;
    if (filterCategory !== 'all' && log.category !== filterCategory) return false;
    return true;
  });

  if (filteredLogs.length > 0) {
    filteredLogs.forEach(log => {
      const row = document.createElement('div');
      row.style = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color); cursor: pointer;';
      
      const icon = log.reason === 'consumed' ? '✅' : '🗑️';
      const color = log.reason === 'consumed' ? 'var(--success-color)' : 'var(--danger-color)';
      const costText = log.cost_value ? `<br><span style="font-weight:normal; font-size: 11px;">$${log.cost_value.toFixed(2)}</span>` : '';
      const dateStr = formatDateTime(log.removed_at.replace(' ', 'T') + 'Z');
      
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; pointer-events: none;">
          <div style="font-size: 24px; min-width: 30px; text-align: center;">${icon}</div>
          <div>
            <div style="font-weight: bold; color: var(--text-main); font-size: 15px;">${escapeHtml(log.item_name)}</div>
            <div style="font-size: 11px; color: var(--text-light); margin-top: 2px;">${dateStr}</div>
          </div>
        </div>
        <div style="text-align: right; pointer-events: none;">
          <div style="font-weight: bold; color: ${color}; font-size: 14px;">
            ${log.logged_quantity} ${escapeHtml(log.unit || 'pcs')}${costText}
          </div>
        </div>
      `;
      
      row.onclick = () => openHistoryInfo(log);
      historyList.appendChild(row);
    });
  } else {
    historyList.innerHTML = '<div class="empty-state" style="padding: 16px 0;"><p>No history matches filters</p></div>';
  }
}

function openHistoryInfo(log) {
  const modal = document.getElementById('modal-history-info');
  const body = document.getElementById('history-info-body');
  
  const icon = log.reason === 'consumed' ? '✅ Consumed' : '🗑️ Wasted';
  const color = log.reason === 'consumed' ? 'var(--success-color)' : 'var(--danger-color)';
  const dateStr = formatDateTime(log.removed_at.replace(' ', 'T') + 'Z');
  
  let html = `
    <div style="margin-bottom: 8px;"><strong>Name:</strong> ${escapeHtml(log.item_name)}</div>
    <div style="margin-bottom: 8px;"><strong>Category:</strong> ${getCategoryEmoji(log.category)} ${escapeHtml(log.category)}</div>
    <div style="margin-bottom: 8px;"><strong>Status:</strong> <span style="font-weight:bold; color:${color};">${icon}</span></div>
    <div style="margin-bottom: 8px;"><strong>Date:</strong> ${dateStr}</div>
    <div style="margin-bottom: 8px;"><strong>Amount Logged:</strong> ${log.logged_quantity} ${escapeHtml(log.unit || 'pcs')}</div>
  `;
  
  if (log.cost_value !== null) {
    html += `<div style="margin-bottom: 8px;"><strong>Cost Logged:</strong> $${log.cost_value.toFixed(2)}</div>`;
  }
  
  if (log.percentage !== null) {
    html += `<div style="margin-bottom: 8px;"><strong>Volume Logged:</strong> ${Math.round(log.percentage)}% of original</div>`;
  }
  
  body.innerHTML = html;
  modal.style.display = 'flex';
}

// Custom Report Features
async function generateCustomReport() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  const resultsDiv = document.getElementById('report-results');
  
  resultsDiv.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
  
  try {
    let url = `${API_BASE_URL}/api/report`;
    if (start || end) {
      const params = new URLSearchParams();
      if (start) params.append('start', start);
      if (end) params.append('end', end);
      url += '?' + params.toString();
    }
    
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch report');
    
    const data = await res.json();
    const rows = data.report || [];
    
    if (rows.length === 0) {
      resultsDiv.innerHTML = '<div class="empty-state"><p>No data found for this period.</p></div>';
      return;
    }
    
    const items = {};
    rows.forEach(row => {
      // Group by name + unit
      const key = `${row.item_name}_${row.unit}`;
      if (!items[key]) {
        items[key] = { name: row.item_name, unit: row.unit || 'pcs', consumed_qty: 0, consumed_cost: 0, wasted_qty: 0, wasted_cost: 0 };
      }
      if (row.reason === 'consumed') {
        items[key].consumed_qty += row.total_qty;
        items[key].consumed_cost += row.total_cost || 0;
      }
      if (row.reason === 'wasted') {
        items[key].wasted_qty += row.total_qty;
        items[key].wasted_cost += row.total_cost || 0;
      }
    });
    
    let html = '';
    Object.values(items).forEach(item => {
      let consumedStr = item.consumed_qty > 0 ? `<div style="color:var(--success-color);">✅ Consumed: <strong>${item.consumed_qty} ${item.unit}</strong>${item.consumed_cost > 0 ? ` ($${item.consumed_cost.toFixed(2)})` : ''}</div>` : '';
      let wastedStr = item.wasted_qty > 0 ? `<div style="color:var(--danger-color);">🗑️ Wasted: <strong>${item.wasted_qty} ${item.unit}</strong>${item.wasted_cost > 0 ? ` ($${item.wasted_cost.toFixed(2)})` : ''}</div>` : '';
      
      html += `
        <div style="border-bottom: 1px solid var(--border-color); padding: 12px 0;">
          <div style="font-weight: bold; font-size: 15px; margin-bottom: 4px;">${escapeHtml(item.name)}</div>
          ${consumedStr}
          ${wastedStr}
        </div>
      `;
    });
    
    resultsDiv.innerHTML = html;
    
  } catch (err) {
    resultsDiv.innerHTML = '<div class="empty-state"><p style="color:red;">Error loading report.</p></div>';
  }
}

function switchView(viewName) {
  if (!viewName) return;
  state.currentView = viewName;

  document.getElementById('view-inventory').style.display = viewName === 'inventory' ? 'block' : 'none';
  document.getElementById('view-expiring').style.display = viewName === 'expiring' ? 'block' : 'none';
  document.getElementById('view-stats').style.display = viewName === 'stats' ? 'block' : 'none';
  document.getElementById('view-grocery').style.display = viewName === 'grocery' ? 'block' : 'none';

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName === 'inventory') {
    document.getElementById('header-location').textContent =
      state.currentLocation.charAt(0).toUpperCase() + state.currentLocation.slice(1);
    renderInventory();
  } else if (viewName === 'expiring') {
    document.getElementById('header-location').textContent = 'Expiring Soon';
    renderExpiring();
  } else if (viewName === 'grocery') {
    document.getElementById('header-location').textContent = 'Grocery List';
    renderGroceryList();
  } else if (viewName === 'stats') {
    document.getElementById('header-location').textContent = 'Statistics';
    renderStats();
  }
}

// =======================
// Modal Helpers
// =======================
async function openItemForm(itemId = null, prefillData = null) {
  const modal = document.getElementById('modal-item-form');
  const title = document.getElementById('item-form-title');
  const catSelect = document.getElementById('item-category');

  catSelect.innerHTML = getAllCategories().map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
  const previewDiv = document.getElementById('item-image-preview');

  if (itemId) {
    title.textContent = 'Edit Item';
    const item = state.items.find(i => i.id == itemId) || await fetchItem(itemId);
    if (!item) {
      showToast('Item not found', 'error');
      return;
    }
    state.editingItem = item;

    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category || 'Other';
    document.getElementById('item-quantity').value = item.quantity || 1;
    document.getElementById('item-unit').value = item.unit || 'pcs';
    document.getElementById('item-unit-cost').value = item.unit_cost !== null ? item.unit_cost : '';
    document.getElementById('item-expiry').value = item.expiry_date || '';

    const addedDisplay = document.getElementById('item-added-display');
    const addedTime = document.getElementById('item-added-time');
    if (addedDisplay && addedTime && item.date_added) {
      addedTime.textContent = formatDateTime(item.date_added);
      addedDisplay.style.display = 'block';
    }

    document.querySelectorAll('#form-location .segment').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === item.location);
    });

    const deleteBtn = document.getElementById('btn-delete-mistake');
    if (deleteBtn) {
      deleteBtn.style.display = 'block';
    }

    if (item.image_url) {
      previewDiv.querySelector('img').src = item.image_url;
      previewDiv.style.display = 'block';
      document.getElementById('btn-set-photo').style.display = 'none';
    } else {
      previewDiv.style.display = 'none';
      document.getElementById('btn-set-photo').style.display = 'block';
    }

  } else {
    title.textContent = 'Add Item';
    state.editingItem = null;

    document.getElementById('item-name').value = prefillData ? (prefillData.name || '') : '';
    document.getElementById('item-category').value = (prefillData && prefillData.category) ? prefillData.category : 'Other';
    document.getElementById('item-quantity').value = '1';
    document.getElementById('item-unit').value = 'pcs';
    document.getElementById('item-unit-cost').value = '';
    document.getElementById('item-expiry').value = '';

    const addedDisplay = document.getElementById('item-added-display');
    if (addedDisplay) {
      addedDisplay.style.display = 'none';
    }

    document.querySelectorAll('#form-location .segment').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === state.currentLocation);
    });

    const deleteBtn = document.getElementById('btn-delete-mistake');
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }

    if (prefillData && prefillData.image_url) {
      previewDiv.querySelector('img').src = prefillData.image_url;
      previewDiv.style.display = 'block';
      document.getElementById('btn-set-photo').style.display = 'none';
    } else {
      previewDiv.style.display = 'none';
      document.getElementById('btn-set-photo').style.display = 'block';
    }
  }

  modal.style.display = 'flex';
}

function closeItemForm() {
  document.getElementById('modal-item-form').style.display = 'none';
  state.editingItem = null;
}

function openLogModal(itemId, itemName, currentQty, unit) {
  const modal = document.getElementById('modal-log');
  document.getElementById('log-item-name').textContent = itemName;
  
  const amountInput = document.getElementById('log-amount');
  amountInput.value = currentQty;
  amountInput.max = currentQty;
  
  document.getElementById('log-unit-label').textContent = unit || 'pcs';
  
  modal.dataset.itemId = itemId;
  modal.style.display = 'flex';
}

function closeLogModal() {
  document.getElementById('modal-log').style.display = 'none';
}

// =======================
// Event Setup
// =======================
function setupEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('#inventory-locations .segment').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#inventory-locations .segment').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.currentLocation = e.target.dataset.loc;
      renderInventory();
    });
  });

  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value;
      renderInventory();
    }, 300);
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.currentSort = e.target.value;
    renderInventory();
  });

  document.getElementById('fab-add').addEventListener('click', () => {
    startScanning();
  });

  document.getElementById('close-scanner').addEventListener('click', stopScanning);

  document.getElementById('manual-entry-btn').addEventListener('click', () => {
    stopScanning();
    openItemForm();
  });

  // History features
  const catFilter = document.getElementById('history-filter-category');
  if (catFilter) {
    getAllCategories().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name;
      opt.textContent = `${cat.emoji} ${cat.name}`;
      catFilter.appendChild(opt);
    });
    catFilter.addEventListener('change', renderHistory);
  }
  
  const typeFilter = document.getElementById('history-filter-type');
  if (typeFilter) {
    typeFilter.addEventListener('change', renderHistory);
  }
  
  const closeHistoryBtn = document.getElementById('close-history-info');
  if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
      document.getElementById('modal-history-info').style.display = 'none';
    });
  }
  
  // Custom Report features
  const openReportBtn = document.getElementById('btn-open-report');
  if (openReportBtn) {
    openReportBtn.addEventListener('click', () => {
      document.getElementById('report-results').innerHTML = '';
      
      // Auto fill dates: Default start to 30 days ago, end to today
      const today = new Date();
      const pastMonth = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
      document.getElementById('report-start').value = pastMonth.toISOString().split('T')[0];
      document.getElementById('report-end').value = today.toISOString().split('T')[0];
      
      document.getElementById('modal-report').style.display = 'flex';
      generateCustomReport();
    });
  }
  
  const generateReportBtn = document.getElementById('btn-generate-report');
  if (generateReportBtn) {
    generateReportBtn.addEventListener('click', generateCustomReport);
  }
  
  const closeReportBtn = document.getElementById('close-report');
  if (closeReportBtn) {
    closeReportBtn.addEventListener('click', () => {
      document.getElementById('modal-report').style.display = 'none';
    });
  }

  document.getElementById('scanner-file').addEventListener('change', handlePhotoFallback);
  
  // Custom Photo Upload handlers
  const handlePhotoUpload = () => {
    document.getElementById('item-image-file').click();
  };
  
  document.getElementById('btn-set-photo').addEventListener('click', handlePhotoUpload);
  document.getElementById('btn-change-photo').addEventListener('click', handlePhotoUpload);
  
  document.getElementById('item-image-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export base64 (jpeg, 0.7 quality)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        // Display preview
        const previewDiv = document.getElementById('item-image-preview');
        previewDiv.querySelector('img').src = dataUrl;
        previewDiv.style.display = 'block';
        document.getElementById('btn-set-photo').style.display = 'none';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  });

  document.getElementById('close-item-form').addEventListener('click', closeItemForm);

  document.querySelectorAll('#form-location .segment').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#form-location .segment').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  document.getElementById('item-category').addEventListener('change', (e) => {
    if (e.target.value === 'Dish') {
      document.getElementById('item-quantity').value = 100;
      document.getElementById('item-unit').value = '%';
      document.getElementById('item-unit-cost').value = '';
    }
  });

  document.getElementById('save-item-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('item-name');
    if (!nameInput.value.trim()) {
      showToast('Name is required', 'error');
      return;
    }

    const activeLocBtn = document.querySelector('#form-location .segment.active');
    
    let uCost = document.getElementById('item-unit-cost').value;
    uCost = uCost ? parseFloat(uCost) : null;

    const itemData = {
      name: nameInput.value.trim(),
      location: activeLocBtn ? activeLocBtn.dataset.val : 'fridge',
      category: document.getElementById('item-category').value,
      quantity: parseFloat(document.getElementById('item-quantity').value || 1),
      unit: document.getElementById('item-unit').value,
      unit_cost: uCost,
      expiry_date: document.getElementById('item-expiry').value || null,
      barcode: state.scannedBarcode || null
    };

    // Include EXACT local time in ISO format to satisfy user request
    if (!state.editingItem) {
      itemData.date_added = new Date().toISOString(); 
    }

    const previewImg = document.querySelector('#item-image-preview img');
    if (previewImg && previewImg.src && document.getElementById('item-image-preview').style.display !== 'none') {
      itemData.image_url = previewImg.src;
    }

    try {
      if (state.editingItem) {
        await updateItem(state.editingItem.id, itemData);
        showToast('Item updated!');
      } else {
        await createItem(itemData);
        showToast('Item added!');
      }
      closeItemForm();
      if (state.currentView === 'inventory') renderInventory();
      if (state.currentView === 'expiring') renderExpiring();
    } catch (err) {
      showToast('Failed to save item', 'error');
    }
  });

  const deleteBtn = document.getElementById('btn-delete-mistake');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!state.editingItem) return;
      if (confirm('Are you sure you want to delete this item? It will not be logged in your stats.')) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/items/${state.editingItem.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'mistake' })
          });
          if (!response.ok) throw new Error('Failed to delete');
          showToast('Item deleted completely.');
          closeItemForm();
          if (state.currentView === 'inventory') renderInventory();
          if (state.currentView === 'expiring') renderExpiring();
        } catch (err) {
          showToast('Failed to delete item', 'error');
        }
      }
    });
  }

  // Log Modal
  document.getElementById('btn-cancel-log').addEventListener('click', closeLogModal);

  const handleLog = async (reason) => {
    const modal = document.getElementById('modal-log');
    const id = modal.dataset.itemId;
    const amount = parseFloat(document.getElementById('log-amount').value);
    
    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    try {
      await logItemActivity(id, reason, amount);
      showToast(`Logged ${amount} as ${reason}`);
      closeLogModal();
      if (state.currentView === 'inventory') renderInventory();
      if (state.currentView === 'expiring') renderExpiring();
      if (state.currentView === 'stats') renderStats();
    } catch (err) {
      showToast('Failed to log activity', 'error');
    }
  };

  document.getElementById('btn-consumed').addEventListener('click', () => handleLog('consumed'));
  document.getElementById('btn-wasted').addEventListener('click', () => handleLog('wasted'));
}

// =======================
// Initialization
// =======================
document.addEventListener('DOMContentLoaded', () => {
  renderCategoryChips();
  setupEvents();
  setupAuthEvents();
  checkAuth();
});




// =======================
// Grocery List
// =======================
async function renderGroceryList() {
  const container = document.getElementById('grocery-list');
  const emptyState = document.getElementById('grocery-empty');
  container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  try {
    const res = await window.fetch(API_BASE_URL + '/api/grocery');
    if (!res.ok) throw new Error('Failed to fetch grocery list');
    const items = await res.json();
    
    container.innerHTML = '';
    if (items.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';
        if (item.is_purchased) {
          card.style.opacity = '0.6';
          card.style.textDecoration = 'line-through';
        }
        
        const cat = getAllCategories().find(c => c.name === item.category) || getAllCategories()[getAllCategories().length - 1];
        
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; cursor: pointer; flex: 1;" onclick="toggleGroceryItem(${item.id})">
            <div style="font-size: 24px;">${item.is_purchased ? '✅' : '⬜'}</div>
            <div>
              <div class="item-name">${item.name}</div>
              <div class="item-category" style="background-color: ${cat.color}20; color: ${cat.color}">${cat.emoji} ${cat.name}</div>
            </div>
          </div>
          <button class="btn btn-outline" style="border:none; color: var(--danger);" onclick="deleteGroceryItem(${item.id})">🗑️</button>
        `;
        container.appendChild(card);
      });
    }
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><p>Error loading list.</p></div>';
  }
}

async function addGroceryItem(name) {
  try {
    const res = await window.fetch(API_BASE_URL + '/api/grocery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to add');
    renderGroceryList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleGroceryItem(id) {
  try {
    const res = await window.fetch(API_BASE_URL + '/api/grocery/' + id, { method: 'PUT' });
    if (!res.ok) throw new Error('Failed to update');
    renderGroceryList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteGroceryItem(id) {
  try {
    const res = await window.fetch(API_BASE_URL + '/api/grocery/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    renderGroceryList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('btn-add-grocery').addEventListener('click', () => {
  const input = document.getElementById('grocery-input');
  const name = input.value.trim();
  if (name) {
    addGroceryItem(name);
    input.value = '';
  }
});

document.getElementById('grocery-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btn-add-grocery').click();
  }
});

// =======================
// Receipt Scanner
// =======================
let scannedReceiptItems = [];

document.getElementById('fab-receipt').addEventListener('click', () => {
  document.getElementById('receipt-upload-area').style.display = 'block';
  document.getElementById('receipt-loading').style.display = 'none';
  document.getElementById('receipt-results').style.display = 'none';
  document.getElementById('modal-receipt').style.display = 'flex';
});

document.getElementById('close-receipt').addEventListener('click', () => {
  document.getElementById('modal-receipt').style.display = 'none';
  document.getElementById('receipt-file').value = '';
});

document.getElementById('btn-take-receipt').addEventListener('click', () => {
  const fileInput = document.getElementById('receipt-file');
  fileInput.removeAttribute('capture');
  fileInput.setAttribute('capture', 'environment');
  fileInput.click();
});

document.getElementById('btn-pick-receipt').addEventListener('click', () => {
  const fileInput = document.getElementById('receipt-file');
  fileInput.removeAttribute('capture');
  fileInput.click();
});

document.getElementById('receipt-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  document.getElementById('receipt-upload-area').style.display = 'none';
  document.getElementById('receipt-loading').style.display = 'block';

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const base64Image = event.target.result;
      
      const res = await window.fetch(API_BASE_URL + '/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, mime_type: file.type })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to scan receipt');
      }
      
      const data = await res.json();
      scannedReceiptItems = data.items || [];
      renderReceiptResults();
    } catch (err) {
      showToast(err.message || 'Failed to scan receipt', 'error');
      document.getElementById('receipt-loading').style.display = 'none';
      document.getElementById('receipt-upload-area').style.display = 'block';
    }
  };
  reader.onerror = () => {
    showToast('Failed to read image file', 'error');
    document.getElementById('receipt-loading').style.display = 'none';
    document.getElementById('receipt-upload-area').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

function renderReceiptResults() {
  document.getElementById('receipt-loading').style.display = 'none';
  document.getElementById('receipt-results').style.display = 'block';
  
  const list = document.getElementById('receipt-items-list');
  list.innerHTML = '';
  
  if (scannedReceiptItems.length === 0) {
    list.innerHTML = '<p>No items found on this receipt.</p>';
    document.getElementById('btn-add-receipt-items').style.display = 'none';
    return;
  }
  
  document.getElementById('btn-add-receipt-items').style.display = 'block';
  
  scannedReceiptItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginBottom = '8px';
    row.style.padding = '8px';
    row.style.border = '1px solid var(--border-color)';
    row.style.borderRadius = '8px';
    
    const safeName = (item.name || '').replace(/</g, "&lt;");
    const safeCat = (item.category || '').replace(/</g, "&lt;");
    
    row.innerHTML = `<input type="checkbox" id="receipt-item-${index}" checked style="width: 20px; height: 20px;">
      <div style="flex: 1;">
        <div style="font-weight: bold; font-size: 14px;">${safeName}</div>
        <div style="font-size: 12px; color: var(--text-light);">${safeCat} &bull; Qty: ${item.quantity} &bull; $${item.unit_cost}</div>
      </div>`;
    list.appendChild(row);
  });
}

document.querySelectorAll('#receipt-location .segment').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('#receipt-location .segment').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  });
});

document.getElementById('btn-add-receipt-items').addEventListener('click', async () => {
  const location = document.querySelector('#receipt-location .segment.active').dataset.loc;
  const btn = document.getElementById('btn-add-receipt-items');
  btn.disabled = true;
  btn.textContent = 'Adding...';
  
  try {
    let addedCount = 0;
    for (let i = 0; i < scannedReceiptItems.length; i++) {
      const checkbox = document.getElementById(`receipt-item-${i}`);
      if (checkbox && checkbox.checked) {
        const item = scannedReceiptItems[i];
        await window.fetch(API_BASE_URL + '/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            location: location,
            unit_cost: item.unit_cost
          })
        });
        addedCount++;
      }
    }
    showToast(`Added ${addedCount} items to ${location}!`);
    document.getElementById('modal-receipt').style.display = 'none';
    if (state.currentView === 'inventory') renderInventory();
  } catch (err) {
    showToast('Error adding items: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Selected Items';
  }
});


// =======================
// Dynamic UI & Settings
// =======================

function renderDynamicUI() {
  const locs = getAllLocations();
  
  // Inventory tabs
  const invLocs = document.getElementById('inventory-locations');
  if(invLocs) {
    invLocs.innerHTML = locs.map(l => `<button class="segment ${state.currentLocation === l ? 'active' : ''}" data-loc="${l}">${l.charAt(0).toUpperCase() + l.slice(1)}</button>`).join('');
    invLocs.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        invLocs.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.currentLocation = e.target.dataset.loc;
        renderInventory();
      });
    });
  }

  // Form locations
  const formLocs = document.getElementById('form-location');
  if(formLocs) {
    formLocs.innerHTML = locs.map(l => `<button class="segment" data-val="${l}">${l.charAt(0).toUpperCase() + l.slice(1)}</button>`).join('');
    formLocs.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        formLocs.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  }
  
  // Receipt locations
  const recLocs = document.getElementById('receipt-location');
  if(recLocs) {
    recLocs.innerHTML = locs.map(l => `<button class="segment" data-loc="${l}">${l.charAt(0).toUpperCase() + l.slice(1)}</button>`).join('');
    recLocs.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        recLocs.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
    if(recLocs.firstElementChild && !recLocs.querySelector('.active')) recLocs.firstElementChild.classList.add('active');
  }

  // Form categories select
  const catSelect = document.getElementById('item-category');
  if(catSelect) {
    const currentVal = catSelect.value;
    catSelect.innerHTML = getAllCategories().map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
    if(currentVal) catSelect.value = currentVal;
  }
}

document.getElementById('btn-open-settings').addEventListener('click', () => {
  document.getElementById('modal-account').style.display = 'none';
  document.getElementById('old-password').value = '';
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  renderSettingsLists();
  document.getElementById('modal-settings').style.display = 'flex';
});

document.getElementById('close-settings').addEventListener('click', () => {
  document.getElementById('modal-settings').style.display = 'none';
});

function renderSettingsLists() {
  const locList = document.getElementById('settings-locations-list');
  locList.innerHTML = customLocations.map((loc, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #eee;">
      <span>${loc.charAt(0).toUpperCase() + loc.slice(1)}</span>
      <button onclick="removeCustomLocation(${i})" style="background:none; border:none; color:var(--danger); font-size:16px;">×</button>
    </div>
  `).join('');

  const catList = document.getElementById('settings-categories-list');
  catList.innerHTML = customCategories.map((cat, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #eee;">
      <div>
        <span style="background:${cat.color}20; color:${cat.color}; padding: 2px 6px; border-radius: 12px; font-size: 12px;">${cat.emoji} ${cat.name}</span>
      </div>
      <button onclick="removeCustomCategory(${i})" style="background:none; border:none; color:var(--danger); font-size:16px;">×</button>
    </div>
  `).join('');
}

window.removeCustomLocation = (index) => {
  customLocations.splice(index, 1);
  renderSettingsLists();
};

window.removeCustomCategory = (index) => {
  customCategories.splice(index, 1);
  renderSettingsLists();
};

document.getElementById('btn-add-location').addEventListener('click', () => {
  const input = document.getElementById('new-location-name');
  const val = input.value.trim().toLowerCase();
  if (val) {
    if (!getAllLocations().includes(val)) {
      customLocations.push(val);
      input.value = '';
      renderSettingsLists();
    } else {
      showToast('Location already exists', 'error');
    }
  }
});

document.getElementById('btn-add-category').addEventListener('click', () => {
  const name = document.getElementById('new-cat-name').value.trim();
  const emoji = document.getElementById('new-cat-emoji').value.trim() || '🏷️';
  const color = document.getElementById('new-cat-color').value;
  if (name) {
    if (!getAllCategories().some(c => c.name.toLowerCase() === name.toLowerCase())) {
      customCategories.push({ name, emoji, color });
      document.getElementById('new-cat-name').value = '';
      document.getElementById('new-cat-emoji').value = '';
      renderSettingsLists();
    } else {
      showToast('Category already exists', 'error');
    }
  }
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-settings');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    const res = await window.fetch(API_BASE_URL + '/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferences: {
          locations: customLocations,
          categories: customCategories
        }
      })
    });
    if (!res.ok) throw new Error('Failed to save settings');
    
    showToast('Settings saved!');
    document.getElementById('modal-settings').style.display = 'none';
    
    if (!getAllLocations().includes(state.currentLocation)) {
      state.currentLocation = 'fridge';
    }
    
    renderDynamicUI();
    if (state.currentView === 'inventory') renderInventory();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});
