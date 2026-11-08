// =========================================================
// city.js — Kasaba: yol ağı, camii, binalar, mahalle evleri, pazar, saat kulesi,
// park, dönerci dükkânı (kepenkli) ve gece ışıkları.
// Tüm modeller Three.js ilkel geometrileriyle üretilir; sabit parçalar performans
// için malzeme başına tek bir geometride birleştirilir.
// =========================================================
import * as THREE from 'three';

export const WORLD_BOUND = 104;

/* ---------------- Ortak yardımcılar ---------------- */
const matCache = new Map();

/** Renk başına önbelleklenmiş fiziksel tabanlı (PBR) malzeme. */
export function mat(color, extra = {}) {
  const key = color + '|' + JSON.stringify(extra);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
    matCache.set(key, m);
  }
  return m;
}

/* ---------------- Yüzey detay shader'ları (doku dosyası yok, dünya koordinatından) ---------------- */
const DETAIL_GLSL = `
varying vec3 vDWorld;
varying vec3 vDNormal;
float dHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float dNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = dHash(i), b = dHash(i + vec2(1.0, 0.0)), c = dHash(i + vec2(0.0, 1.0)), d = dHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float dFbm(vec2 p) { return dNoise(p) * 0.6 + dNoise(p * 2.7) * 0.3 + dNoise(p * 7.3) * 0.1; }
`;
const DETAIL_CODE = {
  // Sıva/boya: hafif renk dalgası, ince gren, duvar diplerinde kir/gölge (sahte AO)
  surface: `{
    vec3 wp = vDWorld; vec3 an = abs(vDNormal);
    vec2 q = an.y > 0.5 ? wp.xz : (an.x > an.z ? wp.zy : wp.xy);
    float n = dFbm(q * 1.3);
    float g = dNoise(q * 11.0);
    diffuseColor.rgb *= 0.87 + 0.2 * n + 0.07 * (g - 0.5);
    if (an.y < 0.5) {
      diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 1.2, wp.y));
      diffuseColor.rgb *= 1.0 - 0.07 * smoothstep(0.55, 0.9, dNoise(vec2(q.x * 3.0, q.y * 0.35)));
    }
  }`,
  // Asfalt: iri ve ince gren, yama izleri, çatlaklar
  asphalt: `{
    vec2 p = vDWorld.xz;
    float n = dFbm(p * 0.35);
    float g = dHash(floor(p * 45.0));
    diffuseColor.rgb *= 0.8 + 0.26 * n + 0.14 * (g - 0.5);
    float crack = (1.0 - smoothstep(0.0, 0.006, abs(dNoise(p * 1.3) - 0.5))) * step(0.74, dNoise(p * 0.17));
    diffuseColor.rgb *= 1.0 - 0.22 * crack;
    diffuseColor.rgb *= 1.0 - 0.12 * smoothstep(0.6, 0.8, dNoise(p * 0.12 + 7.0));
  }`,
  // Kaldırım taşı: şaşırtmalı 50 cm taşlar, derzler, taş başına ton farkı
  paving: `{
    vec2 p = vDWorld.xz / 0.5;
    p.x += step(1.0, mod(floor(p.y), 2.0)) * 0.5;
    vec2 f = fract(p); vec2 id = floor(p);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float line = 1.0 - smoothstep(0.02, 0.07, edge);
    diffuseColor.rgb *= (0.88 + 0.18 * dHash(id)) * (1.0 - 0.38 * line) * (0.93 + 0.09 * dNoise(vDWorld.xz * 3.0));
  }`,
  // Çim: geniş lekeler + ince doku, iki yeşil tonu arasında
  grass: `{
    vec2 p = vDWorld.xz;
    float n = dFbm(p * 0.07);
    float m = dFbm(p * 0.8);
    float g = dHash(floor(p * 30.0));
    vec3 a = diffuseColor.rgb * vec3(0.78, 0.98, 0.7);
    vec3 b = diffuseColor.rgb * vec3(1.18, 1.1, 0.78);
    diffuseColor.rgb = mix(a, b, n) * (0.84 + 0.26 * m + 0.12 * (g - 0.5));
  }`,
};

/** Malzemeye dünya koordinatlı yüzey detayı ekle (asfalt, kaldırım, çim, sıva). */
export function applyDetail(material, kind) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vDWorld;\nvarying vec3 vDNormal;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vDNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DETAIL_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL_CODE[kind]);
  };
  material.customProgramCacheKey = () => 'detail-' + kind;
  material.userData.keep = true;
  return material;
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
export function resolveCircle(pos, r, colliders, bound = WORLD_BOUND) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.off) continue;
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
      const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) pos.x = c.minX - r;
      else if (m === rr) pos.x = c.maxX + r;
      else if (m === t) pos.z = c.minZ - r;
      else pos.z = c.maxZ + r;
    }
  }
  if (bound) {
    if (pos.x < -bound) { pos.x = -bound; hit = true; }
    if (pos.x > bound) { pos.x = bound; hit = true; }
    if (pos.z < -bound) { pos.z = -bound; hit = true; }
    if (pos.z > bound) { pos.z = bound; hit = true; }
  }
  return hit;
}

/** Nokta bir engelin (bina, duvar) içinde mi? Kamera çarpışması için. */
export function pointBlocked(p, colliders, margin = 0.25) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.off) continue;
    if (p.y < c.h && p.x > c.minX - margin && p.x < c.maxX + margin && p.z > c.minZ - margin && p.z < c.maxZ + margin) return true;
  }
  return false;
}

