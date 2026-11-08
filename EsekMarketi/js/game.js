'use strict';
/* ============================================================
   EsekMarketi — game.js
   Market işletme simülasyonu: raf stoğu, depo, eşek arabasıyla
   sipariş teslimatı, fiyatlar, müşteriler, kasa, popülerlik.

   Temel: "ShopSim 3D" — Copyright (c) 2026 Ishu Chaudhary, MIT
   (https://github.com/Ishu-dev/shop-sim-3d). Market binası, raf ve
   duvar yapısı, karakter modeli, 5 kamera modu, ses sistemi ve mini
   harita oradan uyarlandı; oyun mantığı EsekMarketi için yeniden yazıldı.
   ============================================================ */

// ------------------------------------------------------------
// AYARLAR
// ------------------------------------------------------------
const STORE_W = 72, STORE_D = 52;
const WALL_H = 5.5, WALL_T = 0.6;
const PLAYER_R = 0.45, WALK = 5.2, SPRINT = 1.6;
const KOLI = 12;             // bir kolideki adet
const SHELF_CAP = 24;        // raf bölmesi kapasitesi
const PALLET_CAP = 8 * KOLI; // depoda ürün başına en fazla 8 koli
const OPEN_H = 8, CLOSE_H = 22;
const MIN_PER_SEC = 2;       // 1 gerçek saniye = 2 oyun dakikası
const RENT = 150, WAGE = 120;
const SAVE_KEY = 'esekmarketi.save.v1';

const colliders = [];
const tweens = [];
const fmtTL = (n) => (n < 0 ? '-₺' : '₺') + Math.abs(Math.round(n)).toLocaleString('tr-TR');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------
// RENDERER / SAHNE
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc6ea);
scene.fog = new THREE.Fog(0x8fc6ea, 110, 260);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a5a3a, 0.55));
const sun = new THREE.DirectionalLight(0xfff3d6, 0.85);
sun.position.set(35, 55, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 75, top: 45, bottom: -45, near: 10, far: 160 });
scene.add(sun);

// ------------------------------------------------------------
// REYONLAR + ÜRÜN KATALOĞU (₺)
// ------------------------------------------------------------
const DEPTS = {
  manav:        { name: 'Manav',         css: '#43a047', license: 0 },
  firin:        { name: 'Fırın',         css: '#ef8f00', license: 0 },
  sut:          { name: 'Süt Ürünleri',  css: '#039be5', license: 0 },
  icecek:       { name: 'İçecek',        css: '#d84315', license: 0 },
  atistirmalik: { name: 'Atıştırmalık',  css: '#8e24aa', license: 400 },
  kahvalti:     { name: 'Kahvaltılık',   css: '#c62828', license: 600 },
  bakliyat:     { name: 'Bakliyat',      css: '#6d4c41', license: 800 },
  temizlik:     { name: 'Temizlik',      css: '#5e35b1', license: 1000 },
};

// [id, ad, reyon, renk, şekil, alış (adet), önerilen satış (adet)]
const CATALOG = [
  ['elma', 'Elma', 'manav', '#e53935', 'sphere', 6, 10],
  ['portakal', 'Portakal', 'manav', '#fb8c00', 'sphere', 5, 9],
  ['muz', 'Muz', 'manav', '#fdd835', 'banana', 9, 15],
  ['ekmek', 'Ekmek', 'firin', '#b5834a', 'loaf', 4, 8],
  ['simit', 'Simit', 'firin', '#a0662f', 'ring', 5, 10],
  ['pogaca', 'Poğaça', 'firin', '#e0b070', 'bun', 6, 12],
  ['sut', 'Süt', 'sut', '#fafafa', 'carton', 14, 22],
  ['ayran', 'Ayran', 'sut', '#e3f2fd', 'cup', 5, 9],
  ['peynir', 'Beyaz Peynir', 'sut', '#f5f0dc', 'block', 40, 65],
  ['kola', 'Kola', 'icecek', '#4e342e', 'can', 12, 20],
  ['meyvesuyu', 'Meyve Suyu', 'icecek', '#ffa726', 'carton', 10, 18],
  ['su', 'Su', 'icecek', '#4fc3f7', 'bottle', 3, 6],
  ['cips', 'Cips', 'atistirmalik', '#d32f2f', 'bag', 12, 22],
  ['biskuvi', 'Bisküvi', 'atistirmalik', '#795548', 'box', 8, 15],
  ['cikolata', 'Çikolata', 'atistirmalik', '#5d4037', 'bar', 10, 19],
  ['zeytin', 'Zeytin', 'kahvalti', '#33691e', 'jar', 30, 50],
  ['bal', 'Bal', 'kahvalti', '#ffb300', 'jar', 60, 95],
  ['recel', 'Reçel', 'kahvalti', '#ad1457', 'jar', 25, 42],
  ['pirinc', 'Pirinç', 'bakliyat', '#f5f5f5', 'sack', 35, 55],
  ['mercimek', 'Mercimek', 'bakliyat', '#ef6c00', 'sack', 30, 48],
  ['makarna', 'Makarna', 'bakliyat', '#fbc02d', 'box', 9, 16],
  ['sabun', 'Sabun', 'temizlik', '#26c6da', 'block', 8, 15],
  ['deterjan', 'Deterjan', 'temizlik', '#7cb342', 'box', 60, 95],
  ['kagithavlu', 'Kağıt Havlu', 'temizlik', '#eceff1', 'roll', 25, 40],
];
const P = {};
for (const [id, name, dept, color, shape, cost, base] of CATALOG) {
  P[id] = { id, name, dept, color, shape, cost, base, price: base, shelf: 0, depo: 0 };
}

// ------------------------------------------------------------
// YARDIMCILAR (ShopSim 3D'den)
// ------------------------------------------------------------
function lambert(c) { return new THREE.MeshLambertMaterial({ color: c }); }

function box(w, h, d, color, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}

function makeTextTexture(text, bg, fg = '#ffffff', w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  let size = Math.floor(h * 0.52);
  g.font = `bold ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > w - 24 && size > 10) { size -= 2; g.font = `bold ${size}px system-ui, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

function addCollider(cx, cz, w, d, kind = 'wall') {
  const c = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, kind };
  colliders.push(c);
  return c;
}

// ------------------------------------------------------------
// ZEMİN: dış alan, otopark, market içi
// ------------------------------------------------------------
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), lambert(0x6f9a4a));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);
  // Önde cadde ve otopark, doğuda eşek yolu
  const road = new THREE.Mesh(new THREE.PlaneGeometry(220, 12), lambert(0x4a4b52));
  road.rotation.x = -Math.PI / 2; road.position.set(10, -0.01, 42); road.receiveShadow = true; scene.add(road);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(90, 9), lambert(0xcfc6b6));
  walk.rotation.x = -Math.PI / 2; walk.position.set(10, -0.005, 31.5); walk.receiveShadow = true; scene.add(walk);
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(50, 5), lambert(0xb79a6a));
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(88, -0.005, 2); dirt.receiveShadow = true; scene.add(dirt);
  for (let x = -90; x < 110; x += 6) box(3, 0.02, 0.3, 0xf4f1e8, x, 0.0, 42, null, false);

  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ece9e1'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#dedad0'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 13);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(STORE_W, STORE_D), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
}

// ------------------------------------------------------------
// DUVARLAR (ShopSim 3D yerleşimi: güneyde giriş, doğuda depo kapısı)
// ------------------------------------------------------------
function wall(cx, cz, w, d) {
  box(w, WALL_H, d, 0xf1ece0, cx, WALL_H / 2, cz);
  addCollider(cx, cz, w, d);
}
wall(0, -STORE_D / 2, STORE_W, WALL_T);
wall(-STORE_W / 2, 0, WALL_T, STORE_D);
wall(STORE_W / 2, -12, WALL_T, 28);   // doğu duvarı, z 2..8 arası depo kapısı
wall(STORE_W / 2, 17, WALL_T, 18);
wall(-20, STORE_D / 2, 32, WALL_T);
wall(20, STORE_D / 2, 32, WALL_T);
const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.3 });
for (const gx of [-2, 2]) {
  const gl = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.5, 0.1), glassMat);
  gl.position.set(gx, 2.25, STORE_D / 2); scene.add(gl);
}
// Dış tabela
{
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('🐴 EŞEK MARKETİ', '#c62828', '#ffd54f', 1024, 160) }));
  sign.position.set(0, 7.2, STORE_D / 2 + 0.4); scene.add(sign);
  box(23, 3.8, 0.4, 0x8e1b1b, 0, 7.2, STORE_D / 2 + 0.15);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('HOŞ GELDİNİZ', '#2e7d32', '#fff') }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.03, STORE_D / 2 - 2.2);
  scene.add(mat);
}

// ------------------------------------------------------------
// RAFLAR + ÜRÜNLER (her bölme = bir ürün, InstancedMesh ile)
// ------------------------------------------------------------
const ROWS = [-17, -10, -3, 4];
const SHELF_LEN = 30;
const CORR_X = [-19, 19];              // raflar arası çapraz koridorlar
const SIDE_DEPT = {
  '-17n': 'temizlik', '-17s': 'bakliyat',
  '-10n': 'kahvalti', '-10s': 'atistirmalik',
  '-3n': 'icecek', '-3s': 'sut',
  '4n': 'firin', '4s': 'manav',
};

const SHAPES = {};
function shapeGeo(shape) {
  if (SHAPES[shape]) return SHAPES[shape];
  let g;
  switch (shape) {
    case 'sphere': g = new THREE.SphereGeometry(0.13, 12, 10); g.translate(0, 0.13, 0); break;
    case 'banana': g = new THREE.BoxGeometry(0.3, 0.08, 0.1); g.translate(0, 0.04, 0); break;
    case 'loaf': g = new THREE.BoxGeometry(0.32, 0.16, 0.18); g.translate(0, 0.08, 0); break;
    case 'ring': g = new THREE.TorusGeometry(0.11, 0.04, 8, 16); g.translate(0, 0.15, 0); break;
    case 'bun': g = new THREE.SphereGeometry(0.12, 10, 8); g.scale(1, 0.6, 1); g.translate(0, 0.07, 0); break;
    case 'carton': g = new THREE.BoxGeometry(0.14, 0.28, 0.14); g.translate(0, 0.14, 0); break;
    case 'cup': g = new THREE.CylinderGeometry(0.07, 0.06, 0.15, 12); g.translate(0, 0.075, 0); break;
    case 'block': g = new THREE.BoxGeometry(0.22, 0.1, 0.16); g.translate(0, 0.05, 0); break;
    case 'can': g = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 12); g.translate(0, 0.1, 0); break;
    case 'bottle': g = new THREE.CylinderGeometry(0.06, 0.07, 0.32, 10); g.translate(0, 0.16, 0); break;
    case 'bag': g = new THREE.BoxGeometry(0.26, 0.3, 0.1); g.translate(0, 0.15, 0); break;
    case 'bar': g = new THREE.BoxGeometry(0.22, 0.05, 0.1); g.translate(0, 0.025, 0); break;
    case 'jar': g = new THREE.CylinderGeometry(0.08, 0.08, 0.17, 12); g.translate(0, 0.085, 0); break;
    case 'sack': g = new THREE.BoxGeometry(0.22, 0.28, 0.14); g.translate(0, 0.14, 0); break;
    case 'roll': g = new THREE.CylinderGeometry(0.1, 0.1, 0.27, 12); g.translate(0, 0.135, 0); break;
    default: g = new THREE.BoxGeometry(0.24, 0.3, 0.08); g.translate(0, 0.15, 0);
  }
  SHAPES[shape] = g;
  return g;
}

