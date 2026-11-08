# Kanka

Arkadaşlar için siyah temalı sosyal medya uygulaması. Android APK olarak kurulur, tarayıcıda da açılır.

- **Ana sayfa:** takip ettiklerinin gönderileri ve repostları, üstte hikâye şeridi ve yönetici duyuruları
- **Reels:** tam ekran, yukarı kaydırmalı dikey videolar (beğen, yorum, repost, gönder, takip et)
- **Hikâye:** 24 saat sonra kaybolur; ilerleme çubukları, dokununca geç, basılı tut = durdur, görenler listesi, yanıt gönder
- **Gönderi:** foto ya da video, açıklama, @etiket ve #etiket, çift dokunuşla beğen
- **Beğeni, repost, yorum:** yorumlara **fotoğraf ve GIF** eklenebilir (cihazdan GIF ya da GIF bağlantısı)
- **Takip sistemi:** takipçi / takip listeleri, profil, profil düzenleme
- **DM:** birebir mesajlaşma, foto, video ve GIF gönderme, mesaj silme, gönderi paylaşma
- **Bildirimler:** beğeni, yorum, takip, repost, mavi tik
- **Mavi tik:** kendine ait rozet tasarımı; kullanıcı başvurur, yönetici onaylar ya da doğrudan verir
- **Şikâyet:** gönderi, yorum, hikâye ve kullanıcı şikâyet edilebilir
- **Yönetim paneli (mobil uyumlu):** genel istatistikler, kullanıcı arama ve filtreleme, mavi tik verme/kaldırma,
  hesabı askıya alma, yönetici yapma, ad/biyografi düzenleme, profil fotoğrafı kaldırma, kullanıcıya bildirim,
  hesabı kapatma (tüm içeriği siler), mavi tik başvuruları, şikâyet kuyruğu (içeriği sil / kullanıcıyı askıya al / kapat),
  gönderi, yorum ve hikâye denetimi, ana sayfa duyuruları, herkese toplu bildirim
- **İkonlar:** hepsi uygulamaya özel çizilmiş SVG; hiçbir yerde emoji yok

**İlk açılan hesap otomatik yönetici olur** ve mavi tik alır.

## İki çalışma modu

### 1. Yerel mod (kurulum yok)
Sunucu ayarı olmadan açılırsa hesaplar ve paylaşımlar **sadece o telefonda** saklanır. Hazır deneme hesabı ya da örnek içerik yoktur;
uygulama boş başlar. (Eski sürümün oluşturduğu deneme hesapları açılışta otomatik silinir.)

### 2. Arkadaşlarla ortak kullanım (ücretsiz Supabase sunucusu)
Herkesin birbirini görmesi için ortak bir sunucu gerekir. Supabase'in ücretsiz planı yeterli:

1. <https://supabase.com> adresinde hesap aç, **New project** de (bölge: Frankfurt önerilir).
2. Sol menüde **SQL Editor > New query**: `supabase/schema.sql` dosyasının tamamını yapıştır, **Run**.
   (Tablolar, güvenlik kuralları, otomatik profil oluşturma ve medya deposu kurulur.)
3. **Authentication > Sign In / Providers > Email**: *Confirm email* seçeneğini kapat
   (kapatmazsan herkes kayıttan sonra e-postasındaki bağlantıya tıklamalı).
4. **Project Settings > API**: `Project URL` ve `anon public` anahtarını kopyala.
5. Uygulamayı sunucuya bağla (üçü de olur):
   - **Otomatik (önerilen):** GitHub'da `KankaSosyal/server.json` dosyasına URL ve publishable/anon anahtarı yaz, kaydet.
     Uygulama her açılışta bu dosyayı okur; herkes kendiliğinden bağlanır, yeni APK gerekmez.
     (Yönetim paneli > **Sunucu** bölümünde hazır içerik ve düzenleme bağlantısı var.)
   - **Davet kodu:** Yönetim paneli > Sunucu'daki `KANKA-...` kodunu arkadaşına gönder; giriş ekranındaki kutuya yapıştırıp *Bağlan* der.
   - **Gömülü:** `KankaSosyal/js/config.js` dosyasına yaz; yeni APK'ya gömülür.
6. Uygulamada ilk **kaydolan** kişi yönetici olur. Sonra arkadaşların kaydolur.

`anon public` anahtarı uygulamaya gömülebilir; veriler `schema.sql` içindeki satır güvenliği (RLS) kurallarıyla korunur.

### İsteğe bağlı: GIF arama
GIPHY'den ücretsiz bir API anahtarı alıp `index.html` içine
`<script>window.KANKA_GIPHY_KEY = 'ANAHTAR';</script>` eklersen GIF penceresinde arama da çıkar.

## APK
`.github/workflows/kanka-apk.yml` bu klasör her değiştiğinde Android APK'sını derler ve
**Releases > `kanka-latest`** altında `Kanka.apk` olarak yayınlar (paket: `com.kanka.sosyal`).

## Dosyalar
```
KankaSosyal/
├── index.html, style.css, manifest.webmanifest, sw.js, icons/
├── js/
│   ├── app.js          # ekranlar ve yönlendirme
│   ├── admin.js        # yönetim paneli
│   ├── api.js          # uygulama mantığı (takip, beğeni, repost, DM, hikâye, mavi tik...)
│   ├── ui.js           # SVG ikonlar, mavi tik rozeti, ortak bileşenler
│   ├── db-local.js     # yerel mod (IndexedDB)
│   ├── db-supabase.js  # ortak sunucu
│   └── config.js       # sunucu adresi ve anahtarı
├── supabase/schema.sql # sunucu kurulumu
└── android/            # WebView sarmalayıcı (dosya seçici destekli)
```

## Yerelde çalıştırma
```bash
cd KankaSosyal
python3 -m http.server 8080   # http://localhost:8080
```
