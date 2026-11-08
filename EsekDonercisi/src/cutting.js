// =========================================================
// cutting.js — Döner kesme: ocakta pişme (çiğ / kıvamında / yanık), parmakla aşağı
// kaydırarak yaprak yaprak kesme, kıvrık dilimler, yarım ekmek ve kağıtlı dürüm hazırlama
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, mat, canvasTexture } from './city.js';

export const MAX_SLICES = 8;
const TOP_ICON = { domates: '🍅', sogan: '🧅', marul: '🥬', tursu: '🥒', acisos: '🌶️', mayonez: '🥫' };
export const ITEM_INFO = {
  ekmek: { label: 'Ekmek Arası', icon: '🥖' },
  durum: { label: 'Dürüm', icon: '🌯' },
};

// Pişme eşikleri
export const COOK_RAW = 0.55;
export const COOK_BURNT = 1.25;
const COOK_RATE = 0.045;   // açık ocakta saniyede (çiğden kıvamına ~15-20 sn)
const CUT_EXPOSE = 0.16;   // her dilim daha az pişmiş katmanı açığa çıkarır

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);

// Pişme rengi: çiğ pembe → altın kahve → koyu karamel → kömür
const COOK_STOPS = [
  [0.0, new THREE.Color(0xe7a596)],
  [0.55, new THREE.Color(0xd4955e)],
  [0.9, new THREE.Color(0xb46a33)],
  [1.25, new THREE.Color(0x87471f)],
  [1.8, new THREE.Color(0x2a1a10)],
];
function cookColor(v, out) {
  let i = 0;
  while (i < COOK_STOPS.length - 2 && v > COOK_STOPS[i + 1][0]) i++;
  const [a, ca] = COOK_STOPS[i];
  const [b, cb] = COOK_STOPS[i + 1];
  return out.copy(ca).lerp(cb, clamp((v - a) / (b - a), 0, 1));
}

let paperTex = null;
function durumPaper() {
  if (paperTex) return paperTex;
  paperTex = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#fbf8f0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#c1121f';
    c.fillRect(0, 6, w, 5);
    c.fillRect(0, h - 11, w, 5);
    c.font = 'bold 20px "Bungee", Impact, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('EŞEK DÖNERCİSİ', w / 2, h / 2);
  });
  return paperTex;
}

export class CuttingStation {
  constructor(ctx, shop) {
    this.ctx = ctx;
    this.shop = shop;
    this.zone = document.getElementById('cutZone');
    this.active = false;
    this.slices = 0;
    this.sliceQ = [];            // her dilimin kalitesi: 'raw' | 'good' | 'burnt'
    this.item = null;            // { type, slices, toppings, raw, burnt }
    this.selected = new Set();   // ürüne eklenecek malzemeler (domates, soğan...)
    this.withAyran = false;      // servis ederken yanına ayran
    this.maxSlices = MAX_SLICES; // Büyük tepsi yükseltmesiyle 12
    this.swipeFactor = 1;        // Keskin bıçak yükseltmesiyle 0.6
    this.meatLevel = 1;          // şişteki et miktarı (görsel)
    this.cook = 0.9;             // et yüzeyinin pişme derecesi
    this.flying = [];
    this.pile = [];
    this.itemMesh = null;
    this.itemGrow = 1;
    this.stroke = null;
    this.totalCut = 0;
    this.t = 0;
    this._tmpColor = new THREE.Color();

    const meatTex = shop.meatMat.map;
    this.sliceMats = {
      good: new THREE.MeshStandardMaterial({ map: meatTex, color: 0xb46a33, roughness: 0.55, side: THREE.DoubleSide }),
      raw: new THREE.MeshStandardMaterial({ map: meatTex, color: 0xe7a596, roughness: 0.45, side: THREE.DoubleSide }),
      burnt: new THREE.MeshStandardMaterial({ map: meatTex, color: 0x3a2214, roughness: 0.8, side: THREE.DoubleSide }),
    };

    this.knife = this._buildKnife();
    this.knife.visible = false;
    ctx.scene.add(this.knife);
    this.knifeY = shop.meatTopY;
    this.knifeTargetY = shop.meatTopY;

    this._bind();
  }

