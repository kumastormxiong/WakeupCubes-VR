// 生态收藏室：环形展台展示所有已唤醒的小伙伴
import * as THREE from 'three';
import { VoxelModel } from './voxel.js';

const PED_COLORS = ['#FFC4D6', '#FFE680', '#B8F2C9', '#A0E7FF', '#D7C4F5', '#FFD3B6'];

export class CollectionMode {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.items = [];
    this.spin = 0;
    this.spinTarget = 0;
    this.selected = -1;
  }

  load(entries) {
    this.dispose();
    this.entries = entries;
    this.root = new THREE.Group();
    this.ring = new THREE.Group();
    this.root.add(this.ring);
    const n = entries.length;
    this.R = Math.max(5.5, (n * 3.6) / (Math.PI * 2));
    const pedG = new THREE.CylinderGeometry(1.5, 1.7, 0.8, 40);
    const topG = new THREE.CylinderGeometry(1.62, 1.62, 0.18, 40);
    entries.forEach((e, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const slot = new THREE.Group();
      slot.position.set(Math.sin(a) * this.R, 0, Math.cos(a) * this.R);
      slot.rotation.y = a;
      const ped = new THREE.Mesh(pedG, new THREE.MeshLambertMaterial({ color: PED_COLORS[i % PED_COLORS.length] }));
      ped.position.y = 0.4;
      const top = new THREE.Mesh(topG, new THREE.MeshLambertMaterial({ color: '#FFFFFF' }));
      top.position.y = 0.85;
      const m = new VoxelModel(e.data);
      const s = 2.5 / m.maxDim;
      m.group.scale.setScalar(s);
      m.group.position.y = 0.95 + (e.data.h / 2) * s;
      slot.add(ped, top, m.group);
      this.ring.add(slot);
      this.items.push({ entry: e, model: m, slot, scale: s, angle: a });
    });
  }

  enterWorld(world) {
    this.world = world;
    world.stage.add(this.root);
    world.setViewShift(0);
    world.setGround(0);
    this.spin = 0; this.spinTarget = 0;
    if (world.isXR) this.layoutVR(true);
    world.frame(this.R + 3.2, new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0.42, 1));
    world.controls.enableRotate = true;
    world.controls.enableZoom = true;
  }
  exit() {}

  vrLayout() { return { scale: 1, position: [0, 0, 0] }; }

  // VR：展台围绕玩家一圈
  layoutVR(on) {
    const n = this.items.length;
    this.items.forEach((it, i) => {
      if (on) {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        const R = Math.max(1.3, n * 0.18);
        it.slot.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
        it.slot.rotation.y = -a + Math.PI;
        it.slot.scale.setScalar(0.32);
      } else {
        it.slot.position.set(Math.sin(it.angle) * this.R, 0, Math.cos(it.angle) * this.R);
        it.slot.rotation.y = it.angle;
        it.slot.scale.setScalar(1);
      }
    });
    this.ring.rotation.y = 0;
  }
  onXRChange(on) { this.layoutVR(on); }

  pickItem(ray) {
    if (!ray) return -1;
    let best = -1, bd = Infinity;
    const c = new THREE.Vector3(), ws = new THREE.Vector3();
    this.items.forEach((it, i) => {
      it.model.group.getWorldPosition(c);
      it.model.group.getWorldScale(ws);
      const r = it.model.radius * ws.x * 0.9;
      if (ray.distanceToPoint(c) < r) {
        const d = ray.origin.distanceTo(c);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }

  poke(i) {
    if (i < 0) return;
    const it = this.items[i];
    it.model.jump();
    this.app.audio.play('jump');
    this.selected = i;
    if (!this.world.isXR) this.spinTarget = -it.angle;
    if (this.app.onCollectionSelect) this.app.onCollectionSelect(it.entry, i);
  }

  onTap(ray) { this.app.audio.unlock(); this.poke(this.pickItem(ray)); }
  onHover(ray) {
    const i = this.pickItem(ray);
    this.world.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
  }
  onXRAction(ray) { this.app.audio.unlock(); this.poke(this.pickItem(ray)); }
  onXRHover(ray) { return null; }

  focus(dir) {
    const n = this.items.length;
    if (!n) return;
    this.selected = ((this.selected < 0 ? 0 : this.selected + dir) % n + n) % n;
    this.poke(this.selected);
  }

  update(dt, t) {
    const speed = this.app.store.config.animSpeed || 1;
    // 平滑转到选中的模型
    let d = this.spinTarget - this.ring.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (!this.world || !this.world.isXR) this.ring.rotation.y += d * Math.min(1, dt * 4);
    this.items.forEach((it, i) => {
      it.model.update(dt, t, speed);
      it.model.group.rotation.y = Math.sin(t * 0.5 + i) * 0.35;
    });
  }

  dispose() {
    for (const it of this.items) it.model.dispose();
    this.items = [];
    this.root.clear();
  }
}
