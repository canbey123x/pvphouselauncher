// =========================================================
// main.js — Eşek Kıraathanesi: menü/oyun durumu, zaman & enerji, kepenk aç/kapa, ev & uyku,
// takip kamerası, render döngüsü, kayıt sistemi
// =========================================================
import * as THREE from 'three';
import { buildCity, resolveCircle, pointBlocked } from './city.js';
import { Donkey } from './donkey.js';
import { Controls } from './controls.js';
import { Kiraathane, DRINKS, GAMES } from './kiraathane.js';
import { NPCManager, createPerson, animatePerson } from './npcs.js';
import { DayNight, formatClock } from './daynight.js';
import { Home } from './house.js';
import { Life } from './life.js';
import { CATALOG, ShopInterior, START_STOCK, STOCK_INFO } from './shops.js';

const $ = (id) => document.getElementById(id);
const HS_KEY = 'esekkiraathane.highscore';
const SND_KEY = 'esekkiraathane.sound';
const SAVE_KEY = 'esekkiraathane.save.v1';
const CAM_KEY = 'esekkiraathane.cam';

const MIN_PER_SEC = 3;            // 1 gerçek saniye = 3 oyun dakikası (1 oyun saati = 20 sn)
const START_MIN = 7 * 60 + 30;    // Gün 1, 07:30
const ENERGY_PER_HOUR = 6;        // uyanık kalınan her saat
const RENT = 60;                  // kıraathane açılan her gün kira + tüp

function lsGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v;
  } catch {
    return d;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* gizli sekme vb. */
  }
}

const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/* =========================================================
   Ses efektleri (Web Audio ile sentez — dosya yok)
   ========================================================= */
function createSfx() {
  let ac = null;
  let master = null;
  let enabled = lsGet(SND_KEY, '1') !== '0';
  const ensure = () => {
    if (!enabled) return null;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.6;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
    } catch {
      return null;
    }
    return ac;
  };
  const tone = (f, dur, { type = 'sine', vol = 0.15, to = null, delay = 0 } = {}) => {
    const a = ensure();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };
  const noise = (dur, { vol = 0.2, freq = 2500, delay = 0 } = {}) => {
    const a = ensure();
    if (!a) return;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(a.currentTime + delay);
  };
  // Ortam sesleri: şehir uğultusu, döner cızırtısı, gece cırcır böcekleri, yakın araba motoru, kuşlar
  let amb = null;
  const startAmb = () => {
    const a = ac;
    if (!a || amb) return;
    const len = a.sampleRate * 2;
    const brown = a.createBuffer(1, len, a.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    const crackle = a.createBuffer(1, len, a.sampleRate);
    const cd = crackle.getChannelData(0);
    for (let i = 0; i < len; i++) cd[i] = (Math.random() * 2 - 1) * (Math.random() < 0.015 ? 1 : 0.22);
    const filt = (type, freq, q) => {
      const f = a.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      return f;
    };
    const loop = (buf, f) => {
      const src = a.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = a.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      return g;
    };
    const city = loop(brown, filt('lowpass', 420));
    const sizzle = loop(crackle, filt('bandpass', 3500, 0.7));
    const cr = a.createOscillator();
    cr.frequency.value = 4600;
    const crAmp = a.createGain();
    crAmp.gain.value = 0.5;
    const am = a.createOscillator();
    am.frequency.value = 27;
    const amg = a.createGain();
    amg.gain.value = 0.5;
    am.connect(amg).connect(crAmp.gain);
    const crickets = a.createGain();
    crickets.gain.value = 0;
    cr.connect(crAmp).connect(crickets).connect(master);
    cr.start();
    am.start();
    const en = a.createOscillator();
    en.type = 'sawtooth';
    en.frequency.value = 50;
    const engine = a.createGain();
    engine.gain.value = 0;
    en.connect(filt('lowpass', 260)).connect(engine).connect(master);
    en.start();
    amb = { city, sizzle, crickets, engine, en, birdT: 2 };
  };
  const setG = (g, v) => g.gain.setTargetAtTime(v, ac.currentTime, 0.4);
  return {
    unlock: ensure,
    ambience(dt, o) {
      if (!enabled || !ac || ac.state !== 'running') return;
      if (!amb) startAmb();
      if (!amb) return;
      setG(amb.city, o.inside ? 0.008 : 0.05 - 0.03 * o.night);
      setG(amb.sizzle, o.sizzle);
      setG(amb.crickets, o.inside ? 0 : o.night * 0.012);
      const near = Math.max(0, 1 - o.carDist / 25);
      setG(amb.engine, o.inside ? 0 : near * 0.05);
      amb.en.frequency.setTargetAtTime(46 + near * 30, ac.currentTime, 0.3);
      amb.birdT -= dt;
      if (amb.birdT <= 0) {
        amb.birdT = 1.5 + Math.random() * 5;
        if (!o.inside && o.night < 0.4) {
          const f = 2600 + Math.random() * 1800;
          const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) tone(f + Math.random() * 400, 0.07, { type: 'sine', vol: 0.014, to: f * 1.3, delay: i * 0.11 });
        }
      }
    },
    horn: () => {
      tone(415, 0.32, { type: 'square', vol: 0.035 });
      tone(523, 0.32, { type: 'square', vol: 0.028 });
    },
    get enabled() {
      return enabled;
    },
    setEnabled(v) {
      enabled = v;
      lsSet(SND_KEY, v ? '1' : '0');
      if (!v && ac) ac.suspend();
      else ensure();
    },
    click: () => tone(660, 0.05, { type: 'triangle', vol: 0.08 }),
    pour: () => {
      noise(0.35, { vol: 0.12, freq: 1400 });
      tone(900, 0.25, { type: 'sine', vol: 0.02, to: 1300 });
    },
    clink: () => {
      tone(2600, 0.09, { type: 'sine', vol: 0.05 });
      tone(3400, 0.12, { type: 'sine', vol: 0.035, delay: 0.05 });
    },
    slice: () => {
      noise(0.09, { vol: 0.35, freq: 3200 });
      tone(1800, 0.05, { type: 'triangle', vol: 0.03, to: 900 });
    },
    wrap: () => {
      noise(0.15, { vol: 0.15, freq: 900 });
      tone(320, 0.12, { type: 'triangle', vol: 0.1, to: 520, delay: 0.05 });
    },
    coin: () => {
      tone(988, 0.08, { type: 'square', vol: 0.06 });
      tone(1319, 0.22, { type: 'square', vol: 0.06, delay: 0.08 });
    },
    bad: () => tone(220, 0.35, { type: 'sawtooth', vol: 0.06, to: 110 }),
    bray: () => {
      for (let i = 0; i < 2; i++) {
        tone(820, 0.28, { type: 'sawtooth', vol: 0.07, to: 560, delay: i * 0.62 });
        tone(340, 0.32, { type: 'sawtooth', vol: 0.08, to: 240, delay: i * 0.62 + 0.3 });
      }
    },
    bump: () => tone(120, 0.15, { type: 'square', vol: 0.07, to: 60 }),
    talk: () => tone(380 + Math.random() * 220, 0.035, { type: 'square', vol: 0.02 }),
    shutter: () => {
      noise(0.9, { vol: 0.12, freq: 600 });
      tone(180, 0.6, { type: 'sawtooth', vol: 0.03, to: 140 });
    },
    door: () => {
      tone(300, 0.08, { type: 'triangle', vol: 0.08 });
      noise(0.12, { vol: 0.1, freq: 400, delay: 0.05 });
    },
    sleep: () => {
      tone(523, 0.4, { type: 'sine', vol: 0.06 });
      tone(392, 0.5, { type: 'sine', vol: 0.06, delay: 0.35 });
      tone(330, 0.8, { type: 'sine', vol: 0.06, delay: 0.75 });
    },
    morning: () => {
      tone(523, 0.15, { type: 'triangle', vol: 0.07 });
      tone(659, 0.15, { type: 'triangle', vol: 0.07, delay: 0.15 });
      tone(784, 0.35, { type: 'triangle', vol: 0.07, delay: 0.3 });
    },
  };
}
const sfx = createSfx();

/* =========================================================
   Arayüz yardımcıları
   ========================================================= */
