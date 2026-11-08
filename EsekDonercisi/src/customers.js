// =========================================================
// customers.js — Dükkâna gelen müşteriler, sipariş balonları, kuyruk ve ekonomi
// =========================================================
import * as THREE from 'three';
import { createPerson, animatePerson } from './npcs.js';
import { ITEM_INFO } from './cutting.js';

export const PRICES = { ekmek: 90, durum: 110 };
export const PER_SLICE = 15;
export const TOP_PRICE = 5;      // istenen her malzeme
export const AYRAN_PRICE = 25;
const TOPS = ['domates', 'sogan', 'marul', 'tursu', 'acisos', 'mayonez'];
const TOP_ICON = { domates: '🍅', sogan: '🧅', marul: '🥬', tursu: '🥒', acisos: '🌶️', mayonez: '🥫' };
const TOP_NAME = { domates: 'Domates', sogan: 'Soğan', marul: 'Marul', tursu: 'Turşu', acisos: 'Acı sos', mayonez: 'Mayonez' };
export { TOP_ICON, TOP_NAME };

const SHIRTS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x8338ec, 0x06d6a0, 0xffb703, 0x3a86ff, 0xff006e, 0x6d597a];
const PANTS = [0x2f3440, 0x1d3557, 0x3b3b3b, 0x5c4033, 0x264653];
const SKINS = [0xf0c08f, 0xe3b07f, 0xd9a066, 0xf3c99b, 0xc68642];
const HAIRS = [0x2b1d14, 0x1a1a1a, 0x5a3825, 0x8d5524, 0x999999];
const HATS = ['none', 'none', 'none', 'kasket', 'takke', 'basortu'];
const SCARVES = [0x9b3a6b, 0x2a6f97, 0x6a994e, 0xbc4749, 0xe9c46a];

