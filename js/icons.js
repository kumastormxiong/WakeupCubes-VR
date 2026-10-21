// 圆润线条小图标
const S = (inner, fill = false) => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICON = {
  back: S('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  play: S('<path d="M8 5.8v12.4a1 1 0 0 0 1.5.86l10-6.2a1 1 0 0 0 0-1.72l-10-6.2A1 1 0 0 0 8 5.8z" fill="currentColor" stroke="none"/>'),
  star: S('<path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" fill="currentColor"/>'),
  heart: S('<path d="M12 20s-7.2-4.4-8.9-8.8C2 8 4 4.8 7.2 4.8c1.9 0 3.4 1 4.8 2.7 1.4-1.7 2.9-2.7 4.8-2.7C20 4.8 22 8 20.9 11.2 19.2 15.6 12 20 12 20z" fill="currentColor"/>'),
  hammer: S('<path d="M13.5 6.5l4 4"/><path d="M11 9l-7.3 7.3a1.8 1.8 0 0 0 2.5 2.5L13.5 11.5"/><path d="M12 4.5l2.2-1.2a2 2 0 0 1 2.3.3l3.9 3.9a2 2 0 0 1 .3 2.3L19.5 12l-7.5-7.5z" fill="currentColor"/>'),
  shield: S('<path d="M12 3l7 2.8v5.4c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="7"/>'),
  music: S('<path d="M9 18V6l11-2.2v12"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="15.8" r="2.6" fill="currentColor"/>'),
  mute: S('<path d="M9 18V6l11-2.2v12"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="15.8" r="2.6" fill="currentColor"/><path d="M3 3l18 18"/>'),
  vr: S('<path d="M3.5 8.2c0-1.2 1-2.2 2.2-2.2h12.6c1.2 0 2.2 1 2.2 2.2v6.4c0 1.2-1 2.2-2.2 2.2h-3.1c-.8 0-1.5-.5-1.9-1.2l-.4-.8a1.1 1.1 0 0 0-1.9 0l-.4.8c-.4.7-1.1 1.2-1.9 1.2H5.7c-1.2 0-2.2-1-2.2-2.2z"/><circle cx="8" cy="11.4" r="1.6" fill="currentColor"/><circle cx="16" cy="11.4" r="1.6" fill="currentColor"/>'),
  share: S('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>'),
  restart: S('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 4.5v3.8h3.8"/>'),
  help: S('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>'),
  sparkle: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor"/>'),
  cube: S('<path d="M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2z"/><path d="M4 7.2l8 4.4 8-4.4M12 11.6v9.6"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  eraser: S('<path d="M8.5 19.5l-4-4a1.8 1.8 0 0 1 0-2.5l8.5-8.5a1.8 1.8 0 0 1 2.5 0l4 4a1.8 1.8 0 0 1 0 2.5l-8 8.5z"/><path d="M8.5 19.5H20M7 11l6 6"/>'),
  brush: S('<path d="M19.5 3.5l-8.7 8.7"/><path d="M10.8 12.2c-2.5-.3-4.6 1.4-4.9 3.9-.2 1.6-1 2.5-2.4 2.9 3.3 1.8 7.8 1.2 8.6-2.8l1.2-1.3z" fill="currentColor"/>'),
  picker: S('<path d="M14.5 4.5l5 5M17 7l-9.7 9.7-3.3.8.8-3.3L14.5 4.5"/><path d="M13 3l8 8"/>'),
  undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: S('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  trash: S('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  up: S('<path d="M6 14l6-6 6 6"/>'),
  down: S('<path d="M6 10l6 6 6-6"/>'),
  edit: S('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/>'),
  download: S('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  upload: S('<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>'),
  copy: S('<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  home: S('<path d="M4 11l8-6.5 8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>'),
  gift: S('<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18M12 9v11M12 9S9.5 4 7.5 5.5 9.5 9 12 9zM12 9s2.5-5 4.5-3.5S14.5 9 12 9z"/>'),
  layers: S('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  mirror: S('<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M9 7L4 17h5zM15 7l5 10h-5z"/>'),
  palette: S('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-1 1.4-2-.6-1.2.1-2.5 1.5-2.5h2.2c2 0 3.4-1.5 3.4-3.6C20.5 7.2 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.3" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.3" fill="currentColor"/><circle cx="15" cy="7.8" r="1.3" fill="currentColor"/>'),
  link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  save: S('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
  grid: S('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
};

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(el => {
    const ic = ICON[el.dataset.ic];
    if (ic && !el.querySelector('svg.ic')) el.insertAdjacentHTML('afterbegin', ic);
  });
}
