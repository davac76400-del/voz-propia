// Send Email Hook de Supabase Auth: manda por Resend el código de 8 números con el diseño de Voz Propia.
// Despliegue (sin verificación JWT: la autenticidad se comprueba con la firma del hook):
//   supabase functions deploy enviar-correo --no-verify-jwt --project-ref <ref>
//   supabase secrets set RESEND_API_KEY=re_... RESEND_FROM_EMAIL="Voz Propia <hola@tudominio.com>" SEND_EMAIL_HOOK_SECRET="v1,whsec_..."
import { Webhook } from 'npm:standardwebhooks@1.0.0';

const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Voz Propia <onboarding@resend.dev>';

interface HookPayload {
  user: { email: string; user_metadata?: { name?: string } };
  email_data: { token: string; email_action_type: string };
}

const TEXTS: Record<string, { subject: string; title: string; intro: string }> = {
  signup: { subject: 'Tu código para crear tu cuenta', title: 'Bienvenido a Voz Propia', intro: 'Escribe este código para confirmar tu cuenta:' },
  magiclink: { subject: 'Tu código para entrar a Voz Propia', title: 'Hola de nuevo', intro: 'Escribe este código para entrar:' },
  recovery: { subject: 'Tu código para recuperar tu cuenta', title: 'Recupera tu cuenta', intro: 'Escribe este código:' },
  email_change: { subject: 'Confirma tu nuevo correo', title: 'Confirma tu correo', intro: 'Escribe este código:' },
  reauthentication: { subject: 'Tu código de seguridad', title: 'Confirma que eres tú', intro: 'Escribe este código:' },
  invite: { subject: 'Te invitaron a Voz Propia', title: 'Te invitaron', intro: 'Escribe este código para entrar:' },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function html(name: string | undefined, code: string, t: { title: string; intro: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#070b16;font-family:Segoe UI,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070b16;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#0e1424;border:1px solid #243052;border-radius:24px;padding:36px 28px;">
<tr><td style="color:#3df2a0;font-size:13px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;">Voz Propia</td></tr>
<tr><td style="padding-top:14px;color:#fff;font-size:26px;font-weight:800;line-height:1.2;">${esc(t.title)}${name ? `, ${esc(name.split(' ')[0])}` : ''}</td></tr>
<tr><td style="padding-top:12px;color:#b9c4e2;font-size:16px;line-height:1.5;">${esc(t.intro)}</td></tr>
<tr><td align="center" style="padding:22px 0;"><div style="display:inline-block;padding:16px 26px;border-radius:18px;background:#16203a;border:1px solid #3df2a0;color:#fff;font-size:40px;font-weight:800;letter-spacing:.3em;">${esc(code)}</div></td></tr>
<tr><td style="color:#8f9bbd;font-size:14px;line-height:1.5;">El código vence en una hora. Si no lo pediste tú, ignora este correo.</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const raw = await req.text();
  let data: HookPayload;
  try {
    data = new Webhook(hookSecret).verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: 'Firma no válida' } }), { status: 401 });
  }
  const to = data.user?.email;
  const code = data.email_data?.token;
  if (!to || !code) return new Response(JSON.stringify({ error: { http_code: 400, message: 'Datos incompletos' } }), { status: 400 });

  const t = TEXTS[data.email_data.email_action_type] ?? TEXTS.magiclink;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: t.subject, html: html(data.user.user_metadata?.name, code, t) }),
  });
  if (!res.ok) {
    console.error('Resend respondió', res.status);
    return new Response(JSON.stringify({ error: { http_code: 500, message: 'No se pudo enviar el correo' } }), { status: 500 });
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});
