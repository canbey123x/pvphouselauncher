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
  bos: { icon: '🥃', name: 'Boş bardak', price: 0 },
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

// Tekrarlanabilir rastgele (dokular her açılışta aynı görünsün)
let seed = 7;
const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rep = (t, x, y) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.anisotropy = 4;
  return t;
};

/** Krem zeminli, papatya desenli, zincir süslü muşamba masa örtüsü (özgün desen). */
function clothTexture() {
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#e6dfcc';
    c.fillRect(0, 0, w, h);
    // kumaş dokusu
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${120 + R() * 60},${110 + R() * 50},${90 + R() * 40},${0.05 + R() * 0.08})`;
      c.fillRect(R() * w, R() * h, 1 + R() * 3, 1);
    }
    // zincir desenli dalgalı şeritler
    c.strokeStyle = 'rgba(110,45,70,.55)';
    c.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const y0 = 60 + k * 128;
      c.beginPath();
      for (let x = 0; x <= w; x += 4) c.lineTo(x, y0 + Math.sin(x / 22 + k) * 9);
      c.stroke();
      for (let x = 10; x < w; x += 22) {
        c.beginPath();
        c.ellipse(x, y0 + Math.sin(x / 22 + k) * 9, 6, 3, 0.4, 0, Math.PI * 2);
        c.stroke();
      }
    }
    const daisy = (x, y, r, col, mid) => {
      c.fillStyle = col;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        c.beginPath();
        c.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.42, r * 0.13, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = mid;
      c.beginPath();
      c.arc(x, y, r * 0.24, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.5)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(x, y, r * 0.16, 0, Math.PI * 2);
      c.stroke();
    };
    const cols = ['#6e2440', '#5a2a52', '#c4705a', '#6f8a5a', '#8b3a4f', '#d08a6a'];
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = R() * h, r = 14 + R() * 22;
      daisy(x, y, r, cols[i % cols.length], i % 2 ? '#3c2a20' : '#f0d9a0');
      // dikiş ile kenarlarda tekrar (döşeme sorunsuz olsun)
      if (x < r) daisy(x + w, y, r, cols[i % cols.length], '#3c2a20');
      if (y < r) daisy(x, y + h, r, cols[i % cols.length], '#3c2a20');
    }
    // küçük süs yaprakları
    for (let i = 0; i < 60; i++) {
      c.fillStyle = R() < 0.5 ? 'rgba(90,120,80,.6)' : 'rgba(120,50,70,.55)';
      c.beginPath();
      c.ellipse(R() * w, R() * h, 4, 1.6, R() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Koyu, eskimiş ahşap parke: dar tahtalar, kaydırılmış derzler, damar ve leke. */
function floorTexture(rx, ry) {
  return rep(canvasTexture(512, 512, (c, w, h) => {
    const pw = 32;
    for (let x = 0; x < w; x += pw) {
      let y = -R() * 200;
      while (y < h) {
        const len = 120 + R() * 160;
        const v = R();
        c.fillStyle = `rgb(${62 + v * 30},${42 + v * 20},${28 + v * 12})`;
        c.fillRect(x, y, pw - 2, len - 2);
        for (let k = 0; k < 7; k++) {
          c.strokeStyle = `rgba(${20 + R() * 20},${12},${6},${0.25 + R() * 0.2})`;
          c.lineWidth = 0.6 + R();
          c.beginPath();
          const gx = x + 3 + R() * (pw - 8);
          c.moveTo(gx, y);
          c.bezierCurveTo(gx + R() * 6 - 3, y + len * 0.3, gx + R() * 6 - 3, y + len * 0.6, gx + R() * 4 - 2, y + len);
          c.stroke();
        }
        if (R() < 0.3) {
          c.fillStyle = 'rgba(15,8,4,.25)';
          c.beginPath();
          c.ellipse(x + pw / 2, y + R() * len, 3 + R() * 6, 2 + R() * 4, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = 'rgba(10,6,3,.85)';
        c.fillRect(x, y + len - 2, pw, 2);
        y += len;
      }
      c.fillStyle = 'rgba(10,6,3,.9)';
      c.fillRect(x + pw - 2, 0, 2, h);
    }
  }), rx, ry);
}

/** Dikey sarı çam lambri. */
function pineTexture(rx, ry) {
  return rep(canvasTexture(512, 512, (c, w, h) => {
    const pw = 64;
    for (let x = 0; x < w; x += pw) {
      const v = R();
      c.fillStyle = `rgb(${190 + v * 25},${150 + v * 20},${85 + v * 15})`;
      c.fillRect(x, 0, pw, h);
      for (let k = 0; k < 16; k++) {
        c.strokeStyle = `rgba(${120 + R() * 30},${80 + R() * 20},${30},${0.2 + R() * 0.25})`;
        c.lineWidth = 0.8 + R() * 1.5;
        c.beginPath();
        const gx = x + 4 + R() * (pw - 8);
        c.moveTo(gx, 0);
        for (let y = 0; y <= h; y += 32) c.lineTo(gx + Math.sin(y / 40 + k) * 2.5, y);
        c.stroke();
      }
      if (R() < 0.6) {
        const ky = R() * h;
        c.fillStyle = 'rgba(110,60,25,.6)';
        c.beginPath();
        c.ellipse(x + 10 + R() * 40, ky, 4, 7, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(70,40,15,.75)';
      c.fillRect(x, 0, 3, h);
      c.fillStyle = 'rgba(255,240,200,.25)';
      c.fillRect(x + 3, 0, 1, h);
    }
  }), rx, ry);
}

/** Gri arduvaz taş kaplama (üst üste binmiş dikdörtgen plakalar). */
function slateTexture(rx, ry) {
  return rep(canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#1e1f21';
    c.fillRect(0, 0, w, h);
    const rh = 28, tw = 40;
    for (let row = 0; row < h / rh; row++) {
      const off = (row % 2) * (tw / 2) + (R() * 6 - 3);
      for (let x = -tw; x < w + tw; x += tw) {
        const v = 62 + R() * 40;
        const g = c.createLinearGradient(0, row * rh, 0, row * rh + rh);
        g.addColorStop(0, `rgb(${v + 18},${v + 18},${v + 20})`);
        g.addColorStop(1, `rgb(${v - 22},${v - 22},${v - 20})`);
        c.fillStyle = g;
        c.fillRect(x + off + 2, row * rh + 2, tw - 4, rh - 3);
        for (let k = 0; k < 10; k++) {
          c.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},.05)`;
          c.fillRect(x + off + 2 + R() * (tw - 8), row * rh + 3 + R() * (rh - 8), 2 + R() * 8, 1 + R() * 3);
        }
        c.fillStyle = 'rgba(0,0,0,.45)';
        c.fillRect(x + off + 2, row * rh + rh - 2, tw - 4, 2);
      }
    }
  }), rx, ry);
}

