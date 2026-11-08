// =========================================================
// kiraathane.js — Eşek Kıraathanesi: caddeye açık kahvehane binası ve bütün oynanış.
// Bina şehrin ana caddesinde (eski dönerci yerinde). Önü tenteli ve kepenkli, iki masa
// tente altında, dört masa içeride. Ocak (semaver, demlik, cezve), lavabo, kasa,
// oyun rafı (okey/tavla/iskambil), TV, WC kapısı.
// Müşteri grupları kaldırımdan gelir, oturur, el kaldırıp sipariş verir, tepsiyle
// servis edilir, oynar, kasada öder. Kirli bardaklar toplanıp yıkanır.
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, mat, canvasTexture, bakeHierarchy } from './city.js';
import { createPerson, animatePerson } from './npcs.js';

// Binanın merkezi (dünya koordinatı). Ön cephe z = O.z + D/2 = -8.8 (kaldırım kenarı).
export const KIRA_ORIGIN = new THREE.Vector3(4.2, 0, -14.6);
const W = 14.8;
const D = 11.6;
const H = 3.6;
const LANE_Z = -6.2;

export const DRINKS = {
  cay: { icon: '🍵', name: 'Çay', price: 10 },
  kahve: { icon: '☕', name: 'Türk Kahvesi', price: 35 },
  oralet: { icon: '🍊', name: 'Oralet', price: 12 },
  soda: { icon: '🫧', name: 'Soda', price: 15 },
  su: { icon: '💧', name: 'Su', price: 8 },
  simit: { icon: '🥯', name: 'Simit', price: 15 },
};
export const GAMES = {
  okey: { icon: '🀄', name: 'Okey takımı', rent: 20 },
  tavla: { icon: '🎲', name: 'Tavla', rent: 10 },
  kart: { icon: '🃏', name: 'İskambil', rent: 10 },
};
const GLASS_TYPES = { cay: 1, kahve: 1, oralet: 1 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const LOOKS = {
  shirts: [0x1d2b24, 0x2b3a67, 0x5a5148, 0x7a1f2b, 0x2f4f3f, 0x8d99ae, 0xb08850, 0x444444, 0xdcd6c8, 0x264653, 0x3d5a80],
  pants: [0x2f3440, 0x3b3b3b, 0x5c4033, 0x1d3557, 0x4a4a4a, 0x3d5a80],
  skins: [0xf0c08f, 0xe3b07f, 0xd9a066, 0xc68642, 0xe9b47f],
  hairs: [0x2b1d14, 0x1a1a1a, 0x5a3825, 0x8d6e63],
};
const LINES = {
  order: ['Usta, bize çay!', 'Ocakçı, iki çay!', 'Evladım bir çay alayım.', 'Ustaaa! Taze çay var mı?', 'Bir orta şekerli kahve!'],
  happy: ['Oh be, tavşan kanı!', 'Eline sağlık usta!', 'Çay dediğin böyle olur.', 'Kahvenin köpüğü yerinde!'],
  light: ['Bu çay mı su mu usta?', 'Açık olmuş biraz...', 'Kahve pişmemiş usta!'],
  bitter: ['Acı olmuş bu çay!', 'Demlik yanmış galiba usta.'],
  angry: ['Bu ne bekletme yahu!', 'Karşı kahveye gidiyoruz!', 'Çay gelene kadar emekli olduk!'],
  pay: ['Hesap usta!', 'Ne kadar tuttu?', 'Usta hesabı alalım.'],
};

/** Çiçekli masa örtüsü dokusu (özgün desen). */
function clothTexture() {
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#efe6d8';
    c.fillRect(0, 0, w, h);
    const flower = (x, y, r, col, petal) => {
      c.fillStyle = col;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.55, r * 0.28, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = petal;
      c.beginPath();
      c.arc(x, y, r * 0.45, 0, Math.PI * 2);
      c.fill();
    };
    const cols = ['#7a2e3a', '#5d3a6b', '#b5651d', '#4f7a5a', '#9c4a5a'];
    for (let i = 0; i < 14; i++) flower(18 + ((i * 71) % 230), 18 + ((i * 113) % 230), 9 + (i % 3) * 4, cols[i % cols.length], '#f4d58d');
    c.strokeStyle = 'rgba(90,40,60,.45)';
    c.lineWidth = 3;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.setLineDash([6, 6]);
    c.strokeRect(16, 16, w - 32, h - 32);
  });
}