function signTexture(text, bg, fg, w = 512, h = 112) {
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
    const font = (s) => `${s}px "Bungee", Impact, "Arial Black", sans-serif`;
    g.font = font(size);
    while (g.measureText(text).width > w - 40 && size > 10) g.font = font((size -= 2));
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

let flagTex = null;
function turkishFlagTexture() {
  if (flagTex) return flagTex;
  flagTex = canvasTexture(300, 200, (g, w, h) => {
    g.fillStyle = '#E30A17';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(112, 100, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E30A17';
    g.beginPath(); g.arc(125, 100, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    drawStar(g, 180, 100, 25, 10, Math.PI);
  });
  return flagTex;
}

function meatTexture() {
  // Nötr, katman katman üst üste dizilmiş et yaprakları; rengi pişme derecesi (malzeme rengi) verir
  return canvasTexture(256, 512, (g, w, h) => {
    const r = rng(7);
    let y = 0;
    while (y < h) {
      const th = 5 + Math.floor(r() * 9);
      const v = 200 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${v},${v - 8},${v - 16})`;
      g.fillRect(0, y, w, th);
      // katman arası koyu derz (yağ çekmiş kenar)
      g.fillStyle = 'rgba(70,40,25,.45)';
      g.fillRect(0, y + th - 1, w, 1.5);
      y += th;
    }
    // yağ damarları ve kızarmış kenarlar
    for (let i = 0; i < 260; i++) {
      const fat = r() < 0.45;
      g.fillStyle = fat ? 'rgba(255,245,225,.55)' : 'rgba(60,30,15,.35)';
      g.beginPath();
      g.ellipse(r() * w, r() * h, 3 + r() * 14, 1 + r() * 2.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '40,20,10' : '255,240,220'},${0.08 + r() * 0.15})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  });
}

/* ---------------- Geometri birleştirme (performans) ---------------- */
// Düz renkli Lambert malzemeler köşe rengine (vertex color) çevrilip tek malzemede birleşir.
const bakedMat = applyDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), 'surface');
// Hareketli modeller (karakter, eşek) için: dünya koordinatlı desen kaymasın diye detaysız
const charMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });

export function canBake(m) {
  return (
    m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial) && !m.map && !m.transparent && !m.vertexColors && !m.userData.keep &&
    m.side === THREE.FrontSide && m.emissive.r + m.emissive.g + m.emissive.b === 0 &&
    (m.metalness ?? 0) === 0 && (m.roughness ?? 0.85) >= 0.7
  );
}

function prepGeo(geo, matrix, color) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  if (color) {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return g;
}

function concatGeos(geos, withColor) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const names = ['position', 'normal', 'uv'].concat(withColor ? ['color'] : []);
  const sizes = { position: 3, normal: 3, uv: 2, color: 3 };
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const arr = new Float32Array(count * sizes[name]);
    let off = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, off * sizes[name]);
      off += g.attributes.position.count;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, sizes[name]));
  }
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/**
 * Karakter/eşek gibi hareketli modellerde: her grubun doğrudan alt meshlerini tek meshe indirger.
 * Gruplar (bacak, kol, kafa pivotları) korunur, yani animasyonlar bozulmaz.
 */
export function bakeHierarchy(obj) {
  const meshes = obj.children.filter((c) => c.isMesh && c.children.length === 0 && canBake(c.material));
  if (meshes.length > 1) {
    const geos = meshes.map((m) => {
      m.updateMatrix();
      return prepGeo(m.geometry, m.matrix, m.material.color);
    });
    const merged = new THREE.Mesh(concatGeos(geos, true), charMat);
    merged.geometry.userData.owned = true;
    merged.castShadow = meshes.some((m) => m.castShadow);
    merged.receiveShadow = true;
    for (const m of meshes) obj.remove(m);
    obj.add(merged);
  }
  for (const c of [...obj.children]) if (!c.isMesh && !c.isSprite) bakeHierarchy(c);
  return obj;
}

/** Sabit (hareketsiz) meshleri birleştir → çok daha az draw call. */
function mergeStatic(root, chunk = 110) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  const tmp = new THREE.Vector3();
  const visit = (o) => {
    if (o.userData.dynamic) return;
    if (o.isMesh && !o.isInstancedMesh && o.geometry.attributes.uv && o.geometry.attributes.normal) {
      tmp.setFromMatrixPosition(o.matrixWorld);
      const bake = canBake(o.material);
      const cx = Math.floor((tmp.x + chunk) / (chunk * 2));
      const cz = Math.floor((tmp.z + chunk) / (chunk * 2));
      const key = `${bake ? 'baked' : o.material.uuid}|${o.castShadow ? 1 : 0}|${cx}|${cz}`;
      let b = buckets.get(key);
      if (!b) {
        b = { material: bake ? bakedMat : o.material, bake, cast: o.castShadow, geos: [] };
        buckets.set(key, b);
      }
      b.geos.push(prepGeo(o.geometry, o.matrixWorld, bake ? o.material.color : null));
      remove.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  for (const o of remove) o.parent.remove(o);
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(concatGeos(b.geos, b.bake), b.material);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    root.add(m);
  }
  return buckets.size;
}

/* =========================================================
   Yol ağı
   ========================================================= */
const EXT = 110;
export const H_ROADS = [
  { z: 0, hw: 5, sw: 3.6 },     // Ana cadde (dükkân burada)
  { z: -38, hw: 4, sw: 3 },     // Gül Sokak (mahalle, ev)
  { z: 48, hw: 4, sw: 3 },      // Pazar Caddesi
];
export const V_ROADS = [
  { x: -55, hw: 4, sw: 3 },
  { x: 22, hw: 4.5, sw: 2.5 },
  { x: 80, hw: 4, sw: 3 },
];

/** Dikey yolların arasında kalan, bina dizilebilecek X aralıkları. */
function xRanges(from = -EXT + 6, to = EXT - 6) {
  const out = [];
  let cur = from;
  for (const v of [...V_ROADS].sort((a, b) => a.x - b.x)) {
    const a = v.x - v.hw - v.sw - 0.4;
    const b = v.x + v.hw + v.sw + 0.4;
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < to) out.push([cur, to]);
  return out;
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
  const walkRects = [];   // kaldırımlar (yükseklik için)
  const busyRects = [];   // yol + kaldırım + özel alanlar (ağaç yerleşimi için)
  const lampHeads = [];

  const col = (minX, maxX, minZ, maxZ, h = 10) => {
    const c = { minX, maxX, minZ, maxZ, h };
    colliders.push(c);
    return c;
  };
  const colBox = (cx, cz, w, d, h = 10) => col(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);
  const busy = (x0, x1, z0, z1) => busyRects.push({ x0, x1, z0, z1 });

  const flat = (w, d, color, x, z, y = 0.02) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof color === 'number' ? mat(color) : color);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // Gece ışıkları için özel malzemeler
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0x7a6420, roughness: 0.4 });
  const glassLit = new THREE.MeshStandardMaterial({ color: 0x2f4f6a, emissive: 0x000000, roughness: 0.08, metalness: 0.35 });
  lampMat.userData.keep = true;
  glassLit.userData.keep = true;
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x27415a, roughness: 0.08, metalness: 0.4 });
  glassDark.userData.keep = true;

  /* ---------- Zemin ve yollar ---------- */
  flat(700, 700, applyDetail(new THREE.MeshStandardMaterial({ color: 0x7fae55, roughness: 0.95 }), 'grass'), 0, 0, 0);
  const roadMat = applyDetail(new THREE.MeshStandardMaterial({ color: 0x4a4b52, roughness: 0.92 }), 'asphalt');
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.6 });
  lineMat.userData.keep = true;
  const walkMat = applyDetail(new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.9 }), 'paving');
  const curbMat = mat(0xa79f92);

  const sidewalk = (x0, x1, z0, z1) => {
    if (x1 - x0 < 0.2 || z1 - z0 < 0.2) return;
    walkRects.push({ x0, x1, z0, z1 });
    busy(x0, x1, z0, z1);
    addBox(root, x1 - x0, 0.12, z1 - z0, walkMat, (x0 + x1) / 2, 0.06, (z0 + z1) / 2, false);
  };

  for (const h of H_ROADS) {
    flat(EXT * 2, h.hw * 2, roadMat, 0, h.z, 0.02);
    busy(-EXT, EXT, h.z - h.hw, h.z + h.hw);
    for (let x = -EXT + 2; x < EXT; x += 4) {
      if (V_ROADS.some((v) => Math.abs(x - v.x) < v.hw + 1.6)) continue;
      flat(2, 0.25, lineMat, x, h.z, 0.03);
    }
    let cur = -EXT;
    const cuts = [...V_ROADS].sort((a, b) => a.x - b.x).map((v) => [v.x - v.hw, v.x + v.hw]);
    cuts.push([EXT, EXT]);
    for (const [a, b] of cuts) {
      sidewalk(cur, a, h.z - h.hw - h.sw, h.z - h.hw);
      sidewalk(cur, a, h.z + h.hw, h.z + h.hw + h.sw);
      if (a - cur > 1) {
        addBox(root, a - cur, 0.16, 0.18, curbMat, (cur + a) / 2, 0.08, h.z - h.hw - 0.05, false);
        addBox(root, a - cur, 0.16, 0.18, curbMat, (cur + a) / 2, 0.08, h.z + h.hw + 0.05, false);
      }
      cur = b;
    }
  }
  for (const v of V_ROADS) {
    flat(v.hw * 2, EXT * 2, roadMat, v.x, 0, 0.021);
    busy(v.x - v.hw, v.x + v.hw, -EXT, EXT);
    for (let z = -EXT + 2; z < EXT; z += 4) {
      if (H_ROADS.some((h) => Math.abs(z - h.z) < h.hw + 1.6)) continue;
      flat(0.25, 2, lineMat, v.x, z, 0.03);
    }
    let cur = -EXT;
    const cuts = [...H_ROADS].sort((a, b) => a.z - b.z).map((h) => [h.z - h.hw, h.z + h.hw]);
    cuts.push([EXT, EXT]);
    for (const [a, b] of cuts) {
      sidewalk(v.x - v.hw - v.sw, v.x - v.hw, cur, a);
      sidewalk(v.x + v.hw, v.x + v.hw + v.sw, cur, a);
      cur = b;
    }
  }
  // Yaya geçitleri
  const zebraX = (x, h) => { for (let z = h.z - h.hw + 0.8; z <= h.z + h.hw - 0.7; z += 1.05) flat(3, 0.55, lineMat, x, z, 0.031); };
  const zebraZ = (z, v) => { for (let x = v.x - v.hw + 0.8; x <= v.x + v.hw - 0.7; x += 1.05) flat(0.55, 3, lineMat, x, z, 0.031); };
  zebraX(9, H_ROADS[0]);
  zebraX(-30, H_ROADS[0]);
  zebraX(10, H_ROADS[1]);
  zebraX(0, H_ROADS[2]);
  zebraZ(-10.5, V_ROADS[1]);
  zebraZ(10.5, V_ROADS[1]);

  function heightAt(x, z) {
    for (let i = 0; i < walkRects.length; i++) {
      const r = walkRects[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return 0.12;
    }
    return 0;
  }

  /* ---------- Bina üretici ---------- */
  const WALLS = [0xf3e9d2, 0xe9c9a8, 0xf2d7d0, 0xcfe0e8, 0xf7f0e1, 0xe8d8a8, 0xd9e6c8, 0xf0c9a0, 0xe7d3ea];
  const ROOFS = [0xb5523b, 0xa8442f, 0xc4663f, 0x9c3d2a];
  const SIGN_COLORS = [['#1e6fb8', '#ffffff'], ['#7a2e12', '#ffd166'], ['#2a7a3b', '#ffffff'], ['#9d0208', '#ffd166'], ['#5a189a', '#ffffff'], ['#264653', '#e9c46a']];

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
    const glass = () => (rand() < 0.5 ? glassLit : glassDark);
    if (opt.house) {
      // Ev: ortada kapı, iki yanda pencere
      addBox(g, 1.1, 2.1, 0.1, opt.doorColor ?? 0x6b3e26, 0, 1.05, fz, false);
      addBox(g, 0.1, 0.1, 0.12, 0xf2c037, 0.35, 1.05, fz + 0.04, false);
      for (const s of [-1, 1]) {
        const x = s * Math.min(w / 2 - 0.9, w / 4 + 0.4);
        addBox(g, 1.15, 1.35, 0.06, 0xffffff, x, 1.55, fz, false);
        addBox(g, 0.95, 1.15, 0.08, glass(), x, 1.55, fz + 0.01, false);
        addBox(g, 1.2, 0.1, 0.25, 0xffffff, x, 0.9, fz + 0.1, false);
      }
    } else {
      const doorX = -w / 2 + 1.0;
      addBox(g, 1.1, 2.1, 0.1, 0x6b3e26, doorX, 1.05, fz, false);
      addBox(g, 0.1, 0.1, 0.12, 0xf2c037, doorX + 0.35, 1.05, fz + 0.04, false);
      if (w > 4.2) {
        const ww = w - 2.6;
        const wx = doorX + 0.75 + ww / 2 + 0.1;
        addBox(g, ww + 0.2, 1.7, 0.06, 0xffffff, wx, 1.45, fz, false);
        addBox(g, ww, 1.5, 0.08, glass(), wx, 1.45, fz + 0.01, false);
      }
    }
    if (opt.sign) {
      const [bg, fg] = opt.sign.colors ?? SIGN_COLORS[Math.floor(rand() * SIGN_COLORS.length)];
      const tex = signTexture(opt.sign.text, bg, fg);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.85, 5.2), 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      sm.position.set(0, opt.house ? 2.55 : 2.62, fz + 0.03);
      g.add(sm);
    }
    const n = Math.max(1, Math.floor((w - 0.6) / 1.8));
    const spacing = w / n;
    for (let f = 1; f < floors; f++) {
      const y = f * 3 + 1.5;
      const shutters = rand() < 0.35;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + spacing * (i + 0.5);
        addBox(g, 1.05, 1.45, 0.06, 0xffffff, x, y, fz, false);
        addBox(g, 0.85, 1.25, 0.08, glass(), x, y, fz + 0.01, false);
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
          const px = -bw / 2 + 0.4 + (k * (bw - 0.8)) / 2;
          addBox(g, 0.22, 0.22, 0.22, 0xa0522d, px, f * 3 + 0.9, fz + 0.62, false);
          addMesh(g, new THREE.IcosahedronGeometry(0.17, 0), rand() < 0.5 ? 0xe63946 : 0xff70a6, px, f * 3 + 1.1, fz + 0.62, false);
        }
      }
    }
    if (opt.pitched || (!opt.flatRoof && rand() < 0.62)) {
      const geo = new THREE.ConeGeometry(0.72, 1.7, 4);
      geo.rotateY(Math.PI / 4);
      const roof = addMesh(g, geo, opt.roofColor ?? ROOFS[Math.floor(rand() * ROOFS.length)], 0, h + 0.85, 0);
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

  /** Bir caddenin bir tarafına bina dizer. facing=+1: ön yüz +z'ye bakar. */
  function fillRow(x0, x1, zFront, facing, reserved = [], opts = {}) {
    const res = reserved.slice().sort((a, b) => a[0] - b[0]);
    const segs = [];
    let cur = x0;
    for (const [a, b] of res) {
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < x1) segs.push([cur, x1]);
    const signs = opts.signs ? [...opts.signs] : [];
    let idx = 0;
    for (const [s, e] of segs) {
      let x = s;
      while (e - x > 3) {
        let w = (opts.minW ?? 4.5) + rand() * 3.5;
        if (e - x - w < 3.5) w = e - x - 0.3;
        if (w < 3) break;
        const d = (opts.minD ?? 7) + rand() * 2;
        const floors = opts.floors ? opts.floors() : rand() < 0.2 ? 1 : rand() < 0.65 ? 2 : 3;
        const cz = zFront - (facing * d) / 2;
        const sign = signs.length && idx % 2 === 0 ? { text: signs.shift() } : null;
        building(x + w / 2, cz, w, d, floors, facing > 0 ? 0 : Math.PI, { sign });
        idx++;
        x += w + 0.3;
      }
    }
  }

  /** Bahçeli müstakil ev. Döndürür: kapı önündeki nokta. */
  function house(cx, zFront, facing, w, d, opt = {}) {
    const garden = 2.4;
    const zf = zFront - facing * garden;
    const cz = zf - (facing * d) / 2;
    building(cx, cz, w, d, opt.floors ?? (rand() < 0.5 ? 1 : 2), facing > 0 ? 0 : Math.PI, {
      house: true,
      pitched: true,
      color: opt.color,
      roofColor: opt.roofColor,
      doorColor: opt.doorColor,
      sign: opt.sign,
    });
    // Bahçe çimi ve çit
    const gz = zFront - (facing * garden) / 2;
    flat(w + 1.2, garden, 0x7fc35a, cx, gz, 0.025);
    const fenceMat = opt.fence ?? 0xffffff;
    const fx0 = cx - w / 2 - 0.6;
    const fx1 = cx + w / 2 + 0.6;
    const gateHalf = 0.75;
    const fenceSeg = (a, b) => {
      addBox(root, b - a, 0.08, 0.06, fenceMat, (a + b) / 2, 0.6, zFront, false);
      addBox(root, b - a, 0.08, 0.06, fenceMat, (a + b) / 2, 0.3, zFront, false);
      for (let x = a; x <= b + 0.01; x += 0.5) addBox(root, 0.08, 0.8, 0.08, fenceMat, x, 0.4, zFront, false);
      col(a, b, zFront - 0.08, zFront + 0.08, 0.9);
    };
    fenceSeg(fx0, cx - gateHalf);
    fenceSeg(cx + gateHalf, fx1);
    for (const fx of [fx0, fx1]) {
      const za = Math.min(zFront, zf);
      const zb = Math.max(zFront, zf);
      addBox(root, 0.06, 0.08, zb - za, fenceMat, fx, 0.6, (za + zb) / 2, false);
      col(fx - 0.08, fx + 0.08, za, zb, 0.9);
    }
    // Çiçekler + küçük ağaç
    for (const s of [-1, 1]) {
      const bx = cx + s * (w / 2 - 0.4);
      addBox(root, 1.0, 0.3, 0.5, 0x7a4a25, bx, 0.15, gz, false);
      for (let k = 0; k < 3; k++) addMesh(root, new THREE.IcosahedronGeometry(0.16, 0), [0xe63946, 0xffcf3f, 0xff70a6][k], bx - 0.3 + k * 0.3, 0.42, gz, false);
    }
    busy(fx0, fx1, Math.min(zFront, cz - d / 2), Math.max(zFront, cz + d / 2));
    return new THREE.Vector3(cx, 0, zf + facing * 0.9);
  }

  function houseRow(x0, x1, zFront, facing, reserved = []) {
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
      while (e - x > 8) {
        const plot = 9 + rand() * 2.5;
        if (x + plot > e) break;
        house(x + plot / 2, zFront, facing, plot - 3.2, 6 + rand() * 1.5);
        x += plot;
      }
    }
  }

  /* ---------- Caddeler boyunca yapılar ---------- */
  const ranges = xRanges();
  // Tabelasız sıradan binalar. Tabelalı (girilebilir) dükkânlar aşağıda TEK TEK yerleştirilir,
  // böylece her dükkândan kasabada yalnızca bir tane olur.
  const MAIN_N_RES = [[-27.2, -20.8], [-17.2, -10.8], [-3.8, 12.2], [31, 37], [39, 45]];
  const MAIN_S_RES = [[-46, -14], [-11.2, -4.8], [-2.6, 3.8], [6.6, 13.4], [29, 52.5], [53, 63], [64, 70]];
  for (const [a, b] of ranges) {
    fillRow(a, b, -8.8, 1, MAIN_N_RES);
    fillRow(a, b, 8.8, -1, MAIN_S_RES);
    // Gül Sokak: iki yanı bahçeli evler (oyuncunun evi x=10'da)
    houseRow(a, b, -30.8, -1, [[5.0, 15]]);
    houseRow(a, b, -45.2, 1);
    // Pazar Caddesi
    fillRow(a, b, 40.8, 1, [[-46, -14], [-13.5, 15]]);
    fillRow(a, b, 55.2, -1, [[-13.5, -6.5], [-3, 3]]);
  }

  /* ---------- Girilebilir dükkânlar (her biri tek) ---------- */
  const shops = [];
  function shopBuilding(id, text, colors, cx, zFront, facing, w, d, floors, extra = {}) {
    const cz = zFront - (facing * d) / 2;
    building(cx, cz, w, d, floors, facing > 0 ? 0 : Math.PI, { sign: { text, colors }, ...extra });
    const door = facing > 0 ? new THREE.Vector3(cx - w / 2 + 1.0, 0, zFront + 0.9) : new THREE.Vector3(cx + w / 2 - 1.0, 0, zFront - 0.9);
    // Kapı üstü küçük lamba (gece yanar)
    const lx = door.x;
    const lz = zFront + facing * 0.12;
    addBox(root, 0.28, 0.22, 0.28, lampMat, lx, 2.35, lz, false);
    lampHeads.push(new THREE.Vector3(lx, 2.3, lz + facing * 0.2));
    shops.push({ id, name: text, door });
  }
  shopBuilding('firin', 'FIRIN', ['#7a2e12', '#ffd166'], -24, -8.8, 1, 6, 7, 2);
  // Eşek Kıraathanesi'nin arsası (bina kiraathane.js'te kurulur)
  busy(-3.8, 12.2, -21.2, -8.6);
  shopBuilding('bakkal', 'BAKKAL NURİ', ['#1e6fb8', '#ffffff'], -14, -8.8, 1, 6, 7, 2, { color: 0xf7f0e1, flatRoof: true });
  shopBuilding('eczane', 'ECZANE', ['#c1121f', '#ffffff'], 34, -8.8, 1, 6, 7, 2);
  shopBuilding('nalbur', 'NALBUR', ['#264653', '#e9c46a'], 42, -8.8, 1, 6, 7, 2);
  shopBuilding('manav', 'MANAV', ['#2a7a3b', '#ffffff'], -8, 8.8, -1, 6, 7, 1);
  shopBuilding('lokanta', 'LOKANTA', ['#5a189a', '#ffffff'], 0.6, 8.8, -1, 6, 7, 2);
  shopBuilding('cay', 'TOPTAN ÇAY', ['#2a7a3b', '#ffffff'], 10, 8.8, -1, 6.4, 6.4, 1, { color: 0xf0c9a0, flatRoof: true });
  shopBuilding('tatlici', 'TATLICI', ['#ff70a6', '#ffffff'], 67, 8.8, -1, 6, 7, 2);
  shopBuilding('hamam', 'HAMAM', ['#2a6f97', '#ffffff'], -10, 55.2, -1, 7, 7, 1);
  shopBuilding('berber', 'BERBER', ['#e63946', '#ffffff'], 0, 55.2, -1, 6, 7, 2);
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

  /* ---------- Oyuncunun evi ---------- */
  const homeDoor = house(10, -30.8, -1, 7, 6, {
    floors: 2,
    color: 0xcfe6f2,
    roofColor: 0x8c2f1c,
    doorColor: 0x1d3557,
    fence: 0x8b5a2b,
    sign: { text: "USTA'NIN EVİ", colors: ['#1d3557', '#ffd166'] },
  });
  // Posta kutusu + kapı lambası
  addBox(root, 0.1, 1.0, 0.1, 0x333333, 12.2, 0.5, -30.4);
  addBox(root, 0.35, 0.3, 0.5, 0xd62828, 12.2, 1.1, -30.4);
  addBox(root, 0.3, 0.3, 0.3, lampMat, 10.9, 2.3, -28.55, false);
  lampHeads.push(new THREE.Vector3(10.9, 2.3, -28.75));


  /* ---------- Camii ---------- */
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
    addBox(parent, 1.6, 2.5, 1.6, stone, x, 1.25, z);
    addMesh(parent, new THREE.CylinderGeometry(0.55, 0.62, 13, 10), stone, x, 9, z);
    for (let i = 0; i < 3; i++) addMesh(parent, new THREE.CylinderGeometry(0.64, 0.64, 0.12, 10), 0xd8cfb8, x, 4.5 + i * 3.5, z, false);
    addMesh(parent, new THREE.CylinderGeometry(0.98, 0.72, 0.45, 10), stone, x, 12.1, z);
    addMesh(parent, new THREE.CylinderGeometry(1.0, 1.0, 0.5, 10, 1, true), mat(0xd8cfb8, { side: THREE.DoubleSide }), x, 12.55, z, false);
    addMesh(parent, new THREE.CylinderGeometry(0.5, 0.55, 2.6, 10), stone, x, 13.6, z);
    addMesh(parent, new THREE.ConeGeometry(0.64, 3.4, 10), 0x7d8b99, x, 16.6, z);
    addBox(parent, 0.4, 0.4, 0.4, lampMat, x, 12.95, z, false);
    lampHeads.push(new THREE.Vector3(x, 12.95, z));
    alem(parent, x, 18.2, z, 0.8);
    colBox(x, z, 1.6, 1.6, 20);
  }

  buildMosque(-30, 24);
  function buildMosque(mx, mz) {
    const g = new THREE.Group();
    root.add(g);
    const stone = 0xefe6d2;
    flat(28, 29.4, 0xe2dccd, mx, 23.3, 0.025);
    busy(mx - 14.5, mx + 14.5, 8.6, 38.5);
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

    addBox(g, 12, 7, 12, stone, mx, 3.5, mz);
    addBox(g, 12.3, 0.3, 12.3, 0xd8cfb8, mx, 7.1, mz, false);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const zz = mz - 4.5 + i * 3;
        addBox(g, 0.08, 1.6, 0.8, glassLit, mx + side * 6.03, 3.2, zz, false);
      }
    }
    addMesh(g, new THREE.CylinderGeometry(4.3, 4.3, 1.2, 16), stone, mx, 7.85, mz);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      addBox(g, 0.35, 0.6, 0.08, glassLit, mx + Math.sin(a) * 4.31, 7.85, mz + Math.cos(a) * 4.31, false).rotation.y = a;
    }
    dome(g, 4.3, mx, 8.45, mz);
    alem(g, mx, 12.7, mz, 1.1);
    for (const [dx, dz] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) {
      addMesh(g, new THREE.CylinderGeometry(1.3, 1.3, 0.6, 12), stone, mx + dx, 7.5, mz + dz);
      dome(g, 1.3, mx + dx, 7.8, mz + dz);
    }
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
    for (const dx of [-4, 0, 4]) dome(g, 1.15, mx + dx, 4.6, pz);
    for (const dx of [-4, 0, 4]) alem(g, mx + dx, 5.7, pz, 0.45);
    minaret(g, mx - 6.9, mz - 6.8);
    minaret(g, mx + 6.9, mz - 6.8);

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
  buildPark(41, 20);
  function buildPark(px, pz) {
    flat(22, 22, 0x7fc35a, px, pz, 0.015);
    flat(2.4, 22, 0xd9c7a0, px, pz, 0.018);
    flat(22, 2.4, 0xd9c7a0, px, pz, 0.019);
    busy(px - 11, px + 11, pz - 11, pz + 11);
    addMesh(root, new THREE.CylinderGeometry(2.2, 2.4, 0.6, 10), 0xcfc6b8, px, 0.3, pz);
    addMesh(root, new THREE.CylinderGeometry(1.95, 1.95, 0.05, 10), mat(0x4aa3df, { emissive: 0x0a2a44 }), px, 0.62, pz, false);
    addMesh(root, new THREE.CylinderGeometry(0.25, 0.35, 1.4, 8), 0xcfc6b8, px, 1.0, pz);
    addMesh(root, new THREE.CylinderGeometry(0.8, 0.3, 0.3, 10), 0xcfc6b8, px, 1.8, pz);
    const water = addMesh(root, new THREE.ConeGeometry(0.35, 0.9, 6), mat(0x9fdcff, { transparent: true, opacity: 0.7, emissive: 0x113355 }), px, 2.3, pz, false);
    water.userData.dynamic = true;
    updaters.push((dt, t) => { water.scale.y = 1 + Math.sin(t * 6) * 0.15; });
    colBox(px, pz, 4.6, 4.6, 2);
    bench(px, pz - 6.4, Math.PI);
    bench(px, pz + 6.4, Math.PI);
    bench(px - 6.4, pz, Math.PI / 2);
    bench(px + 6.4, pz, -Math.PI / 2);
    for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [-4, -9], [4, 9], [9, -3], [-9, 3]]) tree(px + dx, pz + dz, 0.9 + rand() * 0.4);
  }

  /* ---------- Saat kulesi (oyun saatini gösterir) ---------- */
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = clockCanvas.height = 128;
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const drawClock = (hh, mm) => {
    const g = clockCanvas.getContext('2d');
    g.fillStyle = '#fff8e8';
    g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#2a1a10'; g.stroke();
    g.fillStyle = '#2a1a10';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(64 + Math.sin(a) * 48 - 3, 64 - Math.cos(a) * 48 - 3, 6, 6);
    }
    const hand = (ang, len, wdt) => {
      g.lineWidth = wdt; g.lineCap = 'round';
      g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(ang) * len, 64 - Math.cos(ang) * len); g.stroke();
    };
    hand(((hh % 12) + mm / 60) / 12 * Math.PI * 2, 30, 7);
    hand((mm / 60) * Math.PI * 2, 44, 4);
    clockTex.needsUpdate = true;
  };
  drawClock(8, 0);
  buildClockTower(58, 13);
  function buildClockTower(x, z) {
    flat(9, 8, 0xe2dccd, x, z, 0.025);
    busy(x - 4.5, x + 4.5, z - 4, z + 4);
    const stone = 0xe9dcc0;
    addBox(root, 3.4, 2, 3.4, 0xcfc2a5, x, 1, z);
    addBox(root, 2.6, 10, 2.6, stone, x, 7, z);
    for (let i = 0; i < 3; i++) addBox(root, 2.8, 0.2, 2.8, 0xcfc2a5, x, 4 + i * 3, z, false);
    addBox(root, 3.2, 3.2, 3.2, stone, x, 13.6, z);
    const faceMat = new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const f = new THREE.Mesh(new THREE.CircleGeometry(1.25, 20), faceMat);
      f.position.set(x + Math.sin(a) * 1.62, 13.6, z + Math.cos(a) * 1.62);
      f.rotation.y = a;
      root.add(f);
    }
    const geo = new THREE.ConeGeometry(2.6, 3, 4);
    geo.rotateY(Math.PI / 4);
    addMesh(root, geo, 0x7d8b99, x, 16.7, z);
    makeFlag(x, 18.2, z, 0);
    colBox(x, z, 3.4, 3.4, 20);
    for (const [bx, bz, r] of [[x - 3.2, z + 2.6, Math.PI], [x + 3.2, z + 2.6, Math.PI]]) bench(bx, bz, r);
  }

  /* ---------- Pazar yeri ---------- */
  const marketSpot = buildMarket();
  function buildMarket() {
    flat(27, 8, 0xd9cdb5, 0.5, 37, 0.024);
    busy(-13.5, 14.5, 32.5, 41);
    const awn = [[0xe63946, 0xffffff], [0x2a9d8f, 0xffffff], [0xffcf3f, 0xe63946], [0x3a86ff, 0xffffff]];
    const produce = [[0xff7b00, 0xffa200], [0xe63946, 0xc1121f], [0x2a9d3f, 0x55a630], [0x6a4c93, 0x8338ec], [0xffd60a, 0xffc300]];
    let i = 0;
    for (let x = -11; x <= 12; x += 3.3) {
      const g = new THREE.Group();
      g.position.set(x, 0, 38.6);
      root.add(g);
      addBox(g, 2.6, 0.9, 1.1, 0x8b5a2b, 0, 0.45, 0);
      for (const [px, pz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) addBox(g, 0.08, 2.4, 0.08, 0x5a3a1a, px, 1.2, pz, false);
      const [a, b] = awn[i % awn.length];
      const top = new THREE.Group();
      top.position.set(0, 2.45, 0.1);
      top.rotation.x = 0.25;
      g.add(top);
      for (let k = 0; k < 5; k++) addBox(top, 0.54, 0.05, 1.6, k % 2 ? b : a, -1.08 + k * 0.54, 0, 0);
      const [c1, c2] = produce[i % produce.length];
      for (let k = 0; k < 3; k++) {
        addBox(g, 0.7, 0.18, 0.7, 0xc28e5c, -0.8 + k * 0.8, 0.99, 0.05, false);
        for (let m = 0; m < 4; m++) addMesh(g, new THREE.IcosahedronGeometry(0.12, 0), m % 2 ? c1 : c2, -0.95 + k * 0.8 + (m % 2) * 0.28, 1.17, -0.1 + Math.floor(m / 2) * 0.28, false);
      }
      colBox(x, 38.6, 2.7, 1.2, 2.5);
      i++;
    }
    // Karpuz yığını
    for (let k = 0; k < 6; k++) addMesh(root, new THREE.SphereGeometry(0.35, 8, 6), 0x2d6a4f, 13.6 + (k % 3) * 0.5, 0.35 + Math.floor(k / 3) * 0.5, 35 + (k % 2) * 0.3, true);
    colBox(14.1, 35.2, 1.8, 1.2, 1.2);
    return { x: 1.5, z: 40.2, rot: 0 };
  }

  /* ---------- Ağaçlar, lambalar, süsler ---------- */
  function tree(x, z, s = 1) {
    addMesh(root, new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 6), 0x7a5230, x, 0.8 * s, z);
    const greens = [0x4f9a3c, 0x5fae47, 0x3f8a33];
    addMesh(root, new THREE.IcosahedronGeometry(1.25 * s, 1), greens[Math.floor(rand() * 3)], x, 2.3 * s, z);
    addMesh(root, new THREE.IcosahedronGeometry(0.85 * s, 1), greens[Math.floor(rand() * 3)], x + 0.4 * s, 3.1 * s, z - 0.2 * s);
    addMesh(root, new THREE.IcosahedronGeometry(0.75 * s, 1), greens[Math.floor(rand() * 3)], x - 0.5 * s, 2.8 * s, z + 0.35 * s);
    colBox(x, z, 0.5, 0.5, 3);
  }
  function cypress(x, z) {
    addMesh(root, new THREE.CylinderGeometry(0.12, 0.15, 0.8, 5), 0x6b4a2b, x, 0.4, z);
    addMesh(root, new THREE.ConeGeometry(0.75, 5.2, 7), 0x2f6b3a, x, 3.2, z);
    colBox(x, z, 0.6, 0.6, 5);
  }
  function lamp(x, z, dirX, dirZ) {
    addMesh(root, new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6), 0x2b2b33, x, 2.1, z);
    addBox(root, dirX ? 0.9 : 0.08, 0.08, dirZ ? 0.9 : 0.08, 0x2b2b33, x + dirX * 0.4, 4.15, z + dirZ * 0.4, false);
    addBox(root, 0.36, 0.22, 0.36, lampMat, x + dirX * 0.8, 4.0, z + dirZ * 0.8, false);
    lampHeads.push(new THREE.Vector3(x + dirX * 0.8, 3.85, z + dirZ * 0.8));
    colBox(x, z, 0.3, 0.3, 4);
  }
  const nearCross = (x) => V_ROADS.some((v) => Math.abs(x - v.x) < v.hw + v.sw + 2.5);
  const nearCrossZ = (z) => H_ROADS.some((h) => Math.abs(z - h.z) < h.hw + h.sw + 2.5);
  for (const h of H_ROADS) {
    let k = 0;
    for (let x = -100; x <= 100; x += 14, k++) {
      if (nearCross(x)) continue;
      const north = k % 2 === 0;
      if (h.z === 0 && north && (Math.abs(x + 14) < 3.5 || Math.abs(x) < 5.5)) continue;
      if (h.z === -38 && !north && Math.abs(x - 10) < 5) continue;
      const zz = north ? h.z - h.hw - 0.45 : h.z + h.hw + 0.45;
      lamp(x, zz, 0, north ? 1 : -1);
    }
  }
  for (const v of V_ROADS) {
    let k = 0;
    for (let z = -100; z <= 100; z += 16, k++) {
      if (nearCrossZ(z)) continue;
      const west = k % 2 === 0;
      lamp(west ? v.x - v.hw - 0.45 : v.x + v.hw + 0.45, z, west ? 1 : -1, 0);
    }
  }
  // Ara sokak ağaçları (kaldırımlarda)
  for (const v of V_ROADS) {
    for (let z = -96; z <= 96; z += 9) {
      if (nearCrossZ(z) || Math.abs(z) < 12) continue;
      tree(v.x - v.hw - v.sw / 2, z + 4.5, 0.8);
      tree(v.x + v.hw + v.sw / 2, z, 0.8);
    }
  }

  /** Bir nokta boş mu? (yol/kaldırım/özel alan/engel dışında) */
  function isFree(x, z, m = 1.5) {
    for (const r of busyRects) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return false;
    for (const c of colliders) if (x > c.minX - m && x < c.maxX + m && z > c.minZ - m && z < c.maxZ + m) return false;
    return true;
  }

  // Tarlalar (kasabanın kuzeyi ve güneyi)
  const fieldColors = [0xc9a66b, 0xb08850, 0xd4b483];
  const cropColors = [0x6a994e, 0xa7c957, 0xe9c46a];
  for (const zc of [-80, 84]) {
    for (const [a, b] of xRanges(-104, 104)) {
      for (let x = a + 1; x + 14 < b; x += 17) {
        const fw = 14, fd = 18;
        flat(fw, fd, fieldColors[Math.floor(rand() * 3)], x + fw / 2, zc, 0.012);
        const cc = cropColors[Math.floor(rand() * 3)];
        for (let r = 0; r < 7; r++) addBox(root, fw - 1, 0.35, 0.6, cc, x + fw / 2, 0.17, zc - fd / 2 + 1.5 + r * 2.5, false);
        busy(x, x + fw, zc - fd / 2, zc + fd / 2);
      }
    }
  }

  // Serpiştirilmiş ağaçlar
  let placed = 0;
  for (let i = 0; i < 900 && placed < 140; i++) {
    const x = -102 + rand() * 204;
    const z = -102 + rand() * 204;
    if (!isFree(x, z, 1.8)) continue;
    tree(x, z, 0.8 + rand() * 0.6);
    placed++;
  }

  // Sokak süs bayrakları
  const buntColors = [0xe63946, 0xffffff, 0xffcf3f, 0x2a9d8f];
  const buntGeo = new THREE.ConeGeometry(0.2, 0.42, 3);
  buntGeo.rotateX(Math.PI);
  for (const bx of [-24, -6, 40, 66]) {
    let i = 0;
    for (let z = -7.6; z <= 7.6; z += 0.8) addMesh(root, buntGeo, buntColors[i++ % 4], bx, 6.2 - 0.9 * (1 - (z / 7.6) ** 2), z, false);
  }
  for (let x = -12; x <= 14; x += 0.8) addMesh(root, buntGeo, buntColors[Math.round(x / 0.8) & 3], x, 5.0 - 0.6 * (1 - ((x - 1) / 13) ** 2), 44.5, false);

  function makeFlag(x, y, z, rotY, tallPole = false) {
    const poleH = tallPole ? 6 : 2.4;
    addMesh(root, new THREE.CylinderGeometry(0.05, 0.06, poleH, 6), 0xdddddd, x, y + poleH / 2, z);
    addMesh(root, new THREE.SphereGeometry(0.1, 6, 4), mat(0xf2c037, { emissive: 0x4a3300 }), x, y + poleH + 0.05, z, false);
    const geo = new THREE.PlaneGeometry(1.8, 1.2, 12, 6);
    geo.translate(0.9, 0, 0);
    const base = geo.attributes.position.array.slice();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: turkishFlagTexture(), side: THREE.DoubleSide, flatShading: true }));
    m.position.set(x + 0.05, y + poleH - 0.7, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    m.userData.dynamic = true;
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
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 165 + rand() * 35;
    const h = 18 + rand() * 26;
    addMesh(root, new THREE.ConeGeometry(22 + rand() * 16, h, 6), rand() < 0.5 ? 0x6e9f4a : 0x5b8a3e, Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, false);
  }

  // Bulutlar
  const clouds = new THREE.Group();
  clouds.userData.dynamic = true;
  root.add(clouds);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, flatShading: true });
  const cloudList = [];
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = 2.5 + rand() * 3;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), cloudMat);
      m.position.set(k * 3 - n, rand() * 1.5, rand() * 2.5);
      c.add(m);
    }
    c.position.set(-180 + rand() * 360, 45 + rand() * 15, -150 + rand() * 300);
    c.userData.speed = 1 + rand() * 1.5;
    clouds.add(c);
    cloudList.push(c);
  }
  updaters.push((dt) => {
    for (const c of cloudList) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 190) c.position.x = -190;
    }
  });

  // Gece lamba ışıltısı (tek draw call)
  const glowTex = canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,230,160,1)');
    grd.addColorStop(0.25, 'rgba(255,200,110,.55)');
    grd.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const glowGeo = new THREE.BufferGeometry().setFromPoints(lampHeads);
  const glowMat = new THREE.PointsMaterial({ map: glowTex, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true });
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.userData.dynamic = true;
  glow.frustumCulled = false;
  root.add(glow);

  /* ---------- NPC noktaları ---------- */
  const loop = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    loop.push([41 + Math.cos(a) * 4.2, 20 + Math.sin(a) * 4.2]);
  }
  const spots = {
    imam: { x: -26.5, z: 10.8, rot: Math.PI },
    bakkal: { x: -14, z: -7.7, rot: 0 },
    cayci: { x: 13.9, z: 7.4, rot: Math.PI },
    muhtar: benches[0],
    pazarci: marketSpot,
    fatma: [[-12, 6.5], [5.5, 6.5]],
    john: [[31, -6.6], [70, -6.6]],
    emre: loop,
    bekci: [[-45, 6.4], [-12, 6.4], [14, 6.4], [14, -6.3], [-45, -6.3]],
    komsu: [[-20, -32.4], [4, -32.4]],
  };

  const drawCalls = mergeStatic(root);

  return {
    colliders,
    heightAt,
    home: { doorPoint: homeDoor },
    shops,
    spots,
    benches,
    drawCalls,
    donkeySpawn: { x: 7, z: -4.45, heading: Math.PI / 2 },
    playerSpawn: new THREE.Vector3(3.6, 0, -5.6),
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    /** 0 = gündüz, 1 = gece */
    setNight(n) {
      lampMat.emissive.setRGB(0.48 + n * 0.52, 0.39 + n * 0.45, 0.13 + n * 0.3);
      glowMat.opacity = n * 0.95;
      glassLit.emissive.setRGB(n * 1.0, n * 0.72, n * 0.3);
    },
    setClock(hh, mm) {
      drawClock(hh, mm);
    },
  };
}
