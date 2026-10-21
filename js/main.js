// 醒醒吧！方块 —— 应用主控：界面、流程、分享、后台、VR 面板
import { World } from './world.js';
import { buildAtlas } from './voxel.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { PlayMode } from './play.js';
import { CollectionMode } from './collection.js';
import { CreatorMode } from './creator.js';
import { HomeMode } from './home.js';
import { VRPanel, rowButtons } from './vrui.js';
import { ICON, hydrateIcons } from './icons.js';
import { THEMES, PALETTE, PARTS } from './palette.js';
import { encodeLevel, decodeLevel, shareLink, siteUrl } from './codec.js';
import { makeShareCard, shareCanvas, thumbnail, fmtTime, canvasToBlob, downloadBlob } from './share.js';
import { CONFIG } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const app = {
  store, audio,
  screen: 'home',
  playCtx: null,
  xrSupported: false,
};
window.__wuc = app;

// ---------- 小工具 ----------
let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  if (app.vrPanel && app.world && app.world.isXR) app.vrPanel.toast(msg);
}
app.toast = toast;

let modalClose = null;
function modal({ title, html, actions = [], wide = false, onClose, onOpen }) {
  const m = $('#modal');
  const card = $('.modal-card', m);
  card.classList.toggle('wide', wide);
  $('.modal-title', m).textContent = title || '';
  $('.modal-body', m).innerHTML = html || '';
  const act = $('.modal-actions', m);
  act.innerHTML = '';
  const close = () => { m.classList.add('hidden'); modalClose = null; if (onClose) onClose(); };
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'pill-btn ' + (a.cls || '');
    if (a.ic) b.innerHTML = ICON[a.ic];
    b.insertAdjacentText('beforeend', a.label);
    b.onclick = async () => {
      audio.play('click');
      const r = a.onClick ? await a.onClick(b) : undefined;
      if (r !== false) close();
    };
    act.appendChild(b);
  });
  hydrateIcons(m);
  m.classList.remove('hidden');
  modalClose = close;
  if (onOpen) onOpen($('.modal-body', m));
  return { close, body: $('.modal-body', m) };
}
$('#modal .modal-x').onclick = () => modalClose && modalClose();
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && modalClose) modalClose(); });

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制到剪贴板 ✓'); return true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    toast(ok ? '已复制到剪贴板 ✓' : '复制失败，请手动长按复制');
    return ok;
  }
}

function starsHTML(n, of = 3) {
  let s = '';
  for (let i = 0; i < of; i++) s += `<span class="${i < n ? 'on' : ''}">${ICON.star}</span>`;
  return s;
}

function officialIndex(entry) {
  if (!entry || !entry.official) return 0;
  const i = store.official().findIndex(l => l.id === entry.id);
  return i >= 0 ? i + 1 : 0;
}
function displayName(entry) {
  const i = officialIndex(entry);
  return (i ? `Lv.${i} ` : '') + entry.name;
}

// ---------- 主题 ----------
function applyTheme(key) {
  if (app.curTheme === key) return;
  app.curTheme = key;
  const th = THEMES[key] || THEMES.peach;
  app.world.env.setTheme(key);
  const r = document.documentElement.style;
  r.setProperty('--accent', th.accent);
  r.setProperty('--accent-d', th.accentD);
  document.body.style.background = th.skyMid;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', th.skyTop);
}

// ---------- 屏幕切换 ----------
function showScreen(id) {
  app.screen = id;
  if (id !== 'play' && app.world) applyTheme(store.config.theme);
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== 'scr-' + id));
  audio.setScene(id === 'levels' || id === 'admin' ? 'home' : id);
  updateVRPanel();
}

function featuredEntry() {
  const done = store.completedIds();
  const last = store.data.lastPlayed && store.getLevel(store.data.lastPlayed);
  if (last && done.includes(last.id)) return last;
  if (done.length) return store.getLevel(done[done.length - 1]);
  return store.levels()[0];
}

function goHome() {
  const f = featuredEntry();
  if (f && (!app.home.entry || app.home.entry.id !== f.id || app.home.entry.data !== f.data)) app.home.setFeatured(f);
  app.world.setMode(app.home);
  showScreen('home');
  updateHome();
}

function updateHome() {
  const off = store.official();
  const done = off.filter(l => store.progress(l.id)).length;
  $('#homeProgress').textContent = `${done}/${off.length}`;
  updateMusicBtn();
}

function updateMusicBtn() {
  const on = store.config.music;
  $('#btnMusic').innerHTML = on ? ICON.music : ICON.mute;
  const t = audio.currentTitle();
  $('#nowPlaying').textContent = on && t && audio.ready ? '♪ ' + t : '';
}

// ---------- 关卡列表 ----------
let levelTab = 'official';
function goLevels(tab) {
  if (tab) levelTab = tab;
  app.world.setMode(app.home);
  showScreen('levels');
  renderLevels();
}