  _buildKnife() {
    // Uzun, ince döner bıçağı: çelik ağız, parlak kenar, pirinç bilezik, kara saplı
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xe6ebf0, metalness: 0.95, roughness: 0.18 });
    const blade = new THREE.Shape();
    blade.moveTo(-0.32, -0.035);
    blade.lineTo(0.24, -0.04);
    blade.lineTo(0.24, 0.035);
    blade.lineTo(-0.28, 0.03);
    blade.quadraticCurveTo(-0.36, 0.01, -0.34, -0.035);
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.004, bevelEnabled: false });
    bg.translate(0, 0, -0.002);
    const bm = new THREE.Mesh(bg, steel);
    bm.castShadow = true;
    g.add(bm);
    addBox(g, 0.56, 0.008, 0.006, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 }), -0.04, -0.038, 0, false);
    addBox(g, 0.025, 0.085, 0.03, new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 }), 0.255, 0, 0, false);
    const handle = new THREE.CapsuleGeometry(0.022, 0.14, 4, 10);
    handle.rotateZ(Math.PI / 2);
    addMesh(g, handle, new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.5 }), 0.36, 0, 0, true);
    g.rotation.z = -0.1;
    return g;
  }

  _bind() {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      try { z.setPointerCapture(e.pointerId); } catch { /* yok say */ }
      this.stroke = { id: e.pointerId, startY: e.clientY, lastY: e.clientY, acc: 0 };
      this.ctx.sfx.unlock();
    });
    z.addEventListener('pointermove', (e) => {
      const s = this.stroke;
      if (!s || s.id !== e.pointerId || !this.active) return;
      e.preventDefault();
      const H = z.clientHeight || window.innerHeight;
      const threshold = Math.max(28, H * 0.085 * this.swipeFactor);
      const dy = e.clientY - s.lastY;
      s.lastY = e.clientY;
      if (dy > 0) {
        s.acc += dy;
      } else {
        s.acc = Math.max(0, s.acc + dy);
        if (e.clientY < s.startY) s.startY = e.clientY;
      }
      const prog = clamp((e.clientY - s.startY) / (H * 0.45), 0, 1);
      const top = this.shop.meatTopY;
      const bottom = this.shop.meatBottomY;
      this.knifeTargetY = top - prog * (top - bottom);
      while (s.acc >= threshold) {
        s.acc -= threshold;
        this.cut();
      }
    });
    const end = (e) => {
      if (!this.stroke || this.stroke.id !== e.pointerId) return;
      this.stroke = null;
      this.knifeTargetY = this.shop.meatTopY;
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  enter() {
    this.active = true;
    this.zone.classList.remove('hidden');
    this.knife.visible = true;
    this.knifeY = this.knifeTargetY = this.shop.meatTopY;
  }

  exit() {
    this.active = false;
    this.zone.classList.add('hidden');
    this.knife.visible = false;
    this.stroke = null;
  }

  reset() {
    this.slices = 0;
    this.sliceQ = [];
    this.meatLevel = 1;
    this.cook = 0.9;
    this.totalCut = 0;
    this._clearPile();
    if (this.itemMesh) this.ctx.scene.remove(this.itemMesh);
    this.itemMesh = null;
    this.item = null;
  }

  /** HUD için pişme bilgisi. */
  cookInfo() {
    const v = this.cook;
    if (v < COOK_RAW) return { v, label: 'Çiğ — biraz pişmesini bekle', zone: 'raw' };
    if (v > COOK_BURNT) return { v, label: 'Yanıyor! Hemen kes', zone: 'burnt' };
    return { v, label: 'Kıvamında — kes!', zone: 'good' };
  }

  _meatRadiusAt(y) {
    const s = this.shop;
    const t = clamp((y - s.meatBottomY) / (s.meatTopY - s.meatBottomY), 0, 1);
    return (s.meatBottomR + (s.meatTopR - s.meatBottomR) * t) * this._meatScale();
  }

  _meatScale() {
    return 0.12 + 0.88 * this.meatLevel;
  }

  /** Tek dilim kes. */
  cut() {
    if (!this.active) return;
    if (this.slices >= this.maxSlices) {
      this.ctx.toast('Tepsi dolu! Ekmek Arası ya da Dürüm yap 🥖🌯', 'warn', 'trayfull');
      return;
    }
    const stock = this.ctx.stock;
    if (stock.meat <= 0) {
      this.ctx.toast('🥩 Döner eti bitti! Kasaptan et al.', 'bad', 'nomeat');
      return;
    }
    stock.meat--;
    const q = this.cook < COOK_RAW ? 'raw' : this.cook > COOK_BURNT ? 'burnt' : 'good';
    if (q === 'raw') this.ctx.toast('🩸 Çiğ dilim! Et biraz daha pişmeli.', 'warn', 'rawslice');
    else if (q === 'burnt') this.ctx.toast('🔥 Yanık dilim! Daha sık kesmelisin.', 'warn', 'burntslice');
    this.cook = Math.max(0, this.cook - CUT_EXPOSE);
    this.slices++;
    this.sliceQ.push(q);
    this.totalCut++;

    // Kıvrık "yaprak" dilim: şişin yüzeyinden kesilen ince kavisli tabaka
    const y = clamp(this.knifeY, this.shop.meatBottomY + 0.1, this.shop.meatTopY - 0.06);
    const r = this._meatRadiusAt(y);
    const ang = (Math.random() - 0.5) * 0.7;
    const arc = 0.75 + Math.random() * 0.25;
    const geo = new THREE.CylinderGeometry(r, r * 0.97, 0.1 + Math.random() * 0.04, 10, 1, true, ang - arc / 2, arc);
    const cx = Math.sin(ang) * r;
    const cz = Math.cos(ang) * r;
    geo.translate(-cx, 0, -cz);
    const m = new THREE.Mesh(geo, this.sliceMats[q]);
    m.castShadow = true;
    const sp = this.shop.spitPos;
    const from = new THREE.Vector3(sp.x + cx, y, sp.z + cz);
    m.position.copy(from);
    m.rotation.y = 0;
    this.ctx.scene.add(m);
    const idx = this.slices - 1;
    const col = idx % 4;
    const row = Math.floor(idx / 4) % 3;
    const tp = this.shop.trayPos;
    const to = new THREE.Vector3(tp.x + (col - 1.5) * 0.19 + (Math.random() - 0.5) * 0.04, tp.y + 0.02 + Math.floor(idx / 12) * 0.02 + row * 0.006, tp.z + (row - 1) * 0.14);
    this.flying.push({ mesh: m, from, to, t: 0, dur: 0.5, spin: (Math.random() - 0.5) * 3, landY: Math.random() * Math.PI, startRot: -ang });

    this.ctx.sfx.slice();
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch { /* yok say */ }
    }
  }

  _clearPile() {
    for (const p of this.pile) this.ctx.scene.remove(p);
    for (const f of this.flying) this.ctx.scene.remove(f.mesh);
    this.pile = [];
    this.flying = [];
  }

  /** Kesilen dilimleri ekmek arası ya da dürüm yap. */
  makeItem(type) {
    if (this.item) {
      this.ctx.toast('Elinde hazır bir sipariş var. Önce Servis Et! 🛎️', 'warn', 'hasitem');
      return false;
    }
    if (this.slices === 0) {
      this.ctx.toast('Önce döner kes! Ekranı aşağı kaydır 👇', 'warn', 'noslice');
      return false;
    }
    const stock = this.ctx.stock;
    const need = type === 'ekmek' ? 'ekmek' : 'lavas';
    if (stock[need] <= 0) {
      this.ctx.toast(type === 'ekmek' ? '🥖 Ekmek bitti! Fırından ya da bakkaldan al.' : '🫓 Lavaş bitti! Fırından ya da bakkaldan al.', 'bad', 'no' + need);
      return false;
    }
    stock[need]--;
    const toppings = [];
    for (const t of this.selected) {
      if (stock[t] > 0) {
        stock[t]--;
        toppings.push(t);
      }
    }
    this.selected.clear();
    const n = this.slices;
    const raw = this.sliceQ.filter((q) => q === 'raw').length;
    const burnt = this.sliceQ.filter((q) => q === 'burnt').length;
    this.item = { type, slices: n, toppings, raw, burnt };
    this.slices = 0;
    this.sliceQ = [];
    // Tepsideki dilimler tahtaya uçar, ürün oluşur
    const spot = this.shop.itemSpot;
    for (const p of this.pile) {
      this.flying.push({ mesh: p, from: p.position.clone(), to: spot.clone().add(new THREE.Vector3(0, 0.08, 0)), t: 0, dur: 0.3, spin: 0, landY: 0, consume: true, startRot: 0 });
    }
    this.pile = [];
    this.itemMesh = type === 'ekmek' ? buildBread(n, toppings, this.sliceMats) : buildDurum(n, toppings, this.sliceMats);
    this.itemMesh.position.copy(spot);
    this.itemMesh.scale.setScalar(0.01);
    this.itemGrow = 0;
    this.ctx.scene.add(this.itemMesh);
    this.ctx.sfx.wrap();
    const info = ITEM_INFO[type];
    const qtxt = raw ? `, ${raw} çiğ dilim 🩸` : burnt ? `, ${burnt} yanık dilim 🔥` : '';
    this.ctx.toast(`${info.icon} ${info.label} hazır (${n} dilim${toppings.length ? ' + ' + toppings.map((t) => TOP_ICON[t]).join('') : ''}${qtxt}) → Servis Et!`, raw || burnt ? 'warn' : 'ok');
    return true;
  }

  /** Malzeme seçimini aç/kapat (ürün sarılırken eklenir). */
  toggleTopping(id) {
    const stock = this.ctx.stock;
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      if (!stock[id]) {
        this.ctx.toast(`${TOP_ICON[id]} bitti! Manav ya da bakkaldan al.`, 'warn', 'no' + id);
        return;
      }
      this.selected.add(id);
    }
    this.ctx.sfx.click();
  }

  toggleAyran() {
    if (!this.withAyran && !this.ctx.stock.ayran) {
      this.ctx.toast('🥛 Ayran bitti! Bakkal Nuri\'den al.', 'warn', 'noayran');
      return;
    }
    this.withAyran = !this.withAyran;
    this.ctx.sfx.click();
  }

  takeItem() {
    const it = this.item;
    this.item = null;
    if (this.itemMesh) this.ctx.scene.remove(this.itemMesh);
    this.itemMesh = null;
    return it;
  }

  update(dt, open = true) {
    const s = this.shop;
    this.t += dt;
    const stock = this.ctx.stock;
    const target = Math.min(1, (stock ? stock.meat : 60) / 60);
    this.meatLevel += (target - this.meatLevel) * Math.min(1, dt * 4);
    if (open) {
      s.spit.rotation.y += dt * 0.6;
      if (stock && stock.meat > 0) this.cook = Math.min(1.8, this.cook + dt * COOK_RATE);
    }
    const sc = this._meatScale();
    s.meat.scale.set(sc, 1, sc);
    s.meat.visible = !stock || stock.meat > 0;
    cookColor(this.cook, this._tmpColor);
    s.meatMat.color.copy(this._tmpColor);
    // Ocak alevi titrer
    s.heatMat.emissiveIntensity = open ? 0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 31) * 0.06 : 0.05;

    // Tezgahtaki ekmek sepeti ve lavaş yığını stoğu gösterir
    if (stock) {
      s.breadItems.forEach((m, i) => (m.visible = i < stock.ekmek));
      s.lavasItems.forEach((m, i) => (m.visible = i < stock.lavas));
    }

    // Uçan dilimler
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.dur;
      const p = Math.min(1, f.t);
      const e = smooth(p);
      f.mesh.position.lerpVectors(f.from, f.to, e);
      f.mesh.position.y += 4 * p * (1 - p) * (f.consume ? 0.12 : 0.28);
      if (f.consume) {
        f.mesh.scale.setScalar(1 - p * 0.9);
      } else {
        // kavisli dilim dikeyden yatay konuma devrilir
        f.mesh.rotation.set(-e * Math.PI / 2 + (1 - p) * f.spin * 0.3, f.startRot * (1 - e) + f.landY * e, 0);
      }
      if (p >= 1) {
        this.flying.splice(i, 1);
        if (f.consume) this.ctx.scene.remove(f.mesh);
        else this.pile.push(f.mesh);
      }
    }

    // Ürün "oluşma" animasyonu
    if (this.itemMesh && this.itemGrow < 1) {
      this.itemGrow = Math.min(1, this.itemGrow + dt / 0.35);
      const k = smooth(this.itemGrow);
      this.itemMesh.scale.setScalar(0.01 + 0.99 * k * (1 + Math.sin(k * Math.PI) * 0.12));
    }

    // Bıçak
    if (this.knife.visible) {
      this.knifeY += (this.knifeTargetY - this.knifeY) * Math.min(1, dt * 18);
      const r = this._meatRadiusAt(this.knifeY);
      this.knife.position.set(s.spitPos.x + 0.02, this.knifeY, s.spitPos.z + r + 0.04);
    }
  }
}

