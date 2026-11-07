// =========================================================
// daynight.js — Gece/gündüz döngüsü: gökyüzü rengi, güneş/ay, yıldızlar, ışıklar, sis
// =========================================================
import * as THREE from 'three';

// [saat, gökyüzü rengi, güneş yoğunluğu, ortam (hemi) yoğunluğu]
const KEYS = [
  [0, 0x0b1026, 0.0, 0.5],
  [4.5, 0x101839, 0.0, 0.5],
  [5.5, 0x3b3a6e, 0.15, 0.62],
  [6.3, 0xf4a37a, 0.9, 0.9],
  [7.5, 0x9fd3ff, 1.9, 1.25],
  [12, 0x8fd3ff, 2.3, 1.4],
  [17, 0x9fd0ff, 2.0, 1.3],
  [18.6, 0xff9a5c, 1.0, 0.95],
  [19.5, 0x51417f, 0.25, 0.68],
  [20.5, 0x141a3d, 0.0, 0.52],
  [24, 0x0b1026, 0.0, 0.5],
];

const cA = new THREE.Color();
const cB = new THREE.Color();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const DAY_START = 7;      // uyanma saati
export const SHOP_HOURS = [7, 23];

/** Dakikayı "08:05" biçimine çevir. */
export function formatClock(totalMinutes) {
  const m = Math.floor(totalMinutes) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export class DayNight {
  constructor(scene, sun, hemi) {
    this.scene = scene;
    this.sun = sun;
    this.hemi = hemi;
    this.night = 0;
    this.sky = new THREE.Color();

    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 10), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false }));
    scene.add(this.sunDisc, this.moonDisc);

    const pts = [];
    for (let i = 0; i < 700; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.9 + 0.08;
      const r = 380;
      pts.push(new THREE.Vector3(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r));
    }
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.dir = new THREE.Vector3();
  }

  /**
   * @param {number} hour 0..24 (ondalıklı)
   * @param {THREE.Vector3} camPos kamera konumu (gök cisimleri onu takip eder)
   * @param {THREE.Vector3} focus gölge kamerasının odaklanacağı nokta
   * @returns {number} gece katsayısı (0 gündüz, 1 gece)
   */
  update(hour, camPos, focus) {
    // Anahtar karelerden ara değer
    let i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = clamp01((hour - a[0]) / (b[0] - a[0]));
    cA.setHex(a[1]);
    cB.setHex(b[1]);
    this.sky.copy(cA).lerp(cB, t);
    const sunI = a[2] + (b[2] - a[2]) * t;
    const hemiI = a[3] + (b[3] - a[3]) * t;

    const angle = ((hour - 6) / 12) * Math.PI;
    const elev = Math.sin(angle);
    const n = clamp01((0.15 - elev) / 0.4);
    this.night = n;

    this.scene.background.copy(this.sky);
    this.scene.fog.color.copy(this.sky);
    this.scene.fog.near = 70 - n * 25;
    this.scene.fog.far = 210 - n * 50;

    // Güneş ya da ay yönlü ışık olur
    const sunDir = this.dir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    const above = elev > -0.05;
    const lightDir = above ? sunDir : sunDir.clone().multiplyScalar(-1);
    this.sun.intensity = sunI + n * 0.45;
    const warm = clamp01(elev * 2.5);
    this.sun.color.setHex(0xffb070).lerp(cA.setHex(0xfff1d6), warm).lerp(cB.setHex(0x9fb4ff), n);
    this.sun.position.copy(focus).addScaledVector(lightDir, 60);
    this.sun.target.position.copy(focus);

    this.hemi.intensity = hemiI;
    this.hemi.color.setHex(0xfff4e0).lerp(cA.setHex(0x6a7bc0), n);
    this.hemi.groundColor.setHex(0x5a7d3c).lerp(cA.setHex(0x1a2030), n);

    this.sunDisc.position.copy(camPos).addScaledVector(sunDir, 320);
    this.sunDisc.visible = elev > -0.12;
    this.sunDisc.material.color.setHex(0xfff2b0).lerp(cA.setHex(0xff8a4c), 1 - warm);
    this.moonDisc.position.copy(camPos).addScaledVector(sunDir, -320);
    this.moonDisc.visible = elev < 0.12;
    this.stars.position.copy(camPos);
    this.starMat.opacity = n * n;
    return n;
  }
}
