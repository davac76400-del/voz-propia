// Entrada del programador con su contraseña. La comprueba la base (verificar_clave_programador, con límite de intentos)
// y, si es correcta, abre la sesión de la cuenta de programador para que el panel pueda leer y escribir.
// Despliegue (sin verificación JWT: se llama antes de tener sesión):
//   supabase functions deploy programador --no-verify-jwt --project-ref <ref>
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'método no permitido' });

  let clave = '';
  try {
    const b = await req.json();
    clave = String(b.clave ?? '');
  } catch {
    return json(400, { error: 'Datos no válidos.' });
  }
  if (!clave || clave.length > 64) return json(400, { error: 'Escribe la contraseña.' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error: verr } = await admin.rpc('verificar_clave_programador', { p_clave: clave });
  const r = data?.[0];
  if (verr || !r) return json(500, { error: 'No se pudo comprobar. Intenta otra vez.' });
  if (r.estado === 'bloqueado') return json(429, { error: `Demasiados intentos. Espera ${r.minutos} min.` });
  if (r.estado !== 'ok') return json(401, { error: 'Contraseña incorrecta' });

  const { data: u } = await admin.auth.admin.getUserById(r.out_user_id);
  const email = u?.user?.email;
  if (!email) return json(500, { error: 'No se pudo abrir la sesión.' });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const token_hash = link?.properties?.hashed_token;
  if (error || !token_hash) return json(500, { error: 'No se pudo abrir la sesión.' });
  return json(200, { token_hash, usuario: r.out_usuario ?? 'Programador' });
});
