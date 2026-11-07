import { handleOptions, json } from '../_shared/http.ts';
import { serviceClient, userClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  try {
    const userDb = userClient(authorization);
    const { data: auth, error: authError } = await userDb.auth.getUser();
    if (authError || !auth.user) return json({ error: 'Invalid session' }, 401);

    // Service access starts only after getUser verifies the JWT and supplies the
    // authoritative user id. This also removes server-owned rows without adding
    // broad delete policies to otherwise private tables.
    const admin = serviceClient();
    for (const table of ['alerts_sent', 'push_tokens', 'catch_logs', 'follows', 'lake_requests', 'entitlements', 'profiles']) {
      const { error } = await admin.from(table).delete().eq('user_id', auth.user.id);
      if (error) throw error;
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(auth.user.id);
    if (deleteError) throw deleteError;
    return json({ deleted: true });
  } catch (error) {
    console.error('bitecast-delete-account', error);
    return json({ error: 'Could not delete the account' }, 500);
  }
});