function priceTagTexture(p) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd54f'; g.fillRect(0, 0, 128, 20);
  g.fillStyle = '#333'; g.font = 'bold 14px system-ui'; g.textAlign = 'center';
  g.fillText(p.name.toLocaleUpperCase('tr-TR'), 64, 15);
  g.fillStyle = '#fff'; g.fillRect(0, 20, 128, 44);
  g.fillStyle = p.price > p.base * 1.25 ? '#c62828' : p.price < p.base ? '#2e7d32' : '#222';
  g.font = 'bold 28px system-ui';
  g.fillText('₺' + p.price, 64, 52);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

const lockSigns = {};   // reyon → kilit tabelası
function buildShelfRow(zr) {
  const grp = new THREE.Group();
  grp.position.set(0, 0, zr);
  const frameC = 0x607d8b;
  const len = SHELF_LEN;
  box(0.18, 3, 1.5, frameC, -len / 2, 1.5, 0, grp);
  box(0.18, 3, 1.5, frameC, len / 2, 1.5, 0, grp);
  box(len, 3, 0.14, frameC, 0, 1.5, 0, grp);
  for (const y of [0.85, 1.65, 2.45]) box(len, 0.1, 1.4, 0xeceff1, 0, y, 0, grp, false);
  box(len, 0.12, 1.5, frameC, 0, 3.0, 0, grp);
  scene.add(grp);
  addCollider(0, zr, len + 0.4, 1.7, 'shelf');

  for (const side of ['n', 's']) {
    const dk = SIDE_DEPT[`${zr}${side}`];
    const dep = DEPTS[dk];
    const sz = side === 'n' ? -1 : 1;
    // reyon tabelası (o tarafa bakar)
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.6, 0.8),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(dep.name.toLocaleUpperCase('tr-TR'), dep.css) }));
    strip.position.set(0, 3.6, zr + sz * 0.08);
    if (sz < 0) strip.rotation.y = Math.PI;
    scene.add(strip);
    // kilit tabelası
    const lock = new THREE.Mesh(new THREE.PlaneGeometry(len - 1, 1.2),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(`🔒 ${dep.name.toLocaleUpperCase('tr-TR')} — LİSANS ${fmtTL(dep.license)}`, 'rgba(30,30,40,.85)', '#ffd54f', 1024, 96), transparent: true }));
    lock.position.set(0, 1.75, zr + sz * 0.8);
    if (sz < 0) lock.rotation.y = Math.PI;
    scene.add(lock);
    lockSigns[dk] = lock;

    const prods = CATALOG.filter((c) => c[2] === dk).map((c) => P[c[0]]);
    prods.forEach((p, i) => {
      const xc = -10 + i * 10;
      const mesh = new THREE.InstancedMesh(shapeGeo(p.shape), lambert(p.color), SHELF_CAP);
      const m4 = new THREE.Matrix4();
      const rotY = sz < 0 ? Math.PI : 0;
      let k = 0;
      for (const y of [0.9, 1.7, 2.5]) {
        for (let col = 0; col < 8; col++) {
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + (Math.random() - 0.5) * 0.3);
          m4.compose(new THREE.Vector3(xc - 4.2 + col * 1.2, y, zr + sz * 0.42), q, new THREE.Vector3(1.6, 1.6, 1.6));
          mesh.setMatrixAt(k++, m4);
        }
      }
      mesh.castShadow = true;
      mesh.count = 0;
      scene.add(mesh);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: priceTagTexture(p) }));
      tag.position.set(xc, 0.62, zr + sz * 0.79);
      if (sz < 0) tag.rotation.y = Math.PI;
      scene.add(tag);
      p.shelfMesh = mesh;
      p.tag = tag;
      p.stand = new THREE.Vector3(xc, 0, zr + sz * 3.5);  // koridordaki durma noktası (müşteri)
      p.front = new THREE.Vector3(xc, 0, zr + sz * 1.6);  // rafın hemen önü (doldurma)
      p.side = sz;
    });
  }
}
ROWS.forEach(buildShelfRow);

function refreshShelf(p) {
  p.shelfMesh.count = clamp(p.shelf, 0, SHELF_CAP);
}
function refreshTag(p) {
  p.tag.material.map.dispose();
  p.tag.material.map = priceTagTexture(p);
  p.tag.material.needsUpdate = true;
}

// Duvar dekoru: buzdolapları ve manav kasaları (görsel)
for (const fz of [-14, -6, 2]) {
  box(1.2, 2.6, 6, 0xffffff, 34.6, 1.3, fz);
  box(0.05, 2.2, 5.6, 0x9fd6ff, 33.98, 1.4, fz, null, false);
  addCollider(34.6, fz, 1.2, 6);
}
for (const fz of [-14, -6, 2]) {
  box(1.6, 0.9, 5, 0x8d6e63, -34.4, 0.45, fz);
  addCollider(-34.4, fz, 1.6, 5);
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lambert(rnd(['#e53935', '#fb8c00', '#fdd835', '#7cb342'])));
    s.position.set(-34.4 + (Math.random() - 0.5) * 1.1, 1.05, fz + (Math.random() - 0.5) * 4.2);
    s.castShadow = true; scene.add(s);
  }
}

// ------------------------------------------------------------
// DEPO — doğu ek bina (ShopSim 3D'deki butik alanı); arkada eşek kapısı
// ------------------------------------------------------------
const DEPO = { x: 52, z: 2 };
const pallets = [];
{
  const JX = DEPO.x, JZ = DEPO.z;
  const cfloor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), lambert(0xb7b3aa));
  cfloor.rotation.x = -Math.PI / 2; cfloor.position.set(JX, 0.01, JZ);
  cfloor.receiveShadow = true; scene.add(cfloor);
  const courtPath = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 6.6), lambert(0xb7b3aa));
  courtPath.rotation.x = -Math.PI / 2; courtPath.position.set(38.1, 0.02, 5);
  courtPath.receiveShadow = true; scene.add(courtPath);

  function dwall(cx, cz, w, d) {
    box(w, 5, d, 0xd8d2c4, cx, 2.5, cz);
    box(w, 0.22, d, 0x6d4c41, cx, 5.05, cz);
    addCollider(cx, cz, w, d);
  }
  dwall(JX, -10, 24.6, 0.6);
  dwall(JX, 14, 24.6, 0.6);
  dwall(64, -5, 0.6, 10.6);           // doğu duvarı, z 0.3..3.7 arası eşek kapısı
  dwall(64, 9, 0.6, 10.6);
  dwall(40, -3.5, 0.6, 13);           // batı duvarı, z 3..7 market kapısı
  dwall(40, 10.5, 0.6, 7);
  // Koridorun iki yanı
  box(4, 5, 0.6, 0xd8d2c4, 38, 2.5, 1.7); addCollider(38, 1.7, 4, 0.6);
  box(4, 5, 0.6, 0xd8d2c4, 38, 2.5, 8.3); addCollider(38, 8.3, 4, 0.6);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.12, 25.2),
    new THREE.MeshPhongMaterial({ color: 0xcfefff, transparent: true, opacity: 0.12 }));
  roof.position.set(JX, 5.3, JZ); scene.add(roof);

  const dSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('📦 DEPO', '#5d4037', '#ffd54f'), side: THREE.DoubleSide }));
  dSign.rotation.y = -Math.PI / 2;
  dSign.position.set(STORE_W / 2 - 0.4, 4.4, 5);
  scene.add(dSign);
  const backSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('🐴 TESLİMAT', '#2e7d32', '#fff'), side: THREE.DoubleSide }));
  backSign.rotation.y = -Math.PI / 2;
  backSign.position.set(63.6, 4.2, 2);
  scene.add(backSign);

  const lamp = new THREE.PointLight(0xfff0d0, 0.6, 30);
  lamp.position.set(JX, 4.5, JZ); scene.add(lamp);

  // Paletler: 6 sütun × 4 sıra, ürün başına bir palet
  const boxTexCache = {};
  const boxMat = (p) => {
    if (boxTexCache[p.id]) return boxTexCache[p.id];
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#c69c6d'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 58, 128, 12);
    g.fillStyle = p.color; g.fillRect(10, 14, 108, 34);
    g.fillStyle = '#222'; g.font = 'bold 20px system-ui'; g.textAlign = 'center';
    g.fillText(p.name.toLocaleUpperCase('tr-TR'), 64, 96);
    g.font = 'bold 14px system-ui'; g.fillText(`${KOLI} ADET`, 64, 116);
    const t = new THREE.CanvasTexture(c);
    boxTexCache[p.id] = new THREE.MeshLambertMaterial({ map: t });
    return boxTexCache[p.id];
  };
  const boxGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
  let idx = 0;
  for (const [id] of CATALOG) {
    const p = P[id];
    const c = idx % 6, r = Math.floor(idx / 6);
    const px = 43.2 + c * 3.6, pz = -7.2 + r * 4.4;
    box(1.5, 0.14, 1.5, 0xa1887f, px, 0.07, pz);
    addCollider(px, pz, 1.5, 1.5, 'pallet');
    const inst = new THREE.InstancedMesh(boxGeo, boxMat(p), 8);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let lvl = 0; lvl < 2; lvl++) for (let q = 0; q < 4; q++) {
      m4.makeTranslation(px - 0.4 + (q % 2) * 0.8, 0.44 + lvl * 0.6, pz - 0.4 + Math.floor(q / 2) * 0.8);
      inst.setMatrixAt(k++, m4);
    }
    inst.castShadow = true; inst.count = 0;
    scene.add(inst);
    const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
    const lg = lc.getContext('2d');
    lg.fillStyle = DEPTS[p.dept].css; lg.fillRect(0, 0, 256, 64);
    lg.fillStyle = '#fff'; lg.font = 'bold 30px system-ui'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
    lg.fillText(p.name, 128, 34);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lc), depthTest: true }));
    label.scale.set(1.3, 0.33, 1);
    label.position.set(px, 2.75, pz);
    scene.add(label);
    p.pallet = { x: px, z: pz, mesh: inst, label, boxMat: boxMat(p) };
    pallets.push(p);
    idx++;
  }
}
function refreshPallet(p) {
  p.pallet.mesh.count = clamp(Math.ceil(p.depo / KOLI), 0, 8);
}

