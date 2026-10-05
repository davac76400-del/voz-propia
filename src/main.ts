import '@fontsource-variable/raleway/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/views.css';
import './ui/styles/guia.css';
import './ui/styles/ayuda.css';
import './ui/styles/consejos.css';
import './ui/styles/dev.css';
import './ui/styles/usar.css';

import { go, hashRoute, startRouter, type Route, type View } from './app/router';
import { loadSettings, state, updateSettings } from './app/state';
import { session } from './core/auth';
import { engine } from './core/engine';
import { syncShared, watchShared } from './core/shared-sync';
import { db } from './core/storage/db';
import type { Role } from './core/types';
import { tracker } from './core/vision/face-tracker';
import { brandMark } from './ui/brand';
import { currentTheme, loadTheme } from './ui/components/theme';
import { enableTilt } from './ui/components/tilt';
import { bindWaterBack, waterBackHTML } from './ui/components/water-back';
import { toast } from './ui/components/toast';
import { icon } from './ui/icons';
import { ajustesView } from './ui/views/ajustes';
import { ayudaView } from './ui/views/ayuda';
import { entrenarView } from './ui/views/entrenar';
import { guiaView } from './ui/views/guia';
import { hablarView } from './ui/views/hablar';
import { consejosView } from './ui/views/consejos';
import { panelView } from './ui/views/panel';
import { tableroView } from './ui/views/tablero';
import { usarView } from './ui/views/usar';

type Kind = Role | 'inicio';

interface Mode {
  home: Route;
  views: Partial<Record<Route, View>>;
  nav: [Route, string, string][];
}

const MODES: Record<Role, Mode> = {
  usuario: {
    home: 'guia',
    views: { guia: guiaView, usar: usarView, ayuda: ayudaView, consejos: consejosView },
    nav: [],
  },
  programador: {
    home: 'panel',
    views: { panel: panelView, entrenar: entrenarView, hablar: hablarView, tablero: tableroView, ajustes: ajustesView },
    nav: [
      ['panel', 'dashboard', 'Panel'],
      ['entrenar', 'sparkles', 'Entrenar'],
      ['hablar', 'scan-face', 'Probar'],
      ['tablero', 'layout-grid', 'Tablero'],
      ['ajustes', 'settings', 'Ajustes'],
    ],
  },
};

const PRO_ROUTES = new Set(['panel', 'entrenar', 'hablar', 'tablero', 'ajustes', 'programador']);

const THEME_COLOR: Record<Kind, string> = { inicio: '#ECEFFF', usuario: '#05080A', programador: '#04060F' };

const app = document.getElementById('app')!;
let mounted: { kind: Kind; unmount: () => void } | null = null;
let routing = 0;

/* ---------- Instalación como app ---------- */

let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as typeof installPrompt;
  document.querySelectorAll<HTMLElement>('[data-install]').forEach((b) => (b.hidden = false));
});

/* ---------- Shell de la app (usuario o programador) ---------- */

function shell(role: Role) {
  const m = MODES[role];
  const links = m.nav
    .map(([r, ic, label]) => `<a class="nav__item" href="#/${r}" data-route="${r}">${icon(ic, 22)}<span>${label}</span></a>`)
    .join('');
  const pro = role === 'programador';
  app.innerHTML = `
    <div class="ambient" aria-hidden="true">${
      pro ? '<i class="stars"></i><i class="stars stars--far"></i><i class="horizon"></i>' : '<i class="s1"></i><i class="s2"></i><i class="s3"></i>'
    }</div>
    <header class="topbar">
      <a class="brand" href="#/${m.home}" aria-label="Voz Propia, inicio de la sección">${brandMark()}<span class="brand__word">Voz Propia</span>${
        pro ? `<span class="mode-badge">${icon('code', 13, 2.4)}Programador</span>` : ''
      }</a>
      ${pro ? '' : acctHTML()}
      ${pro ? `<nav class="topnav" aria-label="Secciones">${links}</nav>` : ''}
      <div class="topbar__right">
        <span class="chip chip--net" data-net hidden>${icon('wifi-off', 14)} Sin internet · todo funciona</span>
        <button class="btn btn--soft btn--sm" type="button" data-install ${installPrompt ? '' : 'hidden'}>${icon('download', 16)}<span>Instalar</span></button>
        ${
          pro
            ? `<a class="btn btn--ghost btn--sm" href="#/inicio" title="Volver al inicio">${icon('house', 16)}<span class="hide-sm">Inicio</span></a>`
            : waterBackHTML()
        }
      </div>
    </header>
    <main id="view" class="main" tabindex="-1"></main>
    ${m.nav.length ? `<nav class="dock dock--${m.nav.length}" aria-label="Secciones">${links}</nav>` : ''}`;
}

/** Botón de cuenta dentro de la app: abre la cuenta (cambiar de cuenta, iniciar sesión o crear una). */
function acctHTML() {
  const s = session();
  const name = !s ? 'Cuenta' : s.kind === 'invitado' ? 'Invitado' : s.name.split(' ')[0];
  return `<a class="btn btn--ghost btn--sm app-acct" href="#/inicio/cuenta" data-app-acct aria-label="Cuenta: ${name}. Cambiar de cuenta">${icon('user', 16)}<span class="hide-sm">${name}</span></a>`;
}