function renderLevels() {
  $$('#levelTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === levelTab));
  const list = levelTab === 'official' ? store.official() : store.custom();
  const grid = $('#levelGrid');
  grid.innerHTML = '';
  $('#levelEmpty').classList.toggle('hidden', list.length > 0);
  list.forEach((L, i) => {
    const p = store.progress(L.id);
    const card = document.createElement('div');
    card.className = 'lvcard';
    card.style.animationDelay = (i * 0.04) + 's';
    const dims = `${L.data.w}×${L.data.h}×${L.data.d}`;
    let thumb;
    if (p) {
      try { thumb = `<img alt="" src="${thumbnail(L, 232)}">`; } catch (e) { thumb = ''; }
    } else {
      thumb = `<div class="sleepy-cube" style="animation-delay:${(i % 5) * 0.3}s"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i><span class="dims">${dims}</span></div>`;
    }
    card.innerHTML = `
      ${levelTab === 'official' ? `<span class="num">${i + 1}</span>` : ''}
      <div class="thumb">${thumb}</div>
      <div class="name">${p ? esc(L.name) : (levelTab === 'official' ? '？？？' : esc(L.name))}</div>
      <div class="meta"><span class="diff">难度 ${'★'.repeat(L.diff)}</span><span>${dims}</span></div>
      <div class="stars">${starsHTML(p ? p.stars : 0)}</div>
      ${L.author && !L.official ? `<div class="by">by ${esc(L.author)}</div>` : ''}
      ${!L.official ? `<button class="del" title="删除">${ICON.trash}</button>` : ''}`;
    card.onclick = (e) => {
      if (e.target.closest('.del')) {
        e.stopPropagation();
        modal({
          title: '删除关卡？', html: `<p>确定要删除「${esc(L.name)}」吗？</p>`,
          actions: [{ label: '取消' }, { label: '删除', cls: 'pink', ic: 'trash', onClick: () => { store.deleteLevel(L.id); renderLevels(); toast('已删除'); } }],
        });
        return;
      }
      audio.unlock(); audio.play('click');
      startLevel(L, { from: 'levels' });
    };
    grid.appendChild(card);
  });
}

// ---------- 游戏 ----------
function startLevel(entry, ctx = {}) {
  app.playCtx = { from: 'levels', ...ctx, entry };
  const cfg = store.config;
  app.play.load(entry, { casual: cfg.casual, lives: cfg.lives, speed: cfg.animSpeed });
  app.world.setMode(app.play);
  showScreen('play');
  // 每次进关：随机一个场景主题 + 随机一首背景音乐
  const keys = Object.keys(THEMES).filter(k => k !== app.curTheme);
  applyTheme(keys[Math.floor(Math.random() * keys.length)]);
  audio.shuffle();
  $('#resultCard').classList.add('hidden');
  const dims = entry.data;
  $('#playName').textContent = displayName(entry);
  $('#playDims').textContent = `${dims.w}×${dims.h}×${dims.d}`;
  $$('#slicers .slicer').forEach(s => {
    const ax = +s.dataset.axis;
    const inp = $('input', s);
    inp.max = [dims.w, dims.h, dims.d][ax] - 1;
    inp.value = 0;
    $('.sv', s).textContent = '0';
  });
  const hint = $('#playHint');
  hint.classList.remove('fade');
  hint.textContent = matchMedia('(pointer: coarse)').matches ? '点一下敲掉多余方块 · 长按 = 保护' : '左键敲掉多余方块 · 右键保护 · 拖动旋转';
  clearTimeout(app.hintTimer);
  app.hintTimer = setTimeout(() => hint.classList.add('fade'), 5000);
  setTool('break');
  if (!localStorage.getItem('wuc.howto')) { localStorage.setItem('wuc.howto', '1'); setTimeout(showHowto, 400); }
}
app.startLevel = startLevel;

function setTool(t) {
  app.play.setTool(t);
  $$('#toolSwitch .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
}

app.onPlayState = (info, extra) => {
  if (app.screen !== 'play') return;
  // 生命值
  const hearts = $('#playHearts');
  if (info.casual) hearts.innerHTML = `${ICON.heart}<span class="inf">休闲</span>`;
  else {
    let h = '';
    for (let i = 0; i < info.maxLives; i++) h += `<span class="${i < info.lives ? '' : 'lost'}">${ICON.heart}</span>`;
    hearts.innerHTML = h;
    $$('#playHearts > span').forEach(s => { const svg = s.firstElementChild; if (s.classList.contains('lost')) svg.classList.add('lost'); });
  }
  if (extra.mistake) {
    hearts.classList.remove('shake'); void hearts.offsetWidth; hearts.classList.add('shake');
    if (!info.casual && info.lives > 0) toast(`哎呀，那是要保留的方块！已自动保护 (剩 ${info.lives} 颗心)`);
  }
  $('#playRemain').textContent = info.remaining;
  $('#playTime').textContent = fmtTime(info.time);
  $$('#toolSwitch .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === info.tool));
  $$('#slicers .slicer').forEach(s => {
    const ax = +s.dataset.axis;
    $('input', s).value = info.slice[ax];
    $('.sv', s).textContent = info.slice[ax];
  });
  const playing = info.state === 'playing';
  $('#slicers').style.visibility = playing ? '' : 'hidden';
  $('#toolSwitch').style.visibility = playing ? '' : 'hidden';
  if (!extra.tick) updateVRPanel();
  else if (app.world.isXR) updateVRPanel();
};

function nextEntry(entry) {
  if (!entry || !entry.id) return null;
  const list = entry.official ? store.official() : store.custom();
  const i = list.findIndex(l => l.id === entry.id);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}
function prevEntry(entry) {
  if (!entry || !entry.id) return null;
  const list = entry.official ? store.official() : store.custom();
  const i = list.findIndex(l => l.id === entry.id);
  return i > 0 ? list[i - 1] : null;
}

app.onPlayEnd = (result) => {
  const ctx = app.playCtx;
  const entry = ctx.entry;
  const card = $('#resultCard');
  const acts = $('#resultActions');
  acts.innerHTML = '';
  const btn = (label, cls, ic, fn) => {
    const b = document.createElement('button');
    b.className = 'pill-btn ' + cls;
    b.innerHTML = (ic ? ICON[ic] : '') + label;
    b.onclick = () => { audio.play('click'); fn(); };
    acts.appendChild(b);
  };
  if (result.ok) {
    if (entry.id && store.getLevel(entry.id) && !ctx.test) store.setProgress(entry.id, { stars: result.stars, time: result.time, mistakes: result.mistakes });
    $('#resultTitle').textContent = `「${entry.name}」醒啦！`;
    $('#resultStars').innerHTML = starsHTML(result.stars);
    $('#resultStats').innerHTML = `<span>用时<b>${fmtTime(result.time)}</b></span><span>失误<b>${result.mistakes}</b></span>`;
    if (ctx.test) {
      btn('返回工坊', 'pink', 'sparkle', () => goCreator(null, { keep: true }));
      btn('再试一次', '', 'restart', () => startLevel(entry, ctx));
    } else {
      btn('分享', 'pink', 'share', () => shareResult(entry, result));
      const nx = nextEntry(entry);
      if (nx) btn('下一关', 'mint', 'play', () => startLevel(nx, { from: ctx.from }));
      btn('再玩一次', '', 'restart', () => startLevel(entry, ctx));
      btn('收藏室', '', 'gift', () => goCollection(entry.id));
    }
  } else {
    $('#resultTitle').textContent = '方块又睡着啦…';
    $('#resultStars').innerHTML = '';
    $('#resultStats').innerHTML = `<span>没关系，再来一次一定行！</span>`;
    btn('再试一次', 'pink', 'restart', () => startLevel(entry, ctx));
    btn('返回', '', 'back', () => leavePlay());
  }
  setTimeout(() => card.classList.remove('hidden'), result.ok ? 700 : 300);
  updateVRPanel();
};

function leavePlay() {
  const ctx = app.playCtx || {};
  if (ctx.test) goCreator(null, { keep: true });
  else if (ctx.from === 'share' || ctx.from === 'home') goHome();
  else goLevels(ctx.entry && !ctx.entry.official ? 'custom' : 'official');
}

// ---------- 分享 ----------
// 分享前先问一下玩家名字（会显示在分享图上）
function shareResult(entry, result) {
  const cur = store.config.playerName || '';
  // 设置里已经填过名字，就不再询问
  if (cur) { buildShare(entry, result, cur); return; }
  modal({
    title: result && result.ok ? '分享你的战绩 ✨' : '分享这个关卡',
    html: `<p>写上你的名字，朋友就知道是谁发来的挑战啦（可不填）：</p>
      <input class="txt" id="shareName" maxlength="12" placeholder="你的名字" value="${esc(cur)}">`,
    actions: [
      { label: '不写名字', onClick: () => { setTimeout(() => buildShare(entry, result, ''), 50); } },
      { label: '生成分享图', cls: 'pink', ic: 'share', onClick: () => {
        const n = ($('#shareName').value || '').trim().slice(0, 12);
        if (n !== cur) store.setConfig({ playerName: n });
        setTimeout(() => buildShare(entry, result, n), 50);
      } },
    ],
    onOpen: () => setTimeout(() => { const i = $('#shareName'); if (i && !matchMedia('(pointer: coarse)').matches) i.focus(); }, 100),
  });
}

async function buildShare(entry, result, player) {
  toast('正在生成分享图…', 1200);
  const idx = officialIndex(entry);
  // 官方关卡：?lv= 短链接；玩家关卡：关卡码直接压进二维码（纯数字，极致压缩）
  let link = siteUrl() + '?lv=' + entry.id, code = '';
  if (!idx) {
    try { code = await encodeLevel(entry); link = shareLink(code); } catch (e) { link = siteUrl(); }
  }
  const cv = await makeShareCard({ entry, result, qrUrl: link, index: idx, player });
  const url = cv.toDataURL('image/png');
  audio.play('share');
  const who = player || '我';
  const head = result && result.ok
    ? `${who}在《${CONFIG.GAME_NAME}》里用 ${fmtTime(result.time)} 叫醒了一个小伙伴，快来唤醒它吧！`
    : `${player ? player + '邀请你' : ''}来《${CONFIG.GAME_NAME}》唤醒一个沉睡的方块吧！`;
  const text = head;
  modal({
    title: '分享给朋友',
    html: `<img class="share-img" src="${url}" alt="分享图"><p style="font-size:13px;color:var(--ink-soft)">分享图只展示还没唤醒的谜题方块，不会剧透；扫二维码就能直接玩这一关。手机上可以长按图片保存。</p>`,
    actions: [
      { label: '复制链接', ic: 'link', onClick: () => { copyText(head + '\n' + link); return false; } },
      { label: '保存图片', ic: 'download', onClick: async () => { downloadBlob(await canvasToBlob(cv), `wakeup-cubes-${Date.now()}.png`); return false; } },
      { label: '分享', cls: 'pink', ic: 'share', onClick: async () => { const r = await shareCanvas(cv, { title: CONFIG.GAME_NAME, text, url: link, filename: 'wakeup-cubes.png' }); if (r === 'download') toast('已保存图片，发给朋友吧～'); return false; } },
    ],
  });
}

async function shareLevelModal(entry, { justSaved = false } = {}) {
  const code = await encodeLevel(entry);
  const link = shareLink(code);
  modal({
    title: justSaved ? '关卡已发布 ✨' : '分享关卡',
    html: `${justSaved ? '<p>已保存到「玩家关卡」。把下面的链接或关卡码发给朋友，打开就能直接玩！</p>' : ''}
      <p><b style="font-family:var(--font-fun);font-weight:400">分享链接</b></p>
      <div class="codebox">${esc(link)}</div>
      <p style="margin-top:10px"><b style="font-family:var(--font-fun);font-weight:400">关卡码</b> <small style="color:var(--ink-soft)">（在首页「输入关卡码」粘贴即可）</small></p>
      <div class="codebox">${esc(code)}</div>`,
    actions: [
      { label: '复制关卡码', ic: 'copy', onClick: () => { copyText(code); return false; } },
      { label: '复制链接', ic: 'link', onClick: () => { copyText(link); return false; } },
      { label: '生成分享图', cls: 'pink', ic: 'share', onClick: () => { shareResult(entry, null); return false; } },
    ],
  });
}

function sameData(a, b) {
  if (a.w !== b.w || a.h !== b.h || a.d !== b.d || a.voxels.length !== b.voxels.length) return false;
  const key = (L) => L.voxels.map(v => v.join(':')).sort().join('|');
  return key(a) === key(b);
}

async function openSharedCode(input) {
  try {
    const lv = await decodeLevel(input);
    const existing = store.levels().find(l => sameData(l.data, lv.data));
    modal({
      title: '收到一个分享关卡 🎁',
      html: `<p style="text-align:center;font-family:var(--font-fun);font-size:22px;margin:8px 0">「${esc(lv.name)}」</p>
        <p style="text-align:center;color:var(--ink-soft)">${lv.data.w}×${lv.data.h}×${lv.data.d} 体素谜题${lv.author ? ' · 作者 ' + esc(lv.author) : ''}</p>`,
      actions: [
        { label: '稍后再玩', onClick: () => { if (!existing) { store.upsertLevel({ name: lv.name, author: lv.author, diff: 3, official: false, data: lv.data }); toast('已保存到「玩家关卡」'); } } },
        { label: '开始挑战', cls: 'pink', ic: 'play', onClick: () => {
          audio.unlock();
          const saved = existing || store.upsertLevel({ name: lv.name, author: lv.author, diff: 3, official: false, data: lv.data });
          startLevel(saved, { from: 'share' });
        } },
      ],
    });
  } catch (e) {
    toast('关卡码好像不对：' + e.message, 3200);
  }
}

function askCode() {
  modal({
    title: '输入关卡码',
    html: `<p>把朋友发来的关卡码或分享链接粘贴到这里：</p><textarea id="codeInput" placeholder="z..."></textarea>`,
    actions: [{ label: '取消' }, { label: '打开', cls: 'pink', ic: 'play', onClick: () => { const v = $('#codeInput').value; if (!v.trim()) return false; setTimeout(() => openSharedCode(v), 50); } }],
    onOpen: () => setTimeout(() => $('#codeInput') && $('#codeInput').focus(), 100),
  });
}

function showHowto() {
  modal({
    title: '怎么玩？', wide: true,
    html: `<div class="howto">
      <div class="step"><div class="demo">3</div><div><b>数字 = 这一排要留下几个</b><br>方块某一面上的数字，表示垂直穿过这一面的那一整排里，有几块是小伙伴的身体（要保留）。</div></div>
      <div class="step"><div class="demo">4<span class="dots"><i></i><i></i></span></div><div><b>两个圆点 = 分成 2 段</b><br>这 4 块不是连在一起的，中间被隔开成了 2 段；<b>三个紫色圆点</b> = 3 段或更多。</div></div>
      <div class="step"><div class="demo zero">0</div><div><b>0 = 这一排全部敲掉</b><br>从 0 开始是最轻松的入门方法！</div></div>
      <div class="step"><div class="demo ok">${ICON.shield}</div><div><b>敲除 & 保护</b><br>电脑：左键敲掉、右键保护；手机：点击敲掉、长按保护。确定要留的方块先保护起来，就不会误敲啦。敲错会扣一颗心哦。</div></div>
      <div class="step"><div class="demo">${ICON.layers}</div><div><b>切片看里面</b><br>拖动转视角，用 X / Y / Z 滑块一层层剥开外壳，敲掉藏在里面的多余方块。全部敲完小伙伴就会醒来！</div></div>
      <div class="step"><div class="demo">${ICON.vr}</div><div><b>Quest VR</b><br>扳机：敲除（或当前工具）· 侧握键：保护 · A/X 键：切换工具 · 摇杆：旋转方块 · 左侧悬浮面板：切片、选关、回主页、创造关卡、退出。</div></div>
    </div>`,
    actions: [{ label: '明白啦！', cls: 'pink' }],
  });
}

// ---------- 收藏室 ----------
function goCollection(focusId) {
  const done = new Set(store.completedIds());
  const entries = store.levels().filter(l => done.has(l.id));
  app.collection.load(entries);
  app.world.setMode(app.collection);
  showScreen('collection');
  $('#collCount').textContent = `${entries.length} 位小伙伴`;
  $('#collEmpty').classList.toggle('hidden', entries.length > 0);
  $('.coll-bottom').classList.toggle('hidden', entries.length === 0);
  $('#collInfo').innerHTML = '点击小伙伴和它互动～';
  if (focusId) {
    const i = entries.findIndex(e => e.id === focusId);
    if (i >= 0) setTimeout(() => app.collection.poke(i), 500);
  }
}
app.onCollectionSelect = (entry) => {
  const p = store.progress(entry.id);
  $('#collInfo').innerHTML = `<b>${esc(displayName(entry))}</b><br><span style="font-size:13px;color:var(--ink-soft)">${p ? '最佳 ' + fmtTime(p.time) + ' · ' + '★'.repeat(p.stars) : ''}</span>`;
};

// ---------- 造物工坊 ----------
const DRAFT_KEY = 'wakeupcubes.draft.v1';
function goCreator(entry, opts = {}) {
  const cr = app.creator;
  if (entry) cr.loadEntry(entry, !!opts.copy);
  else if (!opts.keep && !cr.loadedOnce) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && d.data) cr.loadEntry(d, false), (cr.doc.id = d.id || null);
    } catch (e) { /* 忽略 */ }
  }
  cr.loadedOnce = true;
  cr.stopPreview();
  app.world.setMode(cr);
  showScreen('creator');
  syncCreatorUI();
}
app.goCreator = goCreator;

