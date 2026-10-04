import { engine } from '../../core/engine';
import type { LipSequence } from '../../core/types';
import { processVideoFile } from '../../core/vision/video-processor';
import { transcribeVideoAudio } from '../../core/vision/transcriber';
import { segmentClips } from '../../core/vision/segmenter';
import type { VideoClip } from '../../core/vision/segmenter';
import { icon } from '../icons';
import { toast } from './toast';

export async function openVideoImporter() {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  const uploadIcon = icon('upload', 18);
  const closeIcon = icon('x', 20);

  dlg.innerHTML = `
    <div class="sheet__inner">
      <header class="sheet__head">
        <div><p class="kicker">[ Cargar video ]</p><h2>Importar ejemplos</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${closeIcon}</button>
      </header>

      <div class="importer__container">
        <input type="file" id="video-input" accept="video/*" style="display:none">
        <button class="btn btn--primary" id="upload-btn" type="button">
          ${uploadIcon}<span>Seleccionar video (40-60 seg)</span>
        </button>

        <div id="progress" style="display:none; margin-top: 20px;">
          <p id="status">Cargando...</p>
          <progress id="progress-bar" value="0" max="100" style="width:100%; height:8px;"></progress>
        </div>

        <div id="clips-list" style="display:none; margin-top: 20px; max-height: 400px; overflow-y: auto;">
          <!-- Clips aquí -->
        </div>
      </div>
    </div>`;

  const fileInput = dlg.querySelector<HTMLInputElement>('#video-input')!;
  const uploadBtn = dlg.querySelector<HTMLButtonElement>('#upload-btn')!;
  const progressDiv = dlg.querySelector<HTMLDivElement>('#progress')!;
  const statusText = dlg.querySelector<HTMLParagraphElement>('#status')!;
  const clipsList = dlg.querySelector<HTMLDivElement>('#clips-list')!;
  const closeBtn = dlg.querySelector<HTMLButtonElement>('[data-close]')!;

  let clips: VideoClip[] = [];

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    progressDiv.style.display = 'block';
    uploadBtn.style.display = 'none';

    try {
      statusText.textContent = 'Extrayendo frames...';
      const frames = await processVideoFile(file);
      statusText.textContent = 'Transcribiendo audio...';
      const segments = await transcribeVideoAudio(file);
      statusText.textContent = 'Segmentando clips...';
      clips = segmentClips(frames, segments);

      showClipsList(clips, clipsList, dlg);
      progressDiv.style.display = 'none';
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, { tone: 'warn' });
      progressDiv.style.display = 'none';
      uploadBtn.style.display = 'block';
    }
  });

  closeBtn.addEventListener('click', () => dlg.close());

  document.body.appendChild(dlg);
  dlg.showModal();
}

function showClipsList(clips: VideoClip[], container: HTMLDivElement, dlg: HTMLDialogElement) {
  const saveIcon = icon('save', 16);
  const clipCount = clips.length;

  container.innerHTML = `
    <div style="margin-bottom: 10px;">
      <p><b>${clipCount} clips encontrados</b></p>
    </div>
    <ul style="list-style: none; padding: 0;">
      ${clips
        .map(
          (clip, i) => {
            const duration = (clip.endTime - clip.startTime).toFixed(1);
            const frameCount = clip.lipPoints.length;
            return `
        <li class="pcard" style="margin-bottom: 10px;">
          <div class="pcard__body">
            <p class="pcard__text">${clip.text}</p>
            <p class="pcard__meta">${duration}s · ${frameCount} frames</p>
          </div>
          <button class="btn btn--sm btn--primary" type="button" data-accept="${i}">Aceptar</button>
        </li>
      `;
          },
        )
        .join('')}
    </ul>
    <button class="btn btn--primary" id="save-all" type="button" style="width: 100%; margin-top: 15px;">
      ${saveIcon}<span>Guardar todos</span>
    </button>`;

  container.style.display = 'block';

  container.querySelector('#save-all')?.addEventListener('click', async () => {
    await saveClips(clips, dlg);
  });

  container.querySelectorAll('[data-accept]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt((e.target as HTMLElement).getAttribute('data-accept')!);
      await saveClips([clips[idx]], dlg);
    });
  });
}

async function saveClips(clipsToSave: VideoClip[], dlg: HTMLDialogElement) {
  let saved = 0;

  for (const clip of clipsToSave) {
    const phrase = engine.phrases.find((p) => p.text.toLowerCase() === clip.text.toLowerCase());

    if (!phrase) {
      toast(`No encontré la frase «${clip.text}». Créala primero.`, { tone: 'warn' });
      continue;
    }

    try {
      const seq = convertToLipSequence(clip);
      await engine.addSample(phrase.id, seq, 'grabacion');
      saved++;
    } catch (err) {
      console.error('Error saving clip:', err);
    }
  }

  toast(`${saved} clip(s) guardado(s). Frase lista para entrenar.`, { tone: 'ok' });
  dlg.close();
}

function convertToLipSequence(clip: VideoClip): LipSequence {
  const allPoints = clip.lipPoints.flatMap((frame) => frame.lipPoints.flatMap((p) => [p.x, p.y, p.z]));

  return {
    dims: clip.lipPoints[0]?.lipPoints.length * 3 || 63,
    frames: new Float32Array(allPoints),
    fps: 25,
  };
}
