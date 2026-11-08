'use strict';
/* ============================================================
   ShopSim 3D — game.js
   Retail shop walking sim: cameras, prices, inspection,
   push cart, audio, NPCs, checkout.
   ============================================================ */

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const STORE_W = 72, STORE_D = 52;
const WALL_H = 5.5, WALL_T = 0.6;
const PLAYER_R = 0.45, WALK = 5.2, SPRINT = 1.75;

const colliders = [];
const products  = [];   // every interactable product mesh
const coins     = [];
const tweens    = [];
const npcs      = [];

// ------------------------------------------------------------
// RENDERER / SCENE
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11141f);
scene.fog = new THREE.Fog(0x11141f, 90, 220);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x33302a, 0.5));
const sun = new THREE.DirectionalLight(0xfff3d6, 0.9);
sun.position.set(35, 55, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 40, bottom: -40, near: 10, far: 140 });
scene.add(sun);

// ------------------------------------------------------------
// DEPARTMENTS + PRODUCT CATALOG (with prices, ₹)
// ------------------------------------------------------------
const DEPTS = {
  Produce:   { color: 0x43a047, css: '#43a047', items: [
    ['Apple',      '#e53935', 'sphere', 140], ['Orange', '#fb8c00', 'sphere', 90], ['Banana', '#fdd835', 'box', 55]] },
  Bakery:    { color: 0xffa000, css: '#ffa000', items: [
    ['Bread',      '#8d6e63', 'box', 45], ['Baguette', '#d7a86e', 'box', 60], ['Croissant', '#b5834a', 'box', 80]] },
  Dairy:     { color: 0x039be5, css: '#039be5', items: [
    ['Milk',       '#fafafa', 'box', 32], ['Yogurt', '#f48fb1', 'box', 25], ['Cheese', '#fbc02d', 'box', 110]] },
  Beverages: { color: 0xd84315, css: '#d84315', items: [
    ['Cola',       '#4e342e', 'cyl', 40], ['Juice', '#ffa726', 'cyl', 75], ['Water', '#4fc3f7', 'cyl', 20]] },
  Snacks:    { color: 0x8e24aa, css: '#8e24aa', items: [
    ['Chips',      '#d32f2f', 'box', 35], ['Cookies', '#5d4037', 'box', 50], ['Chocolate', '#6d4c41', 'box', 65]] },
  Frozen:    { color: 0x00acc1, css: '#00acc1', items: [
    ['IceCream',   '#80deea', 'box', 85], ['Pizza', '#ef5350', 'box', 150], ['Peas', '#43a047', 'box', 70]] },
  Household: { color: 0x5e35b1, css: '#5e35b1', items: [
    ['Soap',       '#26c6da', 'box', 30], ['Detergent', '#7cb342', 'box', 95], ['PaperTowels', '#aed581', 'box', 48]] },
  Jewellery: { color: 0xffd700, css: '#c9a227', items: [
    ['GoldChain', '#ffd54f', 'torus', 45000], ['DiamondRing', '#e0f7fa', 'gem', 80000], ['Bangles', '#ffab91', 'torus', 22000], ['Jhumkas', '#ffd180', 'cone', 15000], ['Gemstone', '#7c4dff', 'gem', 30000]] },
  Checkout:  { color: 0x4caf50, css: '#4caf50', items: [] },
};

const PRODUCT_DESC = {
  Apple: 'Crisp and sweet. Sold per kg — aroma is the freshness test.',
  Orange: 'Juicy Nagpur-style. Heavy for its size = more juice.',
  Banana: 'Everyday fuel. Buy slightly green for a longer shelf life.',
  Bread: 'Soft sandwich loaf. Check the bake date on the clip.',
  Baguette: 'Crusty French classic. Best eaten the same day.',
  Croissant: 'All-butter, flaky layers. Bakery counter favourite.',
  Milk: 'Toned pouch milk. Cold chain matters — grab it last.',
  Yogurt: 'Set curd, chilled. Firm wobble means good culture.',
  Cheese: 'Processed block. Sealed pack keeps it moist.',
  Cola: 'Chilled fizzy drink. Impulse zone near the counter.',
  Juice: 'Mixed-fruit juice. Look for "no added sugar" on the back.',
  Water: '1L bottled water. The cheapest thing in the store.',
  Chips: 'Salted potato wafers. Nitrogen-flushed bag = crisp.',
  Cookies: 'Butter-baked. Check the margin tag — high-visibility shelf!',
  Chocolate: 'Milk chocolate bar. Placed at eye level on purpose.',
  IceCream: 'Vanilla tub. Frozen aisle — pick up last.',
  Pizza: 'Frozen margherita. Oven in 12 minutes.',
  Peas: 'Frozen green peas. IQF: individually quick frozen.',
  Soap: 'Glycerin bath bar. Essentials live deep in the store.',
  Detergent: 'Machine-wash powder. Heavy — bring the cart here.',
  PaperTowels: '2-ply kitchen roll. Bulk packs save money.',
  GoldChain: '22K hallmarked chain. Price tracks the daily gold rate — haggle politely.',
  DiamondRing: 'Check the 4 Cs: cut, colour, clarity, carat. Always ask for the certificate.',
  Bangles: 'Traditional set of two. Wedding season = best offers.',
  Jhumkas: 'Classic dome-shaped earrings. Lightweight hooks, heavy look.',
  Gemstone: 'Loose certified stone. Brilliance test: sparkle under the spotlight.',
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function lambert(c) { return new THREE.MeshLambertMaterial({ color: c }); }

function box(w, h, d, color, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}

function makeTextTexture(text, bg, fg = '#ffffff', w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${h * 0.52}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

function addCollider(cx, cz, w, d, shelf = false) {
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, shelf });
}

// ------------------------------------------------------------
// FLOOR + GROUND
// ------------------------------------------------------------
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lambert(0x1a1d29));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e6de'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#dcd8cd'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 13);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(STORE_W, STORE_D), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
}

// ------------------------------------------------------------
// ZONES
// ------------------------------------------------------------
const zones = [
  { d: 'Produce',   x: -23, z: 16,  w: 22, dpt: 14 },
  { d: 'Checkout',  x: 0,   z: 21,  w: 16, dpt: 8  },
  { d: 'Bakery',    x: 24,  z: 14,  w: 20, dpt: 16 },
  { d: 'Dairy',     x: -31, z: -9,  w: 9,  dpt: 24 },
  { d: 'Frozen',    x: -14, z: -21, w: 22, dpt: 9  },
  { d: 'Household', x: 14,  z: -21, w: 22, dpt: 9  },
  { d: 'Beverages', x: 31,  z: -9,  w: 9,  dpt: 24 },
  { d: 'Snacks',    x: 0,   z: -4,  w: 32, dpt: 22 },
  { d: 'Jewellery', x: 52,  z: 2,   w: 24, dpt: 24 },
];
for (const z of zones) {
  const dep = DEPTS[z.d];
  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(z.w, z.dpt),
    new THREE.MeshLambertMaterial({ color: dep.color, transparent: true, opacity: 0.16 })
  );
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(z.x, 0.015, z.z);
  patch.receiveShadow = true;
  scene.add(patch);

  if (z.d !== 'Jewellery') {   // boutique gets its own signage inside the annex
    const lbl = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 3),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(z.d.toUpperCase(), dep.css, '#fff', 512, 256) })
    );
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(z.x, 0.02, z.z);
    scene.add(lbl);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.1),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(z.d.toUpperCase(), dep.css), side: THREE.DoubleSide })
    );
    sign.position.set(z.x, 4.6, z.z);
    scene.add(sign);
    box(9.4, 0.1, 0.1, 0x333333, z.x, 5.7, z.z);
  }
}

