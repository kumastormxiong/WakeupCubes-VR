// 体素渲染核心：数字图集、圆角方块材质、提示计算、网格射线、可动画的体素模型
import * as THREE from '../vendor/three.module.js';
import { RoundedBoxGeometry } from '../vendor/addons/RoundedBoxGeometry.js';
import { EYE_COLORS } from './palette.js';

export const BLOCK = 0.92;
export const BLANK_CELL = 63;
const ATLAS_N = 8;

export function clueCell(count, seg) {
  if (count <= 0) return 0;
  return Math.min(count, 19) * 3 + (Math.min(Math.max(seg, 1), 3) - 1);
}

// ---------- 共享资源 ----------
export const LIGHT = {
  uLightDir: { value: new THREE.Vector3(0.45, 1.0, 0.65).normalize() },
  uSky: { value: new THREE.Color('#FFFFFF') },
  uGround: { value: new THREE.Color('#FFD6E4') },
};

let atlasTex = null;
let blockGeo = null;
let frameGeo = null;
let modelMat = null;

export function setAmbient(skyHex, groundHex) {
  LIGHT.uSky.value.set(skyHex);
  LIGHT.uGround.value.set(groundHex);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function buildAtlas() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S * ATLAS_N;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const font = (px) => `800 ${px}px "Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
  const drawCell = (cell, count, seg) => {
    const cx = (cell % ATLAS_N) * S, cy = Math.floor(cell / ATLAS_N) * S;
    g.save();
    g.translate(cx, cy);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (count === 0) {
      g.fillStyle = 'rgba(176,168,196,0.95)';
      g.font = font(64);
      g.fillText('0', S / 2, S / 2 + 4);
    } else {
      const txt = String(count);
      g.font = font(txt.length > 1 ? (seg > 1 ? 58 : 64) : (seg > 1 ? 68 : 76));
      const ty = seg > 1 ? S / 2 - 12 : S / 2 + 4;
      g.lineJoin = 'round';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.strokeText(txt, S / 2, ty);
      g.fillStyle = '#5A4A86';
      g.fillText(txt, S / 2, ty);
      if (seg > 1) {
        const n = Math.min(seg, 3);
        const gap = 24, r = 8.5;
        const x0 = S / 2 - ((n - 1) * gap) / 2;
        for (let i = 0; i < n; i++) {
          g.beginPath();
          g.arc(x0 + i * gap, S - 34, r + 2.5, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fill();
          g.beginPath();
          g.arc(x0 + i * gap, S - 34, r, 0, Math.PI * 2);
          g.fillStyle = n === 2 ? '#FF6F9C' : '#9B6CF0';
          g.fill();
        }
      }
    }
    g.restore();
  };
  drawCell(0, 0, 0);
  for (let c = 1; c <= 19; c++) for (let s = 1; s <= 3; s++) {
    const cell = clueCell(c, s);
    if (cell < BLANK_CELL) drawCell(cell, c, s);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  atlasTex = tex;
  return tex;
}

const VERT = /* glsl */`
attribute vec3 aClue;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vP;
varying vec3 vLN;
varying vec3 vClue;
void main(){
  vec3 col = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    col = instanceColor;
  #endif
  vColor = col;
  vClue = aClue;
  vP = position;
  vLN = normal;
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform float uClue;
uniform float uSize;
uniform vec3 uLightDir;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uTint;
uniform float uTintAmt;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vP;
varying vec3 vLN;
varying vec3 vClue;
void main(){
  vec3 n = normalize(vLN);
  vec3 an = abs(n);
  vec3 p = vP / uSize;
  float cell; vec2 uv;
  if (an.x >= an.y && an.x >= an.z) {
    cell = vClue.x;
    uv = n.x > 0.0 ? vec2(0.5 - p.z, p.y + 0.5) : vec2(p.z + 0.5, p.y + 0.5);
  } else if (an.y >= an.z) {
    cell = vClue.y;
    uv = n.y > 0.0 ? vec2(p.x + 0.5, 0.5 - p.z) : vec2(p.x + 0.5, p.z + 0.5);
  } else {
    cell = vClue.z;
    uv = n.z > 0.0 ? vec2(p.x + 0.5, p.y + 0.5) : vec2(0.5 - p.x, p.y + 0.5);
  }
  vec3 N = normalize(vN);
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uGround, uSky, hemi);
  float dif = max(dot(N, uLightDir), 0.0);
  vec3 base = mix(vColor, uTint, uTintAmt);
  vec3 c = base * (amb * 0.66 + dif * 0.46);
  // 柔和的高光边缘
  c += vec3(0.05) * pow(1.0 - abs(N.y), 3.0);
  if (uClue > 0.001 && cell < 62.5) {
    float col = mod(cell, 8.0);
    float row = floor(cell / 8.0 + 0.001);
    vec2 auv = (vec2(col, 7.0 - row) + clamp(uv, 0.02, 0.98)) / 8.0;
    vec4 g = texture2D(uAtlas, auv);
    c = mix(c, g.rgb, g.a * uClue);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function makeVoxelMaterial(clue = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTex },
      uClue: { value: clue },
      uSize: { value: BLOCK },
      uTint: { value: new THREE.Color('#ffffff') },
      uTintAmt: { value: 0 },
      uLightDir: LIGHT.uLightDir,
      uSky: LIGHT.uSky,
      uGround: LIGHT.uGround,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

export function getModelMaterial() {
  if (!modelMat) modelMat = makeVoxelMaterial(0);
  return modelMat;
}

// 头显 / 手机用低面数圆角方块，桌面用更圆润的版本
export const LOW_POWER = typeof navigator !== 'undefined' && (/OculusBrowser|Quest|Pico|VR/i.test(navigator.userAgent) || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches));
export function getBlockGeometry() {
  if (!blockGeo) blockGeo = new RoundedBoxGeometry(BLOCK, BLOCK, BLOCK, LOW_POWER ? 1 : 2, 0.16);
  return blockGeo;
}

// 保护框：12 条棱组成的方框
export function getFrameGeometry() {
  if (frameGeo) return frameGeo;
  const e = 0.53, t = 0.085;
  const boxes = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    boxes.push([[0, a * e, b * e], [2 * e + t, t, t]]);
    boxes.push([[a * e, 0, b * e], [t, 2 * e + t, t]]);
    boxes.push([[a * e, b * e, 0], [t, t, 2 * e + t]]);
  }
  const pos = [], nor = [], idx = [];
  for (const [c, s] of boxes) {
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    g.translate(c[0], c[1], c[2]);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(i + base);
    g.dispose();
  }
  frameGeo = new THREE.BufferGeometry();
  frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  frameGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  frameGeo.setIndex(idx);
  return frameGeo;
}

// ---------- 提示数字 ----------
// 每个方块在 x/y/z 三个方向的提示（图集格子编号）
export function computeClues(w, h, d, isT) {
  const N = w * h * d;
  const out = new Float32Array(N * 3);
  const id = (x, y, z) => x + w * (y + h * z);
  const line = (len, get, write) => {
    let cnt = 0, seg = 0, prev = false;
    for (let i = 0; i < len; i++) { const t = get(i); if (t) { cnt++; if (!prev) seg++; } prev = t; }
    const cell = clueCell(cnt, seg);
    for (let i = 0; i < len; i++) write(i, cell);
  };
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++)
    line(w, (i) => isT(i, y, z), (i, c) => { out[id(i, y, z) * 3] = c; });
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++)
    line(h, (i) => isT(x, i, z), (i, c) => { out[id(x, i, z) * 3 + 1] = c; });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    line(d, (i) => isT(x, y, i), (i, c) => { out[id(x, y, i) * 3 + 2] = c; });
  return out;
}

