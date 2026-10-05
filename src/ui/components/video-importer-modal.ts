import { engine } from '../../core/engine';
import { dtw } from '../../core/learn/dtw';
import type { LipSequence } from '../../core/types';
import { FEATURE_DIMS } from '../../core/vision/lip-features';
import { packRaw } from '../../core/vision/raw-store';
import { nameKey, oneWordProblem, phraseFromFilename } from '../../core/vision/filename-phrase';
import { checkPatterns, REASON_TEXT, stallRatio, type PatternReport, type Reason } from '../../core/vision/pattern-check';
import { splitRepetitions, sparkline, type Pause, type Repetition } from '../../core/vision/repetitions';
import { processVideoFile, type FrameFeatures } from '../../core/vision/video-processor';
import { publishPhrase, syncShared, type PublishSummary } from '../../core/shared-sync';
import { DEFAULT_FOLDER, createFolder, insertClips, listFolders } from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { toast } from './toast';

const MIN_FRAMES = 8;
/** Una repetición con menos de esta fracción del movimiento típico se descarta: la boca casi no se movió. */
const QUIET_FRACTION = 0.35;
const INSERT_BATCH = 10;
const NEW_FOLDER = '__new';

type RepReason = Reason | 'quieta';

const REASON_LABEL: Record<RepReason, string> = { ...REASON_TEXT, quieta: 'casi no se movió la boca' };

