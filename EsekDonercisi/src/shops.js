// =========================================================
// shops.js — Kasabanın girilebilir dükkânları: katalog (fiyatlar, stok, yükseltmeler)
// ve tek bir yeniden temalandırılan dükkân iç mekânı (tezgah, raflar, dükkân sahibi)
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, canvasTexture, resolveCircle } from './city.js';
import { createPerson, animatePerson } from './npcs.js';

/** Stok türleri (dönerci dükkânının malzemeleri) */
export const STOCK_INFO = {
  meat: { icon: '🥩', name: 'Döner eti', unit: 'dilim' },
  ekmek: { icon: '🥖', name: 'Ekmek', unit: 'adet' },
  lavas: { icon: '🫓', name: 'Lavaş', unit: 'adet' },
  salata: { icon: '🥗', name: 'Salata', unit: 'porsiyon' },
};
export const START_STOCK = { meat: 30, ekmek: 6, lavas: 6, salata: 0 };

/** Dükkân yükseltmeleri (Nalbur'dan alınır) */
export const UPGRADES = {
  tepsi: 'Büyük tepsi: 12 dilim kapasite',
  bicak: 'Keskin bıçak: daha kısa kaydırma yeter',
  tabela: 'Neon tabela: %30 daha çok müşteri',
  tabure: 'Tabure & masa: müşteriler %40 daha sabırlı',
  nal: 'Çelik nal: eşek %25 daha hızlı',
};

/**
 * Her ürünün etkisi: stock (stok ekler), energy (enerji), minutes (zaman geçer),
 * upgrade (bir kerelik yükseltme), look (görünüm değişikliği).
 */
