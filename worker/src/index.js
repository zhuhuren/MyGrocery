export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    try {
      if (path === '/api/households/create' && request.method === 'POST') {
        return await handleCreateHousehold(request, env.DB);
      }
      if (path === '/api/households/login' && request.method === 'POST') {
        return await handleLoginHousehold(request, env.DB);
      }

      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return errorResponse('Missing or invalid Authorization header', 401);
      }
      const token = atob(authHeader.split(' ')[1]);
      const [householdId, password] = token.split(':');
      if (!householdId || !password) return errorResponse('Invalid token format', 401);

      const household = await env.DB.prepare('SELECT * FROM households WHERE id = ? AND password_hash = ?').bind(householdId, password).first();
      if (!household) return errorResponse('Unauthorized', 401);

      const hhId = household.id;

      if (path === '/api/items' && request.method === 'GET') return await handleGetItems(request, env.DB, hhId);
      if (path === '/api/items' && request.method === 'POST') return await handlePostItem(request, env.DB, hhId);
      if (path.match(/^\/api\/items\/\d+\/log$/) && request.method === 'POST') return await handleLogItem(request, env.DB, path.split('/')[3], hhId);
      if (path.startsWith('/api/items/') && request.method === 'GET') return await handleGetItem(env.DB, path.split('/')[3], hhId);
      if (path.startsWith('/api/items/') && request.method === 'PUT') return await handlePutItem(request, env.DB, path.split('/')[3], hhId);
      if (path.startsWith('/api/items/') && request.method === 'DELETE') return await handleDeleteItem(request, env.DB, path.split('/')[3], hhId);
      if (path.startsWith('/api/lookup/') && request.method === 'GET') return await handleLookup(env.DB, path.split('/')[3], hhId);
      if (path === '/api/stats' && request.method === 'GET') return await handleStats(env.DB, hhId);
      if (path === '/api/expiring' && request.method === 'GET') return await handleExpiring(env.DB, hhId);
      if (path === '/api/report' && request.method === 'GET') return await handleReport(request, env.DB, hhId);
      if (path === '/api/grocery' && request.method === 'GET') return await handleGetGrocery(env.DB, hhId);
      if (path === '/api/grocery' && request.method === 'POST') return await handlePostGrocery(request, env.DB, hhId);
      if (path.startsWith('/api/grocery/') && request.method === 'PUT') return await handlePutGrocery(env.DB, path.split('/')[3], hhId);
      if (path.startsWith('/api/grocery/') && request.method === 'DELETE') return await handleDeleteGrocery(env.DB, path.split('/')[3], hhId);
      if (path === '/api/preferences' && request.method === 'GET') return await handleGetPreferences(env.DB, hhId);
      if (path === '/api/preferences' && request.method === 'PUT') return await handlePutPreferences(request, env.DB, hhId);
      if (path === '/api/households/password' && request.method === 'PUT') return await handleChangePassword(request, env.DB, hhId);
      if (path === '/api/scan-receipt' && request.method === 'POST') return await handleScanReceipt(request, env);
      
      return errorResponse('Not found', 404);
    } catch (e) {
      console.error(e);
      return errorResponse(e.message, 500);
    }
  }
};

async function handleCreateHousehold(request, db) {
  const body = await request.json();
  if (body.admin_code !== 'mygrocery2026') return errorResponse('Invalid Admin Code', 403);
  if (!body.name || !body.password) return errorResponse('Name and password required', 400);

  const existing = await db.prepare('SELECT id FROM households WHERE name = ?').bind(body.name).first();
  if (existing) return errorResponse('Household name already exists', 400);

  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO households (id, name, password_hash) VALUES (?, ?, ?)').bind(id, body.name, body.password).run();
  return jsonResponse({ id, name: body.name });
}

async function handleLoginHousehold(request, db) {
  const body = await request.json();
  if (!body.name || !body.password) return errorResponse('Name and password required', 400);

  const hh = await db.prepare('SELECT id, name FROM households WHERE name = ? AND password_hash = ?').bind(body.name, body.password).first();
  if (!hh) return errorResponse('Invalid name or password', 401);
  return jsonResponse({ id: hh.id, name: hh.name });
}

