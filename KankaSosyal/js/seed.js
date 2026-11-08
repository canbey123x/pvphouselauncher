// =========================================================
// seed.js — Demo modu için örnek içerik. Görseller ve kısa videolar burada
// kodla çizilir (harici dosya yok). Deneme hesaplarının şifresi: 123456
// =========================================================

function canvasImage(draw, w = 1080, h = 1350) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

const scenes = {
  sunset: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ff7e5f');
    gr.addColorStop(0.55, '#feb47b');
    gr.addColorStop(0.56, '#1d3557');
    gr.addColorStop(1, '#0b1a30');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe29a';
    g.beginPath();
    g.arc(w / 2, h * 0.55, 170, Math.PI, 0);
    g.fill();
    g.fillStyle = 'rgba(255,226,154,.35)';
    for (let i = 0; i < 9; i++) g.fillRect(w / 2 - 160 + i * 10, h * 0.58 + i * 34, 320 - i * 20, 8);
    g.fillStyle = '#0b1a30';
    g.beginPath();
    g.moveTo(0, h * 0.56);
    for (let x = 0; x <= w; x += 60) g.lineTo(x, h * 0.56 - 40 - Math.sin(x / 90) * 30);
    g.lineTo(w, h * 0.56);
    g.fill();
  },
  city: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0f0c29');
    gr.addColorStop(1, '#302b63');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`;
      g.fillRect(Math.random() * w, Math.random() * h * 0.5, 2, 2);
    }
    let x = 0;
    while (x < w) {
      const bw = 80 + Math.random() * 120;
      const bh = 300 + Math.random() * 600;
      g.fillStyle = '#14122b';
      g.fillRect(x, h - bh, bw - 6, bh);
      for (let yy = h - bh + 20; yy < h - 20; yy += 34) for (let xx = x + 12; xx < x + bw - 24; xx += 26) if (Math.random() < 0.45) {
        g.fillStyle = Math.random() < 0.5 ? '#ffd166' : '#f4a261';
        g.fillRect(xx, yy, 12, 18);
      }
      x += bw;
    }
  },
  sea: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#89f7fe');
    gr.addColorStop(0.45, '#66a6ff');
    gr.addColorStop(1, '#0a3d62');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 6;
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      const y = h * 0.5 + k * 55;
      for (let xx = 0; xx <= w; xx += 20) g.lineTo(xx, y + Math.sin(xx / 60 + k) * 12);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(w * 0.62, h * 0.47);
    g.lineTo(w * 0.62, h * 0.25);
    g.lineTo(w * 0.75, h * 0.45);
    g.fill();
    g.fillStyle = '#7a2e12';
    g.fillRect(w * 0.55, h * 0.47, w * 0.22, 26);
  },
  coffee: (g, w, h) => {
    g.fillStyle = '#3b2314';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 40},${55 + Math.random() * 20},30,.5)`;
      g.fillRect(0, i * 34, w, 30);
    }
    g.fillStyle = '#f5f5f5';
    g.beginPath();
    g.ellipse(w / 2, h / 2 + 140, 300, 90, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(w / 2 - 170, h / 2 - 160, 340, 300);
    g.beginPath();
    g.ellipse(w / 2, h / 2 + 140, 170, 50, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = '#6f4e37';
    g.beginPath();
    g.ellipse(w / 2, h / 2 - 160, 170, 50, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 26;
    g.beginPath();
    g.arc(w / 2 + 200, h / 2 - 10, 70, -1.2, 1.2);
    g.stroke();
  },
  mountain: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#c9d6ff');
    gr.addColorStop(1, '#e2e2e2');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const range = (col, base, amp, seed) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 30) g.lineTo(x, base - Math.abs(Math.sin(x / (160 + seed) + seed)) * amp);
      g.lineTo(w, h);
      g.fill();
    };
    range('#8e9eab', h * 0.6, 380, 1);
    range('#5c6f7e', h * 0.75, 300, 3);
    range('#2c3e50', h * 0.9, 220, 5);
  },
  abstract: (g, w, h) => {
    g.fillStyle = '#111';
    g.fillRect(0, 0, w, h);
    const cols = ['#ee2a7b', '#6228d7', '#f9ce34', '#00c2ff', '#2ecc71'];
    for (let i = 0; i < 26; i++) {
      g.fillStyle = cols[i % cols.length] + 'cc';
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 40 + Math.random() * 180, 0, Math.PI * 2);
      g.fill();
    }
  },
};