/* ---------- Ürün modelleri ---------- */
function meatPieces(g, n, mats, x0, x1, y, z, spread = 0.05) {
  const cnt = Math.min(10, 3 + n);
  for (let i = 0; i < cnt; i++) {
    const geo = new THREE.CylinderGeometry(0.05, 0.048, 0.035, 8, 1, true, 0, 1.6);
    const m = new THREE.Mesh(geo, mats.good);
    m.position.set(x0 + ((x1 - x0) * (i + 0.5)) / cnt, y + Math.random() * 0.015, z + (Math.random() - 0.5) * spread);
    m.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.5);
    m.castShadow = true;
    g.add(m);
  }
}

/** Seçilen malzemeleri ürünün içine yerleştir. */
function toppingMeshes(g, tops, x0, x1, y, z, spread = 0.07) {
  const has = (t) => tops.includes(t);
  const xs = (i, n) => x0 + ((x1 - x0) * (i + 0.5)) / n;
  if (has('marul')) {
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.SphereGeometry(0.034, 8, 6);
      leaf.scale(1.5, 0.3, 1.1);
      addMesh(g, leaf, mat(0x6cbf4a, { roughness: 0.6 }), xs(i, 5), y - 0.006, z - spread * 0.4, false).rotation.z = (i % 2 ? 0.3 : -0.3);
    }
  }
  if (has('domates')) {
    for (let i = 0; i < 4; i++) {
      const tom = addMesh(g, new THREE.CylinderGeometry(0.028, 0.028, 0.008, 12), mat(0xd62828, { roughness: 0.35 }), xs(i, 4), y + 0.008, z + spread * 0.45, false);
      tom.rotation.x = Math.PI / 2 - 0.35;
    }
  }
  if (has('sogan')) {
    for (let i = 0; i < 4; i++) {
      const ring = addMesh(g, new THREE.TorusGeometry(0.022, 0.005, 4, 12), mat(0xe9d7ec), xs(i, 4), y + 0.02, z, false);
      ring.rotation.x = Math.PI / 2 - 0.4;
    }
  }
  if (has('tursu')) {
    for (let i = 0; i < 3; i++) {
      const p = addMesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.008, 10), mat(0x8fa53a, { roughness: 0.5 }), xs(i, 3), y + 0.026, z - spread * 0.2, false);
      p.rotation.x = Math.PI / 2 - 0.5;
    }
  }
  const drizzle = (color, off) => {
    for (let i = 0; i < 6; i++) {
      const d = new THREE.SphereGeometry(0.012, 6, 4);
      d.scale(1.6, 0.5, 1);
      addMesh(g, d, mat(color, { roughness: 0.25 }), xs(i, 6) + off, y + 0.03, z + (i % 2 ? 0.01 : -0.01), false);
    }
  };
  if (has('acisos')) drizzle(0xc1121f, 0.01);
  if (has('mayonez')) drizzle(0xf6f0d8, -0.01);
}

