
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

import { ProjectModel } from './models/project.ts';
import { UserModel } from './models/user.ts';
import {
  projectController,
  html,
} from './controllers/project-controller.ts';
import { authController } from './controllers/auth-controller.ts';

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Ignora cookies mal formadas.
    }
  }

  return cookies;
}

export function createApp() {
  // Ambos modelos trabajan con Supabase.
  const model = new ProjectModel();
  const userModel = new UserModel();

  // Recursos estáticos de la interfaz.
  const assets = new Map<
    string,
    { type: string; body: Buffer }
  >([
    [
      '/fonts/anton-latin-400-normal.woff2',
      {
        type: 'font/woff2',
        body: readFileSync(
          new URL(
            '../public/fonts/anton-latin-400-normal.woff2',
            import.meta.url,
          ),
        ),
      },
    ],
    [
      '/brand/entra-logo-vertical.svg',
      {
        type: 'image/svg+xml',
        body: readFileSync(
          new URL(
            '../public/brand/entra-logo-vertical.svg',
            import.meta.url,
          ),
        ),
      },
    ],
    [
      '/fonts/watchout-demo.ttf',
      {
        type: 'font/ttf',
        body: readFileSync(
          new URL(
            '../public/fonts/watchout-demo.ttf',
            import.meta.url,
          ),
        ),
      },
    ],
    [
      '/brand/entra-logo-vertical.png',
      {
        type: 'image/png',
        body: readFileSync(
          new URL(
            '../public/brand/entra-logo-vertical.png',
            import.meta.url,
          ),
        ),
      },
    ],
    [
      '/brand/entra-isotipo.svg',
      {
        type: 'image/svg+xml',
        body: readFileSync(
          new URL(
            '../public/brand/entra-isotipo.svg',
            import.meta.url,
          ),
        ),
      },
    ],
    [
      '/art/entra-studio.png',
      {
        type: 'image/png',
        body: readFileSync(
          new URL(
            '../public/art/entra-studio.png',
            import.meta.url,
          ),
        ),
      },
    ],
  ]);

  // Fuentes adicionales.
  for (const name of [
    'lilita-one-latin-400-normal.woff2',
    'barlow-condensed-latin-600-normal.woff2',
    'ibm-plex-sans-latin-400-normal.woff2',
    'ibm-plex-sans-latin-600-normal.woff2',
  ]) {
    assets.set(`/fonts/${name}`, {
      type: 'font/woff2',
      body: readFileSync(
        new URL(`../public/fonts/${name}`, import.meta.url),
      ),
    });
  }

  const server = createServer(async (request, response) => {
    // Cabeceras de seguridad.
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );

    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    try {
      const url = new URL(
        request.url ?? '/',
        'http://localhost',
      );

      // Scripts públicos utilizados por la interfaz.
      if (
        request.method === 'GET' &&
        url.pathname === '/password-feedback.js'
      ) {
        response.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
        });

        response.end(
          stripTypeScriptTypes(
            readFileSync(
              new URL(
                './client/password-feedback.ts',
                import.meta.url,
              ),
              'utf8',
            ),
          ),
        );

        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/project-audio.js'
      ) {
        response.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
        });

        response.end(
          stripTypeScriptTypes(
            readFileSync(
              new URL(
                './client/project-audio.ts',
                import.meta.url,
              ),
              'utf8',
            ),
          ),
        );

        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/onboarding.js'
      ) {
        response.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
        });

        response.end(
          stripTypeScriptTypes(
            readFileSync(
              new URL('./client/onboarding.ts', import.meta.url),
              'utf8',
            ),
          ),
        );

        return;
      }

      // Archivos estáticos: imágenes y fuentes.
      const asset = assets.get(url.pathname);

      if (request.method === 'GET' && asset) {
        response.writeHead(200, {
          'Content-Type': asset.type,
        });

        response.end(asset.body);
        return;
      }

      // Hoja de estilos.
      if (
        request.method === 'GET' &&
        url.pathname === '/styles.css'
      ) {
        response.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
        });

        response.end(
          readFileSync(
            new URL('../public/styles.css', import.meta.url),
          ),
        );

        return;
      }

      // Rutas públicas de autenticación.
      if (
        url.pathname === '/login' ||
        url.pathname === '/register' ||
        url.pathname === '/logout'
      ) {
        await authController(
          request,
          response,
          url,
          userModel,
        );

        return;
      }

      // Las demás rutas requieren una sesión válida.
      const cookies = parseCookies(request.headers.cookie);
      const sessionId = cookies.entra_session;

      if (!sessionId) {
        response.writeHead(303, {
          Location: '/login',
        });

        response.end();
        return;
      }

      // getSession es asíncrono porque consulta Supabase.
      const session = await userModel.getSession(sessionId);

      if (!session) {
        response.writeHead(303, {
          Location: '/login',
          'Set-Cookie':
            'entra_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        });

        response.end();
        return;
      }

      // El usuario se obtiene de la sesión validada.
      const user = {
        id: session.userId,
        username: session.username,
        role: session.role,
      };

      // El controlador de proyectos también es asíncrono.
      await projectController(
        request,
        response,
        url,
        model,
        session.csrfToken,
        user,
      );
    } catch (error) {
      console.error('Error al procesar la solicitud:', error);

      if (!response.headersSent) {
        html(
          response,
          '<h1>No pudimos completar la solicitud.</h1><a href="/login">Volver al Login</a>',
          500,
        );
      } else if (!response.writableEnded) {
        response.end();
      }
    }
  });

  return {
    server,
    model,
    userModel,
  };
}

// Inicia el servidor únicamente cuando este archivo se ejecuta directamente.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const port = Number(process.env.PORT ?? 3000);
  const { server } = createApp();

  server.listen(port, '127.0.0.1', () => {
    console.log(`ENTRA: http://127.0.0.1:${port}/login`);
  });
}