function buildCreatorUI() {
  const cr = app.creator;
  const pal = $('#crPalette');
  PALETTE.forEach(p => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = p.c;
    b.title = p.n;
    b.dataset.c = p.c;
    b.onclick = () => { cr.color = p.c; if (cr.tool === 'erase' || cr.tool === 'pick') setCrTool('add'); audio.play('paint'); syncCreatorUI(); };
    pal.appendChild(b);
  });
  const parts = $('#crParts');
  PARTS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'part';
    b.dataset.p = p.id;
    b.innerHTML = `<i style="background:${p.color}"></i><span><b>${p.id} · ${p.n}</b><small>${p.d}</small></span>`;
    b.onclick = () => { cr.part = p.id; audio.play('click'); syncCreatorUI(); };
    parts.appendChild(b);
  });
  ['#crW', '#crH', '#crD'].forEach(sel => {
    const s = $(sel);
    for (let n = 3; n <= 12; n++) s.insertAdjacentHTML('beforeend', `<option value="${n}">${n}</option>`);
    s.onchange = () => { cr.resize(+$('#crW').value, +$('#crH').value, +$('#crD').value); syncCreatorUI(); };
  });
  $$('[data-crtool]').forEach(b => b.onclick = () => { setCrTool(b.dataset.crtool); audio.play('click'); });
  $('#crMirror').onclick = () => { cr.mirror = !cr.mirror; audio.play('click'); syncCreatorUI(); toast(cr.mirror ? '镜像开启：左右对称搭建' : '镜像关闭'); };
  $('#crShowParts').onclick = () => { cr.setShowParts(!cr.showParts); audio.play('click'); syncCreatorUI(); };
  $('#crUndo').onclick = () => cr.undo();
  $('#crRedo').onclick = () => cr.redo();
  $('#crFloor').onclick = () => { cr.fillFloor(); audio.play('place'); };
  $('#crClear').onclick = () => modal({ title: '清空画布？', html: '<p>所有方块都会被清掉（可以撤销）。</p>', actions: [{ label: '取消' }, { label: '清空', cls: 'pink', ic: 'trash', onClick: () => cr.clear() }] });
  $('#crName').oninput = (e) => { cr.doc.name = e.target.value; saveDraft(); };
  $('#crPreview').onclick = () => {
    audio.unlock();
    if (cr.preview) cr.stopPreview();
    else if (!cr.startPreview()) toast('先放几个方块吧～');
    syncCreatorUI();
  };
  $('#crBack').onclick = () => { audio.play('click'); cr.stopPreview(); goHome(); };
  $('#crTest').onclick = () => {
    const err = validateDoc();
    if (err) { toast(err); return; }
    audio.unlock(); audio.play('click');
    const e = cr.toEntry();
    startLevel(e, { from: 'creator', test: true });
  };
  $('#crPublish').onclick = publishDoc;
  $('#crTemplate').onclick = templateModal;
  window.addEventListener('keydown', (e) => {
    if (app.screen !== 'creator' || e.target.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? cr.redo() : cr.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); cr.redo(); }
    else if (e.key === '1') setCrTool('add');
    else if (e.key === '2') setCrTool('erase');
    else if (e.key === '3') setCrTool('paint');
    else if (e.key === '4') setCrTool('pick');
  });
}