/** Yarım ekmek arası: çıtır kabuk, ağzı açık, et + salata. */
function buildBread(n, tops, mats) {
  const g = new THREE.Group();
  const crust = mat(0xc07b3a, { roughness: 0.7 });
  const crumb = mat(0xf2deb8, { roughness: 0.95 });
  const half = (yScale) => {
    const geo = new THREE.CapsuleGeometry(0.065, 0.24, 6, 14);
    geo.rotateZ(Math.PI / 2);
    geo.scale(1, yScale, 1.05);
    return geo;
  };
  addMesh(g, half(0.5), crust, 0, 0.035, 0);
  const inner = new THREE.BoxGeometry(0.3, 0.01, 0.1);
  addMesh(g, inner, crumb, 0, 0.068, 0, false);
  meatPieces(g, n, mats, -0.15, 0.15, 0.085, 0.0, 0.05);
  toppingMeshes(g, tops, -0.15, 0.15, 0.105, 0.0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.08, -0.06);
  lid.rotation.x = -0.45;
  g.add(lid);
  addMesh(lid, half(0.45), crust, 0, 0.035, 0.055);
  addMesh(lid, inner, crumb, 0, 0.012, 0.055, false);
  // Kabuk üstü çizikler
  for (let i = 0; i < 3; i++) addBox(lid, 0.02, 0.006, 0.08, mat(0xe0a86a), -0.08 + i * 0.08, 0.063, 0.055, false).rotation.y = 0.5;
  g.rotation.y = 0.3;
  return g;
}

