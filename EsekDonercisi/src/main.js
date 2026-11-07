// =========================================================
// main.js — EsekDonercisi: menü/oyun durumu, sahne, ışıklar, kamera ve render döngüsü
// =========================================================
import * as THREE from 'three';
import { buildCity, resolveCircle, pointBlocked } from './city.js';
import { Donkey } from './donkey.js';
import { Controls } from './controls.js';
import { CuttingStation, ITEM_INFO, MAX_SLICES } from './cutting.js';
import { CustomerManager } from './customers.js';
import { NPCManager, createPerson, animatePerson } from './npcs.js';

const $ = (id) => document.getElementById(id);
const HS_KEY = 'esekdonercisi.highscore';
const SND_KEY = 'esekdonercisi.sound';

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
  return {
    unlock: ensure,
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
  carry: $('carryPill'),
  queue: $('queuePill'),
  hint: $('hint'),
  order: $('orderCard'),
  toasts: $('toasts'),
  actions: $('actions'),
  joyZone: $('joyZone'),
  highScore: $('highScore'),
  btnSound: $('btnSound'),
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 55, 150);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xfff4e0, 0x5a7d3c, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -32;
sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32;
sun.shadow.camera.bottom = -32;
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
  /* font yüklenemezse yedek font kullanılır */
}

/* =========================================================
   Dünya
   ========================================================= */
const city = buildCity(scene);
const world = {
  colliders: city.colliders,
  heightAt: city.heightAt,
  resolve: (p, r) => resolveCircle(p, r, city.colliders),
};

const game = {
  state: 'menu', // menu | playing | paused
  mode: 'walk', // walk | ride | cut | talk
  money: 0,
  high: Number(lsGet(HS_KEY, '0')) || 0,
  startHigh: 0,
  recordToast: false,
  time: 0,
  camYaw: 0,
  lastLook: -10,
  snapCam: true,
  cutTutorial: false,
};

const ctx = { scene, camera, sfx, toast, addMoney, world };

const player = {
  person: createPerson({ shirt: 0xffffff, pants: 0x2d3142, hat: 'chef', apron: true, mustache: true, hair: 0x1a1a1a, skin: 0xe9b47f }),
  pos: new THREE.Vector3(),
  heading: Math.PI,
  phase: 0,
  radius: 0.38,
  speed: 4.8,
};
scene.add(player.person.group);

const donkey = new Donkey(ctx, city.donkeySpawn);
const cutting = new CuttingStation(ctx, city.shop);
const customers = new CustomerManager(ctx, city.shop);
const npcs = new NPCManager(ctx, city);
const controls = new Controls({ zone: ui.joyZone, base: $('joyBase'), knob: $('joyKnob'), lookTarget: canvas });

// Dükkânın önünde zıplayan yön oku
const marker = new THREE.Mesh(
  new THREE.ConeGeometry(0.35, 0.7, 4),
  new THREE.MeshLambertMaterial({ color: 0xffcf3f, emissive: 0x6b4a00, flatShading: true })
);
marker.rotation.x = Math.PI;
scene.add(marker);

/* =========================================================
   Para & rekor
   ========================================================= */
function addMoney(amount) {
  game.money = Math.max(0, game.money + amount);
  setText(ui.money, fmt(game.money));
  const pop = document.createElement('span');
  pop.className = 'money-pop' + (amount < 0 ? ' neg' : '');
  pop.textContent = (amount >= 0 ? '+' : '') + fmt(amount) + ' TL';
  ui.moneyPill.appendChild(pop);
  setTimeout(() => pop.remove(), 1300);
  if (game.money > game.high) {
    game.high = game.money;
    lsSet(HS_KEY, String(game.high));
    if (!game.recordToast && game.startHigh > 0) {
      game.recordToast = true;
      toast('🏆 YENİ REKOR! Kasabanın efsane dönercisi sensin!', 'ok');
    }
  }
}

function refreshHighScore() {
  setText(ui.highScore, fmt(game.high));
}

/* =========================================================
   Bağlamsal butonlar
   ========================================================= */
let actionsKey = '';
let currentActions = [];

function setActions(list, grid = false) {
  const key = (grid ? 'g|' : '') + list.map((a) => a.id + ':' + a.label).join('|');
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
        const cur = currentActions.find((x) => x.id === a.id);
        cur?.onHold?.(v);
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
        const cur = currentActions.find((x) => x.id === a.id);
        cur?.onPress?.();
      });
    }
    ui.actions.appendChild(b);
  }
}

