import { state } from '../../app/state';
import { engine, MAX_SAMPLES_PER_PHRASE, READY_SAMPLES as TARGET } from '../../core/engine';
import type { Category, Phrase } from '../../core/types';
import { captureSequence, CaptureError, type Capture } from '../../core/vision/recorder';
import { recordAudio, speakPhrase, speakText, type AudioRecording } from '../../core/voice/speaker';
import { CATEGORY_LABEL, ICON_CHOICES } from '../../data/default-phrases';
import { createStage, type FaceState } from '../components/camera-stage';
import { openVideoImporter } from '../components/video-importer-modal';
import { toast } from '../components/toast';
import { $, esc, on, reducedMotion, sleep, vibrate } from '../dom';
import { icon } from '../icons';

const TAKE_MS = 5000;

export function entrenarView(root: HTMLElement) {
  const render = () => {
    const total = engine.phrases.length;
    const done = engine.phrases.filter((p) => engine.sampleCount(p.id) >= TARGET).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    root.innerHTML = `
      <section class="view train">
        <header class="view-head">
          <div>
            <p class="kicker">[ Entrenar ]</p>
            <h1>Enséñale cómo<br><span class="hl">dice cada frase.</span></h1>
          </div>
        </header>

        <div class="train__summary" data-tilt="4">
          <div class="progress-orb" style="--p:${pct}">
            <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="track"/><circle cx="40" cy="40" r="34" class="bar" pathLength="100"/></svg>
            <span>${done}<small>/${total}</small></span>
          </div>
          <div>
            <h2>${done === 0 ? 'Empieza con Sí, No y una frase más' : done === total ? 'Todas las frases están listas' : 'Va muy bien'}</h2>
            <p>Cada frase necesita ${TARGET} ejemplos de 5 segundos <b>de la persona que la va a usar</b>. Sostén el teléfono frente a su cara y que hable sin voz.</p>
          </div>
          <div class="row">
            <button class="btn btn--primary" type="button" data-new>${icon('plus', 18)}<span>Nueva frase</span></button>
            <button class="btn btn--soft" type="button" data-import-video>${icon('upload', 18)}<span>Cargar video</span></button>
          </div>
        </div>

        <ul class="plist" role="list">
          ${engine.phrases
            .map((p) => {
              const n = engine.sampleCount(p.id);
              const status = n >= TARGET ? 'ok' : n > 0 ? 'mid' : 'none';
              return `<li class="pcard pcard--${status}">
                <span class="sphere sphere--sm sphere--${p.category}">${icon(p.icon, 20)}</span>
                <div class="pcard__body">
                  <p class="pcard__text">${esc(p.text)}</p>
                  <p class="pcard__meta">
                    <span class="dots" aria-label="${n} de ${TARGET} ejemplos">${Array.from({ length: Math.max(TARGET, Math.min(n, 5)) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>
                    ${n >= TARGET ? 'Lista' : n > 0 ? `Faltan ${TARGET - n}` : 'Sin entrenar'}
                    ${p.audioId ? `<span class="tag">${icon('mic', 12)} Voz grabada</span>` : ''}
                  </p>
                </div>
                <div class="pcard__actions">
                  <button class="icon-btn" type="button" data-edit="${p.id}" aria-label="Editar ${esc(p.text)}">${icon('pencil', 18)}</button>
                  <button class="icon-btn" type="button" data-del="${p.id}" aria-label="Borrar ${esc(p.text)}">${icon('trash', 18)}</button>
                  <button class="btn ${n >= TARGET ? 'btn--soft' : 'btn--primary'} btn--sm" type="button" data-train="${p.id}">${icon(n >= TARGET ? 'plus' : 'sparkles', 16)}<span>${n >= TARGET ? 'Mejorar' : 'Entrenar'}</span></button>
                </div>
              </li>`;
            })
            .join('')}
        </ul>
      </section>`;
  };

  const offs = [
    on(root, 'click', '[data-train]', (_, el) => {
      const p = engine.phrase(el.dataset.train!);
      if (p) openTrainer(p);
    }),
    on(root, 'click', '[data-new]', () => openEditor()),
    on(root, 'click', '[data-import-video]', () => openVideoImporter()),
    on(root, 'click', '[data-edit]', (_, el) => openEditor(engine.phrase(el.dataset.edit!))),
    on(root, 'click', '[data-del]', async (_, el) => {
      const snap = await engine.deletePhrase(el.dataset.del!);
      if (snap) toast(`Borraste «${snap.phrase.text}».`, { action: { label: 'Deshacer', run: () => void engine.restore(snap) } });
    }),
    engine.onChange(render),
  ];
  render();
  return () => offs.forEach((off) => off());
}

/* ---------- Guía de entrenamiento ---------- */

function openTrainer(phrase: Phrase) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-label', `Entrenar «${phrase.text}»`);
  dlg.innerHTML = `
    <div class="sheet__inner">
      <header class="sheet__head">
        <span class="sphere sphere--sm sphere--${phrase.category}">${icon(phrase.icon, 20)}</span>
        <div><p class="kicker">[ Entrenando ]</p><h2>${esc(phrase.text)}</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>
      <ol class="stepper" data-stepper>
        <li data-s="1"><span>1</span>Colócate</li>
        <li data-s="2"><span>2</span>Graba ${TARGET} veces</li>
        <li data-s="3"><span>3</span>Su voz</li>
      </ol>
      <div class="sheet__body">
        <div class="sheet__stage" data-stage><div class="countdown" data-count hidden></div></div>
        <div class="sheet__panel" data-panel></div>
      </div>
    </div>`;
  document.body.append(dlg);

  let face: FaceState = 'sin-camara';
  let step = 1;
  let capture: Capture | null = null;
  let rec: AudioRecording | null = null;
  let closed = false;
  const stage = createStage((s) => {
    face = s;
    if (step === 1) renderStep();
  });
  $('[data-stage]', dlg).prepend(stage.el);
  const panel = $('[data-panel]', dlg);
  const countEl = $('[data-count]', dlg);

  const setStep = (s: number) => {
    step = s;
    dlg.querySelectorAll<HTMLElement>('[data-s]').forEach((li) => {
      const n = Number(li.dataset.s);
      li.classList.toggle('is-current', n === s);
      li.classList.toggle('is-done', n < s);
    });
    dlg.querySelector('.sheet__body')!.classList.toggle('is-voice', s === 3);
    renderStep();
  };

  const renderStep = () => {
    const n = engine.sampleCount(phrase.id);
    if (step === 1) {
      // En computadora la cara suele verse chica: «lejos» también sirve, los rasgos no dependen del tamaño.
      const ok = face === 'listo' || face === 'lejos';
      panel.innerHTML = `
        <h3>Que mire de frente a la cámara</h3>
        <ul class="checks">
          <li class="${face !== 'sin-camara' ? 'ok' : ''}">${icon(face !== 'sin-camara' ? 'check' : 'camera', 16)} Cámara encendida</li>
          <li class="${face === 'listo' || face === 'lejos' ? 'ok' : ''}">${icon(face === 'listo' || face === 'lejos' ? 'check' : 'scan-face', 16)} Tu cara a la vista</li>
          <li class="${face === 'listo' ? 'ok' : ''}">${icon(face === 'listo' ? 'check' : 'eye', 16)} ${face === 'lejos' ? 'Un poco más cerca sería mejor' : 'A buena distancia, con luz de frente'}</li>
        </ul>
        <button class="btn btn--primary btn--lg" type="button" data-next ${ok ? '' : 'disabled'}>${icon('arrow-right', 18)}<span>${ok ? 'Listo, empezar' : 'Esperando su cara…'}</span></button>`;
    } else if (step === 2) {
      const enough = n >= TARGET;
      panel.innerHTML = `
        <p class="kicker">Ejemplo ${Math.min(n + 1, MAX_SAMPLES_PER_PHRASE)}${enough ? '' : ` de ${TARGET}`}</p>
        <h3>Di sin voz:</h3>
        <p class="say-this">«${esc(phrase.text)}»</p>
        <p class="muted">Habla a tu ritmo normal, moviendo bien los labios. Cuenta 3, 2, 1 y graba hasta 5 segundos.</p>
        <div class="dots dots--lg" aria-label="${n} ejemplos">${Array.from({ length: Math.max(TARGET, Math.min(n, 5)) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>
        <div class="take-bar" aria-hidden="true"><i data-take></i></div>
        <div class="row">
          <button class="btn ${enough ? 'btn--soft' : 'btn--primary'} btn--lg" type="button" data-rec>${icon('scan-face', 18)}<span>${enough ? 'Grabar otro ejemplo' : 'Grabar ejemplo'}</span></button>
          ${enough ? `<button class="btn btn--primary btn--lg" type="button" data-next>${icon('arrow-right', 18)}<span>Siguiente</span></button>` : ''}
        </div>
        ${n ? `<button class="link-btn" type="button" data-reset>${icon('rotate-ccw', 14)} Borrar ejemplos y empezar de nuevo</button>` : ''}`;
    } else {
      const has = !!engine.phrase(phrase.id)?.audioId;
      panel.innerHTML = `
        <h3>¿Con qué voz la digo?</h3>
        <p class="muted">Puede usar la voz del dispositivo, la voz de alguien de su familia o una grabación suya de antes.</p>
        <div class="voice-opts">
          <button class="voice-opt" type="button" data-test-sys data-tilt="6">${icon('volume', 22)}<span><b>Voz del dispositivo</b><small>Escuchar ejemplo</small></span></button>
          <button class="voice-opt ${rec ? 'is-rec' : ''}" type="button" data-mic data-tilt="6">${icon(rec ? 'square' : 'mic', 22)}<span><b>${rec ? 'Detener grabación' : has ? 'Volver a grabar' : 'Grabar una voz'}</b><small>${rec ? 'Grabando…' : has ? 'Ya hay una voz grabada' : 'Unos segundos bastan'}</small></span></button>
        </div>
        ${has ? `<div class="row"><button class="btn btn--soft" type="button" data-play>${icon('play', 18)}<span>Escuchar grabación</span></button><button class="btn btn--ghost" type="button" data-rm-audio>${icon('trash', 18)}<span>Quitar</span></button></div>` : ''}
        <button class="btn btn--primary btn--lg" type="button" data-finish>${icon('check', 18)}<span>Terminar</span></button>`;
    }
  };

  const countdown = async () => {
    countEl.hidden = false;
    for (const n of [3, 2, 1]) {
      if (closed) return false;
      countEl.textContent = String(n);
      countEl.classList.remove('tick');
      void countEl.offsetWidth;
      countEl.classList.add('tick');
      vibrate(8);
      await sleep(reducedMotion() ? 500 : 700);
    }
    countEl.hidden = true;
    return !closed;
  };

  const recordTake = async () => {
    if (capture) return capture.stop();
    if (face === 'buscando' || face === 'sin-camara') {
      toast('No veo su cara. Que se centre frente a la cámara.', { tone: 'warn' });
      return;
    }
    const btn = panel.querySelector<HTMLButtonElement>('[data-rec]');
    if (btn) btn.disabled = true;
    if (!(await countdown())) return;
    const bar = panel.querySelector<HTMLElement>('[data-take]');
    if (btn) {
      btn.disabled = false;
      btn.querySelector('span')!.textContent = 'Terminar toma';
    }
    stage.setRecording(true);
    capture = captureSequence({
      maxMs: TAKE_MS,
      autoStop: true,
      onProgress: (t) => bar && (bar.style.transform = `scaleX(${Math.min(1, t / TAKE_MS)})`),
    });
    try {
      const seq = await capture.result;
      await engine.addSample(phrase.id, seq);
      vibrate([10, 40, 10]);
      const n = engine.sampleCount(phrase.id);
      toast(n === TARGET ? '¡Frase lista! Ya la puedo reconocer.' : `Ejemplo ${n} guardado.`, { tone: 'ok' });
    } catch (err) {
      if (err instanceof CaptureError && err.code === 'sin-rostro') toast('Se perdió tu boca de vista. Repite el ejemplo.', { tone: 'warn' });
    } finally {
      capture = null;
      stage.setRecording(false);
      if (!closed) renderStep();
    }
  };

  const toggleMic = async () => {
    if (rec) {
      const blob = await rec.stop();
      rec = null;
      await engine.setAudio(phrase.id, blob);
      toast('Voz guardada para esta frase.', { tone: 'ok' });
      renderStep();
      return;
    }
    try {
      stage.stop();
      rec = await recordAudio();
      renderStep();
    } catch {
      toast('No pude usar el micrófono. Revisa el permiso.', { tone: 'warn' });
    }
  };

  const close = () => {
    closed = true;
    capture?.cancel();
    rec?.cancel();
    stage.destroy();
    dlg.close();
    dlg.remove();
  };

  on(dlg, 'click', '[data-close]', close);
  on(dlg, 'click', '[data-next]', () => setStep(step + 1));
  on(dlg, 'click', '[data-rec]', () => void recordTake());
  on(dlg, 'click', '[data-reset]', async () => {
    await engine.clearSamples(phrase.id);
    renderStep();
  });
  on(dlg, 'click', '[data-test-sys]', () => void speakText(phrase.text, state.settings));
  on(dlg, 'click', '[data-mic]', () => void toggleMic());
  on(dlg, 'click', '[data-play]', () => {
    const p = engine.phrase(phrase.id);
    if (p) void speakPhrase(p, state.settings);
  });
  on(dlg, 'click', '[data-rm-audio]', async () => {
    await engine.setAudio(phrase.id, null);
    renderStep();
  });
  on(dlg, 'click', '[data-finish]', () => {
    close();
    toast(`«${phrase.text}» quedó lista.`, { tone: 'ok' });
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  dlg.showModal();
  setStep(engine.sampleCount(phrase.id) >= TARGET ? 2 : 1);
  void stage.start();
}

/* ---------- Editor de frases ---------- */

function openEditor(phrase?: Phrase) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  let chosenIcon = phrase?.icon ?? 'message-circle';
  let chosenCat: Category = phrase?.category ?? 'necesidad';
  dlg.innerHTML = `
    <form method="dialog" class="modal__inner" novalidate>
      <header class="sheet__head">
        <div><p class="kicker">${phrase ? 'Editar frase' : 'Nueva frase'}</p><h2>${phrase ? esc(phrase.text) : '¿Qué quieres poder decir?'}</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>
      <label class="field">
        <span class="field__label">Frase</span>
        <input class="input" name="text" maxlength="60" required value="${esc(phrase?.text ?? '')}" placeholder="Por ejemplo: Quiero ver a mi hija" aria-describedby="text-err">
        <span class="field__error" id="text-err" hidden>Escribe la frase (máximo 60 letras).</span>
      </label>
      <fieldset class="field">
        <legend class="field__label">Grupo</legend>
        <div class="seg">${(Object.keys(CATEGORY_LABEL) as Category[])
          .map((c) => `<button type="button" class="seg__opt" data-cat="${c}" aria-pressed="${c === chosenCat}">${CATEGORY_LABEL[c]}</button>`)
          .join('')}</div>
      </fieldset>
      <fieldset class="field">
        <legend class="field__label">Ícono</legend>
        <div class="icon-grid">${ICON_CHOICES.map((n) => `<button type="button" class="icon-pick" data-icon="${n}" aria-pressed="${n === chosenIcon}" aria-label="${n}">${icon(n, 20)}</button>`).join('')}</div>
      </fieldset>
      <div class="row row--end">
        <button class="btn btn--ghost" type="button" data-close>Cancelar</button>
        <button class="btn btn--primary" type="submit">${icon('check', 18)}<span>${phrase ? 'Guardar cambios' : 'Crear frase'}</span></button>
      </div>
    </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form')!;
  const input = form.querySelector<HTMLInputElement>('input[name=text]')!;
  const err = form.querySelector<HTMLElement>('#text-err')!;
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  const validate = () => {
    const ok = input.value.trim().length > 0;
    err.hidden = ok;
    input.setAttribute('aria-invalid', String(!ok));
    return ok;
  };
  input.addEventListener('blur', validate);
  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === dlg || t.closest('[data-close]')) return close();
    const cat = t.closest<HTMLElement>('[data-cat]');
    if (cat) {
      chosenCat = cat.dataset.cat as Category;
      form.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === cat)));
    }
    const ic = t.closest<HTMLElement>('[data-icon]');
    if (ic) {
      chosenIcon = ic.dataset.icon!;
      form.querySelectorAll('[data-icon]').forEach((b) => b.setAttribute('aria-pressed', String(b === ic)));
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return input.focus();
    const saved = await engine.savePhrase({ ...(phrase ?? {}), text: input.value.trim(), icon: chosenIcon, category: chosenCat });
    close();
    if (!phrase) {
      toast('Frase creada. Ahora enséñame cómo la dices.', { action: { label: 'Entrenar', run: () => openTrainer(saved) } });
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  input.focus();
}
