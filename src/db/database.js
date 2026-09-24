/**
 * Kalıcı JSON Veritabanı
 * Veriler: C:\Users\{kullanıcı}\AppData\Roaming\WhatsApp Mesaj Botu\
 * Uygulama kapatılıp açılsa bile tüm veriler korunur.
 */
const fs = require('fs');
const path = require('path');

// Veri dizini: Electron'dan env ile gelir, yoksa proje içi data/
const dataDir = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'BotData')
  : path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_FILE = path.join(dataDir, 'bot.json');

const DEFAULT_DB = {
  contacts: [],
  templates: [],
  campaigns: [],
  message_queue: [],
  message_logs: [],
  blacklist: [],
  settings: {
    daily_global_limit: '200',
    default_timezone: 'Europe/Istanbul',
    default_min_delay: '45',
    default_max_delay: '180',
    default_start_time: '09:00',
    default_end_time: '18:00',
    app_language: 'tr',
    blacklist_enabled: '1'
  },
  _counters: {
    contacts: 0, templates: 0, campaigns: 0,
    message_queue: 0, message_logs: 0, blacklist: 0
  }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return {
        ...DEFAULT_DB, ...parsed,
        settings: { ...DEFAULT_DB.settings, ...(parsed.settings || {}) },
        _counters: { ...DEFAULT_DB._counters, ...(parsed._counters || {}) }
      };
    }
  } catch (e) {
    console.error('[DB] Dosya okunamadı, yeniden başlatılıyor:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

let _db = loadDB();

// Debounced save — çok sık yazma işlemini önler
let _saveTimer = null;
function saveDB(immediate = false) {
  if (immediate) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2), 'utf-8'); }
    catch (e) { console.error('[DB] Kaydetme hatası:', e.message); }
    return;
  }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2), 'utf-8'); }
    catch (e) { console.error('[DB] Kaydetme hatası:', e.message); }
  }, 500);
}

function nextId(col) {
  _db._counters[col] = (_db._counters[col] || 0) + 1;
  return _db._counters[col];
}

function now() { return new Date().toISOString(); }

console.log(`[DB] ✓ Veritabanı yüklendi → ${DB_FILE}`);
console.log(`[DB]   ${_db.contacts.length} kişi | ${_db.campaigns.length} kampanya | ${_db.blacklist.length} kara listede`);

// ============================================================
// CONTACTS
// ============================================================
const contactsDB = {
  getAll(filters = {}) {
    let list = [..._db.contacts];
    if (filters.category) list = list.filter(c => c.category === filters.category);
    if (filters.status)   list = list.filter(c => c.status === filters.status);
    if (filters.has_whatsapp !== undefined && filters.has_whatsapp !== '') {
      list = list.filter(c => c.has_whatsapp === parseInt(filters.has_whatsapp));
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      list = list.filter(c =>
        (c.business_name || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s) ||
        (c.address || '').toLowerCase().includes(s)
      );
    }
    if (filters.limit) list = list.slice(0, filters.limit);
    return list.reverse();
  },

  insert(contacts) {
    const existing = new Set(_db.contacts.map(c => c.phone));
    let inserted = 0;
    for (const c of contacts) {
      if (existing.has(c.phone)) continue;
      _db.contacts.push({ id: nextId('contacts'), ...c, has_whatsapp: -1, status: 'pending', imported_at: now() });
      existing.add(c.phone);
      inserted++;
    }
    saveDB();
    return inserted;
  },

  updateWhatsappStatus(id, hasWhatsapp) {
    const c = _db.contacts.find(c => c.id === id);
    if (c) { c.has_whatsapp = hasWhatsapp ? 1 : 0; saveDB(); }
  },

  updateStatus(id, status) {
    const c = _db.contacts.find(c => c.id === id);
    if (c) { c.status = status; saveDB(); }
  },

  delete(id) { _db.contacts = _db.contacts.filter(c => c.id !== id); saveDB(); },
  deleteAll() { _db.contacts = []; saveDB(); },
  
  deleteNoWhatsapp() {
    const noWaContacts = _db.contacts.filter(c => c.has_whatsapp === 0);
    const noWaIds = new Set(noWaContacts.map(c => c.id));
    
    // Numaraları sil
    _db.contacts = _db.contacts.filter(c => c.has_whatsapp !== 0);
    
    // Mesaj kuyruğundan da bu kişilere ait bekleyen işlemleri temizle
    _db.message_queue = _db.message_queue.filter(q => !noWaIds.has(q.contact_id));
    
    saveDB(true);
    return noWaContacts.length;
  },

  getCategories() {
    return [...new Set(_db.contacts.map(c => c.category).filter(Boolean))].sort().map(c => ({ category: c }));
  },

  getStats() {
    return {
      total:        _db.contacts.length,
      has_whatsapp: _db.contacts.filter(c => c.has_whatsapp === 1).length,
      no_whatsapp:  _db.contacts.filter(c => c.has_whatsapp === 0).length,
      unchecked:    _db.contacts.filter(c => c.has_whatsapp === -1).length,
      sent:         _db.contacts.filter(c => c.status === 'sent').length,
      pending:      _db.contacts.filter(c => c.status === 'pending').length
    };
  }
};

