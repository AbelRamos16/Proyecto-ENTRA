
import { supabaseAdmin } from '../config/supabase.ts';
import type { AuthUser } from './user.ts';
import type { ProjectAudio } from './audio.ts';

export const genres = [
  'Alternativo',
  'Electrónica',
  'Hip hop',
  'Indie',
  'Pop',
  'Rock',
];

export const statuses = [
  'Borrador',
  'Buscando colaboración',
  'En producción',
  'Finalizado',
];

export type ProjectInput = {
  title: string;
  genre: string;
  bpm: number;
  musicalKey: string;
  need: string;
  description: string;
  status: string;
  hookStart?: number | null;
  hookEnd?: number | null;
  audio?: ProjectAudio;
};

export type Project = Omit<ProjectInput, 'audio'> & {
  id: number;
  ownerId: string;
  updatedAt: string;
  audioName: string | null;
  audioDuration: number | null;
};

type ProjectRow = {
  id: number;
  owner_id: string;
  title: string;
  genre: string;
  bpm: number;
  musical_key: string;
  need: string;
  description: string;
  status: string;
  updated_at: string;
  audio_bytes: string | Uint8Array | null;
  audio_name: string | null;
  audio_duration: number | null;
  hook_start: number | null;
  hook_end: number | null;
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function parseOptionalNumber(
  fields: URLSearchParams,
  name: string,
): number | null {
  const value = fields.get(name)?.trim();

  if (!value) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new ValidationError(`El campo ${name} debe ser numérico.`);
  }

  return number;
}

export function validateProject(
  fields: URLSearchParams,
): ProjectInput {
  const title = (fields.get('title') ?? '').trim();
  const genre = (fields.get('genre') ?? '').trim();
  const bpmText = (fields.get('bpm') ?? '').trim();
  const musicalKey = (fields.get('musicalKey') ?? '').trim();
  const need = (fields.get('need') ?? '').trim();
  const description = (fields.get('description') ?? '').trim();
  const status = (fields.get('status') ?? '').trim();

  if (title.length < 3 || title.length > 80) {
    throw new ValidationError(
      'El título debe tener entre 3 y 80 caracteres.',
    );
  }

  if (!genres.includes(genre)) {
    throw new ValidationError('Selecciona un género musical válido.');
  }

  const bpm = Number(bpmText);

  if (
    !bpmText ||
    !Number.isInteger(bpm) ||
    bpm < 40 ||
    bpm > 240
  ) {
    throw new ValidationError(
      'El BPM debe ser un entero entre 40 y 240.',
    );
  }

  if (!musicalKey || musicalKey.length > 20) {
    throw new ValidationError(
      'La tonalidad es obligatoria y no puede superar 20 caracteres.',
    );
  }

  if (need.length < 3 || need.length > 120) {
    throw new ValidationError(
      'La necesidad debe tener entre 3 y 120 caracteres.',
    );
  }

  if (description.length > 1000) {
    throw new ValidationError(
      'La descripción no puede superar 1000 caracteres.',
    );
  }

  if (!statuses.includes(status)) {
    throw new ValidationError('Selecciona un estado válido.');
  }

  const hookStart = parseOptionalNumber(fields, 'hookStart');
  const hookEnd = parseOptionalNumber(fields, 'hookEnd');

  if (
    (hookStart !== null && hookStart < 0) ||
    (hookEnd !== null && hookEnd < 0)
  ) {
    throw new ValidationError(
      'Los tiempos del hook no pueden ser negativos.',
    );
  }

  if (
    hookStart !== null &&
    hookEnd !== null &&
    hookEnd <= hookStart
  ) {
    throw new ValidationError(
      'El final del hook debe ser posterior al inicio.',
    );
  }

  return {
    title,
    genre,
    bpm,
    musicalKey,
    need,
    description,
    status,
    hookStart,
    hookEnd,
  };
}

function throwIfError(
  error: { message: string } | null,
  action: string,
): void {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    id: Number(row.id),
    ownerId: row.owner_id,
    title: row.title,
    genre: row.genre,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    need: row.need,
    description: row.description,
    status: row.status,
    updatedAt: row.updated_at,
    audioName: row.audio_name,
    audioDuration: row.audio_duration,
    hookStart: row.hook_start,
    hookEnd: row.hook_end,
  };
}

function isSuperadmin(user: AuthUser): boolean {
  return user.role === 'superadmin';
}

function encodeBytea(bytes: Uint8Array): string {
  return `\\x${Buffer.from(bytes).toString('hex')}`;
}

