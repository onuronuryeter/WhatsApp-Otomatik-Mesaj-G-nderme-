/**
 * WhatsApp İstemcisi
 * headless: false → Chrome penceresi açılır, kullanıcı QR tarar
 * LocalAuth → Oturum AppData'da saklanır, bir sonraki açılışta QR gerekmez
 */
const { Client, LocalAuth } = require('@juzi/whatsapp-web.js');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isReady = false;
    this.isInitializing = false;
    this.connectionStatus = 'disconnected';
    this.phoneInfo = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  getSessionPath() {
    const base = process.env.USER_DATA_PATH || path.join(__dirname, '..', '..');
    const sessionPath = path.join(base, 'whatsapp-session');
    return sessionPath;
  }

  getLegacySessionPaths() {
    const repoRoot = path.join(__dirname, '..', '..');
    return [
      path.join(repoRoot, '.wwebjs_auth', 'session'),
      path.join(repoRoot, 'data', 'whatsapp-session', 'session'),
      path.join(repoRoot, 'data', 'whatsapp-session'),
      path.join(process.cwd(), '.wwebjs_auth', 'session')
    ].filter(Boolean);
  }

  removeDirIfExists(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return;
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`[WA] Eski oturum temizlendi: ${targetPath}`);
    } catch (error) {
      console.warn(`[WA] Eski oturum silinemedi: ${targetPath}`, error.message);
    }
  }

  cleanupLegacySessionPaths() {
    const activePath = this.getSessionPath();
    const legacy = this.getLegacySessionPaths();
    for (const candidate of legacy) {
      if (candidate !== activePath && fs.existsSync(candidate)) {
        this.removeDirIfExists(candidate);
      }
    }
  }

  async safeDestroyClient() {
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch (error) {
      console.warn('[WA] Client destroy hatası:', error.message);
    } finally {
      this.client = null;
    }
  }

  getChromeExecutablePath() {
    const possiblePaths = [
      process.env.CHROME_BIN,
      process.env.GOOGLE_CHROME_BIN,
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ].filter(Boolean);

    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) return p;
    }

    return undefined;
  }

  scheduleReconnect(delay = 5000) {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const attemptDelay = Math.min(delay * this.reconnectAttempts, 30000);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isReady && !this.isInitializing) {
        try {
          await this.initialize();
        } catch (error) {
          console.error('[WA] Yeniden bağlanma hatası:', error.message);
        }
      }
    }, attemptDelay);
  }

  async initialize() {
    if (this.isInitializing || this.isReady) return this.getStatus();

    this.cleanupLegacySessionPaths();
    if (this.client) await this.safeDestroyClient();

    this.isInitializing = true;
    this.connectionStatus = 'connecting';
    this.reconnectAttempts = 0;
    this.emit('status', { status: 'connecting', message: 'WhatsApp başlatılıyor... Chrome penceresi açılacak' });

    const sessionPath = this.getSessionPath();
    const executablePath = this.getChromeExecutablePath();

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
      puppeteer: {
        headless: false,
        defaultViewport: null,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-networking',
          '--disable-default-apps',
          '--no-first-run',
          '--no-default-browser-check',
          '--window-size=1366,768',
          '--start-maximized'
        ]
      }
    });

    this.client.on('qr', () => {
      this.connectionStatus = 'qr_ready';
      this.emit('status', {
        status: 'qr_ready',
        message: '📱 Açılan Chrome penceresinde QR kodu görünüyor.\nWhatsApp\'ı açın → Bağlı Cihazlar → Cihaz Ekle → QR tara'
      });
      console.log('[WA] QR kodu Chrome penceresinde gösteriliyor...');
    });

    this.client.on('authenticated', () => {
      this.connectionStatus = 'authenticated';
      this.emit('status', { status: 'authenticated', message: '✓ Kimlik doğrulandı, yükleniyor...' });
    });

    this.client.on('ready', async () => {
      this.isReady = true;
      this.isInitializing = false;
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      const info = this.client.info;
      this.phoneInfo = { name: info.pushname, phone: info.wid.user, platform: info.platform };
      this.emit('ready', this.phoneInfo);
      this.emit('status', {
        status: 'connected',
        message: `✓ Bağlandı: ${info.pushname} (+${info.wid.user})`,
        info: this.phoneInfo
      });
      console.log(`[WA] ✓ Bağlandı: ${info.pushname} (+${info.wid.user})`);
    });

    this.client.on('auth_failure', (msg) => {
      this.isInitializing = false;
      this.isReady = false;
      this.connectionStatus = 'disconnected';
      this.emit('status', { status: 'auth_failure', message: '✕ Kimlik doğrulama başarısız: ' + msg });
      console.error('[WA] Auth failure:', msg);
      this.scheduleReconnect(3000);
    });

    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.isInitializing = false;
      this.connectionStatus = 'disconnected';
      const message = reason ? 'Bağlantı kesildi: ' + String(reason) : 'Bağlantı kesildi';
      this.emit('status', { status: 'disconnected', message });
      console.log('[WA] Bağlantı kesildi:', reason);

      if (reason && /LOGOUT|CONFLICT|restart|not-authorized|denied|SESSION/i.test(String(reason))) {
        this.removeDirIfExists(this.getSessionPath());
      }

      if (!this.reconnectTimer && !this.isReady) {
        this.scheduleReconnect(2000);
      }
    });

    try {
      await this.client.initialize();
    } catch (err) {
      this.isInitializing = false;
      this.isReady = false;
      this.connectionStatus = 'disconnected';
      this.emit('status', { status: 'error', message: '✕ Başlatma hatası: ' + err.message });
      console.error('[WA] Başlatma hatası:', err.message);
      this.scheduleReconnect(3000);
    }
  }

  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try { await this.client.destroy(); } catch (e) { /* ignore */ }
      this.client = null;
    }
    this.isReady = false;
    this.isInitializing = false;
    this.connectionStatus = 'disconnected';
    this.phoneInfo = null;
    this.emit('status', { status: 'disconnected', message: 'Bağlantı kesildi' });
  }

  formatPhone(phone) {
    let cleaned = String(phone || '').replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
    if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.length === 10) cleaned = '90' + cleaned;
    return cleaned;
  }

  async checkNumber(phone) {
    if (!this.isReady || !this.client) throw new Error('WhatsApp bağlı değil');
    const formatted = this.formatPhone(phone);
    if (!formatted || formatted.length < 9) {
      return { phone: formatted, hasWhatsApp: false, error: 'Geçersiz telefon numarası' };
    }
    try {
      const promise = this.client.isRegisteredUser(`${formatted}@c.us`);
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp yanıt vermedi (Timeout)')), 60000));
      const registered = await Promise.race([promise, timeout]);
      return { phone: formatted, hasWhatsApp: registered };
    } catch (err) {
      return { phone: formatted, hasWhatsApp: false, error: err.message };
    }
  }

  async sendMessage(phone, message) {
    if (!this.isReady || !this.client) throw new Error('WhatsApp bağlı değil');
    const formatted = this.formatPhone(phone);
    if (!formatted || formatted.length < 9) {
      return { success: false, error: 'Geçersiz telefon numarası', hasWhatsApp: false };
    }
    const chatId = `${formatted}@c.us`;
    try {
      const checkPromise = this.client.isRegisteredUser(chatId);
      const timeout1 = new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp yanıt vermedi (Timeout)')), 60000));
      const isRegistered = await Promise.race([checkPromise, timeout1]);

      if (!isRegistered) return { success: false, error: 'WhatsApp hesabı bulunamadı', hasWhatsApp: false };

      const sendPromise = this.client.sendMessage(chatId, message);
      const timeout2 = new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp mesaj gönderilemedi (Timeout)')), 60000));
      await Promise.race([sendPromise, timeout2]);

      return { success: true, hasWhatsApp: true, phone: formatted };
    } catch (err) {
      return { success: false, error: err.message, hasWhatsApp: true };
    }
  }

  async restart() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.safeDestroyClient();
    this.isReady = false;
    this.isInitializing = false;
    this.connectionStatus = 'disconnected';
    this.phoneInfo = null;
    this.emit('status_changed', { status: 'disconnected', message: 'Bağlantı sıfırlanıyor...' });
    this.removeDirIfExists(this.getSessionPath());
    await this.initialize();
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      isReady: this.isReady,
      isInitializing: this.isInitializing,
      phoneInfo: this.phoneInfo
    };
  }
}

module.exports = new WhatsAppClient();
