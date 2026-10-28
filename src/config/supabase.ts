
import { createClient } from '@supabase/supabase-js';
import { env } from './env.ts';

// Cliente administrativo: solo debe utilizarse en el servidor.
export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);

// Cliente de autenticación con la clave publicable.
// No utiliza la clave administrativa.
export const supabaseAuth = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);
