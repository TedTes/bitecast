import { handleOptions, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Follow = {
  user_id: string;
  lake_id: string;
  threshold: number;
  lead_minutes: number;
  quiet_start: string;
  quiet_end: string;
  lake: { name: string } | null;
};

function isQuiet(start: string, end: string, timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const current = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const from = startHour * 60 + startMinute;
  const to = endHour * 60 + endMinute;
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('BITECAST_CRON_SECRET');
  if (!secret || request.headers.get('x-bitecast-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  try {
    const db = serviceClient();
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: windows, error: windowError } = await db.from('forecast_windows')
      .select('id,lake_id,start_ts,peak_score,confidence,reasons')
      .gte('start_ts', now.toISOString()).lte('start_ts', horizon).order('start_ts');
    if (windowError) throw windowError;

    let sent = 0;
    for (const window of windows ?? []) {
      const { data, error } = await db.from('follows').select(
        'user_id,lake_id,threshold,lead_minutes,quiet_start,quiet_end,lake:lakes(name)',
      ).eq('lake_id', window.lake_id).eq('alert_enabled', true).lte('threshold', window.peak_score);
      if (error) throw error;

      for (const candidate of (data ?? []) as unknown as Follow[]) {
        const startsInMinutes = (new Date(window.start_ts).getTime() - now.getTime()) / 60000;
        const [
          { data: entitlement, error: entitlementError },
          { data: tokens, error: tokenError },
          { data: profile, error: profileError },
        ] = await Promise.all([
          db.from('entitlements').select('is_active,expires_at').eq('user_id', candidate.user_id).maybeSingle(),
          db.from('push_tokens').select('token').eq('user_id', candidate.user_id),
          db.from('profiles').select('timezone').eq('user_id', candidate.user_id).maybeSingle(),
        ]);
        if (entitlementError) throw entitlementError;
        if (tokenError) throw tokenError;
        if (profileError) throw profileError;
        const entitled = entitlement?.is_active && (!entitlement.expires_at || new Date(entitlement.expires_at) > now);
        if (!entitled || startsInMinutes > candidate.lead_minutes || isQuiet(candidate.quiet_start, candidate.quiet_end, profile?.timezone ?? 'America/Toronto', now)) continue;
        if (!tokens?.length) continue;

        const { data: existing } = await db.from('alerts_sent').select('id').eq('user_id', candidate.user_id)
          .eq('lake_id', candidate.lake_id).gte('sent_at', `${now.toISOString().slice(0, 10)}T00:00:00Z`).maybeSingle();
        if (existing) continue;

        const messages = tokens.map(({ token }) => ({
          to: token,
          sound: 'default',
          title: `${candidate.lake?.name ?? 'Lake'} window coming up`,
          body: `${window.peak_score}/100 · ${window.confidence} confidence. Open BiteCast for reasons and conditions.`,
          data: { lakeId: candidate.lake_id, windowId: window.id },
        }));
        const push = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages),
        });
        if (!push.ok) throw new Error(`Expo push returned ${push.status}`);
        const { error: sentError } = await db.from('alerts_sent').insert({
          user_id: candidate.user_id, lake_id: candidate.lake_id, window_id: window.id,
        });
        if (sentError?.code !== '23505') {
          if (sentError) throw sentError;
          sent += 1;
        }
      }
    }
    return json({ sent });
  } catch (error) {
    console.error('bitecast-send-alerts', error);
    return json({ error: 'Alert sweep failed' }, 500);
  }
});
