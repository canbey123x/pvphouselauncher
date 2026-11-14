// =========================================================
// editor.js — Paylaşım düzenleyici: filtre, ışık/renk ayarları, kırpma oranı ve döndürme,
// yazı (yazı tipi, renk, arka plan, hizalama), çıkartmalar, çizim (fırça, fosforlu, neon, silgi).
// Fotoğrafta her şey tek bir görsele işlenir; videoda katmanlar ayrıca saklanıp oynatırken üstüne çizilir.
// Hiçbir yerde emoji yok: bütün ikon ve çıkartmalar SVG.
// =========================================================
import { $, $$, esc } from './ui.js';

const P = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const EI = {
  close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  text: '<svg viewBox="0 0 24 24"><text x="12" y="17.5" text-anchor="middle" font-size="15" font-weight="800" fill="currentColor" font-family="Inter, sans-serif">Aa</text></svg>',
  sticker: P('<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/><circle cx="9.5" cy="11" r="1" fill="currentColor"/><circle cx="14" cy="11" r="1" fill="currentColor"/><path d="M9 15c1.5 1.4 3.5 1.4 5 0"/>'),
  draw: P('<path d="M4 20c2 0 3-1 3-3 0-1.5 1.2-2.7 2.7-2.7"/><path d="M9.7 14.3 19 5l0 0a2 2 0 0 0-2.8-2.8L7 11.5"/>'),
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  rotate: P('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  trash: P('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  alignL: P('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  alignC: P('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  alignR: P('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  bgBox: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="4" fill="currentColor"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="800" fill="#000" font-family="Inter, sans-serif">A</text></svg>',
  sound: P('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'),
  mute: P('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>'),
};

/* ---------- Filtreler ve ayarlar ---------- */
export const FILTERS = [
  ['normal', 'Normal', ''],
  ['canli', 'Canlı', 'saturate(1.35) contrast(1.08)'],
  ['sicak', 'Sıcak', 'sepia(.22) saturate(1.25) hue-rotate(-8deg)'],
  ['soguk', 'Soğuk', 'saturate(1.05) hue-rotate(12deg) brightness(1.04)'],
  ['sb', 'S/B', 'grayscale(1) contrast(1.12)'],
  ['vintage', 'Vintage', 'sepia(.45) contrast(.92) brightness(1.05) saturate(.85)'],
  ['soluk', 'Soluk', 'contrast(.86) brightness(1.1) saturate(.72)'],
  ['dramatik', 'Dramatik', 'contrast(1.38) saturate(1.15) brightness(.92)'],
  ['altin', 'Altın', 'sepia(.3) saturate(1.5) hue-rotate(-18deg) contrast(1.05)'],
  ['gece', 'Gece', 'brightness(.88) contrast(1.18) saturate(.7) hue-rotate(190deg) sepia(.12)'],
];
const ADJ = [
  ['b', 'Parlaklık'],
  ['c', 'Kontrast'],
  ['s', 'Doygunluk'],
  ['w', 'Sıcaklık'],
  ['v', 'Vinyet'],
];
export function filterCss(filter, adj = {}) {
  const f = (FILTERS.find((x) => x[0] === filter) || FILTERS[0])[2];
  const parts = [f];
  if (adj.b) parts.push(`brightness(${(1 + adj.b / 200).toFixed(3)})`);
  if (adj.c) parts.push(`contrast(${(1 + adj.c / 200).toFixed(3)})`);
  if (adj.s) parts.push(`saturate(${(1 + adj.s / 100).toFixed(3)})`);
  if (adj.w > 0) parts.push(`sepia(${(adj.w / 220).toFixed(3)})`);
  if (adj.w < 0) parts.push(`hue-rotate(${(adj.w / 6).toFixed(1)}deg) saturate(${(1 - adj.w / 400).toFixed(3)})`);
  return parts.filter(Boolean).join(' ') || 'none';
}

/* ---------- Yazı tipleri ve renkler ---------- */
const FONTS = [
  ['klasik', 'Klasik', "600 {s}px 'Inter', sans-serif", "'Inter', sans-serif", 600],
  ['kalin', 'Kalın', "400 {s}px 'Anton', 'Impact', sans-serif", "'Anton', 'Impact', sans-serif", 400],
  ['el', 'El yazısı', "400 {s}px 'Pacifico', cursive", "'Pacifico', cursive", 400],
  ['daktilo', 'Daktilo', "700 {s}px 'Courier Prime', 'Courier New', monospace", "'Courier Prime', 'Courier New', monospace", 700],
  ['zarif', 'Zarif', "italic 700 {s}px 'Playfair Display', Georgia, serif", "'Playfair Display', Georgia, serif", 700],
];
const COLORS = ['#ffffff', '#000000', '#ff3040', '#ff8a00', '#ffd400', '#2ecc71', '#00c2ff', '#3a6cf4', '#8e44ff', '#ff5fa2', '#8b5a2b', '#9e9e9e'];
const fontOf = (k) => FONTS.find((f) => f[0] === k) || FONTS[0];
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 140;
};

/* ---------- Çıkartmalar (SVG) ---------- */
const STICKERS = {
  heart: { label: 'Kalp', svg: '<svg viewBox="0 0 100 100"><defs><linearGradient id="sgH" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b8b"/><stop offset="1" stop-color="#e0103a"/></linearGradient></defs><path d="M50 88S10 62 10 34c0-13 10-22 22-22 8 0 14 4 18 11 4-7 10-11 18-11 12 0 22 9 22 22 0 28-40 54-40 54z" fill="url(#sgH)" stroke="#fff" stroke-width="5"/></svg>' },
  star: { label: 'Yıldız', svg: '<svg viewBox="0 0 100 100"><path d="M50 6l13 28 30 4-22 21 6 30-27-15-27 15 6-30L7 38l30-4z" fill="#ffd400" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>' },
  bolt: { label: 'Şimşek', svg: '<svg viewBox="0 0 100 100"><path d="M58 4 18 56h26l-6 40 44-56H55z" fill="#ffd400" stroke="#1a1a1a" stroke-width="5" stroke-linejoin="round"/></svg>' },
  arrow: { label: 'Ok', svg: '<svg viewBox="0 0 100 100"><path d="M10 60c20-30 50-38 70-30" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/><path d="M66 14l18 18-24 8" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  smile: { label: 'Gülen yüz', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="#ffd400" stroke="#1a1a1a" stroke-width="5"/><circle cx="35" cy="40" r="6" fill="#1a1a1a"/><circle cx="65" cy="40" r="6" fill="#1a1a1a"/><path d="M30 60c10 14 30 14 40 0" fill="none" stroke="#1a1a1a" stroke-width="6" stroke-linecap="round"/></svg>' },
  fire: { label: 'Alev', svg: '<svg viewBox="0 0 100 100"><path d="M50 6c6 18 28 26 28 52a28 28 0 0 1-56 0c0-14 8-22 12-30 2 10 8 14 12 14-4-14 0-26 4-36z" fill="#ff6a00" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M50 52c4 8 14 12 14 22a14 14 0 0 1-28 0c0-8 8-12 14-22z" fill="#ffd400"/></svg>' },
  sparkle: { label: 'Parıltı', svg: '<svg viewBox="0 0 100 100"><path d="M50 6c4 26 18 40 44 44-26 4-40 18-44 44-4-26-18-40-44-44 26-4 40-18 44-44z" fill="#fff" stroke="#8e44ff" stroke-width="4"/></svg>' },
  crown: { label: 'Taç', svg: '<svg viewBox="0 0 100 100"><path d="M10 74 16 28l20 20 14-30 14 30 20-20 6 46z" fill="#ffc400" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><rect x="10" y="74" width="80" height="12" rx="3" fill="#ffc400" stroke="#fff" stroke-width="5"/></svg>' },
};
// Yazılı çıkartmalar (konum, saat, @etiket, #etiket)
const TAG_ICONS = {
  konum: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" fill="#ee2a7b"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>',
  saat: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#6228d7"/><path d="M12 7v5.5l3.5 2" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
  mention: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0095f6"/><text x="12" y="16.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Arial, sans-serif">@</text></svg>',
  hashtag: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff8a00"/><text x="12" y="16.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Arial, sans-serif">#</text></svg>',
};

/* =========================================================
   Katman çizimi (DOM): hem düzenleyicide hem gönderide aynı fonksiyon.
   Konum ve boyutlar kutunun genişliğine oranla (cqw) saklanır.
   ========================================================= */
export function layersHtml(layers = []) {
  return layers
    .map((L) => {
      const tr = `left:${(L.x * 100).toFixed(2)}%;top:${(L.y * 100).toFixed(2)}%;transform:translate(-50%,-50%) rotate(${(L.rot || 0).toFixed(1)}deg) scale(${(L.scale || 1).toFixed(3)})`;
      if (L.type === 'text') {
        const f = fontOf(L.font);
        const bg = L.bg === 1 ? L.color : L.bg === 2 ? 'rgba(0,0,0,.55)' : 'transparent';
        const col = L.bg === 1 ? (isDark(L.color) ? '#fff' : '#000') : L.color;
        return `<div class="ly ly-text" style="${tr}"><span style="font:${f[2].replace('{s}px', `calc(${L.size} * 100cqw)`)};color:${col};background:${bg};text-align:${L.align || 'center'};${L.bg ? '' : 'text-shadow:0 1px 4px rgba(0,0,0,.35);'}">${esc(L.text)}</span></div>`;
      }
      if (L.type === 'tag') {
        return `<div class="ly ly-tag" style="${tr};font-size:calc(${L.size || 0.045} * 100cqw)"><span>${TAG_ICONS[L.kind] || ''}<b>${esc(L.text)}</b></span></div>`;
      }
      if (L.type === 'sticker') {
        return `<div class="ly ly-st" style="${tr};width:calc(${L.size || 0.28} * 100cqw)">${STICKERS[L.kind]?.svg || ''}</div>`;
      }
      if (L.type === 'poll') {
        return `<div class="ly ly-poll" style="${tr}"><div class="poll-q">${esc(L.q)}</div><div class="poll-opts"><span>${esc(L.a)}</span><span>${esc(L.b)}</span></div></div>`;
      }
      if (L.type === 'question') {
        return `<div class="ly ly-poll ly-q" style="${tr}"><div class="poll-q">${esc(L.q)}</div><div class="q-input">Cevabını yaz...</div></div>`;
      }
      return '';
    })
    .join('');
}
/** Gönderi/hikâye üstündeki katman kutusu (video için). */
export function overlayHtml(meta) {
  const layers = (meta?.layers || []).filter((L) => L.type !== 'poll' && L.type !== 'question');
  if (!meta || (!layers.length && !meta.drawing)) return '';
  return `<div class="ovl">${meta.drawing ? `<img class="ovl-draw" data-m="${esc(meta.drawing)}" alt="">` : ''}${layersHtml(layers)}</div>`;
}

/* ---------- Katmanı tuvale çiz (fotoğrafı işlerken) ---------- */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const svgImg = (svg, w, h) =>
  new Promise((res) => {
    const img = new Image();
    const s = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `);
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });

async function drawLayer(g, L, W, H) {
  if (L.type === 'poll' || L.type === 'question') return; // etkileşimli: hikâyede ayrı çizilir
  g.save();
  g.translate(L.x * W, L.y * H);
  g.rotate(((L.rot || 0) * Math.PI) / 180);
  g.scale(L.scale || 1, L.scale || 1);
  if (L.type === 'text') {
    const f = fontOf(L.font);
    const px = L.size * W;
    g.font = f[2].replace('{s}', px.toFixed(1));
    const lines = String(L.text).split('\n');
    const lh = px * 1.22;
    const widths = lines.map((l) => g.measureText(l).width);
    const tw = Math.max(...widths);
    const padX = px * 0.32;
    const padY = px * 0.18;
    const th = lh * lines.length;
    if (L.bg) {
      g.fillStyle = L.bg === 1 ? L.color : 'rgba(0,0,0,.55)';
      roundRect(g, -tw / 2 - padX, -th / 2 - padY, tw + padX * 2, th + padY * 2, px * 0.3);
      g.fill();
    } else {
      g.shadowColor = 'rgba(0,0,0,.35)';
      g.shadowBlur = px * 0.15;
      g.shadowOffsetY = px * 0.03;
    }
    g.fillStyle = L.bg === 1 ? (isDark(L.color) ? '#fff' : '#000') : L.color;
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const w = widths[i];
      const x = L.align === 'left' ? -tw / 2 : L.align === 'right' ? tw / 2 - w : -w / 2;
      g.fillText(l, x, -th / 2 + lh * (i + 0.5));
    });
  } else if (L.type === 'tag') {
    const px = (L.size || 0.045) * W;
    g.font = `800 ${px.toFixed(1)}px 'Inter', sans-serif`;
    const tw = g.measureText(L.text).width;
    const ic = px * 1.25;
    const pad = px * 0.55;
    const w = ic + px * 0.35 + tw + pad * 2;
    const h = px * 2;
    g.shadowColor = 'rgba(0,0,0,.25)';
    g.shadowBlur = px * 0.4;
    g.fillStyle = '#fff';
    roundRect(g, -w / 2, -h / 2, w, h, px * 0.45);
    g.fill();
    g.shadowBlur = 0;
    const icon = await svgImg(TAG_ICONS[L.kind], 64, 64);
    if (icon) g.drawImage(icon, -w / 2 + pad, -ic / 2, ic, ic);
    const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, '#6228d7');
    grad.addColorStop(1, '#ee2a7b');
    g.fillStyle = L.kind === 'mention' ? '#0095f6' : L.kind === 'hashtag' ? '#ff8a00' : grad;
    g.textBaseline = 'middle';
    g.fillText(L.text, -w / 2 + pad + ic + px * 0.35, px * 0.05);
  } else if (L.type === 'sticker') {
    const s = (L.size || 0.28) * W;
    const img = await svgImg(STICKERS[L.kind].svg, 256, 256);
    if (img) g.drawImage(img, -s / 2, -s / 2, s, s);
  }
  g.restore();
}

/* =========================================================
   Düzenleyici
   ========================================================= */
/**
 * @param {File} file foto ya da video
 * @param {'post'|'story'|'reel'} mode
 * @param {object} [prev] önceki düzenleme durumu (yeniden düzenlemek için)
 * @returns {Promise<null|{blob:Blob, kind:'photo'|'video', meta:object, drawingBlob?:Blob, state:object, preview:string}>}
 */
export function openEditor(file, mode = 'post', prev = null) {
  return new Promise(async (resolve) => {
    const isVideo = file.type.startsWith('video/');
    const src = URL.createObjectURL(file);
    const st = prev
      ? JSON.parse(JSON.stringify(prev))
      : { filter: 'normal', adj: { b: 0, c: 0, s: 0, w: 0, v: 0 }, aspect: mode === 'post' ? '4:5' : '9:16', rot: 0, layers: [], strokes: [], muted: false };
    if (mode !== 'post') st.aspect = '9:16';
    let bmp = null;
    let vid = null;
    let natural = { w: 1080, h: 1350 };
    if (isVideo) {
      vid = document.createElement('video');
      vid.src = src;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.setAttribute('playsinline', '');
      await new Promise((r) => {
        vid.onloadedmetadata = r;
        vid.onerror = r;
        setTimeout(r, 4000);
      });
      natural = { w: vid.videoWidth || 1080, h: vid.videoHeight || 1920 };
    } else {
      bmp = await createImageBitmap(file).catch(() => null);
      if (!bmp) {
        resolve(null);
        return;
      }
      natural = { w: bmp.width, h: bmp.height };
    }
    try {
      await Promise.all(FONTS.map((f) => document.fonts.load(f[2].replace('{s}', '40'))));
    } catch {
      /* yedek yazı tipi */
    }

    const root = document.createElement('div');
    root.className = 'ed';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    let tool = 'none'; // none | draw
    let panel = 'filter';
    let brush = { color: '#ffffff', size: 0.012, kind: 'pen' };

    root.innerHTML = `
      <div class="ed-top"><button class="ed-ib" id="eX">${EI.close}</button><span class="sp"></span>
        ${isVideo ? `<button class="ed-ib" id="eMute">${st.muted ? EI.mute : EI.sound}</button>` : ''}
        <button class="ed-ib" id="eText" title="Yazı">${EI.text}</button><button class="ed-ib" id="eSt" title="Çıkartma">${EI.sticker}</button><button class="ed-ib" id="eDraw" title="Çiz">${EI.draw}</button></div>
      <div class="ed-mid"><div class="ed-stage" id="stage"><div class="ed-base" id="base"></div><canvas class="ed-draw" id="dcv"></canvas><div class="ed-layers" id="lys"></div></div>
        <div class="ed-trash hidden" id="trash">${EI.trash}</div></div>
      <div class="ed-bottom" id="bottom"></div>`;
    const stage = $('#stage', root);
    const base = $('#base', root);
    const dcv = $('#dcv', root);
    const lys = $('#lys', root);
    let W = 0;
    let H = 0;
    let baseCv = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ar = () => {
      if (st.aspect === 'orig') return st.rot % 180 ? natural.h / natural.w : natural.w / natural.h;
      const [a, b] = st.aspect.split(':').map(Number);
      return a / b;
    };

    function layout() {
      const mid = $('.ed-mid', root).getBoundingClientRect();
      const r = ar();
      W = Math.min(mid.width - 16, (mid.height - 16) * r);
      H = W / r;
      stage.style.width = W + 'px';
      stage.style.height = H + 'px';
      dcv.width = Math.round(W * dpr);
      dcv.height = Math.round(H * dpr);
      redrawStrokes();
      renderBase();
      renderLayers();
    }

    /* ---------- Taban görüntü ---------- */
    function drawCover(g, w, h, filter) {
      g.save();
      g.filter = filter;
      g.translate(w / 2, h / 2);
      g.rotate((st.rot * Math.PI) / 180);
      const rw = st.rot % 180 ? natural.h : natural.w;
      const rh = st.rot % 180 ? natural.w : natural.h;
      const s = Math.max(w / rw, h / rh);
      g.drawImage(bmp, (-natural.w * s) / 2, (-natural.h * s) / 2, natural.w * s, natural.h * s);
      g.restore();
      if (st.adj.v > 0) {
        const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, `rgba(0,0,0,${(st.adj.v / 100) * 0.75})`);
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    }
    function renderBase() {
      const css = filterCss(st.filter, st.adj);
      if (isVideo) {
        if (!base.firstChild) {
          base.appendChild(vid);
          vid.play().catch(() => {});
        }
        vid.style.filter = css;
        base.style.setProperty('--vig', ((st.adj.v || 0) / 100) * 0.75);
        return;
      }
      if (!baseCv) {
        baseCv = document.createElement('canvas');
        base.appendChild(baseCv);
      }
      baseCv.width = Math.round(W * dpr);
      baseCv.height = Math.round(H * dpr);
      drawCover(baseCv.getContext('2d'), baseCv.width, baseCv.height, css);
    }

    /* ---------- Katmanlar ---------- */
    let active = null;
    function renderLayers() {
      lys.innerHTML = layersHtml(st.layers);
      $$('.ly', lys).forEach((el, i) => (el.dataset.i = i));
    }

    // Sürükle, iki parmakla büyüt / döndür, çöpe at
    const ptrs = new Map();
    let g0 = null;
    lys.addEventListener('pointerdown', (e) => {
      if (tool === 'draw') return;
      const el = e.target.closest('.ly');
      if (!el && ptrs.size === 0) return;
      e.preventDefault();
      lys.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (el && ptrs.size === 1) {
        active = +el.dataset.i;
        const L = st.layers[active];
        g0 = { x: e.clientX, y: e.clientY, lx: L.x, ly: L.y, t: performance.now(), moved: false };
      }
      if (ptrs.size === 2 && active !== null) {
        const [a, b] = [...ptrs.values()];
        const L = st.layers[active];
        g0 = { ...g0, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), sc: L.scale || 1, rot: L.rot || 0, moved: true };
      }
    });
    lys.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId) || active === null) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const L = st.layers[active];
      const el = $(`.ly[data-i="${active}"]`, lys);
      if (ptrs.size === 1) {
        const dx = e.clientX - g0.x;
        const dy = e.clientY - g0.y;
        if (Math.hypot(dx, dy) > 6) g0.moved = true;
        L.x = g0.lx + dx / W;
        L.y = g0.ly + dy / H;
        const tr = $('#trash', root);
        tr.classList.remove('hidden');
        const tb = tr.getBoundingClientRect();
        tr.classList.toggle('hot', e.clientY > tb.top - 20 && Math.abs(e.clientX - (tb.left + tb.width / 2)) < 60);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        L.scale = Math.max(0.2, Math.min(6, g0.sc * (Math.hypot(a.x - b.x, a.y - b.y) / g0.d)));
        L.rot = g0.rot + ((Math.atan2(b.y - a.y, b.x - a.x) - g0.ang) * 180) / Math.PI;
      }
      el.style.left = L.x * 100 + '%';
      el.style.top = L.y * 100 + '%';
      el.style.transform = `translate(-50%,-50%) rotate(${L.rot || 0}deg) scale(${L.scale || 1})`;
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size > 0 || active === null) return;
      const tr = $('#trash', root);
      const L = st.layers[active];
      if (tr.classList.contains('hot')) {
        st.layers.splice(active, 1);
      } else if (!g0.moved && performance.now() - g0.t < 350 && L.type === 'text') {
        editText(active);
      }
      tr.classList.add('hidden');
      tr.classList.remove('hot');
      active = null;
      renderLayers();
    };
    lys.addEventListener('pointerup', up);
    lys.addEventListener('pointercancel', up);

    /* ---------- Yazı düzenleme ---------- */
    function editText(idx = -1) {
      const L =
        idx >= 0
          ? st.layers[idx]
          : { type: 'text', text: '', font: 'klasik', color: '#ffffff', bg: 0, align: 'center', size: 0.075, x: 0.5, y: 0.42, rot: 0, scale: 1 };
      const ov = document.createElement('div');
      ov.className = 'ed-txt';
      root.appendChild(ov);
      const draw = () => {
        const f = fontOf(L.font);
        const bg = L.bg === 1 ? L.color : L.bg === 2 ? 'rgba(0,0,0,.55)' : 'transparent';
        const col = L.bg === 1 ? (isDark(L.color) ? '#fff' : '#000') : L.color;
        const ta = $('textarea', ov);
        ta.style.font = f[2].replace('{s}', Math.round(L.size * W * 1.0));
        ta.style.color = col;
        ta.style.background = bg;
        ta.style.textAlign = L.align;
        $$('.ed-fonts button', ov).forEach((b) => b.classList.toggle('on', b.dataset.f === L.font));
        $$('.ed-colors button', ov).forEach((b) => b.classList.toggle('on', b.dataset.c === L.color));
        $('#tAlign', ov).innerHTML = L.align === 'left' ? EI.alignL : L.align === 'right' ? EI.alignR : EI.alignC;
        $('#tBg', ov).classList.toggle('on', !!L.bg);
        autosize();
      };
      const autosize = () => {
        const ta = $('textarea', ov);
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.45) + 'px';
      };
      ov.innerHTML = `<div class="ed-txt-top"><button class="ed-ib" id="tAlign"></button><button class="ed-ib" id="tBg">${EI.bgBox}</button><span class="sp"></span><button class="ed-done" id="tDone">Bitti</button></div>
        <div class="ed-txt-mid"><input type="range" class="ed-vsize" id="tSize" min="0.035" max="0.16" step="0.002" value="${L.size}"><textarea rows="1" placeholder="Yaz...">${esc(L.text)}</textarea></div>
        <div class="ed-fonts">${FONTS.map((f) => `<button data-f="${f[0]}" style="font-family:${f[3]};font-weight:${f[4]}">${f[1]}</button>`).join('')}</div>
        <div class="ed-colors">${COLORS.map((c) => `<button data-c="${c}" style="background:${c}"></button>`).join('')}</div>`;
      const ta = $('textarea', ov);
      ta.oninput = autosize;
      setTimeout(() => ta.focus(), 50);
      $('.ed-fonts', ov).onclick = (e) => {
        const b = e.target.closest('[data-f]');
        if (b) (L.font = b.dataset.f), draw();
      };
      $('.ed-colors', ov).onclick = (e) => {
        const b = e.target.closest('[data-c]');
        if (b) (L.color = b.dataset.c), draw();
      };
      $('#tAlign', ov).onclick = () => ((L.align = L.align === 'center' ? 'left' : L.align === 'left' ? 'right' : 'center'), draw());
      $('#tBg', ov).onclick = () => ((L.bg = ((L.bg || 0) + 1) % 3), draw());
      $('#tSize', ov).oninput = (e) => ((L.size = +e.target.value), draw());
      $('#tDone', ov).onclick = () => {
        L.text = ta.value.replace(/\s+$/, '');
        if (idx >= 0 && !L.text) st.layers.splice(idx, 1);
        else if (idx < 0 && L.text) st.layers.push(L);
        ov.remove();
        renderLayers();
      };
      draw();
    }

    /* ---------- Çıkartma seçici ---------- */
    function stickerPicker() {
      const ov = document.createElement('div');
      ov.className = 'ed-sheet';
      const now = new Date();
      const time = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      ov.innerHTML = `<div class="ed-sheet-card"><div class="ed-grab"></div>
        <div class="ed-tags"><button data-t="konum">${TAG_ICONS.konum}<b>KONUM</b></button><button data-t="saat">${TAG_ICONS.saat}<b>${time}</b></button><button data-t="mention">${TAG_ICONS.mention}<b>@ETİKET</b></button><button data-t="hashtag">${TAG_ICONS.hashtag}<b>#ETİKET</b></button></div>
        ${mode === 'story' ? `<div class="ed-tags"><button data-t="poll">${TAG_ICONS.hashtag.replace('#', '?')}<b>ANKET</b></button><button data-t="question">${TAG_ICONS.mention.replace('@', '?')}<b>SORU</b></button></div>` : ''}
        <div class="ed-stk">${Object.entries(STICKERS).map(([k, v]) => `<button data-s="${k}" title="${v.label}">${v.svg}</button>`).join('')}</div></div>`;
      root.appendChild(ov);
      const close = () => ov.remove();
      ov.onclick = (e) => {
        if (e.target === ov) return close();
        const s = e.target.closest('[data-s]');
        const t = e.target.closest('[data-t]');
        if (s) {
          st.layers.push({ type: 'sticker', kind: s.dataset.s, size: 0.28, x: 0.5, y: 0.45, rot: 0, scale: 1 });
          close();
          renderLayers();
        }
        if (t) {
          const kind = t.dataset.t;
          if (kind === 'poll' || kind === 'question') {
            close();
            st.layers = st.layers.filter((L) => L.type !== 'poll' && L.type !== 'question');
            askText(kind === 'poll' ? 'Anket sorusu (ör. Bu akşam ne yapalım?)' : 'Soru (ör. Bana bir şey sor)', (q) => {
              if (kind === 'question') {
                st.layers.push({ type: 'question', q: q.trim().slice(0, 60), x: 0.5, y: 0.62, rot: 0, scale: 1 });
                return renderLayers();
              }
              askText('1. seçenek (ör. Sinema)', (a) =>
                askText('2. seçenek (ör. Kahve)', (b) => {
                  st.layers.push({ type: 'poll', q: q.trim().slice(0, 60), a: a.trim().slice(0, 24), b: b.trim().slice(0, 24), x: 0.5, y: 0.62, rot: 0, scale: 1 });
                  renderLayers();
                })
              );
            });
            return;
          }
          if (kind === 'saat') {
            st.layers.push({ type: 'tag', kind, text: time, size: 0.05, x: 0.5, y: 0.3, rot: 0, scale: 1 });
            close();
            renderLayers();
            return;
          }
          const q = { konum: 'Konum (ör. Kadıköy, İstanbul)', mention: 'Kullanıcı adı', hashtag: 'Etiket' }[kind];
          close();
          askText(q, (v) => {
            let text = v.trim();
            if (kind === 'mention') text = '@' + text.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '');
            if (kind === 'hashtag') text = '#' + text.replace(/^#/, '').replace(/\s+/g, '');
            if (kind === 'konum') text = text.toLocaleUpperCase('tr-TR');
            if (text.length < 2) return;
            st.layers.push({ type: 'tag', kind, text, size: 0.05, x: 0.5, y: 0.3, rot: 0, scale: 1 });
            renderLayers();
          });
        }
      };
    }

    /** Düzenleyici içinde küçük yazı girişi (sistem penceresi yerine). */
    function askText(placeholder, done) {
      const ov = document.createElement('div');
      ov.className = 'ed-sheet';
      ov.innerHTML = `<div class="ed-sheet-card"><div class="ed-grab"></div><div class="ed-ask"><input type="text" placeholder="${esc(placeholder)}" maxlength="40"><button class="ed-done">Ekle</button></div></div>`;
      root.appendChild(ov);
      const inp = $('input', ov);
      setTimeout(() => inp.focus(), 50);
      const ok = () => {
        const v = inp.value;
        ov.remove();
        if (v.trim()) done(v);
      };
      $('button', ov).onclick = ok;
      inp.onkeydown = (e) => e.key === 'Enter' && ok();
      ov.onclick = (e) => e.target === ov && ov.remove();
    }

    /* ---------- Çizim ---------- */
    let cur = null;
    function strokeStyle(g, s) {
      g.globalCompositeOperation = s.kind === 'eraser' ? 'destination-out' : 'source-over';
      g.strokeStyle = s.color;
      g.globalAlpha = s.kind === 'marker' ? 0.45 : 1;
      g.lineWidth = s.size * g.canvas.width * (s.kind === 'marker' ? 2.2 : s.kind === 'eraser' ? 2.5 : 1);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowBlur = s.kind === 'neon' ? s.size * g.canvas.width * 2.5 : 0;
      g.shadowColor = s.color;
    }
    function paint(g, s) {
      if (!s.pts.length) return;
      g.save();
      strokeStyle(g, s);
      if (s.kind === 'neon') {
        g.beginPath();
        s.pts.forEach(([x, y], i) => (i ? g.lineTo(x * g.canvas.width, y * g.canvas.height) : g.moveTo(x * g.canvas.width, y * g.canvas.height)));
        g.stroke();
        g.strokeStyle = '#fff';
        g.lineWidth *= 0.4;
        g.shadowBlur = 0;
      }
      g.beginPath();
      s.pts.forEach(([x, y], i) => (i ? g.lineTo(x * g.canvas.width, y * g.canvas.height) : g.moveTo(x * g.canvas.width, y * g.canvas.height)));
      if (s.pts.length === 1) g.lineTo(s.pts[0][0] * g.canvas.width + 0.1, s.pts[0][1] * g.canvas.height);
      g.stroke();
      g.restore();
    }
    function redrawStrokes(target = dcv) {
      const g = target.getContext('2d');
      g.clearRect(0, 0, target.width, target.height);
      st.strokes.forEach((s) => paint(g, s));
    }
    dcv.addEventListener('pointerdown', (e) => {
      if (tool !== 'draw') return;
      e.preventDefault();
      dcv.setPointerCapture(e.pointerId);
      const r = dcv.getBoundingClientRect();
      cur = { ...brush, pts: [[(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]] };
      st.strokes.push(cur);
      redrawStrokes();
    });
    dcv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const r = dcv.getBoundingClientRect();
      cur.pts.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
      redrawStrokes();
    });
    const endStroke = () => (cur = null);
    dcv.addEventListener('pointerup', endStroke);
    dcv.addEventListener('pointercancel', endStroke);

    /* ---------- Alt panel ---------- */
    function renderBottom() {
      const b = $('#bottom', root);
      dcv.style.pointerEvents = tool === 'draw' ? 'auto' : 'none';
      lys.style.pointerEvents = tool === 'draw' ? 'none' : 'auto';
      $('#eDraw', root).classList.toggle('on', tool === 'draw');
      if (tool === 'draw') {
        b.innerHTML = `<div class="ed-brushes">${[
          ['pen', 'Kalem'],
          ['marker', 'Fosforlu'],
          ['neon', 'Neon'],
          ['eraser', 'Silgi'],
        ]
          .map(([k, t]) => `<button data-k="${k}" class="${brush.kind === k ? 'on' : ''}">${t}</button>`)
          .join('')}<button id="dUndo" class="ed-ib">${EI.undo}</button></div>
          <input type="range" class="ed-range" id="dSize" min="0.004" max="0.04" step="0.001" value="${brush.size}">
          <div class="ed-colors">${COLORS.map((c) => `<button data-c="${c}" class="${brush.color === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>
          <div class="ed-row"><span class="sp"></span><button class="ed-done" id="dDone">Bitti</button></div>`;
        b.onclick = (e) => {
          const k = e.target.closest('[data-k]');
          const c = e.target.closest('[data-c]');
          if (k) brush.kind = k.dataset.k;
          if (c) brush.color = c.dataset.c;
          if (e.target.closest('#dUndo')) (st.strokes.pop(), redrawStrokes());
          if (e.target.closest('#dDone')) tool = 'none';
          if (k || c || e.target.closest('#dDone')) renderBottom();
        };
        $('#dSize', b).oninput = (e) => (brush.size = +e.target.value);
        return;
      }
      const tabs = `<div class="ed-tabs"><button data-p="filter" class="${panel === 'filter' ? 'on' : ''}">Filtre</button><button data-p="adjust" class="${panel === 'adjust' ? 'on' : ''}">Ayarla</button>${mode === 'post' ? `<button data-p="crop" class="${panel === 'crop' ? 'on' : ''}">Kırp</button>` : ''}</div>`;
      let body = '';
      if (panel === 'filter') {
        body = `<div class="ed-filters">${FILTERS.map(([k, t]) => `<button data-f="${k}" class="${st.filter === k ? 'on' : ''}"><canvas width="120" height="120" data-th="${k}"></canvas><span>${t}</span></button>`).join('')}</div>`;
      } else if (panel === 'adjust') {
        body = `<div class="ed-adj">${ADJ.map(([k, t]) => `<label><span>${t}</span><input type="range" min="${k === 'v' ? 0 : -100}" max="100" step="1" value="${st.adj[k] || 0}" data-a="${k}"><em>${st.adj[k] || 0}</em></label>`).join('')}</div>`;
      } else {
        body = `<div class="ed-crop">${[
          ['orig', 'Orijinal'],
          ['1:1', 'Kare'],
          ['4:5', 'Dikey'],
          ['16:9', 'Yatay'],
        ]
          .map(([k, t]) => `<button data-r="${k}" class="${st.aspect === k ? 'on' : ''}">${t}</button>`)
          .join('')}<button class="ed-ib" id="cRot">${EI.rotate}</button></div>`;
      }
      b.innerHTML = tabs + body + `<div class="ed-row"><span class="sp"></span><button class="ed-done" id="eNext">İleri</button></div>`;
      b.onclick = (e) => {
        const p = e.target.closest('[data-p]');
        const f = e.target.closest('[data-f]');
        const r = e.target.closest('[data-r]');
        if (p) (panel = p.dataset.p), renderBottom();
        if (f) {
          st.filter = f.dataset.f;
          $$('.ed-filters button', b).forEach((x) => x.classList.toggle('on', x === f));
          renderBase();
        }
        if (r) {
          st.aspect = r.dataset.r;
          layout();
          renderBottom();
        }
        if (e.target.closest('#cRot')) {
          st.rot = (st.rot + 90) % 360;
          layout();
        }
        if (e.target.closest('#eNext')) finish();
      };
      $$('[data-a]', b).forEach(
        (inp) =>
          (inp.oninput = () => {
            st.adj[inp.dataset.a] = +inp.value;
            inp.nextElementSibling.textContent = inp.value;
            renderBase();
          })
      );
      // filtre önizlemeleri
      $$('canvas[data-th]', b).forEach((c) => {
        const g = c.getContext('2d');
        const css = filterCss(c.dataset.th, {});
        if (bmp) {
          g.filter = css;
          const s = Math.max(120 / natural.w, 120 / natural.h);
          g.drawImage(bmp, (120 - natural.w * s) / 2, (120 - natural.h * s) / 2, natural.w * s, natural.h * s);
        } else if (vid) {
          const drawV = () => {
            g.filter = css;
            const s = Math.max(120 / natural.w, 120 / natural.h);
            try {
              g.drawImage(vid, (120 - natural.w * s) / 2, (120 - natural.h * s) / 2, natural.w * s, natural.h * s);
            } catch {
              /* henüz kare yok */
            }
          };
          if (vid.readyState >= 2) drawV();
          else vid.addEventListener('loadeddata', drawV, { once: true });
        }
      });
    }

    /* ---------- Üst butonlar ---------- */
    $('#eText', root).onclick = () => {
      tool = 'none';
      renderBottom();
      editText(-1);
    };
    $('#eSt', root).onclick = () => {
      tool = 'none';
      renderBottom();
      stickerPicker();
    };
    $('#eDraw', root).onclick = () => {
      tool = tool === 'draw' ? 'none' : 'draw';
      renderBottom();
    };
    if ($('#eMute', root))
      $('#eMute', root).onclick = (e) => {
        st.muted = !st.muted;
        e.currentTarget.innerHTML = st.muted ? EI.mute : EI.sound;
        vid.muted = st.muted;
      };
    $('#eX', root).onclick = () => cleanup(null);

    function cleanup(result) {
      try {
        vid?.pause();
      } catch {
        /* yok */
      }
      window.removeEventListener('resize', layout);
      root.remove();
      document.body.style.overflow = '';
      window.__editorBack = null;
      resolve(result);
    }
    // Android geri tuşu: açık alt pencereyi kapat, yoksa düzenleyiciden çık
    window.__editorBack = () => {
      const ov = $('.ed-txt, .ed-sheet', root);
      if (ov) {
        if (ov.classList.contains('ed-txt')) $('#tDone', ov).click();
        else ov.remove();
      } else cleanup(null);
      return true;
    };

    /* ---------- Bitir: fotoğrafı işle / video için katmanları sakla ---------- */
    async function finish() {
      const btn = $('#eNext', root);
      btn.disabled = true;
      btn.textContent = 'Hazırlanıyor...';
      const state = JSON.parse(JSON.stringify(st));
      const inter = st.layers.find((L) => L.type === 'poll' || L.type === 'question');
      const interactive = inter ? { ...inter } : null;
      if (!isVideo) {
        const OW = 1080;
        const OH = Math.round(OW / ar());
        const c = document.createElement('canvas');
        c.width = OW;
        c.height = OH;
        const g = c.getContext('2d');
        drawCover(g, OW, OH, filterCss(st.filter, st.adj));
        if (st.strokes.length) {
          const d = document.createElement('canvas');
          d.width = OW;
          d.height = OH;
          redrawStrokes(d);
          g.drawImage(d, 0, 0);
        }
        for (const L of st.layers) await drawLayer(g, L, OW, OH);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
        cleanup({ blob, kind: 'photo', meta: { aspect: st.aspect, ...(interactive ? { interactive } : {}) }, state, preview: URL.createObjectURL(blob) });
        return;
      }
      let drawingBlob = null;
      if (st.strokes.length) {
        const d = document.createElement('canvas');
        d.width = 720;
        d.height = Math.round(720 / ar());
        redrawStrokes(d);
        drawingBlob = await new Promise((r) => d.toBlob(r, 'image/png'));
      }
      const meta = { aspect: st.aspect, filter: filterCss(st.filter, st.adj), vig: st.adj.v || 0, layers: st.layers.filter((L) => L !== inter), muted: st.muted, ...(interactive ? { interactive } : {}) };
      cleanup({ blob: file, kind: 'video', meta, drawingBlob, state, preview: src });
    }

    window.addEventListener('resize', layout);
    requestAnimationFrame(() => {
      layout();
      renderBottom();
    });
  });
}
