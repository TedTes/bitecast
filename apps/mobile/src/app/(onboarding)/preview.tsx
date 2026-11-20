import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ChartTexture } from '@/components/brand';
import { ConfidenceMeter, ReasonChips, ScoreReadout, ScoreScale, bestWindowWithin, conditionLabel, formatWindow, windowPeak } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { StepHeader } from '@/components/onboarding';
import { Button, Card, Divider, IceSafetyNotice, PageHeader, Reveal, Row, Screen, SectionHeader, T } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { getForecast } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { capitalize, formatDay, formatHour } from '@/lib/format';
import { resolveLakeCondition } from '@/features/lake-season';
import { useAppStore } from '@/store/use-app-store';

export default function PreviewScreen() {
  const ids = useAppStore((state) => state.followedLakeIds);
  const iceFishing = useAppStore((state) => state.settings.iceFishing);
  const lakeSeasons = useAppStore((state) => state.lakeSeasons);
  const seasonOf = (id: string) => resolveLakeCondition(id, { iceFishing }, lakeSeasons).season;
  const complete = useAppStore((state) => state.completeOnboarding);
  const lake = lakeById(ids[0]);
  const season = seasonOf(lake.id);
  const forecast = getForecast(lake.id, season);
  const window = bestWindowWithin(forecast.windows, 24);
  const current = forecast.hours[0];
  const others = ids.slice(1).map((id) => ({ lake: lakeById(id), forecast: getForecast(id, seasonOf(id)) }));

  return (
    <Screen
      footer={
        <>
          <Button icon="pro" onPress={() => router.push('/paywall')}>Unlock the full forecast</Button>
          <Button
            variant="ghost"
            size="md"
            onPress={() => {
              complete(false);
              router.replace('/(tabs)/today');
            }}
          >
            Continue with free logging
          </Button>
        </>
      }
    >
      <StepHeader step={3} />
      <PageHeader title={`Your first look at ${lake.name}`} lede="Here’s the best stretch in the next 24 hours, and exactly what’s behind it." />

      <Reveal index={0}>
        <View style={styles.hero}>
          <ChartTexture />
          {window ? (
            <>
              <Row justify="space-between" align="flex-start" gap={spacing.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="label" color={colors.sunrise}>{formatDay(window.start)} · best window</T>
                  <T variant="title" color={colors.onDark}>{formatWindow(window)}</T>
                  <T variant="caption" color={colors.onDarkMuted}>Peaks near {formatHour(windowPeak(window).ts)}</T>
                </View>
                <ScoreReadout score={window.peakScore} size="lg" tone="dark" caption="Peak" />
              </Row>
              <View style={{ gap: spacing.sm }}>
                <T variant="label" color={colors.onDarkMuted}>Why</T>
                <ReasonChips reasons={window.reasons} limit={4} tone="dark" />
              </View>
              <ConfidenceMeter value={window.confidence} tone="dark" explain />
              <View style={styles.darkDivider} />
              <Row gap={spacing.md} align="flex-start">
                <Icon name="tactics" size={18} color={colors.mint} style={{ marginTop: 2 }} />
                <T variant="callout" color={colors.onDark} style={{ flex: 1 }}>
                  <T variant="callout" weight="700" color={colors.onDark}>{capitalize(window.depth)} water · </T>
                  {window.tactics}
                </T>
              </Row>
            </>
          ) : (
            <>
              <Row justify="space-between" align="flex-start" gap={spacing.md}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T variant="label" color={colors.onDarkMuted}>Next 24 hours</T>
                  <T variant="title" color={colors.onDark}>No window above 60</T>
                  <T variant="callout" color={colors.onDarkMuted}>Right now: {conditionLabel(current.score).toLowerCase()}. Check the hourly chart for smaller openings.</T>
                </View>
                <ScoreReadout score={current.score} size="lg" tone="dark" caption="Now" />
              </Row>
              <ReasonChips reasons={current.reasons} tone="dark" />
              <ConfidenceMeter value={current.confidence} tone="dark" explain />
            </>
          )}
        </View>
      </Reveal>

      {[lake.id, ...others.map((o) => o.lake.id)].some((id) => seasonOf(id) === 'ice') ? <IceSafetyNotice /> : null}

      {others.length ? (
        <Reveal index={1} style={{ gap: spacing.md }}>
          <SectionHeader title="Your other lakes" caption="Best window in the next 24 hours" />
          <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
            {others.map(({ lake: other, forecast: f }, index) => {
              const w = bestWindowWithin(f.windows, 24);
              const score = w?.peakScore ?? f.hours[0].score;
              return (
                <View key={other.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row gap={spacing.md} style={{ minHeight: 64, paddingVertical: spacing.sm }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="subhead">{other.name}</T>
                      <T variant="caption" color={colors.inkMuted}>{w ? `${formatDay(w.start)} · ${formatWindow(w)}` : 'No window above 60'}</T>
                      <T variant="caption" color={colors.inkSoft} numberOfLines={1}>{(w?.reasons ?? f.hours[0].reasons)[0] ?? 'Mixed conditions'} · {(w?.confidence ?? f.hours[0].confidence)} confidence</T>
                    </View>
                    <ScoreReadout score={score} size="sm" />
                  </Row>
                </View>
              );
            })}
          </Card>
        </Reveal>
      ) : null}

      <Reveal index={2}>
        <Card variant="sunken">
          <Row gap={spacing.sm}>
            <Icon name="info" size={18} color={colors.teal} />
            <T variant="subhead">How to read a bite score</T>
          </Row>
          <ScoreScale />
          <T variant="callout" color={colors.inkSoft}>
            Scores describe how favourable conditions are for walleye feeding — mostly underwater light. They never promise fish.
          </T>
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.deep, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg, overflow: 'hidden' },
  darkDivider: { height: 1, backgroundColor: colors.deepLine },
});
