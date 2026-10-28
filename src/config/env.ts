
import 'dotenv/config';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta configurar la variable de entorno ${name}.`,
    );
  }

  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),

  supabaseUrl: requiredEnv('SUPABASE_URL'),

  // Exclusiva del servidor para operaciones administrativas.
  supabaseServiceRoleKey: requiredEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
  ),

  // Se utilizará para autenticar usuarios normales.
  supabaseAnonKey: requiredEnv('SUPABASE_ANON_KEY'),
};
