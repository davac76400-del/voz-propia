import { engine } from '../../core/engine';
import type { LipSequence } from '../../core/types';
import { FEATURE_DIMS } from '../../core/vision/lip-features';
import { phraseFromFilename } from '../../core/vision/filename-phrase';
import { processVideoFile } from '../../core/vision/video-processor';
import { transcribeVideoAudio } from '../../core/vision/transcriber';
import { segmentByMotion, segmentClips } from '../../core/vision/segmenter';
import type { VideoClip } from '../../core/vision/segmenter';
import { DEFAULT_FOLDER, insertClips, listFolders } from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { toast } from './toast';

const round = (n: number) => Math.round(n * 10000) / 10000;
const MIN_FRAMES = 8;

interface ImportClip extends VideoClip {
  source: string;
  fromName: boolean;
}

const FRAMING_TIP =
  'Que se vea la boca con la nariz y la barbilla (la boca no debe ocupar más de la mitad del ancho). Si recortas solo los labios, el detector no los encuentra.';

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
        <p><b>Nombre del archivo:</b> <code>voz-frase.mp4</code>. La frase es lo que va después del guion. Ejemplo: <code>voz-me.mp4</code> guarda «Me» y <code>voz-tengo-sed.mp4</code> guarda «Tengo sed».</p>
        <p><b>Qué debe verse:</b> ${esc(FRAMING_TIP)}</p>
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

  let clips: ImportClip[] = [];
  let failures: string[] = [];
  let note = '';

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

  const processOne = async (file: File, label: string): Promise<ImportClip[]> => {
    const phrase = phraseFromFilename(file.name);
    say(`${label} · leyendo los labios…`, 0);
    const video = await processVideoFile(file, (pct) => say(`${label} · leyendo los labios…`, pct));
    if (video.frames.length < Math.max(MIN_FRAMES, video.scanned * 0.2)) {
      throw new Error(`No pude ubicar los labios. ${FRAMING_TIP}`);
    }

    if (phrase) {
      const first = video.frames[0];
      const last = video.frames[video.frames.length - 1];
      return [{ id: 'clip-0', text: phrase, startMs: first.t, endMs: last.t, frames: video.frames, source: file.name, fromName: true }];
    }

    let segments: Awaited<ReturnType<typeof transcribeVideoAudio>> = [];
    try {
      segments = await transcribeVideoAudio(file, (m, pct) => say(`${label} · ${m}`, pct));
    } catch (err) {
      console.warn('Transcripción no disponible:', err);
      note = 'Hay videos sin nombre «voz-frase» y no pude transcribir su audio (¿sin internet?). Los separé por pausas: escribe tú esas frases.';
    }
    say(`${label} · armando los fragmentos…`);
    const found = segments.length ? segmentClips(video.frames, segments) : segmentByMotion(video.frames);
    if (!segments.length && !note) note = 'Hay videos sin nombre «voz-frase» y sin audio claro. Los separé por pausas: escribe tú esas frases.';
    return found.map((c) => ({ ...c, source: file.name, fromName: false }));
  };

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    if (!files.length) return;
    pickBtn.hidden = true;
    progress.hidden = false;
    result.hidden = true;
    errBox.hidden = true;
    clips = [];
    failures = [];
    note = '';

    for (const [i, file] of files.entries()) {
      const label = files.length > 1 ? `Video ${i + 1} de ${files.length}` : 'Video';
      try {
        clips.push(...(await processOne(file, label)));
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
    renderClips();
  });

  const renderClips = () => {
    if (!clips.length) {
      result.hidden = true;
      return;
    }
    result.hidden = false;
    result.innerHTML = `
      ${note ? `<p class="dev-note">${icon('info', 16)}<span>${esc(note)}</span></p>` : ''}
      <ul class="dev-clips">
        ${clips
          .map(
            (c, i) => `
          <li class="dev-clip" data-i="${i}">
            <div class="dev-clip__main">
              <input class="input" type="text" value="${esc(c.text)}" aria-label="Frase de ${esc(c.source)}" data-text>
              <p class="dev-meta">${esc(c.source)} · ${((c.endMs - c.startMs) / 1000).toFixed(1)} s · ${c.frames.length} cuadros</p>
            </div>
            <button class="icon-btn" type="button" data-skip aria-label="Quitar este fragmento">${icon('trash', 18)}</button>
          </li>`,
          )
          .join('')}
      </ul>
      <button class="btn btn--primary btn--lg" id="imp-save" type="button">${icon('check', 20)}<span>Guardar ${clips.length} frase(s)</span></button>`;
  };

  const syncTexts = () => {
    result.querySelectorAll<HTMLElement>('[data-i]').forEach((row) => {
      const i = Number(row.dataset.i);
      const v = row.querySelector<HTMLInputElement>('[data-text]')!.value.trim();
      if (clips[i]) clips[i].text = v;
    });
  };

  const save = async () => {
    syncTexts();
    const ready = clips.filter((c) => c.text.length > 0);
    if (!ready.length) return void toast('Escribe al menos una frase.', { tone: 'warn' });
    const btn = q<HTMLButtonElement>('#imp-save');
    btn.disabled = true;
    try {
      await insertClips(
        ready.map((c) => {
          const seq = toLipSequence(c);
          return {
            text: c.text,
            start_time: c.startMs,
            end_time: c.endMs,
            frame_count: c.frames.length,
            folder: folderSel.value,
            source_name: c.source,
            lip_points: { dims: seq.dims, fps: round(seq.fps), frames: Array.from(seq.frames, round) },
          };
        }),
      );
      await addToEngine(ready);
      toast(`${ready.length} frase(s) guardadas en «${folderSel.value}».`, { tone: 'ok' });
      close();
    } catch (err) {
      btn.disabled = false;
      toast(`No se pudo guardar: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  result.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const skip = t.closest<HTMLElement>('[data-skip]');
    if (skip) {
      const i = Number(skip.closest<HTMLElement>('[data-i]')!.dataset.i);
      syncTexts();
      clips.splice(i, 1);
      renderClips();
      return;
    }
    if (t.closest('#imp-save')) await save();
  });

  document.body.appendChild(dlg);
  dlg.showModal();
}

async function addToEngine(clips: VideoClip[]) {
  for (const clip of clips) {
    try {
      const wanted = clip.text.trim().toLowerCase();
      const phrase =
        engine.phrases.find((p) => p.text.trim().toLowerCase() === wanted) ??
        (await engine.savePhrase({ text: clip.text.trim(), icon: 'sparkles', category: 'necesidad' }));
      await engine.addSample(phrase.id, toLipSequence(clip), 'grabacion');
    } catch (err) {
      console.error('No se pudo añadir al motor:', err);
    }
  }
}

function toLipSequence(clip: VideoClip): LipSequence {
  const flat = new Float32Array(clip.frames.length * FEATURE_DIMS);
  clip.frames.forEach((f, i) => flat.set(f.features, i * FEATURE_DIMS));
  const seconds = Math.max((clip.endMs - clip.startMs) / 1000, 0.1);
  return { dims: FEATURE_DIMS, frames: flat, fps: clip.frames.length / seconds };
}