function setCrTool(t) { app.creator.tool = t; syncCreatorUI(); }

function syncCreatorUI() {
  const cr = app.creator;
  $('#crName').value = cr.doc.name;
  $('#crW').value = cr.doc.w; $('#crH').value = cr.doc.h; $('#crD').value = cr.doc.d;
  $$('[data-crtool]').forEach(b => b.classList.toggle('active', b.dataset.crtool === cr.tool));
  $('#crMirror').classList.toggle('on', cr.mirror);
  $('#crShowParts').classList.toggle('on', cr.showParts);
  $$('#crPalette .swatch').forEach(b => b.classList.toggle('active', b.dataset.c.toLowerCase() === String(cr.color).toLowerCase()));
  $$('#crParts .part').forEach(b => b.classList.toggle('active', +b.dataset.p === cr.part));
  const st = cr.stats();
  $('#crStats').textContent = `${st.count} 个方块 / ${st.total} 格 · 需要敲掉 ${st.total - st.count} 块`;
  $('#crPreview').lastChild.textContent = cr.preview ? '停止预览' : '预览唤醒动画';
  $('#crUndo').style.opacity = cr.undoStack.length ? 1 : 0.4;
  $('#crRedo').style.opacity = cr.redoStack.length ? 1 : 0.4;
}

let draftTimer = 0;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(app.creator.toEntry())); } catch (e) { /* */ }
  }, 400);
}
app.onCreatorChange = (cr, pickOnly) => { if (app.screen === 'creator') { syncCreatorUI(); if (app.world && app.world.isXR) updateVRPanel(); } if (!pickOnly) saveDraft(); };

function validateDoc() {
  const st = app.creator.stats();
  if (st.count < 2) return '至少放 2 个方块才能做成关卡哦';
  if (st.count >= st.total) return '方块把格子塞满啦，至少留一个需要敲掉的空位';
  return '';
}

async function publishDoc() {
  const err = validateDoc();
  if (err) { toast(err); return; }
  const cr = app.creator;
  const e = cr.toEntry();
  if (!e.author) e.author = store.config.playerName || '';
  if (cr.doc.official && e.id) e.official = true;
  const saved = store.upsertLevel(e);
  cr.doc.id = saved.id;
  saveDraft();
  audio.play('share');
  await shareLevelModal(saved, { justSaved: true });
}

function templateModal() {
  const all = store.levels();
  const html = `<p>选一个作为起点（会复制一份，不会改动原关卡），或者从空白开始：</p>
    <div class="tpl-grid">
      <button class="tpl" data-tpl="blank"><div class="sleepy-cube" style="width:64px;height:64px;border-radius:18px"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div>空白画布</button>
      ${all.map(L => `<button class="tpl" data-tpl="${L.id}"><img alt="" src="${thumbnail(L, 144)}">${esc(L.name)}</button>`).join('')}
    </div>`;
  const m = modal({ title: '从模板开始', wide: true, html, actions: [{ label: '取消' }] });
  $$('.tpl', m.body).forEach(b => b.onclick = () => {
    const id = b.dataset.tpl;
    if (id === 'blank') app.creator.newDoc(+$('#crW').value, +$('#crH').value, +$('#crD').value);
    else app.creator.loadEntry(store.getLevel(id), true);
    app.creator.frameCam();
    syncCreatorUI(); saveDraft();
    audio.play('place');
    m.close();
  });
}