function plankTexture(base, rep) {
  const t = canvasTexture(256, 256, (c, w) => {
    for (let x = 0; x < w; x += 32) {
      const v = Math.floor(Math.random() * 20);
      c.fillStyle = `rgb(${parseInt(base.slice(1, 3), 16) - v},${parseInt(base.slice(3, 5), 16) - v},${parseInt(base.slice(5, 7), 16) - v})`;
      c.fillRect(x, 0, 31, 256);
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.fillRect(x + 31, 0, 1, 256);
      for (let k = 0; k < 4; k++) {
        c.fillStyle = 'rgba(80,50,20,.12)';
        c.fillRect(x + 4 + Math.random() * 20, Math.random() * 256, 2, 30 + Math.random() * 60);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  return t;
}

function stoneTexture(rep) {
  const t = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#4a4a4a';
    c.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row++) {
      for (let col = -1; col < 9; col++) {
        const x = col * 32 + (row % 2) * 16;
        const v = 95 + Math.floor(Math.random() * 40);
        c.fillStyle = `rgb(${v},${v},${v + 4})`;
        c.fillRect(x + 1, row * 16 + 1, 30, 14);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  return t;
}

export class Kiraathane {
  constructor(ctx, colliders) {
    this.ctx = ctx;
    const O = KIRA_ORIGIN;
    const scene = ctx.scene;
    const g = new THREE.Group();
    g.position.copy(O);
    scene.add(g);
    this.group = g;
    this.cityColliders = colliders;
    const col = (x0, x1, z0, z1, h = H) => {
      const c = { minX: O.x + x0, maxX: O.x + x1, minZ: O.z + z0, maxZ: O.z + z1, h };
      colliders.push(c);
      return c;
    };
    const hw = W / 2;
    const hd = D / 2;
    // Yerel ↔ dünya
    this.L = (x, z) => new THREE.Vector3(O.x + x, 0, O.z + z);

    /* ---------- Kabuk: zemin, duvarlar, tavan, cephe ---------- */
    const shell = new THREE.Group();
    g.add(shell);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D), new THREE.MeshStandardMaterial({ map: plankTexture('#6b4428', [W / 3, D / 3]), roughness: 0.7 }));
    floor.position.set(0, 0.06, 0);
    floor.receiveShadow = true;
    shell.add(floor);
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture([4, 1.4]), roughness: 0.92 });
    const plank = new THREE.MeshStandardMaterial({ map: plankTexture('#c9a46a', [3, 1]), roughness: 0.8 });
    addBox(shell, W + 0.6, H + 0.9, 0.3, stone, 0, (H + 0.9) / 2, -hd - 0.15);
    addBox(shell, 0.3, H + 0.9, D, plank, -hw - 0.15, (H + 0.9) / 2, 0);
    addBox(shell, 0.3, H + 0.9, D, plank, hw + 0.15, (H + 0.9) / 2, 0);
    // dış yüzler (sokaktan görünen) taş
    addBox(shell, 0.1, H + 0.9, D, stone, -hw - 0.33, (H + 0.9) / 2, 0);
    addBox(shell, 0.1, H + 0.9, D, stone, hw + 0.33, (H + 0.9) / 2, 0);
    // Tavan (koyu) + çatı
    addBox(shell, W, 0.12, D, 0x1a1a1c, 0, H, 0, false);
    addBox(shell, W + 0.7, 0.3, D + 0.4, 0x3a3a3c, 0, H + 0.9, 0);
    // Ön cephe üstü (açıklığın üstü) + tabela
    addBox(shell, W + 0.6, 0.9, 0.3, 0x2b2b2e, 0, H + 0.45, hd + 0.05);
    // Ön sütunlar
    for (const px of [-hw, -5.6, 5.6, hw]) addBox(shell, 0.45, H, 0.45, 0x5a5a5e, px, H / 2, hd - 0.1);
    for (const px of [-5.6, 5.6]) col(px - 0.25, px + 0.25, hd - 0.35, hd + 0.15);
    col(-hw - 0.45, -hw, -hd, hd);
    col(hw, hw + 0.45, -hd, hd);
    col(-hw, hw, -hd - 0.3, -hd);

    // Tabela
    const signTex = canvasTexture(1024, 140, (c, w, h) => {
      c.fillStyle = '#16301f';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e9c46a';
      c.lineWidth = 8;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#f4e3b1';
      c.font = '76px "Bungee", Impact, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('EŞEK KIRAATHANESİ', w / 2, h / 2 - 4);
      c.font = 'bold 22px "Nunito", sans-serif';
      c.fillStyle = '#e9c46a';
      c.fillText('☕ ÇAY · KAHVE · OKEY · TAVLA ☕', w / 2, h - 22);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.5), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
    sign.position.set(0, H + 0.45, hd + 0.22);
    g.add(sign);

    // Tente (koyu gri, saçaklı) — caddeye doğru eğimli
    const awning = new THREE.Group();
    awning.position.set(0, H - 0.15, hd + 0.2);
    awning.rotation.x = 0.32;
    g.add(awning);
    addBox(awning, W + 0.4, 0.06, 2.0, 0x2e3033, 0, 0, 1.0);
    // ön saçak (koyu bant + açık şerit)
    addBox(awning, W + 0.4, 0.32, 0.04, 0x2e3033, 0, -0.15, 2.0);
    addBox(awning, W + 0.4, 0.04, 0.045, 0xb08850, 0, -0.26, 2.0, false);

    /* ---------- İç süsler ---------- */
    // Kemerli WC kapısı (sağ duvar) + tabelası
    const wc = new THREE.Group();
    wc.position.set(hw - 0.02, 0, -3.6);
    wc.rotation.y = -Math.PI / 2;
    g.add(wc);
    addBox(wc, 1.1, 2.0, 0.04, 0x3d3d40, 0, 1.0, 0, false);
    addMesh(wc, new THREE.CylinderGeometry(0.55, 0.55, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), 0x3d3d40, 0, 2.0, 0, false).rotation.x = Math.PI / 2;
    const wcTex = canvasTexture(128, 64, (c) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#1d3557'; c.font = 'bold 36px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('WC', 64, 34);
    });
    const wcs = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: wcTex }));
    wcs.position.set(0, 2.85, 0.03);
    wc.add(wcs);
    // Tablolar (sağ duvar) — soyut eski kasaba resimleri
    for (const [i, z] of [[0, -0.6], [1, 1.6], [2, 3.8]]) {
      const art = canvasTexture(128, 128, (c) => {
        c.fillStyle = '#6b3f1d'; c.fillRect(0, 0, 128, 128);
        c.fillStyle = ['#a0642f', '#8b5a2b', '#b07a45'][i]; c.fillRect(10, 10, 108, 108);
        for (let k = 0; k < 60; k++) { c.fillStyle = `rgba(${40 + Math.random() * 60},${20 + Math.random() * 30},10,.5)`; c.fillRect(10 + Math.random() * 100, 10 + Math.random() * 100, 4 + Math.random() * 10, 3 + Math.random() * 8); }
      });
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 }));
      fr.position.set(hw - 0.03, 2.1, z);
      fr.rotation.y = -Math.PI / 2;
      g.add(fr);
    }
    // Klima (arka duvar)
    addBox(g, 1.3, 0.35, 0.22, 0xf0f0f0, -1.8, 3.05, -hd + 0.12, false);
    addBox(g, 1.0, 0.08, 0.02, 0x9b1d20, -1.8, 3.05, -hd + 0.24, false);
    // Floresan lambalar
    const tube = mat(0xffffff, { emissive: 0xf4f4ff, emissiveIntensity: 1 });
    this.tubeMat = tube;
    for (const z of [-3.5, 0, 3.5]) for (const x of [-4.2, 0, 4.2]) {
      addBox(g, 1.3, 0.06, 0.22, 0x9a9aa0, x, H - 0.05, z, false);
      addBox(g, 1.15, 0.03, 0.08, tube, x, H - 0.09, z, false);
    }
    this.lights = [];
    for (const z of [-3, 2.5]) {
      const l = new THREE.PointLight(0xf2f0ff, 0, 14, 1.4);
      l.position.set(O.x, H - 0.4, O.z + z);
      scene.add(l);
      this.lights.push(l);
    }

    /* ---------- Ocak (arka sol): tezgah, semaver, demlik, cezve, bardaklar ---------- */
    const steel = new THREE.MeshStandardMaterial({ color: 0xd5dbe0, metalness: 0.85, roughness: 0.25 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xc87533, metalness: 0.9, roughness: 0.3 });
    addBox(g, 4.8, 1.0, 0.9, 0x3b2a1e, -5.0, 0.5, -hd + 0.45);
    addBox(g, 4.9, 0.06, 1.0, 0x8c8f93, -5.0, 1.03, -hd + 0.45);
    col(-hw, -2.55, -hd, -hd + 0.95, 1.1);
    const sx = -6.3, sz = -hd + 0.45;
    addMesh(g, new THREE.CylinderGeometry(0.32, 0.38, 0.9, 20), copper, sx, 1.5, sz);
    addMesh(g, new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), copper, sx, 1.95, sz);
    addMesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), steel, sx + 0.32, 1.25, sz, false).rotation.z = Math.PI / 2;
    // Çift katlı çaydanlık (siyah emaye, referanstaki gibi ocak üstünde)
    this.demlik = new THREE.Group();
    this.demlik.position.set(sx, 2.25, sz);
    g.add(this.demlik);
    const enamel = new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.25, metalness: 0.2 });
    addMesh(this.demlik, new THREE.SphereGeometry(0.17, 16, 12), enamel, 0, 0.1, 0);
    addMesh(this.demlik, new THREE.CylinderGeometry(0.03, 0.02, 0.18, 8), enamel, 0.17, 0.12, 0).rotation.z = -0.9;
    addMesh(this.demlik, new THREE.TorusGeometry(0.1, 0.015, 6, 12, Math.PI), enamel, 0, 0.28, 0).rotation.y = Math.PI / 2;
    this.steam = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
      s.position.set(O.x + sx, 2.45, O.z + sz);
      scene.add(s);
      this.steam.push({ m: s, t: i / 6 });
    }
    addBox(g, 0.6, 0.12, 0.5, 0x222222, -4.6, 1.12, sz);
    this.flame = addMesh(g, new THREE.ConeGeometry(0.1, 0.12, 10), mat(0x3a86ff, { emissive: 0x1d4ed8 }), -4.6, 1.22, sz, false);
    this.cezve = new THREE.Group();
    this.cezve.position.set(-4.6, 1.2, sz);
    g.add(this.cezve);
    addMesh(this.cezve, new THREE.CylinderGeometry(0.09, 0.12, 0.18, 14), copper, 0, 0.09, 0);
    addMesh(this.cezve, new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), 0x3b2314, 0.22, 0.12, 0).rotation.z = Math.PI / 2 - 0.2;
    this.foam = addMesh(this.cezve, new THREE.CylinderGeometry(0.085, 0.085, 0.02, 14), 0xc8a27a, 0, 0.17, 0, false);
    // Temiz bardaklar (ince belli)
    this.glassGeo = new THREE.CylinderGeometry(0.045, 0.034, 0.11, 12);
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, roughness: 0.05 });
    this.glassMeshes = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.glassGeo, this.glassMat);
      m.position.set(-3.85 + (i % 6) * 0.11, 1.12, sz - 0.25 + Math.floor(i / 6) * 0.11);
      g.add(m);
      this.glassMeshes.push(m);
    }
    // Lavabo (sol duvar)
    addBox(g, 0.9, 1.0, 1.1, 0xd9d4cc, -hw + 0.45, 0.5, -2.1);
    addBox(g, 0.7, 0.1, 0.8, steel, -hw + 0.45, 1.0, -2.1, false);
    addMesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), steel, -hw + 0.1, 1.2, -2.1, false);
    col(-hw, -hw + 0.95, -2.7, -1.5, 1.1);

    /* ---------- Oyun rafı (arka sağ) ---------- */
    addBox(g, 2.6, 2.0, 0.5, 0x2a1d14, 4.7, 1.0, -hd + 0.25);
    for (const y of [0.6, 1.2, 1.8]) addBox(g, 2.5, 0.05, 0.48, 0x5a3a1a, 4.7, y, -hd + 0.27, false);
    col(3.35, 6.05, -hd, -hd + 0.55, 2);
    this.rackItems = { okey: [], tavla: [], kart: [] };
    for (let i = 0; i < 3; i++) {
      this.rackItems.okey.push(addBox(g, 0.5, 0.12, 0.3, 0xd9c7a0, 3.9 + i * 0.6, 0.67, -hd + 0.3));
      this.rackItems.tavla.push(addBox(g, 0.5, 0.1, 0.35, 0xa0642f, 3.9 + i * 0.6, 1.26, -hd + 0.3));
      this.rackItems.kart.push(addBox(g, 0.12, 0.04, 0.18, 0xc1121f, 4.0 + i * 0.4, 1.83, -hd + 0.3));
    }

    /* ---------- TV (arka duvar ortası) ---------- */
    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 256;
    this.tvCanvas.height = 144;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tv = new THREE.Group();
    this.tv.position.set(1.4, 2.35, -hd + 0.1);
    g.add(this.tv);
    addBox(this.tv, 2.1, 1.25, 0.1, 0x111111, 0, 0, 0);
    this.tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.1), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    this.tvScreen.position.z = 0.055;
    this.tv.add(this.tvScreen);
    this.tvOn = true;
    this.score = [0, 0];

    /* ---------- Kasa (sağ ön): tezgah, ekran, klavye ---------- */
    addBox(g, 1.8, 1.05, 0.8, 0x2a1d14, hw - 0.9, 0.52, 2.2);
    addBox(g, 1.9, 0.05, 0.9, 0xdedad0, hw - 0.9, 1.07, 2.2, false);
    addBox(g, 0.5, 0.34, 0.05, 0x111111, hw - 0.35, 1.32, 2.2);
    addBox(g, 0.44, 0.28, 0.02, mat(0x2b6cb0, { emissive: 0x0d3a6b }), hw - 0.35, 1.32, 2.17, false);
    addBox(g, 0.4, 0.03, 0.16, 0xe8e8e0, hw - 0.9, 1.1, 2.0, false);
    // para çekmecesi + fiş
    addBox(g, 0.45, 0.12, 0.35, 0x333333, hw - 1.45, 1.14, 2.1, false);
    col(hw - 1.8, hw, 1.8, 2.6, 1.2);

    bakeHierarchy(shell);

    /* ---------- Kepenk ---------- */
    const shutterTex = canvasTexture(64, 256, (c, w, h) => {
      c.fillStyle = '#8a9096';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, y, w, 2);
        c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(0, y + 2, w, 1);
      }
    });
    shutterTex.wrapS = shutterTex.wrapT = THREE.RepeatWrapping;
    shutterTex.repeat.set(6, 1);
    this.shutter = new THREE.Group();
    this.shutter.position.set(0, H - 0.1, hd + 0.12);
    g.add(this.shutter);
    const sGeo = new THREE.BoxGeometry(W, H - 0.1, 0.06);
    sGeo.translate(0, -(H - 0.1) / 2, 0);
    const sm = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ map: shutterTex, roughness: 0.6, metalness: 0.3 }));
    sm.castShadow = true;
    this.shutter.add(sm);
    this.shutterCol = col(-hw, hw, hd, hd + 0.35);
    this.openAmt = 0;
    this.openTarget = 0;

    /* ---------- Masalar ---------- */
    this.clothMat = new THREE.MeshStandardMaterial({ map: clothTexture(), roughness: 0.85 });
    this.tableSpots = [[-3.6, 4.6], [3.0, 4.6], [-3.6, 1.0], [3.0, 1.0], [-3.6, -2.4], [3.0, -2.4]];
    this.tables = [];
    this.tableCount = 0;
    this.setTableCount(4);

    /* ---------- Noktalar ---------- */
    this.entry = this.L(0, hd + 0.4);
    this.ocakPoint = this.L(-5.0, -hd + 1.7);
    this.sinkPoint = this.L(-hw + 1.4, -2.1);
    this.rackPoint = this.L(4.7, -hd + 1.4);
    this.tvPoint = this.L(1.4, -hd + 1.4);
    this.kasaPoint = this.L(hw - 0.9, 1.15);        // oyuncu kasada burada durur
    this.payStand = (i) => this.L(hw - 0.9 - i * 0.05, 3.3 + i * 0.85);
    this.bounds = { minX: O.x - hw, maxX: O.x + hw, minZ: O.z - hd, maxZ: O.z + hd + 0.2 };

    // Dışarıdan dönerci API'si gibi kullanılan nokta ve fonksiyonlar
    const self = this;
    this.shopApi = {
      interactPoint: this.L(0, hd + 1.6),
      exitPoint: this.L(0, hd + 1.2),
      light: { intensity: 0 },
      setOpen(open, instant = false) {
        self.openTarget = open ? 1 : 0;
        if (instant) self.openAmt = self.openTarget;
        self.shutterCol.off = open;
        self._applyShutter();
      },
    };

    /* ---------- Oyun durumu ---------- */
    this.groups = [];
    this.payQueue = [];
    this.t = 0;
    this.spawnT = 2;
    this.served = 0;
    this.perfect = 0;
    this.lost = 0;
    this.totalTea = 0;
    this.demlikSize = 12;
    this.slowBrew = false;
    this.tea = { left: 0, brew: 0 };
    this.coffee = { on: false, t: 0 };
    this.glassTotal = 12;
    this.glassClean = 12;
    this.trayMax = 6;
    this.tray = [];
    this.dirty = 0;
    this.gear = null;
    this.sets = { okey: 1, tavla: 1, kart: 1 };
    this.setsOut = { okey: 0, tavla: 0, kart: 0 };
    this.patienceMul = 1;
    this._buildTrayView();
    this._refreshRack();
  }

  _applyShutter() {
    this.shutter.scale.y = Math.max(0.03, 1 - this.openAmt);
    this.shutter.visible = this.openAmt < 0.99;
  }

  /** Oyuncu kıraathanenin içinde mi (birinci şahıs kamera için)? */
  isInside(p) {
    const b = this.bounds;
    return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
  }

  /* ---------- Elde tutulan tepsi (birinci şahıs görünüm) ---------- */
  _buildTrayView() {
    const v = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 });
    addMesh(v, new THREE.CylinderGeometry(0.2, 0.2, 0.012, 28), metal, 0, 0, 0, false);
    addMesh(v, new THREE.TorusGeometry(0.2, 0.006, 6, 28), metal, 0, 0.006, 0, false).rotation.x = Math.PI / 2;
    // askılı tepsi kolu
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 6, 20, Math.PI), metal);
    arc.position.y = 0.0;
    v.add(arc);
    this.trayItems = new THREE.Group();
    v.add(this.trayItems);
    this.trayView = v;
    v.visible = false;
  }

  refreshTrayView() {
    const g = this.trayItems;
    while (g.children.length) g.remove(g.children[0]);
    const spots = [[-0.1, -0.06], [0.0, -0.1], [0.1, -0.06], [-0.1, 0.06], [0.0, 0.1], [0.1, 0.06], [-0.05, 0], [0.05, 0], [0, 0.0], [0.13, 0]];
    this.tray.forEach((it, i) => {
      const [x, z] = spots[i % spots.length];
      const it3 = new THREE.Group();
      it3.position.set(x, 0.006, z);
      g.add(it3);
      if (it.type === 'cay' || it.type === 'oralet') {
        addMesh(it3, new THREE.CylinderGeometry(0.035, 0.035, 0.004, 14), mat(0xffffff, { roughness: 0.3 }), 0, 0.002, 0, false);
        const col = it.type === 'oralet' ? 0xff8c1a : it.q === 'light' ? 0xc8803a : it.q === 'bitter' ? 0x3a0e06 : 0x8f1d10;
        addMesh(it3, new THREE.CylinderGeometry(0.022, 0.016, 0.07, 12), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.85, roughness: 0.05 }), 0, 0.04, 0, false);
      } else if (it.type === 'kahve') {
        addMesh(it3, new THREE.CylinderGeometry(0.04, 0.04, 0.004, 14), mat(0xffffff, { roughness: 0.3 }), 0, 0.002, 0, false);
        addMesh(it3, new THREE.CylinderGeometry(0.024, 0.02, 0.04, 12), mat(0xffffff, { roughness: 0.2 }), 0, 0.024, 0, false);
        addMesh(it3, new THREE.CylinderGeometry(0.021, 0.021, 0.003, 12), mat(it.q === 'good' ? 0xc8a27a : 0x2a1608), 0, 0.044, 0, false);
      } else if (it.type === 'soda') {
        addMesh(it3, new THREE.CylinderGeometry(0.017, 0.02, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x2a9d4a, transparent: true, opacity: 0.8, roughness: 0.05 }), 0, 0.05, 0, false);
      } else if (it.type === 'su') {
        addMesh(it3, new THREE.CylinderGeometry(0.02, 0.022, 0.11, 10), new THREE.MeshStandardMaterial({ color: 0x4fb3d9, transparent: true, opacity: 0.7, roughness: 0.05 }), 0, 0.055, 0, false);
      } else if (it.type === 'simit') {
        addMesh(it3, new THREE.TorusGeometry(0.035, 0.013, 8, 14), mat(0xa0662f), 0, 0.012, 0, false).rotation.x = Math.PI / 2;
      }
    });
    if (this.gear) {
      const gr = new THREE.Group();
      gr.position.set(0, 0.03, 0);
      g.add(gr);
      addBox(gr, 0.14, 0.03, 0.09, this.gear === 'okey' ? 0xd9c7a0 : this.gear === 'tavla' ? 0xa0642f : 0xc1121f, 0.0, 0.0, 0.12, false);
    }
  }

  /* ---------- Masalar ---------- */
  setTableCount(n) {
    n = clamp(n, 1, this.tableSpots.length);
    while (this.tables.length < n) this.tables.push(this._buildTable(this.tableSpots[this.tables.length], this.tables.length));
    this.tables.forEach((t, i) => {
      t.root.visible = i < n;
      t.col.off = i >= n;
      if (i >= n && t.party) this._leave(t);
    });
    this.tableCount = n;
  }

  _buildTable([lx, lz], idx) {
    const O = KIRA_ORIGIN;
    const g = new THREE.Group();
    g.position.set(lx, 0, lz);
    this.group.add(g);
    const frame = new THREE.Group();
    g.add(frame);
    // Masa: ahşap ayaklar, çiçekli örtü (kenarları sarkık)
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) addBox(frame, 0.07, 0.76, 0.07, 0xb5651d, x, 0.38, z);
    addBox(frame, 1.15, 0.04, 1.15, 0x8b5a2b, 0, 0.77, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.02, 1.32), this.clothMat);
    top.position.y = 0.8;
    top.receiveShadow = true;
    g.add(top);
    for (const [x, z, w, d] of [[0, 0.66, 1.32, 0.01], [0, -0.66, 1.32, 0.01], [0.66, 0, 0.01, 1.32], [-0.66, 0, 0.01, 1.32]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), this.clothMat);
      s.position.set(x, 0.69, z);
      g.add(s);
    }
    // Koyu ahşap çıtalı sandalyeler
    const seats = [];
    for (const [dx, dz, rot] of [[0, -1.0, 0], [0, 1.0, Math.PI], [-1.0, 0, Math.PI / 2], [1.0, 0, -Math.PI / 2]]) {
      const ch = new THREE.Group();
      ch.position.set(dx, 0, dz);
      ch.rotation.y = rot;
      frame.add(ch);
      for (let k = 0; k < 4; k++) addBox(ch, 0.44, 0.03, 0.1, 0x2a1d14, 0, 0.47, -0.16 + k * 0.11);
      for (let k = 0; k < 3; k++) addBox(ch, 0.44, 0.08, 0.03, 0x2a1d14, 0, 0.72 + k * 0.13, -0.22);
      for (const [x, z, h] of [[-0.2, -0.2, 1.0], [0.2, -0.2, 1.0], [-0.2, 0.2, 0.46], [0.2, 0.2, 0.46]]) addBox(ch, 0.035, h, 0.035, 0x151517, x, h / 2, z);
      seats.push({ pos: new THREE.Vector3(O.x + lx + dx, 0, O.z + lz + dz), rot, taken: null });
    }
    bakeHierarchy(frame);
    const tcol = { minX: O.x + lx - 0.68, maxX: O.x + lx + 0.68, minZ: O.z + lz - 0.68, maxZ: O.z + lz + 0.68, h: 1 };
    this.cityColliders.push(tcol);

    const items = new THREE.Group();
    items.position.y = 0.815;
    g.add(items);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x8f1d10, transparent: true, opacity: 0.85, roughness: 0.05 });
    const cups = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const a = (i / 6) * Math.PI * 2 + 0.4;
      c.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      addMesh(c, new THREE.CylinderGeometry(0.05, 0.05, 0.005, 14), mat(0xffffff, { roughness: 0.3 }), 0, 0.003, 0, false);
      addMesh(c, new THREE.CylinderGeometry(0.03, 0.022, 0.09, 12), cupMat, 0, 0.05, 0, false);
      c.visible = false;
      items.add(c);
      cups.push(c);
    }
    const tileGeo = new THREE.BoxGeometry(0.05, 0.07, 0.022);
    const tileMat = mat(0xf5ecd0, { roughness: 0.4 });
    const okey = new THREE.Group();
    items.add(okey);
    for (let s = 0; s < 4; s++) {
      const rack = new THREE.Group();
      rack.rotation.y = (s * Math.PI) / 2;
      okey.add(rack);
      addBox(rack, 0.56, 0.04, 0.08, 0xc28e5c, 0, 0.02, 0.4, false);
      for (let i = 0; i < 8; i++) {
        const t = new THREE.Mesh(tileGeo, tileMat);
        t.position.set(-0.24 + i * 0.07, 0.07, 0.39);
        t.rotation.x = -0.3;
        rack.add(t);
      }
    }
    okey.visible = false;
    const tavla = new THREE.Group();
    items.add(tavla);
    addBox(tavla, 0.62, 0.05, 0.44, 0xa0642f, 0, 0.025, 0, false);
    addBox(tavla, 0.58, 0.01, 0.4, 0xe0b878, 0, 0.055, 0, false);
    addBox(tavla, 0.02, 0.02, 0.4, 0x7a4a25, 0, 0.065, 0, false);
    for (let i = 0; i < 6; i++) {
      for (const sgn of [-1, 1]) {
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 3), mat(i % 2 ? 0x5a3a1a : 0xf2e2c0));
        tri.rotation.x = sgn * Math.PI / 2;
        tri.position.set(-0.26 + i * 0.045 + (i > 2 ? 0.04 : 0), 0.062, sgn * -0.11);
        tavla.add(tri);
      }
    }
    for (let i = 0; i < 12; i++) addMesh(tavla, new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), i % 2 ? 0x1a1a1a : 0xf5f5f5, -0.2 + (i % 6) * 0.08, 0.068, i < 6 ? -0.15 : 0.15, false);
    tavla.visible = false;
    const kart = new THREE.Group();
    items.add(kart);
    for (let i = 0; i < 10; i++) addBox(kart, 0.08, 0.003, 0.12, i % 3 ? 0xffffff : 0xc1121f, (Math.random() - 0.5) * 0.4, 0.004 + i * 0.002, (Math.random() - 0.5) * 0.4, false).rotation.y = Math.random() * 3;
    kart.visible = false;

    const bc = document.createElement('canvas');
    bc.width = 256;
    bc.height = 128;
    const bt = new THREE.CanvasTexture(bc);
    bt.colorSpace = THREE.SRGBColorSpace;
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, depthTest: false, transparent: true }));
    bubble.scale.set(1.5, 0.75, 1);
    bubble.position.set(0, 2.15, 0);
    bubble.renderOrder = 10;
    bubble.visible = false;
    g.add(bubble);
    return {
      idx,
      root: g,
      col: tcol,
      center: new THREE.Vector3(O.x + lx, 0, O.z + lz),
      local: new THREE.Vector3(lx, 0, lz),
      seats,
      cups,
      okey,
      tavla,
      kart,
      bubble: { s: bubble, c: bc, t: bt, key: '' },
      party: null,
      state: 'free',
      order: [],
      wantGame: null,
      game: null,
      leftGame: null,
      timer: 0,
      patience: 0,
      bill: 0,
      quality: { good: 0, bad: 0 },
      dirtyCups: 0,
      rounds: 0,
    };
  }

  /* ---------- Sıfırlama / durum ---------- */
  clearAll() {
    for (const gp of this.groups) for (const m of gp.members) this.ctx.scene.remove(m.p.group);
    this.groups = [];
    this.payQueue = [];
    for (const t of this.tables) this._freeTable(t);
    this.spawnT = 2;
  }
  reset() {
    this.clearAll();
    this.served = 0;
    this.perfect = 0;
    this.lost = 0;
    this.totalTea = 0;
    this.tea = { left: 0, brew: 0 };
    this.coffee = { on: false, t: 0 };
    this.tray = [];
    this.dirty = 0;
    this.gear = null;
    this.setsOut = { okey: 0, tavla: 0, kart: 0 };
    this.glassClean = this.glassTotal;
    this.refreshTrayView();
    this._refreshRack();
  }
  closeShop() {
    let n = 0;
    for (const t of this.tables) {
      if (!t.party) continue;
      if (t.bill > 0) this._pay(t, true);
      else this._leave(t);
      n++;
    }
    for (const gp of [...this.payQueue]) this._settle(gp, true);
    return n;
  }
  customerCount() {
    return this.groups.reduce((s, g) => s + (g.leaving ? 0 : g.members.length), 0);
  }
  waitingCount() {
    return this.tables.filter((t) => t.party && (t.state === 'ordering' || (t.wantGame && !t.game))).length + this.payQueue.length;
  }
  _refreshRack() {
    for (const k of Object.keys(this.rackItems)) {
      const avail = this.sets[k] - this.setsOut[k] - (this.gear === k ? 1 : 0);
      this.rackItems[k].forEach((m, i) => (m.visible = i < avail));
    }
  }

  /* ---------- Müşteri grupları ---------- */
  _person() {
    const female = Math.random() < 0.18;
    const elder = Math.random() < 0.5;
    return createPerson({
      shirt: rnd(LOOKS.shirts),
      pants: rnd(LOOKS.pants),
      skin: rnd(LOOKS.skins),
      hair: elder ? rnd([0x999999, 0xbbbbbb, 0xdddddd]) : rnd(LOOKS.hairs),
      hat: female ? 'basortu' : Math.random() < (elder ? 0.6 : 0.25) ? 'kasket' : 'none',
      hatColor: rnd([0xc8c8c8, 0x5a5148, 0x3b3b3b, 0x6b4f3a]),
      scarf: rnd([0x9b3a6b, 0x2a6f97, 0x6a994e, 0x8d6e63]),
      mustache: !female && Math.random() < 0.75,
      beard: !female && Math.random() < 0.3,
      beardColor: elder ? 0xbbbbbb : undefined,
      glasses: elder && Math.random() < 0.3,
      belly: !female && Math.random() < 0.35,
    });
  }

  _spawnGroup(matchOn) {
    const free = this.tables.slice(0, this.tableCount).filter((t) => t.state === 'free');
    if (!free.length) return;
    const t = rnd(free);
    const size = Math.min(4, 1 + Math.floor(Math.random() * (matchOn ? 4 : 3.3)));
    const startX = Math.random() < 0.5 ? -24 : 30;
    const members = [];
    for (let i = 0; i < size; i++) {
      const p = this._person();
      p.group.position.set(startX + (startX < 0 ? -i : i) * 0.9, 0.12, LANE_Z + (i % 2) * 0.5);
      this.ctx.scene.add(p.group);
      const seat = t.seats[i];
      seat.taken = p;
      members.push({
        p,
        seat,
        phase: Math.random() * 6,
        path: [new THREE.Vector3(KIRA_ORIGIN.x, 0, LANE_Z), this.entry.clone(), ...this._seatRoute(t, seat), seat.pos.clone()],
        sat: false,
        speed: 1.9 + Math.random() * 0.4,
      });
    }
    const gp = { table: t, members, leaving: false };
    this.groups.push(gp);
    t.party = gp;
    t.state = 'arriving';
    t.rounds = 0;
    t.bill = 0;
    t.quality = { good: 0, bad: 0 };
    t.game = null;
    t.wantGame = null;
    if (size >= 2 && Math.random() < 0.55) t.wantGame = size >= 4 && Math.random() < 0.75 ? 'okey' : Math.random() < 0.55 ? 'tavla' : 'kart';
    else if (size === 1 && Math.random() < 0.2) t.wantGame = 'kart';
  }

  /** Koridordan sandalyeye, masanın içinden geçmeyen yol. */
  _seatRoute(t, seat) {
    const dz = seat.pos.z - t.center.z;
    const z = Math.abs(dz) > 0.5 ? seat.pos.z : t.center.z + 1.0;
    return [new THREE.Vector3(KIRA_ORIGIN.x, 0, z), new THREE.Vector3(seat.pos.x, 0, z)];
  }

  _newOrder(t) {
    const order = [];
    for (let i = 0; i < t.party.members.length; i++) {
      const r = Math.random();
      const type = r < 0.6 ? 'cay' : r < 0.74 ? 'kahve' : r < 0.83 ? 'oralet' : r < 0.92 ? 'soda' : 'su';
      order.push(type);
      if (type === 'cay' && t.rounds === 0 && Math.random() < 0.18) order.push('simit');
    }
    t.order = order;
    t.state = 'ordering';
    t.patience = 0;
    t.maxPatience = 60 * this.patienceMul;
    this._bubble(t);
    this.ctx.near?.(t.center, 14) && this.ctx.toast(`🙋 "${rnd(LINES.order)}"`, 'info', 'order' + t.idx);
  }

  _bubble(t) {
    const b = t.bubble;
    let text = '';
    let key = t.state;
    if (t.state === 'ordering') {
      const cnt = {};
      for (const x of t.order) cnt[x] = (cnt[x] || 0) + 1;
      text = Object.entries(cnt).map(([k, v]) => `${v > 1 ? v : ''}${DRINKS[k].icon}`).join(' ');
      key += text + Math.round((1 - t.patience / t.maxPatience) * 10);
    }
    if (t.wantGame && !t.game) {
      text += (text ? '  ' : '') + GAMES[t.wantGame].icon + '?';
      key += t.wantGame;
    }
    b.s.visible = !!text;
    if (key === b.key) return;
    b.key = key;
    const g = b.c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    if (!text) return;
    g.fillStyle = 'rgba(255,255,255,.94)';
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 5;
    g.beginPath();
    if (g.roundRect) g.roundRect(6, 6, 244, 84, 20);
    else g.rect(6, 6, 244, 84);
    g.fill();
    g.stroke();
    g.font = '38px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#1a1a1a';
    g.fillText(text, 128, 44);
    if (t.state === 'ordering') {
      const r = Math.max(0, 1 - t.patience / t.maxPatience);
      g.fillStyle = 'rgba(0,0,0,.15)';
      g.fillRect(30, 74, 196, 8);
      g.fillStyle = r > 0.5 ? '#2ec27e' : r > 0.25 ? '#f77f00' : '#e63946';
      g.fillRect(30, 74, 196 * r, 8);
    }
    b.t.needsUpdate = true;
  }

  /** Grubu masadan kaldır: lider kasaya gider (hesap varsa), diğerleri çıkar. */
  _leave(t, toKasa = false) {
    const gp = t.party;
    if (!gp) return;
    t.party = null;
    t.bubble.s.visible = false;
    t.bubble.key = '';
    t.order = [];
    if (t.game) {
      t.leftGame = t.game;
      t.game = null;
    }
    t.state = t.dirtyCups > 0 || t.leftGame ? 'dirty' : 'free';
    if (t.state === 'free') this._freeTable(t);
    gp.members.forEach((m, i) => {
      m.sat = false;
      m.seat.taken = null;
      const route = this._seatRoute(t, m.seat).reverse();
      const out = [...route, this.entry.clone(), new THREE.Vector3(KIRA_ORIGIN.x + (Math.random() < 0.5 ? -0.5 : 0.5), 0, LANE_Z), new THREE.Vector3(Math.random() < 0.5 ? -26 : 32, 0, LANE_Z)];
      if (i === 0 && toKasa) {
        gp.payer = m;
        m.path = [...route, this.L(0, 3.3), this.payStand(this.payQueue.length)];
        m.exitPath = out;
      } else {
        m.path = out;
        m.exiting = true;
      }
    });
    if (toKasa) {
      gp.bill = t.bill + (t.leftGame ? GAMES[t.leftGame].rent : 0);
      gp.quality = { ...t.quality };
      gp.hadGame = !!t.leftGame;
      gp.waitPay = 0;
      this.payQueue.push(gp);
      this.ctx.near?.(this.kasaPoint, 16) && this.ctx.toast(`💰 "${rnd(LINES.pay)}" — kasaya git, ödemeyi al.`, 'info', 'kasa');
    }
    gp.leaving = true;
  }

  _freeTable(t) {
    if (t.party) for (const m of t.party.members) m.seat.taken = null;
    t.party = null;
    t.state = 'free';
    t.order = [];
    t.wantGame = null;
    for (const k of ['leftGame', 'game']) {
      if (t[k]) {
        this.setsOut[t[k]] = Math.max(0, this.setsOut[t[k]] - 1);
        t[k] = null;
      }
    }
    t.okey.visible = t.tavla.visible = t.kart.visible = false;
    t.dirtyCups = 0;
    t.cups.forEach((c) => (c.visible = false));
    t.bubble.s.visible = false;
    t.bubble.key = '';
    this._refreshRack();
  }

  _pay(t, auto) {
    this._leave(t, true);
    const gp = this.payQueue[this.payQueue.length - 1];
    if (auto && gp) this._settle(gp, true);
  }

  /** Kasada ödeme. */
  _settle(gp, auto = false) {
    const i = this.payQueue.indexOf(gp);
    if (i >= 0) this.payQueue.splice(i, 1);
    const pop = this.ctx.getPop ? this.ctx.getPop() : 30;
    const { good, bad } = gp.quality;
    const tip = auto ? 0 : Math.round((good * 2 + (bad === 0 && good > 0 ? 5 : 0)) * (0.6 + pop / 100));
    const total = gp.bill + tip;
    if (total > 0) this.ctx.addMoney(total);
    this.ctx.sfx.coin();
    this.served += gp.members.length;
    if (bad === 0 && good > 0) this.perfect++;
    this.ctx.addPop?.((bad === 0 && good > 0 ? 2 : bad > good ? -2 : 0.5) + (gp.hadGame ? 1 : 0) - (auto ? 0.5 : 0));
    if (!auto) this.ctx.toast(`💰 Ödeme alındı: ${total} TL${tip ? ` (bahşiş ${tip})` : ''} — "${rnd(bad ? ['Sağ ol usta.', 'Eyvallah.'] : LINES.happy)}"`, 'ok');
    if (gp.payer) {
      gp.payer.path = gp.payer.exitPath;
      gp.payer.exiting = true;
    }
    // sıradakiler bir adım öne
    this.payQueue.forEach((q, k) => q.payer && !q.payer.path.length && (q.payer.path = [this.payStand(k)]));
  }

  /* ---------- Güncelleme ---------- */
  update(dt, playing, rate, matchOn) {
    this.t += dt;
    // kepenk
    if (this.openAmt !== this.openTarget) {
      this.openAmt = this.openTarget > this.openAmt ? Math.min(this.openTarget, this.openAmt + dt * 1.1) : Math.max(this.openTarget, this.openAmt - dt * 1.1);
      this._applyShutter();
    }
    if (rate > 0) {
      this.spawnT -= dt * rate;
      if (this.spawnT <= 0) {
        this.spawnT = 10 + Math.random() * 8;
        this._spawnGroup(matchOn);
      }
    }
    // ocak
    if (this.tea.left > 0) this.tea.brew = Math.min(1.8, this.tea.brew + dt * (this.slowBrew ? 0.045 : 0.06));
    if (this.coffee.on) {
      this.coffee.t += dt * 0.11;
      if (this.coffee.t > 1.35) {
        this.coffee.on = false;
        this.coffee.t = 0;
        this.ctx.toast('☕💦 Kahve taştı! Cezveye bakmadın usta...', 'bad', 'tasti');
        this.ctx.sfx.bad();
      }
    }
    this.flame.visible = this.coffee.on;
    this.foam.position.y = 0.12 + Math.min(1.2, this.coffee.t) * 0.06;
    for (const s of this.steam) {
      s.t = (s.t + dt * 0.35) % 1;
      s.m.position.y = 2.45 + s.t * 0.9;
      s.m.material.opacity = 0.3 * (1 - s.t) * (this.tea.left > 0 ? 1 : 0.35);
      s.m.scale.setScalar(0.6 + s.t * 1.6);
    }
    this.glassMeshes.forEach((m, i) => (m.visible = i < this.glassClean));
    this._drawTv(matchOn);

    // Masalar
    for (const t of this.tables) {
      if (!t.party || t.party.leaving) continue;
      if (t.state === 'arriving' && t.party.members.every((m) => m.sat)) {
        t.state = 'settle';
        t.timer = 1.5;
      } else if (t.state === 'settle') {
        t.timer -= dt;
        if (t.timer <= 0) this._newOrder(t);
      } else if (t.state === 'ordering') {
        if (playing) t.patience += dt;
        if (t.patience > t.maxPatience) {
          this.lost += t.party.members.length;
          this.ctx.toast(`😡 "${rnd(LINES.angry)}" — bir masa kalkıp gitti!`, 'bad');
          this.ctx.sfx.bad();
          this.ctx.addPop?.(-4);
          this._leave(t, t.bill > 0);
          continue;
        }
        this._bubble(t);
      } else if (t.state === 'drinking') {
        t.timer -= dt * (t.game ? 0.65 : 1);
        if (t.timer <= 0) {
          t.rounds++;
          const again = (t.game ? 0.8 : 0.45) / t.rounds;
          if (Math.random() < again) this._newOrder(t);
          else this._leave(t, true);
        }
        if (t.wantGame && !t.game) this._bubble(t);
      }
    }
    // Kasada bekleyenler
    for (const gp of [...this.payQueue]) {
      gp.waitPay += dt;
      if (gp.waitPay > 45) {
        this.ctx.toast('💵 Bir müşteri parayı kasaya bırakıp çıktı (bahşişsiz).', 'info');
        this._settle(gp, true);
      }
    }

    // Kişiler
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const gp = this.groups[i];
      let gone = true;
      for (const m of gp.members) {
        const g = m.p.group;
        if (m.removed) continue;
        let moving = false;
        if (m.path.length) {
          const tgt = m.path[0];
          const dx = tgt.x - g.position.x;
          const dz = tgt.z - g.position.z;
          const d = Math.hypot(dx, dz);
          const step = m.speed * dt;
          if (d <= step) {
            g.position.x = tgt.x;
            g.position.z = tgt.z;
            m.path.shift();
            if (!m.path.length) {
              if (m.exiting) {
                this.ctx.scene.remove(g);
                m.removed = true;
                continue;
              }
              if (!gp.leaving) m.sat = true;
              else g.rotation.y = Math.PI; // kasaya dön
            }
          } else {
            g.position.x += (dx / d) * step;
            g.position.z += (dz / d) * step;
            g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
            moving = true;
          }
        }
        gone = false;
        m.phase += dt * (moving ? 8 : 1.4);
        if (m.sat) {
          animatePerson(m.p, m.phase, 0, 'sit');
          g.position.set(m.seat.pos.x, -0.36 + 0.12, m.seat.pos.z);
          g.rotation.y = m.seat.rot;
          const t = gp.table;
          if (t.state === 'ordering' && m === gp.members[0]) {
            m.p.armR.rotation.set(-2.9 + Math.sin(this.t * 3) * 0.1, 0, -0.2);
            m.p.elbowR && m.p.elbowR.rotation.set(-0.2, 0, 0);
          } else if (t.state === 'drinking') {
            const k = Math.sin(m.phase * (t.game ? 1.6 : 0.5) + m.seat.rot * 3);
            m.p.armR.rotation.x = -0.6 + Math.max(0, k) * -1.1;
            m.p.elbowR && (m.p.elbowR.rotation.x = -0.9 - Math.max(0, k) * 1.2);
          }
        } else {
          animatePerson(m.p, m.phase, moving ? 1 : 0);
          g.position.y = this.isInside(g.position) ? 0.12 : this.ctx.world.heightAt(g.position.x, g.position.z);
        }
      }
      if (gp.leaving && gone) {
        this.groups.splice(i, 1);
      }
    }
  }

  _drawTv(matchOn) {
    const g = this.tvCanvas.getContext('2d');
    if (!this.tvOn) {
      if (this._tvKey === 'off') return;
      this._tvKey = 'off';
      g.fillStyle = '#0a0a0a';
      g.fillRect(0, 0, 256, 144);
      this.tvTex.needsUpdate = true;
      return;
    }
    const k = Math.floor(this.t * 8);
    if (k === this._tvKey) return;
    this._tvKey = k;
    if (matchOn) {
      if (Math.random() < 0.0025) this.score[Math.random() < 0.5 ? 0 : 1]++;
      g.fillStyle = '#2f8f3a';
      g.fillRect(0, 0, 256, 144);
      for (let x = 0; x < 256; x += 32) {
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.fillRect(x, 0, 16, 144);
      }
      g.strokeStyle = 'rgba(255,255,255,.8)';
      g.lineWidth = 2;
      g.strokeRect(10, 10, 236, 124);
      g.beginPath(); g.moveTo(128, 10); g.lineTo(128, 134); g.stroke();
      g.beginPath(); g.arc(128, 72, 18, 0, Math.PI * 2); g.stroke();
      const bx = 128 + Math.sin(this.t * 1.3) * 90;
      const by = 72 + Math.sin(this.t * 2.1) * 45;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i < 4 ? '#e63946' : '#ffd166';
        g.fillRect(bx + Math.sin(this.t + i * 2) * 40 - 3, by + Math.cos(this.t * 1.4 + i) * 30 - 5, 6, 10);
      }
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(6, 4, 104, 16);
      g.fillStyle = '#fff';
      g.font = 'bold 11px sans-serif';
      g.fillText(`KASABA ${this.score[0]} - ${this.score[1]} DEPLASMAN`, 10, 16);
    } else {
      g.fillStyle = '#1d3557';
      g.fillRect(0, 0, 256, 144);
      g.fillStyle = '#e9c46a';
      g.fillRect(0, 108, 256, 24);
      g.fillStyle = '#1d3557';
      g.font = 'bold 13px sans-serif';
      g.fillText('KASABA HABER · Akşam maçı saat 20:00\'de · Hava güneşli ·', 256 - ((this.t * 40) % 700), 125);
      g.fillStyle = '#f1faee';
      g.fillRect(90, 22, 76, 72);
      g.fillStyle = '#e9b47f';
      g.beginPath(); g.arc(128, 48, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#264653';
      g.fillRect(108, 66, 40, 28);
    }
    this.tvTex.needsUpdate = true;
  }

  /* ---------- Ocak işlemleri ---------- */
  teaQuality() {
    if (this.tea.left <= 0) return null;
    const b = this.tea.brew;
    if (b < 0.5) return 'light';
    if (b > 1.25) return 'bitter';
    return 'good';
  }
  brewTea() {
    const st = this.ctx.stock;
    if (st.cay <= 0) return this.ctx.toast('🫖 Kuru çay bitti! Bakkaldan çay al.', 'bad', 'nocay');
    st.cay--;
    if (this.tea.left > 0) this.ctx.toast('Eski demlik döküldü, yenisi demleniyor.', 'warn', 'dok');
    this.tea.left = this.demlikSize;
    this.tea.brew = 0;
    this.ctx.sfx.pour?.();
    this.ctx.toast('🫖 Çay demleniyor... Tavşan kanı olunca doldur.', 'info', 'demle');
  }
  pourTea() {
    if (this.tray.length >= this.trayMax) return this.ctx.toast('Tepsi dolu!', 'warn', 'trayfull');
    if (this.tea.left <= 0) return this.ctx.toast('Demlik boş, önce çay demle 🫖', 'warn', 'nodem');
    if (this.glassClean <= 0) return this.ctx.toast('Temiz bardak kalmadı! Lavaboda bardak yıka 🧽', 'bad', 'noglass');
    let q = this.teaQuality();
    if (this.ctx.stock.seker > 0) this.ctx.stock.seker--;
    else {
      this.ctx.toast('Şeker bitti! Şekersiz çay müşteriyi üzer. Bakkaldan şeker al.', 'warn', 'noseker');
      if (q === 'good') q = 'light';
    }
    this.tea.left--;
    this.glassClean--;
    this.tray.push({ type: 'cay', q });
    this.totalTea++;
    this.ctx.sfx.pour?.();
    this.refreshTrayView();
  }
  coffeeAction() {
    if (this.coffee.on) {
      if (this.tray.length >= this.trayMax) return this.ctx.toast('Tepsi dolu!', 'warn', 'trayfull');
      if (this.glassClean <= 0) return this.ctx.toast('Temiz fincan yok! Lavaboda yıka 🧽', 'bad', 'noglass');
      const q = this.coffee.t < 0.8 ? 'light' : 'good';
      this.glassClean--;
      this.coffee.on = false;
      this.coffee.t = 0;
      this.tray.push({ type: 'kahve', q });
      this.ctx.sfx.pour?.();
      this.ctx.toast(q === 'good' ? '☕ Köpüklü Türk kahvesi tepside!' : '☕ Kahve erken alındı, az pişmiş...', q === 'good' ? 'ok' : 'warn', 'kahve');
      this.refreshTrayView();
      return;
    }
    if (this.ctx.stock.kahve <= 0) return this.ctx.toast('☕ Kahve bitti! Bakkaldan al.', 'bad', 'nokahve');
    this.ctx.stock.kahve--;
    this.coffee.on = true;
    this.coffee.t = 0;
    this.ctx.toast('☕ Cezve ocakta. Köpürünce (yeşil bölge) al, yoksa taşar!', 'info', 'cezve');
  }
  addSimple(type) {
    const st = this.ctx.stock;
    if (this.tray.length >= this.trayMax) return this.ctx.toast('Tepsi dolu!', 'warn', 'trayfull');
    if ((st[type] ?? 0) <= 0) return this.ctx.toast(`${DRINKS[type].icon} ${DRINKS[type].name} bitti! Bakkal/fırından al.`, 'bad', 'no' + type);
    if (GLASS_TYPES[type]) {
      if (this.glassClean <= 0) return this.ctx.toast('Temiz bardak yok! 🧽', 'bad', 'noglass');
      this.glassClean--;
    }
    st[type]--;
    this.tray.push({ type, q: 'good' });
    this.ctx.sfx.click();
    this.refreshTrayView();
  }
  emptyTray() {
    for (const it of this.tray) if (GLASS_TYPES[it.type]) this.dirty++;
    this.tray = [];
    this.refreshTrayView();
  }
  wash() {
    if (!this.dirty) return this.ctx.toast('Elinde kirli bardak yok. Masalardan topla.', 'warn', 'nodirty');
    this.glassClean = Math.min(this.glassTotal, this.glassClean + this.dirty);
    this.ctx.toast(`🧽 ${this.dirty} bardak yıkandı, pırıl pırıl!`, 'ok');
    this.dirty = 0;
    this.ctx.sfx.pour?.();
  }

  /* ---------- Masa / kasa işlemleri ---------- */
  nearestTable(pos, r = 1.85) {
    let best = null;
    let bd = r;
    for (const t of this.tables.slice(0, this.tableCount)) {
      const d = Math.hypot(t.center.x - pos.x, t.center.z - pos.z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  serveTable(t) {
    if (t.state !== 'ordering') return;
    let delivered = 0;
    let bad = 0;
    for (let i = t.order.length - 1; i >= 0; i--) {
      const type = t.order[i];
      const k = this.tray.findIndex((x) => x.type === type);
      if (k < 0) continue;
      const it = this.tray.splice(k, 1)[0];
      t.order.splice(i, 1);
      delivered++;
      t.bill += DRINKS[type].price;
      if (it.q !== 'good') {
        bad++;
        t.quality.bad++;
      } else t.quality.good++;
      if (GLASS_TYPES[type]) t.dirtyCups++;
    }
    if (!delivered) return this.ctx.toast('Tepside bu masanın istediği yok. Ocağa git! 🫖', 'warn', 'wrongtray');
    this.refreshTrayView();
    this.ctx.sfx.clink?.();
    t.cups.forEach((c, i) => (c.visible = i < t.dirtyCups));
    if (bad) {
      this.ctx.toast(`🗣️ "${rnd(LINES.light.concat(LINES.bitter))}"`, 'warn');
      this.ctx.addPop?.(-1);
    }
    if (!t.order.length) {
      t.state = 'drinking';
      t.timer = 20 + Math.random() * 14;
      t.bubble.s.visible = !!(t.wantGame && !t.game);
      t.bubble.key = '';
      if (t.wantGame && !t.game) this._bubble(t);
      if (!bad) this.ctx.toast(`🗣️ "${rnd(LINES.happy)}"`, 'ok');
    } else {
      this._bubble(t);
      this.ctx.toast(`${delivered} şey bırakıldı, ${t.order.length} eksik.`, 'info');
    }
  }

  giveGame(t) {
    if (!t.wantGame || t.game || !this.gear) return;
    if (this.gear !== t.wantGame) return this.ctx.toast(`Bu masa ${GAMES[t.wantGame].name} istiyor, elindeki ${GAMES[this.gear].name}.`, 'warn', 'wronggame');
    t.game = this.gear;
    this.gear = null;
    this.setsOut[t.game]++;
    t[t.game].visible = true;
    this.ctx.sfx.clink?.();
    this.ctx.toast(`${GAMES[t.game].icon} Takım masada! Oyun başladı, çaylar daha çok içilecek.`, 'ok');
    this._bubble(t);
    this.refreshTrayView();
    this._refreshRack();
  }
  collect(t) {
    if (this.dirty + t.dirtyCups > 14) return this.ctx.toast('Elin dolu! Önce lavaboda bardakları yıka.', 'warn', 'handfull');
    this.dirty += t.dirtyCups;
    this.ctx.toast(`🧺 ${t.dirtyCups} kirli bardak toplandı${t.leftGame ? ', oyun takımı rafa döndü' : ''}.`, 'info');
    this._freeTable(t);
    this.ctx.sfx.clink?.();
  }
  takeGame(kind) {
    if (this.gear) return this.ctx.toast('Elinde zaten bir takım var.', 'warn', 'gear');
    if (this.sets[kind] - this.setsOut[kind] <= 0) return this.ctx.toast(`Rafta ${GAMES[kind].name} kalmadı. Nalburdan yenisini al.`, 'warn', 'noset');
    this.gear = kind;
    this._refreshRack();
    this.refreshTrayView();
    this.ctx.sfx.click();
  }
  returnGame() {
    this.gear = null;
    this._refreshRack();
    this.refreshTrayView();
  }

  /** Bağlamsal butonlar (oyuncu kıraathanenin içindeyken). */
  actions(pos) {
    const list = [];
    const near = (p, r) => Math.hypot(pos.x - p.x, pos.z - p.z) < r;
    if (near(this.ocakPoint, 2.4)) list.push({ id: 'ocak', icon: '🫖', label: 'Ocak', cls: 'yellow hot', onPress: () => this.ctx.openOcak() });
    if (near(this.kasaPoint, 1.7) && this.payQueue.length) {
      const gp = this.payQueue[0];
      const arrived = gp.payer && !gp.payer.path.length;
      list.push({ id: 'kasa', icon: '💰', label: arrived ? `Ödeme Al (${gp.bill} TL)` : 'Müşteri kasaya geliyor', cls: arrived ? 'green hot' : 'gray', onPress: () => arrived && this._settle(gp) });
    }
    if (near(this.sinkPoint, 1.9)) list.push({ id: 'wash', icon: '🧽', label: `Bardak Yıka (${this.dirty})`, cls: this.dirty ? 'blue hot' : 'gray', onPress: () => this.wash() });
    if (near(this.rackPoint, 2.0)) {
      if (this.gear) list.push({ id: 'rgear', icon: '↩️', label: 'Takımı Rafa Koy', cls: 'gray', onPress: () => this.returnGame() });
      else for (const k of Object.keys(GAMES)) list.push({ id: 'g' + k, icon: GAMES[k].icon, label: `${GAMES[k].name} (${this.sets[k] - this.setsOut[k]})`, cls: 'blue', onPress: () => this.takeGame(k) });
    }
    if (near(this.tvPoint, 1.8)) list.push({ id: 'tv', icon: '📺', label: this.tvOn ? 'TV Kapat' : 'TV Aç', cls: 'gray', onPress: () => { this.tvOn = !this.tvOn; this._tvKey = null; this.ctx.sfx.click(); } });
    const t = this.nearestTable(pos);
    if (t) {
      if (t.state === 'ordering') list.push({ id: 'serve' + t.idx, icon: '🛎️', label: this.tray.length ? 'Servis Et' : 'Sipariş: ' + t.order.map((x) => DRINKS[x].icon).join(''), cls: this.tray.length ? 'green hot' : 'gray', onPress: () => this.serveTable(t) });
      if (t.wantGame && !t.game && this.gear) list.push({ id: 'game' + t.idx, icon: GAMES[t.wantGame].icon, label: 'Takımı Ver', cls: 'green hot', onPress: () => this.giveGame(t) });
      if (t.state === 'dirty') list.push({ id: 'collect' + t.idx, icon: '🧺', label: `Masayı Topla (${t.dirtyCups})`, cls: 'blue', onPress: () => this.collect(t) });
    }
    return list;
  }
}