// ------------------------------------------------------------
// WALLS
// ------------------------------------------------------------
function wall(cx, cz, w, d) {
  box(w, WALL_H, d, 0xe8e4da, cx, WALL_H / 2, cz);
  addCollider(cx, cz, w, d);
}
wall(0, -STORE_D / 2, STORE_W, WALL_T);
wall(-STORE_W / 2, 0, WALL_T, STORE_D);
wall(STORE_W / 2, -12, WALL_T, 28);   // east wall with a gap (z 2..8) → jewellery courtyard
wall(STORE_W / 2, 17, WALL_T, 18);
wall(-20, STORE_D / 2, 32, WALL_T);
wall(20, STORE_D / 2, 32, WALL_T);
const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.35 });
for (const gx of [-2, 2]) {
  const gl = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.5, 0.1), glassMat);
  gl.position.set(gx, 2.25, STORE_D / 2); scene.add(gl);
}
// east doorway glass + courtyard path to the boutique
const eastGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.5, 6), glassMat);
eastGlass.position.set(STORE_W / 2, 2.25, 5); scene.add(eastGlass);
const courtPath = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 6.6), lambert(0xd9c48a));
courtPath.rotation.x = -Math.PI / 2; courtPath.position.set(38.1, 0.02, 5);
courtPath.receiveShadow = true; scene.add(courtPath);
{
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('WELCOME', '#4caf50', '#fff') }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.03, STORE_D / 2 - 2.2);
  scene.add(mat);
}

// ------------------------------------------------------------
// SHELVES + PRODUCTS
// ------------------------------------------------------------
function randProductMesh(depName) {
  const dep = DEPTS[depName];
  const [name, color, shape, price] = dep.items[Math.floor(Math.random() * dep.items.length)];
  let geo;
  if (shape === 'sphere') geo = new THREE.SphereGeometry(0.3, 14, 12);
  else if (shape === 'cyl') geo = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14);
  else geo = new THREE.BoxGeometry(0.46 + Math.random() * 0.24, 0.44 + Math.random() * 0.28, 0.5);
  const m = new THREE.Mesh(geo, lambert(new THREE.Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08)));
  m.castShadow = true;
  m.userData = { name, dept: depName, price, mrp: Math.round(price * (1.05 + Math.random() * 0.3) / 5) * 5 };
  return m;
}

function makePriceTag(p) {
  // small canvas texture: ₹ price under a yellow header
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd54f'; g.fillRect(0, 0, 128, 20);
  g.fillStyle = '#333'; g.font = 'bold 15px system-ui'; g.textAlign = 'center';
  g.fillText(p.name.toUpperCase(), 64, 15);
  g.fillStyle = '#fff'; g.fillRect(0, 20, 128, 44);
  g.fillStyle = '#c62828'; g.font = 'bold 26px system-ui';
  g.fillText('₹' + p.price, 64, 52);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.3),
    new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })
  );
  return tag;
}

function addShelf(cx, cz, rotY, depName, len) {
  const grp = new THREE.Group();
  grp.position.set(cx, 0, cz); grp.rotation.y = rotY;
  const frameC = 0x607d8b;
  box(0.18, 3, 1.5, frameC, -len / 2, 1.5, 0, grp);
  box(0.18, 3, 1.5, frameC, len / 2, 1.5, 0, grp);
  box(len, 3, 0.14, frameC, 0, 1.5, 0, grp);
  for (const y of [0.85, 1.65, 2.45]) box(len, 0.1, 1.4, 0xeceff1, 0, y, 0, grp, false);
  box(len, 0.12, 1.5, frameC, 0, 3.0, 0, grp);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.7, 0.8),
    new THREE.MeshBasicMaterial({ map: makeTextTexture(depName.toUpperCase(), DEPTS[depName].css), side: THREE.DoubleSide }));
  strip.position.y = 3.6; grp.add(strip);

  for (const side of [-0.45, 0.45]) {
    for (const y of [0.9, 1.7, 2.5]) {
      const n = Math.floor(len / 0.95);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.12) continue;
        const p = randProductMesh(depName);
        p.position.set(-len / 2 + 0.7 + i * 0.95 + (Math.random() - 0.5) * 0.15, y + 0.27, side);
        p.rotation.y = (Math.random() - 0.5) * 0.4;
        grp.add(p);
        products.push(p);
      }
    }
  }
  // price tag rail along the shelf edge (front side)
  const tagN = Math.floor(len / 3);
  for (let i = 0; i < tagN; i++) {
    const sample = randProductMesh(depName);
    const tag = makePriceTag(sample.userData);
    tag.position.set(-len / 2 + 1.5 + i * 3, 0.72, 0.78);
    grp.add(tag);
  }
  scene.add(grp);
  const w = rotY === 0 ? len + 0.4 : 1.7;
  const d = rotY === 0 ? 1.7 : len + 0.4;
  addCollider(cx, cz, w, d, true);
}

// center aisles
addShelf(0, -12, 0, 'Snacks', 26);
addShelf(0, -6,  0, 'Beverages', 26);
addShelf(0, 0,   0, 'Dairy', 26);
addShelf(0, 6,   0, 'Snacks', 26);
addShelf(-32.5, -12, Math.PI / 2, 'Dairy', 14);
addShelf(-32.5, 2,   Math.PI / 2, 'Dairy', 10);
addShelf(32.5, -12,  Math.PI / 2, 'Beverages', 14);
addShelf(32.5, 2,    Math.PI / 2, 'Beverages', 10);
addShelf(-14, -23, 0, 'Frozen', 18);
addShelf(14, -23, 0, 'Household', 18);
addShelf(26, 8, 0, 'Bakery', 12);

// ------------------------------------------------------------
// PRODUCE BINS
// ------------------------------------------------------------
const binPos = [[-30, 12], [-23, 12], [-16, 12], [-30, 19], [-23, 19], [-16, 19]];
const fruit = { 0: ['Apple', '#e53935', 'sphere', 140], 1: ['Orange', '#fb8c00', 'sphere', 90], 2: ['Banana', '#fdd835', 'box', 55] };
binPos.forEach(([bx, bz], idx) => {
  box(4.2, 1.1, 3.2, 0x5d7a5d, bx, 0.55, bz);
  addCollider(bx, bz, 4.2, 3.2, true);
  const kind = fruit[idx % 3];
  for (let i = 0; i < 9; i++) {
    let m;
    if (kind[2] === 'sphere') {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), lambert(kind[1]));
      m.position.set(bx + (Math.random() - 0.5) * 3.2, 1.4 + Math.random() * 0.18, bz + (Math.random() - 0.5) * 2.2);
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), lambert(kind[1]));
      m.position.set(bx + (Math.random() - 0.5) * 3.2, 1.25 + Math.random() * 0.15, bz + (Math.random() - 0.5) * 2.2);
      m.rotation.y = Math.random() * Math.PI;
    }
    m.castShadow = true;
    m.userData = { name: kind[0], dept: 'Produce', price: kind[3], mrp: Math.round(kind[3] * 1.2 / 5) * 5 };
    scene.add(m);
    products.push(m);
  }
  // bin price sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('₹' + kind[3] + '/kg', '#fffde7', '#333'), side: THREE.DoubleSide }));
  sign.position.set(bx, 1.9, bz + 1.65);
  scene.add(sign);
});

