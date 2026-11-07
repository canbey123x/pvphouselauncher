// =========================================================
// donkey.js — Sevimli low-poly eşek: model, araba mantığında sürüş fiziği, animasyon
// =========================================================
import * as THREE from 'three';
import { addBox, addMesh, mat } from './city.js';

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Donkey {
  constructor(ctx, spawn) {
    this.ctx = ctx;
    this.spawn = spawn;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 9.5;   // m/s (~34 km/s — hızlı eşek!)
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
    const fur = 0x9c9189;
    const belly = 0xe3ddd3;
    const dark = 0x4a403a;
    const pink = 0xf0a6b0;

    this.body = new THREE.Group();
    this.group.add(this.body);
    addBox(this.body, 0.8, 0.72, 1.5, fur, 0, 1.12, 0);
    addBox(this.body, 0.7, 0.2, 1.3, belly, 0, 0.8, 0);

    // Boyun + yele
    this.neck = new THREE.Group();
    this.neck.position.set(0, 1.35, 0.62);
    this.body.add(this.neck);
    addBox(this.neck, 0.4, 0.78, 0.42, fur, 0, 0.3, 0.12).rotation.x = 0.5;
    addBox(this.neck, 0.12, 0.72, 0.18, dark, 0, 0.42, -0.08).rotation.x = 0.5;

    // Kafa
    this.head = new THREE.Group();
    this.head.position.set(0, 0.68, 0.38);
    this.neck.add(this.head);
    addBox(this.head, 0.46, 0.44, 0.62, fur, 0, 0, 0.12);
    addBox(this.head, 0.44, 0.34, 0.28, belly, 0, -0.07, 0.52);
    addBox(this.head, 0.06, 0.06, 0.03, 0x2a1f1a, -0.1, -0.03, 0.67, false);
    addBox(this.head, 0.06, 0.06, 0.03, 0x2a1f1a, 0.1, -0.03, 0.67, false);
    addBox(this.head, 0.2, 0.04, 0.03, 0x6b4a4a, 0, -0.17, 0.67, false); // gülümseme
    for (const s of [-1, 1]) {
      addBox(this.head, 0.04, 0.17, 0.17, 0xffffff, s * 0.235, 0.08, 0.2, false);
      addBox(this.head, 0.03, 0.1, 0.1, 0x111111, s * 0.255, 0.07, 0.23, false);
      addBox(this.head, 0.02, 0.035, 0.035, 0xffffff, s * 0.27, 0.1, 0.26, false);
    }
    addBox(this.head, 0.2, 0.12, 0.2, dark, 0, 0.26, 0.15, false); // perçem

    // Kulaklar (kocaman ve sevimli)
    this.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.14, 0.22, 0.02);
      ear.rotation.z = -s * 0.28;
      this.head.add(ear);
      addBox(ear, 0.13, 0.55, 0.08, fur, 0, 0.27, 0);
      addBox(ear, 0.07, 0.42, 0.02, pink, 0, 0.27, 0.045, false);
      addBox(ear, 0.13, 0.1, 0.08, dark, 0, 0.54, 0, false);
      this.ears.push(ear);
    }

    // Bacaklar (omuz/kalçadan dönen pivotlar)
    this.legs = [];
    for (const [lx, lz] of [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.88, lz);
      this.group.add(leg);
      addBox(leg, 0.17, 0.72, 0.17, fur, 0, -0.38, 0);
      addBox(leg, 0.19, 0.12, 0.21, 0x2b2420, 0, -0.8, 0.01);
      this.legs.push(leg);
    }

    // Kuyruk
    this.tail = new THREE.Group();
    this.tail.position.set(0, 1.35, -0.75);
    this.body.add(this.tail);
    addBox(this.tail, 0.07, 0.6, 0.07, fur, 0, -0.3, 0);
    addBox(this.tail, 0.15, 0.24, 0.15, dark, 0, -0.64, 0);

    // Kilim desenli eyer + heybe
    addBox(this.body, 0.86, 0.08, 0.72, 0xb3262e, 0, 1.52, -0.05);
    addBox(this.body, 0.88, 0.04, 0.12, 0xffcf3f, 0, 1.55, 0.18, false);
    addBox(this.body, 0.88, 0.04, 0.12, 0x1d3557, 0, 1.55, -0.28, false);
    for (const s of [-1, 1]) {
      addBox(this.body, 0.05, 0.5, 0.7, 0xb3262e, s * 0.43, 1.28, -0.05);
      addBox(this.body, 0.06, 0.08, 0.7, 0xffcf3f, s * 0.44, 1.08, -0.05, false);
      addBox(this.body, 0.14, 0.34, 0.38, 0x7a4a25, s * 0.5, 1.15, -0.45);
    }
    // Nazar boncuklu tasma
    addBox(this.body, 0.46, 0.08, 0.46, 0xd62828, 0, 1.55, 0.78, false).rotation.x = 0.5;
    const nazar = new THREE.Group();
    nazar.position.set(0, 1.35, 0.98);
    this.body.add(nazar);
    addMesh(nazar, new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), mat(0x1d5fd1, { emissive: 0x0a2050 }), 0, 0, 0, false).rotation.x = Math.PI / 2;
    addMesh(nazar, new THREE.CylinderGeometry(0.055, 0.055, 0.035, 12), 0xffffff, 0, 0, 0.003, false).rotation.x = Math.PI / 2;
    addMesh(nazar, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), 0x111111, 0, 0, 0.006, false).rotation.x = Math.PI / 2;
  }

  /** Sürücü oturma noktası (dünya koordinatı). */
  seatWorld(out) {
    this.group.updateMatrixWorld(true);
    return this.group.localToWorld(out.set(0, 1.58, -0.08));
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

    // --- Sürüş fiziği (araba mantığı) ---
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

    // --- Animasyon ---
    const sp = Math.abs(this.speed);
    if (sp > 0.05) this.phase += dt * (3 + sp * 1.5);
    const amp = Math.min(1, sp / 3) * 0.7;
    const s = Math.sin(this.phase) * amp;
    this.legs[0].rotation.x = s;
    this.legs[3].rotation.x = s;
    this.legs[1].rotation.x = -s;
    this.legs[2].rotation.x = -s;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.07 * amp;

    this.steerVis += (steer * Math.min(1, sp / 4) - this.steerVis) * Math.min(1, dt * 6);
    this.body.rotation.z = -this.steerVis * 0.1;

    this.tail.rotation.z = Math.sin(this.t * 3) * 0.4;
    this.tail.rotation.x = 0.3 + Math.min(sp, 8) * 0.06;
    const twitch = Math.sin(this.t * 1.7) > 0.95 ? 0.35 : 0;
    this.ears[0].rotation.x = -Math.min(sp, 8) * 0.07 + twitch;
    this.ears[1].rotation.x = -Math.min(sp, 8) * 0.07 + Math.sin(this.t * 2.3) * 0.08;

    if (this.brayT > 0) {
      this.brayT -= dt;
      const k = Math.sin((1.3 - this.brayT) * 10);
      this.head.rotation.x = -0.55 + k * 0.15;
      this.neck.rotation.x = -0.25;
    } else {
      this.head.rotation.x = Math.sin(this.phase * 2) * 0.05 * amp + Math.sin(this.t * 0.8) * 0.05;
      this.neck.rotation.x = sp < 0.1 ? 0.12 + Math.sin(this.t * 0.6) * 0.06 : 0;
    }
    this._sync();
  }

  _sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}
