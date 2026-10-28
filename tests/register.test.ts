
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createApp } from '../src/server.ts';
import { supabaseAdmin } from '../src/config/supabase.ts';
import { UserModel } from '../src/models/user.ts';
import { cleanupTemporaryUser } from './helpers/supabase-test-cleanup.ts';

test('Registro: validación, duplicados, persistencia y acceso autenticado', async () => {
  const uniqueId = randomUUID().replaceAll('-', '').slice(0, 16);
  const username = `artist_${uniqueId}`;
  const email = `artist_${uniqueId}@example.com`;
  const password = 'StudioPass123!';

  const { server } = createApp();

  let serverStarted = false;
  let registeredUserId: string | undefined;

  try {
    // Iniciar el servidor HTTP.
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    serverStarted = true;

    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const base = `http://127.0.0.1:${address.port}`;

    // La página de login debe conservar el enlace al registro.
    const loginPage = await (
      await fetch(`${base}/login`)
    ).text();

    assert.match(loginPage, /href="[^"]*register/);

    // Abrir el formulario de registro y obtener su token CSRF.
    const welcome = await fetch(`${base}/register`);
    const body = await welcome.text();

    assert.equal(welcome.status, 200);
    assert.match(body, /name="confirmPassword"/);
    assert.match(body, /Confirmar contraseña/);
    assert.match(body, /name="email"/);
    assert.match(body, /type="email"/);

    const tokenMatch = body.match(
      /name="csrf" value="([^"]+)"/,
    );

    assert.ok(tokenMatch, 'Debe existir un token CSRF');

    const token = tokenMatch[1];

    const registerCookie = welcome.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('entra_register_csrf='));

    assert.ok(registerCookie, 'Debe establecerse la cookie CSRF');

    const cookiePair = registerCookie.split(';')[0];

    const fields = {
      username,
      email,
      password,
      confirmPassword: password,
      csrf: token,
    };

    const register = (
      changes: Record<string, string> = {},
    ) =>
      fetch(`${base}/register`, {
        method: 'POST',
        headers: {
          Cookie: cookiePair,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          ...fields,
          ...changes,
        }),
        redirect: 'manual',
      });

    // Token CSRF incorrecto.
    assert.equal(
      (await register({ csrf: 'incorrect' })).status,
      403,
    );

    // Nombre de usuario inválido.
    assert.equal(
      (await register({ username: '<script>' })).status,
      422,
    );

    // Correo vacío o inválido.
    assert.equal(
      (await register({ email: '' })).status,
      422,
    );

    assert.equal(
      (await register({ email: 'correo-no-valido' })).status,
      422,
    );

    // Contraseña demasiado corta.
    assert.equal(
      (
        await register({
          password: 'short',
          confirmPassword: 'short',
        })
      ).status,
      422,
    );

    // Comprobar cada requisito de complejidad.
    for (const invalidPassword of [
      'studiopass123!',
      'STUDIOPASS123!',
      'StudioPassWord!',
      'StudioPass123',
    ]) {
      assert.equal(
        (
          await register({
            password: invalidPassword,
            confirmPassword: invalidPassword,
          })
        ).status,
        422,
        `Se debe rechazar la contraseña ${invalidPassword}`,
      );
    }

    // Las contraseñas deben coincidir.
    const mismatch = await register({
      confirmPassword: 'DifferentPass123!',
    });

    assert.equal(mismatch.status, 422);

    const errorPage = await mismatch.text();

    assert.ok(
      errorPage.includes(username),
      'El formulario debe conservar el nombre ingresado',
    );

    assert.ok(
      errorPage.includes(email),
      'El formulario debe conservar el correo ingresado',
    );

    // La contraseña no debe volver a mostrarse en el formulario.
    assert.ok(
      !errorPage.includes(password),
      'La contraseña no debe volver a mostrarse en el formulario',
    );

    // Registrar el usuario en Supabase.
    const created = await register();

    assert.equal(created.status, 303);
    assert.equal(
      created.headers.get('location'),
      '/login?registered=1',
    );

    // Buscar la cuenta creada en Supabase Auth.
    // Se recorren las páginas para no depender de que esté en la primera.
    let page = 1;
    let foundUser:
      | { id: string; email?: string }
      | undefined;

    while (!foundUser) {
      const { data: authUsers, error: authUsersError } =
        await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 100,
        });

      if (authUsersError) {
        throw new Error(
          `No se pudieron consultar las cuentas de prueba: ${authUsersError.message}`,
        );
      }

      const matchingUser = authUsers.users.find(
        (user) => user.email?.toLowerCase() === email.toLowerCase(),
      );

      if (matchingUser) {
        foundUser = {
          id: matchingUser.id,
          email: matchingUser.email,
        };
        break;
      }

      if (authUsers.users.length < 100) {
        break;
      }

      page += 1;
    }

    assert.ok(
      foundUser,
      'El usuario debe existir en Supabase Auth',
    );

    registeredUserId = foundUser.id;

    // Comprobar que el trigger creó el perfil asociado.
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username, role')
        .eq('id', registeredUserId)
        .single();

    if (profileError) {
      throw new Error(
        `No se pudo consultar el perfil creado: ${profileError.message}`,
      );
    }

    assert.equal(profile.username, username);
    assert.equal(profile.role, 'user');

    // Un nombre o correo duplicado debe rechazarse.
    assert.equal(
      (await register()).status,
      409,
    );

    // El usuario debe poder autenticarse con su contraseña.
    const userModel = new UserModel();

    const authenticatedUser = await userModel.authenticate(
      username,
      password,
    );

    assert.ok(authenticatedUser);
    assert.equal(authenticatedUser.id, registeredUserId);
    assert.equal(authenticatedUser.username, username);
    assert.equal(authenticatedUser.role, 'user');

    assert.equal(
      await userModel.authenticate(username, 'WrongPass123!'),
      undefined,
    );

    // Las rutas privadas deben redirigir a login sin una sesión.
    for (const route of [
      '/projects',
      '/projects/new',
      '/projects/1/edit',
    ]) {
      const protectedPage = await fetch(`${base}${route}`, {
        redirect: 'manual',
      });

      assert.equal(protectedPage.status, 303);
      assert.equal(
        protectedPage.headers.get('location'),
        '/login',
      );
    }

    // Iniciar sesión desde el formulario HTTP.
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username,
        password,
      }),
      redirect: 'manual',
    });

    assert.equal(login.status, 303);

    const sessionCookie = login.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('entra_session='));

    assert.ok(
      sessionCookie,
      'El login debe establecer la cookie de sesión',
    );

    const sessionCookiePair = sessionCookie.split(';')[0];

    const authenticatedProjects = await fetch(`${base}/projects`, {
      headers: {
        Cookie: sessionCookiePair,
      },
      redirect: 'manual',
    });

    assert.equal(authenticatedProjects.status, 200);

    // Cerrar sesión y verificar que la sesión deje de ser válida.
    const logout = await fetch(`${base}/logout`, {
      headers: {
        Cookie: sessionCookiePair,
      },
      redirect: 'manual',
    });

    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get('location'), '/login');

    const afterLogout = await fetch(`${base}/projects`, {
      headers: {
        Cookie: sessionCookiePair,
      },
      redirect: 'manual',
    });

    assert.equal(afterLogout.status, 303);
    assert.equal(
      afterLogout.headers.get('location'),
      '/login',
    );
  } finally {
    // Cerrar el servidor, incluso si una aserción falla.
    if (serverStarted) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    // Limpiar exclusivamente el usuario temporal de este test.
    if (registeredUserId) {
      try {
        await cleanupTemporaryUser(registeredUserId);
      } catch (error) {
        console.error(
          'No se pudo limpiar el usuario temporal del test de registro:',
          error,
        );
      }
    }
  }
});
