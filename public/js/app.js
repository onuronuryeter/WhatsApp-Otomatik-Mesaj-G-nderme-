/* ============================================================
   WhatsApp Bot — Masaüstü Uygulama JS (IPC tabanlı)
   fetch() yok, web sunucu yok — sadece Electron IPC
   ============================================================ */

const api = window.electronAPI;

// ============================================================
// YARDIMCILAR
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function formatPhone(p) {
  if (!p) return '—';
  const s = String(p);
  if (s.startsWith('90') && s.length >= 12) return `+90 ${s.slice(2,5)} ${s.slice(5,8)} ${s.slice(8,10)} ${s.slice(10)}`;
  return s;
}

function debounce(fn, d = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }

let currentPage = 'dashboard';
function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  currentPage = page;
  const h = { dashboard: loadDashboard, whatsapp: loadWhatsAppPage, contacts: loadContacts,
               templates: loadTemplates, campaigns: loadCampaigns, queue: loadQueue,
               analytics: loadAnalytics, logs: loadLogs, blacklist: loadBlacklist, settings: loadSettings };
  if (h[page]) h[page]();
}

const TIMEZONES = ['Europe/Istanbul','Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow',
  'America/New_York','America/Chicago','America/Los_Angeles','America/Toronto','America/Sao_Paulo',
  'Asia/Dubai','Asia/Riyadh','Asia/Tehran','Asia/Baghdad','Asia/Karachi','Asia/Kolkata',
  'Asia/Tokyo','Asia/Shanghai','Asia/Singapore','Australia/Sydney','Africa/Cairo','Africa/Lagos','Pacific/Auckland'];

function populateTimezones(id) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = TIMEZONES.map(tz => `<option value="${tz}" ${tz==='Europe/Istanbul'?'selected':''}>${tz.replace('_',' ')}</option>`).join('');
}

// ============================================================
// TITLEBAR
// ============================================================
function initTitleBar() {
  document.getElementById('btn-minimize')?.addEventListener('click', () => api.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => api.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => api.close());
}

// ============================================================
// WHATSAPP DURUM YÖNETİMİ — IPC Events
// ============================================================
let waConnected = false;

function initIPCEvents() {
  api.onWaStatus((data) => updateWAStatus(data));
  api.onWaReady((data) => onWAReady(data));
  api.onMessageSent((data) => {
    addActivity({ type: 'sent', phone: data.phone });
    updateQueueBadge();
    if (currentPage === 'dashboard') refreshDashStats();
    if (currentPage === 'queue') loadQueue();
  });
  api.onSchedulerStatus((data) => updateSchedulerUI(data.running));
}

function updateWAStatus(data) {
  const dot  = document.getElementById('wa-dot');
  const text = document.getElementById('wa-status-text');
  const det  = document.getElementById('detail-status');

  const map = {
    connected:     { cls:'connected',  txt:'Bağlı ✓',         badge:'status-badge-connected' },
    connecting:    { cls:'connecting', txt:'Bağlanıyor...',    badge:'status-badge-connecting' },
    qr_ready:      { cls:'connecting', txt:'QR Taranıyor...',  badge:'status-badge-connecting' },
    authenticated: { cls:'connecting', txt:'Doğrulanıyor...',  badge:'status-badge-connecting' },
    disconnected:  { cls:'',           txt:'Bağlı Değil',      badge:'status-badge-disconnected' },
    auth_failure:  { cls:'error',      txt:'Kimlik Hatası',    badge:'status-badge-disconnected' },
    error:         { cls:'error',      txt:'Hata',             badge:'status-badge-disconnected' }
  };

  const s = map[data.status] || map.disconnected;
  if (dot) dot.className = `wa-dot ${s.cls}`;
  if (text) text.textContent = s.txt;
  if (det) { det.className = `status-value ${s.badge}`; det.textContent = s.txt; }

  waConnected = data.status === 'connected';

  // WA sayfası durum mesajı
  const msgEl = document.getElementById('wa-status-message');
  if (msgEl) {
    msgEl.textContent = data.message || '';
    msgEl.style.display = data.message ? 'block' : 'none';
  }

  // QR/bağlı/bekliyor durum gösterimi
  const stIdle  = document.getElementById('wa-idle-state');
  const stConn  = document.getElementById('wa-connected-state');
  const stWait  = document.getElementById('wa-waiting-state');

  if (data.status === 'connected') {
    if (stIdle)  stIdle.style.display  = 'none';
    if (stWait)  stWait.style.display  = 'none';
    if (stConn)  stConn.style.display  = 'flex';
  } else if (['connecting','qr_ready','authenticated'].includes(data.status)) {
  } else if (data.status === 'disconnected' || data.status === 'error' || data.status === 'auth_failure') {
    if (stConn)  stConn.style.display  = 'none';
    if (stWait)  stWait.style.display  = 'none';
    if (stIdle)  stIdle.style.display  = 'flex';
  } else {
    // connecting, qr_ready, authenticated
    if (stConn)  stConn.style.display  = 'none';
    if (stIdle)  stIdle.style.display  = 'none';
    if (stWait)  stWait.style.display  = 'flex';
  }

  // Butonlar
  document.getElementById('btn-wa-connect')?.style.setProperty('display', waConnected ? 'none' : 'flex');
  document.getElementById('btn-wa-disconnect')?.style.setProperty('display', waConnected ? 'flex' : 'none');

  // Zorla Bağlan Butonu (Sadece Doğrulanıyor aşamasında göster)
  const btnForce = document.getElementById('btn-wa-force-ready');
  if (btnForce) {
    btnForce.style.setProperty('display', data.status === 'authenticated' ? 'flex' : 'none');
  }
}

