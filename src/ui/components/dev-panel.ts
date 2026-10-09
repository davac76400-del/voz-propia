import {
  DEFAULT_FOLDER,
  createFolder,
  deleteClips,
  deleteFolder,
  listClips,
  listFolders,
  mergeClips,
  moveClips,
  recoverClips,
  restoreClips,
  SIN_PERMISO,
  soyProgramador,
  unmergeClips,
  watchDevData,
  type DevClip,
} from '../../core/supabase';
import { esc } from '../dom';
import { icon } from '../icons';
import { publishPhrase, syncShared } from '../../core/shared-sync';
import { openDevGate } from './dev-gate';
import { openPrecision } from './dev-eval';
import { openMemory } from './dev-memory';
import { openVideoImporter } from './video-importer-modal';
import { toast } from './toast';

const ALL = '__all';

interface Item {
  key: string;
  text: string;
  folder: string;
  clips: DevClip[];
  sources: { name: string; n: number }[];
  /** Nombres con los que se fusionó (para poder desfusionar). */
  merged: string[];
  latest: string;
}

const keyOf = (t: string) => t.trim().toLowerCase();

function majority(values: string[]) {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_FOLDER;
}

/** Una tarjeta por palabra: los videos y personas que dijeron lo mismo se juntan solos. */
function buildItems(clips: DevClip[], folder: string, term: string): Item[] {
  const map = new Map<string, Item>();
  for (const c of clips) {
    if (folder !== ALL && c.folder !== folder) continue;
    const key = keyOf(c.text);
    const it = map.get(key) ?? map.set(key, { key, text: c.text.trim(), folder: c.folder, clips: [], sources: [], merged: [], latest: c.created_at }).get(key)!;
    it.clips.push(c);
    if (c.created_at > it.latest) it.latest = c.created_at;
  }
  const out: Item[] = [];
  for (const it of map.values()) {
    const src = new Map<string, number>();
    for (const c of it.clips) {
      const name = c.source_name || 'Video sin nombre';
      src.set(name, (src.get(name) ?? 0) + 1);
    }
    it.sources = [...src].map(([name, n]) => ({ name, n }));
    it.merged = [...new Set(it.clips.filter((c) => c.orig_text && keyOf(c.orig_text) !== it.key).map((c) => c.orig_text!))];
    it.folder = majority(it.clips.map((c) => c.folder));
    if (term) {
      const hay = [it.text, ...it.merged, ...it.sources.map((x) => x.name)].join(' ').toLowerCase();
      if (!hay.includes(term)) continue;
    }
    out.push(it);
  }
  return out.sort((a, b) => b.latest.localeCompare(a.latest));
}

