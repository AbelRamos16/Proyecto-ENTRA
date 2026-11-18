import { FeedModel } from './models/feed.ts';
import { feedController } from './controllers/feed-controller.ts';
import { CatalogModel } from './models/catalog.ts';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { ProjectModel } from './models/project.ts';
import { UserModel } from './models/user.ts';
import { AdminModel } from './models/admin.ts';
import { adminController } from './controllers/admin-controller.ts';
import { projectController, html } from './controllers/project-controller.ts';
import { authController } from './controllers/auth-controller.ts';
function sessionCookie(header = '') {
  const part = header.split(';').map(s => s.trim()).find(s => s.startsWith('entra_session='));
  try { return part ? decodeURIComponent(part.slice('entra_session='.length)) : undefined; }
  catch { return undefined; }
}
export function createApp(deps: { model?: ProjectModel; userModel?: UserModel; adminModel?: AdminModel; catalogModel?: CatalogModel; feedModel?: FeedModel } = {}) {
  const feedModel = deps.feedModel ?? new FeedModel();
  const model = deps.model ?? new ProjectModel();
  const userModel = deps.userModel ?? new UserModel();
  const catalogModel = deps.catalogModel ?? new CatalogModel();
  const adminModel = deps.adminModel ?? new AdminModel();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  for (const name of ['onboarding', 'password-feedback', 'project-audio', 'catalog-selects', 'feed']) {
    app.get(`/${name}.js`, (_req, res) => {
      res.type('text/javascript').send(stripTypeScriptTypes(readFileSync(new URL(`./client/${name}.ts`, import.meta.url), 'utf8')));
    });
  }
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { dotfiles: 'deny', index: false }));
  // Cada controlador lee el stream con límites; un parser global consumiría el multipart.
  app.all(['/login', '/register', '/logout'], async (req, res) => {
    await authController(req, res, new URL(req.originalUrl, 'http://localhost'), userModel);
  });
  app.use(async (req, res, next) => {
    const id = sessionCookie(req.headers.cookie);
    const session = id ? await userModel.getSession(id) : undefined;
    if (!session) {
      if (id) res.clearCookie('entra_session', { path: '/', httpOnly: true, sameSite: 'lax' });
      res.redirect(303, '/login'); return;
    }
    res.locals.session = session;
    res.locals.user = { id: session.userId, username: session.username, role: session.role };
    next();
  });
  app.use('/feed', async (req, res) => {
    await feedController(req, res, new URL(req.originalUrl, 'http://localhost'), feedModel, res.locals.user, res.locals.session.csrfToken);
  });
  app.use('/admin', async (req, res) => {
    if (res.locals.user.role !== 'superadmin') { res.status(403).send('Acceso exclusivo del administrador.'); return; }
    await adminController(req, res, new URL(req.originalUrl, 'http://localhost'), adminModel, res.locals.user, res.locals.session.csrfToken, model, catalogModel);
  });
  app.use(async (req, res) => {
    await projectController(req, res, new URL(req.originalUrl, 'http://localhost'), model, res.locals.session.csrfToken, res.locals.user, catalogModel);
  });
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('Error de aplicación:', err instanceof Error ? err.message : 'Error desconocido');
    if (!res.headersSent) html(res, '<h1>No pudimos completar la solicitud.</h1><a href="/projects">Volver</a>', 500);
    else res.end();
  };
  app.use(errors);
  return { app, server: createServer(app), model, userModel };
}
const application = createApp();
export default application.app;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const host = process.env.HOST ?? '127.0.0.1'; const port = Number(process.env.PORT ?? 3000);
  application.server.listen(port, host, () => console.log(`ENTRA: http://${host}:${port}/login`));
}
