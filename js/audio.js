// 声音系统：Web Audio 合成音效 + 背景音乐（Suno 曲目 / 程序化八音盒兜底）

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.bgmVol = 0.55;
    this.musicOn = true;
    this.scene = 'home';
    this.tracks = [];
    this.trackIdx = -1;
    this.el = null;
    this.breakStep = 0;
    this.proc = null;
    this.ready = false;
    this.loaded = false;
  }

  // 必须在用户手势中调用
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.bgmVol * 0.5;
      this.music.connect(this.master);
      // 轻微混响让声音更柔和
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this.makeImpulse(1.6);
      const vg = this.ctx.createGain(); vg.gain.value = 0.22;
      this.verb.connect(vg); vg.connect(this.master);
      this.mverb = this.ctx.createConvolver();
      this.mverb.buffer = this.verb.buffer;
      const mg = this.ctx.createGain(); mg.gain.value = 0.3;
      this.mverb.connect(mg); mg.connect(this.music);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.ready) { this.ready = true; this.applyMusic(); }
  }

  makeImpulse(sec) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  setVolumes(sfx, bgm) {
    this.sfxVol = sfx; this.bgmVol = bgm;
    if (this.sfx) this.sfx.gain.value = sfx;
    if (this.music) this.music.gain.value = bgm * 0.5;
    if (this.el) this.el.volume = Math.min(1, bgm);
  }

  // ---------- 合成音色 ----------
  tone({ f = 440, type = 'sine', t = 0, dur = 0.3, vol = 0.3, attack = 0.005, f2 = null, dest = null, verb = 0.3, detune = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime + t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, now);
    o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur * 0.8);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(dest || this.sfx);
    if (verb > 0) { const s = ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(dest ? this.mverb : this.verb); }
    o.start(now); o.stop(now + dur + 0.05);
  }

  noise({ t = 0, dur = 0.08, vol = 0.2, freq = 3000, q = 1.2, type = 'bandpass', dest = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime + t;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(flt); flt.connect(g); g.connect(dest || this.sfx);
    src.start(now);
  }

  // 木琴音色：基频 + 高次泛音快速衰减
  marimba(note, t = 0, vol = 0.32, dur = 0.5) {
    const f = midi(note);
    this.tone({ f, t, dur, vol, type: 'sine', verb: 0.35 });
    this.tone({ f: f * 3.99, t, dur: dur * 0.25, vol: vol * 0.28, type: 'sine', verb: 0.2 });
    this.tone({ f: f * 2, t, dur: dur * 0.5, vol: vol * 0.12, type: 'triangle', verb: 0.2 });
  }
  musicbox(note, t = 0, vol = 0.22, dur = 1.4, dest = null) {
    const f = midi(note);
    this.tone({ f, t, dur, vol, type: 'sine', verb: 0.5, dest });
    this.tone({ f: f * 4, t, dur: dur * 0.3, vol: vol * 0.25, type: 'sine', verb: 0.4, dest });
    this.tone({ f: f * 6.02, t, dur: dur * 0.15, vol: vol * 0.08, type: 'sine', verb: 0.3, dest });
  }

  play(name, opt = {}) {
    if (!this.ctx) return;
    switch (name) {
      case 'click':
        this.tone({ f: 620, f2: 980, dur: 0.09, vol: 0.18, verb: 0.1 });
        break;
      case 'hover':
        this.tone({ f: 1600, dur: 0.04, vol: 0.03, verb: 0 });
        break;
      case 'break': {
        const n = 72 + PENTA[this.breakStep % PENTA.length];
        this.breakStep = (this.breakStep + (Math.random() < 0.7 ? 1 : 2)) % PENTA.length;
        this.marimba(n, 0, 0.3, 0.45);
        this.noise({ dur: 0.05, vol: 0.12, freq: 4200, q: 0.8 });
        this.tone({ f: 260, f2: 120, dur: 0.08, vol: 0.12, type: 'triangle', verb: 0 });
        break;
      }
      case 'protect':
        this.tone({ f: 420, f2: 820, dur: 0.18, vol: 0.2, verb: 0.3 });
        this.tone({ f: 630, f2: 1230, t: 0.05, dur: 0.16, vol: 0.12, verb: 0.3 });
        break;
      case 'unprotect':
        this.tone({ f: 820, f2: 420, dur: 0.16, vol: 0.16, verb: 0.2 });
        break;
      case 'bonk':
        this.tone({ f: 300, f2: 260, dur: 0.12, vol: 0.18, type: 'triangle', verb: 0.1 });
        break;
      case 'error':
        this.tone({ f: 330, f2: 300, dur: 0.22, vol: 0.2, type: 'triangle', verb: 0.2 });
        this.tone({ f: 247, f2: 220, t: 0.16, dur: 0.3, vol: 0.22, type: 'triangle', verb: 0.2 });
        this.tone({ f: 180, f2: 90, dur: 0.25, vol: 0.12, type: 'square', verb: 0 });
        break;
      case 'win': {
        const seq = [72, 76, 79, 84, 88, 91];
        seq.forEach((n, i) => this.musicbox(n, i * 0.11, 0.24, 1.6));
        [72, 76, 79, 84].forEach(n => this.musicbox(n, 0.8, 0.16, 2.6));
        this.musicbox(96, 0.8, 0.1, 2.2);
        break;
      }
      case 'gameover':
        [76, 72, 67, 64].forEach((n, i) => this.musicbox(n, i * 0.18, 0.18, 1.2));
        break;
      case 'jump':
        this.tone({ f: 220, f2: 660, dur: 0.22, vol: 0.2, verb: 0.2 });
        this.tone({ f: 660, f2: 440, t: 0.18, dur: 0.18, vol: 0.12, verb: 0.2 });
        break;
      case 'place':
        this.marimba(79 + (opt.pitch || 0), 0, 0.18, 0.25);
        break;
      case 'erase':
        this.tone({ f: 500, f2: 260, dur: 0.1, vol: 0.14, type: 'triangle', verb: 0.1 });
        break;
      case 'paint':
        this.tone({ f: 900, f2: 1300, dur: 0.08, vol: 0.12, verb: 0.2 });
        break;
      case 'share':
        [84, 88, 91].forEach((n, i) => this.musicbox(n, i * 0.07, 0.16, 0.8));
        break;
      default: break;
    }
  }

  // ---------- 背景音乐 ----------
  async loadPlaylist() {
    let tracks = [];
    try {
      const res = await fetch('music/playlist.json', { cache: 'no-cache' });
      if (res.ok) {
        const j = await res.json();
        tracks = (j.tracks || []).filter(t => t && t.file).map(t => ({
          file: 'music/' + String(t.file).replace(/^music\//, ''),
          title: t.title || t.file,
          scenes: Array.isArray(t.scenes) && t.scenes.length ? t.scenes : ['any'],
        }));
      }
    } catch (e) { /* 忽略 */ }
    if (!tracks.length) {
      // 没写 playlist 时，自动探测 music/bgm1.mp3 ~ bgm8.mp3
      const probes = [];
      for (let i = 1; i <= 8; i++) {
        const file = `music/bgm${i}.mp3`;
        probes.push(fetch(file, { method: 'HEAD' }).then(r => (r.ok ? { file, title: `BGM ${i}`, scenes: ['any'] } : null)).catch(() => null));
      }
      tracks = (await Promise.all(probes)).filter(Boolean);
    }
    this.tracks = tracks;
    this.loaded = true;
    if (this.ready) this.applyMusic();
  }

  setMusic(on) { this.musicOn = on; this.applyMusic(); }

  setScene(scene) {
    if (this.scene === scene) return;
    this.scene = scene;
    if (!this.ready || !this.musicOn) return;
    const cur = this.tracks[this.trackIdx];
    if (this.tracks.length && cur && !this.allowed(cur)) this.nextTrack(true);
  }

  allowed(t) { return t.scenes.includes('any') || t.scenes.includes(this.scene); }

  applyMusic() {
    if (!this.ready) return;
    if (!this.musicOn) { this.stopTrack(); this.stopProc(); return; }
    if (!this.loaded) return;
    if (this.tracks.length) { this.stopProc(); if (!this.el || this.el.paused) this.nextTrack(false); }
    else this.startProc();
  }

  nextTrack(fade) {
    const list = this.tracks.map((t, i) => i).filter(i => this.allowed(this.tracks[i]));
    const pool = list.length ? list : this.tracks.map((t, i) => i);
    let idx = pool[(pool.indexOf(this.trackIdx) + 1) % pool.length];
    if (idx === undefined) idx = pool[0];
    this.trackIdx = idx;
    const t = this.tracks[idx];
    const start = () => {
      if (!this.el) {
        this.el = new Audio();
        this.el.preload = 'auto';
        this.el.addEventListener('ended', () => this.nextTrack(false));
        this.el.addEventListener('error', () => {
          // 文件不存在：从列表移除，必要时回退到八音盒
          this.tracks.splice(this.trackIdx, 1);
          if (this.tracks.length) this.nextTrack(false); else { this.stopTrack(); this.startProc(); }
        });
      }
      this.el.src = t.file;
      this.el.volume = Math.min(1, this.bgmVol);
      this.el.play().catch(() => {});
    };
    if (fade && this.el && !this.el.paused) {
      const el = this.el, v0 = el.volume;
      let k = 0;
      const iv = setInterval(() => {
        k++; el.volume = Math.max(0, v0 * (1 - k / 10));
        if (k >= 10) { clearInterval(iv); start(); }
      }, 50);
    } else start();
  }

  stopTrack() { if (this.el) { this.el.pause(); } }

  // 程序化八音盒组曲（没有放 Suno 曲目时的默认 BGM）
  // 结构：前奏 → A → B → A' → C(间奏) → B → A → 尾声，约 2 分 40 秒后才循环
  startProc() {
    if (this.proc || !this.ctx) return;
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.music);
    bus.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2);
    const CH = {
      C: [60, 64, 67, 71], Am: [57, 60, 64, 67], F: [53, 57, 60, 64], G: [55, 59, 62, 65],
      Dm: [50, 53, 57, 60], Em: [52, 55, 59, 62], Fm: [53, 56, 60, 63], Gs: [55, 59, 62, 67],
    };
    const SEC = {
      intro: { ch: ['C', 'F', 'C', 'G'], style: 'intro' },
      A: { ch: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'], style: 'A', seed: 11 },
      A2: { ch: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'Gs'], style: 'A', seed: 11, vary: 29 },
      B: { ch: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], style: 'B', seed: 47 },
      C: { ch: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Fm', 'G'], style: 'C', seed: 83 },
      outro: { ch: ['F', 'G', 'C', 'C'], style: 'outro', seed: 5 },
    };
    const form = ['intro', 'A', 'B', 'A2', 'C', 'B', 'A', 'outro'];
    const bars = [];
    form.forEach(name => SEC[name].ch.forEach((c, i) => bars.push({ sec: SEC[name], name, chord: CH[c], i })));
    const bpm = 80, eighth = 60 / bpm / 2;
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const RHY = [[0, 2, 4, 6], [0, 3, 4], [0, 2, 3, 4, 6], [0, 4, 6], [0, 1, 2, 4], [0, 6]];
    const melCache = new Map();
    // 旋律：以 4 小节为乐句重复，靠近上一个音，强拍落在和弦音上
    const melody = (bar) => {
      const sec = bar.sec;
      if (!sec.seed) return [];
      let phraseBar = bar.i % 4;
      let seed = sec.seed * 100 + phraseBar;
      if (sec.vary && bar.i >= 4) seed += sec.vary;
      if (bar.i >= 4 && phraseBar === 3) seed += 7; // 第二句结尾不同
      const key = seed + ':' + bar.chord.join(',');
      if (melCache.has(key)) return melCache.get(key);
      const r = rng(seed);
      const rhy = sec.style === 'C' ? [0, 4] : RHY[Math.floor(r() * (phraseBar === 3 ? 2 : RHY.length))];
      const base = sec.style === 'B' ? 76 : 72;
      let prev = base + 4;
      const out = rhy.map((pos, k) => {
        let n;
        if (pos === 0 || pos === 4) {
          const tones = bar.chord.map(c => { let x = c; while (x < base - 2) x += 12; while (x > base + 12) x -= 12; return x; });
          tones.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
          n = tones[Math.floor(r() * 2)];
        } else {
          const deg = SCALE.map(s => base - 12 + s).concat(SCALE.map(s => base + s), SCALE.map(s => base + 12 + s));
          const near = deg.filter(d => Math.abs(d - prev) <= 4 && d !== prev);
          n = near[Math.floor(r() * near.length)] || prev;
        }
        prev = n;
        const nextPos = k + 1 < rhy.length ? rhy[k + 1] : 8;
        return { pos, n, len: nextPos - pos };
      });
      melCache.set(key, out);
      return out;
    };
    let barIdx = 0, step = 0, next = ctx.currentTime + 0.2;
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        const bar = bars[barIdx];
        const st = bar.sec.style;
        const ch = bar.chord;
        const t = next - ctx.currentTime;
        const pos = step;
        const fade = st === 'outro' ? 1 - (bar.i / 4) * 0.5 : 1;
        if (pos === 0) {
          const padVol = st === 'C' ? 0.065 : st === 'intro' ? 0.06 : 0.045;
          ch.slice(0, 3).forEach(n => this.tone({ f: midi(n - 12), t, dur: eighth * 8.6, vol: padVol * fade, type: 'triangle', attack: 0.5, dest: bus, verb: 0.4 }));
        }
        // 低音
        if (st !== 'intro' && st !== 'C' && (pos === 0 || pos === 4)) {
          this.tone({ f: midi(ch[0] - 24 + (pos === 4 && st === 'B' ? 7 : 0)), t, dur: eighth * 3.5, vol: 0.09 * fade, type: 'sine', attack: 0.02, dest: bus, verb: 0.1 });
        }
        // 琶音
        const arpA = [0, 1, 2, 3, 2, 1, 2, 3];
        const arpB = [0, 2, 1, 3, 0, 2, 1, 3];
        if (st === 'intro') { if (pos % 2 === 0) this.musicbox(ch[(pos / 2) % 4] + 12, t, 0.06, 1.3, bus); }
        else if (st === 'C') { if (pos === 0 || pos === 3 || pos === 6) this.musicbox(ch[pos % 4] + 12, t, 0.045, 1.8, bus); }
        else {
          const arp = st === 'B' ? arpB : arpA;
          this.musicbox(ch[arp[pos]] + 12, t, (pos % 2 ? 0.045 : 0.065) * fade, 1.1, bus);
        }
        // 沙锤（B 段反拍）
        if (st === 'B' && pos % 2 === 1) this.noise({ t, dur: 0.05, vol: 0.025, freq: 7000, q: 0.7, type: 'highpass', dest: bus });
        // 旋律
        for (const m of melody(bar)) {
          if (m.pos === pos) this.musicbox(m.n, t + 0.005, (st === 'C' ? 0.075 : 0.085) * fade, Math.max(0.9, m.len * eighth * 1.6), bus);
        }
        step++;
        if (step >= 8) { step = 0; barIdx = (barIdx + 1) % bars.length; }
        next += eighth;
      }
    };
    const iv = setInterval(tick, 90);
    tick();
    this.proc = { bus, iv };
  }

  stopProc() {
    if (!this.proc) return;
    const { bus, iv } = this.proc;
    clearInterval(iv);
    try { bus.gain.cancelScheduledValues(this.ctx.currentTime); bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3); } catch (e) { /* */ }
    setTimeout(() => bus.disconnect(), 1500);
    this.proc = null;
  }

  currentTitle() {
    if (!this.musicOn) return '';
    if (this.tracks.length && this.trackIdx >= 0) return this.tracks[this.trackIdx].title;
    return '方块岛八音盒组曲（内置）';
  }
}

export const audio = new AudioSystem();