// ------------------------------------------------------------
// KASA (ShopSim 3D kasasından; bant artık müşteri→kasiyer yönünde)
// ------------------------------------------------------------
const REG = { x: 0, z: 17.5 };                 // tezgah merkezi
const CASHIER_SPOT = new THREE.Vector3(1.7, 0, 18.4);
const LANE_X = -1.7;                            // müşterilerin sıra hattı
const PAY_SPOT = new THREE.Vector3(LANE_X, 0, 17.6);
let beltItems = [];
{
  box(1.4, 1.1, 5.2, 0x37474f, REG.x, 0.55, REG.z);
  const belt = box(1.0, 0.06, 4.4, 0x111111, REG.x, 1.13, REG.z - 0.3, null, false);
  belt.receiveShadow = true;
  box(0.7, 0.6, 0.6, 0x263238, REG.x + 0.2, 1.4, REG.z + 2.1);   // yazar kasa
  box(0.5, 0.3, 0.05, 0x2ecc71, REG.x + 0.2, 1.75, REG.z + 1.82, null, false);
  box(0.5, 0.08, 0.5, 0x90a4ae, REG.x, 1.17, REG.z + 1.3);         // okuyucu cam
  addCollider(REG.x, REG.z, 1.4, 5.2);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('KASA 1', '#2e7d32'), side: THREE.DoubleSide }));
  s.position.set(REG.x, 3.4, REG.z - 2.4); scene.add(s);
  box(0.08, 2, 0.08, 0x333333, REG.x, 2.2, REG.z - 2.4);
}

// ------------------------------------------------------------
// KARAKTERLER (ShopSim 3D modeli + önlük/şapka)
// ------------------------------------------------------------
function makeCharacter(shirtC, pantsC = 0x2c3e50, skinC = 0xffd9b3, opts = {}) {
  const g = new THREE.Group();
  const parts = {};
  parts.body = box(0.7, 0.85, 0.4, shirtC, 0, 1.25, 0, g);
  if (opts.apron) box(0.6, 0.9, 0.05, 0xffffff, 0, 1.15, 0.22, g);
  parts.head = new THREE.Group(); parts.head.position.set(0, 1.95, 0);
  box(0.45, 0.45, 0.42, skinC, 0, 0, 0, parts.head);
  box(0.47, 0.16, 0.44, opts.hair ?? 0x3a2a1a, 0, 0.22, -0.02, parts.head);
  box(0.08, 0.08, 0.05, 0x222222, 0.11, 0.02, 0.22, parts.head);
  box(0.08, 0.08, 0.05, 0x222222, -0.11, 0.02, 0.22, parts.head);
  if (opts.mustache) box(0.22, 0.05, 0.04, 0x2a1a10, 0, -0.1, 0.22, parts.head);
  if (opts.cap) { box(0.5, 0.1, 0.5, opts.cap, 0, 0.3, 0, parts.head); box(0.4, 0.04, 0.2, opts.cap, 0, 0.26, 0.3, parts.head); }
  if (opts.scarf) { box(0.52, 0.5, 0.48, opts.scarf, 0, 0.06, -0.03, parts.head); box(0.3, 0.32, 0.02, skinC, 0, -0.01, 0.22, parts.head); }
  g.add(parts.head);
  function limb(w, len, c, x, y) {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    box(w, len, w, c, 0, -len / 2, 0, piv);
    g.add(piv); return piv;
  }
  parts.lArm = limb(0.2, 0.75, shirtC, -0.45, 1.62);
  parts.rArm = limb(0.2, 0.75, shirtC, 0.45, 1.62);
  parts.lLeg = limb(0.24, 0.85, pantsC, -0.18, 0.85);
  parts.rLeg = limb(0.24, 0.85, pantsC, 0.18, 0.85);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return { group: g, parts, phase: 0 };
}

function animateCharacter(ch, dt, moving, speed) {
  if (moving) ch.phase += dt * speed * 2.2;
  else ch.phase *= 0.85;
  const s = Math.sin(ch.phase);
  ch.parts.lLeg.rotation.x = s * 0.75;
  ch.parts.rLeg.rotation.x = -s * 0.75;
  ch.parts.lArm.rotation.x = -s * 0.55;
  ch.parts.rArm.rotation.x = s * 0.55;
  ch.group.position.y = moving ? Math.abs(Math.cos(ch.phase)) * 0.06 : 0;
}

// Oyuncu: market sahibi (yeşil gömlek, beyaz önlük, bıyık)
const player = makeCharacter(0x2e7d32, 0x34495e, 0xf0c08f, { apron: true, mustache: true });
player.group.position.set(6, 0, 11);
player.group.rotation.y = Math.PI;

// Elde taşınan koli
const carryBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), lambert(0xc69c6d));
carryBox.position.set(0, 1.25, 0.55);
carryBox.castShadow = true;
carryBox.visible = false;
player.group.add(carryBox);
let carrying = null;   // { id, units }

// Kasiyer (işe alınınca görünür)
const cashierNpc = makeCharacter(0xe53935, 0x263238, 0xe9b47f, { cap: 0xe53935 });
cashierNpc.group.position.copy(CASHIER_SPOT);
cashierNpc.group.rotation.y = -Math.PI / 2;
cashierNpc.group.visible = false;

// ------------------------------------------------------------
// EŞEK + ARABA (siparişleri getirir)
// ------------------------------------------------------------
const DONKEY_FAR = new THREE.Vector3(112, 0, 2);
const DONKEY_DOCK = new THREE.Vector3(67.6, 0, 2);
const donkey = (() => {
  const g = new THREE.Group();
  const fur = 0x8c8279, pale = 0xd8d0c4, dark = 0x3b322c;
  const body = new THREE.Group(); g.add(body);
  box(0.75, 0.7, 1.5, fur, 0, 1.05, 0, body);
  box(0.66, 0.2, 1.3, pale, 0, 0.72, 0, body, false);
  box(0.06, 0.03, 1.3, dark, 0, 1.41, 0, body, false);
  const neck = new THREE.Group(); neck.position.set(0, 1.25, 0.62); body.add(neck);
  box(0.36, 0.74, 0.4, fur, 0, 0.3, 0.12, neck).rotation.x = 0.55;
  box(0.1, 0.66, 0.14, dark, 0, 0.4, -0.06, neck, false).rotation.x = 0.55;
  const head = new THREE.Group(); head.position.set(0, 0.66, 0.36); neck.add(head);
  box(0.42, 0.42, 0.62, fur, 0, 0, 0.12, head);
  box(0.4, 0.32, 0.28, pale, 0, -0.07, 0.5, head);
  box(0.1, 0.06, 0.04, 0x111111, 0, -0.03, 0.65, head, false);
  for (const s of [-1, 1]) {
    box(0.04, 0.12, 0.12, 0x111111, s * 0.215, 0.08, 0.22, head, false);
    const ear = new THREE.Group(); ear.position.set(s * 0.12, 0.2, 0); ear.rotation.z = -s * 0.3; head.add(ear);
    box(0.11, 0.55, 0.07, fur, 0, 0.27, 0, ear);
    box(0.06, 0.4, 0.02, 0xe8c0b8, 0, 0.27, 0.04, ear, false);
  }
  const legs = [];
  for (const [lx, lz] of [[-0.24, 0.55], [0.24, 0.55], [-0.24, -0.55], [0.24, -0.55]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.82, lz); g.add(leg);
    box(0.16, 0.72, 0.16, fur, 0, -0.36, 0, leg);
    box(0.18, 0.1, 0.2, 0x2a2420, 0, -0.77, 0.01, leg);
    legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.25, -0.75); body.add(tail);
  box(0.06, 0.55, 0.06, fur, 0, -0.28, 0, tail);
  box(0.14, 0.2, 0.14, dark, 0, -0.6, 0, tail);
  // kilim eyer + nazar
  box(0.8, 0.07, 0.65, 0xb3262e, 0, 1.43, -0.05, body);
  box(0.82, 0.03, 0.1, 0xffd54f, 0, 1.47, 0.15, body, false);
  box(0.12, 0.12, 0.03, 0x1d5fd1, 0, 1.15, 0.98, body, false);
  // Araba: iki tekerlek, sandık, oklar
  const cart = new THREE.Group(); cart.position.set(0, 0, -2.3); g.add(cart);
  box(1.6, 0.12, 1.9, 0x8d6e63, 0, 0.75, 0, cart);
  box(1.6, 0.45, 0.08, 0x6d4c41, 0, 1.03, 0.95, cart);
  box(1.6, 0.45, 0.08, 0x6d4c41, 0, 1.03, -0.95, cart);
  box(0.08, 0.45, 1.9, 0x6d4c41, 0.8, 1.03, 0, cart);
  box(0.08, 0.45, 1.9, 0x6d4c41, -0.8, 1.03, 0, cart);
  for (const s of [-1, 1]) {
    box(0.06, 0.06, 2.1, 0x6d4c41, s * 0.55, 0.85, 1.6, cart);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16), lambert(0x4e342e));
    w.rotation.z = Math.PI / 2; w.position.set(s * 0.9, 0.45, 0); w.castShadow = true; cart.add(w);
  }
  const cartBoxes = [];
  for (let i = 0; i < 6; i++) {
    const b = box(0.55, 0.42, 0.55, 0xc69c6d, -0.4 + (i % 2) * 0.8, 1.05 + Math.floor(i / 4) * 0.42, -0.6 + (Math.floor(i / 2) % 2) * 0.9 + (i >= 4 ? 0.3 : 0), cart);
    cartBoxes.push(b);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = -Math.PI / 2;  // batıya (markete) doğru bakar
  g.position.copy(DONKEY_FAR);
  g.visible = false;
  scene.add(g);
  return { group: g, body, neck, head, legs, tail, cartBoxes, phase: 0, t: 0, bray: 0 };
})();

