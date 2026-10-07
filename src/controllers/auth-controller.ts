import type { IncomingMessage, ServerResponse } from 'node:http';
import { UserModel } from '../models/user.ts';

const redirect = (response: ServerResponse, path: string): void => {
  response.writeHead(303, { Location: path });
  response.end();
};

const html = (
  response: ServerResponse,
  body: string,
  status = 200,
): void => {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(body);
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

function parseCookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie ?? '';
  const cookies: Record<string, string> = {};

  for (const part of header.split(';')) {
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

async function readLoginForm(
  request: IncomingMessage,
): Promise<URLSearchParams> {
  if (
    !request.headers['content-type']?.startsWith(
      'application/x-www-form-urlencoded',
    )
  ) {
    throw new Error('Formato de formulario no válido.');
  }

  let body = '';
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > 16_384) {
      throw new Error('El formulario supera el tamaño permitido.');
    }

    body += chunk.toString();
  }

  return new URLSearchParams(body);
}

function loginView(error = ''): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Iniciar sesión · ENTRA</title>
  <link rel="icon" type="image/svg+xml" href="/brand/entra-isotipo.svg">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="app-shell">
    <header class="masthead">
      <a class="masthead__brand" href="/login" aria-label="ENTRA">
        <img
          src="/brand/entra-logo-vertical.svg"
          alt="ENTRA"
          width="2000"
          height="2200"
        >
      </a>
    </header>

    <main class="workspace">
      <section class="heading">
        <div>
          <p class="eyebrow">ESTUDIO DE COLABORACIÓN</p>
          <h1>Iniciar sesión</h1>
          <p class="muted">
            Accede a tus proyectos musicales.
          </p>
        </div>
      </section>

      ${
        error
          ? `<p class="notice notice--error" role="alert">${escapeHtml(error)}</p>`
          : ''
      }

      <form class="project-form" method="post" action="/login">
        <div class="project-form__grid">
          <label class="field field--wide">
            Usuario
            <input
              name="username"
              type="text"
              required
              autocomplete="username"
              maxlength="80"
              placeholder="Ingresa tu usuario"
            >
          </label>

          <label class="field field--wide">
            Contraseña
            <input
              name="password"
              type="password"
              required
              autocomplete="current-password"
              maxlength="120"
              placeholder="Ingresa tu contraseña"
            >
          </label>
        </div>

        <div class="project-form__actions">
          <button class="button button--primary" type="submit">
            Iniciar sesión
          </button>
        </div>
      </form>
    </main>

    <footer class="app-footer">
      <span>Hecho para hacer música.</span>
      <span>ENTRA / Estudio de colaboración</span>
    </footer>
  </div>
</body>
</html>`;
}

export async function authController(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  userModel: UserModel,
): Promise<void> {
  const path = url.pathname;
  const method = request.method;

  if (method === 'GET' && path === '/login') {
    const cookies = parseCookies(request);
    const sessionId = cookies.entra_session;

    if (sessionId && userModel.getSession(sessionId)) {
      return redirect(response, '/projects');
    }

    return html(response, loginView());
  }

  if (method === 'POST' && path === '/login') {
    try {
      const fields = await readLoginForm(request);

      const username = (fields.get('username') ?? '').trim();
      const password = fields.get('password') ?? '';

      if (!username || !password) {
        return html(
          response,
          loginView('Ingresa el usuario y la contraseña.'),
          422,
        );
      }

      if (!userModel.authenticate(username, password)) {
        return html(
          response,
          loginView('Usuario o contraseña incorrectos.'),
          401,
        );
      }

      const session = userModel.createSession(username);

      if (!session) {
        return html(
          response,
          loginView('No se pudo crear la sesión.'),
          500,
        );
      }

      response.setHeader(
        'Set-Cookie',
        `entra_session=${encodeURIComponent(session.id)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8 * 60 * 60}`,
      );

      return redirect(response, '/projects');
    } catch (error) {
      console.error(error);

      return html(
        response,
        loginView('No pudimos procesar el inicio de sesión.'),
        400,
      );
    }
  }

  if (method === 'GET' && path === '/logout') {
    const cookies = parseCookies(request);
    const sessionId = cookies.entra_session;

    if (sessionId) {
      userModel.deleteSession(sessionId);
    }

    response.setHeader(
      'Set-Cookie',
      'entra_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    );

    return redirect(response, '/login');
  }

  html(
    response,
    '<h1>Página no encontrada</h1><a href="/login">Volver al Login</a>',
    404,
  );
}