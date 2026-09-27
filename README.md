# Condomio · Red Comercial Independiente (MVP)

Aplicación de postulación, portal de vendedores y administración comercial. Está preparada para Cloudflare Workers y Supabase. Incluye condiciones oficiales versionadas; antes de una publicación definitiva todavía debe probarse el acceso con usuarios reales controlados.

## Funcionalidad

- La postulación comienza consultando únicamente el tipo y número de documento. Si ya existe una postulación, se valida el correo registrado y se recupera el último hito guardado.
- A los postulantes nuevos se les solicitan después nombres, apellidos, teléfono, fecha de nacimiento y correo. El correo se valida mediante un código de seis dígitos.
- El PIN se crea en la bienvenida, después de completar las evaluaciones y la validación final.
- Validación final con foto de identidad en un bucket privado, cuenta bancaria, CCI y aceptación versionada de condiciones.
- Acceso de vendedores mediante tipo/número de documento y PIN numérico de seis dígitos almacenado por Supabase Auth.
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

`wrangler.jsonc` contiene únicamente configuración pública: URL y clave publicable de Supabase, correo del administrador y el interruptor público de postulaciones. Nunca agregues la clave `service_role`, contraseñas SMTP ni otros secretos al repositorio.

Configura `SUPABASE_SERVICE_ROLE_KEY` como secreto del Worker en Cloudflare. La aplicación usa esa clave **solo en el servidor**. Para desarrollo local puedes usar un archivo `.dev.vars` ignorado por Git.

`APPLICATIONS_ENABLED=true` permite registrar postulantes, validar su correo y rendir evaluaciones. El acceso mediante PIN se activa únicamente al finalizar la postulación. Los términos oficiales se publican en `/terminos` y se versionan en `lib/terms.ts`. `TERMS_URL` y `TERMS_VERSION` permiten reemplazarlos por un documento HTTPS externo y otra versión; `MATERIALS_URL` configura el material comercial opcional.

El administrador autorizado es `pdongoi@data-prix.com`. Su acceso también requiere un Magic Link enviado a ese correo.

## Acceso

Un postulante que vuelve ingresa su documento y recibe un código en el correo previamente validado. Al confirmar el código, el sistema recupera la evaluación actitudinal, la evaluación aptitudinal, la validación final o la creación del PIN, según corresponda. El PIN se solicita recién en la bienvenida y activa el acceso definitivo al portal. La credencial se almacena y verifica mediante Supabase Auth; el PIN nunca se guarda en `seller_profiles`.

En **Supabase → Authentication → Email Templates → Magic Link**, la plantilla debe incluir `{{ .Token }}` para que el postulante reciba el código. Puede conservar también `{{ .ConfirmationURL }}` porque el administrador continúa accediendo mediante enlace seguro.

El administrador conserva el Magic Link enviado únicamente al correo autorizado. Para usar un remitente propio y mejorar la entrega administrativa, configura **Authentication → SMTP Settings**. Las credenciales SMTP deben introducirse directamente en Supabase, nunca en GitHub ni en este chat.

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
- Inclusión de `{{ .Token }}` en la plantilla de correo de autenticación de Supabase.
- Secreto `SUPABASE_SERVICE_ROLE_KEY` en Cloudflare.
- Revisión funcional con usuarios de prueba antes de activar `APPLICATIONS_ENABLED`.
