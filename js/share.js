// 截图 / 缩略图 / 分享卡片（带游戏名、网址、二维码）
import * as THREE from 'three';
import qrcode from '../vendor/qrcode.mjs';
import { VoxelModel } from './voxel.js';
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
  let qr;
  try { qr = qrcode(0, 'M'); qr.addData(text); qr.make(); } catch (e) {
    qr = qrcode(0, 'L'); qr.addData(siteUrl()); qr.make();
  }
  const n = qr.getModuleCount();
  const cell = size / n;
  g.fillStyle = '#4A3F6B';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) {
      rr(g, x + c * cell + cell * 0.06, y + r * cell + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.3);
      g.fill();
    }
  }
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

export async function makeShareCard({ entry, result, link, index }) {
  try { await document.fonts.ready; } catch (e) { /* */ }
  const W = 1080, H = 1440;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#FFD1E3'); bg.addColorStop(0.5, '#FFF1D6'); bg.addColorStop(1, '#CDEBFF');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // 彩色小方块装饰
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

  // 主卡片
  g.save();
  g.shadowColor = 'rgba(120,80,160,0.25)'; g.shadowBlur = 50; g.shadowOffsetY = 18;
  rr(g, 70, 318, W - 140, 820, 60);
  g.fillStyle = 'rgba(255,255,255,0.94)'; g.fill();
  g.restore();
  // 模型
  const img = renderModel(entry.data, 900, { t: 1.3 });
  g.save();
  g.fillStyle = 'rgba(160,120,200,0.18)';
  g.beginPath(); g.ellipse(W / 2, 930, 230, 34, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.drawImage(img, W / 2 - 330, 300, 660, 660);
  // 已唤醒徽章
  g.save();
  g.translate(W - 210, 390); g.rotate(0.18);
  rr(g, -110, -40, 220, 80, 40);
  g.fillStyle = '#FF7EA6'; g.fill();
  g.fillStyle = '#fff'; g.font = '44px "ZCOOL KuaiLe", sans-serif';
  g.fillText(result && result.ok ? '已唤醒!' : '新关卡!', 0, 4);
  g.restore();

  const lvName = (index ? `Lv.${index} · ` : '') + entry.name;
  g.fillStyle = '#5A4A86';
  g.font = '62px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  g.fillText(lvName, W / 2, 1012);
  if (result && result.ok) {
    const y = 1086;
    for (let i = 0; i < 3; i++) star(g, W / 2 - 330 + i * 62, y, 25, i < result.stars ? '#FFC93C' : '#E8E1F2');
    g.font = '700 40px "Baloo 2", "ZCOOL KuaiLe", sans-serif';
    g.fillStyle = '#7A6E99';
    g.textAlign = 'left';
    g.fillText('用时 ' + fmtTime(result.time), W / 2 - 150, y + 2);
    g.fillText('失误 ' + result.mistakes, W / 2 + 140, y + 2);
    g.textAlign = 'center';
  } else {
    g.font = '36px "ZCOOL KuaiLe", sans-serif';
    g.fillStyle = '#7A6E99';
    const L = entry.data;
    g.fillText(`${L.w}×${L.h}×${L.d} 的体素谜题，${entry.author ? entry.author + ' 出品，' : ''}来挑战吧！`, W / 2, 1086);
  }

  // 底部：网址 + 二维码
  const url = link || siteUrl();
  rr(g, 70, 1176, W - 140, 214, 44);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
  g.textAlign = 'left';
  g.fillStyle = '#5A4A86';
  g.font = '46px "ZCOOL KuaiLe", sans-serif';
  g.fillText(link && link !== siteUrl() ? '扫码挑战这个关卡' : '扫码一起来玩', 116, 1236);
  g.font = '30px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  g.fillStyle = '#8C7FB0';
  g.fillText(CONFIG.SHARE_SLOGAN, 116, 1294);
  g.font = '700 30px "Baloo 2", sans-serif';
  g.fillStyle = '#FF6F9C';
  let shown = siteUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (shown.length > 34) shown = shown.slice(0, 33) + '…';
  g.fillText(shown, 116, 1346);
  g.fillStyle = '#fff';
  rr(g, W - 290, 1188, 190, 190, 26); g.fill();
  drawQR(g, url.length > 1400 ? siteUrl() : url, W - 280, 1198, 170);
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