export function openDevPanel() {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet dev-sheet--wide';
  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div>
          <p class="kicker">[ Programador ]</p>
          <h2>Mis palabras</h2>
        </div>
        <span class="dev-live" id="dev-live" title="Conectado en tiempo real"><i></i>En vivo</span>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>

      <div class="dev-bar">
        <label class="dev-search">
          ${icon('search', 18)}
          <input class="input" id="dev-q" type="search" placeholder="Buscar una palabra o un video" autocomplete="off">
        </label>
        <button class="btn btn--soft" id="dev-eval" type="button">${icon('gauge', 18)}<span>Probar precisión</span></button>
        <button class="btn btn--soft" id="dev-memory" type="button">${icon('shield-check', 18)}<span>Memoria</span></button>
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
  /** La base muestra «vacío» cuando la sesión no es de programador: se avisa en vez de aparentar que se borró todo. */
  let noSession = false;
  let creating = false;
  let menu: { key: string; mode: 'main' | 'merge' } | null = null;
  /** Palabras con el detalle de videos y repeticiones abierto, y repeticiones marcadas para borrar. */
  const opened = new Set<string>();
  const marked = new Set<number>();

  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  const foldersEl = q<HTMLElement>('#dev-folders');
  const mainEl = q<HTMLElement>('#dev-main');
  const liveEl = q<HTMLElement>('#dev-live');

  const load = async () => {
    try {
      [clips, folders] = await Promise.all([listClips(), listFolders()]);
      failed = '';
      noSession = !clips.length && !(await soyProgramador().catch(() => false));
      liveEl.classList.remove('is-off');
    } catch (err) {
      failed = (err as Error).message;
      liveEl.classList.add('is-off');
    }
    loaded = true;
    render();
  };

  const countIn = (f: string) => new Set(clips.filter((c) => f === ALL || c.folder === f).map((c) => keyOf(c.text))).size;
  const clipsOf = (key: string) => clips.filter((c) => keyOf(c.text) === key);

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
      ${item(ALL, 'Todas las palabras', 'layout-grid')}
      ${names.map((n) => item(n, n, 'folder')).join('')}
      ${
        creating
          ? `<form class="dev-newform" data-new-form><input class="input" name="n" maxlength="40" placeholder="Nombre de la carpeta" autocomplete="off" required><div class="dev-newform__row"><button class="btn btn--primary btn--sm" type="submit">Crear</button><button class="btn btn--ghost btn--sm" type="button" data-new-cancel>Cancelar</button></div></form>`
          : `<button type="button" class="btn btn--soft btn--sm dev-newfolder" data-new-folder>${icon('folder-plus', 18)}<span>Nueva carpeta</span></button>`
      }`;
    foldersEl.querySelector<HTMLInputElement>('input[name="n"]')?.focus();
  };

  const folderOpts = (sel: string) =>
    Array.from(new Set([DEFAULT_FOLDER, ...folders]))
      .map((f) => `<option value="${esc(f)}"${f === sel ? ' selected' : ''}>${esc(f)}</option>`)
      .join('');

  const renderMenu = (it: Item, all: Item[]) => {
    if (!menu || menu.key !== it.key) return '';
    if (menu.mode === 'merge') {
      const others = all.filter((o) => o.key !== it.key);
      return `<div class="dev-menu" role="menu" data-menu-box>
        <p class="dev-menu__h">Fusionar «${esc(it.text)}» con:</p>
        ${others.length ? others.map((o) => `<button class="dev-menu__item" role="menuitem" type="button" data-merge-into="${esc(o.key)}">${icon('layout-grid', 16)}<span>${esc(o.text)}</span></button>`).join('') : `<p class="dev-meta dev-menu__empty">No hay otra palabra con la cual fusionar.</p>`}
        <button class="dev-menu__item dev-menu__back" role="menuitem" type="button" data-menu-back>${icon('arrow-left', 16)}<span>Volver</span></button>
      </div>`;
    }
    return `<div class="dev-menu" role="menu" data-menu-box>
      <button class="dev-menu__item" role="menuitem" type="button" data-act="detail">${icon('play', 16)}<span>Ver videos y repeticiones</span></button>
      <button class="dev-menu__item" role="menuitem" type="button" data-act="merge">${icon('plus', 16)}<span>Fusionar con otra palabra…</span></button>
      ${it.merged.length ? `<button class="dev-menu__item" role="menuitem" type="button" data-act="unmerge">${icon('undo', 16)}<span>Desfusionar</span></button>` : ''}
      <button class="dev-menu__item dev-menu__item--danger" role="menuitem" type="button" data-act="delete">${icon('trash', 16)}<span>Eliminar</span></button>
    </div>`;
  };

  const fmtT = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

  /** Videos de la palabra y, dentro de cada uno, sus repeticiones: se puede borrar todo, un video o repeticiones sueltas. */
  const renderDetail = (it: Item) => {
    const byVideo = new Map<string, DevClip[]>();
    for (const c of it.clips) {
      const name = c.source_name || 'Video sin nombre';
      (byVideo.get(name) ?? byVideo.set(name, []).get(name)!).push(c);
    }
    const picked = it.clips.filter((c) => marked.has(c.id)).length;
    return `<div class="dev-detail">
      ${[...byVideo]
        .map(
          ([name, list]) => `
        <section class="dev-video" data-video="${esc(name)}">
          <header class="dev-video__head">
            <span class="dev-video__name" title="${esc(name)}">${icon('play', 14)}<b>${esc(name)}</b></span>
            <span class="dev-meta">${list.length === 1 ? '1 repetición' : `${list.length} repeticiones`}</span>
            <button class="btn btn--ghost btn--sm dev-video__del" type="button" data-del-video="${esc(name)}">${icon('trash', 14)}<span>Borrar video</span></button>
          </header>
          <ul class="dev-reps">
            ${[...list]
              .sort((a, b) => a.start_time - b.start_time)
              .map(
                (c, k) => `<li><label class="dev-rep${marked.has(c.id) ? ' is-marked' : ''}"><input type="checkbox" data-rep="${c.id}"${marked.has(c.id) ? ' checked' : ''}><span>#${k + 1}</span><em>${fmtT(c.start_time)} · ${fmtT(c.end_time - c.start_time)}</em></label></li>`,
              )
              .join('')}
          </ul>
        </section>`,
        )
        .join('')}
      <div class="dev-detail__foot">
        <button class="btn btn--soft btn--sm" type="button" data-del-reps ${picked ? '' : 'disabled'}>${icon('trash', 16)}<span>Borrar ${picked ? `${picked} marcada${picked > 1 ? 's' : ''}` : 'repeticiones marcadas'}</span></button>
        <button class="btn btn--ghost btn--sm" type="button" data-close-detail>Cerrar detalle</button>
      </div>
    </div>`;
  };

  const renderMain = () => {
    if (!loaded) {
      mainEl.innerHTML = `<p class="dev-empty">Cargando tus palabras…</p>`;
      return;
    }
    if (failed) {
      mainEl.innerHTML = `<div class="dev-empty">${icon('wifi-off', 28)}<p>No se pudo conectar con la base de datos.</p><p class="dev-meta">${esc(failed)}</p><button class="btn btn--soft" data-retry type="button">Reintentar</button></div>`;
      return;
    }
    if (noSession) {
      mainEl.innerHTML = `<div class="dev-empty">${icon('lock', 28)}<p>Tus videos no se ven en esta sesión.</p><p class="dev-meta">${esc(SIN_PERMISO)}</p><button class="btn btn--primary" data-login type="button">${icon('log-in', 18)}<span>Entrar como programador</span></button></div>`;
      return;
    }
    const items = buildItems(clips, active, query.trim().toLowerCase());
    const everything = buildItems(clips, ALL, '');
    const title = active === ALL ? 'Todas las palabras' : active;
    const total = items.reduce((n, it) => n + it.clips.length, 0);
    const head = `<div class="dev-main__head"><h3>${esc(title)}</h3><p class="dev-meta">${items.length} palabra(s) · ${total} ejemplo(s)</p></div>`;
    if (!items.length) {
      mainEl.innerHTML = `${head}<div class="dev-empty">${icon('folder', 28)}<p>${
        query ? 'Nada coincide con tu búsqueda.' : 'Esta carpeta está vacía.'
      }</p>${query ? '' : `<button class="btn btn--primary" data-import type="button">${icon('upload', 18)}<span>Importar un video</span></button>`}</div>`;
      return;
    }
    mainEl.innerHTML =
      head +
      `<p class="dev-meta dev-tip">Arrastra una palabra sobre otra para fusionarlas. Con los tres puntos puedes desfusionar o eliminar.</p>` +
      items
        .map(
          (it) => `
      <article class="dev-card" data-key="${esc(it.key)}">
        <button class="dev-grip" type="button" data-grip aria-label="Arrastrar «${esc(it.text)}» para fusionarla con otra palabra">${icon('layout-grid', 18)}</button>
        <div class="dev-card__body">
          <h4 class="dev-card__title">${esc(it.text)}${it.merged.length ? `<span class="dev-badge">Fusionada con ${it.merged.map((m) => `«${esc(m)}»`).join(', ')}</span>` : ''}</h4>
          <p class="dev-meta">${it.clips.length === 1 ? '1 ejemplo' : `${it.clips.length} ejemplos`} · ${it.sources.length === 1 ? '1 video' : `${it.sources.length} videos`} · <button class="dev-link" type="button" data-open-detail>${opened.has(it.key) ? 'detalle abierto' : 'ver videos y repeticiones'}</button></p>
          <ul class="dev-chips">${it.sources.map((s) => `<li title="${esc(s.name)}">${icon('play', 12)}<span>${esc(s.name)}</span><b>${s.n}</b></li>`).join('')}</ul>
        </div>
        <select class="input dev-move" data-move aria-label="Carpeta de «${esc(it.text)}»">${folderOpts(it.folder)}</select>
        <div class="dev-card__menu">
          <button class="icon-btn" type="button" data-menu aria-haspopup="menu" aria-expanded="${menu?.key === it.key}" aria-label="Más opciones de «${esc(it.text)}»">${icon('more', 20)}</button>
          ${renderMenu(it, everything)}
        </div>
        ${opened.has(it.key) ? renderDetail(it) : ''}
      </article>`,
        )
        .join('');
  };

  const render = () => {
    renderFolders();
    renderMain();
  };

  /** Lo que cambia también se actualiza para todos los dispositivos. */
  const publish = async (texts: string[]) => {
    try {
      for (const t of [...new Set(texts.map((x) => x.trim()).filter(Boolean))]) await publishPhrase(t);
      await syncShared();
    } catch (err) {
      toast(`Se guardó aquí, pero no se pudo publicar para todos: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  const guard = async (fn: () => Promise<void>, okMsg?: string, texts: string[] = []) => {
    try {
      await fn();
      if (texts.length) await publish(texts);
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

  const textsOfClips = (list: DevClip[]) => list.flatMap((c) => [c.text, ...(c.orig_text ? [c.orig_text] : [])]);

  /** Borrar nunca es para siempre: lo borrado queda en la memoria y «Deshacer» (o el botón Memoria) lo trae de vuelta. */
  const removeClips = async (list: DevClip[], msg: string) => {
    const ids = list.map((c) => c.id);
    const texts = textsOfClips(list);
    try {
      await deleteClips(ids);
      await publish(texts);
      await load();
      toast(`${msg} Sigue en la memoria.`, {
        tone: 'ok',
        ms: 12000,
        action: {
          label: 'Deshacer',
          run: () =>
            void (async () => {
              try {
                await recoverClips(ids);
                await publish(texts);
                await load();
                toast('Recuperado.', { tone: 'ok' });
              } catch (err) {
                toast(`No se pudo recuperar: ${(err as Error).message}`, { tone: 'warn' });
              }
            })(),
        },
      });
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  /** Fusiona la palabra `fromKey` dentro de `intoKey`, con «Deshacer». */
  const merge = async (fromKey: string, intoKey: string) => {
    const from = clipsOf(fromKey);
    const into = clipsOf(intoKey);
    if (!from.length || !into.length || fromKey === intoKey) return;
    const intoText = into[0].text.trim();
    const intoFolder = majority(into.map((c) => c.folder));
    const fromText = from[0].text.trim();
    const before = from.map((c) => ({ ...c }));
    const texts = [...textsOfClips(from), intoText];
    menu = null;
    try {
      await mergeClips(from, intoText, intoFolder);
      await publish(texts);
      await load();
      toast(`«${fromText}» se fusionó con «${intoText}».`, {
        tone: 'ok',
        ms: 9000,
        action: {
          label: 'Deshacer',
          run: () =>
            void (async () => {
              try {
                await restoreClips(before);
                await publish(texts);
                await load();
              } catch (err) {
                toast(`No se pudo deshacer: ${(err as Error).message}`, { tone: 'warn' });
              }
            })(),
        },
      });
    } catch (err) {
      toast(`No se pudo fusionar: ${(err as Error).message}`, { tone: 'warn' });
    }
  };

  const keyFrom = (el: HTMLElement) => el.closest<HTMLElement>('[data-key]')?.dataset.key ?? '';
  const itemClips = (key: string) => (active === ALL ? clipsOf(key) : clipsOf(key).filter((c) => c.folder === active));

  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return close();

    if (menu && !t.closest('[data-menu-box]') && !t.closest('[data-menu]')) {
      menu = null;
      renderMain();
    }

    const fBtn = t.closest<HTMLElement>('[data-folder]');
    if (fBtn) {
      active = fBtn.dataset.folder!;
      menu = null;
      return render();
    }
    if (t.closest('#dev-import') || t.closest('[data-import]')) {
      return void openVideoImporter(active === ALL ? DEFAULT_FOLDER : active);
    }
    if (t.closest('#dev-eval')) return void openPrecision();
    if (t.closest('#dev-memory')) {
      return openMemory(async (texts) => {
        await publish(texts);
        await load();
      });
    }
    if (t.closest('[data-login]')) return openDevGate(() => void load());
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
      const texts = clips.filter((c) => c.folder === name).map((c) => c.text);
      return arm(delFolder, '¿Seguro?', () =>
        void guard(() => deleteFolder(name), `Carpeta «${name}» borrada. Sus palabras pasaron a «${DEFAULT_FOLDER}».`, texts),
      );
    }

    const dots = t.closest<HTMLElement>('[data-menu]');
    if (dots) {
      const key = keyFrom(dots);
      menu = menu?.key === key ? null : { key, mode: 'main' };
      return renderMain();
    }
    if (t.closest('[data-menu-back]')) {
      if (menu) menu.mode = 'main';
      return renderMain();
    }
    const act = t.closest<HTMLElement>('[data-act]');
    if (act && menu) {
      const key = menu.key;
      const what = act.dataset.act;
      if (what === 'merge') {
        menu.mode = 'merge';
        return renderMain();
      }
      if (what === 'detail') {
        opened.add(key);
        menu = null;
        return renderMain();
      }
      if (what === 'unmerge') {
        const list = itemClips(key);
        const texts = textsOfClips(list);
        menu = null;
        return void guard(() => unmergeClips(list), 'Se desfusionó: cada palabra volvió a ser como antes.', texts);
      }
      if (what === 'delete') {
        const list = itemClips(key);
        return arm(act, '¿Seguro? Se borra todo', () => {
          menu = null;
          void removeClips(list, list.length === 1 ? 'Ejemplo eliminado.' : 'Palabra eliminada.');
        });
      }
    }
    const chipsBtn = t.closest<HTMLElement>('[data-open-detail]');
    if (chipsBtn) {
      opened.add(keyFrom(chipsBtn));
      return renderMain();
    }
    if (t.closest('[data-close-detail]')) {
      const key = keyFrom(t);
      opened.delete(key);
      for (const c of clipsOf(key)) marked.delete(c.id);
      return renderMain();
    }
    const delVideo = t.closest<HTMLElement>('[data-del-video]');
    if (delVideo) {
      const key = keyFrom(delVideo);
      const name = delVideo.dataset.delVideo!;
      const list = itemClips(key).filter((c) => (c.source_name || 'Video sin nombre') === name);
      return arm(delVideo, '¿Seguro?', () => {
        for (const c of list) marked.delete(c.id);
        void removeClips(list, `Video «${name}» borrado (${list.length} repetición${list.length === 1 ? '' : 'es'}).`);
      });
    }
    const delReps = t.closest<HTMLElement>('[data-del-reps]');
    if (delReps) {
      const list = clipsOf(keyFrom(delReps)).filter((c) => marked.has(c.id));
      if (!list.length) return;
      return arm(delReps, '¿Seguro? Se borran', () => {
        for (const c of list) marked.delete(c.id);
        void removeClips(list, list.length === 1 ? 'Repetición borrada.' : `${list.length} repeticiones borradas.`);
      });
    }
    const into = t.closest<HTMLElement>('[data-merge-into]');
    if (into && menu) return void merge(menu.key, into.dataset.mergeInto!);
  });

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu) {
      e.preventDefault();
      e.stopPropagation();
      menu = null;
      renderMain();
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
    const box = (e.target as HTMLElement).closest<HTMLInputElement>('[data-rep]');
    if (box) {
      const id = Number(box.dataset.rep);
      if (box.checked) marked.add(id);
      else marked.delete(id);
      return renderMain();
    }
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-move]');
    if (!sel) return;
    const list = itemClips(keyFrom(sel));
    const ids = list.map((c) => c.id);
    void guard(() => moveClips(ids, sel.value), `«${list[0]?.text.trim() ?? ''}» pasó a «${sel.value}».`, textsOfClips(list));
  });

  q<HTMLInputElement>('#dev-q').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    renderMain();
  });

  /* ---------- Arrastrar una palabra sobre otra para fusionarlas (mouse y dedo) ---------- */

  let drag: { key: string; ghost: HTMLElement; target: string; pid: number; grip: HTMLElement } | null = null;

  const endDrag = () => {
    if (!drag) return;
    drag.ghost.remove();
    dlg.querySelectorAll('.is-drop').forEach((n) => n.classList.remove('is-drop'));
    dlg.querySelector('.dev-card.is-dragging')?.classList.remove('is-dragging');
    drag = null;
  };

  dlg.addEventListener('pointerdown', (e) => {
    const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]');
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const card = grip.closest<HTMLElement>('.dev-card')!;
    const ghost = document.createElement('div');
    ghost.className = 'dev-ghost';
    ghost.textContent = card.querySelector('.dev-card__title')?.firstChild?.textContent ?? '';
    dlg.appendChild(ghost);
    card.classList.add('is-dragging');
    grip.setPointerCapture(e.pointerId);
    drag = { key: card.dataset.key!, ghost, target: '', pid: e.pointerId, grip };
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
  });

  dlg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.dev-card');
    const target = under && under.dataset.key !== drag.key ? under.dataset.key! : '';
    if (target !== drag.target) {
      dlg.querySelectorAll('.is-drop').forEach((n) => n.classList.remove('is-drop'));
      if (target) under!.classList.add('is-drop');
      drag.target = target;
    }
  });

  dlg.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const { key, target } = drag;
    endDrag();
    if (target) void merge(key, target);
  });
  dlg.addEventListener('pointercancel', endDrag);

  const stop = watchDevData(() => void load());
  const close = () => {
    stop();
    endDrag();
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
