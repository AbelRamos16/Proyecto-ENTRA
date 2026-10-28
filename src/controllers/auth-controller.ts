
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { UserModel } from '../models/user.ts';
import { authView } from '../views/auth.ts';

const SESSION_MAX_AGE = 8 * 60 * 60;
const CSRF_MAX_AGE = 30 * 60;
const FORM_MAX_SIZE = 16_384;

const redirect = (
  response: ServerResponse,
  path: string,
): void => {
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
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });

  response.end(body);
};

function parseCookies(
  request: IncomingMessage,
): Record<string, string> {
  const header = request.headers.cookie ?? '';
  const cookies: Record<string, string> = {};

  for (const part of header.split(';')) {
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
      cookies[name] = value;
    }
  }

  return cookies;
}

function createCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function setCsrfCookie(
  response: ServerResponse,
  name: 'entra_login_csrf' | 'entra_register_csrf',
  path: '/login' | '/register',
  token: string,
): void {
  const secure = process.env.NODE_ENV === 'production'
    ? '; Secure'
    : '';

  response.setHeader(
    'Set-Cookie',
    `${name}=${token}; HttpOnly; Path=${path}; SameSite=Strict; Max-Age=${CSRF_MAX_AGE}${secure}`,
  );
}

function clearCookie(
  response: ServerResponse,
  name: string,
  path: string,
  sameSite: 'Strict' | 'Lax' = 'Strict',
): void {
  const secure = process.env.NODE_ENV === 'production'
    ? '; Secure'
    : '';

  response.setHeader(
    'Set-Cookie',
    `${name}=; HttpOnly; Path=${path}; SameSite=${sameSite}; Max-Age=0${secure}`,
  );
}

async function readLoginForm(
  request: IncomingMessage,
): Promise<URLSearchParams> {
  const contentType = request.headers['content-type']
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== 'application/x-www-form-urlencoded') {
    throw new Error('Formato de formulario no válido.');
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;

    if (size > FORM_MAX_SIZE) {
      throw new Error('El formulario supera el tamaño permitido.');
    }

    chunks.push(buffer);
  }

  return new URLSearchParams(
    Buffer.concat(chunks).toString('utf8'),
  );
}

