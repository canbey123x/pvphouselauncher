// =========================================================
// npcs.js — Kasaba sakinleri, insan modeli ve 2 seçenekli Türkçe diyalog ağacı
// =========================================================
import * as THREE from 'three';
import { mat, canvasTexture } from './city.js';

/* ---------------- Ortak insan modeli ---------------- */
const G = {
  leg: new THREE.BoxGeometry(0.22, 0.8, 0.24).translate(0, -0.4, 0),
  shoe: new THREE.BoxGeometry(0.24, 0.12, 0.34).translate(0, -0.8, 0.05),
  torso: new THREE.BoxGeometry(0.62, 0.78, 0.36),
  arm: new THREE.BoxGeometry(0.17, 0.62, 0.2).translate(0, -0.31, 0),
  hand: new THREE.BoxGeometry(0.15, 0.14, 0.16).translate(0, -0.68, 0),
  head: new THREE.BoxGeometry(0.44, 0.44, 0.42),
  eye: new THREE.BoxGeometry(0.07, 0.08, 0.02),
  nose: new THREE.BoxGeometry(0.08, 0.1, 0.08),
  mustache: new THREE.BoxGeometry(0.3, 0.07, 0.04),
  beard: new THREE.BoxGeometry(0.4, 0.16, 0.06),
  hair: new THREE.BoxGeometry(0.46, 0.12, 0.44),
  hairBack: new THREE.BoxGeometry(0.46, 0.3, 0.1),
  scarfTop: new THREE.BoxGeometry(0.5, 0.14, 0.48),
  scarfBack: new THREE.BoxGeometry(0.5, 0.52, 0.12),
  scarfSide: new THREE.BoxGeometry(0.05, 0.46, 0.4),
  kasket: new THREE.BoxGeometry(0.48, 0.1, 0.46),
  brim: new THREE.BoxGeometry(0.46, 0.04, 0.18),
  takke: new THREE.CylinderGeometry(0.2, 0.22, 0.12, 8),
  chef: new THREE.CylinderGeometry(0.21, 0.23, 0.38, 8),
  chefTop: new THREE.CylinderGeometry(0.28, 0.21, 0.14, 8),
  sarik: new THREE.CylinderGeometry(0.27, 0.25, 0.22, 10),
  sarikTop: new THREE.CylinderGeometry(0.14, 0.17, 0.1, 8),
  apron: new THREE.BoxGeometry(0.56, 0.9, 0.04),
  glasses: new THREE.BoxGeometry(0.38, 0.06, 0.02),
  robe: new THREE.BoxGeometry(0.66, 0.8, 0.4),
};

