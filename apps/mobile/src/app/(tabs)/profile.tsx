import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Share, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { walleyeProfile } from '@bitecast/engine';
import { Icon } from '@/components/icon';
import { Banner, Card, Chip, Divider, ICE_SAFETY_TEXT, LinkButton, ListRow, Row, Screen, SectionHeader, Segmented, T, ToggleRow } from '@/components/ui';
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
  const setIceFishing = useAppStore((state) => state.setIceFishing);
  const lakeSeasons = useAppStore((state) => state.lakeSeasons);
  const resetLakeSeasons = useAppStore((state) => state.resetLakeSeasons);
  const manualCount = Object.keys(lakeSeasons).length;
  const isPro = useAppStore((state) => state.isPro);
  const setPro = useAppStore((state) => state.setPro);
  const account = useAppStore((state) => state.account);
  const setAccount = useAppStore((state) => state.setAccount);
  const logs = useAppStore((state) => state.catchLogs);
  const followed = useAppStore((state) => state.followedLakeIds);
  const alerts = useAppStore((state) => state.alerts);
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
      <View style={{ gap: 2 }}>
        <T variant="label" color={colors.teal}>Account & settings</T>
        <T variant="title" accessibilityRole="header">Profile</T>
      </View>

      {notice ? <Banner tone={notice.tone} title={notice.title} body={notice.body} live /> : null}

      {/* Account */}
      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.md}>
          <View style={[styles.avatar, linked && { backgroundColor: colors.teal }]}>
            <Icon name={linked && account.provider === 'apple' ? 'apple' : 'person'} size={22} color={linked ? colors.onDark : colors.inkSoft} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="headline">{linked ? `Linked with ${account.provider === 'apple' ? 'Apple' : 'Google'}` : 'Anonymous angler'}</T>
            <T variant="caption" color={colors.inkMuted}>{linked ? 'Your logs can follow you to a new device.' : 'Logs are saved on this device.'}</T>
          </View>
          <Chip label={isPro ? 'Pro' : 'Free'} tone={isPro ? 'good' : 'neutral'} icon={isPro ? 'pro' : undefined} />
        </Row>
        {!linked || !isPro ? (
          <View style={styles.inset}>
            {!linked ? <ListRow icon="link" title="Back up your logs" subtitle="Link Apple or Google · no password" onPress={() => router.push('/auth')} /> : null}
            {!linked && !isPro ? <Divider inset={48} /> : null}
            {!isPro ? <ListRow icon="pro" title="BiteCast Pro" subtitle="Alerts, 7-day outlook and personal patterns" onPress={() => router.push('/paywall')} /> : null}
          </View>
        ) : null}
      </Card>

      {/* Fishing */}
      <SectionHeader title="Fishing" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <T variant="callout" weight="700">Units</T>
          <Segmented label="Units" value={settings.units} onChange={setUnits} options={[{ label: '°C · m · cm', value: 'metric', accessibilityLabel: 'Metric: Celsius, metres, centimetres' }, { label: '°F · ft · in', value: 'imperial', accessibilityLabel: 'Imperial: Fahrenheit, feet, inches' }]} />
        </View>
        <Divider />
        <View style={{ gap: spacing.xs }}>
          <ToggleRow
            icon="ice"
            title="I also fish through the ice"
            subtitle={settings.iceFishing ? 'Lakes switch to ice mode when they typically freeze' : 'Every lake uses open-water conditions'}
            value={settings.iceFishing}
            onValueChange={setIceFishing}
          />
          {manualCount ? (
            <Row justify="space-between">
              <T variant="caption" color={colors.inkMuted}>{manualCount} lake{manualCount === 1 ? '' : 's'} set by hand</T>
              <LinkButton onPress={resetLakeSeasons}>Reset to typical</LinkButton>
            </Row>
          ) : null}
          {settings.iceFishing || Object.values(lakeSeasons).includes('ice') ? <T variant="caption" color={colors.warning}>{ICE_SAFETY_TEXT}</T> : null}
        </View>
        <Divider />
        <ListRow icon={settings.alertsEnabled ? 'bell' : 'bell-off'} title="Window alerts" subtitle={settings.alertsEnabled ? `On for ${activeAlerts} of ${followed.length} lakes` : 'Off'} onPress={() => router.push('/profile/alerts')} />
      </Card>

      {/* Data */}
      <SectionHeader title="Your data" caption={`${logs.length} catch log${logs.length === 1 ? '' : 's'} on this device${pending ? ` · ${pending} not synced` : ''}`} />
      <Card style={styles.list}>
        <ListRow icon="export" title={exporting ? 'Preparing export…' : 'Export catch logs'} subtitle="Share a CSV of every log" onPress={exportLogs} />
        <Divider inset={48} />
        <ListRow icon="restore" title={restoring ? 'Restoring…' : 'Restore purchases'} subtitle="Re-activate Pro from your store account" onPress={restore} chevron={false} />
        <Divider inset={48} />
        <ListRow icon="trash" title="Delete data on this device" subtitle={pending ? `${pending} unsynced log${pending === 1 ? '' : 's'} would be lost` : 'Removes local catch logs'} onPress={confirmDelete} destructive chevron={false} />
        {integrationStatus[0].ready ? <><Divider inset={48} /><ListRow icon="trash" title={deletingAccount ? 'Deleting account…' : 'Delete BiteCast account'} subtitle="Permanently removes cloud and local data" onPress={deletingAccount ? undefined : confirmDeleteAccount} destructive chevron={false} /></> : null}
      </Card>

      {/* Support & about */}
      <SectionHeader title="Support & about" />
      <Card style={styles.list}>
        <ListRow icon="request" title="Request a lake" subtitle="Help us choose where to add coverage" onPress={() => router.push('/profile/request-lake')} />
        <Divider inset={48} />
        <ListRow icon="info" title="About BiteCast" subtitle={`Version ${Constants.expoConfig?.version ?? '—'} · engine ${walleyeProfile.version} · ${DATA_SOURCE_LABEL.toLowerCase()}`} chevron={false} />
      </Card>
      <T variant="caption" color={colors.inkMuted} align="center" style={{ paddingHorizontal: spacing.lg }}>
        Bite scores describe conditions, never guaranteed catches. Official regulations always govern.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  inset: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, marginBottom: -spacing.sm },
  list: { gap: 0, paddingVertical: spacing.xs, borderRadius: radius.lg },
});
