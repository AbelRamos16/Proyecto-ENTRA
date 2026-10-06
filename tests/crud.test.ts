import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { ProjectModel } from '../src/models/project.ts';

test('CRUD HTTP, validación, escape HTML, CSRF y persistencia', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'entra-test-'));
  const path = join(directory, 'test.sqlite');
  const { server, model } = createApp(path);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const initial = await (await fetch(`${base}/projects`)).text();
    assert.match(initial, /src="\/brand\/entra-logo-vertical.svg"/);
    const logo = await fetch(`${base}/brand/entra-logo-vertical.svg`);
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get('content-type'), 'image/svg+xml');
    assert.equal((await fetch(`${base}/brand/entra-isotipo.svg`)).status, 200);
    assert.match(initial, /Aún no hay proyectos/);
    const token = initial.match(/name="pageToken" value="([^"]+)"/)![1];
    const fields = new URLSearchParams({ csrf: token, title: '<script>alert(1)</script>', genre: 'Indie', bpm: '120', musicalKey: 'La menor', need: 'Una voz', description: 'Demo de prueba', status: 'Borrador' });
    const post = (route: string, body = fields) => fetch(`${base}${route}`, { method: 'POST', body, redirect: 'manual' });
    assert.equal((await post('/projects', new URLSearchParams({ ...Object.fromEntries(fields), csrf: 'incorrecto' }))).status, 403);
    assert.equal((await post('/projects', new URLSearchParams({ ...Object.fromEntries(fields), bpm: '999' }))).status, 422);
    assert.equal(model.list().length, 0);
    assert.equal((await post('/projects')).status, 303);
    const id = model.list()[0].id;
    const detail = await (await fetch(`${base}/projects/${id}`)).text();
    assert.match(detail, /&lt;script&gt;/);
    assert.doesNotMatch(detail, /<script>/);
    fields.set('title', 'Ciudad de madrugada');
    assert.equal((await post(`/projects/${id}/edit`)).status, 303);
    assert.equal(model.find(id)?.title, 'Ciudad de madrugada');
    const second = new ProjectModel(path);
    assert.equal(second.find(id)?.title, 'Ciudad de madrugada'); second.db.close();
    assert.equal((await fetch(`${base}/projects/${id}/delete`)).status, 200);
    assert.ok(model.find(id));
    assert.equal((await post(`/projects/${id}/delete`)).status, 303);
    assert.equal((await fetch(`${base}/projects/${id}`)).status, 404);
    assert.equal(model.list().length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    model.db.close(); rmSync(directory, { recursive: true, force: true });
  }
});


