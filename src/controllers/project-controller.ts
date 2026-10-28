
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
): Promise<void> {
  const path = url.pathname;
  const method = request.method;

  // Redirige la página principal.
  if (method === 'GET' && path === '/') {
    return redirect(response, '/projects');
  }

  // Lista los proyectos visibles para el usuario.
  if (method === 'GET' && path === '/projects') {
    const messages: Record<string, string> = {
      created: 'Proyecto creado. Tu idea ya tiene un lugar.',
      updated: 'Cambios guardados.',
      deleted: 'Proyecto eliminado.',
    };

    const projects = await model.list(user);
    const result = url.searchParams.get('result') ?? '';

    return html(
      response,
      listView(projects, token, messages[result] ?? ''),
    );
  }

  // Muestra el formulario de creación.
  if (method === 'GET' && path === '/projects/new') {
    return html(response, formView(token));
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

    const rangeHeader = request.headers.range;
    const range = rangeHeader
      ? rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
      : null;

    // Un encabezado Range inválido no se puede procesar.
    if (rangeHeader && !range) {
      response.writeHead(416, {
        'Content-Range': `bytes */${bytes.length}`,
      });
      response.end();
      return;
    }

    let start = 0;
    let end = bytes.length - 1;

    if (range) {
      // No se admiten rangos múltiples ni rangos sin límites.
      if (!range[1] && !range[2]) {
        response.writeHead(416, {
          'Content-Range': `bytes */${bytes.length}`,
        });
        response.end();
        return;
      }

      // Permite solicitar los últimos N bytes.
      if (!range[1]) {
        const suffixLength = Number(range[2]);

        if (
          !Number.isSafeInteger(suffixLength) ||
          suffixLength <= 0
        ) {
          response.writeHead(416, {
            'Content-Range': `bytes */${bytes.length}`,
          });
          response.end();
          return;
        }

        start = Math.max(0, bytes.length - suffixLength);
      } else {
        start = Number(range[1]);

        if (range[2]) {
          end = Number(range[2]);
        }
      }

      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= bytes.length ||
        end < start
      ) {
        response.writeHead(416, {
          'Content-Range': `bytes */${bytes.length}`,
        });
        response.end();
        return;
      }

      end = Math.min(end, bytes.length - 1);
    }

    const partial = Boolean(range);
    const content = bytes.subarray(start, end + 1);

    response.writeHead(partial ? 206 : 200, {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': content.length,
      ...(partial
        ? {
            'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
          }
        : {}),
    });

    response.end(Buffer.from(content));
    return;
  }

  // Rutas de detalle, edición y eliminación.
  const match = path.match(
    /^\/projects\/([1-9]\d*)(?:\/(edit|delete))?$/,
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
    if (match[2] === 'delete') {
      return html(response, deleteView(project, token));
    }

    if (match[2] === 'edit') {
      return html(response, formView(token, project));
    }

    return html(response, detailView(project, token));
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

      // Elimina el proyecto después de validar el formulario y CSRF.
      if (project && match?.[2] === 'delete') {
        const deleted = await model.delete(project.id, user);

        if (!deleted) {
          return html(response, 'Proyecto no encontrado', 404);
        }

        return redirect(response, '/projects?result=deleted');
      }

      // Solo se permite crear o editar mediante las rutas previstas.
      if (
        !isCreate &&
        (!project || match?.[2] !== 'edit')
      ) {
        return html(response, 'Página no encontrada', 404);
      }

      const input = validateProject(fields);

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
        `/projects?result=${project ? 'updated' : 'created'}`,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        return html(
          response,
          formView(token, project, error.message, fields),
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
