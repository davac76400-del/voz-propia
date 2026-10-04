import { go, type Route } from '../../app/router';
import { state, updateSettings } from '../../app/state';
import { engine, MAX_SAMPLES_PER_PHRASE, READY_SAMPLES } from '../../core/engine';
import { esc, on } from '../dom';
import { icon } from '../icons';

const MIN_READY = 5;

/** Panel del programador: qué tan lista está la app antes de entregarla al usuario. */
export function panelView(root: HTMLElement) {
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
    engine.onChange(render),
  ];
  render();
  return () => offs.forEach((off) => off());
}
