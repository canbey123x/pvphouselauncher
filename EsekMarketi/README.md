# 🐴 EsekMarketi

Eşekli, mobil uyumlu **market işletme oyunu**. Raflarını doldur, fiyatlarını belirle, kasada müşterileri karşıla. Siparişlerini kasabanın en çalışkan eşeği arabasıyla depona getirir.

> **Temel proje:** Bu oyun [ShopSim 3D](https://github.com/Ishu-dev/shop-sim-3d) (Copyright © 2026 Ishu Chaudhary, MIT lisansı) üzerine kuruldu. Orijinal kod bu repoda ayrı bir commit olarak değiştirilmeden içe aktarıldı (`EsekMarketi: import ShopSim 3D ...`). Sonraki commit'ler onu market işletme oyununa dönüştürdü.
>
> ShopSim 3D'den alınanlar: market binası ve duvar yerleşimi, raf modeli, karakter modeli, 5 kamera modu (izometrik, üçüncü şahıs, kuşbakışı, serbest, birinci şahıs), WebAudio ses sistemi, mini harita ve fiyat etiketleri. Three.js r128 (MIT) `three.min.js` olarak gömülüdür.

## 🎮 Oynanış

- **8 reyon, 24 ürün:** Manav (elma, portakal, muz), Fırın (ekmek, simit, poğaça), Süt Ürünleri (süt, ayran, beyaz peynir), İçecek, Atıştırmalık, Kahvaltılık (zeytin, bal, reçel), Bakliyat (pirinç, mercimek, makarna), Temizlik.
- **Stok:** Her ürünün raf stoğu (24 adet) ve depo stoğu ayrı tutulur. Müşteriler raftan alır; raf boşalırsa üzülürler.
- **📦 Sipariş tableti:** Koli (12 adet) sipariş et ve satış fiyatlarını ayarla. Pahalı fiyatı müşteri almaz, ucuz fiyat kârını düşürür.
- **🐴 Eşek arabası:** Siparişleri arka kapıdan depoya getirir, kolileri tek tek indirir. Gelince eşeği sevmeyi unutma 🥕
- **🧺 Rafa dizme:** Depodaki paletten koliyi al, doğru reyonun rafına götür ve diz.
- **🧾 Kasa:** Müşteriler sıraya girer. Kasaya geç, ürünleri tek tek okut, ödemeyi al. Çok bekletirsen müşteri kızıp gider. İstersen kasiyer işe alırsın.
- **⭐ Popülerlik:** Mutlu müşteri popülerliği artırır, popülerlik de daha çok müşteri getirir. Boş raf, pahalı fiyat ve bekleyen kuyruk düşürür.
- **🔓 Lisanslar ve geliştirmeler:** Atıştırmalık, Kahvaltılık, Bakliyat ve Temizlik reyonlarını lisans alarak açarsın. Ayrıca kasiyer, hızlı eşek ve mahalle reklamı alınabilir.
- **📅 İş günü:** Market 08:00–22:00 arası açıktır. Gün sonunda ciro, sipariş, kira, maaş ve net kâr raporu çıkar.
- **💾 Kayıt:** Oyun kendiliğinden kaydedilir; menüden *Devam Et* ile kaldığın yerden sürersin.

## 🕹️ Kontroller

| Eylem | Dokunmatik | Klavye |
|---|---|---|
| Yürü | Sol alttaki joystick | WASD / ok tuşları (Shift = koş) |
| Eylem (koli al, rafa diz, kasaya geç, okut, eşeği sev) | Yeşil büyük buton | E / Boşluk |
| Koliyi depoya geri gönder / kasadan çık | Turuncu buton | Q |
| Sipariş tableti | 📦 Sipariş | O |
| Kamera | Alttaki kamera butonları, sürükleme | C, sürükleme, tekerlek |
| Mini harita | — | M |

## 📁 Yapı

```
EsekMarketi/
├── index.html            # Arayüz: HUD, joystick, sipariş tableti, gün sonu raporu
├── js/game.js            # Oyun: market, raflar, depo, eşek, müşteriler, kasa, ekonomi
├── three.min.js          # Three.js r128 (gömülü, internetsiz çalışır)
├── manifest.webmanifest  # Ana ekrana eklenebilir web uygulaması
├── sw.js                 # Çevrimdışı önbellek
├── icons/                # Uygulama ikonları
├── android/              # APK için WebView sarmalayıcısı
└── LICENSE               # MIT (orijinal ShopSim 3D lisansı + değişiklik notu)
```

## 🚀 Çalıştırma

- **Tarayıcı:** `index.html` dosyasını doğrudan açabilirsin, ya da `python3 -m http.server` ile sun.
- **Android:** Repodaki `.github/workflows/esekmarketi-apk.yml`, `EsekMarketi/` her değiştiğinde APK'yı derler ve **Releases → esekmarketi-latest** altına `EsekMarketi.apk` olarak koyar.
- **iPhone:** Siteyi HTTPS üzerinden yayınla, Safari'de aç → Paylaş → *Ana Ekrana Ekle*.
