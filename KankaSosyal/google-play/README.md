# Kanka'yı Google Play'e yükleme rehberi

Bu klasörde Play Console'da doldurman gereken her şeyin hazır cevapları var:

| Dosya | Ne için |
|---|---|
| `magaza-metinleri.md` | Uygulama adı, kısa ve uzun açıklama, kategori, iletişim |
| `veri-guvenligi.md` | "Veri güvenliği" (Data safety) formunun cevapları |
| `icerik-derecelendirme.md` | İçerik derecelendirme anketi + hedef kitle + diğer beyanlar |
| `gorseller/` | 512×512 ikon ve 1024×500 öne çıkan görsel |

Sözleşmeler uygulamanın içinde ve web'de:

| Belge | Uygulamada | Web (site yayındayken) |
|---|---|---|
| Gizlilik Politikası | Ayarlar > Sözleşmeler | `https://kankaa.com.tr/legal/gizlilik-politikasi.html` |
| Kullanım Koşulları | Ayarlar > Sözleşmeler | `https://kankaa.com.tr/legal/kullanim-kosullari.html` |
| Topluluk Kuralları | Ayarlar > Sözleşmeler | `https://kankaa.com.tr/legal/topluluk-kurallari.html` |
| Çocuk Güvenliği Standartları | Ayarlar > Sözleşmeler | `https://kankaa.com.tr/legal/cocuk-guvenligi.html` |
| Hesap ve Veri Silme | Ayarlar > Sözleşmeler | `https://kankaa.com.tr/legal/hesap-silme.html` |

> Alan adın henüz açılmadıysa GitHub Pages'i aç (Settings > Pages > gh-pages) ve aynı yolları
> `https://canbey123x.github.io/pvphouselauncher/legal/...` adresiyle kullan. Play, gizlilik politikası
> için herkese açık, PDF olmayan, çalışan bir web adresi ister.

**Önemli:** Belgelerde iletişim adresi olarak `destek@kankaa.com.tr` yazıyor. cPanel'de
**Email Accounts** bölümünden bu adresi oluştur (ya da kullandığın adresle değiştir) ve gelen e-postaları
gerçekten oku; Play ve kullanıcılar bu adrese yazar. Belgeler genel bir şablondur, hukuki danışmanlık
değildir; uygulama büyürse bir avukata kontrol ettirmeni öneririm.

---

## Adım adım

### 1. Geliştirici hesabı
1. <https://play.google.com/console> adresinde hesap aç (bir kerelik **25 $**).
2. Hesap türü: **Kişisel**. Kimlik doğrulaması ister (kimlik + adres). Birkaç gün sürebilir.
3. **Kişisel hesaplar için kural:** Yeni kişisel hesaplarda uygulamayı herkese açmadan önce
   **kapalı test** zorunlu: en az **12 test kullanıcısı**, en az **14 gün** boyunca uygulamayı
   yüklü tutmalı. Arkadaşlarını test kullanıcısı olarak ekle (Gmail adresleriyle).

### 2. Uygulama dosyası (AAB)
GitHub Actions her derlemede iki dosya üretir (Releases > `kanka-latest`):
- `Kanka.apk` – arkadaşlarına doğrudan dağıtmak için (uygulama içi güncellemeli)
- `Kanka-play.aab` – **Play'e yüklenecek dosya**. Play kuralları gereği bu sürümde
  "kendini güncelleme" özelliği ve `REQUEST_INSTALL_PACKAGES` izni **yoktur**; güncellemeleri Play yapar.

Play Console'da **Play Uygulama İmzalama**'yı kabul et. AAB senin GitHub gizli ayarlarındaki
anahtarla imzalı; Play bunu **yükleme anahtarı** olarak kaydeder. Anahtarı (KANKA_KEYSTORE_B64 ve şifresi)
kaybetme: yeni sürüm yüklemek için gerekir.

> Not: Play'den indirilen sürüm ile GitHub APK'sı aynı paket adını kullanır ama Play kendi anahtarıyla
> imzaladığı için **ikisi birbirinin üstüne kurulmaz**. Arkadaşların ya Play'den ya APK'dan kullansın.

### 3. Uygulamayı oluştur
Play Console > **Uygulama oluştur**:
- Uygulama adı: **Kanka**
- Varsayılan dil: **Türkçe**
- Uygulama / oyun: **Uygulama**
- Ücretsiz / ücretli: **Ücretsiz**
- Beyanlar: geliştirici politikaları ve ABD ihracat yasaları kutularını işaretle.

### 4. "Uygulamanızı ayarlayın" görevleri
Sırayla doldur (cevaplar bu klasördeki dosyalarda):
1. **Gizlilik politikası:** yukarıdaki gizlilik politikası adresi
2. **Uygulama erişimi:** "Tüm işlevler özel erişim olmadan kullanılabilir" DEĞİL → giriş gerekiyor.
   "Tüm veya bazı işlevler kısıtlı" seç ve inceleme ekibi için bir **test hesabı** ver
   (uygulamada bir test hesabı aç: e-posta + şifre, talimat: "Giriş yap, ana sayfa ve profil").
3. **Reklamlar:** Hayır, reklam içermiyor.
4. **İçerik derecelendirmesi:** `icerik-derecelendirme.md`
5. **Hedef kitle:** 13–15, 16–17, 18+ (13 yaş altı seçme). Çocuklara yönelik değil.
6. **Haber uygulaması:** Hayır.
7. **Veri güvenliği:** `veri-guvenligi.md`
8. **Devlet uygulaması / finans / sağlık:** Hayır.
9. **Çocuk güvenliği standartları:** çocuk güvenliği sayfasının adresi + iletişim e-postası
   (`destek@kankaa.com.tr`). Kullanıcı tarafından oluşturulan içerik (UGC) ve sosyal özellikler
   olduğu için zorunlu.
10. **Hesap silme:** "Kullanıcılar uygulamada hesap oluşturabilir" → evet. Silme adresi:
    hesap silme sayfası. Uygulama içi yol: Ayarlar > Hesabımı sil.

### 5. Mağaza girişi
`magaza-metinleri.md` ve `gorseller/` klasörünü kullan. En az 2 telefon ekran görüntüsü
gerekir (Kanka'yı açıp ana sayfa, reels, profil, düzenleyici ekranlarının görüntüsünü al).

### 6. Kapalı test → üretim
1. **Test > Kapalı test** > yeni kanal > `Kanka-play.aab` yükle > test kullanıcılarını ekle > incelemeye gönder.
2. 12+ test kullanıcısı 14 gün kullandıktan sonra **Üretim erişimi için başvur**.
3. Onaylanınca **Üretim** kanalına aynı/yeni sürümü yükle.

### Sürüm numarası
`versionCode` her GitHub derlemesinde otomatik artar (Actions çalıştırma numarası). Play aynı numarayı
iki kez kabul etmez; her yüklemede en son derlenen AAB'yi kullan.

## Uygulamadaki Play uyumlulukları (yapıldı)
- 13 yaş sınırı (kayıtta doğum tarihi), mavi tik için 18 yaş + yüz fotoğrafı
- Kayıtta sözleşme onayı, uygulama içinde tüm sözleşmeler
- Uygulama içinden hesap silme + web'de silme talimatı
- Kullanıcı engelleme, şikâyet (çocuk güvenliği nedeni dahil), moderasyon (kısıtlama/yasak + itiraz)
- Hedef SDK 35, kenardan kenara ekran uyumu
- Play sürümünde kendini güncelleme ve paket yükleme izni yok
- Kamera izni sadece mavi tik selfie'si için, kullanıcı istediğinde sorulur
