import { $$ } from '../ui/dom';

export type Route = 'guia' | 'usar' | 'ayuda' | 'consejos' | 'panel' | 'hablar' | 'tablero' | 'entrenar' | 'ajustes';
export type View = (el: HTMLElement) => (() => void) | void;

export const hashRoute = () => location.hash.replace(/^#\/?/, '');

/** `inicio/elegir` abre el inicio directo en la elección de modo. */
export function go(r: Route | 'inicio' | 'inicio/elegir') {
  if (location.hash !== `#/${r}`) location.hash = `#/${r}`;
}

/**
 * Enruta solo entre las vistas que el modo actual permite. Una ruta ajena (por ejemplo «entrenar» en modo
 * usuario) cae en la vista inicial del modo. Devuelve una función para detenerlo al cambiar de modo.
 */
export function startRouter(outlet: HTMLElement, views: Partial<Record<Route, View>>, fallback: Route) {
  let current: Route | null = null;
  let cleanup: (() => void) | void;

  const render = () => {
    const wanted = hashRoute();
    if (wanted.startsWith('inicio')) return;
    const r = (wanted in views ? wanted : fallback) as Route;
    if (wanted !== r) history.replaceState(null, '', `#/${r}`);
    if (r === current) return;
    const swap = () => {
      cleanup?.();
      document.documentElement.classList.remove('snap-guide');
      scrollTo({ top: 0, behavior: 'instant' });
      current = r;
      outlet.innerHTML = '';
      outlet.dataset.route = r;
      cleanup = views[r]!(outlet);
      outlet.focus({ preventScroll: true });
      scrollTo({ top: 0, behavior: 'instant' });
      for (const a of $$<HTMLAnchorElement>('[data-route]')) {
        if (a.dataset.route === r) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
    };
    // Sin transición animada: capturar una página larga (con 3D) tardaba y la nueva aparecía abajo.
    swap();
  };

  addEventListener('hashchange', render);
  render();
  return () => {
    removeEventListener('hashchange', render);
    cleanup?.();
    current = null;
  };
}
