import { go } from '../../app/router';
import { pushHistory, state } from '../../app/state';
import { engine } from '../../core/engine';
import { syncShared } from '../../core/shared-sync';
import type { LipSequence, Phrase, Prediction } from '../../core/types';
import { captureSequence, CaptureError, type Capture } from '../../core/vision/recorder';
import { speakPhrase } from '../../core/voice/speaker';
import { createStage } from '../components/camera-stage';
import { bindPalette, paletteHTML } from '../components/theme';
import { toast } from '../components/toast';
import { $, esc, on, vibrate } from '../dom';
import { icon } from '../icons';

const RING = 2 * Math.PI * 54;
/** Con una sola palabra: hasta cuántas veces la variación normal se acepta como «la dijiste». */
const VERIFY_LIMIT = 1.8;
const BARS = 28;

type Screen = 'empty' | 'idle' | 'listening' | 'said' | 'miss' | 'pick';

export function usarView(root: HTMLElement) {
  root.innerHTML = `
    <div class="usar" data-usar>
      <div class="u-aurora" aria-hidden="true"><i></i><i></i><i></i></div>

      <header class="u-head">
        <button class="u-back" type="button" data-back>${icon('arrow-left', 18, 2.4)}<span>Guía</span></button>
        <div class="u-title">
          <p class="u-over">[ Iniciar a utilizar ]</p>
          <h1>Mueve los labios.<br><span>Voz Propia pone la voz.</span></h1>
        </div>
        <div class="u-head__right">
          <span class="u-live" data-live><i></i><span data-live-text>En vivo</span></span>
          ${paletteHTML()}
        </div>
      </header>

      <div class="u-grid">
        <section class="u-card u-said" aria-labelledby="u-said-l">
          <div class="u-row">
            <p class="u-label" id="u-said-l">Lo que dices</p>
            <span class="u-count" data-count></span>
          </div>
          <div class="u-screen" data-screen aria-live="polite"></div>
          <div class="u-words">
            <p class="u-label">Palabras disponibles <small>toca una para escucharla</small></p>
            <ul class="u-chips" data-words></ul>
          </div>
        </section>

        <section class="u-card u-cam" aria-labelledby="u-cam-l">
          <div class="u-row"><p class="u-label" id="u-cam-l">Tu cámara</p><span class="u-private">${icon('lock', 14, 2.2)} No se guarda video</span></div>
          <div data-stage></div>
          <div class="u-capture">
            <button class="u-btn" type="button" data-capture aria-describedby="u-hint">
              <svg class="u-btn__ring" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="54" class="track"/>
                <circle cx="60" cy="60" r="54" class="bar" data-ring style="stroke-dasharray:${RING};stroke-dashoffset:${RING}"/>
              </svg>
              <span class="u-btn__core">${icon('scan-face', 38, 1.8)}</span>
            </button>
            <div class="u-capture__meta">
              <p class="u-capture__label" data-label>Toca y di la palabra</p>
              <p class="u-capture__hint" id="u-hint" data-hint>Sin voz, solo mueve los labios. Se detiene sola.</p>
            </div>
          </div>
        </section>
      </div>
      <div class="u-options" data-options hidden></div>
    </div>`;

  const el = $('[data-usar]', root);
  const screen = $('[data-screen]', root);
  const wordsEl = $('[data-words]', root);
  const countEl = $('[data-count]', root);
  const liveEl = $('[data-live]', root);
  const liveText = $('[data-live-text]', root);
  const btn = $<HTMLButtonElement>('[data-capture]', root);
  const ring = $<SVGCircleElement>('[data-ring]', root);
  const label = $('[data-label]', root);
  const hint = $('[data-hint]', root);
  const options = $('[data-options]', root);

  const stage = createStage();
  $('[data-stage]', root).append(stage.el);

  let mode: Screen = 'empty';
  let capture: Capture | null = null;
  let lastSeq: LipSequence | null = null;
  let lastPred: Prediction | null = null;
  let eq: HTMLElement[] = [];
  let raf = 0;
  let seen: Set<string> | null = null;

  const trained = () => engine.trainedPhrases;

  /* ---------- Pantalla de la izquierda ---------- */

  const setScreen = (m: Screen, html: string) => {
    mode = m;
    el.dataset.screen = m;
    screen.innerHTML = html;
    eq = Array.from(screen.querySelectorAll<HTMLElement>('.u-eq i'));
  };

  const renderEmpty = () =>
    setScreen(
      'empty',
      `<div class="u-empty">
        <span class="u-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <h2>Aún no hay palabras listas</h2>
        <p>Nuestro equipo las prepara con cuidado. Cuando agregue la primera, aparece aquí sola, al instante.</p>
      </div>`,
    );

  const renderIdle = () => {
    const list = trained();
    if (!list.length) return renderEmpty();
    const only = list.length === 1 ? list[0] : null;
    setScreen(
      'idle',
      `<div class="u-idle">
        <p class="u-idle__eyebrow">Listo para leer</p>
        ${
          only
            ? `<p class="u-ghost" aria-hidden="true">${esc(only.text)}</p>
               <p class="u-idle__lead">Pon tu cara frente a la cámara, toca el botón y di <b>«${esc(only.text)}»</b> moviendo los labios.</p>`
            : `<p class="u-idle__lead">Pon tu cara frente a la cámara, toca el botón y di <b>una de las palabras</b> moviendo los labios.</p>`
        }
      </div>`,
    );
  };

  const renderListening = () =>
    setScreen(
      'listening',
      `<div class="u-listen">
        <div class="u-eq" aria-hidden="true">${'<i></i>'.repeat(BARS)}</div>
        <p class="u-listen__t">Te estoy viendo…</p>
        <p class="u-listen__s">Mueve los labios como si hablaras.</p>
      </div>`,
    );

  const renderSaid = (p: Phrase, match: number, corrected = false) => {
    const pct = Math.round(match * 100);
    setScreen(
      'said',
      `<div class="u-said-ok">
        <span class="u-burst" aria-hidden="true"></span>
        <span class="u-check" aria-hidden="true">${icon('check', 30, 3)}</span>
        <p class="u-said-ok__eyebrow">${corrected ? 'Corregido, gracias' : 'Dijiste'}</p>
        <p class="u-word" data-word>${esc(p.text)}</p>
        ${
          corrected
            ? ''
            : `<div class="u-match" role="img" aria-label="Se parece ${pct} por ciento a la palabra"><span>Se parece</span><div class="u-match__track"><i style="--m:${match.toFixed(3)}"></i></div><b>${pct}%</b></div>`
        }
        <div class="u-actions">
          <button class="u-pill" type="button" data-repeat="${p.id}">${icon('volume', 18)}<span>Decir otra vez</span></button>
          <button class="u-pill u-pill--ghost" type="button" data-again>${icon('rotate-ccw', 18)}<span>Otra palabra</span></button>
        </div>
      </div>`,
    );
  };

  const renderMiss = (title: string, detail: string) => {
    const list = trained();
    const only = list.length === 1 ? list[0] : null;
    setScreen(
      'miss',
      `<div class="u-miss">
        <span class="u-miss__ic" aria-hidden="true">${icon('help', 30, 2)}</span>
        <h2>${esc(title)}</h2>
        <p>${esc(detail)}</p>
        ${only ? `<p class="u-miss__try">Inténtalo otra vez: di <b>«${esc(only.text)}»</b>.</p>` : ''}
        <div class="u-actions"><button class="u-pill" type="button" data-again>${icon('rotate-ccw', 18)}<span>Intentar de nuevo</span></button></div>
      </div>`,
    );
    vibrate([20, 40, 20]);
  };

  /* ---------- Palabras disponibles (se actualizan en vivo) ---------- */

  const renderWords = () => {
    const list = trained();
    countEl.textContent = list.length ? `${list.length} ${list.length === 1 ? 'palabra' : 'palabras'}` : '';
    const fresh = new Set<string>();
    if (seen) for (const p of list) if (!seen.has(p.id)) fresh.add(p.id);
    seen = new Set(list.map((p) => p.id));
    wordsEl.innerHTML = list.length
      ? list
          .map(
            (p) => `<li><button class="u-chip${fresh.has(p.id) ? ' is-new' : ''}" type="button" data-say="${p.id}">
              <span class="sphere sphere--sm sphere--${p.category}">${icon(p.icon, 18)}</span><span>${esc(p.text)}</span>
              ${p.folder && p.folder !== 'Sin carpeta' ? `<small>${esc(p.folder)}</small>` : ''}
            </button></li>`,
          )
          .join('')
      : `<li class="u-chips__empty">Todavía no hay ninguna.</li>`;
    if (fresh.size) {
      const names = list.filter((p) => fresh.has(p.id)).map((p) => `«${p.text}»`);
      toast(`${names.length === 1 ? 'Nueva palabra' : 'Nuevas palabras'}: ${names.join(', ')}`, { tone: 'ok' });
      vibrate(14);
    }
  };

  const renderReady = () => {
    const n = trained().length;
    btn.disabled = n === 0;
    const only = n === 1 ? trained()[0] : null;
    if (!capture) label.textContent = only ? `Toca y di «${only.text}»` : n ? 'Toca y di una palabra' : 'Esperando la primera palabra';
    if (mode === 'empty' || mode === 'idle') renderIdle();
    else if (!n) renderEmpty();
  };

  /* ---------- Leer los labios ---------- */

  const setCapturing = (live: boolean) => {
    btn.classList.toggle('is-live', live);
    stage.setRecording(live);
    el.classList.toggle('is-listening', live);
    const only = trained().length === 1 ? trained()[0] : null;
    label.textContent = live ? 'Leyendo tus labios…' : only ? `Toca y di «${only.text}»` : 'Toca y di una palabra';
    hint.textContent = live ? 'Toca otra vez para terminar.' : 'Sin voz, solo mueve los labios. Se detiene sola.';
    if (!live) ring.style.strokeDashoffset = String(RING);
  };

  const loop = () => {
    const lv = stage.level;
    const t = performance.now();
    eq.forEach((b, i) => {
      const wave = Math.sin(t / 150 + i * 0.55) * 0.5 + 0.5;
      const h = 0.1 + Math.min(1, lv * 2.6) * (0.35 + wave * 0.65) + wave * 0.08;
      b.style.transform = `scaleY(${Math.min(1, h).toFixed(3)})`;
    });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const say = async (p: Phrase) => {
    pushHistory(p.id);
    vibrate(18);
    await speakPhrase(p, state.settings);
  };

  const showOptions = (pred: Prediction) => {
    const cards = pred.candidates
      .map((c, i) => {
        const p = engine.phrase(c.phraseId);
        if (!p) return '';
        return `<button class="u-opt" type="button" data-pick="${p.id}" style="--i:${i}">
          <span class="sphere sphere--sm sphere--${p.category}">${icon(p.icon, 20)}</span>
          <span class="u-opt__t">${esc(p.text)}</span>
          <span class="u-opt__p">${Math.round(c.probability * 100)}%</span>
        </button>`;
      })
      .join('');
    options.innerHTML = `
      <div class="u-opts" role="dialog" aria-label="¿Cuál quisiste decir?">
        <p class="u-opts__t">No estoy seguro. ¿Cuál quisiste decir?</p>
        <div class="u-opts__list">${cards}</div>
        <div class="u-opts__foot">
          <button class="u-pill u-pill--ghost" type="button" data-retry>${icon('rotate-ccw', 16)}<span>Repetir</span></button>
          <button class="u-pill u-pill--ghost" type="button" data-dismiss>${icon('x', 16)}<span>Ninguna</span></button>
        </div>
      </div>`;
    options.hidden = false;
    (options.querySelector('[data-pick]') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const hideOptions = () => {
    options.hidden = true;
    options.innerHTML = '';
  };

  const startCapture = async () => {
    if (capture) return capture.stop();
    hideOptions();
    if (stage.face === 'sin-camara') {
      await stage.start();
      if (stage.face === 'sin-camara') return;
      toast('Cámara lista. Ahora toca de nuevo y habla.', { tone: 'ok' });
      return;
    }
    if (stage.face === 'buscando') {
      renderMiss('No veo tu cara', 'Ponte frente a la cámara, con la cara completa y buena luz.');
      return;
    }
    vibrate(12);
    const maxMs = state.settings.maxCaptureMs;
    capture = captureSequence({
      maxMs,
      autoStop: true,
      onProgress: (elapsed) => {
        ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, elapsed / maxMs)));
      },
    });
    setCapturing(true);
    renderListening();
    try {
      const seq = await capture.result;
      lastSeq = seq;
      const list = trained();
      if (list.length === 1) {
        // Una sola palabra: se acepta solo si el movimiento se parece de verdad a sus ejemplos.
        const v = await engine.verify(seq);
        lastPred = null;
        if (v && v.ratio <= VERIFY_LIMIT) {
          const match = Math.max(0.6, Math.min(1, 1 - ((v.ratio - 1) / (VERIFY_LIMIT - 1)) * 0.4));
          renderSaid(v.phrase, match);
          void say(v.phrase);
        } else {
          renderMiss('No te entendí', `Tus labios se parecen poco a «${list[0].text}». No digo nada hasta estar seguro.`);
        }
      } else {
        const pred = await engine.recognize(seq, state.settings.autoSpeakThreshold);
        lastPred = pred;
        const top = pred.candidates[0] && engine.phrase(pred.candidates[0].phraseId);
        if (!top) renderMiss('No te entendí', 'No pude leer ninguna palabra. Intenta otra vez.');
        else if (pred.ambiguous) {
          renderIdle();
          showOptions(pred);
        } else {
          renderSaid(top, pred.confidence);
          void say(top);
        }
      }
    } catch (err) {
      if (err instanceof CaptureError && err.code === 'sin-rostro') {
        renderMiss('Perdí de vista tu boca', 'Intenta de nuevo con la cara centrada y sin taparte la boca.');
      } else if (!(err instanceof CaptureError)) {
        renderMiss('Algo salió mal', 'Intenta de nuevo.');
      } else renderIdle();
    } finally {
      capture = null;
      setCapturing(false);
    }
  };

  /* ---------- Conexión en vivo ---------- */

  const updateNet = () => {
    const online = navigator.onLine;
    liveEl.classList.toggle('is-off', !online);
    liveText.textContent = online ? 'En vivo' : 'Sin internet · uso lo guardado';
  };

  const offs = [
    on(root, 'click', '[data-back]', () => go('guia')),
    on(root, 'click', '[data-capture]', () => void startCapture()),
    on(root, 'click', '[data-say]', (_, b) => {
      const p = engine.phrase(b.dataset.say!);
      if (p) void say(p);
    }),
    on(root, 'click', '[data-repeat]', (_, b) => {
      const p = engine.phrase(b.dataset.repeat!);
      if (p) void say(p);
    }),
    on(root, 'click', '[data-again]', () => renderIdle()),
    on(root, 'click', '[data-pick]', async (_, b) => {
      const p = engine.phrase(b.dataset.pick!);
      if (!p) return;
      hideOptions();
      const wasTop = lastPred?.candidates[0]?.phraseId === p.id;
      renderSaid(p, 1, !wasTop);
      void say(p);
      if (lastSeq && state.settings.learnFromUse) {
        await engine.addSample(p.id, lastSeq, 'correccion');
        lastSeq = null;
      }
    }),
    on(root, 'click', '[data-retry]', () => {
      hideOptions();
      void startCapture();
    }),
    on(root, 'click', '[data-dismiss]', () => {
      hideOptions();
      renderIdle();
    }),
    engine.onChange(() => {
      renderWords();
      renderReady();
    }),
  ];
  const offPalette = bindPalette(root);
  addEventListener('online', updateNet);
  addEventListener('offline', updateNet);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !options.hidden) hideOptions();
  };
  addEventListener('keydown', onKey);

  updateNet();
  renderWords();
  renderReady();
  void syncShared();
  void stage.start();

  return () => {
    capture?.cancel();
    cancelAnimationFrame(raf);
    removeEventListener('online', updateNet);
    removeEventListener('offline', updateNet);
    removeEventListener('keydown', onKey);
    offs.forEach((off) => off());
    offPalette();
    stage.destroy();
  };
}
