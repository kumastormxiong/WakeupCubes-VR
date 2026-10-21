// 粒子特效：碎块、彩纸、Zzz
import * as THREE from '../vendor/three.module.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Particles {
  constructor(max = 360) {
    this.max = max;
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = [];
    for (let i = 0; i < max; i++) {
      this.p.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1, size: 1, g: 14 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, _c.set('#ffffff'));
    }
    this.cursor = 0;
  }

  emit(pos, colors, n = 10, { speed = 4, up = 3, life = 0.8, size = 1, gravity = 14, spread = 0.4 } = {}) {
    for (let k = 0; k < n; k++) {
      const p = this.p[this.cursor];
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      p.alive = true;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      p.vel.set((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      p.vel.y += up;
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      p.life = 0; p.max = life * (0.7 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.8); p.g = gravity;
      this.mesh.setColorAt(i, _c.set(colors[Math.floor(Math.random() * colors.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      p.vel.y -= p.g * dt;
      p.vel.multiplyScalar(1 - dt * 0.8);
      p.pos.addScaledVector(p.vel, dt);
      p.rot.addScaledVector(p.spin, dt);
      const k = 1 - p.life / p.max;
      const s = p.size * Math.min(1, k * 2.2);
      _m.compose(p.pos, _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z)), _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    if (any || this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = any; }
  }

  clear() {
    for (let i = 0; i < this.max; i++) { this.p[i].alive = false; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function glyphTexture(ch, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '800 96px "Baloo 2", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#ffffff'; g.lineJoin = 'round';
  g.strokeText(ch, 64, 70);
  g.fillStyle = color; g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 头顶飘出的 Z z z
export class Sleepy {
  constructor() {
    this.group = new THREE.Group();
    const tex = glyphTexture('Z', '#9B7FE6');
    this.items = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.userData.ph = i / 3;
      this.group.add(s);
      this.items.push(s);
    }
  }
  update(dt, t) {
    for (const s of this.items) {
      const u = (t * 0.35 + s.userData.ph) % 1;
      s.position.set(Math.sin(u * 6) * 0.6 + u * 1.5, u * 3, 0);
      const sc = 0.6 + u * 1.2;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(u * Math.PI);
    }
  }
}

// 唤醒后飘起的爱心/星星
export class Cheer {
  constructor() {
    this.group = new THREE.Group();
    const texs = [glyphTexture('♥', '#FF7EA6'), glyphTexture('★', '#FFC93C'), glyphTexture('♪', '#7FB7FF')];
    this.items = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false }));
      s.userData = { ph: i / 9, a: (i / 9) * Math.PI * 2 };
      this.group.add(s);
      this.items.push(s);
    }
    this.r = 4;
  }
  update(dt, t) {
    for (const s of this.items) {
      const u = (t * 0.22 + s.userData.ph) % 1;
      const a = s.userData.a + t * 0.4;
      s.position.set(Math.cos(a) * this.r, u * this.r * 1.4 - this.r * 0.2, Math.sin(a) * this.r);
      const sc = (0.5 + Math.sin(u * Math.PI) * 0.7) * this.r * 0.18;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(u * Math.PI);
    }
  }
}
