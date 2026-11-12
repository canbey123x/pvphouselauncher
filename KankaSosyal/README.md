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

**İlk açılan hesap otomatik kurucu (en yetkili yönetici) olur** ve mavi tik alır.

### Güvenlik, gizlilik ve moderasyon
- **Sunucu tarafı kurallar (RLS):** kimse kendi mavi tikini, rolünü, yasağını değiştiremez; başkasının verisini düzenleyemez; gizli hesapların gönderilerini takipçi olmadan çekemez; sahte sistem bildirimi gönderemez.
- **Gizli hesap + takip istekleri**, mesaj izni (herkes / takip ettiklerim / kimse), beğeni sayısını gizleme, **engelleme**.
- **Kısıtlama ve yasak:** sebep ve süreyle (1/3/7/30 gün, süresiz); kullanıcıya tam ekran bildirim ve **itiraz**.
- **Kurucu ve yönetici koruması:** yöneticiler kısıtlanamaz/yasaklanamaz; yöneticiliği sadece kurucu verip alır; kurucu hesabı değiştirilemez ve silinemez.
- **Mavi tik:** ad soyad + doğum tarihi (18+) + yüz fotoğrafı (gizli depoda, karar sonrası silinir).
- **Algoritma:** "Senin için" akışı etkileşim, yakınlık, ilişki, tazelik ve görülmüşlüğe göre sıralar; "Takip ettiklerin" kronolojiktir.
- **Yaş sınırı 13**, kayıtta sözleşme onayı, uygulama içinden **hesap silme**.

Mevcut sunucuya bu özellikler için **`supabase/guncelleme-2.sql`** bir kez çalıştırılmalı (sıfırdan kurulumda `schema.sql` yeterli).

### Google Play
`google-play/` klasöründe adım adım yükleme rehberi, mağaza metinleri, veri güvenliği formu ve içerik derecelendirme cevapları var. Sözleşmeler `legal/` klasöründe (uygulamada: Ayarlar > Sözleşmeler).

## Sürüm 3: yeni özellikler ve kurulum

