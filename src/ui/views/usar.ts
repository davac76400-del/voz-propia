import { go } from '../../app/router';
import { pushHistory, state } from '../../app/state';
import { engine } from '../../core/engine';
import { syncShared } from '../../core/shared-sync';
import { composeSentence, spokenText } from '../../core/language/spanish';
import type { LipSequence, Phrase } from '../../core/types';
import { captureSequence, CaptureError, type Capture } from '../../core/vision/recorder';
import { speakPhrase, speakText } from '../../core/voice/speaker';
import { createStage } from '../components/camera-stage';
import { bindPalette, paletteHTML } from '../components/theme';
import { toast } from '../components/toast';
import { $, esc, on, vibrate } from '../dom';
import { icon } from '../icons';

const RING = 2 * Math.PI * 54;
/** Hasta cuántas veces la variación normal entre ejemplos se acepta como «la dijiste» (otra persona o cámara se parece menos). */
const VERIFY_LIMIT = 2.8;
/** Cuando ya hay ejemplos de esta persona se exige más. */
const VERIFY_LIMIT_PERSONAL = 2.2;
/** Con esta cercanía la lectura es tan segura que se aprende de ella. */
const LEARN_RATIO = 1.7;
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
          <div class="u-screen" data-screen>
            <div class="u-paper" data-paper aria-live="polite"></div>
            <div class="u-status" data-status></div>
            <div class="u-tools" data-tools hidden>
              <button class="u-pill" type="button" data-speak-all>${icon('volume', 18)}<span>Decir todo</span></button>
              <button class="u-pill u-pill--ghost" type="button" data-clear>${icon('rotate-ccw', 18)}<span>Borrar</span></button>
            </div>
          </div>
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
  const screen = $('[data-status]', root);
  const paper = $('[data-paper]', root);
  const tools = $('[data-tools]', root);
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

  /* Texto que se va escribiendo: cada toma es una frase; las palabras poco seguras quedan por confirmar con «?». */
  interface SWord {
    id: string;
    text: string;
    pending: boolean;
    alts: string[];
    seq: LipSequence | null;
  }
  const sentences: SWord[][] = [];
  const tokensOf = (sent: SWord[]) => composeSentence(sent.map((w) => w.text));

  const renderPaper = (popSentence = -1) => {
    tools.hidden = sentences.length === 0;
    paper.classList.toggle('has-words', sentences.length > 0);
    paper.innerHTML = sentences.length
      ? `<p class="u-text">${sentences
          .map((sent, si) => {
            const tokens = tokensOf(sent);
            return `<span class="u-sent">${sent
              .map(
                (w, wi) =>
                  `<button type="button" class="u-w${si === popSentence ? ' is-pop' : ''}" data-w="${si}:${wi}" style="--i:${wi}" aria-label="${esc(w.text)}. Toca para quitar esta palabra">${esc(tokens[wi])}<i class="u-x" aria-hidden="true">×</i></button>`,
              )
              .join(' ')}</span>`;
          })
          .join(' ')}<i class="u-caret" aria-hidden="true"></i></p>`
      : `<p class="u-placeholder">Aquí se escribe lo que digas<i class="u-caret" aria-hidden="true"></i></p>`;
    paper.scrollTop = paper.scrollHeight;
  };

  /** Dice una frase: solo las palabras confirmadas. */
  const speakSentence = async (sent: SWord[]) => {
    const ok = sent.filter((w) => !w.pending);
    if (!ok.length) return;
    vibrate(18);
    for (const w of ok) pushHistory(w.id);
    engine.recordSentence(ok.map((w) => w.id));
    if (ok.length === 1) {
      const p = engine.phrase(ok[0].id);
      if (p) return void (await speakPhrase(p, state.settings));
    }
    await speakText(spokenText(composeSentence(ok.map((w) => w.text))), state.settings);
  };

  const renderEmpty = () =>
    setScreen('empty', `<p class="u-st u-st--mute"><span class="u-dots" aria-hidden="true"><i></i><i></i><i></i></span> Aún no hay palabras listas. Aparecen aquí solas cuando se agreguen.</p>`);

  const renderIdle = () => {
    if (!trained().length) return renderEmpty();
    setScreen('idle', `<p class="u-st u-st--mute">${trained().length > 1 ? 'Toca el botón y di una frase moviendo los labios: «sí me duele», por ejemplo.' : 'Toca el botón y di una palabra moviendo los labios.'}</p>`);
  };

  const renderListening = () =>
    setScreen(
      'listening',
      `<div class="u-listen"><div class="u-eq" aria-hidden="true">${'<i></i>'.repeat(BARS)}</div><p class="u-st">Te estoy viendo…</p></div>`,
    );

  const renderSaid = (sent: SWord[], note: string) => {
    sentences.push(sent);
    renderPaper(sentences.length - 1);
    setScreen(
      'said',
      `<p class="u-st u-st--ok"><span class="u-check" aria-hidden="true">${icon('check', 16, 3)}</span>${esc(note)}<small class="u-tip">Toca una palabra para quitarla.</small></p>`,
    );
  };

  const renderMiss = (title: string, detail: string, guess?: Phrase | null) => {
    setScreen(
      'miss',
      `<div class="u-miss2"><p class="u-st u-st--miss"><b>${esc(title)}.</b> ${esc(detail)}</p>${
        guess
          ? `<button class="u-pill u-pill--ghost" type="button" data-confirm="${guess.id}">${icon('check', 16, 2.6)}<span>Sí dije «${esc(guess.text)}»</span></button>`
          : ''
      }</div>`,
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
    if (!capture) label.textContent = n > 1 ? 'Toca y di una frase' : n ? 'Toca y di una palabra' : 'Esperando la primera palabra';
    if (mode === 'empty' || mode === 'idle') renderIdle();
    else if (!n) renderEmpty();
  };

  /* ---------- Leer los labios ---------- */

  const setCapturing = (live: boolean) => {
    btn.classList.toggle('is-live', live);
    stage.setRecording(live);
    el.classList.toggle('is-listening', live);
    label.textContent = live ? 'Leyendo tus labios…' : trained().length > 1 ? 'Toca y di una frase' : 'Toca y di una palabra';
    hint.textContent = live ? 'Toca otra vez para terminar.' : trained().length > 1 ? 'Sin voz. Puedes juntar varias palabras, con o sin pausas.' : 'Sin voz, solo mueve los labios. Se detiene sola.';
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

  const hideOptions = () => {
    options.hidden = true;
    options.innerHTML = '';
  };

  const sword = (p: Phrase, pending: boolean, alts: string[] = [], seq: LipSequence | null = null): SWord => ({ id: p.id, text: p.text, pending, alts, seq });

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
    const multi = trained().length > 1;
    // Con varias palabras se da más tiempo y se espera más silencio para terminar.
    const maxMs = multi ? Math.max(state.settings.maxCaptureMs, 8000) : state.settings.maxCaptureMs;
    capture = captureSequence({
      maxMs,
      quietMs: multi ? 1200 : undefined,
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
      if (!engine.hasSpeech(seq)) {
        renderMiss('No vi que movieras los labios', 'Dilo moviendo bien la boca, de frente a la cámara.');
        return;
      }
      if (list.length === 1) {
        // Una sola palabra: se acepta solo si se parece de verdad a sus ejemplos.
        const v = await engine.verify(seq);
        const limit = v && v.personal >= 3 ? VERIFY_LIMIT_PERSONAL : VERIFY_LIMIT;
        if (!v || v.ratio > limit) {
          renderMiss('No te entendí', 'Repítelo con calma, de frente y con buena luz. No escribo nada si no estoy seguro.', v?.phrase);
          return;
        }
        const match = Math.max(0.6, Math.min(1, 1 - ((v.ratio - 1) / (limit - 1)) * 0.4));
        const sent = [sword(v.phrase, false)];
        renderSaid(sent, `Se parece ${Math.round(match * 100)}%`);
        void speakSentence(sent);
        if (v.ratio <= LEARN_RATIO && state.settings.learnFromUse) void engine.addSample(v.phrase.id, seq, 'correccion');
        return;
      }

      // Varias palabras: se separa la toma en palabras y se arma la frase completa.
      setScreen('listening', `<p class="u-st"><span class="u-dots" aria-hidden="true"><i></i><i></i><i></i></span> Armando tu frase…</p>`);
      const all = (await engine.decode(seq)).filter((w) => engine.phrase(w.phraseId));
      // Solo se escribe lo seguro; lo dudoso se pregunta, nunca se escribe por adivinar.
      const words = all.filter((w) => w.confident);
      if (!words.length) {
        const guess = all.length === 1 ? engine.phrase(all[0].phraseId) : null;
        renderMiss(guess ? 'No estoy seguro' : 'No te entendí', 'Repítelo con calma, de frente y con buena luz. No escribo nada si no estoy seguro.', guess);
        return;
      }
      const sent = words.map((w) => sword(engine.phrase(w.phraseId)!, false, [], w.seq));
      const doubtful = all.length - words.length;
      renderSaid(sent, `${sent.length === 1 ? 'Palabra lista' : `Frase lista · ${sent.length} palabras`}${doubtful ? ` · ${doubtful} dudosa${doubtful > 1 ? 's' : ''} sin escribir` : ''}`);
      void speakSentence(sent);
      // Lo que se leyó con mucha seguridad enseña a la app cómo hablas tú.
      if (state.settings.learnFromUse) {
        const sure = new Map<string, LipSequence[]>();
        words.forEach((w, i) => {
          if (w.ratio <= LEARN_RATIO) (sure.get(sent[i].id) ?? sure.set(sent[i].id, []).get(sent[i].id)!).push(w.seq);
        });
        for (const [id, seqs] of sure) void engine.addSamples(id, seqs, 'correccion');
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
      if (p) void speakSentence([sword(p, false)]);
    }),
    on(root, 'click', '[data-confirm]', async (_, b) => {
      const p = engine.phrase(b.dataset.confirm!);
      if (!p) return;
      const seq = lastSeq;
      const sent = [sword(p, false, [], seq)];
      renderSaid(sent, 'Aprendido, gracias');
      void speakSentence(sent);
      if (seq) {
        lastSeq = null;
        await engine.addSample(p.id, seq, 'correccion');
      }
    }),
    on(root, 'click', '[data-w]', (_, b) => {
      const [si, wi] = b.dataset.w!.split(':').map(Number);
      const sent = sentences[si];
      const removed = sent?.[wi];
      if (!sent || !removed) return;
      sent.splice(wi, 1);
      const emptied = sent.length === 0;
      if (emptied) sentences.splice(si, 1);
      renderPaper();
      vibrate(10);
      toast(`Quitaste «${removed.text}»`, {
        tone: 'info',
        action: {
          label: 'Deshacer',
          run: () => {
            if (emptied) sentences.splice(si, 0, [removed]);
            else sent.splice(wi, 0, removed);
            renderPaper();
          },
        },
      });
    }),
    on(root, 'click', '[data-clear]', () => {
      sentences.length = 0;
      renderPaper();
      renderIdle();
    }),
    on(root, 'click', '[data-speak-all]', async () => {
      for (const sent of sentences) await speakSentence(sent);
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
  renderPaper();
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
