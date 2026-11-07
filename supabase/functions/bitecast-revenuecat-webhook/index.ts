import { handleOptions, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  expiration_at_ms?: number | null;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expected || request.headers.get('authorization') !== expected) return json({ error: 'Unauthorized' }, 401);

  try {
    const payload = await request.json() as { event?: RevenueCatEvent };
    const event = payload.event;
    const userId = event?.app_user_id ?? event?.original_app_user_id;
    if (!event || !userId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(userId)) {
      return json({ error: 'A Supabase user id is required as the RevenueCat app user id' }, 400);
    }

    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    const inactiveEvent = ['EXPIRATION', 'BILLING_ISSUE'].includes(event.type ?? '');
    const isActive = !inactiveEvent && (!event.expiration_at_ms || event.expiration_at_ms > Date.now());
    const { error } = await serviceClient().from('entitlements').upsert({
      user_id: userId,
      is_active: isActive,
      product_id: event.product_id ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return json({ received: true });
  } catch (error) {
    console.error('bitecast-revenuecat-webhook', error);
    return json({ error: 'Webhook processing failed' }, 500);
  }
});
