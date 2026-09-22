# Condomio · Red Comercial Independiente (MVP)

Aplicación de postulación, portal de vendedores y administración comercial. Está preparada para Cloudflare Workers y Supabase. La postulación pública permanece desactivada hasta contar con condiciones oficiales y el correo de acceso probado.

## Funcionalidad

- Postulación con verificación del correo, evaluación actitudinal y evaluación comercial. Las respuestas se corrigen en el servidor.
- Validación final con foto de identidad en un bucket privado, cuenta bancaria, CCI y aceptación versionada de condiciones. Esta etapa se habilita solo cuando se configura el documento oficial.
- Acceso de vendedores mediante tipo/número de documento y un Magic Link de un solo uso enviado al correo registrado.
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

Cuando Condomio entregue los documentos oficiales, configura `TERMS_URL` (enlace HTTPS), `TERMS_VERSION` (identificador de versión) y opcionalmente `MATERIALS_URL` (enlace HTTPS). Activa `APPLICATIONS_ENABLED=true` solo después de verificar el Magic Link, revisar las condiciones y probar el flujo completo. Mientras esté en `false`, nadie puede enviar postulaciones reales.

El administrador autorizado es `pdongoi@data-prix.com`. Su acceso también requiere un Magic Link enviado a ese correo.

## Correo de acceso

Supabase Auth envía un Magic Link de un solo uso. La URL pública `/auth/callback` recibe la sesión y dirige al usuario a administración, al portal de vendedores o a la continuación de su postulación después de validar su autorización en el servidor. Para usar un remitente propio y mejorar la entrega, configura **Authentication → SMTP Settings**. Las credenciales SMTP deben introducirse directamente en Supabase, nunca en GitHub ni en este chat.

Referencias: [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [Magic Link de Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## GitHub y Cloudflare

Repositorio previsto: `https://github.com/omakasecafe-coder/condomio_rvi`.

En Cloudflare Workers & Pages, importa ese repositorio mediante **Create application → Import a repository**. Autoriza la aplicación oficial de Cloudflare en GitHub, selecciona la rama `main` y usa:

- Nombre del Worker: `condomio-rvi-mvp` (debe coincidir con `wrangler.jsonc`).
- Comando de compilación: `npm run build`.
- Comando de despliegue: `npx wrangler deploy`.

Cloudflare compilará y desplegará cada cambio de la rama principal. Agrega los secretos del Worker en **Settings → Variables and Secrets** antes de habilitar las funciones con datos reales. La URL esperada será `https://condomio-rvi-mvp.condomio.workers.dev` después del primer despliegue exitoso.

Referencia: [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

## Pendientes de operación

- Documento oficial de condiciones y materiales comerciales de Condomio.
- Configuración opcional de SMTP propio en Supabase.
- Secreto `SUPABASE_SERVICE_ROLE_KEY` en Cloudflare.
- Revisión funcional con usuarios de prueba antes de activar `APPLICATIONS_ENABLED`.
