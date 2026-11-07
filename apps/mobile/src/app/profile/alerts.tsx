import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { upcomingWindows } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, ChoiceChips, Divider, EmptyState, Row, Screen, SectionHeader, T, ToggleRow } from '@/components/ui';
import { colors, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { getNotificationPermission, requestNotificationPermission, type NotificationPermission } from '@/api/adapters';
import { getForecast } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { formatDay, shortClock } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useLakeCondition } from '@/features/lake-season';
import { useAppStore } from '@/store/use-app-store';
import type { AlertPreference } from '@/types/app';

const startOptions = ['21:00', '22:00', '23:00'];
const endOptions = ['05:00', '06:00', '07:00'];
const label = (hhmm: string) => {
  const [h] = hhmm.split(':').map(Number);
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
};
const inQuietHours = (date: Date, start: string, end: string) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const toMin = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const s = toMin(start), e = toMin(end);
  return s > e ? minutes >= s || minutes < e : minutes >= s && minutes < e;
};

export default function AlertsScreen() {
  const followed = useAppStore((state) => state.followedLakeIds);
  const alerts = useAppStore((state) => state.alerts);
  const update = useAppStore((state) => state.updateAlert);
  const settings = useAppStore((state) => state.settings);
  const setMaster = useAppStore((state) => state.setAlertsEnabled);
  const setQuietHours = useAppStore((state) => state.setQuietHours);
  const isPro = useAppStore((state) => state.isPro);
  const [permission, setPermission] = useState<NotificationPermission>('undetermined');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    getNotificationPermission().then(setPermission).catch(() => undefined);
  }, []);

  const master = settings.alertsEnabled && permission !== 'denied';

  const toggleMaster = async (enabled: boolean) => {
    if (!enabled) { setMaster(false); return; }
    if (permission !== 'granted') {
      setRequesting(true);
      const result = await requestNotificationPermission().catch(() => 'denied' as const);
      setRequesting(false);
      setPermission(result);
      if (result !== 'granted') { haptic.warning(); setMaster(false); return; }
    }
    setMaster(true);
  };

  return (
    <Screen header>
      <View style={{ gap: spacing.sm }}>
        <T variant="title" accessibilityRole="header">Window alerts</T>
        <T variant="body" color={colors.inkMuted}>At most one alert per lake per day, before a window that meets your bar.</T>
      </View>

      {!isPro ? (
        <Banner tone="info" icon="pro" title="Alerts are part of BiteCast Pro" body="Set them up now; they’ll send once Pro is active." action={{ label: 'See Pro', onPress: () => router.push('/paywall') }} />
      ) : null}

      {permission === 'denied' ? (
        <Banner
          tone="danger"
          icon="bell-off"
          title="Notifications are turned off"
          body="BiteCast can’t send alerts until you allow notifications in system settings."
          action={{ label: 'Open settings', onPress: () => Linking.openSettings() }}
          live
        />
      ) : null}

      <Card style={{ paddingVertical: spacing.xs }}>
        <ToggleRow icon="bell" title="Allow window alerts" subtitle={requesting ? 'Requesting permission…' : permission === 'granted' ? 'Notifications allowed' : 'We’ll ask for notification permission'} value={master} onValueChange={toggleMaster} disabled={requesting || permission === 'denied'} />
      </Card>

      {followed.length === 0 ? (
        <EmptyState icon="lake" title="No lakes to alert on" body="Follow a lake first, then choose its alert threshold here." action={<Button onPress={() => router.push('/(tabs)/map')}>Find lakes</Button>} />
      ) : (
        <>
          <SectionHeader title="Followed lakes" caption={master ? 'Pick how strong a window must be, and how much warning you want' : 'Turn on alerts above to edit'} />
          {followed.map((id) => {
            const preference: AlertPreference = alerts.find((item) => item.lakeId === id) ?? { lakeId: id, enabled: true, threshold: 70, leadMinutes: 120 };
            return <LakeAlertCard key={id} preference={preference} disabled={!master} onChange={(patch) => update({ ...preference, ...patch })} quiet={[settings.quietStart, settings.quietEnd]} />;
          })}
        </>
      )}

      <SectionHeader title="Quiet hours" caption="Alerts that fall in quiet hours are skipped, not delayed" />
      <Card style={{ gap: spacing.md, opacity: master ? 1 : 0.5 }} >
        <Row gap={spacing.sm}>
          <Icon name="quiet" size={18} color={colors.teal} />
          <T variant="subhead">{label(settings.quietStart)} to {label(settings.quietEnd)}</T>
        </Row>
        <View style={{ gap: spacing.sm }} pointerEvents={master ? 'auto' : 'none'}>
          <T variant="caption" color={colors.inkMuted}>Starts</T>
          <ChoiceChips label="Quiet hours start" value={settings.quietStart} onChange={(start) => setQuietHours(start, settings.quietEnd)} options={startOptions.map((value) => ({ label: label(value), value }))} />
          <T variant="caption" color={colors.inkMuted}>Ends</T>
          <ChoiceChips label="Quiet hours end" value={settings.quietEnd} onChange={(end) => setQuietHours(settings.quietStart, end)} options={endOptions.map((value) => ({ label: label(value), value }))} />
        </View>
      </Card>
    </Screen>
  );
}

