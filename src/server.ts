import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { ProjectModel } from './models/project.ts';
import { projectController, html } from './controllers/project-controller.ts';

export function createApp(databasePath = fileURLToPath(new URL('../data/entra.sqlite', import.meta.url))) {
  const model = new ProjectModel(databasePath);
  const token = randomBytes(32).toString('hex');
  const assets = new Map([
    ['/fonts/anton-latin-400-normal.woff2', { type: 'font/woff2', body: readFileSync(new URL('../public/fonts/anton-latin-400-normal.woff2', import.meta.url)) }],
    ['/brand/entra-logo-vertical.svg', { type: 'image/svg+xml', body: readFileSync(new URL('../public/brand/entra-logo-vertical.svg', import.meta.url)) }],
    ['/fonts/watchout-demo.ttf', { type: 'font/ttf', body: readFileSync(new URL('../public/fonts/watchout-demo.ttf', import.meta.url)) }],
    ['/brand/entra-logo-vertical.png', { type: 'image/png', body: readFileSync(new URL('../public/brand/entra-logo-vertical.png', import.meta.url)) }],
    ['/brand/entra-isotipo.svg', { type: 'image/svg+xml', body: readFileSync(new URL('../public/brand/entra-isotipo.svg', import.meta.url)) }],
    ['/art/entra-studio.png', { type: 'image/png', body: readFileSync(new URL('../public/art/entra-studio.png', import.meta.url)) }],
  ]);
  for (const name of ['lilita-one-latin-400-normal.woff2', 'barlow-condensed-latin-600-normal.woff2', 'ibm-plex-sans-latin-400-normal.woff2', 'ibm-plex-sans-latin-600-normal.woff2']) {
    assets.set(`/fonts/${name}`, { type: 'font/woff2', body: readFileSync(new URL(`../public/fonts/${name}`, import.meta.url)) });
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; font-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/onboarding.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        response.end(stripTypeScriptTypes(readFileSync(new URL('./client/onboarding.ts', import.meta.url), 'utf8')));
        return;
      }
      const asset = assets.get(url.pathname);
      if (request.method === 'GET' && asset) { response.writeHead(200, { 'Content-Type': asset.type }); response.end(asset.body); return; }
      if (request.method === 'GET' && url.pathname === '/styles.css') { response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); response.end(readFileSync(new URL('../public/styles.css', import.meta.url))); return; }
      await projectController(request, response, url, model, token);
    } catch (error) { console.error(error); html(response, '<h1>No pudimos completar la solicitud.</h1><a href="/projects">Volver a proyectos</a>', 500); }
  });
  return { server, model };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 3000);
  const { server } = createApp(process.env.DATABASE_PATH);
  server.listen(port, '127.0.0.1', () => console.log(`ENTRA: http://127.0.0.1:${port}/projects`));
}
