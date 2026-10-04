import { pushHistory, state } from '../../app/state';
import { engine } from '../../core/engine';
import type { Category } from '../../core/types';
import { speakPhrase, speakText } from '../../core/voice/speaker';
import { CATEGORY_LABEL } from '../../data/default-phrases';
import { $, esc, on, vibrate } from '../dom';
import { icon } from '../icons';

const ORDER: Category[] = ['necesidad', 'cuerpo', 'emocion', 'social'];
const PAIN_WORDS = ['Sin dolor', 'Muy leve', 'Leve', 'Leve', 'Moderado', 'Moderado', 'Fuerte', 'Fuerte', 'Muy fuerte', 'Muy fuerte', 'El peor dolor'];

export function tableroView(root: HTMLElement) {
  const render = () => {
    const yes = engine.phrases.find((p) => p.category === 'respuesta' && p.text.toLowerCase() === 'sí');
    const no = engine.phrases.find((p) => p.category === 'respuesta' && p.text.toLowerCase() === 'no');
    const groups = ORDER.map((c) => ({ c, items: engine.phrases.filter((p) => p.category === c) })).filter((g) => g.items.length);

    root.innerHTML = `
      <section class="view board">
        <header class="view-head">
          <div>
            <p class="kicker">[ Tablero ]</p>
            <h1>Toca y se escucha.<br><span class="hl">Sin cámara, al instante.</span></h1>
          </div>
        </header>

        <div class="yesno">
          <button class="yn yn--yes" type="button" data-say="${yes?.id ?? ''}" data-text="Sí"><span class="yn__orb">${icon('check', 40, 3)}</span><span>Sí</span></button>
          <button class="yn yn--no" type="button" data-say="${no?.id ?? ''}" data-text="No"><span class="yn__orb">${icon('x', 40, 3)}</span><span>No</span></button>
        </div>

        <div class="pain" role="group" aria-labelledby="pain-title">
          <div class="pain__head">
            <h2 id="pain-title">¿Cuánto duele?</h2>
            <p class="pain__word" data-pain-word>Toca un número</p>
          </div>
          <div class="pain__scale">
            ${Array.from({ length: 11 }, (_, i) => `<button class="pain__dot" type="button" data-pain="${i}" style="--i:${i}" aria-label="Dolor ${i} de 10, ${PAIN_WORDS[i]}">${i}</button>`).join('')}
          </div>
        </div>

        ${groups
          .map(
            (g) => `
          <div class="board__group">
            <h2 class="board__title"><i class="cat-dot cat-dot--${g.c}" aria-hidden="true"></i>${CATEGORY_LABEL[g.c]}</h2>
            <div class="tiles">
              ${g.items
                .map(
                  (p) => `<button class="tile" type="button" data-say="${p.id}" data-tilt="8">
                    <span class="sphere sphere--${p.category}">${icon(p.icon, 24)}</span>
                    <span class="tile__text">${esc(p.text)}</span>
                    ${p.audioId ? `<span class="tile__badge" title="Con voz grabada">${icon('mic', 12)}</span>` : ''}
                  </button>`,
                )
                .join('')}
            </div>
          </div>`,
          )
          .join('')}
      </section>`;
  };

  const pulse = (el: HTMLElement) => {
    el.classList.remove('is-speaking');
    void el.offsetWidth;
    el.classList.add('is-speaking');
    vibrate(15);
  };

  const offs = [
    on(root, 'click', '[data-say]', (_, el) => {
      pulse(el);
      const p = engine.phrase(el.dataset.say!);
      if (p) {
        pushHistory(p.id);
        void speakPhrase(p, state.settings);
      } else if (el.dataset.text) {
        void speakText(el.dataset.text, state.settings);
      }
    }),
    on(root, 'click', '[data-pain]', (_, el) => {
      const n = Number(el.dataset.pain);
      root.querySelectorAll('.pain__dot').forEach((d) => d.classList.toggle('is-on', d === el));
      $('[data-pain-word]', root).textContent = `${n} de 10 · ${PAIN_WORDS[n]}`;
      pulse(el);
      void speakText(n === 0 ? 'No tengo dolor' : `Mi dolor es ${n} de 10`, state.settings);
    }),
    engine.onChange(render),
  ];

  render();
  return () => offs.forEach((off) => off());
}
