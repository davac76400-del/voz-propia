# Cuentas con correo (código de 6 números)

La app usa **Supabase Auth con código por correo (OTP)**. Para que el correo llegue a cualquier persona hay que
configurar Supabase una sola vez. Hay dos caminos; elige **A** (más simple).

## A. SMTP de Resend + plantillas (recomendado, sin código)

1. En [resend.com](https://resend.com) crea una API key. Para mandar a cualquier correo, verifica un dominio propio (Domains).
2. Supabase → **Authentication → Emails → SMTP Settings** → activa *Custom SMTP*:
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = tu API key,
   remitente `Voz Propia <hola@tudominio.com>`.
3. Supabase → **Authentication → Emails → Templates**: pega el contenido de
   `plantillas/confirmar-cuenta.html` en **Confirm signup** y el de `plantillas/enlace-magico.html` en **Magic Link**
   (llevan `{{ .Token }}`, el código). Asunto sugerido: «Tu código para entrar a Voz Propia».
4. **Authentication → Sign In / Providers → Email**: deja activado *Enable email provider* y *Confirm email*.
   Longitud del código (OTP length): **6**.

## B. Hook con Edge Function (`functions/enviar-correo`)

1. `supabase functions deploy enviar-correo --no-verify-jwt --project-ref <ref>`
2. **Authentication → Hooks → Send Email** → HTTPS → URL `https://<ref>.supabase.co/functions/v1/enviar-correo`;
   copia el *secret* que genera.
3. `supabase secrets set RESEND_API_KEY=re_... RESEND_FROM_EMAIL="Voz Propia <hola@tudominio.com>" SEND_EMAIL_HOOK_SECRET="v1,whsec_..."`

Sin SMTP propio, Supabase solo manda unos pocos correos por hora y solo a miembros del equipo del proyecto.