/** Brüt beton. */
function concreteTexture(rx, ry) {
  return rep(canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#6a6c6e';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const v = 70 + R() * 70;
      c.fillStyle = `rgba(${v},${v},${v + 3},.25)`;
      c.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3);
    }
    for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(30,30,30,.12)';
      c.fillRect(R() * w, 0, 2 + R() * 10, h);
    }
  }), rx, ry);
}

/** Mantar pano dokusu (çerçeveli duvar panoları). */
function corkTexture() {
  return canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#8a5a2b';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = R() < 0.5 ? `rgba(60,30,10,${0.3 + R() * 0.4})` : `rgba(200,140,70,${0.2 + R() * 0.3})`;
      c.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 3);
    }
  });
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
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D), new THREE.MeshStandardMaterial({ map: floorTexture(W / 4, D / 4), roughness: 0.62, metalness: 0.05 }));
    floor.position.set(0, 0.06, 0);
    floor.receiveShadow = true;
    shell.add(floor);
    const slate = new THREE.MeshStandardMaterial({ map: slateTexture(W / 2.2, (H + 0.9) / 2.2), roughness: 0.88 });
    const slateSide = new THREE.MeshStandardMaterial({ map: slateTexture(D / 2.2, (H + 0.9) / 2.2), roughness: 0.88 });
    const pine = new THREE.MeshStandardMaterial({ map: pineTexture(D / 2.4, H / 2.4), roughness: 0.72 });
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(1, 3), roughness: 0.95 });
    this.concrete = concrete;
    addBox(shell, W + 0.6, H + 0.9, 0.3, slate, 0, (H + 0.9) / 2, -hd - 0.15);
    addBox(shell, 0.3, H + 0.9, D, slateSide, -hw - 0.15, (H + 0.9) / 2, 0);
    addBox(shell, 0.3, H + 0.9, D, pine, hw + 0.15, (H + 0.9) / 2, 0);
    addBox(shell, 0.1, H + 0.9, D, slateSide, hw + 0.33, (H + 0.9) / 2, 0);
    // arka duvarda taş kaplı çıkıntılı kolonlar
    const slateCol = new THREE.MeshStandardMaterial({ map: slateTexture(0.35, H / 2.2), roughness: 0.88 });
    for (const px of [-2.05, 2.85]) addBox(shell, 0.7, H, 0.35, slateCol, px, H / 2, -hd + 0.17);
    // süpürgelik (pine duvar dibi)
    addBox(shell, 0.04, 0.12, D, 0x3a2414, hw - 0.02, 0.18, 0, false);
    // Simsiyah tavan + çatı
    addBox(shell, W, 0.12, D, mat(0x0c0c0d, { roughness: 1 }), 0, H, 0, false);
    addBox(shell, W + 0.7, 0.3, D + 0.4, 0x2c2c2e, 0, H + 0.9, 0);
    // Ön cephe üstü: koyu kiriş + tabela bandı
    addBox(shell, W + 0.6, 0.9, 0.3, 0x232325, 0, H + 0.45, hd + 0.05);
    addBox(shell, W, 0.35, 0.4, 0x1c1c1e, 0, H - 0.17, hd - 0.1);
    // Ön sütunlar (brüt beton)
    for (const px of [-hw, -5.6, 5.6, hw]) addBox(shell, 0.5, H, 0.5, concrete, px, H / 2, hd - 0.1);
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
    const canvasMat = mat(0x3a3d42, { roughness: 0.95 });
    addBox(awning, W + 0.4, 0.05, 2.0, canvasMat, 0, 0, 1.0);
    // sarılı tente borusu + dilimli saçak
    addMesh(awning, new THREE.CylinderGeometry(0.11, 0.11, W + 0.5, 12), 0x2a2b2e, 0, -0.02, 0.05).rotation.z = Math.PI / 2;
    addBox(awning, W + 0.4, 0.18, 0.03, canvasMat, 0, -0.1, 2.0);
    const scGeo = new THREE.CircleGeometry(0.16, 10, Math.PI, Math.PI);
    for (let i = 0; i < 46; i++) {
      const sc = new THREE.Mesh(scGeo, canvasMat);
      sc.position.set(-W / 2 + 0.16 + i * 0.32, -0.19, 2.0);
      awning.add(sc);
      const sc2 = sc.clone();
      sc2.rotation.y = Math.PI;
      sc2.position.z = 1.985;
      awning.add(sc2);
    }

    /* ---------- İç süsler ---------- */
    // Kemerli WC geçidi (sağ lambri duvarda): beton iç yüzey, kemer, tabela
    const wc = new THREE.Group();
    wc.position.set(hw, 0, -3.6);
    wc.rotation.y = -Math.PI / 2;
    g.add(wc);
    const arch = new THREE.Shape();
    arch.moveTo(-0.62, 0);
    arch.lineTo(-0.62, 1.9);
    arch.absarc(0, 1.9, 0.62, Math.PI, 0, true);
    arch.lineTo(0.62, 0);
    arch.lineTo(-0.62, 0);
    const archMesh = new THREE.Mesh(new THREE.ShapeGeometry(arch, 16), new THREE.MeshStandardMaterial({ color: 0x4a4b4d, roughness: 1 }));
    archMesh.position.z = 0.005;
    wc.add(archMesh);
    // kemer pervazı (beton)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 6, 20, Math.PI), concrete);
    rim.position.set(0, 1.9, 0.02);
    wc.add(rim);
    for (const sx of [-0.66, 0.66]) addBox(wc, 0.1, 1.9, 0.06, concrete, sx, 0.95, 0.02, false);
    // içeride hafif ışık (koridor)
    addBox(wc, 0.9, 0.02, 0.02, mat(0xffffff, { emissive: 0xdfe6ff, emissiveIntensity: 0.6 }), 0, 2.2, 0.0, false);
    const wcTex = canvasTexture(128, 96, (c) => {
      c.fillStyle = '#f4f6fb'; c.fillRect(0, 0, 128, 96);
      c.strokeStyle = '#1d3557'; c.lineWidth = 4; c.strokeRect(3, 3, 122, 90);
      c.fillStyle = '#1d3557'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('WC', 64, 34);
      c.font = 'bold 18px sans-serif'; c.fillText('ÇIKIŞ', 64, 70);
    });
    const wcs = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ map: wcTex }));
    wcs.position.set(0, 2.85, 0.03);
    wc.add(wcs);
    // Çerçeveli mantar panolar (lambri duvar)
    const corkMat = new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 0.95 });
    for (const [z, sz2] of [[-1.0, 0.9], [1.3, 1.0], [3.7, 1.15]]) {
      const fr = new THREE.Group();
      fr.position.set(hw - 0.02, 2.0, z);
      fr.rotation.y = -Math.PI / 2;
      g.add(fr);
      addBox(fr, sz2 + 0.12, sz2 * 0.85 + 0.12, 0.05, 0x4a2a14, 0, 0, 0, false);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(sz2, sz2 * 0.85), corkMat);
      p.position.z = 0.03;
      fr.add(p);
    }
    // Klima (arka duvar): beyaz gövde, koyu kırmızı ön panel
    addBox(g, 1.35, 0.34, 0.24, 0xeeeeee, -0.6, 3.05, -hd + 0.12, false);
    addBox(g, 1.15, 0.16, 0.02, mat(0x7a1418, { roughness: 0.4 }), -0.62, 3.07, -hd + 0.25, false);
    addBox(g, 0.12, 0.05, 0.02, 0x9a9a9a, 0.0, 3.06, -hd + 0.25, false);
    // Floresan gömme paneller (simsiyah tavanda ızgara)
    const tube = mat(0xffffff, { emissive: 0xf3f6ff, emissiveIntensity: 1.4 });
    this.tubeMat = tube;
    for (const z of [-3.9, -1.3, 1.3, 3.9]) for (const x of [-4.9, -1.6, 1.6, 4.9]) {
      addBox(g, 1.3, 0.03, 0.26, 0x8e9196, x, H - 0.065, z, false);
      addBox(g, 1.18, 0.02, 0.13, tube, x, H - 0.085, z, false);
    }
    // tente altı panelleri
    for (const x of [-4.9, 0, 4.9]) addBox(g, 1.22, 0.02, 0.22, tube, x, H - 0.33, hd + 0.9, false);
    this.lights = [];
    for (const [x, z] of [[-3.3, -2.6], [3.3, -2.6], [-3.3, 2.6], [3.3, 2.6], [-5.6, -4.4]]) {
      const l = new THREE.PointLight(0xeef2ff, 0, 11, 1.5);
      l.position.set(O.x + x, H - 0.35, O.z + z);
      scene.add(l);
      this.lights.push(l);
    }

    /* ---------- Ocak (arka sol): tezgah, çay makinesi + iki çaydanlık, cezve, bardaklar ---------- */
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9cfd5, metalness: 0.85, roughness: 0.28 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xb8742f, metalness: 0.9, roughness: 0.3 });
    const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.55, roughness: 0.35 });
    addBox(g, 4.8, 1.0, 0.9, 0x2a1d14, -5.0, 0.5, -hd + 0.45);
    addBox(g, 4.9, 0.05, 1.0, 0xe8e6e0, -5.0, 1.025, -hd + 0.45);
    for (let k = 0; k < 4; k++) addBox(g, 1.1, 0.8, 0.02, 0x3a281a, -6.8 + k * 1.2, 0.5, -hd + 0.91, false);
    col(-hw, -2.55, -hd, -hd + 0.95, 1.1);
    const sx = -6.3, sz = -hd + 0.45;
    // çay makinesi (siyah gövde, ön panel etiketi)
    addBox(g, 1.3, 0.55, 0.6, blackMetal, sx, 1.33, sz);
    addBox(g, 1.32, 0.04, 0.62, steel, sx, 1.62, sz, false);
    const lbl = canvasTexture(256, 64, (c) => {
      c.fillStyle = '#e8eef5'; c.fillRect(0, 0, 256, 64);
      c.fillStyle = '#a4161a'; c.font = 'bold 26px sans-serif'; c.textBaseline = 'middle';
      c.fillText('EŞEK', 10, 32);
      c.fillStyle = '#1d3557'; c.font = 'bold 20px sans-serif';
      c.fillText('ÇAY · KAHVE', 100, 32);
    });
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshBasicMaterial({ map: lbl }));
    lp.position.set(O.x + sx + 0.28, 1.2, O.z + sz + 0.305);
    scene.add(lp);
    addMesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), steel, sx - 0.45, 1.5, sz + 0.31, false).rotation.x = Math.PI / 2;
    // iki çift katlı siyah çaydanlık
    this.demlik = new THREE.Group();
    this.demlik.position.set(sx, 1.64, sz);
    g.add(this.demlik);
    const enamel = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.22, metalness: 0.35 });
    for (const dx of [-0.3, 0.3]) {
      const k = new THREE.Group();
      k.position.x = dx;
      this.demlik.add(k);
      addMesh(k, new THREE.CylinderGeometry(0.16, 0.19, 0.22, 18), enamel, 0, 0.11, 0);
      addMesh(k, new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), enamel, 0, 0.22, 0, false);
      addMesh(k, new THREE.CylinderGeometry(0.025, 0.018, 0.2, 8), enamel, 0.2, 0.18, 0, false).rotation.z = -0.8;
      const hd2 = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.013, 6, 14, Math.PI), enamel);
      hd2.position.y = 0.3;
      k.add(hd2);
      // üstteki demlik
      addMesh(k, new THREE.CylinderGeometry(0.09, 0.11, 0.13, 14), enamel, 0, 0.42, 0);
      addMesh(k, new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), enamel, 0, 0.485, 0, false);
      addMesh(k, new THREE.CylinderGeometry(0.018, 0.012, 0.12, 6), enamel, 0.12, 0.45, 0, false).rotation.z = -0.8;
      addMesh(k, new THREE.SphereGeometry(0.018, 6, 4), steel, 0, 0.58, 0, false);
    }
    this.steam = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
      s.position.set(O.x + sx + (i % 2 ? 0.3 : -0.3), 2.25, O.z + sz);
      scene.add(s);
      this.steam.push({ m: s, t: i / 6 });
    }
    addBox(g, 0.5, 0.1, 0.45, blackMetal, -4.6, 1.1, sz);
    this.flame = addMesh(g, new THREE.ConeGeometry(0.09, 0.1, 10), mat(0x3a86ff, { emissive: 0x1d4ed8 }), -4.6, 1.2, sz, false);
    this.cezve = new THREE.Group();
    this.cezve.position.set(-4.6, 1.18, sz);
    g.add(this.cezve);
    addMesh(this.cezve, new THREE.CylinderGeometry(0.08, 0.1, 0.16, 14), copper, 0, 0.08, 0);
    addMesh(this.cezve, new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), 0x3b2314, 0.2, 0.12, 0).rotation.z = Math.PI / 2 - 0.2;
    this.foam = addMesh(this.cezve, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 14), 0xc8a27a, 0, 0.15, 0, false);
    // Temiz bardaklar (ince belli, tabaklı) — tezgahta sıra sıra
    this.glassGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0.0, 0), new THREE.Vector2(0.026, 0), new THREE.Vector2(0.03, 0.01), new THREE.Vector2(0.022, 0.045),
      new THREE.Vector2(0.026, 0.07), new THREE.Vector2(0.034, 0.1), new THREE.Vector2(0.033, 0.102),
    ], 14);
    this.teaGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0.0, 0.004), new THREE.Vector2(0.024, 0.004), new THREE.Vector2(0.027, 0.012), new THREE.Vector2(0.019, 0.045),
      new THREE.Vector2(0.023, 0.07), new THREE.Vector2(0.029, 0.088), new THREE.Vector2(0.0, 0.088),
    ], 14);
    this.bottleGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0.0, 0), new THREE.Vector2(0.027, 0), new THREE.Vector2(0.03, 0.01), new THREE.Vector2(0.03, 0.12),
      new THREE.Vector2(0.024, 0.15), new THREE.Vector2(0.011, 0.18), new THREE.Vector2(0.011, 0.2), new THREE.Vector2(0.0, 0.2),
    ], 14);
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    this.glassMeshes = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.glassGeo, this.glassMat);
      m.position.set(-3.95 + (i % 6) * 0.1, 1.05, sz - 0.3 + Math.floor(i / 6) * 0.1);
      g.add(m);
      this.glassMeshes.push(m);
    }
    // Lavabo (sol duvar): paslanmaz tezgah + batarya
    addBox(g, 0.9, 1.0, 1.2, 0x2a1d14, -hw + 0.45, 0.5, -2.1);
    addBox(g, 0.92, 0.05, 1.22, steel, -hw + 0.45, 1.02, -2.1, false);
    addBox(g, 0.6, 0.02, 0.7, 0x8a9096, -hw + 0.45, 1.0, -2.1, false);
    addMesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), steel, -hw + 0.12, 1.2, -2.1, false);
    addMesh(g, new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), steel, -hw + 0.22, 1.36, -2.1, false).rotation.z = Math.PI / 2;
    col(-hw, -hw + 0.95, -2.7, -1.5, 1.1);

    /* ---------- İçecek dolabı (sol duvar), oralet kavanozu, simit tablası, çöp kovası ---------- */
    const fr = new THREE.Group();
    fr.position.set(-hw + 0.35, 0, -3.7);
    g.add(fr);
    addBox(fr, 0.62, 1.8, 0.72, 0xe9ecef, 0, 0.9, 0);
    addBox(fr, 0.02, 1.5, 0.6, new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, roughness: 0.05 }), 0.32, 0.95, 0, false);
    addBox(fr, 0.03, 0.25, 0.62, mat(0xc1121f), 0.32, 1.65, 0, false);
    const fridgeLight = mat(0xffffff, { emissive: 0xdff3ff, emissiveIntensity: 0.6 });
    addBox(fr, 0.5, 0.02, 0.6, fridgeLight, 0, 1.6, 0, false);
    for (const [y, colr] of [[1.18, 0x2f8f4a], [0.55, 0x3fb7c9]]) {
      addBox(fr, 0.55, 0.02, 0.6, 0x9aa0a6, 0, y - 0.02, 0, false);
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, colr === 0x2f8f4a ? 0.2 : 0.26, 10), new THREE.MeshStandardMaterial({ color: colr, transparent: true, opacity: 0.85, roughness: 0.1 }));
        b.position.set(0.12 - (i % 2) * 0.12, y + 0.12, -0.24 + Math.floor(i / 2) * 0.16);
        fr.add(b);
      }
    }
    col(-hw, -hw + 0.7, -4.08, -3.32, 1.8);
    // oralet kavanozu + simit tablası (tezgahın sağ ucu)
    addMesh(g, new THREE.CylinderGeometry(0.09, 0.09, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05 }), -3.15, 1.15, sz - 0.2, false);
    addMesh(g, new THREE.CylinderGeometry(0.085, 0.085, 0.12, 14), mat(0xff8c1a), -3.15, 1.11, sz - 0.2, false);
    addMesh(g, new THREE.CylinderGeometry(0.095, 0.095, 0.03, 14), mat(0xe8761a), -3.15, 1.26, sz - 0.2, false);
    addMesh(g, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), 0x8a5a2b, -2.85, 1.06, sz + 0.15, false);
    this.simitMeshes = [];
    for (let i = 0; i < 5; i++) {
      const m = addMesh(g, new THREE.TorusGeometry(0.06, 0.02, 8, 16), mat(0xa0662f, { roughness: 0.8 }), -2.85 + Math.cos(i * 1.25) * 0.1, 1.09 + (i === 4 ? 0.03 : 0), sz + 0.15 + Math.sin(i * 1.25) * 0.1, false);
      m.rotation.x = Math.PI / 2;
      this.simitMeshes.push(m);
    }
    // çöp kovası
    addMesh(g, new THREE.CylinderGeometry(0.2, 0.17, 0.55, 14), 0x3a3d42, -2.2, 0.28, -hd + 1.25);
    addMesh(g, new THREE.CylinderGeometry(0.21, 0.21, 0.04, 14), 0x2a2b2e, -2.2, 0.57, -hd + 1.25, false);
    col(-2.42, -1.98, -hd + 1.03, -hd + 1.47, 0.6);
    // çay makinesinin durum lambası + musluk
    this.teaLamp = addMesh(g, new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x000000 }), sx - 0.45, 1.5, sz + 0.32, false);
    addMesh(g, new THREE.CylinderGeometry(0.02, 0.015, 0.1, 8), steel, sx + 0.1, 1.12, sz + 0.34, false);
    addBox(g, 0.3, 0.02, 0.18, steel, sx + 0.1, 1.06, sz + 0.38, false);

    /* ---------- Oyun dolabı (arka sağ): koyu ahşap, raflar ---------- */
    addBox(g, 2.4, 2.0, 0.5, 0x22160e, 4.7, 1.0, -hd + 0.25);
    for (const y of [0.6, 1.2, 1.8]) addBox(g, 2.3, 0.04, 0.46, 0x3a2616, 4.7, y, -hd + 0.28, false);
    addBox(g, 0.04, 2.0, 0.46, 0x3a2616, 4.7, 1.0, -hd + 0.28, false);
    col(3.45, 5.95, -hd, -hd + 0.55, 2);
    this.rackItems = { okey: [], tavla: [], kart: [] };
    for (let i = 0; i < 3; i++) {
      this.rackItems.okey.push(addBox(g, 0.45, 0.1, 0.28, 0xd9c7a0, 3.95 + i * 0.5, 0.67, -hd + 0.3));
      this.rackItems.tavla.push(addBox(g, 0.5, 0.1, 0.34, 0xb5793a, 3.95 + i * 0.55, 1.26, -hd + 0.3));
      this.rackItems.kart.push(addBox(g, 0.12, 0.04, 0.18, 0xc1121f, 4.0 + i * 0.3, 1.83, -hd + 0.3));
    }
    // dolap üstünde eski radyo
    addBox(g, 0.4, 0.22, 0.16, 0x5a3a22, 5.4, 2.11, -hd + 0.25, false);

    /* ---------- TV (arka duvar, ayaklı ünite) ---------- */
    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 256;
    this.tvCanvas.height = 144;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    addBox(g, 1.9, 0.55, 0.45, 0x3a2616, 1.3, 0.28, -hd + 0.25);
    col(0.3, 2.3, -hd, -hd + 0.5, 0.6);
    this.tv = new THREE.Group();
    this.tv.position.set(1.3, 1.25, -hd + 0.25);
    g.add(this.tv);
    addBox(this.tv, 1.75, 1.0, 0.07, 0x0b0b0c, 0, 0, 0);
    addBox(this.tv, 0.5, 0.04, 0.25, 0x0b0b0c, 0, -0.66, 0);
    addBox(this.tv, 0.06, 0.18, 0.04, 0x0b0b0c, 0, -0.58, 0);
    this.tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.92), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    this.tvScreen.position.z = 0.04;
    this.tv.add(this.tvScreen);
    this.tvOn = true;
    this.score = [0, 0];

    /* ---------- Kasa (sağ ön): tezgah, monitör, klavye, bardak dizisi ---------- */
    addBox(g, 1.8, 1.05, 0.8, 0x1d140d, hw - 0.9, 0.52, 2.2);
    addBox(g, 1.9, 0.05, 0.9, 0xe2ded6, hw - 0.9, 1.07, 2.2, false);
    // monitör: kasiyere dönük (−z), ince çerçeve, ayak
    const mon = new THREE.Group();
    mon.position.set(hw - 1.0, 1.1, 2.3);
    mon.rotation.y = Math.PI;
    g.add(mon);
    addBox(mon, 0.08, 0.02, 0.16, 0x111111, 0, 0.01, 0.05, false);
    addBox(mon, 0.04, 0.2, 0.03, 0x111111, 0, 0.11, 0.05, false);
    addBox(mon, 0.56, 0.34, 0.03, 0x111111, 0, 0.36, 0.02, false);
    const scr = canvasTexture(256, 160, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2d6fa8'); gr.addColorStop(1, '#0f3a63');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      // kendi logomuz: ince belli çay bardağı
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(108, 50); c.lineTo(148, 50); c.lineTo(138, 82); c.lineTo(144, 112); c.lineTo(112, 112); c.lineTo(118, 82); c.closePath();
      c.fill();
      c.fillStyle = '#b3261e';
      c.beginPath();
      c.moveTo(112, 60); c.lineTo(144, 60); c.lineTo(135, 82); c.lineTo(140, 108); c.lineTo(116, 108); c.lineTo(121, 82); c.closePath();
      c.fill();
    });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }));
    sp.position.set(0, 0.36, 0.04);
    mon.add(sp);
    // klavye (açık renkli tuşlar)
    const kb = canvasTexture(256, 96, (c, w, h) => {
      c.fillStyle = '#d9dccf'; c.fillRect(0, 0, w, h);
      for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) {
        c.fillStyle = (r + k) % 7 === 0 ? '#a9b29a' : '#f2f2ea';
        c.fillRect(6 + k * 16.5, 6 + r * 17.5, 14, 15);
      }
    });
    const kbm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.15), [mat(0xcfd2c6), mat(0xcfd2c6), new THREE.MeshStandardMaterial({ map: kb, roughness: 0.6 }), mat(0xcfd2c6), mat(0xcfd2c6), mat(0xcfd2c6)]);
    kbm.position.set(O.x + hw - 1.0, 1.11, O.z + 1.98);
    scene.add(kbm);
    // para çekmecesi
    addBox(g, 0.45, 0.1, 0.35, 0x2a2a2a, hw - 1.55, 1.13, 2.1, false);
    // tezgahın sağında ters dizilmiş bardaklar
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this.glassGeo, this.glassMat);
      m.position.set(O.x + hw - 0.35 + (i % 3) * 0.08, 1.1, O.z + 1.95 + Math.floor(i / 3) * 0.08);
      scene.add(m);
    }
    // camlı ara bölme dikmeleri
    for (const px of [hw - 1.75, hw - 0.05]) addBox(g, 0.06, 1.2, 0.06, 0x111111, px, 1.65, 2.55, false);
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
    this.setTableCount(6);
    this.setTableCount(4);

    /* ---------- Noktalar ---------- */
    this.entry = this.L(0, hd + 0.4);
    this.ocakPoint = this.L(-5.45, -hd + 2.5);
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
    this._buildHits();
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
    const metal = new THREE.MeshStandardMaterial({ color: 0xb4b8bd, metalness: 0.92, roughness: 0.32 });
    addMesh(v, new THREE.CylinderGeometry(0.2, 0.195, 0.01, 32), metal, 0, 0, 0, false);
    addMesh(v, new THREE.TorusGeometry(0.2, 0.005, 6, 32), metal, 0, 0.006, 0, false).rotation.x = Math.PI / 2;
    // askılı tepsi: kenardan yükselen üç kol, tepede halka
    const top = new THREE.Vector3(0, 0.3, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const p0 = new THREE.Vector3(Math.cos(a) * 0.19, 0.005, Math.sin(a) * 0.19);
      const p1 = new THREE.Vector3(Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17);
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, top);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.004, 5), metal);
      v.add(arm);
    }
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 12, Math.PI * 1.5), metal);
    hook.position.set(0, 0.325, 0);
    v.add(hook);
    this.trayItems = new THREE.Group();
    v.add(this.trayItems);
    this.trayView = v;
    v.visible = false;
  }

  refreshTrayView() {
    const g = this.trayItems;
    while (g.children.length) g.remove(g.children[0]);
    const spots = [[-0.1, 0.07], [0.0, 0.11], [0.1, 0.07], [-0.12, -0.04], [0.12, -0.04], [-0.05, -0.12], [0.05, -0.12], [0.0, 0.0], [-0.06, 0.02], [0.06, 0.02]];
    const saucer = (it3, r) => {
      addMesh(it3, new THREE.CylinderGeometry(r, r * 0.8, 0.006, 18), mat(0xfafafa, { roughness: 0.25 }), 0, 0.003, 0, false);
      addMesh(it3, new THREE.TorusGeometry(r * 0.88, 0.0025, 4, 18), mat(0xb3261e), 0, 0.0065, 0, false).rotation.x = Math.PI / 2;
    };
    this.tray.forEach((it, i) => {
      const [x, z] = spots[i % spots.length];
      const it3 = new THREE.Group();
      it3.position.set(x, 0.006, z);
      g.add(it3);
      if (it.type === 'bos') {
        saucer(it3, 0.04);
        const glass = new THREE.Mesh(this.glassGeo, this.glassMat);
        glass.position.y = 0.006;
        it3.add(glass);
      } else if (it.type === 'cay' || it.type === 'oralet') {
        saucer(it3, 0.04);
        const glass = new THREE.Mesh(this.glassGeo, this.glassMat);
        glass.position.y = 0.006;
        it3.add(glass);
        const colr = it.type === 'oralet' ? 0xe8761a : it.q === 'light' ? 0xb8702e : it.q === 'bitter' ? 0x2a0904 : 0x7a1608;
        const tea = new THREE.Mesh(this.teaGeo, new THREE.MeshStandardMaterial({ color: colr, transparent: true, opacity: 0.88, roughness: 0.08 }));
        tea.position.y = 0.006;
        it3.add(tea);
      } else if (it.type === 'kahve') {
        saucer(it3, 0.045);
        addMesh(it3, new THREE.CylinderGeometry(0.03, 0.022, 0.05, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, side: THREE.DoubleSide }), 0, 0.032, 0, false);
        addMesh(it3, new THREE.CylinderGeometry(0.028, 0.028, 0.002, 16), mat(it.q === 'good' ? 0x8a5a36 : 0x1e0f06), 0, 0.05, 0, false);
        addMesh(it3, new THREE.TorusGeometry(0.01, 0.003, 4, 8), mat(0xffffff), 0.033, 0.035, 0, false);
      } else if (it.type === 'soda') {
        const b = new THREE.Mesh(this.bottleGeo, new THREE.MeshStandardMaterial({ color: 0x2f8f4a, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.1 }));
        b.scale.setScalar(0.85);
        it3.add(b);
        addMesh(it3, new THREE.CylinderGeometry(0.023, 0.023, 0.035, 12), mat(0x9fd8ff, { roughness: 0.4 }), 0, 0.06, 0, false);
      } else if (it.type === 'su') {
        const b = new THREE.Mesh(this.bottleGeo, new THREE.MeshStandardMaterial({ color: 0x3fb7c9, transparent: true, opacity: 0.7, roughness: 0.05 }));
        b.scale.set(1.1, 1.25, 1.1);
        it3.add(b);
        addMesh(it3, new THREE.CylinderGeometry(0.011, 0.011, 0.014, 10), mat(0xf5f5f5), 0, 0.24, 0, false);
      } else if (it.type === 'simit') {
        addMesh(it3, new THREE.CylinderGeometry(0.05, 0.05, 0.004, 16), mat(0xfafafa), 0, 0.002, 0, false);
        addMesh(it3, new THREE.TorusGeometry(0.035, 0.013, 8, 16), mat(0xa0662f, { roughness: 0.8 }), 0, 0.015, 0, false).rotation.x = Math.PI / 2;
      }
    });
    if (this.gear) {
      const gr = new THREE.Group();
      gr.position.set(0, 0.012, -0.02);
      g.add(gr);
      addBox(gr, 0.2, 0.035, 0.14, this.gear === 'okey' ? 0xd9c7a0 : this.gear === 'tavla' ? 0xb5793a : 0xc1121f, 0, 0.018, 0, false);
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
    // Masa: hasır sarılı turuncu ayaklar, sarkan çiçekli muşamba örtü
    const rope = mat(0xc27a3a, { roughness: 0.9 });
    for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) {
      addMesh(frame, new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8), rope, x, 0.39, z);
      for (let k = 0; k < 6; k++) addMesh(frame, new THREE.TorusGeometry(0.036, 0.006, 4, 8), 0x9a5a28, x, 0.1 + k * 0.12, z, false).rotation.x = Math.PI / 2;
    }
    addBox(frame, 1.1, 0.04, 1.1, 0x6b4224, 0, 0.78, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.012, 1.3), this.clothMat);
    top.position.y = 0.805;
    top.receiveShadow = true;
    g.add(top);
    for (let i = 0; i < 4; i++) {
      const sk = new THREE.Group();
      sk.rotation.y = (i * Math.PI) / 2;
      g.add(sk);
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.34, 0.008), this.clothMat);
      d.position.set(0, 0.64, 0.665);
      d.rotation.x = 0.1;
      d.castShadow = true;
      sk.add(d);
    }
    // Sandalyeler: siyah metal iskelet, koyu ahşap geniş çıtalar
    const seats = [];
    const wood = mat(0x2b1a10, { roughness: 0.7 });
    const iron = mat(0x141416, { roughness: 0.45, metalness: 0.6 });
    for (const [dx, dz, rot] of [[0, -1.0, 0], [0, 1.0, Math.PI], [-1.0, 0, Math.PI / 2], [1.0, 0, -Math.PI / 2]]) {
      const ch = new THREE.Group();
      ch.position.set(dx, 0, dz);
      ch.rotation.y = rot;
      frame.add(ch);
      for (let k = 0; k < 4; k++) addBox(ch, 0.44, 0.025, 0.1, wood, 0, 0.47, -0.165 + k * 0.11);
      addBox(ch, 0.44, 0.12, 0.025, wood, 0, 0.86, -0.215);
      addBox(ch, 0.44, 0.12, 0.025, wood, 0, 1.0, -0.215);
      for (const [x, z, h] of [[-0.205, -0.21, 1.08], [0.205, -0.21, 1.08], [-0.205, 0.2, 0.46], [0.205, 0.2, 0.46]]) addBox(ch, 0.03, h, 0.03, iron, x, h / 2, z);
      addBox(ch, 0.03, 0.03, 0.42, iron, -0.205, 0.45, 0, false);
      addBox(ch, 0.03, 0.03, 0.42, iron, 0.205, 0.45, 0, false);
      seats.push({ pos: new THREE.Vector3(O.x + lx + dx, 0, O.z + lz + dz), rot, taken: null });
    }
    bakeHierarchy(frame);
    const tcol = { minX: O.x + lx - 0.68, maxX: O.x + lx + 0.68, minZ: O.z + lz - 0.68, maxZ: O.z + lz + 0.68, h: 1 };
    this.cityColliders.push(tcol);

    const items = new THREE.Group();
    items.position.y = 0.815;
    g.add(items);
    const teaMat = new THREE.MeshStandardMaterial({ color: 0x7a1608, transparent: true, opacity: 0.88, roughness: 0.08 });
    const cups = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const a = (i / 6) * Math.PI * 2 + 0.4;
      c.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      addMesh(c, new THREE.CylinderGeometry(0.045, 0.036, 0.006, 16), mat(0xfafafa, { roughness: 0.25 }), 0, 0.003, 0, false);
      addMesh(c, new THREE.TorusGeometry(0.04, 0.0025, 4, 16), mat(0xb3261e), 0, 0.0065, 0, false).rotation.x = Math.PI / 2;
      const gl = new THREE.Mesh(this.glassGeo, this.glassMat);
      gl.position.y = 0.006;
      c.add(gl);
      const tm = new THREE.Mesh(this.teaGeo, teaMat);
      tm.position.y = 0.006;
      tm.scale.y = 0.6;
      c.add(tm);
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
    bubble.position.set(0, 2.3, 0);
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
    // Uzaktan sadece "???" görünür; yaklaşınca sipariş okunur
    const near = this.ctx.near ? this.ctx.near(t.center, 4.2) : true;
    if (text && this.ctx.near && this.ctx.near(t.center, 2.3)) b.s.visible = false;
    if (!near && text) {
      text = '???';
      key = 'far' + Math.round((1 - t.patience / (t.maxPatience || 1)) * 5);
    }
    if (key === b.key) return;
    b.key = key;
    const g = b.c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    if (!text) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (text === '???') {
      g.font = 'bold 54px sans-serif';
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(0,0,0,.85)';
      g.strokeText('???', 128, 52);
      g.fillStyle = '#ffffff';
      g.fillText('???', 128, 52);
    } else {
      g.fillStyle = 'rgba(15,15,18,.72)';
      g.beginPath();
      if (g.roundRect) g.roundRect(10, 12, 236, 76, 18);
      else g.rect(10, 12, 236, 76);
      g.fill();
      g.font = '40px sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(text, 128, 48);
    }
    if (t.state === 'ordering') {
      const r = Math.max(0, 1 - t.patience / t.maxPatience);
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(48, 96, 160, 7);
      g.fillStyle = r > 0.5 ? '#2ec27e' : r > 0.25 ? '#f77f00' : '#e63946';
      g.fillRect(48, 96, 160 * r, 7);
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
    const tq = this.teaQuality();
    this.teaLamp.material.emissive.setHex(tq === null ? 0x000000 : tq === 'light' ? 0xff9f1c : tq === 'good' ? 0x22dd55 : 0xff2222);
    const sim = this.ctx.stock.simit ?? 0;
    this.simitMeshes.forEach((m, i) => (m.visible = i < sim));
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
    if (this.tea.left <= 0) return this.ctx.toast('Demlik boş, önce çay demle 🫖', 'warn', 'nodem');
    const k = this.tray.findIndex((x) => x.type === 'bos');
    if (k < 0) return this.ctx.toast('Önce tezgahtan boş bardak al 🥃', 'warn', 'noglass');
    let q = this.teaQuality();
    if (this.ctx.stock.seker > 0) this.ctx.stock.seker--;
    else {
      this.ctx.toast('Şeker bitti! Şekersiz çay müşteriyi üzer. Bakkaldan şeker al.', 'warn', 'noseker');
      if (q === 'good') q = 'light';
    }
    this.tea.left--;
    this.tray[k] = { type: 'cay', q };
    if (q === 'good') this.ctx.toast('🍵 Tavşan kanı!', 'ok', 'tk');
    else this.ctx.toast(q === 'light' ? '🍵 Çay açık oldu, demlenmeyi bekle...' : '🍵 Çay acı oldu, yeniden demle!', 'warn', 'tq');
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
    for (const it of this.tray) {
      if (it.type === 'bos') this.glassClean = Math.min(this.glassTotal, this.glassClean + 1);
      else if (GLASS_TYPES[it.type]) this.dirty++;
    }
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

  /* ---------- Dokunarak etkileşim (birinci şahıs) ---------- */
  _buildHits() {
    const O = KIRA_ORIGIN;
    const hd = D / 2;
    const hw = W / 2;
    const sz = -hd + 0.45;
    const sx = -6.3;
    this.hits = [];
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hit = (x, y, z, w, h, d, kind, extra = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat);
      m.position.set(O.x + x, y, O.z + z);
      m.userData.hit = { kind, ...extra };
      this.ctx.scene.add(m);
      this.hits.push(m);
      return m;
    };
    hit(sx, 1.75, sz, 1.45, 1.3, 0.8, 'sebil');
    hit(-3.7, 1.1, sz - 0.15, 0.7, 0.3, 0.5, 'bardak');
    hit(-4.6, 1.2, sz, 0.45, 0.35, 0.45, 'cezve');
    hit(-3.15, 1.15, sz - 0.2, 0.26, 0.32, 0.26, 'oralet');
    hit(-2.85, 1.1, sz + 0.15, 0.48, 0.15, 0.48, 'simit');
    hit(-hw + 0.35, 1.3, -3.7, 0.7, 0.7, 0.75, 'soda');
    hit(-hw + 0.35, 0.6, -3.7, 0.7, 0.7, 0.75, 'su');
    hit(-2.2, 0.35, -hd + 1.25, 0.5, 0.7, 0.5, 'cop');
    hit(-hw + 0.45, 1.0, -2.1, 0.95, 0.6, 1.25, 'lavabo');
    hit(4.7, 0.72, -hd + 0.3, 2.3, 0.5, 0.55, 'raf', { game: 'okey' });
    hit(4.7, 1.3, -hd + 0.3, 2.3, 0.5, 0.55, 'raf', { game: 'tavla' });
    hit(4.7, 1.88, -hd + 0.3, 2.3, 0.5, 0.55, 'raf', { game: 'kart' });
    hit(1.3, 1.25, -hd + 0.3, 1.8, 1.05, 0.25, 'tv');
    hit(hw - 0.9, 1.25, 2.2, 1.9, 0.55, 0.95, 'kasa');
    this.tableHits = this.tables.map((t) => hit(t.local.x, 0.7, t.local.z, 1.5, 1.2, 1.5, 'masa', { t }));
  }

  /** Bakılan / dokunulan nesneden yapılacak işi çıkar. */
  describe(h) {
    if (!h) return null;
    const st = this.ctx.stock;
    const hasEmpty = this.tray.some((x) => x.type === 'bos');
    const full = this.tray.length >= this.trayMax;
    const act = (icon, label, run, cls = 'green') => ({ icon, label, run, cls });
    const info = (icon, label) => ({ icon, label, run: null, cls: 'gray' });
    switch (h.kind) {
      case 'bardak':
        if (full) return info('🍽️', 'Tepsi dolu');
        if (this.glassClean <= 0) return info('🥃', 'Temiz bardak yok! Lavaboda yıka');
        return act('🥃', `Bardak Al (${this.glassClean})`, () => this.takeGlass());
      case 'sebil': {
        const q = this.teaQuality();
        if (q === null) return st.cay > 0 ? act('🫖', `Çay Demle (kuru çay ${st.cay})`, () => this.brewTea(), 'yellow') : info('🫖', 'Kuru çay bitti! Bakkala git');
        const qt = q === 'light' ? 'açık, demleniyor' : q === 'good' ? 'TAVŞAN KANI' : 'acılaştı';
        if (hasEmpty) return act('🍵', `Çay Doldur — ${qt}`, () => this.pourTea(), q === 'good' ? 'green' : 'yellow');
        if (q === 'bitter' && st.cay > 0) return act('🫖', 'Yeniden Demle (acılaştı)', () => this.brewTea(), 'yellow');
        return info('🫖', `Demlik: ${qt} · ${this.tea.left} bardak — önce bardak al`);
      }
      case 'cezve':
        if (this.coffee.on) {
          const c = this.coffee.t;
          if (c < 0.8) return info('☕', 'Kahve ısınıyor...');
          return act('☕', c < 1.15 ? 'Kahveyi Al — köpürdü!' : 'Kahveyi Al — TAŞIYOR!', () => this.coffeeAction(), c < 1.15 ? 'green' : 'yellow');
        }
        return st.kahve > 0 ? act('☕', `Kahve Pişir (${st.kahve})`, () => this.coffeeAction(), 'yellow') : info('☕', 'Kahve bitti! Bakkala git');
      case 'oralet':
        if (!hasEmpty) return info('🍊', 'Oralet: önce bardak al');
        return st.oralet > 0 ? act('🍊', `Oralet Yap (${st.oralet})`, () => this.makeOralet()) : info('🍊', 'Oralet bitti!');
      case 'simit':
      case 'soda':
      case 'su':
        if (full) return info('🍽️', 'Tepsi dolu');
        return (st[h.kind] ?? 0) > 0 ? act(DRINKS[h.kind].icon, `${DRINKS[h.kind].name} Al (${st[h.kind]})`, () => this.addSimple(h.kind)) : info(DRINKS[h.kind].icon, `${DRINKS[h.kind].name} bitti!`);
      case 'cop':
        return this.tray.length ? act('🗑️', 'Tepsiyi Boşalt', () => this.emptyTray(), 'gray') : info('🗑️', 'Çöp kovası');
      case 'lavabo':
        return this.dirty ? act('🧽', `Bardak Yıka (${this.dirty})`, () => this.wash(), 'blue') : info('🧽', 'Lavabo — kirli bardak yok');
      case 'raf':
        if (this.gear === h.game) return act('↩️', `${GAMES[h.game].name} — rafa koy`, () => this.returnGame(), 'gray');
        if (this.gear) return info(GAMES[h.game].icon, 'Elinde zaten bir takım var');
        return this.sets[h.game] - this.setsOut[h.game] > 0 ? act(GAMES[h.game].icon, `${GAMES[h.game].name} Al`, () => this.takeGame(h.game), 'blue') : info(GAMES[h.game].icon, `${GAMES[h.game].name} kalmadı`);
      case 'tv':
        return act('📺', this.tvOn ? 'TV Kapat' : 'TV Aç', () => { this.tvOn = !this.tvOn; this._tvKey = null; this.ctx.sfx.click(); }, 'gray');
      case 'kasa': {
        if (!this.payQueue.length) return info('💰', 'Kasa — bekleyen yok');
        const gp = this.payQueue[0];
        const arrived = gp.payer && !gp.payer.path.length;
        return arrived ? act('💰', `Ödeme Al (${gp.bill} TL)`, () => this._settle(gp)) : info('💰', 'Müşteri kasaya geliyor...');
      }
      case 'masa': {
        const t = h.t;
        if (t.idx >= this.tableCount) return null;
        if (t.state === 'ordering') {
          const want = t.order.map((x) => DRINKS[x].icon).join('');
          return this.tray.some((x) => t.order.includes(x.type)) ? act('🛎️', `Servis Et (${want})`, () => this.serveTable(t)) : info('🙋', `Sipariş: ${want}`);
        }
        if (t.wantGame && !t.game) return this.gear === t.wantGame ? act(GAMES[t.wantGame].icon, 'Takımı Ver', () => this.giveGame(t)) : info(GAMES[t.wantGame].icon, `${GAMES[t.wantGame].name} istiyorlar — raftan al`);
        if (t.state === 'dirty') return act('🧺', `Masayı Topla (${t.dirtyCups})`, () => this.collect(t), 'blue');
        return null;
      }
    }
    return null;
  }

  /** Ekran noktasından (−1..1) ışın: erişim mesafesindeki nesne. */
  pick(raycaster, reach = 2.7) {
    const res = raycaster.intersectObjects(this.hits, false);
    for (const r of res) {
      if (r.distance > reach) break;
      const h = r.object.userData.hit;
      if (h.kind === 'masa' && h.t.idx >= this.tableCount) continue;
      return h;
    }
    return null;
  }

  takeGlass() {
    if (this.tray.length >= this.trayMax) return this.ctx.toast('Tepsi dolu!', 'warn', 'trayfull');
    if (this.glassClean <= 0) return this.ctx.toast('Temiz bardak kalmadı! Lavaboda yıka 🧽', 'bad', 'noglass');
    this.glassClean--;
    this.tray.push({ type: 'bos', q: 'good' });
    this.ctx.sfx.clink?.();
    this.refreshTrayView();
  }
  makeOralet() {
    const k = this.tray.findIndex((x) => x.type === 'bos');
    if (k < 0 || this.ctx.stock.oralet <= 0) return;
    this.ctx.stock.oralet--;
    this.tray[k] = { type: 'oralet', q: 'good' };
    this.ctx.sfx.pour?.();
    this.refreshTrayView();

  }
}
