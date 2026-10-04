export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Todo texto que viene del usuario pasa por aquí antes de entrar a una plantilla. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Algunos navegadores lanzan si no hubo interacción previa.
  }
}

/** Delegación de eventos sobre un contenedor: sobrevive a re-renderizados parciales. */
export function on<K extends keyof HTMLElementEventMap>(
  root: HTMLElement,
  type: K,
  selector: string,
  fn: (e: HTMLElementEventMap[K], el: HTMLElement) => void,
) {
  const handler = (e: HTMLElementEventMap[K]) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(selector);
    if (el && root.contains(el)) fn(e, el);
  };
  root.addEventListener(type, handler);
  return () => root.removeEventListener(type, handler);
}

/** Marca las ideas clave: *texto* se ve de otro color (sin subrayar). */
export const rich = (s: string) => s.replace(/\*(.+?)\*/g, '<strong class="k">$1</strong>');
