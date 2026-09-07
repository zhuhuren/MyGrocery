import sys

receipt_logic = """
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
  e.target.value = ''; // Reset
  
  document.getElementById('receipt-upload-area').style.display = 'none';
  document.getElementById('receipt-loading').style.display = 'block';

  try {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Image = event.target.result;
      
      const res = await window.fetch(API_BASE_URL + '/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, mime_type: file.type })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to scan receipt');
      }
      
      const data = await res.json();
      scannedReceiptItems = data.items || [];
      renderReceiptResults();
    };
    reader.readAsDataURL(file);
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('receipt-loading').style.display = 'none';
    document.getElementById('receipt-upload-area').style.display = 'block';
  }
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
    
    // Fallback variables for template literal syntax escaping issue
    const id = "receipt-item-" + index;
    
    row.innerHTML = '<input type="checkbox" id="' + id + '" checked style="width: 20px; height: 20px;">' +
      '<div style="flex: 1;">' +
        '<div style="font-weight: bold; font-size: 14px;">' + item.name + '</div>' +
        '<div style="font-size: 12px; color: var(--text-light);">' + item.category + ' • Qty: ' + item.quantity + ' • $' + item.unit_cost + '</div>' +
      '</div>';
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
      const checkbox = document.getElementById("receipt-item-" + i);
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
    showToast('Added ' + addedCount + ' items to ' + location + '!');
    document.getElementById('modal-receipt').style.display = 'none';
    if (state.currentView === 'inventory') renderInventory();
  } catch (err) {
    showToast('Error adding items: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Selected Items';
  }
});
"""

with open('app.js', 'a', encoding='utf-8') as f:
    f.write(receipt_logic)
