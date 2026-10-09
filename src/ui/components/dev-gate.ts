import { entrarProgramador } from '../../core/auth';
import { SIN_PERMISO, soyProgramador } from '../../core/supabase';
import { vibrate } from '../dom';
import { icon } from '../icons';

/**
 * Contraseña de programador: la comprueba el servidor (no está en esta página) y abre la sesión que permite escribir.
 * Al entrar, cierra la ventana y llama a `onEntered`.
 */
export function openDevGate(onEntered: () => void) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet dev-sheet';
  dlg.innerHTML = `
    <div class="sheet__inner dev">
      <header class="sheet__head">
        <div><p class="kicker">[ Acceso ]</p><h2>Soy programador</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
      </header>
      <form class="dev-gate" novalidate>
        <label class="field">
          <span class="field__label">Contraseña</span>
          <input type="password" name="clave" class="input" placeholder="Escribe la contraseña" autocomplete="off" maxlength="64" required>
        </label>
        <p class="field__error" role="alert" data-dev-err hidden></p>
        <button class="btn btn--primary btn--lg" type="submit">Entrar</button>
      </form>
    </div>`;
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('[data-close]')!.addEventListener('click', close);

  const form = dlg.querySelector<HTMLFormElement>('form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const err = form.querySelector<HTMLElement>('[data-dev-err]')!;
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  input.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled || !input.value) return;
    submit.disabled = true;
    err.hidden = true;
    try {
      await entrarProgramador(input.value);
      if (!(await soyProgramador())) throw new Error(SIN_PERMISO);
      close();
      onEntered();
    } catch (x) {
      err.textContent = x instanceof Error ? x.message : 'No se pudo entrar.';
      err.hidden = false;
      input.value = '';
      input.focus();
      vibrate([30, 50, 30]);
      submit.disabled = false;
    }
  });
}
