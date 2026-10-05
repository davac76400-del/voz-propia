import '@fontsource/anton/latin-400.css';
import { go } from '../../app/router';
import { state } from '../../app/state';
import { engine } from '../../core/engine';
import { speakPhrase, speakText } from '../../core/voice/speaker';
import { CATEGORY_LABEL } from '../../data/default-phrases';
import { HOSPITAL } from '../../data/hospital-phrases';
import type { Category } from '../../core/types';
import { esc, on, reducedMotion, rich, sleep } from '../dom';
import { icon } from '../icons';
import { bindPalette, currentTheme, paletteHTML, type Theme } from '../components/theme';
import type { GuideScene } from './guia-scene';

const ORDER: Category[] = ['respuesta', 'necesidad', 'cuerpo', 'emocion', 'social'];

const SHAPE_NAMES = ['Cerrados', 'Abiertos', 'Redondos', 'Anchos'];
const OPTIONS = ['Tengo sed', 'Tengo frío', 'Me duele'];
const BARS: [string, number][] = [['Tengo sed', 92], ['Tengo frío', 5], ['Me duele', 3]];
const PROMISES: [string, string, string][] = [
  ['wifi-off', 'Sin internet', 'Todo corre dentro del teléfono, *incluso en un cuarto sin señal*.'],
  ['shield-check', 'Sin video guardado', 'Nada se graba *ni se envía*.'],
  ['sparkles', 'Palabras preparadas', 'Nuestro equipo *prepara y cuida* cada palabra.'],
  ['volume', 'Tu voz, tu decisión', 'Suena con *la voz que tu familia eligió* para ti.'],
];

const TIPS: [string, string, string][] = [
  ['sun', 'Buena luz', 'Que la luz te dé de frente, no por detrás.'],
  ['scan-face', 'Cara de frente', 'El teléfono a la altura de tu cara, a un brazo de distancia.'],
  ['eye', 'Labios a la vista', 'Sin cubrebocas ni mano frente a la boca.'],
  ['gauge', 'Con calma', 'Mueve los labios claro y sin prisa, como si hablaras.'],
];

/** Capítulos con escena 3D: id, altura del recorrido (en pantallas) y nombre para el índice. */
const CHAPTERS: { name: string; h: number }[] = [
  { name: 'Inicio', h: 1.9 },
  { name: 'Mira', h: 2.7 },
  { name: 'Forma', h: 3.2 },
  { name: 'Compara', h: 2.6 },
  { name: 'Duda', h: 2.6 },
  { name: 'Voz', h: 2.8 },
  { name: 'Promesas', h: 2.4 },
];

/** Paradas del scroll: una por pantalla, así nadie pasa de largo un texto aunque deslice rápido. */
const stops = (h: number) =>
  Array.from({ length: Math.ceil(h - 0.05) }, (_, k) => `<i class="g-stop" style="top:${k * 100}svh" aria-hidden="true"></i>`).join('');

function chapter(i: number, text: 'l' | 'r' | 'c', kicker: string, title: string, body: string, extra = '') {
  return `
    <section class="g-ch" data-ch="${i}" data-text="${text}" style="--h:${CHAPTERS[i].h * 100}svh" aria-labelledby="g-t${i}">
      ${stops(CHAPTERS[i].h)}
      <div class="g-ch__stick">
        <div class="g-copy">
          <p class="g-over" style="--i:0">[ ${kicker} ]</p>
          <h2 class="g-title" id="g-t${i}" style="--i:1">${title}</h2>
          <p class="g-body" style="--i:2">${rich(body)}</p>
          ${extra}
        </div>
      </div>
    </section>`;
}

