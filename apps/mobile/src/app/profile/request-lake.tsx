import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, Chip, Divider, Field, LinkButton, OfflineBanner, Reveal, Row, Screen, SectionHeader, T } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { lakes } from '@/data/lakes';
import { formatDay } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';
import type { LakeRequest } from '@/types/app';

const NOTES_MAX = 300;

export default function RequestLakeScreen() {
  const requests = useAppStore((state) => state.lakeRequests);
  const addLakeRequest = useAppStore((state) => state.addLakeRequest);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [notes, setNotes] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [submitted, setSubmitted] = useState<LakeRequest | null>(null);

  const covered = lakes.find((lake) => name.trim().length > 2 && lake.name.toLowerCase().includes(name.trim().toLowerCase()));
  const errors = {
    name: !name.trim() ? 'Enter the lake’s name.' : name.trim().length < 2 ? 'That name looks too short.' : null,
    region: !region.trim() ? 'Add a nearby town or area so we find the right lake.' : null,
    notes: notes.length > NOTES_MAX ? `Keep notes under ${NOTES_MAX} characters.` : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const send = async () => {
    setAttempted(true);
    if (invalid) { haptic.error(); return; }
    setSending(true);
    setSaveError(false);
    try {
      const request = await addLakeRequest({ id: `${Date.now()}`, name: name.trim(), region: region.trim(), notes: notes.trim(), createdAt: new Date().toISOString() });
      haptic.success();
      setSubmitted(request);
    } catch {
      haptic.error();
      setSaveError(true);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setSubmitted(null); setName(''); setRegion(''); setNotes(''); setAttempted(false);
  };

  if (submitted) {
    const queued = submitted.status === 'queued';
    return (
      <Screen
        header
        footer={
          <>
            <Button onPress={() => router.back()}>Done</Button>
            <Button variant="ghost" size="md" onPress={reset}>Request another lake</Button>
          </>
        }
      >
        <Reveal style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={queued ? 'device' : 'success'} size={28} color={colors.success} />
          </View>
          <T variant="title" align="center" accessibilityRole="header">{queued ? 'Request saved' : 'Request sent'}</T>
          <T variant="body" color={colors.inkMuted} align="center" accessibilityLiveRegion="polite">
            {queued
              ? `${submitted.name} is queued on this device and will send automatically when BiteCast can reach the server.`
              : `Thanks — ${submitted.name} is on our research list.`}
          </T>
          <T variant="caption" color={colors.inkMuted} align="center">We add lakes after checking clarity, forecast coverage and an official regulations source. That can take a while.</T>
        </Reveal>
      </Screen>
    );
  }

  return (
    <Screen header footer={<Button icon="request" loading={sending} loadingLabel="Saving…" onPress={send}>Send request</Button>}>
      <View style={{ gap: spacing.sm }}>
        <T variant="display" accessibilityRole="header">Where should BiteCast go next?</T>
        <T variant="body" color={colors.inkMuted}>Tell us about a walleye lake you fish. Requests help us decide which lakes to research next.</T>
      </View>
      <OfflineBanner what="Requests are queued on this device." />
      {saveError ? <Banner tone="danger" title="Couldn’t save your request" body="Nothing was sent. Try again." action={{ label: 'Try again', onPress: send }} live /> : null}

      <Field label="Lake name" value={name} onChangeText={setName} placeholder="e.g. Lac Seul" autoCapitalize="words" returnKeyType="next" maxLength={80} error={attempted ? errors.name : null} />
      {covered ? (
        <Card variant="tint" style={{ gap: spacing.xs, padding: spacing.md }}>
          <T variant="callout" weight="700">{covered.name} is already covered</T>
          <LinkButton icon="chevron-right" onPress={() => router.push({ pathname: '/lake/[id]', params: { id: covered.id } })}>Open its forecast</LinkButton>
        </Card>
      ) : null}
      <Field label="Nearest town or area" value={region} onChangeText={setRegion} placeholder="e.g. Ear Falls, Northwestern Ontario" autoCapitalize="words" returnKeyType="next" maxLength={80} error={attempted ? errors.region : null} />
      <Field label="Why this lake?" optional value={notes} onChangeText={setNotes} multiline placeholder="Season you fish it, access, anything useful" helper={`${notes.length}/${NOTES_MAX}`} error={errors.notes} />

      {requests.length ? (
        <>
          <SectionHeader title="Your requests" />
          <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
            {requests.map((request, index) => (
              <View key={request.id}>
                {index > 0 ? <Divider /> : null}
                <Row gap={spacing.md} style={{ minHeight: 56, paddingVertical: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <T variant="subhead">{request.name}</T>
                    <T variant="caption" color={colors.inkMuted}>{request.region} · {formatDay(request.createdAt)}</T>
                  </View>
                  <Chip label={request.status === 'queued' ? 'Queued' : 'Sent'} icon={request.status === 'queued' ? 'device' : 'success'} tone={request.status === 'queued' ? 'neutral' : 'good'} />
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
