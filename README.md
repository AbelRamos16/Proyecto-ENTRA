# ENTRA · Administración MVC y colaboración musical

ENTRA conecta músicos mediante demos y hooks. Cada artista prepara un proyecto privado, publica cuando está listo y recibe propuestas musicales de otras cuentas.

## Estado actual

- **Descubrir:** carrusel horizontal con retratos de artistas, hook seleccionado, título, género, BPM y colaboración buscada. Navegación táctil, rueda y teclado; movimiento reducido cuando el navegador lo solicita.
- **Búsqueda:** título o artista, género, instrumento necesario, BPM y estado del proyecto. Los filtros se conservan al cargar páginas adicionales.
- **Proyectos:** CRUD, borradores privados, publicación y retirada; validaciones de audio, duración, hook y referencias a catálogos en servidor.
- **Propuestas:** mensaje con muestra musical opcional. Se puede grabar con micrófono, adjuntar un archivo, revisar la toma y enviarla. El destinatario acepta o rechaza.
- **Perfil:** biografía, nombre artístico, instrumentos, géneros, demos y publicaciones. Cada artista edita únicamente su perfil. Directorio de artistas y enlaces desde el feed.
- **Biblioteca:** accesos separados a Mis proyectos, Guardados y Colaboraciones. Una propuesta aceptada crea como máximo una colaboración. Sus participantes pueden completarla o cancelarla.
- **Notificaciones:** solicitudes, decisiones, cambios de colaboración y moderación; contador de no leídas, lectura individual o conjunta. Son avisos dentro de ENTRA.
- **Administración:** catálogos, artistas, proyectos y reportes. Ocultar/restaurar publicaciones con motivo, sin borrar sus datos; la visibilidad se respeta en feed, perfiles, audio público y nuevas propuestas.

Aceptar una propuesta no mezcla pistas ni transfiere la autoría del proyecto. El avance musical del proyecto se sigue editando desde su ficha. Los audios enviados son tomas separadas: se recomienda grabar con audífonos.

## Tecnologías y MVC

Node.js 24, TypeScript, Express, HTML/CSS y JavaScript del navegador; Supabase Auth y PostgreSQL.

- `src/models/`: validación y acceso a datos. `project.ts`, `catalog.ts`, `user.ts`, `admin.ts`, `feed.ts`, `proposal.ts` y `community.ts`.
- `src/controllers/`: rutas HTTP, formularios, sesión, CSRF y respuestas. Los controladores delegan reglas y persistencia a los modelos.
- `src/views/`: HTML escapado, formularios, perfiles, biblioteca y administración.
- `src/client/`: audio/hook, carrusel, grabador, catálogo dependiente y contador de avisos.
- `public/`: estilos, tipografías, logo y recursos gráficos.
- `supabase/migrations/`: cambios de estructura y reglas PostgreSQL.
- `tests/`: pruebas de validación, permisos, formularios y contratos HTTP.

`src/server.ts` construye y exporta Express. Los controladores privados requieren una sesión de aplicación y los cambios comprueban el token CSRF. Las claves administrativas solo se usan en servidor.

## Ejecutar localmente

Requisitos: Node.js 24.16 o compatible con la versión indicada en `package.json`, npm y un proyecto Supabase.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Completar en `.env`:

```dotenv
PORT=3000
SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=TU_CLAVE_PUBLICABLE
SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_SECRETA
```

No subir `.env` ni credenciales a Git. En Vercel usar los mismos nombres de variables y marcar la clave administrativa como Secret.

Aplicar en SQL Editor, por orden:

1. `20261028_music_catalogs.sql`
2. `20261028_artist_profiles.sql`
3. `20261117_feed_publication.sql`
4. `20261118_audio_proposals.sql`
5. `20261118_artist_community.sql`

La migración histórica `20261028_admin_assignments.sql` conserva soporte de reasignaciones antiguas; la administración actual edita contenido sin transferirlo automáticamente.

## Datos y permisos

- `auth.users`: cuentas administradas por Supabase Auth.
- `profiles`: identidad pública, rol, biografía y preferencias musicales.
- `app_sessions`: sesión de aplicación, hash del identificador, CSRF y caducidad.
- `projects`: ficha, catálogos, MP3, hook, publicación y moderación.
- `entra_catalog_items`: géneros, instrumentos y colaboraciones; `parent_id` vincula colaboración e instrumento.
- `entra_proposals`: mensaje, muestra opcional, destinatario y decisión.
- `entra_collaborations`: vínculo único con una propuesta aceptada, participantes y estado.
- `entra_saved_projects`: publicaciones guardadas por usuario.
- `entra_notifications`: avisos por destinatario y fecha de lectura.
- `entra_reports`: reporte, resolución y administrador responsable.

Los roles del producto son artista (`user`) y administrador (`superadmin`). El registro nunca concede administración. Las tablas nuevas tienen RLS activada y acceso reservado al servidor; los modelos limitan lectura y escritura al usuario o participante correspondiente. Las funciones administrativas vuelven a verificar el rol en PostgreSQL. Los datos públicos del perfil no incluyen correos, contraseñas ni sesiones.

