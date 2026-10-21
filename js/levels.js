// 10 个官方关卡的程序化体素生成器
// 坐标约定：x 向右，y 向上，z 朝向玩家（z 最大的一面是“正面”）
import { C } from './palette.js';

function builder(w, h, d) {
  const m = new Map();
  const k = (x, y, z) => x + ',' + y + ',' + z;
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d;
  const api = {
    w, h, d,
    set(x, y, z, c, p = 0) { if (inb(x, y, z)) m.set(k(x, y, z), [x, y, z, c, p]); return api; },
    del(x, y, z) { m.delete(k(x, y, z)); return api; },
    has(x, y, z) { return m.has(k(x, y, z)); },
    get(x, y, z) { return m.get(k(x, y, z)); },
    box(x0, y0, z0, x1, y1, z1, c, p = 0) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) api.set(x, y, z, c, p);
      return api;
    },
    // 去掉四个竖直棱角的方块层，看起来更圆润
    rbox(x0, y0, z0, x1, y1, z1, c, p = 0) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const ex = x === x0 || x === x1, ez = z === z0 || z === z1;
        if (ex && ez) continue;
        api.set(x, y, z, c, p);
      }
      return api;
    },
    ell(cx, cy, cz, rx, ry, rz, c, p = 0, filter) {
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) {
        const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (v <= 1 && (!filter || filter(x, y, z))) api.set(x, y, z, c, p);
      }
      return api;
    },
    recolor(fn) { for (const v of m.values()) { const r = fn(v[0], v[1], v[2], v[3], v[4]); if (r) v[3] = r; } return api; },
    // 在 (x,y) 这一列上找到最靠前（z 最大）的方块
    frontZ(x, y) { for (let z = d - 1; z >= 0; z--) if (m.has(k(x, y, z))) return z; return -1; },
    backZ(x, y) { for (let z = 0; z < d; z++) if (m.has(k(x, y, z))) return z; return -1; },
    paintFront(x, y, c, dz = 0) { const z = api.frontZ(x, y); if (z >= 0) api.set(x, y, z + dz, c, dz ? 0 : api.get(x, y, z)[4]); return api; },
    done() { return { w, h, d, voxels: [...m.values()].map(v => v.slice()) }; },
  };
  return api;
}

// Lv.1 瞌睡小黄鸭 5x5x5
function duck() {
  const b = builder(5, 5, 5);
  b.box(0, 0, 0, 4, 0, 4, C.ice);
  [[0, 0], [4, 0], [0, 4], [4, 4]].forEach(([x, z]) => b.del(x, 0, z));
  b.recolor((x, y, z, c) => (y === 0 && (x + z) % 3 === 0 ? C.ocean : null));
  b.box(1, 1, 1, 3, 2, 3, C.lemon);
  b.set(2, 2, 0, C.lemon);
  b.box(1, 3, 2, 3, 4, 3, C.lemon);
  b.set(1, 4, 3, C.ink).set(3, 4, 3, C.ink);
  b.set(1, 3, 3, C.blush).set(3, 3, 3, C.blush);
  b.set(2, 3, 4, C.orange);
  b.set(0, 2, 1, C.butter, 1).set(0, 2, 2, C.butter, 1);
  b.set(4, 2, 1, C.butter, 2).set(4, 2, 2, C.butter, 2);
  return b.done();
}

// Lv.2 弹力红伞菇 6x6x6
function mushroom() {
  const b = builder(6, 6, 6);
  b.box(2, 0, 2, 3, 2, 3, C.cream);
  b.set(1, 0, 3, C.grass).set(4, 0, 2, C.grass).set(3, 0, 4, C.grass);
  b.rbox(0, 3, 0, 5, 4, 5, C.strawberry, 4);
  b.rbox(1, 5, 1, 4, 5, 4, C.strawberry, 4);
  [[2, 5, 2], [3, 5, 3], [0, 4, 2], [5, 4, 3], [2, 4, 5], [4, 3, 5], [3, 4, 0], [1, 3, 0], [5, 3, 1], [0, 3, 4]]
    .forEach(([x, y, z]) => b.set(x, y, z, C.white, 4));
  return b.done();
}

// Lv.3 破壳小萌鸡 6x6x6
function chick() {
  const b = builder(6, 6, 6);
  b.rbox(1, 0, 1, 4, 0, 4, C.white);
  b.rbox(0, 1, 0, 5, 1, 5, C.white);
  for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
    const border = x === 0 || x === 5 || z === 0 || z === 5;
    const corner = (x === 0 || x === 5) && (z === 0 || z === 5);
    if (border && !corner && (x + z) % 2 === 0) b.set(x, 2, z, C.white);
  }
  b.box(1, 2, 1, 4, 4, 4, C.lemon);
  b.set(1, 4, 4, C.ink).set(4, 4, 4, C.ink);
  b.set(1, 3, 4, C.blush).set(4, 3, 4, C.blush);
  b.set(2, 3, 5, C.orange).set(3, 3, 5, C.orange);
  b.rbox(1, 5, 1, 4, 5, 4, C.white, 4);
  return b.done();
}