// ------------------------------------------------------------
// JEWELLERY BOUTIQUE — east annex (exit through the east door)
// ------------------------------------------------------------
let sparkles = null, sparkleMat = null, necklace = null;
{
  const JX = 52, JZ = 2;
  const goldTrim = 0xc9a227;

  // marble floor
  const jc = document.createElement('canvas'); jc.width = jc.height = 256;
  const jg = jc.getContext('2d');
  jg.fillStyle = '#f5efe2'; jg.fillRect(0, 0, 256, 256);
  jg.strokeStyle = '#e3d3a8'; jg.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    jg.beginPath(); jg.moveTo(i, 0); jg.lineTo(i, 256); jg.stroke();
    jg.beginPath(); jg.moveTo(0, i); jg.lineTo(256, i); jg.stroke();
  }
  const jtex = new THREE.CanvasTexture(jc);
  jtex.wrapS = jtex.wrapT = THREE.RepeatWrapping; jtex.repeat.set(6, 6);
  const jfloor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshLambertMaterial({ map: jtex }));
  jfloor.rotation.x = -Math.PI / 2; jfloor.position.set(JX, 0.01, JZ);
  jfloor.receiveShadow = true; scene.add(jfloor);

  // cream walls with a gold cornice
  const jwallC = 0xf3e9d6;
  function jwall(cx, cz, w, d) {
    box(w, 5, d, jwallC, cx, 2.5, cz);
    box(w, 0.22, d, goldTrim, cx, 5.05, cz);
    addCollider(cx, cz, w, d);
  }
  jwall(JX, -10, 24.6, 0.6);
  jwall(JX, 14, 24.6, 0.6);
  jwall(64, JZ, 0.6, 24.6);
  jwall(40, -3.5, 0.6, 13);          // west wall, door gap z 3..7
  jwall(40, 10.5, 0.6, 7);
  const jGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.5, 4), glassMat);
  jGlass.position.set(40, 2.25, 5); scene.add(jGlass);

  // glass roof — see-through so the overhead cameras still show the interior
  const roof = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.12, 25.2),
    new THREE.MeshPhongMaterial({ color: 0xcfefff, transparent: true, opacity: 0.14 }));
  roof.position.set(JX, 5.3, JZ); scene.add(roof);
  box(25.2, 0.18, 0.5, goldTrim, JX, 5.3, JZ - 8, null, false);
  box(25.2, 0.18, 0.5, goldTrim, JX, 5.3, JZ + 8, null, false);

  // sign above the door, facing the supermarket
  const jSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('✦ JEWELLERY ✦', '#7b1fa2', '#ffd700'), side: THREE.DoubleSide }));
  jSign.rotation.y = -Math.PI / 2;
  jSign.position.set(39.6, 4.2, 5);
  scene.add(jSign);

  // chandelier
  const chand = new THREE.Group(); chand.position.set(JX, 4.4, JZ);
  const goldMat = new THREE.MeshPhongMaterial({ color: 0xffd54f, shininess: 110, specular: 0xffffff });
  const cr1 = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 10, 28), goldMat); cr1.rotation.x = Math.PI / 2; chand.add(cr1);
  const cr2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 10, 24), goldMat); cr2.rotation.x = Math.PI / 2; cr2.position.y = 0.4; chand.add(cr2);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    bulb.position.set(Math.cos(a) * 1.1, -0.15, Math.sin(a) * 1.1);
    chand.add(bulb);
  }
  box(0.06, 1.1, 0.06, 0x8d6e63, 0, 0.75, 0, chand);
  scene.add(chand);
  const chandLight = new THREE.PointLight(0xffe0b2, 0.95, 36);
  chandLight.position.set(JX, 4.1, JZ); scene.add(chandLight);

  // centre showcase: velvet pedestal, glass dome, rotating gold chain
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 1.0, 24), lambert(0x7b1fa2));
  ped.position.set(JX, 0.5, JZ); ped.castShadow = ped.receiveShadow = true; scene.add(ped);
  box(3.2, 0.08, 3.2, goldTrim, JX, 1.04, JZ);
  addCollider(JX, JZ, 3.6, 3.6, true);
  const domeMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.5, 20, 1, true), domeMat);
  dome.position.set(JX, 1.8, JZ); scene.add(dome);
  const domeTop = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  domeTop.position.set(JX, 2.55, JZ); scene.add(domeTop);
  necklace = new THREE.Mesh(new THREE.TorusKnotGeometry(0.55, 0.13, 64, 10), goldMat);
  necklace.position.set(JX, 1.8, JZ); necklace.castShadow = true;
  necklace.userData = { name: 'GoldChain', dept: 'Jewellery', price: 45000, mrp: 52000 };
  scene.add(necklace); products.push(necklace);

  // glass display counters
  function displayCase(cx, cz, defs) {
    const grp = new THREE.Group(); grp.position.set(cx, 0, cz); scene.add(grp);
    box(4.4, 0.9, 1.4, 0x5d4037, 0, 0.45, 0, grp);
    box(4.4, 0.1, 1.4, goldTrim, 0, 0.95, 0, grp);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.2),
      new THREE.MeshPhongMaterial({ color: 0xcfefff, transparent: true, opacity: 0.22 }));
    gl.position.set(0, 1.35, 0); grp.add(gl);
    addCollider(cx, cz, 4.6, 1.6, true);
    defs.forEach((def, i) => {
      const [name, color, shape, price, mrp] = def;
      let m;
      if (shape === 'torus') m = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 20), new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0xffffff }));
      else if (shape === 'gem') m = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshPhongMaterial({ color, shininess: 160, specular: 0xffffff, emissive: color, emissiveIntensity: 0.3 }));
      else m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 10), new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0xffffff }));
      m.position.set(-1.5 + i * 1.0, 1.25, 0);
      m.castShadow = true;
      m.userData = { name, dept: 'Jewellery', price, mrp };
      grp.add(m); products.push(m);
      const tag = makePriceTag(m.userData);
      tag.scale.set(0.8, 0.8, 1); tag.position.set(m.position.x, 1.0, 0.76);
      grp.add(tag);
    });
  }
  displayCase(JX - 4, -7.5, [
    ['DiamondRing', '#e0f7fa', 'gem', 80000, 92000],
    ['Bangles', '#ffab91', 'torus', 22000, 25000],
    ['Jhumkas', '#ffd180', 'cone', 15000, 17500],
  ]);
  displayCase(JX + 4, 11.5, [
    ['Gemstone', '#7c4dff', 'gem', 30000, 34000],
    ['Bangles', '#ffab91', 'torus', 22000, 25000],
    ['DiamondRing', '#e0f7fa', 'gem', 80000, 92000],
  ]);

  // the jeweller
  const jeweller = makeCharacter(0x7b1fa2, 0x4a148c);
  jeweller.group.position.set(JX + 3.4, 0, JZ);
  jeweller.group.rotation.y = -Math.PI / 2;
  npcs.push({ ch: jeweller, mode: 'idle' });

  // sparkle dust
  const sPos = [];
  for (let i = 0; i < 70; i++) sPos.push(JX + (Math.random() - 0.5) * 22, 0.5 + Math.random() * 4, JZ + (Math.random() - 0.5) * 22);
  const sparkleGeo = new THREE.BufferGeometry();
  sparkleGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  sparkleMat = new THREE.PointsMaterial({ color: 0xffe082, size: 0.1, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  sparkles = new THREE.Points(sparkleGeo, sparkleMat);
  scene.add(sparkles);
}

// freezers
for (const fx of [-22, -14, -6]) {
  box(6, 1.7, 2.4, 0xffffff, fx, 0.85, -23.8);
  box(5.6, 0.12, 2.0, 0xb3e5fc, fx, 1.75, -23.8);
  addCollider(fx, -23.8, 6, 2.4);
}

// ------------------------------------------------------------
// CHECKOUT COUNTER
// ------------------------------------------------------------
const CHECKOUT = new THREE.Vector3(0, 0, 20.5);
{
  box(9, 1.1, 1.5, 0x37474f, 0, 0.55, 20.5);
  box(0.9, 0.7, 0.9, 0x263238, 3.4, 1.45, 20.5);
  const belt = box(4.5, 0.08, 1.1, 0x111111, -1.5, 1.14, 20.5, null, false);
  belt.receiveShadow = true;
  addCollider(0, 20.5, 9, 1.5);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('1', '#4caf50'), side: THREE.DoubleSide }));
  s.position.set(0, 3.4, 20.5); scene.add(s);
  box(0.08, 2, 0.08, 0x333333, 0, 2.2, 20.5);
}

