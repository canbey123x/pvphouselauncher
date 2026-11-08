# ☕ Eşek Kıraathanesi 🐴

Mobil öncelikli **3D Türk kasabası kahvehane (kıraathane) simülasyonu**. EsekDonercisi'nin kasabası, eşeği ve gece-gündüz sistemi üzerine kuruldu; dönerci dükkânının yerinde artık caddeye açık, tenteli bir kıraathane var.
Derleme yok, `npm install` yok: Three.js CDN üzerinden ES Module olarak yüklenir. GitHub Pages'e at, linke tıkla, telefondan oyna. Android için APK de derlenir.

## 🎮 Oynanış

- **Kepenk:** Sabah kıraathanenin önüne git (sarı ok yolu gösterir), *Kepengi Aç*. Gece *Kepengi İndir*, sonra eve git ve uyu.
- **Birinci şahıs içeride:** Kıraathaneye girince kamera gözünden görür, elinde metal çay tepsisi taşırsın. Sürükleyerek etrafa bakarsın.
- **Ocak (arka sol):** Bakır semaver, siyah emaye çaydanlık, cezve ve temiz bardaklar.
  - *Çay Demle* → ibre **yeşile (tavşan kanı)** gelince *Çay Doldur*. Erken doldurursan açık, geç kalırsan acı olur.
  - *Kahve Pişir* → köpürünce *Kahveyi Al*. Bekletirsen taşar!
  - Oralet, soda, su ve simit de tepsiye konur.
- **Siparişler:** Müşteri grupları caddeden gelir, çiçekli örtülü masalara oturur, biri **el kaldırır**. Başlarının üstündeki balonda ne istedikleri (🍵 ☕ 🍊 🫧 💧 🥯) ve sabır çubuğu görünür. Masaya yaklaş, *Servis Et*.
- **Oyunlar:** Bazı masalar okey 🀄, tavla 🎲 ya da iskambil 🃏 ister. Arka sağdaki raftan takımı al, masaya ver. Oynayan masa daha uzun oturur, daha çok çay içer ve masa ücreti öder.
- **Kasa (sağ ön):** Kalkan masadan biri kasaya gelir. Kasanın arkasına geç, *Ödeme Al*. İyi çay ve hızlı servis bahşiş getirir; çok bekletirsen parayı bırakıp bahşişsiz çıkar.
- **Bardaklar:** Boşalan masayı *Topla*, kirli bardakları soldaki lavaboda *Yıka*. Temiz bardak biterse çay dolduramazsın.
- **TV ve maç akşamı:** Arka duvardaki TV'de haber ya da maç. İki günde bir 19:00-22:00 arası maç var; TV açıksa kıraathane dolar.
- **Stok:** Kuru çay, şeker, kahve, oralet, soda, su → *Bakkal Nuri* · toptan çay/şeker/kahve → *Toptan Çay* · simit → *Fırın*.
- **Nalbur yükseltmeleri:** 5. ve 6. masa, büyük bakır semaver (20 bardak, daha geç acılaşır), +12 bardak, büyük tepsi (10 parça), ek okey takımı ve tavla, büyük ekran TV, neon tabela, eşeğe çelik nal.
- **Popülerlik ⭐:** Memnun masalar artırır; kaçan müşteri, açık/acı çay ve kapalı kıraathane düşürür. Arttıkça daha çok müşteri gelir.
- **Kasaba hayatı:** Eşeğe bin, kasabalılarla konuş, dükkânlara gir (lokanta, tatlıcı, hamam, berber...), gece evinde uyu. Eşek kahvehaneye giremez 🐴

### Fiyatlar

| Ürün | Fiyat |
|---|---|
| Çay 🍵 | 10 TL |
| Türk kahvesi ☕ | 35 TL |
| Oralet 🍊 | 12 TL |
| Soda 🫧 | 15 TL |
| Su 💧 | 8 TL |
| Simit 🥯 | 15 TL |
| Okey masası 🀄 | 20 TL |
| Tavla / iskambil | 10 TL |

Her gün kepenk açıldıysa kira + elektrik + tüp: 60 TL.

## ⌨️ Kontroller

- **Telefon:** sol alttaki joystick ile yürü, ekranı sürükleyerek bak, sağ alttaki bağlamsal butonlarla eylem yap.
- **Klavye:** WASD/oklar yürü · E eylem · R ikinci eylem · ocakta 1-7 düğmeler, Q çıkış · C kamera · P duraklat.

## 📱 APK

`.github/workflows/kiraathane-apk.yml` bu klasör her değiştiğinde Android APK'sını derler ve
**Releases → `kiraathane-latest`** altında `EsekKiraathanesi.apk` olarak yayınlar (paket: `com.esekkiraathane.game`).

## 🗂️ Dosyalar

```
KiraathaneSim/
├── index.html, style.css, manifest.webmanifest, sw.js, icons/
├── src/
│   ├── main.js        # oyun durumu, kamera (dışarıda takip, içeride birinci şahıs), HUD, ocak paneli
│   ├── kiraathane.js  # kahvehane binası, masalar, müşteri grupları, ocak, kasa, TV, oyun takımları
│   ├── city.js        # kasaba
│   ├── shops.js       # dükkân kataloğu ve iç mekânı
│   ├── npcs.js, life.js, donkey.js, house.js, daynight.js, controls.js
└── android/           # WebView sarmalayıcı (Gradle)
```

## 🚀 Yerelde çalıştırma

```bash
cd KiraathaneSim
python3 -m http.server 8080
# tarayıcıda: http://localhost:8080
```

Tüm modeller (kahvehane, semaver, okey ıstakaları, tavla, eşek...) Three.js ilkel geometrileriyle kodla üretilmiştir; harici 3D dosya veya başka bir oyundan alınmış içerik yoktur.
