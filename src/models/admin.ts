
import type { AuthUser } from './user.ts';
import { ValidationError } from './project.ts';
import { CatalogModel } from './catalog.ts';
import { supabaseAdmin } from '../config/supabase.ts';

export type ArtistProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
};

export type AdminUser = {
  id: string;
  username: string;
  display_name: string | null;
  role: 'user' | 'superadmin';
};

export type ManagedRole = AdminUser['role'];

export function validateManagedRole(role: string): ManagedRole {
  if (role !== 'user' && role !== 'superadmin') {
    throw new ValidationError('El rol seleccionado no es válido.');
  }
  return role;
}

export function requireAdmin(user: AuthUser) {
  if (user.role !== 'superadmin') {
    throw new ValidationError('Acceso exclusivo del administrador.');
  }
}

export function validateArtistId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ValidationError('Artista inválido.');
  }
}

export function validateArtistProfile(fields: URLSearchParams) {
  const displayName = (fields.get('displayName') ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  const bio = (fields.get('bio') ?? '').trim();

  if (
    displayName.length < 2 ||
    displayName.length > 60 ||
    /[<>\x00-\x1f]/.test(displayName)
  ) {
    throw new ValidationError(
      'El nombre artístico debe tener entre 2 y 60 caracteres, sin etiquetas ni caracteres de control.'
    );
  }

  if (
    bio.length > 500 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(bio)
  ) {
    throw new ValidationError(
      'La biografía admite hasta 500 caracteres y texto válido.'
    );
  }

  return { display_name: displayName, bio };
}

export class AdminModel extends CatalogModel {

  // Consultar todas las cuentas.
  async users(user: AuthUser): Promise<AdminUser[]> {
    requireAdmin(user);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id,username,display_name,role')
      .order('username');

    if (error) {
      throw new Error(`No se pudieron consultar las cuentas: ${error.message}`);
    }

    return (data ?? []).map(profile => ({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      role: profile.role === 'superadmin' ? 'superadmin' : 'user',
    }));
  }

  // Cambiar el rol de otra cuenta.
  async changeUserRole(
    id: string,
    role: string,
    actor: AuthUser
  ): Promise<void> {
    requireAdmin(actor);
    validateArtistId(id);

    const newRole = validateManagedRole(role);

    if (id === actor.id) {
      throw new ValidationError(
        'No puedes cambiar tu propio rol desde esta pantalla.'
      );
    }

    // El cambio se ejecuta mediante una función SQL segura.
    const { error } = await supabaseAdmin.rpc('admin_update_user_role', {
      p_actor_id: actor.id,
      p_target_user_id: id,
      p_new_role: newRole,
    });

    if (error) {
      if (error.code === 'P0001') {
        throw new ValidationError(error.message);
      }

      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error(
          'Falta ejecutar la migración database/20261118_admin_manage_roles.sql en Supabase.'
        );
      }

      throw new Error(`No se pudo cambiar el rol: ${error.message}`);
    }
  }

  // Funcionalidades existentes de artistas.
  async artists(user: AuthUser): Promise<ArtistProfile[]> {
    requireAdmin(user);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id,username,display_name,bio')
      .neq('role', 'superadmin')
      .order('username');

    if (error) {
      throw new Error(
        `Artistas: ejecuta 20261028_artist_profiles.sql. ${error.message}`
      );
    }

    return data ?? [];
  }

  async artist(
    id: string,
    user: AuthUser
  ): Promise<ArtistProfile | undefined> {
    requireAdmin(user);
    validateArtistId(id);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id,username,display_name,bio')
      .eq('id', id)
      .neq('role', 'superadmin')
      .maybeSingle();

    if (error) {
      throw new Error(
        `No se pudo consultar el artista: ${error.message}`
      );
    }

    return data ?? undefined;
  }

  async saveArtist(
    id: string,
    fields: URLSearchParams,
    user: AuthUser
  ): Promise<boolean> {
    requireAdmin(user);
    validateArtistId(id);

    const changes = validateArtistProfile(fields);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(changes)
      .eq('id', id)
      .neq('role', 'superadmin')
      .select('id');

    if (error?.code === '23514') {
      throw new ValidationError(
        'Revisa el nombre artístico y la biografía.'
      );
    }

    if (error) {
      throw new Error(
        `No se pudo guardar el artista: ${error.message}`
      );
    }

    return (data?.length ?? 0) > 0;
  }
}
