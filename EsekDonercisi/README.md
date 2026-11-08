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
- **Gece / gündüz:** 1 oyun saati = 20 saniye. Güneş doğar ve batar; gece ay, yıldızlar, yanan sokak lambaları ve pencereler çıkar. Saat kulesi oyun saatini gösterir.
- **Dükkânı aç / kapat:** Kepenk iner ve kalkar, "AÇIK / KAPALI" levhası değişir. Kapalıyken müşteri gelmez. Öğle (11-14) ve akşam (18-21) saatleri kalabalıktır, 23:00'ten sonra kimse gelmez. Gece açık bırakırsan kasadan para kaybolabilir!
- **Ev ve uyku:** Gül Sokak'ta bahçeli **Usta'nın Evi** var. *Eve Gir* ile içeri girersin: yatak, sedir, çay sehpası. Gece *Uyu* ile sabah 07:00'ye geçilir ve gün özeti çıkar (kazanç, servis, kira). Gündüz *Kestir* 2 saat sürer.
- **Enerji:** Uyanık kaldıkça azalır. Çay içmek biraz verir, uyku tamamen doldurur. Biterse sokakta bayılırsın; bekçi seni eve taşır ama çay parası ister.
- **Genişleyen kasaba:** Ana cadde, mahalle sokağı (Gül Sokak), Pazar Caddesi ve 3 ara sokak var. Ayrıca fırın, berber, eczane, hamam gibi tabelalı dükkânlar, pazar tezgahları, saat kulesi ve tarlalar.
- **Gerçekçi grafik:** PBR malzemeler, filmik renk tonlama, renk geçişli gök kubbesi ve gökyüzünden yansıyan ortam ışığı, 2048'lik gölgeler. Asfalt, kaldırım taşı, çim ve sıva dokuları shader ile üretilir (doku dosyası yok). Duvar diplerinde kir ve gölgelenme var. Duraklat menüsünden *Grafik: Yüksek / Düşük* seçilebilir.
- **Karakterler ve eşek:** Gerçek oranlı, eklemli insanlar (diz, dirsek, yüz: göz, kaş, burun, ağız, kulak). Eşeğin fıçı gövdesi, eklemli bacakları, uzun kulakları, yelesi ve kilim eyeri var; yürüyüşte ve tırısta adımları farklı.
- **Döner pişirme:** Et ocakta pişer. Pişme göstergesi yeşildeyken (kıvamında) kes; çok hızlı kesersen çiğ katmana inersin, çok beklersen yanar. Çiğ ya da yanık dilim fiyatı düşürür. Dilimler kıvrık yaprak gibi kopar; yarım ekmek ve baskılı kağıtlı dürüm modelleri var.
- **Mutfak:** Metro fayanslı duvarlar, davlumbaz, seramik ızgaralı dikey ocak, paslanmaz tezgahlar, salata küvetleri, soslar, ayranlar. Ekmek sepeti ve lavaş yığını stoğa göre dolup boşalır.
- **Şehir hayatı:** Sağdan akan trafik: arabalar oyuncu ve eşek için durur, korna çalar, gece farlarını yakar. Ayrıca kaldırımlarda yaya kalabalığı ve sokak kedileri var. Ortam sesleri: şehir uğultusu, döner cızırtısı, gündüz kuşlar, gece cırcır böcekleri, yakından geçen araba motoru.
- **Malzemeler:** Döner eti, ekmek ve lavaşın yanında domates, soğan, marul, turşu, acı sos, mayonez ve ayran var. Müşteriler istediği malzemeleri, istemediğini (🚫, ör. soğansız) ve ayranı söyler. Kesim ekranındaki malzeme düğmeleriyle seçip ürüne eklersin; ayran yanında servis edilir (+25 TL).
- **Popülerlik ⭐ (0–100):** Kusursuz servis, istenen malzemeler, ayran ve bazı NPC sohbetleri artırır. Çiğ ya da yanık et, istenmeyen malzeme, kaçan müşteri ve kapalı dükkân düşürür; her gün biraz unutulursun. Popülerlik arttıkça daha çok müşteri ve daha yüksek bahşiş gelir. 40, 60, 80 ve 95'te kutlama var (gazete, TV, "Efsane Dönerci").
- **Stok sistemi:** Her dilim döner etinden, her ekmek arası 1 ekmekten, her dürüm 1 lavaştan düşer. Şişteki döner, stoğa göre incelir. Stok azalınca uyarı çıkar, bitince sarı ok seni Kasap'a ya da Fırın'a götürür. Manav'dan salata alırsan her satış +10 TL getirir.
- **Girilebilir dükkânlar (her biri tek):** Fırın, Kasap, Bakkal Nuri, Manav, Çay Ocağı, Lokanta, Tatlıcı, Eczane, Hamam, Berber, Nalbur. İçeride dükkân sahibi tezgahta bekler; *Alışveriş* ile ürün alırsın. Yiyecek ve içecekler enerji verir, hamam enerjiyi tamamen doldurur, berber görünüşünü değiştirir.
- **Yükseltmeler (Nalbur):** Büyük tepsi (12 dilim), şam çeliği bıçak (daha kısa kaydırma), tabure ve masa (müşteriler %40 daha sabırlı), neon tabela (%30 daha çok müşteri), çelik nal (eşek %25 daha hızlı).
- **Kamera:** Engellere girmeyen takip kamerası. Tek parmakla sürükleyince döner ve eğilir, iki parmakla yakınlaşır. 🎥 butonu 4 hazır açı arasında geçiş yapar (Yakın, Normal, Uzak, Kuşbakışı). Yürürken yavaşça arkana döner.
- **Kayıt:** Oyun kendiliğinden kaydedilir; menüden *Devam Et* ile kaldığın yerden sürersin.
- **NPC'ler ve diyalog:** İmam Hüseyin Efendi, Muhtar Rıza (bankta), Fatma Teyze, Çaycı Cemil, Bakkal Nuri, Küçük Emre ve Turist John, Pazarcı Yusuf, Komşu Ayşe Abla ve sadece gece çıkan Bekçi Murtaza. Yaklaşınca **Konuş** butonu çıkar. Alt ekranda iki seçenekli, esprili Türkçe diyaloglar açılır. Bazı cevaplar para kazandırır (ya da kaybettirir 😄).

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
| Kamerayı çevir / eğ | Ekranı sürükle | Fare ile sürükle |
| Yakınlaş / uzaklaş | İki parmak | Fare tekerleği |
| Kamera açısı | 🎥 | C |
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
│   ├── npcs.js                 # İnsan modeli, kasaba sakinleri (gündüz/gece) ve diyalog ağacı
│   ├── daynight.js             # Gece/gündüz: gökyüzü, güneş/ay, yıldızlar, ışıklar
│   ├── house.js                # Ustanın evinin içi: yatak, sedir, çay, kapı
│   ├── shops.js                # Dükkân kataloğu, stok, yükseltmeler ve dükkân içi
│   ├── life.js                 # Trafik, yaya kalabalığı, sokak kedileri
│   └── controls.js             # Sanal joystick, kamera sürükleme/zoom, klavye
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
- Mobil performans için: sabit kasaba parçaları açılışta köşe renkli (vertex color) birkaç büyük geometride birleştirilir. Kasaba yaklaşık 50 draw call ile çizilir; karakterler ve eşek de grup başına tek mesh'e indirgenir. Ayrıca oyuncuyu takip eden tek bir gölge kamerası, lamba ışıltıları için tek bir `Points` nesnesi ve en fazla 1.75 piksel oranı kullanılır.
- Rekor, ses tercihi, kamera açısı ve oyun kaydı (para, stok, yükseltmeler, görünüm) `localStorage`'da saklanır.
- Geliştirici kancası: adresin sonuna `?debug` eklersen konsolda `window.__dbg` ile oyun durumunu inceleyebilirsin.

Afiyet olsun, usta! 🥙
