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
  marimba(note, t = 0, vol = 0.32, dur = 0.5, dest = null) {
    const f = midi(note);
    this.tone({ f, t, dur, vol, type: 'sine', verb: 0.35, dest });
    this.tone({ f: f * 3.99, t, dur: dur * 0.25, vol: vol * 0.28, type: 'sine', verb: 0.2, dest });
    this.tone({ f: f * 2, t, dur: dur * 0.5, vol: vol * 0.12, type: 'triangle', verb: 0.2, dest });
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

  // ---------- 内置程序化 BGM（没有放 Suno 曲目时使用） ----------
  // 三首同风格的小曲：每首播一段时间会自动换下一首；进入关卡时随机挑一首
  procSongs() {
    const S = this;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    return [
      {
        // 1. 八音盒摇篮曲（原曲）
        title: '八音盒摇篮曲', bpm: 84, len: 8,
        chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 65]],
        step(pos, ch, t, bus, eighth) {
          if (pos === 0) ch.slice(0, 3).forEach(n => S.tone({ f: midi(n - 12), t, dur: eighth * 8.5, vol: 0.05, type: 'triangle', attack: 0.4, dest: bus, verb: 0.4 }));
          const arp = [0, 1, 2, 3, 2, 1, 2, 3];
          S.musicbox(ch[arp[pos]] + 12, t, pos % 2 ? 0.05 : 0.075, 1.1, bus);
          if ((pos === 0 || pos === 3 || pos === 6) && Math.random() < 0.55) {
            S.musicbox(72 + pick([0, 2, 4, 7, 9, 12]), t + 0.01, 0.06, 1.6, bus);
          }
        },
      },
      {
        // 2. 星星糖华尔兹：3/4 拍，低音 + “嘭嚓嚓” 八音盒和弦
        title: '星星糖华尔兹', bpm: 92, len: 6,
        chords: [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 58], [53, 57, 60, 64], [45, 48, 52, 55], [46, 50, 53, 57], [48, 52, 55, 60]],
        state: { prev: 72 },
        step(pos, ch, t, bus, eighth) {
          if (pos === 0) {
            S.tone({ f: midi(ch[0] - 12), t, dur: eighth * 3, vol: 0.09, type: 'sine', attack: 0.01, dest: bus, verb: 0.2 });
            ch.slice(0, 3).forEach(n => S.tone({ f: midi(n), t, dur: eighth * 6.4, vol: 0.03, type: 'triangle', attack: 0.5, dest: bus, verb: 0.4 }));
          }
          if (pos === 2 || pos === 4) {
            S.musicbox(ch[1] + 12, t, 0.04, 0.8, bus);
            S.musicbox(ch[2] + 12, t + 0.008, 0.035, 0.8, bus);
          }
          if (pos === 5 && Math.random() < 0.3) S.musicbox(ch[3] + 12, t, 0.035, 0.7, bus);
          // 旋律：沿音阶小步走动，更像在哼歌
          if ((pos === 0 && Math.random() < 0.8) || (pos === 3 && Math.random() < 0.4)) {
            const scale = [65, 67, 69, 72, 74, 77, 79, 81];
            const near = scale.filter(n => Math.abs(n - this.state.prev) <= 5);
            const n = pick(near.length ? near : scale);
            this.state.prev = n;
            S.musicbox(n, t + 0.01, 0.075, pos === 0 ? 2 : 1.3, bus);
          }
        },
      },
      {
        // 3. 泡泡散步：轻快的木琴琶音 + 沙锤 + 八音盒点缀
        title: '泡泡散步', bpm: 100, len: 8,
        chords: [[55, 59, 62, 66], [52, 55, 59, 62], [48, 52, 55, 59], [50, 54, 57, 60], [55, 59, 62, 67], [52, 55, 59, 64], [45, 48, 52, 55], [50, 54, 57, 62]],
        step(pos, ch, t, bus, eighth) {
          if (pos === 0 || pos === 4) S.tone({ f: midi(ch[0] - 12 + (pos === 4 ? 7 : 0)), t, dur: eighth * 1.6, vol: 0.08, type: 'sine', attack: 0.005, dest: bus, verb: 0.1 });
          const arp = [0, 2, 1, 3, 2, 1, 3, 2];
          S.marimba(ch[arp[pos]] + 12, t, pos % 2 ? 0.035 : 0.05, 0.35, bus);
          if (pos % 2 === 1) S.noise({ t, dur: 0.04, vol: 0.018, freq: 7500, q: 0.7, type: 'highpass', dest: bus });
          if ((pos === 0 || pos === 2 || pos === 5) && Math.random() < 0.42) {
            S.musicbox(pick([79, 81, 83, 86, 88, 91]), t + 0.01, 0.05, 1.2, bus);
          }
        },
      },
    ];
  }

  startProc(songIdx) {
    if (!this.ctx) return;
    if (!this.songs) this.songs = this.procSongs();
    if (songIdx === undefined) songIdx = this.procSong || 0;
    if (this.proc && this.proc.idx === songIdx) return;
    this.stopProc();
    this.procSong = songIdx;
    const song = this.songs[songIdx];
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.music);
    bus.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2);
    const eighth = 60 / song.bpm / 2;
    let step = 0, next = ctx.currentTime + 0.3;
    const maxBars = 32; // 大约一两分钟后换下一首
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        const barN = Math.floor(step / song.len);
        if (barN >= maxBars) { this.startProc((songIdx + 1) % this.songs.length); return; }
        const ch = song.chords[barN % song.chords.length];
        song.step(step % song.len, ch, next - ctx.currentTime, bus, eighth);
        step++;
        next += eighth;
      }
    };
    const iv = setInterval(tick, 90);
    this.proc = { bus, iv, idx: songIdx };
    tick();
    if (this.onTrackChange) this.onTrackChange();
  }

  // 进入关卡时随机换一首（和当前不同）
  shuffle() {
    if (!this.ready || !this.musicOn) return;
    if (this.tracks.length) {
      if (this.tracks.length < 2) return;
      let i;
      do { i = Math.floor(Math.random() * this.tracks.length); } while (i === this.trackIdx);
      this.trackIdx = (i - 1 + this.tracks.length) % this.tracks.length;
      this.nextTrack(true);
    } else {
      if (!this.songs) this.songs = this.procSongs();
      let i;
      do { i = Math.floor(Math.random() * this.songs.length); } while (i === this.procSong && this.songs.length > 1);
      this.startProc(i);
    }
  }

  nextSong() {
    if (this.tracks.length) this.nextTrack(true);
    else { if (!this.songs) this.songs = this.procSongs(); this.startProc(((this.procSong || 0) + 1) % this.songs.length); }
  }

  stopProc() {
    if (!this.proc) return;
    const { bus, iv } = this.proc;
    clearInterval(iv);
    this.proc = null;
    try { bus.gain.cancelScheduledValues(this.ctx.currentTime); bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3); } catch (e) { /* */ }
    setTimeout(() => bus.disconnect(), 1500);
    this.proc = null;
  }

  currentTitle() {
    if (!this.musicOn) return '';
    if (this.tracks.length && this.trackIdx >= 0) return this.tracks[this.trackIdx].title;
    if (!this.songs) this.songs = this.procSongs();
    return this.songs[this.procSong || 0].title;
  }
}

export const audio = new AudioSystem();
