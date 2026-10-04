import { reducedMotion } from '../dom';

/**
 * Inclinación 3D que sigue al puntero, con un brillo que imita luz real.
 * Solo en dispositivos con puntero fino; en pantallas táctiles el toque ya da la profundidad.
 */
export function enableTilt(root: HTMLElement) {
  if (!matchMedia('(pointer: fine)').matches) return;
  let raf = 0;

  root.addEventListener('pointermove', (e) => {
    if (reducedMotion()) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-tilt]');
    if (!el) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const max = Number(el.dataset.tilt) || 8;
      el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
      el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
      el.style.setProperty('--gx', `${px * 100}%`);
      el.style.setProperty('--gy', `${py * 100}%`);
      el.classList.add('is-tilting');
    });
  });

  root.addEventListener(
    'pointerout',
    (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-tilt]');
      if (!el || el.contains(e.relatedTarget as Node)) return;
      el.classList.remove('is-tilting');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    },
    true,
  );
}
