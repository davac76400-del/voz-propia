import '@fontsource/anton/latin-400.css';
import { go } from '../../app/router';
import { on, reducedMotion, rich } from '../dom';
import { icon } from '../icons';

/* ---------- Contenido ---------- */

const READY: [string, string, string][] = [
  ['sun', 'Luz de frente', 'Que la luz te dé en la cara, no por detrás.'],
  ['scan-face', 'Teléfono a la altura de tu cara', 'Ni muy arriba ni muy abajo.'],
  ['hand', 'A un brazo de distancia', 'Que se vea toda tu cara en la pantalla.'],
  ['eye', 'Labios a la vista', 'Sin cubrebocas ni mano frente a la boca.'],
  ['zap', 'Batería cargada', 'Con más de la mitad, para todo el día.'],
  ['volume', 'Volumen alto', 'Para que te escuchen desde lejos.'],
];

const LIPS: Record<'si' | 'no', [string, string][]> = {
  si: [
    ['Como si hablaras', 'Mueve los labios igual que antes, *a tu ritmo*.'],
    ['Una frase a la vez', 'Di una frase completa y *haz una pausa* al terminar.'],
    ['Cara quieta', 'Mueve la boca, *no la cabeza*.'],
    ['Si no te entiende', 'Repítela *con calma*, un poco más despacio.'],
  ],
  no: [
    ['Exagerar', 'Abrir la boca de más *la confunde*: mejor natural.'],
    ['Hablar de lado', 'Si giras la cara, *no ve bien tus labios*.'],
    ['Tapar la boca', 'Cubrebocas, mano o sábana *ocultan las palabras*.'],
    ['Ir muy rápido', 'Encadenar frases sin pausa *las mezcla*.'],
  ],
};

/** Letras que se ven igual en los labios: por eso a veces la app pregunta. */
const SHAPES: { k: string; letters: string; name: string; text: string; words: string; mouth: string }[] = [
  {
    k: 'cerrados',
    letters: 'P · B · V · M',
    name: 'Labios cerrados',
    text: 'Se dicen *juntando los labios*. En español la «V» suena como la «B», así que sin sonido las cuatro se ven idénticas.',
    words: '«pala», «bala» y «mala» se ven igual',
    mouth: '<path class="cs-lip" d="M20 60 C60 30 85 34 100 44 C115 34 140 30 180 60 C140 74 120 78 100 78 C80 78 60 74 20 60 Z"/><path class="cs-line" d="M28 60 C70 62 130 62 172 60"/>',
  },
  {
    k: 'dientes',
    letters: 'F',
    name: 'Labio con dientes',
    text: 'El labio de abajo *toca los dientes de arriba*. Es una de las letras que mejor se ven.',
    words: '«frío», «café», «familia»',
    mouth: '<path class="cs-lip" d="M20 56 C60 24 85 28 100 38 C115 28 140 24 180 56 C150 54 125 52 100 52 C75 52 50 54 20 56 Z"/><rect class="cs-teeth" x="62" y="52" width="76" height="12" rx="3"/><path class="cs-lip" d="M30 66 C70 64 130 64 170 66 C140 86 120 90 100 90 C80 90 60 86 30 66 Z"/>',
  },
  {
    k: 'abierta',
    letters: 'A',
    name: 'Boca abierta',
    text: 'La boca *se abre hacia abajo*. Es de las formas más fáciles de ver.',
    words: '«agua», «cama», «mamá»',
    mouth: '<path class="cs-lip" d="M24 46 C60 22 86 26 100 34 C114 26 140 22 176 46 C150 42 125 40 100 40 C75 40 50 42 24 46 Z"/><ellipse class="cs-in" cx="100" cy="64" rx="66" ry="24"/><path class="cs-lip" d="M24 46 C40 96 70 106 100 106 C130 106 160 96 176 46 C160 86 130 92 100 92 C70 92 40 86 24 46 Z"/>',
  },
  {
    k: 'redondos',
    letters: 'O · U',
    name: 'Labios redondos',
    text: 'Los labios *se juntan en círculo*. La «O» abre más que la «U».',
    words: '«oso», «uno», «sueño»',
    mouth: '<circle class="cs-lip" cx="100" cy="60" r="42"/><ellipse class="cs-in" cx="100" cy="60" rx="20" ry="24"/>',
  },
  {
    k: 'estirados',
    letters: 'E · I',
    name: 'Labios estirados',
    text: 'La boca *se estira a los lados*, como al sonreír.',
    words: '«té», «sí», «quiero»',
    mouth: '<path class="cs-lip" d="M10 58 C60 36 86 40 100 46 C114 40 140 36 190 58 C150 56 125 54 100 54 C75 54 50 56 10 58 Z"/><ellipse class="cs-in" cx="100" cy="62" rx="74" ry="8"/><path class="cs-lip" d="M10 62 C50 64 150 64 190 62 C150 84 125 88 100 88 C75 88 50 84 10 62 Z"/>',
  },
];

