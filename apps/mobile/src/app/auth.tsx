import { useState } from 'react';
import { router } from 'expo-router';
import { Platform, View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { Banner, Button, Card, Row, Screen, T } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { linkIdentity, type AuthProvider, type LinkResult } from '@/api/adapters';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';

const kept: { icon: IconName; text: string }[] = [
  { icon: 'log', text: 'Every catch log, synced or still on this device' },
  { icon: 'lake', text: 'Your followed lakes and alert settings' },
  { icon: 'pro', text: 'Your subscription' },
];
const providerName: Record<AuthProvider, string> = { apple: 'Apple', google: 'Google' };

export default function AuthScreen() {
  const account = useAppStore((state) => state.account);
  const setAccount = useAppStore((state) => state.setAccount);
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [result, setResult] = useState<(LinkResult & { provider: AuthProvider }) | null>(null);

  const link = async (provider: AuthProvider) => {
    setBusy(provider);
    setResult(null);
    const outcome = await linkIdentity(provider).catch((): LinkResult => ({ status: 'error' }));
    setBusy(null);
    setResult({ ...outcome, provider });
    if (outcome.status === 'linked') {
      haptic.success();
      setAccount({ status: 'linked', provider });
      setTimeout(() => router.back(), 900);
    } else if (outcome.status === 'conflict' || outcome.status === 'error') haptic.error();
  };

  if (account.status === 'linked') {
    return (
      <Screen header footer={<Button onPress={() => router.back()}>Done</Button>}>
        <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="success" size={30} color={colors.success} />
          </View>
          <T variant="title" align="center" accessibilityRole="header">Linked with {providerName[account.provider]}</T>
          <T variant="body" color={colors.inkMuted} align="center">Your logs and settings can follow you to a new device.</T>
        </View>
      </Screen>
    );
  }

  // Apple is always offered on iOS whenever Google is (App Store guideline 4.8), and listed first there.
  const providers: AuthProvider[] = Platform.OS === 'ios' ? ['apple', 'google'] : ['google', 'apple'];

  return (
    <Screen
      header
      footer={
        <>
          {providers.map((provider, index) => (
            <Button
              key={provider}
              variant={index === 0 ? 'primary' : 'secondary'}
              icon={provider === 'apple' ? 'apple' : 'person'}
              loading={busy === provider}
              loadingLabel={`Connecting to ${providerName[provider]}…`}
              disabled={busy !== null && busy !== provider}
              onPress={() => link(provider)}
            >
              {`Continue with ${providerName[provider]}`}
            </Button>
          ))}
          <T variant="caption" color={colors.inkMuted} align="center">No password needed. You can link later from Profile.</T>
        </>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <T variant="label" color={colors.teal}>Optional</T>
        <T variant="title" accessibilityRole="header">Keep your logs across devices.</T>
        <T variant="body" color={colors.inkMuted}>You’re using BiteCast anonymously. Linking adds a sign-in to the account you already have — nothing moves or resets.</T>
      </View>

      <Card variant="tint" style={{ gap: spacing.md }}>
        <T variant="subhead">What stays the same</T>
        {kept.map((item) => (
          <Row key={item.text} gap={spacing.md}>
            <Icon name={item.icon} size={18} color={colors.teal} />
            <T variant="callout" style={{ flex: 1 }}>{item.text}</T>
          </Row>
        ))}
      </Card>

      {result?.status === 'not_configured' ? (
        <Banner tone="warning" icon="plug" title={`${providerName[result.provider]} sign-in isn’t set up in this build`} body={`Add the ${providerName[result.provider]} client ID in Supabase Auth and EAS secrets, then connect linkIdentity in the auth adapter. Your anonymous account and logs are unchanged.`} live />
      ) : null}
      {result?.status === 'conflict' ? (
        <Banner
          tone="danger"
          title={`This ${providerName[result.provider]} account is already in use`}
          body="It’s linked to a different BiteCast account, so we didn’t link it here. Nothing was merged or lost — your logs are still on this device. Try a different account, or sign in on the device that uses it."
          live
        />
      ) : null}
      {result?.status === 'cancelled' ? <Banner tone="neutral" title="Linking cancelled" body="Nothing changed. You can link any time from Profile." live /> : null}
      {result?.status === 'error' ? <Banner tone="danger" title="Couldn’t link right now" body={result.message ?? 'Check your connection and try again.'} action={{ label: 'Try again', onPress: () => link(result.provider) }} live /> : null}
      {result?.status === 'linked' ? <Banner tone="success" title={`Linked with ${providerName[result.provider]}`} live /> : null}
    </Screen>
  );
}
