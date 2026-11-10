// =========================================================
// admin.js — Yönetim paneli (mobil uyumlu): genel bakış, kullanıcı yönetimi
// (mavi tik, askıya alma, yönetici yapma, hesabı kapatma), mavi tik başvuruları,
// şikâyetler, gönderi / yorum / hikâye denetimi, duyurular ve toplu bildirim.
// =========================================================
import * as A from './api.js';
import { $, $$, esc, I, ic, TICK, avatar, uname, ago, toast, sheet, confirmSheet, promptSheet, hydrate, mediaTag } from './ui.js';

const SECTIONS = [
  ['dash', 'chart', 'Genel'],
  ['users', 'users', 'Kullanıcılar'],
  ['verify', 'tick', 'Mavi tik'],
  ['reports', 'flag', 'Şikâyetler'],
  ['posts', 'image', 'Gönderiler'],
  ['comments', 'comment', 'Yorumlar'],
  ['stories', 'circle', 'Hikâyeler'],
  ['ann', 'megaphone', 'Duyurular'],
  ['server', 'globe', 'Sunucu'],
];

export async function renderAdmin(app, ctx) {
  const { section, topbar } = ctx;
  const st = await A.adminStats();
  if (ctx.stale()) return;
  const badge = { reports: st.reports, verify: st.verify };
  app.innerHTML = `${topbar(`${ic('shield', 22)} Yönetim paneli`, true)}
    <nav class="admin-nav">${SECTIONS.map(([k, icon, t]) => `<a href="#/admin/${k}" class="${section === k ? 'on' : ''}">${icon === 'tick' ? TICK : ic(icon)}${t}${badge[k] ? `<span class="n">${badge[k]}</span>` : ''}</a>`).join('')}</nav><div id="adm"></div>`;
  const box = $('#adm');
  const fn = { dash, users, verify, reports, posts, comments, stories, ann, server }[section] || dash;
  await fn(box, ctx, st);
  hydrate(box);
}

function dash(box, ctx, st) {
  const c = (n, t, alert, href) => `<a class="card ${alert ? 'alert' : ''}" ${href ? `href="${href}"` : ''}><b>${n}</b><span>${t}</span></a>`;
  box.innerHTML = `<div class="cards">
    ${c(st.users, 'Kullanıcı', false, '#/admin/users')}${c(st.newUsers, 'Son 24 saatte yeni')}
    ${c(st.posts, 'Gönderi', false, '#/admin/posts')}${c(st.postsToday, 'Son 24 saatte gönderi')}
    ${c(st.videos, 'Reels / video')}${c(st.comments, 'Yorum', false, '#/admin/comments')}
    ${c(st.stories, 'Aktif hikâye', false, '#/admin/stories')}${c(st.verified, 'Mavi tikli')}
    ${c(st.reports, 'Açık şikâyet', st.reports > 0, '#/admin/reports')}${c(st.verify, 'Mavi tik başvurusu', st.verify > 0, '#/admin/verify')}
    ${c(st.banned, 'Yasaklı hesap')}${c(st.restricted ?? 0, 'Kısıtlı hesap')}${c(st.admins, 'Yönetici / kurucu')}</div>
    <div class="section-t">Hızlı işlemler</div>
    <div class="create" style="padding-top:0"><button class="btn block" id="bc">${ic('bell')} Herkese bildirim gönder</button><a class="btn block gray" href="#/admin/ann">${ic('megaphone')} Ana sayfa duyurusu yayınla</a>
    <p class="small muted">Mod: ${A.db.mode === 'local' ? 'Yerel (bu cihaz)' : 'Supabase sunucusu'}</p></div>`;
  $('#bc', box).onclick = () =>
    promptSheet('Toplu bildirim', 'Mesaj (tüm kullanıcılara gider)', async (t) => {
      if (!t) return;
      await A.broadcast(t);
      toast('Bildirim gönderildi');
    }, true);
}

