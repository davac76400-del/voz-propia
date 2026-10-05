import { go, type Route } from '../../app/router';
import { state, updateSettings } from '../../app/state';
import { engine, MAX_SAMPLES_PER_PHRASE, READY_SAMPLES } from '../../core/engine';
import { topTransitions } from '../../core/language/learned';
import { readHistory } from '../../core/learn/progress';
import { esc, on } from '../dom';
import { icon } from '../icons';

const MIN_READY = 5;

/** Panel del programador: qué tan lista está la app antes de entregarla al usuario. */
export function panelView(root: HTMLElement) {

  const trainCard = () => {
    const t = engine.lastTraining;
    const hist = readHistory().filter((h) => h.accuracy !== null);
    const pts = hist.slice(-20);
    const spark =
      pts.length >= 2
        ? `<svg class="train__spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Aciertos en las últimas mediciones"><polyline points="${pts
            .map((h, i) => `${((i / (pts.length - 1)) * 100).toFixed(1)},${(30 - (h.accuracy as number) * 28).toFixed(1)}`)
            .join(' ')}"/></svg>`
        : '';
    const pct = t?.accuracy != null ? Math.round(t.accuracy * 100) : null;
    const prev = hist.length >= 2 ? hist[hist.length - 2].accuracy : null;
    const diff = pct !== null && prev != null ? pct - Math.round(prev * 100) : null;
    const health = t?.health ?? [];
    const tiers = { lista: 0, mejorando: 0, nueva: 0 };
    for (const h of health) tiers[h.tier]++;
    const todo = health
      .filter((h) => h.tier !== 'lista')
      .slice(0, 5)
      .map((h) => {
        const hints: string[] = [];
        if (h.samples < READY_SAMPLES) hints.push(`le faltan ${READY_SAMPLES - h.samples} ejemplo${READY_SAMPLES - h.samples > 1 ? 's' : ''}`);
        if (h.accuracy !== null && h.accuracy < 0.9 && h.confusedWith.length) hints.push(`se confunde con ${h.confusedWith.map((c) => `«${esc(c)}»`).join(' y ')}`);
        if (h.doubtful) hints.push(`${h.doubtful} ejemplo${h.doubtful > 1 ? 's' : ''} dudoso${h.doubtful > 1 ? 's' : ''} apartado${h.doubtful > 1 ? 's' : ''}`);
        return `<li><b>${esc(h.text)}</b><span class="train__pct">${h.accuracy === null ? 'sin medir' : `${Math.round(h.accuracy * 100)} %`}</span><small>${hints.join(' · ') || 'sigue sumando ejemplos'}</small></li>`;
      })
      .join('');
    const pairs = topTransitions(6)
      .map((x) => `<span class="train__pair">${esc(x.from ?? '')} <i>→</i> ${esc(x.to)}${x.count > 1 ? ` <small>×${x.count}</small>` : ''}</span>`)
      .join('');
    return `<article class="card train">
      <div class="dash__top">
        <p class="dash__title">Entrenamiento</p>
        <span class="dash__live ${engine.training ? '' : 'is-idle'}"><i></i>${engine.training ? 'Midiendo…' : 'Al subir palabras, se mide solo'}</span>
      </div>
      <div class="train__head">
        <p class="train__big">${pct === null ? '–' : `${pct}<small>%</small>`}</p>
        <p class="train__lead">${
          pct === null
            ? 'Aún no hay con qué medir. Sube al menos 2 palabras con 2 ejemplos cada una.'
            : `de aciertos probando cada ejemplo contra los demás${diff ? ` (${diff > 0 ? '+' : ''}${diff} desde la medición anterior)` : ''}.`
        }</p>
        ${spark}
      </div>
      <div class="train__tiers">
        <span class="train__tier train__tier--lista"><b>${tiers.lista}</b> listas</span>
        <span class="train__tier train__tier--mejorando"><b>${tiers.mejorando}</b> mejorando</span>
        <span class="train__tier train__tier--nueva"><b>${tiers.nueva}</b> nuevas</span>
      </div>
      ${todo ? `<p class="dash__title train__sub">Para mejorar</p><ul class="train__list">${todo}</ul>` : ''}
      ${pairs ? `<p class="dash__title train__sub">Palabras que aprendió que van juntas</p><div class="train__pairs">${pairs}</div>` : ''}
      <div class="row">
        <button class="btn btn--primary btn--sm" type="button" data-train ${engine.training ? 'disabled' : ''}>${icon('sparkles', 16)}<span>${engine.training ? 'Entrenando…' : 'Entrenar ahora'}</span></button>
        <button class="btn btn--soft btn--sm" type="button" data-precision>${icon('gauge', 16)}<span>Ver detalle</span></button>
      </div>
    </article>`;
  };

  const render = () => {
    const phrases = engine.phrases;
    const total = phrases.length;
    const counts = phrases.map((p) => engine.sampleCount(p.id));
    const ready = counts.filter((n) => n >= READY_SAMPLES).length;
    const started = counts.filter((n) => n > 0).length;
    const voiced = phrases.filter((p) => p.audioId).length;
    const learned = engine.samples.filter((s) => s.source === 'correccion').length;
    const isReady = (text: string) => {
      const p = phrases.find((x) => x.category === 'respuesta' && x.text.toLowerCase() === text);
      return !!p && engine.sampleCount(p.id) >= READY_SAMPLES;
    };
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
    const checks = [
      { ok: isReady('sí') && isReady('no'), text: 'Sí y No entrenadas' },
      { ok: ready >= MIN_READY, text: `Al menos ${MIN_READY} frases listas (${Math.min(ready, MIN_READY)} de ${MIN_READY})` },
      { ok: !!state.settings.voiceURI || voiced > 0, text: 'Voz elegida o grabada' },
      { ok: engine.samples.length >= READY_SAMPLES * 2, text: 'Ejemplos de la persona que la usará' },
    ];
    const allOk = checks.every((c) => c.ok);
    const rows: [string, number, number][] = [
      ['Listas para usar', ready, total],
      ['Con algún ejemplo', started, total],
      ['Con voz grabada', voiced, total],
    ];

    root.innerHTML = `
      <section class="view dashboard">
        <header class="view-head">
          <div>
            <p class="kicker">[ Panel de control ]</p>
            <h1>Prepara su voz.<br><span class="hl">Entrégala lista.</span></h1>
          </div>
          <div class="row">
            <button class="btn btn--primary" type="button" data-go="entrenar">${icon('sparkles', 18)}<span>Entrenar frases</span></button>
            <button class="btn btn--soft" type="button" data-as-user>${icon('eye', 18)}<span>Ver como usuario</span></button>
          </div>
        </header>

        <div class="stat-row">
          <div class="stat"><p class="stat__value">${ready}<small>/${total}</small></p><p class="stat__label">Frases listas</p></div>
          <div class="stat"><p class="stat__value">${engine.samples.length}</p><p class="stat__label">Ejemplos guardados</p></div>
          <div class="stat"><p class="stat__value">${learned}</p><p class="stat__label">Aprendidos del uso</p></div>
          <div class="stat"><p class="stat__value">${Math.round(state.settings.autoSpeakThreshold * 100)}<small>%</small></p><p class="stat__label">Confianza para hablar solo</p></div>
        </div>

        <div class="dash-grid">
          <article class="dash">
            <div class="dash__top">
              <p class="dash__title">Ejemplos por frase</p>
              <span class="dash__live"><i></i>En este dispositivo</span>
            </div>
            <div class="dash__bars" role="list" aria-label="Ejemplos por frase">
              ${phrases
                .map((p, i) => {
                  const n = engine.sampleCount(p.id);
                  const st = n >= READY_SAMPLES ? 'ok' : n > 0 ? 'mid' : 'none';
                  return `<div class="dash__bar dash__bar--${p.category}" role="listitem" data-state="${st}" style="--h:${Math.max(0.04, n / MAX_SAMPLES_PER_PHRASE).toFixed(3)};--i:${i}" title="${esc(p.text)}: ${n} de ${MAX_SAMPLES_PER_PHRASE}" aria-label="${esc(p.text)}: ${n} ejemplos">
                    <i></i><span>${icon(p.icon, 14)}</span>
                  </div>`;
                })
                .join('')}
            </div>
            <div class="dash__rows">
              ${rows
                .map(
                  ([label, n, d]) => `<div class="dash__row"><span>${label}</span><div class="dash__track"><i style="--w:${pct(n, d)}%"></i></div><b>${pct(n, d)}%</b></div>`,
                )
                .join('')}
            </div>
          </article>

          <article class="card handoff ${allOk ? 'is-ok' : ''}">
            <p class="dash__title">Antes de entregarla</p>
            <ul class="checks">
              ${checks.map((c) => `<li class="${c.ok ? 'ok' : ''}">${icon(c.ok ? 'check' : 'square', 16)} ${c.text}</li>`).join('')}
            </ul>
            <p class="muted">${allOk ? 'Todo listo. En modo usuario solo verá Hablar y el Tablero.' : 'Puedes entregarla antes: el tablero funciona desde el primer día.'}</p>
            <button class="btn ${allOk ? 'btn--primary' : 'btn--soft'}" type="button" data-as-user>${icon('hand-heart', 18)}<span>Entregar en modo usuario</span></button>
          </article>
        </div>

        ${trainCard()}

        <div class="quick-grid">
          ${(
            [
              ['hablar', 'scan-face', 'Probar lectura', 'Mira su boca en vivo y revisa la seguridad de cada lectura.'],
              ['tablero', 'layout-grid', 'Tablero', 'Respuestas rápidas que funcionan sin cámara.'],
              ['ajustes', 'volume', 'Voz y lectura', 'Elige la voz, la velocidad y cuándo pedir confirmación.'],
              ['ajustes', 'shield-check', 'Respaldo', 'Guarda o carga las frases y ejemplos en un archivo.'],
            ] as [Route, string, string, string][]
          )
            .map(
              ([r, ic, t, d]) => `<button class="quick" type="button" data-go="${r}" data-tilt="6">
                <span class="quick__icon">${icon(ic, 22)}</span>
                <span class="quick__text"><b>${t}</b><small>${d}</small></span>
                ${icon('arrow-up-right', 18)}
              </button>`,
            )
            .join('')}
        </div>
      </section>`;
  };

  const offs = [
    on(root, 'click', '[data-go]', (_, el) => go(el.dataset.go as Route)),
    on(root, 'click', '[data-as-user]', async () => {
      await updateSettings({ role: 'usuario' });
      go('hablar');
    }),
    on(root, 'click', '[data-train]', () => void engine.trainNow(undefined, false)),
    on(root, 'click', '[data-precision]', async () => (await import('../components/dev-eval')).openPrecision()),
    engine.onChange(render),
  ];
  render();
  return () => offs.forEach((off) => off());
}