// ------------------------------------------------------------
// CHARACTERS
// ------------------------------------------------------------
function makeCharacter(shirtC, pantsC = 0x2c3e50, skinC = 0xffd9b3) {
  const g = new THREE.Group();
  const parts = {};
  parts.body = box(0.7, 0.85, 0.4, shirtC, 0, 1.25, 0, g);
  parts.head = new THREE.Group(); parts.head.position.set(0, 1.95, 0);
  box(0.45, 0.45, 0.42, skinC, 0, 0, 0, parts.head);
  box(0.47, 0.16, 0.44, 0x3a2a1a, 0, 0.22, -0.02, parts.head);
  box(0.08, 0.08, 0.05, 0x222222, 0.11, 0.02, 0.22, parts.head);
  box(0.08, 0.08, 0.05, 0x222222, -0.11, 0.02, 0.22, parts.head);
  g.add(parts.head);
  function limb(w, len, c, x, y) {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    box(w, len, w, c, 0, -len / 2, 0, piv);
    g.add(piv); return piv;
  }
  parts.lArm = limb(0.2, 0.75, shirtC, -0.45, 1.62);
  parts.rArm = limb(0.2, 0.75, shirtC, 0.45, 1.62);
  parts.lLeg = limb(0.24, 0.85, pantsC, -0.18, 0.85);
  parts.rLeg = limb(0.24, 0.85, pantsC, 0.18, 0.85);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return { group: g, parts, phase: 0 };
}

function animateCharacter(ch, dt, moving, speed) {
  if (moving) ch.phase += dt * speed * 2.2;
  else ch.phase *= 0.85;
  const s = Math.sin(ch.phase);
  ch.parts.lLeg.rotation.x = s * 0.75;
  ch.parts.rLeg.rotation.x = -s * 0.75;
  ch.parts.lArm.rotation.x = -s * 0.55;
  ch.parts.rArm.rotation.x = s * 0.55;
  ch.group.position.y = moving ? Math.abs(Math.cos(ch.phase)) * 0.06 : 0;
}

// player
const player = makeCharacter(0x26a69a, 0x34495e);
player.group.position.set(0, 0, 24);
player.group.rotation.y = Math.PI;

// cashier + queue
const cashier = makeCharacter(0xe53935, 0x263238);
cashier.group.position.set(0, 0, 22.2); cashier.group.rotation.y = Math.PI;
const queue1 = makeCharacter(0xba68c8); queue1.group.position.set(-2.6, 0, 18.4); queue1.group.rotation.y = Math.PI / 2;
const queue2 = makeCharacter(0xffb74d); queue2.group.position.set(-2.6, 0, 16.6); queue2.group.rotation.y = Math.PI / 2;
npcs.push({ ch: cashier, mode: 'idle' }, { ch: queue1, mode: 'idle' }, { ch: queue2, mode: 'idle' });

function makeWanderer(color, wps, start, dept) {
  const ch = makeCharacter(color);
  ch.group.position.set(start[0], 0, start[1]);
  return { ch, mode: 'walk', wps, wi: 0, speed: 1.3 + Math.random() * 0.5,
           dwell: 0, dept, basket: 0 };
}
npcs.push(makeWanderer(0x4fc3f7, [[-10, -9], [10, -9], [10, 3], [-10, 3]], [-10, -9], 'Dairy'));
npcs.push(makeWanderer(0xf06292, [[8, -15], [-8, -15], [-8, 9], [8, 9]], [8, -15], 'Beverages'));

// ------------------------------------------------------------
// PUSH CART
// ------------------------------------------------------------
const cart = new THREE.Group();
{
  const basket = box(1.0, 0.55, 0.75, 0xb0bec5, 0, 0.62, 0, cart);
  basket.material.transparent = true; basket.material.opacity = 0.45;
  box(0.08, 0.62, 0.08, 0x78909c, -0.42, 0.31, -0.31, cart);
  box(0.08, 0.62, 0.08, 0x78909c, 0.42, 0.31, -0.31, cart);
  box(0.08, 0.62, 0.08, 0x78909c, -0.42, 0.31, 0.31, cart);
  box(0.08, 0.62, 0.08, 0x78909c, 0.42, 0.31, 0.31, cart);
  box(0.9, 0.08, 0.08, 0x455a64, 0, 0.95, -0.36, cart);   // handle
  for (const [wx, wz] of [[-0.38, -0.3], [0.38, -0.3], [-0.38, 0.3], [0.38, 0.3]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), lambert(0x263238));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.09, wz);
    wheel.castShadow = true;
    cart.add(wheel);
  }
  cart.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(cart);
}
const cartItems = [];   // visual piles in cart
let hasCart = false;

// ------------------------------------------------------------
// COINS
// ------------------------------------------------------------
for (let i = 0; i < 24; i++) {
  let x, z, tries = 0;
  do {
    x = (Math.random() - 0.5) * (STORE_W - 6);
    z = (Math.random() - 0.5) * (STORE_D - 6);
    tries++;
  } while (tries < 40 && colliders.some(c => x > c.minX - 0.8 && x < c.maxX + 0.8 && z > c.minZ - 0.8 && z < c.maxZ + 0.8));
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18), lambert(0xffd54f));
  coin.rotation.x = Math.PI / 2;
  coin.position.set(x, 0.8, z);
  coin.castShadow = true;
  scene.add(coin);
  coins.push({ mesh: coin, got: false });
}

// ------------------------------------------------------------
// BEACON
// ------------------------------------------------------------
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.45, 0.45, 11, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
);
scene.add(beacon);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.8, 1.05, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
);
ring.rotation.x = -Math.PI / 2;
scene.add(ring);

