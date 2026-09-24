/**
 * WhatsApp Business Bot — Electron Ana Süreç
 * ★ Tamamen IPC tabanlı — web sunucu yok, sadece masaüstü uygulama
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// BAŞLANGIC — modüller userData path ile başlatılır
// ============================================================
let db, whatsappClient, scheduler, excelParser;
let mainWindow, tray;
let isQuitting = false;

function initModules() {
  const userData = app.getPath('userData');
  process.env.USER_DATA_PATH = userData;
  console.log(`[MAIN] AppData dizini: ${userData}`);

  db            = require('../src/db/database');
  whatsappClient = require('../src/whatsapp/client');
  scheduler     = require('../src/scheduler/scheduler');
  excelParser   = require('../src/excel/parser');
}

// ============================================================
// PENCERE
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#080b14',
    show: false,
    icon: path.join(__dirname, '..', 'public', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('minimize', (event) => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Kapatma → sistem tepsisine küçült
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: 'WhatsApp Bot',
          content: 'Uygulama arka planda çalışıyor. Kapatmak için sistem tepsisine sağ tıklayın.',
          iconType: 'info'
        });
      }
    }
  });
}

// ============================================================
// SİSTEM TİZİ (Tray)
// ============================================================
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'assets', 'icon.png');
  const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('WhatsApp Business Bot');

  const updateMenu = (running = false) => {
    const menu = Menu.buildFromTemplate([
      { label: '📱 WhatsApp Bot', enabled: false },
      { type: 'separator' },
      { label: '📂 Uygulamayı Aç', click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      } },
      { label: running ? '⏸ Zamanlayıcıyı Durdur' : '▶ Zamanlayıcıyı Başlat', click: () => {
        if (running) scheduler.stop(); else scheduler.start();
        updateMenu(!running);
      }},
      { type: 'separator' },
      { label: '✕ Uygulamayı Kapat', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
  };

  updateMenu(false);
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow.hide();
    }
  });
  tray.on('double-click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  scheduler.on('scheduler_status', (data) => updateMenu(data.running));
}

// ============================================================
// WHATSAPP & SCHEDULER OLAYLARI
// ============================================================
function setupEvents() {
  whatsappClient.on('status', (data) => {
    mainWindow?.webContents.send('wa:status-update', data);
  });
  whatsappClient.on('ready', (data) => {
    mainWindow?.webContents.send('wa:ready', data);
  });
  scheduler.on('message_sent', (data) => {
    mainWindow?.webContents.send('message:sent', data);
  });
  scheduler.on('scheduler_status', (data) => {
    mainWindow?.webContents.send('scheduler:status-update', data);
  });
}

// ============================================================
// IPC HANDLERs — Tüm UI ↔ Backend iletişimi
// ============================================================
function setupIPC() {
  // --- Pencere Kontrolleri ---
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.on('window-close',    () => mainWindow?.close());
  ipcMain.on('window-hide',     () => mainWindow?.hide());
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

  // --- WhatsApp ---
  ipcMain.handle('wa:connect', async () => {
    try { await whatsappClient.initialize(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });
  ipcMain.handle('wa:disconnect', async () => {
    await whatsappClient.disconnect();
    return { success: true };
  });
  ipcMain.handle('wa:force-ready', async () => {
    try {
      if (whatsappClient && typeof whatsappClient.restart === 'function') {
        await whatsappClient.restart();
      }
      return { success: true, status: whatsappClient.getStatus() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('wa:status', () => whatsappClient.getStatus());
  ipcMain.handle('wa:check-number', async (_, phone) => {
    try { return await whatsappClient.checkNumber(phone); }
    catch (e) { return { success: false, error: e.message }; }
  });
  ipcMain.handle('wa:send-test', async (_, { phone, message }) => {
    try { return await whatsappClient.sendMessage(phone, message); }
    catch (e) { return { success: false, error: e.message }; }
  });

  // --- Kişiler ---
  ipcMain.handle('contacts:getAll',    (_, f) => db.contactsDB.getAll(f || {}));
  ipcMain.handle('contacts:stats',     ()      => db.contactsDB.getStats());
  ipcMain.handle('contacts:categories',()      => db.contactsDB.getCategories());
  ipcMain.handle('contacts:delete',    (_, id) => { db.contactsDB.delete(id); return { success: true }; });
  ipcMain.handle('contacts:deleteAll', ()      => { db.contactsDB.deleteAll(); return { success: true }; });
  
  ipcMain.handle('contacts:deleteNoWa', () => {
    try {
      const deletedCount = db.contactsDB.deleteNoWhatsapp();
      return { success: true, deleted: deletedCount };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });
  
  ipcMain.handle('contacts:checkAllNumbers', async () => {
    try {
      if (!whatsappClient.isReady) return { success: false, error: 'WhatsApp bağlı değil' };
      
      const allContacts = db.contactsDB.getAll();
      const pendingContacts = allContacts.filter(c => c.has_whatsapp === -1);
      
      let hasWa = 0;
      let noWa = 0;
      
      for (const c of pendingContacts) {
        const result = await whatsappClient.checkNumber(c.phone);
        
        if (result.error && (result.error.includes('getChat') || result.error.includes('WWebJS') || result.error.includes('Evaluation failed') || result.error.includes('Session closed') || result.error.includes('detached Frame'))) {
          return { success: false, error: 'WhatsApp altyapısı henüz yüklenmedi. Lütfen sohbet ekranının tamamen açılmasını bekleyip tekrar deneyin.' };
        }

        if (result.hasWhatsApp) {
          hasWa++;
          db.contactsDB.updateWhatsappStatus(c.id, true);
        } else {
          noWa++;
          db.contactsDB.updateWhatsappStatus(c.id, false);
        }
        // sleep slightly to prevent rate limits
        await new Promise(res => setTimeout(res, 500));
      }
      return { success: true, hasWa, noWa };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // --- Excel İçe Aktarma (Dosya Seçici) ---
  ipcMain.handle('excel:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Excel / CSV Dosyası Seç',
      filters: [
        { name: 'Desteklenen Formatlar', extensions: ['xlsx', 'xls', 'csv'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return importExcelFile(result.filePaths[0]);
  });

  ipcMain.handle('excel:importPath', async (_, filePath) => {
    return importExcelFile(filePath);
  });

  function importExcelFile(filePath) {
    try {
      const parsed = excelParser.parseExcel(filePath);
      const inserted = db.contactsDB.insert(parsed.contacts);
      return {
        success: true, total: parsed.total, imported: inserted,
        errors: parsed.errors, errorCount: parsed.errorCount
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // --- Şablonlar ---
  ipcMain.handle('templates:getAll', () => db.templatesDB.getAll());
  ipcMain.handle('templates:create', (_, data) => {
    const r = db.templatesDB.create(data);
    return { success: true, id: r.lastInsertRowid };
  });
  ipcMain.handle('templates:update', (_, { id, data }) => {
    db.templatesDB.update(id, data); return { success: true };
  });
  ipcMain.handle('templates:delete', (_, id) => {
    db.templatesDB.delete(id); return { success: true };
  });

  // --- Kampanyalar ---
  ipcMain.handle('campaigns:getAll', () => db.campaignsDB.getAll());
  ipcMain.handle('campaigns:create', (_, data) => {
    const r = db.campaignsDB.create(data);
    return { success: true, id: r.lastInsertRowid };
  });
  ipcMain.handle('campaigns:update', (_, { id, data }) => {
    db.campaignsDB.update(id, data); return { success: true };
  });
  ipcMain.handle('campaigns:delete', (_, id) => {
    db.campaignsDB.delete(id); return { success: true };
  });
  ipcMain.handle('campaigns:start', async (_, id) => {
    try {
      if (!whatsappClient.isReady) {
        return { success: false, error: 'WhatsApp bağlantısı hazır değil. Lütfen durumun "Hazır" olduğundan emin olun veya "Zorla Bağlan" butonunu kullanın.' };
      }
      const count = await scheduler.buildCampaignQueue(id);
      db.campaignsDB.updateStatus(id, 'active');
      if (!scheduler.isRunning) scheduler.start();
      return { success: true, queued: count };
    } catch (e) { return { success: false, error: e.message }; }
  });
  ipcMain.handle('campaigns:pause', (_, id) => {
    db.campaignsDB.updateStatus(id, 'paused'); return { success: true };
  });
  ipcMain.handle('campaigns:stop', (_, id) => {
    db.campaignsDB.updateStatus(id, 'stopped'); return { success: true };
  });

  // --- Kuyruk ---
  ipcMain.handle('queue:getAll',  (_, f) => db.queueDB.getAll(f || {}));
  ipcMain.handle('queue:clear',   () => { db.queueDB.clearAll(); return { success: true }; });
  ipcMain.handle('queue:stats',   () => ({
    ...db.queueDB.getStats(),
    todaySent: db.queueDB.getTodaySentCount().count,
    schedulerRunning: scheduler.isRunning
  }));

  // --- Zamanlayıcı ---
  ipcMain.handle('scheduler:start', () => { scheduler.start(); return { success: true, running: true }; });
  ipcMain.handle('scheduler:stop',  () => { scheduler.stop();  return { success: true, running: false }; });

  // --- Ayarlar ---
  ipcMain.handle('settings:getAll', () => db.settingsDB.getAll());
  ipcMain.handle('settings:save',   (_, settings) => {
    Object.entries(settings).forEach(([k, v]) => db.settingsDB.set(k, v));
    return { success: true };
  });

  // --- Kara Liste ---
  ipcMain.handle('blacklist:getAll', () => db.blacklistDB.getAll());
  ipcMain.handle('blacklist:add',    (_, { phone, reason }) => {
    const added = db.blacklistDB.add(phone, reason);
    if (added) {
      const blocked = db.queueDB.blockByPhone(phone); // Kuyruktakileri anında engelle
      return { success: true, blockedInQueue: blocked };
    }
    return { success: false, message: 'Bu numara zaten kara listede' };
  });
  ipcMain.handle('blacklist:remove', (_, id) => {
    db.blacklistDB.remove(id); return { success: true };
  });

  // --- Loglar ---
  ipcMain.handle('logs:getRecent',  (_, limit) => db.logsDB.getRecent(limit || 200));
  ipcMain.handle('logs:dailyStats', ()          => db.logsDB.getDailyStats());

  // --- Sistem ---
  ipcMain.handle('app:getDataPath', () => app.getPath('userData'));
  ipcMain.handle('app:version',     () => app.getVersion());
  ipcMain.on('open-external', (_, url) => shell.openExternal(url));
}

// ============================================================
// UYGULAMA BAŞLANGIÇ
// ============================================================
app.whenReady().then(() => {
  initModules();
  setupIPC();
  setupEvents();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Sisteme kapatma komutu gelirse gerçekten kapat
  if (isQuitting || process.platform !== 'darwin') {
    if (scheduler.isRunning) scheduler.stop();
    app.quit();
  }
});

app.on('before-quit', () => { isQuitting = true; });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow?.show();
});
