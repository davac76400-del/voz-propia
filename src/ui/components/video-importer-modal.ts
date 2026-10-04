import { engine, MAX_SAMPLES_PER_PHRASE } from '../../core/engine';
import { dtw } from '../../core/learn/dtw';
import type { LipSequence } from '../../core/types';
import { FEATURE_DIMS } from '../../core/vision/lip-features';
import { phraseFromFilename } from '../../core/vision/filename-phrase';
import { collapseRepeats, splitRepetitions, sparkline, type Pause, type Repetition } from '../../core/vision/repetitions';
import { processVideoFile, type FrameFeatures } from '../../core/vision/video-processor';
import { transcribeVideoAudio } from '../../core/vision/transcriber';
import { DEFAULT_FOLDER, insertClips, listFolders } from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { toast } from './toast';

const round = (n: number) => Math.round(n * 10000) / 10000;
const MIN_FRAMES = 8;
const SUSPECT_FACTOR = 1.8;
const SCORE_SAMPLE = 30;
const INSERT_BATCH = 10;

interface Rep {
  rep: Repetition;
  keep: boolean;
  suspect: boolean;
  /** Distancia típica a las demás repeticiones: menor es más representativa. */
  score: number;
}

interface Group {
  id: number;
  source: string;
  phrase: string;
  lipsOnly: boolean;
  frames: FrameFeatures[];
  durationMs: number;
  pause: Pause;
  reps: Rep[];
}

const FRAMING_TIP =
  'Sirve la cara completa o solo los labios recortados. Si son solo labios, que la boca ocupe casi todo el cuadro, de frente y con buena luz.';