// ------------------------------------------------------------
// AUDIO (WebAudio, no assets)
// ------------------------------------------------------------
const AudioSys = {
  ctx: null,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } },
  blip(freq, dur = 0.12, type = 'sine', vol = 0.25, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },
  pickup() { this.blip(660, 0.1, 'triangle', 0.3, 330); },
  coin()   { this.blip(1180, 0.09, 'square', 0.12); setTimeout(() => this.blip(1560, 0.12, 'square', 0.12), 70); },
  cart()   { this.blip(300, 0.15, 'sine', 0.25, 120); },
  checkout() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.25), i * 110)); },
  nope()   { this.blip(180, 0.15, 'sawtooth', 0.15); },
};
document.getElementById('startBtn').addEventListener('click', () => AudioSys.init(), { once: true });

// ------------------------------------------------------------
// GAME STATE
// ------------------------------------------------------------
let started = false, won = false, timerOn = false;
let elapsed = 0, coinCount = 0;
let shoppingList = [];
let inspecting = null;      // product currently in close-up
let inspectReturn = null;   // camera state before inspection

const listEl = document.getElementById('listItems');
const objectiveEl = document.getElementById('objective');
const cartHudEl = document.getElementById('cartHud');

function buildShoppingList() {
  const pool = [];
  for (const d in DEPTS) for (const it of DEPTS[d].items) pool.push({ name: it[0], dept: d, price: it[3] });
  pool.sort(() => Math.random() - 0.5);
  const picks = pool.slice(0, 5);
  if (!picks.some(p => p.dept === 'Jewellery')) {
    const jp = pool.filter(p => p.dept === 'Jewellery');
    picks[Math.floor(Math.random() * picks.length)] = jp[Math.floor(Math.random() * jp.length)];
  }
  shoppingList = picks.map(p => {
    const candidates = products.filter(m => m.userData.name === p.name);
    const mesh = candidates[Math.floor(Math.random() * candidates.length)];
    return { ...p, mesh, done: false };
  });
  renderList();
}
buildShoppingList();

function renderList() {
  listEl.innerHTML = shoppingList.map(it =>
    `<li class="${it.done ? 'done' : 'pending'}"><span class="tick">${it.done ? '✔' : '○'}</span>${it.name} <small style="opacity:.6">(${it.dept})</small><span class="pr">₹${it.price}</span></li>`
  ).join('');
  const next = shoppingList.find(i => !i.done);
  objectiveEl.textContent = next ? `➜ Next: ${next.name} — ${next.dept}` : '➜ Head to CHECKOUT!';
}

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ------------------------------------------------------------
// INPUT
// ------------------------------------------------------------
const keys = {};
let listVisible = true, minimapVisible = true;

addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyC' && !inspecting) cycleCamera();
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyF') { if (inspecting) exitInspect(true); else enterInspect(); }
  if (e.code === 'KeyM') { minimapVisible = !minimapVisible; document.getElementById('minimapWrap').style.display = minimapVisible ? 'block' : 'none'; }
  if (e.code === 'Tab') { listVisible = !listVisible; document.getElementById('listPanel').style.display = listVisible ? 'block' : 'none'; }
  if (!timerOn && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code.startsWith('Arrow'))) timerOn = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });

// ------------------------------------------------------------
// CAMERAS: 0 iso, 1 third-person, 2 top-down, 3 free orbit, 4 first-person
// ------------------------------------------------------------
const persp = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 300);
const perspFree = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
const persp1st = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
let camera = ortho;

const CAM_NAMES = ['Isometric', 'Third-Person', 'Top-Down', 'Free Orbit', 'First-Person'];
let camMode = 0;
let orbitYaw = 0, orbitPitch = 0.42, orbitDist = 9;
let orthoZoom = 24;
const ISO_YAW = Math.PI / 4, ISO_ELEV = 0.6155;

const cameraLabelEl = document.getElementById('cameraLabel');
const camBtns = document.querySelectorAll('#camButtons button');
function setCamera(mode) {
  camMode = mode;
  camera = mode === 0 || mode === 2 ? ortho : mode === 1 ? persp : mode === 3 ? perspFree : persp1st;
  cameraLabelEl.textContent = CAM_NAMES[mode];
  camBtns.forEach(b => b.classList.toggle('active', +b.dataset.cam === mode));
  if (mode === 1) { orbitYaw = 0; orbitPitch = 0.42; }
  // first-person: hide player body
  player.group.visible = mode !== 4;
}
function cycleCamera() { setCamera((camMode + 1) % 5); }
camBtns.forEach(b => b.addEventListener('click', () => setCamera(+b.dataset.cam)));

let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', e => {
  if (!dragging || !started) return;
  if (camMode === 1 || camMode === 3) {
    orbitYaw -= (e.clientX - lastX) * 0.005;
    orbitPitch = Math.min(1.45, Math.max(0.08, orbitPitch + (e.clientY - lastY) * 0.004));
  } else if (camMode === 0) {
    orthoZoom = Math.min(60, Math.max(10, orthoZoom + (e.clientY - lastY) * 0.05));
  }
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('wheel', e => {
  if (!started) return;
  if (camMode === 0 || camMode === 2) orthoZoom = Math.min(60, Math.max(8, orthoZoom + e.deltaY * 0.02));
  else orbitDist = Math.min(45, Math.max(4, orbitDist + e.deltaY * 0.012));
}, { passive: true });

const _eyeTarget = new THREE.Vector3();
function updateCamera() {
  if (inspecting || inspectAnim.phase !== 'none') return;  // inspect cam overrides
  const p = player.group.position;
  const headY = p.y + 1.75;

  if (camMode === 0) {
    _eyeTarget.set(p.x, p.y + 1.2, p.z);
    const d = 60;
    ortho.position.set(
      _eyeTarget.x + Math.sin(ISO_YAW) * Math.cos(ISO_ELEV) * d,
      _eyeTarget.y + Math.sin(ISO_ELEV) * d,
      _eyeTarget.z + Math.cos(ISO_YAW) * Math.cos(ISO_ELEV) * d
    );
    ortho.lookAt(_eyeTarget);
    const a = innerWidth / innerHeight;
    ortho.left = -orthoZoom * a; ortho.right = orthoZoom * a;
    ortho.top = orthoZoom; ortho.bottom = -orthoZoom;
    ortho.updateProjectionMatrix();
  } else if (camMode === 2) {
    _eyeTarget.set(p.x, p.y + 1.2, p.z);
    ortho.position.set(_eyeTarget.x, _eyeTarget.y + 80, _eyeTarget.z + 0.001);
    ortho.lookAt(_eyeTarget);
    const a = innerWidth / innerHeight;
    ortho.left = -orthoZoom * a; ortho.right = orthoZoom * a;
    ortho.top = orthoZoom; ortho.bottom = -orthoZoom;
    ortho.updateProjectionMatrix();
  } else if (camMode === 4) {
    // first person: camera at head, looks where player faces
    persp1st.position.set(p.x, headY, p.z);
    const look = new THREE.Vector3(p.x + Math.sin(player.group.rotation.y), headY, p.z + Math.cos(player.group.rotation.y));
    persp1st.lookAt(look);
    persp1st.updateProjectionMatrix();
  } else {
    _eyeTarget.set(p.x, p.y + 1.2, p.z);
    const cam = camMode === 1 ? persp : perspFree;
    const cp = Math.cos(orbitPitch), sp = Math.sin(orbitPitch);
    cam.position.set(
      _eyeTarget.x + Math.sin(orbitYaw) * cp * orbitDist,
      _eyeTarget.y + sp * orbitDist,
      _eyeTarget.z + Math.cos(orbitYaw) * cp * orbitDist
    );
    cam.lookAt(_eyeTarget);
    cam.updateProjectionMatrix();
  }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  for (const cam of [persp, perspFree, persp1st]) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
});