// ------------------------------------------------------------
// SES (WebAudio, dosya yok) — ShopSim 3D AudioSys + yeni sesler
// ------------------------------------------------------------
const AudioSys = {
  ctx: null,
  on: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  blip(freq, dur = 0.12, type = 'sine', vol = 0.25, slide = 0, delay = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },
  pickup() { this.blip(660, 0.1, 'triangle', 0.25, 330); },
  place() { this.blip(420, 0.08, 'triangle', 0.2, -120); },
  scan() { this.blip(1850, 0.07, 'square', 0.08); },
  cash() { [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.2, 0, i * 0.09)); },
  nope() { this.blip(180, 0.15, 'sawtooth', 0.14); },
  bray() { for (let i = 0; i < 2; i++) { this.blip(820, 0.28, 'sawtooth', 0.07, -260, i * 0.62); this.blip(340, 0.32, 'sawtooth', 0.08, -100, i * 0.62 + 0.3); } },
  bell() { this.blip(1320, 0.4, 'sine', 0.12); this.blip(1980, 0.3, 'sine', 0.06, 0, 0.05); },
};

// ------------------------------------------------------------
// OYUN DURUMU
// ------------------------------------------------------------
const game = {
  started: false,
  money: 600,
  pop: 40,
  day: 1,
  minutes: OPEN_H * 60,
  unlocked: { manav: true, firin: true, sut: true, icecek: true },
  upgrades: {},          // kasiyer, hizliEsek, reklam
  dayStats: null,
  dayOver: false,
  register: false,       // oyuncu kasada mı
  spawnT: 3,
  saveT: 0,
  orderCart: {},         // sipariş tabletindeki sepet: id → koli
};
const deliveries = [];   // eşek kuyruğu: { items: { id: koli } }
const donkeyState = { mode: 'away', timer: 0, order: null, unload: 0 };

function newDayStats() {
  game.dayStats = { revenue: 0, orders: 0, licenses: 0, served: 0, lost: 0, missing: 0, pricey: 0, pop0: game.pop };
}
newDayStats();

let toastTimer = null;
function toast(msg, ms = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function addMoney(v) {
  game.money += v;
  if (v > 0 && game.dayStats) game.dayStats.revenue += v;
  updateHud();
  const el = document.createElement('div');
  el.className = 'pop-num' + (v < 0 ? ' neg' : '');
  el.textContent = (v > 0 ? '+' : '') + fmtTL(v);
  document.getElementById('moneyBox').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function addPop(v) {
  game.pop = clamp(game.pop + v, 0, 100);
  updateHud();
}

// ------------------------------------------------------------
// KAYIT
// ------------------------------------------------------------
function saveGame() {
  const data = {
    v: 1, money: game.money, pop: game.pop, day: game.day, minutes: game.minutes,
    unlocked: game.unlocked, upgrades: game.upgrades,
    stock: Object.fromEntries(Object.values(P).map((p) => [p.id, [p.shelf, p.depo, p.price]])),
    pending: deliveries.map((d) => d.items).concat(donkeyState.order ? [donkeyState.order.items] : []),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* gizli sekme */ }
}
function loadGame() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!d || d.v !== 1) return false;
    Object.assign(game, { money: d.money, pop: d.pop, day: d.day, minutes: d.minutes, unlocked: d.unlocked || game.unlocked, upgrades: d.upgrades || {} });
    for (const [id, [s, dep, pr]] of Object.entries(d.stock || {})) {
      if (!P[id]) continue;
      P[id].shelf = s; P[id].depo = dep; P[id].price = pr;
    }
    // Yolda kalan siparişler eşek beklemeden depoya eklenir
    for (const items of d.pending || []) for (const [id, k] of Object.entries(items)) if (P[id]) P[id].depo = Math.min(PALLET_CAP * 2, P[id].depo + k * KOLI);
    return true;
  } catch (e) { return false; }
}
function newGameState() {
  Object.assign(game, { money: 600, pop: 40, day: 1, minutes: OPEN_H * 60, unlocked: { manav: true, firin: true, sut: true, icecek: true }, upgrades: {} });
  for (const p of Object.values(P)) {
    p.price = p.base;
    const open = game.unlocked[p.dept];
    p.shelf = open ? 12 : 0;
    p.depo = open ? KOLI : 0;
  }
}
function applyWorld() {
  for (const p of Object.values(P)) { refreshShelf(p); refreshPallet(p); refreshTag(p); }
  for (const k of Object.keys(DEPTS)) lockSigns[k].visible = !game.unlocked[k];
  cashierNpc.group.visible = !!game.upgrades.kasiyer;
  updateHud();
}

// ------------------------------------------------------------
// GİRİŞ: klavye + dokunmatik joystick
// ------------------------------------------------------------
const keys = {};
let minimapVisible = innerWidth > 700;
document.getElementById('minimapWrap').style.display = minimapVisible ? 'block' : 'none';

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!game.started || e.repeat) return;
  if (isPanelOpen()) { if (e.code === 'Escape' || e.code === 'KeyO') closeOrderPanel(); return; }
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyE' || e.code === 'Space') primaryAction();
  if (e.code === 'KeyQ') secondaryAction();
  if (e.code === 'KeyO') openOrderPanel();
  if (e.code === 'KeyM') { minimapVisible = !minimapVisible; document.getElementById('minimapWrap').style.display = minimapVisible ? 'block' : 'none'; }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const joy = { x: 0, y: 0, id: null };
{
  const zone = document.getElementById('joyZone');
  const base = document.getElementById('joyBase');
  const knob = document.getElementById('joyKnob');
  const upd = (e) => {
    const r = base.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max), dy = e.clientY - (r.top + max);
    const l = Math.hypot(dx, dy);
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joy.x = dx / max; joy.y = -dy / max;
    if (Math.hypot(joy.x, joy.y) < 0.12) { joy.x = 0; joy.y = 0; }
  };
  const end = (e) => {
    if (e.pointerId !== joy.id) return;
    joy.id = null; joy.x = 0; joy.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  };
  zone.addEventListener('pointerdown', (e) => { if (joy.id !== null) return; joy.id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (_) {} upd(e); e.preventDefault(); });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) { upd(e); e.preventDefault(); } });
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}
document.getElementById('btnAct').addEventListener('pointerdown', (e) => { e.preventDefault(); primaryAction(); });
document.getElementById('btnAlt').addEventListener('pointerdown', (e) => { e.preventDefault(); secondaryAction(); });
document.getElementById('btnOrder').addEventListener('click', () => openOrderPanel());
document.getElementById('btnSound').addEventListener('click', () => {
  AudioSys.on = !AudioSys.on;
  document.getElementById('btnSound').textContent = AudioSys.on ? '🔊' : '🔇';
});

// ------------------------------------------------------------
// KAMERALAR: 0 izometrik, 1 üçüncü şahıs, 2 kuşbakışı, 3 serbest, 4 birinci şahıs (ShopSim 3D)
// ------------------------------------------------------------
const persp = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);
const perspFree = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
const persp1st = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
const regCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 100);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
let camera = ortho;

const CAM_NAMES = ['İzometrik', 'Üçüncü Şahıs', 'Kuşbakışı', 'Serbest', 'Birinci Şahıs'];
let camMode = 0;
let orbitYaw = 0, orbitPitch = 0.5, orbitDist = 10;
let orthoZoom = innerWidth < innerHeight ? 16 : 20;
const ISO_YAW = Math.PI / 4, ISO_ELEV = 0.6155;

const cameraLabelEl = document.getElementById('cameraLabel');
const camBtns = document.querySelectorAll('#camButtons button');
function setCamera(mode) {
  camMode = mode;
  camera = mode === 0 || mode === 2 ? ortho : mode === 1 ? persp : mode === 3 ? perspFree : persp1st;
  cameraLabelEl.textContent = CAM_NAMES[mode];
  camBtns.forEach((b) => b.classList.toggle('active', +b.dataset.cam === mode));
  if (mode === 1) { orbitYaw = player.group.rotation.y + Math.PI; orbitPitch = 0.42; }
  player.group.visible = mode !== 4;
}
function cycleCamera() { setCamera((camMode + 1) % 5); }
camBtns.forEach((b) => b.addEventListener('click', () => setCamera(+b.dataset.cam)));

let dragging = false, dragId = null, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { if (dragId !== null) return; dragging = true; dragId = e.pointerId; lastX = e.clientX; lastY = e.clientY; });
addEventListener('pointerup', (e) => { if (e.pointerId === dragId) { dragging = false; dragId = null; } });
addEventListener('pointercancel', (e) => { if (e.pointerId === dragId) { dragging = false; dragId = null; } });
addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== dragId || !game.started) return;
  if (camMode === 1 || camMode === 3) {
    orbitYaw -= (e.clientX - lastX) * 0.006;
    orbitPitch = Math.min(1.45, Math.max(0.08, orbitPitch + (e.clientY - lastY) * 0.004));
  } else if (camMode === 0 || camMode === 2) {
    orthoZoom = Math.min(45, Math.max(8, orthoZoom + (e.clientY - lastY) * 0.05));
  }
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('wheel', (e) => {
  if (!game.started) return;
  if (camMode === 0 || camMode === 2) orthoZoom = Math.min(45, Math.max(8, orthoZoom + e.deltaY * 0.02));
  else orbitDist = Math.min(40, Math.max(4, orbitDist + e.deltaY * 0.012));
}, { passive: true });

const _eyeTarget = new THREE.Vector3();
function updateCamera() {
  const p = player.group.position;
  const headY = p.y + 1.75;
  if (game.register) {
    regCam.position.set(1.9, 2.3, 19.2);
    regCam.lookAt(-0.7, 1.1, 16.4);
    return;
  }
  if (camMode === 0 || camMode === 2) {
    _eyeTarget.set(p.x, p.y + 1.2, p.z);
    if (camMode === 0) {
      const d = 70;
      ortho.position.set(_eyeTarget.x + Math.sin(ISO_YAW) * Math.cos(ISO_ELEV) * d, _eyeTarget.y + Math.sin(ISO_ELEV) * d, _eyeTarget.z + Math.cos(ISO_YAW) * Math.cos(ISO_ELEV) * d);
    } else {
      ortho.position.set(_eyeTarget.x, _eyeTarget.y + 90, _eyeTarget.z + 0.001);
    }
    ortho.lookAt(_eyeTarget);
    const a = innerWidth / innerHeight;
    ortho.left = -orthoZoom * a; ortho.right = orthoZoom * a;
    ortho.top = orthoZoom; ortho.bottom = -orthoZoom;
    ortho.updateProjectionMatrix();
  } else if (camMode === 4) {
    persp1st.position.set(p.x, headY, p.z);
    persp1st.lookAt(p.x + Math.sin(player.group.rotation.y), headY - 0.15, p.z + Math.cos(player.group.rotation.y));
  } else {
    _eyeTarget.set(p.x, p.y + 1.2, p.z);
    const cam = camMode === 1 ? persp : perspFree;
    const cp = Math.cos(orbitPitch), sp = Math.sin(orbitPitch);
    cam.position.set(_eyeTarget.x + Math.sin(orbitYaw) * cp * orbitDist, _eyeTarget.y + sp * orbitDist, _eyeTarget.z + Math.cos(orbitYaw) * cp * orbitDist);
    cam.lookAt(_eyeTarget);
  }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  for (const cam of [persp, perspFree, persp1st, regCam]) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
});

