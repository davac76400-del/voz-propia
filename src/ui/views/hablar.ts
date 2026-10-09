import { go } from '../../app/router';
import { pushHistory, state } from '../../app/state';
import { engine } from '../../core/engine';
import type { LipSequence, Phrase, Prediction } from '../../core/types';
import { captureSequence, CaptureError, type Capture } from '../../core/vision/recorder';
import { speakPhrase } from '../../core/voice/speaker';
import { createStage } from '../components/camera-stage';
import { toast } from '../components/toast';
import { $, esc, on, vibrate } from '../dom';
import { icon } from '../icons';

const RING = 2 * Math.PI * 54;

export function hablarView(root: HTMLElement) {
  const pro = state.settings.role === 'programador';
  root.innerHTML = `
    <section class="view talk">
      <header class="view-head">
        <div>
          <p class="kicker">[ ${pro ? 'Probar lectura' : 'Hablar'} ]</p>
          <h1>${pro ? 'Prueba cómo lee.<br><span class="hl">Así lo vive el usuario.</span>' : 'Mueve los labios.<br><span class="hl">Yo pongo la voz.</span>'}</h1>
        </div>
        <span class="chip chip--soft" data-ready></span>
      </header>
      <div class="talk__grid">
        <div class="talk__stage" data-stage>
          <div class="options" data-options hidden></div>
        </div>
        <div class="talk__panel">
          <div class="result" data-result aria-live="polite"></div>
          <div class="capture">
            <button class="capture__btn" type="button" data-capture aria-describedby="capture-hint">
              <svg class="capture__ring" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="54" class="track"/>
                <circle cx="60" cy="60" r="54" class="bar" data-ring style="stroke-dasharray:${RING};stroke-dashoffset:${RING}"/>
              </svg>
              <span class="capture__core">${icon('scan-face', 36, 1.8)}</span>
            </button>
            <div class="capture__meta">
              <p class="capture__label" data-label>Toca y habla sin voz</p>
              <p class="capture__hint" id="capture-hint" data-hint>Se detiene sola cuando dejas de mover la boca.</p>
              <div class="meter" aria-hidden="true">${'<i></i>'.repeat(7)}</div>
            </div>
          </div>
          <div class="history" data-history></div>
        </div>
      </div>
    </section>`;

  const stageHost = $('[data-stage]', root);
  const stage = createStage();
  stageHost.prepend(stage.el);

  const btn = $<HTMLButtonElement>('[data-capture]', root);
  const ring = $<SVGCircleElement>('[data-ring]', root);
  const label = $('[data-label]', root);
  const hint = $('[data-hint]', root);
  const result = $('[data-result]', root);
  const options = $('[data-options]', root);
  const historyEl = $('[data-history]', root);
  const ready = $('[data-ready]', root);
  const bars = Array.from(root.querySelectorAll<HTMLElement>('.meter i'));

  let capture: Capture | null = null;
  let lastSeq: LipSequence | null = null;
  let lastPred: Prediction | null = null;
  let raf = 0;

  const meterLoop = () => {
    const lv = stage.level;
    bars.forEach((b, i) => {
      const wave = Math.sin(performance.now() / 160 + i * 0.9) * 0.5 + 0.5;
      const h = capture ? 0.18 + Math.min(1, lv * 2.4) * (0.45 + wave * 0.55) : 0.14 + lv * 0.6;
      b.style.transform = `scaleY(${h.toFixed(3)})`;
    });
    raf = requestAnimationFrame(meterLoop);
  };
  raf = requestAnimationFrame(meterLoop);

  const renderReady = () => {
    const n = engine.trainedPhrases.length;
    ready.innerHTML = `<span class="dot"></span> ${n} ${n === 1 ? 'frase lista' : 'frases listas'}`;
    btn.disabled = n === 0;
    // El programador siempre ve la cámara para probarla; el usuario solo si ya hay frases preparadas.
    root.querySelector('.talk')?.classList.toggle('is-empty', n === 0 && !pro);
    if (n === 0) renderEmpty();
    else if (!result.firstElementChild || result.querySelector('.result__empty')) renderIdle();
  };

  const renderEmpty = () => {
    result.innerHTML = pro
      ? `
      <div class="result__empty">
        <span class="sphere sphere--accent">${icon('sparkles', 26)}</span>
        <h2>Aún no hay frases entrenadas</h2>
        <p>Graba cada frase 3 veces con la persona que la va a usar. Mientras, aquí puedes revisar que la cámara vea bien su boca.</p>
        <div class="row">
          <button class="btn btn--primary" type="button" data-go="entrenar">${icon('sparkles', 18)}<span>Entrenar frases</span></button>
        </div>
      </div>`
      : `
      <div class="result__empty">
        <span class="sphere sphere--accent">${icon('hand-heart', 26)}</span>
        <h2>Tus frases todavía se están preparando</h2>
        <p>Tu familia o tu equipo las van a enseñar muy pronto. Mientras tanto, el tablero ya habla por ti: toca y se escucha.</p>
        <div class="row">
          <button class="btn btn--primary btn--lg" type="button" data-go="tablero">${icon('layout-grid', 20)}<span>Abrir el tablero</span></button>
        </div>
      </div>`;
  };

  const renderIdle = () => {
    if (!engine.trainedPhrases.length) return renderEmpty();
    result.innerHTML = `
      <div class="result__idle">
        <p class="result__eyebrow">Listo para leer</p>
        <p class="result__lead">${pro ? 'Pide que mire a la cámara, toca el botón y que diga una frase sin voz.' : 'Mira a la cámara, toca el botón y di una de tus frases moviendo los labios.'}</p>
        <div class="result__known">${engine.trainedPhrases
          .slice(0, 8)
          .map((p) => `<span class="mini-chip">${icon(p.icon, 14)}${esc(p.text)}</span>`)
          .join('')}</div>
      </div>`;
  };

  // En pantallas angostas el resultado queda bajo el botón: se acerca a la vista al aparecer.
  const reveal = () => {
    if (innerWidth < 960) result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const renderSaid = (p: Phrase, confidence: number, corrected = false) => {
    const pct = Math.round(confidence * 100);
    const tone = confidence >= 0.75 ? 'ok' : confidence >= 0.5 ? 'mid' : 'low';
    result.innerHTML = `
      <div class="said said--${tone}">
        <div class="said__top">
          <span class="sphere sphere--${p.category}">${icon(p.icon, 26)}</span>
          <div class="conf" style="--p:${corrected ? 100 : pct}" aria-label="Seguridad ${pct}%">
            <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="track"/><circle cx="22" cy="22" r="18" class="bar" pathLength="100"/></svg>
            <span>${corrected ? icon('check', 16, 2.6) : `${pct}%`}</span>
          </div>
        </div>
        <p class="said__label">${corrected ? (state.settings.learnFromUse ? 'Corregido y aprendido' : 'Corregido') : 'Dijiste'}</p>
        <p class="said__text">${esc(p.text)}</p>
        <div class="row">
          <button class="btn btn--soft" type="button" data-repeat="${p.id}">${icon('volume', 18)}<span>Decir otra vez</span></button>
          ${corrected ? '' : `<button class="btn btn--ghost" type="button" data-wrong>${icon('undo', 18)}<span>No era eso</span></button>`}
        </div>
      </div>`;
  };

  const renderHistory = () => {
    const items = state.history.map((id) => engine.phrase(id)).filter((p): p is Phrase => !!p);
    historyEl.innerHTML = items.length
      ? `<p class="history__title">Hace un momento</p><div class="history__list">${items
          .map((p) => `<button class="mini-chip mini-chip--btn" type="button" data-repeat="${p.id}">${icon(p.icon, 14)}${esc(p.text)}</button>`)
          .join('')}</div>`
      : '';
  };

  const say = async (p: Phrase) => {
    pushHistory(p.id);
    renderHistory();
    vibrate(18);
    await speakPhrase(p, state.settings);
  };

  const showOptions = (pred: Prediction, title: string) => {
    const cards = pred.candidates
      .map((c, i) => {
        const p = engine.phrase(c.phraseId);
        if (!p) return '';
        return `<button class="opt" type="button" data-pick="${p.id}" style="--i:${i}" data-tilt="10">
          <span class="sphere sphere--sm sphere--${p.category}">${icon(p.icon, 20)}</span>
          <span class="opt__text">${esc(p.text)}</span>
          <span class="opt__pct">${Math.round(c.probability * 100)}%</span>
        </button>`;
      })
      .join('');
    options.innerHTML = `
      <div class="options__card" role="dialog" aria-label="${esc(title)}">
        <p class="options__title">${esc(title)}</p>
        <div class="options__list">${cards}</div>
        <div class="options__foot">
          <button class="btn btn--ghost btn--sm" type="button" data-retry>${icon('rotate-ccw', 16)}<span>Repetir</span></button>
          <button class="btn btn--ghost btn--sm" type="button" data-dismiss>${icon('x', 16)}<span>Ninguna</span></button>
        </div>
      </div>`;
    options.hidden = false;
    (options.querySelector('[data-pick]') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const hideOptions = () => {
    options.hidden = true;
    options.innerHTML = '';
  };

  const setCapturing = (on: boolean) => {
    btn.classList.toggle('is-live', on);
    stage.setRecording(on);
    label.textContent = on ? 'Leyendo tus labios…' : 'Toca y habla sin voz';
    hint.textContent = on ? 'Toca otra vez para terminar.' : 'Se detiene sola cuando dejas de mover la boca.';
    if (!on) ring.style.strokeDashoffset = String(RING);
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
      toast('No veo tu cara. Ponte frente a la cámara con buena luz.', { tone: 'warn' });
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
    try {
      const seq = await capture.result;
      lastSeq = seq;
      if (!engine.hasSpeech(seq)) {
        toast('No vi que movieras los labios. Dilo moviendo la boca, de frente a la cámara.', { tone: 'warn' });
        return;
      }
      const pred = await engine.recognize(seq, state.settings.autoSpeakThreshold);
      lastPred = pred;
      const top = pred.candidates[0] && engine.phrase(pred.candidates[0].phraseId);
      if (!top) return;
      if (pred.ambiguous) {
        renderIdle();
        showOptions(pred, '¿Cuál quisiste decir?');
      } else {
        renderSaid(top, pred.confidence);
        reveal();
        void say(top);
      }
    } catch (err) {
      if (err instanceof CaptureError && err.code === 'sin-rostro') {
        toast('Perdí de vista tu boca. Intenta de nuevo con la cara centrada.', { tone: 'warn' });
      }
    } finally {
      capture = null;
      setCapturing(false);
    }
  };

  const offs = [
    on(root, 'click', '[data-capture]', () => void startCapture()),
    on(root, 'click', '[data-go]', (_, el) => go(el.dataset.go as 'entrenar' | 'tablero')),
    on(root, 'click', '[data-repeat]', (_, el) => {
      const p = engine.phrase(el.dataset.repeat!);
      if (p) void say(p);
    }),
    on(root, 'click', '[data-wrong]', () => {
      if (lastPred) showOptions(lastPred, '¿Cuál era?');
    }),
    on(root, 'click', '[data-pick]', async (_, el) => {
      const p = engine.phrase(el.dataset.pick!);
      if (!p) return;
      hideOptions();
      const wasTop = lastPred?.candidates[0]?.phraseId === p.id;
      renderSaid(p, 1, !wasTop);
      void say(p);
      // Cada confirmación es un ejemplo nuevo: la app mejora con el uso, como en LipLearner.
      if (lastSeq && state.settings.learnFromUse) {
        await engine.addSample(p.id, lastSeq, 'correccion');
        lastSeq = null;
        toast('Gracias. Aprendí de esta respuesta.', { tone: 'ok' });
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
    engine.onChange(renderReady),
  ];

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !options.hidden) hideOptions();
  };
  addEventListener('keydown', onKey);

  renderReady();
  renderHistory();
  if (pro || engine.trainedPhrases.length) void stage.start();

  return () => {
    capture?.cancel();
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey);
    offs.forEach((off) => off());
    stage.destroy();
  };
}
