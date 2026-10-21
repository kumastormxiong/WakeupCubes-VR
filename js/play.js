// 解谜模式：敲除 / 保护 / 切片 / 唤醒
import * as THREE from 'three';
import { BLOCK, computeClues, gridRaycast, rayToGrid, makeVoxelMaterial, getBlockGeometry, getFrameGeometry, VoxelModel } from './voxel.js';
import { PUZZLE, PALETTE } from './palette.js';
import { Particles, Sleepy, Cheer } from './fx.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _c2 = new THREE.Color();
const COL = {
  base: new THREE.Color(PUZZLE.base), hb: new THREE.Color(PUZZLE.hoverBreak), hp: new THREE.Color(PUZZLE.hoverProtect),
  prot: new THREE.Color(PUZZLE.protect), err: new THREE.Color(PUZZLE.error),
};
const CONFETTI = PALETTE.slice(2, 19).map(p => p.c);

export class PlayMode {
  constructor(app) {
    this.app = app;
    this.particles = new Particles(400);
    this.sleepy = new Sleepy();
    this.cheer = new Cheer();
    this.tool = 'break';
    this.root = new THREE.Group();
    this.state = 'idle';
  }

  load(entry, opts = {}) {
    this.dispose();
    this.entry = entry;
    const L = entry.data;
    const W = this.W = L.w, H = this.H = L.h, D = this.D = L.d;
    const N = this.N = W * H * D;
    this.casual = !!opts.casual;
    this.maxLives = this.casual ? 0 : Math.max(1, opts.lives | 0 || 3);
    this.lives = this.maxLives;
    this.speed = opts.speed || 1;
    this.mistakes = 0;
    this.slice = [0, 0, 0];
    this.hover = -1;
    this.anims = [];
    this.flash = new Map();
    this.shake = 0;
    this.model = null;
    this.state = 'playing';
    this.startTime = performance.now();
    this.elapsed = 0;

    this.cells = new Array(N);
    for (let i = 0; i < N; i++) this.cells[i] = { t: false, color: null, part: 0, alive: true, prot: false };
    for (const v of L.voxels) {
      const i = this.idx(v[0], v[1], v[2]);
      if (i < 0 || i >= N) continue;
      Object.assign(this.cells[i], { t: true, color: new THREE.Color(v[3]), part: v[4] });
    }
    this.total = this.cells.filter(c => !c.t).length;
    this.remaining = this.total;

    const clues = computeClues(W, H, D, (x, y, z) => this.cells[this.idx(x, y, z)].t);
    const geo = getBlockGeometry().clone();
    geo.setAttribute('aClue', new THREE.InstancedBufferAttribute(clues, 3));
    this.mat = makeVoxelMaterial(1);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.frames = new THREE.InstancedMesh(getFrameGeometry(), new THREE.MeshBasicMaterial({ color: PUZZLE.frame, transparent: true, opacity: 0.9 }), N);
    this.frames.frustumCulled = false;
    this.frames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Array(N);
    for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y, z);
      this.pos[i] = new THREE.Vector3(x - (W - 1) / 2, y - (H - 1) / 2, z - (D - 1) / 2);
    }
    this.puzzle = new THREE.Group();
    this.puzzle.add(this.mesh, this.frames);
    this.root = new THREE.Group();
    this.root.add(this.puzzle, this.particles.mesh, this.sleepy.group);
    this.sleepy.group.position.set(W / 2 - 0.5, H / 2 + 0.6, 0);
    this.sleepy.group.visible = true;
    this.particles.clear();
    this.refreshAll();
    this.emit();
  }

  idx(x, y, z) { return x + this.W * (y + this.H * z); }
  xyz(i) { const W = this.W, H = this.H; return [i % W, Math.floor(i / W) % H, Math.floor(i / (W * H))]; }

  visible(i) {
    const c = this.cells[i];
    if (!c.alive) return false;
    const [x, y, z] = this.xyz(i);
    return x < this.W - this.slice[0] && y < this.H - this.slice[1] && z < this.D - this.slice[2];
  }

  colorOf(i) {
    const c = this.cells[i];
    const f = this.flash.get(i);
    if (f !== undefined) return _c.copy(COL.err).lerp(c.prot ? COL.prot : COL.base, Math.min(1, f / 0.6));
    if (i === this.hover && this.state === 'playing') return _c.copy(this.tool === 'protect' ? COL.hp : COL.hb);
    return _c.copy(c.prot ? COL.prot : COL.base);
  }

  writeInstance(i) {
    const vis = this.visible(i);
    let s = vis ? 1 : 0;
    const a = this.anims.find(q => q.i === i);
    if (a) {
      const u = a.t / 0.22;
      s = u < 0.3 ? 1 + u * 0.8 : Math.max(0, 1.24 * (1 - (u - 0.3) / 0.7));
    }
    _m.compose(this.pos[i], _q.identity(), _s.set(s, s, s));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.setColorAt(i, this.colorOf(i));
    this.framesDirty = true;
  }

  // 保护框只绘制实际被保护的方块（紧凑排列，省 GPU）
  writeFrames() {
    let k = 0;
    if (this.state === 'playing') {
      for (let i = 0; i < this.N; i++) {
        if (this.cells[i].prot && this.visible(i)) { _m.makeTranslation(this.pos[i].x, this.pos[i].y, this.pos[i].z); this.frames.setMatrixAt(k++, _m); }
      }
    }
    this.frames.count = k;
    this.frames.instanceMatrix.needsUpdate = true;
    this.framesDirty = false;
  }

  refreshAll() {
    for (let i = 0; i < this.N; i++) this.writeInstance(i);
    this.flush();
  }
  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.framesDirty) this.writeFrames();
  }

  // ---------- 世界接入 ----------
  enterWorld(world) {
    this.world = world;
    world.stage.add(this.root);
    this.root.rotation.set(0, 0, 0);
    world.setViewShift(0);
    world.setGround(-(this.H / 2) - 0.55);
    const r = Math.sqrt(this.W * this.W + this.H * this.H + this.D * this.D) / 2;
    world.frame(r * (world.camera.aspect < 0.8 ? 0.9 : 1.02), new THREE.Vector3(0, 0, 0));
    world.controls.enableRotate = true;
    world.controls.enableZoom = true;
  }
  exit() { this.hover = -1; }
  vrLayout() {
    const md = Math.max(this.W, this.H, this.D);
    return { scale: 0.6 / md, position: [0, 1.08, -0.72] };
  }
  onXRChange(on) { if (!on) this.root.rotation.set(0, 0, 0); this.emit(); }

  // ---------- 拾取 ----------
  pick(ray) {
    if (!ray || !this.mesh) return null;
    const { o, dir } = rayToGrid(ray, this.puzzle, this.W, this.H, this.D);
    const hit = gridRaycast(o, dir, this.W, this.H, this.D, (x, y, z) => this.visible(this.idx(x, y, z)));
    if (!hit) return null;
    return { i: this.idx(hit.x, hit.y, hit.z), ...hit };
  }

  setHover(i) {
    if (i === this.hover) return;
    const old = this.hover;
    this.hover = i;
    if (old >= 0) this.writeInstance(old);
    if (i >= 0) this.writeInstance(i);
    this.flush();
  }

  onHover(ray) {
    if (this.state !== 'playing') return;
    const h = ray ? this.pick(ray) : null;
    this.setHover(h ? h.i : -1);
  }

  onTap(ray, info) {
    if (this.state === 'won') { this.pokeModel(ray); return; }
    if (this.state !== 'playing') return;
    this.app.audio.unlock();
    const h = this.pick(ray);
    if (!h) return;
    const protect = info.button === 2 || info.long || this.tool === 'protect';
    if (protect) this.toggleProtect(h.i); else this.breakCell(h.i);
    if (info.type !== 'mouse') this.setHover(-1);
  }

  pokeModel(ray) {
    if (!this.model || !ray) return;
    const c = new THREE.Vector3();
    this.model.group.getWorldPosition(c);
    const s = this.root.getWorldScale(new THREE.Vector3()).x;
    if (ray.distanceToPoint(c) < this.model.radius * s) { this.model.jump(); this.app.audio.play('jump'); }
  }

  onXRHover(ray) {
    if (this.state !== 'playing') return null;
    const h = this.pick(ray);
    this.setHover(h ? h.i : -1);
    if (!h) return null;
    const wp = this.pos[h.i].clone();
    this.puzzle.localToWorld(wp);
    return Math.max(0.05, ray.origin.distanceTo(wp) - 0.02);
  }
  onXRAction(ray, type) {
    this.app.audio.unlock();
    if (this.state === 'won') { this.pokeModel(ray); return; }
    if (this.state !== 'playing') return;
    const h = this.pick(ray);
    if (!h) return;
    if (type === 'squeeze' || this.tool === 'protect') this.toggleProtect(h.i);
    else this.breakCell(h.i);
  }
  onXRButton(name) {
    if (name === 'a' || name === 'b') this.setTool(this.tool === 'break' ? 'protect' : 'break');
  }
  onXRStick(sx, sy, dt) {
    this.root.rotation.y += sx * dt * 2.2;
    this.root.rotation.x = THREE.MathUtils.clamp(this.root.rotation.x + sy * dt * 1.4, -0.9, 0.9);
  }

  // ---------- 规则 ----------
  setTool(t) { this.tool = t; if (this.hover >= 0) { this.writeInstance(this.hover); this.flush(); } this.emit(); }

  setSlice(axis, v) {
    const max = [this.W, this.H, this.D][axis] - 1;
    this.slice[axis] = Math.max(0, Math.min(max, v | 0));
    this.hover = -1;
    this.refreshAll();
    this.emit();
  }

  worldPosOf(i) { return this.pos[i].clone(); }

  breakCell(i) {
    const c = this.cells[i];
    if (!c.alive) return;
    if (c.prot) {
      this.app.audio.play('bonk');
      this.flash.set(i, 0.35);
      return;
    }
    if (c.t) {
      // 敲错：扣血并自动保护
      this.mistakes++;
      c.prot = true;
      this.flash.set(i, 0);
      this.shake = 0.35;
      this.app.audio.play('error');
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
      if (!this.casual) this.lives--;
      this.writeInstance(i); this.flush();
      this.emit({ mistake: true });
      if (!this.casual && this.lives <= 0) this.gameOver();
      return;
    }
    c.alive = false;
    this.anims.push({ i, t: 0 });
    this.remaining--;
    this.app.audio.play('break');
    this.particles.emit(this.pos[i], ['#FFF4E3', '#FFE6C7', '#FFD3E2', '#E9E0FF'], 7, { speed: 3.2, up: 2.5, life: 0.7, size: 0.9 });
    this.emit();
    if (this.remaining <= 0) this.win();
  }

  toggleProtect(i) {
    const c = this.cells[i];
    if (!c.alive) return;
    c.prot = !c.prot;
    this.app.audio.play(c.prot ? 'protect' : 'unprotect');
    this.writeInstance(i); this.flush();
    this.emit();
  }

  restart() { this.load(this.entry, { casual: this.casual, lives: this.maxLives || 3, speed: this.speed }); if (this.world) this.enterWorld(this.world); }

  gameOver() {
    this.state = 'over';
    this.elapsed = (performance.now() - this.startTime) / 1000;
    this.app.audio.play('gameover');
    this.refreshAll();
    this.emit();
    this.app.onPlayEnd && this.app.onPlayEnd({ ok: false });
  }

  win() {
    this.state = 'waking';
    this.elapsed = (performance.now() - this.startTime) / 1000;
    this.wakeT = 0;
    this.hover = -1;
    this.slice = [0, 0, 0];
    this.flash.clear();
    this.app.audio.play('win');
    this.sleepy.group.visible = false;
    this.refreshAll();
    const stars = this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1;
    this.result = { ok: true, time: this.elapsed, mistakes: this.mistakes, stars };
    this.emit();
  }

  finishWake() {
    this.state = 'won';
    this.puzzle.visible = false;
    this.model = new VoxelModel(this.entry.data);
    this.root.add(this.model.group);
    this.model.pop();
    const md = Math.max(this.W, this.H, this.D);
    this.cheer.r = md * 0.75;
    if (this.world && !this.world.isXR) {
      const r = Math.sqrt(this.W * this.W + this.H * this.H + this.D * this.D) / 2;
      this.world.frame(r * 1.15, new THREE.Vector3(0, -this.H * 0.32, 0));
    }
    this.root.add(this.cheer.group);
    this.particles.emit(new THREE.Vector3(0, this.H / 2, 0), CONFETTI, 80, { speed: 7 + md * 0.4, up: 6, life: 2.2, size: 1.1, gravity: 9, spread: md * 0.6 });
    this.emit();
    this.app.onPlayEnd && this.app.onPlayEnd(this.result);
  }

  update(dt, t) {
    if (!this.mesh) return;
    this.particles.update(dt);
    if (this.sleepy.group.visible) this.sleepy.update(dt, t);
    let dirty = false;
    if (this.anims.length) {
      for (const a of this.anims) { a.t += dt; this.writeInstance(a.i); }
      const done = this.anims.filter(a => a.t >= 0.22);
      this.anims = this.anims.filter(a => a.t < 0.22);
      done.forEach(a => this.writeInstance(a.i));
      dirty = true;
    }
    if (this.flash.size) {
      for (const [i, f] of this.flash) {
        const nf = f + dt;
        if (nf >= 0.6) this.flash.delete(i); else this.flash.set(i, nf);
        this.writeInstance(i);
      }
      dirty = true;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.5;
      this.puzzle.position.set(Math.sin(t * 70) * k, 0, Math.cos(t * 55) * k * 0.5);
    } else this.puzzle.position.set(0, 0, 0);

    if (this.state === 'waking') {
      this.wakeT += dt;
      const k = Math.min(1, this.wakeT / 0.9);
      const e = k * k * (3 - 2 * k);
      this.mat.uniforms.uClue.value = 1 - e;
      for (let i = 0; i < this.N; i++) {
        const c = this.cells[i];
        if (!c.t) continue;
        _c2.copy(c.prot ? COL.prot : COL.base).lerp(c.color, e);
        this.mesh.setColorAt(i, _c2);
        const s = 1 + Math.sin(k * Math.PI) * 0.06;
        _m.compose(this.pos[i], _q.identity(), _s.set(s, s, s));
        this.mesh.setMatrixAt(i, _m);
      }
      dirty = true;
      if (k >= 1) this.finishWake();
    }
    if (dirty) this.flush();
    if (this.state === 'won' && this.model) {
      this.model.update(dt, t, this.speed);
      this.cheer.update(dt, t);
    }
    if (this.state === 'playing') {
      const el = (performance.now() - this.startTime) / 1000;
      if (Math.floor(el) !== Math.floor(this.elapsed)) { this.elapsed = el; this.emit({ tick: true }); }
    }
  }

  stateInfo() {
    return {
      state: this.state, tool: this.tool, lives: this.lives, maxLives: this.maxLives, casual: this.casual,
      remaining: this.remaining, total: this.total, time: this.elapsed, mistakes: this.mistakes,
      slice: (this.slice || [0, 0, 0]).slice(), dims: [this.W, this.H, this.D], entry: this.entry, result: this.result,
    };
  }
  emit(extra) { if (this.app.onPlayState) this.app.onPlayState(this.stateInfo(), extra || {}); }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.dispose();
      this.mat.dispose();
      this.frames.dispose();
      this.frames.material.dispose();
    }
    if (this.model) { this.model.dispose(); this.model = null; }
    if (this.cheer.group.parent) this.cheer.group.parent.remove(this.cheer.group);
    this.mesh = null;
  }
}

export { BLOCK };
