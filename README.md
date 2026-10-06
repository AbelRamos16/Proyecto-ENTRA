# ENTRA · CRUD de proyectos musicales

Aplicación académica MVC en TypeScript y Node.js. Permite crear, listar, consultar, actualizar y eliminar proyectos musicales, con persistencia real en SQLite. Basada en el concepto y la paleta del prototipo previo de ENTRA: una plataforma para compartir demos y encontrar colaboradores.

## Alcance de esta entrega

Un único CRUD: **proyectos musicales**, la entidad que conecta publicaciones y colaboraciones. Incluye nombre, género, BPM, tonalidad, colaboración buscada, descripción y estado. Los archivos de audio y los demás procesos quedan para futuras entregas. El Login corresponde al compañero del grupo; actualmente las rutas del CRUD son públicas. Este módulo por sí solo no completa el requisito de autenticación de la tarea grupal.

## Ejecutar

Requisito: **Node.js 24.16 o superior dentro de la rama 24** y npm.

```sh
npm ci
npm run dev
```

Abre http://127.0.0.1:3000/projects. `npm start` ejecuta sin modo de observación. No necesita servicios externos, compilación previa ni extensiones del navegador. Node ejecuta los archivos TypeScript; la comprobación de tipos se hace por separado.

```sh
npm run typecheck
npm test
```

SQLite crea automáticamente `data/entra.sqlite` al iniciar. La base está excluida de Git. El estado inicial es vacío: crea proyectos desde la interfaz. Reiniciar el servidor conserva los datos. `PORT` cambia el puerto y `DATABASE_PATH` cambia la ubicación de la base; el código lee variables del proceso, no archivos `.env` automáticamente.

## Estructura MVC

```text
src/
  server.ts                         Entrada HTTP y composición
  controllers/project-controller.ts Rutas, solicitudes y respuestas
  models/project.ts                 Tipos, reglas y consultas SQLite
  views/projects.ts                 HTML, formularios y vistas
public/styles.css                   Interfaz con BEM
tests/crud.test.ts                  Prueba integrada de CRUD
```

Flujo: navegador → servidor → controlador → modelo → SQLite → controlador → vista → navegador. Las vistas generan HTML desde TypeScript en el servidor; los formularios funcionan sin JavaScript en el navegador.

**KISS:** servidor HTTP nativo, una entidad, una tabla y formularios HTML. **DRY:** validación central, plantilla de página compartida, formulario compartido entre crear y editar, parámetros SQL centralizados. **Clean Code:** nombres descriptivos, tipos explícitos y separación de responsabilidades. **BEM:** bloques como `project-card`, elementos como `project-card__body` y modificadores como `button--primary`.

La interfaz aplica better-ui: radios concéntricos, profundidad por sombras, transiciones con propiedades específicas, botones con escala 0.96 y respeto a movimiento reducido. Conserva el logo original de ENTRA y adopta una dirección visual de cartel musical con negro, blanco y rosa según la nueva referencia del usuario. Incluye el logo vertical original y el isotipo en `public/brand/`, copiados como recursos independientes. Usa el logo en la navegación horizontal y el isotipo como favicon. La tipografía utiliza Anton para títulos e IBM Plex Sans 400/600 para lectura y controles. Los archivos WOFF2 y sus licencias OFL se incluyen en `public/fonts/`; se sirven localmente y no dependen de Google Fonts. Las portadas y el arte editorial generado son decorativos; no representan audio real ni carátulas subidas. La imagen se incluye en `public/art/entra-studio.png`.

## Rutas

| Método | Ruta | Operación |
|---|---|---|
| GET | `/projects` | Listar |
| GET | `/projects/new` | Formulario de creación |
| POST | `/projects` | Crear |
| GET | `/projects/:id` | Consultar detalle |
| GET | `/projects/:id/edit` | Formulario de edición |
| POST | `/projects/:id/edit` | Actualizar |
| GET | `/projects/:id/delete` | Confirmar eliminación |
| POST | `/projects/:id/delete` | Eliminar |