export const CATALOG = {
  firin: {
    title: 'Fırın',
    keeper: 'Fırıncı Halil',
    greet: 'Taze taze, sıcak sıcak! Ekmek de var, lavaş da. Dönerciye toptan fiyat!',
    wall: 0xf3dcb2,
    goods: [0xd9a35b, 0xe8d3a5, 0xc28e5c],
    look: { shirt: 0xffffff, pants: 0x3b3b3b, hat: 'chef', apron: true, mustache: true, hair: 0x3b2314, skin: 0xe9b47f },
    items: [
      { id: 'ekmek5', icon: '🥖', name: '5 Ekmek', desc: 'Ekmek arası için', price: 40, stock: { ekmek: 5 } },
      { id: 'ekmek15', icon: '🥖', name: '15 Ekmek (çuval)', desc: 'Toptan, adet başı 7 TL', price: 105, stock: { ekmek: 15 } },
      { id: 'lavas5', icon: '🫓', name: '5 Lavaş', desc: 'Dürüm için', price: 30, stock: { lavas: 5 } },
      { id: 'lavas15', icon: '🫓', name: '15 Lavaş (deste)', desc: 'Toptan, adet başı ~5 TL', price: 80, stock: { lavas: 15 } },
      { id: 'pogaca', icon: '🥐', name: 'Sıcak poğaça', desc: '+15 enerji', price: 15, energy: 15 },
    ],
  },
  kasap: {
    title: 'Kasap',
    keeper: 'Kasap Rüstem',
    greet: 'Gel usta! Dönerlik et hazır, yaprak yaprak marine ettim. Kuzu mu dana mı, ikisi bir arada!',
    wall: 0xf1e4e4,
    goods: [0x9d0208, 0xc1121f, 0xf1f1e6],
    look: { shirt: 0xffffff, pants: 0x222222, apron: true, mustache: true, beard: true, bald: true, hair: 0x2b1d14, skin: 0xd9a066 },
    items: [
      { id: 'et20', icon: '🥩', name: 'Döner eti — 20 dilim', desc: 'Dilim başı 3,5 TL', price: 70, stock: { meat: 20 } },
      { id: 'et60', icon: '🥩', name: 'Bütün döner — 60 dilim', desc: 'Toptan, dilim başı ~3,2 TL', price: 190, stock: { meat: 60 } },
      { id: 'et150', icon: '🍖', name: 'Dev döner — 150 dilim', desc: 'Kalabalık günler için', price: 450, stock: { meat: 150 } },
    ],
  },
  bakkal: {
    title: 'Bakkal Nuri',
    keeper: 'Bakkal Nuri',
    greet: 'Hoş geldin komşu! Fırın kapalıysa ekmek bende de var, biraz pahalı ama gece yarısı da açığım!',
    wall: 0xe9f1f7,
    goods: [0x1e6fb8, 0xffcf3f, 0xe63946],
    look: { shirt: 0x4a7c59, pants: 0x3b3b3b, apron: true, glasses: true, mustache: true, bald: true, hair: 0x444444, skin: 0xe6b98c },
    items: [
      { id: 'b_ekmek', icon: '🥖', name: '3 Ekmek', desc: 'Acil durum ekmeği', price: 30, stock: { ekmek: 3 } },
      { id: 'b_lavas', icon: '🫓', name: '3 Lavaş', desc: 'Acil durum lavaşı', price: 24, stock: { lavas: 3 } },
      { id: 'gazoz', icon: '🥤', name: 'Gazoz', desc: '+10 enerji', price: 12, energy: 10 },
      { id: 'ayran', icon: '🥛', name: 'Ayran', desc: '+8 enerji, serinletir', price: 10, energy: 8 },
    ],
  },
  manav: {
    title: 'Manav',
    keeper: 'Manav Kemal',
    greet: 'Domates bal gibi, soğan şeker gibi! Salatalı döner olur mu? Olur! Müşteri fazladan bahşiş bırakır.',
    wall: 0xe8f4dc,
    goods: [0xe63946, 0x2a9d3f, 0xffd60a],
    look: { shirt: 0x6a994e, pants: 0x3b3b3b, hat: 'kasket', hatColor: 0x2a7a3b, mustache: true, hair: 0x3b2314, skin: 0xd9a066 },
    items: [
      { id: 'salata10', icon: '🥗', name: 'Salata — 10 porsiyon', desc: 'Domates, soğan, maydanoz. Her satışta +10 TL', price: 45, stock: { salata: 10 } },
      { id: 'salata30', icon: '🥗', name: 'Salata — 30 porsiyon', desc: 'Kasa kasa, toptan', price: 120, stock: { salata: 30 } },
      { id: 'elma', icon: '🍎', name: 'Kıtır elma', desc: '+8 enerji', price: 8, energy: 8 },
    ],
  },
  cay: {
    title: 'Çay Ocağı',
    keeper: 'Çaycı Cemil',
    greet: 'Çaaay! Tavşan kanı, taze demlendi abi! Bir simit de yanına, güne öyle başlanır.',
    wall: 0xf0d9b5,
    goods: [0xc0392b, 0xd9a35b, 0xf1f1e6],
    look: { shirt: 0xffffff, pants: 0x222222, apron: true, mustache: true, hair: 0x1a1a1a, skin: 0xd9a066 },
    items: [
      { id: 'cay', icon: '🍵', name: 'Tavşan kanı çay', desc: '+12 enerji', price: 5, energy: 12, minutes: 10 },
      { id: 'simit', icon: '🥯', name: 'Simit + çay', desc: '+22 enerji', price: 15, energy: 22, minutes: 15 },
      { id: 'kahve', icon: '☕', name: 'Türk kahvesi', desc: '+18 enerji, 40 yıl hatırı', price: 20, energy: 18, minutes: 15 },
    ],
  },
  lokanta: {
    title: 'Lokanta',
    keeper: 'Aşçı Bekir',
    greet: 'Buyur usta, bugün kuru fasulye, pilav, mercimek var! Dönerci de olsa insan bazen sulu yemek ister.',
    wall: 0xf7ecd9,
    goods: [0xa0522d, 0xf1f1e6, 0xe9c46a],
    look: { shirt: 0xffffff, pants: 0x3b3b3b, hat: 'chef', apron: true, beard: true, mustache: true, hair: 0x5a3825, skin: 0xe3b07f },
    items: [
      { id: 'corba', icon: '🥣', name: 'Mercimek çorbası', desc: '+20 enerji', price: 30, energy: 20, minutes: 20 },
      { id: 'fasulye', icon: '🍛', name: 'Kuru fasulye + pilav', desc: '+45 enerji', price: 60, energy: 45, minutes: 30 },
      { id: 'kebap', icon: '🍢', name: 'Adana kebap', desc: '+60 enerji, rakip dükkânı tanı', price: 90, energy: 60, minutes: 40 },
    ],
  },
  tatlici: {
    title: 'Tatlıcı',
    keeper: 'Tatlıcı Şükrü',
    greet: 'Baklava şerbetli, künefe peynirli! Tatlı ye tatlı konuş, dönerin de tatlı satılsın!',
    wall: 0xfde4ec,
    goods: [0xe9c46a, 0xff70a6, 0x55a630],
    look: { shirt: 0xff70a6, pants: 0x3b3b3b, apron: true, mustache: true, hair: 0x1a1a1a, skin: 0xf0c08f },
    items: [
      { id: 'baklava', icon: '🍯', name: 'Fıstıklı baklava', desc: '+30 enerji', price: 50, energy: 30, minutes: 15 },
      { id: 'kunefe', icon: '🧀', name: 'Künefe', desc: '+40 enerji', price: 70, energy: 40, minutes: 20 },
      { id: 'lokum', icon: '🍬', name: 'Lokum', desc: '+10 enerji', price: 15, energy: 10 },
    ],
  },
  eczane: {
    title: 'Eczane',
    keeper: 'Eczacı Selin',
    greet: 'Geçmiş olsun... Ha, hasta değil misin? Yorgunsan vitamin var, ama asıl ilaç uykudur usta!',
    wall: 0xeef6f4,
    goods: [0xffffff, 0x2a9d8f, 0xe63946],
    look: { shirt: 0xffffff, pants: 0x264653, hat: 'basortu', scarf: 0x2a9d8f, glasses: true, skin: 0xf0c08f },
    items: [
      { id: 'vitamin', icon: '💊', name: 'Vitamin', desc: '+30 enerji', price: 40, energy: 30 },
      { id: 'enerji', icon: '🧃', name: 'Enerji içeceği', desc: '+50 enerji (sağlıksız!)', price: 65, energy: 50 },
    ],
  },
  hamam: {
    title: 'Hamam',
    keeper: 'Tellak Hasan',
    greet: 'Hoş geldin! Kese, köpük, sıcak göbek taşı... Çıktığında yeni doğmuş gibi olursun usta!',
    wall: 0xdfe9f0,
    goods: [0xffffff, 0x9fd8ff, 0xc9d1d8],
    look: { shirt: 0xf5f5f0, pants: 0xb3262e, mustache: true, bald: true, hair: 0x2b1d14, skin: 0xd9a066 },
    items: [
      { id: 'kese', icon: '🛁', name: 'Kese + köpük', desc: 'Enerji TAMAMEN dolar (2 saat sürer)', price: 90, energy: 100, minutes: 120 },
      { id: 'kurna', icon: '💧', name: 'Sadece yıkanma', desc: '+35 enerji (1 saat)', price: 40, energy: 35, minutes: 60 },
    ],
  },
  berber: {
    title: 'Berber',
    keeper: 'Berber Necmi',
    greet: 'Otur usta otur! Saç mı sakal mı? Kolonya da benden. Yakışıklı dönerciden döner daha çok satılır!',
    wall: 0xf5f0e6,
    goods: [0xe63946, 0x1d3557, 0xffffff],
    look: { shirt: 0xffffff, pants: 0x1d3557, mustache: true, hair: 0x111111, skin: 0xe9b47f },
    items: [
      { id: 'sakal', icon: '🧔', name: 'Sakal bırak', desc: 'Kasabanın en havalı dönercisi', price: 80, look: { beard: true } },
      { id: 'tiras', icon: '🪒', name: 'Sinek kaydı tıraş', desc: 'Sakalı al, bıyık kalsın', price: 40, look: { beard: false } },
      { id: 'kir', icon: '👨‍🦳', name: 'Kır saç-sakal', desc: 'Tecrübeli usta görünümü', price: 70, look: { hair: 0xbbbbbb } },
      { id: 'siyah', icon: '💈', name: 'Saç boyası (siyah)', desc: 'Gençleş', price: 70, look: { hair: 0x1a1a1a } },
    ],
  },
  nalbur: {
    title: 'Nalbur',
    keeper: 'Nalbur Tahsin',
    greet: 'Ne lazımsa var! Dükkânını büyüt, eşeğini hızlandır. Esnaf yatırım yapar usta!',
    wall: 0xe4e8eb,
    goods: [0x7d8b99, 0xe9c46a, 0x264653],
    look: { shirt: 0x264653, pants: 0x3b3b3b, hat: 'kasket', hatColor: 0x264653, glasses: true, mustache: true, hair: 0x555555, skin: 0xe3b07f },
    items: [
      { id: 'up_tepsi', icon: '🍽️', name: 'Büyük tepsi', desc: UPGRADES.tepsi, price: 350, upgrade: 'tepsi' },
      { id: 'up_bicak', icon: '🔪', name: 'Şam çeliği bıçak', desc: UPGRADES.bicak, price: 300, upgrade: 'bicak' },
      { id: 'up_tabure', icon: '🪑', name: 'Tabure & masa', desc: UPGRADES.tabure, price: 450, upgrade: 'tabure' },
      { id: 'up_tabela', icon: '💡', name: 'Neon tabela', desc: UPGRADES.tabela, price: 600, upgrade: 'tabela' },
      { id: 'up_nal', icon: '🐴', name: 'Çelik nal', desc: UPGRADES.nal, price: 350, upgrade: 'nal' },
    ],
  },
};

