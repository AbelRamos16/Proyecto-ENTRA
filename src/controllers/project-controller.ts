import { publicationView } from '../views/publication.ts';
import { sendAudio } from './audio-response.ts';
import { CatalogModel, resolveSelection } from '../models/catalog.ts';

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  ProjectModel,
  validateProject,
  ValidationError,
} from '../models/project.ts';

import type { AuthUser } from '../models/user.ts';

import {
  listView,
  formView,
  detailView,
  deleteView,
  layout,
} from '../views/projects.ts';

import { validateAudio } from '../models/audio.ts';

const MAX_AUDIO_REQUEST_SIZE = 11 * 1024 * 1024;
const MAX_FORM_SIZE = 16_384;

// Lee formularios normales o formularios multipart con archivos.
async function readProjectForm(
  request: IncomingMessage,
): Promise<{
  fields: URLSearchParams;
  file: File | undefined;
}> {
  if (
    !request.headers['content-type']?.startsWith('multipart/form-data')
  ) {
    return {
      fields: await readForm(request),
      file: undefined,
    };
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;

    if (size > MAX_AUDIO_REQUEST_SIZE) {
      throw new ValidationError('Adjunta un MP3 de hasta 10 MB.');
    }

    chunks.push(buffer);
  }

  let form: FormData;

  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: {
        'Content-Type': request.headers['content-type']!,
      },
    }).formData();
  } catch {
    throw new ValidationError('No se pudo leer el formulario.');
  }

  const fields = new URLSearchParams();

  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      fields.set(name, value);
    }
  }

  const audio = form.get('audio');

  return {
    fields,
    file: audio instanceof File && audio.size > 0 ? audio : undefined,
  };
}

// Envía una respuesta HTML.
export const html = (
  response: ServerResponse,
  body: string,
  status = 200,
): void => {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
  });

  response.end(body);
};

// Redirige al usuario después de una operación.
const redirect = (
  response: ServerResponse,
  path: string,
): void => {
  response.writeHead(303, { Location: path });
  response.end();
};

// Lee formularios application/x-www-form-urlencoded.
export async function readForm(
  request: IncomingMessage,
): Promise<URLSearchParams> {
  if (
    !request.headers['content-type']?.startsWith(
      'application/x-www-form-urlencoded',
    )
  ) {
    throw new ValidationError('Formato de formulario no válido.');
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;

    if (size > MAX_FORM_SIZE) {
      throw new ValidationError(
        'El formulario supera el tamaño permitido.',
      );
    }

    chunks.push(buffer);
  }

  return new URLSearchParams(
    Buffer.concat(chunks).toString('utf8'),
  );
}

