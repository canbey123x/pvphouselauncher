// =========================================================
// house.js — Ustanın evinin içi: yatak (uyku), sedir, çay sehpası, pencere, kapı.
// Oda, kasabadan uzak ve kapalı bir alanda kurulur; içeri girince oyuncu buraya ışınlanır.
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, mat, canvasTexture, resolveCircle } from './city.js';

export const ROOM_ORIGIN = new THREE.Vector3(420, 0, 0);
const W = 10;
const D = 8;
const H = 3.4;
const FLOOR_Y = 0.1;

export class Home {
  constructor(scene) {
    const o = ROOM_ORIGIN;
    const g = new THREE.Group();
    g.position.copy(o);
    scene.add(g);
    this.group = g;
    this.colliders = [];
    const col = (x0, x1, z0, z1) => this.colliders.push({ minX: o.x + x0, maxX: o.x + x1, minZ: o.z + z0, maxZ: o.z + z1, h: H });

    const wall = 0xf3e3c3;
    const wood = 0xa0703c;

    // Zemin, parke çizgileri, halı
    // Kamera odanın açık güney tarafında durur; zemin/duvar/tavan o tarafa uzar (kesit görünüm)
    const EXT = 7;
    addBox(g, W, 0.1, D + EXT, wood, 0, 0.05, EXT / 2);
    for (let z = -D / 2 + 0.5; z < D / 2 + EXT; z += 0.6) addBox(g, W, 0.004, 0.03, 0x7a5228, 0, 0.102, z, false);
    const kilim = canvasTexture(256, 160, (c, w, h) => {
      c.fillStyle = '#9d0208';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffd166';
      c.lineWidth = 10;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#1d3557';
      c.fillRect(22, 22, w - 44, h - 44);
      for (let i = 0; i < 4; i++) {
        const cx = 48 + i * 54;
        c.fillStyle = i % 2 ? '#ffd166' : '#e63946';
        c.beginPath();
        c.moveTo(cx, h / 2 - 34);
        c.lineTo(cx + 22, h / 2);
        c.lineTo(cx, h / 2 + 34);
        c.lineTo(cx - 22, h / 2);
        c.closePath();
        c.fill();
        c.fillStyle = '#fff';
        c.fillRect(cx - 4, h / 2 - 4, 8, 8);
      }
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshStandardMaterial({ map: kilim }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.3, 0.106, 0.4);
    rug.receiveShadow = true;
    g.add(rug);

    // Duvarlar + tavan (kapı güney duvarında, x = 3.2)
    addBox(g, W + 0.4, H, 0.2, wall, 0, H / 2, -D / 2 - 0.1);
    addBox(g, 0.2, H, D + EXT, wall, -W / 2 - 0.1, H / 2, EXT / 2);
    addBox(g, 0.2, H, D + EXT, wall, W / 2 + 0.1, H / 2, EXT / 2);
    addBox(g, W + 0.4, H, 0.2, 0x3b2a1e, 0, H / 2, D / 2 + EXT + 0.1);
    addBox(g, W + 0.4, 0.2, D + EXT + 0.4, 0xfaf3e6, 0, H + 0.1, EXT / 2, false);
    // Alçak sınır (oyuncu bu çizgiyi geçemez) — süpürgelik + saksılar
    addBox(g, W, 0.25, 0.25, 0x8b5a2b, 0, 0.22, D / 2 + 0.15);
    for (const px of [-4, -1.3, 1.3, 4]) {
      addMesh(g, new THREE.CylinderGeometry(0.22, 0.17, 0.35, 8), 0xa0522d, px, 0.45, D / 2 + 0.15, false);
      addMesh(g, new THREE.IcosahedronGeometry(0.3, 0), 0x4f9a3c, px, 0.8, D / 2 + 0.15, false);
    }
    // Lambri (alt duvar şeridi)
    addBox(g, W, 0.9, 0.04, 0xc9a27e, 0, 0.55, -D / 2 + 0.02, false);
    addBox(g, 0.04, 0.9, D, 0xc9a27e, -W / 2 + 0.02, 0.55, 0, false);
    addBox(g, 0.04, 0.9, D, 0xc9a27e, W / 2 - 0.02, 0.55, 0, false);
    col(-W / 2 - 1, W / 2 + 1, -D / 2 - 1, -D / 2);
    col(-W / 2 - 1, W / 2 + 1, D / 2, D / 2 + 1);
    col(-W / 2 - 1, -W / 2, -D / 2 - 1, D / 2 + 1);
    col(W / 2, W / 2 + 1, -D / 2 - 1, D / 2 + 1);

    // Kapı (doğu duvarı, güney ucunda)
    const DZ = 2.6;
    addBox(g, 0.08, 2.3, 1.3, 0x3b2314, W / 2 - 0.02, 1.15, DZ, false);
    addBox(g, 0.06, 2.15, 1.1, 0x1d3557, W / 2 - 0.06, 1.1, DZ, false);
    addBox(g, 0.1, 0.1, 0.1, 0xf2c037, W / 2 - 0.12, 1.1, DZ - 0.4, false);
    addBox(g, 0.6, 0.05, 1.0, 0x6a994e, W / 2 - 0.45, 0.13, DZ, false); // paspas

    // Pencere (gökyüzü rengi saate göre değişir)
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, fog: false });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.3), this.windowMat);
    win.position.set(1.2, 1.95, -D / 2 + 0.02);
    g.add(win);
    addBox(g, 2.2, 0.1, 0.1, 0xffffff, 1.2, 2.65, -D / 2 + 0.05, false);
    addBox(g, 2.2, 0.1, 0.1, 0xffffff, 1.2, 1.25, -D / 2 + 0.05, false);
    addBox(g, 0.08, 1.4, 0.1, 0xffffff, 1.2, 1.95, -D / 2 + 0.05, false);
    addBox(g, 2.4, 0.08, 0.3, 0xffffff, 1.2, 1.2, -D / 2 + 0.15, false);
    addBox(g, 0.5, 1.9, 0.06, 0xb3262e, -0.05, 1.85, -D / 2 + 0.12, false);
    addBox(g, 0.5, 1.9, 0.06, 0xb3262e, 2.45, 1.85, -D / 2 + 0.12, false);
    addMesh(g, new THREE.CylinderGeometry(0.14, 0.11, 0.22, 8), 0xa0522d, 0.6, 1.35, -D / 2 + 0.17, false);
    addMesh(g, new THREE.IcosahedronGeometry(0.2, 0), 0x5fae47, 0.6, 1.58, -D / 2 + 0.17, false);

    // Yatak (kuzeybatı köşesi)
    const bx = -3.8;
    addBox(g, 1.7, 0.4, 2.5, 0x6b3e26, bx, 0.3, -2.6);
    addBox(g, 1.8, 1.1, 0.12, 0x6b3e26, bx, 0.75, -3.88);
    addBox(g, 1.6, 0.25, 2.4, 0xf5f5f0, bx, 0.62, -2.6);
    addBox(g, 1.64, 0.12, 1.5, 0xb3262e, bx, 0.78, -2.05);
    addBox(g, 1.66, 0.04, 0.2, 0xffd166, bx, 0.85, -2.6, false);
    addBox(g, 1.2, 0.18, 0.45, 0xffffff, bx, 0.83, -3.45);
    col(bx - 0.9, bx + 0.9, -4, -1.3);
    this.bedPoint = new THREE.Vector3(o.x + bx + 1.5, 0, o.z - 2.3);
    this.sleepPose = { pos: new THREE.Vector3(o.x + bx, 0.92, o.z - 1.55) };

    // Komodin + gece lambası
    addBox(g, 0.6, 0.6, 0.5, 0x8b5a2b, bx + 1.3, 0.3, -3.6);
    addMesh(g, new THREE.CylinderGeometry(0.15, 0.2, 0.3, 8), mat(0xffe8a8, { emissive: 0x806020 }), bx + 1.3, 0.8, -3.6, false);
    col(bx + 1.0, bx + 1.6, -3.9, -3.3);

    // Sedir (doğu duvarı)
    addBox(g, 0.9, 0.45, 3.2, 0x8b1e2d, 4.4, 0.32, -1);
    addBox(g, 0.25, 0.55, 3.2, 0xc1121f, 4.85, 0.8, -1);
    [0xffd166, 0x2a9d8f, 0xffd166].forEach((c, i) => addBox(g, 0.18, 0.4, 0.5, c, 4.65, 0.8, -2.1 + i * 1.1));
    col(3.9, 5, -2.65, 0.65);

    // Çay sehpası
    addBox(g, 1.2, 0.08, 0.8, 0x6b3e26, 2.6, 0.48, -1);
    for (const [lx, lz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) addBox(g, 0.07, 0.42, 0.07, 0x4a2a16, 2.6 + lx, 0.26, -1 + lz, false);
    addMesh(g, new THREE.CylinderGeometry(0.13, 0.15, 0.2, 10), 0xc9d1d8, 2.4, 0.62, -1);
    addMesh(g, new THREE.CylinderGeometry(0.09, 0.11, 0.15, 10), 0xc9d1d8, 2.4, 0.8, -1);
    for (const gx of [2.85, 3.05]) addMesh(g, new THREE.CylinderGeometry(0.045, 0.035, 0.11, 8), mat(0xc0392b, { transparent: true, opacity: 0.85 }), gx, 0.58, -0.85, false);
    col(1.95, 3.25, -1.45, -0.55);
    this.teaPoint = new THREE.Vector3(o.x + 2.6, 0, o.z + 0.15);

    // TV dolabı (batı duvarı)
    addBox(g, 0.6, 0.6, 1.6, 0x8b5a2b, -4.6, 0.35, 1.2);
    addBox(g, 0.12, 0.8, 1.3, 0x111111, -4.55, 1.1, 1.2);
    addBox(g, 0.02, 0.68, 1.16, mat(0x2a3d66, { emissive: 0x0d1630 }), -4.48, 1.1, 1.2, false);
    col(-5, -4.2, 0.35, 2.05);

    // Gardırop
    addBox(g, 1.6, 2.3, 0.7, 0x7a4a25, 3.6, 1.2, -3.6);
    addBox(g, 0.04, 2.1, 0.02, 0x3b2314, 3.6, 1.2, -3.24, false);
    for (const hx of [3.48, 3.72]) addBox(g, 0.04, 0.2, 0.04, 0xf2c037, hx, 1.2, -3.23, false);
    col(2.75, 4.45, -4, -3.2);

    // Duvar tablosu (batı duvarı)
    const art = canvasTexture(128, 96, (c, w, h) => {
      c.fillStyle = '#9fd3ff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a6f97'; c.fillRect(0, h * 0.62, w, h);
      c.fillStyle = '#5b8a3e';
      c.beginPath(); c.moveTo(0, h * 0.65); c.lineTo(40, 20); c.lineTo(80, h * 0.65); c.fill();
      c.beginPath(); c.moveTo(50, h * 0.65); c.lineTo(95, 30); c.lineTo(140, h * 0.65); c.fill();
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(100, 20, 10, 0, Math.PI * 2); c.fill();
    });
    addBox(g, 0.06, 1.0, 1.3, 0x8b5a2b, -4.96, 2.1, -0.6, false);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85), new THREE.MeshBasicMaterial({ map: art }));
    pic.rotation.y = Math.PI / 2;
    pic.position.set(-4.92, 2.1, -0.6);
    g.add(pic);

    // Köşe saksısı
    addMesh(g, new THREE.CylinderGeometry(0.3, 0.22, 0.5, 8), 0xa0522d, -4.4, 0.35, 3.4);
    addMesh(g, new THREE.IcosahedronGeometry(0.55, 0), 0x3f8a33, -4.4, 1.0, 3.4);
    col(-4.75, -4.05, 3.05, 3.75);

    // Tavan lambası + oda ışığı
    addMesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), 0x333333, 0, H - 0.25, 0, false);
    addMesh(g, new THREE.SphereGeometry(0.22, 10, 8), mat(0xfff1c0, { emissive: 0xbfa060 }), 0, H - 0.55, 0, false);
    this.light = new THREE.PointLight(0xffd9a0, 0, 16, 1.6);
    this.light.position.set(o.x, H - 0.7, o.z + 0.5);
    scene.add(this.light);

    this.entry = new THREE.Vector3(o.x + W / 2 - 1.1, FLOOR_Y, o.z + DZ);
    this.doorPoint = new THREE.Vector3(o.x + W / 2 - 0.6, 0, o.z + DZ);
    this.camPos = new THREE.Vector3();
    this.teaCooldown = 0;
  }

  resolve(pos, r) {
    return resolveCircle(pos, r, this.colliders, 0);
  }

  heightAt() {
    return FLOOR_Y;
  }

  /** Oda içi kamera: odanın açık (kesit) tarafından, tavan hizasından oyuncuya bakar. */
  cameraFor(playerPos, out) {
    const o = ROOM_ORIGIN;
    const x = o.x + (playerPos.x - o.x) * 0.45;
    const z = Math.min(o.z + 10.4, playerPos.z + 7.6);
    return out.set(x, 3.2, z);
  }

  /** Pencere rengi ve oda ışığı saate göre. */
  setDaylight(skyColor, night, active) {
    this.windowMat.color.copy(skyColor);
    this.light.intensity = active ? 10 + night * 22 : 0;
  }
}