// ---------- 后台 ----------
function goAdmin() {
  app.world.setMode(app.home);
  showScreen('admin');
  renderAdmin();
}

function renderAdmin() {
  const cfg = store.config;
  $('#cfgLives').textContent = cfg.lives;
  $('#cfgCasual').checked = cfg.casual;
  $('#cfgSpeed').value = cfg.animSpeed;
  $('#cfgSpeedV').textContent = Number(cfg.animSpeed).toFixed(2).replace(/0$/, '') + '×';
  $('#cfgSfx').value = cfg.sfxVol;
  $('#cfgBgm').value = cfg.bgmVol;
  $('#cfgName').value = cfg.playerName || '';
  $('#cfgThemes').innerHTML = Object.entries(THEMES).map(([k, t]) =>
    `<button class="theme ${cfg.theme === k ? 'active' : ''}" data-theme="${k}" style="background:linear-gradient(180deg,${t.skyTop},${t.skyBottom});color:${k === 'night' ? '#fff' : 'var(--ink)'}">${t.name}</button>`).join('');
  $$('#cfgThemes .theme').forEach(b => b.onclick = () => { store.setConfig({ theme: b.dataset.theme }); applyTheme(b.dataset.theme); audio.play('click'); renderAdmin(); });
  const dev = document.body.classList.contains('dev');
  $('#adminNow').textContent = '正在播放：' + (store.config.music ? (audio.currentTitle() || '（点击页面后开始播放）') : '音乐已关闭')
    + (dev ? (audio.tracks.length ? `（共 ${audio.tracks.length} 首）` : '（未找到 music/ 曲目，使用内置八音盒）') : '');
  const lv = store.levels();
  const done = store.completedIds().length;
  const stars = Object.values(store.data.progress).reduce((a, p) => a + (p.stars || 0), 0);
  $('#adminStats').innerHTML = `<div><b>${lv.length}</b>关卡总数</div><div><b>${done}</b>已通关</div><div><b>${stars}</b>获得星星</div>`;
  const tb = $('#adminTable');
  tb.innerHTML = '';
  lv.forEach((L, i) => {
    const row = document.createElement('div');
    row.className = 'lrow';
    let img = '';
    try { img = `<img alt="" src="${thumbnail(L, 96)}">`; } catch (e) { img = '<span class="mini"></span>'; }
    row.innerHTML = `<span class="idx">${i + 1}</span>${img}
      <div class="nm"><input value="${esc(L.name)}" maxlength="16"><div class="info">${L.data.w}×${L.data.h}×${L.data.d} · ${L.data.voxels.length} 块<span class="badge ${L.official ? '' : 'c'}">${L.official ? '官方' : '玩家'}</span>${L.author ? ' · ' + esc(L.author) : ''}</div></div>
      <select class="dsel" title="难度">${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${L.diff === d ? 'selected' : ''}>${'★'.repeat(d)}</option>`).join('')}</select>
      <span class="info">${store.progress(L.id) ? '已通关 ' + '★'.repeat(store.progress(L.id).stars) : '未通关'}</span>
      <div class="acts">
        <button data-a="up" title="上移">${ICON.up}</button>
        <button data-a="down" title="下移">${ICON.down}</button>
        <button data-a="play" title="试玩">${ICON.play}</button>
        <button data-a="edit" title="在工坊中编辑">${ICON.edit}</button>
        <button data-a="share" title="分享">${ICON.share}</button>
        <button data-a="official" title="${L.official ? '移到玩家关卡' : '设为官方关卡'}">${L.official ? ICON.star : ICON.sparkle}</button>
        <button data-a="del" class="del" title="删除">${ICON.trash}</button>
      </div>`;
    $('input', row).onchange = (e) => { store.upsertLevel({ ...L, name: e.target.value.trim() || L.name }); toast('已保存名称'); };
    $('select', row).onchange = (e) => { store.upsertLevel({ ...L, diff: +e.target.value }); };
    $$('.acts button', row).forEach(b => b.onclick = () => {
      audio.play('click');
      const a = b.dataset.a;
      if (a === 'up') { store.moveLevel(L.id, -1); renderAdmin(); }
      else if (a === 'down') { store.moveLevel(L.id, 1); renderAdmin(); }
      else if (a === 'play') startLevel(L, { from: 'levels' });
      else if (a === 'edit') goCreator(L);
      else if (a === 'share') shareLevelModal(L);
      else if (a === 'official') { store.upsertLevel({ ...L, official: !L.official }); renderAdmin(); }
      else if (a === 'del') modal({
        title: '删除关卡？', html: `<p>确定删除「${esc(L.name)}」？${L.official ? '（官方关卡可以通过「恢复默认关卡库」找回）' : ''}</p>`,
        actions: [{ label: '取消' }, { label: '删除', cls: 'pink', ic: 'trash', onClick: () => { store.deleteLevel(L.id); renderAdmin(); } }],
      });
    });
    tb.appendChild(row);
  });
}

function bindAdmin() {
  $$('#scr-admin .stepper button').forEach(b => b.onclick = (e) => {
    e.preventDefault();
    const v = Math.max(1, Math.min(9, store.config.lives + +b.dataset.step));
    store.setConfig({ lives: v }); renderAdmin(); audio.play('click');
  });
  $('#cfgCasual').onchange = (e) => { store.setConfig({ casual: e.target.checked }); toast(e.target.checked ? '休闲模式：敲错不扣血' : '标准模式'); };
  $('#cfgSpeed').oninput = (e) => { store.setConfig({ animSpeed: +e.target.value }); $('#cfgSpeedV').textContent = (+e.target.value).toFixed(2).replace(/0$/, '') + '×'; };
  $('#cfgSfx').oninput = (e) => { store.setConfig({ sfxVol: +e.target.value }); audio.setVolumes(store.config.sfxVol, store.config.bgmVol); };
  $('#cfgSfx').onchange = () => audio.play('break');
  $('#cfgBgm').oninput = (e) => { store.setConfig({ bgmVol: +e.target.value }); audio.setVolumes(store.config.sfxVol, store.config.bgmVol); };
  $('#cfgName').onchange = (e) => store.setConfig({ playerName: e.target.value.trim() });
  $('#adminNextTrack').onclick = () => {
    audio.unlock();
    if (!store.config.music) { store.setConfig({ music: true }); audio.setMusic(true); }
    else audio.nextSong();
    setTimeout(renderAdmin, 300);
  };
  $('#adminResetProgress').onclick = () => modal({ title: '清空通关记录？', html: '<p>所有星星和收藏室里的小伙伴都会重新睡着。</p>', actions: [{ label: '取消' }, { label: '清空', cls: 'pink', onClick: () => { store.resetProgress(); renderAdmin(); toast('通关记录已清空'); } }] });
  $('#adminResetLevels').onclick = () => modal({ title: '恢复默认关卡库？', html: '<p>关卡库会恢复为官方关卡，玩家关卡会被移除（建议先导出备份）。</p>', actions: [{ label: '取消' }, { label: '恢复', cls: 'pink', onClick: () => { store.resetLevels(); renderAdmin(); toast('已恢复默认关卡库'); } }] });
  $('#adminNew').onclick = () => { app.creator.newDoc(7, 7, 7); goCreator(null, { keep: true }); };
  $('#adminExport').onclick = () => {
    const pack = store.exportPack();
    const blob = new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' });
    downloadBlob(blob, 'game-pack.json');
    toast('已导出 game-pack.json');
  };
  $('#adminImport').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      modal({
        title: '导入关卡包', html: `<p>文件里有 ${obj.levels ? obj.levels.length : 0} 个关卡。</p>`,
        actions: [
          { label: '追加到关卡库', onClick: () => { const n = store.importPack(obj, 'merge'); renderAdmin(); toast(`已追加 ${n} 个关卡`); } },
          { label: '替换整个关卡库', cls: 'pink', onClick: () => { const n = store.importPack(obj, 'replace'); renderAdmin(); applyTheme(store.config.theme); toast(`已导入 ${n} 个关卡`); } },
        ],
      });
    } catch (err) { toast('导入失败：' + err.message, 3000); }
  };
}

// ---------- VR ----------
// VR 中的菜单状态：main 主菜单 / levels 选关
app.vrMenu = 'main';
app.vrLevelTab = 'official';
app.vrLevelPage = 0;
app.vrTplIndex = -1;

function updateVRPanel() {
  const panel = app.vrPanel;
  if (!panel || !app.world.isXR) return;
  panel.show(true);
  if (app.screen === 'play') vrPlayPanel(panel);
  else if (app.screen === 'collection') {
    panel.set({
      title: '生态收藏室', sub: `${app.collection.items.length} 位`,
      info: '用扳机戳戳小伙伴，它们会跳起来！',
      buttons: [
        ...rowButtons(180, [{ id: 'cprev', label: '◀ 上一位' }, { id: 'cnext', label: '下一位 ▶' }], { h: 100 }),
        ...rowButtons(310, [{ id: 'play', label: '继续闯关', active: true }, { id: 'home', label: '回主页' }], { h: 100 }),
        ...rowButtons(440, [{ id: 'exit', label: '退出 VR', size: 32 }], { h: 80, x0: 300, x1: 724 }),
      ],
    }, onVRPress);
  } else if (app.screen === 'creator') vrCreatorPanel(panel);
  else if (app.vrMenu === 'levels') vrLevelsPanel(panel);
  else {
    const off = store.official();
    const done = off.filter(l => store.progress(l.id)).length;
    panel.set({
      title: CONFIG.GAME_NAME, sub: `${done}/${off.length} 已唤醒`,
      info: '欢迎来到方块岛！选一项开始吧',
      buttons: [
        ...rowButtons(170, [{ id: 'play', label: '继续闯关 ▶', active: true }, { id: 'levels', label: '选择关卡' }], { h: 110 }),
        ...rowButtons(305, [{ id: 'create', label: '创造关卡', active: true, color: '#FFCB3D' }, { id: 'coll', label: '收藏室' }], { h: 110 }),
        ...rowButtons(445, [{ id: 'exit', label: '退出 VR', size: 32 }], { h: 84, x0: 300, x1: 724 }),
      ],
    }, onVRPress);
  }
}

function vrPlayPanel(panel) {
  const info = app.play.stateInfo();
  const e = info.entry;
  const test = app.playCtx && app.playCtx.test;
  const hearts = info.casual ? '休闲模式' : '♥'.repeat(Math.max(0, info.lives)) + '♡'.repeat(Math.max(0, info.maxLives - info.lives));
  if (info.state === 'won' || info.state === 'waking') {
    const r = info.result || { stars: 0, time: 0, mistakes: 0 };
    const nx = nextEntry(e);
    const row1 = test
      ? [{ id: 'backcr', label: '返回工坊', active: true, color: '#FFCB3D' }, { id: 'again', label: '再试一次' }]
      : [{ id: 'next', label: nx ? '下一关 ▶' : '全部完成!', active: !!nx, color: '#4FD6A0' }, { id: 'again', label: '再玩一次' }];
    panel.set({
      title: `「${e.name}」醒啦！`, sub: '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars),
      info: `用时 ${fmtTime(r.time)} · 失误 ${r.mistakes} · 扣扳机戳戳它`,
      buttons: [
        ...rowButtons(180, row1, { h: 110 }),
        ...rowButtons(315, [{ id: 'coll', label: '去收藏室' }, { id: 'home', label: '回主页' }], { h: 100 }),
        ...rowButtons(445, [{ id: 'exit', label: '退出 VR', size: 32 }], { h: 84, x0: 300, x1: 724 }),
      ],
    }, onVRPress);
  } else if (info.state === 'over') {
    panel.set({
      title: '方块又睡着啦…', sub: '', info: '没关系，再来一次！',
      buttons: [
        ...rowButtons(190, [{ id: 'again', label: '再试一次', active: true }, { id: test ? 'backcr' : 'home', label: test ? '返回工坊' : '回主页' }], { h: 120 }),
        ...rowButtons(350, [{ id: 'exit', label: '退出 VR', size: 32 }], { h: 84, x0: 300, x1: 724 }),
      ],
    }, onVRPress);
  } else {
    panel.set({
      title: displayName(e), sub: hearts, height: 740,
      info: `还要敲 ${info.remaining} 块 · ${fmtTime(info.time)} · 切片 X${info.slice[0]} Y${info.slice[1]} Z${info.slice[2]}`,
      buttons: [
        ...rowButtons(165, [
          { id: 'tool:break', label: '敲除 (扳机)', active: info.tool === 'break', color: '#FFCB3D' },
          { id: 'tool:protect', label: '保护 (侧握键)', active: info.tool === 'protect', color: '#4FD6A0' },
        ], { h: 96 }),
        ...rowButtons(282, [
          { id: 's:0:1', label: 'X 剥层', size: 30 }, { id: 's:0:-1', label: 'X 还原', size: 30 },
          { id: 's:1:1', label: 'Y 剥层', size: 30 }, { id: 's:1:-1', label: 'Y 还原', size: 30 },
          { id: 's:2:1', label: 'Z 剥层', size: 30 }, { id: 's:2:-1', label: 'Z 还原', size: 30 },
        ], { h: 84, gap: 10 }),
        ...rowButtons(390, test
          ? [{ id: 'again', label: '重来', size: 32 }, { id: 'backcr', label: '返回工坊', size: 32 }]
          : [{ id: 'prev', label: '◀ 上一关', size: 32 }, { id: 'again', label: '重来', size: 32 }, { id: 'next', label: '下一关 ▶', size: 32 }], { h: 84 }),
        ...rowButtons(498, [{ id: 'levels', label: '选择关卡', size: 32 }, { id: 'home', label: '回主页', size: 32 }], { h: 84 }),
        ...rowButtons(606, [{ id: 'exit', label: '退出 VR', size: 32 }], { h: 80, x0: 300, x1: 724 }),
      ],
    }, onVRPress);
  }
}

function vrLevelsPanel(panel) {
  const list = app.vrLevelTab === 'official' ? store.official() : store.custom();
  const per = 10;
  const pages = Math.max(1, Math.ceil(list.length / per));
  app.vrLevelPage = Math.min(app.vrLevelPage, pages - 1);
  const slice = list.slice(app.vrLevelPage * per, app.vrLevelPage * per + per);
  const btns = [
    ...rowButtons(150, [
      { id: 'tab:official', label: '官方关卡', active: app.vrLevelTab === 'official', size: 32 },
      { id: 'tab:custom', label: '玩家关卡', active: app.vrLevelTab === 'custom', size: 32 },
    ], { h: 76, x0: 200, x1: 824 }),
  ];
  for (let r = 0; r < 2; r++) {
    const row = slice.slice(r * 5, r * 5 + 5).map((L, i) => {
      const p = store.progress(L.id);
      const n = app.vrLevelPage * per + r * 5 + i + 1;
      const showName = p || app.vrLevelTab === 'custom';
      return { id: 'lv:' + L.id, label: (app.vrLevelTab === 'official' ? n + ' ' : '') + (p ? '★'.repeat(p.stars) : ''), sub: showName ? L.name : `${L.data.w}×${L.data.h}×${L.data.d}`, size: 34, active: !!p, color: '#FFB3CB' };
    });
    while (row.length < 5) row.push({ id: 'none' + r + row.length, label: '', sub: '' });
    btns.push(...rowButtons(250 + r * 130, row, { h: 116, gap: 14 }));
  }
  btns.push(...rowButtons(530, [
    { id: 'page:-1', label: '◀ 上一页', size: 30 },
    { id: 'home', label: '回主页', size: 30 },
    { id: 'page:1', label: '下一页 ▶', size: 30 },
  ], { h: 80 }));
  btns.push(...rowButtons(630, [{ id: 'exit', label: '退出 VR', size: 30 }], { h: 74, x0: 300, x1: 724 }));
  panel.set({
    title: '选择关卡', sub: `${app.vrLevelPage + 1}/${pages}`, height: 730,
    info: list.length ? '用扳机点一个关卡开始' : '还没有玩家关卡，去「创造关卡」做一个吧！',
    buttons: btns,
  }, onVRPress);
}

function vrCreatorPanel(panel) {
  const cr = app.creator;
  const st = cr.stats();
  const d = cr.doc;
  const tools = [['add', '添加'], ['erase', '擦除'], ['paint', '上色'], ['pick', '吸管']];
  const btns = [
    ...rowButtons(150, tools.map(([t, n]) => ({ id: 'ct:' + t, label: n, active: cr.tool === t, size: 32 })), { h: 76, gap: 12 }),
  ];
  const sw = PALETTE.map(p => ({ id: 'cc:' + p.c, swatch: p.c, active: p.c.toLowerCase() === String(cr.color).toLowerCase() }));
  btns.push(...rowButtons(244, sw.slice(0, 11), { h: 64, gap: 10 }));
  btns.push(...rowButtons(318, sw.slice(11), { h: 64, gap: 10 }));
  const pn = ['躯干', '左摆', '右摆', '旋转', '弹跳', '漂浮'];
  btns.push(...rowButtons(400, PARTS.map(p => ({ id: 'cp:' + p.id, label: p.id + ' ' + pn[p.id], dot: p.color, active: cr.part === p.id, color: '#B08CF0', size: 26 })), { h: 70, gap: 10 }));
  btns.push(...rowButtons(488, [
    { id: 'cmirror', label: cr.mirror ? '镜像:开' : '镜像:关', active: cr.mirror, color: '#4FD6A0', size: 30 },
    { id: 'cundo', label: '撤销', size: 30 }, { id: 'credo', label: '重做', size: 30 }, { id: 'cclear', label: '清空', size: 30 },
  ], { h: 76, gap: 12 }));
  btns.push(...rowButtons(582, [
    { id: 'csize:-1', label: '尺寸 −', size: 30 }, { id: 'csize:1', label: '尺寸 +', size: 30 },
    { id: 'ctpl', label: '换个模板', size: 30 }, { id: 'cnew', label: '空白画布', size: 30 },
  ], { h: 76, gap: 12 }));
  btns.push(...rowButtons(678, [
    { id: 'cpreview', label: cr.preview ? '停止预览' : '预览唤醒', active: !!cr.preview, color: '#B08CF0', size: 32 },
    { id: 'ctest', label: '试玩', size: 32 },
    { id: 'csave', label: '保存关卡', active: true, color: '#FF7EA6', size: 32 },
  ], { h: 90, gap: 14 }));
  btns.push(...rowButtons(790, [{ id: 'home', label: '回主页', size: 30 }, { id: 'exit', label: '退出 VR', size: 30 }], { h: 76 }));
  panel.set({
    title: '造物工坊 · ' + (d.name || ''), sub: `${st.count} 块`, height: 900,
    info: `${d.w}×${d.h}×${d.d} · 扳机=当前工具 · 侧握键=擦除 · 摇杆=旋转`,
    buttons: btns,
  }, onVRPress);
}

function nextUnfinished() {
  const off = store.official();
  return off.find(l => !store.progress(l.id)) || off[0];
}

function vrSaveCreator() {
  const err = validateDoc();
  if (err) { toast(err); return; }
  const cr = app.creator;
  const e = cr.toEntry();
  if (!e.author) e.author = store.config.playerName || '';
  if (cr.doc.official && e.id) e.official = true;
  const saved = store.upsertLevel(e);
  cr.doc.id = saved.id;
  saveDraft();
  audio.play('share');
  toast('已保存到「玩家关卡」！摘下头显后可在关卡页分享');
}

function onVRPress(id) {
  audio.play('click');
  const cr = app.creator;
  if (id.startsWith('tool:')) setTool(id.slice(5));
  else if (id.startsWith('s:')) {
    const [, ax, d] = id.split(':');
    app.play.setSlice(+ax, app.play.slice[+ax] + +d);
  } else if (id === 'again') { if (app.playCtx) startLevel(app.playCtx.entry, app.playCtx); }
  else if (id === 'next') { const n = nextEntry(app.playCtx && app.playCtx.entry); if (n) startLevel(n, { from: 'levels' }); }
  else if (id === 'prev') { const p = prevEntry(app.playCtx && app.playCtx.entry); if (p) startLevel(p, { from: 'levels' }); }
  else if (id === 'backcr') goCreator(null, { keep: true });
  else if (id === 'coll') goCollection(app.screen === 'play' && app.playCtx && app.playCtx.entry ? app.playCtx.entry.id : undefined);
  else if (id === 'cprev') app.collection.focus(-1);
  else if (id === 'cnext') app.collection.focus(1);
  else if (id === 'play') startLevel(nextUnfinished(), { from: 'home' });
  else if (id === 'home') { app.vrMenu = 'main'; goHome(); }
  else if (id === 'levels') { app.vrMenu = 'levels'; if (app.screen !== 'home') goHome(); app.vrMenu = 'levels'; }
  else if (id.startsWith('tab:')) { app.vrLevelTab = id.slice(4); app.vrLevelPage = 0; }
  else if (id.startsWith('page:')) app.vrLevelPage = Math.max(0, app.vrLevelPage + +id.slice(5));
  else if (id.startsWith('lv:')) { const L = store.getLevel(id.slice(3)); if (L) startLevel(L, { from: 'levels' }); }
  else if (id === 'create') goCreator(null);
  // ---- 工坊 ----
  else if (id.startsWith('ct:')) cr.tool = id.slice(3);
  else if (id.startsWith('cc:')) { cr.color = id.slice(3); if (cr.tool === 'erase' || cr.tool === 'pick') cr.tool = 'add'; }
  else if (id.startsWith('cp:')) cr.part = +id.slice(3);
  else if (id === 'cmirror') cr.mirror = !cr.mirror;
  else if (id === 'cundo') cr.undo();
  else if (id === 'credo') cr.redo();
  else if (id === 'cclear') cr.clear();
  else if (id.startsWith('csize:')) {
    const n = Math.max(3, Math.min(12, Math.max(cr.doc.w, cr.doc.h, cr.doc.d) + +id.slice(6)));
    cr.resize(n, n, n);
    app.world.applyLayout();
  } else if (id === 'ctpl') {
    const all = store.levels();
    if (all.length) {
      app.vrTplIndex = (app.vrTplIndex + 1) % all.length;
      cr.loadEntry(all[app.vrTplIndex], true);
      app.world.applyLayout();
      toast('模板：' + all[app.vrTplIndex].name);
    }
  } else if (id === 'cnew') { cr.newDoc(7, 7, 7); app.world.applyLayout(); }
  else if (id === 'cpreview') { if (cr.preview) cr.stopPreview(); else if (!cr.startPreview()) toast('先放几个方块吧～'); }
  else if (id === 'ctest') { const err = validateDoc(); if (err) toast(err); else startLevel(cr.toEntry(), { from: 'creator', test: true }); }
  else if (id === 'csave') vrSaveCreator();
  else if (id === 'exit') app.world.exitVR();
  if (app.screen === 'creator') syncCreatorUI();
  updateVRPanel();
}

async function enterVR() {
  audio.unlock();
  try { await app.world.enterVR(); } catch (e) { toast('无法进入 VR：' + (e.message || e), 3000); }
}

// ---------- 启动 ----------
async function boot() {
  hydrateIcons();
  // 开发者模式：打开 ?dev=1 开启（只在当前浏览器生效），?dev=0 关闭
  try {
    const dv = new URLSearchParams(location.search).get('dev');
    if (dv === '1') localStorage.setItem('wakeupcubes.dev', '1');
    if (dv === '0') localStorage.removeItem('wakeupcubes.dev');
    document.body.classList.toggle('dev', localStorage.getItem('wakeupcubes.dev') === '1');
  } catch (e) { /* */ }
  const fontWait = Promise.race([
    Promise.all([
      document.fonts.load('800 64px "Baloo 2"'),
      document.fonts.load('40px "ZCOOL KuaiLe"', '醒醒吧方块唤醒成功'),
    ]).catch(() => {}),
    new Promise(r => setTimeout(r, 2500)),
  ]);
  await Promise.all([fontWait, store.init()]);
  buildAtlas();

  app.world = new World($('#gl'));
  app.play = new PlayMode(app);
  app.collection = new CollectionMode(app);
  app.creator = new CreatorMode(app);
  app.home = new HomeMode(app);
  app.vrPanel = new VRPanel(app.world);
  app.world.onXRChange = (on) => {
    app.vrPanel.show(on);
    if (on) updateVRPanel();
    if (app.screen === 'home' && !on) app.home.layout();
  };

  applyTheme(store.config.theme);
  audio.setVolumes(store.config.sfxVol, store.config.bgmVol);
  audio.musicOn = store.config.music;
  audio.loadPlaylist().then(updateMusicBtn);
  audio.onTrackChange = () => { updateMusicBtn(); if (app.screen === 'play') toast('♪ ' + audio.currentTitle(), 1600); };
  window.addEventListener('pointerdown', () => { audio.unlock(); setTimeout(updateMusicBtn, 200); }, { once: true });
  window.addEventListener('resize', () => { if (app.screen === 'home') app.home.layout(); });

  // 按钮绑定
  $('#btnStart').onclick = () => { audio.unlock(); audio.play('click'); goLevels('official'); };
  $('#btnCreate').onclick = () => { audio.unlock(); audio.play('click'); goCreator(null); };
  $('#btnCollection').onclick = () => { audio.unlock(); audio.play('click'); goCollection(); };
  $('#btnCode').onclick = () => { audio.unlock(); audio.play('click'); askCode(); };
  $('#btnHowto').onclick = () => { audio.unlock(); audio.play('click'); showHowto(); };
  $('#btnAdmin').onclick = () => { audio.unlock(); audio.play('click'); goAdmin(); };
  $('#btnMusic').onclick = () => {
    audio.unlock();
    const on = !store.config.music;
    store.setConfig({ music: on });
    audio.setMusic(on);
    audio.play('click');
    updateMusicBtn();
    toast(on ? '音乐开启 ♪' : '音乐关闭');
  };
  $$('[data-back]').forEach(b => b.onclick = () => { audio.play('click'); const t = b.dataset.back; if (t === 'home') goHome(); });
  $$('#levelTabs .tab').forEach(t => t.onclick = () => { audio.play('click'); levelTab = t.dataset.tab; renderLevels(); });
  $('#btnLevelsCreate').onclick = () => { audio.play('click'); goCreator(null); };
  $('#btnEmptyCreate').onclick = () => goCreator(null);
  $('#btnEmptyCode').onclick = askCode;
  $('#btnPlayBack').onclick = () => { audio.play('click'); leavePlay(); };
  $('#btnHelp').onclick = () => { audio.play('click'); showHowto(); };
  $('#btnRestart').onclick = () => { audio.play('click'); startLevel(app.playCtx.entry, app.playCtx); };
  $$('#toolSwitch .tool').forEach(b => b.onclick = () => { audio.unlock(); audio.play('click'); setTool(b.dataset.tool); });
  $$('#slicers .slicer').forEach(s => {
    $('input', s).oninput = (e) => { app.play.setSlice(+s.dataset.axis, +e.target.value); audio.play('hover'); };
  });
  window.addEventListener('keydown', (e) => {
    if (app.screen !== 'play' || e.target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Tab') { e.preventDefault(); setTool(app.play.tool === 'break' ? 'protect' : 'break'); }
    else if (e.key === '1' || e.key.toLowerCase() === 'q') setTool('break');
    else if (e.key === '2' || e.key.toLowerCase() === 'e') setTool('protect');
  });
  $('#btnCollGo').onclick = () => startLevel(nextUnfinished(), { from: 'home' });
  $('#collPrev').onclick = () => app.collection.focus(-1);
  $('#collNext').onclick = () => app.collection.focus(1);
  $('#btnPlayVR').onclick = enterVR;
  $('#btnCollVR').onclick = enterVR;
  $('#btnHomeVR').onclick = async () => { app.vrMenu = 'main'; await enterVR(); };
  $('#crVR').onclick = enterVR;
  buildCreatorUI();
  bindAdmin();
  store.onChange(() => { if (app.screen === 'home') updateHome(); });

  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      app.xrSupported = ok;
      $$('.vr-btn').forEach(b => b.classList.toggle('hidden', !ok));
    }).catch(() => {});
  }

  goHome();
  setTimeout(() => $('#loading').classList.add('out'), 150);
  setTimeout(() => $('#loading').remove(), 900);

  // 打开分享链接
  const params = new URLSearchParams(location.search);
  const share = params.get('c') || params.get('share');
  const lvParam = params.get('lv');
  if (params.has('dev')) history.replaceState(null, '', location.pathname);
  if (lvParam && store.getLevel(lvParam)) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => startLevel(store.getLevel(lvParam), { from: 'home' }), 300);
  } else if (share) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => openSharedCode(share), 600);
  }
}

boot().catch(err => {
  console.error(err);
  const l = $('#loading');
  if (l) l.querySelector('p').textContent = '加载失败了：' + err.message + '（请使用最新版 Chrome / Edge / Safari 打开）';
});