// ---------- 网格射线（Amanatides-Woo） ----------
// origin/dir 位于“网格空间”：格子 (x,y,z) 占据 [x,x+1]×[y,y+1]×[z,z+1]
export function gridRaycast(o, dir, W, H, D, isSolid) {
  const size = [W, H, D];
  const oo = [o.x, o.y, o.z], dd = [dir.x, dir.y, dir.z];
  let tmin = 0, tmax = Infinity, enter = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) {
      if (oo[a] < 0 || oo[a] > size[a]) return null;
    } else {
      let t1 = (0 - oo[a]) / dd[a], t2 = (size[a] - oo[a]) / dd[a];
      const tn = Math.min(t1, t2), tf = Math.max(t1, t2);
      if (tn > tmin) { tmin = tn; enter = a; }
      tmax = Math.min(tmax, tf);
    }
  }
  if (tmin > tmax) return null;
  const p = [0, 0, 0], cell = [0, 0, 0], step = [0, 0, 0], tM = [0, 0, 0], tD = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    p[a] = oo[a] + dd[a] * (tmin + 1e-5);
    cell[a] = Math.min(size[a] - 1, Math.max(0, Math.floor(p[a])));
    step[a] = dd[a] > 0 ? 1 : dd[a] < 0 ? -1 : 0;
    if (step[a] === 0) { tM[a] = Infinity; tD[a] = Infinity; }
    else {
      const next = step[a] > 0 ? cell[a] + 1 : cell[a];
      tM[a] = (next - oo[a]) / dd[a];
      tD[a] = Math.abs(1 / dd[a]);
    }
  }
  let normal = enter >= 0 ? [0, 0, 0] : null;
  if (normal) normal[enter] = -step[enter];
  const maxIter = W + H + D + 4;
  for (let i = 0; i < maxIter; i++) {
    if (isSolid(cell[0], cell[1], cell[2])) return { x: cell[0], y: cell[1], z: cell[2], normal: normal || [0, 0, 0] };
    let a = 0;
    if (tM[1] < tM[a]) a = 1;
    if (tM[2] < tM[a]) a = 2;
    cell[a] += step[a];
    if (cell[a] < 0 || cell[a] >= size[a]) return null;
    tM[a] += tD[a];
    normal = [0, 0, 0];
    normal[a] = -step[a];
  }
  return null;
}

