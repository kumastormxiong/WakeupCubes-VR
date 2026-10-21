// 关卡 <-> 分享码（压缩 + base64url），无需服务器即可跨设备分享
import { CONFIG } from './config.js';

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeLevel(entry) {
  const L = entry.data;
  const pal = [], pi = new Map();
  const vox = [];
  // 按格子序号排序后差分编码，压缩效果更好
  const list = L.voxels.map(v => ({ i: v[0] + L.w * (v[1] + L.h * v[2]), c: String(v[3]).toLowerCase(), p: v[4] | 0 }))
    .sort((a, b) => a.i - b.i);
  let prev = 0;
  for (const v of list) {
    if (!pi.has(v.c)) { pi.set(v.c, pal.length); pal.push(v.c.replace('#', '')); }
    vox.push(v.i - prev, pi.get(v.c) * 6 + v.p);
    prev = v.i;
  }
  const obj = { v: 1, n: entry.name || '无名关卡', a: entry.author || '', s: [L.w, L.h, L.d], p: pal, q: vox };
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64url(await pipe(bytes, new CompressionStream('deflate'))); } catch (e) { /* 回退 */ }
  }
  return 'j' + b64url(bytes);
}

export function extractCode(input) {
  let s = String(input || '').trim();
  const m = s.match(/[?&#]share=([A-Za-z0-9_\-]+)/);
  if (m) s = m[1];
  return s.replace(/[^A-Za-z0-9_\-]/g, '');
}

export async function decodeLevel(input) {
  const code = extractCode(input);
  if (code.length < 8) throw new Error('关卡码太短了');
  const kind = code[0];
  let bytes = unb64url(code.slice(1));
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压关卡码');
    bytes = await pipe(bytes, new DecompressionStream('deflate'));
  } else if (kind !== 'j') throw new Error('无法识别的关卡码');
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || obj.v !== 1 || !Array.isArray(obj.s)) throw new Error('关卡码格式不正确');
  const [w, h, d] = obj.s.map(n => n | 0);
  if (![w, h, d].every(n => n >= 2 && n <= 16)) throw new Error('关卡尺寸不正确');
  const pal = (obj.p || []).map(c => {
    if (!/^[0-9a-fA-F]{6}$/.test(c)) throw new Error('颜色数据不正确');
    return '#' + c.toUpperCase();
  });
  const voxels = [];
  let idx = 0;
  const q = obj.q || [];
  for (let k = 0; k + 1 < q.length; k += 2) {
    idx += q[k] | 0;
    const cp = q[k + 1] | 0;
    const x = idx % w, y = Math.floor(idx / w) % h, z = Math.floor(idx / (w * h));
    if (z >= d) throw new Error('方块坐标越界');
    const color = pal[Math.floor(cp / 6)];
    if (!color) throw new Error('颜色索引不正确');
    voxels.push([x, y, z, color, cp % 6]);
  }
  if (!voxels.length) throw new Error('这个关卡是空的');
  const name = String(obj.n || '分享关卡').slice(0, 24);
  const author = String(obj.a || '').slice(0, 16);
  return { name, author, data: { w, h, d, voxels }, code };
}

export function siteUrl() {
  if (CONFIG.SITE_URL) return CONFIG.SITE_URL.replace(/\/?$/, '/');
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.pathname = u.pathname.replace(/index\.html$/, '');
  return u.toString();
}

export function shareLink(code) {
  return siteUrl() + '?share=' + code;
}
