<p align="center">
  <img src="public/brand/entra-logo-vertical.svg" alt="Logo de ENTRA" width="110">
</p>

# ENTRA · Tu próxima colaboración empieza aquí

ENTRA es un espacio para músicos y productores que quieren dar el siguiente paso con una canción. Permite organizar proyectos, compartir una demo y señalar el fragmento donde hace falta una voz, un instrumento u otra perspectiva.

Este repositorio implementa el módulo académico de **proyectos musicales con CRUD, registro e inicio de sesión**, usando TypeScript, Node.js y el patrón MVC.

**Estado:** prototipo funcional para ejecución local, en desarrollo como parte del proyecto de semestre. La biblioteca es compartida entre las cuentas: todavía no existe separación de proyectos por propietario ni un sistema de solicitudes de colaboración.

## Índice

- [Funcionalidades](#funcionalidades)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Cómo usar ENTRA](#cómo-usar-entra)
- [Ejemplo de CRUD](#ejemplo-de-crud)
- [Tecnologías](#tecnologías)
- [Arquitectura MVC](#arquitectura-mvc)
- [Clean Code, KISS, DRY y BEM](#clean-code-kiss-dry-y-bem)
- [Rutas](#rutas)
- [Validación y sesiones](#validación-y-sesiones)
- [Verificación](#verificación)
- [Trabajo con Git](#trabajo-con-git)
- [Equipo y demostración](#equipo-y-demostración)
- [Licencias y referencias](#licencias-y-referencias)

## Funcionalidades

- Crear una cuenta, iniciar sesión y cerrar sesión desde la navegación.
- Proteger la biblioteca, los formularios y el audio frente al acceso sin autenticación.
- Crear, listar, consultar, editar y eliminar proyectos musicales.
- Registrar nombre, género, BPM, tonalidad, colaboración buscada, descripción y estado.
- Adjuntar una demo **MP3 de hasta 10 MB** y reproducirla en el navegador.
- Seleccionar el **hook** sobre la onda real del audio, arrastrando sus extremos con ratón o tacto. Los marcadores también admiten teclado: flechas para décimas de segundo y Shift + flechas para segundos.
- Escuchar el fragmento seleccionado antes de guardar. Los campos numéricos permiten ajustes precisos y sirven como alternativa si no se puede dibujar la onda.
- Conservar la demo al editar sin adjuntar otro archivo y recuperar los tiempos del hook guardado.
- Confirmar la eliminación. **Conservar proyecto** vuelve a la biblioteca; eliminar borra también la demo y el hook.
- Mostrar una introducción breve al crear un proyecto, que puede saltarse.

La interfaz usa grafito, cobalto y ámbar, con el logo de ENTRA adaptado a la paleta, titulares Anton y texto IBM Plex Sans. Las tarjetas incluyen un disco vectorial y barras animadas decorativas; la onda del formulario sí se genera a partir del MP3. La interfaz adapta sus controles a celular y respeta la preferencia de movimiento reducido.

## Instalación y ejecución

### Requisitos

- **Node.js >= 24.16.0 y < 25**, según `package.json`.
- npm y Git.

### Descargar y ejecutar

```powershell
git clone https://github.com/AbelRamos16/Proyecto-ENTRA.git
cd Proyecto-ENTRA
npm ci
npm run dev
```

Abre [ENTRA en tu equipo](http://127.0.0.1:3000/projects). Si no tienes una sesión válida, se mostrará el Login. Desde allí puedes crear una cuenta.

Para ejecutar sin reinicio automático:

```powershell
npm start
```

Node ejecuta los archivos TypeScript directamente; no se necesita una compilación previa. `npm run typecheck` comprueba los tipos por separado.

### Datos y configuración

SQLite crea automáticamente `data/entra.sqlite`. Allí se guardan proyectos, audio, usuarios y sesiones; los datos permanecen al reiniciar el servidor. No se necesita instalar un servidor de base de datos.

| Variable | Valor predeterminado | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor local |
| `DATABASE_PATH` | `data/entra.sqlite` en el proyecto | Ubicación de la base SQLite |

Ejemplo en PowerShell, si el puerto 3000 ya está ocupado:

```powershell
$env:PORT = "3001"
npm run dev
```

Abre entonces `http://127.0.0.1:3001/projects`. La aplicación lee variables del proceso; no carga archivos `.env` automáticamente. El servidor escucha en `127.0.0.1`.

Se crea también una cuenta de demostración local: usuario `example`, contraseña `1234`. Las cuentas nuevas deben cumplir los requisitos de registro indicados más adelante.

## Cómo usar ENTRA

1. Crea una cuenta y después inicia sesión.
2. Pulsa **Nuevo proyecto**. Avanza o salta la introducción para llegar al formulario.
3. Completa la información musical y la colaboración que buscas.
4. Opcionalmente, adjunta un MP3. Si lo adjuntas, define el inicio y fin del hook, prueba el fragmento y guarda.
5. Desde la biblioteca, abre **Ver detalles** o el título para consultar los datos y escuchar la demo o el hook.
6. Usa el icono de edición de la portada, el control móvil junto al estado o **Editar proyecto** en el detalle para modificar la ficha.
7. Para borrar, pulsa **Eliminar proyecto** en la tarjeta de la biblioteca y confirma. Esta opción no aparece en el formulario de edición.
8. Pulsa **Cerrar sesión** en la navegación al terminar.

La lectura y la edición tienen pantallas separadas. Abrir un detalle o formulario no modifica los datos; **Guardar cambios** realiza la actualización.

## Ejemplo de CRUD

| Operación | Ejemplo en ENTRA |
|---|---|
| **Create — Crear** | Crear «Ciudad de noche»: Indie, 120 BPM, La menor, buscando voz para el coro. Adjuntar una demo de más de 50 segundos y seleccionar el hook entre 30 y 45 segundos. |
| **Read — Leer** | Abrir la biblioteca y el detalle del proyecto para consultar su información y escuchar el hook. |
| **Update — Actualizar** | Editar el estado a «En producción» y mover el final del hook a 50 segundos. Guardar y comprobar el resultado. |
| **Delete — Eliminar** | Pulsar «Eliminar proyecto» en la tarjeta. Probar «Conservar proyecto» y después repetir la acción confirmando la eliminación. |

## Tecnologías

| Tecnología | Responsabilidad |
|---|---|
| TypeScript | Tipos y lógica del servidor y del navegador |
| Node.js 24 | Servidor HTTP nativo y ejecución de TypeScript |
| SQLite con `node:sqlite` | Persistencia local y consultas parametrizadas |
| `music-metadata` | Lectura y validación de la duración y formato del MP3 |
| HTML y CSS | Vistas renderizadas en servidor e interfaz con BEM |
| Web Audio, Canvas y Pointer Events | Onda real y selección interactiva del hook |
| `node:crypto` | Hash de contraseñas, tokens y sesiones |
| `node:test` | Pruebas de integración HTTP |

## Arquitectura MVC

```text
src/
├── server.ts                         Servidor, recursos y control de acceso
├── controllers/
│   ├── project-controller.ts         Solicitudes y operaciones del CRUD
│   └── auth-controller.ts            Registro, Login y cierre de sesión
├── models/
│   ├── project.ts                    Validación y persistencia de proyectos
│   ├── audio.ts                      Validación del MP3 y sus metadatos
│   └── user.ts                       Usuarios, hashes y sesiones
├── views/
│   ├── projects.ts                   Biblioteca, detalle, formularios y confirmación
│   └── auth.ts                       Login y registro
└── client/
    ├── onboarding.ts                 Introducción al crear un proyecto
    ├── password-feedback.ts          Requisitos de contraseña en tiempo real
    └── project-audio.ts              Audio, onda y selección del hook
public/
├── styles.css                        Estilos y componentes BEM
├── brand/                            Logo e isotipo
├── fonts/                            Fuentes locales y licencias
└── art/                              Recursos visuales de iteraciones del diseño
tests/
├── crud.test.ts                      CRUD, validación y persistencia
├── register.test.ts                  Registro y autenticación
└── audio.test.ts                     MP3, hook y acceso al audio
```

**Flujo:** navegador → servidor → controlador → modelo/SQLite → controlador → vista → navegador.

Las vistas generan HTML en el servidor. Las operaciones básicas usan formularios HTML; JavaScript añade el onboarding, la información de contraseña y el selector visual. Node elimina los tipos de los módulos del navegador antes de servirlos como JavaScript.

El audio se almacena como BLOB junto al proyecto. Las columnas de audio y hook se añaden automáticamente a bases anteriores sin borrar proyectos existentes.

## Clean Code, KISS, DRY y BEM

| Principio | Aplicación y ejemplo |
|---|---|
| **Clean Code** | Responsabilidades separadas y nombres concretos: `validateProject`, `validateAudio`, `createSession` y `deleteSession`. El controlador coordina solicitudes; los modelos validan y acceden a los datos; las vistas producen HTML. |
| **KISS** | Servidor HTTP nativo, SQLite local y formularios HTML, sin una infraestructura adicional para este módulo. |
| **DRY** | `layout()` comparte la estructura de página; `formView()` sirve para crear y editar; `escapeHtml()` centraliza el escape de contenido. |
| **BEM** | Bloque `project-card`, elemento `project-card__body` y modificador `project-card__cover--0`. Otro ejemplo: bloque `button` y modificador `button--primary`. |

Estos ejemplos pueden localizarse en `src/views/projects.ts`, `src/models/` y `public/styles.css`.

## Rutas

| Método | Ruta | Función |
|---|---|---|
| GET / POST | `/register` | Mostrar registro / crear cuenta |
| GET / POST | `/login` | Mostrar Login / iniciar sesión |
| GET | `/logout` | Invalidar la sesión y volver al Login |
| GET | `/projects` | Leer la biblioteca |
| GET | `/projects/new` | Mostrar formulario de creación |
| POST | `/projects` | Crear un proyecto |
| GET | `/projects/:id` | Leer el detalle |
| GET | `/projects/:id/edit` | Mostrar formulario de edición |
| POST | `/projects/:id/edit` | Actualizar el proyecto |
| GET | `/projects/:id/delete` | Mostrar confirmación |
| POST | `/projects/:id/delete` | Eliminar el proyecto y su audio |
| GET | `/projects/:id/audio` | Reproducir audio; admite solicitudes parciales |

El CRUD y el audio requieren sesión. Tras guardar o eliminar se utiliza una redirección HTTP 303 para evitar reenviar el formulario al recargar. Abrir la confirmación por GET no elimina datos.

## Validación y sesiones

- Usuario nuevo: 3–40 letras, números o guion bajo; se rechazan nombres duplicados.
- Contraseña nueva: 8–64 caracteres, con mayúscula, minúscula, número y símbolo; requiere confirmación. La interfaz muestra qué requisitos faltan mientras escribes.
- Contraseñas almacenadas con `scrypt` y sal aleatoria, con comparación mediante `timingSafeEqual`.
- Sesiones de ocho horas y cookie `HttpOnly` con `SameSite=Lax`. Cerrar sesión invalida la sesión y elimina la cookie.
- Token CSRF asociado a la sesión para el CRUD; el registro usa un token y una cookie propia `SameSite=Strict`.
- Validación en servidor, consultas parametrizadas, contenido HTML escapado y cabeceras CSP.
- MP3 opcional de hasta 10 MB. El servidor comprueba el formato y la duración real; con audio, el hook es obligatorio y debe cumplir `0 ≤ inicio < fin ≤ duración`.

Tras un error de formulario puede ser necesario volver a seleccionar el archivo. Todos los usuarios autenticados acceden a la misma biblioteca; la autenticación actual no implementa propiedad individual de proyectos.

## Verificación

```powershell
npm run typecheck
npm test
```

Las tres pruebas integradas cubren CRUD, validación, escape HTML, CSRF, persistencia, registro, duplicados, Login, cierre de sesión, acceso protegido, carga de MP3, límites del hook, solicitudes parciales de audio y conservación del archivo al editar.

La interacción visual de la onda, los arrastres y la adaptación móvil deben comprobarse también en el navegador; las pruebas HTTP no sustituyen esa revisión.

## Trabajo con Git

El repositorio versiona `src/`, `public/`, `tests/`, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json` y `.gitignore`.

Se excluyen `node_modules/`, `data/`, `.env`, cobertura, logs y los documentos internos `DESIGN.md` y `VERIFICACION.md`.

Para nuevas tareas, crear una rama desde `main` actualizado, por ejemplo `feat/projects-audio` o `feat/login`, hacer commits pequeños y abrir un pull request para revisión del compañero. Acordar cambios en `server.ts`, que comparten los módulos.

Ejemplo para guardar cambios de implementación:

```powershell
git status
git add src public tests README.md package.json package-lock.json
git diff --cached --stat
git commit -m "feat: mejora proyectos musicales y selección del hook"
```

Antes de integrar, ejecutar las comprobaciones y revisar el diff. Versionar el lockfile y no subir la base de datos ni credenciales.

## Equipo y demostración

Repositorio: [Proyecto-ENTRA](https://github.com/AbelRamos16/Proyecto-ENTRA).

Contribuyentes identificados en el historial del repositorio:

- [AbelRamos16](https://github.com/AbelRamos16).
- [JulianPachecoUdla](https://github.com/JulianPachecoUdla).

**Video de entrega:** pendiente de añadir el enlace de Loom o YouTube. Duración máxima: tres minutos.

Recorrido sugerido: intentar entrar a `/projects` sin sesión, registrar una cuenta, iniciar sesión, crear un proyecto con MP3 y hook, consultar el detalle, editar, probar la confirmación de eliminación y cerrar sesión.

## Licencias y referencias

El repositorio no incluye actualmente una licencia general del proyecto. Las fuentes distribuidas tienen sus avisos de licencia en `public/fonts/`, incluidos `LICENSE-Anton.txt` y `LICENSE-IBM-Plex.txt`.

La organización de este README toma como referencia [Cómo escribir un README increíble en tu Github, de Alura](https://www.aluracursos.com/blog/como-escribir-un-readme-increible-en-tu-github).