function LakeAlertCard({ preference, disabled, onChange, quiet }: { preference: AlertPreference; disabled: boolean; onChange: (patch: Partial<AlertPreference>) => void; quiet: [string, string] }) {
  const lake = lakeById(preference.lakeId);
  const season = useLakeCondition(lake.id).season;
  const now = useNow();
  const active = preference.enabled && !disabled;
  const next = upcomingWindows(getForecast(lake.id, season).windows, now).find((window) => window.peakScore >= preference.threshold);
  const alertAt = next ? new Date(Math.max(now, new Date(next.start).getTime() - preference.leadMinutes * 60_000)) : null;
  const suppressed = alertAt ? inQuietHours(alertAt, quiet[0], quiet[1]) : false;

  return (
    <Card style={{ gap: spacing.md, opacity: disabled ? 0.55 : 1 }}>
      <ToggleRow title={lake.name} subtitle={active ? `Score ${preference.threshold}+ · ${preference.leadMinutes / 60} h notice` : 'Alerts off for this lake'} value={preference.enabled && !disabled} onValueChange={(enabled) => onChange({ enabled })} disabled={disabled} />
      {active ? (
        <>
          <Divider />
          <View style={{ gap: spacing.sm }}>
            <T variant="callout" weight="700">Minimum peak score</T>
            <ChoiceChips
              label={`Minimum peak score for ${lake.name}`}
              value={String(preference.threshold)}
              onChange={(value) => onChange({ threshold: Number(value) })}
              options={[60, 70, 80].map((value) => ({ label: `${value}+ ${scoreBands[scoreBand(value)].label}`, value: String(value), accessibilityLabel: `${value} or higher, ${scoreBands[scoreBand(value)].label}` }))}
            />
          </View>
          <View style={{ gap: spacing.sm }}>
            <T variant="callout" weight="700">Notice before the window</T>
            <ChoiceChips label={`Notice for ${lake.name}`} value={String(preference.leadMinutes)} onChange={(value) => onChange({ leadMinutes: Number(value) })} options={[60, 120, 180].map((value) => ({ label: `${value / 60} h`, value: String(value), accessibilityLabel: `${value / 60} hour${value > 60 ? 's' : ''} before` }))} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.tealMist }} accessible accessibilityLiveRegion="polite">
            <Icon name={suppressed ? 'quiet' : 'clock'} size={16} color={suppressed ? colors.warning : colors.teal} style={{ marginTop: 2 }} />
            <T variant="caption" color={colors.inkSoft} style={{ flex: 1 }}>
              {next && alertAt
                ? suppressed
                  ? `Next match: ${formatDay(next.start)} ${shortClock(next.start)} (peak ${next.peakScore}). The alert would land in quiet hours, so it would be skipped.`
                  : `Next match: ${formatDay(next.start)} ${shortClock(next.start)} (peak ${next.peakScore}). You’d be alerted around ${shortClock(alertAt)}.`
                : `No window reaches ${preference.threshold} in this week’s forecast.`}
            </T>
          </View>
        </>
      ) : null}
    </Card>
  );
}
