import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, Divider, Row, Screen, T } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { lakeById } from '@/data/lakes';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';

export default function RegulationsScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const lake = lakeById(id);
  const regulation = lake.regulation;
  const offline = useAppStore((state) => state.connectivity === 'offline');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const now = useNow();
  const host = regulation.sourceUrl.replace(/^https?:\/\//, '').split('/')[0];
  const verified = new Date(`${regulation.lastVerified}T12:00:00`);
  const ageDays = Math.round((now - verified.getTime()) / 86_400_000);

  const open = async () => {
    setOpening(true);
    setOpenError(false);
    try {
      await WebBrowser.openBrowserAsync(regulation.sourceUrl);
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Screen
      header
      footer={
        <>
          <Button icon="external" loading={opening} onPress={open}>Open official regulations</Button>
          <T variant="caption" color={colors.inkMuted} align="center">Opens {host}</T>
        </>
      }
    >
      <View style={{ gap: spacing.xs }}>
        <T variant="label" color={colors.teal}>{lake.name} · {lake.provinceState}</T>
        <T variant="display" accessibilityRole="header">Walleye regulations</T>
      </View>

      <View
        style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.warningTint, borderWidth: 1, borderColor: colors.warningLine, borderLeftWidth: 4, borderLeftColor: colors.sunrise }}
        accessibilityRole="alert"
      >
        <Icon name="shield" size={20} color={colors.warning} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subhead" color={colors.warning}>The official source always governs</T>
          <T variant="callout" color={colors.ink}>This is a planning summary only. Rules change during the year, and zone exceptions apply. Check the official regulations before every trip.</T>
        </View>
      </View>

      {offline ? <Banner tone="offline" title="You’re offline" body="This summary is saved on your device. The official source needs a connection." /> : null}
      {openError ? <Banner tone="danger" title="Couldn’t open the official source" body={`Try again, or visit ${host} in your browser.`} action={{ label: 'Try again', onPress: open }} live /> : null}

      <Card style={{ gap: spacing.md }}>
        <T variant="label" color={colors.inkMuted}>Season</T>
        <Row gap={spacing.lg} align="flex-start">
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="caption" color={colors.inkMuted}>Opens</T>
            <T variant="subhead">{regulation.seasonOpen}</T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="caption" color={colors.inkMuted}>Closes</T>
            <T variant="subhead">{regulation.seasonClose}</T>
          </View>
        </Row>
        <Divider />
        <T variant="label" color={colors.inkMuted}>Limits & exceptions</T>
        <T variant="body">{regulation.limits}</T>
      </Card>

      <Card variant="sunken" style={{ gap: spacing.sm }}>
        <Row gap={spacing.sm}>
          <Icon name="document" size={18} color={colors.teal} />
          <T variant="subhead" style={{ flex: 1 }}>Source</T>
        </Row>
        <T variant="callout" color={colors.inkSoft}>Ontario Fishing Regulations Summary ({host})</T>
        <Row gap={spacing.sm}>
          <Icon name={ageDays > 180 ? 'warning' : 'success'} size={16} color={ageDays > 180 ? colors.warning : colors.success} />
          <T variant="caption" color={ageDays > 180 ? colors.warning : colors.inkSoft}>
            Summary last checked {verified.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
            {ageDays > 180 ? ' — may be out of date' : ''}
          </T>
        </Row>
      </Card>

      <T variant="caption" color={colors.inkMuted}>
        Lake summaries are placeholders until each curated lake is reviewed for launch. BiteCast doesn’t interpret regulations for you.
      </T>
    </Screen>
  );
}