// Controlador principal de proyectos.
export async function projectController(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  model: ProjectModel,
  token: string,
  user: AuthUser,
  catalogs: CatalogModel = new CatalogModel(),
  basePath = '/projects',
): Promise<void> {
  const path = url.pathname;
  const method = request.method;

  // Redirige la página principal.
  if (method === 'GET' && path === '/') {
    return redirect(response, '/feed');
  }

  // Lista los proyectos visibles para el usuario.
  if (method === 'GET' && path === '/projects') {
    const messages: Record<string, string> = {
      created: 'Borrador guardado. Tu proyecto sigue privado hasta que lo publiques.',
      published: 'Publicado en Descubrir. Tu hook ya puede escucharse.',
      unpublished: 'Retirado del feed. El proyecto se conserva como borrador.',
      updated: 'Cambios guardados.',
      deleted: 'Proyecto eliminado.',
    };

    const projects = await model.list(user, user.id);
    const result = url.searchParams.get('result') ?? '';

    return html(
      response,
      listView(projects, token, messages[result] ?? '', user.role),
    );
  }

  // Muestra el formulario de creación.
  if (method === 'GET' && path === '/projects/new') {
    return html(response, formView(token, undefined, '', undefined, await catalogs.list(), basePath, user.role));
  }

  // Ruta de reproducción del audio de un proyecto.
  const audioMatch = path.match(
    /^\/projects\/([1-9]\d*)\/audio$/,
  );

  if (method === 'GET' && audioMatch) {
    const id = Number(audioMatch[1]);

    if (!Number.isSafeInteger(id)) {
      return html(response, 'Audio no encontrado', 404);
    }

    const bytes = await model.audio(id, user);

    if (!bytes || bytes.length === 0) {
      return html(response, 'Audio no encontrado', 404);
    }

    sendAudio(request, response, bytes);
    return;
  }

  // Rutas de detalle, edición y eliminación.
  const match = path.match(
    /^\/projects\/([1-9]\d*)(?:\/(edit|delete|publish|unpublish))?$/,
  );

  const id = match ? Number(match[1]) : undefined;

  if (id !== undefined && !Number.isSafeInteger(id)) {
    return html(
      response,
      layout(
        '<h1>Proyecto no encontrado</h1><a class="button" href="/projects">Volver a proyectos</a>',
        token,
      ),
      404,
    );
  }

  // El modelo aplica los permisos según el usuario autenticado.
  const project =
    id !== undefined ? await model.find(id, user) : undefined;

  if (match && !project) {
    return html(
      response,
      layout(
        '<h1>Proyecto no encontrado</h1><a class="button" href="/projects">Volver a proyectos</a>',
        token,
      ),
      404,
    );
  }

  // Presenta el detalle, el formulario de edición o la confirmación.
  if (method === 'GET' && project && match) {
    if (match[2] === 'publish') return html(response, publicationView(project, token, basePath, user.role));
    if (match[2] === 'unpublish') return html(response, 'Usa el botón Retirar del feed.', 405);
    if (match[2] === 'delete') {
      return html(response, deleteView(project, token, basePath, user.role));
    }

    if (match[2] === 'edit') {
      return html(response, formView(token, project, '', undefined, await catalogs.list(), basePath, user.role));
    }

    return html(response, detailView(project, token, basePath, user.role));
  }

  const isCreate =
    method === 'POST' && path === '/projects';

  const isProjectPost =
    method === 'POST' &&
    Boolean(project && match && match[2]);

  if (isCreate || isProjectPost) {
    let fields: URLSearchParams | undefined;

    try {
      const parsed = await readProjectForm(request);
      fields = parsed.fields;

      // Verifica el token CSRF antes de modificar datos.
      if (fields.get('csrf') !== token) {
        return html(
          response,
          layout(
            '<h1>Formulario caducado</h1><a href="/projects">Vuelve a abrir el formulario</a>',
            token,
          ),
          403,
        );
      }

      if (project && (match?.[2] === 'publish' || match?.[2] === 'unpublish')) {
        const published = match[2] === 'publish';
        if (!await model.setPublication(project.id, published, user)) return html(response, 'Proyecto no encontrado', 404);
        return redirect(response, basePath + '?result=' + (published ? 'published' : 'unpublished'));
      }

      // Elimina el proyecto después de validar el formulario y CSRF.
      if (project && match?.[2] === 'delete') {
        const deleted = await model.delete(project.id, user);

        if (!deleted) {
          return html(response, 'Proyecto no encontrado', 404);
        }

        return redirect(response, basePath + '?result=deleted');
      }

      // Solo se permite crear o editar mediante las rutas previstas.
      if (
        !isCreate &&
        (!project || match?.[2] !== 'edit')
      ) {
        return html(response, 'Página no encontrada', 404);
      }

      const selection = resolveSelection(await catalogs.list(), fields);
      fields.set('genre', selection.genre.name);
      fields.set('need', selection.collaboration.name + ' · ' + selection.instrument.name);
      const input = validateProject(fields, [selection.genre.name]);
      input.genreId = selection.genre.id;
      input.instrumentId = selection.instrument.id;
      input.collaborationId = selection.collaboration.id;

      input.audio = parsed.file
        ? await validateAudio(parsed.file)
        : undefined;

      const duration =
        input.audio?.duration ?? project?.audioDuration;

      const start = fields.get('hookStart')?.trim() ?? '';
      const end = fields.get('hookEnd')?.trim() ?? '';

      // Valida el segmento destacado (hook) dentro del audio.
      if (duration !== null && duration !== undefined) {
        input.hookStart = Number(start);
        input.hookEnd = Number(end);

        if (
          !start ||
          !end ||
          !Number.isFinite(input.hookStart) ||
          !Number.isFinite(input.hookEnd) ||
          input.hookStart < 0 ||
          input.hookEnd <= input.hookStart ||
          input.hookEnd > duration
        ) {
          throw new ValidationError(
            `Indica un hook válido dentro del audio (duración: ${duration.toFixed(1)} s).`,
          );
        }
      } else if (start || end) {
        throw new ValidationError(
          'Adjunta el MP3 para definir su hook.',
        );
      }

      if (project) {
        const updated = await model.update(
          project.id,
          input,
          user,
        );

        if (!updated) {
          return html(response, 'Proyecto no encontrado', 404);
        }
      } else {
        await model.create(input, user);
      }

      return redirect(
        response,
        `${basePath}?result=${project ? 'updated' : 'created'}`,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        if (project && (match?.[2] === 'publish' || match?.[2] === 'unpublish')) return html(response, publicationView(project, token, basePath, user.role, error.message), 422);
        return html(
          response,
          formView(token, project, error.message, fields, await catalogs.list(), basePath, user.role),
          422,
        );
      }

      throw error;
    }
  }

  // Ruta no reconocida.
  html(
    response,
    layout(
      '<h1>Página no encontrada</h1><a href="/projects">Volver a proyectos</a>',
      token,
    ),
    404,
  );
}
