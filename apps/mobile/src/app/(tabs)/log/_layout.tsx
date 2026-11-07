import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function LogTabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.cream },
        headerTintColor: colors.ink,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="stats" options={{ title: 'Your patterns' }} />
    </Stack>
  );
}
