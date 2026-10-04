import { esc } from '../dom';
import { icon } from '../icons';

interface ToastOptions {
  tone?: 'info' | 'ok' | 'warn';
  action?: { label: string; run: () => void };
  ms?: number;
}

export function toast(message: string, opts: ToastOptions = {}) {
  const host = document.getElementById('toasts');
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
  host.append(el);
  try {
    // Sobre las ventanas modales (que viven en la capa superior del navegador) para que el aviso se vea.
    host.setAttribute('popover', 'manual');
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  } catch {
    /* navegador sin Popover: queda con su z-index normal */
  }
  setTimeout(close, opts.ms ?? (opts.action ? 9000 : 3200));
}
