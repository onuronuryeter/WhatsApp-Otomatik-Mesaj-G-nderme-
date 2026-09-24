const cron = require('node-cron');
const whatsappClient = require('../whatsapp/client');
const { queueDB, campaignsDB, contactsDB, settingsDB, blacklistDB, logsDB, templatesDB } = require('../db/database');
const EventEmitter = require('events');

class MessageScheduler extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.cronJob = null;
    this.isSending = false;
    this.stats = { sent: 0, failed: 0, skipped: 0, blocked: 0 };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.cronJob = cron.schedule('*/30 * * * * *', () => this.processQueue());
    this.emit('scheduler_status', { running: true, message: 'Zamanlayıcı başlatıldı' });
    console.log('[SCHEDULER] ✓ Zamanlayıcı başlatıldı (her 30 sn)');
  }

  stop() {
    if (this.cronJob) { this.cronJob.stop(); this.cronJob = null; }
    this.isRunning = false;
    this.emit('scheduler_status', { running: false, message: 'Zamanlayıcı durduruldu' });
    console.log('[SCHEDULER] Zamanlayıcı durduruldu');
  }

  async processQueue() {
    if (this.isSending || !whatsappClient.isReady) return;
    this.isSending = true;

    try {
      const dailyLimit = parseInt(settingsDB.get('daily_global_limit') || '200');
      const todaySent = queueDB.getTodaySentCount().count;

      if (todaySent >= dailyLimit) {
        console.log(`[SCHEDULER] Günlük limit (${dailyLimit}) doldu. Bugün: ${todaySent}`);
        this.isSending = false;
        return;
      }

      const campaigns = campaignsDB.getAll().filter(c => c.status === 'active');
      if (!campaigns.length) { this.isSending = false; return; }

      for (const campaign of campaigns) {
        if (!this.isWithinSendingHours(campaign)) {
          // console.log(`[SCHEDULER] Kampanya (${campaign.name}) aktif saatleri dışında, atlanıyor.`);
          continue;
        }
        if (!this.isActiveDay(campaign)) {
          console.log(`[SCHEDULER] Kampanya (${campaign.name}) aktif günü değil, atlanıyor.`);
          continue;
        }
        const campDailyLimit = campaign.daily_limit || 9999;
        if (queueDB.getTodayCampaignSent(campaign.id) >= campDailyLimit) {
          console.log(`[SCHEDULER] Kampanya (${campaign.name}) günlük limite ulaştı.`);
          continue;
        }

        const nextMsg = queueDB.getNext(campaign.id);
        if (!nextMsg) {
          // Kuyrukta mesaj yok
          continue;
        }

        // ★ KARA LİSTE KONTROLÜ — Her gönderimden önce çift kontrol
        if (blacklistDB.isBlacklisted(nextMsg.phone)) {
          queueDB.updateStatus(nextMsg.id, 'blocked', '🚫 Kara listede — gönderim kalıcı olarak engellendi');
          this.stats.blocked++;
          console.log(`[SCHEDULER] 🚫 Kara listede: ${nextMsg.phone} — atlandı`);
          continue;
        }

        const result = await whatsappClient.sendMessage(nextMsg.phone, nextMsg.message);

        if (result.success) {
          queueDB.updateStatus(nextMsg.id, 'sent');
          contactsDB.updateStatus(nextMsg.contact_id, 'sent');
          contactsDB.updateWhatsappStatus(nextMsg.contact_id, true);
          this.stats.sent++;

          // Numarayı otomatik olarak kara listeye ekle (Kullanıcı talebi)
          blacklistDB.add(nextMsg.phone, 'Otomatik: Mesaj başarıyla gönderildi');

          logsDB.add({
            campaign_id: nextMsg.campaign_id,
            contact_id: nextMsg.contact_id,
            phone: nextMsg.phone,
            message: nextMsg.message,
            status: 'sent'
          });

          this.emit('message_sent', { phone: nextMsg.phone, campaign_id: nextMsg.campaign_id, stats: this.stats });
          console.log(`[SCHEDULER] ✓ Gönderildi: ${nextMsg.phone}`);

          const delay = this.randomDelay(campaign.min_delay, campaign.max_delay);
          console.log(`[SCHEDULER] Sonraki mesaj için ${delay}s bekleniyor...`);
          await this.sleep(delay * 1000);

        } else if (!result.hasWhatsApp) {
          queueDB.updateStatus(nextMsg.id, 'no_whatsapp', 'WhatsApp hesabı yok');
          contactsDB.updateWhatsappStatus(nextMsg.contact_id, false);
          this.stats.skipped++;
          logsDB.add({ campaign_id: nextMsg.campaign_id, contact_id: nextMsg.contact_id, phone: nextMsg.phone, message: nextMsg.message, status: 'no_whatsapp' });

        } else {
          // ★ WWebJS henüz yüklenmediyse veya koptuysa, sonsuz döngüyü önlemek için kampanyayı duraklat.
          if (result.error && (result.error.includes('getChat') || result.error.includes('WWebJS') || result.error.includes('Evaluation failed') || result.error.includes('Session closed') || result.error.includes('detached Frame') || result.error.includes('Timeout'))) {
            console.log(`[SCHEDULER] WhatsApp altyapısı çöktü (${result.error}). Kampanya duraklatılıyor...`);
            logsDB.add({ campaign_id: nextMsg.campaign_id, contact_id: nextMsg.contact_id, phone: nextMsg.phone, message: nextMsg.message, status: 'failed', error_message: `Sistem Hatası: ${result.error} (Kampanya duraklatıldı. Botu kapatıp açın.)` });
            campaignsDB.updateStatus(campaign.id, 'paused');
            await this.sleep(2000);
            continue;
          }

          const retry = (nextMsg.retry_count || 0) + 1;
          if (retry >= 3) {
            queueDB.updateStatus(nextMsg.id, 'failed', result.error);
            this.stats.failed++;
            logsDB.add({ campaign_id: nextMsg.campaign_id, contact_id: nextMsg.contact_id, phone: nextMsg.phone, message: nextMsg.message, status: 'failed', error_message: result.error });
          } else {
            queueDB.incrementRetry(nextMsg.id);
          }
          await this.sleep(5000);
        }
      }
    } catch (err) {
      console.error('[SCHEDULER] Hata:', err.message);
    } finally {
      this.isSending = false;
    }
  }

  isWithinSendingHours(campaign) {
    const tz = campaign.timezone || 'Europe/Istanbul';
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date());
    const [ch, cm] = localTime.split(':').map(Number);
    const [sh, sm] = (campaign.send_start_time || '00:00').split(':').map(Number);
    const [eh, em] = (campaign.send_end_time || '23:59').split(':').map(Number);
    const cur = ch * 60 + cm, start = sh * 60 + sm, end = eh * 60 + em;
    return cur >= start && cur <= end;
  }

  isActiveDay(campaign) {
    const nowDay = new Date().getDay() === 0 ? 7 : new Date().getDay();
    const days = (campaign.active_days || '1,2,3,4,5').split(',').map(Number);
    return days.includes(nowDay);
  }

  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async buildCampaignQueue(campaignId) {
    const campaign = campaignsDB.getById(campaignId);
    if (!campaign) throw new Error('Kampanya bulunamadı');

    const template = templatesDB.getById(campaign.template_id);
    if (!template) throw new Error('Şablon bulunamadı');

    const filter = campaign.target_filter ? JSON.parse(campaign.target_filter) : {};
    const contacts = contactsDB.getAll({ category: filter.category || undefined, status: 'pending' });

    // Kuyrukta zaten bulunan (pending veya failed) kişileri tekrar ekleme
    const existingContactIds = new Set(queueDB.getCampaignContactIds(campaignId));

    // ★ Kara listedekiler ve kuyrukta zaten olanlar atlanır
    const items = contacts
      .filter(c => !blacklistDB.isBlacklisted(c.phone) && !existingContactIds.has(c.id))
      .map(c => ({
        campaign_id: campaignId,
        contact_id: c.id,
        phone: c.phone,
        message: this.interpolate(template.content, c),
        scheduled_at: null
      }));

    queueDB.addToQueue(items);
    console.log(`[SCHEDULER] Kampanya kuyruğu: ${items.length} mesaj eklendi (${contacts.length - items.length} kara listede atlandı)`);
    return items.length;
  }

  interpolate(content, contact) {
    return content
      .replace(/\{isletme_adi\}/g, contact.business_name || '')
      .replace(/\{telefon\}/g,     contact.phone || '')
      .replace(/\{email\}/g,       contact.email || '')
      .replace(/\{adres\}/g,       contact.address || '')
      .replace(/\{web\}/g,         contact.website || '')
      .replace(/\{puan\}/g,        contact.rating || '')
      .replace(/\{yorum_sayisi\}/g, contact.review_count || '')
      .replace(/\{kategori\}/g,    contact.category || '');
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      todaySent: queueDB.getTodaySentCount().count,
      globalStats: queueDB.getStats()
    };
  }
}

module.exports = new MessageScheduler();