// Lv.4 垂耳奶油兔 7x7x7
function bunny() {
  const b = builder(7, 7, 7);
  b.box(2, 0, 2, 4, 2, 4, C.cream);
  b.set(2, 0, 5, C.cream).set(4, 0, 5, C.cream);
  b.set(3, 1, 1, C.white);
  b.box(1, 3, 1, 5, 4, 5, C.cream);
  b.rbox(1, 5, 1, 5, 5, 5, C.cream);
  b.set(3, 6, 3, C.cream).set(3, 6, 2, C.sakura);
  b.set(2, 4, 5, C.ink).set(4, 4, 5, C.ink);
  b.set(3, 3, 5, C.blush);
  b.set(1, 3, 5, C.sakura).set(5, 3, 5, C.sakura);
  b.box(0, 2, 3, 0, 5, 4, C.cream, 1);
  b.set(0, 2, 3, C.sakura, 1).set(0, 2, 4, C.sakura, 1);
  b.box(6, 2, 3, 6, 5, 4, C.cream, 2);
  b.set(6, 2, 3, C.sakura, 2).set(6, 2, 4, C.sakura, 2);
  return b.done();
}

// Lv.5 竹蜻蜓橘猫 8x8x8
function cat() {
  const b = builder(8, 8, 8);
  const O = C.tangerine, OD = '#F08C2E';
  b.box(2, 0, 2, 5, 2, 5, O);
  b.box(3, 0, 5, 4, 1, 5, C.white);
  b.set(2, 0, 6, C.white).set(5, 0, 6, C.white);
  b.box(1, 3, 1, 6, 4, 6, O);
  b.rbox(1, 5, 1, 6, 5, 6, O);
  b.set(3, 5, 2, OD).set(4, 5, 2, OD).set(3, 5, 4, OD).set(4, 5, 4, OD);
  b.set(2, 4, 6, C.ink).set(5, 4, 6, C.ink);
  b.set(3, 3, 6, C.white).set(4, 3, 6, C.white);
  b.set(1, 3, 6, C.blush).set(6, 3, 6, C.blush);
  b.set(1, 6, 4, O).set(1, 6, 5, O).set(2, 6, 5, C.sakura);
  b.set(6, 6, 4, O).set(6, 6, 5, O).set(5, 6, 5, C.sakura);
  b.box(3, 6, 3, 4, 6, 4, C.cocoa, 3);
  b.box(1, 7, 3, 6, 7, 4, C.grass, 3);
  b.box(3, 7, 1, 4, 7, 6, C.grass, 3);
  b.set(1, 7, 3, C.mint, 3).set(6, 7, 4, C.mint, 3).set(4, 7, 1, C.mint, 3).set(3, 7, 6, C.mint, 3);
  b.set(4, 1, 1, O, 1).set(4, 1, 0, O, 1).set(4, 2, 0, C.white, 1);
  return b.done();
}

// Lv.6 云端小鲸鱼 8x8x8
function whale() {
  const b = builder(8, 8, 8);
  b.ell(4.3, 2.2, 3.5, 3.4, 2.4, 2.9, C.ocean);
  b.recolor((x, y) => (y <= 1 ? '#EAF7FF' : null));
  b.set(0, 2, 3, C.ocean).set(0, 2, 4, C.ocean);
  b.box(0, 3, 2, 0, 3, 5, C.ocean);
  for (const [zf, side] of [[1, 'front'], [0, 'back']]) {
    const z = side === 'front' ? b.frontZ(6, 3) : b.backZ(6, 3);
    if (z >= 0) b.set(6, 3, z, C.ink);
    const z2 = side === 'front' ? b.frontZ(6, 2) : b.backZ(6, 2);
    if (z2 >= 0) b.set(6, 2, z2, C.blush);
  }
  b.set(4, 1, 0, '#4A90C8', 1).set(5, 1, 0, '#4A90C8', 1);
  b.set(4, 1, 7, '#4A90C8', 2).set(5, 1, 7, '#4A90C8', 2);
  b.set(4, 5, 3, C.ice, 4).set(4, 6, 3, C.ice, 4);
  b.set(4, 7, 3, C.white, 4).set(3, 7, 3, C.ice, 4).set(5, 7, 3, C.ice, 4).set(4, 7, 2, C.ice, 4).set(4, 7, 4, C.ice, 4);
  return b.done();
}

