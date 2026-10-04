import { vibrate } from '../dom';

/**
 * Botón de «mantén presionado»: evita que un toque accidental cambie algo importante.
 * Expone el avance en la variable CSS `--hold` (0 a 1) para dibujar el anillo.
 */
export function bindHold(el: HTMLElement, ms: number, onDone: () => void) {
  let start = 0;
  let raf = 0;
  let active = false;

  const set = (p: number) => el.style.setProperty('--hold', p.toFixed(3));
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / ms);
    set(p);
    if (p >= 1) {
      active = false;
      el.classList.remove('is-holding');
      vibrate(30);
      onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (active) return;
    active = true;
    start = performance.now();
    el.classList.add('is-holding');
    vibrate(8);
    raf = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    el.classList.remove('is-holding');
    set(0);
  };

  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    el.setPointerCapture?.(e.pointerId);
    begin();
  };
  const keydown = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      begin();
    }
  };
  const keyup = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') cancel();
  };
  const noMenu = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('keydown', keydown);
  el.addEventListener('keyup', keyup);
  el.addEventListener('blur', cancel);
  el.addEventListener('contextmenu', noMenu);
  set(0);

  return () => {
    cancel();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', cancel);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('keydown', keydown);
    el.removeEventListener('keyup', keyup);
    el.removeEventListener('blur', cancel);
    el.removeEventListener('contextmenu', noMenu);
  };
}

/** Anillo SVG que se llena con `--hold`. */
export const holdRing = () =>
  `<svg class="hold__ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" class="track" pathLength="100"/><circle cx="32" cy="32" r="29" class="bar" pathLength="100"/></svg>`;