function mountApp(role: Role) {
  shell(role);
  const ac = new AbortController();
  const net = app.querySelector<HTMLElement>('[data-net]')!;
  const updateNet = () => (net.hidden = navigator.onLine);
  addEventListener('online', updateNet, { signal: ac.signal });
  addEventListener('offline', updateNet, { signal: ac.signal });
  updateNet();

  app.addEventListener(
    'click',
    async (e) => {
      const t = e.target as Element;
      if (t.closest('[data-app-acct]')) lastPage = hashRoute();
      if (t.closest('[data-install]')) {
        app.querySelectorAll<HTMLElement>('[data-install]').forEach((b) => (b.hidden = true));
        await installPrompt?.prompt();
        installPrompt = null;
      }
    },
    { signal: ac.signal },
  );

  const unbindBack = role === 'usuario' ? bindWaterBack(app.querySelector<HTMLElement>('[data-water-back]')!, () => go('inicio/elegir')) : () => {};

  const stopRouter = startRouter(app.querySelector<HTMLElement>('#view')!, MODES[role].views, MODES[role].home);

  // Precarga del lector de labios en segundo plano: la cámara abre al instante después.
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
  idle(() => void tracker.preload().catch(() => {}));

  return () => {
    ac.abort();
    unbindBack();
    stopRouter();
    tracker.stop();
    app.innerHTML = '';
  };
}

/* ---------- Qué se muestra: el inicio o la app en su modo ---------- */

let lastPage = '';

async function chooseRole(role: Role, page?: Route) {
  await updateSettings({ role });
  history.replaceState(null, '', `#/${page ?? MODES[role].home}`);
  await route();
}

async function route() {
  let h = hashRoute();
  // Entrada discreta para quien prepara la app: no aparece en el menú de elección.
  if (h === 'programador') {
    await updateSettings({ role: 'programador' });
    history.replaceState(null, '', '#/panel');
    h = 'panel';
  }
  const kind: Kind = h.startsWith('inicio') || !state.settings.role ? 'inicio' : state.settings.role;
  if (mounted?.kind === kind) return;
  const token = ++routing;
  mounted?.unmount();
  mounted = null;
  document.documentElement.dataset.mode = kind;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', kind === 'usuario' ? currentTheme().ink : THEME_COLOR[kind]);
  scrollTo({ top: 0 });
  if (kind === 'inicio') {
    const { mountLanding } = await import('./ui/landing/landing');
    if (token !== routing) return;
    mounted = { kind, unmount: mountLanding(app, {
        jumpToRoles: h === 'inicio/elegir',
        account: h === 'inicio/cuenta',
        onReturn: () => void chooseRole('usuario', (lastPage || undefined) as Route | undefined),
        onChoose: (r, page) => void chooseRole(r, page),
      }) };
  } else {
    mounted = { kind, unmount: mountApp(kind) };
  }
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || window.top !== window.self) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const hadController = !!navigator.serviceWorker.controller;
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'activated' && !hadController) toast('Lista para usarse sin internet.', { tone: 'ok' });
        });
      });
      void reg.update();
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return;
        reloaded = true;
        location.reload();
      });
    })
    .catch(() => {
      // Sin service worker la app sigue funcionando en línea.
    });
}

/**
 * En vista previa (la app dentro de otra página) se reinicia sola cuando se cierra y se vuelve a abrir:
 * así siempre empieza desde cero, con el cargador. Fuera de una vista previa no hace nada.
 */
function restartWhenReopened() {
  if (window.top === window.self) return;
  const restart = () => {
    history.replaceState(null, '', '#/inicio');
    location.reload();
  };
  let hiddenAt = 0;
  let coveredAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 8000) restart();
    else hiddenAt = 0;
  });
  addEventListener('pageshow', (e) => e.persisted && restart());
  new ResizeObserver(([e]) => {
    const gone = e.contentRect.width === 0 || e.contentRect.height === 0;
    if (gone) coveredAt ||= Date.now();
    else if (coveredAt && Date.now() - coveredAt > 1200) restart();
    else coveredAt = 0;
  }).observe(document.documentElement);
}

async function boot() {
  loadTheme();
  enableTilt(document.body);
  await loadSettings();
  await engine.load();
  void syncShared();
  watchShared();
  addEventListener('hashchange', () => void route());
  // Siempre se abre en el inicio (con su cargador); solo el modo programador conserva su dirección.
  const first = hashRoute().split('/')[0];
  if (!PRO_ROUTES.has(first)) history.replaceState(null, '', '#/inicio');
  await route();
  document.documentElement.classList.add('is-ready');
  if (!(await db.persistent())) {
    toast('Este navegador no deja guardar datos aquí. Tus frases se borrarán al cerrar la página.', { tone: 'warn', ms: 8000 });
  }
  registerServiceWorker();
  restartWhenReopened();
}

void boot();