function template() {
  const stats = [['0', 'videos guardados'], ['0', 'aparatos extra'], ['1', 'teléfono, nada más']]
    .map(([v, l], i) => `<li style="--i:${3 + i}"><b>${v}</b><span>${l}</span></li>`)
    .join('');
  const shapes = SHAPE_NAMES.map((n, i) => `<li data-shape="${i}" style="--i:${3 + i}"><i></i>${n}</li>`).join('');
  const bars = BARS.map(
    ([t, w], i) => `<div class="g-bar" style="--i:${3 + i};--w:${w / 100}"><span>${t}</span><div class="g-bar__track"><i></i></div><b>${w}%</b></div>`,
  ).join('');
  const options = OPTIONS.map((t, i) => `<button class="g-opt" type="button" data-opt="${i}" aria-pressed="false" style="--i:${3 + i}">${t}</button>`).join('');
  const promises = PROMISES.map(
    ([ic, t, d], i) => `<li class="g-promise" style="--i:${3 + i}"><span class="g-promise__ic">${icon(ic, 24, 1.9)}</span><div><h3>${t}</h3><p>${rich(d)}</p></div></li>`,
  ).join('');
  const tips = TIPS.map(
    ([ic, t, d], i) => `<li class="g-tip" data-reveal style="transition-delay:${i * 80}ms"><span class="g-tip__ic">${icon(ic, 22, 1.9)}</span><h3>${t}</h3><p>${d}</p></li>`,
  ).join('');
  const hospTabs = HOSPITAL.map(
    (g, i) => `<button class="g-htab" type="button" role="tab" id="g-ht-${i}" aria-controls="g-hosp-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-hosp="${i}">${icon(g.icon, 16, 2.2)}<span>${g.tab}</span></button>`,
  ).join('');
  const rail = CHAPTERS.map((c, i) => `<button type="button" data-go="${i}" aria-label="Ir a: ${c.name}"><i></i><span>${c.name}</span></button>`).join('');

  return `
  <div class="guia" data-guia>
    <div class="g-stage" aria-hidden="true"><canvas></canvas></div>
    <nav class="g-rail" aria-label="Capítulos de la guía">${rail}</nav>
    ${paletteHTML()}
    <button class="g-skip" type="button" data-skip>${icon('arrow-down', 18, 2.4)}<span>Pasar directamente a la aplicación</span></button>
    <button class="g-skip g-top" type="button" data-top>${icon('arrow-up', 18, 2.4)}<span>Volver al inicio de la guía</span></button>

    <section class="g-ch g-ch--hero" data-ch="0" data-text="l" style="--h:${CHAPTERS[0].h * 100}svh" aria-labelledby="g-t0">
      ${stops(CHAPTERS[0].h)}
      <div class="g-ch__stick">
        <div class="g-copy">
          <p class="g-over" style="--i:0">[ Así funciona ]</p>
          <h1 class="g-hero" id="g-t0" style="--i:1"><span class="g-hero__a">Tus labios</span><span class="g-hero__b">hablan.</span></h1>
          <p class="g-body g-body--lead" style="--i:2">${rich('Mira cómo Voz Propia convierte el movimiento de tus labios en voz, *paso a paso y sin internet*.')}</p>
          <p class="g-cue" style="--i:3">${icon('arrow-down', 16)} Desliza para empezar</p>
        </div>
      </div>
    </section>

    ${chapter(1, 'r', '01 · Mira', 'Mira tus<br>labios.', 'La cámara de tu teléfono *mira cómo se mueven tus labios*, aunque te muevas un poco. *No graba video.*', `<ul class="g-stats">${stats}</ul>`)}
    ${chapter(2, 'l', '02 · Forma', 'Cada palabra<br>tiene una forma.', 'Los labios se cierran, se abren, se redondean y se estiran. *Esa secuencia es la huella de cada palabra.*', `<ol class="g-shapes" aria-label="Formas de los labios">${shapes}</ol>`)}
    ${chapter(3, 'r', '03 · Compara', 'La compara con<br>lo preparado.', 'Nuestro equipo prepara cada palabra con cuidado. Voz Propia compara tu movimiento con todas y *elige la más parecida*.', `<div class="g-bars" role="img" aria-label="Ejemplo: tengo sed 92 por ciento, tengo frío 5, me duele 3">${bars}</div><p class="g-note" style="--i:6">Ejemplo ilustrativo</p>`)}
    ${chapter(4, 'l', '04 · Duda', 'Si duda,<br>te pregunta.', 'Cuando dos palabras se parecen, *no adivina*. Te muestra las opciones y *tú eliges*.', `<div class="g-opts" role="group" aria-label="Opciones de ejemplo">${options}</div><p class="g-note" style="--i:6">Toca una opción. Ejemplo ilustrativo.</p>`)}
    ${chapter(5, 'r', '05 · Voz', 'Habla<br>por ti.', 'La palabra suena al instante, *sin internet*, con la voz que tu familia eligió.', `<button class="g-listen" type="button" data-listen style="--i:3">${icon('volume', 22, 2.2)}<span>Escuchar un ejemplo</span></button>`)}
    ${chapter(6, 'l', '06 · Promesas', 'Hecha<br>para tu voz.', 'Cuatro cosas que no cambian.', `<ul class="g-promises">${promises}</ul>`)}

    <section class="g-end" aria-labelledby="g-words-t">
      <div class="g-end__in">
        <div class="g-words" data-reveal>
          <p class="g-over g-over--dark">[ Contamos con ]</p>
          <h2 class="g-h2" id="g-words-t">Estas son las palabras<br>con las que contamos.</h2>
          <p class="g-sub">${rich('Toca una para escucharla. Cuando *nuestro equipo* prepara una nueva, aparece aquí.')}</p>
          <div data-words></div>
        </div>

        <div class="g-hosp" data-reveal>
          <p class="g-over">[ En preparación ]</p>
          <h2 class="g-h2">Lo que más se pide<br>en un hospital.</h2>
          <p class="g-sub">${rich('Nuestro equipo prepara estas frases una por una. Cuando estén listas, *las dirás moviendo los labios* y Voz Propia pondrá la voz.')}</p>
          <div class="g-htabs" role="tablist" aria-label="Temas">${hospTabs}</div>
          <ul class="g-hlist" id="g-hosp-panel" role="tabpanel" aria-labelledby="g-ht-0" data-hosp-panel></ul>
        </div>

        <div class="g-tipsbox">
          <p class="g-over" data-reveal>[ Antes de empezar ]</p>
          <h2 class="g-h2" data-reveal>Para que te entienda mejor.</h2>
          <ul class="g-tips">${tips}</ul>
          <button class="g-again g-again--start" type="button" data-go-page="consejos" data-reveal>${icon('lightbulb', 18, 2.4)}<span>Ver todos los consejos de uso</span></button>
        </div>

        <div class="g-start" data-reveal>
          <p class="g-over">[ Listo para empezar ]</p>
          <h2 class="g-h2 g-h2--light">Iniciar a utilizar</h2>
          <p class="g-start__p">${rich('Cuando haya palabras listas, aquí empiezas a hablar *con tus labios* y Voz Propia pone la voz.')}</p>
          <ol class="g-start__steps">
            <li><b>1</b><span>Pon tu cara frente a la cámara.</span></li>
            <li><b>2</b><span>Di la palabra moviendo los labios.</span></li>
            <li><b>3</b><span>Escucha cómo suena tu voz.</span></li>
            <li><b>4</b><span>Si duda, toca la palabra correcta.</span></li>
          </ol>
          <button class="g-start__btn" type="button" data-start disabled>${icon('lock', 20)}<span>Muy pronto</span></button>
          <p class="g-start__live" data-start-note hidden></p>
          <div class="g-more">
            <button class="g-again" type="button" data-top>${icon('arrow-up', 18, 2.4)}<span>Ver la guía otra vez desde el inicio</span></button>
            <button class="g-again" type="button" data-go-page="ayuda">${icon('info', 18, 2.4)}<span>Datos y cómo te ayuda</span></button>
            <button class="g-again" type="button" data-go-page="consejos">${icon('lightbulb', 18, 2.4)}<span>Consejos de uso</span></button>
          </div>
          <p class="g-start__hint">Para salir, mantén presionado <b>Regresar al inicio</b> arriba a la derecha.</p>
        </div>
      </div>
    </section>
  </div>`;
}

