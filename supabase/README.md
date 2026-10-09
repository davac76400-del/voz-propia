# Cuentas con correo (código de 8 números)

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

## Quién puede preparar palabras (modo programador)

Las tablas de trabajo (`programmer_videos`, `programmer_folders`) y la publicación (`shared_phrases`) solo las lee y
escribe una cuenta que esté en la tabla `programadores`. Todos los dispositivos siguen leyendo `shared_phrases`.

- Esquema y reglas: `migraciones/001-solo-programadores.sql`, `migraciones/002-verificar-pin.sql`.
- Dar acceso a otra cuenta (el id sale de `auth.users`):
  `insert into public.programadores (user_id) values ('<id>');`
- La función `functions/entrar` lleva el límite de 5 intentos dentro de la base (`verificar_pin`), sin carreras.
- El modo programador se abre con una contraseña que comprueba el servidor (`functions/programador`, `migraciones/003-clave-programador.sql`); está cifrada en la base y no en el código. Para cambiarla, mira el encabezado de esa migración.

## Protección de la copia publicada

La app solo arranca en las direcciones de `ALLOWED_HOSTS` (`vite.config.ts`); si algún día hay dominio propio, ponlo en
la variable de entorno `VOZ_PROPIA_HOSTS` de Vercel (separado por comas). El código propio se ofusca al construir;
`NO_OBFUSCATE=1 npm run build` lo deja legible para depurar.

## Los videos del programador no se pierden (memoria)

Cada video que se sube, cambia o borra queda copiado en `memoria_videos` (y cada palabra publicada, en
`memoria_palabras`). La memoria solo se lee: ni la app ni una migración pueden borrarla, vaciarla o cambiar los
puntos de labios guardados (`migraciones/004-memoria-videos.sql`). Borrar un video es un `DELETE` normal, pero antes
la base lo copia a la memoria; en la app, el botón **Memoria** del panel lista lo borrado y lo recupera con su mismo
número (`migraciones/005-recuperar-videos.sql`), y **Guardar respaldo** baja todo a un archivo `.json`.

- Recuperar todo lo borrado desde SQL: `select public.recuperar_videos();` (con sesión de programador).
- Volver a publicar la última versión guardada de una palabra: `select public.recuperar_palabra('<llave>');`
- `npm run build` corre antes `scripts/guard-migrations.mjs`: si una migración o el código puede borrar videos,
  palabras o su memoria (`DELETE`, `TRUNCATE`, `DROP TABLE`, quitar columnas, apagar disparadores…), el build se detiene
  y Vercel no publica. Si es a propósito, la migración debe llevar la línea `-- guardia: permitir-destruccion <motivo>`.
- Si el panel muestra «Tus videos no se ven en esta sesión», no se borró nada: la sesión no es de programador (o se abrió
  una dirección vieja). Entra con la contraseña de programador en `https://voz-propia-gilt.vercel.app`.
