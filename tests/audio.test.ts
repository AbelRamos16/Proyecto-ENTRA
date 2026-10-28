
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createApp } from '../src/server.ts';
import { UserModel } from '../src/models/user.ts';
import { supabaseAdmin } from '../src/config/supabase.ts';
import { cleanupTemporaryUser } from './helpers/supabase-test-cleanup.ts';

test(
  'MP3 y hook: carga, límites, reproducción protegida, edición y eliminación',
  async () => {
    const uniqueId = randomUUID().replaceAll('-', '').slice(0, 16);
    const username = `audio_${uniqueId}`;
    const email = `audio_${uniqueId}@example.com`;
    const password = 'AudioPass123!';

    const { server, model } = createApp();

    let serverStarted = false;
    let userId: string | undefined;
    let sessionId: string | undefined;

    try {
      // Crear un usuario temporal en Supabase Auth.
      const { data: createdUser, error: createUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
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

      // Verificar que el trigger creó el perfil.
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

      // Iniciar el servidor en un puerto disponible.
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });

      serverStarted = true;

      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const base = `http://127.0.0.1:${address.port}`;

      // Crear una sesión válida para el usuario de prueba.
      const userModel = new UserModel();

      const session = await userModel.createSession({
        id: userId,
        username,
        role: 'user',
      });

      sessionId = session.id;

      const cookie = `entra_session=${encodeURIComponent(session.id)}`;

      // MP3 sintético usado por la prueba.
      const frame = Buffer.alloc(417);
      frame.set([0xff, 0xfb, 0x90, 0x00]);

      const bytes = Buffer.concat(Array(100).fill(frame));

      const fields: Record<string, string> = {
        title: 'Demo con hook',
        genre: 'Indie',
        bpm: '120',
        musicalKey: 'La menor',
        need: 'Voz en el coro',
        description: 'Demo sintética de prueba',
        status: 'Borrador',
        csrf: session.csrfToken,
        hookStart: '0.5',
        hookEnd: '2',
      };

      const post = (
        path: string,
        values: Record<string, string> = fields,
        audio: Uint8Array | null = bytes,
      ) => {
        const form = new FormData();

        for (const [key, value] of Object.entries(values)) {
          form.set(key, value);
        }

        if (audio) {
          form.set(
            'audio',
            new Blob([new Uint8Array(audio)], {
              type: 'audio/mpeg',
            }),
            'demo.mp3',
          );
        }

        return fetch(`${base}${path}`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
          },
          body: form,
          redirect: 'manual',
        });
      };

      const testUser = {
        id: userId,
        username,
        role: 'user',
      };

      // Rechazar un archivo que no contiene un MP3 válido.
      assert.equal(
        (
          await post(
            '/projects',
            fields,
            new Uint8Array([1, 2, 3]),
          )
        ).status,
        422,
      );

      // Rechazar un hook que supera la duración del audio.
      assert.equal(
        (
          await post('/projects', {
            ...fields,
            hookEnd: '99',
          })
        ).status,
        422,
      );

      // Rechazar un intervalo invertido.
      assert.equal(
        (
          await post('/projects', {
            ...fields,
            hookStart: '2',
            hookEnd: '1',
          })
        ).status,
        422,
      );

      const emptyProjects = await model.list(testUser);
      assert.equal(emptyProjects.length, 0);

      // Crear un proyecto con MP3 y hook.
      assert.equal(
        (await post('/projects')).status,
        303,
      );

      const projects = await model.list(testUser);

      assert.equal(projects.length, 1);

      const project = projects[0];

      assert.equal(project.audioName, 'demo.mp3');
      assert.ok(
        project.audioDuration !== null &&
          project.audioDuration !== undefined &&
          project.audioDuration > 2,
      );
      assert.equal(project.hookStart, 0.5);
      assert.equal(project.hookEnd, 2);

      // El audio no debe estar disponible sin sesión.
      const unauthenticatedAudio = await fetch(
        `${base}/projects/${project.id}/audio`,
        { redirect: 'manual' },
      );

      assert.equal(unauthenticatedAudio.status, 303);
      assert.equal(
        unauthenticatedAudio.headers.get('location'),
        '/login',
      );

      // Reproducir un rango de bytes autenticado.
      const rangeResponse = await fetch(
        `${base}/projects/${project.id}/audio`,
        {
          headers: {
            Cookie: cookie,
            Range: 'bytes=0-9',
          },
        },
      );

      assert.equal(rangeResponse.status, 206);
      assert.equal(
        Number(rangeResponse.headers.get('content-length')),
        10,
      );
      assert.equal(
        (await rangeResponse.arrayBuffer()).byteLength,
        10,
      );

      // Comprobar la vista de detalle.
      const detailsResponse = await fetch(
        `${base}/projects/${project.id}`,
        {
          headers: {
            Cookie: cookie,
          },
        },
      );

      assert.equal(detailsResponse.status, 200);

      const details = await detailsResponse.text();

      assert.match(details, /Escuchar hook/);
      assert.match(details, /Editar proyecto/);
      assert.doesNotMatch(details, /name="hookStart"/);

      // Comprobar el formulario de edición.
      const editResponse = await fetch(
        `${base}/projects/${project.id}/edit`,
        {
          headers: {
            Cookie: cookie,
          },
        },
      );

      assert.equal(editResponse.status, 200);

      const editPage = await editResponse.text();

      assert.match(editPage, /name="hookStart"/);
      assert.match(editPage, /name="hookEnd"/);

      // Editar el hook sin volver a adjuntar el audio.
      assert.equal(
        (
          await post(
            `/projects/${project.id}/edit`,
            {
              ...fields,
              hookStart: '1',
              hookEnd: '2',
            },
            null,
          )
        ).status,
        303,
      );

      const updatedProject = await model.find(
        project.id,
        testUser,
      );

      assert.equal(updatedProject?.hookStart, 1);

      // El audio original debe mantenerse tras la edición.
      const storedAudio = await model.audio(
        project.id,
        testUser,
      );

      assert.ok(storedAudio);
      assert.equal(storedAudio.length, bytes.length);

      // Confirmar también la persistencia en PostgreSQL.
      const { data: storedRow, error: storedRowError } =
        await supabaseAdmin
          .from('projects')
          .select(
            'id, owner_id, audio_name, audio_bytes, hook_start, hook_end',
          )
          .eq('id', project.id)
          .eq('owner_id', userId)
          .single();

      if (storedRowError) {
        throw new Error(
          `No se pudo verificar el audio almacenado: ${storedRowError.message}`,
        );
      }

      assert.equal(Number(storedRow.id), project.id);
      assert.equal(storedRow.audio_name, 'demo.mp3');
      assert.equal(storedRow.hook_start, 1);
      assert.equal(storedRow.hook_end, 2);
      assert.ok(storedRow.audio_bytes);

      // Eliminar el proyecto mediante POST y token CSRF.
      const deletion = await fetch(
        `${base}/projects/${project.id}/delete`,
        {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            csrf: session.csrfToken,
          }),
          redirect: 'manual',
        },
      );

      assert.equal(deletion.status, 303);

      assert.equal(
        await model.audio(project.id, testUser),
        undefined,
      );

      assert.equal(
        await model.find(project.id, testUser),
        undefined,
      );
    } finally {
      // Cerrar el servidor aunque falle una aserción.
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

      // Limpiar exclusivamente la cuenta temporal creada por esta prueba.
      if (userId) {
        try {
          await cleanupTemporaryUser(userId);
        } catch (error) {
          console.error(
            'No se pudo limpiar el usuario temporal de audio:',
            error,
          );
        }
      }
    }
  },
);