async function handleGetItems(request, db, hhId) {
  const url = new URL(request.url);
  const location = url.searchParams.get('location');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const sort = url.searchParams.get('sort') || 'date_added_desc';

  let query = 'SELECT * FROM items WHERE household_id = ?';
  const params = [hhId];

  if (location) { query += ' AND location = ?'; params.push(location); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (search) { query += ' AND name LIKE ?'; params.push('%' + search + '%'); }

  const sortMap = { 'expiry_asc': 'expiry_date ASC', 'expiry_desc': 'expiry_date DESC', 'name_asc': 'name ASC', 'name_desc': 'name DESC', 'date_added_desc': 'date_added DESC', 'category_asc': 'category ASC' };
  query += ' ORDER BY ' + (sortMap[sort] || sortMap['date_added_desc']);

  const { results } = await db.prepare(query).bind(...params).all();
  return jsonResponse(results || []);
}

async function handleGetItem(db, id, hhId) {
  const item = await db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ?').bind(id, hhId).first();
  return item ? jsonResponse(item) : errorResponse('Not found', 404);
}

async function handlePostItem(request, db, hhId) {
  const body = await request.json();
  if (!body.name) return errorResponse('Name required', 400);

  const result = await db.prepare(
    'INSERT INTO items (household_id, name, barcode, category, location, quantity, initial_quantity, unit, unit_cost, date_added, expiry_date, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(hhId, body.name, body.barcode || null, body.category || 'Other', body.location || 'fridge', body.quantity || 1, body.quantity || 1, body.unit || 'pcs', body.unit_cost || null, body.date_added || new Date().toISOString(), body.expiry_date || null, body.image_url || null).first();
  
  if (body.barcode) {
    await db.prepare('INSERT OR REPLACE INTO user_products (barcode, household_id, name, category, image_url) VALUES (?, ?, ?, ?, ?)').bind(body.barcode, hhId, body.name, body.category || 'Other', body.image_url || null).run();
  }
  return jsonResponse(result, 201);
}

async function handlePutItem(request, db, id, hhId) {
  const body = await request.json();
  const currentItem = await db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ?').bind(id, hhId).first();
  if (!currentItem) return errorResponse('Not found', 404);

  const updates = []; const params = [];
  ['name', 'category', 'location', 'quantity', 'unit', 'unit_cost', 'expiry_date', 'image_url', 'barcode'].forEach(field => {
    if (body[field] !== undefined) { updates.push(field + ' = ?'); params.push(body[field]); }
  });

  if (updates.length === 0) return jsonResponse(currentItem);
  params.push(id, hhId);
  const updatedItem = await db.prepare('UPDATE items SET ' + updates.join(', ') + ' WHERE id = ? AND household_id = ? RETURNING *').bind(...params).first();

  if (updatedItem.barcode) {
    await db.prepare('INSERT OR REPLACE INTO user_products (barcode, household_id, name, category, image_url) VALUES (?, ?, ?, ?, ?)').bind(updatedItem.barcode, hhId, updatedItem.name, updatedItem.category, updatedItem.image_url || null).run();
  }
  return jsonResponse(updatedItem);
}

async function handleLogItem(request, db, id, hhId) {
  const body = await request.json();
  if (!['consumed', 'wasted'].includes(body.action) || !body.amount || body.amount <= 0) return errorResponse('Invalid input', 400);

  const item = await db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ?').bind(id, hhId).first();
  if (!item) return errorResponse('Not found', 404);

  const costValue = item.unit_cost !== null ? (body.amount * item.unit_cost) : null;
  const percentage = item.initial_quantity > 0 ? (body.amount / item.initial_quantity) * 100 : 0;
  const newQty = item.quantity - body.amount;

  await db.prepare('INSERT INTO item_log (household_id, item_name, category, location, reason, logged_quantity, unit, cost_value, percentage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(hhId, item.name, item.category, item.location, body.action, body.amount, item.unit, costValue, percentage).run();

  if (newQty <= 0.001) {
    if (body.action === 'consumed') {
      await db.prepare('INSERT INTO grocery_list (household_id, name, category) VALUES (?, ?, ?)').bind(hhId, item.name, item.category).run();
    }
    await db.prepare('DELETE FROM items WHERE id = ? AND household_id = ?').bind(id, hhId).run();
    return jsonResponse({ deleted: true });
  } else {
    const updated = await db.prepare('UPDATE items SET quantity = ? WHERE id = ? AND household_id = ? RETURNING *').bind(newQty, id, hhId).first();
    return jsonResponse({ deleted: false, item: updated });
  }
}

async function handleDeleteItem(request, db, id, hhId) {
  const body = await request.json();
  const reason = body.reason || 'consumed';
  
  const item = await db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ?').bind(id, hhId).first();
  if (!item) return errorResponse('Not found', 404);

  if (reason !== 'mistake') {
    const costValue = item.unit_cost !== null ? (item.quantity * item.unit_cost) : null;
    const percentage = item.initial_quantity > 0 ? (item.quantity / item.initial_quantity) * 100 : 0;
    await db.prepare('INSERT INTO item_log (household_id, item_name, category, location, reason, logged_quantity, unit, cost_value, percentage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(hhId, item.name, item.category, item.location, reason, item.quantity, item.unit, costValue, percentage).run();
  }

  if (reason === 'consumed') {
    await db.prepare('INSERT INTO grocery_list (household_id, name, category) VALUES (?, ?, ?)').bind(hhId, item.name, item.category).run();
  }

  await db.prepare('DELETE FROM items WHERE id = ? AND household_id = ?').bind(id, hhId).run();
  return jsonResponse({ success: true });
}

async function handleLookup(db, barcode, hhId) {
  const cached = await db.prepare('SELECT * FROM user_products WHERE barcode = ? AND household_id = ?').bind(barcode, hhId).first();
  if (cached) return jsonResponse({ found: true, name: cached.name, category: cached.category, image_url: cached.image_url, source: 'local' });

  try {
    const response = await fetch('https://world.openfoodfacts.org/api/v2/product/' + barcode + '.json');
    if (!response.ok) return jsonResponse({ found: false });
    const data = await response.json();
    if (data.status === 1 && data.product) {
      return jsonResponse({ found: true, name: data.product.product_name_en || data.product.product_name || 'Unknown', category: 'Other', image_url: data.product.image_url || null, source: 'openfoodfacts' });
    }
  } catch (err) {}
  return jsonResponse({ found: false });
}

async function handleStats(db, hhId) {
  const consumedRes = await db.prepare(`SELECT SUM(cost_value) as tc, SUM(logged_quantity) as tq FROM item_log WHERE household_id = ? AND reason = 'consumed'`).bind(hhId).first();
  const wastedRes = await db.prepare(`SELECT SUM(cost_value) as tc, SUM(logged_quantity) as tq FROM item_log WHERE household_id = ? AND reason = 'wasted'`).bind(hhId).first();
  const recentLogs = await db.prepare(`SELECT * FROM item_log WHERE household_id = ? ORDER BY removed_at DESC LIMIT 20`).bind(hhId).all();

  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); sixMonthsAgo.setDate(1);
  const monthRes = await db.prepare(`SELECT strftime('%Y-%m', removed_at) as month, reason, SUM(cost_value) as sum_cost, SUM(percentage) as sum_pct FROM item_log WHERE household_id = ? AND removed_at >= ? GROUP BY month, reason ORDER BY month ASC`).bind(hhId, sixMonthsAgo.toISOString().split('T')[0]).all();
  
  const catRes = await db.prepare(`SELECT category, SUM(percentage) as sum_pct FROM item_log WHERE household_id = ? AND reason = 'wasted' GROUP BY category ORDER BY sum_pct DESC`).bind(hhId).all();

  return jsonResponse({ total_consumed_cost: consumedRes.tc||0, total_consumed_qty: consumedRes.tq||0, total_wasted_cost: wastedRes.tc||0, total_wasted_qty: wastedRes.tq||0, by_month: monthRes.results||[], category_waste: catRes.results||[], recent_logs: recentLogs.results||[] });
}

async function handleExpiring(db, hhId) {
  const { results } = await db.prepare(`SELECT * FROM items WHERE household_id = ? AND expiry_date IS NOT NULL AND expiry_date <= date('now', '+7 days') ORDER BY expiry_date ASC`).bind(hhId).all();
  const today = new Date(); today.setHours(0,0,0,0);
  return jsonResponse((results || []).map(i => ({ ...i, days_remaining: Math.ceil((new Date(i.expiry_date) - today) / 86400000) })));
}

async function handleReport(request, db, hhId) {
  const u = new URL(request.url);
  const start = u.searchParams.get('start'); const end = u.searchParams.get('end');
  const { results } = await db.prepare(`SELECT item_name, unit, reason, SUM(logged_quantity) as total_qty, SUM(cost_value) as total_cost FROM item_log WHERE household_id = ? AND removed_at >= ? AND removed_at <= ? GROUP BY item_name, unit, reason ORDER BY item_name ASC`).bind(hhId, start ? start+' 00:00:00' : '2000-01-01 00:00:00', end ? end+' 23:59:59' : '2999-12-31 23:59:59').all();
  return jsonResponse({ report: results || [] });
}

async function handleGetGrocery(db, hhId) {
  const { results } = await db.prepare(`SELECT * FROM grocery_list WHERE household_id = ? ORDER BY is_purchased ASC, added_at DESC`).bind(hhId).all();
  return jsonResponse(results || []);
}

async function handlePostGrocery(request, db, hhId) {
  const body = await request.json();
  if (!body.name) return errorResponse('Name required', 400);
  const result = await db.prepare(
    'INSERT INTO grocery_list (household_id, name, category) VALUES (?, ?, ?) RETURNING *'
  ).bind(hhId, body.name, body.category || 'Other').first();
  return jsonResponse(result, 201);
}

async function handlePutGrocery(db, id, hhId) {
  const item = await db.prepare('SELECT is_purchased FROM grocery_list WHERE id = ? AND household_id = ?').bind(id, hhId).first();
  if (!item) return errorResponse('Not found', 404);
  const newStatus = item.is_purchased ? 0 : 1;
  const updated = await db.prepare('UPDATE grocery_list SET is_purchased = ? WHERE id = ? AND household_id = ? RETURNING *').bind(newStatus, id, hhId).first();
  return jsonResponse(updated);
}

async function handleDeleteGrocery(db, id, hhId) {
  await db.prepare('DELETE FROM grocery_list WHERE id = ? AND household_id = ?').bind(id, hhId).run();
  return jsonResponse({ success: true });
}

async function handleScanReceipt(request, env) {
  const body = await request.json();
  if (!body.image) return errorResponse('Image data required', 400);

  const prompt = `You are a grocery receipt parser. Analyze this receipt image and extract all purchased items.

For each item, return:
- "name": a clean, readable product name (e.g. "Whole Milk" not "WHL MLK 2%")
- "category": one of EXACTLY these values: Dairy, Meat & Fish, Produce, Dish, Bakery & Grains, Frozen, Canned & Jarred, Beverages, Snacks, Condiments, Other
- "quantity": number purchased (default 1)
- "unit_cost": price per item in dollars as a number (e.g. 3.99)

Return ONLY a valid JSON array, no other text. Example:
[{"name": "Whole Milk", "category": "Dairy", "quantity": 1, "unit_cost": 4.29}]

If you cannot read the receipt or find no items, return an empty array: []`;

  try {
    const imageData = body.image.replace(/^data:image\/[a-z]+;base64,/, '');
    
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: body.mime_type || 'image/jpeg', data: imageData } }
            ]
          }]
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return errorResponse('Gemini API error: ' + errText, 500);
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const items = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return jsonResponse({ items });
  } catch (e) {
    return errorResponse('Failed to process receipt: ' + e.message, 500);
  }
}

async function handleGetPreferences(db, hhId) {
  const result = await db.prepare('SELECT preferences FROM households WHERE id = ?').bind(hhId).first();
  const prefs = result?.preferences ? JSON.parse(result.preferences) : {};
  return jsonResponse({ preferences: prefs });
}

async function handlePutPreferences(request, db, hhId) {
  const body = await request.json();
  const prefString = JSON.stringify(body.preferences || {});
  await db.prepare('UPDATE households SET preferences = ? WHERE id = ?').bind(prefString, hhId).run();
  return jsonResponse({ success: true, preferences: body.preferences });
}

async function handleChangePassword(request, db, hhId) {
  const body = await request.json();
  if (!body.new_password || body.new_password.length < 4) return errorResponse('Password must be at least 4 characters', 400);
  await db.prepare('UPDATE households SET password_hash = ? WHERE id = ?').bind(body.new_password, hhId).run();
  return jsonResponse({ success: true });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
function errorResponse(msg, status = 400) { return jsonResponse({ error: msg }, status); }
