import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { walleyeProfile } from '@bitecast/engine';
import { Icon, type IconName } from '@/components/icon';
import { ShorelineHeader } from '@/components/shoreline-header';
import { Banner, Card, Divider, ICE_SAFETY_TEXT, LinkButton, ListRow, ROW_INSET, Row, Screen, Segmented, T, ToggleRow } from '@/components/ui';
import { colors, hitSlop, radius, spacing, touch } from '@/constants/theme';
import { deleteCloudAccount, integrationStatus } from '@/api/adapters';
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
  const account = useAppStore((state) => state.account);
  const setAccount = useAppStore((state) => state.setAccount);
  const logs = useAppStore((state) => state.catchLogs);
  const followed = useAppStore((state) => state.followedLakeIds);
  const alerts = useAppStore((state) => state.alerts);
  const clearLocalData = useAppStore((state) => state.clearLocalData);
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const linked = account.status === 'linked';
  const activeAlerts = followed.filter((id) => alerts.find((item) => item.lakeId === id)?.enabled ?? true).length;
  const pending = logs.filter((log) => log.syncState !== 'synced').length;

  const exportLogs = async () => {
    if (!logs.length) { setNotice({ tone: 'neutral', title: 'Nothing to export yet', body: 'Log a trip first — exports include every log on this device.' }); return; }
    setExporting(true);
    try {
      await Share.share({ title: 'DawnBite catch logs', message: catchLogsToCsv(logs) });
    } catch {
      setNotice({ tone: 'danger', title: 'Export didn’t open', body: 'Your logs are unchanged. Try again.' });
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      `This permanently removes your ${logs.length} catch log${logs.length === 1 ? '' : 's'}${pending ? ` (${pending} not synced)` : ''} and pending lake requests from this phone. Your lake list and settings stay. Export first if you want a copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearLocalData();
              haptic.success();
              setNotice({ tone: 'success', title: 'Account deleted', body: 'Your catch logs and pending requests were removed from this phone.' });
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
      'Delete DawnBite account?',
      'This permanently deletes synced logs, follows, alert settings, and your DawnBite account. Local logs on this device will also be removed. Export first if you want a copy.',
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
              setNotice({ tone: 'success', title: 'Account deleted', body: 'Cloud and local DawnBite data were removed.' });
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

  const fish = logs.reduce((total, log) => total + (log.caught ? log.count : 0), 0);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Until there are display names: a nickname. The Account row below says what is linked.
  const name = linked ? 'Hooked angler' : 'Secret-spot angler';

  return (
    <Screen
      tab
      top={
        // The tab already says “Profile”, so the header says who you are.
        <ShorelineHeader
          title={name}
          subtitle={`${count(followed.length, 'lake')} · ${count(logs.length, 'trip')} · ${fish} walleye`}
        />
      }
    >
      {notice ? <Banner tone={notice.tone} title={notice.title} body={notice.body} live /> : null}

      {/* What you can do with the account: settings like any other */}
      <T variant="label" color={colors.inkMuted} accessibilityRole="header" style={styles.groupLabel}>Account</T>
      <Card style={styles.group}>
        {linked ? (
          <ListRow icon="sync-done" title="Logs backed up" subtitle={`Linked with ${account.provider === 'apple' ? 'Apple' : 'Google'}`} />
        ) : (
          <ListRow icon="link" title="Back up logs" subtitle="Not linked to an account" accessibilityHint="Links an Apple or Google account" onPress={() => router.push('/auth')} />
        )}
      </Card>

      {/* Settings */}
      <T variant="label" color={colors.inkMuted} accessibilityRole="header" style={styles.groupLabel}>Fishing</T>
      <Card style={styles.group}>
        <Row gap={spacing.md} style={styles.settingRow}>
          <View style={styles.rowIcon}><Icon name="units" size={16} color={colors.teal} /></View>
          <T variant="subhead" weight="500" style={{ flex: 1 }}>Units</T>
          <View style={{ width: 164 }}>
            <Segmented label="Units" value={settings.units} onChange={setUnits} options={[{ label: 'Metric', value: 'metric', accessibilityLabel: 'Metric: Celsius, metres, centimetres' }, { label: 'Imperial', value: 'imperial', accessibilityLabel: 'Imperial: Fahrenheit, feet, inches' }]} />
          </View>
        </Row>
        <Divider inset={ROW_INSET} />
        <ToggleRow
          icon="ice"
          title="Ice fishing"
          subtitle={settings.iceFishing ? 'Lakes switch to ice when they typically freeze' : 'Open water only'}
          value={settings.iceFishing}
          onValueChange={setIceFishing}
        />
        {manualCount ? (
          <Row justify="space-between" style={{ paddingLeft: ROW_INSET }}>
            <T variant="caption" color={colors.inkMuted}>{manualCount} lake{manualCount === 1 ? '' : 's'} set by hand</T>
            <LinkButton onPress={resetLakeSeasons}>Reset to typical</LinkButton>
          </Row>
        ) : null}
        {settings.iceFishing || Object.values(lakeSeasons).includes('ice') ? <T variant="caption" color={colors.warning} style={{ paddingLeft: ROW_INSET, paddingBottom: spacing.sm }}>{ICE_SAFETY_TEXT}</T> : null}
        <Divider inset={ROW_INSET} />
        <ListRow icon={settings.alertsEnabled ? 'bell' : 'bell-off'} title="Window alerts" onPress={() => router.push('/profile/alerts')} right={<Value text={settings.alertsEnabled ? `${activeAlerts} of ${followed.length} lakes` : 'Off'} />} />
      </Card>

      <T variant="label" color={colors.inkMuted} accessibilityRole="header" style={styles.groupLabel}>Data & help</T>
      <Card style={styles.group}>
        <ListRow icon="export" title={exporting ? 'Preparing export…' : 'Export catch logs'} onPress={exportLogs} right={<Value text={`${logs.length} log${logs.length === 1 ? '' : 's'}${pending ? ` · ${pending} local` : ''}`} />} />
        <Divider inset={ROW_INSET} />
        <ListRow icon="request" title="Request a lake" onPress={() => router.push('/profile/request-lake')} right={<Value />} />
        <Divider inset={ROW_INSET} />
        <ListRow icon="info" title="About DawnBite" onPress={() => setAboutOpen((open) => !open)} right={<Value text={Constants.expoConfig?.version ?? '—'} icon={aboutOpen ? 'chevron-up' : 'chevron-down'} />} />
        {aboutOpen ? (
          <View style={styles.about}>
            <T variant="caption" color={colors.inkSoft}>Forecast engine {walleyeProfile.version} · {DATA_SOURCE_LABEL}</T>
            <T variant="caption" color={colors.inkMuted}>Bite scores describe conditions, never guaranteed catches. Official regulations always govern.</T>
          </View>
        ) : null}
      </Card>

      {/* Destructive actions: findable, never loud */}
      <View style={styles.danger}>
        {/* One action. With cloud sync it deletes the cloud account too; without it, this phone's data is the whole account. */}
        <DangerLink
          label={deletingAccount ? 'Deleting account…' : 'Delete account'}
          onPress={deletingAccount ? undefined : integrationStatus[0].ready ? confirmDeleteAccount : confirmDelete}
          hint={pending ? `${pending} unsynced log${pending === 1 ? '' : 's'} would be lost` : undefined}
        />
      </View>
    </Screen>
  );
}

const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

/** Right-hand value + disclosure for settings rows. */
function Value({ text, icon = 'chevron-right' }: { text?: string; icon?: IconName }) {
  return (
    <Row gap={6}>
      {text ? <T variant="callout" color={colors.inkMuted}>{text}</T> : null}
      <Icon name={icon} size={14} color={colors.inkFaint} />
    </Row>
  );
}

function DangerLink({ label, onPress, hint }: { label: string; onPress?: () => void; hint?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={hitSlop} accessibilityRole="button" accessibilityHint={hint} style={({ pressed }) => [{ alignItems: 'center', minHeight: touch.min, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
      <T variant="callout" weight="600" color={colors.danger}>{label}</T>
      {hint ? <T variant="caption" color={colors.inkMuted}>{hint}</T> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupLabel: { marginBottom: -spacing.sm, paddingHorizontal: spacing.xs },
  group: { gap: 0, paddingVertical: spacing.xxs },
  // The 44pt control needs air above and below, or it sits on the divider.
  settingRow: { paddingVertical: spacing.sm },
  rowIcon: { width: ROW_INSET - spacing.md, height: ROW_INSET - spacing.md, borderRadius: radius.sm, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  about: { gap: 4, paddingLeft: ROW_INSET, paddingBottom: spacing.md },
  danger: { gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.lg },
});
