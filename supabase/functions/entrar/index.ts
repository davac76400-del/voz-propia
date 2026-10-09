// Inicio de sesión con usuario y contraseña de 4 números. El límite de intentos lo lleva la base (verificar_pin).
// Despliegue (sin verificación JWT: se llama antes de tener sesión):
//   supabase functions deploy entrar --no-verify-jwt --project-ref <ref>
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAL = 'Usuario o contraseña incorrectos.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'método no permitido' });

  let usuario = '';
  let pin = '';
  try {
    const b = await req.json();
    usuario = String(b.usuario ?? '').trim();
    pin = String(b.pin ?? '');
  } catch {
    return json(400, { error: 'Datos no válidos.' });
  }
  if (!usuario || !/^[0-9]{4}$/.test(pin)) return json(400, { error: 'Escribe tu usuario y tu contraseña de 4 números.' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error: verr } = await admin.rpc('verificar_pin', { p_usuario: usuario, p_pin: pin });
  const r = data?.[0];
  if (verr || !r) return json(500, { error: 'No se pudo comprobar. Intenta otra vez.' });
  if (r.estado === 'bloqueado') {
    return json(429, { error: `Demasiados intentos. Espera ${r.minutos} min o usa «No recuerdo mi usuario o contraseña».` });
  }
  if (r.estado !== 'ok') return json(401, { error: MAL });

  const { data: u } = await admin.auth.admin.getUserById(r.out_user_id);
  const email = u?.user?.email;
  if (!email) return json(500, { error: 'No se pudo abrir la sesión.' });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const token_hash = link?.properties?.hashed_token;
  if (error || !token_hash) return json(500, { error: 'No se pudo abrir la sesión.' });
  return json(200, { token_hash, usuario: r.out_usuario });
});
