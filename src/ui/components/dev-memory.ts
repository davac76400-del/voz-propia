import { backupAll, listDeleted, recoverClips, type DeletedClip } from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { toast } from './toast';

interface Row {
  key: string;
  text: string;
  source: string;
  clips: DeletedClip[];
  when: string;
}

const NO_SOURCE = 'Video sin nombre';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Un renglón por palabra y video: lo que se borró junto se recupera junto. */
function group(list: DeletedClip[]): Row[] {
  const map = new Map<string, Row>();
  for (const c of list) {
    const source = c.source_name || NO_SOURCE;
    const key = JSON.stringify([c.text.trim().toLowerCase(), source]);
    const row = map.get(key) ?? map.set(key, { key, text: c.text.trim(), source, clips: [], when: c.borrado_en }).get(key)!;
    row.clips.push(c);
    if (c.borrado_en > row.when) row.when = c.borrado_en;
  }
  return [...map.values()].sort((a, b) => b.when.localeCompare(a.when));
}

/** Baja el respaldo como archivo, por si algún día hace falta una copia fuera de la base. */
async function saveBackup() {
  const data = await backupAll();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `voz-propia-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return data.videos.length;
}

/**
 * Memoria del programador: todo video que se sube queda guardado y, si se borra, aquí se recupera con el mismo
 * contenido. `recovered` recibe los textos recuperados para volver a publicarlos y refrescar la lista.
 */
export function openMemory(recovered: (texts: string[]) => Promise<void>) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet';
  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div><p class="kicker">[ Memoria ]</p><h2>Videos borrados</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>
      <p class="dev-meta">Cada video que subes queda guardado aquí. Si lo borras, no se pierde: lo recuperas con un toque.</p>
      <div class="dev-memory" id="mem-list" aria-live="polite"><p class="dev-empty">Cargando…</p></div>
      <div class="dev-detail__foot">
        <button class="btn btn--soft" type="button" data-all hidden>${icon('undo', 18)}<span>Recuperar todo</span></button>
        <button class="btn btn--ghost" type="button" data-backup>${icon('download', 18)}<span>Guardar respaldo en mi equipo</span></button>
      </div>
    </div>`;

  let rows: Row[] = [];
  const listEl = dlg.querySelector<HTMLElement>('#mem-list')!;
  const allBtn = dlg.querySelector<HTMLButtonElement>('[data-all]')!;

  const render = () => {
    allBtn.hidden = !rows.length;
    allBtn.querySelector('span')!.textContent = `Recuperar todo (${rows.reduce((n, r) => n + r.clips.length, 0)})`;
    listEl.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
      <section class="dev-video">
        <header class="dev-video__head">
          <span class="dev-video__name" title="${esc(r.source)}">${icon('play', 14)}<b>«${esc(r.text)}»</b></span>
          <span class="dev-meta">${esc(r.source === NO_SOURCE ? '' : `${r.source} · `)}${r.clips.length === 1 ? '1 repetición' : `${r.clips.length} repeticiones`} · borrado ${esc(fmt(r.when))}</span>
          <button class="btn btn--soft btn--sm" type="button" data-recover="${esc(r.key)}">${icon('undo', 14)}<span>Recuperar</span></button>
        </header>
      </section>`,
          )
          .join('')
      : `<div class="dev-empty">${icon('shield-check', 28)}<p>No hay videos borrados.</p><p class="dev-meta">Todo lo que subes queda guardado aquí por si lo borras.</p></div>`;
  };

  const load = async () => {
    try {
      rows = group(await listDeleted());
      render();
    } catch (err) {
      listEl.innerHTML = `<div class="dev-empty">${icon('wifi-off', 28)}<p>No se pudo leer la memoria.</p><p class="dev-meta">${esc((err as Error).message)}</p></div>`;
    }
  };

  const recover = async (which: Row[] | null) => {
    const picked = which ?? rows;
    const ids = which ? picked.flatMap((r) => r.clips.map((c) => c.video_id)) : undefined;
    try {
      const n = await recoverClips(ids);
      await recovered(picked.map((r) => r.text));
      toast(n === 1 ? 'Se recuperó 1 repetición.' : `Se recuperaron ${n} repeticiones.`, { tone: 'ok' });
      await load();
    } catch (err) {
      toast(`No se pudo recuperar: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return dlg.close();
    const one = t.closest<HTMLElement>('[data-recover]');
    if (one) return void recover(rows.filter((r) => r.key === one.dataset.recover));
    if (t.closest('[data-all]')) return void recover(null);
    if (t.closest('[data-backup]')) {
      return void saveBackup().then(
        (n) => toast(`Respaldo guardado (${n} repeticiones).`, { tone: 'ok' }),
        (err) => toast(`No se pudo guardar el respaldo: ${(err as Error).message}`, { tone: 'warn' }),
      );
    }
  });
  dlg.addEventListener('close', () => dlg.remove());

  document.body.appendChild(dlg);
  dlg.showModal();
  void load();
}
