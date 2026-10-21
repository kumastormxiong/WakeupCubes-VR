// VR 中的悬浮控制面板（Canvas 贴图 + 手柄射线点击）
import * as THREE from 'three';

const W = 1024, H = 640;
const PW = 0.62, PH = PW * H / W;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export class VRPanel {
  constructor(world) {
    this.world = world;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 10;
    this.mesh.position.set(-0.62, 1.12, -0.52);
    this.mesh.rotation.y = 0.75;
    this.mesh.visible = false;
    world.scene.add(this.mesh);
    this.spec = null;
    this.hoverId = null;
    this.raycaster = new THREE.Raycaster();
    this.onPress = null;
    world.vrPanel = this;
  }
  get visible() { return this.mesh.visible && this.world.isXR; }
  show(on) { this.mesh.visible = on; }

  // spec: { title, sub, info, buttons:[{id,label,x,y,w,h,color,active}] }
  set(spec, onPress) {
    this.spec = spec;
    if (onPress) this.onPress = onPress;
    this.draw();
  }

  draw() {
    const g = this.g, s = this.spec;
    g.clearRect(0, 0, W, H);
    if (!s) return;
    rr(g, 8, 8, W - 16, H - 16, 48);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,182,206,0.9)'; g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#5A4A86';
    g.font = '64px "ZCOOL KuaiLe", "Baloo 2", sans-serif';
    g.fillText(s.title || '', 48, 70);
    if (s.sub) {
      g.font = '700 34px "Baloo 2", "ZCOOL KuaiLe", sans-serif';
      g.fillStyle = '#FF6F9C';
      g.textAlign = 'right';
      g.fillText(s.sub, W - 48, 72);
    }
    if (s.info) {
      g.textAlign = 'left';
      g.font = '32px "ZCOOL KuaiLe", sans-serif';
      g.fillStyle = '#8C86A0';
      g.fillText(s.info, 48, 132);
    }
    for (const b of s.buttons || []) {
      const hov = this.hoverId === b.id;
      rr(g, b.x, b.y + (hov ? 3 : 0), b.w, b.h, Math.min(36, b.h / 2));
      g.fillStyle = b.active ? (b.color || '#FF8FAB') : hov ? '#FFF0C2' : '#F6F1FF';
      g.fill();
      g.lineWidth = 4; g.strokeStyle = b.active ? 'rgba(0,0,0,0.08)' : '#E6DDF7'; g.stroke();
      g.fillStyle = b.active ? '#FFFFFF' : '#5A4A86';
      g.textAlign = 'center';
      g.font = `${b.size || 36}px "ZCOOL KuaiLe", "Baloo 2", sans-serif`;
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + (hov ? 5 : 2));
    }
    this.tex.needsUpdate = true;
  }

  hit(ray) {
    if (!this.mesh.visible) return null;
    this.raycaster.ray.copy(ray);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const uv = hits[0].uv;
    const px = uv.x * W, py = (1 - uv.y) * H;
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

  update() { /* 面板静止 */ }
}

// 便捷布局：按行生成按钮
export function rowButtons(y, defs, { x0 = 48, x1 = W - 48, h = 84, gap = 18 } = {}) {
  const n = defs.length;
  const w = (x1 - x0 - gap * (n - 1)) / n;
  return defs.map((d, i) => ({ ...d, x: x0 + i * (w + gap), y, w, h }));
}