function onWAReady(data) {
  waConnected = true;
  updateWAStatus({ status: 'connected', message: `✓ Bağlandı: ${data.name} (+${data.phone})` });
  document.getElementById('wa-connected-name').textContent = data.name || '';
  document.getElementById('wa-connected-phone').textContent = `+${data.phone}`;
  document.getElementById('detail-phone').textContent = `+${data.phone}`;
  document.getElementById('detail-name').textContent = data.name;
  document.getElementById('detail-phone-row').style.display = 'flex';
  document.getElementById('detail-name-row').style.display = 'flex';
  showToast(`✓ WhatsApp bağlandı: ${data.name}`, 'success');
}

// ============================================================
// DASHBOARD
// ============================================================
let activityChart = null;

async function loadDashboard() {
  await refreshDashStats();
  await loadDashCampaigns();
  await loadActivityChart();
}

async function refreshDashStats() {
  const [cs, qs] = await Promise.all([api.getContactStats(), api.getQueueStats()]);
  if (cs) {
    setText('stat-total-contacts', cs.total || 0);
    setText('stat-has-whatsapp', cs.has_whatsapp || 0);
    document.getElementById('contacts-badge').textContent = cs.total || 0;
  }
  if (qs) {
    setText('stat-sent', qs.sent || 0);
    setText('stat-pending', qs.pending || 0);
    setText('stat-failed', qs.failed || 0);
    setText('stat-today', qs.todaySent || 0);
    document.getElementById('queue-badge').textContent = qs.pending || 0;
    updateSchedulerUI(qs.schedulerRunning);
  }
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

async function loadDashCampaigns() {
  const camps = await api.getCampaigns();
  const c = document.getElementById('dashboard-campaigns');
  if (!c) return;
  const active = (camps || []).filter(x => ['active','paused'].includes(x.status));
  if (!active.length) {
    c.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px">Aktif kampanya yok. <a href="#" onclick="navigateTo(\'campaigns\');return false" style="color:var(--accent-green)">Yeni kampanya oluştur →</a></p>';
    return;
  }
  c.innerHTML = active.map(x => `
    <div class="campaign-mini-card">
      <div class="cm-status-dot ${x.status}"></div>
      <div style="flex:1"><div class="cm-name">${x.name}</div><div class="cm-meta">${x.template_name||'Şablon yok'} • ${x.send_start_time}–${x.send_end_time}</div></div>
      <span class="badge ${x.status==='active'?'badge-green':'badge-amber'}">${x.status==='active'?'Aktif':'Duraklatıldı'}</span>
    </div>`).join('');
}

async function loadActivityChart() {
  const stats = await api.getDailyStats();
  if (!stats) return;
  const canvas = document.getElementById('activityChart');
  if (!canvas) return;
  const last7 = stats.slice(0,7).reverse();
  if (activityChart) { activityChart.destroy(); activityChart = null; }
  activityChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: last7.map(s => new Date(s.date).toLocaleDateString('tr-TR',{day:'2-digit',month:'short'})),
      datasets: [
        { label:'Gönderildi', data: last7.map(s=>s.sent||0), backgroundColor:'rgba(37,211,102,0.7)', borderRadius:6, borderSkipped:false },
        { label:'Başarısız',  data: last7.map(s=>s.failed||0), backgroundColor:'rgba(239,68,68,0.5)', borderRadius:6, borderSkipped:false }
      ]
    },
    options: {
      responsive:true,
      plugins:{ legend:{labels:{color:'#8b9abf',font:{family:'Inter',size:12}}}, tooltip:{backgroundColor:'#111827',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#f0f4ff',bodyColor:'#8b9abf'} },
      scales:{ x:{ticks:{color:'#8b9abf'},grid:{color:'rgba(255,255,255,0.04)'}}, y:{ticks:{color:'#8b9abf'},grid:{color:'rgba(255,255,255,0.04)'},beginAtZero:true} }
    }
  });
}

function addActivity({ type, phone }) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  const ic = type==='sent'?'sent':type==='failed'?'failed':'info';
  const it = type==='sent'?'✓':type==='failed'?'✕':'ℹ';
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `<div class="activity-icon ${ic}">${it}</div><div class="activity-text">${type==='sent'?'Gönderildi':'Başarısız'}: <strong>${formatPhone(phone)}</strong></div><div class="activity-time">${new Date().toLocaleTimeString('tr-TR')}</div>`;
  feed.insertBefore(item, feed.firstChild);
  if (feed.children.length > 20) feed.lastElementChild.remove();
}

// ============================================================
// WHATSAPP SAYFASI
// ============================================================
async function loadWhatsAppPage() {
  const status = await api.waStatus();
  if (status) updateWAStatus({ status: status.status, message: '' });
  if (status?.phoneInfo) onWAReady(status.phoneInfo);
}