POST se usa en formularios HTML sin simular métodos HTTP. Después de guardar, el servidor redirige con 303 para evitar reenviar el formulario al recargar. Confirmar por GET nunca elimina datos.

## Validación y seguridad del módulo

Validación en navegador y servidor; consultas parametrizadas; salida HTML escapada; límite del cuerpo del formulario; cabeceras CSP; token contra envíos externos por formulario. El token actual pertenece al proceso y caduca al reiniciar. Al integrar Login debe asociarse a la sesión de cada usuario. No existe identidad ni control de propiedad en esta entrega. El servidor escucha solo en la máquina local.

## Integración con el Login del compañero

Crear el modelo de usuarios y el controlador de autenticación dentro de `src/`. Verificar la sesión **antes** de llamar a `projectController` en `server.ts`, cubriendo tanto GET como POST de `/projects` y todas sus subrutas. Redirigir al Login cuando no exista una sesión válida. Mantener la ruta de estilos pública. Usar contraseñas con hash y cookies de sesión HttpOnly; no aceptar un usuario enviado por el formulario como prueba de identidad.

Definir juntos si los proyectos son compartidos por el grupo o pertenecen a cada usuario. En el segundo caso añadir `ownerId` al modelo y filtrar tanto lectura como actualización y eliminación por el usuario autenticado. Sustituir el token del proceso por un token de sesión. Después de la integración probar acceso directo sin sesión, Login, CRUD con sesión y cierre de sesión.

## Git y trabajo grupal

Usar esta carpeta como raíz del repositorio, con `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `public/` y `tests/`. Versionar el lockfile. Excluir base SQLite, `node_modules`, credenciales y archivos temporales. Si ENTRA ya tiene repositorio, integrar este módulo en una rama de ese repositorio en lugar de iniciar otro dentro de él.

Para un repositorio nuevo, ejecutar dentro de esta carpeta:

```sh
git init -b main
git add .
git commit -m "feat: implementa CRUD MVC de proyectos musicales"
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

Crear ramas `feat/projects-crud` y `feat/login` desde una base común. Acordar las modificaciones a `server.ts` para reducir conflictos. Hacer commits pequeños, con mensajes como `feat: valida tempo de proyectos`, `fix: conserva datos del formulario` y `docs: explica ejecución local`. Abrir pull requests hacia `main`, revisar entre compañeros y ejecutar `npm run typecheck` y `npm test` antes de integrar. No subir secretos ni usar force-push en `main`.

## Demostración del CRUD

1. Mostrar la lista vacía y crear un proyecto con los campos musicales.
2. Abrir su detalle y editar el estado o la colaboración buscada.
3. Recargar o reiniciar el servidor para mostrar persistencia.
4. Introducir BPM inválidos y mostrar validación.
5. Abrir la confirmación de eliminación, cancelar y luego eliminar.

El video final de hasta 3 minutos también deberá incluir Login y acceso bloqueado sin sesión después de integrar el trabajo del compañero. Añadir aquí el enlace al video y los nombres reales del grupo antes de entregar el **7 de octubre de 2026 a las 18:00 (Ecuador)**.

## Referencia técnica

[Documentación oficial de SQLite en Node.js 24](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).




## Introducción al crear proyectos
Al abrir Nuevo proyecto se muestra una introducción de tres mensajes cortos con barras animadas. Siguiente avanza, Crear mi proyecto abre el formulario e Ir al formulario permite saltar la introducción. Escape también la cierra. Editar proyectos y corregir errores de validación no repiten la introducción. El formulario funciona aunque JavaScript esté desactivado.

El comportamiento del navegador se implementa en src/client/onboarding.ts; Node elimina sus tipos y lo sirve en /onboarding.js. La fuente de titulares y onboarding es Anton, incluida localmente con licencia OFL en public/fonts/LICENSE-Anton.txt. IBM Plex Sans se conserva para los campos y textos de lectura.

