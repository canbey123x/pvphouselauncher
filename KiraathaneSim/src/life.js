// =========================================================
// life.js — Şehir hayatı: trafikteki arabalar (sağdan akış, oyuncu ve eşek için durur,
// korna çalar, gece farları yanar), kaldırımlarda yürüyen kalabalık ve sokak kedileri
// =========================================================
import * as THREE from 'three';
import { H_ROADS, V_ROADS, rng } from './city.js';
import { createPerson, animatePerson } from './npcs.js';

const LIMIT = 108;
const CAR_COLORS = [0xf2f2f0, 0xb3121b, 0x1d3557, 0x2a7f78, 0xd4a017, 0x6c757d, 0x151515, 0x8d99ae, 0x7a1f2b, 0xdedad0];

/** Bir grubun meshlerini malzemeye göre tek geometride birleştir (araba gibi katı modeller için). */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const meshes = [];
  group.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const m of meshes) {
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(geo);
    m.parent.remove(m);
  }
  for (const [material, geos] of buckets) {
    let count = 0;
    for (const g of geos) count += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const arr = new Float32Array(count * size);
      let off = 0;
      for (const g of geos) {
        arr.set(g.attributes[name].array, off * size);
        off += g.attributes.position.count;
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    const mesh = new THREE.Mesh(out, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
}

export class Life {
  constructor(ctx, quality = 'high') {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.rand = rng(4242);
    this.t = 0;
    this.cars = [];
    this.walkers = [];
    this.cats = [];
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0x000000, roughness: 0.2 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0b0b, emissive: 0x200000, roughness: 0.3 });
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2632, roughness: 0.06, metalness: 0.6 });
    this.blackMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.75 });
    this.chromeMat = new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.15, metalness: 1 });
    this.paints = new Map();
    this.nearestCar = 999;
    this.honkCd = 0;
    this._buildCars(quality === 'low' ? 6 : 12);
    this._buildWalkers(quality === 'low' ? 0 : 10);
    this._buildCats();
  }

  _paint(color) {
    if (!this.paints.has(color)) this.paints.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 }));
    return this.paints.get(color);
  }

  _carModel(color) {
    const g = new THREE.Group();
    const paint = this._paint(color);
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    // Gövde: alt kasa, kaput eğimi, kabin
    const body = new THREE.BoxGeometry(1.78, 0.55, 4.25);
    add(body, paint, 0, 0.62, 0);
    const hood = new THREE.BoxGeometry(1.74, 0.16, 1.2);
    add(hood, paint, 0, 0.94, 1.35).rotation.x = 0.08;
    const cabin = new THREE.BoxGeometry(1.6, 0.52, 2.05);
    add(cabin, paint, 0, 1.15, -0.25);
    // Camlar (ön/arka eğimli, yan şeritler)
    const ws = add(new THREE.BoxGeometry(1.52, 0.5, 0.05), this.glassMat, 0, 1.15, 0.8);
    ws.rotation.x = -0.55;
    const rw = add(new THREE.BoxGeometry(1.52, 0.45, 0.05), this.glassMat, 0, 1.14, -1.3);
    rw.rotation.x = 0.5;
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.36, 1.8), this.glassMat, s * 0.805, 1.18, -0.25);
    // Tamponlar, ızgara
    add(new THREE.BoxGeometry(1.84, 0.2, 0.18), this.blackMat, 0, 0.42, 2.15);
    add(new THREE.BoxGeometry(1.84, 0.2, 0.18), this.blackMat, 0, 0.42, -2.15);
    add(new THREE.BoxGeometry(0.9, 0.16, 0.04), this.chromeMat, 0, 0.7, 2.14);
    // Farlar / stoplar
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.34, 0.14, 0.05), this.headMat, s * 0.62, 0.75, 2.13);
      add(new THREE.BoxGeometry(0.34, 0.14, 0.05), this.tailMat, s * 0.62, 0.75, -2.13);
    }
    // Tekerlekler + jant
    const tire = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18);
    tire.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.18, 0.18, 0.25, 12);
    hub.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) {
      add(tire, this.blackMat, x, 0.33, z);
      add(hub, this.chromeMat, x, 0.33, z);
    }
    // Plaka
    add(new THREE.BoxGeometry(0.5, 0.11, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 0, 0.5, -2.25);
    mergeByMaterial(g);
    return g;
  }

  _buildCars(n) {
    const lanes = [];
    for (const h of H_ROADS) {
      lanes.push({ axis: 'x', dir: 1, lat: h.z + h.hw / 2 });
      lanes.push({ axis: 'x', dir: -1, lat: h.z - h.hw / 2 });
    }
    for (const v of V_ROADS) {
      lanes.push({ axis: 'z', dir: 1, lat: v.x - v.hw / 2 });
      lanes.push({ axis: 'z', dir: -1, lat: v.x + v.hw / 2 });
    }
    for (let i = 0; i < n; i++) {
      const lane = i < 4 ? lanes[i % 2] : lanes[2 + Math.floor(this.rand() * (lanes.length - 2))];
      const group = this._carModel(CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)]);
      this.scene.add(group);
      const car = {
        group,
        lane,
        s: -LIMIT + this.rand() * LIMIT * 2,
        speed: 0,
        cruise: 7 + this.rand() * 4,
        wheelSpin: 0,
      };
      this.cars.push(car);
    }
  }

  _buildWalkers(n) {
    const shirts = [0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x8338ec, 0x6d597a, 0xffffff, 0x264653, 0xbc6c25];
    const pants = [0x2f3440, 0x1d3557, 0x3b3b3b, 0x5c4033];
    const skins = [0xf0c08f, 0xe3b07f, 0xd9a066, 0xf3c99b, 0xc68642];
    const hairs = [0x2b1d14, 0x1a1a1a, 0x5a3825, 0x8d5524, 0xaaaaaa];
    const hats = ['none', 'none', 'none', 'kasket', 'basortu', 'none', 'takke'];
    const r = this.rand;
    const pick = (a) => a[Math.floor(r() * a.length)];
    for (let i = 0; i < n; i++) {
      const hat = pick(hats);
      const person = createPerson({ shirt: pick(shirts), pants: pick(pants), skin: pick(skins), hair: pick(hairs), hat, scarf: pick(shirts), mustache: hat !== 'basortu' && r() < 0.4, belly: r() < 0.25, glasses: r() < 0.15 });
      person.group.scale.setScalar(0.92 + r() * 0.14);
      this.scene.add(person.group);
      const h = H_ROADS[i % H_ROADS.length];
      const north = r() < 0.5;
      const z = north ? h.z - h.hw - h.sw * 0.55 : h.z + h.hw + h.sw * 0.55;
      // Dikey yolları geçmeyen bir kaldırım aralığı seç
      const segs = [];
      let cur = -100;
      for (const v of [...V_ROADS].sort((a, b) => a.x - b.x)) {
        segs.push([cur, v.x - v.hw - v.sw - 1]);
        cur = v.x + v.hw + v.sw + 1;
      }
      segs.push([cur, 100]);
      const [a, b] = segs[Math.floor(r() * segs.length)];
      const x0 = a + r() * (b - a) * 0.3;
      const x1 = b - r() * (b - a) * 0.3;
      this.walkers.push({ person, z, x0, x1, x: x0 + r() * (x1 - x0), dir: r() < 0.5 ? 1 : -1, speed: 1.0 + r() * 0.5, phase: r() * 6, pause: 0, night: i < 2 });
    }
  }

  _buildCats() {
    const spots = [[-6, -7.9], [14, 7.8], [-20, 7.6], [44, 14], [3, 40.5]];
    const colors = [[0xe08a3c, 0xf4c38a], [0x6b6b6b, 0x9a9a9a], [0x1a1a1a, 0x333333], [0xf2f2ee, 0xd9d4cc], [0x8a6a4a, 0xc8a882]];
    spots.forEach(([x, z], i) => {
      const [c1, c2] = colors[i];
      const g = new THREE.Group();
      const m1 = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.9 });
      const m2 = new THREE.MeshStandardMaterial({ color: c2, roughness: 0.9 });
      const body = new THREE.CapsuleGeometry(0.09, 0.22, 4, 10);
      body.rotateX(Math.PI / 2);
      const bm = new THREE.Mesh(body, m1);
      bm.position.set(0, 0.2, 0);
      g.add(bm);
      const head = new THREE.Group();
      head.position.set(0, 0.3, 0.2);
      g.add(head);
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), m1));
      const muz = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m2);
      muz.position.set(0, -0.02, 0.06);
      head.add(muz);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), m1);
        ear.position.set(s * 0.045, 0.075, 0);
        head.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), new THREE.MeshStandardMaterial({ color: 0x9acd32, emissive: 0x223300, roughness: 0.1 }));
        eye.position.set(s * 0.03, 0.015, 0.065);
        head.add(eye);
      }
      const legs = [];
      for (const [lx, lz] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 2, 6), m2);
        leg.geometry.translate(0, -0.08, 0);
        leg.position.set(lx, 0.18, lz);
        g.add(leg);
        legs.push(leg);
      }
      const tail = new THREE.Group();
      tail.position.set(0, 0.24, -0.2);
      g.add(tail);
      const tg = new THREE.CapsuleGeometry(0.018, 0.25, 2, 6);
      tg.translate(0, 0.14, 0);
      tail.add(new THREE.Mesh(tg, m1));
      tail.rotation.x = -0.6;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.position.set(x, 0.12, z);
      this.scene.add(g);
      this.cats.push({ g, head, tail, legs, home: new THREE.Vector3(x, 0.12, z), target: new THREE.Vector3(x, 0.12, z), wait: 2 + i, phase: i });
    });
  }

  /**
   * @param {number} dt
   * @param {number} hour 0..24
   * @param {THREE.Vector3[]} blockers trafiği durduran noktalar (oyuncu, eşek)
   * @param {THREE.Vector3} listener ses için dinleyici konumu
   * @param {(x:number,z:number)=>number} heightAt
   */
  update(dt, hour, blockers, listener, heightAt, night) {
    this.t += dt;
    this.honkCd -= dt;
    this.headMat.emissive.setRGB(night * 1.6, night * 1.5, night * 1.2);
    this.tailMat.emissive.setRGB(0.15 + night * 1.2, 0, 0);
    const busyHour = hour >= 6.5 && hour < 22.5;
    let nearest = 999;

    // --- Arabalar ---
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const L = c.lane;
      const active = busyHour || i % 3 === 0;
      c.group.visible = active;
      if (!active) continue;
      let target = c.cruise;
      // Önündeki engel: oyuncu / eşek / aynı şeritteki araba
      let blocked = false;
      for (const b of blockers) {
        const lat = L.axis === 'x' ? b.z : b.x;
        const lon = L.axis === 'x' ? b.x : b.z;
        const ahead = (lon - c.s) * L.dir;
        if (Math.abs(lat - L.lat) < 1.7 && ahead > 0 && ahead < 9) {
          target = 0;
          blocked = true;
          if (ahead < 7 && this.honkCd <= 0 && Math.abs(c.speed) < 1) {
            this.honkCd = 4 + Math.random() * 3;
            this.ctx.sfx.horn?.();
          }
        }
      }
      for (const o of this.cars) {
        if (o === c || o.lane !== L || !o.group.visible) continue;
        const ahead = (o.s - c.s) * L.dir;
        if (ahead > 0 && ahead < 8) target = Math.min(target, Math.max(0, (ahead - 5.5) * 2));
      }
      const acc = target < c.speed ? 9 : 2.5;
      c.speed += Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), acc * dt);
      if (blocked && c.speed < 0.05) c.speed = 0;
      c.s += c.speed * L.dir * dt;
      if (c.s * L.dir > LIMIT) c.s = -LIMIT * L.dir;
      const x = L.axis === 'x' ? c.s : L.lat;
      const z = L.axis === 'x' ? L.lat : c.s;
      c.group.position.set(x, 0.02, z);
      c.group.rotation.y = L.axis === 'x' ? (L.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (L.dir > 0 ? 0 : Math.PI);
      const d = Math.hypot(x - listener.x, z - listener.z);
      if (d < nearest) nearest = d;
    }
    this.nearestCar = nearest;

    // --- Yayalar ---
    const dayCrowd = hour >= 7 && hour < 21;
    for (const w of this.walkers) {
      const vis = dayCrowd || w.night;
      w.person.group.visible = vis;
      if (!vis) continue;
      let moving = true;
      if (w.pause > 0) {
        w.pause -= dt;
        moving = false;
      } else {
        w.x += w.dir * w.speed * dt;
        if (w.x > w.x1 || w.x < w.x0) {
          w.dir *= -1;
          w.x = Math.max(w.x0, Math.min(w.x1, w.x));
          w.pause = 1 + Math.random() * 4;
        }
      }
      w.phase += dt * (moving ? 7.5 * w.speed : 0);
      animatePerson(w.person, w.phase, moving ? 1 : 0);
      w.person.group.position.set(w.x, heightAt(w.x, w.z), w.z);
      w.person.group.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    // --- Kediler: dolaşır, oturur, kuyruk sallar ---
    for (const k of this.cats) {
      const g = k.g;
      const d = Math.hypot(k.target.x - g.position.x, k.target.z - g.position.z);
      let moving = false;
      if (d > 0.05) {
        const sp = 0.5 * dt;
        g.position.x += ((k.target.x - g.position.x) / d) * Math.min(sp, d);
        g.position.z += ((k.target.z - g.position.z) / d) * Math.min(sp, d);
        g.rotation.y = Math.atan2(k.target.x - g.position.x, k.target.z - g.position.z);
        moving = true;
      } else {
        k.wait -= dt;
        if (k.wait <= 0) {
          k.wait = 4 + Math.random() * 8;
          k.target.set(k.home.x + (Math.random() - 0.5) * 3, 0.12, k.home.z + (Math.random() - 0.5) * 1.2);
        }
      }
      k.phase += dt * (moving ? 10 : 1);
      k.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(k.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 : 0));
      k.tail.rotation.z = Math.sin(this.t * 2 + k.phase) * 0.5;
      k.head.rotation.y = Math.sin(this.t * 0.7 + k.phase) * 0.4;
      g.position.y = heightAt(g.position.x, g.position.z);
    }
  }

  /** Oyuncuyu arabaların içinden geçirmeyen basit itme. */
  pushOut(p, r) {
    for (const c of this.cars) {
      if (!c.group.visible) continue;
      const L = c.lane;
      const lon = L.axis === 'x' ? p.x - c.s : p.z - c.s;
      const lat = L.axis === 'x' ? p.z - L.lat : p.x - L.lat;
      const hl = 2.2 + r;
      const hw = 0.95 + r;
      if (Math.abs(lon) < hl && Math.abs(lat) < hw) {
        const pl = hl - Math.abs(lon);
        const pw = hw - Math.abs(lat);
        if (pw < pl) {
          const d = Math.sign(lat || 1) * pw;
          if (L.axis === 'x') p.z += d; else p.x += d;
        } else {
          const d = Math.sign(lon || 1) * pl;
          if (L.axis === 'x') p.x += d; else p.z += d;
        }
      }
    }
  }
}
