// 关卡 <-> 关卡码
// 新格式：上下文建模 + 自适应二进制算术编码，输出为纯数字串。
// 纯数字可以用二维码的“数字模式”编码（每位仅 3.3 bit），所以二维码非常简单。
// 旧格式（z/j 开头的 base64）仍可解码。
import { CONFIG } from './config.js';
import { PALETTE } from './palette.js';

// ---------- 算术编码器（32 位整数区间，12 位概率） ----------
const HALF = 2 ** 31, QUARTER = 2 ** 30, MAXV = 2 ** 32 - 1;

class Encoder {
  constructor() { this.low = 0; this.high = MAXV; this.pending = 0; this.bits = []; }
  out(b) { this.bits.push(b); while (this.pending > 0) { this.bits.push(1 - b); this.pending--; } }
  encode(bit, p0) {
    const range = this.high - this.low + 1;
    const mid = this.low + Math.floor(range * p0 / 4096) - 1;
    if (bit) this.low = mid + 1; else this.high = mid;
    for (;;) {
      if (this.high < HALF) this.out(0);
      else if (this.low >= HALF) { this.out(1); this.low -= HALF; this.high -= HALF; }
      else if (this.low >= QUARTER && this.high < 3 * QUARTER) { this.pending++; this.low -= QUARTER; this.high -= QUARTER; }
      else break;
      this.low = this.low * 2; this.high = this.high * 2 + 1;
    }
  }
  finish() { this.pending++; this.out(this.low < QUARTER ? 0 : 1); return this.bits; }
}

class Decoder {
  constructor(bits) {
    this.bits = bits; this.pos = 0; this.low = 0; this.high = MAXV; this.value = 0;
    for (let i = 0; i < 32; i++) this.value = this.value * 2 + this.next();
  }
  next() { return this.pos < this.bits.length ? this.bits[this.pos++] : 0; }
  decode(p0) {
    const range = this.high - this.low + 1;
    const mid = this.low + Math.floor(range * p0 / 4096) - 1;
    const bit = this.value > mid ? 1 : 0;
    if (bit) this.low = mid + 1; else this.high = mid;
    for (;;) {
      if (this.high < HALF) { /* */ }
      else if (this.low >= HALF) { this.low -= HALF; this.high -= HALF; this.value -= HALF; }
      else if (this.low >= QUARTER && this.high < 3 * QUARTER) { this.low -= QUARTER; this.high -= QUARTER; this.value -= QUARTER; }
      else break;
      this.low = this.low * 2; this.high = this.high * 2 + 1; this.value = this.value * 2 + this.next();
    }
    return bit;
  }
}

// 自适应模型：同一套代码既能编码也能解码
class Model {
  constructor(coder, decoding) { this.c = coder; this.dec = decoding; this.p = new Map(); }
  bit(ctx, b) {
    // 计数自适应：样本少时学得快，样本多时更稳定
    let st = this.p.get(ctx);
    if (!st) { st = { p: 2048, n: 0 }; this.p.set(ctx, st); }
    const p = Math.min(4064, Math.max(32, Math.round(st.p)));
    if (this.dec) b = this.c.decode(p); else this.c.encode(b, p);
    st.n = Math.min(st.n + 1, 30);
    st.p += ((b ? 0 : 4096) - st.p) / (st.n + 0.6);
    return b;
  }
  raw(n, v = 0) { // 等概率 n 位
    let r = 0;
    for (let i = n - 1; i >= 0; i--) {
      const b = this.dec ? this.c.decode(2048) : ((v >> i) & 1);
      if (!this.dec) this.c.encode(b, 2048);
      r = r * 2 + b;
    }
    return r;
  }
  tree(ctx, nbits, v = 0) { // 二叉树自适应编码一个 nbits 的数
    let node = 1;
    for (let i = nbits - 1; i >= 0; i--) {
      const b = this.bit(ctx + ':' + node, (v >> i) & 1);
      node = node * 2 + b;
    }
    return node - (1 << nbits);
  }
}