function computeActions() {
  const list = [];
  if (game.state !== 'playing') return setActions([]);
  if (game.mode === 'walk') {
    if (distXZ(player.pos, city.shop.interactPoint) < 2.4) list.push({ id: 'counter', icon: '🥙', label: 'Tezgaha Geç', cls: 'yellow hot', onPress: enterCounter });
    if (distXZ(player.pos, donkey.pos) < 2.6) list.push({ id: 'mount', icon: '🐴', label: 'Eşeğe Bin', cls: 'green', onPress: mount });
    const npc = npcs.nearest(player.pos, 2.7);
    if (npc) list.push({ id: 'talk-' + npc.id, icon: '💬', label: 'Konuş', cls: 'blue', onPress: () => startTalk(npc) });
    setActions(list);
  } else if (game.mode === 'ride') {
    list.push({ id: 'brake', icon: '🛑', label: 'Fren', hold: true, onHold: (v) => (controls.brakeHeld = v) });
    list.push({ id: 'bray', icon: '📣', label: 'Anırt', cls: 'yellow', onPress: () => donkey.bray() });
    list.push({ id: 'dismount', icon: '⬇️', label: 'Eşekten İn', cls: 'gray', onPress: dismount });
    setActions(list);
  } else if (game.mode === 'cut') {
    list.push({ id: 'ekmek', icon: '🥖', label: 'Ekmek Arası', cls: 'yellow', onPress: () => cutting.makeItem('ekmek') });
    list.push({ id: 'durum', icon: '🌯', label: 'Dürüm', cls: 'yellow', onPress: () => cutting.makeItem('durum') });
    list.push({ id: 'serve', icon: '🛎️', label: 'Servis Et', cls: 'green' + (cutting.item && customers.front() ? ' hot' : ''), onPress: serve });
    list.push({ id: 'exit', icon: '🚪', label: 'Tezgahtan Çık', cls: 'gray', onPress: exitCounter });
    setActions(list, true);
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
  const showJoy = mode === 'walk' || mode === 'ride';
  ui.joyZone.classList.toggle('hidden', !showJoy);
  ui.order.classList.toggle('hidden', mode !== 'cut');
  controls.resetJoystick();
  controls.brakeHeld = false;
  actionsKey = '';
}

function mount() {
  if (game.mode !== 'walk') return;
  sfx.click();
  donkey.ridden = true;
  setMode('ride');
  game.camYaw = donkey.heading + Math.PI;
  toast('Deh deh! 🐴 Joystick yukarı = gaz, sağ/sol = dön, Fren = dur.', 'info', 'mounthint');
}

function dismount() {
  if (Math.abs(donkey.speed) > 3) {
    toast('Önce yavaşla! Fren butonuna bas 🛑', 'warn', 'slowdown');
    return;
  }
  sfx.click();
  const h = donkey.heading;
  player.pos.set(donkey.pos.x - Math.cos(h) * 1.25, 0, donkey.pos.z + Math.sin(h) * 1.25);
  world.resolve(player.pos, player.radius);
  player.heading = h;
  donkey.speed = 0;
  donkey.ridden = false;
  setMode('walk');
}

function enterCounter() {
  if (game.mode !== 'walk') return;
  sfx.click();
  setMode('cut');
  cutting.enter();
  player.person.group.visible = false;
  if (!game.cutTutorial) {
    game.cutTutorial = true;
    toast('👇 Ekranı yukarıdan aşağı kaydırarak döneri kes!', 'info');
  }
}

function exitCounter() {
  sfx.click();
  cutting.exit();
  player.pos.copy(city.shop.exitPoint);
  player.heading = 0;
  player.person.group.visible = true;
  game.camYaw = 0;
  setMode('walk');
}

function serve() {
  const front = customers.front();
  if (!front) {
    toast(customers.waitingCount() ? 'Müşteri tezgaha geliyor, bir saniye...' : 'Sırada bekleyen müşteri yok.', 'warn', 'nocust');
    return;
  }
  if (!cutting.item) {
    toast('Önce Ekmek Arası ya da Dürüm hazırla! 🥖🌯', 'warn', 'noitem');
    return;
  }
  customers.serve(front, cutting.takeItem());
}

function startTalk(npc) {
  sfx.click();
  setMode('talk');
  npcs.start(npc, () => setMode('walk'));
}

/* =========================================================
   Oyun durumu: menü / oyna / duraklat
   ========================================================= */
function resetGame() {
  game.money = 0;
  game.startHigh = game.high;
  game.recordToast = false;
  setText(ui.money, '0');
  player.pos.copy(city.playerSpawn);
  player.heading = Math.PI;
  player.person.group.visible = true;
  donkey.reset();
  cutting.exit();
  cutting.reset();
  customers.reset();
  npcs.reset();
  game.camYaw = 0;
  game.snapCam = true;
  setMode('walk');
}

function tryFullscreen() {
  const el = document.documentElement;
  if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function startGame() {
  sfx.unlock();
  sfx.click();
  resetGame();
  game.state = 'playing';
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  tryFullscreen();
  toast('Hoş geldin usta! İlk müşteriler yolda 🥙', 'ok');
}

function goMenu() {
  npcs.close(true);
  cutting.exit();
  player.person.group.visible = true;
  game.state = 'menu';
  setMode('walk');
  setActions([]);
  ui.pause.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  refreshHighScore();
  game.snapCam = true;
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  controls.resetJoystick();
  controls.brakeHeld = false;
  ui.pauseStats.innerHTML =
    `💰 Kasa: <b>${fmt(game.money)} TL</b><br>🏆 Rekor: <b>${fmt(game.high)} TL</b><br>` +
    `🥙 Servis: <b>${customers.served}</b> · 😍 Mükemmel: <b>${customers.perfect}</b> · 😤 Kaçan: <b>${customers.lost}</b><br>` +
    `🔪 Kesilen dilim: <b>${cutting.totalCut}</b>`;
  ui.pause.classList.remove('hidden');
}

function resume() {
  if (game.state !== 'paused') return;
  sfx.click();
  ui.pause.classList.add('hidden');
  game.state = 'playing';
}

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
  ui.modal.classList.remove('hidden');
}

$('btnStart').addEventListener('click', startGame);
$('btnHow').addEventListener('click', () => openModal('how'));
$('btnAbout').addEventListener('click', () => openModal('about'));
$('modalClose').addEventListener('click', () => {
  sfx.click();
  ui.modal.classList.add('hidden');
});
$('pauseBtn').addEventListener('click', () => {
  sfx.click();
  pause();
});
$('btnResume').addEventListener('click', resume);
$('btnMenu').addEventListener('click', () => {
  sfx.click();
  goMenu();
});
ui.btnSound.addEventListener('click', () => {
  sfx.setEnabled(!sfx.enabled);
  updateSoundBtn();
  sfx.click();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (game.state === 'paused') {
    if (e.code === 'Escape' || e.code === 'KeyP') resume();
    return;
  }
  if (game.state === 'menu') {
    if (e.code === 'Enter' && ui.modal.classList.contains('hidden')) startGame();
    else if (e.code === 'Escape') ui.modal.classList.add('hidden');
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') return pause();
  if (game.mode === 'talk') {
    if (e.code === 'Digit1' || e.code === 'Numpad1') npcs.chooseIndex(0);
    else if (e.code === 'Digit2' || e.code === 'Numpad2') npcs.chooseIndex(1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') npcs.chooseIndex(0);
    return;
  }
  if (game.mode === 'cut') {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') cutting.cut();
    else if (e.code === 'Digit1' || e.code === 'Numpad1') cutting.makeItem('ekmek');
    else if (e.code === 'Digit2' || e.code === 'Numpad2') cutting.makeItem('durum');
    else if (e.code === 'Enter' || e.code === 'KeyE') serve();
    else if (e.code === 'KeyQ') exitCounter();
    return;
  }
  if (e.code === 'KeyE' || e.code === 'Enter') currentActions.find((a) => !a.hold)?.onPress?.();
  else if (e.code === 'KeyH' && game.mode === 'ride') donkey.bray();
  else if (e.code === 'KeyQ' && game.mode === 'ride') dismount();
});

/* =========================================================
   Güncelleme
   ========================================================= */
const tmpV = new THREE.Vector3();

function updateWalk(dt) {
  const mv = controls.getMove();
  const mag = Math.min(1, Math.hypot(mv.x, mv.y));
  if (mag > 0.01) {
    const fx = -Math.sin(game.camYaw);
    const fz = -Math.cos(game.camYaw);
    const rx = -fz;
    const rz = fx;
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    player.pos.x += dx * player.speed * mag * dt;
    player.pos.z += dz * player.speed * mag * dt;
    player.heading = lerpAngle(player.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12));
    player.phase += dt * 10 * mag;
  }
  world.resolve(player.pos, player.radius);
  // Eşeğin içinden geçme
  const ddx = player.pos.x - donkey.pos.x;
  const ddz = player.pos.z - donkey.pos.z;
  const dd = Math.hypot(ddx, ddz);
  if (dd < 1.15 && dd > 1e-4) {
    player.pos.x = donkey.pos.x + (ddx / dd) * 1.15;
    player.pos.z = donkey.pos.z + (ddz / dd) * 1.15;
  }
  player.pos.y = world.heightAt(player.pos.x, player.pos.z);
  animatePerson(player.person, player.phase, mag);
  player.person.group.position.copy(player.pos);
  player.person.group.rotation.y = player.heading;
}

function updatePlaying(dt) {
  const look = controls.consumeLook();
  if ((game.mode === 'walk' || game.mode === 'ride') && look) {
    game.camYaw -= look * 0.0065;
    game.lastLook = game.time;
  }

  if (game.mode === 'walk') {
    updateWalk(dt);
    donkey.update(dt, null);
  } else if (game.mode === 'ride') {
    const mv = controls.getMove();
    donkey.update(dt, { throttle: mv.y, steer: mv.x, brake: controls.brake });
    donkey.seatWorld(tmpV);
    player.pos.copy(donkey.pos);
    player.person.group.position.set(tmpV.x, tmpV.y - 0.86, tmpV.z);
    player.person.group.rotation.y = donkey.heading;
    animatePerson(player.person, 0, 0, 'ride');
    if (Math.abs(donkey.speed) > 0.6 && game.time - game.lastLook > 1.2) {
      const target = donkey.heading + Math.PI;
      game.camYaw = lerpAngle(game.camYaw, target, 1 - Math.exp(-dt * 2.5));
    }
  } else {
    donkey.update(dt, null);
    if (game.mode === 'talk') {
      animatePerson(player.person, 0, 0);
      const n = npcs.active;
      if (n) player.heading = lerpAngle(player.heading, Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z), 1 - Math.exp(-dt * 8));
      player.person.group.rotation.y = player.heading;
    }
  }

  customers.update(dt, true);
  computeActions();
  updateHud();
}

let lastOrderKey = '';
function updateHud() {
  let carry = `🔪 ${cutting.slices}/${MAX_SLICES}`;
  if (cutting.item) carry += ` · ${ITEM_INFO[cutting.item.type].icon}${cutting.item.slices}`;
  setText(ui.carry, carry);
  setText(ui.queue, `👥 ${customers.waitingCount()}`);

  if (game.mode === 'cut') {
    const nx = customers.nextInfo();
    const key = nx ? `${nx.order.type}|${nx.order.slices}|${nx.ready}` : 'none';
    if (key !== lastOrderKey) {
      lastOrderKey = key;
      if (nx) {
        const info = ITEM_INFO[nx.order.type];
        ui.order.classList.remove('empty');
        ui.order.innerHTML =
          `<div class="oc-title">${nx.ready ? 'Sıradaki müşteri istiyor' : 'Müşteri tezgaha geliyor...'}</div>` +
          `<div class="oc-main">${info.icon} ${info.label} · <span style="color:#9d0208">${nx.order.slices} dilim</span></div>` +
          `<div class="oc-bar"><i></i></div><div class="oc-tray"></div>`;
      } else {
        ui.order.classList.add('empty');
        ui.order.innerHTML = `<div class="oc-title">Sipariş</div><div class="oc-main">Sırada müşteri yok, döner kes ve hazır ol! 🔪</div><div class="oc-tray"></div>`;
      }
    }
    if (nx) {
      const bar = ui.order.querySelector('.oc-bar i');
      if (bar) {
        bar.style.width = `${Math.round(nx.ratio * 100)}%`;
        bar.style.background = nx.ratio > 0.5 ? '#2ec27e' : nx.ratio > 0.25 ? '#f77f00' : '#e63946';
      }
    }
    const tray = ui.order.querySelector('.oc-tray');
    if (tray) {
      const t = cutting.item
        ? `Elinde: ${ITEM_INFO[cutting.item.type].icon} ${ITEM_INFO[cutting.item.type].label} (${cutting.item.slices} dilim) → Servis Et`
        : `Tepside: ${cutting.slices} dilim → Ekmek Arası / Dürüm yap`;
      setText(tray, t);
    }
  } else {
    lastOrderKey = '';
  }

  let hint = '';
  if (game.mode === 'walk') {
    if (customers.waitingCount() > 0 && distXZ(player.pos, city.shop.interactPoint) > 3) hint = '🥙 Müşteri bekliyor! Dükkânın önündeki sarı oka git.';
  } else if (game.mode === 'ride') {
    const kmh = Math.round(Math.abs(donkey.speed) * 3.6);
    hint = kmh > 1 ? `🐴 ${kmh} km/s ${kmh > 30 ? '— Eşek uçuyor!' : ''}` : '🐴 Gaz için joystick\'i yukarı it';
  }
  setText(ui.hint, hint);
  ui.hint.classList.toggle('hidden', !hint);
}

/* =========================================================
   Kamera
   ========================================================= */
const camPos = new THREE.Vector3(0, 20, 40);
const camLook = new THREE.Vector3();
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();

function updateCamera(dt) {
  if (game.state === 'menu') {
    const t = game.time * 0.05;
    desiredPos.set(-6 + Math.sin(t) * 44, 24 + Math.sin(t * 1.7) * 3, 6 + Math.cos(t) * 44);
    desiredLook.set(-6, 2, 4);
  } else if (game.mode === 'cut') {
    desiredPos.copy(city.shop.cutCamPos);
    desiredLook.copy(city.shop.cutLookAt);
  } else {
    const riding = game.mode === 'ride';
    const target = riding ? donkey.pos : player.pos;
    const dist = riding ? 8.5 : 6.5;
    const h = riding ? 4.4 : 3.6;
    const sx = Math.sin(game.camYaw);
    const sz = Math.cos(game.camYaw);
    let d = dist;
    for (; d > 1.6; d -= 0.4) {
      desiredPos.set(target.x + sx * d, target.y + h * (0.55 + 0.45 * (d / dist)), target.z + sz * d);
      if (!pointBlocked(desiredPos, city.colliders)) break;
    }
    desiredLook.set(target.x, target.y + 1.3, target.z);
  }
  const k = game.snapCam ? 1 : 1 - Math.exp(-dt * (game.mode === 'cut' ? 5 : game.state === 'menu' ? 2 : 8));
  game.snapCam = false;
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Gölge kamerası oyuncuyu takip etsin
  sun.target.position.set(camLook.x, 0, camLook.z);
  sun.position.set(camLook.x + 30, 50, camLook.z + 20);
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

  if (game.state === 'playing') {
    updatePlaying(dt);
  } else if (game.state === 'menu') {
    donkey.update(dt, null);
    customers.update(dt, false);
    player.pos.copy(city.playerSpawn);
    player.person.group.position.copy(player.pos);
    player.person.group.rotation.y = Math.PI;
    animatePerson(player.person, game.time * 2, 0, 'wave');
    controls.consumeLook();
  }

  if (game.state !== 'paused') {
    cutting.update(dt);
    npcs.update(dt, game.mode === 'ride' ? donkey.pos : player.pos, game.state === 'playing' && game.mode !== 'cut');
  }

  // Yön oku
  const showMarker = game.state === 'playing' && game.mode !== 'cut' && distXZ(player.pos, city.shop.interactPoint) > 2.2;
  marker.visible = showMarker;
  if (showMarker) {
    marker.position.set(city.shop.interactPoint.x, 2.4 + Math.sin(game.time * 4) * 0.2, city.shop.interactPoint.z);
    marker.rotation.y += dt * 2;
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}

refreshHighScore();
updateSoundBtn();
setMode('walk');
ui.loading.classList.add('hidden');
ui.menu.classList.remove('hidden');
window.__gameReady = true;
// Android uygulaması (APK) için geri tuşu ve arka plana alma kancaları.
window.__androidBack = () => {
  if (!ui.modal.classList.contains('hidden')) {
    ui.modal.classList.add('hidden');
    return true;
  }
  if (game.state === 'playing') {
    if (game.mode === 'talk') npcs.close();
    else if (game.mode === 'cut') exitCounter();
    else pause();
    return true;
  }
  if (game.state === 'paused') {
    goMenu();
    return true;
  }
  return false; // ana menüde: uygulamadan çık
};
window.__androidPause = () => pause();
// Geliştirici kancası: ?debug ile konsoldan durum incelenebilir.
if (new URLSearchParams(location.search).has('debug')) window.__dbg = { game, player, donkey, npcs, customers, cutting, city };
frame();
