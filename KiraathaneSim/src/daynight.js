// =========================================================
// daynight.js — Gece/gündüz döngüsü: gök kubbesi (renk geçişli + güneş parlaması),
// gökyüzünden ortam yansıması (IBL), güneş/ay ışığı, yıldızlar, sis
// =========================================================
import * as THREE from 'three';

// [saat, gökyüzü (ufuk) rengi, güneş yoğunluğu, ortam (hemi) yoğunluğu]
const KEYS = [
  [0, 0x0b1026, 0.0, 0.32],
  [4.5, 0x101839, 0.0, 0.32],
  [5.5, 0x3b3a6e, 0.15, 0.4],
  [6.3, 0xf4a37a, 1.1, 0.55],
  [7.5, 0xa9d6f5, 2.6, 0.7],
  [12, 0x9fd0f2, 3.1, 0.75],
  [17, 0xa8d0ee, 2.7, 0.7],
  [18.6, 0xff9a5c, 1.4, 0.55],
  [19.5, 0x51417f, 0.3, 0.42],
  [20.5, 0x141a3d, 0.0, 0.34],
  [24, 0x0b1026, 0.0, 0.32],
];

const cA = new THREE.Color();
const cB = new THREE.Color();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const DAY_START = 7;
export const SHOP_HOURS = [7, 23];

/** Dakikayı "08:05" biçimine çevir. */
export function formatClock(totalMinutes) {
  const m = Math.floor(totalMinutes) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunAmt;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(horizon, bottom, smoothstep(0.0, -0.3, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * sunAmt * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.5 + pow(s, 6.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class DayNight {
  constructor(scene, sun, hemi, renderer) {
    this.scene = scene;
    this.sun = sun;
    this.hemi = hemi;
    this.renderer = renderer;
    this.night = 0;
    this.sky = new THREE.Color();

    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      sunAmt: { value: 1 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Ortam yansıması (IBL) için ayrı küçük sahne: aynı gök malzemesi
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), skyMat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.envTimer = 0;
    this.envEnabled = true;

    this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false }));
    scene.add(this.moonDisc);

    const pts = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.9 + 0.06;
      const r = 380;
      pts.push(new THREE.Vector3(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r));
    }
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.dir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
  }

  _refreshEnv() {
    if (!this.envEnabled) {
      if (this.envRT) {
        this.envRT.dispose();
        this.envRT = null;
        this.scene.environment = null;
      }
      return;
    }
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  /**
   * @param {number} hour 0..24 (ondalıklı)
   * @param {THREE.Vector3} camPos kamera konumu (gök cisimleri onu takip eder)
   * @param {THREE.Vector3} focus gölge kamerasının odaklanacağı nokta
   * @param {number} dt
   * @returns {number} gece katsayısı (0 gündüz, 1 gece)
   */
  update(hour, camPos, focus, dt = 0.016) {
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

    // Gök kubbesi renkleri: ufuk açık, tepe koyu ve daha doygun
    const u = this.uniforms;
    u.horizon.value.copy(this.sky).lerp(cA.setRGB(1, 1, 1), 0.18 * (1 - n));
    u.top.value.copy(this.sky).multiplyScalar(0.55 + 0.1 * n).lerp(cA.setRGB(0.05, 0.25, 0.75), 0.35 * (1 - n));
    u.bottom.value.copy(u.horizon.value).multiplyScalar(0.55);

    this.scene.background = null;
    this.scene.fog.color.copy(u.horizon.value);
    this.scene.fog.near = 70 - n * 25;
    this.scene.fog.far = 230 - n * 60;

    const sunDir = this.dir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    u.sunDir.value.copy(sunDir);
    const warm = clamp01(elev * 2.5);
    u.sunColor.value.setHex(0xffa060).lerp(cA.setHex(0xfff3d8), warm);
    u.sunAmt.value = clamp01((elev + 0.08) * 6);

    const above = elev > -0.05;
    this.lightDir.copy(sunDir);
    if (!above) this.lightDir.multiplyScalar(-1);
    this.sun.intensity = sunI + n * 0.5;
    this.sun.color.setHex(0xffb070).lerp(cA.setHex(0xfff1d6), warm).lerp(cB.setHex(0x9fb4ff), n);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 60);
    this.sun.target.position.copy(focus);

    this.hemi.intensity = hemiI;
    this.hemi.color.setHex(0xfff4e0).lerp(cA.setHex(0x6a7bc0), n);
    this.hemi.groundColor.setHex(0x6b6a4a).lerp(cA.setHex(0x1a2030), n);

    this.dome.position.copy(camPos);
    this.moonDisc.position.copy(camPos).addScaledVector(sunDir, -330);
    this.moonDisc.visible = elev < 0.12;
    this.stars.position.copy(camPos);
    this.starMat.opacity = n * n;

    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 1.2;
      this._refreshEnv();
    }
    return n;
  }
}