function initWhatsAppPage() {
  document.getElementById('btn-wa-connect')?.addEventListener('click', async () => {
    updateWAStatus({ status: 'connecting', message: 'Chrome penceresi açılıyor...' });
    const r = await api.waConnect();
    if (!r?.success) { showToast('Bağlantı başlatılamadı: ' + (r?.error||''), 'error'); updateWAStatus({ status: 'disconnected', message: '' }); }
  });

  document.getElementById('btn-wa-disconnect')?.addEventListener('click', async () => {
    await api.waDisconnect();
    waConnected = false;
    document.getElementById('detail-phone-row').style.display = 'none';
    document.getElementById('detail-name-row').style.display = 'none';
    showToast('Bağlantı kesildi', 'warning');
  });

  document.getElementById('btn-wa-force-ready')?.addEventListener('click', async () => {
    updateWAStatus({ status: 'connected', message: 'Zorla bağlandı' });
    const r = await api.waForceReady();
    if (r?.success) {
      showToast('Bağlantı zorla kabul edildi!', 'success');
      if (r.phoneInfo) onWAReady(r.phoneInfo);
    }
  });

  document.getElementById('btn-check-number')?.addEventListener('click', async () => {
    const phone = document.getElementById('test-phone').value.trim();
    if (!phone) return showToast('Telefon numarası girin', 'warning');
    if (!waConnected) return showToast('WhatsApp bağlı değil', 'warning');
    const r = await api.waCheckNumber(phone);
    const el = document.getElementById('test-result');
    el.style.display = 'block';
    el.className = `test-result ${r?.hasWhatsApp ? 'success' : 'error'}`;
    el.textContent = r?.hasWhatsApp ? `✓ ${formatPhone(phone)} WhatsApp'ta kayıtlı` : `✕ ${formatPhone(phone)} WhatsApp'ta kayıtlı değil`;
  });

  document.getElementById('btn-send-test')?.addEventListener('click', async () => {
    const phone = document.getElementById('test-phone').value.trim();
    const msg   = document.getElementById('test-message').value.trim();
    if (!phone || !msg) return showToast('Telefon ve mesaj gerekli', 'warning');
    if (!waConnected) return showToast('WhatsApp bağlı değil', 'warning');
    const btn = document.getElementById('btn-send-test');
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    const r = await api.waSendTest(phone, msg);
    btn.disabled = false; btn.textContent = 'Test Gönder';
    const el = document.getElementById('test-result');
    el.style.display = 'block';
    el.className = `test-result ${r?.success ? 'success' : 'error'}`;
    el.textContent = r?.success ? `✓ Mesaj gönderildi: ${formatPhone(phone)}` : `✕ Hata: ${r?.error||''}`;
    if (r?.success) showToast('Test mesajı gönderildi', 'success');
  });
}

// ============================================================
// KİŞİLER
// ============================================================
async function loadContacts() {
  const filters = {
    category: document.getElementById('filter-category')?.value || undefined,
    status:   document.getElementById('filter-status')?.value   || undefined,
    has_whatsapp: document.getElementById('filter-whatsapp')?.value !== '' ? document.getElementById('filter-whatsapp')?.value : undefined,
    search:   document.getElementById('contacts-search')?.value  || undefined
  };
  const contacts = await api.getContacts(filters);
  renderContactsTable(contacts || []);
  await loadContactCats();
}

