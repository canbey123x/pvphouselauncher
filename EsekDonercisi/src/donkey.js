// =========================================================
// donkey.js — Gerçek oranlı eşek: fıçı gövde, eklemli bacaklar (diz/topuk), uzun kulaklar,
// yele, kilim eyer; araba mantığında sürüş fiziği ve yürüyüş/tırıs animasyonu
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, mat, bakeHierarchy, canvasTexture } from './city.js';

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cap = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 4, seg);

export class Donkey {
  constructor(ctx, spawn) {
    this.ctx = ctx;
    this.spawn = spawn;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 9.5;
    this.maxReverse = 3;
    this.accel = 5.5;
    this.brakeDecel = 16;
    this.friction = 3;
    this.turnRate = 2.3;
    this.radius = 0.8;

    this.phase = 0;
    this.t = 0;
    this.brayT = 0;
    this.steerVis = 0;
    this.ridden = false;
    this.bumpCooldown = 0;

    this._build();
    this.reset();
  }

  reset() {
    this.pos.set(this.spawn.x, 0, this.spawn.z);
    this.heading = this.spawn.heading;
    this.speed = 0;
    this.ridden = false;
    this.brayT = 0;
    this._sync();
  }

  _build() {
    const fur = 0x8c8279;
    const pale = 0xd8d0c4;
    const dark = 0x3b322c;
    const M = (parent, geo, color, x, y, z, shadow = true) => addMesh(parent, geo, typeof color === 'number' ? mat(color, { roughness: 0.95 }) : color, x, y, z, shadow);

    this.body = new THREE.Group();
    this.group.add(this.body);

    // Fıçı gövde + açık renk karın + omuz/sağrı kasları
    const barrel = cap(0.3, 0.62, 16);
    barrel.rotateX(Math.PI / 2);
    barrel.scale(0.92, 1, 1);
    M(this.body, barrel, fur, 0, 0.98, 0);
    const belly = cap(0.24, 0.45, 12);
    belly.rotateX(Math.PI / 2);
    belly.scale(0.95, 0.75, 1);
    M(this.body, belly, pale, 0, 0.84, 0.02, false);
    const rump = new THREE.SphereGeometry(0.3, 16, 12);
    rump.scale(0.95, 0.95, 0.9);
    M(this.body, rump, fur, 0, 1.0, -0.42);
    const shoulder = new THREE.SphereGeometry(0.27, 16, 12);
    shoulder.scale(0.9, 1.05, 0.9);
    M(this.body, shoulder, fur, 0, 1.0, 0.42);
    // Sırttaki koyu çizgi (eşeklere özgü)
    const stripe = new THREE.BoxGeometry(0.05, 0.02, 1.15);
    M(this.body, stripe, dark, 0, 1.275, -0.02, false);

    // Boyun + yele
    this.neck = new THREE.Group();
    this.neck.position.set(0, 1.1, 0.55);
    this.body.add(this.neck);
    const neckGeo = cap(0.13, 0.36, 12);
    neckGeo.scale(0.85, 1, 1.15);
    const neckM = M(this.neck, neckGeo, fur, 0, 0.2, 0.1);
    neckM.rotation.x = 0.75;
    const mane = new THREE.BoxGeometry(0.06, 0.48, 0.1);
    const maneM = M(this.neck, mane, dark, 0, 0.27, 0.0, false);
    maneM.rotation.x = 0.75;

    // Kafa (uzun yüz, açık renk burun, iri gözler)
    this.head = new THREE.Group();
    this.head.position.set(0, 0.42, 0.32);
    this.neck.add(this.head);
    const skull = cap(0.115, 0.26, 14);
    skull.rotateX(Math.PI / 2);
    skull.scale(0.9, 1.05, 1);
    M(this.head, skull, fur, 0, 0, 0.12);
    const muzzle = new THREE.SphereGeometry(0.11, 14, 10);
    muzzle.scale(0.95, 0.85, 1.1);
    M(this.head, muzzle, pale, 0, -0.04, 0.33);
    const nose = new THREE.SphereGeometry(0.07, 12, 8);
    nose.scale(1.1, 0.7, 0.6);
    M(this.head, nose, 0x4a3f3a, 0, -0.03, 0.42, false);
    for (const s of [-1, 1]) {
      M(this.head, new THREE.SphereGeometry(0.016, 8, 6), 0x111111, s * 0.035, -0.015, 0.455, false);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.15 }));
      eye.position.set(s * 0.1, 0.06, 0.1);
      this.head.add(eye);
      M(this.head, new THREE.SphereGeometry(0.036, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), pale, s * 0.1, 0.075, 0.095, false);
    }
    // Perçem
    const fore = new THREE.SphereGeometry(0.06, 10, 8);
    fore.scale(1, 0.6, 1.3);
    M(this.head, fore, dark, 0, 0.12, -0.02, false);

    // Kulaklar (uzun, içi açık, uçları koyu)
    this.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.07, 0.1, -0.04);
      ear.rotation.z = -s * 0.35;
      ear.rotation.x = -0.2;
      this.head.add(ear);
      const eg = new THREE.SphereGeometry(0.05, 10, 10);
      eg.scale(0.9, 4.2, 0.55);
      M(ear, eg, fur, 0, 0.19, 0);
      const ig = new THREE.SphereGeometry(0.035, 8, 8);
      ig.scale(0.8, 3.8, 0.3);
      M(ear, ig, 0xe8c0b8, 0, 0.18, 0.018, false);
      const tip = new THREE.SphereGeometry(0.03, 8, 6);
      tip.scale(1, 1.6, 0.6);
      M(ear, tip, dark, 0, 0.38, 0, false);
      this.ears.push(ear);
    }

    // Bacaklar: üst (kalça/omuz) → diz/topuk → incik + toynak
    this.legs = [];
    this.knees = [];
    for (const [lx, lz, front] of [[-0.17, 0.42, true], [0.17, 0.42, true], [-0.17, -0.42, false], [0.17, -0.42, false]]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.85, lz);
      this.group.add(leg);
      const upper = cap(front ? 0.07 : 0.085, 0.24, 10);
      M(leg, upper, fur, 0, -0.17, 0);
      const knee = new THREE.Group();
      knee.position.set(0, -0.38, 0);
      leg.add(knee);
      M(knee, cap(0.042, 0.3, 8), pale, 0, -0.19, 0);
      const hoof = new THREE.CylinderGeometry(0.048, 0.06, 0.08, 12);
      M(knee, hoof, 0x2a2420, 0, -0.43, 0.01);
      this.legs.push(leg);
      this.knees.push(knee);
    }

    // Kuyruk (ince, ucu püsküllü)
    this.tail = new THREE.Group();
    this.tail.position.set(0, 1.12, -0.66);
    this.body.add(this.tail);
    M(this.tail, cap(0.025, 0.4, 6).translate(0, -0.24, 0), fur, 0, 0, 0);
    const tuft = new THREE.SphereGeometry(0.06, 8, 8);
    tuft.scale(0.8, 1.8, 0.8);
    M(this.tail, tuft, dark, 0, -0.5, 0);

    // Kilim desenli eyer, heybe, dizgin
    const kilim = canvasTexture(256, 128, (c, w, h) => {
      c.fillStyle = '#9d0208';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd166';
      c.fillRect(0, 10, w, 8);
      c.fillRect(0, h - 18, w, 8);
      for (let i = 0; i < 7; i++) {
        const cx = 20 + i * 36;
        c.fillStyle = i % 2 ? '#1d3557' : '#ffd166';
        c.beginPath();
        c.moveTo(cx, 30); c.lineTo(cx + 14, h / 2); c.lineTo(cx, h - 30); c.lineTo(cx - 14, h / 2);
        c.closePath();
        c.fill();
        c.fillStyle = '#fff';
        c.fillRect(cx - 3, h / 2 - 3, 6, 6);
      }
    });
    const kilimMat = new THREE.MeshStandardMaterial({ map: kilim, roughness: 0.95 });
    const blanket = new THREE.CylinderGeometry(0.32, 0.32, 0.6, 20, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
    blanket.rotateX(Math.PI / 2);
    blanket.rotateZ(Math.PI / 2);
    const bl = new THREE.Mesh(blanket, new THREE.MeshStandardMaterial({ map: kilim, roughness: 0.95, side: THREE.DoubleSide }));
    bl.position.set(0, 0.99, -0.02);
    bl.rotation.y = Math.PI / 2;
    bl.castShadow = true;
    this.body.add(bl);
    const saddle = new THREE.Mesh(cap(0.12, 0.22, 10).rotateX(Math.PI / 2).scale(1.4, 0.45, 1), kilimMat);
    saddle.position.set(0, 1.3, -0.05);
    saddle.castShadow = true;
    this.body.add(saddle);
    for (const s of [-1, 1]) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.3), new THREE.MeshStandardMaterial({ color: 0x7a4a25, roughness: 0.8 }));
      bag.position.set(s * 0.34, 0.95, -0.38);
      bag.castShadow = true;
      this.body.add(bag);
    }
    // Yular (burun kayışı) + nazar boncuğu
    const halter = new THREE.TorusGeometry(0.115, 0.012, 6, 18);
    M(this.head, halter, 0xb3262e, 0, -0.02, 0.28, false);
    const nazar = new THREE.Group();
    nazar.position.set(0, -0.2, 0.18);
    this.neck.add(nazar);
    addMesh(nazar, new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16), mat(0x1d5fd1, { emissive: 0x0a2050, roughness: 0.2 }), 0, 0, 0, false).rotation.x = Math.PI / 2;
    addMesh(nazar, new THREE.CylinderGeometry(0.028, 0.028, 0.018, 14), mat(0xffffff, { roughness: 0.2 }), 0, 0, 0.002, false).rotation.x = Math.PI / 2;
    addMesh(nazar, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), mat(0x111111, { roughness: 0.2 }), 0, 0, 0.004, false).rotation.x = Math.PI / 2;

    bakeHierarchy(this.group);
  }

  /** Sürücü oturma noktası (dünya koordinatı). */
  seatWorld(out) {
    this.group.updateMatrixWorld(true);
    return this.group.localToWorld(out.set(0, 1.33, -0.05));
  }

  bray() {
    if (this.brayT > 0) return;
    this.brayT = 1.3;
    this.ctx.sfx.bray();
    this.ctx.toast('AAİİ-ÜÜÜ! 🐴 (Eşek mutlu)', 'info', 'bray');
  }

  /**
   * @param {number} dt
   * @param {{throttle:number, steer:number, brake:boolean}|null} input  null => kimse binmiyor
   */
  update(dt, input) {
    this.t += dt;
    this.bumpCooldown -= dt;
    const throttle = input ? input.throttle : 0;
    const steer = input ? input.steer : 0;
    const brake = input ? input.brake : false;

    if (brake) {
      this.speed = approach(this.speed, 0, this.brakeDecel * dt);
    } else if (Math.abs(throttle) > 0.05) {
      const target = throttle > 0 ? throttle * this.maxSpeed : throttle * this.maxReverse;
      const braking = Math.sign(target) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.2;
      this.speed = approach(this.speed, target, (braking ? 12 : this.accel) * dt);
    } else {
      this.speed = approach(this.speed, 0, this.friction * dt);
    }

    const steerFactor = clamp(this.speed / 3, -1, 1);
    this.heading -= steer * this.turnRate * steerFactor * dt;

    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    if (this.ctx.world.resolve(this.pos, this.radius)) {
      if (Math.abs(this.speed) > 4 && this.bumpCooldown <= 0) {
        this.ctx.sfx.bump();
        this.ctx.toast('Dikkat! Eşek duvara toslamak istemiyor 😵', 'warn', 'bump');
        this.bumpCooldown = 1.5;
      }
      this.speed *= 0.4;
    }
    this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z);

    // --- Yürüyüş (dörtlü adım) / tırıs (çapraz çiftler) ---
    const sp = Math.abs(this.speed);
    if (sp > 0.05) this.phase += dt * (4 + sp * 1.4) * Math.sign(this.speed || 1);
    const amp = Math.min(1, sp / 2.5);
    const trot = clamp((sp - 3) / 3, 0, 1);
    // önler: 0 ve π, arkalar: yürüyüşte 1/4 kaydırılmış, tırısta çapraz eş
    const phases = [0, Math.PI, Math.PI * (0.5 + 0.5 * trot), Math.PI * (1.5 - 0.5 * trot) + Math.PI * trot];
    for (let i = 0; i < 4; i++) {
      const ph = this.phase + phases[i];
      const swing = Math.sin(ph) * 0.5 * amp;
      this.legs[i].rotation.x = swing;
      const lift = Math.max(0, Math.sin(ph + 1.4)) * amp;
      // ön dizler geriye, arka topuklar öne bükülür
      this.knees[i].rotation.x = i < 2 ? lift * 1.1 : -lift * 0.9;
    }
    this.body.position.y = Math.abs(Math.sin(this.phase * 2)) * 0.035 * amp * (0.5 + trot);
    this.body.rotation.x = Math.sin(this.phase * 2) * 0.02 * amp;

    this.steerVis += (steer * Math.min(1, sp / 4) - this.steerVis) * Math.min(1, dt * 6);
    this.body.rotation.z = -this.steerVis * 0.08;

    this.tail.rotation.z = Math.sin(this.t * 2.6) * 0.35;
    this.tail.rotation.x = 0.25 + Math.min(sp, 8) * 0.05 + Math.sin(this.t * 1.7) * 0.05;
    const twitch = Math.sin(this.t * 1.7) > 0.95 ? 0.4 : 0;
    this.ears[0].rotation.x = -0.2 - Math.min(sp, 8) * 0.06 + twitch;
    this.ears[1].rotation.x = -0.2 - Math.min(sp, 8) * 0.06 + Math.sin(this.t * 2.3) * 0.1;

    if (this.brayT > 0) {
      this.brayT -= dt;
      const k = Math.sin((1.3 - this.brayT) * 10);
      this.head.rotation.x = -0.6 + k * 0.15;
      this.neck.rotation.x = -0.3;
    } else {
      this.head.rotation.x = 0.35 + Math.sin(this.phase * 2) * 0.05 * amp + Math.sin(this.t * 0.8) * 0.04;
      this.neck.rotation.x = sp < 0.1 ? 0.15 + Math.sin(this.t * 0.6) * 0.08 : -0.05 + 0.05 * trot;
    }
    this._sync();
  }

  _sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}