const LINES = {
  perfect: ['Eline sağlık usta, tam istediğim gibi!', 'Bu döner değil, sanat eseri!', 'Annemin yaptığından güzel... Ona söyleme!', 'Eşeğin de sen de çok yaşayın!'],
  extra: ['Ooo bol etli! Batacaksın usta ama sağ ol!', 'Bu kadar et mi? Diyet yarın başlar!', 'Cömert dönerci, bereketli dükkân!'],
  less: ['Usta et nerede, ekmeğin içinde saklambaç mı var?', 'Eti mikroskopla mı arayacağım?', 'Hmm... Biraz cimri kesmişsin.'],
  raw: ['Usta bu et çiğ kalmış! 🤢 Yarı fiyat veriyorum.', 'Pembe pembe döner mi olur? Ocağı aç biraz!', 'Çiğ et yedirirsen hastaneye seni gönderirim!'],
  burnt: ['Bu döner mi kömür mü usta? 🔥', 'Yanık tadı var, ama açım işte...', 'Ocağın başından ayrılma usta, et yanmış!'],
  wrong: ['Ben başka bir şey istemiştim ama... neyse, açım.', 'Siparişi eşek mi aldı usta?', 'Yanlış oldu ama kokusu güzel, yerim.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function makeBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 200;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.5, 1.17, 1);
  sprite.position.y = 2.4;
  sprite.renderOrder = 10;
  return { canvas, g: canvas.getContext('2d'), tex, sprite, timer: 0, lastKey: '' };
}

export class CustomerManager {
  constructor(ctx, shop) {
    this.ctx = ctx;
    this.shop = shop;
    this.slots = shop.queueSlots;
    this.laneZ = shop.queueLaneZ;
    this.list = [];
    this.timer = 3;
    this.served = 0;
    this.lost = 0;
    this.perfect = 0;
  }

  reset() {
    for (const c of this.list) this._dispose(c);
    this.list = [];
    this.timer = 3;
    this.served = 0;
    this.lost = 0;
    this.perfect = 0;
  }

  _dispose(c) {
    this.ctx.scene.remove(c.person.group);
    c.person.group.traverse((o) => {
      if (o.isMesh && o.geometry.userData.owned) o.geometry.dispose();
    });
    c.bubble.tex.dispose();
    c.bubble.sprite.material.dispose();
  }

  queued() {
    return this.list.filter((c) => c.state !== 'leaving');
  }

  waitingCount() {
    return this.queued().length;
  }

  /** Tezgahın tam önünde, servis edilmeye hazır müşteri. */
  front() {
    const c = this.queued()[0];
    return c && c.slot === 0 && c.arrived ? c : null;
  }

  /** HUD'daki sipariş kartı için sıradaki müşteri bilgisi. */
  nextInfo() {
    const c = this.queued()[0];
    if (!c) return null;
    return { order: c.order, ratio: 1 - c.patience / c.maxPatience, ready: c.slot === 0 && c.arrived };
  }

  _randomOrder() {
    const pool = [...TOPS].sort(() => Math.random() - 0.5);
    const nWant = 1 + Math.floor(Math.random() * 3);
    return {
      type: Math.random() < 0.5 ? 'ekmek' : 'durum',
      slices: 2 + Math.floor(Math.random() * 4),
      wants: pool.slice(0, nWant),
      hate: Math.random() < 0.35 ? pool[nWant] : null,
      ayran: Math.random() < 0.4,
    };
  }

  spawn() {
    // Müşteriler ya ara sokaktan (kuzeyden) ya da caddenin batısından gelir
    const fromSide = Math.random() < 0.55;
    const side = -1;
    const hat = rnd(HATS);
    const person = createPerson({
      shirt: rnd(SHIRTS),
      pants: rnd(PANTS),
      skin: rnd(SKINS),
      hair: rnd(HAIRS),
      hat,
      scarf: rnd(SCARVES),
      mustache: hat !== 'basortu' && Math.random() < 0.45,
      glasses: Math.random() < 0.2,
    });
    const s = 0.92 + Math.random() * 0.14;
    person.group.scale.setScalar(s);
    const bubble = makeBubble();
    bubble.sprite.position.y = 2.4 / s;
    person.group.add(bubble.sprite);
    this.ctx.scene.add(person.group);

    const c = {
      person,
      bubble,
      pos: fromSide ? new THREE.Vector3(16.3, 0, -26) : new THREE.Vector3(side * 38, 0, this.laneZ),
      via: fromSide ? [new THREE.Vector3(16.3, 0, this.laneZ)] : [],
      heading: fromSide ? 0 : Math.PI / 2,
      phase: Math.random() * 6,
      state: 'queue',
      atQueue: false,
      arrived: false,
      path: [],
      slot: -1,
      order: this._randomOrder(),
      patience: 0,
      maxPatience: Math.max(30, 70 - this.served * 1.5) * (this.patienceMul || 1),
      speed: 3.0 + Math.random() * 0.6,
      mood: null,
    };
    this.list.push(c);
    this._drawBubble(c, true);
  }

  leave(c, mood) {
    c.state = 'leaving';
    c.mood = mood;
    c.arrived = false;
    const exitX = Math.random() < 0.5 ? -48 : 48;
    c.path = [new THREE.Vector3(c.pos.x, 0, this.laneZ), new THREE.Vector3(exitX, 0, this.laneZ)];
    this._drawBubble(c, true);
    if (mood === 'angry') {
      this.lost++;
      this.ctx.sfx.bad();
      this.ctx.toast('😤 Bir müşteri beklemekten sıkılıp gitti!', 'bad');
      this.ctx.addPop?.(-5);
    }
  }

  /** Servis: siparişle karşılaştır, ödeme + bahşiş hesapla, popülerliği güncelle. */
  serve(c, item, withAyran = false) {
    const o = c.order;
    const wants = o.wants || [];
    const tops = item.toppings || [];
    const pop = this.ctx.getPop ? this.ctx.getPop() : 30;
    const base = PRICES[o.type] + PER_SLICE * o.slices + TOP_PRICE * wants.length;
    const ratio = Math.max(0, 1 - c.patience / c.maxPatience);
    const issues = [];
    let score = 1;
    if (item.type !== o.type) { score -= 0.5; issues.push('wrong'); }
    if (item.slices < o.slices) { score -= 0.1 + (0.3 * (o.slices - item.slices)) / o.slices; issues.push('less'); }
    const missing = wants.filter((t) => !tops.includes(t));
    if (missing.length) { score -= 0.1 * missing.length; issues.push('missing'); }
    const hated = o.hate && tops.includes(o.hate);
    if (hated) { score -= 0.3; issues.push('hate'); }
    const rawF = (item.raw || 0) / Math.max(1, item.slices);
    const burntF = (item.burnt || 0) / Math.max(1, item.slices);
    if (rawF > 0) { score -= 0.5 * rawF; issues.push('raw'); }
    if (burntF > 0) { score -= 0.35 * burntF; issues.push('burnt'); }
    if (o.ayran && !withAyran) issues.push('noayran');
    score = Math.max(0.2, Math.min(1, score));

    let pay = Math.round(base * score);
    let tip = 0;
    const core = issues.filter((x) => x !== 'noayran');
    if (!core.length) {
      tip = Math.round((10 + ratio * 40) * (0.6 + pop / 100));
      pay += tip;
      this.perfect++;
    }
    let ayranTxt = '';
    if (withAyran) {
      if (o.ayran || Math.random() < 0.5) {
        pay += AYRAN_PRICE;
        ayranTxt = ` (+🥛${AYRAN_PRICE} TL)`;
      } else {
        ayranTxt = ' (ayranı ikram ettin 🥛)';
      }
    }

    // Ruh hali ve söz
    let mood;
    let msg;
    const name = (t) => TOP_NAME[t].toLocaleLowerCase('tr-TR');
    if (!core.length) {
      mood = 'love';
      msg = (item.slices > o.slices ? pick(LINES.extra) : pick(LINES.perfect)) + ` (+${tip} TL bahşiş)`;
    } else {
      mood = score >= 0.8 ? 'happy' : 'meh';
      if (issues.includes('raw')) msg = pick(LINES.raw);
      else if (issues.includes('burnt')) msg = pick(LINES.burnt);
      else if (hated) msg = `Usta ${name(o.hate)} istemem demiştim! 😠`;
      else if (issues.includes('wrong')) msg = pick(LINES.wrong);
      else if (issues.includes('less')) msg = pick(LINES.less);
      else msg = `${missing.map(name).join(', ')} yok mu usta? Neyse...`;
    }
    if (issues.includes('noayran')) msg += ' Ayranımı da unuttun!';

    // Popülerlik
    let dp = mood === 'love' ? 3 : mood === 'happy' ? 1 : -2;
    if (issues.includes('raw') || issues.includes('burnt')) dp -= 2;
    if (hated) dp -= 1;
    if (withAyran && o.ayran) dp += 1;
    if (issues.includes('noayran')) dp -= 1;
    this.ctx.addPop?.(dp);

    this.served++;
    this.ctx.addMoney(pay);
    this.ctx.sfx.coin();
    this.ctx.toast(`"${msg}"${ayranTxt}`, mood === 'meh' ? 'warn' : 'ok');
    this.leave(c, mood);
    return pay;
  }

  /** Tüm müşterileri anında kaldır (uyku sonrası vb.), sayaçlara dokunma. */
  clearAll() {
    for (const c of this.list) this._dispose(c);
    this.list = [];
    this.timer = 3;
  }

  /** Dükkân kapanınca sıradaki herkes gider. */
  closeShop() {
    let n = 0;
    for (const c of this.queued()) {
      this.leave(c, 'meh');
      n++;
    }
    return n;
  }

  /**
   * @param {number} dt
   * @param {boolean} playing sabır süresi işlesin mi
   * @param {number} rate müşteri yoğunluğu (0 = kimse gelmez, 1 = normal, 1.5 = öğle kalabalığı)
   */
  update(dt, playing, rate = 1) {
    // Yeni müşteri
    this.timer -= dt * Math.max(rate, 0.0001);
    if (rate <= 0) this.timer = Math.max(this.timer, 2);
    if (this.timer <= 0) {
      if (this.queued().length < this.slots.length) this.spawn();
      this.timer = Math.max(5, 13 - this.served * 0.25) * (0.75 + Math.random() * 0.5);
    }

    // Kuyruk yerleşimi
    const queue = this.queued();
    queue.forEach((c, i) => {
      if (c.slot !== i) {
        c.slot = i;
        const s = this.slots[i];
        c.path = c.atQueue ? [s.clone()] : [...c.via, new THREE.Vector3(s.x, 0, this.laneZ), s.clone()];
        c.arrived = false;
      }
    });

    const world = this.ctx.world;
    for (const c of this.list) {
      let moving = false;
      if (c.path.length) {
        const tgt = c.path[0];
        const dx = tgt.x - c.pos.x;
        const dz = tgt.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        const step = c.speed * (c.state === 'leaving' ? 1.3 : 1) * dt;
        if (d <= step) {
          c.pos.x = tgt.x;
          c.pos.z = tgt.z;
          if (c.via && c.via[0] === tgt) c.via.shift();
          c.path.shift();
        } else {
          c.pos.x += (dx / d) * step;
          c.pos.z += (dz / d) * step;
          c.heading = lerpAngle(c.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
          moving = true;
        }
        if (!c.path.length) {
          if (c.state === 'leaving') c.remove = true;
          else {
            c.arrived = true;
            c.atQueue = true;
          }
        }
      } else if (c.state !== 'leaving') {
        c.heading = lerpAngle(c.heading, Math.PI, 1 - Math.exp(-dt * 6)); // dükkâna bak
      }

      if (playing && c.state === 'queue' && c.atQueue) {
        c.patience += dt;
        if (c.patience >= c.maxPatience) this.leave(c, 'angry');
      }

      c.phase += dt * (moving ? 9 : 0);
      animatePerson(c.person, c.phase, moving ? 1 : 0);
      c.person.group.position.set(c.pos.x, world.heightAt(c.pos.x, c.pos.z), c.pos.z);
      c.person.group.rotation.y = c.heading;

      c.bubble.timer -= dt;
      if (c.bubble.timer <= 0) {
        c.bubble.timer = 0.3;
        this._drawBubble(c);
      }
      c.bubble.sprite.position.y = 2.4 / c.person.group.scale.y + (c.mood ? Math.sin(c.phase * 0.5) * 0.05 : 0);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].remove) {
        this._dispose(this.list[i]);
        this.list.splice(i, 1);
      }
    }
  }

  _drawBubble(c, force = false) {
    const b = c.bubble;
    const ratio = Math.max(0, 1 - c.patience / c.maxPatience);
    const key = c.mood ? 'm' + c.mood : `${c.order.type}${c.order.slices}${Math.round(ratio * 20)}`;
    const o = c.order;
    if (!force && key === b.lastKey) return;
    b.lastKey = key;
    const g = b.g;
    const W = b.canvas.width;
    const H = b.canvas.height;
    g.clearRect(0, 0, W, H);

    g.fillStyle = '#fff6e6';
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 7;
    roundRect(g, 6, 6, W - 12, H - 40, 26);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(W / 2 - 16, H - 37);
    g.lineTo(W / 2, H - 8);
    g.lineTo(W / 2 + 16, H - 37);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(W / 2 - 16, H - 37);
    g.lineTo(W / 2, H - 8);
    g.lineTo(W / 2 + 16, H - 37);
    g.stroke();
    g.fillStyle = '#fff6e6';
    g.fillRect(W / 2 - 13, H - 42, 26, 8);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (c.mood) {
      const em = { love: '😍', happy: '😋', meh: '😒', angry: '😡' }[c.mood];
      g.font = '70px sans-serif';
      g.fillText(em, W / 2, (H - 34) / 2 + 4);
    } else {
      const info = ITEM_INFO[c.order.type];
      g.fillStyle = '#2a1a10';
      g.font = 'bold 34px "Nunito", sans-serif';
      g.fillText(`${info.icon} ${info.label}`, W / 2, 36);
      g.font = 'bold 26px "Nunito", sans-serif';
      g.fillStyle = '#9d0208';
      g.fillText(`${o.slices} dilim${o.ayran ? ' + 🥛' : ''}`, W / 2, 68);
      g.font = '26px sans-serif';
      g.fillStyle = '#2a1a10';
      const tops = (o.wants || []).map((t) => TOP_ICON[t]).join(' ');
      g.fillText(tops + (o.hate ? `  🚫${TOP_ICON[o.hate]}` : ''), W / 2, 102);
      // Sabır çubuğu
      g.fillStyle = 'rgba(0,0,0,.15)';
      roundRect(g, 30, 128, W - 60, 14, 7);
      g.fill();
      g.fillStyle = ratio > 0.5 ? '#2ec27e' : ratio > 0.25 ? '#f77f00' : '#e63946';
      if (ratio > 0.02) {
        roundRect(g, 30, 128, (W - 60) * ratio, 14, 7);
        g.fill();
      }
    }
    b.tex.needsUpdate = true;
  }
}
