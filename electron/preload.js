/**
 * Electron Preload — Güvenli IPC Köprüsü
 * Renderer (HTML/JS) bu API aracılığıyla ana süreçle iletişim kurar
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Pencere Kontrolleri ---
  minimize:    () => ipcRenderer.send('window-minimize'),
  maximize:    () => ipcRenderer.send('window-maximize'),
  close:       () => ipcRenderer.send('window-close'),
  hide:        () => ipcRenderer.send('window-hide'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openExternal:(url) => ipcRenderer.send('open-external', url),

  // --- WhatsApp ---
  waConnect:     ()             => ipcRenderer.invoke('wa:connect'),
  waDisconnect:  ()             => ipcRenderer.invoke('wa:disconnect'),
  waStatus:      ()             => ipcRenderer.invoke('wa:status'),
  waForceReady:  ()             => ipcRenderer.invoke('wa:force-ready'),
  waCheckNumber: (phone)        => ipcRenderer.invoke('wa:check-number', phone),
  waSendTest:    (phone, msg)   => ipcRenderer.invoke('wa:send-test', { phone, message: msg }),

  // --- Kişiler ---
  getContacts:       (filters) => ipcRenderer.invoke('contacts:getAll', filters),
  getContactStats:   ()        => ipcRenderer.invoke('contacts:stats'),
  getContactCats:    ()        => ipcRenderer.invoke('contacts:categories'),
  deleteContact:     (id)      => ipcRenderer.invoke('contacts:delete', id),
  deleteAllContacts: ()        => ipcRenderer.invoke('contacts:deleteAll'),
  checkAllNumbers:   ()        => ipcRenderer.invoke('contacts:checkAllNumbers'),
  deleteNoWa:        ()        => ipcRenderer.invoke('contacts:deleteNoWa'),

  // --- Excel İçe Aktarma (Dosya Seçici Dialog) ---
  importExcel: () => ipcRenderer.invoke('excel:import'),
  importExcelPath: (filePath) => ipcRenderer.invoke('excel:importPath', filePath),

  // --- Şablonlar ---
  getTemplates:   ()          => ipcRenderer.invoke('templates:getAll'),
  createTemplate: (data)      => ipcRenderer.invoke('templates:create', data),
  updateTemplate: (id, data)  => ipcRenderer.invoke('templates:update', { id, data }),
  deleteTemplate: (id)        => ipcRenderer.invoke('templates:delete', id),

  // --- Kampanyalar ---
  getCampaigns:   ()          => ipcRenderer.invoke('campaigns:getAll'),
  createCampaign: (data)      => ipcRenderer.invoke('campaigns:create', data),
  updateCampaign: (id, data)  => ipcRenderer.invoke('campaigns:update', { id, data }),
  deleteCampaign: (id)        => ipcRenderer.invoke('campaigns:delete', id),
  startCampaign:  (id)        => ipcRenderer.invoke('campaigns:start', id),
  pauseCampaign:  (id)        => ipcRenderer.invoke('campaigns:pause', id),
  stopCampaign:   (id)        => ipcRenderer.invoke('campaigns:stop', id),

  // --- Mesaj Kuyruğu ---
  getQueue:     (filters) => ipcRenderer.invoke('queue:getAll', filters),
  clearQueue:   ()        => ipcRenderer.invoke('queue:clear'),
  getQueueStats:()        => ipcRenderer.invoke('queue:stats'),

  // --- Zamanlayıcı ---
  startScheduler: () => ipcRenderer.invoke('scheduler:start'),
  stopScheduler:  () => ipcRenderer.invoke('scheduler:stop'),

  // --- Ayarlar ---
  getSettings:  ()        => ipcRenderer.invoke('settings:getAll'),
  saveSettings: (data)    => ipcRenderer.invoke('settings:save', data),

  // --- Kara Liste ---
  getBlacklist:    ()               => ipcRenderer.invoke('blacklist:getAll'),
  addBlacklist:    (phone, reason)  => ipcRenderer.invoke('blacklist:add', { phone, reason }),
  removeBlacklist: (id)             => ipcRenderer.invoke('blacklist:remove', id),

  // --- Loglar ---
  getLogs:       (limit)  => ipcRenderer.invoke('logs:getRecent', limit),
  getDailyStats: ()        => ipcRenderer.invoke('logs:dailyStats'),

  // --- Sistem ---
  getDataPath: () => ipcRenderer.invoke('app:getDataPath'),
  getVersion:  () => ipcRenderer.invoke('app:version'),

  // --- Gerçek Zamanlı Olaylar (Ana Süreç → Renderer) ---
  onWaStatus:       (cb) => ipcRenderer.on('wa:status-update',       (_, d) => cb(d)),
  onWaReady:        (cb) => ipcRenderer.on('wa:ready',               (_, d) => cb(d)),
  onMessageSent:    (cb) => ipcRenderer.on('message:sent',           (_, d) => cb(d)),
  onSchedulerStatus:(cb) => ipcRenderer.on('scheduler:status-update',(_, d) => cb(d)),

  // Listener temizleme
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