// ------------------------------------------------------------
// MÜŞTERİLER — liste, reyon gezme, stok/fiyat kontrolü, kasa sırası
// ------------------------------------------------------------
const customers = [];
const SHIRTS = [0x4fc3f7, 0xf06292, 0xba68c8, 0xffb74d, 0x81c784, 0xe57373, 0x9575cd, 0x4db6ac, 0xfff176, 0x90a4ae];
const ENTRY = new THREE.Vector3(4.6, 0, 30);
const FRONT_Z = 7.5;
const MOODS = { shop: '🛒', missing: '❓', pricey: '💸', happy: '😊', angry: '😡', wait: '⏳', sad: '😞' };

function moodSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.8, 0.8, 1); s.position.y = 2.75; s.renderOrder = 10;
  s.userData = { c, t, mood: '' };
  return s;
}
function setMood(cu, mood) {
  const s = cu.bubble;
  if (s.userData.mood === mood) return;
  s.userData.mood = mood;
  const g = s.userData.c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.beginPath(); g.arc(32, 30, 27, 0, Math.PI * 2); g.fill();
  g.font = '34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(MOODS[mood] || '', 32, 32);
  s.userData.t.needsUpdate = true;
}

/** Koridorlar üzerinden L/U rotası (raflar arası koridor z'leri + yan koridor x=±19). */
function route(from, to) {
  if (Math.abs(from.z - to.z) < 0.05) return [to.clone()];
  const c = Math.abs(from.x - CORR_X[0]) + Math.abs(to.x - CORR_X[0]) < Math.abs(from.x - CORR_X[1]) + Math.abs(to.x - CORR_X[1]) ? CORR_X[0] : CORR_X[1];
  return [new THREE.Vector3(c, 0, from.z), new THREE.Vector3(c, 0, to.z), to.clone()];
}

function spawnCustomer() {
  const avail = Object.values(P).filter((p) => game.unlocked[p.dept]);
  if (!avail.length) return;
  const n = 1 + Math.floor(Math.random() * Math.min(4, avail.length));
  const list = [...avail].sort(() => Math.random() - 0.5).slice(0, n);
  // reyon sırasına göre diz (daha doğal gezinti): önden arkaya
  list.sort((a, b) => b.stand.z - a.stand.z);
  const ch = makeCharacter(rnd(SHIRTS), rnd([0x2c3e50, 0x37474f, 0x5d4037, 0x1a237e]), rnd([0xffd9b3, 0xf0c08f, 0xd9a066, 0xc68642]),
    Math.random() < 0.3 ? { scarf: rnd([0x9b3a6b, 0x2a6f97, 0x6a994e]) } : { mustache: Math.random() < 0.5, hair: rnd([0x3a2a1a, 0x111111, 0x8d6e63, 0x999999]) });
  ch.group.position.copy(ENTRY);
  ch.group.rotation.y = Math.PI;
  const bubble = moodSprite();
  ch.group.add(bubble);
  const cu = { ch, bubble, list, idx: 0, basket: [], state: 'enter', path: [new THREE.Vector3(ENTRY.x, 0, FRONT_Z)], dwell: 0, wait: 0, speed: 2.2 + Math.random() * 0.6, slot: -1, missing: 0, pricey: 0 };
  setMood(cu, 'shop');
  customers.push(cu);
}

function nextTarget(cu) {
  const pos = cu.ch.group.position;
  if (cu.idx < cu.list.length) {
    const p = cu.list[cu.idx];
    cu.path = route(pos, p.stand);
    cu.state = 'walk';
    return;
  }
  if (cu.basket.length) {
    cu.state = 'toQueue';
    cu.path = route(pos, new THREE.Vector3(LANE_X, 0, FRONT_Z));
    return;
  }
  leaveStore(cu, cu.missing || cu.pricey ? 'sad' : 'happy');
}

function leaveStore(cu, mood) {
  cu.state = 'leave';
  setMood(cu, mood);
  const pos = cu.ch.group.position;
  if (pos.z > FRONT_Z + 0.5) cu.path = [new THREE.Vector3(pos.x, 0, 22), new THREE.Vector3(LANE_X, 0, 24), new THREE.Vector3(LANE_X, 0, 34)];
  else cu.path = route(pos, new THREE.Vector3(ENTRY.x, 0, FRONT_Z)).concat([new THREE.Vector3(ENTRY.x, 0, 34)]);
}

function queueList() { return customers.filter((c) => c.state === 'queue' || c.state === 'pay'); }
function slotPos(i) { return new THREE.Vector3(LANE_X, 0, PAY_SPOT.z - i * 1.6); }

function updateCustomers(dt) {
  // sıra yerlerini güncelle
  const q = queueList();
  q.forEach((cu, i) => {
    if (cu.slot !== i) {
      cu.slot = i;
      cu.path = [slotPos(i)];
    }
  });
  for (let i = customers.length - 1; i >= 0; i--) {
    const cu = customers[i];
    const g = cu.ch.group;
    let moving = false;
    if (cu.path.length) {
      const t = cu.path[0];
      const dx = t.x - g.position.x, dz = t.z - g.position.z;
      const d = Math.hypot(dx, dz);
      const step = cu.speed * dt;
      if (d <= step) {
        g.position.x = t.x; g.position.z = t.z;
        cu.path.shift();
      } else {
        g.position.x += dx / d * step; g.position.z += dz / d * step;
        let diff = Math.atan2(dx, dz) - g.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        g.rotation.y += diff * Math.min(1, dt * 10);
        moving = true;
      }
    }
    if (!cu.path.length) {
      if (cu.state === 'enter') nextTarget(cu);
      else if (cu.state === 'walk') { cu.state = 'browse'; cu.dwell = 1.1 + Math.random() * 0.8; }
      else if (cu.state === 'toQueue') { cu.state = 'queue'; cu.wait = 0; setMood(cu, 'wait'); }
      else if (cu.state === 'leave') { scene.remove(g); customers.splice(i, 1); continue; }
      else if (cu.state === 'queue' && cu.slot === 0) beginPay(cu);
    }
    if (cu.state === 'browse') {
      // rafa uzan
      const p = cu.list[cu.idx];
      g.rotation.y = p.side > 0 ? Math.PI : 0;   // rafa dön
      cu.ch.parts.rArm.rotation.x = -1.3 + Math.sin(now * 6) * 0.15;
      cu.dwell -= dt;
      if (cu.dwell <= 0) {
        cu.ch.parts.rArm.rotation.x = 0;
        decideBuy(cu, p);
        cu.idx++;
        nextTarget(cu);
      }
    }
    if (cu.state === 'queue' || cu.state === 'pay') {
      cu.wait += dt;
      const limit = 70 * (game.upgrades.kasiyer ? 1.3 : 1);
      if (cu.wait > limit * 0.6) setMood(cu, 'angry');
      if (cu.wait > limit) {
        toast('😡 Bir müşteri kasada beklemekten sıkıldı ve alışverişi bırakıp gitti!');
        AudioSys.nope();
        if (payCu === cu) clearBelt();
        cu.basket = [];
        addPop(-4);
        game.dayStats.lost++;
        leaveStore(cu, 'angry');
        cu.slot = -1;
      }
    }
    animateCharacter(cu.ch, dt, moving, cu.speed);
  }
}

/** Müşteri rafın önünde: stok ve fiyata bakarak alır ya da almaz. */
function decideBuy(cu, p) {
  if (p.shelf <= 0) {
    cu.missing++;
    game.dayStats.missing++;
    setMood(cu, 'missing');
    if (cu.missing <= 2) addPop(-1);
    return;
  }
  const ratio = p.price / p.base;
  const prob = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) * 1.6);
  if (Math.random() > prob) {
    cu.pricey++;
    game.dayStats.pricey++;
    setMood(cu, 'pricey');
    addPop(-0.5);
    return;
  }
  const want = 1 + (Math.random() < 0.35 ? 1 : 0) + (ratio < 0.9 && Math.random() < 0.5 ? 1 : 0);
  const take = Math.min(want, p.shelf);
  p.shelf -= take;
  refreshShelf(p);
  for (let k = 0; k < take; k++) cu.basket.push(p);
  setMood(cu, 'shop');
}

// ------------------------------------------------------------
// KASA: ürünleri bant üzerine koy, okut, ödeme al
// ------------------------------------------------------------
let payCu = null;        // kasadaki müşteri
let scanIdx = 0, scanTotal = 0, autoScanT = 0;

function beginPay(cu) {
  if (payCu) return;
  clearBelt();
  payCu = cu;
  cu.state = 'pay';
  scanIdx = 0; scanTotal = 0;
  cu.basket.forEach((p, i) => {
    const m = new THREE.Mesh(shapeGeo(p.shape), lambert(p.color));
    m.scale.setScalar(1.6);
    m.position.set(REG.x + (i % 2 ? 0.18 : -0.18), 1.17, REG.z - 2.2 + Math.floor(i / 2) * 0.42);
    m.castShadow = true;
    scene.add(m);
    beltItems.push(m);
  });
  setMood(cu, 'wait');
  if (!game.upgrades.kasiyer && !game.register) toast('🛎️ Kasada müşteri var! Kasaya geç ve ürünleri okut.');
  AudioSys.bell();
}
function clearBelt() {
  for (const m of beltItems) scene.remove(m);
  beltItems = [];
  payCu = null;
}

function scanNext() {
  if (!payCu) { toast('Kasada müşteri yok.'); return; }
  if (scanIdx < payCu.basket.length) {
    const p = payCu.basket[scanIdx];
    const m = beltItems[scanIdx];
    if (m) tweens.push({ mesh: m, age: 0, dur: 0.35, from: m.position.clone(), to: new THREE.Vector3(REG.x, 1.3, REG.z + 1.3), vanish: true });
    scanTotal += p.price;
    scanIdx++;
    AudioSys.scan();
    return;
  }
  // tüm ürünler okundu → ödeme
  const cu = payCu;
  addMoney(scanTotal);
  AudioSys.cash();
  const happy = cu.wait < 35 && !cu.missing && !cu.pricey;
  addPop(happy ? 1.5 : 0.5);
  game.dayStats.served++;
  toast(`${rnd(['💳 Kartla', '💵 Nakit'])} ödendi: ${fmtTL(scanTotal)} ${happy ? '— "Çok güzel market, yine geleceğim!"' : ''}`);
  clearBelt();
  cu.slot = -1;
  leaveStore(cu, happy ? 'happy' : 'sad');
}