const avatarScene = (bg, fg) => (g, w, h) => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.beginPath();
  g.arc(w / 2, h * 0.4, w * 0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w / 2, h * 0.95, w * 0.36, h * 0.3, 0, 0, Math.PI * 2);
  g.fill();
};

/** Kısa dikey demo videosu (canvas + MediaRecorder). Desteklenmezse null. */
async function demoVideo(kind, seconds = 4) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const c = document.createElement('canvas');
  c.width = 540;
  c.height = 960;
  const g = c.getContext('2d');
  const stream = c.captureStream(30);
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1500000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(250);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (kind === 'waves') {
        const gr = g.createLinearGradient(0, 0, 0, 960);
        gr.addColorStop(0, `hsl(${200 + t * 20},80%,60%)`);
        gr.addColorStop(1, '#06243f');
        g.fillStyle = gr;
        g.fillRect(0, 0, 540, 960);
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = 5;
        for (let k = 0; k < 12; k++) {
          g.beginPath();
          for (let x = 0; x <= 540; x += 12) g.lineTo(x, 420 + k * 45 + Math.sin(x / 50 + t * 3 + k) * 16);
          g.stroke();
        }
      } else {
        g.fillStyle = '#0d0d0d';
        g.fillRect(0, 0, 540, 960);
        for (let i = 0; i < 14; i++) {
          const a = t * 1.4 + i * 0.45;
          g.fillStyle = `hsla(${(i * 26 + t * 90) % 360},85%,60%,.85)`;
          g.beginPath();
          g.arc(270 + Math.cos(a) * (60 + i * 12), 480 + Math.sin(a * 1.3) * (90 + i * 16), 18 + i * 2, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (t < seconds) requestAnimationFrame(step);
      else resolve();
    };
    step();
  });
  rec.stop();
  await done;
  return new Blob(chunks, { type: type.split(';')[0] });
}

