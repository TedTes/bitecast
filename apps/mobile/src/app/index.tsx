import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/use-app-store';

export default function Index() {
  const complete = useAppStore((state) => state.onboardingComplete);
  return <Redirect href={complete ? '/(tabs)/today' : '/(onboarding)/welcome'} />;
}