Kaydedilenler, çoklu fotoğraf (10'a kadar), kişi etiketleme, hashtag sayfaları ve gündem, arama geçmişi ve
"ortak arkadaş" önerileri, "İlgilenmiyorum", gönderi istatistikleri, yakın arkadaşlar hikâyesi, hikâye anketi /
soru / tepki, profil vitrini, grup sohbeti, görüldü / yazıyor, sesli mesaj, açık tema, profil bağlantısı
(`kankaa.com.tr/@kullanici`) ve **sesli arama** (spam korumalı).

### 1. Veritabanı (zorunlu)
Supabase > SQL Editor > `supabase/guncelleme-3.sql` dosyasının tamamını yapıştır > **Run**.

### 2. Telefon bildirimleri ve kilit ekranında arama ekranı (uygulama kapalıyken)
Uygulama açıkken arama ekranı bu adımlar olmadan da anında gelir. Uygulama kapalı / telefon kilitliyken
gelmesi için Firebase gerekir (ücretsiz):

1. https://console.firebase.google.com > **Proje ekle** (ad: Kanka, Analytics kapalı olabilir).
2. Proje içinde **Android uygulaması ekle** > paket adı: `com.kanka.sosyal` > **google-services.json** indir.
3. GitHub > depo > Settings > Secrets and variables > Actions > **New repository secret**:
   ad `GOOGLE_SERVICES_JSON`, değer: indirdiğin dosyanın tüm içeriği.
4. Firebase > Proje ayarları > **Hizmet hesapları** > **Yeni özel anahtar oluştur** (bir JSON iner).
5. Supabase > **Edge Functions** > Deploy a new function > **Via Editor** > ad: `push` >
   `supabase/functions/push/index.ts` içeriğini yapıştır > Deploy. Fonksiyonun ayarlarında **Verify JWT** kapalı olsun.
6. Supabase > Edge Functions > **Secrets** > ad `FCM_SERVICE_ACCOUNT`, değer: 4. adımda inen JSON'un tamamı.
7. Supabase > SQL Editor > `supabase/guncelleme-4-bildirim.sql` > **Run**.
8. Yeni APK'yı kur, uygulamayı bir kez aç (ilk açılışta bildirim ve mikrofon izni sorulur).

Not: Android 13 ve üstünde bildirim, sesli arama için de mikrofon izni sistem tarafından zorunludur;
uygulama bunları sadece ilk açılışta bir kez sorar, sonra aramalar sorusuz ve anında gelir.

### Sesli arama ve spam koruması
- Kimlerin arayabileceği: Ayarlar > Gizlilik > "Seni kimler sesli arayabilir?" (herkes / takip ettiklerim / kimse).
- Sunucu tarafında: 10 dakikada en fazla 6 arama, aynı kişiye saatte en fazla 3 cevapsız arama, günde 40 arama;
  24 saatten yeni hesaplar sadece kendilerini takip edenleri arayabilir; engelli ve kısıtlı hesaplar arayamaz.
- Gelen arama ekranında **Engelle ve spam olarak bildir** düğmesi var.
- Mobil ağlarda (4G/5G) aramaların her zaman bağlanması için bir TURN sunucusu gerekir. Ücretsiz:
  https://www.metered.ca/tools/openrelay/ adresinden hesap aç (ayda 20 GB ücretsiz). Panelde
  "TURN Credentials" kısmındaki API adresini (`https://UYGULAMAADI.metered.live/api/v1/turn/credentials?apiKey=...`)
  kopyala ve `server.json` dosyasına `"turn": "..."` satırı olarak ekle. Uygulama yeniden derlenmeden kullanılır.

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
5. Uygulamayı sunucuya bağla:
   - **Otomatik (önerilen):** GitHub'da `KankaSosyal/server.json` dosyasına URL ve publishable/anon anahtarı yaz, kaydet.
     Uygulama her açılışta bu dosyayı okur; herkes kendiliğinden bağlanır, yeni APK gerekmez.
     (Yönetim paneli > **Sunucu** bölümünde hazır içerik ve düzenleme bağlantısı var.)
   - **Gömülü:** `KankaSosyal/js/config.js` dosyasına yaz; yeni APK'ya gömülür.
6. Uygulamada ilk **kaydolan** kişi yönetici olur. Sonra arkadaşların kaydolur.

`anon public` anahtarı uygulamaya gömülebilir; veriler `schema.sql` içindeki satır güvenliği (RLS) kurallarıyla korunur.

### İsteğe bağlı: GIF arama
GIPHY'den ücretsiz bir API anahtarı alıp `index.html` içine
`<script>window.KANKA_GIPHY_KEY = 'ANAHTAR';</script>` eklersen GIF penceresinde arama da çıkar.

## Web sürümü (ücretsiz, cPanel gerekmez)
`.github/workflows/kanka-web.yml` bu klasör her değiştiğinde web sürümünü **GitHub Pages**'te yayınlar:
**https://canbey123x.github.io/pvphouselauncher/**

İlk seferde bir kez: GitHub'da depo > **Settings > Pages** > *Source*: **Deploy from a branch**,
*Branch*: **gh-pages** ve **/ (root)** > **Save**. Web ve APK aynı Supabase sunucusunu kullanır; aynı hesaplarla girilir.

## Kendi alan adın (cPanel)
Site düz dosyalardan oluşur; PHP/MySQL gerekmez, veriler yine Supabase'dedir (APK ile aynı hesaplar).
`.github/workflows/kanka-cpanel.yml` her değişiklikte siteyi **FTP ile cPanel'e otomatik yükler**.
GitHub'da *Settings > Secrets and variables > Actions* altına `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
(ve istersen `FTP_DIR`, ör. `/public_html/`) ekle. `cpanel.htaccess` siteye `.htaccess` olarak yüklenir (https yönlendirmesi).

## APK
`.github/workflows/kanka-apk.yml` bu klasör her değiştiğinde derler ve **Releases > `kanka-latest`** altında yayınlar (paket: `com.kanka.sosyal`):
- `Kanka.apk`: doğrudan kurulum; açılışta yeni sürümü kontrol eder ve uygulamanın içinden güncellenir.
- `Kanka-play.aab`: Google Play'e yüklenecek dosya (kendini güncelleme özelliği ve paket yükleme izni yok).

İmza anahtarı depoda değildir; GitHub gizli ayarlarında `KANKA_KEYSTORE_B64` ve `KANKA_KEYSTORE_PASSWORD` olarak durur.

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
