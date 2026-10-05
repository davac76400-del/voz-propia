import { supabase } from './supabase';

/**
 * Cuentas de Voz Propia con correo y código de verificación (OTP) de Supabase Auth.
 * No hay contraseñas: se escribe el correo, llega un código de 6 dígitos y se ingresa.
 * «Entrar sin cuenta» abre una sesión de invitado que no se guarda.
 */

export interface Session {
  kind: 'cuenta' | 'invitado';
  name: string;
  email?: string;
}

const KEY_SESSION = 'voz-propia:sesion';
let current: Session | null = null;

const read = (): Session | null => {
  try {
    const v = localStorage.getItem(KEY_SESSION);
    return v ? (JSON.parse(v) as Session) : null;
  } catch {
    return null;
  }
};
const write = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(KEY_SESSION, JSON.stringify(s));
    else localStorage.removeItem(KEY_SESSION);
  } catch {
    /* sin almacenamiento: la cuenta sigue en memoria mientras la página esté abierta */
  }
};

const clean = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(email));
export const CODE_LENGTH = 6;

/** Sesión actual, leída al instante. La de cuenta se comprueba contra Supabase en segundo plano. */
export function session(): Session | null {
  if (current) return current;
  const s = read();
  if (s && s.kind === 'cuenta' && typeof s.name === 'string') current = s;
  return current;
}

// Si Supabase ya no reconoce la sesión (vencida o cerrada en otro dispositivo), se cierra aquí también.
void supabase.auth.getSession().then(({ data }) => {
  if (!data.session && current?.kind === 'cuenta') {
    current = null;
    write(null);
  }
});
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && current?.kind === 'cuenta') {
    current = null;
    write(null);
  }
});

function explain(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('security purposes') || m.includes('too many')) return 'Espera un momento antes de pedir otro código.';
  if (m.includes('signups not allowed') || m.includes('user not found') || m.includes('not found')) return 'No hay una cuenta con ese correo. Crea una.';
  if (m.includes('expired') || m.includes('invalid')) return 'El código no es correcto o ya venció. Pide uno nuevo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
  if (m.includes('error sending') || m.includes('smtp')) return 'No se pudo enviar el correo. Inténtalo en unos minutos.';
  return 'No se pudo completar. Intenta otra vez.';
}

/** Manda el código al correo. Con `name` se crea la cuenta; sin él solo entra quien ya tiene una. */
export async function requestCode(email: string, name?: string): Promise<void> {
  const e = clean(email);
  if (name !== undefined && !name.trim()) throw new Error('Escribe tu nombre.');
  if (!validEmail(e)) throw new Error('Ese correo no parece válido.');
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: name !== undefined ? { shouldCreateUser: true, data: { name: name.trim() } } : { shouldCreateUser: false },
  });
  if (error) throw new Error(explain(error.message));
}

/** Comprueba el código y abre la sesión. */
export async function verifyCode(email: string, code: string): Promise<Session> {
  const e = clean(email);
  const token = code.replace(/\D/g, '');
  if (token.length < CODE_LENGTH) throw new Error(`El código tiene ${CODE_LENGTH} números.`);
  const { data, error } = await supabase.auth.verifyOtp({ email: e, token, type: 'email' });
  if (error || !data.user) throw new Error(explain(error?.message ?? 'invalid'));
  const meta = data.user.user_metadata as { name?: string } | undefined;
  const name = meta?.name?.trim() || e.split('@')[0];
  current = { kind: 'cuenta', name, email: e };
  write(current);
  return current;
}

export function guest(): Session {
  current = { kind: 'invitado', name: 'Invitado' };
  return current;
}

export function signOut() {
  current = null;
  write(null);
  void supabase.auth.signOut();
}