// ------------------------------------------------------------
// SİPARİŞ TABLETİ — koli siparişi, fiyat ayarı, lisans ve geliştirmeler
// ------------------------------------------------------------
const panel = document.getElementById('orderPanel');
let panelTab = 'urun';
function isPanelOpen() { return panel.style.display === 'flex'; }
function openOrderPanel() { if (!game.started) return; AudioSys.init(); panel.style.display = 'flex'; renderPanel(); }
function closeOrderPanel() { panel.style.display = 'none'; }
document.getElementById('panelClose').addEventListener('click', closeOrderPanel);
document.querySelectorAll('#panelTabs button').forEach((b) => b.addEventListener('click', () => { panelTab = b.dataset.tab; renderPanel(); }));

const UPGRADES = [
  { id: 'kasiyer', icon: '🧑‍💼', name: 'Kasiyer işe al', desc: `Kasayı o yönetir. Günlük maaş ${fmtTL(WAGE)}.`, price: 500 },
  { id: 'hizliEsek', icon: '🥕', name: 'Eşeğe havuç diyeti', desc: 'Eşek siparişleri çok daha hızlı getirir.', price: 350 },
  { id: 'reklam', icon: '📣', name: 'Mahalle reklamı', desc: 'Popülerlik +15, daha çok müşteri.', price: 400, once: true },
];

function orderTotal() {
  let t = 0;
  for (const [id, k] of Object.entries(game.orderCart)) t += k * KOLI * P[id].cost;
  return t;
}

function renderPanel() {
  document.querySelectorAll('#panelTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === panelTab));
  const body = document.getElementById('panelBody');
  const foot = document.getElementById('panelFoot');
  document.getElementById('panelMoney').textContent = fmtTL(game.money);
  if (panelTab === 'urun') {
    let html = '';
    for (const dk of Object.keys(DEPTS)) {
      if (!game.unlocked[dk]) continue;
      html += `<div class="dept-h" style="border-color:${DEPTS[dk].css}">${DEPTS[dk].name}</div>`;
      for (const p of Object.values(P).filter((x) => x.dept === dk)) {
        const k = game.orderCart[p.id] || 0;
        const margin = Math.round((p.price - p.cost) / p.price * 100);
        html += `<div class="prow">
          <div class="pinfo"><b>${p.name}</b><small>Raf ${p.shelf}/${SHELF_CAP} · Depo ${p.depo} · Alış ${fmtTL(p.cost)}</small></div>
          <div class="pprice"><button data-pr="-" data-id="${p.id}">−</button><span class="${p.price > p.base * 1.25 ? 'hi' : p.price < p.base ? 'lo' : ''}">${fmtTL(p.price)}</span><button data-pr="+" data-id="${p.id}">+</button><small>%${margin} kâr</small></div>
          <div class="pord"><button data-k="-" data-id="${p.id}">−</button><span>${k} koli</span><button data-k="+" data-id="${p.id}">+</button></div>
        </div>`;
      }
    }
    body.innerHTML = html;
    const total = orderTotal();
    const eta = game.upgrades.hizliEsek ? 'hızlı' : 'normal';
    foot.innerHTML = `<div>🧺 Sipariş: <b>${fmtTL(total)}</b> <small>(1 koli = ${KOLI} adet, teslimat: 🐴 ${eta})</small></div>
      <button id="orderGo" ${total <= 0 || total > game.money ? 'disabled' : ''}>🐴 Siparişi Ver</button>`;
    document.getElementById('orderGo').addEventListener('click', placeOrder);
  } else {
    let html = '<div class="dept-h">🔓 Reyon lisansları</div>';
    for (const [dk, d] of Object.entries(DEPTS)) {
      if (!d.license) continue;
      const owned = game.unlocked[dk];
      html += `<div class="prow"><div class="pinfo"><b>${d.name}</b><small>${CATALOG.filter((c) => c[2] === dk).map((c) => c[1]).join(', ')}</small></div>
        <div class="pord"><button class="buy" data-lic="${dk}" ${owned || game.money < d.license ? 'disabled' : ''}>${owned ? '✓ Açık' : fmtTL(d.license)}</button></div></div>`;
    }
    html += '<div class="dept-h">🛠️ Geliştirmeler</div>';
    for (const u of UPGRADES) {
      const owned = !!game.upgrades[u.id];
      html += `<div class="prow"><div class="pinfo"><b>${u.icon} ${u.name}</b><small>${u.desc}</small></div>
        <div class="pord"><button class="buy" data-up="${u.id}" ${owned || game.money < u.price ? 'disabled' : ''}>${owned ? '✓ Alındı' : fmtTL(u.price)}</button></div></div>`;
    }
    body.innerHTML = html;
    foot.innerHTML = '<div><small>Lisans alınca reyon açılır; müşteriler oradan da alışveriş yapar. Rafı doldurmak için sipariş vermeyi unutma!</small></div>';
  }
  body.querySelectorAll('button[data-pr]').forEach((b) => b.addEventListener('click', () => {
    const p = P[b.dataset.id];
    const step = Math.max(1, Math.round(p.base * 0.05));
    p.price = clamp(p.price + (b.dataset.pr === '+' ? step : -step), Math.ceil(p.cost * 0.8), Math.round(p.base * 2.5));
    refreshTag(p);
    renderPanel();
  }));
  body.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.id;
    const cur = game.orderCart[id] || 0;
    game.orderCart[id] = clamp(cur + (b.dataset.k === '+' ? 1 : -1), 0, 8);
    if (!game.orderCart[id]) delete game.orderCart[id];
    renderPanel();
  }));
  body.querySelectorAll('button[data-lic]').forEach((b) => b.addEventListener('click', () => {
    const dk = b.dataset.lic;
    const d = DEPTS[dk];
    if (game.money < d.license) return;
    addMoney(-d.license);
    game.dayStats.licenses += d.license;
    game.unlocked[dk] = true;
    lockSigns[dk].visible = false;
    AudioSys.cash();
    toast(`🔓 ${d.name} reyonu açıldı! Şimdi ürün sipariş et.`);
    panelTab = 'urun';
    renderPanel();
    saveGame();
  }));
  body.querySelectorAll('button[data-up]').forEach((b) => b.addEventListener('click', () => {
    const u = UPGRADES.find((x) => x.id === b.dataset.up);
    if (game.money < u.price || game.upgrades[u.id]) return;
    addMoney(-u.price);
    game.dayStats.licenses += u.price;
    game.upgrades[u.id] = true;
    if (u.id === 'reklam') addPop(15);
    if (u.id === 'kasiyer') { cashierNpc.group.visible = true; if (game.register) leaveRegister(); }
    AudioSys.cash();
    toast(`${u.icon} ${u.name} — tamam!`);
    renderPanel();
    saveGame();
  }));
}

function placeOrder() {
  const total = orderTotal();
  if (total <= 0 || total > game.money) return;
  addMoney(-total);
  game.dayStats.orders += total;
  deliveries.push({ items: { ...game.orderCart } });
  game.orderCart = {};
  AudioSys.cash();
  toast(donkeyState.mode === 'away' ? '🐴 Sipariş verildi! Eşek arabası yola çıkıyor, depoya getirecek.' : '🐴 Sipariş sıraya alındı, eşek önceki teslimattan sonra getirecek.');
  closeOrderPanel();
  saveGame();
}

// ------------------------------------------------------------
// EŞEK TESLİMATI
// ------------------------------------------------------------
function updateDonkey(dt) {
  const d = donkey;
  d.t += dt;
  const s = donkeyState;
  const speed = game.upgrades.hizliEsek ? 7 : 4;
  let moving = false;
  const moveTo = (target) => {
    const g = d.group.position;
    const dx = target.x - g.x;
    const step = speed * dt;
    if (Math.abs(dx) <= step) { g.x = target.x; return true; }
    g.x += Math.sign(dx) * step;
    d.group.rotation.y = dx < 0 ? -Math.PI / 2 : Math.PI / 2;
    moving = true;
    return false;
  };
  if (s.mode === 'away') {
    d.group.visible = false;
    if (deliveries.length) {
      s.order = deliveries.shift();
      s.mode = 'prep';
      s.timer = game.upgrades.hizliEsek ? 2 : 6;
    }
  } else if (s.mode === 'prep') {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.mode = 'coming';
      d.group.position.copy(DONKEY_FAR);
      d.group.visible = true;
      d.cartBoxes.forEach((b) => (b.visible = true));
    }
  } else if (s.mode === 'coming') {
    if (moveTo(DONKEY_DOCK)) {
      s.mode = 'unload';
      s.queue = [];
      for (const [id, k] of Object.entries(s.order.items)) for (let i = 0; i < k; i++) s.queue.push(id);
      s.timer = 0.4;
      d.bray = 1.2;
      AudioSys.bray();
      toast('🐴 Eşek arabası geldi! Koliler depoya indiriliyor.');
    }
  } else if (s.mode === 'unload') {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.timer = 0.22;
      const id = s.queue.shift();
      if (id) {
        const p = P[id];
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), p.pallet.boxMat);
        m.position.set(DONKEY_DOCK.x + 2.3, 1.4, DONKEY_DOCK.z);
        m.castShadow = true;
        scene.add(m);
        tweens.push({ mesh: m, age: 0, dur: 0.7, from: m.position.clone(), to: new THREE.Vector3(p.pallet.x, 1.0, p.pallet.z), vanish: true, done: () => { p.depo += KOLI; refreshPallet(p); } });
        const nb = d.cartBoxes.filter((b) => b.visible);
        if (nb.length && s.queue.length < nb.length) nb[nb.length - 1].visible = false;
      } else {
        d.cartBoxes.forEach((b) => (b.visible = false));
        s.mode = 'rest';
        s.timer = 5;
        toast('📦 Teslimat tamam! Depodan koliyi alıp rafları doldur. (Eşeği sevmeyi unutma 🥕)');
      }
    }
  } else if (s.mode === 'rest') {
    s.timer -= dt;
    if (s.timer <= 0) s.mode = 'leaving';
  } else if (s.mode === 'leaving') {
    if (moveTo(DONKEY_FAR)) { s.mode = 'away'; s.order = null; }
  }
  // animasyon
  if (moving) d.phase += dt * 9;
  const amp = moving ? 0.55 : 0;
  d.legs.forEach((l, i) => (l.rotation.x = Math.sin(d.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp));
  d.body.position.y = moving ? Math.abs(Math.sin(d.phase)) * 0.05 : 0;
  d.tail.rotation.z = Math.sin(d.t * 2.6) * 0.35;
  if (d.bray > 0) { d.bray -= dt; d.head.rotation.x = -0.5 + Math.sin(d.t * 10) * 0.12; }
  else d.head.rotation.x = Math.sin(d.t * 0.8) * 0.06 + (moving ? 0 : 0.15);
}