// ------------------------------------------------------------
// PRODUCT INSPECTION — smooth camera glide, framed close-up
// ------------------------------------------------------------
const inspectCard = document.getElementById('inspectCard');
const inspectCam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 20);
const inspectAnim = { phase: 'none', t: 0 };   // none | in | hold | out
const INSPECT_DUR = 0.55;
const _insFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _insTo   = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _insSavedLocal = new THREE.Vector3();

function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function frameProduct(target) {
  const wp = new THREE.Vector3(); target.getWorldPosition(wp);
  const sph = new THREE.Sphere();
  new THREE.Box3().setFromObject(target).getBoundingSphere(sph);
  const r = Math.max(sph.radius, 0.18);
  // distance so the whole product fits comfortably in frame
  const dist = Math.max((r / Math.tan(THREE.MathUtils.degToRad(inspectCam.fov / 2))) * 1.25, r + 0.35);
  const eye = player.group.position.clone(); eye.y += 1.6;
  const dir = eye.sub(wp); dir.y = Math.max(dir.y, 0.25); dir.normalize();
  const pos = wp.clone().add(dir.multiplyScalar(dist));
  pos.y = Math.max(pos.y, wp.y + r * 0.3);
  return { pos, look: wp };
}

function enterInspect() {
  if (inspectAnim.phase !== 'none' || inspecting) return;
  const target = nearestProductAny(2.7);
  if (!target) { toast('Get closer to a product to inspect it.'); AudioSys.nope(); return; }
  inspecting = target;
  const u = target.userData;
  document.getElementById('insDept').textContent = u.dept + (u.dept === 'Jewellery' ? ' boutique' : ' aisle');
  document.getElementById('insName').textContent = u.name;
  document.getElementById('insPrice').textContent = '₹' + Math.round(u.price).toLocaleString('en-IN');
  document.getElementById('insMrp').textContent = 'MRP ₹' + Math.round(u.mrp).toLocaleString('en-IN') + (u.mrp > u.price ? ' — you save ₹' + Math.round(u.mrp - u.price).toLocaleString('en-IN') : '');
  document.getElementById('insDesc').textContent = PRODUCT_DESC[u.name] || 'A store staple.';
  inspectCard.style.display = 'block';
  AudioSys.blip(880, 0.08, 'sine', 0.15);

  // start pose = wherever the active camera is right now
  const src = camera === persp1st ? persp1st : camera;
  _insFrom.pos.copy(src.position);
  src.getWorldDirection(_insFrom.look);
  _insFrom.look.multiplyScalar(5).add(src.position);
  const fr = frameProduct(target);
  _insTo.pos.copy(fr.pos); _insTo.look.copy(fr.look);
  _insSavedLocal.copy(target.position);
  inspectCam.position.copy(_insFrom.pos);
  inspectCam.lookAt(_insFrom.look);
  inspectAnim.phase = 'in'; inspectAnim.t = 0;
}

function exitInspect(putInCart = false) {
  if (!inspecting || inspectAnim.phase === 'out') return;
  if (putInCart) addToCart(inspecting);
  inspectCard.style.display = 'none';
  // glide back: start = current inspect view, end = the frozen main camera
  const src = camera === persp1st ? persp1st : camera;
  _insTo.pos.copy(src.position);
  src.getWorldDirection(_insTo.look);
  _insTo.look.multiplyScalar(5).add(src.position);
  _insFrom.pos.copy(inspectCam.position);
  inspecting.getWorldPosition(_insFrom.look);
  inspecting.position.y = _insSavedLocal.y;   // stop the bob
  inspectAnim.phase = 'out'; inspectAnim.t = 0;
}