interface Rep {
  rep: Repetition;
  keep: boolean;
  suspect: boolean;
  /** Letra del patrón al que pertenece (A, B…). */
  pattern: string;
  reason: RepReason | null;
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
  report: PatternReport | null;
  /** Palabra ya guardada a la que más se parece lo que se ve en el video. */
  similarTo: { text: string; ratio: number } | null;
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

const plain = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Aviso si lo que se ve se parece mucho a otra palabra ya guardada y no al nombre escrito. */
function similarWarning(g: Group): string {
  const sim = g.similarTo;
  if (!sim || sim.ratio > 1.4 || !g.phrase.trim() || plain(g.phrase) === plain(sim.text)) return '';
  return `Ojo: lo que se ve en el video se parece mucho a «${sim.text}», que ya tienes guardada. Revisa que el nombre sea el correcto.`;
}

/**
 * Parte el video en repeticiones (solo con los labios, el audio no cuenta), agrupa las que se ven iguales y se
 * queda con los patrones que se repiten varias veces. Descarta los raros, los de pocas veces, los que dejaron
 * de moverse y donde el video se trabó.
 */
export async function analyzeGroup(g: Group) {
  let found = splitRepetitions(g.frames, g.pause);
  if (!found.length && g.durationMs <= 4000 && g.frames.length >= MIN_FRAMES) {
    found = [{ startMs: g.frames[0].t, endMs: g.frames[g.frames.length - 1].t, frames: g.frames }];
  }
  g.reps = found.map((rep) => ({ rep, keep: true, suspect: false, pattern: '-', reason: null }));
  g.report = null;
  g.similarTo = null;
  const n = g.reps.length;
  if (!n) return;

  const seqs = g.reps.map((r) => toLipSequence(r.rep));
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  if (n >= 4) {
    const emb = await Promise.all(seqs.map((q) => engine.embed(q)));
    const { L, D } = emb[0];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dist[i][j] = dist[j][i] = dtw(emb[i].x, emb[j].x, L, D);
  }
  const report = checkPatterns(
    g.reps.map((r) => ({ startMs: r.rep.startMs, endMs: r.rep.endMs, stallRatio: stallRatio(r.rep.frames.map((f) => f.raw)) })),
    dist,
  );
  const activity = seqs.map((q) => engine.activity(q));
  const typical = median(activity);
  g.reps.forEach((r, i) => {
    const v = report.verdicts[i];
    r.pattern = v.pattern;
    r.reason = v.reason;
    r.suspect = !v.ok;
    if (v.ok && n >= 4 && activity[i] < typical * QUIET_FRACTION) {
      r.reason = 'quieta';
      r.suspect = true;
    }
    r.keep = !r.suspect;
  });
  g.report = report;

  // ¿Se parece a otra palabra que ya tienes? Se compara la repetición más representativa.
  const good = g.reps.map((_, i) => i).filter((i) => !g.reps[i].suspect);
  if (good.length) {
    const medoid = good.reduce((best, i) => (good.reduce((s, j) => s + dist[i][j], 0) < good.reduce((s, j) => s + dist[best][j], 0) ? i : best), good[0]);
    const v = await engine.verify(seqs[medoid]);
    if (v) g.similarTo = { text: v.phrase.text, ratio: v.ratio };
  }
}

function patternSummary(g: Group): string {
  const r = g.report;
  if (!r) return '';
  const lines: string[] = [];
  const used = g.reps.filter((x) => x.keep).length;
  if (r.tooFew) lines.push('Hay menos de 4 repeticiones: no alcanzo a comparar patrones. Repite la palabra más veces en el mismo video.');
  else if (r.noClearPattern) lines.push('No encontré un patrón que se repita. Di la palabra igual cada vez, con una pausa corta entre una y otra.');
  else {
    const main = r.clusters.filter((c) => c.accepted);
    lines.push(`${main.length > 1 ? 'Patrones que sirven' : 'Patrón que sirve'}: ${main.map((c) => `${c.label} (${c.members.length} veces)`).join(', ')}. Se usan ${used} de ${g.reps.length} repeticiones.`);
  }
  if (r.cadence) {
    const gaps = r.longGaps ? ` · ${r.longGaps} pausa${r.longGaps > 1 ? 's' : ''} larga${r.longGaps > 1 ? 's' : ''} (¿se trabó el video?)` : '';
    lines.push(`La dices una vez cada ${(r.cadence.medianMs / 1000).toFixed(1)} s, ${r.cadence.regular ? 'a un ritmo parejo' : 'con un ritmo irregular'}${gaps}.`);
  }
  return lines.map((l) => `<p class="dev-meta">${esc(l)}</p>`).join('');
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
          <option value="${NEW_FOLDER}">+ Nueva carpeta…</option>
        </select>
        <input class="input" id="imp-newfolder" type="text" maxlength="40" placeholder="Nombre de la carpeta nueva" autocomplete="off" hidden>
      </label>

      <input type="file" id="imp-file" accept="video/*" multiple hidden>
      <button class="btn btn--primary btn--lg" id="imp-pick" type="button">${icon('upload', 20)}<span>Elegir videos</span></button>

      <div class="dev-help">
        <p><b>Nombre del archivo:</b> <code>voz-palabra.mp4</code> o <code>palabra-voz.mp4</code>. Ejemplo: <code>voz-me.mp4</code> guarda «Me». Una sola palabra por video.</p>
        <p><b>Varios videos de la misma palabra:</b> ponles un número y todos cuentan como la misma: <code>voz-piel.mp4</code>, <code>voz-piel2.mp4</code> y <code>piel3-voz.mp4</code> son «Piel». Se llaman como el primero que subiste.</p>
        <p><b>Solo cuentan los labios:</b> el audio no se usa, así que no importa si sale tarde o se desfasa.</p>
        <p><b>Repetir ayuda:</b> di la palabra muchas veces en el mismo video, con una pausa corta entre cada una. La app agrupa las repeticiones que se ven iguales y usa solo los patrones que se repiten varias veces; descarta las raras, las que salen muy pocas veces y las del video trabado.</p>
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
  const newFolder = q<HTMLInputElement>('#imp-newfolder');
  folderSel.addEventListener('change', () => {
    newFolder.hidden = folderSel.value !== NEW_FOLDER;
    if (!newFolder.hidden) newFolder.focus();
  });

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

    // Solo cuentan los labios: el nombre sale del archivo o de lo que escribas, nunca del audio.
    const phrase = phraseFromFilename(file.name) ?? '';
    if (!phrase) note = 'En algún video falta el nombre. Escribe la palabra, o renombra el archivo como «voz-palabra».';

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
      report: null,
      similarTo: null,
    };
    await analyzeGroup(g);
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
    // Los videos que son la misma palabra (cabeza-voz, cabeza2-voz…) se llaman como el primero que se subió.
    const firstName = new Map<string, string>();

