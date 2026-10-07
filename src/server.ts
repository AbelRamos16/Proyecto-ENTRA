import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
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

    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }

  return cookies;
}

export function createApp(
  databasePath = fileURLToPath(
    new URL('../data/entra.sqlite', import.meta.url),
  ),
) {
  const model = new ProjectModel(databasePath);
  const userModel = new UserModel(databasePath);

  /*
   * El CRUD ya utiliza un token CSRF.
   *
   * Mientras mantenemos intacto project-controller.ts,
   * este token será el token CSRF de la sesión autenticada.
   */
  const fallbackToken = randomBytes(32).toString('hex');

  const assets = new Map([
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
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );

    response.setHeader(
      'X-Content-Type-Options',
      'nosniff',
    );

    response.setHeader(
      'Cache-Control',
      'no-store',
    );

    try {
      const url = new URL(
        request.url ?? '/',
        'http://localhost',
      );

      if (request.method === 'GET' && url.pathname === '/password-feedback.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        response.end(stripTypeScriptTypes(readFileSync(new URL('./client/password-feedback.ts', import.meta.url), 'utf8')));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/project-audio.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        response.end(stripTypeScriptTypes(readFileSync(new URL('./client/project-audio.ts', import.meta.url), 'utf8')));
        return;
      }

      /*
       * Recursos públicos
       * ----------------------------------------
       * Estos recursos NO necesitan autenticación.
       */

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
              new URL(
                './client/onboarding.ts',
                import.meta.url,
              ),
              'utf8',
            ),
          ),
        );

        return;
      }

      const asset = assets.get(url.pathname);

      if (
        request.method === 'GET' &&
        asset
      ) {
        response.writeHead(200, {
          'Content-Type': asset.type,
        });

        response.end(asset.body);

        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/styles.css'
      ) {
        response.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
        });

        response.end(
          readFileSync(
            new URL(
              '../public/styles.css',
              import.meta.url,
            ),
          ),
        );

        return;
      }

      /*
       * Rutas de autenticación
       * ----------------------------------------
       */

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

      /*
       * Protección del CRUD
       * ----------------------------------------
       */

      const cookies = parseCookies(
        request.headers.cookie,
      );

      const sessionId = cookies.entra_session;

      const session = sessionId
        ? userModel.getSession(sessionId)
        : undefined;

      if (!session) {
        response.writeHead(303, {
          Location: '/login',
        });

        response.end();

        return;
      }

      /*
       * Si existe una sesión válida, utilizamos
       * el token CSRF de esa sesión.
       *
       * project-controller.ts no necesita modificarse.
       */
      const token = session.csrfToken;

      await projectController(
        request,
        response,
        url,
        model,
        token || fallbackToken,
      );
    } catch (error) {
      console.error(error);

      html(
        response,
        '<h1>No pudimos completar la solicitud.</h1><a href="/login">Volver al Login</a>',
        500,
      );
    }
  });

  return {
    server,
    model,
    userModel,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const port = Number(
    process.env.PORT ?? 3000,
  );

  const { server } = createApp(
    process.env.DATABASE_PATH,
  );

  server.listen(
    port,
    '127.0.0.1',
    () =>
      console.log(
        `ENTRA: http://127.0.0.1:${port}/projects`,
      ),
  );
}