/* =========================================================
   Dükkân iç mekânı (tüm dükkânlar için tek oda, temaya göre değişir)
   ========================================================= */
export const SHOP_ROOM = new THREE.Vector3(420, 0, 80);
const W = 9;
const D = 7;
const H = 3.4;
const FLOOR_Y = 0.1;

export class ShopInterior {
  constructor(scene) {
    const o = SHOP_ROOM;
    this.scene = scene;
    const g = new THREE.Group();
    g.position.copy(o);
    scene.add(g);
    this.colliders = [];
    const col = (x0, x1, z0, z1) => this.colliders.push({ minX: o.x + x0, maxX: o.x + x1, minZ: o.z + z0, maxZ: o.z + z1, h: H });

    // Temaya göre rengi değişen malzemeler
    this.wallMat = new THREE.MeshLambertMaterial({ color: 0xf3dcb2, flatShading: true });
    this.goodMats = [0, 1, 2].map(() => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    const EXT = 7;
    addBox(g, W, 0.1, D + EXT, 0xcfc6b8, 0, 0.05, EXT / 2);
    for (let x = -W / 2 + 0.75; x < W / 2; x += 1.5) addBox(g, 0.03, 0.004, D + EXT, 0xb5ab9c, x, 0.102, EXT / 2, false);
    addBox(g, W + 0.4, H, 0.2, this.wallMat, 0, H / 2, -D / 2 - 0.1);
    addBox(g, 0.2, H, D + EXT, this.wallMat, -W / 2 - 0.1, H / 2, EXT / 2);
    addBox(g, 0.2, H, D + EXT, this.wallMat, W / 2 + 0.1, H / 2, EXT / 2);
    addBox(g, W + 0.4, H, 0.2, 0x3b2a1e, 0, H / 2, D / 2 + EXT + 0.1);
    addBox(g, W + 0.4, 0.2, D + EXT + 0.4, 0xfaf3e6, 0, H + 0.1, EXT / 2, false);
    addBox(g, W, 0.25, 0.25, 0x8b5a2b, 0, 0.22, D / 2 + 0.15);
    col(-W / 2 - 1, W / 2 + 1, -D / 2 - 1, -D / 2);
    col(-W / 2 - 1, W / 2 + 1, D / 2, D / 2 + 1);
    col(-W / 2 - 1, -W / 2, -D / 2 - 1, D / 2 + 1);
    col(W / 2, W / 2 + 1, -D / 2 - 1, D / 2 + 1);

    // Arka duvar rafları + ürünler
    for (let r = 0; r < 3; r++) {
      const y = 0.8 + r * 0.75;
      addBox(g, 6.4, 0.06, 0.5, 0x8b5a2b, 0, y, -D / 2 + 0.3);
      for (let i = 0; i < 9; i++) {
        const m = this.goodMats[(i + r) % 3];
        if ((i + r) % 2) addBox(g, 0.42, 0.42, 0.36, m, -2.9 + i * 0.72, y + 0.24, -D / 2 + 0.3);
        else addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), m, -2.9 + i * 0.72, y + 0.24, -D / 2 + 0.3);
      }
    }
    addBox(g, 0.1, 2.4, 0.5, 0x6b3e26, -3.25, 1.2, -D / 2 + 0.3);
    addBox(g, 0.1, 2.4, 0.5, 0x6b3e26, 3.25, 1.2, -D / 2 + 0.3);