// ============================================================
// TEMPLATES
// ============================================================
const templatesDB = {
  getAll() { return [..._db.templates].reverse(); },
  getById(id) { return _db.templates.find(t => t.id === id); },
  create(data) {
    const id = nextId('templates');
    _db.templates.push({ id, ...data, created_at: now(), updated_at: now() });
    saveDB();
    return { lastInsertRowid: id };
  },
  update(id, data) {
    const i = _db.templates.findIndex(t => t.id === id);
    if (i >= 0) { _db.templates[i] = { ..._db.templates[i], ...data, updated_at: now() }; saveDB(); }
  },
  delete(id) { _db.templates = _db.templates.filter(t => t.id !== id); saveDB(); }
};

// ============================================================
// CAMPAIGNS
// ============================================================
const campaignsDB = {
  getAll() {
    return [..._db.campaigns].reverse().map(c => ({
      ...c,
      template_name: (_db.templates.find(t => t.id === c.template_id) || {}).name || null
    }));
  },
  getById(id) { return _db.campaigns.find(c => c.id === id); },
  create(data) {
    const id = nextId('campaigns');
    _db.campaigns.push({ id, ...data, status: data.status || 'draft', created_at: now(), updated_at: now() });
    saveDB();
    return { lastInsertRowid: id };
  },
  update(id, data) {
    const i = _db.campaigns.findIndex(c => c.id === id);
    if (i >= 0) { _db.campaigns[i] = { ..._db.campaigns[i], ...data, updated_at: now() }; saveDB(); }
  },
  delete(id) { _db.campaigns = _db.campaigns.filter(c => c.id !== id); saveDB(); },
  updateStatus(id, status) {
    const c = _db.campaigns.find(c => c.id === id);
    if (c) { c.status = status; c.updated_at = now(); saveDB(); }
  }
};

