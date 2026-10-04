import { engine } from '../../core/engine';
import { esc } from '../dom';
import { icon } from '../icons';

/** Mide qué tan bien reconoce la app con los ejemplos que ya tiene y muestra qué frases se confunden. */
export async function openPrecision() {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet';
  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div><p class="kicker">[ Precisión ]</p><h2>¿Qué tan bien lee?</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>
      <div id="ev-body"><div class="dev-progress"><progress id="ev-bar" max="100"></progress><p id="ev-status">Midiendo…</p></div></div>
    </div>`;
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.querySelector('[data-close]')!.addEventListener('click', close);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();

  const body = dlg.querySelector<HTMLElement>('#ev-body')!;
  const bar = dlg.querySelector<HTMLProgressElement>('#ev-bar')!;
  const status = dlg.querySelector<HTMLElement>('#ev-status')!;

  const r = await engine.evaluate((done, total) => {
    bar.value = Math.round((done / total) * 100);
    status.textContent = `Midiendo… ${bar.value}%`;
  });

  if (!r.total) {
    body.innerHTML = `<p class="dev-note">${icon('info', 16)}<span>Todavía no hay suficientes ejemplos para medir. Hacen falta al menos 2 frases con 2 ejemplos cada una.</span></p>`;
    return;
  }

  const pct = Math.round((r.correct / r.total) * 100);
  const tone = pct >= 90 ? 'ok' : pct >= 70 ? 'mid' : 'low';
  body.innerHTML = `
    <div class="dev-score dev-score--${tone}">
      <p class="dev-score__n">${pct}%</p>
      <p>${r.correct} de ${r.total} ejemplos se reconocieron bien, probando cada uno contra todos los demás.</p>
    </div>
    ${
      r.phrasesWithTooFew.length
        ? `<p class="dev-note">${icon('info', 16)}<span>Frases con un solo ejemplo (no se pueden medir): ${esc(r.phrasesWithTooFew.slice(0, 8).join(', '))}${r.phrasesWithTooFew.length > 8 ? '…' : ''}</span></p>`
        : ''
    }
    <ul class="dev-eval">
      ${r.rows
        .map((row) => {
          const p = Math.round((row.correct / row.total) * 100);
          return `<li class="dev-eval__row">
            <div class="dev-eval__top"><b>${esc(row.text)}</b><span class="dev-meta">${row.correct}/${row.total} · ${p}%</span></div>
            <div class="dev-eval__bar"><i style="width:${p}%"></i></div>
            ${row.confused.length ? `<p class="dev-meta">Se confunde con: ${row.confused.map((c) => `«${esc(c.text)}» (${c.count})`).join(', ')}</p>` : ''}
          </li>`;
        })
        .join('')}
    </ul>
    <p class="dev-meta">Para mejorar una frase: agrega más repeticiones o videos con mejor luz, y revisa las que se confunden entre sí.</p>`;
}