function decodeBytea(
  value: string | Uint8Array | null,
): Uint8Array | undefined {
  if (value === null) {
    return undefined;
  }

  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }

  if (value.startsWith('\\x')) {
    const hex = value.slice(2);

    if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
      throw new Error(
        'Supabase devolvió datos de audio bytea inválidos.',
      );
    }

    return new Uint8Array(Buffer.from(hex, 'hex'));
  }

  throw new Error(
    'El formato de audio recibido desde Supabase no es válido.',
  );
}

export class ProjectModel {
  // Consulta los proyectos del usuario o todos si es superadmin.
  async list(user: AuthUser): Promise<Project[]> {
    let query = supabaseAdmin
      .from('projects')
      .select(
        'id, owner_id, title, genre, bpm, musical_key, need, description, status, updated_at, audio_name, audio_duration, hook_start, hook_end',
      )
      .order('updated_at', { ascending: false });

    if (!isSuperadmin(user)) {
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query;

    throwIfError(error, 'No se pudieron consultar los proyectos');

    return ((data ?? []) as ProjectRow[]).map(mapProject);
  }

  // Busca un proyecto respetando los permisos del usuario.
  async find(
    id: number,
    user: AuthUser,
  ): Promise<Project | undefined> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      return undefined;
    }

    let query = supabaseAdmin
      .from('projects')
      .select(
        'id, owner_id, title, genre, bpm, musical_key, need, description, status, updated_at, audio_name, audio_duration, hook_start, hook_end',
      )
      .eq('id', id);

    if (!isSuperadmin(user)) {
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query.maybeSingle();

    throwIfError(error, 'No se pudo consultar el proyecto');

    return data ? mapProject(data as ProjectRow) : undefined;
  }

  // Obtiene el audio si el usuario tiene permiso para acceder al proyecto.
  async audio(
    id: number,
    user: AuthUser,
  ): Promise<Uint8Array | undefined> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      return undefined;
    }

    let query = supabaseAdmin
      .from('projects')
      .select('audio_bytes')
      .eq('id', id);

    if (!isSuperadmin(user)) {
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query.maybeSingle();

    throwIfError(error, 'No se pudo consultar el audio');

    if (!data) {
      return undefined;
    }

    return decodeBytea(
      data.audio_bytes as string | Uint8Array | null,
    );
  }

  // Crea un proyecto asignándolo al usuario autenticado.
  async create(
    project: ProjectInput,
    user: AuthUser,
  ): Promise<number> {
    const audio = project.audio;

    const row = {
      owner_id: user.id,
      title: project.title,
      genre: project.genre,
      bpm: project.bpm,
      musical_key: project.musicalKey,
      need: project.need,
      description: project.description,
      status: project.status,
      hook_start: project.hookStart ?? null,
      hook_end: project.hookEnd ?? null,
      audio_bytes: audio ? encodeBytea(audio.bytes) : null,
      audio_name: audio?.name ?? null,
      audio_duration: audio?.duration ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert(row)
      .select('id')
      .single();

    throwIfError(error, 'No se pudo crear el proyecto');

    // Supabase puede devolver data como null; lo comprobamos explícitamente.
    if (!data) {
      throw new Error(
        'Supabase no devolvió el ID del proyecto creado.',
      );
    }

    return Number(data.id);
  }

  // Actualiza un proyecto sin reemplazar el audio si no se adjunta otro.
  async update(
    id: number,
    project: ProjectInput,
    user: AuthUser,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      return false;
    }

    const changes: Record<string, unknown> = {
      title: project.title,
      genre: project.genre,
      bpm: project.bpm,
      musical_key: project.musicalKey,
      need: project.need,
      description: project.description,
      status: project.status,
      hook_start: project.hookStart ?? null,
      hook_end: project.hookEnd ?? null,
      updated_at: new Date().toISOString(),
    };

    if (project.audio) {
      changes.audio_bytes = encodeBytea(project.audio.bytes);
      changes.audio_name = project.audio.name;
      changes.audio_duration = project.audio.duration;
    }

    let query = supabaseAdmin
      .from('projects')
      .update(changes)
      .eq('id', id);

    if (!isSuperadmin(user)) {
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query.select('id');

    throwIfError(error, 'No se pudo actualizar el proyecto');

    return (data?.length ?? 0) > 0;
  }

  // Elimina un proyecto solo si el usuario tiene permiso.
  async delete(
    id: number,
    user: AuthUser,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      return false;
    }

    let query = supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', id);

    if (!isSuperadmin(user)) {
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query.select('id');

    throwIfError(error, 'No se pudo eliminar el proyecto');

    return (data?.length ?? 0) > 0;
  }
}