export async function seedDemo(db, makeUser) {
  const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const up = async (draw, w, h) => db.upload(await canvasImage(draw, w, h), 'photo');
  const users = {};
  const defs = [
    ['ayse', 'Ayşe Yılmaz', 'ayse@kanka.app', 'Kahve, deniz, gün batımı. İstanbul', '#ee2a7b', '#ffd1e3'],
    ['mehmet', 'Mehmet Kaya', 'mehmet@kanka.app', 'Gece fotoğrafçılığı | şehir ışıkları', '#405de6', '#cfd8ff'],
    ['zeynep', 'Zeynep Demir', 'zeynep@kanka.app', 'Dağ, doğa, yürüyüş', '#0f9d58', '#c9f2dc'],
    ['kanka', 'Kanka Resmi', 'resmi@kanka.app', 'Kanka uygulamasının resmi hesabı. Hoş geldin!', '#6228d7', '#e5d9ff'],
  ];
  for (const [u, name, email, bio, bg, fg] of defs) {
    const id = await makeUser(email, '123456', u, name, { bio, verified: u === 'kanka' || u === 'ayse', created_at: ago(240) });
    users[u] = id;
    const av = await up(avatarScene(bg, fg), 300, 300);
    await db.update('profiles', id, { avatar: av });
  }
  const post = async (u, scene, caption, h) => {
    const media = await up(scenes[scene]);
    return db.insert('posts', { user_id: users[u], kind: 'photo', media, caption, created_at: ago(h) });
  };
  const p1 = await post('ayse', 'sunset', 'Bu akşamın renkleri bambaşkaydı #günbatımı', 3);
  const p2 = await post('mehmet', 'city', 'Şehir uyumaz, ben de uyumam @ayse', 6);
  const p3 = await post('zeynep', 'mountain', 'Zirveye 3 saat, manzaraya bir ömür #doğa', 20);
  const p4 = await post('ayse', 'coffee', 'Günün ilk kahvesi', 30);
  const p5 = await post('kanka', 'abstract', "Kanka'ya hoş geldin! Hikâye paylaş, reels çek, arkadaşlarına mesaj at.", 50);
  const p6 = await post('mehmet', 'sea', 'Hafta sonu kaçamağı', 70);
  for (const [u, p] of [['mehmet', p1], ['zeynep', p1], ['kanka', p1], ['ayse', p2], ['zeynep', p3], ['ayse', p3], ['mehmet', p5], ['ayse', p5], ['zeynep', p5], ['zeynep', p6]]) await db.insert('likes', { post_id: p.id, user_id: users[u] });
  await db.insert('reposts', { post_id: p3.id, user_id: users.ayse, created_at: ago(10) });
  await db.insert('comments', { post_id: p1.id, user_id: users.mehmet, text: 'Efsane olmuş!', media: '', media_kind: '', created_at: ago(2) });
  await db.insert('comments', { post_id: p1.id, user_id: users.zeynep, text: '@ayse nerede burası?', media: '', media_kind: '', created_at: ago(1.5) });
  await db.insert('comments', { post_id: p3.id, user_id: users.ayse, text: 'Bir dahakine ben de geliyorum', media: '', media_kind: '', created_at: ago(15) });
  const pairs = [['ayse', 'mehmet'], ['mehmet', 'ayse'], ['zeynep', 'ayse'], ['ayse', 'zeynep'], ['mehmet', 'zeynep'], ['ayse', 'kanka'], ['mehmet', 'kanka'], ['zeynep', 'kanka']];
  for (const [a, b] of pairs) await db.insert('follows', { follower_id: users[a], following_id: users[b] });
  await db.insert('stories', { user_id: users.ayse, kind: 'photo', media: await up(scenes.sea, 1080, 1920), created_at: ago(2) });
  await db.insert('stories', { user_id: users.mehmet, kind: 'photo', media: await up(scenes.city, 1080, 1920), created_at: ago(4) });
  await db.insert('stories', { user_id: users.zeynep, kind: 'photo', media: await up(scenes.mountain, 1080, 1920), created_at: ago(5) });
  const conv = await db.insert('conversations', { a: users.ayse, b: users.mehmet, last_at: ago(1) });
  await db.insert('messages', { conversation_id: conv.id, sender_id: users.mehmet, text: 'Fotoğraf çok güzel olmuş', media: '', media_kind: '', created_at: ago(1.2) });
  await db.insert('messages', { conversation_id: conv.id, sender_id: users.ayse, text: 'Teşekkürler! Hafta sonu sahile gidelim mi?', media: '', media_kind: '', created_at: ago(1) });
  await db.insert('announcements', { user_id: users.kanka, text: 'Kanka yayında! İlk açılan hesap yönetici olur.', active: true, created_at: ago(50) });
  // Reels için kısa videolar (arka planda, uygulamayı bekletmeden)
  setTimeout(async () => {
    try {
      for (const [u, kind, cap] of [['mehmet', 'waves', 'Dalgalar #reels'], ['zeynep', 'orbit', 'Renk renk']]) {
        const v = await demoVideo(kind);
        if (!v) break;
        await db.insert('posts', { user_id: users[u], kind: 'video', media: await db.upload(v, 'video'), caption: cap, created_at: ago(8) });
      }
    } catch {
      /* video üretilemedi, sorun değil */
    }
  }, 500);
}
