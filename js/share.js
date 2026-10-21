// 截图 / 缩略图 / 分享卡片（带游戏名、网址、二维码）
import * as THREE from 'three';
import qrcode from '../vendor/qrcode.mjs';
import { VoxelModel, computeClues, makeVoxelMaterial, getBlockGeometry } from './voxel.js';
import { CONFIG } from './config.js';
import { siteUrl } from './codec.js';

let snap = null;
function getSnap() {
  if (!snap) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setPixelRatio(1);
    snap = { r, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(28, 1, 0.1, 1000) };
  }
  return snap;
}

export function renderModel(data, size = 512, { t = 0.7, yaw = -0.55, pitch = 0.42 } = {}) {
  const { r, scene, cam } = getSnap();
  r.setSize(size, size, false);
  const m = new VoxelModel(data);
  m.phase = 0;
  m.update(0.016, t, 1);
  m.group.rotation.y = yaw;
  scene.add(m.group);
  const R = m.radius * 0.92;
  const dist = R / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(0, pitch, 1).normalize().multiplyScalar(dist);
  cam.lookAt(0, 0, 0);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(r.domElement, 0, 0);
  m.dispose();
  return c;
}

// 渲染“还没解开”的谜题方块（带数字），分享时不剧透
export function renderPuzzle(data, size = 900, { yaw = -0.62, pitch = 0.62 } = {}) {
  const { r, scene, cam } = getSnap();
  r.setSize(size, size, false);
  const { w, h, d, voxels } = data;
  const N = w * h * d;
  const set = new Set(voxels.map(v => v[0] + ',' + v[1] + ',' + v[2]));
  const clues = computeClues(w, h, d, (x, y, z) => set.has(x + ',' + y + ',' + z));
  const geo = getBlockGeometry().clone();
  geo.setAttribute('aClue', new THREE.InstancedBufferAttribute(clues, 3));
  const mat = makeVoxelMaterial(1);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4(), col = new THREE.Color('#FFF4E3');
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = x + w * (y + h * z);
    m.makeTranslation(x - (w - 1) / 2, y - (h - 1) / 2, z - (d - 1) / 2);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col);
  }
  const grp = new THREE.Group();
  grp.add(mesh);
  grp.rotation.y = yaw;
  scene.add(grp);
  const R = Math.sqrt(w * w + h * h + d * d) / 2 + 0.2;
  const dist = R / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(0, pitch, 1).normalize().multiplyScalar(dist);
  cam.lookAt(0, 0, 0);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(r.domElement, 0, 0);
  scene.remove(grp);
  mesh.dispose(); geo.dispose(); mat.dispose();
  return c;
}

const thumbCache = new Map();
export function thumbnail(entry, size = 220) {
  const key = entry.id + ':' + entry.data.voxels.length + ':' + entry.data.w + entry.data.h + entry.data.d + ':' + size;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const url = renderModel(entry.data, size).toDataURL('image/png');
  thumbCache.set(key, url);
  return url;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function star(g, cx, cy, r, fill) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.48 : r;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.lineJoin = 'round'; g.lineWidth = r * 0.18; g.strokeStyle = fill; g.stroke();
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

function drawQR(g, text, x, y, size) {
  // 关卡码是纯数字：网址部分用字节模式，数字部分用数字模式，二维码更简单
  let qr;
  try {
    qr = qrcode(0, 'L');
    const m = text.match(/^(.*[?&]c=)(\d+)$/);
    if (m) { qr.addData(m[1], 'Byte'); qr.addData(m[2], 'Numeric'); } else qr.addData(text);
    qr.make();
  } catch (e) {
    qr = qrcode(0, 'L'); qr.addData(siteUrl()); qr.make();
  }
  const n = qr.getModuleCount();
  const cell = Math.floor(size / n);
  const off = (size - cell * n) / 2;
  g.fillStyle = '#2E2648';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) g.fillRect(x + off + c * cell, y + off + r * cell, cell, cell);
  }
  return n;
}

const TILE_COLS = ['#FF8FAB', '#FFC93C', '#5FD39C', '#6FB1FF', '#B08CF0', '#FF9F5A'];

