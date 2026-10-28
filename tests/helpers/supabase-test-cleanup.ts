
import { supabaseAdmin } from '../../src/config/supabase.ts';

/**
 * Limpia exclusivamente los datos de un usuario temporal
 * creado por una prueba automatizada.
 *
 * No elimina cuentas si no se proporciona su ID.
 * No elimina proyectos que pertenezcan a otros usuarios.
 */
export async function cleanupTemporaryUser(
  userId: string | undefined,
): Promise<void> {
  if (!userId) {
    return;
  }

  // Verificar que la cuenta exista en Supabase Auth.
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authError) {
    throw new Error(
      `No se pudo verificar el usuario temporal: ${authError.message}`,
    );
  }

  if (!authData.user) {
    return;
  }

  // Consultar exclusivamente los proyectos del usuario temporal.
  const { data: projects, error: projectsError } =
    await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('owner_id', userId);

  if (projectsError) {
    throw new Error(
      `No se pudieron consultar los proyectos temporales: ${projectsError.message}`,
    );
  }

  const projectIds = (projects ?? []).map((project) => project.id);

  // El historial de esos proyectos se elimina antes que los proyectos.
  if (projectIds.length > 0) {
    const { error: historyError } = await supabaseAdmin
      .from('project_assignment_history')
      .delete()
      .in('project_id', projectIds);

    if (historyError) {
      throw new Error(
        `No se pudo limpiar el historial de los proyectos temporales: ${historyError.message}`,
      );
    }

    // Eliminar exclusivamente los proyectos del usuario temporal.
    const { error: deleteProjectsError } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('owner_id', userId);

    if (deleteProjectsError) {
      throw new Error(
        `No se pudieron eliminar los proyectos temporales: ${deleteProjectsError.message}`,
      );
    }
  }

  // Comprobar si el usuario aparece en el historial de otros proyectos.
  // No borramos esos registros automáticamente porque podrían ser ajenos
  // a la prueba y formar parte de la trazabilidad de la aplicación.
  const { data: historyReferences, error: referencesError } =
    await supabaseAdmin
      .from('project_assignment_history')
      .select('id')
      .or(
        `changed_by.eq.${userId},new_owner_id.eq.${userId}`,
      )
      .limit(1);

  if (referencesError) {
    throw new Error(
      `No se pudieron verificar las referencias del historial: ${referencesError.message}`,
    );
  }

  if (historyReferences && historyReferences.length > 0) {
    throw new Error(
      'No se puede eliminar el usuario temporal: todavía aparece en el historial de asignaciones de otros proyectos.',
    );
  }

  // Eliminar las sesiones de la cuenta temporal.
  const { error: sessionsError } = await supabaseAdmin
    .from('app_sessions')
    .delete()
    .eq('user_id', userId);

  if (sessionsError) {
    throw new Error(
      `No se pudieron eliminar las sesiones temporales: ${sessionsError.message}`,
    );
  }

  // Eliminar la cuenta de Auth al final.
  // Si existen referencias que impidan la operación, el error se comunica.
  const { error: deleteUserError } =
    await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteUserError) {
    throw new Error(
      `No se pudo eliminar el usuario temporal: ${deleteUserError.message}`,
    );
  }
}
