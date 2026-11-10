// =========================================================
// ui.js — Ortak arayüz yardımcıları: ikonlar, avatar, zaman, toast, alt sayfa, medya
// =========================================================
import { db } from './api.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const P = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const I = {
  home: P('<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: P('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>'),
  reels: P('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8 3l3 5M14 3l3 5"/><path d="m10 11.5 4.5 2.5-4.5 2.5z" fill="currentColor"/>'),
  heart: P('<path d="M12 20.5s-7.5-4.6-9.2-9.2C1.6 8 3.6 4.5 7 4.5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.4 0 5.4 3.5 4.2 6.8-1.7 4.6-9.2 9.2-9.2 9.2z"/>'),
  heartFill: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 20.5s-7.5-4.6-9.2-9.2C1.6 8 3.6 4.5 7 4.5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.4 0 5.4 3.5 4.2 6.8-1.7 4.6-9.2 9.2-9.2 9.2z"/></svg>',
  comment: P('<path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.2-4.2A8.5 8.5 0 1 1 20.5 12z"/>'),
  repost: P('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  send: P('<path d="M22 3 11 13"/><path d="M22 3 15 21l-4-8-8-4z"/>'),
  dots: P('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  back: P('<path d="M15 5l-7 7 7 7"/>'),
  close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  grid: P('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
  image: P('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  gif: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5" width="19" height="14" rx="3"/><text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="800" fill="currentColor" stroke="none" font-family="Inter, sans-serif">GIF</text></svg>',
  shield: P('<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>'),
  mute: P('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>', 'stroke="#fff"'),
  sound: P('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>', 'stroke="#fff"'),
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  camera: P('<path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>'),
  bell: P('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  flag: P('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>'),
  trash: P('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  bookmark: P('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  chart: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  users: P('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a6.5 6.5 0 0 1 3 6"/>'),
  check: P('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  ban: P('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
  pen: P('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  megaphone: P('<path d="M3 10v4a1 1 0 0 0 1 1h3l7 5V4L7 9H4a1 1 0 0 0-1 1z"/><path d="M18 9a4 4 0 0 1 0 6"/>'),
  circle: P('<circle cx="12" cy="12" r="9" stroke-dasharray="4 2.5"/>'),
  eye: P('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  folder: P('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>'),
  device: P('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  link: P('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  reply: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>'),
  lock: P('<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    dotOn: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#2ecc71"/></svg>',
  dotOff: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="none" stroke="#777" stroke-width="2"/></svg>',
};
/** Satır içi küçük ikon. */
export const ic = (name, size = 16) => `<span class="ic" style="width:${size}px;height:${size}px">${I[name]}</span>`;
/** Kanka'nın kendi mavi tik rozeti: 9 yuvarlak dilimli çiçek rozet, mavi geçiş, beyaz onay. */
const TICK_PATH = (() => {
  const n = 9, R = 10.2, r = 8.4, cx = 12, cy = 12;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const am = (a0 + a1) / 2;
    const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
    const pc = [cx + Math.cos(am) * (R + 2.6), cy + Math.sin(am) * (R + 2.6)];
    const p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    d += (i ? '' : `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)}`) + `Q${pc[0].toFixed(2)} ${pc[1].toFixed(2)} ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  }
  return d + 'Z';
})();
export const TICK = `<span class="tick" title="Onaylı hesap"><svg viewBox="0 0 24 24"><defs><linearGradient id="kTk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4fb4ff"/><stop offset="1" stop-color="#0a6cf0"/></linearGradient></defs><path fill="url(#kTk)" d="${TICK_PATH}"/><path d="M7.6 12.3l3 3 5.9-6.2" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

const AV_COLORS = ['#e1306c', '#833ab4', '#405de6', '#fd1d1d', '#f77737', '#0f9d58', '#5851db', '#c13584'];
/** Avatar (fotoğraf yoksa baş harf). ring: hikâye halkası ('', 'new', 'seen'). */
export function avatar(p, size = 32, ring = '') {
  if (!p) return `<span class="av" style="width:${size}px;height:${size}px"></span>`;
  const h = [...(p.id || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const inner = p.avatar
    ? `<span class="av" style="width:${size}px;height:${size}px"><img data-m="${esc(p.avatar)}" alt=""></span>`
    : `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${AV_COLORS[h % AV_COLORS.length]}">${esc((p.name || p.username || '?').trim()[0]?.toUpperCase() || '?')}</span>`;
  return ring ? `<span class="ring ${ring === 'seen' ? 'seen' : ''}">${inner}</span>` : inner;
}
export const uname = (p, extra = '') => `<span class="uname">${esc(p?.username || 'silinmiş')}${p?.verified ? TICK : ''}${extra}</span>`;

export function ago(iso, long = false) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return long ? 'az önce' : 'şimdi';
  if (s < 3600) return Math.floor(s / 60) + (long ? ' dakika önce' : 'dk');
  if (s < 86400) return Math.floor(s / 3600) + (long ? ' saat önce' : 'sa');
  if (s < 86400 * 7) return Math.floor(s / 86400) + (long ? ' gün önce' : 'g');
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
export const num = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' Mn' : n >= 1e4 ? (n / 1e3).toFixed(1).replace('.0', '') + ' B' : String(n));

export function toast(text, bad = false) {
  const el = document.createElement('div');
  el.textContent = text;
  if (bad) el.className = 'bad';
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/** Alt sayfa: html ya da seçenek listesi. Geri dönen fonksiyon sayfayı kapatır. */
export function sheet(content, onMount) {
  const s = $('#sheet');
  const card = $('.sheet-card', s);
  if (Array.isArray(content)) {
    card.innerHTML = content.map((o, i) => `<button class="opt ${o.red ? 'red' : ''}" data-i="${i}">${o.icon || ''}<span>${esc(o.label)}</span></button>`).join('') + '<button class="opt" data-i="-1"><span class="muted">Vazgeç</span></button>';
    card.onclick = (e) => {
      const b = e.target.closest('.opt');
      if (!b) return;
      close();
      const o = content[+b.dataset.i];
      o?.run?.();
    };
  } else {
    card.innerHTML = content;
    card.onclick = null;
  }
  s.classList.remove('hidden');
  const close = () => {
    s.classList.add('hidden');
    card.innerHTML = '';
    history.state?.sheet && history.back();
  };
  $('.sheet-bg', s).onclick = close;
  hydrate(card);
  onMount?.(card, close);
  return close;
}
export const closeSheet = () => $('#sheet').classList.add('hidden');

export function confirmSheet(text, yes, label = 'Evet', red = true) {
  sheet(`<h3>${esc(text)}</h3><div class="inner form"><button class="btn block ${red ? 'red' : ''}" id="cfYes">${esc(label)}</button><button class="btn block gray" id="cfNo">Vazgeç</button></div>`, (c, close) => {
    $('#cfYes', c).onclick = () => {
      close();
      yes();
    };
    $('#cfNo', c).onclick = close;
  });
}
export function promptSheet(title, placeholder, done, multiline = false, value = '') {
  sheet(`<h3>${esc(title)}</h3><div class="inner form">${multiline ? `<textarea class="field" id="pmIn" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="field" id="pmIn" placeholder="${esc(placeholder)}" value="${esc(value)}">`}<button class="btn block" id="pmOk">Tamam</button></div>`, (c, close) => {
    const inp = $('#pmIn', c);
    setTimeout(() => inp.focus(), 50);
    $('#pmOk', c).onclick = () => {
      const v = inp.value.trim();
      close();
      done(v);
    };
  });
}

/** Dosya seç (foto/video/gif). */
export function pickFile(accept = 'image/*,video/*') {
  return new Promise((res) => {
    const inp = $('#filePick');
    inp.value = '';
    inp.accept = accept;
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
}

/** data-m="..." olan resim/videolara gerçek adresi ver (yerel modda cihaz içi dosyalar). */
export async function hydrate(root) {
  for (const el of $$('[data-m]', root)) {
    const u = el.dataset.m;
    el.removeAttribute('data-m');
    db.resolve(u).then((src) => {
      el.src = src;
    });
  }
}

export function mediaTag(url, kind, cls = '', attrs = '') {
  if (kind === 'video') return `<video data-m="${esc(url)}" class="${cls}" playsinline muted loop preload="metadata" ${attrs}></video>`;
  return `<img data-m="${esc(url)}" class="${cls}" alt="" loading="lazy" ${attrs}>`;
}

/** Ekrandaki videoları otomatik oynat / durdur. */
let io = null;
export function autoplay(root) {
  io?.disconnect();
  io = new IntersectionObserver(
    (ents) => {
      for (const e of ents) {
        const v = e.target;
        if (e.isIntersecting && e.intersectionRatio > 0.6) v.play().catch(() => {});
        else v.pause();
      }
    },
    { threshold: [0, 0.6, 1] }
  );
  $$('video[data-auto]', root).forEach((v) => io.observe(v));
}

export function linkify(text) {
  return esc(text)
    .replace(/(^|\s)@([a-z0-9_.]{2,30})/gi, '$1<a href="#/u/$2" style="color:#e0f1ff">@$2</a>')
    .replace(/(^|\s)#([\p{L}0-9_]{2,40})/giu, '$1<span style="color:#e0f1ff">#$2</span>');
}
