
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin, supabaseAuth } from '../config/supabase.ts';

export type AuthUser = {
  id: string;
  username: string;
  role: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  username: string;
  role: string;
  csrfToken: string;
};

type ProfileRow = {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
};

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(`Error de Supabase: ${error.message}`);
  }
}

export class UserModel {
  async authenticate(
    username: string,
    password: string,
  ): Promise<AuthUser | undefined> {
    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      return undefined;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        `No se pudo consultar el usuario: ${profileError.message}`,
      );
    }

    if (!profile) {
      return undefined;
    }

    const { data: authUser, error: authUserError } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);

    if (authUserError || !authUser.user?.email) {
      return undefined;
    }

    const { data: signInData, error: signInError } =
      await supabaseAuth.auth.signInWithPassword({
        email: authUser.user.email,
        password,
      });

    if (signInError || !signInData.user) {
      return undefined;
    }

    return {
      id: profile.id,
      username: profile.username,
      role: profile.role,
    };
  }

  async register(
    username: string,
    email: string,
    password: string,
  ): Promise<boolean> {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const { data: existingUsername, error: usernameError } =
      await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();

    throwIfError(usernameError);

    if (existingUsername) {
      return false;
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        display_name: normalizedUsername,
      },
    });

    if (error) {
      if (
        /already registered|already exists|duplicate key|unique constraint/i.test(
          error.message,
        )
      ) {
        return false;
      }

      throw new Error(`No se pudo registrar el usuario: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('Supabase no devolvió el usuario creado.');
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      // Evitar dejar una cuenta Auth huérfana si no se creó el perfil.
      const { error: cleanupError } =
        await supabaseAdmin.auth.admin.deleteUser(data.user.id);

      if (cleanupError) {
        console.error(
          'No se pudo limpiar la cuenta Auth incompleta:',
          cleanupError.message,
        );
      }

      throw new Error(
        `No se pudo confirmar el perfil del usuario: ${
          profileError?.message ?? 'el trigger no creó el perfil'
        }`,
      );
    }

    return true;
  }

  async createSession(user: AuthUser): Promise<AuthSession> {
    const id = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('hex');

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MS,
    ).toISOString();

    const { error } = await supabaseAdmin
      .from('app_sessions')
      .insert({
        session_id_hash: hashSessionId(id),
        user_id: user.id,
        csrf_token: csrfToken,
        expires_at: expiresAt,
      });

    throwIfError(error);

    return {
      id,
      userId: user.id,
      username: user.username,
      role: user.role,
      csrfToken,
    };
  }

  async getSession(sessionId: string): Promise<AuthSession | undefined> {
    if (!sessionId) {
      return undefined;
    }

    const sessionHash = hashSessionId(sessionId);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('app_sessions')
      .select('user_id, csrf_token, expires_at')
      .eq('session_id_hash', sessionHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError) {
      throw new Error(
        `No se pudo consultar la sesión: ${sessionError.message}`,
      );
    }

    if (!session) {
      // La sesión no existe o ya expiró.
      // Si el registro aún existe, intentamos limpiarlo.
      const { error: deleteError } = await supabaseAdmin
        .from('app_sessions')
        .delete()
        .eq('session_id_hash', sessionHash);

      if (deleteError) {
        throw new Error(
          `No se pudo limpiar la sesión caducada: ${deleteError.message}`,
        );
      }

      return undefined;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role')
      .eq('id', session.user_id)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        `No se pudo consultar el perfil: ${profileError.message}`,
      );
    }

    if (!profile) {
      // Sin perfil válido, la sesión no debe seguir siendo utilizable.
      const { error: deleteError } = await supabaseAdmin
        .from('app_sessions')
        .delete()
        .eq('session_id_hash', sessionHash);

      if (deleteError) {
        throw new Error(
          `No se pudo eliminar la sesión sin perfil: ${deleteError.message}`,
        );
      }

      return undefined;
    }

    return {
      id: sessionId,
      userId: profile.id,
      username: profile.username,
      role: profile.role,
      csrfToken: session.csrf_token,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    const { error } = await supabaseAdmin
      .from('app_sessions')
      .delete()
      .eq('session_id_hash', hashSessionId(sessionId));

    throwIfError(error);
  }
}