// 文字：ASCII 7 位 / 常用汉字 15 位 / 其他 21 位
function codeText(m, s = '') {
  const chars = m.dec ? [] : [...s].slice(0, 20);
  const n = m.raw(5, chars.length);
  let out = '';
  for (let i = 0; i < n; i++) {
    const cp = m.dec ? 0 : chars[i].codePointAt(0);
    const kind = m.raw(2, cp < 128 ? 0 : (cp >= 0x4E00 && cp < 0x4E00 + 32768) ? 1 : 2);
    let v;
    if (kind === 0) v = m.raw(7, cp);
    else if (kind === 1) v = 0x4E00 + m.raw(15, cp - 0x4E00);
    else v = m.raw(21, cp);
    out += String.fromCodePoint(v);
  }
  return out;
}

const PAL_IDX = new Map(PALETTE.map((p, i) => [p.c.toLowerCase(), i]));
const mirPart = (p) => (p === 1 ? 2 : p === 2 ? 1 : p);

function codeLevel(m, lv) {
  const dec = m.dec;
  m.raw(2, 1); // 版本
  const L = dec ? null : lv.data;
  const w = m.raw(4, dec ? 0 : L.w - 1) + 1;
  const h = m.raw(4, dec ? 0 : L.h - 1) + 1;
  const d = m.raw(4, dec ? 0 : L.d - 1) + 1;
  const name = codeText(m, dec ? '' : lv.name);
  const author = codeText(m, dec ? '' : lv.author || '');
  // 颜色+部件组合表
  let pairs = [];
  const pairIdx = new Map();
  const cells = new Int16Array(w * h * d).fill(-1);
  if (!dec) {
    for (const v of L.voxels) {
      const key = String(v[3]).toLowerCase() + '|' + (v[4] | 0);
      if (!pairIdx.has(key)) { pairIdx.set(key, pairs.length); pairs.push([String(v[3]).toLowerCase(), v[4] | 0]); }
      cells[v[0] + w * (v[1] + h * v[2])] = pairIdx.get(key);
    }
  }
  const K = m.raw(8, pairs.length);
  for (let i = 0; i < K; i++) {
    const c = dec ? null : pairs[i][0];
    const inPal = m.raw(1, !dec && PAL_IDX.has(c) ? 1 : 0);
    let col;
    if (inPal) col = PALETTE[m.raw(5, dec ? 0 : PAL_IDX.get(c))].c.toLowerCase();
    else col = '#' + m.raw(24, dec ? 0 : parseInt(c.slice(1), 16)).toString(16).padStart(6, '0');
    const part = m.raw(3, dec ? 0 : pairs[i][1]);
    if (dec) { pairIdx.set(col + '|' + part, pairs.length); pairs.push([col, part]); }
  }
  const nb = Math.max(1, Math.ceil(Math.log2(Math.max(2, K))));
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d ? -1 : cells[x + w * (y + h * z)]);
  const occ = (x, y, z) => (at(x, y, z) >= 0 ? 1 : 0);
  const mirrorOf = (k) => (k < 0 ? -1 : pairIdx.has(pairs[k][0] + '|' + mirPart(pairs[k][1])) ? pairIdx.get(pairs[k][0] + '|' + mirPart(pairs[k][1])) : -1);
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = x + w * (y + h * z);
    const mx = w - 1 - x;
    const mk = mx < x;
    const mOcc = mk ? occ(mx, y, z) : 0;
    const ctx = 'o' + occ(x - 1, y, z) + occ(x, y - 1, z) + occ(x, y, z - 1) + occ(x - 1, y - 1, z) + occ(x, y - 1, z - 1) + (mk ? 1 + mOcc : 0);
    const here = m.bit(ctx, dec ? 0 : (cells[i] >= 0 ? 1 : 0));
    if (!here) { if (dec) cells[i] = -1; continue; }
    // 颜色：先猜镜像/左/下/后的邻居
    const cands = [];
    if (mk && mOcc) cands.push(['m', mirrorOf(at(mx, y, z))]);
    cands.push(['l', at(x - 1, y, z)], ['d', at(x, y - 1, z)], ['b', at(x, y, z - 1)]);
    const seen = new Set();
    let val = dec ? -1 : cells[i];
    let found = -1;
    for (const [tag, c] of cands) {
      if (c < 0 || seen.has(c)) continue;
      seen.add(c);
      const hit = m.bit('c' + tag + seen.size, dec ? 0 : (c === val ? 1 : 0));
      if (hit) { found = c; break; }
    }
    if (found < 0) found = K > 1 ? m.tree('k', nb, dec ? 0 : val) : 0;
    if (dec) cells[i] = Math.min(found, K - 1);
  }
  if (dec) {
    const voxels = [];
    for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = cells[x + w * (y + h * z)];
      if (k >= 0) voxels.push([x, y, z, pairs[k][0].toUpperCase(), pairs[k][1]]);
    }
    return { name, author, data: { w, h, d, voxels } };
  }
  return null;
}

