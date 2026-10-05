import { supabase } from './supabase';

/**
 * Cuentas de Voz Propia con correo y código de verificación (OTP) de Supabase Auth.
 * No hay contraseñas: se escribe el correo, llega un código de 8 números y se ingresa.
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
export const CODE_LENGTH = 8;

const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com']);

const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'icloud.con': 'icloud.com',
};

/** Revisa que el correo exista de verdad: formato, errores comunes y que su dominio reciba correo (MX). */
export async function checkEmail(email: string): Promise<void> {
  const e = clean(email);
  if (!validEmail(e)) throw new Error('Ese correo no parece válido.');
  const domain = e.split('@')[1];
  if (DISPOSABLE.has(domain)) throw new Error('Usa un correo tuyo de verdad, no uno temporal.');
  if (TYPOS[domain]) throw new Error(`¿Quisiste decir ${e.split('@')[0]}@${TYPOS[domain]}?`);
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, { signal: AbortSignal.timeout(4000) });
    const j = (await r.json()) as { Status?: number; Answer?: unknown[] };
    if (j.Status === 3 || (j.Status === 0 && !j.Answer?.length)) throw new Error('Ese dominio no recibe correos. Revisa que esté bien escrito.');
  } catch (x) {
    if (x instanceof Error && x.message.startsWith('Ese dominio')) throw x;
  }
}

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
  if (m.includes('error sending') || m.includes('smtp') || m.includes('unexpected_failure') || m.includes('domain'))
    return 'El servidor de correo no puede enviar a esta dirección todavía (falta verificar el dominio de envío). Esperar no lo arregla.';
  return 'No se pudo completar. Intenta otra vez.';
}

/** Manda el código al correo. Con `name` se crea la cuenta; sin él solo entra quien ya tiene una. */
export async function requestCode(email: string, name?: string): Promise<void> {
  const e = clean(email);
  if (name !== undefined && !name.trim()) throw new Error('Escribe tu nombre.');
  await checkEmail(e);
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