function nearestProductAny(radius) {
  const p = player.group.position;
  let best = null, bestD = radius;
  for (const m of products) {
    if (!m.visible) continue;
    const wp = new THREE.Vector3(); m.getWorldPosition(wp);
    const d = Math.hypot(wp.x - p.x, wp.z - p.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function updateInspect(dt) {
  if (inspectAnim.phase === 'none') return;
  if (inspectAnim.phase === 'in' || inspectAnim.phase === 'out') {
    inspectAnim.t = Math.min(1, inspectAnim.t + dt / INSPECT_DUR);
    const e = easeInOut(inspectAnim.t);
    inspectCam.position.lerpVectors(_insFrom.pos, _insTo.pos, e);
    _eyeTarget.lerpVectors(_insFrom.look, _insTo.look, e);
    inspectCam.lookAt(_eyeTarget);
    if (inspectAnim.t >= 1) {
      if (inspectAnim.phase === 'in') inspectAnim.phase = 'hold';
      else { inspectAnim.phase = 'none'; inspecting = null; }
    }
    return;
  }
  // hold: gentle product spin + bob, camera stays framed
  if (inspecting) {
    inspecting.rotation.y += dt * 0.9;
    inspecting.position.y = _insSavedLocal.y + Math.sin(now * 2.2) * 0.05;
    const wp = new THREE.Vector3(); inspecting.getWorldPosition(wp);
    inspectCam.lookAt(wp);
  }
}

// ------------------------------------------------------------
// CART
// ------------------------------------------------------------
function addToCart(mesh) {
  if (hasCart) {
    // visual mini-copy inside cart basket
    const mini = mesh.clone();
    mini.scale.setScalar(0.55);
    mini.position.set((cartItems.length % 3) * 0.28 - 0.28, 0.95 + Math.floor(cartItems.length / 3) * 0.22, (Math.random() - 0.5) * 0.3);
    mini.rotation.y = Math.random() * Math.PI;
    cart.add(mini);
    cartItems.push(mini);
    cartHudEl.textContent = `🛒 Cart: ${cartItems.length} item${cartItems.length > 1 ? 's' : ''}`;
  }
  // mark list item done if it matches
  const it = shoppingList.find(i => !i.done && i.name === mesh.userData.name);
  if (it) {
    it.done = true;
    coinCount += 10;
    renderList();
    if (allDone()) toast('All items in the cart! Head to CHECKOUT 🧾');
    else toast(`${mesh.userData.name} in cart! +10`);
  } else {
    toast(`${mesh.userData.name} (₹${mesh.userData.price}) added — not on your list though!`);
  }
  AudioSys.cart();
}

// cart follows player
function updateCart(dt) {
  if (!hasCart) return;
  const p = player.group.position;
  const behind = new THREE.Vector3(p.x - Math.sin(player.group.rotation.y) * 1.1, 0, p.z - Math.cos(player.group.rotation.y) * 1.1);
  cart.position.lerp(behind, Math.min(1, dt * 8));
  let diff = player.group.rotation.y - cart.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cart.rotation.y += diff * Math.min(1, dt * 8);
  cart.rotation.z = Math.sin(now * 6) * (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD ? 0.02 : 0);
}

// grab cart near entrance
function tryGrabCart() {
  const p = player.group.position;
  const CART_HOME = new THREE.Vector3(3.2, 0, 23.5);
  if (!hasCart && Math.hypot(p.x - CART_HOME.x, p.z - CART_HOME.z) < 2.2) {
    hasCart = true;
    cart.visible = true;
    toast('Cart grabbed! Items you buy will ride in it.');
    AudioSys.cart();
    return true;
  }
  return false;
}
cart.position.set(3.2, 0, 23.5);

// ------------------------------------------------------------
// INTERACTION
// ------------------------------------------------------------
const promptEl = document.getElementById('prompt');

function nearestListedProduct() {
  const p = player.group.position;
  let best = null, bestD = 2.7;
  for (const it of shoppingList) {
    if (it.done) continue;
    const wp = new THREE.Vector3(); it.mesh.getWorldPosition(wp);
    const d = Math.hypot(wp.x - p.x, wp.z - p.z);
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}

function tryInteract() {
  if (won) return;
  if (tryGrabCart()) return;
  if (allDone()) {
    const p = player.group.position;
    if (Math.hypot(p.x - CHECKOUT.x, p.z - CHECKOUT.z) < 4.5) winGame();
    else toast('Get to the checkout counter near the entrance!');
    return;
  }
  const it = nearestListedProduct();
  if (!it) { toast('Nothing to grab here — follow the beacon!'); AudioSys.nope(); return; }
  if (it.dept === 'Jewellery' && !it.hagDone) {
    it.hag = (it.hag || 0) + 1;
    if (it.hag <= 3) {
      it.price = Math.round(it.price * (1 - (0.08 + Math.random() * 0.07)) / 100) * 100;
      renderList();
      AudioSys.coin();
      toast(`Jeweller: "For you, ₹${it.price.toLocaleString('en-IN')}!" — ${4 - it.hag} haggle${4 - it.hag === 1 ? '' : 's'} left`);
      return;
    }
    it.hagDone = true;
    toast(`Deal! ${it.name} for ₹${it.price.toLocaleString('en-IN')} 🤝`);
  }
  it.done = true;
  coinCount += 10;
  const wp = new THREE.Vector3(); it.mesh.getWorldPosition(wp);
  tweens.push({ mesh: it.mesh, age: 0, dur: 0.6, fromY: wp.y });
  if (hasCart) {
    const mini = it.mesh.clone();
    mini.scale.setScalar(0.55);
    mini.position.set((cartItems.length % 3) * 0.28 - 0.28, 0.95 + Math.floor(cartItems.length / 3) * 0.22, (Math.random() - 0.5) * 0.3);
    cart.add(mini);
    cartItems.push(mini);
    cartHudEl.textContent = `🛒 Cart: ${cartItems.length} item${cartItems.length > 1 ? 's' : ''}`;
  }
  renderList();
  AudioSys.pickup();
  if (allDone()) toast('All items found! Head to CHECKOUT 🧾');
  else toast(`Got ${it.name}! +10`);
}

function allDone() { return shoppingList.every(i => i.done); }

function winGame() {
  won = true; timerOn = false;
  AudioSys.checkout();
  // receipt with prices
  const rows = shoppingList.map(it =>
    `<div class="row"><span>${it.name} <small>(${it.dept})</small></span><span>₹${it.price}</span></div>`).join('');
  const total = shoppingList.reduce((s, i) => s + i.price, 0);
  const savings = shoppingList.reduce((s, i) => s + Math.max(0, (products.find(p => p.userData.name === i.name)?.userData.mrp || i.price) - i.price), 0);
  const m = Math.floor(elapsed / 60), s = String(Math.floor(elapsed % 60)).padStart(2, '0');
  document.getElementById('receipt').innerHTML =
    `<h2>✨ SHOPSIM MARKET ✨</h2>${rows}
     <div class="row total"><span>TOTAL</span><span>₹${total}</span></div>
     <div class="row"><span>YOU SAVED</span><span>₹${savings}</span></div>
     <div class="row total"><span>TIME</span><span>${m}:${s}</span></div>
     <div class="row total"><span>COINS EARNED</span><span>🪙 ${coinCount}</span></div>
     <div class="row total"><span>THANK YOU</span><span>Come again!</span></div>`;
  document.getElementById('winOverlay').style.display = 'flex';
}

// ------------------------------------------------------------
// MINIMAP
// ------------------------------------------------------------
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
const mmBase = document.createElement('canvas');
mmBase.width = mmCanvas.width; mmBase.height = mmCanvas.height;

const MM_W = 102, MM_D = 54;   // world extents shown on minimap (store + boutique)
const MM_X0 = -STORE_W / 2, MM_Z0 = -STORE_D / 2;
function mmXY(x, z) {
  return [(x - MM_X0) / MM_W * mmBase.width, (z - MM_Z0) / MM_D * mmBase.height];
}
{
  const g = mmBase.getContext('2d');
  g.fillStyle = '#1b2030'; g.fillRect(0, 0, mmBase.width, mmBase.height);
  for (const z of zones) {
    const dep = DEPTS[z.d];
    const [x, y] = mmXY(z.x - z.w / 2, z.z - z.dpt / 2);
    g.fillStyle = dep.css + '33';
    g.fillRect(x, y, z.w / STORE_W * mmBase.width, z.dpt / STORE_D * mmBase.height);
  }
  g.fillStyle = '#8b95a8';
  for (const c of colliders) {
    if (!c.shelf) continue;
    const [x, y] = mmXY(c.minX, c.minZ);
    g.fillRect(x, y, (c.maxX - c.minX) / STORE_W * mmBase.width, (c.maxZ - c.minZ) / STORE_D * mmBase.height);
  }
  const [cx, cy] = mmXY(CHECKOUT.x, CHECKOUT.z);
  g.fillStyle = '#4caf50'; g.fillRect(cx - 8, cy - 3, 16, 6);
  // boutique floor tint already comes from the zones loop
  g.strokeStyle = '#5a6478'; g.lineWidth = 2;
  const [wx, wy] = mmXY(-STORE_W / 2, -STORE_D / 2);
  g.strokeRect(wx, wy, STORE_W / MM_W * mmBase.width, STORE_D / MM_D * mmBase.height);
  // boutique outline
  g.strokeStyle = '#c9a227';
  const [jx, jy] = mmXY(40, -10);
  g.strokeRect(jx, jy, 24 / MM_W * mmBase.width, 24 / MM_D * mmBase.height);
}

function drawMinimap() {
  const g = mmCtx;
  g.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
  g.drawImage(mmBase, 0, 0);
  const p = player.group.position;
  const tgt = currentTargetPos();
  if (tgt) {
    const [tx, ty] = mmXY(tgt.x, tgt.z);
    g.fillStyle = '#ffd54f';
    g.beginPath(); g.arc(tx, ty, 4 + Math.sin(now * 5) * 1.2, 0, Math.PI * 2); g.fill();
    const [px, py] = mmXY(p.x, p.z);
    g.strokeStyle = 'rgba(255,213,79,.5)'; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(px, py); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]);
  }
  const [px, py] = mmXY(p.x, p.z);
  g.save(); g.translate(px, py); g.rotate(-player.group.rotation.y + Math.PI);
  g.fillStyle = '#7CFC98';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
  g.restore();
}

function currentTargetPos() {
  if (allDone()) return CHECKOUT;
  const next = shoppingList.find(i => !i.done);
  if (!next) return null;
  const wp = new THREE.Vector3(); next.mesh.getWorldPosition(wp);
  return wp;
}

// ------------------------------------------------------------
// MOVEMENT
// ------------------------------------------------------------
function blocked(x, z) {
  for (const c of colliders) {
    if (x > c.minX - PLAYER_R && x < c.maxX + PLAYER_R && z > c.minZ - PLAYER_R && z < c.maxZ + PLAYER_R) return true;
  }
  return false;
}

const fwdV = new THREE.Vector3(), rightV = new THREE.Vector3(), moveV = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

function updatePlayer(dt) {
  camera.getWorldDirection(fwdV); fwdV.y = 0;
  if (fwdV.lengthSq() < 1e-6) fwdV.set(0, 0, -1);
  fwdV.normalize();
  rightV.crossVectors(fwdV, UP).normalize();

  moveV.set(0, 0, 0);
  if (keys.KeyW || keys.ArrowUp) moveV.add(fwdV);
  if (keys.KeyS || keys.ArrowDown) moveV.sub(fwdV);
  if (keys.KeyD || keys.ArrowRight) moveV.add(rightV);
  if (keys.KeyA || keys.ArrowLeft) moveV.sub(rightV);

  const moving = moveV.lengthSq() > 0;
  if (moving) {
    moveV.normalize();
    const speed = WALK * (keys.ShiftLeft || keys.ShiftRight ? SPRINT : 1);
    const p = player.group.position;
    const nx = p.x + moveV.x * speed * dt;
    const nz = p.z + moveV.z * speed * dt;
    if (!blocked(nx, p.z)) p.x = nx;
    if (!blocked(p.x, nz)) p.z = nz;
    p.x = Math.min(62.5, Math.max(-STORE_W / 2 + 1, p.x));
    p.z = Math.min(STORE_D / 2 - 1, Math.max(-STORE_D / 2 + 1, p.z));
    const targetRot = Math.atan2(moveV.x, moveV.z);
    let diff = targetRot - player.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.group.rotation.y += diff * Math.min(1, dt * 12);
  }
  animateCharacter(player, dt, moving, WALK);
}

// ------------------------------------------------------------
// NPCs — browse, dwell, reach for shelves
// ------------------------------------------------------------
function updateNPCs(dt, t) {
  for (const n of npcs) {
    if (n.mode === 'idle') {
      n.ch.parts.body.rotation.z = Math.sin(t * 1.5 + n.ch.phase) * 0.02;
      animateCharacter(n.ch, dt, false, 0);
      continue;
    }
    if (n.mode === 'dwell') {
      n.dwell -= dt;
      // reach animation toward shelf
      n.ch.parts.rArm.rotation.x = -1.2 + Math.sin(t * 6) * 0.15;
      animateCharacter(n.ch, dt, false, 0);
      if (n.dwell <= 0) {
        n.ch.parts.rArm.rotation.x = 0;
        n.basket++;
        n.mode = 'walk';
      }
      continue;
    }
    const wp = n.wps[n.wi];
    const g = n.ch.group;
    const dx = wp[0] - g.position.x, dz = wp[1] - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      // arrived: browse 70% of the time
      if (Math.random() < 0.7) {
        n.mode = 'dwell';
        n.dwell = 1.5 + Math.random() * 2.5;
      } else {
        n.wi = (n.wi + 1) % n.wps.length;
      }
    } else {
      const ux = dx / dist, uz = dz / dist;
      g.position.x += ux * n.speed * dt;
      g.position.z += uz * n.speed * dt;
      const tr = Math.atan2(ux, uz);
      let diff = tr - g.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.rotation.y += diff * Math.min(1, dt * 8);
      animateCharacter(n.ch, dt, true, n.speed);
    }
  }
}

// ------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------
const coinsHudEl = document.getElementById('coinsHud');
const timeHudEl = document.getElementById('timeHud');
const clock = new THREE.Clock();
let now = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  now += dt;
  if (timerOn && !won) {
    elapsed += dt;
    const m = Math.floor(elapsed / 60), s = String(Math.floor(elapsed % 60)).padStart(2, '0');
    timeHudEl.textContent = `⏱ ${m}:${s}`;
  }

  if (started && !won) {
    if (!inspecting) updatePlayer(dt);
    updateCart(dt);
    updateNPCs(dt, now);

    const p = player.group.position;
    for (const c of coins) {
      if (c.got) continue;
      c.mesh.rotation.z += dt * 4;
      c.mesh.position.y = 0.8 + Math.sin(now * 3 + c.mesh.position.x) * 0.12;
      if (Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z) < 1.1) {
        c.got = true; coinCount += 1;
        tweens.push({ mesh: c.mesh, age: 0, dur: 0.4, fromY: c.mesh.position.y });
        coinsHudEl.textContent = `🪙 ${coinCount}`;
        AudioSys.coin();
      }
    }

    const tgt = currentTargetPos();
    if (tgt) {
      beacon.visible = ring.visible = true;
      beacon.position.set(tgt.x, 5.5, tgt.z);
      const pulse = 1 + Math.sin(now * 4) * 0.18;
      beacon.scale.set(pulse, 1, pulse);
      ring.position.set(tgt.x, 0.06, tgt.z);
      ring.scale.setScalar(pulse);
    } else beacon.visible = ring.visible = false;

    // context prompt
    let prompt = null;
    const nearP = nearestProductAny(2.7);
    const listed = nearestListedProduct();
    const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');
    if (listed && !allDone() && listed.dept === 'Jewellery') prompt = `E: haggle 💬 (${4 - (listed.hag || 0)} left) · F: inspect ${listed.name} — ${fmt(listed.price)}`;
    else if (nearP && !allDone()) prompt = `E: pick up · F: inspect ${nearP.userData.name} (${fmt(nearP.userData.price)})`;
    else if (nearP && allDone()) prompt = `F: inspect ${nearP.userData.name} (${fmt(nearP.userData.price)})`;
    if (!hasCart && Math.hypot(p.x - 3.2, p.z - 23.5) < 2.2) prompt = 'Press E to grab the shopping cart 🛒';
    if (allDone() && Math.hypot(p.x - CHECKOUT.x, p.z - CHECKOUT.z) < 4.5) prompt = 'Press E to check out 🧾';
    promptEl.style.display = prompt ? 'block' : 'none';
    if (prompt) promptEl.textContent = prompt;

    // compass
    if (tgt && !inspecting) {
      camera.getWorldDirection(fwdV); fwdV.y = 0; fwdV.normalize();
      rightV.crossVectors(fwdV, UP).normalize();
      const vx = tgt.x - p.x, vz = tgt.z - p.z;
      const a = Math.atan2(vx * rightV.x + vz * rightV.z, vx * fwdV.x + vz * fwdV.z) * 180 / Math.PI;
      document.getElementById('compass').style.transform = `translateX(-50%) rotate(${a}deg)`;
    }
  }

  // tweens
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.age += dt;
    const k = tw.age / tw.dur;
    tw.mesh.position.y = tw.fromY + k * 2.4;
    tw.mesh.scale.setScalar(Math.max(0.001, 1 - k));
    if (k >= 1) { tw.mesh.visible = false; tweens.splice(i, 1); }
  }

  updateCamera();
  updateInspect(dt);
  // boutique life: rotating necklace + drifting sparkle dust
  if (necklace && !inspecting) necklace.rotation.y += dt * 0.6;
  if (sparkleMat) sparkleMat.opacity = 0.55 + Math.sin(now * 2) * 0.25;
  if (minimapVisible && started) drawMinimap();
  renderer.render(scene, (inspecting || inspectAnim.phase !== 'none') ? inspectCam : camera);
}
tick();

// ------------------------------------------------------------
// START
// ------------------------------------------------------------
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startOverlay').style.display = 'none';
  started = true;
  cart.visible = true;
  toast('Grab the cart, then follow the yellow beacon!');
});