const ui = {
  loading: $('loading'),
  menu: $('menu'),
  hud: $('hud'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  modalBody: $('modalBody'),
  pause: $('pauseMenu'),
  pauseStats: $('pauseStats'),
  money: $('money'),
  moneyPill: $('moneyPill'),
  clock: $('clockPill'),
  energyPill: $('energyPill'),
  energyBar: $('energyBar'),
  shopPill: $('shopPill'),
  carry: $('carryPill'),
  queue: $('queuePill'),
  hint: $('hint'),
  order: $('orderCard'),
  toasts: $('toasts'),
  actions: $('actions'),
  joyZone: $('joyZone'),
  highScore: $('highScore'),
  btnSound: $('btnSound'),
  btnQuality: $('btnQuality'),
  aimPrompt: $('aimPrompt'),
  crosshair: $('crosshair'),
  stockPill: $('stockPill'),
  shopPanel: $('shopPanel'),
  shopTitle: $('shopTitle'),
  shopKeeper: $('shopKeeper'),
  shopGreet: $('shopGreet'),
  shopStock: $('shopStock'),
  shopItems: $('shopItems'),
  popPill: $('popPill'),
  btnStart: $('btnStart'),
  btnContinue: $('btnContinue'),
  fade: $('fade'),
  sleep: $('sleepOverlay'),
  sleepClock: $('sleepClock'),
  sleepText: $('sleepText'),
  summary: $('summaryCard'),
  summaryTitle: $('summaryTitle'),
  summaryBody: $('summaryBody'),
};

const recentToasts = new Map();
function toast(text, type = 'info', key = null) {
  const now = performance.now();
  const k = key || text;
  if (recentToasts.has(k) && now - recentToasts.get(k) < 1600) return;
  recentToasts.set(k, now);
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = text;
  ui.toasts.appendChild(el);
  while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  setTimeout(() => el.remove(), 2900);
}

function setText(el, txt) {
  if (el.textContent !== txt) el.textContent = txt;
}
function show(el, v) {
  el.classList.toggle('hidden', !v);
}

/* =========================================================
   Renderer, sahne, ışıklar
   ========================================================= */
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  window.__showFatal?.('Tarayıcın WebGL desteklemiyor 😢 Güncel Chrome/Safari ile dene.');
  throw e;
}
const QUALITY_KEY = 'esekkiraathane.quality';
let quality = lsGet(QUALITY_KEY, 'high');
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.6 : 1));
// Sinematik renk tonlama (filmik), gerçekçi ışık
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 70, 210);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const hemi = new THREE.HemisphereLight(0xfff4e0, 0x5a7d3c, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

// Fontlar tabelalar çizilmeden önce yüklensin (en fazla 2.5 sn bekle)
try {
  await Promise.race([
    Promise.all([document.fonts.load('40px "Bungee"'), document.fonts.load('bold 30px "Nunito"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
} catch {
  /* yedek font kullanılır */
}

/* =========================================================
   Dünya
   ========================================================= */
const city = buildCity(scene);
const home = new Home(scene);
const dayNight = new DayNight(scene, sun, hemi, renderer);
dayNight.envEnabled = quality === 'high';

// Kasabadaki herkesin (eşek, NPC, müşteri) kullandığı dünya
let kira = null;
const cityWorld = {
  colliders: city.colliders,
  heightAt: (x, z) => (kira && kira.isInside({ x, z }) ? 0.12 : city.heightAt(x, z)),
  resolve: (p, r) => resolveCircle(p, r, city.colliders),
};
// Oyuncunun o an bulunduğu dünya (kasaba ya da evin içi)
const homeWorld = { colliders: home.colliders, heightAt: () => home.heightAt(), resolve: (p, r) => home.resolve(p, r) };
const shopRoom = new ShopInterior(scene);
const shopWorld = { colliders: shopRoom.colliders, heightAt: () => shopRoom.heightAt(), resolve: (p, r) => shopRoom.resolve(p, r) };

const game = {
  state: 'menu', // menu | playing | paused
  mode: 'walk', // walk | ride | cut | talk | home | sleep
  inside: false,
  money: 0,
  high: Number(lsGet(HS_KEY, '0')) || 0,
  startHigh: 0,
  recordToast: false,
  time: 0,
  minutes: START_MIN,
  energy: 100,
  shopOpen: false,
  stock: { ...START_STOCK },
  upgrades: {},
  look: {},
  stockWarned: {},
  pop: 30,
  popMilestones: {},
  snapCam: true,
  ocakTutorial: false,
  busy: false,
  tiredWarned: false,
  lateWarned: false,
  lastClockDraw: -1,
  lastSave: 0,
  sleep: null,
  day: null,
};
const pw = () => (game.inside === 'home' ? homeWorld : game.inside === 'shop' ? shopWorld : cityWorld);
const hourNow = () => (game.minutes % 1440) / 60;
const dayNum = () => Math.floor(game.minutes / 1440) + 1;

const ctx = {
  scene,
  camera,
  sfx,
  toast,
  addMoney,
  addPop,
  getPop: () => game.pop,
  world: cityWorld,
  stock: game.stock,
  near: (p, r) => game.state === 'playing' && distXZ(player.pos, p) < r,
};

const PLAYER_BASE = { shirt: 0xf5f5f0, pants: 0x2d3142, vest: true, apron: true, mustache: true, hair: 0x1a1a1a, skin: 0xe9b47f };
const player = {
  person: createPerson(PLAYER_BASE),
  pos: new THREE.Vector3(),
  heading: Math.PI,
  phase: 0,
  radius: 0.38,
  speed: 4.8,
  moving: 0,
};
scene.add(player.person.group);

const donkey = new Donkey(ctx, city.donkeySpawn);
const life = new Life(ctx, quality);
const BASE_DONKEY_SPEED = donkey.maxSpeed;

/** Berber vb. sonrası oyuncu modelini yeniden kur. */
function rebuildPlayer() {
  const old = player.person;
  const vis = old.group.visible;
  scene.remove(old.group);
  old.group.traverse((o) => o.isMesh && o.geometry.userData.owned && o.geometry.dispose());
  const hair = game.look.hair ?? PLAYER_BASE.hair;
  player.person = createPerson({ ...PLAYER_BASE, ...game.look, beardColor: hair });
  player.person.group.visible = vis;
  player.person.group.position.copy(old.group.position);
  player.person.group.rotation.copy(old.group.rotation);
  scene.add(player.person.group);
}
kira = new Kiraathane(ctx, city.colliders);
city.shop = kira.shopApi;
const customers = kira;
scene.add(camera);
camera.add(kira.trayView);
kira.trayView.position.set(0.14, -0.4, -0.85);
kira.trayView.rotation.set(0.32, 0, 0);
kira.trayView.scale.setScalar(0.85);
const npcs = new NPCManager(ctx, city);
const controls = new Controls({ zone: ui.joyZone, base: $('joyBase'), knob: $('joyKnob'), lookTarget: canvas });

// Hedef işaretleri: hedefin üstünde zıplayan koni + oyuncunun başında yön oku
const marker = new THREE.Mesh(
  new THREE.ConeGeometry(0.35, 0.7, 4),
  new THREE.MeshStandardMaterial({ color: 0xffcf3f, emissive: 0x6b4a00, flatShading: true })
);
marker.rotation.x = Math.PI;
scene.add(marker);
const guide = new THREE.Group();
const guideGeo = new THREE.ConeGeometry(0.28, 0.75, 3);
guideGeo.rotateX(Math.PI / 2);
const guideMesh = new THREE.Mesh(guideGeo, new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.9, depthTest: false }));
guideMesh.position.z = 0.9;
guideMesh.renderOrder = 20;
guide.add(guideMesh);
scene.add(guide);

/* =========================================================
   Para, rekor, günlük istatistik
   ========================================================= */
function newDayStats() {
  game.day = {
    earned: 0,
    spent: 0,
    served0: customers.served,
    perfect0: customers.perfect,
    lost0: customers.lost,
    opened: game.shopOpen,
    pop0: game.pop,
  };
  game.tiredWarned = false;
  game.lateWarned = false;
}

function addMoney(amount, silent = false) {
  const before = game.money;
  game.money = Math.max(0, game.money + amount);
  const real = game.money - before;
  if (game.day) {
    if (real > 0) game.day.earned += real;
    else game.day.spent += -real;
  }
  setText(ui.money, fmt(game.money));
  if (!silent && amount !== 0) {
    const pop = document.createElement('span');
    pop.className = 'money-pop' + (amount < 0 ? ' neg' : '');
    pop.textContent = (amount >= 0 ? '+' : '') + fmt(amount) + ' TL';
    ui.moneyPill.appendChild(pop);
    setTimeout(() => pop.remove(), 1300);
  }
  if (game.money > game.high) {
    game.high = game.money;
    lsSet(HS_KEY, String(game.high));
    if (!game.recordToast && game.startHigh > 0) {
      game.recordToast = true;
      toast('🏆 YENİ REKOR! Kasabanın efsane kahvecisi sensin!', 'ok');
    }
  }
}

/* ---------- Popülerlik (0-100) ---------- */
const POP_MILESTONES = [
  [40, '📣 Adın kasabada duyulmaya başladı! Daha çok müşteri gelecek.'],
  [60, '📰 Kasaba gazetesi seni yazdı: "Eşekli Kahvecinin Tavşan Kanı Çayı"!'],
  [80, '📺 Yerel TV röportaj yaptı! Masalar hiç boş kalmıyor.'],
  [95, '👑 EFSANE KAHVECİ! Kasabanın gururusun!'],
];
function popStars(p) {
  const n = Math.max(1, Math.min(5, Math.round(p / 20)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function addPop(delta) {
  if (!delta) return;
  const before = game.pop;
  game.pop = Math.max(0, Math.min(100, game.pop + delta));
  const real = Math.round((game.pop - before) * 10) / 10;
  if (!real) return;
  refreshPop();
  const el = document.createElement('span');
  el.className = 'money-pop' + (real < 0 ? ' neg' : '');
  el.textContent = `${real > 0 ? '+' : ''}${real} ⭐`;
  ui.popPill.appendChild(el);
  setTimeout(() => el.remove(), 1300);
  for (const [th, text] of POP_MILESTONES) {
    if (before < th && game.pop >= th && !game.popMilestones[th]) {
      game.popMilestones[th] = true;
      toast(text, 'ok');
      sfx.morning();
    }
  }
}
function refreshPop() {
  const p = Math.round(game.pop);
  ui.popPill.firstChild.textContent = `⭐ ${p}`;
  ui.popPill.title = popStars(p);
  ui.popPill.classList.toggle('hot', p >= 60);
  ui.popPill.classList.toggle('low', p < 20);
}

function refreshMenu() {
  setText(ui.highScore, fmt(game.high));
  const save = loadSave();
  show(ui.btnContinue, !!save);
  if (save) {
    ui.btnContinue.textContent = `▶ Devam Et (Gün ${Math.floor(save.minutes / 1440) + 1} · ${fmt(save.money)} TL)`;
    ui.btnStart.textContent = '🆕 Yeni Oyun';
    ui.btnStart.classList.remove('primary');
  } else {
    ui.btnStart.textContent = '▶ Oyuna Başla';
    ui.btnStart.classList.add('primary');
  }
}

/* =========================================================
   Kayıt sistemi
   ========================================================= */
function saveGame() {
  if (game.state === 'menu' || game.mode === 'sleep') return;
  const data = {
    v: 3,
    money: game.money,
    minutes: game.minutes,
    energy: game.energy,
    shopOpen: game.shopOpen,
    inside: game.inside,
    served: customers.served,
    perfect: customers.perfect,
    lost: customers.lost,
    totalTea: kira.totalTea,
    stock: game.stock,
    upgrades: game.upgrades,
    pop: game.pop,
    popMilestones: game.popMilestones,
    look: game.look,
    day: game.day,
  };
  lsSet(SAVE_KEY, JSON.stringify(data));
  game.lastSave = game.time;
}

function loadSave() {
  try {
    const d = JSON.parse(lsGet(SAVE_KEY, 'null'));
    return d && d.v === 3 && typeof d.minutes === 'number' ? d : null;
  } catch {
    return null;
  }
}

/* =========================================================
   Bağlamsal butonlar
   ========================================================= */
let actionsKey = '';
let currentActions = [];

function setActions(list, grid = false) {
  const key = (grid ? 'g|' : '') + list.map((a) => a.id + ':' + a.label + ':' + (a.cls || '')).join('|');
  currentActions = list;
  if (key === actionsKey) return;
  actionsKey = key;
  ui.actions.innerHTML = '';
  ui.actions.classList.toggle('grid', grid);
  for (const a of list) {
    const b = document.createElement('button');
    b.className = 'action-btn ' + (a.cls || '');
    b.innerHTML = `<span class="ab-icon">${a.icon}</span><span class="ab-label"></span>`;
    b.querySelector('.ab-label').textContent = a.label;
    if (a.hold) {
      const set = (v) => {
        currentActions.find((x) => x.id === a.id)?.onHold?.(v);
        b.classList.toggle('pressed', v);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* yok say */ }
        set(true);
      });
      b.addEventListener('pointerup', () => set(false));
      b.addEventListener('pointercancel', () => set(false));
      b.addEventListener('lostpointercapture', () => set(false));
    } else {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (game.busy) return;
        currentActions.find((x) => x.id === a.id)?.onPress?.();
      });
    }
    ui.actions.appendChild(b);
  }
}

function computeActions() {
  const list = [];
  if (game.state !== 'playing' || game.busy) return setActions([]);
  const h = hourNow();
  const night = h >= 21 || h < 6;
  if (game.mode === 'walk') {
    const inK = kira.isInside(player.pos);
    if (inK && game.shopOpen && game.aim && game.aim.run) {
      const a = game.aim;
      list.push({ id: 'aim', icon: a.icon, label: a.label, cls: a.cls + ' hot', onPress: () => runAim(a) });
    }
    if (distXZ(player.pos, city.shop.interactPoint) < 2.4 && !list.length) {
      if (game.shopOpen) list.push({ id: 'close', icon: '🔒', label: 'Kepengi İndir', cls: 'gray' + (night ? ' hot' : ''), onPress: closeShop });
      else list.push({ id: 'open', icon: '🔓', label: 'Kepengi Aç', cls: 'green' + (night ? '' : ' hot'), onPress: openShop });
    }
    if (distXZ(player.pos, city.home.doorPoint) < 2.2) list.push({ id: 'enter', icon: '🏠', label: 'Eve Gir', cls: 'blue' + (night ? ' hot' : ''), onPress: enterHome });
    for (const sh of city.shops) {
      if (distXZ(player.pos, sh.door) < 2.0) list.push({ id: 'shop-' + sh.id, icon: '🚪', label: `Gir: ${CATALOG[sh.id].title}`, cls: 'blue', onPress: () => enterShop(sh) });
    }
    if (distXZ(player.pos, donkey.pos) < 2.6) list.push({ id: 'mount', icon: '🐴', label: 'Eşeğe Bin', cls: 'green', onPress: mount });
    const npc = npcs.nearest(player.pos, 2.7);
    if (npc) list.push({ id: 'talk-' + npc.id, icon: '💬', label: 'Konuş', cls: 'blue', onPress: () => startTalk(npc) });
    setActions(list);
  } else if (game.mode === 'ride') {
    list.push({ id: 'brake', icon: '🛑', label: 'Fren', hold: true, onHold: (v) => (controls.brakeHeld = v) });
    list.push({ id: 'bray', icon: '📣', label: 'Anırt', cls: 'yellow', onPress: () => donkey.bray() });
    list.push({ id: 'dismount', icon: '⬇️', label: 'Eşekten İn', cls: 'gray', onPress: dismount });
    setActions(list);
  } else if (game.mode === 'home' && game.inside === 'shop') {
    if (distXZ(player.pos, shopRoom.counterPoint) < 2.6) list.push({ id: 'buy', icon: '🛒', label: 'Alışveriş', cls: 'yellow hot', onPress: openShopPanel });
    if (distXZ(player.pos, shopRoom.doorPoint) < 1.7) list.push({ id: 'exit', icon: '🚪', label: 'Dışarı Çık', cls: 'gray', onPress: exitShop });
    setActions(list);
  } else if (game.mode === 'home') {
    if (distXZ(player.pos, home.bedPoint) < 1.8) list.push({ id: 'sleep', icon: '🛏️', label: hourNow() >= 18 || hourNow() < 6 ? 'Uyu' : 'Kestir (2 saat)', cls: 'blue' + (night || game.energy < 30 ? ' hot' : ''), onPress: () => startSleep('bed') });
    if (distXZ(player.pos, home.teaPoint) < 1.6) list.push({ id: 'tea', icon: '☕', label: 'Çay İç', cls: 'yellow', onPress: drinkTea });
    if (distXZ(player.pos, home.doorPoint) < 1.7) list.push({ id: 'exit', icon: '🚪', label: 'Dışarı Çık', cls: 'gray', onPress: exitHome });
    setActions(list);
  } else {
    setActions([]);
  }
}

/* =========================================================
   Mod geçişleri
   ========================================================= */
function setMode(mode) {
  game.mode = mode;
  ui.hud.dataset.mode = mode;
  const showJoy = mode === 'walk' || mode === 'ride' || mode === 'home';
  show(ui.joyZone, showJoy);
  show(ui.order, false);
  controls.resetJoystick();
  controls.brakeHeld = false;
  actionsKey = null;
}

function fadeTo(fn) {
  if (game.busy) return;
  game.busy = true;
  controls.resetJoystick();
  ui.fade.classList.add('on');
  setTimeout(() => {
    fn();
    cam.yaw = player.heading + Math.PI;
    cam.fpPitch = -0.1;
    game.snapCam = true;
    setTimeout(() => {
      ui.fade.classList.remove('on');
      game.busy = false;
    }, 60);
  }, 380);
}

function mount() {
  if (game.mode !== 'walk') return;
  sfx.click();
  donkey.ridden = true;
  setMode('ride');
  cam.yaw = donkey.heading + Math.PI;
  toast('Deh deh! 🐴 Joystick yukarı = gaz, sağ/sol = dön, Fren = dur.', 'info', 'mounthint');
}

function dismount(force = false) {
  if (!force && Math.abs(donkey.speed) > 3) {
    toast('Önce yavaşla! Fren butonuna bas 🛑', 'warn', 'slowdown');
    return;
  }
  sfx.click();
  const h = donkey.heading;
  player.pos.set(donkey.pos.x - Math.cos(h) * 1.25, 0, donkey.pos.z + Math.sin(h) * 1.25);
  cityWorld.resolve(player.pos, player.radius);
  player.heading = h;
  donkey.speed = 0;
  donkey.ridden = false;
  setMode('walk');
}

function openShop() {
  const h = hourNow();
  game.shopOpen = true;
  if (game.day) game.day.opened = true;
  city.shop.setOpen(true);
  sfx.shutter();
  if (h >= 23 || h < 6) toast('🔓 Açtın ama gecenin bu saatinde kimse çay içmeye gelmez...', 'warn');
  else toast('🔓 Kıraathane açıldı! Önce ocağa geç, çayı demle 🫖', 'ok');
}

function closeShop() {
  game.shopOpen = false;
  city.shop.setOpen(false);
  sfx.shutter();
  const n = customers.closeShop();
  if (kira.isInside(player.pos)) {
    player.pos.copy(city.shop.exitPoint);
    player.pos.z += 0.6;
    cam.yaw = 0;
    game.snapCam = true;
  }
  toast(n ? `🔒 Kepenk indi. ${n} masa hesabı ödeyip kalktı.` : '🔒 Kepenk indi. Eline sağlık usta!', n ? 'warn' : 'ok');
}

/* ---------- Bakılan nesne ile etkileşim (birinci şahıs) ---------- */
const aimRay = new THREE.Raycaster();
const aimNdc = new THREE.Vector2();
function aimAt(x, y) {
  aimNdc.set(x, y);
  aimRay.setFromCamera(aimNdc, camera);
  return kira.describe(kira.pick(aimRay));
}
function runAim(a) {
  if (!a || !a.run || game.busy) return;
  a.run();
  actionsKey = null;
}
controls.onTap = (cx, cy) => {
  if (game.state !== 'playing' || game.mode !== 'walk' || game.inside || !game.shopOpen || !kira.isInside(player.pos)) return;
  const r = canvas.getBoundingClientRect();
  const a = aimAt(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  if (a && a.run) runAim(a);
  else if (a) toast(`${a.icon} ${a.label}`, 'info', 'aiminfo');
};
function updateAim() {
  const on = game.state === 'playing' && game.mode === 'walk' && !game.inside && game.shopOpen && kira.isInside(player.pos);
  game.aim = on ? aimAt(0, 0) : null;
  show(ui.crosshair, on);
  const a = game.aim;
  show(ui.aimPrompt, !!a);
  if (a) {
    setText(ui.aimPrompt, `${a.icon} ${a.label}`);
    ui.aimPrompt.classList.toggle('info', !a.run);
  }
}

function startTalk(npc) {
  sfx.click();
  setMode('talk');
  npcs.start(npc, () => setMode('walk'));
}

function enterHome() {
  sfx.door();
  fadeTo(() => {
    game.inside = 'home';
    player.pos.copy(home.entry);
    player.heading = -Math.PI / 2;
    setMode('home');
    const h = hourNow();
    toast(h >= 20 || h < 6 ? '🏠 Evdesin. Yatağa git ve uyu 🛏️' : '🏠 Evine hoş geldin usta!', 'info', 'homein');
  });
}

function exitHome() {
  sfx.door();
  fadeTo(() => {
    game.inside = false;
    player.pos.copy(city.home.doorPoint);
    player.heading = Math.PI;
    cam.yaw = 0;
    setMode('walk');
  });
}

function drinkTea() {
  if (game.time - (game.lastTea ?? -99) < 8) {
    toast('Çay daha demlenmedi, biraz bekle ☕', 'warn', 'tea');
    return;
  }
  game.lastTea = game.time;
  game.energy = Math.min(100, game.energy + 15);
  game.minutes += 15;
  sfx.click();
  toast('☕ Tavşan kanı bir çay! +15 enerji', 'ok');
}

/* =========================================================
   Dükkânlar: içeri gir, alışveriş, yükseltmeler
   ========================================================= */
function applyUpgrades() {
  const u = game.upgrades;
  kira.setTableCount(4 + (u.masa5 ? 1 : 0) + (u.masa6 ? 1 : 0));
  kira.demlikSize = u.semaver ? 20 : 12;
  kira.slowBrew = !!u.semaver;
  const gt = 12 + (u.bardak ? 12 : 0);
  kira.glassClean = Math.min(gt, kira.glassClean + Math.max(0, gt - kira.glassTotal));
  kira.glassTotal = gt;
  kira.trayMax = u.tepsi ? 10 : 6;
  kira.sets = { okey: 1 + (u.okey ? 1 : 0), tavla: 1 + (u.tavla ? 1 : 0), kart: 1 };
  kira._refreshRack();
  kira.tv.scale.setScalar(u.tv ? 1.35 : 1);
  donkey.maxSpeed = BASE_DONKEY_SPEED * (u.nal ? 1.25 : 1);
}

function enterShop(sh) {
  const c = CATALOG[sh.id];
  sfx.door();
  fadeTo(() => {
    game.inside = 'shop';
    game.shopId = sh.id;
    game.shopDoor = sh.door;
    shopRoom.setShop(sh.id);
    player.pos.copy(shopRoom.entry);
    player.heading = -Math.PI / 2;
    setMode('home');
    toast(`${c.keeper}: "Hoş geldin usta!" — Tezgaha gel 🛒`, 'info', 'shopin');
  });
}

function exitShop() {
  closeShopPanel();
  sfx.door();
  fadeTo(() => {
    game.inside = false;
    player.pos.copy(game.shopDoor);
    player.heading = game.shopDoor.z < 0 ? 0 : Math.PI;
    cam.yaw = game.shopDoor.z < 0 ? Math.PI : 0;
    setMode('walk');
  });
}

function openShopPanel() {
  if (!game.shopId) return;
  sfx.click();
  setMode('talk');
  renderShopPanel();
  show(ui.shopPanel, true);
}

function closeShopPanel() {
  if (ui.shopPanel.classList.contains('hidden')) return;
  show(ui.shopPanel, false);
  if (game.inside === 'shop') setMode('home');
}

function renderShopPanel() {
  const c = CATALOG[game.shopId];
  ui.shopTitle.textContent = c.title;
  ui.shopKeeper.textContent = c.keeper;
  ui.shopGreet.textContent = `"${c.greet}"`;
  const st = game.stock;
  ui.shopStock.innerHTML =
    `<span class="m">💰 ${fmt(game.money)} TL</span>` +
    Object.entries(STOCK_INFO).map(([k, v]) => `<span title="${v.name}">${v.icon} ${st[k]}</span>`).join('') +
    `<span>⚡ ${Math.round(game.energy)}</span>`;
  ui.shopItems.innerHTML = '';
  for (const it of c.items) {
    const owned = it.upgrade && game.upgrades[it.upgrade];
    const poor = game.money < it.price;
    const row = document.createElement('div');
    row.className = 'shop-item' + (owned ? ' owned' : '');
    row.innerHTML = `<div class="si-icon">${it.icon}</div><div class="si-text"><b></b><small></small></div>`;
    row.querySelector('b').textContent = it.name;
    row.querySelector('small').textContent = it.desc;
    const btn = document.createElement('button');
    btn.className = 'si-buy' + (poor && !owned ? ' poor' : '');
    btn.textContent = owned ? '✓ Alındı' : `${fmt(it.price)} TL`;
    btn.disabled = !!owned;
    btn.addEventListener('click', () => buy(it));
    row.appendChild(btn);
    ui.shopItems.appendChild(row);
  }
}

function buy(it) {
  if (it.upgrade && game.upgrades[it.upgrade]) return;
  if (game.money < it.price) {
    sfx.bad();
    toast(`💸 Paran yetmiyor! ${fmt(it.price - game.money)} TL daha lazım.`, 'bad', 'nomoney');
    return;
  }
  addMoney(-it.price);
  if (it.stock) {
    for (const [k, v] of Object.entries(it.stock)) {
      game.stock[k] += v;
      game.stockWarned[k] = false;
    }
  }
  if (it.energy) game.energy = Math.min(100, game.energy + it.energy);
  if (it.minutes) game.minutes += it.minutes;
  if (it.upgrade) {
    game.upgrades[it.upgrade] = true;
    applyUpgrades();
  }
  if (it.look) {
    Object.assign(game.look, it.look);
    rebuildPlayer();
  }
  sfx.coin();
  toast(`${it.icon} ${it.name} alındı!`, 'ok');
  renderShopPanel();
  saveGame();
}

function checkStock() {
  const st = game.stock;
  const warn = (k, cond, msg) => {
    if (cond && !game.stockWarned[k]) {
      game.stockWarned[k] = true;
      toast(msg, 'warn');
    }
  };
  if (!game.shopOpen) return;
  warn('cay', st.cay <= 1 && kira.tea.left <= 4, `🫖 Kuru çay azaldı (${st.cay} demlik)! Bakkala ya da toptancıya git.`);
  warn('seker', st.seker <= 8, `🧊 Şeker azaldı (${st.seker})! Bakkaldan al.`);
  warn('kahve', st.kahve <= 1, `☕ Kahve azaldı (${st.kahve})! Bakkaldan al.`);
  warn('glass', kira.glassClean <= 2 && kira.dirty + kira.tables.reduce((a, t) => a + t.dirtyCups, 0) > 0, '🥃 Temiz bardak bitiyor! Masaları topla, lavaboda yıka.');
}

/* =========================================================
   Uyku, bayılma ve sabah özeti
   ========================================================= */
function nextTime(minOfDay) {
  const start = Math.floor(game.minutes / 1440) * 1440;
  let t = start + minOfDay;
  if (t <= game.minutes) t += 1440;
  return t;
}

function startSleep(kind) {
  if (game.mode === 'sleep') return;
  const h = hourNow();
  const overnight = kind === 'faint' || h >= 18 || h < 6;
  const to = kind === 'faint' ? nextTime(10 * 60) : overnight ? nextTime(7 * 60) : game.minutes + 120;
  if (game.mode === 'ride') {
    donkey.ridden = false;
    donkey.speed = 0;
  }
  npcs.close(true);
  setMode('sleep');
  setActions([]);
  game.sleep = { kind, overnight, from: game.minutes, to, t: 0, dur: overnight ? 3 : 1.6, done: false };
  ui.summary.classList.add('hidden');
  ui.sleep.querySelector('.sleep-box').classList.remove('hidden');
  ui.sleepText.textContent =
    kind === 'faint' ? '😵 Yorgunluktan bayıldın! Bekçi Murtaza seni eve taşıyor...' : overnight ? 'Usta mışıl mışıl uyuyor...' : 'Kısa bir kestirme...';
  show(ui.sleep, true);
  sfx.sleep();
  if (kind === 'bed') {
    const p = player.person.group;
    p.position.copy(home.sleepPose.pos);
    p.rotation.set(-Math.PI / 2, 0, 0);
    animatePerson(player.person, 0, 0);
  }
}

function updateSleep(dt) {
  const s = game.sleep;
  if (!s || s.done) return;
  s.t = Math.min(1, s.t + dt / s.dur);
  const e = s.t * s.t * (3 - 2 * s.t);
  setText(ui.sleepClock, formatClock(s.from + (s.to - s.from) * e));
  if (s.t >= 1) {
    s.done = true;
    finishSleep();
  }
}

function finishSleep() {
  const s = game.sleep;
  const prevDay = Math.floor(s.from / 1440) + 1;
  game.minutes = s.to;
  player.person.group.rotation.set(0, 0, 0);
  if (!s.overnight) {
    game.energy = Math.min(100, game.energy + 35);
    show(ui.sleep, false);
    game.sleep = null;
    setMode('home');
    player.pos.copy(home.bedPoint);
    toast('😌 Kestirme iyi geldi: +35 enerji', 'ok');
    saveGame();
    return;
  }
  // Gece boyunca: müşteriler gitti, NPC'ler yerine döndü
  customers.clearAll();
  npcs.reset();
  game.inside = 'home';
  player.pos.copy(home.bedPoint);
  player.heading = Math.PI;
  game.energy = 100;

  const d = game.day || { earned: 0, spent: 0, served0: 0, perfect0: 0, lost0: 0, opened: false };
  const lines = [];
  const served = customers.served - d.served0;
  const perfect = customers.perfect - d.perfect0;
  const lost = customers.lost - d.lost0;
  lines.push(`📅 <b>Gün ${prevDay}</b> özeti`);
  lines.push(`💰 Kazanç: <span class="pos">+${fmt(d.earned)} TL</span>${d.spent ? ` · Harcama: <span class="neg">-${fmt(d.spent)} TL</span>` : ''}`);
  lines.push(`👥 Ağırlanan: <b>${served}</b> · 😍 Memnun masa: <b>${perfect}</b> · 😤 Kaçan: <b>${lost}</b>`);
  if (d.opened) {
    addMoney(-RENT, true);
    lines.push(`🧾 Kira, elektrik ve tüp gazı: <span class="neg">-${RENT} TL</span>`);
  } else {
    lines.push('😴 Kıraathane hiç açılmadı, kira bile çıkmadı!');
  }
  if (game.shopOpen) {
    if (Math.random() < 0.45 && game.money > 30) {
      const lossAmt = Math.max(20, Math.round(game.money * 0.1));
      addMoney(-lossAmt, true);
      lines.push(`😱 Kepengi açık bırakmışsın! Gece kasadan <span class="neg">${fmt(lossAmt)} TL</span> kayboldu.`);
    } else {
      lines.push('😬 Kepengi açık bıraktın ama bekçi göz kulak oldu. Şanslısın!');
    }
  }
  if (s.kind === 'faint') {
    addMoney(-30, true);
    lines.push('👮 Bekçi seni eve taşıdı, çay parası istedi: <span class="neg">-30 TL</span>');
  }
  // Popülerlik: her gün biraz unutulursun; dükkân hiç açılmadıysa daha çok
  addPop(d.opened ? -2 : -6);
  const pd = Math.round(game.pop - (d.pop0 ?? game.pop));
  lines.push(`⭐ Popülerlik: <b>${Math.round(game.pop)}</b>/100 ${popStars(game.pop)} (${pd >= 0 ? '<span class="pos">+' + pd : '<span class="neg">' + pd}</span>)`);
  lines.push(`🏦 Kasa: <b>${fmt(game.money)} TL</b>`);
  ui.summaryTitle.textContent = `☀️ Günaydın! Gün ${dayNum()} başlıyor`;
  ui.summaryBody.innerHTML = lines.join('<br>');
  ui.sleep.querySelector('.sleep-box').classList.add('hidden');
  ui.summary.classList.remove('hidden');
  sfx.morning();
}

function wakeUp() {
  sfx.click();
  show(ui.sleep, false);
  game.sleep = null;
  newDayStats();
  setMode('home');
  game.snapCam = true;
  saveGame();
  toast(game.shopOpen ? '☀️ Yeni gün! Kıraathane zaten açık, koş!' : '☀️ Yeni gün! Kıraathanenin kepengini açmaya git 🔓', 'ok');
}

/* =========================================================
   Oyun durumu: menü / oyna / duraklat
   ========================================================= */
function resetWorld() {
  npcs.close(true);
  player.person.group.visible = true;
  player.person.group.rotation.set(0, 0, 0);
  donkey.reset();
  customers.reset();
  npcs.reset();
  game.sleep = null;
  game.busy = false;
  game.snapCam = true;
  show(ui.sleep, false);
}

function tryFullscreen() {
  const el = document.documentElement;
  if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function beginPlay() {
  game.state = 'playing';
  game.startHigh = game.high;
  game.recordToast = false;
  show(ui.menu, false);
  show(ui.hud, true);
  tryFullscreen();
}

function newGame() {
  sfx.unlock();
  sfx.click();
  resetWorld();
  game.money = 100;
  setText(ui.money, '100');
  Object.assign(game.stock, START_STOCK);
  game.upgrades = {};
  game.pop = 30;
  game.popMilestones = {};
  refreshPop();
  game.look = {};
  game.stockWarned = {};
  rebuildPlayer();
  applyUpgrades();
  game.minutes = START_MIN;
  game.energy = 100;
  game.shopOpen = false;
  game.inside = false;
  city.shop.setOpen(false, true);
  newDayStats();
  player.pos.copy(city.playerSpawn);
  player.heading = Math.PI;
  cam.yaw = 0;
  setMode('walk');
  beginPlay();
  saveGame();
  toast('☀️ Günaydın usta! Kıraathanenin kepengini aç, sonra ocağı yak 🫖', 'ok');
}

function continueGame() {
  const s = loadSave();
  if (!s) return newGame();
  sfx.unlock();
  sfx.click();
  resetWorld();
  game.money = s.money;
  setText(ui.money, fmt(game.money));
  game.minutes = s.minutes;
  game.energy = s.energy ?? 100;
  game.shopOpen = !!s.shopOpen;
  city.shop.setOpen(game.shopOpen, true);
  customers.served = s.served || 0;
  customers.perfect = s.perfect || 0;
  customers.lost = s.lost || 0;
  kira.totalTea = s.totalTea || 0;
  game.day = s.day || null;
  if (!game.day) newDayStats();
  Object.assign(game.stock, START_STOCK, s.stock || {});
  game.pop = s.pop ?? 30;
  game.popMilestones = s.popMilestones || {};
  refreshPop();
  game.upgrades = s.upgrades || {};
  game.look = s.look || {};
  rebuildPlayer();
  applyUpgrades();
  game.inside = s.inside === 'shop' ? false : s.inside ? 'home' : false;
  if (game.inside) {
    player.pos.copy(home.entry);
    setMode('home');
  } else {
    player.pos.copy(game.shopOpen ? city.shop.exitPoint : city.home.doorPoint);
    setMode('walk');
  }
  player.heading = Math.PI;
  cam.yaw = 0;
  beginPlay();
  toast(`Tekrar hoş geldin usta! Gün ${dayNum()}, saat ${formatClock(game.minutes)}`, 'ok');
}

function goMenu() {
  saveGame();
  npcs.close(true);
  player.person.group.visible = true;
  player.person.group.rotation.set(0, 0, 0);
  game.state = 'menu';
  game.inside = false;
  game.sleep = null;
  setMode('walk');
  setActions([]);
  show(ui.pause, false);
  show(ui.sleep, false);
  show(ui.shopPanel, false);
  show(ui.hud, false);
  show(ui.menu, true);
  city.shop.setOpen(true, true);
  refreshMenu();
  game.snapCam = true;
}

function pause() {
  if (game.state !== 'playing' || game.mode === 'sleep') return;
  game.state = 'paused';
  controls.resetJoystick();
  controls.brakeHeld = false;
  saveGame();
  ui.pauseStats.innerHTML =
    `📅 Gün <b>${dayNum()}</b> · 🕗 <b>${formatClock(game.minutes)}</b> · ⚡ <b>${Math.round(game.energy)}</b><br>` +
    `💰 Kasa: <b>${fmt(game.money)} TL</b> · 🏆 Rekor: <b>${fmt(game.high)} TL</b><br>` +
    `👥 Ağırlanan: <b>${customers.served}</b> · 😍 Memnun masa: <b>${customers.perfect}</b> · 😤 Kaçan: <b>${customers.lost}</b><br>` +
    `🍵 Doldurulan çay: <b>${kira.totalTea}</b><br>` +
    `⭐ Popülerlik: <b>${Math.round(game.pop)}</b>/100 ${popStars(game.pop)}<br>` +
    `📦 Stok: ${Object.entries(STOCK_INFO).map(([k, v]) => `${v.icon}<b>${game.stock[k] ?? 0}</b>`).join(' · ')}<br>` +
    `🛠️ Yükseltmeler: <b>${Object.keys(game.upgrades).length}</b>/10 · Oyun otomatik kaydedilir.`;
  show(ui.pause, true);
}

function resume() {
  if (game.state !== 'paused') return;
  sfx.click();
  show(ui.pause, false);
  game.state = 'playing';
}

function updateQualityBtn() {
  ui.btnQuality.textContent = quality === 'high' ? '🎨 Grafik: Yüksek' : '🎨 Grafik: Düşük (hızlı)';
}
ui.btnQuality.addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  lsSet(QUALITY_KEY, quality);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.6 : 1));
  dayNight.envEnabled = quality === 'high';
  dayNight.envTimer = 0;
  onResize();
  updateQualityBtn();
  sfx.click();
  toast('🎨 Grafik ayarı kaydedildi. Gölge ve kalabalık ayarı oyunu yeniden açınca uygulanır.', 'info', 'quality');
});

function updateSoundBtn() {
  ui.btnSound.textContent = sfx.enabled ? '🔊 Ses: Açık' : '🔇 Ses: Kapalı';
}

function openModal(kind) {
  sfx.unlock();
  sfx.click();
  const tpl = $(kind === 'how' ? 'tplHow' : 'tplAbout');
  ui.modalTitle.textContent = kind === 'how' ? 'Nasıl Oynanır?' : 'Hakkında';
  ui.modalBody.innerHTML = '';
  ui.modalBody.appendChild(tpl.content.cloneNode(true));
  show(ui.modal, true);
}

ui.btnStart.addEventListener('click', newGame);
ui.btnContinue.addEventListener('click', continueGame);
$('btnHow').addEventListener('click', () => openModal('how'));
$('btnAbout').addEventListener('click', () => openModal('about'));
$('modalClose').addEventListener('click', () => {
  sfx.click();
  show(ui.modal, false);
});
$('pauseBtn').addEventListener('click', () => {
  sfx.click();
  pause();
});
$('camBtn').addEventListener('click', cycleCamera);
$('btnResume').addEventListener('click', resume);
$('btnMenu').addEventListener('click', () => {
  sfx.click();
  goMenu();
});
$('btnWake').addEventListener('click', wakeUp);
$('shopClose').addEventListener('click', () => {
  sfx.click();
  closeShopPanel();
});
ui.btnSound.addEventListener('click', () => {
  sfx.setEnabled(!sfx.enabled);
  updateSoundBtn();
  sfx.click();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    saveGame();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (game.state === 'paused') {
    if (e.code === 'Escape' || e.code === 'KeyP') resume();
    return;
  }
  if (game.state === 'menu') {
    if (e.code === 'Enter' && ui.modal.classList.contains('hidden')) (loadSave() ? continueGame : newGame)();
    else if (e.code === 'Escape') show(ui.modal, false);
    return;
  }
  if (game.mode === 'sleep') {
    if ((e.code === 'Enter' || e.code === 'Space') && !ui.summary.classList.contains('hidden')) wakeUp();
    return;
  }
  if (!ui.shopPanel.classList.contains('hidden')) {
    if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyQ') closeShopPanel();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') return pause();
  if (e.code === 'KeyC') return cycleCamera();
  if (game.busy) return;
  if (game.mode === 'talk') {
    if (e.code === 'Digit1' || e.code === 'Numpad1') npcs.chooseIndex(0);
    else if (e.code === 'Digit2' || e.code === 'Numpad2') npcs.chooseIndex(1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') npcs.chooseIndex(0);
    return;
  }
  if (e.code === 'KeyE' || e.code === 'Enter') currentActions.find((a) => !a.hold)?.onPress?.();
  else if (e.code === 'KeyR') currentActions.filter((a) => !a.hold)[1]?.onPress?.();
  else if (e.code === 'KeyH' && game.mode === 'ride') donkey.bray();
  else if (e.code === 'KeyQ' && game.mode === 'ride') dismount();
});

/* =========================================================
   Kamera sistemi
   ========================================================= */
const CAM_PRESETS = [
  { name: 'Yakın', dist: 4.6, pitch: 0.24 },
  { name: 'Normal', dist: 7.5, pitch: 0.42 },
  { name: 'Uzak', dist: 12, pitch: 0.62 },
  { name: 'Kuşbakışı', dist: 21, pitch: 1.08 },
];
const savedPreset = clamp(Number(lsGet(CAM_KEY, '1')) || 0, 0, CAM_PRESETS.length - 1);
const cam = {
  yaw: 0,
  pitch: CAM_PRESETS[savedPreset].pitch,
  dist: CAM_PRESETS[savedPreset].dist,
  curDist: CAM_PRESETS[savedPreset].dist,
  preset: savedPreset,
  lastManual: -10,
  fpPitch: -0.12,
};
/** Oyuncu kıraathanenin içinde yürürken birinci şahıs kamera. */
function firstPerson() {
  return game.state !== 'menu' && game.mode !== 'sleep';
}

function cycleCamera() {
  cam.preset = (cam.preset + 1) % CAM_PRESETS.length;
  const p = CAM_PRESETS[cam.preset];
  cam.dist = p.dist;
  cam.pitch = p.pitch;
  lsSet(CAM_KEY, String(cam.preset));
  sfx.click();
  toast(`🎥 Kamera: ${p.name}`, 'info', 'cam');
}

const camPos = new THREE.Vector3(0, 30, 60);
const camLook = new THREE.Vector3();
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const pivot = new THREE.Vector3();
const camDir = new THREE.Vector3();
const probe = new THREE.Vector3();

function updateCamera(dt, look) {
  let k = 1 - Math.exp(-dt * 10);
  if (game.state === 'menu') {
    const t = game.time * 0.04;
    desiredPos.set(Math.sin(t) * 62, 34 + Math.sin(t * 1.7) * 4, Math.cos(t) * 62);
    desiredLook.set(0, 2, 2);
    k = 1 - Math.exp(-dt * 2);
  } else if (firstPerson()) {
    // --- Her yerde birinci şahıs ---
    const riding = game.mode === 'ride';
    if (look && game.state === 'playing' && (look.dx || look.dy)) {
      cam.lastManual = game.time;
      cam.yaw -= look.dx * 0.0055;
      cam.fpPitch = clamp(cam.fpPitch - look.dy * 0.004, -1.1, 0.8);
    }
    const idle = game.time - cam.lastManual;
    if (riding && Math.abs(donkey.speed) > 0.6 && idle > 1.2) {
      cam.yaw = lerpAngle(cam.yaw, donkey.heading + Math.PI, 1 - Math.exp(-dt * 2.6 * Math.min(1, Math.abs(donkey.speed) / 4)));
    }
    if (game.mode === 'talk' && npcs.active) {
      const n = npcs.active.pos;
      cam.yaw = lerpAngle(cam.yaw, Math.atan2(player.pos.x - n.x, player.pos.z - n.z), 1 - Math.exp(-dt * 6));
      cam.fpPitch += (-0.05 - cam.fpPitch) * (1 - Math.exp(-dt * 4));
    }
    if (riding) {
      donkey.seatWorld(desiredPos);
      desiredPos.y += 0.55;
    } else {
      const bob = Math.sin(player.phase) * 0.025 * Math.min(1, player.moving * 2);
      desiredPos.set(player.pos.x, player.pos.y + 1.62 + bob, player.pos.z);
    }
    const cp = Math.cos(cam.fpPitch);
    desiredLook.set(desiredPos.x - Math.sin(cam.yaw) * cp, desiredPos.y + Math.sin(cam.fpPitch), desiredPos.z - Math.cos(cam.yaw) * cp);
    camPos.copy(desiredPos);
    camLook.copy(desiredLook);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    game.snapCam = false;
    return;
  } else if (game.inside) {
    (game.inside === 'shop' ? shopRoom : home).cameraFor(player.pos, desiredPos);
    desiredLook.set(desiredPos.x + (player.pos.x - desiredPos.x) * 0.8, player.pos.y + 0.7, player.pos.z - 1.2);
    k = 1 - Math.exp(-dt * 6);
  } else {
    // --- Serbest takip kamerası ---
    if (look && game.state === 'playing') {
      if (look.dx || look.dy || look.zoom) cam.lastManual = game.time;
      cam.yaw -= look.dx * 0.0065;
      cam.pitch = clamp(cam.pitch + look.dy * 0.0045, 0.06, 1.3);
      cam.dist = clamp(cam.dist + look.zoom, 3.2, 26);
    }
    const riding = game.mode === 'ride';
    const idle = game.time - cam.lastManual;
    if (riding && Math.abs(donkey.speed) > 0.6 && idle > 1.2) {
      cam.yaw = lerpAngle(cam.yaw, donkey.heading + Math.PI, 1 - Math.exp(-dt * 2.6 * Math.min(1, Math.abs(donkey.speed) / 4)));
    } else if (game.mode === 'walk' && player.moving > 0.3 && idle > 1.5) {
      cam.yaw = lerpAngle(cam.yaw, player.heading + Math.PI, 1 - Math.exp(-dt * 1.3 * player.moving));
    }
    let target = riding ? donkey.pos : player.pos;
    if (game.mode === 'talk' && npcs.active) target = probe.copy(player.pos).lerp(npcs.active.pos, 0.5);
    pivot.set(target.x, target.y + (riding ? 1.9 : 1.45), target.z);
    const dist = game.mode === 'talk' ? Math.min(cam.dist, 6) : riding ? cam.dist + 1.5 : cam.dist;
    const cp = Math.cos(cam.pitch);
    camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    // Duvar/bina arkasında kalmasın: pivot'tan dışarı doğru ışın yürüt, ilk engelde dur
    let free = dist;
    for (let d = 0.6; d <= dist; d += 0.3) {
      probe.copy(pivot).addScaledVector(camDir, d);
      if (probe.y < 0.35 || pointBlocked(probe, city.colliders, 0.25)) {
        free = Math.max(0.8, d - 0.45);
        break;
      }
    }
    cam.curDist += (free - cam.curDist) * (free < cam.curDist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 3));
    desiredPos.copy(pivot).addScaledVector(camDir, cam.curDist);
    desiredLook.copy(pivot).y -= 0.15;
    k = 1 - Math.exp(-dt * 14);
  }
  if (game.snapCam) {
    k = 1;
    cam.curDist = cam.dist;
    game.snapCam = false;
  }
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, Math.min(1, k * 1.2));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

/* =========================================================
   Güncelleme
   ========================================================= */
const tmpV = new THREE.Vector3();

function updateWalk(dt) {
  const world = pw();
  const mv = controls.getMove();
  let mag = Math.min(1, Math.hypot(mv.x, mv.y));
  const tired = game.energy < 15 ? 0.65 : 1;
  player.moving = 0;
  if (mag > 0.01) {
    const yaw = cam.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const sp = player.speed * mag * tired * (game.inside ? 0.7 : kira.isInside(player.pos) ? 0.75 : 1);
    player.pos.x += dx * sp * dt;
    player.pos.z += dz * sp * dt;
    player.heading = lerpAngle(player.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12));
    player.phase += dt * 10 * mag;
    player.moving = Math.max(0, mv.y) * mag + Math.abs(mv.x) * 0.25;
  } else {
    mag = 0;
  }
  world.resolve(player.pos, player.radius);
  if (!game.inside) life.pushOut(player.pos, player.radius);
  if (!game.inside) {
    const ddx = player.pos.x - donkey.pos.x;
    const ddz = player.pos.z - donkey.pos.z;
    const dd = Math.hypot(ddx, ddz);
    if (dd < 1.15 && dd > 1e-4) {
      player.pos.x = donkey.pos.x + (ddx / dd) * 1.15;
      player.pos.z = donkey.pos.z + (ddz / dd) * 1.15;
    }
  }
  player.pos.y = world.heightAt(player.pos.x, player.pos.z);
  animatePerson(player.person, player.phase, mag);
  player.person.group.position.copy(player.pos);
  player.person.group.rotation.set(0, player.heading, 0);
}

