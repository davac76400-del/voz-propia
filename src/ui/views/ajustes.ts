import { go } from '../../app/router';
import { state, updateSettings } from '../../app/state';
import { engine } from '../../core/engine';
import { db } from '../../core/storage/db';
import type { Phrase, Sample } from '../../core/types';
import { listCameras, tracker } from '../../core/vision/face-tracker';
import { isPersonalVoice, onVoicesChanged, spanishVoices, speakText } from '../../core/voice/speaker';
import { CATEGORY_LABEL } from '../../data/default-phrases';
import { toast } from '../components/toast';
import { $, esc, on } from '../dom';
import { icon } from '../icons';

interface Backup {
  app: 'voz-propia';
  version: 1;
  phrases: Phrase[];
  samples: (Omit<Sample, 'seq'> & { seq: { dims: number; fps: number; frames: number[] } })[];
  audio: Record<string, string>;
}

const blobToDataURL = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

async function exportBackup() {
  const audio: Record<string, string> = {};
  for (const p of engine.phrases) {
    if (!p.audioId) continue;
    const b = await db.audio(p.audioId);
    if (b) audio[p.audioId] = await blobToDataURL(b);
  }
  const data: Backup = {
    app: 'voz-propia',
    version: 1,
    phrases: engine.phrases,
    samples: engine.samples.map((s) => ({ ...s, seq: { dims: s.seq.dims, fps: s.seq.fps, frames: Array.from(s.seq.frames) } })),
    audio,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `voz-propia-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const CATEGORIES = Object.keys(CATEGORY_LABEL);

/** Un respaldo es un archivo cualquiera: solo entra lo que tiene la forma correcta. */
const goodPhrase = (p: Phrase) =>
  typeof p?.id === 'string' && typeof p.text === 'string' && typeof p.order === 'number' && CATEGORIES.includes(p.category) && typeof p.icon === 'string' && /^[a-z0-9-]+$/.test(p.icon);
const goodSample = (s: Backup['samples'][number]) => {
  const q = s?.seq;
  return typeof s?.id === 'string' && typeof s.phraseId === 'string' && Number.isInteger(q?.dims) && q.dims > 0 && Array.isArray(q.frames) && q.frames.length % q.dims === 0 && q.frames.every(Number.isFinite);
};

async function importBackup(file: File) {
  const data = JSON.parse(await file.text()) as Backup;
  if (data?.app !== 'voz-propia' || !Array.isArray(data.phrases) || !Array.isArray(data.samples)) {
    throw new Error('El archivo no es un respaldo de Voz Propia.');
  }
  for (const p of data.phrases.filter(goodPhrase)) await db.putPhrase(p);
  for (const s of data.samples.filter(goodSample)) await db.putSample({ ...s, seq: { ...s.seq, frames: Float32Array.from(s.seq.frames) } });
  for (const [id, url] of Object.entries(data.audio ?? {})) if (url.startsWith('data:audio/')) await db.putAudio(id, await (await fetch(url)).blob());
  await engine.reload();
}

export function ajustesView(root: HTMLElement) {
  let wipeArmed = false;

  let cameras: MediaDeviceInfo[] = [];
  void listCameras().then((c) => {
    cameras = c;
    if (root.isConnected) render();
  });

  const render = () => {
    const s = state.settings;
    const voices = spanishVoices();
    const hasPersonal = voices.some(isPersonalVoice);
    root.innerHTML = `
      <section class="view settings">
        <header class="view-head">
          <div>
            <p class="kicker">[ Ajustes ]</p>
            <h1>Todo bajo control.</h1>
          </div>
        </header>

        <div class="set-grid">
          <article class="panel">
            <h2>${icon('volume', 20)} Voz</h2>
            <label class="field">
              <span class="field__label">Voz del dispositivo</span>
              <select class="input" data-voice>
                ${voices.length ? '' : '<option value="">Voz predeterminada</option>'}
                ${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.voiceURI ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}${isPersonalVoice(v) ? ' · Voz Personal' : ''}${v.localService ? '' : ' (requiere internet)'}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Velocidad <output data-out="rate">${s.rate.toFixed(2)}×</output></span>
              <input type="range" class="range" min="0.6" max="1.4" step="0.05" value="${s.rate}" data-range="rate">
            </label>
            <label class="field">
              <span class="field__label">Tono <output data-out="pitch">${s.pitch.toFixed(2)}</output></span>
              <input type="range" class="range" min="0.6" max="1.4" step="0.05" value="${s.pitch}" data-range="pitch">
            </label>
            <button class="btn btn--soft" type="button" data-test>${icon('play', 18)}<span>Probar voz</span></button>
            <div class="note ${hasPersonal ? 'note--ok' : ''}">
              ${icon(hasPersonal ? 'check' : 'info', 18)}
              <p>${
                hasPersonal
                  ? 'Encontré tu Voz Personal de Apple. Elígela arriba para hablar con tu propia voz.'
                  : '<b>¿Tienes iPhone o Mac?</b> Antes de una cirugía puedes crear tu Voz Personal en Ajustes › Accesibilidad › Voz Personal. Si tu sistema la comparte con el navegador, aparecerá en la lista. También puedes grabar cada frase en la sección Entrenar.'
              }</p>
            </div>
          </article>

          <article class="panel">
            <h2>${icon('scan-face', 20)} Lectura de labios</h2>
            <label class="field">
              <span class="field__label">Pedir que confirmes si la seguridad es menor a <output data-out="autoSpeakThreshold">${Math.round(s.autoSpeakThreshold * 100)}%</output></span>
              <input type="range" class="range" min="0.4" max="0.95" step="0.05" value="${s.autoSpeakThreshold}" data-range="autoSpeakThreshold">
              <span class="field__help">Más alto: confirma más seguido, se equivoca menos al hablar solo.</span>
            </label>
            <label class="field">
              <span class="field__label">Tiempo máximo por frase <output data-out="maxCaptureMs">${(s.maxCaptureMs / 1000).toFixed(1)} s</output></span>
              <input type="range" class="range" min="2000" max="6000" step="500" value="${s.maxCaptureMs}" data-range="maxCaptureMs">
            </label>
            ${
              cameras.length > 1
                ? `<label class="field">
              <span class="field__label">Cámara</span>
              <select class="input" data-camera>
                <option value="">La que elija el navegador</option>
                ${cameras.map((c, i) => `<option value="${esc(c.deviceId)}" ${c.deviceId === s.cameraId ? 'selected' : ''}>${esc(c.label || `Cámara ${i + 1}`)}</option>`).join('')}
              </select>
            </label>`
                : ''
            }
            <label class="switch"><input type="checkbox" data-toggle="learnFromUse" ${s.learnFromUse ? 'checked' : ''}><span class="switch__ui"></span><span>Aprender cuando el usuario corrige una lectura</span></label>
            <dl class="stats">
              <div><dt>Motor</dt><dd>${esc(engine.encoderName)}</dd></div>
              <div><dt>Detector de rostro</dt><dd>MediaPipe ${tracker.delegate === 'GPU' ? 'con GPU' : tracker.delegate === 'CPU' ? 'en CPU' : '(se carga al abrir la cámara)'}</dd></div>
              <div><dt>Frases entrenadas</dt><dd>${engine.trainedPhrases.length} de ${engine.phrases.length}</dd></div>
              <div><dt>Ejemplos guardados</dt><dd>${engine.samples.length}</dd></div>
            </dl>
          </article>

          <article class="panel">
            <h2>${icon('user', 20)} Modo</h2>
            <p class="muted">Estás en <b>modo programador</b>. El modo usuario solo muestra la guía: no puede entrenar ni cambiar la voz.</p>
            <div class="row">
              <button class="btn btn--primary" type="button" data-as-user>${icon('eye', 18)}<span>Ver como usuario</span></button>
              <button class="btn btn--soft" type="button" data-intro>${icon('house', 18)}<span>Volver al inicio</span></button>
            </div>
            <p class="field__help">Para volver aquí desde el modo usuario: regresa al inicio (mantén presionado el botón de arriba) y abre la dirección #/programador.</p>
          </article>

          <article class="panel">
            <h2>${icon('shield-check', 20)} Tus datos</h2>
            <p class="muted">Todo vive solo en este dispositivo. No se guarda video: solo la forma de los labios en números.</p>
            <div class="row">
              <button class="btn btn--soft" type="button" data-export>${icon('download', 18)}<span>Guardar respaldo</span></button>
              <label class="btn btn--soft">${icon('upload', 18)}<span>Cargar respaldo</span><input type="file" accept="application/json" data-import hidden></label>
            </div>
            <button class="btn btn--danger ${wipeArmed ? 'is-armed' : ''}" type="button" data-wipe>${icon('trash', 18)}<span>${wipeArmed ? 'Toca otra vez para borrar todo' : 'Borrar todo'}</span></button>
          </article>
        </div>

        <p class="fineprint">${icon('info', 14)} Voz Propia es una ayuda para comunicarse. No es un dispositivo médico ni reemplaza la atención del personal de salud. Versión ${__APP_VERSION__}.</p>
      </section>`;
  };

  const offs = [
    on(root, 'input', '[data-range]', (_, el) => {
      const key = el.dataset.range as 'rate' | 'pitch' | 'autoSpeakThreshold' | 'maxCaptureMs';
      const v = Number((el as HTMLInputElement).value);
      const out = $(`[data-out="${key}"]`, root);
      out.textContent =
        key === 'rate' ? `${v.toFixed(2)}×` : key === 'pitch' ? v.toFixed(2) : key === 'maxCaptureMs' ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v * 100)}%`;
      void updateSettings({ [key]: v });
    }),
    on(root, 'change', '[data-voice]', (_, el) => void updateSettings({ voiceURI: (el as HTMLSelectElement).value || null })),
    on(root, 'change', '[data-toggle]', (_, el) => void updateSettings({ [el.dataset.toggle!]: (el as HTMLInputElement).checked })),
    on(root, 'click', '[data-test]', () => void speakText('Hola. Esta es mi voz.', state.settings)),
    on(root, 'click', '[data-intro]', () => go('inicio')),
    on(root, 'click', '[data-as-user]', async () => {
      await updateSettings({ role: 'usuario' });
      go('hablar');
    }),
    on(root, 'change', '[data-camera]', (_, el) => void updateSettings({ cameraId: (el as HTMLSelectElement).value || null })),
    on(root, 'click', '[data-export]', () => void exportBackup().then(() => toast('Respaldo descargado.', { tone: 'ok' }))),
    on(root, 'change', '[data-import]', async (_, el) => {
      const f = (el as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        await importBackup(f);
        toast('Respaldo cargado.', { tone: 'ok' });
      } catch (e) {
        toast((e as Error).message || 'No pude leer el respaldo.', { tone: 'warn' });
      }
    }),
    on(root, 'click', '[data-wipe]', async () => {
      if (!wipeArmed) {
        wipeArmed = true;
        render();
        setTimeout(() => {
          wipeArmed = false;
          if (root.isConnected) render();
        }, 4000);
        return;
      }
      wipeArmed = false;
      await db.wipe();
      await updateSettings({ role: 'programador' });
      await engine.reload();
      toast('Se borró todo. Empezamos de cero.', { tone: 'ok' });
    }),
    onVoicesChanged(render),
    engine.onChange(render),
  ];

  render();
  return () => offs.forEach((off) => off());
}