export function guiaView(root: HTMLElement) {
  root.innerHTML = template();
  const el = root.querySelector<HTMLElement>('[data-guia]')!;
  const stage = el.querySelector<HTMLElement>('.g-stage')!;
  const wordsHost = el.querySelector<HTMLElement>('[data-words]')!;
  const chapters = Array.from(el.querySelectorAll<HTMLElement>('.g-ch'));
  const railBtns = Array.from(el.querySelectorAll<HTMLElement>('[data-go]'));
  const shapeItems = Array.from(el.querySelectorAll<HTMLElement>('[data-shape]'));
  const still = reducedMotion();
  if (still) el.classList.add('is-static');
  document.documentElement.classList.add('snap-guide');

  const ac = new AbortController();
  const { signal } = ac;
  let scene: GuideScene | null = null;
  let disposed = false;

  const offPalette = bindPalette(el);
  addEventListener('palette', (e) => scene?.setPalette((e as CustomEvent<Theme>).detail), { signal });

  /* ---------- Escena 3D (si no hay WebGL, la guía se lee igual sin ella) ---------- */

  void (async () => {
    try {
      const { createGuideScene } = await import('./guia-scene');
      if (disposed) return;
      scene = createGuideScene(stage, stage.querySelector('canvas')!, {
        palette: currentTheme(),
        reducedMotion: still,
        onShape: (i) => shapeItems.forEach((s, n) => s.classList.toggle('is-on', n === i)),
      });
      el.classList.add('has-scene');
      update();
    } catch {
      el.classList.add('no-webgl');
    }
  })();

  /* ---------- Scroll: un solo escucha, medidas guardadas (nada se mide mientras se baja) ---------- */

  let tops: number[] = [];
  let stopYs: number[] = [];
  let endTop = 0;
  let raf = 0;
  let active = -1;

  function measure() {
    tops = chapters.map((c) => c.getBoundingClientRect().top + scrollY);
    const end = el.querySelector<HTMLElement>('.g-end')!;
    endTop = end.getBoundingClientRect().top + scrollY;
    stopYs = [...Array.from(el.querySelectorAll('.g-stop'), (s) => Math.round(s.getBoundingClientRect().top + scrollY)), Math.round(endTop)];
    update();
  }

  function update() {
    raf = 0;
    if (!tops.length) return;
    const y = scrollY;
    let k = 0;
    for (let i = 0; i < tops.length; i++) if (y >= tops[i] - 1) k = i;
    const nextTop = k + 1 < tops.length ? tops[k + 1] : endTop;
    const f = Math.min(1, Math.max(0, (y - tops[k]) / Math.max(1, nextTop - tops[k])));
    scene?.setProgress(k + f);
    scene?.setVisible(y < endTop - innerHeight * 0.6);
    chapters[k].style.setProperty('--f', f.toFixed(3));
    if (k !== active) {
      active = k;
      railBtns.forEach((b, i) => b.classList.toggle('is-on', i === k));
    }
    el.classList.toggle('is-end', y >= endTop - innerHeight * 0.5);
  }
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  addEventListener('scroll', onScroll, { passive: true, signal });
  const ro = new ResizeObserver(measure);
  ro.observe(el);
  addEventListener('load', measure, { signal });
  requestAnimationFrame(measure);

  /* ---------- Límite de velocidad con rueda y teclado: una pantalla por gesto ---------- */

  let paging = 0;
  let lockUntil = 0;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  /** Qué tan rápido avanza cada pantalla con rueda y teclado (1 = velocidad anterior). */
  const PAGE_SPEED = 1.65;
  const snap = (on: boolean) => document.documentElement.classList.toggle('snap-guide', on && !disposed);
  const pageTo = (to: number) => {
    cancelAnimationFrame(paging);
    const from = scrollY;
    if (still) {
      scrollTo(0, to);
      lockUntil = performance.now() + 250;
      return;
    }
    const t0 = performance.now();
    // Una pantalla tarda ~0.6 s; un salto largo (ir al final) dura más, hasta 1.9 s.
    const dur = Math.min(1900, 520 + (Math.abs(to - from) / Math.max(1, innerHeight)) * 70) / PAGE_SPEED;
    lockUntil = t0 + dur + 180 / PAGE_SPEED;
    snap(false);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      scrollTo(0, from + (to - from) * ease(k));
      if (k < 1) paging = requestAnimationFrame(step);
      else {
        paging = 0;
        snap(true);
      }
    };
    paging = requestAnimationFrame(step);
  };
  /**
   * Volver al inicio desde el final: un salto largo animado trababa la página en el teléfono (el imán de
   * scroll y el 3D se pelean). Se atenúa, se salta de golpe con el imán apagado y se vuelve a mostrar.
   */
  const jumpTop = () => {
    cancelAnimationFrame(paging);
    lockUntil = performance.now() + 900;
    if (still) {
      scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    el.style.transition = 'opacity 0.16s ease-out';
    el.style.opacity = '0';
    snap(false);
    window.setTimeout(() => {
      scrollTo({ top: 0, behavior: 'instant' });
      update();
      requestAnimationFrame(() => {
        scrollTo({ top: 0, behavior: 'instant' });
        el.style.opacity = '1';
        window.setTimeout(() => {
          el.style.transition = '';
          el.style.opacity = '';
          snap(true);
        }, 260);
      });
    }, 180);
  };
  const nextStop = (dir: number) => {
    const y = scrollY;
    if (dir > 0) return stopYs.find((s) => s > y + 4);
    for (let i = stopYs.length - 1; i >= 0; i--) if (stopYs[i] < y - 4) return stopYs[i];
    return 0;
  };
  // Dentro del final (palabras, consejos) el scroll vuelve a ser libre.
  const inFreeEnd = (dir: number) => scrollY > endTop + 4 || (scrollY >= endTop - 4 && dir > 0);
  const page = (dir: number) => {
    if (performance.now() < lockUntil) return;
    const to = nextStop(dir);
    if (to !== undefined) pageTo(to);
  };
  addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || !stopYs.length) return;
      const dir = Math.sign(e.deltaY);
      if (!dir || inFreeEnd(dir)) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) > 2) page(dir);
    },
    { passive: false, signal },
  );
  addEventListener(
    'keydown',
    (e) => {
      const keys: Record<string, number> = { ArrowDown: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 };
      const dir = keys[e.key];
      if (!dir || e.altKey || e.ctrlKey || e.metaKey || inFreeEnd(dir)) return;
      if ((e.target as Element).closest('button, input, select, textarea, a')) return;
      e.preventDefault();
      page(dir);
    },
    { signal },
  );

  /* ---------- Aparición de textos: solo clases, sin medir ni animar con JavaScript ---------- */

  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) en.target.classList.toggle('is-in', en.isIntersecting);
    },
    { rootMargin: '-28% 0px -28% 0px' },
  );
  chapters.forEach((c) => io.observe(c));
  const ioOnce = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('is-in');
        ioOnce.unobserve(en.target);
      }
    },
    { threshold: 0.15 },
  );
  el.querySelectorAll('[data-reveal]').forEach((n) => ioOnce.observe(n));
  if (still) el.querySelectorAll('.g-ch, [data-reveal]').forEach((n) => n.classList.add('is-in'));

  /* ---------- Palabras con las que contamos (solo las que ya tienen ejemplos) ---------- */

  const renderWords = () => {
    const trained = engine.trainedPhrases;
    // Las palabras que preparó el programador se agrupan en sus carpetas; las demás, por categoría.
    const byFolder = new Map<string, typeof trained>();
    for (const p of trained.filter((x) => x.folder)) (byFolder.get(p.folder!) ?? byFolder.set(p.folder!, []).get(p.folder!)!).push(p);
    const folderGroups = [...byFolder]
      .sort(([a], [b]) => Number(a === 'Sin carpeta') - Number(b === 'Sin carpeta') || a.localeCompare(b, 'es'))
      .map(([name, items]) => ({ key: name, label: name === 'Sin carpeta' ? 'Otras palabras' : name, folder: true, items }));
    const catGroups = ORDER.map((c) => ({ key: c, label: CATEGORY_LABEL[c], folder: false, items: trained.filter((p) => !p.folder && p.category === c) })).filter((g) => g.items.length);
    const groups = [...folderGroups, ...catGroups];
    wordsHost.innerHTML = groups.length
      ? groups
          .map(
            (g) => `
      <div class="g-group">
        <h3>${g.folder ? `<span class="g-folder-ic" aria-hidden="true">${icon('folder', 16, 2.2)}</span>` : `<i class="cat-dot cat-dot--${g.key}" aria-hidden="true"></i>`}${esc(g.label)}<span class="g-group__n">${g.items.length}</span></h3>
        <div class="g-tiles">${g.items
          .map(
            (p) => `<button class="g-word g-word--${p.category}" type="button" data-say="${p.id}">
              <span class="sphere sphere--sm sphere--${p.category}">${icon(p.icon, 20)}</span>
              <span>${esc(p.text)}</span>
            </button>`,
          )
          .join('')}</div>
      </div>`,
          )
          .join('')
      : `<div class="g-empty"><span class="g-empty__dots" aria-hidden="true"><i></i><i></i><i></i></span><p><b>Estamos preparando las primeras palabras.</b></p><p>Nuestro equipo las agrega con cuidado. Cuando haya una lista, aparece aquí para que la escuches.</p></div>`;
  };
  renderWords();

  /* ---------- Botón «Iniciar a utilizar»: se abre solo cuando ya hay palabras listas ---------- */

  const startBtn = el.querySelector<HTMLButtonElement>('[data-start]')!;
  const startNote = el.querySelector<HTMLElement>('[data-start-note]')!;
  const renderStart = () => {
    const n = engine.trainedPhrases.length;
    startBtn.disabled = n === 0;
    startBtn.classList.toggle('is-ready', n > 0);
    startBtn.innerHTML = n
      ? `${icon('camera', 22, 2.2)}<span>Activar cámara y empezar</span>`
      : `${icon('lock', 20)}<span>Muy pronto</span>`;
    startNote.hidden = n === 0;
    startNote.textContent = n ? `Ya hay ${n} ${n === 1 ? 'palabra lista' : 'palabras listas'}. Se actualizan solas.` : '';
  };
  renderStart();

  /* ---------- Lo que más se pide en un hospital (solo información, sin sonido) ---------- */

  const hospPanel = el.querySelector<HTMLElement>('[data-hosp-panel]')!;
  const hospBtns = Array.from(el.querySelectorAll<HTMLElement>('[data-hosp]'));
  const setHosp = (i: number, focus = false) => {
    hospBtns.forEach((b, n) => {
      b.setAttribute('aria-selected', String(n === i));
      b.tabIndex = n === i ? 0 : -1;
    });
    if (focus) hospBtns[i].focus();
    hospPanel.setAttribute('aria-labelledby', `g-ht-${i}`);
    hospPanel.innerHTML = HOSPITAL[i].items.map(([ic, t]) => `<li><span>${icon(ic, 22, 2)}</span>${t}</li>`).join('');
  };
  setHosp(0);

  /* ---------- Interacciones ---------- */

  const offs = [
    on(el, 'click', '[data-say]', (_, b) => {
      const p = engine.phrase(b.dataset.say!);
      if (p) void speakPhrase(p, state.settings);
    }),
    on(el, 'click', '[data-listen]', () => {
      const voice = speakText('Hola. Esta es mi voz.', state.settings);
      scene?.talk(Promise.all([voice, sleep(1600)]));
    }),
    on(el, 'click', '[data-opt]', (_, b) => {
      const i = Number(b.dataset.opt);
      const was = b.getAttribute('aria-pressed') === 'true';
      el.querySelectorAll<HTMLElement>('[data-opt]').forEach((o) => o.setAttribute('aria-pressed', 'false'));
      if (!was) b.setAttribute('aria-pressed', 'true');
      scene?.setChosen(was ? -1 : i);
    }),
    on(el, 'click', '[data-skip]', () => pageTo(Math.round(endTop))),
    on(el, 'click', '[data-top]', () => jumpTop()),
    on(el, 'click', '[data-hosp]', (_, b) => setHosp(Number(b.dataset.hosp))),
    on(el, 'keydown', '[data-hosp]', (e, b) => {
      const n = HOSPITAL.length;
      const i = Number(b.dataset.hosp);
      const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : -1;
      if (next < 0) return;
      e.preventDefault();
      setHosp(next, true);
    }),
    on(el, 'click', '[data-go-page]', (_, b) => go(b.dataset.goPage as 'ayuda' | 'consejos')),
    on(el, 'click', '[data-start]', () => go('usar')),
    on(el, 'click', '[data-go]', (_, b) => {
      const c = chapters[Number(b.dataset.go)];
      if (c) pageTo(Math.round(c.getBoundingClientRect().top + scrollY));
    }),
    engine.onChange(renderWords),
    engine.onChange(renderStart),
  ];

  return () => {
    disposed = true;
    document.documentElement.classList.remove('snap-guide');
    offPalette();
    ac.abort();
    offs.forEach((off) => off());
    io.disconnect();
    ioOnce.disconnect();
    ro.disconnect();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(paging);
    scene?.dispose();
  };
}