export function createPerson(o = {}) {
  const skin = o.skin ?? 0xf0c08f;
  const shirt = o.shirt ?? 0x3d7dd8;
  const pants = o.pants ?? 0x2f3440;
  const hair = o.hair ?? 0x2b1d14;
  const g = new THREE.Group();
  const M = (geo, color, x, y, z, parent, shadow = true) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };
  const HIP = 0.86;

  const legL = new THREE.Group();
  legL.position.set(-0.15, HIP, 0);
  g.add(legL);
  M(G.leg, pants, 0, 0, 0, legL);
  M(G.shoe, 0x2a2420, 0, 0, 0, legL);
  const legR = new THREE.Group();
  legR.position.set(0.15, HIP, 0);
  g.add(legR);
  M(G.leg, pants, 0, 0, 0, legR);
  M(G.shoe, 0x2a2420, 0, 0, 0, legR);

  const torso = M(G.torso, shirt, 0, HIP + 0.39, 0, g);
  if (o.robe) M(G.robe, o.robe, 0, HIP + 0.05, 0, g);
  if (o.apron) M(G.apron, 0xffffff, 0, HIP + 0.22, 0.2, g, false);

  const armL = new THREE.Group();
  armL.position.set(-0.4, HIP + 0.72, 0);
  g.add(armL);
  M(G.arm, shirt, 0, 0, 0, armL);
  M(G.hand, skin, 0, 0, 0, armL);
  const armR = new THREE.Group();
  armR.position.set(0.4, HIP + 0.72, 0);
  g.add(armR);
  M(G.arm, shirt, 0, 0, 0, armR);
  M(G.hand, skin, 0, 0, 0, armR);

  const head = new THREE.Group();
  head.position.set(0, HIP + 0.78 + 0.24, 0);
  g.add(head);
  M(G.head, skin, 0, 0, 0, head);
  M(G.eye, 0x1a1a1a, -0.1, 0.05, 0.215, head, false);
  M(G.eye, 0x1a1a1a, 0.1, 0.05, 0.215, head, false);
  M(G.nose, skin, 0, -0.03, 0.24, head, false);
  if (o.mustache) M(G.mustache, o.beardColor ?? hair, 0, -0.1, 0.225, head, false);
  if (o.beard) M(G.beard, o.beardColor ?? hair, 0, -0.17, 0.2, head, false);
  if (o.glasses) M(G.glasses, 0x111111, 0, 0.06, 0.225, head, false);

  const hat = o.hat ?? 'none';
  if (hat === 'basortu') {
    const sc = o.scarf ?? 0x9b3a6b;
    M(G.scarfTop, sc, 0, 0.24, -0.01, head);
    M(G.scarfBack, sc, 0, 0.0, -0.2, head);
    M(G.scarfSide, sc, -0.245, -0.02, -0.02, head);
    M(G.scarfSide, sc, 0.245, -0.02, -0.02, head);
  } else {
    if (!o.bald) {
      M(G.hair, hair, 0, 0.25, 0, head);
      M(G.hairBack, hair, 0, 0.08, -0.19, head);
    }
    if (hat === 'kasket') {
      M(G.kasket, o.hatColor ?? 0x5a5148, 0, 0.3, 0, head);
      M(G.brim, o.hatColor ?? 0x5a5148, 0, 0.27, 0.27, head);
    } else if (hat === 'takke') {
      M(G.takke, 0xffffff, 0, 0.29, 0, head);
    } else if (hat === 'chef') {
      M(G.chef, 0xffffff, 0, 0.42, 0, head);
      M(G.chefTop, 0xffffff, 0, 0.66, 0, head);
    } else if (hat === 'sarik') {
      M(G.sarik, 0xffffff, 0, 0.3, 0, head);
      M(G.sarikTop, 0x7a1f2b, 0, 0.44, 0, head);
    }
  }
  return { group: g, legL, legR, armL, armR, head, torso };
}

/** Yürüme / oturma / binme pozları. */
export function animatePerson(p, phase, amount, pose = 'stand') {
  if (pose === 'sit') {
    p.legL.rotation.set(-1.45, 0, 0);
    p.legR.rotation.set(-1.45, 0, 0);
    p.armL.rotation.set(-0.35, 0, 0.05);
    p.armR.rotation.set(-0.35, 0, -0.05);
    return;
  }
  if (pose === 'ride') {
    p.legL.rotation.set(-0.9, 0, -0.5);
    p.legR.rotation.set(-0.9, 0, 0.5);
    p.armL.rotation.set(-0.9, 0, 0.1);
    p.armR.rotation.set(-0.9, 0, -0.1);
    return;
  }
  if (pose === 'wave') {
    p.legL.rotation.set(0, 0, 0);
    p.legR.rotation.set(0, 0, 0);
    p.armL.rotation.set(0, 0, 0.05);
    p.armR.rotation.set(0, 0, -2.6 + Math.sin(phase * 2) * 0.35);
    return;
  }
  const s = Math.sin(phase) * 0.75 * amount;
  p.legL.rotation.set(s, 0, 0);
  p.legR.rotation.set(-s, 0, 0);
  p.armL.rotation.set(-s * 0.9, 0, 0.05);
  p.armR.rotation.set(s * 0.9, 0, -0.05);
}

