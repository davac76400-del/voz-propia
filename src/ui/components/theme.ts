import { icon } from '../icons';

export interface Theme {
  id: string;
  name: string;
  ink: string;
  card: string;
  a1: string;
  a1m: string;
  a1l: string;
  a1d: string;
  a2: string;
  /** Color del texto sobre botones del acento principal. */
  onA1: string;
}

export type Palette = Pick<Theme, 'a1' | 'a1m' | 'a1l' | 'a1d' | 'a2' | 'ink'>;

/** Paletas oscuras: cambian el fondo y los acentos de la guía y de la página de ayuda. */
export const THEMES: Theme[] = [
  { id: 'negro', name: 'Negro y azul', ink: '#05080a', card: '#0a0f14', a1: '#2f69ff', a1m: '#5d80ff', a1l: '#9db7ff', a1d: '#0e2ac5', a2: '#3df2a0', onA1: '#ffffff' },
  { id: 'oceano', name: 'Océano', ink: '#041420', card: '#08202f', a1: '#1ea7ff', a1m: '#5cc4ff', a1l: '#9be4ff', a1d: '#0a6fb3', a2: '#5bffd6', onA1: '#041420' },
  { id: 'bosque', name: 'Bosque', ink: '#04100a', card: '#0a1c12', a1: '#22c55e', a1m: '#5ddb86', a1l: '#a6f0bf', a1d: '#118a3d', a2: '#d4f23a', onA1: '#04100a' },
  { id: 'vino', name: 'Vino', ink: '#12060d', card: '#1c0b15', a1: '#c92a63', a1m: '#e8588a', a1l: '#ffa6c3', a1d: '#8f1646', a2: '#ffc857', onA1: '#ffffff' },
  { id: 'violeta', name: 'Violeta', ink: '#0b0617', card: '#130c26', a1: '#7a45f5', a1m: '#9b72ff', a1l: '#c7b0ff', a1d: '#4a1fb8', a2: '#ff7ad9', onA1: '#ffffff' },
  { id: 'ambar', name: 'Ámbar', ink: '#130a03', card: '#1f1208', a1: '#ff7a1a', a1m: '#ff9d52', a1l: '#ffc99a', a1d: '#c24f00', a2: '#ffe08a', onA1: '#130a03' },
];

const KEY = 'voz-propia:paleta';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
};

let current = THEMES[0];
export const currentTheme = () => current;

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function applyTheme(id: string, save = true) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  current = t;
  const s = document.documentElement.style;
  const set = (k: string, v: string) => s.setProperty(`--t-${k}`, v);
  set('ink', t.ink);
  set('ink-rgb', rgb(t.ink));
  set('card', t.card);
  set('card-rgb', rgb(t.card));
  set('a1', t.a1);
  set('a1-rgb', rgb(t.a1));
  set('a1m', t.a1m);
  set('a1l', t.a1l);
  set('a1l-rgb', rgb(t.a1l));
  set('a1d', t.a1d);
  set('a1d-rgb', rgb(t.a1d));
  set('a2', t.a2);
  set('a2-rgb', rgb(t.a2));
  set('on-a1', t.onA1);
  document.documentElement.dataset.palette = t.id;
  if (document.documentElement.dataset.mode === 'usuario') document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.ink);
  if (save) {
    try {
      localStorage.setItem(KEY, t.id);
    } catch {
      // Sin almacenamiento, la paleta vuelve a la inicial la próxima vez.
    }
  }
  dispatchEvent(new CustomEvent<Theme>('palette', { detail: t }));
}

/** Aplica la paleta que la persona eligió la última vez (o la inicial). */
export function loadTheme() {
  applyTheme(read(), false);
}

export const paletteHTML = () => `
  <button class="pal-btn" type="button" data-pal aria-expanded="false" aria-controls="pal-menu" aria-label="Colores de la página">${icon('palette', 18)}<span>Colores</span></button>
  <div class="pal-menu" id="pal-menu" role="radiogroup" aria-label="Paleta de colores" hidden>
    <p>Elige un color</p>
    ${THEMES.map(
      (t) => `<button class="pal-opt" type="button" role="radio" aria-checked="${t.id === current.id}" data-theme-id="${t.id}">
        <span class="pal-sw" style="--bg:${t.ink};--c1:${t.a1};--c2:${t.a2}"><i></i><i></i></span><span>${t.name}</span>
      </button>`,
    ).join('')}
  </div>`;

/** Conecta el selector de colores dentro de `root`. Devuelve cómo desconectarlo. */
export function bindPalette(root: HTMLElement) {
  const btn = root.querySelector<HTMLElement>('[data-pal]')!;
  const menu = root.querySelector<HTMLElement>('.pal-menu')!;
  const ac = new AbortController();
  const { signal } = ac;
  const open = (v: boolean) => {
    menu.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    if (v) menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  };
  const mark = () => menu.querySelectorAll<HTMLElement>('[data-theme-id]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeId === current.id)));
  mark();
  btn.addEventListener('click', () => open(Boolean(menu.hidden)), { signal });
  menu.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-theme-id]');
      if (!b) return;
      applyTheme(b.dataset.themeId!);
      mark();
    },
    { signal },
  );
  addEventListener(
    'pointerdown',
    (e) => {
      if (!menu.hidden && !(e.target as Element).closest('.pal-menu, [data-pal]')) open(false);
    },
    { signal },
  );
  addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        open(false);
        btn.focus();
      }
    },
    { signal },
  );
  return () => ac.abort();
}
