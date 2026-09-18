# Condomio · Red Comercial Independiente (MVP)

Aplicación de postulación, portal de vendedores y administración comercial. Está preparada para Cloudflare Workers y Supabase. La postulación pública permanece desactivada hasta contar con condiciones oficiales y correo OTP operativo.

## Funcionalidad

- Postulación con verificación del correo, evaluación actitudinal y evaluación comercial. Las respuestas se corrigen en el servidor.
- Validación final con foto de identidad en un bucket privado, cuenta bancaria, CCI y aceptación versionada de condiciones. Esta etapa se habilita solo cuando se configura el documento oficial.
- Acceso de vendedores mediante tipo/número de documento y código OTP al correo registrado.
- Vendedores: perfil de solo lectura, registro de edificios y oportunidades, seguimiento de estados y comisiones.
- Administración: valida contrato firmado para marcar **Ganado** y registra comisiones **Pagado**. La comisión se calcula como precio unitario × departamentos.
- Las rutas `?demo=1` de ambos portales muestran datos ficticios y no guardan cambios.

## Desarrollo

Requiere Node.js 22.13 o posterior.

```sh
npm ci
npm run dev
npm run typecheck
npm run build
```

Las migraciones de `supabase/migrations/` ya están aplicadas al proyecto Supabase `condomio-rvi-mvp`. El bucket `seller-identity` es privado y limita los archivos a 5 MB y formatos de imagen.

## Variables y secretos

`wrangler.jsonc` contiene únicamente configuración pública: URL y clave publicable de Supabase, correo del administrador y `APPLICATIONS_ENABLED=false`. Nunca agregues la clave `service_role`, contraseñas SMTP ni otros secretos al repositorio.

Configura `SUPABASE_SERVICE_ROLE_KEY` como secreto del Worker en Cloudflare. La aplicación usa esa clave **solo en el servidor**. Para desarrollo local puedes usar un archivo `.dev.vars` ignorado por Git.

Cuando Condomio entregue los documentos oficiales, configura `TERMS_URL` (enlace HTTPS), `TERMS_VERSION` (identificador de versión) y opcionalmente `MATERIALS_URL` (enlace HTTPS). Activa `APPLICATIONS_ENABLED=true` solo después de verificar el correo OTP, revisar las condiciones y probar el flujo completo. Mientras esté en `false`, nadie puede enviar postulaciones reales.

El administrador autorizado es `pdongoi@data-prix.com`. Su acceso también requiere OTP al correo.

## OTP por Gmail

Supabase Auth necesita un servidor SMTP personalizado para enviar códigos a vendedores externos. En Supabase, configura **Authentication → SMTP Settings** con la cuenta de Gmail elegida, `smtp.gmail.com`, puerto 465 o 587 y una **contraseña de aplicación** de Google. Activa antes la verificación en dos pasos de esa cuenta. Introduce la contraseña directamente en Supabase, nunca en GitHub ni en este chat. Configura la plantilla de correo para mostrar el código `{{ .Token }}` y prueba el envío antes de activar postulaciones.

Referencias: [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [Google: contraseñas de aplicación](https://support.google.com/accounts/answer/185833), [OTP de Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## GitHub y Cloudflare

Repositorio previsto: `https://github.com/omakasecafe-coder/condomio_rvi`.

En Cloudflare Workers & Pages, importa ese repositorio mediante **Create application → Import a repository**. Autoriza la aplicación oficial de Cloudflare en GitHub, selecciona la rama `main` y usa:

- Nombre del Worker: `condomio-rvi-mvp` (debe coincidir con `wrangler.jsonc`).
- Comando de compilación: `npm run build`.
- Comando de despliegue: `npx wrangler deploy`.

Cloudflare compilará y desplegará cada cambio de la rama principal. Agrega los secretos del Worker en **Settings → Variables and Secrets** antes de habilitar las funciones con datos reales. La URL esperada será `https://condomio-rvi-mvp.omakase-cafe.workers.dev` después del primer despliegue exitoso.

Referencia: [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

## Pendientes de operación

- Documento oficial de condiciones y materiales comerciales de Condomio.
- Configuración y prueba de Gmail SMTP en Supabase.
- Secreto `SUPABASE_SERVICE_ROLE_KEY` en Cloudflare.
- Revisión funcional con usuarios de prueba antes de activar `APPLICATIONS_ENABLED`.
