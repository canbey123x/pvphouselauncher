// =========================================================
// cutting.js — Döner kesme: parmakla aşağı kaydırma (swipe), dilim efektleri,
// ekmek arası / dürüm hazırlama
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, mat } from './city.js';

export const MAX_SLICES = 8;
export const ITEM_INFO = {
  ekmek: { label: 'Ekmek Arası', icon: '🥖' },
  durum: { label: 'Dürüm', icon: '🌯' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CuttingStation {
  constructor(ctx, shop) {
    this.ctx = ctx;
    this.shop = shop;
    this.zone = document.getElementById('cutZone');
    this.active = false;
    this.slices = 0;
    this.item = null;       // { type, slices }
    this.meatLevel = 1;     // 0..1 döner miktarı
    this.flying = [];
    this.pile = [];
    this.itemMesh = null;
    this.stroke = null;
    this.totalCut = 0;

    this.sliceGeo = new THREE.BoxGeometry(0.24, 0.035, 0.15);
    this.sliceMats = [mat(0x8a4b22), mat(0xa0582a), mat(0x7a3f1c)];

    this.knife = this._buildKnife();
    this.knife.visible = false;
    ctx.scene.add(this.knife);
    this.knifeY = shop.meatTopY;
    this.knifeTargetY = shop.meatTopY;

    this._bind();
  }

  _buildKnife() {
    const g = new THREE.Group();
    addBox(g, 0.95, 0.13, 0.015, mat(0xe3e9ef, { emissive: 0x222222 }), 0, 0, 0, false);
    addBox(g, 0.95, 0.025, 0.02, 0xaab4bd, 0, -0.065, 0, false);
    addBox(g, 0.32, 0.09, 0.06, 0x222222, 0.63, 0, 0, false);
    addBox(g, 0.04, 0.12, 0.08, 0xb8860b, 0.47, 0, 0, false);
    g.rotation.z = -0.08;
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
      const threshold = Math.max(42, H * 0.085);
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
    this.meatLevel = 1;
    this.totalCut = 0;
    this._clearPile();
    if (this.itemMesh) this.ctx.scene.remove(this.itemMesh);
    this.itemMesh = null;
    this.item = null;
  }

  _meatRadiusAt(y) {
    const s = this.shop;
    const t = clamp((y - s.meatBottomY) / (s.meatTopY - s.meatBottomY), 0, 1);
    return (s.meatBottomR + (s.meatTopR - s.meatBottomR) * t) * this._meatScale();
  }

  _meatScale() {
    return 0.45 + 0.55 * this.meatLevel;
  }

  /** Tek dilim kes. */
  cut() {
    if (!this.active) return;
    if (this.slices >= MAX_SLICES) {
      this.ctx.toast('Tepsi dolu! Ekmek Arası ya da Dürüm yap 🥖🌯', 'warn', 'trayfull');
      return;
    }
    if (this.meatLevel < 0.08) {
      this.ctx.toast('Döner bitti! Biraz pişmesini bekle... 🔥', 'warn', 'nomeat');
      return;
    }
    this.slices++;
    this.totalCut++;
    this.meatLevel = Math.max(0, this.meatLevel - 0.04);

    const y = clamp(this.knifeY, this.shop.meatBottomY + 0.1, this.shop.meatTopY - 0.05);
    const r = this._meatRadiusAt(y);
    const sp = this.shop.spitPos;
    const ang = (Math.random() - 0.5) * 0.9;
    const from = new THREE.Vector3(sp.x + Math.sin(ang) * r, y, sp.z + Math.cos(ang) * r);
    const idx = this.slices - 1;
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const tp = this.shop.trayPos;
    const to = new THREE.Vector3(tp.x + (col - 1.5) * 0.2, tp.y + 0.02 + row * 0.035, tp.z + (row - 0.5) * 0.17 + (Math.random() - 0.5) * 0.03);

    const m = new THREE.Mesh(this.sliceGeo, this.sliceMats[Math.floor(Math.random() * this.sliceMats.length)]);
    m.position.copy(from);
    m.castShadow = true;
    this.ctx.scene.add(m);
    this.flying.push({ mesh: m, from, to, t: 0, dur: 0.42, spin: (Math.random() - 0.5) * 8, rotY: Math.random() * Math.PI });

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
    const n = this.slices;
    this.item = { type, slices: n };
    this.slices = 0;
    this._clearPile();
    this.itemMesh = type === 'ekmek' ? buildBread(n) : buildDurum(n);
    this.itemMesh.position.copy(this.shop.itemSpot);
    this.ctx.scene.add(this.itemMesh);
    this.ctx.sfx.wrap();
    const info = ITEM_INFO[type];
    this.ctx.toast(`${info.icon} ${info.label} hazır (${n} dilim) → Servis Et!`, 'ok');
    return true;
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
    if (open) {
      s.spit.rotation.y += dt * 0.9;
      this.meatLevel = Math.min(1, this.meatLevel + dt * 0.012);
    }
    const sc = this._meatScale();
    s.meat.scale.set(sc, 1, sc);

    // Uçan dilimler
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.dur;
      const p = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, p);
      f.mesh.position.y += 4 * p * (1 - p) * 0.35;
      f.mesh.rotation.set((1 - p) * f.spin, f.rotY, (1 - p) * f.spin * 0.5);
      if (p >= 1) {
        f.mesh.rotation.set(0, f.rotY * 0.3, 0);
        this.pile.push(f.mesh);
        this.flying.splice(i, 1);
      }
    }

    // Bıçak
    if (this.knife.visible) {
      this.knifeY += (this.knifeTargetY - this.knifeY) * Math.min(1, dt * 18);
      const r = this._meatRadiusAt(this.knifeY);
      this.knife.position.set(s.spitPos.x + 0.12, this.knifeY, s.spitPos.z + r + 0.05);
    }
  }
}

/* ---------- Ürün modelleri ---------- */
function buildBread(n) {
  const g = new THREE.Group();
  addBox(g, 0.52, 0.1, 0.24, 0xd9a35b, 0, 0.05, 0);
  addBox(g, 0.5, 0.03, 0.24, 0x5fae47, 0, 0.115, 0, false);
  const meatH = 0.03 + Math.min(n, 8) * 0.012;
  addBox(g, 0.47, meatH, 0.21, 0x8a4b22, 0, 0.13 + meatH / 2, 0);
  for (let i = 0; i < 3; i++) addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), 0xe63946, -0.15 + i * 0.15, 0.14 + meatH, 0.06, false);
  const top = addBox(g, 0.52, 0.12, 0.24, 0xe0ab62, 0, 0.2 + meatH, -0.02);
  top.rotation.x = -0.25;
  addBox(g, 0.5, 0.02, 0.2, 0xf2d39b, 0, 0.27 + meatH, -0.04, false).rotation.x = -0.25;
  return g;
}

function buildDurum(n) {
  const g = new THREE.Group();
  const r = 0.08 + Math.min(n, 8) * 0.004;
  const wrap = addMesh(g, new THREE.CylinderGeometry(r, r, 0.46, 10), 0xe8d3a5, 0, r, 0);
  wrap.rotation.z = Math.PI / 2;
  const paper = addMesh(g, new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.2, 10), 0xffffff, -0.14, r, 0, false);
  paper.rotation.z = Math.PI / 2;
  const end = addMesh(g, new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.02, 10), 0x8a4b22, 0.231, r, 0, false);
  end.rotation.z = Math.PI / 2;
  addMesh(g, new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.025, 6), 0x5fae47, 0.235, r + r * 0.4, 0, false).rotation.z = Math.PI / 2;
  return g;
}
