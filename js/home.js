// 首页 3D 背景：小岛上的吉祥物 + 一圈沉睡的方块
import * as THREE from '../vendor/three.module.js';
import { VoxelModel, makeVoxelMaterial, getBlockGeometry } from './voxel.js';

export class HomeMode {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.model = null;
  }

  setFeatured(entry) {
    if (this.model) this.model.dispose();
    this.entry = entry;
    this.model = new VoxelModel(entry.data);
    const s = 5.2 / this.model.maxDim;
    this.model.group.scale.setScalar(s);
    this.model.group.position.y = (entry.data.h / 2) * s + 0.1;
    this.root.add(this.model.group);
    this.model.pop();
  }

  buildCubes() {
    if (this.cubes) return;
    // 漂浮的小方块（还在睡觉）
    const mat = makeVoxelMaterial(0);
    const n = 9;
    this.cubes = new THREE.InstancedMesh(getBlockGeometry(), mat, n);
    this.cubes.frustumCulled = false;
    this.cubeData = [];
    const cols = ['#FFF4E3', '#FFD3E2', '#FFE680', '#B8F2C9', '#A0E7FF', '#D7C4F5'];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.cubeData.push({ a, r: 6 + (i % 3) * 0.9, y: 1.5 + (i % 4) * 1.1, s: 0.55 + (i % 3) * 0.2, ph: i * 1.3 });
      this.cubes.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    this.root.add(this.cubes);
  }

  enterWorld(world) {
    this.world = world;
    this.buildCubes();
    world.stage.add(this.root);
    world.setGround(0);
    world.controls.enableRotate = false;
    world.controls.enableZoom = false;
    this.layout();
  }

  layout() {
    if (!this.world) return;
    const wide = window.innerWidth > 900 && window.innerWidth > window.innerHeight * 1.1;
    this.world.setViewShift(wide ? 0.2 : 0);
    const target = new THREE.Vector3(0, wide ? 2.8 : 1.4, 0);
    this.world.frame(wide ? 7.2 : 6.6, target, new THREE.Vector3(0, wide ? 0.22 : 0.3, 1));
  }

  exit() {
    this.world.setViewShift(0);
    this.world.controls.enableRotate = true;
    this.world.controls.enableZoom = true;
  }

  vrLayout() { return { scale: 0.12, position: [0, 0.75, -1.2] }; }

  onTap(ray) {
    this.app.audio.unlock();
    if (!this.model || !ray) return;
    const c = new THREE.Vector3();
    this.model.group.getWorldPosition(c);
    const s = this.model.group.getWorldScale(new THREE.Vector3()).x;
    if (ray.distanceToPoint(c) < this.model.radius * s) { this.model.jump(); this.app.audio.play('jump'); }
  }

  onXRAction(ray) { this.onTap(ray); }

  update(dt, t) {
    if (this.model) {
      this.model.update(dt, t, this.app.store.config.animSpeed || 1);
      this.model.group.rotation.y = Math.sin(t * 0.35) * 0.6 + 0.35;
    }
    if (this.cubes) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      this.cubeData.forEach((d, i) => {
        const a = d.a + t * 0.12;
        q.setFromEuler(e.set(t * 0.3 + d.ph, t * 0.4 + d.ph, 0));
        m.compose(new THREE.Vector3(Math.cos(a) * d.r, d.y + Math.sin(t * 1.2 + d.ph) * 0.35, Math.sin(a) * d.r - 1), q, new THREE.Vector3(d.s, d.s, d.s));
        this.cubes.setMatrixAt(i, m);
      });
      this.cubes.instanceMatrix.needsUpdate = true;
    }
  }
}
