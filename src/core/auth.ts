/**
 * Cuentas de Voz Propia, guardadas en este dispositivo (no hay servidor todavía).
 * La contraseña nunca se guarda: solo su huella (PBKDF2 con sal propia).
 * «Entrar sin correo» abre una sesión de invitado que no se guarda.
 */

export interface Session {
  kind: 'cuenta' | 'invitado';
  name: string;
  email?: string;
}

interface Stored {
  name: string;
  salt: string;
  hash: string;
}

const KEY_USERS = 'voz-propia:cuentas';
const KEY_SESSION = 'voz-propia:sesion';
const ITER = 120_000;

let current: Session | null = null;

const read = <T>(k: string, fb: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

async function derive(password: string, salt: string) {
  if (!crypto?.subtle) throw new Error('Este navegador no permite crear cuentas seguras aquí.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITER }, key, 256);
  return hex(bits);
}

const clean = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(email));

export function session(): Session | null {
  if (current) return current;
  const s = read<Session | null>(KEY_SESSION, null);
  if (s && s.kind === 'cuenta' && typeof s.name === 'string') current = s;
  return current;
}

export async function signUp(name: string, email: string, password: string): Promise<Session> {
  const e = clean(email);
  if (!name.trim()) throw new Error('Escribe tu nombre.');
  if (!validEmail(e)) throw new Error('Ese correo no parece válido.');
  if (password.length < 6) throw new Error('La contraseña necesita al menos 6 caracteres.');
  const users = read<Record<string, Stored>>(KEY_USERS, {});
  if (users[e]) throw new Error('Ya hay una cuenta con ese correo. Inicia sesión.');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  users[e] = { name: name.trim(), salt, hash: await derive(password, salt) };
  if (!write(KEY_USERS, users)) throw new Error('Este navegador no deja guardar cuentas. Entra sin correo.');
  return start({ kind: 'cuenta', name: name.trim(), email: e });
}

export async function signIn(email: string, password: string): Promise<Session> {
  const e = clean(email);
  const u = read<Record<string, Stored>>(KEY_USERS, {})[e];
  if (!u || (await derive(password, u.salt)) !== u.hash) throw new Error('Correo o contraseña incorrectos.');
  return start({ kind: 'cuenta', name: u.name, email: e });
}

export function guest(): Session {
  current = { kind: 'invitado', name: 'Invitado' };
  return current;
}

function start(s: Session) {
  current = s;
  write(KEY_SESSION, s);
  return s;
}

export function signOut() {
  current = null;
  try {
    localStorage.removeItem(KEY_SESSION);
  } catch {
    // Nada que borrar.
  }
}
