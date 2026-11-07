import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@/constants/theme';
import { subscribeConnectivity } from '@/api/adapters';
import { useAppStore } from '@/store/use-app-store';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, networkMode: 'offlineFirst' } } }));
  const hydrate = useAppStore((state) => state.hydrate);
  const setConnectivity = useAppStore((state) => state.setConnectivity);
  const syncPending = useAppStore((state) => state.syncPending);
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => subscribeConnectivity((connectivity) => {
    setConnectivity(connectivity);
    if (connectivity === 'online') syncPending().catch(() => undefined);
  }), [setConnectivity, syncPending]);
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700', fontSize: 17, color: colors.ink },
          contentStyle: { backgroundColor: colors.cream },
          headerBackButtonDisplayMode: 'minimal',
          // Consistent push transition on both platforms; modals keep their native sheet motion.
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="lake/[id]" options={{ title: '' }} />
        <Stack.Screen name="lake/[id]/window/[start]" options={{ title: 'Window detail' }} />
        <Stack.Screen name="lake/[id]/regulations" options={{ title: 'Regulations' }} />
        <Stack.Screen name="log/new" options={{ title: 'Log a trip', presentation: 'modal' }} />
        <Stack.Screen name="log/[id]" options={{ title: 'Edit log', presentation: 'modal' }} />
        <Stack.Screen name="profile/alerts" options={{ title: 'Window alerts' }} />
        <Stack.Screen name="profile/request-lake" options={{ title: 'Request a lake' }} />
        <Stack.Screen name="auth" options={{ title: 'Link account', presentation: 'modal' }} />
      </Stack>
    </QueryClientProvider>
  );
}