const DOUBT: [string, string][] = [
  ['Te muestra opciones', 'Si dos palabras se parecen, aparecen *2 o 3 opciones* en la pantalla.'],
  ['Tocas la correcta', 'Con un toque eliges *lo que quisiste decir*.'],
  ['La dice en voz alta', 'Así nunca dice algo que *no quisiste decir*.'],
];
const OPTS = ['Tengo sed', 'Tengo frío', 'Me duele'];

const PHONE: [string, string, string][] = [
  ['zap', 'Siempre cargado', 'Déjalo conectado de noche, cerca de la cama.'],
  ['bed', 'Usa un soporte', 'Un soporte o atril lo deja *quieto y a la altura* de tu cara.'],
  ['eye', 'Limpia la cámara', 'Una cámara con huellas *ve borroso* tus labios.'],
  ['download', 'Instálala como app', 'Desde el navegador: *«Agregar a pantalla de inicio»*. Abre más rápido.'],
  ['wifi-off', 'Sin señal, funciona igual', 'Puede estar en *modo avión*: todo pasa dentro del teléfono.'],
  ['volume', 'Volumen arriba', 'Revisa que no esté en silencio antes de empezar.'],
];

const FAMILY: [string, string, string][] = [
  ['check', 'Haz preguntas de sí o no', 'En lugar de «¿qué necesitas?», pregunta «¿tienes sed?». Es *más rápido y cansa menos*.'],
  ['gauge', 'Dale tiempo', 'Espera a que termine de mover los labios. *No completes sus frases* sin preguntar.'],
  ['eye', 'Ponte de frente', 'Con buena luz y a su altura, para ver *sus labios y sus gestos*.'],
  ['refresh-ccw', 'Repite para confirmar', '«Entendí que te duele el pecho, ¿sí?». Así *nadie adivina*.'],
  ['volume', 'Habla normal', 'Perdió la voz, no el oído. *No hace falta gritar* ni hablarle como a un niño.'],
  ['phone', 'El teléfono a la mano', 'Cargado, cerca de su mano y con *Voz Propia abierta*.'],
];

const NAV: [string, string][] = [
  ['cs-top', 'Inicio'],
  ['cs-listo', '¿Todo listo?'],
  ['cs-labios', 'Cómo mover los labios'],
  ['cs-formas', 'Letras que se ven igual'],
  ['cs-duda', 'Si la app duda'],
  ['cs-telefono', 'Cuida tu teléfono'],
  ['cs-familia', 'Para la familia'],
];

/* ---------- Plantilla ---------- */

