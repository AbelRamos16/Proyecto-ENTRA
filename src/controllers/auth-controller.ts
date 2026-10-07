import { randomBytes } from 'node:crypto';
import { authView } from '../views/auth.ts';
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

export async function authController(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  userModel: UserModel,
): Promise<void> {
  const path = url.pathname;
  const method = request.method;

  if (method === 'GET' && path === '/register') {
    const token = randomBytes(32).toString('hex');
    response.setHeader('Set-Cookie', `entra_register_csrf=${token}; HttpOnly; Path=/register; SameSite=Strict; Max-Age=1800`);
    return html(response, authView('', true, '', token));
  }

  if (method === 'POST' && path === '/register') {
    let username = '';
    const token = parseCookies(request).entra_register_csrf ?? '';
    try {
      const fields = await readLoginForm(request);
      if (!token || fields.get('csrf') !== token) {
        return html(response, authView('Abre de nuevo Crear una cuenta para continuar.', true), 403);
      }
      username = (fields.get('username') ?? '').trim();
      const password = fields.get('password') ?? '';
      let error = '';
      if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) error = 'El usuario debe tener entre 3 y 40 letras, números o guion bajo.';
      else if (password.length < 8 || password.length > 64) error = 'La contraseña debe tener entre 8 y 64 caracteres.';
      else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) error = 'Incluye al menos una mayúscula, una minúscula, un número y un símbolo.';
      else if (password !== fields.get('confirmPassword')) error = 'Las contraseñas no coinciden.';
      if (error) return html(response, authView(error, true, username, token), 422);
      if (!userModel.register(username, password)) {
        return html(response, authView('Ese usuario ya existe. Elige otro o inicia sesión.', true, username, token), 409);
      }
      response.setHeader('Set-Cookie', 'entra_register_csrf=; HttpOnly; Path=/register; SameSite=Strict; Max-Age=0');
      return redirect(response, '/login?registered=1');
    } catch (error) {
      console.error(error);
      return html(response, authView('No pudimos procesar el registro. Revisa el formulario e inténtalo de nuevo.', true, username, token), 400);
    }
  }

  if (method === 'GET' && path === '/login') {
    const cookies = parseCookies(request);
    const sessionId = cookies.entra_session;

    if (sessionId && userModel.getSession(sessionId)) {
      return redirect(response, '/projects');
    }

    return html(response, authView('', false, '', '', url.searchParams.get('registered') === '1'));
  }

  if (method === 'POST' && path === '/login') {
    try {
      const fields = await readLoginForm(request);

      const username = (fields.get('username') ?? '').trim();
      const password = fields.get('password') ?? '';

      if (!username || !password) {
        return html(
          response,
          authView('Ingresa el usuario y la contraseña.'),
          422,
        );
      }

      if (!userModel.authenticate(username, password)) {
        return html(
          response,
          authView('Usuario o contraseña incorrectos.'),
          401,
        );
      }

      const session = userModel.createSession(username);

      if (!session) {
        return html(
          response,
          authView('No se pudo crear la sesión.'),
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
        authView('No pudimos procesar el inicio de sesión.'),
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
