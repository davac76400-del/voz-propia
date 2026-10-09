/**
 * Protección de la copia publicada. Nada en una página web se puede hacer imposible de copiar, pero así:
 *  - una copia puesta en otro dominio no arranca;
 *  - se frenan los atajos comunes para guardar, ver el código o copiar;
 *  - al construir, el código propio se ofusca (vite.config.ts).
 */
declare const __ALLOWED_HOSTS__: string[];

/** Este equipo y redes privadas: sirven para probar la copia construida. */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export const allowedHere = () => !import.meta.env.PROD || LOCAL.test(location.hostname) || __ALLOWED_HOSTS__.includes(location.hostname);

/** Pantalla que ve quien abre una copia no autorizada. */
export function blockCopy(app: HTMLElement) {
  app.innerHTML = `<main class="boot-error" role="alert"><h1>Esta no es la página oficial de Voz Propia</h1><p>Esta copia no está autorizada. Usa la versión oficial:</p><a class="btn btn--primary" href="https://${__ALLOWED_HOSTS__[0]}/">Abrir Voz Propia</a></main>`;
}

const inField = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable], [data-allow-select]');

/** Frena menú contextual, arrastrar y atajos de guardar, ver código y herramientas. Solo en la versión publicada. */
export function deterCopying() {
  if (!import.meta.env.PROD) return;
  document.documentElement.classList.add('is-protected');
  addEventListener('contextmenu', (e) => inField(e.target) || e.preventDefault());
  addEventListener('dragstart', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const devtools = e.key === 'F12' || (mod && (e.shiftKey || e.altKey) && ['KeyI', 'KeyJ', 'KeyC'].includes(e.code));
    const saveOrSource = mod && ['KeyU', 'KeyS'].includes(e.code) && !inField(e.target);
    if (devtools || saveOrSource) e.preventDefault();
  });
  console.info('%cVoz Propia', 'font:700 18px sans-serif;color:#3df2a0', '© 2026 David Alfredo Romero Rendón. Todos los derechos reservados. Copiar este sitio sin permiso no está autorizado.');
}
