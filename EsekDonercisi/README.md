# 🥙 EsekDonercisi 🐴

Mobil öncelikli, düşük poligonlu (low-poly) **3D Türk kasabası dönerci simülasyonu**.
Derleme yok, `npm install` yok: Three.js CDN üzerinden ES Module olarak yüklenir. GitHub Pages'e at, linke tıkla, telefondan oyna.

## 🎮 Oyun

- **Ana menü:** Animasyonlu başlık, uçuşan malzemeler, arka planda dönen 3D kasaba, **rekor kasa** göstergesi (`localStorage`), *Oyuna Başla / Nasıl Oynanır / Hakkında*.
- **Kasaba:** Kubbeli, iki minareli, alemli ve hilalli **camii** (revak, şadırvan, servi ağaçları), renkli Türk evleri, balkonlar, bakkal, çay ocağı, park ve havuz, dalgalanan Türk bayrakları, sokak süsleri.
- **Eşek Dönercisi dükkânı:** Tabelası, çizgili tentesi, tezgahı ve kendi ekseninde dönen döner şişi.
- **Eşek sürüşü:** Araba mantığında gaz, geri vites, dönüş ve fren. Eşeğin yanına git, **Eşeğe Bin**. Kamera arkandan takip eder. *Anırt* butonunu da dene. 📣
- **Döner kesme:** **Tezgaha Geç**, sonra ekranı **yukarıdan aşağı kaydır**: her kaydırma bir dilim düşürür. Dilimleri **Ekmek Arası 🥖** ya da **Dürüm 🌯** yap, **Servis Et 🛎️**.
- **Müşteriler:** Kaldırımdan yürüyüp sıraya girerler. Başlarındaki balonda sipariş ve sabır çubuğu görünür. Sipariş birebir tutarsa bahşiş alırsın. Çok bekletirsen sinirlenip giderler.
- **NPC'ler ve diyalog:** İmam Hüseyin Efendi, Muhtar Rıza (bankta), Fatma Teyze, Çaycı Cemil, Bakkal Nuri, Küçük Emre ve Turist John. Yaklaşınca **Konuş** butonu çıkar. Alt ekranda iki seçenekli, esprili Türkçe diyaloglar açılır. Bazı cevaplar para kazandırır (ya da kaybettirir 😄).

### Ekonomi

| Ürün | Taban fiyat | Dilim başı |
|---|---|---|
| Ekmek Arası | 90 TL | +15 TL |
| Dürüm | 110 TL | +15 TL |

- Tür ve dilim sayısı birebir tutarsa: tam fiyat + **10–50 TL bahşiş** (müşteri ne kadar az beklediyse o kadar çok).
- Fazla dilim: tam fiyat (fazlası senden).
- Eksik dilim: %70. Yanlış ürün: %50.

### Kontroller

| Eylem | Dokunmatik | Klavye |
|---|---|---|
| Yürü / sür | Sol alttaki joystick | WASD / ok tuşları |
| Kamerayı çevir | Ekranı sürükle | Fare ile sürükle |
| Bağlamsal eylem | Sağ alttaki butonlar | E / Enter |
| Fren | 🛑 Fren (basılı tut) | Boşluk |
| Döner kes | Aşağı kaydır | S / ↓ |
| Ekmek arası / dürüm | Butonlar | 1 / 2 |
| Servis et | 🛎️ Servis Et | Enter |
| Tezgahtan / eşekten in | Butonlar | Q |
| Diyalog seçeneği | Butonlar | 1 / 2 |
| Duraklat | ☰ | P / Esc |

## 📁 Dizin yapısı

```
EsekDonercisi/
├── index.html                  # Ana menü (Landing) + oyun canvas'ı + mobil dokunmatik arayüz
├── style.css                   # Menü, joystick, mobil butonlar ve diyalog stilleri
├── src/
│   ├── main.js                 # Menü/oyun durumu, render döngüsü, sahne, ışıklar, kamera, ses
│   ├── city.js                 # Camii, binalar, yollar, park, dükkân geometrisi ve çarpışmalar
│   ├── donkey.js               # Eşek modeli, sürüş fiziği ve animasyonu
│   ├── cutting.js              # Döner kesme swipe mekaniği ve dilim efektleri
│   ├── customers.js            # Müşteriler, sipariş balonları, kuyruk ve ekonomi
│   ├── npcs.js                 # İnsan modeli, kasaba sakinleri ve diyalog ağacı
│   └── controls.js             # Sanal joystick, kamera sürükleme, klavye
├── .github/workflows/deploy.yml  # main dalına her push'ta GitHub Pages'e yayın
└── README.md
```

## 🚀 Yerelde çalıştırma

ES Module'ler `file://` üzerinden çalışmaz, küçük bir yerel sunucu gerekir:

```bash
cd EsekDonercisi
python3 -m http.server 8080
# Tarayıcıda: http://localhost:8080
# Aynı Wi-Fi'daki telefondan: http://<bilgisayarın-IP-adresi>:8080
```

## 🌍 GitHub Pages'e yayınlama

1. Repoyu oluşturup push'la (komutlar aşağıda).
2. GitHub'da **Settings → Pages → Build and deployment → Source: "GitHub Actions"** seç. Bu tek seferlik bir ayardır.
3. `main` dalına her push'ta `.github/workflows/deploy.yml` siteyi otomatik yayınlar. Adres: `https://<kullanıcı-adın>.github.io/EsekDonercisi/`

```bash
cd EsekDonercisi
git init
git add .
git commit -m "EsekDonercisi: ilk sürüm"
git branch -M main
git remote add origin https://github.com/<kullanıcı-adın>/EsekDonercisi.git
git push -u origin main
```

> GitHub CLI kullanıyorsan `git remote add` ve `git push` yerine tek komut yeterli:
> `gh repo create EsekDonercisi --public --source=. --remote=origin --push`

## 🛠️ Teknik notlar

- **Three.js r160**, `importmap` ile `cdn.jsdelivr.net` üzerinden yüklenir.
- Tüm 3D modeller kodla, ilkel geometrilerle (box, cylinder, cone, sphere, torus, icosahedron) üretilir. Harici model ya da görsel dosyası yoktur. Tabelalar ve bayraklar `<canvas>` ile çizilir.
- Sesler Web Audio API ile anlık sentezlenir: kesme, para, anırma, diyalog cıvıltısı.
- Mobil performans için: `MeshLambertMaterial` + flat shading, önbelleklenen malzemeler, paylaşılan insan geometrileri, oyuncuyu takip eden tek bir gölge kamerası ve en fazla 1.75 piksel oranı.
- Rekor ve ses tercihi `localStorage`'da saklanır.
- Geliştirici kancası: adresin sonuna `?debug` eklersen konsolda `window.__dbg` ile oyun durumunu inceleyebilirsin.

Afiyet olsun, usta! 🥙
