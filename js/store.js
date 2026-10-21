// 本地存储：全局配置 / 关卡库 / 通关进度
// 纯前端：数据保存在玩家浏览器的 localStorage。
// 站长可在后台导出 JSON 并保存为 data/game-pack.json，所有玩家打开网站时都会用这份关卡库。
import { buildOfficialLevels } from './levels.js';

const KEY = 'wakeupcubes.save.v1';

export const DEFAULT_CONFIG = {
  lives: 3,
  casual: false,
  animSpeed: 1,
  theme: 'peach',
  bgmVol: 0.55,
  sfxVol: 0.8,
  music: true,
  playerName: '',
};

function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function sanitizeLevel(L, i) {
  const d = L.data || {};
  return {
    id: String(L.id || uid()),
    name: String(L.name || '无名关卡').slice(0, 24),
    diff: Math.min(5, Math.max(1, L.diff | 0 || 1)),
    official: !!L.official,
    author: String(L.author || '').slice(0, 16),
    createdAt: L.createdAt || Date.now(),
    order: i,
    data: { w: d.w | 0, h: d.h | 0, d: d.d | 0, voxels: (d.voxels || []).map(v => [v[0] | 0, v[1] | 0, v[2] | 0, String(v[3]), (v[4] | 0) % 6]) },
  };
}

export const store = {
  data: null,
  pack: null,
  listeners: new Set(),

  async init() {
    try {
      const res = await fetch('data/game-pack.json', { cache: 'no-cache' });
      if (res.ok) {
        const j = await res.json();
        if (j && Array.isArray(j.levels) && j.levels.length) this.pack = j;
      }
    } catch (e) { /* 没有关卡包时使用内置关卡 */ }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || !Array.isArray(saved.levels)) {
      this.data = this.fresh();
    } else {
      this.data = {
        packId: saved.packId || 'builtin',
        config: { ...DEFAULT_CONFIG, ...(saved.config || {}) },
        levels: saved.levels.map(sanitizeLevel),
        progress: saved.progress || {},
        lastPlayed: saved.lastPlayed || null,
      };
      const pid = this.pack ? String(this.pack.packId || 'pack') : 'builtin';
      if (pid !== this.data.packId) this.mergeOfficial();
    }
    this.save();
  },

  officialSource() {
    if (this.pack) return this.pack.levels.map(sanitizeLevel);
    return buildOfficialLevels().map(sanitizeLevel);
  },

  fresh() {
    const cfg = { ...DEFAULT_CONFIG, ...(this.pack && this.pack.config ? this.pack.config : {}) };
    return {
      packId: this.pack ? String(this.pack.packId || 'pack') : 'builtin',
      config: cfg,
      levels: this.officialSource(),
      progress: {},
      lastPlayed: null,
    };
  },

  // 官方关卡包更新时：替换官方关卡，保留玩家自建关卡
  mergeOfficial() {
    const custom = this.data.levels.filter(l => !l.official);
    const off = this.officialSource();
    this.data.levels = [...off, ...custom].map(sanitizeLevel);
    this.data.packId = this.pack ? String(this.pack.packId || 'pack') : 'builtin';
    if (this.pack && this.pack.config) this.data.config = { ...this.data.config, ...this.pack.config };
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('存档失败', e); }
    this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  get config() { return this.data.config; },
  setConfig(patch) { Object.assign(this.data.config, patch); this.save(); },

  levels() { return this.data.levels; },
  official() { return this.data.levels.filter(l => l.official); },
  custom() { return this.data.levels.filter(l => !l.official); },
  getLevel(id) { return this.data.levels.find(l => l.id === id) || null; },

  upsertLevel(entry) {
    const i = this.data.levels.findIndex(l => l.id === entry.id);
    const clean = sanitizeLevel({ ...entry, id: entry.id || uid() }, i >= 0 ? i : this.data.levels.length);
    if (i >= 0) this.data.levels[i] = clean; else this.data.levels.push(clean);
    this.save();
    return clean;
  },
  deleteLevel(id) {
    this.data.levels = this.data.levels.filter(l => l.id !== id);
    delete this.data.progress[id];
    this.save();
  },
  moveLevel(id, dir) {
    const arr = this.data.levels;
    const i = arr.findIndex(l => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    arr.forEach((l, k) => { l.order = k; });
    this.save();
  },

  progress(id) { return this.data.progress[id] || null; },
  setProgress(id, rec) {
    const old = this.data.progress[id];
    const best = old ? {
      stars: Math.max(old.stars, rec.stars),
      time: Math.min(old.time, rec.time),
      mistakes: Math.min(old.mistakes, rec.mistakes),
      at: Date.now(),
      plays: (old.plays || 1) + 1,
    } : { ...rec, at: Date.now(), plays: 1 };
    this.data.progress[id] = best;
    this.data.lastPlayed = id;
    this.save();
    return best;
  },
  completedIds() { return Object.keys(this.data.progress).filter(id => this.getLevel(id)); },

  exportPack() {
    return {
      format: 'wakeupcubes-pack',
      version: 1,
      packId: 'pack-' + Date.now().toString(36),
      exportedAt: new Date().toISOString(),
      config: { ...this.data.config },
      levels: this.data.levels.map(l => ({ ...l, official: true })),
    };
  },
  importPack(obj, mode = 'replace') {
    if (!obj || !Array.isArray(obj.levels)) throw new Error('不是有效的关卡包 JSON');
    const lv = obj.levels.map(sanitizeLevel).filter(l => l.data.voxels.length && l.data.w && l.data.h && l.data.d);
    if (!lv.length) throw new Error('关卡包里没有可用的关卡');
    if (mode === 'replace') this.data.levels = lv;
    else {
      const ids = new Set(this.data.levels.map(l => l.id));
      lv.forEach(l => { if (ids.has(l.id)) l.id = uid(); this.data.levels.push(l); });
    }
    if (obj.config && mode === 'replace') this.data.config = { ...this.data.config, ...obj.config };
    this.data.levels.forEach((l, k) => { l.order = k; });
    this.save();
    return lv.length;
  },
  resetLevels() { this.data.levels = this.officialSource(); this.save(); },
  resetProgress() { this.data.progress = {}; this.data.lastPlayed = null; this.save(); },
  newId: uid,
};