// Lv.7 发条呆企鹅 9x9x9
function penguin() {
  const b = builder(9, 9, 9);
  b.ell(4, 4, 4.3, 3.3, 4.0, 2.9, C.navy, 0, (x, y) => y >= 1);
  b.recolor((x, y, z) => (z >= 5 && y <= 7 && Math.abs(x - 4) <= 2 ? C.white : null));
  b.paintFront(3, 7, C.ink).paintFront(5, 7, C.ink);
  b.paintFront(2, 6, C.blush).paintFront(6, 6, C.blush);
  const bz = b.frontZ(4, 6);
  b.set(4, 6, bz + 1, C.orange);
  b.box(2, 0, 5, 3, 0, 6, '#FFB830').box(5, 0, 5, 6, 0, 6, '#FFB830');
  b.box(0, 3, 4, 0, 5, 4, C.navy, 1);
  b.box(8, 3, 4, 8, 5, 4, C.navy, 2);
  // 背后金色大发条
  b.set(4, 4, 1, C.gold, 3).set(4, 4, 0, C.gold, 3);
  for (const cx of [2, 6]) for (let x = cx - 1; x <= cx + 1; x++) for (let y = 3; y <= 5; y++) {
    if (x === cx && y === 4) continue;
    b.set(x, y, 0, C.gold, 3);
  }
  return b.done();
}

// Lv.8 微风磨坊屋 10x10x10
function windmill() {
  const b = builder(10, 10, 10);
  const CR = '#FFF1D6', P1 = C.blush, P2 = '#FFB5C5';
  b.box(2, 0, 2, 8, 4, 7, CR);
  b.box(1, 5, 1, 9, 5, 8, P1);
  b.box(1, 6, 2, 9, 6, 7, P1);
  b.box(1, 7, 3, 9, 7, 6, P1);
  b.recolor((x, y, z, c) => (y >= 5 && c === P1 && z % 2 === 1 ? P2 : null));
  b.set(7, 7, 2, C.cocoa).set(7, 8, 2, C.cocoa);
  b.set(7, 9, 2, C.white, 5).set(6, 9, 1, '#F2F2F7', 5);
  b.set(5, 0, 7, C.cocoa).set(5, 1, 7, C.cocoa);
  b.set(3, 3, 7, C.ice).set(7, 3, 7, C.ice);
  b.box(2, 2, 4, 2, 3, 5, C.ice).box(8, 2, 4, 8, 3, 5, C.ice);
  // 正面四叶风车（风车形对称）
  b.set(5, 3, 8, C.cocoa, 3).set(5, 3, 9, C.gold, 3);
  const blade = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3]];
  const tips = [[1, 3]];
  for (let r = 0; r < 4; r++) {
    for (const [dx0, dy0] of blade) {
      let dx = dx0, dy = dy0;
      for (let i = 0; i < r; i++) { const t = dx; dx = dy; dy = -t; }
      const isTip = tips.some(([a, c]) => a === dx0 && c === dy0);
      b.set(5 + dx, 3 + dy, 9, isTip ? C.blush : C.white, 3);
    }
  }
  b.set(0, 0, 8, C.grass).set(0, 1, 8, C.blush).set(1, 0, 9, C.grass).set(9, 0, 8, C.grass).set(9, 1, 8, C.lemon).set(0, 0, 1, C.grass);
  return b.done();
}