/** Maç akşamı: her iki günde bir 19:00-22:00 arası TV'de maç var. */
function matchOn() {
  const h = hourNow();
  return dayNum() % 2 === 0 && h >= 19 && h < 22;
}
function customerRate() {
  const m = matchOn() && kira.tvOn ? (game.upgrades.tv ? 1.5 : 1.2) : 1;
  return baseRate() * m * (game.upgrades.tabela ? 1.3 : 1) * (0.6 + (game.pop / 100) * 0.9);
}
function baseRate() {
  if (!game.shopOpen) return 0;
  const h = hourNow();
  if (h < 7 || h >= 23.5) return 0;
  if (h < 10) return 1.1; // sabah çayı
  if (h < 13) return 0.8;
  if (h < 17) return 1.2; // öğleden sonra okey
  if (h < 22) return 1.4; // akşam kalabalığı
  return 0.6;
}

function advanceTime(dt) {
  const before = hourNow();
  const dm = dt * MIN_PER_SEC;
  game.minutes += dm;
  game.energy = Math.max(0, game.energy - (dm / 60) * ENERGY_PER_HOUR);
  const h = hourNow();
  if (before < 21 && h >= 21 && !game.lateWarned) {
    game.lateWarned = true;
    toast(matchOn() ? '⚽ Akşam maçı başladı! TV açık olsun, kıraathane dolacak.' : '🌙 Akşam oldu. Gece yarısına doğru kepengi indirip eve gitmeyi unutma.', 'info');
  }
  if (game.energy < 25 && !game.tiredWarned) {
    game.tiredWarned = true;
    toast('😪 Çok yorgunsun! Eve gidip uyu, yoksa sokakta bayılacaksın.', 'warn');
  }
  if (game.energy <= 0 && game.mode !== 'sleep') startSleep('faint');
}

