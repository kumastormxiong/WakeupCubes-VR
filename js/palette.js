// 色板 / 部件 / 主题 —— 整个游戏共享的视觉常量

export const C = {
  cream: '#FFF6E5', white: '#FFFFFF', lemon: '#FFD93D', butter: '#FFE680', orange: '#FF9F43',
  tangerine: '#FFA94D', strawberry: '#FF6B6B', blush: '#FF8FAB', sakura: '#FFC4D6', taro: '#B39DDB',
  lilac: '#D7C4F5', sky: '#7FB7FF', ice: '#A0E7FF', ocean: '#5DADE2', grass: '#6BCB77',
  mint: '#B8F2C9', cocoa: '#C68B59', ink: '#3D3D4E', cloud: '#C9CED6', gold: '#FFC93C',
  navy: '#3D4A6B', shiba: '#F4A261', peach: '#FFD3B6',
};

// 造物工坊色板（马卡龙 + 少量深色点缀）
export const PALETTE = [
  { c: C.cream, n: '奶油白' }, { c: C.white, n: '纯白' }, { c: C.lemon, n: '柠檬黄' }, { c: C.butter, n: '黄油' },
  { c: C.orange, n: '橘子' }, { c: C.shiba, n: '柴犬橘' }, { c: C.strawberry, n: '草莓红' }, { c: C.blush, n: '腮红粉' },
  { c: C.sakura, n: '樱花粉' }, { c: C.peach, n: '蜜桃' }, { c: C.taro, n: '香芋紫' }, { c: C.lilac, n: '丁香' },
  { c: C.sky, n: '天空蓝' }, { c: C.ice, n: '冰蓝' }, { c: C.ocean, n: '海蓝' }, { c: C.navy, n: '夜蓝' },
  { c: C.grass, n: '青草绿' }, { c: C.mint, n: '薄荷' }, { c: C.gold, n: '金色' }, { c: C.cocoa, n: '可可' },
  { c: C.cloud, n: '云灰' }, { c: C.ink, n: '墨黑(眼睛)' },
];

// 墨黑色方块会在唤醒后自动“眨眼”
export const EYE_COLORS = new Set([C.ink.toLowerCase(), '#2b2b3a']);

export const PARTS = [
  { id: 0, n: '躯干', d: '轻轻呼吸', color: '#FFB5C5' },
  { id: 1, n: '左摆件', d: '正向摆动（翅膀/耳朵）', color: '#FFD93D' },
  { id: 2, n: '右摆件', d: '反向摆动（与左摆件对称）', color: '#7FB7FF' },
  { id: 3, n: '旋转件', d: '持续旋转（风车/螺旋桨）', color: '#6BCB77' },
  { id: 4, n: '弹跳件', d: 'Q 弹伸缩（菌盖/水柱）', color: '#FF9F43' },
  { id: 5, n: '漂浮件', d: '环绕公转 / 向上飘', color: '#B39DDB' },
];

export const PUZZLE = {
  base: '#FFF4E3',
  hoverBreak: '#FFE08A',
  hoverProtect: '#BFF2DA',
  protect: '#C9F5E2',
  error: '#FF8A8A',
  frame: '#34D399',
};

export const THEMES = {
  peach: {
    name: '蜜桃汽水', skyTop: '#FFB8D2', skyMid: '#FFE1EA', skyBottom: '#FFF5E1',
    grass: '#BDEFC4', soil: '#FFD7B0', cliff: '#F5B39B', accent: '#FF7EA6', accentD: '#E45F8A',
    ambSky: '#FFFFFF', ambGround: '#FFD6E4', cloud: '#FFFFFF', stars: false,
  },
  mint: {
    name: '薄荷苏打', skyTop: '#8EE3C8', skyMid: '#D6F7EC', skyBottom: '#FFFBEA',
    grass: '#A5E8B6', soil: '#FFE2B8', cliff: '#E9C29A', accent: '#2FC48D', accentD: '#1E9E70',
    ambSky: '#FFFFFF', ambGround: '#D8F5E8', cloud: '#FFFFFF', stars: false,
  },
  sky: {
    name: '晴空棉花糖', skyTop: '#8EC5FF', skyMid: '#D3E8FF', skyBottom: '#FFF0F6',
    grass: '#C1F0B5', soil: '#FFE0C2', cliff: '#EEC1A7', accent: '#4C8DF0', accentD: '#336FCC',
    ambSky: '#FFFFFF', ambGround: '#DCE8FF', cloud: '#FFFFFF', stars: false,
  },
  night: {
    name: '星星夜灯', skyTop: '#3E3482', skyMid: '#7E62BE', skyBottom: '#F5B3D0',
    grass: '#9ED8B6', soil: '#E8C3D9', cliff: '#BE97C9', accent: '#A98BF0', accentD: '#7E62C9',
    ambSky: '#E8E4FF', ambGround: '#C9B8F0', cloud: '#F3EDFF', stars: true,
  },
};