    for (const [i, file] of files.entries()) {
      const label = files.length > 1 ? `Video ${i + 1} de ${files.length}` : 'Video';
      try {
        const g = await processOne(file, label);
        if (g.phrase) g.phrase = firstName.get(nameKey(g.phrase)) ?? (firstName.set(nameKey(g.phrase), g.phrase), g.phrase);
        groups.push(g);
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
    return n ? `Guardar ${n} ejemplo${n === 1 ? '' : 's'}` : 'Escribe la palabra para guardar';
  };

  const renderGroup = (g: Group) => {
    const kept = g.reps.filter((r) => r.keep).length;
    const suspects = g.reps.filter((r) => r.suspect).length;
    return `
      <article class="dev-import" data-g="${g.id}">
        <header class="dev-import__head">
          <p class="dev-meta">${esc(g.source)}${g.lipsOnly ? ' · solo labios' : ''}</p>
          <label class="field">
            <span class="field__label">Palabra que dices en este video</span>
            <input class="input" type="text" value="${esc(g.phrase)}" placeholder="Escribe una sola palabra" data-phrase>
          </label>
          <p class="dev-warn" data-one-word ${oneWordProblem(g.phrase) ? '' : 'hidden'}>${esc(oneWordProblem(g.phrase) ?? '')}</p>
          <p class="dev-warn" data-similar ${similarWarning(g) ? '' : 'hidden'}>${esc(similarWarning(g))}</p>
          ${patternSummary(g)}
          <div class="dev-import__row">
            <p class="dev-import__count"><b>${g.reps.length}</b> ${g.reps.length === 1 ? 'repetición encontrada' : 'repeticiones encontradas'}${suspects ? ` · <span class="dev-warn">${suspects} descartada${suspects === 1 ? '' : 's'}</span>` : ''}</p>
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
                  <span class="dev-rep__meta">${i + 1} · ${((r.rep.endMs - r.rep.startMs) / 1000).toFixed(1)} s${r.pattern !== '-' ? ` · patrón ${r.pattern}` : ''}${r.suspect && r.reason ? ` · descartada: ${REASON_LABEL[r.reason]}` : ''}</span>
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
    const card = input.closest<HTMLElement>('[data-g]');
    const warn = card?.querySelector<HTMLElement>('[data-one-word]');
    if (warn) {
      const msg = oneWordProblem(input.value);
      warn.hidden = !msg;
      warn.textContent = msg ?? '';
    }
    const sim = card?.querySelector<HTMLElement>('[data-similar]');
    if (sim && g) {
      const msg = similarWarning(g);
      sim.hidden = !msg;
      sim.textContent = msg;
    }
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
      await analyzeGroup(g);
      render();
    }
  });

  const save = async () => {
    const ready = groups.filter((g) => g.phrase.trim() && g.reps.some((r) => r.keep));
    if (!ready.length) return void toast('Escribe la palabra de cada video.', { tone: 'warn' });
    const many = ready.find((g) => oneWordProblem(g.phrase));
    if (many) return void toast(oneWordProblem(many.phrase)!, { tone: 'warn' });
    const btn = q<HTMLButtonElement>('#imp-save');
    let folderName = folderSel.value;
    if (folderName === NEW_FOLDER) {
      folderName = newFolder.value.trim();
      if (!folderName) return void toast('Escribe el nombre de la carpeta nueva.', { tone: 'warn' });
    }
    btn.disabled = true;
    let published = true;
    const summaries: PublishSummary[] = [];
    try {
      if (folderName !== folderSel.value && !folders.includes(folderName)) await createFolder(folderName);
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
            folder: folderName,
            source_name: g.source,
            lip_points: packRaw(r.rep.frames.map((f) => f.raw), seq.fps),
          };
        });
        for (let i = 0; i < rows.length; i += INSERT_BATCH) await insertClips(rows.slice(i, i + INSERT_BATCH));

        const ok = await publishPhrase(phrase).then(
          (sum) => {
            if (sum) summaries.push(sum);
            return true;
          },
          (err) => {
            console.warn('No se pudo publicar:', err);
            return false;
          },
        );
        if (!ok) published = false;
      }
      await syncShared();
      const total = ready.reduce((n, g) => n + g.reps.filter((r) => r.keep).length, 0);
      close();
      const merged = summaries
        .map((m) => `«${m.text}»: ${m.recordings} grabación${m.recordings === 1 ? '' : 'es'} juntas, ${m.clips} repeticiones, me quedé con las ${m.kept} mejores`)
        .join('. ');
      toast(
        published
          ? `${total} ejemplo${total === 1 ? '' : 's'} guardado${total === 1 ? '' : 's'}. ${merged ? `${merged}.` : 'Publicado para todos.'}`
          : `${total} ejemplo${total === 1 ? '' : 's'} guardado${total === 1 ? '' : 's'}, pero no se pudo publicar para los demás dispositivos.`,
        { tone: published ? 'ok' : 'warn' },
      );
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