function updatePlaying(dt) {
  if (!game.busy && game.mode !== 'talk') advanceTime(dt);
  else if (game.mode === 'talk') advanceTime(dt * 0.5);
  if (game.mode === 'sleep') return;

  if (game.mode === 'walk' || game.mode === 'home') {
    if (!game.busy) updateWalk(dt);
    donkey.update(dt, null);

  } else if (game.mode === 'ride') {
    const mv = controls.getMove();
    donkey.update(dt, { throttle: mv.y, steer: mv.x, brake: controls.brake });
    life.pushOut(donkey.pos, 0.7);
    // Eşek kahvehaneye giremez
    if (kira.isInside(donkey.pos) || (Math.abs(donkey.pos.x - kira.group.position.x) < 7.6 && donkey.pos.z < -8.0 && donkey.pos.z > -21)) {
      donkey.pos.z = Math.max(donkey.pos.z, -7.9);
      if (donkey.speed > 0) donkey.speed *= 0.3;
      toast('🐴 Eşek kahvehaneye giremez! Önde in, yürüyerek gir.', 'warn', 'donkeyin');
    }
    donkey.seatWorld(tmpV);
    player.pos.copy(donkey.pos);
    player.person.group.position.set(tmpV.x, tmpV.y - 0.9, tmpV.z);
    player.person.group.rotation.set(0, donkey.heading, 0);
    animatePerson(player.person, 0, 0, 'ride');
  } else {
    donkey.update(dt, null);
    if (game.mode === 'talk') {
      animatePerson(player.person, 0, 0);
      const n = npcs.active;
      if (n) player.heading = lerpAngle(player.heading, Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z), 1 - Math.exp(-dt * 8));
      player.person.group.rotation.set(0, player.heading, 0);
    }
  }

  customers.update(dt, true, customerRate(), matchOn() && kira.tvOn);
  checkStock();
  updateAim();
  computeActions();
  updateHud();
  if (game.time - game.lastSave > 30) saveGame();
}