const roleChip = (u) => (u.role === 'owner' ? '<span class="role-chip">KURUCU</span>' : u.role === 'admin' ? '<span class="role-chip">YÖNETİCİ</span>' : '');
const stateChips = (u) => {
  const b = A.banState(u);
  return `${b.banned ? '<span class="ban-chip">YASAKLI</span>' : ''} ${b.restricted ? '<span class="ban-chip warn">KISITLI</span>' : ''}`;
};
const untilTxt = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'süresiz');

const REASONS = ['Spam / sahte etkileşim', 'Taciz veya zorbalık', 'Nefret söylemi', 'Müstehcen içerik', 'Şiddet veya tehdit', 'Sahte hesap / kimliğe bürünme', 'Telif hakkı ihlali', 'Reşit olmayanlarla ilgili uygunsuz içerik'];
const DURATIONS = [
  [1, '1 gün'],
  [3, '3 gün'],
  [7, '7 gün'],
  [30, '30 gün'],
  [null, 'Süresiz'],
];
/** Sebep + süre seçip yasakla / kısıtla. */
function moderateSheet(u, action, done) {
  let reason = '';
  let days = action === 'ban' ? null : 7;
  const title = action === 'ban' ? `@${u.username} yasaklansın` : `@${u.username} kısıtlansın`;
  const desc = action === 'ban' ? 'Uygulamayı hiç kullanamaz; ekranında yasak ve sebebi görünür.' : 'Gönderileri görebilir ama paylaşım, yorum, beğeni, takip ve mesaj yapamaz.';
  sheet(`<h3>${esc(title)}</h3><div class="inner form"><p class="small muted">${desc}</p>
    <label class="small muted">Sebep (kullanıcıya gösterilir)</label>
    <div class="chips" id="mR">${REASONS.map((r) => `<button data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <input class="field" id="mT" placeholder="ya da sebebi kendin yaz" maxlength="200">
    <label class="small muted">Süre</label>
    <div class="chips" id="mD">${DURATIONS.map(([d, t]) => `<button data-d="${d ?? ''}" class="${d === days ? 'on' : ''}">${t}</button>`).join('')}</div>
    <button class="btn block red" id="mGo">${action === 'ban' ? 'Yasakla' : 'Kısıtla'}</button><button class="btn block gray" id="mNo">Vazgeç</button></div>`, (c, close) => {
    $('#mR', c).onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      reason = b.dataset.r;
      $('#mT', c).value = reason;
      $$('#mR button', c).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#mD', c).onclick = (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      days = b.dataset.d ? +b.dataset.d : null;
      $$('#mD button', c).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#mNo', c).onclick = close;
    $('#mGo', c).onclick = async () => {
      const r = $('#mT', c).value.trim() || reason;
      if (!r) return toast('Bir sebep seç ya da yaz', true);
      try {
        await A.adminModerate(u.id, action, r, days);
        close();
        toast(action === 'ban' ? 'Yasaklandı' : 'Kısıtlandı');
        done();
      } catch (er) {
        toast(er.message, true);
      }
    };
  });
}

async function users(box, ctx) {
  if (ctx.id) return userDetail(box, ctx);
  box.innerHTML = `<div class="search">${I.search}<input id="aq" placeholder="Kullanıcı ara (ad / kullanıcı adı)"></div>
    <div class="seg" style="margin:0 12px 6px" id="flt"><button data-f="all" class="on">Hepsi</button><button data-f="verified">Mavi tikli</button><button data-f="banned">Yasaklı</button><button data-f="restricted">Kısıtlı</button><button data-f="admin">Yönetici</button></div><div id="ul"></div>`;
  let filter = 'all';
  const draw = async () => {
    let list = await A.adminUsers($('#aq', box).value.trim());
    if (filter === 'verified') list = list.filter((u) => u.verified);
    if (filter === 'banned') list = list.filter((u) => A.banState(u).banned);
    if (filter === 'restricted') list = list.filter((u) => A.banState(u).restricted);
    if (filter === 'admin') list = list.filter((u) => A.isAdminP(u));
    $('#ul', box).innerHTML = list.length
      ? list
          .map((u) => {
            const prot = A.isAdminP(u);
            return `<div class="arow"><a href="#/admin/users/${u.id}">${avatar(u, 46)}</a><div class="grow"><a href="#/admin/users/${u.id}">${uname(u)} ${roleChip(u)} ${stateChips(u)}</a>
        <div class="small muted">${esc(u.name)} · katıldı ${ago(u.created_at, true)}</div>
        <div class="acts2">${
          u.id === ctx.me.id
            ? '<span class="small muted">(sen)</span>'
            : `<button class="btn sm ${u.verified ? 'gray' : ''}" data-x="tick" data-u="${u.id}">${u.verified ? 'Tiki kaldır' : TICK + ' Mavi tik ver'}</button>
          ${prot ? `<span class="prot-chip">${ic('shield', 12)} Korumalı</span>` : ''}
          <a class="btn sm gray" href="#/admin/users/${u.id}">Yönet</a>`
        }</div></div></div>`;
          })
          .join('')
      : '<div class="empty">Kullanıcı yok.</div>';
    hydrate(box);
  };
  $('#aq', box).oninput = () => draw();
  $('#flt', box).onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    filter = b.dataset.f;
    $$('#flt button', box).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  };
  box.onclick = async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const u = await A.profile(b.dataset.u, true);
    try {
      if (b.dataset.x === 'tick') await A.adminSet(u.id, { verified: !u.verified });
      toast('Güncellendi');
      draw();
    } catch (er) {
      toast(er.message, true);
    }
  };
  await draw();
}

async function userDetail(box, ctx) {
  const u = await A.profile(ctx.id, true);
  if (!u) return (box.innerHTML = '<div class="empty">Kullanıcı yok.</div>');
  const [s, posts, reps, pinfo] = await Promise.all([
    A.stats(u.id),
    A.db.list('posts', { eq: { user_id: u.id }, order: ['created_at', false] }),
    A.db.list('reports', { eq: { target_id: u.id } }),
    A.db.list('private_info', { eq: { user_id: u.id } }).catch(() => []),
  ]);
  const self = u.id === ctx.me.id;
  const ownerMe = A.isOwnerP(ctx.me);
  const prot = A.isAdminP(u); // yönetici koruması
  const canEdit = !self && (!prot || (ownerMe && u.role !== 'owner'));
  const b = A.banState(u);
  const age = A.ageOf(pinfo[0]?.birth_date);
  box.innerHTML = `<div class="prof"><div class="prof-top">${avatar(u, 76)}<div class="grow" style="flex:1"><div style="font-size:18px">${uname(u)}</div><div class="muted">${esc(u.name)}</div>
      <div style="margin-top:4px">${roleChip(u)} ${stateChips(u)} ${u.private ? '<span class="lock-chip">Gizli</span>' : ''}</div></div></div>
    <div class="kv" style="margin-top:12px"><span class="muted">Kimlik</span><span class="small">${esc(u.id)}</span><span class="muted">Katılım</span><span>${new Date(u.created_at).toLocaleString('tr-TR')}</span>
      <span class="muted">Yaş</span><span>${age ?? '—'}</span>
      <span class="muted">Gönderi</span><span>${s.posts}</span><span class="muted">Takipçi / takip</span><span>${s.followers} / ${s.following}</span><span class="muted">Hakkında şikâyet</span><span>${reps.length}</span>
      <span class="muted">Biyografi</span><span>${esc(u.bio) || '—'}</span></div>
    ${b.banned ? `<div class="ban-reason"><small>Yasaklı · ${untilTxt(b.banUntil)}</small><div>${esc(b.banReason || 'Sebep yok')}</div></div>` : ''}
    ${b.restricted ? `<div class="ban-reason warn"><small>Kısıtlı · ${untilTxt(b.restrictUntil)}</small><div>${esc(b.restrictReason || 'Sebep yok')}</div></div>` : ''}
    ${prot ? `<div class="prot-box">${ic('shield', 18)}<div><b>Yönetici koruması</b><br><span class="small muted">${u.role === 'owner' ? 'Kurucu hesabı hiçbir şekilde kısıtlanamaz, yasaklanamaz, silinemez ve rolü değiştirilemez.' : 'Yöneticiler kısıtlanamaz ve yasaklanamaz. Yöneticilik yetkisini sadece kurucu verip alabilir.'}</span></div></div>` : ''}
    ${
      self
        ? '<p class="muted small">Kendi hesabının yetkilerini buradan değiştiremezsin.</p>'
        : !canEdit
          ? '<p class="muted small">Bu hesabı sadece kurucu yönetebilir.</p>'
          : `<div class="create" style="padding:12px 0">
      <button class="btn block ${u.verified ? 'gray' : ''}" data-x="tick">${u.verified ? 'Mavi tiki kaldır' : TICK + ' Mavi tik ver'}</button>
      ${prot ? '' : b.restricted ? `<button class="btn block green" data-x="unrestrict">Kısıtlamayı kaldır</button>` : `<button class="btn block red" data-x="restrict">${ic('ban')} Kısıtla (sebep + süre)</button>`}
      ${prot ? '' : b.banned ? `<button class="btn block green" data-x="unban">Yasağı kaldır</button>` : `<button class="btn block red" data-x="ban">${ic('ban')} Yasakla (sebep + süre)</button>`}
      ${ownerMe && u.role !== 'owner' ? `<button class="btn block gray" data-x="role">${u.role === 'admin' ? 'Yöneticilikten çıkar' : ic('shield') + ' Yönetici yap'}</button>` : ''}
      <button class="btn block gray" data-x="edit">${ic('pen')} Ad / biyografi düzenle</button>
      <button class="btn block gray" data-x="avatar">${ic('image')} Profil fotoğrafını kaldır</button>
      <button class="btn block gray" data-x="notify">${ic('bell')} Kullanıcıya bildirim gönder</button>
      <a class="btn block gray" href="#/u/${esc(u.username)}">Profili aç</a>
      ${prot ? '' : `<button class="btn block red" data-x="wipe">${ic('trash')} Hesabı kapat (yasakla + tüm içeriği sil)</button>`}</div>`
    }
  </div><div class="section-t">Gönderileri (${posts.length})</div>
  <div class="grid3">${posts.map((p) => `<a class="cell" href="#/p/${p.id}">${mediaTag(p.media, p.kind)}</a>`).join('')}</div>`;
  box.onclick = async (e) => {
    const bt = e.target.closest('[data-x]');
    if (!bt) return;
    const x = bt.dataset.x;
    const done = () => (toast('Güncellendi'), ctx.reroute());
    try {
      if (x === 'tick') await A.adminSet(u.id, { verified: !u.verified }), done();
      if (x === 'ban' || x === 'restrict') moderateSheet(u, x, ctx.reroute);
      if (x === 'unban' || x === 'unrestrict') await A.adminModerate(u.id, x), done();
      if (x === 'role') confirmSheet(u.role === 'admin' ? 'Yöneticilik kaldırılsın mı?' : `@${u.username} yönetici yapılsın mı? Kullanıcıları ve içerikleri yönetebilir.`, async () => (await A.adminSet(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }).catch((er) => toast(er.message, true)), done()), 'Onayla', false);
      if (x === 'avatar') await A.adminSet(u.id, { avatar: '' }), done();
      if (x === 'edit')
        promptSheet('Ad', 'Ad soyad', async (name) => {
          promptSheet('Biyografi', 'Biyografi', async (bio) => (await A.adminSet(u.id, { name, bio }), done()), true, u.bio);
        }, false, u.name);
      if (x === 'notify') promptSheet(`@${u.username} kullanıcısına bildirim`, 'Mesaj', async (t) => t && (await A.db.insert('notifications', { user_id: u.id, actor_id: ctx.me.id, type: 'system', text: t, read: false, post_id: null }), toast('Gönderildi')), true);
      if (x === 'wipe') confirmSheet(`@${u.username} hesabı kapatılsın ve TÜM içeriği silinsin mi? Geri alınamaz.`, async () => (await A.adminWipeUser(u.id), done()), 'Hesabı kapat');
    } catch (er) {
      toast(er.message, true);
    }
  };
}

async function verify(box, ctx) {
  const list = await A.adminVerifyRequests();
  const open = list.filter((r) => r.status === 'open');
  const old = list.filter((r) => r.status !== 'open').slice(0, 20);
  const row = (r) => `<div class="arow vrow">${r.selfieUrl ? `<img class="vselfie" src="${esc(r.selfieUrl)}" alt="Yüz fotoğrafı">` : avatar(r.user, 46)}<div class="grow">${uname(r.user)} <span class="muted small">${ago(r.created_at)}</span>
    ${r.full_name ? `<div class="kv small" style="margin-top:4px"><span class="muted">Ad soyad</span><span>${esc(r.full_name)}</span><span class="muted">Doğum</span><span>${r.birth_date ? esc(r.birth_date) + ` (${r.age} yaş)` : '—'}</span></div>` : ''}
    ${r.age !== null && r.age !== undefined && r.age < A.VERIFY_MIN_AGE ? `<div class="small" style="color:#ff6b77">${A.VERIFY_MIN_AGE} yaşından küçük</div>` : ''}
    <div class="small">${esc(r.note) || '<span class="muted">Not yok</span>'}</div>
    ${r.status === 'open' ? `<div class="small muted">Profil fotoğrafıyla ve ad soyadla karşılaştır. Karar sonrası yüz fotoğrafı silinir.</div><div class="acts2"><button class="btn sm" data-ok="${r.id}">${TICK} Onayla</button><button class="btn sm red" data-no="${r.id}">Reddet</button><a class="btn sm gray" href="#/admin/users/${r.user_id}">Hesap</a></div>` : `<div class="small muted">${r.status === 'approved' ? ic('check') + ' Onaylandı' : ic('x') + ' Reddedildi' + (r.reject_reason ? ': ' + esc(r.reject_reason) : '')}</div>`}</div></div>`;
  box.innerHTML = `<div class="section-t">Bekleyen başvurular (${open.length})</div>${open.map(row).join('') || '<div class="empty" style="padding:24px">Bekleyen başvuru yok.</div>'}
    ${old.length ? `<div class="section-t">Geçmiş</div>${old.map(row).join('')}` : ''}`;
  box.onclick = async (e) => {
    const ok = e.target.closest('[data-ok]');
    const no = e.target.closest('[data-no]');
    const r = list.find((x) => x.id === (ok || no)?.dataset[ok ? 'ok' : 'no']);
    if (!r) return;
    if (ok) {
      await A.decideVerify(r, true);
      toast('Mavi tik verildi');
      return ctx.reroute();
    }
    sheet(
      ['Fotoğraf yüz içermiyor / net değil', 'Profil fotoğrafıyla eşleşmiyor', 'Yaş şartı sağlanmıyor', 'Bilgiler eksik veya tutarsız', 'Hesap mavi tik kriterlerini karşılamıyor'].map((t) => ({
        label: t,
        run: async () => {
          await A.decideVerify(r, false, t);
          toast('Reddedildi');
          ctx.reroute();
        },
      }))
    );
  };
}

async function reports(box, ctx) {
  const list = await A.adminReports();
  const open = list.filter((r) => r.status === 'open');
  const closed = list.filter((r) => r.status !== 'open').slice(0, 30);
  const tlabel = { post: 'Gönderi', comment: 'Yorum', user: 'Kullanıcı', story: 'Hikâye', appeal: 'İtiraz (yasak/kısıtlama)' };
  const row = (r) => {
    const t = r.target;
    const tu = r.target_type === 'user' || r.target_type === 'appeal' ? t : r.targetUser;
    const bs = tu ? A.banState(tu) : null;
    let prev = '<span class="muted">İçerik silinmiş</span>';
    if (t && (r.target_type === 'post' || r.target_type === 'story')) prev = `${mediaTag(t.media, t.kind, 'thumb')}`;
    else if (t && r.target_type === 'comment') prev = `<div class="small">“${esc(t.text)}”</div>${t.media ? mediaTag(t.media, 'photo', 'thumb') : ''}`;
    else if (t && (r.target_type === 'user' || r.target_type === 'appeal')) prev = avatar(t, 46);
    return `<div class="arow"><div style="flex:none">${r.target_type === 'comment' ? '' : prev}</div><div class="grow">
      <b>${tlabel[r.target_type]}</b> · <span style="color:#ff6b77">${esc(r.reason)}</span> <span class="muted small">${ago(r.created_at)}</span>
      ${r.target_type === 'comment' ? prev : ''}
      <div class="small muted">${r.target_type === 'appeal' ? `İtiraz eden: @${esc(tu?.username || '?')}${bs?.banned ? ' · yasak sebebi: ' + esc(bs.banReason) : bs?.restricted ? ' · kısıtlama sebebi: ' + esc(bs.restrictReason) : ' · şu an yaptırım yok'}` : `Şikâyet eden: ${esc(r.reporter?.username || '?')} · Hedef: ${tu ? '@' + esc(tu.username) : '—'}`}</div>
      ${r.status === 'open' ? `<div class="acts2">
        ${t && !['user', 'appeal'].includes(r.target_type) ? `<button class="btn sm red" data-del="${r.id}">${ic('trash')} İçeriği sil</button>` : ''}
        ${r.target_type === 'appeal' && bs?.banned ? `<button class="btn sm green" data-lift="${r.id}" data-a="unban">Yasağı kaldır</button>` : ''}
        ${r.target_type === 'appeal' && bs?.restricted ? `<button class="btn sm green" data-lift="${r.id}" data-a="unrestrict">Kısıtlamayı kaldır</button>` : ''}
        ${tu && r.target_type !== 'appeal' && !A.isAdminP(tu) ? `<button class="btn sm red" data-ban="${r.id}" data-a="restrict">${ic('ban')} Kısıtla</button><button class="btn sm red" data-ban="${r.id}" data-a="ban">${ic('ban')} Yasakla</button>` : ''}
        ${t && r.target_type === 'post' ? `<a class="btn sm gray" href="#/p/${t.id}">Gör</a>` : ''}
        <button class="btn sm gray" data-close="${r.id}">${ic('check')} Kapat (sorun yok)</button></div>` : '<div class="small muted">Kapatıldı</div>'}
    </div></div>`;
  };
  box.innerHTML = `<div class="section-t">Açık şikâyetler (${open.length})</div>${open.map(row).join('') || '<div class="empty" style="padding:24px">Açık şikâyet yok</div>'}
    ${closed.length ? `<div class="section-t">Kapatılanlar</div>${closed.map(row).join('')}` : ''}`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-del],[data-ban],[data-close],[data-lift]');
    if (!b) return;
    const id = b.dataset.del || b.dataset.ban || b.dataset.close || b.dataset.lift;
    const r = list.find((x) => x.id === id);
    try {
      if (b.dataset.del) {
        if (r.target_type === 'post') await A.deletePost(r.target_id);
        if (r.target_type === 'comment') await A.deleteComment(r.target_id);
        if (r.target_type === 'story') await A.deleteStory(r.target_id);
        toast('İçerik silindi');
      }
      if (b.dataset.ban) {
        const tu = r.target_type === 'user' ? r.target : r.targetUser;
        return moderateSheet(tu, b.dataset.a, async () => (await A.closeReport(r.id), ctx.reroute()));
      }
      if (b.dataset.lift) {
        await A.adminModerate(r.target_id, b.dataset.a);
        toast('Yaptırım kaldırıldı');
      }
      await A.closeReport(r.id);
      ctx.reroute();
    } catch (er) {
      toast(er.message, true);
    }
  };
}

async function posts(box, ctx) {
  const list = await A.explore();
  box.innerHTML = `<div class="section-t">Son gönderiler (${list.length})</div>${list
    .map(
      (p) => `<div class="arow"><a href="#/p/${p.id}">${mediaTag(p.media, p.kind, 'thumb')}</a><div class="grow">${uname(p.author)} <span class="muted small">${ago(p.created_at)} · ${p.kind === 'video' ? 'Reels' : 'Foto'}</span>
      <div class="small">${esc(p.caption).slice(0, 140) || '<span class="muted">Açıklama yok</span>'}</div>
      <div class="small muted">${ic('heart', 13)} ${p.likeCount} · ${ic('comment', 13)} ${p.commentCount} · ${ic('repost', 13)} ${p.repostCount}</div>
      <div class="acts2"><button class="btn sm red" data-del="${p.id}">${ic('trash')} Sil</button><a class="btn sm gray" href="#/p/${p.id}">Aç</a><a class="btn sm gray" href="#/admin/users/${p.user_id}">Hesap</a></div></div></div>`
    )
    .join('') || '<div class="empty">Gönderi yok.</div>'}`;
  box.onclick = (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    confirmSheet('Gönderi silinsin mi?', async () => (await A.deletePost(b.dataset.del), toast('Silindi'), ctx.reroute()), 'Sil');
  };
}

async function comments(box, ctx) {
  const list = await A.adminComments();
  box.innerHTML = `<div class="section-t">Son yorumlar</div>${list
    .map(
      (c) => `<div class="arow">${avatar(c.author, 38)}<div class="grow">${uname(c.author)} <span class="muted small">${ago(c.created_at)}</span>
      <div>${esc(c.text)}</div>${c.media ? mediaTag(c.media, 'photo', 'thumb') : ''}
      <div class="acts2"><button class="btn sm red" data-del="${c.id}">${ic('trash')} Sil</button><a class="btn sm gray" href="#/p/${c.post_id}">Gönderi</a></div></div></div>`
    )
    .join('') || '<div class="empty">Yorum yok.</div>'}`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    await A.deleteComment(b.dataset.del);
    toast('Yorum silindi');
    ctx.reroute();
  };
}

async function stories(box, ctx) {
  const list = await A.adminStories();
  box.innerHTML = `<div class="section-t">Aktif hikâyeler (${list.length})</div>${list
    .map((s) => `<div class="arow">${mediaTag(s.media, s.kind, 'thumb')}<div class="grow">${uname(s.author)} <span class="muted small">${ago(s.created_at)}</span><div class="acts2"><button class="btn sm red" data-del="${s.id}">${ic('trash')} Sil</button><a class="btn sm gray" href="#/story/${s.user_id}">Gör</a></div></div></div>`)
    .join('') || '<div class="empty">Aktif hikâye yok.</div>'}`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    await A.deleteStory(b.dataset.del);
    toast('Silindi');
    ctx.reroute();
  };
}

async function ann(box, ctx) {
  const list = await A.listAnnouncements();
  box.innerHTML = `<div class="create"><textarea class="field" id="at" placeholder="Ana sayfanın üstünde herkese görünecek duyuru..." maxlength="300"></textarea><button class="btn block" id="ap">${ic('megaphone')} Yayınla</button></div>
    ${list.map((a) => `<div class="arow"><div class="grow"><div>${esc(a.text)}</div><div class="small muted">${ago(a.created_at, true)} · ${a.active ? ic('dotOn', 12) + ' yayında' : ic('dotOff', 12) + ' kapalı'}</div>
      <div class="acts2"><button class="btn sm gray" data-tg="${a.id}">${a.active ? 'Yayından kaldır' : 'Yeniden yayınla'}</button><button class="btn sm red" data-del="${a.id}">Sil</button></div></div></div>`).join('')}`;
  $('#ap', box).onclick = async () => {
    const t = $('#at', box).value.trim();
    if (!t) return;
    await A.announce(t);
    toast('Duyuru yayında');
    ctx.reroute();
  };
  box.onclick = async (e) => {
    const tg = e.target.closest('[data-tg]');
    const del = e.target.closest('[data-del]');
    if (tg) {
      const a = list.find((x) => x.id === tg.dataset.tg);
      await A.setAnnouncement(a.id, !a.active);
      ctx.reroute();
    }
    if (del) {
      await A.deleteAnnouncement(del.dataset.del);
      ctx.reroute();
    }
  };
}

/* ---------- Sunucu: herkesi aynı sunucuya bağla ---------- */
const EDIT_URL = 'https://github.com/canbey123x/pvphouselauncher/edit/ccr-111fa307-9zbgth/KankaSosyal/server.json';
async function server(box) {
  const cfg = A.serverConfig();
  const local = A.db.mode === 'local';
  box.innerHTML = `<div class="create">
    <div class="modebadge" style="text-align:left">${local ? `${ic('device', 14)}<b>Bu cihaz sunucuya bağlı değil.</b> Önce aşağıdan adres ve anahtarı girip bağlan.` : `${ic('globe', 14)}<b>Bağlı sunucu:</b><br>${esc(cfg.url)}`}</div>

    <div class="section-t" style="padding:6px 0 0">1. Otomatik bağlanma (herkes için)</div>
    <p class="small muted" style="margin:0">Uygulama her açılışta GitHub'daki <b>server.json</b> dosyasını okur ve oradaki sunucuya kendiliğinden bağlanır. Bir kez doldurman yeter; yeni APK gerekmez, sunucu değişirse herkes otomatik geçer.</p>
    <div class="card" style="font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all" id="json">{
  "url": "${esc(cfg?.url || 'https://xxxx.supabase.co')}",
  "key": "${esc(cfg?.key || 'sb_publishable_...')}"
}</div>
    <button class="btn block gray" id="cpJson">${ic('link')} Bu içeriği kopyala</button>
    <a class="btn block" href="${EDIT_URL}" target="_blank" rel="noopener">${ic('pen')} server.json'u GitHub'da düzenle</a>
    <p class="small muted" style="margin:0">Açılan sayfada içeriği sil, kopyaladığını yapıştır, <b>Commit changes</b> de. Birkaç dakika içinde herkes bağlanır.</p>

    <div class="section-t" style="padding:12px 0 0">2. Bu cihazın sunucusu</div>
    <input class="field" id="su" placeholder="Supabase URL (https://xxxx.supabase.co)" value="${esc(cfg?.url || '')}">
    <input class="field" id="sk" placeholder="publishable / anon anahtar (secret DEĞİL)" value="${esc(cfg?.key || '')}">
    <button class="btn block gray" id="sv">Bu cihazı bağla</button>
    <p class="small muted" style="margin:0">Asla <b>secret / service_role</b> anahtarını girme.</p></div>`;
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Kopyalandı');
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
      toast('Kopyalandı');
    }
  };
  $('#cpJson', box).onclick = () => copy($('#json', box).textContent);
  $('#sv', box).onclick = () => {
    const url = $('#su', box).value.trim().replace(/\/$/, '');
    const key = $('#sk', box).value.trim();
    if (!/^https:\/\/.+/.test(url) || key.length < 20) return toast('URL ya da anahtar hatalı', true);
    if (/^sb_secret_/.test(key)) return toast('Bu secret anahtar! Publishable anahtarı gir.', true);
    A.setServerConfig({ url, key });
    location.hash = '#/login';
    location.reload();
  };
}
