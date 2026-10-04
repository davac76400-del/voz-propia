import { icon } from '../icons';
import { reducedMotion } from '../dom';
import { bindHold } from './hold';

export const HOLD_MS = 2000;

/** Botón que se llena de agua mientras se mantiene presionado; al llenarse salpica y regresa. */
export const waterBackHTML = () => `
  <button class="water-back" type="button" data-water-back aria-label="Regresar al inicio. Mantén presionado dos segundos">
    <span class="water-back__label">
      ${icon('arrow-left', 20, 2.6)}
      <span class="water-back__text"><b>Regresar al inicio</b><small><span class="wb-idle">Mantén 2 segundos</span><span class="wb-busy">Sigue presionando…</span></small></span>
    </span>
    <span class="water-back__fill" aria-hidden="true">
      <svg class="water-back__wave water-back__wave--b" viewBox="0 0 240 16" preserveAspectRatio="none"><path d="M0 8 Q30 0 60 8 T120 8 T180 8 T240 8 V16 H0Z"/></svg>
      <svg class="water-back__wave" viewBox="0 0 240 16" preserveAspectRatio="none"><path d="M0 8 Q30 16 60 8 T120 8 T180 8 T240 8 V16 H0Z"/></svg>
      <span class="water-back__clip">
        <span class="water-back__label water-back__label--on">
          ${icon('arrow-left', 20, 2.6)}
          <span class="water-back__text"><b>Regresar al inicio</b><small>Mantén 2 segundos</small></span>
        </span>
      </span>
    </span>
  </button>`;

const WAVES = ['splash__disc--green', 'splash__disc--white', 'splash__disc--blue', 'splash__disc--ink'];
const DROP_COLORS = ['#3DF2A0', '#F4F7FA', '#5D80FF', '#2F69FF', '#9DB7FF'];

/** Ondas de agua que salen del botón y cubren la pantalla: verde, blanco, azul y negro, con gotas de colores. */
function splash(from: HTMLElement, done: () => void) {
  if (reducedMotion()) return done();
  const r = from.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const reach = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 60;
  const BASE = 400;
  const end = (reach * 2) / BASE;

  const veil = document.createElement('div');
  veil.className = 'splash';
  veil.setAttribute('aria-hidden', 'true');
  const at = { left: `${cx}px`, top: `${cy}px` };

  const place = (el: HTMLElement, size: number) => {
    Object.assign(el.style, at, { width: `${size}px`, height: `${size}px` });
    veil.append(el);
  };

  // Ondas: cada color llega un poco después y cubre al anterior.
  const discs = WAVES.map((cls) => {
    const d = document.createElement('i');
    d.className = `splash__disc ${cls}`;
    place(d, BASE);
    return d;
  });

  // Anillos de choque, finos y luminosos, que van por delante de las ondas.
  const rings = [0, 1, 2].map((n) => {
    const d = document.createElement('i');
    d.className = `splash__ring splash__ring--${n}`;
    place(d, BASE);
    return d;
  });

  const drops: HTMLElement[] = [];
  for (let i = 0; i < 30; i++) {
    const d = document.createElement('i');
    d.className = 'splash__drop';
    const size = 6 + Math.random() * (i < 6 ? 26 : 14);
    const c = DROP_COLORS[i % DROP_COLORS.length];
    d.style.background = `radial-gradient(circle at 35% 30%, #fff 0, ${c} 45%, ${c})`;
    place(d, size);
    drops.push(d);
  }
  document.body.append(veil);

  from.animate([{ transform: 'scale(0.97)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' });

  const ease = 'cubic-bezier(.65,0,.2,1)';
  const grows = discs.map((d, i) =>
    d.animate([{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: `translate(-50%,-50%) scale(${end})` }], {
      duration: 640 + i * 40,
      delay: i * 85,
      easing: ease,
      fill: 'both',
    }),
  );

  rings.forEach((d, i) => {
    d.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.05)', opacity: 0.95 },
        { transform: `translate(-50%,-50%) scale(${end * 1.06})`, opacity: 0.9, offset: 0.82 },
        { transform: `translate(-50%,-50%) scale(${end * 1.1})`, opacity: 0 },
      ],
      { duration: 820 + i * 60, delay: i * 70, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' },
    );
  });

  drops.forEach((d, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.9;
    const dist = 80 + Math.random() * 260;
    const x = Math.cos(a) * dist;
    const y = Math.sin(a) * dist;
    const dur = 760 + Math.random() * 560;
    d.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y - 50}px)) scale(1)`, opacity: 1, offset: 0.42 },
        { transform: `translate(calc(-50% + ${x * 1.2}px), calc(-50% + ${y + 170}px)) scale(0.6)`, opacity: 0 },
      ],
      { duration: dur, delay: 40 + (i % 6) * 30, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
    );
  });

  void grows[grows.length - 1].finished.then(() => {
    done();
    const out = veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, delay: 140, easing: 'ease-out', fill: 'forwards' });
    void out.finished.then(() => veil.remove());
  });
}

export function bindWaterBack(btn: HTMLElement, onDone: () => void) {
  let busy = false;
  const off = bindHold(btn, HOLD_MS, () => {
    if (busy) return;
    busy = true;
    btn.classList.add('is-done');
    splash(btn, onDone);
  });
  return () => off();
}
