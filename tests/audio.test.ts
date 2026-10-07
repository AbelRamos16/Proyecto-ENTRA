import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.ts';

test('MP3 y hook: carga, límites, reproducción protegida, edición y eliminación', async () => {
  const { server, model, userModel } = createApp(':memory:');
  // Los modelos en memoria tienen conexiones independientes; solo autenticación usa usuarios.
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const frame = Buffer.alloc(417); frame.set([0xff, 0xfb, 0x90, 0x00]);
  const bytes = Buffer.concat(Array(100).fill(frame));
  const session = userModel.createSession('example')!;
  const cookie = `entra_session=${session.id}`;
  const fields = { title: 'Demo con hook', genre: 'Indie', bpm: '120', musicalKey: 'La menor', need: 'Voz en el coro', description: 'Demo sintética de prueba', status: 'Borrador', csrf: session.csrfToken, hookStart: '0.5', hookEnd: '2' };
  const post = (path: string, values = fields, audio: Uint8Array | null = bytes) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    if (audio) form.set('audio', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'demo.mp3');
    return fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form, redirect: 'manual' });
  };
  try {
    assert.equal((await post('/projects', fields, new Uint8Array([1, 2, 3]))).status, 422);
    assert.equal((await post('/projects', { ...fields, hookEnd: '99' })).status, 422);
    assert.equal((await post('/projects', { ...fields, hookStart: '2', hookEnd: '1' })).status, 422);
    assert.equal(model.list().length, 0);
    assert.equal((await post('/projects')).status, 303);
    const project = model.list()[0];
    assert.equal(project.audioName, 'demo.mp3');
    assert.ok(project.audioDuration! > 2);
    assert.equal(project.hookStart, 0.5);
    assert.equal((await fetch(`${base}/projects/${project.id}/audio`, { redirect: 'manual' })).status, 303);
    const range = await fetch(`${base}/projects/${project.id}/audio`, { headers: { Cookie: cookie, Range: 'bytes=0-9' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 10);
    const details = await (await fetch(`${base}/projects/${project.id}`, { headers: { Cookie: cookie } })).text();
    assert.match(details, /Escuchar hook/);
    assert.match(details, /Editar proyecto/);
    assert.doesNotMatch(details, /name="hookStart"/);
    const edit = await (await fetch(`${base}/projects/${project.id}/edit`, { headers: { Cookie: cookie } })).text();
    assert.match(edit, /name="hookStart"[^>]*value="0.5"/);
    assert.equal((await post(`/projects/${project.id}/edit`, { ...fields, hookStart: '1' }, null)).status, 303);
    assert.equal(model.find(project.id)?.hookStart, 1);
    assert.equal(model.audio(project.id)?.length, bytes.length);
    const deletion = await fetch(`${base}/projects/${project.id}/delete`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf: session.csrfToken }), redirect: 'manual' });
    assert.equal(deletion.status, 303); assert.equal(model.audio(project.id), undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    model.db.close(); userModel.close();
  }
});

