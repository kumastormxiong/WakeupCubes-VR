// VR 中的悬浮控制面板（Canvas 贴图 + 手柄射线点击）
import * as THREE from '../vendor/three.module.js';

const W = 1024;
const PW = 0.62;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export class VRPanel {
  constructor(world) {
    this.world = world;
    this.H = 640;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PW * this.H / W), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 10;
    // 放在方块左侧更远的位置，并朝向玩家，避免和大关卡重叠
    this.mesh.position.set(-0.9, 1.15, -0.58);
    this.mesh.lookAt(0, 1.3, 0.05);
    this.mesh.visible = false;
    world.scene.add(this.mesh);
    this.spec = null;
    this.hoverId = null;
    this.raycaster = new THREE.Raycaster();
    this.onPress = null;
    this.toastMsg = '';
    this.toastUntil = 0;
    world.vrPanel = this;
  }
  get visible() { return this.mesh.visible && this.world.isXR; }
  show(on) { this.mesh.visible = on; }

  resize(h) {
    if (h === this.H) return;
    this.H = h;
    this.canvas.height = h;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(PW, PW * h / W);
    this.tex.dispose();
  }

  // spec: { title, sub, info, height, buttons:[{id,label,sub,x,y,w,h,color,active,swatch,size}] }
  set(spec, onPress) {
    this.spec = spec;
    if (onPress) this.onPress = onPress;
    this.resize(spec.height || 640);
    this.draw();
  }

  toast(msg) {
    this.toastMsg = msg;
    this.toastUntil = performance.now() + 2600;
    this.draw();
  }

  draw() {
    const g = this.g, s = this.spec, H = this.H;
    g.clearRect(0, 0, W, H);
    if (!s) return;
    rr(g, 8, 8, W - 16, H - 16, 48);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,182,206,0.9)'; g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#5A4A86';
    g.font = '60px "ZCOOL KuaiLe", "Baloo 2", sans-serif';
    let title = s.title || '';
    while (g.measureText(title).width > 700 && title.length > 2) title = title.slice(0, -2) + '…';
    g.fillText(title, 48, 70);
    if (s.sub) {
      g.font = '700 34px "Baloo 2", "ZCOOL KuaiLe", sans-serif';
      g.fillStyle = '#FF6F9C';
      g.textAlign = 'right';
      g.fillText(s.sub, W - 48, 72);
    }
    if (s.info) {
      g.textAlign = 'left';
      g.font = '30px "ZCOOL KuaiLe", sans-serif';
      g.fillStyle = '#8C86A0';
      g.fillText(s.info, 48, 128);
    }
    for (const b of s.buttons || []) {
      const hov = this.hoverId === b.id;
      const r = Math.min(30, b.h / 2);
      if (b.swatch) {
        rr(g, b.x, b.y, b.w, b.h, r);
        g.fillStyle = b.swatch; g.fill();
        g.lineWidth = b.active ? 10 : hov ? 8 : 4;
        g.strokeStyle = b.active ? '#FF6F9C' : hov ? '#FFCB3D' : '#FFFFFF';
        g.stroke();
        continue;
      }
      rr(g, b.x, b.y + (hov ? 3 : 0), b.w, b.h, r);
      g.fillStyle = b.active ? (b.color || '#FF8FAB') : hov ? '#FFF0C2' : '#F6F1FF';
      g.fill();
      g.lineWidth = 4; g.strokeStyle = b.active ? 'rgba(0,0,0,0.08)' : '#E6DDF7'; g.stroke();
      if (b.dot) { g.beginPath(); g.arc(b.x + 26, b.y + b.h / 2 + (hov ? 3 : 0), 10, 0, Math.PI * 2); g.fillStyle = b.dot; g.fill(); }
      g.fillStyle = b.active ? '#FFFFFF' : '#5A4A86';
      g.textAlign = 'center';
      const cy = b.y + b.h / 2 + (hov ? 5 : 2);
      g.font = `${b.size || 36}px "ZCOOL KuaiLe", "Baloo 2", sans-serif`;
      if (b.sub) {
        g.fillText(b.label, b.x + b.w / 2, cy - 16);
        g.font = '22px "ZCOOL KuaiLe", sans-serif';
        g.fillStyle = b.active ? '#FFFFFF' : '#9A90B8';
        let sub = b.sub;
        while (g.measureText(sub).width > b.w - 12 && sub.length > 1) sub = sub.slice(0, -2) + '…';
        g.fillText(sub, b.x + b.w / 2, cy + 22);
      } else g.fillText(b.label, b.x + b.w / 2 + (b.dot ? 12 : 0), cy);
    }
    if (this.toastMsg && performance.now() < this.toastUntil) {
      rr(g, 40, H - 96, W - 80, 70, 35);
      g.fillStyle = 'rgba(78,67,115,0.92)'; g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center';
      g.font = '32px "ZCOOL KuaiLe", sans-serif';
      let m = this.toastMsg;
      while (g.measureText(m).width > W - 120 && m.length > 2) m = m.slice(0, -2) + '…';
      g.fillText(m, W / 2, H - 60);
    }
    this.tex.needsUpdate = true;
  }

  hit(ray) {
    if (!this.mesh.visible) return null;
    this.raycaster.ray.copy(ray);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const uv = hits[0].uv;
    const px = uv.x * W, py = (1 - uv.y) * this.H;
    let id = '__panel';
    for (const b of (this.spec && this.spec.buttons) || []) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { id = b.id; break; }
    }
    return { id, distance: hits[0].distance };
  }

  setHover(id) {
    if (id === '__panel') id = null;
    if (id !== this.hoverId) { this.hoverId = id; this.draw(); }
  }

  press(hit) {
    if (!hit || hit.id === '__panel') return;
    if (this.onPress) this.onPress(hit.id);
  }

  update() {
    if (this.toastMsg && performance.now() >= this.toastUntil) { this.toastMsg = ''; this.draw(); }
  }
}

// 便捷布局：按行生成按钮
export function rowButtons(y, defs, { x0 = 48, x1 = W - 48, h = 84, gap = 18 } = {}) {
  const n = defs.length;
  const w = (x1 - x0 - gap * (n - 1)) / n;
  return defs.map((d, i) => ({ ...d, x: x0 + i * (w + gap), y, w, h }));
}