/** Dürüm: lavaşa sarılmış rulo, yarısı baskılı dürüm kağıdında, ucundan et ve salata görünür. */
function buildDurum(n, tops, mats) {
  const g = new THREE.Group();
  const r = 0.05 + Math.min(n, 10) * 0.0025;
  const roll = new THREE.CylinderGeometry(r, r * 0.92, 0.3, 18);
  roll.rotateZ(Math.PI / 2);
  addMesh(g, roll, mat(0xe8cf9a, { roughness: 0.9 }), 0, r, 0);
  // kızarık lavaş benekleri
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.SphereGeometry(0.012, 6, 4);
    sp.scale(1.5, 0.3, 1.2);
    const a = Math.random() * Math.PI;
    addMesh(g, sp, mat(0xb98a4a), -0.1 + i * 0.04, r + Math.sin(a) * r * 0.98, Math.cos(a) * r * 0.98, false);
  }
  const paperMat = new THREE.MeshStandardMaterial({ map: durumPaper(), roughness: 0.85, side: THREE.DoubleSide });
  const paper = new THREE.CylinderGeometry(r + 0.004, r * 0.93 + 0.004, 0.15, 18, 1, true);
  paper.rotateZ(Math.PI / 2);
  const pm = addMesh(g, paper, paperMat, -0.08, r, 0, false);
  pm.rotation.x = 0.4;
  // açık uç: lavaş halkası + et + yeşillik
  const endRing = new THREE.TorusGeometry(r * 0.85, r * 0.15, 6, 16);
  endRing.rotateY(Math.PI / 2);
  addMesh(g, endRing, mat(0xe8cf9a), 0.15, r, 0, false);
  const filling = new THREE.CircleGeometry(r * 0.8, 14);
  filling.rotateY(Math.PI / 2);
  addMesh(g, filling, mats.good, 0.151, r, 0, false);
  // uçtan taşan malzemeler
  const tc = { domates: 0xd62828, sogan: 0xe9d7ec, marul: 0x6cbf4a, tursu: 0x8fa53a, acisos: 0xc1121f, mayonez: 0xf6f0d8 };
  tops.forEach((t, i) => {
    const a = (i / Math.max(1, tops.length)) * Math.PI * 2;
    addMesh(g, new THREE.SphereGeometry(0.016, 6, 4), mat(tc[t], { roughness: 0.4 }), 0.155, r + Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5, false);
  });
  g.rotation.y = -0.4;
  return g;
}
