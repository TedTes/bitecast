import { createClient } from 'npm:@supabase/supabase-js@2';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function serviceClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    db: { schema: 'bitecast' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(authorization: string) {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    db: { schema: 'bitecast' },
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