function template() {
  const ready = READY.map(
    ([ic, t, d], i) => `<li><button class="cs-check" type="button" data-ready="${i}" aria-pressed="false"><span class="cs-check__box">${icon('check', 20, 3)}</span><span class="cs-check__ic">${icon(ic, 22, 2)}</span><span><b>${t}</b><small>${d}</small></span></button></li>`,
  ).join('');
  const shapeTabs = SHAPES.map(
    (sh, i) => `<button class="cs-shtab" type="button" role="tab" id="cs-sh-${i}" aria-controls="cs-shape-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-shape="${i}"><b>${sh.letters}</b><span>${sh.name}</span></button>`,
  ).join('');
  const doubt = DOUBT.map(([t, d], i) => `<li class="cs-step" data-rv style="--d:${i * 0.08}s"><b>${i + 1}</b><h3>${t}</h3><p>${rich(d)}</p></li>`).join('');
  const opts = OPTS.map((t, i) => `<button class="cs-opt" type="button" data-opt="${i}" aria-pressed="false">${t}</button>`).join('');
  const cards = (list: [string, string, string][]) => list.map(([ic, t, d], i) => `<li class="hz-tip" data-rv style="--d:${i * 0.06}s"><span>${icon(ic, 22, 2)}</span><h3>${t}</h3><p>${rich(d)}</p></li>`).join('');
  const idx = NAV.map(([id, t], i) => `<li><button type="button" data-jump="${id}" data-idx-item="${id}"><b>${String(i + 1).padStart(2, '0')}</b>${t}</button></li>`).join('');

  return `
  <div class="hz" data-hz>
    <i class="hz-progress" aria-hidden="true"></i>
    <button class="hz-idx-btn" type="button" data-idx aria-expanded="false" aria-controls="cs-idx">${icon('layout-grid', 18)}<span>Índice</span></button>
    <nav class="hz-idx" id="cs-idx" aria-label="Índice de consejos" hidden><p>Ir a…</p><ol>${idx}</ol></nav>

    <section class="hz-sec hz-hero" id="cs-top" data-tone="paper" aria-labelledby="cs-h1">
      <p class="hz-over" data-rv>[ Consejos de uso ]</p>
      <h1 class="hz-h1" id="cs-h1" data-rv style="--d:.08s">Para que Voz Propia<br><em>te entienda.</em></h1>
      <p class="hz-lead" data-rv style="--d:.16s">${rich('Voz Propia lee *el movimiento de tus labios*. Con estos consejos te entiende mejor y más rápido, desde el primer día.')}</p>
      <div class="hz-grid">
        <button class="hz-card hz-card--lime" type="button" data-jump="cs-listo">${icon('check', 26, 2.6)}<b>¿Todo listo?</b><span>Revisa antes de empezar</span></button>
        <button class="hz-card hz-card--ink" type="button" data-jump="cs-labios">${icon('scan-face', 26, 2.2)}<b>Cómo mover los labios</b><span>Así sí, y así no</span></button>
        <button class="hz-card hz-card--coral" type="button" data-jump="cs-formas">${icon('scan-face', 26, 2.2)}<b>Letras que se ven igual</b><span>Por qué a veces pregunta</span></button>
        <button class="hz-card hz-card--cobalt" type="button" data-jump="cs-duda">${icon('help', 26, 2.2)}<b>Si la app duda</b><span>Te pregunta, no adivina</span></button>
        <button class="hz-card hz-card--mint" type="button" data-jump="cs-telefono">${icon('phone', 26, 2.2)}<b>Cuida tu teléfono</b><span>Cargado, quieto y limpio</span></button>
        <button class="hz-card hz-card--card" type="button" data-jump="cs-familia">${icon('hand-heart', 26, 2.2)}<b>Para la familia</b><span>Cómo hablar sin voz</span></button>
      </div>
    </section>

    <section class="hz-sec" id="cs-listo" data-tone="lime" aria-labelledby="cs-ready-t">
      <p class="hz-over" data-rv>[ 01 · Antes de empezar ]</p>
      <h2 class="hz-h2" id="cs-ready-t" data-rv>¿Todo listo?</h2>
      <p class="hz-p" data-rv>${rich('Toca cada punto cuando lo tengas. Con los seis, *Voz Propia te ve y te entiende mejor*.')}</p>
      <div class="cs-meter" aria-live="polite"><i><b data-ready-bar></b></i><span data-ready-out>0 de 6 listos</span></div>
      <ul class="cs-checks">${ready}</ul>
    </section>

    <section class="hz-sec" id="cs-labios" data-tone="night" aria-labelledby="cs-lips-t">
      <p class="hz-over" data-rv>[ 02 · Cómo mover los labios ]</p>
      <h2 class="hz-h2" id="cs-lips-t" data-rv>Natural, a tu ritmo.</h2>
      <div class="cs-switch" role="radiogroup" aria-label="Ver" data-rv>
        <button type="button" role="radio" aria-checked="true" data-lips="si">${icon('check', 18, 2.8)}Así sí</button>
        <button type="button" role="radio" aria-checked="false" data-lips="no">${icon('x', 18, 2.8)}Así no</button>
      </div>
      <ul class="cs-lips" data-lips-panel aria-live="polite"></ul>
    </section>

    <section class="hz-sec" id="cs-formas" data-tone="paper" aria-labelledby="cs-shape-t">
      <p class="hz-over" data-rv>[ 03 · Letras que se ven igual ]</p>
      <h2 class="hz-h2" id="cs-shape-t" data-rv>Algunas palabras se ven igual en los labios.</h2>
      <p class="hz-p" data-rv>${rich('Sin sonido, varias letras forman *la misma figura con la boca*. Por eso Voz Propia a veces pregunta, y por eso ayuda *decir frases completas*: el resto de la frase despeja la duda.')}</p>
      <div class="cs-shapes">
        <div class="cs-shtabs" role="tablist" aria-label="Formas de la boca">${shapeTabs}</div>
        <div class="cs-shape" id="cs-shape-panel" role="tabpanel" aria-labelledby="cs-sh-0" data-shape-panel></div>
      </div>
    </section>

    <section class="hz-sec" id="cs-duda" data-tone="cobalt" aria-labelledby="cs-doubt-t">
      <p class="hz-over" data-rv>[ 04 · Si la app duda ]</p>
      <h2 class="hz-h2" id="cs-doubt-t" data-rv>No adivina: te pregunta.</h2>
      <ol class="cs-steps">${doubt}</ol>
      <div class="cs-demo" data-rv>
        <p>Ejemplo: así se ven las opciones. Toca la que quisiste decir.</p>
        <div class="cs-opts">${opts}</div>
        <p class="cs-demo__out" data-opt-out aria-live="polite"></p>
      </div>
    </section>

    <section class="hz-sec" id="cs-telefono" data-tone="forest" aria-labelledby="cs-ph-t">
      <p class="hz-over" data-rv>[ 05 · Cuida tu teléfono ]</p>
      <h2 class="hz-h2" id="cs-ph-t" data-rv>Tu teléfono es tu voz.</h2>
      <ul class="hz-tips cs-tips--dark">${cards(PHONE)}</ul>
    </section>

    <section class="hz-sec" id="cs-familia" data-tone="sand" aria-labelledby="cs-fa-t">
      <p class="hz-over" data-rv>[ 06 · Para la familia y el personal ]</p>
      <h2 class="hz-h2" id="cs-fa-t" data-rv>Cómo hablar con alguien sin voz.</h2>
      <ul class="hz-tips">${cards(FAMILY)}</ul>
      <div class="hz-row cs-end">
        <button class="hz-btn hz-btn--ink" type="button" data-to="guia">${icon('user', 18, 2.2)}<span>Ver la guía de uso</span></button>
        <button class="hz-btn" type="button" data-to="ayuda">${icon('info', 18, 2.2)}<span>Datos y cómo te ayuda</span></button>
        <button class="hz-btn" type="button" data-jump="cs-top">${icon('arrow-up', 18, 2.4)}<span>Volver arriba</span></button>
      </div>
      <p class="hz-fine">Voz Propia es una ayuda para comunicarse. No reemplaza la atención del personal de salud.</p>
    </section>
  </div>`;
}

