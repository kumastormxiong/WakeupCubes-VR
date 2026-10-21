// UGC 造物工坊：在 3D 网格中搭建体素、上色、指定动作部件、预览唤醒、试玩、发布分享
import * as THREE from 'three';
import { gridRaycast, rayToGrid, makeVoxelMaterial, getBlockGeometry, VoxelModel, BLOCK } from './voxel.js';
import { PALETTE, PARTS } from './palette.js';
import { RoundedBoxGeometry } from '../vendor/addons/RoundedBoxGeometry.js';

const K = (x, y, z) => x + ',' + y + ',' + z;
const MAXN = 12 * 12 * 12;
const _m = new THREE.Matrix4(), _c = new THREE.Color();

export class CreatorMode {
  constructor(app) {
    this.app = app;
    this.tool = 'add';
    this.color = PALETTE[2].c;
    this.part = 0;
    this.mirror = false;
    this.showParts = false;
    this.preview = null;
    this.undoStack = [];
    this.redoStack = [];
    this.root = new THREE.Group();
    this.mat = makeVoxelMaterial(0);
    this.mesh = new THREE.InstancedMesh(getBlockGeometry(), this.mat, MAXN);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.count = 0;
    this.ghost = new THREE.Mesh(new RoundedBoxGeometry(BLOCK * 1.04, BLOCK * 1.04, BLOCK * 1.04, 2, 0.16),
      new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), new THREE.LineBasicMaterial({ color: '#FF6F9C' }));
    this.ghost.add(this.ghostEdge);
    this.root.add(this.mesh, this.ghost);
    this.newDoc(7, 7, 7);
  }

  // ---------- 文档 ----------
  newDoc(w = 7, h = 7, d = 7) {
    this.doc = { id: null, name: '我的小伙伴', author: this.app.store ? this.app.store.config.playerName || '' : '', diff: 2, w, h, d, map: new Map() };
    this.undoStack = []; this.redoStack = [];
    this.rebuildFrame();
    this.refresh();
  }

  loadEntry(entry, asCopy = false) {
    const L = entry.data;
    const map = new Map();
    L.voxels.forEach(v => map.set(K(v[0], v[1], v[2]), [v[3], v[4]]));
    this.doc = {
      id: asCopy ? null : entry.id,
      name: asCopy ? entry.name + ' 改' : entry.name,
      author: asCopy ? (this.app.store.config.playerName || '') : entry.author || '',
      diff: entry.diff || 2,
      w: L.w, h: L.h, d: L.d, map,
      official: asCopy ? false : !!entry.official,
    };
    this.undoStack = []; this.redoStack = [];
    this.rebuildFrame();
    this.refresh();
  }

  toEntry() {
    const d = this.doc;
    const voxels = [];
    for (const [k, v] of d.map) { const [x, y, z] = k.split(',').map(Number); voxels.push([x, y, z, v[0], v[1]]); }
    return { id: d.id, name: d.name || '无名关卡', author: d.author || '', diff: d.diff, official: !!d.official, data: { w: d.w, h: d.h, d: d.d, voxels } };
  }

  snapshot() { return JSON.stringify([this.doc.w, this.doc.h, this.doc.d, [...this.doc.map]]); }
  restore(s) {
    const [w, h, d, arr] = JSON.parse(s);
    const resized = w !== this.doc.w || h !== this.doc.h || d !== this.doc.d;
    Object.assign(this.doc, { w, h, d, map: new Map(arr) });
    if (resized) this.rebuildFrame();
    this.refresh();
  }
  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); this.app.audio.play('erase'); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); this.app.audio.play('place'); }

  resize(w, h, d) {
    this.pushUndo();
    const map = new Map();
    for (const [k, v] of this.doc.map) {
      const [x, y, z] = k.split(',').map(Number);
      if (x < w && y < h && z < d) map.set(k, v);
    }
    Object.assign(this.doc, { w, h, d, map });
    this.rebuildFrame();
    this.refresh();
    if (this.world) this.frameCam();
  }

  clear() { this.pushUndo(); this.doc.map.clear(); this.refresh(); }

  // ---------- 3D ----------
  rebuildFrame() {
    if (this.gridLines) { this.root.remove(this.gridLines); this.gridLines.geometry.dispose(); }
    if (this.bounds) { this.root.remove(this.bounds); this.bounds.geometry.dispose(); }
    const { w, h, d } = this.doc;
    const pts = [];
    const y = -h / 2;
    for (let x = 0; x <= w; x++) pts.push(x - w / 2, y, -d / 2, x - w / 2, y, d / 2);
    for (let z = 0; z <= d; z++) pts.push(-w / 2, y, z - d / 2, w / 2, y, z - d / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#B39DDB', transparent: true, opacity: 0.55 }));
    this.bounds = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: '#FF8FAB', transparent: true, opacity: 0.45 }));
    // 地板底色
    if (this.floor) { this.root.remove(this.floor); this.floor.geometry.dispose(); }
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.35, depthWrite: false }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = y - 0.01;
    this.root.add(this.floor, this.gridLines, this.bounds);
  }

  cellPos(x, y, z) {
    const { w, h, d } = this.doc;
    return new THREE.Vector3(x - (w - 1) / 2, y - (h - 1) / 2, z - (d - 1) / 2);
  }

  refresh() {
    let i = 0;
    for (const [k, v] of this.doc.map) {
      const [x, y, z] = k.split(',').map(Number);
      const p = this.cellPos(x, y, z);
      _m.makeTranslation(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(this.showParts ? PARTS[v[1]].color : v[0]));
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.app.onCreatorChange) this.app.onCreatorChange(this);
  }

  frameCam() {
    const { w, h, d } = this.doc;
    const r = Math.sqrt(w * w + h * h + d * d) / 2;
    this.world.setGround(-h / 2 - 0.6);
    this.world.frame(r * 1.12, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.7, 0.6, 1));
  }

  enterWorld(world) {
    this.world = world;
    world.stage.add(this.root);
    world.setViewShift(0, window.innerWidth <= 720 ? 0.13 : 0);
    world.controls.enableRotate = true;
    world.controls.enableZoom = true;
    this.frameCam();
  }
  exit() { this.stopPreview(); this.ghost.visible = false; if (this.world) this.world.setViewShift(0, 0); }

  // ---------- VR ----------
  vrLayout() {
    const md = Math.max(this.doc.w, this.doc.h, this.doc.d);
    return { scale: 0.6 / md, position: [0, 1.0, -0.72] };
  }
  onXRChange(on) { if (!on) this.root.rotation.set(0, 0, 0); this.ghost.visible = false; }
  onXRHover(ray) {
    this.onHover(ray);
    if (!this.ghost.visible) return null;
    const wp = this.ghost.getWorldPosition(new THREE.Vector3());
    return Math.max(0.05, ray.origin.distanceTo(wp) - 0.02);
  }
  onXRAction(ray, type) {
    this.onTap(ray, { button: type === 'squeeze' ? 2 : 0, long: false, type: 'xr' });
  }
  onXRButton(name) { if (name === 'a') this.undo(); else if (name === 'b') this.redo(); }
  onXRStick(sx, sy, dt) {
    this.root.rotation.y += sx * dt * 2.2;
    this.root.rotation.x = THREE.MathUtils.clamp(this.root.rotation.x + sy * dt * 1.4, -0.9, 0.9);
  }

  // ---------- 拾取 ----------
  target(ray) {
    if (!ray) return null;
    const { w, h, d } = this.doc;
    const { o, dir } = rayToGrid(ray, this.root, w, h, d);
    const hit = gridRaycast(o, dir, w, h, d, (x, y, z) => this.doc.map.has(K(x, y, z)));
    if (hit) {
      if (this.tool === 'add') {
        const nx = hit.x + hit.normal[0], ny = hit.y + hit.normal[1], nz = hit.z + hit.normal[2];
        if (nx < 0 || ny < 0 || nz < 0 || nx >= w || ny >= h || nz >= d) return null;
        return { x: nx, y: ny, z: nz, on: hit };
      }
      return { x: hit.x, y: hit.y, z: hit.z, on: hit };
    }
    if (this.tool !== 'add') return null;
    // 打到地板
    if (dir.y < -1e-6) {
      const t = -o.y / dir.y;
      const px = o.x + dir.x * t, pz = o.z + dir.z * t;
      const x = Math.floor(px), z = Math.floor(pz);
      if (x >= 0 && z >= 0 && x < w && z < d) return { x, y: 0, z, on: null };
    }
    return null;
  }

  onHover(ray) {
    if (this.preview) { this.ghost.visible = false; return; }
    const t = this.target(ray);
    if (!t) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.copy(this.cellPos(t.x, t.y, t.z));
    const col = this.tool === 'erase' ? '#FF6B6B' : this.tool === 'add' ? this.color : this.tool === 'paint' ? this.color : '#FFFFFF';
    this.ghost.material.color.set(col);
    this.ghost.material.opacity = this.tool === 'add' ? 0.55 : 0.3;
    this.ghostEdge.material.color.set(this.tool === 'erase' ? '#FF3B5C' : '#FF6F9C');
  }

  apply(x, y, z, op) {
    const { w } = this.doc;
    const cells = [[x, y, z, this.part]];
    if (this.mirror && w - 1 - x !== x) cells.push([w - 1 - x, y, z, this.part === 1 ? 2 : this.part === 2 ? 1 : this.part]);
    let changed = false;
    for (const [cx, cy, cz, part] of cells) {
      const k = K(cx, cy, cz);
      if (op === 'add') { if (!this.doc.map.has(k)) { this.doc.map.set(k, [this.color, part]); changed = true; } }
      else if (op === 'erase') { if (this.doc.map.delete(k)) changed = true; }
      else if (op === 'paint') {
        const v = this.doc.map.get(k);
        if (v && (v[0] !== this.color || v[1] !== part)) { this.doc.map.set(k, [this.color, part]); changed = true; }
      }
    }
    return changed;
  }

  onTap(ray, info) {
    this.app.audio.unlock();
    if (this.preview) return;
    let tool = this.tool;
    if (info.button === 2 || info.long) tool = 'erase';
    const prevTool = this.tool;
    this.tool = tool;
    const t = this.target(ray);
    this.tool = prevTool;
    if (!t) return;
    if (tool === 'pick') {
      const v = this.doc.map.get(K(t.x, t.y, t.z));
      if (v) { this.color = v[0]; this.part = v[1]; this.app.audio.play('paint'); if (this.app.onCreatorChange) this.app.onCreatorChange(this, true); }
      return;
    }
    const snap = this.snapshot();
    if (this.apply(t.x, t.y, t.z, tool)) {
      this.undoStack.push(snap);
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack = [];
      this.refresh();
      this.app.audio.play(tool === 'add' ? 'place' : tool === 'erase' ? 'erase' : 'paint', { pitch: (t.y % 5) * 2 });
      this.onHover(ray);
    }
  }

  setShowParts(on) { this.showParts = on; this.refresh(); }

  // ---------- 预览唤醒动画 ----------
  startPreview() {
    if (!this.doc.map.size) return false;
    this.stopPreview();
    this.preview = new VoxelModel(this.toEntry().data);
    this.root.add(this.preview.group);
    this.preview.pop();
    this.mesh.visible = false;
    this.ghost.visible = false;
    this.app.audio.play('win');
    return true;
  }
  stopPreview() {
    if (!this.preview) return;
    this.preview.dispose();
    this.preview = null;
    this.mesh.visible = true;
  }

  update(dt, t) {
    if (this.preview) this.preview.update(dt, t, this.app.store.config.animSpeed || 1);
  }

  stats() {
    const { w, h, d } = this.doc;
    return { count: this.doc.map.size, total: w * h * d };
  }

  // 一些简单的造型辅助：在底部铺一层
  fillFloor() {
    this.pushUndo();
    const { w, d } = this.doc;
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      const k = K(x, 0, z);
      if (!this.doc.map.has(k)) this.doc.map.set(k, [this.color, this.part]);
    }
    this.refresh();
  }
}
