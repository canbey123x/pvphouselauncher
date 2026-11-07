// =========================================================
// city.js — Kasaba: camii, binalar, yollar, park ve dönerci dükkânı
// Tüm modeller Three.js ilkel geometrileriyle (box, cylinder, cone...) üretilir.
// =========================================================
import * as THREE from 'three';

/* ---------------- Ortak yardımcılar ---------------- */
const matCache = new Map();

/** Renk başına önbelleklenmiş düşük poligon (flat shading) malzeme. */
export function mat(color, extra = {}) {
  const key = color + '|' + JSON.stringify(extra);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    matCache.set(key, m);
  }
  return m;
}

export function addMesh(parent, geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function addBox(parent, w, h, d, material, x, y, z, shadow = true) {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z, shadow);
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Deterministik rastgele sayı üreteci (kasaba her açılışta aynı görünsün). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Daire (oyuncu/eşek) ile eksen hizalı kutular arasında çarpışma çözümü. */
export function resolveCircle(pos, r, colliders, bound = 70) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = r - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // Merkez kutunun içinde: en yakın kenardan dışarı it.
      const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) pos.x = c.minX - r;
      else if (m === rr) pos.x = c.maxX + r;
      else if (m === t) pos.z = c.minZ - r;
      else pos.z = c.maxZ + r;
    }
  }
  if (pos.x < -bound) { pos.x = -bound; hit = true; }
  if (pos.x > bound) { pos.x = bound; hit = true; }
  if (pos.z < -bound) { pos.z = -bound; hit = true; }
  if (pos.z > bound) { pos.z = bound; hit = true; }
  return hit;
}

/** Kamera bir binanın içine mi giriyor? */
export function pointBlocked(p, colliders, margin = 0.3) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (p.y < c.h && p.x > c.minX - margin && p.x < c.maxX + margin && p.z > c.minZ - margin && p.z < c.maxZ + margin) return true;
  }
  return false;
}