    // İç tabela (dükkân adı)
    this.signCanvas = document.createElement('canvas');
    this.signCanvas.width = 512;
    this.signCanvas.height = 96;
    this.signTex = new THREE.CanvasTexture(this.signCanvas);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.78), new THREE.MeshBasicMaterial({ map: this.signTex, toneMapped: false }));
    sign.position.set(0, H - 0.45, -D / 2 + 0.02);
    g.add(sign);

    // Tezgah + kasa
    addBox(g, 4.4, 1.0, 0.8, 0x8b5a2b, 0, 0.5, -1.2);
    addBox(g, 4.6, 0.08, 1.0, 0xd9c7a0, 0, 1.04, -1.2);
    addBox(g, 0.6, 0.35, 0.45, 0x333333, 1.5, 1.25, -1.25);
    addBox(g, 0.5, 0.06, 0.3, 0x2ec27e, 1.5, 1.45, -1.3, false);
    for (let i = 0; i < 3; i++) addBox(g, 0.5, 0.3, 0.4, this.goodMats[i], -1.6 + i * 0.6, 1.23, -1.15);
    col(-2.3, 2.3, -1.65, -0.75);

    // Saksılar
    for (const px of [-3.9, 3.9]) {
      addMesh(g, new THREE.CylinderGeometry(0.28, 0.2, 0.5, 8), 0xa0522d, px, 0.35, -2.8);
      addMesh(g, new THREE.IcosahedronGeometry(0.5, 0), 0x3f8a33, px, 0.95, -2.8);
      col(px - 0.35, px + 0.35, -3.15, -2.45);
    }

    // Kapı (doğu duvarı)
    const DZ = 2.2;
    addBox(g, 0.08, 2.3, 1.3, 0x3b2314, W / 2 - 0.02, 1.15, DZ, false);
    addBox(g, 0.06, 2.15, 1.1, 0x6b3e26, W / 2 - 0.06, 1.1, DZ, false);
    addBox(g, 0.1, 0.1, 0.1, 0xf2c037, W / 2 - 0.12, 1.1, DZ - 0.4, false);

    this.light = new THREE.PointLight(0xfff0d0, 0, 16, 1.6);
    this.light.position.set(o.x, H - 0.6, o.z);
    scene.add(this.light);

    this.keeper = null;
    this.keeperPos = new THREE.Vector3(o.x + 0.3, FLOOR_Y, o.z - 2.1);
    this.counterPoint = new THREE.Vector3(o.x - 1.1, 0, o.z - 0.1);
    this.entry = new THREE.Vector3(o.x + W / 2 - 1.1, FLOOR_Y, o.z + DZ);
    this.doorPoint = new THREE.Vector3(o.x + W / 2 - 0.6, 0, o.z + DZ);
    this.t = 0;
    this.current = null;
  }

  /** Odayı verilen dükkânın temasına çevir. */
  setShop(id) {
    const c = CATALOG[id];
    this.current = id;
    this.wallMat.color.setHex(c.wall);
    c.goods.forEach((col, i) => this.goodMats[i].color.setHex(col));
    const g = this.signCanvas.getContext('2d');
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#ffd166';
    g.lineWidth = 6;
    g.strokeRect(5, 5, 502, 86);
    g.fillStyle = '#ffd166';
    g.font = '50px "Bungee", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(c.title.toLocaleUpperCase('tr-TR'), 256, 52);
    this.signTex.needsUpdate = true;
    if (this.keeper) {
      this.scene.remove(this.keeper.group);
      this.keeper.group.traverse((o) => o.isMesh && o.geometry.userData.owned && o.geometry.dispose());
    }
    this.keeper = createPerson(c.look);
    this.keeper.group.position.copy(this.keeperPos);
    this.scene.add(this.keeper.group);
  }

  update(dt, playerPos) {
    if (!this.keeper) return;
    this.t += dt;
    const k = this.keeper;
    k.group.rotation.y = Math.atan2(playerPos.x - k.group.position.x, playerPos.z - k.group.position.z) * 0.6;
    animatePerson(k, this.t * 2, 0, 'stand');
    k.armR.rotation.x = Math.sin(this.t * 1.5) * 0.15 - 0.2;
  }

  resolve(pos, r) {
    return resolveCircle(pos, r, this.colliders, 0);
  }

  heightAt() {
    return FLOOR_Y;
  }

  cameraFor(playerPos, out) {
    const o = SHOP_ROOM;
    const x = o.x + (playerPos.x - o.x) * 0.45;
    const z = Math.min(o.z + 10, playerPos.z + 7.2);
    return out.set(x, 3.2, z);
  }

  setDaylight(night, active) {
    this.light.intensity = active ? 14 + night * 16 : 0;
  }
}