// 比特 <-> 十进制数字串（7 字节 ↔ 17 位数字）
const TAIL_DIGITS = [0, 3, 5, 8, 10, 13, 15];
function bitsToDigits(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = b * 2 + (bits[i + j] || 0);
    bytes.push(b);
  }
  while (bytes.length && bytes[bytes.length - 1] === 0) bytes.pop();
  let s = '';
  for (let i = 0; i < bytes.length; i += 7) {
    const chunk = bytes.slice(i, i + 7);
    let n = 0n;
    for (const b of chunk) n = n * 256n + BigInt(b);
    s += n.toString().padStart(chunk.length === 7 ? 17 : TAIL_DIGITS[chunk.length], '0');
  }
  return s;
}
function digitsToBits(s) {
  const bytes = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.length - i;
    const take = rest >= 17 ? 17 : rest;
    const nb = take === 17 ? 7 : TAIL_DIGITS.indexOf(take);
    if (nb < 0) throw new Error('关卡码长度不对');
    let n = BigInt(s.slice(i, i + take));
    const chunk = [];
    for (let k = 0; k < nb; k++) { chunk.unshift(Number(n & 255n)); n >>= 8n; }
    bytes.push(...chunk);
    i += take;
  }
  const bits = [];
  for (const b of bytes) for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
  return bits;
}

export async function encodeLevel(entry) {
  const enc = new Encoder();
  codeLevel(new Model(enc, false), entry);
  return bitsToDigits(enc.finish());
}

// ---------- 旧格式（兼容） ----------
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
async function decodeLegacy(code) {
  const kind = code[0];
  let bytes = unb64url(code.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate'));
  else if (kind !== 'j') throw new Error('无法识别的关卡码');
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  const [w, h, d] = obj.s.map(n => n | 0);
  const pal = obj.p.map(c => '#' + c.toUpperCase());
  const voxels = [];
  let idx = 0;
  for (let k = 0; k + 1 < obj.q.length; k += 2) {
    idx += obj.q[k] | 0;
    const cp = obj.q[k + 1] | 0;
    voxels.push([idx % w, Math.floor(idx / w) % h, Math.floor(idx / (w * h)), pal[Math.floor(cp / 6)], cp % 6]);
  }
  return { name: String(obj.n || '分享关卡').slice(0, 24), author: String(obj.a || '').slice(0, 16), data: { w, h, d, voxels } };
}

export function extractCode(input) {
  let s = String(input || '').trim();
  const m = s.match(/[?&#](?:c|share)=([A-Za-z0-9_\-]+)/);
  if (m) s = m[1];
  return s.replace(/[^A-Za-z0-9_\-]/g, '');
}

export async function decodeLevel(input) {
  const code = extractCode(input);
  if (code.length < 6) throw new Error('关卡码太短了');
  let lv;
  if (/^\d+$/.test(code)) {
    const m = new Model(new Decoder(digitsToBits(code)), true);
    lv = codeLevel(m, null);
  } else lv = await decodeLegacy(code);
  const { w, h, d } = lv.data;
  if (![w, h, d].every(n => n >= 2 && n <= 16)) throw new Error('关卡尺寸不正确');
  if (!lv.data.voxels.length) throw new Error('这个关卡是空的');
  return { ...lv, name: lv.name || '分享关卡', code };
}

export function siteUrl() {
  if (CONFIG.SITE_URL) return CONFIG.SITE_URL.replace(/\/?$/, '/');
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.pathname = u.pathname.replace(/index\.html$/, '');
  return u.toString();
}

export function shareLink(code) {
  return siteUrl() + '?c=' + code;
}