// ============================================================
// MESSAGE QUEUE
// ============================================================
const queueDB = {
  getAll(filters = {}) {
    let list = [..._db.message_queue];
    if (filters.status)      list = list.filter(q => q.status === filters.status);
    if (filters.campaign_id) list = list.filter(q => q.campaign_id === parseInt(filters.campaign_id));
    return list.slice(-500).reverse().map(q => ({
      ...q,
      business_name: (_db.contacts.find(c => c.id === q.contact_id) || {}).business_name || null
    }));
  },

  addToQueue(items) {
    // Kara listedekileri eklemeden önce filtrele
    const blacklisted = new Set(_db.blacklist.map(b => b.phone));
    for (const item of items) {
      if (blacklisted.has(item.phone)) continue; // KARA LİSTEDE — EKLEME
      _db.message_queue.push({ id: nextId('message_queue'), ...item, status: 'pending', retry_count: 0, created_at: now() });
    }
    saveDB();
  },

  getNext(campaignId = null) {
    const nowStr = now();
    return _db.message_queue.find(q =>
      q.status === 'pending' && 
      (!q.scheduled_at || q.scheduled_at <= nowStr) &&
      (campaignId ? q.campaign_id === campaignId : true)
    ) || null;
  },

  updateStatus(id, status, error = null) {
    const q = _db.message_queue.find(q => q.id === id);
    if (q) {
      q.status = status;
      if (status === 'sent') q.sent_at = now();
      if (error) q.error_message = error;
      saveDB();
    }
  },

  // ★ KARA LİSTE: Numara eklendiğinde tüm bekleyen mesajları anında engelle
  blockByPhone(phone) {
    let blocked = 0;
    _db.message_queue.forEach(q => {
      if (q.phone === phone && q.status === 'pending') {
        q.status = 'blocked';
        q.error_message = '🚫 Kara listede — gönderim kalıcı olarak engellendi';
        blocked++;
      }
    });
    if (blocked > 0) {
      console.log(`[DB] Kara liste: ${phone} için ${blocked} bekleyen mesaj engellendi`);
      saveDB(true); // Anında kaydet
    }
    return blocked;
  },

  getCampaignContactIds(campaignId) {
    return _db.message_queue
      .filter(q => q.campaign_id === campaignId)
      .map(q => q.contact_id);
  },

  incrementRetry(id) {
    const q = _db.message_queue.find(q => q.id === id);
    if (q) {
      q.retry_count = (q.retry_count || 0) + 1;
      saveDB();
      return q.retry_count;
    }
    return 0;
  },

  getStats() {
    return {
      total:   _db.message_queue.length,
      sent:    _db.message_queue.filter(q => q.status === 'sent').length,
      failed:  _db.message_queue.filter(q => q.status === 'failed').length,
      blocked: _db.message_queue.filter(q => q.status === 'blocked').length,
      pending: _db.message_queue.filter(q => q.status === 'pending').length
    };
  },

  clearAll() {
    _db.message_queue = [];
    saveDB(true);
  },

  getTodaySentCount() {
    const today = new Date().toISOString().split('T')[0];
    return { count: _db.message_queue.filter(q => q.status === 'sent' && (q.sent_at || '').startsWith(today)).length };
  },

  getTodayCampaignSent(campaignId) {
    const today = new Date().toISOString().split('T')[0];
    return _db.message_queue.filter(q =>
      q.campaign_id === campaignId && q.status === 'sent' && (q.sent_at || '').startsWith(today)
    ).length;
  }
};

// ============================================================
// SETTINGS
// ============================================================
const settingsDB = {
  get: (key) => _db.settings[key] ?? null,
  set: (key, value) => { _db.settings[key] = String(value); saveDB(); },
  getAll: () => ({ ..._db.settings })
};

// ============================================================
// BLACKLIST — Kalıcı kara liste
// ============================================================
const blacklistDB = {
  getAll: () => [..._db.blacklist].reverse(),

  add(phone, reason = '') {
    // Zaten varsa ekleme
    if (_db.blacklist.find(b => b.phone === phone)) return false;
    _db.blacklist.push({ id: nextId('blacklist'), phone, reason, added_at: now() });
    saveDB(true); // Anında kaydet
    console.log(`[DB] 🚫 Kara listeye eklendi: ${phone} (${reason || 'sebep belirtilmedi'})`);
    return true;
  },

  remove(id) { _db.blacklist = _db.blacklist.filter(b => b.id !== id); saveDB(); },

  // ★ Her mesaj gönderiminden önce bu kontrol yapılır
  isBlacklisted(phone) {
    return !!_db.blacklist.find(b => b.phone === phone);
  }
};

// ============================================================
// LOGS
// ============================================================
const logsDB = {
  add(data) {
    _db.message_logs.push({ id: nextId('message_logs'), ...data, sent_at: now() });
    if (_db.message_logs.length > 5000) _db.message_logs = _db.message_logs.slice(-5000);
    saveDB();
  },
  getRecent: (limit = 100) => [..._db.message_logs].reverse().slice(0, limit),
  getDailyStats() {
    const byDate = {};
    _db.message_logs.forEach(l => {
      if (!l.sent_at) return;
      const date = l.sent_at.split('T')[0];
      if (!byDate[date]) byDate[date] = { date, total: 0, sent: 0, failed: 0 };
      byDate[date].total++;
      if (l.status === 'sent')   byDate[date].sent++;
      if (l.status === 'failed') byDate[date].failed++;
    });
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }
};

const db = { data: _db, file: DB_FILE };
module.exports = { db, contactsDB, templatesDB, campaignsDB, queueDB, settingsDB, blacklistDB, logsDB };
