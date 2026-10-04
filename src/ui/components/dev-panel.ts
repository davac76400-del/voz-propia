import {
  DEFAULT_FOLDER,
  createFolder,
  deleteClips,
  deleteFolder,
  listClips,
  listFolders,
  moveClips,
  watchDevData,
  type DevClip,
} from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { openVideoImporter } from './video-importer-modal';
import { toast } from './toast';

const ALL = '__all';

interface Group {
  key: string;
  name: string;
  date: string;
  folder: string;
  clips: DevClip[];
}

const idsOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-phrase-ids]')!.dataset.phraseIds!.split(',').map(Number);

/** Los ejemplos de la misma frase dentro de un video se muestran juntos. */
function phraseRows(clips: DevClip[]) {
  const map = new Map<string, DevClip[]>();
  for (const c of [...clips].sort((a, b) => a.start_time - b.start_time)) {
    const key = c.text.trim().toLowerCase();
    (map.get(key) ?? map.set(key, []).get(key)!).push(c);
  }
  return [...map.values()].map((list) => ({
    text: list[0].text,
    clips: list,
    avgMs: list.reduce((n, c) => n + (c.end_time - c.start_time), 0) / list.length,
  }));
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function openDevPanel() {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet dev-sheet--wide';
  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div>
          <p class="kicker">[ Programador ]</p>
          <h2>Mis videos</h2>
        </div>
        <span class="dev-live" id="dev-live" title="Conectado en tiempo real"><i></i>En vivo</span>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>

      <div class="dev-bar">
        <label class="dev-search">
          ${icon('search', 18)}
          <input class="input" id="dev-q" type="search" placeholder="Buscar una frase o un video" autocomplete="off">
        </label>
        <button class="btn btn--primary" id="dev-import" type="button">${icon('upload', 18)}<span>Importar video</span></button>
      </div>

      <div class="dev-layout">
        <nav class="dev-folders" id="dev-folders" aria-label="Carpetas"></nav>
        <section class="dev-main" id="dev-main" aria-live="polite"></section>
      </div>
    </div>`;

  let clips: DevClip[] = [];
  let folders: string[] = [DEFAULT_FOLDER];
  let active = ALL;
  let query = '';
  let loaded = false;
  let failed = '';
  let creating = false;

  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  const foldersEl = q<HTMLElement>('#dev-folders');
  const mainEl = q<HTMLElement>('#dev-main');
  const liveEl = q<HTMLElement>('#dev-live');

  const load = async () => {
    try {
      [clips, folders] = await Promise.all([listClips(), listFolders()]);
      failed = '';
      liveEl.classList.remove('is-off');
    } catch (err) {
      failed = (err as Error).message;
      liveEl.classList.add('is-off');
    }
    loaded = true;
    render();
  };

  const countIn = (f: string) => (f === ALL ? clips.length : clips.filter((c) => c.folder === f).length);

  const renderFolders = () => {
    const names = Array.from(new Set([DEFAULT_FOLDER, ...folders, ...clips.map((c) => c.folder)]));
    if (active !== ALL && !names.includes(active)) active = ALL;
    const item = (id: string, label: string, ic: string) => `
      <div class="dev-folder${id === active ? ' is-active' : ''}">
        <button type="button" class="dev-folder__btn" data-folder="${esc(id)}" aria-pressed="${id === active}">
          ${icon(ic, 18)}<span class="dev-folder__name">${esc(label)}</span><span class="dev-folder__n">${countIn(id)}</span>
        </button>
        ${id !== ALL && id !== DEFAULT_FOLDER ? `<button type="button" class="dev-folder__del" data-del-folder="${esc(id)}" aria-label="Borrar carpeta ${esc(id)}">${icon('trash', 16)}</button>` : ''}
      </div>`;
    foldersEl.innerHTML = `
      <p class="dev-h">Carpetas</p>
      ${item(ALL, 'Todos los videos', 'layout-grid')}
      ${names.map((n) => item(n, n, 'folder')).join('')}
      ${
        creating
          ? `<form class="dev-newform" data-new-form><input class="input" name="n" maxlength="40" placeholder="Nombre de la carpeta" autocomplete="off" required><div class="dev-newform__row"><button class="btn btn--primary btn--sm" type="submit">Crear</button><button class="btn btn--ghost btn--sm" type="button" data-new-cancel>Cancelar</button></div></form>`
          : `<button type="button" class="btn btn--soft btn--sm dev-newfolder" data-new-folder>${icon('folder-plus', 18)}<span>Nueva carpeta</span></button>`
      }`;
    foldersEl.querySelector<HTMLInputElement>('input[name="n"]')?.focus();
  };

  const visibleGroups = (): Group[] => {
    const term = query.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const c of clips) {
      if (active !== ALL && c.folder !== active) continue;
      if (term && !c.text.toLowerCase().includes(term) && !(c.source_name ?? '').toLowerCase().includes(term)) continue;
      const key = `${c.source_name ?? ''}|${c.created_at.slice(0, 15)}|${c.folder}`;
      let g = map.get(key);
      if (!g) {
        g = { key, name: c.source_name || 'Video sin nombre', date: c.created_at, folder: c.folder, clips: [] };
        map.set(key, g);
      }
      g.clips.push(c);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  };

  const renderMain = () => {
    if (!loaded) {
      mainEl.innerHTML = `<p class="dev-empty">Cargando tus videos…</p>`;
      return;
    }
    if (failed) {
      mainEl.innerHTML = `<div class="dev-empty">${icon('wifi-off', 28)}<p>No se pudo conectar con la base de datos.</p><p class="dev-meta">${esc(failed)}</p><button class="btn btn--soft" data-retry type="button">Reintentar</button></div>`;
      return;
    }
    const groups = visibleGroups();
    const title = active === ALL ? 'Todos los videos' : active;
    const total = groups.reduce((n, g) => n + g.clips.length, 0);
    const head = `<div class="dev-main__head"><h3>${esc(title)}</h3><p class="dev-meta">${groups.length} video(s) · ${total} frase(s)</p></div>`;
    if (!groups.length) {
      mainEl.innerHTML = `${head}<div class="dev-empty">${icon('folder', 28)}<p>${
        query ? 'Nada coincide con tu búsqueda.' : 'Esta carpeta está vacía.'
      }</p>${query ? '' : `<button class="btn btn--primary" data-import type="button">${icon('upload', 18)}<span>Importar un video</span></button>`}</div>`;
      return;
    }
    const folderOpts = (sel: string) =>
      Array.from(new Set([DEFAULT_FOLDER, ...folders]))
        .map((f) => `<option value="${esc(f)}"${f === sel ? ' selected' : ''}>${esc(f)}</option>`)
        .join('');
    mainEl.innerHTML =
      head +
      groups
        .map(
          (g) => `
      <article class="dev-group" data-ids="${g.clips.map((c) => c.id).join(',')}">
        <header class="dev-group__head">
          <span class="dev-group__ic">${icon('play', 18)}</span>
          <div class="dev-group__title">
            <h4>${esc(g.name)}</h4>
            <p class="dev-meta">${phraseRows(g.clips).length} frase(s) · ${g.clips.length} ejemplo(s) · ${fmtDate(g.date)}${active === ALL ? ` · ${esc(g.folder)}` : ''}</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" data-del-group>${icon('trash', 16)}<span>Borrar video</span></button>
        </header>
        <ul class="dev-phrases">
          ${phraseRows(g.clips)
            .map(
              (row) => `
            <li class="dev-phrase" data-phrase-ids="${row.clips.map((c) => c.id).join(',')}">
              <div class="dev-phrase__body">
                <p class="dev-phrase__text">${esc(row.text)}</p>
                <p class="dev-meta">${row.clips.length === 1 ? '1 ejemplo' : `${row.clips.length} ejemplos`} · ${(row.avgMs / 1000).toFixed(1)} s cada uno</p>
              </div>
              <select class="input dev-move" data-move aria-label="Mover a otra carpeta">${folderOpts(row.clips[0].folder)}</select>
              <button class="icon-btn dev-del" type="button" data-del aria-label="Borrar ${row.clips.length === 1 ? 'el ejemplo' : 'los ejemplos'}">${icon('trash', 18)}</button>
            </li>`,
            )
            .join('')}
        </ul>
      </article>`,
        )
        .join('');
  };

  const render = () => {
    renderFolders();
    renderMain();
  };

  const guard = async (fn: () => Promise<void>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) toast(okMsg, { tone: 'ok' });
      await load();
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  const arm = (btn: HTMLElement, label: string, run: () => void) => {
    if (btn.dataset.armed) return run();
    btn.dataset.armed = '1';
    const old = btn.innerHTML;
    btn.classList.add('is-armed');
    btn.innerHTML = `<span>${label}</span>`;
    setTimeout(() => {
      if (!btn.isConnected) return;
      delete btn.dataset.armed;
      btn.classList.remove('is-armed');
      btn.innerHTML = old;
    }, 3000);
  };

  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return close();

    const fBtn = t.closest<HTMLElement>('[data-folder]');
    if (fBtn) {
      active = fBtn.dataset.folder!;
      return render();
    }
    if (t.closest('#dev-import') || t.closest('[data-import]')) {
      return void openVideoImporter(active === ALL ? DEFAULT_FOLDER : active);
    }
    if (t.closest('[data-retry]')) return void load();

    if (t.closest('[data-new-folder]')) {
      creating = true;
      return renderFolders();
    }
    if (t.closest('[data-new-cancel]')) {
      creating = false;
      return renderFolders();
    }

    const delFolder = t.closest<HTMLElement>('[data-del-folder]');
    if (delFolder) {
      const name = delFolder.dataset.delFolder!;
      return arm(delFolder, '¿Seguro?', () =>
        void guard(() => deleteFolder(name), `Carpeta «${name}» borrada. Sus frases pasaron a «${DEFAULT_FOLDER}».`),
      );
    }

    const delGroup = t.closest<HTMLElement>('[data-del-group]');
    if (delGroup) {
      const ids = delGroup.closest<HTMLElement>('[data-ids]')!.dataset.ids!.split(',').map(Number);
      return arm(delGroup, '¿Borrar todo?', () => void guard(() => deleteClips(ids), 'Video borrado.'));
    }

    const del = t.closest<HTMLElement>('[data-del]');
    if (del) {
      const ids = idsOf(del);
      return arm(del, '¿Borrar?', () => void guard(() => deleteClips(ids), ids.length === 1 ? 'Ejemplo borrado.' : 'Frase borrada.'));
    }
  });

  dlg.addEventListener('submit', (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-new-form]');
    if (!form) return;
    e.preventDefault();
    const name = (new FormData(form).get('n') as string).trim().slice(0, 40);
    creating = false;
    renderFolders();
    if (!name) return;
    if (folders.includes(name)) return void toast('Esa carpeta ya existe.', { tone: 'warn' });
    void guard(() => createFolder(name), `Carpeta «${name}» creada.`);
  });

  dlg.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-move]');
    if (!sel) return;
    void guard(() => moveClips(idsOf(sel), sel.value), `Movida a «${sel.value}».`);
  });

  q<HTMLInputElement>('#dev-q').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    renderMain();
  });

  const stop = watchDevData(() => void load());
  const close = () => {
    stop();
    dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('close', () => {
    stop();
    dlg.remove();
  });

  document.body.appendChild(dlg);
  dlg.showModal();
  render();
  void load();
}