function toLipSequence(rep: Repetition): LipSequence {
  const flat = new Float32Array(rep.frames.length * FEATURE_DIMS);
  rep.frames.forEach((f, i) => flat.set(f.features, i * FEATURE_DIMS));
  const seconds = Math.max((rep.endMs - rep.startMs) / 1000, 0.1);
  return { dims: FEATURE_DIMS, frames: flat, fps: rep.frames.length / seconds };
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Parte el video en repeticiones y marca como dudosas las que no se parecen a las demás. */
async function analyze(g: Group) {
  let found = splitRepetitions(g.frames, g.pause);
  if (!found.length && g.durationMs <= 4000 && g.frames.length >= MIN_FRAMES) {
    found = [{ startMs: g.frames[0].t, endMs: g.frames[g.frames.length - 1].t, frames: g.frames }];
  }
  g.reps = found.map((rep) => ({ rep, keep: true, suspect: false, score: 0 }));
  if (g.reps.length < 4) return;

  const emb = await Promise.all(g.reps.map((r) => engine.embed(toLipSequence(r.rep))));
  const L = emb[0].L;
  const D = emb[0].D;
  g.reps.forEach((r, i) => {
    const others = emb.map((_, j) => j).filter((j) => j !== i);
    const pick = others.length > SCORE_SAMPLE ? others.filter((_, k) => k % Math.ceil(others.length / SCORE_SAMPLE) === 0) : others;
    r.score = median(pick.map((j) => dtw(emb[i].x, emb[j].x, L, D)));
  });
  const typical = median(g.reps.map((r) => r.score));
  const dur = median(g.reps.map((r) => r.rep.endMs - r.rep.startMs));
  for (const r of g.reps) {
    const len = r.rep.endMs - r.rep.startMs;
    r.suspect = r.score > typical * SUSPECT_FACTOR || len > dur * 2.5 || len < dur * 0.4;
    r.keep = !r.suspect;
  }
}

export async function openVideoImporter(startFolder = DEFAULT_FOLDER) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet';

  let folders = [DEFAULT_FOLDER];
  try {
    folders = await listFolders();
  } catch {
    /* el selector funciona con la carpeta por defecto */
  }
  folders = Array.from(new Set([DEFAULT_FOLDER, ...folders]));
  if (!folders.includes(startFolder)) startFolder = DEFAULT_FOLDER;

  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div><p class="kicker">[ Importar ]</p><h2>Subir videos</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>

      <label class="field">
        <span class="field__label">Guardar en la carpeta</span>
        <select class="input" id="imp-folder">
          ${folders.map((f) => `<option value="${esc(f)}"${f === startFolder ? ' selected' : ''}>${esc(f)}</option>`).join('')}
        </select>
      </label>

      <input type="file" id="imp-file" accept="video/*" multiple hidden>
      <button class="btn btn--primary btn--lg" id="imp-pick" type="button">${icon('upload', 20)}<span>Elegir videos</span></button>

      <div class="dev-help">
        <p><b>Nombre del archivo:</b> <code>voz-frase.mp4</code> o <code>frase-voz.mp4</code>. Ejemplo: <code>voz-me.mp4</code> guarda «Me» y <code>voz-tengo-sed.mp4</code> guarda «Tengo sed».</p>
        <p><b>Repetir ayuda:</b> di la frase muchas veces en el mismo video, con una pausa corta entre cada una. Cada vez que la dices cuenta como un ejemplo.</p>
        <p><b>Qué debe verse:</b> ${esc(FRAMING_TIP)} Con solo labios la lectura es experimental: la cara completa da mejores resultados.</p>
      </div>

      <div id="imp-progress" class="dev-progress" hidden>
        <progress id="imp-bar" max="100"></progress>
        <p id="imp-status" aria-live="polite">Preparando…</p>
      </div>

      <p id="imp-err" class="dev-note dev-note--err" role="alert" hidden></p>
      <div id="imp-result" hidden></div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  const fileInput = q<HTMLInputElement>('#imp-file');
  const pickBtn = q<HTMLButtonElement>('#imp-pick');
  const progress = q<HTMLDivElement>('#imp-progress');
  const status = q<HTMLParagraphElement>('#imp-status');
  const bar = q<HTMLProgressElement>('#imp-bar');
  const errBox = q<HTMLParagraphElement>('#imp-err');
  const result = q<HTMLDivElement>('#imp-result');
  const folderSel = q<HTMLSelectElement>('#imp-folder');

  let groups: Group[] = [];
  let failures: string[] = [];
  let note = '';
  let nextId = 1;

  const say = (msg: string, pct?: number) => {
    status.textContent = pct === undefined ? msg : `${msg} ${pct}%`;
    if (pct === undefined) bar.removeAttribute('value');
    else bar.value = pct;
  };

  const close = () => {
    dlg.close();
    dlg.remove();
  };
  q<HTMLButtonElement>('[data-close]').addEventListener('click', close);
  dlg.addEventListener('close', () => dlg.remove());
  pickBtn.addEventListener('click', () => fileInput.click());

  const processOne = async (file: File, label: string): Promise<Group> => {
    say(`${label} · leyendo los labios…`, 0);
    const video = await processVideoFile(file, (pct) => say(`${label} · leyendo los labios…`, pct));
    if (video.frames.length < Math.max(MIN_FRAMES, video.scanned * 0.2)) {
      throw new Error(`No pude leer los labios de este video. ${FRAMING_TIP}`);
    }

    let phrase = phraseFromFilename(file.name) ?? '';
    if (!phrase) {
      try {
        const heard = await transcribeVideoAudio(file, (m, pct) => say(`${label} · ${m}`, pct));
        phrase = collapseRepeats(heard.map((s) => s.text).join(' '));
      } catch (err) {
        console.warn('Transcripción no disponible:', err);
        note = 'En algún video no pude adivinar la frase por el audio (¿sin internet?). Escríbela tú, o renombra el archivo como «voz-frase».';
      }
    }

    say(`${label} · buscando las repeticiones…`);
    const g: Group = {
      id: nextId++,
      source: file.name,
      phrase,
      lipsOnly: video.mode === 'labios',
      frames: video.frames,
      durationMs: video.durationMs,
      pause: 'normal',
      reps: [],
    };
    await analyze(g);
    return g;
  };

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    if (!files.length) return;
    pickBtn.hidden = true;
    progress.hidden = false;
    result.hidden = true;
    errBox.hidden = true;
    groups = [];
    failures = [];
    note = '';

    for (const [i, file] of files.entries()) {
      const label = files.length > 1 ? `Video ${i + 1} de ${files.length}` : 'Video';
      try {
        groups.push(await processOne(file, label));
      } catch (err) {
        failures.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    progress.hidden = true;
    fileInput.value = '';
    pickBtn.hidden = false;
    if (failures.length) {
      errBox.innerHTML = failures.map((f) => `<span>${esc(f)}</span>`).join('<br>');
      errBox.hidden = false;
    }
    render();
  });

  const totalKept = () => groups.reduce((n, g) => n + (g.phrase.trim() ? g.reps.filter((r) => r.keep).length : 0), 0);

  const saveLabel = () => {
    const n = totalKept();
    return n ? `Guardar ${n} ejemplo${n === 1 ? '' : 's'}` : 'Escribe la frase para guardar';
  };

  const renderGroup = (g: Group) => {
    const kept = g.reps.filter((r) => r.keep).length;
    const suspects = g.reps.filter((r) => r.suspect).length;
    return `
      <article class="dev-import" data-g="${g.id}">
        <header class="dev-import__head">
          <p class="dev-meta">${esc(g.source)}${g.lipsOnly ? ' · solo labios' : ''}</p>
          <label class="field">
            <span class="field__label">Frase que dices en este video</span>
            <input class="input" type="text" value="${esc(g.phrase)}" placeholder="Escribe la frase" data-phrase>
          </label>
          <div class="dev-import__row">
            <p class="dev-import__count"><b>${g.reps.length}</b> ${g.reps.length === 1 ? 'repetición encontrada' : 'repeticiones encontradas'}${suspects ? ` · <span class="dev-warn">${suspects} dudosa${suspects === 1 ? '' : 's'}</span>` : ''}</p>
            <label class="dev-import__pause">
              <span>Pausa entre repeticiones</span>
              <select class="input" data-pause aria-label="Pausa entre repeticiones">
                ${(['corta', 'normal', 'larga'] as Pause[]).map((p) => `<option value="${p}"${p === g.pause ? ' selected' : ''}>${p[0].toUpperCase()}${p.slice(1)}</option>`).join('')}
              </select>
            </label>
          </div>
        </header>
        ${
          g.reps.length
            ? `<ul class="dev-reps">${g.reps
                .map(
                  (r, i) => `
              <li class="dev-rep${r.keep ? '' : ' is-off'}${r.suspect ? ' is-suspect' : ''}">
                <label>
                  <input type="checkbox" data-keep="${i}"${r.keep ? ' checked' : ''} aria-label="Usar la repetición ${i + 1}">
                  <svg viewBox="0 0 84 26" width="84" height="26" aria-hidden="true"><path d="${sparkline(r.rep.frames)}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span class="dev-rep__meta">${i + 1} · ${((r.rep.endMs - r.rep.startMs) / 1000).toFixed(1)} s${r.suspect ? ' · dudosa' : ''}</span>
                </label>
              </li>`,
                )
                .join('')}</ul>
            <p class="dev-meta">${kept} de ${g.reps.length} se usarán. Quita las que se vean raras.</p>`
            : `<p class="dev-note">${icon('info', 16)}<span>No encontré repeticiones: la boca casi no se movió. Prueba con otra pausa o con otro video.</span></p>`
        }
      </article>`;
  };

  const render = () => {
    if (!groups.length) {
      result.hidden = true;
      return;
    }
    result.hidden = false;
    result.innerHTML = `
      ${note ? `<p class="dev-note">${icon('info', 16)}<span>${esc(note)}</span></p>` : ''}
      ${groups.map(renderGroup).join('')}
      <button class="btn btn--primary btn--lg" id="imp-save" type="button">${icon('check', 20)}<span id="imp-save-label">${saveLabel()}</span></button>`;
  };

  const groupOf = (el: HTMLElement) => groups.find((g) => g.id === Number(el.closest<HTMLElement>('[data-g]')?.dataset.g));

  result.addEventListener('input', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-phrase]');
    if (!input) return;
    const g = groupOf(input);
    if (g) g.phrase = input.value;
    q<HTMLElement>('#imp-save-label').textContent = saveLabel();
  });

  result.addEventListener('change', async (e) => {
    const t = e.target as HTMLElement;
    const keep = t.closest<HTMLInputElement>('[data-keep]');
    if (keep) {
      const g = groupOf(keep);
      if (!g) return;
      g.reps[Number(keep.dataset.keep)].keep = keep.checked;
      render();
      return;
    }
    const pause = t.closest<HTMLSelectElement>('[data-pause]');
    if (pause) {
      const g = groupOf(pause);
      if (!g) return;
      g.pause = pause.value as Pause;
      pause.disabled = true;
      await analyze(g);
      render();
    }
  });

  const save = async () => {
    const ready = groups.filter((g) => g.phrase.trim() && g.reps.some((r) => r.keep));
    if (!ready.length) return void toast('Escribe la frase de cada video.', { tone: 'warn' });
    const btn = q<HTMLButtonElement>('#imp-save');
    btn.disabled = true;
    try {
      for (const g of ready) {
        const phrase = g.phrase.trim();
        const kept = g.reps.filter((r) => r.keep);
        const rows = kept.map((r) => {
          const seq = toLipSequence(r.rep);
          return {
            text: phrase,
            start_time: r.rep.startMs,
            end_time: r.rep.endMs,
            frame_count: r.rep.frames.length,
            folder: folderSel.value,
            source_name: g.source,
            lip_points: { dims: seq.dims, fps: round(seq.fps), frames: Array.from(seq.frames, round) },
          };
        });
        for (let i = 0; i < rows.length; i += INSERT_BATCH) await insertClips(rows.slice(i, i + INSERT_BATCH));

        const best = [...kept].sort((a, b) => a.score - b.score).slice(0, MAX_SAMPLES_PER_PHRASE);
        await addToEngine(phrase, best.map((r) => toLipSequence(r.rep)));
      }
      const total = ready.reduce((n, g) => n + g.reps.filter((r) => r.keep).length, 0);
      toast(`${total} ejemplo${total === 1 ? '' : 's'} guardado${total === 1 ? '' : 's'} en «${folderSel.value}».`, { tone: 'ok' });
      close();
    } catch (err) {
      btn.disabled = false;
      toast(`No se pudo guardar: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  result.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).closest('#imp-save')) await save();
  });

  document.body.appendChild(dlg);
  dlg.showModal();
}

async function addToEngine(text: string, seqs: LipSequence[]) {
  try {
    const wanted = text.toLowerCase();
    const phrase =
      engine.phrases.find((p) => p.text.trim().toLowerCase() === wanted) ??
      (await engine.savePhrase({ text, icon: 'sparkles', category: 'necesidad' }));
    await engine.addSamples(phrase.id, seqs, 'grabacion');
  } catch (err) {
    console.error('No se pudo añadir al motor:', err);
  }
}