function renderContactsTable(contacts) {
  const tbody = document.getElementById('contacts-tbody');
  document.getElementById('contacts-count-text').textContent = `${contacts.length} kişi`;
  document.getElementById('contacts-badge').textContent = contacts.length;
  if (!contacts.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Kişi bulunamadı</td></tr>'; return; }
  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td><input type="checkbox" class="contact-checkbox" data-id="${c.id}" /></td>
      <td style="font-weight:500;color:var(--text-primary)">${c.business_name||'—'}</td>
      <td style="font-family:monospace;font-size:12px">${formatPhone(c.phone)}</td>
      <td>${c.category?`<span class="badge badge-blue">${c.category}</span>`:'—'}</td>
      <td>${c.rating?`⭐ ${c.rating}`:'—'}</td>
      <td>${waBadge(c.has_whatsapp)}</td>
      <td>${statusBadge(c.status)}</td>
      <td><button class="btn btn-danger-outline btn-sm" onclick="deleteContact(${c.id})">✕</button></td>
    </tr>`).join('');
}

function waBadge(s) {
  if (s===1) return '<span class="badge badge-green">✓ Var</span>';
  if (s===0) return '<span class="badge badge-red">✕ Yok</span>';
  return '<span class="badge badge-gray">? Bilinmiyor</span>';
}

function statusBadge(s) {
  const m={sent:'badge-green',pending:'badge-amber',failed:'badge-red',blocked:'badge-red'};
  const l={sent:'Gönderildi',pending:'Bekleyen',failed:'Başarısız',blocked:'🚫 Engellendi'};
  return `<span class="badge ${m[s]||'badge-gray'}">${l[s]||s||'—'}</span>`;
}

async function loadContactCats() {
  const cats = await api.getContactCats();
  ['filter-category','camp-category'].forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    const cur = el.value;
    const ph = id==='filter-category'?'Tüm Kategoriler':'Tüm kişiler';
    el.innerHTML = `<option value="">${ph}</option>`+(cats||[]).map(c=>`<option value="${c.category}" ${c.category===cur?'selected':''}>${c.category}</option>`).join('');
  });
}

async function deleteContact(id) {
  if (!confirm('Bu kişiyi silmek istediğinizden emin misiniz?')) return;
  await api.deleteContact(id);
  showToast('Kişi silindi', 'success');
  loadContacts();
}

function initContacts() {
  // Excel — dosya seçici dialog
  document.getElementById('btn-excel-import')?.addEventListener('click', async () => {
    const r = await api.importExcel();
    if (r?.canceled) return;
    const res = document.getElementById('import-result');
    res.style.display = 'block';
    if (r?.success) {
      res.className = 'import-result success';
      res.innerHTML = `✓ <strong>${r.imported}</strong> yeni kişi içe aktarıldı (${r.total} satır işlendi)${r.errorCount>0?`, <span style="color:var(--accent-amber)">${r.errorCount} atlanan</span>`:''}`;
      showToast(`${r.imported} kişi içe aktarıldı`, 'success');
      loadContacts(); refreshDashStats();
    } else {
      res.className = 'import-result error';
      res.textContent = `✕ Hata: ${r?.error||''}`;
      showToast('İçe aktarma başarısız', 'error');
    }
  });

  // Drag & drop desteği (dosyayı Electron'un dialog'una yönlendir)
  const dropZone = document.getElementById('drop-zone');
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', async (e) => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    
    // Electron'da file nesnesi absolute path içerir (file.path)
    if (!file.path) {
      return showToast('Dosya yolu okunamadı', 'error');
    }
    
    showToast('Dosya yükleniyor...', 'info', 2000);
    const r = await api.importExcelPath(file.path);
    const res = document.getElementById('import-result');
    res.style.display = 'block';
    if (r?.success) {
      res.className = 'import-result success';
      res.innerHTML = `✓ <strong>${r.imported}</strong> yeni kişi içe aktarıldı (${r.total} satır işlendi)${r.errorCount>0?`, <span style="color:var(--accent-amber)">${r.errorCount} atlanan</span>`:''}`;
      showToast(`${r.imported} kişi içe aktarıldı`, 'success');
      loadContacts(); refreshDashStats();
    } else {
      res.className = 'import-result error';
      res.textContent = `✕ Hata: ${r?.error||''}`;
      showToast('İçe aktarma başarısız', 'error');
    }
  });

  document.getElementById('contacts-search')?.addEventListener('input', debounce(loadContacts));
  document.getElementById('filter-category')?.addEventListener('change', loadContacts);
  document.getElementById('filter-whatsapp')?.addEventListener('change', loadContacts);
  document.getElementById('filter-status')?.addEventListener('change', loadContacts);

  document.getElementById('btn-check-all-numbers')?.addEventListener('click', async () => {
    if (!waConnected) return showToast('WhatsApp bağlı değil! Önce bağlanın.', 'error');
    if (!confirm('Tüm bekleyen numaraların WhatsApp hesapları kontrol edilecek. Bu işlem biraz sürebilir. Onaylıyor musunuz?')) return;
    
    showToast('Numara kontrolü başlatıldı, lütfen bekleyin...', 'info');
    const btn = document.getElementById('btn-check-all-numbers');
    btn.disabled = true;
    
    const r = await api.checkAllNumbers();
    
    btn.disabled = false;
    if (r?.success) {
      showToast(`Kontrol tamamlandı: ${r.hasWa} WA var, ${r.noWa} WA yok`, 'success');
      loadContacts(); refreshDashStats();
    } else {
      showToast(`Hata: ${r?.error || ''}`, 'error');
    }
  });

  document.getElementById('btn-delete-nowa')?.addEventListener('click', async () => {
    if (!confirm('WhatsApp hesabı olmayan (WA Yok) tüm numaralar veritabanından ve kuyruktan KALICI OLARAK silinecek. Onaylıyor musunuz?')) return;
    
    const r = await api.deleteNoWa();
    if (r?.success) {
      showToast(`${r.deleted} adet WhatsApp'ı olmayan numara silindi.`, 'success');
      loadContacts(); refreshDashStats();
    } else {
      showToast(`Hata: ${r?.error || ''}`, 'error');
    }
  });

  document.getElementById('btn-delete-all-contacts')?.addEventListener('click', async () => {
    if (!confirm('TÜM kişileri silmek istediğinizden emin misiniz?')) return;
    await api.deleteAllContacts();
    showToast('Tüm kişiler silindi', 'warning');
    loadContacts(); refreshDashStats();
  });
}

// ============================================================
// ŞABLONLAR
// ============================================================
let currentTplId = null;

async function loadTemplates() {
  const tpls = await api.getTemplates();
  renderTemplateList(tpls || []);
}

function renderTemplateList(tpls) {
  const list = document.getElementById('templates-list');
  if (!tpls.length) { list.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:8px">Henüz şablon yok</p>'; return; }
  list.innerHTML = tpls.map(t => `
    <div class="template-list-item ${t.id===currentTplId?'active':''}" onclick="selectTemplate(${t.id})" data-tid="${t.id}">
      <div class="template-item-name">${t.name}</div>
      <div class="template-item-date">${formatDate(t.created_at)}</div>
    </div>`).join('');
  // Kampanya şablon select'ini güncelle
  const cs = document.getElementById('camp-template');
  if (cs) cs.innerHTML = '<option value="">Şablon seçin...</option>'+tpls.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
}

async function selectTemplate(id) {
  currentTplId = id;
  const tpls = await api.getTemplates();
  const t = (tpls||[]).find(x=>x.id===id); if(!t) return;
  document.querySelectorAll('.template-list-item').forEach(el => el.classList.toggle('active', parseInt(el.dataset.tid)===id));
  document.getElementById('editor-placeholder').style.display = 'none';
  document.getElementById('editor-form').style.display = 'block';
  document.getElementById('template-name').value = t.name;
  document.getElementById('template-content').value = t.content;
  updateTplPreview(); updateTplCount();
}

function updateTplPreview() {
  const c = document.getElementById('template-content').value;
  document.querySelector('.preview-bubble').innerHTML = c
    .replace(/\{isletme_adi\}/g,'<em>Örnek İşletme</em>').replace(/\{telefon\}/g,'0532 XXX XX XX')
    .replace(/\{adres\}/g,'İstanbul, TR').replace(/\{puan\}/g,'4.5').replace(/\{kategori\}/g,'Restoran')
    .replace(/\{email\}/g,'info@ornek.com').replace(/\{web\}/g,'www.ornek.com').replace(/\n/g,'<br>') || '<em style="color:#999">Önizleme...</em>';
}

function updateTplCount() {
  const c = document.getElementById('template-content').value;
  document.getElementById('template-char-count').textContent = c.length;
}

function initTemplates() {
  document.getElementById('btn-new-template')?.addEventListener('click', () => {
    currentTplId = null;
    document.querySelectorAll('.template-list-item').forEach(el=>el.classList.remove('active'));
    document.getElementById('editor-placeholder').style.display = 'flex';
    document.getElementById('editor-form').style.display = 'none';
    // Reset ve aç
    document.getElementById('template-name').value = '';
    document.getElementById('template-content').value = '';
    document.getElementById('editor-placeholder').style.display = 'none';
    document.getElementById('editor-form').style.display = 'block';
    updateTplPreview(); updateTplCount();
  });

  document.getElementById('template-content')?.addEventListener('input', () => { updateTplPreview(); updateTplCount(); });

  document.querySelectorAll('.var-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const ta = document.getElementById('template-content');
      const v = btn.dataset.var, s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.substring(0,s)+v+ta.value.substring(e);
      ta.selectionStart = ta.selectionEnd = s+v.length; ta.focus();
      updateTplPreview(); updateTplCount();
    });
  });

  document.getElementById('btn-save-template')?.addEventListener('click', async () => {
    const name = document.getElementById('template-name').value.trim();
    const content = document.getElementById('template-content').value.trim();
    if (!name||!content) return showToast('Ad ve içerik gerekli', 'warning');
    if (currentTplId) { await api.updateTemplate(currentTplId, { name, content }); }
    else { const r = await api.createTemplate({ name, content }); if (r?.id) currentTplId = r.id; }
    showToast('Şablon kaydedildi ✓', 'success'); loadTemplates();
  });

  document.getElementById('btn-delete-template')?.addEventListener('click', async () => {
    if (!currentTplId||!confirm('Bu şablonu silmek istediğinizden emin misiniz?')) return;
    await api.deleteTemplate(currentTplId); currentTplId = null;
    document.getElementById('editor-form').style.display = 'none';
    document.getElementById('editor-placeholder').style.display = 'flex';
    showToast('Şablon silindi', 'warning'); loadTemplates();
  });

  document.getElementById('btn-cancel-template')?.addEventListener('click', () => {
    currentTplId = null;
    document.getElementById('editor-form').style.display = 'none';
    document.getElementById('editor-placeholder').style.display = 'flex';
  });
}

