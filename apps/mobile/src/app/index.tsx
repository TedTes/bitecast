import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/use-app-store';

export default function Index() {
  const hydrated = useAppStore((state) => state.hydrated);
  const complete = useAppStore((state) => state.onboardingComplete);
  if (!hydrated) return null;
  return <Redirect href={complete ? '/(tabs)/today' : '/(onboarding)/welcome'} />;
}
