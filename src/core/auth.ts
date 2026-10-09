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
  if (!validEmail(e)) throw new Error('Este correo no funciona. Revísalo y corrígelo.');
  const domain = e.split('@')[1];
  if (DISPOSABLE.has(domain)) throw new Error('Este correo no funciona. Usa un correo tuyo, no uno temporal.');
  if (TYPOS[domain]) throw new Error(`¿Quisiste decir ${e.split('@')[0]}@${TYPOS[domain]}?`);
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, { signal: AbortSignal.timeout(4000) });
    const j = (await r.json()) as { Status?: number; Answer?: unknown[] };
    if (j.Status === 3 || (j.Status === 0 && !j.Answer?.length)) throw new Error('Este correo no funciona: su dominio no recibe mensajes. Corrígelo.');
  } catch (x) {
    if (x instanceof Error && x.message.startsWith('Este correo no funciona')) throw x;
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
  if (m.includes('signups not allowed') || m.includes('user not found') || m.includes('not found')) return 'Ese correo no está registrado.';
  if (m.includes('expired') || m.includes('invalid')) return 'El código no es correcto o ya venció. Pide uno nuevo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
  if (m.includes('error sending') || m.includes('smtp') || m.includes('unexpected_failure') || m.includes('domain'))
    return 'El servidor de correo no puede enviar a esta dirección todavía (falta verificar el dominio de envío). Esperar no lo arregla.';
  return 'No se pudo completar. Intenta otra vez.';
}

export interface Perfil {
  usuario: string;
  pin: string;
}

/** Reglas del usuario: lista para mostrarla en pantalla mientras se escribe. */
export const USER_RULES: { id: string; text: string; ok: (u: string) => boolean }[] = [
  { id: 'len', text: 'De 5 a 10 caracteres', ok: (u) => u.length >= 5 && u.length <= 10 },
  { id: 'chars', text: 'Solo letras, números, - y _', ok: (u) => u.length > 0 && /^[A-Za-z0-9_-]+$/.test(u) },
  { id: 'letters', text: 'Al menos 5 letras', ok: (u) => u.replace(/[^A-Za-z]/g, '').length >= 5 },
  { id: 'lower', text: 'Una minúscula', ok: (u) => /[a-z]/.test(u) },
  { id: 'upper', text: 'Una mayúscula', ok: (u) => /[A-Z]/.test(u) },
  { id: 'extra', text: 'Un número, - o _', ok: (u) => /[0-9_-]/.test(u) },
];
export const userValid = (u: string) => USER_RULES.every((r) => r.ok(u));
export const PIN_LENGTH = 4;

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const m = error.message ?? '';
    if (m.includes('usuario_ocupado')) throw new Error('Ese usuario ya existe. Elige otro.');
    if (m.includes('usuario_invalido')) throw new Error('Ese usuario no cumple los requisitos.');
    if (m.includes('pin_invalido')) throw new Error('La contraseña son 4 números.');
    if (m.includes('sin_sesion')) throw new Error('Tu verificación venció. Pide un código nuevo.');
    throw new Error(explain(m));
  }
  return data as T;
};

/** Manda el código al correo. `crear` abre la cuenta si no existe; sin él solo sirve a quien ya tiene una. */
export async function requestCode(email: string, crear: boolean): Promise<void> {
  const e = clean(email);
  await checkEmail(e);
  const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: crear } });
  if (error) throw new Error(explain(error.message));
}

/** Comprueba el código. Deja la sesión de Supabase abierta y devuelve el perfil si ya tiene usuario y contraseña. */
export async function verifyCode(email: string, code: string): Promise<Perfil | null> {
  const e = clean(email);
  const token = code.replace(/\D/g, '');
  if (token.length < CODE_LENGTH) throw new Error(`El código tiene ${CODE_LENGTH} números.`);
  const { data, error } = await supabase.auth.verifyOtp({ email: e, token, type: 'email' });
  if (error || !data.user) throw new Error(explain(error?.message ?? 'invalid'));
  return miPerfil();
}

export async function miPerfil(): Promise<Perfil | null> {
  const rows = await rpc<Perfil[] | null>('mi_perfil');
  return rows?.[0] ?? null;
}

/** true si el usuario está libre; false si ya existe o no cumple las reglas. */
export async function usuarioDisponible(usuario: string): Promise<boolean> {
  if (!userValid(usuario)) return false;
  return rpc<boolean>('usuario_disponible', { p_usuario: usuario });
}

export async function guardarPerfil(usuario: string, pin: string): Promise<void> {
  await rpc('guardar_perfil', { p_usuario: usuario, p_pin: pin });
}

/** Abre la sesión de la app con la cuenta que Supabase ya verificó. */
export async function abrirSesion(usuario: string): Promise<Session> {
  const { data } = await supabase.auth.getUser();
  current = { kind: 'cuenta', name: usuario, email: data.user?.email ?? undefined };
  write(current);
  return current;
}

/** Pide a una función del servidor que compruebe las credenciales y abre la sesión que devuelve. */
async function entrarPorFuncion(fn: string, body: Record<string, string>, usuario: string): Promise<Session> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = '';
    try {
      msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? '';
    } catch {
      /* respuesta sin texto */
    }
    throw new Error(msg || explain(error.message ?? ''));
  }
  const r = data as { token_hash?: string; usuario?: string };
  if (!r?.token_hash) throw new Error('No se pudo abrir la sesión. Intenta otra vez.');
  const v = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' });
  if (v.error) throw new Error('No se pudo abrir la sesión. Intenta otra vez.');
  return abrirSesion(r.usuario ?? usuario);
}

/** Iniciar sesión con usuario y contraseña de 4 números (la comprueba el servidor, con límite de intentos). */
export async function entrarConPin(usuario: string, pin: string): Promise<Session> {
  if (!/^[0-9]{4}$/.test(pin)) throw new Error('La contraseña son 4 números.');
  return entrarPorFuncion('entrar', { usuario: usuario.trim(), pin }, usuario);
}

/** Contraseña de programador: el servidor la comprueba (con límite de intentos) y abre la sesión de programador. */
export const entrarProgramador = (clave: string) => entrarPorFuncion('programador', { clave }, 'Programador');

/** Existe una cuenta con ese usuario (para avisar antes de pedir la contraseña). */
export async function usuarioExiste(usuario: string): Promise<boolean> {
  if (!userValid(usuario)) return false;
  return !(await rpc<boolean>('usuario_disponible', { p_usuario: usuario }));
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
