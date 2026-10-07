import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { UserModel } from '../src/models/user.ts';

test('Registro: validación, duplicados, persistencia y acceso autenticado', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'entra-register-'));
  const databasePath = join(directory, 'test.sqlite');
  const { server, model, userModel } = createApp(databasePath);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.match(await (await fetch(`${base}/login`)).text(), /href="\/register"/);
    const welcome = await fetch(`${base}/register`);
    const body = await welcome.text();
    assert.match(body, /name="confirmPassword"/);
    assert.match(body, /Confirmar contraseña/);
    const token = body.match(/name="csrf" value="([^"]+)"/)![1];
    const cookie = welcome.headers.getSetCookie()[0].split(';')[0];
    const fields = { username: 'new_artist', password: 'StudioPass123!', confirmPassword: 'StudioPass123!', csrf: token };
    const register = (changes: Record<string, string> = {}) => fetch(`${base}/register`, {
      method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ ...fields, ...changes }), redirect: 'manual',
    });
    assert.equal((await register({ csrf: 'incorrect' })).status, 403);
    assert.equal((await register({ username: '<script>' })).status, 422);
    assert.equal((await register({ password: 'short', confirmPassword: 'short' })).status, 422);
    for (const password of ['studiopass123!', 'STUDIOPASS123!', 'StudioPassWord!', 'StudioPass123']) {
      assert.equal((await register({ password, confirmPassword: password })).status, 422);
    }
    const mismatch = await register({ confirmPassword: 'different' });
    assert.equal(mismatch.status, 422);
    const errorPage = await mismatch.text();
    assert.match(errorPage, /value="new_artist"/);
    assert.doesNotMatch(errorPage, /StudioPass123!/);
    const created = await register();
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/login?registered=1');
    assert.equal((await register()).status, 409);
    const second = new UserModel(databasePath);
    assert.ok(second.authenticate('new_artist', 'StudioPass123!'));
    assert.equal(second.authenticate('new_artist', 'wrong'), false);
    second.close();
    for (const route of ['/projects', '/projects/new', '/projects/1/edit']) {
      const protectedPage = await fetch(`${base}${route}`, { redirect: 'manual' });
      assert.equal(protectedPage.status, 303);
      assert.equal(protectedPage.headers.get('location'), '/login');
    }
    const login = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams(fields), redirect: 'manual' });
    assert.equal(login.status, 303);
    const sessionCookie = login.headers.getSetCookie()[0].split(';')[0];
    assert.equal((await fetch(`${base}/projects`, { headers: { Cookie: sessionCookie } })).status, 200);
    await fetch(`${base}/logout`, { headers: { Cookie: sessionCookie }, redirect: 'manual' });
    assert.equal((await fetch(`${base}/projects`, { headers: { Cookie: sessionCookie }, redirect: 'manual' })).status, 303);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    model.db.close(); userModel.close(); rmSync(directory, { recursive: true, force: true });
  }
});