/** Şu anki hedef (sarı ok bunu gösterir). */
function objective() {
  if (game.inside || game.mode === 'ocak' || game.mode === 'sleep') return null;
  const h = hourNow();
  const tired = game.energy < 20;
  const inK = kira.isInside(player.pos);
  if (game.shopOpen) {
    if (tired || h >= 23.5 || h < 6) return { pos: city.shop.interactPoint, text: '🔒 Geç oldu! Kepengi indir, sonra eve git.' };
    const shopDoor = (id) => city.shops.find((x) => x.id === id).door;
    if (game.stock.cay <= 0 && kira.tea.left <= 0) return { pos: shopDoor('bakkal'), text: '🫖 Kuru çay bitti! Bakkal Nuri\'ye git.' };
    if (!inK) {
      if (customers.waitingCount() > 0) return { pos: kira.entry, text: '🙋 Müşteriler el kaldırıyor! Kıraathaneye gir.' };
      return null;
    }
    if (kira.payQueue.length) return { pos: kira.kasaPoint, text: '💰 Kasada hesap bekleyen var!' };
    if (kira.glassClean <= 0 && kira.dirty > 0) return { pos: kira.sinkPoint, text: '🧽 Temiz bardak yok! Lavaboda yıka.' };
    const want = kira.tables.find((t) => t.state === 'ordering');
    if (want) {
      const has = kira.tray.some((x) => want.order.includes(x.type));
      return has ? { pos: want.center, text: '🛎️ Tepsiyi el kaldıran masaya götür.' } : { pos: kira.ocakPoint, text: '🫖 Sipariş var: ' + want.order.map((x) => DRINKS[x].icon).join('') + ' — Çay makinesine git.' };
    }
    const g = kira.tables.find((t) => t.party && t.wantGame && !t.game);
    if (g) return kira.gear ? { pos: g.center, text: `${GAMES[g.wantGame].icon} Takımı masaya ver.` } : { pos: kira.rackPoint, text: `${GAMES[g.wantGame].icon} Bir masa ${GAMES[g.wantGame].name} istiyor! Raftan al.` };
    const d = kira.tables.find((t) => t.state === 'dirty');
    if (d) return { pos: d.center, text: '🧺 Boşalan masayı topla.' };
    return null;
  }
  if (tired || h >= 23 || h < 6) return { pos: city.home.doorPoint, text: '🏠 Eve git ve uyu (sarı ok yolu gösteriyor).' };
  return { pos: city.shop.interactPoint, text: '🔓 Kıraathanenin kepengini aç (sarı oku takip et).' };
}