/* ---------- Vista ---------- */

export function consejosView(root: HTMLElement) {
  root.innerHTML = template();
  const el = root.querySelector<HTMLElement>('[data-hz]')!;
  const still = reducedMotion();
  if (still) el.classList.add('is-static');
  const ac = new AbortController();
  const { signal } = ac;

  const reveal = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('is-in');
        reveal.unobserve(en.target);
      }
    },
    { threshold: 0.1 },
  );
  el.querySelectorAll('[data-rv]').forEach((n) => reveal.observe(n));

  const bar = el.querySelector<HTMLElement>('.hz-progress')!;
  let raf = 0;
  addEventListener(
    'scroll',
    () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.setProperty('--sp', max > 0 ? (scrollY / max).toFixed(4) : '0');
      });
    },
    { passive: true, signal },
  );

  /* Índice */
  const idx = el.querySelector<HTMLElement>('.hz-idx')!;
  const idxBtn = el.querySelector<HTMLElement>('[data-idx]')!;
  const openIdx = (open: boolean) => {
    idx.hidden = !open;
    idxBtn.setAttribute('aria-expanded', String(open));
    if (open) idx.querySelector<HTMLElement>('.is-on, button')?.focus();
  };
  addEventListener('pointerdown', (e) => !idx.hidden && !(e.target as Element).closest('.hz-idx, [data-idx]') && openIdx(false), { signal });
  addEventListener('keydown', (e) => e.key === 'Escape' && !idx.hidden && (openIdx(false), idxBtn.focus()), { signal });
  const idxItems = Array.from(el.querySelectorAll<HTMLElement>('[data-idx-item]'));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const en of entries) if (en.isIntersecting) idxItems.forEach((b) => b.classList.toggle('is-on', b.dataset.idxItem === en.target.id));
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  NAV.forEach(([id]) => spy.observe(el.querySelector(`#${id}`)!));
  const jump = (id: string) => {
    openIdx(false);
    el.querySelector(`#${id}`)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  /* ¿Todo listo? */
  const readyBar = el.querySelector<HTMLElement>('[data-ready-bar]')!;
  const readyOut = el.querySelector<HTMLElement>('[data-ready-out]')!;
  const updateReady = () => {
    const n = el.querySelectorAll('[data-ready][aria-pressed="true"]').length;
    readyBar.style.setProperty('--p', String(n / READY.length));
    readyOut.textContent = n === READY.length ? '¡Todo listo! Ya puedes empezar.' : `${n} de ${READY.length} listos`;
    el.querySelector('.cs-meter')!.classList.toggle('is-done', n === READY.length);
  };

  /* Labios: así sí / así no */
  const lipsPanel = el.querySelector<HTMLElement>('[data-lips-panel]')!;
  const setLips = (k: 'si' | 'no') => {
    el.querySelectorAll<HTMLElement>('[data-lips]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lips === k)));
    lipsPanel.dataset.kind = k;
    lipsPanel.innerHTML = LIPS[k].map(([t, d]) => `<li><span>${icon(k === 'si' ? 'check' : 'x', 20, 2.8)}</span><h3>${t}</h3><p>${rich(d)}</p></li>`).join('');
    lipsPanel.classList.remove('is-swap');
    void lipsPanel.offsetWidth;
    lipsPanel.classList.add('is-swap');
  };
  setLips('si');

  /* Letras que se ven igual */
  const shapePanel = el.querySelector<HTMLElement>('[data-shape-panel]')!;
  const shapeBtns = Array.from(el.querySelectorAll<HTMLElement>('[data-shape]'));
  const setShape = (i: number, focus = false) => {
    shapeBtns.forEach((b, n) => {
      b.setAttribute('aria-selected', String(n === i));
      b.tabIndex = n === i ? 0 : -1;
    });
    if (focus) shapeBtns[i].focus();
    const sh = SHAPES[i];
    shapePanel.setAttribute('aria-labelledby', `cs-sh-${i}`);
    shapePanel.innerHTML = `
      <svg class="cs-mouth" viewBox="0 0 200 120" aria-hidden="true">${sh.mouth}</svg>
      <div>
        <p class="cs-shape__l">${sh.letters}</p>
        <h3>${sh.name}</h3>
        <p>${rich(sh.text)}</p>
        <p class="cs-shape__w">${icon('eye', 18)}<span>${sh.words}</span></p>
      </div>`;
    shapePanel.classList.remove('is-swap');
    void shapePanel.offsetWidth;
    shapePanel.classList.add('is-swap');
  };
  setShape(0);

  const offs = [
    on(el, 'click', '[data-idx]', () => openIdx(Boolean(idx.hidden))),
    on(el, 'click', '[data-jump]', (e, b) => {
      e.preventDefault();
      jump(b.dataset.jump!);
    }),
    on(el, 'click', '[data-to]', (_, b) => go(b.dataset.to as 'guia' | 'ayuda')),
    on(el, 'click', '[data-ready]', (_, b) => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      updateReady();
    }),
    on(el, 'click', '[data-lips]', (_, b) => setLips(b.dataset.lips as 'si' | 'no')),
    on(el, 'click', '[data-shape]', (_, b) => setShape(Number(b.dataset.shape))),
    on(el, 'keydown', '[data-shape]', (e, b) => {
      const n = SHAPES.length;
      const i = Number(b.dataset.shape);
      const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : -1;
      if (next < 0) return;
      e.preventDefault();
      setShape(next, true);
    }),
    on(el, 'click', '[data-opt]', (_, b) => {
      el.querySelectorAll<HTMLElement>('[data-opt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelector<HTMLElement>('[data-opt-out]')!.innerHTML = `${icon('volume', 18)} Voz Propia diría: <b>«${OPTS[Number(b.dataset.opt)]}»</b>`;
    }),
  ];

  return () => {
    ac.abort();
    offs.forEach((off) => off());
    cancelAnimationFrame(raf);
    reveal.disconnect();
    spy.disconnect();
  };
}
