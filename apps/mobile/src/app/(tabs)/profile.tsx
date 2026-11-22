import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Constants from 'expo-constants';
import { walleyeProfile } from '@bitecast/engine';
import { Icon, type IconName } from '@/components/icon';
import { ShorelineHeader } from '@/components/shoreline-header';
import { Banner, Card, Divider, ICE_SAFETY_TEXT, LinkButton, ListRow, Row, Screen, Segmented, T, ToggleRow } from '@/components/ui';
import { colors, hitSlop, radius, spacing, touch } from '@/constants/theme';
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

  const fish = logs.reduce((total, log) => total + (log.caught ? log.count : 0), 0);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <Screen tab top={<ShorelineHeader title="Profile" subtitle="Account & settings" />}>
      {/* Angler card: who you are, what you've logged, membership */}
      <View style={styles.anglerCard} accessible={false}>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="angler" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.deep} />
              <Stop offset="1" stopColor="#123E48" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#angler)" />
        </Svg>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${linked ? `Linked with ${account.provider === 'apple' ? 'Apple' : 'Google'}` : 'Anonymous angler'}. ${isPro ? 'Pro member' : 'Free plan'}.`}>
            <T variant="label" color={colors.mint} style={{ fontSize: 12 }}>BiteCast angler</T>
            <T variant="title" color={colors.onDark}>{linked ? (account.provider === 'apple' ? 'Apple account' : 'Google account') : 'Anonymous angler'}</T>
            <Row gap={6}>
              <Icon name={linked ? 'sync-done' : 'device'} size={13} color={colors.onDarkMuted} />
              <T variant="caption" color={colors.onDarkMuted}>{linked ? 'Logs backed up to your account' : 'Logs saved on this device only'}</T>
            </Row>
          </View>
          <View style={[styles.badge, isPro && styles.badgePro]}>
            {isPro ? <Icon name="pro" size={12} color={colors.deep} /> : null}
            <T variant="label" color={isPro ? colors.deep : colors.onDark} style={{ fontSize: 11.5 }}>{isPro ? 'Pro' : 'Free'}</T>
          </View>
        </Row>

        <Row style={styles.anglerStats}>
          <AnglerStat value={followed.length} label={followed.length === 1 ? 'Lake' : 'Lakes'} />
          <View style={styles.anglerDivider} />
          <AnglerStat value={logs.length} label={logs.length === 1 ? 'Trip' : 'Trips'} />
          <View style={styles.anglerDivider} />
          <AnglerStat value={fish} label="Walleye" />
        </Row>

        <Row gap={spacing.sm} wrap>
          {!linked ? <CardAction icon="link" label="Back up logs" onPress={() => router.push('/auth')} /> : null}
          {!isPro ? <CardAction icon="pro" label="Go Pro" primary onPress={() => router.push('/paywall')} /> : <CardAction icon="restore" label={restoring ? 'Restoring…' : 'Restore'} onPress={restore} />}
        </Row>
      </View>

      {notice ? <Banner tone={notice.tone} title={notice.title} body={notice.body} live /> : null}

      {/* Settings */}
      <T variant="label" color={colors.inkMuted} accessibilityRole="header" style={styles.groupLabel}>Fishing</T>
      <Card style={styles.group}>
        <Row gap={spacing.md} style={styles.settingRow}>
          <View style={styles.rowIcon}><Icon name="units" size={16} color={colors.teal} /></View>
          <T variant="subhead" weight="600" style={{ flex: 1 }}>Units</T>
          <View style={{ width: 176 }}>
            <Segmented label="Units" value={settings.units} onChange={setUnits} options={[{ label: 'Metric', value: 'metric', accessibilityLabel: 'Metric: Celsius, metres, centimetres' }, { label: 'Imperial', value: 'imperial', accessibilityLabel: 'Imperial: Fahrenheit, feet, inches' }]} />
          </View>
        </Row>
        <Divider inset={48} />
        <ToggleRow
          icon="ice"
          title="Ice fishing"
          subtitle={settings.iceFishing ? 'Lakes switch to ice when they typically freeze' : 'Open water only'}
          value={settings.iceFishing}
          onValueChange={setIceFishing}
        />
        {manualCount ? (
          <Row justify="space-between" style={{ paddingLeft: 48 }}>
            <T variant="caption" color={colors.inkMuted}>{manualCount} lake{manualCount === 1 ? '' : 's'} set by hand</T>
            <LinkButton onPress={resetLakeSeasons}>Reset to typical</LinkButton>
          </Row>
        ) : null}
        {settings.iceFishing || Object.values(lakeSeasons).includes('ice') ? <T variant="caption" color={colors.warning} style={{ paddingLeft: 48, paddingBottom: spacing.sm }}>{ICE_SAFETY_TEXT}</T> : null}
        <Divider inset={48} />
        <ListRow icon={settings.alertsEnabled ? 'bell' : 'bell-off'} title="Window alerts" onPress={() => router.push('/profile/alerts')} right={<Value text={settings.alertsEnabled ? `${activeAlerts} of ${followed.length} lakes` : 'Off'} />} />
      </Card>

      <T variant="label" color={colors.inkMuted} accessibilityRole="header" style={styles.groupLabel}>Data & help</T>
      <Card style={styles.group}>
        <ListRow icon="export" title={exporting ? 'Preparing export…' : 'Export catch logs'} onPress={exportLogs} right={<Value text={`${logs.length} log${logs.length === 1 ? '' : 's'}${pending ? ` · ${pending} local` : ''}`} />} />
        {isPro ? null : (
          <>
            <Divider inset={48} />
            <ListRow icon="restore" title={restoring ? 'Restoring…' : 'Restore purchases'} onPress={restore} right={<Value />} />
          </>
        )}
        <Divider inset={48} />
        <ListRow icon="request" title="Request a lake" onPress={() => router.push('/profile/request-lake')} right={<Value />} />
        <Divider inset={48} />
        <ListRow icon="info" title="About BiteCast" onPress={() => setAboutOpen((open) => !open)} right={<Value text={Constants.expoConfig?.version ?? '—'} icon={aboutOpen ? 'chevron-up' : 'chevron-down'} />} />
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

function AnglerStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${value} ${label}`}>
      <T variant="numeralM" color={colors.onDark}>{value}</T>
      <T variant="caption" color={colors.onDarkMuted} style={{ fontSize: 11 }}>{label}</T>
    </View>
  );
}

function CardAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.cardAction, primary && styles.cardActionPrimary, pressed && { opacity: 0.75 }]}>
      <Icon name={icon} size={14} color={primary ? colors.deep : colors.onDark} />
      <T variant="caption" weight="600" color={primary ? colors.deep : colors.onDark}>{label}</T>
    </Pressable>
  );
}

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
  anglerCard: { gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, overflow: 'hidden' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.deepLine, backgroundColor: 'rgba(255,255,255,0.08)' },
  badgePro: { backgroundColor: colors.mint, borderColor: colors.mint },
  anglerStats: { paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.07)' },
  anglerDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.deepLine },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touch.min, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  cardActionPrimary: { backgroundColor: colors.onDark, borderColor: colors.onDark },
  groupLabel: { marginTop: spacing.sm, marginBottom: -spacing.sm, paddingHorizontal: spacing.xs },
  group: { gap: 0, paddingVertical: spacing.xs },
  settingRow: { minHeight: 56, paddingVertical: spacing.sm },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  about: { gap: 4, paddingLeft: 48, paddingBottom: spacing.md },
  danger: { gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.lg },
});