/* ---------------- Diyalog verisi ---------------- */
// Her düğümde 2 seçenek. Seçenek: next (başka düğüm) ya da reply (kapanış cevabı) + effect.
const NPC_DATA = [
  {
    id: 'imam',
    name: 'İmam Hüseyin Efendi',
    portrait: '👳',
    place: 'imam',
    kind: 'stand',
    look: { shirt: 0xf5f5f0, pants: 0xf5f5f0, robe: 0x2f3e5c, hat: 'sarik', beard: true, mustache: true, beardColor: 0xdddddd, hair: 0xcccccc, skin: 0xe8b98a },
    start: 'a',
    nodes: {
      a: {
        text: 'Hayırlı işler evladım! Döner kokusu ta minareye kadar geliyor. Ezan okurken burnum seğiriyor, makamı şaşırıyorum.',
        options: [
          { label: 'Buyurun hocam, size bir dürüm ısmarlayayım!', next: 'b' },
          { label: 'Kusura bakmayın, aspiratör bozuk.', next: 'c' },
        ],
      },
      b: {
        text: 'Allah razı olsun. Cuma çıkışı cemaati sana yönlendiririm. Yalnız eşeği avluya bağlama, geçen hafta paspası yedi.',
        options: [
          { label: 'Söz hocam, eşek artık disiplinli.', reply: 'İnşallah evladım. Al şu bahşişi, bereketli olsun.', effect: { money: 25, toast: '🤲 Hocadan dua + 25 TL bahşiş!' } },
          { label: 'Paspası değil hocam, ayakkabılığı yedi!', reply: 'Estağfurullah... O zaman ayakkabılık parası da senden! Şaka şaka. 😄' },
        ],
      },
      c: {
        text: 'Varsın bozuk olsun, kokusu bereket getiriyor. Ama müşteriyi bekletme; sabır güzeldir ama açlık daha güçlüdür.',
        options: [
          { label: 'Hemen tezgaha koşuyorum hocam!', reply: 'Koş evladım, koş. Ama eşekle koşma, kaldırım dar.' },
          { label: 'Sabır bende, açlık müşteride.', reply: 'Maşallah, hem dönerci hem filozof çıktın!' },
        ],
      },
    },
  },
  {
    id: 'muhtar',
    name: 'Muhtar Rıza',
    portrait: '👴',
    place: 'muhtar',
    kind: 'sit',
    look: { shirt: 0x6b4f3a, pants: 0x3b3b3b, hat: 'kasket', mustache: true, hair: 0xbbbbbb, beardColor: 0xdddddd, skin: 0xe3b07f },
    start: 'a',
    nodes: {
      a: {
        text: 'Gel bakayım dönerci! Kasabanın en önemli meselesi: Senin eşek dün belediyenin laleleri yemiş!',
        options: [
          { label: 'Muhtarım o bizim eşek değildi, benzerdi!', next: 'b' },
          { label: 'Haklısınız, lale parasını ödeyeyim.', next: 'c' },
        ],
      },
      b: {
        text: 'Benzer mi? Kasabada başka kilim eyerli, nazar boncuklu eşek mi var? Neyse... Seçim yaklaşıyor. Bedava dürüm verirsen bu dosya kapanır.',
        options: [
          { label: 'Oy için dürüm mü? Olur muhtarım!', reply: 'Hah şöyle! Acısı bol olsun. (Muhtar mutlu, kasan biraz hafifledi.)', effect: { money: -20, toast: '🌯 Muhtara "gönüllü" dürüm: -20 TL' } },
          { label: 'Ben dürüst esnafım muhtarım.', reply: 'Hıh! Not ettim seni. Ama dürüstlüğün hoşuma gitti, kimseye söyleme.' },
        ],
      },
      c: {
        text: 'Aferin, dürüst adamsın! Ödeme falan istemem. Sen bu kasabaya hareket getirdin. Al bu da esnafa destek fonundan.',
        options: [
          { label: 'Sağ olun muhtarım!', reply: 'Asıl sen sağ ol. Laleleri de eşeğe değil müşteriye ver. 😄', effect: { money: 50, toast: '🏛️ Muhtarlık desteği: +50 TL' } },
          { label: 'Muhtarım çay da ısmarlasaydınız?', reply: 'Çaycı Cemil\'e söyle, muhtarın hesabına yazsın. (Cemil yazmaz, biliyorum.)' },
        ],
      },
    },
  },
  {
    id: 'fatma',
    name: 'Fatma Teyze',
    portrait: '👵',
    place: 'fatma',
    kind: 'walk',
    look: { shirt: 0x7a4e9b, pants: 0x4b2e5c, hat: 'basortu', scarf: 0xd94f70, skin: 0xeec39a },
    start: 'a',
    nodes: {
      a: {
        text: 'Ay evladım, sen o eşekli dönerci değil misin? Benim oğlan İstanbul\'da, hiç aramıyor. Orada da döner yiyor mudur acaba?',
        options: [
          { label: 'Ben ararım teyzecim, numarası var mı?', next: 'b' },
          { label: 'İstanbul\'da bizimki kadar iyisi yok!', next: 'c' },
        ],
      },
      b: {
        text: 'Var tabii, sıfır beş yüz otuz iki... Aaa unuttum! Neyse, sen bana bir dürüm yap, acısı bol olsun. Tansiyonum zaten tavan.',
        options: [
          { label: 'Teyze tansiyona acı iyi gelmez ki!', reply: 'Doktor gibi konuşma! Ama haklısın, az acılı olsun bari. 😊' },
          { label: 'Bol acılı tansiyon dürümü yolda!', reply: 'Aferin oğlum. Oğlum aramazsa sen ara beni, tamam mı?' },
        ],
      },
      c: {
        text: 'Bak bak, ne tatlı dilin var. Al şu parayı, eşeğine havuç al. Zavallı hayvan, sırtında seni taşıyor.',
        options: [
          { label: 'Eşek adına teşekkürler teyze!', reply: 'Eşeğe selam söyle. Bir de kulağına nazar duası okudum, haberi olsun.', effect: { money: 20, toast: '🥕 Havuç parası: +20 TL' } },
          { label: 'Teyze bazen ben onu taşıyorum.', reply: 'Hıhıhı! Al yine de, ikiniz de yiyin.', effect: { money: 20, toast: '🥕 Havuç parası: +20 TL' } },
        ],
      },
    },
  },
  {
    id: 'cayci',
    name: 'Çaycı Cemil',
    portrait: '🧔',
    place: 'cayci',
    kind: 'stand',
    look: { shirt: 0xffffff, pants: 0x222222, apron: true, mustache: true, hair: 0x1a1a1a, skin: 0xd9a066 },
    start: 'a',
    nodes: {
      a: {
        text: 'Çaaaay! Taze demlendi abi! Döner yanına bir tavşan kanı çay, hatta iki. Üçüncüsü benden!',
        options: [
          { label: 'Ver bir çay Cemil, şekersiz.', next: 'b' },
          { label: 'Ben ayran içerim, kusura bakma.', next: 'c' },
        ],
      },
      b: {
        text: 'Şekersiz mi? Abi sen dönerci misin, diyetisyen mi? Al bakalım: ince belli, tavşan kanı, sanat eseri.',
        options: [
          { label: 'Ohh, bu çay ruhumu ısıttı.', reply: 'Ruh ısınır, döner pişer, kasaba döner abi! ☕', effect: { toast: '☕ Enerji doldu! Usta tazelendi.' } },
          { label: 'Bir tane daha koy, bardak çok küçük!', reply: 'Bardak küçük değil abi, sen büyüksün. İkinci de benden!' },
        ],
      },
      c: {
        text: 'Ayran mı?! Abi bu kasabada çaycının önünde ayran demek, kahvede okey taşı çalmak gibi bir şey...',
        options: [
          { label: 'Tamam tamam, çay olsun!', next: 'b' },
          { label: 'Döner yanında ayran anayasal hakkımdır!', reply: 'Peki abi... Sana küstüm. Yarın barışırız, sabah çayına gel. 😤', effect: { toast: '😤 Cemil sana küstü (ama yarın barışır).' } },
        ],
      },
    },
  },
  {
    id: 'bakkal',
    name: 'Bakkal Nuri',
    portrait: '🧑‍🦲',
    place: 'bakkal',
    kind: 'stand',
    look: { shirt: 0x4a7c59, pants: 0x3b3b3b, apron: true, glasses: true, mustache: true, bald: true, hair: 0x444444, skin: 0xe6b98c },
    start: 'a',
    nodes: {
      a: {
        text: 'Dönerci komşu! Ekmek yine mi bitti? Sana söyledim, fırının ilk ekmeği benim dükkâna gelir.',
        options: [
          { label: 'Nuri abi, ekmeği veresiye yazar mısın?', next: 'b' },
          { label: 'Ekmek tamam, lavaş lazım.', next: 'c' },
        ],
      },
      b: {
        text: 'Veresiye defterim doldu, yenisini aldım, o da doldu. Ama sana yazarım, sen kasabanın gururusun.',
        options: [
          { label: 'Eyvallah abi, ilk fırsatta öderim!', reply: 'Biliyorum öderisin. Al şu da toptancının iade ettiği para, senin hakkın.', effect: { money: 15, toast: '🧾 Nuri abi iade etti: +15 TL' } },
          { label: 'Defteri eşeğe yedirsek borç silinir mi?', reply: 'Silinir de eşek borçlu çıkar o zaman! Hahah!' },
        ],
      },
      c: {
        text: 'Lavaş var, taze taze. Ama dürümü sıkı sar ha! Geçen müşterinin biri dürümden domates fışkırttı, tabelama yapıştı.',
        options: [
          { label: 'Sıkı sarmak benim işim abi!', reply: 'Aferin! Bir domates daha görürsem fatura sana. 🍅' },
          { label: 'O domates reklamdı abi, kırmızı tabela!', reply: 'Hah! Bir de faturasını yollayayım, reklam ajansı!' },
        ],
      },
    },
  },
  {
    id: 'emre',
    name: 'Küçük Emre',
    portrait: '👦',
    place: 'emre',
    kind: 'walk',
    loop: true,
    speed: 2.6,
    look: { shirt: 0xff8c1a, pants: 0x1d4ed8, hair: 0x3b2314, skin: 0xf3c99b },
    scale: 0.72,
    start: 'a',
    nodes: {
      a: {
        text: 'Abiii! Eşeğine binebilir miyim? Bir tur! Yarım tur! Çeyrek tur da olur!',
        options: [
          { label: 'Önce ödevini yaptın mı?', next: 'b' },
          { label: 'Eşek bugün izinli Emre.', next: 'c' },
        ],
      },
      b: {
        text: 'Yaptım! Yani... Matematik hariç. Abi bir eşek kaç dürüm taşır? Ödevde öyle bir soru var gibi.',
        options: [
          { label: 'Bir dönerci ve sonsuz hayal.', reply: 'Vay! Öğretmene aynen böyle yazacağım. On numara!' },
          { label: 'Matematik yap, sonra eşek.', reply: 'Offf tamam... Ama söz, sonra bir tur!' },
        ],
      },
      c: {
        text: 'İzinli mi? Eşeklerin de mi izni var? Ben de okuldan izin istiyorum o zaman!',
        options: [
          { label: 'Al sana dondurma parası, kaç bakalım.', reply: 'Yaşasııın! En iyi dönerci sensin abi!', effect: { money: -10, toast: '🍦 Emre\'ye dondurma: -10 TL' } },
          { label: 'Okul eşekten önemli Emre!', reply: 'Hıh. Büyüyünce ben de eşekli dönerci olacağım, görürsün!' },
        ],
      },
    },
  },
  {
    id: 'john',
    name: 'Turist John',
    portrait: '🧑‍🦰',
    place: 'john',
    kind: 'walk',
    speed: 1.2,
    look: { shirt: 0x5ec8e5, pants: 0xd9b48f, hat: 'kasket', hatColor: 0xf2e6c9, hair: 0xd97a2b, skin: 0xffd9c2, glasses: true },
    start: 'a',
    nodes: {
      a: {
        text: 'Hello! Merhaba! Ben... döner... çok... good! Where is... eşek taksi?',
        options: [
          { label: 'Eşek taksi burada! Ama taksimetre yok.', next: 'b' },
          { label: 'Yes yes, very döner, very good!', next: 'c' },
        ],
      },
      b: {
        text: 'Wonderful! İstanbul\'da arabalar, burada eşek! I love this town. Take this, for... döner bakhshish?',
        options: [
          { label: 'Bahşiş! Thank you very much!', reply: 'You are welcome, usta! Afiyet... olsun? Doğru mu?', effect: { money: 40, toast: '💷 Turist bahşişi: +40 TL' } },
          { label: 'No no, misafirsin, sağ ol!', reply: 'Türk misafirperverliği... amazing! I will cry.', effect: { toast: '⭐ Kasabanın şöhreti arttı!' } },
        ],
      },
      c: {
        text: 'Haha! Very döner! I will tell all my friends in London: EsekDonercisi, five stars!',
        options: [
          { label: 'Yorum yaz, beş yıldız ver!', reply: 'Of course! "Best donkey, best döner." Done!', effect: { toast: '⭐⭐⭐⭐⭐ İnternette yorum geldi!' } },
          { label: 'Londra\'ya şube açarız!', reply: 'Donkey on Thames! Brilliant idea!' },
        ],
      },
    },
  },
];

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/* ---------------- NPC yöneticisi ---------------- */
export class NPCManager {
  constructor(ctx, city) {
    this.ctx = ctx;
    this.city = city;
    this.ui = {
      root: document.getElementById('dialog'),
      name: document.getElementById('dlgName'),
      portrait: document.getElementById('dlgPortrait'),
      text: document.getElementById('dlgText'),
      options: document.getElementById('dlgOptions'),
    };
    this.active = null;
    this.onEnd = null;
    this.typing = null;
    this.currentOptions = [];

    const tex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(w / 2, h / 2 - 6, 48, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(w / 2 - 14, h / 2 + 34);
      g.lineTo(w / 2, h - 4);
      g.lineTo(w / 2 + 10, h / 2 + 34);
      g.fill();
      g.fillStyle = '#e63946';
      g.font = 'bold 54px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('...', w / 2, h / 2 - 16);
    });
    this.indicatorMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });

    this.list = NPC_DATA.map((def) => this._make(def));
    this.ui.text.addEventListener('pointerdown', () => this._skipTyping());
    this.reset();
  }

  _make(def) {
    const person = createPerson(def.look);
    if (def.scale) person.group.scale.setScalar(def.scale);
    this.ctx.scene.add(person.group);
    const indicator = new THREE.Sprite(this.indicatorMat);
    indicator.scale.set(0.6, 0.6, 1);
    indicator.position.y = 2.55;
    indicator.renderOrder = 10;
    person.group.add(indicator);
    const spot = this.city.spots[def.place];
    return {
      id: def.id,
      def,
      person,
      indicator,
      spot,
      pos: new THREE.Vector3(),
      heading: 0,
      phase: Math.random() * 6,
      pathIdx: 1,
      dir: 1,
      talking: false,
      rewarded: false,
      waveT: 0,
    };
  }

  reset() {
    this.close(true);
    for (const n of this.list) {
      n.rewarded = false;
      n.talking = false;
      if (n.def.kind === 'walk') {
        const p = n.spot[0];
        n.pos.set(p[0], 0, p[1]);
        n.pathIdx = 1;
        n.dir = 1;
      } else {
        n.pos.set(n.spot.x, 0, n.spot.z);
        n.heading = n.spot.rot;
      }
    }
  }

  nearest(pos, maxD) {
    let best = null;
    let bd = maxD;
    for (const n of this.list) {
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  update(dt, playerPos, playing) {
    const world = this.ctx.world;
    for (const n of this.list) {
      const def = n.def;
      const dPlayer = Math.hypot(n.pos.x - playerPos.x, n.pos.z - playerPos.z);
      let moving = false;
      if (def.kind === 'walk' && !n.talking && !(playing && dPlayer < 2.2)) {
        const pts = n.spot;
        const tgt = pts[n.pathIdx];
        const dx = tgt[0] - n.pos.x;
        const dz = tgt[1] - n.pos.z;
        const d = Math.hypot(dx, dz);
        const step = (def.speed ?? 1.3) * dt;
        if (d <= step) {
          n.pos.x = tgt[0];
          n.pos.z = tgt[1];
          if (def.loop) n.pathIdx = (n.pathIdx + 1) % pts.length;
          else {
            if (n.pathIdx + n.dir >= pts.length || n.pathIdx + n.dir < 0) n.dir *= -1;
            n.pathIdx += n.dir;
          }
        } else {
          n.pos.x += (dx / d) * step;
          n.pos.z += (dz / d) * step;
          n.heading = lerpAngle(n.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
          moving = true;
        }
      }
      // Oyuncu yakınsa ona dön (oturanlar hariç)
      if (playing && dPlayer < 3 && def.kind !== 'sit') {
        n.heading = lerpAngle(n.heading, Math.atan2(playerPos.x - n.pos.x, playerPos.z - n.pos.z), 1 - Math.exp(-dt * 6));
      }

      n.phase += dt * (moving ? 9 * (def.speed ? def.speed / 1.3 : 1) : 2);
      if (def.kind === 'sit') {
        animatePerson(n.person, n.phase, 0, 'sit');
        n.person.group.position.set(n.pos.x, -0.32, n.pos.z);
        n.person.head.rotation.y = Math.sin(n.phase * 0.3) * 0.3;
      } else {
        if (n.talking) animatePerson(n.person, n.phase, 0, 'wave');
        else animatePerson(n.person, n.phase, moving ? 1 : 0);
        n.person.group.position.set(n.pos.x, world.heightAt(n.pos.x, n.pos.z), n.pos.z);
      }
      n.person.group.rotation.y = n.heading;

      const showInd = playing && !n.talking && dPlayer < 8;
      n.indicator.visible = showInd;
      if (showInd) n.indicator.position.y = 2.55 / (def.scale ?? 1) + Math.sin(n.phase * 1.3) * 0.08;
    }

    // Yazı makinesi efekti
    if (this.typing) {
      const t = this.typing;
      const before = Math.floor(t.shown);
      t.shown = Math.min(t.full.length, t.shown + dt * 55);
      const now = Math.floor(t.shown);
      if (now !== before) {
        this.ui.text.textContent = t.full.slice(0, now);
        if (now % 3 === 0) this.ctx.sfx.talk();
      }
      if (now >= t.full.length) this._finishTyping();
    }
  }

  start(npc, onEnd) {
    this.active = npc;
    this.onEnd = onEnd;
    npc.talking = true;
    this.ui.root.classList.remove('hidden');
    this.ui.name.textContent = npc.def.name;
    this.ui.portrait.textContent = npc.def.portrait;
    this._showNode(npc.def.start);
  }

  _type(text, options) {
    this.typing = { full: text, shown: 0, options };
    this.ui.text.textContent = '';
    this.ui.options.innerHTML = '';
    this.currentOptions = [];
  }

  _skipTyping() {
    if (!this.typing) return;
    this.typing.shown = this.typing.full.length;
    this.ui.text.textContent = this.typing.full;
    this._finishTyping();
  }

  _finishTyping() {
    const opts = this.typing.options;
    this.typing = null;
    this._renderOptions(opts);
  }

  _renderOptions(opts) {
    const box = this.ui.options;
    box.innerHTML = '';
    box.classList.toggle('single', opts.length === 1);
    this.currentOptions = opts;
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'dlg-opt';
      b.innerHTML = `<b>${i + 1}.</b>`;
      b.appendChild(document.createTextNode(o.label));
      b.addEventListener('click', () => this._choose(o));
      box.appendChild(b);
    });
  }

  _showNode(id) {
    const node = this.active.def.nodes[id];
    this._type(node.text, node.options);
  }

  _choose(opt) {
    if (!this.active) return;
    this.ctx.sfx.click();
    if (opt.effect) {
      const npc = this.active;
      let show = !opt.effect.money;
      // Para ödülü/cezası her karakter için oturum başına bir kez uygulanır.
      if (opt.effect.money && !npc.rewarded) {
        npc.rewarded = true;
        this.ctx.addMoney(opt.effect.money);
        show = true;
      }
      if (opt.effect.toast && show) this.ctx.toast(opt.effect.toast, opt.effect.money < 0 ? 'warn' : 'ok');
    }
    if (opt.next) this._showNode(opt.next);
    else if (opt.reply) this._type(opt.reply, [{ label: '👋 Hoşça kal', close: true }]);
    else this.close();
  }

  /** Klavye: 1 / 2 ile seçenek seç, Enter ile metni geç. */
  chooseIndex(i) {
    if (this.typing) {
      this._skipTyping();
      return;
    }
    const o = this.currentOptions[i];
    if (o) this._choose(o);
  }

  get isOpen() {
    return !!this.active;
  }

  close(silent = false) {
    if (this.active) this.active.talking = false;
    const had = !!this.active;
    this.active = null;
    this.typing = null;
    this.currentOptions = [];
    this.ui.root.classList.add('hidden');
    const cb = this.onEnd;
    this.onEnd = null;
    if (had && !silent && cb) cb();
  }
}