function nearDonkey() {
  const s = donkeyState;
  if (!donkey.group.visible || (s.mode !== 'unload' && s.mode !== 'rest')) return false;
  const p = player.group.position;
  return Math.hypot(p.x - donkey.group.position.x, p.z - donkey.group.position.z) < 7;
}

// ------------------------------------------------------------
// ETKİLEŞİM — koli al / rafa diz / depoya koy / kasa / eşek
// ------------------------------------------------------------
function nearestPallet(r = 1.9) {
  const p = player.group.position;
  let best = null, bd = r;
  for (const x of pallets) {
    const d = Math.hypot(x.pallet.x - p.x, x.pallet.z - p.z);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}
function nearestShelfSpot() {
  const p = player.group.position;
  let best = null, bd = 99;
  for (const x of Object.values(P)) {
    const dx = Math.abs(x.front.x - p.x);
    if (dx < 4.9 && Math.abs(x.front.z - p.z) < 1.3 && dx < bd) { bd = dx; best = x; }
  }
  return best;
}
function atRegister() {
  const p = player.group.position;
  return Math.hypot(p.x - CASHIER_SPOT.x, p.z - CASHIER_SPOT.z) < 1.8;
}

function contextActions() {
  // [ana eylem etiketi, yan eylem etiketi]
  if (game.register) return [payCu ? (scanIdx < payCu.basket.length ? `📟 Okut (${scanIdx}/${payCu.basket.length})` : `💵 Ödemeyi Al ${fmtTL(scanTotal)}`) : '⏳ Müşteri bekleniyor', '🚪 Kasadan Çık'];
  if (nearDonkey()) return ['🥕 Eşeği Sev', null];
  if (atRegister() && !game.upgrades.kasiyer) return ['🧾 Kasaya Geç', null];
  const pal = nearestPallet();
  if (carrying) {
    const sh = nearestShelfSpot();
    if (sh && sh.id === carrying.id) return [`📥 Rafa Diz (${sh.shelf}/${SHELF_CAP})`, '📦 Koliyi Bırak'];
    if (pal && pal.id === carrying.id) return ['↩️ Depoya Koy', null];
    if (sh) return [`❌ Bu raf ${sh.name}`, '📦 Koliyi Bırak'];
    return [null, '📦 Koliyi Bırak'];
  }
  if (pal) return [pal.depo > 0 ? `📦 ${pal.name} kolisi al (${pal.depo})` : `${pal.name}: depoda yok`, null];
  const sh = nearestShelfSpot();
  if (sh) return [`ℹ️ ${sh.name}: raf ${sh.shelf}/${SHELF_CAP}, ${fmtTL(sh.price)}`, null];
  return [null, null];
}

function primaryAction() {
  AudioSys.init();
  if (!game.started || isPanelOpen()) return;
  if (game.register) { scanNext(); return; }
  if (nearDonkey()) {
    donkey.bray = 1.2;
    AudioSys.bray();
    toast(rnd(['🐴 "Aiii-üüü!" Eşek çok mutlu! 💕', '🐴 Eşek havuç bekliyor gibi bakıyor 🥕', '🐴 Eşek kulaklarını oynattı, seni seviyor!']));
    return;
  }
  if (atRegister() && !game.upgrades.kasiyer) { enterRegister(); return; }
  const pal = nearestPallet();
  if (carrying) {
    const sh = nearestShelfSpot();
    if (sh && sh.id === carrying.id) {
      if (!game.unlocked[sh.dept]) { toast('Bu reyon kilitli.'); return; }
      const space = SHELF_CAP - sh.shelf;
      if (space <= 0) { toast('Raf zaten dolu!'); AudioSys.nope(); return; }
      const n = Math.min(space, carrying.units);
      sh.shelf += n;
      carrying.units -= n;
      refreshShelf(sh);
      AudioSys.place();
      toast(`📥 ${n} ${sh.name} rafa dizildi.${carrying.units ? ` Kolide ${carrying.units} kaldı.` : ''}`);
      if (carrying.units <= 0) setCarry(null);
      return;
    }
    if (pal && pal.id === carrying.id) {
      pal.depo += carrying.units;
      refreshPallet(pal);
      setCarry(null);
      AudioSys.place();
      return;
    }
    if (sh) { toast(`Bu ${sh.name} rafı. Elindeki koli: ${P[carrying.id].name}.`); AudioSys.nope(); }
    return;
  }
  if (pal) {
    if (pal.depo <= 0) { toast(`${pal.name} depoda kalmadı. Sipariş ver! (📦 Sipariş)`); AudioSys.nope(); return; }
    const n = Math.min(KOLI, pal.depo);
    pal.depo -= n;
    refreshPallet(pal);
    setCarry({ id: pal.id, units: n });
    AudioSys.pickup();
    toast(`📦 ${pal.name} kolisi alındı (${n} adet). Şimdi ${DEPTS[pal.dept].name} reyonuna götür.`);
  }
}

function secondaryAction() {
  if (!game.started) return;
  if (game.register) { leaveRegister(); return; }
  if (carrying) {
    // en yakın paletine geri koymak yerine yere bırakmak: depoya iade sayılır
    const p = P[carrying.id];
    p.depo += carrying.units;
    refreshPallet(p);
    toast(`📦 Koli depoya geri gönderildi (${p.name}).`);
    setCarry(null);
  }
}

function setCarry(c) {
  carrying = c;
  carryBox.visible = !!c;
  if (c) carryBox.material = P[c.id].pallet.boxMat;
  player.parts.lArm.rotation.x = c ? -1.2 : 0;
  player.parts.rArm.rotation.x = c ? -1.2 : 0;
}

function enterRegister() {
  if (carrying) { toast('Önce elindeki koliyi bırak (rafa diz ya da depoya koy).'); AudioSys.nope(); return; }
  game.register = true;
  player.group.visible = false;
  player.group.position.copy(CASHIER_SPOT);
  player.group.rotation.y = -Math.PI / 2;
  toast('🧾 Kasadasın. Okut butonuyla (E) ürünleri tek tek okut, sonra ödemeyi al.');
}
function leaveRegister() {
  game.register = false;
  player.group.visible = camMode !== 4;
  player.group.position.set(CASHIER_SPOT.x + 1.2, 0, CASHIER_SPOT.z);
}

// ------------------------------------------------------------
// MİNİ HARİTA (ShopSim 3D'den uyarlandı)
// ------------------------------------------------------------
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
const mmBase = document.createElement('canvas');
mmBase.width = mmCanvas.width; mmBase.height = mmCanvas.height;
const MM_W = 104, MM_D = 56;
const MM_X0 = -STORE_W / 2 - 1, MM_Z0 = -STORE_D / 2 - 2;
function mmXY(x, z) { return [(x - MM_X0) / MM_W * mmBase.width, (z - MM_Z0) / MM_D * mmBase.height]; }
function drawMinimapBase() {
  const g = mmBase.getContext('2d');
  g.fillStyle = '#1b2030'; g.fillRect(0, 0, mmBase.width, mmBase.height);
  for (const c of colliders) {
    g.fillStyle = c.kind === 'shelf' ? '#8b95a8' : c.kind === 'pallet' ? '#a1887f' : '#4a5468';
    const [x, y] = mmXY(c.minX, c.minZ);
    g.fillRect(x, y, Math.max(1, (c.maxX - c.minX) / MM_W * mmBase.width), Math.max(1, (c.maxZ - c.minZ) / MM_D * mmBase.height));
  }
  const [cx, cy] = mmXY(REG.x, REG.z);
  g.fillStyle = '#4caf50'; g.fillRect(cx - 3, cy - 8, 6, 16);
}
function drawMinimap() {
  const g = mmCtx;
  g.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
  g.drawImage(mmBase, 0, 0);
  for (const cu of customers) {
    const [x, y] = mmXY(cu.ch.group.position.x, cu.ch.group.position.z);
    g.fillStyle = cu.bubble.userData.mood === 'angry' ? '#ff5252' : '#4fc3f7';
    g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  if (donkey.group.visible) {
    const [x, y] = mmXY(Math.min(donkey.group.position.x, 66), donkey.group.position.z);
    g.font = '12px sans-serif'; g.fillText('🐴', x - 6, y + 4);
  }
  const tgt = currentTarget();
  if (tgt) {
    const [tx, ty] = mmXY(tgt.x, tgt.z);
    g.fillStyle = '#ffd54f';
    g.beginPath(); g.arc(tx, ty, 3.5 + Math.sin(now * 5), 0, Math.PI * 2); g.fill();
  }
  const p = player.group.position;
  const [px, py] = mmXY(p.x, p.z);
  g.save(); g.translate(px, py); g.rotate(-player.group.rotation.y + Math.PI);
  g.fillStyle = '#7CFC98';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
  g.restore();
}

/** Yol gösterici hedef: elde koli → o ürünün rafı; kasada müşteri → kasa; boş raf + depoda stok → palet. */
function currentTarget() {
  if (game.register) return null;
  if (carrying) {
    return P[carrying.id].front;
  }
  if (payCu && !game.upgrades.kasiyer) return CASHIER_SPOT;
  let best = null;
  for (const p of Object.values(P)) {
    if (!game.unlocked[p.dept] || p.depo <= 0) continue;
    if (p.shelf <= 6 && (!best || p.shelf < best.shelf)) best = p;
  }
  if (best) return new THREE.Vector3(best.pallet.x, 0, best.pallet.z);
  return null;
}

// ------------------------------------------------------------
// HAREKET (ShopSim 3D + joystick)
// ------------------------------------------------------------
function blocked(x, z) {
  for (const c of colliders) {
    if (x > c.minX - PLAYER_R && x < c.maxX + PLAYER_R && z > c.minZ - PLAYER_R && z < c.maxZ + PLAYER_R) return true;
  }
  return false;
}

const fwdV = new THREE.Vector3(), rightV = new THREE.Vector3(), moveV = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

function updatePlayer(dt) {
  if (game.register) { animateCharacter(player, dt, false, 0); return; }
  camera.getWorldDirection(fwdV); fwdV.y = 0;
  if (fwdV.lengthSq() < 1e-6) fwdV.set(0, 0, -1);
  fwdV.normalize();
  rightV.crossVectors(fwdV, UP).normalize();

  moveV.set(0, 0, 0);
  if (keys.KeyW || keys.ArrowUp) moveV.add(fwdV);
  if (keys.KeyS || keys.ArrowDown) moveV.sub(fwdV);
  if (keys.KeyD || keys.ArrowRight) moveV.add(rightV);
  if (keys.KeyA || keys.ArrowLeft) moveV.sub(rightV);
  moveV.addScaledVector(fwdV, joy.y).addScaledVector(rightV, joy.x);

  const mag = Math.min(1, moveV.length());
  const moving = mag > 0.05;
  if (moving) {
    moveV.normalize();
    const speed = WALK * mag * (keys.ShiftLeft || keys.ShiftRight ? SPRINT : 1) * (carrying ? 0.85 : 1);
    const p = player.group.position;
    const nx = p.x + moveV.x * speed * dt;
    const nz = p.z + moveV.z * speed * dt;
    if (!blocked(nx, p.z)) p.x = nx;
    if (!blocked(p.x, nz)) p.z = nz;
    p.x = Math.min(63.2, Math.max(-STORE_W / 2 + 1, p.x));
    p.z = Math.min(STORE_D / 2 + 6, Math.max(-STORE_D / 2 + 1, p.z));
    const targetRot = Math.atan2(moveV.x, moveV.z);
    let diff = targetRot - player.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.group.rotation.y += diff * Math.min(1, dt * 12);
  }
  animateCharacter(player, dt, moving, WALK);
  if (carrying) { player.parts.lArm.rotation.x = -1.2; player.parts.rArm.rotation.x = -1.2; }
}

// ------------------------------------------------------------
// HUD
// ------------------------------------------------------------
const el = (id) => document.getElementById(id);
function clockStr() {
  const m = Math.floor(game.minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function updateHud() {
  el('moneyVal').textContent = fmtTL(game.money);
  el('popVal').textContent = `⭐ ${Math.round(game.pop)}`;
  el('clockVal').textContent = `🕗 ${clockStr()} · Gün ${game.day}`;
  el('queueVal').textContent = `👥 ${queueList().length}`;
  el('carryVal').textContent = carrying ? `📦 ${P[carrying.id].name} kolisi: ${carrying.units} adet` : '';
  el('carryVal').style.display = carrying ? 'block' : 'none';
  el('donkeyVal').textContent = donkeyState.mode === 'away' && !deliveries.length ? '' : donkeyState.mode === 'prep' ? '🐴 Eşek yükleniyor...' : donkeyState.mode === 'coming' ? '🐴 Eşek yolda!' : donkeyState.mode === 'unload' ? '🐴 Koliler iniyor' : donkeyState.mode === 'rest' ? '🐴 Eşek dinleniyor' : deliveries.length ? `🐴 ${deliveries.length} sipariş sırada` : '';
  const low = Object.values(P).filter((p) => game.unlocked[p.dept] && p.shelf <= 4);
  el('lowVal').textContent = low.length ? `⚠️ Azalan raf: ${low.slice(0, 3).map((p) => p.name).join(', ')}${low.length > 3 ? '…' : ''}` : '';
}

const promptEl = el('prompt');
let lastAct = '';
function updateActions() {
  const [a, b] = contextActions();
  const act = el('btnAct'), alt = el('btnAlt');
  if (a !== lastAct) {
    lastAct = a;
    act.textContent = a || 'E';
    act.classList.toggle('dim', !a);
  }
  alt.style.display = b ? 'block' : 'none';
  if (b) alt.textContent = b;
  promptEl.style.display = a && !matchMedia('(pointer: coarse)').matches ? 'block' : 'none';
  if (a) promptEl.textContent = (matchMedia('(pointer: coarse)').matches ? '' : 'E: ') + a;
}

// ------------------------------------------------------------
// GÜN DÖNGÜSÜ
// ------------------------------------------------------------
function updateDay(dt) {
  if (game.dayOver) return;
  game.minutes += dt * MIN_PER_SEC;
  const h = game.minutes / 60;
  if (h < CLOSE_H) {
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      const interval = 15 - game.pop * 0.1;
      game.spawnT = interval * (0.6 + Math.random() * 0.8);
      if (customers.length < 14) spawnCustomer();
    }
  } else if (!customers.length) {
    endDay();
  } else if (Math.floor(game.minutes) % 30 === 0) {
    el('lowVal').textContent = '🔒 Market kapandı, son müşteriler çıkıyor...';
  }
}

function endDay() {
  game.dayOver = true;
  if (game.register) leaveRegister();
  const s = game.dayStats;
  const wage = game.upgrades.kasiyer ? WAGE : 0;
  const cost = s.orders + s.licenses + RENT + wage;
  game.money -= RENT + wage;
  const net = s.revenue - cost;
  const dp = Math.round(game.pop - s.pop0);
  el('dayReport').innerHTML = `<h2>📅 Gün ${game.day} bitti</h2>
    <div class="row"><span>💰 Satış (ciro)</span><b>${fmtTL(s.revenue)}</b></div>
    <div class="row"><span>📦 Siparişler</span><b class="neg">-${fmtTL(s.orders)}</b></div>
    ${s.licenses ? `<div class="row"><span>🔓 Lisans & geliştirme</span><b class="neg">-${fmtTL(s.licenses)}</b></div>` : ''}
    <div class="row"><span>🏠 Kira + elektrik</span><b class="neg">-${fmtTL(RENT)}</b></div>
    ${wage ? `<div class="row"><span>🧑‍💼 Kasiyer maaşı</span><b class="neg">-${fmtTL(wage)}</b></div>` : ''}
    <div class="row total"><span>Net</span><b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${fmtTL(net)}</b></div>
    <div class="row"><span>🛒 Hizmet edilen müşteri</span><b>${s.served}</b></div>
    <div class="row"><span>❓ Rafta bulunamayan ürün</span><b>${s.missing}</b></div>
    <div class="row"><span>💸 Pahalı bulunan ürün</span><b>${s.pricey}</b></div>
    <div class="row"><span>😡 Kaçan müşteri</span><b>${s.lost}</b></div>
    <div class="row total"><span>⭐ Popülerlik</span><b>${Math.round(game.pop)} (${dp >= 0 ? '+' : ''}${dp})</b></div>
    <div class="row total"><span>🏦 Kasa</span><b>${fmtTL(game.money)}</b></div>
    ${game.money < 0 ? '<p class="warn">Kasa ekside! Fiyatları ve siparişleri gözden geçir.</p>' : ''}`;
  el('dayOverlay').style.display = 'flex';
  AudioSys.cash();
  updateHud();
}
el('nextDay').addEventListener('click', () => {
  el('dayOverlay').style.display = 'none';
  game.day++;
  game.minutes = OPEN_H * 60;
  game.dayOver = false;
  game.spawnT = 3;
  newDayStats();
  saveGame();
  toast(`☀️ Gün ${game.day} başladı! Rafları kontrol et, eksikleri sipariş et.`);
});

// ------------------------------------------------------------
// ANA DÖNGÜ
// ------------------------------------------------------------
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.45, 0.45, 11, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
);
scene.add(beacon);
const clock = new THREE.Clock();
let now = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  now += dt;
  const paused = !game.started || isPanelOpen() || game.dayOver;

  if (!paused) {
    updatePlayer(dt);
    updateCustomers(dt);
    updateDay(dt);
    // kasiyer otomatik okutur
    if (payCu && game.upgrades.kasiyer) {
      autoScanT -= dt;
      if (autoScanT <= 0) { autoScanT = 0.75; scanNext(); }
      cashierNpc.parts.rArm.rotation.x = -1 + Math.sin(now * 8) * 0.3;
    }
    game.saveT += dt;
    if (game.saveT > 20) { game.saveT = 0; saveGame(); }
  }
  if (game.started) updateDonkey(paused ? 0 : dt);

  // tweenler
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.age += dt;
    const k = Math.min(1, tw.age / tw.dur);
    if (tw.from) {
      tw.mesh.position.lerpVectors(tw.from, tw.to, k);
      tw.mesh.position.y += Math.sin(k * Math.PI) * 0.8;
    }
    if (k >= 1) {
      if (tw.vanish) scene.remove(tw.mesh);
      if (tw.done) tw.done();
      tweens.splice(i, 1);
    }
  }

  if (game.started) {
    const tgt = currentTarget();
    beacon.visible = !!tgt && !game.register;
    if (tgt) {
      beacon.position.set(tgt.x, 5.5, tgt.z);
      const pulse = 1 + Math.sin(now * 4) * 0.18;
      beacon.scale.set(pulse, 1, pulse);
      if (!game.register) {
        camera.getWorldDirection(fwdV); fwdV.y = 0; fwdV.normalize();
        rightV.crossVectors(fwdV, UP).normalize();
        const p = player.group.position;
        const vx = tgt.x - p.x, vz = tgt.z - p.z;
        const a = Math.atan2(vx * rightV.x + vz * rightV.z, vx * fwdV.x + vz * fwdV.z) * 180 / Math.PI;
        el('compass').style.transform = `translateX(-50%) rotate(${a}deg)`;
      }
    }
    el('compass').style.display = tgt && !game.register ? 'block' : 'none';
    if (Math.floor(now * 4) !== Math.floor((now - dt) * 4)) updateHud();
    updateActions();
    if (minimapVisible) drawMinimap();
  } else {
    beacon.visible = false;
  }

  updateCamera();
  renderer.render(scene, game.register ? regCam : camera);
}