function signTexture(text, bg, fg, w = 512, h = 112, font = 'Bungee') {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = Math.floor(h * 0.56);
    g.font = `${size}px "${font}", Impact, "Arial Black", sans-serif`;
    while (g.measureText(text).width > w - 40 && size > 10) {
      size -= 2;
      g.font = `${size}px "${font}", Impact, "Arial Black", sans-serif`;
    }
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowOffsetY = 4;
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

function drawStar(g, cx, cy, R, r, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

function turkishFlagTexture() {
  return canvasTexture(300, 200, (g, w, h) => {
    g.fillStyle = '#E30A17';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(112, 100, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E30A17';
    g.beginPath(); g.arc(125, 100, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    drawStar(g, 180, 100, 25, 10, Math.PI);
  });
}

function meatTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    const r = rng(7);
    for (let y = 0; y < h; y += 4) {
      const shade = 90 + Math.floor(r() * 70);
      g.fillStyle = `rgb(${shade + 50},${Math.floor(shade * 0.55)},${Math.floor(shade * 0.25)})`;
      g.fillRect(0, y, w, 4);
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(60,25,8,.55)' : 'rgba(230,160,90,.45)';
      g.fillRect(r() * w, r() * h, 3 + r() * 10, 2 + r() * 3);
    }
  });
}

/* =========================================================
   Kasabayı kur
   ========================================================= */
export function buildCity(scene) {
  const rand = rng(1987);
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];
  const updaters = [];
  const sidewalkRects = [];

  const col = (minX, maxX, minZ, maxZ, h = 10) => colliders.push({ minX, maxX, minZ, maxZ, h });
  const colBox = (cx, cz, w, d, h = 10) => col(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);

  const flat = (w, d, color, x, z, y = 0.02) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof color === 'number' ? mat(color) : color);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  /* ---------- Zemin, yollar, kaldırımlar ---------- */
  flat(420, 420, 0x86b85a, 0, 0, 0);
  flat(150, 10, 0x44454d, 0, 0, 0.02);           // Ana cadde (X ekseni)
  flat(9, 150, 0x44454d, 22, 0, 0.021);          // Ara sokak (Z ekseni)

  for (let x = -72; x < 72; x += 4) {
    if (x > 15 && x < 29) continue;
    flat(2, 0.25, 0xf4f1e8, x, 0, 0.03);
  }
  for (let z = -72; z < 72; z += 4) {
    if (z > -7 && z < 7) continue;
    flat(0.25, 2, 0xf4f1e8, 22, z, 0.03);
  }
  // Yaya geçidi (zebra)
  for (let z = -4.2; z <= 4.2; z += 1.05) flat(3, 0.55, 0xf4f1e8, 9, z, 0.031);
  for (let x = 18.3; x <= 25.8; x += 1.05) flat(0.55, 3, 0xf4f1e8, x, -10.5, 0.031);

  const sidewalk = (x0, x1, z0, z1) => {
    sidewalkRects.push({ x0, x1, z0, z1 });
    addBox(root, x1 - x0, 0.12, z1 - z0, 0xd8d0c0, (x0 + x1) / 2, 0.06, (z0 + z1) / 2, false);
  };
  sidewalk(-75, 17.5, -8.6, -5);
  sidewalk(26.5, 75, -8.6, -5);
  sidewalk(-75, 17.5, 5, 8.6);
  sidewalk(26.5, 75, 5, 8.6);
  sidewalk(15, 17.5, -75, -8.6);
  sidewalk(26.5, 29, -75, -8.6);
  sidewalk(15, 17.5, 8.6, 75);
  sidewalk(26.5, 29, 8.6, 75);
  // Bordür taşları
  for (const [x0, x1] of [[-75, 17.5], [26.5, 75]]) {
    addBox(root, x1 - x0, 0.16, 0.18, 0xa79f92, (x0 + x1) / 2, 0.08, -5.05, false);
    addBox(root, x1 - x0, 0.16, 0.18, 0xa79f92, (x0 + x1) / 2, 0.08, 5.05, false);
  }

  function heightAt(x, z) {
    for (let i = 0; i < sidewalkRects.length; i++) {
      const r = sidewalkRects[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return 0.12;
    }
    return 0;
  }

  /* ---------- Bina üretici ---------- */
  const WALLS = [0xf3e9d2, 0xe9c9a8, 0xf2d7d0, 0xcfe0e8, 0xf7f0e1, 0xe8d8a8, 0xd9e6c8, 0xf0c9a0, 0xe7d3ea];
  const ROOFS = [0xb5523b, 0xa8442f, 0xc4663f, 0x9c3d2a];

  function building(cx, cz, w, d, floors, rotY, opt = {}) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    root.add(g);
    const h = floors * 3 + 0.4;
    const color = opt.color ?? WALLS[Math.floor(rand() * WALLS.length)];
    addBox(g, w, h, d, color, 0, h / 2, 0);
    addBox(g, w + 0.06, 0.7, d + 0.06, 0x9c8f80, 0, 0.35, 0, false);
    for (let f = 1; f < floors; f++) addBox(g, w + 0.14, 0.15, d + 0.14, 0xffffff, 0, f * 3, 0, false);

    const fz = d / 2 + 0.04;
    // Zemin kat: kapı + vitrin
    const doorX = -w / 2 + 1.0;
    addBox(g, 1.1, 2.1, 0.1, 0x6b3e26, doorX, 1.05, fz, false);
    addBox(g, 0.1, 0.1, 0.12, 0xf2c037, doorX + 0.35, 1.05, fz + 0.04, false);
    if (w > 4.2) {
      const ww = w - 2.6;
      addBox(g, ww + 0.2, 1.7, 0.06, 0xffffff, doorX + 0.75 + ww / 2 + 0.1, 1.45, fz, false);
      addBox(g, ww, 1.5, 0.08, 0x3b5f7a, doorX + 0.75 + ww / 2 + 0.1, 1.45, fz + 0.01, false);
    }
    if (opt.sign) {
      const tex = signTexture(opt.sign.text, opt.sign.bg, opt.sign.fg);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.85, 5.2), 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      sm.position.set(0, 2.62, fz + 0.03);
      g.add(sm);
    }
    // Üst katlar: pencere, panjur, balkon
    const n = Math.max(1, Math.floor((w - 0.6) / 1.8));
    const spacing = w / n;
    for (let f = 1; f < floors; f++) {
      const y = f * 3 + 1.5;
      const shutters = rand() < 0.35;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + spacing * (i + 0.5);
        addBox(g, 1.05, 1.45, 0.06, 0xffffff, x, y, fz, false);
        addBox(g, 0.85, 1.25, 0.08, 0x2f4f6a, x, y, fz + 0.01, false);
        if (shutters) {
          addBox(g, 0.36, 1.3, 0.05, 0x3f7d4f, x - 0.72, y, fz + 0.02, false);
          addBox(g, 0.36, 1.3, 0.05, 0x3f7d4f, x + 0.72, y, fz + 0.02, false);
        }
      }
      if (rand() < 0.45) {
        const bw = Math.min(w * 0.6, 3.4);
        addBox(g, bw, 0.12, 0.8, 0xe8e2d6, 0, f * 3 + 0.1, fz + 0.4, false);
        addBox(g, bw, 0.6, 0.05, 0x333333, 0, f * 3 + 0.45, fz + 0.78, false);
        for (let k = 0; k < 3; k++) {
          addBox(g, 0.22, 0.22, 0.22, 0xa0522d, -bw / 2 + 0.4 + k * (bw - 0.8) / 2, f * 3 + 0.9, fz + 0.62, false);
          addMesh(g, new THREE.IcosahedronGeometry(0.17, 0), rand() < 0.5 ? 0xe63946 : 0xff70a6, -bw / 2 + 0.4 + k * (bw - 0.8) / 2, f * 3 + 1.1, fz + 0.62, false);
        }
      }
    }
    // Çatı
    if (!opt.flatRoof && rand() < 0.62) {
      const geo = new THREE.ConeGeometry(0.72, 1.7, 4);
      geo.rotateY(Math.PI / 4);
      const roof = addMesh(g, geo, ROOFS[Math.floor(rand() * ROOFS.length)], 0, h + 0.85, 0);
      roof.scale.set(w, 1, d);
      if (rand() < 0.6) addBox(g, 0.45, 1.3, 0.45, 0x8a6f5a, w * 0.25, h + 1.1, -d * 0.15);
    } else {
      addBox(g, w, 0.4, 0.15, color, 0, h + 0.2, d / 2 - 0.075, false);
      addBox(g, w, 0.4, 0.15, color, 0, h + 0.2, -d / 2 + 0.075, false);
      addBox(g, 0.15, 0.4, d, color, w / 2 - 0.075, h + 0.2, 0, false);
      addBox(g, 0.15, 0.4, d, color, -w / 2 + 0.075, h + 0.2, 0, false);
      addMesh(g, new THREE.CylinderGeometry(0.5, 0.5, 0.9, 8), 0xdcdcdc, -w * 0.2, h + 0.45, -d * 0.2);
      const dish = addMesh(g, new THREE.CylinderGeometry(0.38, 0.06, 0.16, 8), 0xf0f0f0, w * 0.25, h + 0.6, d * 0.2);
      dish.rotation.x = -0.9;
    }
    colBox(cx, cz, w, d, h + 2);
    return g;
  }

  function fillRow(x0, x1, side, reserved) {
    const res = reserved.slice().sort((a, b) => a[0] - b[0]);
    const segs = [];
    let cur = x0;
    for (const [a, b] of res) {
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < x1) segs.push([cur, x1]);
    for (const [s, e] of segs) {
      let x = s;
      while (e - x > 3) {
        let w = 4.5 + rand() * 3.5;
        if (e - x - w < 3.5) w = e - x - 0.3;
        if (w < 3) break;
        const d = 7 + rand() * 2;
        const floors = rand() < 0.2 ? 1 : rand() < 0.65 ? 2 : 3;
        const cz = side < 0 ? -8.8 - d / 2 : 8.8 + d / 2;
        building(x + w / 2, cz, w, d, floors, side < 0 ? 0 : Math.PI);
        x += w + 0.3;
      }
    }
  }

  // Kuzey (dükkân tarafı) ve güney sıraları
  fillRow(-66, 14.5, -1, [[-17.2, -10.8], [-3.4, 3.4]]);
  fillRow(-66, 14.5, 1, [[-46, -14], [6.6, 13.4]]);
  fillRow(29.5, 66, -1, []);
  fillRow(29.5, 66, 1, [[29.5, 52.5]]);

  // Özel binalar
  building(-14, -8.8 - 3.5, 6, 7, 2, 0, { sign: { text: 'BAKKAL NURİ', bg: '#1e6fb8', fg: '#ffffff' }, color: 0xf7f0e1, flatRoof: true });
  building(10, 8.8 + 3.2, 6.4, 6.4, 1, Math.PI, { sign: { text: 'ÇAY OCAĞI', bg: '#7a2e12', fg: '#ffd166' }, color: 0xf0c9a0, flatRoof: true });
  // Çay masaları
  for (const tx of [7.6, 9.8]) {
    addMesh(root, new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), 0x8b5a2b, tx, 0.85, 7.4);
    addMesh(root, new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), 0x5a3a1a, tx, 0.48, 7.4);
    addMesh(root, new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8), mat(0xc0392b, { transparent: true, opacity: 0.85 }), tx + 0.12, 0.94, 7.4, false);
    for (const sx of [-0.6, 0.6]) {
      addBox(root, 0.36, 0.06, 0.36, 0x2e86de, tx + sx, 0.45, 7.4);
      addBox(root, 0.06, 0.42, 0.06, 0x1b4f8a, tx + sx, 0.22, 7.4);
    }
    colBox(tx, 7.4, 1.6, 0.7, 1);
  }

  /* ---------- Dönerci dükkânı ---------- */
  const shop = buildShop();

  function buildShop() {
    const g = new THREE.Group();
    root.add(g);
    const ZF = -8.6, ZB = -15.6, H = 4.2;
    const depth = ZF - ZB;
    const cz = (ZF + ZB) / 2;
    const wall = 0xf6efe0;
    const steel = 0xc9d1d8;

    addBox(g, 6.4, 0.1, depth, 0xe9e2d0, 0, 0.05, cz, false);
    addBox(g, 6.4, H, 0.3, wall, 0, H / 2, ZB + 0.15);
    addBox(g, 0.3, H, depth, wall, -3.05, H / 2, cz);
    addBox(g, 0.3, H, depth, wall, 3.05, H / 2, cz);
    // İznik çinisi şeridi
    addBox(g, 5.8, 0.45, 0.05, 0x2b6cb0, 0, 1.5, ZB + 0.33, false);
    for (let i = 0; i < 10; i++) addBox(g, 0.2, 0.2, 0.06, 0xffffff, -2.6 + i * 0.58, 1.5, ZB + 0.34, false);
    addBox(g, 6.8, 0.35, depth + 0.6, 0x8c2f1c, 0, H + 0.17, cz + 0.3);
    addBox(g, 6.4, 1.1, 0.3, 0xb0201c, 0, H - 0.55, ZF - 0.05);

    // Tabela
    const signTex = canvasTexture(1024, 170, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#e63946');
      grd.addColorStop(1, '#9d0208');
      c.fillStyle = grd;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffd166';
      c.lineWidth = 10;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#ffd166';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '92px "Bungee", Impact, "Arial Black", sans-serif';
      c.shadowColor = 'rgba(0,0,0,.5)';
      c.shadowOffsetY = 6;
      c.fillText('EŞEK DÖNERCİSİ', w / 2, h / 2 - 6);
      c.font = 'bold 26px "Nunito", sans-serif';
      c.shadowOffsetY = 2;
      c.fillStyle = '#fff';
      c.fillText('★ 1987\'DEN BERİ ★ ODUN ATEŞİNDE ★', w / 2, h - 30);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.0), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
    sign.position.set(0, H - 0.55, ZF + 0.11);
    g.add(sign);

    // Çizgili tente
    const awning = new THREE.Group();
    awning.position.set(0, H - 1.15, ZF + 0.12);
    awning.rotation.x = 0.35;
    g.add(awning);
    for (let i = 0; i < 8; i++) addBox(awning, 0.8, 0.06, 1.5, i % 2 ? 0xffffff : 0xd62828, -2.8 + i * 0.8, 0, 0.75);
    for (let i = 0; i < 16; i++) addBox(awning, 0.32, 0.18, 0.05, i % 2 ? 0xd62828 : 0xffffff, -3 + i * 0.4, -0.1, 1.5, false);

    // Tezgah
    addBox(g, 3.6, 1.0, 0.7, 0xdfe3e6, 0, 0.5, -9.1);
    addBox(g, 3.6, 0.12, 0.05, 0xc1121f, 0, 0.72, -8.73, false);
    addBox(g, 3.8, 0.08, 0.9, 0xb8c0c8, 0, 1.04, -9.1);
    addBox(g, 1.4, 0.4, 0.5, mat(0xbfe6ff, { transparent: true, opacity: 0.35 }), -1.0, 1.28, -9.05, false);
    const salads = [0x2a9d3f, 0xe63946, 0xf1f1e6, 0x7a1f5c];
    salads.forEach((c, i) => addMesh(g, new THREE.CylinderGeometry(0.13, 0.11, 0.1, 8), c, -1.45 + i * 0.3, 1.13, -9.05, false));
    // Ayran şişeleri
    for (let i = 0; i < 4; i++) addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), 0xffffff, 1.0 + i * 0.17, 1.19, -9.2, false);

    // Döner şişi + ocak
    const spitPos = new THREE.Vector3(0, 0, -11.4);
    addBox(g, 1.2, 1.0, 1.0, 0x9aa3ab, 0, 0.5, -11.4);
    addBox(g, 1.5, 2.1, 0.18, 0x3a3a3a, 0, 2.0, -12.15);
    const glow = mat(0xff7a1a, { emissive: 0xff4400 });
    for (let i = 0; i < 5; i++) addBox(g, 1.15, 0.1, 0.05, glow, 0, 1.25 + i * 0.36, -12.04, false);

    const spit = new THREE.Group();
    spit.position.copy(spitPos);
    g.add(spit);
    addMesh(spit, new THREE.CylinderGeometry(0.035, 0.035, 2.7, 6), 0xcfd6dc, 0, 2.2, 0);
    addMesh(spit, new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), steel, 0, 1.06, 0);
    addMesh(spit, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), steel, 0, 2.63, 0);
    const meatMat = new THREE.MeshLambertMaterial({ map: meatTexture(), flatShading: true });
    const meat = addMesh(spit, new THREE.CylinderGeometry(0.5, 0.32, 1.5, 14, 4), meatMat, 0, 1.85, 0);

    // Tepsi destek tezgahı, tepsi, kesme tahtası
    addBox(g, 2.4, 1.0, 0.55, 0xb0b8c0, 0, 0.5, -10.62);
    addBox(g, 0.95, 0.05, 0.5, steel, -0.25, 1.025, -10.62);
    addBox(g, 0.95, 0.08, 0.04, steel, -0.25, 1.07, -10.38, false);
    addBox(g, 0.7, 0.05, 0.45, 0xc28e5c, 0.75, 1.025, -10.62);

    // Menü panosu
    const menuTex = canvasTexture(512, 340, (c, w, h) => {
      c.fillStyle = '#1f2a1f';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c28e5c';
      c.lineWidth = 14;
      c.strokeRect(7, 7, w - 14, h - 14);
      c.fillStyle = '#ffd166';
      c.font = '54px "Bungee", Impact, sans-serif';
      c.textAlign = 'center';
      c.fillText('MENÜ', w / 2, 74);
      c.font = 'bold 34px "Nunito", sans-serif';
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      const rows = [['Ekmek Arası', '90 ₺'], ['Dürüm', '110 ₺'], ['Dilim başı', '+15 ₺'], ['Ayran', '25 ₺']];
      rows.forEach(([a, b], i) => {
        c.fillText(a, 40, 136 + i * 52);
        c.textAlign = 'right';
        c.fillText(b, w - 40, 136 + i * 52);
        c.textAlign = 'left';
      });
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.46), new THREE.MeshBasicMaterial({ map: menuTex, toneMapped: false }));
    board.position.set(-1.5, 2.75, ZB + 0.31);
    g.add(board);

    // Buzdolabı
    addBox(g, 0.9, 2.0, 0.7, 0xe8eef2, 2.3, 1.0, -14.9);
    addBox(g, 0.7, 1.5, 0.04, mat(0x9fd8ff, { transparent: true, opacity: 0.5 }), 2.3, 1.15, -14.53, false);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.25, 6), i % 2 ? 0xffffff : 0x8fd14f, 2.08 + i * 0.22, 0.6 + r * 0.5, -14.75, false);

    // Çatıdaki bayrak
    makeFlag(2.6, H + 0.35, -9.2, 0);

    col(-3.2, -2.9, ZB, ZF, H);
    col(2.9, 3.2, ZB, ZF, H);
    col(-3.2, 3.2, ZB, ZB + 0.3, H);
    col(-1.8, 1.8, -9.45, -8.75, 1.1);
    col(-1.2, 1.2, -12.3, -10.35, 2.8);

    return {
      spit,
      meat,
      spitPos,
      meatTopY: 2.55,
      meatBottomY: 1.15,
      meatBottomR: 0.32,
      meatTopR: 0.5,
      meatCenterY: 1.85,
      trayPos: new THREE.Vector3(-0.25, 1.06, -10.62),
      itemSpot: new THREE.Vector3(0.75, 1.1, -10.62),
      interactPoint: new THREE.Vector3(2.5, 0, -7.4),
      exitPoint: new THREE.Vector3(2.5, 0, -6.4),
      vendorPos: new THREE.Vector3(0, 0, -10.0),
      cutCamPos: new THREE.Vector3(0, 2.3, -8.35),
      cutLookAt: new THREE.Vector3(0, 1.65, -11.0),
      queueSlots: [0, -1.3, -2.6, -3.9].map((x) => new THREE.Vector3(x, 0, -7.9)),
      queueLaneZ: -6.2,
    };
  }

  /* ---------- Camii ---------- */
  buildMosque(-30, 24);

  function crescent(parent, x, y, z, scale = 1) {
    const gold = mat(0xf2c037, { emissive: 0x4a3300 });
    const m = addMesh(parent, new THREE.TorusGeometry(0.28 * scale, 0.06 * scale, 6, 14, Math.PI * 1.4), gold, x, y, z, false);
    m.rotation.z = -1.2 * Math.PI;
    return m;
  }

  function alem(parent, x, y, z, scale = 1) {
    const gold = mat(0xf2c037, { emissive: 0x4a3300 });
    addMesh(parent, new THREE.CylinderGeometry(0.06 * scale, 0.1 * scale, 0.9 * scale, 6), gold, x, y + 0.45 * scale, z, false);
    addMesh(parent, new THREE.SphereGeometry(0.16 * scale, 8, 6), gold, x, y + 0.95 * scale, z, false);
    crescent(parent, x, y + 1.45 * scale, z, scale);
  }

  function dome(parent, r, x, y, z, color = 0x8aa0b4) {
    return addMesh(parent, new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), color, x, y, z);
  }

  function minaret(parent, x, z) {
    const stone = 0xf1ead8;
    const lead = 0x7d8b99;
    addBox(parent, 1.6, 2.5, 1.6, stone, x, 1.25, z);
    addMesh(parent, new THREE.CylinderGeometry(0.55, 0.62, 13, 10), stone, x, 9, z);
    for (let i = 0; i < 3; i++) addMesh(parent, new THREE.CylinderGeometry(0.64, 0.64, 0.12, 10), 0xd8cfb8, x, 4.5 + i * 3.5, z, false);
    addMesh(parent, new THREE.CylinderGeometry(0.98, 0.72, 0.45, 10), stone, x, 12.1, z);
    addMesh(parent, new THREE.CylinderGeometry(1.0, 1.0, 0.5, 10, 1, true), mat(0xd8cfb8, { side: THREE.DoubleSide }), x, 12.55, z, false);
    addMesh(parent, new THREE.CylinderGeometry(0.5, 0.55, 2.6, 10), stone, x, 13.6, z);
    addMesh(parent, new THREE.ConeGeometry(0.64, 3.4, 10), lead, x, 16.6, z);
    alem(parent, x, 18.2, z, 0.8);
    colBox(x, z, 1.6, 1.6, 20);
  }

  function buildMosque(mx, mz) {
    const g = new THREE.Group();
    root.add(g);
    const stone = 0xefe6d2;

    // Avlu zemini ve duvarlar
    flat(28, 29.4, 0xe2dccd, mx, 23.3, 0.025);
    const wallH = 1.1;
    addBox(g, 0.4, wallH, 29.4, 0xd5ccb6, mx - 14, wallH / 2, 23.3);
    addBox(g, 0.4, wallH, 29.4, 0xd5ccb6, mx + 14, wallH / 2, 23.3);
    addBox(g, 28, wallH, 0.4, 0xd5ccb6, mx, wallH / 2, 38);
    addBox(g, 9, wallH, 0.4, 0xd5ccb6, mx - 9.5, wallH / 2, 8.9);
    addBox(g, 9, wallH, 0.4, 0xd5ccb6, mx + 9.5, wallH / 2, 8.9);
    for (const gx of [mx - 5, mx + 5]) {
      addBox(g, 0.8, 2.6, 0.8, 0xd5ccb6, gx, 1.3, 8.9);
      addMesh(g, new THREE.ConeGeometry(0.55, 0.8, 4), 0x7d8b99, gx, 3.0, 8.9);
    }
    col(mx - 14.2, mx - 13.8, 8.6, 38, wallH);
    col(mx + 13.8, mx + 14.2, 8.6, 38, wallH);
    col(mx - 14, mx + 14, 37.8, 38.2, wallH);
    col(mx - 14, mx - 5, 8.7, 9.1, 3);
    col(mx + 5, mx + 14, 8.7, 9.1, 3);

    // Ana ibadet salonu
    addBox(g, 12, 7, 12, stone, mx, 3.5, mz);
    addBox(g, 12.3, 0.3, 12.3, 0xd8cfb8, mx, 7.1, mz, false);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const zz = mz - 4.5 + i * 3;
        addBox(g, 0.08, 1.6, 0.8, 0x2f4f6a, mx + side * 6.03, 3.2, zz, false);
        addMesh(g, new THREE.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x2f4f6a, mx + side * 6.03, 4.0, zz, false).scale.set(0.2, 1, 1);
      }
    }
    // Kasnak + ana kubbe
    addMesh(g, new THREE.CylinderGeometry(4.3, 4.3, 1.2, 16), stone, mx, 7.85, mz);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      addBox(g, 0.35, 0.6, 0.08, 0x2f4f6a, mx + Math.sin(a) * 4.31, 7.85, mz + Math.cos(a) * 4.31, false).rotation.y = a;
    }
    dome(g, 4.3, mx, 8.45, mz);
    alem(g, mx, 12.7, mz, 1.1);
    for (const [dx, dz] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) {
      addMesh(g, new THREE.CylinderGeometry(1.3, 1.3, 0.6, 12), stone, mx + dx, 7.5, mz + dz);
      dome(g, 1.3, mx + dx, 7.8, mz + dz);
    }

    // Revak (son cemaat yeri)
    const pz = mz - 7.5;
    addBox(g, 12, 4.6, 3, stone, mx, 2.3, pz);
    for (let i = 0; i < 5; i++) {
      const ax = mx - 4.8 + i * 2.4;
      const dark = i === 2 ? 0x5a3a22 : 0x6f8292;
      addBox(g, 1.4, 2.3, 0.1, dark, ax, 1.15, pz - 1.52, false);
      const half = new THREE.CylinderGeometry(0.7, 0.7, 0.1, 12, 1, false, Math.PI / 2, Math.PI);
      half.rotateX(Math.PI / 2);
      addMesh(g, half, dark, ax, 2.3, pz - 1.52, false);
    }
    for (const dx of [-4, 0, 4]) dome(g, 1.15, mx + dx, 4.6, pz, 0x8aa0b4);
    for (const dx of [-4, 0, 4]) alem(g, mx + dx, 5.7, pz, 0.45);

    minaret(g, mx - 6.9, mz - 6.8);
    minaret(g, mx + 6.9, mz - 6.8);

    // Şadırvan
    const sx = mx, sz = 12.6;
    addMesh(g, new THREE.CylinderGeometry(1.7, 1.9, 0.8, 8), 0xd8cfb8, sx, 0.4, sz);
    addMesh(g, new THREE.CylinderGeometry(1.5, 1.5, 0.05, 8), mat(0x4aa3df, { emissive: 0x0a2a44 }), sx, 0.82, sz, false);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      addMesh(g, new THREE.CylinderGeometry(0.1, 0.1, 2, 6), stone, sx + Math.sin(a) * 1.75, 1.8, sz + Math.cos(a) * 1.75);
    }
    addMesh(g, new THREE.CylinderGeometry(2.1, 2.1, 0.25, 8), 0xd8cfb8, sx, 2.9, sz);
    dome(g, 1.8, sx, 3.0, sz);
    alem(g, sx, 4.75, sz, 0.4);
    colBox(sx, sz, 3.8, 3.8, 5);

    // Servi ağaçları
    for (let i = 0; i < 5; i++) {
      cypress(mx - 12.5, 13 + i * 5.5);
      cypress(mx + 12.5, 13 + i * 5.5);
    }
    makeFlag(mx + 10, 0, 11, 0, true);

    colBox(mx, mz, 12, 12, 13);
    colBox(mx, pz, 12, 3, 6);
  }

  /* ---------- Park ---------- */
  const benches = [];
  buildPark(41, 20);

  function bench(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    addBox(g, 1.8, 0.08, 0.5, 0x9c6b3e, 0, 0.5, 0);
    addBox(g, 1.8, 0.4, 0.07, 0x9c6b3e, 0, 0.78, -0.24);
    for (const lx of [-0.75, 0.75]) {
      addBox(g, 0.08, 0.5, 0.45, 0x333333, lx, 0.25, 0);
      addBox(g, 0.08, 0.5, 0.06, 0x333333, lx, 0.72, -0.26);
    }
    const c = Math.abs(Math.sin(rot)) > 0.5;
    colBox(x, z, c ? 0.8 : 1.9, c ? 1.9 : 0.8, 1);
    benches.push({ x, z, rot });
  }

  function buildPark(px, pz) {
    flat(22, 22, 0x7fc35a, px, pz, 0.015);
    flat(2.4, 22, 0xd9c7a0, px, pz, 0.018);
    flat(22, 2.4, 0xd9c7a0, px, pz, 0.019);
    const g = new THREE.Group();
    root.add(g);
    addMesh(g, new THREE.CylinderGeometry(2.2, 2.4, 0.6, 10), 0xcfc6b8, px, 0.3, pz);
    addMesh(g, new THREE.CylinderGeometry(1.95, 1.95, 0.05, 10), mat(0x4aa3df, { emissive: 0x0a2a44 }), px, 0.62, pz, false);
    addMesh(g, new THREE.CylinderGeometry(0.25, 0.35, 1.4, 8), 0xcfc6b8, px, 1.0, pz);
    addMesh(g, new THREE.CylinderGeometry(0.8, 0.3, 0.3, 10), 0xcfc6b8, px, 1.8, pz);
    const water = addMesh(g, new THREE.ConeGeometry(0.35, 0.9, 6), mat(0x9fdcff, { transparent: true, opacity: 0.7, emissive: 0x113355 }), px, 2.3, pz, false);
    updaters.push((dt, t) => { water.scale.y = 1 + Math.sin(t * 6) * 0.15; });
    colBox(px, pz, 4.6, 4.6, 2);

    bench(px, pz - 6.4, Math.PI);
    bench(px, pz + 6.4, Math.PI);
    bench(px - 6.4, pz, Math.PI / 2);
    bench(px + 6.4, pz, -Math.PI / 2);

    for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [-4, -9], [4, 9], [9, -3], [-9, 3]]) tree(px + dx, pz + dz, 0.9 + rand() * 0.4);
  }

  /* ---------- Ağaçlar, lambalar, süsler ---------- */
  function tree(x, z, s = 1) {
    addMesh(root, new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 6), 0x7a5230, x, 0.8 * s, z);
    const greens = [0x4f9a3c, 0x5fae47, 0x3f8a33];
    addMesh(root, new THREE.IcosahedronGeometry(1.25 * s, 0), greens[Math.floor(rand() * 3)], x, 2.3 * s, z);
    addMesh(root, new THREE.IcosahedronGeometry(0.85 * s, 0), greens[Math.floor(rand() * 3)], x + 0.4 * s, 3.1 * s, z - 0.2 * s);
    colBox(x, z, 0.5, 0.5, 3);
  }

  function cypress(x, z) {
    addMesh(root, new THREE.CylinderGeometry(0.12, 0.15, 0.8, 5), 0x6b4a2b, x, 0.4, z);
    addMesh(root, new THREE.ConeGeometry(0.75, 5.2, 7), 0x2f6b3a, x, 3.2, z);
    colBox(x, z, 0.6, 0.6, 5);
  }

  function lamp(x, z) {
    addMesh(root, new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6), 0x2b2b33, x, 2.1, z);
    const dir = z > 0 ? -1 : 1;
    addBox(root, 0.08, 0.08, 0.9, 0x2b2b33, x, 4.15, z + dir * 0.4, false);
    addBox(root, 0.36, 0.22, 0.36, mat(0xfff1b8, { emissive: 0x7a6420 }), x, 4.0, z + dir * 0.8, false);
    colBox(x, z, 0.3, 0.3, 4);
  }

  for (let x = -62; x <= 66; x += 12) {
    if (x > 12 && x < 32) continue;
    if (Math.abs(x + 14) > 3 && Math.abs(x) > 5) lamp(x, -5.45); // dükkân ve bakkal önünü boş bırak
    lamp(x + 6, 5.45);
  }
  for (let z = 14; z <= 66; z += 9) {
    tree(16.2, z, 0.85);
    tree(27.8, z + 4, 0.85);
    tree(16.2, -z, 0.85);
    tree(27.8, -z - 4, 0.85);
  }
  // Uzak ağaçlar (binaların arkası)
  for (let i = 0; i < 70; i++) {
    const x = -68 + rand() * 136;
    const z = (rand() < 0.5 ? -1 : 1) * (22 + rand() * 45);
    if (x > 13 && x < 31) continue;
    if (x > -46 && x < -14 && z > 0 && z < 40) continue;
    if (x > 28 && x < 54 && z > 6 && z < 33) continue;
    tree(x, z, 0.8 + rand() * 0.6);
  }

  // Sokak süs bayrakları
  const buntColors = [0xe63946, 0xffffff, 0xffcf3f, 0x2a9d8f];
  const flagGeo = new THREE.ConeGeometry(0.2, 0.42, 3);
  flagGeo.rotateX(Math.PI);
  for (const bx of [-24, -6, 40, 58]) {
    let i = 0;
    for (let z = -7.6; z <= 7.6; z += 0.8) {
      const y = 6.2 - 0.9 * (1 - (z / 7.6) ** 2);
      addMesh(root, flagGeo, buntColors[i++ % buntColors.length], bx, y, z, false);
    }
  }

  // Dalgalanan Türk bayrakları
  function makeFlag(x, y, z, rotY, tallPole = false) {
    const poleH = tallPole ? 6 : 2.4;
    addMesh(root, new THREE.CylinderGeometry(0.05, 0.06, poleH, 6), 0xdddddd, x, y + poleH / 2, z);
    addMesh(root, new THREE.SphereGeometry(0.1, 6, 4), mat(0xf2c037, { emissive: 0x4a3300 }), x, y + poleH + 0.05, z, false);
    const geo = new THREE.PlaneGeometry(1.8, 1.2, 12, 6);
    geo.translate(0.9, 0, 0);
    const base = geo.attributes.position.array.slice();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: turkishFlagTexture(), side: THREE.DoubleSide, flatShading: true }));
    m.position.set(x + 0.05, y + poleH - 0.7, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    root.add(m);
    const phase = rand() * 10;
    updaters.push((dt, t) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3];
        p.array[i * 3 + 2] = Math.sin(bx * 3.2 - t * 5 + phase) * 0.14 * (bx / 1.8);
      }
      p.needsUpdate = true;
    });
  }
  makeFlag(-14 + 2.2, 6.8, -9.2, 0);

  // Uzak tepeler
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 115 + rand() * 30;
    const h = 14 + rand() * 22;
    addMesh(root, new THREE.ConeGeometry(18 + rand() * 14, h, 6), rand() < 0.5 ? 0x6e9f4a : 0x5b8a3e, Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, false);
  }

  // Bulutlar
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = 2 + rand() * 2.5;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat(0xffffff, { emissive: 0x333333 }));
      m.position.set(k * 2.6 - n, rand() * 1.2, rand() * 2);
      c.add(m);
    }
    c.position.set(-120 + rand() * 240, 38 + rand() * 12, -90 + rand() * 180);
    c.userData.speed = 1 + rand() * 1.5;
    root.add(c);
    clouds.push(c);
  }
  updaters.push((dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 130) c.position.x = -130;
    }
  });

  /* ---------- NPC noktaları ---------- */
  const loop = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    loop.push([41 + Math.cos(a) * 4.2, 20 + Math.sin(a) * 4.2]);
  }
  const spots = {
    imam: { x: -26.5, z: 10.8, rot: Math.PI },
    bakkal: { x: -14, z: -7.7, rot: 0 },
    cayci: { x: 11.9, z: 7.5, rot: Math.PI },
    muhtar: benches[0],
    fatma: [[-12, 6.5], [5.5, 6.5]],
    john: [[31, -6.6], [64, -6.6]],
    emre: loop,
  };

  return {
    colliders,
    heightAt,
    shop,
    spots,
    benches,
    donkeySpawn: { x: 7, z: -3.6, heading: Math.PI / 2 },
    playerSpawn: new THREE.Vector3(3.6, 0, -5.6),
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}
