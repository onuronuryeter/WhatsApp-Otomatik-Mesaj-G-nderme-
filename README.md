# 📱 WhatsApp Business Otomatik Mesaj Botu

Google Haritalar'dan veya farklı kaynaklardan yasal yollarla edindiğiniz işletme verilerini kullanarak WhatsApp Business (veya kişisel) üzerinden otomatik tanıtım mesajları göndermenizi sağlayan tam kapsamlı ve profesyonel bot sistemidir.

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Node.js 18+ ([nodejs.org](https://nodejs.org))
- WhatsApp Business veya Kişisel hesap (Bağlanmak için telefonunuz gereklidir)

### Kurulum (Geliştiriciler İçin)

1. **Projeyi indirin:**
```bash
git clone https://github.com/onuronuryeter/WhatsApp-Otomatik-Mesaj-G-nderme-.git
cd "WHATSAPP OTOMATİK MESAJ BOTU"
```

2. **Gerekli paketleri yükleyin:**
```bash
npm install
```

3. **Uygulamayı başlatın:**
```bash
npm start
```
*(Alternatif olarak proje dizinindeki `BAŞLAT.bat` dosyasına çift tıklayarak tek tıkla kurulum ve çalıştırma yapabilirsiniz.)*

### 🛠 Kurulum (Son Kullanıcılar İçin)
Uygulamayı indirdikten sonra klasörün içerisindeki `dist/WhatsApp Mesaj Botu Setup 1.1.7.exe` dosyasını çalıştırarak programı normal bir Windows uygulaması gibi bilgisayarınıza kurup kullanabilirsiniz.

---

## 🎯 Nasıl Kullanılır?

1. **WhatsApp'a Bağlanma:**
   - Uygulama açıldığında sol menüden **"WhatsApp Bağlantısı"** sekmesine gidin.
   - **Bağlan / Yenile** butonuna tıklayarak ekrana QR kodun gelmesini bekleyin.
   - Telefonunuzdan WhatsApp'ı açın -> **Bağlı Cihazlar** -> **Cihaz Ekle** diyerek ekrandaki QR kodu okutun.
   - Bağlantı sağlandığında durum "Hazır" olarak güncellenecektir. *(Oturumunuz kalıcı olarak kaydedilir, her girişte tekrar QR okutmanız gerekmez.)*

2. **Kişileri İçe Aktarma:**
   - **Kişiler** sekmesine gidin.
   - Excel (`.xlsx`, `.xls`) veya `.csv` dosyanızı **"İçe Aktar"** butonu ile sisteme yükleyin.
   - Tablonuzdaki (İşletme Adı, Telefon, Kategori vb.) bilgiler otomatik olarak eşleşecektir.

3. **Şablon Oluşturma:**
   - **Şablonlar** bölümüne gelerek yeni bir şablon oluşturun.
   - Mesajınızda `{isletme_adi}`, `{telefon}`, `{kategori}` gibi değişkenler kullanarak mesajları işletmelere özel olarak kişiselleştirebilirsiniz.

4. **Kampanya Başlatma:**
   - **Kampanyalar** bölümünden "Yeni Kampanya" oluşturun.
   - Hangi hedef kitleye (kategoriye), hangi şablonla gönderim yapılacağını, iki mesaj arasındaki bekleme süresini (örn: 45-180 saniye) ve günlük limitinizi ayarlayın.
   - Kampanyayı başlattığınızda sistem arka planda güvenli zaman aralıklarıyla mesajları göndermeye başlayacaktır.

---

## ✨ Öne Çıkan Özellikler

- **🔒 Güvenli Gönderim & Bot Tespiti Koruması:** Rastgele bekleme süreleri ve gün/saat kısıtlamaları sayesinde hesabınızın spama düşme riskini en aza indirir.
- **🚫 Otomatik Kara Liste:** Kendisine başarıyla mesaj iletilen bir numara otomatik olarak kara listeye alınır ve gelecekte aynı numaraya tekrar mesaj atılması (spam yapılması) engellenir. Dilerseniz özel numaraları manuel olarak da kara listeye ekleyebilirsiniz.
- **📊 Gelişmiş Dashboard:** Gönderilen, bekleyen, ulaşılamayan mesaj sayılarını ve günlük aktivite grafiklerini canlı olarak takip edin.
- **⚙️ Tam Kontrol:** Gönderim saat aralıklarını (Örn: Sadece 09:00 - 18:00 arası), hafta içi/hafta sonu kurallarını ve saat dilimini dilediğiniz gibi özelleştirin.
- **⚡ Masaüstü (Electron) Mimarisi:** Arka planda çalışan bir web sunucusuna ihtiyaç duymaz. Tamamen sistem tepsisine küçültülerek (Tray) bir masaüstü uygulaması gibi arka planda çalışmaya devam eder.

---

## 📂 Excel Dosyası Formatı

Yükleyeceğiniz dosyadaki başlıkların şu şekilde (veya İngilizce karşılıklarıyla) olması eşleştirmeyi kolaylaştırır:

| Türkçe Başlık | Alan |
|---|---|
| İşletme Adı | İşletmenin veya kişinin adı |
| Telefon | Telefon (Örn: +90 5XX XXX XX XX) (**Zorunlu**) |
| Kategori | Sektör veya kategori |
| Adres | Adres bilgisi |
| E-posta | İletişim e-postası |
| Web Sitesi | İşletme web sitesi |
| Puan | Google/Yelp vb. değerlendirme puanı |
| Yorum Sayısı | Toplam yorum sayısı |

---

## ⚠️ Uyarı ve Tavsiyeler

- WhatsApp bot tespit sistemlerine yakalanmamak için günlük gönderim limitinizi başlangıçta düşük (50-100) tutun ve zamanla (max 200-300'e kadar) artırın.
- Mesajlar arasındaki **bekleme süresini** (min/max) en az 45-180 saniye gibi güvenli bir aralıkta tutun.
- Uygulama sadece ticari iletişim izni olan veya hedeflenmiş işletme (B2B) numaralarına yönelik kullanım için tasarlanmıştır.

---

## 🛠 Teknik Mimari
- **Arayüz:** Electron, HTML/CSS/JS (Vanilla)
- **WhatsApp Altyapısı:** whatsapp-web.js (WWebJS v2.2412.54 Remote Cache kullanılarak güncel WhatsApp Web kısıtlamalarından etkilenmez)
- **Veritabanı:** JSON File-based kalıcı DB (`userData` dizininde saklanır)

---

## 🤝 Katkıda Bulunma
Projeyi geliştirmek için fork'layabilir, yeni özellikler ekleyebilir ve Pull Request gönderebilirsiniz. 
