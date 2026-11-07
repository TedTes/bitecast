import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { BrandLockup, ChartTexture } from '@/components/brand';
import { ConfidenceMeter, ReasonChips, ScoreReadout, bestWindowWithin, formatWindow } from '@/components/forecast';
import { Icon, type IconName } from '@/components/icon';
import { Button, Reveal, Row, Screen, T } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { SwimmingWalleye } from '@/components/walleye';
import { getForecast } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { formatDay } from '@/lib/format';

const promises: { icon: IconName; title: string; body: string }[] = [
  { icon: 'clock', title: 'Hourly bite scores', body: 'Built around underwater light, weather and your lake’s clarity.' },
  { icon: 'info', title: 'Reasons on every score', body: 'See what’s driving the number and how confident we are.' },
  { icon: 'log', title: 'Free offline catch log', body: 'Logs save to your phone first, with or without signal.' },
];

export default function WelcomeScreen() {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );
  // A real engine result for a sample lake — believable, never a stock mockup.
  const lake = lakeById('lake-erie');
  const forecast = getForecast(lake.id, 'open_water');
  const window = bestWindowWithin(forecast.windows, 24) ?? forecast.windows[0];

  return (
    <Screen
      background={colors.deep}
      footer={
        <>
          <Button variant="onDark" iconRight="chevron-right" onPress={() => router.push('/(onboarding)/season')}>Set up my lakes</Button>
          <T variant="caption" color={colors.onDarkMuted} align="center">Walleye forecasts for Ontario and the Great Lakes</T>
        </>
      }
    >
      <ChartTexture />
      <BrandLockup tone="light" size={38} animateSun />
      <Reveal index={0} style={{ alignItems: 'flex-end', marginTop: spacing.sm, marginBottom: -spacing.lg }}>
        <SwimmingWalleye width={260} tone="dark" />
      </Reveal>
      <Reveal index={0} style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <T variant="label" color={colors.mint}>Plan the window, not the whole day</T>
        <T variant="display" color={colors.onDark} accessibilityRole="header" style={{ fontSize: 36, lineHeight: 42 }}>
          Know when the lake turns on.
        </T>
      </Reveal>

      {window ? (
        <Reveal index={1}>
          <View style={styles.preview} accessibilityLabel="Sample forecast">
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="label" color={colors.onDarkMuted}>Sample · {lake.name}</T>
                <T variant="caption" weight="700" color={colors.sunrise}>{formatDay(window.start)}’s best window</T>
                <T variant="title" color={colors.onDark} style={{ marginTop: spacing.xs }}>{formatWindow(window)}</T>
              </View>
              <ScoreReadout score={window.peakScore} tone="dark" caption="Peak" />
            </Row>
            <ReasonChips reasons={window.reasons} tone="dark" />
            <ConfidenceMeter value={window.confidence} tone="dark" />
          </View>
        </Reveal>
      ) : null}

      <Reveal index={2} style={{ gap: spacing.md }}>
        {promises.map((item) => (
          <Row key={item.title} gap={spacing.md} align="flex-start">
            <View style={styles.promiseIcon}>
              <Icon name={item.icon} size={18} color={colors.mint} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="subhead" color={colors.onDark}>{item.title}</T>
              <T variant="callout" color={colors.onDarkMuted}>{item.body}</T>
            </View>
          </Row>
        ))}
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: colors.deepRaised, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.deepLine },
  promiseIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.deepRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.deepLine },
});