// Lv.9 星际宇航柴 10x10x12
function shiba() {
  const b = builder(10, 10, 12);
  const OR = C.shiba, W = C.white, SUIT2 = '#E6EBF5';
  b.box(3, 1, 4, 6, 4, 7, W);
  b.box(3, 1, 4, 6, 1, 7, SUIT2);
  b.set(4, 3, 7, C.strawberry).set(5, 3, 7, C.lemon);
  b.box(3, 0, 5, 4, 0, 6, C.cloud).box(5, 0, 5, 6, 0, 6, C.cloud);
  // 头部
  b.box(2, 5, 4, 7, 8, 9, OR);
  [[2, 4], [7, 4], [2, 9], [7, 9]].forEach(([x, z]) => b.del(x, 8, z));
  b.box(2, 5, 9, 7, 5, 9, W);
  b.box(3, 6, 9, 6, 6, 9, W);
  b.set(4, 5, 10, W).set(5, 5, 10, W).set(4, 6, 10, C.ink).set(5, 6, 10, C.ink);
  b.set(3, 7, 9, C.ink).set(6, 7, 9, C.ink);
  b.set(2, 6, 9, C.blush).set(7, 6, 9, C.blush);
  b.box(3, 8, 9, 6, 8, 9, C.sky);
  b.set(2, 8, 8, C.sky).set(7, 8, 8, C.sky);
  // 头盔环
  b.box(2, 9, 7, 7, 9, 7, W);
  b.set(2, 9, 5, OR).set(2, 9, 6, OR).set(3, 9, 6, C.sakura);
  b.set(7, 9, 5, OR).set(7, 9, 6, OR).set(6, 9, 6, C.sakura);
  // 招手的左前爪
  b.box(1, 3, 5, 2, 3, 6, W, 1);
  b.box(0, 3, 5, 0, 5, 6, W, 1);
  b.set(0, 6, 5, OR, 1).set(0, 6, 6, OR, 1);
  // 右手
  b.box(7, 2, 5, 7, 3, 6, W);
  b.set(7, 1, 5, OR).set(7, 1, 6, OR);
  // 喷射背包 + 尾焰
  b.box(3, 2, 2, 6, 5, 3, C.cloud);
  b.box(3, 5, 2, 6, 5, 2, C.strawberry);
  b.box(4, 1, 2, 5, 1, 3, C.lemon, 4);
  b.box(4, 0, 2, 5, 0, 3, C.orange, 4);
  // 漂浮的小星星
  b.set(9, 6, 10, C.lemon, 5).set(0, 8, 1, C.gold, 5).set(9, 2, 0, C.lemon, 5);
  return b.done();
}

// Lv.10 天空音乐飞艇 12x12x12
function airship() {
  const b = builder(12, 12, 12);
  const stripes = [C.sakura, C.butter, C.mint, C.ice, C.lilac];
  b.ell(6.5, 7.3, 5.5, 4.9, 3.4, 3.4, C.sakura);
  b.recolor((x) => stripes[Math.floor((x - 2) / 2) % stripes.length]);
  b.paintFront(5, 8, C.ink).paintFront(8, 8, C.ink);
  b.paintFront(4, 7, C.blush).paintFront(9, 7, C.blush);
  b.paintFront(6, 6, C.strawberry).paintFront(7, 6, C.strawberry);
  // 吊舱
  b.box(5, 0, 4, 8, 1, 7, C.cocoa);
  b.set(6, 1, 7, C.ice).set(7, 1, 7, C.ice);
  b.rbox(5, 2, 4, 8, 2, 7, C.gold);
  b.box(6, 3, 5, 6, 3, 5, C.cloud).box(7, 3, 6, 7, 3, 6, C.cloud);
  // 尾部螺旋桨
  b.box(1, 7, 5, 1, 8, 6, C.cloud, 3);
  b.box(0, 7, 5, 0, 8, 6, C.gold, 3);
  [[9, 5], [10, 5], [7, 4], [7, 3], [6, 6], [5, 6], [8, 7], [8, 8]].forEach(([y, z]) => b.set(0, y, z, C.blush, 3));
  // 环绕的金色音符
  const note = (x, y, z) => {
    b.set(x, y, z, C.gold, 5).set(x + 1, y, z, C.gold, 5).set(x + 1, y + 1, z, C.gold, 5).set(x + 1, y + 2, z, C.gold, 5).set(x + 2, y + 2, z, C.gold, 5);
  };
  note(8, 1, 10); note(1, 1, 1); note(9, 4, 1); note(0, 2, 9);
  return b.done();
}

export const OFFICIAL_LEVELS = [
  { id: 'lv1', name: '瞌睡小黄鸭', diff: 1, build: duck },
  { id: 'lv2', name: '弹力红伞菇', diff: 1, build: mushroom },
  { id: 'lv3', name: '破壳小萌鸡', diff: 2, build: chick },
  { id: 'lv4', name: '垂耳奶油兔', diff: 2, build: bunny },
  { id: 'lv5', name: '竹蜻蜓橘猫', diff: 3, build: cat },
  { id: 'lv6', name: '云端小鲸鱼', diff: 3, build: whale },
  { id: 'lv7', name: '发条呆企鹅', diff: 4, build: penguin },
  { id: 'lv8', name: '微风磨坊屋', diff: 4, build: windmill },
  { id: 'lv9', name: '星际宇航柴', diff: 5, build: shiba },
  { id: 'lv10', name: '天空音乐飞艇', diff: 5, build: airship },
];

export function buildOfficialLevels() {
  return OFFICIAL_LEVELS.map((L, i) => ({
    id: L.id, name: L.name, diff: L.diff, official: true, author: '官方', order: i,
    data: L.build(),
  }));
}