La moderación conserva el proyecto y notifica el motivo. El autor puede editarlo, pero únicamente administración puede restaurar la visibilidad. Los borradores y las publicaciones ocultas no aparecen en perfiles públicos ni en resultados. Una colaboración ya aceptada conserva su propuesta privada para sus participantes.

## Subir música y colaborar

**Publicar un beat:** Nuevo proyecto → Demo MP3 → seleccionar archivo y hook → Guardar borrador → Publicar. El límite del MP3 de proyecto es 10 MB en el servidor local; el formulario original de proyectos sigue sujeto al límite de carga de la plataforma Vercel. Para demos grandes se necesita una subida directa a Storage.

**Proponer una colaboración:** Colaborar → escuchar la base → grabar o adjuntar una toma opcional → escribir el aporte → enviar. Las muestras originales de propuesta admiten hasta 10 MB y de 0,5 a 60 segundos. El navegador prepara un WAV mono PCM de 22.050 Hz (aproximadamente 2,65 MB por minuto) antes del envío, para mantenerse por debajo del límite del cuerpo de las funciones de Vercel. El servidor vuelve a comprobar peso, formato real, duración y mensaje. El micrófono requiere HTTPS o localhost y permiso del usuario.

El feed usa paginación por fecha/ID y no descarga los bytes de audio en la lista. La reproducción carga cada demo cuando corresponde y reproduce solo el hook. Una solicitud a un proyecto propio, retirado u oculto se rechaza; el destinatario se determina en servidor.

## Cuenta y ejemplos para demostración

La cuenta existente `Abelramos` tiene rol `superadmin`, configurado en Supabase a petición del titular; no está codificado en el frontend. El inicio de sesión admite diferencias de mayúsculas/minúsculas en el nombre. Su perfil incluye dos publicaciones de demostración, un borrador y accesos a toda su actividad.

Se prepararon ejemplos identificados como **Demo ENTRA** o **[Ejemplo ENTRA]**: guardados, propuestas pendiente/aceptada/rechazada, colaboración activa/completada, avisos y un reporte resuelto con ocultación/restauración reversible. Los proyectos y las cuentas anteriores se conservan.

Los diez usuarios `demo_` son ficticios y tienen dos publicaciones cada uno. Sus instrumentales son sintéticas originales; sus retratos fueron generados con imagegen. El atlas está en `public/art/entra-artists-atlas.png` y su asignación en `src/views/artist-art.ts`. Las cuentas reales mantienen su inicial y el recurso gráfico de ENTRA; no se les atribuyen rostros inventados.

Para repetir únicamente la carga original de artistas/publicaciones se requiere FFmpeg:

```powershell
node scripts/seed-demo.mjs --dry-run
node scripts/seed-demo.mjs --env-file .env --project-ref TU_PROJECT_REF --ffmpeg-path ffmpeg
```

El script comprueba el destino y evita sustituir cuentas reales. Guarda contraseñas aleatorias en `.demo-data/credentials.private.json`, excluido de Git. No publicar ese archivo. Los ejemplos de actividad de Abel se cargaron con un script local privado y no se ejecutan al arrancar ni al desplegar.

## Verificación

```powershell
npm run typecheck
npm run test:local
```

Las pruebas locales usan modelos sustitutos y no modifican la base real. Cubren validaciones, sesión, CSRF, catálogos relacionados, alcance por usuario, perfiles, búsqueda, publicación, propuestas, audio privado, biblioteca y moderación. `npm test` también incluye pruebas de integración que pueden crear datos temporales; usar una base de prueba.

Las migraciones se verificaron además en PostgreSQL aislado: repetición, permisos, destinatarios, publicaciones privadas, colaboración única, notificaciones, cierre y moderación reversible, incluso con catálogos desactivados. Se revisó el navegador en escritorio y a 390 × 844. Una grabación real requiere comprobar el permiso y el dispositivo físico del usuario.

## Despliegue

Sitio: https://entra-admin-mvc-i5c1.vercel.app

Repositorio: https://github.com/AbelRamos16/ENTRA-Admin-MVC

Vercel usa Express, raíz del repositorio y Node 24. `vercel.json` incluye los scripts del cliente e instala las dependencias de compilación. Las migraciones deben aplicarse antes de desplegar una versión que las requiere. La rama de producción es `main`. También se conserva `render.yaml` como alternativa de servidor.

## Identidad visual

Black Pearl `#04141E`, Turquoise Sea `#64DBE8` y Flush Orange `#FF6D04`. Las transiciones respetan movimiento reducido, los estados tienen etiquetas y los controles conservan foco visible. Prompt de los retratos: atlas fotográfico 5 × 2, diez músicos adultos ficticios distintos, sin textos ni logos, fondo Black Pearl y luces turquesa/naranja.

## Integrantes

Abel Ramos y Julián Pacheco · Grupo 9 · ISWZ 3101 · NRC 5489.