let lastOrderKey = '';
function updateHud() {
  const n = dayNight.night;
  ui.clock.classList.toggle('night', n > 0.5);
  setText(ui.clock, `${n > 0.5 ? '🌙' : '☀️'} ${formatClock(game.minutes)} · G${dayNum()}`);
  const e = Math.round(game.energy);
  ui.energyBar.style.width = `${e}%`;
  ui.energyBar.style.background = e > 50 ? '#2ec27e' : e > 25 ? '#f77f00' : '#e63946';
  ui.energyPill.classList.toggle('low', e < 25);
  setText(ui.shopPill, game.shopOpen ? '🔓 Açık' : '🔒 Kapalı');
  show(ui.queue, game.shopOpen);
  setText(ui.queue, `🙋 ${customers.waitingCount()} · 👥 ${customers.customerCount()}`);
  const inK = kira.isInside(player.pos) && !game.inside;
  const showCarry = inK || kira.tray.length > 0 || !!kira.gear;
  show(ui.carry, showCarry);
  let carry = `🍽️ ${kira.tray.length ? kira.tray.map((x) => DRINKS[x.type].icon).join('') : 'boş'}`;
  if (kira.gear) carry += ` · ${GAMES[kira.gear].icon}`;
  if (kira.dirty) carry += ` · 🧺${kira.dirty}`;
  setText(ui.carry, carry);
  const st = game.stock;
  setText(ui.stockPill, `🫖${st.cay} 🧊${st.seker} ☕${st.kahve} 🥃${kira.glassClean}/${kira.glassTotal}`);
  ui.stockPill.classList.toggle('low', st.cay < 1 || st.seker < 5 || kira.glassClean < 2);
  const showTray = inK && game.state === 'playing' && game.mode !== 'sleep';
  kira.trayView.visible = showTray;
  player.person.group.visible = !firstPerson();

  let hint = '';
  const obj = objective();
  if (game.mode === 'walk' && obj && distXZ(player.pos, obj.pos) > 2.2) hint = obj.text;
  else if (game.mode === 'ride') {
    const kmh = Math.round(Math.abs(donkey.speed) * 3.6);
    hint = kmh > 1 ? `🐴 ${kmh} km/s ${kmh > 30 ? '— Eşek uçuyor!' : ''}` : "🐴 Gaz için joystick'i yukarı it";
    if (obj && kmh <= 1) hint = obj.text;
  } else if (game.mode === 'home') {
    const h = hourNow();
    if (h >= 20 || h < 6 || game.energy < 30) hint = '🛏️ Yatağa git ve uyu. Yarın yeni bir gün!';
  }
  setText(ui.hint, hint);
  show(ui.hint, !!hint);
}

