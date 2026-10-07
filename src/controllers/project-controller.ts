import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProjectModel, validateProject, ValidationError } from '../models/project.ts';
import { listView, formView, detailView, deleteView, layout } from '../views/projects.ts';
import { validateAudio } from '../models/audio.ts';

async function readProjectForm(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('multipart/form-data')) return { fields: await readForm(request), file: undefined };
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 11 * 1024 * 1024) throw new ValidationError('Adjunta un MP3 de hasta 10 MB.'); chunks.push(Buffer.from(chunk)); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers['content-type'] } }).formData(); }
  catch { throw new ValidationError('No se pudo leer el formulario.'); }
  const fields = new URLSearchParams();
  for (const [name, value] of form) { if (typeof value === 'string') fields.set(name, value); }
  const audio = form.get('audio');
  return { fields, file: audio instanceof File && audio.size > 0 ? audio : undefined };
}

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
  const audioMatch = path.match(/^\/projects\/([1-9]\d*)\/audio$/);
  if (method === 'GET' && audioMatch) {
    const bytes = model.audio(Number(audioMatch[1]));
    if (!bytes) return html(response, 'Audio no encontrado', 404);
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (start > end || start >= bytes.length) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
    response.writeHead(range ? 206 : 200, { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) });
    response.end(bytes.subarray(start, end + 1)); return;
  }
  const match = path.match(/^\/projects\/([1-9]\d*)(?:\/(edit|delete))?$/);
  const id = match ? Number(match[1]) : undefined;
  const project = id ? model.find(id) : undefined;
  if (match && !project) return html(response, layout('<h1>Proyecto no encontrado</h1><a class="button" href="/projects">Volver a proyectos</a>', token), 404);
  if (method === 'GET' && project) {
    return html(response, match![2] === 'delete' ? deleteView(project, token) : match![2] === 'edit' ? formView(token, project) : detailView(project, token));
  }
  if (method === 'POST' && (path === '/projects' || (project && match![2]))) {
    let fields: URLSearchParams | undefined;
    try {
      const parsed = await readProjectForm(request);
      fields = parsed.fields;
      if (fields.get('csrf') !== token) return html(response, layout('<h1>Formulario caducado</h1><a href="/projects">Vuelve a abrir el formulario</a>', token), 403);
      if (project && match![2] === 'delete') { model.delete(project.id); return redirect(response, '/projects?result=deleted'); }
      const input = validateProject(fields);
      input.audio = parsed.file ? await validateAudio(parsed.file) : undefined;
      const duration = input.audio?.duration ?? project?.audioDuration;
      const start = fields.get('hookStart')?.trim() ?? '';
      const end = fields.get('hookEnd')?.trim() ?? '';
      if (duration) {
        input.hookStart = Number(start); input.hookEnd = Number(end);
        if (!start || !end || !Number.isFinite(input.hookStart) || !Number.isFinite(input.hookEnd) || input.hookStart < 0 || input.hookEnd <= input.hookStart || input.hookEnd > duration) throw new ValidationError(`Indica un hook válido dentro del audio (duración: ${duration.toFixed(1)} s).`);
      } else if (start || end) throw new ValidationError('Adjunta el MP3 para definir su hook.');
      if (project) model.update(project.id, input); else model.create(input);
      return redirect(response, `/projects?result=${project ? 'updated' : 'created'}`);
    } catch (error) {
      if (error instanceof ValidationError) return html(response, formView(token, project, error.message, fields), 422);
      throw error;
    }
  }
  html(response, layout('<h1>Página no encontrada</h1><a href="/projects">Volver a proyectos</a>', token), 404);
}