function isValidEmail(email: string): boolean {
  if (email.length > 254 || /\s/.test(email)) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function csrfErrorPage(message: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Solicitud no válida · ENTRA</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="workspace">
    <h1>Solicitud no válida</h1>
    <p class="notice notice--error">${message}</p>
    <p><a href="/login">Volver al inicio de sesión</a></p>
  </main>
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

  // Mostrar el formulario de registro.
  if (method === 'GET' && path === '/register') {
    const token = createCsrfToken();

    setCsrfCookie(
      response,
      'entra_register_csrf',
      '/register',
      token,
    );

    return html(
      response,
      authView('', true, '', token),
    );
  }

  // Registrar una cuenta.
  if (method === 'POST' && path === '/register') {
    let username = '';
    let email = '';

    try {
      const fields = await readLoginForm(request);
      const cookies = parseCookies(request);
      const token = cookies.entra_register_csrf ?? '';

      username = (fields.get('username') ?? '').trim();
      email = (fields.get('email') ?? '').trim();

      // Validar el token CSRF antes de registrar.
      if (!token || fields.get('csrf') !== token) {
        const newToken = createCsrfToken();

        setCsrfCookie(
          response,
          'entra_register_csrf',
          '/register',
          newToken,
        );

        return html(
          response,
          authView(
            'La sesión del formulario ha caducado. Inténtalo de nuevo.',
            true,
            username,
            newToken,
            false,
            email,
          ),
          403,
        );
      }

      const password = fields.get('password') ?? '';
      const confirmPassword = fields.get('confirmPassword') ?? '';

      let error = '';

      if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) {
        error =
          'El usuario debe tener entre 3 y 40 letras, números o guion bajo.';
      } else if (!isValidEmail(email)) {
        error = 'Ingresa un correo electrónico válido.';
      } else if (password.length < 8 || password.length > 64) {
        error = 'La contraseña debe tener entre 8 y 64 caracteres.';
      } else if (
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[^A-Za-z0-9\s]/.test(password)
      ) {
        error =
          'Incluye al menos una mayúscula, una minúscula, un número y un símbolo.';
      } else if (password !== confirmPassword) {
        error = 'Las contraseñas no coinciden.';
      }

      if (error) {
        return html(
          response,
          authView(
            error,
            true,
            username,
            token,
            false,
            email,
          ),
          422,
        );
      }

      const registered = await userModel.register(
        username,
        email,
        password,
      );

      if (!registered) {
        return html(
          response,
          authView(
            'Ese usuario o correo ya existe. Elige otro o inicia sesión.',
            true,
            username,
            token,
            false,
            email,
          ),
          409,
        );
      }

      clearCookie(response, 'entra_register_csrf', '/register');

      return redirect(response, '/login?registered=1');
    } catch (error) {
      console.error('Error durante el registro:', error);

      const newToken = createCsrfToken();

      setCsrfCookie(
        response,
        'entra_register_csrf',
        '/register',
        newToken,
      );

      return html(
        response,
        authView(
          'No pudimos procesar el registro. Inténtalo de nuevo.',
          true,
          username,
          newToken,
          false,
          email,
        ),
        500,
      );
    }
  }

  // Mostrar el formulario de inicio de sesión.
  if (method === 'GET' && path === '/login') {
    try {
      const sessionId = parseCookies(request).entra_session;

      if (
        sessionId &&
        await userModel.getSession(sessionId)
      ) {
        return redirect(response, '/projects');
      }

      const token = createCsrfToken();

      setCsrfCookie(
        response,
        'entra_login_csrf',
        '/login',
        token,
      );

      return html(
        response,
        authView(
          '',
          false,
          '',
          token,
          url.searchParams.get('registered') === '1',
        ),
      );
    } catch (error) {
      console.error('Error al consultar la sesión:', error);

      const newToken = createCsrfToken();

      setCsrfCookie(
        response,
        'entra_login_csrf',
        '/login',
        newToken,
      );

      return html(
        response,
        authView(
          'No pudimos comprobar tu sesión. Inténtalo de nuevo.',
          false,
          '',
          newToken,
        ),
        500,
      );
    }
  }

  // Validar el formulario y autenticar.
  if (method === 'POST' && path === '/login') {
    let username = '';

    try {
      const fields = await readLoginForm(request);
      const cookies = parseCookies(request);
      const token = cookies.entra_login_csrf ?? '';

      username = (fields.get('username') ?? '').trim();

      if (!token || fields.get('csrf') !== token) {
        const newToken = createCsrfToken();

        setCsrfCookie(
          response,
          'entra_login_csrf',
          '/login',
          newToken,
        );

        return html(
          response,
          authView(
            'El formulario ha caducado. Vuelve a intentarlo.',
            false,
            username,
            newToken,
          ),
          403,
        );
      }

      const password = fields.get('password') ?? '';

      if (!username || !password) {
        return html(
          response,
          authView(
            'Ingresa el usuario y la contraseña.',
            false,
            username,
            token,
          ),
          422,
        );
      }

      const user = await userModel.authenticate(
        username,
        password,
      );

      if (!user) {
        return html(
          response,
          authView(
            'Usuario o contraseña incorrectos.',
            false,
            username,
            token,
          ),
          401,
        );
      }

      const session = await userModel.createSession(user);

      const secure = process.env.NODE_ENV === 'production'
        ? '; Secure'
        : '';

      response.setHeader('Set-Cookie', [
        `entra_session=${encodeURIComponent(session.id)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`,
        `entra_login_csrf=; HttpOnly; Path=/login; SameSite=Strict; Max-Age=0${secure}`,
      ]);

      return redirect(response, '/projects');
    } catch (error) {
      console.error('Error durante el inicio de sesión:', error);

      const newToken = createCsrfToken();

      setCsrfCookie(
        response,
        'entra_login_csrf',
        '/login',
        newToken,
      );

      return html(
        response,
        authView(
          'No pudimos procesar el inicio de sesión. Inténtalo de nuevo.',
          false,
          username,
          newToken,
        ),
        500,
      );
    }
  }

  // Cerrar sesión únicamente mediante POST.
  if (path === '/logout') {
    if (method !== 'POST') {
      response.setHeader('Allow', 'POST');

      return html(
        response,
        csrfErrorPage(
          'Para cerrar sesión, utiliza el formulario de la aplicación.',
        ),
        405,
      );
    }

    try {
      const fields = await readLoginForm(request);
      const sessionId = parseCookies(request).entra_session;

      if (!sessionId) {
        clearCookie(response, 'entra_session', '/', 'Lax');
        return redirect(response, '/login');
      }

      const session = await userModel.getSession(sessionId);

      if (!session) {
        clearCookie(response, 'entra_session', '/', 'Lax');
        return redirect(response, '/login');
      }

      // Validar el token de la sesión antes de eliminarla.
      if (
        !session.csrfToken ||
        fields.get('csrf') !== session.csrfToken
      ) {
        return html(
          response,
          csrfErrorPage(
            'No se pudo validar la solicitud. Regresa a tus proyectos e inténtalo de nuevo.',
          ),
          403,
        );
      }

      await userModel.deleteSession(sessionId);

      clearCookie(response, 'entra_session', '/', 'Lax');

      return redirect(response, '/login');
    } catch (error) {
      console.error('Error al cerrar la sesión:', error);

      return html(
        response,
        csrfErrorPage(
          'No pudimos cerrar la sesión. Inténtalo de nuevo.',
        ),
        500,
      );
    }
  }

  // Ruta no reconocida.
  return html(
    response,
    '<h1>Página no encontrada</h1><a href="/login">Volver al inicio de sesión</a>',
    404,
  );
}
