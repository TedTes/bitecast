import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Platform, Share, View } from 'react-native';
import Constants from 'expo-constants';
import { walleyeProfile } from '@bitecast/engine';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, Chip, Divider, ICE_SAFETY_TEXT, ListRow, Row, Screen, SectionHeader, Segmented, T, ToggleRow } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { deleteCloudAccount, integrationStatus, restorePurchases } from '@/api/adapters';
import { DATA_SOURCE_LABEL } from '@/data/forecasts';
import { catchLogsToCsv } from '@/features/export';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';

type Notice = { tone: 'success' | 'danger' | 'neutral'; title: string; body?: string } | null;

export default function ProfileScreen() {
  const settings = useAppStore((state) => state.settings);
  const setUnits = useAppStore((state) => state.setUnits);
  const setSeason = useAppStore((state) => state.setSeason);
  const isPro = useAppStore((state) => state.isPro);
  const setPro = useAppStore((state) => state.setPro);
  const account = useAppStore((state) => state.account);
  const setAccount = useAppStore((state) => state.setAccount);
  const logs = useAppStore((state) => state.catchLogs);
  const followed = useAppStore((state) => state.followedLakeIds);
  const alerts = useAppStore((state) => state.alerts);
  const connectivity = useAppStore((state) => state.connectivity);
  const setConnectivity = useAppStore((state) => state.setConnectivity);
  const clearLocalData = useAppStore((state) => state.clearLocalData);
  const [notice, setNotice] = useState<Notice>(null);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const linked = account.status === 'linked';
  const activeAlerts = followed.filter((id) => alerts.find((item) => item.lakeId === id)?.enabled ?? true).length;
  const pending = logs.filter((log) => log.syncState !== 'synced').length;

  const restore = async () => {
    setRestoring(true);
    setNotice(null);
    try {
      const active = await restorePurchases();
      if (active) { setPro(true); haptic.success(); setNotice({ tone: 'success', title: 'Purchase restored', body: 'BiteCast Pro is active on this device.' }); }
      else setNotice({ tone: 'neutral', title: 'No purchases found', body: 'There’s no active subscription for this store account.' });
    } catch {
      setNotice({ tone: 'danger', title: 'Couldn’t reach the store', body: 'Check your connection and try again.' });
    } finally {
      setRestoring(false);
    }
  };

  const exportLogs = async () => {
    if (!logs.length) { setNotice({ tone: 'neutral', title: 'Nothing to export yet', body: 'Log a trip first — exports include every log on this device.' }); return; }
    setExporting(true);
    try {
      await Share.share({ title: 'BiteCast catch logs', message: catchLogsToCsv(logs) });
    } catch {
      setNotice({ tone: 'danger', title: 'Export didn’t open', body: 'Your logs are unchanged. Try again.' });
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete data on this device?',
      `This permanently removes ${logs.length} catch log${logs.length === 1 ? '' : 's'}${pending ? `, including ${pending} that haven’t synced` : ''}. Export first if you want a copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearLocalData();
              haptic.success();
              setNotice({ tone: 'success', title: 'Local data deleted', body: 'Catch logs and pending requests were removed from this device.' });
            } catch {
              setNotice({ tone: 'danger', title: 'Couldn’t delete data', body: 'Nothing was removed. Try again.' });
            }
          },
        },
      ],
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete BiteCast account?',
      'This permanently deletes synced logs, follows, alert settings, and your BiteCast account. Local logs on this device will also be removed. Export first if you want a copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteCloudAccount();
              await clearLocalData();
              setAccount({ status: 'anonymous' });
              haptic.success();
              setNotice({ tone: 'success', title: 'Account deleted', body: 'Cloud and local BiteCast data were removed.' });
            } catch (error) {
              setNotice({ tone: 'danger', title: 'Couldn’t delete the account', body: error instanceof Error ? error.message : 'Nothing was removed. Try again.' });
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen tab>
      <View style={{ gap: spacing.xs }}>
        <T variant="label" color={colors.teal}>Account & settings</T>
        <T variant="display" accessibilityRole="header">Profile</T>
      </View>

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.md}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: linked ? colors.teal : colors.fog, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={linked ? (account.provider === 'apple' ? 'apple' : 'person') : 'person'} size={22} color={linked ? colors.onDark : colors.inkSoft} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="headline">{linked ? `Linked with ${account.provider === 'apple' ? 'Apple' : 'Google'}` : 'Anonymous angler'}</T>
            <T variant="caption" color={colors.inkMuted}>{linked ? 'Your logs can follow you to a new device.' : 'Offline-first. Link an account for recovery on another device.'}</T>
          </View>
          <Chip label={isPro ? 'Pro' : 'Free'} tone={isPro ? 'good' : 'neutral'} icon={isPro ? 'pro' : undefined} />
        </Row>
        {!linked ? (
          <Button variant="secondary" size="md" icon="link" onPress={() => router.push('/auth')}>Link Apple or Google</Button>
        ) : null}
        {!isPro ? <Button size="md" icon="pro" onPress={() => router.push('/paywall')}>See BiteCast Pro</Button> : null}
      </Card>

      {notice ? <Banner tone={notice.tone} title={notice.title} body={notice.body} live /> : null}

      <SectionHeader title="Preferences" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <Row gap={spacing.sm}><Icon name="units" size={16} color={colors.teal} /><T variant="subhead">Units</T></Row>
          <Segmented label="Units" value={settings.units} onChange={setUnits} options={[{ label: '°C · m · cm', value: 'metric', accessibilityLabel: 'Metric: Celsius, metres, centimetres' }, { label: '°F · ft · in', value: 'imperial', accessibilityLabel: 'Imperial: Fahrenheit, feet, inches' }]} />
        </View>
        <Divider />
        <View style={{ gap: spacing.sm }}>
          <Row gap={spacing.sm}><Icon name="calendar" size={16} color={colors.teal} /><T variant="subhead">Season</T></Row>
          <Segmented label="Season" value={settings.season} onChange={setSeason} options={[{ label: 'Open water', value: 'open_water', icon: 'open-water' }, { label: 'Ice', value: 'ice', icon: 'ice' }]} />
          {settings.season === 'ice' ? <T variant="caption" color={colors.warning}>{ICE_SAFETY_TEXT}</T> : null}
        </View>
      </Card>

      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        <ListRow icon={settings.alertsEnabled ? 'bell' : 'bell-off'} title="Window alerts" subtitle={settings.alertsEnabled ? `On for ${activeAlerts} of ${followed.length} lakes` : 'Off'} onPress={() => router.push('/profile/alerts')} />
        <Divider inset={48} />
        <ListRow icon="request" title="Request a lake" subtitle="Help us prioritize coverage" onPress={() => router.push('/profile/request-lake')} />
      </Card>

      <SectionHeader title="Your data" />
      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        <ListRow icon="export" title={exporting ? 'Preparing export…' : 'Export catch logs'} subtitle={`${logs.length} log${logs.length === 1 ? '' : 's'} · CSV`} onPress={exportLogs} />
        <Divider inset={48} />
        <ListRow icon="restore" title={restoring ? 'Restoring…' : 'Restore purchases'} subtitle="Re-activate Pro from your store account" onPress={restore} chevron={false} />
        <Divider inset={48} />
        <ListRow icon="trash" title="Delete data on this device" subtitle={pending ? `${pending} unsynced log${pending === 1 ? '' : 's'} would be lost` : 'Removes local catch logs'} onPress={confirmDelete} destructive chevron={false} />
        {integrationStatus[0].ready ? <><Divider inset={48} /><ListRow icon="trash" title={deletingAccount ? 'Deleting account…' : 'Delete BiteCast account'} subtitle="Permanently removes cloud and local data" onPress={deletingAccount ? undefined : confirmDeleteAccount} destructive chevron={false} /></> : null}
      </Card>

      <SectionHeader title="About" />
      <Card style={{ gap: spacing.sm }}>
        <Row justify="space-between"><T variant="callout" color={colors.inkSoft}>Version</T><T variant="callout" weight="600">{Constants.expoConfig?.version ?? '—'}</T></Row>
        <Row justify="space-between"><T variant="callout" color={colors.inkSoft}>Forecast engine</T><T variant="callout" weight="600">{walleyeProfile.version}</T></Row>
        <Row justify="space-between"><T variant="callout" color={colors.inkSoft}>Weather data</T><T variant="callout" weight="600">{DATA_SOURCE_LABEL}</T></Row>
        <Divider />
        <T variant="caption" color={colors.inkMuted}>Bite scores describe conditions, never guaranteed catches. Official regulations always govern.</T>
      </Card>

      {__DEV__ || integrationStatus.some((item) => !item.ready) ? (
        <>
          <SectionHeader title="Integrations" caption="Placeholders until credentials are configured" />
          <Card style={{ gap: spacing.sm }}>
            {integrationStatus.map((item) => (
              <Row key={item.name} gap={spacing.sm}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.ready ? colors.success : colors.sunrise }} />
                <T variant="callout" style={{ flex: 1 }}>{item.name}</T>
                <T variant="caption" weight="700" color={item.ready ? colors.success : colors.warning}>{item.ready ? 'Connected' : 'Placeholder'}</T>
              </Row>
            ))}
            {__DEV__ ? (
              <View style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, borderRadius: radius.xs }}>
                <ToggleRow icon="offline" title="Simulate offline" subtitle={`Development only · ${Platform.OS}`} value={connectivity === 'offline'} onValueChange={(value) => setConnectivity(value ? 'offline' : 'online')} />
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
