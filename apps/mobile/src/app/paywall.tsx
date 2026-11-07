import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';
import { BrandMark } from '@/components/brand';
import { Icon, type IconName } from '@/components/icon';
import { Banner, Button, Card, IconButton, LinkButton, Row, Screen, Skeleton, T } from '@/components/ui';
import { colors, elevation, radius, spacing } from '@/constants/theme';
import { externalConfig } from '@/api/config';
import { getOfferings, purchasePlan, purchasesConfigured, restorePurchases, type Offering, type PlanId } from '@/api/adapters';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';

const proFeatures: { icon: IconName; text: string }[] = [
  { icon: 'clock', text: 'Every hourly score and top window, with reasons' },
  { icon: 'bell', text: 'Alerts before a strong window opens' },
  { icon: 'calendar', text: 'Seven-day outlook for each followed lake' },
  { icon: 'chart', text: 'Personal patterns from your own logs' },
];

type Status =
  | { kind: 'idle' }
  | { kind: 'purchasing' }
  | { kind: 'restoring' }
  | { kind: 'success'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'nothing-to-restore' };

export default function PaywallScreen() {
  const [plan, setPlan] = useState<PlanId>('annual');
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const onboarded = useAppStore((state) => state.onboardingComplete);
  const complete = useAppStore((state) => state.completeOnboarding);
  const setPro = useAppStore((state) => state.setPro);

  useEffect(() => {
    getOfferings().then(setOfferings).catch(() => setLoadError(true));
  }, []);
  const load = () => {
    setLoadError(false);
    getOfferings().then(setOfferings).catch(() => setLoadError(true));
  };

  const exit = (pro: boolean) => {
    if (onboarded) {
      if (pro) setPro(true);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/today');
      return;
    }
    complete(pro);
    router.replace('/(tabs)/today');
  };

  const purchase = async () => {
    setStatus({ kind: 'purchasing' });
    const result = await purchasePlan(plan).catch(() => ({ status: 'error' as const, message: undefined }));
    if (result.status === 'success') {
      haptic.success();
      setStatus({ kind: 'success', message: 'Pro is active. Enjoy the full forecast.' });
      setTimeout(() => exit(true), 900);
    } else if (result.status === 'cancelled') setStatus({ kind: 'cancelled' });
    else if (result.status === 'pending') setStatus({ kind: 'pending' });
    else {
      haptic.error();
      setStatus({ kind: 'error', message: result.message ?? 'The store didn’t complete the purchase. You haven’t been charged.' });
    }
  };

  const restore = async () => {
    setStatus({ kind: 'restoring' });
    try {
      const active = await restorePurchases();
      if (active) {
        haptic.success();
        setStatus({ kind: 'success', message: 'Purchase restored. Pro is active.' });
        setTimeout(() => exit(true), 900);
      } else setStatus({ kind: 'nothing-to-restore' });
    } catch {
      setStatus({ kind: 'error', message: 'We couldn’t reach the store to restore. Check your connection and try again.' });
    }
  };

  const busy = status.kind === 'purchasing' || status.kind === 'restoring' || status.kind === 'success';
  const selected = offerings?.find((item) => item.id === plan);
  const placeholder = offerings?.some((item) => item.isPlaceholder) ?? true;

  return (
    <Screen
      footer={
        <>
          <Button
            loading={status.kind === 'purchasing'}
            loadingLabel="Contacting store…"
            disabled={!offerings || busy}
            onPress={purchase}
          >
            {selected?.trialDays ? `Start ${selected.trialDays}-day free trial` : 'Continue'}
          </Button>
          <T variant="caption" color={colors.inkMuted} align="center">
            {selected ? `Free for ${selected.trialDays} days, then ${selected.price} unless cancelled at least 24 hours before the trial ends.` : 'Loading plan details…'}
          </T>
        </>
      }
    >
      <Row justify="space-between">
        <BrandMark size={36} />
        <IconButton icon="close" label={onboarded ? 'Close' : 'Close and keep free logging'} onPress={() => exit(false)} />
      </Row>

      <View style={{ gap: spacing.sm }}>
        <T variant="label" color={colors.teal}>BiteCast Pro</T>
        <T variant="display" accessibilityRole="header">Fish the best part of the day.</T>
      </View>

      <View style={{ gap: spacing.md }}>
        {proFeatures.map((item) => (
          <Row key={item.text} gap={spacing.md}>
            <View style={styles.featureIcon}>
              <Icon name={item.icon} size={16} color={colors.teal} />
            </View>
            <T variant="callout" weight="600" style={{ flex: 1 }}>{item.text}</T>
          </Row>
        ))}
      </View>

      {placeholder ? (
        <Banner
          tone="warning"
          icon="plug"
          title="Development pricing placeholder"
          body={purchasesConfigured ? 'Store products are not loaded yet.' : 'RevenueCat isn’t connected, so real prices aren’t shown and purchases are simulated.'}
        />
      ) : null}

      <View style={{ gap: spacing.md }} accessibilityRole="radiogroup" accessibilityLabel="Subscription plan">
        {loadError ? (
          <Banner tone="danger" title="Plans didn’t load" body="Check your connection. Free catch logging still works." action={{ label: 'Try again', onPress: load }} />
        ) : !offerings ? (
          <>
            <Skeleton height={84} radius={radius.lg} />
            <Skeleton height={72} radius={radius.lg} />
          </>
        ) : (
          offerings.map((offering) => {
            const active = plan === offering.id;
            return (
              <Pressable
                key={offering.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: busy }}
                accessibilityLabel={`${offering.title}, ${offering.isPlaceholder ? 'price not yet available' : offering.price}${offering.id === 'annual' ? ', best value' : ''}`}
                disabled={busy}
                onPress={() => {
                  if (!active) haptic.select();
                  setPlan(offering.id);
                }}
                style={[styles.plan, active && styles.planActive]}
              >
                <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={spacing.sm} wrap>
                    <T variant="headline">{offering.title}</T>
                    {offering.id === 'annual' ? (
                      <View style={styles.badge}><T variant="label" color={colors.sunriseInk} style={{ fontSize: 10 }}>Best value</T></View>
                    ) : null}
                  </Row>
                  <T variant="callout" color={colors.inkSoft}>{offering.price}</T>
                  {offering.perMonth ? <T variant="caption" color={colors.inkMuted}>{offering.perMonth}</T> : null}
                </View>
                {offering.isPlaceholder ? <View style={styles.devTag}><T variant="label" color={colors.warning} style={{ fontSize: 9 }}>Dev</T></View> : null}
              </Pressable>
            );
          })
        )}
      </View>

      {status.kind === 'success' ? <Banner tone="success" title="You’re all set" body={status.message} live /> : null}
      {status.kind === 'pending' ? <Banner tone="info" icon="clock" title="Purchase pending" body="The store is waiting for approval (for example, Ask to Buy). Pro unlocks automatically once it’s approved." live /> : null}
      {status.kind === 'cancelled' ? <Banner tone="neutral" title="Purchase cancelled" body="No charge was made. You can keep using free logging." live /> : null}
      {status.kind === 'error' ? <Banner tone="danger" title="Purchase didn’t go through" body={status.message} action={{ label: 'Try again', onPress: purchase }} live /> : null}
      {status.kind === 'nothing-to-restore' ? <Banner tone="neutral" title="No purchases found" body="We couldn’t find an active subscription for this store account." live /> : null}

      <Card variant="tint" style={{ gap: spacing.sm }}>
        <Row gap={spacing.sm}>
          <Icon name="log" size={18} color={colors.teal} />
          <T variant="subhead">Catch logging is always free</T>
        </Row>
        <T variant="callout" color={colors.inkSoft}>Log trips offline, review your history and export your data without a subscription.</T>
        <Button variant="secondary" size="md" disabled={busy} onPress={() => exit(false)}>Keep free catch logging</Button>
      </Card>

      <View style={{ gap: spacing.xs, alignItems: 'center' }}>
        <LinkButton icon="restore" onPress={restore}>{status.kind === 'restoring' ? 'Restoring…' : 'Restore purchases'}</LinkButton>
        <T variant="caption" color={colors.inkMuted} align="center">
          Payment is charged to your app store account at confirmation. Subscriptions renew automatically at the same price unless cancelled at least 24 hours before the period ends. Manage or cancel in your store account settings.
        </T>
        <Row gap={spacing.lg}>
          <LegalLink label="Terms of Use" url={externalConfig.termsUrl} />
          <LegalLink label="Privacy Policy" url={externalConfig.privacyUrl} />
        </Row>
      </View>
    </Screen>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  if (!url) return <T variant="caption" color={colors.inkFaint} accessibilityLabel={`${label}, link not configured`}>{label} (not set)</T>;
  return <LinkButton onPress={() => WebBrowser.openBrowserAsync(url)}>{label}</LinkButton>;
}

const styles = StyleSheet.create({
  featureIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  plan: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper },
  planActive: { borderColor: colors.teal, backgroundColor: colors.white, ...elevation.raised },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.teal },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.teal },
  badge: { backgroundColor: colors.sunriseTint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  devTag: { borderWidth: 1, borderColor: colors.warningLine, backgroundColor: colors.warningTint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs },
});