// 把世界射线转换到某个对象的网格空间
const _inv = new THREE.Matrix4();
export function rayToGrid(ray, object, W, H, D) {
  object.updateWorldMatrix(true, false);
  _inv.copy(object.matrixWorld).invert();
  const o = ray.origin.clone().applyMatrix4(_inv);
  const dir = ray.direction.clone().transformDirection(_inv);
  o.x += W / 2; o.y += H / 2; o.z += D / 2;
  return { o, dir };
}

// ---------- 可动画的体素模型 ----------
const K = (x, y, z) => x + ',' + y + ',' + z;
const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _col = new THREE.Color();

function domAxis(v) {
  const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
  if (a[0] >= a[1] && a[0] >= a[2]) return 0;
  if (a[1] >= a[2]) return 1;
  return 2;
}
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export class VoxelModel {
  constructor(data, { material } = {}) {
    this.data = data;
    const { w, h, d, voxels } = data;
    this.w = w; this.h = h; this.d = d;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.mat = material || getModelMaterial();
    this.meshes = [];
    this.anims = [];
    this.eyes = [];
    this.jumpT = -1;
    this.popT = -1;
    this.phase = Math.random() * 10;
    this.blinkNext = 1.5 + Math.random() * 2;
    this.blinkT = -1;
    this.maxDim = Math.max(w, h, d);

    const off = new THREE.Vector3((w - 1) / 2, (h - 1) / 2, (d - 1) / 2);
    const map = new Map();
    for (const v of voxels) map.set(K(v[0], v[1], v[2]), v);
    const pos = (v) => new THREE.Vector3(v[0] - off.x, v[1] - off.y, v[2] - off.z);

    // 模型中心（以躯干为准）
    const body = voxels.filter(v => v[4] === 0);
    const ref = body.length ? body : voxels;
    const center = new THREE.Vector3();
    ref.forEach(v => center.add(pos(v)));
    if (ref.length) center.divideScalar(ref.length);
    this.center = center;
    let maxYnon5 = -Infinity;
    voxels.forEach(v => { if (v[4] !== 5) maxYnon5 = Math.max(maxYnon5, v[1]); });

    // 连通分量（同部件 6 邻接）；躯干整体为一个组
    const seen = new Set();
    const comps = [];
    if (body.length) { body.forEach(v => seen.add(K(v[0], v[1], v[2]))); comps.push({ part: 0, vox: body }); }
    for (const v of voxels) {
      const key = K(v[0], v[1], v[2]);
      if (seen.has(key)) continue;
      const part = v[4];
      const q = [v], comp = [];
      seen.add(key);
      while (q.length) {
        const c = q.pop();
        comp.push(c);
        for (const n of NB) {
          const nk = K(c[0] + n[0], c[1] + n[1], c[2] + n[2]);
          const nv = map.get(nk);
          if (nv && !seen.has(nk) && nv[4] === part) { seen.add(nk); q.push(nv); }
        }
      }
      comps.push({ part, vox: comp });
    }

    let orbitGroup = null;
    for (const comp of comps) {
      const set = new Set(comp.vox.map(v => K(v[0], v[1], v[2])));
      const centroid = new THREE.Vector3();
      const bmin = new THREE.Vector3(Infinity, Infinity, Infinity), bmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      let minY = Infinity;
      const att = new THREE.Vector3(); let attN = 0;
      for (const v of comp.vox) {
        const p = pos(v);
        centroid.add(p); bmin.min(p); bmax.max(p);
        minY = Math.min(minY, v[1]);
        if (comp.part !== 0) for (const n of NB) {
          const nk = K(v[0] + n[0], v[1] + n[1], v[2] + n[2]);
          if (map.has(nk) && !set.has(nk)) { att.add(p).add(new THREE.Vector3(n[0] / 2, n[1] / 2, n[2] / 2)); attN++; }
        }
      }
      centroid.divideScalar(comp.vox.length);
      const bcenter = bmin.clone().add(bmax).multiplyScalar(0.5);
      let pivot;
      if (attN) pivot = att.divideScalar(attN);
      else {
        // 没有连接点：取包围盒上朝向模型中心的一侧
        const dir = center.clone().sub(centroid);
        const a = domAxis(dir);
        pivot = bcenter.clone();
        pivot.setComponent(a, dir.getComponent(a) > 0 ? bmax.getComponent(a) + 0.5 : bmin.getComponent(a) - 0.5);
      }
      const anim = { part: comp.part, phase: Math.random() * Math.PI * 2 };
      const holder = new THREE.Group();
      let origin;
      if (comp.part === 0) origin = new THREE.Vector3();
      else if (comp.part === 1 || comp.part === 2) {
        origin = pivot;
        let dv = centroid.clone().sub(pivot);
        if (dv.lengthSq() < 1e-4) dv = centroid.clone().sub(center);
        const a = domAxis(dv);
        anim.axis = a === 0 ? AXES[2] : a === 2 ? AXES[0] : AXES[2];
        anim.sign = comp.part === 1 ? 1 : -1;
        anim.phase = 0;
      } else if (comp.part === 3) {
        origin = bcenter;
        const ext = bmax.clone().sub(bmin);
        let a = 1;
        if (ext.y <= ext.x && ext.y <= ext.z) a = 1;
        else if (ext.z <= ext.x) a = 2;
        else a = 0;
        anim.axis = AXES[a];
      } else if (comp.part === 4) {
        origin = attN ? pivot : new THREE.Vector3(bcenter.x, bmin.y - 0.5, bcenter.z);
        const dv = centroid.clone().sub(origin);
        const a = dv.lengthSq() > 1e-4 ? domAxis(dv) : 1;
        anim.axis = a;
        anim.dirSign = dv.getComponent(a) >= 0 ? 1 : -1;
      } else {
        if (minY > maxYnon5) { anim.mode = 'rise'; origin = centroid; }
        else {
          anim.mode = 'orbit';
          origin = centroid;
          if (!orbitGroup) {
            orbitGroup = new THREE.Group();
            orbitGroup.position.set(center.x, 0, center.z);
            this.inner.add(orbitGroup);
            this.anims.push({ part: 'orbitRoot', group: orbitGroup });
          }
        }
      }
      anim.group = holder;
      holder.position.copy(origin);
      if (anim.mode === 'orbit') {
        holder.position.sub(orbitGroup.position);
        orbitGroup.add(holder);
      } else this.inner.add(holder);
      anim.base = holder.position.clone();
      this.anims.push(anim);

      // 普通方块与“眼睛”方块分开，眼睛会眨
      const normal = [], eyes = [];
      for (const v of comp.vox) (EYE_COLORS.has(String(v[3]).toLowerCase()) ? eyes : normal).push(v);
      const mk = (list, isEye) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(getBlockGeometry(), this.mat, list.length);
        mesh.frustumCulled = false;
        list.forEach((v, i) => {
          const p = pos(v).sub(origin);
          _m.makeTranslation(p.x, p.y, p.z);
          mesh.setMatrixAt(i, _m);
          mesh.setColorAt(i, _col.set(v[3]));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        holder.add(mesh);
        this.meshes.push(mesh);
        if (isEye) this.eyes.push({ mesh, pts: list.map(v => pos(v).sub(origin)) });
      };
      mk(normal, false);
      mk(eyes, true);
    }
    // 包围半径，用于拾取与取景
    let r = 0;
    voxels.forEach(v => { r = Math.max(r, pos(v).length()); });
    this.radius = r + 0.8;
  }

  jump() { this.jumpT = 0; }
  pop() { this.popT = 0; }

  update(dt, t, speed = 1) {
    const T = t * speed + this.phase;
    // 躯干呼吸
    const br = Math.sin(T * 2.2);
    this.inner.position.y = br * 0.07;
    this.inner.scale.set(1 + br * 0.012, 1 + br * 0.025, 1 + br * 0.012);
    for (const a of this.anims) {
      const g = a.group;
      if (a.part === 'orbitRoot') { g.rotation.y = T * 0.7; continue; }
      switch (a.part) {
        case 1: case 2: {
          const ang = a.sign * Math.sin(T * 3.4) * 0.42;
          g.quaternion.setFromAxisAngle(a.axis, ang);
          break;
        }
        case 3:
          g.quaternion.setFromAxisAngle(a.axis, T * 3.2);
          break;
        case 4: {
          const s = Math.sin(T * 4.2 + a.phase * 0.2);
          const k = 0.5 + 0.5 * s;
          const sc = [1 - 0.07 * s, 1 - 0.07 * s, 1 - 0.07 * s];
          sc[a.axis] = 1 + 0.17 * s;
          g.scale.set(sc[0], sc[1], sc[2]);
          g.position.copy(a.base);
          g.position.setComponent(a.axis, a.base.getComponent(a.axis) + a.dirSign * 0.35 * k);
          break;
        }
        case 5:
          if (a.mode === 'rise') {
            const u = ((T * 0.33 + a.phase) % 1 + 1) % 1;
            g.position.set(a.base.x + Math.sin(T * 2 + a.phase) * 0.25, a.base.y + u * 2.6, a.base.z);
            g.scale.setScalar(1 - u * 0.8);
          } else {
            g.position.set(a.base.x, a.base.y + Math.sin(T * 2.4 + a.phase) * 0.35, a.base.z);
            g.rotation.y = Math.sin(T * 1.5 + a.phase) * 0.5;
          }
          break;
        default: break;
      }
    }
    // 眨眼
    if (this.eyes.length) {
      this.blinkNext -= dt;
      if (this.blinkNext <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkNext = 2 + Math.random() * 3; }
      let sy = 1;
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const u = this.blinkT / 0.16;
        sy = u < 1 ? Math.max(0.12, Math.abs(1 - 2 * u)) : 1;
        if (u >= 1) this.blinkT = -1;
        for (const e of this.eyes) {
          e.pts.forEach((p, i) => {
            _m.compose(_p.copy(p), _q.identity(), _s.set(1.04, sy, 1.04));
            e.mesh.setMatrixAt(i, _m);
          });
          e.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
    // 跳跃 & 出场弹出
    let jy = 0, sq = 1;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const u = this.jumpT / 0.7;
      if (u >= 1) this.jumpT = -1;
      else {
        jy = Math.sin(Math.PI * u) * this.maxDim * 0.28;
        sq = 1 + Math.sin(Math.PI * 2 * u) * 0.08;
      }
    }
    let ps = 1;
    if (this.popT >= 0) {
      this.popT += dt;
      const u = Math.min(1, this.popT / 0.9);
      ps = 1 + Math.sin(u * Math.PI * 3) * (1 - u) * 0.18;
      if (u >= 1) this.popT = -1;
    }
    this.group.children[0].position.y += jy;
    this.inner.scale.y *= sq * ps;
    this.inner.scale.x *= (2 - sq) * ps;
    this.inner.scale.z *= (2 - sq) * ps;
  }

  dispose() {
    for (const m of this.meshes) { m.dispose(); m.parent && m.parent.remove(m); }
    this.meshes = [];
    this.group.parent && this.group.parent.remove(this.group);
  }
}
