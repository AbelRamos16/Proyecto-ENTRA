
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createApp } from '../src/server.ts';
import { supabaseAdmin } from '../src/config/supabase.ts';
import { cleanupTemporaryUser } from './helpers/supabase-test-cleanup.ts';

const TEST_PASSWORD = 'TestPass123!';

test('CRUD HTTP, validación, escape HTML, CSRF y persistencia', async () => {
  const uniqueId = randomUUID().replaceAll('-', '').slice(0, 16);
  const username = `crud_${uniqueId}`;
  const email = `crud_${uniqueId}@example.com`;

  let userId: string | undefined;
  let serverStarted = false;

  const { server, model } = createApp();

  try {
    // Crear un usuario temporal de prueba en Supabase Auth.
    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: {
          username,
          display_name: username,
        },
      });

    if (createUserError) {
      throw new Error(
        `No se pudo crear el usuario temporal: ${createUserError.message}`,
      );
    }

    assert.ok(createdUser.user);
    userId = createdUser.user.id;

    // Comprobar que el trigger creó el perfil asociado.
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username, role')
        .eq('id', userId)
        .single();

    if (profileError) {
      throw new Error(
        `No se pudo consultar el perfil temporal: ${profileError.message}`,
      );
    }

    assert.equal(profile.username, username);
    assert.equal(profile.role, 'user');

    // Iniciar el servidor HTTP.
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    serverStarted = true;

    const address = server.address();

    assert.ok(address && typeof address !== 'string');

    const base = `http://127.0.0.1:${address.port}`;

    // Iniciar sesión con el usuario temporal.
    const loginResponse = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username,
        password: TEST_PASSWORD,
      }),
      redirect: 'manual',
    });

    assert.equal(loginResponse.status, 303);
    assert.equal(loginResponse.headers.get('location'), '/projects');

    const setCookies = loginResponse.headers.getSetCookie();
    const sessionCookie = setCookies.find((cookie) =>
      cookie.startsWith('entra_session='),
    );

    assert.ok(sessionCookie, 'El inicio de sesión debe crear una cookie');

    const cookiePair = sessionCookie.split(';')[0];

    // Helper para peticiones autenticadas.
    const authenticatedFetch = (
      route: string,
      options: RequestInit = {},
    ) => {
      const headers = new Headers(options.headers);
      headers.set('Cookie', cookiePair);

      return fetch(`${base}${route}`, {
        ...options,
        headers,
      });
    };

    const initialResponse = await authenticatedFetch('/projects');
    assert.equal(initialResponse.status, 200);

    const initial = await initialResponse.text();

    assert.match(initial, /entra-logo-vertical\.svg/);
    assert.match(initial, /Aún no hay proyectos/);

    // Verificar que los recursos estáticos continúan disponibles.
    const logo = await fetch(
      `${base}/brand/entra-logo-vertical.svg`,
    );

    assert.equal(logo.status, 200);
    assert.equal(
      logo.headers.get('content-type'),
      'image/svg+xml',
    );

    const isotipo = await fetch(
      `${base}/brand/entra-isotipo.svg`,
    );

    assert.equal(isotipo.status, 200);

    // Obtener el token CSRF del formulario.
    const tokenMatch = initial.match(
      /name="pageToken" value="([^"]+)"/,
    );

    assert.ok(tokenMatch, 'Debe existir un token CSRF en la página');

    const token = tokenMatch[1];

    const fields = new URLSearchParams({
      csrf: token,
      title: '<script>alert(1)</script>',
      genre: 'Indie',
      bpm: '120',
      musicalKey: 'La menor',
      need: 'Una voz',
      description: 'Demo de prueba',
      status: 'Borrador',
    });

    const post = (
      route: string,
      body: URLSearchParams = fields,
    ) =>
      authenticatedFetch(route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        redirect: 'manual',
      });

    const testUser = {
      id: userId,
      username,
      role: 'user',
    };

    // Rechazar un token CSRF incorrecto.
    const invalidCsrfFields = new URLSearchParams(fields);
    invalidCsrfFields.set('csrf', 'incorrecto');

    assert.equal(
      (await post('/projects', invalidCsrfFields)).status,
      403,
    );

    // Rechazar un BPM fuera del rango permitido.
    const invalidBpmFields = new URLSearchParams(fields);
    invalidBpmFields.set('bpm', '999');

    assert.equal(
      (await post('/projects', invalidBpmFields)).status,
      422,
    );

    // La validación fallida no debe crear proyectos.
    const emptyProjects = await model.list(testUser);
    assert.equal(emptyProjects.length, 0);

    // Crear un proyecto válido.
    assert.equal(
      (await post('/projects')).status,
      303,
    );

    const projectsAfterCreate = await model.list(testUser);

    assert.equal(projectsAfterCreate.length, 1);

    const projectId = projectsAfterCreate[0].id;

    // El detalle debe escapar HTML y no ejecutar scripts.
    const detailResponse = await authenticatedFetch(
      `/projects/${projectId}`,
    );

    assert.equal(detailResponse.status, 200);

    const detail = await detailResponse.text();

    assert.match(detail, /&lt;script&gt;/);
    assert.doesNotMatch(detail, /<script>/);

    // Actualizar el proyecto.
    fields.set('title', 'Ciudad de madrugada');

    assert.equal(
      (await post(`/projects/${projectId}/edit`)).status,
      303,
    );

    const updatedProject = await model.find(projectId, testUser);

    assert.equal(updatedProject?.title, 'Ciudad de madrugada');

    // Comprobar que el cambio se conserva al consultar Supabase.
    const { data: persistedProject, error: persistedError } =
      await supabaseAdmin
        .from('projects')
        .select('id, title, owner_id')
        .eq('id', projectId)
        .eq('owner_id', userId)
        .single();

    if (persistedError) {
      throw new Error(
        `No se pudo verificar la persistencia: ${persistedError.message}`,
      );
    }

    assert.equal(persistedProject.title, 'Ciudad de madrugada');
    assert.equal(persistedProject.owner_id, userId);

    // La confirmación de eliminación debe mostrarse primero.
    const deletePage = await authenticatedFetch(
      `/projects/${projectId}/delete`,
    );

    assert.equal(deletePage.status, 200);

    // La eliminación requiere POST y un token CSRF válido.
    assert.equal(
      (await post(`/projects/${projectId}/delete`)).status,
      303,
    );

    // El proyecto eliminado deja de estar disponible.
    const deletedResponse = await authenticatedFetch(
      `/projects/${projectId}`,
    );

    assert.equal(deletedResponse.status, 404);

    const remainingProjects = await model.list(testUser);
    assert.equal(remainingProjects.length, 0);
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

    // Limpiar exclusivamente el usuario temporal de esta prueba.
    if (userId) {
      try {
        await cleanupTemporaryUser(userId);
      } catch (error) {
        console.error(
          'No se pudo limpiar el usuario temporal del test CRUD:',
          error,
        );
      }
    }
  }
});
