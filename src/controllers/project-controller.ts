import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProjectModel, validateProject, ValidationError } from '../models/project.ts';
import { listView, formView, detailView, deleteView, layout } from '../views/projects.ts';

export const html = (response: ServerResponse, body: string, status = 200): void => { response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(body); };
const redirect = (response: ServerResponse, path: string): void => { response.writeHead(303, { Location: path }); response.end(); };
export async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw new ValidationError('Formato de formulario no válido.');
  let body = ''; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw new ValidationError('El formulario supera el tamaño permitido.'); body += chunk.toString(); }
  return new URLSearchParams(body);
}
export async function projectController(request: IncomingMessage, response: ServerResponse, url: URL, model: ProjectModel, token: string): Promise<void> {
  const path = url.pathname;
  const method = request.method;
  if (method === 'GET' && path === '/') return redirect(response, '/projects');
  if (method === 'GET' && path === '/projects') {
    const messages: Record<string, string> = { created: 'Proyecto creado. Tu idea ya tiene un lugar.', updated: 'Cambios guardados.', deleted: 'Proyecto eliminado.' };
    return html(response, listView(model.list(), token, messages[url.searchParams.get('result') ?? ''] ?? ''));
  }
  if (method === 'GET' && path === '/projects/new') return html(response, formView(token));
  const match = path.match(/^\/projects\/([1-9]\d*)(?:\/(edit|delete))?$/);
  const id = match ? Number(match[1]) : undefined;
  const project = id ? model.find(id) : undefined;
  if (match && !project) return html(response, layout('<h1>Proyecto no encontrado</h1><a class="button" href="/projects">Volver a proyectos</a>', token), 404);
  if (method === 'GET' && project) {
    return html(response, match![2] === 'edit' ? formView(token, project) : match![2] === 'delete' ? deleteView(project, token) : detailView(project, token));
  }
  if (method === 'POST' && (path === '/projects' || (project && match![2]))) {
    let fields: URLSearchParams | undefined;
    try {
      fields = await readForm(request);
      if (fields.get('csrf') !== token) return html(response, layout('<h1>Formulario caducado</h1><a href="/projects">Vuelve a abrir el formulario</a>', token), 403);
      if (project && match![2] === 'delete') { model.delete(project.id); return redirect(response, '/projects?result=deleted'); }
      const input = validateProject(fields);
      if (project) model.update(project.id, input); else model.create(input);
      return redirect(response, `/projects?result=${project ? 'updated' : 'created'}`);
    } catch (error) {
      if (error instanceof ValidationError) return html(response, formView(token, project, error.message, fields), 422);
      throw error;
    }
  }
  html(response, layout('<h1>Página no encontrada</h1><a href="/projects">Volver a proyectos</a>', token), 404);
}
