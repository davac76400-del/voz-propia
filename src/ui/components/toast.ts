import { esc } from '../dom';
import { icon } from '../icons';

interface ToastOptions {
  tone?: 'info' | 'ok' | 'warn';
  action?: { label: string; run: () => void };
  ms?: number;
}

/** Con una ventana modal abierta, todo lo de afuera queda congelado: el aviso va dentro de esa ventana. */
function hostFor(): HTMLElement | null {
  const modal = Array.from(document.querySelectorAll('dialog[open]'))
    .filter((d) => d.matches(':modal'))
    .pop();
  if (!modal) return document.getElementById('toasts');
  let host = modal.querySelector<HTMLElement>(':scope > .toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('aria-live', 'polite');
    modal.appendChild(host);
  }
  return host;
}

export function toast(message: string, opts: ToastOptions = {}) {
  const host = hostFor();
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${opts.tone ?? 'info'}`;
  el.setAttribute('role', 'status');
  const ic = opts.tone === 'ok' ? 'check' : opts.tone === 'warn' ? 'info' : 'sparkles';
  el.innerHTML = `${icon(ic, 18)}<span>${esc(message)}</span>${
    opts.action ? `<button class="toast__action" type="button">${esc(opts.action.label)}</button>` : ''
  }`;
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('button')?.addEventListener('click', () => {
    opts.action?.run();
    close();
  });
  // Un «Deshacer» viejo no debe poder pisar cambios nuevos.
  if (opts.action) host.querySelectorAll('.toast:has(.toast__action)').forEach((n) => n.remove());
  host.append(el);
  setTimeout(close, opts.ms ?? (opts.action ? 9000 : 3200));
}
