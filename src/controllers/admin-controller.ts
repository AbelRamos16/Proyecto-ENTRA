import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminModel } from '../models/admin.ts';
import { requireAdmin, validateArtistId } from '../models/admin.ts';
import type { AuthUser } from '../models/user.ts';
import { ProjectModel, ValidationError } from '../models/project.ts';
import { CatalogModel } from '../models/catalog.ts';
import { html, readForm, projectController } from './project-controller.ts';
import { adminView } from '../views/admin.ts';
import { adminLayout } from '../views/admin-shell.ts';
import { artistsView, artistView, adminProjectsView } from '../views/admin-management.ts';

export async function adminController(req: IncomingMessage, res: ServerResponse, url: URL, model: AdminModel, user: AuthUser, token: string, projects: ProjectModel, catalogs: CatalogModel) {
  requireAdmin(user);
  const notFound = () => html(res, adminLayout('<h1>No encontrado</h1><a class="button" href="/admin/artists">Volver a artistas</a>', token, 'artists'), 404);
  if (req.method === 'GET' && ['/admin', '/admin/'].includes(url.pathname)) {
    html(res, adminView(await model.list(), token, url.searchParams.has('saved') ? 'Catálogo actualizado.' : '')); return;
  }
  if (req.method === 'POST' && url.pathname === '/admin/catalogs') {
    try {
      const fields = await readForm(req);
      if (fields.get('csrf') !== token) { html(res, 'Formulario caducado.', 403); return; }
      await model.save(fields);
      res.writeHead(303, { Location: '/admin?saved=1' }); res.end();
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      html(res, adminView(await model.list(), token, error.message, true), 422);
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/admin/artists') {
    html(res, artistsView(await model.artists(user), await projects.list(user), token, (url.searchParams.get('q') ?? '').slice(0,80))); return;
  }
  const artistMatch = url.pathname.match(/^\/admin\/artists\/([^/]+)$/);
  if (artistMatch) {
    const id = artistMatch[1];
    try { validateArtistId(id); } catch { notFound(); return; }
    const artist = await model.artist(id, user);
    if (!artist) { notFound(); return; }
    if (req.method === 'GET') {
      html(res, artistView(artist, await projects.list(user, id), token, url.searchParams.has('saved') ? 'Perfil actualizado.' : '')); return;
    }
    if (req.method === 'POST') {
      let fields: URLSearchParams | undefined;
      try {
        fields = await readForm(req);
        if (fields.get('csrf') !== token) { html(res, 'Formulario caducado.', 403); return; }
        if (!await model.saveArtist(id, fields, user)) { notFound(); return; }
        res.writeHead(303, {Location: `/admin/artists/${id}?saved=1`}); res.end();
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        html(res, artistView(artist, await projects.list(user, id), token, error.message, true, fields), 422);
      }
      return;
    }
  }
  if (req.method === 'GET' && url.pathname === '/admin/projects') {
    const owner = url.searchParams.get('artist') ?? '';
    if (owner) { try { validateArtistId(owner); } catch { notFound(); return; } }
    const messages: Record<string,string> = {updated:'Proyecto actualizado.',deleted:'Proyecto eliminado.',published:'Publicado en Descubrir.',unpublished:'Retirado del feed.'};
    html(res, adminProjectsView(await projects.list(user, owner || undefined), await model.artists(user), token, owner, messages[url.searchParams.get('result') ?? ''] ?? '')); return;
  }
  if (/^\/admin\/projects\/[1-9]\d*(?:\/(edit|delete|publish|unpublish|audio))?$/.test(url.pathname)) {
    const projectUrl = new URL(url);
    projectUrl.pathname = url.pathname.replace(/^\/admin/, '');
    await projectController(req, res, projectUrl, projects, token, user, catalogs, '/admin/projects');
    return;
  }
  html(res, adminLayout('<h1>Página no encontrada</h1>', token, 'catalogs'), 404);
}