// ============================================================
// KAMPANYALAR
// ============================================================
let editCampId = null;

async function loadCampaigns() {
  const camps = await api.getCampaigns();
  renderCampaignsGrid(camps || []);
  const badge = document.getElementById('campaigns-badge');
  if (badge) { const ac = (camps||[]).filter(c=>c.status==='active'); badge.style.display=ac.length?'inline':'none'; }
}

function renderCampaignsGrid(camps) {
  const grid = document.getElementById('campaigns-grid');
  if (!camps.length) {
    grid.innerHTML = `<div class="empty-campaigns"><svg width="64" height="64" fill="none" viewBox="0 0 24 24" style="opacity:.3"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><p>Kampanya yok</p><button class="btn btn-primary" onclick="document.getElementById('btn-new-campaign').click()">İlk Kampanyayı Oluştur</button></div>`;
    return;
  }
  const sl = { draft:'badge-gray', active:'badge-green', paused:'badge-amber', stopped:'badge-red' };
  const ll = { draft:'Taslak', active:'Aktif', paused:'Duraklatıldı', stopped:'Durduruldu' };
  grid.innerHTML = camps.map(c => `
    <div class="campaign-card ${c.status}">
      <div class="cc-header">
        <div><div class="cc-name">${c.name}</div><div class="cc-template">📄 ${c.template_name||'Şablon yok'}</div></div>
        <span class="badge ${sl[c.status]||'badge-gray'}">${ll[c.status]||c.status}</span>
      </div>
      <div class="cc-meta-grid">
        <div class="cc-meta-item"><div class="cc-meta-label">Gönderim Saatleri</div><div class="cc-meta-value">🕐 ${c.send_start_time}–${c.send_end_time}</div></div>
        <div class="cc-meta-item"><div class="cc-meta-label">Günlük Limit</div><div class="cc-meta-value">📨 ${c.daily_limit} mesaj</div></div>
        <div class="cc-meta-item"><div class="cc-meta-label">Bekleme</div><div class="cc-meta-value">⏱ ${c.min_delay}–${c.max_delay}s</div></div>
        <div class="cc-meta-item"><div class="cc-meta-label">Saat Dilimi</div><div class="cc-meta-value">🌍 ${(c.timezone||'').split('/')[1]||c.timezone}</div></div>
      </div>
      <div class="cc-actions">
        ${c.status!=='active'?`<button class="btn btn-success btn-sm" onclick="startCampaign(${c.id})">▶ Başlat</button>`:''}
        ${c.status==='active'?`<button class="btn btn-warning btn-sm" onclick="pauseCampaign(${c.id})">⏸ Duraklat</button>`:''}
        ${['active','paused'].includes(c.status)?`<button class="btn btn-danger-outline btn-sm" onclick="stopCampaign(${c.id})">⏹ Durdur</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="editCampaign(${c.id})">✏ Düzenle</button>
        <button class="btn btn-danger-outline btn-sm" onclick="deleteCampaign(${c.id})">🗑</button>
      </div>
    </div>`).join('');
}

async function startCampaign(id) {
  if (!waConnected) return showToast('WhatsApp bağlı değil! Önce bağlanın.', 'error');
  const btn = event?.target; if (btn) { btn.disabled=true; btn.textContent='Başlatılıyor...'; }
  const r = await api.startCampaign(id);
  if (btn) { btn.disabled=false; btn.textContent='▶ Başlat'; }
  if (r?.success) { showToast(`Kampanya başlatıldı! ${r.queued} mesaj kuyruğa eklendi`, 'success'); loadCampaigns(); refreshDashStats(); }
  else showToast(`Hata: ${r?.error||''}`, 'error');
}

async function pauseCampaign(id) { await api.pauseCampaign(id); showToast('Kampanya duraklatıldı', 'warning'); loadCampaigns(); }
async function stopCampaign(id) { if(!confirm('Kampanyayı durdurmak istediğinizden emin misiniz?')) return; await api.stopCampaign(id); showToast('Kampanya durduruldu','warning'); loadCampaigns(); }
async function deleteCampaign(id) { if(!confirm('Kampanyayı silmek istediğinizden emin misiniz?')) return; await api.deleteCampaign(id); showToast('Kampanya silindi','warning'); loadCampaigns(); }

async function editCampaign(id) {
  editCampId = id;
  const camps = await api.getCampaigns();
  const c = (camps||[]).find(x=>x.id===id); if(!c) return;
  document.getElementById('campaign-modal-title').textContent = 'Kampanyayı Düzenle';
  document.getElementById('camp-name').value = c.name;
  document.getElementById('camp-template').value = c.template_id||'';
  document.getElementById('camp-daily-limit').value = c.daily_limit;
  document.getElementById('camp-start-time').value = c.send_start_time;
  document.getElementById('camp-end-time').value = c.send_end_time;
  document.getElementById('camp-timezone').value = c.timezone;
  document.getElementById('camp-min-delay').value = c.min_delay;
  document.getElementById('camp-max-delay').value = c.max_delay;
  document.getElementById('camp-start-date').value = c.start_date||'';
  document.getElementById('camp-end-date').value = c.end_date||'';
  const days = (c.active_days||'').split(',').map(Number);
  document.querySelectorAll('#camp-days input[type=checkbox]').forEach(cb => cb.checked=days.includes(parseInt(cb.value)));
  openCampModal();
}

function openCampModal()  { document.getElementById('campaign-modal-overlay').classList.add('open'); }
function closeCampModal() { document.getElementById('campaign-modal-overlay').classList.remove('open'); editCampId=null; }

function initCampaigns() {
  document.getElementById('btn-new-campaign')?.addEventListener('click', () => {
    editCampId = null;
    document.getElementById('campaign-modal-title').textContent = 'Yeni Kampanya';
    ['camp-name','camp-start-date','camp-end-date'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('camp-template').value = '';
    document.getElementById('camp-daily-limit').value = '100';
    document.getElementById('camp-start-time').value = '09:00';
    document.getElementById('camp-end-time').value = '18:00';
    document.getElementById('camp-min-delay').value = '45';
    document.getElementById('camp-max-delay').value = '180';
    openCampModal();
    setTimeout(() => { document.getElementById('camp-name').focus(); }, 100);
  });
  document.getElementById('btn-close-campaign-modal')?.addEventListener('click', closeCampModal);
  document.getElementById('btn-cancel-campaign')?.addEventListener('click', closeCampModal);
  document.getElementById('campaign-modal-overlay')?.addEventListener('click', e => { if(e.target===e.currentTarget) closeCampModal(); });

  document.getElementById('btn-save-campaign')?.addEventListener('click', async () => {
    const name = document.getElementById('camp-name').value.trim();
    const tplId = document.getElementById('camp-template').value;
    if (!name) return showToast('Kampanya adı gerekli', 'warning');
    if (!tplId) return showToast('Mesaj şablonu seçin', 'warning');
    const activeDays = Array.from(document.querySelectorAll('#camp-days input:checked')).map(cb=>cb.value).join(',');
    const catVal = document.getElementById('camp-category').value;
    const data = {
      name, template_id: parseInt(tplId),
      target_filter: catVal ? JSON.stringify({ category: catVal }) : null,
      daily_limit: parseInt(document.getElementById('camp-daily-limit').value) || 9999,
      send_start_time: document.getElementById('camp-start-time').value || '00:00',
      send_end_time: document.getElementById('camp-end-time').value || '23:59',
      timezone: document.getElementById('camp-timezone').value || 'Europe/Istanbul',
      min_delay: parseInt(document.getElementById('camp-min-delay').value) || 10,
      max_delay: parseInt(document.getElementById('camp-max-delay').value) || 20,
      active_days: activeDays,
      start_date: document.getElementById('camp-start-date').value||null,
      end_date: document.getElementById('camp-end-date').value||null,
      status: 'draft'
    };
    if (editCampId) { await api.updateCampaign(editCampId, { ...data, status: undefined }); showToast('Kampanya güncellendi','success'); }
    else { await api.createCampaign(data); showToast('Kampanya oluşturuldu','success'); }
    closeCampModal(); loadCampaigns();
  });
}

// ============================================================
// KUYRUK
// ============================================================
async function loadQueue() {
  const sf = document.getElementById('queue-filter-status')?.value||'';
  const cf = document.getElementById('queue-filter-campaign')?.value||'';
  const [queue, stats] = await Promise.all([api.getQueue({ status:sf||undefined, campaign_id:cf||undefined }), api.getQueueStats()]);
  if (stats) {
    setText('qs-pending', stats.pending||0);
    setText('qs-sent',    stats.sent||0);
    setText('qs-failed',  stats.failed||0);
    setText('qs-today',   stats.todaySent||0);
    document.getElementById('queue-badge').textContent = stats.pending||0;
  }
  renderQueueTable(queue||[]);
  const camps = await api.getCampaigns();
  const qcf = document.getElementById('queue-filter-campaign');
  if (qcf&&camps) qcf.innerHTML = '<option value="">Tüm Kampanyalar</option>'+camps.map(c=>`<option value="${c.id}" ${c.id==cf?'selected':''}>${c.name}</option>`).join('');
}

function renderQueueTable(q) {
  const tbody = document.getElementById('queue-tbody');
  const sm = { pending:'badge-amber', sent:'badge-green', failed:'badge-red', no_whatsapp:'badge-gray', blocked:'badge-red', skipped:'badge-gray' };
  const sl = { pending:'Bekleyen', sent:'Gönderildi', failed:'Başarısız', no_whatsapp:'WA Yok', blocked:'🚫 Engellendi', skipped:'Atlandı' };
  if (!q.length) { tbody.innerHTML='<tr><td colspan="5" class="empty-state">Kuyruk boş</td></tr>'; return; }
  tbody.innerHTML = q.map(x=>`
    <tr>
      <td style="font-family:monospace;font-size:12px">${formatPhone(x.phone)}</td>
      <td>${x.business_name||'—'}</td>
      <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(x.message||'').substring(0,60)}${(x.message||'').length>60?'...':''}</td>
      <td><span class="badge ${sm[x.status]||'badge-gray'}">${sl[x.status]||x.status}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${formatDate(x.sent_at||x.created_at)}</td>
    </tr>`).join('');
}

async function updateQueueBadge() {
  const s = await api.getQueueStats();
  if (s) document.getElementById('queue-badge').textContent = s.pending||0;
}

function initQueue() {
  document.getElementById('btn-refresh-queue')?.addEventListener('click', loadQueue);
  document.getElementById('btn-clear-queue')?.addEventListener('click', async () => {
    if (!confirm('Mesaj kuyruğundaki TÜM bekleyen ve tamamlanmış mesajlar kalıcı olarak silinecek. Onaylıyor musunuz?')) return;
    const r = await api.clearQueue();
    if (r?.success) {
      showToast('Mesaj kuyruğu başarıyla temizlendi', 'success');
      loadQueue();
      refreshDashStats();
    }
  });
  document.getElementById('queue-filter-status')?.addEventListener('change', loadQueue);
  document.getElementById('queue-filter-campaign')?.addEventListener('change', loadQueue);
}

// ============================================================
// ANALİTİK
// ============================================================
let dailyChart=null, statusChart=null;

async function loadAnalytics() {
  const [daily, cs, qs] = await Promise.all([api.getDailyStats(), api.getContactStats(), api.getQueueStats()]);
  if (daily) {
    const last30 = daily.slice(0,30).reverse();
    if (dailyChart) { dailyChart.destroy(); dailyChart=null; }
    const c2 = document.getElementById('dailyChart');
    if (c2) dailyChart = new Chart(c2, {
      type:'line', data:{
        labels: last30.map(s=>new Date(s.date).toLocaleDateString('tr-TR',{day:'2-digit',month:'short'})),
        datasets:[{ label:'Gönderildi', data:last30.map(s=>s.sent||0), borderColor:'#25d366', backgroundColor:'rgba(37,211,102,0.08)', tension:0.4, fill:true, pointBackgroundColor:'#25d366', pointRadius:3 }]
      },
      options:{ responsive:true, plugins:{legend:{labels:{color:'#8b9abf'}},tooltip:{backgroundColor:'#111827',titleColor:'#f0f4ff',bodyColor:'#8b9abf',borderColor:'rgba(255,255,255,0.1)',borderWidth:1}},
        scales:{ x:{ticks:{color:'#8b9abf',maxRotation:45},grid:{color:'rgba(255,255,255,0.04)'}}, y:{ticks:{color:'#8b9abf'},grid:{color:'rgba(255,255,255,0.04)'},beginAtZero:true} } }
    });
  }
  if (qs) {
    if (statusChart) { statusChart.destroy(); statusChart=null; }
    const c3 = document.getElementById('statusChart');
    if (c3) statusChart = new Chart(c3, {
      type:'doughnut',
      data:{ labels:['Gönderildi','Başarısız','Bekleyen','🚫 Engellendi'], datasets:[{ data:[qs.sent||0,qs.failed||0,qs.pending||0,qs.blocked||0], backgroundColor:['rgba(37,211,102,0.8)','rgba(239,68,68,0.8)','rgba(245,158,11,0.8)','rgba(139,92,246,0.8)'], borderColor:['#25d366','#ef4444','#f59e0b','#8b5cf6'], borderWidth:2 }] },
      options:{ responsive:true, plugins:{legend:{labels:{color:'#8b9abf'}},tooltip:{backgroundColor:'#111827',titleColor:'#f0f4ff',bodyColor:'#8b9abf'}}, cutout:'65%' }
    });
  }
  if (cs) {
    const total = cs.has_whatsapp+cs.no_whatsapp;
    const pct = total>0?Math.round((cs.has_whatsapp/total)*100):0;
    setText('reach-count', cs.has_whatsapp||0);
    setText('no-reach-count', cs.no_whatsapp||0);
    setText('reach-pct', `${pct}%`);
    document.getElementById('reach-bar').style.width = `${pct}%`;
  }
}

// ============================================================
// LOGLAR
// ============================================================
async function loadLogs() {
  const logs = await api.getLogs(200);
  const tbody = document.getElementById('logs-tbody');
  const sm = { sent:'badge-green', failed:'badge-red', no_whatsapp:'badge-gray', blocked:'badge-red' };
  const sl = { sent:'Gönderildi', failed:'Başarısız', no_whatsapp:'WA Yok', blocked:'🚫 Engellendi' };
  if (!logs?.length) { tbody.innerHTML='<tr><td colspan="5" class="empty-state">Henüz log yok</td></tr>'; return; }
  tbody.innerHTML = logs.map(l=>`
    <tr>
      <td style="font-size:11px;white-space:nowrap">${formatDate(l.sent_at)}</td>
      <td style="font-family:monospace">${formatPhone(l.phone)}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(l.message||'').substring(0,80)}</td>
      <td><span class="badge ${sm[l.status]||'badge-gray'}">${sl[l.status]||l.status}</span></td>
      <td style="color:var(--danger);font-size:11px">${l.error_message||'—'}</td>
    </tr>`).join('');
}

// ============================================================
// KARA LİSTE
// ============================================================
async function loadBlacklist() {
  const list = await api.getBlacklist();
  const tbody = document.getElementById('blacklist-tbody');
  if (!list?.length) { tbody.innerHTML='<tr><td colspan="4" class="empty-state">Kara liste boş</td></tr>'; return; }
  tbody.innerHTML = list.map(item=>`
    <tr>
      <td style="font-family:monospace">${formatPhone(item.phone)}</td>
      <td>${item.reason||'—'}</td>
      <td style="font-size:11px">${formatDate(item.added_at)}</td>
      <td><button class="btn btn-success btn-sm" onclick="removeBlacklist(${item.id})" title="Kara listeden kaldır">✓ Kaldır</button></td>
    </tr>`).join('');
}

async function removeBlacklist(id) {
  if (!confirm('Bu numarayı kara listeden kaldırmak istediğinizden emin misiniz?')) return;
  await api.removeBlacklist(id);
  showToast('Kara listeden kaldırıldı', 'success'); loadBlacklist();
}

function initBlacklist() {
  document.getElementById('btn-add-blacklist')?.addEventListener('click', async () => {
    const phone  = document.getElementById('blacklist-phone').value.trim();
    const reason = document.getElementById('blacklist-reason').value.trim();
    if (!phone) return showToast('Telefon numarası girin', 'warning');
    const r = await api.addBlacklist(phone, reason);
    if (r?.success) {
      const msg = r.blockedInQueue > 0 ? `Kara listeye eklendi ve ${r.blockedInQueue} bekleyen mesaj engellendi 🚫` : 'Kara listeye eklendi 🚫';
      showToast(msg, 'warning');
      document.getElementById('blacklist-phone').value = '';
      document.getElementById('blacklist-reason').value = '';
      loadBlacklist();
    } else {
      showToast(r?.message || 'Bu numara zaten kara listede', 'warning');
    }
  });
}

// ============================================================
// AYARLAR
// ============================================================
async function loadSettings() {
  const s = await api.getSettings(); if(!s) return;
  document.getElementById('setting-start-time').value = s.default_start_time||'09:00';
  document.getElementById('setting-end-time').value   = s.default_end_time||'18:00';
  document.getElementById('setting-daily-limit').value = s.daily_global_limit||'200';
  document.getElementById('setting-min-delay').value  = s.default_min_delay||'45';
  document.getElementById('setting-max-delay').value  = s.default_max_delay||'180';
  document.getElementById('setting-blacklist-enabled').checked = s.blacklist_enabled!=='0';
  document.getElementById('setting-timezone').value   = s.default_timezone||'Europe/Istanbul';
  
  // Veri dizini göster
  const dp = await api.getDataPath();
  const dpEl = document.getElementById('data-path');
  if (dpEl && dp) dpEl.textContent = dp;
}

function initSettings() {
  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const r = await api.saveSettings({
      default_start_time: document.getElementById('setting-start-time').value,
      default_end_time:   document.getElementById('setting-end-time').value,
      default_timezone:   document.getElementById('setting-timezone').value,
      daily_global_limit: document.getElementById('setting-daily-limit').value,
      default_min_delay:  document.getElementById('setting-min-delay').value,
      default_max_delay:  document.getElementById('setting-max-delay').value,
      blacklist_enabled:  document.getElementById('setting-blacklist-enabled').checked?'1':'0'
    });
    if (r?.success) showToast('Ayarlar kaydedildi ✓', 'success');
  });
}

// ============================================================
// ZAMANLAYICI
// ============================================================
let schedulerRunning = false;

function updateSchedulerUI(running) {
  schedulerRunning = !!running;
  document.querySelector('.pulse-dot')?.classList.toggle('active', running);
  const txt = document.getElementById('scheduler-status-text');
  const btn = document.getElementById('btn-scheduler-toggle');
  if (txt) txt.textContent = running ? 'Zamanlayıcı Çalışıyor' : 'Zamanlayıcı Durduruldu';
  if (btn) { btn.textContent = running ? '⏸ Durdur' : '▶ Başlat'; btn.classList.toggle('running', running); }
}

function initScheduler() {
  document.getElementById('btn-scheduler-toggle')?.addEventListener('click', async () => {
    if (schedulerRunning) { await api.stopScheduler(); showToast('Zamanlayıcı durduruldu', 'warning'); }
    else { await api.startScheduler(); showToast('Zamanlayıcı başlatıldı ✓', 'success'); }
  });
}

// ============================================================
// UYGULAMA BAŞLANGIÇ
// ============================================================
async function init() {
  populateTimezones('setting-timezone');
  populateTimezones('camp-timezone');

  initTitleBar();
  initIPCEvents();
  initNavigation();
  initWhatsAppPage();
  initContacts();
  initTemplates();
  initCampaigns();
  initQueue();
  initBlacklist();
  initSettings();
  initScheduler();

  // İlk WhatsApp durumu yükle
  const waStatus = await api.waStatus();
  if (waStatus) updateWAStatus({ status: waStatus.status, message: '' });

  await loadDashboard();

  // Periyodik yenileme (30s)
  setInterval(async () => {
    if (currentPage === 'dashboard') refreshDashStats();
    if (currentPage === 'queue') loadQueue();
    updateQueueBadge();
  }, 30000);
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
}

document.addEventListener('DOMContentLoaded', init);
