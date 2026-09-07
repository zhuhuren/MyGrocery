const fs = require('fs');

const extraLogic = `
// =======================
// Dynamic UI & Settings
// =======================

function renderDynamicUI() {
  const locs = getAllLocations();
  
  // Inventory tabs
  const invLocs = document.getElementById('inventory-locations');
  if(invLocs) {
    invLocs.innerHTML = locs.map(l => \`<button class="segment \${state.currentLocation === l ? 'active' : ''}" data-loc="\${l}">\${l.charAt(0).toUpperCase() + l.slice(1)}</button>\`).join('');
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
    formLocs.innerHTML = locs.map(l => \`<button class="segment" data-val="\${l}">\${l.charAt(0).toUpperCase() + l.slice(1)}</button>\`).join('');
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
    recLocs.innerHTML = locs.map(l => \`<button class="segment" data-loc="\${l}">\${l.charAt(0).toUpperCase() + l.slice(1)}</button>\`).join('');
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
    catSelect.innerHTML = getAllCategories().map(c => \`<option value="\${c.name}">\${c.emoji} \${c.name}</option>\`).join('');
    if(currentVal) catSelect.value = currentVal;
  }
}

document.getElementById('btn-open-settings').addEventListener('click', () => {
  document.getElementById('modal-account').style.display = 'none';
  renderSettingsLists();
  document.getElementById('modal-settings').style.display = 'flex';
});

document.getElementById('close-settings').addEventListener('click', () => {
  document.getElementById('modal-settings').style.display = 'none';
});

function renderSettingsLists() {
  const locList = document.getElementById('settings-locations-list');
  locList.innerHTML = customLocations.map((loc, i) => \`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #eee;">
      <span>\${loc.charAt(0).toUpperCase() + loc.slice(1)}</span>
      <button onclick="removeCustomLocation(\${i})" style="background:none; border:none; color:var(--danger); font-size:16px;">×</button>
    </div>
  \`).join('');

  const catList = document.getElementById('settings-categories-list');
  catList.innerHTML = customCategories.map((cat, i) => \`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #eee;">
      <div>
        <span style="background:\${cat.color}20; color:\${cat.color}; padding: 2px 6px; border-radius: 12px; font-size: 12px;">\${cat.emoji} \${cat.name}</span>
      </div>
      <button onclick="removeCustomCategory(\${i})" style="background:none; border:none; color:var(--danger); font-size:16px;">×</button>
    </div>
  \`).join('');
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
`;

fs.appendFileSync('app.js', '\n' + extraLogic, 'utf8');