function updateMarkers(dt) {
  const obj = game.state === 'playing' ? objective() : null;
  const ref = game.mode === 'ride' ? donkey.pos : player.pos;
  marker.visible = !!obj && distXZ(ref, obj.pos) > 2.2;
  if (marker.visible) {
    marker.position.set(obj.pos.x, 2.6 + Math.sin(game.time * 4) * 0.2, obj.pos.z);
    marker.rotation.y += dt * 2;
  }
  const far = obj ? distXZ(ref, obj.pos) : 0;
  guide.visible = !!obj && far > 7 && (game.mode === 'walk' || game.mode === 'ride');
  if (guide.visible) {
    guide.position.set(ref.x, ref.y + (game.mode === 'ride' ? 3.5 : 2.7), ref.z);
    guide.rotation.y = Math.atan2(obj.pos.x - ref.x, obj.pos.z - ref.z);
    guideMesh.position.z = 0.9 + Math.sin(game.time * 5) * 0.12;
  }
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 72 : 58;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
onResize();

/* =========================================================
   Ana döngü
   ========================================================= */
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.time += dt;
  city.update(dt, game.time);
  const look = controls.consumeLook();

  if (game.state === 'playing') {
    if (game.mode === 'sleep') updateSleep(dt);
    else updatePlaying(dt);
  } else if (game.state === 'menu') {
    donkey.update(dt, null);
    customers.update(dt, false, 1, false);
    player.pos.copy(city.playerSpawn);
    player.person.group.position.copy(player.pos);
    player.person.group.rotation.set(0, Math.PI, 0);
    animatePerson(player.person, game.time * 2, 0, 'wave');
  }

  const hour = game.state === 'menu' ? 18.4 : game.mode === 'sleep' && game.sleep ? ((game.sleep.from + (game.sleep.to - game.sleep.from) * game.sleep.t) % 1440) / 60 : hourNow();
  if (game.state !== 'paused') {
    const blockers = [];
    if (game.state === 'playing' && !game.inside) blockers.push(player.pos);
    blockers.push(donkey.pos);
    life.update(dt, hour, blockers, camera.position, city.heightAt, dayNight.night);
    const playingOut = game.state === 'playing' && !game.inside && game.mode !== 'ocak' && game.mode !== 'sleep';
    npcs.update(dt, game.mode === 'ride' ? donkey.pos : player.pos, playingOut, hour);
  }

  updateMarkers(dt);
  updateCamera(dt, look);

  const n = dayNight.update(hour, camera.position, camLook, dt);
  if (game.state === 'playing') {
    sfx.ambience(dt, {
      night: n,
      inside: !!game.inside || game.mode === 'sleep',
      sizzle: game.shopOpen && !game.inside && distXZ(camera.position, kira.ocakPoint) < 6 ? (game.mode === 'ocak' ? 0.03 : 0.012) : 0,
      carDist: life.nearestCar,
    });
  }
  city.setNight(n);
  home.setDaylight(dayNight.sky, n, game.inside === 'home');
  shopRoom.setDaylight(n, game.inside === 'shop');
  if (game.inside === 'shop') shopRoom.update(dt, player.pos);
  const lit = game.shopOpen || game.state === 'menu';
  for (const l of kira.lights) l.intensity = lit ? 6 + n * 10 : 0;
  kira.tubeMat.emissiveIntensity = lit ? 1.2 : 0.05;
  const clockMin = Math.floor((game.state === 'menu' ? hour * 60 : game.minutes % 1440) / 5);
  if (clockMin !== game.lastClockDraw) {
    game.lastClockDraw = clockMin;
    const mins = clockMin * 5;
    city.setClock(Math.floor(mins / 60), mins % 60);
  }

  renderer.render(scene, camera);
}

refreshMenu();
updateSoundBtn();
updateQualityBtn();
setMode('walk');
city.shop.setOpen(true, true);
show(ui.loading, false);
show(ui.menu, true);
window.__gameReady = true;

// Android uygulaması (APK) için geri tuşu ve arka plana alma kancaları.
window.__androidBack = () => {
  if (!ui.modal.classList.contains('hidden')) {
    show(ui.modal, false);
    return true;
  }
  if (game.state === 'playing') {
    if (game.mode === 'sleep') return true;
    if (!ui.shopPanel.classList.contains('hidden')) {
      closeShopPanel();
      return true;
    }
    if (game.mode === 'talk') npcs.close();
    else pause();
    return true;
  }
  if (game.state === 'paused') {
    goMenu();
    return true;
  }
  return false; // ana menüde: uygulamadan çık
};
window.__androidPause = () => {
  pause();
  saveGame();
};
// Geliştirici kancası: ?debug ile konsoldan durum incelenebilir.
if (new URLSearchParams(location.search).has('debug')) window.__dbg = { game, player, donkey, npcs, customers, kira, city, home, cam, startSleep, life };
frame();