export function drawLogoTiles(g, text, cx, cy, tile, fontPx) {
  const chars = [...text];
  const gap = tile * 0.12;
  const total = chars.length * tile + (chars.length - 1) * gap;
  let x = cx - total / 2;
  chars.forEach((ch, i) => {
    g.save();
    g.translate(x + tile / 2, cy + (i % 2 ? 6 : -6));
    g.rotate(((i % 3) - 1) * 0.07);
    rr(g, -tile / 2, -tile / 2 + 10, tile, tile, tile * 0.26);
    g.fillStyle = 'rgba(80,50,120,0.18)'; g.fill();
    rr(g, -tile / 2, -tile / 2, tile, tile, tile * 0.26);
    g.fillStyle = TILE_COLS[i % TILE_COLS.length]; g.fill();
    rr(g, -tile / 2 + tile * 0.1, -tile / 2 + tile * 0.08, tile * 0.8, tile * 0.22, tile * 0.11);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
    g.fillStyle = '#FFFFFF';
    g.font = `${fontPx}px "ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 0, 4);
    g.restore();
    x += tile + gap;
  });
}

export async function makeShareCard({ entry, result, qrUrl, index, player = '' }) {
  try { await document.fonts.ready; } catch (e) { /* */ }
  const W = 1080, H = 1440;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#FFD1E3'); bg.addColorStop(0.5, '#FFF1D6'); bg.addColorStop(1, '#CDEBFF');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, y = rnd() * H, s = 14 + rnd() * 34;
    g.save(); g.translate(x, y); g.rotate(rnd() * 3);
    rr(g, -s / 2, -s / 2, s, s, s * 0.28);
    g.fillStyle = TILE_COLS[i % TILE_COLS.length]; g.globalAlpha = 0.22 + rnd() * 0.25; g.fill();
    g.restore();
  }
  g.globalAlpha = 1;

  drawLogoTiles(g, CONFIG.GAME_NAME, W / 2, 150, 124, 86);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 46px "Baloo 2", sans-serif';
  g.fillStyle = '#5A4A86';
  g.fillText(CONFIG.GAME_NAME_EN, W / 2, 268);

  g.save();
  g.shadowColor = 'rgba(120,80,160,0.25)'; g.shadowBlur = 50; g.shadowOffsetY = 18;
  rr(g, 70, 318, W - 140, 830, 60);
  g.fillStyle = 'rgba(255,255,255,0.94)'; g.fill();
  g.restore();

  // 还没唤醒的谜题方块（不剧透最终样子）
  const img = renderPuzzle(entry.data, 900);
  g.save();
  g.fillStyle = 'rgba(160,120,200,0.18)';
  g.beginPath(); g.ellipse(W / 2, 905, 240, 34, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.drawImage(img, W / 2 - 300, 330, 600, 600);
  // Zzz
  g.save();
  g.fillStyle = '#9B7FE6'; g.strokeStyle = '#fff'; g.lineWidth = 10; g.lineJoin = 'round';
  [[W / 2 + 230, 470, 52], [W / 2 + 285, 410, 66], [W / 2 + 350, 345, 82]].forEach(([x, y, s]) => {
    g.font = `800 ${s}px "Baloo 2", sans-serif`;
    g.strokeText('Z', x, y); g.fillText('Z', x, y);
  });
  g.restore();
  // 角标
  g.save();
  g.translate(250, 400); g.rotate(-0.16);
  rr(g, -120, -40, 240, 80, 40);
  g.fillStyle = '#FFC93C'; g.fill();
  g.fillStyle = '#6B4A00'; g.font = '40px "ZCOOL KuaiLe", sans-serif';
  g.fillText('等你唤醒', 0, 4);
  g.restore();

  // 主标语
  g.fillStyle = '#FF6F9C';
  g.font = '76px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  g.fillText('快来唤醒我吧！', W / 2, 990);
  const L = entry.data;
  const dims = `${L.w}×${L.h}×${L.d}`;
  g.fillStyle = '#5A4A86';
  g.font = '38px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  const sub = index ? `Lv.${index} · ${dims} 神秘小伙伴` : `「${entry.name}」${entry.author ? ' by ' + entry.author : ''} · ${dims}`;
  g.fillText(sub, W / 2, 1060);
  const who = player ? `「${player}」` : '我';
  if (result && result.ok) {
    const y = 1112;
    g.font = '34px "ZCOOL KuaiLe", "Baloo 2", sans-serif';
    const msg = `${who}用 ${fmtTime(result.time)} 叫醒了它，你也来试试！`;
    const tw = g.measureText(msg).width;
    const x0 = W / 2 - (tw + 170) / 2;
    for (let i = 0; i < 3; i++) star(g, x0 + 22 + i * 50, y, 20, i < result.stars ? '#FFC93C' : '#E8E1F2');
    g.fillStyle = '#7A6E99';
    g.textAlign = 'left';
    g.fillText(msg, x0 + 170, y + 2);
    g.textAlign = 'center';
  } else {
    g.font = '32px "ZCOOL KuaiLe", sans-serif';
    g.fillStyle = '#7A6E99';
    g.fillText(player ? `${who}邀请你来挑战，把它叫醒就知道它是谁啦～` : '看数字敲方块，把它叫醒就知道它是谁啦～', W / 2, 1112);
  }

  // 底部：网址 + 简洁二维码
  const url = qrUrl || siteUrl();
  rr(g, 70, 1168, W - 140, 252, 44);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  g.textAlign = 'left';
  g.fillStyle = '#5A4A86';
  g.font = '46px "ZCOOL KuaiLe", sans-serif';
  g.fillText(url !== siteUrl() ? '扫码直接挑战这一关' : '扫码来玩', 112, 1236);
  g.font = '28px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  g.fillStyle = '#8C7FB0';
  g.fillText(CONFIG.SHARE_SLOGAN, 112, 1294);
  g.font = '700 32px "Baloo 2", sans-serif';
  g.fillStyle = '#FF6F9C';
  let shown = siteUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (shown.length > 30) shown = shown.slice(0, 29) + '…';
  g.fillText(shown, 112, 1356);
  g.fillStyle = '#fff';
  rr(g, W - 338, 1180, 228, 228, 22); g.fill();
  drawQR(g, url, W - 322, 1196, 196);
  return cv;
}

export function canvasToBlob(cv) {
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

export async function shareCanvas(cv, { title, text, url, filename = 'wakeup-cubes.png' }) {
  const blob = await canvasToBlob(cv);
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title, text: text + (url ? '\n' + url : '') }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  downloadBlob(blob, filename);
  return 'download';
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