// ------------------------------------------------------------
// BAŞLAT
// ------------------------------------------------------------
drawMinimapBase();
function start(fresh) {
  AudioSys.init();
  if (fresh || !loadGame()) newGameState();
  newDayStats();
  applyWorld();
  el('startOverlay').style.display = 'none';
  el('hudRoot').style.display = 'block';
  game.started = true;
  setCamera(camMode);
  toast(fresh ? '🐴 EsekMarketi\'ne hoş geldin! Raflar yarı dolu. 📦 Sipariş ver, eşek getirsin, rafları doldur, kasada müşterileri karşıla!' : `Tekrar hoş geldin! Gün ${game.day}, ${clockStr()}`, 5000);
}
el('startBtn').addEventListener('click', () => start(true));
el('continueBtn').addEventListener('click', () => start(false));
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s && s.v === 1) {
    el('continueBtn').style.display = 'inline-block';
    el('continueBtn').textContent = `▶ Devam Et (Gün ${s.day} · ${fmtTL(s.money)})`;
    el('startBtn').textContent = '🆕 Yeni Oyun';
  }
} catch (e) { /* yok say */ }
document.addEventListener('visibilitychange', () => { if (document.hidden && game.started) saveGame(); });
// Android uygulaması (APK) geri tuşu
window.__androidBack = () => {
  if (isPanelOpen()) { closeOrderPanel(); return true; }
  if (game.register) { leaveRegister(); return true; }
  if (game.started) { saveGame(); return false; }
  return false;
};
window.__androidPause = () => { if (game.started) saveGame(); };
if (new URLSearchParams(location.search).has('debug')) window.__dbg = { game, P, customers, donkeyState, deliveries, player, spawnCustomer, setCarry, primaryAction, enterRegister, scanNext };
setCamera(0);
tick();
