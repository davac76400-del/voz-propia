import { engine } from '../../core/engine';
import type { LipSequence } from '../../core/types';
import { processVideoFile } from '../../core/vision/video-processor';
import { transcribeVideoAudio } from '../../core/vision/transcriber';
import { segmentClips } from '../../core/vision/segmenter';
import type { VideoClip } from '../../core/vision/segmenter';
import { DEFAULT_FOLDER, insertClips, listFolders } from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { toast } from './toast';

const round = (n: number) => Math.round(n * 10000) / 10000;

export async function openVideoImporter(startFolder = DEFAULT_FOLDER) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet';

  let folders = [DEFAULT_FOLDER];
  try {
    folders = await listFolders();
  } catch {
    /* el selector funciona con la carpeta por defecto */
  }
  if (!folders.includes(startFolder)) startFolder = DEFAULT_FOLDER;

  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div><p class="kicker">[ Importar ]</p><h2>Subir un video</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>

      <label class="field">
        <span class="field__label">Guardar en la carpeta</span>
        <select class="input" id="imp-folder">
          ${folders.map((f) => `<option value="${esc(f)}"${f === startFolder ? ' selected' : ''}>${esc(f)}</option>`).join('')}
        </select>
      </label>

      <input type="file" id="imp-file" accept="video/*" hidden>
      <button class="btn btn--primary btn--lg" id="imp-pick" type="button">${icon('upload', 20)}<span>Elegir video (40 a 60 s)</span></button>

      <div id="imp-progress" class="dev-progress" hidden>
        <progress></progress>
        <p id="imp-status">Preparando…</p>
      </div>

      <div id="imp-result" hidden></div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  const fileInput = q<HTMLInputElement>('#imp-file');
  const pickBtn = q<HTMLButtonElement>('#imp-pick');
  const progress = q<HTMLDivElement>('#imp-progress');
  const status = q<HTMLParagraphElement>('#imp-status');
  const result = q<HTMLDivElement>('#imp-result');
  const folderSel = q<HTMLSelectElement>('#imp-folder');

  let clips: VideoClip[] = [];
  let sourceName = '';

  const close = () => {
    dlg.close();
    dlg.remove();
  };
  q<HTMLButtonElement>('[data-close]').addEventListener('click', close);
  dlg.addEventListener('close', () => dlg.remove());
  pickBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    sourceName = file.name;
    pickBtn.hidden = true;
    progress.hidden = false;
    try {
      status.textContent = 'Leyendo labios del video…';
      const frames = await processVideoFile(file);
      status.textContent = 'Separando frases…';
      const segments = await transcribeVideoAudio(file);
      clips = segmentClips(frames, segments);
      progress.hidden = true;
      renderClips();
    } catch (err) {
      toast(`No se pudo procesar: ${(err as Error).message}`, { tone: 'warn' });
      progress.hidden = true;
      pickBtn.hidden = false;
    }
  });

  const renderClips = () => {
    result.hidden = false;
    if (!clips.length) {
      result.innerHTML = `<p class="dev-note">No se encontraron labios en el video. Prueba con mejor luz y de frente.</p>`;
      pickBtn.hidden = false;
      return;
    }
    result.innerHTML = `
      <p class="dev-note">${icon('info', 16)}<span>La transcripción automática todavía no está activa. Escribe la frase real de cada fragmento antes de guardar.</span></p>
      <ul class="dev-clips">
        ${clips
          .map(
            (c, i) => `
          <li class="dev-clip" data-i="${i}">
            <div class="dev-clip__main">
              <input class="input" type="text" value="${esc(c.text)}" aria-label="Frase del fragmento ${i + 1}" data-text>
              <p class="dev-meta">${((c.endTime - c.startTime) / 1000).toFixed(1)} s · ${c.lipPoints.length} cuadros</p>
            </div>
            <button class="icon-btn" type="button" data-skip aria-label="Quitar este fragmento">${icon('trash', 18)}</button>
          </li>`,
          )
          .join('')}
      </ul>
      <button class="btn btn--primary btn--lg" id="imp-save" type="button">${icon('check', 20)}<span>Guardar ${clips.length} fragmento(s)</span></button>`;
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
        ready.map((c) => ({
          text: c.text,
          start_time: c.startTime,
          end_time: c.endTime,
          frame_count: c.lipPoints.length,
          folder: folderSel.value,
          source_name: sourceName,
          lip_points: c.lipPoints.map((f) => ({
            t: f.timestamp,
            p: f.lipPoints.map((p) => [round(p.x), round(p.y), round(p.z)]),
          })),
        })),
      );
      await addToEngine(ready);
      toast(`${ready.length} fragmento(s) guardados en «${folderSel.value}».`, { tone: 'ok' });
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
    const phrase = engine.phrases.find((p) => p.text.toLowerCase() === clip.text.toLowerCase());
    if (!phrase) continue;
    try {
      await engine.addSample(phrase.id, toLipSequence(clip), 'grabacion');
    } catch (err) {
      console.error('No se pudo añadir al motor:', err);
    }
  }
}

function toLipSequence(clip: VideoClip): LipSequence {
  const all = clip.lipPoints.flatMap((frame) => frame.lipPoints.flatMap((p) => [p.x, p.y, p.z]));
  return {
    dims: (clip.lipPoints[0]?.lipPoints.length ?? 21) * 3,
    frames: new Float32Array(all),
    fps: 25,
  };
}
